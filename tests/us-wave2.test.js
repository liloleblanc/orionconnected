// US wave 2 — PDX / DTW / SAN / MSY parsers against verbatim captures
// (2026-09-05). Pins: Portland's offset-less ISO + padded gate + IATA
// Cities[], Detroit's dummy ScheduledDateTime (must use Estimated),
// San Diego's "T2-1" claim that encodes the terminal, and New Orleans's
// actual_time whose calendar day is wrong across midnight (settled).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdxParseFeed, dtwParseFeed, sanParseFeed, msyParseFeed } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-04T22:00:00-07:00');

test('pdx: offset-less ISO to Pacific, padded gate trimmed, IATA city, enum status', () => {
  const dep = pdxParseFeed(fx('pdx-sample.json'), 'dep', NOW);
  assert.ok(dep.length >= 1, `parsed ${dep.length}`);
  const dl = dep.find((x) => x.number === 'DL2359');
  assert.ok(dl, 'DL2359 present');
  assert.ok(dl.departure.scheduledTime.local.startsWith('2026-09-03 00:35'), dl.departure.scheduledTime.local);
  assert.ok(dl.departure.scheduledTime.local.endsWith('-07:00'), 'PDT');
  assert.equal(dl.departure.gate, 'D7');            // padding trimmed
  assert.equal(dl.status, 'departed');              // DP
  assert.equal(dl.arrival.airport.iata, 'MSP');
  const arr = pdxParseFeed(fx('pdx-sample.json'), 'arr', NOW);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'PDX'));
  assert.ok(arr.some((x) => x.arrival.baggageBelt), 'a carousel came through');
});

test('dtw: uses EstimatedDateTime because Scheduled is a 0001 dummy', () => {
  const arr = dtwParseFeed(fx('dtw-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const f = arr.find((x) => x.number === '9E5338');
  assert.ok(f, '9E5338 present');
  assert.ok(f.arrival.scheduledTime.local.startsWith('2026-09-04 21:05'), f.arrival.scheduledTime.local);
  assert.ok(!f.arrival.scheduledTime.local.startsWith('0001'), 'dummy date not used');
  assert.equal(f.arrival.gate, 'B5');
  assert.equal(f.status, 'arrived');
  assert.equal(f.departure.airport.iata, 'MKE');
});

test('san: FLIGHT_DATE+TIME combine; claim "T2-1" splits into terminal+belt', () => {
  const arr = sanParseFeed(fx('san-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const as = arr.find((x) => x.number === 'AS3051');
  assert.ok(as, 'AS3051 present');
  assert.ok(as.arrival.scheduledTime.local.startsWith('2026-09-05 08:39'), as.arrival.scheduledTime.local);
  assert.equal(as.arrival.gate, '29');
  assert.equal(as.arrival.terminal, '2');            // from T2-1
  assert.equal(as.arrival.baggageBelt, '1');
  assert.equal(as.departure.airport.iata, 'PHX');
  assert.equal(as.status, 'scheduled');              // "On Time"
});

test('msy: actual_time wrong-day across midnight is settled to a small delay', () => {
  const arr = msyParseFeed(fx('msy-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const ua = arr.find((x) => x.number === 'UA1884');
  assert.ok(ua, 'UA1884 present');
  assert.ok(ua.arrival.scheduledTime.local.startsWith('2026-09-05 23:53'), ua.arrival.scheduledTime.local);
  assert.ok(ua.arrival.revisedTime, 'revised present');
  assert.ok(ua.arrival.revisedTime.local.startsWith('2026-09-06 00:34'),
    `actual 00:34 should land next day, got ${ua.arrival.revisedTime.local}`);
  assert.ok(ua.arrival.revisedTime.utc > ua.arrival.scheduledTime.utc, 'a delay, not a 23h jump back');
});

test('us-wave2: garbage in, empty out', () => {
  assert.deepEqual(pdxParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(dtwParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(sanParseFeed('[]', 'arr', NOW), []);
  assert.deepEqual(msyParseFeed('{}', 'dep', NOW), []);
});
