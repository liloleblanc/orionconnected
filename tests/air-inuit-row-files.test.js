'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24069 — AIR INUIT'S LOGO ON QUÉBEC CITY'S ROWS: NO FILE THAT IS NOT THERE.
//
// The Québec City board (v24067) asked for /logos/airinuit-wordmark-light.svg
// and /logos/airinuit-wordmark-dark.svg and got two 404s. Neither is a file
// anyone drew: Air Inuit's lettering is filed under its own names
// (airinuit-monochrome-white.svg for a dark ground, airinuit.svg in its
// colours for a light one), registered in WORDMARK_RASTER, which wordmarkSrc
// reads for the wall board's rows. The phone's flight cards (mkCardLogo, the
// list the board renders beside its table) built '<base>-wordmark-<ink>.svg'
// by hand, so they fell back to the typed name after two failed requests;
// the old gate banner path did the same with '-wordmark-dark'. Both take the
// carrier's registered files now — the same art as the rows — and no new art
// was made: every file named here is already in the repository.
//
// The rows themselves (mkLogo: the AIE tile; wordmarkSrc: the lettering)
// already resolved; this holds them to files on disk too.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'fids-current');
const CORE = fs.readFileSync(path.join(PUB, 'js/fids-core.js'), 'utf8');

function blockOf(head, from) {
  const at = CORE.indexOf(head, from || 0);
  assert.ok(at >= 0, `fids-core.js must define ${head}`);
  let d = 0;
  for (let k = CORE.indexOf('{', at); k < CORE.length; k++) {
    const c = CORE[k];
    if (c === "'" || c === '"' || c === '`') { for (k++; k < CORE.length && CORE[k] !== c; k++) if (CORE[k] === '\\') k++; continue; }
    if (c === '/' && CORE[k + 1] === '/') { k = CORE.indexOf('\n', k); continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return CORE.slice(at, k + 1); }
  }
  assert.fail(`unterminated ${head}`);
}
const table = (head) => 'var ' + blockOf(head).slice(head.indexOf(' ') + 1) + ';';
const onDisk = (src) => fs.existsSync(path.join(PUB, String(src).split('?')[0]));

// The board's logo tables and the two builders, in one context
function logos(dark) {
  const src = [
    table('const IATA_TO_WORDMARK = {'), table('const WORDMARK_RASTER = {'), table('const COLOR_WORDMARKS = {'),
    table('const LOGO_SUBFOLDER = {'), table('const IATA_TO_TILE_ICAO = {'), table('const HARDCODED_LOGOS = {'),
    'var AIRLINE_NAME = { "3H": "Air Inuit" };', 'var LOCAL_LOGOS = {};', 'var FIDS_BUILD_TAG = "test";',
    blockOf('function logoPath(basename)'),
    blockOf('function wordmarkSrc(base, forceVariant)'),
    'function wordmarkVariant() { return "light"; }',
    'function wwayUrl() { return "https://img.wway.io/x"; }',
    blockOf('function mkCardLogo(code, airlineName)'),
    'this.out = { mkCardLogo: mkCardLogo, wordmarkSrc: wordmarkSrc, IATA_TO_WORDMARK: IATA_TO_WORDMARK, WORDMARK_RASTER: WORDMARK_RASTER, IATA_TO_TILE_ICAO: IATA_TO_TILE_ICAO };'
  ].join('\n');
  const ctx = { window: { matchMedia: () => ({ matches: !!dark }) } };
  vm.runInNewContext(src, ctx);
  return ctx.out;
}
// the two files a card's <img> asks for: its src, then its onerror's second try
function cardFiles(html) {
  const main = /src="([^"]+)"/.exec(html);
  const alt = /this\.src='([^']+)'/.exec(html);
  return [main && main[1], alt && alt[1]].filter(Boolean);
}

test('Air Inuit\'s phone cards ask for its own files, by day and by night', () => {
  for (const dark of [false, true]) {
    const L = logos(dark);
    const files = cardFiles(L.mkCardLogo('3H', 'Air Inuit'));
    assert.equal(files.length, 2, 'a file and its other ink: ' + files);
    for (const f of files) assert.ok(onDisk(f), (dark ? 'dark' : 'light') + ' phone: ' + f + ' is in the repository');
    // white lettering on a dark card, the colours on a light one
    assert.equal(files[0], dark ? L.WORDMARK_RASTER.airinuit.light : L.WORDMARK_RASTER.airinuit.dark);
    assert.ok(!files.some((f) => /airinuit-wordmark-(light|dark)\.svg$/.test(f) && f.startsWith('/logos/airinuit')), 'never the hand-built name');
  }
});

test('every carrier filed in WORDMARK_RASTER: the card and the row ask for files that exist', () => {
  const L = logos(false);
  const codes = Object.keys(L.IATA_TO_WORDMARK).filter((c) => L.WORDMARK_RASTER[L.IATA_TO_WORDMARK[c]]);
  assert.ok(codes.includes('3H'), 'Air Inuit is one of them');
  for (const dark of [false, true]) {
    const M = logos(dark);
    for (const c of codes) for (const f of cardFiles(M.mkCardLogo(c, c))) assert.ok(onDisk(f), c + ': ' + f);
  }
  for (const c of codes) for (const v of ['light', 'dark']) {
    const f = L.wordmarkSrc(L.IATA_TO_WORDMARK[c], v);
    assert.ok(onDisk(f), c + ' row ' + v + ': ' + f);
  }
  // the row's emblem: the AIE tile
  assert.equal(L.IATA_TO_TILE_ICAO['3H'], 'AIE');
  assert.ok(onDisk('/logos/airline-tiles/AIE.svg'));
});

test('the old gate banner path takes the registered colour file too', () => {
  const at = CORE.indexOf('const _wmBase = IATA_TO_WORDMARK[bannerLogoCode];');
  assert.ok(at > 0);
  const seg = CORE.slice(at, at + 900);
  assert.match(seg, /const _localWordmark = \(typeof WORDMARK_RASTER !== 'undefined' && WORDMARK_RASTER\[_wmBase\]\)\n\s*\? WORDMARK_RASTER\[_wmBase\]\.dark/);
});
