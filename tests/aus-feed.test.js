// AUS Austin-Bergstrom — AirIT WebFIDS XML refresh feed against verbatim
// captures (2026-09-05 21:09 CDT). Pins: offset-less <stt> read as
// Central (CDT -05:00), the status clock ("Arrived 6:25P") as the revised
// gate time with cross-midnight settling ("Now 1:25A" on a 23:59 flight),
// gate/terminal/claim/type/tail, IATA far end from <CTY>, and the
// collapse of multi-stop Southwest rows emitted once per route city.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ausParseFeed } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T21:09:00-05:00');

test('aus arrivals: Central offset, status clock as revised, gate/claim/terminal/type/tail', () => {
  const arr = ausParseFeed(fx('aus-arr-sample.xml'), 'arr', NOW);
  // 69 <flight> rows, 3 of which are extra route-city copies (WN 801 x3, WN 2565 x2, WN 3396 x2).
  assert.equal(arr.length, 65, `parsed ${arr.length}`);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'AUS'));
  const dl = arr.find((x) => x.number === 'DL3612');
  assert.ok(dl, 'DL3612 present');
  assert.equal(dl.arrival.scheduledTime.local, '2026-09-05 18:59:00-05:00');
  assert.equal(dl.arrival.scheduledTime.utc, '2026-09-05 23:59:00+00:00');
  assert.equal(dl._authTs, 1788652740000);            // matches the feed's own timeInMillis
  assert.equal(dl.status, 'arrived');
  assert.ok(dl.arrival.revisedTime.local.startsWith('2026-09-05 18:25'), dl.arrival.revisedTime.local); // "Arrived 6:25P", not <att> 18:10
  assert.equal(dl.arrival.gate, '8');
  assert.equal(dl.arrival.terminal, '1');
  assert.equal(dl.arrival.baggageBelt, '2');
  assert.equal(dl.departure.airport.iata, 'AVL');
  assert.equal(dl.departure.airport.name, 'Asheville');
  assert.equal(dl.arrival.airline.iata, 'DL');
  assert.equal(dl.arrival.airline.name, 'Delta Airlines');
  assert.equal(dl.aircraft.model, 'E70');
  assert.equal(dl.aircraft.reg, 'N607CZ');
  // "Now 11:37P" = an estimate, so scheduled + revised (the YVR/DUB convention).
  const late = arr.find((x) => x.number === 'DL1170');
  assert.ok(late, 'DL1170 present');
  assert.equal(late.status, 'scheduled');
  assert.ok(late.arrival.revisedTime.local.startsWith('2026-09-05 23:37'), late.arrival.revisedTime.local);
  // International row: BA 187 from LHR, claim 8.
  const ba = arr.find((x) => x.number === 'BA187');
  assert.ok(ba, 'BA187 present');
  assert.equal(ba.departure.airport.iata, 'LHR');
  assert.equal(ba.arrival.baggageBelt, '8');
  assert.equal(ba.aircraft.model, '789');
});

test('aus arrivals: "Now 1:25A" on a 23:59 flight settles to the next day', () => {
  const arr = ausParseFeed(fx('aus-arr-sample.xml'), 'arr', NOW);
  const f = arr.find((x) => x.number === 'DL1335');
  assert.ok(f, 'DL1335 present');
  assert.equal(f.arrival.scheduledTime.local, '2026-09-05 23:59:00-05:00');
  assert.equal(f.arrival.revisedTime.local, '2026-09-06 01:25:00-05:00');
  assert.ok(f.arrival.revisedTime.utc > f.arrival.scheduledTime.utc, 'a delay, not a 22h jump back');
  const g = arr.find((x) => x.number === 'DL848');   // 23:58 → "Now 12:04A"
  assert.ok(g, 'DL848 present');
  assert.equal(g.arrival.revisedTime.local, '2026-09-06 00:04:00-05:00');
  const early = arr.find((x) => x.number === 'AA935'); // 09-06 00:14 → "Now 12:05A", same day
  assert.ok(early, 'AA935 present');
  assert.equal(early.arrival.revisedTime.local, '2026-09-06 00:05:00-05:00');
  const az = arr.find((x) => x.number === 'AA972');    // <TRN>0972 loses its leading zero
  assert.ok(az, 'AA972 present');
});

test('aus arrivals: multi-stop Southwest rows collapse to one flight with the last stop as origin', () => {
  const arr = ausParseFeed(fx('aus-arr-sample.xml'), 'arr', NOW);
  const wn = arr.filter((x) => x.number === 'WN801');
  assert.equal(wn.length, 1, 'WN801 emitted 3x (STL/PDX/LAS) in the feed, once here');
  assert.equal(wn[0].departure.airport.iata, 'LAS');   // route St. Louis → Portland → Las Vegas → AUS
  assert.equal(wn[0].departure.airport.name, 'Las Vegas');
  assert.equal(wn[0].status, 'arrived');
  assert.ok(wn[0].arrival.revisedTime.local.startsWith('2026-09-05 20:14'));
  const wn2 = arr.filter((x) => x.number === 'WN2565');
  assert.equal(wn2.length, 1);
  assert.equal(wn2[0].departure.airport.iata, 'PDX'); // Las Vegas → Portland → AUS
});

test('aus departures: tomorrow rows carry CDT, gate present, no belt, direction respected', () => {
  const dep = ausParseFeed(fx('aus-dep-sample.xml'), 'dep', NOW);
  assert.equal(dep.length, 72, `parsed ${dep.length}`);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'AUS'));
  assert.ok(dep.every((x) => !x.departure.baggageBelt && !x.arrival.baggageBelt));
  const f9 = dep.find((x) => x.number === 'F94702');
  assert.ok(f9, 'F94702 present');
  assert.equal(f9.departure.scheduledTime.local, '2026-09-05 17:37:00-05:00');
  assert.equal(f9.status, 'departed');
  assert.ok(f9.departure.revisedTime.local.startsWith('2026-09-05 18:16'), f9.departure.revisedTime.local); // "Departed 6:16P"
  assert.equal(f9.departure.gate, '37');
  assert.equal(f9.departure.terminal, '1');
  assert.equal(f9.arrival.airport.iata, 'ATL');
  assert.equal(f9.aircraft.model, '320');
  assert.equal(f9.aircraft.reg, 'N631FR');
  const dl = dep.find((x) => x.number === 'DL1344');
  assert.ok(dl, 'DL1344 present');
  assert.equal(dl.departure.scheduledTime.local, '2026-09-06 05:15:00-05:00');
  assert.equal(dl.status, 'scheduled');                 // "On Time"
  assert.equal(dl.departure.revisedTime, undefined);    // ett == stt → no revised
  assert.equal(dl.departure.gate, '4');
  // Every departure row is DIR=D, so the arrivals read of it is empty and vice versa.
  assert.deepEqual(ausParseFeed(fx('aus-dep-sample.xml'), 'arr', NOW), []);
  assert.deepEqual(ausParseFeed(fx('aus-arr-sample.xml'), 'dep', NOW), []);
});

test('aus: garbage in, empty out', () => {
  assert.deepEqual(ausParseFeed('', 'dep', NOW), []);
  assert.deepEqual(ausParseFeed('<html></html>', 'arr', NOW), []);
  assert.deepEqual(ausParseFeed('<?xml version="1.0"?><data><config><numFlights>0</numFlights></config></data>', 'arr', NOW), []);
});
