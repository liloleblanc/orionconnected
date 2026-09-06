// YMM Fort McMurray — flyymm.com's WordPress REST route (fmaa/v1) against
// verbatim captures (2026-09-06 00:08 MDT). Pins: the "HH:MM, Mon DD"
// scheduletime read as Mountain (MDT -06:00) with the year anchored to
// the row's own date, the bare "HH:MM" actualtime as the revised time only
// when it differs ("Early 01:17" on a 01:25 arrival), direction taken from
// "type" (never "indicator", which is D on arrivals too), city_name
// "Calgary (YYC)" split into name + code, the 87-byte empty-day body, and
// the per-day query built on Fort McMurray's calendar, not UTC's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ymmParseFeed, ymmStatus, ymmDays } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T00:08:00-06:00');
// A one-day body in the feed's own envelope, for the synthetic edge rows.
const body = (rows, type) => JSON.stringify({ all_flights: { flights: rows }, last_imported: '1788674695', type: [type], searchval: '' });
const row = (o) => ({ date: '2026-09-06', remarks: 'On Time', gate: '5', actualtime: '05:45', scheduletime: '05:45, Sep 06',
  city: 'YYC', flightnumber: 'WS3523', airlinecode: 'WS', indicator: 'D', type: 'D', status_time: 'On Time',
  city_name: 'Calgary (YYC)', airlinename: 'WestJet', ...o });

test('ymm departures: Mountain offset, gate, city split, WS/AC, no revision when on time', () => {
  const dep = ymmParseFeed(fx('ymm-dep-sample.json'), 'dep', NOW);
  assert.equal(dep.length, 7, `parsed ${dep.length}`);
  for (const x of dep) {
    assert.equal(x.departure.airport.iata, 'YMM');
    assert.equal(x.departure.airport.icao, 'CYMM');
    assert.equal(x.departure.airport.name, 'Fort McMurray');
    assert.equal(x.status, 'scheduled');                       // every row reads "On Time"
    assert.equal(x.departure.revisedTime, undefined);          // actualtime == scheduletime throughout
    assert.equal(x.codeshareStatus, 'IsOperator');
  }
  const ws = dep.find((x) => x.number === 'WS3523');
  assert.ok(ws, 'WS3523 present');
  assert.equal(ws.departure.scheduledTime.local, '2026-09-06 05:45:00-06:00');   // MDT
  assert.equal(ws.departure.scheduledTime.utc, '2026-09-06 11:45:00+00:00');
  assert.equal(ws._authTs, Date.parse('2026-09-06T05:45:00-06:00'));
  assert.equal(ws.departure.gate, '5');
  assert.equal(ws.arrival.airport.iata, 'YYC');
  assert.equal(ws.arrival.airport.name, 'Calgary');            // "(YYC)" stripped from city_name
  assert.equal(ws.arrival.scheduledTime.local, ws.departure.scheduledTime.local);
  assert.equal(ws.departure.airline.iata, 'WS');
  assert.equal(ws.departure.airline.name, 'WestJet');
  const ac = dep.find((x) => x.number === 'AC8421');
  assert.ok(ac, 'AC8421 present');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-06 12:00:00-06:00');
  assert.equal(ac.departure.gate, '3');
  assert.equal(ac.departure.airline.iata, 'AC');
  assert.equal(ac.departure.airline.name, 'Air Canada');
  const yeg = dep.find((x) => x.number === 'WS3259');
  assert.ok(yeg, 'WS3259 present');
  assert.equal(yeg.departure.scheduledTime.local, '2026-09-06 19:40:00-06:00');
  assert.equal(yeg.arrival.airport.iata, 'YEG');
  assert.equal(yeg.arrival.airport.name, 'Edmonton');
  assert.equal(yeg.departure.gate, '3');
  // The seven rows are 05:45 → 21:05 in feed order.
  assert.deepEqual(dep.map((x) => x.number), ['WS3523', 'AC8421', 'WS3527', 'AC8423', 'WS3541', 'WS3259', 'WS3533']);
  // Every row is type D, so the arrivals read of the same body is empty.
  assert.deepEqual(ymmParseFeed(fx('ymm-dep-sample.json'), 'arr', NOW), []);
});

test('ymm arrivals: "Early 01:17" against a 01:25 schedule is the revised time, earlier, same day', () => {
  const arr = ymmParseFeed(fx('ymm-arr-sample.json'), 'arr', NOW);
  assert.equal(arr.length, 7, `parsed ${arr.length}`);
  for (const x of arr) {
    assert.equal(x.arrival.airport.iata, 'YMM');
    assert.equal(x.arrival.baggageBelt, undefined);            // the feed has no belts
    assert.equal(x.arrival.terminal, undefined);               // nor terminals
  }
  const early = arr.find((x) => x.number === 'WS3538');
  assert.ok(early, 'WS3538 present');
  assert.equal(early.status, 'scheduled');                     // "Early" is not a board state
  assert.equal(early.arrival.scheduledTime.local, '2026-09-06 01:25:00-06:00');
  assert.equal(early.arrival.scheduledTime.utc, '2026-09-06 07:25:00+00:00');
  assert.ok(early.arrival.revisedTime, 'actualtime 01:17 differs → revised');
  assert.equal(early.arrival.revisedTime.local, '2026-09-06 01:17:00-06:00');
  assert.equal(early.arrival.revisedTime.utc, '2026-09-06 07:17:00+00:00');
  assert.ok(early.arrival.revisedTime.utc < early.arrival.scheduledTime.utc, 'eight minutes early, not a day out');
  assert.equal(early.arrival.gate, '5');
  assert.equal(early.departure.airport.iata, 'YYC');
  assert.equal(early.departure.airport.name, 'Calgary');
  assert.equal(early.arrival.airline.iata, 'WS');
  const ac = arr.find((x) => x.number === 'AC8420');
  assert.ok(ac, 'AC8420 present');
  assert.equal(ac.arrival.scheduledTime.local, '2026-09-06 11:23:00-06:00');
  assert.equal(ac.arrival.revisedTime, undefined);
  assert.equal(ac.arrival.gate, '3');
  assert.equal(ac.arrival.airline.name, 'Air Canada');
  const yeg = arr.find((x) => x.number === 'WS3258');
  assert.ok(yeg, 'WS3258 present');
  assert.equal(yeg.departure.airport.iata, 'YEG');
  assert.equal(yeg.arrival.scheduledTime.local, '2026-09-06 19:05:00-06:00');
  // "indicator" is D on every arrival row; direction must come from "type".
  assert.deepEqual(ymmParseFeed(fx('ymm-arr-sample.json'), 'dep', NOW), []);
});

test('ymm: the 87-byte empty day and garbage both parse to nothing', () => {
  assert.equal(fx('ymm-empty-sample.json').length, 87);
  assert.deepEqual(ymmParseFeed(fx('ymm-empty-sample.json'), 'dep', NOW), []);
  assert.deepEqual(ymmParseFeed(fx('ymm-empty-sample.json'), 'arr', NOW), []);
  assert.deepEqual(ymmParseFeed('', 'dep', NOW), []);
  assert.deepEqual(ymmParseFeed('<html></html>', 'arr', NOW), []);
  assert.deepEqual(ymmParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(ymmParseFeed('[]', 'dep', NOW), []);
  assert.deepEqual(ymmParseFeed('{"all_flights":{"flights":[null,{},{"flightnumber":"WS1","type":"D"}]}}', 'dep', NOW), []);
});

test('ymm: status words map onto the board keys; novel wording passes through', () => {
  assert.equal(ymmStatus('On Time'), 'scheduled');
  assert.equal(ymmStatus('Early'), 'scheduled');
  assert.equal(ymmStatus(''), 'scheduled');
  assert.equal(ymmStatus(null), 'scheduled');
  assert.equal(ymmStatus('Delayed'), 'delayed');
  assert.equal(ymmStatus('Cancelled'), 'cancelled');
  assert.equal(ymmStatus('Canceled'), 'cancelled');
  assert.equal(ymmStatus('Departed'), 'departed');
  assert.equal(ymmStatus('Arrived'), 'arrived');
  assert.equal(ymmStatus('Landed'), 'arrived');
  assert.equal(ymmStatus('Boarding'), 'boarding');
  assert.equal(ymmStatus('Final Call'), 'boarding');
  assert.equal(ymmStatus('Gate Closed'), 'gateclosed');
  assert.equal(ymmStatus('Diverted'), 'diverted');
  assert.equal(ymmStatus('  now   boarding '), 'boarding');    // substring fallbacks
  assert.equal(ymmStatus('Gate Change'), 'gate change');       // unknown → lowercased, as-is
});

test('ymm (synthetic rows): midnight settling, "Mon DD" over the date field, MST, New Year, fallbacks', () => {
  const dep = ymmParseFeed(body([
    row({ flightnumber: 'WS9001', scheduletime: '23:55, Sep 06', actualtime: '00:20', remarks: 'Delayed', status_time: 'Delayed 00:20' }),
    row({ flightnumber: 'WS9002', date: '2026-09-07', scheduletime: '00:10, Sep 07', actualtime: '23:50', remarks: 'Early', status_time: 'Early 23:50' }),
    row({ flightnumber: 'WS9003', date: '2026-09-06', scheduletime: '00:30, Sep 07', actualtime: '00:30' }),
    row({ flightnumber: 'WS9004', date: '2026-01-15', scheduletime: '10:00, Jan 15', actualtime: '10:00' }),
    row({ flightnumber: 'WS9005', date: '2026-12-31', scheduletime: '00:15, Jan 01', actualtime: '00:15' }),
    row({ flightnumber: 'WS9006', actualtime: '', remarks: 'Departed', status_time: 'Departed 06:02' }),
    row({ flightnumber: 'WS9007', type: '' }),
    row({ flightnumber: 'AC9008', airlinecode: 'AC', airlinename: '', city: '', city_name: 'Toronto (YYZ)' }),
    row({ flightnumber: 'WS9009', remarks: 'Gate Change', status_time: 'Gate Change' }),
    row({ flightnumber: 'WS9010', date: '', scheduletime: '07:00' }),        // no calendar day at all
    row({ flightnumber: 'WS9011', type: 'A' })                              // an arrival in the departures body
  ], 'D'), 'dep', NOW);
  const by = (n) => dep.find((x) => x.number === n);
  assert.equal(dep.length, 9, dep.map((x) => x.number).join(','));
  // 23:55 with an actual of 00:20 is 25 minutes late, the next calendar day.
  assert.equal(by('WS9001').status, 'delayed');
  assert.equal(by('WS9001').departure.scheduledTime.local, '2026-09-06 23:55:00-06:00');
  assert.equal(by('WS9001').departure.revisedTime.local, '2026-09-07 00:20:00-06:00');
  assert.ok(by('WS9001').departure.revisedTime.utc > by('WS9001').departure.scheduledTime.utc);
  // 00:10 with an actual of 23:50 is 20 minutes early, the previous day.
  assert.equal(by('WS9002').departure.revisedTime.local, '2026-09-06 23:50:00-06:00');
  assert.equal(by('WS9002').status, 'scheduled');
  // The "Mon DD" in scheduletime is the flight's own day; the date field only anchors the year.
  assert.equal(by('WS9003').departure.scheduledTime.local, '2026-09-07 00:30:00-06:00');
  assert.equal(by('WS9003').departure.revisedTime, undefined);
  // Winter rows carry MST.
  assert.equal(by('WS9004').departure.scheduledTime.local, '2026-01-15 10:00:00-07:00');
  // A Dec 31 body listing "Jan 01" lands in the new year.
  assert.equal(by('WS9005').departure.scheduledTime.local, '2027-01-01 00:15:00-07:00');
  // Blank actualtime: the clock inside status_time is the fallback.
  assert.equal(by('WS9006').status, 'departed');
  assert.equal(by('WS9006').departure.revisedTime.local, '2026-09-06 06:02:00-06:00');
  // A row without "type" is kept on the queried side; one typed A is not.
  assert.ok(by('WS9007'), 'type-less row kept');
  assert.equal(by('WS9011'), undefined, 'type A row skipped on the dep read');
  // Blank city: the code inside city_name; blank airlinename: the worker's own AC name.
  assert.equal(by('AC9008').arrival.airport.iata, 'YYZ');
  assert.equal(by('AC9008').arrival.airport.name, 'Toronto');
  assert.equal(by('AC9008').departure.airline.name, 'Air Canada');
  assert.equal(by('WS9009').status, 'gate change');
  assert.equal(by('WS9010'), undefined, 'a row with no calendar day is dropped, not guessed');
});

test('ymm: ymmDays is today + tomorrow on the Fort McMurray calendar, not the UTC one', () => {
  assert.deepEqual(ymmDays(NOW), ['2026-09-06', '2026-09-07']);
  // 23:30 MDT on the 5th is already 05:30Z on the 6th; the board still wants the 5th.
  assert.deepEqual(ymmDays(Date.parse('2026-09-05T23:30:00-06:00')), ['2026-09-05', '2026-09-06']);
  // Month and year boundaries roll.
  assert.deepEqual(ymmDays(Date.parse('2026-12-31T20:00:00-07:00')), ['2026-12-31', '2027-01-01']);
  assert.deepEqual(ymmDays(Date.parse('2026-09-30T12:00:00-06:00')), ['2026-09-30', '2026-10-01']);
});
