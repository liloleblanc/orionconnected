'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EVERY CELL ON THE BOARD KEEPS ONE INK THROUGH EVERY REBUILD.
//
// The departures board rebuilds its rows every 12 s (the language slide and
// the °C/°F slide), on every poll and on every page turn. Two per-cell painters
// then ran on timers of their own — applyCodeAccents every 1.2 s, _fidsRowInk
// every 5 s — and a rebuild wiped what they had painted. So every cell those
// painters touched showed the stylesheet's ink for a moment and the painter's
// ink after it, on every slide:
//   - the airport code on EVERY row: plain row ink, then the accent;
//   - Delayed rows: the grammar's navy, then an accent or a lifted pale ink
//     where the painter had measured the wrong ground;
//   - Departed / Arrived / Gate closed rows: an ink that was invisible on the
//     faded slate (the palette's Row Text), then a lifted grey;
//   - the NEW GATE badge: navy on its amber chip, then a lifted ink that
//     vanished into the chip (the badge was judged against the row, not the
//     chip it sits on).
// Measured with CDP on the YOW board at 1680x1050, sampling every 500 ms for
// 60 s: 439 colour changes over 148 cells on main, 0 after v23967.
//
// One ink per cell is not enough if that ink does not read, so the same build
// holds every word on these rows at 4.5:1 or better: the history rows fade to
// 0.7 (at 0.55 no ink reaches 4.5:1 over a light backdrop), the NEW GATE
// badge keeps its own dark ink on its amber chip (on the history rows and on
// the red Diverted and Cancelled rows too, whose white was 1.83:1 on it), the
// Diverted strip and the Delayed belt bar move to grounds their lettering
// reads on.
//
// Part 1 locks the structure of the fix by reading the source (runs anywhere).
// Part 2 drives the real board in headless Chrome against fixture data — no
// network — on a dark palette and on a light one, and asserts the computed
// ink of every cell across the unit toggle, the language toggle, a forced
// rebuild and the painters' own heartbeats, and the contrast of every word.
// It skips when no Chrome or Chromium is installed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', 'fids-current');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'fids-core.js'), 'utf8');
const OVR = fs.readFileSync(path.join(ROOT, 'css', 'display-overrides.css'), 'utf8');

// Comment-stripped source, so an assertion cannot pass on prose.
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
}
function fnBody(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must still exist');
  let depth = 0, i = CORE.indexOf('{', at);
  for (let j = i; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}') { depth--; if (depth === 0) return code(CORE.slice(at, j + 1)); }
  }
  throw new Error('unterminated ' + name);
}

// ── Part 1: structure ──────────────────────────────────────────────────────

test('render() inks the rebuilt rows in the same task as the rebuild', () => {
  const at = CORE.indexOf('tbody.innerHTML = _newHtml;');
  assert.ok(at > 0, 'the board rebuild must still be one innerHTML swap');
  const after = code(CORE.slice(at, at + 1600));
  const ink = after.indexOf('_fidsBoardInk()');
  assert.ok(ink > 0, 'render() must call _fidsBoardInk() right after the swap, before the task ends');
  assert.ok(ink < after.indexOf('setTimeout'),
    'and synchronously — not from a timer, or the new rows paint once without their inks');
});

test('_fidsBoardInk runs the code accent first, then the legibility floor', () => {
  const body = fnBody('_fidsBoardInk');
  const a = body.indexOf('applyCodeAccents(');
  const r = body.indexOf('_fidsRowInk(');
  assert.ok(a > 0 && r > a, 'one fixed order, every time');
});

test('neither painter touches a status row', () => {
  const sel = (CORE.match(/var FIDS_STATUS_ROW_SEL = ([^;]+);/) || [])[1] || '';
  for (const cls of ['row-delayed', 'row-final', 'row-cancelled', 'row-diverted',
                     'row-departed', 'row-arrived', 'row-gate-closed']) {
    assert.ok(sel.includes('tr.' + cls), 'FIDS_STATUS_ROW_SEL must name tr.' + cls);
  }
  assert.ok(!/row-early|row-boarding/.test(sel),
    'Early and Boarding rows sit on the plain stripes and keep the code accent');
  assert.match(fnBody('applyCodeAccents'), /_fidsOnStatusRow\(el\)/);
  assert.match(fnBody('_fidsRowInk'), /tr\.matches\(FIDS_STATUS_ROW_SEL\)/);
});

test('_fidsRowInk measures each cell on its own ground and leaves the code alone', () => {
  const body = fnBody('_fidsRowInk');
  assert.match(body, /var bg = _ocGroundOf\(el\)/,
    'the NEW GATE badge sits on its own amber chip — judging it against the row lifted it into the chip');
  assert.match(body, /dest-iata/, 'the code and its bar belong to applyCodeAccents');
});

test('a board or belt code never takes a gate carrier\'s accent', () => {
  assert.match(fnBody('_caScreenAccent'), /!boardOnly && document\.body\.getAttribute\('data-gate-airline'\)/);
  assert.match(fnBody('applyCodeAccents'), /_caScreenAccent\(true\)/);
  assert.match(fnBody('changeScreenType'), /removeAttribute\('data-gate-airline'\)/,
    'leaving the gate screen must take the gate\'s carrier skin hook with it');
});

// WCAG relative luminance and contrast, for the static checks below and the
// browser checks in Part 2.
function lum(c) {
  const a = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
function hex(h) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim()); return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null; }
const mix = (a, b, t) => [0, 1, 2].map(k => a[k] * t + b[k] * (1 - t));
// Every backdrop a board could paint behind the table, corners included.
const BACKDROPS = [];
for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) BACKDROPS.push([r, g, b]);
// The ratio a faded row actually shows: ink and ground both mixed with the
// backdrop by the row's group opacity. The worst backdrop is what counts.
function worstFaded(ink, ground, rowOp) {
  let w = 99;
  for (const B of BACKDROPS) w = Math.min(w, ratio(mix(ink, B, rowOp), mix(ground, B, rowOp)));
  return w;
}

test('history rows state their own ink, and the badge keeps its own', () => {
  const css = code(OVR);
  const H = 'tr:is\\(\\.row-departed, \\.row-arrived, \\.row-gate-closed\\)';
  assert.match(css, new RegExp('body:not\\(\\.fids-light-board\\)[^{]*' + H + ' td \\*:not\\(\\.gate-changed-badge\\)[^{]*\\{\\s*color:\\s*#FFFFFF !important;'),
    'without it the cells take --fids-text, which a custom palette floors against the board background, not the slate row');
  assert.match(css, new RegExp('body\\.fids-light-board[^{]*' + H + ' td \\*:not\\(\\.gate-changed-badge\\)[^{]*\\{\\s*color:\\s*#000000 !important;'),
    'light boards: black on every history cell (the amber and 0.48-alpha words were 2.1:1 and 2.4:1)');
  assert.match(css, new RegExp(H + ' td \\.gate-changed-badge\\s*\\{\\s*color:\\s*#000000 !important;'),
    'the NEW GATE badge is a chip on its own amber: the row\'s white is 1.8:1 on it');
  assert.match(css, new RegExp(H + ' td\\.td-time-sched\\.is-revised\\s*\\{\\s*opacity:\\s*1 !important;'),
    'nothing dims twice inside the fade (the superseded time was 3.2:1)');
});

test('the NEW GATE badge keeps its navy on the red rows', () => {
  const css = code(OVR);
  // Every :not(#_)-guarded rule that whitens a Cancelled or Diverted row's
  // descendants outranks the badge's own navy (flight-display.css), so each
  // must leave the badge out: white on its amber chip is 1.83:1. (The
  // one-id rules lose to the badge's own rule and need no exclusion.)
  let count = 0;
  for (const rule of css.split('}')) {
    const brace = rule.indexOf('{');
    if (brace < 0) continue;
    const body = rule.slice(brace + 1);
    if (!/(?:^|;)\s*color:\s*#fff(?:fff)?\s*!important/i.test(body)) continue;
    for (const sel of rule.slice(0, brace).split(',')) {
      const m = /tr\.row-(?:cancelled|diverted) (?:> )?td \*(.*)$/.exec(sel.trim());
      if (!m || !sel.includes(':not(#_)')) continue;
      count++;
      assert.match(m[1], /^:not\(\.gate-changed-badge\)$/,
        'a red row\'s white must not reach the NEW GATE badge: ' + sel.trim());
    }
  }
  assert.ok(count >= 3, 'the red-row white rules were all found (' + count + ')');
  const badge = /tr:is\(\.row-diverted, \.row-cancelled\) td \.gate-changed-badge\s*\{\s*color:\s*(#[0-9A-Fa-f]{6}) !important;\s*-webkit-text-fill-color:\s*\1 !important;/.exec(css);
  assert.ok(badge, 'the badge on a red row states its own ink, fill colour included');
  assert.ok(ratio(hex(badge[1]), hex('#FFB000')) >= 4.5, `${badge[1]} on the amber is ${ratio(hex(badge[1]), hex('#FFB000')).toFixed(2)}:1`);
});

test('the history fade holds 4.5:1 over any backdrop', () => {
  const css = code(OVR);
  const m = /body:not\(#_\) #fidsTable tbody tr:is\(\.row-departed, \.row-arrived, \.row-gate-closed\)\s*\{\s*opacity:\s*([\d.]+) !important;/.exec(css);
  assert.ok(m, 'the history rows state their fade once, for every board');
  const op = +m[1];
  // The pairs a history row carries, worst case over the whole colour cube.
  for (const [ink, ground, what] of [['#FFFFFF', '#262D36', 'white on the dark slate'],
                                     ['#000000', '#AEB7C1', 'black on the light-board slate'],
                                     ['#000000', '#FFB000', 'black on the NEW GATE amber']]) {
    const w = worstFaded(hex(ink), hex(ground), op);
    assert.ok(w >= 4.5, `${what} at a ${op} fade is ${w.toFixed(2)}:1 over the worst backdrop`);
  }
});

test('the Diverted strip and the custom palette green read', () => {
  const css = code(OVR);
  const even = /tr\.row-diverted:nth-child\(even\) > td,[^{]*\{\s*background-color:\s*(#[0-9A-Fa-f]{6}) !important;/.exec(css);
  assert.ok(even, 'the even Diverted strip is stated');
  assert.ok(ratio([255, 255, 255], hex(even[1])) >= 4.5, `white on ${even[1]} is ${ratio([255, 255, 255], hex(even[1])).toFixed(2)}:1`);
  const g = /_okEven\s*=\s*_pickSt\('#34d399', '(#[0-9A-Fa-f]{6})', _gEven\)/.exec(code(CORE));
  assert.ok(g, 'Early and Arrived keep a deep green for light stripes');
  for (const ground of ['#FFFFFF', '#E3EAF0', '#E8EEF2']) {
    assert.ok(ratio(hex(g[1]), hex(ground)) >= 4.5, `${g[1]} on ${ground} is ${ratio(hex(g[1]), hex(ground)).toFixed(2)}:1`);
  }
});

test('a custom palette\'s status words reach 4.5:1 and keep their colour', () => {
  assert.match(code(CORE), /var _pickSt\s*=\s*function \(bright, deep, ground\) \{[^}]*return _fidsStatusInk\(pick, ground\);/,
    'the custom palette\'s status inks go through the 4.5:1 step');
  // The helper, lifted out of the source and run on the stripes measured on
  // real boards where neither green (or amber) variant reached 4.5:1.
  const a = CORE.indexOf('function _fidsRelLum'), b = CORE.indexOf('try { window._fidsInk');
  const lib = new Function(CORE.slice(a, b) + '; return { ink: _fidsStatusInk, cr: _fidsContrast };')();
  const cases = [['#0C7337', '#F9D3E0', 'Early on a pink stripe (Montréal)'],
                 ['#0C7337', '#88D5F7', 'Early on a pale blue stripe (Québec)'],
                 ['#34d399', '#00565A', 'Early on a teal stripe (Vancouver)'],
                 ['#b45309', '#E3EAF0', 'Delayed amber on a pale grey-blue stripe']];
  for (const [fg, bg, what] of cases) {
    const out = lib.ink(fg, bg);
    assert.ok(lib.cr(out, bg) >= 4.5, `${what}: ${fg} -> ${out} is ${lib.cr(out, bg).toFixed(2)}:1`);
    const [r0, g0, b0] = hex(fg), [r1, g1, b1] = hex(out);
    const top = (r, g, bb) => [r, g, bb].indexOf(Math.max(r, g, bb));
    assert.equal(top(r1, g1, b1), top(r0, g0, b0), `${what}: ${out} keeps the hue of ${fg}`);
  }
  assert.equal(lib.ink('#34d399', '#1A2870'), '#34d399', 'an ink that already reads is left alone');
});

test('the Delayed belt bar takes navy lettering on a yellow ramp', () => {
  const css = code(OVR);
  const bar = /\.bidsv3 \.b3-row\.b3-delayed \{ background: linear-gradient\(100deg,([^)]*)\);[^}]*color: (#[0-9A-Fa-f]{6});/.exec(css);
  assert.ok(bar, 'the Delayed bar states its ramp and its ink');
  const stops = bar[1].split(',').map(x => hex(x.trim().split(' ')[0]));
  const ink = hex(bar[2]);
  for (let i = 0; i < stops.length; i++) {
    const pts = [stops[i]];
    if (i + 1 < stops.length) pts.push(mix(stops[i], stops[i + 1], 0.5));
    for (const p of pts) assert.ok(ratio(ink, p) >= 4.5, `${bar[2]} on the ramp at ${p.map(Math.round)} is ${ratio(ink, p).toFixed(2)}:1`);
  }
  assert.match(css, new RegExp('\\.bidsv3 \\.b3-row\\.b3-delayed :is\\([^)]*\\.b3-code[^)]*\\.b3-time[^)]*\\) \\{ color: ' + bar[2] + ';'),
    'every word on the bar takes the same ink, the code included');
  const pill = /\.bidsv3 \.b3-status\.s-delayed \{ color: (#[0-9A-Fa-f]{6});/g;
  let last = null, mm; while ((mm = pill.exec(css))) last = mm[1];
  assert.ok(last && ratio(hex(last), [244, 241, 236]) >= 4.5, `the pill word ${last} reads on the pill`);
  // (v24003: the bar's wordmark URL is held in _b3Src, so the two-line lockup
  // rule reads the same file the bar draws; tests/belt-stacked-lockup.test.js)
  assert.match(code(CORE), /const _b3Src = _bWmBase \? wordmarkSrc\(_bWmBase, isDelayed \? 'dark' : 'light'\) : '';/,
    'the wordmark on the yellow bar is the dark artwork');
  assert.match(code(CORE), /class="b3-wordmark' \+ _b3Stack\.cls \+ '"' \+ _b3Stack\.style \+ ' alt="' \+ _bSafeName \+ '" src="' \+ _b3Src \+ '"/,
    'the bar draws that artwork');
});

// ── Part 2: the real board in headless Chrome ──────────────────────────────

function findChrome() {
  const cands = [process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { const p = execFileSync('which', [n], { encoding: 'utf8' }).trim(); if (p) return p; } catch (e) {}
  }
  return null;
}

// Minimal CDP-over-WebSocket client (Node 20 has no global WebSocket).
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const sock = net.createConnection(Number(u.port), u.hostname);
    const key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0), up = false, id = 0, frag = [];
    const pending = new Map(), handlers = [];
    const frame = (s) => {
      const body = Buffer.from(s), mask = crypto.randomBytes(4);
      let h;
      if (body.length < 126) h = Buffer.from([0x81, 0x80 | body.length]);
      else if (body.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0x80 | 126; h.writeUInt16BE(body.length, 2); }
      else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(body.length), 2); }
      const m = Buffer.alloc(body.length);
      for (let i = 0; i < body.length; i++) m[i] = body[i] ^ mask[i % 4];
      return Buffer.concat([h, mask, m]);
    };
    const onMsg = (txt) => {
      const msg = JSON.parse(txt);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      else handlers.forEach(h => { try { h(msg); } catch (e) {} });
    };
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!up) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        if (!/^HTTP\/1\.1 101/.test(buf.slice(0, end).toString())) return reject(new Error('ws upgrade failed'));
        up = true; buf = buf.slice(end + 4);
        resolve(api);
      }
      for (;;) {
        if (buf.length < 2) return;
        const fin = buf[0] & 0x80, op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.slice(off, off + len);
        buf = buf.slice(off + len);
        if (op === 8) { sock.end(); return; }
        if (op === 9) continue;
        frag.push(payload);
        if (fin) { const all = Buffer.concat(frag).toString('utf8'); frag = []; onMsg(all); }
      }
    });
    sock.on('error', reject);
    sock.on('connect', () => {
      sock.write('GET ' + u.pathname + ' HTTP/1.1\r\nHost: ' + u.host + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
        + 'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    const api = {
      send(method, params = {}) {
        return new Promise((res) => { const i = ++id; pending.set(i, res); sock.write(frame(JSON.stringify({ id: i, method, params }))); });
      },
      on(h) { handlers.push(h); },
      async eval(expr) {
        const r = await api.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.result && r.result.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
        return r.result && r.result.result ? r.result.result.value : undefined;
      },
      close() { try { sock.destroy(); } catch (e) {} },
    };
  });
}


// Fixture feed in the worker's shape, timed relative to now so every row sits
// in the board's window: two departed, two delayed, a gate-closed row, a final
// call, a cancelled row, two diverted rows (one lands on each stripe), plain
// rows on both stripes and four gate changes (seeded through the board's own
// gate history, exactly as a real gate move is recorded): one on a plain row,
// one on the gate-closed row and one on each Diverted row, all of which the
// gate history keeps for 15 min (it drops only departed and cancelled flights).
//
// `now` is read ONCE per pass (boardPass) and every request is answered from
// it, because a real feed gives a flight the same scheduled time on every
// request. The board asks more than once as it boots: the page's own start-up
// and the deferred first airport change each run fetchLive, about 350 ms apart,
// and each asks for two windows. Built from the clock at each request, the
// fixture moved every row one minute later whenever a minute turned between
// those requests. The gate history is keyed by flight AND scheduled time
// (v23973), so the later load found no record for any departure (the seeded
// number-keyed records had already been carried over and dropped by the first
// load), started each one afresh with no change, and every NEW GATE badge was
// gone: the ready check below failed with all 16 rows drawn and no badge (seen
// in CI on a change that did not touch the board).
function feed(direction, now) {
  const offMin = (() => {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', timeZoneName: 'longOffset' })
      .formatToParts(new Date(now)).find(p => p.type === 'timeZoneName').value;   // GMT-04:00
    const m = /GMT([+-])(\d\d):(\d\d)/.exec(s);
    return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
  })();
  const pad = (n) => String(n).padStart(2, '0');
  const t = (min) => {
    const d = new Date(now + min * 60000);
    const u = d.toISOString().replace('T', ' ').slice(0, 16) + ':00+00:00';
    const l = new Date(d.getTime() + offMin * 60000);
    const sign = offMin < 0 ? '-' : '+', a = Math.abs(offMin);
    const loc = l.toISOString().replace('T', ' ').slice(0, 16) + ':00' + sign + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
    return { local: loc, utc: u };
  };
  const AL = { AC: 'Air Canada', PD: 'Porter Airlines', WS: 'WestJet', UA: 'United Airlines' };
  const AP = { YYZ: 'Toronto', YUL: 'Montreal', YVR: 'Vancouver', YYC: 'Calgary', YHZ: 'Halifax',
               YWG: 'Winnipeg', EWR: 'Newark', ORD: 'Chicago', BOS: 'Boston', YTZ: 'Toronto' };
  const row = (num, status, other, sched, rev, gate, belt) => {
    const al = num.slice(0, 2);
    const here = { airport: { iata: 'YOW', icao: 'CYOW', name: 'Ottawa' }, gate, scheduledTime: t(sched),
                   airline: { iata: al, icao: null, name: AL[al] }, quality: ['Live'] };
    if (rev != null) here.revisedTime = t(rev);
    if (belt) here.baggageBelt = belt;
    const there = { airport: { iata: other, icao: null, name: AP[other] }, scheduledTime: t(sched),
                    airline: { iata: al, icao: null, name: AL[al] }, quality: ['Live'] };
    return direction === 'Departure'
      ? { number: num, callSign: null, status, codeshareStatus: 'IsOperator', isCargo: false, departure: here, arrival: there }
      : { number: num, callSign: null, status, codeshareStatus: 'IsOperator', isCargo: false, departure: there, arrival: here };
  };
  if (direction === 'Departure') {
    return { departures: [
      row('AC9001', 'departed', 'YYZ', -22, -16, '10'),
      row('PD9002', 'departed', 'YTZ', -12, null, '11'),
      row('AC9013', 'GateClosed', 'YVR', 6, null, '23'),     // gate change (seeded) on a history row
      row('UA9016', 'Final', 'ORD', 12, null, '26'),
      row('AC9003', 'delayed', 'YUL', 25, 85, '12'),
      row('WS9004', 'scheduled', 'YYC', 50, null, '14'),
      row('UA9005', 'scheduled', 'EWR', 65, null, '15'),
      row('AC9006', 'scheduled', 'YVR', 80, null, '16'),     // gate change (seeded)
      row('PD9007', 'scheduled', 'YHZ', 95, null, '17'),
      row('AC9008', 'delayed', 'YWG', 110, 150, '18'),
      row('PD9009', 'cancelled', 'BOS', 125, null, '19'),
      row('AC9014', 'Diverted', 'YUL', 132, null, '24'),      // gate change (seeded) on a red row
      row('PD9015', 'Diverted', 'YTZ', 134, null, '25'),      // gate change (seeded) on a red row
      row('WS9010', 'scheduled', 'YYC', 140, null, '20'),
      row('UA9011', 'scheduled', 'ORD', 155, null, '21'),
      row('AC9012', 'scheduled', 'YYZ', 170, null, '22'),
    ] };
  }
  return { arrivals: [
    row('AC9101', 'arrived', 'YYZ', -15, -18, '5', '3'),
    row('PD9102', 'scheduled', 'YTZ', 60, null, '6', '4'),
    row('WS9103', 'delayed', 'YYC', 90, 130, '7', '2'),
  ] };
}

// Ottawa's own saved palette: its Row Text is near-black, which is what left
// the history rows unreadable between the painter's passes. And a light
// palette (white and pale grey-blue stripes), where the history rows wore
// amber and 0.48-alpha words and the Early green was 4.47:1.
const PALETTES = {
  dark: { accent: '#eab308', hdr: '#27272a', hdrText: '#ffffff', bg: '#0091c2',
          rowOdd: '#1a2870', rowEven: '#101f4c', text: '#18181b' },
  light: { accent: '#eab308', hdr: '#27272a', hdrText: '#ffffff', bg: '#e8eef2',
           rowOdd: '#ffffff', rowEven: '#e3eaf0', text: '#18181b' },
};
const airportConfig = (palette) => ({
  hideAirlinePrefix: true, hideWeather: false, airlineStyle: 'full', font: 'bricolage', logoSize: 'small',
  theme: 'custom', customColors: PALETTES[palette],
});

function fixtureFor(url, palette, now) {
  const u = new URL(url);
  if (/\/flights\/airports\/iata\/YOW\//.test(u.pathname)) {
    return { status: 200, type: 'application/json', body: JSON.stringify(feed(u.searchParams.get('direction'), now)) };
  }
  if (/\/weather\/realtime/.test(u.pathname)) {
    return { status: 200, type: 'application/json', body: JSON.stringify({ data: { values: {
      temperature: 15.2, temperatureApparent: 13.8, humidity: 75, windSpeed: 11, windDirection: 184,
      weatherCode: 1000, cloudCover: 10, pressureSeaLevel: 1003, visibility: 20000, precipitationIntensity: 0 } } }) };
  }
  if (/\/api\/airport-config\/YOW/.test(u.pathname)) {
    return { status: 200, type: 'application/json', body: JSON.stringify(airportConfig(palette)) };
  }
  return { status: 404, type: 'text/plain', body: '' };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

// Runs in the page: the computed ink of every text-bearing element on every
// visible board row, the ground it sits on, the opacity inside the row and the
// row's own group opacity (the history fade), kept apart because the fade
// mixes ink and ground with whatever the board paints behind the table.
const SNAP = `(function () {
  function parse(c) { var m = String(c || '').match(/-?[\\d.]+/g); return m && m.length >= 3 ? [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1] : null; }
  function ground(el) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.5) return c;
    }
    return [0, 0, 0, 1];
  }
  var out = {};
  document.querySelectorAll('#fidsTable tbody tr').forEach(function (tr) {
    if (!tr.getClientRects().length) return;
    var f = tr.getAttribute('data-flight') || '?';
    var rowOp = 1; for (var a = tr; a && a.nodeType === 1; a = a.parentElement) rowOp *= parseFloat(getComputedStyle(a).opacity);
    var even = (Array.prototype.indexOf.call(tr.parentElement.children, tr) % 2) === 1;
    tr.querySelectorAll('td, td *').forEach(function (el) {
      var own = false;
      for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.nodeValue.trim()) { own = true; break; }
      if (!own || !el.getClientRects().length) return;
      var td = el.closest('td');
      var key = f + ' ' + td.className.split(' ')[0] + (el === td ? '' : ' ' + el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]);
      var cs = getComputedStyle(el);
      var op = 1; for (var n = el; n && n !== tr; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
      out[key] = { ink: cs.webkitTextFillColor || cs.color, ground: 'rgb(' + ground(el).slice(0, 3).join(', ') + ')',
                   row: tr.className.replace('fids-row-clickable', '').trim(), txt: el.textContent.trim().slice(0, 20),
                   op: Math.round(op * 1000) / 1000, rowOp: Math.round(rowOp * 1000) / 1000, even: even,
                   sep: el.classList.contains('dest-iata-sep'), badge: el.classList.contains('gate-changed-badge'),
                   pill: !!(el.closest && el.closest('.fids-dayplus')) };
    });
  });
  return out;
})()`;

function rgb(s) { const m = String(s).match(/-?[\d.]+/g); return m ? [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1] : null; }
// The ratio the screen shows for one cell: its ink over its own ground at its
// own alpha and opacity, then, on a faded row, the worst backdrop.
function cellRatio(A) {
  const i = rgb(A.ink), g = rgb(A.ground), a = (i[3] == null ? 1 : i[3]) * A.op;
  const txt = mix(i, g, a);
  return A.rowOp >= 0.999 ? ratio(txt, g) : worstFaded(txt, g.slice(0, 3), A.rowOp);
}

const HISTORY = ['row-departed', 'row-arrived', 'row-gate-closed'];
const NAVY = 'rgb(16, 36, 55)', WHITE = 'rgb(255, 255, 255)', BLACK = 'rgb(0, 0, 0)';

async function boardPass(t, chrome, palette) {
  // One clock for every feed request in this pass (see feed()).
  const feedNow = Date.now();
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'board-ink-'));
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--window-size=1680,1050', '--remote-debugging-port=0', '--user-data-dir=' + prof, 'about:blank'];
  if (process.platform === 'linux') args.unshift('--no-sandbox');
  const proc = spawn(chrome, args, { stdio: 'ignore' });
  let cdp = null;
  const cleanup = () => {
    try { cdp && cdp.close(); } catch (e) {}
    try { proc.kill('SIGKILL'); } catch (e) {}
    try { server.close(); } catch (e) {}
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  };
  t.after(cleanup);
  try {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let port = null;
    // up to 45 s: on a busy CI runner, with the other Chrome tests starting
    // beside it, Chrome took more than the old 10 s to write its port file
    for (let i = 0; i < 450 && !port; i++) {
      try { port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch (e) { await sleep(100); }
    }
    assert.ok(port, 'Chrome did not open a debugging port');
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
      targets = await new Promise((res) => {
        http.get('http://127.0.0.1:' + port + '/json/list', (r) => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); })
          .on('error', () => res(null));
      });
      if (!targets) await sleep(100);
    }
    const page = targets.find(x => x.type === 'page');
    cdp = await cdpConnect(page.webSocketDebuggerUrl);

    // Every request leaves through here: our own files load from the local
    // server, the worker's endpoints get fixtures, everything else is refused.
    cdp.on(async (msg) => {
      if (msg.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = msg.params;
      if (request.url.startsWith(base)) { cdp.send('Fetch.continueRequest', { requestId }); return; }
      const fx = fixtureFor(request.url, palette, feedNow);
      cdp.send('Fetch.fulfillRequest', { requestId, responseCode: fx.status,
        responseHeaders: [{ name: 'Content-Type', value: fx.type }, { name: 'Access-Control-Allow-Origin', value: '*' }],
        body: Buffer.from(fx.body).toString('base64') });
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    // The gate changes, recorded the way the board records a real one: the
    // last gate it saw differs from the gate the feed now gives.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source:
      "try { localStorage.setItem('fids_gate_history', JSON.stringify({ AC9006: { currentGate: '9', changedAt: 0 }, AC9013: { currentGate: '8', changedAt: 0 }, AC9014: { currentGate: '7', changedAt: 0 }, PD9015: { currentGate: '6', changedAt: 0 } })); } catch (e) {}" });
    await cdp.send('Page.navigate', { url: base + '/fids.html?ap=YOW' });

    // The board turns to its arrivals page after two slides; once the data and
    // the weather are in, the test stops the slide clock and puts it back on
    // the first departures page itself.
    let loaded = false;
    for (let i = 0; i < 120 && !loaded; i++) {
      await sleep(250);
      try {
        loaded = await cdp.eval(`typeof data !== 'undefined' && data.dep.length >= 14 && data.arr.length >= 2
          && typeof TOMORROW_WX !== 'undefined' && Object.keys(TOMORROW_WX).length >= 3
          && document.body.getAttribute('data-fids-theme') === 'custom'`);
      } catch (e) { loaded = false; }
    }
    if (loaded) await cdp.eval("clearInterval(pageTimer); mode = 'dep'; currentPage = 0; _slideIdx = 0; lang = langs[0]; tempUnit = 'C'; render(); 1");
    const lightWanted = palette === 'light';
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      await sleep(250);
      try {
        ready = await cdp.eval(`document.querySelectorAll('#fidsTable tbody tr').length >= 14
          && !!document.querySelector('#fidsTable tbody tr.row-delayed')
          && !!document.querySelector('#fidsTable tbody tr.row-departed')
          && !!document.querySelector('#fidsTable tbody tr.row-gate-closed .gate-changed-badge')
          && !!document.querySelector('#fidsTable tbody tr:not(.row-departed):not(.row-arrived):not(.row-gate-closed) .gate-changed-badge')
          && !!document.querySelector('#fidsTable tbody tr.row-diverted:nth-child(even)')
          && !!document.querySelector('#fidsTable tbody tr.row-diverted .gate-changed-badge')
          && !!document.querySelector('#fidsTable .fids-cell-weather span')
          && document.body.classList.contains('fids-light-board') === ${lightWanted}
          && document.body.getAttribute('data-fids-theme') === 'custom'`);
      } catch (e) { ready = false; }
    }
    if (!ready) {
      let diag = '';
      try {
        diag = JSON.stringify(await cdp.eval(`({ rows: document.querySelectorAll('#fidsTable tbody tr').length,
          classes: [].map.call(document.querySelectorAll('#fidsTable tbody tr'), function (r) { return (r.getAttribute('data-flight') || '?') + ':' + r.className; }).join('|'),
          badges: [].map.call(document.querySelectorAll('#fidsTable .gate-changed-badge'), function (b) { return b.closest('tr').className; }).join('|'),
          dep: (typeof data !== 'undefined' && data.dep) ? data.dep.length : -1,
          theme: document.body.getAttribute('data-fids-theme'), light: document.body.classList.contains('fids-light-board'),
          wx: !!document.querySelector('#fidsTable .fids-cell-weather span'),
          page: typeof currentPage !== 'undefined' ? currentPage : -1, mode: typeof mode !== 'undefined' ? mode : '?' })`));
      } catch (e) { diag = String(e); }
      assert.fail(palette + ' palette: the board never showed the fixture rows (delayed, departed, a gate-closed row, a plain row and a Diverted row with a gate change, a Diverted row on the even stripe, weather): ' + diag);
    }

    const steps = [
      ['unit and language slide', 'tick_carousel()'],
      ['unit and language slide', 'tick_carousel()'],
      ['rebuild (a poll with new data)', "_lastTbodyHtml = ''; render()"],
      ['gate carrier stamped on the body', "document.body.setAttribute('data-gate-airline', 'AC'); applyCodeAccents()"],
      ['back from the gate screen', "changeScreenType('main')"],
      ['unit and language slide', 'tick_carousel()'],
    ];
    const HEARTBEAT = 'applyCodeAccents(); _fidsRowInk(); boardAutofit(false);';
    const seen = {};              // key -> first ink, across every step
    const problems = [];
    const n = { delayed: 0, history: 0, historyBadge: 0, plainBadge: 0, redBadge: 0, diverted: 0, plain: 0 };
    for (const [label, js] of steps) {
      // One evaluate per sample pair: the first sample is what the first paint
      // after the step shows, the second is after the painters' heartbeats.
      // After the second slide the board turns to its arrivals page; those rows
      // are checked by the same rules (an Arrived row is a history row).
      const pair = await cdp.eval('(function(){ ' + js + '; var a = ' + SNAP + '; ' + HEARTBEAT + ' var b = ' + SNAP + '; return { a: a, b: b }; })()');
      for (const k of Object.keys(pair.a)) {
        const A = pair.a[k], B = pair.b[k];
        const at = `${palette} · ${label}: ${k} "${A.txt}"`;
        if (B && A.ink !== B.ink) problems.push(`${at} painted ${A.ink} then ${B.ink} by the heartbeat`);
        if (seen[k] && seen[k].ink !== A.ink) problems.push(`${at} changed ${seen[k].ink} -> ${A.ink}`);
        if (!seen[k]) seen[k] = A;
        const row = A.row.split(' ')[0];
        // The next-day "+1" (v23975) is white on its own dark pill on every row
        // and theme, and the row-ink pass leaves it alone, so no row's ink rule
        // applies to it; its contrast on the pill is still checked below. (It
        // appears only while a fixture time crosses midnight in Ottawa.)
        if (A.pill) {
          if (A.ink !== WHITE) problems.push(`${at}: the +1 pill's ink is ${A.ink}, not white`);
        } else if (HISTORY.includes(row)) {
          n.history++;
          if (A.rowOp !== 0.7) problems.push(`${at}: the history row fades to ${A.rowOp}, not 0.7`);
          if (A.badge) {
            n.historyBadge++;
            if (A.ink !== BLACK) problems.push(`${at}: NEW GATE badge on a history row is ${A.ink} on ${A.ground}, not black`);
          } else if (A.ink !== (lightWanted ? BLACK : WHITE)) {
            problems.push(`${at}: history cell is ${A.ink}, not ${lightWanted ? 'black' : 'white'}`);
          }
        } else if (A.badge) {
          if (row === 'row-diverted' || row === 'row-cancelled') n.redBadge++; else n.plainBadge++;
          if (A.ink !== NAVY) problems.push(`${at}: NEW GATE badge is ${A.ink} on ${A.ground}, not navy`);
        } else if (row === 'row-delayed') {
          n.delayed++;
          // Dark boards: the whole Delayed row is navy. Light boards keep their
          // own grammar (a deep brown status word and revised time); there
          // only stability and contrast are asserted.
          // The next-day "+1" paints its own dark pill (v23975), so it keeps
          // its white on every row; its contrast is still measured below.
          if (!lightWanted && !A.pill && A.ink !== NAVY) problems.push(`${at}: Delayed cell is ${A.ink}, not the row's navy`);
        } else if (row === 'row-diverted') {
          n.diverted++;
        } else if (row === '' || row === 'row-early') {
          n.plain++;
        }
        // Every word reads, on every row (the city|code bar is a divider, not a word).
        if (!A.sep) {
          const cr = cellRatio(A);
          if (cr < 4.5) problems.push(`${at} ${A.ink} on ${A.ground}${A.rowOp < 1 ? ' faded to ' + A.rowOp : ''} is ${cr.toFixed(2)}:1`);
        }
      }
    }
    assert.ok(n.delayed > 0 && n.history > 0 && n.historyBadge > 0 && n.plainBadge > 0 && n.redBadge > 0 && n.diverted > 0 && n.plain > 0,
      `${palette} palette: every kind of row must have been measured ${JSON.stringify(n)}`);
    assert.deepEqual(problems.slice(0, 25), [], problems.length + ' ink problems on the ' + palette + ' palette');
  } finally {
    cleanup();
  }
}

test('every cell keeps one legible ink through the unit, language, rebuild and heartbeat passes', { timeout: 180000 }, async (t) => {
  const chrome = findChrome();
  if (!chrome) { t.skip('no Chrome or Chromium installed'); return; }
  await t.test('dark palette (Ottawa)', async (tt) => boardPass(tt, chrome, 'dark'));
  await t.test('light palette', async (tt) => boardPass(tt, chrome, 'light'));
});
