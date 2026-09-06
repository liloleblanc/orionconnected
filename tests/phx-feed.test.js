// PHX Phoenix Sky Harbor — api.phx.aero flight-information JSON against a
// verbatim capture (2026-09-06 06:08:50 UTC = 2026-09-05 23:08 MST; 799
// rows, 382 arrivals + 417 departures, both directions in one array).
// Pins: the bogus "Z" on ScheduledTime read as Phoenix wall-clock (MST,
// -07:00 all year), display clocks ("9:57 PM" = today, "September 6,
// 4:52 AM" = that day) with ChockTime as the gate clock over Actual and
// Estimated, StatusCode ON/AR/DP, terminal/gate/claim, the far end from
// "CITY (IATA)", one row per route city on through-flights, and the drop
// of the phantom "Z"-suffixed twins with their PHX→PHX self-rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phxParseFeed } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T23:08:00-07:00');

test('phx arrivals: bogus Z is local MST, gate clock from ChockTime, gate/terminal/claim, origin from Destination', () => {
  const arr = phxParseFeed(fx('phx-sample.json'), 'arr', NOW);
  // 382 AD=A rows minus 9 phantom "Z" rows (AA4044Z x2, AA6318Z x2, AA2094Z x2,
  // AA3645Z x2, AA2986Z) — the PHX self-rows are among those nine.
  assert.equal(arr.length, 373, `parsed ${arr.length}`);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'PHX'));
  assert.ok(arr.every((x) => x.departure.airport.iata !== 'PHX'), 'no PHX→PHX self-row survives');
  assert.ok(arr.every((x) => /^[A-Z0-9]{2}\d+$/.test(x.number)), 'no letter-suffixed numbers');
  assert.ok(arr.every((x) => x.arrival.scheduledTime.local.endsWith('-07:00')), 'MST, never PDT/MDT');
  // AA1218 from DCA: feed says "2026-09-05T11:50:00Z" and "11:50 AM" — local, not UTC.
  const aa = arr.find((x) => x.number === 'AA1218');
  assert.ok(aa, 'AA1218 present');
  assert.equal(aa.arrival.scheduledTime.local, '2026-09-05 11:50:00-07:00');
  assert.equal(aa.arrival.scheduledTime.utc, '2026-09-05 18:50:00+00:00');
  assert.equal(aa._authTs, 1788634200000);
  assert.equal(aa.status, 'arrived');                                   // AR
  // ChockTime 9:57 PM is the gate clock; Actual 9:53 PM (runway) and Estimated 9:59 PM lose.
  assert.equal(aa.arrival.revisedTime.local, '2026-09-05 21:57:00-07:00');
  assert.equal(aa.arrival.gate, 'A2');
  assert.equal(aa.arrival.terminal, '4');
  assert.equal(aa.arrival.baggageBelt, '5');
  assert.equal(aa.departure.airport.iata, 'DCA');
  assert.equal(aa.departure.airport.name, 'WASHINGTON - NATIONAL');
  assert.equal(aa.arrival.airline.iata, 'AA');
  assert.equal(aa.arrival.airline.name, 'American Airlines');
  assert.equal(aa.codeshareStatus, 'IsOperator');
  // Terminal 3 row: DL757 from ATL, claim 3, chock 9:35 PM.
  const dl = arr.find((x) => x.number === 'DL757');
  assert.ok(dl, 'DL757 present');
  assert.equal(dl.arrival.terminal, '3');
  assert.equal(dl.arrival.gate, 'F9');
  assert.equal(dl.arrival.baggageBelt, '3');
  assert.equal(dl.arrival.revisedTime.local, '2026-09-05 21:35:00-07:00');
  assert.equal(dl.departure.airport.iata, 'ATL');
  // Arrived with no ChockTime yet: Estimated (11:00 PM) stands in, not Actual (10:55 PM runway).
  const f9 = arr.find((x) => x.number === 'F91896');
  assert.ok(f9, 'F91896 present');
  assert.equal(f9.status, 'arrived');
  assert.equal(f9.arrival.revisedTime.local, '2026-09-05 23:00:00-07:00');
  assert.equal(f9.arrival.airline.name, 'Frontier Airlines');
});

test('phx arrivals: tomorrow rows carry the explicit "September 6," clock; "Now ..." is scheduled + revised', () => {
  const arr = phxParseFeed(fx('phx-sample.json'), 'arr', NOW);
  // WN1697 from Maui: "2026-09-06T05:05:00Z" / "September 6, 5:05 AM", Status "Now September 6, 4:52 AM".
  const wn = arr.find((x) => x.number === 'WN1697');
  assert.ok(wn, 'WN1697 present');
  assert.equal(wn.arrival.scheduledTime.local, '2026-09-06 05:05:00-07:00');
  assert.equal(wn.arrival.scheduledTime.utc, '2026-09-06 12:05:00+00:00');
  assert.equal(wn.status, 'scheduled');                                  // ON — the board derives early/delayed
  assert.equal(wn.arrival.revisedTime.local, '2026-09-06 04:52:00-07:00');
  assert.ok(wn.arrival.revisedTime.utc < wn.arrival.scheduledTime.utc, 'an early estimate, same day');
  assert.equal(wn.departure.airport.iata, 'OGG');
  assert.equal(wn.arrival.gate, 'C4');
  // AA2786 from ORD: due 12:14 AM tomorrow, Estimated "September 6, 12:09 AM".
  const late = arr.find((x) => x.number === 'AA2786');
  assert.ok(late, 'AA2786 present');
  assert.equal(late.arrival.scheduledTime.local, '2026-09-06 00:14:00-07:00');
  assert.equal(late.arrival.revisedTime.local, '2026-09-06 00:09:00-07:00');
  assert.equal(late.arrival.baggageBelt, '7');
  // On time with Estimated == Scheduled → no revision at all.
  const on = arr.find((x) => x.number === 'AC1771');
  assert.ok(on, 'AC1771 present');
  assert.equal(on.status, 'scheduled');                                  // StatusCode "" + "On Time"
  assert.equal(on.arrival.revisedTime, undefined);
  assert.equal(on.arrival.terminal, '3');
});

test('phx arrivals: a through-flight keeps one row per route city; phantom Z twins are gone', () => {
  const arr = phxParseFeed(fx('phx-sample.json'), 'arr', NOW);
  // UA455 is one feed ID emitted twice — "from ORD" and "from PIT" — and the
  // feed does not say which is the immediate leg. Both rows stay, as on the
  // airport's own board.
  const ua = arr.filter((x) => x.number === 'UA455');
  assert.equal(ua.length, 2, 'UA455 once per route city');
  assert.deepEqual(ua.map((x) => x.departure.airport.iata).sort(), ['ORD', 'PIT']);
  assert.ok(ua.every((x) => x.arrival.gate === 'E5' && x.arrival.terminal === '3'));
  assert.ok(ua.every((x) => x.arrival.scheduledTime.local === '2026-09-06 15:20:00-07:00'));
  // AA4044 from Reno was three rows in the feed: the real one (gate B10) plus
  // "4044Z" from RNO and "4044Z" from PHX. Exactly one survives.
  const aa = arr.filter((x) => /^AA4044/.test(x.number));
  assert.equal(aa.length, 1, 'phantom AA4044Z rows dropped');
  assert.equal(aa[0].number, 'AA4044');
  assert.equal(aa[0].arrival.gate, 'B10');
  assert.equal(aa[0].departure.airport.iata, 'RNO');
  assert.equal(arr.filter((x) => x.number === 'AA2986').length, 1);   // 2986Z had no PHX row, still a twin
});

test('phx departures: chock as gate clock, Terminal 3/4, no belts, route cities, direction respected', () => {
  const dep = phxParseFeed(fx('phx-sample.json'), 'dep', NOW);
  // 417 AD=D rows minus 12 phantom "Z" rows.
  assert.equal(dep.length, 405, `parsed ${dep.length}`);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'PHX'));
  assert.ok(dep.every((x) => x.arrival.airport.iata !== 'PHX'));
  assert.ok(dep.every((x) => !x.departure.baggageBelt && !x.arrival.baggageBelt));
  // BA288 to Heathrow: departed; ChockTime 9:03 PM (pushback) wins over Actual 9:18 PM (wheels up).
  const ba = dep.find((x) => x.number === 'BA288');
  assert.ok(ba, 'BA288 present');
  assert.equal(ba.departure.scheduledTime.local, '2026-09-05 21:05:00-07:00');
  assert.equal(ba.departure.scheduledTime.utc, '2026-09-06 04:05:00+00:00');
  assert.equal(ba.status, 'departed');                                   // DP
  assert.equal(ba.departure.revisedTime.local, '2026-09-05 21:03:00-07:00');
  assert.equal(ba.departure.gate, 'B25');
  assert.equal(ba.departure.terminal, '4');
  assert.equal(ba.arrival.airport.iata, 'LHR');
  assert.equal(ba.arrival.airport.name, 'LONDON-HEATHROW');
  assert.equal(ba.departure.airline.iata, 'BA');
  assert.equal(ba.departure.airline.name, 'British Airways');
  // WN5008 to LAS: departed 11:04 PM off-blocks against a 9:50 PM schedule, no Actual yet.
  const wn = dep.find((x) => x.number === 'WN5008');
  assert.ok(wn, 'WN5008 present');
  assert.equal(wn.status, 'departed');
  assert.equal(wn.departure.revisedTime.local, '2026-09-05 23:04:00-07:00');
  assert.equal(wn.departure.gate, 'D16');
  // AN2001 (Advanced Air) to Silver City: "Now September 6, 10:54 AM" on an 8:42 AM schedule.
  const an = dep.find((x) => x.number === 'AN2001');
  assert.ok(an, 'AN2001 present');
  assert.equal(an.departure.scheduledTime.local, '2026-09-06 08:42:00-07:00');
  assert.equal(an.status, 'scheduled');
  assert.equal(an.departure.revisedTime.local, '2026-09-06 10:54:00-07:00');
  assert.equal(an.departure.terminal, '3');
  assert.equal(an.departure.gate, 'F13');
  assert.equal(an.arrival.airport.iata, 'SVC');
  assert.equal(an.departure.airline.name, 'Advanced Air');
  // Far-out, on time: no revision.
  const ua = dep.filter((x) => x.number === 'UA337');
  assert.equal(ua.length, 2);                                            // to DEN and to MFR — one feed ID
  assert.ok(ua.every((x) => x.status === 'scheduled' && x.departure.revisedTime === undefined));
  // WN3167 lists three route cities on one ID and gate.
  const wn3 = dep.filter((x) => x.number === 'WN3167');
  assert.deepEqual(wn3.map((x) => x.arrival.airport.iata).sort(), ['BNA', 'DCA', 'PVD']);
  assert.ok(wn3.every((x) => x.departure.gate === 'C12'));
  // Phantom twins: AA2871Z beside AA2871 (gate B7), AA4044Z x2 beside AA4044 (gate B18).
  assert.equal(dep.filter((x) => /^AA2871/.test(x.number)).length, 1);
  assert.equal(dep.find((x) => x.number === 'AA2871').departure.gate, 'B7');
  assert.equal(dep.filter((x) => /^AA4044/.test(x.number)).length, 1);
  assert.equal(dep.find((x) => x.number === 'AA4044').departure.gate, 'B18');
  // Arrivals never leak into the departures read and vice versa.
  assert.ok(!dep.some((x) => x.number === 'AA1218'));
  const arr = phxParseFeed(fx('phx-sample.json'), 'arr', NOW);
  assert.ok(!arr.some((x) => x.number === 'BA288'));
});

test('phx: dateless clocks mean today in Phoenix and settle across midnight', () => {
  const row = (o) => JSON.stringify([{
    ID: 1, Flightnumber: '100', Airline: 'Test Air', LineCode: 'XX', Destination: 'DENVER (DEN)',
    Terminal: '3', Gate: 'E1', Status: 'On Time', StatusCode: 'ON', BagClaim: '', CodeShares: [],
    AD: 'A', Actual: '', Estimated: '', ChockTime: '', LogoLarge: '', LogoSmall: '', Topic: '1', TimeSortKey: 0, ...o
  }]);
  // Due 12:14 AM tomorrow, Estimated "11:58 PM" with no date = tonight → 16 min early, not a 24 h delay.
  const a = phxParseFeed(row({ ScheduledTime: '2026-09-06T00:14:00Z', ScheduledDateTime: 'September 6, 12:14 AM', Estimated: '11:58 PM' }), 'arr', NOW);
  assert.equal(a.length, 1);
  assert.equal(a[0].arrival.scheduledTime.local, '2026-09-06 00:14:00-07:00');
  assert.equal(a[0].arrival.revisedTime.local, '2026-09-05 23:58:00-07:00');
  assert.ok(a[0].arrival.revisedTime.utc < a[0].arrival.scheduledTime.utc);
  // A clock printed at 11:59 PM but read 30 s after midnight (the cache is
  // up to 90 s old): "today" has rolled over, so the naive read lands a day
  // late; settling toward the schedule puts it back.
  const afterMidnight = Date.parse('2026-09-06T00:00:30-07:00');
  const b = phxParseFeed(row({ ScheduledTime: '2026-09-05T23:50:00Z', ScheduledDateTime: 'September 5, 11:50 PM', StatusCode: 'AR', Status: 'Arrived', ChockTime: '11:59 PM' }), 'arr', afterMidnight);
  assert.equal(b[0].status, 'arrived');
  assert.equal(b[0].arrival.revisedTime.local, '2026-09-05 23:59:00-07:00');
  // An explicit date is taken as written, even across the year boundary.
  const c = phxParseFeed(row({ ScheduledTime: '2026-12-31T23:30:00Z', ScheduledDateTime: '11:30 PM', Estimated: 'January 1, 12:20 AM' }), 'arr', Date.parse('2026-12-31T22:00:00-07:00'));
  assert.equal(c[0].arrival.revisedTime.local, '2027-01-01 00:20:00-07:00');
  // Unknown StatusCode falls back to the status text; a phantom twin needs a real twin to be dropped.
  const d = phxParseFeed(row({ ScheduledTime: '2026-09-06T09:00:00Z', ScheduledDateTime: 'September 6, 9:00 AM', StatusCode: 'ZZ', Status: 'Cancelled' }), 'arr', NOW);
  assert.equal(d[0].status, 'cancelled');
  const e = phxParseFeed(row({ Flightnumber: '100Z', ScheduledTime: '2026-09-06T09:00:00Z', ScheduledDateTime: 'September 6, 9:00 AM' }), 'arr', NOW);
  assert.equal(e.length, 1, 'a lone suffixed row is a real flight');
  assert.equal(e[0].number, 'XX100');
});

test('phx: garbage in, empty out', () => {
  assert.deepEqual(phxParseFeed('', 'dep', NOW), []);
  assert.deepEqual(phxParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(phxParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(phxParseFeed('[]', 'arr', NOW), []);
  assert.deepEqual(phxParseFeed('[{"ID":1}]', 'arr', NOW), []);
});
