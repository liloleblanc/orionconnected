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
// The review of that fix (same day) added what must never be lent: the
// v22928 C-FUJA case (same operator, another type), the Express brand alone,
// a sighting with no callsign of the leg, a PAL-own PB number for an AC one;
// and what must cost nothing more: the lent tail never becomes a row _reg
// (the poll would add /reg/ FR24 lookups), the re-ask is windowed and backed
// off, the worker reads the partner keys only when the AC key is empty.
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
  'var _OP_WS_DASH8 = ', 'var _AC_OWN_OPERATORS = ', 'var _OP_SHORT_CS = ',
  'var _ACRES_LEG_MS = ', "var _ACINFO_BASE = ", 'var _acInfoTried = ', 'var _acInfoAsks = '];
const FNS = ['acOperatorBand', '_opLadderName', '_opEvLegId', '_opEvFarGet', 'fidsResolveOperator', '_csDigitsOk',
  '_acResLeg', '_acResolvedPut', '_acResolvedGet', '_acInfoKick', '_gateDepSchedTs',
  '_gateTailCsPrefixes', '_gateCsIsLeg', '_gateOwnFr24Seen', '_gateExpressReturnPair', '_gateInboundFr24Seen', '_gateSameType',
  '_gateFr24TypeSeen', '_gateTailAskOpen'];

// The real callsign tables, so the operator to callsign mapping is the board own.
const TABLES = blockSource('const CALLSIGN_TO_IATA = {', ';') + '\n'
  + blockSource('var _IATA_TO_CALLSIGN = (function () {', ')();');

function engine(fetchStub) {
  const window = { _gateIata: 'YQM', _ACRES: {} };
  const src = [TABLES].concat(VARS.map(stmtSource), FNS.map(fnSource))
    .concat(['return { ' + FNS.concat(['_IATA_TO_CALLSIGN']).map((n) => n + ': ' + n).join(', ') + ' };']).join('\n');
  const codes = { B38M: '7M8', DH8D: 'DH4', A320: '320', E75L: 'E75', CRJ9: 'CR9' };
  const names = { B38M: 'Boeing 737 MAX 8', '7M8': 'Boeing 737 MAX 8', DH8D: 'De Havilland Dash 8-400', DH4: 'De Havilland Dash 8-400',
    E75: 'Embraer E175', E75L: 'Embraer E175', CR9: 'Bombardier CRJ-900', CRJ9: 'Bombardier CRJ-900' };
  let rebuilt = 0;
  const api = new Function('window', 'fetch', 'aircraftCodeToIata', 'formatAircraft', 'gateAircraftShortname',
    'requestGateRebuild', 'AIRLINE_NAME', 'CALLSIGN_ICAO', '_regionalOpFitsRoute', 'adbTs', src)(
    window, fetchStub || (() => Promise.reject(new Error('no fetch in this test'))),
    (s) => codes[s] || '', (s) => names[s] || '', (s) => s, () => { rebuilt++; },
    { AC: 'Air Canada', RV: 'Air Canada Rouge', PB: 'PAL Airlines', QK: 'Jazz Aviation', WS: 'WestJet' }, {}, () => true,
    (s) => Date.parse(s) || 0);
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
  assert.equal(v.reg, '', 'a sighting only: no row takes it as its _reg, so the poll adds no /reg/ lookup');
  assert.deepEqual([v.seen.reg, v.seen.cs, v.seen.cd], ['C-FFIQ', 'ROU1986', '7M8']);
  assert.equal(e.rebuilt(), 1);
});

test('/acinfo basis today with a callsign of another leg, or none, is not a sighting', async () => {
  for (const cs of ['PVL924', '', null]) {
    const e = engine(() => Promise.resolve({ ok: true, json: () => ({ f: 'AC1986', type: 'B38M', reg: 'C-FXYZ', cs, source: 'fr24', basis: 'today' }) }));
    e._acInfoKick(AC1986(), 'arr');
    await tick(); await tick();
    const v = e._acResolvedGet(AC1986());
    assert.equal(v.seen, undefined, String(cs));
    assert.equal(v.reg, '');
  }
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
  assert.equal(e._acResolvedGet(AC1986()).seen, undefined, 'at most once per leg per 10 minutes');
  answer = { f: 'AC1986', type: 'B38M', reg: 'C-FFIQ', cs: 'ROU1986', source: 'fr24', basis: 'today' };
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60000;
  try {
    e._acInfoKick(AC1986(), 'arr', true);
    await tick(); await tick();
  } finally { Date.now = realNow; }
  assert.equal(e._acResolvedGet(AC1986()).seen.reg, 'C-FFIQ', 'the tail reaches a screen that was already running');
  assert.equal(e._acResolvedGet(AC1986()).reg, '', 'as a sighting, never the leg reg');
});

test('the tail re-ask backs off: 10, 30, then 60 minutes', () => {
  let asks = 0;
  const e = engine(() => { asks++; return new Promise(() => {}); });
  const realNow = Date.now, t0 = realNow();
  const at = (min) => { Date.now = () => t0 + min * 60000; e._acInfoKick(AC1986(), 'arr', true); };
  try {
    at(0); at(5); at(10); at(30); at(40); at(70); at(100); at(130);
  } finally { Date.now = realNow; }
  // asked at 0, 10, 40 (30 after), 100 (60 after); 130 is 30 after the last
  assert.equal(asks, 4);
});

test('the inbound re-asks for a tail only in its window, and no departure re-asks', () => {
  const at = CORE.indexOf('AND THE TAIL, ON A SCREEN THAT IS ALREADY RUNNING');
  assert.ok(at > 0);
  const before = CORE.slice(at - 800, at);
  // the v23901 ask, as it was: the store tail reaches _ib2._reg only when the inbound has no type
  assert.match(before, /if \(_anyInb && !_inbEquipNm && !_inbEquipCd && typeof _acResolvedGet === 'function'\) \{/);
  assert.match(before, /if \(!_ib2\._reg && _inbR2\.reg\) _ib2\._reg = _inbR2\.reg;\n\s+\} else if \(typeof _acInfoKick === 'function'\) \{\n\s+_acInfoKick\(_ib2, 'arr'\);/);
  const blk = CORE.slice(at, at + 1400);
  assert.match(blk, /_gateTailAskOpen\(_ib2, Date\.now\(\)\)\) \{\n\s+_acInfoKick\(_ib2, 'arr', true\);/);
  assert.doesNotMatch(blk, /_ib2\._reg =/, 'the re-ask never writes the row _reg');
  assert.doesNotMatch(CORE, /if \(!_acR\.reg && !currentFlight\._reg && typeof _acInfoKick === 'function'\) _acInfoKick\(currentFlight, 'dep'\);/,
    'no departure re-ask: the screen own poll covers the departure once it leaves');
  assert.match(CORE, /_acResolvedPut\(inb, _atNm, _atCd, inb\._reg \|\| '',\n\s+\(_adsb\.cs && typeof _gateCsIsLeg === 'function' && _gateCsIsLeg\(_adsb\.cs, flt\)\) \? \{ reg: _adsb\.reg \|\| '', cs: _adsb\.cs \} : null\);/,
    'the poll stores a sighting only for an answer heard under this leg number');
});

test('the re-ask window: from 30 min before the inbound leaves to 20 min after it lands, while no tail is held', () => {
  const e = engine();
  const inb = AC1986();   // arrives 00:09 ADT; no departure time on the row: 3 h block back
  const arr = inb._sortTs;
  assert.equal(e._gateTailAskOpen(inb, arr - 4 * 3600000), false, 'hours before it can fly');
  assert.equal(e._gateTailAskOpen(inb, arr - 3 * 3600000 - 20 * 60000), true);
  assert.equal(e._gateTailAskOpen(inb, arr + 15 * 60000), true, 'the taxi in');
  assert.equal(e._gateTailAskOpen(inb, arr + 25 * 60000), false, 'landed and parked');
  assert.equal(e._gateTailAskOpen(Object.assign(AC1986(), { _durationMins: 120 }), arr - 2.4 * 3600000), true);
  assert.equal(e._gateTailAskOpen(Object.assign(AC1986(), { _durationMins: 120 }), arr - 2.6 * 3600000), false);
  assert.equal(e._gateTailAskOpen(Object.assign(AC1986(), { _reg: 'C-FFIQ' }), arr), false, 'a tail on the row');
  e._acResolvedPut(AC1986(), 'Boeing 737 MAX 8', '7M8', '', { reg: 'C-FFIQ', cs: 'ROU1986' });
  assert.equal(e._gateTailAskOpen(AC1986(), arr), false, 'a sighting held');
});

// ── E: the inbound tail on the departure ──────────────────────────────────

test('the operator callsigns come from the board own tables', () => {
  const e = engine();
  assert.deepEqual(e._gateTailCsPrefixes('AC', 'RV'), ['ROU']);
  assert.deepEqual(e._gateTailCsPrefixes('AC', 'PB'), ['PVL']);
  assert.deepEqual(e._gateTailCsPrefixes('AC', 'QK'), ['JZA']);
  assert.deepEqual(e._gateTailCsPrefixes('AC', 'ACEX'), [], 'the Express brand alone names no operator');
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
  // AC7753, the flight it night-stops for, sits in the 7700 block both
  // partners fly. With nothing naming PAL it is the brand alone, but it is
  // the return pair of AC7754 (v24169, _gateExpressReturnPair), so it lends.
  assert.equal(e._gateInboundFr24Seen(AC7753(), AC7754(), 'YQM').reg, 'C-GPOJ');
  // Its own record naming PAL, the PVL tail passes too.
  const pal = Object.assign(AC7753(), { _opEv: { op: 'PB', src: 'own' } });
  assert.equal(e._gateInboundFr24Seen(pal, AC7754(), 'YQM').reg, 'C-GPOJ');
});

test('the Express return pair: AC7754 (PVL7754, from YOW) lends to AC7753 (to YOW); nothing short of every sign does', () => {
  const e = engine();
  const seen = (row, cs, reg, nm, cd) => e._acResolvedPut(row, nm || 'De Havilland Dash 8-400', cd || 'DH4', '', { reg: reg || 'C-GPOJ', cs });
  seen(AC7754(), 'PVL7754');
  assert.equal(e.fidsResolveOperator(AC7753(), 'YQM').op, 'ACEX', 'the brand alone: no partner named');
  assert.equal(e._gateExpressReturnPair(AC7753(), AC7754(), 'PVL7754'), true);
  assert.equal(e._gateInboundFr24Seen(AC7753(), AC7754(), 'YQM').reg, 'C-GPOJ', 'gate 4, Nov 19: the night stop lends');
  // a Jazz callsign carrying the inbound number passes the same way
  const e2 = engine();
  e2._acResolvedPut(AC7754(), 'De Havilland Dash 8-400', 'DH4', '', { reg: 'C-GGOY', cs: 'JZA7754' });
  assert.equal(e2._gateInboundFr24Seen(AC7753(), AC7754(), 'YQM').reg, 'C-GGOY');
  // not one apart
  const ac7756 = Object.assign(AC7754(), { flight: 'AC7756' });
  const e3 = engine();
  e3._acResolvedPut(ac7756, 'De Havilland Dash 8-400', 'DH4', '', { reg: 'C-GPOJ', cs: 'PVL7756' });
  assert.equal(e3._gateInboundFr24Seen(AC7753(), ac7756, 'YQM'), null, 'two apart');
  // not the same route back
  const fromYul = Object.assign(AC7754(), { origin: 'YUL', _locIata: 'YUL' });
  const e4 = engine();
  e4._acResolvedPut(fromYul, 'De Havilland Dash 8-400', 'DH4', '', { reg: 'C-GPOJ', cs: 'PVL7754' });
  assert.equal(e4._gateInboundFr24Seen(AC7753(), fromYul, 'YQM'), null, 'came from Montreal, goes to Ottawa');
  // a callsign of another operator, or of another number
  const e5 = engine();
  e5._acResolvedPut(AC7754(), 'De Havilland Dash 8-400', 'DH4', '', { reg: 'C-GPOJ', cs: 'ROU7754' });
  assert.equal(e5._gateInboundFr24Seen(AC7753(), AC7754(), 'YQM'), null, 'ROU is neither partner');
  const e6 = engine();
  e6._acResolvedPut(AC7754(), 'De Havilland Dash 8-400', 'DH4', '', { reg: 'C-GPOJ', cs: 'PVL7753' });
  assert.equal(e6._gateInboundFr24Seen(AC7753(), AC7754(), 'YQM'), null, 'heard under the departure number, not the inbound');
  // outside the 7700 block
  const ac8754 = Object.assign(AC7754(), { flight: 'AC8754' }), ac8753 = Object.assign(AC7753(), { flight: 'AC8753' });
  assert.equal(e._gateExpressReturnPair(ac8753, ac8754, 'JZA754'), false, 'the Jazz block names its operator already');
  // the own-type check still applies
  assert.equal(e._gateInboundFr24Seen(Object.assign(AC7753(), { _aircraftCode: 'CR9' }), AC7754(), 'YQM'), null, 'its own type differs');
  assert.equal(e._gateInboundFr24Seen(Object.assign(AC7753(), { _aircraftCode: 'DH4' }), AC7754(), 'YQM').reg, 'C-GPOJ');
  // a door pick never lends, pair or not
  assert.equal(e._gateInboundFr24Seen(AC7753(), Object.assign(AC7754(), { _doorOnly: true }), 'YQM'), null);
});

// Review of 2026-11-20: the return pair takes the inbound four digits exactly.
// The Jazz short form (JZA + last three) of a 77xx number is the callsign of
// the 87xx flight (JZA542 is AC8542), so JZA777 for AC7777 is AC8777.
test('the Express return pair takes no short form: AC7777 seen as JZA777 never lends to AC7778', () => {
  const ac7777 = { flight: 'AC7777', airline: 'AC', gate: '25', origin: 'YUL', _locIata: 'YUL', _sortTs: T(19, 22, 32), _opCode: 'JZA' };
  const ac7778 = { flight: 'AC7778', airline: 'AC', gate: '25', dest: 'YUL', _locIata: 'YUL', _sortTs: T(20, 6, 0) };
  const e = engine();
  assert.equal(e._gateCsIsLeg('JZA777', 'AC7777'), true, 'the short form passes the leg test on its own');
  assert.equal(e._gateExpressReturnPair(ac7778, ac7777, 'JZA777'), false, 'but not the return pair');
  e._acResolvedPut(ac7777, 'De Havilland Dash 8-400', 'DH4', '', { reg: 'C-GKQA', cs: 'JZA777' });
  assert.equal(e.fidsResolveOperator(ac7778, 'YOW').op, 'ACEX', 'the brand alone');
  assert.equal(e._gateInboundFr24Seen(ac7778, ac7777, 'YOW'), null, 'AC8777 tail never reaches AC7778');
  // the full number still pairs, and PVL7754 still lends to AC7753
  assert.equal(e._gateExpressReturnPair(ac7778, ac7777, 'JZA7777'), true);
  const e2 = engine();
  e2._acResolvedPut(AC7754(), 'De Havilland Dash 8-400', 'DH4', '', { reg: 'C-GPOJ', cs: 'PVL7754' });
  assert.equal(e2._gateInboundFr24Seen(AC7753(), AC7754(), 'YQM').reg, 'C-GPOJ');
});

test('the Express brand alone takes no tail: a Jazz AC8542 (JZA542) never reaches the PAL AC7753', () => {
  const e = engine();
  const ac8542 = { flight: 'AC8542', airline: 'AC', gate: '4', origin: 'YUL', _locIata: 'YUL', _sortTs: T(20, 6, 0) };
  e._acResolvedPut(ac8542, 'De Havilland Dash 8-400', 'DH4', 'C-GJZA', { reg: 'C-GJZA', cs: 'JZA542' });
  assert.equal(e._gateInboundFr24Seen(AC7753(), ac8542, 'YQM'), null);
});

test('v22928 C-FUJA: a Jazz E175 (JZA7992) never lends its tail to the Jazz AC7995 the feed gives a CRJ-900', () => {
  const e = engine();
  const ac7992 = { flight: 'AC7992', airline: 'AC', gate: '4', origin: 'YYZ', _locIata: 'YYZ', _sortTs: T(19, 15, 0) };
  const ac7995 = { flight: 'AC7995', airline: 'AC', gate: '4', dest: 'YYZ', _locIata: 'YYZ', _sortTs: T(19, 16, 0),
    _aircraftCode: 'CR9', _feedAcCode: 'CR9' };
  e._acResolvedPut(ac7992, 'Embraer E175', 'E75', 'C-FUJA', { reg: 'C-FUJA', cs: 'JZA7992' });
  assert.equal(e.fidsResolveOperator(ac7995, 'YQM').op, 'QK', 'the same operator: Jazz, from the CR9');
  assert.equal(e._gateInboundFr24Seen(ac7995, ac7992, 'YQM'), null, 'its own type differs');
  assert.equal(e._gateInboundFr24Seen(ac7995, ac7992, 'YQM', 'CR9', 'Bombardier CRJ-900'), null, 'the caption type differs');
  // AC1983 with its own type the same as the one FR24 saw on AC1986 still takes C-FFIQ
  e._acResolvedPut(AC1986(), 'Boeing 737 MAX 8', '7M8', '', { reg: 'C-FFIQ', cs: 'ROU1986' });
  assert.equal(e._gateInboundFr24Seen(Object.assign(AC1983(), { _aircraftCode: '7M8' }), AC1986(), 'YQM').reg, 'C-FFIQ');
  assert.equal(e._gateInboundFr24Seen(AC1983(), AC1986(), 'YQM', '', 'Boeing 737 MAX 8').reg, 'C-FFIQ');
  assert.equal(e._gateInboundFr24Seen(Object.assign(AC1983(), { _aircraftCode: '320' }), AC1986(), 'YQM'), null);
});

test('a callsign must carry the leg number: the poll stray row and a tail answer with no callsign are no sighting', () => {
  const e = engine();
  assert.equal(e._gateCsIsLeg('ROU1986', 'AC1986'), true);
  assert.equal(e._gateCsIsLeg('JZA542', 'AC8542'), true, 'the Jazz short form');
  assert.equal(e._gateCsIsLeg('', 'AC7748'), false, 'no callsign');
  assert.equal(e._gateCsIsLeg('FPPI', 'AC7748'), false, 'a callsign with no digits');
  assert.equal(e._gateCsIsLeg('TBM123', 'AC7748'), false);
  // the departure own sighting is read only under its own number
  e._acResolvedPut(AC1983(), 'Socata TBM 850', 'TBM', 'C-FPPI', { reg: 'C-FPPI', cs: 'FPPI' });
  assert.equal(e._gateOwnFr24Seen(AC1983()), null);
  const e2 = engine();
  e2._acResolvedPut(AC1983(), 'Boeing 737 MAX 8', '7M8', '', { reg: 'C-FFIQ', cs: 'ROU1983' });
  assert.equal(e2._gateOwnFr24Seen(AC1983()).reg, 'C-FFIQ');
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
  assert.match(blk, /_gateInboundFr24Seen\(_cf, _ib2, .*, _outEquipCd, _outEquipNm\)/);
  assert.match(blk, /if \(!_inboundReg && _inbFrSeen && _inbFrSeen\.reg\) _inboundReg = _inbFrSeen\.reg;/);
  assert.match(blk, /var _acReg = _currentReg \|\| _inboundReg;/, 'the departure own tail still comes first');
  assert.match(CORE, /if \(!_currentReg && _ownFrSeen && _ownFrSeen\.reg\) _currentReg = _ownFrSeen\.reg;/,
    'then the departure own sighting');
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
  assert.match(blk, /_typeSeen = _gateFr24TypeSeen\(_ownFrSeen, _acModel, _equipCd, _acReg\);/,
    'only the departure own sighting drops the tag; a lent tail keeps it');
  assert.doesNotMatch(blk, /_inbFrSeen/);
});

// ── A, B, C: the worker ───────────────────────────────────────────────────

test('/acinfo hands back the tail only within 12 h of the leg, matched on time, not the UTC day', async () => {
  const { acMemToday, acMemKeysFor } = await import(workerPath);
  const rec = { obs: [{ d: '2026-11-17', t: 'B38M' }, { d: '2026-11-20', t: 'B38M', cs: 'ROU1986', r: 'CFFIQ', ts: SEEN_AC1986 }] };
  assert.deepEqual(acMemToday([rec], T(20, 0, 9), 'AC1986'), { type: 'B38M', reg: 'C-FFIQ', cs: 'ROU1986', ts: SEEN_AC1986 });
  assert.equal(acMemToday([rec], T(20, 0, 9) + 24 * 3600000, 'AC1986'), null, 'tomorrow night AC1986 is another leg');
  assert.equal(acMemToday([rec], SEEN_AC1986 - 13 * 3600000, 'AC1986'), null);
  assert.equal(acMemToday([rec], 0, 'AC1986'), null, 'no leg time, no tail');
  assert.equal(acMemToday([{ obs: [{ d: '2026-11-20', t: 'B38M', cs: 'ROU1986', r: 'GXLEA', ts: SEEN_AC1986 }] }], SEEN_AC1986, 'AC1986'), null,
    'a tail that would print wrong is not handed back');
  assert.deepEqual(acMemKeysFor('AC1986'), ['AC1986', 'RV1986'], 'Rouge block');
  assert.deepEqual(acMemKeysFor('AC7664'), ['AC7664', 'PB7664', 'QK7664'], 'Express blocks');
  assert.deepEqual(acMemKeysFor('AC924'), ['AC924'], 'a mainline number reads only its own key');
  assert.deepEqual(acMemKeysFor('WS812'), ['WS812']);
});

test('/acinfo today: an observation must be this leg, under a callsign that fits its key', async () => {
  const { acMemToday } = await import(workerPath);
  const ts = SEEN_AC1986;
  const o = (cs, r) => ({ d: '2026-11-20', t: 'DH8C', cs, r: r || 'CFXYZ', ts: ts - 2 * 3600000 });
  // The review probe: a PAL-own PB924 never answers for AC924, under any key list
  assert.equal(acMemToday([null, null, { obs: [o('PVL924')] }, null], ts, 'AC924'), null, 'PB924 is not an AC924 key');
  assert.equal(acMemToday([null, { obs: [o('PVL7664')] }], ts, 'AC7664').reg, 'C-FXYZ', 'PAL-flown AC7664 (PB7664)');
  assert.equal(acMemToday([null, { obs: [o('JZA7664')] }], ts, 'AC7664'), null, 'PB needs PVL');
  assert.equal(acMemToday([null, null, { obs: [o('JZA7664')] }], ts, 'AC7664').cs, 'JZA7664', 'QK takes JZA');
  assert.equal(acMemToday([null, { obs: [o('PVL1986')] }], ts, 'AC1986'), null, 'RV needs ROU');
  assert.equal(acMemToday([{ obs: [o(undefined, 'CFPPI')] }], ts, 'AC7748'), null, 'an old row with no callsign (the TBM C-FPPI)');
  assert.equal(acMemToday([{ obs: [o('TBM7748', 'CFPPI')] }], ts, 'AC7748'), null, 'a callsign of another operator under AC');
  assert.equal(acMemToday([{ obs: [o('PVL7749')] }], ts, 'AC7748'), null, 'another number');
  assert.equal(acMemToday([{ obs: [o('JZA542')] }], ts, 'AC8542').cs, 'JZA542', 'the Jazz short form');
});

function kvEnv(store, reads) {
  return {
    FIDS_USERS: { async get() { return JSON.stringify({ username: 'admin' }); }, async put() {} },
    FIDS_LIVE_FLIGHTS: {
      async get(k, o) { if (reads) reads.push(k); const v = store.has(k) ? store.get(k) : null; return (v && o && o.type === 'json') ? JSON.parse(v) : v; },
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
    const reads = [];
    const ask = (f, ts) => mod.default.fetch(new Request(`https://fids-proxy.example/acinfo?f=${f}&at=dep&ts=${ts}`), kvEnv(store, reads), { waitUntil() {} });
    const r1 = await ask('AC1986', T(20, 0, 9));
    const j1 = await r1.json();
    assert.deepEqual([j1.type, j1.reg, j1.cs, j1.basis], ['B38M', 'C-FFIQ', 'ROU1986', 'today']);
    assert.match(r1.headers.get('Cache-Control'), /max-age=600/);
    assert.deepEqual(reads, ['acmem:v1:AC1986'], 'the AC key held the leg: one KV read');
    // The same number a day later: only the usual type. Outside the leg
    // window it is kept 10 minutes, at or above the screens own re-ask.
    const r2 = await ask('AC1986', T(21, 0, 9));
    const j2 = await r2.json();
    assert.deepEqual([j2.type, j2.reg, j2.basis], ['B38M', null, 'usual']);
    assert.match(r2.headers.get('Cache-Control'), /max-age=600/, 'a type-only answer outside the leg window');
    // Inside the window (our arrival due in an hour), FR24 may yet see the tail: 2 minutes.
    store.set('acmem:v1:AC1984', JSON.stringify({ obs: [{ d: '2026-11-10', t: 'B38M' }] }));
    const r2b = await ask('AC1984', Date.now() + 3600000);
    assert.equal((await r2b.json()).basis, 'usual');
    assert.match(r2b.headers.get('Cache-Control'), /max-age=120/, 'the leg window');
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
