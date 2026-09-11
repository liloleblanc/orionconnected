'use strict';

// v23730 — THE AIRPORT CODE KEEPS ITS FIRST LETTER ON A NARROW BOARD.
//
// Reported from a live MCO gate: the banner read "VICO" instead of "MCO".
//
// It is not a font fault. Measured on the live board, the M is a real 58.4px
// glyph in a loaded face, and .octb-ap itself has overflow visible, no
// clip-path, no transform, and scrollWidth === width. The clipping belongs to
// the PARENT: .octb-clockrow is overflow:hidden AND justify-content:center, so
// an over-full row loses content off BOTH ends. The right half disappears into
// the clock's own padding; the left half has no padding to absorb it and comes
// straight off the code's first letter.
//
// The step-down that was supposed to prevent that was keyed to viewport HEIGHT
// only — clamp(38px, 7.5vh, 64px). The row's available WIDTH shrinks with a
// narrower board while 7.5vh does not, so any board narrower without being
// shorter kept the type at its 64px cap and overflowed. Measured at 1680x1050:
// clientWidth 454, scrollWidth 479, the code's left edge at -16px.
//
// The guard is that both the code and the clock must carry a WIDTH term, so
// whichever of height or width is tighter governs the size.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'css', 'display-overrides.css'), 'utf8');

// The rules that size the banner row's contents — found by SELECTOR, not by
// pixel value. An earlier draft of this test filtered on "38px or 26px" and
// matched 28 unrelated clamps elsewhere in the file; scoping to the selector
// is the only way to be sure we are asserting about this row.
function bannerRules() {
  const out = [];
  // Split on rule boundaries and keep the ones whose selector names the row.
  const parts = CSS.split('}');
  for (const part of parts) {
    const i = part.indexOf('{');
    if (i < 0) continue;
    const sel = part.slice(0, i);
    const body = part.slice(i + 1);
    if (!/\.octb-clockrow/.test(sel)) continue;
    out.push({ sel: sel.replace(/html body(?::not\(#_\))*/g, '[CHAIN]').trim(), body });
  }
  return out;
}
function bannerSizeDecls() {
  return bannerRules()
    .map(r => (r.body.match(/font-size:\s*clamp\([^;]*;/) || [null])[0])
    .filter(Boolean);
}

test('the code and clock sizes exist as clamps', () => {
  const decls = bannerSizeDecls();
  assert.ok(decls.length >= 2,
    'expected the banner code/clock clamp and the divider clamp');
});

test('the clamps that WIN are constrained by width, not height alone', () => {
  // Six clamps target .octb-clockrow. The first three — 7.1vh/94px, 4.6vh/62px,
  // 9vh/76px — are earlier, shorter-chained rules that lose the cascade; the
  // computed size on a live 1680x1050 board is 57.12px, which can only come
  // from the min() pair below. They are left alone deliberately: they are not
  // what renders, and re-sizing rules I have not verified on a lit board to
  // satisfy a test would be the tail wagging the dog.
  //
  // What matters is that the LAST declaration of each kind — the one that
  // actually governs — carries a width term.
  const decls = bannerSizeDecls();
  assert.ok(decls.length >= 4, 'expected the legacy clamps plus the live pair');
  const winners = decls.slice(-3);   // code, clock, divider
  const offenders = winners.filter(d => !/vw/.test(d));
  assert.deepEqual(offenders, [],
    'a vh-only clamp does not shrink when the board gets narrower, and the ' +
    'row then overflows into .octb-clockrow\'s overflow:hidden — which eats ' +
    "the airport code's first letter");
});

test('the legacy vh-only clamps are still outranked', () => {
  // If a later edit ever deletes the min() pair, these would take over and the
  // bug returns silently. This pins the ordering that keeps them harmless.
  const rules = bannerRules().filter(r => /font-size:\s*clamp/.test(r.body));
  const chainLen = r => (r.sel.match(/\[CHAIN\]/) ? (r.sel.match(/:not\(#_\)/g) || []).length : 0);
  const lastLegacy = rules.map((r, i) => [i, r]).filter(([, r]) => !/vw/.test(r.body)).pop();
  const firstFixed = rules.map((r, i) => [i, r]).find(([, r]) => /vw/.test(r.body));
  assert.ok(lastLegacy && firstFixed, 'both kinds must be present');
  assert.ok(firstFixed[0] > lastLegacy[0],
    'the width-aware rules must come AFTER the vh-only ones in the file');
});

test('the width term is the tighter of the two, via min()', () => {
  const pair = bannerSizeDecls().filter(d => /38px/.test(d));
  assert.ok(pair.length >= 1, 'the code/clock clamp must exist');
  for (const d of pair) {
    assert.match(d, /clamp\(\s*38px,\s*min\(\s*[\d.]+vh,\s*[\d.]+vw\s*\)/,
      'the middle term must be min(<vh>, <vw>) so either dimension can govern');
  }
});

test('the width term leaves margin against the measured overflow', () => {
  // The row gets 27.0% of viewport width (454px of 1680, measured live) and
  // its content needs 479px at 64px type. So the largest size that still fits
  // is 64 * 0.270 * W / 479 = 3.61vw. Anything at or above that re-breaks it.
  const m = CSS.match(/clamp\(\s*38px,\s*min\(\s*[\d.]+vh,\s*([\d.]+)vw\s*\)/);
  assert.ok(m, 'the code/clock clamp must carry a vw term');
  const vw = parseFloat(m[1]);
  assert.ok(vw < 3.61,
    `${vw}vw is at or past the 3.61vw overflow threshold measured at 1680x1050`);
  assert.ok(vw > 2.5,
    `${vw}vw is small enough to shrink the code unnecessarily on wide boards`);
});

test('a 1920 board is unaffected — the 64px cap still governs there', () => {
  const m = CSS.match(/clamp\(\s*38px,\s*min\(\s*([\d.]+)vh,\s*([\d.]+)vw\s*\),\s*(\d+)px\s*\)/);
  assert.ok(m, 'the clamp must be parseable');
  const [, vh, vw, cap] = m.map(Number);
  const at1920 = Math.min(vh / 100 * 1080, vw / 100 * 1920);
  assert.ok(at1920 >= cap,
    `at 1920x1080 the middle term is ${at1920.toFixed(1)}px, which must still ` +
    `exceed the ${cap}px cap or wide boards would shrink`);
});

test('the parent still clips as a last resort', () => {
  // The overflow:hidden is not the bug and must stay — it is what stops a
  // genuinely unfittable row from spilling across the banner. The fix is that
  // it should now have nothing to clip.
  assert.match(CSS, /\.octb-clockrow[^{]*\{[^}]*overflow:\s*hidden/,
    'the row must keep its overflow guard');
});
