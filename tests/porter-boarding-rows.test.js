'use strict';

// v23520 — PORTER BOARDS BY ROW, SO THE ROW COUNT HAS TO BE THE REAL ONE.
//
// Nick: "the DH4 only has 20 rows not 29 for boarding", then "E195 has 33".
//
// Porter boards back to front in three bands, so the count sets every band.
// Two faults: the E-jet figure was 29 against a real 33, which meant rows
// 30-33 were NEVER called — and being the back of the aircraft they are the
// FIRST rows that should be. And the Dash 8 test matched the raw code with its
// punctuation intact, so it caught DH4 and DH8D but missed 'DHC-8-400' and
// 'DHC8400', which the feeds also send. A miss fell through to the E-jet
// branch and called rows that do not exist on a Dash 8.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Lift the real three lines rather than restating them.
const at = SRC.indexOf('var _pdEq = ');
assert.ok(at >= 0, 'fids-core.js must still compute Porter row counts from the equipment code');
const end = SRC.indexOf('var _pdRows = ', at);
const EXPR = SRC.slice(at, SRC.indexOf(';', end) + 1);
const rowsFor = new Function('equipRaw', EXPR + '\nreturn _pdRows;');

// Bands are derived exactly as the sign derives them.
function bands(rows) {
  const b = Math.ceil(rows / 3);
  return { now: [rows - b + 1, rows], next: [rows - 2 * b + 1, rows - b], band: b };
}

test('the Dash 8-400 boards 20 rows, in every spelling the feeds send', () => {
  for (const eq of ['DH4', 'DH8D', 'DHC-8-400', 'DHC8400', 'Q400',
                    'De Havilland Dash 8-400', 'DASH 8-400', 'dhc-8-402']) {
    assert.equal(rowsFor(eq), 20, `${eq} is a Dash 8-400 and has 20 rows`);
  }
});

test('the E195-E2 boards 33 rows, not 29', () => {
  for (const eq of ['E95', 'E195', 'E290', 'E295', '295', 'EMBRAER 195']) {
    assert.equal(rowsFor(eq), 33, `${eq} is an E-jet and has 33 rows`);
  }
});

test('the back rows are actually called on the E195', () => {
  const { now } = bands(rowsFor('E195'));
  assert.deepEqual(now, [23, 33],
    'boarding back to front must start at the LAST row — at 29 it started at 20 and rows 30-33 were never called');
});

test('no Dash 8 is ever called by a row it does not have', () => {
  for (const eq of ['DH4', 'DHC-8-400', 'DHC8400']) {
    const { now } = bands(rowsFor(eq));
    assert.ok(now[1] <= 20, `${eq}: called rows must not exceed the aircraft's 20`);
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
