'use strict';

// WHY THIS EXISTS
//
// v23930: the gate screen's lower right panel (the aircraft picture, its
// caption and the inbound flight) opens like a left card. One full-width
// "Your Aircraft | Votre Avion" banner in the left column's banner style, then
// the picture, then two sections, the aircraft's model and the inbound
// flight, each on the carrier's own left-card plate and divided as the left
// cards are divided, by a strip of the ground. Chosen from the 2026-10-02
// pick sheet (row 2), with two changes asked for once it was chosen:
//
//   - the sections wear the carrier's own colour (its plate), where the
//     sheet's version was one flat colour;
//   - a status colour (amber delayed, red cancelled, green on time) belongs
//     to the status words only. The banner used to turn amber for a late
//     aircraft and green for an early one, which on Air Canada set amber
//     beside the carrier's red, read as a cancellation. It never changes
//     colour now, and nothing decorative in the panel is amber or red.
//
// The panel's box is v23926's, untouched: the same size as the upper panel,
// top corners round, bottom corners square and flush. These tests pin the
// markup and the rules that do this; the boards were measured with headless
// Chrome at 1680x1050, 1920x1080 and 1280x720.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const PLAIN = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const AT = CSS.indexOf('v23930 — THE LOWER RIGHT PANEL OPENS LIKE A LEFT CARD');
const START = AT >= 0 ? CSS.lastIndexOf('/*', AT) : -1;
const NEXT = AT >= 0 ? CSS.indexOf('/* ══', AT + 10) : -1;
const BLOCK = START >= 0 ? CSS.slice(START, NEXT > AT ? NEXT : undefined) : '';
const RULES = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const V26 = (() => {
  const a = CSS.lastIndexOf('/*', CSS.indexOf('v23926 — THE RIGHT COLUMN IS TWO PANELS'));
  return CSS.slice(a, CSS.indexOf('/* ══', a + 10)).replace(/\/\*[\s\S]*?\*\//g, '');
})();
const AC = '[data-gate-airline="AC"],[data-gate-airline="ACA"],[data-gate-airline*="AIR CANADA"]';

/** Every rule in `css` as { sels, body }. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ sels: m[1].split(/,\s*\n/).map((s) => s.trim()).filter(Boolean), body: m[2] });
  return out;
}
/** Declarations of the v23930 rules whose last selector ends with `tail` (generic, or for Air Canada). */
function ruleFor(tail, carrier) {
  const out = rules(RULES).filter((r) => {
    const last = r.sels[r.sels.length - 1];
    if (!last.endsWith(tail)) return false;
    return carrier ? last.startsWith('html body:is(' + carrier + ')') : !last.startsWith('html body:is(');
  }).map((r) => r.body);
  assert.ok(out.length, `no v23930 rule for ${tail}`);
  return out.join('\n');
}
function tokenIn(css, name) {
  const m = css.match(new RegExp(name.replace(/[-]/g, '\\-') + ':\\s*([^;]+);'));
  assert.ok(m, `no ${name}`);
  return m[1].trim();
}
const TOK = {
  '--fi-title-fs': () => tokenIn(PLAIN, '--fi-title-fs'),
  '--fi-title-py': () => tokenIn(PLAIN, '--fi-title-py'),
  '--fi-title-bw': () => tokenIn(PLAIN, '--fi-title-bw'),
  '--rcp-my': () => tokenIn(V26, '--rcp-my'),
  '--rcp-sheet': () => tokenIn(V26, '--rcp-sheet'),
};
const tok = (n) => (TOK[n] ? TOK[n]() : tokenIn(RULES, n));
// Enough CSS length arithmetic to evaluate the tokens at one size.
function px(expr, VW, VH) {
  const src = expr
    .replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (_, n) => '(' + px(tok(n), VW, VH) + ')')
    .replace(/(-?\d*\.?\d+)vh/g, (_, n) => '(' + n * VH + ')')
    .replace(/(-?\d*\.?\d+)vw/g, (_, n) => '(' + n * VW + ')')
    .replace(/(-?\d*\.?\d+)px/g, '$1')
    .replace(/calc\(/g, '(')
    .replace(/clamp\(/g, '__clamp(')
    .replace(/min\(/g, 'Math.min(')
    .replace(/max\(/g, 'Math.max(');
  // eslint-disable-next-line no-new-func
  return Function('__clamp', 'return ' + src)((a, v, b) => Math.min(Math.max(v, a), b));
}
/** _buildV2MapCol, the right column's builder. */
const MAPCOL = CORE.slice(CORE.indexOf('function _buildV2MapCol(ctx, vars) {'), CORE.indexOf('function uxgGateHtml(ctx) {'));
const SHELF = CORE.slice(CORE.indexOf('function _rcInboundShelf(orbHtml, lines) {'), CORE.indexOf('function _buildV2MapCol(ctx, vars) {'));

test('the v23930 block is the last word on the lower panel, and only on it', () => {
  assert.ok(BLOCK.length > 1000, 'the v23930 block is in display-overrides.css');
  const sels = rules(RULES).flatMap((r) => r.sels);
  assert.ok(sels.length > 40);
  for (const sel of sels) {
    assert.match(sel, /^html body(:is\(\[data-gate-airline="AC"\][^)]*\))?(:not\(#_\)){255}(:not\(\._\)){8} \.g8-wrap \.gad-map-col-v2( |$)/,
      `selector without the v23930 weight, or outside the right column: ${sel.slice(0, 80)}`);
    // The upper panel, the middle panel and the left column are not touched.
    assert.doesNotMatch(sel, /v2-rc-shelf-map|v2-rc-map-life|gad-media-col|gad-aircraft-col|ad-panel|bigcraft|wxcard|hcard/, sel.slice(-80));
  }
  assert.doesNotMatch(RULES, /:has\(/, 'the kiosk browsers drop :has()');
  assert.doesNotMatch(RULES, /@layer|&/, 'no cascade layers or nesting: plain rules the kiosks read');
});

test('the banner: a left-column title across the panel, in the left titles\' words, French first in Québec', () => {
  const ban = MAPCOL.match(/var _rcBanner =([\s\S]*?)\n\s*try \{/);
  assert.ok(ban, 'the banner is written into the panel\'s markup');
  assert.match(ban[1], /'<div class="g8-bir-shelves v2-rc-lp-banner">'/);
  assert.match(ban[1], /'<div class="v2-flightinfo-block"><div class="v2-fi-row"><div class="v2-fi-textcol">'/, 'a left card\'s title, so the left titles\' rules paint it');
  assert.match(ban[1], /_gateLbl\('yourAircraftHdr', _frF, function \(w, i2\)/, 'the board\'s own label logic, in the airport\'s language order');
  // In both forms of the panel, first.
  assert.equal((MAPCOL.match(/v2-rc-shelf-illus[^\n]*\n\s*\+\s*_rcBanner/g) || []).length, 2, 'the panel and its last-resort form both open with it');
  // Its box only: the panel's width, the left title's height, by name.
  assert.equal(tok('--rcl-bh'), 'calc(var(--fi-title-fs) * 1.16 + 2 * var(--fi-title-py) + var(--fi-title-bw))');
  assert.match(PLAIN, /html \.g8-wrap \{\s*--fi-title-fs: clamp\(15px, 1\.92vh, 26px\);\s*--fi-title-py: clamp\(2px, 0\.34vh, 6px\);\s*--fi-title-bw: clamp\(2px, 0\.32vh, 4px\);\s*\}/,
    'the left titles\' three values, named where they are set');
  assert.match(PLAIN, /\.v2-fi-title \.v2-fi-sep \{\s*font-size: var\(--fi-title-fs\) !important;/, 'and read there by the left titles themselves');
  const title = ruleFor('> .v2-rc-shelf-illus > .v2-rc-lp-banner .v2-fi-title');
  assert.match(title, /width: 100% !important;/);
  assert.match(title, /min-height: var\(--rcl-bh\) !important;/);
  assert.doesNotMatch(title, /background|color|border-bottom|font-size/, 'no paint, ink, rule or type of its own');
  // A banner the fitter has to put on two lines (a portrait screen) grows, never cuts.
  assert.match(ruleFor('.v2-rc-lp-banner .v2-fi-title.g8-fi-title-2line'), /flex-direction: column !important;/);
  assert.match(ruleFor('> .v2-rc-shelf-illus > .v2-rc-lp-banner'), /height: auto !important;\s*min-height: var\(--rcl-bh\) !important;/);
});

test('the banner never takes a status colour; the status is said in the lines\' words', () => {
  // The banner is written with no status class, and nothing in the board
  // writes one on a Your Aircraft title any more (v23207's amber and green).
  const ban = MAPCOL.match(/var _rcBanner =([\s\S]*?)\n\s*try \{/)[1];
  assert.match(ban, /'<div class="v2-fi-title">'/);
  assert.doesNotMatch(CORE, /v2-fi-title-warn|v2-fi-title-good/, 'no code path paints the title amber or green');
  // The inbound card has no title of its own: the banner carries its words.
  assert.doesNotMatch(SHELF, /v2-fi-title/);
  assert.match(MAPCOL, /_inboundCard = _rcInboundShelf\(_mcOrbHtml, \[/);
  assert.match(MAPCOL, /_inboundCard = _rcInboundShelf\(_niOrbHtml, \[/);
  assert.doesNotMatch(RULES, /v2-fi-title-(warn|good)/, 'the block styles no status title');
  // The status words keep the status colours: the lines' v23926 rules, on
  // the plate's own status tokens (dark on American's light plate).
  assert.match(V26, /:is\(\.v2-rc-status-delayed, \.v2-rc-status-diverted\) \{\s*color: var\(--plate-warn\) !important;/);
  const fi = ruleFor('.g8-wrap .gad-map-col-v2 > .v2-rc-shelf-fi');
  for (const t of ['--plate-ink', '--plate-ink-sh', '--plate-ok', '--plate-warn', '--plate-bad', '--plate-info']) {
    assert.match(fi, new RegExp(t + ': inherit;'), `${t}: the carrier's own, not v23926's dark-ground set`);
  }
});

test('nothing decorative is amber, or a red that could read as cancelled', () => {
  // The sections are divided by the ground, and no rule in the block paints a
  // surface, a border, a rule or a shadow in the carrier's accent or in a
  // status colour. (The banner's own rule is the left titles'; the carrier's
  // plate is its plate.)
  const PAINT = /(background|border|outline|box-shadow)[\w-]*\s*:[^;]*(--airline-accent|--plate-(warn|bad|ok)|#d82f2e|#c8102e|#fac120|#fbbf24|#e8a400|#b45309|#f87171|#fca5a5|#34d399)/i;
  for (const r of rules(RULES)) assert.doesNotMatch(r.body, PAINT, r.sels[0].slice(-80));
  assert.equal(tok('--rcl-gap'), 'var(--rcp-my)', 'the gap between the sections is the upper panel\'s own margin');
  // The registration and the operator are parted by the plate's own ink.
  assert.match(ruleFor('.v2-rc-acb-cap .v2-rc-acb-reg + .v2-rc-acb-opby'), /border-left: var\(--fi-title-bw\) solid color-mix\(in srgb, var\(--plate-ink, #ffffff\) 55%, transparent\) !important;/);
});

test('the sections are the carrier\'s own plate, each with the left plates\' edge', () => {
  const plate = rules(RULES).find((r) => r.sels.length === 2 && r.sels[0].endsWith('> .v2-rc-shelf-illus .v2-rc-acb-cap') && r.sels[1].endsWith('.gad-map-col-v2 > .v2-rc-shelf-fi'));
  assert.ok(plate, 'one rule paints both sections');
  assert.match(plate.body, /background-color: var\(--plate-base, #0b0e14\) !important;/);
  assert.match(plate.body, /background-image: var\(--plate-tex\) !important;/);
  assert.match(plate.body, /background-blend-mode: var\(--plate-blend, normal\) !important;/);
  assert.match(plate.body, /box-shadow: var\(--rcl-plate-sh\) !important;/);
  // The left plates' own paint (the ALL PANELS rule): the same tokens.
  assert.match(PLAIN, /:is\(\.gad-aircraft-col,\.g8-bir-shelves\) \.v2-flightinfo-block > \.v2-fi-row::before,[\s\S]*?\{\s*background-color: var\(--plate-base, #0b0e14\) !important;\s*background-image: var\(--plate-tex\) !important;/);
  assert.equal(tok('--rcl-plate-sh'), '0 4px 14px rgba(3, 8, 18, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.16), 0 0 0 1.5px rgba(170, 178, 190, 0.55)', 'the left plates\' edge');
  // Air Canada's texture at its own size, as on its left cards.
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi', AC), /background-size: auto !important;/);
  // Every word on a plate is in the plate's ink.
  const cap = ruleFor('> .v2-rc-shelf-illus .v2-rc-acb-cap :is(div, span, b)');
  assert.match(cap, /color: var\(--plate-ink, #ffffff\) !important;/);
  assert.match(cap, /text-shadow: var\(--plate-ink-sh, 0 1px 3px rgba\(0, 0, 0, 0\.78\)\) !important;/);
  // v23926 wrote the inbound line 1 white for its dark ground: on American's,
  // Lufthansa's and Qatar's light plates that was white on light blue.
  assert.match(V26, /\.v2-fi-mline1 \{\s*line-height: 1\.04 !important;\s*color: #ffffff !important;/, 'the rule being overridden');
  assert.match(ruleFor('.v2-fi-mline1 :is(.v2-fi-mlbl, .v2-fi-mcolon, .v2-fi-mlbl > span)'), /color: var\(--plate-ink, #ffffff\) !important;/);
});

test('what the type sits on: the ink passes read the plate, and the plate\'s ink says which way', () => {
  assert.match(CORE, /try \{ _rcPlateGroundInk\(root\); \} catch \(e00\) \{\}\s*try \{ _opbyContrastFix\(root\); \} catch \(e0\) \{\}/, 'measured before the first ink pass');
  const fn = CORE.slice(CORE.indexOf('function _rcPlateGroundInk(root) {'), CORE.indexOf('function _ocGroundOf(el) {'));
  assert.match(fn, /col\.style\.setProperty\('--rc-ground-ink', hex\)/, 'published where _rcLowerGround reads it');
  assert.match(fn, /px\[Math\.floor\(px\.length \* \(lightPlate \? 0\.15 : 0\.85\)\)\]/, 'the end of the plate type is hardest to read on');
  // Only the lower panel's type is re-checked when a plate is first measured:
  // a document-wide re-run recoloured the left column's Arrival code. The
  // panel's codes are in the plate's ink (next test), so only the operator's
  // mark is re-checked.
  assert.match(fn, /_opbyContrastFix\(low\[k\]\)/);
  assert.doesNotMatch(fn, /_gateCodeInk\(|_opbyContrastFix\(document\)/);
  assert.match(CORE, /var _pInk5 = \(typeof _rcPlateInkIsDark === 'function'\) \? _rcPlateInkIsDark\(im\) : null;\s*if \(_pInk5 !== null\) dark = !_pInk5;/, 'a light plate takes the operator\'s light-ground lettering');
});

/** A top-level function's source, to the first column-0 closing brace. */
function fnSrc(name) {
  const a = CORE.indexOf('function ' + name + '(');
  assert.ok(a >= 0, `no ${name}`);
  return CORE.slice(a, CORE.indexOf('\n}\n', a) + 2);
}
/** A stand-in element: in the lower panel's inbound section, or in the left column. */
function fakeCode(onPlate, inline) {
  const style = { ...inline };
  const data = {};
  const attrs = {};
  return {
    onPlate, style: {
      setProperty: (k, v) => { style[k] = v; },
      removeProperty: (k) => { delete style[k]; },
    },
    css: style, dataset: data, isConnected: true, parentElement: null, previousElementSibling: null,
    getClientRects: () => [1],
    closest: (sel) => (onPlate && /\.gad-map-col-v2 > \.v2-rc-shelf-fi/.test(sel) ? {} : null),
    hasAttribute: (k) => k in attrs, getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = String(v); }, removeAttribute: (k) => { delete attrs[k]; },
  };
}

test('the airport code in the panel is in the plate\'s ink, never the carrier\'s red', () => {
  // On a delayed Air Canada inbound the code was #E88584 (the carrier's red,
  // lifted for its black plate) directly over the amber "Delayed | En
  // retard", and beside the green status words on an early one: a red that
  // reads as cancelled, next to a status colour, on something that is not a
  // status word.
  const code = rules(RULES).find((r) => r.sels.some((s) => s.endsWith('.gad-map-col-v2 > .v2-rc-shelf-fi :is(.v2-rc-iata, .v2-fi-code)')));
  assert.ok(code, 'a v23930 rule writes the inbound section\'s code');
  assert.match(code.body, /(^|\s)color: var\(--plate-ink, #ffffff\) !important;/);
  assert.match(code.body, /-webkit-text-fill-color: var\(--plate-ink, #ffffff\) !important;/, 'the fill is what Blink paints glyphs with');
  for (const r of rules(RULES)) {
    if (!r.sels.some((s) => /v2-rc-iata|v2-fi-code/.test(s))) continue;
    assert.doesNotMatch(r.body, /--airline-accent|--plate-(warn|bad|ok)/, 'no accent or status colour on a code in this panel');
  }
  // The plate's ink itself is never a red or an amber, on any carrier.
  const hue = (hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    if (!d) return { h: 0, s: 0 };
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s };
  };
  const inks = [...PLAIN.matchAll(/--plate-ink:\s*#([0-9a-f]{6})\b/gi)].map((m) => m[1]);
  assert.ok(inks.length >= 5);
  for (const ink of inks) {
    const { h, s } = hue(ink);
    assert.ok(s < 0.25 || (h > 65 && h < 330), `--plate-ink #${ink} reads as a status colour`);
  }
  // Both accent passes leave the panel's codes alone, and take back only
  // what they wrote themselves. Run against stand-ins for one code on the
  // plate and one in the left column.
  assert.match(fnSrc('_rcCodeOnPlate'), /closest\('\.gad-map-col-v2 > \.v2-rc-shelf-fi, \.gad-map-col-v2 > \.v2-rc-shelf-illus'\)/);
  const RED = [216, 47, 46], LIFTED = 'rgb(232, 133, 132)';
  // eslint-disable-next-line no-new-func
  const accents = Function('document', 'getComputedStyle', '_caScreenAccent', '_caBgBehind', '_caParse', '_caFit',
    fnSrc('_rcCodeOnPlate') + fnSrc('applyCodeAccents') + 'return applyCodeAccents;');
  const plate = fakeCode(true), left = fakeCode(false);
  plate.setAttribute('data-ca', 'rgb(247,212,212)'); plate.style.setProperty('color', 'rgb(247,212,212)');
  const doc = { documentElement: { getAttribute: () => null }, querySelectorAll: () => Object.assign([plate, left], { forEach: Array.prototype.forEach }) };
  accents(doc, () => ({ color: 'rgb(255,255,255)' }), () => RED, () => [11, 14, 20], () => [255, 255, 255], () => RED)();
  assert.equal(plate.css.color, undefined, 'the accent pass writes nothing on the panel\'s code, and takes back what it wrote');
  assert.equal(plate.getAttribute('data-ca'), null);
  assert.equal(left.css.color, 'rgb(216,47,46)', 'the left column keeps the carrier\'s accent');
  // eslint-disable-next-line no-new-func
  const ink = Function('document', 'getComputedStyle', '_ocGroundOf', '_ocColorParts', '_ocCr', '_ocToHsl', '_ocFromHsl', '_ocLum',
    fnSrc('_rcCodeOnPlate') + fnSrc('_gateCodeInk') + 'return _gateCodeInk;');
  const plate2 = fakeCode(true, { color: LIFTED, '-webkit-text-fill-color': LIFTED });
  plate2.dataset.inkApplied = '1';
  const left2 = fakeCode(false);
  const root = { querySelectorAll: () => [plate2, left2] };
  let cr = 0;
  ink(root, () => ({ color: 'rgb(216, 47, 46)', webkitTextFillColor: 'rgb(216, 47, 46)' }), () => [11, 14, 20],
    (c) => c.match(/\d+/g).slice(0, 3).map(Number), () => (cr++ ? 5 : 3), () => [0, 0.66, 0.51], () => [232, 133, 132], () => 0.01)(root);
  assert.equal(plate2.css.color, undefined, 'the contrast pass undoes its own lift on the panel\'s code');
  assert.equal(plate2.css['-webkit-text-fill-color'], undefined);
  assert.equal(plate2.dataset.inkApplied, undefined);
  assert.equal(left2.css['-webkit-text-fill-color'], 'rgb(232, 133, 132)', 'and still lifts a code in the left column');
});

test('the panel keeps its v23926 box: the same size as the upper one, top corners round, foot square and flush', () => {
  // The block never moves the panel: no grid row, margin, height, border or
  // radius on the panel element itself.
  const onPanel = rules(RULES).filter((r) => r.sels.some((x) => /\.gad-map-col-v2 > \.v2-rc-shelf-illus$/.test(x)));
  assert.deepEqual(onPanel.map((r) => r.sels[0].slice(-60)), [], 'no rule restyles the panel element itself');
  // Its corners are v23926's, on the radius v23242 names on this element.
  assert.match(V26, /border-top: 1px solid #e7eaef !important;\s*border-radius: var\(--rc-panel-r\) var\(--rc-panel-r\) 0 0 !important;/);
  assert.match(PLAIN, /\.gad-map-col-v2 :is\(\.v2-rc-shelf-map, \.v2-rc-shelf-illus\) \{\s*--rc-panel-r: clamp\(12px, 1\.6vh, 18px\);/, '--rc-panel-r is defined where it is used');
  assert.doesNotMatch(RULES, /--rc-panel-r/, 'and the block uses it nowhere it is not defined');
  // The inbound plate: its own radius at the top (a token on the column, so
  // it is defined wherever it is used), square at the foot, and v23926's
  // flush margin is left alone.
  const fi = ruleFor('.g8-wrap .gad-map-col-v2 > .v2-rc-shelf-fi');
  assert.match(fi, /border-radius: var\(--rcl-plate-r\) var\(--rcl-plate-r\) 0 0 !important;/);
  assert.doesNotMatch(fi, /margin|grid-row|align-self/);
  assert.match(ruleFor('.g8-wrap .gad-map-col-v2'), /--rcl-plate-r: clamp\(/);
  // What goes in it adds up to it, with the picture keeping real room: the
  // banner, the picture, a gap, the aircraft section, a gap, the inbound.
  for (const [VW, VH, panelH, minPic] of [[16.8, 10.5, 434.88, 180], [19.2, 10.8, 447.4, 180], [12.8, 7.2, 289.0, 100]]) {
    const bh = px(tok('--rcl-bh'), VW, VH), under = px(tok('--rcl-under'), VW, VH);
    const cap = px(tok('--rcl-cap'), VW, VH), sheet = px(tok('--rcl-sheet'), VW, VH), gap = px(tok('--rcl-gap'), VW, VH);
    assert.ok(Math.abs(under - (cap + sheet + 2 * gap)) < 0.01);
    const pic = panelH - bh - under;
    assert.ok(pic >= minPic, `the picture is ${pic.toFixed(1)}px at ${VW * 100}x${VH * 100}`);
    assert.ok(sheet > 3 * px(tok('--rcl-ban'), VW, VH), `the inbound section holds three lines (${sheet.toFixed(1)}px)`);
  }
  // The sky, the aircraft and the hold mark all run from the banner's foot
  // to the first gap; the ground over the sky starts there too.
  assert.match(ruleFor('> .v2-rc-shelf-illus > .v2-rc-aircraft-hold'), /top: var\(--rcl-bh\) !important;\s*bottom: auto !important;\s*height: calc\(100% - var\(--rcl-bh\) - var\(--rcl-under\)\) !important;/);
  assert.match(ruleFor('> .v2-rc-shelf-illus > .v2-rc-aircraft-img'), /top: var\(--rcl-bh\) !important;\s*bottom: var\(--rcl-under\) !important;/);
  assert.match(ruleFor('> .v2-rc-shelf-illus::after'), /mask-image: linear-gradient\(to bottom, transparent calc\(100% - var\(--rcl-under\) - 1px\), #000 calc\(100% - var\(--rcl-under\) - 1px\)\) !important;/);
});

test('the model is at least 1.25x the banner; no inline "Aircraft:" label', () => {
  assert.equal(tok('--rcl-vs'), 'calc(var(--rcl-ban) * 1.5)');
  assert.match(CORE, /var _sFloor = _up64\(_ban \* 1\.25\), _rFloor = _up64\(_ban\);/);
  assert.match(CORE, /var _banW = _panel && _panel\.querySelector\('\.v2-rc-lp-banner \.v2-fi-title \.v2-fi-lbl-en'\);/, 'measured off the banner\'s own words');
  const build = CORE.slice(CORE.indexOf('var _acModelVal, _acRegVal'), CORE.indexOf('_aircraftBlock =', CORE.indexOf('var _acModelVal, _acRegVal')));
  assert.doesNotMatch(build, /_gateLbl\('aircraft'|v2-rc-acb-lbl/);
});

test('the inbound section: line 1 across, the orb beside the lines after it, measured from the cell\'s edge', () => {
  // The orb is written into the first line beside it; the row says how many lines.
  assert.match(SHELF, /var host = ls\.length >= 2 \? 1 : 0/);
  assert.match(SHELF, /' v2-rc-lp-beside' \+ \(isHost \? ' v2-rc-lp-orbhost' : ''\)/);
  assert.match(SHELF, /'<div class="v2-fi-row v2-rc-lp-n' \+ Math\.min\(3, Math\.max\(1, ls\.length\)\) \+ '">'/);
  assert.match(SHELF, /\(placed \? '' : '<div class="v2-fi-iconcol">' \+ orbHtml \+ '<\/div>'\)/, 'an unknown line keeps the orb in its own column');
  assert.match(ruleFor('.v2-fi-value > .v2-rc-lp-beside'), /padding-left: calc\(var\(--rcl-orb\) \+ var\(--rcl-orb-gap\)\) !important;/, 'the orb\'s room, in em');
  assert.equal(tok('--rcl-orb'), '2.12em');
  // The line fitter counts that room as width, and measures pairs stacked.
  assert.match(CORE, /return \(w && isFinite\(w\)\) \? Math\.max\(w, b\.right - _v0\) : ln\.scrollWidth;/);
  assert.match(CORE, /return r > l \? Math\.max\(r - l, r - _v0\) : _lnW\(ln\);/);
  assert.match(CORE, /try \{ _fidsPairSeparators\(val\); \} catch \(eP\) \{\}/);
  // The orb stays the carrier's: same badge, same art, untouched.
  assert.match(CORE, /'<div class="v2-fi-icon-wrap v2-fi-icon-badge' \+ _mcWrapCls \+ ' v2-fi-orbwrap" style="' \+ _mcBadge \+ '">'/);
});

test('the house rule: every clamp in the block carries a width term', () => {
  const all = BLOCK.match(/clamp\([^()]*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)[^()]*)*\)/g) || [];
  assert.ok(all.length >= 4, `expected the block's clamps, found ${all.length}`);
  const bad = all.filter((c) => c.includes('vh') && !c.includes('vw'));
  assert.deepEqual(bad, [], 'these clamps have no width term: ' + bad.join(', '));
});
