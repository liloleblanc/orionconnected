'use strict';

// WHY THIS EXISTS
//
// The gate screen's right column is TWO panels of exactly the same size (the
// v23926 spec): the map panel on top, unchanged, and below it ONE panel that
// holds the aircraft picture, its caption and the Your Aircraft lines, with
// one frame and one ground, no gaps between the pieces and no frames, strips
// or rules of their own inside it. Before v23926 those were three separate
// boxes (the picture, a carrier-coloured caption strip with a white rule along
// its top and its own rounded foot, and a card on its own textured plate) with
// gaps between them, and the lower group was not the size of the panel above.
//
// The lower panel's ground is the upper panel's, layer for layer: the layers
// the upper panel paints while it holds the airline mark. The two panels are
// the same size, so the same layers land on the same pixels.
//
// Corners mirror the side columns, which are rounded at the top and end square
// on the bottom edge of the screen: the upper panel keeps all four corners
// rounded; the lower panel's top two round with the same radius and its
// bottom two are square, flush on the column's bottom edge. Equal height and
// flush-at-the-bottom are both kept by taking the upper panel's two 0.9vh
// margins at the lower panel's top, so the gap between the panels is 2.7vh
// (plus Air Canada's own bottom padding on Air Canada, which stays under the
// upper panel so that panel keeps its size).
//
// Measured with headless Chrome at 1680x1050 (YQM gates 1-4, YHZ 56/57/18):
//   upper 380.39 x 434.88, lower 380.39 x 434.86, gap 28.32, flush 0
//   Air Canada: upper 380.39 x 430.67 (as before), lower 430.66, gap 36.73
//   ground, upper vs lower, both side strips of the caption and lines: max
//   channel difference 1 (WestJet) to 5 (United), gradient dithering.
// Nothing here can render a board, so these tests pin the rules that produce
// those numbers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const GATE = fs.readFileSync(path.join(root, 'fids-current', 'css', 'gate-display.css'), 'utf8');

const AT = CSS.indexOf('v23926 — THE RIGHT COLUMN IS TWO PANELS');
const START = AT >= 0 ? CSS.lastIndexOf('/*', AT) : -1;
const NEXT = AT >= 0 ? CSS.indexOf('/* ══', AT + 10) : -1;
const BLOCK = START >= 0 ? CSS.slice(START, NEXT > AT ? NEXT : undefined) : '';
const RULES = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const PLAIN = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const GATE_PLAIN = GATE.replace(/\/\*[\s\S]*?\*\//g, '');
const AC = '[data-gate-airline="AC"],[data-gate-airline="ACA"],[data-gate-airline*="AIR CANADA"]';
const WS = '[data-gate-airline="WS"],[data-gate-airline="WJA"],[data-gate-airline*="WESTJET"]';

/** Declarations of every rule in the block whose LAST selector ends with `tail`, generic or for one carrier. */
function ruleFor(tail, carrier) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  const out = [];
  let m;
  while ((m = re.exec(RULES))) {
    const sels = m[1].split(/,\s*\n/).map((s) => s.trim());
    const last = sels[sels.length - 1];
    if (!last.endsWith(tail)) continue;
    if (carrier ? !last.startsWith('html body:is(' + carrier + ')') : last.startsWith('html body:is(')) continue;
    out.push(m[2]);
  }
  assert.ok(out.length, `no v23926 rule for ${tail}${carrier ? ' on ' + carrier.slice(0, 30) : ''}`);
  return out.join('\n');
}
/** A custom property's value as declared in the block (the first declaration). */
function token(name) {
  const m = RULES.match(new RegExp(name.replace(/-/g, '\\-') + ':\\s*([^;]+);'));
  assert.ok(m, `no ${name} token`);
  return m[1].trim();
}
// Enough CSS length arithmetic to evaluate the block's tokens at one size.
function px(expr, VW, VH) {
  const src = expr
    .replace(/var\((--[\w-]+)\)/g, (_, n) => '(' + px(token(n), VW, VH) + ')')
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
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim();

test('the v23926 block exists, is the last word on these elements, and leaves the upper and middle panels alone', () => {
  assert.ok(BLOCK.length > 1000, 'the v23926 block is in display-overrides.css');
  const topLevel = (list) => {
    const out = []; let depth = 0, cur = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    return out.concat(cur);
  };
  const sels = RULES.split('{').slice(0, -1).map((s) => s.split('}').pop())
    .flatMap(topLevel).map((s) => s.trim()).filter(Boolean);
  assert.ok(sels.length > 40);
  for (const sel of sels) {
    // Blink stops counting a specificity component at 255: these tie on ids
    // with the heaviest earlier rules (the sky layers' 277) and win on the
    // six :not(._).
    assert.match(sel, /^html body(:is\(\[data-gate-airline="(AC|WS)"\][^)]*\))?(:not\(#_\)){255}(:not\(\._\)){6} \.g8-wrap(\.g8-banner-light)? \.gad-map-col-v2([ >]|$)/,
      `selector without the v23926 weight, or outside the right column: ${sel.slice(0, 80)}`);
    // The upper panel is not restyled here, and nothing in the middle panel is.
    assert.doesNotMatch(sel, /v2-rc-shelf-map|v2-rc-map-life|gad-media-col|ad-panel|ad-outer|bigcraft|wxcard|hcard/, sel.slice(-80));
  }
  assert.doesNotMatch(RULES, /:has\(/, 'the kiosk browsers drop :has()');
});

test('the upper panel is the map panel as it was: three rows, 0.9vh margins, four round corners, the same size', () => {
  assert.match(CSS, /\.gad-map-col-v2 > \.v2-rc-shelf-map\s+\{ grid-row: span 3 !important;/, 'it spans rows 1-3');
  assert.match(PLAIN, /\.g8-wrap \.gad-map-col-v2 > \.v2-rc-shelf \{\s*margin: 0\.9vh 0\.7vw !important;/, 'its 0.9vh margins');
  // Its corners (v23242): one rule rounds both panels, and names its radius
  // so the lower panel's top corners are that radius by reference.
  assert.match(PLAIN, /\.gad-map-col-v2 :is\(\.v2-rc-shelf-map, \.v2-rc-shelf-illus\) \{\s*--rc-panel-r: clamp\(12px, 1\.6vh, 18px\);\s*border-radius: var\(--rc-panel-r\) !important;/,
    'its corners (v23242)');
  assert.doesNotMatch(RULES, /--rc-panel-r:/, 'the block never restates the radius');
  // The lower panel's margin token is the upper panel's, character for character.
  assert.equal(token('--rcp-my'), '0.9vh');
  // The column's padding is not touched, so Air Canada's v22821 bottom
  // padding still sits under the upper panel's grid (430.67px tall at
  // 1680x1050, as it was; the first v23926 cut zeroed it and the panel grew
  // to 434.88). The lower panel reaches through it by the same amount.
  assert.doesNotMatch(RULES, /padding-bottom/, 'the block never sets the column\'s padding');
  // That rule names its padding (the value it always had), and the lower
  // panel reads the name: Air Canada's padding where it is set, none on every
  // other carrier.
  const v22821 = PLAIN.match(new RegExp('html body:is\\(' + AC.replace(/[[\]().*"]/g, '\\$&') + '\\):not\\(#_\\):not\\(#_\\) \\.g8-wrap \\.gad-map-col-v2 \\{\\s*--rc-col-pb: ([^;]+);\\s*padding-bottom: var\\(--rc-col-pb\\) !important;'));
  assert.ok(v22821, 'Air Canada\'s v22821 padding is still in the file, named');
  assert.equal(v22821[1], 'clamp(6px, 0.8vh, 10px)', 'the value it always had');
  assert.equal(token('--rcp-pb'), 'var(--rc-col-pb, 0px)', 'the lower panel knows that padding exactly, and none elsewhere');
  assert.doesNotMatch(RULES, /--rc-col-pb:/, 'the block never restates the padding');
});

test('the lower panel: one panel on rows 4-6, the size of the upper, flush on the bottom edge', () => {
  const plate = ruleFor('.gad-map-col-v2 > .v2-rc-shelf-illus');
  const sheet = ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi');
  for (const d of [plate, sheet]) {
    assert.match(d, /grid-row: 4 \/ span 3 !important;/, 'rows 4-6, as the upper panel takes rows 1-3');
    assert.match(d, /grid-column: 1 \/ -1 !important;/, 'an explicit column, so the two overlap and never open a track');
  }
  // Equal height: the upper panel gives 0.9vh to each of its margins; the
  // lower gives the same 1.8vh, all of it at its top, and reaches down
  // through the column's bottom padding (Air Canada's) to the edge.
  assert.match(plate, /margin: calc\(2 \* var\(--rcp-my\) \+ var\(--rcp-pb\)\) 0 calc\(-1 \* var\(--rcp-pb\)\) !important;/);
  assert.match(sheet, /margin: 0 0 calc\(-1 \* var\(--rcp-pb\)\) !important;/);
  assert.match(sheet, /align-self: end !important;/, 'the Your Aircraft lines sit on the panel\'s foot');
  assert.match(ruleFor('.g8-wrap .gad-map-col-v2'), /grid-template-columns: minmax\(0, 1fr\) !important;/);
  // Corners: top two round with the upper panel's radius, bottom two square.
  assert.match(plate, /border-radius: var\(--rc-panel-r\) var\(--rc-panel-r\) 0 0 !important;/);
  assert.match(sheet, /border-radius: 0 !important;/);
  // One frame, the upper panel's (its top rule, next test); no outline, no
  // shadow, and the lines lying on its foot have none of their own.
  for (const d of [plate, sheet]) {
    assert.match(d, /border: 0 !important;/);
    assert.match(d, /outline: 0 !important;/);
    assert.match(d, /box-shadow: none !important;/);
  }
  assert.doesNotMatch(sheet, /border-(top|right|bottom|left):/);
  // The arithmetic, at three sizes, from the declared margins: both panels
  // span three of the column's six equal rows (the grid's height is the
  // column's less its bottom padding), each gives up its two vertical
  // margins, and the lower one reaches back down through the padding. The
  // column is 913.5px tall at 1680x1050 (3px contour top and bottom).
  const m = plate.match(/margin: (calc\(.*?\)\)) 0 (calc\(.*?\)) !important;/);
  assert.ok(m, 'the lower panel declares its margins');
  for (const pb of ['0px', 'clamp(6px, 0.8vh, 10px)']) {
    for (const [VW, VH, H] of [[16.8, 10.5, 913.5], [19.2, 10.8, 939.6], [12.8, 7.2, 610]]) {
      const tok = (n) => (n === '--rcp-pb' ? pb : token(n));
      const ev = (e) => px(e.replace(/var\((--[\w-]+)\)/g, (_, n) => '(' + tok(n) + ')'), VW, VH);
      const P = ev('var(--rcp-pb)');
      const rows = (H - 6 - P) / 6;
      const upper = 3 * rows - 2 * ev('var(--rcp-my)');
      const lowerTop = (H - 6 - P) / 2 + ev(m[1]);
      const lowerBottom = (H - 6 - P) - ev(m[2]);
      assert.ok(Math.abs(upper - (lowerBottom - lowerTop)) < 0.01, `equal heights at ${VW * 100}x${VH * 100}, padding ${pb}`);
      assert.ok(Math.abs(lowerBottom - (H - 6)) < 0.01, 'flush on the column\'s inner bottom edge');
      if (VH === 10.5) assert.ok(Math.abs(upper - (P ? 430.67 : 434.88)) < 0.05, `the upper panel keeps its ${upper.toFixed(2)}px at 1680x1050`);
    }
  }
});

test('the lower panel wears the upper panel\'s frame: the map area\'s 1px top rule, on the same radius', () => {
  // The upper panel's own box has no border. What frames it on screen is its
  // map area's rule (gate-display.css, the right-column uniformity pass): 1px
  // #e7eaef top and bottom, no sides. The map area fills the panel and takes
  // its radius, so the top rule runs along the panel's top edge and tapers
  // into its rounded corners; the bottom rule lies under the map's divider
  // band. Measured at 1680x1050: (231,234,239) on the panel's top row, on Air
  // Canada at night and on PAL with the mark. The lower panel had none.
  const rim = GATE_PLAIN.match(/\.gad-map-col-v2 \.v2-map-area \{ border-top: (1px solid #[0-9a-f]{6}) !important; border-bottom: (1px solid #[0-9a-f]{6}) !important; \}/i);
  assert.ok(rim, 'the map area\'s rule');
  assert.equal(rim[1], '1px solid #e7eaef');
  assert.match(PLAIN, /\.gad-map-col-v2 :is\(\.v2-map-area, \.g8-inb-map\) \{\s*border-radius: inherit !important;/, 'on the panel\'s radius');
  assert.match(PLAIN, /\.gad-map-col-v2 \.v2-rc-shelf-map \.v2-map-area \{\s*position: absolute !important;\s*inset: 0 !important;/, 'filling the panel');
  assert.match(GATE_PLAIN, /\.g8-wrap \.gad-map-col-v2 > \.v2-rc-shelf-map::after \{[^}]*bottom: 0 !important; z-index: 7 !important;/, 'the divider band over its bottom rule');
  const plate = ruleFor('.gad-map-col-v2 > .v2-rc-shelf-illus');
  assert.match(plate, /border: 0 !important;\s*border-top: 1px solid #e7eaef !important;/, 'the lower panel: the same top rule, no other');
  assert.equal(plate.match(/border-top: ([^;]+) !important;/)[1], rim[1], 'character for character');
  // Its children sit inside it: a positioned layer at top 0 starts under the
  // rule, and the panel clips at its padding edge, so nothing paints over it.
  assert.match(plate, /overflow: hidden !important;/);
});

test('the house rule: every clamp in the block carries a width term', () => {
  // v23730: a vh-only clamp sizes off height alone and overflows the moment a
  // board is narrower than the geometry it was tuned on. The two values this
  // block needs that ARE vh-only clamps (the panels' radius, Air Canada's
  // padding) live in their own rules, by name, and are read here by var().
  const all = BLOCK.match(/clamp\([^()]*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)[^()]*)*\)/g) || [];
  assert.ok(all.length >= 8, `expected the block's clamps, found ${all.length}`);
  const bad = all.filter((c) => c.includes('vh') && !c.includes('vw'));
  assert.deepEqual(bad, [], 'these clamps have no width term: ' + bad.join(', '));
});

test('one ground, and it is the upper panel\'s: the same layers, value for value', () => {
  // What the upper panel paints while it holds the mark (gate-display.css):
  // the brand-hold layer over the panel's own ground.
  const life = norm(GATE_PLAIN.match(/\.g8-wrap\.g8-bigcraft-active \.gad-map-col-v2 \.v2-rc-map-life \{[^}]*?background:\s*([^;]+?) !important;/)[1]);
  const shelf = norm(GATE_PLAIN.match(/\.g8-wrap\.g8-bigcraft-active \.gad-map-col-v2 > \.v2-rc-shelf-map \{[^}]*?background:\s*([^;]+?) !important;/)[1]);
  // The ground rule names the panel and its ::after together.
  const groundRule = RULES.match(/\.gad-map-col-v2 > \.v2-rc-shelf-illus,\s*\n[^\n{]*\.gad-map-col-v2 > \.v2-rc-shelf-illus::after \{\s*background:\s*([^;]+?) !important;\s*\}/g);
  assert.ok(groundRule && groundRule.length === 3, 'the ground: generic, Air Canada, WestJet');
  const generic = groundRule.find((r) => !/^html body:is\(/.test(r.split('\n')[1]));
  assert.ok(generic, 'the generic ground');
  const value = norm(generic.match(/background:\s*([\s\S]+?) !important;/)[1]);
  assert.equal(value, life + ',' + shelf + ',var(--banner-bg,#071426)',
    'brand-hold layers, then the panel\'s own layers, on --banner-bg (the colour the upper panel sits on)');
  // Air Canada's and WestJet's brand-hold layer is flat and opaque.
  const flat = (carrier) => ruleFor('.gad-map-col-v2 > .v2-rc-shelf-illus::after', carrier).match(/background: (#[0-9a-f]{6}) !important;/i)[1];
  const v22925b = PLAIN.match(new RegExp('\\.v2-rc-map-life \\{\\s*background-color: (#[0-9a-f]{6}) !important;\\s*background-image: none !important;', 'i'));
  assert.ok(v22925b);
  assert.equal(flat(AC), v22925b[1], 'Air Canada: the v22925b near-black');
  assert.match(PLAIN, new RegExp('html body:is\\(' + WS.replace(/[[\]().*"]/g, '\\$&') + '\\)[^{]*\\.v2-rc-map-life \\{\\s*background-color: ' + flat(WS) + ' !important;'),
    'WestJet: its deep navy, the last word on its brand-hold layer');
  // Painted again over the sky layers, from the sky box down, clipped there,
  // above every sky layer (the front clouds are z 3) and under the caption.
  const after = ruleFor('.gad-map-col-v2 > .v2-rc-shelf-illus::after');
  assert.match(after, /content: '' !important;/);
  assert.match(after, /inset: 0 !important;/, 'the panel\'s whole box, so the gradients land where they do underneath');
  // Cut by a hard-stop MASK, 1px inside the sky box. The sky box ends on a
  // fraction of a pixel. A clip-path there anti-aliased each of the ground's
  // layers on its own along that row (the bright banner colour under the
  // translucent ramps showed through), and the sky layers running on under
  // the ground showed through as well: a 1px line lighter than both sides on
  // a night sky (WestJet (31,41,60) between (15,22,37) and (6,16,36)). A mask
  // applies to the ground as a whole and its hard stop lands on whole pixels.
  const cut = 'linear-gradient(to bottom, transparent calc(100% - var(--rcp-cap) - var(--rcp-sheet) - 1px), #000 calc(100% - var(--rcp-cap) - var(--rcp-sheet) - 1px)) !important;';
  assert.ok(after.includes('-webkit-mask-image: ' + cut), 'the prefixed mask (the kiosk browsers)');
  assert.ok(after.includes('\n  mask-image: ' + cut), 'and the standard one');
  assert.match(after, /clip-path: none !important;/, 'no clip-path edge');
  assert.match(after, /z-index: 4 !important;/);
  assert.match(ruleFor('.gad-map-col-v2 .v2-rc-shelf-illus .v2-rc-acb-cap'), /z-index: 5 !important;/);
  // The lines paint nothing: they lie on that ground.
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi'), /background: transparent !important;/);
  // The sky box keeps its own backing under the dimmed night sky: the
  // shelf's #0A1A30, as the night rule paints it.
  assert.match(PLAIN, /body\.gate-acsky-night[^{]*\.v2-rc-shelf-illus \{\s*background-color: #0A1A30 !important;/);
  const before = ruleFor('.gad-map-col-v2 > .v2-rc-shelf-illus::before');
  assert.match(before, /background: #0A1A30 !important;/);
  assert.match(before, /height: calc\(100% - var\(--rcp-cap\) - var\(--rcp-sheet\)\) !important;/);
  // The first cut's flat stand-in is gone.
  assert.doesNotMatch(CORE + CSS, /--rc-lower-bg|_gateLowerBg/);
});

test('no frame, strip or rule of its own inside the lower panel', () => {
  const cap = ruleFor('.gad-map-col-v2 .v2-rc-shelf-illus .v2-rc-acb-cap');
  assert.match(cap, /background: none !important;/, 'no carrier strip');
  assert.match(cap, /border: 0 !important;/, 'no white rule along its top');
  assert.match(cap, /box-shadow: none !important;/, 'no inset highlight (Air Canada\'s)');
  assert.match(cap, /border-radius: 0 !important;/);
  assert.match(cap, /left: 0 !important;\s*right: 0 !important;/);
  assert.match(RULES, /\.v2-rc-acb-cap::before,\s*\n[^\n]*\.v2-rc-acb-cap::after \{\s*content: none !important;\s*display: none !important;/);
  // White type with the lines' own shadow, every carrier (Air Canada's was
  // near-black type on its grey strip).
  assert.match(cap, /color: #ffffff !important;\s*-webkit-text-fill-color: #ffffff !important;\s*text-shadow: var\(--rcp-type-sh\) !important;/);
  assert.match(ruleFor('.gad-map-col-v2 .v2-rc-shelf-illus .v2-rc-acb-cap :is(div, span, b)'), /background: none !important;\s*box-shadow: none !important;/);
  const row = ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-row');
  assert.match(row, /background: transparent !important;/);
  assert.match(row, /border: 0 !important;/);
  assert.match(row, /box-shadow: none !important;/);
  assert.match(RULES, /\.v2-fi-row::before,\s*\n[^\n]*\.v2-fi-row::after \{\s*content: none !important;\s*display: none !important;/,
    'the per-carrier plate under the lines is gone');
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-title:not(.v2-fi-title-warn):not(.v2-fi-title-good)'),
    /background: transparent !important;\s*padding: 0 !important;\s*border-radius: 0 !important;/, 'the title tab is plain type');
  for (const sel of ['.gad-map-col-v2 > .v2-rc-shelf-fi .g8-bir-shelves', '.gad-map-col-v2 > .v2-rc-shelf-fi .v2-flightinfo-block']) {
    assert.match(ruleFor(sel), /background: transparent !important;\s*border: 0 !important;\s*box-shadow: none !important;/, sel);
  }
});

test('the sky, the aircraft, the caption and the lines measure from the same two tokens', () => {
  const skyH = 'height: calc(100% - var(--rcp-cap) - var(--rcp-sheet)) !important;';
  const skyRule = (RULES.match(/[^{}]+\{[^}]*\}/g) || []).find((r) => r.includes('> #gateNightSky {'));
  assert.ok(skyRule && skyRule.includes(skyH), 'every sky layer is the sky box, the night veil too');
  for (const id of ['#gateSkyVid', '#gateCloudsBg', '#gateCloudsMid', '#gateCloudsVeil', '#gateCloudsFg', '#gateFgVid']) {
    assert.ok(skyRule.includes('.v2-rc-shelf-illus > ' + id + ','), id);
  }
  assert.ok(ruleFor('.v2-rc-shelf-illus > .v2-rc-aircraft-hold').includes(skyH), 'the hold mark centres in the sky');
  assert.match(ruleFor('.v2-rc-shelf-illus > .v2-rc-aircraft-img'), /bottom: calc\(var\(--rcp-cap\) \+ var\(--rcp-sheet\)\) !important;/);
  const cap = ruleFor('.gad-map-col-v2 .v2-rc-shelf-illus .v2-rc-acb-cap');
  assert.match(cap, /bottom: var\(--rcp-sheet\) !important;/, 'the caption sits on the lines, no gap');
  assert.match(cap, /height: var\(--rcp-cap\) !important;/);
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi'), /height: var\(--rcp-sheet\) !important;/);
  // At 1680x1050 the sky box is the old shelf's size less the 1px top rule
  // (221.1 of 222.1), the caption is the 60px one-row band and the lines get
  // 153px of the panel.
  const panel = (913.5 - 6) / 6 * 3 - 2 * 0.9 * 10.5;
  const skyPx = panel - 1 - px(token('--rcp-cap'), 16.8, 10.5) - px(token('--rcp-sheet'), 16.8, 10.5);
  assert.ok(Math.abs(skyPx - 221.1) < 0.5, `sky box ${skyPx.toFixed(1)}px`);
  assert.ok(Math.abs(px(token('--rcp-cap'), 16.8, 10.5) - 59.85) < 0.05);
  // The lines' height is the same on every landscape board as the first cut
  // gave it, and a portrait screen's tall, narrow panel gives them room
  // (100px there before, and the third line ran off the screen).
  const first = 'clamp(100px, min(14.6vh, 9.1vw), 210px)';
  for (const [VW, VH] of [[16.8, 10.5], [19.2, 10.8], [12.8, 7.2], [13.66, 7.68], [10.24, 7.68], [25.6, 14.4], [38.4, 21.6]]) {
    assert.ok(Math.abs(px(token('--rcp-sheet'), VW, VH) - px(first, VW, VH)) < 0.01, `landscape ${VW * 100}x${VH * 100}`);
  }
  assert.ok(px(token('--rcp-sheet'), 10.8, 19.2) > 190, `portrait 1080x1920: ${px(token('--rcp-sheet'), 10.8, 19.2).toFixed(1)}px`);
});

test('what the type sits on: the ink passes read the panel\'s ground, not the page behind it', () => {
  assert.match(CORE, /\+ ';--rc-ground-ink:' \+ _gateLowerInkGround/, 'published on the gate wrap');
  const at = CORE.indexOf('var _gateLowerInkGround = (function (hex) {');
  assert.ok(at > 0);
  const end = CORE.indexOf("})((_bannerSpec && _bannerSpec.r1", at);
  // eslint-disable-next-line no-new-func
  const inkGround = Function('hex', 'return ' + CORE.slice(at + 'var _gateLowerInkGround = '.length, end) + '})(hex);');
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  // Measured off the 1680x1050 boards at the caption's left end: PAL
  // (23,43,83), United (11,41,103), Porter (135,136,136).
  const near = (hex, rgb, tol) => [1, 3, 5].every((i, k) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - rgb[k]) <= tol);
  assert.ok(near(inkGround('#183677'), [23, 43, 83], 22), `PAL ${inkGround('#183677')}`);
  assert.ok(near(inkGround('#0033A0'), [11, 41, 103], 22), `United ${inkGround('#0033A0')}`);
  assert.ok(near(inkGround('#EFE8DA'), [135, 136, 136], 22), `Porter ${inkGround('#EFE8DA')}`);
  for (const h of ['#183677', '#0033A0', '#003366', '#1C1C1C']) assert.ok(lum(inkGround(h)) < 0.1, `${h} is a dark ground`);
  // The flat grounds are named beside theirs.
  assert.equal(ruleFor('.g8-wrap .gad-map-col-v2', AC).match(/--rc-ground-ink: ([^;]+);/)[1], '#0b0d10');
  assert.equal(ruleFor('.g8-wrap .gad-map-col-v2', WS).match(/--rc-ground-ink: ([^;]+);/)[1], '#061024');
  // Both passes ask the panel first.
  assert.match(CORE, /function _ocGroundOf\(el\) \{\s*var _rcG = _rcLowerGround\(el\);\s*if \(_rcG\) return _rcG;/);
  assert.match(CORE, /var _rcG2 = \(typeof _rcLowerGround === 'function'\) \? _rcLowerGround\(im\) : null;/);
  assert.match(CORE, /el\.closest\('\.gad-map-col-v2 > \.v2-rc-shelf-illus, \.gad-map-col-v2 > \.v2-rc-shelf-fi'\)/);
  // PAL's navy lettering has its white pair for the dark ground.
  assert.match(CORE, /'PB':\s+\{ onDark:'\/logos\/airlines\/canadian-regional\/pal-airlines-wordmark-light\.svg', onLight:'\/logos\/airlines\/canadian-regional\/pal-airlines-wordmark-color\.svg' \}/);
  for (const f of ['pal-airlines-wordmark-light.svg', 'pal-airlines-wordmark-color.svg']) {
    assert.ok(fs.existsSync(path.join(root, 'fids-current', 'logos', 'airlines', 'canadian-regional', f)), f);
  }
});

test('the Your Aircraft lines: the mark and the title on one row, the lines at the full width, never past the foot', () => {
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-textcol'), /display: contents !important;/);
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-row'), /grid-template-columns: auto minmax\(0, 1fr\) !important;/);
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-title'), /grid-row: 1 !important;\s*grid-column: 2 !important;/);
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-value'), /grid-column: 1 \/ -1 !important;/);
  const orb = px(token('--rcp-orb'), 16.8, 10.5);
  assert.ok(orb >= 48 && orb <= 56, `the carrier's mark is ${orb.toFixed(1)}px`);
  // A lone 'Information Unavailable | Information non disponible' takes two
  // lines when two read larger.
  assert.match(CORE, /var _stack = isFinite\(_f2\) && _f2 > \(isFinite\(_f1\) \? _f1 : 0\) \* 1\.04;/);
  // The line fitter checks the stack's height as well as its width.
  assert.match(CORE, /if \(!\(_stackH > 0\) \|\| !\(_roomH > 0\) \|\| _lN\.bottom <= _bot \+ 0\.01\) break;/);
  assert.match(CORE, /var _down = _roomH \/ _stackH;/);
});

test('a carrier whose art is a disc fills the mark box: no circle inside a circle', () => {
  const at = CORE.indexOf('window._gateOrbParts = function (code) {');
  assert.ok(at > 0);
  const src = CORE.slice(at, CORE.indexOf('\n};\n', at) + 3);
  const win = {};
  // eslint-disable-next-line no-new-func
  Function('window', '_airlineOrbEmblem', 'AIRLINE_BRAND', src)(win, () => '', {});
  for (const c of ['DL', 'UA', 'F8']) {
    const p = win._gateOrbParts(c);
    assert.equal(p.native, true, `${c} art is a disc`);
    assert.match(p.badge, /padding:0;/, `${c}: its inline box asks for no padding`);
  }
  for (const c of ['AC', 'PD', 'WS']) assert.equal(win._gateOrbParts(c).native, false, `${c} art sits on a disc, padded`);
  assert.match(CORE, /var _mcWrapCls = _mcParts\.native \? ' v2-fi-orbwrap-native' : '';/);
  assert.match(CORE, /var _niWrapCls = _niParts\.native \? ' v2-fi-orbwrap-native' : '';/);
  assert.match(CORE, /v2-fi-icon-badge' \+ _mcWrapCls \+ ' v2-fi-orbwrap" style="' \+ _mcBadge \+ '">'/);
  assert.match(CORE, /v2-fi-icon-badge' \+ _niWrapCls \+ ' v2-fi-orbwrap" style="' \+ _niBadge \+ '">'/);
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-orbwrap'), /padding: clamp\(/);
  const native = ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-orbwrap.v2-fi-orbwrap-native');
  assert.match(native, /padding: 0 !important;/);
  assert.match(native, /box-shadow: none !important;/);
  assert.doesNotMatch(native, /width|height|background/, 'the box keeps its size and its own ground');
});

test('every word in the caption carries the shadow, and a light banner gives it a halo', () => {
  // The old light strip's rule clears text-shadow on every child of the
  // caption. A shadow set only on the caption box never reached a letter:
  // the labels and the model computed 'none' (Porter's 12.7px white labels
  // at 3.5:1 with nothing behind them). It is set on the children.
  assert.match(PLAIN, /\.gad-map-col-v2 \.v2-rc-acb-cap \*[^{]*\{[^}]*text-shadow: none !important;/, 'the rule that clears it is still there');
  const kids = ruleFor('.gad-map-col-v2 .v2-rc-shelf-illus .v2-rc-acb-cap :is(div, span, b)');
  assert.match(kids, /color: #ffffff !important;\s*-webkit-text-fill-color: #ffffff !important;\s*text-shadow: var\(--rcp-type-sh\) !important;/);
  // One shadow for every word in the lower panel: the caption, the plain
  // title and the lines (through the plate token they already read).
  assert.equal(token('--rcp-type-sh'), '0 1px 3px rgba(0, 0, 0, 0.78)', 'the lines\' own shadow');
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi'), /--plate-ink-sh: var\(--rcp-type-sh\);/);
  assert.match(RULES, /\.v2-fi-title:not\(\.v2-fi-title-warn\):not\(\.v2-fi-title-good\) \* \{\s*color: #ffffff !important;\s*-webkit-text-fill-color: #ffffff !important;\s*text-shadow: var\(--rcp-type-sh\) !important;/);
  assert.doesNotMatch(RULES.replace(/--rcp-type-sh:[^;]+;/g, ''), /text-shadow: (?!var\(--rcp-type-sh\))/, 'no word in the panel has a shadow of its own');
  // A light banner colour (Porter's cream, .g8-banner-light on the wrap)
  // puts mid grey under the type; there the shadow starts with a tight dark
  // halo round each letter.
  const light = RULES.match(/\.g8-wrap\.g8-banner-light \.gad-map-col-v2 \{\s*--rcp-type-sh: ([^;]+);\s*\}/);
  assert.ok(light, 'the light-banner shadow');
  assert.match(light[1], /^0 0 2px rgba\(0, 0, 0, 0\.95\), /, 'a 2px halo first');
  assert.match(light[1], /0 1px 3px rgba\(0, 0, 0, 0\.78\)$/, 'and the ordinary shadow under it');
  assert.match(CORE, /return _lum > 170 \? ' g8-banner-light' : '';/, 'the class the board puts on a light banner\'s wrap');
});

test('the title pills keep the board\'s own bar: the words\' colour, never the title\'s', () => {
  // A pill carries its own ground and words. The board's pill rules colour
  // the bar with the words: dark ink on the green and amber pills, white on
  // WestJet's navy. The title element's own colour is the dark ink even where
  // the words are white, so an inherited bar went navy on navy (1.2:1).
  assert.doesNotMatch(RULES, /:\s*inherit\b/, 'nothing in the block inherits a colour');
  const sep = RULES.match(/[^{}]*\.v2-rc-shelf-fi :is\(\.v2-fi-sep, \.v2-rc-fi-sep, \.v2-rc-bar\)([^,{]*),/);
  assert.ok(sep, 'the separators\' rule');
  assert.equal(sep[1], ':not(.v2-fi-title-warn *):not(.v2-fi-title-good *)', 'the white separators leave the pills alone');
  const pill = ruleFor('.v2-fi-title:is(.v2-fi-title-warn, .v2-fi-title-good) .v2-fi-sep');
  assert.doesNotMatch(pill, /color/, 'in a pill the bar keeps the pill rules\' colour');
  assert.match(pill, /opacity: 0\.8 !important;/);
  assert.match(RULES, /\.v2-fi-title:not\(\.v2-fi-title-warn\):not\(\.v2-fi-title-good\) \.v2-fi-sep \{\s*opacity: 0\.62 !important;/);
  // Every rule in the block that names a pill's separator sets no colour.
  for (const r of RULES.match(/[^{}]+\{[^}]*\}/g) || []) {
    const [sel, body] = r.split('{');
    if (/title-(warn|good)\)? \.v2-fi-sep\s*$/.test(sel.trim()) || /:is\(\.v2-fi-title-warn, \.v2-fi-title-good\) \.v2-fi-sep/.test(sel)) {
      assert.doesNotMatch(body, /color/, sel.slice(-90));
    }
  }
});

test('an operator\'s mark on Air Canada\'s near-black ground clears 3:1', () => {
  // The caption used to be a light grey strip on Air Canada, and Rouge's and
  // PAL's colour lettering was drawn for it. On the panel's own ground
  // (#0b0d10) Rouge's crimson read 2.5:1 and PAL's navy less. Each takes its
  // published white lettering there (_opbyContrastFix, onDark); Jazz keeps
  // its own red, which clears 3:1.
  const objSrc = (name) => {
    const at = CORE.indexOf('var ' + name + ' = {');
    assert.ok(at > 0, name);
    // eslint-disable-next-line no-new-func
    return Function('return ' + CORE.slice(at + ('var ' + name + ' = ').length, CORE.indexOf('\n};', at) + 2))();
  };
  const WORD = objSrc('OPERATOR_WORDMARKS');
  const PAIR = objSrc('OPBY_WORDMARKS_THEMED');
  assert.deepEqual(PAIR.RV, { onDark: '/logos/airlines/canadian/rouge-monochrome-white.svg', onLight: '/logos/airlines/canadian/rouge.svg' });
  assert.deepEqual(PAIR.ROU, PAIR.RV);
  const lum = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const ground = ruleFor('.g8-wrap .gad-map-col-v2', AC).match(/--rc-ground-ink: #([0-9a-f]{6});/i)[1];
  for (const op of ['RV', 'ROU', 'QK', 'JZA', 'PB', 'PVL']) {
    const file = PAIR[op] ? PAIR[op].onDark : WORD[op];
    assert.ok(file, op);
    const svg = fs.readFileSync(path.join(root, 'fids-current', file), 'utf8');
    const fills = [...svg.matchAll(/fill[:=]"?#([0-9a-f]{6})\b/gi)].map((m) => m[1]);
    assert.ok(fills.length, `${op}: ${file} has fills`);
    for (const f of fills) assert.ok(ratio(f, ground) >= 3, `${op}: #${f} on #${ground} is ${ratio(f, ground).toFixed(2)}:1 (${file})`);
  }
});
