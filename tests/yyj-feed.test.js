// YYJ Victoria — yyj.ca WordPress AJAX board against a verbatim capture
// (2026-09-05 19:09 PDT). Pins: the wp_localize_script nonce extraction,
// the Today/Tomorrow tables in one payload, arrival/departure row split,
// "Sat Sep 5" + 12h clock landing on the Pacific offset, the status
// bubble's actual/estimated time as revisedTime (including a 12:40 AM
// delay that crosses midnight), the carrier-name → IATA fallback, and
// gate on both directions (the board has no belt column).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yyjParseFeed, yyjParseNonce } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T19:09:00-07:00');

test('yyj: nonce comes out of the flightsData localize blob', () => {
  assert.equal(yyjParseNonce(fx('yyj-page-sample.html')), '28835b65bb');
  assert.equal(yyjParseNonce('<html></html>'), null);
});

test('yyj: departures — counts, Pacific offset, gate, status, revised', () => {
  const dep = yyjParseFeed(fx('yyj-feed-sample.json'), 'dep', NOW);
  assert.equal(dep.length, 76);                        // 36 today + 40 tomorrow
  assert.ok(dep.every((x) => x.departure.airport.iata === 'YYJ'));
  const ac = dep.find((x) => x.number === 'AC1948');
  assert.ok(ac, 'AC1948 present');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-05 06:00:00-07:00');
  assert.equal(ac.departure.scheduledTime.utc, '2026-09-05 13:00:00+00:00');
  assert.equal(ac.departure.gate, '13');
  assert.equal(ac.status, 'departed');
  assert.ok(ac.departure.revisedTime.local.startsWith('2026-09-05 06:08'), ac.departure.revisedTime.local);
  assert.equal(ac.arrival.airport.iata, 'YUL');          // Montreal
  assert.equal(ac.departure.airline.iata, 'AC');
  assert.equal(ac.departure.airline.name, 'Air Canada');
  // A bare "Departed" (no time) row: departed, no revisedTime.
  const pd = dep.find((x) => x.number === 'PD448');
  assert.ok(pd, 'PD448 present');
  assert.equal(pd.status, 'departed');
  assert.equal(pd.departure.revisedTime, undefined);
  assert.equal(pd.arrival.airport.iata, 'YOW');
  // Delayed with an estimate.
  const ws = dep.find((x) => x.number === 'WS3326');
  assert.equal(ws.status, 'delayed');
  assert.ok(ws.departure.scheduledTime.local.startsWith('2026-09-05 16:30'));
  assert.ok(ws.departure.revisedTime.local.startsWith('2026-09-05 20:15'), ws.departure.revisedTime.local);
  // Pacific Coastal: 8P prefix and the name fallback both agree.
  const pc = dep.find((x) => x.number === '8P1535');
  assert.ok(pc, '8P1535 present');
  assert.equal(pc.departure.airline.iata, '8P');
  assert.equal(pc.departure.airline.name, 'Pacific Coastal');
  assert.equal(pc.arrival.airport.iata, 'YLW');
});

test('yyj: arrivals — tomorrow rows included, midnight-crossing delay settled', () => {
  const arr = yyjParseFeed(fx('yyj-feed-sample.json'), 'arr', NOW);
  assert.equal(arr.length, 76);                        // 35 today + 41 tomorrow
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'YYJ'));
  const ws = arr.find((x) => x.number === 'WS501');
  assert.ok(ws, 'WS501 present');
  assert.equal(ws.arrival.scheduledTime.local, '2026-09-05 07:00:00-07:00');
  assert.equal(ws.status, 'arrived');
  assert.ok(ws.arrival.revisedTime.local.startsWith('2026-09-05 06:48'));
  assert.equal(ws.arrival.gate, '13');
  assert.equal(ws.arrival.baggageBelt, undefined);       // no belt column on this board
  assert.equal(ws.departure.airport.iata, 'YEG');
  // WS3329 sched 11:25 PM, "Delayed: 12:40 AM" → next calendar day, not 23 h early.
  const late = arr.find((x) => x.number === 'WS3329' && x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(late, 'WS3329 (today) present');
  assert.equal(late.status, 'delayed');
  assert.equal(late.arrival.revisedTime.local, '2026-09-06 00:40:00-07:00');
  assert.ok(late.arrival.revisedTime.utc > late.arrival.scheduledTime.utc, 'a delay, not a jump back');
  // Tomorrow's table lands on Sep 6; "On Time: 12:27 PM" is an estimate.
  // (AS2048 flies daily — today's instance has already arrived, so pick Sep 6.)
  const as = arr.find((x) => x.number === 'AS2048' && x.arrival.scheduledTime.local.startsWith('2026-09-06'));
  assert.ok(as, 'AS2048 (tomorrow) present');
  assert.equal(arr.filter((x) => x.number === 'AS2048').length, 2, 'both days kept');
  assert.equal(as.arrival.scheduledTime.local, '2026-09-06 12:28:00-07:00');
  assert.equal(as.status, 'scheduled');
  assert.ok(as.arrival.revisedTime.local.startsWith('2026-09-06 12:27'));
  assert.equal(as.arrival.airline.iata, 'AS');
  assert.equal(as.departure.airport.iata, 'SEA');
  // Window filter key is the home-side scheduled epoch.
  assert.equal(as.arrival.scheduledTime.utc, '2026-09-06 19:28:00+00:00');
  assert.equal(as._authTs, Date.parse('2026-09-06T12:28:00-07:00'));
});

test('yyj: garbage in, empty out', () => {
  assert.deepEqual(yyjParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(yyjParseFeed('{"success":false,"data":{"message":"Security check failed.","nonce_expired":true}}', 'arr', NOW), []);
  assert.deepEqual(yyjParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(yyjParseFeed('<html></html>', 'dep', NOW), []);
});
