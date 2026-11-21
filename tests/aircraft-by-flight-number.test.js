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
  // v24115 — the guesses are skipped; the operator own names are not
  // (_operatorCallsigns: a quiet AC8806 is exactly the Jazz JZA806 that
  // Flightradar24 does not find under the number sold)
  assert.match(telemetry, /if \(_numberQuiet && \/\^\\\/callsign\\\/\/\.test\(tries\[i\]\) && _opPaths\.indexOf\(tries\[i\]\) < 0\) continue;/,
    'callsign guesses must be skipped once the number is known quiet');
  assert.match(telemetry, /var _opPaths = _opCs\.map\(function \(c\) \{ return '\/callsign\/' \+ encodeURIComponent\(c\); \}\);/,
    'the operator names, and only those, are still asked');
});

test('a flight-number answer is not treated as a stray airframe', () => {
  // The tail guard exists for reg/hex answers, which can be the aircraft's
  // previous leg. A flight-number answer is this leg by definition.
  assert.match(telemetry, /if \(!\/\^\\\/\(callsign\|flight\)\\\/\/\.test\(tries\[i\]\)\) \{/);
});

// v24169 — paid for the Moncton arrival sweep (workers/fids-proxy.js
// yqmArrSweep): after a quiet number, a quiet operator answer holds the
// operator callsigns off for 10 minutes for that leg. Review of 2026-11-20:
// only a real quiet answer starts the hold (not a refused or failed one, not
// one short gap on final), an answer with the aeroplane clears it, and a near
// ask (the arrival on final and taxiing) is never held.
test('the operator retry after a quiet number: held 10 minutes by a quiet answer only, never near', () => {
  const fnSrc = (name) => {
    const a = core.indexOf('\nfunction ' + name + '(') + 1;
    assert.ok(a > 0, name + ' must exist');
    return core.slice(a, core.indexOf('\n}\n', a) + 2);
  };
  const decl = (prefix) => { const a = core.indexOf(prefix); assert.ok(a >= 0, prefix); return core.slice(a, core.indexOf(';\n', a) + 1); };
  const lib = new Function([decl('var _adsbOpRetry = '), decl('var _ADSB_OP_RETRY_MS = '), fnSrc('_adsbOpRetryOk'),
    fnSrc('_adsbOpRetryQuiet'), fnSrc('_adsbOpRetryFound')].join('\n')
    + '\nreturn { _adsbOpRetryOk, _adsbOpRetryQuiet, _adsbOpRetryFound };')();
  const t0 = Date.UTC(2026, 10, 19, 22, 0), MIN = 60000;
  // asking does not start the hold: a refused or failed answer leaves the next poll free
  assert.equal(lib._adsbOpRetryOk('AC8806', t0), true, 'the first retry');
  assert.equal(lib._adsbOpRetryOk('AC8806', t0 + 1 * MIN), true, 'no quiet answer yet: the next poll asks');
  // a quiet answer holds it 10 minutes
  lib._adsbOpRetryQuiet('AC8806', t0 + 1 * MIN);
  assert.equal(lib._adsbOpRetryOk('AC8806', t0 + 2 * MIN), false, 'quiet: held');
  assert.equal(lib._adsbOpRetryOk('AC8806', t0 + 10 * MIN), false);
  assert.equal(lib._adsbOpRetryOk('AC8542', t0 + 5 * MIN), true, 'another leg has its own');
  assert.equal(lib._adsbOpRetryOk('AC8806', t0 + 11 * MIN), true, '10 minutes on');
  // the retry found it (a Jazz flight FR24 knows only by its callsign): every poll, until a quiet answer
  lib._adsbOpRetryFound('AC8806');
  assert.equal(lib._adsbOpRetryOk('AC8806', t0 + 12 * MIN), true);
  assert.equal(lib._adsbOpRetryOk('AC8806', t0 + 13 * MIN), true, 'found stays found');
  lib._adsbOpRetryQuiet('AC8806', t0 + 13 * MIN);
  assert.equal(lib._adsbOpRetryOk('AC8806', t0 + 14 * MIN), false, 'until a retry comes back quiet');
  // and the loop gates the operator tries only after a quiet number and never near,
  // starts the hold only on a quiet operator answer, and clears it on a find
  assert.match(telemetry, /var _isOpTry = _numberQuiet && _opPaths\.indexOf\(tries\[i\]\) >= 0;/);
  assert.match(telemetry, /if \(_isOpTry && !_near\) \{\n\s+if \(_opGate === null\) _opGate = _adsbOpRetryOk\(_opLeg, Date\.now\(\)\);\n\s+if \(!_opGate\) continue;/);
  assert.match(telemetry, /if \(_isOpTry && ac\) _adsbOpRetryFound\(_opLeg\);\n\s+else if \(_isOpTry && \(_adsbCache\[tries\[i\]\] \|\| \{\}\)\.quiet\) _adsbOpRetryQuiet\(_opLeg, Date\.now\(\)\);/);
});
