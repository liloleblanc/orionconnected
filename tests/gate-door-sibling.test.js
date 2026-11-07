'use strict';

// WHY THIS EXISTS
//
// v24130. Ottawa, 2026-11-07: AC889 from Heathrow (an A330) came in at gate
// 15B at 13:16 and left again as AC888 for Heathrow from gate 15 at 18:50.
// The feed spelt the one door two ways, and the pairing compared the gate
// strings as they came: the 15 screen showed AC888 with no incoming aircraft
// and the 15B screen had no departure at all. Probed on the saved rows of
// that afternoon (tests/fixtures/yow-*-2026-11-07T1804Z.json): neither row
// carried a registration (none of the 43 departures or 59 arrivals did), so
// the tail short-cut could not pair them; neither named a type; the exact
// gate compare was the one filter that failed.
//
// A single trailing letter after a run of digits is a POSITION at the
// numbered door (_gateDoorBase, _gateSameDoor), the shape the stands code
// reads as 1A and 1B of door 1. The fold is data-aware: where the airport
// gate file surveys the lettered spelling as a door of its own (Dublin 305A,
// 19 m from 305; YYT 7A, 54 m from 7) the two stay apart; a lettered door
// at its number (Vancouver 19A, 7 m from 19; Sydney 40A) is one door. The
// departures lists stay exact: a 15B screen never adopts the departure of 15.
//
// These run the real functions lifted out of fids-core.js, as
// tests/gate-map-evidence.test.js does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

const FNS = [
  '_gateRefNorm', '_gateLegGone', '_gateFamily', '_gateTodayReg', '_gateIsProp', '_gateMinTurnMs', '_gateAcFamily',
  '_gateHereTz', '_gateLocalHour', '_gateNightStop', '_gateCouldTurn', '_gateDepOwnInbound', '_gateArrivalClaimed',
  '_gateTurnedByPattern', '_gateInboundForDeparture', '_gateMatchIsNew', '_gateDepSchedTs', 'adbTs', '_gcNm',
  '_gateDoorBase', '_gateDoorOwn', '_gateSameDoor', '_gateDoorFold', '_gateOwnGateRef',
];

// The surveyed gate files, as the page holds them once loaded (_apGatesFor's
// synchronous cache). `files` = {} is a page with no file loaded.
const gateFile = (ap) => JSON.parse(fs.readFileSync(path.join(root, 'fids-current', 'data', 'gates', ap + '.json'), 'utf8'));
const FILES = {};
for (const ap of ['YOW', 'YHZ', 'DUB', 'YVR', 'YYT', 'SYD', 'YQM']) FILES[ap] = gateFile(ap);

function engine(ctx) {
  ctx = ctx || {};
  const window = Object.assign({ _gateIata: ctx.ap || 'YOW' }, ctx.window || {});
  const files = ctx.files || {};
  const src = [lineSource('var _GATE_DOOR_SIBLING_M = ')].concat(FNS.map(fnSource))
    .concat(['return { ' + FNS.map((n) => n + ': ' + n).join(', ') + ' };']).join('\n');
  const mod = new Function('window', 'AP', 'aircraftCodeToIata', '_apGatesFor', 'subScreenVal', src)(
    window, { YOW: { tz: 'America/Toronto' }, YHZ: { tz: 'America/Halifax' }, YQM: { tz: 'America/Moncton' } },
    (s) => ({ '333': '333', '223': '223', 'Airbus A330-300': '333', 'Airbus A220-300': '223' })[s] || '',
    (k) => files[String(k || '').toUpperCase()] || null,
    ctx.sub === undefined ? '' : ctx.sub);
  mod.window = window;
  return mod;
}

// Ottawa, 2026-11-07, Eastern time (UTC-5).
const ET = (hh, mm) => Date.UTC(2026, 10, 7, hh + 5, mm);
const ts = (s) => (s ? new Date(String(s).replace(' ', 'T')).getTime() : null);
// The FR24 airport-schedule rows as the board reads them (the fields the
// pairing reads; mapADB maps the same fields).
function rowOf(f, mode) {
  const side = mode === 'dep' ? f.departure : f.arrival, other = mode === 'dep' ? f.arrival : f.departure;
  return {
    flight: f.number, airline: (side.airline && side.airline.iata) || f.number.replace(/\d.*/, ''), gate: side.gate || '—',
    _locIata: other.airport && other.airport.iata, status: String(f.status || '').toLowerCase(), _stInferred: false,
    _sortTs: ts(side.scheduledTime && side.scheduledTime.local), _revTs: ts(side.revisedTime && side.revisedTime.local),
    _aircraft: (f.aircraft && f.aircraft.model) || '', _reg: (f.aircraft && f.aircraft.reg) || '',
  };
}
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const YOW = () => ({
  arr: fixture('yow-arrivals-2026-11-07T1804Z.json').arrivals.map((f) => rowOf(f, 'arr')),
  dep: fixture('yow-departures-2026-11-07T1804Z.json').departures.map((f) => rowOf(f, 'dep')),
});
const find = (list, flight) => list.find((r) => r.flight === flight);

test('one door, two spellings: the shape alone, with no gate file known', () => {
  const E = engine();
  const table = [
    ['15B', '15', true], ['15', '15', true], ['1A', '1B', true], ['GATE 015b', '15', true],
    ['A1', 'A12', false], ['15', '16', false], ['C52', 'C5', false], ['', '15', false], ['1', '4', false],
  ];
  for (const [a, b, want] of table) assert.equal(E._gateSameDoor(a, b), want, a + ' / ' + b);
  assert.equal(E._gateDoorBase('15B'), '15');
  assert.equal(E._gateDoorBase('A12'), 'A12', 'a letter in front is a pier, not a position');
  assert.equal(E._gateDoorBase('Gate 015b'), '15');
  assert.equal(E._gateDoorOwn('15B', 'YOW'), null, 'no file known: nothing to say');
});

test('the fold is data-aware: the surveyed files decide where a lettered door is its own', () => {
  const E = engine({ files: FILES });
  // Ottawa has no 15B of its own: 15B is door 15 (door_stands 15 = 15, 15A)
  assert.equal(E._gateSameDoor('15B', '15', 'YOW'), true);
  assert.equal(E._gateDoorFold('15B', 'YOW'), '15');
  // Dublin surveys 305, 305A and 305B as separate doors, 19 and 26 m apart
  assert.equal(E._gateSameDoor('305A', '305', 'DUB'), false);
  assert.equal(E._gateSameDoor('305B', '305', 'DUB'), false);
  assert.equal(E._gateSameDoor('307A', '307', 'DUB'), false);
  assert.equal(E._gateDoorOwn('305A', 'DUB'), true);
  assert.equal(E._gateDoorFold('305A', 'DUB'), '305A');
  // Vancouver 19A is 7 m from 19 and 26A 10 m from 26: one door, two signs
  assert.equal(E._gateSameDoor('19A', '19', 'YVR'), true);
  assert.equal(E._gateSameDoor('26A', '26', 'YVR'), true);
  assert.equal(E._gateDoorFold('19A', 'YVR'), '19');
  // Sydney 40A is at 40
  assert.equal(E._gateSameDoor('40A', '40', 'SYD'), true);
  // YYT 7A to 11A are 23 to 89 m from their numbers: separate doors
  for (const n of ['7', '8', '9', '10', '11']) assert.equal(E._gateSameDoor(n + 'A', n, 'YYT'), false, 'YYT ' + n + 'A');
  // Halifax 2A to 2E are five doors with no door 2: never one another
  assert.equal(E._gateSameDoor('2A', '2B', 'YHZ'), false);
  assert.equal(E._gateSameDoor('3', '3', 'YHZ'), true);
  // the same spelling is always the same door, file or none
  assert.equal(E._gateSameDoor('305A', '305A', 'DUB'), true);
  // the airport defaults to the page's own when a caller passes none
  const Edub = engine({ files: FILES, ap: 'DUB' });
  assert.equal(Edub._gateSameDoor('305A', '305'), false);
});

test('Ottawa 2026-11-07: AC889 at 15B is the aeroplane of AC888 at 15, on the real rows', () => {
  const E = engine({ files: FILES, ap: 'YOW' });
  const data = YOW();
  const cf = find(data.dep, 'AC888'), a = find(data.arr, 'AC889');
  assert.ok(cf && a, 'both rows are in the snapshot');
  assert.equal(a.gate, '15B'); assert.equal(cf.gate, '15');
  assert.equal(a._revTs, ET(13, 16)); assert.equal(cf._sortTs, ET(18, 50));
  // the probe: what the live code could and could not see on these rows
  assert.equal(E._gateTodayReg(cf), '', 'the departure row carries no registration');
  assert.equal(E._gateTodayReg(a), '', 'nor does the arrival');
  assert.equal(data.dep.filter((d) => E._gateTodayReg(d)).length, 0, 'no departure in the feed carried a tail that day');
  assert.equal(data.arr.filter((d) => E._gateTodayReg(d)).length, 0, 'no arrival did either');
  assert.equal(E._gateAcFamily(cf._aircraft), ''); assert.equal(E._gateAcFamily(a._aircraft), '');
  assert.equal(E._gateFamily(a.airline), E._gateFamily(cf.airline));
  assert.ok(cf._sortTs - a._sortTs >= E._gateMinTurnMs(cf, a));
  assert.equal(E._gateTurnedByPattern(a, cf, data.dep, data.arr), null);
  assert.equal(E._gateArrivalClaimed(a, cf, data.dep, data.arr), null);
  assert.notEqual(a.gate, cf.gate, 'the exact string compare is the one test that differs');
  // the pairing, with the door test
  const inb = E._gateInboundForDeparture(cf, '15', data.arr, data.dep);
  assert.ok(inb, 'AC888 has an inbound');
  assert.equal(inb.flight, 'AC889'); assert.equal(inb.gate, '15B');
  // and it is the class of lookup an exact-gate inbound makes (not _gateNoAdsb)
  assert.equal(E._gateMatchIsNew(inb, cf, '15'), false);
  // the turn rules read one door too
  assert.equal(E._gateCouldTurn(cf, a, data.arr), true);
});

test('an arrival at the exact spelling outranks one at the sibling; types still rule an aeroplane out', () => {
  const E = engine({ files: FILES, ap: 'YOW' });
  const data = YOW();
  const cf = find(data.dep, 'AC888');
  const typed = (r, t) => Object.assign({}, r, { _aircraft: t, _aircraftCode: t === 'Airbus A330-300' ? '333' : '223' });
  const a333 = typed(find(data.arr, 'AC889'), 'Airbus A330-300');
  const twin = { flight: 'AC891', airline: 'AC', gate: '15', _locIata: 'FRA', status: 'scheduled', _stInferred: false,
    _sortTs: ET(14, 0), _revTs: null, _aircraft: 'Airbus A330-300', _aircraftCode: '333', _reg: '' };
  const arrs = data.arr.filter((r) => r.flight !== 'AC889').concat([a333, twin]);
  const cf333 = typed(cf, 'Airbus A330-300');
  assert.equal(E._gateInboundForDeparture(cf333, '15', arrs, data.dep).flight, 'AC891', 'the exact door wins when both fit');
  assert.equal(E._gateInboundForDeparture(cf333, '15', arrs.filter((r) => r !== twin), data.dep).flight, 'AC889', 'else the sibling');
  // an A220 leaving door 15 at 15:00 is not the A330 that came in at 15B
  const ac464 = { flight: 'AC464', airline: 'AC', gate: '15', _locIata: 'YYZ', status: 'scheduled', _stInferred: false,
    _sortTs: ET(15, 0), _revTs: null, _aircraft: 'Airbus A220-300', _aircraftCode: '223', _reg: '' };
  assert.notEqual((E._gateInboundForDeparture(ac464, '15', arrs, data.dep.concat([ac464])) || {}).flight, 'AC889');
  // and with that A220 departure in the list the A330 still pairs with AC888 (the types block the claim)
  assert.equal(E._gateInboundForDeparture(cf333, '15', arrs.filter((r) => r !== twin), data.dep.concat([ac464])).flight, 'AC889');
});

test('where the file says two doors, the pairing keeps them apart (Dublin 305 / 305A)', () => {
  const E = engine({ files: FILES, ap: 'DUB' });
  const T = (hh, mm) => Date.UTC(2026, 10, 7, hh, mm);
  const a = { flight: 'EI123', airline: 'EI', gate: '305A', _locIata: 'LHR', status: 'scheduled', _stInferred: false, _sortTs: T(10, 0), _revTs: null };
  const d = { flight: 'EI124', airline: 'EI', gate: '305', _locIata: 'LHR', status: 'scheduled', _stInferred: false, _sortTs: T(12, 0), _revTs: null };
  assert.equal(E._gateInboundForDeparture(d, '305', [a], [d]), null, 'Dublin 305A is its own door');
  assert.equal(E._gateMatchIsNew(a, d, '305'), true);
  // with no file known the same rows fold by shape
  const E0 = engine({ ap: 'DUB' });
  assert.equal((E0._gateInboundForDeparture(d, '305', [a], [d]) || {}).flight, 'EI123');
});

test('departures stay exact: a 15B screen never adopts the departure of gate 15', () => {
  const flightsAt = fnSource('_gateFlightsAt');
  assert.match(flightsAt, /if \(f\.gate !== sub && f\.flight !== sub/, '_gateFlightsAt compares the gate as it came');
  assert.doesNotMatch(flightsAt, /_gateSameDoor|_gateDoorBase/);
  assert.match(fnSource('_gateHoldYields'), /r\.gate !== f\.gate/);
  assert.doesNotMatch(fnSource('_gateHoldYields'), /_gateSameDoor/);
  assert.doesNotMatch(fnSource('_gateLiveGates'), /_gateSameDoor/);
  // the Moncton doors 1 to 4 (tests/gate-map-evidence.test.js) are unaffected: no letters
  const E = engine({ files: FILES, ap: 'YQM' });
  for (const g of ['1', '2', '3', '4']) for (const h of ['1', '2', '3', '4']) assert.equal(E._gateSameDoor(g, h, 'YQM'), g === h, g + '/' + h);
});

test('the own gate for the parked view: a 15B screen with no departure stands at door 15', () => {
  // a departure at the door: its gate, as before
  assert.equal(engine({ files: FILES, ap: 'YOW', sub: '15B', window: { _gateCurrentFlight: { gate: '15B' } } })._gateOwnGateRef('YOW'), '15B');
  assert.equal(engine({ files: FILES, ap: 'YOW', sub: '4', window: { _gateCurrentFlight: { gate: '' } } })._gateOwnGateRef('YOW'), '4');
  // none (the arrivals-only screen): the door, where the file lists 15B as no door of its own
  assert.equal(engine({ files: FILES, ap: 'YOW', sub: '15B', window: { _gateCurrentFlight: null } })._gateOwnGateRef('YOW'), '15');
  assert.equal(engine({ files: FILES, ap: 'DUB', sub: '305A', window: { _gateCurrentFlight: null } })._gateOwnGateRef('DUB'), '305A', 'Dublin 305A is its own door');
  assert.equal(engine({ files: FILES, ap: 'YOW', sub: '15B', window: { _gateCurrentFlight: null } })._gateOwnGateRef('YYZ'), '', 'another airport is not our gate');
  // the apron's stands for door 15 are what the fold lands on
  assert.deepEqual(FILES.YOW.door_stands['15'], ['15', '15A']);
  assert.equal(FILES.YOW.gates['15B'], undefined);
});

test('the lookup guard reads the same door, and the v23915 header records the new rule', () => {
  assert.match(fnSource('_gateMatchIsNew'), /return inb\.flight === cf\.flight \|\| !_gateSameDoor\(inb\.gate, gateVal\);/);
  const head = CORE.slice(CORE.indexOf('// v23915 — NO NEW FLIGHTRADAR24 LOOKUPS FROM THE NEW PAIRING'), CORE.indexOf('function _gateMatchIsNew('));
  assert.ok(head.indexOf('// v24130 — AND THE SAME DOOR UNDER TWO SPELLINGS IS THE SAME GATE') > 0, 'the header records the new rule under the old one');
  const added = head.slice(head.indexOf('// v24130'));
  assert.match(added, /_gateSameDoor/);
  assert.match(added, /_gateArrivalsAt/);
  assert.doesNotMatch(added, /'/, 'no apostrophes in the new comment');
  // the pairing's gate test and rank
  const pair = fnSource('_gateInboundForDeparture');
  assert.match(pair, /if \(!_gateSameDoor\(f\.gate, gateVal\)\) return false;/);
  assert.match(pair, /_gateRefNorm\(f\.gate\) === _gateRefNorm\(gateVal\) \? 1 : 0/);
  // the turn and claim rules
  assert.match(fnSource('_gateCouldTurn'), /_gateSameDoor\(dG, aG\)/);
  assert.match(fnSource('_gateDepOwnInbound'), /_gateSameDoor\(x\.gate, dG\)/);
  assert.match(fnSource('_gateTurnedByPattern'), /!_gateSameDoor\(d\.gate, aG\)/);
  // the render marks the pairing's pick as before
  assert.match(CORE, /_gateMatchFallback\._gateNoAdsb = _gateMatchIsNew\(_gateMatchFallback, currentFlight, _gateVal\);/);
});
