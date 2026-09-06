// YXE Saskatoon — yxe.ca server-rendered board against verbatim page
// captures (2026-09-05 ~20:05 CST). Pins: the #today/#tomorrow/#yesterday
// pane split supplying the calendar day, 12-hour clocks ("4:25 PM" with
// no leading zero) on Saskatchewan's fixed -06:00, the icon-filename
// airline code (Rise Air = 4T), an estimate that differs from schedule
// becoming revisedTime, gate on both directions, and the milk-run city
// list collapsing to its first stop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yxeParsePage } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
// 20:10 CST on Sep 5 in Saskatoon — the capture moment.
const NOW = Date.parse('2026-09-05T20:10:00-06:00');

test('yxe dep: three panes dated from Saskatoon today, fixed CST offset', () => {
  const dep = yxeParsePage(fx('yxe-dep-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 21 + 31 + 24, `parsed ${dep.length}`);
  for (const f of dep) {
    assert.equal(f.departure.airport.iata, 'YXE');
    assert.ok(f.departure.scheduledTime.local.endsWith('-06:00'), f.departure.scheduledTime.local);
  }
  const today = dep.filter((f) => f.departure.scheduledTime.local.startsWith('2026-09-05'));
  const yday = dep.filter((f) => f.departure.scheduledTime.local.startsWith('2026-09-04'));
  const tmw = dep.filter((f) => f.departure.scheduledTime.local.startsWith('2026-09-06'));
  assert.equal(today.length, 21);
  assert.equal(yday.length, 31);
  assert.equal(tmw.length, 24);
});

test('yxe dep: AC1107 fields — 12h clock, estimate → revised, gate, status', () => {
  const dep = yxeParsePage(fx('yxe-dep-sample.html'), 'dep', NOW);
  const ac = dep.find((f) => f.number === 'AC1107' && f.departure.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(ac, 'AC1107 (today) present');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-05 05:05:00-06:00');
  assert.equal(ac.departure.scheduledTime.utc, '2026-09-05 11:05:00+00:00');
  assert.equal(ac.departure.revisedTime.local, '2026-09-05 05:08:00-06:00');   // Estimated 05:08 AM
  assert.equal(ac.departure.gate, '6');
  assert.equal(ac.status, 'departed');
  assert.equal(ac.arrival.airport.iata, 'YVR');
  assert.equal(ac.arrival.airport.name, 'Vancouver');
  assert.equal(ac.departure.airline.iata, 'AC');
  assert.equal(ac.departure.airline.name, 'Air Canada');
  assert.equal(ac._authTs, Date.parse('2026-09-05T05:05:00-06:00'));
  // Estimated equal to Scheduled is not a revision.
  const ws570 = dep.find((f) => f.number === 'WS570' && f.departure.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(ws570, 'WS570 present');
  assert.equal(ws570.departure.revisedTime, undefined);
});

test('yxe dep: Rise Air milk-run — 4T from icon, first stop is the leg, PM clock', () => {
  const dep = yxeParsePage(fx('yxe-dep-sample.html'), 'dep', NOW);
  const rise = dep.filter((f) => f.departure.airline.iata === '4T');
  assert.ok(rise.length >= 3, `rise rows ${rise.length}`);
  for (const f of rise) {
    assert.equal(f.departure.airline.name, 'Rise Air');
    assert.ok(/^4T\d+$/.test(f.number), f.number);
    assert.ok(!f.arrival.airport.name.includes(','), f.arrival.airport.name);
  }
  const pa = rise.find((f) => f.arrival.airport.iata === 'YPA');
  assert.ok(pa, 'a Prince Albert first stop');
  const fdl = rise.find((f) => f.arrival.airport.iata === 'ZFD');
  assert.ok(fdl, 'Fond-Du-Lac first stop resolved');
  assert.equal(fdl.departure.gate, '1B');
  // A pm departure with no leading-zero hour.
  const pm = dep.find((f) => f.departure.scheduledTime.local.includes(' 16:25'));
  assert.ok(pm, '4:25 PM parsed as 16:25');
});

test('yxe dep: status vocabulary', () => {
  const dep = yxeParsePage(fx('yxe-dep-sample.html'), 'dep', NOW);
  const st = new Set(dep.map((f) => f.status));
  assert.ok(st.has('departed') && st.has('scheduled') && st.has('boarding'), [...st].join(','));
  assert.equal(dep.filter((f) => f.status === 'boarding').length, 1 + 1 + 3);   // Final Call ×4, Pre-Boarding ×1
  assert.equal(yxeParsePage(fx('yxe-dep-sample.html'), 'dep', NOW).filter((f) => f.status === 'cancelled').length, 0);
});

test('yxe arr: Coming From column, gate on arrivals, arrived/on-time', () => {
  const arr = yxeParsePage(fx('yxe-arr-sample.html'), 'arr', NOW);
  // Today's pane has 21 rows: 19 bare <li >, plus <li class="early"> and
  // <li class="delayed"> (the row class mirrors the status cell).
  assert.equal(arr.length, 21 + 31 + 21, `parsed ${arr.length}`);
  for (const f of arr) {
    assert.equal(f.arrival.airport.iata, 'YXE');
    assert.equal(f.arrival.airport.name, 'Saskatoon');
    assert.ok(f.arrival.scheduledTime.local.endsWith('-06:00'));
  }
  const ws = arr.find((f) => f.number === 'WS3452' && f.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(ws, 'WS3452 present');
  assert.equal(ws.arrival.scheduledTime.local, '2026-09-05 09:35:00-06:00');
  assert.equal(ws.arrival.revisedTime.local, '2026-09-05 09:16:00-06:00');   // landed early
  assert.equal(ws.arrival.gate, '2');
  assert.equal(ws.status, 'arrived');
  assert.equal(ws.departure.airport.iata, 'YYC');
  assert.equal(ws.arrival.airline.iata, 'WS');
  assert.ok(arr.some((f) => f.status === 'scheduled'), 'On Time → scheduled');
  // Regina and Prince Albert arrivals resolve (YQR from the shared map, YPA from the YXE map).
  assert.ok(arr.some((f) => f.departure.airport.iata === 'YQR'));
  assert.ok(arr.some((f) => f.departure.airport.iata === 'YPA'));
  assert.ok(arr.some((f) => f.departure.airport.iata === 'MSP'));
  // Delayed and Early rows (attributed <li>s) — status + revised time.
  const ws873 = arr.find((f) => f.number === 'WS873');
  assert.ok(ws873, 'WS873 present');
  assert.equal(ws873.status, 'delayed');
  assert.equal(ws873.arrival.scheduledTime.local, '2026-09-05 23:40:00-06:00');
  assert.equal(ws873.arrival.revisedTime.local, '2026-09-05 23:46:00-06:00');
  assert.equal(ws873.departure.airport.iata, 'YHZ');   // Halifax, from the YXE map
  assert.equal(ws873.arrival.gate, '7');
  const ac1937 = arr.find((f) => f.number === 'AC1937');
  assert.ok(ac1937, 'AC1937 present');
  assert.equal(ac1937.status, 'scheduled');            // "Early" is not a delay
  assert.equal(ac1937.arrival.revisedTime.local, '2026-09-05 23:33:00-06:00');
});

test('yxe: today anchors to Saskatoon local date, not UTC', () => {
  // 23:30 CST Sep 5 is 05:30 UTC Sep 6 — "today" must still be Sep 5.
  const late = Date.parse('2026-09-05T23:30:00-06:00');
  const dep = yxeParsePage(fx('yxe-dep-sample.html'), 'dep', late);
  const ac = dep.find((f) => f.number === 'AC1107' && f.departure.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(ac, 'today pane still dated Sep 5');
});

test('yxe: garbage in, empty out', () => {
  assert.deepEqual(yxeParsePage('<html></html>', 'dep', NOW), []);
  assert.deepEqual(yxeParsePage('', 'arr', NOW), []);
  assert.deepEqual(yxeParsePage(null, 'arr', NOW), []);
});
