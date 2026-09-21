'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE GATE NUMBER IS THE SIGN, AND IT IS FITTED FIRST.
//
// The number's width budget used to be whatever the Gate/Porte label left
// over. That makes the largest glyph on a gate sign a function of how wide
// the board's typeface happens to set two words: measured on a 1920 board
// while trying a wider face, the label took 239px of a 442px panel, the
// number was handed 59px, and the fitter's search walked it down to its 12px
// floor — the same outcome v23753 fixed from the other end (a measurement
// that could never succeed on a shrink-to-fit box), reached by another route.
//
// A label is a caption; it yields. The number takes its half of the panel
// first and the label fits into the real remainder. These pin that order, so
// no future face can take the number away again.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

/** The body of the `.g8-r1-right` fitter. */
function headerFitter() {
  const at = SRC.indexOf("root.querySelectorAll('.g8-r1-right').forEach(function (box) {");
  assert.ok(at >= 0, 'the gate-header fitter must exist');
  return SRC.slice(at, SRC.indexOf('\n    });', at));
}

test('the number\'s budget is a share of the panel, never the label\'s leftovers', () => {
  const body = headerFitter();
  const call = body.match(/_boxAssign\(num, (.+?), Math\.floor\(_gh/);
  assert.ok(call, 'the number must be box-assigned');
  assert.doesNotMatch(call[1], /\bbw\b/,
    'the number\'s width budget must not be derived from the label\'s width — that is ' +
    'what let a wide face starve it down to the floor');
  assert.match(call[1], /Math\.max\(40, Math\.round\(w \* 0\.5\)\)/,
    'half the panel, with the same 40px lower bound as before');
});

test('the label is fitted after the number, and only ever shrinks', () => {
  const body = headerFitter();
  const numAt = body.indexOf('_boxAssign(num,');
  const bilAt = body.indexOf('if (bil) {');
  assert.ok(numAt >= 0 && bilAt > numAt, 'the label is fitted AFTER the number');
  const bil = body.slice(bilAt);
  assert.match(bil, /num\.getBoundingClientRect\(\)\.width/,
    'the label\'s budget is what the number actually took, measured — not assumed');
  assert.match(bil, /bil\.style\.removeProperty\('font-size'\)/,
    'the label is reset to its stylesheet size before each pass, or repeated ' +
    'corrections ratchet it down a little further every time');
  assert.match(bil, /_bilPx -= Math\.max\(1, _bilPx \* 0\.06\)/, 'and it steps down, never up');
  assert.doesNotMatch(bil, /_bilPx \+=/, 'the label never grows: v23835 already sized it');
  assert.match(bil, /_bilPx > 14/, 'with a floor of its own, so a caption cannot vanish either');
  assert.match(bil, /_bilGuard-- > 0/, 'a bounded loop — no measurement can spin it');
});

test('the number keeps its full-band height budget on a boarding takeover', () => {
  // v23119, unchanged by the reordering: the band gets shorter on a takeover
  // but the number does not.
  const body = headerFitter();
  assert.match(body, /if \(box\.closest\('\.g8-wrap\.g8-takeover'\)\) _gh = Math\.max\(_gh, 110\);/);
  assert.match(body, /_boxAssign\(num, .+?, Math\.floor\(_gh \* 0\.98\)/);
});

test('the markup still asks for a big number, so the fitter has something to keep', () => {
  // The inline clamp is the starting size the fitter searches down from; if it
  // were small the reordering above would have nothing to protect.
  const m = SRC.match(/class="g8-r1-gate" style="font-size:' \+ \(function\(g\)\{([^}]*)\}\)/);
  assert.ok(m, 'the gate number must still set its own clamp by digit count');
  const sizes = [...m[1].matchAll(/clamp\((\d+)px/g)].map((x) => Number(x[1]));
  assert.ok(sizes.length >= 3, 'a size for each length of gate name');
  assert.ok(Math.min(...sizes) >= 56, `the smallest start is ${Math.min(...sizes)}px — a gate number is never small`);
});
