'use strict';

// WHY THIS EXISTS
//
// v24168. Moncton gate 4, 2026-11-19 at 22:30 ADT: AC1983 to Toronto (05:00,
// a Rouge number) named AC7754 from Ottawa as its aeroplane, "Arrived at the
// gate 6:59 PM". AC7754 is an Air Canada Express flight flown by PAL, and that
// Dash 8 had already left; the real aeroplane, AC1986 from Toronto (Rouge,
// due 00:09), was on the same list, as was AC2040 from Montreal (Rouge).
// _gateFamily folds every Air Canada partner into AC, and the two Rouge
// arrivals carried a remembered type that disagreed with the one the screen
// held for AC1983, so the type test threw both out and the untyped Express
// arrival won by default. Reproduced on that evening's rows in the page.
//
// These run the real functions lifted out of fids-core.js, as
// tests/gate-door-sibling.test.js does, with the real operator ladder.

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
function stmtSource(prefix) {
  const i = CORE.indexOf(prefix);
  assert.ok(i >= 0, prefix + ' must exist');
  return CORE.slice(i, CORE.indexOf(';\n', i) + 1);
}

const VARS = ['var _GATE_DOOR_SIBLING_M = ', 'var AC_EXPRESS_OP = ', 'var _OP_LADDER_NAMES = ', 'var _AC_OP_BANDS = ',
  'var _OP_JAZZ_ONLY_TYPE = ', 'var _OP_WS_DASH8 = ', 'var _AC_OWN_OPERATORS = ', 'var _GATE_AC_EXPRESS_OPS = '];
const FNS = [
  '_gateRefNorm', '_gateLegGone', '_gateFamily', '_gateTodayReg', '_gateIsProp', '_gateMinTurnMs', '_gateAcFamily',
  '_gateHereTz', '_gateLocalHour', '_gateNightStop', '_gateCouldTurn', '_gateDepOwnInbound', '_gateArrivalClaimed',
  '_gateTurnedByPattern', '_gateInboundForDeparture', '_gateDepSchedTs', 'adbTs', '_gcNm',
  '_gateDoorBase', '_gateDoorOwn', '_gateSameDoor', '_gateDoorFold', '_gateOwnGateRef',
  'acOperatorBand', '_opLadderName', '_opEvLegId', '_opEvFarGet', 'fidsResolveOperator', '_gateOpOf', '_gateOpClash',
];

function engine() {
  const window = { _gateIata: 'YQM' };
  const src = VARS.map(stmtSource).concat(FNS.map(fnSource))
    .concat(['return { ' + FNS.map((n) => n + ': ' + n).join(', ') + ' };']).join('\n');
  const codes = { 'B38M': '7M8', '7M8': '7M8', 'A320': '320', 'Airbus A320': '320', 'A321': '321', 'DH8D': 'DH4' };
  return new Function('window', 'AP', 'aircraftCodeToIata', '_apGatesFor', 'subScreenVal',
    'AIRLINE_NAME', 'CALLSIGN_TO_IATA', 'CALLSIGN_ICAO', '_regionalOpFitsRoute', src)(
    window, { YQM: { tz: 'America/Moncton' } }, (s) => codes[s] || '', () => null, '',
    { AC: 'Air Canada', RV: 'Air Canada Rouge', PB: 'PAL Airlines', QK: 'Jazz Aviation' }, {}, {}, () => true);
}

// Moncton is UTC-4 in November (AST). Wall clock -> epoch ms.
const T = (d, hh, mm) => Date.UTC(2026, 10, d, hh + 4, mm);
const arr = (flight, from, d, hh, mm, extra) => Object.assign(
  { flight, airline: 'AC', gate: '4', origin: from, _locIata: from, _sortTs: T(d, hh, mm), status: 'scheduled' }, extra || {});
const dep = (flight, to, d, hh, mm, extra) => Object.assign(
  { flight, airline: 'AC', gate: '4', dest: to, _locIata: to, _sortTs: T(d, hh, mm), status: 'scheduled' }, extra || {});

const AC1983 = dep('AC1983', 'YYZ', 20, 5, 0);
const ARRS = () => [
  arr('AC7754', 'YOW', 19, 18, 39, { status: 'arrived' }),
  arr('AC2040', 'YUL', 19, 23, 33, { status: 'early' }),
  arr('AC1986', 'YYZ', 20, 0, 9, { status: 'early' }),
];
const DEPS = () => [AC1983, dep('AC2037', 'YUL', 20, 6, 20), dep('AC7753', 'YOW', 20, 7, 10)];

test('the operator ladder reads the three numbers as the board does', () => {
  const e = engine();
  assert.equal(e._gateOpOf(AC1983), 'RV');
  assert.equal(e._gateOpOf(ARRS()[0]), 'ACEX');
  assert.equal(e._gateOpOf(ARRS()[2]), 'RV');
});

test('with no types on any row, the Rouge overnight aircraft is the inbound', () => {
  const e = engine();
  assert.equal(e._gateInboundForDeparture(AC1983, '4', ARRS(), DEPS()).flight, 'AC1986');
});

test('gate 4, Nov 19: a type that disagrees no longer hands the pick to the PAL Express flight', () => {
  const e = engine();
  const cf = Object.assign({}, AC1983, { _aircraft: 'A320' });
  const arrs = ARRS().map((a) => a.flight === 'AC7754' ? a : Object.assign({}, a, { _aircraft: 'B38M' }));
  const got = e._gateInboundForDeparture(cf, '4', arrs, DEPS());
  assert.ok(got, 'an inbound is named');
  assert.notEqual(got.flight, 'AC7754');
  assert.equal(got.flight, 'AC1986');
});

test('an Express arrival is never the aeroplane of a Rouge departure, even when it is the only arrival', () => {
  const e = engine();
  const only = [arr('AC7754', 'YOW', 19, 18, 39, { status: 'arrived' })];
  assert.equal(e._gateInboundForDeparture(AC1983, '4', only, DEPS()), null);
});

test('a Rouge arrival whose type agrees still outranks a later one whose type does not', () => {
  const e = engine();
  const cf = Object.assign({}, AC1983, { _aircraft: 'A320' });
  const arrs = ARRS().map((a) => a.flight === 'AC2040' ? Object.assign({}, a, { _aircraft: 'A320' })
    : a.flight === 'AC1986' ? Object.assign({}, a, { _aircraft: 'B38M' }) : a);
  assert.equal(e._gateInboundForDeparture(cf, '4', arrs, DEPS()).flight, 'AC2040');
});

test('Express agrees with either partner; Jazz and PAL named outright do not agree', () => {
  const e = engine();
  assert.equal(e._gateOpClash('ACEX', 'PB'), false);
  assert.equal(e._gateOpClash('QK', 'ACEX'), false);
  assert.equal(e._gateOpClash('QK', 'PB'), true);
  assert.equal(e._gateOpClash('RV', 'ACEX'), true);
  assert.equal(e._gateOpClash('', 'RV'), false);
});

test('outside Air Canada nothing changes: a type that disagrees still rules an arrival out', () => {
  const e = engine();
  const cf = { flight: 'PD2294', airline: 'PD', gate: '3', dest: 'YOW', _locIata: 'YOW', _sortTs: T(20, 6, 15), _aircraft: 'DH8D' };
  const a = { flight: 'PD2381', airline: 'PD', gate: '3', origin: 'YOW', _locIata: 'YOW', _sortTs: T(19, 21, 30), status: 'arrived', _aircraft: 'A320' };
  assert.equal(e._gateInboundForDeparture(cf, '3', [a], [cf]), null);
});
