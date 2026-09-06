// RDU Raleigh–Durham — flightview FIDS parser against verbatim captures
// (2026-09-05 ~22:10 EDT). Pins: the dtDateTime comment gives a dated
// local time (so a revised time past midnight lands on the next day),
// the ffDtNm onclick supplies airline + both IATAs, the flightStatus-*
// class maps like MWAA's vocabulary, diverted legs collapse onto the
// recovery leg, and a page read for the wrong direction yields nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rduParsePage } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T22:10:00-04:00');

test('rdu arrivals: dated local times in EDT, revised, IATA from onclick, status classes', () => {
  const arr = rduParsePage(fx('rdu-arr-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 173, '174 rows on the page; DL1550 diversion + recovery legs collapse to one');
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'RDU'));
  const aa = arr.find((x) => x.number === 'AA4015');
  assert.ok(aa, 'AA4015 present');
  assert.equal(aa.arrival.scheduledTime.local, '2026-09-05 15:26:00-04:00');
  assert.equal(aa.arrival.scheduledTime.utc, '2026-09-05 19:26:00+00:00');
  assert.equal(aa.arrival.revisedTime.local, '2026-09-05 16:26:00-04:00');
  assert.equal(aa.status, 'arrived');                       // flightStatus-InGate
  assert.equal(aa.departure.airport.iata, 'DCA');
  assert.equal(aa.departure.airport.name, 'Washington, DC');
  assert.equal(aa.arrival.airline.iata, 'AA');
  assert.equal(aa.arrival.airline.name, 'American Airlines');
  assert.equal(aa._authTs, aa.arrival.scheduledTime && Date.parse('2026-09-05T15:26:00-04:00'));
  // Revised time on the far side of midnight keeps its own date.
  const dl = arr.find((x) => x.number === 'DL3244');
  assert.ok(dl, 'DL3244 present');
  assert.equal(dl.status, 'delayed');
  assert.equal(dl.arrival.scheduledTime.local, '2026-09-05 22:26:00-04:00');
  assert.equal(dl.arrival.revisedTime.local, '2026-09-06 00:20:00-04:00');
  // Cancelled row has a blank Updated cell → no revisedTime.
  const b6 = arr.find((x) => x.number === 'B62783');
  assert.ok(b6, 'B62783 present');
  assert.equal(b6.status, 'cancelled');
  assert.equal(b6.arrival.revisedTime, undefined);
  assert.equal(b6.departure.airport.iata, 'BOS');
  // Tomorrow's rows come through dated — AC8836 runs daily at 16:05, so
  // today's (arrived) and tomorrow's (scheduled) legs are both listed.
  const acs = arr.filter((x) => x.number === 'AC8836');
  assert.equal(acs.length, 2, 'both AC8836 legs kept apart');
  const ac = acs.find((x) => x.arrival.scheduledTime.local.startsWith('2026-09-06'));
  assert.ok(ac, "tomorrow's AC8836 present");
  assert.equal(ac.arrival.scheduledTime.local, '2026-09-06 16:05:00-04:00');
  assert.equal(ac.status, 'scheduled');
  assert.equal(ac.departure.airport.iata, 'YYZ');
  assert.equal(ac._authTs, Date.parse('2026-09-06T16:05:00-04:00'));
  // In-air rows map to "active", like MWAA's INAIR.
  assert.ok(arr.some((x) => x.status === 'active'), 'an in-air flight');
  assert.ok(arr.some((x) => x.status === 'departed'), 'an OutGate flight');
});

test('rdu arrivals: diverted legs collapse onto the recovery leg', () => {
  const arr = rduParsePage(fx('rdu-arr-sample.html'), 'arr', NOW);
  const legs = arr.filter((x) => x.number === 'DL1550' && x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.equal(legs.length, 1, 'two page rows (Diversion, then Recovery) → one flight');
  assert.equal(legs[0].status, 'arrived');
  assert.equal(legs[0].arrival.revisedTime.local, '2026-09-05 18:07:00-04:00');
  assert.ok(arr.some((x) => x.number === 'DL1550' && x.arrival.scheduledTime.local.startsWith('2026-09-06')), "tomorrow's DL1550 kept separately");
  assert.ok(!arr.some((x) => x.status === 'diverted'), 'the diversion rows were the same flight');
});

test('rdu departures: To-airport from onclick, delayed/early revised, carrier names', () => {
  const dep = rduParsePage(fx('rdu-dep-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 180);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'RDU'));
  const dl = dep.find((x) => x.number === 'DL2521');
  assert.ok(dl, 'DL2521 present');
  assert.equal(dl.status, 'delayed');
  assert.equal(dl.departure.scheduledTime.local, '2026-09-05 14:50:00-04:00');
  assert.equal(dl.departure.revisedTime.local, '2026-09-05 22:10:00-04:00');
  assert.equal(dl.arrival.airport.iata, 'MSP');
  assert.equal(dl.arrival.airport.name, 'Minneapolis, MN');
  const cm = dep.find((x) => x.number === 'CM467');
  assert.ok(cm, 'CM467 present');
  assert.equal(cm.departure.scheduledTime.local, '2026-09-06 16:21:00-04:00');
  assert.equal(cm.departure.revisedTime.local, '2026-09-06 16:06:00-04:00');   // early estimate
  assert.equal(cm.status, 'scheduled');
  assert.equal(cm.arrival.airport.iata, 'PTY');
  assert.equal(cm.departure.airline.name, 'COPA Airlines');
  const mx = dep.find((x) => x.departure.airline.iata === 'MX');
  assert.ok(mx && mx.departure.airline.name === 'Breeze Airways');
  // A departure already at its destination reads "Arrived" (InGate).
  const done = dep.find((x) => x.number === 'DL1377');
  assert.ok(done && done.status === 'arrived');
  assert.equal(done.departure.gate, undefined, 'the list view has no gates');
});

test('rdu: wrong pane and garbage yield nothing', () => {
  assert.deepEqual(rduParsePage(fx('rdu-arr-sample.html'), 'dep', NOW), []);
  assert.deepEqual(rduParsePage(fx('rdu-dep-sample.html'), 'arr', NOW), []);
  assert.deepEqual(rduParsePage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(rduParsePage('', 'dep', NOW), []);
  assert.deepEqual(rduParsePage(null, 'dep', NOW), []);
});
