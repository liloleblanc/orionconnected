'use strict';

// v23514 — A BOARD THAT FAILED TO LOAD MUST BE ABLE TO RECOVER.
//
// Nick reported "Ottawa doesn't work" three times. Twice it was answered with a
// story about the feed, and both times the feed was fine — verified again here:
// yow.ca returns 271 rows and the worker serves them with gates and belts. What
// was actually broken was the board's own lifecycle:
//
//   1. autoRefreshTimer was armed inside the try, and the catch only re-armed it
//      when window._initialFetchDone === true — a flag set AFTER the awaits. So
//      a failed COLD start got no timer, no data and no retry, permanently.
//   2. The two direction fetches shared one try, so a failed arrivals call threw
//      away a good departures payload.
//   3. A failed leg still overwrote data.dep/data.arr, wiping a warm board.
//   4. The '—' placeholder was painted as the carousel number: 44vh of white
//      glyph in a dark stroke, which reads as an empty white box.
//   5. The belt walk cycled belts whose next arrival was hours outside the BIDS
//      window, so the board showed "no arrival assigned" on belts that simply
//      had nothing due yet.
//
// These are lifecycle invariants, so they are tested as behaviour where the code
// can be lifted out, and as source invariants where it cannot.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'),
  'utf8',
);

// Lift a top-level `function name(...) {...}` out by brace matching.
function lift(name) {
  let at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must define ${name}`);
  // Keep a leading `async` — lifting without it turns an async function into a
  // sync one and every await inside becomes a syntax error.
  if (SRC.slice(Math.max(0, at - 6), at) === 'async ') at -= 6;
  let i = SRC.indexOf('{', at), depth = 0, end = -1;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  assert.ok(end > 0, `could not brace-match ${name}`);
  return SRC.slice(at, end);
}

test('_fidsFetchLeg turns a throwing leg into null instead of killing its partner', async () => {
  const fn = new Function(
    'console',
    lift('_fidsFetchLeg') + '\nreturn _fidsFetchLeg;',
  )({ warn() {} });

  assert.equal(await fn('departures', async () => ({ departures: [1, 2] })).then((r) => r.departures.length), 2);
  assert.equal(await fn('arrivals', async () => { throw new Error('429'); }), null,
    'a failed leg must resolve null, not reject — the caller decides what a half-answer means');
});

test('the catch re-arms the refresh even when it was the COLD start that failed', () => {
  const at = SRC.indexOf('async function fetchLive()');
  assert.ok(at >= 0);
  const body = SRC.slice(at, at + 14000);
  const rearm = body.indexOf('// On a background refresh failure') >= 0
    ? body.slice(body.indexOf('// On a background refresh failure'))
    : body.slice(body.lastIndexOf('if (!autoRefreshTimer)'));
  assert.doesNotMatch(
    rearm.slice(0, 600),
    /_initialFetchDone === true && !autoRefreshTimer/,
    'gating the re-arm on _initialFetchDone is the dead-frame bug: that flag is only set after the awaits, so the failure that most needs a retry gets none',
  );
  assert.match(body, /if \(!autoRefreshTimer\) \{\s*\n\s*autoRefreshTimer = setInterval\(fetchLive/,
    'the catch must arm the timer whenever there is not one');
});

test('a failed direction leaves its side of the board untouched', () => {
  assert.match(SRC, /if \(depRaw\) data\.dep = _fidsCollapseRevisions\(mapADB\(depRaw, 'dep'\)/,
    'departures must only be assigned when the departures leg actually returned');
  assert.match(SRC, /if \(arrRaw\) data\.arr = _fidsCollapseRevisions\(mapADB\(arrRaw, 'arr'\)/,
    'arrivals must only be assigned when the arrivals leg actually returned');
  assert.match(SRC, /if \(!depRaw && !arrRaw\) throw new Error\('both direction fetches failed'\)/,
    'a total failure must still raise, or the cold-start error panel stops meaning anything');
});

test('the carousel number is never an em-dash', () => {
  const at = SRC.indexOf('var _crslNum = (function(){');
  assert.ok(at >= 0, 'the carousel number expression must still exist');
  const expr = SRC.slice(at, SRC.indexOf('})();', at) + 5);
  const crsl = new Function('subScreenVal', expr + '\nreturn _crslNum;');

  assert.equal(crsl('4'), '4');
  assert.equal(crsl('1-4'), '4', 'terminal-composed belt keys still show the belt');
  assert.equal(crsl('—'), '', 'the no-belt placeholder must render nothing — painted, it is a white box, not a dash');
  assert.equal(crsl(''), '');
  assert.equal(crsl(null), '');
});

test('the belt walk skips belts with nothing due, but never blanks the board', () => {
  const NOW = 1_757_400_000_000;
  const mk = (belt, minsFromNow) => ({ _belt: belt, _sortTs: NOW + minsFromNow * 60000 });
  const build = (arr) => new Function('data', 'document', '_bidsInWindow', 'Date',
    lift('bagBelts') + '\nreturn bagBelts();',
  )({ arr }, { getElementById: () => ({ value: 'YOW' }) },
    // the real predicate: 45 min behind, 60 min ahead
    (f, nowTs) => f._sortTs >= nowTs - 45 * 60000 && f._sortTs <= nowTs + 60 * 60000,
    { now: () => NOW });

  // Ottawa at 21:43: belts 1/3/5 have bags due, belt 4's next is hours out.
  assert.deepEqual(
    build([mk('1', 10), mk('3', -20), mk('5', 30), mk('4', 400)]).sort(),
    ['1', '3', '5'],
    'a belt whose next arrival is hours away must not take a turn in the 20s walk',
  );

  // 3am: nothing due anywhere. Showing no carousel at all is worse than an
  // honest empty one, so fall back to the full set.
  assert.deepEqual(
    build([mk('1', 400), mk('2', 500)]).sort(), ['1', '2'],
    'when nothing is due the board must still show a belt rather than nothing',
  );

  assert.deepEqual(build([]), [], 'no arrivals at all is still no belts');
});
