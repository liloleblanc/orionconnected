'use strict';

// WHY THIS EXISTS
//
// v23937: the gate screen's lower right panel (the aircraft picture, its
// one-row caption and the Your Aircraft lines) in the airline's own two
// colours, option 1 of the 2026-10-04 pick sheet. It replaces v23934's
// banner-and-plates panel, which is taken out.
//
//   picture       unchanged (the sky and the carrier's livery art)
//   caption bar   one row (v23904, fitted as v23926 fits it), painted in the
//                 carrier's FIRST colour, every word in that colour's ink
//   info area     the orb, "Your Aircraft | Votre Avion" and the inbound
//                 lines on the carrier's SECOND colour
//   corners       5px on both right panels; the lower one square at its foot
//
// A status colour belongs to the status words only: amber is Delayed, red is
// Cancelled, green is On time. So no colour of the panel may read as one,
// for any carrier, and the Your Aircraft title never turns amber or green.
// Air Canada's bar is the one red, held on purpose: a deeper red than the
// board's #D82F2E, which is the Cancelled red's twin.
//
// Measured with headless Chrome at 1680x1050 (and 1280x720, 1920x1080) on
// Air Canada, WestJet, PAL by night, Porter, Delta, United, Flair, Air Transat,
// Emirates and a Jazz CRJ900 at Québec City: both panels 372 wide and the same
// height, the lower one flush on the frame line, the caption one row (the
// model at 2.01-2.17x its labels, 1.62x on two lines beside Jazz's mark),
// nothing clipped, the status words in their colours. Nothing here can render
// a board, so these tests pin the rules and run the colour logic itself.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const GATE = fs.readFileSync(path.join(root, 'fids-current', 'css', 'gate-display.css'), 'utf8');
const COLORS_SRC = fs.readFileSync(path.join(root, 'fids-current', 'data', 'airline-colors.js'), 'utf8');

/** A literal string as a RegExp source: every character RegExp treats as syntax, backslash included. */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── the block: its header to the end of its own last rule (the title's
// separator), so a block appended after it is never swept into these guards.
const AT = CSS.indexOf("v23937 — THE LOWER RIGHT PANEL IN THE AIRLINE'S OWN TWO COLOURS");
const START = AT >= 0 ? CSS.lastIndexOf('/*', AT) : -1;
const LAST = AT >= 0 ? CSS.indexOf('.v2-fi-title:is(.v2-fi-title-warn, .v2-fi-title-good) .v2-fi-sep {', AT) : -1;
const END = LAST >= 0 ? CSS.indexOf('\n}', LAST) + 2 : -1;
const BLOCK = START >= 0 && END > START ? CSS.slice(START, END) : '';
const RULES = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const BOOST = 'html body' + ':not(#_)'.repeat(255) + ':not(._)'.repeat(12) + ' ';

/** Every rule in `css` as { sels, body }. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ sels: m[1].split(/,\s*\n/).map((s) => s.trim()).filter(Boolean), body: m[2] });
  return out;
}
/** Declarations of the block's rules with a selector ending in `tail`. */
function ruleFor(tail) {
  const out = rules(RULES).filter((r) => r.sels.some((s) => s.endsWith(tail))).map((r) => r.body);
  assert.ok(out.length, `no v23937 rule for ${tail}`);
  return out.join('\n');
}

/** Source of a top-level function in fids-core.js, by brace matching. */
function fnSource(name) {
  const i = CORE.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1);
}
/** A top-level `const NAME = { ... };` table from fids-core.js, evaluated. */
function table(name) {
  const i = CORE.indexOf('const ' + name + ' = {');
  assert.ok(i >= 0, name + ' must exist');
  const j = CORE.indexOf('\n};', i);
  return vm.runInNewContext('(' + CORE.slice(CORE.indexOf('{', i), j + 2) + ')');
}

// The pair resolver, as the board runs it: RC2_STATUS through _rc2Pair.
const RC2_SRC = (() => {
  const a = CORE.indexOf('var RC2_STATUS = {');
  assert.ok(a >= 0, 'RC2_STATUS must exist');
  const pairFn = fnSource('_rc2Pair');
  const b = CORE.indexOf(pairFn, a) + pairFn.length;
  assert.ok(b > a, '_rc2Pair follows RC2_STATUS');
  return CORE.slice(a, b);
})();
const RC2 = vm.runInNewContext(RC2_SRC + '\n({ RC2_STATUS, RC2_PAIRS, RC2_B_WORDS, _rc2Pair, _rc2StatusLike, _rc2DeltaE, _rc2Contrast, _rc2Rgb });', { window: {} });
const TABLES = (() => {
  const sandbox = { window: {} };
  vm.runInNewContext(COLORS_SRC, sandbox);
  return { accent: table('AIRLINE_ACCENT'), brand: table('AIRLINE_BRAND'), colors: sandbox.window.AIRLINE_BRAND_COLORS };
})();
const ALL_STATUS = [].concat(...Object.values(RC2.RC2_STATUS));
const AC_FAMILY = ['AC', 'ACA', 'QK', 'JZA', 'RV', 'ROU'];

test('the block is the house pattern: one booster on every selector, no :has(), nothing that moves', () => {
  assert.ok(BLOCK.length > 0, 'the v23937 block exists');
  assert.ok(AT > CSS.indexOf('v23926 — THE RIGHT COLUMN IS TWO PANELS'), 'after the v23926 panel it paints over');
  assert.ok(AT > CSS.indexOf('v23935 — THE DAY UNDER A GATE TIME'), 'and at the end of the file');
  const all = rules(RULES);
  assert.ok(all.length >= 20, `expected the block's rules, found ${all.length}`);
  for (const r of all) {
    for (const s of r.sels) {
      assert.ok(s.startsWith(BOOST + '.g8-wrap '), 'every selector carries 255 :not(#_) and twelve :not(._): ' + s.slice(-90));
    }
  }
  assert.doesNotMatch(RULES, /:has\(/, 'no :has(): the kiosk browsers drop it');
  assert.doesNotMatch(RULES, /animation|transition|@keyframes/, 'nothing in the panel moves or flashes');
  // The house rule (v23730): a vh length always beside a width term.
  for (const m of RULES.matchAll(/(?:min|max|clamp)\([^;]*?vh[^;]*?\)/g)) assert.match(m[0], /vw/, m[0]);
  assert.doesNotMatch(RULES.replace(/(?:min|max|clamp)\([^;]*?\)/g, ''), /\d(?:\.\d+)?vh/, 'no bare vh');
});

test('two colours, written on the gate by uxgGateHtml and painted here', () => {
  assert.match(CORE, /var p = _rc2Pair\(airlineCode\);\s*return ';--rc2-a:' \+ p\.a \+ ';--rc2-a-ink:' \+ p\.ink \+ ';--rc2-b:' \+ p\.b;/);
  // The caption bar: one flat colour, its words in the ink, no shadow, no glass.
  const cap = ruleFor('.gad-map-col-v2 .v2-rc-shelf-illus .v2-rc-acb-cap');
  assert.match(cap, /background: var\(--rc2-a, #[0-9a-f]{6}\) !important;/i);
  assert.match(cap, /background-image: none !important;/);
  assert.match(cap, /color: var\(--rc2-a-ink, #ffffff\) !important;\s*-webkit-text-fill-color: var\(--rc2-a-ink, #ffffff\) !important;/);
  assert.match(cap, /backdrop-filter: none !important;/);
  const words = ruleFor('.v2-rc-acb-cap :is(div, span, b)');
  assert.match(words, /color: var\(--rc2-a-ink, #ffffff\) !important;\s*-webkit-text-fill-color: var\(--rc2-a-ink, #ffffff\) !important;\s*text-shadow: none !important;/);
  assert.doesNotMatch(words, /opacity/, 'the labels are words: full strength, 4.5:1 or better on every bar');
  // The rule between the halves takes the ink (Air Canada's red rule would vanish on the red bar).
  assert.match(ruleFor('.v2-rc-acb-cap .v2-rc-acb-opby'), /border-left: 1\.5px solid color-mix\(in srgb, var\(--rc2-a-ink, #ffffff\) 55%, transparent\) !important;/);
  // The second colour is the lower panel's ground: the panel and its masked ::after.
  const ground = rules(RULES).find((r) => r.sels.some((s) => s.endsWith('> .v2-rc-shelf-illus::after')));
  assert.ok(ground && ground.sels.some((s) => s.endsWith('.gad-map-col-v2 > .v2-rc-shelf-illus')));
  assert.match(ground.body, /background: var\(--rc2-b, var\(--banner-bg, #0c1119\)\) !important;/);
  // Each part publishes what its type sits on, for _rcLowerGround.
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-illus'), /--rc-ground-ink: var\(--rc2-a, #0c1119\) !important;/);
  assert.match(ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi'), /--rc-ground-ink: var\(--rc2-b, #0c1119\) !important;/);
  assert.match(fnSource('_rcLowerGround'), /getPropertyValue\('--rc-ground-ink'\)/);
});

test('squarish corners on both right panels; the lower one stays the upper one\'s size, flush at the foot', () => {
  assert.match(ruleFor('.gad-map-col-v2 > :is(.v2-rc-shelf-map, .v2-rc-shelf-illus)'), /--rc-panel-r: 5px;/);
  const upper = rules(RULES).find((r) => r.sels.some((s) => s.endsWith('.gad-map-col-v2 > .v2-rc-shelf-map')));
  assert.ok(upper, 'a rule for the upper panel');
  assert.match(upper.body, /border-radius: 5px !important;/);
  for (const inner of ['.v2-map-area', '#gateMapBox', '.v2-rc-map-life']) {
    assert.ok(upper.sels.some((s) => s.endsWith('> .v2-rc-shelf-map ' + inner)), inner + ' follows the panel\'s corners');
  }
  const lowerRadius = rules(RULES).filter((r) => r.sels.length === 1 && r.sels[0].endsWith('.gad-map-col-v2 > .v2-rc-shelf-illus'));
  assert.ok(lowerRadius.some((r) => /border-radius: 5px 5px 0 0 !important;/.test(r.body)), 'the lower panel: 5px at the top, square at the foot');
  // Both panels (and the lines laid over the lower one) come in from the frame's sides by the same amount.
  const inset = ruleFor('.gad-map-col-v2 > :is(.v2-rc-shelf-map, .v2-rc-shelf-illus, .v2-rc-shelf-fi)');
  assert.match(inset, /margin-left: min\(0\.4vh, 0\.25vw\) !important;\s*margin-right: min\(0\.4vh, 0\.25vw\) !important;/);
  // Nothing else moves a panel: v23926's size, gap and flush foot hold.
  for (const r of rules(RULES)) {
    if (!r.sels.some((s) => /\.gad-map-col-v2 > (?::is\()?\.v2-rc-shelf-(?:map|illus|fi)\)?$/.test(s))) continue;
    assert.doesNotMatch(r.body, /(?:^|[\s;])(?:margin|margin-top|margin-bottom|height|min-height|max-height|grid-row|align-self|top|bottom)\s*:/, r.sels[0].slice(-60));
  }
});

test('every carrier the board knows gets two colours, neither a status colour, with legible words on both', () => {
  const codes = new Set([...Object.keys(TABLES.accent), ...Object.keys(TABLES.brand), ...Object.keys(TABLES.colors), ...Object.keys(RC2.RC2_PAIRS)]);
  // and carriers with no entry anywhere (the old Swoop, Spirit and Lynx codes, Sun Country, Allegiant, nothing at all)
  ['WO', 'NK', 'Y9', 'SY', 'G4', 'ZZ', ''].forEach((c) => codes.add(c));
  assert.ok(codes.size > 90, `the board's carriers: ${codes.size}`);
  for (const code of codes) {
    const p = RC2._rc2Pair(code, TABLES);
    const at = `${code || '(none)'} ${JSON.stringify(p)}`;
    for (const k of ['a', 'ink', 'b']) assert.match(p[k], /^#[0-9A-F]{6}$/, at);
    assert.ok(RC2._rc2Contrast(p.a, p.ink) >= 4.5, 'every word on the bar at 4.5:1: ' + at);
    const words = Math.min(...RC2.RC2_B_WORDS.map((w) => RC2._rc2Contrast(p.b, w)));
    assert.ok(words >= 4.5, `white and every status word at 4.5:1 on the second colour (${words.toFixed(2)}): ` + at);
    assert.ok(RC2._rc2DeltaE(p.a, p.b) >= 20, 'two colours, not one: ' + at);
    assert.equal(RC2._rc2StatusLike(p.b), '', 'the second colour is no status colour: ' + at);
    if (AC_FAMILY.includes(code)) continue;     // the one held red, below
    assert.equal(RC2._rc2StatusLike(p.a), '', 'the bar is no status colour: ' + at);
    assert.ok(Math.min(...ALL_STATUS.map((s) => RC2._rc2DeltaE(p.a, s))) >= 12, 'and nowhere near one: ' + at);
  }
});

test('the four carriers on the pick sheet keep its colours', () => {
  // (copied out of the sandbox's realm, so deepEqual compares values)
  const P = (c) => ({ ...RC2._rc2Pair(c, TABLES) });
  assert.deepEqual(P('AC'), { a: '#A6192E', ink: '#FFFFFF', b: '#0B0D10' }, 'AC deep red + AC black');
  assert.deepEqual(P('WS'), { a: '#00B2A9', ink: '#002B55', b: '#003366' }, 'WestJet teal + navy');
  assert.deepEqual(P('PB'), { a: '#3E57BE', ink: '#FFFFFF', b: '#183677' }, 'PAL blue + navy');
  assert.deepEqual(P('PD'), { a: '#EFE8DA', ink: '#152C53', b: '#152C53' }, 'Porter cream + navy');
  // Jazz and Rouge fly as Air Canada, Encore as WestJet, under any code they arrive with.
  for (const c of AC_FAMILY) assert.deepEqual(P(c), P('AC'), c);
  for (const c of ['WR', 'WEN', 'WJA']) assert.deepEqual(P(c), P('WS'), c);
  for (const c of ['SP', 'PVL']) assert.deepEqual(P(c), P('PB'), c);
});

test('Air Canada\'s red is a deeper red than the board\'s, and is no Cancelled red the gate paints', () => {
  const de = RC2._rc2DeltaE;
  assert.equal(RC2._rc2StatusLike('#D82F2E'), 'cancelled', 'the board\'s AC red reads as Cancelled');
  assert.ok(de('#D82F2E', '#DC2626') < 6, 'it is the Cancelled red\'s twin');
  // The Cancelled words' reds: well clear.
  for (const r of ['#DC2626', '#C01622', '#B91C1C', '#F87171', '#EF4444', '#FCA5A5']) {
    assert.ok(de('#A6192E', r) >= 16.5, `#A6192E vs ${r}: ${de('#A6192E', r).toFixed(1)}`);
  }
  // The Cancelled pill grounds (#991b1b, #be123c): a different colour, if a red.
  for (const r of ['#991B1B', '#BE123C']) {
    assert.ok(de('#A6192E', r) >= 9.5, `#A6192E vs ${r}: ${de('#A6192E', r).toFixed(1)}`);
  }
  assert.ok(RC2._rc2Contrast('#A6192E', '#FFFFFF') >= 7, 'white type on it at 7:1');
  assert.match(fnSource('_rc2Pair'), /var hit = RC2_PAIRS\[c\];\s*if \(hit\) return/, 'held by the table, not let through by the guard');
  // No other carrier gets a red bar.
  for (const code of Object.keys(TABLES.colors).concat(Object.keys(TABLES.accent))) {
    if (AC_FAMILY.includes(code)) continue;
    assert.notEqual(RC2._rc2StatusLike(RC2._rc2Pair(code, TABLES).a), 'cancelled', code);
  }
});

test('brand colours that read as a status are never used', () => {
  const reads = {
    '#FCA404': ['delayed', 'PB'],     // PAL's orange: the board's Delayed amber
    '#FFB81C': ['delayed', 'LH'],     // Lufthansa yellow
    '#F9A01B': ['delayed', 'WN'],     // Southwest
    '#FCB130': ['delayed', 'SQ'],     // Singapore
    '#F7941D': ['delayed', 'WG'],     // Sunwing
    '#F08200': ['delayed', 'DE'],     // Condor
    '#7AFF94': ['ontime', 'F8'],      // Flair lime
    '#0F6744': ['ontime', 'F9'],      // Frontier green
    '#009A44': ['ontime', 'EI'],      // Aer Lingus
    '#05CE78': ['ontime', 'HV'],      // Transavia
    '#C01933': ['cancelled', 'DL'],   // Delta red
    '#D71A21': ['cancelled', 'EK'],   // Emirates red
    '#C8102E': ['cancelled', 'TK'],   // Turkish
    '#E60005': ['cancelled', 'LX'],   // SWISS
    '#D71920': ['cancelled', 'IB'],   // Iberia
  };
  for (const [hex, [status, code]] of Object.entries(reads)) {
    assert.equal(RC2._rc2StatusLike(hex), status, `${hex} reads as ${status}`);
    const p = RC2._rc2Pair(code, TABLES);
    assert.ok(![p.a, p.b, p.ink].includes(hex), `${code} never shows ${hex}: ${JSON.stringify(p)}`);
  }
  // What they show instead: their own other colours.
  assert.deepEqual({ ...RC2._rc2Pair('DL', TABLES) }, { a: '#003366', ink: '#FFFFFF', b: '#041C2C' }, 'Delta Blue + Delta Dark Blue');
  assert.deepEqual({ ...RC2._rc2Pair('UA', TABLES) }, { a: '#0033A0', ink: '#FFFFFF', b: '#0C2340' }, 'United Blue + Rhapsody Blue');
  assert.equal(RC2._rc2Pair('LH', TABLES).b, '#05164D', 'Lufthansa Blue');
  assert.equal(RC2._rc2Pair('F8', TABLES).b, '#1C1C1C', 'Flair black');
});

test('the status colours the guard keeps clear are the ones the gate paints', () => {
  const painted = (GATE + CSS + CORE).toLowerCase();
  for (const c of ALL_STATUS) assert.ok(painted.includes(c.toLowerCase()), c + ' is a colour the gate uses');
  // The words the second colour carries are v23926's tokens for this panel.
  const v26 = CSS.slice(CSS.indexOf('v23926 — THE RIGHT COLUMN IS TWO PANELS'));
  for (const [tok, hex] of [['--plate-ok', '#34d399'], ['--plate-warn', '#fbbf24'], ['--plate-bad', '#fca5a5'], ['--plate-info', '#93c5fd']]) {
    assert.match(v26, new RegExp(reEsc(tok) + ':\\s*' + reEsc(hex) + ';'));
    assert.ok(RC2.RC2_B_WORDS.includes(hex.toUpperCase()), hex);
  }
});

test('the Your Aircraft title never turns amber or green, and never moves', () => {
  const pill = ruleFor('.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-title:is(.v2-fi-title-warn, .v2-fi-title-good)');
  assert.match(pill, /background: transparent !important;/);
  assert.match(pill, /box-shadow: none !important;/);
  assert.match(pill, /padding: 0 !important;/, 'the on-time title\'s padding (v23926), so nothing shifts');
  assert.match(pill, /border-radius: 0 !important;/);
  const words = ruleFor('.v2-fi-title:is(.v2-fi-title-warn, .v2-fi-title-good) *');
  assert.match(words, /color: #ffffff !important;\s*-webkit-text-fill-color: #ffffff !important;/);
  // The on-time title it must match (v23926).
  const v26 = CSS.slice(CSS.indexOf('v23926 — THE RIGHT COLUMN IS TWO PANELS')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(v26, /\.v2-fi-title:not\(\.v2-fi-title-warn\):not\(\.v2-fi-title-good\) \{\s*background: transparent !important;\s*padding: 0 !important;\s*border-radius: 0 !important;/);
});

test('a code on the lower panel is never a status colour; the left column keeps its accent', () => {
  // The real colour helpers, the real guard.
  const helpers = ['_ocColorParts', '_ocLum', '_ocCr', '_ocToHsl', '_ocFromHsl'].map(fnSource).join('\n');
  const make = (ground) => vm.runInNewContext(helpers + RC2_SRC + fnSource('_gateCodeInk') + '\n_gateCodeInk;', {
    window: {}, getComputedStyle: (el) => el._cs, _ocGroundOf: () => ground,
  });
  const code = (fill, onSheet) => {
    const css = {};
    return {
      css, dataset: {}, isConnected: true, parentElement: {},
      _cs: { color: fill, webkitTextFillColor: fill },
      getClientRects: () => [1],
      closest: (sel) => (onSheet && /v2-rc-shelf-fi/.test(sel) ? {} : null),
      style: { setProperty: (k, v) => { css[k] = v; }, removeProperty: (k) => { delete css[k]; } },
    };
  };
  const run = (ground, el) => make(ground)({ querySelectorAll: () => [el] });
  // Air Canada's red on its black: white.
  const ac = code('rgb(216, 47, 46)', true); run([11, 13, 16], ac);
  assert.equal(ac.css['-webkit-text-fill-color'], 'rgb(255, 255, 255)');
  assert.equal(ac.css.color, 'rgb(255, 255, 255)');
  // Flair's lime, mixed toward black by --airline-accent-ink, on Flair black: white.
  const f8 = code('color(srgb 0.31302 0.642353 0.389647)', true); run([28, 28, 28], f8);
  assert.equal(f8.css['-webkit-text-fill-color'], 'rgb(255, 255, 255)');
  // WestJet's teal on its navy: lifted for contrast, still teal.
  const ws = code('rgb(0, 178, 169)', true); run([0, 51, 102], ws);
  const wsFill = ws.css['-webkit-text-fill-color'];
  assert.ok(wsFill && wsFill !== 'rgb(255, 255, 255)', 'teal stays teal: ' + wsFill);
  const [r, g, b] = wsFill.match(/\d+/g).map(Number);
  assert.ok(g > r + 100 && b > r + 100, 'and teal: ' + wsFill);
  // A teal that already reads stays the board's own, untouched.
  const ok = code('rgb(0, 198, 188)', true); run([0, 51, 102], ok);
  assert.equal(ok.css['-webkit-text-fill-color'], undefined);
  // The left column: Air Canada's red stays red (the rule is the lower panel's only).
  const left = code('rgb(216, 47, 46)', false); run([247, 250, 253], left);
  assert.notEqual(left.css['-webkit-text-fill-color'], 'rgb(255, 255, 255)');
});

test('the accent pass applies the same rule to the code it paints', () => {
  const lime = [122, 255, 148];
  const run = (onSheet) => {
    const css = {}, attrs = {};
    const el = {
      css, previousElementSibling: null, parentElement: {},
      closest: (sel) => (onSheet && /v2-rc-shelf-fi/.test(sel) ? {} : null),
      getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = String(v); },
      style: { setProperty: (k, v) => { css[k] = v; } },
    };
    const fn = vm.runInNewContext(RC2_SRC + fnSource('applyCodeAccents') + '\napplyCodeAccents;', {
      window: {},
      document: { documentElement: { getAttribute: () => null }, querySelectorAll: () => [el] },
      getComputedStyle: () => ({ color: 'rgb(255,255,255)' }),
      _caScreenAccent: () => lime, _caBgBehind: () => [28, 28, 28], _caParse: () => [255, 255, 255], _caFit: () => lime,
    });
    fn();
    return css.color;
  };
  assert.equal(run(true), 'rgb(255,255,255)', 'Flair\'s lime is not written on the lower panel');
  assert.equal(run(false), 'rgb(122,255,148)', 'and is, as before, everywhere else');
});

test('an operator\'s mark with no half for a dark bar gets a white mount; the art is never recoloured', () => {
  const fix = fnSource('_opbyContrastFix');
  assert.match(fix, /var _mount = !!\(_rcG2 && !pair && dark && !\/white\|-light\|monochrome\/i\.test\(im\.getAttribute\('src'\) \|\| ''\)\);/);
  assert.match(fix, /im\.classList\.toggle\('v2-rc-opby-mount', _mount\)/);
  // Both branches still clear any filter: the art is drawn as published.
  assert.equal((fix.match(/im\.style\.setProperty\('filter', 'none', 'important'\);/g) || []).length, 2);
  const mount = ruleFor('img.v2-rc-opby-logo.v2-rc-opby-mount');
  assert.match(mount, /background: #ffffff !important;/);
  assert.doesNotMatch(mount, /filter/);
  // Jazz publishes no pair; PAL, Rouge and Encore do, and pick their half.
  const themed = CORE.slice(CORE.indexOf('var OPBY_WORDMARKS_THEMED = {'), CORE.indexOf('function _opbyContrastFix'));
  assert.doesNotMatch(themed, /'QK':/);
  for (const op of ['PB', 'RV', 'WR']) assert.match(themed, new RegExp("'" + op + "':\\s*\\{ onDark:"));
});

test('the caption stays one row and writes its states as classes', () => {
  assert.match(CORE, /\+ \(_acTypeVal && _acTypeVal\.indexOf\('v2-rc-acb-sep'\) !== -1 \? ' has-reg' : ''\)/);
  assert.match(CORE, /\+ \(_opByVal && \/\^\(PB\|PVL\|SP\|OO\|SKW\|WR\|WEN\)\$\/\.test\(String\(_opCode \|\| ''\)\.toUpperCase\(\)\) \? ' has-widemark' : ''\);/);
  // The wide-mark layout keys on those classes.
  assert.match(ruleFor('.v2-rc-acb-cap.has-widemark:not(.is-pending) .v2-rc-opby-val'), /width: calc\(var\(--acb-h\) \* 2\.1\) !important;/);
  assert.match(ruleFor('.v2-rc-acb-cap.has-widemark.has-reg:not(.is-pending) .v2-rc-acb-actype'), /padding-block: calc\(var\(--acb-h\) \* 0\.02\) !important;/);
  // A model alone may break at its own spaces, never inside a word.
  assert.match(ruleFor('.v2-rc-acb-actype > span:first-child:nth-last-child(-n+2)'), /white-space: normal !important;/);
  // The one-row grammar is v23904/v23926's: labels, model, then the operator,
  // French first in Québec.
  assert.match(CORE, /var _acLbl = _gateLbl\('aircraft', _frF8,/);
  assert.match(CORE, /var _opByLbl = _gateLbl\('operatedBy', _frF8,/);
  assert.doesNotMatch(CORE, /v2-rc-lp-banner|_rcBanner|_rcInboundShelf/, 'v23934\'s banner and sections are gone');
});
