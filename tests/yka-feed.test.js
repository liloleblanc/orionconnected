// YKA Kamloops — kamloopsairport.com/starkapi.php parser against verbatim
// captures (2026-09-05 23:06 PDT). Pins: "Sep 5 - 22:13" (no year, no
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
import { parseYkaFeed, parseYkaTime } from '../workers/fids-proxy.js';

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
  assert.equal(pc.status, 'scheduled');                          // "On Time"
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
  assert.ok(dep.every((x) => x.status === 'scheduled' && !x.departure.revisedTime), 'every row "On Time" with Estimated == Scheduled');
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
  assert.equal(mid.status, 'scheduled');
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
  assert.equal(gs('Landed at 06:10'), 'arrived');
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
