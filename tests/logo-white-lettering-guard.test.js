'use strict';

// WHY THIS EXISTS
//
// A logo whose lettering sits on a dark or coloured ground is shown in WHITE
// LETTERING: the airline's or operator's published white file, or, where none
// is published, the repo's own vector file with the same letter paths filled
// white (for a bitmap, the same pixels in white at their own alpha). It is
// never put on a white box, mount, plate, pill, disc or tile to make it read.
// That mistake was made more than once: the lower panel's white "mount" for
// operator marks (v23940), the gate banner's white plate for BoA, a white
// tile behind the airline's mark on the board's cancelled rows, on the navy
// board, on the belts and in the Studio's rows, and a white disc on the
// Welcome card (never merged).
//
// Emblems (symbols) are a separate rule: they keep their own colours and are
// NEVER WHITENED. Whitening a tile (an opaque square) makes a solid white
// square; whitening an emblem flattens it. The approved gate orb treatment is
// a white outer disc with the emblem in its own colours inside (v23444); it
// is allowed below, by name.
//
// This guard fails if:
//   1. the lower panel's picker (_opbyBarPick) names a mount, on any bar, or
//      an operator on any carrier it flies for reads under 3:1 there;
//   2. the contrast pass puts a mount class on a mark, or any stylesheet
//      styles one;
//   3. an operator with a mark on file has no pair, a pair's dark half draws
//      anything but white, or the phone gate's light theme is handed white
//      lettering for its white panel; a white-lettering bitmap has a pixel
//      that is not white;
//   4. any rule, in any stylesheet, any <style> block of a page, or any CSS
//      a script writes, gives a logo, an emblem, a mark or the box/disc/chip/
//      pill/badge/tile/plate around one a light ground: as a colour, through
//      a custom property, or as an inset box-shadow that fills it (the
//      allowlist below says why each exception is not a logo on a dark
//      ground);
//   5. a script, in any file, writes such a ground: in markup it builds
//      (strings joined across lines included), through .style.background,
//      setProperty or cssText;
//   6. a whitening filter reaches an emblem or a tile: a stylesheet rule, the
//      gate orb's recipe, the Welcome card's renderer, or the board's
//      cancelled and diverted rows;
//   7. a white file lands on the gate banner's light band, or a lettering
//      file used on these surfaces has a light box baked into it;
//   8. one of the places this was found paints white again.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const FC = path.join(root, 'fids-current');
const CORE = fs.readFileSync(path.join(FC, 'js', 'fids-core.js'), 'utf8');

// ── source helpers ──────────────────────────────────────────────────────────
/** The text of a brace block starting at `start` (strings and comments skipped). */
function braceFrom(SRC, start, what) {
  assert.ok(start >= 0, what + ' must exist');
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); if (i < 0) break; continue; }
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
/** A top-level function declaration of fids-core.js. */
const fnSource = (name) => {
  const m = CORE.match(new RegExp('(^|\\n)function ' + name + '\\('));
  assert.ok(m, name + ' must exist');
  return braceFrom(CORE, m.index + (m[1] ? 1 : 0), name) + '\n';
};
/** A `var NAME = { ... };` (or window./const) block of fids-core.js, as source. */
const blockSource = (prefix) => braceFrom(CORE, CORE.indexOf(prefix), prefix) + ';\n';
/** The same block, evaluated. */
const table = (prefix) => {
  const src = braceFrom(CORE, CORE.indexOf(prefix), prefix);
  return vm.runInNewContext('(' + src.slice(src.indexOf('{')) + ')');
};
/** A nested table inside a function: `var NAME = {` ... evaluated. */
const innerTable = (decl) => table(decl);

// ── colour helpers ─────────────────────────────────────────────────────────
function lum(r, g, b) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const x = lum(...a), y = lum(...b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const NAMED = { white: [255, 255, 255], snow: [255, 250, 250], ivory: [255, 255, 240], whitesmoke: [245, 245, 245],
  ghostwhite: [248, 248, 255], floralwhite: [255, 250, 240], linen: [250, 240, 230], azure: [240, 255, 255],
  mintcream: [245, 255, 250], aliceblue: [240, 248, 255], seashell: [255, 245, 238], gainsboro: [220, 220, 220],
  lightgray: [211, 211, 211], lightgrey: [211, 211, 211], silver: [192, 192, 192], beige: [245, 245, 220],
  black: [0, 0, 0], navy: [0, 0, 128] };
/** Every colour named in a CSS value, as [r, g, b, a]. */
function colours(v) {
  const out = [];
  for (const m of String(v).matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)|\b([a-z]+)\b/gi)) {
    if (m[1]) {
      let h = m[1];
      if (h.length <= 4) h = [...h].map((c) => c + c).join('');
      out.push([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1]);
    } else if (m[2]) {
      out.push([+m[2], +m[3], +m[4], m[5] === undefined ? 1 : (m[5].endsWith('%') ? parseFloat(m[5]) / 100 : +m[5])]);
    } else if (m[6] && NAMED[m[6].toLowerCase()]) out.push([...NAMED[m[6].toLowerCase()], 1]);
  }
  return out;
}
const isLight = (c) => c[3] >= 0.5 && lum(c[0], c[1], c[2]) > 0.6;

// ── every source the boards are built from ─────────────────────────────────
const CSS_FILES = fs.readdirSync(path.join(FC, 'css')).filter((n) => n.endsWith('.css')).map((n) => 'css/' + n);
const HTML_FILES = [...fs.readdirSync(FC).filter((n) => n.endsWith('.html')),
  ...fs.readdirSync(path.join(FC, 'studio')).filter((n) => n.endsWith('.html')).map((n) => 'studio/' + n)];
const JS_FILES = [...fs.readdirSync(path.join(FC, 'js')).filter((n) => n.endsWith('.js')).map((n) => 'js/' + n),
  ...fs.readdirSync(path.join(FC, 'data')).filter((n) => n.endsWith('.js')).map((n) => 'data/' + n)];
const READ = new Map();
const read = (f) => { if (!READ.has(f)) READ.set(f, fs.readFileSync(path.join(FC, f), 'utf8')); return READ.get(f); };
/** The <style> blocks of a page, each with the line it starts on. */
const styleBlocks = (f) => [...read(f).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ text: m[1], line: read(f).slice(0, m.index).split('\n').length }));

// Custom properties, wherever they are set: stylesheets, page <style> blocks,
// and the strings scripts write (a light ground can hide behind var()).
const VARS = {};
for (const text of [...CSS_FILES.map(read), ...HTML_FILES.map(read), ...JS_FILES.map(read)]) {
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;}'"`\n]+)/g)) (VARS[m[1]] = VARS[m[1]] || new Set()).add(m[2].trim());
}
/** A value with every var() replaced by every value that property is ever given (and its fallback). */
function resolveVars(v, depth = 0) {
  if (depth > 4 || !/var\(/.test(v)) return v;
  return resolveVars(v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g,
    (_, n, fb) => [...(VARS[n] || []), fb || ''].join(' ')), depth + 1);
}
/** Is a declaration a light ground? background/-color/-image all light; an inset box-shadow that fills. */
function lightGround(prop, value) {
  const v = resolveVars(String(value)).replace(/!important/g, '').replace(/url\([^)]*\)/g, '');
  if (/^box-shadow$/i.test(prop)) {
    // An inset shadow with a spread is a fill painted inside the box.
    return v.split(/,(?![^(]*\))/).some((sh) => {
      if (!/\binset\b/.test(sh)) return false;
      const lens = (sh.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\binset\b/gi, ' ').match(/-?[\d.]+(?:px|em|rem|vh|vw|vmin|vmax|cqw|%)?/g) || []).map(parseFloat);
      const spread = lens[3] || 0;
      return spread >= 6 && colours(sh).some(isLight);
    });
  }
  const cs = colours(v);
  return cs.length > 0 && cs.every(isLight);
}
/** Every rule in a stylesheet text: { line, sels, body }, comments blanked so lines still count. */
function cssRules(text, baseLine = 1) {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const out = [];
  for (const m of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const lead = m[1].search(/\S|$/);
    out.push({ line: baseLine + css.slice(0, m.index + lead).split('\n').length - 1, sels: m[1].split(',').map((s) => s.trim()).filter(Boolean), body: m[2] });
  }
  return out;
}
/** A selector without the house specificity boosters. */
const plain = (s) => s.replace(/(?::not\(#_\))+/g, '').replace(/(?::not\(\._\))+/g, '').replace(/\s+/g, ' ').trim();
/** Every stylesheet rule the boards can apply: the .css files and every page's <style> blocks. */
function allRules() {
  const out = [];
  for (const f of CSS_FILES) for (const r of cssRules(read(f))) out.push({ f, ...r });
  for (const f of HTML_FILES) for (const b of styleBlocks(f)) for (const r of cssRules(b.text, b.line)) out.push({ f, ...r });
  return out;
}
const RULES = allRules();

// A selector that names a logo, an emblem or a mark, or the box a board puts
// one in: a mount, plate, disc, chip, pill, badge, tile or orb.
const LOGO_SEL = /logo|wordmark|opby|operator|lockup|emblem|symbol|brand|\bmark\b|-mark\b|mount|plate|disc\b|-disc|chip|pill|badge|tile|orb\b|orbwrap|airline-block/i;

// Each exception is a light ground that is NOT behind a logo on a dark ground.
// [file, selector (plain), why]
const ALLOW = [
  [/flight-display\.css$/, /^body\[data-fids-theme="(?:cream|paper|sky)"\] \.fids-airline-logo$/, 'a light-row board theme: the white cell is the row\'s own ground'],
  [/display-overrides\.css$/, /\.g8-r1-logoslot \.g8-r1-alliance-div$/, 'a 1-2px divider line between the alliance mark and the wordmark'],
  [/studio-sections\.css$/, /^\.logo-tile\.light$/, 'the Studio asset library\'s light preview, shown beside a dark one to check a file on both'],
  // The gate orbs: the approved treatment, white OUTER with the
  // carrier's own colours inside (v23444). The orb holds an emblem, never
  // lettering (v23208).
  [/display-overrides\.css$/, /\.v2-fi-icon-badge$|\.v2-fi-emblem-wrap(?::not\(\.v2-fi-emblem-native\))?$|\.g8-bir-badge$/, 'a gate orb disc: white outer, the emblem in its colours'],
  // Text, never a logo.
  [/flight-display\.css$/, /^\.fids-airport-pill$/, 'the board header\'s airport-code pill: text'],
  [/gate-display\.css$/, /\.v2-map-pill$/, 'a map label: text'],
  [/display-overrides\.css$/, /\.gl-strip \.gl-(?:pill|orb)$/, 'the gate-change strip: the new gate number and a glyph'],
  // The Studio designer's own light UI (an editor, not a board).
  [/studio(?:-canvas|-sections)?\.css$/, /^\.(?:token-chip|state-pill|col-chip|family-chip|status-chip|language-chip|template-card)\b/, 'the Studio editor\'s own light controls: text'],
  [/app\.html$/, /^\.fcard\.light \.chip(?:\.gate)?$/, 'the phone app\'s light flight card: a text chip'],
  [/studio-modules\.css$/, /^\.fx-brand$/, 'the Studio header\'s brand panel: a Light or Dark panel the designer chooses, carrying the airport name in its ink'],
];
const allowed = (f, sel) => ALLOW.some(([fr, sr]) => fr.test(f) && sr.test(sel));

// ── the lower panel's picker ───────────────────────────────────────────────
const PAIRS = table('var OPBY_WORDMARKS_THEMED = {');
const INK = table('var OPBY_ART_INK = {');
const OP_LOGO = table('var OPERATOR_LOGOS = {');
const OP_WORDMARK = table('var OPERATOR_WORDMARKS = {');
const OP_THEMED = table('var OPERATOR_LOGOS_THEMED = {');
const WHITE_ONLY = table('var OPERATOR_LOGOS_WHITE_ONLY = {');
const WHITE = new Set(['#FFFFFF', '#FFFFFE']);
const RC2 = vm.runInNewContext(
  fnSource('_rc2Rgb') + fnSource('_rc2Lin') + fnSource('_rc2Contrast')
  + CORE.slice(CORE.indexOf('var RC2_PAIRS = (function () {'), CORE.indexOf('})();', CORE.indexOf('var RC2_PAIRS = (function () {')) + 5)
  + '\n({ RC2_PAIRS: RC2_PAIRS, _rc2Contrast: _rc2Contrast });');
const PICK = vm.runInNewContext(
  fnSource('_rc2Rgb') + fnSource('_rc2Lin') + fnSource('_rc2Contrast')
  + 'var OPBY_ART_INK = ' + JSON.stringify(INK) + ';\n' + fnSource('_opbyBarPick') + '\n_opbyBarPick;');
const halvesOf = (pr) => [pr.onDark, pr.onLight, ...Object.values(pr.inBarInk || {})];

test('1. the lower panel\'s picker never names a mount, and every operator reads at 3:1 on its carrier\'s bar', () => {
  // Every bar colour on a 6-step cube (216 colours, from black to white),
  // both sides and several inks, for every operator with a pair and every
  // mark without one.
  const steps = ['00', '33', '66', '99', 'CC', 'FF'];
  const bars = [];
  for (const r of steps) for (const g of steps) for (const b of steps) bars.push('#' + r + g + b);
  const marks = [...new Set([...Object.keys(OP_LOGO), ...Object.keys(OP_WORDMARK), ...Object.keys(PAIRS)])];
  let runs = 0;
  for (const bar of bars) {
    for (const dark of [true, false]) {
      for (const ink of ['#FFFFFF', '#002B55', '#0F172A', undefined]) {
        for (const op of marks) {
          const got = PICK(PAIRS[op], OP_WORDMARK[op] || OP_LOGO[op], bar, dark, ink);
          assert.deepEqual(Object.keys(got), ['src'], `${op} on ${bar}: the art and nothing else`);
          if (PAIRS[op]) assert.ok(halvesOf(PAIRS[op]).includes(got.src), `${op} on ${bar}: one of its halves`);
          runs++;
        }
      }
    }
  }
  assert.ok(runs > 40000, 'runs: ' + runs);
  assert.deepEqual(JSON.parse(JSON.stringify(PICK(null, '/x.svg', '#000000', true, '#FFFFFF'))), { src: '/x.svg' });

  // 3:1, no exceptions: every operator on every carrier it flies for (the
  // board's own _CS_REGIONAL_FAM, the contracts it lists under one carrier
  // only, and each operator's ICAO form), on that carrier's bar, side and ink.
  const fam = vm.runInNewContext('(' + /var _CS_REGIONAL_FAM = (\{[^}]*\});/.exec(CORE)[1] + ')');
  const fliesFor = [];
  for (const [op, carrier] of Object.entries(fam)) fliesFor.push([carrier, op]);
  fliesFor.push(['DL', 'OO'], ['AA', 'OO'], ['AS', 'OO'], ['DL', 'YX'], ['AA', 'YX'], ['DL', 'G7'], ['PD', 'PTR']);
  const ICAO = { QK: 'JZA', RV: 'ROU', PB: 'PVL', WR: 'WEN', MQ: 'ENY', OH: 'PSA', PT: 'PDT', '9E': 'EDV', OO: 'SKW', YV: 'ASH', G7: 'GJS', YX: 'RPA', QX: 'QXE', BQ: 'PSC' };
  for (const [c, o] of [...fliesFor]) if (ICAO[o]) fliesFor.push([c, ICAO[o]]);
  let measured = 0;
  for (const [carrier, op] of fliesFor) {
    const p = RC2.RC2_PAIRS[carrier];
    if (!p || !(OP_WORDMARK[op] || OP_LOGO[op])) continue;
    const dark = lum(...colours(p.ink)[0]) > lum(...colours(p.a)[0]);
    const got = PICK(PAIRS[op], OP_WORDMARK[op] || OP_LOGO[op], p.a, dark, p.ink).src;
    const inks = INK[got];
    assert.ok(inks && inks.length, `${op} for ${carrier}: the colours of ${got} are on file`);
    const worst = Math.min(...inks.map((h) => RC2._rc2Contrast(h, p.a)));
    assert.ok(worst >= 3, `${op} for ${carrier} on ${p.a}: ${got} at ${worst.toFixed(2)}:1, under 3:1`);
    measured++;
  }
  assert.ok(measured >= 30, 'operators measured on their carriers\' bars: ' + measured);
});

test('2. no mount class is put on a mark, and no stylesheet styles one', () => {
  const fix = fnSource('_opbyContrastFix');
  assert.doesNotMatch(fix, /classList\.(?:add|toggle)\(\s*'v2-rc-opby-mount'/, 'the pass never puts the class on');
  assert.doesNotMatch(fnSource('_opbyBarPick'), /mount/, 'the picker has no mount');
  for (const r of RULES) {
    for (const s of r.sels) assert.doesNotMatch(s.replace(/:not\([^()]*\)/g, ''), /opby-mount|logo-mount|logo-plate|logo-badge\b|logo-disc/, `${r.f}:${r.line}: a rule styles a logo mount, plate or disc`);
  }
});

// ── white-only art ─────────────────────────────────────────────────────────
/** Every opaque pixel of a PNG: [r, g, b, a]. 8-bit, non-interlaced, colour types 2, 3 and 6. */
function pngPixels(file) {
  const buf = fs.readFileSync(file);
  let p = 8, w, h, ct, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; assert.equal(d[8], 8, file); assert.equal(d[12], 0, file); }
    else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  assert.ok(ct === 6 || ct === 2 || ct === 3, file + ': colour type ' + ct);
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 1, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
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
    for (let x = 0; x < w; x++) {
      if (ct === 3) { const k = cur[x]; out.push([plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], trns && k < trns.length ? trns[k] : 255]); continue; }
      const i = x * bpp; out.push([cur[i], cur[i + 1], cur[i + 2], bpp === 4 ? cur[i + 3] : 255]);
    }
    prev = cur;
  }
  return out;
}
/** The colours an SVG paints with (fills and strokes, attribute, style or class; black where none says), ignoring opacity-0 parts. */
function svgPaints(text) {
  const cls = {};
  for (const st of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const r of st[1].matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const sel of r[1].split(',')) { const m = /\.([\w-]+)\s*$/.exec(sel.trim()); if (m) cls[m[1]] = (cls[m[1]] || '') + ';' + r[2]; }
  }
  const stops = {};
  for (const g of text.matchAll(/<(?:linear|radial)Gradient\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:linear|radial)Gradient>/gi)) {
    stops[g[1]] = [...g[2].matchAll(/stop-color\s*[=:]\s*"?\s*(#[0-9a-f]{3,6}|[a-z]+)/gi)].map((m) => m[1]);
  }
  const prop = (attrs, name) => {
    const own = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(attrs);
    const sty = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec((/style="([^"]*)"/.exec(attrs) || [])[1] || '');
    let fromCls = null;
    const c = /class="([^"]*)"/.exec(attrs);
    if (c) for (const k of c[1].split(/\s+/)) { const m = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec(cls[k] || ''); if (m) fromCls = m[1]; }
    return (sty && sty[1].trim()) || (fromCls && fromCls.trim()) || (own && own[1]) || null;
  };
  const SHAPE = /^(?:path|rect|circle|ellipse|polygon|polyline|line|text|tspan|use)$/i;
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
      if (node.fill && node.fill !== 'none') { const u = /url\(#([^)]+)\)/.exec(node.fill); for (const c of (u ? (stops[u[1]] || []) : [node.fill])) out.push({ name, attrs, colour: colours(c)[0] }); }
      if (node.stroke && node.stroke !== 'none') out.push({ name, attrs, colour: colours(node.stroke)[0] });
    }
    if (!self) stack.push(node);
  }
  return out.filter((p) => p.colour);
}
/** Does a logo file draw white and nothing else (white lettering)? */
function whiteOnly(url) {
  const file = path.join(FC, String(url).split('?')[0]);
  if (/\.png$/i.test(file)) {
    // (an antialiased edge pixel or two may be a shade off white)
    const px = pngPixels(file).filter((q) => q[3] > 16);
    return px.length > 0 && px.filter((q) => lum(q[0], q[1], q[2]) > 0.7).length >= 0.995 * px.length;
  }
  if (!/\.svg$/i.test(file)) return false;
  const paints = svgPaints(fs.readFileSync(file, 'utf8'));
  return paints.length > 0 && paints.every((p) => lum(...p.colour.slice(0, 3)) > 0.7);
}

test('3. every operator with a mark has a pair; its dark half is white; the light theme is never handed white', () => {
  for (const op of new Set([...Object.keys(OP_LOGO), ...Object.keys(OP_WORDMARK)])) {
    assert.ok(PAIRS[op], op + ': no pair, so a dark ground would get its colour art (or a white box)');
  }
  for (const [op, pr] of Object.entries(PAIRS)) {
    for (const f of halvesOf(pr)) assert.ok(fs.existsSync(path.join(FC, f)), op + ': ' + f + ' exists');
    const ink = INK[pr.onDark];
    assert.ok(ink && ink.length, op + ': the colours of ' + pr.onDark + ' are on file');
    for (const h of ink) assert.ok(WHITE.has(h), `${op}: ${pr.onDark} draws ${h}, not white lettering`);
    // A lettering file in the bar's own ink draws that ink and nothing else.
    for (const [k, f] of Object.entries(pr.inBarInk || {})) assert.deepEqual([...INK[f]], [k.toUpperCase()], `${op}: ${f} is drawn in ${k}`);
  }
  // The themed lookup the phone gate uses.
  const themed = vm.runInNewContext(
    'var OPERATOR_LOGOS = ' + JSON.stringify(OP_LOGO) + '; var OPERATOR_LOGOS_THEMED = ' + JSON.stringify(OP_THEMED)
    + '; var OPBY_WORDMARKS_THEMED = ' + JSON.stringify(PAIRS) + '; var OPERATOR_LOGOS_WHITE_ONLY = ' + JSON.stringify(WHITE_ONLY) + ';\n'
    + fnSource('operatorLogoUrl') + fnSource('operatorLogoUrlThemed') + '\noperatorLogoUrlThemed;');
  for (const op of Object.keys(OP_LOGO)) {
    const d = themed(op, true);
    assert.ok(d, op + ': a dark-ground mark');
    assert.ok(INK[d] ? INK[d].every((h) => WHITE.has(h)) : /white|-light/i.test(d), `${op}: ${d} on a dark ground`);
    // The light theme's panel is white: never white lettering on it.
    const l = themed(op, false);
    assert.ok(l && !whiteOnly(l), `${op}: ${l} is white lettering on the light theme's white panel`);
  }
  // The table that keeps it so names exactly the white-only operator art.
  for (const f of new Set(Object.values(OP_LOGO))) assert.equal(!!WHITE_ONLY[f], whiteOnly(f), f + (whiteOnly(f) ? ' is white-only: name it in OPERATOR_LOGOS_WHITE_ONLY' : ' is not white-only'));
});

test('3b. a white-lettering bitmap is white wherever it paints', () => {
  for (const pr of Object.values(PAIRS)) {
    if (!/\.png$/i.test(pr.onDark)) continue;
    const px = pngPixels(path.join(FC, pr.onDark));
    const painted = px.filter((q) => q[3] > 0);
    assert.ok(painted.length > 500, pr.onDark + ': it paints');
    assert.equal(painted.filter((q) => q[0] !== 255 || q[1] !== 255 || q[2] !== 255).length, 0, pr.onDark + ': every painted pixel white');
    const src = pngPixels(path.join(FC, pr.onLight)).filter((q) => q[3] > 0).length;
    assert.ok(Math.abs(src - painted.length) / src < 0.001, `${pr.onDark}: ${painted.length} painted pixels, ${src} in ${pr.onLight}`);
  }
});

// ── 4. no stylesheet or page gives a logo a light ground ───────────────────
test('4. no rule on a logo, an emblem, a mark or the box around one sets a light ground (stylesheets and page <style> blocks)', () => {
  const found = [];
  let checked = 0;
  for (const r of RULES) {
    const sels = r.sels.map(plain).filter((s) => LOGO_SEL.test(s));
    if (!sels.length) continue;
    checked++;
    for (const d of r.body.matchAll(/(?:^|;)\s*(background(?:-color|-image)?|box-shadow)\s*:\s*([^;]+)/g)) {
      if (!lightGround(d[1], d[2])) continue;
      for (const s of sels) if (!allowed(r.f, s)) found.push(`${r.f}:${r.line} ${s.slice(-140)} { ${d[1]}: ${d[2].trim().slice(0, 60)} }`);
    }
  }
  assert.ok(checked > 300, 'logo rules checked: ' + checked);
  assert.deepEqual(found, [], 'a light ground behind a logo:\n' + found.join('\n'));
});

// ── 5. no script writes one ────────────────────────────────────────────────
/**
 * Source with string literals that continue across lines joined into one
 * line: `'a' +` / `'b'` and `'a'` / `+ 'b'`, comment lines between them
 * included, so a ground written on one line of markup and the element it
 * paints on another are read together.
 */
function joinStrings(src) {
  const C = '(?:\\s*\\/\\/[^\\n]*)?\\n(?:\\s*\\/\\/[^\\n]*\\n)*\\s*';
  const trailing = new RegExp('([\'"`])\\s*\\+' + C + '([\'"`])', 'g');
  const leading = new RegExp('([\'"`])' + C + '\\+\\s*([\'"`])', 'g');
  const join = (m, a, b) => (a === b ? '' : m);
  return src.replace(trailing, join).replace(leading, join);
}
const CONTEXT = /logo|wordmark|emblem|lockup|opby|operator|\bmark|orb|brand|tile|symbol|\/logos\/|disc|chip|pill|badge|plate|mount/i;
/** Every light ground a line of script (or inline markup) writes: its text. */
function lightWrites(line) {
  const hits = [];
  for (const m of line.matchAll(/(background(?:-color|-image)?|box-shadow)\s*:\s*([^;"'`{}]+)/gi)) if (lightGround(m[1], m[2])) hits.push(m[0]);
  for (const m of line.matchAll(/\.style\.(background(?:Color|Image)?|boxShadow)\s*=\s*(['"`])([^'"`]*)\2/g)) if (lightGround(m[1] === 'boxShadow' ? 'box-shadow' : 'background', m[3])) hits.push(m[0]);
  for (const m of line.matchAll(/setProperty\(\s*['"](background(?:-color|-image)?|box-shadow)['"]\s*,\s*(['"`])([^'"`]*)\2/g)) if (lightGround(m[1], m[3])) hits.push(m[0]);
  for (const m of line.matchAll(/\.style\.cssText\s*[+]?=\s*(['"`])([^'"`]*)\1/g)) for (const d of m[2].matchAll(/(background(?:-color)?|box-shadow)\s*:\s*([^;]+)/g)) if (lightGround(d[1], d[2])) hits.push(m[0]);
  return hits;
}
// [file, a pattern on the line, why]
const ALLOW_JS = [
  [/js\/fids-core\.js$/, /background:#7AFF94/, 'Flair\'s lime: the gate orb and its glyph badges in the carrier\'s own colour, an emblem disc'],
  [/js\/fids-core\.js$/, /g8-r1-apband/, 'the classic banner\'s airport band: reachable only through the fids_gate_banner_classic opt-in; the default banner has none'],
  [/js\/(?:fids-core|menu)\.js$/, /\.fids-airport-pill, \.fids-board-icon \{ background: #ffffff !important; \}/, 'the board header\'s airport-code pill and glyph: text and icons'],
  [/js\/menu\.js$/, /\(isLight \? '\.td-logo \.full-logo \{ background: rgba\(255,255,255/, 'light rows only (isLight): the row\'s own ground'],
  [/js\/menubar\.js$/, /body\.fids-light-board \.ctrl\{background/, 'the control bar of a light board: no logo'],
];

test('5. no script, in any file, writes a light ground behind a logo (markup it builds, .style, setProperty, cssText)', () => {
  const found = [];
  let scanned = 0;
  const scan = (f, text, base = 1) => {
    const lines = joinStrings(text).split('\n');
    lines.forEach((ln, i) => {
      if (/^\s*(?:\/\/|\*)/.test(ln)) return;
      const hits = lightWrites(ln);
      if (!hits.length) return;
      const ctx = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
      if (!CONTEXT.test(ctx)) return;
      if (ALLOW_JS.some(([fr, lr]) => fr.test(f) && lr.test(ln))) return;
      found.push(`${f}:~${base + i} ${hits.join(' | ').slice(0, 80)} :: ${ln.trim().slice(0, 140)}`);
    });
    scanned++;
  };
  for (const f of JS_FILES) scan(f, read(f));
  // Pages: their scripts and their style="" attributes (the <style> blocks are test 4's).
  for (const f of HTML_FILES) scan(f, read(f).replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, ' ')));
  assert.ok(scanned > 40, 'files scanned: ' + scanned);
  assert.deepEqual(found, [], 'a light ground written behind a logo:\n' + found.join('\n'));
});

// ── 6. a whitening filter never reaches an emblem or a tile ────────────────
const WHITENS = (v) => /brightness\(\s*0\s*\)/.test(v) && /invert\(\s*(?:1|100%)\s*\)/.test(v);
// A selector naming an emblem, a tile, an orb or a board lockup (a .full-logo carries its emblem).
const EMBLEM_SEL = /emblem|tile|orb\b|v2-fi-orb|full-logo|airline-tiles|symbol|monogram/i;
const ALLOW_FILTER = [
  [/gate-display\.css$/, /\[src\*="-mono\.svg"\]$/, 'the mono art (XX-mono.svg): a single-colour silhouette drawn to be inked'],
];

test('6. no stylesheet rule whitens an emblem, a tile or a lockup', () => {
  const found = [];
  for (const r of RULES) {
    const m = /(?:^|;)\s*(?:-webkit-)?filter\s*:\s*([^;]+)/.exec(r.body);
    if (!m || !WHITENS(m[1])) continue;
    for (const s of r.sels.map(plain)) {
      if (!EMBLEM_SEL.test(s) || ALLOW_FILTER.some(([fr, sr]) => fr.test(r.f) && sr.test(s))) continue;
      found.push(`${r.f}:${r.line} ${s.slice(-140)} { filter: ${m[1].trim()} }`);
    }
  }
  // And no CSS a script writes does it either, nor any markup that whitens a tile file.
  for (const f of [...JS_FILES, ...HTML_FILES]) {
    joinStrings(read(f)).split('\n').forEach((ln, i) => {
      if (/^\s*(?:\/\/|\*)/.test(ln)) return;
      for (const r of ln.matchAll(/([^{}'"`]+)\{([^{}]*)\}/g)) {
        const fm = /filter\s*:\s*([^;]+)/.exec(r[2]);
        if (fm && WHITENS(fm[1]) && EMBLEM_SEL.test(r[1]) && !/-mono\.svg/.test(r[1])) found.push(`${f}:~${i + 1} ${r[1].trim().slice(-100)} { filter: ${fm[1].trim()} }`);
      }
      if (/\/logos\/airline-tiles\//.test(ln) && WHITENS(ln) && !/filter:none|_adTile|isTile/.test(ln)) found.push(`${f}:~${i + 1} a tile whitened: ${ln.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(found, [], 'a whitening filter on an emblem or a tile:\n' + found.join('\n'));
});

test('6b. the board\'s cancelled and diverted rows, and the belts, keep every emblem and tile in its colours', () => {
  const sel = (re) => RULES.filter((r) => r.sels.some((s) => re.test(plain(s))));
  const emblemRows = sel(/tr\.row-(?:cancelled|diverted) img\.airline-emblem$/);
  assert.ok(emblemRows.length, 'the cancelled-row emblem rule is still here');
  for (const r of emblemRows) {
    const m = /filter\s*:\s*([^;]+)/.exec(r.body);
    if (m) assert.ok(!WHITENS(m[1]), `${r.f}:${r.line} the emblem is whitened on a cancelled/diverted row`);
  }
  for (const r of sel(/\.b3-tile\b/)) {
    const m = /filter\s*:\s*([^;]+)/.exec(r.body);
    assert.ok(!m || !WHITENS(m[1]), `${r.f}:${r.line} the belt tile whitens its art (a lockup carries its emblem)`);
  }
});

// The orb recipe, run as the page runs it.
const ORB = new Function('window', [
  blockSource('var GATE_TOP_ROUND_EMBLEM_FILES = {'),
  blockSource('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {'),
  blockSource('const AIRLINE_BRAND = {'),
  blockSource('window._CARD_COLOR_EMBLEMS = {'),
  blockSource('window._orbKeepsColour = function'),
  fnSource('_orbEmblemCarrier'), fnSource('_airlineOrbEmblem'),
  blockSource('window._gateOrbParts = function'),
  'return { files: AIRLINE_EMBLEM_FILES, top: GATE_TOP_ROUND_EMBLEM_FILES, colour: window._CARD_COLOR_EMBLEMS, emblem: _airlineOrbEmblem, carrier: _orbEmblemCarrier, parts: window._gateOrbParts };',
].join('\n'))({});

test('6c. the gate orb never whitens a tile, nor a colour carrier\'s emblem under another code', () => {
  const codes = new Set([...Object.keys(ORB.files), ...Object.keys(ORB.top), ...Object.keys(ORB.colour),
    ...Object.keys(OP_LOGO), ...Object.keys(PAIRS)]);
  // The art each colour-keeping carrier's orb draws.
  const colourArt = new Map();
  for (const c of Object.keys(ORB.colour)) { const f = String(ORB.emblem(c) || '').split('?')[0]; if (f) colourArt.set(f, c); }
  const found = [];
  for (const code of codes) {
    const p = ORB.parts(code);
    const f = String(p.path || '').split('?')[0];
    const inked = /invert\(1\)/.test(p.imgStyle);
    if (/\/logos\/airline-tiles\//.test(f) && !/PB-arrow/i.test(f) && inked) found.push(`${code}: the tile ${f} is whitened`);
    if (colourArt.has(f) && inked) found.push(`${code}: ${f}, ${colourArt.get(f)}'s emblem, is whitened (an emblem keeps its colours)`);
  }
  assert.deepEqual(found, [], found.join('\n'));
  // American Eagle's three wear American's symbol, with American's treatment.
  for (const op of ['MQ', 'ENY', 'OH', 'PSA', 'PT', 'PDT']) {
    assert.equal(ORB.carrier(op), 'AA', op);
    assert.deepEqual(ORB.parts(op), ORB.parts('AA'), op + ': American\'s disc, art and colours');
    assert.doesNotMatch(ORB.parts(op).imgStyle, /invert/, op + ': the flight symbol in its colours');
  }
});

test('6d. the Welcome card never white-forces a tile', () => {
  // The standard ad renderer's filter decision, run as written, for every
  // tile on disk: never brightness(0) invert(1) (a solid white square).
  const start = CORE.indexOf('  var _adLightBg = !!ad.fg;');
  const end = CORE.indexOf('  var _stdLogoHtml = ad.logo', start);
  assert.ok(start > 0 && end > start, 'the Welcome card\'s filter decision');
  const decide = new Function('ad', 'LOGO_TREATMENT', CORE.slice(start, end) + '\nreturn _stdLogoFilter;');
  const tiles = fs.readdirSync(path.join(FC, 'logos', 'airline-tiles')).filter((n) => /\.(svg|png|webp)$/i.test(n));
  assert.ok(tiles.length > 50, 'tiles: ' + tiles.length);
  for (const t of tiles) {
    const got = decide({ logo: '/logos/airline-tiles/' + t, headline: 'Welcome aboard' }, {});
    assert.ok(!WHITENS(got), t + ': white-forced on the Welcome card: ' + got);
  }
  // Every carrier whose Welcome emblem is a tile (Canadian North, Air North, …).
  for (const [code, f] of Object.entries(ORB.files)) {
    if (!/\/logos\/airline-tiles\//.test(f)) continue;
    assert.ok(!WHITENS(decide({ logo: f, headline: 'x' }, {})), code + ': ' + f);
  }
  // A mark drawn to be inked white still is (the renderer is otherwise unchanged).
  assert.ok(WHITENS(decide({ logo: '/logos/airlines/canadian/rouge-r.svg', headline: 'x' }, {})));
});

// ── 7. the banner's light band, and baked boxes ────────────────────────────
test('7. a white file never lands on the gate banner\'s light band; no lettering file has a light box baked in', () => {
  assert.match(CORE, /\n {2}var _bannerIsLight = true;\n/, 'every banner is a light band (v23646)');
  const fnStart = CORE.indexOf('  var BANNER_DARK_LOGO = {');
  const DARK = table('  var BANNER_DARK_LOGO = {');
  const LIGHT = table('  var BANNER_LIGHT_LOGO = {');
  assert.ok(fnStart > 0 && CORE.indexOf('  var BANNER_LIGHT_LOGO = {') > fnStart, 'the light table follows the dark one');
  const src = (e) => (typeof e === 'object' ? e.src : e);
  for (const [code, e] of Object.entries(DARK)) {
    const f = src(e);
    assert.ok(fs.existsSync(path.join(FC, f.split('?')[0])), code + ': ' + f);
    if (!whiteOnly(f) && !/-white\b|stacked-white|monochrome-white|-light\b/i.test(f)) continue;
    // The light table runs first: it must answer for this carrier, with art that is not white.
    assert.ok(LIGHT[code], `${code}: ${f} is white lettering; the light band needs this carrier's colour art in BANNER_LIGHT_LOGO`);
    assert.ok(!whiteOnly(src(LIGHT[code])), `${code}: ${src(LIGHT[code])} on the light band`);
  }
  // The lettering files these surfaces use never carry a light box covering their canvas.
  const files = new Set([...Object.values(OP_LOGO), ...Object.values(OP_WORDMARK), ...Object.values(PAIRS).flatMap(halvesOf),
    ...Object.values(OP_THEMED).flatMap((v) => [v.light, v.dark]), ...Object.values(DARK).map(src), ...Object.values(LIGHT).map(src)]);
  const baked = [];
  for (const u of files) {
    const f = path.join(FC, String(u).split('?')[0]);
    if (!/\.svg$/i.test(f) || !fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    const vb = (/viewBox="([^"]+)"/.exec(t) || [])[1];
    const [, , W, H] = vb ? vb.trim().split(/[\s,]+/).map(Number) : [0, 0, +((/\bwidth="([\d.]+)/.exec(t) || [])[1] || 0), +((/\bheight="([\d.]+)/.exec(t) || [])[1] || 0)];
    for (const p of svgPaints(t)) {
      if (p.name !== 'rect' || !isLight(p.colour)) continue;
      const w = parseFloat((/\bwidth="([\d.]+)%?"/.exec(p.attrs) || [])[1] || 0), h = parseFloat((/\bheight="([\d.]+)%?"/.exec(p.attrs) || [])[1] || 0);
      const pct = /width="100%"/.test(p.attrs) && /height="100%"/.test(p.attrs);
      if (pct || (W && H && w >= 0.9 * W && h >= 0.9 * H)) baked.push(u);
    }
  }
  assert.deepEqual(baked, [], 'a light box baked into a lettering file:\n' + baked.join('\n'));
});

// ── 8. the places it was found stay clear ──────────────────────────────────
test('8. the places it was found stay clear: the banner, the board\'s rows, the belts, the Studio, the Welcome card, Pascan', () => {
  // The gate banner: BoA's mark is no longer put on a white rounded plate.
  assert.doesNotMatch(CORE, /background:#fff !important;border-radius:14px/);
  assert.doesNotMatch(CORE, /g8-r1-logo-badge|_bannerPlateForced/);
  assert.match(CORE, /'OB': \{ light: '\/logos\/airlines\/asian-other\/boliviana\.svg',[^}]*dark: {2}'\/logos\/airlines\/asian-other\/boliviana-light\.svg' \}/);
  const body = (f, sel) => RULES.filter((r) => r.f === f && r.sels.map(plain).includes(sel)).map((r) => r.body).join('\n');
  const bg = (b) => [...b.matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/g)].map((m) => m[1].replace(/!important/, '').trim());
  for (const [f, sel] of [['css/flight-display.css', '#fidsTable tbody tr.row-cancelled .fids-airline-logo'],
    ['css/flight-display.css', 'body[data-fids-theme="navy-board"] .fids-airline-logo'],
    ['css/display-overrides.css', '.bidsv3 .b3-tile'],
    ['css/baggage-display.css', '.bidsv2-airline-block'],
    ['css/studio-modules.css', '.fx-logo']]) {
    const b = body(f, sel);
    assert.ok(b, f + ': ' + sel + ' is still styled here');
    assert.deepEqual(bg(b), ['transparent'], f + ': ' + sel + ' has no ground of its own');
  }
  // #979's white disc behind the Welcome card's emblem, in any shape.
  assert.doesNotMatch(CORE, /gad-ad-logo-disc|_FB_WELCOME_ON_DISC|logoDisc/);
  // Pascan: its white square is never drawn (the operator art, the banner, both tables).
  assert.doesNotMatch(CORE, /canadian-regional\/pascan(?:-monochrome-white)?\.svg/);
  // SP is PAL, everywhere: never Porter's lettering on a PAL flight.
  assert.match(CORE, /'SP': +'\/logos\/airlines\/canadian-regional\/pal-square-badge\.svg'/);
  assert.equal(PAIRS.SP.onDark, PAIRS.PB.onDark);
  assert.equal(PAIRS.SP.onLight, PAIRS.PB.onLight);
});
