// YDF Deer Lake — deerlakeairport.com/arrivals-departures/ parser against
// a verbatim capture (2026-09-05 23:39 NDT). Pins: the two-table page
// split, arrivals' year-less "MM/DD HH:MM" vs departures' "YYYY/MM/DD",
// carrier display name → IATA ("Provincial Airlines" → PB), the site's
// apostrophe-less "St. Johns" → YYT, and Newfoundland's half-hour offset
// (-02:30 NDT in September, -03:30 NST in December).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYdfPage, parseYdfTime } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T23:30:00-02:30');

test('ydf: arrivals table — counts, PB901 from St. Johns on NDT (-02:30)', () => {
  const arr = parseYdfPage(fx('ydf-page-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 38, `parsed ${arr.length}`);
  for (const x of arr) assert.equal(x.arrival.airport.iata, 'YDF');
  const pb = arr.find((x) => x.number === 'PB901');
  assert.ok(pb, 'PB901 present');
  assert.equal(pb.arrival.scheduledTime.local, '2026-09-06 11:05:00-02:30');
  assert.equal(pb.arrival.scheduledTime.utc, '2026-09-06 13:35:00+00:00');
  assert.equal(pb.departure.airport.iata, 'YYT');          // "St. Johns"
  assert.equal(pb.departure.airport.name, 'St. Johns');
  assert.equal(pb.arrival.airline.iata, 'PB');             // "Provincial Airlines"
  assert.equal(pb.status, 'scheduled');                    // "On Time"
  assert.equal(pb.arrival.revisedTime, undefined);         // Expected == Scheduled
  assert.equal(pb._authTs, Date.parse('2026-09-06T11:05:00-02:30'));
  // Other carriers on the board resolve too.
  const ws = arr.find((x) => x.number === 'WS822');
  assert.ok(ws && ws.departure.airport.iata === 'YYC', 'Westjet 822 from Calgary');
  const pd = arr.find((x) => x.number === 'PD2195');
  assert.ok(pd && pd.departure.airport.iata === 'YHZ', 'Porter 2195 from Halifax');
  const ac = arr.find((x) => x.number === 'AC1908');
  assert.ok(ac && ac.arrival.scheduledTime.local.startsWith('2026-09-07 00:57'), 'AC1908 past midnight keeps its own date');
  // The mobile <ul> duplicate must not double-count.
  assert.equal(arr.filter((x) => x.number === 'PB901').length, 3);   // 09/06, 09/07, 09/08
});

test('ydf: departures table — dated rows, AC1909 to Toronto', () => {
  const dep = parseYdfPage(fx('ydf-page-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 38, `parsed ${dep.length}`);
  for (const x of dep) assert.equal(x.departure.airport.iata, 'YDF');
  const ac = dep.find((x) => x.number === 'AC1909');
  assert.ok(ac, 'AC1909 present');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-06 14:25:00-02:30');
  assert.equal(ac.arrival.airport.iata, 'YYZ');
  assert.equal(ac.departure.airline.iata, 'AC');
  assert.equal(ac.departure.airline.name, 'Air Canada');
  assert.equal(ac.status, 'scheduled');
  const first = dep[0];
  assert.equal(first.number, 'PB901');
  assert.equal(first.arrival.airport.iata, 'YYR');           // Goose Bay
  assert.ok(dep.every((x) => x.departure.scheduledTime.local.endsWith('-02:30')), 'all NDT');
});

test('ydf: revised time, delayed/cancelled statuses, winter offset', () => {
  const row = (sched, exp, st, cls = 'fdArrivalsTable') => `<table class="${cls}"><tbody><tr>
    <td class="fdCarrier"><img src="https://deerlakeairport.com/x/icon-pal.png"/> PAL Airlines</td>
    <td class="fdFlightNumber">923</td><td class="fdViaAirportCity">St. Johns</td>
    <td class="fdScheduled">${sched}</td><td class="fdExpected">${exp}</td><td class="fdStatus">${st}</td>
    </tr></tbody></table>`;
  const d = parseYdfPage(row('09/06 09:20', '09/06 10:05', 'Delayed'), 'arr', NOW);
  assert.equal(d.length, 1);
  assert.equal(d[0].status, 'delayed');
  assert.equal(d[0].arrival.revisedTime.local, '2026-09-06 10:05:00-02:30');
  const c = parseYdfPage(row('2026/09/06 09:20', '2026/09/06 09:20', 'Cancelled', 'fdDeparturesTable'), 'dep', NOW);
  assert.equal(c[0].status, 'cancelled');
  assert.equal(c[0].departure.revisedTime, undefined);
  // December in Newfoundland is NST, -03:30 — the tz helper, not a constant.
  const w = parseYdfTime('12/15 08:05', NOW);
  assert.equal(w.local, '2026-12-15 08:05:00-03:30');
  // Icon fallback when the display name is one the map doesn't know.
  const i = parseYdfPage(row('09/06 09:20', '09/06 09:20', 'On Time').replace('PAL Airlines', 'Some New Name'), 'arr', NOW);
  assert.equal(i[0].number, 'PB923');
});

test('ydf: garbage in, empty out', () => {
  assert.deepEqual(parseYdfPage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(parseYdfPage('', 'dep', NOW), []);
  assert.equal(parseYdfTime('Scheduled', NOW), null);
});
