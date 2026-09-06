// YYG Charlottetown — flyyyg.com/passengers/flights/arrivals_departures/
// parser against two verbatim captures (2026-09-06 01:45 and 03:06 ADT).
// Pins: the two-table split by table class (every row says "arrivals"),
// the stray unclosed <tr> before each table's first row, the per-row
// full date (a Sep 5 "Arrived" straggler beside the Sep 6 board, same
// flight number twice), the "(AST)" header being a label for Halifax
// wall clock (-03:00 ADT in September, -04:00 AST in December), Porter's
// "Montreal -MET" → YHU, and a revision settled across midnight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYygPage, parseYygDate } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T01:45:00-03:00');

test('yyg: arrivals — 11 rows incl. the Sep 5 straggler; AC2016 twice on its own dates', () => {
  const arr = parseYygPage(fx('yyg-page-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 11, `parsed ${arr.length}`);
  for (const x of arr) {
    assert.equal(x.arrival.airport.iata, 'YYG');
    assert.equal(x.arrival.airport.name, 'Charlottetown');
    assert.ok(Number.isFinite(x._authTs), `${x.number} has a window ts`);
    assert.ok(x.arrival.scheduledTime.local.endsWith('-03:00'), 'ADT, not the header\'s "AST"');
  }
  const both = arr.filter((x) => x.number === 'AC2016');
  assert.equal(both.length, 2, 'AC2016 landed last night AND is due again tonight');
  const [landed, due] = both;
  assert.equal(landed.arrival.scheduledTime.local, '2026-09-05 23:59:00-03:00');
  assert.equal(landed.arrival.scheduledTime.utc, '2026-09-06 02:59:00+00:00');
  assert.equal(landed.status, 'arrived');
  assert.equal(landed.arrival.revisedTime.local, '2026-09-05 23:56:00-03:00');   // Arr. Time 23:56
  assert.equal(landed.arrival.revisedTime.utc, '2026-09-06 02:56:00+00:00');
  assert.equal(landed._authTs, Date.parse('2026-09-05T23:59:00-03:00'));
  assert.equal(due.arrival.scheduledTime.local, '2026-09-06 23:59:00-03:00');
  assert.equal(due.status, 'scheduled');                                          // "On Time"
  assert.equal(due.arrival.revisedTime, undefined);                              // 23:59 == 23:59
  assert.equal(due.departure.airport.iata, 'YYZ');                               // "Toronto"
  assert.equal(due.departure.airport.name, 'Toronto');
  assert.equal(due.arrival.airline.iata, 'AC');
  assert.equal(due.arrival.airline.name, 'Air Canada');
  assert.equal(due.codeshareStatus, 'IsOperator');
});

test('yyg: arrivals — every carrier and city on the board resolves', () => {
  const arr = parseYygPage(fx('yyg-page-sample.html'), 'arr', NOW);
  const f8 = arr.find((x) => x.number === 'F8678');
  assert.ok(f8, 'Flair 678 present');
  assert.equal(f8.arrival.airline.iata, 'F8');                                    // "F8" prefix survives the split
  assert.equal(f8.arrival.airline.name, 'Flair Airlines');
  assert.equal(f8.departure.airport.iata, 'YYZ');
  assert.equal(f8.arrival.scheduledTime.local, '2026-09-06 10:55:00-03:00');
  const met = arr.find((x) => x.number === 'PD2367');
  assert.ok(met, 'Porter 2367 present');
  assert.equal(met.departure.airport.iata, 'YHU');                                // "Montreal -MET" = Montréal Metropolitan
  assert.equal(met.departure.airport.name, 'Montreal -MET');
  assert.equal(met.arrival.airline.name, 'Porter Airlines');
  const yul = arr.find((x) => x.number === 'AC2030');
  assert.equal(yul.departure.airport.iata, 'YUL');                                // plain "Montreal"
  assert.equal(yul.arrival.scheduledTime.local, '2026-09-06 10:30:00-03:00');
  const ws = arr.find((x) => x.number === 'WS788');
  assert.ok(ws && ws.departure.airport.iata === 'YYC', 'WestJet 788 from Calgary');
  assert.equal(ws.arrival.airline.name, 'WestJet');
  assert.equal(ws.arrival.scheduledTime.local, '2026-09-06 17:10:00-03:00');
  const yow = arr.find((x) => x.number === 'PD2221');
  assert.ok(yow && yow.departure.airport.iata === 'YOW', 'Porter 2221 from Ottawa');
  assert.ok(arr.every((x) => x.arrival.airline.iata && x.departure.airport.iata), 'no nameless carrier or unmapped city');
  assert.deepEqual(arr.map((x) => x.number).slice(1, 5), ['AC2030', 'F8678', 'PD2367', 'AC628']);
});

test('yyg: departures — 10 rows, home side on the departure, AC2013 05:20 to Toronto', () => {
  const dep = parseYygPage(fx('yyg-page-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 10, `parsed ${dep.length}`);
  for (const x of dep) {
    assert.equal(x.departure.airport.iata, 'YYG');
    assert.ok(x.departure.scheduledTime.local.startsWith('2026-09-06 '), 'all dated Sep 6');
    assert.ok(x.departure.scheduledTime.local.endsWith('-03:00'), 'ADT');
    assert.equal(x.status, 'scheduled');
    assert.equal(x.departure.revisedTime, undefined);
  }
  const first = dep[0];
  assert.equal(first.number, 'AC2013');
  assert.equal(first.departure.scheduledTime.local, '2026-09-06 05:20:00-03:00');
  assert.equal(first.departure.scheduledTime.utc, '2026-09-06 08:20:00+00:00');
  assert.equal(first._authTs, Date.parse('2026-09-06T05:20:00-03:00'));
  assert.equal(first.arrival.airport.iata, 'YYZ');
  assert.equal(first.arrival.scheduledTime.local, first.departure.scheduledTime.local);   // the shared ADB-native shape
  const met = dep.find((x) => x.number === 'PD2368');
  assert.ok(met && met.arrival.airport.iata === 'YHU', 'Porter 2368 to Montreal -MET');
  assert.equal(met.departure.scheduledTime.local, '2026-09-06 17:20:00-03:00');
  const ws = dep.find((x) => x.number === 'WS789');
  assert.ok(ws && ws.arrival.airport.iata === 'YYC' && ws.departure.airline.iata === 'WS', 'WestJet 789 to Calgary');
  assert.equal(dep[dep.length - 1].number, 'AC633');
  assert.equal(dep[dep.length - 1].departure.scheduledTime.local, '2026-09-06 19:00:00-03:00');
  const ts = dep.map((x) => x._authTs);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b), 'board is in schedule order');
});

test('yyg: 03:06 capture — the Sep 5 straggler has rolled off, 10 + 10', () => {
  const arr = parseYygPage(fx('yyg-page-0306-sample.html'), 'arr', Date.parse('2026-09-06T03:06:00-03:00'));
  const dep = parseYygPage(fx('yyg-page-0306-sample.html'), 'dep', Date.parse('2026-09-06T03:06:00-03:00'));
  assert.equal(arr.length, 10, `arr ${arr.length}`);
  assert.equal(dep.length, 10, `dep ${dep.length}`);
  assert.ok(arr.every((x) => x.arrival.scheduledTime.local.startsWith('2026-09-06 ')), 'nothing from Sep 5 left');
  assert.equal(arr.filter((x) => x.number === 'AC2016').length, 1);
  assert.equal(arr[0].number, 'AC2030');
  assert.equal(arr[0].arrival.scheduledTime.local, '2026-09-06 10:30:00-03:00');
  assert.ok(arr.every((x) => x.status === 'scheduled' && !x.arrival.revisedTime), 'all On Time, no revisions');
});

test('yyg: synthetic rows — delayed/cancelled/departed, cross-midnight revision, dateless row, fallbacks', () => {
  const row = (date, carrier, num, city, sched, est, st, logo = 'porter_logo') =>
    `<tr class="arrivals"><td class="labelcol">${date}</td><td class="labelcol"><img decoding="async" src="https://flyyyg.com/wp-content/themes/bb-theme-child/images/carriers/${logo}.png" style="width:24px;" aria-hidden="true"> ${carrier}</td><td class='labelcol'>${num}</td><td class='labelcol'>${city}</td><td class="colctx labelcol">${sched}</td><td class='labelcol'>${est}</td><td class="labelcol">${st}</td></tr>`;
  const page = (rows, departing = false) =>
    `<table class="arrdeptables${departing ? ' departing' : ''}"><thead><tr><th>Date</th><th>Carrier</th><th>Flight #</th><th>City</th><th class="colctr">Sch. Time (AST)</th><th>Arr. Time</th><th>Status</th></tr></thead><tbody><tr>\n\t\t\t${rows.join('\n')}</tbody></table>`;
  const arr = parseYygPage(page([
    row('Sep 6, 2026', 'Porter', 'PD2367', 'Montreal -MET', '11:10', '11:52', 'Delayed'),
    row('Sep 6, 2026', 'Air Canada', 'AC2016', 'Toronto', '23:59', '00:12', 'Delayed', 'air_canada_logo'),
    row('Sep 6, 2026', 'WestJet', 'WS788', 'Calgary', '17:10', '17:10', 'Cancelled', 'westjet_logo'),
    row('', 'Flair', 'F8678', 'Toronto', '10:55', '10:55', 'Landed', 'flair_logo'),
    row('Dec 15, 2026', 'Pal Airlines', '901', 'Halifax', '08:05', '08:05', 'On Time', 'pal_logo'),
    row('Sep 7, 2026', 'Some New Name', '123', 'Ottawa', '09:00', '09:00', 'On Time'),
    row('Sep 6, 2026', 'Air Canada', 'AC630', 'Toronto', 'Scheduled', '', 'On Time', 'air_canada_logo')
  ]), 'arr', NOW);
  assert.equal(arr.length, 6, 'the row with no clock is skipped');
  const [late, mid, cx, dateless, pal, novel] = arr;
  assert.equal(late.status, 'delayed');
  assert.equal(late.arrival.revisedTime.local, '2026-09-06 11:52:00-03:00');
  assert.equal(mid.arrival.scheduledTime.local, '2026-09-06 23:59:00-03:00');
  assert.equal(mid.arrival.revisedTime.local, '2026-09-07 00:12:00-03:00', 'an actual past midnight lands on the next day');
  assert.ok(mid.arrival.revisedTime.utc > mid.arrival.scheduledTime.utc, 'a 13-minute delay, not a 23h jump back');
  assert.equal(cx.status, 'cancelled');
  assert.equal(cx.arrival.revisedTime, undefined);
  assert.equal(dateless.arrival.scheduledTime.local, '2026-09-06 10:55:00-03:00', 'a dateless row is airport-local today');
  assert.equal(dateless.status, 'arrived');                                       // "Landed"
  assert.equal(pal.number, 'PB901', 'digits-only flight number takes the carrier prefix');
  assert.equal(pal.arrival.airline.name, 'PAL Airlines');
  assert.equal(pal.departure.airport.iata, 'YHZ');
  assert.equal(pal.arrival.scheduledTime.local, '2026-12-15 08:05:00-04:00', 'December is AST via the tz helper');
  assert.equal(novel.number, 'PD123', 'unknown display name falls back to the logo filename');
  assert.equal(novel.departure.airport.iata, 'YOW');
  assert.equal(novel.arrival.scheduledTime.local, '2026-09-07 09:00:00-03:00');
  // Direction comes from the table class, not the row class.
  assert.deepEqual(parseYygPage(page([row('Sep 6, 2026', 'Porter', 'PD2364', 'Ottawa', '11:50', '11:50', 'Departed')], true), 'arr', NOW), []);
  const dep = parseYygPage(page([row('Sep 6, 2026', 'Porter', 'PD2364', 'Ottawa', '11:50', '11:50', 'Departed')], true), 'dep', NOW);
  assert.equal(dep.length, 1);
  assert.equal(dep[0].status, 'departed');
  assert.equal(dep[0].departure.airport.iata, 'YYG');
  assert.equal(dep[0].arrival.airport.iata, 'YOW');
  // An unseen "City -TAG" still lands on the city's main airport.
  const tagged = parseYygPage(page([row('Sep 6, 2026', 'Porter', 'PD2364', 'Toronto -XYZ', '11:50', '11:50', 'On Time')]), 'arr', NOW);
  assert.equal(tagged[0].departure.airport.iata, 'YYZ');
  assert.equal(tagged[0].departure.airport.name, 'Toronto -XYZ');
});

test('yyg: date cell forms and garbage in, empty out', () => {
  assert.deepEqual(parseYygDate('Sep 6, 2026'), { y: 2026, mo: 9, d: 6 });
  assert.deepEqual(parseYygDate('Sept 30, 2026'), { y: 2026, mo: 9, d: 30 });
  assert.deepEqual(parseYygDate('6 Sep 2026'), { y: 2026, mo: 9, d: 6 });
  assert.deepEqual(parseYygDate(' September 06, 2026 '), { y: 2026, mo: 9, d: 6 });
  assert.equal(parseYygDate('Sep 32, 2026'), null);
  assert.equal(parseYygDate('Foo 6, 2026'), null);
  assert.equal(parseYygDate(''), null);
  assert.deepEqual(parseYygPage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(parseYygPage('', 'dep', NOW), []);
  assert.deepEqual(parseYygPage('<table class="arrdeptables"><tr class="arrivals"><td>x</td></tr></table>', 'arr', NOW), []);
});
