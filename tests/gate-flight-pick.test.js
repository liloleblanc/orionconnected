'use strict';

// v24143 — AN AIRPORT WHOSE FEED GIVES NO GATE NUMBERS PICKS ITS GATE SCREEN BY
// FLIGHT. Charlottetown (YYG) lists every departure with a dash for its gate.
// The gate screen there listed every flight in the feed alphabetically, never
// walked, and its tile printed a gate number made up from the flight number
// (randomGate: AC2013 read Gate 16). These tests lift the shipped functions
// out of fids-core.js (brace matching, as gate-walk-live.test.js does) and run
// them over a YYG-shaped feed and a gated one, so the rule is what is tested.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'fids-current');
const core = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');
const gidsHtml = fs.readFileSync(path.join(root, 'gids.html'), 'utf8');
const menuJs = fs.readFileSync(path.join(root, 'js', 'menu.js'), 'utf8');
const appHtml = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

function fnSource(name) {
  const start = core.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `fids-core.js must declare ${name}()`);
  let i = core.indexOf('{', start);
  let depth = 0;
  for (; i < core.length; i++) {
    const c = core[i];
    if (c === '/' && core[i + 1] === '/') { i = core.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && core[i + 1] === '*') { i = core.indexOf('*/', i) + 1; continue; }
    if (c === '/' && /[(,=:!&|?]\s*$/.test(core.slice(Math.max(0, i - 3), i))) {
      // a regex literal: skip to its closing slash
      for (i++; i < core.length; i++) {
        if (core[i] === '\\') { i++; continue; }
        if (core[i] === '[') { for (i++; i < core.length && core[i] !== ']'; i++) if (core[i] === '\\') i++; continue; }
        if (core[i] === '/') break;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < core.length; i++) {
        if (core[i] === '\\') { i++; continue; }
        if (core[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return core.slice(start, i + 1); }
  }
  throw new Error(`could not find the end of ${name}()`);
}
function constLine(name) {
  const m = core.match(new RegExp('^var ' + name + ' = [^;]+;', 'm'));
  assert.ok(m, `fids-core.js must declare ${name}`);
  return m[0];
}
function chain() {
  return [
    constLine('BOARDING_HOLD_MIN'), constLine('GATE_GRACE_MIN'), constLine('DELAY_HOLD_MIN'),
    constLine('GATE_FLIGHT_PICK_MAX'),
    ['_gateDelayHasTime', 'adbTs', '_gateRawStatus', '_gateOutboundAtGate', '_gatePushLeft',
      '_gateRawAirborne', '_gateDepLeft', '_gateOverrideWord', '_pageAirport', '_gateFlightLive',
      '_gateHoldYields', '_gateFlightPicks', '_gateLiveGates', '_gateSubIsFlight'].map(fnSource).join('\n')
  ].join('\n');
}
const E = new Function('Date', chain() + '\nreturn { _gateFlightPicks, _gateLiveGates, _gateSubIsFlight, GATE_FLIGHT_PICK_MAX };')(Date);

function makeSelect() {
  return {
    options: [], _value: '',
    set innerHTML(v) { if (v === '') this.options = []; },
    get innerHTML() { return ''; },
    appendChild(o) { this.options.push(o); },
    set value(v) { this._value = this.options.some((o) => o.value === v) ? v : ''; },
    get value() { return this._value; }
  };
}
function runUpdateSubScreens({ dep, search = '', inRotator = false, now }) {
  const sel = makeSelect();
  const win = { location: { search } };
  win.self = win; win.top = inRotator ? {} : win;
  const doc = { getElementById: (id) => (id === 'subScreenSel' ? sel : null), createElement: () => ({ value: '', textContent: '' }) };
  const CITY = { YUL: 'Montréal', YYZ: 'Toronto', YOW: 'Ottawa' };
  const body = 'let subScreenVal = ""; const subSelForTest = document.getElementById("subScreenSel");\n'
    + [fnSource('_fidsSafeSub'), fnSource('_fidsPinnedSub'), fnSource('_gateWalkActive'), chain(),
      'function _cityForIata(c) { return CITY[c] || c; }', fnSource('updateSubScreens'), 'updateSubScreens();',
      'return { chosen: subScreenVal, options: subSelForTest.options.map(function (o) { return [o.value, o.textContent]; }) };'].join('\n');
  const fn = new Function('document', 'URLSearchParams', 'Date', 'screenType', 'data', 'window', 'CITY', body);
  const realNow = Date.now;
  Date.now = () => now;
  try { return fn(doc, URLSearchParams, Date, 'gate', { dep, arr: [] }, win, CITY); } finally { Date.now = realNow; }
}

const MIN = 60000;
const NOW = Date.UTC(2026, 10, 10, 13, 25, 0);   // 09:25 Atlantic
// The YYG feed of 2026-11-10, plus a departed and a cancelled row.
const YYG = [
  { flight: 'AC2013', gate: '—', status: 'ontime', _locIata: 'YYZ', dest: 'Toronto', _sortTs: NOW + 19 * 60 * MIN },
  { flight: 'AC8215', gate: '—', status: 'ontime', _locIata: 'YUL', dest: 'Montréal', _sortTs: NOW + 75 * MIN },
  { flight: 'PD2366', gate: '—', status: 'ontime', _locIata: 'YOW', dest: 'Ottawa', _sortTs: NOW + 4 * 60 * MIN },
  { flight: 'AC2017', gate: '—', status: 'ontime', _locIata: 'YYZ', dest: 'Toronto', _sortTs: NOW + 7 * 60 * MIN },
  { flight: 'AC8211', gate: '—', status: 'departed', _locIata: 'YUL', dest: 'Montréal', _sortTs: NOW - 60 * MIN },
  { flight: 'WS3300', gate: '—', status: 'cancelled', _locIata: 'YYZ', dest: 'Toronto', _sortTs: NOW + 2 * 60 * MIN }
];

test('no gate in the feed: the pick list is the live departures by flight, in time order', () => {
  assert.deepEqual(E._gateFlightPicks(YYG, NOW), ['AC8215', 'PD2366', 'AC2017', 'AC2013']);
  // _gateLiveGates (the walk, and the gids.html boot pick) hands over the same list
  assert.deepEqual(E._gateLiveGates(YYG, NOW), ['AC8215', 'PD2366', 'AC2017', 'AC2013']);
});

test('one gate anywhere in the feed keeps the screen on gates, exactly as before', () => {
  const mixed = YYG.concat([{ flight: 'BA1', gate: 'B3', status: 'ontime', _sortTs: NOW + 9 * 60 * MIN }]);
  assert.deepEqual(E._gateLiveGates(mixed, NOW), ['B3']);
  // a gate on a departed row still says the feed gives gates
  const gone = YYG.concat([{ flight: 'BA2', gate: 'B4', status: 'departed', _sortTs: NOW - 30 * MIN }]);
  assert.deepEqual(E._gateLiveGates(gone, NOW), []);
});

test('the flight list never floods: capped, and one entry per departure', () => {
  const many = [];
  for (let i = 0; i < 140; i++) many.push({ flight: 'AA' + (100 + i), gate: '—', status: 'ontime', _locIata: 'C' + i, _sortTs: NOW + (i + 1) * MIN });
  const picks = E._gateFlightPicks(many, NOW);
  assert.equal(picks.length, E.GATE_FLIGHT_PICK_MAX);
  assert.deepEqual(picks.slice(0, 2), ['AA100', 'AA101']);
  const cs = [
    { flight: 'AA1', gate: '—', status: 'ontime', _locIata: 'LHR', _sortTs: NOW + 30 * MIN },
    { flight: 'BA9001', gate: '—', status: 'ontime', _locIata: 'LHR', _sortTs: NOW + 30 * MIN },
    { flight: 'AA1', gate: '—', status: 'ontime', _locIata: 'LHR', _sortTs: NOW + 30 * MIN }
  ];
  assert.deepEqual(E._gateFlightPicks(cs, NOW), ['AA1']);
});

test('the picker lists flights with their city, opens on the next departure', () => {
  const r = runUpdateSubScreens({ dep: YYG, now: NOW });
  assert.deepEqual(r.options, [
    ['AC8215', 'AC8215 \u00b7 Montréal'], ['PD2366', 'PD2366 \u00b7 Ottawa'],
    ['AC2017', 'AC2017 \u00b7 Toronto'], ['AC2013', 'AC2013 \u00b7 Toronto']
  ]);
  assert.equal(r.chosen, 'AC8215');
});

test('a walking display (the rotator) lands on a live flight only', () => {
  const seen = new Set();
  for (let i = 0; i < 80; i++) seen.add(runUpdateSubScreens({ dep: YYG, now: NOW, inRotator: true }).chosen);
  for (const s of seen) assert.ok(['AC8215', 'PD2366', 'AC2017', 'AC2013'].includes(s), s);
  assert.ok(seen.size > 1, 'the first pick is spread over the live flights');
});

test('?gate=AC8215 is the address of that flight, labelled as a flight; a gone flight stays pinned', () => {
  const r = runUpdateSubScreens({ dep: YYG, now: NOW, search: '?gate=AC8215' });
  assert.equal(r.chosen, 'AC8215');
  const g = runUpdateSubScreens({ dep: YYG, now: NOW, search: '?gate=AC8211' });
  assert.equal(g.chosen, 'AC8211');
  assert.deepEqual(g.options[g.options.length - 1], ['AC8211', 'AC8211 \u00b7 Montréal']);
});

test('a gated feed builds the same GATE options as before', () => {
  const dep = [
    { flight: 'AC7753', gate: '1', status: 'ontime', _sortTs: NOW + 30 * MIN },
    { flight: 'PD2370', gate: '3', status: 'ontime', _sortTs: NOW + 60 * MIN },
    { flight: 'WS813', gate: '1', status: 'departed', _sortTs: NOW - 90 * MIN }
  ];
  const r = runUpdateSubScreens({ dep, now: NOW });
  assert.deepEqual(r.options, [['1', 'GATE 1'], ['3', 'GATE 3']]);
  assert.equal(r.chosen, '1');
});

test('a flight number is never read as a gate, and a gate never as a flight', () => {
  assert.equal(E._gateSubIsFlight('AC8215', YYG), true);
  assert.equal(E._gateSubIsFlight('WS813', []), true);
  assert.equal(E._gateSubIsFlight('B6123', []), true);
  for (const g of ['4', 'A4', 'C77', '12B', 'D36', '15B', '—', '']) assert.equal(E._gateSubIsFlight(g, []), false, g);
  // a gate the feed names wins over the shape
  assert.equal(E._gateSubIsFlight('AB12', [{ gate: 'AB12', flight: 'X1' }]), false);
});

test('the gate tile never makes a gate number up', () => {
  assert.ok(!/function randomGate\(|[^(]randomGate\(currentFlight/.test(core), 'no made-up gate number');
  assert.match(fnSource('uxgGateHtml'), /currentFlight\.gate !== '\\u2014' \? currentFlight\.gate : '\\u2014'/);
});

test('the empty gate screens and the loader print a dash or the flight, never Gate AC8215', () => {
  const guard = "(subScreenVal && !(typeof _gateSubIsFlight === 'function' && _gateSubIsFlight(subScreenVal, (typeof data !== 'undefined' && data) ? data.dep : null))) ? subScreenVal : '";
  assert.equal(core.split(guard + '—').length - 1, 2, 'both empty gate screens');
  assert.equal(core.split(guard + "') || '—'").length - 1, 1, 'the phone gate');
  assert.match(gidsHtml, /var _gFl = !!gate && /);
  assert.match(gidsHtml, /\(_gFl \? gate : BoardStrings\.loaderLine\('gateWord', true\) \+ ' ' \+ gate\)/);
});

test('a departures row at a gateless airport opens its flight on the gate screen; the app follows it', () => {
  // v24145 — through the one link helper (fidsBoardUrl): the gate screen on the airport address
  assert.match(menuJs, /_noGates && flight\) \{\s*window\.location\.href = _menuBoardUrl\(ap, 'gids', \{ gate: flight \}\)/);
  assert.match(appHtml, /if\(hit<0\)for\(let i=0;i<RENDERED\.length;i\+\+\)\{\s*if\(String\(RENDERED\[i\]\.flight/);
});
