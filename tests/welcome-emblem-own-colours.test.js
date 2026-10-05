'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE WELCOME CARD NEVER WHITENS AN EMBLEM, AND NEVER PUTS ONE ON A BOX.
//
// v23942 — the middle screen's Welcome card drew the carrier's emblem through
// the standard ad renderer, which white-forces its logo (brightness(0)
// invert(1)); Air France's red virgule came out as a white slash.
//
// v23994 — the card has its own renderer (_welcomeCardHtml) and applies no
// filter at all. What it draws beside the airline's name is decided per
// carrier, for every carrier that can reach the card:
//   - the airline's colour emblem, where it reads on the card's own dark
//     gradient (Air France red, the Air Canada roundel, Jazz's red J, Delta's
//     colour triangle for Delta and Delta Connection, Breeze's blue check…);
//   - the airline's own coloured tile (PAL gold, Frontier green, Hawaiian
//     purple…): the airline's artwork, a colour, never a white, grey or black
//     square;
//   - otherwise no emblem: the airline's white lettering alone
//     (WELCOME_CARD_NO_EMBLEM). Nothing is put on a white disc to make it read.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'fids-current');
const SRC = fs.readFileSync(path.join(PUB, 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(PUB, 'css', 'display-overrides.css'), 'utf8');

/** The text of a brace block starting at `start` (strings and comments skipped). */
function braceFrom(start, what) {
  assert.ok(start >= 0, what + ' must exist in fids-core.js');
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) { if (SRC[i] === '\\') { i++; continue; } if (SRC[i] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error('could not find the end of ' + what);
}
const varSource = (decl) => braceFrom(SRC.indexOf(decl), decl) + ';\n';
const fnSource = (name) => {
  const m = SRC.match(new RegExp('(^|\\n)function ' + name + '\\('));
  assert.ok(m, name + ' must be a top-level function');
  return braceFrom(m.index + (m[1] ? 1 : 0), name) + '\n';
};
const table = (decl) => { const s = braceFrom(SRC.indexOf(decl), decl); return vm.runInNewContext('(' + s.slice(s.indexOf('{')) + ')'); };

const EMBLEMS = table('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {');
const CARD_EMBLEM = table('var WELCOME_CARD_EMBLEM = {');
const NO_EMBLEM = table('var WELCOME_CARD_NO_EMBLEM = {');
const BRAND = table('const AIRLINE_BRAND = {');

// The card's own resolver, as written.
const R = vm.createContext({ AIRLINE_EMBLEM_FILES: EMBLEMS });
vm.runInContext(varSource('var WELCOME_CARD_EMBLEM = {') + varSource('var WELCOME_CARD_NO_EMBLEM = {')
  + fnSource('_welcomeCardEmblem'), R);
const emblem = (code) => JSON.parse(JSON.stringify(vm.runInContext('_welcomeCardEmblem(' + JSON.stringify(code) + ')', R)));
/** Every carrier code that can put art on the card. */
const CODES = [...new Set([...Object.keys(EMBLEMS), ...Object.keys(CARD_EMBLEM), ...Object.keys(NO_EMBLEM)])].sort();

// ── colour ─────────────────────────────────────────────────────────────────
const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
function lum(r, g, b) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const x = lum(...a), y = lum(...b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** A colour, not white, grey or black: the spread between its channels. */
const chroma = (c) => (Math.max(...c) - Math.min(...c)) / 255;
/** The two ends of the card's gradient, exactly as _welcomeCardData builds it. */
const ground = (code) => (BRAND[code] ? [BRAND[code].bg1, BRAND[code].bg2] : ['#14213d', '#0b1020']).map(hex);

/** The solid colours an SVG paints, in document order (fills and strokes; gradient stops; black where none is given). */
function svgPaints(file) {
  const text = fs.readFileSync(file, 'utf8');
  const cls = {};
  for (const st of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const r of st[1].matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const sel of r[1].split(',')) { const m = /\.([\w-]+)\s*$/.exec(sel.trim()); if (m) cls[m[1]] = (cls[m[1]] || '') + ';' + r[2]; }
  }
  const stops = {};
  for (const g of text.matchAll(/<(?:linear|radial)Gradient\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:linear|radial)Gradient>/gi)) {
    stops[g[1]] = [...g[2].matchAll(/stop-color\s*[=:]\s*"?\s*(#[0-9a-f]{3,6})/gi)].map((m) => m[1]);
  }
  const prop = (attrs, name) => {
    const own = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(attrs);
    const sty = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec((/style="([^"]*)"/.exec(attrs) || [])[1] || '');
    let fromCls = null;
    const c = /class="([^"]*)"/.exec(attrs);
    if (c) for (const k of c[1].split(/\s+/)) { const m = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec(cls[k] || ''); if (m) fromCls = m[1]; }
    return (sty && sty[1].trim()) || (fromCls && fromCls.trim()) || (own && own[1]) || null;
  };
  const SHAPE = /^(?:path|rect|circle|ellipse|polygon|polyline|text|use)$/i;
  const NOPAINT = /^(?:defs|clipPath|mask|linearGradient|radialGradient|pattern|symbol|style|title|desc|metadata)$/i;
  const out = [], stack = [{ fill: '#000000', stroke: null, hidden: false }];
  let skip = 0;
  for (const m of text.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, attrs, self] = m;
    if (close) { if (skip) { if (NOPAINT.test(name)) skip--; continue; } if (stack.length > 1) stack.pop(); continue; }
    if (skip || NOPAINT.test(name)) { if (!self && NOPAINT.test(name)) skip++; continue; }
    const top = stack[stack.length - 1];
    const op = prop(attrs, 'opacity'), fop = prop(attrs, 'fill-opacity');
    const node = { fill: prop(attrs, 'fill') || top.fill, stroke: prop(attrs, 'stroke') || top.stroke,
      hidden: top.hidden || (op !== null && Number(op) === 0) || (fop !== null && Number(fop) === 0) };
    if (SHAPE.test(name) && !node.hidden) {
      for (const v of [node.fill, node.stroke]) {
        if (!v || v === 'none') continue;
        const u = /url\(#([^)]+)\)/.exec(v);
        for (const c of (u ? (stops[u[1]] || []) : [v])) if (/^#[0-9a-f]{3,6}$/i.test(c)) out.push(hex(c));
        else if (/^white$/i.test(c)) out.push([255, 255, 255]);
        else if (/^black$/i.test(c)) out.push([0, 0, 0]);
      }
    }
    if (!self) stack.push(node);
  }
  return out;
}
/** Every opaque pixel of a PNG (8-bit, non-interlaced; colour types 0, 2, 3, 4, 6). */
function pngPixels(file) {
  return pngBufPixels(fs.readFileSync(file), file);
}
/** An SVG that is a raster in a wrapper (delta-emblem-colour.svg): its embedded PNG. */
function embeddedPng(file) {
  const m = /<image\b[^>]*xlink:href="data:image\/png;base64,([^"]+)"/.exec(fs.readFileSync(file, 'utf8'));
  return m ? Buffer.from(m[1], 'base64') : null;
}
function pngBufPixels(buf, file) {
  let p = 8, w, h, ct, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; assert.equal(d[8], 8, file); assert.equal(d[12], 0, file); }
    else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  // a large image is sampled on a grid (every row is still unfiltered: each depends on the one above)
  const step = Math.max(1, Math.floor(Math.sqrt(w * h / 250000)));
  const out = [];
  let prev = Buffer.alloc(stride), rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++], cur = Buffer.from(raw.subarray(rp, rp + stride));
    rp += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w && y % step === 0; x += step) {
      const i = x * bpp;
      let px;
      if (ct === 3) { const k = cur[x]; px = [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], trns && k < trns.length ? trns[k] : 255]; }
      else if (ct === 0) px = [cur[i], cur[i], cur[i], 255];
      else if (ct === 4) px = [cur[i], cur[i], cur[i], cur[i + 1]];
      else px = [cur[i], cur[i + 1], cur[i + 2], bpp === 4 ? cur[i + 3] : 255];
      if (px[3] > 128) out.push(px);
    }
    prev = cur;
  }
  return out;
}
const fileOf = (url) => path.join(PUB, String(url).split('?')[0]);
/** White (or near it): light and without colour. Flair's lime is light, and a colour. */
const isWhite = (c) => lum(c[0], c[1], c[2]) > 0.7 && chroma(c) < 0.25;
/** The raster pixels of a PNG, or of an SVG that only wraps one; null for vector art. */
const RASTER = new Map();
function rasterOf(url) {
  const f = fileOf(url);
  if (!RASTER.has(f)) {
    let px = null;
    if (/\.png$/i.test(f)) px = pngPixels(f);
    else if (/\.svg$/i.test(f) && !/<(?:path|rect|circle|ellipse|polygon|polyline|text)\b/i.test(fs.readFileSync(f, 'utf8'))) {
      const b = embeddedPng(f);
      if (b) px = pngBufPixels(b, f);
    }
    RASTER.set(f, px);
  }
  return RASTER.get(f);
}
/** Art that draws white and nothing else (a mark drawn to be inked white). */
function whiteOnly(url) {
  const px = rasterOf(url);
  if (px) return px.length > 0 && px.filter(isWhite).length >= 0.995 * px.length;
  const p = svgPaints(fileOf(url));
  return p.length > 0 && p.every(isWhite);
}

// ── tests ──────────────────────────────────────────────────────────────────

test('Air France keeps its red virgule on the Welcome card', () => {
  const e = emblem('AF');
  assert.deepEqual(e, { src: '/logos/airlines/european/air-france-emblem.svg?v=2', kind: 'own' });
  const fills = [...new Set(svgPaints(fileOf(e.src)).map((c) => c.join(',')))];
  assert.deepEqual(fills, ['235,33,43'], 'the virgule is one red (#EB212B), with no white to fall back on');
  for (const g of ground('AF')) assert.ok(contrast([235, 33, 43], g) >= 3, 'red on ' + g + ' = ' + contrast([235, 33, 43], g).toFixed(2));
});

test('no filter reaches the card\'s emblem or lettering, and nothing sits behind them', () => {
  const html = fnSource('_welcomeCardHtml');
  const code = html.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /filter|invert|brightness|#fff|white/i, 'the markup sets no filter and no light ground');
  assert.equal((code.match(/background/g) || []).length, 1, 'one ground: the card\'s own gradient');
  assert.match(code, /style="background:' \+ esc\(ad\.bg\) \+ ';"/);
  const block = CSS.slice(CSS.indexOf('v23994 — THE WELCOME CARD, IN THREE LINES'));
  assert.ok(block.length > 500, 'the card\'s stylesheet block');
  assert.doesNotMatch(block, /brightness\(|invert\(/, 'no whitening filter in the card\'s stylesheet');
  // the emblem's filter is a shadow, or none for a tile
  assert.match(block, /\.gwc \.gwc-emb \.gwc-emb-img \{[^}]*filter: drop-shadow\(0 1px 3px rgba\(0,0,0,0\.35\)\) !important;/);
  assert.match(block, /\.gwc \.gwc-emb\[data-kind="tile"\] \.gwc-emb-img \{[^}]*filter: none !important;/);
  assert.match(block, /\.gwc \.gwc-wm \{[^}]*filter: none !important;/);
  assert.match(block, /\.gwc \.gwc-emb \{[^}]*background: none !important;/);
  // the hook the older Welcome-card rules key on (tiles never filtered, the
  // Delta, Discover and Flair exemptions); none of them whitens
  assert.match(html, /class="gwc-emb-img gad-ad-logo"/);
  let n = 0;
  for (let at = CSS.indexOf('.gad-ad-logo'); at >= 0; at = CSS.indexOf('.gad-ad-logo', at + 1)) {
    const open = CSS.indexOf('{', at), close = CSS.indexOf('}', open);
    assert.doesNotMatch(CSS.slice(open, close), /brightness\(|invert\(/, 'a rule on .gad-ad-logo whitens, at ' + at);
    n++;
  }
  assert.ok(n >= 4, 'the .gad-ad-logo rules: ' + n);
  assert.match(CSS, /img\.gad-ad-logo\[src\*="\/logos\/airline-tiles\/"\]:not\(\[src\*="PB-arrow"\]\),/, 'the tile rule leaves out the one bare white arrow, as the orb does');
});

test('every carrier that can reach the card: its colour emblem, its own coloured tile, or none', () => {
  assert.ok(CODES.length >= 55, 'carriers checked: ' + CODES.length);
  const problems = [];
  for (const code of CODES) {
    const e = emblem(code);
    if (NO_EMBLEM[code]) { if (e.kind !== 'none') problems.push(code + ': listed with no emblem, draws ' + e.src); continue; }
    if (e.kind === 'none') { problems.push(code + ': no emblem and not on the list'); continue; }
    const f = fileOf(e.src);
    if (!fs.existsSync(f)) { problems.push(code + ': ' + e.src + ' does not exist'); continue; }
    if (whiteOnly(e.src)) { problems.push(code + ': ' + e.src + ' is drawn white'); continue; }
    const g = ground(code);
    const px = rasterOf(e.src);
    if (px) {
      // the share of the mark's ink at 3:1 on both ends of its card. Delta's
      // triangle reads on its bright half (#E01933) and not on its dark one,
      // as on Delta's own gate: colour art, never whitened.
      const reads = px.filter((q) => g.every((gg) => contrast(q.slice(0, 3), gg) >= 3)).length / px.length;
      if (reads < 0.4) problems.push(code + ': ' + e.src + ' reads ' + (100 * reads).toFixed(0) + '%');
      continue;
    }
    const paints = svgPaints(f);
    // a square with a ground of its own (a tile, or a symbol drawn on its
    // square): the ground is a colour, never a white, grey or black box
    if (e.kind === 'tile' || /\/logos\/symbols\/airlines\//.test(e.src)) {
      const first = paints[0];
      if (!first || chroma(first) < 0.25) problems.push(code + ': ' + e.src + ' sits on a ' + (first ? '#' + first.map((v) => v.toString(16).padStart(2, '0')).join('') : '?') + ' square');
      continue;
    }
    // a mark straight on the card: some of its colour reads there at 3:1
    if (!paints.some((c) => !isWhite(c) && g.every((gg) => contrast(c, gg) >= 3))) {
      problems.push(code + ': no colour of ' + e.src + ' reads at 3:1 on its card');
    }
  }
  assert.deepEqual(problems, []);
});

test('the carriers shown with their white lettering alone, and why', () => {
  assert.deepEqual(Object.keys(NO_EMBLEM).sort(), ['AA', 'EW', 'FI', 'MQ', 'NZ', 'OH', 'PD', 'PT', 'QR', 'QTR', 'ROU', 'RV']);
  for (const [code, why] of Object.entries(NO_EMBLEM)) assert.ok(why.length > 10, code + ' needs its reason');
  // what each would otherwise draw, and why that is not drawn
  assert.ok(whiteOnly(EMBLEMS.PD), "Porter's p is drawn white");
  for (const g of ground('FI')) assert.ok(contrast(hex('#001b71'), g) < 3, "Icelandair's navy fin on its card");
  const tileGround = (t) => svgPaints(path.join(PUB, 'logos', 'airline-tiles', t))[0];
  assert.ok(chroma(tileGround('AAL.svg')) < 0.25 && lum(...tileGround('AAL.svg')) > 0.6, "American's tile is a light square");
  assert.ok(chroma(tileGround('QTR.svg')) < 0.25 && lum(...tileGround('QTR.svg')) > 0.9, "Qatar's tile is a white square");
  assert.ok(chroma(tileGround('NZ-Emblem.svg')) < 0.25 && lum(...tileGround('NZ-Emblem.svg')) < 0.05, "Air New Zealand's tile is black, its koru white");
  assert.ok(chroma(svgPaints(fileOf(EMBLEMS.EW))[0]) < 0.25, "Eurowings' wings sit on a grey square");
  for (const g of ground('RV')) assert.ok(contrast(hex('#a21c37'), g) < 3, "Rouge's burgundy r on its card");
  // and every one of them still says who it is, in white lettering
  for (const code of Object.keys(NO_EMBLEM)) {
    assert.ok(EMBLEMS[code] || CARD_EMBLEM[code] || ['AA', 'FI', 'NZ', 'PD', 'QR'].includes(code), code);
  }
});

test('colour art in place of the orb\'s white marks, and the open list is closed', () => {
  // Delta Connection: Delta's own colour triangle, the file Delta's card draws
  assert.equal(emblem('9E').src, '/logos/airlines/us-major/delta-emblem-colour.svg');
  assert.equal(emblem('DL').src, '/logos/airlines/us-major/delta-emblem-colour.svg');
  assert.match(EMBLEMS.DL, /delta-widget-monochrome-white\.svg/, 'the orb keeps its own white widget');
  // Breeze: its blue check, not the white wordmark the card used to put here
  assert.equal(emblem('MX').src, '/logos/airlines/us-major/breeze-check.svg');
  // Jazz: the red J the orb uses, now drawn as it is (no filter)
  assert.deepEqual(emblem('QK'), { src: '/logos/airlines/canadian-regional/jazz-j.svg', kind: 'own' });
  assert.deepEqual([...new Set(svgPaints(fileOf(EMBLEMS.QK)).map((c) => c.join(',')))].length >= 1, true);
  for (const g of ground('QK')) assert.ok(svgPaints(fileOf(EMBLEMS.QK)).some((c) => contrast(c, g) >= 3), 'the red J on Jazz\'s card');
  // the airline's own coloured tiles
  assert.deepEqual(emblem('PB'), { src: '/logos/airline-tiles/PB.svg', kind: 'tile' });
  assert.deepEqual(emblem('SP'), { src: '/logos/airline-tiles/PB.svg', kind: 'tile' });
  assert.match(EMBLEMS.PB, /PB-arrow\.svg/, 'the orb keeps its arrow');
  assert.deepEqual(emblem('F9'), { src: '/logos/airline-tiles/FFT.svg', kind: 'tile' });
  assert.deepEqual(emblem('HA'), { src: '/logos/airline-tiles/HAL.svg', kind: 'tile' });
  // British Airways: the speedmarque beside the wordmark, on one line
  for (const c of ['BA', 'BAW', 'CJ']) assert.equal(emblem(c).src, '/logos/airlines/european/british-airways-speedmarque.svg', c);
  // WestJet and Encore: the colour leaf
  for (const c of ['WS', 'WR']) assert.equal(emblem(c).src, '/logos/airlines/canadian/westjet-2025/WestJet-leaf-colour.svg', c);
});

test('Air Canada\'s roundel and its feeders\' read in their own red', () => {
  for (const code of ['AC', 'AC1', 'ZX', '9M', '9L']) {
    const e = emblem(code);
    assert.deepEqual(e, { src: '/logos/airlines/canadian/AC.TO.svg', kind: 'own' }, code);
    const fills = [...new Set(svgPaints(fileOf(e.src)).map((c) => c.join(',')))];
    assert.equal(fills.length, 1, code + ' is a single-ink mark');
    for (const g of ground(code)) assert.ok(contrast(fills[0].split(',').map(Number), g) >= 3, code + ' on ' + g);
  }
});

test('the old Welcome-card tables and the white disc are gone', () => {
  assert.doesNotMatch(SRC, /_FB_WELCOME_LOGO|_FB_WELCOME_OWN_COLOURS|_FB_LOGO_HAS_NAME|logoOwnColours/);
  assert.doesNotMatch(SRC, /gad-ad-logo-disc|_FB_WELCOME_ON_DISC|logoDisc|gwc-disc/);
  assert.doesNotMatch(fnSource('_welcomeCardHtml').replace(/\/\/[^\n]*/g, ''), /disc/i);
});
