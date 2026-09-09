'use strict';

// v23528 — THE SHELF TEXT FILLS ITS PLATE AND NEVER OVERRUNS IT.
//
// Nick: "the text does not fill all available room and if it does it spills it
// needs to be flush and snug and able to accomodate the text."
//
// The values were sized by clamp(22px, 3.8vh, 48px) — a viewport-HEIGHT figure
// that knows nothing about the WIDTH available — so a short name left the plate
// half empty and a long one ran off it. The stylesheet had carried the
// admission for months: "may still clip the longest names — flagged to fix
// later (Nick)".
//
// The fit maths is a pure function of a measuring callback, so it is tested
// here without a browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

const at = SRC.indexOf('function _ocFitRatio(');
assert.ok(at >= 0, 'fids-core.js must define _ocFitRatio');
let i = SRC.indexOf('{', at), d = 0, end = -1;
for (let k = i; k < SRC.length; k++) {
  if (SRC[k] === '{') d++;
  else if (SRC[k] === '}') { d--; if (!d) { end = k + 1; break; } }
}
const fitRatio = new Function(SRC.slice(at, end) + '\nreturn _ocFitRatio;')();

// A string that occupies `natural` times the plate at ratio 1 fits when
// natural * ratio <= 1.
const plate = (natural) => (r) => natural * r <= 1 + 1e-9;

test('a short value GROWS to fill the plate', () => {
  // "Toronto" at half the plate width should roughly double.
  const r = fitRatio(plate(0.5), { min: 0.55, max: 1.8, step: 0.04 });
  assert.ok(r > 1.6, `expected to grow well past 1, got ${r}`);
  assert.ok(plate(0.5)(r), 'the chosen size must still fit');
});

test('a value that already fits exactly is left alone', () => {
  const r = fitRatio(plate(1), { min: 0.55, max: 1.8, step: 0.04 });
  assert.equal(r, 1, 'nothing to gain and nothing to fix');
});

test('a long value SHRINKS until it stops spilling', () => {
  const r = fitRatio(plate(1.5), { min: 0.55, max: 1.8, step: 0.04 });
  assert.ok(r < 1, 'it must come down');
  assert.ok(plate(1.5)(r), 'and it must actually fit at the size chosen');
  assert.ok(r >= 0.55, 'never below the legibility floor');
});

test('an impossible string takes the floor rather than vanishing', () => {
  const r = fitRatio(plate(9), { min: 0.55, max: 1.8, step: 0.04 });
  assert.equal(r, 0.55, 'a floor is better than an unreadable sliver');
});

test('growth is capped, so a value cannot swallow its own shelf', () => {
  const r = fitRatio(() => true, { min: 0.55, max: 1.3, step: 0.04 });
  assert.ok(r <= 1.3 + 1e-9, 'the height cap must bound the search');
});

test('the fitter is wired into the gate autofit pass', () => {
  assert.match(SRC, /_gateTitleFit\(root\);\s*\n\s*_birValueFit\(root\);/,
    'it must run wherever the title fitter runs — paint, font settle, resize, heartbeat');
  assert.match(SRC, /if \(v\.dataset\.valFitKey === key\) continue;/,
    'unchanged inputs must do NO DOM writes — this is what stopped the codes flickering');
});
