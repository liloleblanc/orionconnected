'use strict';

// WHY THIS EXISTS
//
// A YQM gate 4 screen at 1920x1080 in German and Portuguese drew its pending
// aircraft words cut, 'Flugzeugdaten folge[n]' and 'Aeronave a confirma[r]',
// and a moment later stacked them onto two lines that both read whole.
//
// Measured in real time (headless Chrome, a probe that reads the screen in
// every frame after the page's own fitters and just before paint, and the
// frames Chrome actually painted), two ways that happened, both a fit that
// ran a frame or more after the room it measured had changed:
//
//   1. The operator's mark beside the words is an <img>. The first fit ran
//      before its file arrived, when it took no room; when it landed the
//      words' box narrowed, and the refit waited for the load event, which
//      comes after the frame that first draws the mark. That frame stayed on
//      screen while the refit ran: cut by 100px, 140 to 150 ms, every time a
//      gate showed that mark for the first time. The refit now runs from a
//      ResizeObserver, in the frame the mark takes its size, before paint.
//   2. The screen changed size (1920x993 to 1920x1080: a kiosk window going
//      full screen, a board in a resized frame, a headless capture whose
//      window is not its screen). The taller band sets the operator's labels
//      larger and the words' box narrower; the gate refitted 80 ms later on a
//      timer, and every frame in between was painted cut by 3.4 and 7.2 px,
//      160 to 170 ms (1920x1080 to 1280x720: nine rail values, 130 ms). The
//      refit now runs inside the resize event, before that frame is painted.
//
// And the shared measure itself (_fxMeasure) took a line up to half a pixel
// past its box as fitting. Into a box's padding that is harmless; where the
// box has no padding, or an element between the text and the box clips it,
// that half pixel is the edge of the last letter, cut. The box's content
// edge keeps its half pixel of room, and an edge that cuts keeps none: every
// element from the text up to the box whose overflow is not visible is
// measured at its padding edge, to the measurement's own noise (_FX_EPS, a
// fiftieth of a pixel: the page is laid out in 1/64px units).
//
// Every test below but the one that pins the room the design keeps fails on
// the fitter as it was.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

function block(src, from) {
  const i = src.indexOf(from);
  assert.ok(i >= 0, from + ' must exist');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) break;
  }
  return src.slice(i, j + 1);
}
const fnSource = (name) => block(CORE, 'function ' + name + '(');
const has = (name) => CORE.indexOf('function ' + name + '(') >= 0;

// ── the shared measure, against a model of the page ─────────────────────
// _fxMeasure reads the text's own runs (a Range over each text node), the
// box's rectangle and its computed padding, borders and overflow, and those
// of the elements between; this hands it those.
const EPS_DECL = (CORE.match(/var _FX_EPS = [^;]+;/) || [''])[0];
const _fxMeasure = new Function('document', 'NodeFilter', 'getComputedStyle',
  EPS_DECL + '\n' + ['_fxRects', '_fxClip', '_fxInner', '_fxMeasure'].filter(has).map(fnSource).join('\n') + '\nreturn _fxMeasure;')(
  {
    createTreeWalker(root) { const ns = (root.__texts || []).slice(); return { nextNode: () => ns.shift() || null }; },
    createRange() { let n = null; return { selectNodeContents(x) { n = x; }, getClientRects() { return n.rects; } }; }
  },
  { SHOW_TEXT: 4 },
  (el) => el.__cs
);
const rect = (l, r, t = 100, h = 30) => ({ left: l, right: r, top: t, bottom: t + h, width: r - l, height: h });
// An element from `l` to `r` on screen; `ow` is its offsetWidth (a whole
// number, less than its width when it is scaled, as a card in its entrance
// is); `clip` whether its overflow is hidden.
function node({ l = 100, r = 300, pad = 0, border = 0, clip = true, ow } = {}) {
  const w = r - l;
  return {
    nodeType: 1, parentElement: null,
    getBoundingClientRect: () => rect(l, r, 95, 40),
    offsetWidth: ow != null ? ow : Math.round(w), offsetHeight: 40,
    clientWidth: Math.round(w), scrollWidth: Math.round(w),
    __cs: { paddingLeft: pad + 'px', paddingRight: pad + 'px', paddingTop: '0px', paddingBottom: '0px',
      borderLeftWidth: border + 'px', borderRightWidth: border + 'px', borderTopWidth: '0px', borderBottomWidth: '0px',
      overflowX: clip ? 'hidden' : 'visible' },
    __texts: []
  };
}
function text(parent, tl, tr, root) {
  const t = { nodeValue: 'Aeronave a confirmar', rects: [rect(tl, tr)], parentElement: parent };
  (root || parent).__texts.push(t);
  return t;
}
// one line from `tl` to `tr` in a box of its own
const fits = ({ tl = 100, tr = 300, ...o } = {}) => { const el = node(o); text(el, tl, tr); return _fxMeasure(el, el, 0).ok; };

test('a line a sub-pixel past an edge that cuts it does not fit (it fitted, up to half a pixel)', () => {
  assert.equal(fits({ tr: 300.4 }), false, '0.4px past the edge of a box with no padding is the last letter cut');
  assert.equal(fits({ tr: 300.05 }), false, 'a twentieth of a pixel past it is past it');
  assert.equal(fits({ tr: 300.004 }), true, 'the rectangles\' own float noise is not');
  assert.equal(fits({ tl: 99.7, tr: 290 }), false, 'and on the left (a centred or right-to-left line)');
  // a quarter-pixel padding: 0.3px past the content edge is 0.05px past the
  // padding edge, where the box cuts
  assert.equal(fits({ pad: 0.25, tl: 100.25, tr: 300.05 }), false);
  // a scaled card cuts at its scaled border: 0.1px past it is past it
  assert.equal(fits({ l: 100, r: 280, ow: 200, border: 2, tl: 101.8, tr: 278.2 }), true);
  assert.equal(fits({ l: 100, r: 280, ow: 200, border: 2, tl: 101.8, tr: 278.3 }), false);
});

test('an element between the text and its box that cuts it is an edge too', () => {
  // the box (overflow visible) has room; the span holding the words clips at
  // 250, and the words run 0.3px past it: the old measure saw only the box
  const el = node({ l: 100, r: 300, clip: false });
  const span = node({ l: 100, r: 250, clip: true });
  span.parentElement = el;
  text(span, 100, 250.3, el);
  assert.equal(_fxMeasure(el, el, 0).ok, false);
});

test('the room the design gives is kept: half a pixel into padding, or past a box that cuts nothing, is drawn whole', () => {
  // v23754: a shrink-to-fit box is exactly as wide as its text at every size,
  // and a test that demanded room to spare pinned the gate number at 12px
  assert.equal(fits({ tr: 300 }), true, 'a line that ends on the edge of a box it sizes');
  assert.equal(fits({ tr: 260 }), true);
  assert.equal(fits({ pad: 8, tl: 108, tr: 292.3 }), true, '0.3px into an 8px padding');
  assert.equal(fits({ pad: 8, tl: 108, tr: 293 }), false, 'a whole pixel into it is past the box the text was fitted to');
  assert.equal(fits({ clip: false, tr: 300.3 }), true, 'a box that lets its text overhang cuts nothing');
});

test('the shared measure keeps no slack where the text is cut', () => {
  const m = fnSource('_fxMeasure');
  assert.match(CORE, /var _FX_EPS = 0\.02;/);
  assert.match(m, /var rs = _fxRects\(el, box\);/);
  assert.match(m, /var over = \(R - ib\.r\) > 0\.5 \|\| \(ib\.l - L\) > 0\.5 \|\| cut > _FX_EPS;/);
  // each line box is measured against every element from its text up to the box
  assert.match(fnSource('_fxClip'), /if \(cs\.overflowX && cs\.overflowX !== 'visible'\)/);
  assert.match(fnSource('_fxClip'), /if \(a === box\) break;/);
});

// ── the gate refits before the new size is painted ──────────────────────
test('a gate whose screen changes size is fitted again before that size is painted, not 80 ms later', () => {
  const src = block(CORE, 'window._gateFitResizeHandler = function () {').replace(/^window\._gateFitResizeHandler = /, '');
  const fitted = [], timers = [];
  const view = { id: 'gateView' };
  const win = { innerWidth: 1920, innerHeight: 993, _gateFitViewportKey: '1920x993' };
  const handler = new Function('window', 'document', 'screenType', 'gateAutofit', 'setTimeout', 'clearTimeout', 'return (' + src + ');')(
    win,
    { getElementById: (id) => (id === 'gateView' ? view : null) },
    'gate',
    (v) => fitted.push(v),
    (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    () => {}
  );
  win.innerHeight = 1080;
  handler();
  // in the resize event itself: the browser sends it while it prepares the
  // frame, before that frame's layout and paint
  assert.equal(fitted.length, 1, 'the gate must be fitted inside the resize event');
  assert.equal(fitted[0], view);
  // and once more when the screen has settled
  assert.equal(timers.length, 1);
  timers[0].fn();
  assert.equal(fitted.length, 2);
  // the same size again is not a change
  handler();
  assert.equal(fitted.length, 2);
});

// ── a picture that lands after the fit ──────────────────────────────────
// The operator's mark beside the pending words is an <img>: until its file
// arrives it takes no room, so the first fit gives the words the whole row.
// When it lands the words' box narrows, and the gate refitted on its load
// event, which comes after the frame that first draws it: that frame stayed
// on screen while the refit ran, 'Flugzeugd[aten folgen]' cut by 100px for
// 140 to 150 ms. The refit now runs from a ResizeObserver, whose callback
// comes after layout and before paint, in the frame the picture takes its
// size.
function artHarness(withObserver) {
  const observers = [];
  class FakeObserver {
    constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
    observe(t) { this.targets.push(t); }
    disconnect() { this.targets = []; }
    deliver() { if (this.targets.length) this.cb(this.targets.map((target) => ({ target }))); }
  }
  const fn = new Function('ResizeObserver', 'return (' + fnSource('_fxRefitWhenArtLands') + ');')(withObserver ? FakeObserver : undefined);
  const img = (o = {}) => Object.assign({
    complete: false, naturalWidth: 0, offsetWidth: 0, offsetHeight: 27, on: {},
    addEventListener(type, f) { (this.on[type] = this.on[type] || []).push(f); },
    fire(type) { (this.on[type] || []).splice(0).forEach((f) => f()); }
  }, o);
  // the browser's rendering step: every observer's callback, then paint
  const frame = () => observers.forEach((o) => o.deliver());
  return { fn, img, frame };
}

test('a picture that lands after the fit is fitted around in the frame it takes its size, before that frame is painted', () => {
  const { fn, img, frame } = artHarness(true);
  const mark = img();
  let fits = 0;
  fn([mark], () => fits++);
  frame();                                   // its first report, still on its way
  assert.equal(fits, 0);
  mark.complete = true; mark.naturalWidth = 300; mark.offsetWidth = 145;
  frame();                                   // the frame that first draws it at its size
  assert.equal(fits, 1, 'refitted before that frame is painted, not on its load event');
  mark.fire('load');
  frame();
  assert.equal(fits, 1, 'once per picture');
});

test('a picture whose box does not change, or a browser without ResizeObserver, refits on load or error as before', () => {
  {
    const { fn, img, frame } = artHarness(true);
    const fixed = img({ offsetWidth: 40 });
    let fits = 0;
    fn([fixed], () => fits++);
    fixed.complete = true; fixed.naturalWidth = 300;
    frame();
    assert.equal(fits, 0, 'nothing beside it moved');
    fixed.fire('load');
    assert.equal(fits, 1);
  }
  {
    const { fn, img } = artHarness(false);
    const a = img(), b = img();
    let fits = 0;
    fn([a, b], () => fits++);
    a.fire('load'); b.fire('error');
    assert.equal(fits, 2);
  }
  {
    const { fn, img, frame } = artHarness(true);
    let fits = 0;
    fn([img({ complete: true, naturalWidth: 300, offsetWidth: 145 })], () => fits++);
    frame();
    assert.equal(fits, 0, 'a picture already there was in the first fit');
  }
  // the gate hands its caption's pictures to it, with the same generation guard
  assert.match(CORE, /_fxRefitWhenArtLands\(gView\.querySelectorAll\('\.v2-rc-acb-cap img'\), function \(\) \{\s*if \(window\._gateFitGeneration !== _fitGeneration\) return;/);
});
