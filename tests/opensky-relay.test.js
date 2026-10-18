'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE OPENSKY RELAY (stream-server/opensky-relay/).
//
// OpenSky whitelists the one address its paid account calls from, and a
// Cloudflare Worker has no fixed address. So a small server of our own makes
// every OpenSky call, from one IPv4, and the Worker reaches it only through a
// Cloudflare Tunnel. The licence is narrow (live positions for the aircraft
// of the flights being shown, small boxes, a short-lived shared cache, a
// term that ends) and the relay is where those limits are kept, so each one
// is tested here:
//
//   · the caller key, a box of at most 25 sq deg, and at least one flight
//     (callsign or icao24, 4 at most): no request ever gets the surrounding
//     traffic, and global or icao24-only queries never reach OpenSky
//   · reduced fields only, no vertical rate, and no heading until HEADING=1
//   · a memory cache that drops expired answers by itself, and identical
//     requests in flight share one call
//   · 1500 calls per UTC day, paced by the hour, counted on disk before the
//     call so a restart cannot reset it, and a clock set back cannot either
//   · OpenSky's 429 and its wait headers are obeyed, across a restart too;
//     a refusal holds every call for 10 minutes
//   · the HARD STOP: after STOP_AT, 410 and not one upstream request, not
//     even a login; latched, so a clock set back does not undo it
//   · IPv4 only on the way out, 127.0.0.1 only on the way in
//   · no secret, coordinate or callsign in the logs
//   · the installer pins relay.py's SHA-256, and its shell helpers agree with
//     the relay about the stop date
//
// relay.py runs against a fake OpenSky on 127.0.0.1. Nothing here reaches
// OpenSky: test mode only accepts loopback URLs, and the real ones are only
// read as text. Skips cleanly where python3 is missing, unless
// OSKY_RELAY_REQUIRE_PY names the version that must run it (CI: 3.12, the
// server's Python).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'stream-server', 'opensky-relay');
const RELAY = path.join(DIR, 'relay.py');
const INSTALL = path.join(DIR, 'install.sh');
const README = path.join(DIR, 'README.md');
const RELAY_SRC = fs.readFileSync(RELAY, 'utf8');
const INSTALL_SRC = fs.readFileSync(INSTALL, 'utf8');
const README_SRC = fs.readFileSync(README, 'utf8');
const WORKER = fs.readFileSync(path.join(ROOT, 'worker-entry.js'), 'utf8');

const PY = (() => {
  const r = spawnSync('python3', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? 'python3' : null;
})();
const NEED_PY = PY ? {} : { skip: 'python3 is not installed' };
const GNU_DATE = spawnSync('date', ['--version'], { encoding: 'utf8' }).status === 0;
const NEED_GNU_DATE = GNU_DATE ? {} : { skip: 'GNU date is not installed (the server and CI have it)' };

test('the Python that runs the relay is the one asked for', { skip: !process.env.OSKY_RELAY_REQUIRE_PY }, () => {
  assert.ok(PY, 'python3 is required here');
  const v = spawnSync(PY, ['--version'], { encoding: 'utf8' });
  assert.match((v.stdout || v.stderr).trim(), new RegExp('^Python ' + process.env.OSKY_RELAY_REQUIRE_PY.replace('.', '\\.') + '\\.'));
});

// Test credentials for the fake server only. Derived from fixed labels rather
// than written out, so no credential-shaped string sits in the repository;
// the same labels always give the same values.
const CLIENT_ID = 'relay-test-client';
const testValue = (label) => crypto.createHash('sha256').update('opensky-relay-test:' + label).digest('base64').replace(/[^A-Za-z0-9]/g, '');
const SECRET = testValue('client-secret').slice(0, 20);
const CALLER_KEY = testValue('caller-key').toLowerCase().slice(0, 24).match(/.{4}/g).join('-');

const T0 = Date.UTC(2026, 9, 20, 23, 0, 0) / 1000;      // 23:00Z: the whole day's cap is open
const STOP_AT = '2026-11-12T22:59:59Z';                    // 12 Nov 2026, 23:59:59 Swiss time
const STOP_S = Date.UTC(2026, 10, 12, 22, 59, 59) / 1000;

// A box near Moncton, with values distinctive enough to search the logs for.
const BOX = { lamin: '45.6789', lomin: '-66.4321', lamax: '47.1234', lomax: '-63.2109' };
const FLIGHT = '&callsign=ACA123';
const boxQuery = (b = BOX, extra = FLIGHT) =>
  `/states?lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}${extra}`;
const otherBox = (i) => ({ lamin: String(40 + i * 0.5), lomin: '-70', lamax: String(41 + i * 0.5), lomax: '-68' });

// OpenSky's state vector order: icao24, callsign, origin_country,
// time_position, last_contact, longitude, latitude, baro_altitude, on_ground,
// velocity, true_track, vertical_rate, sensors, geo_altitude, squawk, spi,
// position_source, category.
const ROWS = [
  ['c0ffee', 'ACA123  ', 'Canada', 1792540000, 1792540001, -64.6789, 46.1123, 1234.5, false, 210.5, 87.25, -3.25, null, 1300.1, '6123', false, 0, 0],
  ['abc123', 'POE456  ', 'Canada', 1792540000, 1792540002, -64.5011, 46.2345, 3000, false, 180.2, 270, 0, null, 3050, '7012', false, 0, 0],
  ['d0d0d0', null, 'Canada', null, 1792540003, null, null, null, true, 0, null, null, null, null, null, false, 0, 0],
  ['e1e1e1', 'WJA789  ', 'Canada', 1792540000, 1792540004, -64.9, 46.3, 9000, false, 230.4, 10, 5, null, 9100, '1200', false, 0, 0],
  'garbage',
  [1, 2, 3],
];
const REDUCED = ['icao24', 'callsign', 'lat', 'lon', 'baro_altitude', 'geo_altitude', 'on_ground',
  'velocity', 'time_position', 'last_contact'];

// ── a fake OpenSky: OAuth token endpoint + /api/states/all ────────────────
function fakeOpenSky(host = '127.0.0.1') {
  const f = {
    tokenCalls: 0, statesCalls: 0, issued: 0, tokens: new Set(), revoked: new Set(),
    mode: 'ok', loginMode: 'ok', delayMs: 0, queries: [], agents: [], date: null,
    stateFile: null, diskCounts: [],
  };
  f.server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      // no real Date header: the relay treats OpenSky's clock past STOP_AT as
      // a stop, so the fake only sends one when a test sets it
      res.sendDate = false;
      if (f.date) res.setHeader('Date', f.date);
      f.agents.push(req.headers['user-agent']);
      const u = new URL(req.url, 'http://fake');
      if (req.method === 'POST' && u.pathname === '/auth/token') {
        f.tokenCalls++;
        if (f.loginMode === '403') { res.writeHead(403); res.end(); return; }
        if (f.loginMode === '503') { res.writeHead(503); res.end(); return; }
        const form = new URLSearchParams(body);
        if (form.get('grant_type') !== 'client_credentials' || form.get('client_id') !== CLIENT_ID
            || form.get('client_secret') !== SECRET) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end('{"error":"invalid_client"}');
          return;
        }
        const tok = 'fake-access-token-' + (++f.issued);
        f.tokens.add(tok);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ access_token: tok, expires_in: 1800, token_type: 'Bearer' }));
        return;
      }
      if (req.method === 'GET' && u.pathname === '/api/states/all') {
        f.statesCalls++;
        f.queries.push(Object.fromEntries(u.searchParams));
        if (f.stateFile) f.diskCounts.push(JSON.parse(fs.readFileSync(f.stateFile, 'utf8')).count);
        const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
        const send = () => {
          if (f.mode === 'always401' || !f.tokens.has(tok) || f.revoked.has(tok)) {
            res.writeHead(401); res.end(); return;
          }
          if (f.mode === 'forbidden') { res.writeHead(403); res.end(); return; }
          if (f.mode === 'unavailable') { res.writeHead(503); res.end(); return; }
          if (f.mode === 'rate') {
            res.writeHead(429, { 'X-Rate-Limit-Retry-After-Seconds': '600' }); res.end(); return;
          }
          if (f.mode === 'rate-ra') {
            res.writeHead(429, { 'Retry-After': '120' }); res.end(); return;
          }
          if (f.mode === 'badjson') {
            res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"time": 17, "states": [[');
            return;
          }
          if (f.mode === 'html500') {
            res.writeHead(500, { 'content-type': 'text/html' }); res.end('<html>oops</html>'); return;
          }
          if (f.mode === 'states-string') {
            res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"time": 17, "states": "x"}');
            return;
          }
          if (f.mode === 'states-null') {
            res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"time": 17, "states": null}');
            return;
          }
          const time = f.mode === 'late-time' ? STOP_S + 10 : 1792540005;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ time, states: ROWS }));
        };
        if (f.delayMs) setTimeout(send, f.delayMs); else send();
        return;
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise((resolve, reject) => {
    f.server.on('error', reject);
    f.server.listen(0, host, () => {
      f.port = f.server.address().port;
      f.url = 'http://' + (host === '::1' ? 'localhost' : host) + ':' + f.port;
      f.close = () => new Promise((r) => f.server.close(() => r()));
      resolve(f);
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(port, p, headers = {}, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: p, headers, agent: false, timeout: 20000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

const CHILDREN = new Set();
process.on('exit', () => { for (const c of CHILDREN) { try { c.kill('SIGKILL'); } catch (e) { /* gone */ } } });

function writeConf(dir, lines) {
  fs.writeFileSync(path.join(dir, 'etc', 'relay.conf'), lines.join('\n') + '\n');
}

function baseEnv(fake, r) {
  return {
    PATH: process.env.PATH,
    OSKY_TEST_MODE: '1',
    OSKY_TEST_TOKEN_URL: fake.url + '/auth/token',
    OSKY_TEST_API_BASE: fake.url + '/api',
    OSKY_TEST_PORT: String(r.port),
    OSKY_TEST_CONFIG_DIR: path.join(r.dir, 'etc'),
    OSKY_TEST_CLOCK_FILE: path.join(r.dir, 'clock'),
    STATE_DIRECTORY: path.join(r.dir, 'state'),
    CREDENTIALS_DIRECTORY: path.join(r.dir, 'creds'),
  };
}

// Starts relay.py in test mode. opts: dir (reuse), conf (lines), key (false =
// none), callerKey (false = none), clock (epoch s).
async function startRelay(fake, opts = {}) {
  const r = { dir: opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'osky-relay-')), out: '' };
  for (const d of ['etc', 'state', 'creds']) fs.mkdirSync(path.join(r.dir, d), { recursive: true });
  if (opts.conf !== undefined || !opts.dir) {
    writeConf(r.dir, opts.conf || [`STOP_AT=${STOP_AT}`, 'DAILY_CAP=1500', 'CACHE_SECONDS=120', 'HEADING=0']);
  }
  const cred = path.join(r.dir, 'creds', 'credentials');
  if (opts.key === false) fs.rmSync(cred, { force: true });
  else if (!opts.dir || opts.key) fs.writeFileSync(cred, `client_id=${CLIENT_ID}\nclient_secret=${SECRET}\n`);
  const caller = path.join(r.dir, 'creds', 'caller-key');
  if (opts.callerKey === false) fs.rmSync(caller, { force: true });
  else fs.writeFileSync(caller, CALLER_KEY + '\n');
  r.setClock = (t) => { r.now = t; fs.writeFileSync(path.join(r.dir, 'clock'), String(t)); };
  r.setClock(opts.clock || T0);
  r.port = await freePort();
  r.env = baseEnv(fake, r);
  r.stateFile = path.join(r.dir, 'state', 'state.json');
  r.marker = path.join(r.dir, 'state', 'stopped');
  r.child = spawn(PY, ['-I', RELAY], { env: r.env, stdio: ['ignore', 'pipe', 'pipe'] });
  CHILDREN.add(r.child);
  r.child.stdout.on('data', (d) => { r.out += d; });
  r.child.stderr.on('data', (d) => { r.out += d; });
  r.get = (p, headers = { 'X-Relay-Key': CALLER_KEY }) => get(r.port, p, headers);
  r.stop = () => new Promise((resolve) => {
    if (r.child.exitCode !== null) { CHILDREN.delete(r.child); resolve(); return; }
    r.child.on('exit', () => { CHILDREN.delete(r.child); resolve(); });
    r.child.kill('SIGTERM');
    setTimeout(() => { try { r.child.kill('SIGKILL'); } catch (e) { /* gone */ } }, 3000);
  });
  for (let i = 0; i < 100; i++) {
    try {
      const h = await r.get('/health');
      if (h.status === 200) return r;
    } catch (e) { /* not listening yet */ }
    if (r.child.exitCode !== null) break;
    await sleep(50);
  }
  throw new Error('relay did not start: ' + r.out);
}

function runPy(args, env) {
  return spawnSync(PY, ['-I', RELAY, ...args], { env, encoding: 'utf8', timeout: 20000 });
}

// The fake OpenSky runs in this process, so anything that talks to it must
// not block the event loop the way spawnSync does.
function runPyAsync(args, env) {
  return new Promise((resolve) => {
    const c = spawn(PY, ['-I', RELAY, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    CHILDREN.add(c);
    let stdout = '', stderr = '';
    c.stdout.on('data', (d) => { stdout += d; });
    c.stderr.on('data', (d) => { stderr += d; });
    c.on('exit', (status) => { CHILDREN.delete(c); resolve({ status, stdout, stderr }); });
  });
}

function pyEval(code) {
  const r = spawnSync(PY, ['-I', '-c', `import sys; sys.path.insert(0, ${JSON.stringify(DIR)}); import relay\n${code}`],
    { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// waits until fn() is true (the relay's ticker runs every 0.2 s in test mode)
async function until(fn, what) {
  for (let i = 0; i < 50; i++) {
    if (await fn()) return;
    await sleep(100);
  }
  assert.fail('timed out waiting for ' + what);
}

// ── who may ask ───────────────────────────────────────────────────────────
test('the caller key: /states answers only the boards\' Worker; /health stays open', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    for (const [headers, code] of [
      [{}, 'caller-key'],
      [{ 'X-Relay-Key': CALLER_KEY.slice(0, -4) + (CALLER_KEY.endsWith('0000') ? '1111' : '0000') }, 'caller-key'],
      [{ 'X-Relay-Key': CALLER_KEY.slice(0, 10) }, 'caller-key'],
      [{ 'X-Forwarded-For': '192.0.2.1' }, 'caller-key'],
    ]) {
      const res = await r.get(boxQuery(), headers);
      assert.equal(res.status, 403, JSON.stringify(headers));
      assert.deepEqual(res.json, { error: code });
    }
    assert.equal(fake.tokenCalls + fake.statesCalls, 0, 'nothing reached OpenSky');
    // dashes, spaces and capitals typed into Cloudflare do not matter
    const typed = await r.get(boxQuery(), { 'X-Relay-Key': ' ' + CALLER_KEY.toUpperCase().replace(/-/g, ' ') + ' ' });
    assert.equal(typed.status, 200);
    assert.equal((await r.get('/health', {})).status, 200, '/health needs no key');
  } finally { await r.stop(); await fake.close(); }

  // no caller key on the server: /states refuses everyone
  const fake2 = await fakeOpenSky();
  const r2 = await startRelay(fake2, { callerKey: false });
  try {
    const res = await r2.get(boxQuery());
    assert.equal(res.status, 403);
    assert.deepEqual(res.json, { error: 'caller-key-not-set' });
    const h = (await r2.get('/health')).json;
    assert.equal(h.state, 'no-caller-key');
    assert.equal(h.caller_key_set, false);
    assert.equal(fake2.tokenCalls + fake2.statesCalls, 0);
  } finally { await r2.stop(); await fake2.close(); }
});

// ── the box and the flights ───────────────────────────────────────────────
test('a box of at most 25 sq deg and at least one flight are required; global, icao24-only and bare-box queries are refused', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    const refused = [
      ['/states', 'box-required'],                                        // global
      ['/states?icao24=c0ffee', 'box-required'],                          // icao24 only
      ['/states?icao24=c0ffee&callsign=ACA123', 'box-required'],
      ['/states?lamin=45&lomin=-66&lamax=46', 'box-required'],            // three of four
      ['/states?lamin=40&lomin=-70&lamax=46&lomax=-65' + FLIGHT, 'box-too-big'],   // 6 x 5 = 30
      ['/states?lamin=-90&lomin=-180&lamax=90&lomax=180' + FLIGHT, 'box-too-big'], // the world
      ['/states?lamin=46&lomin=-66&lamax=45&lomax=-65' + FLIGHT, 'box-out-of-range'],
      ['/states?lamin=45&lomin=-66&lamax=46&lomax=-266' + FLIGHT, 'box-out-of-range'],
      ['/states?lamin=abc&lomin=-66&lamax=46&lomax=-65' + FLIGHT, 'box-not-a-number'],
      ['/states?lamin=nan&lomin=-66&lamax=46&lomax=-65' + FLIGHT, 'box-not-a-number'],
      ['/states?lamin=45&lamin=44&lomin=-66&lamax=46&lomax=-65' + FLIGHT, 'box-repeated'],
      [boxQuery(BOX, '&time=1792000000'), 'unknown-parameter'],           // no history
      [boxQuery(BOX, '&extended=1' + FLIGHT), 'unknown-parameter'],
      [boxQuery(BOX, ''), 'filter-required'],                             // the whole box: never
      [boxQuery(BOX, '&icao24='), 'filter-required'],
      [boxQuery(BOX, '&callsign=,,'), 'filter-required'],
      [boxQuery(BOX, '&callsign=A1,A2,A3&icao24=aaaaaa,bbbbbb'), 'too-many-filters'],
      [boxQuery(BOX, '&icao24=xyz'), 'bad-icao24'],
      [boxQuery(BOX, '&callsign=AC%20123'), 'bad-callsign'],
    ];
    for (const [p, code] of refused) {
      const res = await r.get(p);
      assert.equal(res.status, 400, p);
      assert.deepEqual(res.json, { error: code }, p);
    }
    assert.equal(fake.statesCalls, 0, 'nothing refused reached OpenSky');
    assert.equal(fake.tokenCalls, 0, 'not even a login');

    const edge = await r.get('/states?lamin=40&lomin=-70&lamax=45&lomax=-65' + FLIGHT);  // exactly 25
    assert.equal(edge.status, 200);
    assert.equal(fake.statesCalls, 1);
    assert.deepEqual(Object.keys(fake.queries[0]).sort(), ['lamax', 'lamin', 'lomax', 'lomin'],
      'upstream gets the box and nothing else');
    assert.equal((await r.get(boxQuery(BOX, '&callsign=A1,A2&icao24=aaaaaa,bbbbbb'))).status, 200, 'four flights are fine');
    assert.equal((await r.get('/nope')).status, 404);
  } finally { await r.stop(); await fake.close(); }
});

test('answers carry the reduced fields of the flights asked for, no vertical rate, no heading until HEADING=1', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    const res = await r.get(boxQuery(BOX, '&icao24=c0ffee,abc123,d0d0d0'));
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.json.credit, 'Data: OpenSky Network');
    assert.equal(res.json.count, 2, 'a flight without a position, and malformed rows, are dropped');
    for (const s of res.json.states) assert.deepEqual(Object.keys(s).sort(), [...REDUCED].sort());
    const aca = res.json.states.find((s) => s.icao24 === 'c0ffee');
    assert.deepEqual(aca, {
      icao24: 'c0ffee', callsign: 'ACA123', lat: 46.1123, lon: -64.6789, baro_altitude: 1234.5,
      geo_altitude: 1300.1, on_ground: false, velocity: 210.5,
      time_position: 1792540000, last_contact: 1792540001,
    });
    for (const dropped of ['origin_country', 'squawk', 'sensors', 'spi', 'position_source', 'category', 'true_track',
      'vertical_rate', '-3.25', 'Canada', '6123', 'e1e1e1', 'WJA789']) {
      assert.ok(!res.body.includes(dropped), dropped + ' must not be passed on');
    }

    // the config is root's; switching the heading on takes effect without a restart
    writeConf(r.dir, [`STOP_AT=${STOP_AT}`, 'DAILY_CAP=1500', 'CACHE_SECONDS=120', 'HEADING=1', '# heading confirmed']);
    const on = await r.get(boxQuery(BOX, '&icao24=c0ffee'));
    assert.equal(on.status, 200);
    assert.equal(on.json.states[0].true_track, 87.25);
    assert.ok(!on.body.includes('vertical_rate'));
    assert.equal((await r.get('/health')).json.heading, true);
    assert.equal(fake.statesCalls, 1, 'served from memory');
  } finally { await r.stop(); await fake.close(); }
});

test('icao24 and callsign pick the flights out of the box here, so every screen shares one upstream call', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    const ids = async (extra) => (await r.get(boxQuery(BOX, extra))).json.states.map((s) => s.icao24).sort();
    assert.deepEqual(await ids('&callsign=ACA123'), ['c0ffee']);
    assert.deepEqual(await ids('&callsign=aca123'), ['c0ffee']);
    assert.deepEqual(await ids('&icao24=ABC123'), ['abc123']);
    assert.deepEqual(await ids('&callsign=ACA123,POE456'), ['abc123', 'c0ffee']);
    assert.deepEqual(await ids('&callsign=ACA123&callsign=POE456'), ['abc123', 'c0ffee']);
    assert.deepEqual(await ids('&callsign=ACA123&icao24=abc123'), ['abc123', 'c0ffee'], 'each value names one aircraft');
    assert.deepEqual(await ids('&callsign=WJA999'), []);
    assert.equal(fake.statesCalls, 1);
    assert.deepEqual(Object.keys(fake.queries[0]).sort(), ['lamax', 'lamin', 'lomax', 'lomin'],
      'no icao24 or callsign is sent upstream');
    assert.deepEqual([...new Set(fake.agents)], ['orion-connected-opensky-relay/1'], 'a User-Agent on every call');
  } finally { await r.stop(); await fake.close(); }
});

// ── the cache ─────────────────────────────────────────────────────────────
test('cache: 120 s in memory, never more than 300 s, concurrent requests share one call', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    assert.equal((await r.get(boxQuery())).json.cached, false);
    const hit = await r.get(boxQuery());
    assert.equal(hit.json.cached, true);
    r.setClock(T0 + 119);
    assert.equal((await r.get(boxQuery())).json.cached, true);
    assert.equal(fake.statesCalls, 1);
    r.setClock(T0 + 121);
    assert.equal((await r.get(boxQuery())).json.cached, false);
    assert.equal(fake.statesCalls, 2);

    fake.delayMs = 500;
    r.setClock(T0 + 250);
    const all = await Promise.all(Array.from({ length: 6 }, () => r.get(boxQuery())));
    assert.deepEqual(all.map((a) => a.status), [200, 200, 200, 200, 200, 200]);
    assert.equal(fake.statesCalls, 3, 'six identical requests in flight, one upstream call');
    assert.equal(fake.tokenCalls, 1);
    fake.delayMs = 0;

    // asking for 900 s gets 300 s, by the clock and not only in /health
    writeConf(r.dir, [`STOP_AT=${STOP_AT}`, 'CACHE_SECONDS=900']);
    assert.equal((await r.get('/health')).json.cache_seconds, 300, 'clamped to 300 s');
    r.setClock(T0 + 1000);
    assert.equal((await r.get(boxQuery())).json.cached, false);
    assert.equal(fake.statesCalls, 4);
    r.setClock(T0 + 1299);
    assert.equal((await r.get(boxQuery())).json.cached, true);
    r.setClock(T0 + 1301);
    assert.equal((await r.get(boxQuery())).json.cached, false, 'never kept past 300 s');
    assert.equal(fake.statesCalls, 5);
  } finally { await r.stop(); await fake.close(); }
});

test('cache: an expired answer is dropped by itself, whether or not anyone asks again', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    for (let i = 0; i < 3; i++) assert.equal((await r.get(boxQuery(otherBox(i)))).status, 200);
    assert.equal((await r.get('/health')).json.cache_entries, 3);
    r.setClock(T0 + 121);                       // nobody asks again
    await until(async () => (await r.get('/health')).json.cache_entries === 0, 'the expired answers to go');
    assert.equal(fake.statesCalls, 3);
  } finally { await r.stop(); await fake.close(); }
});

// ── the daily cap ─────────────────────────────────────────────────────────
test('daily cap: 429 once spent, saved before every call, kept across a restart, paced by the hour, reset at UTC midnight', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const conf = [`STOP_AT=${STOP_AT}`, 'DAILY_CAP=3'];
  let r = await startRelay(fake, { conf });
  fake.stateFile = r.stateFile;
  try {
    for (let i = 0; i < 3; i++) assert.equal((await r.get(boxQuery(otherBox(i)))).status, 200);
    assert.deepEqual(fake.diskCounts, [1, 2, 3], 'each call was on disk before OpenSky saw it');
    const capped = await r.get(boxQuery(otherBox(3)));
    assert.equal(capped.status, 429);
    assert.deepEqual(capped.json, { error: 'daily-cap' });
    const wait = Number(capped.headers['retry-after']);
    assert.ok(wait > 0 && wait <= 3601, 'retry at the next UTC day, an hour away');
    assert.equal(fake.statesCalls, 3);

    const saved = JSON.parse(fs.readFileSync(r.stateFile, 'utf8'));
    assert.deepEqual(saved, { date: '2026-10-20', count: 3, backoff_until: 0 },
      'the state file holds the date, the count and OpenSky\'s wait, nothing else');

    await r.stop();
    r = await startRelay(fake, { dir: r.dir, clock: T0 + 60 });
    assert.equal((await r.get(boxQuery(otherBox(4)))).status, 429, 'a restart does not reset the count');
    assert.equal((await r.get('/health')).json.calls_today, 3);
    assert.equal(fake.statesCalls, 3);

    // a new UTC day; hour 0 may use 1/24 of the cap (rounded up): 1 call of 3
    r.setClock(Date.UTC(2026, 9, 21, 0, 0, 30) / 1000);
    assert.equal((await r.get(boxQuery(otherBox(5)))).status, 200);
    const paced = await r.get(boxQuery(otherBox(6)));
    assert.equal(paced.status, 429);
    assert.deepEqual(paced.json, { error: 'hourly-pace' });
    assert.ok(Number(paced.headers['retry-after']) <= 3601);
    // with a cap of 3 the second call opens at hour 8: ceil(3 * 9 / 24) = 2
    r.setClock(Date.UTC(2026, 9, 21, 7, 59, 0) / 1000);
    assert.equal((await r.get(boxQuery(otherBox(6)))).status, 429);
    r.setClock(Date.UTC(2026, 9, 21, 8, 0, 30) / 1000);
    assert.equal((await r.get(boxQuery(otherBox(6)))).status, 200, 'a later hour opens the next share');
    assert.equal(fake.statesCalls, 5);

    writeConf(r.dir, [`STOP_AT=${STOP_AT}`, 'DAILY_CAP=99999']);
    assert.equal((await r.get('/health')).json.cap, 1500, 'the config may lower the cap, never raise it');
  } finally { await r.stop(); await fake.close(); }
});

test('daily cap: a clock set back a day does not reset it, and forward again does not either', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const day = (d, h = 23) => Date.UTC(2026, 9, d, h, 0, 30) / 1000;
  const r = await startRelay(fake, { conf: [`STOP_AT=${STOP_AT}`, 'DAILY_CAP=3'], clock: day(21) });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await r.get(boxQuery(otherBox(i)))).status, 200);
    assert.equal((await r.get(boxQuery(otherBox(3)))).status, 429);

    r.setClock(day(20));                          // an NTP step, or a mistyped date
    const back = await r.get(boxQuery(otherBox(4)));
    assert.equal(back.status, 503);
    assert.deepEqual(back.json, { error: 'clock-behind' });
    assert.equal((await r.get('/health')).json.state, 'clock-behind');
    assert.deepEqual(JSON.parse(fs.readFileSync(r.stateFile, 'utf8')), { date: '2026-10-21', count: 3, backoff_until: 0 },
      'the saved day is not rewritten');

    r.setClock(day(21));                          // forward again: the same spent day
    assert.equal((await r.get(boxQuery(otherBox(5)))).status, 429);
    assert.equal(fake.statesCalls, 3, 'no fresh 1500 either way');

    r.setClock(day(22));                          // the real next day
    assert.equal((await r.get(boxQuery(otherBox(6)))).status, 200);
    assert.equal(fake.statesCalls, 4);
  } finally { await r.stop(); await fake.close(); }
});

test('the hourly pacing arithmetic: hour h may have used cap * (h + 1) / 24', NEED_PY, () => {
  const at = (h) => Date.UTC(2026, 9, 20, h, 30, 0) / 1000;
  assert.equal(pyEval(`print(relay.paced_allowance(1500, ${at(0)}))`), '63');
  assert.equal(pyEval(`print(relay.paced_allowance(1500, ${at(11)}))`), '750');
  assert.equal(pyEval(`print(relay.paced_allowance(1500, ${at(23)}))`), '1500');
  assert.equal(pyEval('print(relay.MAX_DAILY_CAP)'), '1500');
  assert.equal(pyEval('print(relay.MAX_FILTER_VALUES)'), '4');
});

test('an unreadable count is a spent day, never zero', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-relay-'));
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'state', 'state.json'), '{"date": "2026-10-20", "count": ');
  const r = await startRelay(fake, { dir, conf: [`STOP_AT=${STOP_AT}`], key: true });
  try {
    const res = await r.get(boxQuery());
    assert.equal(res.status, 503);
    assert.deepEqual(res.json, { error: 'count-unreadable' });
    assert.equal(fake.statesCalls + fake.tokenCalls, 0);
  } finally { await r.stop(); await fake.close(); }
});

// ── OpenSky's own limit, and its refusals ─────────────────────────────────
test('a 429 from OpenSky is obeyed: X-Rate-Limit-Retry-After-Seconds, then Retry-After, across a restart', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  let r = await startRelay(fake);
  try {
    fake.mode = 'rate';
    const first = await r.get(boxQuery(otherBox(0)));
    assert.equal(first.status, 429);
    assert.deepEqual(first.json, { error: 'upstream-429' });
    assert.equal(first.headers['retry-after'], '600');
    assert.equal(fake.statesCalls, 1);
    assert.equal(JSON.parse(fs.readFileSync(r.stateFile, 'utf8')).backoff_until, T0 + 600, 'the wait is saved');
    fake.mode = 'ok';
    const held = await r.get(boxQuery(otherBox(1)));
    assert.equal(held.status, 429);
    assert.deepEqual(held.json, { error: 'upstream-backoff' });

    // a restart (opensky-key, Restart=on-failure, a re-install) still waits
    await r.stop();
    r = await startRelay(fake, { dir: r.dir, clock: T0 + 300 });
    assert.equal((await r.get(boxQuery(otherBox(1)))).status, 429);
    assert.equal((await r.get('/health')).json.state, 'backoff');
    r.setClock(T0 + 599);
    assert.equal((await r.get(boxQuery(otherBox(1)))).status, 429);
    assert.equal(fake.statesCalls, 1, 'nothing goes upstream while OpenSky says wait');
    r.setClock(T0 + 601);
    assert.equal((await r.get(boxQuery(otherBox(1)))).status, 200);
    assert.equal(fake.statesCalls, 2);

    fake.mode = 'rate-ra';
    const ra = await r.get(boxQuery(otherBox(2)));
    assert.equal(ra.status, 429);
    assert.equal(ra.headers['retry-after'], '120');
    fake.mode = 'ok';
    r.setClock(T0 + 601 + 60);
    assert.equal((await r.get(boxQuery(otherBox(3)))).status, 429);
    r.setClock(T0 + 601 + 121);
    assert.equal((await r.get(boxQuery(otherBox(3)))).status, 200);
    assert.equal(fake.statesCalls, 4);
  } finally { await r.stop(); await fake.close(); }
});

test('a refused server (403) holds every call for 10 minutes, an OpenSky error for one, and /health says why', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    fake.mode = 'forbidden';                     // not whitelisted yet
    const no = await r.get(boxQuery(otherBox(0)));
    assert.equal(no.status, 502);
    assert.deepEqual(no.json, { error: 'upstream-403' });
    fake.mode = 'ok';
    for (let i = 1; i < 5; i++) {
      const held = await r.get(boxQuery(otherBox(i)));
      assert.equal(held.status, 503);
      assert.deepEqual(held.json, { error: 'upstream-403-hold' });
    }
    assert.equal(fake.statesCalls, 1, 'one call, not four a minute per box');
    let h = (await r.get('/health')).json;
    assert.equal(h.state, 'hold');
    assert.equal(h.last_error, 'upstream-403');
    assert.equal(h.last_error_at, '2026-10-20T23:00:00Z');
    assert.equal(h.last_ok_at, null);
    r.setClock(T0 + 599);
    assert.equal((await r.get(boxQuery(otherBox(5)))).status, 503);
    r.setClock(T0 + 601);
    assert.equal((await r.get(boxQuery(otherBox(5)))).status, 200);
    h = (await r.get('/health')).json;
    assert.equal(h.last_ok_at, '2026-10-20T23:10:01Z');

    fake.mode = 'unavailable';
    assert.deepEqual((await r.get(boxQuery(otherBox(6)))).json, { error: 'upstream-503' });
    fake.mode = 'ok';
    assert.deepEqual((await r.get(boxQuery(otherBox(7)))).json, { error: 'upstream-503-hold' });
    r.setClock(T0 + 601 + 61);
    assert.equal((await r.get(boxQuery(otherBox(7)))).status, 200);
    assert.equal(fake.statesCalls, 4);
  } finally { await r.stop(); await fake.close(); }
});

// ── the hard stop ─────────────────────────────────────────────────────────
test('HARD STOP: from STOP_AT, 410 and zero upstream calls, not even a login', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake, { clock: STOP_S - 120 });
  try {
    assert.equal((await r.get(boxQuery())).status, 200);
    assert.equal(fake.tokenCalls, 1);
    assert.equal(fake.statesCalls, 1);

    r.setClock(STOP_S);
    const cached = await r.get(boxQuery());
    assert.equal(cached.status, 410, 'not even the cached answer after the stop');
    assert.deepEqual(cached.json, { error: 'stopped' });
    for (let i = 0; i < 5; i++) assert.equal((await r.get(boxQuery(otherBox(i)))).status, 410);
    r.setClock(STOP_S + 7200);                  // the hourly line fires; still nothing
    await sleep(600);
    assert.equal((await r.get(boxQuery(otherBox(9)))).status, 410);
    const h = (await r.get('/health')).json;
    assert.equal(h.stopped, true);
    assert.equal(h.state, 'stopped');
    assert.equal(h.stop_at, STOP_AT);
    assert.equal(h.cache_entries, 0);
    assert.equal(fake.tokenCalls, 1, 'no login after the stop');
    assert.equal(fake.statesCalls, 1, 'no data call after the stop');
    assert.match(r.out, /stopped: latched for 2026-11-12T22:59:59Z/);
  } finally { await r.stop(); await fake.close(); }

  // a relay that starts after the stop never calls at all, login check included
  const fake2 = await fakeOpenSky();
  const r2 = await startRelay(fake2, { clock: STOP_S + 1 });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await r2.get(boxQuery(otherBox(i)))).status, 410);
    const login = await runPyAsync(['--check-login', path.join(r2.dir, 'creds', 'credentials')], r2.env);
    assert.equal(login.status, 3);
    assert.match(login.stdout, /No login test was made/);
    assert.equal(runPy(['--stopped'], r2.env).status, 0);
    assert.equal(fake2.tokenCalls, 0);
    assert.equal(fake2.statesCalls, 0);
  } finally { await r2.stop(); await fake2.close(); }

  // a missing, broken or unclear stop date is a stop, not a licence without end
  for (const conf of [
    ['DAILY_CAP=1500'],
    ['STOP_AT=tomorrow'],
    ['STOP_AT=2026-13-40T99:99:99Z'],
    ['stop_at=2027-06-01T00:00:00Z'],                                    // not the exact key
    [' STOP_AT=2027-06-01T00:00:00Z'],                                   // a leading space
    ['STOP_AT = 2027-06-01T00:00:00Z'],
    [`STOP_AT=${STOP_AT}`, 'STOP_AT=2027-06-01T00:00:00Z'],              // twice
    [`STOP_AT=${STOP_AT}`, ' stop_at=2027-06-01T00:00:00Z'],             // a stray line the shell tools miss
  ]) {
    const fake3 = await fakeOpenSky();
    const r3 = await startRelay(fake3, { conf, clock: T0 });
    try {
      assert.equal((await r3.get(boxQuery())).status, 410, conf.join(' | '));
      assert.equal((await r3.get('/health')).json.state, 'config-missing');
      assert.equal(runPy(['--stopped'], r3.env).status, 0);
      assert.equal(fake3.tokenCalls + fake3.statesCalls, 0);
    } finally { await r3.stop(); await fake3.close(); }
  }
});

test('HARD STOP is latched: a clock set back does not undo it; only a later STOP_AT lifts it', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake, { clock: STOP_S - 60 });
  try {
    assert.equal((await r.get(boxQuery())).status, 200);
    r.setClock(STOP_S + 5);
    assert.equal((await r.get(boxQuery())).status, 410);
    assert.equal(fs.readFileSync(r.marker, 'utf8'), `stopped for ${STOP_AT}\n`, 'the stop is saved');

    r.setClock(STOP_S - 3600);                    // the clock steps back an hour
    for (let i = 0; i < 3; i++) assert.equal((await r.get(boxQuery(otherBox(i)))).status, 410);
    const h = (await r.get('/health')).json;
    assert.equal(h.stopped, true);
    assert.equal(h.stop_latched, true);
    assert.equal(runPy(['--stopped'], r.env).status, 0, 'opensky-key and install.sh see it too');
    const login = await runPyAsync(['--check-login', path.join(r.dir, 'creds', 'credentials')], r.env);
    assert.equal(login.status, 3);
    assert.equal(fake.tokenCalls, 1);
    assert.equal(fake.statesCalls, 1, 'no call after the stop, whatever the clock says');

    // the same date written again does not lift it; a later one (opensky-extend) does
    writeConf(r.dir, [`STOP_AT=${STOP_AT}`, '# rewritten']);
    assert.equal((await r.get(boxQuery())).status, 410);
    writeConf(r.dir, ['STOP_AT=2026-12-12T22:59:59Z']);
    assert.equal((await r.get(boxQuery())).status, 200);
    assert.ok(!fs.existsSync(r.marker), 'the marker goes with the extension');
    assert.equal(fake.statesCalls, 2);
  } finally { await r.stop(); await fake.close(); }

  // a relay restarted with the clock set back still refuses
  const fake2 = await fakeOpenSky();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-relay-'));
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'state', 'stopped'), `stopped for ${STOP_AT}\n`);
  const r2 = await startRelay(fake2, { dir, conf: [`STOP_AT=${STOP_AT}`], key: true, clock: STOP_S - 86400 });
  try {
    assert.equal((await r2.get(boxQuery())).status, 410);
    fs.writeFileSync(path.join(dir, 'state', 'stopped'), 'garbled');
    assert.equal(runPy(['--stopped'], r2.env).status, 0, 'an unreadable marker still means stopped');
    assert.equal(fake2.tokenCalls + fake2.statesCalls, 0);
  } finally { await r2.stop(); await fake2.close(); }
});

test('HARD STOP follows OpenSky\'s clock too: its Date header or the data\'s time past STOP_AT', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake, { clock: T0 });   // this server thinks it is 20 Oct
  try {
    fake.mode = 'late-time';
    const res = await r.get(boxQuery());
    assert.equal(res.status, 410);
    assert.ok(!res.body.includes('c0ffee'), 'the late answer is not passed on');
    assert.ok(fs.existsSync(r.marker));
    fake.mode = 'ok';
    assert.equal((await r.get(boxQuery(otherBox(1)))).status, 410);
    assert.equal(fake.statesCalls, 1);
  } finally { await r.stop(); await fake.close(); }

  const fake2 = await fakeOpenSky();
  const r2 = await startRelay(fake2, { clock: T0 });
  try {
    fake2.date = new Date((STOP_S + 60) * 1000).toUTCString();
    assert.equal((await r2.get(boxQuery())).status, 410, 'the login answer\'s Date stops it before any data call');
    assert.equal(fake2.tokenCalls, 1);
    assert.equal(fake2.statesCalls, 0);
    assert.equal(fs.readFileSync(r2.marker, 'utf8'), `stopped for ${STOP_AT}\n`);
  } finally { await r2.stop(); await fake2.close(); }

  // a Date before the stop changes nothing
  const fake3 = await fakeOpenSky();
  const r3 = await startRelay(fake3, { clock: T0 });
  try {
    fake3.date = new Date((STOP_S - 60) * 1000).toUTCString();
    assert.equal((await r3.get(boxQuery())).status, 200);
  } finally { await r3.stop(); await fake3.close(); }
});

// ── the login ─────────────────────────────────────────────────────────────
test('login: kept in memory, renewed before its 30-minute expiry, and once after a 401', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    assert.equal((await r.get(boxQuery())).status, 200);
    assert.equal(fake.tokenCalls, 1);
    r.setClock(T0 + 121);
    assert.equal((await r.get(boxQuery())).status, 200);
    assert.equal(fake.tokenCalls, 1, 'the token is reused');
    r.setClock(T0 + 1700);                       // past 30 min minus the 2 min margin
    assert.equal((await r.get(boxQuery())).status, 200);
    assert.equal(fake.tokenCalls, 2, 'renewed before it expires');
    assert.equal(fake.statesCalls, 3);

    for (const t of fake.tokens) fake.revoked.add(t);
    r.setClock(T0 + 1900);
    assert.equal((await r.get(boxQuery())).status, 200, 'a 401 brings one new login and one retry');
    assert.equal(fake.tokenCalls, 3);
    assert.equal(fake.statesCalls, 5);

    fake.mode = 'always401';
    r.setClock(T0 + 2100);
    const bad = await r.get(boxQuery());
    assert.equal(bad.status, 502);
    assert.deepEqual(bad.json, { error: 'upstream-401' });
    assert.equal(fake.tokenCalls, 4, 'one fresh login, no more');
    assert.equal(fake.statesCalls, 7, 'one retry, no more');
    // and then 10 minutes of quiet, relay-wide
    for (let i = 0; i < 3; i++) assert.equal((await r.get(boxQuery(otherBox(i)))).status, 503);
    assert.equal(fake.tokenCalls + fake.statesCalls, 11);
  } finally { await r.stop(); await fake.close(); }
});

test('no key saved: 503 and nothing goes upstream', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake, { key: false });
  try {
    const res = await r.get(boxQuery());
    assert.equal(res.status, 503);
    assert.deepEqual(res.json, { error: 'no-key' });
    const h = (await r.get('/health')).json;
    assert.equal(h.key_set, false);
    assert.equal(h.state, 'no-key');
    assert.equal(fake.tokenCalls + fake.statesCalls, 0);
  } finally { await r.stop(); await fake.close(); }
});

test('--check-login makes one login and no data call, and says why it failed', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-login-'));
  fs.mkdirSync(path.join(dir, 'etc'));
  fs.writeFileSync(path.join(dir, 'etc', 'relay.conf'), `STOP_AT=${STOP_AT}\n`);
  fs.writeFileSync(path.join(dir, 'clock'), String(T0));
  const env = baseEnv(fake, { dir, port: 1 });
  try {
    const good = path.join(dir, 'good');
    fs.writeFileSync(good, `client_id=${CLIENT_ID}\nclient_secret=${SECRET}\n`);
    const ok = await runPyAsync(['--check-login', good], env);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout.trim(), 'OpenSky login: OK');
    assert.equal(fake.tokenCalls, 1);
    assert.equal(fake.statesCalls, 0);

    const bad = path.join(dir, 'bad');
    fs.writeFileSync(bad, `client_id=${CLIENT_ID}\nclient_secret=wrong-secret-0000\n`);
    const no = await runPyAsync(['--check-login', bad], env);
    assert.equal(no.status, 1);
    assert.match(no.stdout, /^OpenSky login: try again\. OpenSky did not accept this Client ID and secret \(answer 401\)/);
    assert.ok(!no.stdout.includes('wrong-secret') && !ok.stdout.includes(SECRET.slice(-6)));

    fake.loginMode = '403';
    const wl = await runPyAsync(['--check-login', good], env);
    assert.equal(wl.status, 5);
    assert.match(wl.stdout, /refused \(answer 403\)\. The key is saved\. Ask OpenSky whether this server's IPv4 is whitelisted\./);
    fake.loginMode = '503';
    const down = await runPyAsync(['--check-login', good], env);
    assert.equal(down.status, 6);
    assert.match(down.stdout, /OpenSky answered 503 \(a problem on its side\)/);
    fake.loginMode = 'ok';

    const none = await runPyAsync(['--check-login', path.join(dir, 'missing')], env);
    assert.equal(none.status, 4);
    assert.equal(fake.tokenCalls, 4);
    assert.equal(fake.statesCalls, 0);
  } finally { await fake.close(); }
});

// ── bad answers ───────────────────────────────────────────────────────────
test('bad upstream answers are a 502, never a crash', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    let i = 0;
    for (const mode of ['badjson', 'html500', 'states-string']) {
      fake.mode = mode;
      r.setClock(T0 + i * 100);                  // past the minute's hold after the 500
      const res = await r.get(boxQuery(otherBox(i++)));
      assert.equal(res.status, 502, mode);
      assert.ok(res.json && typeof res.json.error === 'string', mode);
    }
    fake.mode = 'states-null';
    r.setClock(T0 + i * 100);
    const empty = await r.get(boxQuery(otherBox(i++)));
    assert.equal(empty.status, 200);
    assert.equal(empty.json.count, 0);
    assert.equal((await r.get('/health')).status, 200);
    assert.equal(r.child.exitCode, null, 'still running');
    assert.ok(!/Traceback/.test(r.out), 'no traceback in the log');
  } finally { await r.stop(); await fake.close(); }
});

// ── the network ───────────────────────────────────────────────────────────
test('IPv4 only on the way out: AF_INET resolution, an IPv4 source, no IPv6 socket', NEED_PY, async () => {
  assert.match(RELAY_SRC, /socket\.getaddrinfo\(host, port, socket\.AF_INET, socket\.SOCK_STREAM\)/);
  assert.match(RELAY_SRC, /socket\.socket\(socket\.AF_INET, socktype, proto\)/);
  assert.doesNotMatch(RELAY_SRC, /\.bind\(/, 'no bind on the way out: an AF_INET socket only has an IPv4 source');
  assert.doesNotMatch(RELAY_SRC, /AF_INET6|AF_UNSPEC|create_connection|urllib\.request|urlopen/,
    'no dual-stack helper anywhere');
  assert.match(INSTALL_SRC, /^RestrictAddressFamilies=AF_INET AF_UNIX AF_NETLINK$/m,
    'the unit cannot open an IPv6 socket at all');
  const fams = pyEval("import socket; print(sorted({int(i[0]) for i in relay.resolve_ipv4('localhost', 443)}) == [int(socket.AF_INET)])");
  assert.equal(fams, 'True', 'localhost resolves to IPv4 addresses only');

  // an upstream that exists only on IPv6 is never reached
  let fake6;
  try { fake6 = await fakeOpenSky('::1'); } catch (e) { return; }   // no IPv6 loopback here
  const r = await startRelay(fake6);
  try {
    const res = await r.get(boxQuery());
    assert.ok(res.status === 502 || res.status === 504, 'unreachable over IPv4: ' + res.status);
    assert.equal(fake6.tokenCalls + fake6.statesCalls, 0);
  } finally { await r.stop(); await fake6.close(); }
});

test('listens on 127.0.0.1 only', NEED_PY, async () => {
  assert.match(RELAY_SRC, /^LISTEN_HOST = '127\.0\.0\.1'/m);
  assert.match(RELAY_SRC, /^LISTEN_PORT = 8787$/m);
  assert.match(RELAY_SRC, /Server\(\(LISTEN_HOST, rt\['port'\]\), Handler\)/);
  assert.doesNotMatch(RELAY_SRC, /OSKY_TEST_HOST|LISTEN_HOST = (?!'127\.0\.0\.1')/, 'the bind address is never configurable');
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  const refused = (host) => new Promise((resolve) => {
    const s = net.connect({ host, port: r.port });
    s.on('connect', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(true));
    s.setTimeout(2000, () => { s.destroy(); resolve(true); });
  });
  try {
    assert.equal((await r.get('/health')).status, 200);
    const lan = Object.values(os.networkInterfaces()).flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
    for (const addr of lan.slice(0, 3)) assert.equal(await refused(addr), true, 'refused on ' + addr);
    assert.equal(await refused('::1'), true, 'refused on IPv6 loopback');
  } finally { await r.stop(); await fake.close(); }
});

test('test mode only points at loopback, never as root, never at the production state, and the real endpoints are the documented ones', NEED_PY, () => {
  assert.match(RELAY_SRC, /^TOKEN_URL = 'https:\/\/auth\.opensky-network\.org\/auth\/realms\/opensky-network\/protocol\/openid-connect\/token'$/m);
  assert.match(RELAY_SRC, /^API_BASE = 'https:\/\/opensky-network\.org\/api'$/m);
  assert.match(RELAY_SRC, /^STATE_DIR = '\/var\/lib\/opensky-relay'/m);
  const env = {
    PATH: process.env.PATH, OSKY_TEST_MODE: '1',
    OSKY_TEST_TOKEN_URL: 'https://example.org/token', OSKY_TEST_API_BASE: 'http://127.0.0.1:9/api',
  };
  const r = runPy(['--stopped'], env);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /loopback/);
  const prod = runPy(['--stopped'], { ...env, OSKY_TEST_TOKEN_URL: 'http://127.0.0.1:9/t', OSKY_PRODUCTION: '1' });
  assert.equal(prod.status, 2, 'test mode refuses to run under the production unit');
  assert.match(INSTALL_SRC, /^Environment=OSKY_PRODUCTION=1$/m);
  assert.match(INSTALL_SRC, /^UnsetEnvironment=OSKY_TEST_MODE /m);
  // every override sits behind TEST_MODE
  const runtime = RELAY_SRC.slice(RELAY_SRC.indexOf('def load_runtime'), RELAY_SRC.indexOf('def make_clock'));
  assert.ok(runtime.indexOf('if not TEST_MODE:') < runtime.indexOf("os.environ.get('OSKY_TEST_"));
  assert.equal(pyEval("import os; os.environ.pop('STATE_DIRECTORY', None); relay.TEST_MODE = True; os.environ.update(OSKY_TEST_TOKEN_URL='http://127.0.0.1:9/t', OSKY_TEST_API_BASE='http://127.0.0.1:9/a'); print(relay.load_runtime()['state_dir'])"),
    'None', 'test mode never falls back to the production state directory');
});

// ── the logs ──────────────────────────────────────────────────────────────
test('logs carry counts only: no secret, token, caller key, coordinate, callsign or icao24', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    await r.get(boxQuery(BOX, '&callsign=ACA123'));
    await r.get(boxQuery(BOX, '&icao24=c0ffee'));
    await r.get('/states?lamin=45.6789&lomin=-66.4321&lamax=99&lomax=-63.2109' + FLIGHT);
    fake.mode = 'badjson';
    await r.get(boxQuery(otherBox(7)));
    r.setClock(T0 + 3700);                      // a new hour: one line of counts
    for (let i = 0; i < 40 && !/hour=/.test(r.out); i++) await sleep(100);
    const health = (await r.get('/health')).body;
    await r.stop();
    const out = r.out;
    assert.match(out, /^opensky-relay hour=2026-10-20T23Z requests=4 cache_hits=1 shared=0 upstream=2 tokens=1 refused=1 errors=1 today=2\/1500 last_error=bad-json$/m);
    assert.match(out, /^opensky-relay start: listening 127\.0\.0\.1:\d+, key set: yes, caller key set: yes, stop 2026-11-12T22:59:59Z/m);
    for (const text of [out, health]) {
      for (let i = 0; i + 4 <= SECRET.length; i++) {
        assert.ok(!text.includes(SECRET.slice(i, i + 4)), 'no part of the secret');
      }
      for (const v of [CLIENT_ID, CALLER_KEY.slice(0, 9), 'fake-access-token', '45.6789', '-66.4321', '47.1234', '-63.2109',
        '46.1123', '-64.6789', 'ACA123', 'POE456', 'c0ffee', 'abc123', '/states?', 'lamin', 'Traceback']) {
        assert.ok(!text.includes(v), v + ' must not be logged or reported');
      }
    }
    const lines = out.trim().split('\n');
    assert.ok(lines.length <= 3, 'start, one hour line, exit: ' + lines.length);
  } finally { await r.stop(); await fake.close(); }
});

test('/health: counts, the stop date, the key flags, the last OpenSky answer and the public IPv4, nothing else', NEED_PY, async () => {
  const fake = await fakeOpenSky();
  const r = await startRelay(fake);
  try {
    fs.writeFileSync(path.join(r.dir, 'etc', 'public-ipv4'), '192.0.2.10\n');
    await r.get(boxQuery());
    const h = (await r.get('/health')).json;
    assert.deepEqual(Object.keys(h).sort(), ['backoff_seconds', 'cache_entries', 'cache_seconds', 'caller_key_set',
      'calls_today', 'cap', 'date', 'heading', 'hold_seconds', 'key_set', 'last_error', 'last_error_at', 'last_ok_at',
      'logged_in', 'on', 'paced_allowance_now', 'public_ipv4', 'service', 'state', 'stop_at', 'stop_latched',
      'stopped', 'this_hour'].sort());
    assert.equal(h.public_ipv4, '192.0.2.10');
    assert.equal(h.key_set, true);
    assert.equal(h.caller_key_set, true);
    assert.equal(h.calls_today, 1);
    assert.equal(h.stop_at, STOP_AT);
    assert.equal(h.stop_latched, false);
    assert.equal(h.state, 'ready');
    assert.equal(h.last_ok_at, '2026-10-20T23:00:00Z');
    assert.equal(h.last_error, null);
    fs.writeFileSync(path.join(r.dir, 'etc', 'public-ipv4'), 'not an address\n');
    assert.equal((await r.get('/health')).json.public_ipv4, null);
  } finally { await r.stop(); await fake.close(); }
});

// ── the installer ─────────────────────────────────────────────────────────
function embedded(name) {
  const open = INSTALL_SRC.indexOf(`cat > ${name} <<'EOF'\n`);
  assert.ok(open >= 0, name + ' is written by install.sh');
  const start = INSTALL_SRC.indexOf('\n', open) + 1;
  return INSTALL_SRC.slice(start, INSTALL_SRC.indexOf('\nEOF\n', start) + 1);
}
const COMMANDS = ['opensky-key', 'opensky-status', 'opensky-extend', 'opensky-caller-key', 'opensky-update'];
const COMMON = '/usr/local/lib/opensky-relay/common.sh';
const UNIT = () => embedded('/etc/systemd/system/opensky-relay.service');
const unitLine = (line) => new RegExp('^' + line.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '$', 'm');

test('install.sh: parses, and so does every command it writes', () => {
  assert.ok(!INSTALL_SRC.includes('\r'), 'no CR: bash would reject the first line');
  assert.ok(INSTALL_SRC.startsWith('#!/usr/bin/env bash\n'));
  assert.match(INSTALL_SRC, /\nmain "\$@"\n$/, 'one call to main at the very end, so a cut-off download runs nothing');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-sh-'));
  const files = { 'install.sh': INSTALL_SRC, 'common.sh': embedded(COMMON) };
  for (const n of COMMANDS) files[n] = embedded('/usr/local/bin/' + n);
  for (const [n, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(tmp, n), body);
    const r = spawnSync('bash', ['-n', path.join(tmp, n)], { encoding: 'utf8' });
    assert.equal(r.status, 0, n + ': ' + r.stderr);
  }
  // opensky-status's Python, as written onto the server, compiles
  const status = embedded('/usr/local/bin/opensky-status');
  const py = status.slice(status.indexOf("-I -c '\n") + 8, status.indexOf("\n' \"$health\""));
  if (PY) {
    const c = spawnSync(PY, ['-I', '-c', 'import sys; compile(sys.stdin.read(), "status", "exec")'], { input: py, encoding: 'utf8' });
    assert.equal(c.status, 0, c.stderr);
  }
});

test('install.sh: installs only the relay.py whose SHA-256 it pins', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(RELAY)).digest('hex');
  const m = INSTALL_SRC.match(/local RELAY_SHA256="([0-9a-f]{64})"/);
  assert.ok(m, 'install.sh pins a SHA-256');
  assert.equal(m[1], sha, 'relay.py changed: put its new SHA-256 into install.sh (shasum -a 256 stream-server/opensky-relay/relay.py)');
  assert.match(INSTALL_SRC, /got="\$\(sha256sum "\$tmp" \| cut -d ' ' -f 1\)"/);
  assert.match(INSTALL_SRC, /if \[ "\$got" != "\$want" \]; then/);
  assert.doesNotMatch(INSTALL_SRC, /install -m 0644 -o root -g root "\$tmp" "\$OSKY_RELAY"[\s\S]*got="\$\(sha256sum/,
    'the check comes before the install');
});

test('install.sh: hardened unit, the secrets via LoadCredential from 0600 root files, and a stop timer', () => {
  const unit = UNIT();
  for (const line of [
    'LoadCredential=credentials:/etc/opensky-relay/credentials',
    'LoadCredential=caller-key:/etc/opensky-relay/caller-key',
    'DynamicUser=yes', 'ProtectSystem=strict', 'NoNewPrivileges=yes', 'ProtectHome=yes', 'PrivateTmp=yes',
    'ProtectProc=invisible', 'CapabilityBoundingSet=', 'ExecStart=/usr/bin/python3 -I /opt/opensky-relay/relay.py',
    'StateDirectory=opensky-relay',
    // the metadata service (the Cloud config, tunnel token included) is out of reach; loopback is not
    'IPAddressDeny=link-local',
    'LimitCORE=0',
  ]) assert.match(unit, unitLine(line), line);
  assert.doesNotMatch(unit, /IPAddressDeny=.*(localhost|any|127\.)/, 'the listener needs loopback');
  const hidden = unit.match(/^InaccessiblePaths=(.*)$/m);
  assert.ok(hidden, 'InaccessiblePaths is set');
  for (const p of ['/etc/systemd/system/cloudflared.service', '/etc/cloudflared', '/var/lib/cloud', '/run/dbus']) {
    assert.ok(hidden[1].split(' ').includes('-' + p), p + ' is out of the relay\'s sight (and optional)');
  }
  // 0600, root only, before anything is written into it
  assert.match(INSTALL_SRC, /install -m 0600 -o root -g root \/dev\/null "\$OSKY_CRED"/);
  assert.match(INSTALL_SRC, /chmod 0600 "\$OSKY_CRED"/);
  assert.match(INSTALL_SRC, /chmod 0600 "\$OSKY_CALLER"/);
  assert.match(INSTALL_SRC, /secrets\.choice/, 'the caller key is random');
  const key = embedded('/usr/local/bin/opensky-key');
  assert.match(key, /umask 077/);
  assert.match(key, /chmod 0600 "\$tmp"/);
  assert.match(key, /read -r -s -p "Client secret/, 'the secret is read hidden');
  assert.match(key, /\$\{#secret\} characters, ends in \.\.\.\$\{secret: -4\}/, 'only its length and last 4 characters are shown');
  assert.match(key, /--check-login "\$OSKY_CRED"/, 'one login test, no data call');
  assert.match(key, /\[ ! -t 0 \]/, 'typed on the server, never scripted');
  // the stop timer turns the relay off at STOP_AT
  assert.match(INSTALL_SRC, /local DEFAULT_STOP_AT="2026-11-12T22:59:59Z"/);
  assert.match(INSTALL_SRC, /^OnCalendar=\$when$/m);
  assert.match(INSTALL_SRC, /^Persistent=true$/m);
  assert.match(INSTALL_SRC, /^Unit=opensky-relay-stop\.service$/m);
  assert.match(INSTALL_SRC, /^ExecStart=\/usr\/bin\/systemctl disable --now opensky-relay\.service$/m);
  assert.match(INSTALL_SRC, /systemctl enable opensky-relay-stop\.timer >\/dev\/null\n/);
  // the stop date: kept on a re-run, moved only by opensky-extend on a terminal, with a yes, within 40 days
  assert.doesNotMatch(INSTALL_SRC, /STOP_AT="?\$\{STOP_AT/, 'no environment override of the stop date');
  const ext = embedded('/usr/local/bin/opensky-extend');
  assert.match(ext, /\[ ! -t 0 \]/);
  assert.match(ext, /read -r -p "Type yes to move the stop date: " answer/);
  assert.match(ext, /new="\$\(osky_swiss_day_end "\$day"\)"/);
  assert.match(ext, /^MAX_DAYS=40 /m);
  assert.match(ext, /\[ "\$days" -gt "\$MAX_DAYS" \]/);
  assert.match(ext, /rm -f "\$OSKY_STOP_MARKER"/, 'the extension lifts a latched stop');
  assert.match(ext, /osky_conf_without_stop > "\$tmp"/, 'every spelling of the old STOP_AT goes');
  // the status command
  const status = embedded('/usr/local/bin/opensky-status');
  assert.match(embedded(COMMON), /curl -4 -fsS --max-time 10 https:\/\/cloudflare\.com\/cdn-cgi\/trace/);
  assert.match(status, /systemctl is-active cloudflared\.service/);
  assert.match(status, /Last OpenSky problem/);
  assert.match(status, /whether this IPv4 is whitelisted/);
  assert.match(embedded(COMMON), /TZ=Europe\/Zurich date/);
  assert.match(embedded(COMMON), /TZ=America\/Moncton date/);
  // cloudflared from Cloudflare's own repository, and nothing let in
  assert.match(INSTALL_SRC, /curl -fsSL --retry 3 https:\/\/pkg\.cloudflare\.com\/cloudflare-main\.gpg/);
  assert.match(INSTALL_SRC, /deb \[signed-by=\/usr\/share\/keyrings\/cloudflare-main\.gpg\] https:\/\/pkg\.cloudflare\.com\/cloudflared any main/);
  assert.match(INSTALL_SRC, /ufw default deny incoming/);
  assert.doesNotMatch(INSTALL_SRC, /ufw allow/, 'nothing is allowed in');
  // cloud-init: root, no terminal, nothing read from stdin; apt retried while busy
  assert.match(INSTALL_SRC, /apt-get -o DPkg::Lock::Timeout=600 -y -q "\$@" <\/dev\/null/);
  assert.match(INSTALL_SRC, /for i in \$\(seq 1 30\); do/);
  assert.doesNotMatch(INSTALL_SRC.slice(0, INSTALL_SRC.indexOf('write_commands() {')), /\bread -r/,
    'the installer itself never waits for input');
  // a failure says where it stopped, never a silent end
  assert.match(INSTALL_SRC, /^set -eEuo pipefail$/m);
  assert.match(INSTALL_SRC, /^trap 'echo "OpenSky relay install stopped at line \$LINENO\./m);
  const main = INSTALL_SRC.slice(INSTALL_SRC.indexOf('main() {'), INSTALL_SRC.indexOf('\n}\n', INSTALL_SRC.indexOf('main() {')));
  assert.doesNotMatch(main, /systemctl enable [^|\n]*2>&1(?! \|\| true)/, 'no enable with its error hidden');
  assert.ok(main.indexOf('write_commands') < main.indexOf('install_cloudflared'), 'opensky-update exists before anything can fail');
  // opensky-update fetches over https
  assert.match(embedded(COMMON), /^OSKY_INSTALLER_URL=https:\/\/fids\.orionconnected\.com\/o$/m);
  assert.match(embedded('/usr/local/bin/opensky-update'), /curl -fsSL --retry 3 -o \/root\/o\.new "\$OSKY_INSTALLER_URL"/);
});

test('no secret, address or OpenSky call in the relay files', () => {
  for (const [name, src] of [['install.sh', INSTALL_SRC], ['relay.py', RELAY_SRC], ['README.md', README_SRC]]) {
    assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{16,}/, name + ': no tunnel token');
    for (const m of src.matchAll(/client_secret=([^\s'"\\]*)/g)) {
      assert.ok(['', '%s', '.+'].includes(m[1]), name + ': client_secret=' + m[1]);
    }
    const ips = [...src.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g)].map((m) => m[1])
      .filter((ip) => ip !== '127.0.0.1');
    assert.deepEqual(ips, [], name + ': no IP address but loopback');
    assert.ok(!src.includes(CALLER_KEY), name + ': no caller key');
  }
  assert.doesNotMatch(INSTALL_SRC, /opensky-network/i, 'the installer never calls OpenSky');
});

test('the console and Cloud config lines: short typed commands, https for every download', () => {
  const typed = [...README_SRC.matchAll(/`((?:opensky-|wget |bash )[^`]*)`/g)].map((m) => m[1]);
  const block = README_SRC.match(/started\. Type these two lines instead:\n\n```\n([\s\S]*?)```/);
  assert.ok(block, 'the README has the fallback console lines');
  const fallback = block[1].trim().split('\n');
  assert.deepEqual(fallback, ['wget -O o https://fids.orionconnected.com/o', 'bash o'],
    'https, and -O o so a second download never runs an old copy');
  for (const c of COMMANDS.filter((c) => c !== 'opensky-caller-key')) assert.ok(typed.includes(c), c);
  for (const c of typed) assert.ok(c.length <= 32, c);
  for (const c of fallback) assert.ok(INSTALL_SRC.includes('#        ' + c), c);
  assert.doesNotMatch(README_SRC + INSTALL_SRC, /wget fids\.orionconnected\.com|http:\/\/fids/, 'never plain http');
  // the Cloud config: the tunnel line runs only after a complete install
  const cloud = README_SRC.match(/```\n\s*(#!\/bin\/bash\n[\s\S]*?)```/);
  assert.ok(cloud);
  assert.deepEqual(cloud[1].trim().split('\n').map((l) => l.trim()), [
    '#!/bin/bash',
    'curl -fsSL --retry 5 -o /root/o https://fids.orionconnected.com/o',
    'bash /root/o || exit 1',
    'sudo cloudflared service install <the token from A7>',
  ]);
  for (const l of cloud[1].trim().split('\n').slice(0, 3)) assert.ok(INSTALL_SRC.includes('#        ' + l.trim()), l);
  assert.match(README_SRC, /Never add anything else to this tunnel\.\*\* No \*\*Public hostname\*\*/);
  assert.match(README_SRC, /untick every key that is ticked/);
});

test('the shared shell helpers: the stop date the way the relay reads it, the timer and the IPv4 check', NEED_PY, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-common-'));
  fs.writeFileSync(path.join(tmp, 'common.sh'), embedded(COMMON));
  const sh = (conf, body, env = {}) => {
    fs.writeFileSync(path.join(tmp, 'relay.conf'), conf);
    const r = spawnSync('bash', ['-c', `set -euo pipefail; . "${tmp}/common.sh"; OSKY_CONF="${tmp}/relay.conf"; OSKY_TIMER="${tmp}/timer"; ${body}`],
      { encoding: 'utf8', env: { ...process.env, ...env } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const stop = (conf) => sh(conf, 'printf "[%s]" "$(osky_stop_at)"');
  const relayStop = (conf) => {
    fs.writeFileSync(path.join(tmp, 'relay.conf'), conf);
    return pyEval(`relay.TEST_MODE = True; print('[%s]' % (relay.read_settings(${JSON.stringify(tmp)})['stop_iso'] or ''))`);
  };
  // the shell and the relay see the same stop date, or both see none
  for (const [conf, want] of [
    ['# settings\nSTOP_AT="2026-11-12T22:59:59Z"\nHEADING=0\n', '2026-11-12T22:59:59Z'],
    ["STOP_AT='2026-11-12T22:59:59Z'\r\n", '2026-11-12T22:59:59Z'],
    ['STOP_AT=2026-11-12T22:59:59Z  \n', '2026-11-12T22:59:59Z'],
    ['STOP_AT=2026-11-12T22:59:59Z\n stop_at=2027-06-01T00:00:00Z\n', ''],
    ['STOP_AT=2026-11-12T22:59:59Z\nSTOP_AT=2027-06-01T00:00:00Z\n', ''],
    ['stop_at=2026-11-12T22:59:59Z\n', ''],
    ['STOP_AT = 2026-11-12T22:59:59Z\n', ''],
    ['#STOP_AT=2027-06-01T00:00:00Z\nSTOP_AT=2026-11-12T22:59:59Z\n', '2026-11-12T22:59:59Z'],
    ['HEADING=1\n', ''],
  ]) {
    assert.equal(stop(conf), `[${want}]`, JSON.stringify(conf));
    assert.equal(relayStop(conf), `[${want}]`, 'relay: ' + JSON.stringify(conf));
  }
  // a rewrite drops every spelling of STOP_AT and keeps the rest
  assert.equal(sh('DAILY_CAP=5\n stop_at=x\nSTOP_AT=y\n#c\n', 'osky_conf_without_stop'), 'DAILY_CAP=5\n#c\n');
  const out = sh('STOP_AT=2026-11-12T22:59:59Z\n', `s="$(osky_stop_at)"
    osky_valid_stop "$s" && echo valid
    osky_valid_stop "2026-11-12" || echo short-refused
    osky_valid_stop "" || echo empty-refused
    osky_write_timer "$s"; cat "$OSKY_TIMER"`);
  assert.match(out, /^valid$/m);
  assert.match(out, /^short-refused$/m);
  assert.match(out, /^empty-refused$/m);
  assert.match(out, /^OnCalendar=2026-11-12 22:59:59 UTC$/m);
  assert.match(out, /^Persistent=true$/m);

  // the public IPv4, from a stand-in curl
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nprintf "fl=1\\nip=%s\\nts=1\\n" "$FAKE_IP"\n', { mode: 0o755 });
  const ipv4 = (ip) => sh('', 'osky_public_ipv4 || echo none', { FAKE_IP: ip, PATH: bin + ':' + process.env.PATH }).trim();
  assert.equal(ipv4('192.0.2.7'), '192.0.2.7');
  for (const bad of ['2001:db8::7', '192.0.2', '192.0.2.256', '999.1.1.1', 'garbage', '']) assert.equal(ipv4(bad), 'none', bad);
});

test('the GNU date code that runs on the server: Swiss end of day across the clock change, and the stop shown', NEED_GNU_DATE, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-date-'));
  fs.writeFileSync(path.join(tmp, 'common.sh'), embedded(COMMON));
  const sh = (body) => {
    const r = spawnSync('bash', ['-c', `. "${tmp}/common.sh"; ${body}`], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  for (const [day, want] of [
    ['2026-11-12', '2026-11-12T22:59:59Z'],    // the term's end, CET
    ['2026-10-24', '2026-10-24T21:59:59Z'],    // the last day of summer time, CEST
    ['2026-10-25', '2026-10-25T22:59:59Z'],    // the change itself: 23:59 is CET again
    ['2026-11-01', '2026-11-01T22:59:59Z'],
    ['2027-07-01', '2027-07-01T21:59:59Z'],    // summer
    ['2026-02-30', ''],                        // not a date
  ]) assert.equal(sh(`osky_swiss_day_end ${day}`), want, day);
  const shown = sh('osky_show_time 2026-11-12T22:59:59Z');
  assert.match(shown, /Thu 12 Nov 2026, 23:59:59 CET  \(Swiss time\)/);
  assert.match(shown, /Thu 12 Nov 2026, 18:59:59 AST  \(Moncton time\)/);
  assert.equal(sh('osky_show_time ""'), '(no stop date saved)', 'GNU date reads "" as midnight today: never shown');
  assert.equal(sh('osky_show_time 2026-13-40T99:99:99Z'), '(no stop date saved)');
});

// ── the /o short link ─────────────────────────────────────────────────────
test('fids.orionconnected.com/o serves install.sh, like /s and /t', async () => {
  const at = WORKER.indexOf('const STREAM_INSTALLERS = {');
  assert.ok(at >= 0);
  const ifAt = WORKER.indexOf('if (STREAM_INSTALLERS[path]) {', at);
  let i = WORKER.indexOf('{', ifAt), depth = 0;
  for (; i < WORKER.length; i++) {
    if (WORKER[i] === '{') depth++;
    else if (WORKER[i] === '}' && --depth === 0) break;
  }
  const block = WORKER.slice(at, i + 1);
  const AsyncFunction = (async () => {}).constructor;
  const route = new AsyncFunction('path', 'fetch', 'Response', 'NO_STORE', block + '\nreturn null;');
  const RAW = 'https://raw.githubusercontent.com/liloleblanc/orionconnected/main/';
  const seen = [];
  const fakeFetch = async (src) => {
    seen.push(src);
    assert.ok(src.startsWith(RAW), 'served from the repository main branch: ' + src);
    const file = path.join(ROOT, src.slice(RAW.length));
    if (!fs.existsSync(file)) return new Response('missing', { status: 404 });
    // a CRLF copy, to prove the route hands out runnable LF either way
    return new Response(fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'), { status: 200 });
  };
  const NO_STORE = { 'Cache-Control': 'no-store' };
  const res = await route('/o', fakeFetch, Response, NO_STORE);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(await res.text(), INSTALL_SRC);
  assert.deepEqual(seen, [RAW + 'stream-server/opensky-relay/install.sh']);
  for (const p of ['/s', '/t']) assert.equal((await route(p, fakeFetch, Response, NO_STORE)).status, 200, p);
  assert.equal(await route('/x', fakeFetch, Response, NO_STORE), null);
  // the relay script install.sh downloads is on main too, at the path it names
  assert.match(INSTALL_SRC, /RELAY_URL="https:\/\/raw\.githubusercontent\.com\/liloleblanc\/orionconnected\/main\/stream-server\/opensky-relay\/relay\.py"/);
});
