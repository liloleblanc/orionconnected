'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23770 — CANADIAN NORTH: WHITE ON WHITE, AND NOTHING AT ALL.
//
// Reported after the northern-carrier pass: the marks were still white on
// white, or absent. Both were the same gap. 5T had an orb tile and a banner
// lockup and NOTHING ELSE — no wordmark, no row tile, no row emblem — so:
//
//   the ROW fell through to OPERATOR_LOGOS' colour lockup under the whitening
//   filter, which is white on any light ground;
//   the WELCOME card's sub-logo resolved '' and drew nothing;
//   the BIDS cell drew nothing, for the reason v23769 fixed for Air North.
//
// The wordmark pair is the supplied red text-only file for light grounds and
// the same letters in white for dark ones, so every surface picks the
// variant for its own ground and no filter is ever applied. The tile beside
// it carries the symbol; the wordmark must therefore stay text-only, or the
// symbol prints twice.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const DIR = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'canadian-regional');

function table(decl) {
  const at = SRC.indexOf(decl);
  assert.ok(at >= 0, decl + ' must exist');
  const from = SRC.indexOf('{', at);
  let depth = 0, line = false, block = false, quote = '';
  for (let i = from; i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return new Function('return ' + SRC.slice(from, i + 1) + ';')();
  }
  throw new Error('could not close ' + decl);
}

const WM = table('const IATA_TO_WORDMARK = {');
const EMB = table('const IATA_TO_EMBLEM = {');
const SUB = table('const LOGO_SUBFOLDER = {');

test('Canadian North has a wordmark under both codes the feeds send', () => {
  assert.equal(WM['5T'], 'canadian-north');
  assert.equal(WM['MPE'], 'canadian-north', 'the ICAO form arrives from some feeds');
});

test('both variants exist, are registered, and are the same letters in two inks', () => {
  const dark = path.join(DIR, 'canadian-north-wordmark-dark.svg');
  const light = path.join(DIR, 'canadian-north-wordmark-light.svg');
  assert.ok(fs.existsSync(dark) && fs.existsSync(light), 'both files must be on disk');
  // logoPath() resolves a bare filename through LOGO_SUBFOLDER; an unlisted
  // file is a dead pointer that falls back to the text name — silently.
  assert.equal(SUB['canadian-north-wordmark-dark.svg'], 'airlines/canadian-regional');
  assert.equal(SUB['canadian-north-wordmark-light.svg'], 'airlines/canadian-regional');
  const d = fs.readFileSync(dark, 'utf8'), l = fs.readFileSync(light, 'utf8');
  assert.ok(/#BA0C2F/i.test(d), 'the dark-ground variant is the brand red');
  assert.ok(!/#BA0C2F/i.test(l), 'the light variant carries no red');
  assert.ok(/#FFFFFF/i.test(l), 'the light variant is white');
  // same artwork: recolouring must not change the geometry
  assert.equal(d.replace(/#BA0C2F/gi, '#'), l.replace(/#FFFFFF/gi, '#'), 'the two variants must differ only in ink');
});

test('the wordmark is text only, because the tile beside it carries the symbol', () => {
  const l = fs.readFileSync(path.join(DIR, 'canadian-north-wordmark-light.svg'), 'utf8');
  const paths = (l.match(/<path\b/g) || []).length;
  // "Canadian North" is 13 letters; the lockup files carry the symbol on top
  // and are a different shape entirely (0 0 901.61 171.15).
  assert.equal(paths, 13, `expected 13 letterforms, found ${paths} paths — is this the lockup?`);
  assert.doesNotMatch(l, /viewBox="0 0 901\.61 171\.15"/, 'that is the lockup, not the wordmark');
});

test('the row and the BIDS cell can reach the tile the orb already draws', () => {
  assert.equal(EMB['5T'], '/logos/airline-tiles/CanadianNorth-Emblem.svg');
  assert.equal(EMB['MPE'], '/logos/airline-tiles/CanadianNorth-Emblem.svg');
  assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', 'logos', 'airline-tiles', 'CanadianNorth-Emblem.svg')));
});

test('the Welcome card resolves the ICAO form too', () => {
  const at = SRC.indexOf('var _FB_WM_ICAO = {');
  assert.ok(at >= 0);
  assert.match(SRC.slice(at, at + 2000), /'MPE':\s*'5T'/, 'MPE must map to 5T for the card');
});

test('no whitening filter is left in the path', () => {
  // With a wordmark registered, mkLogo() takes its first branch and never
  // reaches the OPERATOR_LOGOS fallback that carries data-needs-invert.
  // The fallback itself is left in place for carriers that still need it.
  const at = SRC.indexOf('function mkLogo(');
  const body = SRC.slice(at, at + 3000);
  assert.match(body, /if \(IATA_TO_WORDMARK\[c\]\) \{/, 'the wordmark branch must still come first');
  assert.match(body, /if \(IATA_TO_EMBLEM\[c\]\) \{/, 'and read IATA_TO_EMBLEM for the tile');
});

test("the light banner gets the colour mark, on the same canvas as the white one", () => {
  // Canadian North's own banner is white. The only mark it had was the white
  // lockup meant for dark bands, so it came out washed instead of red and
  // grey. The colour file is the same artwork and must sit on the same
  // cropped canvas, or it drowns in its own box the way the white one did
  // before v23765.
  const at = SRC.indexOf('var BANNER_LIGHT_LOGO = {');
  assert.ok(at >= 0);
  const T = SRC.slice(at, at + 4000);
  assert.match(T, /'5T':\s*\{ src: '\/logos\/airlines\/canadian-regional\/canadian-north\.svg', h: 60, w: 560 \}/);
  assert.match(T, /'MPE':\s*\{ src: '\/logos\/airlines\/canadian-regional\/canadian-north\.svg'/);
  const colour = fs.readFileSync(path.join(DIR, 'canadian-north.svg'), 'utf8');
  const white = fs.readFileSync(path.join(DIR, 'canadian-north-monochrome-white.svg'), 'utf8');
  const vb = (s) => (/viewBox="([^"]+)"/.exec(s) || [])[1];
  assert.equal(vb(colour), vb(white), 'both lockups must share the cropped canvas');
  assert.doesNotMatch(colour, /\s(width|height)="\d/, 'no width/height pair to letterbox it inside its own box');
  assert.match(colour, /#cd163f/i, 'the colour file keeps its red');
});

test('a tile is never white-forced on the Welcome card', () => {
  // The Welcome slide's fallback logo is the carrier's tile, drawn through
  // the ad renderer's white-force filter — which turns a coloured square
  // into a white one. The rule is the board's usual one: a file from
  // /logos/airline-tiles/ is a finished tile and is never filtered. Held for
  // every tile carrier at once, so the next one added is not the next
  // white square.
  const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
  const at = CSS.lastIndexOf('TILES ARE NEVER WHITE-FORCED ON THE WELCOME CARD');
  assert.ok(at >= 0, 'the exemption block must exist');
  // bounded to this block: the stylesheet is append-only, so the next
  // versioned block header ends it
  const end = CSS.indexOf('\n/* ═', at);
  const rules = CSS.slice(at, end > at ? end : undefined).replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = [...rules.matchAll(/^html[^{]*?(?=\s*[{,])/gm)].map((m) => m[0]);
  assert.ok(sels.length >= 3, 'the exemption must cover the gate ad logo and the ad renderer image');
  for (const s of sels) {
    assert.match(s, /\[src\*="\/logos\/airline-tiles\/"\]/, `"${s.slice(-60)}" must key on the tiles folder`);
    assert.ok((s.match(/:not\(#_\)/g) || []).length >= 14, 'must outrank the ×12 per-airline exemption');
  }
  assert.match(rules, /filter: none !important;/);
  // and every tile carrier the Welcome card can fall back to is covered by
  // it, because the rule keys on the folder and not on a name
  const EMBLEM_FILES = table('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {');
  const tiles = Object.entries(EMBLEM_FILES).filter(([, f]) => typeof f === 'string' && f.includes('/logos/airline-tiles/'));
  assert.ok(tiles.length >= 6, `expected the tile carriers (5T, 4N, NZ, QR, 8P, MO…), found ${tiles.length}`);
  assert.ok(tiles.some(([c]) => c === '5T'), "Canadian North's orb tile is one of them");
});
