'use strict';
// WHY THIS EXISTS
//
// v24188. THE GATE IS DRAWN AT ITS FINAL GEOMETRY, AND A REBUILD ASKED FOR BY THE
// WAKE IS DRAWN WHILE THE BOARD IS STILL UNSEEN.
// Reported: on the rotation switch the logos move left to right as a board first
// comes up. Two of the ways on the gate:
//   1. The time tab (with the airport mark in it) and the gate tab are placed by
//      --gate-rcw, the measured width of the right column. Until _alignGateWm first
//      wrote it, 60 ms after a rebuild, both stood on its fallback, 25%, while the
//      column is 23% of the band (gate-display.css): on a first paint in view they
//      jumped right by about 2% of the band. Now _alignGateWm runs in the task that
//      drew the gate, before it is painted, and every fallback is the 23% itself.
//   2. The wake catch-up of a board the rotator is about to show (v24186) runs the
//      clock check of the gate, which asks for a rebuild when a stage, a countdown
//      or the Later list came due while hidden. The ask is batched for 800 ms, which
//      is the fade-out and the rest on black exactly, so the whole gate was rebuilt
//      as it began to fade in. Now jobs registered with _ocAfterShow run after every
//      onShow job of a wake, and one of them draws a pending gate rebuild at once.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FC = path.resolve(__dirname, '..', 'fids-current');
const CORE = fs.readFileSync(path.join(FC, 'js', 'fids-core.js'), 'utf8');
const GATE_CSS = fs.readFileSync(path.join(FC, 'css', 'gate-display.css'), 'utf8');
const OVR_CSS = fs.readFileSync(path.join(FC, 'css', 'display-overrides.css'), 'utf8');

function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(i, j + 1);
}

// ── 1. the tabs ───────────────────────────────────────────────────────────────
test('the right column is measured in the task that drew the gate, before it is painted', () => {
  const rds = fnSource(CORE, 'renderDedicatedScreen');
  const drawn = rds.indexOf('gView.innerHTML = uxgGateHtml(');
  const defined = rds.indexOf('window._alignGateWm = function(){');
  const now = rds.indexOf('\n          window._alignGateWm();\n');
  const t60 = rds.indexOf('setTimeout(window._alignGateWm, 60);');
  const t600 = rds.indexOf('setTimeout(window._alignGateWm, 600);');
  assert.ok(drawn > 0 && defined > drawn && now > defined && t60 > now && t600 > t60,
    'drawn, then defined (first time), then called at once, then the two timers kept as backstops');
  // nothing between the drawing and the call hands it to a later task
  assert.doesNotMatch(rds.slice(drawn, now), /\bawait\b|\.then\(|requestAnimationFrame\(/);
  // and what it writes: the measured column, on the root, where the tabs read it
  const fnText = rds.slice(defined, rds.indexOf('// v23166 — SKIP WHILE THIS BOARD IS OFF SCREEN', defined));
  assert.match(fnText, /var _rcw = Math\.round\(_wmCol\.getBoundingClientRect\(\)\.width\);/);
  assert.match(fnText, /document\.documentElement\.style\.setProperty\('--gate-rcw', _rcw \+ 'px'\);/);
});

test('the measure, run against a drawn gate, writes the column width the tabs stand on', () => {
  const rds = fnSource(CORE, 'renderDedicatedScreen');
  const a = rds.indexOf('window._alignGateWm = function(){');
  const b = rds.indexOf('// v23166 — SKIP WHILE THIS BOARD IS OFF SCREEN', a);
  const props = {};
  const col = { style: { getPropertyValue: () => '', setProperty() {} }, querySelector: () => null, getBoundingClientRect: () => ({ width: 441.6 }) };
  const ctx = {
    window: {},
    document: {
      querySelector: (s) => (s === '.gad-map-col-v2' ? col : null),
      documentElement: { style: { getPropertyValue: (k) => props[k] || '', setProperty: (k, v) => { props[k] = v; } } },
    },
  };
  vm.runInNewContext(rds.slice(a, b), ctx);
  ctx.window._alignGateWm();
  assert.equal(props['--gate-rcw'], '442px', '23% of 1920');
});

test('every fallback of --gate-rcw is the basis of the right column itself', () => {
  // the basis: the last word of gate-display.css on the column (it outranks the inline 25% and the older rule)
  const rules = [...GATE_CSS.matchAll(/^\.gad-map-col-v2\s*\{\s*flex:\s*0 0 ([^;!]+?)\s*!important;/gm)].map((m) => m[1]);
  assert.ok(rules.length >= 2, 'the column rules: ' + rules.join(', '));
  const basis = rules[rules.length - 1];
  assert.equal(basis, '23%');
  const uses = [];
  for (const [name, text] of [['fids-core.js', CORE], ['gate-display.css', GATE_CSS], ['display-overrides.css', OVR_CSS]]) {
    for (const m of text.matchAll(/var\(--gate-rcw,\s*([^)]+)\)/g)) uses.push(name + ': ' + m[1]);
  }
  assert.ok(uses.length >= 10, uses.length + ' fallbacks');
  assert.deepEqual(uses.filter((u) => !u.endsWith(': ' + basis)), [], 'a fallback that is not the column');
  // the tabs themselves: the time tab (both bands) and the gate tab
  assert.match(CORE, /class="g8-r1-timebox g8-r1-timebox-silk octb-wrap octb-attached" style="position:absolute;top:0;right:var\(--gate-rcw, 23%\);/);
  assert.match(CORE, /class="g8-r1-right" style="position:absolute !important;top:0 !important;right:0 !important;bottom:0 !important;width:var\(--gate-rcw, 23%\) !important;/);
});

// ── 2. the rebuild at the wake ────────────────────────────────────────────────
function brake() {
  const s = CORE.lastIndexOf('(function () {', CORE.indexOf('window._ocIdle = function'));
  let depth = 0, j = CORE.indexOf('{', s);
  for (; j < CORE.length; j++) { if (CORE[j] === '{') depth++; else if (CORE[j] === '}' && --depth === 0) break; }
  return CORE.slice(s, j + 1) + ')();';
}
const REG = "try { if (typeof window !== 'undefined' && typeof window._ocAfterShow === 'function') window._ocAfterShow(_gateRebuildOnWake); } catch (e) {}";
function batch() {
  const from = CORE.indexOf('var _gateKeyResetTimer = null;');
  const to = CORE.indexOf(REG);
  assert.ok(from > 0 && to > from, 'the batch, the wake flush and its registration, in that order');
  return CORE.slice(from, to + REG.length);
}

test('the brake runs the after-show jobs once every catch-up job has run, on a real wake only', () => {
  let handler = null;
  const log = [];
  const win = { addEventListener: (t, fn) => { if (t === 'message') handler = fn; } };
  vm.runInNewContext(brake(), { window: win, setInterval() { return 0; } });
  assert.equal(typeof win._ocAfterShow, 'function');
  win._ocAfterShow(() => log.push('after'));
  win._ocOnShow(() => log.push('show 1'));
  win._ocEvery(() => log.push('show 2'), 1000);
  handler({ data: { oc: 'inactive' } });
  assert.deepEqual(log, [], 'nothing when it goes off screen');
  handler({ data: { oc: 'active' } });
  assert.deepEqual(log, ['show 1', 'show 2', 'after'], 'after every onShow job, even one registered after it');
  handler({ data: { oc: 'active' } });
  assert.deepEqual(log, ['show 1', 'show 2', 'after'], 'the repeat that showNow sends does nothing');
});

function gate(screenType) {
  const timers = new Map();
  let id = 0, paints = 0;
  const ctx = {
    window: {}, screenType, Date,
    setTimeout: (f, ms) => { timers.set(++id, { f, ms }); return id; },
    clearTimeout: (i) => { timers.delete(i); },
    setInterval() { return 0; },
    renderDedicatedScreen: () => { paints++; },
  };
  ctx.window.addEventListener = (t, fn) => { if (t === 'message') ctx.handler = fn; };
  vm.createContext(ctx);
  vm.runInContext(brake(), ctx);          // the brake first, as at the top of fids-core.js
  vm.runInContext(batch() + '\nthis.request = requestGateRebuild; this.flush = _gateRebuildOnWake;', ctx);
  return { ctx, timers, get paints() { return paints; }, runTimers: () => { for (const [k, t] of [...timers]) { timers.delete(k); t.f(); } } };
}

test('a gate rebuild the wake asked for is drawn in the wake, while the board is still unseen', () => {
  const g = gate('gate');
  g.ctx.window._ocEvery(() => g.ctx.request(), 1000);     // the clock check of the gate, an onShow job
  g.ctx.handler({ data: { oc: 'inactive' } });
  g.ctx.handler({ data: { oc: 'active' } });               // advance(): told it is next, at the fade-out
  assert.equal(g.paints, 1, 'drawn in the same task as the wake, 800 ms before the fade-in');
  assert.equal(g.timers.size, 0, 'and the batch timer is gone');
  g.runTimers();
  assert.equal(g.paints, 1, 'not drawn a second time at the fade-in');
  assert.equal(g.ctx.window._lastGateKey, '', 'the keys are reset as the batch resets them');
});

test('the flush draws only what is pending, and only on a gate screen', () => {
  const g = gate('gate');
  assert.equal(g.ctx.flush(), false, 'nothing pending: nothing drawn');
  assert.equal(g.paints, 0);
  g.ctx.request();
  assert.equal(g.ctx.flush(), true);
  assert.equal(g.paints, 1);
  // a departures or bags board: the batch only clears the keys there, and its timer is left to it
  const m = gate('main');
  m.ctx.request();
  assert.equal(m.ctx.flush(), false);
  assert.equal(m.paints, 0);
  assert.equal(m.timers.size, 1, 'the batch still pending');
  // a request after the wake arms its own batch, as before
  const later = gate('gate');
  later.ctx.handler({ data: { oc: 'inactive' } });
  later.ctx.handler({ data: { oc: 'active' } });
  assert.equal(later.paints, 0);
  later.ctx.request();
  assert.equal(later.timers.size, 1);
  later.runTimers();
  assert.equal(later.paints, 1);
});
