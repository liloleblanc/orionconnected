'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE PLATES OF THE DARK CARD
//
// A gate whose discs would sink into a card of their own colour takes the
// dark card and keeps its discs (window._gateCardDark). The dark card was the
// house charcoal under an engraving screened over it; it is drawn now on one of
// six calm stock patterns in grey, black and brown (Vecteezy, Pro licence, no
// attribution required), assigned carrier by carrier, with the
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
// a string read as itself inside a pattern: every character a pattern gives a meaning to, backslash included
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
// base each plate is drawn on, the luminance of the lightest 5th percentile (the 95th percentile of
// luminance), and the darkest 5th percentile (the 5th percentile of luminance, and the average colour
// of the pixels there, dark: the darkest paint the orb of the notice can meet on the plate). Bound to the file by its size and the start of its sha256: a new file is measured
// again before it lands.
const FILES = {
  'plate-grey-wave.jpg':         { item: '85868529', size: 13908, sha: '85928a90a598249d', mean: '#3E403F', p95: 0.060389, p5: 0.029557, dark: '#2F3030' },
  'plate-black-faint-waves.jpg': { item: '82498963', size: 46900, sha: '6bd7a98723c29bc2', mean: '#0E0F11', p95: 0.007070, p5: 0.003193, dark: '#090B0A' },
  'plate-grey-shapes.jpg':       { item: '63527784', size: 22350, sha: '60f98e37e7a7f852', mean: '#37343A', p95: 0.081870, p5: 0.011754, dark: '#1E1B22' },
  'plate-black-fine-lines.jpg':  { item: '69483591', size: 68338, sha: '568de56fa6e5f55c', mean: '#161616', p95: 0.021219, p5: 0.005605, dark: '#111111' },
  'plate-brown-waves.jpg':       { item: '80914976', size: 21792, sha: '1592a8fea2485009', mean: '#2E1D0A', p95: 0.031890, p5: 0.007724, dark: '#1F1307' },
  'plate-brown-layers.jpg':      { item: '88062392', size: 15300, sha: 'a7e57e489a13d135', mean: '#291A0D', p95: 0.016160, p5: 0.007489, dark: '#1D130A' },
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
    assert.match(CSS, new RegExp('html body\\[data-gate-airline\\]\\[data-gate-card="' + name + '"\\](?::not\\(#_\\)){12},\\nhtml body(?::not\\(#_\\)){255}(?::not\\(\\._\\)){6} \\.g8-wrap \\.gl-gc\\[data-gc-plate="' + name + '"\\] \\{\\n  --plate-tex: url\\(\'/textures/' + reEsc(p.file) + '\\?v=24155\'\\);\\n  --plate-base: ' + p.base + ';\\n  --plate-blend: normal;'), name);
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
  const dark = [], by = {}, badgeGates = [], openBadge = [], ringGates = [];
  for (const code of CODES) {
    const K = W._gateCardPaint(code);
    if (K.kind !== 'dark') { assert.equal(W._gateCardPlate(code) && W._gateCardDark(code), '', code); continue; }
    const D = W._gateColumnDisc(code);
    dark.push(code);
    (by[K.plate] = by[K.plate] || []).push(code);
    assert.ok(PLATES[K.plate], code + ': a plate');
    assert.deepEqual([K.base, K.paint, [...K.at], K.file, W._gateCardDark(code)], [PLATES[K.plate].base, PLATES[K.plate].at[0], [...PLATES[K.plate].at], PLATES[K.plate].file, PLATES[K.plate].base], code);
    // the plate is the first of the plates it is tried on that it stands clear of
    const given = W._GATE_CARD_PLATE_OF[D.carrier] || W._GATE_CARD_PLATE;
    const ownBlack = W._GATE_CARD_DARKS[D.carrier] && lab(W._GATE_CARD_DARKS[D.carrier])[0] < lab(W._GATE_CARD_DARK)[0];
    const tried = [given].concat(ownBlack ? ['black-faint-waves'] : [], ['grey-wave', 'black-faint-waves']);
    const roomy = tried.find((n) => PLATES[n].at.every((p) => W._gateDiscClear(D.disc, p, D.ink)));
    // NO CIRCLE INSIDE A CIRCLE (decision of 15 November 2026). A column whose orb is a round badge was a
    // white column where its discs stood clear of no plate with room, the badge inside the ring of its
    // white disc. It takes the first of the same plates its discs do not sink into, no room asked, else
    // the plate they differ from most (Volaris and Mesa, black and a deep navy: open items)
    // A MARK SET IN A RING LINE (window._ORB_RING_MARKS, the same decision): its ring is the edge of the
    // top orb and meets the card. A column whose ring sank into the card it had takes the dark card, on
    // the first of the same plates its ring stands clear of (the ring as the column draws it there), and
    // its discs go white where they have no room on it (TAROM and LOT)
    if (!roomy && W._gateColumnRing(code, [])) {
      ringGates.push(code);
      const ringOn = (n) => W._gateColumnRing(code, PLATES[n].at, true);
      assert.equal(K.plate, tried.find((n) => W._gateRingClear(ringOn(n), PLATES[n].at)), code);
      const P = W._gateOrbParts(code);
      assert.ok(P.ring && W._gateRingClear(P.ring, K.at), code + ': its ring ' + P.ring + ' on ' + K.at.join(','));
      assert.ok(P.white, code + ': its discs have no room on the plate, and go white');
      for (const p of K.at) assert.ok(W._gateDiscClear('#FFFFFF', p, ''), code + ': white on ' + p);
      continue;
    }
    if (!roomy && W._gateOrbBadge(code)) {
      badgeGates.push(code);
      const apart = (n) => Math.min(...PLATES[n].at.map((p) => W._orbDeltaE(D.disc, p)));
      const want = tried.find((n) => PLATES[n].at.every((p) => !W._gateDiscSinks(D.disc, p))) || tried.slice().sort((a, b) => apart(b) - apart(a))[0];
      assert.equal(K.plate, want, code);
      if (K.at.some((p) => W._gateDiscSinks(D.disc, p))) openBadge.push(code);
      continue;
    }
    // A DISC IS NEVER THE COLOUR OF THE PANEL BEHIND IT: not one paint of its plate that it sinks into,
    // and every paint one it is twice as bright as, with an ink that reads on it
    for (const p of K.at) {
      assert.ok(!W._gateDiscSinks(D.disc, p), code + ': ' + D.disc + ' sinks into ' + p + ' of the ' + K.plate);
      assert.ok(W._gateDiscClear(D.disc, p, D.ink), code + ': ' + D.disc + ' stands clear of ' + p);
      assert.ok(W._orbDeltaE(D.disc, p) >= 20, code + ': ' + D.disc + ' on ' + p + ' at ' + W._orbDeltaE(D.disc, p).toFixed(1));
    }
    assert.equal(K.plate, roomy, code);
  }
  assert.ok(badgeGates.length >= 20, badgeGates.length + ' round badges on a plate with no room asked');
  assert.deepEqual(openBadge.sort(), ['Q6', 'Y4', 'YV'], 'the round badges that stand clear of no plate');
  assert.deepEqual(ringGates.sort(), ['LO', 'RO'], 'the white columns of a ring mark on a plate');
  // the dark card is the gates it was before the plates (93 of the codes the name tables know), and the
  // round badges that sat inside a white ring
  assert.ok(dark.length >= 113 && dark.length <= 128, dark.length + ' gates of the dark card');
  // every plate given is used, and the two set first for most gates carry most of them
  assert.deepEqual(Object.keys(by).sort(), [...Object.keys(PLATES)].sort());
  assert.ok(by['grey-wave'].length >= 40 && by['black-faint-waves'].length >= 30, JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length]))));
  // the carriers named, on the plate they were given, but for Royal Jordanian (its grey discs
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
  // (the white columns of TAROM and LOT are on the grey wave since the ring of their mark is the edge of
  // their top orb: it sank into the navy shade they had, window._ORB_RING_MARKS)
  const white = CODES.filter((c) => !W._gateColumnKept(c) && W._gateColumnLook(c).white && !W._gateColumnRing(c, []));
  for (const c of ['RO', 'LO']) assert.deepEqual([W._gateColumnLook(c).white, W._gateCardPaint(c).plate], [true, 'grey-wave'], c);
  // (27 columns whose round badge sat inside a white ring are on the dark plate now: no circle inside a
  // circle, decision of 15 November 2026)
  assert.ok(kept.length >= 30 && white.length >= 70, kept.length + ' kept, ' + white.length + ' white');
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

// ── 6. THE GATE CHANGE NOTICE CHANGES ONLY WHERE IT BREAKS THE RULE ────────
// The notice is drawn on the card it always had (the card of the gate it covers; as the whole screen, the
// metal card in the colour of its carrier), and its orb is the carrier of the moved flight. What is judged
// is what lands: every file the markup names is resolved against fids-current, and where one is missing
// the handler of a missing file is applied (window._orbArtFailed: the row tile, filling the disc in its own
// ground, else the letters on the disc); the rules of the gate that reach the orb are applied unless the
// orb holds its own look. A pair that keeps the colour rule there (no disc the colour of the card, no
// red, orange or gold on a brown, no mark the colour of its disc) is written exactly as it always was: no
// plate of its own, no held or white orb. A notice of its own carrier on a gate approved as drawn never
// changes. Every other pair is moved by the least change that keeps the rule: its own look held, else a
// plate of its own (clear with room where one is), and white only after every plate. Walked over every
// card the gates can show (the distinct paints of every code the name tables know, with the rules of the
// gate that reach the orb, and the gate with no code) and every orb the notice can draw, and over the
// notice that is the whole screen.
// ── 6b. THE ART THAT IS ITS OWN DISC, JUDGED BY ITS REAL COLOURS ───────────
// The notice judged art that fills its disc by a table, and by the accent where no table had a ground:
// the red roundel of Pegasus as its yellow accent, the red line art of Copa (ZP) as a blue disc. Every
// svg the notice can draw as art of its own (the mark of every carrier, its white orb, and the look of
// the column of its own gate) is read here: what the notice judges for it is a colour the file draws.
const TILE_GROUNDS_JS = require(path.join(ROOT, 'scripts/orbs/tile-grounds.js'));
const drawnIn = (src) => {
  const txt = fs.readFileSync(path.join(FC, String(src).split('?')[0]), 'utf8');
  const out = new Set();
  const norm = (v) => {
    v = String(v).trim();
    if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map((z) => z + z).join('');
    const r = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
    if (r) v = '#' + [r[1], r[2], r[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('');
    const named = { white: '#FFFFFF', black: '#000000', red: '#FF0000', currentcolor: '#000000' };
    if (named[v.toLowerCase()]) v = named[v.toLowerCase()];
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : '';
  };
  for (const m of txt.matchAll(/(?:fill|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgb\([^)]*\)|white|black|red|currentColor)/g)) { const v = norm(m[1]); if (v) out.add(v); }
  // and what the reader of the tile grounds resolves (a shape with no fill is black, a class fill)
  for (const sh of TILE_GROUNDS_JS.build(txt).shapes || []) { const v = norm(sh.fill || ''); if (v) out.add(v); }
  return out;
};
test('the art that is its own disc is judged by the colours its file draws', () => {
  const hex = (h) => W._gateNoticeHex(h);
  const fold = the('_orbEmblemCarrier');
  const seen = new Map();
  for (const c of CODES) {
    const tries = [[false, false, ''], [true, true, '']];
    if (!W._gateColumnKept(c)) tries.push([false, true, c]);
    for (const [white, held, gate] of tries) {
      const L = gate ? W._gateNoticeLands(gate, c, false, true, gate, true) : W._gateNoticeLands('', c, white, held, '');
      if (!L || (L.how !== 'art' && L.how !== 'tile')) continue;
      const src = (/<img src="([^"]*)"/.exec(L.html) || [])[1] || '';
      if (!/\.svg(\?|$)/.test(src)) continue;
      const k = src.split('?')[0];
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push({ c, L });
    }
  }
  assert.ok(seen.size >= 60, seen.size + ' files');
  const bad = [];
  for (const [src, uses] of seen) {
    const tile = (/\/airline-tiles\/([A-Za-z0-9-]+)\.svg$/.exec(src) || [])[1] || '';
    const A = W._ORB_ART_GROUNDS[src];
    const generated = !!(tile && W._ORB_TILE_GROUNDS[tile]);
    if (!generated && !A) { bad.push(src + ': drawn as art of its own, read off no file'); continue; }
    const drawn = drawnIn(src);
    if (A) for (const k of ['ground', 'second', 'line', 'inner']) if (A[k] && !drawn.has(A[k])) bad.push(src + ': ' + k + ' ' + A[k] + ' is not drawn in the file (' + [...drawn].join(' ') + ')');
    for (const { c, L } of uses) {
      const own = W._gateNoticeBadgeDisc(c, (/class="v2-fi-icon-wrap[^"]*" style="([^"]*)"/.exec(L.html) || [])[1]);
      for (const k of ['disc', 'second', 'warm', 'warm2']) {
        const v = hex(L[k]);
        if (!v || (k === 'disc' && v === own) || (k === 'disc' && L.rimmed && v === '#FFFFFF')) continue;
        if (!drawn.has(v)) bad.push(c + ' ' + src + ': its ' + k + ' ' + v + ' is not a colour the file draws');
      }
    }
  }
  assert.deepEqual(bad, [], bad.slice(0, 20).join('\n'));
  // every row is a file on disk, and an svg
  for (const src of Object.keys(W._ORB_ART_GROUNDS)) assert.ok(/\.svg$/.test(src) && fs.existsSync(path.join(FC, src)), src);
  // by name: Pegasus red, Copa red line art on a clear ground (judged for the sink and the brown alike),
  // the two halves of Level, Austrian, Wizz, Qantas and Pascan
  const at = (c) => W._gateNoticeLands('', c, false, false, '');
  assert.deepEqual([at('PC').how, at('PC').disc, at('PC').warm], ['art', '#C30B0B', '#C30B0B']);
  // (the lines of Paranair trace a circle: a ring mark, its red ring the edge of its orb and the white of
  // the disc inside it, window._ORB_RING_MARKS; the red is judged for the sink and the brown alike)
  assert.deepEqual([at('ZP').how, at('ZP').disc, at('ZP').inside, at('ZP').warm || at('ZP').disc], ['ring-mark', '#CD1025', '#FFFFFF', '#CD1025']);
  assert.deepEqual([at('LL').disc, at('LL').second], ['#3FA74D', '#00AADB']);
  assert.deepEqual([at('W4').disc, at('W4').second, at('OS').disc, at('OS').second, at('QF').disc, at('QF').second, at('8P').disc, at('8P').second],
    ['#CD2B86', '#161998', '#D81E05', '#FFFFFF', '#BE0000', '#FF0000', '#0B3371', '#F5891D']);
  assert.deepEqual([at('TK').disc, at('TK').warm, at('AS').disc, at('AS').warm], ['#FFFFFF', '#C90019', '#FFFFFF', '#0C4368'], 'the rimmed roundels: the rim, and the colour inside it');
  // on a maroon card the red of Pegasus and of Copa sinks and takes a plate; on a blue card both stand
  // out and the notice is as it always was
  for (const g of ['LX', 'OZ', 'TK']) for (const c of ['PC', 'ZP']) {
    const L = W._gateNoticeLook(g, c);
    assert.ok(L.plate && /^sink:#C[3D]/.test(L.why), g + ' / ' + c + ': ' + JSON.stringify(L));
  }
  // (SAS was the third: its gate is on the dark plate since its tile no longer sits inside a white ring)
  for (const g of ['AF', '2T', 'KU']) for (const c of ['PC', 'ZP']) assert.equal(W._gateNoticeLook(g, c).why, '', g + ' / ' + c);
  // a judge of both halves: the blue half of Wizz on the navy shade of a gate (2T), where its magenta stands out
  assert.ok(!W._gateDiscSinks('#CD2B86', '#14264D'));
  assert.match(W._gateNoticeBreaks(at('W4'), { at: ['#14264D'] }), /^sink:#161998>/);
});

test('the gate change notice: what lands is judged, and a notice changes only where it breaks the rule there', () => {
  const ACCENT = (c) => W._gateNoticeHex(the('getAirlineAccent')(c));
  const hex = (h) => W._gateNoticeHex(h);
  const onDisk = (src) => fs.existsSync(path.join(FC, String(src).split('?')[0]));
  const ratio = (a, b) => contrast(a, b);
  const sinks = (a, b) => W._gateDiscSinks(a, b);
  const warm = (h) => chroma(h) >= 15 && (hue(h) < 100 || hue(h) > 330);
  const brown = (h) => lab(h)[0] <= 50 && chroma(h) >= 6.5 && hue(h) > 40 && hue(h) < 95;
  // the symbol files the notice may name are the files on disk
  const shipped = fs.readdirSync(path.join(FC, 'logos/symbols/airlines')).filter((f) => /^[A-Z0-9]{2}\.svg$/.test(f)).map((f) => f.slice(0, 2)).sort();
  assert.deepEqual(Object.keys(W._ORB_SYMBOLS_ON_DISK).sort(), shipped, 'the list of symbols is the folder');
  // the rules of the gates that reach the orb of the notice, each held to its rule in the stylesheet
  const NOTS = '(?::not\\(#_\\))+';
  const RULES = W._GATE_NOTICE_ORB_RULES;
  assert.deepEqual(Object.keys(RULES).sort(), ['AA', 'DL', 'F8', 'FR', 'LH', 'PB', 'PD', 'QR', 'UA']);
  assert.deepEqual(Object.keys(RULES).filter((k) => RULES[k].wrap).sort(), ['F8', 'PB', 'UA'], 'the three keyed on the class of the wrap');
  // the rules keyed on the class of the wrap (gate-display.css): the notice is drawn inside the wrap of the
  // gate (.g8-wrap.g8-airline-XX), as the card of the notice carries the classes of the shelves
  // (.gl-gc-card.g8-bir-shelves), and its row is the first row of its block
  const GATE = fs.readFileSync(path.join(FC, 'css/gate-display.css'), 'utf8');
  assert.match(CORE, /'<div class="gl-gc-card g8-bir-shelves"><div class="v2-flightinfo-block"><div class="v2-fi-row gl-gc-row">'/);
  assert.match(CORE, /'<div class="g8-wrap gl-solo g8-airline-' \+ fidsEscHtml\(code\) \+ '"'/, 'the whole screen wears the class of the carrier of the moved flight');
  assert.match(GATE, /\.g8-airline-PB :is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-fi-emblem-wrap,\n\.g8-airline-SP :is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-fi-icon-badge,\n\.g8-airline-SP :is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-fi-emblem-wrap \{ background: #FCA404 !important; \}/);
  assert.deepEqual([RULES.PB.disc, RULES.PB.native, the('_orbEmblemCarrier')('SP')], ['#FCA404', true, 'PB'], 'PAL: its gold, art that is its own disc included; SP folds to PB');
  assert.match(GATE, /\.g8-airline-F8 :is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-fi-icon-wrap \{ color: #1C1C1C !important; \}\n[^\n]*\n\.g8-airline-F8 \.v2-fi-emblem-img \{ filter: none !important; \}/);
  assert.deepEqual([RULES.F8.unwhite, RULES.F8.letters, RULES.F8.disc], [true, '#1C1C1C', undefined]);
  assert.match(GATE, /\.g8-wrap\.g8-airline-UA :is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-fi-emblem-wrap \{\n  background:\n    radial-gradient\(circle at 34% 27%,\n[^;]*var\(--airline-accent,#0033A1\) 58%,\n      color-mix\(in srgb, var\(--airline-accent,#0033A1\) 56%, #000000\) 100%\) !important;/);
  assert.match(GATE, /\.g8-wrap\.g8-airline-UA :is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-fi-row:first-child \.v2-fi-emblem-wrap\.v2-fi-emblem-native \{\n  background: transparent !important;/);
  assert.match(GATE, /\.g8-wrap\.g8-airline-UA :is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-fi-row:first-child \.v2-fi-emblem-img \{\n[^}]*filter: none !important;/);
  assert.deepEqual([RULES.UA.disc, RULES.UA.edge, RULES.UA.gradient, RULES.UA.clearNative, RULES.UA.unwhite], ['accent', 0.56, true, true, true]);
  // the gradient in the accent of the orb: the middle is the accent, the edge 56 hundredths of it on black
  assert.deepEqual({ ...W._gateNoticeRuleDisc(RULES.UA, '#DC1C2E') }, { disc: '#DC1C2E', edge: '#7B101A' }, 'Iberia on a United gate: measured #DC1C2E and #7B101A in Chrome');
  // the rule of the body by the carrier the gate folds to, the rule of the wrap by its class: the whole
  // screen of a carrier is reached by the rules of its wrap only
  assert.equal(W._gateNoticeOrbRule('SP'), RULES.PB);
  assert.equal(W._gateNoticeOrbRule('', 'PB'), RULES.PB);
  assert.equal(W._gateNoticeOrbRule('', 'AA'), null, 'the body names no carrier on the whole screen');
  assert.equal(W._gateNoticeOrbRule('MQ'), RULES.AA);
  assert.match(CSS, new RegExp('html body:is\\(\\[data-gate-airline="DL"\\],\\[data-gate-airline="DAL"\\],\\[data-gate-airline\\*="DELTA"\\]\\)' + NOTS + ' \\.g8-wrap \\.v2-fi-emblem-wrap,[^{]*\\{\\s*background:\\s*radial-gradient\\(circle at 34% 26%,\\s*#ff6d7d 0%,\\s*#f23a4e 26%,\\s*#E01933 55%,\\s*#b3122a 80%,\\s*#8f0f24 100%\\) !important;'));
  assert.deepEqual([RULES.DL.disc, RULES.DL.edge], ['#E01933', '#8F0F24']);
  assert.match(CSS, new RegExp('html body:is\\(\\[data-gate-airline="AA"\\],\\[data-gate-airline="AAL"\\],\\[data-gate-airline\\*="AMERICAN"\\]\\)' + NOTS + ' \\.g8-wrap\\s+\\.v2-fi-emblem-wrap:not\\(\\.v2-fi-emblem-native\\) \\{\\s*background: #ffffff !important;'));
  assert.match(CSS, new RegExp('html body\\[data-gate-airline="PD"\\]' + NOTS + ' \\.v2-fi-emblem-wrap:not\\(\\.v2-fi-emblem-native\\) \\{\\s*background: #FFFFFF !important;'));
  assert.match(CSS, /html body\[data-gate-airline="FR"\] \.v2-fi-emblem-wrap img,[^{]*\{\s*filter: none !important;/);
  assert.match(CSS, /html body\[data-gate-airline="FR"\] \.v2-fi-orb-code,[^{]*\{\s*color: #F1C933 !important;/);
  for (const [g, ink] of [['AA', '#002745'], ['LH', '#12161d'], ['QR', '#12161d']]) assert.equal(RULES[g].letters.toLowerCase(), ink, g + ': the ink of its plate');
  assert.ok(CSS.toLowerCase().split('--plate-ink: #12161d;').length - 1 >= 2 && CSS.includes('--plate-ink: #002745;'), 'the inks of the plates of Lufthansa, Qatar and American');
  // the colours of the files of the marks the notice inks, where the Ryanair gate takes the ink off: the
  // colour of the file nearest the disc. Every such mark not listed sinks into its disc in that colour.
  const fileInk = (src, disc) => {
    const s = fs.readFileSync(path.join(FC, String(src).split('?')[0]), 'utf8');
    const all = [...new Set([...s.matchAll(/(?:fill|stop-color)\s*[:=]\s*"?\s*(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|currentColor|black|white)/g)].map((m) => {
      let v = m[1];
      if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map((z) => z + z).join('');
      const r = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
      if (r) v = '#' + [r[1], r[2], r[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('');
      if (v === 'currentColor' || v === 'black') v = '#000000';
      if (v === 'white') v = '#ffffff';
      return v.toUpperCase();
    }))];
    return all.sort((a, b) => W._orbDeltaE(a, disc) - W._orbDeltaE(b, disc))[0];
  };
  const orbs = CODES.filter((c) => the('_gateChangeOrbHtml')(c));
  const fold = the('_orbEmblemCarrier');
  let inked = 0;
  for (const c of orbs) {
    const html = the('_gateChangeOrbHtml')(c), img = /<img src="([^"]*)"[^>]*style="([^"]*)"/.exec(html);
    if (!img || !/filter:brightness\(0\)/.test(img[2])) continue;
    inked++;
    const disc = W._gateNoticeBadgeDisc(c, (/class="v2-fi-icon-wrap[^"]*" style="([^"]*)"/.exec(html) || [])[1]);
    const near = fileInk(img[1], disc), listed = W._ORB_MARK_FILE_INK[fold(c)];
    if (listed) assert.ok(listed === near && !sinks(near, disc), c + ': ' + near + ' on ' + disc);
    else assert.ok(sinks(near, disc), c + ': its file, ' + near + ', sinks into its disc ' + disc + ' (or it is listed)');
  }
  assert.ok(inked >= 35, inked + ' marks inked');
  // the orb as it lands, read off the markup: the file that draws (a missing one replaced as its handler
  // replaces it), the rules of the gate unless the orb is held
  const lands = (html, code, gate, wrapC) => {
    const wrap = /class="v2-fi-icon-wrap([^"]*)" style="([^"]*)"/.exec(html);
    const native = /v2-fi-emblem-native/.test(wrap[1]), style = wrap[2], held = /gl-gc-orb-held/.test(html);
    const R = held ? null : W._gateNoticeOrbRule(gate, wrapC === undefined ? gate : wrapC);
    const ruled = !!(R && R.disc && (R.native || !native));
    const shade = (h, k) => '#' + rgb(h).map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('').toUpperCase();
    const Rd = !ruled ? { disc: '', edge: '' } : R.disc === 'accent' ? { disc: ACCENT(code), edge: R.gradient ? shade(ACCENT(code), R.edge) : '' } : { disc: R.disc, edge: R.edge || '' };
    const row = W._GATE_ORB_LOOKS[fold(code)] || {};
    const padded = !/padding:0 !important/.test(style) && !/padding:calc\(/.test(style);
    const own = W._gateNoticeBadgeDisc(code, style);
    let img = /<img src="([^"]*)"[^>]*style="([^"]*)"/.exec(html), lt = /<span class="v2-fi-orb-code"(?: style="color:([^;"]+) !important;")?>/.exec(html);
    let fills = img && /object-fit:cover !important/.test(img[2]) && !padded;
    let srcs = 0;
    if (img) {
      srcs++;
      if (!onDisk(img[1])) {
        // the handler: the row tile of the folded code, filling the disc; else the letters on the disc
        const t2 = W._gateNoticeMissTile(code);
        if (!/data-orb-tile-tried/.test(html) && t2.tile && onDisk(t2.tile)) { img = [img[0], t2.tile, 'object-fit:cover !important;']; fills = !/--orb-ring/.test(style); }
        else { img = null; lt = [null, (own && W._orbInkOn(own) !== '#fff') ? '#10151f' : '']; }
      }
    }
    const L = { disc: '', edge: '', second: '', warm: '', warm2: '', ink: '', rimmed: false, srcs, missing: img ? !onDisk(img[1]) : false };
    if (lt) { L.disc = ruled ? Rd.disc : own; L.edge = Rd.edge; L.ink = hex(lt[1]) || (R && R.letters) || '#FFFFFF'; return L; }
    if (!img) return L;
    const tile = (/\/airline-tiles\/([A-Za-z0-9-]+)\.svg/.exec(img[1]) || [])[1] || '';
    const A = W._ORB_ART_GROUNDS[String(img[1]).split('?')[0]] || {};
    if (fills && !/--orb-ring/.test(style)) { L.disc = hex(W._ORB_TILE_GROUNDS[tile]) || hex(A.ground) || own || ACCENT(code); L.second = L.warm2 = hex(A.second); return L; }
    if (native) {
      // the art as its file draws it (the table read off the files, below), a table of the gate for a picture
      const ground = hex(A.ground) || hex(A.line) || hex(W._gateOrbNatural(code, true).ground) || hex(row.ground) || hex(W._ORB_TILE_GROUNDS[tile]) || ACCENT(code);
      const box = (R && R.clearNative) ? '' : own;
      L.rimmed = !!W._ORB_ART_RIMMED[fold(code)]; L.warm = hex(A.inner) || ground; L.disc = L.rimmed ? '#FFFFFF' : ground; L.second = L.warm2 = hex(A.second);
      if (padded && box && box !== ground && !L.rimmed) { L.disc = box; L.second = ''; }
      if (ruled && padded) { L.disc = Rd.disc; L.edge = Rd.edge; L.second = ''; L.warm = ''; L.warm2 = ''; L.rimmed = false; }
      return L;
    }
    L.disc = ruled ? Rd.disc : own; L.edge = Rd.edge;
    const w = /invert\(1\)/.test(img[2]) && !/--gc-filter:(?!brightness)/.test(img[2]) || /--gc-filter:brightness\(0\) invert\(1\)/.test(img[2]);
    const b = !w && /brightness\(0\)/.test(img[2]);
    if ((w || b) && R && R.unwhite) L.ink = hex(W._ORB_MARK_FILE_INK[fold(code)]) || L.disc;
    else if (w) L.ink = /^#f{3}(f{3})?$/i.test(String(row.ink || '')) ? '' : '#FFFFFF';
    else if (b) L.ink = '#000000';
    // a mark set in a ring line, its ring the edge of the orb (no padding): the ring meets the card, in the
    // ink it is drawn in, and the mark is judged against the inside of the ring
    const RM = W._ORB_RING_MARKS[String(img[1]).split('?')[0]];
    if (RM && /padding:0 !important/.test(style)) {
      L.inside = L.disc;
      L.disc = ((w || b) && R && R.unwhite) ? (L.ink || RM.ring) : w ? '#FFFFFF' : b ? '#000000' : RM.ring;
      L.edge = '';
      if (!L.ink) L.ink = L.disc;
    }
    return L;
  };
  const broke = (L, at) => {
    for (const d of [L.disc].concat(L.edge ? [L.edge] : [], L.second ? [L.second] : [])) for (const p of at) if (sinks(d, p)) return 'sinks: ' + d + ' on ' + p;
    for (const w of [L.warm || L.disc].concat(L.warm2 ? [L.warm2] : [])) if (at.some(brown) && warm(w)) return 'warm on a brown: ' + w;
    const on = L.inside || L.disc;
    if (L.ink && (sinks(L.ink, on) || ratio(L.ink, on) < 3)) return 'a mark the colour of its disc: ' + L.ink + ' on ' + on;
    return '';
  };
  // the cards: one gate for each distinct paint and rule
  const cards = new Map();
  for (const g of CODES.concat([''])) {
    const K = W._gateCardPaint(g, true), sig = K.kind + ':' + K.at.join(',') + '|' + JSON.stringify(W._gateNoticeOrbRule(g) || {});
    if (!cards.has(sig)) cards.set(sig, g);
  }
  // (fewer cards than the 80 there were: the gates whose round badge sat inside a white ring share the
  // plates now, no circle inside a circle, decision of 15 November 2026)
  assert.ok(cards.size >= 60 && orbs.length >= 250, cards.size + ' cards, ' + orbs.length + ' orbs');
  const bad = [], missing = [], open = {}, by = { as: 0, keptOwn: 0, held: 0, column: 0, plate: 0, room: 0, white: 0, darkCard: 0, darkRoom: 0, roomWhite: 0, badge: 0, badgePlate: 0, badgeFill: 0, ownPlate: 0 };
  // NO CIRCLE INSIDE A CIRCLE. A round badge (window._gateOrbBadge) is never set inside the ring of a
  // white disc, and art that is a disc by itself fills its orb edge to edge on a clear box the rules of the
  // gate cannot paint (held), wherever the notice draws it but under its own carrier on a gate left as
  // drawn. Read off the markup: the class of the wrap, its padding and its disc
  const badgeFill = (html) => /<span class="gl-gc-orb gl-gc-orb-held"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap v2-fi-emblem-native" style="[^"]*background:transparent;padding:0 !important;--gc-disc:transparent;">/.test(html);
  const lineArt = (html) => { const src = (/<img src="([^"]*)"/.exec(html) || [])[1] || ''; const A = W._ORB_ART_GROUNDS[src.split('?')[0]] || {}; return !!(A.line && !A.ground); };
  const roundInRing = (html) => /--orb-ring/.test(html) && /object-fit:cover/.test(html) && !lineArt(html);
  // a mark set in a ring line, drawn with its ring as the edge of its orb (window._ORB_RING_MARKS)
  const ringMark = (html) => { const src = (/<img src="([^"]*)"/.exec(html) || [])[1] || ''; return !!W._ORB_RING_MARKS[src.split('?')[0]] && /padding:0 !important/.test(html); };
  // every colour of the orb that meets a dark plate stands clear of every paint of it with room
  const roomOn = (Lw, at) => [Lw.disc].concat(Lw.edge ? [Lw.edge] : [], Lw.second ? [Lw.second] : []).every((d) => at.every((p) => W._gateDiscClear(d, p, (d === Lw.disc && !Lw.inside) ? Lw.ink : '')));
  const m = (al) => ({ ap: 'YUL', full: { f: { flight: al + '101', airline: al, dest: 'Madrid', _locIata: 'MAD', time: '18:40', _sortTs: Date.now() + 3600000 }, to: '12' } });
  const walk = (gate, code, solo) => {
    const whole = solo || !gate;
    const L = W._gateNoticeLook(gate, code, solo);
    const notice = the('_gateChangeNoticeHtml')(m(code), gate, solo);
    const html = (/<span class="gl-gc-orb[\s\S]*?<\/span><\/span>(?:<\/span>)?/.exec(notice) || [''])[0];
    const plate = (/^<div class="gl-gc" data-gc-plate="([a-z-]+)"/.exec(notice) || [])[1] || '';
    assert.equal(plate, L.plate, code + ' on ' + gate + ': the plate the notice names is the plate decided');
    // on a plate: its paints and its darkest (the file, measured)
    const at = plate ? PLATES[plate].at.concat([FILES[PLATES[plate].file].dark]) : (whole ? W._gateSoloCard(code).at : W._gateCardPaint(gate, true).at);
    // A DARK PLATE COUNTS ONLY WITH ROOM, WHOEVER CHOSE IT: the card of a gate drawn on one of the dark
    // plates is judged as a plate the notice takes is, by its paints and its darkest
    const gc = whole ? null : W._gateCardPaint(gate, true);
    const darkAt = (!plate && gc && gc.kind === 'dark') ? PLATES[gc.plate].at.concat([FILES[PLATES[gc.plate].file].dark]) : null;
    const Lw = lands(html, code, whole ? '' : gate, solo ? code : gate);
    if (Lw.missing) missing.push(gate + '/' + code);
    const tag = (whole ? '(whole screen)' : gate || '(no code)') + ' / ' + code;
    const ownKept = !whole && W._gateColumnKept(gate) && fold(gate) === fold(code);
    assert.ok(!roundInRing(html), tag + ': a round badge inside the ring of a white disc');
    if (badgeFill(html)) by.badgeFill++;
    if (!L.plate && !L.white && !L.hold && !L.badge) {
      // unchanged: written as it always was, but for art that is a disc by itself, which fills its orb
      // now (held: no rule of the gate paints round it)
      assert.doesNotMatch(notice, /data-gc-plate|gl-gc-orb-white/, tag);
      if (!badgeFill(html)) assert.doesNotMatch(notice, /gl-gc-orb-held|--gc-disc|--gc-filter/, tag);
      if (ownKept) { by.keptOwn++; return; }
      by.as++;
      if (darkAt) { by.darkCard++; if (roomOn(Lw, darkAt) || (((badgeFill(html) && W._gateOrbBadge(code)) || ringMark(html)) && !broke(Lw, darkAt))) by.darkRoom++; else bad.push(tag + ' kept as it was on the dark plate of its gate, without room'); }
      // the whole screen of a carrier whose gate is approved as drawn wears the rules of that gate: its mark
      // and its disc there are the approved pair (the white arrow of PAL on its gold), only the disc is judged
      const why = broke((solo && W._gateColumnKept(code)) ? { ...Lw, ink: '' } : Lw, at);
      if (why) bad.push(tag + ' kept as it was, but ' + why);
      return;
    }
    // changed: it broke the rule on the card it had, and keeps it now
    assert.ok(L.why, tag + ': changed with a reason');
    assert.ok(!ownKept, tag + ': a kept gate of its own carrier never changes');
    if (L.white) { by.white++; assert.match(html, /gl-gc-orb gl-gc-orb-white gl-gc-orb-held/, tag); assert.ok(!W._gateOrbBadge(code), tag + ': a round badge is never drawn white'); }
    else if (L.badge) { by.badge++; assert.ok(badgeFill(html) && W._gateOrbBadge(code), tag + ': the round badge fills its orb'); }
    else if (L.plate) by.plate++; else if (L.column) by.column++; else by.held++;
    if (L.hold) assert.match(html, /gl-gc-orb-held/, tag);
    if (L.column) assert.ok(!whole && fold(gate) === fold(code) && !W._gateColumnKept(gate), tag + ': the look of the column only for its own carrier on its own gate');
    // (a ring mark meets the card with its ring on its white disc too: it takes a plate it has room on; and
    // the own look of a carrier whose round badge would stand clear of no card and no plate tries the
    // plates first, with room: Porter, its navy disc on the black faint waves)
    if (/^room:/.test(L.why)) { by.roomWhite++; const ownOnPlate = !!(L.plate && !L.badge && !L.white && W._gateOrbBadge(code) && roomOn(Lw, at)); if (ownOnPlate) by.ownPlate++; assert.ok((L.white || L.badge || ownOnPlate || (L.plate && !!W._gateOrbRingMark((/<img src="([^"]*)"/.exec(html) || [])[1]))) && !broke(lands(the('_gateChangeOrbHtml')(code, false, gate, false, gate), code, gate), W._gateCardPaint(gate, true).at), tag + ': kept the rule, had no room, drawn white, as its round badge filling its orb, or in its own look on a plate it has room on'); }
    // a round badge: no room asked (it is what sent it to the white disc), only the rule; the open items
    // stand clear of no card and no plate and are drawn where they differ most, counted by carrier below
    // (a mark set in a ring line likewise: its ring is a line at the edge of an orb of the white the disc
    // had, or of the disc of its colour, and no navy line has room on a dark plate)
    const badgeNoRoom = (L.badge || (badgeFill(html) && W._gateOrbBadge(code)) || ringMark(html));
    if (L.open) { assert.ok(L.badge && /^badge:/.test(L.open), tag + ': ' + L.open); open[fold(code)] = (open[fold(code)] || 0) + 1; return; }
    // on the dark plate of its gate, with room (the look of the column is the look of the rail there, below)
    if (darkAt && !L.column) { by.darkCard++; if (roomOn(Lw, darkAt) || (badgeNoRoom && !broke(Lw, darkAt))) by.darkRoom++; else bad.push(tag + ' (' + JSON.stringify(L) + ') on the dark plate of its gate without room'); }
    const why = broke(Lw, at);
    if (why) bad.push(tag + ' (' + JSON.stringify(L) + ') still ' + why);
    // A PLATE COUNTS ONLY WITH ROOM: every colour of the orb that meets the plate clear of every paint of
    // it; for a round badge, the rule alone
    if (plate) {
      if ([Lw.disc].concat(Lw.edge ? [Lw.edge] : [], Lw.second ? [Lw.second] : []).every((d) => at.every((p) => W._gateDiscClear(d, p, (d === Lw.disc && !Lw.inside) ? Lw.ink : '')))) by.room++;
      else if (badgeNoRoom && !why) by.badgePlate++;
      else bad.push(tag + ' (' + JSON.stringify(L) + ') on a plate without room');
    }
  };
  for (const gate of cards.values()) for (const code of orbs) walk(gate, code, false);
  for (const code of orbs) walk('', code, true);
  assert.deepEqual(missing, [], 'every file the notice names is on disk');
  assert.deepEqual(bad, [], bad.length + ' pairs:\n' + bad.slice(0, 20).join('\n'));
  assert.ok(by.as > 0 && by.keptOwn > 0 && by.held > 0 && by.column > 0 && by.plate > 0 && by.white > 0 && by.roomWhite > 0 && by.darkCard > 0 && by.badge > 0 && by.badgeFill > 0, JSON.stringify(by));
  assert.equal(by.darkRoom, by.darkCard, JSON.stringify(by));
  // a plate is taken only where the orb stands clear of it with room (the measure of the rail on the dark
  // card), or by a round badge where it breaks no rule there; where no plate gives room a mark is drawn
  // white, as the rail draws a column of dark discs, and a round badge fills its orb
  // (every plate taken is one or the other, or the pair is in the list of what is wrong above)
  assert.ok(by.room >= by.plate && by.badgePlate > 0, JSON.stringify(by));
  // THE OPEN ITEMS: round badges of black and of a navy as dark as every plate (Air New Zealand, Breeze,
  // Volaris and Volaris Costa Rica that wears it, Mesa), drawn filling their orb on the card or the plate
  // they differ from most. Porter is none of them now: where its tile would be open, its own look (the p
  // on its navy disc, #254D87) takes the black faint waves, with room
  assert.deepEqual(Object.keys(open).sort(), ['MX', 'NZ', 'Y4', 'YV'], JSON.stringify(open));
  assert.ok(by.ownPlate > 0, JSON.stringify(by));
  for (const g of ['KE', 'LO', 'RO']) {
    const L = W._gateNoticeLook(g, 'PD');
    assert.deepEqual([L.plate, L.badge, L.white, L.hold, !!L.open, /^room:/.test(L.why)], ['black-faint-waves', false, false, false, false, true], g + ' / PD: ' + JSON.stringify(L));
    assert.match(the('_gateChangeNoticeHtml')(m('PD'), g), /^<div class="gl-gc" data-gc-plate="black-faint-waves"[\s\S]*<span class="gl-gc-orb"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap" style="[^"]*background:var\(--airline-accent,#1a3a6b\);[\s\S]*porter-p\.svg/);
  }
  // and the handler of a missing file is judged where one is missing: a guess that is not on disk
  const guess = '<span class="gl-gc-orb"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap" style="background:#005DAF;"><img src="/logos/symbols/airlines/WB.svg" alt="" class="v2-fi-emblem-img" style="filter:brightness(0) invert(1);"></span></span>';
  assert.ok(!onDisk('/logos/symbols/airlines/WB.svg'));
  assert.equal(lands(guess, 'WB', 'CX').disc, hex(W._ORB_TILE_GROUNDS.RWD), 'the Rwandair tile lands, in its gold');
  // what the check found, by name
  const look = (g, c, solo) => W._gateNoticeLook(g, c, solo);
  const n = (al, g, solo) => the('_gateChangeNoticeHtml')(m(al), g, solo);
  // the gold tile of Rwandair that lands for WB on the brown layers of Cathay: now on a plate, and the
  // markup names the tile; the yellow tiles of BT, WB and HY on the gold of Lufthansa; the navy tile of
  // SAS on the blue of American
  assert.match(the('_gateChangeOrbHtml')('WB'), /<img src="\/logos\/airline-tiles\/RWD\.svg" alt="" class="v2-fi-emblem-img" data-orb-tile-tried="1" style="[^"]*width:100% !important;height:100% !important;object-fit:cover !important;border-radius:50% !important;"/);
  assert.match(the('_gateChangeOrbHtml')('WB'), /style="[^"]*padding:0 !important;"/);
  for (const [g, c] of [['CX', 'WB'], ['LH', 'BT'], ['LH', 'WB'], ['LH', 'HY']]) {
    assert.ok(look(g, c).plate && !look(g, c).white && /^sink:/.test(look(g, c).why), g + ' / ' + c + ': ' + JSON.stringify(look(g, c)));
  }
  // the navy tile of SAS on the blue of American: no plate gives it room, and it was drawn white, the tile
  // inside the ring of the white disc. NO CIRCLE INSIDE A CIRCLE (decision of 15 November 2026): the tile
  // fills its orb, on the first plate it breaks no rule on, the grey wave
  assert.deepEqual([look('AA', 'SK').plate, look('AA', 'SK').white, look('AA', 'SK').badge, /^sink:/.test(look('AA', 'SK').why)], ['grey-wave', false, true, true]);
  assert.match(n('SK', 'AA'), /^<div class="gl-gc" data-gc-plate="grey-wave"[\s\S]*<span class="gl-gc-orb gl-gc-orb-held"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap v2-fi-emblem-native" style="[^"]*background:transparent;padding:0 !important;--gc-disc:transparent;"><img src="\/logos\/airline-tiles\/SAS\.svg"/);
  // A PLATE COUNTS ONLY WITH ROOM: the navy and the dark discs that landed on the black faint waves 20 from
  // the near black of it (Kuwait, EgyptAir, Bulgaria Air, Breeze, TAROM, MIAT on the whole screen) were
  // drawn white, on the card they had. Kuwait and TAROM still are: a mark on the white disc, the bird of
  // Kuwait and the mark of TAROM in their colours. EgyptAir, Bulgaria Air, Breeze and MIAT carried a round
  // badge in that white ring, their tile: it fills the orb now, on the grey wave (Breeze, a navy as dark as
  // every plate, on the plate it differs from most: an open item)
  for (const c of ['KU']) {
    const L = look('', c, true);
    assert.ok(L.why && L.white && !L.plate && !W._gateOrbBadge(c), c + ': ' + JSON.stringify(L));
    assert.ok(!W._gateDiscClear(W._gateNoticeLands('', c, false, false, c).disc, FILES['plate-black-faint-waves.jpg'].dark, ''), c + ': no room on the black faint waves');
  }
  // TAROM is a ring mark now (window._ORB_RING_MARKS): its mark in white on its navy, the white ring the
  // edge of the orb, and that white ring stands clear of the metal of its whole screen: as it always was
  {
    const L = look('', 'RO', true), Lr = W._gateNoticeLands('', 'RO', false, false, 'RO');
    assert.deepEqual([L.why, L.white, L.plate, Lr.how, Lr.disc, Lr.inside], ['', false, '', 'ring-mark', '#FFFFFF', '#1E3A5F'], JSON.stringify(L));
  }
  for (const c of ['MS', 'OB', 'MX', 'MO']) {
    const L = look('', c, true);
    assert.deepEqual([L.white, L.badge, L.plate, !!L.open], [false, true, 'grey-wave', c === 'MX'], c + ': ' + JSON.stringify(L));
    assert.doesNotMatch(n(c, '', true), /gl-gc-orb-white|--orb-ring/, c);
  }
  // the darkest paint of each plate is the darkest 5th percentile of its file, and a plate is judged by it
  for (const [name, P] of Object.entries(PLATES)) {
    assert.equal(W._GATE_NOTICE_PLATE_DARK[name], FILES[P.file].dark, name);
    assert.deepEqual([...W._gateNoticePlateAt(name)], P.at.includes(FILES[P.file].dark) ? [...P.at] : [...P.at, FILES[P.file].dark], name + ": its paints, and its darkest where it is not one of them");
    const L = lab(FILES[P.file].dark);
    assert.ok(Math.abs(lum(FILES[P.file].dark) - FILES[P.file].p5) < 0.0015, name + ': ' + lum(FILES[P.file].dark).toFixed(5) + ' against ' + FILES[P.file].p5 + ' (' + L[0].toFixed(1) + ')');
  }
  // THE RULES OF THE WRAP, AS THEY LAND: the gold of PAL under the letters it inks dark, the Flair gate that
  // inks letters dark on a navy disc and takes the white off every mark, the United gate that paints the
  // gradient of the accent of the orb under its mark in its own colours
  assert.deepEqual([look('PB', '3U').plate, look('PB', '3U').hold, look('PB', '3U').why], ['', false, ''], 'letters dark on the gold of PAL, as they always were');
  assert.match(the('_gateChangeOrbHtml')('3U', false, 'PB', false, 'PB'), /<span class="v2-fi-orb-code" style="color:#10151f !important;">3U<\/span>/);
  assert.deepEqual([look('F8', '2T').hold, /^ink:#1C1C1C>#0033A1/.test(look('F8', '2T').why)], [true, true], 'Flair: dark letters on a navy disc, held white');
  assert.deepEqual([look('UA', 'IB').hold, /^ink:#DC1C2E>#DC1C2E/.test(look('UA', 'IB').why)], [true, true], 'United: the red bird of Iberia on its red gradient, held white on its disc');
  assert.deepEqual([look('UA', 'EK').hold, /^ink:/.test(look('UA', 'EK').why)], [true, true]);
  // the whole screen of PAL: the white arrow on its gold is the pair its own gate draws, approved as drawn
  assert.deepEqual([look('', 'PB', true).why, look('', 'SP', true).why], ['', '']);
  // A NOTICE OF ITS OWN CARRIER ON ITS OWN GATE takes the look of the column of that gate: Air France on its
  // gate, the navy of its mark sinking into its navy picture, takes the white disc its rail draws, on the
  // card of the gate as it is, and no plate
  const af = look('AF', 'AF');
  assert.deepEqual([af.column, af.hold, af.plate, af.white, /^sink:/.test(af.why)], [true, true, '', false, true]);
  assert.ok(W._gateOrbParts('AF').white, 'the rail of Air France draws white discs');
  const afHtml = n('AF', 'AF');
  assert.match(afHtml, /^<div class="gl-gc" data-gl-gc=/, 'the card of the gate, no plate');
  assert.match(afHtml, /<span class="gl-gc-orb gl-gc-orb-held"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap" style="[^"]*background:#FFFFFF;[^"]*--gc-disc:#FFFFFF;"/);
  assert.equal(lands((/<span class="gl-gc-orb[\s\S]*?<\/span><\/span>(?:<\/span>)?/.exec(afHtml) || [''])[0], 'AF', 'AF').disc, '#FFFFFF');
  // A DARK PLATE COUNTS ONLY WITH ROOM, WHOEVER CHOSE IT: the navy and dark discs that stood on the dark
  // plate of a gate (Sichuan, Iberia, Air India, Cebu Pacific: the black faint waves) 20 to 23 from its
  // paints, keeping the rule without room, are drawn white on the card of the gate, as the rail draws a
  // column of dark discs
  for (const g of ['3U', 'IB', 'AI', '5J']) {
    const K = W._gateCardPaint(g, true);
    assert.equal(K.kind, 'dark', g + ': a gate of the dark card');
    const dark = PLATES[K.plate].at.concat([FILES[PLATES[K.plate].file].dark]);
    // (the crane of LOT was the second mark: a ring mark now, below)
    for (const c of ['KU', 'MS', 'OB', '8P', 'A3', 'OU']) {
      const L = look(g, c), L0 = W._gateNoticeLands(g, c, false, false, g);
      assert.ok(!broke(L0, K.at), g + ' / ' + c + ': it kept the rule on the paints of the plate');
      assert.ok(!roomOn(L0, dark), g + ' / ' + c + ': ' + L0.disc + ' has no room on the ' + K.plate);
      // a mark (the bird of Kuwait, the crane of LOT) is drawn white; a round badge (the tiles of the
      // others) was drawn inside the ring of that white disc, and fills its orb on the card of the gate now
      const badge = !!W._gateOrbBadge(c);
      assert.deepEqual([L.white, L.badge, L.plate, L.column, /^room:/.test(L.why)], [!badge, badge, '', false, true], g + ' / ' + c + ': ' + JSON.stringify(L));
      if (badge) assert.match(n(c, g), /^<div class="gl-gc" data-gl-gc=[\s\S]*<span class="gl-gc-orb gl-gc-orb-held"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap v2-fi-emblem-native" style="[^"]*padding:0 !important;--gc-disc:transparent;">/, g + ' / ' + c + ': its badge filling its orb, on the card of the gate');
      else assert.match(n(c, g), /^<div class="gl-gc" data-gl-gc=[\s\S]*<span class="gl-gc-orb gl-gc-orb-white gl-gc-orb-held">/, g + ' / ' + c + ': white, on the card of the gate');
    }
  }
  // LOT, a ring mark (window._ORB_RING_MARKS): its white disc meets the card with its navy ring, which has
  // no room on any dark plate. It keeps the rule there, and is drawn on the first plate its ring does not
  // sink into, the grey wave, its ring the edge of its orb and the white of the disc inside it
  for (const g of ['3U', 'IB', 'AI', '5J']) {
    const L = look(g, 'LO');
    assert.deepEqual([L.white, L.badge, L.plate, /^room:/.test(L.why)], [true, false, 'grey-wave', true], g + ' / LO: ' + JSON.stringify(L));
    assert.match(n('LO', g), /^<div class="gl-gc" data-gc-plate="grey-wave"[\s\S]*<span class="gl-gc-orb gl-gc-orb-white gl-gc-orb-held"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap" style="[^"]*background:#FFFFFF;padding:0 !important;/, g + ' / LO');
  }
  // Turkish: its rim judged for the sink, its own red for the brown (#C90019, as TK.svg draws it); on the brown waves of KLM and the
  // brown layers of Cathay it takes the black faint waves
  for (const g of ['KL', 'CX']) {
    assert.deepEqual([look(g, 'TK').plate, look(g, 'TK').white, /^warm:#C90019>/.test(look(g, 'TK').why)], ['black-faint-waves', false, true], g);
    assert.match(n('TK', g), /^<div class="gl-gc" data-gc-plate="black-faint-waves" data-gl-gc=/);
  }
  assert.equal(look('', 'TK', true).plate, '', 'the whole screen of Turkish keeps its card: the rim stands on its red');
  // Iberia on the brown waves of KLM, Emirates on the brown layers of Cathay: the plate of their own gate
  assert.match(n('IB', 'KL'), /^<div class="gl-gc" data-gc-plate="black-faint-waves" data-gl-gc=/);
  assert.match(n('EK', 'CX'), /^<div class="gl-gc" data-gc-plate="black-fine-lines" data-gl-gc=/);
  // EVERY NOTICE OF ITS OWN CARRIER ON ITS OWN GATE (a gate not kept as drawn) wears the look of the column
  // of that gate, whether its own look broke the rule there or not: the disc, the mark, its filter and the
  // ink of the letters the rail draws (window._gateOrbParts with the rule of the card), a finished tile
  // filling the disc as on the rail, the white of the light disc of the ten brands set on white (#FFFFFF,
  // not the #F2F4F7 of the surfaces beside the orbs)
  let ownCols = 0, ownWas = 0;
  for (const g of CODES) {
    if (W._gateColumnKept(g) || !the('_gateChangeOrbHtml')(g)) continue;
    const L = look(g, g), P = W._gateOrbParts(g);
    assert.deepEqual([L.column, L.hold, L.white], [true, true, false], g + ': ' + JSON.stringify(L));
    if (L.plate) continue;
    ownCols++;
    if (L.why === 'column') ownWas++;
    const html = the('_gateChangeOrbHtml')(g, L.white, L.gate, L.hold, L.wrap, L.column);
    const box = (/class="v2-fi-icon-wrap[^"]*" style="([^"]*)"/.exec(html) || [])[1] || '';
    const bg = (s0) => ((/background:([^;]+);/.exec(String(s0)) || [])[1] || '').trim();
    assert.equal(bg(box), bg(P.badge), g + ': the disc of the rail');
    assert.ok(box.includes('--gc-disc:' + bg(P.badge) + ';'), g + ': held against the rules of the gate');
    const img = /<img src="([^"]*)"[^>]*style="([^"]*)"/.exec(html);
    const lt = /<span class="v2-fi-orb-code" style="color:([^;"]+) !important;">([^<]*)<\/span>/.exec(html);
    if (P.path && fs.existsSync(path.join(FC, String(P.path).split('?')[0]))) {
      assert.ok(img, g + ': a mark');
      assert.equal(img[1], P.path, g + ': the mark of the rail');
      const f = (s0) => ((/(?:^|;)filter:([^;]+);/.exec(String(s0)) || [])[1] || 'none');
      assert.equal(f(img[2]), f(P.imgStyle), g + ': the filter of the rail');
      if (P.native && !P.inset) assert.match(box, /padding:0 !important;/, g + ': the tile fills the disc, as on the rail');
    } else if (P.path) {
      // a file the folder does not hold: what the handler of a missing file draws in its place, as on the
      // rail (window._railOrbFailed: the letters of the row in the ink of the glyphs of the column)
      assert.ok(img || lt, g + ': the tile or the letters the handler draws');
      if (lt) assert.equal(lt[1].toUpperCase(), W._gateNoticeHex(W._gateColumnLook(g).ink), g + ': the ink the rail letters it in');
    } else {
      assert.ok(lt, g + ': letters');
      assert.equal(lt[1], (P.white && P.ink) || W._orbInkOn(P.ground), g + ': the ink of the letters of the rail');
    }
  }
  assert.ok(ownCols >= 200 && ownWas >= 80, ownCols + ' own gates wear their column, ' + ownWas + ' of them broke nothing before');
  for (const g of ['IB', 'AH', 'AT', 'AV', 'CX', 'EK', 'KQ', 'SN', 'SV', 'TP', 'VA', 'VN', 'WY', 'CM', 'BA', '2L', '4Y', 'CJ', 'ET', 'HA', 'LY', 'PR', 'WN'].filter((x) => CODES.includes(x) && !W._gateColumnKept(x))) {
    assert.ok(look(g, g).column, g);
  }
  assert.match(n('BA', 'BA'), /background:#FFFFFF;[^"]*--gc-disc:#FFFFFF;/, 'British Airways on its own gate: the white of its rail');
  assert.match(n('IB', 'IB'), /<img src="\/logos\/airline-tiles\/IBE\.svg"/, 'Iberia on its own gate: the tile of its rail');
  // its own carrier on a kept gate never changes: United, Porter, Ryanair, Air Canada
  for (const c of ['UA', 'PD', 'FR', 'AC', 'DL', 'AA']) {
    assert.ok(W._gateColumnKept(c), c);
    assert.deepEqual({ ...look(c, c) }, { plate: '', white: false, hold: false, column: false, badge: false, gate: c, wrap: c, why: '' }, c);
    assert.doesNotMatch(n(c, c), /data-gc-plate|gl-gc-orb-held|gl-gc-orb-white|--gc-/, c);
  }
  // KLM on its own gate: its tile stands clear of the brown waves, as it always was
  assert.match(n('KL', 'KL'), /^<div class="gl-gc" data-gl-gc=/);
  // the white bird of Iberia on the white disc an American gate gave it: the orb holds its red disc, on
  // the card of the gate
  assert.deepEqual([look('AA', 'IB').plate, look('AA', 'IB').white, look('AA', 'IB').hold], ['', false, true]);
  assert.match(n('IB', 'AA'), /^<div class="gl-gc" data-gl-gc="[^"]*" style="--airline-accent:#DC1C2E;[\s\S]*<span class="gl-gc-orb gl-gc-orb-held"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap" style="[^"]*background:(var\(--airline-accent,#[0-9A-F]{6}\));[^"]*--gc-disc:\1;"/);
  // the whole screen keeps the card of its carrier where its orb stands on it (China, a grey tile on its
  // red), and takes a plate where it sinks (Iberia, red on red)
  assert.equal(look('', 'CA', true).plate, '');
  assert.equal(look('', 'IB', true).plate, 'black-faint-waves');
  assert.match(look('', 'IB', true).why, /^sink:#DC1C2E>/);
  // the builder of the gate hands the notice the code of the gate, and the whole screen says it is one
  assert.match(CORE, /_gateChangeNoticeHtml\(_gl, vars\.airlineCode\)/);
  assert.match(CORE, /_gateChangeNoticeHtml\(m, '', true\)/);
  // the stylesheet: the plate the notice names is drawn on its card alone, over the rules of the carrier
  // of the gate; a held orb keeps its disc and the filter of its mark against them, and only a held orb
  const NOT = '(?::not\\(#_\\)){255}(?::not\\(\\._\\)){6}';
  assert.match(CSS, new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc\\[data-gc-plate\\] \\.gl-gc-row::before \\{\\n  background-color: var\\(--plate-base, #0b0e14\\) !important;\\n  background-image: var\\(--plate-tex\\) !important;'));
  assert.match(CSS, new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc \\.gl-gc-orb\\.gl-gc-orb-held > \\.v2-fi-emblem-wrap \\{ background: var\\(--gc-disc, transparent\\) !important; \\}'));
  assert.match(CSS, new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc \\.gl-gc-orb\\.gl-gc-orb-held \\.v2-fi-emblem-img \\{ filter: var\\(--gc-filter, none\\) !important; \\}'));
  assert.doesNotMatch(CSS, /\.gl-gc \.gl-gc-orb > \.v2-fi-emblem-wrap \{ background: var\(--gc-disc/, 'no orb that is not held takes the disc variable');
  // ART THAT IS ITS OWN DISC FILLS ITS ORB (no circle inside a circle, decision of 15 November 2026): the
  // markup takes the padding of the notice away, inline and held, not a rule of the stylesheet, so the
  // notice of its own carrier on a gate left as drawn keeps the padding it always had (Turkish on its gate)
  assert.doesNotMatch(CSS, /\.gl-gc \.gl-gc-orb > \.v2-fi-emblem-native \{ padding: 0 !important; \}/, 'no rule of the stylesheet takes it away');
  assert.ok(badgeFill(n('TK', 'IB')) && badgeFill(n('TK', '', true)) && badgeFill(n('PC', 'AF')), 'Turkish on an Iberia gate and as the whole screen, Pegasus on an Air France gate: the roundel fills its orb');
  assert.match(n('TK', 'TK'), /<span class="gl-gc-orb"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap v2-fi-emblem-native" style="[^"]*background:transparent;padding:0;">/, 'Turkish on its own gate, left as drawn: as it always was');
  assert.ok(['AS', 'TK'].every((c) => W._ORB_ART_RIMMED[c]));
  // THE LETTERS OF THE ORB OF THE NOTICE (about 65 carriers drawn as letters) sit inside the padding of
  // the orb at its normal size: half its content box. They took the size of the flight beside them (110 px
  // in an orb of 115.5), ran out of the orb and the row, and the fit of the notice went to its floor (0.45).
  // The widest pair, measured in Chrome in the face of the notice (Cabinet Grotesk Extrabold, -0.03 em):
  // WW at 1.82 em, so 0.91 of the content box; 4B 1.33 em.
  const orbRule = new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc \\.gl-gc-orb > \\* \\{\\n  width: calc\\((min\\([^)]*\\)) \\* var\\(--gl-gk\\)\\) !important;[^}]*padding: calc\\((min\\([^)]*\\)) \\* var\\(--gl-gk\\)\\) !important;\\n\\}').exec(CSS);
  assert.ok(orbRule, 'the size and the padding of the orb of the notice');
  const lettersRule = new RegExp('html body' + NOT + ' \\.g8-wrap \\.gl-gc \\.gl-gc-orb \\.v2-fi-orb-code \\{\\n  font-size: calc\\(\\((min\\([^)]*\\)) - 2 \\* (min\\([^)]*\\))\\) \\* var\\(--gl-gk\\) \\* ([\\d.]+)\\) !important;').exec(CSS);
  assert.ok(lettersRule, 'the letters of the orb take a size of their own');
  assert.deepEqual([lettersRule[1], lettersRule[2]], [orbRule[1], orbRule[2]], 'the content box of the orb: its size less its padding on each side');
  assert.ok(1.82 * +lettersRule[3] < 1, 'two characters within the content box');
  assert.ok(CSS.indexOf(lettersRule[0]) > CSS.indexOf(orbRule[0]) && CSS.indexOf(lettersRule[0]) < CSS.length - 2000, 'beside the rule of the orb, not at the end of the sheet');
});
