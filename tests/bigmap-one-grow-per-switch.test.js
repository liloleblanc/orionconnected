'use strict';

// WHY THIS EXISTS
//
// Switching a gate screen to another gate while the big map was up (the
// "Arriving From" takeover, .bigcraft-overlay with #bigCraftMap inside) made
// the map flicker: it grew in, dropped back small and dim, grew in again,
// dropped again, then snapped to full size. A screen recording of a WestJet
// gate switched D84 -> D83 at YYC shows exactly that.
//
// Measured in headless Chrome on live data (gids.html?ap=YYC&gate=A14&
// scene=bigcraft, then changeSubScreen('A15')): one switch is THREE full gate
// rebuilds in about 1.5 s — the switch's own paint, the registration check's
// verdict repaint (+823 ms, which clears _lastGateKey on purpose) and the
// batched rebuild (+921 ms). Each built a new #gateAdCarousel, a new
// #bigCraftMap and a new Leaflet map, and each replayed the 650 ms grow from
// scale .62 / opacity .55.
//
// Why: the takeover is an overlay on .g8-wrap, and every rebuild replaces
// .g8-wrap. The rail map and the carousel were carried across a rebuild; the
// overlay was not. The screen under the takeover is emptied on purpose 720 ms
// in, so the rebuild never kept that screen either, and the refill drew the
// takeover from nothing. The v23166 continuation test (the grow belongs to
// ARRIVING at the slide, not to repainting it) needs the overlay to still be
// in the document — never true after a wipe — and the teardown before it ran
// every time anyway, so even a continuation built a new map.
//
// v24110: the same node rides through a rebuild of its own flight, a repaint
// that would draw the same picture changes nothing, another gate's takeover is
// taken down before the new gate is drawn, a full paint answers the batched
// rebuild already pending, and the gate pick ends the native select's 3 s
// render hold. These tests run those functions against stubs and pin where
// they are called from.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

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
function run(names, ctx) {
  vm.createContext(ctx);
  vm.runInContext(names.map(fnSource).join('\n'), ctx);
  return ctx;
}
const before = (hay, a, b, why) => {
  const i = hay.indexOf(a), j = hay.indexOf(b);
  assert.ok(i >= 0, 'missing: ' + a);
  assert.ok(j >= 0, 'missing: ' + b);
  assert.ok(i < j, why || (a + ' must come before ' + b));
};

test('the subject is the airport, the gate on screen and its departure', () => {
  const c = run(['_bigCraftSubject'], { subScreenVal: 'D83', String });
  assert.equal(c._bigCraftSubject({ flight: ' WS186 ' }, 'yyc'), 'YYC|D83|WS186');
  assert.notEqual(c._bigCraftSubject({ flight: 'WS001' }, 'YYC'), 'YYC|D83|WS186');
  assert.notEqual(c._bigCraftSubject({ flight: 'WS186' }, 'YEG'), 'YYC|D83|WS186');
  c.subScreenVal = 'D84';
  assert.notEqual(c._bigCraftSubject({ flight: 'WS186' }, 'YYC'), 'YYC|D83|WS186');
  c.subScreenVal = 'D83';
  assert.equal(c._bigCraftSubject(null, 'YYC'), 'YYC|D83|');
});

function keyCtx() {
  const s = { verb: 'arrivingFrom', stand: 'S1', throwCaption: false };
  const c = run(['_bigCraftPaintKey', '_bigCraftFixKey'], {
    window: { _gateInbound: { flight: 'WS185', origin: 'YEG' }, _gateCurrentFlight: { flight: 'WS186', dest: 'YVR' } },
    _gateInbCaptionKey: () => { if (s.throwCaption) throw new Error('x'); return s.verb; },
    _gateApronOwnRef: () => s.stand,
    langs: ['en', 'fr'],
    Date, String, Number,
  });
  return { c, s };
}
const BASE = { out: false, oc: 'YEG', dc: 'YYC', pos: null, kind: 'air-est', progress: 0.30, estimated: true, waiting: false, note: '' };

test('the paint key is the picture, not the clock', () => {
  const { c, s } = keyCtx();
  const k = (o) => c._bigCraftPaintKey(Object.assign({}, BASE, o || {}));
  const base = k();
  assert.ok(base, 'a readable key');
  // the same view: inside one zoom step, any live fix, the apron when nothing stands
  assert.equal(k({ progress: 0.60 }), base, 'inside the cruise step the view is the same');
  assert.equal(k({ pos: [-114, 51], fixAt: 1, kind: 'fix', estimated: false }), k({ pos: [-113, 52], fixAt: 2, kind: 'taxi', estimated: false }), 'a live fix is one token');
  s.stand = 'S9'; assert.equal(k(), base, 'the apron only counts for a stand'); s.stand = 'S1';
  // a different picture
  assert.notEqual(k({ progress: 0.80 }), base, 'the next zoom step');
  assert.notEqual(k({ progress: 0.96 }), k({ progress: 0.99 }));
  assert.notEqual(k({ pos: [-114, 51], estimated: false }), base, 'live against estimate');
  for (const o of [{ oc: 'YVR' }, { dc: 'YEG' }, { out: true }, { estimated: false }]) assert.notEqual(k(o), base, JSON.stringify(o));
  assert.notEqual(k({ kind: 'stand', waiting: true }), k({ kind: 'stand', waiting: false }));
  assert.notEqual(k({ kind: 'none', note: 'a' }), k({ kind: 'none', note: 'b' }));
  const st = k({ kind: 'stand', waiting: true });
  s.stand = 'S9'; assert.notEqual(k({ kind: 'stand', waiting: true }), st, 'the stand the apron deals'); s.stand = 'S1';
  c.window._gateInbound = { flight: 'WS999', origin: 'YEG' }; assert.notEqual(k(), base, 'the caption flight');
  c.window._gateInbound = { flight: 'WS185', origin: 'YXE' }; assert.notEqual(k(), base, 'the caption place');
  c.window._gateInbound = { flight: 'WS185', origin: 'YEG' };
  s.verb = 'arrivedFrom'; assert.notEqual(k(), base, 'the caption verb'); s.verb = 'arrivingFrom';
  c.langs = ['de', 'en']; assert.notEqual(k(), base, 'the languages'); c.langs = ['en', 'fr'];
  assert.equal(k(), base);
  // unreadable
  assert.equal(c._bigCraftPaintKey(null), '');
  s.throwCaption = true; assert.equal(k(), '', 'an unreadable key never matches');
});

test('a live fix has its own key', () => {
  const { c } = keyCtx();
  assert.equal(c._bigCraftFixKey({ pos: [-114.01234567, 51.12345678], fixAt: 99 }), '51.12346,-114.01235@99');
  assert.equal(c._bigCraftFixKey({ pos: null }), '');
  assert.equal(c._bigCraftFixKey(null), '');
});

function liftCtx(o) {
  const st = { teardown: 0, removed: 0, props: [] };
  const ov = Object.assign({
    isConnected: true, __bcSubj: 'YYC|D83|WS186', __bcAt: 9100, __bcGrow: true,
    style: { setProperty: (...a) => st.props.push(a) },
    remove: () => { st.removed++; },
  }, o || {});
  const view = { contains: (n) => n === ov };
  const c = run(['_bigCraftSubject', '_bigCraftLiftForRebuild'], {
    window: { _bigCraftOverlay: ov }, subScreenVal: 'D83',
    _bigCraftTeardown: () => { st.teardown++; },
    Date: { now: () => 10000 }, String,
  });
  return { c, st, ov, view };
}

test('a rebuild of the same flight lifts the takeover out, the grow finished or resumed, never restarted', () => {
  let t = liftCtx();
  assert.equal(t.c._bigCraftLiftForRebuild(t.view, { flight: 'WS186' }, 'YYC', true), t.ov);
  assert.equal(t.st.removed, 1);
  assert.deepEqual(t.st.props, [['animation', 'none', 'important']], 'a finished grow is switched off');
  assert.equal(t.st.teardown, 0);
  t = liftCtx({ __bcAt: 9700 });
  t.c._bigCraftLiftForRebuild(t.view, { flight: 'WS186' }, 'YYC', true);
  assert.deepEqual(t.st.props, [['animation-delay', '-300ms', 'important']], 'a grow still running resumes where it was');
  t = liftCtx({ __bcAt: 9700, __bcGrow: false });
  t.c._bigCraftLiftForRebuild(t.view, { flight: 'WS186' }, 'YYC', true);
  assert.deepEqual(t.st.props, [['animation', 'none', 'important']], 'a takeover that never grew does not start to');
});

test('a map still fading in from its tiles carries the fade on, not a jump to full', () => {
  // Lift notes the fade's opacity (re-inserting a node ends its transition) ...
  const mk = (op, loading) => ({ classList: { contains: (c) => c === 'bc-loading' && loading }, style: {}, _op: op });
  let t = liftCtx();
  const mb = mk(0.14, false);
  t.ov.querySelector = (q) => (q === '#bigCraftMap' ? mb : null);
  t.c.getComputedStyle = (el) => ({ opacity: String(el._op) });
  t.c.parseFloat = parseFloat;
  t.c._bigCraftLiftForRebuild(t.view, { flight: 'WS186' }, 'YYC', true);
  assert.equal(t.ov.__bcMapOp, 0.14);
  for (const [op, loading] of [[1, false], [0, true]]) {
    t = liftCtx();
    const m2 = mk(op, loading);
    t.ov.querySelector = () => m2;
    t.c.getComputedStyle = (el) => ({ opacity: String(el._op) });
    t.c.parseFloat = parseFloat;
    t.c._bigCraftLiftForRebuild(t.view, { flight: 'WS186' }, 'YYC', true);
    assert.equal(t.ov.__bcMapOp, null, 'nothing to carry: ' + (loading ? 'still loading' : 'fully in'));
  }
  // ... and the put-back starts the transition again from it.
  const p = putBackCtx();
  const seen = [];
  const m3 = { style: {} };
  Object.defineProperty(m3.style, 'opacity', { get() { return this._o || ''; }, set(v) { this._o = v; seen.push(v); } });
  Object.defineProperty(m3, 'offsetWidth', { get() { seen.push('reflow'); return 1; } });
  p.ov.querySelector = (q) => (q === '#bigCraftMap' ? m3 : null);
  p.ov.__bcMapOp = 0.14;
  assert.equal(p.c._bigCraftPutBack(p.ov), true);
  assert.deepEqual(seen, ['0.14', 'reflow', ''], 'set where it was, settle, then let the stylesheet fade it in');
  assert.equal(p.ov.__bcMapOp, null);
});

test('another gate, flight, airport or carrier: the old takeover is taken down at the rebuild', () => {
  for (const [why, cf, ap, same, sub] of [
    ['another flight', { flight: 'WS001' }, 'YYC', true, 'D83'],
    ['another gate', { flight: 'WS186' }, 'YYC', true, 'D84'],
    ['another airport', { flight: 'WS186' }, 'YEG', true, 'D83'],
    ['another carrier', { flight: 'WS186' }, 'YYC', false, 'D83'],
  ]) {
    const t = liftCtx();
    t.c.subScreenVal = sub;
    assert.equal(t.c._bigCraftLiftForRebuild(t.view, cf, ap, same), false, why);
    assert.equal(t.st.teardown, 1, why);
    assert.equal(t.st.removed, 0, why);
    assert.deepEqual(t.st.props, [], why);
  }
  let t = liftCtx();
  assert.equal(t.c._bigCraftLiftForRebuild({ contains: () => false }, { flight: 'WS186' }, 'YYC', true), null, 'not on this board: nothing to carry');
  assert.equal(t.st.teardown, 0);
  t = liftCtx({ isConnected: false });
  assert.equal(t.c._bigCraftLiftForRebuild(t.view, { flight: 'WS186' }, 'YYC', true), null, 'a leftover from a wipe that kept nothing');
  assert.equal(t.st.teardown, 1, 'is taken down, timers and all');
  t = liftCtx();
  t.c.window._bigCraftOverlay = null;
  assert.equal(t.c._bigCraftLiftForRebuild(t.view, { flight: 'WS186' }, 'YYC', true), null);
});

function putBackCtx(o) {
  const st = { appended: [], classes: [], oldStop: 0, follow: [], timers: [], teardown: 0, resized: [], order: [] };
  const mapEl = {};
  const ov = { contains: (n) => n === mapEl };
  const wrap = { appendChild: (n) => { st.appended.push(n); }, classList: { add: (c) => st.classes.push(c) } };
  const scr = { closest: (sel) => (sel === '.g8-wrap' && !(o && o.noWrap) ? wrap : null) };
  const win = {
    _bigCraftTimers: [],
    _bigCraftFitStop: () => { st.oldStop++; st.order.push('stop'); },
    _bigCraftMap: { getContainer: () => mapEl, invalidateSize: (a) => st.resized.push(a) },
  };
  const c = run(['_bigCraftPutBack'], {
    window: win,
    document: { getElementById: (id) => (id === 'gateAdCarousel' && !(o && o.noScreen) ? scr : null) },
    _bigCraftFollowScreen: (n) => { st.follow.push(n); st.order.push('follow'); win._bigCraftFitStop = () => {}; },
    _bigCraftTeardown: () => { st.teardown++; },
    setTimeout: (f, ms) => { st.timers.push({ f, ms }); return 'T' + st.timers.length; },
  });
  return { c, st, ov, win };
}

test('put back over the screen it covers, followed again on the new board', () => {
  const t = putBackCtx();
  assert.equal(t.c._bigCraftPutBack(t.ov), true);
  assert.deepEqual(t.st.appended, [t.ov]);
  assert.deepEqual(t.st.classes, ['g8-bigcraft-active']);
  assert.deepEqual(t.st.order, ['stop', 'follow'], 'the old follower stops before the new one starts');
  assert.deepEqual(t.st.follow, [t.ov]);
  assert.equal(t.st.timers.length, 1);
  assert.equal(t.st.timers[0].ms, 200, 'the rail map\'s own re-size delay');
  assert.ok(t.win._bigCraftTimers.includes('T1'), 'the re-size dies with the slide');
  t.st.timers[0].f();
  assert.equal(JSON.stringify(t.st.resized), '[{"animate":false}]', 'objects from the sandbox: compared as text');
  assert.equal(t.st.teardown, 0);
  for (const o of [{ noScreen: true }, { noWrap: true }]) {
    const u = putBackCtx(o);
    assert.equal(u.c._bigCraftPutBack(u.ov), false, JSON.stringify(o));
    assert.equal(u.st.teardown, 1, 'no screen to go back over: taken down');
    assert.deepEqual(u.st.appended, []);
  }
});

function inPlaceCtx() {
  const st = { fits: 0, live: [], added: [] };
  const mb = {};
  const host = { classList: { has: false, contains: () => st.added.length > 0 || host.classList.has, add: (c) => st.added.push(c) } };
  const ov = { isConnected: true, parentNode: host, contains: (n) => n === mb, __bcPaint: 'P', __bcFix: '' };
  const c = run(['_bigCraftFixKey', '_bigCraftRepaintInPlace'], {
    window: { _bigCraftMap: { getContainer: () => mb } },
    document: { getElementById: (id) => (id === 'bigCraftMap' ? mb : null) },
    _bigCraftTeardown: () => { throw new Error('a same-picture repaint must not tear down'); },
    _bigCraftFitToScreen: () => { st.fits++; },
    _bigMapCloneLive: (...a) => { st.live.push(a); },
    Number, String,
  });
  return { c, st, ov, mb, host };
}

test('a repaint of the same picture keeps every node', () => {
  let t = inPlaceCtx();
  assert.equal(t.c._bigCraftRepaintInPlace(t.ov, Object.assign({}, BASE), 'P'), true);
  assert.deepEqual(t.st.live, [], 'an estimate repaint calls no builder');
  assert.equal(t.st.fits, 1);
  assert.deepEqual(t.st.added, ['g8-bigcraft-active'], 'the board class comes back if a rebuild dropped it');
  t.c._bigCraftRepaintInPlace(t.ov, Object.assign({}, BASE), 'P');
  assert.deepEqual(t.st.added, ['g8-bigcraft-active'], 'and is only added when missing');
  const live = { oc: 'YEG', dc: 'YYC', pos: [-114, 51], fixAt: 5 };
  assert.equal(t.c._bigCraftRepaintInPlace(t.ov, live, 'P'), true);
  assert.deepEqual(t.st.live, [['YEG', 'YYC', 51, -114, 5]], 'a newer fix re-anchors the running glide');
  t.c._bigCraftRepaintInPlace(t.ov, live, 'P');
  assert.equal(t.st.live.length, 1, 'the same fix again does nothing');
  t.c._bigCraftRepaintInPlace(t.ov, Object.assign({}, live, { fixAt: 6 }), 'P');
  assert.equal(t.st.live.length, 2);
  t = inPlaceCtx();
  assert.equal(t.c._bigCraftRepaintInPlace(t.ov, BASE, 'Q'), false, 'another picture');
  assert.equal(t.c._bigCraftRepaintInPlace(t.ov, BASE, ''), false, 'an unreadable key');
  assert.equal(t.c._bigCraftRepaintInPlace(Object.assign({}, t.ov, { isConnected: false }), BASE, 'P'), false, 'off the page');
  t.c.window._bigCraftMap = null;
  assert.equal(t.c._bigCraftRepaintInPlace(t.ov, BASE, 'P'), false, 'no map');
  t.c.window._bigCraftMap = { getContainer: () => ({}) };
  assert.equal(t.c._bigCraftRepaintInPlace(t.ov, BASE, 'P'), false, 'a map on another box');
  t.c.window._bigCraftMap = { getContainer: () => t.mb };
  assert.equal(t.c._bigCraftRepaintInPlace(Object.assign({}, t.ov, { contains: () => false }), BASE, 'P'), false, 'the box is not in this overlay');
});

test('one switch, one grow: the measured sequence', () => {
  // The A15 takeover is mounted at t0; the verdict repaint (+823 ms) and the
  // batched rebuild (+921 ms) each lift it, put it back and refill.
  const st = { teardown: 0, builders: 0, removed: 0, appended: 0, props: [] };
  const mb = {}, mapEl = mb;
  let now = 50000;
  const wrap = { appendChild: () => { st.appended++; }, classList: { add() {} } };
  const scr = { closest: () => wrap };
  const host = { classList: { contains: () => true, add() {} } };
  const ov = {
    isConnected: true, parentNode: host, __bcGrow: true, __bcFix: '',
    style: { setProperty: (...a) => st.props.push(a) },
    remove: () => { st.removed++; },
    contains: (n) => n === mapEl,
  };
  const c = run(['_bigCraftSubject', '_bigCraftPaintKey', '_bigCraftFixKey', '_bigCraftRepaintInPlace', '_bigCraftLiftForRebuild', '_bigCraftPutBack'], {
    window: { _bigCraftOverlay: ov, _bigCraftTimers: [], _bigCraftMap: { getContainer: () => mapEl, invalidateSize() {} },
      _gateInbound: { flight: 'WS185', origin: 'YEG' }, _gateCurrentFlight: { flight: 'WS186', dest: 'YVR' } },
    document: { getElementById: (id) => (id === 'gateAdCarousel' ? scr : id === 'bigCraftMap' ? mb : null) },
    subScreenVal: 'A15', langs: ['en', 'fr'],
    _gateInbCaptionKey: () => 'arrivingFrom', _gateApronOwnRef: () => '',
    _bigCraftTeardown: () => { st.teardown++; },
    _bigCraftFollowScreen() {}, _bigCraftFitToScreen() {},
    _bigMapCloneLive: () => { st.builders++; },
    setTimeout: () => 0,
    Date: { now: () => now }, String, Number,
  });
  const ctx = Object.assign({}, BASE);
  ov.__bcSubj = c._bigCraftSubject({ flight: 'WS186' }, 'YYC');
  ov.__bcPaint = c._bigCraftPaintKey(ctx);
  ov.__bcAt = now;
  const view = { contains: (n) => n === ov };
  for (const dt of [823, 921]) {
    now = 50000 + dt;
    assert.equal(c._bigCraftLiftForRebuild(view, { flight: 'WS186' }, 'YYC', true), ov, 'the same node at +' + dt);
    assert.equal(c._bigCraftPutBack(ov), true);
    assert.equal(c._bigCraftRepaintInPlace(ov, ctx, c._bigCraftPaintKey(ctx)), true, 'the refill changes nothing at +' + dt);
  }
  assert.equal(st.teardown, 0);
  assert.equal(st.builders, 0);
  assert.equal(st.removed, 2);
  assert.equal(st.appended, 2);
  assert.deepEqual(st.props, [['animation', 'none', 'important'], ['animation', 'none', 'important']], 'the grow had finished: it never replays');
  // and the next switch takes it down before the new gate is drawn
  c.subScreenVal = 'D84';
  assert.equal(c._bigCraftLiftForRebuild(view, { flight: 'WS001' }, 'YYC', true), false);
  assert.equal(st.teardown, 1);
});

test('the wiring', () => {
  const rds = fnSource('renderDedicatedScreen');
  before(rds, "var _savedAdLogo = document.getElementById('gateAdLogo');", '_bigCraftLiftForRebuild(gView, currentFlight, iata, _gateAdAirlineSame)');
  before(rds, '_bigCraftLiftForRebuild(gView, currentFlight, iata, _gateAdAirlineSame)',
    "if (_gateAdAirlineSame && _savedAd && _savedBc !== false && (_savedAd.firstChild || _savedBc)) { _savedAd.remove(); }");
  before(rds, "if (_gateAdAirlineSame && _savedAd && _savedBc !== false && (_savedAd.firstChild || _savedBc)) { _savedAd.remove(); }",
    'gView.innerHTML = uxgGateHtml(', 'lifted before the wipe');
  before(rds, '_newAdLogo.replaceWith(_savedAdLogo)', "if (_savedBc && typeof _bigCraftPutBack === 'function') _bigCraftPutBack(_savedBc);");
  before(rds, "if (_savedBc && typeof _bigCraftPutBack === 'function') _bigCraftPutBack(_savedBc);", 'gateAutofit(gView)', 'put back before the fit measures the board');
  before(rds, 'window._lastGateKey = _computeGateKey();', '_gateRebuildAbsorb()', 'the absorb follows a paint that got as far as its key');
  const wx = rds.slice(rds.indexOf('var _wxR'), rds.indexOf('if (_savedAd && _newAd)'));
  assert.ok(wx.length > 0);
  assert.ok(!wx.includes('_bigCraftPutBack'), 'the weather card\'s slice stays as it was');

  const rbc = fnSource('_renderBigCraft');
  before(rbc, 'var _bcSubj = _bigCraftSubject(window._gateCurrentFlight, window._gateIata);', 'var _bcContinuation');
  const cont = rbc.slice(rbc.indexOf('var _bcContinuation'), rbc.indexOf(');', rbc.indexOf('var _bcContinuation')));
  assert.match(cont, /isConnected/);
  assert.match(cont, /window\._bigCraftOverlay\.__bcSubj === _bcSubj/, 'a switch inside the dwell is a new arrival');
  before(rbc, 'if (_bcContinuation && _bigCraftRepaintInPlace(window._bigCraftOverlay, ctx, _bcPaint)) return;', '_bigCraftTeardown();',
    'a same-picture repaint returns before anything is torn down');
  before(rbc, 'window._bigCraftOverlay = _bcOv;', '_bcOv.__bcSubj = _bcSubj;');
  before(rbc, '_bcOv.__bcAt = Date.now();', '_bigCraftFollowScreen(_bcOv)');
  assert.match(rbc, /if \(!_bcContinuation\) \{\s*window\._bigCraftVisitStart = _bcNow;\s*window\._bigCraftVisitSlot = window\._gateAdCurrentIdx;\s*\}/,
    'a new visit is exactly what is not a continuation, so it gets its full 8 s');
  assert.ok(rbc.includes("if (_bcContinuation) _bcOv.style.setProperty('animation', 'none', 'important');"), 'v23166 stays');

  assert.match(fnSource('_bigCraftLiftForRebuild'), /GROW_MS = 650/);
  assert.match(CSS, /\.bigcraft-overlay \{[^}]*animation: bigcraftGrow 650ms[^}]*!important;/, 'the lift\'s GROW_MS is the grow\'s own length');
  for (const n of ['_bigCraftSubject', '_bigCraftPaintKey', '_bigCraftFixKey', '_bigCraftRepaintInPlace', '_bigCraftLiftForRebuild', '_bigCraftPutBack']) {
    assert.ok(!fnSource(n).includes('L.map('), n + ' never builds a map');
  }
});

test('a full gate paint answers the rebuild already asked for', () => {
  const from = CORE.indexOf('var _gateKeyResetTimer = null;');
  const to = CORE.indexOf('\n}', CORE.indexOf('\nfunction _gateRebuildAbsorb(')) + 2;
  assert.ok(from > 0 && to > from);
  const timers = new Map();
  let id = 0, now = 0, paints = 0;
  const ctx = {
    window: {}, screenType: 'gate', Date: { now: () => now },
    setTimeout: (f, ms) => { timers.set(++id, { f, at: now + ms }); return id; },
    clearTimeout: (i) => { timers.delete(i); },
    renderDedicatedScreen: () => { paints++; },
  };
  vm.createContext(ctx);
  vm.runInContext(CORE.slice(from, to) + '\nthis.request = requestGateRebuild; this.absorb = _gateRebuildAbsorb;', ctx);
  const flush = () => { for (const [k, t] of [...timers]) { timers.delete(k); t.f(); } };
  ctx.request(); assert.equal(ctx.absorb(), true); flush();
  assert.equal(paints, 0, 'a paint absorbed the pending rebuild');
  ctx.request(); flush();
  assert.equal(paints, 1, 'with no paint in between the batch still lands');
  assert.equal(ctx.window._lastGateKey, '');
  assert.equal(ctx.absorb(), false, 'nothing pending');
  ctx.request(); flush();
  assert.equal(paints, 2, 'a request after the paint arms its own timer');
  // a drip every 300 ms past the 4 s cap still lands exactly one paint
  paints = 0; now = 100000;
  for (let i = 0; i < 16; i++) { ctx.request(); now += 300; }
  flush();
  assert.equal(paints, 1);
});

test('the verdict repaint still clears the key and repaints at once', () => {
  const v = fnSource('_regFlightVerdict');
  const at = [...v.matchAll(/window\._lastGateKey = '';/g)].map((m) => m.index);
  assert.equal(at.length, 2);
  for (const i of at) assert.ok(v.slice(i, i + 200).includes('setTimeout(function () { try { renderDedicatedScreen(); }'), 'the tail still appears immediately');
  assert.ok(!v.includes('requestGateRebuild'));
});

test('the gate pick ends the native select\'s render hold', () => {
  const mk = (blocked) => {
    const st = { cleared: [], sawBlocked: [] };
    const ctx = {
      _fidsOwnsScreenState: () => false, _fidsSafeSub: (v) => v, _fidsSyncUrl() {},
      screenType: 'gate', subScreenVal: 'D84', _renderBlocked: blocked, _renderBlockTimer: blocked ? 7 : null,
      clearTimeout: (i) => st.cleared.push(i),
      localStorage: { setItem() {} }, JSON,
    };
    ctx.render = () => st.sawBlocked.push(ctx._renderBlocked);
    vm.createContext(ctx);
    vm.runInContext(fnSource('changeSubScreen'), ctx);
    // the page's let bindings are globals of the context here
    vm.runInContext('changeSubScreen("D83")', ctx);
    return { st, ctx };
  };
  let t = mk(true);
  assert.deepEqual(t.st.sawBlocked, [false], 'the new gate paints at the pick');
  assert.deepEqual(t.st.cleared, [7]);
  assert.equal(t.ctx.subScreenVal, 'D83');
  t = mk(false);
  assert.deepEqual(t.st.cleared, []);
  assert.deepEqual(t.st.sawBlocked, [false]);
});
