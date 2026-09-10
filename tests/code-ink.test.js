'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE AIRPORT CODE MUST BE INKED FOR THE CHIP IT IS ACTUALLY ON.
//
// Reported: the Air Canada arrival code rendered blue, and Porter's was not
// legible at all. Grey text has been ruled out as an option.
//
// Both reports were ONE bug. The chip under the code (.v2-fi-title) is painted
// with a linear-gradient on AC and Porter. A gradient lives in
// background-IMAGE; background-COLOR stays rgba(0,0,0,0). The autofit painter's
// ground walk read backgroundColor only, so it walked past the chip and
// measured the near-black plate underneath — then fitted an ink to clear black
// and painted it onto cream.
//
// Measured on the live YQM/4 board before the fix, the span carried BOTH:
//     color: rgb(252,238,238) !important
//     -webkit-text-fill-color: rgb(76,130,189) !important
// Blink paints glyphs from the second, which is the blue he was pointing at.
//
// These assertions lock the two halves of the fix in place. They are structural
// (they read the source), because the failure is invisible in a DOM-less test
// and only shows as a colour on a live board.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// The painter that owns the rail/shelf title code.
const PAINTER_SEL = "'.gad-aircraft-col .v2-fi-title .v2-fi-code, .g8-bir-shelves .v2-fi-title .v2-fi-code'";

function painterBody() {
  const at = SRC.indexOf(PAINTER_SEL);
  assert.ok(at >= 0, 'the per-code painter must still exist and still own this selector');
  // From the selector to the two setProperty calls that end it.
  const end = SRC.indexOf("'-webkit-text-fill-color'", at);
  assert.ok(end > at, 'the painter must still be the writer of -webkit-text-fill-color');
  return SRC.slice(at, end + 400);
}

// Comments in this painter necessarily DISCUSS backgroundImage and gradients at
// length, so a body-wide word search matches the prose and passes even when the
// behaviour is gone. Mutation-checked: blanking the read left the first version
// of this test green. Assertions here run against comment-stripped code.
function painterCode() {
  return painterBody()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

test('the ground walk sees gradient chips, not just background-color', () => {
  const code = painterCode();
  assert.ok(code.includes('_ncs.backgroundImage'),
    'the walk must actually READ backgroundImage off the computed style — a ' +
    'gradient chip has NO backgroundColor, which is exactly how it measured the ' +
    'dark plate under AC and Porter instead of the cream chip on top of it');
  assert.ok(/\/gradient\/i\.test\(\s*_bi\s*\)/.test(code),
    'and it must test that value for a gradient');
  assert.ok(code.includes('_ncs.backgroundColor'),
    'the original backgroundColor branch must still run first');
});

test('a gradient stop is taken as the ground, and a transparent stop is rejected', () => {
  const body = painterBody();
  // Substring checks, not regex-over-regex: the thing being asserted is a
  // regex literal in the source, and escaping one inside another is how the
  // first version of this test failed against correct code.
  assert.ok(body.includes('_stop = _bi.match('),
    'the walk must extract a colour stop from the gradient string');
  assert.ok(body.includes('_stop[0]'),
    'and use that stop as the ground');
  const guardAt = body.indexOf('!/,\\s*0\\)$/.test(_stop[0])');
  assert.ok(guardAt !== -1,
    'a fully transparent first stop is not a ground — it must keep walking ' +
    '(same rgba(...,0) guard the backgroundColor branch already uses)');
});

test('the last-resort ink is the label beside it, never a hardcoded neutral', () => {
  const body = painterBody();
  assert.ok(body.includes('_lblInk'),
    "the label's own ink must be in the pick chain — it is legible on that chip by construction");
  // Anchor on the TERNARY, not the first `pick =` in the file: the var
  // declaration `var bright = ..., deep = ..., pick = bright` also matches and
  // put `deep` before `_lblInk` for reasons that had nothing to do with order.
  const tern = body.indexOf('(ca >= 3)');
  assert.ok(tern !== -1, 'the pick ternary must still exist');
  const chain = body.slice(tern, tern + 260);
  const lbl = chain.indexOf('_lblInk');
  const deep = chain.indexOf('deep');
  assert.ok(lbl !== -1, 'the pick must consider the label ink');
  assert.ok(deep === -1 || lbl < deep,
    'the label ink must be tried BEFORE the #16283C navy — that navy is the only ' +
    'neutral in the chain and is the grey that has been ruled out');
});

test('the accent is still tried first — the code keeps wearing the carrier colour', () => {
  const body = painterBody();
  assert.match(body, /ca\s*>=\s*3\s*\)\s*\?\s*_acc/,
    'v23466 put the airline accent first and that must survive: with the ground ' +
    'measured correctly, AC red on its grey chip clears 3:1 and is kept');
});

test('the painter writes BOTH colour properties, so no other pass can half-override it', () => {
  const body = painterBody();
  assert.match(body, /setProperty\('color',\s*pick,\s*'important'\)/);
  assert.match(body, /setProperty\('-webkit-text-fill-color',\s*pick,\s*'important'\)/);
  // The live bug was two passes disagreeing: one wrote `color`, this one wrote
  // the fill. Whatever else runs, this pass must never leave them split.
  const c = body.indexOf("setProperty('color'");
  const f = body.indexOf("setProperty('-webkit-text-fill-color'");
  assert.ok(c !== -1 && f !== -1 && Math.abs(f - c) < 200,
    'both writes must stay adjacent — splitting them is how the colour and the ' +
    'painted glyph ended up different values on the live board');
});
