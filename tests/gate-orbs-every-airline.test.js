'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE ORBS OF A GATE, FOR EVERY AIRLINE THE BOARDS CAN NAME
//
// The gate shows round orbs: the emblem orb at the top of the left rail, five
// glyph badges under it (the destination code rides in one of them), and the
// Your Aircraft orb at the bottom right. The standing rules:
//   1. every orb of a gate is one colour, and the colour of the top orb is
//      the one the others take;
//   2. an emblem is never inked white, unless the art is itself a mark of one
//      colour drawn to sit white on the colour of the brand;
//   3. white outside with the emblem in its colours inside is an approved
//      pattern (the whole column then white or light, glyphs and code in the
//      colour of the brand);
//   4. the colours are the airline's own;
//   5. the glyphs and the destination code read on their disc.
//
// An audit of every airline found 112 gates that broke one of them: 75 codes
// drew a generic white plane in the top orb while a finished tile sat on
// disk, 27 emblems were inked white, 18 columns were two colours, and the
// rest had no colour of their own or an ink that could not be read. The
// cause was one: the ground and the ink of the badges were chains of
// conditions naming one carrier each, and the ink of the code was a
// stylesheet rule per carrier, so every carrier nobody had named was wrong.
//
// Now one function answers for a whole column (window._gateColumnLook): the
// art of the top orb, the ground it shows, the same ground on the five
// badges, and an ink that reads on it. A carrier with no emblem takes its
// finished tile, whose ground a script reads from the file
// (scripts/orbs/tile-grounds.js). This file runs those functions, cut from
// fids-core.js, for every code in the name tables and reads the art on disk.
// A carrier that cannot pass without new art is in ONE ledger below, by code,
// with the reason; the ledger fails when a carrier in it starts to pass.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FC = path.join(ROOT, 'fids-current');
const CORE = fs.readFileSync(path.join(FC, 'js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(FC, 'css/display-overrides.css'), 'utf8');
const GATE_CSS = fs.readFileSync(path.join(FC, 'css/gate-display.css'), 'utf8');
const COLORS = fs.readFileSync(path.join(FC, 'data/airline-colors.js'), 'utf8');
const GEN = require(path.join(ROOT, 'scripts/orbs/tile-grounds.js'));

// ── the real functions and tables, cut from fids-core.js ───────────────────
// From a marker to the brace that closes it, stepping over comments, strings
// and regular expressions.
function block(marker) {
  const at = CORE.indexOf(marker);
  assert.ok(at >= 0, 'fids-core.js still has: ' + marker);
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    const c = CORE[i], n = CORE[i + 1];
    if (c === '/' && n === '/') { i = CORE.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = CORE.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (CORE[i] !== q) { if (CORE[i] === '\\') i++; i++; } continue; }
    if (c === '/' && /[=(,:!&|?]\s*$/.test(CORE.slice(Math.max(0, i - 6), i))) {
      i++;
      while (CORE[i] !== '/') {
        if (CORE[i] === '\\') i++;
        else if (CORE[i] === '[') { while (CORE[i] !== ']') { if (CORE[i] === '\\') i++; i++; } }
        i++;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  return CORE.slice(at, CORE[i + 1] === ';' ? i + 2 : i + 1);
}
const W = {};
const O = new Function('window', [
  block('const AIRLINE_BRAND = {'), block('const AIRLINE_ACCENT = {'), block('function getAirlineAccent(code) {'),
  block('const CALLSIGN_TO_IATA = {'), block('const IATA_TO_TILE_ICAO = {'),
  block('const AIRLINE_NAME = {'), block('const _AIRLINE_NAME_OVERRIDE = {'),
  block('window._CARD_COLOR_EMBLEMS = {'), block('window._orbKeepsColour = function'),
  block('window._BADGE_TILE_BRANDS = {'), block('window._ORB_TILE_GROUNDS = {'), block('window._GATE_ORB_LOOKS = {'),
  block('window._orbInkOn = function'), block('window._gateColumnLook = function'), block('window._gateOwnAccent = function'),
  block('window._gateOrbParts = function'),
  block('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {'), block('var GATE_TOP_ROUND_EMBLEM_FILES = {'),
  block('function _orbEmblemCarrier(code) {'), block('function _airlineOrbEmblem(code) {'),
  'return { BRAND: AIRLINE_BRAND, ACCENT: AIRLINE_ACCENT, accent: getAirlineAccent, TILE: IATA_TO_TILE_ICAO,',
  '  NAME: AIRLINE_NAME, NAME2: _AIRLINE_NAME_OVERRIDE, fold: _orbEmblemCarrier, emblem: _airlineOrbEmblem, FILES: AIRLINE_EMBLEM_FILES };'
].join('\n'))(W);
const LOOKS = W._GATE_ORB_LOOKS;
const CODES = [...new Set([...Object.keys(O.NAME), ...Object.keys(O.NAME2)])].sort();

// ── colour arithmetic: WCAG contrast and CIEDE2000 ─────────────────────────
const HEX = /^#[0-9a-f]{6}$/i;
const full = (h) => (/^#[0-9a-f]{3}$/i.test(h) ? '#' + h.slice(1).split('').map((c) => c + c).join('') : h);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(full(h).slice(i, i + 2), 16));
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function lab(h) {
  const [r, g, b] = rgb(h).map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), Y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), Z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function dE(a, b) {
  const [L1, a1, b1] = lab(a), [L2, a2, b2] = lab(b), rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
  const hue = (x, y) => { if (x === 0 && y === 0) return 0; const t = Math.atan2(y, x) / rad; return t < 0 ? t + 360 : t; };
  const h1 = hue(a1p, b1), h2 = hue(a2p, b2);
  let dh = 0;
  if (C1 * C2 !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh * rad / 2), Lb = (L1 + L2) / 2, Cm = (C1 + C2) / 2;
  let hb = h1 + h2;
  if (C1 * C2 !== 0) hb = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad);
  const Rc = 2 * Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7)));
  const Sl = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2)), Sc = 1 + 0.045 * Cm, Sh = 1 + 0.015 * Cm * T;
  const Rt = -Math.sin(2 * 30 * Math.exp(-Math.pow((hb - 275) / 25, 2)) * rad) * Rc;
  return Math.sqrt(Math.pow((L2 - L1) / Sl, 2) + Math.pow((C2 - C1) / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * ((C2 - C1) / Sc) * (dH / Sh));
}

// ── what a file paints ─────────────────────────────────────────────────────
// Its colours, the colour of its rim where the orb crops it, and the colour
// that fills most of the orb. Read with the sampler the generator uses.
const artCache = {};
function art(p) {
  const clean = String(p || '').split('?')[0];
  if (artCache[clean]) return artCache[clean];
  const file = path.join(FC, clean);
  const r = { path: clean, exists: !!clean && fs.existsSync(file) };
  if (r.exists && /\.svg$/i.test(clean)) {
    const m = GEN.build(fs.readFileSync(file, 'utf8'));
    r.colours = [...new Set(m.shapes.map((s) => s.fill))];
    if (m.vb.length === 4) {
      const [vx, vy, vw, vh] = m.vb, cx = vx + vw / 2, cy = vy + vh / 2, R = Math.min(vw, vh) / 2;
      const area = {}, rim = {};
      for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
        const x = vx + (i + 0.5) / 40 * vw, y = vy + (j + 0.5) / 40 * vh;
        if (Math.hypot(x - cx, y - cy) > R * 0.95) continue;
        const c = GEN.colourAt(m, x, y); if (c) area[c] = (area[c] || 0) + 1;
      }
      for (let k = 0; k < 72; k++) {
        const a = k / 72 * 2 * Math.PI, c = GEN.colourAt(m, cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98);
        if (c) rim[c] = (rim[c] || 0) + 1;
      }
      const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      r.main = top(area)[0]; r.rim = top(rim)[0]; r.rimShare = top(rim)[1] / 72;
    }
  }
  return (artCache[clean] = r);
}

// ── the facts of one gate column ───────────────────────────────────────────
function column(code) {
  const L = W._gateColumnLook(code), P = W._gateOrbParts(code), A = art(L.art);
  const accent = O.accent(L.carrier);
  // the ground the top orb shows, and who says so
  let top, from;
  if (L.css) { top = L.ground; from = 'stylesheet'; }
  else if (P.ground) { top = P.ground; from = 'table'; }
  else if (P.native && A.exists && A.main) { top = A.main; from = 'art'; }
  else { top = accent; from = 'accent'; }
  return { code, L, P, A, accent, top, from };
}

// Every rule a column can break. Empty means the gate obeys them all.
function broken(code) {
  const { L, A, accent, top, from } = column(code), out = [];
  if (!L.art) out.push('no orb art: a generic white plane');
  else if (!A.exists) out.push('the orb art is not on disk: ' + L.art);
  if (!HEX.test(top) || !HEX.test(L.ground)) out.push('a ground that is no colour: ' + top + ' / ' + L.ground);
  else {
    if (dE(top, L.ground) >= 6) out.push('two colours: the top orb ' + top + ', the badges ' + L.ground + ' (dE ' + dE(top, L.ground).toFixed(1) + ')');
    if (from === 'table' && top !== L.ground) out.push('the top orb and the badges are not one string: ' + top + ' / ' + L.ground);
    for (const [what, ink] of [['glyphs', L.inkSeen], ['code', L.codeSeen]]) {
      if (contrast(ink, L.ground) < 3) out.push('the ' + what + ' ' + ink + ' on ' + L.ground + ' read at ' + contrast(ink, L.ground).toFixed(2) + ' to 1');
    }
  }
  if (L.whitened && A.exists) {
    const inks = (A.colours || []).filter((c) => !/^#F[C-F]F[C-F]F[C-F]$/i.test(c));
    if (!A.colours) out.push('a raster emblem inked white');
    else if (inks.length > 1) out.push('an emblem of ' + inks.length + ' colours inked white: ' + inks.join(' '));
  }
  if (A.exists && accent.toUpperCase() === '#0033A1') out.push('no colour of its own: the fallback blue beside its art');
  return out;
}

// ── THE LEDGER ─────────────────────────────────────────────────────────────
// Every carrier whose gate does not obey the rules, by code, with the reason.
// Nothing is skipped: a code here must still break a rule, so the day its art
// arrives this test fails until the code leaves the ledger.
const REGIONAL = 'a regional that flies in the livery of a mainline and has no emblem of its own (Republic, GoJet, Air Wisconsin, CommuteAir, Compass): as an operator its orb is left to the gate carrier; a gate under its own code would draw the generic plane';
const NO_ART = 'no emblem, tile or symbol on disk under this code (where MANIFEST.csv labels a tile for it, the label is unchecked): the top orb is the generic plane until art is supplied';
const LEDGER = {
  '8P': 'PCO.svg is a tile of two grounds, orange and navy halves: no ground the badges could take. It needs one drawing on a full navy ground.',
  'LL': 'level-emblem.svg is half cyan and half green: no single ground. It needs a mark on one ground from the airline.',
  'ZP': 'ZP.svg is half clear and Paranair has no colour on file: it needs its red confirmed and a mark on a finished ground.',
  'YX': REGIONAL, 'G7': REGIONAL, 'ZW': REGIONAL, 'C5': REGIONAL, 'CP': REGIONAL,
  'VB': 'VivaAerobus has an emblem on disk (a .webp, which this test cannot read) but no colour confirmed from the airline: nothing points its orb at the emblem until its green is known.',
  // Approved as drawn, and not to be changed: a white mark and white glyphs on the blue of the
  // brand, under the 3 to 1 floor (Transat 2.41, WestJet 2.64).
  'TS': 'approved as drawn the day before this audit: the white star and white glyphs on Transat blue',
  'WS': 'the sanctioned white leaf and white glyphs on WestJet teal (WestJet Encore, WR, wears the same)'
};
for (const c of ('2T 3K 4B 4T 5F 7F 8M 8T 9C 9K AN AX BG BI BJ BM BY DO EM EV FD GM H2 H4 IV JA KA KG KM KO LF LR MT N0 NF NK NO OK '
  + 'P4 PA PJ QS RP S5 SM TB W3 W8 WG WL XC XN XR Z0 ZG ZH').split(' ')) LEDGER[c] = NO_ART;

test('every carrier the name tables know: one colour down the column, an ink that reads, no emblem inked white', () => {
  assert.ok(CODES.length >= 227, CODES.length + ' codes in the name tables');
  const wrong = [], stale = [];
  for (const code of CODES) {
    const b = broken(code);
    if (LEDGER[code]) { if (!b.length) stale.push(code + ' now obeys every rule: take it out of the ledger'); continue; }
    if (b.length) wrong.push(code + ' (' + (O.NAME2[code] || O.NAME[code]) + '): ' + b.join('; '));
  }
  assert.deepEqual(wrong, [], wrong.length + ' gates break a rule:\n' + wrong.join('\n'));
  assert.deepEqual(stale, [], stale.join('\n'));
  for (const code of Object.keys(LEDGER)) assert.ok(CODES.includes(code), code + ' in the ledger is a code the name tables know');
});

test('the ledger says why, and its kinds are what they claim', () => {
  for (const [code, why] of Object.entries(LEDGER)) assert.ok(why.length > 40, code + ' has a reason');
  // no art: the only rule broken is the missing art
  for (const [code, why] of Object.entries(LEDGER)) {
    if (why !== NO_ART) continue;
    assert.deepEqual(broken(code).map((s) => s.split(':')[0]), ['the orb art is not on disk'], code);
  }
  // approved as drawn: the only rule broken is the 3 to 1 floor, and white is still above 2.4
  for (const code of ['TS', 'WS']) {
    const b = broken(code), L = W._gateColumnLook(code);
    assert.ok(b.length === 2 && b.every((s) => / read at /.test(s)), code + ': ' + b.join('; '));
    assert.ok(contrast('#FFFFFF', L.ground) >= 2.4, code);
  }
});

// ── the table the script writes ────────────────────────────────────────────
test('the table of tile grounds is what the tiles on disk give', () => {
  const blk = GEN.readBlock(CORE);
  assert.ok(blk, 'the markers the script writes between');
  assert.equal(blk.text, GEN.render(GEN.tileGrounds()), 'run: node scripts/orbs/tile-grounds.js');
  const T = W._ORB_TILE_GROUNDS;
  assert.ok(Object.keys(T).length > 250, Object.keys(T).length + ' tiles with a rim of one colour');
  for (const [name, g] of Object.entries(T)) assert.match(g, /^#[0-9A-F]{6}$/, name);
  // a split ground, a clear surround and a rim the mark crosses are left out
  for (const name of ['PCO', 'ASL', 'AUA', 'QTR', 'CMP', 'PB-arrow', 'TSC-star-white']) assert.equal(T[name], undefined, name);
  assert.ok(CORE.indexOf('window._ORB_TILE_GROUNDS = {') < CORE.indexOf('window._gateOrbParts = function (code) {'), 'made before the recipe that reads it');
});

test('a carrier with no emblem and a finished tile draws the tile in both orbs, and its badges take the ground of the tile', () => {
  let n = 0;
  for (const code of CODES) {
    const { L, P } = column(code);
    const m = /^\/logos\/airline-tiles\/([^/?]+)\.svg/.exec(L.art || '');
    if (!m || !W._ORB_TILE_GROUNDS[m[1]] || L.css) continue;
    const row = LOOKS[L.carrier] || {};
    if (row.ground) continue;
    n++;
    assert.equal(L.bg, W._ORB_TILE_GROUNDS[m[1]], code + ': the badges are the ground of ' + m[1] + '.svg, the same string');
    assert.equal(P.native, true, code + ': the tile fills the orb');
    assert.doesNotMatch(P.imgStyle, /invert/, code + ': a tile is never inked');
  }
  assert.ok(n >= 90, n + ' carriers wear their finished tile');
  // the ones the audit named: a generic white plane before
  for (const [code, tile] of [['AZ', 'ITY'], ['B6', 'JBU'], ['NH', 'ANA'], ['DY', 'NAX'], ['U2', 'EZY'], ['QF', 'QFA'], ['BT', 'BTI'], ['SK', 'SAS']]) {
    assert.equal(O.emblem(code), '/logos/airline-tiles/' + tile + '.svg', code);
  }
});

// ── the table of looks ─────────────────────────────────────────────────────
// Light grounds whose ink is the neutral dark of the boards (#1B2430): no dark colour of the brand
// is confirmed for these, so none is guessed. A row that gains an ink leaves this list.
const NEUTRAL_INK = ['5J', 'UL', 'XY'];
// The only rows that write white on a ground where white is under 3 to 1: approved as drawn (the ledger).
const APPROVED_WHITE = ['TS', 'WR', 'WS'];

test('every row of the table of looks: art that is on disk, inks that are colours, a hand ground that is the rim of the art', () => {
  const neutral = [];
  for (const [code, row] of Object.entries(LOOKS)) {
    for (const k of Object.keys(row)) assert.ok(['art', 'ground', 'ink', 'code', 'css', 'cssInk', 'cssCode', 'none'].includes(k), code + '.' + k);
    for (const k of ['ground', 'ink', 'code', 'cssInk', 'cssCode']) if (row[k]) assert.match(full(row[k]), HEX, code + '.' + k);
    if (row.art) assert.ok(fs.existsSync(path.join(FC, row.art)), code + ': ' + row.art);
    // a ground written by hand is the colour most of the rim of that art is painted in
    if (row.ground && !row.css && row.art) {
      const A = art(row.art);
      assert.equal(A.rim, row.ground, code + ': the rim of ' + row.art);
      assert.ok(A.rimShare >= 0.6, code + ': ' + A.rimShare.toFixed(2) + ' of the rim');
    }
    // on a light ground the ink is named, and it is never white
    const L = W._gateColumnLook(code);
    if (!row.css && !row.none && HEX.test(L.ground) && contrast('#FFFFFF', L.ground) < 3 && !APPROVED_WHITE.includes(code)) {
      if (!row.ink) { neutral.push(code); assert.equal(L.ink, '#1B2430', code); continue; }
      assert.doesNotMatch(row.ink, /^#f{3}(f{3})?$/i, code + ': a dark ink on ' + L.ground);
    }
  }
  assert.deepEqual(neutral.sort(), NEUTRAL_INK);
  assert.deepEqual(Object.keys(LOOKS).filter((c) => /^#f{3}(f{3})?$/i.test(LOOKS[c].ink || '')).sort(), APPROVED_WHITE);
  // Qatar: white for most of its rim, by the file its emblem table names
  assert.equal(art(O.FILES.QR).rim, LOOKS.QR.ground);
});

test('the white marks that stay: each is a mark of one colour, on the colour of its brand', () => {
  const white = CODES.filter((c) => !LEDGER[c] && column(c).L.whitened && column(c).A.exists);
  for (const code of white) {
    const { A, L } = column(code);
    assert.ok((A.colours || []).filter((c) => !/^#F[C-F]F[C-F]F[C-F]$/i.test(c)).length <= 1, code + ': ' + (A.colours || []).join(' '));
    assert.ok(contrast('#FFFFFF', L.ground) >= 3 || L.css, code + ': white reads on ' + L.ground);
  }
  // the emblems the audit found inked white, and what each draws now
  for (const code of ['IB', 'KL', 'EK', 'CX', 'FI', 'JQ', 'SN', 'SQ', 'KC', 'VN', '6E', 'AT', 'AV', 'KQ', 'MH', 'SV', 'VA']) {
    assert.match(O.emblem(code), /^\/logos\/airline-tiles\//, code + ': its finished tile');
    assert.equal(column(code).L.whitened, false, code);
  }
  for (const code of ['JX', 'KE', 'OZ', 'VS']) assert.equal(column(code).L.whitened, false, code + ' keeps its colours');
  for (const code of ['JX', 'KE', 'OZ', 'TG', 'BW']) assert.equal(column(code).L.ground, '#FFFFFF', code + ': white outside, the emblem in its colours inside');
  assert.equal(W._orbKeepsColour('VS'), true);
  // one colour by design, white on the disc of the brand
  for (const code of ['AM', 'AR', 'FJ', 'JU', 'MF', 'UX', 'LH', 'RO']) {
    assert.equal(column(code).L.whitened, true, code);
    assert.equal(column(code).L.ground, O.ACCENT[code], code + ': on its own accent');
  }
});

// ── the gates that were right draw what they drew ──────────────────────────
test('the gates that were right draw what they drew: art, ground, ink and code ink', () => {
  // code: [orb art, ground seen, glyph ink seen, code ink seen], as the audit recorded them the day before
  const WAS = {
    AA: ['/logos/airlines/us-major/american-flight-symbol.svg', '#FFFFFF', '#0078D2', '#0078D2'],
    DL: ['/logos/airlines/us-major/delta-glossy-orb.png?v=23225', '#E01933', '#FFFFFF', '#FFFFFF'],
    UA: ['/logos/airline-tiles/UA-globe-glossy.png?v=22350', '#0033A0', '#fff', '#fff'],
    PD: ['/logos/airlines/canadian/porter-p.svg', '#FFFFFF', '#152C53', '#152C53'],
    F8: ['/logos/airlines/canadian/flair-dot.svg?v=2', '#7AFF94', '#141414', '#1B2430'],
    FR: ['/logos/symbols/airlines/FR.svg', '#073590', '#F1C933', '#FFFFFF'],
    AS: ['/logos/airline-tiles/ASA-orb-glossy.svg', '#01426A', '#fff', '#fff'],
    AC: ['/logos/airlines/canadian/AC.TO.svg', '#D82F2E', '#fff', '#fff'],
    QK: ['/logos/airlines/canadian-regional/jazz-j.svg', '#d91a2a', '#fff', '#fff'],
    WS: ['/logos/symbols/airlines/WS-mono.svg', '#00B2A9', '#fff', '#fff'],
    PB: ['/logos/airline-tiles/PB-arrow.svg?v=3', '#FCA404', null, null],
    YN: ['/logos/airline-tiles/CRQ.svg', '#FDD49A', '#272626', '#272626'],
    DM: ['/logos/airlines/asian-other/arajet-emblem.svg', '#FFFFFF', '#520E77', '#520E77'],
    TS: ['/logos/airline-tiles/TSC-star-white.svg', '#00B3F0', '#fff', '#fff'],
    '3H': ['/logos/airlines/canadian-regional/airinuit-emblem.svg', '#FFFFFF', '#F1471D', '#231F20'],
    AIE: ['/logos/airlines/canadian-regional/airinuit-emblem.svg', '#FFFFFF', '#F1471D', '#231F20'],
    LX: ['/logos/airline-tiles/SWR.svg', '#E60005', '#fff', '#fff'],
    MU: ['/logos/airline-tiles/CES.svg', '#1B1D80', '#fff', '#fff'],
    NZ: ['/logos/airline-tiles/NZ-Emblem.svg', '#231F20', '#fff', '#fff'],
    TK: ['/logos/symbols/airlines/TK.svg', '#C8102E', '#fff', '#fff'],
    XP: ['/logos/airlines/us-major/avelo-emblem.svg', '#502E90', '#fff', '#fff'],
    CS: ['/logos/symbols/airlines/CS.png', '#FF0000', '#fff', '#fff'],
    DI: ['/logos/airline-tiles/NAX.svg', '#EB0324', '#fff', '#fff'],
    '5T': ['/logos/airline-tiles/CanadianNorth-Emblem.svg', '#BA0C2F', '#fff', '#fff']
  };
  const same = (a, b) => full(String(a)).toUpperCase() === full(String(b)).toUpperCase();
  for (const [code, [file, ground, ink, codeInk]] of Object.entries(WAS)) {
    const L = W._gateColumnLook(code);
    assert.equal(L.art, file, code + ' art');
    assert.ok(same(L.ground, ground), code + ' ground ' + L.ground);
    if (ink) assert.ok(same(L.inkSeen, ink), code + ' ink ' + L.inkSeen);
    if (codeInk) assert.ok(same(L.codeSeen, codeInk), code + ' code ' + L.codeSeen);
  }
  // PAL keeps its arrow and its gold; only the ink moved, from a white that read at 2 to 1 to its navy
  assert.equal(W._gateColumnLook('PB').inkSeen, '#183677');
  assert.ok(contrast('#183677', '#FCA404') >= 4.5 && contrast('#FFFFFF', '#FCA404') < 3);
});

test('the rail of the day before and the one function agree, carrier by carrier', () => {
  const rail = CORE.slice(CORE.indexOf('var _railBadgeBg = '), CORE.indexOf('function _badge(svg) {', CORE.indexOf('var _railBadgeBg = ')));
  const bgOf = (c) => (new RegExp("\\(_alCodeEmb === '" + c + "'[^)]*\\) \\? '(#[0-9A-Fa-f]{6})'").exec(rail.slice(0, rail.indexOf('var _railBadgeInk'))) || [])[1];
  const inkOf = (c) => (new RegExp("\\(_alCodeEmb === '" + c + "'[^)]*\\) \\? '(#[0-9A-Fa-f]{6})'").exec(rail.slice(rail.indexOf('var _railBadgeInk'))) || [])[1];
  for (const code of ['F8', 'MX', 'YN', 'DM', '3H']) {
    const L = W._gateColumnLook(code);
    assert.equal(L.bg, bgOf(code), code + ': the ground the chain writes is the ground the function gives');
    if (inkOf(code)) assert.equal(L.ink, inkOf(code), code + ' ink');
  }
  assert.equal(W._gateColumnLook('MX').ink, '#fff');
  // every other carrier asks the function, and the accent variable stays where the orb is an accent disc
  assert.match(rail, /: \(_railLook && _railLook\.bg\) \? _railLook\.bg\s*\n\s*: 'var\(--airline-accent,' \+ _railAccFb \+ '\)';/);
  assert.match(rail, /: \(_railLook && _railLook\.ink\) \|\| '#fff';/);
  assert.match(rail, /var _railCodeVar = \(_railLook && _railLook\.codeVar\) \? '--orb-code-ink:' \+ _railLook\.codeVar \+ ';' : '';\s*\n\s*var BADGE_STYLE = _railCodeVar \+ '/);
  for (const code of ['AC', 'QK', 'WS', 'AS', 'TK', 'XP', 'CS', 'UA', 'DL', 'AA', 'PD', 'F9', 'FR']) {
    const L = W._gateColumnLook(code);
    assert.deepEqual([L.bg, L.ink, L.codeVar], ['', '#fff', ''], code + ': the rail writes what it always wrote');
  }
  // the code chip rules of the day before say what the function says
  for (const code of ['YN', 'DM', '3H', 'AIE', 'F8']) {
    const i = CSS.indexOf('[data-gate-airline="' + code + '"]', CSS.indexOf(code === 'F8' ? 'v23767 — FLAIR' : 'v24150 — the code chip on the discs of carriers whose discs are light'));
    const body = CSS.slice(CSS.indexOf('{', i), CSS.indexOf('}', i));
    assert.equal(/color: (#[0-9A-F]{6}) !important;/.exec(body)[1], W._gateColumnLook(code).codeVar, code);
  }
});

test('the carriers the stylesheet paints: what the table records is what the stylesheet says', () => {
  assert.deepEqual(Object.keys(LOOKS).filter((c) => LOOKS[c].css).sort(), ['AA', 'DL', 'F9', 'FR', 'PB', 'PD', 'UA'], 'no carrier joins this list unseen');
  // every rule as its selectors (one per comma outside brackets, the :not(#_) padding dropped) and its body
  const rules = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((part) => {
    const i = part.indexOf('{');
    if (i < 0) return null;
    const sels = []; let depth = 0, cur = '';
    for (const ch of part.slice(0, i).replace(/:not\(#_\)/g, '').replace(/\s+/g, ' ')) {
      if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { sels.push(cur.trim()); cur = ''; } else cur += ch;
    }
    sels.push(cur.trim());
    return { sels, body: part.slice(i + 1).replace(/\s+/g, ' ') };
  }).filter(Boolean);
  const R = rules(CSS), RG = rules(GATE_CSS);
  // a rule that paints, for this carrier, an element whose selector ends this way
  const paints = (list, carrier, tail, bodyRe) => list.some((r) => bodyRe.test(r.body) && r.sels.some((s) => s.includes(carrier) && s.endsWith(tail)));
  const AA = 'data-gate-airline="AA"', DL = 'data-gate-airline="DL"', PD = 'data-gate-airline="PD"', F9 = 'data-gate-airline="F9"', FR = 'data-gate-airline="FR"';
  // American: white badges, a white emblem disc, glyphs and code in its blue
  assert.ok(paints(R, AA, ' .v2-fi-icon-badge', /background: #ffffff !important; color: #0078D2 !important/i));
  assert.ok(paints(R, AA, ' .v2-fi-emblem-wrap:not(.v2-fi-emblem-native)', /background: #ffffff !important/i));
  assert.ok(paints(R, AA, ' .v2-fi-orbcode', /color: #0078D2 !important/));
  // Delta: the badges and the emblem disc in its red
  assert.ok(paints(R, DL, ' .v2-fi-icon-badge', /background: radial-gradient\([^;]*#E01933 55%/));
  assert.ok(paints(R, DL, ' .v2-fi-emblem-wrap', /background: radial-gradient\([^;]*#E01933 55%/));
  // Porter: white discs, navy glyphs and code
  assert.ok(paints(R, PD, ' .v2-fi-icon-badge', /background: #FFFFFF !important/));
  assert.ok(paints(R, PD, ' .v2-fi-emblem-wrap:not(.v2-fi-emblem-native)', /background: #FFFFFF !important/));
  assert.ok(paints(R, PD, ' .ac-ico', /color: #152C53 !important/));
  assert.ok(paints(R, PD, ' .v2-fi-orbcode', /color: #152C53 !important/));
  // Frontier: Frontier Green, the value of the accent table and of its tile
  const green = new RegExp('background: ' + LOOKS.F9.ground + ' !important');
  assert.ok(paints(R, F9, ' .v2-fi-icon-badge', green) && paints(R, F9, ' .v2-fi-emblem-wrap', green));
  assert.equal(LOOKS.F9.ground, O.ACCENT.F9);
  assert.equal(W._ORB_TILE_GROUNDS.FFT, O.ACCENT.F9);
  assert.doesNotMatch(CSS + COLORS, /#00854D\s*(!important|'|;)/i, 'the green of no Frontier palette paints nothing on the gate or in the colour table');
  // PAL: gold on the badges and on the emblem disc
  const gold = new RegExp('background: ' + LOOKS.PB.ground + ' !important');
  assert.ok(paints(RG, '.g8-airline-PB ', ' .v2-fi-icon-badge', gold) && paints(RG, '.g8-airline-PB ', ' .v2-fi-emblem-wrap', gold));
  // Ryanair: gold glyphs, the harp never inked
  assert.ok(paints(R, FR, ' .v2-fi-icon-badge .ac-ico', /color: #F1C933 !important/));
  assert.ok(paints(R, FR, ' .v2-fi-emblem-wrap img', /filter: none !important/));
});

// ── the ink of the destination code ────────────────────────────────────────
test('the code chip reads the ink of its column from one rule, beside the code chip rules of v24150', () => {
  const at = CSS.indexOf('.v2-fi-icon-badge[style*="--orb-code-ink"] .v2-fi-orbcode:not(.v2-fi-orbcode-onaccent) {');
  assert.ok(at > 0, 'the one rule');
  assert.equal(CSS.indexOf('--orb-code-ink"]', at + 60), -1, 'one rule only');
  const body = CSS.slice(CSS.indexOf('{', at), CSS.indexOf('}', at));
  assert.match(body, /color: var\(--orb-code-ink\) !important;/);
  assert.match(body, /-webkit-text-fill-color: var\(--orb-code-ink\) !important;/);
  const v24150 = CSS.indexOf('v24150 — the code chip on the discs of carriers whose discs are light');
  assert.ok(at > v24150 && at - v24150 < 6000, 'beside that block');
  assert.ok(CSS.length - at > 100000, 'never at the end of the stylesheet');
  // it outranks the rules that name one carrier: as many :not(#_) and one class more
  const sel = CSS.slice(CSS.lastIndexOf('\n', at) + 1, at);
  const carrier = CSS.slice(CSS.indexOf('html body[data-gate-airline="YN"]', v24150), CSS.indexOf('{', CSS.indexOf('html body[data-gate-airline="YN"]', v24150)));
  assert.equal(sel.split(':not(#_)').length, carrier.split(':not(#_)').length);
  // and the gate writes the variable only where the code is not white and the stylesheet has no rule of its own
  for (const [code, ink] of [['HA', '#4B2D89'], ['BA', '#2E5C99'], ['WN', '#304CB2'], ['LY', '#1B358F'], ['ET', '#2E7D32'], ['PR', '#001F60'], ['4Y', '#003E7B'],
    ['QR', '#5C0931'], ['PB', '#183677'], ['BT', '#152649'], ['PC', '#323A47'], ['DE', '#111111'], ['KE', '#051766']]) {
    assert.equal(W._gateColumnLook(code).codeVar, ink, code);
  }
  for (const code of ['AC', 'AA', 'PD', 'DL', 'UA', 'IB', 'EK', 'B6']) assert.equal(W._gateColumnLook(code).codeVar, '', code);
});

test('ink by contrast: white on a dark ground, the dark colour of the brand on a light one', () => {
  assert.equal(W._orbInkOn('#001B94'), '#fff');
  assert.equal(W._orbInkOn('#FFE900'), '#1B2430');
  assert.equal(W._orbInkOn('#FF6600'), '#1B2430', 'white on this orange is 2.9 to 1');
  let dark = 0, light = 0;
  for (const code of CODES) {
    if (LEDGER[code]) continue;
    const L = W._gateColumnLook(code);
    if (!HEX.test(L.ground)) continue;
    if (/^#f{3}(f{3})?$/i.test(L.inkSeen)) { dark++; assert.ok(contrast('#FFFFFF', L.ground) >= 3, code); }
    else { light++; assert.ok(contrast(L.inkSeen, L.ground) >= 3, code + ' ' + L.inkSeen + ' on ' + L.ground); }
  }
  assert.ok(dark > 80 && light > 30, dark + ' dark grounds, ' + light + ' light or stylesheet-inked');
  // the light columns of the audit, each at 4.5 to 1 or better in the colour of its brand
  for (const code of ['HA', 'BA', 'WN', 'LY', 'PR', '4Y', 'QR', 'BT', 'TR', 'VY', 'WB', 'DE', 'PC', 'KE', 'TG', 'BW', 'JV', 'CA', 'HY', 'S4', 'JX', 'KL', '4N', 'PB']) {
    const L = W._gateColumnLook(code);
    assert.ok(contrast(L.inkSeen, L.ground) >= 4.5, code + ': ' + L.inkSeen + ' on ' + L.ground + ' = ' + contrast(L.inkSeen, L.ground).toFixed(2));
    assert.notEqual(L.inkSeen, '#1B2430', code + ': its own colour, not the neutral');
  }
});

// ── the fold ───────────────────────────────────────────────────────────────
test('a regional that prints its partner wears the partner: one fold for the column, the accent and the stylesheet', () => {
  const F = { MQ: 'AA', ENY: 'AA', OH: 'AA', PSA: 'AA', PT: 'AA', PDT: 'AA', QX: 'AS', QXE: 'AS', '9E': 'DL', EDV: 'DL', ZX: 'AC', '9M': 'AC', '9L': 'AC',
    CJ: 'BA', RK: 'FR', SP: 'PB', P6: 'BQ', Q6: 'Y4', JJ: 'LA', '4C': 'LA', ACEX: 'AC', EZY: 'U2', ACA: 'AC', DAL: 'DL', AAL: 'AA', KLM: 'KL', PCO: '8P', QTR: 'QR' };
  for (const [from, to] of Object.entries(F)) {
    assert.equal(O.fold(from), to, from);
    assert.deepEqual(W._gateColumnLook(from), W._gateColumnLook(to), from + ' draws the column of ' + to);
    assert.deepEqual(W._gateOrbParts(from), W._gateOrbParts(to), from + ' draws the orb of ' + to);
  }
  for (const c of ['AC', 'QK', 'RV', 'PB', 'WS', 'WR', 'DI', 'DY', 'U2', 'YX', '']) assert.equal(O.fold(c), c, c + ' is left alone');
  // a designator never borrows the colour of whoever shares its first two letters
  assert.equal(W._gateColumnLook('PCO').ground === O.ACCENT.PC, false);
  // the gate asks the fold for its accent and for the attribute its stylesheet rules key on
  assert.match(CORE, /const accent = getAirlineAccent\(\(typeof _orbEmblemCarrier === 'function'\) \? _orbEmblemCarrier\(airlineCode\) : airlineCode\);/);
  assert.match(CORE, /if \(typeof _orbEmblemCarrier === 'function'\) _skinCode = _orbEmblemCarrier\(_skinCode\);\s*\n\s*document\.body\.setAttribute\('data-gate-airline', _skinCode\);/);
  assert.match(CORE, /document\.body\.setAttribute\('data-gate-airline', \(typeof _orbEmblemCarrier === 'function'\) \? _orbEmblemCarrier\(window\._gateCurrentAirline\) : window\._gateCurrentAirline\);/);
  // the rail asks it once, for the carrier of the gate
  assert.match(CORE, /var _railSkin = _orbEmblemCarrier\(String\(\(vars && vars\.airlineCode\) \|\| _fnCarrier \|\| _alCodeEmb \|\| ''\)\.trim\(\)\.toUpperCase\(\)\);/);
  assert.match(CORE, /var _emblemHtml = _fnCarrier \? _emblemImg\(_railSkin \|\| _fnCarrier\) : '';/);
  // a regional with no colour of its own takes the colour of its partner
  for (const [from, to] of [['MQ', 'AA'], ['OH', 'AA'], ['QX', 'AS'], ['9E', 'DL'], ['ZX', 'AC'], ['CJ', 'BA'], ['JJ', 'LA']]) assert.equal(O.accent(from), O.accent(to), from);
});

test('the boarding shelf: a dark tile gives its ground to the shelf badges; a light ground is left to the accent, as that shelf inks white', () => {
  const at = CORE.indexOf('var _birRailBg = _birF8 ');
  const shelf = CORE.slice(at, CORE.indexOf('var _BIR_BADGE_STYLE = ', at));
  assert.match(shelf, /: \(_birLook && _birLook\.bg && _birLook\.ink === '#fff'\) \? _birLook\.bg\s*\n\s*: 'var\(--airline-accent,' \+ _birAccFb \+ '\)';/);
  assert.match(shelf, /var _birRailInk = _birF8 \? '#141414' : '#fff';/, 'white, as before');
  // Singapore: the navy of its tile, never its gold accent beside the navy orb
  const SQ = W._gateColumnLook('SQ');
  assert.deepEqual([SQ.bg, SQ.ink], [W._ORB_TILE_GROUNDS.SIA, '#fff']);
  assert.ok(contrast('#FFFFFF', SQ.bg) >= 4.5);
});

test('an operator with no emblem leaves the Your Aircraft orbs to the gate carrier', () => {
  for (const c of ['YX', 'G7', 'ZW', 'C5', 'CP']) assert.equal(O.emblem(c), '', c + ': no file is asked for, so nothing fails to the letters');
  assert.match(CORE, /_mcOrbSrc = _airlineOrbEmblem\(_orbCode_mcOrb\) \|\| _airlineOrbEmblem\(_mcCode\);/);
  assert.match(CORE, /var _mcOrbArt = \(_mcOrbOp && _airlineOrbEmblem\(_mcOrbOp\)\) \? _mcOrbOp : _mcCode;/);
  assert.match(CORE, /if \(!_niSameCarrier && !_niOrbSrc && _mcOrbSrc\) _niSameCarrier = true;\s*\n\s*if \(_niSameCarrier && _mcOrbSrc\) _niOrbSrc = _mcOrbSrc;/);
});

// ── no colour of its own ───────────────────────────────────────────────────
test('no gate with art of its own falls to the fallback blue, and the colour tables agree where the audit found them apart', () => {
  for (const code of CODES) {
    const { A, accent } = column(code);
    if (A.exists && !LEDGER[code]) assert.notEqual(accent.toUpperCase(), '#0033A1', code);
  }
  // a tile carrier with no row in the accent table takes the ground of its tile
  for (const [code, tile] of [['BF', 'FBU'], ['BR', 'EVA'], ['CI', 'CAL'], ['CZ', 'CSN'], ['G3', 'GLO'], ['GF', 'GFA'], ['HU', 'CHH'], ['LS', 'EXS'], ['ME', 'MEA'], ['MS', 'MSR'], ['OU', 'CTN'], ['RJ', 'RJA'], ['SY', 'SCX'], ['WK', 'EDW'], ['Y4', 'VOI'], ['GA', 'GIA'], ['KC', 'KZR'], ['VN', 'HVN']]) {
    assert.equal(O.ACCENT[code], undefined, code + ' has no row');
    assert.equal(O.accent(code), W._ORB_TILE_GROUNDS[tile], code);
  }
  // a light column with no row takes the ink of its column, the dark colour of the brand
  for (const [code, ink] of [['BT', '#152649'], ['PR', '#001F60'], ['4Y', '#003E7B'], ['JX', '#996A4E'], ['TG', '#330066'], ['BW', '#813F98'], ['JV', '#910028'], ['CA', '#002569']]) assert.equal(O.accent(code), ink, code);
  // the tables that disagreed
  const AB = new Function('window', COLORS + '\nreturn window.AIRLINE_BRAND_COLORS;')({});
  assert.equal(O.BRAND.AF.accent, O.ACCENT.AF); assert.equal(AB.AF.r1, O.ACCENT.AF);
  assert.equal(O.BRAND.EK.accent, O.ACCENT.EK); assert.equal(W._ORB_TILE_GROUNDS.UAE, O.ACCENT.EK); assert.equal(AB.EK.r1, O.ACCENT.EK);
  assert.equal(O.BRAND.QR.accent.toUpperCase(), O.ACCENT.QR); assert.equal(AB.QR.r1, O.ACCENT.QR);
  assert.equal(AB.F9.r2, O.ACCENT.F9);
  assert.equal(AB['5T'].r1, O.ACCENT['5T']); assert.equal(AB['5T'].r2, '#7C878E');
  assert.equal(AB['4N'].r1, '#0F2A55'); assert.equal(AB['4N'].r2, '#F06E0C'); assert.equal(LOOKS['4N'].ink, AB['4N'].r1);
  assert.equal(AB.CM.r1, O.ACCENT.CM); assert.deepEqual(AB['4C'], AB.LA);
  assert.equal(AB.WN.r1, O.ACCENT.WN);
  assert.equal(O.BRAND.PB.accent, '#FFA400', 'the published yellow of PAL, where the re-point pass painted an orange of no PAL palette');
  // each of these is the ground of the tile the orb draws, the same string
  for (const [code, tile] of [['U2', 'EZY'], ['CX', 'CPA'], ['IB', 'IBE'], ['AY', 'FIN'], ['EI', 'EIN'], ['A3', 'AEE'], ['PC', 'PGT'], ['EW', 'EWG'], ['MX', 'MXY'], ['EK', 'UAE']]) assert.equal(O.ACCENT[code], W._ORB_TILE_GROUNDS[tile], code);
  assert.equal(O.ACCENT.OS, LOOKS.OS.ground); assert.equal(O.ACCENT.CM, LOOKS.CM.ground);
  // the Your Aircraft disc: where the re-point pass repaints an accent disc from AIRLINE_BRAND, it is the colour of the rail
  for (const [code, b] of Object.entries(O.BRAND)) {
    const L = W._gateColumnLook(code);
    if (L.css || L.bg || !b.accent) continue;
    assert.ok(dE(full(b.accent), L.ground) < 6, code + ': AIRLINE_BRAND accent ' + b.accent + ' beside the rail ' + L.ground);
  }
});
