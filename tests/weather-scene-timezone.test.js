'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23756 — THE WEATHER SCENE FOLLOWS THE AIRPORT'S CLOCK, NOT THE PLAYER'S.
//
// Reported: the weather card is sometimes light when it should be dark, and
// the reverse.
//
// The scene was chosen through _gateDayNightTheme(), which ends at
// `new Date().getHours()` — the clock of the machine running the browser. That
// equals the board's clock only when the player sits in the airport's own
// timezone, and the tour streams 26 airports from Los Angeles to Zurich
// through ONE browser on ONE host. Every airport in the rotation was painted
// from that host's hour.
//
// Three things this locks down:
//   1. The decision reads the AIRPORT's zone (AP[iata].tz), not the host's.
//   2. The scene and the hour tiles share ONE threshold. They previously
//      disagreed between 19:00 and 21:00 every night — the scene flipped at
//      19:00 (_gateDayNightTheme) while every icon flipped at 21:00.
//   3. A ?theme= pin or a stored console theme cannot reach the scene. That
//      pin holds the gate UI to a light PALETTE when the board is mist; it is
//      a statement about styling, not about whether the sun is up, and it was
//      locking the card to the day clip around the clock.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Lift the real _wxNightAt and give it a real AP table.
function nightAt() {
  const at = SRC.indexOf('var _wxNightAt = function');
  assert.ok(at >= 0, 'fids-core.js must still define _wxNightAt');
  let depth = 0; let body = null;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) { body = SRC.slice(at, k + 1) + ';'; break; } }
  }
  assert.ok(body, 'unterminated _wxNightAt');
  const AP = {
    YQM: { tz: 'America/Moncton' },
    LAX: { tz: 'America/Los_Angeles' },
    ZRH: { tz: 'Europe/Zurich' },
    NRT: { tz: 'Asia/Tokyo' },
    NOTZ: {},
  };
  return new Function('AP', body + '\nreturn _wxNightAt;')(AP);
}

const _wxNightAt = nightAt();

// A fixed instant: 2026-06-15T22:00:00Z.
//   Los Angeles 15:00 (day)   Zurich 00:00 (night)   Tokyo 07:00 (day)
const T = Date.parse('2026-06-15T22:00:00Z');

test('one instant gives different answers for different airports', () => {
  // The whole defect in one assertion. A single host clock cannot be right for
  // a rotation spanning these zones; the airport's own zone can.
  assert.equal(_wxNightAt('LAX', T), false, 'Los Angeles is 15:00 — day');
  assert.equal(_wxNightAt('ZRH', T), true, 'Zurich is 00:00 — night');
  assert.equal(_wxNightAt('NRT', T), false, 'Tokyo is 07:00 — day');
});

test('the threshold is 06:00 to 21:00 local, inclusive of the boundaries', () => {
  const zurichAt = (hhmm) => _wxNightAt('ZRH', Date.parse(`2026-06-15T${hhmm}:00+02:00`));
  assert.equal(zurichAt('05:59'), true, 'before 06:00 is night');
  assert.equal(zurichAt('06:00'), false, '06:00 is day');
  assert.equal(zurichAt('20:59'), false, '20:59 is still day');
  assert.equal(zurichAt('21:00'), true, '21:00 is night');
});

test('an airport with no timezone falls back rather than throwing', () => {
  // AP currently has a tz for all 194 entries, but a new airport added without
  // one must degrade to the host clock, not take the card down.
  assert.doesNotThrow(() => _wxNightAt('NOTZ', T));
  assert.equal(typeof _wxNightAt('NOTZ', T), 'boolean');
  assert.equal(typeof _wxNightAt('NOT_IN_TABLE', T), 'boolean');
});

// ── the wiring, not just the helper ────────────────────────────────────────

function sceneAssignment() {
  const at = SRC.indexOf('var _wxNightScene');
  assert.ok(at >= 0, 'the scene flag must still be assigned');
  return SRC.slice(at, SRC.indexOf('var _wxVidSrc', at));
}

test('the scene is decided by the airport helper, not the console theme', () => {
  const decl = sceneAssignment();
  assert.match(decl, /_wxNightAt\(\s*_wxOrig\s*\|\|\s*dest\s*\)/,
    'the scene must be derived from the board airport through _wxNightAt');
  assert.doesNotMatch(decl, /_gateDayNightTheme/,
    '_gateDayNightTheme ends at new Date().getHours() — the PLAYER machine\'s ' +
    'clock. It is correct for the console UI and wrong for whether the sun is up.');
});

test('the scene class and the video are both driven by that one flag', () => {
  const at = SRC.indexOf('var _wxNightScene');
  const block = SRC.slice(at, at + 900);
  assert.match(block, /wx-fireflies-night\.mp4/);
  assert.match(block, /wx-grass-loop\.mp4/);
  assert.match(block, /_wxSceneCls = _wxNightScene \? ' wxc-scene-night' : ' wxc-scene-day'/,
    'the treatment must move with the clip — the light panels and dark ink are ' +
    'unreadable over the night scene, so the class carries them');
});

test('both scene videos exist on disk', () => {
  for (const f of ['wx-fireflies-night.mp4', 'wx-grass-loop.mp4']) {
    const p = path.join(ROOT, 'fids-current', 'logos', 'Backgrounds', 'video', f);
    assert.ok(fs.existsSync(p), `${f} is referenced but missing from the tree`);
  }
});

test('_gateDayNightTheme is left alone for the consumers that want it', () => {
  // It means "dim the console UI", and two mobile surfaces rely on exactly
  // that. Changing its 19:00 constant to fix the weather card would have been
  // the wrong repair in the wrong place.
  const at = SRC.indexOf('function _gateDayNightTheme');
  assert.ok(at >= 0, '_gateDayNightTheme must still exist');
  const body = SRC.slice(at, at + 700);
  assert.match(body, /getHours\(\)/, 'it still reads the console clock, by design');
  assert.match(body, /_h >= 6 && _h < 19/, 'and keeps its own 06/19 console window');
});
