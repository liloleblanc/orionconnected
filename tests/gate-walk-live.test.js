'use strict';

// A walking gate display (the rotator / stream) must only ever sit on a gate
// that still has a flight. The feed window runs hours deep on both sides of
// now, so most of the gates in it are history: measured at Ottawa at 20:03
// local, 23 gates were in the window and 11 had a departure still to come.
// Picking uniformly across all 23 put the stream on a dead gate about half
// the time, showing "Awaiting Next Flight" over a board with eleven live
// departures.
//
// These tests RUN the shipped functions rather than restating them. Both
// `_gateLiveGates` and the whole of `updateSubScreens` are lifted out of
// fids-core.js by brace matching and evaluated against a YOW-shaped feed, so
// a change to the real selection logic changes what these assert.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'fids-current');
const core = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');
const gidsHtml = fs.readFileSync(path.join(root, 'gids.html'), 'utf8');

// ── lifting real code out of the file ───────────────────────────────────────

// Everything from `function NAME(` to its matching closing brace. Strings and
// comments are skipped so a brace inside either cannot end the function early.
function fnSource(name) {
  const start = core.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `fids-core.js must declare ${name}()`);
  let i = core.indexOf('{', start);
  assert.ok(i >= 0, `${name}() must have a body`);
  let depth = 0;
  for (; i < core.length; i++) {
    const c = core[i];
    if (c === '/' && core[i + 1] === '/') { i = core.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && core[i + 1] === '*') { i = core.indexOf('*/', i) + 1; continue; }
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

// A <select> with just enough behaviour for updateSubScreens: assigning
// .innerHTML = '' clears the options, appendChild adds one, and .value only
// takes a value that is actually an option — exactly like the real element,
// which is what makes the stale-value bug reproducible here.
function makeSelect() {
  return {
    options: [],
    _value: '',
    set innerHTML(v) { if (v === '') this.options = []; },
    get innerHTML() { return ''; },
    appendChild(o) { this.options.push(o); },
    set value(v) { this._value = this.options.some((o) => o.value === v) ? v : ''; },
    get value() { return this._value; }
  };
}

// Run the real updateSubScreens() over a feed. Returns what the display ends
// up showing, plus the option list it built.
function runUpdateSubScreens({ dep, search = '', inRotator = true, openOn = '', now }) {
  const sel = makeSelect();
  if (openOn) { sel.options.push({ value: openOn, textContent: '' }); sel.value = openOn; }

  const sandbox = {
    document: {
      getElementById: (id) => (id === 'subScreenSel' ? sel : null),
      createElement: () => ({ value: '', textContent: '' })
    },
    URLSearchParams,
    Date,
    screenType: 'gate',
    data: { dep, arr: [] },
    subScreenVal: openOn,
    window: { location: { search } }
  };
  // A top-level page has self === top; inside an iframe they differ. That
  // identity is the whole of _gateWalkActive()'s rotator test, so the stub
  // has to model it exactly rather than with two unrelated objects.
  sandbox.window.self = sandbox.window;
  sandbox.window.top = inRotator ? { aDifferentWindow: true } : sandbox.window;

  const src = [
    fnSource('_fidsSafeSub'),
    fnSource('_fidsPinnedSub'),
    fnSource('_gateWalkActive'),
    fnSource('_gateLiveGates'),
    fnSource('updateSubScreens'),
    'updateSubScreens();',
    'return { chosen: subScreenVal, selValue: subSelForTest.value, options: subSelForTest.options.map(function (o) { return o.value; }) };'
  ].join('\n');

  // `subScreenVal` is a module-level `let` in the real file; declare it the
  // same way here so assignments inside updateSubScreens land on it.
  const body = 'let subScreenVal = __sub0; const subSelForTest = document.getElementById("subScreenSel");\n' + src;
  const fn = new Function('document', 'URLSearchParams', 'Date', 'screenType', 'data', 'window', '__sub0', 'nowMsForTest', body);
  const realNow = Date.now;
  if (now) Date.now = () => now;
  try {
    return fn(sandbox.document, URLSearchParams, Date, sandbox.screenType, sandbox.data, sandbox.window, openOn, now);
  } finally {
    Date.now = realNow;
  }
}

function liveGates(dep, now) {
  const fn = new Function('Date', fnSource('_gateLiveGates') + '\nreturn _gateLiveGates;');
  return fn(Date)(dep, now);
}

// ── a YOW-shaped window ─────────────────────────────────────────────────────
// Gates 11/12/15/28 are finished for the day, 14/20/26 still have a flight.
const NOW = Date.UTC(2026, 8, 12, 0, 3, 0);   // 20:03 EDT
const MIN = 60000;
const YOW = [
  { gate: '11', status: 'departed',  _sortTs: NOW - 300 * MIN },
  { gate: '12', status: 'departed',  _sortTs: NOW - 240 * MIN },
  { gate: '15', status: 'departed',  _sortTs: NOW - 173 * MIN },   // AF327, gone at 17:10
  { gate: '15', status: 'departed',  _sortTs: NOW - 363 * MIN },   // AC1933, gone at 14:00
  { gate: '28', status: 'cancelled', _sortTs: NOW + 90 * MIN },
  { gate: '20', status: 'boarding',  _sortTs: NOW + 7 * MIN },
  { gate: '14', status: 'ontime',    _sortTs: NOW + 37 * MIN },
  { gate: '26', status: 'ontime',    _sortTs: NOW + 72 * MIN }
];

test('the live-gate rule keeps gates with a flight to come and drops the rest', () => {
  assert.deepEqual(liveGates(YOW, NOW), ['14', '20', '26']);
});

test('a flight a few minutes late still holds its gate; one long gone does not', () => {
  const late = [{ gate: '7', status: 'ontime', _sortTs: NOW - 9 * MIN }];
  const gone = [{ gate: '7', status: 'ontime', _sortTs: NOW - 11 * MIN }];
  assert.deepEqual(liveGates(late, NOW), ['7']);
  assert.deepEqual(liveGates(gone, NOW), []);
  // A revised time supersedes the scheduled one — a flight pushed to later is
  // still upcoming even though its original slot has passed.
  const pushed = [{ gate: '7', status: 'delayed', _sortTs: NOW - 90 * MIN, _revTs: NOW + 30 * MIN }];
  assert.deepEqual(liveGates(pushed, NOW), ['7']);
});

test('a gate with no gate number or an em-dash placeholder is never offered', () => {
  assert.deepEqual(liveGates([
    { gate: '', status: 'ontime', _sortTs: NOW + MIN },
    { gate: null, status: 'ontime', _sortTs: NOW + MIN },
    { gate: '—', status: 'ontime', _sortTs: NOW + MIN }
  ], NOW), []);
});

test('the rotator opens on a gate that has a flight, never a departed one', () => {
  // 200 fresh displays. Before the fix the pick ran over all six gates in the
  // window, so roughly half of these would have opened on 11/12/15/28.
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const r = runUpdateSubScreens({ dep: YOW, now: NOW });
    seen.add(r.chosen);
    assert.ok(['14', '20', '26'].includes(r.chosen), `opened on dead gate ${r.chosen}`);
    // The dropdown must agree with what is rendered, or the next refresh
    // restores the disagreement.
    assert.equal(r.selValue, r.chosen);
  }
  // Still random across the live gates — the point of the walk.
  assert.equal(seen.size, 3, `expected all three live gates over 200 opens, saw ${[...seen]}`);
});

test('the full window is still offered in the dropdown — only the PICK narrows', () => {
  // An operator pulling the menu down must still be able to reach any gate the
  // feed knows about; this fix is about where an unattended screen lands.
  const r = runUpdateSubScreens({ dep: YOW, now: NOW });
  assert.deepEqual(r.options, ['11', '12', '14', '15', '20', '26', '28']);
});

test('a refresh moves a walking display off a gate that has gone dead', () => {
  // The screen is on 15; its last flight left at 17:10. 15 is still in the
  // window, so the old code kept restoring it and the screen stuck there.
  const r = runUpdateSubScreens({ dep: YOW, openOn: '15', now: NOW });
  assert.ok(['14', '20', '26'].includes(r.chosen), `stayed on dead gate ${r.chosen}`);
  assert.equal(r.selValue, r.chosen);
});

test('a refresh leaves a walking display alone while its gate is still live', () => {
  // The other half of the rule: only a DEAD gate is taken away. A screen mid-
  // dwell on a live gate must not be yanked off it by a data refresh.
  for (let i = 0; i < 50; i++) {
    assert.equal(runUpdateSubScreens({ dep: YOW, openOn: '20', now: NOW }).chosen, '20');
  }
});

test('a pinned display keeps its own gate even when that gate is dead', () => {
  // ?gate=15 is an operator hanging a screen at gate 15. It shows 15's honest
  // empty state and never borrows somebody else's flight.
  const r = runUpdateSubScreens({ dep: YOW, search: '?gate=15', inRotator: false, now: NOW });
  assert.equal(r.chosen, '15');
  // Even a gate absent from the feed entirely is carried rather than swapped.
  const r2 = runUpdateSubScreens({ dep: YOW, search: '?gate=41', inRotator: false, now: NOW });
  assert.equal(r2.chosen, '41');
});

test('a standalone display is unchanged: first gate in the list, no shuffle', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(runUpdateSubScreens({ dep: YOW, inRotator: false, now: NOW }).chosen, '11');
  }
});

test('a quiet airport still shows a gate rather than nothing', () => {
  // Every flight of the day is done. There is no better gate to choose, so the
  // old behaviour stands and the screen carries its empty state honestly.
  const doneForTheDay = YOW.filter((f) => f.status === 'departed' || f.status === 'cancelled');
  const r = runUpdateSubScreens({ dep: doneForTheDay, now: NOW });
  assert.ok(['11', '12', '15', '28'].includes(r.chosen), `chose ${r.chosen}`);
  assert.equal(r.selValue, r.chosen);
});

// ── the cycle's own hop ─────────────────────────────────────────────────────

test('the gate cycle shares the one live-gate rule instead of its own copy', () => {
  const cycle = core.slice(core.indexOf('function pickGate()'), core.indexOf('// TWO drive modes:'));
  assert.match(cycle, /var gates = _gateLiveGates\(data\.dep\)/);
  // The inline filter it replaced must be gone, or the two can drift apart.
  assert.doesNotMatch(cycle, /f\.status === 'cancelled' \|\| f\.status === 'departed'/);
});

test('a cycle hop writes the dropdown too, so the next refresh cannot undo it', () => {
  const cycle = core.slice(core.indexOf('function pickGate()'), core.indexOf('// TWO drive modes:'));
  const assign = cycle.slice(cycle.indexOf('subScreenVal = pick;'));
  assert.match(assign, /getElementById\('subScreenSel'\)/);
  assert.match(assign, /_ss\.value = pick/);
  // and it must happen before the re-render, not after
  assert.ok(assign.indexOf('_ss.value = pick') < assign.indexOf("typeof render === 'function'"),
    'the select must be settled before render()');
});

// ── gids.html's own boot pick ───────────────────────────────────────────────
// The page the rotator actually loads chooses the opening gate itself, 300 ms
// after the feed lands, and that choice overrides everything fids-core.js
// settled. It is the LAST writer, so it is the one that decides what the
// stream shows — fixing only the two picks in fids-core.js changed nothing on
// a real boot, which is why this path is tested separately.

// Lift the boot pick out of gids.html and run it over a stubbed <select>.
function runGidsBootPick({ options, dep, last = null, willCycle = true, now }) {
  // Cut at brace balance, not at the next landmark: the `if` sits inside an
  // `else`, so slicing to `sel.selectedIndex` would drag in that block's
  // closing brace and the lifted source would not parse.
  const from = gidsHtml.indexOf('if (_willCycle && sel.options.length > 1) {');
  assert.ok(from >= 0, 'could not find the boot pick in gids.html');
  let depth = 0, end = -1;
  for (let i = gidsHtml.indexOf('{', from); i < gidsHtml.length; i++) {
    if (gidsHtml[i] === '{') depth++;
    else if (gidsHtml[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > from, 'could not find the end of the boot pick');
  const block = gidsHtml.slice(from, end);
  assert.ok(block.includes('sessionStorage'), 'could not lift the boot pick out of gids.html');

  const store = {};
  if (last != null) store['ocLastGate:YOW'] = last;
  const sel = { options: options.map((v) => ({ value: v })) };
  const sandbox = {
    sel,
    ap: 'YOW',
    _willCycle: willCycle,
    data: { dep },
    _gateLiveGates: new Function('Date', fnSource('_gateLiveGates') + '\nreturn _gateLiveGates;')(Date),
    window: { sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } } },
    Math,
    String,
    Date
  };
  const fn = new Function(...Object.keys(sandbox),
    'var pickedIndex = 0;\n' + block + '\nreturn { gate: sel.options[pickedIndex].value, remembered: window.sessionStorage.getItem("ocLastGate:YOW") };');
  const realNow = Date.now;
  if (now) Date.now = () => now;
  try { return fn(...Object.values(sandbox)); } finally { Date.now = realNow; }
}

// The dropdown gids.html sees: the whole window, live gates and finished ones.
const YOW_OPTIONS = ['11', '12', '14', '15', '20', '26', '28'];

test('the gids boot pick opens the tour on a gate that has a flight', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const r = runGidsBootPick({ options: YOW_OPTIONS, dep: YOW, now: NOW });
    assert.ok(['14', '20', '26'].includes(r.gate), `boot opened on dead gate ${r.gate}`);
    seen.add(r.gate);
  }
  assert.equal(seen.size, 3, `expected all three live gates over 300 boots, saw ${[...seen]}`);
});

test('the boot pick still avoids repeating the gate this tab showed last', () => {
  for (let i = 0; i < 100; i++) {
    const r = runGidsBootPick({ options: YOW_OPTIONS, dep: YOW, last: '20', now: NOW });
    assert.notEqual(r.gate, '20');
    assert.ok(['14', '26'].includes(r.gate));
  }
});

test('with one live gate left, the live rule wins over the no-repeat rule', () => {
  // Showing the only gate with a flight twice running beats showing a dead one.
  const oneLive = YOW.filter((f) => f.gate !== '14' && f.gate !== '26');
  const r = runGidsBootPick({ options: YOW_OPTIONS, dep: oneLive, last: '20', now: NOW });
  assert.equal(r.gate, '20');
});

test('a quiet airport still opens on a gate rather than on nothing', () => {
  const doneForTheDay = YOW.filter((f) => f.status === 'departed' || f.status === 'cancelled');
  const r = runGidsBootPick({ options: YOW_OPTIONS, dep: doneForTheDay, now: NOW });
  assert.ok(YOW_OPTIONS.includes(r.gate));
});

test('the boot pick remembers what it chose, so the next visit differs', () => {
  const r = runGidsBootPick({ options: YOW_OPTIONS, dep: YOW, now: NOW });
  assert.equal(r.remembered, r.gate);
});

test('a gids opened by hand keeps its stable first gate — no walk, no shuffle', () => {
  // _willCycle is false outside the rotator and without ?gatecycle=, so the
  // block must not run at all and pickedIndex stays 0.
  const r = runGidsBootPick({ options: YOW_OPTIONS, dep: YOW, willCycle: false, now: NOW });
  assert.equal(r.gate, '11');
});

test('a feed that moved on under the dropdown still yields a gate', () => {
  // The option list is built when the data lands; this pick runs 300 ms later
  // and a refresh in between can leave the two disagreeing. If none of the
  // live gates is on offer there is nothing to narrow to, and the screen must
  // still open on something rather than throw on an empty pool.
  const r = runGidsBootPick({ options: ['A1', 'A2', 'A3'], dep: YOW, now: NOW });
  assert.ok(['A1', 'A2', 'A3'].includes(r.gate), `chose ${r.gate}`);
});
