'use strict';

// ══════════════════════════════════════════════════════════════════════════
// AIR CREEBEC (YN) HAS ITS OWN EMBLEM AND COLOURS
//
// The boards knew the airline by name only: its rows drew a monogram or a
// third-party picture, its gate wore the generic blue and its orb printed
// the letters YN. It now has:
//   · a tile, /logos/airline-tiles/CRQ.svg: the supplied emblem (a goose
//     taking off over a stretched hide, three bands of sunset), every path
//     as supplied, in its own colours, on a square of the peach of the
//     supplied palette. The emblem is black: it is never inked white, and
//     it is never set on a dark ground.
//   · the supplied palette in the three colour tables: cream #FCF8E3,
//     peach #FDD49A, near black #272626.
//   · its airCreebec lettering, as supplied, black for light grounds and white
//     for dark grounds (the Welcome card, the rows of a dark board).
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
const TILE = read('fids-current/logos/airline-tiles/CRQ.svg');

test('the tile: square, the peach ground first, the seven supplied shapes in their own four colours', () => {
  assert.match(TILE, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 400 400">/);
  const fills = (TILE.match(/fill="#[0-9A-F]{6}"/g) || []);
  assert.equal(fills[0], 'fill="#FDD49A"', 'the ground is the first paint: a colour, not a white, grey or black square');
  assert.deepEqual([...new Set(fills.slice(1))].sort(), ['fill="#231F20"', 'fill="#ED2124"', 'fill="#F47D2B"', 'fill="#FFCA28"']);
  assert.equal(fills.length, 8, 'the ground and the seven shapes of the emblem');
  assert.doesNotMatch(TILE, /<text|<style|<image|<script|class=|fill="#FFFFFF"/i, 'paths only: no lettering, no style block, nothing inked white');
  // one group, one uniform scale: the emblem is placed, not redrawn
  const g = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">/.exec(TILE);
  assert.ok(g, 'the emblem is one group');
  // its farthest ink is 31.65 units from the centre of its box: inside the circle an orb crops the tile to
  assert.ok(31.65 * +g[3] <= 0.8 * 200, 'the emblem stays inside the inscribed circle');
  assert.ok(Math.abs(+g[1] + 24.85 * +g[3] - 200) < 0.5 && Math.abs(+g[2] + 21.5 * +g[3] - 200) < 0.5, 'and is centred on the tile');
});

test('every surface reaches the tile: rows and belt signs, the gate orbs, the companion app', () => {
  assert.match(CORE, /\n  'YN':'CRQ',   \/\/ v24150/, 'IATA_TO_TILE_ICAO');
  assert.match(CORE, /\n        'YN':  '\/logos\/airline-tiles\/CRQ\.svg',/, 'AIRLINE_EMBLEM_FILES: the tile path, so the orb draws it whole and never inks it white');
  assert.ok(SHARED.includes('"YN":"/logos/airline-tiles/CRQ.svg"'), 'FIDS_SHARED_TILE');
  // nothing is filed where it would be whitened or would shadow the tile
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/logos/symbols/airlines/YN.svg')));
});

test('the supplied palette is in the three colour tables, and the white figures of the gate read', () => {
  assert.match(COLORS, /'YN': \{ r1:'#FCF8E3', r1Text:'#272626', r2:'#272626', r3:'#FDD49A', body:'#FCF8E3', bodyText:'#272626' \}, \/\/ Air Creebec/);
  assert.match(CORE, /\n  'YN':'#272626',   \/\/ v24150/, 'AIRLINE_ACCENT: the near black, not the peach');
  assert.match(CORE, /\n  'YN': \{ bg1:'#272626', bg2:'#171616', bg3:'#3a3838', accent:'#FDD49A', name:'Air Creebec' \},/, 'AIRLINE_BRAND');
  const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  assert.ok(ratio('#FFFFFF', '#272626') >= 7, 'white figures on the near black of the gate tab');
  assert.ok(ratio('#272626', '#FCF8E3') >= 7, 'near-black ink on the cream bar');
  assert.ok(ratio('#FFFFFF', '#FDD49A') < 3, 'and white would not read on the peach, which is why the peach is not the accent');
});

test('its lettering: one frame, the same letters, black for light grounds and white for dark, on every surface', () => {
  const dir = 'fids-current/logos/airlines/canadian-regional/';
  const dark = read(dir + 'air-creebec-wordmark-dark.svg'), light = read(dir + 'air-creebec-wordmark-light.svg');
  const frame = (s) => /viewBox="([^"]+)"/.exec(s)[1];
  assert.equal(frame(dark), frame(light));
  const shapes = (s) => (s.match(/ d="[^"]+"/g) || []);
  assert.equal(shapes(dark).length, 10);
  assert.deepEqual(shapes(dark), shapes(light), 'the same letters');
  assert.deepEqual([...new Set(dark.match(/fill="#[0-9A-F]{6}"/g))], ['fill="#000000"']);
  assert.deepEqual([...new Set(light.match(/fill="#[0-9A-F]{6}"/g))], ['fill="#FFFFFF"'], 'white lettering, nothing behind it');
  for (const s of [dark, light]) assert.doesNotMatch(s, /<text|<style|<image|<rect|class=/);
  assert.match(CORE, /\n  'YN': 'air-creebec',     \/\/ v24150/, 'IATA_TO_WORDMARK');
  assert.match(CORE, /\n  'YN': '\/logos\/airlines\/canadian-regional\/air-creebec-wordmark-dark\.svg',/, 'LOCAL_LOGOS: no outside art');
  assert.ok(SHARED.includes('"YN": [\n"/logos/airlines/canadian-regional/air-creebec-wordmark-dark.svg",\n"/logos/airlines/canadian-regional/air-creebec-wordmark-light.svg"\n]'), 'the app');
});
