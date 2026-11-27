'use strict';
// WHY THIS EXISTS
//
// v24186. THE NEXT BOARD IS WOKEN AT THE FADE-OUT, NOT AT THE FADE-IN.
// Reported: on the rotation switch the logos move as a board first appears.
// rotate.html told the incoming board it was on screen only in showNow(), the
// instant its fade-in began, so the work it had skipped while hidden (the
// janitors, a full render, the column stretch) landed while it was already
// fading up. Now advance() tells it as soon as the outgoing board starts to fade
// out, so the catch-up runs while it is still invisible; a board that finishes
// loading in between is told the same (the load hook reads _ocIncoming); showNow
// tells it again, which the board ignores (a repeated state does nothing).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', 'fids-current');
const ROT = fs.readFileSync(path.join(root, 'rotate.html'), 'utf8');
const CORE = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');

function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(i, j + 1);
}

test('advance() tells the incoming board at the start of the fade-out, before showNow is scheduled', () => {
  const adv = fnSource(ROT, 'advance');
  const out = adv.indexOf('ocTell(cur, false);');
  const wake = adv.indexOf('ocTell(nxt, true);');
  const mark = adv.indexOf('nxt._ocIncoming = true;');
  const sched = adv.indexOf('setTimeout(showNow, FADE_MS + HOLD_MS);');
  assert.ok(out > 0 && wake > out && mark > out && mark < wake && sched > wake,
    'the order is: outgoing told, incoming marked and told, then the fade-in scheduled');
});

test('a frame that loads during the switch is told it is next, and showNow clears the mark', () => {
  assert.match(ROT, /addEventListener\('load', function \(\) \{ f\._ocLoadedAt = Date\.now\(\); ocTell\(f, f\.classList\.contains\('oc-active'\) \|\| !!f\._ocIncoming\); \}\);/);
  const show = fnSource(ROT, 'showNow');
  assert.ok(show.indexOf('f._ocIncoming = false;') > 0 && show.indexOf('f._ocIncoming = false;') < show.indexOf("f.classList.add('oc-active');"));
});

test('the board ignores the repeated active that showNow sends', () => {
  // the hidden-board brake of fids-core: run it with a fake window and count the catch-ups
  const start = CORE.lastIndexOf('(function () {', CORE.indexOf('window._ocIdle = function'));
  assert.ok(start > 0, 'the brake is found');
  let depth = 0, j = CORE.indexOf('{', start);
  for (; j < CORE.length; j++) { if (CORE[j] === '{') depth++; else if (CORE[j] === '}' && --depth === 0) break; }
  const iife = CORE.slice(start, j + 1) + ')();';
  assert.match(iife, /window\._ocOnShow = function/);
  let handler = null, runs = 0;
  const win = { addEventListener: (t, fn) => { if (t === 'message') handler = fn; } };
  vm.runInNewContext(iife, { window: win, setInterval() { return 0; } });
  assert.equal(typeof handler, 'function', 'the brake listens for the rotator');
  win._ocOnShow(() => { runs++; });
  handler({ data: { oc: 'inactive' } });
  handler({ data: { oc: 'active' } });
  handler({ data: { oc: 'active' } });
  assert.equal(runs, 1, 'one catch-up for the early tell and the repeat');
});
