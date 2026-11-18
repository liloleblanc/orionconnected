// YKA Kamloops — the parser against verbatim captures: the September shim
// (kamloopsairport.com/starkapi.php, 2026-09-05 23:06 PDT, gone since the site
// was rebuilt) and, at the end of this file, the plugin route that replaced it
// (2026-11-18). The shim's rows still parse: the old names are read as fallbacks. Pins: "Sep 5 - 22:13" (no year, no
// offset) landing on the Pacific offset, carrier NAME → IATA ("Pacific
// Coastal" → 8P from the YKA map, the shared map lacks it), the bare
// FlightNumber gaining its prefix, "Arrived at 23:02" with ActualTime as
// a string (the feed's [] placeholder otherwise), "Early at 23:47" as
// scheduled + revised, "Late at HH:MM" as delayed, EstimatedTime's own
// date across midnight, gate on both directions, no belt/terminal, and
// PST/rollover through the tz helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYkaFeed, parseYkaTime, _authorityHandlers } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T23:06:00-07:00');

test('yka arrivals: 19 rows over Sep 5–7, Pacific offset, name→IATA, gate, arrived/early clocks', () => {
  const arr = parseYkaFeed(fx('yka-arr-sample.json'), 'arr', NOW);
  assert.equal(arr.length, 19, `parsed ${arr.length}`);          // 2 still listed on Sep 5 + 9 on Sep 6 + 8 on Sep 7
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'YKA'));
  assert.ok(arr.every((x) => x.arrival.scheduledTime.local.endsWith('-07:00')), 'all PDT');
  // AC8062 from Vancouver: scheduled 22:13, "Arrived at 23:02", ActualTime "23:02" (a string, not the usual []).
  const ac = arr.find((x) => x.number === 'AC8062' && x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(ac, 'AC8062 (Sep 5) present');
  assert.equal(ac.arrival.scheduledTime.local, '2026-09-05 22:13:00-07:00');
  assert.equal(ac.arrival.scheduledTime.utc, '2026-09-06 05:13:00+00:00');
  assert.equal(ac._authTs, Date.parse('2026-09-05T22:13:00-07:00'));
  assert.equal(ac.status, 'arrived');
  assert.equal(ac.arrival.revisedTime.local, '2026-09-05 23:02:00-07:00');
  assert.equal(ac.arrival.gate, '1');
  assert.equal(ac.departure.airport.iata, 'YVR');
  assert.equal(ac.departure.airport.name, 'Vancouver');
  assert.equal(ac.arrival.airline.iata, 'AC');                  // the feed prints "Air Canada", never a code
  assert.equal(ac.arrival.airline.name, 'Air Canada');
  assert.equal(ac.arrival.baggageBelt, undefined);
  assert.equal(ac.arrival.terminal, undefined);
  assert.equal(ac.aircraft, undefined);
  // WS3487 from Calgary: "Early at 23:47" on a 23:55 schedule → scheduled + revised (boards colour early themselves).
  const ws = arr.find((x) => x.number === 'WS3487' && x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(ws, 'WS3487 (Sep 5) present');
  assert.equal(ws.status, 'scheduled');
  assert.equal(ws.arrival.scheduledTime.local, '2026-09-05 23:55:00-07:00');
  assert.equal(ws.arrival.revisedTime.local, '2026-09-05 23:47:00-07:00');
  assert.ok(ws.arrival.revisedTime.utc < ws.arrival.scheduledTime.utc, 'early, not late');
  assert.equal(ws.arrival.gate, '2');
  assert.equal(ws.departure.airport.iata, 'YYC');
  assert.equal(ws.arrival.airline.iata, 'WS');
  assert.equal(ws.arrival.airline.name, 'WestJet');
  // Pacific Coastal from Victoria at gate 3 — 8P comes from the YKA map.
  const pc = arr.find((x) => x.number === '8P1165' && x.arrival.scheduledTime.local.startsWith('2026-09-06'));
  assert.ok(pc, '8P1165 (Sep 6) present');
  assert.equal(pc.arrival.scheduledTime.local, '2026-09-06 17:00:00-07:00');
  assert.equal(pc.arrival.airline.iata, '8P');
  assert.equal(pc.arrival.airline.name, 'Pacific Coastal');
  assert.equal(pc.departure.airport.iata, 'YYJ');
  assert.equal(pc.departure.airport.name, 'Victoria');
  assert.equal(pc.arrival.gate, '3');
  assert.equal(pc.status, 'ontime');                          // "On Time"
  assert.equal(pc.arrival.revisedTime, undefined);               // EstimatedTime == ScheduleTime
  // Edmonton resolves through the feed's own ViaAirportCode.
  const eg = arr.find((x) => x.number === 'WS3645');
  assert.ok(eg, 'WS3645 present');
  assert.equal(eg.departure.airport.iata, 'YEG');
  assert.equal(eg.departure.airport.name, 'Edmonton');
  // Daily flights keep every day's instance; the window filter picks later.
  assert.equal(arr.filter((x) => x.number === 'AC8062').length, 3);   // Sep 5, 6, 7
  const last = arr[arr.length - 1];
  assert.equal(last.number, 'WS3487');
  assert.equal(last.arrival.scheduledTime.local, '2026-09-07 23:55:00-07:00');
  assert.equal(last._authTs, Date.parse('2026-09-07T23:55:00-07:00'));
});

test('yka departures: 17 rows, all On Time, gate on the home side, direction respected', () => {
  const dep = parseYkaFeed(fx('yka-dep-sample.json'), 'dep', NOW);
  assert.equal(dep.length, 17, `parsed ${dep.length}`);          // 9 on Sep 6 + 8 on Sep 7
  assert.ok(dep.every((x) => x.departure.airport.iata === 'YKA'));
  assert.ok(dep.every((x) => x.status === 'ontime' && !x.departure.revisedTime), 'every row "On Time" with Estimated == Scheduled');
  assert.ok(dep.every((x) => x.departure.gate), 'gate on every departure');
  const first = dep[0];
  assert.equal(first.number, 'WS3482');
  assert.equal(first.departure.scheduledTime.local, '2026-09-06 05:10:00-07:00');
  assert.equal(first.departure.scheduledTime.utc, '2026-09-06 12:10:00+00:00');
  assert.equal(first._authTs, Date.parse('2026-09-06T05:10:00-07:00'));
  assert.equal(first.departure.gate, '2');
  assert.equal(first.arrival.airport.iata, 'YYC');
  assert.equal(first.arrival.airport.name, 'Calgary');
  assert.equal(first.departure.airline.iata, 'WS');
  assert.equal(first.departure.airline.name, 'WestJet');
  assert.equal(first.arrival.gate, undefined);                   // far side carries no gate
  const ac = dep.find((x) => x.number === 'AC8053');
  assert.ok(ac, 'AC8053 present');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-06 06:00:00-07:00');
  assert.equal(ac.departure.gate, '1');
  assert.equal(ac.arrival.airport.iata, 'YVR');
  assert.equal(ac.departure.airline.name, 'Air Canada');
  const pc = dep.find((x) => x.number === '8P1166');
  assert.ok(pc, '8P1166 present');
  assert.equal(pc.departure.scheduledTime.local, '2026-09-06 17:25:00-07:00');
  assert.equal(pc.departure.gate, '3');
  assert.equal(pc.arrival.airport.iata, 'YYJ');
  // AC8053 is Sep 6 only in this capture; AC8061 flies both days.
  assert.equal(dep.filter((x) => x.number === 'AC8053').length, 1);
  assert.equal(dep.filter((x) => x.number === 'AC8061').length, 2);
  // Every departure row is "D", so the arrivals read of it is empty and vice versa.
  assert.deepEqual(parseYkaFeed(fx('yka-dep-sample.json'), 'arr', NOW), []);
  assert.deepEqual(parseYkaFeed(fx('yka-arr-sample.json'), 'dep', NOW), []);
});

// One verbatim row with fields overridden — the strings below are ones
// this feed has actually printed (the 21:48 PDT scouting read of the same
// AC8062 an hour before it landed, and WS3487's "Sep 6 - 00:00" estimate).
const row = (over) => JSON.stringify([{
  FlightNumber: '8062', FlightDate: 'Sep 5', AirlineCode: 'Air Canada', ArrivalOrDeparture: 'A',
  ViaAirportCode: 'YVR', ViaAirportCity: 'Vancouver', Gate: '1', EstimatedTime: 'Sep 5 - 22:13',
  ScheduleTime: 'Sep 5 - 22:13', CurrentDisplayID: '39370116', ActualTime: [], Status: 'On Time',
  Comments: 'Vancouver', Haystack: '8062Air CanadaVancouver', ...over
}]);

test('yka: "Late at HH:MM" is delayed; EstimatedTime carries its own date across midnight; fallbacks', () => {
  const late = parseYkaFeed(row({ EstimatedTime: 'Sep 5 - 22:50', Status: 'Late at 22:50' }), 'arr', NOW)[0];
  assert.equal(late.status, 'delayed');
  assert.equal(late.arrival.revisedTime.local, '2026-09-05 22:50:00-07:00');
  // 23:55 scheduled, "Sep 6 - 00:00" estimated, still "On Time" → scheduled with a next-day revised.
  const mid = parseYkaFeed(row({ FlightNumber: '3487', AirlineCode: 'WestJet', ViaAirportCode: 'YYC', ViaAirportCity: 'Calgary',
    ScheduleTime: 'Sep 5 - 23:55', EstimatedTime: 'Sep 6 - 00:00' }), 'arr', NOW)[0];
  assert.equal(mid.number, 'WS3487');
  assert.equal(mid.status, 'ontime');
  assert.equal(mid.arrival.scheduledTime.local, '2026-09-05 23:55:00-07:00');
  assert.equal(mid.arrival.revisedTime.local, '2026-09-06 00:00:00-07:00');
  assert.ok(mid.arrival.revisedTime.utc > mid.arrival.scheduledTime.utc, 'a 5-minute delay, not a day back');
  // Cancelled / Departed (not yet seen on this board — the shared yhz vocabulary).
  const cx = parseYkaFeed(row({ Status: 'Cancelled' }), 'arr', NOW)[0];
  assert.equal(cx.status, 'cancelled');
  assert.equal(cx.arrival.revisedTime, undefined);
  const dp = parseYkaFeed(row({ ArrivalOrDeparture: 'D', FlightNumber: '8053', ScheduleTime: 'Sep 6 - 06:00',
    EstimatedTime: 'Sep 6 - 06:04', ActualTime: '06:04', Status: 'Departed at 06:04' }), 'dep', NOW)[0];
  assert.equal(dp.number, 'AC8053');
  assert.equal(dp.status, 'departed');
  assert.equal(dp.departure.revisedTime.local, '2026-09-06 06:04:00-07:00');
  assert.equal(dp.departure.gate, '1');
  // Gate-side words a Stark FIDS prints on departures (the YXE spellings); a novel string stays scheduled.
  const gs = (Status) => parseYkaFeed(row({ ArrivalOrDeparture: 'D', Status }), 'dep', NOW)[0].status;
  assert.equal(gs('Boarding'), 'boarding');
  assert.equal(gs('Final Call'), 'boarding');
  assert.equal(gs('Gate Closed'), 'gateclosed');
  assert.equal(gs('Diverted'), 'diverted');
  assert.equal(gs('Landed at 06:10'), 'landed');   // v24120
  assert.equal(gs('Gate Change'), 'scheduled');
  assert.equal(gs(''), 'scheduled');
  // ActualTime as a bare "HH:MM" while Estimated has not moved: placed on the scheduled day, settled across midnight.
  const act = parseYkaFeed(row({ ScheduleTime: 'Sep 5 - 23:55', EstimatedTime: 'Sep 5 - 23:55', ActualTime: '00:10', Status: 'Arrived at 00:10' }), 'arr', NOW)[0];
  assert.equal(act.status, 'arrived');
  assert.equal(act.arrival.revisedTime.local, '2026-09-06 00:10:00-07:00');
  // The clock inside Status alone (ActualTime [] and Estimated stale) still yields the revised time.
  const st = parseYkaFeed(row({ Status: 'Late at 22:50' }), 'arr', NOW)[0];
  assert.equal(st.status, 'delayed');
  assert.equal(st.arrival.revisedTime.local, '2026-09-05 22:50:00-07:00');
  // Unknown carrier keeps the bare number and its printed name; a real 2-letter code in AirlineCode is used as-is.
  const unk = parseYkaFeed(row({ AirlineCode: 'Some New Carrier' }), 'arr', NOW)[0];
  assert.equal(unk.number, '8062');
  assert.equal(unk.arrival.airline.iata, null);
  assert.equal(unk.arrival.airline.name, 'Some New Carrier');
  const coded = parseYkaFeed(row({ AirlineCode: 'AC' }), 'arr', NOW)[0];
  assert.equal(coded.number, 'AC8062');
  assert.equal(coded.arrival.airline.name, 'Air Canada');
  // A prefixed FlightNumber, should the shim ever add one, is not doubled.
  const pre = parseYkaFeed(row({ FlightNumber: 'AC8062' }), 'arr', NOW)[0];
  assert.equal(pre.number, 'AC8062');
  // Rows without a usable schedule are dropped, not mis-dated.
  assert.deepEqual(parseYkaFeed(row({ ScheduleTime: 'TBA' }), 'arr', NOW), []);
});

test('yka: times — PDT now, PST in December, year rollover both ways', () => {
  assert.equal(parseYkaTime('Sep 5 - 22:13', NOW).local, '2026-09-05 22:13:00-07:00');
  assert.equal(parseYkaTime('Sep 5 - 22:13', NOW).utc, '2026-09-06 05:13:00+00:00');
  assert.equal(parseYkaTime('Sep 5 - 22:13', NOW).ts, Date.parse('2026-09-05T22:13:00-07:00'));
  assert.equal(parseYkaTime('Dec 15 - 08:05', NOW).local, '2026-12-15 08:05:00-08:00');
  assert.equal(parseYkaTime('Jan 2 - 10:00', Date.parse('2026-12-31T20:00:00-08:00')).local, '2027-01-02 10:00:00-08:00');
  assert.equal(parseYkaTime('Dec 31 - 23:30', Date.parse('2027-01-01T01:00:00-08:00')).local, '2026-12-31 23:30:00-08:00');
  assert.equal(parseYkaTime('Sept 5 - 22:13', NOW).local, '2026-09-05 22:13:00-07:00');   // four-letter month tolerated
  assert.equal(parseYkaTime('On Time', NOW), null);
  assert.equal(parseYkaTime('', NOW), null);
  assert.equal(parseYkaTime([], NOW), null);
  assert.equal(parseYkaTime('Sep 5 - 24:00', NOW), null);
});

test('yka: garbage in, empty out', () => {
  assert.deepEqual(parseYkaFeed('', 'arr', NOW), []);
  assert.deepEqual(parseYkaFeed('x', 'dep', NOW), []);
  assert.deepEqual(parseYkaFeed('[]', 'arr', NOW), []);
  assert.deepEqual(parseYkaFeed('{}', 'dep', NOW), []);
  assert.deepEqual(parseYkaFeed('[null, 1, "x"]', 'arr', NOW), []);
  // The WP REST 404 a missing ?type= answers with.
  assert.deepEqual(parseYkaFeed('{"code":"rest_no_route","message":"No route was found matching the URL and request method","data":{"status":404}}', 'arr', NOW), []);
  assert.deepEqual(parseYkaFeed('<html></html>', 'arr', NOW), []);
});

// ── 2026-11-18 — the address moved and the rows were renamed ────────────────
// The airport rebuilt its site: /starkapi.php answers a plain 404 and the
// plugin now serves /wp-json/ch-flight-data/v1/flights/<direction>, with
// camelCase rows. The two fixtures are the first rows of what those routes
// answered at 15:44Z (07:44 in Kamloops), byte for byte.
const NOW_NOV = Date.parse('2026-11-18T07:44:00-08:00');

test('yka, the new route: arrivals parse into rows with the date, the gate, the place code and the carrier', () => {
  const arr = parseYkaFeed(fx('yka-flights-arr-2026-11-18.json'), 'arr', NOW_NOV);
  assert.deepEqual(arr.map((x) => x.number), ['AC8054', 'WS3483', 'WS3485', '8P1165', 'AC8060', 'AC8062', 'WS3487', 'AC8054']);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'YKA'));
  assert.ok(arr.every((x) => x.arrival.scheduledTime.local.endsWith('-08:00')), 'all PST');
  assert.ok(arr.every((x) => x.arrival.gate), 'a gate on every row');
  // AC8054 from Vancouver: "Nov 18 - 09:47", status "Late", estimatedTime a bare "10:44".
  const ac = arr[0];
  assert.equal(ac.status, 'delayed');
  assert.equal(ac.arrival.scheduledTime.local, '2026-11-18 09:47:00-08:00');
  assert.equal(ac.arrival.scheduledTime.utc, '2026-11-18 17:47:00+00:00');
  // The row's own timestamp (1795016820 = 15:47Z) is two hours early: never read.
  assert.equal(ac._authTs, Date.parse('2026-11-18T09:47:00-08:00'));
  assert.notEqual(ac._authTs, 1795016820 * 1000);
  assert.equal(ac.arrival.revisedTime.local, '2026-11-18 10:44:00-08:00');
  assert.equal(ac.arrival.gate, '1');
  assert.equal(ac.departure.airport.iata, 'YVR');
  assert.equal(ac.departure.airport.name, 'Vancouver');
  assert.equal(ac.arrival.airline.iata, 'AC');
  assert.equal(ac.arrival.airline.name, 'Air Canada');
  // WestJet: airlineCode is "WJA" (the ICAO code). The carrier comes from the name.
  const ws = arr[1];
  assert.equal(ws.number, 'WS3483');
  assert.equal(ws.arrival.airline.iata, 'WS');
  assert.equal(ws.arrival.airline.name, 'WestJet');
  assert.equal(ws.status, 'cancelled');
  assert.equal(ws.arrival.revisedTime, undefined);
  assert.equal(ws.departure.airport.iata, 'YYC');
  // "On Time" with estimatedTime equal to the schedule: no revised time.
  const pc = arr[3];
  assert.equal(pc.number, '8P1165');
  assert.equal(pc.status, 'ontime');
  assert.equal(pc.arrival.revisedTime, undefined);
  assert.equal(pc.arrival.airline.name, 'Pacific Coastal Airlines');
  assert.equal(pc.departure.airport.iata, 'YYJ');
  assert.equal(pc.arrival.gate, '3');
  // Past midnight and the next day keep their own dates.
  assert.equal(arr[6].arrival.scheduledTime.local, '2026-11-19 00:15:00-08:00');
  assert.equal(arr[7].arrival.scheduledTime.local, '2026-11-19 09:47:00-08:00');
  assert.equal(arr[7].status, 'ontime');
});

test('yka, the new route: departures — "Delayed at 11:15", cancelled, direction respected', () => {
  const dep = parseYkaFeed(fx('yka-flights-dep-2026-11-18.json'), 'dep', NOW_NOV);
  assert.deepEqual(dep.map((x) => x.number), ['AC8055', 'WS3488', 'WS3486', '8P1166', 'AC8061', 'WS3482', 'AC8053']);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'YKA' && x.departure.gate));
  const ac = dep[0];
  assert.equal(ac.status, 'delayed');
  assert.equal(ac.departure.scheduledTime.local, '2026-11-18 10:20:00-08:00');
  assert.equal(ac.departure.revisedTime.local, '2026-11-18 11:15:00-08:00');
  assert.equal(ac.departure.gate, '1');
  assert.equal(ac.arrival.airport.iata, 'YVR');
  assert.equal(ac.arrival.gate, undefined);
  assert.equal(dep[1].status, 'cancelled');
  assert.equal(dep[5].departure.scheduledTime.local, '2026-11-19 05:10:00-08:00');
  // Each route is one direction: read for the other side, it is empty.
  assert.deepEqual(parseYkaFeed(fx('yka-flights-dep-2026-11-18.json'), 'arr', NOW_NOV), []);
  assert.deepEqual(parseYkaFeed(fx('yka-flights-arr-2026-11-18.json'), 'dep', NOW_NOV), []);
});

// One row of the new shape with fields overridden.
const newRow = (over) => JSON.stringify([{
  flightId: 40355681, flightNumber: '8054', airlineName: 'Air Canada', airlineCode: 'AC', airportCity: 'Vancouver', airportCode: 'YVR',
  direction: 'A', flightDate: '20261118', localTimestamp: 1795016820, utcTimestamp: 1795016820, timestamp: 1795016820,
  displayDate: 'Nov 18', scheduledTime: '9:47 AM', scheduleDisplay: 'Nov 18 - 09:47', estimatedTime: '09:47', status: 'On Time',
  notes: 'On Time', terminal: '', gate: '1', haystack: '', ...over
}]);

test('yka, the new route: a bare estimate settles across midnight; the date and clock stand in for a missing scheduleDisplay', () => {
  // 23:55 scheduled, estimated "00:05": the next day, ten minutes late.
  const late = parseYkaFeed(newRow({ scheduleDisplay: 'Nov 18 - 23:55', scheduledTime: '11:55 PM', estimatedTime: '00:05', status: 'Late' }), 'arr', NOW_NOV)[0];
  assert.equal(late.status, 'delayed');
  assert.equal(late.arrival.scheduledTime.local, '2026-11-18 23:55:00-08:00');
  assert.equal(late.arrival.revisedTime.local, '2026-11-19 00:05:00-08:00');
  // 00:15 scheduled, estimated "23:58": the evening before, early.
  const early = parseYkaFeed(newRow({ scheduleDisplay: 'Nov 19 - 00:15', flightDate: '20261119', estimatedTime: '23:58' }), 'arr', NOW_NOV)[0];
  assert.equal(early.arrival.revisedTime.local, '2026-11-18 23:58:00-08:00');
  // No scheduleDisplay: flightDate + scheduledTime, twelve-hour clock.
  const bare = parseYkaFeed(newRow({ scheduleDisplay: undefined, scheduledTime: '2:45 PM', estimatedTime: '14:45' }), 'arr', NOW_NOV)[0];
  assert.equal(bare.arrival.scheduledTime.local, '2026-11-18 14:45:00-08:00');
  assert.equal(bare.arrival.revisedTime, undefined);
  const noon = parseYkaFeed(newRow({ scheduleDisplay: '', scheduledTime: '12:05 AM', flightDate: '20261119' }), 'arr', NOW_NOV)[0];
  assert.equal(noon.arrival.scheduledTime.local, '2026-11-19 00:05:00-08:00');
  // Neither: the row has no time, and is not given one from the timestamps.
  assert.deepEqual(parseYkaFeed(newRow({ scheduleDisplay: '', scheduledTime: '', flightDate: '' }), 'arr', NOW_NOV), []);
  // The words of the old shim still read on the new rows.
  const st = (status, extra) => parseYkaFeed(newRow({ status, ...extra }), 'arr', NOW_NOV)[0];
  assert.equal(st('Arrived at 09:51', { estimatedTime: '09:51' }).status, 'arrived');
  assert.equal(st('Arrived at 09:51', { estimatedTime: '09:51' }).arrival.revisedTime.local, '2026-11-18 09:51:00-08:00');
  assert.equal(st('Early at 09:40', { estimatedTime: '09:40' }).status, 'scheduled');
  assert.equal(st('Late at 10:10', { estimatedTime: '09:47' }).arrival.revisedTime.local, '2026-11-18 10:10:00-08:00', 'the clock in the words, when the estimate has not moved');
  assert.equal(st('Delayed at 11:15').status, 'delayed');
});

test("yka, the new route: the row's own code stands in when the name is missing or unknown, never before the name", () => {
  const one = (over) => parseYkaFeed(newRow(over), 'arr', NOW_NOV)[0];
  // A carrier no map knows, with a good two-character code: the code, and the name as printed.
  const h3 = one({ airlineName: 'Harbour Somewhere Air', airlineCode: 'H3' });
  assert.equal(h3.number, 'H38054');
  assert.equal(h3.arrival.airline.iata, 'H3');
  assert.equal(h3.arrival.airline.name, 'Harbour Somewhere Air');
  // No name at all: the code, and the name the worker knows for it.
  const ac = one({ airlineName: '', airlineCode: 'AC' });
  assert.equal(ac.number, 'AC8054');
  assert.equal(ac.arrival.airline.name, 'Air Canada');
  // The ICAO form the plugin sends for WestJet, with no name: read through the Canadian map.
  const ws = one({ airlineName: '', airlineCode: 'WJA' });
  assert.equal(ws.number, 'WS8054');
  assert.equal(ws.arrival.airline.name, 'WestJet');
  // The name still comes first: a wrong code beside a known name changes nothing.
  assert.equal(one({ airlineName: 'WestJet', airlineCode: 'AC' }).number, 'WS8054');
  // Neither a name nor a code that is one (digits, an unknown three letters): the bare number, as before.
  assert.equal(one({ airlineName: '', airlineCode: '80' }).number, '8054');
  assert.equal(one({ airlineName: '', airlineCode: 'XQZ' }).number, '8054');
  assert.equal(one({ airlineName: '', airlineCode: 'XQZ' }).arrival.airline.iata, null);
});

test("yka: the board's own route (stark/both: bare clocks, no date, no gate) is never read as rows with a guessed day", () => {
  const both = JSON.stringify({ arrivals: [{ DisplayTime: '09:47', ViaAirportCity: 'Vancouver', AirlineCode: 'Air Canada', FlightNumber: '8054',
    Status: 'Late', StatusModifier: '', ScheduleTime: '09:47', Haystack: '' }], departures: [] });
  assert.deepEqual(parseYkaFeed(both, 'arr', NOW_NOV), []);
  assert.deepEqual(parseYkaFeed(JSON.stringify(JSON.parse(both).arrivals), 'arr', NOW_NOV), []);
});

test('yka: the handler asks the plugin route for its direction, never the shim that is gone, and a 404 there is no list', async () => {
  const saved = { fetch: globalThis.fetch, caches: globalThis.caches, now: Date.now };
  const asked = [];
  Date.now = () => NOW_NOV;
  globalThis.caches = { default: { async match() { return undefined; }, async put() {} } };
  try {
    globalThis.fetch = async (url) => {
      asked.push(String(url));
      const m = String(url).match(/\/wp-json\/ch-flight-data\/v1\/flights\/(arrivals|departures)$/);
      if (m) return new Response(fx(`yka-flights-${m[1] === 'arrivals' ? 'arr' : 'dep'}-2026-11-18.json`), { status: 200, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
      return new Response('<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>',
        { status: 404, headers: { 'Content-Type': 'text/html' } });
    };
    const dep = await _authorityHandlers.yka.list('dep', {});
    const arr = await _authorityHandlers.yka.list('arr', {});
    assert.equal(dep.length, 7);
    assert.equal(arr.length, 8);
    assert.deepEqual(asked, [
      'https://kamloopsairport.com/wp-json/ch-flight-data/v1/flights/departures',
      'https://kamloopsairport.com/wp-json/ch-flight-data/v1/flights/arrivals'
    ]);
    // The route gone again (what starkapi.php answers today): nothing, never an empty list.
    globalThis.fetch = async (url) => { asked.push(String(url)); return new Response('<center><h1>404 Not Found</h1></center>', { status: 404, headers: { 'Content-Type': 'text/html' } }); };
    assert.equal(await _authorityHandlers.yka.list('dep', {}), null);
    assert.ok(!asked.some((u) => /starkapi/.test(u)), 'the old address is not asked');
  } finally { globalThis.fetch = saved.fetch; globalThis.caches = saved.caches; Date.now = saved.now; }
});
