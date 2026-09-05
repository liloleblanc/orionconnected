// YHZ authority feed — parser tests against REAL rows captured from
// halifaxstanfield.ca on 2026-09-04 (the night the AeroDataBox
// subscription ended). The fixtures are verbatim server-rendered rows,
// so a Halifax markup change that breaks parsing also breaks CI the
// moment the fixtures are refreshed to match.
//
// The clock is pinned to 23:30 Halifax that evening: late enough that
// the fixture's 05:15 departure must land on TOMORROW, which is the
// date-inference case that actually matters on an overnight board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yhzParseBoard, yhzWindowTs } from '../workers/fids-proxy.js';

const dep = readFileSync(new URL('./fixtures/yhz-departures-sample.html', import.meta.url), 'utf8');
const arr = readFileSync(new URL('./fixtures/yhz-arrivals-sample.html', import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-04T23:30:00-03:00');

test('yhz: parses airline code, number, gate, destination', () => {
  const f = yhzParseBoard(dep, true, NOW);
  assert.equal(f.length, 6);
  const ws14 = f.find((x) => x.number === 'WS14');
  assert.ok(ws14, 'WS14 present');
  assert.equal(ws14.departure.airline.iata, 'WS');
  assert.equal(ws14.departure.gate, '12');
  assert.equal(ws14.status, 'scheduled');
  assert.equal(ws14.arrival.airport.name, 'Madrid Barajas Apt');
  assert.equal(ws14.arrival.airport.iata, 'MAD');
  assert.equal(ws14.departure.airport.iata, 'YHZ');
});

test('yhz: delayed row carries revisedTime; parenthesised code wins', () => {
  const f = yhzParseBoard(dep, true, NOW);
  const fl = f.find((x) => x.number === 'F8655');
  assert.ok(fl, 'F8655 present');
  assert.equal(fl.status, 'delayed');
  assert.ok(fl.departure.revisedTime, 'revised time present');
  assert.notEqual(fl.departure.revisedTime.local, fl.departure.scheduledTime.local);
  assert.equal(fl.arrival.airport.iata, 'YYZ');
});

test('yhz: on-time rows carry NO redundant revisedTime', () => {
  const f = yhzParseBoard(dep, true, NOW);
  const ws14 = f.find((x) => x.number === 'WS14');
  assert.equal(ws14.departure.revisedTime, undefined);
});

test('yhz: midnight wrap — 05:15 lands on tomorrow', () => {
  const f = yhzParseBoard(dep, true, NOW);
  const early = f.find((x) => x.number === 'AC2057');
  assert.ok(early, 'AC2057 present');
  assert.ok(early.departure.scheduledTime.local.startsWith('2026-09-05 05:15'),
    `expected tomorrow, got ${early.departure.scheduledTime.local}`);
  const tonight = f.find((x) => x.number === 'WS14');
  assert.ok(tonight.departure.scheduledTime.local.startsWith('2026-09-04 22:30'),
    `expected tonight, got ${tonight.departure.scheduledTime.local}`);
});

test('yhz: cancelled maps to the enum; apostrophe city resolves', () => {
  const f = yhzParseBoard(dep, true, NOW);
  const cx = f.find((x) => x.number === 'AC7672');
  assert.ok(cx, 'AC7672 present');
  assert.equal(cx.status, 'cancelled');
  assert.equal(cx.arrival.airport.iata, 'YYT');   // "St. John's" via the city map
});

test('yhz: window filter keeps a flight in exactly one 12h window', () => {
  const f = yhzParseBoard(dep, true, NOW);
  const w1 = [yhzWindowTs('2026-09-04T21:30'), yhzWindowTs('2026-09-05T09:30')];
  const w2 = [yhzWindowTs('2026-09-05T09:30'), yhzWindowTs('2026-09-05T21:30')];
  const inW = (w) => f.filter((x) => x._yhzTs >= w[0] && x._yhzTs < w[1]).map((x) => x.number);
  assert.ok(inW(w1).includes('AC2057'), 'tomorrow 05:15 in first window');
  assert.ok(!inW(w1).includes('AC2080'), '11:05 outside first window');
  assert.ok(inW(w2).includes('AC2080'), '11:05 inside second window');
  for (const n of f.map((x) => x.number)) {
    assert.ok(!(inW(w1).includes(n) && inW(w2).includes(n)), `${n} must not appear in both windows`);
  }
});

test('yhz: arrivals — landed early yields arrived + earlier revisedTime', () => {
  const f = yhzParseBoard(arr, false, NOW);
  const ws590 = f.find((x) => x.number === 'WS590');
  assert.ok(ws590, 'WS590 present');
  assert.equal(ws590.status, 'arrived');
  assert.equal(ws590.arrival.gate, '23');
  assert.equal(ws590.arrival.airport.iata, 'YHZ');       // home side is the arrival
  assert.equal(ws590.departure.airport.iata, 'YWG');     // Winnipeg origin
  assert.ok(ws590.arrival.revisedTime, 'actual 21:28 differs from expected 21:40');
  assert.ok(ws590.arrival.revisedTime.local < ws590.arrival.scheduledTime.local);
});

test('yhz: garbage in, empty array out — never a throw', () => {
  assert.deepEqual(yhzParseBoard('', true, NOW), []);
  assert.deepEqual(yhzParseBoard('<html><body>maintenance</body></html>', true, NOW), []);
  assert.ok(Number.isNaN(yhzWindowTs('not-a-window')));
});
