// MCO Orlando — GOAA api.goaa.aero (the LAS/CLT vendor, v200 shape)
// against verbatim ±24 h captures taken 2026-09-06 02:11 EDT. Pins:
// epoch-second stamps rendered on the Eastern clock (EDT -04:00), the
// single lastKnownTimestamp as revisedTime (later AND earlier), the
// two-letter status enum, gate + belt, the terminal letter the feed
// doesn't carry (C-gates/belts, belt building for arrivals, the
// airport's own airline table for departures), the ICAO callsign, and
// the collapse of multi-stop flights emitted once per route step into
// one row with the step chain as _stops / via.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mcoParseFeed } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T02:11:21-04:00');

test('mco arrivals: Eastern clock, later/earlier revisions, gate, belt, belt-derived terminal, callsign', () => {
  const arr = mcoParseFeed(fx('mco-arr-sample.json'), 'arr', NOW);
  // 486 rows = 460 flights + 25 extra route-step rows (24 two-step, WN4915 three-step).
  assert.equal(arr.length, 460, `parsed ${arr.length}`);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'MCO' && x.arrival.airport.icao === 'KMCO'));
  assert.ok(arr.every((x) => x.departure.airport.iata && x.departure.airport.iata !== 'MCO'));
  assert.ok(arr.every((x) => /-04:00$/.test(x.arrival.scheduledTime.local)), 'EDT offset on every row');
  assert.ok(arr.every((x) => typeof x._authTs === 'number' && x._authTs === Date.parse(x.arrival.scheduledTime.utc.replace(' ', 'T'))));
  // Most numbers fly on both days of the ±24 h window, so lookups pin the movement by _authTs.
  // DL1735 from Atlanta — status DL, estimate 3.5 h late.
  const dl = arr.find((x) => x.number === 'DL1735' && x._authTs === 1788659040000);
  assert.ok(dl, 'DL1735 present');
  assert.equal(dl.arrival.scheduledTime.local, '2026-09-05 21:44:00-04:00');   // 1788659040 = 01:44Z
  assert.equal(dl.arrival.scheduledTime.utc, '2026-09-06 01:44:00+00:00');
  assert.equal(dl._authTs, 1788659040000);
  assert.equal(dl.arrival.revisedTime.local, '2026-09-06 01:13:00-04:00');     // lastKnown 1788671580
  assert.equal(dl.status, 'delayed');
  assert.equal(dl.arrival.gate, '76');
  assert.equal(dl.arrival.baggageBelt, '30');
  assert.equal(dl.arrival.terminal, 'B');                                       // belts 20–32 are Terminal B
  assert.equal(dl.departure.airport.iata, 'ATL');
  assert.equal(dl.arrival.airline.iata, 'DL');
  assert.equal(dl.arrival.airline.name, 'Delta');
  assert.equal(dl.callSign, 'DAL1735');
  assert.equal(dl.codeshareStatus, 'IsOperator');
  assert.equal(dl._stops, undefined, 'nonstop rows carry no stop list');
  assert.equal(dl.departure.revisedTime, undefined, 'far side gets the schedule only');
  // DL1513 from Boston — AR, arrived after midnight local.
  const bos = arr.find((x) => x.number === 'DL1513' && x._authTs === 1788663240000);
  assert.ok(bos, 'DL1513 present');
  assert.equal(bos.status, 'arrived');
  assert.equal(bos.arrival.scheduledTime.local, '2026-09-05 22:54:00-04:00');
  assert.equal(bos.arrival.revisedTime.local, '2026-09-06 00:10:00-04:00');
  assert.equal(bos.arrival.gate, '87');
  // WN4634 from Denver (the 00:20 one; the number flies again at 00:20 next night) — AR, in early.
  const wn = arr.find((x) => x.number === 'WN4634' && x._authTs === 1788668400000);
  assert.ok(wn, 'WN4634 (04:20Z) present');
  assert.equal(wn.status, 'arrived');
  assert.equal(wn.arrival.scheduledTime.local, '2026-09-06 00:20:00-04:00');
  assert.equal(wn.arrival.revisedTime.local, '2026-09-05 23:49:00-04:00');     // earlier than schedule, kept
  assert.equal(wn.arrival.baggageBelt, '12');
  assert.equal(wn.arrival.terminal, 'A');                                       // belts 1–16 are Terminal A
  assert.equal(wn.arrival.airline.name, 'Southwest');
  // B62583 from JFK — CX in Terminal C (C-gate, C-belt).
  const b6 = arr.find((x) => x.number === 'B62583' && x._authTs === 1788664140000);
  assert.ok(b6, 'B62583 present');
  assert.equal(b6.status, 'cancelled');
  assert.equal(b6.arrival.scheduledTime.local, '2026-09-05 23:09:00-04:00');
  assert.equal(b6.arrival.revisedTime.local, '2026-09-06 05:45:00-04:00');     // lastKnown 1788687900 still carried on a CX
  assert.equal(b6.arrival.gate, 'C252A');
  assert.equal(b6.arrival.baggageBelt, 'C51');
  assert.equal(b6.arrival.terminal, 'C');
  assert.equal(b6.arrival.airline.name, 'JetBlue');
  // AC1676 from Toronto — arrived, Terminal B belt 27.
  const ac = arr.find((x) => x.number === 'AC1676' && x._authTs === 1788666420000);
  assert.ok(ac, 'AC1676 present');
  assert.equal(ac.status, 'arrived');
  assert.equal(ac.arrival.revisedTime.local, '2026-09-06 00:06:00-04:00');
  assert.equal(ac.arrival.airline.name, 'Air Canada');
  assert.equal(ac.arrival.gate, '96');
  assert.equal(ac.arrival.baggageBelt, '27');
  assert.equal(ac.arrival.terminal, 'B');
  assert.equal(ac.departure.airport.iata, 'YYZ');
  // LA4406 from Bogotá — no gate posted yet: the key is omitted, terminal comes from belt 29.
  const la = arr.find((x) => x.number === 'LA4406');
  assert.ok(la, 'LA4406 present');
  assert.equal(la.arrival.gate, undefined);
  assert.equal(la.arrival.baggageBelt, '29');
  assert.equal(la.arrival.terminal, 'B');
  assert.equal(la.arrival.airline.name, 'LATAM');
  // F99509 from Aguadilla — no belt yet (one of 4 such rows): terminal from the airport's airline table.
  const f9 = arr.find((x) => x.number === 'F99509');
  assert.ok(f9, 'F99509 present');
  assert.equal(f9.arrival.baggageBelt, undefined);
  assert.equal(f9.arrival.gate, '26');
  assert.equal(f9.arrival.terminal, 'A');
  assert.equal(f9.arrival.airline.name, 'Frontier');
  assert.equal(arr.filter((x) => !x.arrival.baggageBelt).length, 4);
  // The belt rule holds for every arrival that has one.
  for (const x of arr) {
    const b = x.arrival.baggageBelt;
    if (!b) continue;
    if (/^C/.test(b)) assert.equal(x.arrival.terminal, 'C', `${x.number} belt ${b}`);
    else assert.equal(x.arrival.terminal, Number(b) < 20 ? 'A' : 'B', `${x.number} belt ${b}`);
  }
  // Statuses stay inside the board's vocabulary.
  const vocab = new Set(['scheduled', 'boarding', 'departed', 'delayed', 'arrived', 'cancelled', 'diverted']);
  assert.ok(arr.every((x) => vocab.has(x.status)));
});

test('mco arrivals: multi-stop rows (one per route step) collapse to one flight with the chain as _stops', () => {
  const arr = mcoParseFeed(fx('mco-arr-sample.json'), 'arr', NOW);
  // UA1947: rows UA1947_SFO (routeStep 0) + UA1947_HNL (routeStep 1), same time/gate/belt.
  const ua = arr.filter((x) => x.number === 'UA1947');
  assert.equal(ua.length, 1, 'UA1947 emitted twice in the feed, once here');
  assert.equal(ua[0].departure.airport.iata, 'SFO');                            // the vendor's originAirport
  assert.deepEqual(ua[0]._stops, [{ iata: 'SFO', city: '' }, { iata: 'HNL', city: '' }]);
  assert.equal(ua[0]._mcoViaStop, 'HNL');
  assert.equal(ua[0].arrival.gate, '42');
  assert.equal(ua[0].arrival.baggageBelt, '23');
  assert.equal(ua[0].arrival.terminal, 'B');
  assert.equal(ua[0].arrival.scheduledTime.local, '2026-09-06 08:24:00-04:00');  // 1788697440
  // WN4915: three rows (SJC / LAS / MEM), routeStep 0..2.
  const wn = arr.filter((x) => x.number === 'WN4915');
  assert.equal(wn.length, 1);
  assert.equal(wn[0].departure.airport.iata, 'SJC');
  assert.deepEqual(wn[0]._stops.map((s) => s.iata), ['SJC', 'LAS', 'MEM']);
  assert.equal(wn[0]._mcoViaStop, 'LAS, MEM');
  // No flight number + scheduled time survives twice.
  const keys = arr.map((x) => `${x.number}|${x._authTs}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate movements');
});

test('mco departures: scheduled-with-revision, departed, cancelled, no belts, airline-table terminal', () => {
  const dep = mcoParseFeed(fx('mco-dep-sample.json'), 'dep', NOW);
  // 486 rows = 450 flights + 36 extra route-step rows (32 two-step, UA2611 and UA2746 three-step).
  assert.equal(dep.length, 450, `parsed ${dep.length}`);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'MCO'));
  assert.ok(dep.every((x) => x.arrival.airport.iata && x.arrival.airport.iata !== 'MCO'));
  assert.ok(dep.every((x) => !x.departure.baggageBelt && !x.arrival.baggageBelt));
  assert.ok(dep.every((x) => /-04:00$/.test(x.departure.scheduledTime.local)));
  // F94726 to San Juan — status ON with a later estimate: scheduled + revisedTime, not "delayed".
  const f9 = dep.find((x) => x.number === 'F94726' && x._authTs === 1788664620000);
  assert.ok(f9, 'F94726 present');
  assert.equal(f9.status, 'scheduled');
  assert.equal(f9.departure.scheduledTime.local, '2026-09-05 23:17:00-04:00');  // 1788664620
  assert.equal(f9.departure.scheduledTime.utc, '2026-09-06 03:17:00+00:00');
  assert.equal(f9.departure.revisedTime.local, '2026-09-06 06:00:00-04:00');    // lastKnown 1788688800
  assert.equal(f9.departure.revisedTime.utc, '2026-09-06 10:00:00+00:00');
  assert.equal(f9.departure.gate, '10');
  assert.equal(f9.departure.terminal, 'A');                                      // Frontier checks in at A (gates 1–29 are shared with Breeze, Terminal B)
  assert.equal(f9.arrival.airport.iata, 'SJU');
  assert.equal(f9.departure.airline.iata, 'F9');
  assert.equal(f9.departure.airline.name, 'Frontier');
  assert.equal(f9.callSign, 'FFT4726');
  // MX9015 to Hartford — DP, pushed 45 min late from a Terminal B gate.
  const mx = dep.find((x) => x.number === 'MX9015');
  assert.ok(mx, 'MX9015 present');
  assert.equal(mx.status, 'departed');
  assert.equal(mx.departure.scheduledTime.local, '2026-09-06 00:30:00-04:00');
  assert.equal(mx.departure.revisedTime.local, '2026-09-06 01:15:00-04:00');
  assert.equal(mx.departure.gate, '8');
  assert.equal(mx.departure.terminal, 'B');
  assert.equal(mx.departure.airline.name, 'Breeze');
  assert.equal(mx.arrival.airport.iata, 'BDL');
  // B6796 to Islip — CX, lastKnown == scheduled so no revised time; C-gate → Terminal C.
  const b6 = dep.find((x) => x.number === 'B6796');
  assert.ok(b6, 'B6796 present');
  assert.equal(b6.status, 'cancelled');
  assert.equal(b6.departure.scheduledTime.local, '2026-09-06 06:24:00-04:00');
  assert.equal(b6.departure.revisedTime, undefined);
  assert.equal(b6.departure.gate, 'C252A');
  assert.equal(b6.departure.terminal, 'C');
  // UA3936 to Dulles — no gate yet; terminal from the airline table.
  const ua = dep.find((x) => x.number === 'UA3936');
  assert.ok(ua, 'UA3936 present');
  assert.equal(ua.departure.gate, undefined);
  assert.equal(ua.departure.terminal, 'B');
  // Every C-gate is Terminal C; every numeric-gate departure resolved through the table.
  for (const x of dep) {
    const g = x.departure.gate || '';
    if (/^C\d/.test(g)) assert.equal(x.departure.terminal, 'C', `${x.number} gate ${g}`);
  }
});

test('mco departures: through-flights show the final destination with the stops as _stops / via', () => {
  const dep = mcoParseFeed(fx('mco-dep-sample.json'), 'dep', NOW);
  // MX854: MCO → RDU → ALB (routeStep 0 RDU, routeStep 1 ALB = destinationAirport).
  const mx = dep.filter((x) => x.number === 'MX854');
  assert.equal(mx.length, 1, 'MX854 emitted twice in the feed, once here');
  assert.equal(mx[0].arrival.airport.iata, 'ALB');
  assert.deepEqual(mx[0]._stops, [{ iata: 'RDU', city: '' }, { iata: 'ALB', city: '' }]);
  assert.equal(mx[0]._mcoViaStop, 'RDU');
  assert.equal(mx[0].departure.gate, '9');
  assert.equal(mx[0].departure.scheduledTime.local, '2026-09-06 07:00:00-04:00');  // 1788692400
  // UA2611: MCO → IAH → SFO → SEA, three rows.
  const ua = dep.filter((x) => x.number === 'UA2611');
  assert.equal(ua.length, 1);
  assert.equal(ua[0].arrival.airport.iata, 'SEA');
  assert.deepEqual(ua[0]._stops.map((s) => s.iata), ['IAH', 'SFO', 'SEA']);
  assert.equal(ua[0]._mcoViaStop, 'IAH, SFO');
  assert.equal(ua[0].departure.gate, '41');
  assert.equal(ua[0].departure.terminal, 'B');
  // Nonstops carry neither field.
  const f9 = dep.find((x) => x.number === 'F94726' && x._authTs === 1788664620000);
  assert.equal(f9._stops, undefined);
  assert.equal(f9._mcoViaStop, undefined);
});

test('mco: direction is the arrival flag; garbage and the empty-window body parse to nothing', () => {
  // Every row is flagged, so each capture reads empty for the other direction.
  assert.deepEqual(mcoParseFeed(fx('mco-dep-sample.json'), 'arr', NOW), []);
  assert.deepEqual(mcoParseFeed(fx('mco-arr-sample.json'), 'dep', NOW), []);
  assert.deepEqual(mcoParseFeed('', 'dep', NOW), []);
  assert.deepEqual(mcoParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(mcoParseFeed('{}', 'dep', NOW), []);
  // What the API returns (with HTTP 404) when the window holds no flights.
  assert.deepEqual(mcoParseFeed('{"data":{},"status":{"code":404,"message":"No flights found for the current window."}}', 'arr', NOW), []);
});
