'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23937 — NO NIGHT-STORM TAKE FLASHES MORE THAN THREE TIMES IN A SECOND.
//
// The general-flash limit (WCAG 2.3.1, taken from ITU-R BT.1702): a flash is a
// pair of opposing changes of at least 10% of maximum relative luminance with
// the darker side below 0.80, over at least a quarter of a 10-degree field
// (21,824 px of a 1680x1050 board). More than three flashes, i.e. more than
// six transitions, in any one second fails. The weather card plays these
// takes at every airport and stream 2 broadcasts them.
//
// Measured on the DECODED files (AVFoundation), on the part the card shows
// (cover-cropped into 842x849 at 1680x1050), every frame, every 1 s window
// including the loop seam, by two independent methods that agree on every
// verdict:
//   F  the mean luminance of every 10-degree field, through a 0.10 zig-zag
//      (scripts/wx-scenes/flashcheck.swift, the F_field column);
//   P  frame pairs: the longest alternating chain of transitions inside 1 s,
//      each over >= 25% of a 10-degree field's cells, with the field's mean
//      moving the same way (scripts/wx-scenes/flashpairs.swift).
// Max transitions in any 1 s (F / P):
//   12821882  8 / 10   2018910  8 / 8    4915798  8 / 8    5018766  9 / 8
//   82480163  9 / 9    85833526 10 / 10  4846434  1 / 2   (passes)
//   rain-night 74469118 0 / 0, 75453636 1 / 1, 77132356 3 / 3 (all pass)
// The verdicts hold at the older 903x496 scene size too. No other take on
// the card goes past 5 by P.
// Lightning restrikes flicker at 7-10 Hz; that is what fails, not the colour.
// Lightning stays white and allowed.
//
// v23943 — RE-CUTS. The six sources were cut again (scripts/wx-scenes/
// takes.swift) on windows that hold one strike, or calm sky between strikes,
// slowed to 0.5x or 0.65x where a restrike needed it; each is
// <source id>-<letter>. Every take in the lightning slots now carries four
// readings (F and P, at 842x849 and at 903x496), and the worst of the four is
// what counts. A cut must also be free of rolling-shutter tears: a strike
// shorter than the camera's readout lights only part of a frame and leaves a
// hard horizontal edge, a glitch rather than weather. Seven re-cuts pass both
// and look clean behind the card. Three more were inside the flash limit but
// tore on a strike, so they are not drawn (TORN below). 85833526 tears on
// every strike; 5018766 tears on every strike and is near black between them.
// Both have cuts inside the flash limit, but neither has a usable window.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const JS = SRC.replace(/^\s*\/\/.*$/gm, '');
const VIDEO = path.join(ROOT, 'fids-current/logos/Backgrounds/video');

function table() {
  const at = JS.indexOf('var _WX_SCENE_TAKES = ');
  assert.ok(at >= 0, 'fids-core.js defines _WX_SCENE_TAKES');
  let d = 0, k = JS.indexOf('{', at);
  for (; k < JS.length; k++) {
    if (JS[k] === '{') d++;
    else if (JS[k] === '}') { d--; if (d === 0) break; }
  }
  return new Function('return ' + JS.slice(JS.indexOf('{', at), k + 1))();
}
const names = (list) => list.map((e) => (typeof e === 'object' ? e.f : e));

// Max transitions in any 1 s, measured on the decoded file, every frame,
// every window including the loop seam:
//   [F at 842x849, F at 903x496, P at 842x849, P at 903x496]
// F = flashcheck.swift's F_field column, P = flashpairs.swift's
// maxTransitions1s at a field stride of 1 (`flashpairs <clip> W H 1`), so
// every 10-degree field position is tried; the default stride of 3 tries
// every third and can read lower (4915798-c reads 2 there, 4 here).
// 842x849 is the size the card draws a scene at on a 1680x1050 board;
// 903x496 is the older scene size. A take is drawn only if it is listed here
// and its worst reading is 6 or fewer (three flashes): a new take gets
// measured before it can play.
const MEASURED = {
  'wx-scene-storm-night-4846434':    [1, 0, 2, 1],
  'wx-scene-storm-night-12821882-a': [1, 0, 2, 0],
  'wx-scene-storm-night-2018910-a':  [2, 2, 4, 2],
  'wx-scene-storm-night-82480163-c': [1, 0, 2, 2],
  'wx-scene-storm-night-4915798-a':  [3, 3, 4, 4],
  'wx-scene-storm-night-4915798-b':  [2, 2, 2, 2],
  'wx-scene-storm-night-4915798-c':  [2, 2, 4, 2],
  'wx-scene-storm-night-4915798-d':  [3, 3, 4, 3],
  'wx-scene-rain-night-74469118':    [0, 0, 0, 0],
  'wx-scene-rain-night-75453636':    [1, 0, 1, 0],
  'wx-scene-rain-night-77132356':    [3, 2, 3, 2],
  'wx-scene-storm-day-1615031':      [0, 0, 1, 1],
  'wx-scene-storm-day-1797779':      [1, 1, 1, 1],
  'wx-scene-storm-day-52189937':     [0, 0, 0, 0],
  'wx-scene-storm-day-52873990':     [0, 0, 0, 0],
  'wx-scene-storm-day-5905698':      [1, 1, 2, 2],
  'wx-scene-storm-day-7537320':      [1, 1, 2, 1],
  'wx-scene-storm-day-82114209':     [2, 0, 3, 2]
};
const LIMIT = 6; // transitions in any 1 s; a flash is a pair, so three flashes
const worst = (f) => Math.max(...MEASURED[f]);
const OVER_THE_LIMIT = {
  'wx-scene-storm-night-12821882': 8,
  'wx-scene-storm-night-2018910': 8,
  'wx-scene-storm-night-4915798': 8,
  'wx-scene-storm-night-5018766': 9,
  'wx-scene-storm-night-82480163': 9,
  'wx-scene-storm-night-85833526': 10
};

// Re-cuts inside the flash limit that tore on a strike (see the header).
// They never shipped; this keeps them from being added back by their name.
const TORN = {
  'wx-scene-storm-night-82480163-a': 'source 1.4-6.6 s: a lit band on the strike at source 5.6 s',
  'wx-scene-storm-night-82480163-b': 'source 6.0-15.0 s: a hard edge across the frame at source 12.7 s',
  'wx-scene-storm-night-85833526-a': 'source 5.9-10.4 s: bands on both strikes'
};

test('a re-cut that tore on a strike is not drawn, however few flashes it has', () => {
  const t = table();
  const all = Object.keys(t).flatMap((slot) => names(t[slot]));
  for (const f of Object.keys(TORN)) {
    assert.ok(!all.includes(f), `${f} is drawn, but it tears (${TORN[f]})`);
    assert.ok(!(f in MEASURED), `${f} is recorded as a passing take, but it tears (${TORN[f]})`);
  }
});

test('the takes that flash more than three times a second are out of the rotation', () => {
  const t = table();
  const all = Object.keys(t).flatMap((slot) => names(t[slot]));
  for (const f of Object.keys(OVER_THE_LIMIT)) {
    assert.ok(OVER_THE_LIMIT[f] > 6);
    assert.ok(!all.includes(f), `${f} (${OVER_THE_LIMIT[f]} transitions in 1 s) is still drawn`);
  }
});

test('every take in the lightning and night-rain slots was measured inside the limit, by both tools at both sizes', () => {
  const t = table();
  for (const slot of ['storm-night', 'rain-night', 'storm-day']) {
    for (const f of names(t[slot])) {
      assert.ok(f in MEASURED, `${slot} draws ${f}, which has not been measured for flashes`);
      assert.equal(MEASURED[f].length, 4, `${f} needs all four readings: F and P, at 842x849 and 903x496`);
      assert.ok(MEASURED[f].every((n) => Number.isInteger(n) && n >= 0), `${f} has a reading that is not a count`);
      assert.ok(worst(f) <= LIMIT, `${f} measured ${worst(f)} transitions in 1 s; the limit is ${LIMIT} (three flashes)`);
    }
  }
});

test('nothing measured is recorded over the limit, so the record cannot vouch for a strobe', () => {
  for (const f of Object.keys(MEASURED)) {
    assert.ok(worst(f) <= LIMIT, `${f} is recorded at ${worst(f)}; a take over the limit belongs in OVER_THE_LIMIT`);
    assert.ok(!(f in OVER_THE_LIMIT), `${f} is recorded as both passing and failing`);
  }
});

test('the night storm shuffles again: the take that passed stays, joined by measured re-cuts', () => {
  const t = table();
  const list = names(t['storm-night']);
  const distinct = [...new Set(list)];
  assert.equal(list[0], 'wx-scene-storm-night-4846434', 'the take that always passed still opens the slot');
  assert.ok(distinct.length >= 3, `storm-night holds ${distinct.length} distinct takes; the shuffle needs at least 3`);
  for (const f of distinct) {
    if (f === 'wx-scene-storm-night-4846434') continue;
    const m = f.match(/^(wx-scene-storm-night-\d+)-[a-z]$/);
    assert.ok(m, `${f} must be <source id>-<letter>, a re-cut of a licensed source`);
    assert.ok(m[1] in OVER_THE_LIMIT, `${f} is a re-cut of ${m[1]}, which is not one of the six licensed sources`);
    assert.ok(fs.existsSync(path.join(VIDEO, f + '.mp4')), `${f}.mp4 is listed but not on disk`);
  }
});

test('no one source takes over the night storm', () => {
  // Four of the seven re-cuts come from 4915798; the single-cut sources are
  // listed twice so that one look does not come round half the time.
  const list = names(table()['storm-night']);
  const bySource = {};
  for (const f of list) {
    const src = f.replace(/-[a-z]$/, '');
    bySource[src] = (bySource[src] || 0) + 1;
  }
  for (const src of Object.keys(bySource)) {
    assert.ok(bySource[src] / list.length < 0.5, `${src} is ${bySource[src]} of ${list.length} storm-night draws`);
  }
});

test('the files stay on disk: licensed footage, out of the draw, ready to re-cut', () => {
  for (const f of Object.keys(OVER_THE_LIMIT)) {
    assert.ok(fs.existsSync(path.join(VIDEO, f + '.mp4')), `${f}.mp4 was deleted; only the draw was meant to change`);
  }
});
