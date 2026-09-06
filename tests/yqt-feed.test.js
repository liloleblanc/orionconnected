// YQT Thunder Bay — flyqt.ca ifids board against verbatim captures taken
// 2026-09-05 22:11 ET (site said "Last updated: 10:06 PM"). Pins: the
// #today/#tomorrow tab split, 12-hour dateless clocks in Eastern time,
// Planned≠Expected → revisedTime, "Late"/"Delayed" → delayed, ICAO-ish
// prefixes (WJA/WSG/NSA/F8*) normalised to IATA, multi-stop routes, and
// the rolled-over departures #today tab being dated tomorrow + de-duped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYqtPage } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T22:11:00-04:00');   // capture time, EDT

test('yqt arrivals: today tab (2 left tonight) + tomorrow tab (16), Eastern offset', () => {
  const arr = parseYqtPage(fx('yqt-arr-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 18, `parsed ${arr.length}`);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'YQT'));
  assert.ok(arr.every((x) => x.arrival.scheduledTime.local.endsWith('-04:00')), 'EDT offset on every row');
  // Tonight's Porter from Pearson, on time — dated today.
  const pd = arr.find((x) => x.number === 'PD225' && x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(pd, 'PD225 tonight present');
  assert.equal(pd.arrival.scheduledTime.local, '2026-09-05 22:33:00-04:00');
  assert.equal(pd.arrival.scheduledTime.utc, '2026-09-06 02:33:00+00:00');
  assert.equal(pd.status, 'scheduled');
  assert.equal(pd.arrival.revisedTime, undefined);
  assert.equal(pd.departure.airport.iata, 'YYZ');
  assert.equal(pd.departure.airport.name, 'Toronto');
  assert.equal(pd.arrival.airline.iata, 'PD');
  assert.equal(pd.arrival.airline.name, 'Porter Airlines');
  // Air Canada 1195 tonight is "Late": planned 11:29 PM, expected 11:57 PM.
  const ac = arr.find((x) => x.number === 'AC1195' && x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(ac, 'AC1195 tonight present');
  assert.equal(ac.status, 'delayed');
  assert.equal(ac.arrival.scheduledTime.local, '2026-09-05 23:29:00-04:00');
  assert.equal(ac.arrival.revisedTime.local, '2026-09-05 23:57:00-04:00');
  // The same two flights recur on the tomorrow tab — dated 09-06, not de-duped.
  assert.ok(arr.find((x) => x.number === 'AC1195' && x.arrival.scheduledTime.local === '2026-09-06 23:29:00-04:00'));
});

test('yqt arrivals: ICAO prefixes normalised, multi-stop route uses the previous stop', () => {
  const arr = parseYqtPage(fx('yqt-arr-sample.html'), 'arr', NOW);
  const ws = arr.find((x) => x.number === 'WS3576');           // site prints WJA3576
  assert.ok(ws, 'WJA3576 → WS3576');
  assert.equal(ws.arrival.airline.iata, 'WS');
  assert.equal(ws.arrival.airline.name, 'WestJet');
  assert.equal(ws.departure.airport.iata, 'YWG');
  assert.equal(ws.arrival.scheduledTime.local, '2026-09-06 18:45:00-04:00');
  const wp = arr.find((x) => x.number === 'WP1606');           // Wasaya, site prints WSG1606
  assert.ok(wp, 'WSG1606 → WP1606');
  assert.equal(wp.departure.airport.iata, 'YXL');
  const f8 = arr.find((x) => x.number === 'F8689');            // site prints F8*689
  assert.ok(f8, 'F8*689 → F8689');
  assert.equal(f8.arrival.airline.iata, 'F8');
  assert.equal(f8.arrival.scheduledTime.local, '2026-09-06 08:55:00-04:00');
  // Bearskin JV377 "North Bay → Sudbury → Sault Ste Marie → Thunder Bay", Late 4:20→5:00 PM
  const jv = arr.find((x) => x.number === 'JV377');
  assert.ok(jv, 'JV377 present');
  assert.equal(jv.arrival.airline.iata, 'JV');
  assert.equal(jv.departure.airport.iata, 'YAM');
  assert.equal(jv.departure.airport.name, 'Sault Ste Marie');
  assert.equal(jv.status, 'delayed');
  assert.equal(jv.arrival.scheduledTime.local, '2026-09-06 16:20:00-04:00');
  assert.equal(jv.arrival.revisedTime.local, '2026-09-06 17:00:00-04:00');
  assert.ok(!arr.some((x) => /^(WJA|WSG|NSA|F8\*)/.test(x.number)), 'no raw ICAO/asterisk prefixes leak');
});

test('yqt departures: rolled-over #today tab is dated tomorrow and de-duplicated', () => {
  const dep = parseYqtPage(fx('yqt-dep-sample.html'), 'dep', NOW);
  // At 22:11 the site had already refilled #today with tomorrow's 17 rows
  // (byte-identical to #tomorrow); we must not date them today, nor double them.
  assert.equal(dep.length, 17, `parsed ${dep.length}`);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'YQT'));
  assert.ok(dep.every((x) => x.departure.scheduledTime.local.startsWith('2026-09-06')), 'all dated tomorrow');
  assert.ok(dep.every((x) => x._authTs > NOW), 'nothing in the past');
  // AC1188 planned 5:10 AM, expected 6:15 AM, "Delayed" — listed after the 6:00 Porter
  // (rows sort by expected), which must not trip the midnight walk.
  const ac = dep.find((x) => x.number === 'AC1188');
  assert.ok(ac, 'AC1188 present');
  assert.equal(ac.status, 'delayed');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-06 05:10:00-04:00');
  assert.equal(ac.departure.revisedTime.local, '2026-09-06 06:15:00-04:00');
  assert.equal(ac.arrival.airport.iata, 'YYZ');
  assert.equal(ac.departure.gate, undefined);                  // site has no gates
  // Porter to Billy Bishop.
  const pd = dep.find((x) => x.number === 'PD2630');
  assert.equal(pd.arrival.airport.iata, 'YTZ');
  assert.equal(pd.arrival.airport.name, 'Toronto City');
  assert.equal(pd.departure.scheduledTime.local, '2026-09-06 06:00:00-04:00');
  // North Star Air NSA140 → 0N140 to Kenora; Bearskin JV384 final stop Sault Ste Marie.
  const ns = dep.find((x) => x.number === '0N140');
  assert.ok(ns, 'NSA140 → 0N140');
  assert.equal(ns.arrival.airport.iata, 'YQK');
  assert.equal(ns.departure.airline.name, 'North Star Air');
  const jv = dep.find((x) => x.number === 'JV384');
  assert.equal(jv.arrival.airport.iata, 'YAM');
  // Direction guard: an arrivals page read as departures yields nothing.
  assert.deepEqual(parseYqtPage(fx('yqt-arr-sample.html'), 'dep', NOW), []);
});

test('yqt: an un-rolled #today tab stays dated today (same file, read at 04:00)', () => {
  // Pretend it is 04:00 on the 6th: the rows are all ahead of us, so even
  // though #today == #tomorrow, #today keeps its own date and #tomorrow is +1.
  const EARLY = Date.parse('2026-09-06T04:00:00-04:00');
  const dep = parseYqtPage(fx('yqt-dep-sample.html'), 'dep', EARLY);
  assert.equal(dep.length, 34);
  assert.equal(dep.filter((x) => x.departure.scheduledTime.local.startsWith('2026-09-06')).length, 17);
  assert.equal(dep.filter((x) => x.departure.scheduledTime.local.startsWith('2026-09-07')).length, 17);
});

test('yqt arrivals (second live rendering): "Arrived"/status-confirmed rows kept, early arrival revised', () => {
  // Captured 22:11 ET between the two "2-row" captures: #today still listed
  // the day's landed flights, out of strict time order, with a different
  // Planned value than the schedule (Planned tracks the last estimate).
  const arr = parseYqtPage(fx('yqt-arr-arrived-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 26, `parsed ${arr.length}`);
  const today = arr.filter((x) => x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.equal(today.length, 10);
  assert.equal(today.filter((x) => x.status === 'arrived').length, 8);
  // WSG1604 first row, 3:15 PM landed; the 1:10 PM Porter after it must not roll the date.
  assert.equal(today[0].number, 'WP1604');
  assert.equal(today[0].status, 'arrived');
  assert.equal(today[0].arrival.scheduledTime.local, '2026-09-05 15:15:00-04:00');
  assert.equal(today[1].number, 'PD2633');
  assert.equal(today[1].arrival.scheduledTime.local, '2026-09-05 13:10:00-04:00');
  assert.equal(today[1].arrival.revisedTime.local, '2026-09-05 15:20:00-04:00');
  // WestJet from Winnipeg landed early: planned 6:45 PM, expected 6:29 PM.
  const ws = today.find((x) => x.number === 'WS3576');
  assert.equal(ws.status, 'arrived');
  assert.equal(ws.arrival.revisedTime.local, '2026-09-05 18:29:00-04:00');
  assert.ok(ws.arrival.revisedTime.utc < ws.arrival.scheduledTime.utc, 'early, same day');
  // Tonight's two still pending, then tomorrow's 16.
  assert.equal(today.find((x) => x.number === 'AC1195').status, 'delayed');
  assert.equal(arr.filter((x) => x.arrival.scheduledTime.local.startsWith('2026-09-06')).length, 16);
});

test('yqt: garbage in, empty out', () => {
  assert.deepEqual(parseYqtPage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(parseYqtPage('', 'dep', NOW), []);
  assert.deepEqual(parseYqtPage(null, 'dep', NOW), []);
});
