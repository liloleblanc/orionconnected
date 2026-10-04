'use strict';

// WHY THIS EXISTS
//
// v23940: the gate screen's lower right panel (the aircraft picture, its
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
const AT = CSS.indexOf("v23940 — THE LOWER RIGHT PANEL IN THE AIRLINE'S OWN TWO COLOURS");
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
  assert.ok(out.length, `no v23940 rule for ${tail}`);
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
  assert.ok(BLOCK.length > 0, 'the v23940 block exists');
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

// ── the operator's mark on the bar ──────────────────────────────────────────
// The tables and the picker, as the board runs them.
/** A top-level `var NAME = { ... };` table from fids-core.js, evaluated. */
function varTable(name) {
  const i = CORE.indexOf('var ' + name + ' = {');
  assert.ok(i >= 0, name + ' must exist');
  const j = CORE.indexOf('\n};', i);
  return vm.runInNewContext('(' + CORE.slice(CORE.indexOf('{', i), j + 2) + ')');
}
const OP_WORDMARK = varTable('OPERATOR_WORDMARKS');
const OP_LOGO = varTable('OPERATOR_LOGOS');
const OP_PAIR = varTable('OPBY_WORDMARKS_THEMED');
const ART_INK = varTable('OPBY_ART_INK');
const PICK = vm.runInNewContext(RC2_SRC + '\nvar OPBY_ART_INK = ' + JSON.stringify(ART_INK) + ';\n' + fnSource('_opbyBarPick') + '\n_opbyBarPick;', { window: {} });
const lumOf = (hex) => { const c = RC2._rc2Rgb(hex).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** The board's luma cut (_opbyContrastFix's `dark` before the bar's ink speaks): luma under 140. */
const lumaDarkOf = (hex) => { const [r, g, b] = RC2._rc2Rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140; };
/** What the board puts on a carrier's bar for an operator: { bar, art, mount }. */
function onBar(carrier, op) {
  const p = RC2._rc2Pair(carrier, TABLES);
  const dark = lumOf(p.ink) > lumOf(p.a);              // the bar's side, from its own ink
  const r = PICK(OP_PAIR[op], OP_WORDMARK[op] || OP_LOGO[op], p.a, dark, lumaDarkOf(p.a));
  return { bar: p.a, art: r.src, mount: r.mount };
}
// The two raster marks that reach a bar (GoJet and Envoy, no pair): their
// opaque pixels' colours, commonest first, measured from the files. The hash
// asks for a new measurement if a file changes.
const RASTER_INK = {
  '/logos/airlines/us-regional/Envoy.png': { sha256: 'c75f67e0eb8de39fe0f4e549f1ba7ca405e3b6f4fad2bc4d363d3a31ef65985d', ink: ['#282161', '#A41D30'] },
  '/logos/airlines/us-regional/gojet.png': { sha256: '337b6d3850cfb7fb9dd8858e8178b3de5768d3298d9c1aaafa3f545b027fb874', ink: ['#1165B2', '#231F20'] },
};
/** The colours a file draws its mark in, against the ground: OPBY_ART_INK or RASTER_INK. */
function inksOf(file) {
  if (ART_INK[file]) return ART_INK[file];
  if (RASTER_INK[file]) return RASTER_INK[file].ink;
  return null;
}
/**
 * Every colour an SVG file paints with, as #RRGGBB, resolved as a browser
 * does: a shape's own fill (attribute, style or class) or else its nearest
 * group's, and black when none says (Horizon's 'white' file draws its
 * lettering that way); its stroke; a gradient fill counts every stop; a
 * shape or group at opacity or fill-opacity 0 paints nothing; <defs> and the
 * like paint nothing by themselves.
 */
function svgColours(file) {
  const svg = fs.readFileSync(path.join(root, 'fids-current', file), 'utf8');
  const six = (h) => {
    h = String(h).trim().toLowerCase();
    h = { white: '#ffffff', black: '#000000' }[h] || h;
    if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(h)) return null;
    return '#' + (h.length === 4 ? h.slice(1).split('').map((c) => c + c).join('') : h.slice(1)).toUpperCase();
  };
  const cls = {};
  for (const st of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const r of st[1].matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      for (const sel of r[1].split(',')) { const m = /\.([\w-]+)\s*$/.exec(sel.trim()); if (m) cls[m[1]] = (cls[m[1]] || '') + ';' + r[2]; }
    }
  }
  const stops = {};
  for (const g of svg.matchAll(/<(?:linear|radial)Gradient\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:linear|radial)Gradient>/gi)) {
    stops[g[1]] = [...g[2].matchAll(/stop-color\s*[=:]\s*"?\s*(#[0-9a-f]{3,6}|white|black)/gi)].map((m) => six(m[1]));
  }
  const prop = (attrs, name) => {
    const own = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(attrs);
    const sty = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec((/style="([^"]*)"/.exec(attrs) || [])[1] || '');
    let fromCls = null;
    const c = /class="([^"]*)"/.exec(attrs);
    if (c) for (const k of c[1].split(/\s+/)) { const m = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec(cls[k] || ''); if (m) fromCls = m[1]; }
    return (sty && sty[1].trim()) || (fromCls && fromCls.trim()) || (own && own[1]) || null;
  };
  const SHAPE = /^(?:path|rect|circle|ellipse|polygon|polyline|line|text|tspan|use)$/i;
  const NOPAINT = /^(?:defs|clipPath|mask|linearGradient|radialGradient|pattern|symbol|style|title|desc|metadata)$/i;
  const out = new Set(), stack = [{ fill: '#000000', stroke: null, hidden: false, fillHidden: false }];
  let skip = 0;
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, attrs, self] = m;
    if (close) {
      if (skip) { if (NOPAINT.test(name)) skip--; continue; }
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (skip || NOPAINT.test(name)) { if (!self && NOPAINT.test(name)) skip++; continue; }
    const top = stack[stack.length - 1];
    const op = prop(attrs, 'opacity'), fop = prop(attrs, 'fill-opacity');
    const node = {
      fill: prop(attrs, 'fill') || top.fill, stroke: prop(attrs, 'stroke') || top.stroke,
      hidden: top.hidden || (op !== null && Number(op) === 0), fillHidden: top.fillHidden || (fop !== null && Number(fop) === 0),
    };
    if (SHAPE.test(name) && !node.hidden) {
      if (!node.fillHidden && node.fill !== 'none') {
        const u = /url\(#([^)]+)\)/.exec(node.fill);
        for (const h of (u ? (stops[u[1]] || []) : [six(node.fill)])) if (h) out.add(h);
      }
      if (node.stroke && node.stroke !== 'none' && six(node.stroke)) out.add(six(node.stroke));
    }
    if (!self) stack.push(node);
  }
  return out;
}
// Who flies for whom: the board's own table (_CS_REGIONAL_FAM: Jazz, Rouge
// and PAL for Air Canada, Encore for WestJet, the US regionals for their
// majors) and the contracts it lists under one carrier only (SkyWest flies
// for all four US majors, Republic for three, GoJet for two), each operator
// under its ICAO designator too, and Porter's affiliates.
const FLIES_FOR = (() => {
  const m = /var _CS_REGIONAL_FAM = (\{[^}]*\});/.exec(CORE);
  assert.ok(m, '_CS_REGIONAL_FAM must exist');
  const fam = vm.runInNewContext('(' + m[1] + ')');
  const out = {};
  const add = (carrier, op) => { (out[carrier] = out[carrier] || new Set()).add(op); };
  for (const [op, carrier] of Object.entries(fam)) add(carrier, op);
  [['DL', 'OO'], ['AA', 'OO'], ['AS', 'OO'], ['DL', 'YX'], ['AA', 'YX'], ['DL', 'G7'], ['PD', 'PTR']].forEach(([c, o]) => add(c, o));
  const ICAO = { QK: 'JZA', RV: 'ROU', PB: 'PVL', WR: 'WEN', MQ: 'ENY', OH: 'PSA', PT: 'PDT', '9E': 'EDV', OO: 'SKW', YV: 'ASH', G7: 'GJS', YX: 'RPA', QX: 'QXE' };
  for (const ops of Object.values(out)) for (const o of [...ops]) if (ICAO[o]) ops.add(ICAO[o]);
  return out;
})();

test('the colours on file for each mark are the colours its file draws', () => {
  // Every half of every pair is on file, and every art with no pair that
  // reaches a bar (below).
  for (const pr of Object.values(OP_PAIR)) for (const f of [pr.onDark, pr.onLight]) assert.ok(ART_INK[f], 'OPBY_ART_INK has ' + f);
  // Drawn INSIDE a mark, never meeting the ground: the white sliver over the
  // colour Encore leaf.
  const INSIDE = { '/logos/airlines/canadian/westjet-2025/WestJet-Encore-logo-colour.svg': ['#FFFFFF'] };
  for (const [file, inks] of Object.entries(ART_INK)) {
    const drawn = svgColours(file);
    for (const h of inks) {
      assert.match(h, /^#[0-9A-F]{6}$/, file);
      assert.ok(drawn.has(h), `${file} draws ${h}: ${[...drawn]}`);
    }
    for (const h of drawn) assert.ok(inks.includes(h) || (INSIDE[file] || []).includes(h), `${file} draws ${h}, which is not on file`);
  }
  // The white Encore file's teal copy of that sliver is drawn at fill-opacity 0: it paints nothing.
  assert.deepEqual([...svgColours('/logos/airlines/canadian/westjet-2025/WestJet-Encore-logo-white.svg')], ['#FFFFFE']);
  for (const [file, r] of Object.entries(RASTER_INK)) {
    const sha = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, 'fids-current', file))).digest('hex');
    assert.equal(sha, r.sha256, file + ' changed: measure its colours again');
  }
});

test('every operator that flies for a carrier reads on its bar: its half at 3:1, or on its white mount', () => {
  let seen = 0, mounted = [];
  for (const [carrier, ops] of Object.entries(FLIES_FOR)) {
    for (const op of ops) {
      if (!(OP_WORDMARK[op] || OP_LOGO[op])) continue;      // no mark on file: its name, in the bar's ink (4.5:1, above)
      const r = onBar(carrier, op), at = `${op} for ${carrier} on ${r.bar}: ${r.art}${r.mount ? ' (mounted)' : ''}`;
      const inks = inksOf(r.art);
      assert.ok(inks, 'the colours of every mark that reaches a bar are on file: ' + at);
      seen++;
      if (!r.mount) {
        for (const h of inks) assert.ok(RC2._rc2Contrast(h, r.bar) >= 3, `${h} at ${RC2._rc2Contrast(h, r.bar).toFixed(2)}:1 on the bar: ` + at);
        continue;
      }
      mounted.push(op + '/' + carrier);
      // On the mount: the art drawn for a light ground, on the white it was
      // drawn for, its lettering at 3:1 or better.
      const pair = OP_PAIR[op];
      if (pair) assert.equal(r.art, pair.onLight, 'the half drawn for a light ground: ' + at);
      else assert.doesNotMatch(r.art, /white|-light|monochrome/i, 'art drawn for a light ground: ' + at);
      assert.ok(RC2._rc2Contrast(inks[0], '#FFFFFF') >= 3, `lettering ${inks[0]} at ${RC2._rc2Contrast(inks[0], '#FFFFFF').toFixed(2)}:1 on the mount: ` + at);
    }
  }
  assert.ok(seen >= 40, `operators measured on their carriers' bars: ${seen}`);
  // The mounted ones, exactly: Jazz on Air Canada's red, Encore on WestJet's
  // teal, Porter's mark on PAL's blue, GoJet and Envoy on the US blues. Every
  // other operator's half reads on its carrier's bar as it is.
  assert.deepEqual(mounted.sort(), ['ENY/AA', 'G7/DL', 'G7/UA', 'GJS/DL', 'GJS/UA', 'JZA/AC', 'MQ/AA', 'QK/AC', 'SP/PB', 'WEN/WS', 'WR/WS']);
});

test('every paired operator, on every carrier\'s bar: its half at 3:1, or on its white mount', () => {
  // Wider than who flies for whom today: every bar the board can paint, so a
  // contract that changes never puts a half on a bar where it fails.
  const codes = new Set([...Object.keys(TABLES.accent), ...Object.keys(TABLES.brand), ...Object.keys(TABLES.colors), ...Object.keys(RC2.RC2_PAIRS), '']);
  for (const code of codes) {
    for (const op of Object.keys(OP_PAIR)) {
      const r = onBar(code, op), at = `${op} on ${code || '(none)'} ${r.bar}: ${r.art}`;
      const inks = ART_INK[r.art];
      if (r.mount) {
        assert.equal(r.art, OP_PAIR[op].onLight, at);
        assert.ok(RC2._rc2Contrast(inks[0], '#FFFFFF') >= 3, at);
      } else {
        for (const h of inks) assert.ok(RC2._rc2Contrast(h, r.bar) >= 3, `${h} ${RC2._rc2Contrast(h, r.bar).toFixed(2)}:1: ` + at);
      }
    }
  }
});

test('every mark on file, on every bar: as v23940 put it, but on the five bars that change side and where a colour on file is under 3:1', () => {
  // v23940's own decision, before the bar's ink gave the side: the luma cut;
  // a pair's half for that side, never mounted; a mark with no pair mounted
  // on a dark bar unless its file is drawn for one.
  const v23940 = (bar, op) => {
    const pair = OP_PAIR[op], src = OP_WORDMARK[op] || OP_LOGO[op], dark = lumaDarkOf(bar);
    return { art: pair ? (dark ? pair.onDark : pair.onLight) : src, mount: !pair && dark && !/white|-light|monochrome/i.test(src) };
  };
  // The colours a file draws: on file, or measured from the SVG itself.
  const drawn = (file) => inksOf(file) || (/\.svg$/i.test(file) ? [...svgColours(file)] : null);
  const under3 = (file, bar) => (ART_INK[file] || []).some((h) => RC2._rc2Contrast(h, bar) < 3);
  const codes = new Set([...Object.keys(TABLES.accent), ...Object.keys(TABLES.brand), ...Object.keys(TABLES.colors), ...Object.keys(RC2.RC2_PAIRS), 'WO', 'NK', 'Y9', 'SY', 'G4', 'ZZ', '']);
  const bars = new Map();
  for (const code of codes) { const p = RC2._rc2Pair(code, TABLES); if (!bars.has(p.a + p.ink)) bars.set(p.a + p.ink, { code, bar: p.a, ink: p.ink }); }
  assert.ok(bars.size >= 50, `the bars the board can paint: ${bars.size}`);
  // THE FIVE BARS THAT CHANGE SIDE: dark by the luma cut, light by their own
  // ink (navy or slate words). None goes the other way.
  const flips = [...bars.values()].filter((b) => lumaDarkOf(b.bar) !== (lumOf(b.ink) > lumOf(b.bar)));
  for (const b of flips) assert.ok(lumaDarkOf(b.bar) && lumOf(b.ink) < lumOf(b.bar), 'dark to light only: ' + b.bar);
  assert.deepEqual(flips.map((b) => b.bar).sort(), ['#008FD5', '#00A1DE', '#00A9CE', '#00B2A9', '#0EA5E9'],
    "WestJet's teal, Canadian North's, JetBlue's and KLM's, Asiana's and Copa's");
  const flipBars = new Set(flips.map((b) => b.bar));
  const ops = [...new Set([...Object.keys(OP_WORDMARK), ...Object.keys(OP_LOGO), ...Object.keys(OP_PAIR)])];
  let runs = 0, changed = 0;
  for (const { code, bar } of bars.values()) {
    for (const op of ops) {
      const was = v23940(bar, op), now = onBar(code, op), pair = OP_PAIR[op];
      const at = `${op} on ${code || '(none)'} ${bar}: ${was.art}${was.mount ? ' (mounted)' : ''} -> ${now.art}${now.mount ? ' (mounted)' : ''}`;
      runs++;
      if (!pair) {
        // A mark with no pair keeps its art and v23940's mount, on every bar;
        // one more mount only where a colour on file is under 3:1 there.
        assert.equal(now.art, was.art, 'its art: ' + at);
        assert.equal(now.mount, was.mount || under3(was.art, bar), 'its mount: ' + at);
      } else {
        // A pair's half changes side on the five bars only; the mount comes
        // only where that half has a colour under 3:1, with the half drawn
        // for a light ground on it.
        const half = flipBars.has(bar) ? pair.onLight : was.art;
        assert.equal(now.mount, under3(half, bar), 'its mount: ' + at);
        assert.equal(now.art, now.mount ? pair.onLight : half, 'its half: ' + at);
      }
      if (now.art === was.art && now.mount === was.mount) continue;
      changed++;
      // Whatever changes reads, measured from the file that now reaches the bar.
      const inks = drawn(now.art);
      assert.ok(inks && inks.length, 'its colours: ' + at);
      if (now.mount) {
        assert.doesNotMatch(now.art, /white|-light/i, 'drawn for the white of the mount: ' + at);
        assert.ok(RC2._rc2Contrast(inks[0], '#FFFFFF') >= 3, `lettering ${inks[0]} on the mount: ` + at);
      } else {
        for (const h of inks) assert.ok(RC2._rc2Contrast(h, bar) >= 3, `${h} ${RC2._rc2Contrast(h, bar).toFixed(2)}:1 on the bar: ` + at);
      }
    }
  }
  assert.ok(runs >= 2000, `marks on bars: ${runs}`);
  assert.ok(changed > 0, 'the five bars and the 3:1 mounts change something');
  // Why the luma side still mounts a mark with no pair: on the five bars these
  // marks, whose colours are not on file, would sit bare at under 3:1 (GoJet,
  // Envoy, Canadian North, First Air, Air North, Perimeter, Calm Air, Air
  // Inuit, Pascan). v23940 mounted them there, and they stay mounted.
  for (const b of flips) {
    for (const op of ['G7', 'GJS', 'MQ', 'ENY', '5T', '7F', '4N', 'YP', 'PAG', 'MO', 'CAV', '3H', 'AIE', 'BQ', 'PSC']) {
      const art = OP_WORDMARK[op] || OP_LOGO[op], bare = Math.min(...drawn(art).map((h) => RC2._rc2Contrast(h, b.bar)));
      assert.ok(bare < 3, `${op} bare on ${b.bar}: ${bare.toFixed(2)}`);
      assert.equal(onBar(b.code, op).mount, true, `${op} on ${b.code} ${b.bar} stays on its mount`);
    }
  }
});

test('Encore on WestJet\'s teal: neither half reads on the bar, so the colour half goes on its mount', () => {
  const teal = RC2._rc2Pair('WS', TABLES).a;
  const pr = OP_PAIR.WR;
  // Why: the white half is 2.64:1 on the teal, and the colour half's teal
  // lettering vanishes into it (its navy alone is 3.64:1).
  assert.ok(RC2._rc2Contrast('#FFFFFE', teal) < 3, 'white on teal: ' + RC2._rc2Contrast('#FFFFFE', teal).toFixed(2));
  assert.ok(RC2._rc2Contrast('#00AC9D', teal) < 1.1, 'teal on teal');
  // The luma cut the rest of the board uses calls this teal dark (139.5 < 140);
  // the bar's own ink, navy, says it is light.
  const [r, g, b] = RC2._rc2Rgb(teal);
  assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * b < 140);
  assert.ok(lumOf(RC2._rc2Pair('WS', TABLES).ink) < lumOf(teal));
  for (const op of ['WR', 'WEN']) {
    const got = onBar('WS', op);
    assert.equal(got.mount, true, op);
    assert.equal(got.art, pr.onLight, op + ': the colour half, drawn for white');
  }
  assert.ok(RC2._rc2Contrast('#00467F', '#FFFFFF') >= 9.5, 'its navy lettering on the mount: ' + RC2._rc2Contrast('#00467F', '#FFFFFF').toFixed(2));
  // Unchanged where a half reads: Rouge and PAL white on Air Canada's red,
  // the US regionals white on their majors' blues.
  for (const [c, op] of [['AC', 'RV'], ['AC', 'PB'], ['DL', '9E'], ['UA', 'OO'], ['AA', 'PT'], ['AS', 'QX'], ['UA', 'YV']]) {
    const got = onBar(c, op);
    assert.equal(got.mount, false, op + ' on ' + c);
    assert.equal(got.art, OP_PAIR[op].onDark, op + ' on ' + c);
  }
});

test('the operator\'s mark takes the bar\'s side from the bar\'s own ink; the art is never recoloured', () => {
  const fix = fnSource('_opbyContrastFix');
  // The side, on the lower bar: the bar's ink against the bar.
  assert.match(fix, /_rc2Rgb\(_csB\.getPropertyValue\('--rc2-a'\)\), _barK = _rc2Rgb\(_csB\.getPropertyValue\('--rc2-a-ink'\)\)/);
  assert.match(fix, /if \(_barA && _barK && _barA\.join\(','\) === _rcG2\.join\(','\)\) \{/);
  assert.match(fix, /dark = _Yb\(_barK\) > _Yb\(_barA\);/);
  // The luma cut's side is kept before the ink overrides it, for the mount of a mark with no pair.
  const keep = fix.indexOf('var _bar = null, _lumaDark = dark;');
  assert.ok(keep > 0 && keep < fix.indexOf('dark = _Yb(_barK) > _Yb(_barA);'), 'the luma side is read before the ink side replaces it');
  // The picker decides the art and the mount, on the lower panel only.
  assert.match(fix, /var _pick = _bar \? _opbyBarPick\(pair, im\.getAttribute\('src'\), _bar, dark, _lumaDark\) : null;/);
  assert.match(fix, /var _mount = !!\(_pick && _pick\.mount\);/);
  assert.match(fix, /im\.classList\.toggle\('v2-rc-opby-mount', _mount\)/);
  assert.match(fix, /var want = _pick \? _pick\.src : \(dark \? pair\.onDark : pair\.onLight\);/);
  // Both branches still clear any filter: the art is drawn as published.
  assert.equal((fix.match(/im\.style\.setProperty\('filter', 'none', 'important'\);/g) || []).length, 2);
  const pick = fnSource('_opbyBarPick');
  assert.match(pick, /var mount = !pair && !!\(dark \|\| lumaDark\) && !\/white\|-light\|monochrome\/i\.test\(art\);/, 'v23940\'s rule for a mark with no pair stands, on the luma cut\'s dark side too');
  assert.match(pick, /_rc2Contrast\(h, bar\) < 3/);
  assert.match(pick, /if \(mount && pair\) art = pair\.onLight;/);
  assert.doesNotMatch(pick + fix.slice(fix.indexOf('v23940 — ON THE LOWER PANEL'), fix.indexOf('v23332 — INLINE !important')), /brightness|invert\(|hue-rotate|grayscale/, 'no filter, no recolour');
  // The mount: white, no filter.
  const mount = ruleFor('img.v2-rc-opby-logo.v2-rc-opby-mount');
  assert.match(mount, /background: #ffffff !important;/);
  assert.doesNotMatch(mount, /filter/);
  // Jazz publishes no pair; PAL, Rouge and Encore do.
  const themed = CORE.slice(CORE.indexOf('var OPBY_WORDMARKS_THEMED = {'), CORE.indexOf('var OPBY_ART_INK = {'));
  assert.doesNotMatch(themed, /'QK':/);
  for (const op of ['PB', 'RV', 'WR']) assert.match(themed, new RegExp("'" + op + "':\\s*\\{ onDark:"));
});

test('the bars between the caption\'s words hold 3:1 on every bar, and stay lighter than the words', () => {
  const body = ruleFor('.v2-rc-acb-cap :is(.v2-rc-acb-sep, .v2-rc-fi-sep)');
  const m = /opacity: ([\d.]+) !important;/.exec(body);
  assert.ok(m, 'the separators carry an opacity');
  const op = Number(m[1]);
  assert.ok(op < 1, 'lighter than the words, which are at full strength');
  const codes = new Set([...Object.keys(TABLES.accent), ...Object.keys(TABLES.brand), ...Object.keys(TABLES.colors), ...Object.keys(RC2.RC2_PAIRS), 'WO', 'NK', 'Y9', 'SY', 'G4', 'ZZ', '']);
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  let least = Infinity, at = '';
  for (const code of codes) {
    const p = RC2._rc2Pair(code, TABLES);
    const ink = RC2._rc2Rgb(p.ink), bar = RC2._rc2Rgb(p.a);
    const sep = hex(ink.map((v, i) => v * op + bar[i] * (1 - op)));
    const cr = RC2._rc2Contrast(sep, p.a);
    if (cr < least) { least = cr; at = `${code} ${p.a}`; }
    assert.ok(cr >= 3, `${code}: the separator ${sep} on ${p.a} is ${cr.toFixed(2)}:1`);
    assert.ok(cr < RC2._rc2Contrast(p.ink, p.a), code + ': quieter than the words');
  }
  assert.ok(least >= 3, `least ${least.toFixed(2)} on ${at}`);
  // WestJet's teal, where 0.6 was 2.67:1.
  const ws = RC2._rc2Pair('WS', TABLES);
  const wsSep = hex(RC2._rc2Rgb(ws.ink).map((v, i) => v * op + RC2._rc2Rgb(ws.a)[i] * (1 - op)));
  assert.ok(RC2._rc2Contrast(wsSep, ws.a) >= 3.8, 'WestJet: ' + RC2._rc2Contrast(wsSep, ws.a).toFixed(2));
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

test('an inbound line draws an accented capital whole: the lines and their row do not clip', () => {
  // v23926's 1.04 leading under overflow:hidden cut the top of 'Î' flat at the
  // line's box (27px of type over a 23px line at 1680x1050). v23934 fixed it;
  // the fix outlives that design.
  for (const tail of [
    '> .v2-rc-shelf-fi .v2-fi-row',
    '> .v2-rc-shelf-fi .v2-fi-textcol',
    '> .v2-rc-shelf-fi .v2-fi-value > :is(.v2-fi-mline1, .v2-fi-mline2, .v2-fi-mline3)',
  ]) {
    const body = ruleFor(tail);
    assert.match(body, /overflow: visible !important;/, tail + ' must not clip its own type');
    assert.match(body, /text-overflow: clip !important;/, tail + ' takes no ellipsis');
  }
  // The rule outweighs the rules that clip: the v23246 line rule and
  // gate-display.css's row and text column.
  const mlineClip = CSS.indexOf('.g8-wrap .gad-map-col-v2 .v2-fi-mline1 {');
  assert.ok(mlineClip > 0 && mlineClip < AT, 'the old clipping rule on the line comes before the block');
  assert.match(GATE, /\.v2-fi-row \.v2-fi-textcol \{[^}]*overflow: hidden !important;/);
  // Nothing spills instead: the fitter still holds every line inside the
  // card's width, and the panel still clips at its own edge.
  assert.match(CORE, /for \(var _fit = 0; _fit < 3; _fit\+\+\) \{\s*var _over = 1;\s*lines\.forEach\(function \(ln\) \{ var w = _measure\(ln\); if \(w > availW\) _over = Math\.max\(_over, w \/ availW\); \}\);/);
  const panel = CSS.slice(CSS.indexOf('v23926 — THE RIGHT COLUMN IS TWO PANELS'), AT);
  const shelfRule = rules(panel.replace(/\/\*[\s\S]*?\*\//g, ''))
    .filter((r) => r.sels.some((s) => s.endsWith('.gad-map-col-v2 > .v2-rc-shelf-fi')))
    .map((r) => r.body).join('\n');
  assert.match(shelfRule, /overflow: hidden !important;/, 'the panel clips at its edge');
  // The board's own names that need it, French first at YQB and YUL.
  assert.match(CORE, new RegExp(reEsc("YGR:'ÎLES-DE-LA-MADELEINE'")));
  assert.match(CORE, new RegExp(reEsc("EDI:'ÉDIMBOURG'")));
});
