'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EVERY AIRLINE'S ART, ON EVERY SURFACE THAT DRAWS IT
//
// An audit of every airline's logos on every surface found art on disk that no
// table named, marks that vanished on their ground, lettering that was not
// lettering, and one airline printed as another. This file holds what was done
// about each (the rule that no mark comes from an outside host is held next
// door, in tests/airline-logos-own-host.test.js; the gate orbs in
// tests/gate-orbs-every-airline.test.js; the app's copies in
// tests/companion-app.test.js):
//   1. TILES ON DISK, NAMED. Each tile was opened and looked at, and named only
//      where the picture is plainly the mark of the airline. Every named tile
//      is on disk, is in the app's copy, has its ground listed for the gate
//      orbs, and is what the row draws. The tiles that were looked at and
//      refused stay unnamed, with the reason.
//   2. THE LIST OF THE TILE FOLDER (MANIFEST.csv) says what each of those
//      files holds, where it named another airline.
//   3. LETTERING ON DISK, NAMED: eleven pairs, white for dark grounds and the
//      colours of the airline for light ones, outlines only.
//   4. A SECOND CODE of an airline draws the art filed under its first.
//   5. THE BOARDING STRIP AND THE COUNTDOWN are never a bare band for a
//      carrier the row draws a mark for, never white on the white strip, and
//      never a symbol of the colour it stands on.
//   6. LETTERING THAT IS TYPED TEXT is in no table, but for one file kept in a
//      ledger with the reason.
//   7. A ROW STATE THAT SWALLOWS THE LETTERING types the name instead, and the
//      table that says which is held to a measure of every colour cut on both
//      rows, not to a list of the cases somebody noticed.
//   8. THE BELT draws no lockup in its square slots: the square mark the boarding
//      strip draws, where a table names one, else the monogram in the colour of the
//      airline; and the name.
//   9. CENTRAL MOUNTAIN AIR is an airline of its own: its name, its number.
//  10. THE WELCOME CARD knows how tall the letters of a stacked lettering are.
//  11. LETTERING AND NO MARK OF ANY KIND is a monogram, never an empty slot, and
//      Pascan under its second code draws the lettering of its first.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const FC = path.join(ROOT, 'fids-current');
const JS = path.join(FC, 'js');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
const APP = fs.readFileSync(path.join(FC, 'app.html'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(FC, 'logos/airline-tiles/MANIFEST.csv'), 'utf8');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const onDisk = (u) => !!u && fs.existsSync(path.join(FC, String(u).split('?')[0]));
const read = (u) => fs.readFileSync(path.join(FC, String(u).split('?')[0]), 'utf8');

// ── the whole board script in a page of its own (as tests/airline-names-every-row.test.js) ──
function board() {
  const nothing = (name) => new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'toString' || k === 'valueOf') return () => '';
      return nothing(name + '.' + String(k));
    },
    set() { return true; }, apply() { return nothing(name + '()'); }, construct() { return nothing('new ' + name); }, has() { return true; }
  });
  const store = {};
  const ls = { getItem: (k) => (own(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, length: 0, clear() {} };
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, localStorage: ls, sessionStorage: ls, document: nothing('document'),
    navigator: { userAgent: 'node', language: 'en' }, fetch: () => new Promise(() => {}), performance: { now: () => Date.now() },
    location: { search: '?ap=YXS', hostname: 'localhost', href: 'http://localhost/fids.html?ap=YXS', pathname: '/fids.html', origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['host-airport.js', 'board-strings.js', 'feed-router.js', 'fids-core.js', 'airport-coords.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('var __the = function (n) { return eval(n); };', ctx);
  return ctx;
}
const B = board();
const the = (n) => B.__the(n);
const plain = (o) => JSON.parse(JSON.stringify(o));
const TILE = plain(the('IATA_TO_TILE_ICAO')), WM = plain(the('IATA_TO_WORDMARK')), EMBLEM = plain(the('IATA_TO_EMBLEM'));
const NAME = plain(the('AIRLINE_NAME')), NAME2 = plain(the('_AIRLINE_NAME_OVERRIDE'));
const CODES = [...new Set([...Object.keys(NAME), ...Object.keys(NAME2)])].sort();
const SHARED = (() => { const win = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: win }); return plain(win); })();
const srcOf = (html) => (/\bsrc="([^"]*)"/.exec(String(html)) || [])[1] || '';
// the colours a drawing paints with (fills, strokes and gradient stops written as hex or by name)
const hex6 = (c) => (/^#[0-9a-f]{3}$/.test(c) ? '#' + c.slice(1).replace(/./g, '$&$&') : c);
const paints = (u) => [...new Set([...read(u).matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#[0-9a-fA-F]{3,8}|white|black)/g)].map((m) => hex6(m[1].toLowerCase())))];
// a drawing that wraps a picture paints nothing this can read
const wrapsPicture = (u) => /<image\b/.test(read(u));
const isWhite = (c) => /^(#fff|#ffffff|white)$/.test(c);
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (h) => { const m = /^#([0-9a-f]{6})$/i.exec(h); const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(m[1].substr(i, 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ── reading a picture ──────────────────────────────────────────────────────
// Three checks below ask what a file paints and where: how much of a lettering is which colour,
// how tall its lines are, and whether a mark is the colour of its ground. A drawing is read by
// the sampler the gate orbs use (scripts/orbs/tile-grounds.js): its shapes, in document order. A
// png, and a drawing that only wraps one, is decoded here. A drawing that paints a picture
// through a mask can be read by neither: MASKED names those, with what the picture was seen to
// hold (each drawn by the system viewer and looked at).
const zlib = require('node:zlib');
const GEN = require(path.join(ROOT, 'scripts/orbs/tile-grounds.js'));
const bare = (u) => String(u).split('?')[0];
function decodePng(buf) {
  assert.equal(buf.toString('latin1', 1, 4), 'PNG');
  let o = 8, w = 0, h = 0, depth = 0, type = 0, lace = 0, plte = null, trns = null;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    o += 12 + len;
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; lace = d[12]; }
    else if (kind === 'IDAT') idat.push(d); else if (kind === 'PLTE') plte = d; else if (kind === 'tRNS') trns = d;
  }
  assert.ok(depth === 8 && lace === 0 && [0, 2, 3, 4, 6].includes(type), 'a png of 8 bits, not interlaced: ' + depth + ', ' + type + ', ' + lace);
  const n = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], stride = w * n, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), at = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[at++], line = Buffer.from(raw.subarray(at, at + stride));
    at += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= n ? line[i - n] : 0, u = prev[i], c = i >= n ? prev[i - n] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? u : c); }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4, i = x * n;
      if (type === 6) line.copy(px, q, i, i + 4);
      else if (type === 2) { line.copy(px, q, i, i + 3); px[q + 3] = 255; }
      else if (type === 4) { px[q] = px[q + 1] = px[q + 2] = line[i]; px[q + 3] = line[i + 1]; }
      else if (type === 0) { px[q] = px[q + 1] = px[q + 2] = line[i]; px[q + 3] = 255; }
      else { const k = line[i] * 3; px[q] = plte[k]; px[q + 1] = plte[k + 1]; px[q + 2] = plte[k + 2]; px[q + 3] = (trns && line[i] < trns.length) ? trns[line[i]] : 255; }
    }
    prev = line;
  }
  return { w, h, px };
}
const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
// spans [from, to] on one axis, joined where they touch or overlap
function joined(spans) {
  const out = [];
  for (const [a, b] of spans.slice().sort((x, y) => x[0] - y[0])) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}
// true where a shape of the sampler paints some of the row at y between x0 and x1
function rowPainted(shape, y, x0, x1) {
  const xs = [];
  for (const p of shape.polys) for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length];
    if ((a[1] > y) === (b[1] > y)) continue;
    xs.push([a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]), b[1] > a[1] ? 1 : -1]);
  }
  xs.sort((m, n) => m[0] - n[0]);
  let wind = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    wind += xs[i][1];
    const inside = shape.rule === 'evenodd' ? (i % 2 === 0) : wind !== 0;
    if (inside && Math.min(xs[i + 1][0], x1) - Math.max(xs[i][0], x0) > 1e-6) return true;
  }
  return false;
}
const MASKED = {
  '/logos/airlines/us-major/spirit-wordmark-dark.svg': { ink: '#000000', lines: [0.62], seen: 'the word spirit in black, lower case' },
  '/logos/airlines/us-major/spirit-wordmark-light.svg': { ink: '#FFFFFF', lines: [0.62], seen: 'the same word in white' },
  '/logos/airlines/canadian/flair-wordmark-color.svg': { ink: '#000000', lines: [0.98], seen: 'the word flair with its mark, in black' },
  '/logos/airlines/canadian/flair-wordmark-light.svg': { ink: '#FFFFFF', lines: [0.98], seen: 'the same in white' }
};
// What a file paints: inks, each colour with the share of the painted area it covers, the
// largest first; and lines, the height of each band of painted rows as a share of the height
// of the box, from the top down.
const PICTURES = {};
function picture(u) {
  const file = bare(u);
  if (PICTURES[file]) return PICTURES[file];
  const raw = fs.readFileSync(path.join(FC, file));
  let img = null, out = null;
  if (/\.png$/i.test(file)) img = decodePng(raw);
  else {
    const txt = raw.toString('utf8');
    const shapes = /<(?:path|rect|circle|ellipse|polygon|polyline)\b/.test(txt.replace(/<(defs|clipPath|mask)\b[\s\S]*?<\/\1>/g, ''));
    const inside = /<image\b[^>]*href="data:image\/png;base64,([^"]+)"/.exec(txt);
    if (/<mask\b/.test(txt) && /<image\b/.test(txt)) out = Object.assign({ kind: 'masked', inks: [[MASKED[file] ? MASKED[file].ink : '', 1]] }, MASKED[file] || { lines: [] });
    else if (inside && !shapes) img = decodePng(Buffer.from(inside[1], 'base64'));
    else {
      const m = GEN.build(txt);
      let vb = m.vb;
      if (vb.length !== 4) { const tag = (/<svg\b[^>]*>/i.exec(txt) || [''])[0]; vb = [0, 0, parseFloat((/\bwidth="([\d.]+)/.exec(tag) || [])[1]), parseFloat((/\bheight="([\d.]+)/.exec(tag) || [])[1])]; }
      assert.ok(vb[2] > 0 && vb[3] > 0 && m.shapes.length, file + ': a box and shapes to read');
      const NX = 120, NY = Math.max(12, Math.round(NX * vb[3] / vb[2])), hist = {};
      let n = 0;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const c = GEN.colourAt(m, vb[0] + (i + 0.5) / NX * vb[2], vb[1] + (j + 0.5) / NY * vb[3]);
        if (c) { hist[c] = (hist[c] || 0) + 1; n++; }
      }
      // the lines: 300 rows across the height of the box, each painted where a shape covers some
      // of it inside the box (the crossings of the row with the outline, by the fill rule)
      const ROWS = 300, spans = [];
      for (let j = 0; j < ROWS; j++) {
        const y = vb[1] + (j + 0.5) / ROWS * vb[3];
        if (m.shapes.some((sh) => rowPainted(sh, y, vb[0], vb[0] + vb[2]))) spans.push([j, j + 1]);
      }
      out = { kind: 'drawing', inks: Object.entries(hist).map(([c, k]) => [c, k / n]).sort((a, b) => b[1] - a[1]), lines: joined(spans).map(([a, b]) => (b - a) / ROWS) };
    }
  }
  if (img) {
    const hist = new Map(), spans = [];
    let n = 0;
    for (let y = 0; y < img.h; y++) {
      let on = false;
      for (let x = 0; x < img.w; x++) {
        const i = (y * img.w + x) * 4;
        if (img.px[i + 3] < 128) continue;
        on = true; n++;
        const k = (img.px[i] >> 3) << 10 | (img.px[i + 1] >> 3) << 5 | (img.px[i + 2] >> 3), e = hist.get(k) || [0, 0, 0, 0];
        e[0]++; e[1] += img.px[i]; e[2] += img.px[i + 1]; e[3] += img.px[i + 2];
        hist.set(k, e);
      }
      if (on) spans.push([y, y + 1]);
    }
    out = { kind: 'raster', inks: [...hist.values()].sort((a, b) => b[0] - a[0]).map((e) => [hexOf(e[1] / e[0], e[2] / e[0], e[3] / e[0]), e[0] / n]), lines: joined(spans).map(([a, b]) => (b - a) / img.h) };
  }
  return (PICTURES[file] = out);
}

test('the reader of pictures: a drawing, a png, a png inside a drawing, and the four it cannot read', () => {
  // a drawing: KLM is one blue; Kuwait is three lines, its script the tallest and KUWAIT a quarter of the box
  const klm = picture(the('wordmarkSrc')('klm', 'dark'));
  assert.deepEqual([klm.kind, klm.inks[0][0], klm.inks[0][1] > 0.99, klm.lines.length], ['drawing', '#00A1DE', true, 1]);
  const ku = picture(the('wordmarkSrc')('kuwait-airways', 'light'));
  assert.equal(ku.lines.length, 3);
  assert.ok(Math.abs(ku.lines[0] - 0.515) < 0.01 && Math.abs(ku.lines[1] - 0.245) < 0.01 && ku.lines[2] < 0.08, ku.lines.map((x) => x.toFixed(3)).join(' '));
  // a png, and a png inside a drawing
  const wal = picture(the('wordmarkSrc')('world-atlantic', 'dark')), lx = picture(the('wordmarkSrc')('swiss', 'dark'));
  assert.deepEqual([wal.kind, lx.kind, lx.inks[0][0].slice(0, 3)], ['raster', 'raster', '#E6']);
  assert.ok(wal.inks.length >= 2 && wal.lines.length === 2, 'World Atlantic over Airlines');
  // what it cannot read is named, and is such a file
  for (const [file, row] of Object.entries(MASKED)) {
    assert.ok(onDisk(file) && /<mask\b/.test(read(file)) && /<image\b/.test(read(file)), file);
    assert.deepEqual([picture(file).kind, picture(file).inks[0][0]], ['masked', row.ink], file);
    assert.ok(row.seen.length > 10, file);
  }
  assert.deepEqual(joined([[5, 9], [0, 2], [2, 4], [8, 12]]), [[0, 4], [5, 12]]);
});

// ── 1. tiles on disk, named ────────────────────────────────────────────────
// code: the tile, and what the picture shows. Looked at one by one.
const NAMED_TILES = {
  JX: ['SJX', 'Starlux: two bronze strokes of an S and a four-point star, on dark teal'],
  N0: ['NBT', 'Norse Atlantic: the navy ribbon of a longship prow, on pale blue'],
  Z0: ['NBT', 'Norse Atlantic UK: the same ribbon'],
  KC: ['KZR', 'Air Astana: the gold ornament, on navy'],
  KM: ['KMM', 'KM Malta Airlines: the white Maltese cross, on red'],
  HY: ['UZB', 'Uzbekistan Airways: the green bird, on yellow'],
  UX: ['AEA', 'Air Europa: the white ae ligature, on blue'],
  MF: ['CXA', 'Xiamen Air: the white egret, on blue'],
  S4: ['RZO', 'Azores Airlines: the faceted blue bird'],
  XQ: ['SXS', 'SunExpress: the sun over blue waves, on orange'],
  UL: ['ALK', 'SriLankan: the peacock in red, green and orange'],
  PK: ['PIA', 'PIA: its name in Urdu, gold on dark green'],
  KX: ['CAY', 'Cayman Airways: the turtle with the red scarf, on green'],
  TN: ['THT', 'Air Tahiti Nui: the white tiare flower, on turquoise'],
  FJ: ['FJI', 'Fiji Airways: the round masi motif, on brown'],
  PX: ['ANG', 'Air Niugini: the bird of paradise, on red'],
  OM: ['MGL', 'MIAT Mongolian: the white winged horse, on blue'],
  ZL: ['RXA', 'Rex: the word rex. with its orange x, on navy'],
  '5J': ['CEB', 'Cebu Pacific: the eagle in blue and teal, on yellow'],
  GS: ['GCR', 'Tianjin Airlines: the yellow swirl, on red (the file is its designator)'],
  HX: ['CRK', 'Hong Kong Airlines: the gold bauhinia, on red'],
  JD: ['CBJ', 'Capital Airlines: the gold dragon head with streaming lines, on red (the file is its designator)'],
  SB: ['ACI', 'Aircalin: the red hibiscus, on blue'],
  AH: ['DAH', 'Air Algerie: the red swallow in its white oval, on red'],
  KU: ['KAC', 'Kuwait Airways: the white bird, on navy'],
  XY: ['KNE', 'flynas: the white f, on teal'],
  ZH: ['CSZ', 'Shenzhen Airlines: the gold roc, on red'],
  QS: ['TVS', 'Smartwings: the orange brush strokes, on blue'],
  NO: ['NOS', 'Neos: the red swallow, on blue'],
  H2: ['SKU', 'Sky Airline: the green chevron, on purple'],
  BG: ['BBC', 'Biman Bangladesh: the red stork, on green'],
  FB: ['LZB', 'Bulgaria Air: the bird in the white, green and red of the flag'],
  XC: ['CAI', 'Corendon Airlines: the white star figure, on red'],
  XR: ['CAI', 'Corendon Airlines Europe: the same figure'],
  BY: ['TOM', 'TUI Airways: the red smile, on light blue'],
  TB: ['TOM', 'TUI fly Belgium: the same smile'],
  X3: ['TOM', 'TUI fly: the same smile (it drew a square with TUI typed on it)'],
  CJ: ['BAW', 'BA CityFlyer: the British Airways speedmarque, the tile British Airways draws'],
  JJ: ['LAN', 'LATAM Brasil: the LATAM mark, the tile LATAM draws (it drew a square with JJ typed on it)']
};
// Looked at and not named, and why.
const REFUSED_TILES = {
  '8M': ['UBA', 'a gold lotus on brown: the mark of Myanmar National Airlines (UB), whose designator the file carries, not of Myanmar Airways International'],
  BI: ['RBA', 'a white band across a yellow square: not plainly the mark of Royal Brunei, which is the crest of Brunei'],
  DY: ['NOZ', 'a white aircraft drawn in one stroke on red: not plainly a mark of Norwegian, whose logo is its lettering; it keeps the square that types DY'],
  D8: ['NOZ', 'as DY, whose square it shares: not plainly a mark of Norwegian'],
  NK: ['NKS', 'plainly the black S of Spirit, and not named: Spirit rows are kept off every board, and a code kept off keeps no tile pointer'],
  '5Y': ['GTI', 'plainly the Atlas of Atlas Air, and not named: a cargo airline, kept off every board']
};

test('every tile that was named is on disk, in the app, known to the gate orbs, and what the row draws', () => {
  assert.equal(Object.keys(NAMED_TILES).length, 39);
  for (const [code, [tile, seen]] of Object.entries(NAMED_TILES)) {
    const file = '/logos/airline-tiles/' + tile + '.svg';
    assert.ok(seen.length > 20, code + ': what the picture shows');
    assert.equal(TILE[code], tile, code + ': the row table names ' + tile);
    assert.ok(onDisk(file), file);
    assert.doesNotMatch(read(file), /<text\b/, tile + '.svg is a drawing, not typed letters');
    assert.ok(NAME[code], code + ' is an airline the boards name');
    // the row and the belt draw it, beside the name
    const logo = the('mkLogo')(code, '');
    assert.equal(srcOf(logo), file, code + ': the row');
    assert.match(logo, /data-logo-set="tile"/, code);
    // the app's copy
    assert.equal(SHARED.FIDS_SHARED_TILE[code], file, code + ': the app copy');
    // the gate orbs: the ground of the tile is in the table the script writes, and the orb draws the
    // tile, or the mark its row of the table of looks keeps, on disk either way
    assert.match(B._ORB_TILE_GROUNDS[tile], /^#[0-9A-F]{6}$/, tile + ': a ground of one colour');
    assert.equal(B._ORB_TILE_LETTERS[tile], undefined, tile + ' is no lettered placeholder');
    const orb = B._gateOrbParts(code).path;
    assert.ok(onDisk(orb), code + ': the orb art ' + orb);
    const look = B._GATE_ORB_LOOKS[B._gateColumnLook(code).carrier] || {};
    const brand = B._BADGE_TILE_BRANDS[B._gateColumnLook(code).carrier];
    // the recipe of the art is the tile; what the column draws is that recipe, but where the rule
    // of the card behind the discs has made the column white and its row names a mark for the
    // white disc (tests/gate-orbs-every-airline.test.js holds that rule)
    const natural = B._gateOrbNatural(code).path, col = B._gateColumnLook(code);
    if (!look.art && !brand && !the('AIRLINE_EMBLEM_FILES')[col.carrier]) {
      assert.equal(natural, file, code + ': the art of the orb is the tile');
      assert.equal(orb, (col.white && look.whiteArt) || file, code + ': the orb draws the tile, or on a white column the mark its row names for the white disc');
    }
  }
  // the carriers whose gate keeps a mark of one colour, or the mark on white, where the row draws the tile
  assert.deepEqual(Object.keys(NAMED_TILES).filter((c) => B._gateOrbParts(c).path !== '/logos/airline-tiles/' + NAMED_TILES[c][0] + '.svg').sort(), ['CJ', 'FJ', 'JJ', 'JX', 'KC', 'KU', 'MF', 'UX']);
  // Air Astana and Kuwait: a white column (their navy would sink into the dark plate), the gold
  // emblem and the bird on the white disc, and the tile still the art their recipe names
  for (const [code, tile] of [['KC', 'KZR'], ['KU', 'KAC']]) {
    assert.deepEqual([B._gateColumnLook(code).white, B._gateOrbNatural(code).path, B._gateOrbParts(code).path], [true, '/logos/airline-tiles/' + tile + '.svg', '/logos/symbols/airlines/' + code + '.svg'], code);
    assert.deepEqual(Object.keys(B._GATE_ORB_LOOKS[code]), ['whiteArt'], code + ': the row carries the mark of the white disc and no pointer at the tile');
  }
  // a tile on a light ground: an ink that reads on it, and never white
  for (const code of Object.keys(NAMED_TILES)) {
    const L = B._gateColumnLook(code);
    if (/^#[0-9a-f]{6}$/i.test(L.ground)) assert.ok(contrast(L.inkSeen.length === 4 ? '#' + L.inkSeen.slice(1).replace(/./g, '$&$&') : L.inkSeen, L.ground) >= 3, code + ': ' + L.inkSeen + ' on ' + L.ground);
  }
  // where two codes share a tile, the designator reads back as the code the tile is filed under
  for (const [d, c] of [['NBT', 'N0'], ['CAI', 'XC'], ['TOM', 'BY'], ['BAW', 'BA'], ['LAN', 'LA'], ['WSG', 'WT']]) assert.equal(the('_designatorIata')(d), c, d);
});

test('the tiles that were looked at and refused are named by no table', () => {
  for (const [code, [tile, why]] of Object.entries(REFUSED_TILES)) {
    assert.ok(onDisk('/logos/airline-tiles/' + tile + '.svg'), tile + '.svg is on disk');
    assert.ok(why.length > 20, code);
    assert.notEqual(TILE[code], tile, code + ' is not pointed at ' + tile + '.svg');
    assert.ok(!Object.values(TILE).includes(tile), tile + '.svg is named for no code');
    assert.notEqual(B._gateOrbParts(code).path, '/logos/airline-tiles/' + tile + '.svg', code + ': the gate does not draw it');
  }
  // Norwegian keeps its deliberate monogram; the two cargo and closed airlines have no row to draw on
  assert.deepEqual([TILE.DY, TILE.D8], ['NAX', 'NAX']);
  for (const code of ['NK', '5Y']) assert.ok(the('FILTER_OUT').has(code), code + ' is kept off the board');
  // and two rows of the table of looks that named the tile of another airline are gone
  for (const code of ['TN', 'GS']) assert.equal(B._GATE_ORB_LOOKS[code], undefined, code);
  assert.deepEqual([B._gateOrbParts('TN').path, B._gateOrbParts('GS').path], ['/logos/airline-tiles/THT.svg', '/logos/airline-tiles/GCR.svg']);
});

// ── 2. the list of the tile folder ─────────────────────────────────────────
test('the list of the tile folder says what each corrected file holds', () => {
  const rows = MANIFEST.trim().split('\n').slice(1).map((l) => l.split(','));
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  // file: [code, the airline], read from the picture
  const NOW = {
    FBU: ['BF', 'French Bee'], ASL: ['JU', 'Air Serbia'], CBJ: ['JD', 'Capital Airlines'], CRK: ['HX', 'Hong Kong Airlines'],
    TGZ: ['A9', 'Georgian Airways'], THT: ['TN', 'Air Tahiti Nui'], IBB: ['NT', 'Binter Canarias'], CSZ: ['ZH', 'Shenzhen Airlines'],
    ACI: ['SB', 'Aircalin'], NBT: ['N0', 'Norse Atlantic Airways'], SJX: ['JX', 'Starlux Airlines'], KMM: ['KM', 'KM Malta Airlines'],
    UBA: ['UB', 'Myanmar National Airlines'], BRU: ['B2', 'Belavia'], PAO: ['PH', 'Polynesian Airlines'], CAI: ['XC', 'Corendon Airlines'], SKU: ['H2', 'Sky Airline']
  };
  for (const [tile, [code, name]] of Object.entries(NOW)) {
    assert.ok(by[tile], tile + ' has a row');
    assert.deepEqual([by[tile][1], by[tile][2], by[tile][4]], [code, name, tile + '.svg'], tile);
    assert.ok(onDisk('/logos/airline-tiles/' + tile + '.svg'), tile);
  }
  // every row names a file that is on disk, once
  assert.equal(new Set(rows.map((r) => r[0])).size, rows.length, 'one row per file');
  for (const r of rows) { assert.equal(r.length, 5, r.join()); assert.ok(onDisk('/logos/airline-tiles/' + r[4]), r[4]); }
  // and where the list names a code for a tile the row table also names for a code of two letters,
  // the two agree on every tile named here: the list can be read for wiring again
  for (const [code, [tile]] of Object.entries(NAMED_TILES)) {
    const listed = by[tile] && by[tile][1];
    if (!listed || listed === '--') continue;
    const sharers = Object.keys(TILE).filter((c) => TILE[c] === tile);
    assert.ok(sharers.includes(listed) || listed === 'UB', code + ': the list files ' + tile + ' under ' + listed + ', the row table under ' + sharers.join(' '));
  }
});

// ── 3. lettering on disk, named ────────────────────────────────────────────
const NAMED_LETTERING = { SN: 'brussels-airlines', EI: 'aer-lingus', TK: 'turkish-airlines', WY: 'oman-air', SQ: 'singapore-airlines', CX: 'cathay', '6E': 'indigo', KE: 'korean-air', UX: 'air-europa', AH: 'air-algerie', KU: 'kuwait-airways' };

test('the lettering that was named: a white cut and a colour cut, outlines only, with the tile beside it', () => {
  for (const [code, base] of Object.entries(NAMED_LETTERING)) {
    assert.equal(WM[code], base, code);
    const light = the('wordmarkSrc')(base, 'light'), dark = the('wordmarkSrc')(base, 'dark');
    assert.equal(light.split('?')[0], '/logos/airlines/split/' + base + '-wordmark-light.svg', code);
    assert.equal(dark.split('?')[0], '/logos/airlines/split/' + base + '-wordmark-dark.svg', code);
    for (const u of [light, dark]) {
      assert.ok(onDisk(u), u);
      assert.doesNotMatch(read(u), /<text\b|<image\b|font-family/, u + ': outlines, no typed text and no picture inside');
    }
    // white lettering for a dark ground, never dark lettering on a white box
    const lightInk = paints(light), darkInk = paints(dark);
    assert.ok(lightInk.length && lightInk.every(isWhite), code + ': the light cut is white lettering, ' + lightInk.join(' '));
    assert.ok(darkInk.length && darkInk.some((c) => !isWhite(c)), code + ': the colour cut is in colours, ' + darkInk.join(' '));
    assert.notDeepEqual(darkInk, lightInk, code + ': two cuts');
    assert.doesNotMatch(read(light), /<rect\b[^>]*(?:width="100%"|height="100%")/, code + ': no box behind it');
    // the row draws the tile and the lettering, and the app has the pair
    assert.match(the('mkLogo')(code, ''), /data-logo-set="tile"/, code + ': its tile beside it');
    assert.deepEqual(SHARED.FIDS_SHARED_WORDMARK[code], [dark.split('?')[0], light.split('?')[0]], code + ': the app copy');
    // the gate band draws the lettering, so it asks no address of carrierLogoUrl
    assert.match(CORE, /var _bannerWordmarkBase = \(typeof IATA_TO_WORDMARK !== 'undefined'\)/);
  }
  assert.equal(Object.keys(NAMED_LETTERING).length, 11);
});

// ── 4. a second code ───────────────────────────────────────────────────────
test('an airline under a second code draws the art filed under its first', () => {
  // North Star Air (0N as NSA), Wasaya (WP as WT), World Atlantic (WAL as WL), Chair (GM as CS)
  for (const [second, first] of [['0N', 'NSA'], ['WP', 'WT'], ['WAL', 'WL'], ['GM', 'CS']]) {
    assert.equal(NAME[second].toUpperCase().split(' ')[0], NAME[first].toUpperCase().split(' ')[0], second + ' and ' + first + ' are one airline');
    // the row: the same mark and the same lettering
    assert.equal(srcOf(the('mkLogo')(second, '')), srcOf(the('mkLogo')(first, '')), second + ': the mark of the row');
    assert.equal(WM[second], WM[first], second + ': the lettering');
    // the gate: one fold, so the art, the colours and the look are those of the first code
    assert.equal(the('_orbEmblemCarrier')(second), first, second + ' folds to ' + first);
    assert.deepEqual(plain(B._gateColumnLook(second)), plain(B._gateColumnLook(first)), second + ': the gate column');
    assert.equal(the('getAirlineAccent')(second), the('getAirlineAccent')(first), second + ': the accent');
    // the Welcome card and the phone gate header
    assert.deepEqual(plain(the('_welcomeCardName')(second)).wordmark, plain(the('_welcomeCardName')(first)).wordmark, second + ': the Welcome card');
    for (const dark of [true, false]) assert.equal(the('_mgHeaderLogoSrc')(second, dark), the('_mgHeaderLogoSrc')(first, dark), second + ': the phone gate header');
  }
  // each table is told in one place: one row of the tile table and of the lettering table, one line
  // of the fold (or one row of the callsign table for a designator), one row of the card's twin table
  assert.deepEqual([TILE['0N'], TILE.WP, WM['0N'], WM.WP, WM.WAL], ['NSA', 'WSG', 'north-star', 'wasaya', 'world-atlantic']);
  assert.equal(the('CALLSIGN_TO_IATA').WAL, 'WL');
  assert.deepEqual([the('_FB_WM_ICAO')['0N'], the('_FB_WM_ICAO').WP, the('_FB_WM_ICAO').WAL], ['NSA', 'WT', 'WL']);
  // and no row of the look, colour or brand tables was copied under the second code
  for (const second of ['0N', 'WP', 'WAL', 'GM']) {
    assert.equal(B._GATE_ORB_LOOKS[second], undefined, second);
    assert.equal(the('AIRLINE_ACCENT')[second], undefined, second);
    assert.equal(the('LOCAL_LOGOS')[second], undefined, second);
  }
  // the two designators the tile table gave while each code drew a lettered square
  assert.deepEqual([the('_designatorIata')('TAM'), the('_designatorIata')('TUI')], ['JJ', 'X3']);
});

// ── 5. the boarding strip and the countdown ────────────────────────────────
// the file a mark ends on: the first file asked where it is on disk, else the file it falls to
const ends = (pick) => (pick.src && onDisk(pick.src) ? pick.src : (pick.tile && onDisk(pick.tile) ? pick.tile : ''));

test('the boarding strip and the countdown are never bare for a carrier the row draws a mark for', () => {
  const bare = [];
  let drawn = 0;
  for (const code of CODES) {
    const logo = the('mkLogo')(code, '');
    const rowMark = /data-logo-set="(?:tile|emblem)"/.test(logo) ? srcOf(logo) : '';
    for (const [surface, table] of [['strip', B._BW_EMBLEM], ['countdown', B._CD_MARK]]) {
      const pick = B._gateMarkPick(table, code), file = ends(pick);
      if (file) { drawn++; continue; }
      // bare only where the row has no mark either, or its tile is the lettered square of another code
      const tile = (/airline-tiles\/([^/?]+)\.svg/.exec(rowMark) || [])[1] || '';
      if (rowMark && !(tile && B._orbTileLettersOther(tile, code))) bare.push(surface + ' ' + code + ' (the row draws ' + rowMark + ')');
    }
  }
  assert.deepEqual(bare, []);
  assert.ok(drawn >= 370, drawn + ' marks drawn over ' + CODES.length + ' codes and two surfaces');
  // the carriers the audit found with a bare band and a tile on disk
  for (const code of 'BF RK JV RJ B6 G4 SY AZ OS SK AY BT DY U2 VY WK OU LS EY GF ME MS WB NH QF BR CI CZ CA HU TR AD G3 Y4 UP'.split(' ')) {
    for (const table of [B._BW_EMBLEM, B._CD_MARK]) assert.equal(ends(B._gateMarkPick(table, code)), '/logos/airline-tiles/' + TILE[code] + '.svg', code + ' ends on its row tile');
  }
  // a symbol that is on disk is still the first choice (Korean Air on the strip: its taegeuk reads on white)
  assert.equal(ends(B._gateMarkPick(B._BW_EMBLEM, 'KE')), '/logos/symbols/airlines/KE.svg');
  // a lettered square is drawn only for the code it letters
  assert.equal(ends(B._gateMarkPick(B._BW_EMBLEM, 'DY')), '/logos/airline-tiles/NAX.svg');
  assert.equal(ends(B._gateMarkPick(B._BW_EMBLEM, 'D8')), '');
  // whichever table names it: the emblem table hands Norwegian UK the square that types DY, and
  // neither the strip nor the countdown of a DI gate draws it. Over every code and both surfaces,
  // a lettered square is the end only for the code it letters.
  assert.equal(the('AIRLINE_EMBLEM_FILES').DI, '/logos/airline-tiles/NAX.svg');
  for (const table of [B._BW_EMBLEM, B._CD_MARK]) assert.equal(ends(B._gateMarkPick(table, 'DI')), '', 'DI');
  const lettered = [];
  for (const code of CODES) for (const table of [B._BW_EMBLEM, B._CD_MARK]) {
    const pick = B._gateMarkPick(table, code);
    for (const u of [pick.src, pick.tile]) {
      const tile = (/airline-tiles\/([^/.?]+)\.svg/.exec(u || '') || [])[1] || '';
      if (!B._ORB_TILE_LETTERS[tile]) continue;
      assert.equal(B._orbTileLettersOther(tile, code), false, code + ' is handed ' + tile + '.svg, which letters ' + B._ORB_TILE_LETTERS[tile]);
      if (!lettered.includes(code)) lettered.push(code);
    }
  }
  assert.deepEqual(lettered.sort(), ['BQ', 'DY', 'SG', 'YP', 'YV'], 'the five codes whose own tile is a lettered square');
  // both builders ask the one function, and write its handler
  const strip = CORE.slice(CORE.indexOf('function _boardWelcomeStripHtml(_stripState) {'), CORE.indexOf('function _cdRondelleHtml() {'));
  const cd = CORE.slice(CORE.indexOf('function _cdRondelleHtml() {'), CORE.indexOf('function _boardInfoRowHtml(statusKey) {'));
  assert.match(strip, /var _bwPick = window\._gateMarkPick\(window\._BW_EMBLEM, airlineCode\);/);
  assert.match(strip, /class="g8-bw-emblem"' \+ _bwSpin \+ ' src="' \+ _bwEmb \+ '" alt=""' \+ window\._gateMarkAttrs\(_bwPick\)/);
  assert.match(cd, /var _cdPick = window\._gateMarkPick\(window\._CD_MARK, airlineCode\);/);
  assert.match(cd, /class="g8-cd-mark-still"' \+ _cdSpin \+ ' src="' \+ _src \+ '" alt=""' \+ window\._gateMarkAttrs\(_cdPick\)/);
  assert.doesNotMatch(strip + cd, /onerror="this\.style\.display=\\'none\\'"/, 'neither hides a miss without trying the row tile');
  // the markup carries the tile to fall to, and says when the first file is only a guess
  assert.equal(B._gateMarkAttrs(B._gateMarkPick(B._BW_EMBLEM, 'B6')), ' data-tile="/logos/airline-tiles/JBU.svg" data-guess="1" onerror="window._gateMarkMiss(this)"');
  assert.equal(B._gateMarkAttrs(B._gateMarkPick(B._BW_EMBLEM, 'PD')), ' data-tile="/logos/airline-tiles/PTR.svg" onerror="window._gateMarkMiss(this)"');
  // a guess that missed is remembered: the next build asks the tile at once
  B._GATE_MARK_MISSED['/logos/symbols/airlines/B6.svg'] = 1;
  assert.deepEqual(plain(B._gateMarkPick(B._BW_EMBLEM, 'B6')), { src: '/logos/airline-tiles/JBU.svg', tile: '', guess: false });
  delete B._GATE_MARK_MISSED['/logos/symbols/airlines/B6.svg'];
});

test('the white strip never draws a white mark, and the countdown never a symbol of the colour it stands on', () => {
  // THE STRIP IS WHITE: Porter, PAL, Delta with Endeavor, and LATAM with its two sisters drew white on it
  const STRIP = {
    PD: '/logos/airlines/canadian/porter/porter-p-navy.svg', PB: '/logos/airline-tiles/PB.svg',
    DL: '/logos/airlines/us-major/delta-emblem-colour.svg', DAL: '/logos/airlines/us-major/delta-emblem-colour.svg', '9E': '/logos/airlines/us-major/delta-emblem-colour.svg',
    LA: '/logos/symbols/airlines/LA.svg', JJ: '/logos/symbols/airlines/LA.svg', '4C': '/logos/symbols/airlines/LA.svg'
  };
  for (const [code, file] of Object.entries(STRIP)) {
    assert.equal(ends(B._gateMarkPick(B._BW_EMBLEM, code)), file, code);
    const ink = paints(file);
    // (the colour widget of Delta is a picture inside a drawing: it was looked at, and it is red)
    assert.ok(ink.some((c) => !isWhite(c)) || (wrapsPicture(file) && /colour/.test(file)), code + ': ' + file + ' paints ' + ink.join(' '));
    // what the orb table hands the orbs for this code is the white cut, or mostly white
    const orb = the('AIRLINE_EMBLEM_FILES')[code];
    if (code !== 'DAL') assert.ok(orb && orb.split('?')[0] !== file, code + ': the orb keeps its own file, ' + orb);
  }
  // the marks that are white only, as the orb table names them: none reaches the strip
  for (const [code, orb] of [['PD', '/logos/airlines/canadian/porter-p.svg'], ['PB', '/logos/airline-tiles/PB-arrow.svg'], ['DL', '/logos/airlines/us-major/delta-widget-monochrome-white.svg']]) {
    assert.ok(paints(orb).every(isWhite), orb + ' is white only');
    assert.equal(the('AIRLINE_EMBLEM_FILES')[code].split('?')[0], orb, code);
  }
  // and over every code: no drawing that ends on the strip is white only
  const white = [];
  for (const code of CODES) {
    const file = ends(B._gateMarkPick(B._BW_EMBLEM, code));
    if (!file || !/\.svg(\?|$)/.test(file)) continue;
    const ink = paints(file);
    if (ink.length && ink.every(isWhite)) white.push(code + ' ' + file);
  }
  assert.deepEqual(white, [], 'white on the white strip');
  // LATAM: the spark cut for dark grounds is white for most of its ink; the strip draws the colour cut
  assert.ok(paints('/logos/airlines/asian-other/latam-spark.svg').some(isWhite));
  assert.ok(!paints('/logos/symbols/airlines/LA.svg').some(isWhite));

  // THE COUNTDOWN STANDS ON THE COLOUR OF THE CARRIER: the fifteen whose symbol was that colour draw
  // their row tile, a square of the colour with the mark in white or in a second colour. And eight
  // more the first list missed, each tile looked at on its ground: Fiji and Xiamen (a symbol the
  // colour under it to the digit), Air Europa, Aerolineas, Asiana and TAROM (within a few steps of
  // it), Kuwait and IndiGo (a navy symbol on the near black of a carrier with no banner colour).
  // And a ninth the reading below found: Transavia under HV, a green letter on that green.
  const CD = { LH: 'DLH', SN: 'BEL', LO: 'LOT', FI: 'ICE', EK: 'UAE', SQ: 'SIA', JL: 'JAL', CX: 'CPA', KE: 'KAL', JQ: 'JST', CM: 'CMP', AM: 'AMX', JU: 'ASL', HA: 'HAL', IB: 'IBE',
    FJ: 'FJI', MF: 'CXA', UX: 'AEA', KU: 'KAC', '6E': 'IGO', AR: 'ARG', OZ: 'AAR', RO: 'ROT', HV: 'TRA' };
  assert.equal(Object.keys(CD).length, 24);
  for (const [code, tile] of Object.entries(CD)) {
    const file = '/logos/airline-tiles/' + tile + '.svg';
    assert.equal(B._CD_MARK[code], file, code);
    assert.equal(TILE[code], tile, code + ': its row tile');
    assert.equal(ends(B._gateMarkPick(B._CD_MARK, code)), file, code);
    // the tile paints a ground and a mark: two colours or more, so the mark cannot be the ground
    assert.ok(paints(file).length >= 2, code + ': ' + paints(file).join(' '));
  }
  // THE GROUND OF THE COUNTDOWN, as the gate writes it: the first colour of the banner of the
  // carrier (the colour file, then the table in the gate), else its accent, else the near black
  // #0C1119; never white. Read here from the same three places.
  const colours = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(FC, 'data/airline-colors.js'), 'utf8'), { window: w }); return w.AIRLINE_BRAND_COLORS || {}; })();
  const spec = {};
  for (const m of CORE.slice(CORE.indexOf('var BANNER_COLOR_SPEC = {'), CORE.indexOf('Object.assign(BANNER_COLOR_SPEC, window.AIRLINE_BRAND_COLORS)')).matchAll(/'([A-Z0-9]{2,3})':\s*\{\s*r1:\s*'(#[0-9A-Fa-f]{6})'/g)) spec[m[1]] = m[2];
  assert.ok(Object.keys(spec).length >= 8 && Object.keys(colours).length >= 20, 'both tables of banner colours were read');
  assert.match(CORE, /\+ ';--banner-bg:' \+ \(\(_bannerSpec && _bannerSpec\.r1 && String\(_bannerSpec\.r1\)\.toUpperCase\(\) !== '#FFFFFF'\) \? _bannerSpec\.r1 : '#0c1119'\)/);
  assert.match(fs.readFileSync(path.join(FC, 'css/display-overrides.css'), 'utf8'), /\.g8-countdown \.g8-cd-body \{\s*background-color: var\(--banner-bg, #0b0f16\) !important;/);
  const ground = (code) => { const r = (colours[code] && colours[code].r1) || spec[code] || the('AIRLINE_ACCENT')[code] || ''; return (/^#[0-9a-f]{6}$/i.test(r) && r.toUpperCase() !== '#FFFFFF') ? r.toUpperCase() : '#0C1119'; };
  assert.deepEqual([ground('FJ'), ground('MF'), ground('KU'), ground('6E'), ground('ZZ')], ['#473729', '#008CD5', '#0C1119', '#0C1119', '#0C1119']);
  // the eight: the symbol each asked for is one colour, and reads on that ground under 1.5 to 1
  // (six of them within 4 of it by CIEDE2000; the navy of Kuwait and of IndiGo 17 and 22 from the
  // near black, at 1.36 and 1.43 to 1); its tile shows a mark that stands 20 or more from the ground
  const near = (file, g) => picture(file).inks.filter(([c]) => B._orbDeltaE(c, g) < 20).reduce((a, [, share]) => a + share, 0);
  for (const code of ['FJ', 'MF', 'UX', 'KU', '6E', 'AR', 'OZ', 'RO', 'HV']) {
    const sym = '/logos/symbols/airlines/' + code + '.svg', g = ground(code), ink = picture(sym).inks;
    assert.ok(onDisk(sym) && ink[0][1] > 0.99 && contrast(ink[0][0], g) < 1.5, code + ': ' + sym + ' is ' + ink[0][0] + ', ' + contrast(ink[0][0], g).toFixed(2) + ' to 1 on ' + g);
    assert.ok(near(B._CD_MARK[code], g) <= 0.97, code + ': a mark on the tile stands out of ' + g);
  }
  for (const code of ['FJ', 'MF', 'UX', 'AR', 'OZ', 'RO', 'HV']) assert.ok(B._orbDeltaE(picture('/logos/symbols/airlines/' + code + '.svg').inks[0][0], ground(code)) < 4, code);
  // AND OVER EVERY CODE: no mark the countdown ends on is lost on its ground. A MARK IS LOST where
  // half of its ink or more is within the measure of that ground (CIEDE2000 under 20), as a lettering
  // is on a row state, and it has no figure: less than a twenty-fifth of its ink stands clear of that
  // ground, at twice its light or more (2 to 1, the line the gate draws for a disc on the dark plate,
  // window._GATE_SINK.clear: the white of easyJet on its orange is 2.9, of Transavia on its green
  // 2.1, the green half of LEVEL on its cyan 1.2). A tile on a ground of its own colour is the
  // first and never the second (its square is the ground, its mark in white is the figure: the remedy
  // of the table above), and so is a roundel (the red disc of Turkish, its white bird and ring). Half
  // is read to the grain of the reader: LEVEL is two blocks of one size and reads at 0.4999.
  // Four are lost, and are named: two have no tile to fall to (El Al and Mokulele draw an emblem of
  // exactly their banner colour), the white p of Porter stands on a ground the stylesheet gives its
  // countdown, not on its cream banner colour, and LEVEL, which was not caught while the line was
  // nine tenths of a mark.
  const LOST_ON_GROUND = {
    LY: 'no tile on disk', '9X': 'no tile on disk', PD: 'the stylesheet paints the countdown of Porter',
    LL: 'no tile on disk: its one mark is two blocks, cyan over green, and the cyan block is the colour of its countdown; the green one left reads at 1.2 to 1 on it, a green rectangle. A monogram there would be a square of that cyan. It needs a mark on one ground from the airline (the orb ledger holds it for the same two grounds)'
  };
  assert.equal(B._GATE_SINK.clear, 2);
  const figure = (file, g) => picture(file).inks.filter(([c]) => contrast(c, g) >= B._GATE_SINK.clear).reduce((a, [, share]) => a + share, 0);
  const lostOn = (file, g) => near(file, g) >= 0.49 && figure(file, g) < 0.04;
  const lost = [];
  let judged = 0, half = 0;
  for (const code of CODES) {
    const file = ends(B._gateMarkPick(B._CD_MARK, code));
    if (!file || /\.(?:webp|jpe?g)(\?|$)/i.test(file)) continue;
    // (a lettered square is its ground and a code set as text, which the reader does not read)
    const tile = (/airline-tiles\/([^/.?]+)\.svg/.exec(file) || [])[1] || '';
    if (picture(file).kind === 'masked' || B._ORB_TILE_LETTERS[tile]) continue;
    judged++;
    if (near(file, ground(code)) >= 0.49) half++;
    if (lostOn(file, ground(code))) lost.push(code);
  }
  assert.ok(judged >= 180, judged + ' countdown marks read');
  assert.ok(half >= 50, half + ' marks are half the colour of their ground or more, tiles and roundels on their own colour among them');
  assert.deepEqual(lost, Object.keys(LOST_ON_GROUND).sort());
  for (const code of ['LY', '9X', 'LL']) assert.equal(TILE[code], undefined, code + ': ' + LOST_ON_GROUND[code]);
  for (const why of Object.values(LOST_ON_GROUND)) assert.ok(why.length > 10);
  // LEVEL: half of it is its ground, and the other half no figure on it
  const ll = ends(B._gateMarkPick(B._CD_MARK, 'LL'));
  assert.deepEqual([ll, ground('LL')], ['/logos/airlines/european/level-emblem.svg', '#00B7C8']);
  assert.ok(Math.abs(near(ll, ground('LL')) - 0.5) < 0.01 && figure(ll, ground('LL')) === 0, 'LEVEL: ' + near(ll, ground('LL')).toFixed(4));
  // the line between them: a roundel and a tile on their own colour are half their ground and more,
  // and read by their figure (Turkish, Swiss); a mark half lost with a figure that reads (the navy and
  // teal bird of Garuda on the near black, its teal stripes at 4.6 to 1) stands too; and the white of
  // a tile on a bright ground of its own, under 3 to 1 and twice its light (easyJet, Transavia)
  for (const code of ['TK', 'LX', 'GA', 'U2', 'HV']) {
    const f = ends(B._gateMarkPick(B._CD_MARK, code));
    assert.ok(near(f, ground(code)) >= 0.49 && figure(f, ground(code)) >= 0.04 && !lostOn(f, ground(code)), code + ': ' + f);
  }
  assert.match(fs.readFileSync(path.join(FC, 'css/display-overrides.css'), 'utf8'), /\.g8-wrap\.g8-airline-PD \.g8-countdown \.g8-cd-body \{/);
  // the countdown keeps the colour marks it had
  assert.equal(B._CD_MARK.DL, '/logos/airlines/us-major/delta-emblem-colour.svg');
  assert.equal(B._CD_MARK.WS, '/logos/airlines/canadian/westjet-2025/WestJet-leaf-colour.svg');
  // and the strip the ones it had
  assert.deepEqual([B._BW_EMBLEM.UA, B._BW_EMBLEM.LX, B._BW_EMBLEM.WS], ['/logos/airline-tiles/UA-globe-glossy.png?v=22350', '/logos/airline-tiles/SWR.svg', '/logos/airlines/canadian/westjet-2025/WestJet-leaf-colour.svg']);
  for (const t of [B._BW_EMBLEM, B._CD_MARK]) for (const [code, u] of Object.entries(t)) assert.ok(onDisk(u), code + ': ' + u);
});

// ── 6. lettering that is typed text ────────────────────────────────────────
// One file of typed text is still handed to a surface: the lettering of Republic in the
// Operated-by caption of a gate (and its lockup, the same typed words). Taking it out would
// change the caption of every American, Delta and United gate Republic flies for, which is a
// decision about that caption and not a table edit; it needs outlines of the Republic lettering.
const TYPED_TEXT_KEPT = ['/logos/airlines/us-regional/republic-wordmark-dark.svg', '/logos/airlines/us-regional/republic-wordmark-light.svg', '/logos/airlines/us-regional/republic.svg'];

test('lettering that is typed text is in no table: TAP, LOT, Royal Air Maroc and Republic type their name', () => {
  // a drawing that sets words as text: a text element with letters in it, outside the notes of the file
  const notes = (svg) => { let out = '', i = 0; for (;;) { const a = svg.indexOf('<!--', i); if (a < 0) return out + svg.slice(i); out += svg.slice(i, a); const b = svg.indexOf('-->', a); if (b < 0) return out; i = b + 3; } };
  const typed = (u) => /\.svg(\?|$)/.test(u) && onDisk(u) && /<(?:text|tspan)\b[^>]*>[^<]*[A-Za-z]/.test(notes(read(u)));
  assert.equal(typed('/logos/airlines/canadian-regional/pacific-coastal-wordmark-dark.svg'), false, 'a note that says the word text is not typed text');
  // the four sets of files are what the audit says: one line of text in a font of the system
  for (const u of ['/logos/airlines/european/tap-portugal-wordmark-light.svg', '/logos/airlines/european/tap-portugal-wordmark-dark.svg', '/logos/airlines/european/tap-portugal-wordmark-color.svg',
    '/logos/airlines/european/lot-wordmark-light.svg', '/logos/airlines/european/lot-wordmark-dark.svg', '/logos/airlines/european/lot-wordmark-color.svg',
    '/logos/airlines/alliances/royal-air-maroc-wordmark-light.svg', '/logos/airlines/alliances/royal-air-maroc-wordmark-dark.svg', '/logos/airlines/alliances/royal-air-maroc-wordmark-color.svg',
    '/logos/airlines/us-regional/republic-wordmark-light.svg', '/logos/airlines/us-regional/republic-wordmark-dark.svg']) {
    assert.ok(typed(u), u + ' holds typed text');
    assert.match(read(u), /font-family="Helvetica Neue, Arial, sans-serif"/, u);
  }
  // the four codes have no lettering row; the row types the name beside the tile, or the monogram
  for (const code of ['TP', 'LO', 'AT', 'YX']) {
    assert.equal(WM[code], undefined, code);
    assert.equal(SHARED.FIDS_SHARED_WORDMARK[code], undefined, code + ': the app copy');
    assert.equal(the('WATERMARK_OVERRIDE')[code], undefined, code + ': the sky watermark');
    assert.equal(the('_welcomeCardName')(code).wordmark, '', code + ': the Welcome card types the name');
    // (the phone gate header reads the pair of the Operated-by caption for Republic: the ledger above)
    if (code !== 'YX') assert.equal(the('_mgHeaderLogoSrc')(code, true), '', code + ': the phone gate header types the name');
  }
  for (const [code, tile] of [['TP', 'TAP'], ['LO', 'LOT'], ['AT', 'RAM']]) assert.equal(srcOf(the('mkLogo')(code, '')), '/logos/airline-tiles/' + tile + '.svg', code + ': its tile, with the typed name');
  assert.match(the('mkLogo')('YX', ''), /logo-monogram/, 'Republic: the monogram, where its mark slot was empty');
  for (const base of ['tap-portugal', 'lot', 'royal-air-maroc', 'republic']) {
    assert.ok(!Object.values(WM).includes(base), base);
    assert.equal(the('COLOR_WORDMARKS')[base], undefined, base);
  }
  // EVERY FILE EVERY LETTERING TABLE NAMES: none is typed text, but for the ledger above
  const named = new Set();
  for (const base of new Set(Object.values(WM))) for (const v of ['light', 'dark']) named.add(the('wordmarkSrc')(base, v).split('?')[0]);
  for (const t of ['COLOR_WORDMARKS', 'WATERMARK_OVERRIDE', 'OPERATOR_WORDMARKS', 'OPERATOR_LOGOS', 'WELCOME_CARD_WORDMARK', 'LOCAL_LOGOS']) for (const u of Object.values(plain(the(t)))) named.add(String(u).split('?')[0]);
  for (const t of ['OPBY_WORDMARKS_THEMED', 'WORDMARK_RASTER', 'MG_LOGO_FILES']) for (const pair of Object.values(plain(the(t)))) for (const u of Object.values(pair || {})) if (u) named.add(String(u).split('?')[0]);
  for (const pair of Object.values(SHARED.FIDS_SHARED_WORDMARK)) for (const u of pair) named.add(u);
  assert.ok(named.size >= 220, named.size + ' lettering files named');
  assert.deepEqual([...named].filter(typed).sort(), TYPED_TEXT_KEPT, 'typed text shown as an airline lettering: the ledger can only shrink');
  // the sweep found one more: the sky watermark of Delta was a widget beside DELTA typed in a system font
  assert.equal(typed('/logos/airlines/us-major/delta-on-black.svg'), true);
  assert.equal(the('WATERMARK_OVERRIDE').DL, '/logos/airlines/us-major/delta-wordmark-light.svg');
});

// ── 7. a row state that swallows the lettering ─────────────────────────────
test('on the row state that is the colour of its lettering, the row types the name in its own ink', () => {
  const types = the('_rowStateTypesName');
  const TABLE = plain(the('ROW_STATE_TYPES_NAME'));
  for (const code of ['U2', 'EZY', 'EC', 'EJU', 'EZS', 'G3']) {
    assert.equal(types('final-call', WM[code]), true, code + ' on Final Call');
    for (const st of ['delayed', 'scheduled', 'boarding', 'cancelled', 'departed', '']) assert.equal(types(st, WM[code]), false, code + ' on ' + st);
  }
  // Etihad and Oman Air on both states (Etihad was listed for Delayed alone, and its gold on the
  // orange of Final Call is the lower of the two; Oman Air typed its name before it had lettering)
  for (const code of ['EY', 'WY']) {
    for (const st of ['final-call', 'delayed']) assert.equal(types(st, WM[code]), true, code + ' on ' + st);
    for (const st of ['scheduled', 'boarding', 'cancelled', 'departed', '']) assert.equal(types(st, WM[code]), false, code + ' on ' + st);
  }
  for (const code of ['AC', 'WS', 'LH', 'DL']) for (const st of ['final-call', 'delayed']) assert.equal(types(st, WM[code]), false, code);
  assert.equal(types('final-call', undefined), false);
  // WHY: the colour cut the row asks for in that state is the colour of the row
  const ROW = { 'final-call': ['#F28C00'], delayed: ['#EDBB00', '#F9D44C'] };
  const css = ['css/fids.css', 'css/display-overrides.css'].map((f) => fs.readFileSync(path.join(FC, f), 'utf8')).join('\n').toUpperCase();
  for (const c of [].concat(...Object.values(ROW))) assert.ok(css.includes(c), 'the stylesheets paint a row ' + c);

  // THE TABLE IS HELD TO A MEASURE, NOT TO A LIST. It was pinned to three entries, so a lettering
  // wired later was never asked: Oman Air went from a typed name to grey and gold letters at 1.03
  // to 1 on the orange row. Every colour cut the lettering table can hand a row is read here (what
  // it paints, by area) and set against the colour of both rows.
  // AN INK IS LOST ON A ROW where it is near the same paint (CIEDE2000 under 20, the line the gate
  // orbs draw between a disc and its card), or where it is a grey (chroma under 7, the line of the
  // same measure between a colour and a grey) under 2 to 1 on it: a grey has no colour of its own
  // to stand on, only light. A CUT IS LOST where half of what it paints, or more, is.
  // Contrast alone would not do, and the pictures say so: the blue of KLM and the green of
  // Transavia are 1.2 to 1 on the orange and read at once, a blue and a green on an orange.
  const SINK = plain(B._GATE_SINK);
  assert.deepEqual([SINK.deltaE, SINK.chroma], [20, 7]);
  const apart = (a, b) => B._orbDeltaE(a, b), chroma = (c) => Math.hypot(B._orbLab(c)[1], B._orbLab(c)[2]);
  const lost = (ink, row) => apart(ink, row) < SINK.deltaE || (chroma(ink) < SINK.chroma && contrast(ink, row) < 2);
  const lostShare = (inks, row) => inks.filter(([c]) => lost(c, row)).reduce((a, [, share]) => a + share, 0);
  // the measure against the cuts that were drawn on both rows and looked at: these vanish
  for (const [ink, row] of [['#C89801', '#F28C00'], ['#C89801', '#EDBB00'], ['#C89801', '#F9D44C'], ['#FF6600', '#F28C00'], ['#EB7302', '#F28C00'],
    ['#A6A8AB', '#F28C00'], ['#A6A8AB', '#EDBB00'], ['#B39759', '#F28C00'], ['#B39759', '#EDBB00']]) assert.equal(lost(ink, row), true, ink + ' on ' + row);
  // and these read: KLM, Transavia, VivaAerobus, the blue and the red of Chair, SWISS, Pegasus, Air
  // Algerie, Air Europa and both blues of El Al on either row, and the orange of easyJet and of GOL
  // on the yellow of Delayed (the weakest that read: 31 and 26 apart from it)
  for (const ink of ['#00A1DE', '#05CE78', '#04A64B', '#35B0E6', '#FF0000', '#E60005', '#DC2C2B', '#E2231A', '#006FDE', '#63C7EF', '#1B358F']) {
    for (const row of [].concat(...Object.values(ROW))) assert.equal(lost(ink, row), false, ink + ' on ' + row);
  }
  for (const [ink, row] of [['#FF6600', '#EDBB00'], ['#FF6600', '#F9D44C'], ['#EB7302', '#EDBB00'], ['#EB7302', '#F9D44C']]) assert.equal(lost(ink, row), false, ink + ' on ' + row);
  assert.ok(apart('#FF6600', '#EDBB00') > 30 && apart('#EB7302', '#EDBB00') > 25 && apart('#EB7302', '#EDBB00') < 27);
  // a grey with light against the row reads; white, a grey with none, does not read on the yellow
  assert.deepEqual([lost('#58595B', '#F28C00'), lost('#58595B', '#EDBB00'), lost('#FFFFFF', '#F9D44C')], [false, false, true]);

  // THE SWEEP: every lettering, both states
  const bases = [...new Set(Object.values(WM))].sort(), found = { 'final-call': {}, delayed: {} }, kinds = {};
  let partly = 0;
  for (const base of bases) {
    const cut = the('wordmarkSrc')(base, 'dark');
    assert.ok(onDisk(cut), base + ': ' + cut);
    const P = picture(cut);
    kinds[P.kind] = (kinds[P.kind] || 0) + 1;
    assert.ok(P.inks.length && /^#[0-9A-F]{6}$/.test(P.inks[0][0]) && Math.abs(P.inks.reduce((a, [, share]) => a + share, 0) - 1) < 1e-6, base + ': what ' + cut + ' paints');
    for (const st of Object.keys(ROW)) {
      const worst = Math.max(...ROW[st].map((row) => lostShare(P.inks, row)));
      if (worst >= 0.5) found[st][base] = 1;
      else if (worst >= 0.1) partly++;
    }
  }
  assert.ok(bases.length >= 80, bases.length + ' letterings read');
  assert.deepEqual(kinds, { drawing: bases.length - 6, raster: 4, masked: 2 }, 'how each cut was read');
  // every cut that is lost on a row is in the table, and the table names no other
  assert.deepEqual(found, TABLE);
  assert.deepEqual([Object.keys(TABLE['final-call']).sort(), Object.keys(TABLE.delayed).sort()], [['easyjet', 'etihad', 'gol', 'oman-air'], ['etihad', 'oman-air']]);
  // some read with a part of them lost (the orange half of North Star, the orange of Sun Country
  // and of the bird of Singapore, the peach of Bahamasair, the grey ring of GOL on the yellow):
  // under half, so the lettering stays
  assert.ok(partly >= 8 && partly <= 20, partly + ' cuts lose a tenth to a half of their ink on a row');
  for (const [st, base, ink] of [['final-call', 'easyjet', '#ff6600'], ['final-call', 'gol', '#eb7302'], ['delayed', 'etihad', '#c89801'], ['final-call', 'etihad', '#c89801'],
    ['final-call', 'oman-air', '#a6a8ab'], ['delayed', 'oman-air', '#a6a8ab'], ['final-call', 'oman-air', '#b39759'], ['delayed', 'oman-air', '#b39759']]) {
    const cut = the('wordmarkSrc')(base, 'dark');
    assert.ok(paints(cut).includes(ink), base + ': its colour cut paints ' + paints(cut).join(' '));
    for (const row of ROW[st]) assert.ok(contrast(ink, row) < 2, base + ' ' + ink + ' on a ' + st + ' row ' + row + ' reads at ' + contrast(ink, row).toFixed(2) + ' to 1');
    // and the ink of the row reads there
    for (const row of ROW[st]) assert.ok(contrast('#14263F', row) >= 4.5, 'the row ink on ' + row);
  }
  // the row consults it: lettering only when the state does not swallow it, else the name span, whose
  // style carries no brand colour on a state row (_brandInkOk)
  assert.match(CORE, /const _rowTypesName = _rowStateTypesName\(stKey, _wordmarkBase\);/);
  assert.match(CORE, /const _airlineLabelHtml = \(_airlineStyleForRow === 'emblem'\) \? '' : \(\(_wordmarkBase && !_rowTypesName\)\n\s*\? `<img class="fids-airline-wordmark"/);
  assert.match(CORE, /const _brandInkOk = !\(isDelayed \|\| stKey === 'final-call' \|\| isCanc \|\| isDiv/);
  assert.match(CORE, /const isDelayed = stKey === 'delayed';/);
  // the Delayed bar of the belt reads the same table
  assert.match(CORE, /const _bTypesName = isDelayed && _rowStateTypesName\('delayed', _bWmBase\);/);
  assert.match(CORE, /const _b3Wm = _bidsEmblemOnly \? '' : \(\(_bWmBase && !_bTypesName\)/);
  // the mark slot still holds the tile on those rows
  for (const code of ['U2', 'G3', 'EY', 'WY']) assert.match(the('mkLogo')(code, ''), /data-logo-set="tile"/, code);
});

// ── 8. the belt ────────────────────────────────────────────────────────────
test('the belt draws no lockup in its square slots: the square mark of the strip or the monogram there, and the name typed beside it', () => {
  const lockup = the('_logoIsLockup'), belt = the('_beltLogo');
  // Sunwing: a lockup and no tile or lettering. The board row has a wide slot for it and hides the
  // typed name beside it; the belt has only squares
  const wg = the('mkLogo')('WG', 'Sunwing');
  assert.equal(lockup(wg), true);
  assert.equal(WM.WG, undefined); assert.equal(TILE.WG, undefined);
  const sheet = fs.readFileSync(path.join(FC, 'css/baggage-display.css'), 'utf8') + fs.readFileSync(path.join(FC, 'css/display-overrides.css'), 'utf8');
  assert.match(sheet, /#baggageView \.b5 \.b5-emb img, #baggageView \.b5 \.b5-emb \.full-logo \{\s*height: 1em !important;[^}]*max-width: 1\.6em !important;/);
  assert.match(sheet, /\.bidsv3 \.b3-tile img, \.bidsv3 \.b3-tile > \* \{ width: 100% !important; height: 100% !important; object-fit: contain;/);
  const art = decodePng(fs.readFileSync(path.join(FC, bare(srcOf(wg)))));
  assert.ok(art.w / art.h > 3.5, 'the Sunwing lockup is ' + art.w + ' by ' + art.h + ': in a slot 1.6 wide it is under half the height of the text beside it');
  // so the belt draws the monogram in the slot, and types the name
  assert.match(belt('WG', 'Sunwing'), /^<div class="full-logo logo-monogram" data-code="WG" style="background:[^"]+;">WG<\/div>$/);
  const hall = the('_b5Airline')({ airline: 'WG', _airlineName: 'Sunwing' });
  assert.match(hall, /^<span class="b5-emb"><div class="full-logo logo-monogram"[^>]*>WG<\/div><\/span><span class="b5-aname">SUNWING<\/span>$/, 'the monogram, and the name');
  const tag = the('_b5Tag')({ airline: 'WG', _airlineName: 'Sunwing', flight: 'WG123' });
  assert.match(tag, /^<span class="b5-tag"><span class="b5-temb"><div class="full-logo logo-monogram"[^>]*>WG<\/div><\/span><span class="b5-tfn" dir="ltr">WG123<\/span><\/span>$/);
  for (const html of [hall, tag]) assert.doesNotMatch(html, /Sunwing-Logo|data-logo-set="wordmark"|<img/);
  // the strip only guesses at a symbol for Sunwing by its code, and none is on disk: the belt does not
  // take a guess, which the strip hides when it misses, and draws the monogram
  const wgPick = B._gateMarkPick(B._BW_EMBLEM, 'WG');
  assert.ok(wgPick.guess && !onDisk(wgPick.src) && !wgPick.tile, 'WG: ' + JSON.stringify(wgPick));
  // THE COLOUR OF THE SQUARE: the colour of the airline, as the phone app draws the same square (the bar
  // colour of the colour file where that is dark, else the accent), never a hue made up from its letters
  const colours = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(FC, 'data/airline-colors.js'), 'utf8'), { window: w }); return w.AIRLINE_BRAND_COLORS || {}; })();
  B.AIRLINE_BRAND_COLORS = colours;
  try {
    assert.equal(colours.WG.r1, '#0B1F3A', 'Sunwing navy');
    assert.match(belt('WG', 'Sunwing'), /^<div class="full-logo logo-monogram" data-code="WG" style="background:#0B1F3A;">WG<\/div>$/);
    assert.match(APP, /const acc=\(b&&b\.r1&&_lum\(b\.r1\)<\.45\)\?b\.r1:/, 'the app: the bar colour where it is dark');
  } finally { delete B.AIRLINE_BRAND_COLORS; }
  // without the colour file, the accent of Sunwing, its orange darkened until the white letters read on it
  const wgFill = (/background:([^;]+);/.exec(belt('WG', 'Sunwing')) || [])[1];
  assert.ok(/^#[0-9A-F]{6}$/.test(wgFill) && contrast('#FFFFFF', wgFill) >= 3 && B._orbDeltaE(wgFill, the('AIRLINE_ACCENT').WG) < 12, 'WG: ' + wgFill);
  // a code with no colour on record keeps the made-up hue (the blue of no airline is no colour)
  assert.match(belt('ZG', 'Zipair'), /style="background:hsl\(\d+,45%,32%\);"/);
  // WESTJET ENCORE: a lockup is all its row has, and the strip draws the WestJet leaf for it from its
  // table. The belt draws that leaf in the square, as the strip and the countdown do
  assert.equal(lockup(the('mkLogo')('WR', '')), true, 'Encore: a lockup on its row');
  const wr = belt('WR', '');
  assert.match(wr, /^<img class="full-logo" data-code="WR" data-logo-set="emblem" alt="[^"]+" src="\/logos\/airlines\/canadian\/westjet-2025\/WestJet-leaf-colour\.svg" onerror="window\._gateMarkMiss\(this\)">$/);
  assert.ok(onDisk(srcOf(wr)) && srcOf(wr) === B._BW_EMBLEM.WR);
  assert.equal(lockup(wr), false);
  // a tile, a monogram: the name is typed beside it; lettering: drawn beside it
  assert.match(the('_b5Airline')({ airline: 'NH', _airlineName: 'ANA' }), /ANA\.svg[^>]*><\/span><span class="b5-aname">ANA<\/span>$/);
  assert.match(the('_b5Airline')({ airline: 'ZG', _airlineName: 'Zipair' }), /logo-monogram[^>]*>ZG<\/div><\/span><span class="b5-aname">ZIPAIR<\/span>$/);
  assert.match(the('_b5Airline')({ airline: 'AC', _airlineName: 'Air Canada' }), /<span class="b5-wm" data-name="AIR CANADA">/);
  // FOR EVERY CODE: the belt mark is the mark of the row, but where that is a lockup; never a lockup,
  // and the hall belt always names the airline beside it, typed or drawn
  const lockups = [];
  for (const code of CODES) {
    const row = the('mkLogo')(code, ''), mark = belt(code, '');
    if (lockup(row)) { lockups.push(code); assert.match(mark, /^<div class="full-logo logo-monogram"|^<img class="full-logo" data-code="[A-Z0-9]+" data-logo-set="emblem" /, code); } else assert.equal(mark, row, code);
    assert.equal(lockup(mark), false, code);
    assert.match(the('_b5Airline')({ airline: code, _airlineName: '' }), /<span class="b5-(?:aname|wm)"/, code + ': its name beside the mark');
  }
  assert.deepEqual(lockups, ['WG']);
  for (const c of lockups) assert.ok(!TILE[c] && !WM[c] && the('LOCAL_LOGOS')[c], c);
  // every builder of the belt asks the one function: the hall line, its two tags, and both belt rows
  // (which share one mark); the name is typed on both rows whatever the mark is
  const hallSrc = CORE.slice(CORE.indexOf('function _b5Airline(f) {'), CORE.indexOf('function _b5LaterItem(f, c) {') + 900);
  assert.equal(hallSrc.split('_beltLogo(f.airline, f._airlineName)').length - 1, 3, 'the hall line and its two tags');
  assert.doesNotMatch(hallSrc, /mkLogo\(/);
  assert.match(CORE, /const logoHtml = _beltLogo\(f\.airline, f\._airlineName\);/);
  assert.match(CORE, /<div class="b3-tile">\$\{logoHtml\}<\/div>/);
  assert.match(CORE, /<div class="bidsv2-airline-block">\$\{logoHtml\}<\/div>/);
  assert.match(CORE, /const _bAirlineHtml = _bidsEmblemOnly \? '' : \(\(_bWmBase && !_bTypesName\)/);
  assert.doesNotMatch(CORE, /_bNoName/);
  assert.equal(CORE.split('_beltLogo(').length - 1, 5, 'four callers and the function');
});

// ── Corendon: each code prints its own airline ─────────────────────────────
// XC is Corendon Airlines of Turkey (ICAO CAI), XR Corendon Airlines Europe of Malta (ICAO CXI). The
// name table had the two the other way round, so a Turkish XC row printed CORENDON EU. Both draw the
// one figure of the group (the CAI tile, above).
test('Corendon: XC prints Corendon, XR Corendon Europe, on the board and in the app', () => {
  assert.deepEqual([NAME.XC, NAME.XR], ['CORENDON', 'CORENDON EU']);
  assert.deepEqual([SHARED.FIDS_SHARED_AIRLINE.XC, SHARED.FIDS_SHARED_AIRLINE.XR], ['CORENDON', 'CORENDON EU'], 'the app copy');
  assert.deepEqual([TILE.XC, TILE.XR], ['CAI', 'CAI']);
});

// ── 9. Central Mountain Air ────────────────────────────────────────────────
test('Central Mountain Air is an airline of its own: its name and its number, never Air Canada', () => {
  const PARENT = plain(the('PARENT'));
  assert.equal(PARENT['9M'], undefined, 'not folded into Air Canada');
  assert.deepEqual([NAME['9M'], NAME2['9M']], ['CENTRAL MOUNTAIN AIR', 'Central Mountain Air']);
  assert.equal(SHARED.FIDS_SHARED_AIRLINE['9M'], 'CENTRAL MOUNTAIN AIR', 'the app copy');
  assert.doesNotMatch((/const REGIONAL_FAM=\{[^}]*\}/.exec(APP) || [''])[0], /9M/, 'the app family table');
  assert.doesNotMatch((/const REGIONAL_OP=\{[^}]*\}/.exec(APP) || [''])[0], /9M/);
  // a row of the Prince George feed: 9M708 from Terrace
  const AT = new Date(Math.floor(Date.now() / 3600000) * 3600000 + 3600000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  const row = { number: '9M 708', status: 'Expected', arrival: { scheduledTime: { local: AT, utc: AT }, airport: { iata: 'YXS' }, airline: { iata: '9M', name: 'Central Mountain Air' } },
    departure: { airport: { iata: 'YXT', name: 'Terrace' } }, airline: { iata: '9M', name: 'Central Mountain Air' } };
  const out = the('mapADB')({ arrivals: [row] }, 'arr');
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].airline, out[0].flight], ['9M', '9M708'], 'its own code and its own number');
  assert.equal(String(the('tcAirline')(out[0]._airlineName || NAME[out[0].airline], out[0].airline)), 'Central Mountain Air');
  // no Air Canada art, lettering, fold, family or alliance
  assert.match(the('mkLogo')('9M', ''), /^<div class="full-logo logo-monogram" data-code="9M"[^>]*>9M<\/div>$/, 'no art on disk: the monogram');
  assert.equal(WM['9M'], undefined); assert.equal(TILE['9M'], undefined); assert.equal(EMBLEM['9M'], undefined);
  assert.equal(the('AIRLINE_EMBLEM_FILES')['9M'], undefined);
  assert.equal(the('_orbEmblemCarrier')('9M'), '9M');
  assert.equal(the('_gateFamily')('9M'), '9M', 'its own pool of aeroplanes');
  assert.equal(the('_CS_REGIONAL_FAM')['9M'], undefined);
  assert.equal(the('_fidsCsCarrier')('9M708'), '9M');
  assert.equal(the('_welcomeCardEmblem')('9M').src, '');
  assert.doesNotMatch(CORE, /'9M'\s*:\s*'(?:star|AC|air-canada|AIR CANADA|Air Canada)'/);
  for (const text of [the('mkCardLogo')('9M', ''), B._gateCardOrb('9M', '').html, B._gateOrbParts('9M').path, the('carrierLogoUrl')('9M')]) assert.doesNotMatch(String(text), /air-canada|AC\.TO|ACA-black/i);
  // the other two codes of that fold were looked at and left as they were: no airline flies under
  // either as a partner of Air Canada today, and neither is on a recorded row
  assert.deepEqual([PARENT.ZX, PARENT['9L']], ['AC', 'AC']);
  // an Air Canada row is untouched
  const ac = the('mapADB')({ arrivals: [Object.assign({}, row, { number: 'AC 8421', airline: { iata: 'AC', name: 'Air Canada' }, arrival: Object.assign({}, row.arrival, { airline: { iata: 'AC', name: 'Air Canada' } }) })] }, 'arr');
  assert.deepEqual([ac[0].airline, ac[0].flight], ['AC', 'AC8421']);
});


// ── 10. the Welcome card ───────────────────────────────────────────────────
test('the Welcome card has the letter height of every lettering whose tallest line is under three quarters of its box', () => {
  const T = plain(the('WELCOME_CARD_LETTER_HEIGHT')), pick = the('_welcomeCardPick');
  // THE RULE OF THE TABLE: the card sizes the box of a lettering, and rule 1 (a logo at least as
  // large as the text beside it) is about its letters. A lettering set on two or three lines, or
  // one whose letters are a part of its height, is listed with the share its letters fill, and
  // the card draws the box that much taller. Five of the letterings named since are stacked and
  // were not listed (Kuwait, Oman Air, Singapore, Air Algerie, Brussels): their name came out
  // at a quarter to two thirds of the size asked. The table was checked for the entries it had,
  // never for the ones it lacked. Here every lettering the card can draw is read, and one whose
  // tallest line of ink is under three quarters of its box must be listed.
  const codes = [...new Set([...Object.keys(WM), ...Object.keys(plain(the('WELCOME_CARD_WORDMARK'))), ...Object.keys(T), ...Object.keys(plain(the('_FB_WM_ICAO')))])].sort();
  const missing = [], files = new Set();
  for (const code of codes) {
    const u = bare(the('_welcomeCardName')(code).wordmark);
    if (!u) continue;
    assert.ok(onDisk(u), code + ': ' + u);
    files.add(u);
    const lines = picture(u).lines, tallest = Math.max(...lines), entry = pick(T, code);
    assert.ok(lines.length >= 1 && tallest > 0.05 && tallest <= 1, code + ': ' + u + ' has lines of ' + lines.map((x) => x.toFixed(2)).join(' '));
    if (tallest < 0.75 && entry === undefined) missing.push(code + ' (' + u + ': its tallest line is ' + tallest.toFixed(2) + ' of its box)');
    // an entry is never more than the tallest line the art has: letters cannot be taller than their line
    if (entry !== undefined) assert.ok(entry > 0.15 && entry <= tallest + 0.03, code + ': ' + entry + ' against a tallest line of ' + tallest.toFixed(2));
  }
  assert.deepEqual(missing, [], 'stacked lettering with no letter height:\n' + missing.join('\n'));
  assert.ok(files.size >= 75, files.size + ' letterings read');
  // THE SIX ADDED, each measured from its white cut: the line that carries the name, capitals (or
  // ascenders, or the height of lower case with none) to baseline, as a share of the box. The
  // line is named by its place: Kuwait is script, KUWAIT, AIRWAYS; Oman Air and Air Algerie
  // end on the name; Singapore and Brussels begin with it; avianca is one word under the dot of
  // its i, which the reader sees as a line of its own.
  const NAME_LINE = { KU: [1, 0.24], WY: [-1, 0.34], SQ: [0, 0.35], AH: [-1, 0.44], SN: [0, 0.62], AV: [-1, 0.73] };
  for (const [code, [at, want]] of Object.entries(NAME_LINE)) {
    const lines = picture(the('_welcomeCardName')(code).wordmark).lines, line = lines[at < 0 ? lines.length + at : at];
    assert.equal(T[code], want, code);
    assert.ok(lines.length >= 2 && Math.abs(line - want) < 0.012, code + ': its name line is ' + line.toFixed(3) + ' of the box, among ' + lines.map((x) => x.toFixed(3)).join(' '));
    assert.equal(the('_welcomeCardData')(code).letterHeight, want, code + ': the card is handed it');
  }
  // a lettering whose letters fill its box is not listed, and the card is handed 1
  for (const code of ['AC', 'TK', 'KE', 'CX', 'UX', 'EI']) { assert.equal(pick(T, code), undefined, code); assert.equal(the('_welcomeCardData')(code).letterHeight, 1, code); }
});

// ── 11. lettering and no mark; Pascan under its second code ────────────────
test('lettering and no mark of any kind is the monogram, never an empty slot; a regional keeps the slot of its airline', () => {
  const mk = the('mkLogo');
  // World Atlantic: lettering, and no tile, emblem or lockup. Miami files it under its designator,
  // and both codes draw the monogram of its two-letter code beside the lettering
  for (const code of ['WL', 'WAL']) {
    assert.equal(WM[code], 'world-atlantic', code);
    assert.ok(!TILE[code] && !EMBLEM[code] && !the('LOCAL_LOGOS')[code], code + ': no mark of any kind');
    assert.match(mk(code, ''), /^<div class="full-logo logo-monogram" data-code="WL" style="background:[^"]+;">WL<\/div>$/, code);
    const hall = the('_b5Airline')({ airline: code, _airlineName: 'World Atlantic' });
    assert.match(hall, /^<span class="b5-emb"><div class="full-logo logo-monogram"[^>]*>WL<\/div><\/span><span class="b5-wm" data-name="WORLD ATLANTIC">/, code + ': the belt line');
  }
  assert.equal(mk('WAL', ''), mk('WL', ''), 'one airline, one square');
  // FOR EVERY CODE WITH LETTERING: a mark in the slot, but for the regionals that wear the lettering
  // of the airline they fly for (the rows hand the code of that airline here, never theirs) and a
  // carrier with a lockup on file, which keep the empty slot they had
  const PARENT = plain(the('PARENT')), empty = [];
  for (const code of Object.keys(WM)) {
    const html = mk(code, '');
    if (html === '') { empty.push(code); assert.ok(PARENT[code] || the('LOCAL_LOGOS')[code], code + ': an empty slot only for a regional or a lockup'); continue; }
    assert.match(html, /data-logo-set="(?:tile|emblem)"|logo-monogram/, code);
  }
  assert.deepEqual(empty.sort(), ['4C', '9E', '9L', 'MQ', 'OH', 'PT', 'RV', 'ZX']);
  for (const code of empty) assert.ok(PARENT[code], code + ' prints ' + PARENT[code]);
  // the branch, as written: the monogram of the two-letter code, then the bare return for those two kinds
  const body = CORE.slice(CORE.indexOf('function mkLogo(code, faName) {'), CORE.indexOf('// ── LANGUAGE STRINGS & THEME SYSTEM'));
  assert.match(body, /if \(!LOCAL_TRANSPARENT_LOGOS\[c\] && !_wears\) \{\n\s*return _monogramTile\(\(typeof _designatorIata === 'function' && _designatorIata\(c\)\) \|\| c, displayName\);\n\s*\}\n\s*return ''; \/\/ no tile, wordmark alone/);
});

test('Pascan under its second code draws the lettering its first code draws, where that is drawn', () => {
  // P6 is Pascan as Saint John files it (four recorded rows). On a board row neither code draws
  // lettering: BQ has none in the lettering table, and types PASCAN beside the square that letters
  // BQ; P6 types its name beside its own letters, since a lettered square is drawn only for the
  // code it letters. Where BQ does draw the lettering of Pascan, P6 typed the name: the gate band,
  // the phone gate header and the Operated-by caption. One row beside BQ and PSC in each table.
  const light = '/logos/airlines/canadian-regional/pascan-wordmark-light.svg', colour = '/logos/airlines/canadian-regional/pascan-wordmark-color.svg';
  for (const u of [light, colour]) assert.ok(onDisk(u), u);
  assert.equal(the('_orbEmblemCarrier')('P6'), 'BQ');
  assert.deepEqual([WM.BQ, WM.P6], [undefined, undefined], 'neither is in the lettering table of the rows');
  for (const code of ['BQ', 'PSC', 'P6']) {
    assert.deepEqual([the('_mgHeaderLogoSrc')(code, true), the('_mgHeaderLogoSrc')(code, false)], [light, colour], code + ': the phone gate header');
    assert.deepEqual([the('operatorLogoUrl')(code), the('operatorLogoUrlThemed')(code, true), the('operatorLogoUrlThemed')(code, false)], [colour, light, colour], code + ': the caption');
    assert.deepEqual(plain(the('OPBY_WORDMARKS_THEMED')[code]), { onDark: light, onLight: colour }, code);
  }
  // the two tables of the gate band, which live inside the builder of the gate
  const dark = CORE.slice(CORE.indexOf('var BANNER_DARK_LOGO = {'), CORE.indexOf('var BANNER_LIGHT_LOGO = {'));
  const pale = CORE.slice(CORE.indexOf('var BANNER_LIGHT_LOGO = {'), CORE.indexOf('var _lightLogo = _bannerIsLight'));
  for (const code of ['BQ', 'PSC', 'P6']) {
    assert.match(dark, new RegExp("'" + code + "':\\s*'" + light.replace(/[.\/]/g, '\\$&') + "'"), code + ': white lettering on a dark band');
    assert.match(pale, new RegExp("'" + code + "':\\s*'" + colour.replace(/[.\/]/g, '\\$&') + "'"), code + ': its colours on a light band');
  }
  // the row: its own letters and its typed name, as before; never the square that letters BQ
  assert.match(the('mkLogo')('P6', ''), /^<div class="full-logo logo-monogram" data-code="P6"[^>]*>P6<\/div>$/);
  assert.match(the('mkLogo')('BQ', ''), /airline-tiles\/PSC\.svg/);
  assert.equal(B._ORB_TILE_LETTERS.PSC, 'BQ');
  // and nothing else of BQ was copied under P6: no tile, no colour, no look
  assert.deepEqual([TILE.P6, the('AIRLINE_ACCENT').P6, B._GATE_ORB_LOOKS.P6, the('LOCAL_LOGOS').P6], [undefined, undefined, undefined, undefined]);
});
