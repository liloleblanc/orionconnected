// Charlotte / Kansas City / Manchester — CLT / MCI / MAN parsers on
// verbatim captures (2026-09-05). Pins: CLT's epoch-second vendor feed
// (LAS/MCO cousin), MCI's offset-less ISO + status enum, and MAN's
// GraphQL rows whose ICAO flight numbers (EZY2064) get mapped to the
// IATA code the boards key on (U2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cltParseFeed, mciParseFeed, manParseFeed } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-04T22:00:00-04:00');

test('clt: epoch seconds, operator rows, IATA airport, belt array joined', () => {
  const arr = cltParseFeed(fx('clt-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const b6 = arr.find((x) => x.number === 'B62149');
  assert.ok(b6, 'B62149 present');
  assert.equal(b6.arrival.gate, 'A28');
  assert.equal(b6.arrival.baggageBelt, '2');
  assert.equal(b6.status, 'arrived');              // "Landed"
  assert.equal(b6.departure.airport.iata, 'FLL');
  assert.equal(b6.arrival.airline.iata, 'B6');
  assert.ok(b6.arrival.scheduledTime.local.endsWith('-04:00'), 'EDT');
  const dep = cltParseFeed(fx('clt-sample.json'), 'dep', NOW);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'CLT'));
});

test('mci: offset-less ISO to Central; status enum; cityCode is IATA', () => {
  const arr = mciParseFeed(fx('mci-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const aa = arr.find((x) => x.number === 'AA9963');
  assert.ok(aa, 'AA9963 present');
  assert.equal(aa.status, 'cancelled');            // CX
  assert.ok(aa.arrival.scheduledTime.local.startsWith('2026-09-04 22:32'), aa.arrival.scheduledTime.local);
  assert.ok(aa.arrival.scheduledTime.local.endsWith('-05:00'), 'CDT');
  assert.equal(aa.arrival.gate, 'A12');
  assert.equal(aa.arrival.baggageBelt, '3');
  assert.equal(aa.departure.airport.iata, 'CVG');
});

test('man: GraphQL arrivals; ICAO flight number mapped to IATA; belt/gate', () => {
  const arr = manParseFeed(fx('man-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const ez = arr.find((x) => x.number === 'U22064');   // EZY2064 → U2 2064
  assert.ok(ez, 'EZY2064 mapped to U22064');
  assert.equal(ez.callSign, 'EZY2064');
  assert.equal(ez.arrival.gate, 'B12');
  assert.equal(ez.arrival.baggageBelt, '3');
  assert.equal(ez.status, 'arrived');              // "Arrived 01:17"
  assert.equal(ez.departure.airport.iata, 'CFU');
  assert.equal(ez.arrival.airline.iata, 'U2');
  assert.ok(ez.arrival.scheduledTime.local.startsWith('2026-09-05 01:05'), ez.arrival.scheduledTime.local);
});

test('hubs3: garbage in, empty out', () => {
  assert.deepEqual(cltParseFeed('{}', 'arr', NOW), []);
  assert.deepEqual(mciParseFeed('x', 'dep', NOW), []);
  assert.deepEqual(manParseFeed('{}', 'arr', NOW), []);
});
