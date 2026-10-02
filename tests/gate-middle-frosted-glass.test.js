'use strict';

// WHY THIS EXISTS
//
// The gate screen's middle panel is frosted glass (v23929, the "Frosted
// glass" direction chosen on the 2026-10-01 pick sheet): a soft field in the
// carrier's own colours, a frosted card inset from the panel's edge, and the
// advert's screen (#gateAdCarousel) seated in the card behind a frosted bezel
// of the same width on all four sides. It replaced the wave art, the blurred
// copy of the advert, the dots, the halftone, the silver wall frame
// (ad-frame-silver.png) and the per-advert frame (ad-frame-stream.png).
//
// Three things here are easy to undo by accident:
//   1. The old frame art is hidden UNSCOPED. At every advert change the
//      outgoing slide is lifted into a fading copy (div[data-ad-fading]) that
//      sits in #gateAdCarousel's parent (the unnamed wrapper inside
//      .gad-media-col), outside the carousel, so a hide scoped to the
//      carousel let ad-frame-stream.png come back at full strength for about
//      half a second.
//   2. The block is the middle panel only. The right column (the v23926 two
//      panels) and the left column are left exactly as they are.
//   3. The bezel: the screen is inset by the card's inset plus the bezel on
//      every side, and the seat line and the big-map takeover follow that box.
//
// Measured with headless Chrome against the approved mockup (served over main
// as an injected stylesheet): the middle panel is pixel-identical on Air
// Canada (YQM 4, day), PAL (YQM 2, night), Porter (YQM 3), at 1680x1050,
// 1280x720 and 1920x1080, and with the big-map takeover up; the screen sits
// 32.4px inside the panel at 1680x1050 (23.16px at 1280x720, 33.24px at
// 1920x1080). A rAF monitor saw no frame-art pixel in about 20,000 frames
// across eight slide changes. Nothing here can render a board, so these
// tests pin the rules that produce those numbers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

const AT = CSS.indexOf('THE MIDDLE PANEL IS FROSTED GLASS');
const START = AT >= 0 ? CSS.lastIndexOf('/*', AT) : -1;
const NEXT = AT >= 0 ? CSS.indexOf('/* ══', AT + 10) : -1;
const BLOCK = START >= 0 ? CSS.slice(START, NEXT > AT ? NEXT : undefined) : '';
const RULES = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const W = '(:not\\(#_\\)){255}(:not\\(\\._\\)){6}';
/** A literal string as a RegExp source. */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every rule in the block as { sels: [selector...], body }. */
function rules() {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(RULES))) {
    const sels = []; let depth = 0, cur = '';
    for (const ch of m[1]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { sels.push(cur.trim()); cur = ''; } else cur += ch;
    }
    sels.push(cur.trim());
    out.push({ sels: sels.filter(Boolean), body: m[2] });
  }
  return out;
}
/** The declarations of the rule(s) one of whose selectors is exactly `html body<weight><tail>`. */
function ruleFor(tail, bodyCls = '') {
  const want = new RegExp('^html body' + reEsc(bodyCls) + W + reEsc(tail) + '$');
  const hit = rules().filter((r) => r.sels.some((s) => want.test(s)));
  assert.ok(hit.length, `no frosted-glass rule for${bodyCls ? ' body' + bodyCls : ''}${tail}`);
  return hit.map((r) => r.body).join('\n');
}
/** A custom property's value as first declared in the block. */
function token(name) {
  const m = RULES.match(new RegExp(reEsc(name) + ':\\s*([^;]+);'));
  assert.ok(m, `no ${name} token`);
  return m[1].trim();
}
// Enough CSS length arithmetic to evaluate the block's size tokens at one size.
function px(expr, VW, VH) {
  const src = expr
    .replace(/var\((--[\w-]+)\)/g, (_, n) => '(' + px(token(n), VW, VH) + ')')
    .replace(/(-?\d*\.?\d+)vh/g, (_, n) => '(' + n * VH / 100 + ')')
    .replace(/(-?\d*\.?\d+)vw/g, (_, n) => '(' + n * VW / 100 + ')')
    .replace(/(-?\d*\.?\d+)px/g, '$1')
    .replace(/calc\(/g, '(')
    .replace(/min\(/g, 'Math.min(')
    .replace(/max\(/g, 'Math.max(');
  // eslint-disable-next-line no-new-func
  return Function('return ' + src)();
}
const decl = (body, prop) => {
  const m = body.match(new RegExp('(?:^|[;{\\s])' + reEsc(prop) + ':\\s*([^;]+?)\\s*!important'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
};

test('the frosted-glass block exists, carries the house weight, and names the middle panel only', () => {
  assert.ok(BLOCK.length > 2000, 'the block is in display-overrides.css');
  const all = rules().flatMap((r) => r.sels);
  assert.ok(all.length > 30);
  for (const sel of all) {
    // 255 :not(#_) (Blink stops counting a component at 255) and six :not(._),
    // as the v23926 block. The only body class is the board's night flag.
    assert.match(sel, new RegExp('^html body(\\.gate-acsky-night)?' + W + ' '), `selector without the house weight: ${sel.slice(0, 60)}…${sel.slice(-60)}`);
    // Never the right column (the v23926 two panels) or the left column.
    assert.doesNotMatch(sel, /gad-map-col|v2-rc-|gad-aircraft-col|v2-fi-|v2-flightinfo|g8-bir-|shelf|gateSky|gateCloud|gateMapBox/, `outside the middle panel: ${sel.slice(-80)}`);
  }
  assert.doesNotMatch(RULES, /:has\(/, 'the kiosk browsers drop :has()');
  // Every scoped rule is inside the gate wrap; the unscoped ones name only
  // the old frame nodes (next test).
  for (const sel of all) {
    const tail = sel.replace(new RegExp('^html body(\\.gate-acsky-night)?' + W + ' '), '');
    assert.match(tail, /^(\.g8-wrap\b|\.ad-outer-frame\b|\.ad-tech-frame\b|\.ad-tech-media$|\.ad-panel-backdrop\b)/, `unexpected target: ${tail}`);
  }
});

test('the old frame art is hidden UNSCOPED, so it cannot return in the fading copy of an outgoing slide', () => {
  // The nodes the rules name are the ones the board still builds.
  assert.match(CORE, /f\.className = 'ad-outer-frame';/, '_ensureOuterFrame mounts the wall frame node');
  assert.match(CORE, /\/logos\/Backgrounds\/ad-frame-silver\.png/, 'its silver art');
  assert.match(CORE, /bd\.className = 'ad-panel-backdrop';/, 'and the backdrop node');
  assert.match(CORE, /return '<div class="ad-tech-frame"/, '_adTechFrameHtml builds the per-advert frame');
  assert.match(CORE, /\/logos\/Backgrounds\/ad-frame-stream\.png/, 'with the stream art');
  // The outgoing slide is lifted into a plain div in the carousel's parent
  // (a wrapper inside .gad-media-col), outside the carousel.
  assert.match(CORE, /var _pr = el3\.parentNode;/);
  assert.match(CORE, /_old\.setAttribute\('data-ad-fading', '1'\);/);
  assert.match(CORE, /_pr\.appendChild\(_old\); \/\/ cover NOW/);

  // Each hide names the frame node directly under body: no .g8-wrap,
  // .gad-media-col or #gateAdCarousel above it.
  assert.equal(decl(ruleFor(' .ad-outer-frame > *'), 'display'), 'none');
  assert.equal(decl(ruleFor(' .ad-tech-frame > *'), 'display'), 'none');
  assert.equal(decl(ruleFor(' .ad-panel-backdrop > *'), 'display'), 'none');
  for (const pe of [' .ad-outer-frame::after', ' .ad-tech-frame::before', ' .ad-tech-frame::after', ' .ad-panel-backdrop::after']) {
    const body = ruleFor(pe);
    assert.equal(decl(body, 'display'), 'none', pe);
    assert.equal(decl(body, 'content'), 'none', pe);
  }
  assert.equal(decl(ruleFor(' .ad-outer-frame'), 'background'), 'none');
  assert.equal(decl(ruleFor(' .ad-tech-frame'), 'background'), 'none');
  assert.equal(decl(ruleFor(' .ad-tech-media'), 'filter'), 'none');
  // The dissolving copy takes the screen's corners. It is parked in the
  // carousel's parent, a wrapper INSIDE .gad-media-col, not a direct child of
  // it, so the rule must be a descendant match: a child combinator here
  // matched nothing and the copy showed square corners at every change.
  const fade = ruleFor(' .g8-wrap .gad-media-col [data-ad-fading]');
  assert.equal(decl(fade, 'border-radius'), 'var(--gx-irad)');
  assert.equal(decl(fade, 'overflow'), 'hidden');
  for (const r of rules()) {
    for (const s of r.sels) assert.doesNotMatch(s, />\s*\[data-ad-fading\]/, s.slice(-80));
  }
  // No hide of the frame art is scoped to the carousel.
  for (const r of rules()) {
    for (const s of r.sels) {
      if (/#gateAdCarousel/.test(s)) assert.doesNotMatch(s, /ad-(outer|tech)-frame|ad-panel-backdrop/, s.slice(-80));
    }
  }
});

test('the bezel: the screen sits the card inset plus the bezel inside the panel on every side, and the seat and the takeover follow it', () => {
  // Every size token pairs a vh with a vw term (the v23730 house rule).
  for (const t of ['--gx-g', '--gx-bz', '--gx-rad', '--gx-irad']) assert.match(token(t), /min\([\d.]+vh, [\d.]+vw\)/, t);
  const inset = 'calc(var(--gx-g) + var(--gx-bz))';
  const car = ruleFor(' .g8-wrap .gad-media-col #gateAdCarousel');
  for (const side of ['left', 'right', 'top', 'bottom']) assert.equal(decl(car, side), inset, `the screen's ${side}`);
  assert.equal(decl(car, 'position'), 'absolute');
  assert.equal(decl(car, 'width'), 'auto');
  assert.equal(decl(car, 'height'), 'auto');
  assert.equal(decl(car, 'border-radius'), 'var(--gx-irad)');
  assert.equal(decl(car, 'overflow'), 'hidden');
  // The frosted card, drawn by the backdrop's ::before, inset by --gx-g.
  const card = ruleFor(' .g8-wrap .gad-media-col > .ad-panel-backdrop::before');
  assert.equal(decl(card, 'inset'), 'var(--gx-g)');
  assert.equal(decl(card, 'border-radius'), 'var(--gx-rad)');
  assert.equal(decl(card, 'backdrop-filter'), 'var(--gx-glass-filter)');
  assert.equal(decl(card, '-webkit-backdrop-filter'), 'var(--gx-glass-filter)');
  // The seat line, drawn by the old wall frame's node, on exactly the screen's box.
  const seat = ruleFor(' .g8-wrap .gad-media-col > .ad-outer-frame::before');
  assert.equal(decl(seat, 'inset'), inset);
  assert.equal(decl(seat, 'border-radius'), 'var(--gx-irad)');
  assert.equal(decl(ruleFor(' .g8-wrap .gad-media-col > .ad-outer-frame'), 'overflow'), 'visible');
  // The big-map takeover is placed from the carousel's own rectangle when it
  // mounts, so it follows the bezel; here it takes the screen's corners.
  assert.match(CORE, /var _bcElR = el\.getBoundingClientRect\(\), _bcWrapR = _bcWrapEl\.getBoundingClientRect\(\);/);
  assert.match(CORE, /_bcOv\.style\.left = Math\.round\(_bcElR\.left - _bcWrapR\.left\) \+ 'px';/);
  assert.match(CORE, /_bcOv\.style\.width = Math\.round\(_bcElR\.width\) \+ 'px';/);
  assert.equal(decl(ruleFor(' .g8-wrap .bigcraft-overlay'), 'border-radius'), 'var(--gx-irad)');
  assert.equal(decl(ruleFor(' .g8-wrap .bigcraft-overlay'), 'box-shadow'), 'none');
  assert.equal(decl(ruleFor(' .g8-wrap .bigcraft-overlay .bigcraft-mapcol'), 'border-radius'), 'var(--gx-irad)');

  // The numbers measured on the board.
  const at = (VW, VH) => ({ g: px(token('--gx-g'), VW, VH), bz: px(token('--gx-bz'), VW, VH), irad: px(token('--gx-irad'), VW, VH), rad: px(token('--gx-rad'), VW, VH) });
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} vs ${b}`);
  const L = at(1680, 1050);
  close(L.g, 12.45, 'card inset 1680x1050'); close(L.bz, 19.95, 'bezel 1680x1050');
  close(L.g + L.bz, 32.4, 'screen inset 1680x1050'); close(L.rad, 22.05, 'card corner'); close(L.irad, 10.5, 'screen corner');
  const S = at(1280, 720); close(S.g + S.bz, 23.16, 'screen inset 1280x720'); close(S.irad, 7.2, 'screen corner 1280x720');
  const H = at(1920, 1080); close(H.g + H.bz, 33.24, 'screen inset 1920x1080');
});

test('the field replaces the wall art, and night quiets it under the board\'s own sunset flag', () => {
  const field = ruleFor(' .g8-wrap .gad-media-col > .ad-panel-backdrop');
  assert.equal(decl(field, 'background'), 'var(--gx-field)');
  assert.equal(decl(field, 'background-attachment'), 'fixed');
  assert.equal(decl(ruleFor(' .g8-wrap .gad-media-col::before'), 'display'), 'none');
  // The night flag is the board's own (fids-core.js toggles it at sunset).
  assert.match(CORE, /document\.body\.classList\.toggle\('gate-acsky-night',/);
  const night = ruleFor(' .g8-wrap .gad-media-col > .ad-panel-backdrop', '.gate-acsky-night');
  assert.equal(decl(night, 'background'), 'var(--gx-field-night), var(--gx-field)');
  assert.match(token('--gx-field-night'), /rgba\(2,4,10,\.30\)/);
  // A palette for each carrier that has one; everyone else takes the board's
  // own banner and accent colours.
  for (const c of ['AC', 'QK', 'RV', 'PB', 'PD', 'DL', 'WS', 'TS']) assert.ok(ruleFor(' .g8-wrap.g8-airline-' + c), c);
  assert.match(CORE, /' g8-airline-' \+ airlineCode/, 'the wrap carries the carrier class');
  assert.equal(token('--gx-base'), 'color-mix(in srgb, var(--banner-bg, #142650) 55%, #03050b)');
  assert.equal(token('--gx-1'), 'var(--airline-accent, #2b4ea8)');
});
