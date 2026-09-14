'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23768 — A SEPARATOR EARNS ITS PLACE ONLY ON ONE LINE.
//
// "If youre gonna have a seperation by seperating it by row then no need for a
// | separation it doesnt serve a purprose."
//
// On one line the bar is what tells the two languages apart. Stacked onto two
// rows the row break already does that, and the bar is left stranded at the
// head of the second line doing nothing — which is the same mark the v23767
// note was complaining about when it chose an ellipsis over wrapping.
//
// CSS cannot ask which line a span landed on, so this is measured at runtime
// and the container marked .is-stacked. The parts that can rot are held here:
// the three shapes a separator takes (a ::before, a real span, the Welcome
// headline's own), the measurement's tolerance, and the fact that the halves
// are addressable at all — without the spans there is nothing to measure.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

/** A top-level function's body, ending at its real closing brace. */
function functionBody(name) {
  const at = SRC.indexOf('function ' + name);
  assert.ok(at >= 0, name + ' must exist');
  const end = SRC.indexOf('\n}', at);
  assert.ok(end > at, 'could not close ' + name);
  return SRC.slice(at, end + 2);
}

test('the measurement exists and compares rows, not characters', () => {
  const body = functionBody('_fidsPairSeparators');
  assert.match(body, /getBoundingClientRect/, 'it has to measure, not guess');
  assert.match(body, /is-stacked/, 'it marks the container for the stylesheet');
  // A pair on one line differs by sub-pixel baseline wobble; a tolerance of
  // zero would mark every pair as stacked and delete every separator.
  assert.match(body, /Math\.max\(4,/,
    'the row test needs a tolerance, or sub-pixel wobble reads as a row break');
});

test('the halves are addressable, or there is nothing to measure', () => {
  // The Welcome headline joined with a bare ' · ' and the weather pair with
  // bare text either side of a separator span. Bare text has no box.
  assert.match(SRC, /g8-pair-h/, 'the Welcome headline halves need spans');
  assert.match(SRC, /g8-pair-sep/, 'and its separator needs to be addressable');
  assert.match(SRC, /wxc-t-part/, 'the weather title halves need spans');
  assert.doesNotMatch(SRC, /return _w\.join\(' · '\);/,
    'the Welcome headline must not go back to joining bare text');
});

test('all three separator shapes are hidden when stacked', () => {
  const at = CSS.lastIndexOf('A SEPARATOR EARNS ITS PLACE ONLY ON ONE LINE');
  assert.ok(at >= 0, 'the rule block must exist');
  const body = CSS.slice(at, at + 2600);
  assert.match(body, /\.is-stacked > span \+ span::before\s*\{\s*content:\s*none/,
    'the CSS-injected separator');
  assert.match(body, /\.is-stacked[^{]*\.v2-rc-fi-sep/, 'the real separator span');
  assert.match(body, /\.is-stacked[^{]*\.g8-pair-sep/, "the Welcome headline's separator");
});

test('the rule outranks what it overrides', () => {
  // The separator rules it has to beat carry long :not(#_) guard chains, and
  // !important does not outrank specificity — a short selector here is a
  // silent no-op, which is exactly how the v23767 title fix first shipped.
  const at = CSS.lastIndexOf('A SEPARATOR EARNS ITS PLACE ONLY ON ONE LINE');
  const firstRule = CSS.slice(CSS.indexOf('html body', at), CSS.indexOf('{', CSS.indexOf('html body', at)));
  const guards = (firstRule.match(/:not\(#_\)/g) || []).length;
  assert.ok(guards >= 40,
    `only ${guards} specificity guards; the rules this overrides carry 43`);
});

test('the pass is scheduled, not run inline on every render', () => {
  // The board re-renders constantly. Measuring inline would force layout on
  // each one; a rAF collapses a burst into a single pass.
  assert.match(SRC, /requestAnimationFrame\([\s\S]{0,120}_fidsPairSeparators/,
    'the pass should be rAF-scheduled');
  assert.match(SRC, /MutationObserver\([\s\S]{0,80}_fidsSchedulePairPass/,
    'and catch renders that never route through render()');
});
