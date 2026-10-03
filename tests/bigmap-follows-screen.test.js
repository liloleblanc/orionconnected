'use strict';

// WHY THIS EXISTS
//
// The gate screen's big map (the "Your Aircraft" takeover, .bigcraft-overlay
// with #bigCraftMap inside) is an overlay on .g8-wrap, not a child of the
// frosted window's screen (#gateAdCarousel, v23929). Its box is written in
// pixels from the screen's rectangle. Until v23936 that was done ONCE, when the
// overlay mounted, and nothing wrote it again.
//
// Seen live at 1680x1050 on YQM gates 1 and 3 (v23929 and v23935): the map ran
// x 416-1263, y 155-933 over a screen at x 419-1261, y 169-1018, leaving a dark
// band about 85 px tall under it. Reproduced exactly in headless Chrome by
// laying the board out at 1680x963 and then showing it at 1680x1050: the
// overlay kept the 1680x963 screen's rectangle. A board that loads before its
// window reaches full size, or a review pane resized after load, does that.
// Nothing that runs during the slide's dwell is sure to redraw it; in the
// reproduction it stayed wrong until the slide ended.
//
// The fix: the overlay FOLLOWS the screen for as long as it is up
// (_bigCraftFollowScreen). It is re-measured when the screen or the board
// changes size (ResizeObserver), on a window resize, and once a second as a
// backstop, and every change re-sizes Leaflet in the same pass. Measured on the
// branch after resizing a board that was laid out at another size: the map's
// rectangle equals the screen's to the pixel at 1680x1050, 1920x1080, 1280x720
// and 1080x1920, on WestJet, Porter and Air Canada, by day and at night, and
// when the map arrives by the rotation and the window changes size during its
// grow-in.
//
// These tests run the two functions themselves against a stub page, and pin
// where they are called from.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');

/** A top-level `function name(...)` in fids-core.js, up to the next top-level
 *  function (its closing brace is the last column-0 brace before that). */
function fnSource(name) {
  const at = CORE.indexOf('\nfunction ' + name + '(');
  assert.ok(at >= 0, `fids-core.js has no function ${name}`);
  const next = CORE.indexOf('\nfunction ', at + 1);
  const seg = CORE.slice(at + 1, next > at ? next : undefined);
  const end = seg.lastIndexOf('\n}');
  assert.ok(end > 0, `no closing brace for ${name}`);
  return seg.slice(0, end + 2);
}

/** A stub page: a board (.g8-wrap) holding the screen and the overlay. */
function page({ screen, host = [0, 0, 1680, 1050] }) {
  const rect = (r) => ({ left: r[0], top: r[1], right: r[2], bottom: r[3], width: r[2] - r[0], height: r[3] - r[1] });
  const state = { screen, host, resized: [], healed: 0, observers: [], intervals: [], listeners: {} };
  const scr = { getBoundingClientRect: () => rect(state.screen) };
  const hostEl = { clientLeft: 0, clientTop: 0, getBoundingClientRect: () => rect(state.host) };
  const mapEl = {};
  const ov = { isConnected: true, parentNode: hostEl, style: {}, contains: (n) => n === mapEl };
  const win = {
    _bigCraftTimers: [],
    _bigCraftMap: { getContainer: () => mapEl, invalidateSize: (o) => state.resized.push(o) },
    addEventListener: (t, f) => { (state.listeners[t] = state.listeners[t] || []).push(f); },
    removeEventListener: (t, f) => { state.listeners[t] = (state.listeners[t] || []).filter((g) => g !== f); },
  };
  class RO {
    constructor(cb) { this.cb = cb; this.els = []; this.live = true; state.observers.push(this); }
    observe(el) { this.els.push(el); }
    disconnect() { this.live = false; this.els = []; }
  }
  const ctx = {
    window: win,
    document: { getElementById: (id) => (id === 'gateAdCarousel' && state.screen ? scr : null) },
    ResizeObserver: RO,
    setInterval: (f, ms) => { state.intervals.push({ f, ms }); return state.intervals.length; },
    _mapHealRenderer: () => { state.healed++; return false; },
    Math,
  };
  vm.createContext(ctx);
  vm.runInContext(fnSource('_bigCraftFitToScreen') + '\n' + fnSource('_bigCraftFollowScreen'), ctx);
  const box = () => ['left', 'top', 'width', 'height'].map((k) => ov.style[k]);
  return { ctx, state, ov, win, scr, hostEl, box, fire: (t) => (state.listeners[t] || []).forEach((f) => f()) };
}

test('the big map takes the screen\'s rectangle, edges rounded so the right and bottom land on the screen too', () => {
  // 1680x1050, YQM gate 1: the screen measures 418.8,168.9 to 1261.2,1017.6.
  const p = page({ screen: [418.8, 168.9, 1261.2, 1017.6] });
  p.ctx._bigCraftFollowScreen(p.ov);
  assert.deepEqual(p.box(), ['419px', '169px', '842px', '849px']);
  // Portrait 1080x1920: rounding the width alone left the right edge 1 px short.
  const q = page({ screen: [269.6, 181.6, 810.4, 1898.4], host: [0, 0, 1080, 1920] });
  q.ctx._bigCraftFollowScreen(q.ov);
  assert.deepEqual(q.box(), ['270px', '182px', '540px', '1716px']);   // 270 + 540 = 810
});

test('a resize after the map is up moves the map with the screen, and Leaflet is re-sized with it', () => {
  // Laid out at 1680x963 (the live defect's first layout), then shown at 1680x1050.
  const p = page({ screen: [416.4, 155.2, 1263.6, 933.0] });
  p.ctx._bigCraftFollowScreen(p.ov);
  assert.deepEqual(p.box(), ['416px', '155px', '848px', '778px']);
  const before = p.state.resized.length;

  p.state.screen = [418.8, 168.9, 1261.2, 1017.6];
  p.fire('resize');
  assert.deepEqual(p.box(), ['419px', '169px', '842px', '849px'], 'window resize');
  assert.equal(p.state.resized.length, before + 1, 'Leaflet re-measured once');
  assert.equal(p.state.resized[before].animate, false, 'without animation');
  assert.ok(p.state.healed >= 1, 'the route renderer is healed too (_mapHealRenderer)');

  // The screen and the board are both observed, and the observer re-fits.
  const ro = p.state.observers[0];
  assert.ok(ro.els.includes(p.scr) && ro.els.includes(p.hostEl), 'observes the screen and the board');
  p.state.screen = [475, 174, 1445, 1047];
  ro.cb();
  assert.deepEqual(p.box(), ['475px', '174px', '970px', '873px'], 'ResizeObserver');

  // The backstop: a move that changes no size is caught within a second.
  const tick = p.state.intervals.find((t) => t.ms === 1000);
  assert.ok(tick, 'a one-second backstop');
  assert.ok(p.win._bigCraftTimers.length >= 1, 'the backstop is one of the slide\'s timers, so the teardown clears it');
  p.state.screen = [480, 174, 1450, 1047];
  tick.f();
  assert.deepEqual(p.box(), ['480px', '174px', '970px', '873px'], 'backstop');
});

test('nothing is touched when nothing moved, and a screen with no box keeps the last good fit', () => {
  const p = page({ screen: [418.8, 168.9, 1261.2, 1017.6] });
  p.ctx._bigCraftFollowScreen(p.ov);
  const n = p.state.resized.length;
  p.fire('resize');
  assert.equal(p.state.resized.length, n, 'no Leaflet re-size without a change');

  p.state.screen = [0, 0, 0, 0];   // lifted out by a gate rebuild for a moment
  p.fire('resize');
  assert.deepEqual(p.box(), ['419px', '169px', '842px', '849px']);
  p.state.screen = null;           // no screen at all (the phone layout)
  p.fire('resize');
  assert.deepEqual(p.box(), ['419px', '169px', '842px', '849px']);

  p.ov.isConnected = false;        // a torn-down overlay is never written
  p.state.screen = [10, 10, 100, 100];
  assert.equal(p.ctx._bigCraftFitToScreen(p.ov), false);
});

test('the stop function lets go of the observer and the window', () => {
  const p = page({ screen: [418.8, 168.9, 1261.2, 1017.6] });
  p.ctx._bigCraftFollowScreen(p.ov);
  assert.equal(typeof p.win._bigCraftFitStop, 'function');
  assert.equal((p.state.listeners.resize || []).length, 1);
  p.win._bigCraftFitStop();
  assert.equal(p.state.observers[0].live, false);
  assert.equal((p.state.listeners.resize || []).length, 0);
  assert.equal((p.state.listeners.orientationchange || []).length, 0);
});

test('the takeover follows the screen from the moment it mounts, and the teardown stops it', () => {
  const render = fnSource('_renderBigCraft');
  const mount = render.indexOf('_bcWrapEl.appendChild(_bcOv);');
  const follow = render.indexOf('_bigCraftFollowScreen(_bcOv)');
  const build = render.search(/_bigMapClone(Live)?\(/);
  assert.ok(mount >= 0 && follow > mount, 'follows once the overlay is in the board');
  assert.ok(build > follow, 'and before the map is built, so Leaflet starts in the right box');
  const down = fnSource('_bigCraftTeardown');
  assert.match(down, /window\._bigCraftFitStop/);
  assert.ok(down.indexOf('_bigCraftFitStop') < down.indexOf('_bigCraftOverlay.remove()'), 'stopped before the overlay goes');
});
