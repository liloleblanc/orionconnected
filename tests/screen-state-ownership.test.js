'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23766 — WHO MAY REMEMBER A SCREEN.
//
// fids_screen_state is ONE key shared by every board on this origin, so a page
// that writes it writes for all of them.
//
// The RESTORE side already refused to read it unless this page is the
// top-level generic board; its comment records why, in the words of the
// failure it fixed — gids stamping 'gate' into the shared key made the
// departures screen come up as a gate.
//
// The WRITE side never got the same rule, so the leak survived that fix from
// the other direction. rotate.html runs fids, gids and bids as iframes on this
// origin; each announces its type on boot through changeScreenType, each
// stamped the shared key, and a real top-level departures board on the same
// browser then restored whichever frame the rotator last passed through.
//
// That is what made a board work, then not work, then work again: nothing to
// do with the airport, the feed or any saved config — only which frame wrote
// last before it booted. Reproduced on production (the key flipped from main
// to baggage within five seconds of the rotator starting) and confirmed held
// after the fix (thirty seconds, no change).
//
// One predicate answers it for both sides so they cannot drift apart again.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

/**
 * The body of a top-level function, ending at its real closing brace.
 *
 * Slicing a fixed number of characters instead runs into whatever follows —
 * here that is _fidsSyncUrl, which carries its OWN `window.self !== window.top`
 * guard, so a window-based check passed while asserting nothing about the
 * function it named. Caught by deleting the line and watching the test stay
 * green.
 */
function functionBody(name) {
  const at = SRC.indexOf('function ' + name);
  assert.ok(at >= 0, name + ' must exist');
  const end = SRC.indexOf('\n}', at);
  assert.ok(end > at, 'could not find the end of ' + name);
  return SRC.slice(at, end + 2);
}

test('the ownership rule exists and covers all three ways a page can not own it', () => {
  const body = functionBody('_fidsOwnsScreenState');
  assert.match(body, /window\.self !== window\.top/, 'an iframe must not own screen state');
  assert.match(body, /fids-stream/, 'a stream board must not own screen state');
  assert.match(body, /data-page/, 'a dedicated gids/bids page owns its type from its own URL');
});

test('every write to the shared key is gated on that rule', () => {
  // The leak was a WRITE with no guard, so this walks the writes rather than
  // trusting that the ones known about today are the only ones.
  const writes = [...SRC.matchAll(/setItem\('fids_screen_state'/g)].map((m) => m.index);
  assert.ok(writes.length >= 2, `expected the known writes, found ${writes.length}`);
  for (const i of writes) {
    const before = SRC.slice(Math.max(0, i - 400), i);
    assert.match(before, /_fidsOwnsScreenState\(\)/,
      'a write to fids_screen_state with no ownership check leaks into every ' +
      'other board on this origin — that is the original bug');
  }
});

test('the read is gated on the same rule, not a private copy of it', () => {
  const i = SRC.indexOf("getItem('fids_screen_state')");
  assert.ok(i >= 0, 'the restore must read the key');
  const before = SRC.slice(Math.max(0, i - 2400), i);
  assert.match(before, /_fidsOwnsScreenState\(\)/,
    'the restore must use the shared predicate, or read and write drift apart');
});

test('an explicit ?screen=main still beats a remembered screen', () => {
  // The escape hatch for a display already holding a stale value. Without it
  // the only cure is clearing storage on the device itself.
  // lastIndexOf, not indexOf: the phrase also appears 2.4 million characters
  // earlier in a cross-reference comment, and anchoring there matches nothing.
  const at = SRC.lastIndexOf('SCREEN-STATE RESTORE');
  assert.ok(at >= 0);
  const body = SRC.slice(at, at + 5000);
  assert.match(body, /uT === 'main'[\s\S]{0,80}return/,
    "?screen=main must short-circuit the restore");
});
