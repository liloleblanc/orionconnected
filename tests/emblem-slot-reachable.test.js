'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23769 — AN EMBLEM THE ROW CANNOT REACH IS AN EMBLEM THAT IS NOT THERE.
//
// Two maps hold the same artwork for two different surfaces:
//
//   AIRLINE_EMBLEM_FILES  — the gate ORB reads this one.
//   IATA_TO_EMBLEM / IATA_TO_TILE_ICAO — the board ROW and the BIDS cell read
//                           these, through mkLogo().
//
// mkLogo() takes an early branch for any carrier that has a wordmark: show the
// square tile beside it, or nothing. That branch consults ONLY the second pair
// of maps, and ends in a bare `return ''`. So a carrier registered in the first
// map and absent from the second gets a healthy orb, a resolving URL, a 200 on
// the file — and an empty slot in the row. Every probe says the artwork is
// fine, because on the surface the probe asks about it is.
//
// This has now landed four times: LY (v23372, whose note above IATA_TO_EMBLEM
// describes it), then 4N, 8P and SP together. Three of those were reported as
// artwork "not being used", and the wrong thing was verified each time.
//
// So this walks the whole map instead of the carriers known about today.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const WEB = path.join(ROOT, 'fids-current');

/** Evaluate a brace-matched object literal out of the source. */
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

const EMBLEM_FILES = table('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {');
const WORDMARK = table('const IATA_TO_WORDMARK = {');
const EMBLEM = table('const IATA_TO_EMBLEM = {');
const TILE = table('const IATA_TO_TILE_ICAO = {');

// mkLogo() is called with the IATA code off the flight, so three-letter ICAO
// aliases in these maps are reached only as a fallback and never hit the
// early branch. Checking them too would report carriers that in fact render.
const isIata = (c) => /^[A-Z0-9]{2}$/.test(c);

test('mkLogo still ends its wordmark branch in a bare return', () => {
  // The whole premise. If this branch ever grows a fallback to
  // AIRLINE_EMBLEM_FILES, the assertion below stops describing a real failure
  // and should be retired rather than left passing for the wrong reason.
  const at = SRC.indexOf('function mkLogo(');
  assert.ok(at >= 0, 'mkLogo must exist');
  const body = SRC.slice(at, at + 3000);
  assert.match(body, /return ''; \/\/ no tile, wordmark alone/,
    'the empty-slot branch this test guards is gone — re-read mkLogo');
  assert.doesNotMatch(body.slice(0, body.indexOf("return ''; // no tile")),
    /_AIRLINE_EMBLEM_FILES/,
    'if the wordmark branch now reads the orb map, this test is obsolete');
});

test('every carrier with a tile and a wordmark can reach it from the row', () => {
  const stranded = [];
  for (const code of Object.keys(EMBLEM_FILES)) {
    if (!isIata(code)) continue;
    const file = EMBLEM_FILES[code];
    if (typeof file !== 'string') continue;
    // Only square TILES — the folder is the treatment. A symbol filed
    // elsewhere is a different decision and not what mkLogo's tile slot wants.
    if (!file.includes('/logos/airline-tiles/')) continue;
    if (!WORDMARK[code]) continue;           // no wordmark → never takes the early branch
    if (EMBLEM[code] || TILE[code]) continue; // reachable
    stranded.push(`${code} → ${file}`);
  }
  assert.deepEqual(stranded, [],
    'these carriers have a tile the gate orb draws and the row cannot:\n  ' +
    stranded.join('\n  ') +
    '\nadd each to IATA_TO_EMBLEM with the same path');
});

test('the three carriers this shipped for resolve to files that exist', () => {
  for (const code of ['4N', '8P', 'SP']) {
    const p = EMBLEM[code];
    assert.ok(p, `${code} must be in IATA_TO_EMBLEM`);
    assert.ok(fs.existsSync(path.join(WEB, p.replace(/^\//, '').split('?')[0])),
      `${code} points at ${p}, which is not on disk`);
    // The path is what earns the tile treatment; naming the copy under
    // logos/airlines/ instead would hand a full-bleed square an accent disc
    // and a brightness(0) invert(1), flattening it to a white blob.
    assert.match(p, /\/logos\/airline-tiles\//,
      `${code} must keep the airline-tiles path, which is what isTile keys on`);
  }
});

test('pairing a tile with a wordmark cannot print the name twice', () => {
  // The tile sits BESIDE the wordmark image. A tile carrying its own lettering
  // would render the carrier's name twice in one cell — the duplication the
  // wordmark table refuses for Qatar and SWISS.
  for (const code of ['4N', '8P', 'SP']) {
    const svg = fs.readFileSync(
      path.join(WEB, EMBLEM[code].replace(/^\//, '').split('?')[0]), 'utf8');
    assert.doesNotMatch(svg, /<text[\s>]|<textPath[\s>]/,
      `${code}'s tile contains live text, so pairing it repeats the name`);
  }
});

test("Air North's banner is left alone, because its lockup already has the mark", () => {
  // BANNER_DARK_LOGO wins before _bannerWmFromBase is ever set, so the banner
  // never reads IATA_TO_EMBLEM for 4N. Asserted so the entry added here is not
  // later "completed" by dropping 4N from that table, which would put the
  // symbol in the band twice.
  const at = SRC.indexOf('var BANNER_DARK_LOGO = {');
  assert.ok(at >= 0);
  const body = SRC.slice(at, at + 2600);
  assert.match(body, /'4N'\s*:/, '4N should keep its stacked banner lockup');
  // and that lockup really is symbol-over-wordmark: the wordmark file is the
  // lower band of the same artwork, cropped.
  const full = fs.readFileSync(path.join(WEB,
    'logos/airlines/canadian-regional/airnorth-monochrome-white.svg'), 'utf8');
  const crop = fs.readFileSync(path.join(WEB,
    'logos/airlines/canadian-regional/airnorth-wordmark-light.svg'), 'utf8');
  const vb = (s) => /viewBox="([^"]+)"/.exec(s)[1].trim().split(/[\s,]+/).map(Number);
  const [, fy, fw, fh] = vb(full);
  const [, cy, cw, ch] = vb(crop);
  assert.ok(Math.abs(fw - cw) < 2,
    'the wordmark should be the same width as the lockup it is cropped from');
  assert.ok(cy > fy + fh * 0.3,
    'the wordmark should start well down the lockup, with the symbol above it');
  assert.ok(ch < fh,
    'the wordmark crop must be shorter than the full lockup');
});
