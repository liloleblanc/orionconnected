'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23942 — AIR FRANCE'S VIRGULE STAYS RED IN BOTH GATE ORBS.
//
// The gate draws the carrier's emblem in a round orb twice outside the middle
// screen: the Flight shelf at the top of the left rail and the Your Aircraft
// caption at the bottom right. Both ask _gateOrbParts, and it inks any emblem
// not named in _CARD_COLOR_EMBLEMS white (brightness(0) invert(1)). That list
// was derived as "more than one colour", so the single red virgule fell off it
// and showed as a white slash on both orbs. An emblem is never whitened; only
// letterforms drawn to be inked white (Jazz's J, Rouge's r) are.
//
// The recipe is run here exactly as the page runs it, so this checks what the
// orb is given, not just that a list holds a key.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUB = path.resolve(__dirname, '..', 'fids-current');
const SRC = fs.readFileSync(path.join(PUB, 'js', 'fids-core.js'), 'utf8');

function closeBrace(from) {
  let depth = 0, line = false, blk = false, quote = '';
  for (let i = SRC.indexOf('{', from); i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { blk = true; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  throw new Error('unclosed block at ' + from);
}
function table(decl) {
  const at = SRC.indexOf(decl);
  assert.ok(at >= 0, decl + ' must exist in fids-core.js');
  const from = SRC.indexOf('{', at);
  return new Function('return ' + SRC.slice(from, closeBrace(at)) + ';')();
}

// The colour list, the keeps-colour rule and the orb recipe, run in a sandbox
// with the page's own emblem table and brand table behind them.
const EMBLEMS = table('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {');
const BRAND = table('const AIRLINE_BRAND = {');
const ACCENT = table('const AIRLINE_ACCENT = {');
const orb = (() => {
  const a = SRC.indexOf('window._CARD_COLOR_EMBLEMS = {');
  const b = SRC.indexOf('window._gateOrbParts = function');
  assert.ok(a > 0 && b > a, 'the colour list sits before the orb recipe');
  const end = closeBrace(b);
  const sandbox = {
    window: {},
    AIRLINE_BRAND: BRAND,
    _airlineOrbEmblem: (c) => EMBLEMS[c] || ''
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC.slice(a, end) + ';', sandbox);
  return sandbox.window;
})();

function luminance(hex) {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(h.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('Air France is a colour-keeping emblem', () => {
  assert.equal(orb._CARD_COLOR_EMBLEMS.AF, true);
  assert.equal(orb._orbKeepsColour('AF'), true);
  assert.equal(orb._orbKeepsColour('af'), true, 'the rule is case-blind, as the gate calls it');
});

test('both orbs draw the virgule in its own red, with no white-force', () => {
  const p = orb._gateOrbParts('AF');
  assert.match(p.path, /air-france-emblem\.svg/);
  assert.doesNotMatch(p.imgStyle, /invert/, 'the orb image is not inked white');
  assert.doesNotMatch(p.imgStyle, /brightness\(0\)/);
  assert.equal(p.native, false, 'a flat mark on the disc, not a full-bleed tile');
  const art = fs.readFileSync(path.join(PUB, p.path.split('?')[0]), 'utf8');
  assert.deepEqual([...new Set(art.match(/#[0-9a-fA-F]{6}/g))].map((h) => h.toLowerCase()), ['#eb212b'],
    'the virgule is one red; whitened, nothing of it is left');
});

test('it keeps the navy disc the glyph badges beside it wear, and reads on it', () => {
  const p = orb._gateOrbParts('AF');
  assert.match(p.badge, /background:var\(--airline-accent,#002157\)/,
    'the accent disc, not the light disc: the column stays one colour');
  // The rail orb renders on the board accent, the caption bar on the brand
  // accent; the red clears 3:1 on both.
  for (const ground of [ACCENT.AF, BRAND.AF.accent]) {
    assert.ok(contrast('#eb212b', ground) >= 3,
      'red on ' + ground + ' = ' + contrast('#eb212b', ground).toFixed(2));
  }
});

test('the change is Air France alone: the letterforms are still inked white', () => {
  // Jazz's J and Rouge's r are drawn to be inked white on their own disc; the
  // orb rules keep them white, and this change must not reach them.
  for (const code of ['QK', 'RV']) {
    if (!EMBLEMS[code]) continue;
    assert.equal(orb._orbKeepsColour(code), false, code);
    assert.match(orb._gateOrbParts(code).imgStyle, /brightness\(0\) invert\(1\)/, code);
  }
});

test('the caption re-point pass reads the same list', () => {
  // The Your Aircraft card is rebuilt once the operator is known, and that
  // pass strips or re-adds the white-force by the same list.
  const at = SRC.indexOf("if (_orbFixPng || (window._CARD_COLOR_EMBLEMS && window._CARD_COLOR_EMBLEMS[_orbArtCode]))");
  assert.ok(at > 0, 'the re-point pass drops the invert for a colour-keeping emblem');
  assert.ok(SRC.indexOf("&& !(window._CARD_COLOR_EMBLEMS && window._CARD_COLOR_EMBLEMS[_orbArtCode])", at) > at,
    'and never re-adds it for one');
});
