'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24078 — THE BOARDS' SIDE OF OPENSKY: live aircraft positions from The
// OpenSky Network first, Flightradar24 only when OpenSky has nothing.
//
// The relay (stream-server/opensky-relay/, tested in opensky-relay.test.js)
// makes every OpenSky call, at most 1,500 a day, each wanted box asked again
// every 2 minutes. The Worker's /oskypos route is what the boards reach:
//
//   · the BOX PLANNER: a box of 25 sq deg or less drawn around one of our
//     airports (never taken from the request), on a half-degree grid, shared
//     by every screen and by an airport well inside another's box; a new box
//     only while the relay has room at its pace; a gate's tracked flight
//     first; a wish lapsing when no screen asks. Simulated over a day of
//     screens: never more calls than the relay's 1,500, never ahead of its
//     hourly pace.
//   · MATCHING: the board's own flight, by icao24 or by a callsign carrying
//     its digits (the callsigns the board makes for Flightradar24, and the
//     one Flightradar24 saw today); reduced to what the board draws.
//   · OFF and STOP: OPENSKY_ON other than "1", or past OSKY_STOP_AT: { on:
//     false }, nothing stored; a page that is not ours: a bare 403.
//   · the BOARD (fids-core.js, lifted): OpenSky first; Flightradar24 asked
//     exactly as before whenever OpenSky has nothing, is off, stopped or
//     unreachable, and not at all when it has the aircraft: FR24 lookups
//     only go down.
//   · the CREDIT: "Flight positions: The OpenSky Network" on the board while
//     a position it gave is drawn; the Schäfer et al. (IPSN 2014) citation
//     on the credits page; all nine languages.
// Nothing here reaches OpenSky, Flightradar24 or Cloudflare.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const WORKER_PATH = path.join(ROOT, 'workers', 'fids-proxy.js');
const WORKER_SRC = rd('workers/fids-proxy.js');
const CORE = rd('fids-current/js/fids-core.js');
const CREDITS = rd('fids-current/credits.html');
const HOME_JS = rd('fids-current/js/home.js');
const BS = require(path.join(ROOT, 'fids-current/js/board-strings.js'));
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];

let MOD = null;
const mod = async () => (MOD = MOD || await import(WORKER_PATH));

function fakeKv() {
  const m = new Map();
  const puts = [];
  return {
    m, puts,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v, o) {
      const ttl = o && o.expirationTtl;
      if (ttl !== undefined && !(Number.isFinite(ttl) && ttl >= 60)) throw new Error('KV: expirationTtl must be at least 60');
      puts.push({ k, ttl }); m.set(k, String(v));
    },
    async delete(k) { m.delete(k); },
    json(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
  };
}
const ORIGIN = 'https://fids.orionconnected.com';
const T = Date.UTC(2026, 9, 22, 0, 0, 30);              // 00:00:30Z, a fresh UTC day
function world(extra = {}) {
  const kv = fakeKv();
  const env = { FIDS_LIVE_FLIGHTS: kv, OPENSKY_ON: '1', OSKY_STOP_AT: '2026-11-12T22:59:59Z', ...extra };
  return { kv, env };
}
async function ask(w, q, { now = T, origin = ORIGIN, method = 'GET' } = {}) {
  const m = await mod();
  const url = new URL('https://fids-proxy.test/oskypos?' + new URLSearchParams(q));
  const h = new Headers();
  if (origin) h.set('Origin', origin);
  const res = await m.handleOskyPos(new Request(url, { method, headers: h }), w.env, url, now);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: res.status, headers: res.headers, json };
}
// what the relay would see as wanted (the Worker's own reading of the document)
function wantedBoxes(kv, now) {
  const doc = kv.json('osky:wanted');
  const out = [];
  for (const [k, e] of Object.entries((doc && doc.boxes) || {})) {
    const tags = Object.keys(e.f).filter((t) => e.f[t] > now);
    if (tags.length) out.push({ key: k, box: e.box, tags, p: e.p || {} });
  }
  return out;
}
// the relay putting OpenSky's answer for a wanted box (its reduced fields)
function relayPut(kv, key, states, now = T) {
  kv.m.set('osky:pos:' + key, JSON.stringify({ at: new Date(now).toISOString(), time: Math.floor(now / 1000), box: null, credit: 'Data: OpenSky Network', states }));
}
const S = (o = {}) => ({ icao24: 'c0ffee', callsign: 'JZA8890', lat: 46.3, lon: -64.2, baro_altitude: 1000, geo_altitude: 1040,
  on_ground: false, velocity: 100, time_position: Math.floor(T / 1000) - 7, last_contact: Math.floor(T / 1000) - 2, ...o });

// ── THE BOX PLANNER ─────────────────────────────────────────────────────────
test('each board airport has one box: 25 sq deg or less, around it, centred on the half-degree grid', async () => {
  const m = await mod();
  const coords = m._farArrCoords;
  assert.ok(Object.keys(coords).length > 50);
  for (const [code, [lat, lon]] of Object.entries(coords)) {
    const b = m.oskyAirportBox(code);
    assert.ok(b, code);
    const area = (b.lamax - b.lamin) * (b.lomax - b.lomin);
    assert.ok(area <= 25 + 1e-9 && area > 20, `${code}: ${area} sq deg (1 credit, and not wasted)`);
    assert.ok(b.lamin < lat && lat < b.lamax && b.lomin < lon && lon < b.lomax, code + ' is inside its box');
    const cLat = (b.lamin + b.lamax) / 2, cLon = (b.lomin + b.lomax) / 2;
    assert.ok(Math.abs(cLat * 2 - Math.round(cLat * 2)) < 1e-6 && Math.abs(cLon * 2 - Math.round(cLon * 2)) < 1e-6, code + ' on the grid');
    // about square on the ground: within a fifth
    const hNm = (b.lamax - b.lamin) * 60, wNm = (b.lomax - b.lomin) * 60 * Math.cos(cLat * Math.PI / 180);
    assert.ok(Math.abs(hNm - wNm) / hNm < 0.2, `${code}: ${hNm.toFixed(0)} x ${wNm.toFixed(0)} nm`);
  }
  assert.equal(m.oskyAirportBox('ZZZ'), null, 'an airport the boards do not serve has no box');
  assert.deepEqual(m.oskyAirportBox('YQM'), { lamin: 43.95, lomin: -67.5, lamax: 48.05, lomax: -61.5 });
});

test('the box budget: what the relay can serve at its pace, from its own report', async () => {
  const m = await mod();
  const at = (h, min = 0) => Date.UTC(2026, 9, 22, h, min);
  const rep = (calls, when, cap = 1500) => ({ at: new Date(when).toISOString().replace(/\.\d{3}Z$/, 'Z'), cap, calls_today: calls });
  assert.equal(m.oskyBoxBudget(null, at(12)), 2, 'no report: 1,500 a day is 62.5 an hour, two boxes at 30 an hour');
  assert.equal(m.oskyBoxBudget(rep(0, at(12)), at(12, 5)), 4, 'a quiet morning leaves room for more in the afternoon');
  assert.equal(m.oskyBoxBudget(rep(1490, at(20)), at(20, 5)), 0, 'the day spent: no new box');
  assert.equal(m.oskyBoxBudget(rep(0, at(11)), at(12)), 2, 'a report 1 h old is not read');
  assert.equal(m.oskyBoxBudget(rep(0, Date.UTC(2026, 9, 21, 23, 50)), at(0, 5)), 2, 'yesterday\'s count is not today\'s');
  assert.equal(m.oskyBoxBudget(rep(0, at(12), 300), at(12, 5)), 0, 'a lower cap on the relay is obeyed');
  assert.equal(m.oskyBoxBudget(rep(0, at(23, 30), 99999), at(23, 40)), 8, 'never over the relay\'s 1,500, and 8 boxes at most');
  // whatever the report says, the boxes it allows, kept to the end of the day, fit what is left
  for (let h = 0; h < 24; h++) for (const used of [0, 200, 700, 1200, 1499]) {
    const now = at(h, 7);
    const n = m.oskyBoxBudget(rep(used, now - 60000), now);
    const hoursLeft = (Date.UTC(2026, 9, 23) - now) / 3600000;
    assert.ok(n * 30 * Math.max(1, hoursLeft) <= 1500 - used + 1e-6, `h${h} used ${used}: ${n} boxes`);
  }
  assert.match(WORKER_SRC, /^const OSKY_RELAY_CAP = 1500; +\/\/ relay\.py MAX_DAILY_CAP$/m);
  assert.match(rd('stream-server/opensky-relay/relay.py'), /^MAX_DAILY_CAP = 1500 /m, 'the Worker plans with the relay\'s own cap');
  assert.match(rd('stream-server/opensky-relay/relay.py'), /^DEFAULT_CACHE_S = 120$/m, 'and its own pace');
});

test('every screen at an airport names the same box; airports well inside one box share it', async () => {
  const w = world();
  await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890', p: '2' });
  await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890', p: '2' }, { now: T + 1000 });
  await ask(w, { ap: 'YQM', f: 'WS3420', cs: 'WJA3420' }, { now: T + 2000 });
  let boxes = wantedBoxes(w.kv, T + 3000);
  assert.equal(boxes.length, 1, 'deduped: one box for the airport');
  assert.deepEqual(boxes[0].tags.sort(), ['c:ACA8890', 'c:WJA3420']);
  assert.deepEqual(boxes[0].p, { 'c:ACA8890': 2 }, 'the gate\'s own flight is marked tracked');
  assert.equal(w.kv.puts.filter((p) => p.k === 'osky:wanted').length, 2, 'the same wish again is not written again');
  // Saint John is 1.4 degrees inside Moncton's box: it shares it
  await ask(w, { ap: 'YSJ', f: 'AC8920', cs: 'ACA8920' }, { now: T + 4000 });
  boxes = wantedBoxes(w.kv, T + 5000);
  assert.equal(boxes.length, 1, 'one call serves both airports');
  assert.equal(boxes[0].tags.length, 3);
  // and in the other order too
  const w2 = world();
  await ask(w2, { ap: 'YSJ', f: 'AC8920', cs: 'ACA8920' });
  await ask(w2, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890' }, { now: T + 1000 });
  assert.equal(wantedBoxes(w2.kv, T + 2000).length, 1);
  // Halifax is under a degree inside it: its own box
  await ask(w, { ap: 'YHZ', f: 'AC8810', cs: 'ACA8810' }, { now: T + 6000 });
  assert.equal(wantedBoxes(w.kv, T + 7000).length, 2);
  // the wish is written again once it is 5 minutes old, and lapses 10 minutes after the last ask
  const n = w.kv.puts.length;
  await ask(w, { ap: 'YHZ', f: 'AC8810', cs: 'ACA8810' }, { now: T + 6000 + 200e3 });
  assert.equal(w.kv.puts.length, n, 'not yet');
  await ask(w, { ap: 'YHZ', f: 'AC8810', cs: 'ACA8810' }, { now: T + 6000 + 301e3 });
  assert.equal(w.kv.puts.length, n + 1, '5 minutes on');
  const left = wantedBoxes(w.kv, T + 6000 + 301e3 + 600e3 - 1000);
  assert.deepEqual(left.map((b) => b.tags), [['c:ACA8810']], 'Moncton\'s box lapsed: no screen asked for 10 minutes');
  assert.equal(wantedBoxes(w.kv, T + 6000 + 301e3 + 600e3 + 1000).length, 0, 'and then Halifax\'s');
});

test('no more boxes than the relay can serve; a gate\'s tracked flight first', async () => {
  const w = world();
  // two boxes fill the budget with no report (2)
  await ask(w, { ap: 'YYZ', f: 'AC100', cs: 'ACA100' });
  await ask(w, { ap: 'YVR', f: 'AC200', cs: 'ACA200' }, { now: T + 1000 });
  assert.equal(wantedBoxes(w.kv, T + 2000).length, 2);
  // a third airport's lookup that no gate is tracking: no room, Flightradar24 as before
  let r = await ask(w, { ap: 'MIA', f: 'AA300', cs: 'AAL300' }, { now: T + 2000 });
  assert.deepEqual(r.json.ac, []);
  assert.equal(wantedBoxes(w.kv, T + 3000).length, 2, 'refused');
  // a gate's own tracked flight takes the place of a box no gate is tracking
  r = await ask(w, { ap: 'MIA', f: 'AA300', cs: 'AAL300', p: '2' }, { now: T + 3000 });
  let boxes = wantedBoxes(w.kv, T + 4000);
  assert.equal(boxes.length, 2);
  assert.ok(boxes.some((b) => b.tags.includes('c:AAL300')));
  assert.ok(!boxes.some((b) => b.tags.includes('c:ACA200')), 'of two untracked boxes, the newer gave way');
  // two tracked boxes: a third tracked flight waits
  await ask(w, { ap: 'YVR', f: 'AC200', cs: 'ACA200', p: '2' }, { now: T + 4000 });
  await ask(w, { ap: 'YYZ', f: 'AC100', cs: 'ACA100', p: '2' }, { now: T + 5000 });
  boxes = wantedBoxes(w.kv, T + 6000);
  assert.equal(boxes.length, 2);
  assert.ok(!boxes.some((b) => b.tags.includes('c:ACA100')), 'no tracked box is pushed out');
  // four flights a box at most: the tracked ones stay
  const w2 = world();
  await ask(w2, { ap: 'YQM', f: 'AC1', cs: 'ACA1', p: '2' });
  for (let i = 2; i <= 6; i++) await ask(w2, { ap: 'YQM', f: 'AC' + i, cs: 'ACA' + i }, { now: T + i * 1000 });
  const b = wantedBoxes(w2.kv, T + 10000)[0];
  assert.equal(b.tags.length, 4);
  assert.ok(b.tags.includes('c:ACA1'), 'the tracked flight kept its place');
});

test('the relay is handed the boxes with tracked flights first', async () => {
  const m = await mod();
  const w = world({ OSKY_RELAY_IPV4: '192.0.2.44' });
  const key = 'k'.repeat(43);
  const call = async (method, p, body) => {
    const h = new Headers({ 'CF-Connecting-IP': '192.0.2.44', 'X-Relay-Key': key });
    if (body) h.set('Content-Type', 'application/json');
    const req = new Request('https://fids-proxy.test' + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    Object.defineProperty(req, 'cf', { value: { asn: 24940 } });
    return (await m.default.fetch(req, w.env, { waitUntil() {} })).json();
  };
  await call('POST', '/osky/register', { relayKey: key });
  const now = Date.now();
  // a report saying the relay has the whole day ahead: room for more boxes
  w.kv.m.set('osky:report', JSON.stringify({ at: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'), cap: 1500, calls_today: 0 }));
  await ask(w, { ap: 'YYZ', f: 'AC100', cs: 'ACA100' }, { now });
  await ask(w, { ap: 'YYZ', f: 'AC101', cs: 'ACA101' }, { now: now + 1 });
  await ask(w, { ap: 'YVR', f: 'AC200', cs: 'ACA200', p: '2' }, { now: now + 2 });
  const got = await call('GET', '/osky/wanted');
  assert.deepEqual(got.boxes.map((b) => b.callsign), [['ACA200'], ['ACA100', 'ACA101']]);
});

test('a day of screens: never more OpenSky calls than the relay\'s 1,500, never ahead of its pace', async () => {
  const m = await mod();
  const w = world();
  // eight airports' gates, each tracking a flight all day, and a lookup each
  const aps = ['YQM', 'YHZ', 'YYZ', 'YUL', 'YVR', 'MIA', 'SYD', 'ZRH'];
  const day0 = Date.UTC(2026, 9, 22);
  let calls = 0;
  const relayCache = {};
  // every write of the wanted list holds no more boxes than the relay has room for
  let writes = 0, clock = day0;
  const put = w.kv.put;
  w.kv.put = async (k, v, o) => {
    if (k === 'osky:wanted') {
      writes++;
      const n = Object.keys(JSON.parse(v).boxes).length;
      assert.ok(n <= m.oskyBoxBudget(w.kv.json('osky:report'), clock), `${n} boxes at ${new Date(clock).toISOString()}`);
    }
    return put(k, v, o);
  };
  for (let t = day0; t < day0 + 86400000; t += 60000) {
    clock = t;
    for (const [i, ap] of aps.entries()) {
      await ask(w, { ap, f: 'AC' + (100 + i), cs: 'ACA' + (100 + i), p: '2' }, { now: t });
      if (t % 300000 === 0) await ask(w, { ap, f: 'AC' + (500 + i), cs: 'ACA' + (500 + i) }, { now: t });
    }
    // the relay: once a minute, each wanted box in order, again every 120 s,
    // within its paced allowance; its report every 10 minutes
    const h = new Date(t).getUTCHours();
    const paced = Math.min(1500, Math.ceil(1500 * (h + 1) / 24));
    for (const b of wantedBoxes(w.kv, t)) {
      if (relayCache[b.key] && t - relayCache[b.key] < 120000) continue;
      if (calls >= paced) break;
      calls++; relayCache[b.key] = t;
    }
    assert.ok(calls <= paced, `ahead of the pace at ${new Date(t).toISOString()}`);
    if (t % 600000 === 0) w.kv.m.set('osky:report', JSON.stringify({ at: new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'), cap: 1500, calls_today: calls }));
  }
  assert.ok(calls <= 1500, `${calls} calls`);
  assert.ok(writes < 24 * 60 * 2, `${writes} writes of the wanted list: a few a minute at most`);
  assert.ok(calls >= 1200, `${calls} calls: the day's allowance is used, not wasted`);
});

// ── MATCHING ────────────────────────────────────────────────────────────────
test('the board\'s own flight: by a callsign with its digits, or by its icao24; reduced to what the board draws', async () => {
  const m = await mod();
  const w = world();
  let r = await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890,JZA8890', p: '2' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { on: true, stop_at: '2026-11-12T22:59:59Z', credit: 'Data: OpenSky Network', ac: [] }, 'wanted, nothing yet');
  const key = wantedBoxes(w.kv, T)[0].key;
  assert.equal(key, m.oskyBoxKey(m.oskyAirportBox('YQM')));
  relayPut(w.kv, key, [S(), S({ icao24: 'abc123', callsign: 'JZA8891', lat: 46.0 }), S({ icao24: 'e1e1e1', callsign: 'WJA8890' })]);
  r = await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890,JZA8890', p: '2' }, { now: T + 1000 });
  assert.deepEqual(r.json.ac, [{ hex: 'c0ffee', flight: 'JZA8890', lat: 46.3, lon: -64.2, alt_baro: 3281, gs: 194, seen_pos: 8, by: 'callsign' }],
    'feet and knots, as the board reads Flightradar24');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN, 'our page, by name: never "*"');
  // a callsign that is not this flight's number is not asked by, nor matched
  r = await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'JZA8891' }, { now: T + 2000 });
  assert.deepEqual(r.json.ac, []);
  assert.ok(!wantedBoxes(w.kv, T + 2000)[0].tags.includes('c:JZA8891'));
  // by icao24 (an earlier answer named it), even with no callsign
  r = await ask(w, { ap: 'YQM', f: 'AC8890', hex: 'C0FFEE' }, { now: T + 3000 });
  assert.equal(r.json.ac[0].by, 'icao24');
  assert.ok(wantedBoxes(w.kv, T + 3000)[0].tags.includes('i:c0ffee'));
  // a tail squawking another flight's number is not this flight
  r = await ask(w, { ap: 'YQM', f: 'AC8890', hex: 'abc123' }, { now: T + 4000 });
  assert.deepEqual(r.json.ac, []);
  // on the ground, and no speed: what it has
  relayPut(w.kv, key, [S({ on_ground: true, velocity: null, baro_altitude: null })]);
  r = await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'JZA8890' }, { now: T + 5000 });
  assert.deepEqual(r.json.ac, [{ hex: 'c0ffee', flight: 'JZA8890', lat: 46.3, lon: -64.2, alt_baro: 'ground', seen_pos: 12, by: 'callsign' }]);
});

test('the callsign Flightradar24 saw today for the number is tried first (AC7754 flies as PVL7754)', async () => {
  const w = world();
  const day = new Date(T).toISOString().slice(0, 10);
  w.kv.m.set('acmem:v1:AC7754', JSON.stringify({ obs: [{ d: '2026-10-20', t: 'DH8D', cs: 'JZA7754' }, { d: day, t: 'DH8C', cs: 'PVL7754', ts: T - 3600e3 }] }));
  await ask(w, { ap: 'YQM', f: 'AC7754', cs: 'ACA7754', p: '2' });
  const b = wantedBoxes(w.kv, T)[0];
  assert.deepEqual(b.tags, ['c:PVL7754'], 'today\'s, not the conversion and not yesterday\'s');
  relayPut(w.kv, b.key, [S({ callsign: 'PVL7754', icao24: 'c0c0c0' })]);
  const r = await ask(w, { ap: 'YQM', f: 'AC7754', cs: 'ACA7754', p: '2' }, { now: T + 1000 });
  assert.equal(r.json.ac[0].flight, 'PVL7754');
});

test('/oskypos asks Flightradar24 nothing, and stores nothing but the wish', async () => {
  const w = world();
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('no upstream from /oskypos'); };
  try {
    await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890', p: '2' });
    relayPut(w.kv, wantedBoxes(w.kv, T)[0].key, [S({ callsign: 'ACA8890' })]);
    await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890', p: '2' }, { now: T + 1000 });
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual([...new Set(w.kv.puts.map((p) => p.k))], ['osky:wanted'], 'never trk:v1, acmem, adsbans or a copy of a position');
  assert.ok(w.kv.puts.every((p) => p.ttl === 600));
});

// ── OFF, STOP, NOT OUR PAGE ─────────────────────────────────────────────────
test('switched off, past the licence\'s end, or a stop date that cannot be read: { on:false }, nothing stored', async () => {
  for (const env of [{ OPENSKY_ON: '0' }, { OPENSKY_ON: undefined }, { OPENSKY_ON: 'true' },
    { OSKY_STOP_AT: '2026-10-22T00:00:00Z' }, { OSKY_STOP_AT: 'soon' }]) {
    const w = world(env);
    const r = await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890', p: '2' });
    assert.equal(r.status, 200, JSON.stringify(env));
    assert.deepEqual(r.json, { on: false });
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN, 'the board can read it, and stops asking');
    assert.equal(w.kv.puts.length, 0, 'nothing wanted');
  }
  // the hard stop holds for a wish too
  const m = await mod();
  const w = world({ OSKY_STOP_AT: '2026-10-22T00:00:00Z' });
  assert.equal(await m.oskyBoardWant(w.env, w.kv, 'YQM', 'c:ACA8890', 2, T), null);
});

test('a page that is not ours gets a bare 403, and an unknown airport or flight a 400', async () => {
  const w = world();
  for (const origin of ['https://example.com', 'https://orionconnected.com.evil.test', 'http://fids.orionconnected.com', 'null', '']) {
    const r = await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890' }, { origin });
    assert.equal(r.status, 403, origin);
    assert.equal(r.headers.get('access-control-allow-origin'), null, origin + ': no CORS header');
  }
  for (const origin of ['https://fids.orionconnected.com', 'https://www.orionconnected.ca', 'https://orionconnected.app',
    'https://yqm.orionconnected.app', 'http://localhost:8080', 'https://fids.n-leblanc1984.workers.dev']) {
    assert.equal((await ask(w, { ap: 'YQM', f: 'AC8890', cs: 'ACA8890' }, { origin })).status, 200, origin);
  }
  assert.equal((await ask(w, { ap: 'ZZZ', f: 'AC8890', cs: 'ACA8890' })).status, 400, 'not a board airport: no box');
  assert.equal((await ask(w, { ap: 'YQM', f: '../x', cs: 'ACA8890' })).status, 400);
  assert.equal((await ask(w, { ap: 'YQM', f: 'AC8890' }, { method: 'POST' })).status, 405);
  // and the route is reached before everything else in the Worker
  const m = await mod();
  const res = await m.default.fetch(new Request('https://fids-proxy.test/oskypos?ap=YQM&f=AC1', { headers: { Origin: 'https://example.com' } }), w.env, { waitUntil() {} });
  assert.equal(res.status, 403);
});

// ── THE BOARD ───────────────────────────────────────────────────────────────
// fids-core.js's position lookups, lifted as they are, against a fake Worker
const LOOKUPS = CORE.slice(CORE.indexOf("var _ADSB_BASE = 'https://fids-proxy.n-leblanc1984.workers.dev/adsb';"), CORE.indexOf('// ── v22891 — SURROUNDING TRAFFIC'));
function board({ osky = 'empty', fr24 = 'found', iata = 'YQM' } = {}) {
  const log = [];
  const win = { _gateIata: iata };
  const fetch = async (url) => {
    const u = new URL(url);
    log.push(u.pathname + u.search);
    if (u.pathname === '/oskypos') {
      if (osky === 'down') throw new TypeError('Failed to fetch');
      if (osky === 'forbidden') return new Response('{"error":"forbidden"}', { status: 403 });
      const body = osky === 'off' ? { on: false }
        : osky === 'stopped' ? { on: true, stop_at: '2026-10-01T00:00:00Z', ac: [] }
          : { on: true, stop_at: '2026-11-12T22:59:59Z', credit: 'Data: OpenSky Network',
            ac: typeof osky === 'function' ? osky(u) : osky === 'found' ? [{ hex: 'c0ffee', flight: 'JZA8890', lat: 46.3, lon: -64.2, alt_baro: 3281, gs: 194, seen_pos: 8, by: 'callsign' }]
              : osky === 'other' ? [{ hex: 'c0ffee', flight: 'JZA8891', lat: 46.3, lon: -64.2, alt_baro: 3281, gs: 194, seen_pos: 8, by: 'icao24' }] : [] };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    // /adsb/*: Flightradar24 behind the Worker
    const ac = fr24 === 'found' ? [{ hex: 'c0ffee', flight: 'JZA8890', r: 'C-GKUH', t: 'CRJ9', lat: 46.2, lon: -64.3, alt_baro: 3300, gs: 190, seen_pos: 5 }] : [];
    return new Response(JSON.stringify({ ac, _provider: 'fr24', ...(fr24 === 'quiet' ? { _quiet: true } : {}) }), { status: 200 });
  };
  const api = new Function('window', 'fetch', 'CALLSIGN_TO_IATA', 'render', 'console',
    LOOKUPS + '; return { tele: _adsbTelemetry, cached: _adsbCached, creditOn: _oskyCreditOn, state: function () { return { off: _oskyOffUntil, stop: _oskyStopAt }; } };'
  )(win, fetch, { ACA: 'AC', JZA: 'AC', WJA: 'WS' }, () => {}, { log() {} });
  const fr24Of = () => log.filter((p) => p.startsWith('/adsb/'));
  const osk = () => log.filter((p) => p.startsWith('/oskypos'));
  return { api, log, win, fr24: fr24Of, osk };
}
async function at(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
}

test('the board asks OpenSky first, and Flightradar24 not at all when OpenSky has the aircraft', async () => {
  const b = board({ osky: 'found' });
  const r = await at(T, () => b.api.tele(null, '', 'AC8890', '', true));
  assert.deepEqual(b.osk(), ['/oskypos?ap=YQM&f=AC8890&cs=ACA8890&p=2'], 'the callsign the board would ask Flightradar24 by, and the gate\'s own flight');
  assert.deepEqual(b.fr24(), [], 'no Flightradar24 lookup');
  assert.equal(r.osky, true);
  assert.equal(r.alt, 3281); assert.equal(r.spd, 194); assert.equal(r.lat, 46.3); assert.equal(r.lng, -64.2);
  assert.equal(r.via, 'callsign'); assert.equal(r.cs, 'JZA8890'); assert.equal(r.fl, 'AC8890');
  assert.equal(r.reg, null, 'OpenSky gives no registration: the airport\'s own stays');
  assert.equal(b.win._adsbLast.AC8890, r, 'published where the maps read it');
  assert.equal(b.api.creditOn(), false, 'fetched is not drawn: no credit yet');
  b.api.cached(null, '', 'AC8890');
  assert.equal(b.api.creditOn(), true, 'drawn: the credit is due');
});

test('Flightradar24 is asked exactly as before whenever OpenSky has nothing, is off, stopped or unreachable', async () => {
  const base = board({ osky: 'off' });
  // the same lookups the board made before OpenSky: what main asks
  const lifted = (v) => { const b = board(v); return b; };
  for (const fr24 of ['found', 'none', 'quiet']) {
    const ref = lifted({ osky: 'off', fr24 });
    ref.api.state();
    await at(T, () => ref.api.tele(null, '', 'AC8890', '', true));
    for (const osky of ['empty', 'other', 'down', 'forbidden', 'stopped']) {
      const b = lifted({ osky, fr24 });
      await at(T, () => b.api.tele(null, '', 'AC8890', '', true));
      assert.deepEqual(b.fr24(), ref.fr24(), `${osky}, Flightradar24 ${fr24}: the same lookups`);
    }
  }
  assert.ok(base);
});

test('off, stopped or unreachable: the board stops asking OpenSky, silently', async () => {
  for (const [osky, quietMs] of [['off', 600000], ['forbidden', 600000], ['down', 300000]]) {
    const b = board({ osky });
    await at(T, () => b.api.tele(null, '', 'AC8890', '', true));
    await at(T + quietMs - 1000, () => b.api.tele(null, '', 'AC8891', '', true));
    assert.equal(b.osk().length, 1, osky + ': not asked again for a while');
    await at(T + quietMs + 1000, () => b.api.tele(null, '', 'AC8892', '', true));
    assert.equal(b.osk().length, 2, osky + ': asked again after it');
  }
  // past the licence's end the Worker says so, and the board never asks again
  const b = board({ osky: 'stopped' });
  await at(Date.UTC(2026, 9, 2), () => b.api.tele(null, '', 'AC8890', '', true));
  await at(Date.UTC(2026, 9, 3), () => b.api.tele(null, '', 'AC8891', '', true));
  assert.equal(b.osk().length, 1);
  // no airport, or nothing to ask by: OpenSky is not asked
  const nb = board({ osky: 'found', iata: '' });
  await at(T, () => nb.api.tele(null, '', 'AC8890', '', true));
  assert.equal(nb.osk().length, 0);
  assert.equal(nb.fr24().length, 1);
});

test('measured over an hour of gate polls: Flightradar24 lookups go down, never up', async () => {
  const run = async (osky) => {
    let n = 0;
    const b = board({ osky: (u) => (osky === 'found' && n++ > 0 ? [{ hex: 'c0ffee', flight: 'JZA8890', lat: 46.3, lon: -64.2, alt_baro: 3281, gs: 194, seen_pos: 8, by: 'callsign' }] : []) });
    for (let i = 0; i < 60; i++) {
      await at(T + i * 60000, () => b.api.tele(null, '', 'AC8890', '', true));
    }
    return { fr24: b.fr24().length, osky: b.osk().length, log: b.log };
  };
  const before = await run('never');      // OpenSky never has it: as main
  const after = await run('found');       // OpenSky has it from its second answer
  assert.equal(before.fr24, 60, 'one Flightradar24 lookup a poll, as before');
  assert.equal(after.fr24, 1, 'only the first poll, before the relay\'s first answer');
  assert.ok(after.fr24 <= before.fr24);
  // the icao24 Flightradar24 named is OpenSky's filter from then on
  assert.match(after.log.filter((p) => p.startsWith('/oskypos'))[1], /&hex=c0ffee&/);
});

test('the gate poll marks its own flight tracked, and every map resolver carries OpenSky\'s mark to the credit', () => {
  assert.match(CORE, /_adsb = await _adsbTelemetry\(inb\._reg, inb\._callSign, flt, _inbHex, true\);/);
  assert.match(CORE, /at: _fxAt, fl: flt, via: _adsb\.via \|\| '', cs: _adsb\.cs \|\| '', osky: _adsb\.osky === true \};\n\s+if \(_adsb\.osky === true\) _oskyShown\(\);/);
  assert.match(CORE, /inb\._liveOsky = _adsb\.osky === true;/);
  assert.match(CORE, /src: 'poll', osky: lp\.osky === true \}/);
  assert.match(CORE, /src: 'adsb', osky: v\.osky === true \}/);
  assert.match(CORE, /src: 'feed', osky: inb\._liveOsky === true \}/);
  assert.match(CORE, /if \(best && best\.osky\) _oskyShown\(\);\n  return best;/);
  assert.match(CORE, /if \(osky\) _oskyShown\(\);\n  return \{ lat: lat, lng: lng, onGround: !!\(c && c\.onGround === true\), src: src, osky: osky \};/);
  // never into the flown track, the aircraft memory or a log
  const fn = CORE.slice(CORE.indexOf('async function _oskyTelemetry('), CORE.indexOf('async function _adsbTelemetry('));
  assert.doesNotMatch(fn, /fltrack|acmem|localStorage|console\./);
});

// ── THE CREDIT ──────────────────────────────────────────────────────────────
function lift(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head + ' must exist');
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('no end for ' + head);
}
function creditBoard({ col = true, oskyOn = true } = {}) {
  const made = [];
  const node = (cls) => {
    const n = { className: cls || '', hidden: false, innerHTML: '', style: {}, kids: [], parentNode: null, isConnected: true,
      offsetWidth: 400, scrollWidth: 300, clientWidth: 600, tag: '' };
    n.appendChild = (k) => { k.parentNode = n; n.kids.push(k); };
    n.removeChild = (k) => { n.kids = n.kids.filter((x) => x !== k); k.parentNode = null; };
    return n;
  };
  const colNode = node('gad-media-col'), gateMap = node('gate-map');
  const doc = {
    querySelector: (sel) => {
      if (sel === '.g8-wrap .gad-media-col') return col ? colNode : null;
      if (sel === '.gate-photo-credit') return made.find((k) => k.parentNode) || null;
      return null;
    },
    getElementById: (id) => (id === 'gateMapBox' ? gateMap : null),
    createElement: (tag) => { const n = node(); n.tag = tag; made.push(n); return n; },
  };
  const timers = [];
  const state = { on: oskyOn };
  const credit = new Function('BoardStrings', 'document', 'window', 'getComputedStyle', 'setInterval', 'clearInterval', '_oskyCreditOn',
    'var _GATE_PHOTO_MINZ = 14; var _GATE_PHOTO_MAPS = []; var _gatePhotoCreditTurn = 0, _gatePhotoCreditTimer = null; '
      + lift(CORE, 'function _gatePhotoInView(') + '; ' + lift(CORE, 'function _gatePhotoCredit(') + '; return _gatePhotoCredit;'
  )(BS, doc, { _gateIata: 'YQM' }, () => ({ fontSize: '10px' }), (fn) => { timers.push(fn); return timers.length; },
    (id) => { timers[id - 1] = null; }, () => state.on);
  const tick = () => timers.forEach((f) => f && f());
  const photoMap = (z) => {
    const box = node('gate-map');
    return { box, getContainer: () => box, getZoom: () => z, getBounds: () => ({ intersects: () => true }), _fidsPhoto: [{ ap: 'YQM', b: {} }] };
  };
  return { credit, tick, state, colNode, gateMap, photoMap, line: () => made.find((k) => k.parentNode) };
}

test('the board\'s credit: "Flight positions: The OpenSky Network" while a position it gave is drawn, one language at a time', () => {
  const b = creditBoard();
  b.credit(null);
  assert.equal(b.line().parentNode, b.colNode, 'in the strip under the centre panel, where the photo\'s credit goes');
  assert.match(b.line().innerHTML, /lang="en"[^>]*>Flight positions: The OpenSky Network</);
  b.tick();
  assert.match(b.line().innerHTML, /lang="fr"[^>]*>Positions des vols : OpenSky Network</);
  b.state.on = false; b.tick();
  assert.equal(b.line().hidden, true, 'gone with the position');
  // no centre panel: in the gate map's corner
  const nc = creditBoard({ col: false });
  nc.credit(null);
  assert.equal(nc.line().parentNode, nc.gateMap);
  assert.match(nc.line().className, /gate-photo-credit-onmap/);
  // with Moncton's photo in view too, the line takes the two in turn, each in every language
  const both = creditBoard();
  both.credit(both.photoMap(17));
  const seen = [];
  for (let i = 0; i < 4; i++) { seen.push(both.line().innerHTML.replace(/<[^>]+>/g, '').slice(0, 16)); both.tick(); }
  assert.deepEqual(seen, ['Contains informa', 'Flight positions', 'Contient de l’in', 'Positions des vo']);
  // and the photo's own line is untouched without OpenSky
  const photo = creditBoard({ oskyOn: false });
  photo.credit(photo.photoMap(17));
  assert.match(photo.line().innerHTML, /Open Government Licence/);
  photo.tick();
  assert.match(photo.line().innerHTML, /gouvernement ouvert/);
});

test('the credit is drawn again whenever it is not up (the first position can come before the panel)', () => {
  const calls = [];
  let el = null;
  const doc = { querySelector: (sel) => (sel === '.gate-photo-credit' ? el : null) };
  const f = new Function('document', 'window', '_gatePhotoCredit',
    'var _oskyShownAt = 0, _OSKY_CREDIT_MS = 120000; ' + lift(CORE, 'function _oskyShown(') + '; ' + lift(CORE, 'function _oskyCreditOn(') + '; return { shown: _oskyShown, on: _oskyCreditOn };'
  )(doc, {}, (m) => calls.push(m));
  f.shown();
  assert.equal(calls.length, 1, 'first time: drawn');
  f.shown();
  assert.equal(calls.length, 2, 'nothing held it: drawn again');
  el = { hidden: false };
  f.shown();
  assert.equal(calls.length, 2, 'up: left alone (its own 8 s turn keeps it)');
  el.hidden = true;
  f.shown();
  assert.equal(calls.length, 3, 'hidden: drawn again');
  assert.equal(f.on(), true);
});

test('the credit, the credits page and its citation, in all nine languages', () => {
  for (const k of ['mapCreditOsky', 'credFlightsH', 'credOsky', 'credOskyCite']) {
    for (const l of LANGS) assert.ok(typeof BS.STR[k][l] === 'string' && BS.STR[k][l].trim(), `${k}.${l}`);
  }
  // the name never breaks across lines (the display rule)
  for (const l of LANGS) assert.match(BS.STR.mapCreditOsky[l], /OpenSky Network$/, l);
  assert.equal(BS.STR.mapCreditOsky.en, 'Flight positions: The OpenSky Network');
  // the credits page: its own section, the boards' line quoted, the paper cited as published
  const sec = CREDITS.slice(CREDITS.indexOf('aria-labelledby="c-flights"'), CREDITS.indexOf('aria-labelledby="c-earth"'));
  assert.match(sec, /data-i18n="credFlightsH"/);
  assert.match(sec, /<blockquote data-i18n="mapCreditOsky" data-i18n-one>/);
  assert.match(sec, /data-i18n="credOskyCite" data-i18n-one data-i18n-fill/);
  assert.match(sec, /data-cite-authors="Matthias Schäfer, Martin Strohmeier, Vincent Lenders, Ivan Martinovic, Matthias Wilhelm"/);
  assert.match(sec, /data-cite-paper="Bringing Up OpenSky: A Large-scale ADS-B Sensor Network for Research"/);
  assert.match(sec, /data-cite-venue="Proceedings of the 13th IEEE\/ACM International Symposium on Information Processing in Sensor Networks \(IPSN\)"/);
  assert.match(sec, /href="https:\/\/opensky-network\.org"/);
  assert.match(HOME_JS, /el\.hasAttribute\('data-cite-paper'\)/, 'home.js fills the record in');
  // filled, in every language: the authors, the title and the proceedings as published, pages 83-94, 2014
  const f = { AUTHORS: 'Matthias Schäfer, Martin Strohmeier, Vincent Lenders, Ivan Martinovic, Matthias Wilhelm',
    PAPER: 'Bringing Up OpenSky: A Large-scale ADS-B Sensor Network for Research', VENUE: 'Proceedings of the 13th IEEE/ACM International Symposium on Information Processing in Sensor Networks (IPSN)' };
  for (const l of LANGS) {
    const s = BS.fmt('credOskyCite', l, f, true);
    assert.ok(s.includes(f.AUTHORS) && s.includes(f.PAPER) && s.includes(f.VENUE) && /83/.test(s) && /94/.test(s) && /2014/.test(s), l + ': ' + s);
    assert.doesNotMatch(s, /\{[A-Z]+\}/, l);
  }
  // the page's lead names flight positions among the credits
  const lead = { en: 'flight positions', fr: 'positions des vols', es: 'las posiciones de los vuelos', de: 'Flugpositionen', it: 'posizioni dei voli',
    pt: 'posições dos voos', ja: '航空機の位置', zh: '航班位置', ar: 'ومواقع الرحلات' };
  for (const l of LANGS) assert.ok(BS.STR.credLead[l].includes(lead[l]), l);
  assert.match(CREDITS, /<meta name="description" content="[^"]*flight positions/);
});
