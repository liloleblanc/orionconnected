'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE ADS-B LOOKUP MUST NOT DEPEND ON THE SCHEDULE LOOKUP.
//
// They are independent sources. The ADS-B call reads inb._reg, inb._callSign,
// the flight number and inb._modeS -- all from the flight ROW, never from the
// schedule response. The coupling was an ordering accident: one step happened
// to sit after another inside one long poll function.
//
// The cost of that accident, measured: /flights/number/ answers HTTP 200 with a
// body of `{}`, `Array.isArray({})` is false, so loadFlight returns null on
// every poll on every gate, permanently. `if (!inbData) return;` then skipped
// the ADS-B position lookup AND the ADS-B aircraft-type adoption below it. That
// adoption is the only place an ADS-B type is ever written to a flight row,
// which is why no board showed an aircraft type and why FR24 saw 3 position
// requests in 24 hours against a 240/day cap.
//
// A fix shipped one build earlier -- reading the type out of the ADS-B answer
// instead of discarding it -- was dead code the moment it landed, because it
// sits downstream of that return.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// The poll: from the schedule fetch to the ADS-B call.
function pollRegion() {
  const at = SRC.indexOf('var inbData = await loadFlight(');
  assert.ok(at >= 0, 'the gate number poll must still fetch the schedule');
  const adsb = SRC.indexOf('_adsbTelemetry(inb._reg', at);
  assert.ok(adsb > at, 'the ADS-B lookup must still follow it in the same function');
  return SRC.slice(at, adsb);
}

test('a null schedule lookup does not return out of the poll', () => {
  const region = pollRegion();
  assert.ok(!/\bif\s*\(\s*!\s*inbData\s*\)\s*return\s*;/.test(region),
    'A bare `if (!inbData) return;` between the schedule fetch and the ADS-B ' +
    'call makes the ADS-B lookup unreachable — loadFlight returns null on every ' +
    'poll while /flights/number/ answers 200 with {}.');
});

test('every schedule read between them is null-guarded', () => {
  const region = pollRegion();
  // Any `inbData.<prop>` must be reached through a guard, since inbData can
  // legitimately be null now.
  const bare = region.split('\n')
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /(?<!&&\s)(?<!\|\|\s)\binbData\.\w/.test(l))
    .filter(({ l }) => !/inbData\s*&&/.test(l))
    .filter(({ l }) => !/^\s*(\/\/|\*)/.test(l))
    .map(({ l }) => l.trim().slice(0, 90));
  assert.deepEqual(bare, [],
    'these read inbData without a null guard; inbData is null on every poll today');
});

test('the ADS-B call reads only the flight row, never the schedule response', () => {
  const at = SRC.indexOf('_adsbTelemetry(inb._reg');
  const call = SRC.slice(at, SRC.indexOf(')', at) + 1);
  assert.ok(!/inbData/.test(call),
    'if the ADS-B call ever needs inbData the two stop being independent and ' +
    'this whole guard becomes wrong');
});

test('the ADS-B aircraft-type adoption is still downstream and still present', () => {
  const adsb = SRC.indexOf('_adsbTelemetry(inb._reg');
  const after = SRC.slice(adsb, adsb + 9000);
  assert.match(after, /_acResolvedPut\(/,
    'the resolved type must still be persisted outside the row — the feed ' +
    'rebuilds rows every poll, so a type written only onto inb vanishes');
  assert.match(after, /formatAircraft|aircraftCodeToIata/,
    'the ICAO type from ADS-B must still be converted to board vocabulary');
});
