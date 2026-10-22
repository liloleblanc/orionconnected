'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24079 — A ROUND EMBLEM THAT WAS NEVER DRAWN FALLS TO THE ROW TILE, THEN
// TO THE LETTERS, ON EVERY SURFACE THAT ASKS _airlineOrbEmblem.
//
// The resolver hands back /logos/symbols/airlines/XX.svg for any two-letter
// code whether or not that file exists. Alaska (AS) has no AS.svg: during the
// gate's map takeover (SEA gate N20, AS63) the right column's brand hold
// printed 'AS' on a disc, while the header, the aircraft plate and the flight
// orb beside it all wore Alaska's own tile, ASA.svg. Its miss went straight to
// the letters; the plate's goes to the tile first (_holdArtFailed, v23440) and
// every round orb's does too (_orbArtFailed, v23388). The gate-change notice's
// orb hid itself on a miss and left an empty disc.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'fids-current');
const CORE = fs.readFileSync(path.join(SITE, 'js', 'fids-core.js'), 'utf8');

// the source of one top-level function, by name
function fn(name) {
  const at = CORE.indexOf('\nfunction ' + name + '(');
  assert.ok(at >= 0, 'no function ' + name);
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) return CORE.slice(at + 1, i + 1);
  }
  throw new Error('no end for ' + name);
}
const TILES = (() => {
  const m = /\nconst IATA_TO_TILE_ICAO = (\{[\s\S]*?\n\});/.exec(CORE);
  assert.ok(m, 'the tile table');
  return vm.runInNewContext('(' + m[1] + ')');
})();

test('Alaska: no symbol was ever drawn, and its row tile is on disk', () => {
  assert.equal(fs.existsSync(path.join(SITE, 'logos/symbols/airlines/AS.svg')), false, 'the resolver\'s guess misses for AS');
  assert.equal(TILES.AS, 'ASA');
  assert.ok(fs.existsSync(path.join(SITE, 'logos/airline-tiles/ASA.svg')), 'the tile the fallback lands on');
});

test('the map takeover\'s brand hold tries the tile before the letters', () => {
  const at = CORE.indexOf("var _mapLifeHtml = _mapLifeSrc");
  assert.ok(at > 0);
  const html = CORE.slice(at, CORE.indexOf(';', CORE.indexOf("'<span class=\"v2-rc-map-life-code\">'", at)) + 1);
  assert.match(html, /class="v2-rc-map-life-emblem" src="' \+ _mapLifeSrc \+ '" alt="" onerror="window\._holdArtFailed\(this,\\'' \+ _orbMono\(_mapLifeCode\) \+ '\\'\)"/);
  assert.doesNotMatch(html, /nextElementSibling\.style\.display/, 'no longer straight to the letters');
  // _holdArtFailed: the tile once, then the letters beside it
  const hold = CORE.slice(CORE.indexOf('window._holdArtFailed = function'), CORE.indexOf('window._orbArtFailed = function'));
  assert.match(hold, /IATA_TO_TILE_ICAO\[code\]/);
  assert.match(hold, /img\.src = '\/logos\/airline-tiles\/' \+ icao \+ '\.svg'; return;/);
  assert.match(hold, /var sib = img\.nextElementSibling;\s*if \(sib\) sib\.style\.display = '';/);
});

test('the gate-change notice\'s orb tries the tile, then the letters, never an empty disc', () => {
  const src = fn('_gateChangeOrbHtml');
  assert.match(src, /onerror="window\._orbArtFailed\(this,&quot;' \+ _orbMono\(c\) \+ '&quot;\)"/);
  assert.doesNotMatch(src, /onerror="this\.style\.display/, 'no longer hides itself');
});

test('every image built from _airlineOrbEmblem in the gate code has a tile tier on its miss', () => {
  // the call sites that put the resolver's answer in an <img>: each one's
  // onerror goes through a handler that tries IATA_TO_TILE_ICAO first
  const sites = ['_mapLifeSrc', '_holdSrc', '_fallbackSrc', '_mcOrbSrc', '_niOrbSrc'];
  for (const v of sites) {
    const re = new RegExp("src=\"' \\+ " + v + " \\+ '\"[^\\n]*?onerror=\"window\\._(orb|hold)ArtFailed\\(this,");
    assert.match(CORE, re, v);
  }
});
