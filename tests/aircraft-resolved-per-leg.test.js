'use strict';

// WHY THIS EXISTS
//
// The gate keeps every aircraft it resolves (from /acinfo, FR24 or the
// enrichment) in window._ACRES, because the feed rebuilds its rows on every
// poll. That store was keyed by the flight number alone. At Moncton gate 1 on
// 2026-10-02, today's WS813 resolved to C-FBWS (Calgary's own tail for that
// leg). When the gate rolled over to TOMORROW's WS813, the render read the
// store first, printed "Boeing 737 MAX 8 | C-FBWS" for tomorrow's flight, and
// never asked /acinfo for tomorrow's leg, which Calgary lists as C-GIZG.
// Nobody had said C-FBWS flies tomorrow. An answer now belongs to one leg:
// the same number, scheduled within six hours of the row (the webhook
// merge's rule; the next day's rotation is 24 h away).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');

function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' exists');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) return CORE.slice(at, i + 1);
  }
  throw new Error('unbalanced ' + name);
}
function store() {
  const window = { _ACRES: {} };
  const api = new Function('window', 'var _ACRES_LEG_MS = 6 * 3600000;\n'
    + fnSource('_acResLeg') + '\n' + fnSource('_acResolvedPut') + '\n' + fnSource('_acResolvedGet')
    + '\nreturn { put: _acResolvedPut, get: _acResolvedGet };')(window);
  api.window = window;
  return api;
}
const H = 3600000;
const TODAY = Date.UTC(2026, 9, 2, 21, 15);      // WS813 Oct 2, 18:15 ADT
const TOMORROW = TODAY + 24 * H;                 // WS813 Oct 3, 18:15 ADT

test('today\'s aircraft never answers tomorrow\'s row of the same number', () => {
  const s = store();
  s.put({ flight: 'WS813', _sortTs: TODAY }, 'Boeing 737 MAX 8', '7M8', 'C-FBWS');
  assert.equal(s.get({ flight: 'WS813', _sortTs: TODAY }).reg, 'C-FBWS');
  assert.equal(s.get({ flight: 'WS813', _sortTs: TOMORROW }), null,
    'tomorrow\'s leg must ask for itself (/acinfo), not inherit today\'s tail');
});

test('both legs are kept side by side, each with its own tail', () => {
  const s = store();
  s.put({ flight: 'WS813', _sortTs: TODAY }, 'Boeing 737 MAX 8', '7M8', 'C-FBWS');
  s.put({ flight: 'WS813', _sortTs: TOMORROW }, 'Boeing 737 MAX 8', '7M8', 'C-GIZG');
  assert.equal(s.get({ flight: 'WS813', _sortTs: TODAY }).reg, 'C-FBWS');
  assert.equal(s.get({ flight: 'WS813', _sortTs: TOMORROW }).reg, 'C-GIZG');
  assert.equal(s.get({ flight: 'ws 813', _sortTs: TOMORROW + 2 * H }).reg, 'C-GIZG', 'same leg within six hours');
});

test('a later answer for the same leg fills in what the first left blank', () => {
  const s = store();
  s.put({ flight: 'WS812', _sortTs: TOMORROW }, '', '7M8', '');
  s.put({ flight: 'WS812', _sortTs: TOMORROW }, 'Boeing 737 MAX 8', '', 'C-GIZG');
  const v = s.get({ flight: 'WS812', _sortTs: TOMORROW });
  assert.deepEqual([v.nm, v.cd, v.reg], ['Boeing 737 MAX 8', '7M8', 'C-GIZG']);
  assert.equal(s.window._ACRES.WS812.length, 1, 'one entry per leg');
});

test('no scheduled time, no memory: a bare number is never an answer', () => {
  const s = store();
  s.put({ flight: 'WS813' }, 'Boeing 737 MAX 8', '7M8', 'C-FBWS');
  s.put('WS813', 'Boeing 737 MAX 8', '7M8', 'C-FBWS');
  assert.deepEqual(s.window._ACRES, {});
  s.put({ flight: 'WS813', _sortTs: TODAY }, 'Boeing 737 MAX 8', '7M8', 'C-FBWS');
  assert.equal(s.get('WS813'), null);
  assert.equal(s.get({ flight: 'WS813' }), null);
});

test('every reader and writer passes the row, never the number alone', () => {
  assert.doesNotMatch(CORE, /_acResolved(Get|Put)\([A-Za-z_$][\w$]*\.flight\b/,
    'a number-only lookup brings back the carry-over');
  assert.match(CORE, /var _leg = \{ flight: f, _sortTs: ts \};/, '/acinfo answers are stored under the leg they were asked for');
});
