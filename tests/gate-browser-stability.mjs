/* Manual browser smoke check.
 * Start Chrome with --remote-debugging-port=9223 on a gate page, then run:
 *   node tests/gate-browser-stability.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';

const port = process.env.FIDS_DEBUG_PORT || '9223';
const forcedStatus = String(process.env.FIDS_FORCE_STATUS || '').trim().toLowerCase();
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === 'page' && /\/gids(?:\.html)?(?:[?#]|$)/.test(target.url));
assert.ok(page, 'No GIDS page is attached to the Chrome debugging port');

async function openLocalWebSocket(address) {
  const url = new URL(address);
  assert.equal(url.protocol, 'ws:', 'The smoke check only connects to local ws:// DevTools');
  const key = crypto.randomBytes(16).toString('base64');
  const client = net.createConnection(Number(url.port), url.hostname);
  let buffer = Buffer.alloc(0);
  let upgraded = false;
  let messageHandler = () => {};
  let fragmented = Buffer.alloc(0);

  function frame(payload, opcode = 1) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
    const mask = crypto.randomBytes(4);
    let header;
    if (body.length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | body.length]);
    } else if (body.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(body.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(body.length), 2);
    }
    const masked = Buffer.alloc(body.length);
    for (let i = 0; i < body.length; i++) masked[i] = body[i] ^ mask[i % 4];
    return Buffer.concat([header, mask, masked]);
  }

  function parseFrames() {
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const fin = !!(first & 0x80);
      const opcode = first & 0x0f;
      const masked = !!(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      offset += maskLength;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      buffer = buffer.subarray(offset + length);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      if (opcode === 0x9) client.write(frame(payload, 0xA));
      else if (opcode === 0x8) client.end();
      else if (opcode === 0x1 || opcode === 0x0) {
        fragmented = Buffer.concat([fragmented, payload]);
        if (fin) {
          messageHandler(fragmented.toString('utf8'));
          fragmented = Buffer.alloc(0);
        }
      }
    }
  }

  const ready = new Promise((resolve, reject) => {
    client.once('error', reject);
    client.once('connect', () => {
      client.write([
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '', ''
      ].join('\r\n'));
    });
    client.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end === -1) return;
        const header = buffer.subarray(0, end).toString('utf8');
        assert.match(header, /^HTTP\/1\.1 101\b/, 'DevTools refused the WebSocket upgrade');
        buffer = buffer.subarray(end + 4);
        upgraded = true;
        resolve();
      }
      parseFrames();
    });
  });

  await ready;
  return {
    send(value) { client.write(frame(value)); },
    onMessage(handler) { messageHandler = handler; },
    close() { client.write(frame(Buffer.alloc(0), 0x8)); client.end(); }
  };
}

const socket = await openLocalWebSocket(page.webSocketDebuggerUrl);

let commandId = 0;
const pending = new Map();
socket.onMessage((data) => {
  const message = JSON.parse(data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error((result.exceptionDetails.exception && result.exceptionDetails.exception.description)
      || result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result.value;
}

await command('Runtime.enable');
await new Promise((resolve) => setTimeout(resolve, 4000));
await evaluate(`(() => {
  (window.__gateStabilityObservers || []).forEach((observer) => observer.disconnect());
  window.__gateStability = { styleMutations: 0, rebuilds: 0, lastRebuild: Date.now() };
  const view = document.getElementById('gateView');
  if (!view) return false;
  const rebuildObserver = new MutationObserver((records) => {
    const count = records.filter((record) => record.type === 'childList').length;
    if (count) {
      window.__gateStability.rebuilds += count;
      window.__gateStability.lastRebuild = Date.now();
    }
  });
  rebuildObserver.observe(view, { childList: true });
  window.__gateStabilityObservers = [rebuildObserver];
  return true;
})()`);

// Aircraft/type enrichment is allowed one real repaint. Start measuring only
// after the view has been quiet for five seconds so the test catches standing
// oscillation rather than a legitimate data arrival.
const quietDeadline = Date.now() + 30000;
while (Date.now() < quietDeadline) {
  const state = await evaluate('window.__gateStability');
  if (Date.now() - state.lastRebuild >= 5000) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (forcedStatus) {
  await evaluate(`(() => {
    const view = document.getElementById('gateView');
    if (!view) throw new Error('No gate view is available');
    view.insertAdjacentHTML('beforeend', '<div id="gateStabilityBoardingFixture" class="g8-board-body g8-lanes-std" style="position:fixed;left:-10000px;top:0;width:900px;height:520px;">'
      + '<div class="g8-board-col now"><div class="g8-board-grp-label">Priority | Priorité</div><div class="g8-board-grp-wrap"><span class="g8-board-arrow">↙</span><div class="g8-board-grp-num">1 • 2</div></div><div class="g8-board-lane"><span class="g8-lane-p">Use lanes 1 • 2</span><span> | </span><span class="g8-lane-p">Utilisez les voies 1 • 2</span></div></div>'
      + '<div class="g8-board-col next"><div class="g8-board-grp-label">Zones | Zones</div><div class="g8-board-grp-wrap"><div class="g8-board-grp-num">3 • 4 • 5 • 6</div><span class="g8-board-arrow">↘</span></div><div class="g8-board-lane"><span class="g8-lane-p">Use lanes 3 • 4</span><span> | </span><span class="g8-lane-p">Utilisez les voies 3 • 4</span></div></div>'
      + '</div>');
    gateAutofit(view);
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 500));
}
await evaluate(`(() => {
  const view = document.getElementById('gateView');
  window.__gateStability.styleMutations = 0;
  window.__gateStability.styleTargets = {};
  window.__gateStability.rebuilds = 0;
  const styleObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type !== 'attributes') continue;
      const el = record.target;
      if (el.matches && el.matches('.g8-board-grp-num,.g8-board-grp-label,.g8-board-lane,.v2-fi-title,.v2-fi-value')) {
        window.__gateStability.styleMutations++;
        const key = String(el.className || el.tagName);
        window.__gateStability.styleTargets[key] = (window.__gateStability.styleTargets[key] || 0) + 1;
      }
    }
  });
  styleObserver.observe(view, { subtree: true, attributes: true, attributeFilter: ['style'] });
  window.__gateStabilityObservers.push(styleObserver);
})()`);

function sampleExpression() {
  return `(() => ({
    build: typeof FIDS_BUILD_TAG === 'undefined' ? null : FIDS_BUILD_TAG,
    fitHeartbeatCleared: window._gateFitTick == null,
    resizeHandlerActive: typeof window._gateFitResizeHandler === 'function',
    boardingNumberCount: document.querySelectorAll('.g8-board-grp-num').length,
    measurements: Array.from(document.querySelectorAll('.g8-board-grp-num,.g8-board-grp-label,.g8-board-lane,.v2-fi-title,.v2-fi-value')).map((el) => ({
      className: el.className,
      fontSize: getComputedStyle(el).fontSize,
      width: el.clientWidth,
      height: el.clientHeight
    }))
  }))()`;
}

const first = await evaluate(sampleExpression());
await new Promise((resolve) => setTimeout(resolve, 6000));
const second = await evaluate(sampleExpression());
await new Promise((resolve) => setTimeout(resolve, 6000));
const third = await evaluate(sampleExpression());
const counters = await evaluate('window.__gateStability');

console.log(JSON.stringify({ url: page.url, samples: 3, elements: first.measurements.length, counters }, null, 2));

assert.equal(first.build, 'v23150');
assert.equal(first.fitHeartbeatCleared, true);
assert.equal(first.resizeHandlerActive, true);
if (forcedStatus) assert.ok(first.boardingNumberCount > 0, `Forced ${forcedStatus} did not render boarding numbers`);
assert.deepEqual(second.measurements, first.measurements, 'Gate text geometry changed after six seconds');
assert.deepEqual(third.measurements, first.measurements, 'Gate text geometry changed after twelve seconds');
assert.equal(counters.styleMutations, 0, 'A fitted gate text style changed after settling');
assert.equal(counters.rebuilds, 0, 'The gate view rebuilt without a data change');

await evaluate(`(() => {
  (window.__gateStabilityObservers || []).forEach((observer) => observer.disconnect());
  window.__gateStabilityObservers = [];
})()`);
if (forcedStatus) await evaluate(`document.getElementById('gateStabilityBoardingFixture')?.remove()`);
socket.close();
