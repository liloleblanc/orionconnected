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

// ── v23942 — every other carrier that can reach the card ────────────────────

const CSS = fs.readFileSync(path.join(PUB, 'css', 'display-overrides.css'), 'utf8');
const TREATMENT = table('var LOGO_TREATMENT = {');

// Every carrier must be accounted for: drawn white, a tile, named in
// _FB_WELCOME_OWN_COLOURS, exempted elsewhere, or on one of the two lists
// below. So a new colour emblem cannot be whitened by default unnoticed.
//
// The one recorded exception to "never whiten an emblem": single-colour
// LETTERFORMS drawn to be inked white on their carrier's own ground (the orb
// rules keep these white for the same reason).
const LETTERFORMS_WHITE = {
  QK: 'Jazz J',
  RV: 'Rouge r; its burgundy also fails on the card',
  ROU: 'Rouge r (ICAO form)'
};

// NOT A DECISION. Colour emblems this card still whitens, because their
// colours disappear into their own card (share of ink at 3:1 or better).
// Whitening them breaks the rule; the fix is a different ground behind the
// mark. Listed so the set is visible and cannot grow, and pinned below so a
// carrier leaves it only by being fixed.
const STILL_WHITENED_OPEN = {
  F9: 'Frontier green, 0% readable on its card',
  FI: 'Icelandair navy fin, 0%',
  HA: 'Hawaiian pualani, 48%',
  AA: 'American flight symbol, 56% (American usually shows its own creative instead)',
  PT: 'American flight symbol (Piedmont)',
  MQ: 'American flight symbol (Envoy)',
  OH: 'American flight symbol (PSA)'
};

function isWhiteOnly(file) {
  if (!/\.svg$/i.test(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  const fills = (text.match(/fill(?:=")?:?\s*"?(#[0-9a-fA-F]{3,6}|rgb\([^)]*\)|currentColor|none)/g) || [])
    .map((f) => f.replace(/^fill(=")?:?\s*"?/, '').toLowerCase());
  return fills.length > 0 && fills.every((f) => ['#fff', '#ffffff', 'rgb(255,255,255)', 'none'].includes(f.replace(/\s/g, '')));
}
function cssExempt(url) {
  const base = path.basename(url.split('?')[0]).replace(/\.[a-z]+$/i, '');
  if (TREATMENT[base] === 'no_filter') return 'LOGO_TREATMENT no_filter';
  if (CSS.includes('img[src*="' + base + '"]')) return 'display-overrides.css';
  return '';
}

test('the renderer sets the class the Welcome-card CSS is written against', () => {
  assert.match(SRC, /\+ '<img class="gad-ad-logo" src="' \+ ad\.logo \+ '" alt="" '/,
    'without it the tile rule below never matches and tiles turn into white squares');
  const at = CSS.indexOf('img.gad-ad-logo[src*="/logos/airline-tiles/"]:not([src*="PB-arrow"])');
  assert.ok(at > 0, 'the tile rule keys on the folder, minus the one bare arrow in it');
  const body = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(body, /filter: none !important;/);
});

test('every carrier that can reach the card is drawn white, a tile, in its own colours, a letterform, or on the open list', () => {
  const codes = new Set([...Object.keys(EMBLEMS), ...Object.keys(WELCOME_LOGO)]);
  const unexplained = [];
  for (const code of codes) {
    const url = WELCOME_LOGO[code] || EMBLEMS[code];
    const file = path.join(PUB, url.split('?')[0]);
    assert.ok(fs.existsSync(file), code + ': ' + url);
    const tile = /\/logos\/airline-tiles\//.test(url) && !/PB-arrow/i.test(url);
    const ok = tile || OWN[code] || isWhiteOnly(file) || cssExempt(url)
      || LETTERFORMS_WHITE[code] || STILL_WHITENED_OPEN[code];
    if (!ok) unexplained.push(code + ' ' + url);
    if (OWN[code]) assert.ok(!tile, code + ': a tile is already covered by the folder rule');
    if (LETTERFORMS_WHITE[code] || STILL_WHITENED_OPEN[code]) {
      assert.ok(!OWN[code] && !tile, code + ': cannot be both whitened and kept in colour');
    }
  }
  assert.deepEqual(unexplained, [], 'whitened on the Welcome card and on neither list');
});

test('the open list only shrinks', () => {
  // A colour emblem that is still whitened is an open problem, not a choice.
  // Nothing joins this list; a carrier leaves it when its card is fixed.
  assert.deepEqual(Object.keys(STILL_WHITENED_OPEN).sort(),
    ['AA', 'F9', 'FI', 'HA', 'MQ', 'OH', 'PT']);
  for (const code of Object.keys(STILL_WHITENED_OPEN)) {
    assert.ok(!isWhiteOnly(path.join(PUB, (WELCOME_LOGO[code] || EMBLEMS[code]).split('?')[0])),
      code + ' is colour art, which is why it is open');
  }
});

test('PAL shows its gold tile, not the white arrow drawn for the orb badge', () => {
  assert.equal(WELCOME_LOGO.PB, '/logos/airline-tiles/PB.svg');
  assert.equal(EMBLEMS.SP, '/logos/airline-tiles/PB.svg', 'the file PAL express already shows here');
  assert.match(EMBLEMS.PB, /PB-arrow\.svg/, 'the orb keeps its arrow');
});

test('the colour marks named for the card read on it', () => {
  // Measured on a canvas over each card's ground (share of ink at 3:1 or
  // better); single-ink files are re-checked here from their fill.
  for (const code of ['AC', 'AC1', 'ZX', '9M', '9L', '9X']) {
    const art = welcomeArt(code);
    assert.equal(art.fills.length, 1, code + ' is a single-ink mark');
    for (const g of cardGround(code)) {
      assert.ok(contrast(art.fills[0], g) >= 3, code + ' ' + art.fills[0] + ' on ' + g + ' = ' + contrast(art.fills[0], g).toFixed(2));
    }
  }
});
