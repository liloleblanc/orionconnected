'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE NAME OF THE AIRLINE ON THE BAND OF A GATE, NEVER CUT
//
// Where the band of a gate has no lettering of the airline (no file, or one
// that did not load), it types the name of the airline (.g8-r1-airline). The
// stylesheet set it at 48px in a 420px slot on one line and cut it with an
// ellipsis: CENTRAL MOUNTAIN AIR, 608px wide at 48px, read CENTRAL MOUNT at
// Quebec City, a severed name. It is now fitted as every other name on the
// boards (FIDS_FIT_RULES, fidsFitText): smaller, down to the floor, on its one
// line, and only where the floor is not enough, on two balanced lines; never
// cut.
//
// The header types the name in Possibility, a licensed face served from the
// store of the site and not kept in the repository, so the widths are measured
// on the real header (tests/fixtures/gate-header-names.json: gids at YQB, 1680
// by 1050, headless, each name typed and fitted by the board). This walks every
// airline name the header can show: every one is measured (a name added to the
// tables fails here until it is), and every one fits whole at 1680 by 1050.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const FC = path.join(ROOT, 'fids-current');
const JS = path.join(FC, 'js');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
const CSS = ['gate-display.css', 'display-overrides.css'].map((f) => fs.readFileSync(path.join(FC, 'css', f), 'utf8')).join('\n');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gate-header-names.json'), 'utf8'));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function board() {
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
    location: { search: '?ap=YQB', hostname: 'localhost', href: 'http://localhost/gids.html?ap=YQB', pathname: '/gids.html', origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    innerWidth: 1680, innerHeight: 1050,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['host-airport.js', 'board-strings.js', 'feed-router.js', 'fids-core.js', 'airport-coords.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('var __the = function (n) { return eval(n); };', ctx);
  return ctx;
}
const B = board();
const the = (n) => B.__the(n);

// every name the header can show: the gate types the name of the row (_airlineName, the name of the
// tables) in capitals, wherever its lettering is missing or did not load, and any can fail to load
const NAMES = [...new Set([...Object.values(the('AIRLINE_NAME')), ...Object.values(the('_AIRLINE_NAME_OVERRIDE'))]
  .map((n) => String(n || '').toUpperCase()).filter(Boolean))].sort();

test('the header builds the name of the row in capitals, and a missing lettering falls back to it', () => {
  assert.match(CORE, /const airlineName = \(currentFlight\._airlineName \|\| airlineCode \|\| ''\)\.toUpperCase\(\);/);
  assert.match(CORE, /r1LogoHtml = '<span class="g8-r1-airline">' \+ airlineName \+ '<\/span>';/);
  assert.ok(NAMES.length >= 230, NAMES.length + ' names');
  assert.ok(NAMES.includes('CENTRAL MOUNTAIN AIR') && NAMES.includes('AIR CREEBEC') && NAMES.includes('PASCAN AVIATION') && NAMES.includes('AIR SAINT-PIERRE'));
});

test('every airline name the header can show fits whole at 1680 by 1050: smaller to the floor, then two lines, never cut', () => {
  // every name is measured on the real header
  const missing = NAMES.filter((n) => !M.names[n]);
  assert.deepEqual(missing, [], 'names not measured on the header (run the measure again): ' + missing.join(', '));
  // the floor of the boards at 1680 by 1050: 1.3 hundredths of the short side, to the quarter pixel
  assert.equal(the('fidsFitFloor')(), 13.75);
  assert.equal(M.floor, 13.75);
  assert.equal(M.box, 420);
  // the slot of the name, as the stylesheet sizes it
  assert.match(CSS, /\.g8-r1-airline \{\n  font-size: clamp\(28px, 3vw, 48px\) !important;\n  line-height: 1 !important;\n  max-width: 420px !important;/);
  const cut = [], small = [];
  for (const n of NAMES) {
    const m = M.names[n];
    // one line: the size at which it is as wide as its slot (width goes with the size, tracking too)
    const one = Math.min(48, Math.floor(48 * M.box / m.w48 * 4) / 4);
    // as measured on the header, fitted by the board
    if (m.lines > 2 || m.px < M.floor) cut.push(n + ': ' + m.px + 'px on ' + m.lines + ' lines');
    if (m.lines === 1) {
      assert.ok(m.w48 * m.px / 48 <= M.box + 1, n + ': ' + (m.w48 * m.px / 48).toFixed(0) + 'px wide at ' + m.px + 'px in ' + M.box);
      assert.ok(Math.abs(m.px - one) <= 0.75, n + ': drawn at ' + m.px + 'px, its one line holds ' + one + 'px');
    }
    if (one < M.floor) small.push(n);
  }
  assert.deepEqual(cut, [], cut.join('\n'));
  // at 1680 by 1050 every name holds one line above the floor: none needs a second line
  assert.deepEqual(small, []);
  assert.deepEqual(NAMES.filter((n) => M.names[n].lines !== 1), []);
  // the names the old rule cut (wider than the slot at 48px): CENTRAL MOUNTAIN AIR among them, now whole
  const was = NAMES.filter((n) => M.names[n].w48 > M.box);
  assert.deepEqual(was, NAMES.filter((n) => M.names[n].cutBefore), 'the names cut before are the names wider than the slot');
  assert.ok(was.length >= 35, was.length + ' names were cut');
  assert.deepEqual([M.names['CENTRAL MOUNTAIN AIR'].w48, M.names['CENTRAL MOUNTAIN AIR'].px, M.names['CENTRAL MOUNTAIN AIR'].lines], [608, 33, 1]);
  for (const n of ['AIR SAINT-PIERRE', 'PASCAN AVIATION']) assert.ok(was.includes(n) && M.names[n].lines === 1 && M.names[n].px >= 40, n);
  assert.ok(!was.includes('AIR CREEBEC') && M.names['AIR CREEBEC'].px === 48, 'AIR CREEBEC keeps its size');
});

test('the name is fitted by the one fitter of the boards, on the render and when a lettering fails to load', () => {
  const rules = the('FIDS_FIT_RULES');
  const rule = rules.find((r) => r.sel === '.g8-r1 .g8-r1-airline');
  assert.ok(rule, 'a rule of the fitter for the name of the header');
  // two lines at most, a single line kept at any size the floor allows, in the band less its margins
  assert.equal(rule.lines, 2);
  assert.ok(rule.keep > 0 && rule.keep < 0.05, 'one line down to the floor first');
  assert.equal(rule.h({ closest: () => ({ clientHeight: 135 }) }), 135 * 0.82);
  // the plan of the fitter with that keep: one line wherever one line holds the floor, else two
  const plan = the('_fxPlan');
  const one = (w) => (px, wrap) => (wrap ? true : w * px / 48 <= 420);
  assert.deepEqual(JSON.parse(JSON.stringify(plan(48, 13.75, 2, false, false, one(608), -1, rule.keep))), { px: 33, wrap: false });
  assert.equal(plan(48, 13.75, 2, false, false, one(608), -1, 0.8).wrap, true, 'the house keep of 0.8 would have put it on two lines at 33 against 48');
  assert.equal(plan(48, 13.75, 2, false, false, one(3000), -1, rule.keep).wrap, true, 'two lines only past the floor');
  // the fitter writes what it decides inline, over the ellipsis of the stylesheet
  assert.match(the('fidsFitText').toString(), /st\.setProperty\('text-overflow', 'clip', 'important'\);/);
  // a name typed after a lettering did not load is fitted at once, by the same rule
  assert.match(the('g8LogoFail').toString(), /fidsFitText\(span, \{ lines: 2, keep: 0\.01, h: function \(el\) \{ var b = el\.closest\('\.g8-r1'\); return b \? b\.clientHeight \* 0\.82 : 0; \} \}\)/);
  assert.equal(rule.keep, 0.01);
  // two lines are balanced
  assert.match(CSS, /html body \.g8-wrap \.g8-r1 \.g8-r1-airline\.fx-wrap \{ text-wrap: balance; \}/);
});
