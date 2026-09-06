// YQY Sydney NS — Terminal Systems Inc JSON board against verbatim
// captures of yqy.terminalsystems.com/flights.php (2026-09-06 03:06 ADT,
// four rows; and the 01:48 ADT capture that still held yesterday's
// Departed row). Pins: the text/html-labelled body parsed as JSON, the
// A/D split of one combined payload, explicit YYYY-MM-DD dates + 12-hour
// clocks (padded and unpadded, and the 12:xx AM hour) landing on the
// Halifax offset (ADT -03:00 here, AST -04:00 in winter), code+digits
// flight numbers, city NAME → IATA, the "Update" column as revisedTime
// only when it differs (an early actual, a midnight-crossing estimate),
// TSI's remarks vocabulary, gate on departures and "" on arrivals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yqyParseFeed, yqyFeedRows, yqyStatus, windowTsIn } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T03:06:00-03:00');

test('yqy: the payload is JSON despite its text/html content-type, and splits by type', () => {
  const rows = yqyFeedRows(fx('yqy-feed-sample.json'));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.type), ['A', 'D', 'A', 'D']);
  const dep = yqyParseFeed(fx('yqy-feed-sample.json'), 'dep', NOW);
  const arr = yqyParseFeed(fx('yqy-feed-sample.json'), 'arr', NOW);
  assert.equal(dep.length, 2, `dep ${dep.length}`);
  assert.equal(arr.length, 2, `arr ${arr.length}`);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'YQY' && x.departure.airport.icao === 'CYQY'));
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'YQY'));
  assert.deepEqual(dep.map((x) => x.number), ['AC1177', 'AC8095']);
  assert.deepEqual(arr.map((x) => x.number), ['AC1178', 'AC8096']);
});

test('yqy departures: "05:05 AM" and "5:20 PM" both land on ADT, gate 2, On Time = scheduled, no revised', () => {
  const dep = yqyParseFeed(fx('yqy-feed-sample.json'), 'dep', NOW);
  const ac = dep.find((x) => x.number === 'AC1177');
  assert.ok(ac, 'AC1177 present');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-06 05:05:00-03:00');   // zero-padded form
  assert.equal(ac.departure.scheduledTime.utc, '2026-09-06 08:05:00+00:00');
  assert.equal(ac._authTs, Date.parse('2026-09-06T05:05:00-03:00'));
  assert.equal(ac.status, 'scheduled');                                          // "On Time"
  assert.equal(ac.departure.revisedTime, undefined);                             // actualtime == scheduletime
  assert.equal(ac.departure.gate, '2');
  assert.equal(ac.arrival.airport.iata, 'YYZ');                                  // "Toronto" via the city map
  assert.equal(ac.arrival.airport.name, 'Toronto');
  assert.equal(ac.departure.airline.iata, 'AC');
  assert.equal(ac.departure.airline.name, 'Air Canada');
  assert.equal(ac.callSign, null);
  assert.equal(ac.codeshareStatus, 'IsOperator');
  assert.equal(ac.aircraft, undefined);                                          // no type in this feed
  const jazz = dep.find((x) => x.number === 'AC8095');
  assert.ok(jazz, 'AC8095 present');
  assert.equal(jazz.departure.scheduledTime.local, '2026-09-06 17:20:00-03:00'); // unpadded "5:20 PM"
  assert.equal(jazz.departure.scheduledTime.utc, '2026-09-06 20:20:00+00:00');
  assert.equal(jazz.arrival.airport.iata, 'YUL');                                // "Montreal"
  assert.equal(jazz.departure.gate, '2');
  assert.equal(jazz.status, 'scheduled');
});

test('yqy arrivals: 12:12 AM is 00:12, an early actual becomes revisedTime, "" gate is dropped', () => {
  const arr = yqyParseFeed(fx('yqy-feed-sample.json'), 'arr', NOW);
  const ac = arr.find((x) => x.number === 'AC1178');
  assert.ok(ac, 'AC1178 present');
  assert.equal(ac.arrival.scheduledTime.local, '2026-09-06 00:12:00-03:00');    // "12:12 AM", not 12:12
  assert.equal(ac.arrival.scheduledTime.utc, '2026-09-06 03:12:00+00:00');
  assert.equal(ac.status, 'arrived');
  assert.ok(ac.arrival.revisedTime, 'actual 12:05 AM differs from 12:12 AM');
  assert.equal(ac.arrival.revisedTime.local, '2026-09-06 00:05:00-03:00');      // 7 min early, same day
  assert.equal(ac.arrival.revisedTime.utc, '2026-09-06 03:05:00+00:00');
  assert.ok(ac.arrival.revisedTime.utc < ac.arrival.scheduledTime.utc, 'early, not a jump forward');
  assert.equal(ac.arrival.gate, undefined);                                      // gate ""
  assert.equal(ac.arrival.baggageBelt, undefined);
  assert.equal(ac.arrival.terminal, undefined);
  assert.equal(ac.departure.airport.iata, 'YYZ');
  assert.equal(ac.departure.scheduledTime.local, ac.arrival.scheduledTime.local); // far side mirrors sched
  const jazz = arr.find((x) => x.number === 'AC8096');
  assert.ok(jazz, 'AC8096 present');
  assert.equal(jazz.arrival.scheduledTime.local, '2026-09-06 16:14:00-03:00');
  assert.equal(jazz.status, 'scheduled');
  assert.equal(jazz.arrival.revisedTime, undefined);
  assert.equal(jazz.departure.airport.iata, 'YUL');
  assert.equal(jazz.departure.airport.name, 'Montreal');
  assert.equal(jazz.arrival.airline.iata, 'AC');
});

test('yqy: the 01:48 capture keeps yesterday\'s Departed row with its own date (window filter decides)', () => {
  const dep = yqyParseFeed(fx('yqy-feed-departed-sample.json'), 'dep', NOW);
  assert.equal(dep.length, 3, `dep ${dep.length}`);
  const both = dep.filter((x) => x.number === 'AC8095');
  assert.equal(both.length, 2, 'AC8095 on the 5th and the 6th');
  const gone = both.find((x) => x.departure.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(gone, 'the Sep 5 row present');
  assert.equal(gone.departure.scheduledTime.local, '2026-09-05 17:20:00-03:00');
  assert.equal(gone.status, 'departed');
  assert.equal(gone.departure.revisedTime, undefined);                           // 5:20 PM == 5:20 PM
  assert.equal(gone.departure.gate, '2');
  const next = both.find((x) => x.departure.scheduledTime.local.startsWith('2026-09-06'));
  assert.equal(next._authTs - gone._authTs, 864e5, 'same wall clock a day apart, both ADT');
  assert.equal(next.status, 'scheduled');
  // Today's window (Halifax local bounds, as fmt12 sends them) keeps the 6th and drops the 5th.
  const from = windowTsIn('America/Halifax', '2026-09-06T00:00'), to = windowTsIn('America/Halifax', '2026-09-07T00:00');
  const inWin = dep.filter((f) => f._authTs >= from && f._authTs < to).map((f) => f.number);
  assert.deepEqual(inWin, ['AC1177', 'AC8095']);
  assert.equal(yqyParseFeed(fx('yqy-feed-departed-sample.json'), 'arr', NOW).length, 2);
});

test('yqy: a 12 AM update on an 11 PM flight settles onto the next day; winter rows carry AST', () => {
  // Synthetic rows in the feed's exact shape — no such capture exists yet (YQY has no late flights).
  const mk = (o) => JSON.stringify({ flights: [{ Airline: 'Air Canada', date: '2026-09-06', remarks: 'On Time', gate: '',
    actualtime: '11:55 PM', scheduletime: '11:55 PM', city: 'Toronto', flightnumber: '1178', airlinecode: 'AC', indicator: 'D', type: 'A', ...o }] });
  const late = yqyParseFeed(mk({ remarks: 'Late', actualtime: '12:10 AM' }), 'arr', NOW)[0];
  assert.ok(late, 'row parsed');
  assert.equal(late.status, 'delayed');                                          // TSI's "Late"
  assert.equal(late.arrival.scheduledTime.local, '2026-09-06 23:55:00-03:00');
  assert.equal(late.arrival.revisedTime.local, '2026-09-07 00:10:00-03:00');
  assert.ok(late.arrival.revisedTime.utc > late.arrival.scheduledTime.utc, 'a 15 min delay, not a 23 h jump back');
  const winter = yqyParseFeed(mk({ date: '2026-12-06', scheduletime: '05:05 AM', actualtime: '05:05 AM', type: 'D' }), 'dep', NOW)[0];
  assert.equal(winter.departure.scheduledTime.local, '2026-12-06 05:05:00-04:00');
  assert.equal(winter.departure.scheduledTime.utc, '2026-12-06 09:05:00+00:00');
  // A dateless row (never seen) is Halifax-today, from nowMs — not the UTC date.
  const lateNight = Date.parse('2026-09-06T23:30:00-03:00');                     // 02:30 UTC on the 7th
  const dateless = yqyParseFeed(mk({ date: '', scheduletime: '11:55 PM', actualtime: '11:55 PM' }), 'arr', lateNight)[0];
  assert.equal(dateless.arrival.scheduledTime.local, '2026-09-06 23:55:00-03:00');
  // Leading zeros and a code-prefixed number are both normalised.
  assert.equal(yqyParseFeed(mk({ flightnumber: '0177', type: 'D' }), 'dep', NOW)[0].number, 'AC177');
  assert.equal(yqyParseFeed(mk({ flightnumber: 'AC1177', type: 'D' }), 'dep', NOW)[0].number, 'AC1177');
});

test('yqy: TSI remarks map onto the board vocabulary', () => {
  assert.equal(yqyStatus('On Time'), 'scheduled');
  assert.equal(yqyStatus('Early'), 'scheduled');
  assert.equal(yqyStatus('Late'), 'delayed');
  assert.equal(yqyStatus('Delayed'), 'delayed');
  assert.equal(yqyStatus('Departed'), 'departed');
  assert.equal(yqyStatus('Arrived'), 'arrived');
  assert.equal(yqyStatus('Cancelled'), 'cancelled');
  assert.equal(yqyStatus('Diverted'), 'diverted');
  assert.equal(yqyStatus(''), 'scheduled');
});

test('yqy: garbage in, empty out (and the shape check says null)', () => {
  for (const bad of ['', '{}', '[]', 'x', '<html></html>', '{"flights":"nope"}', '{"flights":{}}']) {
    assert.deepEqual(yqyParseFeed(bad, 'dep', NOW), [], JSON.stringify(bad));
    assert.deepEqual(yqyParseFeed(bad, 'arr', NOW), [], JSON.stringify(bad));
    assert.equal(yqyFeedRows(bad), null, JSON.stringify(bad));
  }
  // A row-less day is a real (empty) answer, not a broken feed — trailing comma tolerated.
  assert.deepEqual(yqyFeedRows('{"flights":[\n]}'), []);
  assert.deepEqual(yqyFeedRows('{"flights":[\n,\n]}'), []);
  assert.deepEqual(yqyParseFeed('{"flights":[]}', 'dep', NOW), []);
  // Rows missing what a flight needs are skipped, not crashed on.
  assert.deepEqual(yqyParseFeed('{"flights":[null, 1, {"type":"D"}, {"type":"X","airlinecode":"AC","flightnumber":"1","date":"2026-09-06","scheduletime":"1:00 PM"}]}', 'dep', NOW), []);
});
