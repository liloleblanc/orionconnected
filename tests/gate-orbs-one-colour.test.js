'use strict';

// ══════════════════════════════════════════════════════════════════════════
// EVERY ORB OF A GATE IS ONE COLOUR, AND A BRAND ON ITS OWN GROUND IS DRAWN
// THE SAME WAY IN EVERY ORB (v24150)
//
// Reported on four gates in one evening: Air Creebec, Arajet, Air Transat and
// Air Inuit each showed orbs of two colours, or an orb with nothing in it.
//   · The table of brands on a ground of their own (a ground, and a mark
//     drawn to sit on it) was read by the shared orb recipe as a flag only:
//     the badge went clear and the mark filled it. Transat drew its star on
//     nothing beside five discs of its blue.
//   · The table was made inside the builder of the top-left orb, so the
//     Your Aircraft orb, built from another place, often found it empty and
//     drew the brand another way: a whitened tile on white for Air Inuit, a
//     blue mark on a blue disc for Transat.
//   · Air Inuit had no accent, so its five glyph badges wore a second colour.
// Now the table is made once as the file loads, the recipe paints the disc
// in the ground the table gives with the mark set whole inside it, and the
// one resolver every orb asks returns that mark.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');
const COLORS = fs.readFileSync(path.join(ROOT, 'fids-current/data/airline-colors.js'), 'utf8');

function tableOfGrounds() {
  const at = CORE.indexOf('\nwindow._BADGE_TILE_BRANDS = {');
  assert.ok(at > 0, 'the table is made at the top level of the file');
  const end = CORE.indexOf('\n};', at);
  return new Function('return ' + CORE.slice(at + '\nwindow._BADGE_TILE_BRANDS = '.length, end + 2) + ';')();
}

test('the table of grounds is made once, before the recipe and the resolver that read it', () => {
  const at = CORE.indexOf('\nwindow._BADGE_TILE_BRANDS = {');
  assert.ok(at < CORE.indexOf('window._gateOrbParts = function (code) {'));
  assert.ok(at < CORE.indexOf('function _airlineOrbEmblem(code) {'));
  assert.ok(CORE.includes('        var BADGE_TILE_BRANDS = window._BADGE_TILE_BRANDS;'), 'the rail reads it, it does not make it');
  assert.equal((CORE.match(/window\._BADGE_TILE_BRANDS = \{/g) || []).length, 1, 'one table');
});

test('every brand on its own ground: a ground, a mark that exists, and the resolver returns that mark', () => {
  const T = tableOfGrounds();
  for (const [code, e] of Object.entries(T)) {
    assert.match(e.bg, /^#[0-9A-F]{6}$/i, code + ' has a ground');
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', e.icon)), code + ': ' + e.icon);
  }
  const fn = CORE.slice(CORE.indexOf('function _airlineOrbEmblem(code) {'), CORE.indexOf('\n}\n', CORE.indexOf('function _airlineOrbEmblem(code) {')));
  assert.ok(fn.indexOf("if (tb && tb.bg && tb.icon) return tb.icon;") > 0 && fn.indexOf("if (tb && tb.bg && tb.icon) return tb.icon;") < fn.indexOf('GATE_TOP_ROUND_EMBLEM_FILES[c]'), 'the mark drawn for the ground comes first');
});

test('the recipe paints the disc in that ground and sets the mark inside it whole, in its own colours', () => {
  const recipe = CORE.slice(CORE.indexOf('window._gateOrbParts = function (code) {'), CORE.indexOf('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {'));
  assert.match(recipe, /var onOwnGround = !!\(tb && tb\.bg\);/);
  assert.match(recipe, /\? BASE \+ 'background:' \+ tb\.bg \+ ';padding:clamp\(6px,0\.9vh,13px\);'/);
  assert.match(recipe, /var imgStyle = onOwnGround\s*\? 'width:100%;height:100%;object-fit:contain;display:block;'/);
});

test('the four gates of the report: every glyph badge is the colour of the emblem orb, with an ink that reads on it', () => {
  const T = tableOfGrounds();
  const rail = CORE.slice(CORE.indexOf('var _railBadgeBg = '), CORE.indexOf('var BADGE_STYLE = ', CORE.indexOf('var _railBadgeBg = ')));
  assert.equal(T.DM.bg, '#FFFFFF'); assert.match(rail, /\(_alCodeEmb === 'DM'\) \? '#FFFFFF'/); assert.match(rail, /\(_alCodeEmb === 'DM'\) \? '#520E77'/);
  assert.equal(T['3H'].bg, '#FFFFFF'); assert.match(rail, /\(_alCodeEmb === '3H' \|\| _alCodeEmb === 'AIE'\) \? '#FFFFFF'/); assert.match(rail, /\(_alCodeEmb === '3H' \|\| _alCodeEmb === 'AIE'\) \? '#F1471D'/);
  assert.match(rail, /\(_alCodeEmb === 'YN'\) \? '#FDD49A'/); assert.match(rail, /\(_alCodeEmb === 'YN'\) \? '#272626'/);
  assert.equal(T.TS.bg, '#00B3F0');
  // the destination code on the light discs: dark letters
  for (const [code, ink] of [['YN', '#272626'], ['DM', '#520E77'], ['3H', '#231F20'], ['AIE', '#231F20']]) {
    const i = CSS.indexOf('[data-gate-airline="' + code + '"]', CSS.indexOf('v24150 — the code chip on the discs of carriers whose discs are light'));
    assert.ok(i > 0, code);
    const brace = CSS.indexOf('{', i);
    assert.equal(CSS.slice(brace, CSS.indexOf('}', brace)).match(/color: (#[0-9A-F]{6}) !important;/)[1], ink, code + ' takes ' + ink);
  }
});

test('Air Inuit follows its brand guide: Charcoal Black #231F20, Air Inuit Orange #F1471D, Arctic Mist #E6E7E8', () => {
  assert.match(COLORS, /'3H': \{ r1:'#231F20', r1Text:'#FFFFFF', r2:'#F1471D', r3:'#4A4A4D', body:'#E6E7E8', bodyText:'#231F20' \}, \/\/ Air Inuit/);
  assert.match(CORE, /\n  '3H':'#231F20',   \/\/ v24150/);
  assert.match(CORE, /\n  '3H': \{ bg1:'#231F20', bg2:'#161314', bg3:'#4A4A4D', accent:'#F1471D', name:'Air Inuit' \},/);
  // the orb mark: the geese emblem, orange only (the white of the geese is the white of the disc)
  const emblem = fs.readFileSync(path.join(ROOT, 'fids-current/logos/airlines/canadian-regional/airinuit-emblem.svg'), 'utf8');
  assert.deepEqual([...new Set(emblem.match(/fill="#[0-9A-F]{6}"/gi))], ['fill="#ED4C1E"']);
  assert.doesNotMatch(emblem, /<metadata|<style|class=|<script|<image/);
  // its orange is the guide's within what an eye can tell (deltaE 76 under 6)
  const lab = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92));
    const X = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047, Y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722, Z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
  const a = lab('#ED4C1E'), b = lab('#F1471D');
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 6);
});
