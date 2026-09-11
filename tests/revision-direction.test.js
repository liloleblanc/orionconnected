'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// A REVISED TIME IS NOT AUTOMATICALLY A LATE ONE.
//
// Reported: a board announcing "Delayed" beside times rendered in the on-time
// green. Measured on the live YUL feed, the contradiction was real and the
// GREEN was the half that was right:
//
//     AC802   scheduled 20:40  ->  revised 20:30   ten minutes EARLY
//     AC894   scheduled 20:45  ->  revised 20:35   ten minutes EARLY
//
// Both were labelled "Delayed". The shelves ink a revision by DIRECTION, so the
// digits went green — correct. The status word asked only whether a revision
// EXISTED, so any change in either direction produced "Delayed". Two surfaces
// disagreeing because only one of them looked at the clock.
//
// The feed's own status word is NOT the authority here: it said "delayed" on
// AC802 while its own revised time was earlier. The clock is.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Lift the real direction test rather than restating it.
const at = SRC.indexOf('var _bwEarly = false;');
assert.ok(at >= 0, 'the status strip must still compute the direction of a revision');
const end = SRC.indexOf('} catch (eE)', at);
assert.ok(end > at, 'the direction block must still be guarded');
const EXPR = SRC.slice(at, end) + '} catch (eE) { _bwEarly = false; }\nreturn _bwEarly;';

const isEarly = (time, upd) =>
  new Function('currentFlight', EXPR)({ time, upd });

test('a revision to an EARLIER time is early, not delayed', () => {
  assert.equal(isEarly('20:40', '20:30'), true, 'AC802: 20:40 -> 20:30');
  assert.equal(isEarly('20:45', '20:35'), true, 'AC894: 20:45 -> 20:35');
});

test('a revision to a LATER time is not early', () => {
  assert.equal(isEarly('20:00', '21:25'), false, 'a real 85-minute delay');
  assert.equal(isEarly('16:40', '18:37'), false, 'a real 117-minute delay');
});

test('a trivial adjustment is not announced in either direction', () => {
  // A dead band, so a two-minute tweak does not flip the board's headline.
  assert.equal(isEarly('20:40', '20:38'), false, 'two minutes early is not "Early"');
  assert.equal(isEarly('20:40', '20:42'), false, 'two minutes late is not "Early"');
});

test('a revision across midnight is read the short way round', () => {
  // 23:55 -> 00:10 is fifteen minutes LATE, not 1,425 minutes early.
  assert.equal(isEarly('23:55', '00:10'), false, '23:55 -> 00:10 is late');
  // 00:10 -> 23:55 is fifteen minutes EARLY, not 1,425 minutes late.
  assert.equal(isEarly('00:10', '23:55'), true, '00:10 -> 23:55 is early');
});

test('no revision at all is not early', () => {
  assert.equal(isEarly('20:40', ''), false);
  assert.equal(isEarly('', ''), false);
});

test('the strip actually uses the direction before falling back to the word', () => {
  const block = SRC.slice(SRC.indexOf('var _bwEarly = false;'), SRC.indexOf('var _bwAbn = true;'));
  const early = block.indexOf("_bwStKey = 'early'");
  const delayed = block.indexOf("_bwStKey = 'delayed'");
  assert.ok(early !== -1, "the strip must be able to say 'early'");
  assert.ok(delayed !== -1, "and still say 'delayed'");
  assert.ok(early < delayed,
    'the early branch must be tested BEFORE the delayed fallback, or any revision ' +
    'is announced as a delay again');
});
