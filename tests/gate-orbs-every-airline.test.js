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

const W = {};
const O = new Function('window', [
  block('const AIRLINE_BRAND = {'), block('const AIRLINE_ACCENT = {'), block('function getAirlineAccent(code) {'),
  block('const CALLSIGN_TO_IATA = {'), block('const IATA_TO_TILE_ICAO = {'),
  block('const AIRLINE_NAME = {'), block('const _AIRLINE_NAME_OVERRIDE = {'),
  block('window._CARD_COLOR_EMBLEMS = {'), block('window._orbKeepsColour = function'),
  block('window._BADGE_TILE_BRANDS = {'), block('window._ORB_TILE_GROUNDS = {'), block('window._ORB_TILE_LETTERS = {'), block('window._GATE_ORB_LOOKS = {'),
  block('window._orbInkOn = function'), block('window._gateColumnLook = function'), block('window._gateOwnAccent = function'),
  block('window._gateOrbParts = function'), block('window._CARD_ORB_GROUND = {'), block('window._gateCardOrb = function'),
  block('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {'), block('var GATE_TOP_ROUND_EMBLEM_FILES = {'),
  'var _TILE_DESIGNATOR_IATA = null;', block('function _designatorIata(code) {'),
  block('function _orbEmblemCarrier(code) {'), block('function _airlineOrbEmblem(code) {'), block('function _gateOrbArt(code) {'),
  block('window._orbTileLettersOther = function'), block('function _orbMono(code) {'),
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
  '  mono: _orbMono, FILES: AIRLINE_EMBLEM_FILES, TOP: GATE_TOP_ROUND_EMBLEM_FILES,',
  '  rail: __rail, cardWithInbound: __cardWithInbound, cardNoInbound: __cardNoInbound, pass: __pass, shelf: __shelf };'
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
// or the letters and their ink.
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
    letters: span ? span[2] : '', lettersInk: span ? (/color:\s*(#[0-9a-f]{3,6})/i.exec(span[1] || '') || [])[1] || '' : '' };
}
const isVar = (bg) => /^var\(--airline-accent,/.test(bg);
const styleProp = (style, prop) => { const all = [...String(style).matchAll(new RegExp('(?:^|;)' + prop + ':([^;]+);', 'g'))]; return all.length ? all[all.length - 1][1] : ''; };

// ── the facts of one gate column, read from what the gate writes ───────────
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
  // the top orb: art, or the letters of the code where its only tile letters another code
  if (!L.art && !L.letters) out.push('no orb art: a generic white plane');
  else if (L.art && !A.exists) out.push('the orb art is not on disk: ' + L.art);
  if (emb.src !== (L.art || '')) out.push('the top orb draws ' + (emb.src || 'no file') + ', the look says ' + (L.art || 'none'));
  if (L.letters && emb.letters !== L.letters) out.push('the top orb letters ' + emb.letters + ', the look says ' + L.letters);
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
    if (L.letters && emb.lettersInk && contrast(emb.lettersInk, top) < 3) out.push('the letters ' + emb.lettersInk + ' on ' + top + ' read at ' + contrast(emb.lettersInk, top).toFixed(2) + ' to 1');
  }
  // 2. NO EMBLEM INKED WHITE: judged from the filter the image style carries, not from a flag.
  if (emb.inked !== !!L.whitened && !emb.generic && emb.src) out.push('the image style ' + (emb.inked ? 'carries' : 'has no') + ' white filter and the look says whitened ' + !!L.whitened);
  if (emb.inked && A.exists) {
    const inks = (A.colours || []).filter((c) => !/^#F[C-F]F[C-F]F[C-F]$/i.test(c));
    if (!A.colours) out.push('a raster emblem inked white');
    else if (inks.length > 1) out.push('an emblem of ' + inks.length + ' colours inked white: ' + inks.join(' '));
  }
  if (A.exists && accent.toUpperCase() === '#0033A1') out.push('no colour of its own: the fallback blue beside its art');
  // THE BOARDING SHELF: the same emblem orb beside five badges of its own (a carrier the
  // stylesheet paints is left to the stylesheet there too).
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
const REGIONAL = 'a regional that flies in the livery of a mainline and has no emblem of its own (Republic, GoJet, Air Wisconsin, CommuteAir, Compass): as an operator its orb is left to the gate carrier; a gate under its own code would draw the generic plane';
const NO_ART = 'no emblem, tile or symbol on disk under this code, and none the tile folder names for it: the top orb is the generic plane until art is supplied';
// Seven codes have a finished tile on disk. MANIFEST.csv, the list of the tile folder itself,
// names the file for the code, and the script lists its ground. No table points the code at it
// because nobody has checked that label against the airline (two of the eight labels the folder
// gives are wrong: see XR). The reason is that, not a missing file.
const TILE_UNCHECKED = 'a finished tile is on disk for this code (MANIFEST.csv names it), but its label has not been checked against the airline, so no table points the gate at it: the top orb is the generic plane until someone confirms the tile';
const GRADIENT = 'WZZ.svg is a gradient, the magenta of Wizz down to its blue: no single ground a disc could match. The five badges take the magenta end, the value of the accent table. It needs a mark on one ground.';
const LEDGER = {
  '8P': 'PCO.svg is a tile of two grounds, orange and navy halves: no ground the badges could take. It needs one drawing on a full navy ground.',
  'LL': 'level-emblem.svg is half cyan and half green: no single ground. It needs a mark on one ground from the airline.',
  'ZP': 'ZP.svg is half clear and Paranair has no colour on file: it needs its red confirmed and a mark on a finished ground.',
  'W6': GRADIENT, 'W4': GRADIENT,
  // Austrian: the red of its tile holds two thirds of the rim; a white band crosses the rest and
  // fills more of the disc than the red does. Beside five red discs the orb reads half white.
  'OS': 'AUA.svg is red on two thirds of its rim only: a white band carries the chevron across it, and white fills more of the disc than the red. No ground the badges could take; no other Austrian mark is on disk. It needs a mark on a full red ground.',
  // Rouge as a row code: the column is the red of Air Canada, and the Your Aircraft orb keeps the
  // burgundy recorded for Rouge at v23260 (the ink of its script, bottom-right card only).
  'RV': 'the Your Aircraft orb keeps the Rouge burgundy #A21C37, a recorded choice (v23260), beside a column in the red of Air Canada: two colours on purpose, and the same orb an Air Canada gate shows when Rouge operates the leg',
  'YX': REGIONAL, 'G7': REGIONAL, 'ZW': REGIONAL, 'C5': REGIONAL, 'CP': REGIONAL,
  'VB': 'VivaAerobus has an emblem on disk (a .webp, which this test cannot read) but no colour confirmed from the airline: nothing points its orb at the emblem until its green is known.',
  'XR': 'MANIFEST.csv names PAO.svg for this code, but that tile is labelled for another operator (a Polish one), not Corendon: no art on disk for it',
  // Approved as drawn, and not to be changed: a white mark and white glyphs on the blue of the
  // brand, under the 3 to 1 floor (Transat 2.41, WestJet 2.64), on the rail and on the shelf.
  'TS': 'approved as drawn the day before this audit: the white star and white glyphs on Transat blue',
  'WS': 'the sanctioned white leaf and white glyphs on WestJet teal (WestJet Encore, WR, wears the same)'
};
const UNCHECKED_TILES = { BG: 'BBC', BI: 'RBA', BY: 'TOM', KA: 'CRK', NK: 'NKS', NO: 'NOS', QS: 'TVS' };
for (const c of Object.keys(UNCHECKED_TILES)) LEDGER[c] = TILE_UNCHECKED;
for (const c of ('2T 3K 4B 4T 5F 7F 8M 8T 9C 9K AN AX BJ BM DO EM EV FD GM H2 H4 IV JA KG KM KO LF LR MT N0 NF OK '
  + 'P4 PA PJ RP S5 SM TB W3 W8 WG WL XC XN Z0 ZG ZH').split(' ')) LEDGER[c] = NO_ART;

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
  // an accent disc is written as the accent variable, a tile as a clear box, a brand on its ground as that ground
  assert.ok(isVar(column('AC').emb.bg) && isVar(column('AC').badge.bg));
  assert.deepEqual([column('IB').emb.bg, column('IB').emb.fit, column('IB').badge.bg], ['transparent', 'cover', W._ORB_TILE_GROUNDS.IBE]);
  assert.deepEqual([column('KE').emb.bg, column('KE').badge.bg], ['#FFFFFF', '#FFFFFF']);
  assert.deepEqual([column('BA').emb.bg, column('BA').badge.bg], ['#F2F4F7', '#F2F4F7']);
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
  assert.equal(none.length, 48, 'codes with no art of any kind');
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
  assert.ok(art(LOOKS.OS.art).main === '#FFFFFF', 'white fills more of the disc than the red');
  // Wizz: one break, the gradient
  for (const code of ['W6', 'W4']) assert.deepEqual(kinds(code), ['the orb art has a gradient at its rim'], code);
  // two grounds
  for (const code of ['8P', 'LL']) assert.ok(broken(code).some((s) => /^two colours/.test(s)), code + ': ' + broken(code).join('; '));
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
  assert.ok(CORE.indexOf('window._ORB_TILE_GROUNDS = {') < CORE.indexOf('window._gateOrbParts = function (code) {'), 'made before the recipe that reads it');
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
  // and no carrier takes a ramp as the ground of its discs unseen: the only orbs whose art has a gradient rim are in the ledger
  for (const code of CODES) {
    const { L, P } = column(code);
    if (!P.native || !/\/airline-tiles\/[^/]+\.svg/.test(L.art || '') || !P.ground) continue;
    if (art(L.art).rampShare > 0.5) assert.ok(LEDGER[code] === GRADIENT, code + ': ' + L.art);
  }
  // decided by hand, from art on disk: Qantas its mark of one colour, white on the red it publishes;
  // Hawaiian draws its emblem on the light disc, and nothing on the gate reads the ground of its tile
  assert.deepEqual([column('QF').L.art, column('QF').L.ground, column('QF').emb.inked], ['/logos/symbols/airlines/QF-mono.svg', '#DF0000', true]);
  assert.deepEqual(art('/logos/symbols/airlines/QF-mono.svg').colours, ['#000000'], 'one colour');
  assert.ok(contrast('#FFFFFF', '#DF0000') >= 4.5);
  assert.deepEqual([column('HA').L.art, column('HA').L.ground], ['/logos/airlines/us-major/hawaiian-pualani.svg', '#F2F4F7']);
  for (const code of ['W6', 'W4']) assert.deepEqual([column(code).L.art, column(code).L.ground, column(code).badgeBg], ['/logos/airline-tiles/WZZ.svg', O.ACCENT.W6, O.ACCENT.W6], code);
});

test('a carrier with no emblem and a finished tile draws the tile in both orbs, and its badges take the ground of the tile', () => {
  let n = 0;
  for (const code of CODES) {
    const { L, P, emb, badge } = column(code);
    const m = /^\/logos\/airline-tiles\/([^/?]+)\.svg/.exec(L.art || '');
    if (!m || !W._ORB_TILE_GROUNDS[m[1]] || L.css) continue;
    const row = LOOKS[L.carrier] || {};
    if (row.ground) continue;
    n++;
    assert.equal(badge.bg, W._ORB_TILE_GROUNDS[m[1]], code + ': the badges the rail writes are the ground of ' + m[1] + '.svg, the same string');
    assert.equal(P.native, true, code + ': the tile fills the orb');
    assert.deepEqual([emb.bg, emb.fit, emb.inked], ['transparent', 'cover', false], code + ': a clear box, the tile to its edge, never inked');
    // the rim of the file, read here, is that ground
    const A = art(L.art);
    assert.ok(dE(A.rim, badge.bg) < 6 && A.rimShare >= 0.9, code + ': ' + A.rim + ' on ' + A.rimShare.toFixed(2) + ' of the rim of ' + m[1]);
  }
  assert.ok(n >= 85, n + ' carriers wear their finished tile');
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
  // the plates ask it, the notice and the standby card ask the recipe for the mark
  for (const v of ['_holdCode', '_fallbackCode', '_mapLifeCode']) assert.match(CORE, new RegExp('_airlineOrbEmblem\\(' + v + '\\)'), v);
  assert.match(block('function _gateChangeOrbHtml(code) {'), /window\._gateOrbParts\(c, true\)/);
  assert.match(block('function _gateCardEmblem(code) {'), /window\._gateOrbParts\(code, true\)/);
  // and the orbs ask the orb resolver: the recipe, and through it the rail, both builders, the pass and the shelf
  assert.match(block('window._gateOrbParts = function'), /\(\(!plain && typeof _gateOrbArt === 'function'\) \? _gateOrbArt\(c\)/);
  assert.match(RAIL_HEAD + block('function _emblemImg(code, rowCode) {'), /path = _railParts\.path;/);
  for (const src of [MC_VARS, NI_VARS, PASS]) assert.match(src, /window\._gateCardOrb\(/);
  assert.doesNotMatch(MC_VARS + NI_VARS + PASS + SHELF_ORB, /_airlineOrbEmblem\(/, 'no orb asks the shared resolver');
  // a symbol that is a disc is still drawn as one where the symbol is what is drawn
  for (const code of ['EW', 'LO', 'DE', 'A3', 'PC', 'CM', 'MO', 'HV', 'JL']) assert.equal(W._gateOrbParts(code, true).native, true, code);
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
  // a gate of another code that reaches it shows its own letters, on a disc of the ground that tile is drawn in
  const OTHER = { P6: 'PSC', D8: 'NAX', DI: 'NAX' };
  for (const [code, tile] of Object.entries(OTHER)) {
    const { L, emb, badge } = column(code), g = W._ORB_TILE_GROUNDS[tile];
    assert.deepEqual([L.art, L.letters, L.ground], ['', code, g], code);
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
    // a ground written by hand is the colour the rim of that art is painted in, on three quarters
    // of it or more; a row that cannot say so is in the ledger, with the reason
    if (row.ground && !row.css && row.art && !LEDGER[code]) {
      const A = art(row.art);
      assert.equal(A.rim, row.ground, code + ': the rim of ' + row.art);
      assert.ok(A.rimShare >= 0.75 && !A.rampShare, code + ': ' + A.rimShare.toFixed(2) + ' of the rim');
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
  // the hand grounds that are not the rim of their art are exactly the ledgered ones
  assert.deepEqual(Object.keys(LOOKS).filter((c) => LOOKS[c].ground && LOOKS[c].art && !LOOKS[c].css && LEDGER[c]).sort(), ['OS', 'W4', 'W6']);
  // Qatar: white for most of its rim, by the file its emblem table names
  assert.equal(art(O.FILES.QR).rim, LOOKS.QR.ground);
});

test('the white marks that stay: each is a mark of one colour, on the colour of its brand', () => {
  const white = CODES.filter((c) => !LEDGER[c] && column(c).emb.inked && column(c).A.exists);
  assert.ok(white.length >= 20, white.length + ' marks inked white');
  for (const code of white) {
    const { A, L, top } = column(code);
    assert.ok((A.colours || []).filter((c) => !/^#F[C-F]F[C-F]F[C-F]$/i.test(c)).length <= 1, code + ': ' + (A.colours || []).join(' '));
    assert.ok(contrast('#FFFFFF', top) >= 3 || L.css, code + ': white reads on ' + top);
  }
  // the emblems the audit found inked white, and what each draws now
  for (const code of ['IB', 'KL', 'EK', 'CX', 'FI', 'JQ', 'SN', 'SQ', 'KC', 'VN', '6E', 'AT', 'AV', 'KQ', 'MH', 'SV', 'VA']) {
    assert.match(column(code).emb.src, /^\/logos\/airline-tiles\//, code + ': its finished tile');
    assert.equal(column(code).emb.inked, false, code);
  }
  for (const code of ['JX', 'KE', 'OZ', 'VS']) assert.equal(column(code).emb.inked, false, code + ' keeps its colours');
  for (const code of ['JX', 'KE', 'OZ', 'TG', 'BW']) assert.equal(column(code).emb.bg, '#FFFFFF', code + ': white outside, the emblem in its colours inside');
  assert.equal(W._orbKeepsColour('VS'), true);
  // one colour by design, white on the disc of the brand
  for (const code of ['AM', 'AR', 'FJ', 'JU', 'MF', 'UX', 'LH', 'RO', 'QF']) {
    assert.equal(column(code).emb.inked, true, code);
    assert.ok(isVar(column(code).emb.bg), code + ': on the accent disc');
    assert.equal(column(code).top, O.ACCENT[code], code + ': on its own accent');
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
  // Norwegian UK drew the Norwegian tile, which prints DY: it letters its own code now, on the red of that tile
  assert.deepEqual([column('DI').emb.letters, column('DI').emb.bg, column('DI').badge.ink], ['DI', '#EB0324', '#fff']);
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
  assert.equal(styleProp(ha.badge, 'background'), '#F2F4F7');
  const haCard = orbFacts(O.cardNoInbound({ airlineCode: 'HA', currentFlight: { airline: 'AS' } }, null, 'HA', null));
  assert.deepEqual([haCard.src, haCard.bg], ['/logos/airlines/us-major/hawaiian-pualani.svg', '#F2F4F7'], 'it drew the Alaska face beside a Hawaiian rail');
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
    const look = (c) => { const L = Object.assign({}, W._gateColumnLook(c)); delete L.carrier; delete L.art; delete L.letters; return L; };
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
  assert.match(SHELF_BADGES, /var _birRailInk = _birF8 \? '#141414' : '#fff';\s*\n\s*if \(!_birF8 && _birLook && !_birLook\.css\) _birRailInk = _birLook\.ink;/);
  assert.match(CORE, /_birParts\.badge \+ 'color:' \+ _birRailInk \+ ';'/, 'the emblem orb of the shelf carries the ink of its badges');
  // the shelf chip has no ink rule of its own: it takes the colour of its badge (the base rule and the rule of
  // the column both leave it out, and the only rules that reach it are American and Porter, whose badges the stylesheet paints)
  const chipRules = CSS.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.slice(0, r.indexOf('{'))).filter((sel) => /\.v2-fi-orbcode\b/.test(sel) && !/:not\(\.v2-fi-orbcode-onaccent\)/.test(sel));
  assert.ok(chipRules.length >= 2 && chipRules.every((sel) => /data-gate-airline[*]?="(PD|AA|AAL|AMERICAN)"/.test(sel)), chipRules.map((r) => r.replace(/:not\(#_\)/g, '').trim()).join(' | '));
  let n = 0;
  const white = [], inked = [];
  for (const code of CODES) {
    const { L, badge, accent, top, emb } = column(code);
    if (L.css) continue;
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
  assert.ok(n >= 215 && white.length > 100 && inked.length > 40, n + ' shelves: ' + white.length + ' white, ' + inked.length + ' in the ink of the brand');
  // white glyphs under 3 to 1 on the shelf: the two approved as drawn, nothing else
  const low = CODES.filter((c) => !W._gateColumnLook(c).css && WHITE.test(styleProp(O.shelf(c).badge, 'color')) && contrast('#FFFFFF', column(c).badgeBg) < 3);
  assert.deepEqual(low.sort(), ['TS', 'WS']);
  // the carriers the report named: white on a light disc before
  for (const [code, ground] of [['TR', '#FFE900'], ['VY', '#FFCC00'], ['UL', '#B5D5F1'], ['XY', '#00BBB4'], ['BF', '#00ACE7'], ['G3', '#FF7020'], ['U2', '#FF6600'], ['EZY', '#FF6600'], ['EC', '#FF6600']]) {
    const S = O.shelf(code);
    assert.equal(styleProp(S.badge, 'background'), ground, code);
    assert.ok(contrast(styleProp(S.badge, 'color'), ground) >= 4.5, code + ': ' + styleProp(S.badge, 'color') + ' on ' + ground);
  }
  // and the white outside carriers, with the light tiles: the whole shelf one colour, as on the rail
  for (const code of ['JX', 'KE', 'OZ', 'TG', 'BW', 'JV', 'WT', 'NSA']) assert.equal(styleProp(O.shelf(code).badge, 'background'), '#FFFFFF', code);
  for (const [code, tile] of [['BT', 'BTI'], ['CA', 'CCA'], ['HY', 'UZB'], ['S4', 'RZO'], ['WB', 'RWD']]) assert.equal(styleProp(O.shelf(code).badge, 'background'), W._ORB_TILE_GROUNDS[tile], code);
  for (const code of ['HA', 'BA', 'WN', 'LY', 'PR', '4Y', '2L', 'ET']) assert.equal(styleProp(O.shelf(code).badge, 'background'), '#F2F4F7', code);
  // Singapore: the navy of its tile, never its gold accent beside the navy orb
  assert.deepEqual([styleProp(O.shelf('SQ').badge, 'background'), styleProp(O.shelf('SQ').badge, 'color')], [W._ORB_TILE_GROUNDS.SIA, '#fff']);
  // a ground where white reads at 3 to 1 or better keeps white, unless its look names the dark colour of the brand
  assert.deepEqual(inked.filter((c) => contrast('#FFFFFF', column(c).badgeBg) >= 3).sort(), ['KL']);
  // a carrier the stylesheet paints: what the shelf always wrote, the accent and white
  for (const code of ['AA', 'DL', 'PD', 'F9', 'UA', 'FR', 'PB']) {
    const S = O.shelf(code);
    assert.ok(isVar(styleProp(S.badge, 'background')) && styleProp(S.badge, 'color') === '#fff', code);
  }
});
// ── the Your Aircraft orb ──────────────────────────────────────────────────
// Everything that can be in the orb: every code the name tables know, every designator the
// callsign table knows, the brand code of Air Canada Express, and two codes no table knows (one
// that asks for a symbol that was never drawn, one that asks for nothing).
const OPERATORS = [...new Set([...CODES, ...Object.keys(O.CALL), 'ACEX', 'ZZ', 'XYZ'])].sort();

// The rules the orb of any gate and any operator is held to. Empty means it obeys them.
function cardBreaks(gate, op) {
  const r = W._gateCardOrb(gate, op), f = orbFacts(r.html), G = W._gateColumnLook(gate), A = art(f.src), out = [];
  // a mark never without a disc: a clear box only under a finished tile that is on disk and fills it
  if (f.bg === 'transparent') {
    if (!(f.native && f.src && A.exists && f.fit === 'cover' && f.pad === '0')) out.push('no disc under ' + (f.src || 'the letters ' + f.letters));
  } else if (!HEX.test(full(f.bg)) && !isVar(f.bg)) out.push('a disc that is no colour: ' + f.bg);
  if (!f.src && !f.letters) out.push('an empty disc');
  // never a square in a circle: a finished square tile fills the box, with no padding round it
  const square = /\/airline-tiles\//.test(f.src) && (!/\.svg(\?|$)/.test(f.src) || (A.exists && A.clearShare < 0.5));
  if (square && !(f.fit === 'cover' && f.native && f.pad === '0')) out.push('a square tile inside a padded disc: ' + f.src);
  // never white on a ground under 3 to 1. The colour of the disc: what the box writes, or the accent of
  // the gate where it writes the accent variable (a gate the stylesheet paints is not judged here).
  const disc = HEX.test(full(f.bg)) ? f.bg : (isVar(f.bg) && !G.css) ? O.accent(G.carrier) : '';
  // (the markup of an operator is judged whether or not its file is on disk: it never asks for white
  // on a light disc. A gate carrier with no art of its own is the business of the column, and of the ledger.)
  if (disc && f.inked && (A.exists || !r.own) && contrast('#FFFFFF', disc) < 3 && !APPROVED_WHITE.includes(O.fold(r.code))) {
    out.push('a white mark on ' + disc + ' at ' + contrast('#FFFFFF', disc).toFixed(2) + ' to 1: ' + f.src);
  }
  if (disc && f.letters && contrast(f.lettersInk || '#FFFFFF', disc) < 3) out.push('the letters ' + (f.lettersInk || 'white') + ' on ' + disc + ' at ' + contrast(f.lettersInk || '#FFFFFF', disc).toFixed(2) + ' to 1');
  // and never an emblem of several colours inked white
  if (f.inked && A.exists && (!A.colours || A.colours.filter((c) => !/^#F[C-F]F[C-F]F[C-F]$/i.test(c)).length > 1)) out.push('a colour emblem inked white: ' + f.src);
  return out;
}

test('the Your Aircraft orb, every gate carrier with every operator: a mark never without a disc, never a square in a circle, never white under 3 to 1', () => {
  // THE FULL PRODUCT: every named code as the gate, with no operator and with each of the operators above.
  let pairs = 0, operated = 0;
  const wrong = [];
  for (const gate of CODES) {
    for (const op of [''].concat(OPERATORS)) {
      pairs++;
      const r = W._gateCardOrb(gate, op);
      if (!r.own) operated++;
      const b = cardBreaks(gate, op);
      if (b.length && wrong.length < 40) wrong.push(gate + ' gate, operated by ' + (op || 'itself') + ': ' + b.join('; '));
    }
  }
  assert.deepEqual(wrong, [], wrong.join('\n'));
  assert.ok(pairs >= 70000 && operated >= 60000, pairs + ' pairs, ' + operated + ' with the art of the operator');
  // the cases the review named. A tile gate under an operator with no art: the letters land on a disc
  for (const [gate, op] of [['IB', 'YW'], ['KL', 'WA'], ['AY', 'N7'], ['SK', 'WX'], ['QF', 'QQ'], ['EK', 'FZ']]) {
    const f = orbFacts(W._gateCardOrb(gate, op).html);
    assert.ok(HEX.test(full(f.bg)) || isVar(f.bg), gate + '/' + op + ': a disc, ' + f.bg);
    assert.ok(f.pad !== '0' && f.fit === 'contain' && !f.native, gate + '/' + op + ': a padded disc for a mark or its letters');
  }
  // a tile gate under an operator with an emblem: the disc of that operator, padded, the mark contained
  for (const [gate, op, disc, inked] of [['NH', 'AC', O.BRAND.AC.accent, true], ['KL', 'AF', O.BRAND.AF.accent, false], ['IB', 'BA', '#F2F4F7', false], ['B6', 'AA', '#F2F4F7', false]]) {
    const f = orbFacts(W._gateCardOrb(gate, op).html);
    assert.deepEqual([f.bg, f.fit, f.native, f.inked], [disc, 'contain', false, inked], gate + '/' + op);
    assert.equal(f.src, W._gateOrbParts(op).path, gate + '/' + op);
  }
  // a padded gate under an operator whose art is a tile: the tile fills the orb (it sat as a square in the disc)
  for (const [gate, op, tile] of [['AA', 'OO', 'SKW'], ['AC', 'OO', 'SKW'], ['WS', 'B6', 'JBU'], ['LH', 'LX', 'SWR'], ['PD', 'IB', 'IBE']]) {
    const f = orbFacts(W._gateCardOrb(gate, op).html);
    assert.deepEqual([f.src, f.bg, f.pad, f.fit, f.native, f.inked], ['/logos/airline-tiles/' + tile + '.svg', 'transparent', '0', 'cover', true, false], gate + '/' + op);
  }
  // an operator no table knows, on a gate whose column is light: its mark is not inked white there
  for (const [gate, ground] of [['TR', '#FFE900'], ['BT', '#CDDA32'], ['VY', '#FFCC00']]) {
    const f = orbFacts(W._gateCardOrb(gate, 'ZZ').html);
    assert.deepEqual([f.bg, f.inked, f.src], [ground, false, '/logos/symbols/airlines/ZZ.svg'], gate + ': the disc of the column, no white filter');
  }
  // WestJet Encore on a WestJet gate keeps its white leaf: its own column is approved white
  assert.deepEqual([orbFacts(W._gateCardOrb('WS', 'WR').html).inked, orbFacts(W._gateCardOrb('WS', 'WR').html).bg], [true, O.ACCENT.WR]);
  // letters, where no file is asked for, are inked to read on their disc: white on a dark accent,
  // dark on a light one (a code no table knows, given a light accent for the length of this check)
  assert.deepEqual([orbFacts(W._gateCardOrb('XYZ', '').html).letters, orbFacts(W._gateCardOrb('XYZ', '').html).lettersInk], ['XYZ', '']);
  O.ACCENT.XYZ = '#FFE900';
  try {
    const f = orbFacts(W._gateCardOrb('XYZ', '').html);
    assert.equal(f.letters, 'XYZ');
    assert.ok(f.lettersInk && contrast(f.lettersInk, '#FFE900') >= 4.5, 'dark letters on a light disc: ' + f.lettersInk);
    assert.deepEqual(cardBreaks('XYZ', ''), []);
  } finally { delete O.ACCENT.XYZ; }
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
  assert.equal(O.ACCENT.AD, undefined); assert.equal(column('AD').badgeBg, W._ORB_TILE_GROUNDS.AZU);
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
