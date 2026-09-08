'use strict';

// v23494 — the fourth contrast bug of one shape: a colour assigned per-carrier with
// no regard for the ground it lands on (Porter cream-on-cream, the date bar in its
// own colour, WestJet navy-on-navy, and now Porter's accent on the slate shelf).
// _gateCodeInk is the general answer: keep the carrier's hue, move only lightness.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'fids-current');
const core = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'display-overrides.css'), 'utf8');

// Pull the real colour maths out and exercise it.
const slice = core.slice(core.indexOf('function _ocColorParts('), core.indexOf('function _ocGroundOf('));
const api = new Function(slice + '\nreturn {_ocColorParts,_ocLum,_ocCr,_ocToHsl,_ocFromHsl};')();

test('color(srgb ...) grounds parse as 0-255, not as near-black', () => {
  // Chrome hands these back for color-mix() surfaces. Reading 0.27 as 0.27/255 made
  // every contrast check against the shelf plate come out in the millions.
  const parsed = api._ocColorParts('color(srgb 0.271922 0.340784 0.444)');
  assert.deepEqual(parsed, [69, 87, 113]);
  assert.deepEqual(api._ocColorParts('#254D87'), [37, 77, 135]);
  assert.deepEqual(api._ocColorParts('rgb(216, 47, 46)'), [216, 47, 46]);
  assert.equal(api._ocColorParts('rgba(0, 0, 0, 0)'), null, 'transparent is not a ground');
});

test('the real Porter case measures unreadable, and lifting fixes it', () => {
  const porter = [37, 77, 135];        // --airline-accent-ink on the Porter gate
  const slate = [69, 87, 113];         // the shelf plate it sits on
  assert.ok(api._ocCr(porter, slate) < 1.5, 'Porter navy on slate is the reported bug');
  const [h, s] = api._ocToHsl(porter[0], porter[1], porter[2]);
  const lifted = api._ocFromHsl(h, s, 0.85);
  assert.ok(api._ocCr(lifted, slate) >= 4.5, 'lifting lightness clears the floor');
  // Hue preserved — it must still read as the carrier's colour, not as white.
  const lh = api._ocToHsl(lifted[0], lifted[1], lifted[2])[0];
  assert.ok(Math.abs(lh - h) < 0.02, 'the lift keeps the accent hue');
  assert.ok(lifted[2] > lifted[0], 'still blue-dominant');
});

test('a legible accent is left alone', () => {
  // Air Canada red on the gate field already passes; the pass must not touch it.
  assert.ok(api._ocCr([216, 47, 46], [0, 0, 0]) >= 3.2);
});

test('codes take the carrier accent in both places, and the pass is wired in', () => {
  assert.match(core, /function _gateCodeInk\(root\)/);
  assert.match(core, /_gateTitleFit\(root\);\s*\n\s*_gateCodeInk\(root\);/);
  // The title code no longer pins a fixed gold.
  const titleRule = css.slice(css.indexOf('.v2-fi-title .v2-fi-code {'), css.indexOf('.v2-fi-title .v2-fi-code {') + 900);
  assert.match(titleRule, /--airline-accent-ink/);
  assert.doesNotMatch(titleRule, /color: #fca825 !important/);
});
