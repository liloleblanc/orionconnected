'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23790 — THE AIRCRAFT TYPE STOPS BEING SEVERED BY THE OPERATOR MARK.
//
// Reported as a crop of the caption strip reading "De Havi". Measured on a
// board rather than read: the strip is 201px wide, .v2-rc-acb-opby is
// `flex: 0 0 auto` and wants 235px on its own — wider than the whole strip —
// so the type cell was handed 8px and clipped by overflow:hidden. It was not
// losing a word; there was no room for it at all.
//
// This has been reported before. v22857 ("the type line is the hero"),
// v22866 (the Operated-By row may never render larger than the type), and
// v23210 — whose own comment names 'De Havilland Das' clipping mid-word, and
// whose fix was to have the JS fitter step aside and let the stylesheet clamps
// own the type. That was right and could not work alone: no clamp helps a cell
// whose flex sibling refuses to shrink below the full width of the band.
//
// So the rule that matters is the flex one, and it is what this file guards.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

const AT = CSS.lastIndexOf('v23790 — THE AIRCRAFT TYPE STOPS BEING SEVERED');
const BLOCK = AT >= 0 ? CSS.slice(CSS.lastIndexOf('/*', AT)) : '';

/** The declarations of the first rule whose selector ends with `tail`. */
function ruleFor(tail) {
  const at = BLOCK.indexOf(tail + ' {');
  assert.ok(at >= 0, `no rule for ${tail}`);
  return BLOCK.slice(at, BLOCK.indexOf('}', at));
}

test('the operator cell is allowed to shrink', () => {
  // The whole bug in one declaration. `flex: 0 0 auto` on a cell that wants
  // more than the band is what starved the type to 8px.
  const d = ruleFor('.v2-rc-acb-cap .v2-rc-acb-opby');
  assert.match(d, /flex: 0 1 auto/,
    'the operator cell must be shrinkable — 0 0 auto is the declaration this ' +
    'block exists to overturn');
  assert.match(d, /min-width: 0/,
    'and a flex item will not shrink past its content without min-width: 0');
  assert.match(d, /max-width: 100%/, 'nor past the band it sits in');
});

test('the type gets a whole line to itself when there is an operator', () => {
  const cap = ruleFor('.v2-rc-acb-cap');
  assert.match(cap, /flex-direction: column/,
    'two rows, because 201px cannot hold both at a readable size side by side');
  const t = ruleFor('.v2-rc-acb-cap .v2-rc-acb-actype');
  assert.match(t, /width: 100%/, 'the type takes the full width of the band');
  assert.match(t, /white-space: normal/,
    'and wraps at the separator rather than being cut mid-word — the ' +
    'difference between a wrapped phrase and a severed one');
  assert.doesNotMatch(t, /text-overflow: ellipsis/,
    'an ellipsis on an aircraft type is the same failure with better manners');
});

test('only a flight with a separate operator pays for the second row', () => {
  // A gate whose marketing and operating carrier are the same has no operator
  // cell, and must keep the compact strip and the photo height it has now.
  const hits = [...BLOCK.matchAll(/\.v2-rc-shelf-illus(:has\(\.v2-rc-acb-opby\))?[^,{]*[,{]/g)];
  assert.ok(hits.length >= 4, 'the block must actually target the shelf');
  for (const m of hits) {
    assert.ok(m[1], `a rule targets every shelf, not just one with an operator: ${m[0].trim()}`);
  }
});

test('the strip and the photo move by the same token', () => {
  // The clouds and the aircraft are positioned against the strip's height.
  // Letting the two drift apart is how the strip ends up over the fuselage.
  const cap = ruleFor('.v2-rc-acb-cap');
  const h = (cap.match(/height: (clamp\([^;]*?\))\s*!important/) || [])[1];
  assert.ok(h, 'the strip must declare a height');
  const offsets = [...BLOCK.matchAll(/bottom: (clamp\([^;]*?\))\s*!important/g)].map((m) => m[1]);
  assert.ok(offsets.length >= 1, 'the photo must be pushed up by the same amount');
  for (const o of offsets) {
    assert.equal(o, h,
      `the photo is offset by ${o} while the strip is ${h} — they are the same ` +
      'measurement and must be the same token');
  }
});

test('every clamp here survives a narrow board', () => {
  // House rule: a height-only clamp overflows a narrow panel. Same trap the
  // weather card hit twice.
  const bad = [...BLOCK.matchAll(/clamp\([^)]*(?:\([^)]*\))?[^)]*\)/g)]
    .map((m) => m[0])
    .filter((c) => /vh/.test(c) && !/vw/.test(c));
  assert.deepEqual(bad, [], `these clamps have no width term: ${bad.join(', ')}`);
});
