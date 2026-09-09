'use strict';

// v23516 — WHICH AIRPORTS A STREAM PLAYS.
//
// Nick: "You're playing the rotation of international airports on the Moncton
// stream." v23432 had widened the tour trigger to `q.get('stream')` — ANY
// stream value — so both broadcast boxes, which pass an ap= AND a stream=, had
// their named airport overwritten with TOUR_DEFAULT.
//
// He was also right to distrust a fix keyed on the stream NUMBER. Per
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

function select(query) {
  const q = new URLSearchParams(query);
  return new Function('q', 'console', BLOCK + '\nreturn { aps: aps, isTour: isTour, TOUR_DEFAULT: TOUR_DEFAULT };')(
    q, { warn() {}, log() {} },
  );
}

// The two URLs the Hetzner boxes actually run, verbatim from stream-server/README.md.
const BOX1 = 'ap=YQM&mode=live&stream=1&langs=en,fr&rotate=fids,gids,bids,gids&dwell=60';
const BOX2 = 'ap=MCO&mode=live&stream=1&langs=en,es&rotate=fids,gids,bids,gids&dwell=60';

test('box 1 plays Moncton and nothing else', () => {
  const r = select(BOX1);
  assert.deepEqual(r.aps, ['YQM'], 'the Moncton stream must play Moncton — this is the bug Nick reported');
  assert.equal(r.isTour, false);
});

test('the second stream tours, whatever airport its URL happens to name', () => {
  // Nick: "it's not just Miami though or Orlando or Tampa for that matter it's
  // an international stream". Pinning box 2 to its ap= would kill the tour.
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
  // YYZ is deliberately absent from ROSTER (Radware blocks the Worker's egress).
  const r = select('ap=YYZ&mode=live&stream=1&rotate=fids');
  assert.ok(!r.aps.includes('YYZ'), 'a dead airport must never be streamed');
  assert.ok(r.isTour, 'v23432 protection: pointing a stream at a dead airport must still tour');
});

test('tour=1 still forces the tour, tour=0 still opts out, tour=LIST still works', () => {
  assert.ok(select('ap=YQM&tour=1').isTour, 'tour=1 must override a named airport');
  assert.deepEqual(select('ap=YQM&tour=0').aps, ['YQM']);
  assert.deepEqual(select('tour=YHZ,YOW').aps.sort(), ['YHZ', 'YOW']);
});
