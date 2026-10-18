'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE OPENSKY RELAY, PULL DESIGN (stream-server/opensky-relay/ and the
// Worker's /osky/* routes in workers/fids-proxy.js).
//
// OpenSky whitelists the one address its paid account calls from, and a
// Cloudflare Worker has no fixed address. So a small server with a fixed IPv4
// makes every OpenSky call, and it only ever calls OUT: to OpenSky, and to the
// Worker, which it polls. No tunnel, no open port, no token to copy. The
// licence is narrow (live positions for the aircraft of the flights being
// shown, small boxes, a short-lived shared cache, a term that ends), and each
// limit is tested here:
//
//   The Worker
//   · the address PIN (Worker secret OSKY_RELAY_IPV4): only that address can
//     register or use a locked route; no pin, no registration; a stranger on
//     Hetzner's network gets nothing, before or after our relay registers
//   · /osky/register: Hetzner's network, an IPv4, a JSON body; a failed KV
//     read is a 503, never "nobody registered"
//   · every other route but /osky/status: the pinned address AND the relay
//     key, or one uniform 403
//   · OFF until OPENSKY_ON is exactly "1"; the hard stop (OSKY_STOP_AT) is a
//     410 on every route
//   · the OpenSky client from Worker secrets, never logged
//   · /osky/put: a wanted box only, the wanted flights only, known fields
//     only, checked; kept 180 s under osky:pos:* and nowhere else
//   · the heartbeat's report written on a change or every 10 minutes only
//   · /osky/status: public, counts and yes/no only, never the address
//   · no CORS and no caching anywhere under /osky/
//
//   The relay (relay.py against the real Worker code behind a loopback
//   server, and a fake OpenSky; nothing here reaches OpenSky or Cloudflare)
//   · register, heartbeat, creds, wanted, one OpenSky call, put
//   · OFF: nothing goes to OpenSky; no pin: nothing but a retry a minute
//   · identical boxes share one call for 120 s; a failed put is retried
//   · nothing to OpenSky while the Worker cannot answer
//   · 1500 calls per UTC day (paced), counted on disk before each call, the
//     day only moving forward
//   · OpenSky's 429 obeyed across a restart
//   · the HARD STOP at its own stop date, latched on disk; the Worker's
//     earlier date or a 410 stops it FOR NOW (a corrected date resumes it);
//     a later Worker date (40 days at most) moves its own stop
//   · IPv4 only, a User-Agent Cloudflare lets through, no payload in logs
//
//   The installer: parses, pins relay.py's SHA-256 and retries a stale
//   download, keeps saved settings on a re-run, no tunnel, a hardened unit
//   with the relay key via LoadCredential, no crash reports, a stop timer,
//   ufw.
//
// Skips the relay cases cleanly where python3 is missing, unless
// OSKY_RELAY_REQUIRE_PY names the version that must run them (CI: 3.12, the
// server's Python).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'stream-server', 'opensky-relay');
const RELAY = path.join(DIR, 'relay.py');
const INSTALL = path.join(DIR, 'install.sh');
const README = path.join(DIR, 'README.md');
const RELAY_SRC = fs.readFileSync(RELAY, 'utf8');
const INSTALL_SRC = fs.readFileSync(INSTALL, 'utf8');
const README_SRC = fs.readFileSync(README, 'utf8');
const WORKER_PATH = path.join(ROOT, 'workers', 'fids-proxy.js');
const WORKER_SRC = fs.readFileSync(WORKER_PATH, 'utf8');
const ENTRY = fs.readFileSync(path.join(ROOT, 'worker-entry.js'), 'utf8');
const WRANGLER = fs.readFileSync(path.join(ROOT, 'workers', 'wrangler.fids-proxy.jsonc'), 'utf8');

// The fids-proxy Worker's own host, the one the relay polls (written once here).
const WORKER_HOST = 'fids-proxy.n-leblanc1984.workers.dev';
const WORKER_URL = 'https://' + WORKER_HOST;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// The Cloud config's second line (the first is #!/bin/bash).
const CLOUD_LINE = 'curl -fsSL --retry 10 --retry-all-errors --retry-delay 15 -o /root/o https://raw.githubusercontent.com/liloleblanc/orionconnected/main/stream-server/opensky-relay/install.sh && bash /root/o';

const PY = (() => {
  const r = spawnSync('python3', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? 'python3' : null;
})();
const NEED_PY = PY ? {} : { skip: 'python3 is not installed' };
// every relay case has a time limit: a relay that never exits fails, never hangs the suite
const PYT = { ...NEED_PY, timeout: 90000 };
const GNU_DATE = spawnSync('date', ['--version'], { encoding: 'utf8' }).status === 0;
const NEED_GNU_DATE = GNU_DATE ? {} : { skip: 'GNU date is not installed (the server and CI have it)' };

test('the Python that runs the relay is the one asked for', { skip: !process.env.OSKY_RELAY_REQUIRE_PY }, () => {
  assert.ok(PY, 'python3 is required here');
  const v = spawnSync(PY, ['--version'], { encoding: 'utf8' });
  assert.match((v.stdout || v.stderr).trim(), new RegExp('^Python ' + process.env.OSKY_RELAY_REQUIRE_PY.replace('.', '\\.') + '\\.'));
});

// Test values only. Derived from fixed labels rather than written out, so no
// credential-shaped string sits in the repository.
const testValue = (label) => crypto.createHash('sha256').update('opensky-relay-test:' + label).digest('base64').replace(/[^A-Za-z0-9]/g, '');
const CLIENT_ID = 'relay-test-client';
const SECRET = testValue('client-secret').slice(0, 20);
const RELAY_KEY = (testValue('relay-key') + testValue('relay-key-2')).slice(0, 43);
const OTHER_KEY = (testValue('other-relay-key') + testValue('other-relay-key-2')).slice(0, 43);
const IP = '192.0.2.44';            // documentation range (RFC 5737)
const IP2 = '198.51.100.7';
const HETZNER = 24940;

const STOP_AT = '2026-11-12T22:59:59Z';                    // 12 Nov 2026, 23:59:59 Swiss time
const STOP_MS = Date.UTC(2026, 10, 12, 22, 59, 59);
const STOP_S = STOP_MS / 1000;
const FAR_STOP = '2099-11-12T22:59:59Z';
const T0 = Date.UTC(2026, 9, 20, 23, 0, 0) / 1000;        // 23:00Z: the whole day's cap is open
const nowS = () => Math.floor(Date.now() / 1000);
const isoS = (s) => new Date(s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

// A box near Moncton, with values distinctive enough to search the logs for.
const BOX = { lamin: 45.6789, lomin: -66.4321, lamax: 47.1234, lomax: -63.2109 };
const otherBox = (i) => ({ lamin: 40 + i * 0.5, lomin: -70, lamax: 41 + i * 0.5, lomax: -68 });

// OpenSky's state vector order: icao24, callsign, origin_country,
// time_position, last_contact, longitude, latitude, baro_altitude, on_ground,
// velocity, true_track, vertical_rate, sensors, geo_altitude, squawk, spi,
// position_source, category. Times are real (the Worker checks them).
function osRows(box = BOX) {
  const t = nowS() - 5;
  const lat = (box.lamin + box.lamax) / 2, lon = (box.lomin + box.lomax) / 2;
  return [
    ['c0ffee', 'ACA123  ', 'Canada', t, t + 1, lon + 0.0123, lat + 0.0456, 1234.5, false, 210.5, 87.25, -3.25, null, 1300.1, '6123', false, 0, 0],
    ['abc123', 'POE456  ', 'Canada', t, t + 2, lon - 0.0211, lat + 0.0321, 3000, false, 180.2, 270, 0, null, 3050, '7012', false, 0, 0],
    ['d0d0d0', null, 'Canada', null, t + 3, null, null, null, true, 0, null, null, null, null, null, false, 0, 0],
    ['e1e1e1', 'WJA789  ', 'Canada', t, t + 4, lon + 0.2, lat - 0.1, 9000, false, 230.4, 10, 5, null, 9100, '1200', false, 0, 0],
    'garbage',
    [1, 2, 3],
  ];
}
const REDUCED = ['icao24', 'callsign', 'lat', 'lon', 'baro_altitude', 'geo_altitude', 'on_ground',
  'velocity', 'time_position', 'last_contact'];

// ── a fake KV, as Cloudflare's: get/put/delete, with the TTLs written ─────
// Like the real one it refuses an expirationTtl under 60 s. failNext.get /
// failNext.put name a key whose next read / write throws once.
function fakeKv() {
  const m = new Map();
  const puts = [];
  const failNext = { get: null, put: null };
  return {
    m, puts, failNext,
    async get(k) {
      if (failNext.get === k) { failNext.get = null; throw new Error('KV read failed'); }
      return m.has(k) ? m.get(k) : null;
    },
    async put(k, v, o) {
      if (failNext.put === k) { failNext.put = null; throw new Error('KV write failed'); }
      const ttl = o && o.expirationTtl;
      if (ttl !== undefined && !(Number.isFinite(ttl) && ttl >= 60)) throw new Error('KV: expirationTtl must be at least 60');
      puts.push({ k, ttl });
      m.set(k, String(v));
    },
    async delete(k) { m.delete(k); },
    json(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
  };
}

let WORKER_MOD = null;
async function workerMod() {
  if (!WORKER_MOD) WORKER_MOD = await import(WORKER_PATH);
  return WORKER_MOD;
}

// The Worker in-process, the way Cloudflare hands it a request: request.cf
// and CF-Connecting-IP are set by Cloudflare, never by the caller. The pin is
// IP unless a test says otherwise.
async function worldW(envExtra = {}) {
  const mod = await workerMod();
  const kv = fakeKv();
  const env = { FIDS_LIVE_FLIGHTS: kv, OPENSKY_CLIENT_ID: CLIENT_ID, OPENSKY_CLIENT_SECRET: SECRET, OSKY_RELAY_IPV4: IP, ...envExtra };
  async function call(method, p, { body, key, ip = IP, asn = HETZNER, headers = {}, raw } = {}) {
    const h = new Headers(headers);
    if (ip) h.set('CF-Connecting-IP', ip);
    if (key) h.set('X-Relay-Key', key);
    if (body !== undefined && !raw && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
    const req = new Request('https://fids-proxy.test' + p, {
      method, headers: h, body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)),
    });
    Object.defineProperty(req, 'cf', { value: asn === null ? undefined : { asn } });
    const res = await mod.default.fetch(req, env, { waitUntil() {} });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  }
  const register = (key = RELAY_KEY, ip = IP, opts = {}) => call('POST', '/osky/register', { body: { relayKey: key }, ip, ...opts });
  const want = (box = BOX, f = { callsign: ['ACA123'] }, now) => mod.oskyWant(env, box, f, now);
  return { mod, kv, env, call, register, want };
}

function withNow(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  return Promise.resolve().then(fn).finally(() => { Date.now = real; });
}

function stateRow(over = {}, box = BOX) {
  const t = nowS() - 5;
  return {
    icao24: 'c0ffee', callsign: 'ACA123', lat: (box.lamin + box.lamax) / 2, lon: (box.lomin + box.lomax) / 2,
    baro_altitude: 1234.5, geo_altitude: 1300.1, on_ground: false, velocity: 210.5,
    time_position: t, last_contact: t + 1, ...over,
  };
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ═══ THE WORKER ═══════════════════════════════════════════════════════════
test('the address pin: a stranger on Hetzner\'s network gets nothing, before or after our relay registers', async () => {
  // The case the pin exists for: someone rents a Hetzner server (or a VPN
  // exit there), knows the routes from this repository, and races ours.
  const w = await worldW({ OPENSKY_ON: '1' });
  const squat = await w.register(OTHER_KEY, IP2);
  assert.equal(squat.status, 403, 'not the pinned address: refused');
  assert.deepEqual(squat.json, { error: 'forbidden' });
  assert.equal(w.kv.m.has('osky:relay'), false, 'nothing stored');
  assert.equal((await w.register()).status, 200, 'ours registers');
  for (const [m, p, body] of [['GET', '/osky/creds'], ['GET', '/osky/wanted'], ['GET', '/osky/report?calls=1&state=ready'],
    ['POST', '/osky/put', { box: BOX, time: null, states: [stateRow()] }]]) {
    for (const key of [OTHER_KEY, RELAY_KEY]) {
      const r = await w.call(m, p, { body, key, ip: IP2 });
      assert.equal(r.status, 403, `${p} from another Hetzner address (${key === RELAY_KEY ? 'even with our key' : 'its own key'})`);
      assert.ok(!r.text.includes(SECRET));
    }
  }
  assert.equal((await w.register(OTHER_KEY, IP2)).status, 403, 'and it cannot take the registration over afterwards');
  assert.equal(w.kv.json('osky:relay').ip, IP);
  assert.equal(w.kv.json('osky:relay').keyHash, sha(RELAY_KEY));
  assert.equal((await w.call('GET', '/osky/creds', { key: RELAY_KEY })).status, 200, 'ours still works');

  // no pin at all (the secret not added yet, or not an address): nothing registers
  for (const pin of [undefined, '', 'not-an-address', '192.0.2', '2001:db8::7', ' ']) {
    const w2 = await worldW(pin === undefined ? { OSKY_RELAY_IPV4: undefined } : { OSKY_RELAY_IPV4: pin });
    const r = await w2.register();
    assert.equal(r.status, 503, 'pin ' + JSON.stringify(pin));
    assert.deepEqual(r.json, { error: 'no-pin' });
    assert.equal(w2.kv.m.size, 0);
    // and with no pin, nothing locked answers, even to a stored registration
    w2.kv.m.set('osky:relay', JSON.stringify({ keyHash: sha(RELAY_KEY), ip: IP, at: 'x' }));
    assert.equal((await w2.call('GET', '/osky/report?calls=1', { key: RELAY_KEY })).status, 403);
  }
  // the pin is trimmed: a pasted trailing newline still works
  const w3 = await worldW({ OSKY_RELAY_IPV4: IP + '\n' });
  assert.equal((await w3.register()).status, 200);
});

test('/osky/register: Hetzner\'s network, an IPv4, a JSON body, the pinned address; it works while OpenSky is off', async () => {
  const w = await worldW();               // OPENSKY_ON not set at all
  for (const [asn, why] of [[13335, 'another network'], [null, 'no request.cf'], ['24940', 'the ASN as a string']]) {
    const r = await w.call('POST', '/osky/register', { body: { relayKey: RELAY_KEY }, asn });
    assert.equal(r.status, 403, why);
    assert.deepEqual(r.json, { error: 'forbidden' }, why);
  }
  assert.equal((await w.call('POST', '/osky/register', { body: { relayKey: RELAY_KEY }, ip: '2001:db8::7' })).status, 400, 'IPv6 never registers');
  for (const key of ['short', RELAY_KEY + '!', 'x'.repeat(200)]) {
    assert.equal((await w.register(key)).status, 400, 'a key that is not 32+ random bytes: ' + key.length);
  }
  const JSONH = { 'Content-Type': 'application/json' };
  assert.equal((await w.call('POST', '/osky/register', { body: 'x'.repeat(2000), raw: true, headers: JSONH })).status, 413);
  assert.equal((await w.call('GET', '/osky/register')).status, 405);
  assert.equal((await w.call('OPTIONS', '/osky/register', { headers: { Origin: 'https://evil.example' } })).status, 405, 'a CORS preflight is refused');
  // a browser's "simple" cross-site POST (text/plain, form, no type) is refused before anything else
  for (const type of ['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', null]) {
    const r = await w.call('POST', '/osky/register', { body: JSON.stringify({ relayKey: RELAY_KEY }), raw: true, headers: type ? { 'Content-Type': type } : {} });
    assert.equal(r.status, 415, String(type));
  }
  assert.equal(w.kv.m.size, 0, 'nothing stored by a refused registration');
  assert.equal((await w.register(RELAY_KEY, IP, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })).status, 200, 'a charset is fine');
  w.kv.m.clear(); w.kv.puts.length = 0;

  const ok = await w.register();
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { registered: true });
  const rec = w.kv.json('osky:relay');
  assert.deepEqual(Object.keys(rec).sort(), ['at', 'ip', 'keyHash']);
  assert.equal(rec.ip, IP);
  assert.equal(rec.keyHash, sha(RELAY_KEY), 'only the sha256 of the key is kept');
  assert.ok(!w.kv.m.get('osky:relay').includes(RELAY_KEY));
  assert.equal(w.kv.puts.find((p) => p.k === 'osky:relay').ttl, undefined, 'the registration does not expire by itself');

  // the same relay again (its first answer lost): fine, and nothing written
  assert.equal((await w.register()).status, 200);
  assert.equal(w.kv.puts.filter((p) => p.k === 'osky:relay').length, 1, 'no second write');
  // a new key from the pinned address (the server rebuilt on the same address) replaces it
  assert.equal((await w.register(OTHER_KEY)).status, 200);
  assert.equal(w.kv.json('osky:relay').keyHash, sha(OTHER_KEY));
  assert.equal((await w.call('GET', '/osky/report?calls=0', { key: RELAY_KEY })).status, 403, 'the old key is done');
  assert.equal((await w.call('GET', '/osky/report?calls=0', { key: OTHER_KEY })).status, 200);
  // a record that cannot be read gives way to the pinned address too
  w.kv.m.set('osky:relay', '{not json');
  assert.equal((await w.register()).status, 200);
  assert.equal(w.kv.json('osky:relay').keyHash, sha(RELAY_KEY));

  // a new address: only a new pin; the old record gives way, nothing deleted by hand
  w.env.OSKY_RELAY_IPV4 = IP2;
  assert.equal((await w.call('GET', '/osky/report?calls=0', { key: RELAY_KEY })).status, 403, 'the old address is done at once');
  assert.equal((await w.call('GET', '/osky/report?calls=0', { key: RELAY_KEY, ip: IP2 })).status, 403, 'the new address needs its own registration');
  assert.equal((await w.register(RELAY_KEY, IP)).status, 403);
  assert.equal((await w.register(OTHER_KEY, IP2)).status, 200);
  assert.equal(w.kv.json('osky:relay').ip, IP2);
});

test('a KV read that fails never opens the registration (EXP7): 503, and the stored relay stands', async () => {
  const w = await worldW({ OPENSKY_ON: '1' });
  await w.register();
  const before = w.kv.m.get('osky:relay');
  w.kv.failNext.get = 'osky:relay';
  const r = await w.register(OTHER_KEY);
  assert.equal(r.status, 503);
  assert.deepEqual(r.json, { error: 'store' });
  assert.equal(w.kv.m.get('osky:relay'), before, 'nothing replaced');
  // a failed read on a locked route refuses (it never lets anyone in)
  w.kv.failNext.get = 'osky:relay';
  assert.equal((await w.call('GET', '/osky/creds', { key: RELAY_KEY })).status, 403);
  assert.equal((await w.call('GET', '/osky/creds', { key: RELAY_KEY })).status, 200);
  assert.equal((await w.call('GET', '/osky/creds', { key: OTHER_KEY })).status, 403);
});

test('the relay\'s routes need the pinned address AND the key; every refusal looks the same', async () => {
  const w = await worldW({ OPENSKY_ON: '1' });
  const routes = [['GET', '/osky/report?calls=1'], ['GET', '/osky/creds'], ['GET', '/osky/wanted'],
    ['POST', '/osky/put', { box: BOX, time: null, states: [] }]];
  // nobody registered yet
  for (const [m, p, body] of routes) {
    const r = await w.call(m, p, { body, key: RELAY_KEY });
    assert.equal(r.status, 403, p);
    assert.equal(r.text, '{"error":"forbidden"}', p);
  }
  await w.register();
  await w.want();
  const wrongKey = RELAY_KEY.slice(0, -4) + (RELAY_KEY.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  const refusals = new Set();
  for (const [m, p, body] of routes) {
    for (const [opts, why] of [
      [{}, 'no key'],
      [{ key: wrongKey }, 'a wrong key'],
      [{ key: RELAY_KEY.slice(0, 30) }, 'part of the key'],
      [{ key: RELAY_KEY, ip: IP2 }, 'the right key from another address'],
      [{ key: RELAY_KEY, ip: null }, 'no address at all'],
      [{ key: RELAY_KEY, ip: IP2, headers: { 'X-Forwarded-For': IP } }, 'a forwarded-for header is no address'],
    ]) {
      const r = await w.call(m, p, { body, ...opts });
      assert.equal(r.status, 403, `${p}: ${why}`);
      refusals.add(r.text);
    }
  }
  assert.deepEqual([...refusals], ['{"error":"forbidden"}'], 'one answer for every refusal: nothing says which part was wrong');
  for (const [m, p, body] of routes) {
    const r = await w.call(m, p, { body, key: RELAY_KEY });
    assert.equal(r.status, 200, p + ' with the key from the pinned address');
  }
  // a put must be JSON too
  const tp = await w.call('POST', '/osky/put', { body: JSON.stringify({ box: BOX, time: null, states: [] }), raw: true, key: RELAY_KEY, headers: { 'Content-Type': 'text/plain' } });
  assert.equal(tp.status, 415);
});

test('OFF by default: only OPENSKY_ON === "1" switches OpenSky on, and the config keeps it "0"', async () => {
  assert.match(WRANGLER, /"OPENSKY_ON":\s*"0"/, 'workers/wrangler.fids-proxy.jsonc keeps it off in this change');
  for (const on of [undefined, '0', 'true', 'yes', ' 1', 1, true]) {
    const w = await worldW(on === undefined ? {} : { OPENSKY_ON: on });
    assert.equal((await w.register()).status, 200, 'registering works while off');
    await w.want();
    const rep = await w.call('GET', '/osky/report?calls=0&state=off', { key: RELAY_KEY });
    assert.equal(rep.status, 200, 'the heartbeat answers while off');
    assert.equal(rep.json.on, false, String(on));
    for (const [m, p, body] of [['GET', '/osky/creds'], ['GET', '/osky/wanted'], ['POST', '/osky/put', { box: BOX, time: null, states: [stateRow()] }]]) {
      const r = await w.call(m, p, { body, key: RELAY_KEY });
      assert.equal(r.status, 503, `${p} with OPENSKY_ON=${JSON.stringify(on)}`);
      assert.deepEqual(r.json, { error: 'off' });
      assert.ok(!r.text.includes(SECRET));
    }
    assert.equal(w.kv.m.has('osky:pos:' + w.mod.oskyBoxKey(BOX)), false, 'nothing stored while off');
    assert.equal((await w.call('GET', '/osky/status', { ip: null })).json.on, false);
  }
  const w = await worldW({ OPENSKY_ON: '1' });
  await w.register();
  assert.equal((await w.call('GET', '/osky/report', { key: RELAY_KEY })).json.on, true);
  assert.equal((await w.call('GET', '/osky/creds', { key: RELAY_KEY })).status, 200);
});

test('HARD STOP: after OSKY_STOP_AT (default the end of the term) every route answers 410 and stores nothing', async () => {
  // the config's stop date is a whole UTC date the Worker can read (one that
  // cannot be read stops every route), and never earlier than the term's end
  const m = WRANGLER.match(/"OSKY_STOP_AT":\s*"([^"]*)"/);
  assert.ok(m, 'workers/wrangler.fids-proxy.jsonc sets OSKY_STOP_AT');
  assert.match(m[1], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'OSKY_STOP_AT is a whole UTC date: ' + m[1]);
  assert.ok(Number.isFinite(Date.parse(m[1])) && Date.parse(m[1]) >= STOP_MS, 'OSKY_STOP_AT reads as a date, not before the term\'s end');
  assert.equal(new Date(Date.parse(m[1])).toISOString().replace(/\.\d{3}Z$/, 'Z'), m[1], 'a real date (not 2026-13-40)');

  const w = await worldW({ OPENSKY_ON: '1' });
  await w.register();
  await w.want();
  const before = JSON.stringify([...w.kv.m]);
  const all = [['GET', '/osky/status'], ['POST', '/osky/register', { relayKey: OTHER_KEY }], ['GET', '/osky/report?calls=1'],
    ['GET', '/osky/creds'], ['GET', '/osky/wanted'], ['POST', '/osky/put', { box: BOX, time: null, states: [stateRow()] }],
    ['GET', '/osky/anything'], ['OPTIONS', '/osky/creds']];
  await withNow(STOP_MS, async () => {
    for (const [mm, p, body] of all) {
      const r = await w.call(mm, p, { body, key: RELAY_KEY });
      assert.equal(r.status, 410, p);
      assert.deepEqual(r.json, { error: 'stopped' }, p);
      assert.ok(!r.text.includes(SECRET), p);
    }
    assert.equal(await w.want(BOX, { callsign: ['ACA123'] }, STOP_MS), false, 'no wish is stored after the stop either');
  });
  await withNow(STOP_MS - 1000, async () => {
    assert.equal((await w.call('GET', '/osky/creds', { key: RELAY_KEY })).status, 200, 'one second before, it still answers');
  });
  assert.equal(JSON.stringify([...w.kv.m.entries()].filter(([k]) => k !== 'osky:report')), JSON.stringify(JSON.parse(before).filter(([k]) => k !== 'osky:report')),
    'the stopped requests changed nothing');

  // OSKY_STOP_AT moves it; one that cannot be read is a stop, not "no end"
  for (const [v, status] of [['2026-10-01T00:00:00Z', 410], ['tomorrow', 410], ['oops', 410], ['2026-13-40T99:99:99Z', 410], [' ', 410], [FAR_STOP, 200]]) {
    const w2 = await worldW({ OPENSKY_ON: '1', OSKY_STOP_AT: v });
    await withNow(Date.UTC(2026, 9, 20), async () => {
      assert.equal((await w2.call('GET', '/osky/status')).status, status, 'OSKY_STOP_AT=' + v);
    });
  }
});

test('the OpenSky client: from Worker secrets, to the relay only, never logged, never cached, no CORS', async () => {
  const seen = [];
  const keep = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
    keep[k] = console[k];
    console[k] = (...a) => { seen.push(a.map(String).join(' ')); };
  }
  try {
    const w = await worldW({ OPENSKY_ON: '1' });
    await w.register();
    const r = await w.call('GET', '/osky/creds', { key: RELAY_KEY });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { client_id: CLIENT_ID, client_secret: SECRET });
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    // every other route, to be sure nothing on the way logs it either
    await w.call('GET', '/osky/status');
    await w.call('GET', '/osky/report?calls=1', { key: RELAY_KEY });
    await w.call('GET', '/osky/creds', { key: 'x'.repeat(43) });
    const none = await worldW({ OPENSKY_ON: '1', OPENSKY_CLIENT_ID: '', OPENSKY_CLIENT_SECRET: undefined });
    await none.register();
    const r2 = await none.call('GET', '/osky/creds', { key: RELAY_KEY });
    assert.equal(r2.status, 503);
    assert.deepEqual(r2.json, { error: 'no-key' });
  } finally {
    for (const k of Object.keys(keep)) console[k] = keep[k];
  }
  for (const line of seen) {
    assert.ok(!line.includes(SECRET) && !line.includes(RELAY_KEY), 'logged: ' + line.slice(0, 80));
  }
  const at = WORKER_SRC.indexOf('// /osky/* — THE OPENSKY RELAY\'S ROUTES');
  const end = WORKER_SRC.indexOf('\nvar fids_proxy_default = {', at);
  assert.ok(at > 0 && end > at, 'the /osky section is found');
  // the code, without its comments (which name the stores it must not use)
  const section = WORKER_SRC.slice(at, end).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(section, /console\./, 'nothing in the /osky section logs');
  assert.doesNotMatch(section, /corsHeaders|Access-Control-Allow/, 'no CORS in the /osky section');
  assert.doesNotMatch(section, /caches\.|cache\.put|trk:v1|acmem|fltrack|adsbans/, 'no cache and no other store');
  assert.match(WRANGLER, /OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET and OSKY_RELAY_IPV4/, 'the config names the three secrets (they are never in it)');
  assert.doesNotMatch(WRANGLER, /"(OPENSKY_CLIENT_(ID|SECRET)|OSKY_RELAY_IPV4)"\s*:/, 'never a value in the config');
});

test('/osky/put: a wanted box only, the wanted flights only, known fields checked, kept 180 s under osky:pos:*', async () => {
  const w = await worldW({ OPENSKY_ON: '1' });
  await w.register();
  const put = (body, opts = {}) => w.call('POST', '/osky/put', { body, key: RELAY_KEY, ...opts });
  const JSONH = { 'Content-Type': 'application/json' };
  assert.equal((await put({ box: BOX, time: null, states: [stateRow()] })).status, 409, 'no box is wanted yet');
  assert.deepEqual((await put({ box: BOX, time: null, states: [] })).json, { error: 'not-wanted' });
  assert.equal(await w.want(BOX, { callsign: ['ACA123'], icao24: ['abc123'] }), true);

  for (const [body, code] of [
    [{ box: { ...BOX, lamax: 60 }, time: null, states: [] }, 'bad-box'],                 // more than 25 sq deg
    [{ box: { lamin: '45', lomin: -66, lamax: 46, lomax: -65 }, time: null, states: [] }, 'bad-box'],
    [{ box: { lamin: 46, lomin: -66, lamax: 45, lomax: -65 }, time: null, states: [] }, 'bad-box'],
    [{ box: BOX, time: null }, 'bad-states'],
    [{ box: BOX, time: null, states: Array(65).fill(stateRow()) }, 'bad-states'],
    [{ box: BOX, time: 'now', states: [] }, 'bad-time'],
    [{ box: BOX, time: -5, states: [] }, 'bad-time'],
  ]) {
    const r = await put(body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
    assert.deepEqual(r.json, { error: code });
  }
  assert.equal((await put('{"box":', { raw: true, headers: JSONH })).status, 400);
  assert.equal((await put('x'.repeat(40 * 1024), { raw: true, headers: JSONH })).status, 413, 'a body over 32 KiB');
  assert.equal((await put({ box: BOX, time: Math.floor(STOP_MS / 1000) + 5, states: [] })).status, 410, 'OpenSky\'s own clock past the stop');

  const lat = (BOX.lamin + BOX.lamax) / 2, lon = (BOX.lomin + BOX.lomax) / 2;
  const ok = await put({
    box: BOX, time: nowS(), extra: 'dropped',
    states: [
      stateRow({ squawk: '6123', vertical_rate: -3.25, origin_country: 'Canada', true_track: 87.25, sensors: [1] }),
      stateRow({ icao24: 'abc123', callsign: 'POE456', lat: lat + 0.1 }),
      stateRow({ icao24: 'e1e1e1', callsign: 'WJA789' }),                      // not a wanted flight
      stateRow({ icao24: 'abc123', callsign: 'POE456' }),                      // the same aircraft twice
      stateRow({ icao24: 'c0ffee', lat: 91 }),
      stateRow({ icao24: 'c0ffee', lat: BOX.lamax + 1 }),                      // outside the box
      stateRow({ icao24: 'C0FFEX' }),
      stateRow({ icao24: 'c0ffee', callsign: 'AC 123' }),
      stateRow({ icao24: 'c0ffee', velocity: 99999 }),
      stateRow({ icao24: 'c0ffee', on_ground: 'no' }),
      stateRow({ icao24: 'c0ffee', last_contact: nowS() + 86400 }),
      'garbage', null, [1, 2],
    ],
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { stored: 2 });
  const key = 'osky:pos:' + w.mod.oskyBoxKey(BOX);
  const doc = w.kv.json(key);
  assert.deepEqual(Object.keys(doc).sort(), ['at', 'box', 'credit', 'states', 'time']);
  assert.equal(doc.credit, 'Data: OpenSky Network');
  assert.deepEqual(doc.states.map((s) => s.icao24), ['c0ffee', 'abc123']);
  for (const s of doc.states) assert.deepEqual(Object.keys(s).sort(), [...REDUCED].sort(), 'known fields only, no heading');
  assert.equal(doc.states[0].lon, lon);
  const ttl = w.kv.puts.filter((p) => p.k === key).map((p) => p.ttl);
  assert.deepEqual(ttl, [180], 'kept 180 s');
  assert.ok([...w.kv.m.keys()].every((k) => k.startsWith('osky:')), 'nothing outside osky:* — never trk:v1, acmem or /fltrack/');
  assert.equal(w.kv.puts.filter((p) => p.k.startsWith('osky:') && !['osky:relay', 'osky:wanted', key].includes(p.k)).length, 0,
    'one KV write per put: the position, nothing else');

  // the heading only once OSKY_HEADING is "1"
  w.env.OSKY_HEADING = '1';
  await put({ box: BOX, time: null, states: [stateRow({ true_track: 87.25 })] });
  assert.equal(w.kv.json(key).states[0].true_track, 87.25);
  assert.equal((await w.call('GET', '/osky/put', { key: RELAY_KEY })).status, 405);
  // a position always outlives the relay's 120 s shared answer by a minute
  assert.match(WORKER_SRC, /^const OSKY_POS_TTL_S = 180;/m);
  assert.match(RELAY_SRC, /^MAX_CACHE_S = 120 /m);
});

test('/osky/wanted: what oskyWant stored, at most 25 sq deg and 4 flights a box, lapsing after 10 minutes', async () => {
  const w = await worldW({ OPENSKY_ON: '1' });
  await w.register();
  const t = Date.UTC(2026, 9, 20, 12);
  for (const [box, f] of [
    [{ ...BOX, lamax: 60 }, { callsign: ['ACA123'] }],          // too big
    [BOX, {}],                                                    // no flight
    [BOX, { callsign: ['A1', 'A2', 'A3'], icao24: ['aaaaaa', 'bbbbbb'] }],
    [BOX, { icao24: ['xyz'] }],
    [BOX, { callsign: ['AC 123'] }],
    [BOX, { callsign: 'ACA123' }],
    [{ lamin: 45, lomin: -66, lamax: 46 }, { callsign: ['ACA123'] }],
  ]) assert.equal(await w.want(box, f, t), false, JSON.stringify([box, f]));
  assert.equal(w.kv.m.has('osky:wanted'), false);
  assert.equal(await w.want(BOX, { callsign: ['aca123'], icao24: ['C0FFEE'] }, t), true);
  assert.equal(w.kv.puts.find((p) => p.k === 'osky:wanted').ttl, 600);
  await withNow(t + 60e3, async () => {
    const r = await w.call('GET', '/osky/wanted', { key: RELAY_KEY });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(r.json, { boxes: [{ ...BOX, icao24: ['c0ffee'], callsign: ['ACA123'] }] });
  });
  // four flights a box at most: the most recently wanted stay
  await w.want(BOX, { callsign: ['WJA1', 'WJA2', 'WJA3'] }, t + 1000);
  await withNow(t + 2000, async () => {
    const b = (await w.call('GET', '/osky/wanted', { key: RELAY_KEY })).json.boxes[0];
    assert.equal(b.icao24.length + b.callsign.length, 4);
    assert.deepEqual(b.callsign.filter((c) => c.startsWith('WJA')), ['WJA1', 'WJA2', 'WJA3']);
  });
  await withNow(t + 601e3, async () => {
    assert.deepEqual((await w.call('GET', '/osky/wanted', { key: RELAY_KEY })).json, { boxes: [] }, 'lapsed after 10 minutes');
  });
});

test('the heartbeat writes its report only on a change, or every 10 minutes: few KV writes, weeks before payment', async () => {
  const w = await worldW();
  await w.register();
  const t = Date.UTC(2026, 9, 20, 12);
  const q = (o = {}) => new URLSearchParams({ calls: '0', cap: '1500', status: '0', hold: '0', state: 'off', puts: '0', stop: STOP_AT, ...o }).toString();
  const beat = async (o, ms) => {
    const r = await withNow(ms, () => w.call('GET', '/osky/report?' + q(o), { key: RELAY_KEY }));
    assert.equal(r.status, 200);
    return r;
  };
  const writes = () => w.kv.puts.filter((p) => p.k === 'osky:report').length;
  await beat({}, t);
  assert.equal(writes(), 1, 'the first one is written');
  assert.equal(w.kv.puts.find((p) => p.k === 'osky:report').ttl, 2 * 86400);
  for (let i = 1; i <= 9; i++) await beat({ calls: String(i), puts: String(i) }, t + i * 60e3);
  assert.equal(writes(), 1, 'nine more minutes with nothing new but counts: no write');
  await beat({ calls: '10' }, t + 600e3);
  assert.equal(writes(), 2, 'ten minutes on: written again');
  assert.equal(w.kv.json('osky:report').calls_today, 10);
  for (const [o, why] of [[{ state: 'idle' }, 'the state'], [{ state: 'idle', hold: '30' }, 'a hold starting'],
    [{ state: 'idle', hold: '0' }, 'a hold ending'], [{ state: 'idle', status: '429' }, 'OpenSky\'s answer'],
    [{ state: 'idle', status: '429', cap: '700' }, 'the cap'], [{ state: 'idle', status: '429', cap: '700', stop: '2026-12-12T22:59:59Z' }, 'the stop date']]) {
    const n = writes();
    await beat(o, t + 660e3 + n * 1000);
    assert.equal(writes(), n + 1, why + ' changed: written');
  }
  const n = writes();
  await beat({ state: 'idle', status: '429', cap: '700', stop: '2026-12-12T22:59:59Z', hold: '0', calls: '99' }, t + 700e3);
  assert.equal(writes(), n, 'unchanged again: no write');
  // a day switched off: 144 writes, not 1,440
  const w2 = await worldW();
  await w2.register();
  for (let i = 0; i < 1440; i++) {
    await withNow(t + i * 60e3, () => w2.call('GET', '/osky/report?' + q({ calls: '0' }), { key: RELAY_KEY }));
  }
  assert.equal(w2.kv.puts.filter((p) => p.k === 'osky:report').length, 144);
  // a write that fails (KV out of writes) never fails the heartbeat
  w.kv.failNext.put = 'osky:report';
  const r = await beat({ state: 'ready' }, t + 800e3);
  assert.deepEqual(r.json, { on: false, stop_at: STOP_AT });
});

test('/osky/status: public, counts and yes/no only, never the address, a key or a secret', async () => {
  const w = await worldW({ OPENSKY_ON: '0' });
  let s = await w.call('GET', '/osky/status', { ip: null, asn: null });
  assert.equal(s.status, 200, 'public: no key, no address');
  assert.equal(s.json.relay_registered, false);
  assert.equal(s.json.relay_pin_set, true);
  assert.equal(s.json.creds_set, true);
  await w.register();
  await w.want();
  await w.call('GET', '/osky/report?calls=12&cap=1500&status=200&hold=0&state=ready&puts=7&stop=' + STOP_AT + '&extra=x', { key: RELAY_KEY });
  w.env.OPENSKY_ON = '1';
  await w.call('POST', '/osky/put', { body: { box: BOX, time: nowS(), states: [stateRow()] }, key: RELAY_KEY });
  s = await w.call('GET', '/osky/status', { ip: null });
  assert.deepEqual(Object.keys(s.json).sort(), ['creds_set', 'on', 'registered_at', 'relay_pin_set', 'relay_registered',
    'relay_report', 'service', 'stop_at', 'wanted_boxes'].sort());
  assert.equal(s.json.on, true);
  assert.equal(s.json.relay_registered, true);
  assert.equal(s.json.stop_at, STOP_AT);
  assert.equal(s.json.wanted_boxes, 1);
  assert.deepEqual(Object.keys(s.json.relay_report).sort(), ['at', 'calls_today', 'cap', 'hold_s', 'last_status', 'puts_today', 'state', 'stop_at']);
  assert.equal(s.json.relay_report.calls_today, 12);
  assert.equal(s.json.relay_report.puts_today, 7);
  assert.equal(s.json.relay_report.state, 'ready');
  assert.equal(s.json.relay_report.stop_at, STOP_AT);
  const keyHash = sha(RELAY_KEY);
  for (const bad of [IP, '192.0', '0.2.44', sha(IP).slice(0, 8), SECRET, CLIENT_ID, RELAY_KEY, keyHash, keyHash.slice(0, 16), 'c0ffee', 'ACA123', String(BOX.lamin)]) {
    assert.ok(!s.text.includes(bad), 'status must not show ' + bad);
  }
  assert.equal(s.headers.get('access-control-allow-origin'), null);
  assert.equal(s.headers.get('cache-control'), 'no-store');
  // a report with junk keeps only what it can read
  await w.call('GET', '/osky/report?calls=-1&cap=abc&status=999&state=Not%20A%20Code&stop=soon', { key: RELAY_KEY });
  const rr = (await w.call('GET', '/osky/status')).json.relay_report;
  assert.deepEqual([rr.calls_today, rr.cap, rr.last_status, rr.state, rr.stop_at], [null, null, null, null, null]);
  // the pin moved to a new address: the old registration no longer counts
  w.env.OSKY_RELAY_IPV4 = IP2;
  s = (await w.call('GET', '/osky/status')).json;
  assert.equal(s.relay_registered, false);
  assert.equal(s.registered_at, null);
  delete w.env.OSKY_RELAY_IPV4;
  assert.equal((await w.call('GET', '/osky/status')).json.relay_pin_set, false);
});

test('no CORS and no caching anywhere under /osky/, the routes sit before the CORS preflight and outside /adsb/', async () => {
  const w = await worldW({ OPENSKY_ON: '1' });
  await w.register();
  for (const [m, p] of [['OPTIONS', '/osky/status'], ['OPTIONS', '/osky/creds'], ['OPTIONS', '/osky/register'], ['OPTIONS', '/osky/put'],
    ['GET', '/osky/status'], ['GET', '/osky/creds'], ['GET', '/osky/nope'], ['GET', '/osky'], ['DELETE', '/osky/status']]) {
    const r = await w.call(m, p, { key: RELAY_KEY, headers: { Origin: 'https://evil.example' } });
    for (const [h] of r.headers) assert.ok(!/^access-control-/i.test(h), `${m} ${p}: ${h}`);
    assert.equal(r.headers.get('cache-control'), 'no-store', `${m} ${p}`);
    if (m === 'OPTIONS') assert.ok(r.status >= 400, `${m} ${p}: a preflight is refused (${r.status})`);
  }
  const fetchAt = WORKER_SRC.indexOf('async fetch(request, env, ctx) {', WORKER_SRC.indexOf('var fids_proxy_default = {'));
  const osky = WORKER_SRC.indexOf('url.pathname.startsWith("/osky/")', fetchAt);
  const preflight = WORKER_SRC.indexOf('request.method === "OPTIONS"', fetchAt);
  assert.ok(fetchAt > 0 && osky > fetchAt && osky < preflight, '/osky is handled before the CORS preflight answer');
  assert.doesNotMatch(WORKER_SRC, /\/adsb\/osky|\/adsb\/opensky/i);
});

test('the board-side change is told its rules where it will read them (oskyWant)', () => {
  const at = WORKER_SRC.indexOf('async function oskyWant(');
  const note = WORKER_SRC.slice(WORKER_SRC.lastIndexOf('// The boards\' side:', at), at);
  assert.match(note, /never with a box or a flight taken from a public request/);
  assert.match(note, /oskyStopMs\(env\)/);
  assert.match(note, /Data: OpenSky Network/);
  assert.match(note, /Schäfer et al\. \(IPSN 2014\)/);
});

// ═══ THE RELAY, AGAINST THE REAL WORKER CODE AND A FAKE OPENSKY ═══════════
// a fake OpenSky: the OAuth token endpoint and /api/states/all
function fakeOpenSky(host = '127.0.0.1') {
  const f = {
    tokenCalls: 0, statesCalls: 0, issued: 0, tokens: new Set(), revoked: new Set(),
    mode: 'ok', loginMode: 'ok', queries: [], agents: [], date: null, statesDate: null, timeFn: null,
    stateFile: null, diskCounts: [],
  };
  f.server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      // no real Date header: OpenSky's clock past the stop is a stop, so the
      // fake only sends one when a test sets it (date: every answer;
      // statesDate: the data answers only)
      res.sendDate = false;
      if (f.date) res.setHeader('Date', f.date);
      f.agents.push(req.headers['user-agent']);
      const u = new URL(req.url, 'http://fake');
      if (req.method === 'POST' && u.pathname === '/auth/token') {
        f.tokenCalls++;
        if (f.loginMode === '403') { res.writeHead(403); res.end(); return; }
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
        if (f.statesDate) res.setHeader('Date', f.statesDate);
        const q = {};
        for (const [k, v] of u.searchParams) (q[k] = q[k] || []).push(v);
        f.queries.push(q);
        if (f.stateFile) f.diskCounts.push(JSON.parse(fs.readFileSync(f.stateFile, 'utf8')).count);
        const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
        if (!f.tokens.has(tok) || f.revoked.has(tok)) { res.writeHead(401); res.end(); return; }
        if (f.mode === 'forbidden') { res.writeHead(403); res.end(); return; }
        if (f.mode === 'rate') { res.writeHead(429, { 'X-Rate-Limit-Retry-After-Seconds': '600' }); res.end(); return; }
        const box = { lamin: Number(q.lamin[0]), lomin: Number(q.lomin[0]), lamax: Number(q.lamax[0]), lomax: Number(q.lomax[0]) };
        const time = f.timeFn ? f.timeFn() : nowS();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ time, states: osRows(box) }));
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

// The real Worker behind a loopback server, standing in for Cloudflare: it
// sets request.cf.asn and CF-Connecting-IP (from the socket) the way
// Cloudflare does, whatever the caller sent. The relay connects from
// 127.0.0.1, so that is the pin. w.down answers 500 to everything (the
// Worker unreachable); w.failPuts answers that many puts with a 500.
async function fakeWorker(envExtra = {}, host = '127.0.0.1') {
  const mod = await workerMod();
  const kv = fakeKv();
  const w = {
    mod, kv, asn: HETZNER, calls: [], agents: [], keys: new Set(), families: new Set(), putBodies: [],
    down: false, failPuts: 0,
    env: { FIDS_LIVE_FLIGHTS: kv, OPENSKY_ON: '1', OPENSKY_CLIENT_ID: CLIENT_ID, OPENSKY_CLIENT_SECRET: SECRET,
      OSKY_STOP_AT: FAR_STOP, OSKY_RELAY_IPV4: '127.0.0.1', ...envExtra },
  };
  w.server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const route = req.method + ' ' + req.url.split('?')[0];
    w.calls.push(route);
    w.agents.push(req.headers['user-agent']);
    w.families.add(req.socket.remoteFamily);
    if (req.headers['x-relay-key']) w.keys.add(req.headers['x-relay-key']);
    if (route === 'POST /osky/put') w.putBodies.push(JSON.parse(body.toString('utf8')));
    if (w.down || (route === 'POST /osky/put' && w.failPuts > 0)) {
      if (!w.down) w.failPuts--;
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('worker error');
      return;
    }
    const h = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string' && !/^(host|content-length|connection|transfer-encoding|cf-connecting-ip)$/i.test(k)) h.set(k, v);
    }
    h.set('CF-Connecting-IP', req.socket.remoteAddress.replace(/^::ffff:/, ''));
    const r = new Request('https://fids-proxy.test' + req.url, {
      method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    Object.defineProperty(r, 'cf', { value: { asn: w.asn } });
    const out = await mod.default.fetch(r, w.env, { waitUntil() {} });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise((resolve, reject) => {
    w.server.on('error', reject);
    w.server.listen(0, host, resolve);
  });
  w.port = w.server.address().port;
  w.url = 'http://' + (host === '::1' ? 'localhost' : host) + ':' + w.port;
  w.close = () => new Promise((r) => w.server.close(() => r()));
  w.want = (box = BOX, f = { callsign: ['ACA123'] }) => mod.oskyWant(w.env, box, f);
  w.count = (call) => w.calls.filter((c) => c === call).length;
  w.pos = (box = BOX) => w.kv.json('osky:pos:' + mod.oskyBoxKey(box));
  w.report = () => w.kv.json('osky:report') || {};
  w.status = async () => (await (await mod.default.fetch(new Request('https://fids-proxy.test/osky/status'), w.env, {})).json());
  return w;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHILDREN = new Set();
process.on('exit', () => { for (const c of CHILDREN) { try { c.kill('SIGKILL'); } catch (e) { /* gone */ } } });

function writeConf(dir, lines) {
  fs.writeFileSync(path.join(dir, 'etc', 'relay.conf'), lines.join('\n') + '\n');
}

function baseEnv(fake, worker, dir) {
  return {
    PATH: process.env.PATH,
    OSKY_TEST_MODE: '1',
    OSKY_TEST_TOKEN_URL: fake.url + '/auth/token',
    OSKY_TEST_API_BASE: fake.url + '/api',
    OSKY_TEST_WORKER_URL: worker.url,
    OSKY_TEST_CONFIG_DIR: path.join(dir, 'etc'),
    OSKY_TEST_CLOCK_FILE: path.join(dir, 'clock'),
    OSKY_TEST_LOOP_S: '0.1',
    STATE_DIRECTORY: path.join(dir, 'state'),
    CREDENTIALS_DIRECTORY: path.join(dir, 'creds'),
  };
}

function runPy(args, env) {
  return spawnSync(PY, ['-I', RELAY, ...args], { env, encoding: 'utf8', timeout: 20000 });
}

function pyEval(code) {
  const r = spawnSync(PY, ['-I', '-c', `import sys; sys.path.insert(0, ${JSON.stringify(DIR)}); import relay\n${code}`],
    { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// Starts relay.py in test mode. opts: dir (reuse), conf (lines), key
// (false = none), clock (epoch s).
function startRelay(fake, worker, opts = {}) {
  const r = { dir: opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'osky-relay-')), out: '' };
  for (const d of ['etc', 'state', 'creds']) fs.mkdirSync(path.join(r.dir, d), { recursive: true });
  if (opts.conf !== undefined || !opts.dir) {
    writeConf(r.dir, opts.conf || [`STOP_AT=${FAR_STOP}`, 'DAILY_CAP=1500', 'CACHE_SECONDS=120', 'HEADING=0']);
  }
  r.env = baseEnv(fake, worker, r.dir);
  const keyFile = path.join(r.dir, 'creds', 'relay-key');
  if (opts.key === false) fs.rmSync(keyFile, { force: true });
  else if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, RELAY_KEY + '\n', { mode: 0o600 });
  r.setClock = (t) => { r.now = t; fs.writeFileSync(path.join(r.dir, 'clock'), String(t)); };
  r.setClock(opts.clock || T0);
  r.stateFile = path.join(r.dir, 'state', 'state.json');
  r.marker = path.join(r.dir, 'state', 'stopped');
  r.extended = path.join(r.dir, 'state', 'extended');
  r.status = () => { try { return JSON.parse(fs.readFileSync(path.join(r.dir, 'state', 'status.json'), 'utf8')); } catch (e) { return {}; } };
  r.child = spawn(PY, ['-I', RELAY], { env: r.env, stdio: ['ignore', 'pipe', 'pipe'] });
  CHILDREN.add(r.child);
  r.exited = new Promise((resolve) => r.child.on('exit', (code) => { CHILDREN.delete(r.child); resolve(code); }));
  r.running = () => r.child.exitCode === null && r.child.signalCode === null;
  // the exit code, or a failure after ms (never a hang)
  r.exit = (ms = 10000) => Promise.race([r.exited, sleep(ms).then(() => { throw new Error('the relay did not exit within ' + ms + ' ms'); })]);
  r.child.stdout.on('data', (d) => { r.out += d; });
  r.child.stderr.on('data', (d) => { r.out += d; });
  r.stop = async () => {
    if (r.running()) {
      r.child.kill('SIGTERM');
      const t = setTimeout(() => { try { r.child.kill('SIGKILL'); } catch (e) { /* gone */ } }, 3000);
      await r.exited;
      clearTimeout(t);
    }
  };
  return r;
}

// waits until fn() is true (the relay goes round every 0.1 s in test mode)
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(50);
  }
  assert.fail('timed out waiting for ' + what);
}
// a few more rounds, to show that something does NOT happen
const rounds = (n = 6) => sleep(n * 120);

test('the relay registers, reports, takes the client, reads what is wanted, calls OpenSky once and puts the flights', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want(BOX, { callsign: ['ACA123'] });
  await w.want(otherBox(1), { icao24: ['abc123', 'c0ffee'] });
  const r = startRelay(fake, w);
  try {
    await until(() => w.pos(BOX) && w.pos(otherBox(1)), 'both boxes to be put');
    const rec = w.kv.json('osky:relay');
    assert.equal(rec.ip, '127.0.0.1');
    assert.equal(rec.keyHash, sha(RELAY_KEY));
    assert.deepEqual(w.pos(BOX).states.map((s) => s.icao24), ['c0ffee'], 'only the flight asked for');
    assert.deepEqual(w.pos(otherBox(1)).states.map((s) => s.icao24).sort(), ['abc123', 'c0ffee']);
    for (const s of w.pos(BOX).states) assert.deepEqual(Object.keys(s).sort(), [...REDUCED].sort());
    assert.equal(fake.statesCalls, 2, 'one OpenSky call a box');
    assert.equal(fake.tokenCalls, 1);
    // the box goes upstream; the icao24 filter too when every flight is named by it
    const qs = fake.queries.map((q) => Object.keys(q).sort().join(','));
    assert.deepEqual(qs.sort(), ['icao24,lamax,lamin,lomax,lomin', 'lamax,lamin,lomax,lomin']);
    assert.deepEqual(fake.queries.find((q) => q.icao24).icao24.sort(), ['abc123', 'c0ffee']);
    assert.ok(!fake.queries.some((q) => q.callsign), 'OpenSky has no callsign filter: it is matched on the relay');
    // only the flights asked for leave the server, whatever OpenSky answered
    for (const b of w.putBodies) {
      for (const s of b.states) assert.ok(['c0ffee', 'abc123'].includes(s.icao24), 'put: ' + s.icao24);
    }
    assert.deepEqual(w.putBodies.find((b) => b.box.lamin === BOX.lamin).states.map((s) => s.icao24), ['c0ffee']);
    // the order of a round
    const firsts = [...new Set(w.calls)];
    assert.deepEqual(firsts.slice(0, 4), ['POST /osky/register', 'GET /osky/report', 'GET /osky/creds', 'GET /osky/wanted']);
    assert.deepEqual([...w.keys], [RELAY_KEY], 'the key on every locked call, and only it');
    assert.deepEqual([...new Set(fake.agents.concat(w.agents))], ['orion-connected-opensky-relay/2'],
      'its own User-Agent everywhere (Cloudflare refuses Python\'s)');
    await until(() => w.report().state === 'ready', 'a ready report');
    const st = await w.status();
    assert.equal(st.relay_registered, true);
    assert.equal(st.relay_report.calls_today, 2);
    assert.equal(st.relay_report.cap, 1500);
    assert.equal(st.relay_report.last_status, 200);
    assert.equal(st.relay_report.puts_today, 2);
    assert.equal(st.relay_report.stop_at, FAR_STOP, 'the relay reports its own stop date');
    // the fixed clock holds the answers: more rounds, no more calls or puts
    await rounds();
    assert.equal(fake.statesCalls, 2);
    assert.equal(w.count('POST /osky/put'), 2);
    assert.equal(w.count('POST /osky/register'), 1, 'registered once');
    assert.equal(w.count('GET /osky/creds'), 1, 'the client is kept in memory');
    assert.ok(w.kv.puts.filter((p) => p.k === 'osky:report').length <= 3, 'the heartbeat does not write KV every round');
    assert.ok(!fs.readdirSync(path.join(r.dir, 'state')).some((n) => fs.readFileSync(path.join(r.dir, 'state', n), 'utf8').includes(SECRET)),
      'the OpenSky client is never on disk');
    const status = r.status();
    assert.equal(status.state, 'ready');
    assert.equal(status.opensky_client_in_memory, true);
    assert.equal(status.puts_today, 2);
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('identical boxes share one OpenSky call for 120 s; a new answer is put again', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want();
  const r = startRelay(fake, w);
  try {
    await until(() => w.pos(), 'the first put');
    r.setClock(T0 + 119);
    await rounds();
    assert.equal(fake.statesCalls, 1, 'within 120 s: shared');
    r.setClock(T0 + 121);
    await until(() => fake.statesCalls === 2, 'a second call after 120 s');
    await until(() => w.count('POST /osky/put') === 2, 'the second answer put');
    // a new flight in the same box changes what goes to the Worker, from the same answer
    await w.want(BOX, { callsign: ['POE456'] });
    await until(() => w.pos().states.length === 2, 'the newly wanted flight put from the shared answer');
    assert.equal(fake.statesCalls, 2);
  } finally { await r.stop(); await fake.close(); await w.close(); }
  // the config may ask for longer, never past the Worker's 180 s position life minus a minute
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-cache-'));
  fs.writeFileSync(path.join(t, 'relay.conf'), 'STOP_AT=2026-11-12T22:59:59Z\nCACHE_SECONDS=300\n');
  assert.equal(pyEval(`relay.TEST_MODE = True; print(relay.read_settings(${JSON.stringify(t)})['cache_s'])`), '120');
});

test('a put the Worker did not take is put again from the same answer, with no new OpenSky call', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want();
  w.failPuts = 1;
  const r = startRelay(fake, w);
  try {
    await until(() => w.pos(), 'the put, on the second try');
    assert.equal(w.count('POST /osky/put'), 2, 'the failed put was tried again');
    assert.equal(fake.statesCalls, 1, 'from the shared answer');
    await rounds();
    assert.equal(w.count('POST /osky/put'), 2, 'and once it is taken, not again');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('the heading leaves the server only with HEADING=1 (not left to the Worker to strip)', PYT, async () => {
  for (const heading of ['0', '1']) {
    const fake = await fakeOpenSky();
    const w = await fakeWorker(heading === '1' ? { OSKY_HEADING: '1' } : {});
    await w.want();
    const r = startRelay(fake, w, { conf: [`STOP_AT=${FAR_STOP}`, 'HEADING=' + heading] });
    try {
      await until(() => w.pos(), 'a put');
      const sent = w.putBodies[0].states;
      assert.equal(sent.length, 1);
      if (heading === '1') {
        assert.equal(sent[0].true_track, 87.25);
        assert.equal(w.pos().states[0].true_track, 87.25);
      } else {
        assert.ok(!('true_track' in sent[0]), 'HEADING=0: no true_track in what the relay sends');
      }
      for (const k of ['squawk', 'vertical_rate', 'origin_country', 'sensors', 'spi', 'position_source', 'category']) {
        assert.ok(!(k in sent[0]), k + ' never leaves the server');
      }
    } finally { await r.stop(); await fake.close(); await w.close(); }
  }
});

test('while the Worker cannot answer, nothing goes to OpenSky; it carries on once the Worker is back', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want();
  const r = startRelay(fake, w);
  try {
    await until(() => w.pos(), 'working');
    assert.equal(fake.statesCalls, 1);
    w.down = true;
    r.setClock(T0 + 600);                        // the shared answer has run out
    const beats = w.count('GET /osky/report');
    await until(() => w.count('GET /osky/report') >= beats + 4, 'heartbeats while the Worker is down');
    assert.equal(fake.statesCalls + fake.tokenCalls, 1 + 1, 'no OpenSky call, not even a login, while the Worker is down');
    await until(() => r.status().state === 'worker-unreachable', 'said in its status');
    w.down = false;
    await until(() => fake.statesCalls === 2, 'called again once the Worker answers');
    await until(() => w.count('POST /osky/put') === 2, 'and put');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('OFF: the relay registers and reports, and nothing goes to OpenSky; switched on, it starts', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker({ OPENSKY_ON: '0' });
  await w.want();
  const r = startRelay(fake, w);
  try {
    await until(() => w.count('GET /osky/report') >= 3, 'heartbeats');
    assert.ok(w.kv.json('osky:relay'), 'registered while off');
    await until(() => w.report().state === 'off', 'reported as off');
    assert.equal(w.count('GET /osky/creds') + w.count('GET /osky/wanted') + w.count('POST /osky/put'), 0);
    assert.equal(fake.tokenCalls + fake.statesCalls, 0, 'not even a login');
    w.env.OPENSKY_ON = '1';
    await until(() => w.pos(), 'a put once switched on');
    // and off again: the client is dropped from memory
    w.env.OPENSKY_ON = '0';
    await until(() => r.status().state === 'off' && r.status().opensky_client_in_memory === false, 'off again, client dropped');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('a registration that is gone (403 on the heartbeat) is taken again, after a wait, while OFF too', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker({ OPENSKY_ON: '0' });
  const r = startRelay(fake, w);
  try {
    await until(() => w.report().state === 'off', 'registered and off');
    await w.kv.delete('osky:relay');
    await until(() => r.status().registered === false, 'the 403 noticed');
    await rounds();
    assert.equal(w.count('POST /osky/register'), 1, 'not at once: KV may still show the old record as absent for a moment');
    r.setClock(T0 + 31);
    await until(() => w.kv.json('osky:relay'), 'registered again');
    assert.equal(w.count('POST /osky/register'), 2);
    assert.equal(fake.tokenCalls + fake.statesCalls, 0);
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('no pin yet: nothing but a registration asked once a minute; pinned, it registers by itself', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker({ OSKY_RELAY_IPV4: undefined });
  await w.want();
  const r = startRelay(fake, w);
  try {
    await until(() => /waiting for the Worker to pin this server's address \(OSKY_RELAY_IPV4\); no OpenSky calls/.test(r.out), 'said in the log');
    await until(() => r.status().state === 'no-pin', 'and in the status');
    await rounds();
    assert.equal(w.count('POST /osky/register'), 1, 'no hammering');
    assert.equal(w.calls.length, 1, 'nothing else at all');
    r.setClock(T0 + 59);
    await rounds();
    assert.equal(w.count('POST /osky/register'), 1, 'still within the minute');
    r.setClock(T0 + 61);
    await until(() => w.count('POST /osky/register') === 2, 'asked again after a minute');
    await rounds();
    assert.equal(w.count('POST /osky/register'), 2);
    assert.equal(fake.tokenCalls + fake.statesCalls, 0);
    assert.equal(w.kv.m.has('osky:relay'), false);
    w.env.OSKY_RELAY_IPV4 = '127.0.0.1';         // typed in the dashboard
    r.setClock(T0 + 122);
    await until(() => w.pos(), 'registered and working');
    assert.equal(w.count('POST /osky/register'), 3);
    assert.ok(r.out.split('\n').filter((l) => /waiting for the Worker to pin/.test(l)).length === 1, 'said once, not every minute');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('not from Hetzner, or not at the pinned address: refused and retried with a growing wait; no OpenSky call', PYT, async () => {
  for (const how of ['asn', 'pin']) {
    const fake = await fakeOpenSky();
    const w = await fakeWorker(how === 'pin' ? { OSKY_RELAY_IPV4: IP2 } : {});
    if (how === 'asn') w.asn = 13335;
    const r = startRelay(fake, w);
    try {
      await until(() => w.count('POST /osky/register') === 1, 'one try');
      await rounds();
      assert.equal(w.count('POST /osky/register'), 1, how + ': waits before trying again');
      r.setClock(T0 + 31);
      await until(() => w.count('POST /osky/register') === 2, 'a second try after 30 s');
      r.setClock(T0 + 31 + 59);
      await rounds();
      assert.equal(w.count('POST /osky/register'), 2, 'then a minute');
      assert.equal(w.kv.m.has('osky:relay'), false);
      assert.equal(w.calls.length, 2, 'nothing but the registration');
      assert.equal(fake.tokenCalls + fake.statesCalls, 0);
    } finally { await r.stop(); await fake.close(); await w.close(); }
  }
  assert.match(RELAY_SRC, /^REGISTER_RETRY_MAX_S = 300$/m, 'never longer than 5 minutes between tries');
});

test('daily cap: counted on disk before each call, kept across a restart, paced by the hour, the day only moving forward', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  for (let i = 0; i < 4; i++) await w.want(otherBox(i));
  let r = startRelay(fake, w, { conf: [`STOP_AT=${FAR_STOP}`, 'DAILY_CAP=3'] });
  fake.stateFile = r.stateFile;
  try {
    await until(() => fake.statesCalls === 3, 'three calls');
    await rounds();
    assert.equal(fake.statesCalls, 3, 'the fourth box waits for the next day');
    assert.deepEqual(fake.diskCounts, [1, 2, 3], 'each call was on disk before OpenSky saw it');
    assert.deepEqual(JSON.parse(fs.readFileSync(r.stateFile, 'utf8')), { date: '2026-10-20', count: 3, backoff_until: 0 });
    await until(() => w.report().state === 'capped', 'reported as capped');

    await r.stop();
    r = startRelay(fake, w, { dir: r.dir, clock: T0 + 300 });
    await until(() => w.count('GET /osky/wanted') >= 8, 'rounds after the restart');
    assert.equal(fake.statesCalls, 3, 'a restart does not reset the count');

    r.setClock(Date.UTC(2026, 9, 19, 23, 0, 0) / 1000);     // a day back: still spent
    await rounds();
    assert.equal(fake.statesCalls, 3);
    // the next UTC day, hour 0: 1/24 of the cap (rounded up) = 1 call of 3
    r.setClock(Date.UTC(2026, 9, 21, 0, 0, 30) / 1000);
    await until(() => fake.statesCalls === 4, 'one call in hour 0');
    await rounds();
    assert.equal(fake.statesCalls, 4, 'paced: hour 0 allows one');
    r.setClock(Date.UTC(2026, 9, 21, 8, 0, 30) / 1000);    // ceil(3 * 9 / 24) = 2
    await until(() => fake.statesCalls === 5, 'the next share at hour 8');
    writeConf(r.dir, [`STOP_AT=${FAR_STOP}`, 'DAILY_CAP=99999']);
    await until(() => r.status().cap === 1500, 'the config may lower the cap, never raise it');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('OpenSky\'s 429 is obeyed, across a restart too; a refused server holds every call for 10 minutes', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want();
  fake.mode = 'rate';
  let r = startRelay(fake, w);
  try {
    await until(() => fake.statesCalls === 1, 'the 429');
    await until(() => JSON.parse(fs.readFileSync(r.stateFile, 'utf8')).backoff_until === T0 + 600, 'the wait saved');
    fake.mode = 'ok';
    await r.stop();
    r = startRelay(fake, w, { dir: r.dir, clock: T0 + 300 });
    await until(() => w.count('GET /osky/wanted') >= 6, 'rounds after the restart');
    assert.equal(fake.statesCalls, 1, 'still waiting after a restart');
    await until(() => w.report().state === 'backoff' && w.report().hold_s > 0, 'reported');
    r.setClock(T0 + 601);
    await until(() => w.pos(), 'called again after the wait');
    assert.equal(fake.statesCalls, 2);

    fake.mode = 'forbidden';                     // not whitelisted
    r.setClock(T0 + 601 + 121);
    await until(() => fake.statesCalls === 3, 'the 403');
    r.setClock(T0 + 601 + 121 + 300);
    await rounds();
    assert.equal(fake.statesCalls, 3, 'held for 10 minutes');
    await until(() => w.report().last_status === 403, 'OpenSky\'s 403 reported');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('HARD STOP at its own STOP_AT: nothing more to OpenSky, latched on disk, the relay exits; a clock set back does not undo it', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want();
  const conf = [`STOP_AT=${STOP_AT}`];
  fake.timeFn = () => STOP_S - 3600;
  let r = startRelay(fake, w, { conf, clock: STOP_S - 120 });
  try {
    await until(() => w.pos(), 'working before the stop');
    assert.ok(!fs.existsSync(r.extended), 'the Worker\'s far-off date (2099) does not extend it');
    r.setClock(STOP_S);
    assert.equal(await r.exit(), 0, 'the relay exits by itself at the stop');
    assert.equal(fs.readFileSync(r.marker, 'utf8'), `stopped for ${STOP_AT}\n`);
    assert.match(r.out, /stopped: latched for 2026-11-12T22:59:59Z/);
    assert.equal(fake.statesCalls, 1);
    assert.equal(fake.tokenCalls, 1);

    // restarted with the clock an hour back: still stopped, nothing called, not even the Worker
    const before = w.calls.length;
    r = startRelay(fake, w, { dir: r.dir, conf, clock: STOP_S - 3600 });
    assert.equal(await r.exit(), 0);
    assert.equal(w.calls.length, before);
    assert.equal(runPy(['--stopped'], r.env).status, 0, 'install.sh and the stop timer see it too');
    // the same date written again does not lift it; a later one (opensky-extend) does
    writeConf(r.dir, ['STOP_AT=2026-12-12T22:59:59Z']);
    assert.equal(runPy(['--stopped'], r.env).status, 1);
  } finally { await r.stop(); await fake.close(); await w.close(); }

  // a missing, broken or unclear stop date is a stop, not a licence without end
  for (const c of [['DAILY_CAP=1500'], ['STOP_AT=tomorrow'], ['stop_at=2027-06-01T00:00:00Z'], [' STOP_AT=2027-06-01T00:00:00Z'],
    [`STOP_AT=${FAR_STOP}`, 'STOP_AT=2099-12-01T00:00:00Z'], [`STOP_AT=${FAR_STOP}`, ' stop_at=2027-06-01T00:00:00Z']]) {
    const fake3 = await fakeOpenSky();
    const w3 = await fakeWorker();
    const r3 = startRelay(fake3, w3, { conf: c });
    try {
      assert.equal(await r3.exit(), 0, c.join(' | '));
      assert.equal(w3.calls.length + fake3.tokenCalls + fake3.statesCalls, 0, c.join(' | '));
    } finally { await r3.stop(); await fake3.close(); await w3.close(); }
  }
});

test('the Worker\'s earlier stop date stops the relay FOR NOW: nothing latched, and a later date resumes it', PYT, async () => {
  const fake = await fakeOpenSky();
  const real = nowS();
  const w = await fakeWorker({ OSKY_STOP_AT: isoS(real + 7200) });
  await w.want();
  fake.timeFn = () => real;
  const r = startRelay(fake, w, { conf: [`STOP_AT=${FAR_STOP}`], clock: real });
  try {
    await until(() => w.pos(), 'working');
    r.setClock(real + 7300);                    // past the Worker's stop, long before its own
    await until(() => r.status().state === 'worker-stopped', 'stopped for now');
    const calls = fake.statesCalls + fake.tokenCalls;
    await rounds();
    assert.ok(r.running(), 'it does not exit');
    assert.equal(fake.statesCalls + fake.tokenCalls, calls, 'nothing to OpenSky');
    assert.equal(fake.statesCalls, 1);
    assert.ok(!fs.existsSync(r.marker), 'nothing latched');
    assert.equal(r.status().opensky_client_in_memory, false, 'the client is dropped');
    w.env.OSKY_STOP_AT = isoS(real + 86400);     // the date corrected in a change
    await until(() => fake.statesCalls === 2, 'called again');
    await until(() => w.count('POST /osky/put') === 2, 'and put');
    assert.ok(!fs.existsSync(r.extended), 'an earlier Worker date than its own never moves its own');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('a 410 from the Worker (OSKY_STOP_AT unreadable, EXP4) stops the relay for now; fixed, it resumes with no console', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want();
  const r = startRelay(fake, w);
  try {
    await until(() => w.pos(), 'working');
    w.env.OSKY_STOP_AT = 'oops';
    await until(() => r.status().state === 'worker-stopped', 'stopped for now');
    r.setClock(T0 + 600);                        // the shared answer has run out
    const beats = w.count('GET /osky/report');
    const others = w.calls.length - beats;
    await until(() => w.count('GET /osky/report') >= beats + 4, 'it keeps asking the Worker');
    assert.ok(r.running(), 'it does not exit');
    assert.ok(!fs.existsSync(r.marker), 'nothing latched');
    assert.equal(fake.statesCalls, 1, 'nothing to OpenSky meanwhile');
    assert.equal(w.calls.length - w.count('GET /osky/report'), others, 'nor anything but the heartbeat to the Worker');
    assert.equal(r.status().opensky_client_in_memory, false, 'the client is dropped');
    w.env.OSKY_STOP_AT = FAR_STOP;               // the var fixed in a change
    await until(() => fake.statesCalls === 2, 'resumed');
    await until(() => w.count('POST /osky/put') === 2, 'and put');
    // and restarted while the Worker says 410: it starts, waits, and resumes the same way
    w.env.OSKY_STOP_AT = 'oops';
    await r.stop();
    const r2 = startRelay(fake, w, { dir: r.dir, clock: T0 + 1200 });
    try {
      await until(() => r2.status().state === 'worker-stopped', 'stopped for now after the restart');
      assert.ok(r2.running());
      w.env.OSKY_STOP_AT = FAR_STOP;
      await until(() => fake.statesCalls === 3, 'resumed after the restart');
    } finally { await r2.stop(); }
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

test('a later Worker stop date, by 40 days at most, becomes the relay\'s own (an extension with no console); more is ignored', PYT, async () => {
  const EXT = '2026-12-12T22:59:59Z';
  const EXT_S = Date.UTC(2026, 11, 12, 22, 59, 59) / 1000;
  const fake = await fakeOpenSky();
  const w = await fakeWorker({ OSKY_STOP_AT: EXT });
  await w.want();
  let r = startRelay(fake, w, { conf: [`STOP_AT=${STOP_AT}`] });
  try {
    await until(() => fs.existsSync(r.extended), 'the later date saved');
    assert.equal(fs.readFileSync(r.extended, 'utf8'), `extended to ${EXT}\n`);
    assert.match(r.out, /stop moved later by the Worker to 2026-12-12T22:59:59Z/);
    await until(() => r.status().stop_at === EXT && w.report().stop_at === EXT, 'its own stop date, reported to the Worker');
    assert.equal(r.status().conf_stop_at, STOP_AT, 'relay.conf is not touched');
    r.setClock(STOP_S + 60);                     // past the first term, inside the extension
    await until(() => fake.statesCalls === 2, 'still calling after the first term');
    assert.ok(r.running());
    assert.equal(runPy(['--stopped'], r.env).status, 1, 'the stop timer leaves it on');
    await r.stop();
    // a restart keeps the extension
    const beats = w.count('GET /osky/report');
    r = startRelay(fake, w, { dir: r.dir, clock: STOP_S + 120 });
    await until(() => w.count('GET /osky/report') >= beats + 4, 'rounds after the restart');
    assert.equal(r.status().stop_at, EXT, 'the saved extension read back');
    assert.ok(r.running(), 'still on after a restart');
    r.setClock(EXT_S);
    assert.equal(await r.exit(), 0, 'and it stops at the extended date');
    assert.equal(fs.readFileSync(r.marker, 'utf8'), `stopped for ${EXT}\n`);
    assert.equal(runPy(['--stopped'], r.env).status, 0);
  } finally { await r.stop(); await fake.close(); await w.close(); }

  // 41 days later (a mistyped date): ignored; the relay stops at its own date
  const fake2 = await fakeOpenSky();
  const w2 = await fakeWorker({ OSKY_STOP_AT: '2026-12-23T22:59:59Z' });
  await w2.want();
  const r2 = startRelay(fake2, w2, { conf: [`STOP_AT=${STOP_AT}`] });
  try {
    await until(() => w2.count('GET /osky/report') >= 3, 'heartbeats');
    assert.ok(!fs.existsSync(r2.extended));
    assert.equal(r2.status().stop_at, STOP_AT);
    r2.setClock(STOP_S);
    assert.equal(await r2.exit(), 0);
  } finally { await r2.stop(); await fake2.close(); await w2.close(); }
  assert.match(RELAY_SRC, /^MAX_EXTEND_S = 40 \* 86400 /m);
});

test('OpenSky\'s own clock past the stop (its Date header on the login or the data, or the data\'s time) latches it', PYT, async () => {
  for (const how of ['date', 'statesDate', 'time']) {
    const fake3 = await fakeOpenSky();
    const w3 = await fakeWorker();
    await w3.want();
    if (how === 'date') fake3.date = new Date((STOP_S + 60) * 1000).toUTCString();
    else if (how === 'statesDate') fake3.statesDate = new Date((STOP_S + 60) * 1000).toUTCString();
    else fake3.timeFn = () => STOP_S + 10;
    const r3 = startRelay(fake3, w3, { conf: [`STOP_AT=${STOP_AT}`], clock: T0 });
    try {
      assert.equal(await r3.exit(), 0, how);
      assert.equal(w3.pos(), null, how + ': the late answer is not passed on');
      assert.equal(w3.count('POST /osky/put'), 0, how);
      assert.equal(fake3.statesCalls, how === 'date' ? 0 : 1, how === 'date' ? 'the login answer\'s Date stops it before any data call' : 'one call');
      assert.equal(fs.readFileSync(r3.marker, 'utf8'), `stopped for ${STOP_AT}\n`, how + ': latched');
    } finally { await r3.stop(); await fake3.close(); await w3.close(); }
  }
});

test('login: kept in memory and renewed before its 30-minute expiry; a refused client is asked of the Worker again', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want();
  const r = startRelay(fake, w);
  try {
    await until(() => w.pos(), 'the first answer');
    r.setClock(T0 + 121);
    await until(() => fake.statesCalls === 2, 'a second call');
    assert.equal(fake.tokenCalls, 1, 'the token is reused');
    r.setClock(T0 + 1700);                       // past 30 min minus the 2 min margin
    await until(() => fake.statesCalls === 3, 'a third call');
    assert.equal(fake.tokenCalls, 2, 'renewed before it expires');
    assert.equal(w.count('GET /osky/creds'), 1, 'the client stays in memory for 30 minutes');

    // a wrong client in the Worker: one login, a 10-minute hold, and the Worker is asked again
    w.env.OPENSKY_CLIENT_SECRET = 'wrong-secret-0000';
    r.setClock(T0 + 3601);
    await until(() => fake.tokenCalls === 3, 'one login with the wrong client');
    await rounds();
    assert.equal(fake.tokenCalls, 3, 'then a 10-minute hold');
    assert.equal(fake.statesCalls, 3);
    assert.equal(w.count('GET /osky/creds'), 2, 'not asked again during the hold');
    await until(() => w.report().state === 'hold', 'reported as a hold');
    w.env.OPENSKY_CLIENT_SECRET = SECRET;
    r.setClock(T0 + 3601 + 601);
    await until(() => fake.tokenCalls === 4 && fake.statesCalls === 4, 'the fixed client in use');
    assert.equal(w.count('GET /osky/creds'), 3, 'the client is asked of the Worker again after the hold');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

// ── the network ───────────────────────────────────────────────────────────
test('IPv4 only on the way out, to OpenSky and the Worker alike', PYT, async () => {
  assert.match(RELAY_SRC, /socket\.getaddrinfo\(host, port, socket\.AF_INET, socket\.SOCK_STREAM\)/);
  assert.match(RELAY_SRC, /socket\.socket\(socket\.AF_INET, socktype, proto\)/);
  assert.doesNotMatch(RELAY_SRC, /\.bind\(|\.listen\(|http\.server|socketserver/, 'no server of any kind, no bind');
  assert.doesNotMatch(RELAY_SRC, /AF_INET6|AF_UNSPEC|create_connection|urllib\.request|urlopen/,
    'no dual-stack helper anywhere, and never urllib (its User-Agent is refused by Cloudflare)');
  assert.equal((RELAY_SRC.match(/http_request\(/g) || []).length >= 4, true);
  assert.match(INSTALL_SRC, /^RestrictAddressFamilies=AF_INET AF_UNIX AF_NETLINK$/m, 'the unit cannot open an IPv6 socket at all');
  assert.equal(pyEval("import socket; print(sorted({int(i[0]) for i in relay.resolve_ipv4('localhost', 443)}) == [int(socket.AF_INET)])"), 'True');

  // a Worker and an OpenSky that exist only on IPv6 are never reached
  let fake6, w6;
  try { fake6 = await fakeOpenSky('::1'); w6 = await fakeWorker({}, '::1'); } catch (e) { if (fake6) await fake6.close(); return; }
  await w6.want();
  const r = startRelay(fake6, w6);
  try {
    await rounds(8);
    assert.equal(w6.calls.length, 0, 'the IPv6-only Worker heard nothing');
    assert.equal(fake6.tokenCalls + fake6.statesCalls, 0);
  } finally { await r.stop(); await fake6.close(); await w6.close(); }
  // and on IPv4 the Worker sees an IPv4 caller
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  const r2 = startRelay(fake, w);
  try {
    await until(() => w.kv.json('osky:relay'), 'registered');
    assert.deepEqual([...w.families], ['IPv4']);
  } finally { await r2.stop(); await fake.close(); await w.close(); }
});

test('test mode only points at loopback, never as root, never under the production unit', NEED_PY, () => {
  assert.match(RELAY_SRC, /^TOKEN_URL = 'https:\/\/auth\.opensky-network\.org\/auth\/realms\/opensky-network\/protocol\/openid-connect\/token'$/m);
  assert.match(RELAY_SRC, /^API_BASE = 'https:\/\/opensky-network\.org\/api'$/m);
  assert.match(RELAY_SRC, new RegExp(`^DEFAULT_WORKER_URL = '${reEsc(WORKER_URL)}'$`, 'm'));
  assert.match(RELAY_SRC, /^STATE_DIR = '\/var\/lib\/opensky-relay'/m);
  const env = {
    PATH: process.env.PATH, OSKY_TEST_MODE: '1', OSKY_TEST_TOKEN_URL: 'http://127.0.0.1:9/t',
    OSKY_TEST_API_BASE: 'http://127.0.0.1:9/api', OSKY_TEST_WORKER_URL: 'http://127.0.0.1:9',
  };
  for (const [over, why] of [
    [{ OSKY_TEST_TOKEN_URL: 'https://example.org/token' }, 'the token URL'],
    [{ OSKY_TEST_API_BASE: 'https://opensky-network.org/api' }, 'the API'],
    [{ OSKY_TEST_WORKER_URL: WORKER_URL }, 'the Worker'],
    [{ OSKY_TEST_WORKER_URL: '' }, 'a missing Worker URL'],
    [{ OSKY_PRODUCTION: '1' }, 'the production unit'],
  ]) {
    const r = runPy(['--stopped'], { ...env, ...over });
    assert.equal(r.status, 2, why);
  }
  assert.equal(pyEval("relay.TEST_MODE = True; import os; os.geteuid = lambda: 0\ntry:\n    relay.load_runtime(); print('ran')\nexcept relay.Fatal as e:\n    print('refused: ' + str(e))"),
    'refused: test mode is not allowed as root');
  assert.match(INSTALL_SRC, /^Environment=OSKY_PRODUCTION=1$/m);
  assert.match(INSTALL_SRC, /^UnsetEnvironment=OSKY_TEST_MODE .*OSKY_TEST_WORKER_URL/m);
  const runtime = RELAY_SRC.slice(RELAY_SRC.indexOf('def load_runtime'), RELAY_SRC.indexOf('def make_clock'));
  assert.ok(runtime.indexOf('if not TEST_MODE:') < runtime.indexOf("os.environ.get(name)"), 'every override sits behind TEST_MODE');
  // the Worker URL in the config: https://<host> only, one clear value
  const ok = (u) => pyEval(`print(relay.worker_url_ok(${JSON.stringify(u)}))`);
  assert.equal(ok(WORKER_URL), 'True');
  for (const bad of ['http://' + WORKER_HOST, WORKER_URL + '/x', 'https://u@' + WORKER_HOST, WORKER_URL + ':8443', 'https://localhost',
    WORKER_URL + '?x=1']) assert.equal(ok(bad), 'False', bad);
});

test('the relay key: made once with secrets.token_urlsafe(32), 0600, kept on every re-run', NEED_PY, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-key-'));
  const env = { PATH: process.env.PATH, OSKY_TEST_MODE: '1', OSKY_TEST_TOKEN_URL: 'http://127.0.0.1:9/t', OSKY_TEST_API_BASE: 'http://127.0.0.1:9/a', OSKY_TEST_WORKER_URL: 'http://127.0.0.1:9' };
  const file = path.join(dir, 'relay-key');
  assert.equal(runPy(['--make-key', file], env).status, 0);
  const k = fs.readFileSync(file, 'utf8').trim();
  assert.match(k, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(runPy(['--make-key', file], env).status, 0);
  assert.equal(fs.readFileSync(file, 'utf8').trim(), k, 'kept');
  fs.writeFileSync(file, 'garbled\n');
  assert.equal(runPy(['--make-key', file], env).status, 0);
  assert.notEqual(fs.readFileSync(file, 'utf8').trim(), 'garbled', 'a bad one is replaced');
  assert.match(RELAY_SRC, /secrets\.token_urlsafe\(32\)/);
  assert.match(INSTALL_SRC, /"\$OSKY_PY" -I "\$OSKY_RELAY" --make-key "\$OSKY_KEY"/);
});

// ── the logs ──────────────────────────────────────────────────────────────
test('logs carry counts only: no key, secret, token, coordinate, callsign or icao24', PYT, async () => {
  const fake = await fakeOpenSky();
  const w = await fakeWorker();
  await w.want(BOX, { callsign: ['ACA123'] });
  await w.want(otherBox(2), { icao24: ['abc123'] });
  const r = startRelay(fake, w);
  try {
    await until(() => w.pos(BOX) && w.pos(otherBox(2)), 'both put');
    r.setClock(T0 + 3700);                      // a new hour: one line of counts
    await until(() => /hour=2026-10-20T23Z/.test(r.out), 'the hour line');
    await r.stop();
    const out = r.out;
    assert.match(out, /^opensky-relay start: relay key set: yes, stop 2099-11-12T22:59:59Z, cap 1500\/day/m);
    assert.match(out, /^opensky-relay registered with the Worker$/m);
    assert.match(out, /^opensky-relay hour=2026-10-20T23Z ticks=\d+ heartbeats=\d+ worker_errors=0 boxes=\d+ upstream=2 shared=\d+ tokens=1 puts=2 refused=0 errors=0 today=2\/1500 state=ready$/m);
    const status = fs.readFileSync(path.join(r.dir, 'state', 'status.json'), 'utf8');
    for (const text of [out, status]) {
      for (let i = 0; i + 4 <= SECRET.length; i++) assert.ok(!text.includes(SECRET.slice(i, i + 4)), 'no part of the secret');
      for (const v of [CLIENT_ID, RELAY_KEY.slice(0, 8), 'fake-access-token', String(BOX.lamin), String(BOX.lomin), String(BOX.lamax),
        'ACA123', 'POE456', 'c0ffee', 'abc123', '/osky/', 'lamin', 'Traceback']) {
        assert.ok(!text.includes(v), v + ' must not be logged');
      }
    }
    assert.ok(out.trim().split('\n').length <= 5, 'start, registered, one hour line, exit');
  } finally { await r.stop(); await fake.close(); await w.close(); }
});

// ── the installer ─────────────────────────────────────────────────────────
function embedded(name) {
  const open = INSTALL_SRC.indexOf(`cat > ${name} <<'EOF'\n`);
  assert.ok(open >= 0, name + ' is written by install.sh');
  const start = INSTALL_SRC.indexOf('\n', open) + 1;
  return INSTALL_SRC.slice(start, INSTALL_SRC.indexOf('\nEOF\n', start) + 1);
}
const COMMANDS = ['opensky-status', 'opensky-extend', 'opensky-update'];
const COMMON = '/usr/local/lib/opensky-relay/common.sh';
const UNIT = () => embedded('/etc/systemd/system/opensky-relay.service');
const unitLine = (line) => new RegExp('^' + reEsc(line) + '$', 'm');
const fnBody = (name) => {
  const at = INSTALL_SRC.indexOf('\n' + name + '() {\n');
  assert.ok(at >= 0, name + ' is in install.sh');
  return INSTALL_SRC.slice(at, INSTALL_SRC.indexOf('\n}\n', at) + 3);
};

// install.sh's own functions in a sandbox: sourced without its last line
// (main "$@"), so nothing runs but what a test calls, with every path under
// a temporary directory and chown (root only) a no-op.
function installSandbox() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-inst-'));
  const lines = INSTALL_SRC.split('\n');
  assert.equal(lines[lines.length - 2], 'main "$@"');
  fs.writeFileSync(path.join(tmp, 'functions.sh'), lines.slice(0, -2).join('\n') + '\n');
  fs.writeFileSync(path.join(tmp, 'common.sh'), embedded(COMMON));
  fs.mkdirSync(path.join(tmp, 'etc'));
  const run = (body, env = {}) => spawnSync('bash', ['-c', `. "${tmp}/functions.sh"; . "${tmp}/common.sh"
OSKY_ETC="${tmp}/etc"; OSKY_CONF="$OSKY_ETC/relay.conf"; OSKY_TIMER="${tmp}/timer"; OSKY_RELAY="${tmp}/relay.py"
chown() { :; }
${body}`], { encoding: 'utf8', env: { ...process.env, T: tmp, ...env } });
  return { tmp, run, conf: () => fs.readFileSync(path.join(tmp, 'etc', 'relay.conf'), 'utf8'),
    timer: () => fs.readFileSync(path.join(tmp, 'timer'), 'utf8') };
}

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
  const status = embedded('/usr/local/bin/opensky-status');
  const py = status.slice(status.indexOf("-I -c '\n") + 8, status.indexOf("\n' \"$OSKY_STATUS\""));
  if (PY) {
    const c = spawnSync(PY, ['-I', '-c', 'import sys; compile(sys.stdin.read(), "status", "exec")'], { input: py, encoding: 'utf8' });
    assert.equal(c.status, 0, c.stderr);
  }
});

test('install.sh: installs only the relay.py whose SHA-256 it pins', () => {
  const sum = crypto.createHash('sha256').update(fs.readFileSync(RELAY)).digest('hex');
  const m = INSTALL_SRC.match(/local RELAY_SHA256="([0-9a-f]{64})"/);
  assert.ok(m, 'install.sh pins a SHA-256');
  assert.equal(m[1], sum, 'relay.py changed: put its new SHA-256 into install.sh (shasum -a 256 stream-server/opensky-relay/relay.py)');
  assert.match(INSTALL_SRC, /got="\$\(sha256sum "\$tmp" \| cut -d ' ' -f 1\)"/);
  assert.match(INSTALL_SRC, /if \[ "\$got" != "\$want" \]; then/);
  assert.doesNotMatch(INSTALL_SRC, /install -m 0644 -o root -g root "\$tmp" "\$OSKY_RELAY"[\s\S]*got="\$\(sha256sum/,
    'the check comes before the install');
  assert.match(INSTALL_SRC, /RELAY_URL="https:\/\/raw\.githubusercontent\.com\/liloleblanc\/orionconnected\/main\/stream-server\/opensky-relay\/relay\.py"/);
});

test('install.sh: a stale relay download (GitHub\'s cache) is tried again for about 15 minutes, never installed', () => {
  const sum = crypto.createHash('sha256').update(fs.readFileSync(RELAY)).digest('hex');
  const shims = `
curl() { local out="" prev="" a; for a in "$@"; do if [ "$prev" = -o ]; then out="$a"; fi; prev="$a"; done
  local n; n=$(( $(cat "$T/n" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$T/n"
  if [ "$n" -le "$GOOD_AFTER" ]; then printf 'an old copy\\n' > "$out"; else cat "$SRC" > "$out"; fi; }
sleep() { echo "slept $1" >> "$T/log"; }
install() { echo "install $*" >> "$T/log"; }
`;
  for (const [goodAfter, ok] of [[0, true], [2, true], [99, false]]) {
    const sb = installSandbox();
    const r = sb.run(shims + `install_relay "https://example.invalid/relay.py" "${sum}"; echo installed`,
      { GOOD_AFTER: String(goodAfter), SRC: RELAY });
    const log = fs.existsSync(path.join(sb.tmp, 'log')) ? fs.readFileSync(path.join(sb.tmp, 'log'), 'utf8') : '';
    const n = Number(fs.readFileSync(path.join(sb.tmp, 'n'), 'utf8'));
    if (ok) {
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /installed/);
      assert.equal(n, goodAfter + 1, 'downloaded until it matched');
      assert.equal((log.match(/^slept 60$/gm) || []).length, goodAfter);
      assert.match(log, /^install -m 0644 -o root -g root \S+ \S+relay\.py$/m);
      if (goodAfter) assert.match(r.stdout, /does not match this installer yet \(1 of 16\)/);
    } else {
      assert.equal(r.status, 1, 'given up');
      assert.equal(n, 16, '16 downloads');
      assert.equal((log.match(/^slept 60$/gm) || []).length, 15, 'a minute apart: about 15 minutes');
      assert.doesNotMatch(log, /install -m/, 'nothing installed');
      assert.match(r.stdout, /does not match this installer, so nothing was changed/);
    }
  }
});

test('install.sh: a re-run keeps the saved stop date and settings; an unclear stop date gets the original one, once', () => {
  const DEF = STOP_AT;
  // the first run: the defaults
  let sb = installSandbox();
  let r = sb.run(`write_config ${DEF}`);
  assert.equal(r.status, 0, r.stderr);
  const conf = sb.conf();
  for (const line of [`STOP_AT=${DEF}`, 'DAILY_CAP=1500', 'CACHE_SECONDS=120', 'HEADING=0', 'WORKER_URL=' + WORKER_URL]) {
    assert.match(conf, unitLine(line), line);
  }
  assert.match(sb.timer(), /^OnCalendar=2026-11-12 22:59:59 UTC$/m);
  assert.match(sb.timer(), /^OnCalendar=hourly$/m, 'and every hour, for a later stop date from the Worker');
  // a re-run (opensky-update, or the installer run again): nothing saved is changed
  sb = installSandbox();
  fs.writeFileSync(path.join(sb.tmp, 'etc', 'relay.conf'), '# mine\nSTOP_AT=2026-12-12T22:59:59Z\nDAILY_CAP=700\nHEADING=1\nCACHE_SECONDS=60\n');
  r = sb.run(`write_config ${DEF}`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sb.conf(), '# mine\nSTOP_AT=2026-12-12T22:59:59Z\nDAILY_CAP=700\nHEADING=1\nCACHE_SECONDS=60\n', 'kept exactly');
  assert.match(sb.timer(), /^OnCalendar=2026-12-12 22:59:59 UTC$/m, 'the timer follows the saved date');
  // two STOP_AT lines (or none): the original date, once, and every other line kept
  for (const bad of ['STOP_AT=2026-12-12T22:59:59Z\nDAILY_CAP=700\n stop_at=2027-01-01T00:00:00Z\n', 'DAILY_CAP=700\n']) {
    sb = installSandbox();
    fs.writeFileSync(path.join(sb.tmp, 'etc', 'relay.conf'), bad);
    r = sb.run(`write_config ${DEF}`);
    assert.equal(r.status, 0, r.stderr);
    const c = sb.conf();
    assert.equal((c.match(/stop_at/gi) || []).length, 1, JSON.stringify(bad));
    assert.match(c, unitLine(`STOP_AT=${DEF}`));
    assert.match(c, /^DAILY_CAP=700$/m);
  }
});

test('install.sh: no tunnel, a hardened unit with the relay key via LoadCredential, no crash reports, a stop timer, nothing let in', () => {
  assert.doesNotMatch(INSTALL_SRC, /cloudflared|pkg\.cloudflare\.com|tunnel token|service install/i, 'no cloudflared, no tunnel');
  assert.doesNotMatch(INSTALL_SRC, /opensky-network/i, 'the installer never calls OpenSky');
  const unit = UNIT();
  for (const line of [
    'LoadCredential=relay-key:/etc/opensky-relay/relay-key',
    'DynamicUser=yes', 'ProtectSystem=strict', 'NoNewPrivileges=yes', 'ProtectHome=yes', 'PrivateTmp=yes',
    'ProtectProc=invisible', 'CapabilityBoundingSet=', 'ExecStart=/usr/bin/python3 -I /opt/opensky-relay/relay.py',
    'StateDirectory=opensky-relay', 'IPAddressDeny=link-local', 'LimitCORE=0', 'Restart=on-failure',
  ]) assert.match(unit, unitLine(line), line);
  assert.doesNotMatch(unit, /LoadCredential=credentials|caller-key/, 'the OpenSky client is never a file on the server');
  assert.doesNotMatch(unit, /IPAddressDeny=.*(localhost|any|127\.)/, 'the local DNS resolver needs loopback');
  // no crash report, whatever RLIMIT_CORE says: Ubuntu pipes crashes to apport
  const ncd = fnBody('no_crash_dumps');
  assert.match(ncd, /systemctl disable --now apport\.service/);
  assert.match(ncd, /systemctl mask apport\.service/);
  assert.match(ncd, /^kernel\.core_pattern=\|\/bin\/false$/m);
  assert.match(ncd, /^fs\.suid_dumpable=0$/m);
  assert.match(ncd, /sysctl -q -p \/etc\/sysctl\.d\/60-opensky-relay-no-core\.conf/);
  const main = INSTALL_SRC.slice(INSTALL_SRC.indexOf('main() {'), INSTALL_SRC.indexOf('\n}\n', INSTALL_SRC.indexOf('main() {')));
  assert.ok(main.indexOf('no_crash_dumps') > 0 && main.indexOf('no_crash_dumps') < main.indexOf('systemctl restart opensky-relay.service'),
    'no crash reports before the relay first starts');
  // the relay key: made once by the relay, root only
  assert.match(INSTALL_SRC, /chmod 0600 "\$OSKY_KEY"/);
  assert.match(INSTALL_SRC, /chown root:root "\$OSKY_KEY"/);
  assert.match(embedded(COMMON), /^OSKY_KEY=\$OSKY_ETC\/relay-key$/m);
  // the old design's files and commands go
  assert.match(INSTALL_SRC, /rm -f "\$OSKY_ETC\/credentials" "\$OSKY_ETC\/caller-key"/);
  // the stop timer: at STOP_AT and every hour, turning the relay off only once relay.py --stopped says so
  // a rebuilt server starts from install.sh's date: it moves with the Worker's
  const def = INSTALL_SRC.match(/local DEFAULT_STOP_AT="([^"]*)"/);
  const wst = WRANGLER.match(/"OSKY_STOP_AT":\s*"([^"]*)"/);
  assert.ok(def && wst);
  assert.equal(def[1], wst[1], 'install.sh DEFAULT_STOP_AT equals OSKY_STOP_AT in workers/wrangler.fids-proxy.jsonc');
  assert.ok(Date.parse(def[1]) >= STOP_MS, 'never before the first term\'s end');
  assert.match(INSTALL_SRC, /^OnCalendar=\$when$/m);
  assert.match(INSTALL_SRC, /^OnCalendar=hourly$/m);
  assert.match(INSTALL_SRC, /^Persistent=true$/m);
  assert.match(INSTALL_SRC, /^Unit=opensky-relay-stop\.service$/m);
  assert.match(INSTALL_SRC, unitLine("ExecStart=/bin/sh -c 'if /usr/bin/python3 -I /opt/opensky-relay/relay.py --stopped; then /usr/bin/systemctl disable --now opensky-relay.service; fi'"));
  assert.match(INSTALL_SRC, /systemctl enable opensky-relay-stop\.timer >\/dev\/null\n/);
  assert.doesNotMatch(INSTALL_SRC, /STOP_AT="?\$\{STOP_AT/, 'no environment override of the stop date');
  const ext = embedded('/usr/local/bin/opensky-extend');
  assert.match(ext, /\[ ! -t 0 \]/);
  assert.match(ext, /read -r -p "Type yes to move the stop date: " answer/);
  assert.match(ext, /^MAX_DAYS=40 /m);
  assert.match(ext, /rm -f "\$OSKY_STOP_MARKER"/, 'the extension lifts a latched stop');
  assert.match(ext, /osky_conf_without_stop > "\$tmp"/, 'every spelling of the old STOP_AT goes');
  // the Worker URL in the config
  assert.match(INSTALL_SRC, /^WORKER_URL=\$OSKY_DEFAULT_WORKER_URL$/m);
  assert.match(embedded(COMMON), new RegExp(`^OSKY_DEFAULT_WORKER_URL=${reEsc(WORKER_URL)}$`, 'm'));
  // ufw: nothing in, and switched on
  const fw = main.slice(main.indexOf('if command -v ufw'), main.indexOf('\n  fi\n', main.indexOf('if command -v ufw')));
  assert.match(fw, /ufw default deny incoming/);
  assert.match(fw, /ufw default allow outgoing/);
  assert.match(fw, /ufw --force enable/, 'the rules only count once ufw is enabled');
  assert.doesNotMatch(INSTALL_SRC, /ufw allow/, 'nothing is allowed in');
  // cloud-init: root, no terminal, nothing read from stdin; apt retried while busy
  assert.match(INSTALL_SRC, /apt-get -o DPkg::Lock::Timeout=600 -y -q "\$@" <\/dev\/null/);
  assert.doesNotMatch(INSTALL_SRC.slice(0, INSTALL_SRC.indexOf('write_commands() {')), /\bread -r/,
    'the installer itself never waits for input');
  assert.match(INSTALL_SRC, /^set -eEuo pipefail$/m);
  assert.doesNotMatch(main, /systemctl enable [^|\n]*2>&1(?! \|\| true)/, 'no enable with its error hidden');
  assert.ok(main.indexOf('write_commands') < main.indexOf('install_relay'), 'opensky-update exists before anything can fail');
  assert.match(embedded(COMMON), /^OSKY_INSTALLER_URL=https:\/\/raw\.githubusercontent\.com\/liloleblanc\/orionconnected\/main\/stream-server\/opensky-relay\/install\.sh$/m);
  assert.match(embedded('/usr/local/bin/opensky-update'), /curl -fsSL --retry 3 -o \/root\/o\.new "\$OSKY_INSTALLER_URL"/);
});

test('no secret, address or OpenSky call in the relay files', () => {
  for (const [name, src] of [['install.sh', INSTALL_SRC], ['relay.py', RELAY_SRC], ['README.md', README_SRC]]) {
    assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{16,}/, name + ': no token');
    for (const m of src.matchAll(/client_secret=([^\s'"\\]*)/g)) assert.ok(['', '%s'].includes(m[1]), name + ': client_secret=' + m[1]);
    const ips = [...src.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g)].map((m) => m[1]).filter((ip) => ip !== '127.0.0.1');
    assert.deepEqual(ips, [], name + ': no IP address but loopback');
    assert.ok(!src.includes(RELAY_KEY), name + ': no relay key');
  }
});

test('the README: the Cloud config, Ubuntu 24.04, the firewall first, the pin and the stop rule, no tunnel', () => {
  const cloud = README_SRC.match(/```\n\s*(#!\/bin\/bash\n[\s\S]*?)```/);
  assert.ok(cloud, 'the Cloud config block');
  const lines = cloud[1].trim().split('\n').map((l) => l.trim());
  assert.deepEqual(lines, ['#!/bin/bash', CLOUD_LINE], 'no secret, nothing to replace; #!/bin/bash so cloud-init runs it');
  // retried, saved whole, then run: never piped (a retry into a pipe runs the script twice)
  assert.match(CLOUD_LINE, /--retry \d+ --retry-all-errors/);
  assert.match(CLOUD_LINE, / -o \/root\/o .* && bash \/root\/o$/);
  assert.doesNotMatch(CLOUD_LINE, /\|/);
  for (const l of lines) assert.ok(INSTALL_SRC.includes('#        ' + l), 'install.sh documents the same lines: ' + l);
  assert.ok(ENTRY.includes(CLOUD_LINE), 'worker-entry.js shows the same line');
  for (const [name, src] of [['README', README_SRC], ['install.sh', INSTALL_SRC], ['worker-entry.js', ENTRY]]) {
    assert.doesNotMatch(src, /fids\.orionconnected\.com\/o \| bash/, name + ': the piped form is gone');
  }
  assert.match(README_SRC, /Ubuntu 24\.04/);
  assert.match(README_SRC, /not 26\.04/i);
  assert.match(README_SRC, /Firewalls\*\* page/);
  assert.match(README_SRC, /already there \(from the first attempt\), use it/, 'an existing nothing-in firewall is reused, not doubled');
  const fw = README_SRC.indexOf('nothing-in');
  const create = README_SRC.indexOf('select **Add Server**');
  assert.ok(fw > 0 && create > 0 && fw < create, 'the firewall is made before the server form is opened');
  assert.match(README_SRC, /SSH keys/);
  assert.match(README_SRC, /turn \*\*Auto delete\*\* off/, 'the Primary IP is kept, so a rebuilt server keeps the address');
  assert.doesNotMatch(README_SRC, /cloudflared service install|VPC Service|Public hostname|opensky-key|opensky-caller-key|relay_ip_sha256/,
    'the tunnel steps and the old address hash are gone');
  for (const s of ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET', 'OSKY_RELAY_IPV4', '/osky/status', 'osky:relay']) assert.ok(README_SRC.includes(s), s);
  assert.match(README_SRC, /type \*\*Secret\*\*, name `OSKY_RELAY_IPV4`/, 'the pin is a Worker secret');
  // the stop rule comes before the secrets are pasted
  const rule = README_SRC.indexOf('**Stop rule.**');
  assert.ok(rule > 0 && rule < README_SRC.indexOf('name `OPENSKY_CLIENT_ID`'), 'the stop rule is read before the OpenSky secrets');
  assert.match(README_SRC.slice(rule, rule + 600), /"relay_pin_set":true/);
  assert.match(README_SRC.slice(rule, rule + 600), /"relay_registered":true/);
  assert.match(README_SRC.slice(rule, rule + 600), /address Hetzner shows/);
  // JSON as the status page prints it: no space after the colon
  for (const m of README_SRC.matchAll(/`("[a-z_]+":\s*[^`]+)`/g)) assert.doesNotMatch(m[1], /":\s/, 'as printed: ' + m[1]);
  // the switch-on and extension changes check OSKY_STOP_AT
  assert.match(README_SRC, /check in the same file that `OSKY_STOP_AT` is still a\s+whole date/);
  assert.match(README_SRC, /by at most 40 days at a time/);
  assert.match(README_SRC, /5 to 10 minutes/);
  assert.match(README_SRC, /`DEFAULT_STOP_AT` in `install\.sh` to the same\s+date/, 'an extension moves both dates');
  assert.match(README_SRC, /checks the Cloudflare plan/, 'the KV write allowance is checked before switching on');
  assert.match(README_SRC, /tunnel/i, 'the leftover tunnel from the first design is named, to delete');
  assert.doesNotMatch(README_SRC, /only for the flights being shown, at most/, 'the reply to OpenSky says exactly what is fetched');
  assert.match(README_SRC, /filtered by icao24 when the\s+aircraft is known and otherwise filtered on the server/);
  assert.equal((README_SRC.match(new RegExp(reEsc(WORKER_HOST), 'g')) || []).length, 1, 'the Worker host written once');
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
  assert.equal(sh('DAILY_CAP=5\n stop_at=x\nSTOP_AT=y\n#c\n', 'osky_conf_without_stop'), 'DAILY_CAP=5\n#c\n');
  const out = sh('STOP_AT=2026-11-12T22:59:59Z\n', `s="$(osky_stop_at)"
    osky_valid_stop "$s" && echo valid
    osky_valid_stop "2026-11-12" || echo short-refused
    osky_write_timer "$s"; cat "$OSKY_TIMER"`);
  assert.match(out, /^valid$/m);
  assert.match(out, /^short-refused$/m);
  assert.match(out, /^OnCalendar=2026-11-12 22:59:59 UTC$/m);
  assert.match(out, /^OnCalendar=hourly$/m);
  // the Worker URL from relay.conf: one clear https://host, or none
  fs.writeFileSync(path.join(tmp, 'relay.conf'), `STOP_AT=2026-11-12T22:59:59Z\nWORKER_URL=${WORKER_URL}/\n`);
  assert.equal(pyEval(`relay.TEST_MODE = True; print(relay.read_settings(${JSON.stringify(tmp)})['worker_url'])`), WORKER_URL);
  fs.writeFileSync(path.join(tmp, 'relay.conf'), 'STOP_AT=2026-11-12T22:59:59Z\nWORKER_URL=http://example.org\n');
  assert.equal(pyEval(`relay.TEST_MODE = True; print(relay.read_settings(${JSON.stringify(tmp)})['worker_url'])`), 'None');

  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nprintf "fl=1\\nip=%s\\nts=1\\n" "$FAKE_IP"\n', { mode: 0o755 });
  const ipv4 = (ip) => sh('', 'osky_public_ipv4 || echo none', { FAKE_IP: ip, PATH: bin + ':' + process.env.PATH }).trim();
  assert.equal(ipv4('192.0.2.7'), '192.0.2.7');
  for (const bad of ['2001:db8::7', '192.0.2', '192.0.2.256', '999.1.1.1', 'garbage', '']) assert.equal(ipv4(bad), 'none', bad);
});

test('the relay\'s own stop date: relay.conf, or a later one the Worker gave it (read back as relay.py --stopped does)', NEED_PY, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osky-ext-'));
  for (const d of ['etc', 'state']) fs.mkdirSync(path.join(dir, d));
  writeConf(dir, [`STOP_AT=${STOP_AT}`]);
  const env = { PATH: process.env.PATH, OSKY_TEST_MODE: '1', OSKY_TEST_TOKEN_URL: 'http://127.0.0.1:9/t', OSKY_TEST_API_BASE: 'http://127.0.0.1:9/a',
    OSKY_TEST_WORKER_URL: 'http://127.0.0.1:9', OSKY_TEST_CONFIG_DIR: path.join(dir, 'etc'), OSKY_TEST_CLOCK_FILE: path.join(dir, 'clock'),
    STATE_DIRECTORY: path.join(dir, 'state') };
  const stoppedAt = (t) => { fs.writeFileSync(path.join(dir, 'clock'), String(t)); return runPy(['--stopped'], env).status; };
  const ext = path.join(dir, 'state', 'extended');
  assert.equal(stoppedAt(STOP_S), 0, 'no extension: stopped at relay.conf\'s date');
  fs.writeFileSync(ext, 'extended to 2026-12-12T22:59:59Z\n');
  assert.equal(stoppedAt(STOP_S), 1, 'extended');
  assert.equal(stoppedAt(Date.UTC(2026, 11, 12, 22, 59, 59) / 1000), 0, 'stopped at the extended date');
  for (const bad of ['extended to soon\n', 'garbage', '', 'extended to 2026-12-12T22:59:59Z extra\n']) {
    fs.writeFileSync(ext, bad);
    assert.equal(stoppedAt(STOP_S), 0, 'an unreadable extension is none: ' + JSON.stringify(bad));
  }
  fs.writeFileSync(ext, 'extended to 2026-10-01T00:00:00Z\n');
  assert.equal(stoppedAt(STOP_S - 60), 1, 'an "extension" earlier than relay.conf never shortens or lengthens it');
  assert.equal(stoppedAt(STOP_S), 0);
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
    ['2027-07-01', '2027-07-01T21:59:59Z'],    // summer
    ['2026-02-30', ''],                        // not a date
  ]) assert.equal(sh(`osky_swiss_day_end ${day}`), want, day);
  const shown = sh('osky_show_time 2026-11-12T22:59:59Z');
  assert.match(shown, /Thu 12 Nov 2026, 23:59:59 CET  \(Swiss time\)/);
  assert.match(shown, /Thu 12 Nov 2026, 18:59:59 AST  \(Moncton time\)/);
  assert.equal(sh('osky_show_time ""'), '(no stop date saved)');
});

// ── the /o short link ─────────────────────────────────────────────────────
test('fids.orionconnected.com/o serves install.sh, like /s and /t', async () => {
  const at = ENTRY.indexOf('const STREAM_INSTALLERS = {');
  assert.ok(at >= 0);
  const ifAt = ENTRY.indexOf('if (STREAM_INSTALLERS[path]) {', at);
  let i = ENTRY.indexOf('{', ifAt), depth = 0;
  for (; i < ENTRY.length; i++) {
    if (ENTRY[i] === '{') depth++;
    else if (ENTRY[i] === '}' && --depth === 0) break;
  }
  const block = ENTRY.slice(at, i + 1);
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
  assert.ok(ENTRY.includes(CLOUD_LINE), 'the comment shows the Cloud config line in use');
  // the fids-proxy Worker is deployed with its own config (checked live 2026-10-18)
  assert.match(ENTRY, /deployed from workers\/wrangler\.fids-proxy\.jsonc/);
});
