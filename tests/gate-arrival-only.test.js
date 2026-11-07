'use strict';

// WHY THIS EXISTS
//
// v24130. Halifax gate 3, 2026-11-07 at 13:30: PD2327 from Montreal was due at
// gate 3 at 13:58 and no departure was filed from gate 3, so the gate screen
// read Awaiting Next Flight with an aeroplane on its way to the door. Ottawa
// 15B the same afternoon: AC889 from Heathrow (the A330) due at 13:16, its
// onward AC888 filed from gate 15 at 18:50; the 15B screen read Awaiting Next
// Flight too. The gate only ever chose its flight from the departures
// (_gateFlightsAt) and derived the inbound from it, so a door with an arrival
// and no departure showed nothing.
//
// Now: _gateArrivalsAt lists the arrivals at the door (either spelling of it,
// _gateSameDoor) inside a window, and renderDedicatedScreen shows the first as
// the screen (_gateArrivalOnlyHtml: the incoming aircraft beside its map),
// publishing it as the inbound every map and the 60 s poll reads, with no
// departure. The render key carries the pick (cheap read) and the arrivals
// feed state; the empty gate clears every global the state set. And a
// departure whose pairing names no inbound shows the arrival at its door,
// labelled as an aircraft, never as yours (_doorOnly).
//
// These run the real functions out of fids-core.js against the saved feed
// rows of that afternoon (tests/fixtures) and stubs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
/** A top-level declaration, braces matched (const TL = k => { ... }, const LS = { ... }). */
function declSource(head) {
  const i = CORE.indexOf('\n' + head);
  assert.ok(i >= 0, head + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i + 1, j + 1) + ';';
}
function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
/** The words a passenger reads in a piece of markup: everything outside its
 *  tags, one space where a tag stood (two runs of words in two elements are
 *  two words), whitespace collapsed. */
function textOf(html) {
  const s = String(html);
  let out = '', i = 0;
  for (;;) {
    const a = s.indexOf('<', i);
    if (a < 0) return (out + s.slice(i)).replace(/\s+/g, ' ').trim();
    out += s.slice(i, a) + ' ';
    const b = s.indexOf('>', a + 1);
    if (b < 0) return (out + s.slice(a)).replace(/\s+/g, ' ').trim();
    i = b + 1;
  }
}

// ── the feed rows of the afternoon ────────────────────────────────────────
const ts = (s) => (s ? new Date(String(s).replace(' ', 'T')).getTime() : null);
function rowOf(f, mode) {
  const side = mode === 'dep' ? f.departure : f.arrival, other = mode === 'dep' ? f.arrival : f.departure;
  const st = String(f.status || '').toLowerCase();
  return {
    flight: f.number, airline: (side.airline && side.airline.iata) || f.number.replace(/\d.*/, ''), gate: side.gate || '—',
    _locIata: other.airport && other.airport.iata, origin: mode === 'arr' ? (other.airport && other.airport.name) : undefined,
    status: st, _stInferred: false, _stExplicit: /^(arrived|landed|delayed|early|cancelled|diverted|active)$/.test(st),
    _sortTs: ts(side.scheduledTime && side.scheduledTime.local), _revTs: ts(side.revisedTime && side.revisedTime.local),
    upd: null, _aircraft: (f.aircraft && f.aircraft.model) || '', _reg: (f.aircraft && f.aircraft.reg) || '',
  };
}
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const YHZ = () => ({
  arr: fixture('yhz-arrivals-2026-11-07T1745Z.json').arrivals.map((f) => rowOf(f, 'arr')),
  dep: fixture('yhz-departures-2026-11-07T1745Z.json').departures.map((f) => rowOf(f, 'dep')),
});
const YOW = () => ({
  arr: fixture('yow-arrivals-2026-11-07T1804Z.json').arrivals.map((f) => rowOf(f, 'arr')),
  dep: fixture('yow-departures-2026-11-07T1804Z.json').departures.map((f) => rowOf(f, 'dep')),
});
const find = (list, flight) => list.find((r) => r.flight === flight);
// Halifax wall clock (AST, UTC-4) and Ottawa (EST, UTC-5) on 2026-11-07.
const AT = (hh, mm) => Date.UTC(2026, 10, 7, hh + 4, mm);
const ET = (hh, mm) => Date.UTC(2026, 10, 7, hh + 5, mm);
const MIN = 60000;

// ── the evidence engine (tests/gate-map-evidence.test.js), plus the arrivals-only list ──
const FNS = [
  '_gateLegGone', '_gateFamily', '_gateRowKey', '_gateRawStatus', '_gateRawLanded', '_gateOnBlocksWord', '_gateRawAirborne', '_gatePushLeft',
  '_gateOutboundAtGate', '_gateTodayReg', '_gateIsProp', '_gateMinTurnMs', '_gateDepSchedTs',
  '_gateAcFamily', '_gateHereTz', '_gateLocalHour', '_gateNightStop', '_gateCouldTurn',
  '_gateDepOwnInbound', '_gateArrivalClaimed', '_gateTurnedByPattern', '_gateTurnConsumed', '_gateLandedAt', '_gateLandedInfo', '_gateSeenLand',
  '_gateSeenOnly', '_gateStandVerdict', '_gateLegUp', '_gateAirEstProg', '_gateFixCheck', '_gateFixFor', '_gateDepsSeen',
  '_gateAircraftWhere', '_gateAircraftWhereIn', '_gateFeedRows', '_gateInboundForDeparture', '_gateMapCity', '_gateMapNote', 'fidsInboundAirborne',
  '_gcNm', '_fixCanReachByEta', '_fixTooEarlyForEta', '_gateArrEarliestTs', '_gateLegSpanMs', '_estRouteFrac', '_gateRefNorm', 'adbTs', '_adbNearestDayTs', '_adbLegUpdateTs', 'adbStatus',
  'adbStatusInferred', '_fidsClockForLang', '_gateMatchIsNew', '_fixAtLegOrigin', '_fixPlausibleForLeg',
  '_gateLegWindowOpen', '_gateSeenSlim', '_gateSeenLoad', '_gateSeenSave', '_gateArrsSeen', 'aircraftCodeToIata',
  '_gateSeenKeepIdentity',
  '_gateDoorBase', '_gateDoorOwn', '_gateSameDoor', '_gateDoorFold',
  // v24130 — the arrivals-only list and what it reads
  '_gateArrivalsAt', 'fidsInboundHasArrived', '_fidsBoardRowPlace', '_gateCsPick',
];
const EXPORTS = FNS.map((n) => n + ': ' + n).join(', ');
const COORDS = { YHZ: [44.8808, -63.5086], YUL: [45.4706, -73.7408], YOW: [45.3225, -75.6692], LHR: [51.47, -0.4543], YYZ: [43.6772, -79.6306] };
const CITY_EN = { YUL: 'MONTREAL', LHR: 'LONDON', YYZ: 'TORONTO', YHZ: 'HALIFAX', YOW: 'OTTAWA' };
const CITY_FR = { YUL: 'MONTRÉAL', LHR: 'LONDRES' };
const gateFile = (ap) => JSON.parse(fs.readFileSync(path.join(root, 'fids-current', 'data', 'gates', ap + '.json'), 'utf8'));
const FILES = { YOW: gateFile('YOW'), YHZ: gateFile('YHZ'), DUB: gateFile('DUB') };

function engine(ctx) {
  const window = Object.assign({ _gateIata: ctx.ap || 'YHZ' }, ctx.window || {});
  const src = [
    lineSource('var _GATE_DOWN_SEEN = {};'),
    lineSource('var _GATE_ARR_UP = '),
    lineSource('var _GATE_DEPLANE_MS = '),
    lineSource('var _GATE_DEP_SEEN = '),
    lineSource('var _GATE_SEEN_KEY = '),
    blockSource('var _GATE_SEEN_FIELDS = [', '];'),
    lineSource('var _GATE_ARR_SEEN = '),
    lineSource('var _GATE_SEEN_IDENTITY = '),
    lineSource('var _ADB_EXPLICIT_STATUS = '),
    lineSource('var _ADB_CLAIM_AHEAD_TIMED_MS = '),
    lineSource('var _ADB_CLAIM_AHEAD_UNTIMED_MS = '),
    lineSource('var ARR_CONFIRM_MIN = '),
    lineSource('var GATE_ARR_LEAD_MS = '),
    lineSource('var _GATE_DOOR_SIBLING_M = '),
    lineSource('var BOARDING_HOLD_MIN = '),
    lineSource('var GATE_GRACE_MIN = '),
    lineSource('var BOARD_TRAIL_MIN = '),
    lineSource('var DELAY_HOLD_MIN = '),
    lineSource('const DEPART_TRAIL_HRS = '),
    lineSource('var _CS_REGIONAL_FAM = '),
    ...FNS.map(fnSource),
    'return { ' + EXPORTS + ', _GATE_DOWN_SEEN: _GATE_DOWN_SEEN };',
  ].join('\n');
  const mod = new Function('window', 'data', 'AP', '_lookupAirport', '_GATE_LBL', 'langs', 'frFirstAirport',
    'airportCityNameSafe_v21877', 'localStorage', '_apGatesFor', src)(
    window, ctx.data || { arr: [], dep: [] },
    { YHZ: { tz: 'America/Halifax' }, YOW: { tz: 'America/Toronto' }, DUB: { tz: 'Europe/Dublin' } },
    (k) => COORDS[String(k || '').toUpperCase()] || null,
    { from: { en: 'From', fr: 'De' }, to: { en: 'To', fr: 'À' } },
    ctx.langs || ['en', 'fr'], () => false,
    (c, lg) => (lg === 'fr' && CITY_FR[c]) || CITY_EN[c] || '', ctx.storage || store(),
    (k) => (ctx.files || {})[String(k || '').toUpperCase()] || null);
  mod.window = window;
  return mod;
}

// ── the arrivals-only list ────────────────────────────────────────────────

test('Halifax gate 3 at 13:30: PD2327 from Montreal is the arrival at the door, and no departure is', () => {
  const data = YHZ();
  assert.equal(data.dep.filter((d) => d.gate === '3').length, 0, 'the feed filed no departure from gate 3');
  const pd = find(data.arr, 'PD2327');
  assert.ok(pd); assert.equal(pd.gate, '3'); assert.equal(pd._sortTs, AT(13, 58));
  const E = engine({ ap: 'YHZ', data, files: FILES });
  const got = E._gateArrivalsAt('3', AT(13, 30), 'YHZ');
  assert.equal(got.length, 1); assert.equal(got[0].flight, 'PD2327');
  // the same answer from the cheap read the render key makes once a second
  assert.deepEqual(E._gateArrivalsAt('3', AT(13, 30), 'YHZ', true).map((r) => r.flight), ['PD2327']);
  // three hours ahead of its earliest time, no earlier
  assert.deepEqual(E._gateArrivalsAt('3', AT(9, 0), 'YHZ'), []);
  assert.deepEqual(E._gateArrivalsAt('3', AT(10, 57), 'YHZ'), []);
  assert.equal(E._gateArrivalsAt('3', AT(10, 59), 'YHZ').length, 1);
  // not another door
  assert.deepEqual(E._gateArrivalsAt('4', AT(13, 30), 'YHZ'), []);
  // an unconfirmed arrival stays ARR_CONFIRM_MIN past its time, no longer
  assert.equal(E._gateArrivalsAt('3', AT(14, 20), 'YHZ').length, 1);
  assert.deepEqual(E._gateArrivalsAt('3', AT(14, 35), 'YHZ'), []);
});

test('down: the deplaning minutes after the landing, then nothing; a Delayed in the airport word stays; cancelled never', () => {
  const data = YHZ();
  const pd = find(data.arr, 'PD2327');
  Object.assign(pd, { status: 'arrived', _stInferred: false, _stExplicit: true, _revTs: AT(14, 2), upd: '2:02 PM' });
  const E = engine({ ap: 'YHZ', data, files: FILES });
  assert.equal(E._gateArrivalsAt('3', AT(14, 15), 'YHZ').length, 1, 'thirteen minutes after it landed: still at the door');
  assert.equal(E._gateArrivalsAt('3', AT(14, 15), 'YHZ', true).length, 1);
  assert.deepEqual(E._gateArrivalsAt('3', AT(14, 40), 'YHZ'), [], 'past _GATE_DEPLANE_MS the door is empty');
  assert.deepEqual(E._gateArrivalsAt('3', AT(14, 40), 'YHZ', true), []);
  // the cheap read lands it from the row own times (no memory, no landing clock)
  assert.doesNotMatch(fnSource('_gateArrivalsAt').split('if (!cheap)')[0], /_gateArrsSeen|_gateLandedAt/);
  // Delayed in the airport word, no new time: live for as long as the arrivals board keeps it
  const d2 = YHZ();
  Object.assign(find(d2.arr, 'PD2327'), { status: 'delayed', _stExplicit: true, _revTs: null });
  assert.equal(engine({ ap: 'YHZ', data: d2, files: FILES })._gateArrivalsAt('3', AT(14, 50), 'YHZ').length, 1);
  // cancelled or diverted is not coming here
  for (const st of ['cancelled', 'diverted']) {
    const d3 = YHZ();
    Object.assign(find(d3.arr, 'PD2327'), { status: st, _stExplicit: true });
    assert.deepEqual(engine({ ap: 'YHZ', data: d3, files: FILES })._gateArrivalsAt('3', AT(13, 30), 'YHZ'), [], st);
  }
});

test('Ottawa 15B at 12:00: AC889 from Heathrow is the arrival at the door, and door 15 reads it too (exact spelling first)', () => {
  const data = YOW();
  const ac = find(data.arr, 'AC889');
  assert.equal(ac.gate, '15B'); assert.equal(ac._revTs, ET(13, 16));
  const E = engine({ ap: 'YOW', data, files: FILES });
  assert.equal(E._gateArrivalsAt('15B', ET(12, 0), 'YOW')[0].flight, 'AC889');
  assert.equal(E._gateArrivalsAt('15', ET(12, 0), 'YOW')[0].flight, 'AC889', 'one door, two spellings');
  assert.deepEqual(E._gateArrivalsAt('15B', ET(9, 0), 'YOW'), [], 'not before 10:16 (its earliest time less three hours)');
  // an arrival at the exact spelling comes first
  const exact = Object.assign({}, ac, { flight: 'AC457', gate: '15', _locIata: 'YYZ', _sortTs: ET(13, 30), _revTs: null });
  data.arr.push(exact);
  const list = engine({ ap: 'YOW', data, files: FILES })._gateArrivalsAt('15', ET(12, 0), 'YOW');
  assert.deepEqual(list.map((r) => r.flight), ['AC457', 'AC889']);
  assert.deepEqual(engine({ ap: 'YOW', data, files: FILES })._gateArrivalsAt('15B', ET(12, 0), 'YOW').map((r) => r.flight), ['AC889', 'AC457']);
  // where the file says two doors (Dublin 305 / 305A), the other door is not this one
  const dub = { arr: [{ flight: 'EI123', airline: 'EI', gate: '305A', _locIata: 'LHR', status: 'scheduled', _stInferred: false, _sortTs: Date.UTC(2026, 10, 7, 12, 0), _revTs: null }], dep: [] };
  assert.deepEqual(engine({ ap: 'DUB', data: dub, files: FILES })._gateArrivalsAt('305', Date.UTC(2026, 10, 7, 11, 0), 'DUB'), []);
  assert.equal(engine({ ap: 'DUB', data: dub, files: FILES })._gateArrivalsAt('305A', Date.UTC(2026, 10, 7, 11, 0), 'DUB').length, 1);
});

test('the map with no departure: the leg in from Montreal, no aeroplane without evidence, on the stand while it deplanes', () => {
  const data = YHZ();
  const E = engine({ ap: 'YHZ', data, files: FILES });
  const pd = find(data.arr, 'PD2327');
  const res = E._gateAircraftWhere(pd, null, AT(13, 30));
  assert.equal(res.kind, 'none'); assert.equal(res.leg, 'in'); assert.equal(res.org, 'YUL'); assert.equal(res.dst, 'YHZ');
  const note = textOf(E._gateMapNote(res));
  assert.match(note, /Montr/);
  assert.match(note, /From/);
  // the feed says it arrived at 14:02: on the stand for its deplaning minutes
  const d2 = YHZ();
  Object.assign(find(d2.arr, 'PD2327'), { status: 'arrived', _stInferred: false, _stExplicit: true, _revTs: AT(14, 2) });
  const E2 = engine({ ap: 'YHZ', data: d2, files: FILES });
  const landed = find(d2.arr, 'PD2327');
  assert.equal(E2._gateAircraftWhere(landed, null, AT(14, 10)).kind, 'stand');
  assert.equal(E2._gateAircraftWhere(landed, null, AT(14, 40)).kind, 'none', 'and gone from the stand after them');
});

test('a departure whose pairing names no inbound: the arrival at its door is shown as an aircraft, never as yours', () => {
  // Halifax: a WestJet departure from gate 3 at 16:00 with PD2327 arriving at gate 3 at 13:58
  const data = YHZ();
  const ws = { flight: 'WS3310', airline: 'WS', gate: '3', _locIata: 'YYZ', status: 'scheduled', _stInferred: false, _sortTs: AT(16, 0), _revTs: null };
  data.dep.push(ws);
  const E = engine({ ap: 'YHZ', data, files: FILES });
  assert.equal(E._gateInboundForDeparture(ws, '3', data.arr, data.dep), null, 'the pairing names none: another family');
  const door = E._gateArrivalsAt('3', AT(13, 30), 'YHZ')[0];
  assert.equal(door.flight, 'PD2327');
  assert.ok(door._sortTs < ws._sortTs, 'it lands before the departure: the door-only inbound');
  // the render takes it as the inbound, flagged _doorOnly, with the neutral labels
  const paint = CORE.slice(CORE.indexOf('var _doorOnlyInb = null;'), CORE.indexOf('try { window._gatePanelInbound = inboundFlight || null; }'));
  assert.match(paint, /_gateArrivalsAt\(_gateVal, Date\.now\(\), _gmAp\)\[0\]/);
  assert.match(paint, /_dArr\._sortTs < currentFlight\._sortTs && _dArr\.flight !== currentFlight\.flight/);
  assert.match(paint, /const inboundFlight = _verifiedInbound \|\| _gateMatchFallback \|\| _doorOnlyInb;/);
  assert.match(paint, /inboundFlight\._doorOnly = !!\(_doorOnlyInb && inboundFlight === _doorOnlyInb\);/);
  assert.match(CORE, /var _mcTitleKey = \(_ib && _ib\._doorOnly === true\) \? 'aircraftFrom' : 'yourAircraftHdr';/, 'the rail title');
  assert.match(CORE, /if \(!\(ctx && ctx\.out\) && _capF\._doorOnly === true\) _capKey = 'aircraftFrom';/, 'the big-map caption');
  assert.match(CORE, /ctx\.out \? 'departure' : \(f\._doorOnly === true \? 'aircraftFrom' : _gateInbCaptionKey\(f, Date\.now\(\)\)\)/, 'and its paint key');
  // the door pick is never marked _gateNoAdsb by the render (only the pairing's pick is)
  assert.doesNotMatch(paint, /_doorOnlyInb\._gateNoAdsb = true/);
});

// ── the markup ────────────────────────────────────────────────────────────

const CITY = { YUL: 'MONTREAL', LHR: 'LONDON', YYZ: 'TORONTO', YHZ: 'HALIFAX', YOW: 'OTTAWA' };
const titleCase = (s) => String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The gate's arrivals-only builder, wired to a stub board. */
function board({ now, langs = ['en', 'fr'], lang = 'en', ap = 'YHZ', sub = '3', win = {} }) {
  const ctx = {
    window: Object.assign({ _gateIata: ap, _gateOrbParts: (c) => ({ path: `/logos/${c}.svg`, badge: 'width:1px;', imgStyle: '', native: false }) }, win),
    langs, lang, console: { log() {} },
    AP: { YHZ: { tz: 'America/Halifax', name: 'Halifax Stanfield International' }, YOW: { tz: 'America/Toronto', name: 'Ottawa Macdonald-Cartier International' } },
    subScreenVal: sub,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
    frFirstAirport: () => false,
    cityCode: (ia) => titleCase(CITY[ia] || ia),
    _cityForIata: (ia) => CITY[ia] || ia,
    normalizeDisplayCity: (c) => titleCase(c),
    _stripCityCode: (s) => s,
    _dispIata: (c) => c,
    _realIata: (c) => c,
    _cityAp: (c) => c,
    _cityApHtml: (city, ia, withCode) => esc(city) + (withCode && ia ? ' <span class="ap-code">' + esc(ia) + '</span>' : ''),
    _gateChangeAccent: () => '#D82F2E',
    _airlineOrbEmblem: (c) => `/logos/${c}.svg`,
    _orbEmblemCarrier: (c) => c,
    _orbMono: (c) => c,
    _GATE_PARKED: {},
    _gateTaxi: null,
    _gateRowKey: (r) => String(r.flight) + '|' + String(r._sortTs),
  };
  const names = ['_gateArrivalOnlyHtml', '_gateLbl', '_gateInbCaptionKey', 'fidsInboundHasArrived', 'fidsInboundOnStand',
    '_gateRawStatus', '_gateRawAirborne', '_gatePushLeft', '_gateOutboundAtGate', '_fidsBoardRowPlace', '_gateLaterTs',
    '_gateLegGone', 'adbTs', '_screenLangAttrs', 'fidsEscHtml', '_gateLaterPlace', '_gateLaterPlaceHtml', '_gateChangeOrbHtml', '_ssEntry'];
  const code = [declSource('var _GATE_LBL = {'), declSource('const LS = {'), declSource('const SS = {'),
    declSource('const TL = k => {'), declSource('const SL = k => {'),
    lineSource('var BOARDING_HOLD_MIN = '), lineSource('var GATE_GRACE_MIN = '), lineSource('var BOARD_TRAIL_MIN = '),
    lineSource('var DELAY_HOLD_MIN = '), lineSource('const DEPART_TRAIL_HRS = ')]
    .concat(names.map(fnSource)).join('\n')
    + '\nreturn {' + names.join(',') + ', LS, SS, _GATE_LBL };';
  const keys = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, code)(...keys.map((k) => ctx[k]));
}

const PD2327 = (extra) => Object.assign({
  flight: 'PD2327', airline: 'PD', gate: '3', _locIata: 'YUL', origin: 'Montreal', status: 'ontime', _stInferred: false,
  _stExplicit: false, _sortTs: AT(13, 58), _revTs: null, upd: null,
}, extra || {});
const clock = (ts) => String(BoardStrings.boardTime(new Date(ts), 'America/Halifax', { hour: '2-digit' })).replace(/^0(\d)/, '$1');

test('the markup: the incoming aircraft beside its map, the empty-gate ids, and no Awaiting Next Flight', () => {
  const b = board({ now: AT(13, 30) });
  const html = b._gateArrivalOnlyHtml(PD2327(), 'YHZ', '1:30 PM', 'Friday, November 7, 2026');
  const text = textOf(html);
  assert.match(text, /Arriving From \| Provenant de/);
  assert.match(text, /Next arrival \| Prochaine arrivée/);
  assert.match(text, /Montreal/);
  assert.match(text, /YUL/);
  assert.match(text, /Flight \| Vol PD2327/);
  assert.match(text, new RegExp('Arriving at ' + clock(AT(13, 58)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, /Arrives in 28 min/);
  assert.match(text, /Gate \| Porte/);
  assert.match(text, /Halifax/);
  assert.match(text, /1:30 PM/);
  assert.match(text, /Friday, November 7, 2026/);
  assert.doesNotMatch(text, /Awaiting Next Flight|En attente du prochain vol/);
  for (const id of ['gateMapBox', 'dedicatedEmptyTime', 'dedicatedFooterRight', 'gateBgArr']) assert.ok(html.indexOf('id="' + id + '"') > 0, id);
  assert.ok(html.indexOf('class="gate-screen gate-arr-only"') > 0);
  assert.ok(html.indexOf('class="gate-footer"') > 0);
  // the single-language words carry their language
  assert.match(html, /<div lang="en" style="[^"]*"><span[^>]*>Arriving at<\/span>/);
  assert.match(html, /<div lang="en" style="[^"]*">Arrives in 28 min<\/div>/);
  // a revised time: the schedule struck through, the new one beside it
  const early = textOf(b._gateArrivalOnlyHtml(PD2327({ status: 'early', _stExplicit: true, _revTs: AT(13, 40), upd: '1:40 PM' }), 'YHZ', '1:30 PM', ''));
  assert.match(early, new RegExp(clock(AT(13, 58)) + ' ' + clock(AT(13, 40))));
  assert.match(early, /Arrives in 10 min/);
  // more than an hour out: hours and minutes
  assert.match(textOf(board({ now: AT(11, 30) })._gateArrivalOnlyHtml(PD2327(), 'YHZ', '11:30 AM', '')), /Arrives in 2h 28m/);
});

test('the markup once it is down: Arrived From, Landed while it taxis, At the gate on its blocks', () => {
  const b = board({ now: AT(14, 10) });
  const landed = textOf(b._gateArrivalOnlyHtml(PD2327({ status: 'landed', _stExplicit: true, _revTs: AT(14, 2) }), 'YHZ', '2:10 PM', ''));
  assert.match(landed, /Arrived From \| Arrivé de/);
  assert.match(landed, new RegExp('Arrived at ' + clock(AT(14, 2))));
  assert.match(landed, /Landed/);
  assert.doesNotMatch(landed, /Arrives in/);
  const arrived = textOf(b._gateArrivalOnlyHtml(PD2327({ status: 'arrived', _stExplicit: true, _revTs: AT(14, 2) }), 'YHZ', '2:10 PM', ''));
  assert.match(arrived, /Arrived From \| Arrivé de/);
  assert.match(arrived, /At the gate/);
  assert.doesNotMatch(arrived, /Landed/);
});

test('with the arrivals feed down the notice stands where the card would, and there is no map box', () => {
  const b = board({ now: AT(13, 30) });
  const html = b._gateArrivalOnlyHtml(PD2327(), 'YHZ', '1:30 PM', 'Friday', '<span class="ffn-inview-line">down</span>');
  assert.ok(html.indexOf('class="ffn-inview ffn-inview--gate" role="status"') > 0);
  assert.ok(html.indexOf('id="gateMapBox"') < 0);
  assert.doesNotMatch(textOf(html), /PD2327|Arriving/);
  assert.ok(html.indexOf('id="dedicatedEmptyTime"') > 0, 'the clock still ticks');
});

test('every board language: the pairs and the single words come out in that language alone', () => {
  const langsAll = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
  for (const l of langsAll) {
    const b = board({ now: AT(13, 30), langs: [l], lang: l });
    const html = b._gateArrivalOnlyHtml(PD2327(), 'YHZ', '1:30 PM', '');
    const text = textOf(html);
    assert.ok(text.length > 40, l);
    assert.ok(text.indexOf(b._GATE_LBL.arrivingFrom[l]) >= 0, l + ': Arriving From in ' + l);
    assert.ok(text.indexOf(b._GATE_LBL.flight[l]) >= 0, l + ': Flight in ' + l);
    assert.ok(text.indexOf(b._GATE_LBL.gate[l]) >= 0, l + ': Gate in ' + l);
    assert.ok(text.indexOf(b.LS.arrivingAt[l]) >= 0, l + ': Arriving at in ' + l);
    assert.ok(text.indexOf(b.LS.arrivesIn[l]) >= 0, l + ': Arrives in in ' + l);
    assert.ok(text.indexOf(BoardStrings.bs('nextArrival', l)) >= 0, l + ': Next arrival in ' + l);
    if (l !== 'en') {
      assert.ok(text.indexOf('Arriving at') < 0, l + ': no English left behind');
      assert.ok(text.indexOf('Arrives in') < 0, l + ': no English left behind');
    }
    assert.ok(html.indexOf(' lang="' + l + '"') > 0, l + ': the language is marked');
    if (l === 'ar') assert.ok(html.indexOf(' dir="rtl"') > 0, 'Arabic reads right to left');
    // down
    const down = textOf(board({ now: AT(14, 10), langs: [l], lang: l })._gateArrivalOnlyHtml(PD2327({ status: 'arrived', _stExplicit: true, _revTs: AT(14, 2) }), 'YHZ', '2:10 PM', ''));
    assert.ok(down.indexOf(b._GATE_LBL.arrivedFrom[l]) >= 0, l + ': Arrived From');
    assert.ok(down.indexOf(b.LS.atGateLbl[l]) >= 0, l + ': At the gate');
  }
  // two languages, French first at a Québec airport: the pair leads with French
  const q = board({ now: AT(13, 30), langs: ['en', 'fr'] });
  const html = q._gateArrivalOnlyHtml(PD2327(), 'YHZ', '1:30 PM', '');
  assert.match(textOf(html), /Arriving From \| Provenant de/);
});

// ── the render, by source ────────────────────────────────────────────────

test('the render key carries the arrival at the door (cheap read) and the arrivals feed; the empty gate clears the state', () => {
  const key = CORE.slice(CORE.indexOf('function getDedicatedRenderKey()'), CORE.indexOf("if (screenType === 'baggage')", CORE.indexOf('function getDedicatedRenderKey()')));
  assert.match(key, /arr: first \? null : \(function \(\) \{/);
  assert.match(key, /_gateArrivalsAt\(subScreenVal, _nowMs2, iata, true\)\[0\]/);
  assert.match(key, /min: down \? Math\.floor\(_nowMs2 \/ 60000\) : 0/);
  assert.match(key, /feedArr: first \? null : _fidsFeedDownKey\(iata, 'arr'\)/);
  assert.match(key, /feed: _fidsFeedDownKey\(iata, 'dep'\)/, 'the departures feed as before');
  // the arrivals-only branch, after the gate-change notice and before the empty gate
  const paint = CORE.slice(CORE.indexOf('function renderDedicatedScreen()'), CORE.indexOf("else if (screenType === 'baggage')"));
  const iSolo = paint.indexOf('gView.innerHTML = _gateChangeSoloHtml(_glSolo, timeStr);');
  const iArr = paint.indexOf('_arrOnly = _gateArrivalsAt(subScreenVal, Date.now(), iata)[0] || null;');
  const iEmpty = paint.indexOf("const _gateFeedDown = _fidsFeedDownInView(iata, 'dep');");
  assert.ok(iSolo > 0 && iArr > iSolo && iEmpty > iArr, 'notice, then the arrival, then the empty gate');
  const branch = paint.slice(iArr, iEmpty);
  assert.match(branch, /window\._gateCurrentFlight = null;\s*window\._gateCurrentAirline = String\(_arrOnly\.airline \|\| ''\)\.toUpperCase\(\);\s*window\._gateInbound = _arrOnly;\s*window\._gatePanelInbound = _arrOnly;\s*window\._gateInboundId = _arrId;\s*window\._gateLastFlightKey = '';/);
  assert.match(branch, /_fidsFeedDownInView\(iata, 'arr'\)/, 'the arrivals feed is announced');
  assert.match(branch, /if \(window\._lastGateArrKey !== _arrKey \|\| !gView\.querySelector\('\.gate-arr-only'\)\)/, 'the inner key, and markup that is not this state is replaced');
  const keyLine = branch.slice(branch.indexOf('var _arrKey'), branch.indexOf('if (window._lastGateArrKey'));
  assert.doesNotMatch(keyLine, /\blang\b/, 'lang is not in the inner key');
  assert.match(keyLine, /\[iata, subScreenVal, _arrOnly\.flight/, 'the screen itself is (a walking display)');
  assert.match(branch, /langs\.join\('\+'\)/, 'the languages are');
  assert.match(branch, /gView\.innerHTML = _gateArrivalOnlyHtml\(_arrOnly, iata, timeStr, dateDisplay, _arrFeedDown\);/);
  assert.match(branch, /_gateMapApply\(_gateAircraftWhere\(window\._gateInbound, null, Date\.now\(\)\)\);/, 'the map with no departure');
  assert.match(branch, /window\._gateMapRetry = _arrTryInit;/);
  assert.doesNotMatch(branch, /startGateAds\(|_renderBigCraft\(/, 'no ads, no big map slide, from this state');
  assert.match(branch, /_arrOnly\._gateNoAdsb = false/, 'a door pick is looked up like an exact-gate inbound');
  // the empty path clears what the states above set
  const iClear = paint.indexOf('// v24130 — nothing of the states above survives into the empty gate');
  assert.ok(iClear > iArr && iClear < iEmpty, 'the clearing sits between the arrival branch and the empty gate');
  const empty = paint.slice(iClear, iEmpty);
  assert.match(empty, /window\._gateCurrentFlight = null; window\._gateInbound = null; window\._gatePanelInbound = null;/);
  assert.match(empty, /window\._gateMapRetry = null;/);
  assert.match(empty, /gateMap\.remove\(\)/);
  assert.match(empty, /window\._lastGateArrKey = ''/);
  // the awaiting line and the departures notice are untouched
  assert.match(paint, /\$\{_gateFeedDown \? `<div class="ffn-inview ffn-inview--gate" role="status">\$\{_gateFeedDown\}<\/div>` : `<div[^`]*>\$\{TL\('awaitingNextFlight'\)\}<\/div>`\}/);
});

test('the comments carry no apostrophes (the quote counter) and the lead is one constant', () => {
  for (const name of ['_gateArrivalsAt', '_gateArrivalOnlyHtml', '_gateDoorBase', '_gateDoorOwn', '_gateSameDoor', '_gateDoorFold']) {
    const src = fnSource(name);
    const comments = src.split('\n').filter((l) => /^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(comments, /'/, name);
  }
  assert.equal(lineSource('var GATE_ARR_LEAD_MS = '), 'var GATE_ARR_LEAD_MS = 3 * 3600000;');
  assert.match(fnSource('_gateArrivalsAt'), /_gateArrEarliestTs\(f\) - GATE_ARR_LEAD_MS/);
});
