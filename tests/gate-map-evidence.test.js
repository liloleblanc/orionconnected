'use strict';

// WHY THIS EXISTS
//
// The gate maps drew aircraft parked where they were not: at Moncton hours
// before they could get there, while the real aeroplane still had several
// other legs to fly first. Confirmed on all four live Moncton gate boards on
// the night of 2026-09-28 (22:20–22:31 ADT):
//   gate 1  AC1983 (05:25) drawn parked at stand 1A with no inbound at all;
//   gate 2  PB923 (11:25) drawn parked 12½ h early — its aeroplane only gets
//           here on PB923 from Deer Lake at 11:00, a through flight the
//           gate-match threw away for having the same number;
//   gate 3  PD2381, raw "Arrived at 9:47 PM", parked for PD2370 at 11:55 —
//           plausible, and it has to stay drawn;
//   gate 4  AC644 (due 11:15) picked as the inbound of AC7995 (11:15) and
//           parked at Toronto eleven hours before that leg.
// v23915: one resolver, _gateAircraftWhere, answers "where is the aeroplane"
// for every map, and it answers only from evidence: a timed live fix that is
// this leg's, the feed's own words (never a status adbStatus made up from the
// clock), or an actual time. Otherwise: no aeroplane, and the map is our gate.
//
// v23930: an aeroplane is drawn on the stand only with evidence that it is
// there NOW. That means our departure boarding in the feed's words, a fresh
// live fix, or the first 20 minutes after the feed's arrival time
// (deplaning). Gate 3's PD2381 is no longer drawn through the night. A
// landing is not a place (tests/gate-map-apron.test.js has the evening of
// 2026-10-02 that showed it).
//
// These are the night's real rows, run through the real functions lifted out
// of fids-core.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// The gate's label helpers pick their languages through the one store
// (board-strings.js), which every board page loads first; loading it here
// puts BoardStrings on the global the lifted functions resolve against.
require('../fids-current/js/board-strings.js');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');

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
function lineSource(prefix) {
  const i = CORE.indexOf(prefix);
  assert.ok(i >= 0, prefix + ' must exist');
  return CORE.slice(i, CORE.indexOf('\n', i));
}
function blockSource(prefix, end) {
  const i = CORE.indexOf(prefix);
  assert.ok(i >= 0, prefix + ' must exist');
  return CORE.slice(i, CORE.indexOf(end, i) + end.length);
}
// A browser's storage, per screen: an engine built with the same store is the
// same screen after a reload.
function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const FNS = [
  '_gateLegGone', '_gateFamily', '_gateRowKey', '_gateRawStatus', '_gateRawLanded', '_gateRawAirborne', '_gatePushLeft',
  '_gateOutboundAtGate', '_gateTodayReg', '_gateIsProp', '_gateMinTurnMs', '_gateDepSchedTs',
  '_gateAcFamily', '_gateHereTz', '_gateLocalHour', '_gateNightStop', '_gateCouldTurn',
  '_gateDepOwnInbound', '_gateArrivalClaimed', '_gateTurnedByPattern', '_gateTurnConsumed', '_gateLandedAt',
  '_gateSeenOnly', '_gateStandVerdict', '_gateLegUp', '_gateAirEstProg', '_gateFixCheck', '_gateFixFor', '_gateDepsSeen',
  '_gateAircraftWhere', '_gateAircraftWhereIn', '_gateFeedRows', '_gateInboundForDeparture', '_gateMapCity', '_gateMapNote', 'fidsInboundAirborne',
  '_gcNm', '_fixCanReachByEta', '_estRouteFrac', '_gateRefNorm', 'adbTs', '_adbNearestDayTs', 'adbStatus',
  'adbStatusInferred', '_fidsClockForLang', '_gateMatchIsNew', '_fixAtLegOrigin', '_fixPlausibleForLeg',
  '_gateLegWindowOpen', '_gateSeenSlim', '_gateSeenLoad', '_gateSeenSave', '_gateArrsSeen', 'aircraftCodeToIata',
  '_gateSeenKeepIdentity',
];
const EXPORTS = FNS.map((n) => n + ': ' + n).join(', ');

const COORDS = {
  YQM: [46.1122, -64.6786], YYZ: [43.6772, -79.6306], YUL: [45.4706, -73.7408], YOW: [45.3225, -75.6692],
  YHU: [45.5175, -73.4169], YDF: [49.2108, -57.3914], YYY: [48.6086, -68.2081], YYC: [51.1139, -114.0203],
};
const CITY_EN = { YYZ: 'TORONTO', YUL: 'MONTREAL', YOW: 'OTTAWA', YDF: 'DEER LAKE', YHU: 'ST-HUBERT', YYY: 'MONT-JOLI' };
const CITY_FR = { YUL: 'MONTRÉAL' };

// A fresh copy of the engine for each test: its memories (_GATE_DOWN_SEEN,
// _GATE_DEP_SEEN) must not leak from one case into the next.
function engine(ctx) {
  const window = Object.assign({ _gateIata: ctx.ap || 'YQM' }, ctx.window || {});
  const src = [
    lineSource('var _GATE_DOWN_SEEN = {};'),
    lineSource('var _GATE_DEPLANE_MS = '),
    lineSource('var _GATE_DEP_SEEN = '),
    lineSource('var _GATE_SEEN_KEY = '),
    blockSource('var _GATE_SEEN_FIELDS = [', '];'),
    lineSource('var _GATE_ARR_SEEN = '),
    lineSource('var _GATE_SEEN_IDENTITY = '),
    lineSource('var _ADB_EXPLICIT_STATUS = '),
    lineSource('var ARR_CONFIRM_MIN = '),
    ...FNS.map(fnSource),
    'return { ' + EXPORTS + ', _GATE_DOWN_SEEN: _GATE_DOWN_SEEN };',
  ].join('\n');
  const mod = new Function('window', 'data', 'AP', '_lookupAirport', '_GATE_LBL', 'langs', 'frFirstAirport',
    'airportCityNameSafe_v21877', 'localStorage', src)(
    window, ctx.data || { arr: [], dep: [] }, { YQM: { tz: 'America/Moncton' }, YYC: { tz: 'America/Edmonton' } },
    (k) => COORDS[String(k || '').toUpperCase()] || null,
    { from: { en: 'From', fr: 'De' }, to: { en: 'To', fr: 'À' } },
    ctx.langs || ['en', 'fr'], () => false,
    (c, lg) => (lg === 'fr' && CITY_FR[c]) || CITY_EN[c] || '', ctx.storage || store());
  mod.window = window;
  return mod;
}

// Moncton wall clock (ADT, UTC−3) on 2026-09-dd.
const T = (d, hh, mm) => Date.UTC(2026, 8, d, hh + 3, mm);
const MIN = 60000;
const iso = (ts) => new Date(ts).toISOString().replace('.000Z', 'Z');

const arr = (flight, from, gate, d, hh, mm, extra) => Object.assign({
  flight, airline: flight.replace(/\d.*/, ''), origin: from, _locIata: from, gate,
  status: 'scheduled', _stInferred: false, _sortTs: T(d, hh, mm), _revTs: null,
}, extra || {});
const dep = (flight, to, gate, d, hh, mm, extra) => Object.assign({
  flight, airline: flight.replace(/\d.*/, ''), dest: to, _locIata: to, gate,
  status: 'scheduled', _stInferred: false, _sortTs: T(d, hh, mm), _revTs: null,
}, extra || {});

// The Sep 29 departures cyqm.ca listed at 22:20 (gates 1–4), and the arrivals.
const DEPS = [
  dep('AC1983', 'YYZ', '1', 29, 5, 25), dep('AC2037', 'YUL', '1', 29, 6, 35), dep('AC7753', 'YOW', '1', 29, 7, 10),
  dep('AC7995', 'YUL', '4', 29, 11, 15, { _aircraft: 'Mitsubishi CRJ-900', _aircraftCode: 'CR9' }),
  dep('PB923', 'YYY', '2', 29, 11, 25, { _aircraft: 'De Havilland Dash 8-300' }),
  dep('PD2370', 'YOW', '3', 29, 11, 55, { _aircraft: 'DHC-8-400' }),
  dep('AC647', 'YYZ', '4', 29, 12, 20), dep('PD2382', 'YHU', '3', 29, 17, 20, { _aircraft: 'DHC-8-400' }),
  dep('AC1987', 'YYZ', '4', 29, 18, 15, { _reg: 'C-GEJN' }), dep('PB924', 'YDF', '2', 29, 18, 15),
];
const ARRS = [
  arr('PD2381', 'YHU', '3', 28, 21, 30, { status: 'arrived', _revTs: T(28, 21, 47), _aircraft: 'DHC-8-400' }),
  arr('AC2040', 'YUL', '4', 28, 21, 38, { status: 'arrived', _reg: 'C-FYJP', _aircraft: 'Airbus A319' }),
  arr('AC1986', 'YYZ', '4', 29, 0, 3, { status: 'delayed', _revTs: T(29, 0, 18), _aircraft: 'Airbus A319' }),
  arr('AC7992', 'YUL', '4', 29, 10, 30), arr('PB923', 'YDF', '2', 29, 11, 0), arr('AC644', 'YYZ', '4', 29, 11, 15),
  arr('PD2373', 'YOW', '3', 29, 16, 33, { _aircraft: 'DHC-8-400' }),
  arr('AC1984', 'YYZ', '4', 29, 17, 23, { _reg: 'C-GEJN', _aircraft: 'Boeing 737 MAX 8' }),
  arr('PB924', 'YYY', '2', 29, 17, 50), arr('AC7754', 'YOW', '4', 29, 18, 38),
];
/**
 * The text of a piece of markup: everything outside its tags. Scanned as a
 * browser reads it, each tag running from '<' to the next '>', rather than
 * by a pattern replace, which can leave a tag behind. The map note is
 * markup (each language's half marked with its language; an Arabic one
 * reads right to left): read as text, it is the line a passenger sees.
 */
function textOf(html) {
  const s = String(html);
  let out = '', i = 0;
  for (;;) {
    const a = s.indexOf('<', i);
    if (a < 0) return out + s.slice(i);
    out += s.slice(i, a);
    const b = s.indexOf('>', a + 1);
    if (b < 0) return out + s.slice(a);
    i = b + 1;
  }
}
const DATA = () => ({ arr: ARRS.map((r) => Object.assign({}, r)), dep: DEPS.map((r) => Object.assign({}, r)) });
const find = (list, flight, d) => list.find((r) => r.flight === flight && (!d || new Date(r._sortTs - 3 * 3600000).getUTCDate() === d));

test('gate 1: no inbound for AC1983 at 22:20 — no aeroplane anywhere, the map is our gate, empty', () => {
  const data = DATA();
  const E = engine({ data });
  const cf = find(data.dep, 'AC1983');
  assert.equal(E._gateInboundForDeparture(cf, '1', data.arr, data.dep), null,
    'every Air Canada arrival is filed at gate 4, and none carries AC1983\'s tail');
  const res = E._gateAircraftWhere(null, cf, T(28, 22, 20));
  assert.equal(res.kind, 'none', 'nothing says where AC1983\'s aeroplane is (it is still in Toronto)');
  assert.equal(res.leg, 'out');
  assert.equal(res.org, 'YQM');
  assert.equal(res.dst, 'YYZ', 'the route dashed from our stand toward Toronto');
  assert.equal(textOf(E._gateMapNote(res)), 'To Toronto · 5:25am | À Toronto · 05:25');
  // At 05:10 the feed's own "Boarding" is evidence an aeroplane is at our gate; the clock's is not.
  const boarding = Object.assign({}, cf, { status: 'boarding', _stInferred: false });
  assert.equal(E._gateAircraftWhere(null, boarding, T(29, 5, 10)).kind, 'stand');
  const clockBoarding = Object.assign({}, cf, { status: 'boarding', _stInferred: true });
  assert.equal(E._gateAircraftWhere(null, clockBoarding, T(29, 5, 10)).kind, 'none');
});

test('gate 2: PB923 through Moncton — the same-number arrival is the inbound, and until it lands there is no aeroplane', () => {
  const data = DATA();
  const E = engine({ data });
  const cf = find(data.dep, 'PB923');
  const inb = E._gateInboundForDeparture(cf, '2', data.arr, data.dep);
  assert.ok(inb, 'the through flight is the match');
  assert.equal(inb.flight, 'PB923');
  assert.equal(inb._locIata, 'YDF', 'PB923 from Deer Lake, 11:00');
  const res = E._gateAircraftWhere(inb, cf, T(28, 22, 24));
  assert.equal(res.kind, 'none', 'not parked at stand 2 twelve and a half hours early');
  assert.equal(res.leg, 'in');
  assert.equal(res.org, 'YDF');
  assert.equal(res.dst, 'YQM');
  assert.equal(textOf(E._gateMapNote(res)), 'From Deer Lake · 11:00am | De Deer Lake · 11:00');
  // The evening's PB924 pairs with its own through arrival, not with the morning's PB923.
  const pb924 = find(data.dep, 'PB924');
  assert.equal(E._gateInboundForDeparture(pb924, '2', data.arr, data.dep).flight, 'PB924');
  assert.equal(E._gateInboundForDeparture(pb924, '2', data.arr, data.dep)._locIata, 'YYY');
  // Once the feed says it landed, it is at our stand.
  const landed = Object.assign({}, inb, { status: 'arrived', _stInferred: false, _revTs: T(29, 10, 52) });
  assert.equal(E._gateAircraftWhere(landed, cf, T(29, 11, 5)).kind, 'stand');
});

test('gate 3: PD2381, raw "Arrived at 9:47 PM", is PD2370\'s aeroplane — on the stand while it deplanes, not through the night', () => {
  const data = DATA();
  const E = engine({ data });
  const cf = find(data.dep, 'PD2370');
  const inb = E._gateInboundForDeparture(cf, '3', data.arr, data.dep);
  assert.equal(inb && inb.flight, 'PD2381');
  const now = E._gateAircraftWhere(inb, cf, T(28, 22, 0));
  assert.equal(now.kind, 'stand', '13 minutes after its own "Arrived at 9:47 PM"');
  assert.equal(now.org, 'YQM');
  assert.equal(now.dst, 'YOW', 'parked at our stand, the route onward to Ottawa');
  assert.equal(E._gateAircraftWhere(inb, cf, T(28, 22, 7)).kind, 'stand', '20 minutes: the last of the deplaning window');
  // v23930 — after that a landing is not a place: the aeroplane may stay on
  // the stand, go to remote parking or leave on another number, and nothing
  // says which. The map is our empty stand, the route dashed toward Ottawa.
  const after = E._gateAircraftWhere(inb, cf, T(28, 22, 8));
  assert.equal(after.kind, 'none');
  assert.equal(after.why, 'deplaned');
  assert.equal(after.leg, 'out');
  assert.equal(textOf(E._gateMapNote(after)), 'To Ottawa · 11:55am | À Ottawa · 11:55');
  assert.equal(E._gateAircraftWhere(inb, cf, T(29, 4, 0)).kind, 'none', '04:00: not a night stop on the map');
  // When the airport says PD2370 is boarding, an aeroplane is at the door.
  const boarding = Object.assign({}, cf, { status: 'boarding', _stInferred: false });
  assert.equal(E._gateAircraftWhere(inb, boarding, T(29, 11, 25)).kind, 'stand');
  assert.equal(E._gateAircraftWhere(inb, boarding, T(29, 11, 25)).why, 'boarding');
});

test('gate 3 after midnight: the feed has dropped PD2381, the screen remembers it came down — a landing time, not a place', () => {
  // cyqm.ca keeps an arrived row for about an hour. The screen keeps it for 30
  // hours (fids_gate_seen_v1), across a reload, so the gate-match still names
  // PD2370's aeroplane. v23930: the memory parks nothing.
  const screen = store();
  const evening = DATA();
  const E1 = engine({ data: evening, storage: screen });
  E1._gateArrsSeen(evening.arr, 'YQM', T(28, 22, 0));           // the screen sees it land
  E1._gateDepsSeen(evening.dep, 'YQM', T(28, 22, 0));
  const night = DATA();
  night.arr = night.arr.filter((r) => r.flight !== 'PD2381' && !(r.flight === 'AC2040' && r.status === 'arrived'));
  const E2 = engine({ data: night, storage: screen });           // a reload: a new page, the same storage
  const cf = find(night.dep, 'PD2370');
  const seen = E2._gateArrsSeen(night.arr, 'YQM', T(29, 0, 40));
  const inb = E2._gateInboundForDeparture(cf, '3', seen, E2._gateDepsSeen(night.dep, 'YQM', T(29, 0, 40)));
  assert.equal(inb && inb.flight, 'PD2381', 'the remembered landing is still the inbound');
  assert.equal(inb._remembered, true);
  const res = E2._gateAircraftWhere(inb, cf, T(29, 0, 40));
  assert.equal(res.kind, 'none', 'its landing at 21:47 says nothing about where it is at 00:40');
  assert.equal(res.why, 'remembered');
  // Even within its deplaning minutes a memory alone draws nothing: the live
  // row would (above), but once the feed has dropped it nothing the feed says
  // now puts the aeroplane on the ground.
  const E4 = engine({ data: night, storage: screen });
  const seen4 = E4._gateArrsSeen(night.arr, 'YQM', T(28, 22, 5));
  const inb4 = seen4.find((r) => r.flight === 'PD2381');
  assert.equal(inb4 && inb4._remembered, true);
  const res4 = E4._gateAircraftWhere(inb4, cf, T(28, 22, 5));
  assert.equal(res4.kind, 'none');
  assert.equal(res4.why, 'remembered');
  // The same screen without a reload: the moment the feed drops the row it is
  // a memory too, exactly as after the reload.
  const E5 = engine({ data: night, storage: store() });
  E5._gateArrsSeen(evening.arr, 'YQM', T(28, 22, 0));           // it saw the row at 22:00
  const seen5 = E5._gateArrsSeen(night.arr, 'YQM', T(28, 22, 5));
  const inb5 = seen5.find((r) => r.flight === 'PD2381');
  assert.equal(inb5 && inb5._remembered, true, 'dropped by the feed: a memory');
  assert.equal(E5._gateAircraftWhere(inb5, cf, T(28, 22, 5)).kind, 'none');
  // And back in the feed it is a live row again.
  const seen6 = E5._gateArrsSeen(evening.arr, 'YQM', T(28, 22, 6));
  const inb6 = seen6.find((r) => r.flight === 'PD2381');
  assert.notEqual(inb6._remembered, true);
  // A screen that never saw it land has nothing to go on, and draws nothing.
  const E3 = engine({ data: night, storage: store() });
  assert.equal(E3._gateInboundForDeparture(cf, '3', E3._gateArrsSeen(night.arr, 'YQM', T(29, 0, 40)), night.dep), null);
});

test('one type, many spellings: a Dash 8 arrival and its own departure are the same type', () => {
  const E = engine({});
  const fam = (x) => E._gateAcFamily(x);
  assert.equal(fam('DHC-8-400'), fam('De Havilland Dash 8-400'));
  assert.equal(fam('Dash 8 Q400'), fam('DHC-8-402'));
  assert.equal(fam('Canadair CRJ 900'), fam('Bombardier CRJ900'));
  assert.equal(fam('Mitsubishi CRJ-900'), 'CR9');
  assert.notEqual(fam('Airbus A319'), fam('Boeing 737 MAX 8'));
  const data = DATA();
  data.arr = data.arr.map((r) => (r.flight === 'PD2381' ? Object.assign({}, r, { _aircraft: 'DHC-8-400' }) : r));
  const cf = Object.assign({}, find(data.dep, 'PD2370'), { _aircraft: 'De Havilland Dash 8-400' });
  assert.equal((E._gateInboundForDeparture(cf, '3', data.arr, data.dep) || {}).flight, 'PD2381');
});

test('only the feed\'s own "Arrived" is remembered, never a landing made up from the clock', () => {
  const E = engine({ storage: store() });
  const onTime = arr('PD2373', 'YOW', '3', 29, 16, 33, { status: 'landed', _stInferred: true });
  E._gateArrsSeen([onTime], 'YQM', T(29, 17, 0));
  assert.deepEqual(E._gateArrsSeen([], 'YQM', T(29, 18, 0)), [], 'nothing kept once the row leaves');
});

test('a remembered landing whose aeroplane left on a remembered departure stays off the stand after a reload', () => {
  // PD2373 came down at 17:03 and the same Dash 8 left as PD2382 at 17:20. Both
  // rows then leave the feed. Were only the landing remembered, the reload would
  // park that aeroplane at gate 3 again — the phantom this whole change removes.
  const screen = store();
  const pd2373 = arr('PD2373', 'YOW', '3', 28, 16, 33, { status: 'arrived', _revTs: T(28, 17, 3), _aircraft: 'DHC-8-400' });
  const pd2382 = dep('PD2382', 'YHU', '3', 28, 17, 20, { status: 'departed', _revTs: T(28, 17, 40), _aircraft: 'DHC-8-400' });
  const E1 = engine({ storage: screen });
  E1._gateArrsSeen([pd2373], 'YQM', T(28, 17, 45));
  E1._gateDepsSeen([pd2382], 'YQM', T(28, 17, 45));
  const later = DATA();                                           // neither row is listed any more
  later.arr = later.arr.filter((r) => r.flight !== 'PD2381');
  const E2 = engine({ data: later, storage: screen });
  const cf = find(later.dep, 'PD2370');
  const arrs = E2._gateArrsSeen(later.arr, 'YQM', T(28, 19, 30));
  assert.ok(arrs.some((r) => r.flight === 'PD2373' && r._remembered), 'the landing is remembered');
  const deps = E2._gateDepsSeen(later.dep, 'YQM', T(28, 19, 30));
  assert.ok(deps.some((r) => r.flight === 'PD2382' && r._remembered), 'and so is the departure that took it');
  const picked = E2._gateInboundForDeparture(cf, '3', arrs, deps);
  assert.ok(!(picked && picked.flight === 'PD2373' && picked._remembered), 'the flown turn is not handed to PD2370');
  const kept = arrs.find((r) => r.flight === 'PD2373' && r._remembered);   // yesterday's, not today's PD2373
  assert.equal(E2._gateAircraftWhere(kept, cf, T(28, 19, 30)).why, 'turn-flown');
});

test('gate 3 on Sep 28\'s schedule: the night-stop Porter flies PD2294 at 06:15 first', () => {
  const data = DATA();
  data.dep.push(dep('PD2294', 'YOW', '4', 29, 6, 15, { _aircraft: 'DHC-8-400' }));
  const E = engine({ data });
  const cf = find(data.dep, 'PD2370');
  // Pairing: PD2381 belongs to the 06:15, not to gate 3's 11:55.
  assert.equal(E._gateInboundForDeparture(cf, '3', data.arr, data.dep), null);
  // And an inbound the gate kept from earlier is re-judged every tick.
  const kept = find(data.arr, 'PD2381');
  assert.equal(E._gateAircraftWhere(kept, cf, T(28, 21, 55)).kind, 'stand', 'at 21:55 it is deplaning');
  assert.equal(E._gateAircraftWhere(kept, cf, T(28, 22, 26)).why, 'deplaned', 'at 22:26 nothing says it is still there');
  const night = E._gateAircraftWhere(kept, cf, T(29, 4, 0));
  assert.equal(night.kind, 'none');
  assert.equal(night.why, 'deplaned');
  // After 06:15 the feed says it left, and the departure's row then leaves the
  // feed three hours later — the board remembers it did.
  const gone = find(data.dep, 'PD2294');
  gone.status = 'departed'; gone._revTs = T(29, 6, 20);
  assert.equal(E._gateAircraftWhere(kept, cf, T(29, 6, 30)).why, 'turn-flown');
  data.dep.splice(data.dep.indexOf(gone), 1);
  assert.equal(E._gateAircraftWhere(kept, cf, T(29, 9, 30)).kind, 'none', '09:30: still gone, though its row is not in the feed');
});

test('gate 4: AC7995 at 11:15 — the inbound is AC7992 (10:30), not AC644 (11:15), and nothing is drawn at Toronto', () => {
  const data = DATA();
  const E = engine({ data });
  const cf = find(data.dep, 'AC7995');
  const inb = E._gateInboundForDeparture(cf, '4', data.arr, data.dep);
  assert.equal(inb && inb.flight, 'AC7992', 'a zero-minute "turn" is not a turn');
  const res = E._gateAircraftWhere(inb, cf, T(28, 22, 28));
  assert.equal(res.kind, 'none');
  assert.notEqual(res.org, 'YYZ');
  assert.equal(res.org, 'YUL');
  // Without the types, last night's AC2040 still is not the inbound: the first
  // wave out of gate 1 (05:25, 06:35, 07:10) has no arrivals of its own.
  const bare = DATA();
  bare.arr.forEach((r) => { delete r._aircraft; delete r._reg; });
  bare.dep.forEach((r) => { delete r._aircraft; delete r._aircraftCode; delete r._reg; });
  const E2 = engine({ data: bare });
  assert.equal(E2._gateInboundForDeparture(find(bare.dep, 'AC7995'), '4', bare.arr, bare.dep).flight, 'AC7992');
  // AC647 at 12:20 takes AC644; AC7992's aeroplane has gone as AC7995 by then.
  assert.equal(E2._gateInboundForDeparture(find(bare.dep, 'AC647'), '4', bare.arr, bare.dep).flight, 'AC644');
  // AC1987 and AC1984 share C-GEJN: the tail pairs them.
  assert.equal(E._gateInboundForDeparture(find(data.dep, 'AC1987'), '4', data.arr, data.dep).flight, 'AC1984');
});

test('the tail decides when both rows carry one: a mismatch rules an arrival out, a match rules it in at any gate', () => {
  const data = DATA();
  const E = engine({ data });
  const cf = Object.assign(find(data.dep, 'AC1983'), { _reg: 'C-FYKW' });
  data.arr.push(arr('AC1986', 'YYZ', '4', 29, 0, 3, { _reg: 'C-FYKW', _aircraft: 'Airbus A319', status: 'delayed', _revTs: T(29, 0, 18) }));
  data.arr.splice(data.arr.findIndex((r) => r.flight === 'AC1986' && !r._reg), 1);
  assert.equal(E._gateInboundForDeparture(cf, '1', data.arr, data.dep).flight, 'AC1986', 'gate 4 in, gate 1 out, one aeroplane');
  const other = Object.assign({}, find(data.dep, 'AC7995'), { _reg: 'C-GXXX' });
  data.arr.find((r) => r.flight === 'AC7992')._reg = 'C-FCJZ';
  assert.notEqual((E._gateInboundForDeparture(other, '4', data.arr, data.dep) || {}).flight, 'AC7992');
});

test('an "On Time" arrival 40 minutes past its time, with nothing else, is NOT at our stand', () => {
  const E = engine({});
  const sched = T(29, 16, 33), now = sched + 40 * MIN;
  // What cyqm.ca sends for PD2373 until it says "Arrived at": a neutral status
  // (v23968 — its "OnTime", which feed-router now keeps as 'ontime').
  const raw = { status: 'ontime', arrival: { scheduledTime: { local: '2026-09-29 16:33-03:00' } } };
  const st = E.adbStatus(raw, 'arr', sched, now);
  // v23925 — the clock no longer makes claims anywhere: the board's status
  // column keeps the airport's own neutral word, and nothing is inferred.
  assert.equal(st, 'ontime', 'the board keeps the airport\'s word, not the clock\'s "Arrived"');
  assert.equal(E.adbStatusInferred(raw, st), false, 'a neutral word is no claim, so nothing is inferred');
  assert.equal(E.adbStatusInferred({ status: 'arrived' }, 'arrived'), false, 'the feed\'s own "Arrived" is not inferred');
  const cf = dep('PD2382', 'YHU', '3', 29, 17, 20, { _aircraft: 'DHC-8-400' });
  // A neutral row, and the same row as a pre-v23925 screen may still remember
  // it (a clock-made claim flagged _stInferred): neither puts it on our stand.
  for (const extra of [{}, { _stInferred: true }]) {
    const inb = arr('PD2373', 'YOW', '3', 29, 16, 33, Object.assign({ status: st, _aircraft: 'DHC-8-400' }, extra));
    const res = E._gateAircraftWhere(inb, cf, now);
    assert.notEqual(res.kind, 'stand');
    assert.equal(res.kind, 'none');
    assert.equal(E.fidsInboundAirborne(inb), false, 'nor is it flying on the clock\'s word');
  }
  const remembered = arr('PD2373', 'YOW', '3', 29, 16, 33, { status: 'arrived', _stInferred: true, _aircraft: 'DHC-8-400' });
  assert.equal(E._gateAircraftWhere(remembered, cf, now).kind, 'none', 'an old clock-made "arrived" is still not a landing');
});

test('an arrival that landed at 17:03 and left again as the 17:20 is NOT at our stand for a later departure', () => {
  const data = DATA();
  const E = engine({ data });
  const pd2373 = arr('PD2373', 'YOW', '3', 28, 16, 33, { status: 'arrived', _revTs: T(28, 17, 3), _aircraft: 'DHC-8-400' });
  const pd2382 = dep('PD2382', 'YHU', '3', 28, 17, 20, { status: 'departed', _revTs: T(28, 17, 40), _aircraft: 'DHC-8-400' });
  data.arr.push(pd2373); data.dep.push(pd2382);
  const cf = find(data.dep, 'PD2370');
  const res = E._gateAircraftWhere(pd2373, cf, T(28, 19, 30));
  assert.equal(res.kind, 'none');
  assert.equal(res.why, 'turn-flown');
  assert.equal(res.leg, 'out', 'the map names our departure instead');
  // Nor does the gate-match hand it to PD2370 in the first place.
  assert.notEqual((E._gateInboundForDeparture(cf, '3', [pd2373], data.dep) || {}).flight, 'PD2373');
  // Before PD2382 left, it was there.
  const early = Object.assign({}, pd2382, { status: 'boarding', _revTs: null });
  const E2 = engine({ data: { arr: [pd2373], dep: [early] } });
  assert.equal(E2._gateAircraftWhere(pd2373, early, T(28, 17, 10)).kind, 'stand');
});

test('a live fix is evidence only when it is timed, recent, this leg\'s and reachable', () => {
  const now = T(29, 9, 40);
  const inb = arr('AC7992', 'YUL', '4', 29, 10, 30, { _revTs: T(29, 10, 14) });
  const cf = find(DEPS, 'AC7995');
  const over = [45.9, -70.0];                    // over Maine, on the way
  const run = (lp) => engine({ window: { _gateInboundLivePos: lp } })._gateAircraftWhere(inb, cf, now);
  const fix = { lat: over[0], lng: over[1], altitude: 24000, speed: 380, onGround: false, fl: 'AC7992', via: 'flight', cs: 'JZA7992' };
  assert.equal(run(Object.assign({}, fix, { at: now - 16 * MIN })).kind, 'none', 'older than 15 minutes: ignored');
  assert.equal(run(Object.assign({}, fix)).kind, 'none', 'no time on it: ignored');
  const ok = run(Object.assign({}, fix, { at: now - 2 * MIN }));
  assert.equal(ok.kind, 'fix');
  assert.deepEqual([ok.lat, ok.lng], over);
  assert.equal(run(Object.assign({}, fix, { at: now - 2 * MIN, fl: 'AC644' })).kind, 'none', 'another flight\'s answer');
  assert.equal(run(Object.assign({}, fix, { at: now - 2 * MIN, lat: 50.43, lng: -104.67 })).kind, 'none', 'Saskatchewan cannot reach Moncton by 10:14');
  // A tail found with no callsign is the airframe wherever it is — only a
  // ground fix at this leg's origin or at our field says anything about it.
  const tail = Object.assign({}, fix, { at: now - 2 * MIN, via: 'reg', cs: '' });
  assert.equal(run(tail).kind, 'none');
  const atYul = run(Object.assign({}, tail, { lat: 45.468, lng: -73.745, onGround: true, altitude: 0 }));
  assert.equal(atYul.kind, 'origin-ground', 'on the ground at Montréal: parked where it is');
  assert.equal(run(Object.assign({}, tail, { lat: 45.468, lng: -73.745, onGround: true, at: now - 4 * MIN })).kind, 'none',
    'a ground fix older than 3 minutes is not where it is now');
});

test('airborne with no fix only on the feed\'s own word, from the actual wheels-up', () => {
  const E = engine({});
  const cf = find(DEPS, 'AC7995');
  const base = arr('AC7992', 'YUL', '4', 29, 10, 30, { _revTs: T(29, 10, 14) });
  // An ETA revised earlier than schedule is a forecast, not a take-off.
  assert.equal(E._gateAircraftWhere(base, cf, T(29, 9, 40)).kind, 'none');
  assert.equal(E.fidsInboundAirborne(base), false);
  // The Flight-Alert push's wheels-up (08:11 EDT = 09:11 ADT) is.
  const up = Object.assign({}, base, { _actualDepTime: '2026-09-29 12:11Z' });
  const res = E._gateAircraftWhere(up, cf, T(29, 9, 40));
  assert.equal(res.kind, 'air-est');
  assert.ok(res.prog > 0.4 && res.prog < 0.6, 'half way from Montréal half an hour after wheels-up, got ' + res.prog);
  // As is the push's "EnRoute" on its own.
  const enroute = Object.assign({}, base, { _pushStatus: 'active' });
  assert.equal(E._gateAircraftWhere(enroute, cf, T(29, 9, 40)).kind, 'air-est');
  // The authority feeds' arrival rows "depart" at the arrival time: that is no departure time.
  assert.equal(E._gateDepSchedTs({ _depSchedLocal: '2026-09-29T10:30:00-03:00', _sortTs: T(29, 10, 30) }), 0);
  assert.equal(E._gateDepSchedTs({ _depSchedLocal: '2026-09-29T08:10:00-04:00', _sortTs: T(29, 10, 30) }), T(29, 9, 10));
});

test('both small-map controllers and the big map take the aeroplane from the one answer', () => {
  const tick = fnSource('_gateMapTick');
  assert.match(tick, /_gateMapApply\(_gateAircraftWhere\(window\._gateInbound, window\._gateCurrentFlight, Date\.now\(\)\)\);/);
  assert.doesNotMatch(tick, /phase = 'airborne'|aTs - 7200000|initGateMap\(/, 'no clock-only airborne phase of its own');
  const tryAt = CORE.indexOf('      function tryInitMap() {');
  const tryEnd = CORE.indexOf('      setTimeout(tryInitMap, 500);', tryAt);
  const tryInit = CORE.slice(tryAt, tryEnd);
  assert.match(tryInit, /_gateMapApply\(_gateAircraftWhere\(window\._gateInbound, window\._gateCurrentFlight \|\| currentFlight, Date\.now\(\)\)\);/);
  assert.doesNotMatch(tryInit, /initGateMap(Live)?\(/, 'it draws nothing of its own');
  assert.match(fnSource('_map3dFlightCtx'), /var res = _gateAircraftWhere\(window\._gateInbound, window\._gateCurrentFlight, Date\.now\(\)\);/);
  const apply = fnSource('_gateMapApply');
  assert.match(apply, /if \(live\) initGateMapLive\(res\.org, res\.dst, res\.lat, res\.lng, res\.at\);/);
  assert.match(apply, /else if \(res\.kind === 'stand'\) initGateMap\(res\.org, res\.dst, -1, true\);/);
  assert.match(apply, /else initGateMap\(res\.org, res\.dst, -1, false, note\);/);
  assert.match(apply, /window\._lastMapProgKey === key\) return;/, 'one key for both controllers');
  for (const gone of ['_gateInboundWaitingAtOrigin', '_gateOutboundWaiting', '_gateInboundLandedHere', '_miniAirSticky']) {
    assert.ok(!CORE.includes(gone), gone + ' (a schedule read as a place) is gone');
  }
});

test('the glide stops dead-reckoning 5 minutes after its last real fix, and "healthy" means a fresh fix on this leg', () => {
  assert.match(CORE, /var _GLIDE_DR_MAX_MS = 5 \* 60000;/);
  const glide = fnSource('_startGateMapGlide');
  assert.match(glide, /^function _startGateMapGlide\(map, o, d, planeLat, planeLng, marker, a1, a2, speedKts, destIata, fixAt\)/);
  assert.match(glide, /if \(elapsed > _drLeftMs\) elapsed = _drLeftMs;/);
  for (const name of ['initGateMap', '_bigMapClone']) {
    const src = fnSource(name);
    assert.match(src, /_gateGlideFixFresh\(\)/, name + ' tests the age of the last real fix');
    assert.doesNotMatch(src, /_gateGlideSameLeg\(_gateGlide\.o, _(lg|bg)D\)/, name + ' no longer accepts the reversed leg');
  }
  const fresh = new Function('_gateGlide', 'window', 'return (' + fnSource('_gateGlideFixFresh') + ')');
  const now = 1e12;
  assert.equal(fresh({ fixAt: now - 14 * MIN }, {})(now), true);
  assert.equal(fresh({ fixAt: now - 16 * MIN }, {})(now), false);
  assert.equal(fresh({ fixAt: now - 4 * MIN, fixGround: true }, {})(now), false);
  assert.equal(fresh({ fixAt: now - MIN }, { _gateMapWhere: { kind: 'none' } })(now), false, 'the answer is no longer live');
});

test('the poll stamps its fix, checks it like the maps do, and drops it on the feed\'s own "Arrived"', () => {
  const poll = fnSource('_gateNumbersPoll');
  assert.match(poll, /at: _fxAt, fl: flt, via: _adsb\.via \|\| '', cs: _adsb\.cs \|\| ''/);
  assert.match(poll, /var _rOk = _fixPlausibleForLeg\(inb, _adsb\.lat, _adsb\.lng, _adsb\.onGround === true\);/);
  assert.match(poll, /\(_gateRawLanded\(inb\) \|\| _gateLegGone\(inb\)\) && \(!_lpEnd\.fl \|\| _lpEnd\.fl === flt\)\) window\._gateInboundLivePos = null;/);
  assert.match(poll, /var _depGateT = _gateDepSchedTs\(inb\) \|\| null;/);
  assert.match(fnSource('_adsbTelemetry'), /fl: _fn \|\| _cs,\s*via: \(\(tries\[i\]\.match\(\/\^\\\/\(\\w\+\)\\\/\/\) \|\| \[\]\)\[1\]\) \|\| '',/);
});

test('the Moncton push merge keys on the flight AND its day, and carries the wheels-up and status as evidence', async () => {
  const recs = [
    { received_at: new Date(T(29, 0, 50)).toISOString(), flight: { number: 'AC 2040', status: 9,
      aircraft: { reg: 'C-FYJP', model: 'Airbus A319' },
      departure: { scheduledTime: { utc: '2026-09-28 23:15Z' }, runwayTime: { utc: '2026-09-28 23:33Z' } },
      arrival: { scheduledTime: { utc: '2026-09-29 00:38Z' } } } },
  ];
  class NightDate extends Date { static now() { return T(29, 1, 0); } }   // 01:00 ADT on the 29th
  const merge = new Function('fetch', '_WEBHOOK_PUSH_ENABLED', 'adbTs', 'fidsAdbStatusKey', 'Date',
    'return (' + fnSource('_yqmCacheAircraftMerge') + ')')(
    async () => ({ status: 200, json: async () => ({ flights: recs }) }), { CYQM: true },
    (s) => new Date(String(s).replace(' ', 'T')).getTime(),
    (v) => ({ 9: 'arrived', 2: 'active' })[v] || 'scheduled',
    NightDate);
  const row = (d) => ({ number: 'AC2040', arrival: { scheduledTime: { local: '2026-09-' + d + ' 21:38:00-03:00', utc: '2026-09-' + (d + 1) + ' 00:38:00+00:00' } }, departure: {} });
  const today = row(28), tomorrow = row(29);
  await merge([today, tomorrow], 'Arrival', 'CYQM');
  assert.equal(today.aircraft.reg, 'C-FYJP');
  assert.equal(today._pushDepUp, '2026-09-28 23:33Z', 'Montréal\'s wheels-up, for the maps');
  assert.equal(today._pushStatus, 'arrived');
  assert.equal(tomorrow.aircraft, undefined, 'tomorrow\'s AC2040 does not inherit tonight\'s tail');
  assert.equal(tomorrow._pushDepUp, undefined);
});

test('the studio Flight Map draws its aeroplane only when the gate map has one', () => {
  for (const f of ['template-renderer.js', 'designer.js']) {
    const src = fs.readFileSync(path.join(root, 'fids-current', 'js', f), 'utf8');
    assert.match(src, /plane: r\.plane !== false,/, f + ' reads the route record\'s plane flag');
    assert.match(src, /if \(rt\.plane !== false\) try \{/, f + ' skips the geo map\'s plane without one');
    assert.match(src, /\(o\.plane === false \? '' :/, f + ' and the route card\'s');
    assert.match(src, /if \(o && d && rt\.plane !== false\) \{/, f + ' and the "Remaining" read off its progress');
  }
  assert.match(fnSource('initGateMap'), /plane:\(_p0 >= 0\.02 \|\| !!waitAt\)/);
  assert.match(fnSource('initGateMapLive'), /wait: false, empty: false, plane: true, live: true/);
});

// The live page's route resolver, run: a LIVE map with no route from the gate
// map (fids.html and bids.html never have one; gids.html for its first ~15 s
// and between flights) used to fall back to the Designer's preview fields —
// YQM to YYZ at 45% — and draw that aeroplane over Maine.
function rendererFn(name) {
  const SRC = fs.readFileSync(path.join(root, 'fids-current', 'js', 'template-renderer.js'), 'utf8');
  const i = SRC.indexOf('  function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = SRC.indexOf('{', i);
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) break;
  }
  return SRC.slice(i, j + 1);
}
test('a live studio Flight Map with no route from the gate map has no aeroplane; a manual one keeps it', () => {
  const route = (gateRoute, props) => new Function('window', '_liveContext', '_resolve',
    rendererFn('_flightMapRoute') + '\nreturn _flightMapRoute;')(
    { _fidsGateRoute: gateRoute }, () => ({}), (s) => String(s || ''))(props);
  const DEF = { source: 'live', origin: 'YQM', destination: 'YYZ', progress: 45 };
  for (const none of [null, undefined, { org: '', dst: '' }]) {
    const rt = route(none, DEF);
    assert.equal(rt.live, false);
    assert.equal(rt.plane, false, 'no route published: no aeroplane at the preview\'s 45%');
  }
  assert.equal(route(null, { source: undefined, origin: 'YQM', destination: 'YYZ', progress: 45 }).plane, false, 'live is the default source');
  assert.equal(route(null, Object.assign({}, DEF, { source: 'manual' })).plane, true, 'a manual map is the author\'s to draw');
  assert.equal(route({ org: 'YQM', dst: 'YYZ', prog: 0.3, plane: true }, DEF).plane, true);
  assert.equal(route({ org: 'YQM', dst: 'YYZ', prog: -1, plane: false }, DEF).plane, false);
  // The route card and the geo map both read that flag (above); the refresh key does too.
  assert.match(rendererFn('_renderFlightMap'), /\(rt\.plane === false \? 'none' : 'plane'\)/);
});

test('a late aeroplane still on the ground at its origin is drawn there, whatever the stale ETA says', () => {
  // AC7992 Montréal → Moncton, due 10:30, revised to 10:14. Still standing at
  // YUL at 10:00: 381 nm to go and 360 allowed by the ETA test. That says the
  // ETA is stale, not that the fix is some other aeroplane's.
  const inb = arr('AC7992', 'YUL', '4', 29, 10, 30, { _revTs: T(29, 10, 14) });
  const cf = find(DEPS, 'AC7995');
  const yul = [45.468, -73.745];
  for (const [hh, mm] of [[9, 40], [9, 58], [10, 0], [10, 25]]) {
    const now = T(29, hh, mm);
    const lp = { lat: yul[0], lng: yul[1], altitude: 0, speed: 0, onGround: true, at: now - MIN,
                 fl: 'AC7992', via: 'flight', cs: 'JZA7992' };
    const res = engine({ window: { _gateInboundLivePos: lp } })._gateAircraftWhere(inb, cf, now);
    assert.equal(res.kind, 'origin-ground', hh + ':' + mm + ' — parked at Montréal, where it is');
    assert.deepEqual([res.lat, res.lng], yul);
  }
  // In the air at the same spot the ETA test still applies in full.
  const now = T(29, 10, 0);
  const air = { lat: yul[0], lng: yul[1], altitude: 9000, speed: 250, onGround: false, at: now - MIN,
                fl: 'AC7992', via: 'flight', cs: 'JZA7992' };
  assert.equal(engine({ window: { _gateInboundLivePos: air } })._gateAircraftWhere(inb, cf, now).kind, 'none');
  // The poll's check at the source (and the panel's sticky fix) take the same exemption.
  const E = engine({});
  const gone = Object.assign({}, inb, { _sortTs: T(29, 10, 30) - 400 * 24 * 3600000, _revTs: null });   // its ETA long past
  assert.equal(E._fixPlausibleForLeg(gone, yul[0], yul[1], true), true, 'on the ground at its origin: late');
  assert.equal(E._fixPlausibleForLeg(gone, yul[0], yul[1], false), false, 'in the air there: cannot make it');
  assert.equal(E._fixAtLegOrigin(gone, 45.9, -70.0, true), false, 'on the ground over Maine is not at the origin');
  assert.match(fnSource('_gateLiveFix'), /_fixPlausibleForLeg\(row, lat, lng, src === 'adsb' \? !!\(c && c\.onGround === true\) : row\._liveOnGround === true\)/);
});

test('no new Flightradar24 lookups: an inbound only the new pairing rules found is never asked about', () => {
  const data = DATA();
  const E = engine({ data });
  // Gate 2's through flight: the pre-v23915 gate-match threw a same-number arrival away.
  const pb = find(data.dep, 'PB923');
  const pbIn = E._gateInboundForDeparture(pb, '2', data.arr, data.dep);
  assert.equal(pbIn.flight, 'PB923');
  assert.equal(E._gateMatchIsNew(pbIn, pb, '2'), true);
  // Gate 4's same-gate turn is one the old rule could find: looked up as before.
  const ac = find(data.dep, 'AC7995');
  assert.equal(E._gateMatchIsNew(E._gateInboundForDeparture(ac, '4', data.arr, data.dep), ac, '4'), false);
  // A tail matched at another gate (in at gate 4, out from gate 1).
  const cf = Object.assign(find(data.dep, 'AC1983'), { _reg: 'C-FYKW' });
  const tail = arr('AC1986', 'YYZ', '4', 29, 0, 3, { _reg: 'C-FYKW', status: 'delayed', _revTs: T(29, 0, 18) });
  assert.equal(E._gateMatchIsNew(tail, cf, '1'), true);
  // The door every FR24 lookup for the gate's inbound goes through (the poll,
  // the panel's cache read, the sticky fix) stays shut for it.
  const due = { flight: 'PB923', _locIata: 'YDF', _sortTs: Date.now() + 30 * MIN };
  assert.equal(E._gateLegWindowOpen(due, 'YQM'), true, 'in its window');
  assert.equal(E._gateLegWindowOpen(Object.assign({}, due, { _gateNoAdsb: true }), 'YQM'), false, 'but never looked up');
  // v23925 — an arrival stays looked up until the airport confirms it, up to
  // ARR_CONFIRM_MIN past its time (it was 8 minutes): AC1986 Toronto, due
  // 00:03, still "Early at 12:02 AM" in the feed at 00:10 with no landing seen.
  const landed = { flight: 'AC1986', _locIata: 'YYZ', _sortTs: Date.now() - 25 * MIN };
  assert.equal(E._gateLegWindowOpen(landed, 'YQM'), true, '+25 min, nothing confirms it: still watched');
  assert.equal(E._gateLegWindowOpen(Object.assign({}, landed, { _sortTs: Date.now() - 31 * MIN }), 'YQM'), false, '+31 min: closed');
  assert.match(CORE, /^var ARR_CONFIRM_MIN = 30;/m);
  assert.match(fnSource('_gateNumbersPoll'), /if \(_arrDue && Date\.now\(\) >= _arrDue \+ ARR_CONFIRM_MIN \* 60000\) return;/, 'the neutral stop waits the same half hour');
  assert.match(CORE, /_lwNow > _lwArr \+ ARR_CONFIRM_MIN \* 60000/, 'and the map keeps the fix for it');
  assert.doesNotMatch(CORE, /_lwArr \+ 8 \* 60000|arr \+ 8 \* 60000/, 'no 8-minute close left');
  // The render tags the match; the poll returns before any lookup of its own.
  assert.match(CORE, /_gateMatchFallback\._gateNoAdsb = _gateMatchIsNew\(_gateMatchFallback, currentFlight, _gateVal\);/);
  const poll = fnSource('_gateNumbersPoll');
  const quiet = poll.indexOf('if (inb._gateNoAdsb === true) return;');
  assert.ok(quiet > 0, 'the poll checks the tag');
  for (const call of ['_gateNumPollBusy = true', 'fidsFlightPlan(', 'loadFlight(', '_adsbTelemetry(']) {
    assert.ok(quiet < poll.indexOf(call), 'before ' + call);
  }
});

test('a departure takes another gate\'s aeroplane only on a night stop, and only when the types agree', () => {
  const data = DATA();
  data.dep.push(dep('PD2294', 'YOW', '4', 29, 6, 15, { _aircraft: 'DHC-8-400' }));
  const E = engine({ data });
  const pd2381 = find(data.arr, 'PD2381'), pd2294 = find(data.dep, 'PD2294');
  assert.equal(E._gateCouldTurn(pd2294, pd2381, data.arr), true, 'in at gate 3 at 21:47, out from gate 4 at 06:15');
  // The same move in the daytime is not a turn.
  const noon = Object.assign({}, pd2381, { _sortTs: T(29, 12, 0), _revTs: null });
  const later = Object.assign({}, pd2294, { _sortTs: T(29, 13, 0) });
  assert.equal(E._gateCouldTurn(later, noon, data.arr), false);
  // Nor from a gate that has its own arrivals of the family, or from no gate at all.
  assert.equal(E._gateCouldTurn(Object.assign({}, pd2294, { gate: '3' }), Object.assign({}, pd2381, { gate: '2' }), data.arr), false);
  assert.equal(E._gateCouldTurn(Object.assign({}, pd2294, { gate: '—' }), pd2381, data.arr), false);
  // A turboprop does not leave as a jet, at any gate.
  assert.equal(E._gateCouldTurn(Object.assign({}, pd2294, { gate: '3', _aircraft: 'Embraer 195-E2' }), pd2381, data.arr), false);
  // Types it does not know are no reason to refuse.
  assert.equal(E._gateCouldTurn(Object.assign({}, pd2294, { gate: '3', _aircraft: '' }), pd2381, data.arr), true);
});

// A BUSY AIRPORT, THE WAY MOST BOARDS SEE ONE. Calgary's authority feed on the
// morning of Sep 28 (tests/fixtures/yyc-2026-09-28-turns.json), replayed the
// way the board holds it: arrivals and departures three hours behind the
// clock, no registrations (no authority feed but Calgary's carries any), and
// then no types either (Halifax's state). The tails the code is not shown say
// which arrival each departure's aeroplane really was. Before the claim checks
// (_gateCouldTurn), 27 of 37 same-gate turns were given to departures at other
// gates — a Dash 8 turning at A01C "taken" by a 737 MAX leaving E74 — and 29 of
// 35 landed inbounds were shown off their stands.
const YYC = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'yyc-2026-09-28-turns.json'), 'utf8'));
const MDT = (ts) => new Date(ts - 6 * 3600000).toISOString().slice(11, 16);
function hubRow(raw, mode, now, keep) {
  const [flight, gate, sched, rev, far, model, reg, status] = raw;
  const s = Date.parse(sched), v = rev ? Date.parse(rev) : null;
  const r = {
    flight, airline: flight.slice(0, 2), gate: gate || '—', _sortTs: s, _revTs: v, _locIata: far,
    status: /cancel/.test(status) ? 'cancelled' : (v || s) <= now ? status : 'scheduled', _stInferred: false,
    _aircraft: keep.type ? model : '', _aircraftCode: keep.type ? model : '', _reg: keep.reg ? reg : '',
  };
  r[mode === 'dep' ? 'dest' : 'origin'] = far;
  return r;
}
const hubList = (list, mode, now, keep) => list.map((x) => hubRow(x, mode, now, keep)).filter((r) => now - r._sortTs <= 3 * 3600000);

test('a hub with no registrations: every same-gate turn survives the pairing (Calgary, Sep 28)', () => {
  for (const keep of [{ type: true }, { type: false }]) {
    const E = engine({ ap: 'YYC' });
    let n = 0;
    const lost = [];
    for (const d of YYC.departures) {
      const [flight, gate, sched, , , , reg] = d;
      const depTs = Date.parse(sched);
      if (MDT(depTs) < '06:00' || MDT(depTs) > '12:30' || !reg || !gate) continue;
      const now = depTs - 60 * MIN;
      const arrs = hubList(YYC.arrivals, 'arr', now, keep), deps = hubList(YYC.departures, 'dep', now, keep);
      const truth = YYC.arrivals.filter((a) => a[6] === reg && a[1] === gate && Date.parse(a[2]) < depTs)
        .map((a) => arrs.find((r) => r.flight === a[0] && r._sortTs === Date.parse(a[2]))).filter(Boolean)
        .sort((a, b) => b._sortTs - a._sortTs)[0];
      if (!truth) continue;
      n++;
      const cf = deps.find((r) => r.flight === flight && r._sortTs === depTs);
      const got = E._gateInboundForDeparture(cf, cf.gate, arrs, deps);
      if (got !== truth) lost.push(flight + ' ' + MDT(depTs) + ' ' + gate + ' <- ' + truth.flight + ', got ' + (got ? got.flight : 'none'));
    }
    assert.ok(n >= 30, 'the fixture holds the morning\'s turns (' + n + ')');
    assert.deepEqual(lost, [], (keep.type ? 'types kept' : 'no types') + ': ' + lost.length + ' of ' + n + ' lost');
  }
  // The named case: WS3394 (Dash 8) in at A01C at 08:25 turns as WS3733 at 09:10,
  // and WS1410, a 737 MAX leaving E74 at 09:00, does not take it.
  const now = Date.parse('2026-09-28T14:10Z');
  const keep = { type: true };
  const arrs = hubList(YYC.arrivals, 'arr', now, keep), deps = hubList(YYC.departures, 'dep', now, keep);
  const E = engine({ ap: 'YYC' });
  const ws3733 = deps.find((r) => r.flight === 'WS3733');
  assert.equal(E._gateInboundForDeparture(ws3733, ws3733.gate, arrs, deps).flight, 'WS3394');
});

test('a hub with no registrations: a landed same-gate inbound is on its stand while it deplanes, and only on evidence after', () => {
  for (const keep of [{ type: true }, { type: false }]) {
    // One board through the morning: it remembers the departures it has seen
    // (_gateDepsSeen) the way a screen left running does.
    const data = { arr: [], dep: [] };
    const E = engine({ ap: 'YYC', data });
    let n = 0, later = 0;
    const off = [], parked = [];
    for (const d of YYC.departures) {
      const [flight, gate, sched, , , , reg] = d;
      const depTs = Date.parse(sched);
      if (MDT(depTs) < '08:00' || MDT(depTs) > '12:30' || !reg || !gate) continue;
      const t = YYC.arrivals.filter((a) => a[6] === reg && a[1] === gate && Date.parse(a[2]) < depTs)
        .sort((a, b) => Date.parse(b[2]) - Date.parse(a[2]))[0];
      if (!t) continue;
      const land = Date.parse(t[3] || t[2]);
      const ask = (now) => {
        const arrs = hubList(YYC.arrivals, 'arr', now, keep), deps = hubList(YYC.departures, 'dep', now, keep);
        data.arr = arrs; data.dep = deps;
        const cf = deps.find((r) => r.flight === flight && r._sortTs === depTs);
        const inb = arrs.find((r) => r.flight === t[0] && r._sortTs === Date.parse(t[2])) || hubRow(t, 'arr', now, keep);
        return { res: E._gateAircraftWhere(inb, cf, now), inb };
      };
      // 15 minutes after its landing, before its departure: deplaning at its gate.
      const now = land + 15 * MIN;
      if (now < depTs - 5 * MIN) {
        n++;
        const { res, inb } = ask(now);
        if (res.kind !== 'stand') off.push(flight + ' ' + MDT(depTs) + ' ' + gate + ' <- ' + inb.flight + ': ' + res.kind + '/' + res.why);
      }
      // 20 minutes before its departure, when that is past the deplaning
      // window: drawn only if the feed says it is boarding (v23930).
      const pre = depTs - 20 * MIN;
      if (pre > land + 20 * MIN) {
        later++;
        const { res, inb } = ask(pre);
        if (res.kind === 'stand' && res.why !== 'boarding') parked.push(flight + ' <- ' + inb.flight + ': ' + res.why);
      }
    }
    assert.ok(n >= 30, 'the fixture holds the morning\'s landed turns (' + n + ')');
    assert.deepEqual(off, [], (keep.type ? 'types kept' : 'no types') + ': ' + off.length + ' of ' + n + ' off their stands');
    assert.ok(later >= 20, 'and turns long enough to outlast the window (' + later + ')');
    assert.deepEqual(parked, [], 'parked on a landing alone');
  }
});

test('gate 3 at 10:18: yesterday\'s PD2373 turned into PD2382, so it is not PD2370\'s aeroplane; last night\'s PD2381 is (v24018)', () => {
  // Oct 7 in the field, Sep 30 here: the feed has dropped last night's PD2381
  // and yesterday's PD2382, and kept yesterday's PD2373 "Arrived" (remembered).
  const arrs = [
    arr('PD2373', 'YOW', '3', 29, 16, 33, { status: 'arrived', _remembered: true, _aircraft: 'DHC-8-400' }),
    arr('PD2373', 'YOW', '3', 30, 16, 33, { _aircraft: 'DHC-8-400' }),
    arr('PD2381', 'YHU', '3', 30, 21, 30, { _aircraft: 'DHC-8-400' }),
  ];
  const deps = [
    dep('PD2370', 'YOW', '3', 30, 11, 55, { _aircraft: 'DHC-8-400' }),
    dep('PD2382', 'YHU', '3', 30, 17, 20, { _aircraft: 'DHC-8-400' }),
  ];
  const E = engine({ data: { arr: arrs, dep: deps } });
  const cf = deps[0];
  assert.equal(E._gateTurnedByPattern(arrs[0], cf, deps, arrs) && E._gateTurnedByPattern(arrs[0], cf, deps, arrs).flight, 'PD2382',
    'PD2373 lands again today at 16:33 and PD2382 leaves gate 3 at 17:20: yesterday it did the same');
  assert.equal(E._gateInboundForDeparture(cf, '3', arrs, deps), null, 'no aeroplane named rather than the wrong one');
  // with last night's PD2381 still known, it is the aeroplane: nothing leaves gate 3 a turn after 21:30
  const withNight = arrs.concat([arr('PD2381', 'YHU', '3', 29, 21, 30, { status: 'arrived', _remembered: true, _aircraft: 'DHC-8-400' })]);
  const inb = E._gateInboundForDeparture(cf, '3', withNight, deps);
  assert.equal(inb && inb.flight, 'PD2381');
  assert.equal(E._gateTurnedByPattern(withNight[3], cf, deps, withNight), null);
  // an arrival from this morning is never judged by yesterday's pattern
  const morning = arr('PD2293', 'YTZ', '3', 30, 6, 0, { _aircraft: 'DHC-8-400' });
  assert.equal(E._gateTurnedByPattern(morning, cf, deps, arrs.concat([morning])), null);
});
