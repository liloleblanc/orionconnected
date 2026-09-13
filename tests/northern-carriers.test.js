'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23765 — THE NORTHERN REGIONALS: Calm Air, Canadian North, Air North.
//
// All three were reported as having artwork that never showed. Two of the
// three findings were not what the report implied, and both are held here so
// the distinction survives.
//
//   AN ICAO BELONGING TO THE WRONG AIRLINE. MPE is Canadian North. It was
//   mapped to MP — Martinair — whose ICAO is MPH, a value that sits in
//   FILTER_OUT's cargo list a few lines away. Nothing failed, because no
//   adapter emits MPE today; it simply waited for one that did, on the
//   largest carrier at Yellowknife.
//
//   A MARK DROWNING IN ITS OWN CANVAS. The banner caps logo HEIGHT, so empty
//   canvas scales with the artwork. Canadian North's lockup filled 23% of its
//   box where its two neighbours fill about 90% — it was not missing, it was
//   rendering at a third of the size and reading as absent.
//
// What is NOT a bug, and is asserted here so it is not "fixed" later: these
// carriers get no separate banner emblem, because BANNER_DARK_LOGO hands them
// a full LOCKUP — symbol and wordmark together. Drawing an emblem beside it
// would print the symbol twice, the same duplication the wordmark table
// refuses for Qatar and SWISS.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const LOGOS = path.join(ROOT, 'fids-current', 'logos');

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

const CALLSIGN = table('const CALLSIGN_ICAO = {');
const TILES = table('const IATA_TO_TILE_ICAO = {');

test('MPE resolves to Canadian North, not to Martinair', () => {
  // Martinair is MPH, which FILTER_OUT already carries as cargo. MPE is
  // Canadian North's own ICAO, and it is the largest carrier at Yellowknife.
  assert.equal(CALLSIGN['MPE'], '5T',
    'a Canadian North flight under its own ICAO would wear another airline\'s brand');
  assert.notEqual(CALLSIGN['MPE'], 'MP', 'MP is Martinair');
});

test('no carrier tile is filed under a different airline\'s ICAO', () => {
  // Calm Air's tile was MPE.svg — Canadian North's ICAO — and worked only
  // because one mapping pointed at it. Giving 5T a tile under its real code
  // would then have handed it Calm Air's monogram.
  assert.equal(TILES['MO'], 'CAV', "Calm Air's tile must sit under its own ICAO");
  const cav = path.join(LOGOS, 'airline-tiles', 'CAV.svg');
  assert.ok(fs.existsSync(cav), 'CAV.svg must exist');
  assert.ok(!fs.existsSync(path.join(LOGOS, 'airline-tiles', 'MPE.svg')),
    'MPE.svg must be gone — the name now belongs to a different carrier');
  // and nothing may point a tile at an ICAO the callsign map assigns elsewhere
  for (const [iata, icao] of Object.entries(TILES)) {
    const owner = CALLSIGN[icao];
    if (owner && owner !== iata) {
      assert.fail(`${iata} takes tile ${icao}.svg, but CALLSIGN_ICAO says ${icao} is ${owner}`);
    }
  }
});

test('the banner lockup fills its band instead of drowning in blank canvas', () => {
  // The banner caps HEIGHT, so padding inside the file scales with the mark.
  // A viewBox far larger than the artwork shrinks it; a width/height pair
  // whose aspect disagrees with the viewBox letterboxes it on top of that.
  const f = path.join(LOGOS, 'airlines', 'canadian-regional', 'canadian-north-monochrome-white.svg');
  const s = fs.readFileSync(f, 'utf8');
  const vb = /viewBox="([^"]+)"/.exec(s);
  assert.ok(vb, 'needs a viewBox');
  const [x, y, w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
  // measured with getBBox() on the live DOM: the art is 901.61 x 171.15 at 0,0
  assert.ok(Math.abs(x) < 1 && Math.abs(y) < 1,
    `viewBox origin ${x},${y} is offset from the artwork, which pads the mark`);
  assert.ok(w < 950 && h < 200,
    `viewBox ${w}x${h} is far larger than the 901.61x171.15 the artwork occupies`);
  const wa = /\swidth="([\d.]+)"/.exec(s), ha = /\sheight="([\d.]+)"/.exec(s);
  if (wa && ha) {
    const attrAspect = Number(wa[1]) / Number(ha[1]);
    assert.ok(Math.abs(attrAspect - w / h) < 0.3,
      `width/height assert aspect ${attrAspect.toFixed(2)} but the viewBox is ` +
      `${(w / h).toFixed(2)} — the mark gets letterboxed inside its own box`);
  }
});

test('these carriers keep a lockup in the banner and no second emblem', () => {
  // Asserted so it is not mistaken for the bug and "fixed". BANNER_DARK_LOGO
  // gives each of them symbol AND wordmark in one file, so the suppressed
  // emblem beside it is correct — drawing it would print the symbol twice.
  const at = SRC.indexOf('BANNER_DARK_LOGO');
  assert.ok(at >= 0, 'BANNER_DARK_LOGO must exist');
  const body = SRC.slice(at, at + 2600);
  for (const code of ['MO', '5T', '4N']) {
    assert.match(body, new RegExp(`'${code}'\\s*:`), `${code} should still take a banner lockup`);
  }
});
