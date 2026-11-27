'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// THE SHAPE OF EVERY LOGO FILE A RESERVED BOX DRAWS, READ FROM THE FILE (v24188).
//
// A logo <img> with no size of its own takes no width until its picture has
// loaded, and then takes the picture's width: whatever sits after it on the
// line moves along when the art lands. That is the "logos move left to right"
// seen as a board first comes up. Two surfaces draw their art that way: the hall
// line of the bags board (its emblem, and the lettering, both cuts) and the
// wordmark slot of the gate band (img.g8-r1-logo, and the member lockup in its
// place). The board carries the width-to-height ratio of every file those can
// draw (LOGO_ASPECT in fids-current/js/fids-core.js) and gives the box that
// shape before the picture arrives.
//
// Which files: asked of the board itself, run in a page of its own (drawn
// below): the lettering of every carrier with lettering (wordmarkSrc, both
// cuts); the emblem of the hall line, the picture the board draws in it for
// every code its logo tables know (_beltLogo: the row tile built from
// IATA_TO_TILE_ICAO, the emblem of IATA_TO_EMBLEM, the square mark of the strip,
// _BW_EMBLEM, where the row has a lockup of LOCAL_LOGOS); and what the band can
// put in its wordmark slot (the address of each carrier, carrierLogoUrl; the
// tables of the band builder; the heritage marks; the member lockups, both
// twins). Only files of ours on disk that the board names or builds: a file
// named nowhere else is never named here, so no file a test keeps out of the
// board script comes in through this table.
//
// The ratio is the one a browser takes as the picture's own:
//   svg   the width and height of the root <svg> where both are absolute
//         lengths (a number, px, pt, pc, mm, cm, in, Q), else its viewBox
//         (a percentage or a missing size leaves the viewBox to decide);
//   png   the size in its header (IHDR);
//   webp  the canvas of VP8X, else the frame of VP8 or VP8L.
// A file whose shape cannot be read this way gets no entry: its box is then
// sized as before, when it loads.
//
// node scripts/logo-aspect/build.js rewrites the table; the test
// tests/logo-boxes-reserved.test.js fails when the table and the files differ.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');

const vm = require('node:vm');

const EXT = /\.(svg|png|webp)$/i;
const START = '// logo-aspect-table:start';
const END = '// logo-aspect-table:end';

// CSS absolute lengths in px
const UNIT = { '': 1, px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, q: 96 / 101.6 };

function len(v) {
  if (v == null) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(String(v));
  if (!m) return null;
  const u = m[2].toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(UNIT, u)) return null;   // %, em, ex, vw: not the picture's own size
  const n = parseFloat(m[1]) * UNIT[u];
  return n > 0 && isFinite(n) ? n : null;
}

function attr(tag, name) {
  const m = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
  return m ? (m[1] != null ? m[1] : m[2]) : null;
}

function svgRatio(text) {
  const t = String(text).replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
  const m = /<svg\b[^>]*>/i.exec(t);
  if (!m) return null;
  const tag = m[0];
  // a width or height in the style attribute outranks the attribute of the same name
  const style = attr(tag, 'style') || '';
  const fromStyle = (p) => { const s = new RegExp('(?:^|;)\\s*' + p + '\\s*:\\s*([^;]+)', 'i').exec(style); return s ? s[1].trim() : null; };
  const wRaw = fromStyle('width') != null ? fromStyle('width') : attr(tag, 'width');
  const hRaw = fromStyle('height') != null ? fromStyle('height') : attr(tag, 'height');
  const w = len(wRaw), h = len(hRaw);
  if (w && h) return w / h;
  const vb = attr(tag, 'viewBox');
  if (vb) {
    const n = vb.trim().split(/[\s,]+/).map(Number);
    if (n.length === 4 && n[2] > 0 && n[3] > 0 && isFinite(n[2] / n[3])) return n[2] / n[3];
  }
  return null;
}

function pngRatio(buf) {
  if (buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG' || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? w / h : null;
}

function webpRatio(buf) {
  if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('latin1', 12, 16);
  let w = 0, h = 0;
  if (kind === 'VP8X') {
    w = 1 + buf.readUIntLE(24, 3); h = 1 + buf.readUIntLE(27, 3);
  } else if (kind === 'VP8 ') {
    w = buf.readUInt16LE(26) & 0x3fff; h = buf.readUInt16LE(28) & 0x3fff;
  } else if (kind === 'VP8L') {
    if (buf[20] !== 0x2f) return null;
    const b = buf.readUInt32LE(21);
    w = 1 + (b & 0x3fff); h = 1 + ((b >> 14) & 0x3fff);
  }
  return w > 0 && h > 0 ? w / h : null;
}

function ratioOf(file) {
  const buf = fs.readFileSync(file);
  if (/\.svg$/i.test(file)) return svgRatio(buf.toString('utf8'));
  if (/\.png$/i.test(file)) return pngRatio(buf);
  if (/\.webp$/i.test(file)) return webpRatio(buf);
  return null;
}

// four decimals: a box 600 px wide is then within 0.03 px of the picture
function round(r) { return Number(r.toFixed(4)); }

// ── the board, run in a page of its own (as tests/airline-logos-every-surface.test.js) ──
function loadBoard(siteRoot) {
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
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
    location: { search: '?ap=YQM', hostname: 'localhost', href: 'http://localhost/bids.html?ap=YQM', pathname: '/bids.html', origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['host-airport.js', 'board-strings.js', 'feed-router.js', 'fids-core.js', 'airport-coords.js']) {
    vm.runInContext(fs.readFileSync(path.join(siteRoot, 'js', f), 'utf8'), ctx, { filename: f });
  }
  vm.runInContext('var __the = function (n) { return eval(n); };', ctx);
  return ctx;
}

const bare = (u) => String(u || '').split('#')[0].split('?')[0];
const plain = (o) => JSON.parse(JSON.stringify(o));

// the codes the logo tables of the board know: every code a row can draw a picture for
const HALL_TABLES = ['AIRLINE_NAME', 'IATA_TO_WORDMARK', 'IATA_TO_TILE_ICAO', 'IATA_TO_EMBLEM', 'LOCAL_LOGOS', '_BW_EMBLEM', '_AIRLINE_EMBLEM_FILES'];
function hallCodes(board) {
  const codes = new Set();
  for (const t of HALL_TABLES) for (const c of Object.keys(plain(board.__the(t) || {}))) codes.add(c);
  return [...codes].sort();
}
// the picture the emblem of a hall line draws for a code (_beltLogo), or '' for a
// monogram or an empty slot, as the img of the line names it
function hallEmblemSrc(board, code) {
  const m = /^<img\b[^>]*?\ssrc="([^"]*)"/.exec(String(board.__the('_beltLogo')(code, '')));
  return m ? bare(m[1].replace(/&amp;/g, '&')) : '';
}

// every file of ours the hall emblem and lettering and the gate wordmark slot can draw, in path order
function drawn(siteRoot, board) {
  const B = board || loadBoard(siteRoot);
  const the = (n) => B.__the(n);
  const core = fs.readFileSync(path.join(siteRoot, 'js', 'fids-core.js'), 'utf8');
  const want = new Set();
  // the lettering of every carrier with lettering, both cuts (the hall line and the band)
  const wordmarkSrc = the('wordmarkSrc');
  for (const base of new Set(Object.values(plain(the('IATA_TO_WORDMARK'))))) for (const v of ['light', 'dark']) want.add(bare(wordmarkSrc(base, v)));
  // the emblem of the hall line, for every code the logo tables know
  for (const code of hallCodes(B)) { const u = hallEmblemSrc(B, code); if (u) want.add(u); }
  // the address of each carrier the band starts from (carrierLogoUrl)
  for (const u of Object.values(plain(the('LOCAL_LOGOS')))) want.add(bare(u));
  // the tables of the band builder, up to where the emblem beside the wordmark is chosen
  const a = core.indexOf('  var BANNER_DARK_LOGO = {'), b = core.indexOf("  var _bannerEmblemSrc = '';", a);
  if (a < 0 || b < a) throw new Error('the gate band builder has moved: find its logo tables again');
  for (const m of core.slice(a, b).matchAll(/'(\/logos\/[^'?#]+)/g)) want.add(m[1]);
  // a heritage page, its period mark; a Star Alliance member, its lockup and the white twin
  for (const c of Object.values(plain(the('HERITAGE_CARRIERS')))) if (c && c.mark) want.add(bare(c.mark));
  const star = the('starLockupSrc');
  for (const code of Object.keys(plain(the('STAR_ALLIANCE_LOCKUP')))) for (const dark of [false, true]) want.add(bare(star(code, dark)));
  return [...want]
    .filter((u) => /^\/logos\//.test(u) && EXT.test(u) && fs.existsSync(path.join(siteRoot, u)))
    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

// the shape of each of those files: { '/logos/...': ratio }, in the order given
function collect(siteRoot, files) {
  const out = {};
  for (const k of files) {
    const r = ratioOf(path.join(siteRoot, k));
    if (r) out[k] = round(r);
  }
  return out;
}

// the table the board carries
function build(siteRoot, board) { return collect(siteRoot, drawn(siteRoot, board)); }

function render(table) {
  const lines = Object.keys(table).map((k) => {
    if (/['\\\n]/.test(k)) throw new Error('a logo path the table cannot hold: ' + k);
    return "  '" + k + "': " + String(table[k]) + ',';
  });
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
  return START + ' (written by scripts/logo-aspect/build.js from the files, never by hand)\n'
    + 'const LOGO_ASPECT = {\n' + lines.join('\n') + '\n};\n' + END;
}

// the table as it stands in a source text, parsed back: { '/logos/...': ratio }
function embedded(src) {
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < a) return null;
  const block = src.slice(a, b);
  const out = {};
  for (const m of block.matchAll(/^\s*'([^']+)':\s*([0-9.eE+-]+),?$/gm)) out[m[1]] = Number(m[2]);
  return out;
}

module.exports = { START, END, svgRatio, pngRatio, webpRatio, ratioOf, round, loadBoard, HALL_TABLES, hallCodes, hallEmblemSrc, drawn, collect, build, render, embedded };
