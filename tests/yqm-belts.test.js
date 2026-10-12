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
// (BIDS_WINDOW_TRAIL_MS, 45 minutes from its effective arrival: touchdown,
// else revised, else scheduled). When two of those windows overlap, the later
// flight goes to belt 1. An international flight is never sent to belt 1
// (belt 2 is the customs hall's), a cancelled or diverted one holds no belt,
// and a codeshare is one aircraft on one belt. A belt a feed publishes still
// wins (none does at Moncton today); only Moncton's own fill-in changed.
//
// A belt never changes under bags already on it. The pass is re-run on every
// poll, cyqm.ca drops an arrival about an hour after it lands, and a belt
// depends on every earlier flight, so a review replay found whole clusters
// changing belt mid-delivery once their first flight dropped. The pass now
// runs over the worker's remembered arrivals too, and freezes a flight's belt
// once its window has begun (kept in the browser's storage across a reload).
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

const PASS_SRC = [constLine('BIDS_WINDOW_TRAIL_MS'), constLine('YQM_BELT_MAIN'), constLine('YQM_BELT_OVERFLOW'),
  constLine('YQM_BELT_MEMO_HRS'), lift('adbTs'), lift('fidsLocalDateKey'), lift('_b5LandedTs'),
  lift('_yqmBagTs'), lift('_yqmLanded'), lift('_yqmFlightDay'), lift('_yqmAssignBelts')].join('\n');
const assign = new Function(PASS_SRC + '\nreturn _yqmAssignBelts;')();

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

test('the time judged is the best the feed knows: touchdown, then revised, then scheduled', () => {
  // scheduled 20 minutes apart, but the first is delayed by an hour: no overlap
  const late = arr('AC644', 'YYZ', 11, 15, { _revTs: at(12, 15), status: 'Delayed' });
  assert.deepEqual(belts([late, arr('PB923', 'YDF', 11, 20)]), { PB923: '2', AC644: '2' });
  // and a delay that brings two together puts the later one on belt 1
  const late2 = arr('AC644', 'YYZ', 11, 15, { _revTs: at(12, 5), status: 'Delayed' });
  assert.deepEqual(belts([late2, arr('F8670', 'YYZ', 12, 15)]), { AC644: '2', F8670: '1' });
  // A touchdown arrives as mapADB keeps it: the feed's runwayTime STRING, not
  // a number. It was never read (a typeof-number test), so the pass timed
  // from the revised time. Revised 11:20, down at 12:05: it is the 12:05 that
  // counts, which clears PB923 (11:20) and meets F8670 (12:15).
  const bagTs = new Function(PASS_SRC + '\nreturn _yqmBagTs;')();
  const down = arr('AC644', 'YYZ', 11, 15, { _revTs: at(11, 20), _actualArrTime: '2026-10-12 12:05-03:00', status: 'arrived' });
  assert.equal(bagTs(down), at(12, 5));
  assert.equal(bagTs(arr('X', 'YUL', 11, 15, { _actualArrTime: at(11, 1) })), at(11, 1), 'a number is still read');
  assert.equal(bagTs(arr('X', 'YUL', 11, 15, { _actualArrTime: 'garbage' })), at(11, 15), 'an unreadable one is not');
  assert.deepEqual(belts([arr('PB923', 'YDF', 11, 20), down, arr('F8670', 'YYZ', 12, 15)]),
    { PB923: '2', AC644: '2', F8670: '1' });
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
  const pass = SRC.indexOf('if (arrRaw) data.arr = _yqmBeltPass(data.arr);');
  assert.ok(collapse > 0 && pass > collapse && pass - collapse < 800,
    'right after the revision collapse, so AC2040 and AC2040Z are not two flights sharing a belt');
  // with the remembered arrivals, the clock and the frozen belts
  assert.match(lift('_yqmBeltPass'),
    /_yqmAssignBelts\(rows, \{ kept: _yqmKeptArrivals\(tz\), now: Date\.now\(\), memo: memo, tz: tz \}\)/);
  // the remembered rows are mapped exactly as the gate maps map them
  assert.match(lift('_yqmKeptArrivals'), /_fidsCollapseRevisions\(mapADB\(\{ arrivals: raw \}, 'arr', true\), tz\)/);
  assert.match(lift('_gateFeedKept'), /_fidsCollapseRevisions\(mapADB\(kind === 'dep' \? \{ departures: raw \} : \{ arrivals: raw \}, kind, true\), tz\)/);
  assert.match(SRC, /_yqmBeltKind = _isIntl \? 'intl' : 'dom';\n\s*_belt = YQM_BELT_MAIN;/,
    'mapADB starts a Moncton row on belt 2 and marks its kind');
  assert.match(SRC, /if \(_yqmBeltKind\) _row\._yqmBelt = _yqmBeltKind;/);
  // the time judged is the belt window's own (_bidsInWindow)
  const eff = lift('_bidsInWindow');
  for (const k of ['_actualArrTime', '_revTs', '_sortTs']) assert.ok(eff.indexOf(k) > 0, k);
  for (const k of ['_revTs', '_sortTs']) assert.ok(lift('_yqmBagTs').indexOf(k) > 0, k);
  assert.match(lift('_b5LandedTs'), /adbTs\(String\(a\)\)/, 'the touchdown string is parsed');
  assert.ok(lift('_yqmBagTs').indexOf('_b5LandedTs') < lift('_yqmBagTs').indexOf('_revTs'));
  assert.ok(lift('_yqmBagTs').indexOf('_revTs') < lift('_yqmBagTs').indexOf('_sortTs'));
});

// ── A belt never changes under bags already on it ──────────────────────────
//
// The review replay that found it: with Monday's schedule, at 11:25 AC656=2,
// PB923=1, PD2293=2, AC644=1. cyqm.ca drops AC656 about an hour after it
// lands; recomputed from what was left, PB923=2, PD2293=1, AC644=2: all three
// inside their 45-minute windows, all three moved.
const cluster = () => [
  arr('AC656', 'YUL', 10, 30, { status: 'arrived' }),
  arr('PB923', 'YDF', 11, 0, { status: 'arrived' }),
  arr('PD2293', 'YTZ', 11, 12, { status: 'arrived' }),
  arr('AC644', 'YYZ', 11, 15, { _revTs: at(11, 20), status: 'arrived' })
];
const without = (rows, flight) => rows.filter((f) => f.flight !== flight);
const pick = (rows, flight) => rows.filter((f) => f.flight === flight);
const beltsAt = (rows, o) => Object.fromEntries(assign(rows, o).map((f) => [f.flight, f._belt]));
const TZ = 'America/Moncton';

test('the replay: recomputed from the list alone, dropping the first flight moved three belts under bags', () => {
  // this is the fault, kept here so the tests below are seen to matter
  assert.deepEqual(belts(cluster()), { AC656: '2', PB923: '1', PD2293: '2', AC644: '1' });
  assert.deepEqual(belts(without(cluster(), 'AC656')), { PB923: '2', PD2293: '1', AC644: '2' });
});

test('a flight the list dropped is still in the pass, from what the worker remembered', () => {
  // a screen switched on at 11:31, with no memory of its own: AC656 is gone
  // from cyqm.ca's list but the worker's remembered row ("Arrived at") is in
  // the pass, so the rest are where every other screen has them
  const kept = pick(cluster(), 'AC656');
  assert.deepEqual(beltsAt(without(cluster(), 'AC656'), { kept, tz: TZ }), { PB923: '1', PD2293: '2', AC644: '1' });
  // the remembered row is the pass's own copy: no belt is written on it
  const k = arr('AC656', 'YUL', 10, 30, { status: 'arrived', _belt: 'untouched' });
  assign(without(cluster(), 'AC656'), { kept: [k], tz: TZ });
  assert.equal(k._belt, 'untouched');
  // a listed row wins over a remembered one of the same flight and day
  const listedLate = cluster();
  listedLate[0]._revTs = at(11, 50);         // the list says 11:50; the memory says 10:30
  assert.equal(beltsAt(listedLate, { kept, tz: TZ }).AC656, beltsAt(listedLate, {}).AC656);
  // a remembered row that is not Moncton's fill-in is not a flight of the pass
  assert.deepEqual(beltsAt(without(cluster(), 'AC656'), { kept: [{ flight: 'ZZ1', _sortTs: at(10, 30) }], tz: TZ }),
    { PB923: '2', PD2293: '1', AC644: '2' });
});

test('dropping the first flight of the 10:30/11:00/11:12/11:15 cluster leaves the belts with bags on them where they are', () => {
  const memo = {};
  const at1125 = beltsAt(cluster(), { now: at(11, 25), memo, tz: TZ });
  assert.deepEqual(at1125, { AC656: '2', PB923: '1', PD2293: '2', AC644: '1' });
  // all four are down: all four frozen
  assert.deepEqual(Object.keys(memo).sort(), ['AC644|2026-10-12', 'AC656|2026-10-12', 'PB923|2026-10-12', 'PD2293|2026-10-12']);
  // 11:31: AC656 has left the list, and this time even the worker's memory is
  // missing (a failed KV read): the frozen belts hold anyway
  assert.deepEqual(beltsAt(without(cluster(), 'AC656'), { now: at(11, 31), memo, tz: TZ }),
    { PB923: '1', PD2293: '2', AC644: '1' });
  // and as the rest drop one by one, nothing moves either
  assert.deepEqual(beltsAt(without(without(cluster(), 'AC656'), 'PB923'), { now: at(11, 50), memo, tz: TZ }),
    { PD2293: '2', AC644: '1' });
});

test('two landed flights three minutes apart keep their belts when a revision swaps their order', () => {
  const pair = (ws) => [
    arr('WS812', 'YYC', 17, 20, { _revTs: at(17, ws), status: 'arrived' }),
    arr('AC1984', 'YYZ', 17, 23, { status: 'arrived' })
  ];
  // the fault: recomputed afresh, they trade belts whenever WS812's time crosses 17:23
  assert.deepEqual(belts(pair(20)), { WS812: '2', AC1984: '1' });
  assert.deepEqual(belts(pair(25)), { WS812: '1', AC1984: '2' });
  // frozen once down, they hold
  const memo = {};
  assert.deepEqual(beltsAt(pair(20), { now: at(17, 24), memo, tz: TZ }), { WS812: '2', AC1984: '1' });
  assert.deepEqual(beltsAt(pair(25), { now: at(17, 26), memo, tz: TZ }), { WS812: '2', AC1984: '1' });
  assert.deepEqual(beltsAt(pair(22), { now: at(17, 27), memo, tz: TZ }), { WS812: '2', AC1984: '1' });
});

test("Sunday's real landings (10:54, 11:12, 11:27) are stable across the drop", () => {
  // From the worker's remembered rows: AC656 down 10:54, PD2293 11:12, AC644
  // 11:27. Recomputed from the list alone, AC644 was on belt 2 at 11:30 and on
  // belt 1 once AC656 dropped, at about 11:55, with its bags on the belt.
  const day = () => [
    arr('AC656', 'YUL', 10, 30, { _revTs: at(10, 54), status: 'arrived' }),
    arr('PD2293', 'YTZ', 11, 12, { status: 'arrived' }),
    arr('AC644', 'YYZ', 11, 15, { _revTs: at(11, 27), status: 'arrived' })
  ];
  assert.deepEqual(belts(without(day(), 'AC656')), { PD2293: '2', AC644: '1' }, 'the fault');
  const memo = {};
  assert.deepEqual(beltsAt(day(), { now: at(11, 30), memo, tz: TZ }), { AC656: '2', PD2293: '1', AC644: '2' });
  assert.deepEqual(beltsAt(without(day(), 'AC656'), { now: at(11, 55), memo, tz: TZ }), { PD2293: '1', AC644: '2' });
  // and a screen switched on at 11:55, with the worker's memory and none of its own
  assert.deepEqual(beltsAt(without(day(), 'AC656'), { now: at(11, 55), memo: {}, kept: pick(day(), 'AC656'), tz: TZ }),
    { PD2293: '1', AC644: '2' });
});

test('a flight still to land can change belt; one whose time came and went without landing is placed again', () => {
  const memo = {};
  // 17:21: WS812's 17:20 has come, so its window may have begun: frozen on 2
  const first = [arr('WS812', 'YYC', 17, 20), arr('AC1984', 'YYZ', 17, 23), arr('AC7754', 'YOW', 18, 38)];
  assert.deepEqual(beltsAt(first, { now: at(17, 21), memo, tz: TZ }), { WS812: '2', AC1984: '1', AC7754: '2' });
  assert.ok(memo['WS812|2026-10-12'] && !memo['AC1984|2026-10-12'], 'only a flight whose window began is frozen');
  // 17:22: it has not landed and is now due at 19:14 (Sunday it came in at
  // 19:14). Its window had not begun after all: it is thawed and placed
  // again, and does not hold belt 2 over AC7754, which lands first.
  const later = [arr('WS812', 'YYC', 17, 20, { _revTs: at(19, 14), status: 'Delayed' }), arr('AC1984', 'YYZ', 17, 23), arr('AC7754', 'YOW', 18, 38)];
  assert.deepEqual(beltsAt(later, { now: at(17, 22), memo, tz: TZ }), { AC1984: '2', AC7754: '2', WS812: '1' });
  assert.equal(memo['WS812|2026-10-12'], undefined, 'thawed');
});

test('a frozen flight that has left both lists still holds its belt for its last window', () => {
  const memo = {};
  beltsAt([arr('PD2373', 'YOW', 16, 33, { status: 'arrived' })], { now: at(16, 40), memo, tz: TZ });
  assert.deepEqual(memo['PD2373|2026-10-12'], { b: '2', t: at(16, 33) });
  // gone from the list and from the memory: its bags are still on belt 2 until 17:18
  assert.deepEqual(beltsAt([arr('WS812', 'YYC', 17, 0)], { now: at(16, 45), memo, tz: TZ }), { WS812: '1' });
  // and the memory forgets after the worker's 30 hours
  beltsAt([arr('X1', 'YUL', 9, 0)], { now: at(16, 33) + 31 * 3600000, memo, tz: TZ });
  assert.equal(memo['PD2373|2026-10-12'], undefined);
});

test('a cancelled flight never holds a belt, frozen or not', () => {
  const memo = { 'AC656|2026-10-12': { b: '2', t: at(10, 30) } };
  assert.deepEqual(beltsAt([arr('AC656', 'YUL', 10, 30, { status: 'Cancelled' }), arr('PB923', 'YDF', 10, 40)], { now: at(10, 41), memo, tz: TZ }),
    { AC656: '2', PB923: '2' });
});

// The fetch's own call, end to end: the remembered rows from
// window._yqmRemembered, the clock, and the frozen belts in this browser's
// storage, so a reload (a build bump) keeps a belt with bags on it.
function page(env) {
  return new Function('window', 'localStorage', 'Date', 'mapADB', '_fidsCollapseRevisions', 'AP',
    PASS_SRC + '\n' + [lift('_yqmKeptArrivals'), lift('_yqmBeltMemo'), lift('_yqmBeltPass'),
      'var _YQM_KEPT_ARR = { src: null, rows: [] };', constLine('YQM_BELT_MEMO_STORE'),
      'var _yqmBeltMemoCache = null, _yqmBeltMemoSaved = \'\';', 'return _yqmBeltPass;'].join('\n'))(
    env.window, env.localStorage, env.Date, (raw) => raw.arrivals.map((f) => Object.assign({}, f)), (l) => l,
    { YQM: { tz: TZ } });
}
function storage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
const clock = (ts) => Object.assign(function () {}, { now: () => ts });

test('the fetch\'s pass: remembered rows, the clock, and frozen belts that survive a reload', () => {
  assert.match(SRC, /^var YQM_BELT_MEMO_STORE = 'fids_yqm_belts_v1';$/m);
  const ls = storage();
  const win = { _yqmRemembered: { ap: 'YQM', arrivals: [] } };
  const pass1 = page({ window: win, localStorage: ls, Date: clock(at(11, 25)) });
  const rows = cluster();
  pass1(rows);
  assert.deepEqual(rows.map((f) => f._belt), ['2', '1', '2', '1']);
  assert.ok(ls.m.get('fids_yqm_belts_v1'), 'the frozen belts are saved');
  // the board reloads at 11:31; cyqm.ca has dropped AC656 and the worker's
  // memory came back empty: the saved belts hold
  const pass2 = page({ window: win, localStorage: ls, Date: clock(at(11, 31)) });
  const after = without(cluster(), 'AC656');
  pass2(after);
  assert.deepEqual(Object.fromEntries(after.map((f) => [f.flight, f._belt])), { PB923: '1', PD2293: '2', AC644: '1' });
  // a brand-new screen (no storage) with the worker's memory: the same belts
  const fresh = page({ window: { _yqmRemembered: { ap: 'YQM', arrivals: pick(cluster(), 'AC656') } }, localStorage: storage(), Date: clock(at(11, 31)) });
  const after2 = without(cluster(), 'AC656');
  fresh(after2);
  assert.deepEqual(Object.fromEntries(after2.map((f) => [f.flight, f._belt])), { PB923: '1', PD2293: '2', AC644: '1' });
  // no storage at all (a private window): it still works
  const bare = page({ window: {}, localStorage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }, Date: clock(at(11, 25)) });
  const r3 = cluster();
  bare(r3);
  assert.deepEqual(r3.map((f) => f._belt), ['2', '1', '2', '1']);
  // another airport's memory is not Moncton's
  const other = page({ window: { _yqmRemembered: { ap: 'YHZ', arrivals: pick(cluster(), 'AC656') } }, localStorage: storage(), Date: clock(at(11, 31)) });
  const r4 = without(cluster(), 'AC656');
  other(r4);
  assert.deepEqual(r4.map((f) => f._belt), ['2', '1', '2']);
});

test('a single-belt screen and the stream\'s belt walk start on belt 2, the normal belt', () => {
  const upd = lift('updateSubScreens');
  assert.match(upd, /locations = \[YQM_BELT_MAIN, YQM_BELT_OVERFLOW\]\.concat\(/);
  assert.match(lift('bagBelts'), /if \(ap && ap\.value === 'YQM'\) return \[YQM_BELT_MAIN, YQM_BELT_OVERFLOW\];/);
});
