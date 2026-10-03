'use strict';

// WHY THIS EXISTS
//
// v23934. A delayed departure's arrival was moved twice on the TV gate.
// renderDedicatedScreen moves arrTimeStr by the departure's delay (the gap
// between the revised and scheduled departures, or an estimate from the
// revised departure), and the phone layout prints it as it comes. uxgGateHtml
// then moved it AGAIN by the gap between the feed's new and old departure
// clocks. AC1983 revised from 5:25am to 6:40am (75 minutes), due in at
// 6:15am, read 8:45am: 150 minutes late, a time no source gave. The only
// time the delay implies is 7:30am.
//
// The arrival is now moved in one place. uxgGateHtml strikes the unmoved
// arrival through beside the moved one (_gateArrMovedHtml) and moves nothing,
// and the day line under it is the moved arrival's instant.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');

function fnSource(name) {
  const i = CORE.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moved = new Function('fidsEscHtml', fnSource('_gateArrMovedHtml') + '\nreturn _gateArrMovedHtml;')(esc);
const to12h = new Function(fnSource('_to12h') + '\nreturn _to12h;')();

test('AC1983 delayed 75 minutes arrives at 7:30am, struck beside 6:15am, not 8:45am', () => {
  // renderDedicatedScreen's primary path: 06:15 moved by the 75-minute delay.
  const html = moved({ shown: '07:30', was: '06:15', movedMs: 75 * 60000, depDelayed: true, early: false, fmt: to12h });
  assert.equal(html, '<span class="g8-r2-strike">6:15 AM</span><span class="g8-r2-revised">7:30 AM</span>');
  assert.doesNotMatch(html, /8:45/);
});

test('nothing to strike: on time, not moved, moved earlier, or the same clock', () => {
  const base = { shown: '07:30', was: '06:15', movedMs: 75 * 60000, depDelayed: true, early: false, fmt: to12h };
  assert.equal(moved({ ...base, depDelayed: false }), '', 'no published time: the field prints arrTimeStr');
  assert.equal(moved({ ...base, movedMs: 0 }), '', 'not moved (a delay of five minutes or less)');
  assert.equal(moved({ ...base, movedMs: -10 * 60000 }), '', 'an earlier estimate is not a delay');
  assert.equal(moved({ ...base, was: '07:30' }), '');
  assert.equal(moved({ ...base, was: '' }), '');
  assert.equal(moved(null), '');
  // Early ink follows the departure's word, as the departure's own pair does.
  assert.match(moved({ ...base, early: true }), /class="g8-r2-revised g8-rev-early"/);
  // A feed string that is not HH:MM comes back from _to12h unchanged; it is
  // escaped, never markup.
  assert.equal(moved({ ...base, was: '<b>x</b>' }), '<span class="g8-r2-strike">&lt;b&gt;x&lt;/b&gt;</span><span class="g8-r2-revised">7:30 AM</span>');
});

test('uxgGateHtml moves no arrival; it strikes the unmoved one beside arrTimeStr', () => {
  const uxg = fnSource('uxgGateHtml');
  assert.doesNotMatch(uxg, /delayMins|newArrMins|_cleanArr/, 'no second delay arithmetic');
  assert.doesNotMatch(uxg, /_arrShownTs\s*\+=/, 'the day is the moved arrival\'s instant, moved once');
  assert.match(uxg, /var _arrShownTs = Number\(ctx\.arrInstant\) \|\| 0;/);
  assert.match(uxg, /var _arrMovedHtml = _gateArrMovedHtml\(\{\s*shown: arrTimeStr, was: ctx\.arrSchedStr, movedMs: ctx\.arrMovedMs,\s*depDelayed: depDelayed, early: stKey === 'early', fmt: _to12h\s*\}\);\s*if \(_arrMovedHtml\) arrHtml = _arrMovedHtml;/);
});

test('renderDedicatedScreen keeps the arrival before its one move, and the move', () => {
  const r = fnSource('renderDedicatedScreen');
  // Primary path: the feed's arrival, then moved by the delay once.
  assert.match(r, /arrTimeStr = adbHHMM\(_arrLocal\) \|\| '';\s*_arrSchedStr = arrTimeStr;/);
  assert.match(r, /arrTimeStr = String\(Math\.floor\(_tot \/ 60\)\)[^\n]*\n\s*_arrMovedMs = _dlyMs;/);
  // Estimate path: the same estimate from the scheduled departure.
  assert.match(r, /const schedArrivalTs = currentFlight\._sortTs && flightMins \? currentFlight\._sortTs \+ flightMins \* 60000 : null;/);
  assert.match(r, /_arrMovedMs = \(arrivalTs && schedArrivalTs\) \? arrivalTs - schedArrivalTs : 0;/);
  assert.match(r, /uxgGateHtml\(\{[^}]*arrSchedStr: _arrSchedStr, arrMovedMs: _arrMovedMs, arrInstant: _arrInstant, arrTz: arrTz \}\)/);
});
