'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// GATE / PORTE STAYS INSIDE THE GATE PANEL ON EVERY LAYOUT.
//
// Seen live on v24045 (Moncton gates 1 and 4, and on v24043 before it): on
// the countdown, Now Boarding, Final call and Gate closed layouts the top of
// "Gate" was cut off at the top of the screen.
//
// The label's size is written for the IDLE panel (138px tall at 1920x1080: a
// two-line stack of 2 x 58.3px x 1.06 = 124px). A takeover pins the same panel
// to 110px. The numeral is height-fitted by gateAutofit; the label was fitted
// to width only, so it kept its 124px stack in the 110px box, centred, 7px
// over each edge, and the top edge is the top of the screen.
//
// These pin the three halves of the fix: the idle size is unchanged, the
// takeover has its own size that fits the takeover panel at every board size,
// and the fitter keeps the stack inside the panel's measured height whatever
// the words or the face.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'fids-current');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'display-overrides.css'), 'utf8');
const GATE_CSS = fs.readFileSync(path.join(ROOT, 'css', 'gate-display.css'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'fids-core.js'), 'utf8');

const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const BOOST = (n) => 'html body' + ':not(#_)'.repeat(n) + ' ';
const IDLE_SEL = BOOST(52) + '.g8-wrap .g8-r1-right .g8-bilbl';
const TAKE_SEL = BOOST(52) + '.g8-wrap.g8-takeover .g8-r1-right .g8-bilbl';

/** Declarations of the rule(s) whose selector list holds exactly `sel`. */
function decls(rules, sel) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(rules))) {
    if (m[1].split(',').map((s) => s.trim()).includes(sel)) out.push(m[2]);
  }
  return out;
}
function prop(body, name) {
  const m = new RegExp('(?:^|[;\\s])' + name + '\\s*:\\s*([^;!]+?)\\s*(?:!important)?\\s*(?:;|$)').exec(body);
  return m ? m[1].trim() : null;
}

/** Evaluate a CSS length made of px / vh / vw, min(), max(), clamp(). */
function evalLen(expr, vw, vh) {
  let i = 0;
  const s = expr.replace(/\s+/g, ' ').trim();
  const ws = () => { while (s[i] === ' ') i++; };
  function value() {
    ws();
    const fn = /^(min|max|clamp)\(/.exec(s.slice(i));
    if (fn) {
      i += fn[0].length;
      const args = [];
      for (;;) {
        args.push(value()); ws();
        if (s[i] === ',') { i++; continue; }
        assert.equal(s[i], ')', 'unbalanced ' + expr); i++;
        break;
      }
      if (fn[1] === 'min') return Math.min(...args);
      if (fn[1] === 'max') return Math.max(...args);
      assert.equal(args.length, 3, 'clamp takes three: ' + expr);
      return Math.max(args[0], Math.min(args[1], args[2]));
    }
    const n = /^(-?\d*\.?\d+)(px|vh|vw)/.exec(s.slice(i));
    assert.ok(n, 'unsupported length at "' + s.slice(i) + '" in ' + expr);
    i += n[0].length;
    const v = parseFloat(n[1]);
    return n[2] === 'px' ? v : n[2] === 'vh' ? v * vh / 100 : v * vw / 100;
  }
  const v = value(); ws();
  assert.equal(i, s.length, 'trailing text in ' + expr);
  return v;
}

const BOARDS = [[1920, 1080], [1680, 1050], [1366, 768], [1280, 720], [1920, 1200], [2560, 1440], [3840, 2160]];

function idleRule() {
  const all = decls(RULES, IDLE_SEL).filter((d) => prop(d, 'font-size'));
  assert.ok(all.length, 'the idle Gate/Porte size rule must exist');
  return all[all.length - 1];
}
function takeoverRule() {
  const all = decls(RULES, TAKE_SEL).filter((d) => prop(d, 'font-size'));
  assert.equal(all.length, 1, 'exactly one takeover size rule for Gate/Porte');
  return all[0];
}
function takeoverPanelHeight() {
  const all = decls(RULES, 'html body .g8-wrap.g8-takeover .g8-r1-right').filter((d) => prop(d, 'height'));
  assert.ok(all.length, 'the takeover pins the gate panel height');
  const h = prop(all[all.length - 1], 'height');
  assert.match(h, /^\d+px$/, 'the takeover panel is a fixed height: ' + h);
  return parseFloat(h);
}

test('the idle layout keeps its size: the idle rule is exactly what it was', () => {
  const body = idleRule();
  assert.equal(prop(body, 'font-size'), 'clamp(34px, min(5.4vh, 3.05vw), 62px)',
    'the idle Gate/Porte size is the measured v23730 placement — level with the numeral; do not move it');
  assert.equal(prop(body, 'line-height'), '1.06');
  // The takeover rule sets the size and nothing else, so it cannot reach the
  // idle panel (its selector needs .g8-takeover) or move the label's placement.
  const take = takeoverRule().split(';').map((d) => d.trim()).filter(Boolean);
  assert.deepEqual(take.map((d) => d.split(':')[0].trim()), ['font-size'],
    'the takeover rule changes the label size only');
});

test('on every takeover layout the two-line label fits the takeover panel, with the numeral\'s air', () => {
  const take = prop(takeoverRule(), 'font-size');
  const lh = parseFloat(prop(idleRule(), 'line-height'));
  const panel = takeoverPanelHeight();
  for (const [vw, vh] of BOARDS) {
    const px = evalLen(take, vw, vh);
    const stack = 2 * lh * px;
    // The numeral sits 6px in from each edge of the 110px panel; the label
    // lines up with it rather than running wall to wall.
    assert.ok(stack <= panel - 12 + 0.5,
      `${vw}x${vh}: Gate/Porte stack ${stack.toFixed(1)}px in a ${panel}px takeover panel — it hangs off the top of the screen`);
    assert.ok(px >= 30, `${vw}x${vh}: the label stays readable (${px.toFixed(1)}px)`);
  }
});

test('the takeover size only ever comes down from the idle size, and only where it has to', () => {
  const idle = prop(idleRule(), 'font-size');
  const take = prop(takeoverRule(), 'font-size');
  const lh = parseFloat(prop(idleRule(), 'line-height'));
  const panel = takeoverPanelHeight();
  for (const [vw, vh] of BOARDS) {
    const a = evalLen(idle, vw, vh), b = evalLen(take, vw, vh);
    assert.ok(b <= a + 1e-9, `${vw}x${vh}: the takeover never sets the label larger than idle`);
    if (2 * lh * a <= panel - 12) assert.equal(b, a, `${vw}x${vh}: where the idle size already fits, it is kept`);
  }
  // 1366x768: the idle size already fits the takeover panel and is not touched.
  assert.equal(evalLen(take, 1366, 768), evalLen(idle, 1366, 768));
});

test('the takeover rule outranks every other Gate/Porte size, and sits before the weather-card block', () => {
  const at = CSS.indexOf(TAKE_SEL + ' {');
  assert.ok(at > 0, 'the takeover rule is in display-overrides.css');
  const wx = CSS.indexOf("/* ══ v24014 — THE WEATHER CARD IN THE AIRLINE'S COLOURS");
  assert.ok(wx > at, 'the v24014 weather-card block stays last');
  // Any other rule sizing the gate label: none may carry a longer booster than
  // the takeover rule's (52 plus the .g8-takeover class), or it would win.
  for (const [name, text] of [['display-overrides.css', RULES], ['gate-display.css', GATE_CSS.replace(/\/\*[\s\S]*?\*\//g, '')]]) {
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text))) {
      if (!prop(m[2], 'font-size')) continue;
      for (const sel of m[1].split(',').map((s) => s.trim())) {
        if (!/\.g8-r1-right\s*>?\s*\.g8-bilbl$/.test(sel) || sel === TAKE_SEL) continue;
        const n = (sel.match(/:not\(#_\)/g) || []).length;
        assert.ok(n <= 52, `${name}: a Gate/Porte size rule with ${n} boosters would beat the takeover rule: ${sel.slice(-60)}`);
      }
    }
  }
});

// ── The fitter: the label pass keeps the stack inside the measured panel ──

function labelPass() {
  const at = SRC.indexOf("root.querySelectorAll('.g8-r1-right').forEach(function (box) {");
  assert.ok(at >= 0, 'the gate-header fitter must exist');
  const body = SRC.slice(at, SRC.indexOf('\n    });', at));
  const b0 = body.indexOf('if (bil) {');
  assert.ok(b0 >= 0, 'the fitter has a label pass');
  let d = 0, end = -1;
  for (let k = body.indexOf('{', b0); k < body.length; k++) {
    if (body[k] === '{') d++;
    else if (body[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  return body.slice(b0, end);
}

/** Run the label pass on a model label: two lines, line-height 1.06. */
function runPass({ boxH, cssPx, widthPerPx = 2.6, w = 352, numW = 34 }) {
  let inline = null;
  const px = () => (inline != null ? inline : cssPx);
  const bil = {
    style: {
      removeProperty() { inline = null; },
      setProperty(p, v) { assert.equal(p, 'font-size'); inline = parseFloat(v); },
    },
    getBoundingClientRect() { return { width: px() * widthPerPx, height: 2 * 1.06 * px() }; },
  };
  const box = { clientHeight: boxH };
  const num = { getBoundingClientRect() { return { width: numW }; } };
  const win = { getComputedStyle() { return { fontSize: px() + 'px' }; } };
  new Function('bil', 'box', 'num', 'w', 'window', labelPass())(bil, box, num, w, win);
  return { inline, height: 2 * 1.06 * px() };
}

test('the label pass measures the panel height, not only its width', () => {
  const pass = labelPass();
  assert.match(pass, /box\.clientHeight/, 'the label is measured against the panel it is centred in');
  assert.match(pass, /\.height > _bilAvailH/, 'and its stack height is part of the fit');
});

test('a label taller than the panel is brought inside it (the v24045 takeover, before the stylesheet size)', () => {
  const r = runPass({ boxH: 110, cssPx: 58.32 });
  assert.ok(r.inline != null, 'the pass must shrink a 124px stack in a 110px panel');
  assert.ok(r.height <= 110 - 4, `stack ${r.height.toFixed(1)}px must sit inside the 110px panel`);
  assert.ok(r.inline > 14, 'and stays above the floor');
});

test('a label that already fits is left exactly as the stylesheet set it (the idle panel)', () => {
  // 1920x1080 idle: 124px stack in a 138px panel. 1680x1050: 109 in 135. 1366x768: 88 in 108.
  for (const [boxH, cssPx] of [[138, 58.32], [135, 51.24], [108, 41.472]]) {
    const r = runPass({ boxH, cssPx });
    assert.equal(r.inline, null, `${cssPx}px in a ${boxH}px panel already fits — no inline write`);
  }
  // and the takeover size the stylesheet now sets fits the 110px panel as is
  assert.equal(runPass({ boxH: 110, cssPx: 46 }).inline, null);
});

test('width still governs where the words are wide (fr-first Porte | Gate, three-character gates)', () => {
  const r = runPass({ boxH: 138, cssPx: 58.32, widthPerPx: 3.2, w: 352, numW: 172 });
  assert.ok(r.inline != null && r.inline * 3.2 <= 352 - (172 + 16), 'the width fit still applies');
});
