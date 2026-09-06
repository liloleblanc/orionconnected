// MSP Minneapolis–Saint Paul — mspairport.com's paginated Drupal view
// against verbatim captures (2026-09-05 21:10 CDT). Pins: "Sep 05 —
// 8:10 p.m." month-day rows on Central time, the carrier name glued to
// the flight number ("SouthwestWN 1577"), "T2H12" splitting into
// terminal + gate (bare "T1" = terminal only), the status vocabulary,
// and the 100-row page count that drives pagination.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mspParsePage, mspPageRowCount } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T21:10:00-05:00');

test('msp arrivals: 100 rows, Central offset, glued airline cell, terminal+gate split', () => {
  const arr = mspParsePage(fx('msp-arr-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 100);
  assert.equal(mspPageRowCount(fx('msp-arr-sample.html')), 100);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'MSP'));
  const wn = arr.find((x) => x.number === 'WN1577');
  assert.ok(wn, 'WN1577 present');
  assert.equal(wn.arrival.scheduledTime.local, '2026-09-05 20:10:00-05:00');   // CDT
  assert.equal(wn.arrival.scheduledTime.utc, '2026-09-06 01:10:00+00:00');
  assert.equal(wn.departure.airport.iata, 'DEN');
  assert.equal(wn.departure.airport.name, 'Denver');
  assert.equal(wn.arrival.airline.iata, 'WN');
  assert.equal(wn.arrival.airline.name, 'Southwest');
  assert.equal(wn.arrival.terminal, '2');
  assert.equal(wn.arrival.gate, 'H12');
  assert.equal(wn.status, 'arrived');                // "Arrived at Gate"
  // Multi-word carriers split cleanly from the code.
  const ac = arr.find((x) => x.arrival.airline.iata === 'AC');
  if (ac) assert.equal(ac.arrival.airline.name, 'Air Canada');
  // The page runs past midnight into tomorrow — a Sep 06 row keeps its own day.
  const last = arr[arr.length - 1];
  assert.equal(last.number, 'DL2834');
  assert.ok(last.arrival.scheduledTime.local.startsWith('2026-09-06 08:58'), last.arrival.scheduledTime.local);
  assert.equal(last.status, 'scheduled');            // "On Time"
  // A bare "T1"/"T2" cell means terminal known, no gate yet.
  const bare = arr.find((x) => x.arrival.terminal && !x.arrival.gate);
  assert.ok(bare, 'a terminal-only row exists');
  const st = new Set(arr.map((x) => x.status));
  assert.ok(st.has('delayed') && st.has('arrived') && st.has('scheduled'), [...st].join(','));
});

test('msp departures: statuses map, gate change stays scheduled, terminal 1 gates', () => {
  const dep = mspParsePage(fx('msp-dep-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 100);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'MSP'));
  const dl = dep.find((x) => x.number === 'DL1711');
  assert.ok(dl, 'DL1711 present');
  assert.equal(dl.status, 'departed');
  assert.equal(dl.departure.terminal, '1');
  assert.equal(dl.departure.gate, 'F4');
  assert.ok(dl.departure.scheduledTime.local.endsWith('-05:00'), 'CDT');
  const gc = dep.find((x) => x.number === 'DL2703');
  assert.ok(gc, 'DL2703 present');
  assert.equal(gc.status, 'scheduled');              // "Gate change"
  assert.equal(gc.arrival.airport.iata, 'PHL');
  assert.ok(gc.departure.scheduledTime.local.startsWith('2026-09-05 20:25'), gc.departure.scheduledTime.local);
  const st = new Set(dep.map((x) => x.status));
  assert.ok(st.has('boarding') || st.has('departed'), [...st].join(','));
  for (const x of dep) assert.ok(x._authTs >= NOW - 3 * 3600e3 && x._authTs < NOW + 30 * 3600e3, `${x.number} ${x.departure.scheduledTime.local}`);
});

test('msp: a short last page signals the end of the walk', () => {
  const html = fx('msp-dep-lastpage-sample.html');
  assert.equal(mspPageRowCount(html), 9);
  const dep = mspParsePage(html, 'dep', NOW);
  assert.equal(dep.length, 9);
  assert.ok(dep[0].departure.scheduledTime.local.startsWith('2026-09-06 21:55'), dep[0].departure.scheduledTime.local);
});

test('msp: garbage in, empty out', () => {
  assert.deepEqual(mspParsePage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(mspParsePage('', 'dep', NOW), []);
  assert.equal(mspPageRowCount('<html></html>'), 0);
});
