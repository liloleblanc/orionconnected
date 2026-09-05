// Canada wave 2 — YLW / YXX / YQR / YHM parsers against verbatim
// captures (2026-09-05). Pins: Kelowna's UTC-ISO + tail number, the
// direction field; Abbotsford's carrier-name→IATA and local scheddate;
// Regina's icon-class airline codes on a fixed (no-DST) offset; and
// Hamilton's #arrivals/#departures pane split with data-attr rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ylwParseFeed, yxxParseFeed, yqrParsePage, yhmParseBoard } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-04T22:00:00-07:00');

test('ylw: UTC ISO to Pacific, gate/belt/tail, direction field respected', () => {
  const arr = ylwParseFeed(fx('ylw-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const f = arr.find((x) => x.number === '4N579');
  assert.ok(f, '4N579 present');
  assert.ok(f.arrival.scheduledTime.local.startsWith('2026-09-04 19:00'), f.arrival.scheduledTime.local);
  assert.ok(f.arrival.scheduledTime.local.endsWith('-07:00'), 'PDT');
  assert.equal(f.arrival.gate, '4');
  assert.equal(f.arrival.baggageBelt, '3');           // "03" → "3"
  assert.equal(f.aircraft.reg, 'C-FANF');
  assert.equal(f.status, 'arrived');
  assert.equal(f.departure.airport.iata, 'YVR');
  // Departures direction must be filtered out of the arrivals read.
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'YLW'));
});

test('yxx: carrier name maps to IATA; local scheddate; revised time', () => {
  const arr = yxxParseFeed(fx('yxx-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const flair = arr.find((x) => /507$/.test(x.number));
  assert.ok(flair, 'Flair 507 present');
  assert.equal(flair.departure.airline.iata, 'F8');   // "Flair Air" → F8
  assert.equal(flair.status, 'cancelled');
  assert.ok(flair.arrival.scheduledTime.local.startsWith('2026-09-03 10:10'), flair.arrival.scheduledTime.local);
  assert.equal(flair.departure.airport.iata, 'YYC');  // Calgary
});

test('yqr: icon-class airline code, fixed Regina offset, revised', () => {
  const arr = yqrParsePage(fx('yqr-arr-sample.html'), 'arr', NOW);
  assert.ok(arr.length >= 2, `parsed ${arr.length}`);
  const ws = arr.find((x) => x.number === 'WS3368');
  assert.ok(ws, 'WS3368 present');
  assert.equal(ws.arrival.airline.iata, 'WS');        // icon-ws-blue
  assert.ok(ws.arrival.scheduledTime.local.startsWith('2026-09-04 20:30'), ws.arrival.scheduledTime.local);
  assert.ok(ws.arrival.scheduledTime.local.endsWith('-06:00'), 'Regina CST, no DST');
  assert.equal(ws.status, 'arrived');
  assert.ok(ws.arrival.revisedTime && ws.arrival.revisedTime.local.includes('21:43'));
  assert.equal(ws.departure.airport.iata, 'YYC');
});

test('yhm: pane split keeps arrivals and departures apart', () => {
  const arr = yhmParseBoard(fx('yhm-sample.html'), 'arr', NOW);
  const dep = yhmParseBoard(fx('yhm-sample.html'), 'dep', NOW);
  assert.ok(arr.length >= 1 && dep.length >= 1, `arr=${arr.length} dep=${dep.length}`);
  for (const x of arr) assert.equal(x.arrival.airport.iata, 'YHM');
  for (const x of dep) assert.equal(x.departure.airport.iata, 'YHM');
  const pd = dep.find((x) => x.number === 'PD486');
  if (pd) {
    assert.equal(pd.departure.airline.iata, 'PD');     // data-airline "Porter"
    assert.equal(pd.arrival.airport.iata, 'YYC');      // data-city Calgary
    assert.ok(pd.departure.scheduledTime.local.startsWith('2026-09-04 23:13'));
  }
});

test('canada-wave2: garbage in, empty out', () => {
  assert.deepEqual(ylwParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(yxxParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(yqrParsePage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(yhmParseBoard('<html></html>', 'dep', NOW), []);
});
