// YZF Yellowknife — flyyzf.ca Drupal Views page + the GNWT mirror
// (www.dot.gov.nt.ca/Airports) against verbatim captures. Pins: the
// #arrivals-tab / #departures-tab split with columns mapped by header
// text, "Month D, YYYY HH:MM" schedules on Yellowknife time (-06:00 MDT
// in September, -07:00 MST in December — the tz helper, never a
// constant), a bare "HH:MM" Expected rolled across midnight (23:57 →
// 00:34 next day, a 37-minute delay), "Late" → delayed, display-name
// carriers (Canadian North → 5T, Air North → 4N), hyphen-less
// registrations restored (CGIZG → C-GIZG), IATA aircraft codes, the
// snapshot-stamp "Actual Time" column ignored, the mirror's three-day
// horizon + "Arrived" rows, and the merge that lets flyyzf.ca win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYzfPage, parseYzfDotPage, yzfMergeRows } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
// Capture moments: the page said "accurate as of 12:08 AM" (Sep 6, MDT);
// the older render said "accurate as of 11:55 PM" (Sep 3, MDT).
const NOW = Date.parse('2026-09-06T00:08:00-06:00');
const NOW_LATE = Date.parse('2026-09-03T23:55:00-06:00');

// A one-row flyyzf.ca page with the real 22-column header, for cases the
// captures don't carry (winter offset, an unknown city).
const YZF_HEADS = ['Host Airport Code', 'Host Airport City', 'Airline', 'Flight Date', 'Flight', 'Arrival Or Departure',
  'Via Airport Code', 'Origin', 'Leg Number', 'Baggage Carousel', 'Gate', 'Terminal', 'Scheduled', 'Expected', 'Route',
  'Current Display ID', 'Actual Time', 'Status', 'Aircraft Type', 'Comments', 'Tail', 'Registration Number'];
function page(dir, cells) {
  const id = dir === 'dep' ? 'departures-tab' : 'arrivals-tab';
  return `<div id="${id}" class="tab-content"><table class="full-listing"><thead><tr>${YZF_HEADS.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody><tr>${cells.map((c) => `<td itemprop="">${c}</td>`).join('')}</tr></tbody></table></div>`;
}
const row = (o) => ['YZF', 'Yellowknife', o.airline || 'Canadian North', o.date || '20260906', o.num || '244', o.ad || 'A',
  o.via === undefined ? 'YEG' : o.via, o.city || 'Edmonton', '1', o.belt || '', o.gate || '', o.term || '',
  o.sched || 'September 6, 2026 09:45', o.exp || '09:45', '', '39383517', '09/06/2026 00:08', o.status || 'On Time',
  o.type || '733', o.city || 'Edmonton', '', o.reg || ''];

test('yzf arrivals: 16 rows on MDT, WS685 fields, the overnight cancelled row rolls its Expected', () => {
  const arr = parseYzfPage(fx('yzf-page-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 16, `parsed ${arr.length}`);
  for (const x of arr) {
    assert.equal(x.arrival.airport.iata, 'YZF');
    assert.equal(x.arrival.airport.icao, 'CYZF');
    assert.ok(x.arrival.scheduledTime.local.endsWith('-06:00'), x.arrival.scheduledTime.local);
    assert.ok(/^[A-Z]{3}$/.test(x.departure.airport.iata), `Via Airport Code on every row: ${x.number}`);
    assert.equal(x.codeshareStatus, 'IsOperator');
  }
  const ws = arr.find((x) => x.number === 'WS685');
  assert.ok(ws, 'WS685 present');
  assert.equal(ws.arrival.scheduledTime.local, '2026-09-06 13:25:00-06:00');
  assert.equal(ws.arrival.scheduledTime.utc, '2026-09-06 19:25:00+00:00');
  assert.equal(ws._authTs, Date.parse('2026-09-06T13:25:00-06:00'));
  assert.equal(ws.departure.airport.iata, 'YYC');
  assert.equal(ws.departure.airport.name, 'Calgary');
  assert.equal(ws.arrival.airline.iata, 'WS');
  assert.equal(ws.arrival.airline.name, 'WestJet');
  assert.equal(ws.arrival.gate, '6');
  assert.equal(ws.aircraft.model, '7M8');
  assert.equal(ws.aircraft.reg, 'C-GIZG');                  // printed "CGIZG"
  assert.equal(ws.status, 'scheduled');                     // "On Time"
  assert.equal(ws.arrival.revisedTime, undefined);          // Expected == Scheduled
  assert.equal(ws.arrival.baggageBelt, undefined);          // column always blank
  assert.equal(ws.arrival.terminal, undefined);
  // Yesterday's cancelled Taloyoak flight is still listed: Flight Date
  // 20260905, Scheduled Sep 5 18:40, Expected "02:30" — the next morning.
  const cn = arr.find((x) => x.number === '5T675');
  assert.ok(cn, '5T675 present');
  assert.equal(cn.status, 'cancelled');
  assert.equal(cn.arrival.scheduledTime.local, '2026-09-05 18:40:00-06:00');
  assert.equal(cn.arrival.revisedTime.local, '2026-09-06 02:30:00-06:00');
  assert.equal(cn.departure.airport.iata, 'YYH');
  assert.equal(cn.departure.airport.name, 'Taloyoak');
  assert.equal(cn.arrival.airline.iata, '5T');
  assert.equal(cn.arrival.airline.name, 'Canadian North');
  assert.equal(cn.aircraft.model, 'AT4');
  assert.equal(cn.aircraft.reg, undefined);
  assert.equal(cn.arrival.gate, undefined);
  // Air North from Toronto; "Ulukhaktok" (Origin), not "Ulukhaktok/Holman" (Comments).
  const an = arr.find((x) => x.number === '4N824');
  assert.ok(an && an.departure.airport.iata === 'YYZ' && an.arrival.airline.iata === '4N', 'Air North 824 from YYZ');
  const ul = arr.find((x) => x.number === '5T620');
  assert.ok(ul, '5T620 present');
  assert.equal(ul.departure.airport.iata, 'YHI');
  assert.equal(ul.departure.airport.name, 'Ulukhaktok');
  // Last of the day: AC8026 at 23:57 keeps its own date.
  assert.equal(arr[arr.length - 1].number, 'AC8026');
  assert.equal(arr[arr.length - 1].arrival.scheduledTime.local, '2026-09-06 23:57:00-06:00');
});

test('yzf departures: 15 rows, gates on the Canadian North/WestJet rows, Via codes for the whole network', () => {
  const dep = parseYzfPage(fx('yzf-page-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 15, `parsed ${dep.length}`);
  for (const x of dep) {
    assert.equal(x.departure.airport.iata, 'YZF');
    assert.equal(x.departure.airport.name, 'Yellowknife');
    assert.ok(x.departure.scheduledTime.local.endsWith('-06:00'), x.departure.scheduledTime.local);
    assert.ok(/^[A-Z]{3}$/.test(x.arrival.airport.iata), `Via Airport Code on every row: ${x.number}`);
    assert.ok(/^(AC|WS|5T|4N)\d{3,4}$/.test(x.number), `carrier prefix resolved: ${x.number}`);
  }
  assert.equal(dep[0].number, 'AC8023');
  assert.equal(dep[0].departure.scheduledTime.local, '2026-09-06 05:40:00-06:00');
  assert.equal(dep[0].departure.scheduledTime.utc, '2026-09-06 11:40:00+00:00');
  assert.equal(dep[0].arrival.airport.iata, 'YVR');
  assert.equal(dep[0].departure.gate, undefined);           // Air Canada rows carry no gate
  const ws = dep.find((x) => x.number === 'WS3290');
  assert.ok(ws, 'WS3290 present');
  assert.equal(ws.departure.gate, '2A');
  assert.equal(ws.aircraft.model, 'DH4');
  assert.equal(ws.aircraft.reg, 'C-GWEF');
  assert.equal(ws.arrival.airport.iata, 'YYC');
  const inuvik = dep.find((x) => x.number === '5T244');
  assert.ok(inuvik, '5T244 present');
  assert.equal(inuvik.arrival.airport.iata, 'YEV');
  assert.equal(inuvik.arrival.airport.name, 'Inuvik');       // Origin column, not "Inuvik Mike Zubko"
  assert.equal(inuvik.departure.gate, '4');
  assert.equal(inuvik.aircraft.model, '733');
  const an = dep.find((x) => x.number === '4N824');
  assert.ok(an && an.arrival.airport.iata === 'YXY' && an.arrival.airport.name === 'Whitehorse', 'Air North to Whitehorse');
  const last = dep[dep.length - 1];
  assert.equal(last.number, '5T245');
  assert.equal(last.departure.gate, '2');
  assert.equal(last.departure.scheduledTime.local, '2026-09-06 18:30:00-06:00');
});

test('yzf late render: "Late" → delayed with Expected 00:34 settled to the next day; hyphenated reg kept', () => {
  const arr = parseYzfPage(fx('yzf-page-late-sample.html'), 'arr', NOW_LATE);
  assert.equal(arr.length, 17, `parsed ${arr.length}`);
  const ac = arr.find((x) => x.number === 'AC8026');
  assert.ok(ac, 'AC8026 present');
  assert.equal(ac.status, 'delayed');
  assert.equal(ac.arrival.scheduledTime.local, '2026-09-03 23:57:00-06:00');
  assert.equal(ac.arrival.revisedTime.local, '2026-09-04 00:34:00-06:00');
  assert.ok(ac.arrival.revisedTime.utc > ac.arrival.scheduledTime.utc, 'a delay, not a 23h jump back');
  assert.equal(ac.aircraft.reg, 'C-FLJZ');
  assert.equal(ac.aircraft.model, 'CR9');
  assert.equal(ac.arrival.airline.iata, 'AC');
  assert.equal(ac.arrival.airline.name, 'Air Canada');
  assert.ok(arr.every((x) => x.number !== 'AC8026' ? x.status === 'scheduled' : true), 'everything else On Time');
  const dep = parseYzfPage(fx('yzf-page-late-sample.html'), 'dep', NOW_LATE);
  assert.equal(dep.length, 17, `parsed ${dep.length}`);
  const rt = dep.find((x) => x.number === '5T118');
  assert.ok(rt, '5T118 present');
  assert.equal(rt.arrival.airport.iata, 'YRT');
  assert.equal(rt.arrival.airport.name, 'Rankin Inlet');
  assert.equal(rt.aircraft.model, '732');
  assert.equal(rt.departure.gate, '4');
});

test('yzf mirror (dot.gov.nt.ca): three-day horizon, Arrived rows, airport names cleaned to cities', () => {
  const arr = parseYzfDotPage(fx('yzf-dot-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 49, `parsed ${arr.length}`);
  for (const x of arr) {
    assert.equal(x.arrival.airport.iata, 'YZF');
    assert.ok(x.arrival.scheduledTime.local.endsWith('-06:00'), x.arrival.scheduledTime.local);
    assert.ok(x.departure.airport.iata, `city mapped: ${x.departure.airport.name}`);
    assert.equal(x.arrival.revisedTime, undefined);          // Time is the expected time; no separate schedule
  }
  const landed = arr.find((x) => x.number === 'WS3291' && x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(landed, 'last night\'s WS3291 still listed');
  assert.equal(landed.status, 'arrived');
  assert.equal(landed.arrival.scheduledTime.local, '2026-09-05 21:17:00-06:00');
  assert.equal(landed.departure.airport.iata, 'YYC');
  const cn = arr.find((x) => x.number === '5T675' && x.arrival.scheduledTime.local.startsWith('2026-09-06'));
  assert.ok(cn && cn.status === 'cancelled', '5T675 cancelled at its 02:30 expected');
  const iv = arr.find((x) => x.number === '5T245' && x.arrival.scheduledTime.local.startsWith('2026-09-07'));
  assert.ok(iv, 'tomorrow\'s 5T245 present');
  assert.equal(iv.departure.airport.name, 'Inuvik');         // "Inuvik Mike Zubko"
  assert.equal(iv.departure.airport.iata, 'YEV');
  const ul = arr.find((x) => x.number === '5T620');
  assert.equal(ul.departure.airport.name, 'Ulukhaktok');     // "Ulukhaktok/Holman"
  assert.equal(ul.departure.airport.iata, 'YHI');
  assert.equal(arr.filter((x) => x.arrival.scheduledTime.local.startsWith('2026-09-07')).length, 15);
  assert.equal(arr[arr.length - 1].number, 'AC254');
  assert.equal(arr[arr.length - 1].arrival.scheduledTime.local, '2026-09-09 00:07:00-06:00');
  const dep = parseYzfDotPage(fx('yzf-dot-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 45, `parsed ${dep.length}`);
  for (const x of dep) assert.equal(x.departure.airport.iata, 'YZF');
  assert.equal(dep[0].number, 'AC8023');
  assert.equal(dep[0].departure.scheduledTime.local, '2026-09-06 05:40:00-06:00');
  assert.equal(dep[0].arrival.airport.iata, 'YVR');
  assert.equal(dep[dep.length - 1].number, '4N880');
  assert.equal(dep[dep.length - 1].arrival.airport.iata, 'YVR');
});

test('yzf merge: flyyzf.ca wins for today, the mirror adds landed + tomorrow, same-number a day apart both kept', () => {
  const p = parseYzfPage(fx('yzf-page-sample.html'), 'arr', NOW);
  const s = parseYzfDotPage(fx('yzf-dot-sample.html'), 'arr', NOW);
  const m = yzfMergeRows(p, s);
  assert.equal(m.length, 49, `merged ${m.length}`);          // 16 flyyzf + 3 landed + 30 future
  const day = (x) => x.arrival.scheduledTime.local.slice(0, 10);
  const ws685 = m.filter((x) => x.number === 'WS685');
  assert.deepEqual(ws685.map(day), ['2026-09-06', '2026-09-07', '2026-09-08'], 'today once, then the mirror\'s two future days');
  assert.equal(ws685[0].arrival.gate, '6');                  // the rich flyyzf.ca row survived for today
  assert.equal(ws685[0].aircraft.model, '7M8');
  assert.equal(ws685[1].arrival.gate, undefined);            // the mirror knows no gates
  // The cancelled row matched through its revised time (the mirror lists it
  // at 02:30 Sep 6); the mirror's Sep 8 5T675 is a different flight.
  const cn675 = m.filter((x) => x.number === '5T675');
  assert.deepEqual(cn675.map((x) => `${day(x)} ${x.status}`), ['2026-09-05 cancelled', '2026-09-08 scheduled']);
  assert.equal(cn675[0].arrival.scheduledTime.local, '2026-09-05 18:40:00-06:00');
  // Last night's AC8026 landed at 00:01 (mirror, 23h56m from tonight's —
  // not a duplicate), tonight's is flyyzf.ca's, tomorrow's is the mirror's.
  const ac = m.filter((x) => x.number === 'AC8026').map((x) => `${x.arrival.scheduledTime.local} ${x.status}`).sort();
  assert.deepEqual(ac, ['2026-09-06 00:01:00-06:00 arrived', '2026-09-06 23:57:00-06:00 scheduled', '2026-09-07 23:57:00-06:00 scheduled']);
  assert.ok(m.some((x) => x.number === 'WS3291' && x.status === 'arrived'), 'landed WS3291 from the mirror');
  assert.equal(m.filter((x) => x.arrival.scheduledTime.local.startsWith('2026-09-07')).length, 15, 'tomorrow from the mirror');
  const d = yzfMergeRows(parseYzfPage(fx('yzf-page-sample.html'), 'dep', NOW), parseYzfDotPage(fx('yzf-dot-sample.html'), 'dep', NOW));
  assert.equal(d.length, 45, `merged dep ${d.length}`);      // 15 flyyzf + 30 future
  assert.equal(d.filter((x) => x.departure.scheduledTime.local.startsWith('2026-09-06')).length, 15);
  assert.ok(d.every((x) => !x.departure.scheduledTime.local.startsWith('2026-09-06') || x.departure.gate !== undefined || /^AC|^4N/.test(x.number)),
    'today\'s departures are the flyyzf.ca rows (gates on CN/WS)');
  // The mirror alone still makes a board (flyyzf.ca down).
  assert.equal(yzfMergeRows([], s).length, 49);
  assert.equal(yzfMergeRows(p, []).length, 16);
});

test('yzf synthetic: winter offset, unknown city borrows the code flyyzf.ca printed, statuses', () => {
  const w = parseYzfPage(page('arr', row({ sched: 'December 15, 2026 08:05', exp: '08:05', date: '20261215' })), 'arr', NOW);
  assert.equal(w.length, 1);
  assert.equal(w[0].arrival.scheduledTime.local, '2026-12-15 08:05:00-07:00');   // MST
  assert.equal(w[0].arrival.scheduledTime.utc, '2026-12-15 15:05:00+00:00');
  // A stop the map doesn't know: flyyzf.ca prints its code, the mirror only its name.
  const p = parseYzfPage(page('arr', row({ num: '999', via: 'XYZ', city: 'Newtown', sched: 'September 6, 2026 09:45' })), 'arr', NOW);
  assert.equal(p[0].departure.airport.iata, 'XYZ');
  const dot = `<h2>Arrivals</h2><table><thead><tr><th>Airline</th><th>Flight</th><th>Originating From</th><th>Time</th><th>Status</th></tr></thead><tbody>
    <tr><td>Canadian North</td><td>999</td><td>Newtown\n   </td><td>2026-09-07 09:45</td><td>On Time</td></tr>
    <tr><td>Canadian North</td><td>998</td><td>Nowhere</td><td>2026-09-07 10:45</td><td>Late</td></tr>
    </tbody></table><h2>Departures</h2><table><tbody></tbody></table>`;
  const s = parseYzfDotPage(dot, 'arr', NOW);
  assert.equal(s.length, 2);
  assert.equal(s[0].departure.airport.iata, null);
  assert.equal(s[1].status, 'delayed');
  const m = yzfMergeRows(p, s);
  assert.equal(m.length, 3);
  assert.equal(m[1].departure.airport.iata, 'XYZ');          // learned from today's flyyzf.ca row
  assert.equal(m[2].departure.airport.iata, null);
  assert.deepEqual(parseYzfDotPage(dot, 'dep', NOW), []);
  // Direction is double-checked against the row's own A/D letter.
  assert.deepEqual(parseYzfPage(page('arr', row({ ad: 'D' })), 'arr', NOW), []);
  // Statuses the terminal FIDS could emit beyond the three seen live.
  for (const [txt, want] of [['Cancelled', 'cancelled'], ['Late', 'delayed'], ['Delayed', 'delayed'], ['Arrived', 'arrived'],
    ['Landed', 'arrived'], ['Departed', 'departed'], ['Boarding', 'boarding'], ['Final Call', 'boarding'],
    ['Gate Closed', 'gateclosed'], ['Diverted', 'diverted'], ['On Time', 'scheduled'], ['Early', 'scheduled'], ['', 'scheduled']]) {
    assert.equal(parseYzfPage(page('arr', row({ status: txt })), 'arr', NOW)[0].status, want, txt);
  }
});

test('yzf: garbage in, empty out', () => {
  assert.deepEqual(parseYzfPage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(parseYzfPage('', 'dep', NOW), []);
  assert.deepEqual(parseYzfPage(fx('yzf-dot-sample.html'), 'arr', NOW), []);      // wrong site, no tabs
  assert.deepEqual(parseYzfDotPage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(parseYzfDotPage(fx('yzf-page-sample.html'), 'dep', NOW), []);  // wrong site, no <h2>s
  assert.deepEqual(yzfMergeRows([], []), []);
  // A row with no parsable Scheduled is dropped, not mis-dated.
  assert.deepEqual(parseYzfPage(page('arr', row({ sched: 'TBA' })), 'arr', NOW), []);
});
