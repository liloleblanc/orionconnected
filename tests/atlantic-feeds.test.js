// Atlantic authority feeds — YYT / YSJ / YFC parsers against verbatim
// rows captured from each airport's site on 2026-09-04/05 (the night
// the AeroDataBox subscription ended). Notable per-airport traps these
// pin down: Newfoundland's half-hour offset (YYT), the code-prefixed
// "YHU-Montréal" city cell (YSJ), and Fredericton's late-night
// departures page that lists ONLY tomorrow — where the midnight walk
// alone would date the whole board into the past.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yytParseTable, ysjParsePage, yfcParseBoard } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-04T23:30:00-03:00');

test('yyt: codes, callsign, city IATA, revised, and the -02:30 offset', () => {
  const f = yytParseTable(fx('yyt-dep-sample.html'), 'dep', NOW);
  assert.ok(f.length >= 2, `parsed ${f.length} rows`);
  const pb = f.find((x) => x.number === 'PB907');
  assert.ok(pb, 'PB907 present');
  assert.equal(pb.callSign, 'PVL907');                       // FlightAware href
  assert.equal(pb.departure.airline.iata, 'PB');             // ALimg/PB.png
  assert.equal(pb.arrival.airport.iata, 'YAY');              // title attr
  assert.equal(pb.arrival.airport.name, 'St. Anthony');
  assert.equal(pb.status, 'departed');
  assert.ok(pb.departure.scheduledTime.local.startsWith('2026-09-04 11:00'));
  assert.ok(pb.departure.scheduledTime.local.endsWith('-02:30'), 'Newfoundland half-hour offset');
  assert.ok(pb.departure.revisedTime, 'revised 10:53 present');
});

test('yyt: arrivals fragment parses with home side on the arrival', () => {
  const f = yytParseTable(fx('yyt-arr-sample.html'), 'arr', NOW);
  assert.ok(f.length >= 2, `parsed ${f.length} rows`);
  for (const x of f) {
    assert.equal(x.arrival.airport.iata, 'YYT');
    assert.ok(x.number && Number.isFinite(x._authTs));
  }
});

test('ysj: direction comes from the table class; dates are explicit', () => {
  const arr = ysjParsePage(fx('ysj-page-sample.html'), 'arr', NOW);
  const dep = ysjParsePage(fx('ysj-page-sample.html'), 'dep', NOW);
  assert.ok(arr.length >= 3 && dep.length >= 1, `arr=${arr.length} dep=${dep.length}`);
  const ac642 = arr.find((x) => x.number === 'AC642');
  assert.ok(ac642, 'AC642 present');
  assert.equal(ac642.status, 'arrived');
  assert.equal(ac642.departure.airport.iata, 'YYZ');         // "Toronto" via city map
  assert.ok(ac642.arrival.scheduledTime.local.startsWith('2026-09-04 01:25'));
  assert.ok(ac642.arrival.revisedTime, 'actual 01:46 differs from 01:25');
  for (const x of dep) assert.equal(x.departure.airport.iata, 'YSJ');
});

test('ysj: "YHU-Montréal" style city cells keep the code AND the name', () => {
  const arr = ysjParsePage(fx('ysj-page-sample.html'), 'arr', NOW);
  const coded = arr.find((x) => x.number === 'P6953');   // "YHU-Montréal" in tonight's capture
  if (coded) {
    assert.equal(coded.departure.airport.iata, 'YHU');
    assert.match(coded.departure.airport.name, /Montr/);
  }
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'YSJ'));
});

test('yfc: a tomorrow-only departures board shifts forward a day', () => {
  const f = yfcParseBoard(fx('yfc-dep-sample.html'), 'dep', NOW);
  assert.ok(f.length >= 5, `parsed ${f.length} rows`);
  const pd = f.find((x) => x.number === 'PD2304');
  assert.ok(pd, 'Porter 2304 mapped to PD prefix');
  assert.ok(pd.departure.scheduledTime.local.startsWith('2026-09-05 06:25'),
    `expected tomorrow, got ${pd.departure.scheduledTime.local}`);
  assert.equal(pd.arrival.airport.iata, 'YTZ');              // Toronto/City Centre
  const ac = f.find((x) => x.number === 'AC7711');
  assert.equal(ac.arrival.airport.iata, 'YUL');
});

test('yfc: "West Jet" (two words, their spelling) still maps to WS', () => {
  const f = yfcParseBoard(fx('yfc-dep-sample.html'), 'dep', NOW);
  const ws = f.find((x) => x.number === 'WS795');
  assert.ok(ws, 'WS795 present with its identity intact');
  assert.equal(ws.departure.airline.iata, 'WS');
  assert.equal(ws.arrival.airport.iata, 'YYC');
});

test('yfc: arrivals with a past row stay anchored to today', () => {
  const f = yfcParseBoard(fx('yfc-arr-sample.html'), 'arr', NOW);
  assert.ok(f.length >= 5, `parsed ${f.length} rows`);
  const first = f[0];
  assert.ok(first.arrival.scheduledTime.local.startsWith('2026-09-04 21:25'),
    `expected today 21:25, got ${first.arrival.scheduledTime.local}`);
  assert.equal(first.status, 'arrived');
  assert.ok(first.arrival.revisedTime, '21:25 → 23:18 revision');
});

test('atlantic: garbage in, empty out', () => {
  assert.deepEqual(yytParseTable('', 'dep', NOW), []);
  assert.deepEqual(ysjParsePage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(yfcParseBoard('nope', 'dep', NOW), []);
});
