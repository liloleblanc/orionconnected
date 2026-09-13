'use strict';

// WHY THIS EXISTS
//
// Measured against the deployed worker, before the change:
//
//   /adsb/callsign/ACA123   max-age=90  x-adsb-cache: miss  ac: 1
//   /adsb/callsign/ZZZ9999  max-age=30  x-adsb-cache: neg   ac: 0  upstream: 429
//
// A real flight cached for 90s. An aircraft that is NOT transmitting cached for
// THIRTY SECONDS — and FR24 is tried ahead of the community ring, so every
// re-ask was a paid call. A departure sitting two hours on stand was asked
// about 240 times per callsign variant, and _adsbTelemetry tries up to four
// variants. That is where the 80%-empty response rate in the FR24 usage figures
// comes from, and it is the single largest line in the bill.
//
// The community ring cannot rescue it: it is blocked from a Cloudflare Worker
// and answers 429 essentially always (hence _upstreamStatus: 429 above), so
// reaching the negative path says nothing by itself. The useful signal is what
// FR24 said on the way past, and the fix turns on exactly that.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const worker = fs.readFileSync(path.resolve(__dirname, '..', 'workers', 'fids-proxy.js'), 'utf8');

const constant = (name) => {
  const m = new RegExp(`const ${name} = (\\d+);`).exec(worker);
  assert.ok(m, `fids-proxy.js must declare ${name}`);
  return Number(m[1]);
};

test('a quiet aircraft is remembered for minutes, not seconds', () => {
  const empty = constant('ADSB_EMPTY_TTL');
  const neg = constant('ADSB_NEG_TTL');
  const live = constant('ADSB_TTL');
  assert.ok(empty >= 300, `ADSB_EMPTY_TTL is ${empty}s — too short to stop the re-asking`);
  assert.ok(empty > neg, 'an empty answer must outlive a transient failure');
  assert.ok(empty > live, 'an empty answer must outlive a live position');
  // Not so long that a departure which starts transmitting waits ages for its
  // aircraft panel. Ten minutes was considered and rejected.
  assert.ok(empty <= 600, `ADSB_EMPTY_TTL is ${empty}s — a just-airborne flight would wait too long`);
});

test('a transient failure still recovers quickly', () => {
  // The 429 stampede this TTL was originally added for is a real problem and
  // must not be traded away: if everything merely failed, retry soon.
  assert.equal(constant('ADSB_NEG_TTL'), 30);
  assert.match(worker, /const _negTtl = _fr24SaidNothing \? ADSB_EMPTY_TTL : ADSB_NEG_TTL;/,
    'the long TTL must be conditional on FR24 having actually answered');
});

test('only a clean, genuinely empty FR24 answer counts as quiet', () => {
  // A malformed body, an error, a skipped call or an over-budget day must NOT
  // be mistaken for "this aeroplane is parked" — that would turn an outage into
  // a five-minute one.
  assert.match(worker, /_fr24SaidNothing = !!\(_fj && Array\.isArray\(_fj\.data\) && _fj\.data\.length === 0\);/,
    'the quiet flag must require a parsed array of length zero');
  // Declared false before the FR24 block, so every path that skips FR24 leaves
  // it false.
  const declAt = worker.indexOf('let _fr24SaidNothing = false;');
  const gateAt = worker.indexOf('if (env.FR24_KEY && (kind === "callsign" || kind === "reg")');
  assert.ok(declAt > 0 && gateAt > 0, 'expected both the declaration and the FR24 gate');
  assert.ok(declAt < gateAt, 'the flag must default to false outside the FR24 branch');
});

test('the caller is told which kind of nothing it got', () => {
  // So this is diagnosable from a response header instead of by reading code:
  // "quiet" = the aircraft is not transmitting, "neg" = we could not find out.
  assert.match(worker, /"X-Adsb-Cache": _fr24SaidNothing \? "quiet" : "neg"/,
    'the header must distinguish a quiet aircraft from a failed lookup');
  assert.match(worker, /\.\.\.\(_fr24SaidNothing \? \{ _quiet: true \} : \{\}\)/,
    'the body should carry the same distinction for the board');
});

test('the response header matches the TTL actually cached', () => {
  // These drifted apart once already: the edge entry used the new TTL while the
  // response still advertised the old one, so the browser re-asked early and
  // the saving was halved.
  const at = worker.indexOf('const _negTtl =');
  const tail = worker.slice(at, at + 1400);
  const cached = /cache\.put\([\s\S]*?max-age=\$\{(_negTtl|ADSB_NEG_TTL)\}/.exec(tail);
  const served = /return new Response\(_negBody[\s\S]*?max-age=\$\{(_negTtl|ADSB_NEG_TTL)\}/.exec(tail);
  assert.ok(cached && served, 'expected both the cache write and the response');
  assert.equal(cached[1], '_negTtl', 'the edge cache is not using the conditional TTL');
  assert.equal(served[1], '_negTtl', 'the response header is not using the conditional TTL');
});

test('an empty answer from the ring is also held longer', () => {
  // Secondary path — the ring returns on ANY ok response, including one with
  // zero aircraft, and that used to be cached at the live-position TTL.
  assert.match(worker, /const _ttl = _empty \? ADSB_EMPTY_TTL : ADSB_TTL;/,
    'an ok-but-empty ring answer should use the empty TTL');
  assert.match(worker, /catch \(e\) \{ _empty = false; \}/,
    'an unparseable body must not be treated as empty');
});

test('the saving is real, at the measured rates', () => {
  const empty = constant('ADSB_EMPTY_TTL');
  const before = 30;
  const stand = 2 * 3600;              // a two-hour turn on stand
  const variants = 4;                  // _adsbTelemetry tries up to four
  const callsBefore = (stand / before) * variants;
  const callsAfter = (stand / empty) * variants;
  // Every one of those is a paid FR24 call at 1 credit for an empty response.
  assert.ok(callsBefore >= 240, `expected the old cost to be severe, got ${callsBefore}`);
  assert.ok(callsAfter * 8 < callsBefore,
    `saving is under 8x (${callsBefore} -> ${callsAfter}) — check ADSB_EMPTY_TTL`);
});
