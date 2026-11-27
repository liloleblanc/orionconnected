'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE SCAN CODE KEEPS ITS PLACE.
//
// The Accor ad's speech bubble (hotel-ads.css .axr-bubble, built by
// buildAccorAdOnlyV6 in fids-core.js): the caption has no blank line on a
// two-language board, and the code is a square the height of the shape's
// inside, worked out from the bubble's width, never from the caption's row.
// Sized by its row, the code ran into the edge of the cream on a board 800 px
// wide or less, where fids.css sets the padding of the carousel's divs.
//
// The "Hotels in {CITY}" photo card (hotel-list-card.css .hlc-find--pic): the
// subject of a city's photograph stands in its middle, so the code stands in
// the bottom corner at the inline end and the photographer in the other one.
// Centred, the 420 px code covered every letter of the Las Vegas Welcome sign
// and the YESCO mark under NEVADA, the mark that photograph must keep in view.
// Its cap is measured on that picture at the real sizes of the card.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORE = read('fids-current/js/fids-core.js');
const ADS = read('fids-current/css/hotel-ads.css');
const HLC = read('fids-current/css/hotel-list-card.css');
const FIDS = read('fids-current/css/fids.css');
const HLCJS = read('fids-current/js/hotel-list-card.js');

// the first rule written for exactly this selector, at the start of a line
function rule(css, sel) {
  const i = css.indexOf('\n' + sel + '{');
  assert.ok(i >= 0, sel + ' has a rule');
  return css.slice(i + 1, css.indexOf('}', i) + 1);
}
// clamp(Apx, Bvw, Cpx) at a viewport width
function clampAt(s, vw) {
  const m = s.match(/^clamp\(([\d.]+)px,\s*([\d.]+)vw,\s*([\d.]+)px\)$/);
  assert.ok(m, 'a px/vw/px clamp: ' + s);
  return Math.max(+m[1], Math.min(+m[2] * vw / 100, +m[3]));
}
// a calc() of the stylesheet, worked out with the lengths given for its terms
function calcAt(expr, terms) {
  let s = expr.replace(/^calc\(/, '(');
  for (const [k, v] of Object.entries(terms)) s = s.split(k).join('(' + v + ')');
  assert.match(s, /^[\d.\s()+\-*/]+$/, 'only numbers left in ' + expr + ' -> ' + s);
  return Function('return ' + s)();
}
// width and height of a JPEG, from its frame header
function jpegSize(b) {
  assert.ok(b[0] === 0xff && b[1] === 0xd8, 'a JPEG');
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
// the clearance between two boxes [x0, y0, x1, y1]: the straight distance between them, negative
// (by the smaller depth) when they overlap
function clearance(a, b) {
  const dx = Math.max(b[0] - a[2], a[0] - b[2], 0), dy = Math.max(b[1] - a[3], a[1] - b[3], 0);
  if (dx === 0 && dy === 0) return -Math.min(Math.min(a[2], b[2]) - Math.max(a[0], b[0]), Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return Math.hypot(dx, dy);
}

// ── the Accor bubble ──────────────────────────────────────────────────────

test('the bubble caption has no blank line: a break in it is never drawn', () => {
  const line = CORE.match(/var _qrCaption = [^\n]*/);
  assert.ok(line, '_qrCaption is built in fids-core.js');
  // after the second language, a block line of its own, a <br> stood alone and printed an empty
  // line: four lines on every two-language board in a bubble drawn for three. The line still writes
  // it (the language ledger names its exception by the text of the line), straight into the copy,
  // where the stylesheet hides it
  assert.match(line[0], /^var _qrCaption = _scanHtml \+ '(<br>)?<span class="axr-bub-name" translate="no">' \+ esc\(_fullName\) \+ '<\/span>';$/);
  assert.match(CORE, /'<div class="axr-bubble"><div class="axr-bubble-copy">'\+_qrCaption\+'<\/div>/);
  assert.match(rule(ADS, '.axr-bubble-copy > br'), /^\.axr-bubble-copy > br\{ display:none; \}$/);
  // and it is the only break: the first language is one inline span, the second a block line
  const scan = CORE.match(/var _scanHtml = [^\n]*\n[^\n]*/);
  assert.ok(scan);
  assert.doesNotMatch(scan[0], /<br/i);
  // the second language and the name are block lines, so each still starts a line of its own, on a
  // one-language card too
  assert.match(CORE, /'<span class="axr-bi-line"' \+ _biAttr\(_L2\)/);
  assert.match(rule(ADS, '.axr-bi-line'), /^\.axr-bi-line\{ display:block; \}$/);
  assert.match(rule(ADS, '.axr .axr-bub-name'), /^\.axr \.axr-bub-name\{ display:block;/);
  // no other line break anywhere in the bubble
  const bubble = CORE.match(/var bubbleHtml=[^\n]*/);
  assert.ok(bubble);
  assert.doesNotMatch(bubble[0], /<br/i);
});

test('the bubble: the code is the shape inner height, from the bubble width, at every board width', () => {
  const b = rule(ADS, '.axr-bubble');
  const ins = (n) => { const m = b.match(new RegExp('--bub-' + n + ':(clamp\\([^;]+\\));')); assert.ok(m, '--bub-' + n + ' is named on the bubble'); return m[1]; };
  const PT = ins('pt'), PR = ins('pr'), PL = ins('pl');
  // the insets the bubble is drawn with are the ones the code is sized from
  assert.match(b, /\n {2}padding:var\(--bub-pt\) var\(--bub-pr\) var\(--bub-pt\) var\(--bub-pl\);/);
  assert.match(b, /aspect-ratio:329\.655 \/ 74\.46;/);
  const cols = b.match(/grid-template-columns:minmax\(0,1fr\) (calc\([^;]+\));/);
  assert.ok(cols, 'the code column has a size of its own, never auto (the row)');
  const q = rule(ADS, '.axr-qr');
  assert.match(q, /aspect-ratio:1;/);
  assert.match(q, /width:100%;/);
  assert.doesNotMatch(q, /height:100%|max-height/, 'sized by its row, the code took the height of the row');
  const gapM = b.match(/gap:(clamp\([^;]+\));/);
  const copy = rule(ADS, '.axr-bubble-copy');
  const fsM = copy.match(/font-size:(clamp\([^;]+\));/), lhM = copy.match(/line-height:([\d.]+);/);
  assert.ok(gapM && fsM && lhM);
  // the narrow board: an old rule of fids.css sets the padding of every div of the ad carousel. It
  // is read inside its own 800 px block, and it must be read: a pattern that stopped matching would
  // otherwise skip the narrow check below without a word
  const at800 = FIDS.indexOf('@media (max-width: 800px) {');
  assert.ok(at800 >= 0, 'the 800 px block of fids.css');
  let depth = 0, end800 = -1;
  for (let j = FIDS.indexOf('{', at800); j < FIDS.length; j++) {
    if (FIDS[j] === '{') depth++;
    else if (FIDS[j] === '}' && --depth === 0) { end800 = j; break; }
  }
  const block800 = FIDS.slice(at800, end800 + 1);
  const narrow = block800.match(/#gateAdCarousel div\s*\{[^}]*padding:\s*(\d+)(?:px)?\s+(\d+)px\s*!important/);
  assert.ok(narrow || !/#gateAdCarousel div\s*\{[^}]*padding/.test(block800), 'the carousel padding rule of the 800 px block is there but was not read');
  // the artwork (all-bubble.svg, drawn at the box with preserveAspectRatio none): the cream spans
  // x 4.43 to 326.59 of 329.655 and the whole height of the element
  const creamRight = 326.59 / 329.655;
  // bubble widths measured on the gate (min(506px, 70%) of the ad): 1920x1080, 1680x1050,
  // 1280x720, 960x600, 800x600
  for (const [vw, B] of [[1920, 506], [1680, 506], [1280, 451.5], [960, 335.2], [800, 256.2]]) {
    const T = clampAt(PT, vw), R = clampAt(PR, vw), L = clampAt(PL, vw), G = clampAt(gapM[1], vw);
    const H = B * 74.46 / 329.655;
    const at = (ptB, prB, plB) => {
      const side = calcAt(cols[1], { '100%': B - plB - prB, 'var(--bub-pl)': L, 'var(--bub-pr)': R, 'var(--bub-pt)': T });
      // the code is centred in its row, and the row is the content box: the caption hides its
      // overflow, so it has no least height of its own and a taller one overflows the row rather
      // than growing it (measured on the gate at 1680x1050 and at 800x600): inset (H - side) / 2
      return { side, top: (H - side) / 2, right: B * creamRight - (B - prB), caption: B - plB - prB - G - side };
    };
    const n = at(T, R, L);
    // the square is the inside of the shape, top and bottom inset by the same figure
    assert.ok(Math.abs(n.side + 2 * T - H) < 0.01, vw + ': the code is the shape inner height (' + n.side.toFixed(2) + ' + 2 x ' + T + ' vs ' + H.toFixed(2) + ')');
    assert.ok(n.top >= 10 - 0.01 && n.right >= 10, vw + ': inside the cream by ' + n.top.toFixed(1) + ' top and bottom, ' + n.right.toFixed(1) + ' at the right');
    // the caption keeps the larger part of the bubble
    assert.ok(n.caption >= B / 2, vw + ': the caption column is ' + n.caption.toFixed(1) + ' of ' + B);
    // three lines of the caption at its own size (two languages and the name) stand within the
    // height of the code, so the row is the code and the bubble keeps its shape
    if (vw > 800) {
      const f = clampAt(fsM[1], vw);
      assert.ok(3 * f * +lhM[1] <= n.side, vw + ': three lines of ' + f.toFixed(2) + ' px fit the code (' + n.side.toFixed(1) + ')');
    }
    if (narrow && vw <= 800) {
      // padding 0 16px on the bubble: the column still reads the named insets, so the code is a
      // little smaller than the box and stays inside the cream on every side
      const p = +narrow[2], v = +narrow[1];
      const w = at(v, p, p);
      assert.ok(w.top >= 5 && w.right >= 5, vw + ', narrow: inside the cream by ' + w.top.toFixed(1) + ' top and bottom, ' + w.right.toFixed(1) + ' at the right');
    }
  }
});

// ── the photo card ────────────────────────────────────────────────────────

// the Welcome sign in LAS.jpg (1280x720), measured by its pixels: each line of the lettering, the
// WELCOME discs around its letters, and the sign maker's mark under NEVADA
const SIGN = {
  'WELCOME discs': [458, 320, 829, 378],
  'WELCOME letters': [468, 333, 813, 365],
  'TO Fabulous': [507, 382, 772, 414],
  'LAS VEGAS': [471, 419, 814, 470],
  NEVADA: [574, 484, 706, 501],
  YESCO: [626, 516, 664, 526]
};
// the outline of the sign, its gold border and bulbs, along the lower right edge from the right tip
// down to the foot of the post, in LAS.jpg pixels: the corner the code stands in faces this edge
const EDGE = [[882, 428], [868, 452], [845, 468], [825, 480], [792, 490], [773, 500], [751, 510], [711, 528], [689, 536], [660, 546], [645, 551]];
// the four sizes of the card in the centre deck of the gate, measured: without and with the strip
// of later departures, on a 1680x1050 board and on a 1920x1080 one
const CARDS = [[1680, 1050, 842.4, 848.7], [1680, 1050, 842.4, 697.5], [1920, 1080, 970.4, 873.2], [1920, 1080, 970.4, 717.6]];

function photoCard() {
  const scan = rule(HLC, '.hlc-find--pic .hlc-find-scan');
  const qr = rule(HLC, '.hlc-find--pic .hlc-find-scan .hlc-qr');
  const cap = qr.match(/width:min\(calc\((\d+) \* var\(--hlc-px\)\), 100cqw, 100cqh\); height:min\(calc\(\1 \* var\(--hlc-px\)\), 100cqw, 100cqh\);/);
  const shadow = qr.match(/box-shadow:0 calc\((\d+) \* var\(--hlc-px\)\) calc\((\d+) \* var\(--hlc-px\)\) rgba/);
  const pad = qr.match(/padding:calc\((\d+) \* var\(--hlc-px\)\);/);
  const n = (sel, re) => { const m = rule(HLC, sel).match(re); assert.ok(m, sel + ' ' + re); return +m[1]; };
  const px = HLC.match(/--hlc-px:min\(([\d.]+)vh, ([\d.]+)vw\);/);
  return {
    scan, qr, cap: cap && +cap[1], shadow: shadow && { dy: +shadow[1], blur: +shadow[2] }, pad: pad && +pad[1],
    unit: (vw, vh) => Math.min(+px[1] * vh, +px[2] * vw) / 100,
    padX: +HLC.match(/--hlc-pad:calc\((\d+) \* var\(--hlc-px\)\)/)[1],
    padY: n('.hlc-find-scan', /padding:calc\((\d+) \* var\(--hlc-px\)\) var\(--hlc-pad\);/),
    // the head: its padding, two lines of the heading (a two-language board), the gold rule
    head: n('.hlc-find-head', /padding:calc\((\d+) \* var\(--hlc-px\)\)/)
      + 2 * n('.hlc-find-title', /font-size:calc\((\d+) \* var\(--hlc-px\)\)/) * n('.hlc-find-title', /line-height:([\d.]+);/)
      + n('.hlc-find-title::after', /margin:calc\((\d+) \* var\(--hlc-px\)\)/) + n('.hlc-find-title::after', /height:calc\((\d+) \* var\(--hlc-px\)\)/),
    // the foot at its least height: two lines of the invitation (2 x 26 x 1.25 + 2 x 16) are less
    foot: n('.hlc .hlc-find-foot', /min-height:calc\((\d+) \* var\(--hlc-px\)\)/)
  };
}
// the tile and its painted shadow (offset, then grown by the blur on every side) on a card W x H at
// a cap of C, in px from the card top left
function tileOn(P, C, vw, vh, W, H) {
  const u = P.unit(vw, vh);
  const x1 = W - P.padX * u, y1 = H - (P.foot + P.padY) * u;
  const side = Math.min(C * u, W - 2 * P.padX * u, y1 - (P.head + P.padY) * u);
  const t = [x1 - side, y1 - side, x1, y1];
  const s = [t[0] - P.shadow.blur * u, t[1] + (P.shadow.dy - P.shadow.blur) * u, t[2] + P.shadow.blur * u, t[3] + (P.shadow.dy + P.shadow.blur) * u];
  return { u, side, tile: t, shadow: s };
}
// the sign on that card: background-size cover, background-position centre
function signOn(img, W, H) {
  const k = Math.max(W / img.w, H / img.h), ox = (img.w * k - W) / 2, oy = (img.h * k - H) / 2;
  const out = {};
  for (const [name, b] of Object.entries(SIGN)) out[name] = [b[0] * k - ox, b[1] * k - oy, b[2] * k - ox, b[3] * k - oy];
  return out;
}
const GAP = 16;
function worstClearance(P, C, img) {
  let worst = Infinity;
  const at = [];
  for (const [vw, vh, W, H] of CARDS) {
    const t = tileOn(P, C, vw, vh, W, H), s = signOn(img, W, H);
    for (const [name, b] of Object.entries(s)) {
      const d = clearance(t.shadow, b);
      at.push(vw + 'x' + vh + ' card ' + W + 'x' + H + ', ' + name + ': ' + d.toFixed(1));
      worst = Math.min(worst, d);
    }
  }
  return { worst, at };
}

test('a photo card: the code in the bottom corner at the inline end, the photographer in the other', () => {
  const P = photoCard();
  assert.match(P.scan, /^\.hlc-find--pic \.hlc-find-scan\{ position:relative; justify-content:flex-end; align-items:flex-end; \}$/);
  assert.ok(P.cap, 'a square code with a cap of its own on a photo card');
  assert.ok(P.shadow && P.pad, 'its shadow and its quiet zone');
  const credit = rule(HLC, '.hlc-find-credit');
  assert.match(credit, /inset-inline-start:calc\(14 \* var\(--hlc-px\)\);/);
  assert.match(credit, /text-align:start;/);
  assert.doesNotMatch(credit, /inset-inline-end|text-align:end/);
  // a card without a photograph keeps its one large code, centred, 420 px at most at 1680x1050
  assert.match(rule(HLC, '.hlc-find-scan'), /display:flex; align-items:center; justify-content:center;/);
  assert.match(rule(HLC, '.hlc-find-scan .hlc-qr'), /width:min\(calc\(420 \* var\(--hlc-px\)\), 100cqw, 100cqh\); height:min\(calc\(420 \* var\(--hlc-px\)\), 100cqw, 100cqh\);/);
  // the header of the stylesheet says the same
  const head = HLC.slice(0, HLC.indexOf('*/'));
  assert.match(head.replace(/\s+/g, ' '), new RegExp('in the bottom corner at the inline end, ' + P.cap + ' px at most at 1680x1050'));
});

test('a photo card: the code and its shadow stay 16 px clear of the Las Vegas Welcome sign, as large as that allows', () => {
  const P = photoCard();
  assert.ok(P.cap && P.shadow);
  // background-size cover and centred, as the clearance below assumes
  assert.match(rule(HLC, '.hlc-find-pic'), /background-position:center; background-size:cover;/);
  // the boxes were measured on this file; a new Las Vegas picture needs the sign measured again
  const img = jpegSize(fs.readFileSync(path.join(ROOT, 'fids-current/logos/cities/LAS.jpg')));
  assert.deepEqual(img, { w: 1280, h: 720 });
  const at = worstClearance(P, P.cap, img);
  assert.ok(at.worst >= GAP, 'at ' + P.cap + ': ' + at.at.filter((s) => +s.split(': ')[1] < GAP).join('; '));
  // and no smaller than it must be: one design pixel more and the shadow comes within 16 px of the
  // lettering on one of the cards (the S of VEGAS on the 842x849 one)
  assert.ok(worstClearance(P, P.cap + 1, img).worst < GAP, 'the cap is the largest that keeps the sign clear');
  // the tile stays clear of the outline of the sign as well (its right tip, 26 px on the 842x698
  // card). A smaller shadow lets the lettering rule above allow a larger tile (157 px for a shadow
  // of 0 4 13), and that tile covers the tip, so the outline is held here on its own
  for (const [vw, vh, W, H] of CARDS) {
    const t = tileOn(P, P.cap, vw, vh, W, H);
    const k = Math.max(W / img.w, H / img.h), ox = (img.w * k - W) / 2, oy = (img.h * k - H) / 2;
    const pts = EDGE.map(([x, y]) => [x * k - ox, y * k - oy]);
    let d = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      for (let s = 0; s <= 100; s++) {
        const p = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * s / 100, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * s / 100];
        d = Math.min(d, clearance(t.tile, [p[0], p[1], p[0], p[1]]));
      }
    }
    assert.ok(d >= GAP, vw + 'x' + vh + ' card ' + W + 'x' + H + ': the tile is ' + d.toFixed(1) + ' px from the outline of the sign');
  }
});

test('a photo card: the code is still a code (modules of 3 px and more, a quiet zone of four)', () => {
  const P = photoCard();
  assert.ok(P.cap && P.pad);
  // the longest link a card encodes: the app, the airport of the screen, the city, where it is
  const host = HLCJS.match(/var APP_HOST = '([^']+)';/);
  assert.ok(host);
  const bytes = Buffer.byteLength(host[1] + '?ap=YQM&hotels=LAS&in=US-NV');
  // byte mode at correction level M (the level hotel-list-card.js draws with)
  assert.match(HLCJS, /correctLevel: root\.QRCode\.CorrectLevel\.M/);
  const CAP_M = [14, 26, 42, 62, 84, 106, 122, 152];
  const version = CAP_M.findIndex((c) => bytes <= c) + 1;
  assert.ok(version > 0);
  const modules = 17 + 4 * version;
  for (const [vw, vh] of [[1680, 1050], [1920, 1080]]) {
    const u = P.unit(vw, vh);
    const module = (P.cap - 2 * P.pad) * u / modules;
    assert.ok(module >= 3, vw + 'x' + vh + ': ' + module.toFixed(2) + ' px a module (' + modules + ' modules)');
    assert.ok(P.pad * u / module >= 4, vw + 'x' + vh + ': a quiet zone of ' + (P.pad * u / module).toFixed(1) + ' modules');
  }
});
