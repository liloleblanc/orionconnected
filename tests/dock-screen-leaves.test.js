'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23827 — A DOCKED AIRPORT LEAVES THE UNATTENDED SCREENS, AND ONLY THOSE.
//
// The dry dock was built as "do not OFFER this": out of the pickers, out of the
// stream tour, still reachable by direct link so the airport can be worked on
// while it is docked. That is deliberate and the reader's own comment says so.
//
// The case it missed is the television. A screen paired through the registry is
// neither a picker nor a person — it was pointed at an airport once and will
// show it forever. Taking an airport out of service is a decision about exactly
// that screen.
//
// So the rule is narrow, and the NOT cases matter as much as the case:
//   · a registry screen on a docked airport   → joins the tour
//   · a hand-opened link on the same airport  → stays put, because whoever
//     opened it is probably the one repairing it
//   · a board inside the rotator's iframe     → never navigates itself; it
//     would take the whole frame with it, and the tour already filtered the
//     dock out of its own run
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');

function fn(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  return CORE.slice(at, CORE.indexOf('\n}', at) + 2);
}

test('only a registry screen is moved', () => {
  const body = fn('_fidsDockedSelfCheck');
  assert.match(body, /_fidsScreenId\(\)/,
    'the ?screen= parameter is the only thing that says "unattended display"');
  assert.match(body, /if \(!_fidsScreenId\(\)\) return;/,
    'a hand-opened link must return before it can navigate — whoever opened it ' +
    'is probably repairing that airport');
});

test('a board inside the rotator never navigates itself', () => {
  const body = fn('_fidsDockedSelfCheck');
  assert.match(body, /window\.self !== window\.top/,
    'inside the tour iframe, self-navigating takes the whole frame with it');
  const guardAt = body.indexOf('window.self !== window.top');
  const navAt = body.indexOf('location.replace');
  assert.ok(guardAt >= 0 && guardAt < navAt, 'and it must be checked BEFORE navigating');
});

test('the stream is left alone too', () => {
  assert.match(fn('_fidsDockedSelfCheck'), /fids-stream/,
    'a stream layout is the rotator by another name');
});

test('it goes to the tour, not to a blank page', () => {
  assert.match(fn('_fidsDockedSelfCheck'), /\/rotate\?tour=1/,
    'a television should show working airports, not a notice about one that ' +
    'is out of service');
});

test('every guard precedes the navigation', () => {
  // The failure that matters is a screen bouncing when it should not, so the
  // ORDER is the property worth pinning, not merely the presence of guards.
  const body = fn('_fidsDockedSelfCheck');
  const nav = body.indexOf('location.replace');
  for (const guard of ['window.self !== window.top', 'fids-stream', '_fidsScreenId()', 'fidsIsDocked(ap)']) {
    const at = body.indexOf(guard);
    assert.ok(at >= 0 && at < nav, `"${guard}" must be checked before navigating`);
  }
});

test('it reacts when the dock arrives, not only on a timer', () => {
  // Docking is meant to take effect without a deploy. A minute of a docked
  // airport on a public screen is a minute too many when the event is available.
  assert.match(CORE, /addEventListener\('fids-dry-dock-ready', _fidsDockedSelfCheck\)/,
    'the dock reader already fires an event when it loads — use it');
});

test('the check is only wired up on a screen at all', () => {
  const at = CORE.indexOf('setInterval(_fidsDockedSelfCheck');
  assert.ok(at >= 0, 'it must be polled');
  const before = CORE.slice(Math.max(0, at - 220), at);
  assert.match(before, /_fidsScreenId\(\)/,
    'no timer on a board that is not a registered screen — nothing for it to do');
});

test('docking still does NOT mean "no feed"', () => {
  // These are different facts with different consequences, and conflating them
  // is what produced a wrong explanation of this feature in the first place.
  const reader = CORE.slice(CORE.indexOf('── DRY DOCK'), CORE.indexOf('── DRY DOCK') + 900);
  assert.match(reader, /not "this has no feed"/,
    'the distinction from _fidsAirportHasFeed must stay written down');
});
