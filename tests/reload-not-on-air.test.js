'use strict';
// WHY THIS EXISTS
//
// v24188. NO BOARD RELOADS ITSELF ON AIR.
// Reported: on the rotation switch the logos move left to right as a board first
// comes up. One cause: the build watchdog and the self-update of fids-core.js
// reloaded the board with location.reload() as soon as a new build was live, and
// their only test of being seen, document.hidden, is false for every board inside
// rotate.html, the one on air included. So after each deploy a board could load
// from cold in view, its art landing piece by piece.
//
// Both now go through window._fidsReloadWhenHidden(reason). Outside the rotator it
// reloads at once, exactly as before. In the rotator a board on air (or told it is
// next) holds the request until it has been told it is off screen and its fade-out
// is over, its frame read hidden as well; a board already off screen reloads at once
// unless it is the next one up; on a tour a frame that is not shown again before its
// airport goes never reloads; 15 minutes after the request it reloads whatever the
// state.
//
// The block is the shipped one: the reload block of fids-core.js (v24144 and this),
// run against a small fake page with a fake rotator around it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const ROT = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'rotate.html'), 'utf8');
const start = CORE.indexOf('var _fidsReloadWhenShown = false;');
const end = CORE.indexOf('// ── BUILD WATCHDOG', start);
assert.ok(start > 0 && end > start, 'the reload block is in fids-core.js');
const BLOCK = CORE.slice(start, end);

const SEQ = ['fids.html', 'gids.html', 'fids.html', 'gids.html', 'bids.html'];

// A board in a frame. rotator: a rotate.html around it (__ocRotator); top: the page is
// the top window; page/ap: what the rotator wrote on the frame; run: what __ocRotator.get
// answers (where the rotation is); fade: the --oc-fade the rotator set on its root.
// The frame reads as rotate.html draws it (v24188): visible on air, and through its
// fade-out after it is told it is off screen, a fade that begins lag ms late on a busy
// box; hidden from then on. stuck: a frame that never reads hidden; css false: a frame
// whose style cannot be read.
function board(o) {
  o = Object.assign({ rotator: true, top: false, page: 'fids.html', ap: 'YQM', fade: '0.6s', lag: 0, stuck: false, css: true }, o || {});
  const run = Object.assign({ aps: ['YQM'], apIdx: 0, idx: 0, seq: SEQ }, o.run || {});
  let now = 1e9;
  const timers = [];
  const listeners = {};
  const store = {};
  let visible = true;   // the brake at the top of fids-core.js: on air until told otherwise
  let offAt = null;     // when the rotator took the frame off the air (its fade-out begins)
  const frame = { getAttribute: (k) => (k === 'data-oc-page' ? o.page : k === 'data-oc-ap' ? o.ap : null) };
  const fadeMs = () => Math.round(parseFloat(o.fade) * 1000);
  const frameVis = () => ((o.stuck || visible || offAt === null || now < offAt + o.lag + fadeMs()) ? 'visible' : 'hidden');
  const parent = {
    __ocRotator: o.rotator ? { get: () => run } : undefined,
    document: { documentElement: { style: { getPropertyValue: (k) => (k === '--oc-fade' ? o.fade : '') } } },
    getComputedStyle: o.css ? (el) => ({ visibility: el === frame ? frameVis() : 'visible' }) : undefined,
  };
  const win = {
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    requestAnimationFrame: (f) => f(),
    frameElement: frame,
    _ocIdle: () => !visible,
  };
  win.parent = o.top ? win : parent;
  win.top = o.top ? win : parent;
  const ctx = {
    reloads: 0,
    window: win,
    document: { hidden: false, readyState: 'complete', body: null, addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    location: { reload() { ctx.reloads++; } },
    Date: { now: () => now },
    setTimeout: (f, ms) => { timers.push({ f, at: now + (ms || 0) }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; },
    requestAnimationFrame: (f) => f(),
    console: { log() {}, warn() {} },
    FIDS_BUILD_TAG: 'v00000',
  };
  vm.runInNewContext(BLOCK, ctx);
  // the rotator tells the frame: the brake flips first (its listener is the first one), then the rest hear it
  const tell = (on) => {
    if (!on && visible) offAt = now;   // the class comes off as the message goes: the fade-out begins
    visible = on;
    for (const f of listeners.message || []) f({ data: { oc: on ? 'active' : 'inactive' } });
  };
  const wait = (ms) => {
    const until = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.f && t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      const f = due.f; due.f = null; f();
    }
    now = until;
  };
  return {
    ctx, win, store, run, tell, wait, ask: (why) => win._fidsReloadWhenHidden(why),
    spot: () => win._fidsReloadWhenHidden.state().spot, vis: frameVis, set: (k, v) => { o[k] = v; },
    dropTimers: () => { for (const t of timers) t.f = null; }, jump: (ms) => { now += ms; },
  };
}

test('it is a function on the window, callable from the console', () => {
  const b = board();
  assert.equal(typeof b.win._fidsReloadWhenHidden, 'function');
  assert.equal(typeof b.win._fidsReloadWhenHidden.state, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(b.win._fidsReloadWhenHidden.state())),
    { pending: null, askedAt: 0, offScreen: false, offAt: 0, inRotator: true, spot: 'later' });
});

test('outside the rotator it reloads at once, exactly as before', () => {
  for (const o of [{ rotator: false }, { top: true }]) {
    const b = board(o);
    assert.equal(b.ask('1'), 'now');
    assert.equal(b.ctx.reloads, 1, JSON.stringify(o) + ': the build watchdog reloads at once');
    assert.equal(b.store.fids_reload_why, '1', 'and the next load knows how it began, as _fidsReloadNow wrote it');
    const s = board(o);
    assert.equal(s.ask('self-update'), 'now');
    assert.equal(s.ctx.reloads, 1, JSON.stringify(o) + ': the self-update reloads at once');
    assert.equal(s.store.fids_reload_why, undefined, 'a plain location.reload(), as the self-update always did');
  }
  // a frame of a page that is not the rotator (the parent has no __ocRotator) is outside it too
  const f = board({ rotator: false, top: false });
  assert.equal(f.ask('2'), 'now');
  assert.equal(f.ctx.reloads, 1);
  assert.equal(f.store.fids_reload_why, '2');
});

test('on air in the rotator it holds, and reloads once the fade-out after the next inactive is over', () => {
  const b = board();
  b.tell(true);                                       // on air
  assert.equal(b.ask('1'), 'held');
  b.wait(5 * 60000);
  assert.equal(b.ctx.reloads, 0, 'never while it is on screen');
  assert.equal(b.ask('1'), 'held', 'the watchdog asks again three minutes on: still held, nothing doubles up');
  b.tell(false);                                      // the rotator starts its fade-out
  assert.equal(b.ctx.reloads, 0, 'not in the event that starts the fade-out');
  b.wait(650);
  assert.equal(b.ctx.reloads, 0, 'not while it is still fading out');
  b.wait(100);
  assert.equal(b.ctx.reloads, 1, 'once the fade (0.6 s) and 100 ms more are over');
  assert.equal(b.store.fids_reload_why, '1', 'the reason goes through to the next load');
  b.wait(20 * 60000);
  assert.equal(b.ctx.reloads, 1, 'and only once');
});

test('told it is next (v24186 wakes the next board at the fade-out) counts as on air', () => {
  const b = board();
  b.tell(false);
  b.wait(60000);
  b.tell(true);                                       // advance(): the incoming board is told it is next
  assert.equal(b.ask('1'), 'held');
  b.wait(800);                                        // the reveal; it stays on air for its dwell
  b.wait(60000);
  assert.equal(b.ctx.reloads, 0);
  b.tell(false);
  b.wait(700);
  assert.equal(b.ctx.reloads, 1);
});

test('back on air before its fade-out is over: no reload, and the next fade-out takes it', () => {
  const b = board();
  b.tell(true);
  b.ask('1');
  b.tell(false);
  b.wait(300);
  b.tell(true);
  b.wait(5000);
  assert.equal(b.ctx.reloads, 0, 're-checked at the end of the wait: on air again, so held');
  b.tell(false);
  b.wait(700);
  assert.equal(b.ctx.reloads, 1);
});

test('a longer fade of the rotator (?fade=) is waited out too', () => {
  const b = board({ fade: '2s' });
  b.tell(true);
  b.ask('1');
  b.tell(false);
  b.wait(2000);
  assert.equal(b.ctx.reloads, 0, 'the 2 s fade is not over before 2.1 s');
  b.wait(100);
  assert.equal(b.ctx.reloads, 1);
});

test('a board already off screen reloads at once', () => {
  const b = board({ run: { idx: 3 } });               // gids on air, bids next: fids is two screens away
  b.tell(false);
  b.wait(30000);
  assert.equal(b.ask('1'), 'now');
  assert.equal(b.ctx.reloads, 1);
});

test('asked during its own fade-out, it reloads when the fade-out is over', () => {
  const b = board({ run: { idx: 1 } });               // gids now on air
  b.tell(true);
  b.tell(false);
  b.wait(200);
  assert.equal(b.ask('1'), 'waiting');
  b.wait(400);
  assert.equal(b.ctx.reloads, 0);
  b.wait(150);
  assert.equal(b.ctx.reloads, 1, 'at 700 ms after the inactive, though fids is the next board up: a whole screen is ahead of it');
});

test('off screen but the next board up: it waits for its next fade-out instead of loading as it is revealed', () => {
  const b = board({ run: { idx: 1 } });               // gids on air; fids (seq 2) is next
  b.tell(false);
  b.wait(40000);
  assert.equal(b.ask('1'), 'held');
  b.wait(60000);
  assert.equal(b.ctx.reloads, 0);
  b.run.idx = 2; b.tell(true);                        // its turn
  b.wait(60000);
  b.run.idx = 3; b.tell(false);                       // and off again
  b.wait(700);
  assert.equal(b.ctx.reloads, 1);
  // a two-board rotation, where the board off screen is always next: still after one showing
  const two = board({ run: { idx: 1, seq: ['fids.html', 'gids.html'] } });
  two.tell(false);
  two.wait(30000);
  assert.equal(two.ask('1'), 'held');
  two.run.idx = 0; two.tell(true);
  two.wait(60000);
  two.run.idx = 1; two.tell(false);
  two.wait(700);
  assert.equal(two.ctx.reloads, 1);
});

test('a tour: a frame of another airport than the one on air never reloads in the rotator', () => {
  // the first board of the next airport, loaded ahead: it waits to be shown, then reloads after its fade-out
  const ahead = board({ ap: 'YHZ', run: { aps: ['YQM', 'YHZ', 'BOS'], apIdx: 0, idx: 4 } });
  ahead.tell(false);
  ahead.wait(30000);
  assert.equal(ahead.ask('1'), 'held');
  assert.equal(ahead.win._fidsReloadWhenHidden.state().spot, 'other');
  ahead.run.apIdx = 1; ahead.run.idx = 0; ahead.tell(true);   // its airport comes up, this board first
  ahead.wait(60000);
  ahead.run.idx = 1; ahead.tell(false);
  ahead.wait(700);
  assert.equal(ahead.ctx.reloads, 1, 'reloaded after its own fade-out, its airport on air');
  // the board on air when its airport goes: the rotator removes it 1.5 s after the next one is shown,
  // and a reload begun there would only load a page that is thrown away, over the new airport coming up
  const going = board({ ap: 'YQM', run: { aps: ['YQM', 'YHZ', 'BOS'], apIdx: 0, idx: 4 } });
  going.tell(true);
  going.ask('1');
  going.run.apIdx = 1; going.run.idx = 0; going.tell(false);  // advance(): the airport moves on, then the inactive
  going.wait(5000);
  assert.equal(going.ctx.reloads, 0);
});

// v24188 — stream 2 tours with rotate=gids,fids,gids,bids. A tour moves to the next airport
// at the end of every pass and removes the frames of the one it leaves 1.5 s after the next
// one is shown, so a page that does not come again in the pass is never seen again: the gate
// during the baggage screen, departures during the second gate and the baggage. A reload
// there booted a board that was thrown away, beside the next airport loading.
const STREAM2 = ['gids.html', 'fids.html', 'gids.html', 'bids.html'];
const tour = (page, idx) => board({ page, ap: 'JFK', run: { aps: ['YUL', 'JFK', 'LAX'], apIdx: 1, idx, seq: STREAM2, isTour: true } });

test('a tour: the gate asked during its second showing never reloads before its airport goes', () => {
  const g = tour('gids.html', 2);
  g.tell(true);                                       // on air, its second showing
  assert.equal(g.ask('self-update'), 'held');
  assert.equal(g.spot(), 'later', 'the screen on air is never other');
  g.wait(90000);
  g.run.idx = 3; g.tell(false);                       // advance(): the baggage screen comes up
  assert.equal(g.spot(), 'other', 'not shown again in this pass');
  g.wait(700);
  assert.equal(g.ctx.reloads, 0, 'not after its fade-out, though the gate is the first page of the run');
  g.wait(60000);                                      // the whole baggage screen
  g.run.apIdx = 2; g.run.idx = 0;                     // Los Angeles up; the JFK frames go 1.5 s later
  g.wait(2300);
  assert.equal(g.ctx.reloads, 0, 'never reloaded: removed at the switch');
});

test('a tour: departures asked during the second gate or the baggage screen never reload', () => {
  for (const idx of [2, 3]) {
    const f = tour('fids.html', 1);
    f.tell(true);                                     // on air at idx 1
    f.wait(60000);
    f.run.idx = 2; f.tell(false);                     // the second gate comes up
    f.wait(5000);
    if (idx === 3) { f.run.idx = 3; f.wait(60000); }  // and then the baggage
    assert.equal(f.ask('1'), 'held', 'asked during idx ' + idx);
    assert.equal(f.spot(), 'other');
    f.wait(60000);
    assert.equal(f.ctx.reloads, 0, 'idx ' + idx);
  }
});

test('a tour: a page that comes again later in the pass reloads as before', () => {
  // the gate asked during its first showing comes again at idx 2: it reloads after its fade-out
  const g = tour('gids.html', 0);
  g.tell(true);
  assert.equal(g.ask('1'), 'held');
  g.run.idx = 1; g.tell(false);
  assert.equal(g.spot(), 'next');
  g.wait(700);
  assert.equal(g.ctx.reloads, 1);
  // the baggage board, off screen while the first gate is on air, is shown at idx 3: at once
  const b = tour('bids.html', 0);
  b.tell(false);
  b.wait(30000);
  assert.equal(b.spot(), 'later');
  assert.equal(b.ask('1'), 'now');
  assert.equal(b.ctx.reloads, 1);
  // a run of one airport is no tour: its pages always come round again, and nothing changes there
  const one = board({ page: 'gids.html', run: { idx: 3, seq: STREAM2, isTour: false } });
  one.tell(false);
  one.wait(30000);
  assert.equal(one.spot(), 'next');
  // and the rule never fires where the next airport of the run is this one
  const same = board({ page: 'gids.html', ap: 'JFK', run: { aps: ['JFK', 'JFK'], apIdx: 0, idx: 3, seq: STREAM2, isTour: true } });
  assert.equal(same.spot(), 'next');
});

test('the tour rule stands on rotate.html: every wrap of a tour changes airport, and a tour lists no airport twice', () => {
  // the next airport at every wrap to the first page, and apdwell only ends a pass sooner
  assert.match(ROT, /var nextAp = \(isTour && nextIdx === 0\) \? aps\[nextApIdx\] : curAp;/);
  assert.match(ROT, /if \(isTour && apDwellMs && \(Date\.now\(\) - airportStart\) >= apDwellMs\) nextIdx = 0;/);
  // the airport left is removed 1.5 s after the next one is shown
  assert.match(ROT, /if \(nextAp !== curAp\) \{ retire = curAp; apIdx = nextApIdx; \}/);
  assert.match(ROT, /setTimeout\(function \(\) \{ try \{ destroyAirport\(retire\); \} catch \(e\) \{\} \}, 1500\);/);
  // no airport twice, and the skip of an empty airport never lands on the one on air
  assert.match(ROT, /aps = aps\.filter\(function \(c, i\) \{ return aps\.indexOf\(c\) === i; \}\);/);
  assert.match(ROT, /if \(aps\[nextApIdx\] === curAp\) nextApIdx = \(nextApIdx \+ 1\) % aps\.length;/);
  // the view of the run the board reads names the tour
  assert.match(ROT, /return \{ aps: aps, apIdx: apIdx, idx: idx, seq: seq, isTour: isTour,/);
});

// v24188 — the fixed wait counts from the inactive message, and on a busy box the fade of the
// rotator starts late, so the new document could replace a board still faintly seen. After it,
// the door waits for the frame to read hidden (rotate.html turns it hidden when the fade is over).
test('after its fixed wait the reload waits for the frame to read hidden, 3 s at the most', () => {
  const b = board({ lag: 500 });                      // the fade-out begins half a second late
  b.tell(true);
  b.ask('1');
  b.tell(false);
  b.wait(700);
  assert.equal(b.vis(), 'visible');
  assert.equal(b.ctx.reloads, 0, 'not while the frame can still be seen, though the fixed wait is over');
  b.wait(399);
  assert.equal(b.ctx.reloads, 0);
  b.wait(1);                                          // 1.1 s: the fade is over, read by the look of that moment
  assert.equal(b.vis(), 'hidden');
  assert.equal(b.ctx.reloads, 1, 'once it reads hidden');
  b.wait(20 * 60000);
  assert.equal(b.ctx.reloads, 1, 'once');
  // a frame that never reads hidden: 3 s after the fixed wait, whatever it shows
  const s = board({ stuck: true });
  s.tell(true);
  s.ask('1');
  s.tell(false);
  s.wait(700 + 2999);
  assert.equal(s.ctx.reloads, 0);
  s.wait(1);
  assert.equal(s.ctx.reloads, 1, 'at the cap');
  // back on air during that wait: the wait is dropped, and the next fade-out takes it
  const a = board({ lag: 2000 });
  a.tell(true);
  a.ask('1');
  a.tell(false);
  a.wait(1500);
  a.tell(true);
  a.wait(60000);
  assert.equal(a.ctx.reloads, 0, 'never on air');
  a.set('lag', 0);
  a.tell(false);
  a.wait(700);
  assert.equal(a.ctx.reloads, 1);
  // a board already off screen, its frame hidden: at once, as before
  const off = board({ run: { idx: 3 } });
  off.tell(false);
  off.wait(30000);
  assert.equal(off.ask('1'), 'now');
  // a frame whose style cannot be read: at the end of the fixed wait, as before
  const blind = board({ css: false, lag: 500 });
  blind.tell(true);
  blind.ask('1');
  blind.tell(false);
  blind.wait(699);
  assert.equal(blind.ctx.reloads, 0);
  blind.wait(1);
  assert.equal(blind.ctx.reloads, 1);
});

test('15 minutes after the request it reloads whatever the state', () => {
  const b = board();
  b.tell(true);
  b.ask('1');
  b.wait(15 * 60000 - 1);
  assert.equal(b.ctx.reloads, 0);
  b.wait(1);
  assert.equal(b.ctx.reloads, 1, 'a board never told it is off screen still takes the build');
  b.wait(60 * 60000);
  assert.equal(b.ctx.reloads, 1, 'once');
  // a cap timer that never fired (a throttled frame): the next request past the 15 minutes reloads at once
  const r = board();
  r.tell(true);
  r.ask('1');
  r.dropTimers();
  r.jump(15 * 60000);
  assert.equal(r.ctx.reloads, 0);
  assert.equal(r.ask('1'), 'now');
  assert.equal(r.ctx.reloads, 1);
});

test('both reload paths of the board go through the one door, with their own guards kept', () => {
  // the build watchdog: its five quiet minutes and twenty hidden ones stay, then the door
  const wd = CORE.slice(end, CORE.indexOf('// v23424 — RESCUE A ROTATOR', end));
  assert.match(wd, /if \(_newBuild && Date\.now\(\) - _lastInput > 5 \* 60000\) \{/);
  assert.match(wd, /if \(Date\.now\(\) - _hiddenSince < 20 \* 60000\) return;/);
  assert.match(wd, /_fidsReloadWhenHidden\(document\.hidden \? '2' : '1'\);/);
  assert.doesNotMatch(wd, /_fidsReloadNow\(|location\.reload\(\)/, 'no reload of its own');
  // the self-update: its once a build guard, then the door
  const su = CORE.slice(CORE.indexOf('// ── SELF-UPDATE'), CORE.indexOf('// ── GATE SCREEN AUTO-CYCLE'));
  assert.match(su, /if \(t === _tried\) return;\s*try \{ sessionStorage\.setItem\('fids_su_tried', t\); \} catch \(e\) \{\}/);
  assert.match(su, /if \(typeof _fidsReloadWhenHidden === 'function'\) _fidsReloadWhenHidden\('self-update'\);\s*else location\.reload\(\);/);
  assert.equal(su.split('location.reload()').length - 1, 1, 'its only other reload is the fallback for a page without the door');
  // v24144: a held build on show, a hidden load on show and the resume watchdog reach it as well
  const inView = CORE.slice(CORE.indexOf('function _fidsReloadInView(why) {'), CORE.indexOf('// v24188 — NO BOARD RELOADS ITSELF ON AIR.'));
  assert.match(inView, /_fidsReloadWhenHidden\(why\);/);
  assert.doesNotMatch(inView, /_fidsReloadNow\(why\)/);
});

test('a board reloaded off screen starts with its brake on: the load hook of the rotator tells it so', () => {
  // the load hook tells a frame it is on air only when it is the active one or the next one
  assert.match(ROT, /addEventListener\('load', function \(\) \{ f\._ocLoadedAt = Date\.now\(\); ocTell\(f, f\.classList\.contains\('oc-active'\) \|\| !!f\._ocIncoming\); \}\);/);
  // and the brake takes an inactive as off screen (it starts on air until told otherwise)
  const s = CORE.lastIndexOf('(function () {', CORE.indexOf('window._ocIdle = function'));
  let depth = 0, j = CORE.indexOf('{', s);
  for (; j < CORE.length; j++) { if (CORE[j] === '{') depth++; else if (CORE[j] === '}' && --depth === 0) break; }
  let handler = null;
  const win = { addEventListener: (t, fn) => { if (t === 'message') handler = fn; } };
  vm.runInNewContext(CORE.slice(s, j + 1) + ')();', { window: win, setInterval() { return 0; } });
  assert.equal(win._ocIdle(), false, 'a fresh load is awake');
  handler({ data: { oc: 'inactive' } });
  assert.equal(win._ocIdle(), true, 'the load hook puts it to sleep, as every board loaded behind the screen');
});
