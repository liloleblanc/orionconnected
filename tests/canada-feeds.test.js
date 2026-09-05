// Canada batch 2 — YOW / YQB / YEG parsers against verbatim payloads
// captured from each airport's own site on 2026-09-04/05. Traps pinned:
// YOW's 12-hour timestamps whose estimate can land on the NEXT day,
// YQB's epoch-ms Algolia hits (and its aircraftName — the first feed to
// answer "what aircraft" directly), and YEG's status text that smuggles
// the revised time inside the words ("Delayed 20:45").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yowParseFeed, yqbParseHits, yegParseBoard } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-04T22:00:00-06:00');

test('yow: 12h times with dates; estimate crossing midnight becomes revised', () => {
  const dep = yowParseFeed(fx('yow-feed-sample.json'), 'dep', NOW);
  assert.ok(dep.length >= 3, `parsed ${dep.length}`);
  const ac = dep.find((x) => x.number === 'AC1967');
  assert.ok(ac, 'AC1967 present');
  assert.ok(ac.departure.scheduledTime.local.startsWith('2026-09-03 22:10'),
    `sched 10:10 PM → ${ac.departure.scheduledTime.local}`);
  assert.ok(ac.departure.revisedTime, 'EstTime differs');
  assert.ok(ac.departure.revisedTime.local.startsWith('2026-09-04 01:15'),
    `est 1:15 AM next day → ${ac.departure.revisedTime.local}`);
  assert.equal(ac.status, 'departed');
  assert.equal(ac.arrival.airport.iata, 'YYZ');       // feed supplies the code itself
  assert.equal(ac.departure.airline.iata, 'AC');
});

test('yow: arrivals carry the carousel as baggageBelt', () => {
  const arr = yowParseFeed(fx('yow-feed-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 3, `parsed ${arr.length}`);
  const belted = arr.find((x) => x.arrival.baggageBelt);
  assert.ok(belted, 'at least one arrival with a carousel string');
  assert.match(belted.arrival.baggageBelt, /^\d+$/);
  for (const x of arr) assert.equal(x.arrival.airport.iata, 'YOW');
});

test('yqb: epoch-ms hits parse; actual time becomes revised; aircraft flows through', () => {
  const raw = JSON.parse(fx('yqb-hits-sample.json'));
  const dep = yqbParseHits(fx('yqb-hits-sample.json'), 'dep');
  assert.ok(dep.length >= 1, `parsed ${dep.length}`);
  const ac = dep.find((x) => x.number === 'AC1951');
  assert.ok(ac, 'AC1951 present');
  assert.equal(ac.departure.gate, '36');
  assert.equal(ac.status, 'departed');
  assert.ok(ac.departure.revisedTime, 'atd differs from std');
  assert.match(ac.departure.scheduledTime.local, /-0[45]:00$/, 'Québec offset');
  const rawHit = raw.hits.find((h) => h.flightCode === 'AC1951');
  if (rawHit && rawHit.aircraftName) {
    assert.equal(ac.aircraft.model, rawHit.aircraftName);   // "what aircraft", answered
  }
  // This capture holds departures only; the arrivals side must simply be empty.
  assert.deepEqual(yqbParseHits(fx('yqb-hits-sample.json'), 'arr'), []);
});

test('yeg: status text carries the revision; city map reaches Yellowknife', () => {
  const dep = yegParseBoard(fx('yeg-dep-sample.html'), 'dep', NOW);
  assert.ok(dep.length >= 2, `parsed ${dep.length}`);
  const ac = dep.find((x) => x.number === 'AC 8113');
  assert.ok(ac, 'AC 8113 present (spaced, ADB style)');
  assert.equal(ac.status, 'delayed');
  assert.ok(ac.departure.scheduledTime.local.startsWith('2026-09-04 20:15'));
  assert.ok(ac.departure.scheduledTime.local.endsWith('-06:00'), 'Edmonton offset');
  assert.ok(ac.departure.revisedTime && ac.departure.revisedTime.local.includes('20:45'),
    '"Delayed 20:45" → revised 20:45');
  assert.equal(ac.departure.gate, '70');
  assert.equal(ac.arrival.airport.iata, 'YZF');
  assert.equal(ac.departure.airline.iata, 'AC');
});

test('yeg: arrivals put the value in baggageBelt, not gate', () => {
  const arr = yegParseBoard(fx('yeg-arr-sample.html'), 'arr', NOW);
  assert.ok(arr.length >= 2, `parsed ${arr.length}`);
  const belted = arr.find((x) => x.arrival.baggageBelt);
  assert.ok(belted, 'belt captured from the Baggage column');
  assert.equal(belted.arrival.gate, undefined);
  for (const x of arr) assert.equal(x.arrival.airport.iata, 'YEG');
});

test('canada: garbage in, empty out', () => {
  assert.deepEqual(yowParseFeed('not json', 'dep', NOW), []);
  assert.deepEqual(yqbParseHits('[]', 'dep'), []);
  assert.deepEqual(yegParseBoard('<html></html>', 'arr', NOW), []);
});
