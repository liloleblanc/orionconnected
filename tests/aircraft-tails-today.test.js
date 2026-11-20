'use strict';

// WHY THIS EXISTS
//
// v24169. Moncton gate 4, 2026-11-19: FR24 saw AC1986 from Toronto as C-FFIQ,
// a 737 MAX 8 flown as ROU1986, at 22:05 ADT (KV acmem:v1:AC1986, filed
// under the UTC date 2026-11-20). That aircraft flies AC1983 to Toronto at
// 05:00. The gate showed AC1983 with no registration at any point, and the
// type as "Boeing 737 MAX 8 expected", because:
//   1. every pairing is unverified since the AeroDataBox lookups died, and an
//      unverified inbound never lent its tail to the departure;
//   2. /acinfo never handed back the tail the worker had kept, and a running
//      screen never asked again once it held a type;
//   3. the expected tag dropped only on a registry lookup that answers {};
//   4. FR24 files a partner flight under its own prefix (RV1986, PB7664), and
//      the /adsb/ route remembered the first row without checking it.
// These run the real functions lifted out of fids-core.js and the worker,
// as tests/gate-pairing-operator.test.js does. Nothing here reaches the
// network: fetch is stubbed and every FR24 answer below is a fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const workerPath = path.join(root, 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(workerPath, 'utf8');

function fnSource(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let i = CORE.search(new RegExp('(^|\\n)(async )?function ' + escaped + '\\('));
  assert.ok(i >= 0, name + ' must exist');
  if (CORE[i] === '\n') i++;
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1);
}
function stmtSource(prefix) {
  const i = CORE.indexOf(prefix);
  assert.ok(i >= 0, prefix + ' must exist');
  return CORE.slice(i, CORE.indexOf(';\n', i) + 1);
}
// An object literal or an IIFE, brace-matched from its opening line.
function blockSource(prefix, tail) {
  const i = CORE.indexOf(prefix);
  assert.ok(i >= 0, prefix + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1) + tail;
}

const VARS = ['var AC_EXPRESS_OP = ', 'var _OP_LADDER_NAMES = ', 'var _AC_OP_BANDS = ', 'var _OP_JAZZ_ONLY_TYPE = ',
  'var _OP_WS_DASH8 = ', 'var _AC_OWN_OPERATORS = ', 'var _OP_SHORT_CS = ', 'var _GATE_TAIL_CS_EXPRESS = ',
  'var _ACRES_LEG_MS = ', "var _ACINFO_BASE = ", 'var _acInfoTried = '];
const FNS = ['acOperatorBand', '_opLadderName', '_opEvLegId', '_opEvFarGet', 'fidsResolveOperator', '_csDigitsOk',
  '_acResLeg', '_acResolvedPut', '_acResolvedGet', '_acInfoKick',
  '_gateTailCsPrefixes', '_gateInboundFr24Seen', '_gateFr24TypeSeen'];

// The real callsign tables, so the operator to callsign mapping is the board own.
const TABLES = blockSource('const CALLSIGN_TO_IATA = {', ';') + '\n'
  + blockSource('var _IATA_TO_CALLSIGN = (function () {', ')();');

function engine(fetchStub) {
  const window = { _gateIata: 'YQM', _ACRES: {} };
  const src = [TABLES].concat(VARS.map(stmtSource), FNS.map(fnSource))
    .concat(['return { ' + FNS.concat(['_IATA_TO_CALLSIGN']).map((n) => n + ': ' + n).join(', ') + ' };']).join('\n');
  const codes = { B38M: '7M8', DH8D: 'DH4', A320: '320' };
  const names = { B38M: 'Boeing 737 MAX 8', '7M8': 'Boeing 737 MAX 8', DH8D: 'De Havilland Dash 8-400', DH4: 'De Havilland Dash 8-400' };
  let rebuilt = 0;
  const api = new Function('window', 'fetch', 'aircraftCodeToIata', 'formatAircraft', 'gateAircraftShortname',
    'requestGateRebuild', 'AIRLINE_NAME', 'CALLSIGN_ICAO', '_regionalOpFitsRoute', src)(
    window, fetchStub || (() => Promise.reject(new Error('no fetch in this test'))),
    (s) => codes[s] || '', (s) => names[s] || '', (s) => s, () => { rebuilt++; },
    { AC: 'Air Canada', RV: 'Air Canada Rouge', PB: 'PAL Airlines', QK: 'Jazz Aviation', WS: 'WestJet' }, {}, () => true);
  api.window = window;
  api.rebuilt = () => rebuilt;
  return api;
}

// Moncton is UTC-4 in November. Wall clock -> epoch ms.
const T = (d, hh, mm) => Date.UTC(2026, 10, d, hh + 4, mm);
const SEEN_AC1986 = 1795140297603;   // FR24 answer for AC1986, 2026-11-20T02:04:57Z
const AC1986 = () => ({ flight: 'AC1986', airline: 'AC', gate: '4', origin: 'YYZ', _locIata: 'YYZ', _sortTs: T(20, 0, 9), status: 'early' });
const AC7754 = () => ({ flight: 'AC7754', airline: 'AC', gate: '4', origin: 'YOW', _locIata: 'YOW', _sortTs: T(19, 18, 39), status: 'arrived' });
const AC1983 = () => ({ flight: 'AC1983', airline: 'AC', gate: '4', dest: 'YYZ', _locIata: 'YYZ', _sortTs: T(20, 5, 0) });
const AC7753 = () => ({ flight: 'AC7753', airline: 'AC', gate: '4', dest: 'YOW', _locIata: 'YOW', _sortTs: T(20, 7, 10) });
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── D: the resolved store keeps what FR24 saw ─────────────────────────────

test('an FR24 sighting is kept as such, and a later guess never replaces its type', () => {
  const e = engine();
  e._acResolvedPut(AC1986(), 'Boeing 737 MAX 8', '7M8', 'C-FFIQ', { reg: 'C-FFIQ', cs: 'ROU1986' });
  e._acResolvedPut(AC1986(), 'Airbus A320', '320', '');
  const v = e._acResolvedGet(AC1986());
  assert.deepEqual([v.nm, v.cd, v.reg], ['Boeing 737 MAX 8', '7M8', 'C-FFIQ']);
  assert.deepEqual(v.seen, { reg: 'C-FFIQ', cs: 'ROU1986', nm: 'Boeing 737 MAX 8', cd: '7M8' });
});

test('/acinfo basis today puts the tail and the sighting on the inbound leg', async () => {
  const asked = [];
  const e = engine((url) => {
    asked.push(url);
    return Promise.resolve({ ok: true, json: () => ({ f: 'AC1986', type: 'B38M', reg: 'C-FFIQ', cs: 'ROU1986', source: 'fr24', basis: 'today' }) });
  });
  e._acInfoKick(AC1986(), 'arr');
  await tick(); await tick();
  assert.match(asked[0], /acinfo\?f=AC1986&other=YYZ&at=dep&ts=\d+/);
  const v = e._acResolvedGet(AC1986());
  assert.equal(v.reg, 'C-FFIQ');
  assert.deepEqual([v.seen.reg, v.seen.cs, v.seen.cd], ['C-FFIQ', 'ROU1986', '7M8']);
  assert.equal(e.rebuilt(), 1);
});

test('a usual-type answer never carries a tail, and a held type with no tail still takes one', async () => {
  let answer = { f: 'AC1986', type: 'B38M', reg: 'C-XXXX', source: 'fr24', basis: 'usual' };
  const e = engine(() => Promise.resolve({ ok: true, json: () => answer }));
  e._acInfoKick(AC1986(), 'arr');
  await tick(); await tick();
  assert.equal(e._acResolvedGet(AC1986()).reg, '', 'usual: type only');
  // The screen had the usual type before AC1986 flew; ten minutes on it asks again.
  e._acInfoKick(AC1986(), 'arr');
  await tick(); await tick();
  assert.equal(e._acResolvedGet(AC1986()).reg, '', 'at most once per leg per 10 minutes');
  answer = { f: 'AC1986', type: 'B38M', reg: 'C-FFIQ', cs: 'ROU1986', source: 'fr24', basis: 'today' };
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60000;
  try {
    e._acInfoKick(AC1986(), 'arr');
    await tick(); await tick();
  } finally { Date.now = realNow; }
  assert.equal(e._acResolvedGet(AC1986()).reg, 'C-FFIQ', 'the tail reaches a screen that was already running');
});

test('the inbound asks /acinfo whenever it has no tail, even with a type', () => {
  const at = CORE.indexOf('AND THE TAIL, ON A SCREEN THAT IS ALREADY RUNNING');
  assert.ok(at > 0);
  const blk = CORE.slice(at, at + 1600);
  assert.match(blk, /if \(_inbR2 && !_inbEquipNm && !_inbEquipCd\) \{/);
  assert.match(blk, /if \(!\(_inbR2 && _inbR2\.reg\) && !_ib2\._reg && typeof _acInfoKick === 'function'\) \{\n\s+_acInfoKick\(_ib2, 'arr'\);/);
  assert.match(CORE, /if \(!_acR\.reg && !currentFlight\._reg && typeof _acInfoKick === 'function'\) _acInfoKick\(currentFlight, 'dep'\);/,
    'the departure held with a type and no tail asks again too');
  assert.match(CORE, /_acResolvedPut\(inb, _atNm, _atCd, inb\._reg \|\| '', \{ reg: _adsb\.reg \|\| '', cs: _adsb\.cs \|\| '' \}\);/,
    'the poll own FR24 answer is stored as a sighting');
});

// ── E: the inbound tail on the departure ──────────────────────────────────

test('the operator callsigns come from the board own tables', () => {
  const e = engine();
  assert.deepEqual(e._gateTailCsPrefixes('AC', 'RV'), ['ROU']);
  assert.deepEqual(e._gateTailCsPrefixes('AC', 'PB'), ['PVL']);
  assert.deepEqual(e._gateTailCsPrefixes('AC', 'QK'), ['JZA']);
  assert.deepEqual(e._gateTailCsPrefixes('AC', 'ACEX').sort(), ['JZA', 'PVL']);
  assert.deepEqual(e._gateTailCsPrefixes('AC', ''), ['ACA'], 'mainline Air Canada, ACA only');
  assert.deepEqual(['WS', 'PD', 'PB', 'TS', 'F8', 'WR'].map((m) => e._gateTailCsPrefixes(m, '')[0]),
    ['WJA', 'POE', 'PVL', 'TSC', 'FLE', 'WEN']);
  assert.deepEqual(e._gateTailCsPrefixes('WS', 'WR'), ['WEN']);
});

test('gate 4, Nov 19: AC1986 seen by FR24 as C-FFIQ (ROU1986) lends its tail to AC1983', () => {
  const e = engine();
  e._acResolvedPut(AC1986(), 'Boeing 737 MAX 8', '7M8', 'C-FFIQ', { reg: 'C-FFIQ', cs: 'ROU1986' });
  const inb = Object.assign(AC1986(), { _identityUnverified: true, _doorOnly: false });
  const seen = e._gateInboundFr24Seen(AC1983(), inb, 'YQM');
  assert.ok(seen, 'the sighting passes');
  assert.equal(seen.reg, 'C-FFIQ');
});

test('a PAL tail (PVL) never shows on a Rouge departure', () => {
  const e = engine();
  e._acResolvedPut(AC7754(), 'De Havilland Dash 8-400', 'DH4', 'C-GPOJ', { reg: 'C-GPOJ', cs: 'PVL7754' });
  assert.equal(e._gateInboundFr24Seen(AC1983(), AC7754(), 'YQM'), null);
  // It does lend to AC7753, the flight it night-stops for: the 7700 block is
  // the Express brand both partners fly, so PVL passes.
  assert.equal(e._gateInboundFr24Seen(AC7753(), AC7754(), 'YQM').reg, 'C-GPOJ');
});

test('a door pick (_doorOnly) never lends its tail', () => {
  const e = engine();
  e._acResolvedPut(AC1986(), 'Boeing 737 MAX 8', '7M8', 'C-FFIQ', { reg: 'C-FFIQ', cs: 'ROU1986' });
  assert.equal(e._gateInboundFr24Seen(AC1983(), Object.assign(AC1986(), { _doorOnly: true }), 'YQM'), null);
});

test('no sighting, no tail: a usual type or a feed tail is never lent, nor a callsign of another number', () => {
  const e = engine();
  e._acResolvedPut(AC1986(), 'Boeing 737 MAX 8', '7M8', 'C-FFIQ');
  assert.equal(e._gateInboundFr24Seen(AC1983(), AC1986(), 'YQM'), null, 'no FR24 sighting');
  const e2 = engine();
  e2._acResolvedPut(AC1986(), 'Boeing 737 MAX 8', '7M8', 'C-FFIQ', { reg: 'C-FFIQ', cs: 'ROU2040' });
  assert.equal(e2._gateInboundFr24Seen(AC1983(), AC1986(), 'YQM'), null, 'heard under another number');
  const e3 = engine();
  e3._acResolvedPut(AC1986(), 'Boeing 737 MAX 8', '7M8', 'C-FFIQ', { reg: 'C-FFIQ', cs: 'ROU1986' });
  const mainline = Object.assign(AC1983(), { flight: 'AC1100' });   // no partner band: ACA only
  assert.equal(e3._gateInboundFr24Seen(mainline, AC1986(), 'YQM'), null);
});

test('the caption takes the lent tail only where its own tail is empty, and keeps the v22928 rule', () => {
  const at = CORE.indexOf('v22928 — and never borrow a tail from an inbound that was only matched');
  assert.ok(at > 0, 'the v22928 reasoning stays');
  const blk = CORE.slice(at, at + 4000);
  assert.match(blk, /WHAT IS LENT NOW, AND WHY THAT IS NOT THE C-FUJA CASE/);
  assert.match(blk, /_gateInboundFr24Seen\(_cf, _ib2, /);
  assert.match(blk, /if \(!_inboundReg && _inbFrSeen && _inbFrSeen\.reg\) _inboundReg = _inbFrSeen\.reg;/);
  assert.match(blk, /var _acReg = _currentReg \|\| _inboundReg;/, 'the departure own tail still comes first');
});

// ── F: no expected tag on a type FR24 saw ─────────────────────────────────

test('a type FR24 saw today on the aircraft shown carries no expected tag', () => {
  const e = engine();
  const seen = { reg: 'C-FFIQ', cs: 'ROU1986', nm: 'Boeing 737 MAX 8', cd: '7M8' };
  assert.equal(e._gateFr24TypeSeen(seen, 'Boeing 737 MAX 8', '7M8', ''), true, 'no tail on screen');
  assert.equal(e._gateFr24TypeSeen(seen, 'Boeing 737 MAX 8', '7M8', 'C-FFIQ'), true, 'its own tail');
  assert.equal(e._gateFr24TypeSeen(seen, 'Boeing 737 MAX 8', '7M8', 'C-FGKH'), false, 'another aircraft named');
  assert.equal(e._gateFr24TypeSeen(seen, 'Airbus A320', '320', ''), false, 'another type shown');
  assert.equal(e._gateFr24TypeSeen(null, 'Boeing 737 MAX 8', '7M8', ''), false, 'a guessed type keeps its tag');
  const blk = CORE.slice(CORE.indexOf('A TYPE FR24 SAW IS NOT A PLAN'), CORE.indexOf('A TYPE FR24 SAW IS NOT A PLAN') + 2400);
  assert.match(blk, /if \(_typeSeen\) _regConfirmed = true;/);
  assert.match(blk, /if \(_acModel && !_acReg && !_typeSeen\) \{/, 'the common branch, type and no tail, too');
  assert.match(blk, /_equipFromInb \? _inbFrSeen/, 'an inbound type only through the same test as its tail');
});

// ── A, B, C: the worker ───────────────────────────────────────────────────

test('/acinfo hands back the tail only within 12 h of the leg, matched on time, not the UTC day', async () => {
  const { acMemToday, acMemKeysFor } = await import(workerPath);
  const rec = { obs: [{ d: '2026-11-17', t: 'B38M' }, { d: '2026-11-20', t: 'B38M', cs: 'ROU1986', r: 'CFFIQ', ts: SEEN_AC1986 }] };
  assert.deepEqual(acMemToday([rec], T(20, 0, 9)), { type: 'B38M', reg: 'C-FFIQ', cs: 'ROU1986', ts: SEEN_AC1986 });
  assert.equal(acMemToday([rec], T(20, 0, 9) + 24 * 3600000), null, 'tomorrow night AC1986 is another leg');
  assert.equal(acMemToday([rec], SEEN_AC1986 - 13 * 3600000), null);
  assert.equal(acMemToday([rec], 0), null, 'no leg time, no tail');
  assert.equal(acMemToday([{ obs: [{ d: '2026-11-20', t: 'B38M', r: 'GXLEA', ts: SEEN_AC1986 }] }], SEEN_AC1986), null,
    'a tail that would print wrong is not handed back');
  assert.deepEqual(acMemKeysFor('AC1986'), ['AC1986', 'RV1986', 'PB1986', 'QK1986']);
  assert.deepEqual(acMemKeysFor('WS812'), ['WS812']);
});

function kvEnv(store) {
  return {
    FIDS_USERS: { async get() { return JSON.stringify({ username: 'admin' }); }, async put() {} },
    FIDS_LIVE_FLIGHTS: {
      async get(k, o) { const v = store.has(k) ? store.get(k) : null; return (v && o && o.type === 'json') ? JSON.parse(v) : v; },
      async put(k, v) { store.set(k, v); },
    },
  };
}
function edgeCache() {
  const edge = new Map();
  return { edge, default: {
    async match(req) { const v = edge.get(req.url); return v ? new Response(v.body, { headers: v.headers }) : undefined; },
    async put(req, res) { edge.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
  } };
}

test('/acinfo for AC1986 at 00:09 answers C-FFIQ from the KV FR24 kept, with no upstream call', async () => {
  const store = new Map();
  const c = edgeCache();
  globalThis.caches = c;
  const realFetch = globalThis.fetch;
  let upstream = 0;
  globalThis.fetch = async () => { upstream++; throw new Error('no upstream'); };
  try {
    const mod = await import(workerPath);
    store.set('acmem:v1:AC1986', JSON.stringify({ obs: [{ d: '2026-11-17', t: 'B38M' },
      { d: '2026-11-20', t: 'B38M', cs: 'ROU1986', r: 'CFFIQ', ts: SEEN_AC1986 }] }));
    const ask = (f, ts) => mod.default.fetch(new Request(`https://fids-proxy.example/acinfo?f=${f}&at=dep&ts=${ts}`), kvEnv(store), { waitUntil() {} });
    const r1 = await ask('AC1986', T(20, 0, 9));
    const j1 = await r1.json();
    assert.deepEqual([j1.type, j1.reg, j1.cs, j1.basis], ['B38M', 'C-FFIQ', 'ROU1986', 'today']);
    assert.match(r1.headers.get('Cache-Control'), /max-age=600/);
    // The same number a day later: only the usual type, kept briefly.
    const r2 = await ask('AC1986', T(21, 0, 9));
    const j2 = await r2.json();
    assert.deepEqual([j2.type, j2.reg, j2.basis], ['B38M', null, 'usual']);
    assert.match(r2.headers.get('Cache-Control'), /max-age=120/, 'an answer without a tail is not held long');
    // Filed by FR24 under the operator prefix only (PB7664): still found for AC7664.
    store.set('acmem:v1:PB7664', JSON.stringify({ obs: [{ d: '2026-11-18', t: 'DH8D', cs: 'PVL7664', r: 'CFPVJ', ts: Date.UTC(2026, 10, 18, 15) }] }));
    const j3 = await (await ask('AC7664', Date.UTC(2026, 10, 18, 17))).json();
    assert.deepEqual([j3.type, j3.reg, j3.cs, j3.basis], ['DH8D', 'C-FPVJ', 'PVL7664', 'today']);
    assert.equal(upstream, 0, 'no FR24 call, no feed call');
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.caches;
  }
});

test('/adsb/ picks the row that is the flight asked for, and files it under the number asked too', async () => {
  const { adsbRowMatches: ok, adsbPickRow: pick } = await import(workerPath);
  assert.equal(ok('flight', 'AC1986', { flight: 'RV1986', callsign: 'ROU1986' }), true);
  assert.equal(ok('flight', 'AC8542', { flight: '', callsign: 'JZA542' }), true, 'the Jazz short form');
  assert.equal(ok('flight', 'AC7748', { flight: '', callsign: 'FPPI' }), true, 'nothing to compare');
  assert.equal(ok('flight', 'AC7748', { flight: 'XX123', callsign: 'TBM123' }), false);
  assert.equal(ok('reg', 'C-FFIQ', { reg: 'C-FFIQ' }), true);
  assert.equal(ok('reg', 'C-FFIQ', { reg: 'C-GEHV' }), false);
  const rows = [{ flight: 'AC2040', callsign: 'ROU2040', lat: 1, lon: 1 }, { flight: 'RV1986', callsign: 'ROU1986', lat: 2, lon: 2 }];
  assert.equal(pick(rows, 'flight', 'AC1986').callsign, 'ROU1986', 'not blindly the first row');
  assert.equal(pick([rows[0]], 'flight', 'AC1986').callsign, 'ROU2040', 'no match: the first row still draws');
});

test('/adsb/: a matching FR24 row is remembered under both numbers, a wrong one under neither (fixture, no network)', async () => {
  const realFetch = globalThis.fetch;
  const run = async (row) => {
    const store = new Map();
    globalThis.caches = edgeCache();
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls++;
      assert.match(String(url), /^https:\/\/fr24api\.flightradar24\.com\//, 'only the stubbed FR24 endpoint');
      return new Response(JSON.stringify({ data: [row] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const waits = [];
    const mod = await import(workerPath);
    const env = Object.assign(kvEnv(store), { FR24_KEY: 'test', FR24_DAILY_BUDGET: '100000' });
    const res = await mod.default.fetch(new Request('https://fids-proxy.example/adsb/flight/AC1986'), env, { waitUntil(p) { waits.push(p); } });
    await Promise.all(waits);
    return { store, calls, body: await res.json() };
  };
  try {
    const good = await run({ flight: 'RV1986', callsign: 'ROU1986', reg: 'C-FFIQ', type: 'B38M', lat: 45.1, lon: -70.2, alt: 31625, gspeed: 506, track: 70, timestamp: new Date().toISOString() });
    assert.equal(good.calls, 1);
    assert.equal(good.body.ac[0].r, 'C-FFIQ');
    const a = JSON.parse(good.store.get('acmem:v1:AC1986'));
    const b = JSON.parse(good.store.get('acmem:v1:RV1986'));
    assert.equal(a.obs.at(-1).r, 'CFFIQ', 'under the number the board asks by');
    assert.equal(b.obs.at(-1).cs, 'ROU1986');
    const bad = await run({ flight: 'AC7748', callsign: 'TBM7748', reg: 'C-FPPI', type: 'TBM8', lat: 45.1, lon: -70.2, alt: 9000, gspeed: 250, track: 70, timestamp: new Date().toISOString() });
    assert.equal(bad.store.has('acmem:v1:AC1986'), false, 'a row of another flight is not remembered as AC1986');
    assert.equal(bad.store.has('acmem:v1:AC7748'), false);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.caches;
  }
});

test('the worker change adds no FR24 call: /acinfo still never names the FR24 API', () => {
  const at = WORKER.indexOf('if (path === "/acinfo")');
  const end = WORKER.indexOf('// ── /fararr', at);
  assert.ok(at > 0 && end > at);
  assert.doesNotMatch(WORKER.slice(at, end), /fr24api|flightradar24\.com/);
});
