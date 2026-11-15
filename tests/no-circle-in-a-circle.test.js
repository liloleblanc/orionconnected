'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// NO CIRCLE INSIDE A CIRCLE
//
// Decision of 15 November 2026: no round badge is drawn inside a disc of
// another colour. A round badge (a finished tile the orb crops into a circle, a symbol that is a disc,
// the rimmed roundels of Turkish and Alaska) was drawn inside a disc of another
// colour: the white disc of a column, of the Your Aircraft orb and of the gate
// change notice carried it as a round picture inside a wide white ring (the
// navy tile of EgyptAir inside the white orb of its notice), and the notice
// set the roundel of Turkish inside its padding, in the gloss and the shadow of
// a box larger than the roundel, or in the red ring the Delta gate paints.
//
// A round badge fills its orb now, edge to edge: no padding, no disc behind it,
// no ring, no white disc. The card or the plate behind the orb gives the
// contrast (window._gateOrbBadge, beside the white disc in fids-core.js). This
// walks every carrier the name tables know on every surface that draws its orb
// (the gate change notice on every card a gate can show and as the whole screen,
// the top orb of the rail, the boarding shelf, the Your Aircraft orb of its own
// gate and of every operator on every gate) and fails on any ring, and on any
// white disc drawn behind a round badge.
//
// What a round badge is, is measured from the files: the art paints its own
// disc where the circle the orb crops it to is painted all round, at every
// radius from 80 to 98 hundredths (scripts/orbs/tile-grounds.js reads the
// shapes of each svg); the red line art of Paranair and the ring of LOT are
// marks on a clear ground, which the disc behind them shows through.
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
const CSS = fs.readFileSync(path.join(FC, 'css/display-overrides.css'), 'utf8');
const GEN = require(path.join(ROOT, 'scripts/orbs/tile-grounds.js'));
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
const W = board();
const the = (n) => W.__the(n);
const CODES = [...new Set([...Object.keys(the('AIRLINE_NAME')), ...Object.keys(the('_AIRLINE_NAME_OVERRIDE'))])].sort();
const fold = (c) => the('_orbEmblemCarrier')(c);
const kept = (g) => W._gateColumnKept(g);

// ── THE ART THAT IS A DISC BY ITSELF, MEASURED FROM ITS FILE ─────────────────
// An svg of a square box: the circle the orb crops it to is painted all round at 80, 86, 92 and 98
// hundredths of its radius (nine samples in ten at each), as the reader of the shapes of the file finds
// it. Where that reader cannot follow the drawing (a shape moved by a transform, a gloss), the colour
// read round its rim in Chrome stands for it: the ground the script of the tile grounds read off the
// file (window._ORB_TILE_GROUNDS), or the ground of the table of art read off the file in Chrome
// (window._ORB_ART_GROUNDS; a line there is art on a clear ground, no disc). A bitmap in the tile
// folder, or a glossy orb, is a finished roundel by construction.
const DISC = new Map();
function discOf(src) {
  const k = String(src || '').split('?')[0];
  if (!k) return { disc: false, share: 0 };
  if (DISC.has(k)) return DISC.get(k);
  const f = path.join(FC, k);
  let out = { disc: false, share: 0 };
  if (fs.existsSync(f) && /\.png$/i.test(k)) out = { disc: /\/airline-tiles\/|glossy/.test(k), share: 1 };
  else if (fs.existsSync(f) && /\.svg$/i.test(k)) {
    const m = GEN.build(fs.readFileSync(f, 'utf8'));
    let share = 0, square = false;
    if (m.vb.length === 4 && m.vb[2] > 0 && m.vb[3] > 0) {
      const [vx, vy, vw, vh] = m.vb, cx = vx + vw / 2, cy = vy + vh / 2, R = Math.min(vw, vh) / 2;
      square = Math.abs(vw - vh) < 0.02 * vw;
      share = Math.min(...[0.8, 0.86, 0.92, 0.98].map((rf) => {
        let n = 0, p = 0;
        for (let a = 0; a < 360; a += 3) { n++; if (GEN.colourAt(m, cx + Math.cos(a * Math.PI / 180) * R * rf, cy + Math.sin(a * Math.PI / 180) * R * rf)) p++; }
        return p / n;
      }));
    }
    const tile = (/\/airline-tiles\/([^/?]+)\.svg$/.exec(k) || [])[1] || '';
    const A = W._ORB_ART_GROUNDS[k] || {};
    out = { disc: (share >= 0.9 && square) || /-glossy\.svg$/.test(k) || !!(tile && W._ORB_TILE_GROUNDS[tile]) || !!A.ground, share };
  }
  DISC.set(k, out);
  return out;
}
const isDisc = (src) => discOf(src).disc;

// ── reading the markup an orb writes ────────────────────────────────────────
const wrapOf = (html) => {
  const m = /<(?:span|div) class="(v2-fi-icon-wrap[^"]*)" style="([^"]*)">/.exec(html) || ['', '', ''];
  const img = /<img\b[^>]*\bsrc="([^"]*)"[^>]*\bstyle="([^"]*)"/.exec(html) || /<img\b[^>]*\bstyle="([^"]*)"[^>]*\bsrc="([^"]*)"/.exec(html);
  const src = img ? (/\bsrc="([^"]*)"/.exec(img[0]) || [])[1] : '';
  const imgStyle = img ? (/\bstyle="([^"]*)"/.exec(img[0]) || [])[1] : '';
  const prop = (st, k) => ((new RegExp('(?:^|;)\\s*' + k.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]*)').exec(st) || [])[1] || '').trim();
  return { cls: m[1], style: m[2], src: src || '', imgStyle: imgStyle || '', bg: prop(m[2], 'background'), pad: prop(m[2], 'padding'), ring: /--orb-ring/.test(m[2]) };
};
// A RING: a round badge set inside a box larger than itself, the box painting a disc of its own colour
// round it or padding it in the gloss and the shadow of the box. The badge fills its orb where the box
// writes no ring and no padding (an inline padding of 0, which beats the padding of the stylesheet where
// it is marked important, or a class the stylesheet takes the padding away for), and draws the picture
// cropped into the circle of the box.
function ringOf(o, padGone) {
  if (o.ring) return 'a white ring (--orb-ring) round ' + o.src;
  if (!padGone) return 'the padding of the box round ' + o.src + ' (' + (o.pad || 'the stylesheet') + ')';
  if (!/object-fit:\s*cover/.test(o.imgStyle) || !/border-radius:\s*50%/.test(o.imgStyle)) return o.src + ' is not cropped into the circle of its box: ' + o.imgStyle;
  return '';
}
const WHITE = /^#f{3}(f{3})?$/i;

test('what is a round badge: measured from the file, and the board says the same', () => {
  // by name: the tiles of EgyptAir, SAS, Kuwait and Iberia, the roundels of Turkish, Alaska and Pegasus,
  // the dot of Flair and the disc of Transavia paint their own disc; the line art of Paranair and of Copa,
  // the ring of LOT, the crane of JAL and the bird of Kuwait do not
  for (const f of ['airline-tiles/MSR.svg', 'airline-tiles/SAS.svg', 'airline-tiles/KAC.svg', 'airline-tiles/IBE.svg', 'symbols/airlines/TK.svg', 'airline-tiles/ASA-orb-glossy.svg',
    'symbols/airlines/PC.svg', 'airlines/canadian/flair-dot.svg', 'symbols/airlines/HV.svg', 'airline-tiles/UA-globe-glossy.png']) assert.ok(isDisc('/logos/' + f), f + ': ' + discOf('/logos/' + f).share.toFixed(2));
  for (const f of ['symbols/airlines/ZP.svg', 'symbols/airlines/CM.svg', 'symbols/airlines/LO.svg', 'symbols/airlines/JL.svg', 'symbols/airlines/KU.svg', 'symbols/airlines/LY.svg', 'airline-tiles/PB-arrow.svg'])
    assert.ok(!isDisc('/logos/' + f), f + ': ' + discOf('/logos/' + f).share.toFixed(2));
  // the board tells a round badge by the art its white disc would set inside its ring: every such art
  // is a disc by its file, and every carrier whose white disc would set a disc inside its ring is named
  let badges = 0;
  for (const c of CODES) {
    const N = W._gateOrbNatural(c), Wd = W._gateOrbWhite(c, N, '#000000'), b = W._gateOrbBadge(c);
    if (b) { badges++; assert.ok(isDisc(b) && Wd.inset && Wd.path === b, c + ': ' + b + ' is a disc by its file'); }
    else if (Wd.inset && Wd.path) assert.ok(!isDisc(Wd.path), c + ': ' + Wd.path + ' is a disc, and its white disc would ring it');
  }
  assert.ok(badges >= 120, badges + ' carriers whose orb can be a round badge');
});

test('the gate change notice, on every card and as the whole screen: a round badge fills its orb, and is never drawn white', () => {
  const m = (al) => ({ ap: 'YUL', full: { f: { flight: al + '101', airline: al, dest: 'Madrid', _locIata: 'MAD', time: '18:40', _sortTs: Date.now() + 3600000 }, to: '12' } });
  // one gate for each distinct card and rule of the gates, and every gate of its own carrier
  const cards = new Map();
  for (const g of CODES.concat([''])) {
    const K = W._gateCardPaint(g, true), sig = K.kind + ':' + K.at.join(',') + '|' + JSON.stringify(W._gateNoticeOrbRule(g) || {});
    if (!cards.has(sig)) cards.set(sig, g);
  }
  const rings = [], whites = [], keptOwn = new Set();
  let badges = 0, pairs = 0;
  const walk = (gate, code, solo) => {
    const notice = the('_gateChangeNoticeHtml')(m(code), gate, solo);
    const html = (/<span class="gl-gc-orb[\s\S]*?<\/span><\/span>(?:<\/span>)?/.exec(notice) || [''])[0];
    if (!html) return;
    pairs++;
    const o = wrapOf(html), L = W._gateNoticeLook(gate, code, solo);
    const tag = (solo ? '(whole screen)' : gate) + ' / ' + code;
    // NO WHITE DISC BEHIND A ROUND BADGE: the white orb of the notice is never the white disc of a carrier
    // whose white disc would set its badge inside the ring
    if (/gl-gc-orb-white/.test(html) && W._gateOrbBadge(code)) whites.push(tag + ': ' + o.src);
    if (L.white && W._gateOrbBadge(code)) whites.push(tag + ': the look says white');
    if (!o.src || !isDisc(o.src)) return;
    badges++;
    // the notice of its own carrier on a gate left as drawn is written as it always was (counted, below)
    if (!solo && kept(gate) && fold(gate) === fold(code)) { keptOwn.add(fold(code)); return; }
    // the stylesheet pads the orb of the notice: only an inline padding of 0 marked important takes it away
    const why = ringOf(o, /^0\s*!important$/.test(o.pad));
    if (why) rings.push(tag + ': ' + why);
    // and where the box paints a disc of its own the badge covers it: no disc behind a badge it does not cover
    else if (o.bg && !/^transparent$/.test(o.bg) && !/padding:0 !important/.test(o.style)) rings.push(tag + ': a ' + o.bg + ' disc behind ' + o.src);
  };
  for (const gate of cards.values()) for (const code of CODES) walk(gate, code, false);
  for (const g of CODES) walk(g, g, false);
  for (const code of CODES) walk('', code, true);
  assert.deepEqual(rings, [], rings.length + ' round badges in a ring:\n' + rings.slice(0, 20).join('\n'));
  assert.deepEqual(whites, [], whites.length + ' round badges drawn white:\n' + whites.slice(0, 20).join('\n'));
  assert.ok(pairs >= 15000 && badges >= 5000, pairs + ' notices, ' + badges + ' of them a round badge');
  // LEFT AS DRAWN: the notice of its own carrier on its own gate, where that gate is approved as drawn,
  // keeps the look it always had (the roundel of Turkish inside the padding on the Turkish gate, the
  // sphere of Delta in the red ring the Delta gate paints): the gates approved as drawn stay exactly as
  // they are. Named here, by the carrier the gate wears.
  assert.deepEqual([...keptOwn].sort(), ['4N', '5T', 'AS', 'DL', 'F8', 'LX', 'MU', 'NZ', 'TK', 'UA', 'YN']);
  // by name: EgyptAir and Kuwait as the whole screen (Kuwait carries its bird on its white disc, a mark,
  // and stays white), the tile of SAS on the blue of American, Turkish on an Iberia gate
  assert.match(the('_gateChangeNoticeHtml')(m('MS'), '', true), /<span class="gl-gc-orb gl-gc-orb-held"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap v2-fi-emblem-native" style="[^"]*background:transparent;padding:0 !important;--gc-disc:transparent;"><img src="\/logos\/airline-tiles\/MSR\.svg"/);
  assert.match(the('_gateChangeNoticeHtml')(m('KU'), '', true), /<span class="gl-gc-orb gl-gc-orb-white gl-gc-orb-held">[\s\S]*<img src="\/logos\/symbols\/airlines\/KU\.svg"[^>]*style="width:100%;height:100%;object-fit:contain;/);
  assert.match(the('_gateChangeNoticeHtml')(m('SK'), 'AA'), /data-gc-plate="grey-wave"[\s\S]*v2-fi-emblem-native" style="[^"]*padding:0 !important;--gc-disc:transparent;"><img src="\/logos\/airline-tiles\/SAS\.svg"/);
  assert.match(the('_gateChangeNoticeHtml')(m('TK'), 'IB'), /v2-fi-emblem-native" style="[^"]*padding:0 !important;--gc-disc:transparent;"><img src="\/logos\/symbols\/airlines\/TK\.svg"/);
  // the held box is painted by no rule of the gate: its disc is the variable it writes, clear
  assert.match(CSS, /\.g8-wrap \.gl-gc \.gl-gc-orb\.gl-gc-orb-held > \.v2-fi-emblem-wrap \{ background: var\(--gc-disc, transparent\) !important; \}/);
});

test('the top orb of the rail, the boarding shelf and the Your Aircraft orb of its own gate: a round badge fills its orb', () => {
  let n = 0;
  const rings = [];
  for (const code of CODES) {
    const P = W._gateOrbParts(code);
    if (!P.path || !isDisc(P.path)) continue;
    n++;
    // the recipe the rail and the shelf both write (tests/gate-orbs-every-airline.test.js holds the shelf to it)
    const rail = wrapOf('<div class="v2-fi-icon-wrap v2-fi-emblem-wrap' + (P.nativeCls || '') + '" style="' + P.badge + '"><img src="' + P.path + '" style="' + P.imgStyle + '"></div>');
    const why = ringOf(rail, rail.pad === '0' && /v2-fi-emblem-native/.test(rail.cls));
    if (why) rings.push(code + ', the rail: ' + why);
    if (P.white) rings.push(code + ', the rail: a white disc behind ' + P.path);
    // the Your Aircraft orb, on its own leg
    const ya = W._gateCardOrb(code, '');
    if (ya.src && isDisc(ya.src)) {
      const o = wrapOf(ya.html);
      const w2 = ringOf(o, /v2-fi-orbwrap-native/.test(o.cls) && o.pad === '0');
      if (w2) rings.push(code + ', the Your Aircraft orb: ' + w2);
      if (ya.white || ya.inset) rings.push(code + ', the Your Aircraft orb: a white disc behind ' + ya.src);
    }
  }
  assert.deepEqual(rings, [], rings.join('\n'));
  assert.ok(n >= 130, n + ' gates whose top orb is a round badge');
  // the stylesheet takes the padding of the box away under the marker class, on the rail, the shelf and the
  // Your Aircraft orb, and crops the picture of a marked box with cover
  const flat = CSS.replace(/:not\((?:#_|\._)\)/g, '');
  assert.match(flat, /\.v2-rc-shelf-fi \.v2-fi-orbwrap\.v2-fi-orbwrap-native \{\s*padding: 0 !important;/);
  assert.match(fs.readFileSync(path.join(FC, 'css/gate-display.css'), 'utf8'), /\.v2-fi-emblem-wrap\.v2-fi-emblem-native \.v2-fi-emblem-img \{\s*object-fit: cover !important;/);
  // the shelf writes the recipe of the rail, its class and its picture
  assert.match(CORE, /<div class="v2-fi-iconcol"><div class="v2-fi-icon-wrap v2-fi-emblem-wrap' \+ _birParts\.nativeCls \+ '" style="' \+ _birParts\.badge \+/);
  // by name: the columns that were white with their tile inside the ring fill their orb on the dark plate
  for (const code of ['MS', 'SK', 'AY', 'B6', 'MX', 'OO']) {
    const P = W._gateOrbParts(code);
    assert.deepEqual([!!P.white, P.native, /padding:0;/.test(P.badge), W._gateCardPaint(code).kind], [false, true, true, 'dark'], code);
  }
});

test('the Your Aircraft orb of every operator on every gate: a round badge fills its orb, and the panel under it gives the contrast', () => {
  const rings = [], panels = [];
  let n = 0;
  for (const gate of CODES) {
    for (const op of CODES) {
      if (fold(op) === fold(gate)) continue;
      const r = W._gateCardOrb(gate, op);
      if (r.panel && !r.badgeFill) panels.push(gate + '/' + op + ': a panel of its own under an orb that is no round badge');
      if (!r.src || !isDisc(r.src)) continue;
      n++;
      const o = wrapOf(r.html);
      const why = ringOf(o, /v2-fi-orbwrap-native/.test(o.cls) && o.pad === '0');
      if (why) rings.push(gate + '/' + op + ': ' + why);
      if (r.white || r.inset || (WHITE.test(o.bg) && o.pad !== '0')) rings.push(gate + '/' + op + ': a white disc behind ' + r.src);
      // the panel it asks for is a flat of the panel, never the white of a disc
      if (r.panel) assert.ok(/^#[0-9A-F]{6}$/.test(r.panel) && !WHITE.test(r.panel), gate + '/' + op + ': ' + r.panel);
    }
  }
  assert.deepEqual(rings, [], rings.length + ' round badges in a ring:\n' + rings.slice(0, 20).join('\n'));
  assert.deepEqual(panels, [], panels.slice(0, 10).join('\n'));
  assert.ok(n >= 25000, n + ' orbs of an operator that are a round badge');
  // the gate writes the panel of the card on its column, where the panel and the ink of its words read it
  assert.match(CORE, /_yaPanel = _mcOrb\.panel \|\| '';/);
  assert.match(CORE, /_yaPanel = _niOrb\.panel \|\| '';/);
  assert.match(CORE, /_yaPanel = _opCardOrb\.panel \|\| '';/);
  assert.match(CORE, /flex:0 0 25%;min-width:0;' \+ \(_yaPanel \? '--rc2-b-orb:' \+ _yaPanel \+ ';' : ''\) \+ '">'/);
  // by name: Porter and SAS on the default panel of an Iberia gate, EgyptAir on a KLM gate
  for (const [gate, op] of [['IB', 'PD'], ['IB', 'SK'], ['KL', 'MS']]) {
    const r = W._gateCardOrb(gate, op), o = wrapOf(r.html);
    assert.deepEqual([r.white, r.inset, /v2-fi-orbwrap-native/.test(o.cls), o.pad, o.bg], [false, false, true, '0', 'transparent'], gate + '/' + op);
  }
});
