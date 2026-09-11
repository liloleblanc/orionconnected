// Europe batch — LHR / DUB parsers against verbatim records captured
// 2026-09-05. LHR pins: the one-header unlock is upstream, so here it's
// shape — status messages carrying the revised clock ("Expected 04:37"),
// "On time HH:MM" equal to schedule yielding NO redundant revision,
// terminal codes, and aircraft descriptions trimmed of " Passenger".
// DUB pins: Z-times to Dublin wall clock, belts/gates/terminals, and
// the numeric status being ignored in favour of the message text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lhrParseFeed, dubParseRows } from '../workers/fids-proxy.js';

const lhrFix = readFileSync(new URL('./fixtures/lhr-sample.json', import.meta.url), 'utf8');
const dubFix = JSON.parse(readFileSync(new URL('./fixtures/dub-sample.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-09-05T05:00:00+01:00');

test('lhr: arrival with "On time" equal to schedule has no revision', () => {
  const arr = lhrParseFeed(lhrFix, 'arr', NOW);
  assert.ok(arr.length >= 2, `parsed ${arr.length}`);
  const wb = arr.find((x) => x.number === 'WB712');
  assert.ok(wb, 'WB712 present');
  assert.equal(wb.callSign, 'RWD712');
  assert.equal(wb.status, 'scheduled');
  assert.ok(wb.arrival.scheduledTime.local.startsWith('2026-09-05 07:05'), wb.arrival.scheduledTime.local);
  assert.ok(wb.arrival.scheduledTime.local.endsWith('+01:00'), 'BST offset');
  assert.equal(wb.arrival.revisedTime, undefined, '"On time 07:05" is not a revision');
  assert.equal(wb.arrival.terminal, '4');
  assert.equal(wb.arrival.airport.iata, 'LHR');
  assert.equal(wb.aircraft.model, 'Airbus A330-200');
});

test('lhr: "Expected 04:37" becomes a revision', () => {
  const arr = lhrParseFeed(lhrFix, 'arr', NOW);
  const qf = arr.find((x) => x.number === 'QF219');
  assert.ok(qf, 'QF219 present');
  assert.ok(qf.arrival.revisedTime, 'revision present');
  assert.ok(qf.arrival.revisedTime.local.includes('04:37'), qf.arrival.revisedTime.local);
  assert.equal(qf.aircraft.model, 'Boeing 787-9');
});

test('lhr: departures put home on the departure side with terminal', () => {
  const dep = lhrParseFeed(lhrFix, 'dep', NOW);
  assert.ok(dep.length >= 2, `parsed ${dep.length}`);
  const ba = dep.find((x) => x.number === 'BA670');
  assert.ok(ba, 'BA670 present');
  assert.equal(ba.departure.airport.iata, 'LHR');
  assert.equal(ba.departure.terminal, '5');
  assert.equal(ba.status, 'scheduled');
  assert.equal(ba.departure.revisedTime, undefined, 'message clock equals schedule');
});

test('dub: Z-times land on Dublin wall clock; belts and terminals ride along', () => {
  const arr = dubParseRows(dubFix.arr, 'arr');
  assert.ok(arr.length >= 3, `parsed ${arr.length}`);
  const ei = arr.find((x) => x.number === 'EI104');
  assert.ok(ei, 'EI104 present');
  assert.ok(ei.arrival.scheduledTime.local.startsWith('2026-09-05 04:30'), ei.arrival.scheduledTime.local);
  assert.ok(ei.arrival.revisedTime && ei.arrival.revisedTime.local.includes('04:00'), 'estimate 03:00Z → 04:00 local');
  assert.equal(ei.arrival.baggageBelt, '2');
  assert.equal(ei.arrival.terminal, '2');
  assert.equal(ei.departure.airport.iata, 'JFK');
  assert.equal(ei.departure.airline.iata, 'EI');
});

test('dub: departures carry gates; "ON SCHEDULE" maps to scheduled', () => {
  const dep = dubParseRows(dubFix.dep, 'dep');
  assert.ok(dep.length >= 3, `parsed ${dep.length}`);
  const tp = dep.find((x) => x.number === 'TP1327');
  assert.ok(tp, 'TP1327 present');
  assert.equal(tp.departure.gate, '207');
  assert.equal(tp.departure.terminal, '1');
  assert.equal(tp.status, 'scheduled');
  assert.equal(tp.arrival.airport.iata, 'LIS');
});

test('europe: garbage in, empty out', () => {
  assert.deepEqual(lhrParseFeed('nope', 'arr', NOW), []);
  assert.deepEqual(dubParseRows(null, 'dep'), []);
});

// ── LHR: the operator row is not always NORMAL_FLIGHT ───────────────────────
// Heathrow files three kinds of row and TWO of them are operator rows. A
// flight with no codeshares at all is NORMAL_FLIGHT; a flight that IS
// codeshared — most of Heathrow — files its operator row under
// CODESHARE_OPERATING_FLIGHT. The filter admitted only the first, so on a live
// payload the board drew 56 of 676 departures and 67 of 676 arrivals.
//
// The fixture carries a real pair captured from the feed: TP1363, TAP
// Portugal's metal (CODESHARE_OPERATING_FLIGHT), and AC2686, the same physical
// departure sold under Air Canada's number (CODESHARE_MARKETING_FLIGHT). One
// must survive and the other must not.

test('lhr: a codeshared flight\'s OPERATOR row is kept', () => {
  const dep = lhrParseFeed(lhrFix, 'dep', NOW);
  const tp = dep.find((x) => x.number === 'TP1363');
  assert.ok(tp, `TP1363 was dropped; parsed ${dep.map((x) => x.number).join(',')}`);
  assert.equal(tp.departure.airline.iata, 'TP');
  // and the same on the arrivals side
  const arr = lhrParseFeed(lhrFix, 'arr', NOW);
  assert.ok(arr.find((x) => x.number === 'BA074'), 'operating ARRIVAL row was dropped');
});

test('lhr: the marketing duplicate of that same flight is still dropped', () => {
  const dep = lhrParseFeed(lhrFix, 'dep', NOW);
  assert.equal(dep.find((x) => x.number === 'AC2686'), undefined,
    'AC2686 is TP1363 sold under Air Canada\'s number — admitting it double-books the aircraft');
  // The whole point of the filter: one row per physical movement.
  const nums = dep.map((x) => x.number);
  assert.equal(new Set(nums).size, nums.length, `duplicate flight numbers: ${nums.join(',')}`);
});

test('lhr: British Airways is not reduced to its handful of uncodeshared flights', () => {
  // BA472 is a CODESHARE_OPERATING_FLIGHT. Before the fix every BA departure
  // like it was discarded and the board showed 17 of 344.
  const dep = lhrParseFeed(lhrFix, 'dep', NOW);
  assert.ok(dep.find((x) => x.number === 'BA472'), 'BA operating row was dropped');
});

test('lhr: a status Heathrow has not used before is excluded until it is looked at', () => {
  // The filter is an allow-list, not a "drop MARKETING" test — an unknown
  // fourth value must not walk straight onto the board.
  const rows = JSON.parse(lhrFix);
  const invented = JSON.parse(JSON.stringify(rows.find(
    (r) => r.flightService.codeShareStatus === 'CODESHARE_OPERATING_FLIGHT'
        && r.flightService.arrivalOrDeparture === 'D')));
  invented.flightService.codeShareStatus = 'SOME_NEW_STATUS_2027';
  invented.flightService.iataFlightIdentifier = 'ZZ9999';
  const dep = lhrParseFeed(JSON.stringify(rows.concat([invented])), 'dep', NOW);
  assert.equal(dep.find((x) => x.number === 'ZZ9999'), undefined,
    'an unrecognised codeShareStatus must be excluded, not admitted by default');
});

test('lhr: the fixture actually contains the rows these tests are about', () => {
  // Guards against a future fixture refresh quietly dropping the codeshare
  // records and leaving the four tests above passing on nothing.
  const seen = {};
  for (const r of JSON.parse(lhrFix)) {
    const k = r.flightService.codeShareStatus;
    seen[k] = (seen[k] || 0) + 1;
  }
  assert.ok(seen.CODESHARE_OPERATING_FLIGHT >= 2, `fixture has no operating rows: ${JSON.stringify(seen)}`);
  assert.ok(seen.CODESHARE_MARKETING_FLIGHT >= 1, `fixture has no marketing row: ${JSON.stringify(seen)}`);
  assert.ok(seen.NORMAL_FLIGHT >= 2, `fixture lost its normal rows: ${JSON.stringify(seen)}`);
});
