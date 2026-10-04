'use strict';

// v23516 — WHICH AIRPORTS A STREAM PLAYS.
//
//
// v23432 had widened the tour trigger to `q.get('stream')` — ANY
// stream value — so both broadcast boxes, which pass an ap= AND a stream=, had
// their named airport overwritten with TOUR_DEFAULT.
//
// A fix keyed on the stream NUMBER is not trustworthy either. Per
// stream-server/README.md both live boxes run stream=1 (box 1 Moncton
// ap=YQM, box 2 Orlando ap=MCO); the only stream=2 left in the repo is a
// stale Miami default in setup.sh and tools/repair-second-stream.sh. So the
// rule is about the AIRPORT, never the stream number.
//
// This runs rotate.html's real selection block — sliced out of the file, not
// re-implemented — so it cannot drift from what ships.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'rotate.html'),
  'utf8',
);

const from = HTML.indexOf('var TOUR_DEFAULT = [');
const to = HTML.indexOf('var isTour = aps.length > 1;');
assert.ok(from >= 0 && to > from, 'rotate.html must still contain the airport-selection block');
const BLOCK = HTML.slice(from, to) + 'var isTour = aps.length > 1;';

// A stand-in for the box's Local Storage. The selection block reads two keys
// from it (the dry dock and, since v23965, where the tour should resume); a
// fresh one is an empty profile.
function store(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// `now` pins the clock the resume falls back on when nothing is stored. The
// default, 0, starts every tour at the top of its list, which is what the
// tests below that predate the resume were written against.
function select(query, opts) {
  const o = opts || {};
  const q = new URLSearchParams(query);
  const clock = { now: () => (o.now === undefined ? 0 : o.now) };
  return new Function('q', 'console', 'localStorage', 'Date',
    BLOCK + '\nreturn { aps: aps, isTour: isTour, TOUR_DEFAULT: TOUR_DEFAULT };')(
    q, { warn() {}, log() {} }, o.ls || store(), clock,
  );
}

// The two URLs the Hetzner boxes actually run, verbatim from stream-server/README.md.
const BOX1 = 'ap=YQM&mode=live&stream=1&langs=en,fr&rotate=fids,gids,bids,gids&dwell=60';
const BOX2 = 'ap=MCO&mode=live&stream=1&langs=en,es&rotate=fids,gids,bids,gids&dwell=60';

test('box 1 plays Moncton and nothing else', () => {
  const r = select(BOX1);
  assert.deepEqual(r.aps, ['YQM'], 'the Moncton stream must play Moncton — this is the reported bug');
  assert.equal(r.isTour, false);
});

test('the second stream tours, whatever airport its URL happens to name', () => {
  //
  // Pinning box 2 to its ap= would kill the tour.
  for (const q of ['ap=MIA&mode=live&stream=2', 'ap=MCO&mode=live&stream=2', 'mode=live&stream=2']) {
    const r = select(q);
    assert.ok(r.isTour, `${q} must tour`);
    assert.ok(r.aps.length > 1);
  }
});

test('only stream 1 is pinned; any other stream number tours', () => {
  assert.deepEqual(select('ap=YQM&mode=live&stream=1').aps, ['YQM']);
  for (const s of ['0', '2', '3']) {
    assert.ok(select('ap=YQM&mode=live&stream=' + s).isTour, `stream=${s} is a touring broadcast`);
  }
});

test('tour= overrides the stream number in BOTH directions, with no deploy', () => {
  // The escape hatch for a box whose number is not what the docs claim: this
  // is editable in config.env on the box itself.
  assert.deepEqual(select('ap=YQM&mode=live&stream=2&tour=0').aps, ['YQM'],
    'tour=0 pins a touring stream to its airport');
  assert.ok(select('ap=YQM&mode=live&stream=1&tour=1').isTour,
    'tour=1 tours a pinned stream');
});

test('a bare rotate.html with no airport still tours', () => {
  const r = select('mode=live&rotate=fids');
  assert.ok(r.isTour, 'no ap= means nothing to pin to, so the tour is the right default');
  assert.ok(r.aps.length > 1);
});

test('an airport with no feed is dropped and the tour takes over', () => {
  // v23804 — this used YYZ, which was absent from ROSTER because Toronto
  // blocked the Worker's egress. That block lifted, YYZ joined the roster, and
  // this test failed — correctly, because its PREMISE had expired rather than
  // its subject.
  //
  // Substituting another real airport would only move the expiry date: any code
  // parked for an upstream reason can come back, and this test would rot again
  // the day it did. ZZZ is not an airport and never will be, so it tests the
  // rule — a code absent from ROSTER is dropped and the run tours — without
  // depending on anyone else's bot manager.
  const r = select('ap=ZZZ&mode=live&stream=1&rotate=fids');
  assert.ok(!r.aps.includes('ZZZ'), 'a dead airport must never be streamed');
  assert.ok(r.isTour, 'v23432 protection: pointing a stream at a dead airport must still tour');
  // …and the airport this test used to name is now live, which is the whole
  // reason it changed. If YYZ ever leaves ROSTER again, that is a regression.
  const t = select('ap=YYZ&mode=live&stream=1&rotate=fids');
  assert.ok(t.aps.includes('YYZ'),
    'YYZ returns 974 rows and belongs in ROSTER — dropping it again would hide ' +
    'the busiest airport in the country from every picker and every tour');
});

test('tour=1 still forces the tour, tour=0 still opts out, tour=LIST still works', () => {
  assert.ok(select('ap=YQM&tour=1').isTour, 'tour=1 must override a named airport');
  assert.deepEqual(select('ap=YQM&tour=0').aps, ['YQM']);
  assert.deepEqual(select('tour=YHZ,YOW').aps.sort(), ['YHZ', 'YOW']);
});

// ═══════════════════════════════════════════════════════════════════════════
// v23965 — A RESTART PICKS THE TOUR UP WHERE IT LEFT OFF.
//
// Ottawa was reported working on its own board and missing from the stream.
// Its feed and its boards were fine on the tour; what kept it off the air was
// its place in the list. Every load of rotate.html started the tour at
// TOUR_DEFAULT[0], a full lap is two to three and a half hours, and anything
// that reloads the page inside that time (a box restart, a self-refresh after
// a deploy, a dock change) went back to the top. Ottawa is 21st of 26.
// The reload measured on production was the self-check misreading
// Cloudflare's edits to the page as a deploy (half an hour after a load, and
// every half hour for a browser that never passes Cloudflare's check); that is
// fixed at its source (tests/rotator-selfheal.test.js). The resume below keeps
// any remaining reload from costing the tour its place.
// ═══════════════════════════════════════════════════════════════════════════

const STREAM2 = 'ap=MIA&mode=live&stream=2&langs=en,es&rotate=gids,fids,gids,bids&dwell=60';

// The writer, sliced out of rotate.html like the selection block, so the
// round trip below runs the code that ships.
const noteAt = HTML.indexOf('function noteTourNext()');
assert.ok(noteAt > 0, 'rotate.html must still write down where the tour should resume');
const NOTE = HTML.slice(noteAt, HTML.indexOf('\n      }', noteAt) + 8);
function noteTourNext(aps, apIdx, isTour, ls) {
  new Function('aps', 'apIdx', 'isTour', 'localStorage', NOTE + '\nnoteTourNext();')(aps, apIdx, isTour, ls);
}
const isRotationOf = (a, b) => a.length === b.length && (b.concat(b)).join(',').includes(a.join(','));

test('Ottawa is on the touring stream', () => {
  const r = select(STREAM2);
  assert.ok(r.TOUR_DEFAULT.includes('YOW'), 'YOW must stay in TOUR_DEFAULT');
  assert.ok(r.aps.includes('YOW'), 'and survive the no-feed filter on the stream-2 URL');
});

test('a restart resumes at the airport written down, with the same airports in the same order', () => {
  const r = select(STREAM2, { ls: store({ oc_tour_next: 'YOW' }) });
  assert.equal(r.aps[0], 'YOW', 'the run starts where the last one said to');
  assert.ok(isRotationOf(r.aps, r.TOUR_DEFAULT),
    'only the starting point moves — no airport is added, dropped or reordered');
});

test('the stored airport is ignored when it is not part of this run', () => {
  // Moncton is not on the tour; a value left by some other run must not
  // invent a stop, and must not stop the tour from starting.
  const r = select(STREAM2, { ls: store({ oc_tour_next: 'YQM' }) });
  assert.ok(!r.aps.includes('YQM'));
  assert.ok(isRotationOf(r.aps, r.TOUR_DEFAULT));
});

test('with nothing stored, the start follows the clock rather than always being Chicago', () => {
  const n = select(STREAM2).TOUR_DEFAULT.length;
  const starts = new Set();
  for (let slot = 0; slot < n; slot++) {
    const r = select(STREAM2, { now: slot * 300000 + 1234 });
    assert.ok(isRotationOf(r.aps, r.TOUR_DEFAULT), 'still the whole tour, in order');
    starts.add(r.aps[0]);
  }
  assert.equal(starts.size, n, 'a fresh profile restarted at different times lands on different airports');
});

test('restart after restart walks the whole tour, Ottawa included', () => {
  // The worst case for the old code: a box that restarts during every
  // airport. The note is written as each airport comes up, naming the one
  // AFTER it, so each restart moves on — it can never replay one board.
  const ls = store();
  const seen = [];
  const n = select(STREAM2).TOUR_DEFAULT.length;
  for (let i = 0; i < n; i++) {
    const r = select(STREAM2, { ls, now: 0 });
    seen.push(r.aps[0]);
    noteTourNext(r.aps, 0, r.isTour, ls);   // the first airport comes up, then the box restarts
  }
  assert.equal(new Set(seen).size, n, 'every restart starts one airport further on');
  assert.ok(seen.includes('YOW'), 'and Ottawa reaches the air within one lap of restarts');
  assert.deepEqual(seen, select(STREAM2).TOUR_DEFAULT, 'in tour order');
});

test('a pinned stream is never moved by a stored tour position', () => {
  assert.deepEqual(select(BOX1, { ls: store({ oc_tour_next: 'YOW' }) }).aps, ['YQM']);
  const ls = store();
  noteTourNext(['YQM'], 0, false, ls);
  assert.equal(ls.getItem('oc_tour_next'), null, 'and a pinned run writes nothing');
});

test('the resume only chooses the start; nothing reorders the live list afterwards', () => {
  // advance() indexes `aps` live. The resume is applied once in the selection
  // block; past it, `aps` is read and never written.
  const after = HTML.slice(HTML.indexOf('var isTour = aps.length > 1;') + 1);
  assert.doesNotMatch(after, /\baps\s*=[^=]/, 'no reassignment of aps after the run is built');
  assert.doesNotMatch(after, /\baps\.(splice|push|pop|shift|unshift|sort|reverse)\(/,
    'and no in-place change either');
  assert.match(NOTE, /localStorage\.setItem\('oc_tour_next', aps\[\(apIdx \+ 1\) % aps\.length\]\)/,
    'the note names the NEXT airport, which is what guarantees forward progress');
  const showNow = HTML.slice(HTML.indexOf('function showNow()'), HTML.indexOf('function advance()'));
  assert.match(showNow, /if \(retire\) \{[\s\S]*?noteTourNext\(\);/,
    'it is written each time a new airport comes up');
  assert.match(HTML, /ocTell\(frames\[aps\[0\]\]\[seq\[0\]\], true\);\s*noteTourNext\(\);/,
    'and when the run starts, so a restart during the first airport moves on too');
});

// v23965 — the bare-tour fallback runs before the dry dock, so the dock
// applies to it. It used to run after, so a bare rotate.html (and a stream
// aimed only at a dead airport) toured docked airports.
test('a bare tour, and a tour that replaced a dead airport, both leave docked airports out', () => {
  const docked = () => store({ oc_dry_dock: JSON.stringify({ docked: ['YOW'] }) });
  for (const q of ['mode=live&rotate=fids', 'ap=ZZZ&mode=live&stream=1&rotate=fids']) {
    const r = select(q, { ls: docked() });
    assert.ok(r.isTour, `${q} still tours`);
    assert.ok(!r.aps.includes('YOW'), `${q} must not put a docked airport on air`);
    assert.ok(r.aps.length === r.TOUR_DEFAULT.length - 1, 'and only the docked one is left out');
  }
});
