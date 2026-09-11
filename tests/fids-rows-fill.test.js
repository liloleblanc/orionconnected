'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE BOARD MUST PAGE BY THE ROW HEIGHT IT ACTUALLY DRAWS.
//
// Reported: the board does not fill the screen, stops at about 8 rows, leaves a
// visible empty band and rotates early.
//
// Cause: the paging row-height had a sanity floor of 40px, written when the
// smallest density tier was 44px. v23502 dropped `small` to 36px and nothing
// revisited the floor. `small` is the shipped default, so 36 > 40 was false on
// every un-customised screen, the real measurement was discarded, and the
// fallback answered 62. The board drew 36px rows while dividing the space by
// 62 — reserving 1.7x the height of every row it painted.
//
// The invariant is simple and worth keeping: the sanity floor must sit BELOW
// the smallest row height any density tier can produce. A floor above a real
// tier silently discards the truth.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'flight-display.css'), 'utf8');

// Every --fids-row-h a density tier can set.
function tierHeights() {
  const out = {};
  for (const m of CSS.matchAll(/data-fids-logo-size="(\w+)"[^{]*\{[^}]*?--fids-row-h:\s*(\d+(?:\.\d+)?)px/g)) {
    out[m[1]] = parseFloat(m[2]);
  }
  return out;
}

// Every sanity floor guarding the measured row height.
function floors() {
  return [...SRC.matchAll(/_measuredRowH\s*>\s*(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1]));
}

test('the density tiers still declare their row heights', () => {
  const t = tierHeights();
  assert.ok(Object.keys(t).length >= 3,
    'small/medium/large row heights must be readable from flight-display.css');
  assert.ok(t.small > 0, 'the small tier must set --fids-row-h');
});

test('the sanity floor sits BELOW the smallest real tier', () => {
  const t = tierHeights();
  const smallest = Math.min(...Object.values(t));
  const f = floors();
  assert.ok(f.length > 0, 'the measured row height must still be sanity-checked');
  for (const floor of f) {
    assert.ok(floor < smallest,
      `floor ${floor}px is NOT below the smallest tier (${smallest}px). A floor at ` +
      `or above a real tier discards the honest measurement on every render, and ` +
      `the board pages by the fallback instead of by the rows it draws.`);
  }
});

test('render and paging use the SAME row-height expression', () => {
  // Two copies exist by design (render() and getPageCount()). If they drift, the
  // board paints one number of rows and pages by another.
  const exprs = [...SRC.matchAll(/const rowH = _measuredRowH[\s\S]{0,220}?;/g)].map(m =>
    m[0].replace(/\s+/g, ' ').trim());
  assert.ok(exprs.length >= 2, 'both the render and the paging row-height must exist');
  const uniq = [...new Set(exprs)];
  assert.equal(uniq.length, 1,
    'render and paging must compute rowH identically, or the board pages by a ' +
    'height it does not paint:\n' + uniq.join('\n---\n'));
});

test('the fallback tracks the theme, not a bare constant', () => {
  const at = SRC.indexOf('const rowH = _measuredRowH');
  const expr = SRC.slice(at, at + 220);
  assert.match(expr, /_themeRowH/,
    'when the measurement is unusable the fallback must read the theme height — ' +
    'a hardcoded constant goes stale the moment a tier changes, which is exactly ' +
    'what happened here');
});
