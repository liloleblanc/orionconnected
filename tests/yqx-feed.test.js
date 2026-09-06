// YQX Gander — ganderairport.com/flights/?type=arrivals|departures parser
// against verbatim captures (2026-09-06 03:37 NDT, before the day's first
// movement). Pins: the per-direction table class, "DD Mon" dates with no
// year, the trailing-space "St. John's " city → YYT, PAL's through-flight
// PB921 on BOTH boards twenty minutes apart, Newfoundland's half-hour
// offset (-02:30 NDT now, -03:30 NST in December), and the combined-page
// column swap the parser must survive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYqxPage, parseYqxTime } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T03:30:00-02:30');

// A synthetic page in the site's exact shape (8 cells + the commented-out
// Weather cell), for the states the quiet capture never shows.
const page = (cls, rows) => `<table class="${cls}">
  <tr><th>Flight</th><th>Airline</th><th>Date</th><th>Scheduled</th><th>Revised</th><th>Arriving From</th><th>Destination</th><th>Status</th><!-- <th>Weather</th> --></tr>
  ${rows.map((c) => `<tr>${c.map((v, i) => i === 7 ? `<td style="color: green">\n  ${v}</td>` : `<td>${v}</td>`).join('\n')}\n<!-- <td></td> --></tr>`).join('\n')}
</table>`;
const ARR = 'flights-table-arrivals', DEP = 'flights-table-departures';

test('yqx: arrivals table — 18 rows, AC1170 from Toronto on NDT (-02:30)', () => {
  const arr = parseYqxPage(fx('yqx-arr-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 18, `parsed ${arr.length}`);
  for (const x of arr) {
    assert.equal(x.arrival.airport.iata, 'YQX');
    assert.equal(x.arrival.airport.icao, 'CYQX');
    assert.equal(x.arrival.airport.name, 'Gander');
    assert.ok(x.number && Number.isFinite(x._authTs));
    assert.ok(x.arrival.scheduledTime.local.endsWith('-02:30'), `NDT: ${x.arrival.scheduledTime.local}`);
    assert.equal(x.codeshareStatus, 'IsOperator');
  }
  const ac = arr.find((x) => x.number === 'AC1170');
  assert.ok(ac, 'AC1170 present');
  assert.equal(ac.arrival.scheduledTime.local, '2026-09-06 13:20:00-02:30');
  assert.equal(ac.arrival.scheduledTime.utc, '2026-09-06 15:50:00+00:00');
  assert.equal(ac._authTs, Date.parse('2026-09-06T13:20:00-02:30'));
  assert.equal(ac.departure.airport.iata, 'YYZ');            // "Toronto"
  assert.equal(ac.departure.airport.name, 'Toronto');
  assert.equal(ac.arrival.airline.iata, 'AC');
  assert.equal(ac.arrival.airline.name, 'Air Canada');
  assert.equal(ac.status, 'scheduled');                      // "OnTime"
  assert.equal(ac.arrival.revisedTime, undefined);           // Revised == Scheduled
  assert.equal(ac.callSign, null);
  // Six days of AC1170 (06–11 Sep); the schedule shifts to 13:39 from the 8th.
  const ac1170 = arr.filter((x) => x.number === 'AC1170').map((x) => x.arrival.scheduledTime.local);
  assert.deepEqual(ac1170, [
    '2026-09-06 13:20:00-02:30', '2026-09-07 13:20:00-02:30', '2026-09-08 13:39:00-02:30',
    '2026-09-09 13:39:00-02:30', '2026-09-10 13:39:00-02:30', '2026-09-11 13:39:00-02:30'
  ]);
  // "St. John's " — literal apostrophe, trailing space — is YYT.
  const pb = arr.find((x) => x.number === 'PB921');
  assert.ok(pb, 'PB921 present');
  assert.equal(pb.departure.airport.iata, 'YYT');
  assert.equal(pb.departure.airport.name, "St. John's");
  assert.equal(pb.arrival.airline.iata, 'PB');
  assert.equal(pb.arrival.airline.name, 'PAL Airlines');
  assert.equal(pb.arrival.scheduledTime.local, '2026-09-06 14:25:00-02:30');
  const pb922 = arr.find((x) => x.number === 'PB922');
  assert.equal(pb922.departure.airport.iata, 'YYR');          // "Goose Bay"
  assert.equal(pb922.arrival.scheduledTime.local, '2026-09-06 21:50:00-02:30');
  assert.equal(arr.find((x) => x.number === 'AC7696').departure.airport.iata, 'YHZ');   // "Halifax"
  assert.equal(arr.find((x) => x.number === 'AC7902').departure.airport.iata, 'YUL');   // "Montreal"
  // Six calendar days, rows already in time order.
  assert.equal(new Set(arr.map((x) => x.arrival.scheduledTime.local.slice(0, 10))).size, 6);
  for (let i = 1; i < arr.length; i++) assert.ok(arr[i]._authTs >= arr[i - 1]._authTs, 'ascending');
  assert.ok(arr.every((x) => x.departure.airport.iata !== 'YQX'), 'no Gander→Gander from the column guard');
});

test('yqx: departures table — 18 rows, AC1171 to Toronto, PB921 through-flight', () => {
  const dep = parseYqxPage(fx('yqx-dep-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 18, `parsed ${dep.length}`);
  for (const x of dep) {
    assert.equal(x.departure.airport.iata, 'YQX');
    assert.ok(x.departure.scheduledTime.local.endsWith('-02:30'), 'all NDT');
  }
  const ac = dep.find((x) => x.number === 'AC1171');
  assert.ok(ac, 'AC1171 present');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-06 14:25:00-02:30');
  assert.equal(ac.arrival.airport.iata, 'YYZ');
  assert.equal(ac.arrival.airport.name, 'Toronto');
  assert.equal(ac.departure.airline.iata, 'AC');
  assert.equal(ac.departure.airline.name, 'Air Canada');
  assert.equal(ac.status, 'scheduled');
  assert.equal(ac.departure.revisedTime, undefined);
  assert.equal(dep[0].number, 'AC1171');
  // PB921 lands from St. John's at 14:25 and leaves for Goose Bay at 14:45:
  // one row on each board, twenty minutes apart.
  const arr = parseYqxPage(fx('yqx-arr-sample.html'), 'arr', NOW);
  const pbIn = arr.find((x) => x.number === 'PB921');
  const pbOut = dep.find((x) => x.number === 'PB921');
  assert.equal(pbOut.arrival.airport.iata, 'YYR');
  assert.equal(pbOut.arrival.airport.name, 'Goose Bay');
  assert.equal(pbOut.departure.scheduledTime.local, '2026-09-06 14:45:00-02:30');
  assert.equal(pbOut._authTs - pbIn._authTs, 20 * 60e3);
  const pb922 = dep.find((x) => x.number === 'PB922');
  assert.equal(pb922.arrival.airport.iata, 'YYT');            // "St. John's "
  assert.equal(pb922.departure.scheduledTime.local, '2026-09-06 22:10:00-02:30');
  assert.equal(dep.find((x) => x.number === 'AC7695').arrival.airport.iata, 'YHZ');
  assert.equal(dep.find((x) => x.number === 'AC7903').arrival.airport.iata, 'YUL');
  // The table class is the direction: a page of the other kind yields nothing.
  assert.deepEqual(parseYqxPage(fx('yqx-arr-sample.html'), 'dep', NOW), []);
  assert.deepEqual(parseYqxPage(fx('yqx-dep-sample.html'), 'arr', NOW), []);
});

test('yqx: revised time, status words, midnight settle, winter offset', () => {
  const d = parseYqxPage(page(ARR, [['PB921', 'PAL Airlines', '06 Sep', '14:25', '15:10', "St. John's ", 'Gander', 'Delayed']]), 'arr', NOW);
  assert.equal(d.length, 1);
  assert.equal(d[0].status, 'delayed');
  assert.equal(d[0].arrival.scheduledTime.local, '2026-09-06 14:25:00-02:30');
  assert.equal(d[0].arrival.revisedTime.local, '2026-09-06 15:10:00-02:30');
  const c = parseYqxPage(page(DEP, [['AC1171', 'Air Canada', '06 Sep', '14:25', '14:25', 'Gander', 'Toronto', 'Cancelled']]), 'dep', NOW);
  assert.equal(c[0].status, 'cancelled');
  assert.equal(c[0].departure.revisedTime, undefined);
  // A 23:50 arrival revised to 00:20 is twenty past midnight, not 23½ h early.
  const m = parseYqxPage(page(ARR, [['PB922', 'PAL Airlines', '06 Sep', '23:50', '00:20', 'Goose Bay', 'Gander', 'Delayed']]), 'arr', NOW);
  assert.equal(m[0].arrival.revisedTime.local, '2026-09-07 00:20:00-02:30');
  assert.ok(m[0].arrival.revisedTime.utc > m[0].arrival.scheduledTime.utc, 'a delay, not a jump back');
  // Status vocabulary the boards understand.
  const st = (s) => parseYqxPage(page(DEP, [['AC1171', 'Air Canada', '06 Sep', '14:25', '14:25', 'Gander', 'Toronto', s]]), 'dep', NOW)[0].status;
  assert.equal(st('OnTime'), 'scheduled');
  assert.equal(st('Departed'), 'departed');
  assert.equal(st('Landed'), 'arrived');
  assert.equal(st('Boarding'), 'boarding');
  assert.equal(st('Late'), 'delayed');
  // December in Newfoundland is NST, -03:30 — the tz helper, not a constant.
  const w = parseYqxTime('15 Dec', '08:05', NOW);
  assert.equal(w.local, '2026-12-15 08:05:00-03:30');
  assert.equal(w.utc, '2026-12-15 11:35:00+00:00');
  // A board read on 30 Dec that lists "02 Jan" means next year.
  const ny = parseYqxTime('02 Jan', '09:00', Date.parse('2026-12-30T12:00:00-03:30'));
  assert.equal(ny.local, '2027-01-02 09:00:00-03:30');
});

test('yqx: swapped columns, dateless row, digits-only number, ICAO prefix', () => {
  // The combined /flights/ page prints Gander in the far column for a
  // departure; the other end is still Toronto.
  const s = parseYqxPage(page(DEP, [['AC1171', 'Air Canada', '06 Sep', '14:25', '14:25', 'Toronto', 'Gander', 'OnTime']]), 'dep', NOW);
  assert.equal(s[0].arrival.airport.iata, 'YYZ');
  assert.equal(s[0].departure.airport.iata, 'YQX');
  // No date cell → today in Gander's clock (03:30 NDT on the 6th is still
  // the 6th; in UTC it is already 06:00 on the 6th, but at 23:00 NDT the
  // UTC date would be tomorrow's — the airport's day wins).
  const late = Date.parse('2026-09-06T23:00:00-02:30');
  const dl = parseYqxPage(page(ARR, [['AC1170', 'Air Canada', '', '23:30', '23:30', 'Toronto', 'Gander', 'OnTime']]), 'arr', late);
  assert.equal(dl[0].arrival.scheduledTime.local, '2026-09-06 23:30:00-02:30');
  // Digits-only flight number takes its prefix from the carrier name.
  const n = parseYqxPage(page(ARR, [['921', 'PAL Airlines', '06 Sep', '14:25', '14:25', "St. John's ", 'Gander', 'OnTime']]), 'arr', NOW);
  assert.equal(n[0].number, 'PB921');
  assert.equal(n[0].arrival.airline.iata, 'PB');
  // An ICAO-prefixed number folds back to the IATA key.
  const i = parseYqxPage(page(ARR, [['PVL921', 'PAL Airlines', '06 Sep', '14:25', '14:25', "St. John's ", 'Gander', 'OnTime']]), 'arr', NOW);
  assert.equal(i[0].number, 'PB921');
  // An unknown city keeps its name with no code, rather than a wrong code.
  const u = parseYqxPage(page(ARR, [['WG123', 'Sunwing', '06 Sep', '14:25', '14:25', 'Somewhere New', 'Gander', 'OnTime']]), 'arr', NOW);
  assert.equal(u[0].departure.airport.iata, null);
  assert.equal(u[0].departure.airport.name, 'Somewhere New');
  assert.equal(u[0].arrival.airline.iata, 'WG');
});

test('yqx: garbage in, empty out', () => {
  assert.deepEqual(parseYqxPage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(parseYqxPage('', 'dep', NOW), []);
  assert.deepEqual(parseYqxPage(page(ARR, [['AC1170', 'Air Canada', '06 Sep', 'TBA', 'TBA', 'Toronto', 'Gander', 'OnTime']]), 'arr', NOW), []);
  assert.equal(parseYqxTime('Scheduled', '', NOW), null);
  assert.equal(parseYqxTime('06 Sep', '25:00', NOW), null);
  assert.equal(parseYqxTime('06 Sep', '13:20 PM', NOW), null);
});
