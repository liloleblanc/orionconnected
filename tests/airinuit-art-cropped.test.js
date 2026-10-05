'use strict';

// WHY THIS EXISTS
//
// On the YUL departures board, Air Inuit's row drew its two-line lockup
// (syllabics over "Air Inuit") smaller than one line of every other
// carrier's lettering beside it. Its files sat on a 480x320 canvas with the
// art in the middle (about 55-425 x 75-245), so a quarter of each side was
// empty and every surface that sized the file drew the art at about half the
// size it asked for: the row's 40px became a lockup about 20px tall, and the
// row's ceiling cut that further. The cut the "Operated by" line and the
// Welcome card draw (airinuit-wordmark-light.svg) had been cropped already;
// the others were not. And the '-black' cut drew nothing at all: its
// luminance mask had been recoloured black with the letters, which masks
// everything out.
//
// Every Air Inuit file the board names is cropped to its art now, and the row
// sizes it as the lockup it is: WestJet's height.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'fids-current');
const read = (p) => fs.readFileSync(path.join(PUB, p), 'utf8');

/** Every Air Inuit file a board surface names. */
function airInuitFiles() {
  const found = new Set();
  for (const f of ['js/fids-core.js', 'js/shared-names.js', 'app.html', 'css/display-overrides.css']) {
    for (const m of read(f).matchAll(/\/logos\/airlines\/canadian-regional\/airinuit[\w-]*\.svg/g)) found.add(m[0]);
  }
  return [...found].sort();
}

/** The numbers of an absolute-command path, as [x, y] points (H and V too). */
function pathPoints(d) {
  assert.doesNotMatch(d, /[a-y]/, 'absolute commands only (the measure below reads coordinates as they are)');
  const pts = [];
  let x = 0, y = 0;
  for (const seg of d.match(/[A-Z][^A-Z]*/g)) {
    const cmd = seg[0];
    const n = (seg.slice(1).match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
    if (cmd === 'H') { for (const v of n) { x = v; pts.push([x, y]); } }
    else if (cmd === 'V') { for (const v of n) { y = v; pts.push([x, y]); } }
    else if (cmd !== 'Z') { for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; pts.push([x, y]); } }
  }
  return pts;
}

/** The art's box: its paths' points, clipped by the mask rectangle. */
function artBox(svg) {
  const mask = (svg.match(/<mask\b[\s\S]*?<\/mask>/) || [''])[0];
  const art = svg.replace(mask, '');
  const box = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)],
    [Infinity, Infinity, -Infinity, -Infinity]);
  let b = box([...art.matchAll(/ d="([^"]+)"/g)].flatMap((m) => pathPoints(m[1])));
  const md = mask.match(/ d="([^"]+)"/);
  if (md) {
    const c = box(pathPoints(md[1]));
    b = [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.min(b[2], c[2]), Math.min(b[3], c[3])];
  }
  return b;
}

test('the board names every Air Inuit cut it draws, and each is on disk', () => {
  const files = airInuitFiles();
  for (const f of ['airinuit.svg', 'airinuit-monochrome-white.svg', 'airinuit-monochrome-black.svg', 'airinuit-wordmark-light.svg']) {
    assert.ok(files.includes('/logos/airlines/canadian-regional/' + f), f + ' is one of the board\'s files');
  }
  for (const f of files) assert.ok(fs.existsSync(path.join(PUB, f)), f);
});

test('every Air Inuit cut is cropped to its art: no empty band around the lockup', () => {
  for (const f of airInuitFiles()) {
    const svg = fs.readFileSync(path.join(PUB, f), 'utf8');
    const vb = (svg.match(/viewBox="([^"]+)"/) || [, ''])[1].split(/[\s,]+/).map(Number);
    assert.equal(vb.length, 4, f + ' has a viewBox');
    const [ax0, ay0, ax1, ay1] = artBox(svg);
    // the art is inside the box (nothing cut off) ...
    assert.ok(ax0 >= vb[0] - 0.01 && ay0 >= vb[1] - 0.01 && ax1 <= vb[0] + vb[2] + 0.01 && ay1 <= vb[1] + vb[3] + 0.01,
      f + ': the art runs out of its box');
    // ... and fills it: the 480x320 canvas left the art 77% of the width and
    // 53% of the height
    const w = (ax1 - ax0) / vb[2], h = (ay1 - ay0) / vb[3];
    assert.ok(w >= 0.95, `${f}: the art fills ${(w * 100).toFixed(1)}% of the box's width`);
    assert.ok(h >= 0.93, `${f}: the art fills ${(h * 100).toFixed(1)}% of the box's height`);
    // a stated size has the box's own shape, so nothing letterboxes it again
    const W = svg.match(/<svg\b[^>]*\swidth="([\d.]+)"/), H = svg.match(/<svg\b[^>]*\sheight="([\d.]+)"/);
    if (W && H) assert.ok(Math.abs((+W[1] / +H[1]) / (vb[2] / vb[3]) - 1) < 0.005, f + ': its width and height are the viewBox\'s shape');
  }
});

test('every cut draws: a luminance mask is white, never recoloured with the letters', () => {
  for (const f of airInuitFiles()) {
    const svg = fs.readFileSync(path.join(PUB, f), 'utf8');
    const mask = svg.match(/<mask\b[^>]*mask-type:luminance[\s\S]*?<\/mask>/);
    if (!mask) continue;
    for (const m of mask[0].matchAll(/fill="([^"]+)"/g)) {
      assert.match(m[1], /^(white|#fff|#ffffff)$/i, f + ': a ' + m[1] + ' luminance mask hides the whole lockup');
    }
  }
});

test('the colour cut keeps its colours: vermilion syllabics, dark "Air Inuit"', () => {
  const svg = read('logos/airlines/canadian-regional/airinuit.svg');
  const mask = (svg.match(/<mask\b[\s\S]*?<\/mask>/) || [''])[0];
  const fills = [...svg.replace(mask, '').matchAll(/fill="([^"]+)"/g)].map((m) => m[1].toUpperCase()).filter((v) => v !== 'NONE');
  assert.deepEqual([...new Set(fills)].sort(), ['#231F20', '#F1471D']);
});

test('the row sizes the lockup as the lockup it is: WestJet\'s height on every table', () => {
  // display-overrides.css governs the board's row (--wm-h); the three tables
  // that mirror it (desktop board, belts, phone cards) carry 3H in WestJet's
  // group, not in Air Canada's one-line group it sat in.
  const ovr = read('css/display-overrides.css');
  const wmh = (code) => {
    const m = ovr.match(new RegExp('\\[data-code="' + code + '"\\][^{]*\\{\\s*--wm-h:\\s*(\\d+)px'));
    return m ? +m[1] : NaN;
  };
  assert.equal(wmh('3H'), wmh('WS'), 'Air Inuit at WestJet\'s height on the row');
  for (const [file, sel] of [['css/flight-display.css', '#fidsTable .td-airline .fids-airline-wordmark'],
    ['css/baggage-display.css', '.bidsv2-airline-wordmark'], ['css/fids.css', '.card-logo.card-wordmark']]) {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    const groupOf = (code) => {
      const at = src.indexOf(sel + '[data-code="' + code + '"]');
      assert.ok(at >= 0, file + ' sizes ' + code);
      const m = src.slice(at).match(/\{\s*height:\s*(\d+)px/);
      return m ? +m[1] : NaN;
    };
    assert.equal(groupOf('3H'), groupOf('WS'), file + ': Air Inuit beside WestJet');
    assert.notEqual(groupOf('3H'), groupOf('AC'), file + ': not Air Canada\'s one-line height');
  }
});
