'use strict';

// ══════════════════════════════════════════════════════════════════════════
// ARAJET (DM) HAS ITS OWN EMBLEM, LETTERING AND COLOURS
//
// The boards knew the airline by name only: its gate orb printed the letters
// DM on the generic blue. A set of artwork was supplied and is used as it
// came, each shape with its own colour written on it:
//   · the tile, /logos/airline-tiles/DWI.svg: its macaw on the purple of the
//     airline. The supplied canvas was 965.31 x 962.37 with a hairline round
//     the square; the frame is the largest square inside that hairline.
//   · the lettering, purple for light grounds and white for dark grounds,
//     one frame for both.
//   · the colour lockup, so that no path fetches outside art for the code.
// Its colours are the purples and the yellow of that emblem, with the pale
// tint and the dark purple of the airline's own site.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORE = read('fids-current/js/fids-core.js');
const SHARED = read('fids-current/js/shared-names.js');
const COLORS = read('fids-current/data/airline-colors.js');
const DIR = 'fids-current/logos/airlines/asian-other/';
const fills = (s) => (s.match(/fill="#[0-9A-F]{6}"/g) || []);

test('the tile: a square frame inside the hairline of the supplied canvas, the purple ground first', () => {
  const t = read('fids-current/logos/airline-tiles/DWI.svg');
  const vb = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(t).slice(1).map(Number);
  assert.equal(vb[2], vb[3], 'square');
  // the ground is a rect from .66 to 964.64 across and .66 to 961.71 down, with a hairline 1.32 wide on its edge
  assert.ok(vb[0] >= 1.32 && vb[1] >= 1.32 && vb[0] + vb[2] <= 963.98 + 0.001 && vb[1] + vb[3] <= 961.05 + 0.001, 'the frame is inside the hairline: the ground runs to every edge');
  assert.equal(fills(t)[0], 'fill="#520E77"', 'the purple ground is the first paint');
  assert.doesNotMatch(t, /<text|<style|<image|<script|class=/i);
  assert.equal((t.match(/<path /g) || []).length, 9, 'the nine shapes of the macaw, as supplied');
});

test('the lettering: one frame, the same seven shapes, purple for light grounds and white for dark', () => {
  const dark = read(DIR + 'arajet-wordmark-dark.svg'), light = read(DIR + 'arajet-wordmark-light.svg');
  const frame = (s) => /viewBox="([^"]+)"/.exec(s)[1];
  assert.equal(frame(dark), frame(light));
  const shapes = (s) => (s.match(/ d="[^"]+"/g) || []);
  assert.equal(shapes(dark).length, 7);
  assert.deepEqual(shapes(dark).slice().sort(), shapes(light).slice().sort(), 'the same letters');
  assert.deepEqual([...new Set(fills(light))], ['fill="#FFFFFF"'], 'white lettering, nothing behind it');
  assert.ok(fills(dark).every((f) => /fill="#5[0-9A-F]{5}"/.test(f)), 'the purples of the airline');
  for (const s of [dark, light, read(DIR + 'arajet.svg')]) assert.doesNotMatch(s, /<text|<style|<image|<script|<rect|class=/i, 'shapes only: no style block to leak, no plate behind the letters');
});

test('every surface reaches the artwork, and the colours are in the three tables', () => {
  assert.match(CORE, /\n  'DM':'DWI',   \/\/ v24150/, 'IATA_TO_TILE_ICAO');
  assert.match(CORE, /\n        'DM':  '\/logos\/airline-tiles\/DWI\.svg',/, 'AIRLINE_EMBLEM_FILES: the tile path, so the orb draws it whole');
  assert.match(CORE, /\n  'DM':'arajet',         \/\/ v24150/, 'IATA_TO_WORDMARK');
  assert.ok(CORE.includes("'arajet-wordmark-light.svg':'airlines/asian-other', 'arajet-wordmark-dark.svg':'airlines/asian-other', 'arajet.svg':'airlines/asian-other',"), 'LOGO_SUBFOLDER');
  assert.match(CORE, /\n  'DM': '\/logos\/airlines\/asian-other\/arajet\.svg',/, 'LOCAL_LOGOS');
  assert.ok(SHARED.includes('"DM":"/logos/airline-tiles/DWI.svg"'), 'FIDS_SHARED_TILE');
  assert.ok(SHARED.includes('"DM": [\n"/logos/airlines/asian-other/arajet-wordmark-dark.svg",\n"/logos/airlines/asian-other/arajet-wordmark-light.svg"\n]'), 'FIDS_SHARED_WORDMARK');
  assert.match(CORE, /\n  'DM':'#520E77',   \/\/ v24150/, 'AIRLINE_ACCENT is the ground of the tile');
  assert.match(CORE, /\n  'DM': \{ bg1:'#520E77', bg2:'#370850', bg3:'#733C90', accent:'#FEC404', name:'Arajet' \},/, 'AIRLINE_BRAND');
  assert.match(COLORS, /'DM': \{ r1:'#520E77', r1Text:'#FFFFFF', r2:'#733C90', r3:'#FEC404', body:'#F6F3F8', bodyText:'#370850' \}, \/\/ Arajet/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/logos/symbols/airlines/DM.svg')), 'nothing shadows the tile');
});
