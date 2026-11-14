'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE PLATES OF THE DARK CARD
//
// A gate whose discs would sink into a card of their own colour takes the
// dark card and keeps its discs (window._gateCardDark). The dark card was the
// house charcoal under an engraving screened over it; it is drawn now on one of
// six calm stock patterns in grey, black and brown (Vecteezy, Pro licence, no
// attribution required), chosen by the owner carrier by carrier, with the
// measure having the last word (window._gateCardPlate). This holds:
//   1. the files: on disk in the folder the site is served from, the files the
//      numbers below were measured on, and named exactly where the docs say
//      (docs/operations/vecteezy-stock.md): each wired plate in one table of the
//      gate and one rule of the stylesheet, the two spares nowhere;
//   2. white figures and words read at 4.5 to 1 or better on the lightest 5th
//      percentile of every plate (measured on the files);
//   3. the paints the discs meet on each plate are the paints measured on the
//      rendered gate, and every disc stands clear of every paint of its plate;
//   4. a brown plate is never behind a red, orange or gold disc;
//   5. the gates left as drawn and the white columns are untouched: what they
//      show with the plates is what they show with no plate at all.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const FC = path.join(ROOT, 'fids-current');
const JS = path.join(FC, 'js');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(FC, 'css/display-overrides.css'), 'utf8');
const DOC = fs.readFileSync(path.join(ROOT, 'docs/operations/vecteezy-stock.md'), 'utf8');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ── the whole board script, with the colour file it loads first ──────────────
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
    location: { search: '?ap=YUL', hostname: 'localhost', href: 'http://localhost/gids.html?ap=YUL', pathname: '/gids.html', origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(FC, 'data/airline-colors.js'), 'utf8'), ctx, { filename: 'airline-colors.js' });
  for (const f of ['host-airport.js', 'board-strings.js', 'feed-router.js', 'fids-core.js', 'airport-coords.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('var __the = function (n) { return eval(n); };', ctx);
  return ctx;
}
const B = board();
const the = (n) => B.__the(n);
const W = B;
const PLATES = W._GATE_CARD_PLATES;
const CODES = [...new Set([...Object.keys(the('AIRLINE_NAME')), ...Object.keys(the('_AIRLINE_NAME_OVERRIDE'))])].sort();

// ── colour arithmetic ──────────────────────────────────────────────────────
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lab = (h) => W._orbLab(h);
const chroma = (h) => { const L = lab(h); return Math.hypot(L[1], L[2]); };
const hue = (h) => { const L = lab(h); const t = Math.atan2(L[2], L[1]) * 180 / Math.PI; return t < 0 ? t + 360 : t; };

// ── 1. THE FILES ───────────────────────────────────────────────────────────
// Measured on the files themselves (every pixel, luminance by WCAG): the average colour, which is the
// base each plate is drawn on, and the luminance of the lightest 5th percentile (the 95th percentile
// of luminance). Bound to the file by its size and the start of its sha256: a new file is measured
// again before it lands.
const FILES = {
  'plate-grey-wave.jpg':         { item: '85868529', size: 13908, sha: '85928a90a598249d', mean: '#3E403F', p95: 0.060389 },
  'plate-black-faint-waves.jpg': { item: '82498963', size: 46900, sha: '6bd7a98723c29bc2', mean: '#0E0F11', p95: 0.007070 },
  'plate-grey-shapes.jpg':       { item: '63527784', size: 22350, sha: '60f98e37e7a7f852', mean: '#37343A', p95: 0.081870 },
  'plate-black-fine-lines.jpg':  { item: '69483591', size: 68338, sha: '568de56fa6e5f55c', mean: '#161616', p95: 0.021219 },
  'plate-brown-waves.jpg':       { item: '80914976', size: 21792, sha: '1592a8fea2485009', mean: '#2E1D0A', p95: 0.031890 },
  'plate-brown-layers.jpg':      { item: '88062392', size: 15300, sha: 'a7e57e489a13d135', mean: '#291A0D', p95: 0.016160 },
  'plate-black-fabric.jpg':      { item: '55335613', size: 21437, sha: 'f6b6e7cb8e2371dd', mean: '#1C1C1C', p95: 0.033105 },
  'plate-black-stripes.jpg':     { item: '7233631',  size: 9355,  sha: 'ea312f1b79fbc8c9', mean: '#232323', p95: 0.016807 }
};
const SPARES = ['plate-black-fabric.jpg', 'plate-black-stripes.jpg'];
// the table of the docs, row by row: file, item, plate, given to
const DOC_ROWS = (() => {
  const at = DOC.indexOf('## Gate card plates');
  assert.ok(at >= 0, 'the docs have the section of the plates');
  const rows = [];
  for (const line of DOC.slice(at).split('\n')) {
    const m = /^\| `([^`]+)` \| (\d+) \| (?:`([a-z-]+)`|spare) \| ([^|]+) \|$/.exec(line.trim());
    if (m) rows.push({ file: m[1], item: m[2], plate: m[3] || '', given: m[4].trim() });
  }
  return rows;
})();

test('the plate files: on disk where the site is served from, the files that were measured, and named exactly where the docs say', () => {
  // the site is the folder the worker serves as its assets, whole
  const wr = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  assert.match(wr, /"assets": \{\s*"directory": "fids-current"/);
  assert.ok(!fs.existsSync(path.join(FC, '.assetsignore')) || !/textures|plate-/.test(fs.readFileSync(path.join(FC, '.assetsignore'), 'utf8')), 'no plate is left out of the assets');
  for (const [file, f] of Object.entries(FILES)) {
    const p = path.join(FC, 'textures', file);
    assert.ok(fs.existsSync(p), file);
    const buf = fs.readFileSync(p);
    assert.equal(buf.length, f.size, file + ': the file measured');
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16), f.sha, file + ': the file measured');
    assert.deepEqual([buf[0], buf[1], buf[2]], [0xff, 0xd8, 0xff], file + ' is a jpeg');
    // 1744 by 616: the size of the start of frame
    let i = 2, size = null;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) break;
      const mk = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (mk >= 0xc0 && mk <= 0xc2) { size = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; break; }
      i += 2 + len;
    }
    assert.deepEqual(size, [1744, 616], file);
  }
  // the docs: every file, its item, its plate, the carriers it is given to
  assert.deepEqual(DOC_ROWS.map((r) => r.file).sort(), Object.keys(FILES).sort());
  for (const r of DOC_ROWS) assert.equal(r.item, FILES[r.file].item, r.file);
  assert.match(DOC.slice(DOC.indexOf('## Gate card plates')), /Vecteezy Pro, no\s+attribution required/);
  for (const r of DOC_ROWS) {
    if (SPARES.includes(r.file)) { assert.deepEqual([r.plate, r.given], ['', 'nothing'], r.file); continue; }
    assert.ok(PLATES[r.plate] && PLATES[r.plate].file === r.file, r.file + ': the plate ' + r.plate);
    const given = Object.keys(W._GATE_CARD_PLATE_OF).filter((c) => W._GATE_CARD_PLATE_OF[c] === r.plate);
    if (r.plate === W._GATE_CARD_PLATE) assert.match(r.given, /the default/, r.file);
    else assert.deepEqual(r.given.split(', ').sort(), given.sort(), r.file + ': given to');
  }
  assert.equal(W._GATE_CARD_PLATE, 'grey-wave');
  assert.equal(Object.keys(PLATES).length, 6);
  // named exactly there: each wired file once in the table of the gate and once in the stylesheet, in the
  // rule of its plate; the spares in no code at all
  for (const [name, p] of Object.entries(PLATES)) {
    assert.equal(CORE.split(p.file).length - 1, 1, p.file + ' in fids-core.js');
    const rules = CSS.split(p.file).length - 1;
    assert.equal(rules, 1, p.file + ' in the stylesheet');
    assert.match(CSS, new RegExp('html body\\[data-gate-airline\\]\\[data-gate-card="' + name + '"\\](?::not\\(#_\\)){12} \\{\\n  --plate-tex: url\\(\'/textures/' + p.file.replace(/\./g, '\\.') + '\\?v=24155\'\\);\\n  --plate-base: ' + p.base + ';\\n  --plate-blend: normal;'), name);
  }
  const code = ['js', 'css'].flatMap((d) => fs.readdirSync(path.join(FC, d)).map((f) => fs.readFileSync(path.join(FC, d, f), 'utf8')))
    .concat(fs.readdirSync(FC).filter((f) => /\.html$/.test(f)).map((f) => fs.readFileSync(path.join(FC, f), 'utf8'))).join('\n');
  for (const spare of SPARES) assert.equal(code.split(spare).length - 1, 0, spare + ' is wired to nothing');
});

// ── 2. WHITE READS ON EVERY PLATE ──────────────────────────────────────────
test('white figures and words read at 4.5 to 1 or better on the lightest 5th percentile of every plate', () => {
  const low = {};
  for (const [file, f] of Object.entries(FILES)) {
    const r = 1.05 / (f.p95 + 0.05);
    low[file] = Number(r.toFixed(2));
    assert.ok(r >= 4.5, file + ': white at ' + r.toFixed(2) + ' to 1');
  }
  // the numbers, as measured (the grey shapes the lowest, at nearly 8 to 1)
  assert.deepEqual(low, {
    'plate-grey-wave.jpg': 9.51, 'plate-black-faint-waves.jpg': 18.4, 'plate-grey-shapes.jpg': 7.96, 'plate-black-fine-lines.jpg': 14.74,
    'plate-brown-waves.jpg': 12.82, 'plate-brown-layers.jpg': 15.87, 'plate-black-fabric.jpg': 12.63, 'plate-black-stripes.jpg': 15.72
  });
  // every plate is drawn on its own average, and the stylesheet gives it white ink
  for (const p of Object.values(PLATES)) assert.equal(p.base, FILES[p.file].mean, p.file);
  for (const name of Object.keys(PLATES)) {
    const rule = new RegExp('\\[data-gate-card="' + name + '"\\](?::not\\(#_\\)){12} \\{([^}]*)\\}').exec(CSS)[1];
    assert.match(rule, /--plate-ink: #ffffff;/, name);
    for (const w of ['#ffffff', '#34d399', '#fbbf24', '#f87171', '#93c5fd']) assert.match(rule, new RegExp(w), name);
  }
});

// ── 3. THE PAINTS THE DISCS MEET, AND EVERY DISC CLEAR OF THEM ─────────────
// Measured on the real gate (gids, 1680 by 1050, headless, a flight of Iberia at three hours and at
// boarding), each plate set on the body, the discs and the words hidden: a ring 2 to 10 px outside each
// of the six discs of the rail and the four of the boarding shelf, inside the box the plate paints,
// 20,295 pixels a plate, clustered in CIELAB (k = 3), the clusters of 5 hundredths or more, the widest
// first. The Your Aircraft orb sits on the lower right panel, which is painted flat: no plate reaches it.
const MEASURED = {
  'grey-wave':         [[0.977, '#444645']],
  'black-faint-waves': [[0.506, '#101213'], [0.492, '#0E0F11']],
  'grey-shapes':       [[0.434, '#444146'], [0.379, '#201D24'], [0.187, '#525055']],
  'black-fine-lines':  [[0.673, '#111112'], [0.177, '#191919'], [0.150, '#232323']],
  'brown-waves':       [[0.545, '#442C12'], [0.252, '#2C1C0C'], [0.203, '#36230D']],
  'brown-layers':      [[0.435, '#2A1A0D'], [0.410, '#1D130A'], [0.155, '#311E0F']]
};
test('each plate: the paints its discs meet are the paints measured, and every disc of the dark card stands clear of every paint of its plate', () => {
  for (const [name, m] of Object.entries(MEASURED)) {
    assert.deepEqual([...PLATES[name].at], m.map((x) => x[1]), name + ': the paints measured, the widest first');
    for (let i = 1; i < m.length; i++) assert.ok(m[i][0] <= m[i - 1][0], name);
  }
  const dark = [], by = {};
  for (const code of CODES) {
    const K = W._gateCardPaint(code);
    if (K.kind !== 'dark') { assert.equal(W._gateCardPlate(code) && W._gateCardDark(code), '', code); continue; }
    const D = W._gateColumnDisc(code);
    dark.push(code);
    (by[K.plate] = by[K.plate] || []).push(code);
    assert.ok(PLATES[K.plate], code + ': a plate');
    assert.deepEqual([K.base, K.paint, [...K.at], K.file, W._gateCardDark(code)], [PLATES[K.plate].base, PLATES[K.plate].at[0], [...PLATES[K.plate].at], PLATES[K.plate].file, PLATES[K.plate].base], code);
    // A DISC IS NEVER THE COLOUR OF THE PANEL BEHIND IT: not one paint of its plate that it sinks into,
    // and every paint one it is twice as bright as, with an ink that reads on it
    for (const p of K.at) {
      assert.ok(!W._gateDiscSinks(D.disc, p), code + ': ' + D.disc + ' sinks into ' + p + ' of the ' + K.plate);
      assert.ok(W._gateDiscClear(D.disc, p, D.ink), code + ': ' + D.disc + ' stands clear of ' + p);
      assert.ok(W._orbDeltaE(D.disc, p) >= 20, code + ': ' + D.disc + ' on ' + p + ' at ' + W._orbDeltaE(D.disc, p).toFixed(1));
    }
    // the plate is the first of the plates it is tried on that it stands clear of
    const given = W._GATE_CARD_PLATE_OF[D.carrier] || W._GATE_CARD_PLATE;
    const ownBlack = W._GATE_CARD_DARKS[D.carrier] && lab(W._GATE_CARD_DARKS[D.carrier])[0] < lab(W._GATE_CARD_DARK)[0];
    const tried = [given].concat(ownBlack ? ['black-faint-waves'] : [], ['grey-wave', 'black-faint-waves']);
    assert.equal(K.plate, tried.find((n) => PLATES[n].at.every((p) => W._gateDiscClear(D.disc, p, D.ink))), code);
  }
  // the dark card is the gates it was before the plates: 93 of the codes the name tables know
  assert.ok(dark.length >= 86 && dark.length <= 101, dark.length + ' gates of the dark card');
  // every plate given is used, and the two the owner set first for most gates carry most of them
  assert.deepEqual(Object.keys(by).sort(), [...Object.keys(PLATES)].sort());
  assert.ok(by['grey-wave'].length >= 40 && by['black-faint-waves'].length >= 30, JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length]))));
  // the carriers the owner named, on the plate they were given, but for Royal Jordanian (its grey discs
  // sink into the grey shapes, and are under twice as bright as the grey wave)
  for (const [c, plate] of Object.entries(W._GATE_CARD_PLATE_OF)) {
    assert.equal(W._gateCardPaint(c).plate, c === 'RJ' ? 'black-faint-waves' : plate, c);
  }
  assert.ok(PLATES['grey-shapes'].at.some((p) => W._gateDiscSinks(W._gateColumnDisc('RJ').disc, p)), 'Royal Jordanian sinks into the grey shapes');
});

// ── 4. NO BROWN BEHIND A WARM DISC ─────────────────────────────────────────
// A red, an orange or a gold disc on a brown is a shade on a shade (the khakis and the browns of the
// shade the dark card took them off). Every carrier the measure sends to a brown plate is walked: its
// disc has no warm hue (CIELAB hue under 100 degrees or over 330, with colour: chroma 15 or more), and
// sinks into no paint of the plate.
test('a brown plate is never behind a red, orange or gold disc', () => {
  const browns = Object.keys(PLATES).filter((n) => /^brown-/.test(n));
  assert.deepEqual(browns.sort(), ['brown-layers', 'brown-waves']);
  for (const n of browns) assert.ok(PLATES[n].at.every((p) => chroma(p) >= 6.5 && hue(p) > 50 && hue(p) < 80), n + ': a brown');
  const warm = (h) => chroma(h) >= 15 && (hue(h) < 100 || hue(h) > 330);
  const onBrown = [];
  for (const code of CODES) {
    const K = W._gateCardPaint(code);
    if (K.kind !== 'dark' || !browns.includes(K.plate)) continue;
    const disc = W._gateColumnDisc(code).disc;
    onBrown.push(code);
    assert.ok(!warm(disc), code + ': ' + disc + ' (hue ' + hue(disc).toFixed(0) + ') on the ' + K.plate);
    assert.ok(!K.at.some((p) => W._gateDiscSinks(disc, p)), code + ': ' + disc + ' sinks into the ' + K.plate);
  }
  assert.deepEqual(onBrown.sort(), ['BR', 'CX', 'EI', 'KL']);
  // and the rule would catch one: the red of Iberia, the orange of easyJet and the gold of Etihad sink
  // into the brown waves
  for (const disc of ['#DC1C2E', '#FF6600', '#BD8B13']) assert.ok(warm(disc) && PLATES['brown-waves'].at.some((p) => W._gateDiscSinks(disc, p)), disc);
  // the fallback never reaches a brown: a gate is tried only on the plate it is given, the black, the grey
  const fn = the('window._gateCardPlate').toString();
  assert.match(fn, /tried\.push\('grey-wave', 'black-faint-waves'\);/);
  assert.doesNotMatch(fn, /brown/);
});

// ── 5. THE GATES LEFT AS DRAWN AND THE WHITE COLUMNS ARE UNTOUCHED ─────────
test('the gates left as drawn and the white columns show with the plates exactly what they show with no plate', () => {
  const snap = (code) => JSON.stringify([W._gateColumnLook(code), W._gateOrbParts(code), W._gateLowerPair(code), W._gateCardOrb(code, '').html, W._gateCardOrb('AC', code).html,
    W._gateCardPaint(code), W._gateCardDark(code), W._gateColumnWhite(code, W._gateOrbNatural(code).ground)]);
  const kept = CODES.filter((c) => W._gateColumnKept(c));
  const white = CODES.filter((c) => !W._gateColumnKept(c) && W._gateColumnLook(c).white);
  assert.ok(kept.length >= 30 && white.length >= 90, kept.length + ' kept, ' + white.length + ' white');
  const withPlates = Object.fromEntries(kept.concat(white).map((c) => [c, snap(c)]));
  // no plate at all: the plate tables emptied
  const saved = Object.assign({}, PLATES);
  for (const k of Object.keys(PLATES)) delete PLATES[k];
  try {
    for (const c of kept.concat(white)) assert.equal(snap(c), withPlates[c], c);
  } finally { Object.assign(PLATES, saved); }
  // they name no plate on the body: the stylesheet rules of the plates never reach them
  for (const c of kept.concat(white)) assert.deepEqual([W._gateCardDark(c), W._gateCardPaint(c).plate || ''], ['', ''], c);
  assert.match(CORE, /var _cardPlate = _gateCardDark \? \(window\._gateCardPaint\(airlineCode, true\)\.plate \|\| ''\) : '';/);
  // and the lower right panel is never a plate: it is painted flat, in the flat dark of the card
  for (const c of CODES) {
    const lower = W._gateCardPaint(c).lower;
    assert.ok(!Object.values(PLATES).some((p) => p.base === lower) || lower === W._GATE_CARD_DARK, c + ': ' + lower);
  }
});
