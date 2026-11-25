'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// A WEATHER CLIP OFF THE PAGE STAYS STILL.
//
// Taking a <video> out of the page pauses it; a play() after that runs it for
// good, unseen, and the browser may drop neither it nor the gate screen it
// hangs in. The weather card starts its loops 3.8 seconds in, from a timer, so
// a card replaced before that left up to three clips running on every visit:
// after 15 hours one board was decoding about twenty. This file runs the real
// functions with the card gone, carried across a rebuild, and left in place.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
function fnBody(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must define ${name}`);
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(at, k + 1); }
  }
  assert.fail(`unterminated ${name}`);
}

// A clip that behaves as a browser's does: leaving the page pauses it.
function clip() {
  const v = {
    isConnected: true, paused: false, currentTime: 0, playbackRate: 1, plays: 0,
    play() { v.plays++; v.paused = false; return { catch() {} }; },
    pause() { v.paused = true; },
    leave() { v.isConnected = false; v.paused = true; },
    back() { v.isConnected = true; },
  };
  return v;
}
function card(n, withFilm) {
  const vids = Array.from({ length: n }, clip);
  const film = withFilm ? clip() : null;
  const w = {
    vids, film, classes: new Set(['wxc-entering']),
    classList: { contains: c => w.classes.has(c), add: c => w.classes.add(c) },
    style: { setProperty() {} },
    querySelectorAll: sel => (sel === ':scope > video.wxc-vid' ? vids : []),
    querySelector: sel => (sel === ':scope > video.wxc-vid' ? vids[0]
      : sel === ':scope > .wxc-intro' ? {}
      : sel === ':scope > .wxc-intro > video.wxc-intro-bg' ? film : null),
    leave() { vids.forEach(v => v.leave()); if (film) film.leave(); },
    back() { vids.forEach(v => v.back()); if (film) film.back(); },
  };
  return w;
}
function kit(now = 1_800_000_000_000) {
  const timers = [], win = { _wxEntranceAt: now, _wxEntrancePlayedSeq: 1, _gateAdVisitSeq: 1 };
  const clock = { t: now };
  const make = new Function('window', 'Date', 'setTimeout', 'clearTimeout', '_wxSpeed', '_WXC_ENTRANCE_MS',
    '_WXC_ENTRANCE_INTRO_S', '_WX_INTRO_BG_SPAN', '_wxFitIntroPaint',
    ['_wxPlayLive', '_wxHoldSceneForIntro', '_wxCarryEntrance', '_wxResumeMedia'].map(fnBody).join('\n')
    + '\nreturn { _wxPlayLive, _wxHoldSceneForIntro, _wxCarryEntrance, _wxResumeMedia };');
  const fns = make(win, { now: () => clock.t }, (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, () => {},
    () => 1, 36000, 6, 6, () => {});
  return { ...fns, win, clock, timers, fire: () => timers.splice(0).forEach(t => t.fn()) };
}

test('the loops of a card that stays start at 3.8 seconds', () => {
  const k = kit(), w = card(3, true);
  k._wxHoldSceneForIntro(w);
  assert.ok(w.vids.every(v => v.paused), 'held under the film');
  assert.equal(k.timers[0].ms, 3800);
  k.fire();
  assert.ok(w.vids.every(v => !v.paused), 'all three, moving');
});

test('a card replaced before that leaves nothing running', () => {
  for (const n of [1, 2, 3]) {
    const k = kit(), w = card(n, true);
    k._wxHoldSceneForIntro(w);
    w.leave();
    k.fire();
    assert.ok(w.vids.every(v => v.paused && v.plays === 0), `${n} clip(s) still`);
  }
});

test('a carried rebuild keeps the card it carries moving, and only that one', () => {
  const k = kit(), w = card(3, true);
  k._wxHoldSceneForIntro(w);
  w.leave(); w.back();              // the carousel is lifted out and put back
  k.clock.t += 1000;
  k._wxResumeMedia(w);
  assert.equal(w.film.paused, false, 'the film goes on');
  assert.ok(w.vids.every(v => v.paused), 'the loops still wait for their release');
  k.fire();
  assert.ok(w.vids.every(v => !v.paused), 'and are released on it');
  k.clock.t += 9000;
  w.leave(); w.back();
  k._wxResumeMedia(w);
  assert.ok(w.vids.every(v => !v.paused), 'a later rebuild resumes the loops');
});

test('a carousel that is not put back is not asked to play', () => {
  const k = kit(), w = card(3, true);
  w.leave();
  k.clock.t += 2000; k._wxResumeMedia(w);
  k.clock.t += 8000; k._wxResumeMedia(w);
  assert.ok(w.film.paused && w.film.plays === 0, 'not the film');
  assert.ok(w.vids.every(v => v.paused && v.plays === 0), 'not the loops');
});

test('a refused play is swallowed, a missing clip is nothing', () => {
  const k = kit();
  assert.equal(k._wxPlayLive(null), false);
  assert.equal(k._wxPlayLive({ isConnected: true, play() { throw new Error('no'); } }), false);
  let caught = 0;
  k._wxPlayLive({ isConnected: true, play: () => ({ catch: () => { caught++; } }) });
  assert.equal(caught, 1, 'a rejected promise is not an error on the board');
});

test('every play of the weather card goes through the one check', () => {
  const at = SRC.indexOf('// 2026-11-25 — A CLIP OFF THE PAGE STAYS STILL.');
  assert.ok(at > 0);
  for (const f of ['_wxHoldSceneForIntro', '_wxCarryEntrance', '_wxResumeMedia', '_wxArmEntrance']) {
    assert.doesNotMatch(fnBody(f), /\.play\(/, f);
    assert.match(fnBody(f), /_wxPlayLive\(|_wxHoldSceneForIntro\(/, f);
  }
  assert.equal((fnBody('_wxPlayLive').match(/\.play\(\)/g) || []).length, 1);
  const leave = SRC.slice(SRC.indexOf("_wxLeaveWrap.classList.add('wxc-leaving');"));
  assert.doesNotMatch(leave.slice(0, leave.indexOf('_gateAdIndex = (_gateAdIndex + 1)')), /\.play\(/, 'the leave too');
});
