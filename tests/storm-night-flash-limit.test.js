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

// Max transitions in any 1 s, method F, at the card's drawn size. A take is
// drawn only if it is listed here at 6 or fewer: a new take gets measured
// before it can play (flashcheck.swift's F_field column, confirmed by
// flashpairs.swift).
const MEASURED = {
  'wx-scene-storm-night-4846434': 1,
  'wx-scene-rain-night-74469118': 0,
  'wx-scene-rain-night-75453636': 1,
  'wx-scene-rain-night-77132356': 3
};
const OVER_THE_LIMIT = {
  'wx-scene-storm-night-12821882': 8,
  'wx-scene-storm-night-2018910': 8,
  'wx-scene-storm-night-4915798': 8,
  'wx-scene-storm-night-5018766': 9,
  'wx-scene-storm-night-82480163': 9,
  'wx-scene-storm-night-85833526': 10
};

test('the takes that flash more than three times a second are out of the rotation', () => {
  const t = table();
  const all = Object.keys(t).flatMap((slot) => names(t[slot]));
  for (const f of Object.keys(OVER_THE_LIMIT)) {
    assert.ok(OVER_THE_LIMIT[f] > 6);
    assert.ok(!all.includes(f), `${f} (${OVER_THE_LIMIT[f]} transitions in 1 s) is still drawn`);
  }
});

test('every night storm and night rain take that can play was measured inside the limit', () => {
  const t = table();
  for (const slot of ['storm-night', 'rain-night']) {
    for (const f of names(t[slot])) {
      assert.ok(f in MEASURED, `${slot} draws ${f}, which has not been measured for flashes`);
      assert.ok(MEASURED[f] <= 6, `${f} measured ${MEASURED[f]} transitions in 1 s; the limit is 6`);
    }
  }
});

test('the night storm keeps its lightning: the take that passes stays', () => {
  const t = table();
  assert.deepEqual(names(t['storm-night']), ['wx-scene-storm-night-4846434']);
});

test('the files stay on disk: licensed footage, out of the draw, ready to re-cut', () => {
  for (const f of Object.keys(OVER_THE_LIMIT)) {
    assert.ok(fs.existsSync(path.join(VIDEO, f + '.mp4')), `${f}.mp4 was deleted; only the draw was meant to change`);
  }
});
