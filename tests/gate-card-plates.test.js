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
    // one rule per plate, read by the gate (the body names the plate) and by the gate change notice
    // (the notice names its own plate, where its orb would sink into the plate of the gate)
    assert.match(CSS, new RegExp('html body\\[data-gate-airline\\]\\[data-gate-card="' + name + '"\\](?::not\\(#_\\)){12},\\nhtml body(?::not\\(#_\\)){255}(?::not\\(\\._\\)){6} \\.g8-wrap \\.gl-gc\\[data-gc-plate="' + name + '"\\] \\{\\n  --plate-tex: url\\(\'/textures/' + p.file.replace(/\./g, '\\.') + '\\?v=24155\'\\);\\n  --plate-base: ' + p.base + ';\\n  --plate-blend: normal;'), name);
  }
  const code = ['js', 'css'].flatMap((d) => fs.readdirSync(path.join(FC, d)).map((f) => fs.readFileSync(path.join(FC, d, f), 'utf8')))
    .concat(fs.readdirSync(FC).filter((f) => /\.html$/.test(f)).map((f) => fs.readFileSync(path.join(FC, f), 'utf8'))).join('\n');
  for (const spare of SPARES) assert.equal(code.split(spare).length - 1, 0, spare + ' is wired to nothing');
});

// the rule of a plate in the stylesheet, by its name (the selector of the gate, then the one of the notice)
const RULE = (name) => new RegExp('\\[data-gate-card="' + name + '"\\](?::not\\(#_\\)){12},\\n[^{]*\\{([^}]*)\\}').exec(CSS)[1];

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
  for (const name of Object.keys(PLATES)) assert.match(RULE(name), /--plate-ink: #ffffff;/, name);
});

// ── 2b. THE INKS OF THE STATUS READ ON EVERY PLATE ─────────────────────────
// The four inks the panels of the card letter a status in (--plate-ok, --plate-warn, --plate-bad,
// --plate-info) at 4.5 to 1 or better on the lightest 5th percentile of the plate, as white is. The
// house inks did not on the two grey plates (the red at 3.44 on the grey wave; the green at 4.14, the
// red at 2.88 and the blue at 4.42 on the grey shapes), so those two plates take them lighter, in the
// same hue (HSL lightness raised a hundredth at a time, to 4.6 to 1 for a margin over the rendering).
const INKS = {
  'grey-wave':         { ok: ['#34d399', 4.95], warn: ['#fbbf24', 5.70], bad: ['#fa9e9e', 4.73], info: ['#93c5fd', 5.27] },
  'black-faint-waves': { ok: ['#34d399', 9.57], warn: ['#fbbf24', 11.02], bad: ['#f87171', 6.65], info: ['#93c5fd', 10.20] },
  'grey-shapes':       { ok: ['#5cdcad', 4.66], warn: ['#fbbf24', 4.77], bad: ['#fbb6b6', 4.73], info: ['#9bc9fd', 4.61] },
  'black-fine-lines':  { ok: ['#34d399', 7.67], warn: ['#fbbf24', 8.83], bad: ['#f87171', 5.33], info: ['#93c5fd', 8.18] },
  'brown-waves':       { ok: ['#34d399', 6.67], warn: ['#fbbf24', 7.68], bad: ['#f87171', 4.64], info: ['#93c5fd', 7.11] },
  'brown-layers':      { ok: ['#34d399', 8.26], warn: ['#fbbf24', 9.51], bad: ['#f87171', 5.74], info: ['#93c5fd', 8.80] }
};
const HOUSE = { ok: '#34d399', warn: '#fbbf24', bad: '#f87171', info: '#93c5fd' };
test('the four inks of the status read at 4.5 to 1 or better on the lightest 5th percentile of every plate, the grey ones lightened in their own hue', () => {
  const hsl = (h) => {
    const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hh = 0;
    if (d) hh = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    return [hh, (mx + mn) / 2];
  };
  assert.deepEqual(Object.keys(INKS).sort(), Object.keys(PLATES).sort());
  for (const [name, inks] of Object.entries(INKS)) {
    const rule = RULE(name), p95 = FILES[PLATES[name].file].p95;
    for (const [k, [ink, ratio]] of Object.entries(inks)) {
      assert.match(rule, new RegExp('--plate-' + k + ': ' + ink + ';'), name + ' ' + k);
      const r = (lum(ink) + 0.05) / (p95 + 0.05);
      assert.equal(Number(r.toFixed(2)), ratio, name + ' ' + k + ': ' + ink + ' at ' + r.toFixed(2));
      assert.ok(r >= 4.5, name + ' ' + k + ': ' + ink + ' at ' + r.toFixed(2) + ' to 1');
      // the house ink where it reads, else the same hue, lighter
      const house = HOUSE[k], hr = (lum(house) + 0.05) / (p95 + 0.05);
      if (hr >= 4.6) assert.equal(ink, house, name + ' ' + k + ': the house ink reads');
      else {
        assert.ok(Math.abs(hsl(ink)[0] - hsl(house)[0]) < 1.5, name + ' ' + k + ': the hue of ' + house);
        assert.ok(hsl(ink)[1] > hsl(house)[1] && lum(ink) > lum(house), name + ' ' + k + ': lighter than ' + house);
      }
    }
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

// ── 6. THE GATE CHANGE NOTICE, ON THE CARD OF THE GATE IT COVERS ───────────
// The notice is drawn on the plate of the gate, and its orb is the carrier of the moved flight: the red
// disc of Iberia sank into the brown waves of a KLM gate (all its ring), the red of Emirates into the
// brown layers of Cathay, 61 carriers into the brown waves and 62 into the brown layers, navy orbs into
// the black plates and the grey shapes. Walked over every card the gates can show (the distinct paints
// of every code the name tables know, and the gate with no carrier) and every orb the notice can draw,
// and the notice that is the whole screen: the orb read off the markup the notice writes for it, the
// card it lands on read off the look (the plate the notice names, else the card of the gate). No pair
// sinks; a red, an orange or a gold never lands on a brown; on a plate of the dark card the orb stands
// clear of it with room, as the rail keeps its discs there.
test('the gate change notice: on every card the gates can show, no orb the notice can draw sinks, and none warm on a brown', () => {
  const ACCENT = (c) => { const a = String(the('getAirlineAccent')(c) || ''); return /^#[0-9a-f]{3}$/i.test(a) ? '#' + a.slice(1).split('').map((x) => x + x).join('') : a; };
  const hex = (h) => (/^#[0-9a-f]{6}$/i.test(String(h || '').trim()) ? String(h).trim().toUpperCase() : '');
  // the colour the orb shows, read off its markup (not off the function that decides)
  const shown = (html, code) => {
    const st = (/class="v2-fi-icon-wrap[^"]*" style="([^"]*)"/.exec(html) || [])[1] || '';
    const bg = ((/background:([^;]+);/.exec(st) || [])[1] || '').trim();
    // the disc it holds against the rules of the gate is the disc it names
    assert.equal(((/--gc-disc:([^;]+);/.exec(st) || [])[1] || '').trim(), bg, code + ': the disc held');
    if (/^var\(--airline-accent/.test(bg)) return hex(ACCENT(code));
    if (hex(bg)) return hex(bg);
    const fold = the('_orbEmblemCarrier')(code);
    if (W._ORB_ART_RIMMED[fold]) return '#FFFFFF';   // the light rim drawn in the file
    return hex(W._gateOrbNatural(code).ground) || hex((W._GATE_ORB_LOOKS[fold] || {}).ground) || hex(ACCENT(code));
  };
  const warm = (h) => chroma(h) >= 15 && (hue(h) < 100 || hue(h) > 330);
  const brown = (h) => lab(h)[0] <= 50 && chroma(h) >= 6.5 && hue(h) > 40 && hue(h) < 95;
  // the cards: one gate for each distinct paint
  const cards = new Map();
  for (const g of CODES.concat([''])) {
    const K = W._gateCardPaint(g, true), sig = K.kind + ':' + K.at.join(',');
    if (!cards.has(sig)) cards.set(sig, { gate: g, K });
  }
  const orbs = CODES.filter((c) => the('_gateChangeOrbHtml')(c));
  assert.ok(cards.size >= 80 && orbs.length >= 250, cards.size + ' cards, ' + orbs.length + ' orbs');
  const sinks = [], warmBrown = [], notClear = [], by = { stays: 0, plate: 0, white: 0 };
  let pairs = 0;
  const judge = (gate, code, solo) => {
    const L = W._gateNoticeLook(gate, code, solo), html = the('_gateChangeOrbHtml')(code, L.white);
    const disc = shown(html, code), at = L.plate ? PLATES[L.plate].at : W._gateCardPaint(gate, true).at;
    pairs++;
    if (L.white) { by.white++; assert.match(html, /gl-gc-orb gl-gc-orb-white/, code); assert.equal(disc, '#FFFFFF', code); }
    else if (L.plate) by.plate++; else by.stays++;
    if (solo) assert.ok(L.plate, code + ': the whole screen names a plate');
    const tag = (gate || '(none)') + (solo ? ' whole screen' : '') + ' / ' + code + ' ' + disc + ' on ' + (L.plate || W._gateCardPaint(gate, true).kind);
    if (at.some((p) => W._gateDiscSinks(disc, p))) sinks.push(tag);
    if (warm(disc) && at.some(brown)) warmBrown.push(tag);
    if ((L.plate || W._gateCardPaint(gate, true).kind === 'dark') && !at.every((p) => W._gateDiscClear(disc, p))) notClear.push(tag);
    return L;
  };
  for (const { gate } of cards.values()) for (const code of orbs) judge(gate, code, false);
  for (const code of orbs) judge('', code, true);
  assert.deepEqual(sinks, [], sinks.length + ' of ' + pairs + ' pairs sink:\n' + sinks.slice(0, 20).join('\n'));
  assert.deepEqual(warmBrown, [], warmBrown.join('\n'));
  assert.deepEqual(notClear, [], notClear.slice(0, 20).join('\n'));
  assert.ok(by.stays > 0 && by.plate > 0 && by.white > 0, JSON.stringify(by));
  // and the rule would catch them: before the notice judged its orb, the red of Iberia sat on the brown
  // waves of KLM and the red of Emirates on the brown layers of Cathay
  assert.ok(PLATES['brown-waves'].at.some((p) => W._gateDiscSinks('#DC1C2E', p)) && PLATES['brown-layers'].at.some((p) => W._gateDiscSinks('#D71921', p)));
  // the two the check found, on the plate of their own gate: Iberia on the black faint waves, Emirates on
  // the black fine lines; the gate keeps its plate
  const m = (al, fl) => ({ ap: 'YUL', full: { f: { flight: fl, airline: al, dest: 'Madrid', _locIata: 'MAD', time: '18:40', _sortTs: Date.now() + 3600000 }, to: '12' } });
  const kl = the('_gateChangeNoticeHtml')(m('IB', 'IB6252'), 'KL'), cx = the('_gateChangeNoticeHtml')(m('EK', 'EK244'), 'CX');
  assert.match(kl, /^<div class="gl-gc" data-gc-plate="black-faint-waves" data-gl-gc=/);
  assert.match(cx, /^<div class="gl-gc" data-gc-plate="black-fine-lines" data-gl-gc=/);
  assert.deepEqual([W._gateCardPaint('KL').plate, W._gateCardPaint('CX').plate, W._gateCardPaint('IB').plate, W._gateCardPaint('EK').plate], ['brown-waves', 'brown-layers', 'black-faint-waves', 'black-fine-lines']);
  // a notice of KLM on its own gate stays on the brown waves of its gate (its tile stands clear there)
  assert.match(the('_gateChangeNoticeHtml')(m('KL', 'KL672'), 'KL'), /^<div class="gl-gc" data-gl-gc=/);
  // the builder of the gate hands the notice the code of the gate, and the whole screen says it is one
  assert.match(CORE, /_gateChangeNoticeHtml\(_gl, vars\.airlineCode\)/);
  assert.match(CORE, /_gateChangeNoticeHtml\(m, '', true\)/);
  // the stylesheet: the plate the notice names is drawn on its card alone, over the rules of the carrier
  // of the gate, and the orb holds its disc and the filter of its mark against them
  const NOT = '(?::not\\(#_\\)){255}(?::not\\(\\._\\)){6}';
  assert.match(CSS, new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc\\[data-gc-plate\\] \\.gl-gc-row::before \\{\\n  background-color: var\\(--plate-base, #0b0e14\\) !important;\\n  background-image: var\\(--plate-tex\\) !important;'));
  assert.match(CSS, new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc \\.gl-gc-orb > \\.v2-fi-emblem-wrap \\{ background: var\\(--gc-disc, transparent\\) !important; \\}'));
  assert.match(CSS, new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc \\.gl-gc-orb \\.v2-fi-emblem-img \\{ filter: var\\(--gc-filter, none\\) !important; \\}'));
  // ART THAT IS ITS OWN DISC fills its box on the notice, as on the rail: the roundels of Turkish and
  // Alaska (their own light rim), the glossy orbs of Delta and United, the tiles. The padding the
  // stylesheet gives a mark on a disc drew the Turkish roundel at 76 px inside its 104 px box, under a
  // gloss cap that stood out over the empty ring (rendered: padding 14.2 px before, 0 after)
  assert.match(CSS, new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc \\.gl-gc-orb > \\.v2-fi-emblem-native \\{ padding: 0 !important; \\}'));
  for (const code of ['TK', 'AS', 'DL', 'UA', 'NZ', 'A3']) {
    const html = the('_gateChangeOrbHtml')(code);
    assert.match(html, /class="v2-fi-icon-wrap v2-fi-emblem-wrap v2-fi-emblem-native" style="[^"]*padding:0;/, code + ': its own disc, marked so');
  }
  assert.ok(['AS', 'TK'].every((c) => W._ORB_ART_RIMMED[c]) && W._gateNoticeOrb('TK').disc === '#FFFFFF' && W._gateNoticeOrb('TK').rimmed, 'judged by its rim');
});
