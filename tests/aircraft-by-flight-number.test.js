'use strict';

// WHY THIS EXISTS
//
// Measured against Flightradar24 on 2026-09-26, every flight inbound to
// Halifax at the time, and what the board asked for:
//
//   AC7754  board asked ACA7754  real callsign PVL7754  (PAL Airlines)
//   AC7705  board asked ACA7705  real callsign PVL7705
//   AC2046  board asked ACA2046  real callsign ROU2046  (Rouge)
//   WS590   board asked WJA590   real callsign WJA590   found
//
// The lookup turned the ticket prefix into the mainline radio prefix, which is
// wrong for every regional operator. Those flights came back empty: no aircraft
// type, no registration, no position. FR24 matches the flight number as sold
// through its `flights` filter, whoever operates it, so that is asked first.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workers', 'fids-proxy.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');

const telemetry = (() => {
  const at = core.indexOf('async function _adsbTelemetry(');
  assert.ok(at > 0, '_adsbTelemetry must exist');
  return core.slice(at, core.indexOf('\n}\n', at));
})();

test('the worker accepts a flight number and sends it as FR24 `flights`', () => {
  assert.match(worker, /\/\^\\\/adsb\\\/\(hex\|reg\|callsign\|flight\)\\\//,
    '/adsb/flight/:number must be a route');
  assert.match(worker, /kind === "flight" \? "flights"/,
    'a flight lookup must use the flights filter, not callsigns');
  assert.match(worker, /\(kind === "callsign" \|\| kind === "reg" \|\| kind === "flight"\)/,
    'a flight lookup must go through the same budget gate as the others');
});

test('the board asks by flight number before any callsign', () => {
  const flightAt = telemetry.indexOf("tries.push('/flight/'");
  const callsignAt = telemetry.indexOf("tries.push('/callsign/'");
  assert.ok(flightAt > 0, 'the board must try /flight/ at all');
  assert.ok(callsignAt > 0, 'the callsign tries are still there as a fallback');
  assert.ok(flightAt < callsignAt, 'the flight number has to be asked first');
});

test('a quiet flight number does not pay again for guessed callsigns', () => {
  // Empty answers still cost a credit each, so the fallback must not double
  // the bill for an aeroplane FR24 has already said is not flying.
  assert.match(core, /quiet: !ac && !!\(j && j\._quiet\)/,
    '_adsbFetchOne must remember a clean "not transmitting" answer');
  assert.match(telemetry, /if \(_numberQuiet && \/\^\\\/callsign\\\/\/\.test\(tries\[i\]\)\) continue;/,
    'callsign guesses must be skipped once the number is known quiet');
});

test('a flight-number answer is not treated as a stray airframe', () => {
  // The tail guard exists for reg/hex answers, which can be the aircraft's
  // previous leg. A flight-number answer is this leg by definition.
  assert.match(telemetry, /if \(!\/\^\\\/\(callsign\|flight\)\\\/\/\.test\(tries\[i\]\)\) \{/);
});
