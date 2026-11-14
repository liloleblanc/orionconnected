'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE ORBS OF A GATE, FOR EVERY AIRLINE THE BOARDS CAN NAME
//
// The gate shows round orbs: the emblem orb at the top of the left rail, five
// glyph badges under it (the destination code rides in one of them), the
// Your Aircraft orb at the bottom right, and the boarding shelf, which draws
// the same emblem orb beside five badges of its own. The standing rules:
//   1. every orb of a gate is one colour, and the colour of the top orb is
//      the one the others take;
//   2. an emblem is never inked white, unless the art is itself a mark of one
//      colour drawn to sit white on the colour of the brand;
//   3. white outside with the emblem in its colours inside is an approved
//      pattern (the whole column then white or light, glyphs and code in the
//      colour of the brand);
//   4. the colours are the airline's own;
//   5. the glyphs and the destination code read on their disc;
//   6. A DISC IS NEVER THE COLOUR OF THE PANEL BEHIND IT. One colour down the
//      column was not enough: red discs on a red rail card, blue on blue and
//      navy on navy sink into the card. The gate knows the paint of the card
//      behind the discs of a carrier (window._gateCardPaint) and measures the
//      disc against it (window._gateDiscSinks). Where the disc would sink:
//        THE CARD GOES DARK FIRST, AND THE DISCS STAY. The plate of the rail
//        cards and of the shelf cells takes a dark neutral (the house
//        charcoal, or the black or dark grey the airline has on record), and
//        the gate keeps its own discs and its own top orb, as the Air Canada
//        gate is drawn: red discs on a black card. One function decides it
//        from the measure (window._gateCardDark), for every gate whose discs
//        stand clear of the dark plate with room;
//        THE WHITE COLUMN ONLY WHERE THE DARK PLATE CANNOT WORK: a gate whose
//        own discs are dark themselves (a navy, a black, a deep maroon) and
//        would sink into the charcoal too, or one whose card is a picture of
//        the airline. Its column is white outside with the mark in its
//        colours inside: the mark of the airline on the white disc where one
//        is on disk, else its tile as a round inset inside a wide white
//        ring, else letters, with the glyphs and the code in the colour of
//        the brand.
//      The Your Aircraft orb sits on a second panel, the lower right one,
//      judged the same way: where the orb would sink into it the panel takes
//      the dark plate (window._gateLowerPair), and the orb stays. The gates
//      approved as drawn are named in one list and stay as they are, cards,
//      discs and lower panels.
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
// (scripts/orbs/tile-grounds.js). And one function writes the Your Aircraft
// orb (window._gateCardOrb), for the carrier whose art lands in it.
//
// THIS FILE READS WHAT IS PAINTED. It does not ask a function for a ground
// and compare the answer with itself. It cuts the lines that write the
// markup out of fids-core.js (the top orb of the rail, the five badges, both
// builders of the Your Aircraft orb, the pass that re-points it at the
// operator, the badges and the emblem orb of the boarding shelf), runs them
// for every code in the name tables, and parses the background, the image
// and the ink out of the markup they produce. A disc painted in another
// colour than the one the look reports, or a white filter written on an
// emblem the look says keeps its colours, fails here.
//
// A carrier that cannot pass without new art is in ONE ledger below, by code,
// with the reason; the ledger fails when a carrier in it starts to pass.
//
// THE SURFACES BESIDE THE ORBS (the three plates, the gate change notice, the
// emblem of the centre cards) show the mark of a carrier and were to keep
// what they drew. They are held to a record of what origin/main showed for
// every code, with one table of the differences that are kept on purpose
// (tests/fixtures/gate-marks-origin-main.json, made and read by
// scripts/orbs/marks-shown.js): a difference no row names fails, and so does
// a row that no longer differs.
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
const MANIFEST = fs.readFileSync(path.join(FC, 'logos/airline-tiles/MANIFEST.csv'), 'utf8');
const GEN = require(path.join(ROOT, 'scripts/orbs/tile-grounds.js'));
// What the surfaces that are not orbs end up showing (the three plates, the gate change notice,
// the centre cards): the script cuts the lines that write them and runs the missing-file
// handlers of this same fids-core.js against a stand-in for the image.
const MARKS = require(path.join(ROOT, 'scripts/orbs/marks-shown.js'));
const SHOWN = MARKS.build(CORE, FC);

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
// The lines between two markers, as they stand in the source: from the start of `from` to the
// start of `to` (or, with `through`, to the end of the line that holds `to`).
function lines(from, to, through) {
  const a = CORE.indexOf(from);
  assert.ok(a >= 0, 'fids-core.js still has: ' + from);
  const b = CORE.indexOf(to, a + from.length);
  assert.ok(b > a, 'and after it: ' + to);
  return CORE.slice(a, through ? CORE.indexOf('\n', b) : b);
}

// THE LINES THAT WRITE THE MARKUP, cut verbatim.
// the rail: the carrier whose look the column wears, the top orb, the five badges
const RAIL_HEAD = lines('var _railRow = String(', 'var _emblemHtml = _fnCarrier ?', true);
const RAIL_BADGES = lines('var _railAccFb = ', 'var BADGE_STYLE = _railCodeVar + ', true);
// the Your Aircraft orb of the card with an inbound: who flies it, then the markup of the orb
const MC_VARS = lines("var _mcCode = String((vars && vars.airlineCode) || '').trim().toUpperCase();", "// v23222 — the inbound card's banner names the event");
const MC_ORB = lines("'<div class=\"v2-fi-iconcol\"><div class=\"v2-fi-icon-wrap v2-fi-icon-badge' + _mcWrapCls", "+     '</div></div>'", true);
// the same orb of the card with no inbound
const NI_VARS = lines('var _niGate = String(', '// v23308 — the status line only says');
const NI_ORB = lines("'<div class=\"v2-fi-iconcol\"><div class=\"v2-fi-icon-wrap v2-fi-icon-badge' + _niWrapCls", "+     '</div></div>'", true);
// the pass that re-points the orb once the operator is known
const PASS = lines("var _opOrb = (typeof _orbEmblemCarrier === 'function') ? _orbEmblemCarrier(_opCode) : _opCode;", '} catch (e) {}');
// the boarding shelf: its five badges and its emblem orb
const SHELF_BADGES = lines('var _birAccFb = ', 'var _BIR_BADGE_STYLE = ', true);
const SHELF_ORB = lines('var _birParts = window._gateOrbParts(airlineCode);', 'var _birFlightShelf = ');

// the colour data the gate loads before fids-core.js: the lower right panel reads it
const W = {};
new Function('window', COLORS)(W);
const O = new Function('window', [
  block('const AIRLINE_BRAND = {'), block('const AIRLINE_ACCENT = {'), block('function getAirlineAccent(code) {'),
  block('const CALLSIGN_TO_IATA = {'), block('const IATA_TO_TILE_ICAO = {'),
  block('const AIRLINE_NAME = {'), block('const _AIRLINE_NAME_OVERRIDE = {'),
  block('window._CARD_COLOR_EMBLEMS = {'), block('window._orbKeepsColour = function'),
  block('window._BADGE_TILE_BRANDS = {'), block('window._ORB_TILE_GROUNDS = {'), block('window._ORB_TILE_LETTERS = {'), block('window._GATE_ORB_LOOKS = {'),
  block('window._orbInkOn = function'),
  // the rule of the card behind the discs, whole: its tables, its arithmetic and its answers
  // (the white, the pictures, the darks, the kept list, the measure, the dark plate, the paint
  // of the card, the lower right pair, the white column)
  lines('window._GATE_WHITE = ', '// THE ONE ANSWER FOR A GATE COLUMN.'),
  // the two colours of the lower right panel, the second of which is behind the Your Aircraft orb
  lines('var RC2_STATUS = {', 'function _ocGroundOf(el) {'),
  block('window._gateColumnLook = function'), block('window._gateOwnAccent = function'),
  // the recipe of the art, the recipe with the rule applied, the white disc, the Your Aircraft orb
  lines('window._gateOrbNatural = function', 'var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {'),
  block('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {'), block('var GATE_TOP_ROUND_EMBLEM_FILES = {'),
  'var _TILE_DESIGNATOR_IATA = null;', block('function _designatorIata(code) {'),
  block('function _orbEmblemCarrier(code) {'), block('function _airlineOrbEmblem(code) {'), block('function _gateOrbArt(code) {'),
  block('window._orbTileLettersOther = function'), block('function _orbMono(code) {'),
  block('function _orbRowArg(code, q) {'), block('function _plateEmblem(code, marks) {'),
  // the rail, as the gate runs it for a row of this carrier
  block('function _emblemImg(code, rowCode) {'),
  'function __rail(vars, _fnCarrier, _alCodeEmb) {', RAIL_HEAD, RAIL_BADGES, 'return { emblem: _emblemHtml, badge: BADGE_STYLE, skin: _railSkin }; }',
  // the two builders of the Your Aircraft orb and the pass that follows them
  'function __cardWithInbound(vars) {', MC_VARS, 'return ' + MC_ORB + '; }',
  'function __cardNoInbound(vars, ctx, airlineCode, _niIb) {', NI_VARS, 'return ' + NI_ORB + '; }',
  'function __pass(_inboundCard, _mktCode6, _opCode) {', PASS, 'return _inboundCard; }',
  // the boarding shelf
  "function __shelf(airlineCode) { var _birF8 = (airlineCode === 'F8');", SHELF_BADGES, SHELF_ORB, 'return { badge: _BIR_BADGE_STYLE, orb: _birParts, icon: _birFlightIcon, ink: _birRailInk }; }',
  'return { BRAND: AIRLINE_BRAND, ACCENT: AIRLINE_ACCENT, accent: getAirlineAccent, TILE: IATA_TO_TILE_ICAO, CALL: CALLSIGN_TO_IATA,',
  '  NAME: AIRLINE_NAME, NAME2: _AIRLINE_NAME_OVERRIDE, fold: _orbEmblemCarrier, emblem: _airlineOrbEmblem, art: _gateOrbArt, desig: _designatorIata,',
  '  mono: _orbMono, rowArg: _orbRowArg, plate: _plateEmblem, FILES: AIRLINE_EMBLEM_FILES, TOP: GATE_TOP_ROUND_EMBLEM_FILES,',
  '  rail: __rail, cardWithInbound: __cardWithInbound, cardNoInbound: __cardNoInbound, pass: __pass, shelf: __shelf, pair: _rc2Pair };'
].join('\n'))(W);
const LOOKS = W._GATE_ORB_LOOKS;
const CODES = [...new Set([...Object.keys(O.NAME), ...Object.keys(O.NAME2)])].sort();

// ── colour arithmetic: WCAG contrast and CIEDE2000 ─────────────────────────
const HEX = /^#[0-9a-f]{6}$/i;
const WHITE = /^#f{3}(f{3})?$/i;
const full = (h) => (/^#[0-9a-f]{3}$/i.test(h) ? '#' + h.slice(1).split('').map((c) => c + c).join('') : h);
const same = (a, b) => full(String(a)).toUpperCase() === full(String(b)).toUpperCase();
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
// Its colours, the colour of its rim where the orb crops it (and how much of the rim that colour
// holds, how much of it is a gradient, how much is clear), and the colour that fills most of the
// orb. Read from the file with the sampler the generator uses.
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
      let ramp = 0, clear = 0;
      for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
        const x = vx + (i + 0.5) / 40 * vw, y = vy + (j + 0.5) / 40 * vh;
        if (Math.hypot(x - cx, y - cy) > R * 0.95) continue;
        const c = GEN.colourAt(m, x, y); if (c) area[c] = (area[c] || 0) + 1;
      }
      for (let k = 0; k < 72; k++) {
        const a = k / 72 * 2 * Math.PI, s = GEN.shapeAt(m, cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98);
        if (!s) { clear++; continue; }
        if (s.ramp) ramp++;
        rim[s.fill] = (rim[s.fill] || 0) + 1;
      }
      const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      r.main = top(area)[0]; r.rim = top(rim)[0]; r.rimShare = top(rim)[1] / 72; r.rampShare = ramp / 72; r.clearShare = clear / 72;
    }
  }
  return (artCache[clean] = r);
}

// ── what a piece of markup paints ──────────────────────────────────────────
// The orb written by a builder: the class and the style of its box, the last background and
// padding that style declares, the image (its file, its fit, whether the white filter is on it)
// or the letters, their ink and the whole style that ink is written in.
function orbFacts(html) {
  const box = /^(?:<div class="v2-fi-iconcol">)?<(?:div|span) class="([^"]*)" style="([^"]*)"/.exec(String(html)) || [];
  const cls = box[1] || '', style = box[2] || '';
  const last = (prop) => { const all = [...style.matchAll(new RegExp('(?:^|;)' + prop + ':([^;]+);', 'g'))]; return all.length ? all[all.length - 1][1] : ''; };
  const img = /<img\b([^>]*)/.exec(String(html));
  const src = img ? (/\bsrc="([^"]*)"/.exec(img[1]) || [])[1] || '' : '';
  const imgStyle = img ? (/\bstyle="([^"]*)"/.exec(img[1]) || [])[1] || '' : '';
  const span = /<span class="v2-fi-orb-?code[^"]*"(?: style="([^"]*)")?>([^<]*)<\/span>/.exec(String(html));
  return { cls, style, bg: last('background'), pad: last('padding'), src, imgStyle,
    inked: /invert\(1\)/.test(imgStyle) && !/filter:none;/.test(imgStyle), fit: /object-fit:cover/.test(imgStyle) ? 'cover' : (img ? 'contain' : ''),
    native: /v2-fi-(?:orbwrap|emblem)-native/.test(cls), generic: /<svg viewBox="0 0 24 24"/.test(String(html)),
    letters: span ? span[2] : '', lettersInk: span ? (/color:\s*(#[0-9a-f]{3,6})/i.exec(span[1] || '') || [])[1] || '' : '',
    lettersStyle: span ? span[1] || '' : '' };
}
// AN INK IS WRITTEN TO WIN. The stylesheet sets the letters of the Your Aircraft orb white with
// !important, and the code chip of the rail by a variable with !important, so an ink written
// inline lands only when it carries !important itself (and, for the chip, the fill colour too:
// the stylesheet sets both). Read off the whole style of the span, not off the first colour in it.
const inkWins = (style, fillToo) => /(?:^|;)\s*color:\s*#[0-9a-f]{3,6}\s*!important\s*;/i.test(style)
  && (!fillToo || /(?:^|;)\s*-webkit-text-fill-color:\s*#[0-9a-f]{3,6}\s*!important\s*;/i.test(style));
const isVar = (bg) => /^var\(--airline-accent,/.test(bg);
const styleProp = (style, prop) => { const all = [...String(style).matchAll(new RegExp('(?:^|;)' + prop + ':([^;]+);', 'g'))]; return all.length ? all[all.length - 1][1] : ''; };

// ── the facts of one gate column, read from what the gate writes ───────────
// THE MEASURE OF RULE 6, worked from the arithmetic of this file and not asked of the gate: a
// disc sinks into a paint when the two are near enough the same paint (CIEDE2000 under 20), or
// when both have colour (CIELAB chroma 7 or more) and their hues are less than 60 degrees apart.
const SINK = { deltaE: 20, chroma: 7, hue: 60 };
function sinks(disc, paint) {
  if (dE(disc, paint) < SINK.deltaE) return true;
  const [, a1, b1] = lab(disc), [, a2, b2] = lab(paint);
  if (Math.hypot(a1, b1) < SINK.chroma || Math.hypot(a2, b2) < SINK.chroma) return false;
  let d = Math.abs(Math.atan2(b1, a1) - Math.atan2(b2, a2)) * 180 / Math.PI;
  if (d > 180) d = 360 - d;
  return d < SINK.hue;
}
const hueGap = (x, y) => { const [, a1, b1] = lab(x), [, a2, b2] = lab(y); let d = Math.abs(Math.atan2(b1, a1) - Math.atan2(b2, a2)) * 180 / Math.PI; return d > 180 ? 360 - d : d; };
const chroma = (x) => { const [, a, b] = lab(x); return Math.hypot(a, b); };
const THE_WHITE = '#FFFFFF';
// THE RING OF AN INSET: 30 hundredths of the radius, so that half of the orb is white and it reads
// as a white disc that carries a roundel. On the rail and the shelf the disc is 7.48vh across and
// the ring is padding of 1.12vh; the Your Aircraft orb is sized by --rcp-orb and its ring is 15
// hundredths of that length on each side, written to win over the padding of the stylesheet.
const RING_SHARE = 0.30;
const RING = 'clamp(7px,1.12vh,14px)', RING_CARD = 'calc(var(--rcp-orb, 52px) * 0.15) !important', PAD = 'clamp(6px,0.9vh,13px)';
// STANDING CLEAR OF THE DARK PLATE, WITH ROOM, by the arithmetic of this file: the measure passes
// and the disc is at least twice as bright as the plate (the luminance ratio of WCAG).
const CLEAR = 2;
const clear = (disc, paint) => !sinks(disc, paint) && lum(disc) > lum(paint) && contrast(disc, paint) >= CLEAR;
const HOUSE_DARK = '#16181D';
// the engraving screened over the base of a plate, and the shade of an accent under it
const screened = (base) => '#' + rgb(base).map((v) => Math.round(255 - (255 - v) * (255 - 13) / 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const shadeBase = (accent) => '#' + rgb(accent).map((v, k) => Math.round(v * 0.34 + [11, 14, 20][k] * 0.66).toString(16).padStart(2, '0')).join('').toUpperCase();
const lettersOf = (code) => String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);

function column(code) {
  const L = W._gateColumnLook(code), P = W._gateOrbParts(code), A = art(L.art);
  const accent = O.accent(L.carrier);
  // the rail, run as the gate runs it for a row of this carrier
  const rail = O.rail({ airlineCode: code }, code, code);
  const emb = orbFacts(rail.emblem);
  const badge = { bg: styleProp(rail.badge, 'background'), ink: styleProp(rail.badge, 'color'), codeVar: styleProp(rail.badge, '--orb-code-ink') };
  // the ground the top orb shows, and who paints it
  let top, from;
  if (L.css) { top = L.ground; from = 'stylesheet'; }
  else if (HEX.test(full(emb.bg))) { top = emb.bg; from = 'painted'; }
  else if (isVar(emb.bg)) { top = accent; from = 'accent'; }
  else if (P.ground) { top = P.ground; from = 'art by the table'; }     // a clear box: the art is the disc
  else if (emb.native && A.exists && A.main) { top = A.main; from = 'art'; }
  else { top = accent; from = 'accent'; }
  return { code, L, P, A, accent, top, from, emb, badge, badgeBg: isVar(badge.bg) ? accent : badge.bg };
}

// Every rule a column can break. Empty means the gate obeys them all.
function broken(code) {
  const { L, A, accent, top, from, emb, badge, badgeBg } = column(code), out = [];
  // the top orb: art, or the letters of the code where its only tile letters another code, or
  // where the column is white and there is no art at all (the white plane would be lost on it)
  const noArt = !L.art && !L.letters;
  if (noArt && !L.white) out.push('no orb art: a generic white plane');
  else if (noArt && emb.letters !== lettersOf(code)) out.push('a white column with no art letters ' + (emb.letters || 'nothing') + ', not its code');
  else if (L.art && !A.exists) out.push('the orb art is not on disk: ' + L.art);
  if (emb.generic && L.white) out.push('the generic white plane on a white disc');
  if (emb.src !== (L.art || '')) out.push('the top orb draws ' + (emb.src || 'no file') + ', the look says ' + (L.art || 'none'));
  if (L.letters && emb.letters !== L.letters) out.push('the top orb letters ' + emb.letters + ', the look says ' + L.letters);
  if (emb.letters && !inkWins(emb.lettersStyle, true)) out.push('the letters of the top orb are inked in a style the stylesheet beats: ' + (emb.lettersStyle || 'none'));
  if (!HEX.test(full(top)) || !HEX.test(full(L.ground))) out.push('a ground that is no colour: ' + top + ' / ' + L.ground);
  else {
    // 1. ONE COLOUR. What the top orb paints is the ground the look reports …
    if (dE(top, L.ground) >= 6) out.push('two colours: the top orb paints ' + top + ', the look says ' + L.ground + ' (dE ' + dE(top, L.ground).toFixed(1) + ')');
    else if (from === 'painted' && !same(top, L.ground)) out.push('the top orb paints ' + top + ' and the look says ' + L.ground + ': not one string');
    // … a tile that is the disc really shows that ground at its rim …
    if (from === 'art by the table' && A.exists && A.rim) {
      if (A.rampShare > 0.5) out.push('the orb art has a gradient at its rim: no single ground (' + L.art + ')');
      else if (dE(A.rim, top) >= 6 || A.rimShare < 0.75) out.push('the orb art shows ' + top + ' on ' + Math.round((dE(A.rim, top) < 6 ? A.rimShare : 0) * 100) + '% of its rim: not one ground (' + L.art + ')');
    }
    // … and the five badges the rail writes are that colour, in the ink the look gives.
    if (!L.css) {
      if (!HEX.test(full(badgeBg))) out.push('the five badges are no colour: ' + badge.bg);
      else if (dE(badgeBg, top) >= 6) out.push('two colours: the top orb ' + top + ', the five badges ' + badgeBg + ' (dE ' + dE(badgeBg, top).toFixed(1) + ')');
      else if (from !== 'accent' && !isVar(badge.bg) && !same(badgeBg, L.ground)) out.push('the five badges ' + badgeBg + ' and the look ' + L.ground + ' are not one string');
      if (!same(badge.ink, L.ink)) out.push('the rail inks its glyphs ' + badge.ink + ', the look says ' + L.ink);
      if (!same(badge.codeVar || '', L.codeVar || '')) out.push('the rail writes the code ink ' + (badge.codeVar || 'none') + ', the look says ' + (L.codeVar || 'none'));
    }
    // 5. THE INKS READ.
    for (const [what, ink] of [['glyphs', L.inkSeen], ['code', L.codeSeen]]) {
      if (contrast(ink, L.ground) < 3) out.push('the ' + what + ' ' + ink + ' on ' + L.ground + ' read at ' + contrast(ink, L.ground).toFixed(2) + ' to 1');
    }
    if (emb.letters && emb.lettersInk && contrast(emb.lettersInk, top) < 3) out.push('the letters ' + emb.lettersInk + ' on ' + top + ' read at ' + contrast(emb.lettersInk, top).toFixed(2) + ' to 1');
  }
  // 2. NO EMBLEM INKED WHITE: judged from the filter the image style carries, not from a flag.
  if (emb.inked !== !!L.whitened && !emb.generic && emb.src) out.push('the image style ' + (emb.inked ? 'carries' : 'has no') + ' white filter and the look says whitened ' + !!L.whitened);
  if (emb.inked && A.exists) {
    const inks = (A.colours || []).filter((c) => !/^#F[C-F]F[C-F]F[C-F]$/i.test(c));
    if (!A.colours) out.push('a raster emblem inked white');
    else if (inks.length > 1) out.push('an emblem of ' + inks.length + ' colours inked white: ' + inks.join(' '));
  }
  if (A.exists && accent.toUpperCase() === '#0033A1') out.push('no colour of its own: the fallback blue beside its art');
  // THE BOARDING SHELF: the same emblem orb beside five badges of its own. A carrier the
  // stylesheet paints is left to the stylesheet there too, unless its row names an ink (PAL): the
  // shelf then writes that ink, and it is judged against the ground the row records.
  if (L.css && (LOOKS[L.carrier] || {}).ink) {
    const sInk = styleProp(O.shelf(code).badge, 'color');
    if (!same(sInk, L.ink)) out.push('the shelf inks its glyphs ' + sInk + ', the look says ' + L.ink);
    if (contrast(full(sInk), L.ground) < 3) out.push('the shelf glyphs ' + sInk + ' on ' + L.ground + ' read at ' + contrast(full(sInk), L.ground).toFixed(2) + ' to 1');
  }
  if (!L.css && HEX.test(full(top))) {
    const S = O.shelf(code);
    const sBg = styleProp(S.badge, 'background'), sInk = styleProp(S.badge, 'color'), sbg = isVar(sBg) ? accent : sBg;
    const oBg = styleProp(S.orb.badge, 'background'), obg = code === 'F8' ? '#7AFF94' : HEX.test(full(oBg)) ? oBg : isVar(oBg) ? accent : top;
    if ((S.orb.path || '') !== (L.art || '')) out.push('the boarding shelf draws ' + (S.orb.path || 'no file') + ', the rail ' + (L.art || 'none'));
    if (!HEX.test(full(sbg))) out.push('the shelf badges are no colour: ' + sBg);
    else {
      if (dE(sbg, obg) >= 6) out.push('the boarding shelf is two colours: its orb ' + obg + ', its five badges ' + sbg + ' (dE ' + dE(sbg, obg).toFixed(1) + ')');
      if (contrast(sInk, sbg) < 3) out.push('the shelf glyphs ' + sInk + ' on ' + sbg + ' read at ' + contrast(sInk, sbg).toFixed(2) + ' to 1');
    }
  }
  // THE YOUR AIRCRAFT ORB, when the carrier flies its own leg: the top orb again.
  const own = orbFacts(W._gateCardOrb(code, '').html);
  if (own.src !== (L.art || '')) out.push('the Your Aircraft orb draws ' + (own.src || 'no file') + ', the top orb ' + (L.art || 'none'));
  if (own.src && own.inked !== emb.inked) out.push('the Your Aircraft orb and the top orb differ on the white filter');
  if (!L.css && HEX.test(full(own.bg)) && HEX.test(full(top)) && dE(own.bg, top) >= 6) {
    out.push('the Your Aircraft orb is ' + own.bg + ' beside a column of ' + top + ' (dE ' + dE(own.bg, top).toFixed(1) + ')');
  }
  return out;
}

// ── THE LEDGER ─────────────────────────────────────────────────────────────
// Every carrier whose gate does not obey the rules, by code, with the reason.
// Nothing is skipped: a code here must still break a rule, so the day its art
// arrives this test fails until the code leaves the ledger.
const NO_ART = 'no emblem, tile or symbol on disk under this code, and none the tile folder names for it: the file the top orb asks for was never drawn, so it letters its code (on a white disc where its column is white) until art is supplied';
// Seven codes have a finished tile on disk. MANIFEST.csv, the list of the tile folder itself,
// names the file for the code, and the script lists its ground. No table points the code at it
// because nobody has checked that label against the airline (two of the eight labels the folder
// gives are wrong: see XR). The reason is that, not a missing file.
const TILE_UNCHECKED = 'a finished tile is on disk for this code (MANIFEST.csv names it), but its label has not been checked against the airline, so no table points the gate at it: the top orb letters the code until someone confirms the tile';
const GRADIENT = 'WZZ.svg is a gradient, the magenta of Wizz down to its blue: no single ground a disc could match. The five badges take the magenta end, the value of the accent table. It needs a mark on one ground.';
const LEDGER = {
  // BACK IN THE LEDGER WITH THE DARK PLATE. These four were white columns for one round, their tile
  // a round inset where its ground had nothing to match. On the dark plate each keeps its own discs
  // and its own top orb, so each is again the case it was: a tile that fills the orb and gives five
  // badges no single ground. Austrian and Wizz are drawn so on the dark plate by decision: the tile
  // fills the orb as it is, and the white column they had for one round is not what the dark plate is for.
  'LL': 'level-emblem.svg is half cyan and half green: no single ground. It needs a mark on one ground from the airline.',
  'W6': GRADIENT, 'W4': GRADIENT,
  // Austrian: the red of its tile holds two thirds of the rim; a white band crosses the rest and
  // fills more of the disc than the red does. Beside five red discs the orb reads half white.
  'OS': 'AUA.svg is red on two thirds of its rim only: a white band carries the chevron across it, and white fills more of the disc than the red. No ground the badges could take; no other Austrian mark is on disk. It needs a mark on a full red ground.',
  // Lufthansa: its navy discs stand out on its gold picture, so the rail is as it was drawn. Its
  // Your Aircraft orb sits on the navy of its lower right panel, and that navy is as dark as any
  // panel that can carry the words (it sinks into the charcoal too, 12 apart), so no panel helps:
  // the orb alone is white, the crane in its navy. Two colours on one gate, on purpose.
  'LH': 'the Your Aircraft orb is white, the crane in its navy, beside a rail of navy discs: its navy sinks into every panel dark enough to carry the words of the lower right panel, so the orb takes the white disc there and the rail keeps what it drew on its gold picture',
  'ZP': 'ZP.svg is half clear and Paranair has no colour on file: it needs its red confirmed and a mark on a finished ground.',
  // Rouge as a row code: the column is the red of Air Canada, and the Your Aircraft orb keeps the
  // burgundy recorded for Rouge at v23260 (the ink of its script, bottom-right card only).
  'RV': 'the Your Aircraft orb keeps the Rouge burgundy #A21C37, a recorded choice (v23260), beside a column in the red of Air Canada: two colours on purpose, and the same orb an Air Canada gate shows when Rouge operates the leg',
  'VB': 'VivaAerobus has an emblem on disk (a .webp, which this test cannot read) but no colour confirmed from the airline: nothing points its orb at the emblem until its green is known.',
  'XR': 'MANIFEST.csv names PAO.svg for this code, but that tile is labelled for another operator (a Polish one), not Corendon: no art on disk for it',
  // Approved as drawn, and not to be changed: a white mark and white glyphs on the blue of the
  // brand, under the 3 to 1 floor (Transat 2.41, WestJet 2.64), on the rail and on the shelf.
  'TS': 'approved as drawn the day before this audit: the white star and white glyphs on Transat blue',
  'WS': 'the sanctioned white leaf and white glyphs on WestJet teal (WestJet Encore, WR, wears the same)'
};
// EIGHT CODES ARE OUT OF THE LEDGER BY RULE 6, and none of them got new art. Each was there because
// no single ground could be read off its art for five badges to match, or because it had no art
// and drew the generic plane. Their discs are too dark for the dark plate (the navy of Pacific
// Coastal, the blue of no airline), so their columns are white, and a white column asks nothing of
// the art but to sit inside a white disc:
//   a tile of two grounds is a round inset inside the white ring (Pacific Coastal, two halves);
//   a code with no art at all letters itself in the colour of its gate (the five regionals that
//     fly in the livery of a mainline, and the two the airport files under three letters).
const WHITE_SETTLED = { inset: ['8P'], letters: ['BBQ', 'C5', 'CP', 'G7', 'WAL', 'YX', 'ZW'] };
const UNCHECKED_TILES = { BG: 'BBC', BI: 'RBA', BY: 'TOM', KA: 'CRK', NK: 'NKS', NO: 'NOS', QS: 'TVS' };
for (const c of Object.keys(UNCHECKED_TILES)) LEDGER[c] = TILE_UNCHECKED;
for (const c of ('2T 3K 4B 4T 5F 7F 8M 8T 9C 9K AN AX BJ BM DO EM EV FD GM H2 H4 IV JA KG KM KO LF LR MT N0 NF OK '
  + 'P4 PA PJ RP S5 SM TB W3 W8 WG WL XC XN Z0 ZG ZH').split(' ')) LEDGER[c] = NO_ART;
// named since (the airlines every row now names, tests/airline-names-every-row.test.js): a name, and
// no art yet under the code
// (0N and WP are North Star Air and Wasaya, whose art is filed under NSA and WT: to be pointed there)
for (const c of '0N 3U 4O D7 FC FP G6 HF HO HX IZ JD KP OD QN SB TW VF VJ WP'.split(' ')) LEDGER[c] = NO_ART;
LEDGER.FB = 'the tile folder names two tiles for this code (BRU.svg and LZB.svg), one of them under another airline\'s designator; neither label has been checked against the airline, so nothing points the gate at one: the letters of the code until someone confirms which is Bulgaria Air\'s';

// The rail draws the mark of Flair as the plain green disc, with no file inside: the file its look
// names is that same dot (v23130). The one carrier whose top orb holds no image by design.
const PLAIN_DISC = ['F8'];

test('every carrier the name tables know: one colour down the column, an ink that reads, no emblem inked white', () => {
  assert.ok(CODES.length >= 227, CODES.length + ' codes in the name tables');
  const wrong = [], stale = [];
  for (const code of CODES) {
    const b = broken(code).filter((s) => !(PLAIN_DISC.includes(code) && /^the top orb draws no file/.test(s)));
    if (LEDGER[code]) { if (!b.length) stale.push(code + ' now obeys every rule: take it out of the ledger'); continue; }
    if (b.length) wrong.push(code + ' (' + (O.NAME2[code] || O.NAME[code]) + '): ' + b.join('; '));
  }
  assert.deepEqual(wrong, [], wrong.length + ' gates break a rule:\n' + wrong.join('\n'));
  assert.deepEqual(stale, [], stale.join('\n'));
  for (const code of Object.keys(LEDGER)) assert.ok(CODES.includes(code), code + ' in the ledger is a code the name tables know');
  // the plain disc is what it claims: the ground of the look, no image, no letters
  for (const code of PLAIN_DISC) {
    const { emb, L } = column(code);
    assert.ok(same(emb.bg, L.ground) && !emb.src && !emb.letters && !emb.generic, code);
  }
});

test('the test reads what the gate writes: the markup of each builder, not a value handed back', () => {
  // the lines were cut from the source and they ran: each gives markup with a box, a background and a file
  for (const code of ['AC', 'IB', 'KE', 'BA', 'TS', 'DL', 'ZZ']) {
    const { emb, badge } = column(code);
    assert.ok(emb.cls.includes('v2-fi-emblem-wrap') && emb.bg, code + ' top orb: ' + emb.cls + ' / ' + emb.bg);
    assert.ok(badge.bg && badge.ink, code + ' badges');
    const own = orbFacts(W._gateCardOrb(code, '').html);
    assert.ok(own.cls.includes('v2-fi-orbwrap') && own.bg, code + ' Your Aircraft orb');
  }
  // an accent disc is written as the accent variable, a tile that stands out on its card as a clear
  // box (on the shade of its own colour, or on the dark plate), a brand on its ground as that
  // ground, a column rule 6 made white as the one white
  assert.ok(isVar(column('AC').emb.bg) && isVar(column('AC').badge.bg));
  assert.deepEqual([column('BT').emb.bg, column('BT').emb.fit, column('BT').badge.bg], ['transparent', 'cover', W._ORB_TILE_GROUNDS.BTI]);
  assert.deepEqual([column('IB').emb.bg, column('IB').emb.fit, column('IB').emb.pad, column('IB').badge.bg], ['transparent', 'cover', '0', W._ORB_TILE_GROUNDS.IBE]);
  assert.deepEqual([column('AY').emb.bg, column('AY').emb.fit, column('AY').emb.pad, column('AY').badge.bg], [THE_WHITE, 'cover', RING, THE_WHITE]);
  assert.deepEqual([column('KE').emb.bg, column('KE').badge.bg], ['#FFFFFF', '#FFFFFF']);
  assert.deepEqual([column('BA').emb.bg, column('BA').badge.bg], [THE_WHITE, THE_WHITE]);
  // and the white filter is read off the image: on for a mark of one colour, off for a colour emblem
  assert.equal(column('AC').emb.inked, true);
  for (const code of ['BA', 'AF', 'KE', 'TS', 'IB']) assert.equal(column(code).emb.inked, false, code);
  // the filter in the written style is the whitened flag, for every code with an image
  let n = 0;
  for (const code of CODES) {
    const { emb, L } = column(code);
    if (!emb.src) continue;
    n++;
    assert.equal(emb.inked, !!L.whitened, code + ': ' + emb.imgStyle);
    assert.equal(/invert\(1\)/.test(W._gateOrbParts(code).imgStyle), !!L.whitened, code + ' recipe');
  }
  assert.ok(n >= 220, n + ' codes with an image');
});

test('the ledger says why, and its kinds are what they claim', () => {
  for (const [code, why] of Object.entries(LEDGER)) assert.ok(why.length > 40, code + ' has a reason');
  const kinds = (code) => broken(code).map((s) => s.split(':')[0]);
  // no art: the only rule broken is the missing art
  const none = Object.keys(LEDGER).filter((c) => LEDGER[c] === NO_ART);
  assert.equal(none.length, 68, 'codes with no art of any kind');
  for (const code of none.concat(['XR'])) {
    assert.deepEqual(kinds(code), ['the orb art is not on disk'], code);
    // and the tile folder names nothing for it, or names the tile of another operator
    const rows = MANIFEST.split('\n').filter((l) => l.split(',')[1] === code);
    if (code === 'XR') assert.ok(rows.length === 1 && /Polish/.test(rows[0]) && !/Corendon/i.test(rows[0]), rows.join());
    else assert.deepEqual(rows, [], code + ' has no row in MANIFEST.csv');
  }
  // a tile on disk whose label is unchecked: the folder names it, the file is there, the script
  // lists its ground, and still nothing points the gate at it
  for (const [code, tile] of Object.entries(UNCHECKED_TILES)) {
    assert.deepEqual(kinds(code), ['the orb art is not on disk'], code);
    const row = MANIFEST.split('\n').find((l) => l.split(',')[1] === code);
    assert.ok(row && row.split(',')[0] === tile && row.trim().endsWith(',' + tile + '.svg'), code + ': ' + row);
    assert.ok(fs.existsSync(path.join(FC, 'logos/airline-tiles', tile + '.svg')), tile + '.svg is on disk');
    assert.match(W._ORB_TILE_GROUNDS[tile], /^#[0-9A-F]{6}$/, tile + ' has a ground in the generated table');
    assert.equal(O.TILE[code], undefined, code + ': no table points at it');
    assert.equal(LOOKS[code], undefined, code);
  }
  // approved as drawn: the only rule broken is the 3 to 1 floor, on the rail and on the shelf, and white is still above 2.4
  for (const code of ['TS', 'WS']) {
    const b = broken(code), L = W._gateColumnLook(code);
    assert.ok(b.length === 3 && b.every((s) => / read at /.test(s)), code + ': ' + b.join('; '));
    assert.ok(contrast('#FFFFFF', L.ground) >= 2.4, code);
  }
  // Rouge: one break, the recorded burgundy of its Your Aircraft orb
  assert.deepEqual(broken('RV'), ['the Your Aircraft orb is #A21C37 beside a column of ' + O.ACCENT.RV + ' (dE ' + dE('#A21C37', O.ACCENT.RV).toFixed(1) + ')']);
  assert.equal(W._CARD_ORB_GROUND.RV, '#A21C37');
  // Austrian: one break, the rim of its tile
  assert.deepEqual(kinds('OS'), ['the orb art shows #D81E05 on 67% of its rim']);
  // Wizz: one break, the gradient
  for (const code of ['W6', 'W4']) assert.deepEqual(kinds(code), ['the orb art has a gradient at its rim'], code);
  // two grounds
  assert.ok(broken('LL').length === 3 && broken('LL').every((s) => /two colours/.test(s)), 'LL: ' + broken('LL').join('; '));
  // these four are on the dark plate with their own discs, which is why their art is asked again
  for (const code of ['OS', 'W6', 'W4', 'LL']) assert.deepEqual([W._gateCardPaint(code).kind, column(code).L.white], ['dark', false], code);
  // Lufthansa: two breaks, both its Your Aircraft orb, white beside a navy rail
  assert.deepEqual(broken('LH'), ['the Your Aircraft orb and the top orb differ on the white filter',
    'the Your Aircraft orb is #FFFFFF beside a column of ' + O.ACCENT.LH + ' (dE ' + dE(THE_WHITE, O.ACCENT.LH).toFixed(1) + ')']);
  // THE CODES RULE 6 SETTLED. Each obeys every rule now, and each is still the case it was: the art
  // has no single ground, or there is no art.
  for (const code of WHITE_SETTLED.inset.concat(WHITE_SETTLED.letters)) {
    assert.equal(LEDGER[code], undefined, code + ' is out of the ledger');
    assert.deepEqual(broken(code), [], code);
    assert.equal(column(code).L.white, true, code + ': its column is white');
  }
  // Austrian: red on two thirds of its rim, white filling more of the disc than the red
  const os = art(LOOKS.OS.art);
  assert.ok(os.rim === '#D81E05' && os.rimShare < 0.75 && os.main === '#FFFFFF', 'AUA.svg: ' + os.rim + ' on ' + os.rimShare.toFixed(2) + ' of its rim');
  // Wizz: a gradient at its rim; Pacific Coastal and LEVEL: no ground the script could certify
  assert.ok(art(LOOKS.W6.art).rampShare > 0.9);
  for (const code of ['8P', 'LL']) assert.equal(W._gateOrbNatural(code).ground, '', code + ': the recipe of its art names no ground');
  // Pacific Coastal is white because its navy would sink into the dark plate too
  assert.ok(!clear(O.accent('8P'), screened(HOUSE_DARK)) && contrast(O.accent('8P'), screened(HOUSE_DARK)) < 1.5, '8P: ' + O.accent('8P'));
  // as a round inset the ground of the tile no longer has to match anything: the disc is white
  for (const code of WHITE_SETTLED.inset) {
    const { emb, badge, A } = column(code);
    assert.ok(A.exists, code);
    assert.deepEqual([emb.bg, emb.pad, emb.fit, emb.native, badge.bg], [THE_WHITE, RING, 'cover', false, THE_WHITE], code);
    assert.match(emb.imgStyle, /border-radius:50%;/, code);
  }
  // no art at all: the letters of the code, in an ink that reads, written to win over the stylesheet
  for (const code of WHITE_SETTLED.letters) {
    const { emb, L } = column(code);
    assert.deepEqual([L.art, L.letters, emb.src, emb.letters, emb.bg, emb.generic], ['', '', '', lettersOf(code), THE_WHITE, false], code);
    assert.ok(same(emb.lettersInk, L.ink) && contrast(full(emb.lettersInk), THE_WHITE) >= 3 && inkWins(emb.lettersStyle, true), code + ': ' + emb.lettersStyle);
    assert.equal(orbFacts(W._gateCardOrb(code, '').html).letters, lettersOf(code), code + ': the Your Aircraft orb');
    assert.equal(orbFacts('<div class="x" style="' + O.shelf(code).orb.badge + '">' + O.shelf(code).icon + '</div>').letters, lettersOf(code), code + ': the boarding shelf');
  }
  // and the five regionals still leave the Your Aircraft orb to the gate carrier when they operate a leg
  for (const code of ['YX', 'G7', 'ZW', 'C5', 'CP']) assert.equal(LOOKS[code].none, 1, code);
});

// ── the table the script writes ────────────────────────────────────────────
test('the tables of tile grounds and of lettered tiles are what the tiles on disk give', () => {
  const blk = GEN.readBlock(CORE);
  assert.ok(blk, 'the markers the script writes between');
  assert.equal(blk.text, GEN.render(GEN.tileGrounds(), GEN.tileLetters()), 'run: node scripts/orbs/tile-grounds.js');
  const T = W._ORB_TILE_GROUNDS;
  assert.ok(Object.keys(T).length > 250, Object.keys(T).length + ' tiles with a rim of one colour');
  for (const [name, g] of Object.entries(T)) assert.match(g, /^#[0-9A-F]{6}$/, name);
  // a split ground, a clear surround and a rim the mark crosses are left out
  for (const name of ['PCO', 'ASL', 'AUA', 'QTR', 'CMP', 'PB-arrow', 'TSC-star-white']) assert.equal(T[name], undefined, name);
  assert.ok(CORE.indexOf('window._ORB_TILE_GROUNDS = {') < CORE.indexOf('window._gateOrbNatural = function (code) {'), 'made before the recipe that reads it');
});

test('a tile whose ground is a gradient is not listed: no flat disc equals a ramp', () => {
  const T = W._ORB_TILE_GROUNDS;
  // Wizz runs magenta to blue, Qantas two reds eleven apart, Hawaiian fuchsia to purple
  for (const name of ['WZZ', 'QFA', 'HAL']) {
    assert.equal(T[name], undefined, name + ' is not in the table');
    const svg = fs.readFileSync(path.join(GEN.TILES, name + '.svg'), 'utf8');
    assert.equal(GEN.rimGround(svg), null, name);
    assert.ok(art('/logos/airline-tiles/' + name + '.svg').rampShare > 0.9, name + ': its rim is the ramp');
  }
  // the rule, on drawings made here: a ramp whose stops are far apart is refused, one whose stops are one colour is read
  const tile = (a, b) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs><path fill="url(#g)" d="M0 0h100v100H0z"/><path fill="#fff" d="M40 40h20v20H40z"/></svg>';
  assert.equal(GEN.rimGround(tile('#CD2B86', '#161998')), null, 'magenta to blue');
  assert.equal(GEN.rimGround(tile('#FF0000', '#BE0000')), null, 'two reds 13 apart');
  assert.ok(GEN.spread(['#DC1C2E', '#D91B2C']) < 6);
  assert.match(GEN.rimGround(tile('#DC1C2E', '#D91B2C')), /^#D[9C]1[BC]2[CE]$/, 'stops within 6 are one colour');
  // a flat ground with a gradient mark inside it is still listed: the rim is the ground, not the ramp
  for (const name of ['CAL', 'AAL', 'IBE', 'SWA']) assert.match(T[name], /^#[0-9A-F]{6}$/, name);
  // and no carrier takes a ramp as the ground of its discs unseen: a tile whose rim is a ramp is a
  // round inset inside a white disc, where its ground has nothing to match, or it fills its orb
  // beside five badges and is in the ledger with that reason
  let ramps = 0;
  for (const code of CODES) {
    const { L, P, A } = column(code);
    if (!/\/airline-tiles\/[^/]+\.svg/.test(L.art || '') || !A.exists) continue;
    // (the glossy orb of Alaska shades its own rim and gives no ground: its badges are discs of the accent)
    if (!(A.rampShare > 0.5) || (P.native && !P.ground)) continue;
    ramps++;
    if (L.white) assert.ok(L.inset && same(L.ground, THE_WHITE), code + ': ' + L.art + ' is an inset');
    else assert.equal(LEDGER[code], GRADIENT, code + ': ' + L.art);
  }
  assert.equal(ramps, 2, ramps + ' gates draw a tile with a gradient rim');
  // Qantas, decided by hand from art on disk: its mark of one colour, white on the red it publishes.
  // That red sinks into the maroon its card was, so the card is the dark plate and the red stays.
  assert.deepEqual([column('QF').L.art, column('QF').L.ground, column('QF').emb.inked, W._gateCardPaint('QF').kind], ['/logos/symbols/airlines/QF-mono.svg', '#DF0000', true, 'dark']);
  assert.deepEqual(art('/logos/symbols/airlines/QF-mono.svg').colours, ['#000000'], 'one colour');
  assert.ok(contrast('#FFFFFF', '#DF0000') >= 4.5);
  // The mark is one black, drawn to be inked white, and would be a black tail on a white disc: where
  // an orb of Qantas is drawn white (on the panel of another gate that its red would sink into), the
  // white disc takes its finished tile, the white kangaroo on the red of the tail, as a round inset.
  const qfW = W._gateOrbWhite('QF', W._gateOrbNatural('QF'), O.ACCENT.QF);
  assert.deepEqual([qfW.path, qfW.inset, qfW.ground, qfW.ink], ['/logos/airline-tiles/QFA.svg', true, THE_WHITE, O.ACCENT.QF]);
  // Hawaiian draws its emblem on the light disc, and nothing on the gate reads the ground of its tile
  assert.deepEqual([column('HA').L.art, column('HA').L.ground], ['/logos/airlines/us-major/hawaiian-pualani.svg', THE_WHITE]);
  // Wizz: the gradient tile fills the orb, and the five badges take the magenta end
  for (const code of ['W6', 'W4']) assert.deepEqual([column(code).L.art, column(code).L.ground, column(code).badgeBg], ['/logos/airline-tiles/WZZ.svg', O.ACCENT.W6, O.ACCENT.W6], code);
});

test('a carrier with no emblem and a finished tile draws the tile in both orbs, and its badges take the ground of the tile', () => {
  // THE RECIPE OF THE ART: the tile is the disc, and its ground is the ground the script read.
  // WHAT IS PAINTED: where that ground stands out on the card of the gate (the shade of its own
  // colour, or the dark plate it took because it sank there), the tile fills a clear box and the
  // five badges take its ground, the same string; where it would sink into the dark plate too
  // (rule 6), the tile is a round inset inside a white ring and the five badges are that white.
  let n = 0, fills = 0, insets = 0;
  for (const code of CODES) {
    const { L, P, emb, badge } = column(code), N = W._gateOrbNatural(code);
    const m = /^\/logos\/airline-tiles\/([^/?]+)\.svg/.exec(N.path || '');
    if (!m || !W._ORB_TILE_GROUNDS[m[1]] || L.css) continue;
    const row = LOOKS[L.carrier] || {};
    if (row.ground || row.whiteArt) continue;
    n++;
    const g = W._ORB_TILE_GROUNDS[m[1]];
    assert.deepEqual([N.native, N.ground], [true, g], code + ': by its art the tile fills the orb, on the ground of ' + m[1] + '.svg');
    assert.equal(emb.src, N.path, code + ': the top orb draws that tile');
    assert.equal(emb.inked, false, code + ': never inked');
    // the rim of the file, read here, is that ground
    const A = art(L.art);
    assert.ok(dE(A.rim, g) < 6 && A.rimShare >= 0.9, code + ': ' + A.rim + ' on ' + A.rimShare.toFixed(2) + ' of the rim of ' + m[1]);
    if (L.white) {
      insets++;
      assert.deepEqual([emb.bg, emb.pad, emb.fit, emb.native, badge.bg], [THE_WHITE, RING, 'cover', false, THE_WHITE], code + ': a round inset inside a white ring, five white badges');
      assert.ok(W._gateCardPaint(code).at.some((p) => sinks(g, p)), code + ': ' + g + ' would sink into its card');
      if (W._gateCardPaint(code).kind !== 'picture') assert.ok(!clear(g, screened(HOUSE_DARK)), code + ': and ' + g + ' does not stand clear of the dark plate');
    } else {
      fills++;
      assert.equal(badge.bg, g, code + ': the badges the rail writes are the ground of ' + m[1] + '.svg, the same string');
      assert.equal(P.native, true, code + ': the tile fills the orb');
      assert.deepEqual([emb.bg, emb.fit], ['transparent', 'cover'], code + ': a clear box, the tile to its edge');
    }
  }
  assert.ok(n >= 85 && fills >= 65 && insets >= 15, n + ' carriers wear their finished tile: ' + fills + ' fill the orb, ' + insets + ' sit inside a white ring');
  // the ones the audit named: a generic white plane before
  for (const [code, tile] of [['AZ', 'ITY'], ['B6', 'JBU'], ['NH', 'ANA'], ['DY', 'NAX'], ['U2', 'EZY'], ['BT', 'BTI'], ['SK', 'SAS']]) {
    assert.equal(O.art(code), '/logos/airline-tiles/' + tile + '.svg', code);
    assert.equal(column(code).emb.src, '/logos/airline-tiles/' + tile + '.svg', code + ' top orb');
    assert.equal(orbFacts(W._gateCardOrb(code, '').html).src, '/logos/airline-tiles/' + tile + '.svg', code + ' Your Aircraft orb');
  }
});

// ── the tile first is a rule of the gate orbs only ─────────────────────────
test('the finished tile first belongs to the gate orbs: the plates, the notice and the standby card resolve the mark as they did', () => {
  // the 34 carriers with a symbol of their own on disk: the shared resolver hands back that symbol
  const THE34 = '6E A3 AH AI AT AV CM CX DE EI EK EW FI GA HV IB JL JQ KC KL KQ KU LO MH MO PC SN SQ SV TP VA VN WY XY'.split(' ');
  for (const code of THE34) {
    const sym = '/logos/symbols/airlines/' + code + '.svg';
    assert.equal(O.emblem(code), O.TOP[code] || O.FILES[code] || sym, code + ': the shared resolver');
    assert.doesNotMatch(O.emblem(code), /\/airline-tiles\//, code + ': its mark, never its tile');
    assert.ok(fs.existsSync(path.join(FC, O.emblem(code).split('?')[0])), code + ': ' + O.emblem(code));
    assert.equal(W._gateOrbParts(code, true).path, O.emblem(code), code + ': the recipe asked for the mark gives the same file');
    assert.match(O.art(code), /^\/logos\/airline-tiles\//, code + ': the gate orb draws its tile');
  }
  // the shared resolver holds no step of the orbs: no row of the table of looks, no tile table
  const shared = block('function _airlineOrbEmblem(code) {');
  assert.doesNotMatch(shared, /_GATE_ORB_LOOKS|IATA_TO_TILE_ICAO|_ORB_TILE_GROUNDS/);
  // the plates ask it through the one function of the plates (the table of the plate first, for the
  // code or for the carrier it folds to), the notice and the standby card ask the recipe for the mark
  for (const v of ['_holdCode, _HOLD_MARK', '_fallbackCode', '_mapLifeCode, _MAPLIFE_EMBLEM']) assert.ok(CORE.includes('_plateEmblem(' + v + ')'), v);
  assert.match(block('function _plateEmblem(code, marks) {'), /\(marks && \(marks\[given\] \|\| marks\[_orbEmblemCarrier\(given\)\]\)\) \|\| _airlineOrbEmblem\(given\)/);
  for (const code of THE34) assert.equal(O.plate(code), O.emblem(code), code + ': the plate draws the file of the shared resolver');
  assert.match(block('function _gateChangeOrbHtml(code) {'), /window\._gateOrbParts\(c, true\)/);
  assert.match(block('function _gateCardEmblem(code) {'), /window\._gateOrbParts\(code, true\)/);
  // and the orbs ask the orb resolver: the recipe, and through it the rail, both builders, the pass and the shelf
  assert.match(block('window._gateOrbNatural = function'), /\(\(!plain && typeof _gateOrbArt === 'function'\) \? _gateOrbArt\(c\)/);
  assert.match(block('window._gateOrbParts = function'), /if \(arguments\.length > 1 && arguments\[1\]\) return window\._gateOrbNatural\(code, true\);/, 'asked for the mark, the recipe of the art answers, untouched by rule 6');
  assert.match(RAIL_HEAD + block('function _emblemImg(code, rowCode) {'), /path = _railParts\.path;/);
  for (const src of [MC_VARS, NI_VARS, PASS]) assert.match(src, /window\._gateCardOrb\(/);
  assert.doesNotMatch(MC_VARS + NI_VARS + PASS + SHELF_ORB, /_airlineOrbEmblem\(/, 'no orb asks the shared resolver');
  // a symbol that is a disc is still drawn as one where the symbol is what is drawn
  for (const code of ['EW', 'LO', 'DE', 'A3', 'PC', 'CM', 'MO', 'HV', 'JL']) assert.equal(W._gateOrbParts(code, true).native, true, code);
});

test('a code with an emblem row of its own keeps that file where the fold leaves it none: easyJet under EZY', () => {
  // EZY has a row (Edinburgh sends designators) and folds to U2, which has none. The shared resolver
  // guessed a U2 symbol that was never drawn: the centre cards drew nothing, and the plates and the
  // notice asked for a missing file before they found the tile.
  const tile = '/logos/airline-tiles/EZY.svg';
  assert.deepEqual([O.fold('EZY'), O.FILES.EZY, O.FILES.U2, O.TOP.U2], ['U2', tile, undefined, undefined]);
  assert.ok(!fs.existsSync(path.join(FC, 'logos/symbols/airlines/U2.svg')) && fs.existsSync(path.join(FC, tile)));
  assert.equal(O.emblem('EZY'), tile, 'the shared resolver');
  assert.equal(O.plate('EZY'), tile, 'the plates');
  assert.deepEqual([W._gateOrbParts('EZY', true).path, W._gateOrbParts('EZY', true).native], [tile, true], 'the recipe asked for the mark: the notice and the centre cards');
  // every surface that is not an orb draws the tile first time, with no missing file before it
  assert.deepEqual(SHOWN.shown('EZY'), ['airline-tiles/EZY.svg', 'airline-tiles/EZY.svg', 'airline-tiles/EZY.svg', 'airline-tiles/EZY.svg filling the orb', 'airline-tiles/EZY.svg']);
  // and the gate orbs draw the same file, through the fold
  assert.equal(column('EZY').emb.src, tile);
  assert.match(block('window._gateOrbNatural = function'), /_airlineOrbEmblem\(plain \? code : c\)/, 'the recipe hands the resolver the code as it was given');
  // THE SCAN OF BOTH EMBLEM TABLES: every code with a row that folds to another code draws a file that
  // is on disk, the row of its carrier where the carrier has one, else its own. EZY is the only one
  // whose carrier has none.
  const lost = [];
  let n = 0;
  for (const k of [...new Set([...Object.keys(O.FILES), ...Object.keys(O.TOP)])].sort()) {
    const f = O.fold(k);
    if (f === k) continue;
    n++;
    const own = O.TOP[k] || O.FILES[k], carrier = O.TOP[f] || O.FILES[f] || '', tb = W._BADGE_TILE_BRANDS[f];
    if (!carrier) lost.push(k);
    assert.equal(O.emblem(k), (tb && tb.bg && tb.icon) || carrier || own, k);
    assert.ok(fs.existsSync(path.join(FC, O.emblem(k).split('?')[0])), k + ': ' + O.emblem(k));
    for (const text of SHOWN.shown(k)) assert.doesNotMatch(text, /^nothing|^letters|after a miss/, k + ': ' + text);
  }
  assert.ok(n >= 15, n + ' codes with a row that fold');
  assert.deepEqual(lost, ['EZY']);
});

// ── what the plates, the notice and the centre cards draw, against origin/main ──
// The gate orbs changed for every airline. Five surfaces that show the mark of a carrier without
// being one of its orbs were to keep what they drew: the sky plate, the plate of last resort, the
// map hold, the orb of the gate change notice, the emblem of the centre cards. They do, but for
// the differences of these kinds, each of which is wanted. tests/fixtures/gate-marks-origin-main.json
// holds what the commit this work started from showed for every code (made by
// scripts/orbs/marks-shown.js from the fids-core.js of that commit) and ONE TABLE of the
// differences that are kept: the surfaces, the code, what that commit showed, what is shown now,
// and the kind. A difference no row names fails here, and so does a row that no longer differs.
const KEPT_KINDS = {
  'designator': 'a three-letter designator in the airline slot draws what its carrier draws, where it drew its own letters or nothing',
  'partner': 'a regional that prints its partner wears the partner: Endeavor wears Delta, Ryanair UK the harp, PAL under SP is PAL, Volaris Costa Rica wears the Volaris star',
  'white outside': 'white outside with the mark in its colours inside, as on its gate, where the mark was inked white on the accent (Starlux, Korean, Asiana) or sat in colour on it (Caribbean, Thai)',
  'own colours': 'Virgin Atlantic in its colours, where it was inked white',
  'line mark': 'Lufthansa and TAROM: a line mark of one navy, white on a disc of that navy and white on the dark frame of the cards, where it was navy lines in a clear box and on the dark frame',
  'own letters': 'a code whose only tile is the placeholder of another code letters itself: Norwegian under D8 and DI drew the tile that prints DY'
};

test('the plates, the notice and the centre cards draw what origin/main drew, but for the differences kept in one table, by code', () => {
  const REC = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gate-marks-origin-main.json'), 'utf8'));
  assert.deepEqual(REC.surfaces, MARKS.SURFACES);
  const codes = Object.keys(REC.main);
  // every code a table named that day: a code that joins the tables later has no origin/main to differ
  // from, and is held by the two rules below (nothing for another code, no placeholder of another code)
  assert.ok(codes.length >= 390, codes.length + ' codes in the record');
  // the table, opened into one row per surface and code
  const kept = new Map();
  for (const row of REC.kept) {
    assert.equal(row.length, 5, JSON.stringify(row));
    const [surfaces, code, was, now, kind] = row;
    assert.ok(KEPT_KINDS[kind], code + ': a kind this test knows, not ' + kind);
    assert.ok(REC.main[code], code + ' is a code of the record');
    assert.notEqual(was, now, code + ': a row of the table is a difference');
    for (const surface of surfaces.split(', ')) {
      assert.ok(MARKS.SURFACES.includes(surface), code + ': ' + surface);
      assert.ok(!kept.has(surface + ' | ' + code), code + ' has two rows for the ' + surface);
      kept.set(surface + ' | ' + code, { surface, code, was, now, kind });
    }
  }
  // EVERY CODE ON EVERY SURFACE, as the tree draws it now
  const unseen = [], gone = [], moved = [], cells = [];
  for (const code of codes) {
    const now = SHOWN.shown(code);
    MARKS.SURFACES.forEach((surface, i) => {
      const was = REC.main[code][i], row = kept.get(surface + ' | ' + code);
      cells.push({ surface, code, was, now: now[i], row });
      if (!row) { if (now[i] !== was) unseen.push(JSON.stringify([surface, code, was, now[i]])); return; }
      assert.equal(row.was, was, code + ', ' + surface + ': the row says what the record says origin/main showed');
      if (now[i] === was) gone.push(JSON.stringify([surface, code, was]));
      else if (now[i] !== row.now) moved.push(JSON.stringify([surface, code, row.now, now[i]]));
    });
  }
  assert.deepEqual(unseen, [], unseen.length + ' differences from origin/main that no row of the table names (surface, code, origin/main, now):\n' + unseen.join('\n'));
  assert.deepEqual(gone, [], gone.length + ' rows of the table no longer differ from origin/main: take them out\n' + gone.join('\n'));
  assert.deepEqual(moved, [], moved.length + ' rows of the table draw something else now (surface, code, the row, now):\n' + moved.join('\n'));

  // NOTHING THAT WAS DRAWN BECAME NOTHING, on any surface, for any code
  const drawn = (text) => !/^nothing|^an empty disc/.test(text);
  for (const c of cells) assert.ok(!drawn(c.was) || drawn(c.now), c.code + ', ' + c.surface + ': ' + c.was + ' became ' + c.now);
  // AND NO SURFACE SHOWS THE PLACEHOLDER OF ANOTHER CODE: a lettered tile only for the code it letters,
  // for every code of the record and every code a table names today
  for (const code of [...new Set([...codes, ...SHOWN.codes()])]) {
    SHOWN.shown(code).forEach((text, i) => {
      const m = /airline-tiles\/([^/?., ]+)\.svg/.exec(text);
      if (m && W._ORB_TILE_LETTERS[m[1]]) assert.equal(W._orbTileLettersOther(m[1], code), false, code + ', ' + MARKS.SURFACES[i] + ' shows ' + m[1] + '.svg, which letters ' + W._ORB_TILE_LETTERS[m[1]]);
      assert.doesNotMatch(text, /an empty disc/, code + ', ' + MARKS.SURFACES[i]);
    });
  }
  // art that became letters is the letters of the code itself, in place of such a placeholder
  for (const c of cells) {
    if (/^letters/.test(c.now) && !/^letters|^nothing/.test(c.was)) assert.ok(c.row && c.row.kind === 'own letters' && c.now.indexOf('letters ' + c.code) === 0, c.code + ', ' + c.surface + ': ' + c.was + ' became ' + c.now);
  }

  // THE KINDS ARE WHAT THEY CLAIM
  const of = (kind) => [...kept.values()].filter((r) => r.kind === kind);
  const codesOf = (kind) => [...new Set(of(kind).map((r) => r.code))].sort();
  const at = (code, surface) => SHOWN.shown(code)[MARKS.SURFACES.indexOf(surface)];
  const file = (text) => (/^letters|^nothing/.test(text) ? '' : text.split(/,| on | filling /)[0]);
  // a designator: three letters, letters or nothing on origin/main, and now the file its carrier draws
  // there (or letters, where its carrier has no art: the five regionals that fly for a mainline)
  for (const r of of('designator')) {
    assert.ok(r.code.length === 3 && O.fold(r.code) !== r.code, r.code + ' folds to a carrier');
    assert.match(r.was, /^letters |^nothing$/, r.code + ', ' + r.surface);
    assert.equal(file(r.now), file(at(O.fold(r.code), r.surface)), r.code + ', ' + r.surface + ': the file of ' + O.fold(r.code));
  }
  assert.deepEqual(codesOf('designator').filter((c) => of('designator').some((r) => r.code === c && !file(r.now))), ['AWI', 'CPZ', 'GJS', 'RPA', 'UCA']);
  for (const c of ['AWI', 'CPZ', 'GJS', 'RPA', 'UCA']) assert.equal((LOOKS[O.fold(c)] || {}).none, 1, c);
  // the rows of two letters, by kind: no code joins a kind unseen
  assert.deepEqual(codesOf('partner'), ['9E', 'Q6', 'RK', 'SP']);
  assert.deepEqual(codesOf('white outside'), ['BW', 'JX', 'KE', 'OZ', 'TG']);
  assert.deepEqual(codesOf('own colours'), ['VS']);
  assert.deepEqual(codesOf('line mark'), ['LH', 'RO']);
  assert.deepEqual(codesOf('own letters'), ['D8', 'DI']);
  assert.deepEqual([...new Set([...kept.values()].filter((r) => r.code.length !== 3).map((r) => r.kind))].sort(), ['line mark', 'own colours', 'own letters', 'partner', 'white outside']);
  // a partner: exactly what its carrier draws on that surface, the table of the plate included
  for (const r of of('partner')) assert.equal(r.now, at(O.fold(r.code), r.surface), r.code + ', ' + r.surface + ': what ' + O.fold(r.code) + ' draws there');
  assert.deepEqual([at('9E', 'sky plate'), at('9E', 'map hold')], ['airlines/us-major/delta-emblem-colour.svg', 'airlines/us-major/delta-emblem-colour.svg'], 'Endeavor: the flat emblem of Delta on the plates, never its sphere');
  // white outside: the notice alone, a white disc with the mark not inked, as the top orb of that gate
  for (const r of of('white outside')) {
    assert.equal(r.surface, 'notice', r.code);
    assert.match(r.now, /^[^,]+ on a #FFFFFF disc$/, r.code);
    assert.deepEqual([column(r.code).emb.bg, column(r.code).emb.inked], ['#FFFFFF', false], r.code + ': its gate');
  }
  // Virgin Atlantic: no white filter, on the notice and on the cards
  assert.deepEqual(of('own colours').map((r) => r.surface + ': ' + r.now).sort(), ['notice: symbols/airlines/VS.svg on the accent disc', 'standby card: symbols/airlines/VS.svg']);
  // the line marks: white, on the accent disc of the notice and on the frame of the cards; the plates as they were
  for (const code of ['LH', 'RO']) {
    assert.deepEqual(of('line mark').filter((r) => r.code === code).map((r) => r.surface + ': ' + r.now).sort(),
      ['notice: symbols/airlines/' + code + '.svg, white on the accent disc', 'standby card: symbols/airlines/' + code + '.svg, white']);
    assert.deepEqual(art('/logos/symbols/airlines/' + code + '.svg').colours.length, 1, code + ': a mark of one colour');
  }
  // own letters: the letters of the code on every surface that drew the Norwegian placeholder
  for (const r of of('own letters')) {
    assert.match(r.was, /^airline-tiles\/NAX\.svg/, r.code + ', ' + r.surface);
    assert.equal(r.now.indexOf('letters ' + r.code), 0, r.code + ', ' + r.surface + ': ' + r.now);
  }
  assert.equal(at('DI', 'standby card'), 'letters DI on a ' + W._ORB_TILE_GROUNDS.NAX + ' disc', 'the centre cards: letters on the ground of that tile, never nothing');
  assert.equal(at('DI', 'notice'), 'letters DI on a ' + W._ORB_TILE_GROUNDS.NAX + ' disc');
  // the 34 carriers whose symbol these surfaces always drew: none is in the table
  for (const code of '6E A3 AH AI AT AV CM CX DE EI EK EW FI GA HV IB JL JQ KC KL KQ KU LO MH MO PC SN SQ SV TP VA VN WY XY'.split(' ')) {
    assert.ok(![...kept.values()].some((r) => r.code === code), code + ' draws what it drew');
  }
  assert.ok(REC.kept.length >= 300 && kept.size >= 590, REC.kept.length + ' rows, ' + kept.size + ' surfaces and codes');
});

// ── a lettered placeholder ─────────────────────────────────────────────────
test('a placeholder tile, a flat square with a code set as text, is drawn only for the code it letters', () => {
  const T = W._ORB_TILE_LETTERS;
  assert.deepEqual(T, { ASH: 'YV', NAX: 'DY', PCM: 'YP', PSC: 'BQ', SEJ: 'SG', TAM: 'JJ', TUI: 'TUI' });
  for (const [tile, code] of Object.entries(T)) {
    const svg = fs.readFileSync(path.join(GEN.TILES, tile + '.svg'), 'utf8');
    assert.equal(GEN.lettersOf(svg), code, tile);
    assert.match(svg, new RegExp('<text\\b[^>]*>' + code + '</text>'), tile + ' sets ' + code + ' as text');
  }
  // a drawn tile, and a tile whose text is a name, are not placeholders
  assert.equal(GEN.lettersOf(fs.readFileSync(path.join(GEN.TILES, 'IBE.svg'), 'utf8')), '');
  assert.equal(GEN.lettersOf(fs.readFileSync(path.join(GEN.TILES, 'P6-glossy.svg'), 'utf8')), '');
  // the code a tile letters draws that tile (TUI is the designator of X3)
  for (const [code, tile] of [['BQ', 'PSC'], ['DY', 'NAX'], ['SG', 'SEJ'], ['X3', 'TUI'], ['YP', 'PCM'], ['YV', 'ASH'], ['NAX', 'NAX'], ['ASH', 'ASH']]) {
    assert.equal(column(code).emb.src, '/logos/airline-tiles/' + tile + '.svg', code);
    assert.equal(column(code).L.letters, '', code);
  }
  // a gate of another code that reaches it shows its own letters, on a disc of the ground that tile
  // is drawn in. That ground sank into the card of each of the three (a shade of the same colour),
  // so the card of each is the dark plate, and the disc keeps the ground.
  const OTHER = { P6: 'PSC', D8: 'NAX', DI: 'NAX' };
  for (const [code, tile] of Object.entries(OTHER)) {
    const { L, emb, badge } = column(code), g = W._ORB_TILE_GROUNDS[tile], N = W._gateOrbNatural(code);
    assert.deepEqual([N.path, N.letters, N.ground], ['', code, g], code + ': the recipe of its art');
    assert.ok(sinks(g, screened(shadeBase(g))) && W._gateCardPaint(code).kind === 'dark', code + ': ' + g + ' sank into the shade of itself, and its card is the dark plate');
    assert.deepEqual([L.art, L.letters, L.ground, L.white], ['', code, g, false], code);
    assert.deepEqual([emb.src, emb.letters, emb.bg, emb.generic], ['', code, g, false], code + ': the top orb letters ' + code);
    assert.equal(badge.bg, g, code + ': the five badges');
    assert.ok(contrast(emb.lettersInk, g) >= 3, code + ': ' + emb.lettersInk + ' on ' + g);
    const own = orbFacts(W._gateCardOrb(code, '').html);
    assert.deepEqual([own.src, own.letters, own.bg], ['', code, g], code + ': the Your Aircraft orb');
    assert.equal(orbFacts('<div class="x" style="' + O.shelf(code).orb.badge + '">' + O.shelf(code).icon + '</div>').letters, code, code + ': the boarding shelf');
    assert.equal(O.accent(O.fold(code)), g, code + ': its accent is that ground');
  }
  // no other named code is in that case, and none draws the letters of another
  assert.deepEqual(CODES.filter((c) => column(c).L.letters).sort(), Object.keys(OTHER).sort());
  for (const code of CODES) {
    const m = /\/airline-tiles\/([^/?]+)\.svg/.exec(column(code).emb.src || '');
    if (m && T[m[1]]) assert.equal(O.desig(T[m[1]]) || T[m[1]], O.desig(code) || code, code + ' draws ' + m[1] + '.svg, which letters ' + T[m[1]]);
  }
  // as an operator too, and when a missing file falls back to the row tile
  assert.equal(orbFacts(W._gateCardOrb('AC', 'P6').html).letters, 'P6');
  assert.equal(W._orbTileLettersOther('NAX', 'D8'), true);
  assert.equal(W._orbTileLettersOther('NAX', 'DY'), false);
  assert.equal(W._orbTileLettersOther('TUI', 'X3'), false);
  assert.equal(W._orbTileLettersOther('IBE', 'I2'), false, 'a drawn tile is shared freely');
  for (const fn of ['window._holdArtFailed = function', 'window._orbArtFailed = function']) assert.match(block(fn), /window\._orbTileLettersOther\(/, fn);
});

test('the rule holds on the gate change notice and in the missing-file handler: the handler is handed the code of the row', () => {
  // A notice for P6 was written with the folded code alone. The symbol of BQ was never drawn, so the
  // handler tried the row tile of BQ, the Pascan placeholder, found that it letters BQ, the code it
  // was handed, and drew it: a P6 notice read BQ. The image is now written with the code of the row
  // after the folded one, and the handler letters the row.
  const html = SHOWN.O.notice('P6');
  assert.match(html, /onerror="window\._orbArtFailed\(this,&quot;BQ&quot;,&quot;P6&quot;\)"/);
  assert.deepEqual(SHOWN.shown('P6'), ['letters P6, after a miss', 'letters P6, after a miss', 'letters P6, after a miss', 'letters P6 on the accent disc, after a miss', 'nothing']);
  // Pascan under its own code still draws its tile, and Norwegian under D8 letters itself
  assert.equal(SHOWN.shown('BQ')[3], 'airline-tiles/PSC.svg filling the orb, after a miss');
  assert.equal(SHOWN.shown('D8')[3], 'letters D8 on the accent disc, after a miss');
  // the handler: a third argument, asked before the folded code, and the letters that go in are its letters
  const failed = block('window._orbArtFailed = function');
  assert.match(failed, /^window\._orbArtFailed = function \(img, code, rowCode\) \{/);
  assert.match(failed, /window\._orbTileLettersOther\(_icao, rowCode \|\| code\)\) \{\s*\n\s*_icao = '';\s*\n\s*if \(rowCode\) code = rowCode;/);
  // the code of the row is written wherever the tile the handler would try letters another code than
  // the row, and nowhere else: for every code any table names, in either quote
  const named = [];
  for (const code of Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gate-marks-origin-main.json'), 'utf8')).main)) {
    const mono = O.mono(code), tile = O.TILE[mono], want = (code !== mono && code.length <= 3 && tile && W._orbTileLettersOther(tile, code)) ? code : '';
    assert.equal(O.rowArg(code, "'"), want ? ",'" + want + "'" : '', code);
    assert.equal(O.rowArg(code, '&quot;'), want ? ',&quot;' + want + '&quot;' : '', code);
    if (want) named.push(code);
  }
  assert.deepEqual(named, ['P6'], 'the one code in that case today');
  assert.equal(O.rowArg(' p6 ', "'"), ",'P6'");
  for (const odd of ["P6'", 'P6"', 'P6<', '<img>', 'P 6']) assert.match(O.rowArg(odd, "'"), /^(|,'[A-Z0-9]{1,3}')$/, 'the shape of a code, whatever the feed sends');
  assert.equal(O.rowArg('', "'"), '');
  // every image that names the handler is written with it: the notice, the one function of the
  // Your Aircraft orb, both builders, the boarding shelf
  assert.match(block('function _gateChangeOrbHtml(code) {'), /_orbMono\(c\) \+ '&quot;' \+ \(\(typeof _orbRowArg === 'function'\) \? _orbRowArg\(c, '&quot;'\) : ''\) \+ '\)">'/);
  assert.match(block('window._gateCardOrb = function'), /var rowArg = \(typeof _orbRowArg === 'function'\) \? _orbRowArg\(code, '\\''\) : '';/);
  assert.match(MC_ORB, /_orbMono\(_mcOrbCode\) \+ '\\'' \+ _orbRowArg\(_mcOrbCode, '\\''\) \+ '\)">'/);
  assert.match(NI_ORB, /_orbMono\(_niCode\) \+ '\\'' \+ _orbRowArg\(_niCode, '\\''\) \+ '\)">'/);
  assert.match(SHELF_ORB, /_orbMono\(airlineCode\) \+ '\\'' \+ _orbRowArg\(airlineCode, '\\''\) \+ '\)">'/);
  assert.equal(CORE.split('window._orbArtFailed(this,').length - 1, 5, 'five images name the handler');
  // the plates read the code of the row from the letters beside the image, and a plate never draws the
  // placeholder of another code first time either
  assert.match(block('window._holdArtFailed = function'), /window\._orbTileLettersOther\(icao, String\(shown \|\| code\)\)/);
  assert.equal(O.plate('DI'), '', 'Norwegian UK: no file, so the plate letters DI');
  assert.equal(O.plate('DY'), O.emblem('DY'));
});
// ── the table of looks ─────────────────────────────────────────────────────
// Light grounds whose ink is the neutral dark of the boards (#1B2430): no dark colour of the brand
// is confirmed for these, so none is guessed. A row that gains an ink leaves this list. (They were
// white columns for one round, inked in a colour of the brand; on the dark plate each keeps its
// light discs, and the glyphs on a light disc are dark. French bee joins them: its cyan discs sank
// into the shade of that cyan and now sit on the dark plate; the blue its row names is the ink of
// a white disc, not the ink of the cyan.)
const NEUTRAL_INK = ['5J', 'BF', 'UL', 'XY'];
// A square is not a mark. True where a file paints the corners of its box: drawn on a white disc it
// would be a square in a circle, so a white column with such a symbol keeps the round inset.
function paintsCorners(p) {
  const m = GEN.build(fs.readFileSync(path.join(FC, String(p).split('?')[0]), 'utf8'));
  const [vx, vy, vw, vh] = m.vb;
  return [[0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96]].filter(([u, v]) => GEN.colourAt(m, vx + u * vw, vy + v * vh)).length >= 3;
}
// The only rows that write white on a ground where white is under 3 to 1: approved as drawn (the ledger).
const APPROVED_WHITE = ['TS', 'WR', 'WS'];

test('every row of the table of looks: art that is on disk, inks that are colours, a hand ground that is the rim of the art', () => {
  const neutral = [];
  for (const [code, row] of Object.entries(LOOKS)) {
    for (const k of Object.keys(row)) assert.ok(['art', 'ground', 'ink', 'code', 'css', 'cssInk', 'cssCode', 'none', 'whiteArt', 'whiteInk'].includes(k), code + '.' + k);
    for (const k of ['ground', 'ink', 'code', 'cssInk', 'cssCode', 'whiteInk']) if (row[k]) assert.match(full(row[k]), HEX, code + '.' + k);
    if (row.art) assert.ok(fs.existsSync(path.join(FC, row.art)), code + ': ' + row.art);
    // the art and the ink of a white disc: read only by the function that draws one (the column
    // of this carrier where it is white, or its orb on the panel of another gate), and it gives them
    if (row.whiteArt || row.whiteInk) {
      const N = W._gateOrbNatural(code), Ww = W._gateOrbWhite(code, N, W._gateWhiteInk(code, N.ground)), Lw = W._gateColumnLook(code);
      if (row.whiteArt) { assert.ok(fs.existsSync(path.join(FC, row.whiteArt)), code + ': ' + row.whiteArt); assert.equal(Ww.path, row.whiteArt, code); if (Lw.white) assert.equal(Lw.art, row.whiteArt, code); }
      if (row.whiteInk) { assert.equal(Ww.ink, row.whiteInk, code); if (Lw.white) assert.equal(Lw.ink, row.whiteInk, code); assert.ok(contrast(row.whiteInk, THE_WHITE) >= 3, code + ': ' + row.whiteInk + ' on white'); }
    }
    // a ground written by hand is the colour the rim of that art is painted in, on three quarters
    // of it or more; a row that cannot say so is in the ledger, with the reason
    if (row.ground && !row.css && row.art && !LEDGER[code]) {
      const A = art(row.art);
      assert.equal(A.rim, row.ground, code + ': the rim of ' + row.art);
      assert.ok(A.rimShare >= 0.75 && !A.rampShare, code + ': ' + A.rimShare.toFixed(2) + ' of the rim');
    }
    // on a light ground the ink is named, and it is never white
    // (a column rule 6 made white is inked by the rule, in the colour of the brand: the last test)
    const L = W._gateColumnLook(code);
    if (!row.css && !row.none && !L.white && HEX.test(L.ground) && contrast('#FFFFFF', L.ground) < 3 && !APPROVED_WHITE.includes(code)) {
      if (!row.ink) { neutral.push(code); assert.equal(L.ink, '#1B2430', code); continue; }
      assert.doesNotMatch(row.ink, /^#f{3}(f{3})?$/i, code + ': a dark ink on ' + L.ground);
    }
  }
  assert.deepEqual(neutral.sort(), NEUTRAL_INK);
  assert.deepEqual(Object.keys(LOOKS).filter((c) => /^#f{3}(f{3})?$/i.test(LOOKS[c].ink || '')).sort(), APPROVED_WHITE);
  // the hand grounds that are not the rim of their art are exactly the ledgered ones
  assert.deepEqual(Object.keys(LOOKS).filter((c) => LOOKS[c].ground && LOOKS[c].art && !LOOKS[c].css && LEDGER[c]).sort(), ['OS', 'W4', 'W6']);
  // the rows that name art or an ink for the white disc
  const WHITE_ART = Object.keys(LOOKS).filter((c) => LOOKS[c].whiteArt).sort();
  assert.deepEqual(WHITE_ART, ['6E', 'EK', 'FI', 'FR', 'KC', 'KL', 'KU', 'LA', 'LO', 'MH', 'PB', 'PD', 'QF', 'TS', 'XP']);
  // THE TILE WHERE NO MARK OF THE AIRLINE READS ON WHITE. Qantas, and four carriers whose own gate
  // is left as drawn: their column never goes white, but their mark lands in the Your Aircraft orb of
  // another gate, and is judged there like any operator. The p of Porter, the star of Transat and the
  // arrow of PAL are drawn white, and the harp of Ryanair is its yellow: on a white disc each would
  // be lost. So the white disc of each is the finished tile the board rows draw for it, the same mark
  // on its own ground, as a round inset.
  const WHITE_TILE = WHITE_ART.filter((c) => /\/airline-tiles\//.test(LOOKS[c].whiteArt));
  assert.deepEqual(WHITE_TILE, ['FR', 'PB', 'PD', 'QF', 'TS']);
  for (const code of WHITE_TILE) {
    const p = LOOKS[code].whiteArt, N = W._gateOrbNatural(code), Ww = W._gateOrbWhite(code, N, '#000000');
    assert.deepEqual([Ww.path, Ww.inset, Ww.white, /invert/.test(Ww.imgStyle), /object-fit:cover;border-radius:50%;/.test(Ww.imgStyle)], [p, true, true, false, true], code + ': its tile, round, inside the ring');
    if (code === 'QF') continue;
    assert.ok(isKept(code), code + ': a gate left as drawn');
    assert.equal(p, '/logos/airline-tiles/' + O.TILE[code] + '.svg', code + ': the tile of its board row');
    const mark = art(N.path);
    assert.ok(mark.exists && mark.colours.length && mark.colours.every((c) => contrast(c, THE_WHITE) < 3), code + ': no colour of ' + N.path + ' reads on white: ' + mark.colours.join(' '));
  }
  // Avelo has no tile. Its emblem is yellow, cyan and white, drawn for its purple; the white disc
  // takes the mark it publishes for a light ground, where the name and the middle stripe are the
  // purple. The yellow and the cyan stripes are the two colours of that file that do not reach 3 to 1.
  assert.deepEqual(art(O.FILES.XP).colours.filter((c) => contrast(c, THE_WHITE) >= 3), [], 'the emblem of Avelo on white');
  const xp = art(LOOKS.XP.whiteArt);
  assert.ok(isKept('XP') && O.TILE.XP === undefined && dE(xp.main, O.accent('XP')) < 2 && contrast(xp.main, THE_WHITE) >= 7, 'Avelo: ' + xp.main);
  assert.deepEqual(xp.colours.filter((c) => contrast(c, THE_WHITE) < 3).sort(), ['#1FBFD2', '#FECE02']);
  assert.deepEqual(Object.keys(LOOKS).filter((c) => LOOKS[c].whiteInk).sort(), ['5J', 'BF', 'EY', 'GF']);
  // THE MARK BEFORE THE TILE, ON A WHITE DISC. Every other row names a mark in the
  // colour of the airline on a clear ground: a file that is no tile, that paints no white and not
  // the corners of its box, every colour of it reading on white at 3 to 1 (but the two stripes of
  // Avelo, above), and the colour that
  // fills most of it within 30 degrees of hue of the ink beside it or the ink itself.
  for (const code of WHITE_ART.filter((c) => !WHITE_TILE.includes(c))) {
    const p = LOOKS[code].whiteArt, A = art(p);
    assert.ok(!/airline-tiles/.test(p) && A.exists && A.colours.length >= 1, code + ': ' + p);
    if (code !== 'XP') assert.ok(A.colours.every((c) => contrast(c, THE_WHITE) >= 3), code + ': every colour of ' + p + ' reads on white: ' + A.colours.join(' '));
    assert.equal(paintsCorners(p), false, code + ': ' + p + ' is a mark on a clear ground, not a square');
    const Ww = W._gateOrbWhite(code, W._gateOrbNatural(code), '#000000');
    assert.deepEqual([Ww.path, Ww.inset, /invert/.test(Ww.imgStyle), /object-fit:contain/.test(Ww.imgStyle)], [p, false, false, true], code + ': the mark on the white disc, whole, never inked');
  }
  // and no white column draws a tile inside the ring while such a mark is on disk for it: the file
  // the symbol resolver gives it is the art it draws already, or is not on disk, or is a square
  const SQUARE_SYMBOL = [];
  for (const code of CODES) {
    const { L } = column(code);
    if (!L.white || !L.inset) continue;
    const sym = O.emblem(L.carrier) || '';
    if (!sym || sym === L.art || !fs.existsSync(path.join(FC, sym.split('?')[0]))) continue;
    assert.ok(/\.svg/.test(sym) && paintsCorners(sym), code + ': ' + sym + ' is a mark on a clear ground, and its white disc draws ' + L.art);
    SQUARE_SYMBOL.push(code);
  }
  assert.deepEqual(SQUARE_SYMBOL, ['A3', 'CM', 'MO'], 'Aegean and Copa: their symbols are squares; Calm Air: its symbol file is its tile again');
  // LATAM: its spark is coral and white, drawn for the indigo; the white disc takes the mark in coral and indigo
  assert.deepEqual(art(O.FILES.JJ).colours.slice().sort(), ['#ED1650', '#FFFFFF']);
  assert.ok(art(LOOKS.LA.whiteArt).colours.every((c) => contrast(c, THE_WHITE) >= 3), 'every colour of LA.svg reads on white: ' + art(LOOKS.LA.whiteArt).colours.join(' '));
  for (const code of ['LA', 'JJ', '4C']) assert.deepEqual([column(code).emb.src, column(code).emb.bg, column(code).emb.inked], [LOOKS.LA.whiteArt, THE_WHITE, false], code);
  // the white columns among them draw the mark in the top orb, in the Your Aircraft orb and on the shelf
  for (const code of ['6E', 'EK', 'FI', 'KC', 'KL', 'KU', 'LO', 'MH']) {
    const { L, emb } = column(code), own = orbFacts(W._gateCardOrb(code, '').html), S = O.shelf(code);
    assert.deepEqual([L.white, L.inset, emb.src, emb.bg, emb.pad, emb.inked, own.src, own.bg, S.orb.path], [true, false, LOOKS[code].whiteArt, THE_WHITE, PAD, false, LOOKS[code].whiteArt, THE_WHITE, LOOKS[code].whiteArt], code);
  }
  // naming an ink for the white disc does not move the colour of the gate: the accent is still the
  // ground of the tile, and on the dark plate the discs are that ground
  assert.deepEqual([O.accent('BF'), O.accent('5J'), O.accent('EY'), O.accent('GF')], [W._ORB_TILE_GROUNDS.FBU, W._ORB_TILE_GROUNDS.CEB, O.ACCENT.EY, W._ORB_TILE_GROUNDS.GFA]);
  for (const code of ['BF', '5J', 'EY', 'GF']) assert.deepEqual([column(code).L.white, W._gateCardPaint(code).kind], [false, 'dark'], code);
  // Etihad and Gulf Air: the gold of each reads on white at the floor, and the ink named is stronger
  for (const [code, floor, strong] of [['EY', 3.2, 9], ['GF', 3.3, 4.4]]) {
    const g = W._gateOrbNatural(code).ground;
    assert.ok(contrast(W._orbInkOnWhite([g]), THE_WHITE) < floor && contrast(LOOKS[code].whiteInk, THE_WHITE) >= strong, code + ': ' + contrast(LOOKS[code].whiteInk, THE_WHITE).toFixed(2));
  }
  // SriLankan has no colour of its own on record for a white disc: its light blue darkened, a steel
  // grey that is no colour of the airline. It is not drawn white on its own gate (the dark plate
  // under its light discs); the ink waits for its navy
  assert.equal(LOOKS.UL.whiteInk, undefined);
  assert.deepEqual([column('UL').L.white, W._gateCardPaint('UL').kind, column('UL').L.ink], [false, 'dark', '#1B2430']);
  // Qatar: white for most of its rim, by the file its emblem table names
  assert.equal(art(O.FILES.QR).rim, LOOKS.QR.ground);
});

test('the white marks that stay: each is a mark of one colour, on the colour of its brand', () => {
  // a mark is inked white only on a disc of a colour: on a gate approved as drawn, or on a gate
  // whose discs stand out (on its own card or on the dark plate). Never on a white disc.
  const white = CODES.filter((c) => !LEDGER[c] && column(c).emb.inked && column(c).A.exists);
  assert.ok(white.length >= 14, white.length + ' marks inked white');
  for (const code of ['9L', '9M', 'AC', 'FR', 'PB', 'PD', 'QK', 'RK', 'SP', 'ZX']) assert.ok(white.includes(code) && isKept(code), code + ' is a gate approved as drawn');
  for (const code of white) assert.equal(column(code).L.white, false, code + ': never a white mark on a white disc');
  for (const code of white) {
    const { A, L, top } = column(code);
    assert.ok((A.colours || []).filter((c) => !/^#F[C-F]F[C-F]F[C-F]$/i.test(c)).length <= 1, code + ': ' + (A.colours || []).join(' '));
    assert.ok(contrast('#FFFFFF', top) >= 3 || L.css, code + ': white reads on ' + top);
  }
  // the emblems the audit found inked white, and what each draws now
  for (const code of ['IB', 'KL', 'EK', 'CX', 'FI', 'JQ', 'SN', 'SQ', 'KC', 'VN', '6E', 'AT', 'AV', 'KQ', 'MH', 'SV', 'VA']) {
    // its finished tile, or on a white disc its mark in its own colour
    if ((LOOKS[code] || {}).whiteArt && column(code).L.white) assert.equal(column(code).emb.src, LOOKS[code].whiteArt, code + ': its mark, in its colour, on the white disc');
    else assert.match(column(code).emb.src, /^\/logos\/airline-tiles\//, code + ': its finished tile');
    assert.equal(column(code).emb.inked, false, code);
  }
  for (const code of ['JX', 'KE', 'OZ', 'VS']) assert.equal(column(code).emb.inked, false, code + ' keeps its colours');
  for (const code of ['JX', 'KE', 'OZ', 'TG', 'BW']) assert.equal(column(code).emb.bg, '#FFFFFF', code + ': white outside, the emblem in its colours inside');
  assert.equal(W._orbKeepsColour('VS'), true);
  // ONE COLOUR BY DESIGN. By the recipe of the art each is white on the disc of the brand ...
  for (const code of ['AM', 'AR', 'FJ', 'JU', 'MF', 'UX', 'LH', 'RO', 'QF', 'F9', '9X']) {
    const N = W._gateOrbNatural(code);
    assert.ok(N.whitened && /invert\(1\)/.test(N.imgStyle) && /^aspect-ratio:[^"]*background:var\(--airline-accent,/.test(N.badge), code + ': the recipe of its art');
  }
  // ... and that is what is drawn where the disc of the brand stands out: on the dark plate
  // (Aerolineas, Xiamen, Air Europa, Qantas, Frontier, Mokulele) and on the gold picture of Lufthansa
  for (const code of ['AR', 'MF', 'UX', 'QF', 'F9', '9X', 'LH']) {
    assert.equal(column(code).emb.inked, true, code);
    assert.ok(isVar(column(code).emb.bg), code + ': on the accent disc');
    assert.equal(column(code).top, O.accent(code), code + ': on its own accent');
    assert.equal(W._gateCardPaint(code).kind, code === 'LH' ? 'picture' : 'dark', code);
  }
  // the navies and the brown among them would sink into the dark plate too, so each is drawn in its
  // own colour on the white disc, never inked: the colour of the file reads on white, and it is the
  // colour of the brand
  for (const code of ['AM', 'FJ', 'JU', 'RO']) {
    const { emb, A, L } = column(code);
    assert.deepEqual([emb.bg, emb.inked, emb.pad, emb.fit, L.white, L.inset], [THE_WHITE, false, PAD, 'contain', true, false], code);
    assert.equal(A.colours.length, 1, code + ': a mark of one colour');
    assert.ok(contrast(A.colours[0], THE_WHITE) >= 3, code + ': ' + A.colours[0] + ' on white');
    assert.ok(dE(A.colours[0], O.accent(code)) < 25 && hueGap(A.colours[0], O.accent(code)) < 30, code + ': the mark ' + A.colours[0] + ' beside glyphs in ' + L.ink);
    assert.ok(!clear(O.accent(code), screened(HOUSE_DARK)), code + ': ' + O.accent(code) + ' does not stand clear of the dark plate');
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
    '5T': ['/logos/airline-tiles/CanadianNorth-Emblem.svg', '#BA0C2F', '#fff', '#fff']
  };
  for (const [code, [file, ground, ink, codeInk]] of Object.entries(WAS)) {
    const { L, emb, top, badge } = column(code);
    // each is a gate approved as drawn: rule 6 is never applied to it
    assert.ok(W._GATE_COLUMNS_KEPT[L.carrier] || W._GATE_COLUMNS_KEPT[code], code + ' is kept as drawn');
    assert.equal(L.white, false, code);
    assert.equal(L.art, file, code + ' art');
    if (!PLAIN_DISC.includes(code)) assert.equal(emb.src, file, code + ': the file the top orb draws');
    assert.ok(same(L.ground, ground), code + ' ground ' + L.ground);
    if (!L.css) assert.ok(dE(top, full(ground)) < 6, code + ': the top orb paints ' + top);
    if (ink) assert.ok(same(L.inkSeen, ink), code + ' ink ' + L.inkSeen);
    if (ink && !L.css) assert.ok(same(badge.ink, ink), code + ': the ink the rail writes ' + badge.ink);
    if (codeInk) assert.ok(same(L.codeSeen, codeInk), code + ' code ' + L.codeSeen);
  }
  // PAL keeps its arrow and its gold; only the ink moved, from a white that read at 2 to 1 to its navy
  assert.equal(W._gateColumnLook('PB').inkSeen, '#183677');
  assert.ok(contrast('#183677', '#FCA404') >= 4.5 && contrast('#FFFFFF', '#FCA404') < 3);
  // Norwegian UK drew the Norwegian tile, which prints DY: it letters its own code now, on the red of
  // that tile (the red sank into the maroon its card was, so its card is the dark plate)
  assert.deepEqual([column('DI').emb.letters, column('DI').emb.bg, column('DI').badge.ink, W._gateCardPaint('DI').kind], ['DI', '#EB0324', '#fff', 'dark']);
});

test('the rail of the day before and the one function agree, carrier by carrier', () => {
  const rail = CORE.slice(CORE.indexOf('var _railBadgeBg = '), CORE.indexOf('function _badge(svg) {', CORE.indexOf('var _railBadgeBg = ')));
  const bgOf = (c) => (new RegExp("\\(_alCodeEmb === '" + c + "'[^)]*\\) \\? '(#[0-9A-Fa-f]{6})'").exec(rail.slice(0, rail.indexOf('var _railBadgeInk'))) || [])[1];
  const inkOf = (c) => (new RegExp("\\(_alCodeEmb === '" + c + "'[^)]*\\) \\? '(#[0-9A-Fa-f]{6})'").exec(rail.slice(rail.indexOf('var _railBadgeInk'))) || [])[1];
  for (const code of ['F8', 'YN', 'DM', '3H']) {
    const L = W._gateColumnLook(code);
    assert.equal(L.bg, bgOf(code), code + ': the ground the chain writes is the ground the function gives');
    if (inkOf(code)) assert.equal(L.ink, inkOf(code), code + ' ink');
  }
  // Breeze had a line in that chain, the navy of its tile. The function gave the same navy, and gives
  // white now that the navy sinks into its navy card: the line is gone from the rail and from the
  // shelf, or five navy discs would sit under a white orb
  assert.doesNotMatch(rail + SHELF_BADGES, /=== 'MX'/);
  assert.equal(W._gateOrbNatural('MX').ground, W._ORB_TILE_GROUNDS.MXY);
  assert.deepEqual([W._gateColumnLook('MX').bg, W._gateColumnLook('MX').ink, column('MX').badge.bg, styleProp(O.shelf('MX').badge, 'background')], [THE_WHITE, W._ORB_TILE_GROUNDS.MXY, THE_WHITE, THE_WHITE]);
  // every other carrier asks the function, and the accent variable stays where the orb is an accent disc
  assert.match(rail, /: \(_railLook && _railLook\.bg\) \? _railLook\.bg\s*\n\s*: 'var\(--airline-accent,' \+ _railAccFb \+ '\)';/);
  assert.match(rail, /: \(_railLook && _railLook\.ink\) \|\| '#fff';/);
  assert.match(rail, /var _railCodeVar = \(_railLook && _railLook\.codeVar\) \? '--orb-code-ink:' \+ _railLook\.codeVar \+ ';' : '';\s*\n\s*var BADGE_STYLE = _railCodeVar \+ '/);
  for (const code of ['AC', 'QK', 'WS', 'AS', 'TK', 'XP', 'CS', 'UA', 'DL', 'AA', 'PD', 'FR']) {
    const L = W._gateColumnLook(code);
    assert.deepEqual([L.bg, L.ink, L.codeVar], ['', '#fff', ''], code + ': the rail writes what it always wrote');
  }
  // Frontier was one of them, painted by the stylesheet. The gate writes its column now, and what it
  // writes is the same: discs of the accent, Frontier Green, white glyphs and a white code
  assert.deepEqual([W._gateColumnLook('F9').bg, W._gateColumnLook('F9').ink, W._gateColumnLook('F9').codeVar, W._gateColumnLook('F9').css], ['', '#fff', '', false]);
  // the code chip rules of the day before say what the function says
  for (const code of ['YN', 'DM', '3H', 'AIE', 'F8']) {
    const i = CSS.indexOf('[data-gate-airline="' + code + '"]', CSS.indexOf(code === 'F8' ? 'v23767 — FLAIR' : 'v24150 — the code chip on the discs of carriers whose discs are light'));
    const body = CSS.slice(CSS.indexOf('{', i), CSS.indexOf('}', i));
    assert.equal(/color: (#[0-9A-F]{6}) !important;/.exec(body)[1], W._gateColumnLook(code).codeVar, code);
  }
});

test('the carriers the stylesheet paints: what the table records is what the stylesheet says', () => {
  assert.deepEqual(Object.keys(LOOKS).filter((c) => LOOKS[c].css).sort(), ['AA', 'DL', 'FR', 'PB', 'PD', 'UA'], 'no carrier joins this list unseen');
  // and every one of them is a gate approved as drawn: the stylesheet paints no disc rule 6 could not reach
  for (const c of Object.keys(LOOKS).filter((k) => LOOKS[k].css)) assert.equal(W._GATE_COLUMNS_KEPT[c], 1, c);
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
  // Frontier: the stylesheet painted its discs Frontier Green, on a card that is a shade of that green.
  // No rule paints them now, in either stylesheet: the gate writes the column, discs of its accent
  // (the same green) with its emblem white on them, and its card is the dark plate.
  for (const list of [R, RG]) for (const tail of [' .v2-fi-icon-badge', ' .v2-fi-emblem-wrap', ' .g8-bir-badge']) {
    assert.ok(!paints(list, F9, tail, /background/) && !paints(list, 'g8-airline-F9', tail, /background/), 'no rule paints the Frontier' + tail);
  }
  assert.equal(LOOKS.F9, undefined, 'and it has no row: its art and its accent settle its column');
  const f9 = column('F9');
  assert.ok(isVar(f9.emb.bg) && isVar(f9.badge.bg) && f9.top === O.ACCENT.F9 && f9.badgeBg === O.ACCENT.F9, 'discs of Frontier Green: ' + f9.emb.bg);
  assert.deepEqual([f9.emb.inked, f9.emb.src, f9.badge.ink, f9.L.white], [true, '/logos/airlines/us-major/frontier-emblem.svg', '#fff', false]);
  assert.ok(sinks(O.ACCENT.F9, screened(shadeBase(O.ACCENT.F9))), 'Frontier Green sank into the shade of itself');
  assert.deepEqual([W._gateCardPaint('F9').kind, W._gateCardPaint('F9').base, clear(O.ACCENT.F9, W._gateCardPaint('F9').paint)], ['dark', HOUSE_DARK, true], 'and stands clear of the dark plate');
  assert.equal(W._ORB_TILE_GROUNDS.FFT, O.ACCENT.F9);
  assert.doesNotMatch(CSS + COLORS, /#00854D\s*(!important|'|;)/i, 'the green of no Frontier palette paints nothing on the gate or in the colour table');
  // PAL: gold on the badges and on the emblem disc
  const gold = new RegExp('background: ' + LOOKS.PB.ground + ' !important');
  assert.ok(paints(RG, '.g8-airline-PB ', ' .v2-fi-icon-badge', gold) && paints(RG, '.g8-airline-PB ', ' .v2-fi-emblem-wrap', gold));
  assert.ok(paints(RG, '.g8-airline-SP ', ' .v2-fi-icon-badge', gold), 'and under its second code');
  // that rule paints the ground only, and no rule inks those badges for PAL: the ink is the one the gate writes
  for (const cls of ['.g8-airline-PB ', '.g8-airline-SP ']) for (const list of [R, RG]) {
    assert.ok(!paints(list, cls, ' .v2-fi-icon-badge', /(?:^|[;\s])color:/) && !paints(list, cls, ' .ac-ico', /(?:^|[;\s])color:/), cls + 'has no ink rule for its badges');
  }
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
    ['QR', '#5C0931'], ['PB', '#183677'], ['BT', '#152649'], ['PC', '#323A47'], ['DE', '#111111'], ['KE', '#051766'],
    // the columns rule 6 made white: the code in the colour of the brand, as the glyphs
    ['EK', O.ACCENT.EK], ['B6', O.ACCENT.B6], ['AY', O.ACCENT.AY], ['KL', LOOKS.KL.ink]]) {
    assert.equal(W._gateColumnLook(code).codeVar, ink, code);
  }
  // (and a gate on the dark plate writes none: a white code on a disc of its colour)
  for (const code of ['AC', 'AA', 'PD', 'DL', 'UA', 'LX', 'MU', 'IB', 'OS', 'W6', 'TP']) assert.equal(W._gateColumnLook(code).codeVar, '', code);
  // every white column writes it, and it is the ink of its glyphs
  for (const code of CODES) {
    const L = W._gateColumnLook(code);
    if (L.white) assert.ok(L.codeVar && same(L.codeVar, L.ink) && same(column(code).badge.codeVar, L.ink), code);
  }
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
  // (white glyphs on a disc of a colour, and the white and light discs inked in a colour of the brand)
  assert.ok(dark >= 60 && light >= 90, dark + ' dark grounds, ' + light + ' light or stylesheet-inked');
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
    CJ: 'BA', RK: 'FR', SP: 'PB', Q6: 'Y4', JJ: 'LA', '4C': 'LA', ACEX: 'AC', EZY: 'U2', ACA: 'AC', DAL: 'DL', AAL: 'AA', KLM: 'KL', PCO: '8P', QTR: 'QR' };
  for (const [from, to] of Object.entries(F)) {
    assert.equal(O.fold(from), to, from);
    assert.deepEqual(W._gateColumnLook(from), W._gateColumnLook(to), from + ' draws the column of ' + to);
    assert.deepEqual(W._gateOrbParts(from), W._gateOrbParts(to), from + ' draws the orb of ' + to);
    // and it is what the gate writes for a row of that code: the same top orb, the same five badges
    assert.deepEqual([column(from).emb.src, column(from).emb.bg, column(from).badgeBg], [column(to).emb.src, column(to).emb.bg, column(to).badgeBg], from);
  }
  // Pascan under its second code wears the colours of Pascan, and its own letters: the Pascan tile prints BQ
  assert.equal(O.fold('P6'), 'BQ');
  const pick = (L) => [L.carrier, L.ground, L.bg, L.ink, L.codeVar];
  assert.deepEqual(pick(W._gateColumnLook('P6')), pick(W._gateColumnLook('BQ')));
  for (const c of ['AC', 'QK', 'RV', 'PB', 'WS', 'WR', 'DI', 'DY', 'U2', 'YX', '']) assert.equal(O.fold(c), c, c + ' is left alone');
  // a designator never borrows the colour of whoever shares its first two letters
  assert.equal(W._gateColumnLook('PCO').ground === O.ACCENT.PC, false);
  // the gate asks the fold for its accent and for the attribute its stylesheet rules key on
  assert.match(CORE, /const accent = getAirlineAccent\(\(typeof _orbEmblemCarrier === 'function'\) \? _orbEmblemCarrier\(airlineCode\) : airlineCode\);/);
  assert.match(CORE, /if \(typeof _orbEmblemCarrier === 'function'\) _skinCode = _orbEmblemCarrier\(_skinCode\);\s*\n\s*document\.body\.setAttribute\('data-gate-airline', _skinCode\);/);
  assert.match(CORE, /document\.body\.setAttribute\('data-gate-airline', \(typeof _orbEmblemCarrier === 'function'\) \? _orbEmblemCarrier\(window\._gateCurrentAirline\) : window\._gateCurrentAirline\);/);
  // the rail asks it once, for the carrier of the gate, and hands the recipe the code as the row gives it
  assert.match(RAIL_HEAD, /var _railRow = String\(\(vars && vars\.airlineCode\) \|\| _fnCarrier \|\| _alCodeEmb \|\| ''\)\.trim\(\)\.toUpperCase\(\);\s*\n\s*var _railSkin = _orbEmblemCarrier\(_railRow\);/);
  assert.match(RAIL_HEAD, /_railLook = window\._gateColumnLook\(_railRow\);/);
  assert.match(RAIL_HEAD, /var _emblemHtml = _fnCarrier \? _emblemImg\(_railSkin \|\| _fnCarrier, _railRow\) : '';/);
  // the carrier of the gate, not the code of the row: a Hawaiian-branded Alaska row draws Hawaiian in the
  // top orb, on its five badges, and in the Your Aircraft orb of the card with no inbound
  const ha = O.rail({ airlineCode: 'HA' }, 'AS', 'AS');
  assert.equal(orbFacts(ha.emblem).src, '/logos/airlines/us-major/hawaiian-pualani.svg');
  assert.equal(styleProp(ha.badge, 'background'), THE_WHITE);
  const haCard = orbFacts(O.cardNoInbound({ airlineCode: 'HA', currentFlight: { airline: 'AS' } }, null, 'HA', null));
  assert.deepEqual([haCard.src, haCard.bg], ['/logos/airlines/us-major/hawaiian-pualani.svg', THE_WHITE], 'it drew the Alaska face beside a Hawaiian rail');
  assert.ok(NI_VARS.indexOf('vars.airlineCode') < NI_VARS.indexOf('vars.currentFlight.airline'), 'the carrier of the gate comes before the carrier of the row');
  // a regional with no colour of its own takes the colour of its partner
  for (const [from, to] of [['MQ', 'AA'], ['OH', 'AA'], ['QX', 'AS'], ['9E', 'DL'], ['ZX', 'AC'], ['CJ', 'BA'], ['JJ', 'LA']]) assert.equal(O.accent(from), O.accent(to), from);
});

test('a three-letter designator in the airline slot is its carrier: the callsign table, then the tile table read backwards', () => {
  // the designators the callsign table does not know, by the tile table: each code to the designator its tile is filed under
  const inv = {}, shared = {};
  for (const [iata, icao] of Object.entries(O.TILE)) {
    if (iata.length !== 2 || !/^[A-Z]{3}$/.test(icao)) continue;
    (shared[icao] = shared[icao] || []).push(iata);
    if (!inv[icao]) inv[icao] = iata;
  }
  const only = Object.keys(inv).filter((d) => !O.CALL[d] && !O.TILE[d]);
  assert.ok(only.length >= 55, only.length + ' designators live only in the tile table');
  for (const d of only) {
    assert.equal(O.desig(d), inv[d], d);
    assert.equal(O.fold(d), O.fold(inv[d]), d);
    assert.deepEqual(W._gateColumnLook(d), W._gateColumnLook(inv[d]), d + ' draws the gate of ' + inv[d]);
    assert.deepEqual([column(d).emb.src, column(d).emb.bg, column(d).badgeBg], [column(inv[d]).emb.src, column(inv[d]).emb.bg, column(inv[d]).badgeBg], d + ': what the gate writes');
    assert.equal(O.accent(d), O.accent(inv[d]), d + ': the colour of its carrier, never one borrowed by its first two letters');
  }
  for (const [d, c] of [['LOT', 'LO'], ['KAL', 'KE'], ['SIA', 'SQ'], ['JAL', 'JL'], ['QFA', 'QF'], ['CSN', 'CZ'], ['AAR', 'OZ'], ['HVN', 'VN'], ['AZU', 'AD'], ['WSG', 'WT'], ['PCM', 'YP'], ['LOG', 'LM']]) {
    assert.equal(O.desig(d), c, d);
    assert.ok(column(d).emb.src && !column(d).emb.generic, d + ' draws the mark of ' + c + ', not the generic plane');
  }
  // where two codes share a tile the designator is the first the table names, and they wear one look
  const ties = Object.entries(shared).filter(([d, l]) => l.length > 1 && !O.CALL[d] && !O.TILE[d]);
  assert.deepEqual(ties.map(([d]) => d).sort(), ['AXM', 'NAX', 'TRA']);
  for (const [d, list] of ties) {
    // (inset goes with the art: Norwegian under DY draws its tile inside the ring, and under D8 its letters)
    const look = (c) => { const L = Object.assign({}, W._gateColumnLook(c)); delete L.carrier; delete L.art; delete L.letters; delete L.inset; return L; };
    for (const c of list) assert.deepEqual(look(c), look(list[0]), d + ': ' + c + ' and ' + list[0] + ' wear one look');
  }
  assert.equal(O.desig('NAX'), 'DY');
  // a code the tile table has a row for is a code of its own, and a code of two letters is never touched
  for (const c of ['NSA', 'EJU', 'EZS']) { assert.equal(O.desig(c), '', c); assert.equal(O.fold(c), c, c); }
  for (const c of ['AC', 'LO', 'KE', '', 'ACEX', 'XYZ']) assert.equal(O.desig(c), '', c);
  // the callsign table comes first
  for (const [d, c] of [['EZY', 'U2'], ['ITY', 'AZ'], ['ROU', 'RV'], ['JZA', 'QK'], ['UAE', 'EK']]) assert.equal(O.desig(d), c, d);

  // THE ACCENT: no caller gets a borrowed colour for a designator the tables know
  let n = 0;
  for (const [d, c] of Object.entries(O.CALL).concat(only.map((x) => [x, inv[x]]))) {
    if (d.length !== 3 || O.ACCENT[d]) continue;
    n++;
    assert.equal(O.accent(d), O.accent(c), d + ' takes the colour of ' + c);
  }
  assert.ok(n >= 125, n + ' designators');
  // Rouge took the navy of TAROM through RO, Etihad the green of Ethiopian through ET, Emirates the blue of United
  assert.deepEqual([O.accent('ROU'), O.accent('ETD'), O.accent('UAE'), O.accent('DLH'), O.accent('PCO')], [O.ACCENT.RV, O.ACCENT.EY, O.ACCENT.EK, O.ACCENT.LH, O.ACCENT['8P']]);
  assert.notEqual(O.accent('ROU'), O.ACCENT.RO); assert.notEqual(O.accent('ETD'), O.ACCENT.ET);
  // a designator with a row of its own keeps it, and a code no table knows still borrows by its first two letters
  assert.equal(O.accent('WJA'), O.ACCENT.WJA); assert.equal(O.accent('ACEX'), O.ACCENT.AC);
  const fn = block('function getAirlineAccent(code) {');
  assert.ok(fn.indexOf('_designatorIata(c)') > 0 && fn.indexOf('_designatorIata(c)') < fn.indexOf('AIRLINE_ACCENT[c.substring(0, 2)]'), 'the designator is folded before the borrow by two letters');
  // one point: the fold and the accent both ask it
  assert.match(block('function _orbEmblemCarrier(code) {'), /c = _designatorIata\(c\) \|\| c;/);
});

// ── the boarding shelf ─────────────────────────────────────────────────────
test('the boarding shelf takes the look of the rail: the ground of its emblem orb on its five badges, an ink that reads', () => {
  assert.match(SHELF_BADGES, /: \(_birLook && _birLook\.bg\) \? _birLook\.bg\s*\n\s*: 'var\(--airline-accent,' \+ _birAccFb \+ '\)';/);
  assert.match(SHELF_BADGES, /var _birRailInk = _birF8 \? '#141414' : '#fff';\s*\n\s*if \(!_birF8 && _birLook && \(!_birLook\.css \|\| !\/\^#f\{3\}\(f\{3\}\)\?\$\/i\.test\(_birLook\.ink\)\)\) _birRailInk = _birLook\.ink;/,
    'the ink of the look wherever the gate writes its own discs, and wherever the row names an ink that is not white');
  assert.match(CORE, /_birParts\.badge \+ 'color:' \+ _birRailInk \+ ';'/, 'the emblem orb of the shelf carries the ink of its badges');
  // the shelf chip has no ink rule of its own: it takes the colour of its badge (the base rule and the rule of
  // the column both leave it out, and the only rules that reach it are American and Porter, whose badges the stylesheet paints)
  const chipRules = CSS.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.slice(0, r.indexOf('{'))).filter((sel) => /\.v2-fi-orbcode\b/.test(sel) && !/:not\(\.v2-fi-orbcode-onaccent\)/.test(sel));
  assert.ok(chipRules.length >= 2 && chipRules.every((sel) => /data-gate-airline[*]?="(PD|AA|AAL|AMERICAN)"/.test(sel)), chipRules.map((r) => r.replace(/:not\(#_\)/g, '').trim()).join(' | '));
  let n = 0;
  const white = [], inked = [], cssInked = [];
  for (const code of CODES) {
    const { L, badge, accent, top, emb } = column(code);
    if (L.css) {
      // a carrier the stylesheet paints: the shelf writes white and the stylesheet inks it, as it always
      // did, unless its row names an ink that is not white. Then the shelf writes that ink, the ink of
      // its rail, and it reads on the ground the row records for the discs the stylesheet paints.
      const ink = styleProp(O.shelf(code).badge, 'color'), row = LOOKS[L.carrier];
      if (row.ink && !WHITE.test(row.ink)) {
        cssInked.push(code);
        assert.ok(same(ink, row.ink) && same(ink, badge.ink), code + ': the shelf writes ' + ink + ', the row ' + row.ink + ', the rail ' + badge.ink);
        assert.ok(contrast(full(ink), row.ground) >= 4.5, code + ': ' + ink + ' on ' + row.ground + ' = ' + contrast(full(ink), row.ground).toFixed(2));
      } else assert.equal(ink, '#fff', code + ': left to the stylesheet');
      continue;
    }
    n++;
    const S = O.shelf(code), bg = styleProp(S.badge, 'background'), ink = styleProp(S.badge, 'color');
    // what the shelf writes is what the rail writes, string for string
    assert.equal(bg, badge.bg, code + ': the ground of the five badges');
    assert.ok(same(ink, badge.ink), code + ': the ink, ' + ink + ' on the shelf and ' + badge.ink + ' on the rail');
    // its emblem orb is the recipe of the top orb
    assert.equal(S.orb.badge, W._gateOrbParts(code).badge, code);
    assert.equal(S.orb.path || '', emb.src || (PLAIN_DISC.includes(code) ? S.orb.path : ''), code + ': the file');
    const sbg = isVar(bg) ? accent : bg;
    if (WHITE.test(ink)) white.push(code); else inked.push(code);
    if (LEDGER[code]) continue;
    assert.ok(dE(sbg, top) < 6, code + ': the shelf badges ' + sbg + ' beside its orb ' + top);
    assert.ok(contrast(ink, sbg) >= 3, code + ': ' + ink + ' on ' + sbg + ' = ' + contrast(ink, sbg).toFixed(2));
  }
  // (white glyphs on a disc of colour, and the white and light discs in the ink of the brand)
  assert.ok(n >= 215 && white.length >= 70 && inked.length >= 140, n + ' shelves: ' + white.length + ' white, ' + inked.length + ' in the ink of the brand');
  // a white column on the shelf: its five badges the one white, its emblem orb the white disc of the rail
  let whiteShelves = 0;
  for (const code of CODES) {
    const { L } = column(code);
    if (!L.white) continue;
    whiteShelves++;
    const S = O.shelf(code);
    assert.deepEqual([styleProp(S.badge, 'background'), styleProp(S.orb.badge, 'background')], [THE_WHITE, THE_WHITE], code);
    assert.ok(same(styleProp(S.badge, 'color'), L.ink) && same(S.ink, L.ink), code + ': the ink of the column');
    // a tile is a round inset there too, and where there is no art the shelf letters the code
    if (L.inset) assert.ok(styleProp(S.orb.badge, 'padding') === RING && /object-fit:cover;border-radius:50%;/.test(S.icon) && S.orb.nativeCls === '', code + ': ' + S.icon);
    if (!L.art) assert.equal(orbFacts('<div class="x" style="' + S.orb.badge + '">' + S.icon + '</div>').letters, L.letters || lettersOf(code), code);
  }
  assert.ok(whiteShelves >= 110 && whiteShelves <= 130, whiteShelves + ' white shelves');
  // PAL, under both its codes, is the carrier the stylesheet paints whose row names an ink: its gold
  // has no ink rule of its own on this shelf, and white read on it at 2 to 1
  assert.deepEqual(cssInked.sort(), ['PB', 'SP']);
  assert.ok(contrast('#FFFFFF', LOOKS.PB.ground) < 3 && contrast(LOOKS.PB.ink, LOOKS.PB.ground) >= 4.5);
  // white glyphs under 3 to 1 on the shelf: the two approved as drawn, nothing else. A carrier the
  // stylesheet paints is judged on the ground its row records, where the row names its ink.
  const low = CODES.filter((c) => {
    const L = W._gateColumnLook(c), named = !!(LOOKS[L.carrier] || {}).ink;
    if (L.css && !named) return false;
    return WHITE.test(styleProp(O.shelf(c).badge, 'color')) && contrast('#FFFFFF', L.css ? L.ground : column(c).badgeBg) < 3;
  });
  assert.deepEqual(low.sort(), ['TS', 'WS']);
  // the carriers the report named: white glyphs on a light disc before. Each keeps its light disc, on
  // the dark plate its card now takes, with glyphs in a dark ink that reads on it
  for (const [code, ground] of [['TR', '#FFE900'], ['VY', '#FFCC00'], ['UL', '#B5D5F1'], ['XY', '#00BBB4'], ['BF', '#00ACE7'], ['G3', '#FF7020'], ['U2', '#FF6600'], ['EZY', '#FF6600'], ['EC', '#FF6600']]) {
    const S = O.shelf(code), ink = styleProp(S.badge, 'color');
    assert.equal(W._gateOrbNatural(code).ground, ground, code + ': the ground of its tile');
    assert.equal(styleProp(S.badge, 'background'), ground, code);
    assert.ok(contrast(ink, ground) >= 4.5, code + ': ' + ink + ' on ' + ground);
    assert.equal(W._gateCardPaint(code).kind, 'dark', code);
  }
  // and the white outside carriers, with the light tiles: the whole shelf one colour, as on the rail
  for (const code of ['JX', 'KE', 'OZ', 'TG', 'BW', 'JV', 'WT', 'NSA']) assert.equal(styleProp(O.shelf(code).badge, 'background'), '#FFFFFF', code);
  for (const [code, tile] of [['BT', 'BTI'], ['CA', 'CCA'], ['HY', 'UZB'], ['WB', 'RWD']]) assert.equal(styleProp(O.shelf(code).badge, 'background'), W._ORB_TILE_GROUNDS[tile], code);
  // Azores: the light blue of its tile sank into its navy card (two blues), so its card is the dark
  // plate; its shelf keeps the light blue, with its navy ink
  assert.deepEqual([styleProp(O.shelf('S4').badge, 'background'), styleProp(O.shelf('S4').badge, 'color'), W._gateCardPaint('S4').kind], [W._ORB_TILE_GROUNDS.RZO, LOOKS.S4.ink, 'dark']);
  for (const code of ['HA', 'BA', 'WN', 'LY', 'PR', '4Y', '2L', 'ET']) assert.equal(styleProp(O.shelf(code).badge, 'background'), THE_WHITE, code);
  // Singapore: never its gold accent beside the navy orb. Its badges are the navy of its tile, with white glyphs
  assert.deepEqual([styleProp(O.shelf('SQ').badge, 'background'), styleProp(O.shelf('SQ').badge, 'color')], [W._ORB_TILE_GROUNDS.SIA, '#fff']);
  // a ground where white reads at 3 to 1 or better keeps white: none is inked otherwise (KLM was, in
  // the navy its look names on its blue; its column is white now, with that navy)
  assert.deepEqual(inked.filter((c) => contrast('#FFFFFF', column(c).badgeBg) >= 3), []);
  assert.deepEqual([styleProp(O.shelf('KL').badge, 'background'), styleProp(O.shelf('KL').badge, 'color')], [THE_WHITE, LOOKS.KL.ink]);
  // a carrier the stylesheet paints: what the shelf always wrote, the accent and white
  for (const code of ['AA', 'DL', 'PD', 'UA', 'FR']) {
    const S = O.shelf(code);
    assert.ok(isVar(styleProp(S.badge, 'background')) && styleProp(S.badge, 'color') === '#fff', code);
  }
  // PAL: the accent still (the stylesheet paints the gold over it), and its navy for the glyphs, the
  // code chip, which takes the colour of its badge, and the emblem orb of the shelf
  for (const code of ['PB', 'SP']) {
    const S = O.shelf(code);
    assert.ok(isVar(styleProp(S.badge, 'background')), code);
    assert.deepEqual([styleProp(S.badge, 'color'), S.ink, styleProp(O.rail({ airlineCode: code }, code, code).badge, 'color')], ['#183677', '#183677', '#183677'], code);
  }
});
// ── the Your Aircraft orb ──────────────────────────────────────────────────
// Everything that can be in the orb: every code the name tables know, every designator the
// callsign table knows, the brand code of Air Canada Express, and two codes no table knows (one
// that asks for a symbol that was never drawn, one that asks for nothing).
const OPERATORS = [...new Set([...CODES, ...Object.keys(O.CALL), 'ACEX', 'ZZ', 'XYZ'])].sort();

// THE STYLESHEET PAINTS THE BOX OF THIS ORB ON THREE GATES. The box carries the class of the glyph
// badges (v2-fi-icon-badge), and a rule that paints the badges of a carrier with !important, with no
// column named in its selector, reaches it in the right column too: the red sphere of Delta, the
// white of American, the white of Porter. An inline background has no !important and loses, so on
// those gates the colour of a box that is not filled by a tile is the colour of that rule, whatever
// the gate writes. Read here from the stylesheets: the rule of the most weight for each carrier.
const BOX_PAINTED = (() => {
  const out = {}, weight = {};
  for (const css of [CSS, GATE_CSS]) for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const bg = /(?:^|;)\s*background:\s*([^;]*?)\s*!important/.exec(m[2]);
    if (!bg) continue;
    const sels = []; let depth = 0, cur = '';
    for (const ch of m[1]) { if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; if (ch === ',' && depth === 0) { sels.push(cur); cur = ''; } else cur += ch; }
    sels.push(cur);
    for (const sel of sels) {
      const flat = sel.replace(/:not\(#_\)/g, '').trim();
      if (!/ \.v2-fi-icon-badge$/.test(flat) || /gad-aircraft-col|g8-bir-shelves/.test(flat)) continue;   // the left rail and the shelf only
      const code = (/\[data-gate-airline="([A-Z0-9]{2})"\]/.exec(flat) || [])[1];
      if (!code) continue;
      const w = sel.split(':not(#_)').length;
      if (weight[code] > w) continue;
      weight[code] = w;
      // a flat colour, or the body colour of a sphere (the stop at 55 hundredths)
      out[code] = ((/(#[0-9a-f]{6}) 55%/i.exec(bg[1]) || /^(#[0-9a-f]{6})$/i.exec(bg[1]) || [])[1] || '').toUpperCase();
    }
  }
  return out;
})();

// The rules the orb of any gate and any operator is held to. Empty means it obeys them.
function cardBreaks(gate, op) {
  const r = W._gateCardOrb(gate, op), f = orbFacts(r.html), G = W._gateColumnLook(gate), A = art(f.src), out = [];
  const painted = BOX_PAINTED[G.carrier] || '';
  // a mark never without a disc: a clear box only under a finished tile that is on disk and fills it
  if (f.bg === 'transparent') {
    if (!(f.native && f.src && A.exists && f.fit === 'cover' && f.pad === '0')) out.push('no disc under ' + (f.src || 'the letters ' + f.letters));
  } else if (!HEX.test(full(f.bg)) && !isVar(f.bg)) out.push('a disc that is no colour: ' + f.bg);
  if (!f.src && !f.letters) out.push('an empty disc');
  // never a square in a circle: a finished square tile fills the box, with no padding round it, or it
  // is a ROUND inset inside the ring of a white disc (rule 6): cropped to a circle, the white of every
  // white column round it, and never the marker class that takes the padding of the box away
  const square = /\/airline-tiles\//.test(f.src) && (!/\.svg(\?|$)/.test(f.src) || (A.exists && A.clearShare < 0.5));
  const fillsBox = f.fit === 'cover' && f.native && f.pad === '0';
  const roundInset = f.fit === 'cover' && !f.native && f.pad === RING_CARD && f.bg === THE_WHITE && /border-radius:50%;/.test(f.imgStyle);
  if (square && !(fillsBox || roundInset)) out.push('a square tile inside a padded disc: ' + f.src);
  if (r.inset && !roundInset) out.push('an inset that is not a round picture inside a white ring: ' + f.style + ' / ' + f.imgStyle);
  // a white disc is the one white, and nothing on it is inked white
  if (r.white && (f.bg !== THE_WHITE || f.inked)) out.push('a white disc that is ' + f.bg + (f.inked ? ', with a white mark on it' : ''));
  // A WHITE DISC IS NEVER WRITTEN INTO A BOX THE STYLESHEET PAINTS, and never on a gate left as drawn:
  // its white would be repainted (a white ring came out Delta red), and its letters, in the ink of a
  // brand, would land on that paint
  if ((painted || isKept(gate)) && (r.white || r.inset || /--orb-ring/.test(f.style))) out.push('a white disc written on a gate left as drawn' + (painted ? ', into a box the stylesheet paints ' + painted : ''));
  // never white on a ground under 3 to 1. The colour of the disc: the paint of the stylesheet where
  // it paints this box and no tile covers it, else what the box writes, or the accent of the gate
  // where it writes the accent variable.
  // (the mark of the gate carrier itself on its own painted box is the business of the stylesheet,
  // which has rules for it: the p of Porter, the symbol of American)
  const disc = (painted && !f.native && !r.own) ? painted
    : HEX.test(full(f.bg)) ? f.bg : (isVar(f.bg) && !G.css) ? O.accent(G.carrier) : '';
  // (the markup of an operator is judged whether or not its file is on disk: it never asks for white
  // on a light disc. A gate carrier with no art of its own is the business of the column, and of the ledger.)
  if (disc && f.inked && (A.exists || !r.own) && contrast('#FFFFFF', disc) < 3 && !APPROVED_WHITE.includes(O.fold(r.code))) {
    out.push('a white mark on ' + disc + ' at ' + contrast('#FFFFFF', disc).toFixed(2) + ' to 1: ' + f.src);
  }
  if (disc && f.letters && contrast(f.lettersInk || '#FFFFFF', disc) < 3) out.push('the letters ' + (f.lettersInk || 'white') + ' on ' + disc + ' at ' + contrast(f.lettersInk || '#FFFFFF', disc).toFixed(2) + ' to 1');
  // an ink that is not white is written so that it wins over the stylesheet, which sets these letters white
  if (f.letters && f.lettersStyle && !WHITE.test(f.lettersInk) && !inkWins(f.lettersStyle)) out.push('the letters are inked in a style the stylesheet beats, so they stay white: ' + f.lettersStyle);
  // and never an emblem of several colours inked white
  if (f.inked && A.exists && (!A.colours || A.colours.filter((c) => !/^#F[C-F]F[C-F]F[C-F]$/i.test(c)).length > 1)) out.push('a colour emblem inked white: ' + f.src);
  return out;
}

test('the Your Aircraft orb, every gate carrier with every operator: a mark never without a disc, never a square in a circle, never white under 3 to 1', () => {
  // THE FULL PRODUCT: every named code as the gate, with no operator and with each of the operators above.
  let pairs = 0, operated = 0;
  const wrong = [], whiteBox = {};
  for (const gate of CODES) {
    const boxWhite = BOX_PAINTED[O.fold(gate)] === THE_WHITE;
    for (const op of [''].concat(OPERATORS)) {
      pairs++;
      const r = W._gateCardOrb(gate, op);
      if (!r.own) operated++;
      let b = cardBreaks(gate, op);
      // WHITE ON THE WHITE BOX OF AMERICAN AND OF PORTER: found by this test once it applied the paint
      // of the stylesheet, and older than this audit. Counted apart, below, and not put right here.
      if (boxWhite) {
        const old = b.filter((s) => /^(a white mark on #FFFFFF at 1\.00 to 1|the letters white on #FFFFFF at 1\.00 to 1)/.test(s));
        if (old.length) { const k = O.fold(gate) + (/^a white mark/.test(old[0]) ? ' marks' : ' letters'); (whiteBox[k] = whiteBox[k] || new Set()).add(op); }
        b = b.filter((s) => !old.includes(s));
      }
      if (b.length && wrong.length < 40) wrong.push(gate + ' gate, operated by ' + (op || 'itself') + ': ' + b.join('; '));
    }
  }
  assert.deepEqual(wrong, [], wrong.join('\n'));
  // ON A GATE LEFT AS DRAWN AN OPERATOR IS DRAWN AS IT WAS, AND THAT INCLUDES A FAULT. The stylesheet
  // paints the box of this orb white on an American and on a Porter gate, over whatever disc the
  // gate writes. An operator whose mark is one colour, inked white for the disc of its own colour,
  // is then white on white there, and so are white letters. No pair of a real schedule is among them
  // (the regionals of American print American; SkyWest, Mesa and the partners of both draw a tile
  // that fills the box), and the instruction for the approved gates is to leave them exactly as they
  // were, so they are counted here, by operator, and reported: the count moves only on purpose.
  // (One more of each with FJI in the designator table: a second name for Fiji Airways, whose mark
  // was counted under FJ already.)
  assert.deepEqual(Object.fromEntries(Object.entries(whiteBox).map(([k, v]) => [k, v.size])), { 'AA letters': 3, 'AA marks': 113, 'PD letters': 3, 'PD marks': 111 });
  assert.ok(whiteBox['AA marks'].has('FJ') && whiteBox['AA marks'].has('FJI') && whiteBox['PD marks'].has('FJ') && whiteBox['PD marks'].has('FJI'));
  // every one of them is an operator whose own mark is inked white for a disc of its own colour, or
  // a code that letters itself: none is a tile, and none is a white disc of this rule
  for (const [k, ops] of Object.entries(whiteBox)) for (const op of ops) {
    const f = orbFacts(W._gateCardOrb(k.slice(0, 2), op).html);
    assert.ok(!f.native && !/--orb-ring/.test(f.style) && (/letters$/.test(k) ? !!f.letters : f.inked), k + ' / ' + op);
  }
  // and the red box of Delta has none: white reads on its red
  assert.ok(contrast('#FFFFFF', BOX_PAINTED.DL) >= 3 && !Object.keys(whiteBox).some((k) => /^DL/.test(k)));
  assert.ok(pairs >= 70000 && operated >= 60000, pairs + ' pairs, ' + operated + ' with the art of the operator');
  // the cases the review named. A tile gate under an operator with no art: the letters land on a disc
  for (const [gate, op] of [['IB', 'YW'], ['KL', 'WA'], ['AY', 'N7'], ['SK', 'WX'], ['QF', 'QQ'], ['EK', 'FZ']]) {
    const f = orbFacts(W._gateCardOrb(gate, op).html);
    assert.ok(HEX.test(full(f.bg)) || isVar(f.bg), gate + '/' + op + ': a disc, ' + f.bg);
    assert.ok(f.pad !== '0' && f.fit === 'contain' && !f.native, gate + '/' + op + ': a padded disc for a mark or its letters');
  }
  // a tile gate under an operator with an emblem: the disc of that operator, padded, the mark contained.
  // Air Canada on a KLM or an ANA gate: its red stands out on their navy panels. Air France on a KLM
  // gate: its navy disc would sink into the navy of that panel, so it is the white disc of Air
  // France there, the virgule in its red.
  for (const [gate, op, disc, inked] of [['NH', 'AC', O.BRAND.AC.accent, true], ['KL', 'AC', O.BRAND.AC.accent, true], ['KL', 'AF', THE_WHITE, false], ['IB', 'BA', THE_WHITE, false], ['B6', 'AA', THE_WHITE, false]]) {
    const f = orbFacts(W._gateCardOrb(gate, op).html);
    assert.deepEqual([f.bg, f.fit, f.native, f.inked], [disc, 'contain', false, inked], gate + '/' + op);
    assert.equal(f.src, W._gateOrbParts(op).path, gate + '/' + op);
  }
  // AN OPERATOR WHOSE ART IS A TILE. On a gate left as drawn the tile fills the orb, as it always
  // did: SkyWest on an American and on an Air Canada gate, JetBlue on a WestJet gate, Iberia on a
  // Porter gate, and Swiss on a Lufthansa gate, where its red stands out on that navy panel.
  for (const [gate, op, tile] of [['LH', 'LX', 'SWR'], ['AA', 'OO', 'SKW'], ['AC', 'OO', 'SKW'], ['DL', 'OO', 'SKW'], ['UA', 'YV', 'ASH'], ['WS', 'B6', 'JBU'], ['PD', 'IB', 'IBE']]) {
    const f = orbFacts(W._gateCardOrb(gate, op).html);
    assert.deepEqual([f.src, f.bg, f.pad, f.fit, f.native, f.inked], ['/logos/airline-tiles/' + tile + '.svg', 'transparent', '0', 'cover', true, false], gate + '/' + op);
    assert.match(f.cls, /v2-fi-orbwrap-native/, gate + '/' + op + ': the class that takes the padding of the stylesheet away');
  }
  // On any other gate it fills the orb where it stands out on the lower right panel OF THAT GATE, and
  // is a round inset inside the white ring where it would sink there: judged against the panel it is
  // drawn on, never against the card of its own gate, which is not on this screen.
  for (const [gate, op, tile, inset] of [['IB', 'OO', 'SKW', false], ['QF', 'JQ', 'JST', false], ['AY', 'IB', 'IBE', false], ['TP', 'OS', 'AUA', false],
    ['B6', 'OO', 'SKW', true], ['KL', 'OO', 'SKW', true], ['AY', 'B6', 'JBU', true], ['SK', 'AY', 'FIN', true], ['QR', 'IB', 'IBE', true]]) {
    const r = W._gateCardOrb(gate, op), f = orbFacts(r.html), g = W._ORB_TILE_GROUNDS[tile] || LOOKS[op].ground, lower = W._gateCardPaint(gate).lower;
    assert.equal(sinks(g, lower), inset, gate + '/' + op + ': ' + g + ' on ' + lower);
    assert.deepEqual([f.src, f.bg, f.pad, f.fit, f.native, f.inked, r.inset], ['/logos/airline-tiles/' + tile + '.svg'].concat(inset ? [THE_WHITE, RING_CARD, 'cover', false, false, true] : ['transparent', '0', 'cover', true, false, false]), gate + '/' + op);
    assert.match(f.imgStyle, /border-radius:50%;/, gate + '/' + op + ': round either way');
  }
  // (SkyWest has a white column on its own gate, and Iberia the dark plate: neither says what its orb
  // is on the panel of another gate)
  assert.deepEqual([column('OO').L.white, column('IB').L.white], [true, false]);
  // EVERY GATE NOT LEFT AS DRAWN, EVERY OPERATOR: no disc that lands on the lower right panel is the
  // colour of that panel. The disc is read off the markup: the background the box writes, the accent
  // of the gate where it writes the accent variable, and under a tile that fills a clear box the
  // ground the script read from that tile (else the rim of the file, else the colour of its carrier).
  // An operator whose own gate is left as drawn is judged like any other: that list is a list of
  // gates. Only the two whose art carries a rim of its own are left out, Alaska and Turkish: the
  // rim drawn in the file stands between the disc and the panel, and it is checked below.
  const tileGround = (src, code) => {
    const name = (/\/airline-tiles\/([^/?]+)\.svg/.exec(src) || [])[1];
    return (name && W._ORB_TILE_GROUNDS[name]) || (LOOKS[O.fold(code)] || {}).ground || O.accent(O.fold(code));
  };
  const sunk = [], whitened = [], keptWhite = {};
  let judged = 0, keptJudged = 0;
  for (const gate of CODES) {
    if (isKept(gate)) continue;
    const lower = W._gateCardPaint(gate).lower, G = W._gateColumnLook(gate);
    for (const op of [''].concat(OPERATORS)) {
      const r = W._gateCardOrb(gate, op), f = orbFacts(r.html);
      if (!r.own && W._ORB_ART_RIMMED[O.fold(r.code)]) continue;
      judged++;
      if (!r.own && isKept(r.code)) { keptJudged++; if (r.white) keptWhite[O.fold(r.code)] = (keptWhite[O.fold(r.code)] || 0) + 1; }
      const disc = HEX.test(full(f.bg)) ? full(f.bg) : isVar(f.bg) ? full(O.accent(G.carrier)) : full(tileGround(f.src, r.code));
      if (sinks(disc, lower) && sunk.length < 30) sunk.push(gate + ' gate, operated by ' + (op || 'itself') + ': ' + disc + ' on ' + lower);
      // and a disc is white only where the column of the gate is white, or where the disc its art
      // gives would have sunk into this panel
      if (r.white && !(r.own && G.white)) {
        const N = W._gateOrbNatural(r.code), onGate = !N.ground && !W._CARD_ORB_GROUND[O.fold(r.code)] && !(O.BRAND[O.fold(r.code)] || {}).accent && !O.ACCENT[O.fold(r.code)] && !W._gateOwnAccent(O.fold(r.code));
        const natural = full(onGate && !N.disc ? (G.bg || O.accent(G.carrier)) : (N.ground || W._CARD_ORB_GROUND[O.fold(r.code)] || (O.BRAND[O.fold(r.code)] || {}).accent || O.accent(O.fold(r.code))));
        if (!sinks(natural, lower) && whitened.length < 30) whitened.push(gate + ' gate, operated by ' + (op || 'itself') + ': white, and ' + natural + ' stands out on ' + lower);
      }
    }
  }
  assert.deepEqual(sunk, [], sunk.join('\n'));
  assert.deepEqual(whitened, [], whitened.join('\n'));
  assert.ok(judged >= 60000, judged + ' orbs judged against the panel they sit on');
  // ON A GATE LEFT AS DRAWN the orb of an operator is the recipe of its art, never the white disc:
  // the function says so in one place, and no pair writes one (the rule above, in cardBreaks)
  const fn = block('window._gateCardOrb = function');
  assert.match(fn, /var opParts = window\._gateOrbNatural\(op\);/);
  assert.match(fn, /if \(!P\.white && !window\._gateColumnKept\(gate\) && \(own \|\| onGateDisc \|\| !window\._ORB_ART_RIMMED\[c\]\)\) \{/);
  assert.equal(fn.split('_gateColumnKept(').length - 1, 1, 'the list of gates left as drawn is asked of the gate alone, never of the operator');
  // THE OPERATORS FROM THE LIST OF GATES LEFT AS DRAWN ARE IN THE WALK ABOVE: every one of them on
  // every gate that is judged, and those whose disc would have sunk into a panel are white there.
  assert.ok(keptJudged >= 9000, keptJudged + ' orbs of an operator whose own gate is left as drawn, judged');
  assert.deepEqual(Object.keys(keptWhite).sort(), ['4N', '5T', 'AC', 'CS', 'DL', 'FR', 'LX', 'MU', 'NZ', 'PB', 'PD', 'QK', 'RV', 'TS', 'UA', 'XP', 'YN']);
  // THE TWO LEFT OUT, AND WHY: the art of each is a finished disc inside a light rim of its own,
  // with no ground on record, and that rim sinks into no lower panel of any gate.
  assert.deepEqual(W._ORB_ART_RIMMED, { AS: 1, TK: 1 });
  for (const code of Object.keys(W._ORB_ART_RIMMED)) {
    const N = W._gateOrbNatural(code), A = art(N.path);
    assert.ok(isKept(code) && A.exists && N.native && !N.ground, code + ': ' + N.path);
    assert.ok(HEX.test(A.rim) && A.rimShare >= 0.5 && lum(A.rim) >= 0.85, code + ': a light rim, ' + A.rim + ' on ' + A.rimShare.toFixed(2) + ' of it');
    for (const gate of CODES) if (!isKept(gate)) assert.ok(!sinks(A.rim, W._gateCardPaint(gate).lower), code + ' on a ' + gate + ' gate: the rim ' + A.rim + ' on ' + W._gateCardPaint(gate).lower);
    for (const gate of ['IB', 'KL', 'B6', 'SQ']) {
      const f = orbFacts(W._gateCardOrb(gate, code).html);
      assert.deepEqual([f.src, f.bg, f.pad, f.fit, f.native], [N.path, 'transparent', '0', 'cover', true], gate + '/' + code + ': the roundel as it is drawn');
    }
  }
  // Porter on the default panel, where its navy disc was 19 from that panel: the white disc, its
  // tile inside the ring. Ryanair and Transat on a navy panel the same way; on a panel their discs
  // stand out on, as they were drawn. Avelo: its mark for a light ground. Air New Zealand, a black
  // tile on a near black panel: the inset. Delta: its red sphere is judged as the red the table of
  // looks records, not as the navy of its accent, so it stays on the default panel.
  const DEFAULT_PANEL = '#0C1119';
  assert.equal(W._gateCardPaint('IB').lower, DEFAULT_PANEL);
  for (const [gate, op, src, inset] of [['IB', 'PD', LOOKS.PD.whiteArt, true], ['IB', 'POE', LOOKS.PD.whiteArt, true], ['B6', 'FR', LOOKS.FR.whiteArt, true], ['B6', 'TS', LOOKS.TS.whiteArt, true],
    ['B6', 'XP', LOOKS.XP.whiteArt, false], ['IB', 'NZ', '/logos/airline-tiles/NZ-Emblem.svg', true]]) {
    const r = W._gateCardOrb(gate, op), f = orbFacts(r.html);
    assert.deepEqual([f.src, f.bg, f.inked, f.native, r.white, r.inset, f.pad], [src, THE_WHITE, false, false, true, inset, inset ? RING_CARD : PAD], gate + '/' + op);
  }
  for (const [gate, op, src, bg, inked] of [['IB', 'FR', '/logos/symbols/airlines/FR.svg', '#073590', true], ['IB', 'TS', '/logos/airline-tiles/TSC-star-white.svg', '#00B3F0', false], ['IB', 'XP', O.FILES.XP, '#502E90', false]]) {
    const r = W._gateCardOrb(gate, op), f = orbFacts(r.html);
    assert.deepEqual([f.src, full(f.bg).toUpperCase(), f.inked, r.white], [src, bg, inked, false], gate + '/' + op + ': as drawn where it stands out');
  }
  assert.ok(dE('#1A3A6B', DEFAULT_PANEL) < SINK.deltaE && sinks('#1A3A6B', DEFAULT_PANEL), 'the navy of Porter on the default panel: ' + dE('#1A3A6B', DEFAULT_PANEL).toFixed(1));
  const dl = orbFacts(W._gateCardOrb('IB', 'DL').html);
  assert.deepEqual([dl.src.split('?')[0], dl.bg, dl.native, sinks(LOOKS.DL.ground, DEFAULT_PANEL), sinks(O.accent('DL'), DEFAULT_PANEL)], ['/logos/airlines/us-major/delta-glossy-orb.png', 'transparent', true, false, true]);
  assert.match(fn, /try \{ shown = String\(opRow\.ground \|\| getAirlineAccent\(c\) \|\| ''\); \}/);
  // NO WHITE DISC OF ANY OPERATOR LOSES ITS MARK. On every gate that is judged, where the orb of an
  // operator is the white disc with a mark on it (not a tile inside the ring, which brings its own
  // ground), the colour that fills most of that mark reads on white at 3 to 1.
  const lost = [];
  let marks = 0;
  for (const gate of CODES) {
    if (isKept(gate)) continue;
    for (const op of OPERATORS) {
      const r = W._gateCardOrb(gate, op), f = orbFacts(r.html);
      if (r.own || !r.white || r.inset || !f.src) continue;
      const A = art(f.src);
      if (!A.exists || !A.main) continue;   // a file that was never drawn letters the code; a bitmap is colour art
      marks++;
      if (contrast(A.main, THE_WHITE) < 3 && lost.length < 20) lost.push(gate + ' gate, operated by ' + op + ': ' + f.src + ' is ' + A.main + ' on white');
    }
  }
  assert.deepEqual(lost, [], lost.join('\n'));
  assert.ok(marks >= 1000, marks + ' marks on a white disc');
  assert.match(fn, /try \{ lower = window\._gateCardPaint\(gate\)\.lower; \}/, 'the panel of the gate, not of the operator');
  // the boxes the stylesheet paints, read from the stylesheets: the three the table of looks records
  assert.deepEqual(BOX_PAINTED, { AA: '#FFFFFF', DL: '#E01933', PD: '#FFFFFF' });
  for (const [c, colour] of Object.entries(BOX_PAINTED)) assert.ok(same(LOOKS[c].ground, colour) && LOOKS[c].css === 1 && isKept(c), c);
  // Delta, and Endeavor which prints it: under every operator a tile that fills the box, or a mark or
  // letters in white on the red (the review found 126 tiles in a ring of that red, and letters in a
  // red ink on it at 1.05 to 1)
  for (const gate of ['DL', '9E']) for (const op of OPERATORS) {
    const r = W._gateCardOrb(gate, op), f = orbFacts(r.html);
    assert.ok(!r.white && !r.inset && !/--orb-ring/.test(f.style), gate + '/' + op);
    if (f.native) assert.deepEqual([f.pad, f.fit], ['0', 'cover'], gate + '/' + op);
    else if (f.letters) assert.ok(!f.lettersInk || contrast(full(f.lettersInk), BOX_PAINTED.DL) >= 3, gate + '/' + op + ': ' + f.lettersStyle);
  }
  for (const op of ['OO', 'YV', 'KL', 'B6', 'SK', 'AZ']) assert.equal(orbFacts(W._gateCardOrb('DL', op).html).native, true, 'DL/' + op + ': the tile is the disc');
  for (const op of ['DI', 'D8', 'P6', '3U', 'HX', 'JD']) { const f = orbFacts(W._gateCardOrb('DL', op).html); assert.ok(f.inked || (f.letters && !f.lettersInk), 'DL/' + op + ': white on the red'); }
  // an operator no table knows, on a gate whose column is light: its mark is not inked white there
  for (const [gate, ground] of [['TR', '#FFE900'], ['BT', '#CDDA32'], ['VY', '#FFCC00'], ['AY', THE_WHITE], ['KL', THE_WHITE]]) {
    const f = orbFacts(W._gateCardOrb(gate, 'ZZ').html);
    assert.deepEqual([f.bg, f.inked, f.src], [ground, false, '/logos/symbols/airlines/ZZ.svg'], gate + ': the disc of the column, no white filter');
  }
  // and on a gate whose column is a colour white reads on (Austrian, on the dark plate), it is
  assert.deepEqual([orbFacts(W._gateCardOrb('OS', 'ZZ').html).bg, orbFacts(W._gateCardOrb('OS', 'ZZ').html).inked], [LOOKS.OS.ground, true]);
  // WestJet Encore on a WestJet gate keeps its white leaf: its own column is approved white
  assert.deepEqual([orbFacts(W._gateCardOrb('WS', 'WR').html).inked, orbFacts(W._gateCardOrb('WS', 'WR').html).bg], [true, O.ACCENT.WR]);
  // letters, where no file is asked for, are inked to read on their disc: white on a dark accent,
  // dark on a light one (a code no table knows, given a light accent for the length of this check)
  // (a code no table knows has the fallback blue for its gate: a blue disc on a card of that blue, so
  // its own column is white and its letters are in that blue)
  assert.deepEqual([orbFacts(W._gateCardOrb('XYZ', '').html).letters, orbFacts(W._gateCardOrb('XYZ', '').html).lettersInk, orbFacts(W._gateCardOrb('XYZ', '').html).bg], ['XYZ', '#0033A1', THE_WHITE]);
  // given a yellow accent, the yellow would sink into the khaki its card would be, so its card is the
  // dark plate and it keeps the yellow disc, with dark letters; the same with a dark of its own
  O.ACCENT.XYZ = '#FFE900';
  try {
    for (const own of ['', '#000000']) {
      if (own) W._GATE_CARD_DARKS.XYZ = own;
      assert.deepEqual([W._gateCardDark('XYZ'), W._gateCardPaint('XYZ').kind], [own || HOUSE_DARK, 'dark']);
      const f = orbFacts(W._gateCardOrb('XYZ', '').html);
      assert.deepEqual([f.letters, f.bg], ['XYZ', 'var(--airline-accent,#D82F2E)']);
      assert.ok(f.lettersInk && contrast(f.lettersInk, '#FFE900') >= 4.5, 'dark letters on a light disc: ' + f.lettersInk);
      assert.deepEqual(cardBreaks('XYZ', ''), []);
    }
  } finally { delete O.ACCENT.XYZ; delete W._GATE_CARD_DARKS.XYZ; }
  // no gate carrier at all shows a mark or letters on a clear box (120 did, 31 before that)
  const bare = (op) => CODES.filter((g) => { const f = orbFacts(W._gateCardOrb(g, op).html); return f.bg === 'transparent' && !(f.native && art(f.src).exists); });
  for (const op of ['ZZ', 'AC', 'AF', 'XYZ']) assert.deepEqual(bare(op), [], 'operator ' + op);
});

test('the Your Aircraft orb keeps what it drew where that was a recorded choice: Rouge, PAL and Jazz on an Air Canada gate', () => {
  // gate, operator: the file, the ground, white ink, contained in a padded disc. As origin/main drew them.
  for (const [gate, op, file, ground] of [
    ['AC', 'RV', '/logos/airlines/canadian/rouge-r.svg', '#A21C37'],
    ['AC', 'ROU', '/logos/airlines/canadian/rouge-r.svg', '#A21C37'],
    ['AC', 'PB', '/logos/airline-tiles/PB-arrow.svg?v=3', '#e37222'],
    ['AC', 'QK', '/logos/airlines/canadian-regional/jazz-j.svg', '#ce3728'],
    ['AC', 'JZA', '/logos/airlines/canadian-regional/jazz-j.svg', '#ce3728']
  ]) {
    const f = orbFacts(W._gateCardOrb(gate, op).html);
    assert.deepEqual([f.src, f.bg, f.inked, f.fit, f.pad, f.native], [file, ground, true, 'contain', 'clamp(6px,0.9vh,13px)', false], gate + ' operated by ' + op);
    assert.ok(contrast('#FFFFFF', ground) >= 3, 'white on ' + ground + ' = ' + contrast('#FFFFFF', ground).toFixed(2));
  }
  assert.deepEqual(W._CARD_ORB_GROUND, { QK: '#ce3728', RV: '#A21C37', ROU: '#A21C37' });
  // the PAL ground is the accent of the brand table, back at the value the pass always painted: on
  // the published yellow #FFA400 the white arrow read at 1.99 to 1
  assert.equal(O.BRAND.PB.accent, '#e37222');
  assert.ok(contrast('#FFFFFF', '#FFA400') < 2 && contrast('#FFFFFF', O.BRAND.PB.accent) >= 3);
  // Air Canada on its own leg, and under the brand codes that are Air Canada: its own orb
  const ac = W._gateCardOrb('AC', '').html;
  for (const op of ['AC', 'ACEX', 'ZX', '9M', 'ACA']) assert.equal(W._gateCardOrb('AC', op).html, ac, op);
  assert.deepEqual([orbFacts(ac).src, orbFacts(ac).bg, orbFacts(ac).inked], ['/logos/airlines/canadian/AC.TO.svg', O.BRAND.AC.accent, true]);
  // an operator with no emblem of its own leaves the orb to the gate carrier, never its letters
  for (const c of ['YX', 'G7', 'ZW', 'C5', 'CP']) {
    assert.equal(O.art(c), '', c + ': no file is asked for, so nothing fails to the letters');
    for (const gate of ['UA', 'DL', 'AA']) assert.equal(W._gateCardOrb(gate, c).html, W._gateCardOrb(gate, '').html, gate + ' operated by ' + c);
  }
});

test('the two builders of the Your Aircraft orb and the pass that re-points it write the orb the one function gives', () => {
  // A REPRESENTATIVE SET of operators for the lines cut from the builders (they hold no rule of their own:
  // each resolves who flies the leg and asks the one function): one of every kind of orb, with every gate.
  const REP = ['', 'ZZ', 'XYZ', 'ACEX', 'AC', 'QK', 'JZA', 'RV', 'PB', 'WS', 'WR', 'TS', 'PD', 'F8', 'OO', 'SKW', 'YV', 'YX', '9E', 'AA', 'DL', 'UA', 'AS', 'HA', 'BA', 'AF', 'KE', 'IB', 'LH', 'QF', 'W6', 'P6', 'D8', 'WG', '8P', 'CS', 'BW'];
  const noInk = (h) => h.replace(/(<span class="v2-fi-orb-code") style="[^"]*"/, '$1');
  let n = 0;
  for (const gate of CODES) {
    for (const op of REP) {
      n++;
      const want = W._gateCardOrb(gate, op).html, row = { airlineCode: gate, currentFlight: { _opCode: op, airline: gate } };
      // the builders write the box, the image and the letters themselves, from what the function hands them
      const a = O.cardWithInbound(row), b = O.cardNoInbound(row, null, gate, null);
      assert.equal(a, '<div class="v2-fi-iconcol">' + noInk(want) + '</div>', gate + '/' + op + ': the card with an inbound');
      assert.equal(b, a, gate + '/' + op + ': the card with no inbound');
      // the pass then sets the orb of the operator the evidence names: here the same one
      assert.equal(O.pass('<x>' + a + '</x>', gate, op || gate), '<x><div class="v2-fi-iconcol">' + want + '</div></x>', gate + '/' + op + ': after the pass');
    }
    // and it re-points: built for one operator, then told another, or told that the gate carrier flies it
    const other = O.cardWithInbound({ airlineCode: gate, currentFlight: { _opCode: 'OO', airline: gate } });
    for (const op of ['QK', 'ZZ', gate]) {
      assert.equal(O.pass(other, gate, op), '<div class="v2-fi-iconcol">' + W._gateCardOrb(gate, op).html + '</div>', gate + ': re-pointed at ' + op);
    }
  }
  assert.ok(n >= 8000, n + ' rows');
  // the pass rebuilds the orb whole; it patches no string and keeps no list of its own
  assert.match(PASS, /var _opCardOrb = window\._gateCardOrb\(_mktCode6, _opCode\);/);
  assert.doesNotMatch(PASS, /_CARD_COLOR_EMBLEMS|invert\(1\)|AIRLINE_BRAND|background:var/);
  // the builder with an inbound resolves the operator BEFORE it asks for the orb (it asked on the line above)
  assert.ok(MC_VARS.indexOf('var _mcOrbOp = ') < MC_VARS.indexOf('window._gateCardOrb('));
  assert.ok(MC_VARS.indexOf('window._gateCardOrb(') < MC_VARS.indexOf('var _mcParts = '));
  assert.doesNotMatch(MC_VARS + NI_VARS, /window\._gateOrbParts\(/, 'neither builder asks the recipe itself');
  // when the art fails and the letters go in, a clear box takes its disc and its padding back
  const failed = block('window._orbArtFailed = function');
  assert.match(failed, /wrap\.classList\.remove\('v2-fi-orbwrap-native'\)/);
  assert.match(failed, /wrap\.style\.setProperty\('background', 'var\(--airline-accent,#D82F2E\)'\);\s*\n\s*wrap\.style\.setProperty\('padding', 'clamp\(6px,0\.9vh,13px\)'\);/);
  assert.match(failed, /if \(\(1\.05 \/ \(lum \+ 0\.05\)\) < 3\) span\.style\.setProperty\('color', '#10151f', 'important'\);/, 'and the letters are dark wherever white is under 3 to 1');
  assert.ok(failed.indexOf("wrap.style.setProperty('background'") < failed.indexOf('var lum = '), 'the disc is given before the ink is picked from it');
});

// ── one ink on the disc of the gate ────────────────────────────────────────
test('what lands on the disc of the gate takes the ink of the gate: one column, one ink', () => {
  // KLM under Cityhopper, an operator with no file and no colour. Its orb sits on the disc of the gate.
  // That disc was the blue of KLM, where white still reads at 3 to 1, so ink by contrast alone gave
  // white letters beside glyphs and a code in the navy the look of KLM names. The disc is white now
  // (rule 6: the blue sank into the blue card), and the ink is that navy still.
  const kl = W._gateCardOrb('KL', 'WA'), f = orbFacts(kl.html), L = W._gateColumnLook('KL');
  assert.ok(contrast('#FFFFFF', W._gateOrbNatural('KL').ground) >= 3 && same(L.ink, LOOKS.KL.ink) && !WHITE.test(L.ink), 'white reads on the blue of KLM, and the look names ' + L.ink + ' all the same');
  assert.equal(L.bg, THE_WHITE);
  assert.ok(!fs.existsSync(path.join(FC, 'logos/symbols/airlines/WA.svg')), 'the symbol it asks for was never drawn');
  assert.deepEqual([kl.code, f.src, f.bg, f.inked], ['WA', '/logos/symbols/airlines/WA.svg', L.bg, false], 'the mark of the operator on the disc of the gate, with no white filter');
  assert.equal(styleProp(f.style, '--orb-ink'), LOOKS.KL.ink, 'the box names the ink of the column');
  // the file fails, and the handler of the page sets the letters: in that ink, written to win
  const end = SHOWN.orb(kl.html, O.accent('KL'));
  assert.deepEqual([end.missed, end.src, end.letters, end.ink, end.inkImportant], [true, '', 'WA', LOOKS.KL.ink, true]);
  assert.equal(column('KL').badge.ink, end.ink, 'the ink of the five glyph badges of that gate');
  // EVERY GATE, under an operator with no colour of its own. Where the look of the gate names an ink
  // that is not white, the box names it, the mark drops the white filter and the letters take it;
  // where the glyphs of the gate are white, nothing is named and the ink is picked by contrast, as it
  // was. One gate is neither: Lufthansa, whose navy disc would sink into the navy of its lower right
  // panel, so the orb is the white disc there, and the box names the navy for the letters.
  let named = 0, plain = 0;
  const whitened = [];
  for (const gate of CODES) {
    const G = W._gateColumnLook(gate), r = W._gateCardOrb(gate, 'ZZ'), o = orbFacts(r.html), ink = styleProp(o.style, '--orb-ink');
    assert.deepEqual([r.own, r.code, o.src], [false, 'ZZ', '/logos/symbols/airlines/ZZ.svg'], gate);
    const after = SHOWN.orb(r.html, O.accent(G.carrier));
    assert.equal(after.letters, 'ZZ', gate);
    if (r.white && !G.white) {
      whitened.push(gate);
      assert.deepEqual([o.bg, o.inked], [THE_WHITE, false], gate);
      assert.ok(same(ink, after.ink) && after.inkImportant && contrast(full(ink), THE_WHITE) >= 3, gate + ': the letters ' + after.ink + ' on the white disc');
      continue;
    }
    if (WHITE.test(G.ink)) {
      plain++;
      assert.equal(ink, '', gate + ': no ink named');
      assert.ok(after.ink === '' || (after.ink === '#10151f' && after.inkImportant), gate + ': white, or the dark ink where white does not read: ' + after.ink);
      continue;
    }
    named++;
    assert.ok(same(ink, G.ink), gate + ': the box names ' + ink + ', the look ' + G.ink);
    assert.equal(o.inked, false, gate + ': no white filter beside dark glyphs');
    assert.ok(same(after.ink, G.ink) && after.inkImportant, gate + ': the letters ' + after.ink);
    if (!G.css) assert.ok(same(column(gate).badge.ink, after.ink), gate + ': the ink of its glyph badges');
    if (!LEDGER[gate]) assert.ok(contrast(full(after.ink), G.ground) >= 3, gate + ': ' + after.ink + ' on ' + G.ground);
  }
  assert.deepEqual(whitened, ['LH']);
  // (the white columns and the light discs name the colour of the brand; a disc of a colour that
  // white reads on names nothing)
  assert.ok(named >= 140 && plain >= 70, named + ' gates name an ink, ' + plain + ' are white');
  // PAL is among them: the stylesheet paints that box gold, and the letters take its navy
  assert.equal(styleProp(orbFacts(W._gateCardOrb('PB', 'ZZ').html).style, '--orb-ink'), LOOKS.PB.ink);
  // an operator with a colour of its own is not on the disc of the gate: the ink of the gate is not
  // named. On a disc of colour nothing is named; a white disc of rule 6 names the ink of the column it
  // belongs to, the operator or the gate carrier itself, for the letters of a file that fails
  for (const [gate, op, ink] of [['KL', 'AC', ''], ['BA', 'IB', ''], ['QR', 'IB', O.ACCENT.IB], ['KL', 'AF', O.ACCENT.AF], ['KL', '', LOOKS.KL.ink], ['BT', '', ''], ['BT', 'LX', '']]) {
    assert.equal(styleProp(orbFacts(W._gateCardOrb(gate, op).html).style, '--orb-ink'), ink, gate + '/' + op);
  }
  // an operator is drawn by the recipe of its art, and one with no colour of its own sits on the disc
  // of the gate, whatever that disc is
  assert.match(block('window._gateCardOrb = function'), /var opParts = window\._gateOrbNatural\(op\);/);
  for (const gate of ['AC', 'TR', 'OS', 'UA', 'BT']) {
    const o = orbFacts(W._gateCardOrb(gate, 'ZZ').html), G = W._gateColumnLook(gate);
    assert.ok(G.css || isVar(o.bg) || same(o.bg, G.bg), gate + ': the unknown operator sits on ' + o.bg + ', the gate is ' + (G.bg || 'its accent'));
  }
  // the one function decides it, and the handler reads the ink the box names before it picks by contrast
  assert.match(block('window._gateCardOrb = function'), /if \(!whiteNow && onGateDisc && look && look\.ink && !white\.test\(look\.ink\)\) \{ ink = look\.ink; inkVar = '--orb-ink:' \+ ink \+ ';'; \}/);
  const failed = block('window._orbArtFailed = function');
  assert.match(failed, /wrap\.style\.getPropertyValue\('--orb-ink'\)/);
  assert.ok(failed.indexOf("getPropertyValue('--orb-ink')") < failed.indexOf('var lum = '), 'before the pick by contrast');
  // the variable is the business of the handler alone: no stylesheet rule reads it or keys on it
  assert.doesNotMatch(CSS + GATE_CSS, /--orb-ink\b/);
});

test('an ink that is not white is written to win over the stylesheet: the whole style of the letters, not the first colour in it', () => {
  // THE RULE IT HAS TO BEAT: the stylesheet sets the letters of the Your Aircraft orb white, with !important
  const flat = CSS.replace(/:not\(#_\)/g, '');
  const at = flat.indexOf('.g8-wrap .gad-map-col-v2 .v2-fi-orbwrap .v2-fi-orb-code {');
  assert.ok(at > 0, 'the rule of the letters');
  assert.match(flat.slice(at, flat.indexOf('}', at)), /color: #ffffff !important;/);
  // letters the one function writes itself, on a light disc (a code no table knows, given a yellow
  // accent for the length of this check, which puts it on the dark plate): the dark ink, with !important
  O.ACCENT.XYZ = '#FFE900';
  try {
    const f = orbFacts(W._gateCardOrb('XYZ', '').html);
    assert.deepEqual([f.letters, f.lettersStyle], ['XYZ', 'color:#1B2430 !important;']);
    assert.ok(inkWins(f.lettersStyle));
    assert.deepEqual(cardBreaks('XYZ', ''), []);
  } finally { delete O.ACCENT.XYZ; }
  // and on the white disc of rule 6: the colour of the brand, with !important
  for (const code of ['XYZ', 'YX', 'WAL']) {
    const f = orbFacts(W._gateCardOrb(code, '').html);
    assert.equal(f.lettersStyle, 'color:' + W._gateColumnLook(code).ink + ' !important;', code);
    assert.ok(inkWins(f.lettersStyle) && contrast(full(f.lettersInk), THE_WHITE) >= 3, code);
  }
  // on a disc of a colour that white reads on, nothing is written: the white of the stylesheet stands
  for (const code of ['DI', 'P6']) {
    const f = orbFacts(W._gateCardOrb(code, '').html);
    assert.deepEqual([f.letters, f.lettersStyle], [code, ''], code);
    assert.ok(contrast('#FFFFFF', f.bg) >= 3, code + ': white on ' + f.bg);
  }
  // the check reads the style, not the colour: the same ink without !important is a break
  assert.equal(inkWins('color:#1B2430;'), false);
  assert.equal(inkWins('color:#1B2430 !important;'), true);
  assert.equal(inkWins('color:#1B2430 !important;', true), false, 'the code chip needs the fill colour too');
  assert.equal(inkWins('color:#1B2430 !important;-webkit-text-fill-color:#1B2430 !important;', true), true);
  assert.equal(inkWins('background:#fff;-webkit-text-fill-color:#1B2430 !important;', true), false);
  // letters the missing-file handler sets: the ink the box names, and the dark ink it picks by
  // contrast on a light disc, both set as important (run here, against a stand-in for the image)
  for (const [gate, ink] of [['KL', LOOKS.KL.ink], ['BA', LOOKS.BA.ink], ['TS', '#10151f'], ['TR', LOOKS.TR.ink]]) {
    const end = SHOWN.orb(W._gateCardOrb(gate, 'ZZ').html, O.accent(gate));
    assert.deepEqual([end.letters, end.ink, end.inkImportant], ['ZZ', ink, true], gate);
  }
  const failed = block('window._orbArtFailed = function');
  assert.equal((failed.match(/span\.style\.setProperty\('color', [^)]*\)/g) || []).length, 2);
  for (const m of failed.match(/span\.style\.setProperty\('color', [^)]*\)/g)) assert.match(m, /, 'important'\)$/, m);
  // THE RAIL: the letters of a gate that reaches the placeholder of another code ride in the chip of
  // the destination code, whose colour and fill colour the stylesheet both set with !important
  const chip = CSS.indexOf('.v2-fi-icon-badge[style*="--orb-code-ink"] .v2-fi-orbcode:not(.v2-fi-orbcode-onaccent) {');
  assert.match(CSS.slice(chip, CSS.indexOf('}', chip)), /color: var\(--orb-code-ink\) !important;\s*-webkit-text-fill-color: var\(--orb-code-ink\) !important;/);
  for (const code of ['P6', 'D8', 'DI', 'YX', 'WAL']) {
    const { emb, L } = column(code), ink = L.ink;
    assert.equal(emb.lettersStyle, 'color:' + ink + ' !important;-webkit-text-fill-color:' + ink + ' !important;', code);
    assert.ok(inkWins(emb.lettersStyle, true), code);
  }
  // a white column whose file was never drawn: the rail hands its own handler the letters and the ink,
  // and the handler sets them as the chip is set, colour and fill colour, both important
  for (const code of ['QN', 'NK', 'ZZ']) {
    const html = O.rail({ airlineCode: code }, code, code).emblem, L = W._gateColumnLook(code);
    assert.ok(!art(L.art).exists && L.white, code + ': a white column, a file that is not on disk');
    assert.ok(html.includes('onerror="window._railOrbFailed(this,\'' + code + '\',\'' + L.ink + '\')"'), code + ': ' + html);
    assert.doesNotMatch(html, /fill:#fff/, code + ': never the white plane on the white disc');
  }
  // THE HANDLER, RUN. It draws the top orb of every white column whose file is not on disk, so it is
  // run here against a stand-in for the image and its box, and what it leaves is read: the image
  // gone, one span of the chip class, the letters of the row, and the ink on both properties the
  // stylesheet sets, each with !important.
  const railFailed = (() => {
    const made = [];
    const doc = { createElement: (tag) => { const el = { tag, className: '', textContent: '', set: {}, style: { setProperty(k, v, p) { el.set[k] = [v, p]; } } }; made.push(el); return el; } };
    const fn = new Function('window', 'document', block('window._railOrbFailed = function') + '\nreturn window._railOrbFailed;')({}, doc);
    return (letters, ink, already) => {
      const kids = already ? [{ className: 'v2-fi-orbcode' }] : [];
      const wrap = { querySelector: (sel) => kids.find((k) => '.' + k.className === sel) || null, appendChild: (n) => kids.push(n) };
      const img = { parentNode: wrap, removed: false, remove() { this.removed = true; } };
      made.length = 0;
      fn(img, letters, ink);
      return { removed: img.removed, kids, made: made.slice() };
    };
  })();
  let ran = 0;
  for (const code of CODES) {
    const { L, emb } = column(code);
    if (!L.white || !emb.src || art(emb.src).exists) continue;
    ran++;
    const args = /onerror="window\._railOrbFailed\(this,'([A-Z0-9]*)','(#[0-9A-Fa-f]{6})'\)"/.exec(O.rail({ airlineCode: code }, code, code).emblem);
    assert.ok(args, code + ': the rail names the handler');
    const end = railFailed(args[1], args[2]);
    assert.ok(end.removed && end.kids.length === 1 && end.made.length === 1, code + ': the image gone, one span in its place');
    const span = end.kids[0];
    assert.deepEqual([span.tag, span.className, span.textContent], ['span', 'v2-fi-orbcode', lettersOf(code)], code);
    assert.deepEqual(span.set, { color: [L.ink.toString(), 'important'], '-webkit-text-fill-color': [L.ink.toString(), 'important'] }, code + ': the ink of the column on both properties, both important');
    assert.ok(contrast(full(span.set.color[0]), THE_WHITE) >= 3 && !WHITE.test(span.set.color[0]), code + ': ' + span.set.color[0] + ' on the white disc');
  }
  assert.ok(ran >= 70, ran + ' white columns whose top orb the handler draws');
  // what it is handed is limited to the shape it has: letters and digits, three at most, and a hex
  // colour, with the dark ink of the boards where the colour is not one; and it never sets two spans
  const odd = railFailed('q<n>"9x', 'red').kids[0];
  assert.deepEqual([odd.textContent, odd.set.color, odd.set['-webkit-text-fill-color']], ['QN9', ['#1B2430', 'important'], ['#1B2430', 'important']]);
  assert.deepEqual([railFailed('QN', '#62142E', true).made.length, railFailed('QN', '#62142E', true).kids.length], [0, 1], 'letters already there are left alone');
  // A GATE ON THE DARK PLATE WHOSE FILE WAS NEVER DRAWN LETTERS ITS CODE TOO, in the ink of the
  // glyphs of its column. Its shelf orb and its Your Aircraft orb letter the code already, so the
  // generic plane made one gate of a plane and two sets of letters; and the plane is white, which on
  // the orange of Sunwing read at 2.28 to 1 above dark glyphs. Found from the tables: every code the
  // name tables and the designator tables know, whose card is the dark plate and whose art is a
  // file that is not on disk.
  const darkNoFile = [], darkPainted = [];
  for (const code of [...new Set([...CODES, ...Object.keys(O.CALL), ...Object.values(O.TILE).filter((d) => /^[A-Z]{3}$/.test(d))])].sort()) {
    const { L, emb, top, badge } = column(code);
    if (W._gateCardPaint(code).kind !== 'dark' || L.white || !L.art) continue;
    const html = O.rail({ airlineCode: code }, code, code).emblem, ink = full(L.ink).toUpperCase();
    // a tile that is the disc is on disk for every gate of the dark plate (the ledger holds the
    // five that are not, below, and none of them is a tile): its box is clear, so it is not handed
    // letters that would land on nothing
    if (emb.native) { assert.ok(art(L.art).exists, code + ': ' + L.art); assert.doesNotMatch(html, /_railOrbFailed/, code); continue; }
    // every other gate of the dark plate names the handler, file on disk or not: an image that
    // fails for any reason leaves the code, never the plane
    darkPainted.push(code);
    const args = /onerror="window\._railOrbFailed\(this,'([A-Z0-9]*)','(#[0-9A-Fa-f]{6})'\)"/.exec(html);
    assert.ok(args, code + ': the rail names the handler of the letters: ' + html.slice(-160));
    assert.deepEqual([args[1], args[2].toUpperCase()], [lettersOf(code), ink], code + ': its code, in the ink of its glyphs');
    assert.doesNotMatch(html, /fill:#fff|outerHTML/, code + ': never the generic plane');
    assert.ok(contrast(ink, full(top)) >= 3, code + ': ' + ink + ' on ' + top + ' = ' + contrast(ink, full(top)).toFixed(2));
    if (art(L.art).exists) continue;
    darkNoFile.push(code);
    // the disc of the column under the image, never a clear box: the letters land on a ground
    assert.ok(isVar(emb.bg) && emb.pad !== '0' && emb.src === L.art, code + ': a painted disc, ' + emb.bg);
    // the handler, run: the image gone, one span of the chip class, the code, the ink on both properties
    const end = railFailed(args[1], args[2]);
    assert.ok(end.removed && end.kids.length === 1 && end.made.length === 1, code + ': the image gone, one span in its place');
    const span = end.kids[0];
    assert.deepEqual([span.tag, span.className, span.textContent], ['span', 'v2-fi-orbcode', lettersOf(code)], code);
    assert.deepEqual(span.set, { color: [args[2], 'important'], '-webkit-text-fill-color': [args[2], 'important'] }, code);
    // one ink down the column: the ink the five badges write, and it reads on the disc at 3 to 1
    assert.ok(same(span.set.color[0], badge.ink), code + ': the letters ' + span.set.color[0] + ', the glyphs ' + badge.ink);
    assert.ok(contrast(ink, full(top)) >= 3, code + ': ' + ink + ' on ' + top + ' = ' + contrast(ink, full(top)).toFixed(2));
    // and the other two orbs of the gate letter the code when their file fails, as they did
    assert.match(W._gateCardOrb(code, '').html, /onerror="window\._orbArtFailed\(this,/, code + ': the Your Aircraft orb');
    assert.match(O.shelf(code).icon, /onerror="window\._orbArtFailed\(this,/, code + ': the shelf orb');
  }
  assert.deepEqual(darkNoFile, ['3U', 'FC', 'HX', 'JD', 'WG']);
  assert.ok(darkPainted.length >= 15 && darkNoFile.every((c) => darkPainted.includes(c)), darkPainted.join(' '));
  assert.deepEqual([column('WG').badge.ink, column('WG').top, contrast('#FFFFFF', column('WG').top) < 3], ['#1B2430', O.ACCENT.WG, true], 'Sunwing: dark glyphs on its orange, where white is under 3 to 1');
  assert.deepEqual([column('3U').L.white, W._gateCardPaint('3U').kind, column('3U').top], [false, 'dark', O.ACCENT['3U']]);
  // the plane is the last resort only where the file is asked for on a gate left as drawn, or on a
  // gate whose discs stood out without the dark plate
  assert.match(O.rail({ airlineCode: 'AC' }, 'AC', 'AC').emblem, /onerror="this\.outerHTML=/);
  const rail = block('function _emblemImg(code, rowCode) {');
  assert.match(rail, /try \{ _dkPlate = native \? '' : \(window\._gateCardDark\(rowCode \|\| code\) \|\| ''\); \}/);
  assert.match(rail, /try \{ _dkInk = String\(window\._gateColumnLook\(rowCode \|\| code\)\.ink \|\| ''\); \}/);
  // and every letters span either builder or the one function writes is read whole by this test
  assert.equal(orbFacts('<div class="v2-fi-icon-wrap" style="background:#fff;"><span class="v2-fi-orb-code" style="color:#123456;font-weight:800;">AB</span></div>').lettersStyle, 'color:#123456;font-weight:800;');
});

// ── no colour of its own ───────────────────────────────────────────────────
test('no gate with art of its own falls to the fallback blue, and the colour tables agree where the audit found them apart', () => {
  for (const code of CODES) {
    const { A, accent } = column(code);
    if (A.exists && !LEDGER[code]) assert.notEqual(accent.toUpperCase(), '#0033A1', code);
  }
  // a tile carrier with no row in the accent table takes the ground of its tile
  for (const [code, tile] of [['BF', 'FBU'], ['BR', 'EVA'], ['CI', 'CAL'], ['CZ', 'CSN'], ['G3', 'GLO'], ['GF', 'GFA'], ['HU', 'CHH'], ['LS', 'EXS'], ['ME', 'MEA'], ['MS', 'MSR'], ['OU', 'CTN'], ['RJ', 'RJA'], ['SY', 'SCX'], ['WK', 'EDW'], ['Y4', 'VOI'], ['GA', 'GIA'], ['KC', 'KZR'], ['VN', 'HVN'], ['AD', 'AZU']]) {
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
  // the ink on the pale body of a row whose bar moved follows the bar: the old colour stayed there
  for (const code of ['AF', 'QR', 'CM', '4N']) assert.equal(AB[code].bodyText, AB[code].r1, code + ' bodyText');
  assert.equal(AB['5T'].bodyText, '#91002F', 'Canadian North: the dark red of its guide (PMS 202 C), where a navy of no palette of its own stayed');
  assert.ok(contrast(AB['5T'].bodyText, AB['5T'].body) >= 7);
  // the two tables of fids-core.js: JetBlue and Southwest give one colour each
  assert.equal(O.BRAND.B6.accent, O.ACCENT.B6); assert.equal(O.ACCENT.B6, W._ORB_TILE_GROUNDS.JBU);
  assert.equal(O.BRAND.WN.accent, O.ACCENT.WN); assert.equal(O.ACCENT.WN, W._ORB_TILE_GROUNDS.SWA);
  // PAL: one blue (the published palblue) in the accent table, the look and the colour table; one gold string
  assert.equal(O.ACCENT.PB, '#183677'); assert.equal(LOOKS.PB.ink, O.ACCENT.PB); assert.equal(AB.PB.r1, O.ACCENT.PB);
  assert.equal(LOOKS.PB.ground, '#FCA404');
  assert.doesNotMatch(CORE + CSS + GATE_CSS + COLORS, /#FFA400/i, 'one gold, the one the stylesheet paints');
  assert.doesNotMatch(CORE, /'#1F3876'/i);
  // Azul: no accent row beside a tile of another navy; its accent is the ground of its tile
  assert.equal(O.ACCENT.AD, undefined); assert.equal(O.accent('AD'), W._ORB_TILE_GROUNDS.AZU);
  assert.deepEqual([W._gateOrbNatural('AD').ground, column('AD').badgeBg, column('AD').badge.ink], [W._ORB_TILE_GROUNDS.AZU, THE_WHITE, W._ORB_TILE_GROUNDS.AZU]);
  // each of these is the ground of the tile the orb draws, the same string
  for (const [code, tile] of [['U2', 'EZY'], ['CX', 'CPA'], ['IB', 'IBE'], ['AY', 'FIN'], ['EI', 'EIN'], ['A3', 'AEE'], ['PC', 'PGT'], ['EW', 'EWG'], ['MX', 'MXY'], ['EK', 'UAE']]) assert.equal(O.ACCENT[code], W._ORB_TILE_GROUNDS[tile], code);
  assert.equal(O.ACCENT.OS, LOOKS.OS.ground); assert.equal(O.ACCENT.CM, LOOKS.CM.ground);
  // the Your Aircraft disc of a carrier on its own leg, where it is written out from AIRLINE_BRAND, is the colour of the rail
  for (const [code, b] of Object.entries(O.BRAND)) {
    const L = W._gateColumnLook(code);
    if (L.css || L.bg || !b.accent) continue;
    assert.ok(dE(full(b.accent), L.ground) < 6, code + ': AIRLINE_BRAND accent ' + b.accent + ' beside the rail ' + L.ground);
  }
});

// ════════════════════════════════════════════════════════════════════════
// RULE 6: A DISC IS NEVER THE COLOUR OF THE PANEL BEHIND IT
//
// Forty-one gate screens were made and looked at in November 2026. Sixteen
// columns sank into their cards: red discs on a red card (Austrian, Iberia,
// Qantas, Norwegian, Emirates beside its red wave), blue on blue (KLM),
// magenta on plum (Wizz), yellow on khaki (Scoot), green on green (TAP,
// Frontier, Aer Lingus), navy on navy (Finnair, JetBlue, SAS, Azul,
// Aeromexico). Twelve stood out: white discs on a colour (Korean, Qatar,
// British Airways, Hawaiian, American, Envoy, Air Inuit), red on black (Air
// Canada), navy on gold (Singapore, Lufthansa), lime on navy (airBaltic),
// gold on navy (PAL).
//
// The tests below hold the gate to the rule from what it writes: the paint
// of the card against the stylesheet and against the colours read off those
// screens, the measure against the gates seen to sink and to stand out, and
// for every code the ground of every disc against the card behind it.
// ════════════════════════════════════════════════════════════════════════

// The paint read off the screens, beside the third disc of each rail (1680 by 1050, the median of a
// ring six to eight pixels outside the disc), and the ground of that disc. Recorded by hand. These
// are the cards as they were seen before the dark plate: the shade of each accent. They hold the
// arithmetic of the shade, which still decides whether a gate sinks, and still paints the card of
// every gate that does not.
const SEEN_SHADE = {
  OS: '#561F1B', IB: '#571F28', JL: '#521619', QF: '#581619', VS: '#561829', W6: '#541640', DI: '#5B1724',
  TP: '#294821', F9: '#19352E', AY: '#18172E', B6: '#14273D', SK: '#141638', AD: '#16162E', AM: '#18202E',
  KE: '#161D38', BA: '#23344E', HA: '#2C2545', WN: '#242E52', BT: '#1A212F', PB: '#1B273E', CA: '#142139',
  SQ: '#614B29', P6: '#1E3353', DM: '#2D1A3E', YN: '#202125', '3H': '#1F1F23'
};
// Scoot as it was seen, before its card took its black: the khaki of a shade of its yellow
const SEEN_SCOOT = { accent: '#FFE900', card: '#625C19', disc: '#F2DD00' };
// (Aer Lingus was seen on the emerald picture it shared with Cathay and EVA, #1C2E28 at its discs:
// that picture is no longer its card)
const SEEN_PICTURE = {
  AC: '#2A2A2A', WS: '#126C74', UA: '#00286D', TS: '#182234', KL: '#0002C9',
  AA: '#5B8FAD', LH: '#D3B156', QR: '#D7A680', AF: '#0D1F4F', EK: '#000F07'
};
// THE DARK PLATE AS IT WAS SEEN, on the five gates drawn both ways for the choice (the same ring,
// beside the third disc): [the plate, the disc on it]
const SEEN_DARK = {
  OS: ['#232529', '#D21D05'], IB: ['#232529', '#D61B2D'], QF: ['#232529', '#D90000'], TP: ['#232529', '#449F19'], W6: ['#232529', '#CD007B']
};
// gate: [the ground of its discs as seen, the paints of its card as seen]
const SEEN_SUNK = {
  OS: ['#CB1C05', ['#561F1B']], IB: ['#CC1A2B', ['#571F28']], QF: ['#D40000', ['#581619']], DI: ['#D30320', ['#5B1724']],
  // Emirates: on the dark green of its picture, the red wave four pixels under the foot of each disc
  EK: ['#C3171E', ['#000F07', '#B60C1F']],
  KL: ['#009AD2', ['#0002C9']], W6: ['#CB007A', ['#541640']], TR: ['#F2DD00', ['#625C19']],
  TP: ['#429B19', ['#294821']], F9: ['#0D5C3D', ['#19352E']], EI: ['#005D6A', ['#1C2E28']],
  AY: ['#0B023C', ['#18172E']], B6: ['#00336C', ['#14273D']], SK: ['#252974', ['#141638']], AD: ['#04003C', ['#16162E']], AM: ['#0A1E3A', ['#18202E']]
};
const SEEN_OUT = {
  KE: ['#FDFDFD', ['#161D38']], QR: ['#FDFDFD', ['#D7A680']], BA: ['#F1F3F7', ['#23344E']], HA: ['#F1F3F7', ['#2C2545']],
  AA: ['#FDFDFE', ['#5B8FAD']], MQ: ['#FDFDFE', ['#5B8FAD']], AC: ['#CC2C2B', ['#2A2A2A']], SQ: ['#1B437C', ['#614B29']],
  BT: ['#C5D230', ['#1A212F']], LH: ['#091935', ['#D3B156']], PB: ['#E39404', ['#1B273E']], '3H': ['#FDFDFD', ['#1F1F23']]
};
// the shade of an accent, by the arithmetic of this file: 34 hundredths of it over #0B0E14, with the
// engraving (#0D0D0D between its lines) screened over that
const shadeOf = (accent) => '#' + rgb(accent).map((v, k) => {
  const base = v * 0.34 + [11, 14, 20][k] * 0.66;
  return Math.round(255 - (255 - base) * (255 - 13) / 255).toString(16).padStart(2, '0');
}).join('').toUpperCase();

// THE GATES APPROVED AS THEY ARE DRAWN THAT BREAK RULE 6. They stay exactly as they are, cards and
// discs. Each is named here with what sinks into what; the list is exact, so a gate that joins the
// kept list and sinks, or one of these that stops sinking, fails until this list says so.
const APPROVED_SUNK = {
  '4N': 'Air North: its orange discs on a card that is a shade of that orange',
  '5T': 'Canadian North: its red discs on a card that is a shade of that red',
  'CS': 'Chair: its red discs on a card that is a shade of that red',
  'FR': 'Ryanair: its blue discs on a card that is a shade of that blue, and on a lower right panel of that blue',
  'RK': 'Ryanair UK wears Ryanair',
  'LX': 'Swiss: its red tile and red discs on a card that is a shade of that red',
  'MU': 'China Eastern: its navy tile and navy discs on a card that is a shade of that navy, and on a lower right panel of that navy',
  'NZ': 'Air New Zealand: its black tile and black discs on a charcoal card, and on a lower right panel of that black',
  'QK': 'Jazz as a row code: red discs on a card that is a shade of that red (on an Air Canada gate the card is black)',
  'RV': 'Rouge as a row code: the red of Air Canada on a card that is a shade of that red',
  'TK': 'Turkish: its red roundel and red discs on a card that is a shade of that red',
  'TS': 'Transat: its blue discs on the navy of its wing picture and of its lower right panel, two blues 30 degrees of hue apart',
  'UA': 'United: its blue discs on the blues of its picture, and its globe on the navy of its lower right panel',
  'WS': 'WestJet: its teal discs on the teal of its picture',
  'XP': 'Avelo: its purple discs on a card that is a shade of that purple, and on a lower right panel of that purple'
};
// The paint behind the Your Aircraft orb, read off the same screens (a ring six to eight pixels
// outside the orb): the second colour of the pair of the carrier, to the digit.
const SEEN_LOWER = {
  '3H': '#231F20', AA: '#101820', AC: '#0B0D10', AD: '#0C1119', AF: '#051039', AM: '#0B2343', AY: '#0C0243', B6: '#003876',
  BA: '#1A1A2E', BT: '#0C1119', CA: '#0C1119', DI: '#0C1119', DM: '#520E77', EI: '#0C1119', EK: '#1A1A2E', F9: '#0A3D6B',
  HA: '#4B286D', IB: '#0C1119', JL: '#0C1119', KE: '#051766', KL: '#003876', LH: '#05164D', MQ: '#0C1119', OS: '#0C1119',
  P6: '#0C1119', PB: '#183677', QF: '#0C1119', QR: '#5C0931', SK: '#000066', SQ: '#1D4886', TP: '#0C1119', TR: '#0C1119',
  TS: '#0F4C81', UA: '#0C2340', VS: '#0C1119', W6: '#0C1119', WN: '#111B40', WS: '#003366', YN: '#272626'
};
const isKept = (code) => !!(W._GATE_COLUMNS_KEPT[O.fold(code)] || W._GATE_COLUMNS_KEPT[code]);
// the words the lower right panel carries: white, and its status inks, each at 4.5 to 1 on it
const PANEL_WORDS = ['#FFFFFF', '#34D399', '#FBBF24', '#FCA5A5', '#93C5FD'];

// Every ground a column writes, and the panel each disc sits on: the top orb, the five badges and
// the shelf on the plate (the rail cards and the shelf cells are one plate), the Your Aircraft orb on
// the lower right panel. Art that is itself the disc, with no ground of its own in any table, meets
// the panel with its rim: the roundel of Alaska sits inside its own white ring, and so does the
// roundel of Turkish.
function groundsWritten(code) {
  const c = column(code), K = W._gateCardPaint(code), out = [];
  const lower = K.lower ? [K.lower] : [];
  if (c.L.css) return [['the discs the stylesheet paints', full(c.L.ground), K.at], ['the Your Aircraft orb the stylesheet paints', full(c.L.ground), lower]];
  const edge = (c.from === 'art' && c.A.rim) ? c.A.rim : c.top;
  out.push(['the top orb', full(edge), K.at], ['the five badges', full(c.badgeBg), K.at]);
  const S = O.shelf(code), sBg = styleProp(S.badge, 'background');
  out.push(['the shelf badges', full(isVar(sBg) ? c.accent : sBg), K.at]);
  const own = orbFacts(W._gateCardOrb(code, '').html);
  out.push(['the Your Aircraft orb', full(HEX.test(full(own.bg)) ? own.bg : edge), lower]);
  return out;
}
// THE RULE OF THE DARK PLATE, by the arithmetic of this file and the tables of the gate, for a code
// that is not left as drawn: what its card is, and whether its column is white, with the reason.
function plateOf(code) {
  const c = O.fold(code), accent = full(O.accent(c)), N = W._gateOrbNatural(code), natural = full(N.ground || accent);
  const pic = W._GATE_CARD_PICTURES[c];
  if (pic) {
    const sunk = pic.at.some((p) => sinks(natural, p));
    return { natural, kind: 'picture', base: '', white: sunk, why: sunk ? 'its discs sink into its picture, and the picture stays' : '' };
  }
  const own = shadeOf(accent);
  if (!sinks(natural, own)) return { natural, kind: 'shade', base: '', white: false, why: '' };
  const ink = (LOOKS[c] || {}).ink || W._orbInkOn(natural);
  const tried = [W._GATE_CARD_DARKS[c], HOUSE_DARK].filter(Boolean);
  const takes = tried.find((d) => clear(natural, screened(d)) && contrast(full(ink), natural) >= 3);
  if (takes) return { natural, kind: 'dark', base: takes, white: false, why: '' };
  return { natural, kind: 'shade', base: '', white: true, own, tried, why: 'its discs sink into the shade of their own colour and do not stand clear of the dark plate' };
}

test('rule 6, what paints the card: the plate of the stylesheet, and the tables of the gate agree with it', () => {
  // every rule that sets a plate variable, by the carriers it names and how many :not(#_) it carries
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const set = [];
  let order = 0;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl = {};
    m[2].replace(/(--plate-(?:tex|base|blend))\s*:\s*([^;]+);/g, (_, k, v) => { decl[k] = v.trim(); });
    if (!Object.keys(decl).length) continue;
    // one selector per comma outside brackets
    const sels = []; let depth = 0, cur = '';
    for (const ch of m[1]) {
      if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { sels.push(cur); cur = ''; } else cur += ch;
    }
    sels.push(cur);
    for (const sel of sels) {
      if (!/^\s*html body/.test(sel)) continue;
      set.push({ ids: sel.split(':not(#_)').length - 1, codes: [...sel.matchAll(/\[data-gate-airline="([^"]+)"\]/g)].map((x) => x[1]), all: !/data-gate-airline[*]?="/.test(sel), decl, order: order++ });
    }
  }
  assert.ok(set.length >= 30, set.length + ' selectors set a plate variable');
  // the value that wins for a code: the most :not(#_), then the later rule
  const wins = (code, prop) => set.filter((r) => r.decl[prop] && (r.all || r.codes.includes(code))).sort((a, b) => a.ids - b.ids || a.order - b.order).pop().decl[prop];
  // THE SHADE: one rule mixes the plate of a carrier with no picture, and it reads --gate-card first
  const mix = set.filter((r) => r.all && r.decl['--plate-base'] && /color-mix/.test(r.decl['--plate-base']));
  assert.equal(mix.length, 1, 'one rule mixes the plate');
  assert.equal(mix[0].decl['--plate-base'], 'var(--gate-card, color-mix(in srgb, var(--airline-accent, #6b7684) 34%, #0b0e14))');
  assert.equal(mix[0].decl['--plate-blend'], 'screen');
  // and the gate works the paint from the same numbers: 34 hundredths over #0B0E14, under a screen
  const shade = block('window._gateCardShade = function'), screen = block('window._gateCardScreen = function');
  assert.match(shade, /var under = \[11, 14, 20\], a = m \? \[0, 2, 4\]\.map\(function \(i\) \{ return parseInt\(m\[1\]\.substr\(i, 2\), 16\); \}\) : \[107, 118, 132\];/);
  assert.match(shade, /return v \* 0\.34 \+ under\[k\] \* 0\.66;/);
  assert.match(screen, /Math\.round\(255 - \(255 - v\) \* \(255 - 13\) \/ 255\)/);
  const paintFn = block('window._gateCardPaint = function');
  assert.match(paintFn, /var dark = window\._gateCardDark\(raw\);/);
  assert.match(paintFn, /var paint = window\._gateCardScreen\(dark \|\| mix\);/, 'the dark plate lies under the same engraving as the shade');
  // the rule that paints the plate under a rail row reads those variables, and no rule outranks it for every carrier
  const painter = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.v2-flightinfo-block > \.v2-fi-row::before/.test(m[1]) && /background-color:\s*var\(--plate-base/.test(m[2]));
  assert.ok(painter.length >= 1, 'a rule paints --plate-base under the row');
  const last = painter[painter.length - 1];
  assert.match(last[2], /background-image:\s*var\(--plate-tex\)\s*!important/);
  assert.match(last[2], /background-blend-mode:\s*var\(--plate-blend, normal\)\s*!important/);
  // and it paints the cells of the boarding shelf with them too: one plate
  assert.match(last[1], /\.g8-bir-cell::before/);
  assert.match(last[1], /:is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-flightinfo-block > \.v2-fi-row::before/);

  // THE PICTURES: a carrier is a picture card exactly where its plate is not blended with the shade
  const named = [...new Set(set.flatMap((r) => r.codes))];
  const pictures = {};
  for (const code of named) {
    if (wins(code, '--plate-blend') !== 'normal') continue;
    const file = (/\/textures\/([^?')]+)/.exec(wins(code, '--plate-tex')) || [])[1];
    const c = O.fold(code);
    assert.ok(!pictures[c] || pictures[c] === file, code + ' and ' + c + ' name one picture');
    pictures[c] = file;
  }
  const P = W._GATE_CARD_PICTURES;
  assert.deepEqual(Object.keys(pictures).sort(), Object.keys(P).sort(), 'the picture cards of the stylesheet are the rows of the table');
  for (const [c, row] of Object.entries(P)) {
    assert.equal(row.file, pictures[c], c + ': the picture the stylesheet sets');
    assert.ok(fs.existsSync(path.join(FC, 'textures', row.file)), row.file);
    assert.ok(row.at.length >= 1 && row.at.every((h) => /^#[0-9A-F]{6}$/.test(h)), c + ': ' + row.at);
    assert.equal(O.fold(c), c, c + ' is the carrier a gate wears, as the body attribute names it');
    const K = W._gateCardPaint(c);
    assert.deepEqual([K.kind, K.paint, K.at], ['picture', row.at[0], row.at], c);
    // a picture stays: a picture card is never given the dark plate
    assert.equal(W._gateCardDark(c), '', c);
  }
  // THE EMERALD PLATE WAS A BORROWED PICTURE. One file was set for Cathay, Aer Lingus and EVA, and it
  // is the jade, the teal or the green of none of them. No rule sets it now, under any of their
  // codes, so each is a gate with no picture: the dark plate under its own discs.
  assert.doesNotMatch(css, /plate-emerald-gold/, 'no rule sets the emerald picture');
  for (const code of ['CX', 'CPA', 'EI', 'EIN', 'BR', 'EVA']) assert.ok(!named.includes(code), code + ' is named by no plate rule');
  for (const [code, tile] of [['CX', 'CPA'], ['EI', 'EIN'], ['BR', 'EVA']]) {
    const K = W._gateCardPaint(code), c = column(code), g = W._ORB_TILE_GROUNDS[tile];
    assert.equal(P[code], undefined, code);
    assert.deepEqual([K.kind, K.base, K.paint], ['dark', HOUSE_DARK, screened(HOUSE_DARK)], code);
    assert.deepEqual([c.L.white, c.emb.src, c.emb.bg, c.emb.pad, c.badge.bg, c.badge.ink], [false, '/logos/airline-tiles/' + tile + '.svg', 'transparent', '0', g, '#fff'], code + ': its own tile and its own discs');
    assert.ok(sinks(g, shadeOf(full(O.accent(code)))) && clear(g, K.paint), code + ': ' + g + ' sank into the shade of itself and stands clear of the dark plate');
  }
  // a carrier the stylesheet names without a picture of its own is a shade (Hawaiian, on the engraving)
  assert.ok(named.includes('HA') && !P.HA && wins('HA', '--plate-blend') === 'screen');
  assert.equal(W._gateCardPaint('HA').kind, 'shade');
  // every other carrier: the shade of its accent, or the dark plate, by the arithmetic of this file
  let shades = 0, darks = 0;
  for (const code of CODES) {
    const K = W._gateCardPaint(code), c = O.fold(code);
    assert.equal(K.carrier, c, code);
    if (K.kind === 'picture') continue;
    assert.deepEqual(K.at, [K.paint], code);
    if (K.kind === 'dark') {
      darks++;
      assert.ok(K.base === HOUSE_DARK || K.base === W._GATE_CARD_DARKS[c], code + ': ' + K.base);
      assert.equal(K.paint, screened(K.base), code + ': the dark under the engraving');
      continue;
    }
    shades++;
    assert.equal(K.kind, 'shade', code);
    assert.equal(K.paint, shadeOf(full(O.accent(c))), code + ': the shade of ' + O.accent(c));
  }
  assert.ok(shades >= 150 && darks >= 70, shades + ' carriers on a shade of their accent, ' + darks + ' on the dark plate');
});

test('rule 6, the paint of the card is the paint on the gate screens of November 2026', () => {
  // the shades: what the arithmetic gives is within 4 of what was read beside the discs, and it is
  // the card of every one of these gates that is still on a shade
  let still = 0;
  for (const [code, seen] of Object.entries(SEEN_SHADE)) {
    const own = shadeOf(full(O.accent(O.fold(code))));
    assert.ok(dE(own, seen) < 4, code + ': ' + own + ' beside ' + seen + ' on the screen (dE ' + dE(own, seen).toFixed(1) + ')');
    const K = W._gateCardPaint(code);
    if (K.kind === 'shade') { still++; assert.equal(K.paint, own, code); } else assert.equal(K.kind, 'dark', code);
  }
  assert.ok(still >= 14, still + ' of them are on that shade still');
  assert.ok(dE(shadeOf(SEEN_SCOOT.accent), SEEN_SCOOT.card) < 4, 'Scoot, as it was: the khaki of its yellow');
  // the dark plate: the house charcoal under the engraving is what was read beside the discs of the
  // five gates drawn on it, within 4, and the disc of each stood clear of it there
  for (const [code, [plate, disc]] of Object.entries(SEEN_DARK)) {
    assert.ok(dE(screened(HOUSE_DARK), plate) < 4, code + ': ' + screened(HOUSE_DARK) + ' beside ' + plate + ' on the screen');
    assert.ok(clear(disc, plate) && dE(disc, plate) > 35, code + ': ' + disc + ' on ' + plate);
    assert.equal(W._gateCardPaint(code).kind, 'dark', code);
  }
  assert.equal(W._GATE_CARD_DARK, HOUSE_DARK);
  // the pictures: one of the paints recorded for the card is what was read there
  for (const [code, seen] of Object.entries(SEEN_PICTURE)) {
    const K = W._gateCardPaint(code);
    assert.equal(K.kind, 'picture', code);
    const near = Math.min(...K.at.map((p) => dE(p, seen)));
    assert.ok(near < 6, code + ': ' + K.at.join(' ') + ' beside ' + seen + ' on the screen (dE ' + near.toFixed(1) + ')');
  }
  // Envoy prints American and wears its card; the lower right panel is keyed on the code of the gate
  assert.deepEqual([W._gateCardPaint('MQ').at, W._gateCardPaint('MQ').kind], [W._gateCardPaint('AA').at, 'picture']);
  // THE SECOND PANEL, behind the Your Aircraft orb: the second colour of the pair of the carrier was
  // the paint read there on every screen, string for string. It is the paint still, but for one of
  // those gates: Singapore, whose panel was the navy of its orb and is the dark plate now.
  const moved = [];
  for (const [code, seen] of Object.entries(SEEN_LOWER)) {
    assert.equal(O.pair(code).b, seen, code + ': the second colour of its pair');
    if (W._gateCardPaint(code).lower !== seen) moved.push(code);
  }
  assert.deepEqual(moved, ['SQ']);
  assert.equal(Object.keys(SEEN_LOWER).length, 39);
  assert.match(block('window._gateCardPaint = function'), /if \(!railOnly\) \{ try \{ lower = String\(window\._gateLowerPair\(raw\)\.b \|\| ''\)\.toUpperCase\(\); \}/);
  // THE JUDGED COLOUR HAS A VARIABLE OF ITS OWN. The gate writes the second colour of the carrier
  // as --rc2-b, as it always did, and the colour judged against the orb as --rc2-b-orb. Only the two
  // rules of the Your Aircraft panel read the second (its ground, and the ground its ink passes are
  // told); the boarding band reads the first for the half that holds its closing time, so the band
  // keeps the pair of the carrier on the gates whose panel moved.
  assert.match(CORE, /var p = window\._gateLowerPair\(airlineCode\);\s*\n\s*return ';--rc2-a:' \+ p\.a \+ ';--rc2-a-ink:' \+ p\.ink \+ ';--rc2-b:' \+ p\.own \+ ';--rc2-b-orb:' \+ p\.b;/);
  assert.equal(CORE.split('window._gateLowerPair(').length - 1, 2, 'asked in two places: where the gate writes the panel, and where the paint of the card is told');
  assert.match(CSS, /background: var\(--rc2-b-orb, var\(--rc2-b, var\(--banner-bg, #0c1119\)\)\) !important;/);
  assert.match(CSS, /--rc-ground-ink: var\(--rc2-b-orb, var\(--rc2-b, #0c1119\)\) !important;/);
  // every rule that reads either variable, by the last part of its selector
  const readers = { '--rc2-b-orb': [], '--rc2-b': [] };
  for (const m of CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const tail = m[1].split(',').map((s) => s.replace(/:not\([#.]_\)/g, '').trim().split(/\s+/).pop()).sort().join(' + ');
    if (/var\(--rc2-b-orb\b/.test(m[2])) readers['--rc2-b-orb'].push(tail);
    else if (/var\(--rc2-b\b/.test(m[2])) readers['--rc2-b'].push(tail);
  }
  assert.deepEqual(readers, { '--rc2-b-orb': ['.v2-rc-shelf-illus + .v2-rc-shelf-illus::after', '.v2-rc-shelf-fi'], '--rc2-b': ['.g8-band-close', '.g8-band-docs'] });
  assert.equal((CORE.match(/--rc2-b-orb/g) || []).length - (CORE.match(/\/\/[^\n]*--rc2-b-orb/g) || []).length, 1, 'written once, read by no script');
  // Singapore and Pascan: the panel on the dark plate, the band on the navy of the carrier. They are
  // the only two gates whose second colour moved (a gate under P6 has the default pair, and it stays)
  const movedPair = CODES.filter((c) => W._gateLowerPair(c).b !== W._gateLowerPair(c).own);
  assert.deepEqual(movedPair, ['BQ', 'SQ']);
  assert.deepEqual([W._gateLowerPair('P6').own, W._gateLowerPair('P6').b], [O.pair('P6').b, O.pair('P6').b]);
  for (const [code, navy] of [['SQ', '#1D4886'], ['BQ', '#1B2A4A']]) {
    const p = W._gateLowerPair(code);
    assert.deepEqual([p.own, p.b, O.pair(code).b, W._gateCardPaint(code).lower], [navy, HOUSE_DARK, navy, HOUSE_DARK], code + ': the band keeps ' + navy + ', the panel takes the dark plate');
    assert.ok(contrast(THE_WHITE, p.own) >= 4.5, code + ': the closing time, white on ' + p.own);
  }
  // it holds white words at 4.5 to 1 on every gate, so a white disc never sinks into it
  for (const code of CODES) {
    const lower = W._gateCardPaint(code).lower;
    assert.match(lower, /^#[0-9A-F]{6}$/, code);
    assert.ok(contrast(THE_WHITE, lower) >= 4.5 && !sinks(THE_WHITE, lower), code + ': white on ' + lower);
  }
});

test('rule 6, the measure: every gate seen to sink fails it, every gate seen to stand out passes', () => {
  assert.deepEqual(W._GATE_SINK, Object.assign({}, SINK, { clear: CLEAR }), 'the numbers of the gate are the numbers of this file');
  for (const [code, [disc, paints]] of Object.entries(SEEN_SUNK)) assert.ok(paints.some((p) => sinks(disc, p)), code + ': ' + disc + ' sinks into ' + paints.join(' '));
  for (const [code, [disc, paints]] of Object.entries(SEEN_OUT)) assert.ok(!paints.some((p) => sinks(disc, p)), code + ': ' + disc + ' stands out on ' + paints.join(' '));
  assert.equal(Object.keys(SEEN_SUNK).length, 16); assert.equal(Object.keys(SEEN_OUT).length, 12);
  // WHY TWO TESTS. CIEDE2000 alone cannot separate them: Qantas red on its maroon and the white disc
  // of Qatar on its sand both measure 26, Scoot yellow on its khaki 43, and Air Canada red on black 36
  const d = (o, c) => dE(o[c][0], o[c][1][0]);
  assert.ok(Math.abs(d(SEEN_SUNK, 'QF') - d(SEEN_OUT, 'QR')) < 1 && d(SEEN_SUNK, 'TR') > d(SEEN_OUT, 'AC') && d(SEEN_SUNK, 'KL') > d(SEEN_OUT, 'SQ'));
  // the first test, the same paint near enough: the navies and the dark greens, all under 20
  for (const code of ['AM', 'B6', 'AD', 'AY', 'SK', 'F9', 'EI']) assert.ok(d(SEEN_SUNK, code) < SINK.deltaE, code + ': ' + d(SEEN_SUNK, code).toFixed(1));
  assert.ok(Math.min(...Object.keys(SEEN_OUT).map((c) => d(SEEN_OUT, c))) > 25, 'and no gate that stands out is nearer than 25');
  // the second, a shade of one hue: the gates that sink at 20 or more are within 60 degrees of hue of
  // their card (KLM the widest, its light blue 56 from the blue of its picture), both with colour
  for (const code of ['OS', 'IB', 'QF', 'DI', 'W6', 'TR', 'TP', 'KL']) {
    const [disc, [paint]] = SEEN_SUNK[code];
    assert.ok(dE(disc, paint) >= SINK.deltaE && hueGap(disc, paint) < SINK.hue && chroma(disc) >= SINK.chroma && chroma(paint) >= SINK.chroma, code + ': ' + hueGap(disc, paint).toFixed(0) + ' degrees');
  }
  assert.ok(hueGap(...[SEEN_SUNK.KL[0], SEEN_SUNK.KL[1][0]]) > 50);
  // and the gates that stand out with colour on both sides are more than 150 degrees from their card
  for (const code of ['SQ', 'BT', 'LH', 'PB']) assert.ok(hueGap(SEEN_OUT[code][0], SEEN_OUT[code][1][0]) > 150, code);
  // white and grey have no hue, and black has none: white on a colour and a colour on black stand out
  for (const code of ['KE', 'QR', 'BA', 'HA', 'AA', '3H']) assert.ok(chroma(SEEN_OUT[code][0]) < SINK.chroma, code + ': a disc with no hue');
  assert.ok(chroma(SEEN_OUT.AC[1][0]) < SINK.chroma, 'the black card of Air Canada has no hue');
  // where the line between a colour and a grey falls: the silver tile of Air China (chroma 6) on its
  // navy card is a grey on a colour and stands out, 66 apart; the khaki a shade of the Gulf Air gold
  // gives (chroma 8) is a colour, the gold of its tile is 7 degrees of hue from it, and the gold sinks
  const ca = [W._ORB_TILE_GROUNDS.CCA, W._gateCardPaint('CA').paint], gf = [W._ORB_TILE_GROUNDS.GFA, shadeOf(full(O.accent('GF')))];
  assert.ok(chroma(ca[0]) < SINK.chroma - 0.5 && !sinks(...ca) && dE(...ca) > 60, 'Air China: chroma ' + chroma(ca[0]).toFixed(1));
  assert.ok(chroma(gf[1]) > SINK.chroma + 0.5 && hueGap(...gf) < 10 && sinks(...gf), 'Gulf Air: chroma ' + chroma(gf[1]).toFixed(1));
  // so Air China stays on its navy, and Gulf Air takes the dark plate under its gold discs
  assert.deepEqual([column('CA').L.white, W._gateCardPaint('CA').kind, column('GF').L.white, W._gateCardPaint('GF').kind], [false, 'shade', false, 'dark']);
  // Emirates: on the dark green behind it the red disc stands out; beside its red wave it is red on red
  assert.deepEqual(SEEN_SUNK.EK[1].map((p) => sinks(SEEN_SUNK.EK[0], p)), [false, true]);
  assert.deepEqual(W._GATE_CARD_PICTURES.EK.at.map((p) => sinks(O.ACCENT.EK, p)), [false, false, true]);
  // the gate and this file give one answer, for every pair of a ground and a paint on any gate
  let pairs = 0;
  const colours = new Set([THE_WHITE]);
  for (const code of CODES) { colours.add(full(O.accent(O.fold(code)))); const g = W._gateOrbNatural(code).ground; if (g) colours.add(full(g)); for (const p of W._gateCardPaint(code).at) colours.add(p); }
  for (const a of colours) for (const b of colours) { pairs++; assert.equal(W._gateDiscSinks(a, b), sinks(a, b), a + ' on ' + b); }
  assert.ok(pairs > 60000, pairs + ' pairs');
  assert.ok(Math.abs(W._orbDeltaE('#DF0000', '#581619') - dE('#DF0000', '#581619')) < 1e-9);
  // STANDING CLEAR, WITH ROOM: the second measure, asked only of the dark plate. The disc is not lost
  // by the first, and it is at least twice as bright as the plate. The gate and this file give one
  // answer for every colour above on every dark the gate can take.
  const plates = [...new Set(Object.values(W._GATE_CARD_DARKS).concat(HOUSE_DARK))].map(screened);
  for (const a of colours) for (const p of plates) assert.equal(W._gateDiscClear(a, p), clear(a, p), a + ' on ' + p);
  // the ink is asked too: a disc whose glyphs would not read at 3 to 1 does not stand clear
  assert.deepEqual([W._gateDiscClear('#DC1C2E', screened(HOUSE_DARK), '#fff'), W._gateDiscClear('#DC1C2E', screened(HOUSE_DARK), '#C01020')], [true, false]);
  // the line it draws: the red of Air Canada on its black, as it has always been drawn, is 3 to 1;
  // the reds, the greens, the oranges and the magenta seen on the dark plate are 3 to 5; the deepest
  // disc that still stands clear is the jade of Cathay at 2.03; and the navies, a black, a deep
  // maroon and the blue of no airline are 1.0 to 1.9: dark themselves
  const H = screened(HOUSE_DARK), ratio = (c) => contrast(c, H);
  assert.ok(contrast(SEEN_OUT.AC[0], SEEN_OUT.AC[1][0]) > 2.6 && contrast(SEEN_OUT.AC[0], SEEN_OUT.AC[1][0]) < 3.2);
  for (const [, [plate, disc]] of Object.entries(SEEN_DARK)) assert.ok(contrast(disc, plate) > 2.7 && contrast(disc, plate) < 5, disc);
  for (const [code, lo, hi] of [['OS', 3, 3.1], ['IB', 3.1, 3.2], ['TP', 4.8, 4.9], ['W6', 3, 3.05], ['U2', 5.2, 5.4], ['KL', 5.1, 5.2], ['CX', 2, 2.1], ['EI', 2.2, 2.3], ['F9', 2.2, 2.3]]) {
    const g = full(W._gateOrbNatural(code).ground || O.accent(code));
    assert.ok(ratio(g) >= lo && ratio(g) < hi && clear(g, H), code + ': ' + g + ' at ' + ratio(g).toFixed(2));
  }
  for (const [code, lo, hi] of [['AY', 1.2, 1.25], ['B6', 1.3, 1.4], ['SK', 1.35, 1.45], ['AD', 1.2, 1.3], ['AM', 1, 1.05], ['LH', 1.05, 1.1], ['SQ', 1.7, 1.75], ['OO', 1.9, 2], ['Y4', 1.3, 1.4], ['QN', 1.2, 1.3]]) {
    const g = full(W._gateOrbNatural(code).ground || O.accent(code));
    assert.ok(ratio(g) >= lo && ratio(g) < hi && !clear(g, H), code + ': ' + g + ' at ' + ratio(g).toFixed(2));
  }
  assert.ok(ratio('#0033A1') < 1.5 && !clear('#0033A1', H), 'the blue of no airline');
  // the first measure alone would not do: Singapore navy and SAS blue are 21 from the plate, past
  // its line of 20, beside the jade of Cathay at 24
  assert.ok(!sinks(W._ORB_TILE_GROUNDS.SIA, H) && !sinks(W._ORB_TILE_GROUNDS.SAS, H) && dE(W._ORB_TILE_GROUNDS.SAS, H) < 22 && dE(W._ORB_TILE_GROUNDS.CPA, H) < 25);
});

test('rule 6, every code: no disc sinks into the paint behind it; the dark plate where the discs stand clear of it, the white column only where they do not', () => {
  const wrong = [], sunkKept = [];
  let judged = 0;
  for (const code of CODES) {
    for (const [what, g, panel] of groundsWritten(code)) {
      assert.match(g, HEX, code + ', ' + what + ': a colour');
      assert.ok(panel.length >= 1 && panel.every((p) => HEX.test(p)), code + ', ' + what + ': the paint behind it');
      judged++;
      const into = panel.filter((p) => sinks(g, p));
      if (!into.length) continue;
      if (isKept(code)) { if (!sunkKept.includes(code)) sunkKept.push(code); continue; }
      wrong.push(code + ' (' + (O.NAME2[code] || O.NAME[code]) + '): ' + what + ' ' + g + ' sinks into ' + into.join(' ') + ' (dE ' + dE(g, into[0]).toFixed(1) + ', ' + hueGap(g, into[0]).toFixed(0) + ' degrees of hue)');
    }
  }
  assert.ok(judged >= 1000, judged + ' discs judged');
  assert.deepEqual(wrong, [], wrong.length + ' discs sink into their card:\n' + wrong.join('\n'));
  // the approved gates that break the rule, named in one list, each with what sinks
  assert.deepEqual(sunkKept.sort(), Object.keys(APPROVED_SUNK).sort());
  for (const [code, why] of Object.entries(APPROVED_SUNK)) assert.ok(why.length > 20 && isKept(code), code);
  // the kept list is the approved gates, by the carrier a gate wears: no code joins it unseen
  assert.deepEqual(Object.keys(W._GATE_COLUMNS_KEPT).sort(), ['3H', '4N', '5T', 'AA', 'AC', 'AIE', 'AS', 'CS', 'DL', 'DM', 'F8', 'FR', 'LX', 'MU', 'NZ', 'PB', 'PD', 'QK', 'RV', 'TK', 'TS', 'UA', 'WR', 'WS', 'XP', 'YN']);
  assert.equal(W._GATE_COLUMNS_KEPT.DI, undefined, 'Norwegian UK is not one of them');
  // A KEPT GATE STAYS EXACTLY AS IT IS: never white, never the dark plate, and its lower right panel
  // the second colour of its pair; their folded partners with them
  let kept = 0;
  for (const code of CODES) {
    if (!isKept(code)) continue;
    kept++;
    assert.equal(W._gateColumnKept(code), true, code);
    assert.equal(column(code).L.white, false, code);
    assert.equal(W._gateCardDark(code), '', code + ': no dark plate');
    assert.notEqual(W._gateCardPaint(code).kind, 'dark', code);
    assert.equal(W._gateCardPaint(code).lower, O.pair(code).b, code + ': its lower right panel is the colour of its pair');
    assert.deepEqual(W._gateLowerPair(code), Object.assign({}, O.pair(code), { own: O.pair(code).b }), code);
    assert.equal(orbFacts(W._gateCardOrb(code, '').html).bg !== THE_WHITE || same(column(code).top, THE_WHITE), true, code + ': its own orb is not made white');
  }
  assert.equal(kept, 34, kept + ' codes are gates approved as drawn');
  for (const [from, to] of [['MQ', 'AA'], ['OH', 'AA'], ['PT', 'AA'], ['9E', 'DL'], ['QX', 'AS'], ['ZX', 'AC'], ['9M', 'AC'], ['9L', 'AC'], ['SP', 'PB'], ['RK', 'FR']]) {
    assert.ok(isKept(from) && O.fold(from) === to, from);
    assert.equal(W._gateColumnWhite(from, W._gateOrbNatural(from).ground), '', from);
  }
  // THE OTHERS, EVERY ONE, AGAINST THE RULE WORKED HERE (plateOf, above this test):
  //   a picture card stays, and its column is white where its discs sink into the picture;
  //   a gate whose discs stand out on the shade of its own colour is as its art draws it;
  //   a gate whose discs sink there takes the dark plate where they stand clear of it, AND KEEPS
  //     ITS DISCS: every disc the colour of its top orb, the same string, and none of them white;
  //   and only where they do not stand clear of it is the column white.
  const tally = { dark: [], whiteDark: [], whitePicture: [], stay: [] };
  for (const code of CODES) {
    if (isKept(code)) continue;
    const want = plateOf(code), c = column(code), { L } = c, K = W._gateCardPaint(code);
    assert.deepEqual([K.kind, K.kind === 'dark' ? K.base : '', L.white], [want.kind, want.base, want.white], code + ': ' + want.natural + ' on ' + K.at.join(' '));
    assert.equal(W._gateCardDark(code), want.base, code);
    if (want.kind === 'dark') {
      tally.dark.push(code);
      assert.ok(K.at.every((p) => clear(want.natural, p)), code + ': ' + want.natural + ' stands clear of ' + K.paint);
      assert.ok(contrast(THE_WHITE, K.paint) >= 7, code + ': white figures on ' + K.paint);
      // it keeps the ground of its art, and its top orb is the recipe of its art, untouched
      assert.equal(full(L.ground), want.natural, code);
      assert.deepEqual([c.P.badge, c.P.path, c.P.imgStyle], [W._gateOrbNatural(code).badge, W._gateOrbNatural(code).path, W._gateOrbNatural(code).imgStyle], code + ': the top orb as its art gives it');
      assert.ok(!c.P.white && !/--orb-ring/.test(c.emb.style), code);
      // ONE COLOUR, THE COLOUR OF THE TOP ORB, STRING FOR STRING, AND NOT WHITE. (Four tiles give no
      // single ground to read: the two halves of LEVEL are in the ledger for it, and the red of
      // Austrian and the magenta of Wizz are grounds written by hand beside tiles that show more.)
      const S = O.shelf(code), sBg = styleProp(S.badge, 'background'), own = orbFacts(W._gateCardOrb(code, '').html);
      const discs = { 'the five badges': c.badgeBg, 'the shelf badges': isVar(sBg) ? c.accent : sBg, 'the Your Aircraft orb': HEX.test(full(own.bg)) ? own.bg : isVar(own.bg) ? c.accent : c.top };
      if (code === 'LL') assert.ok(LEDGER.LL && !same(c.top, c.badgeBg), 'LEVEL: two grounds, in the ledger');
      else for (const [what, g] of Object.entries(discs)) assert.equal(full(g).toUpperCase(), full(c.top).toUpperCase(), code + ': ' + what + ' ' + g + ' beside a top orb of ' + c.top);
      for (const g of [c.top].concat(Object.values(discs))) assert.ok(!same(g, THE_WHITE) && contrast(full(g), THE_WHITE) > 1.15, code + ': ' + g + ' is not white');
      continue;
    }
    if (L.white) {
      // THE REASON FOR EVERY WHITE COLUMN, from the measure
      assert.ok(K.at.some((p) => sinks(want.natural, p)), code + ': ' + want.natural + ' sinks into ' + K.at.join(' '));
      if (K.kind === 'picture') { tally.whitePicture.push(code); continue; }
      tally.whiteDark.push(code);
      assert.ok(want.tried.length >= 1 && want.tried.every((d) => !clear(want.natural, screened(d))), code + ': ' + want.natural + ' does not stand clear of ' + want.tried.map(screened).join(' '));
      // dark themselves: none is half again as bright as the dark plate would have to let it be
      assert.ok(contrast(want.natural, screened(HOUSE_DARK)) < CLEAR, code + ': ' + want.natural + ' at ' + contrast(want.natural, screened(HOUSE_DARK)).toFixed(2) + ' to 1 on the dark plate');
      continue;
    }
    tally.stay.push(code);
    assert.equal(full(L.ground), want.natural, code + ': it keeps the ground of its art');
    assert.ok(!K.at.some((p) => sinks(want.natural, p)), code);
  }
  assert.equal(tally.dark.length + tally.whiteDark.length + tally.whitePicture.length + tally.stay.length + kept, CODES.length);
  assert.ok(tally.dark.length >= 75 && tally.dark.length <= 90, tally.dark.length + ' gates on the dark plate');
  assert.ok(tally.whiteDark.length >= 110 && tally.whiteDark.length <= 125, tally.whiteDark.length + ' white columns of dark discs');
  assert.ok(tally.stay.length >= 22 && tally.stay.length <= 28, tally.stay.length + ' gates that stand out as their art draws them');
  // THE PICTURES THAT STAY UNDER A WHITE COLUMN: the blue gradient of KLM, the navy of Air France, the
  // green and red of Emirates. Lufthansa and Qatar stand out on theirs.
  assert.deepEqual(tally.whitePicture.sort(), ['AF', 'EK', 'KL']);
  for (const code of ['LH', 'QR']) assert.ok(tally.stay.includes(code) && W._gateCardPaint(code).kind === 'picture', code);
  // the white columns of dark discs: 77 of them have no colour of their own and wear the blue of no
  // airline, on a card that is a shade of it; the rest are navies, two blacks, a brown and two deep reds
  const noColour = tally.whiteDark.filter((c) => same(O.accent(O.fold(c)), '#0033A1'));
  assert.ok(noColour.length >= 70 && noColour.length <= 80, noColour.length + ' on the blue of no airline');
  for (const code of ['AY', 'B6', 'SK', 'AD', 'AM', 'MX', 'NH', 'FI', 'LO', 'MS', 'OO', 'YV', 'Y4', 'QN', 'HO', 'FJ', '8P']) assert.ok(tally.whiteDark.includes(code), code + ' is a white column');
  // the gates seen to sink: on the dark plate now with their own discs, but for the navies (white)
  // and the two on a picture (white); the gates seen to stand out draw what they drew
  for (const code of ['OS', 'IB', 'QF', 'DI', 'W6', 'TR', 'TP', 'F9', 'EI']) assert.ok(tally.dark.includes(code), code + ' is on the dark plate');
  for (const code of ['AY', 'B6', 'SK', 'AD', 'AM', 'EK', 'KL']) assert.equal(column(code).L.white, true, code);
  for (const code of Object.keys(SEEN_OUT)) assert.equal(column(code).L.white, false, code);
  for (const [code, ground] of [['KE', THE_WHITE], ['QR', THE_WHITE], ['BT', W._ORB_TILE_GROUNDS.BTI], ['AC', O.ACCENT.AC], ['SQ', W._ORB_TILE_GROUNDS.SIA], ['LH', O.ACCENT.LH]]) assert.ok(same(column(code).top, ground), code + ': ' + column(code).top);
  // THE BROWNS AND THE KHAKIS ARE GONE: every orange, gold and yellow whose card was a brown shade of
  // itself is on the dark plate with its bright discs
  for (const code of ['U2', 'EZY', 'EC', 'EJU', 'EZS', 'G3', 'JQ', 'XQ', 'DE', 'WG', 'EY', 'GF', '5J', 'TR', 'VY', 'PC']) {
    const K = W._gateCardPaint(code), own = shadeOf(full(O.accent(O.fold(code))));
    // (the dark of Pegasus is a slate, chroma 9: a dark of its own, and no shade of its yellow)
    assert.ok(tally.dark.includes(code) && chroma(own) >= SINK.chroma && chroma(K.paint) < 10, code + ': ' + own + ' was its card, a brown or a khaki; ' + K.paint + ' is, a neutral');
  }
  // Austrian, the gate that was named: its own red discs and its own tile, on the black it has on record
  const os = column('OS'), osK = W._gateCardPaint('OS');
  assert.deepEqual([os.emb.bg, os.emb.src, os.emb.pad, os.emb.native, os.badge.bg, os.badge.ink, os.badge.codeVar], ['transparent', '/logos/airline-tiles/AUA.svg', '0', true, '#D81E05', '#fff', '']);
  assert.deepEqual([osK.kind, osK.base, osK.paint, osK.lower], ['dark', '#000000', '#0D0D0D', '#0C1119']);
  // and the others drawn both ways for the choice, on the house charcoal
  for (const [code, disc] of [['IB', W._ORB_TILE_GROUNDS.IBE], ['QF', O.ACCENT.QF], ['TP', W._ORB_TILE_GROUNDS.TAP], ['W6', O.ACCENT.W6]]) {
    assert.deepEqual([W._gateCardPaint(code).base, W._gateCardPaint(code).paint, column(code).badgeBg, column(code).L.white], [HOUSE_DARK, '#222429', disc, false], code);
  }

  // THE LOWER RIGHT PANEL, JUDGED THE SAME WAY. Where the orb of a gate would sink into the second
  // colour of its pair, the panel takes the dark plate and the orb stays. Two gates: Singapore,
  // whose navy tile stood out on its bronze rail and was the navy of that panel, string for string;
  // and Pascan, whose blue tile sat on a navy panel of the same hue.
  const panel = [], orbAlone = [];
  for (const code of CODES) {
    if (isKept(code)) continue;
    const K = W._gateCardPaint(code), pair = O.pair(code), want = plateOf(code), L = column(code).L;
    const disc = L.white ? THE_WHITE : want.natural;
    const own = W._gateCardOrb(code, '');
    if (K.lower !== pair.b) {
      panel.push(code);
      assert.ok(sinks(disc, pair.b) && !sinks(disc, K.lower), code + ': ' + disc + ' sank into ' + pair.b + ' and stands out on ' + K.lower);
      assert.ok(PANEL_WORDS.every((w) => contrast(w, K.lower) >= 4.5), code + ': every word of the panel reads on ' + K.lower);
      assert.ok(K.lower === HOUSE_DARK || K.lower === W._GATE_CARD_DARKS[O.fold(code)], code + ': ' + K.lower);
      assert.deepEqual([W._gateLowerPair(code).a, W._gateLowerPair(code).ink, W._gateLowerPair(code).own], [pair.a, pair.ink, pair.b], code + ': the first colour and its ink do not move');
    } else assert.ok(!sinks(disc, pair.b) || own.white, code + ': ' + disc + ' on ' + pair.b);
    if (own.white && !L.white) orbAlone.push(code);
  }
  assert.deepEqual(panel.sort(), ['BQ', 'SQ']);
  assert.deepEqual([W._gateCardPaint('SQ').lower, O.pair('SQ').b, W._ORB_TILE_GROUNDS.SIA], [HOUSE_DARK, '#1D4886', '#1D4886']);
  const sq = column('SQ'), sqOwn = orbFacts(W._gateCardOrb('SQ', '').html);
  assert.deepEqual([sq.L.white, sq.emb.src, sq.emb.native, sq.badge.bg, sq.badge.ink, sqOwn.src, sqOwn.native, W._gateCardPaint('SQ').kind], [false, '/logos/airline-tiles/SIA.svg', true, '#1D4886', '#fff', '/logos/airline-tiles/SIA.svg', true, 'shade'], 'Singapore: its rail and its orb as they were drawn');
  assert.ok(dE('#1D4886', HOUSE_DARK) > 22 && dE('#1D4886', HOUSE_DARK) < 25, 'its navy on the dark panel: ' + dE('#1D4886', HOUSE_DARK).toFixed(1));
  // ONE GATE NO DARK PANEL CAN HELP: Lufthansa. Its navy stands out on its gold picture, so its rail
  // is as it was drawn. Its navy would sink into the charcoal too (12 apart), and into any panel dark
  // enough to carry the words, so its pair stays and its Your Aircraft orb alone is the white disc,
  // the crane in its navy. In the ledger, with that reason.
  assert.deepEqual(orbAlone, ['LH']);
  const lh = column('LH'), lhOwn = orbFacts(W._gateCardOrb('LH', '').html), lhK = W._gateCardPaint('LH');
  assert.deepEqual([lh.L.white, lh.emb.inked, isVar(lh.emb.bg), isVar(lh.badge.bg), lh.badge.ink, lhK.kind, lhK.lower], [false, true, true, true, '#fff', 'picture', O.pair('LH').b]);
  assert.ok(sinks(O.ACCENT.LH, lhK.lower) && sinks(O.ACCENT.LH, HOUSE_DARK) && dE(O.ACCENT.LH, HOUSE_DARK) < 14 && !lhK.at.some((p) => sinks(O.ACCENT.LH, p)));
  assert.deepEqual([lhOwn.bg, lhOwn.src, lhOwn.inked, lhOwn.pad, styleProp(lhOwn.style, '--orb-ink')], [THE_WHITE, '/logos/symbols/airlines/LH.svg', false, PAD, O.ACCENT.LH]);
  assert.deepEqual(art('/logos/symbols/airlines/LH.svg').colours, ['#05164D'], 'the crane is drawn in its navy');
  assert.ok(LEDGER.LH && /lower right panel/.test(LEDGER.LH));
  // the function, where it decides
  const dk = block('window._gateCardDark = function'), lp = block('window._gateLowerPair = function');
  assert.match(dk, /if \(window\._gateColumnKept\(raw\)\) return '';/);
  assert.match(dk, /if \(window\._GATE_CARD_PICTURES\[D\.carrier\]\) return '';/);
  assert.match(dk, /if \(!window\._gateDiscSinks\(D\.disc, window\._gateCardScreen\(window\._gateCardShade\(D\.accent\)\)\)\) return '';/);
  assert.match(dk, /var list = \[window\._GATE_CARD_DARKS\[D\.carrier\], window\._GATE_CARD_DARK\];/);
  assert.match(lp, /if \(window\._gateColumnKept\(raw\)\) return out;/);
  assert.match(lp, /if \(words\.some\(function \(w\) \{ return _rc2Contrast\(d, w\) < 4\.5; \}\)\) continue;/);
  // the pair of the carrier itself does not move: the weather card and the boarding strip read it
  assert.doesNotMatch(block('function _rc2Pair(code, tables) {'), /_gateLowerPair|_gateCardDark/);
  assert.match(CORE, /var _bPair = _rc2Pair\(airlineCode\);/);
});

test('rule 6, a tile drawn as an inset is round and inside a wide white ring, on the rail, the shelf and the Your Aircraft orb', () => {
  let n = 0;
  for (const code of CODES) {
    const { L, emb, A } = column(code);
    if (!L.inset) continue;
    n++;
    assert.equal(L.white, true, code);
    // the file: on disk, and square, so that cropped to a circle it is a round picture of itself
    assert.ok(A.exists && /\.svg$/.test(A.path), code + ': ' + L.art);
    const vb = GEN.build(fs.readFileSync(path.join(FC, A.path), 'utf8')).vb;
    assert.ok(vb.length === 4 && Math.abs(vb[2] - vb[3]) < 0.01 * vb[2], code + ': a square tile, ' + vb.join(' '));
    // THE RAIL, read off the style it writes: a white disc, a ring of padding, the picture cropped
    // round and filling what the ring leaves, and no marker class (the class takes the padding away)
    assert.equal(styleProp(emb.style, 'background'), THE_WHITE, code + ': a white disc');
    assert.equal(styleProp(emb.style, 'padding'), RING, code + ': the ring');
    assert.equal(styleProp(emb.style, 'border-radius'), '50%', code + ': the disc is round');
    assert.equal(emb.imgStyle, 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;', code + ': the picture is round');
    assert.equal(emb.native, false, code + ': ' + emb.cls);
    assert.equal(emb.inked, false, code);
    // THE YOUR AIRCRAFT ORB, on its own leg: the same, its ring written from the length that sizes it
    const own = orbFacts(W._gateCardOrb(code, '').html);
    assert.deepEqual([own.src, own.bg, own.pad, own.fit, own.native], [emb.src, THE_WHITE, RING_CARD, 'cover', false], code + ': the Your Aircraft orb');
    assert.match(own.imgStyle, /border-radius:50%;/, code);
    // THE BOARDING SHELF: the same
    const S = O.shelf(code), shelf = orbFacts('<div class="v2-fi-icon-wrap v2-fi-emblem-wrap' + S.orb.nativeCls + '" style="' + S.orb.badge + '">' + S.icon + '</div>');
    assert.deepEqual([shelf.src, shelf.bg, shelf.pad, shelf.fit, shelf.native], [emb.src, THE_WHITE, RING, 'cover', false], code + ': the boarding shelf');
    assert.match(shelf.imgStyle, /border-radius:50%;/, code);
    assert.equal(S.orb.badge, W._gateOrbParts(code).badge, code + ': the shelf writes the recipe of the rail');
  }
  assert.ok(n >= 25 && n <= 40, n + ' tiles drawn as an inset');
  // THE WIDTH OF THE RING: 30 HUNDREDTHS OF THE RADIUS, AT THE LEAST 29. The ring of the Alaska orb
  // art is 7 of a radius of 50, 14 hundredths, and a tile inside a ring that thin left three quarters
  // of the orb the colour of the tile above five white discs. At 30 the roundel is 70 hundredths of
  // the disc across and half of the disc is white: a white disc that carries a roundel.
  const asa = fs.readFileSync(path.join(FC, 'logos/airline-tiles/ASA-orb.svg'), 'utf8');
  assert.match(asa, /<circle cx="50" cy="50" r="50" fill="#FFFFFF"\/><circle cx="50" cy="50" r="43"/);
  assert.ok(7 / 50 < RING_SHARE / 2, 'the ring of that art is less than half of this one');
  assert.equal(W._GATE_ORB_RING, RING);
  // on the rail and the shelf: the padding the gate writes, against the disc the stylesheet sizes
  // (the last rule that sizes the emblem box, which is the one that wins: 7.48vh between 48 and 92)
  const ring = /^clamp\((\d+)px,([\d.]+)vh,(\d+)px\)$/.exec(RING).slice(1).map(Number);
  const sizes = [...GATE_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.v2-fi-row \.v2-fi-emblem-wrap \{\s*width: clamp\((\d+)px,([\d.]+)vh,(\d+)px\) !important;/g)].map((m) => m.slice(1).map(Number));
  assert.ok(sizes.length >= 3, sizes.length + ' rules size the emblem box');
  const disc = sizes[sizes.length - 1];
  assert.deepEqual(disc, [48, 7.48, 92]);
  for (let k = 0; k < 3; k++) {
    const share = ring[k] / (disc[k] / 2);
    assert.ok(share >= RING_SHARE - 0.01 && share <= RING_SHARE + 0.01, 'a ring of ' + ring[k] + ' on a disc of ' + disc[k] + ': ' + share.toFixed(3) + ' of the radius');
  }
  // 1050 pixels high: a disc of 78.5 and a ring of 11.8, where the ring was 5.25
  assert.ok(Math.abs(1050 * ring[1] / 100 - 11.76) < 0.01 && Math.abs(1050 * disc[1] / 100 - 78.54) < 0.01);
  assert.ok(1 - Math.pow(1 - RING_SHARE, 2) > 0.5, 'more than half of the disc is white');
  // on the Your Aircraft orb the stylesheet sizes the box from --rcp-orb and pads it with !important,
  // so the ring is written from that length with !important, which an inline style needs to win
  const flat = CSS.replace(/:not\((?:#_|\._)\)/g, '');
  assert.match(flat, /\.v2-rc-shelf-fi \.v2-fi-orbwrap \{\s*width: var\(--rcp-orb\) !important;[\s\S]{0,400}?padding: clamp\(4px, min\(0\.55vh, 0\.34vw\), 7px\) !important;/);
  assert.match(CSS, /--rcp-orb: clamp\(30px, min\(5vh, 3\.1vw\), 64px\);/);
  const card = /^calc\(var\(--rcp-orb, 52px\) \* ([\d.]+)\) !important$/.exec(RING_CARD);
  assert.ok(card && Math.abs(Number(card[1]) * 2 - RING_SHARE) < 1e-9, 'the same share of the radius: ' + RING_CARD);
  assert.ok(0.55 / (5 / 2) < RING_SHARE - 0.05, 'the padding of the stylesheet alone was ' + (0.55 / 2.5).toFixed(2) + ' of the radius');
  assert.match(block('window._gateCardOrb = function'), /if \(P\.inset\) badge = badge\.replace\('padding:' \+ window\._GATE_ORB_RING \+ ';', 'padding:calc\(var\(--rcp-orb, 52px\) \* 0\.15\) !important;'\);/);
  // NEVER THE BARE TILE FILLING A WHITE DISC, AND NEVER A SQUARE IN A CIRCLE: on a white column no
  // box is clear, none has its padding taken away, and a tile on it is always the round inset
  for (const code of CODES) {
    const { L, emb } = column(code);
    if (!L.white) continue;
    assert.ok(emb.bg === THE_WHITE && emb.pad !== '0' && !emb.native, code + ': ' + emb.style);
    if (/\/airline-tiles\//.test(emb.src)) assert.equal(L.inset, true, code + ': ' + emb.src);
    if (!L.inset && emb.src) assert.deepEqual([emb.pad, emb.fit], [PAD, 'contain'], code + ': a mark, whole, inside the padding of every mark');
  }
  // the stylesheet takes the padding of the Your Aircraft orb away only under the marker class, and
  // forces the fit of a rail image to contain only where the box has no marker class: a square tile
  // is the same picture under either fit, and it is cropped round by its own style
  assert.match(flat, /\.v2-rc-shelf-fi \.v2-fi-orbwrap\.v2-fi-orbwrap-native \{\s*padding: 0 !important;/);
  assert.match(GATE_CSS, /\.v2-fi-emblem-wrap\.v2-fi-emblem-native \.v2-fi-emblem-img \{\s*object-fit: cover !important;/);
  // a file that fails on a white disc and falls back to the row tile keeps the ring: the handler
  // takes the padding away only where the box does not carry the mark of a white disc
  assert.match(block('window._orbArtFailed = function'), /if \(_p && _p\.style && !String\(_p\.style\.getPropertyValue\('--orb-ring'\) \|\| ''\)\.trim\(\)\) _p\.style\.setProperty\('padding', '0', 'important'\);/);
  for (const code of ['AY', 'AM', 'YX']) assert.equal(styleProp(column(code).emb.style, '--orb-ring'), '1', code);
  for (const code of ['AC', 'BT', 'KE', 'OS', 'IB']) assert.equal(styleProp(column(code).emb.style, '--orb-ring'), '', code);
  assert.doesNotMatch(CSS + GATE_CSS, /--orb-ring\b/, 'the mark is the business of the handler alone');
});

test('rule 6, the white of every white column is the same literal', () => {
  assert.equal(W._GATE_WHITE, THE_WHITE);
  // every ground any column writes that is white or nearly white is that one string: the top orb, the
  // five badges, the shelf, the Your Aircraft orb on its own leg and under a set of operators
  const OPS = ['', 'ZZ', 'AC', 'AA', 'BA', 'OO', 'KE', 'IB', 'AF', 'QK', 'YX', 'P6'];
  let whites = 0;
  const check = (g, where) => {
    if (!HEX.test(full(g)) || contrast(full(g), THE_WHITE) >= 1.2) return;
    whites++;
    assert.equal(g, THE_WHITE, where + ': ' + g);
  };
  for (const code of CODES) {
    const { emb, badge, L } = column(code), S = O.shelf(code);
    check(emb.bg, code + ', the top orb');
    check(badge.bg, code + ', the five badges');
    check(L.bg, code + ', the look');
    check(styleProp(S.badge, 'background'), code + ', the shelf badges');
    check(styleProp(S.orb.badge, 'background'), code + ', the shelf orb');
    for (const op of OPS) check(orbFacts(W._gateCardOrb(code, op).html).bg, code + ' operated by ' + (op || 'itself'));
  }
  assert.ok(whites >= 1800, whites + ' white discs');
  // the second, greyer white is gone from every column: the light disc of the ten carriers that had it
  for (const code of ['2L', '4Y', 'BA', 'CJ', 'ET', 'HA', 'LY', 'PR', 'WN']) assert.deepEqual([column(code).emb.bg, column(code).badge.bg], [THE_WHITE, THE_WHITE], code);
  assert.match(block('window._gateOrbNatural = function'), /var LIGHT = plain \? '#F2F4F7' : '#FFFFFF';/, 'only the surfaces beside the orbs keep the disc they drew');
  assert.match(block('window._gateOrbWhite = function'), /var WHITE = window\._GATE_WHITE;/);
  // the brands on a white ground of their own, and the white the stylesheet paints for American and
  // Porter, are the same white
  for (const [code, b] of Object.entries(W._BADGE_TILE_BRANDS)) if (contrast(full(b.bg), THE_WHITE) < 1.2) assert.equal(b.bg, THE_WHITE, code);
  for (const code of ['AA', 'PD']) assert.equal(LOOKS[code].ground, THE_WHITE, code);
  assert.ok(/\.v2-fi-icon-badge\s*\{\s*background: #ffffff !important;\s*color: #0078D2 !important;/i.test(CSS), 'the white the stylesheet paints on the badges of American');
});

test('rule 6, the depth of a white disc reaches every white column: keyed on what the gate writes, not on a list of codes', () => {
  // THE TREATMENT: a white disc gets its form from the shading under it (a hairline ring, a soft
  // inner shadow, the drop shadow) and a gloss that fades to a cool grey, where a coloured disc takes
  // a dark inner shadow and a white gloss that cannot show on white. Three selectors of the stylesheet.
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].replace(/:not\(#_\)/g, '').replace(/\s+/g, ' ').trim(), body: m[2].replace(/\s+/g, ' ') }));
  const depth = rules.filter((r) => /inset 0 0 0 1px rgba\(0, 0, 0, 0\.14\)/.test(r.body) && /0 2px 8px rgba\(5, 15, 30, 0\.35\)/.test(r.body) && /inset 0 -7px 11px -7px/.test(r.body));
  const gloss = rules.filter((r) => /linear-gradient\(to bottom, rgba\(255, 255, 255, 0\.95\), rgba\(186, 203, 224, 0\.22\)\)/.test(r.body));
  assert.equal(depth.length, 1, 'one rule gives the shading');
  assert.equal(gloss.length, 1, 'one rule gives the gloss');
  assert.equal(depth[0].sel, 'html body[data-gate-discs="light"] .g8-wrap .v2-fi-icon-badge, html body[data-gate-discs="light"] .g8-wrap .v2-fi-emblem-wrap:not(.v2-fi-emblem-native)');
  assert.equal(gloss[0].sel, 'html body[data-gate-discs="light"] .g8-wrap .v2-fi-icon-badge::after');
  // keyed on the attribute alone: no code of a carrier is named in either, and nothing else reads it
  for (const r of depth.concat(gloss)) assert.doesNotMatch(r.sel, /data-gate-airline/, r.sel);
  assert.equal(CSS.split('[data-gate-discs="light"]').length - 1, 3, 'three selectors');
  assert.doesNotMatch(GATE_CSS, /data-gate-discs/);
  // the weight of each selector is what it was: one attribute in the place of one :is() of attributes,
  // and the ten :not(#_) it carried
  const raw = CSS.slice(CSS.indexOf('html body[data-gate-discs="light"]'));
  assert.equal(raw.slice(0, raw.indexOf(' .g8-wrap')).split(':not(#_)').length - 1, 10);
  // THE GATE WRITES IT, beside the code of the carrier, in the two places that attribute is set, and
  // takes it away in the two places that one is taken away
  assert.equal(CORE.split("setAttribute('data-gate-airline'").length - 1, 2);
  assert.match(CORE, /document\.body\.setAttribute\('data-gate-airline', _skinCode\);\s*\n\s*\/\/[^\n]*\n\s*window\._gateDiscsAttr\(_skinCode\);/);
  assert.match(CORE, /document\.body\.setAttribute\('data-gate-airline', \(typeof _orbEmblemCarrier === 'function'\) \? _orbEmblemCarrier\(window\._gateCurrentAirline\) : window\._gateCurrentAirline\); window\._gateDiscsAttr\(window\._gateCurrentAirline\);/);
  assert.equal(CORE.split("removeAttribute('data-gate-airline'); document.body.removeAttribute('data-gate-discs');").length - 1, 2);
  assert.equal(CORE.split("removeAttribute('data-gate-airline')").length - 1, 2, 'and it is never taken away alone');
  // the function, run against a stand-in for the body: set for a white column, taken away for a coloured one
  const attrs = {};
  const run = new Function('window', 'document', block('window._gateDiscsAttr = function') + '\nreturn window._gateDiscsAttr;')(W, { body: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } } });
  run('AY'); assert.deepEqual(attrs, { 'data-gate-discs': 'light' });
  run('IB'); assert.deepEqual(attrs, {});
  run('AA'); assert.deepEqual(attrs, { 'data-gate-discs': 'light' });
  run(''); assert.deepEqual(attrs, {});
  // WHO IS LIGHT: the ten carriers whose art sits on the light disc (the twelve codes the selectors
  // named, under the codes a gate can wear), and every column the rule of the card has made white
  const TEN = ['2L', '4Y', 'AA', 'BA', 'CJ', 'ET', 'HA', 'LY', 'PR', 'WN'];
  let light = 0, whiteCols = 0;
  for (const code of CODES) {
    const { L } = column(code), is = W._gateDiscsLight(code), ten = TEN.includes(O.fold(code));
    assert.equal(is, L.white || ten, code + ': ' + (L.white ? 'a white column' : ten ? 'the light disc' : 'a disc of a colour'));
    // the attribute is keyed on the carrier the gate wears, as the code beside it is
    assert.equal(W._gateDiscsLight(O.fold(code)), is, code + ' and ' + O.fold(code));
    if (is) light++;
    if (L.white) { whiteCols++; assert.equal(is, true, code + ': the treatment reaches this white column'); }
  }
  assert.ok(whiteCols >= 110 && light === whiteCols + CODES.filter((c) => TEN.includes(O.fold(c))).length, light + ' light gates, ' + whiteCols + ' of them white columns');
  // a gate approved as drawn is where it was: light only under the ten (American and the regionals
  // that print it), so Porter, Arajet and Air Inuit keep the white discs they drew, as they drew them
  for (const code of CODES) if (isKept(code)) assert.equal(W._gateDiscsLight(code), O.fold(code) === 'AA', code);
  for (const code of ['OS', 'IB', 'TP', 'QR', 'KE', 'SQ', 'LH']) assert.equal(W._gateDiscsLight(code), false, code);
  assert.match(block('window._gateOrbNatural = function'), /light: !letters && !onOwnGround && !isTile && !!LIGHT_DISC\[c\],/);
});

test('rule 6, the dark plate: the house charcoal, the dark of an airline where it has one, and white figures that read', () => {
  // THE HOUSE CHARCOAL, under the engraving: white figures read on it at 15.5 to 1
  assert.equal(W._GATE_CARD_DARK, HOUSE_DARK);
  assert.equal(screened(HOUSE_DARK), '#222429');
  assert.ok(contrast(THE_WHITE, screened(HOUSE_DARK)) > 15.4 && contrast(THE_WHITE, screened(HOUSE_DARK)) < 15.7, contrast(THE_WHITE, screened(HOUSE_DARK)).toFixed(2));
  assert.ok(chroma(HOUSE_DARK) < SINK.chroma && chroma(screened(HOUSE_DARK)) < SINK.chroma, 'a neutral: it has no hue for a disc to share');
  // THE DARK OF AN AIRLINE, where one is on record: six rows, each a black or a dark grey
  assert.deepEqual(W._GATE_CARD_DARKS, { TR: '#000000', VY: '#4D4D4D', PC: '#323A47', OS: '#000000', DE: '#111111', KQ: '#0D0D0D' });
  // (Royal Jordanian has a dark grey on record, #222121, and grey discs. A grey under a grey is a
  // shade of the discs, 21 from them where the house charcoal is 24: no row, the house charcoal.)
  const rj = W._ORB_TILE_GROUNDS.RJA;
  assert.ok(chroma(rj) < SINK.chroma && dE(rj, screened('#222121')) < 21.5 && dE(rj, screened(HOUSE_DARK)) > 23, 'Royal Jordanian: ' + rj);
  assert.deepEqual([W._gateCardPaint('RJ').kind, W._gateCardPaint('RJ').base], ['dark', HOUSE_DARK]);
  for (const [code, dark] of Object.entries(W._GATE_CARD_DARKS)) {
    const K = W._gateCardPaint(code), { L, top } = column(code), natural = plateOf(code).natural;
    // a neutral, and never a hue of the discs it lies under
    assert.ok(chroma(dark) < 10 && lab(dark)[0] < 35, code + ': ' + dark + ', chroma ' + chroma(dark).toFixed(1));
    assert.ok(!(chroma(dark) >= SINK.chroma && hueGap(dark, natural) < SINK.hue), code + ': ' + dark + ' is no shade of ' + natural);
    // it is the card of that gate, under the engraving, and white figures read on it at 4.5 to 1 or better
    assert.deepEqual([K.kind, K.base, K.paint, L.white], ['dark', dark, screened(dark), false], code);
    assert.ok(contrast(THE_WHITE, K.paint) >= 4.5, code + ': white on ' + K.paint + ' = ' + contrast(THE_WHITE, K.paint).toFixed(1));
    assert.ok(sinks(natural, shadeOf(full(O.accent(code)))) && clear(natural, K.paint), code + ': ' + natural + ' sank into the shade of itself and stands clear of ' + K.paint);
    assert.ok(same(top, natural), code);
    // nothing else moves: the accent of the gate is its colour still
    assert.ok(!same(O.accent(code), dark), code);
  }
  // THE YELLOWS. The primary of four carriers is a yellow (CIELAB hue 80 to 110 at a lightness of 80
  // or more), and the shade of a yellow is a khaki, under figures set in white. Three have the dark
  // each sets its yellow on, which is the ink the look already sets on its yellow discs; Cebu Pacific
  // has none on record and takes the house charcoal.
  const hue = (h) => { const [, a, b] = lab(h); const t = Math.atan2(b, a) * 180 / Math.PI; return t < 0 ? t + 360 : t; };
  const yellow = (h) => lab(h)[0] >= 80 && hue(h) >= 80 && hue(h) <= 110 && chroma(h) >= 40;
  assert.deepEqual(CODES.filter((c) => yellow(full(O.accent(O.fold(c))))).sort(), ['5J', 'PC', 'TR', 'VY']);
  for (const code of ['TR', 'VY', 'PC']) {
    const { emb, badge, top } = column(code), accent = full(O.accent(code));
    assert.ok(same(LOOKS[code].ink, W._GATE_CARD_DARKS[code]), code + ': the ink of its glyphs');
    assert.deepEqual([emb.bg, emb.fit, top, badge.bg, badge.ink], ['transparent', 'cover', accent, accent, W._GATE_CARD_DARKS[code]], code);
    assert.equal(O.ACCENT[code], accent, code);
  }
  assert.deepEqual([W._gateCardPaint('5J').kind, W._gateCardPaint('5J').base, column('5J').L.white, column('5J').badge.bg], ['dark', HOUSE_DARK, false, W._ORB_TILE_GROUNDS.CEB]);
  // the first dark its discs stand clear of: the dark of the airline before the house one, and the
  // house one where the discs do not stand clear of its own (a red disc given a grey as bright as it)
  O.ACCENT.XYZ = '#B03030'; W._GATE_CARD_DARKS.XYZ = '#5A5A5A';
  try {
    assert.ok(sinks('#B03030', shadeOf('#B03030')) && !clear('#B03030', screened('#5A5A5A')) && clear('#B03030', screened(HOUSE_DARK)));
    assert.equal(W._gateCardDark('XYZ'), HOUSE_DARK);
    W._GATE_CARD_DARKS.XYZ = '#101010';
    assert.equal(W._gateCardDark('XYZ'), '#101010');
  } finally { delete O.ACCENT.XYZ; delete W._GATE_CARD_DARKS.XYZ; }
  // the gate publishes the dark beside its accent, on the element the plate rule reads from, and
  // takes it away for every other gate
  assert.match(CORE, /_rootStyle\.setProperty\('--airline-accent', accent\);[\s\S]{0,700}try \{ _gateCardDark = window\._gateCardDark\(airlineCode\) \|\| ''; \}/);
  assert.match(CORE, /if \(_gateCardDark\) _rootStyle\.setProperty\('--gate-card', _gateCardDark\); else _rootStyle\.removeProperty\('--gate-card'\);/);
  assert.equal(CORE.split("'--gate-card'").length - 1, 2, 'written in one place');
  assert.equal((CSS + GATE_CSS).split('--gate-card').length - 1, 2, 'read by one rule (and named once in its comment)');
  // ONLY THE PLATE GOES DARK. The header, the title tabs of each card, the frame of the rail and
  // every other accent surface read --airline-accent, which the dark plate does not touch
  assert.doesNotMatch(block('window._gateCardDark = function') + block('window._gateCardPaint = function'), /setProperty|--airline-accent/);
  assert.ok(CSS.split('var(--airline-accent').length - 1 > 60 && CSS.split('var(--gate-card').length - 1 === 1);

  // THE FALLBACK BLUE. Seven carriers with a colour of their own on record had a card that was a
  // shade of the blue of no airline. Each has its colour in the accent table.
  const OWN = { FC: '#007DC8', QN: '#62142E', HO: '#7C0044', SB: '#353E75', HX: '#DA2129', '3U': '#D8000F', JD: '#EA4237' };
  for (const [code, colour] of Object.entries(OWN)) {
    assert.equal(O.ACCENT[code], colour, code);
    // (Aircalin is a navy 9 from that blue, and Link Airways a lighter blue: each is its own all the same)
    assert.ok(!same(colour, '#0033A1') && (dE(colour, '#0033A1') > 10 || code === 'SB'), code + ': ' + colour + ' is not the fallback blue');
    const K = W._gateCardPaint(code), { L, emb } = column(code), bright = clear(colour, screened(HOUSE_DARK));
    // the bright ones keep a disc of their colour on the dark plate; the deep ones (the maroon of
    // Skytrans, the magenta of Juneyao, the navy of Aircalin) are white columns on a shade of it
    assert.deepEqual([K.kind, K.paint, L.white], bright ? ['dark', screened(HOUSE_DARK), false] : ['shade', shadeOf(colour), true], code);
    if (!bright) assert.deepEqual([L.ink, emb.bg], [colour, THE_WHITE], code);
    assert.ok(contrast(colour, THE_WHITE) >= 3, code);
  }
  assert.deepEqual(Object.keys(OWN).filter((c) => clear(OWN[c], screened(HOUSE_DARK))).sort(), ['3U', 'FC', 'HX', 'JD']);
  // no other table carries these carriers, so none is left out of step
  for (const code of Object.keys(OWN).concat(['TR', 'VY', 'PC'])) {
    assert.equal(O.BRAND[code], undefined, code + ' has no row in AIRLINE_BRAND');
    assert.doesNotMatch(COLORS, new RegExp("'" + code + "'\\s*:"), code + ' has no row in airline-colors.js');
  }
  // WHITE FIGURES READ ON EVERY CARD THE GATE MIXES: 4.5 to 1 or better on every shade and every dark
  let low = 99;
  for (const code of CODES) {
    const K = W._gateCardPaint(code);
    if (K.kind === 'picture') continue;
    low = Math.min(low, contrast(THE_WHITE, K.paint));
    assert.ok(contrast(THE_WHITE, K.paint) >= 4.5, code + ': white on ' + K.paint);
  }
  assert.ok(low > 6, 'the lowest is ' + low.toFixed(1) + ' to 1');
});

test('rule 6, a light card: white discs would sink the other way, so the discs keep the colour of the brand', () => {
  // no gate is in this case today: on every card a white disc stands out, and the sand card of Qatar
  // is the nearest, 25 from white
  const nearest = CODES.map((c) => [c, Math.min(...W._gateCardPaint(c).at.map((p) => dE(THE_WHITE, p)))]).sort((a, b) => a[1] - b[1])[0];
  assert.equal(nearest[0], 'QR');
  assert.ok(nearest[1] > 24 && nearest[1] < 27, nearest[1].toFixed(1));
  for (const code of CODES) assert.ok(!W._gateCardPaint(code).at.concat(W._gateCardPaint(code).lower).some((p) => sinks(THE_WHITE, p)), code);
  // the rule, on a card made here: a pale card under a pale disc. Both the disc and white sink into it,
  // so the column is not made white: it keeps the colour of the brand. On a dark card of the same
  // hue the same disc goes white.
  O.ACCENT.ZZ = '#DDE6F7';
  try {
    W._GATE_CARD_PICTURES.ZZ = { file: 'none', at: ['#E9EEF8'] };
    assert.ok(sinks('#DDE6F7', '#E9EEF8') && sinks(THE_WHITE, '#E9EEF8'));
    assert.equal(W._gateColumnWhite('ZZ', ''), '');
    assert.deepEqual([W._gateColumnLook('ZZ').white, W._gateColumnLook('ZZ').ground], [false, '#DDE6F7']);
    W._GATE_CARD_PICTURES.ZZ = { file: 'none', at: ['#33405C'] };
    assert.ok(sinks('#DDE6F7', '#33405C') && !sinks(THE_WHITE, '#33405C'));
    assert.deepEqual([W._gateColumnLook('ZZ').white, W._gateColumnLook('ZZ').ground], [true, THE_WHITE]);
  } finally { delete O.ACCENT.ZZ; delete W._GATE_CARD_PICTURES.ZZ; }
  assert.match(block('window._gateColumnWhite = function'), /if \(!any\(disc\) \|\| any\(white\)\) return '';/);
});

test('rule 6, the ink of a white column is the colour of the brand, and reads on white at 3 to 1 or better', () => {
  let n = 0;
  const deeper = [];
  for (const code of CODES) {
    const { L, badge } = column(code);
    if (!L.white) continue;
    n++;
    const row = LOOKS[L.carrier] || {}, accent = full(O.accent(L.carrier)), natural = W._gateOrbNatural(code).ground;
    assert.ok(contrast(full(L.ink), THE_WHITE) >= 3, code + ': ' + L.ink + ' on white = ' + contrast(full(L.ink), THE_WHITE).toFixed(2));
    assert.ok(same(badge.ink, L.ink) && !WHITE.test(L.ink), code);
    assert.notEqual(L.ink, '#1B2430', code + ': its own colour, never the neutral of the boards');
    // the ink its row names, else the accent, else the ground of its art, else a deeper shade of the accent
    if (row.whiteInk || row.ink) { assert.ok(same(L.ink, row.whiteInk || row.ink), code); continue; }
    if (contrast(accent, THE_WHITE) >= 3) { assert.ok(same(L.ink, accent), code + ': its accent'); continue; }
    if (natural && contrast(full(natural), THE_WHITE) >= 3) { assert.ok(same(L.ink, natural), code + ': the ground of its art'); continue; }
    deeper.push(code);
  }
  assert.ok(n >= 110 && n <= 130, n + ' white columns');
  // A WHITE COLUMN IS A COLUMN OF DARK DISCS, so its colour reads on white as it is: none needs a
  // deeper shade now, and the lowest ink is the blue of KLM set in its navy
  assert.deepEqual(deeper, []);
  let low = 99;
  for (const code of CODES) if (column(code).L.white) low = Math.min(low, contrast(full(column(code).L.ink), THE_WHITE));
  assert.ok(low >= 5, 'the weakest ink of a white column reads at ' + low.toFixed(2) + ' to 1');
  // the same function inks the white disc of an operator on the panel of another gate: the first of
  // the colours given that reads on white, else the first one taken down a step at a time
  assert.equal(W._orbInkOnWhite(['#FF6600']), '#FA6400', 'the orange of easyJet, two hundredths down');
  assert.equal(W._orbInkOnWhite(['#C4921B', '#BD8B13']), '#BD8B13', 'the first that reads');
  assert.equal(W._orbInkOnWhite(['#0033A1']), '#0033A1');
  assert.equal(W._orbInkOnWhite([]), '#1B2430');
  assert.equal(W._gateWhiteInk('U2', W._gateOrbNatural('U2').ground), '#FA6400');
  // Etihad and Gulf Air were at that floor in their gold; each has a stronger ink of its own now
  assert.deepEqual([W._gateWhiteInk('EY', W._gateOrbNatural('EY').ground), W._gateWhiteInk('GF', W._gateOrbNatural('GF').ground)], ['#2E4755', '#857550']);
  assert.ok(contrast('#2E4755', THE_WHITE) > 9.5 && contrast('#857550', THE_WHITE) > 4.4);
});

test('the heritage gates draw what they drew: installed at run time, in no name table, and left as drawn', () => {
  // Air Nova, Canadian Airlines and Air Atlantic get their accent and their name when a heritage page
  // is up (_heritageInstallBranding), under codes that are in no name table and no ledger: ANV and
  // CDX are not designators at all. The rule of the card found them unseen, made each a white column
  // and lettered its code in the top orb. The installer now puts the carrier on the list of gates
  // left as drawn, and each draws what it drew before the rule: run here, with the branding
  // installed by the function of the page itself.
  const src = [block('var HERITAGE_CARRIERS = {'), block('function _heritageInstallBranding() {'), 'return { H: HERITAGE_CARRIERS, install: _heritageInstallBranding };'].join('\n');
  let up = '';
  const page = new Function('window', 'AIRLINE_ACCENT', 'AIRLINE_NAME', '_heritageCode', src)(W, O.ACCENT, O.NAME, () => up);
  assert.deepEqual(Object.keys(page.H).sort(), ['9A', 'ANV', 'CDX']);
  const PLANE = /<svg viewBox="0 0 24 24" style="width:100%;height:100%;fill:#fff;">/;
  const ACCENT_DISC = 'var(--airline-accent,#D82F2E)';
  // what each drew the day before the rule: [top orb file or the generic plane, Your Aircraft orb, second colour of its pair]
  const DREW = {
    ANV: { top: 'plane', own: 'letters ANV', lower: '#0C1119' },
    CDX: { top: 'plane', own: 'letters CDX', lower: '#061D40' },
    '9A': { top: '/logos/symbols/airlines/9A.svg', own: '/logos/symbols/airlines/9A.svg', lower: '#061D40' }
  };
  for (const code of Object.keys(page.H)) {
    const had = { accent: O.ACCENT[code], name: O.NAME[code], kept: W._GATE_COLUMNS_KEPT[code] };
    assert.ok(!CODES.includes(code) && !LEDGER[code], code + ' is in no name table and no ledger');
    up = code;
    try {
      page.install();
      assert.deepEqual([O.ACCENT[code], O.NAME[code], W._GATE_COLUMNS_KEPT[code]], [page.H[code].accent, page.H[code].name, 1], code + ': the branding, and the gate on the kept list');
      assert.equal(W._gateColumnKept(code), true, code);
      const want = DREW[code], L = W._gateColumnLook(code), K = W._gateCardPaint(code);
      // not white, no dark plate, and its lower right panel the second colour of its pair
      assert.deepEqual([L.white, W._gateCardDark(code), K.kind, K.lower, O.pair(code).b], [false, '', 'shade', want.lower, want.lower], code);
      // THE RAIL: the top orb and the five badges, discs of the accent with white on them
      const rail = O.rail({ airlineCode: code }, code, code), emb = orbFacts(rail.emblem);
      assert.deepEqual([emb.bg, styleProp(rail.badge, 'background'), styleProp(rail.badge, 'color'), styleProp(rail.badge, '--orb-code-ink')], [ACCENT_DISC, ACCENT_DISC, '#fff', ''], code);
      assert.doesNotMatch(rail.emblem, /v2-fi-orbcode|_railOrbFailed|--orb-ring/, code + ': no letters of a code that is no designator, and no white disc');
      if (want.top === 'plane') { assert.match(rail.emblem, PLANE, code + ': the generic plane, white on the disc'); assert.deepEqual([emb.src, emb.pad], ['', 'clamp(5px,0.7vh,10px)'], code); }
      else assert.deepEqual([emb.src, emb.inked, emb.pad], [want.top, true, PAD], code);
      // THE YOUR AIRCRAFT ORB, by the builder and by the one function: a disc of the accent
      const own = W._gateCardOrb(code, ''), f = orbFacts(own.html);
      assert.deepEqual([f.bg, f.pad, own.white, own.inset, styleProp(f.style, '--orb-ink')], [ACCENT_DISC, PAD, false, false, ''], code);
      if (/^letters /.test(want.own)) assert.deepEqual([f.src, f.letters, f.lettersStyle], ['', want.own.slice(8), ''], code + ': its letters, white by the stylesheet');
      else assert.deepEqual([f.src, f.inked], [want.own, true], code);
      assert.equal(O.cardWithInbound({ airlineCode: code, currentFlight: { airline: code, _opCode: '' } }).includes(own.badge), true, code + ': the builder writes that orb');
      // THE BOARDING SHELF: five badges of the accent, white glyphs
      const S = O.shelf(code);
      assert.deepEqual([styleProp(S.badge, 'background'), styleProp(S.badge, 'color'), S.orb.white || false, S.ink], [ACCENT_DISC, '#fff', false, '#fff'], code);
      assert.equal(S.orb.badge, W._gateOrbNatural(code).badge, code + ': the recipe of its art');
      assert.equal(W._gateDiscsLight(code), false, code);
    } finally {
      for (const [table, key] of [[O.ACCENT, 'accent'], [O.NAME, 'name'], [W._GATE_COLUMNS_KEPT, 'kept']]) { if (had[key] === undefined) delete table[code]; else table[code] = had[key]; }
    }
  }
  up = '';
  // without the installer the rule would take each again: that is what the list is for
  O.ACCENT.ANV = page.H.ANV.accent;
  try { assert.equal(W._gateCardPaint('ANV').kind, 'dark', 'Air Nova red, were it not kept, would be on the dark plate'); } finally { delete O.ACCENT.ANV; }
  assert.match(block('function _heritageInstallBranding() {'), /window\._GATE_COLUMNS_KEPT\[code\] = 1;/);
  // and off a heritage page the installer does nothing, so the list of the approved gates is as it was
  page.install();
  assert.equal(Object.keys(W._GATE_COLUMNS_KEPT).length, 26);
});

test('the accent of a three-letter code is never borrowed by its first two letters', () => {
  // getAirlineAccent fell back to the accent of the first two letters of a code. A designator the
  // tables know is folded to its carrier before that; one they do not know is another carrier, and
  // it took the colour of whoever holds its first two letters: HOP, the designator of an Air France
  // regional, the magenta of Juneyao (HO); HXA the red of Hong Kong Airlines; SBI the navy of Aircalin.
  const fn = block('function getAirlineAccent(code) {');
  assert.match(fn, /var _borrow = \/\^\[A-Z0-9\]\{3\}\$\/\.test\(c\) \? '' : AIRLINE_ACCENT\[c\.substring\(0, 2\)\];/);
  assert.match(fn, /return AIRLINE_ACCENT\[c\] \|\| _borrow\s*\n/);
  for (const [code, owner] of [['HOP', 'HO'], ['HXA', 'HX'], ['SBI', 'SB'], ['FCM', 'FC'], ['QNZ', 'QN'], ['3UX', '3U'], ['JDL', 'JD'], ['ACX', 'AC'], ['KLX', 'KL']]) {
    assert.ok(O.ACCENT[owner] && !O.ACCENT[code] && !O.desig(code), code + ' is no designator of ' + owner);
    assert.notEqual(O.accent(code), O.ACCENT[owner], code + ' does not take the colour of ' + owner);
    assert.equal(O.accent(code), '#0033A1', code + ': no colour of its own on record');
    assert.equal(W._gateCardPaint(code).paint, shadeOf('#0033A1'), code + ': and its card is not a shade of the colour of ' + owner);
  }
  // every three-letter code no table knows, on every pair of letters that has an accent: none borrows
  let tried = 0;
  for (const two of Object.keys(O.ACCENT).filter((k) => /^[A-Z0-9]{2}$/.test(k))) {
    for (const x of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const code = two + x;
      if (O.ACCENT[code] || O.desig(code) || O.BRAND[code] || CODES.includes(code) || O.fold(code) !== code) continue;
      tried++;
      assert.equal(O.accent(code), '#0033A1', code);
    }
  }
  assert.ok(tried > 2000, tried + ' codes');
  // a designator the tables know is its carrier, as it was, and a code with a row of its own keeps it
  for (const [code, two] of [['ROU', 'RV'], ['ETD', 'EY'], ['UAE', 'EK'], ['DLH', 'LH'], ['FJI', 'FJ'], ['ACA', 'AC'], ['KLM', 'KL'], ['AFR', 'AF'], ['IBE', 'IB'], ['AUA', 'OS']]) {
    assert.equal(O.desig(code), two, code);
    assert.equal(O.accent(code), O.accent(two), code + ' is ' + two);
  }
  // Fiji Airways: FJI had the brown of FJ only through the borrow closed above, and no table named
  // it. The designator table does now, so it is Fiji Airways on every surface that asks the accent
  // or the fold, and never the blue of no airline.
  assert.deepEqual([O.CALL.FJI, O.fold('FJI'), O.accent('FJI'), O.ACCENT.FJ], ['FJ', O.fold('FJ'), '#473729', '#473729']);
  assert.deepEqual(W._gateColumnLook('FJI'), W._gateColumnLook('FJ'), 'FJI draws the gate of FJ');
  // and a code that is not three letters is as it was: the brand code of Air Canada Express wears Air Canada
  assert.equal(O.accent('ACEX'), O.ACCENT.AC);
  assert.equal(O.accent('AC'), O.ACCENT.AC);
});
