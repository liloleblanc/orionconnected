'use strict';

// FR24 bills PER RETURNED ENTITY, not per request — their FAQ says so outright,
// and an empty response is still a flat 1 credit. Both budget counters in the
// worker were incrementing by ONE PER REQUEST, so FR24_DAILY_BUDGET was capping
// request COUNT, not spend. A flight-summary page returning 20 rows registered
// as 1 against the cap while actually costing 60.
//
// The account's own usage figures prove the model rather than assuming it:
// 1,615 live-position requests cost 3,912 credits — 2.42 each — which solves
// exactly as 8x + 1(1-x) with x = 0.20. Four calls in five return nothing and
// pay the empty fee anyway.
//
// This is the same shape as the September AeroDataBox incident: a budget that
// looked enforced, was not, and was only visible from the provider's side. So
// the arithmetic is worth pinning down in a test rather than in a comment.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const worker = fs.readFileSync(path.resolve(__dirname, '..', 'workers', 'fids-proxy.js'), 'utf8');

// Lift the shipped implementation rather than restating it.
const { FR24_ROW_PRICE, fr24Charge } = (() => {
  const table = /const FR24_ROW_PRICE = \{[\s\S]*?\};/.exec(worker);
  assert.ok(table, 'fids-proxy.js must declare FR24_ROW_PRICE');
  const fn = /function fr24Charge\(endpoint, rowCount\) \{[\s\S]*?\n\}/.exec(worker);
  assert.ok(fn, 'fids-proxy.js must declare fr24Charge');
  // eslint-disable-next-line no-new-func
  return new Function(`${table[0]}\n${fn[0]}\nreturn { FR24_ROW_PRICE, fr24Charge };`)();
})();

test('an empty response still costs a credit', () => {
  // The whole reason the old counter was so wrong: 80% of the position calls
  // return nothing, and FR24 charges for every one of them.
  assert.equal(fr24Charge('live/flight-positions/full', 0), 1);
  assert.equal(fr24Charge('flight-summary/full', 0), 1);
  assert.equal(fr24Charge('live/flight-positions/full', null), 1);
});

test('a page of rows costs per row, not per call', () => {
  assert.equal(fr24Charge('live/flight-positions/full', 1), 8);
  assert.equal(fr24Charge('live/flight-positions/full', 3), 24);
  // The 20-row flight-summary page that used to register as 1:
  assert.equal(fr24Charge('flight-summary/full', 20), 60);
});

test('the published rates are the ones being charged', () => {
  assert.equal(FR24_ROW_PRICE['live/flight-positions/full'], 8);
  assert.equal(FR24_ROW_PRICE['live/flight-positions/light'], 6);
  // Where a rate depends on whether the flight has ended, the dearer historic
  // rate is used — over-estimating costs coverage, under-estimating costs money.
  assert.equal(FR24_ROW_PRICE['flight-summary/full'], 3);
  assert.equal(FR24_ROW_PRICE['flight-summary/light'], 2);
});

test('an unknown endpoint is assumed to be the dearest, not the cheapest', () => {
  // A new call site that forgets to register its rate must over-report, so the
  // cap still bites. Defaulting to 1 would recreate exactly this bug.
  assert.equal(fr24Charge('some/new/endpoint', 2), 16);
});

test('the model reproduces the account\'s real measured cost', () => {
  // 1,615 requests, 3,912 credits, at a 20% hit rate returning one row each.
  const requests = 1615, hitRate = 0.2;
  const hits = Math.round(requests * hitRate);
  const total = hits * fr24Charge('live/flight-positions/full', 1)
              + (requests - hits) * fr24Charge('live/flight-positions/full', 0);
  // Within 2% of the 3,912 the provider actually billed.
  assert.ok(Math.abs(total - 3912) / 3912 < 0.02,
    `model says ${total}, provider billed 3912`);
  // And the old counter would have recorded 1,615 — off by 2.4x.
  assert.ok(total / requests > 2.3, 'the per-call counter under-reported by more than 2.3x');
});

test('neither call site counts requests any more', () => {
  // The two specific lines that were wrong. If either comes back, the cap stops
  // capping again and nothing else in this file would notice.
  assert.doesNotMatch(worker, /_spend = _hardStop \? _cap : _used \+ 1;/,
    'the ADS-B path is back to counting requests');
  assert.doesNotMatch(worker, /^ {6}used \+= 1;$/m,
    'the DTW sweep is back to counting requests');
  assert.match(worker, /_used \+ fr24Charge\("live\/flight-positions\/full", _rows\.length\)/,
    'the ADS-B path must charge on the row count it received');
  assert.match(worker, /used \+= fr24Charge\("flight-summary\/full", rows\.length\)/,
    'the DTW sweep must charge on the row count it received');
});

test('the body is read before the charge is computed', () => {
  // FR24 prices on what came back, so the cost cannot be known until the body
  // is parsed. Charging first is how the old code ended up counting requests.
  const parseAt = worker.indexOf('_rows = (_fj && Array.isArray(_fj.data)) ? _fj.data : [];');
  const chargeAt = worker.indexOf('_used + fr24Charge("live/flight-positions/full", _rows.length)');
  assert.ok(parseAt > 0 && chargeAt > 0, 'expected both the parse and the charge');
  assert.ok(parseAt < chargeAt, 'the charge is computed before the rows are parsed');
});

test('the DTW sweep keeps the aircraft type it already paid for', () => {
  // flight-summary/full carries the ICAO type designator on every row, at 3
  // credits a row already spent. It was being dropped on the floor while the
  // boards showed no aircraft at all.
  assert.match(worker, /t: String\(\(f && f\.type\) \|\| ""\)\.toUpperCase\(\) \|\| null/,
    'the sweep no longer captures the type from the row');
  assert.match(worker, /aircraftModel: hit\.t \|\| null/,
    'the captured type is not being passed to authorityFlight');
  // authorityFlight turns aircraftModel into the aircraft:{model} shape every
  // other feed delivers, so nothing downstream needs to change.
  assert.match(worker, /\.\.\.\(o\.aircraftModel \? \{ aircraft: \{ model: o\.aircraftModel \} \} : \{\}\)/,
    'authorityFlight no longer maps aircraftModel onto aircraft.model');
});

test('the type is kept as the raw ICAO designator, not flattened', () => {
  // formatAircraft routes 4-character codes through aircraftCodeToIata, so the
  // composite survives. Flattening a B38M to "737" is the tracked bug class
  // (737-700 shown as MAX 8), and it must not be reintroduced here.
  const capture = /t: String\(\(f && f\.type\) \|\| ""\)\.toUpperCase\(\) \|\| null/.exec(worker);
  assert.ok(capture, 'no type capture to check');
  const around = worker.slice(Math.max(0, capture.index - 400), capture.index + 200);
  assert.doesNotMatch(around, /slice\(0,\s*3\)/, 'the type is being truncated to three characters');
  assert.doesNotMatch(around, /replace\(\/\[A-Z\]\/g/, 'the type is being stripped of letters');
});
