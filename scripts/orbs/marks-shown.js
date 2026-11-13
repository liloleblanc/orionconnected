#!/usr/bin/env node
'use strict';

// ══════════════════════════════════════════════════════════════════════════
// WHAT THE SURFACES THAT ARE NOT ORBS SHOW FOR A CODE
//
// Five places on a gate show the mark of a carrier without being one of its
// round orbs: the sky plate that holds for an aircraft, the plate of last
// resort, the map hold, the orb of the gate change notice, and the emblem of
// the centre cards (the upgrade and standby lists, the documents card, the
// gate closing card). The gate orbs changed for every airline; these five
// were meant to keep what they drew, apart from a short list of differences
// that are wanted.
//
// This script says, in one line of words per surface, what a fids-core.js
// ends up showing for a code. It does not model the code: it cuts the lines
// that write each surface out of the file it is given, runs them, and where
// the file they ask for is not on disk it runs the missing-file handler of
// that same fids-core.js against a stand-in for the image, as a browser
// would. So the same lines of this script read origin/main and the working
// tree, and the two answers can be compared.
//
//   node scripts/orbs/marks-shown.js <fids-core.js> [code ...]
//     prints { code: [sky plate, last plate, map hold, notice, standby card] }
//
// tests/gate-orbs-every-airline.test.js holds the record this made of
// origin/main (tests/fixtures/gate-marks-origin-main.json) against what the
// tree shows now, with the table of the differences that are kept.
// ══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'fids-current');
const SURFACES = ['sky plate', 'last plate', 'map hold', 'notice', 'standby card'];

// From a marker to the brace that closes it, stepping over comments, strings and regular
// expressions. A marker a file does not have gives nothing when it is optional (origin/main has
// no table of looks and no generated tables).
function cutter(CORE) {
  function block(marker, optional) {
    const at = CORE.indexOf(marker);
    if (at < 0) { if (optional) return ''; throw new Error('the file has no: ' + marker); }
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
  // from the start of one marker to the end of the line that holds the next
  function lines(from, to) {
    const a = CORE.indexOf(from);
    if (a < 0) throw new Error('the file has no: ' + from);
    const b = CORE.indexOf(to, a + from.length);
    if (b < 0) throw new Error('and after it no: ' + to);
    return CORE.slice(a, CORE.indexOf('\n', b));
  }
  return { block, lines };
}

// A stand-in for an inline style: the declarations of a style attribute, by name, and which of
// them are marked important (an inline declaration beats a stylesheet rule that is important
// only when it is important too).
function styleOf(text) {
  const map = new Map(), important = new Set();
  const set = (k, v, priority) => { map.set(k, String(v)); if (priority === 'important') important.add(k); else important.delete(k); };
  for (const part of String(text || '').split(';')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    const v = part.slice(i + 1).trim();
    set(part.slice(0, i).trim(), v.replace(/\s*!important$/i, ''), /!important$/i.test(v) ? 'important' : '');
  }
  return {
    map,
    setProperty: set,
    removeProperty(k) { map.delete(k); important.delete(k); },
    getPropertyValue(k) { return map.get(k) || ''; },
    getPropertyPriority(k) { return important.has(k) ? 'important' : ''; }
  };
}
const rgbOf = (hex) => {
  const h = String(hex).replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return 'rgb(' + [0, 2, 4].map((i) => parseInt(f.substr(i, 2), 16)).join(', ') + ')';
};

function build(CORE, site) {
  site = site || SITE;
  const { block, lines } = cutter(CORE);
  const onDisk = (p) => !!p && fs.existsSync(path.join(site, String(p).split('?')[0]));
  const W = {};
  const doc = { createElement: () => ({ style: styleOf(''), className: '', textContent: '' }) };
  // the colour a box shows, as a browser would report it: clear, a colour, or the accent of the page
  const computed = (box) => {
    const bg = box.style.getPropertyValue('background');
    if (!bg || bg === 'transparent' || bg === 'none') return { backgroundColor: 'rgba(0, 0, 0, 0)' };
    const m = /#[0-9a-f]{3,6}\b/i.exec(/^var\(/.test(bg) ? (box.accent || bg) : bg);
    return { backgroundColor: m ? rgbOf(m[0]) : 'rgba(0, 0, 0, 0)' };
  };
  const O = new Function('window', 'document', 'getComputedStyle', [
    block('const AIRLINE_BRAND = {'), block('const AIRLINE_ACCENT = {'), block('function getAirlineAccent(code) {'),
    block('const CALLSIGN_TO_IATA = {'), block('const IATA_TO_TILE_ICAO = {'),
    block('const AIRLINE_NAME = {'), block('const _AIRLINE_NAME_OVERRIDE = {'),
    block('window._CARD_COLOR_EMBLEMS = {'), block('window._orbKeepsColour = function'),
    block('window._BADGE_TILE_BRANDS = {'), block('window._ORB_TILE_GROUNDS = {', 1), block('window._ORB_TILE_LETTERS = {', 1), block('window._GATE_ORB_LOOKS = {', 1),
    block('window._orbInkOn = function', 1), block('window._gateColumnLook = function', 1), block('window._gateOwnAccent = function', 1),
    block('window._gateOrbParts = function'),
    block('var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {'), block('var GATE_TOP_ROUND_EMBLEM_FILES = {'),
    CORE.indexOf('var _TILE_DESIGNATOR_IATA = null;') >= 0 ? 'var _TILE_DESIGNATOR_IATA = null;' : '', block('function _designatorIata(code) {', 1),
    block('function _orbEmblemCarrier(code) {'), block('function _airlineOrbEmblem(code) {'), block('function _gateOrbArt(code) {', 1),
    block('window._orbTileLettersOther = function', 1), block('function _orbMono(code) {'),
    block('function _orbRowArg(code, q) {', 1), block('function _plateEmblem(code, marks) {', 1),
    block('window._holdArtFailed = function'), block('window._orbArtFailed = function'),
    block('var _GATE_CARD_ALIAS = {'), block('var _GATE_CARD_EMBLEM = {'), block('function _gateCardEmblem(code) {'),
    'function fidsEscHtml(s) { return String(s); }',
    block('function _gateChangeOrbHtml(code) {'),
    // the three plates, each from its own table to the end of the statement that writes its markup
    'function __skyPlate(_holdCode) {', lines('var _HOLD_MARK = {', ": '<span class=\"v2-rc-aircraft-hold-code\">' + (_holdCode ||"), 'return _holdMark; }',
    'function __lastPlate(_fallbackCode) {', lines('var _fallbackSrc = ', ": '<span class=\"v2-rc-aircraft-hold-code\">' + (_fallbackCode ||"), 'return _fallbackMark; }',
    'function __mapHold(_mapLifeCode) {', lines('var _MAPLIFE_EMBLEM = {', ": '<span class=\"v2-rc-map-life-code\">' + (_mapLifeCode ||"), 'return _mapLifeHtml; }',
    'return { NAME: AIRLINE_NAME, NAME2: _AIRLINE_NAME_OVERRIDE, CALL: CALLSIGN_TO_IATA, TILE: IATA_TO_TILE_ICAO, BRAND: AIRLINE_BRAND, ACCENT: AIRLINE_ACCENT,',
    '  FILES: AIRLINE_EMBLEM_FILES, TOP: GATE_TOP_ROUND_EMBLEM_FILES, accent: getAirlineAccent, fold: _orbEmblemCarrier,',
    '  skyPlate: __skyPlate, lastPlate: __lastPlate, mapHold: __mapHold, notice: _gateChangeOrbHtml, standby: _gateCardEmblem };'
  ].join('\n'))(W, doc, computed);

  const short = (p) => String(p).replace(/^\/logos\//, '');
  const attr = (tag, name) => (new RegExp('\\b' + name + '="([^"]*)"').exec(tag) || [])[1] || '';
  // the handler an image names in its onerror, and the codes it is written with
  const handler = (tag) => {
    const m = /window\._(orb|hold)ArtFailed\(this,(?:&quot;|')([^&']*)(?:&quot;|')(?:,(?:&quot;|')([^&']*)(?:&quot;|'))?\)/.exec(tag);
    return m ? { fn: W['_' + m[1] + 'ArtFailed'], code: m[2], row: m[3] } : null;
  };
  // An image whose file is not on disk fails as it would in a browser: its handler runs, and
  // runs again if the file it then names is missing too. True where a handler ran at all.
  function settle(img, h) {
    let missed = false;
    for (let n = 0; n < 3 && !img.removed && img.style.getPropertyValue('display') !== 'none' && !onDisk(img.src); n++) {
      missed = true;
      if (!h) { img.removed = true; break; }
      if (h.row === undefined) h.fn(img, h.code); else h.fn(img, h.code, h.row);
    }
    return missed;
  }

  // a plate: an image with the letters of the code beside it, hidden until the image fails
  function plate(html) {
    const tag = (/<img\b[^>]*>/.exec(html) || [])[0] || '';
    const chip = (/<span class="[^"]*"(?: style="[^"]*")?>([^<]*)<\/span>/.exec(html) || [])[1] || '';
    if (!tag) return 'letters ' + chip;
    const sib = { textContent: chip, style: styleOf('display:none') };
    const img = { src: attr(tag, 'src'), dataset: {}, style: styleOf(''), nextElementSibling: sib };
    // the plate hides the image and shows the letters by assigning to style.display
    for (const o of [img, sib]) Object.defineProperty(o.style, 'display', { set(v) { o.style.setProperty('display', v); }, get() { return o.style.getPropertyValue('display'); } });
    const missed = settle(img, handler(tag));
    if (img.style.getPropertyValue('display') === 'none') return 'letters ' + chip + (missed ? ', after a miss' : '');
    return short(img.src) + (missed ? ', after a miss' : '');
  }
  // A round orb, as it ends up on the screen: a box with an image or letters in it. The image
  // fails where its file is not on disk, and what its handler leaves is what is read: the file
  // or the letters, the ink the letters were given, the disc under them. accent is the colour
  // the accent variable holds on the page that shows the orb.
  function orb(html, accent) {
    const boxTag = /<(?:span|div) class="(v2-fi-icon-wrap[^"]*)" style="([^"]*)">/.exec(html);
    const box = {
      style: styleOf(boxTag[2]), span: null, accent: String(accent || ''),
      classList: { remove() {} },
      querySelector() { return box.span; },
      appendChild(n) { box.span = n; }
    };
    const out = { src: '', letters: '', ink: '', inkImportant: false, missed: false, white: false, fills: false };
    const disc = () => {
      const bg = box.style.getPropertyValue('background');
      return /^var\(/.test(bg) ? 'the accent disc' : (!bg || bg === 'transparent') ? 'no disc' : 'a ' + bg + ' disc';
    };
    const direct = /<span class="v2-fi-orb-code"(?: style="([^"]*)")?>([^<]*)<\/span>/.exec(html);
    if (direct) {
      const st = styleOf(direct[1]);
      out.letters = direct[2]; out.ink = st.getPropertyValue('color'); out.inkImportant = st.getPropertyPriority('color') === 'important';
    } else {
      const tag = (/<img\b[^>]*>/.exec(html) || [])[0] || '';
      const img = { src: attr(tag, 'src'), dataset: {}, style: styleOf(attr(tag, 'style')), parentNode: box, remove() { img.removed = true; } };
      out.missed = settle(img, handler(tag));
      if (img.removed) {
        if (box.span) {
          out.letters = box.span.textContent; out.ink = box.span.style.getPropertyValue('color');
          out.inkImportant = box.span.style.getPropertyPriority('color') === 'important';
        }
      } else {
        out.src = img.src;
        out.white = /invert\(1\)/.test(img.style.getPropertyValue('filter'));
        out.fills = box.style.getPropertyValue('padding') === '0' && img.style.getPropertyValue('object-fit') === 'cover';
      }
    }
    out.disc = disc();
    const what = out.src ? short(out.src) + (out.white ? ', white' : '') + (out.fills ? ' filling the orb' : ' on ' + out.disc)
      : out.letters ? 'letters ' + out.letters + ' on ' + out.disc : 'an empty disc';
    out.text = what + (out.missed ? ', after a miss' : '');
    return out;
  }
  // the orb of the gate change notice
  function notice(html, code) {
    return html ? orb(html, O.accent(code)).text : 'nothing';
  }
  // the emblem of the centre cards: an image that removes itself when its file is missing, or letters
  function standby(html) {
    if (!html) return 'nothing';
    const letters = /<span class="gc-emb-code" style="[^"]*background:([^;]+);[^"]*">([^<]*)<\/span>/.exec(html);
    if (letters) return 'letters ' + letters[2] + ' on a ' + letters[1] + ' disc';
    const tag = (/<img\b[^>]*>/.exec(html) || [])[0] || '';
    if (!onDisk(attr(tag, 'src'))) return 'nothing';
    return short(attr(tag, 'src')) + (/\bgc-emb-white\b/.test(attr(tag, 'class')) ? ', white' : '');
  }

  const up = (code) => String(code == null ? '' : code).trim().toUpperCase();
  function shown(code) {
    const c = up(code);
    return [
      plate(O.skyPlate(c)),
      plate(O.lastPlate(c)),
      plate(O.mapHold(c.replace(/[^A-Z0-9]/g, ''))),
      notice(O.notice(c), c),
      standby(O.standby(c))
    ];
  }
  // every code a table of this file names: the name tables, the callsign and tile tables (and the
  // designators the tile table files its tiles under), the colour tables, the emblem tables, the looks
  function codes() {
    const set = new Set();
    for (const t of [O.NAME, O.NAME2, O.CALL, O.TILE, O.BRAND, O.ACCENT, O.FILES, O.TOP, W._GATE_ORB_LOOKS || {}]) for (const k of Object.keys(t)) set.add(k);
    for (const v of Object.values(O.TILE)) if (/^[A-Z]{3}$/.test(v)) set.add(v);
    return [...set].filter(Boolean).sort();
  }
  return { O, W, shown, codes, onDisk, orb };
}

module.exports = { build, SURFACES, SITE };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/orbs/marks-shown.js <fids-core.js> [code ...]'); process.exit(2); }
  const B = build(fs.readFileSync(file, 'utf8'));
  const list = process.argv.length > 3 ? process.argv.slice(3) : B.codes();
  const out = {};
  for (const c of list) out[c] = B.shown(c);
  process.stdout.write('{\n' + Object.keys(out).map((c) => '  ' + JSON.stringify(c) + ': ' + JSON.stringify(out[c])).join(',\n') + '\n}\n');
}
