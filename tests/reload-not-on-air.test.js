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
// is over; a board already off screen reloads at once unless it is the next one up;
// 15 minutes after the request it reloads whatever the state.
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
function board(o) {
  o = Object.assign({ rotator: true, top: false, page: 'fids.html', ap: 'YQM', fade: '0.6s' }, o || {});
  const run = Object.assign({ aps: ['YQM'], apIdx: 0, idx: 0, seq: SEQ }, o.run || {});
  let now = 1e9;
  const timers = [];
  const listeners = {};
  const store = {};
  let visible = true;   // the brake at the top of fids-core.js: on air until told otherwise
  const parent = {
    __ocRotator: o.rotator ? { get: () => run } : undefined,
    document: { documentElement: { style: { getPropertyValue: (k) => (k === '--oc-fade' ? o.fade : '') } } },
  };
  const win = {
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    requestAnimationFrame: (f) => f(),
    frameElement: { getAttribute: (k) => (k === 'data-oc-page' ? o.page : k === 'data-oc-ap' ? o.ap : null) },
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
  const tell = (on) => { visible = on; for (const f of listeners.message || []) f({ data: { oc: on ? 'active' : 'inactive' } }); };
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
