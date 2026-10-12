'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// vNEXT — MONCTON'S BELTS: 2 IS THE NORMAL BELT, 1 TAKES THE OVERLAP.
//
// Moncton's own feed publishes no belt, so the board works Moncton's belt out
// itself. It used a fixed split, domestic on belt 1 and international on belt
// 2, which put nearly every arrival on belt 1. The airport works the other
// way round: most bags come out on belt 2 (the wall-fed belt in the customs
// hall), and belt 1 is opened only when two flights' bags would be on the
// belt at the same time (decision of 2026-10-12).
//
// A flight's bags are on the belt for the board's existing belt trail
// (BIDS_WINDOW_TRAIL_MS, 45 minutes from its effective arrival: actual, else
// revised, else scheduled). When two of those windows overlap, the later
// flight goes to belt 1. An international flight is never sent to belt 1
// (belt 2 is the customs hall's), a cancelled or diverted one holds no belt,
// and a codeshare is one aircraft on one belt. A belt a feed publishes still
// wins (none does at Moncton today); only Moncton's own fill-in changed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

// A function from fids-core.js, by name, brace-matched.
function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must define ${name}`);
  const i = SRC.indexOf('{', at);
  let depth = 0;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}' && --depth === 0) return SRC.slice(at, k + 1);
  }
  assert.fail(`could not brace-match ${name}`);
}
function constLine(name) {
  const m = SRC.match(new RegExp('^var ' + name + ' = [^;\\n]+;$', 'm'));
  assert.ok(m, `fids-core.js must define ${name}`);
  return m[0];
}

const assign = new Function(
  [constLine('BIDS_WINDOW_TRAIL_MS'), constLine('YQM_BELT_MAIN'), constLine('YQM_BELT_OVERFLOW'),
    lift('_yqmBagTs'), lift('_yqmAssignBelts'), 'return _yqmAssignBelts;'].join('\n'))();

// Moncton wall clock (ADT, UTC-3) on 2026-10-12.
const at = (hh, mm) => Date.UTC(2026, 9, 12, hh + 3, mm);
// A Moncton arrival as mapADB leaves it: on belt 2, marked domestic or
// international.
function arr(flight, from, hh, mm, o = {}) {
  return Object.assign({ flight, _locIata: from, origin: from, _sortTs: at(hh, mm), _revTs: null,
    status: 'OnTime', _belt: '2', _yqmBelt: 'dom' }, o);
}
const belts = (rows) => Object.fromEntries(assign(rows).map((f) => [f.flight, f._belt]));

test('the bag window is the belt screens\' own trail, 45 minutes', () => {
  assert.equal(constLine('BIDS_WINDOW_TRAIL_MS'), 'var BIDS_WINDOW_TRAIL_MS = 45 * 60000;');
  assert.equal(constLine('YQM_BELT_MAIN'), "var YQM_BELT_MAIN = '2';");
  assert.equal(constLine('YQM_BELT_OVERFLOW'), "var YQM_BELT_OVERFLOW = '1';");
});

test('a flight on its own is on belt 2, the normal belt', () => {
  assert.deepEqual(belts([arr('AC656', 'YUL', 10, 30)]), { AC656: '2' });
  // flights hours apart: all on belt 2
  assert.deepEqual(belts([arr('PD2373', 'YOW', 16, 33), arr('AC7754', 'YOW', 18, 38), arr('PD2381', 'YHU', 21, 30)]),
    { PD2373: '2', AC7754: '2', PD2381: '2' });
});

test('when two flights\' bags would share the belt, the later one goes to belt 1', () => {
  assert.deepEqual(belts([arr('WS812', 'YYC', 17, 20), arr('AC1984', 'YYZ', 17, 23)]), { WS812: '2', AC1984: '1' });
  // the order of the list does not matter, only the times
  assert.deepEqual(belts([arr('AC1984', 'YYZ', 17, 23), arr('WS812', 'YYC', 17, 20)]), { WS812: '2', AC1984: '1' });
  // 44 minutes apart still overlap; 45 apart do not (one window ends as the next begins)
  assert.deepEqual(belts([arr('A1', 'YUL', 10, 0), arr('A2', 'YYZ', 10, 44)]), { A1: '2', A2: '1' });
  assert.deepEqual(belts([arr('A1', 'YUL', 10, 0), arr('A2', 'YYZ', 10, 45)]), { A1: '2', A2: '2' });
});

test('the time judged is the best the feed knows: revised before scheduled', () => {
  // scheduled 20 minutes apart, but the first is delayed by an hour: no overlap
  const late = arr('AC644', 'YYZ', 11, 15, { _revTs: at(12, 15), status: 'Delayed' });
  assert.deepEqual(belts([late, arr('PB923', 'YDF', 11, 20)]), { PB923: '2', AC644: '2' });
  // and a delay that brings two together puts the later one on belt 1
  const late2 = arr('AC644', 'YYZ', 11, 15, { _revTs: at(12, 5), status: 'Delayed' });
  assert.deepEqual(belts([late2, arr('F8670', 'YYZ', 12, 15)]), { AC644: '2', F8670: '1' });
});

test('a flight already on belt 2 is never moved by one landing after it', () => {
  const first = [arr('AC656', 'YUL', 10, 30)];
  assert.equal(assign(first)[0]._belt, '2');
  const both = assign([arr('AC656', 'YUL', 10, 30), arr('PB923', 'YDF', 11, 0)]);
  assert.equal(both[0]._belt, '2', 'the first flight stays where passengers were told');
  assert.equal(both[1]._belt, '1');
});

test('three at once: the belt that comes free first', () => {
  // 10:30 on belt 2 (free at 11:15), 11:00 on belt 1 (free at 11:45); the
  // 11:12 takes belt 2, which comes free three minutes later, not belt 1 for
  // the whole of its window.
  assert.deepEqual(belts([arr('AC656', 'YUL', 10, 30), arr('PB923', 'YDF', 11, 0), arr('PD2293', 'YTZ', 11, 12)]),
    { AC656: '2', PB923: '1', PD2293: '2' });
  // a tie goes to belt 2
  assert.deepEqual(belts([arr('X1', 'YUL', 10, 0), arr('X2', 'YYZ', 10, 0), arr('X3', 'YOW', 10, 10)]),
    { X1: '2', X2: '1', X3: '2' });
});

test('an international flight is always on belt 2, the customs hall\'s belt', () => {
  // the domestic one landed first, but the charter must clear customs: the
  // domestic flight is the one that moves
  const r = belts([arr('AC1984', 'YYZ', 17, 0), arr('TS123', 'CUN', 17, 30, { _yqmBelt: 'intl' })]);
  assert.deepEqual(r, { AC1984: '1', TS123: '2' });
  // later domestic overlapping an international: belt 1, as for any overlap
  assert.deepEqual(belts([arr('WG500', 'PUJ', 14, 0, { _yqmBelt: 'intl' }), arr('PD2373', 'YOW', 14, 20)]),
    { WG500: '2', PD2373: '1' });
  // two internationals at once are both in the customs hall
  assert.deepEqual(belts([arr('TS1', 'CUN', 14, 0, { _yqmBelt: 'intl' }), arr('WG2', 'PUJ', 14, 10, { _yqmBelt: 'intl' })]),
    { TS1: '2', WG2: '2' });
});

test('a codeshare is one aircraft: one window, one belt', () => {
  const r = belts([
    arr('AC1984', 'YYZ', 17, 23),
    arr('UA8045', 'YYZ', 17, 23),
    arr('WS812', 'YYC', 17, 20)
  ]);
  assert.deepEqual(r, { WS812: '2', AC1984: '1', UA8045: '1' });
  // and on its own a codeshare pair does not split itself across the belts
  assert.deepEqual(belts([arr('AC1984', 'YYZ', 17, 23), arr('UA8045', 'YYZ', 17, 23)]), { AC1984: '2', UA8045: '2' });
});

test('a cancelled or diverted flight brings no bags: it holds no belt', () => {
  assert.deepEqual(belts([arr('AC656', 'YUL', 10, 30, { status: 'Cancelled' }), arr('PB923', 'YDF', 10, 40)]),
    { AC656: '2', PB923: '2' });
  assert.deepEqual(belts([arr('AC656', 'YUL', 10, 30, { status: 'diverted' }), arr('PB923', 'YDF', 10, 40)]),
    { AC656: '2', PB923: '2' });
  // a flight with no usable time is shown on belt 2 and holds nothing
  assert.deepEqual(belts([arr('NT1', 'YUL', 10, 30, { _sortTs: 0 }), arr('PB923', 'YDF', 10, 40)]), { NT1: '2', PB923: '2' });
});

test('a belt a feed published wins, and holds its belt', () => {
  // (no Moncton feed publishes one today; if one ever does, its row carries no
  // _yqmBelt mark and keeps its belt)
  const pub = { flight: 'XX1', _locIata: 'YYZ', _sortTs: at(9, 0), status: 'OnTime', _belt: '2' };
  const r = assign([pub, arr('PB923', 'YDF', 9, 20)]);
  assert.equal(r[0]._belt, '2', 'the published belt is kept');
  assert.equal(r[1]._belt, '1', 'and the board does not put another flight on top of it');
});

test('rows that are not Moncton\'s fill-in are left exactly as they are', () => {
  const rows = [
    { flight: 'AC100', _locIata: 'YYZ', _sortTs: at(9, 0), _belt: '4', status: 'OnTime' },
    { flight: 'AC101', _locIata: 'YYZ', _sortTs: at(9, 5), _belt: null, status: 'OnTime' },
    { flight: 'AC102', _locIata: 'YYZ', _sortTs: at(9, 5), _belt: 'A-1', _beltUnplaced: false, status: 'OnTime' }
  ];
  const copy = JSON.parse(JSON.stringify(rows));
  assert.deepEqual(assign(rows), copy);
  assert.equal(assign(null), null);
  assert.deepEqual(assign([]), []);
});

test("Monday 2026-10-12's Moncton arrivals, as cyqm.ca listed them, on their belts", () => {
  // The day's list from Moncton's feed (the worker's /yqm/flights/arrivals,
  // fetched 2026-10-12 02:49 ADT). AC644 was "Delayed until 11:20 AM".
  const day = [
    arr('AC1986', 'YYZ', 0, 3, { _revTs: at(0, 1), status: 'Arrived' }),
    arr('AC656', 'YUL', 10, 30),
    arr('PB923', 'YDF', 11, 0),
    arr('PD2293', 'YTZ', 11, 12),
    arr('AC644', 'YYZ', 11, 15, { _revTs: at(11, 20), status: 'Delayed' }),
    arr('F8670', 'YYZ', 12, 15),
    arr('PD2373', 'YOW', 16, 33),
    arr('WS812', 'YYC', 17, 20),
    arr('AC1984', 'YYZ', 17, 23),
    arr('PB924', 'YYY', 17, 50),
    arr('AC7754', 'YOW', 18, 38),
    arr('PD2381', 'YHU', 21, 30),
    arr('AC2040', 'YUL', 21, 38)
  ];
  assert.deepEqual(belts(day), {
    AC1986: '2',
    AC656: '2', PB923: '1', PD2293: '2', AC644: '1', F8670: '2',
    PD2373: '2', WS812: '2', AC1984: '1', PB924: '2',
    AC7754: '2', PD2381: '2', AC2040: '1'
  });
  // most bags on belt 2, as the airport says
  const n = Object.values(belts(day)).filter((b) => b === '2').length;
  assert.ok(n > day.length / 2, `belt 2 carried ${n} of ${day.length}`);
});

test('it runs on the board\'s arrivals once the list is one row per flight', () => {
  const collapse = SRC.indexOf("if (arrRaw) data.arr = _fidsCollapseRevisions(mapADB(arrRaw, 'arr'), _revTz);");
  const pass = SRC.indexOf('if (arrRaw) data.arr = _yqmAssignBelts(data.arr);');
  assert.ok(collapse > 0 && pass > collapse && pass - collapse < 600,
    'right after the revision collapse, so AC2040 and AC2040Z are not two flights sharing a belt');
  assert.match(SRC, /_yqmBeltKind = _isIntl \? 'intl' : 'dom';\n\s*_belt = YQM_BELT_MAIN;/,
    'mapADB starts a Moncton row on belt 2 and marks its kind');
  assert.match(SRC, /if \(_yqmBeltKind\) _row\._yqmBelt = _yqmBeltKind;/);
  // the time judged is the belt window's own (_bidsInWindow)
  const eff = lift('_bidsInWindow');
  for (const k of ['_actualArrTime', '_revTs', '_sortTs']) {
    assert.ok(eff.indexOf(k) > 0 && lift('_yqmBagTs').indexOf(k) > 0, k);
  }
  assert.ok(lift('_yqmBagTs').indexOf('_actualArrTime') < lift('_yqmBagTs').indexOf('_revTs'));
  assert.ok(lift('_yqmBagTs').indexOf('_revTs') < lift('_yqmBagTs').indexOf('_sortTs'));
});
