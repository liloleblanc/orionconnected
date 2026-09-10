'use strict';

// v23520 — PORTER BOARDS BY ROW, SO THE ROW COUNT HAS TO BE THE REAL ONE.
//
// Reported: the DH4 has 20 rows for boarding, not 29; the E195 has 33.
//
// Porter boards back to front in three bands, so the count sets every band.
// Two faults: the E-jet figure was 29 against a real 33, which meant rows
// 30-33 were NEVER called — and being the back of the aircraft they are the
// FIRST rows that should be. And the Dash 8 test matched the raw code with its
// punctuation intact, so it caught DH4 and DH8D but missed 'DHC-8-400' and
// 'DHC8400', which the feeds also send. A miss fell through to the E-jet
// branch and called rows that do not exist on a Dash 8.
//
// v23688 — AND NONE OF THAT MATTERED, BECAUSE THE INPUT WAS EMPTY.
//
// Reported again: a Porter Q400 was still boarding by 33 rows after the fix.
// Read live off the YHZ board, every Porter departure
// arrives with _aircraftCode:'' and _aircraft:'' — the type is resolved by a
// later enrichment poll — so the matcher above was handed '' and every Porter
// flight fell to the E-jet branch. The tests below passed the whole time
// because they fed it the strings the sign never actually receives.
//
// The rule that does not depend on a feed, supplied by the owner: a Porter
// flight number with 4 digits operates the DH4, 3 digits the jet — the 4-digit
// series being the Billy Bishop turboprop network and the 3-digit series the
// jets flying YYZ and west. The
// flight number is the one field that is never blank, so it decides; the
// equipment string is only the fallback for a number this rule does not
// describe. THE EMPTY-FEED CASE IS THE TEST THAT WOULD HAVE CAUGHT THIS.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Lift the real lines rather than restating them.
const at = SRC.indexOf('var _pdNum = ');
assert.ok(at >= 0, 'fids-core.js must still derive Porter row counts from the flight number');
const end = SRC.indexOf('var _pdRows = ', at);
const EXPR = SRC.slice(at, SRC.indexOf(';', end) + 1);
const rowsFn = new Function('currentFlight', 'equipRaw', 'equipName',
  EXPR + '\nreturn _pdRows;');

// The sign's own call shape: a flight number, and whatever equipment the feed
// has managed to attach — which on Porter is usually nothing at all.
const rowsFor = (flight, equipRaw, equipName) =>
  rowsFn({ flight }, equipRaw || '', equipName || '');

// Bands are derived exactly as the sign derives them.
function bands(rows) {
  const b = Math.ceil(rows / 3);
  return { now: [rows - b + 1, rows], next: [rows - 2 * b + 1, rows - b], band: b };
}

test('a 4-digit Porter flight is a Dash 8-400 and boards 20 rows', () => {
  // The live YHZ board's own 4-digit departures.
  for (const fl of ['PD2195', 'PD2494', 'PD2382', 'PD1234']) {
    assert.equal(rowsFor(fl), 20, `${fl} is the turboprop network and has 20 rows`);
  }
});

test('a 3-digit Porter flight is the jet and boards 33 rows', () => {
  // The live YHZ board's own 3-digit departures.
  for (const fl of ['PD202', 'PD470', 'PD204', 'PD465', 'PD206', 'PD244']) {
    assert.equal(rowsFor(fl), 33, `${fl} is the jet network and has 33 rows`);
  }
});

test('THE REGRESSION: an empty feed no longer calls a Q400 by 33 rows', () => {
  // Exactly what the board hands the sign — both equipment fields blank.
  assert.equal(rowsFor('PD2195', '', ''), 20,
    'with no equipment data at all, a 4-digit Porter flight must still board 20 rows');
});

test('the equipment string still decides when the number does not', () => {
  // A number outside the 3/4-digit rule falls back to the feed's own words.
  for (const eq of ['DH4', 'DH8D', 'DHC-8-400', 'DHC8400', 'Q400',
                    'De Havilland Dash 8-400', 'DASH 8-400', 'dhc-8-402']) {
    assert.equal(rowsFor('PD12', eq), 20, `${eq} is a Dash 8-400 and has 20 rows`);
  }
  for (const eq of ['E95', 'E195', 'E290', 'E295', '295', 'EMBRAER 195']) {
    assert.equal(rowsFor('PD12', eq), 33, `${eq} is an E-jet and has 33 rows`);
  }
});

test('the equipment NAME counts, not just the code', () => {
  // The enrichment poll often resolves a model name with no IATA code beside
  // it; reading only the code is how the name went unseen.
  assert.equal(rowsFor('PD12', '', 'De Havilland Dash 8-400'), 20);
  assert.equal(rowsFor('PD12', '', 'Embraer E195-E2'), 33);
});

test('an unknown Porter flight is called as the Dash 8, never the jet', () => {
  // Calling rows 21-33 on a 20-row aircraft sends passengers to rows that do
  // not exist. The reverse merely calls a jet in three smaller bands.
  assert.equal(rowsFor('', '', ''), 20, 'nothing known at all must fall to the smaller cabin');
});

test('the back rows are actually called on the E195', () => {
  const { now } = bands(rowsFor('PD202'));
  assert.deepEqual(now, [23, 33],
    'boarding back to front must start at the LAST row — at 29 it started at 20 and rows 30-33 were never called');
});

test('no Dash 8 is ever called by a row it does not have', () => {
  for (const fl of ['PD2195', 'PD2494']) {
    const { now } = bands(rowsFor(fl));
    assert.ok(now[1] <= 20, `${fl}: called rows must not exceed the aircraft's 20`);
  }
});

test('the three bands cover the cabin without a gap', () => {
  for (const rows of [20, 33]) {
    const { now, next, band } = bands(rows);
    assert.equal(now[1], rows, 'the first call must reach the last row');
    assert.equal(next[1] + 1, now[0], 'no gap between the first and second bands');
    assert.ok(next[0] - 1 <= band, 'the final band must reach row 1');
  }
});
