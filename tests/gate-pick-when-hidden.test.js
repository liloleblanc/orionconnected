'use strict';
// WHY THIS EXISTS
//
// v24188. THE GATE DRAWS ITS NEXT GATE ONLY ONCE IT IS REALLY HIDDEN.
// In the rotator the gate board walks the gates: told it is off screen (oc inactive),
// it picks the next gate and draws it, so it is ready when it comes back. It waited a
// fixed 650 ms from the message, written for a fade of about 0.45 s. The fade of the
// rotator is 0.6 s, and on a busy box (CPU x4 in the runs) it starts up to half a second
// late, so the next gate was drawn while the old one was still faintly on screen: 22
// fade-outs of one run showed the new gate at an opacity of 0.007 to 0.197, its emblem
// jumping 506 to 593 px. rotate.html turns the visibility of a frame to hidden only when
// its fade is over, so the gate now waits for that (_ocWhenFrameHidden), 3 s at the most.
// A board with no frame around it, or a frame it cannot read, keeps the 650 ms.
//
// The cycle is the shipped one (the gate auto-cycle block of fids-core.js), run with the
// helper it waits with, against a fake page in a fake rotator frame.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const a = CORE.indexOf('// ── GATE SCREEN AUTO-CYCLE');
const b = CORE.indexOf('// ── BAGGAGE CAROUSEL CYCLE', a);
assert.ok(a > 0 && b > a, 'the gate cycle is in fids-core.js');
const CYCLE = CORE.slice(a, b);

function fnSource(src, name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(i + 1, j + 1);
}
// the helper the cycle waits with (none before v24188, when the cycle kept a timer of its own)
const HELPER = fnSource(CORE, '_ocWhenFrameHidden');

// A gate board. frame: inside a rotator frame (else a top window); search: its address;
// the frame reads as rotate.html draws it: visible on air and through its fade-out after
// it is told it is off screen (fade ms, begun lag ms late on a busy box), hidden from
// then on; stuck: it never reads hidden; css false: its style cannot be read.
function gate(o) {
  o = Object.assign({ frame: true, search: '', fade: 600, lag: 0, stuck: false, css: true }, o || {});
  let now = 1e9;
  const timers = [];
  const listeners = [];
  const renders = [];
  let shown = true, offAt = null;
  const frame = {};
  const vis = () => ((o.stuck || shown || offAt === null || now < offAt + o.lag + o.fade) ? 'visible' : 'hidden');
  const parent = { getComputedStyle: o.css ? (el) => ({ visibility: el === frame ? vis() : 'visible' }) : undefined };
  const win = { location: { search: o.search }, addEventListener: (n, f) => { if (n === 'message') listeners.push(f); } };
  win.self = win;
  win.top = o.frame ? parent : win;
  win.parent = o.frame ? parent : win;
  win.frameElement = o.frame ? frame : null;
  const add = (f, ms, every) => { timers.push({ f, at: now + (ms || 0), every }); return timers.length; };
  const drop = (id) => { if (timers[id - 1]) timers[id - 1].f = null; };
  const ctx = {
    window: win, URLSearchParams, Math,
    Date: { now: () => now },
    setTimeout: (f, ms) => add(f, ms, 0), clearTimeout: drop,
    setInterval: (f, ms) => add(f, ms, ms), clearInterval: drop,
    screenType: 'gate', data: { dep: [{}] }, subScreenVal: 'A1',
    _gateLiveGates: () => ['A1', 'A2', 'A3'],
    document: { getElementById: () => null },
    render: () => { renders.push({ at: now, vis: vis(), gate: ctx.subScreenVal }); },
  };
  vm.runInNewContext(HELPER + '\n' + CYCLE, ctx);
  const tell = (on) => {
    if (!on && shown) offAt = now;                    // the class comes off as the message goes: the fade-out begins
    shown = on;
    for (const f of listeners) f({ data: { oc: on ? 'active' : 'inactive' } });
  };
  const wait = (ms) => {
    const until = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.f && t.at <= until).sort((x, y) => x.at - y.at)[0];
      if (!due) break;
      now = due.at;
      const f = due.f;
      if (due.every) due.at += due.every; else due.f = null;
      f();
    }
    now = until;
  };
  return { ctx, renders, tell, wait, vis, now: () => now };
}

test('in the rotator the next gate is drawn only once the frame reads hidden, never while it can be seen', () => {
  // the fade begins on time: the frame reads hidden 0.6 s after the inactive, and the gate is drawn then
  const g = gate();
  g.tell(true);
  g.wait(60000);
  const t = g.now();
  g.tell(false);
  g.wait(599);
  assert.deepEqual(g.renders, [], 'nothing while the board fades out');
  g.wait(1);
  assert.equal(g.renders.length, 1, 'drawn when the frame reads hidden');
  assert.equal(g.renders[0].at - t, 600);
  assert.equal(g.renders[0].vis, 'hidden');
  assert.notEqual(g.renders[0].gate, 'A1', 'a new gate');
  // the fade begins half a second late on a busy box: past the 650 ms the cycle used to wait
  const l = gate({ lag: 500 });
  l.tell(true);
  l.wait(60000);
  const tl = l.now();
  l.tell(false);
  l.wait(1099);
  assert.deepEqual(l.renders, [], 'not at 650 ms, nor at any moment the frame can still be seen');
  l.wait(1);
  assert.equal(l.renders.length, 1);
  assert.equal(l.renders[0].at - tl, 1100);
  assert.equal(l.renders[0].vis, 'hidden');
  // and the next showing is the new gate, the walk going on at every fade-out
  l.tell(true);
  l.wait(60000);
  l.tell(false);
  l.wait(1100);
  assert.equal(l.renders.length, 2);
  assert.ok(l.renders.every((r) => r.vis === 'hidden'), 'every gate drawn while hidden');
  // a frame that never reads hidden: drawn at the cap, 3 s after the inactive
  const s = gate({ stuck: true });
  s.tell(true);
  s.wait(60000);
  const ts = s.now();
  s.tell(false);
  s.wait(2999);
  assert.deepEqual(s.renders, []);
  s.wait(1);
  assert.equal(s.renders.length, 1, 'at the cap');
  assert.equal(s.renders[0].at - ts, 3000);
  // a frame hidden already when it is told (the load of a board behind the screen): at once
  const h = gate();
  h.tell(false);
  h.wait(5000);
  h.renders.length = 0;
  h.tell(false);
  assert.equal(h.renders.length, 1, 'no fade to wait for');
  // back on air before the frame reads hidden (900 ms into a late fade): the pick still
  // waiting is dropped, as main drops its timer, so no gate is drawn while it can be seen
  const m = gate({ lag: 500 });
  m.tell(true);
  m.wait(60000);
  m.tell(false);
  m.wait(900);
  m.tell(true);
  m.wait(10000);
  assert.deepEqual(m.renders, [], 'no pick');
  assert.equal(m.ctx.subScreenVal, 'A1', 'the gate shown stays');
});

test('outside a frame, or a frame it cannot read, it waits 650 ms as before; an active mid-wait cancels the pick as on main', () => {
  // a top window walking the gates (?gatecycle=60): its interval, then the 650 ms when told inactive
  const top = gate({ frame: false, search: '?gatecycle=60' });
  top.wait(60000);
  assert.equal(top.renders.length, 1, 'a standalone walk on its own interval');
  const t = top.now();
  top.tell(false);
  top.wait(649);
  assert.equal(top.renders.length, 1);
  top.wait(1);
  assert.equal(top.renders.length, 2);
  assert.equal(top.renders[1].at - t, 650);
  top.wait(10 * 60000);
  assert.equal(top.renders.length, 2, 'a rotator message stops the interval');
  // a frame whose style cannot be read: 650 ms, however late its fade
  const blind = gate({ css: false, lag: 500 });
  blind.tell(true);
  blind.wait(60000);
  const tb = blind.now();
  blind.tell(false);
  blind.wait(649);
  assert.deepEqual(blind.renders, []);
  blind.wait(1);
  assert.equal(blind.renders.length, 1);
  assert.equal(blind.renders[0].at - tb, 650);
  // main clears the pending pick on any message: an active one before it lands keeps the gate
  const m = gate();
  m.tell(true);
  m.wait(60000);
  m.tell(false);
  m.wait(300);
  m.tell(true);
  m.wait(10000);
  assert.deepEqual(m.renders, [], 'active at 300 ms: no pick');
  assert.equal(m.ctx.subScreenVal, 'A1', 'the gate shown stays');
  // and its next fade-out picks, as ever
  m.tell(false);
  m.wait(700);
  assert.equal(m.renders.length, 1);
  assert.notEqual(m.ctx.subScreenVal, 'A1');
});

test('the cycle waits through _ocWhenFrameHidden, with the fixed wait it had as the fallback', () => {
  assert.ok(HELPER, '_ocWhenFrameHidden is a top-level function of fids-core.js');
  assert.match(CYCLE, /_pickWait = _ocWhenFrameHidden\(function \(\) \{ _pickWait = null; pickGate\(\); \}, 3000, 650\);/);
  assert.match(CYCLE, /if \(_pickWait\) \{ _pickWait\(\); _pickWait = null; \}/);
  assert.doesNotMatch(CYCLE, /setTimeout\([^)]*pickGate/, 'no fixed timer of its own');
  assert.doesNotMatch(CYCLE, /completes \(~0\.45s\)/, 'the comment no longer gives the fade as about 0.45 s');
  // the helper polls with setTimeout, never with animation frames (a hidden frame may get none)
  assert.match(HELPER, /t = setTimeout\(look, 50\);/);
  assert.doesNotMatch(HELPER, /requestAnimationFrame/);
  assert.match(HELPER, /window\.parent\.getComputedStyle\(fe\)\.visibility/);
  // and rotate.html turns the visibility of a frame hidden only when its fade is over
  const ROT = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'rotate.html'), 'utf8');
  assert.match(ROT, /transition: opacity var\(--oc-fade, \.6s\) ease, visibility 0s linear var\(--oc-fade, \.6s\);/);
});
