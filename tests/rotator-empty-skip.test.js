'use strict';

// v23965 — SKIPPING AN EMPTY AIRPORT KEEPS TRACK OF THE ONE ON AIR.
//
// The tour skips an airport whose first board has loaded with no flights on
// it. The skip used to walk apIdx itself, and its first step landed back on
// the airport it was skipping: it destroyed that airport, recreated it, and
// returned false to wait for the copy with apIdx already moved. On the next
// beats the rotator took the skipped airport for the one on air, `cur` named a
// frame that did not exist, cur.classList threw inside the heartbeat, and the
// airport really on air was never retired. Its frames stayed oc-active under
// every later board and kept running for the rest of the run.
//
// These tests run rotate.html's own frame management, showNow() and advance(),
// sliced out of the file, against stand-in iframes whose readiness and flights
// each test sets.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.resolve(__dirname, '..', 'fids-current', 'rotate.html'), 'utf8');
function slice(from, to) {
  const a = HTML.indexOf(from);
  assert.ok(a >= 0, 'rotate.html must still contain: ' + from);
  const b = HTML.indexOf(to, a);
  assert.ok(b > a, 'rotate.html must still contain, after it: ' + to);
  return HTML.slice(a, b);
}
const FRAMES = slice('var frames = {};', '// A board is ready to be SHOWN');
const SWITCH = slice('function showNow() {', '// A gate ad just finished.');

// A tour over `aps` with board sequence `seq`, on air at aps[0]'s LAST board,
// with the next airport's first board preloaded — the moment advance() makes
// an airport switch.
function tour(aps, seq) {
  const loaded = new Set();     // frames whose document has "loaded"
  const flights = {};           // ap -> has flights
  const created = [];           // every frame ever made, in order
  const timers = [];
  let now = 1000000;
  function frame() {
    const cls = new Set();
    const attrs = {};
    return {
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
      setAttribute: (k, v) => { attrs[k] = v; },
      getAttribute: (k) => attrs[k],
      addEventListener: () => {},
      contentWindow: { postMessage: () => {} },
      parentNode: null,
    };
  }
  const document = {
    createElement: () => { const f = frame(); created.push(f); return f; },
    body: {
      appendChild: (f) => { f.parentNode = { removeChild: (x) => { x.parentNode = null; } }; },
    },
  };
  const apOf = (f) => f.getAttribute('data-oc-ap');
  const env = {
    aps, seq, document,
    isTour: aps.length > 1,
    apDwellMs: 0,
    minMs: 60000, READY_GRACE_MS: 40000, FADE_MS: 800, HOLD_MS: 200,
    childUrl: (page, ap) => page + '?ap=' + ap,
    ocTell: () => {},
    noteTourNext: () => {},
    isReady: (f) => loaded.has(f),
    hasFlights: (f) => !!flights[apOf(f)],
    console: { log: () => {}, warn: () => {} },
    Date: { now: () => now },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    window: { location: { reload: () => { throw new Error('unexpected reload'); } } },
  };
  const names = Object.keys(env);
  const api = new Function(...names, [
    'var reloadPending = false, pendingShow = null;',
    'var apIdx = 0, idx = seq.length - 1, slotStart = Date.now(), airportStart = Date.now();',
    FRAMES,
    SWITCH,
    // On air: aps[0] with every page loaded, its last board showing; the next
    // airport's first board preloaded, as showNow() leaves it.
    'ensureAirport(aps[0]);',
    'frames[aps[0]][seq[idx]].classList.add("oc-active");',
    'ensureFrame(aps[1], seq[0]);',
    'return {',
    '  advance: advance, showNow: showNow,',
    '  state: function () { return { apIdx: apIdx, idx: idx, onAir: aps[apIdx], pending: !!pendingShow }; },',
    '  frames: function () { return frames; }',
    '};',
  ].join('\n'))(...names.map((n) => env[n]));

  const live = () => created.filter((f) => f.parentNode);
  return {
    api,
    load: (ap) => { for (const f of live()) if (apOf(f) === ap) loaded.add(f); },
    setFlights: (ap, has) => { flights[ap] = has; },
    tick: (ms) => { now += ms; },
    runTimers: () => { while (timers.length) timers.shift()(); },
    active: () => live().filter((f) => f.classList.contains('oc-active')).map(apOf),
    createdFor: (ap) => created.filter((f) => apOf(f) === ap).length,
    liveAirports: () => [...new Set(live().map(apOf))].sort(),
  };
}

const SEQ = ['fids.html', 'gids.html', 'bids.html', 'gids.html'];

test('skipping an empty airport retires the one on air and shows the next with flights', () => {
  const t = tour(['ORD', 'DEN', 'SFO', 'YOW'], SEQ);
  t.load('ORD'); t.setFlights('ORD', true);
  t.load('DEN'); t.setFlights('DEN', false);   // DEN's first board loaded empty
  t.setFlights('SFO', true);
  t.tick(61000);

  assert.equal(t.api.advance(), false, 'SFO has just been started; the switch waits for it');
  assert.equal(t.api.state().onAir, 'ORD', 'while it waits, the airport on air is still ORD');
  assert.deepEqual(t.active(), ['ORD']);

  t.load('SFO');
  t.tick(1000);
  assert.doesNotThrow(() => t.api.advance(), 'the heartbeat must never throw');
  assert.ok(t.api.state().pending, 'the switch to SFO is under way');
  t.tick(1000);
  t.api.showNow();
  t.runTimers();                                  // destroyAirport(retired) after the fade

  assert.equal(t.api.state().onAir, 'SFO');
  assert.equal(t.api.state().idx, 0, 'SFO comes up on its first board');
  assert.deepEqual(t.active(), ['SFO'], 'exactly one board on air: ORD must not stay oc-active underneath');
  assert.ok(!t.liveAirports().includes('ORD'), 'ORD\'s frames are removed once it is off screen');
  assert.ok(!t.liveAirports().includes('DEN'), 'the skipped airport is not kept alive');
});

test('a skip that waits resumes from its candidate, without recreating what it skipped', () => {
  const t = tour(['ORD', 'DEN', 'SFO', 'YOW', 'YHZ'], SEQ);
  t.load('ORD'); t.setFlights('ORD', true);
  t.load('DEN'); t.setFlights('DEN', false);
  t.setFlights('SFO', false);
  t.setFlights('YOW', true);
  t.tick(61000);

  assert.equal(t.api.advance(), false);           // DEN skipped, waiting on SFO
  const denMade = t.createdFor('DEN');
  for (let i = 0; i < 5; i++) { t.tick(1000); assert.equal(t.api.advance(), false); }
  assert.equal(t.createdFor('DEN'), denMade, 'DEN must not be recreated on every beat of the wait');

  t.load('SFO'); t.tick(1000);
  assert.equal(t.api.advance(), false, 'SFO loaded empty too; now waiting on YOW');
  assert.equal(t.api.state().onAir, 'ORD');

  t.load('YOW'); t.tick(1000);
  assert.equal(t.api.advance(), true);
  t.tick(1000); t.api.showNow(); t.runTimers();
  assert.equal(t.api.state().onAir, 'YOW', 'Ottawa, the first airport after ORD with flights');
  assert.deepEqual(t.active(), ['YOW']);
});

test('a quiet night everywhere still comes to a board, after one pass round the roster', () => {
  const aps = ['ORD', 'DEN', 'SFO', 'YOW'];
  const t = tour(aps, SEQ);
  t.load('ORD'); t.setFlights('ORD', true);
  for (const ap of aps.slice(1)) t.setFlights(ap, false);
  t.load('DEN');
  t.tick(61000);

  let committed = false;
  for (let beat = 0; beat < 20 && !committed; beat++) {
    for (const ap of aps.slice(1)) t.load(ap);    // whatever has been started finishes loading
    t.tick(1000);
    committed = t.api.advance() === true && t.api.state().pending;
  }
  assert.ok(committed, 'the skip is bounded by the roster; it must not wait forever');
  t.tick(1000); t.api.showNow(); t.runTimers();
  assert.equal(t.api.state().onAir, 'YOW', 'every other airport passed over once, the last one tried is shown');
  assert.deepEqual(t.active(), ['YOW']);
});

test('with flights everywhere the tour simply walks on, airport by airport and board by board', () => {
  const t = tour(['ORD', 'DEN', 'SFO'], SEQ);
  for (const ap of ['ORD', 'DEN', 'SFO']) t.setFlights(ap, true);
  t.load('ORD'); t.load('DEN');
  t.tick(61000);
  assert.equal(t.api.advance(), true);
  t.tick(1000); t.api.showNow(); t.runTimers();
  assert.deepEqual([t.api.state().onAir, t.api.state().idx], ['DEN', 0], 'no skip: straight to DEN');
  t.load('DEN');                                  // the rest of DEN's pages, started behind the first
  t.tick(61000);
  assert.equal(t.api.advance(), true);
  t.tick(1000); t.api.showNow(); t.runTimers();
  assert.deepEqual([t.api.state().onAir, t.api.state().idx], ['DEN', 1], 'a board switch keeps the airport');
  assert.deepEqual(t.active(), ['DEN']);
});
