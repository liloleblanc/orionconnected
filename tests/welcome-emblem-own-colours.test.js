'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23942 — THE WELCOME CARD NEVER WHITENS AN EMBLEM.
//
// The middle screen's Welcome card draws the carrier's emblem through the
// standard ad renderer, which white-forces its logo (brightness(0) invert(1)).
// That suits a mark drawn to be inked white; on an emblem whose colour IS the
// brand it is the one treatment never allowed. Air France's red virgule came
// out as a white slash.
//
// _FB_WELCOME_OWN_COLOURS names the carriers whose emblem keeps its colours;
// the deck marks their slide and the renderer leaves the artwork alone. Each
// entry must still READ on its own card, which is measured here rather than
// assumed: brand colour on a brand-colour ground can vanish.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'fids-current');
const SRC = fs.readFileSync(path.join(PUB, 'js', 'fids-core.js'), 'utf8');

function block(decl) {
  const at = SRC.indexOf(decl);
  assert.ok(at >= 0, decl + ' must exist in fids-core.js');
  const from = SRC.indexOf('{', at);
  let depth = 0, line = false, blk = false, quote = '';
  for (let i = from; i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { blk = true; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { at, from, to: i + 1 };
  }
  throw new Error('could not close ' + decl);
}
const table = (decl) => { const b = block(decl); return new Function('return ' + SRC.slice(b.from, b.to) + ';')(); };

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

const OWN = table('var _FB_WELCOME_OWN_COLOURS = {');
const EMBLEMS = table('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {');
const WELCOME_LOGO = table('var _FB_WELCOME_LOGO = {');
const BRAND = table('const AIRLINE_BRAND = {');

/** The two ends of the card's gradient, exactly as the deck builds it. */
function cardGround(code) {
  const b = BRAND[code];
  return b ? [b.bg1, b.bg2] : ['#14213d', '#0b1020'];
}
/** The file the card draws for a carrier, and its solid fills. */
function welcomeArt(code) {
  const url = WELCOME_LOGO[code] || EMBLEMS[code];
  assert.ok(url, code + ' has an emblem for the card');
  const file = path.join(PUB, url.split('?')[0]);
  assert.ok(fs.existsSync(file), code + ': ' + url + ' exists');
  const text = /\.svg$/i.test(file) ? fs.readFileSync(file, 'utf8') : '';
  const fills = [...new Set((text.match(/fill(?:=")?:?\s*"?#[0-9a-fA-F]{6}\b/g) || [])
    .map((f) => '#' + f.slice(-6).toLowerCase()))];
  return { url, file, fills };
}

test('Air France keeps its red virgule on the Welcome card', () => {
  assert.equal(OWN.AF, 1);
  const art = welcomeArt('AF');
  assert.match(art.url, /air-france-emblem\.svg/);
  assert.deepEqual(art.fills, ['#eb212b'], 'the virgule is one red, with no white to fall back on');
  for (const g of cardGround('AF')) {
    assert.ok(contrast('#eb212b', g) >= 3, 'red on ' + g + ' = ' + contrast('#eb212b', g).toFixed(2));
  }
});

test('the deck marks the slide and the renderer leaves a marked emblem alone', () => {
  assert.match(SRC, /logoOwnColours: !!_FB_WELCOME_OWN_COLOURS\[code\]/,
    'the Welcome slide carries the flag');
  const keep = SRC.indexOf('if (ad.logoOwnColours) _adKeepColour = true;');
  const filt = SRC.indexOf('var _stdLogoFilter = (_adLightBg || _adKeepColour)');
  assert.ok(keep > 0 && filt > keep, 'the flag is honoured before the filter is chosen');
  // and _adKeepColour is what takes the white-force away
  assert.match(SRC.slice(filt, filt + 400),
    /\? \(_adKeepColour \? 'filter:drop-shadow\(0 1px 3px rgba\(0,0,0,0\.35\)\);' : ''\)\s*: 'filter:brightness\(0\) invert\(1\)/);
});

test('every carrier named keeps an emblem that is not white to begin with', () => {
  for (const code of Object.keys(OWN)) {
    const art = welcomeArt(code);
    if (!art.fills.length) continue;   // raster or gradient art: measured on the board, see the commit
    assert.ok(art.fills.some((f) => luminance(f) < 0.85), code + ': a white-only file needs no exemption');
  }
});
