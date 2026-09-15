// SYD Sydney Kingsford Smith — sydneyairport.com.au/_a/flights JSON against
// twelve verbatim captures (2026-09-14T16:15Z = 02:15 AEST 2026-09-15:
// departure/arrival × international/domestic × yesterday/today/tomorrow,
// 2,385 rows; headers in syd-capture-headers.txt). Pins: wall-clock
// "HH:MM" + "YYYY-MM-DD" read in Australia/Sydney with the offset resolved
// per instant (+10:00 on the capture, +11:00 once AEDT starts 2026-10-04,
// and the pre-switch hours of both change nights on the old offset);
// estimatedTime "-" as no revision and an estimate equal to the schedule
// as none either, another day's date taken as written and the schedule's
// own day settled across midnight; the four live statuses, the seven
// archived ones and whole-word sniffing for the rest; flightNumbers[0]
// as the one row (QF654's nine codeshares never surface); destinations[]
// as routing — first non-Sydney city on a departure, last on an arrival,
// which on a Rex loop is the last outstation before home on both boards,
// with the "Sydney" slot skipped and no SYD→SYD row ever; terminalNumber
// T1/T2/T3 as the digit; the three nameless carriers named; the
// hand-keyed city table incl. the leading space on " Alice Springs",
// Haneda, Avalon, Newcastle (NSW) and the pre-seeded routes, terminal
// against the Atlantic table; the day-file selection around midnight,
// 06:00 and the DST switch; the slices list() fetches and that one dead
// slice fails the direction; and the registration points the picker
// tests read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sydParseFeed, sydFeedDays, sydSlices, sydStatus, _authorityHandlers, _authorityRosterHas } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-15T02:15:00+10:00');
const slice = (dir, term, day) => fx(`syd-${dir === 'dep' ? 'departure' : 'arrival'}-${term}-${day}.json`);
const parse = (dir, term, day) => sydParseFeed(slice(dir, term, day), dir, NOW);
const byNum = (list, n) => list.find((x) => x.number === n);
const far = (dir, x) => (dir === 'dep' ? x.arrival : x.departure).airport;
const home = (dir, x) => (dir === 'dep' ? x.departure : x.arrival);
// A one-row slice for the synthetic cases; every field the feed prints, overridable.
const row = (o) => JSON.stringify({ totalFlightCount: 1, flightData: [{
  id: 'x', airline: 'Test Air', airlineCode: 'XX', tailLogoUrl: null, destinations: ['Perth'],
  flightNumbers: ['XX100'], operationalSuffix: null, terminalType: 'DOMESTIC', terminalNumber: 'T2',
  flightType: 'DEPARTURE', scheduledTime: '10:00', estimatedTime: '-', scheduledDate: '2026-09-15',
  estimatedDate: '-', latestTime: '10:00', status: 'On Time', statusColor: 'green', ...o
}] });

test('syd: every slice parses whole — counts, home side, offset, direction isolation', () => {
  const want = {
    'dep|international|yesterday': 100, 'dep|international|today': 99, 'dep|international|tomorrow': 99,
    'dep|domestic|yesterday': 315, 'dep|domestic|today': 282, 'dep|domestic|tomorrow': 298,
    'arr|international|yesterday': 101, 'arr|international|today': 99, 'arr|international|tomorrow': 100,
    'arr|domestic|yesterday': 313, 'arr|domestic|today': 282, 'arr|domestic|tomorrow': 297
  };
  for (const key of Object.keys(want)) {
    const [dir, term, day] = key.split('|');
    const raw = JSON.parse(slice(dir, term, day));
    const rows = parse(dir, term, day);
    assert.equal(raw.flightData.length, want[key], `${key}: fixture holds ${raw.flightData.length}`);
    assert.equal(rows.length, want[key], `${key}: parsed ${rows.length} of ${want[key]} — nothing is dropped`);
    assert.ok(rows.every((x) => home(dir, x).airport.iata === 'SYD' && home(dir, x).airport.icao === 'YSSY'));
    assert.ok(rows.every((x) => far(dir, x).iata !== 'SYD'), `${key}: no SYD→SYD row`);
    assert.ok(rows.every((x) => far(dir, x).iata), `${key}: every far end the capture printed resolves to a code`);
    assert.ok(rows.every((x) => home(dir, x).scheduledTime.local.endsWith('+10:00')), `${key}: AEST on every row`);
    assert.ok(rows.every((x) => ['1', '2', '3'].includes(home(dir, x).terminal)), `${key}: terminal is the digit`);
    assert.ok(rows.every((x) => x.callSign === null && x.codeshareStatus === 'IsOperator' && x.isCargo === false));
    assert.ok(rows.every((x) => x.departure.gate === undefined && x.arrival.gate === undefined), 'the list endpoint has no gate');
    assert.ok(rows.every((x) => x.arrival.baggageBelt === undefined), 'nor a belt');
    // A departure slice read as arrivals is empty, and vice versa.
    assert.deepEqual(sydParseFeed(slice(dir, term, day), dir === 'dep' ? 'arr' : 'dep', NOW), []);
  }
  // International rows are all T1; domestic splits T2 (Virgin/Jetstar/Rex) and T3 (Qantas).
  assert.ok(parse('dep', 'international', 'today').every((x) => x.departure.terminal === '1'));
  const dom = parse('dep', 'domestic', 'today');
  assert.ok(dom.some((x) => x.departure.terminal === '2') && dom.some((x) => x.departure.terminal === '3'));
});

test('syd departures: EK415 international — offset, _authTs, terminal 1, trimmed airline, no estimate, codeshares dropped', () => {
  const dep = parse('dep', 'international', 'today');
  const ek = byNum(dep, 'EK415');
  assert.ok(ek, 'EK415 present');
  assert.equal(ek.departure.scheduledTime.local, '2026-09-15 06:00:00+10:00');
  assert.equal(ek.departure.scheduledTime.utc, '2026-09-14 20:00:00+00:00');
  assert.equal(ek._authTs, 1789416000000);
  assert.equal(ek.status, 'scheduled');                                   // "On Time"
  assert.equal(ek.departure.revisedTime, undefined);                      // estimatedTime "-"
  assert.equal(ek.departure.terminal, '1');
  assert.equal(ek.arrival.airport.iata, 'DXB');
  assert.equal(ek.arrival.airport.name, 'Dubai');
  assert.equal(ek.departure.airline.iata, 'EK');
  assert.equal(ek.departure.airline.name, 'Emirates');                    // "Emirates " in the feed
  // flightNumbers ["EK415","QF8415","AZ5633"]: one row, the operator's.
  assert.equal(byNum(dep, 'QF8415'), undefined);
  assert.equal(byNum(dep, 'AZ5633'), undefined);
  // QF1 to London via Singapore: the far end is the first non-Sydney city.
  const qf1 = byNum(dep, 'QF1');
  assert.ok(qf1, 'QF1 present');
  assert.equal(qf1.arrival.airport.iata, 'LHR');
  assert.equal(qf1.arrival.airport.name, 'London');
  assert.equal(qf1.departure.scheduledTime.local, '2026-09-15 14:45:00+10:00');
  assert.equal(qf1._authTs, 1789447500000);
  assert.equal(byNum(dep, 'EK5003'), undefined, 'ten codeshares on QF1, none a row');
  // AC34 Toronto via Vancouver → Toronto; SB141 → Nouméa keyed with its accent; QF189 → Nuku'alofa.
  assert.equal(byNum(dep, 'AC34').arrival.airport.iata, 'YYZ');
  assert.equal(byNum(dep, 'SB141').arrival.airport.iata, 'NOU');
  assert.equal(byNum(dep, 'SB141').arrival.airport.name, 'Nouméa');
  assert.equal(byNum(dep, 'QF189').arrival.airport.iata, 'TBU');
});

test('syd departures: domestic — cancelled, T2/T3, the Rex loop, nameless carriers, Avalon and " Alice Springs"', () => {
  const dep = parse('dep', 'domestic', 'today');
  const va = byNum(dep, 'VA957');
  assert.ok(va, 'VA957 present');
  assert.equal(va.status, 'cancelled');
  assert.equal(va.departure.revisedTime, undefined);
  assert.equal(va.departure.terminal, '2');
  assert.equal(va.arrival.airport.iata, 'BNE');
  assert.equal(va.departure.scheduledTime.local, '2026-09-15 16:00:00+10:00');
  // ZL6117 SYD→Merimbula→Moruya→SYD prints ["Sydney","Moruya","Merimbula"] — the route reversed, as QF1's
  // ["London","Singapore"] is. Sydney skipped, the far end shown: the last outstation before the turn for
  // home, the same city its arrival twin shows (below), not the first stop.
  const zl = byNum(dep, 'ZL6117');
  assert.ok(zl, 'ZL6117 present');
  assert.equal(zl.arrival.airport.iata, 'MYA');
  assert.equal(zl.arrival.airport.name, 'Moruya');
  assert.equal(zl.departure.terminal, '3');
  assert.equal(zl.departure.scheduledTime.local, '2026-09-15 09:05:00+10:00');
  assert.equal(zl._authTs, 1789427100000);
  assert.equal(byNum(dep, 'ZL6463').arrival.airport.iata, 'NRA');          // ["Sydney","Narrandera","Griffith"]
  assert.equal(byNum(dep, 'ZL6469').arrival.airport.iata, 'GFF');          // ["Sydney","Griffith","Narrandera"]
  // FP and QN come with airline "" — named here.
  const fp = byNum(dep, 'FP771');
  assert.ok(fp, 'FP771 present');
  assert.equal(fp.departure.airline.iata, 'FP');
  assert.equal(fp.departure.airline.name, 'FlyPelican');
  assert.equal(fp.arrival.airport.iata, 'NAA');
  assert.equal(fp.departure.terminal, '3');
  const qn = byNum(dep, 'QN13');
  assert.ok(qn, 'QN13 present');
  assert.equal(qn.departure.airline.name, 'Skytrans');
  assert.equal(qn.arrival.airport.iata, 'LDH');
  // Avalon prints as the airport, not Melbourne; " Alice Springs" keeps its leading space in the feed.
  const jq = byNum(dep, 'JQ607');
  assert.equal(jq.arrival.airport.iata, 'AVV');
  assert.equal(jq.departure.terminal, '2');
  const qf790 = byNum(dep, 'QF790');
  assert.ok(qf790, 'QF790 present');
  assert.equal(qf790.arrival.airport.iata, 'ASP');
  assert.equal(qf790.arrival.airport.name, 'Alice Springs');
  // Tomorrow: FP214 to Newcastle is Williamtown NSW; FP823 wears operationalSuffix "Z" and is still one plain row.
  const tm = parse('dep', 'domestic', 'tomorrow');
  const fp214 = byNum(tm, 'FP214');
  assert.ok(fp214, 'FP214 present');
  assert.equal(fp214.arrival.airport.iata, 'NTL');
  assert.equal(fp214.arrival.airport.name, 'Newcastle');
  assert.equal(tm.filter((x) => /^FP823/.test(x.number)).length, 1);
  assert.equal(byNum(tm, 'FP823').departure.scheduledTime.local, '2026-09-16 10:30:00+10:00');
  assert.equal(byNum(tm, 'FP823')._authTs, 1789518600000);
});

test('syd arrivals: QF654 with nine numbers, estimate as revision, T3; last stop as origin; Haneda; VJ named', () => {
  const arr = parse('arr', 'domestic', 'today');
  const qf = byNum(arr, 'QF654');
  assert.ok(qf, 'QF654 present');
  assert.equal(qf.arrival.scheduledTime.local, '2026-09-15 06:05:00+10:00');
  assert.equal(qf.arrival.scheduledTime.utc, '2026-09-14 20:05:00+00:00');
  assert.equal(qf._authTs, 1789416300000);
  assert.equal(qf.status, 'scheduled');                                   // "On Time" with a 30-min-late estimate: the board derives delayed
  assert.equal(qf.arrival.revisedTime.local, '2026-09-15 06:35:00+10:00');
  assert.equal(qf.arrival.revisedTime.utc, '2026-09-14 20:35:00+00:00');
  assert.equal(qf.arrival.terminal, '3');
  assert.equal(qf.departure.airport.iata, 'PER');
  assert.equal(qf.departure.airport.name, 'Perth');
  assert.equal(qf.departure.revisedTime, undefined, 'revisedTime only on the home side');
  for (const cs of ['LA4825', '6E4858', 'AA7373', 'PX3046', 'EK5481', 'NZ7306', 'MH4415', 'AS5119']) {
    assert.equal(byNum(arr, cs), undefined, `${cs} is a codeshare on QF654`);
  }
  // JQ989 from Perth, T2, estimate 05:55 on a 06:15 schedule — an early revision, status untouched.
  const jq = byNum(arr, 'JQ989');
  assert.equal(jq.arrival.terminal, '2');
  assert.equal(jq.status, 'scheduled');
  assert.equal(jq.arrival.revisedTime.local, '2026-09-15 05:55:00+10:00');
  assert.ok(jq.arrival.revisedTime.utc < jq.arrival.scheduledTime.utc);
  // The Rex loop coming home: ["Sydney","Merimbula","Moruya"] → Moruya, the last stop before Sydney.
  const zl = byNum(arr, 'ZL6117');
  assert.ok(zl, 'ZL6117 present');
  assert.equal(zl.departure.airport.iata, 'MYA');
  assert.equal(zl.arrival.scheduledTime.local, '2026-09-15 12:25:00+10:00');
  assert.equal(zl._authTs, 1789439100000);
  assert.equal(byNum(arr, 'ZL6469').departure.airport.iata, 'GFF');        // ["Sydney","Narrandera","Griffith"]
  assert.equal(byNum(arr, 'QF791').departure.airport.iata, 'ASP');         // " Alice Springs"
  const intl = parse('arr', 'international', 'today');
  // QF2 London via Singapore lands from Singapore; AC33 Toronto via Vancouver from Vancouver; OD171 from Denpasar.
  const qf2 = byNum(intl, 'QF2');
  assert.ok(qf2, 'QF2 present');
  assert.equal(qf2.departure.airport.iata, 'SIN');
  assert.equal(qf2.departure.airport.name, 'Singapore');
  assert.equal(qf2.arrival.revisedTime.local, '2026-09-15 05:05:00+10:00');
  assert.equal(byNum(intl, 'AC33').departure.airport.iata, 'YVR');
  assert.equal(byNum(intl, 'OD171').departure.airport.iata, 'DPS');
  // Haneda is printed as the airport; the table knows it.
  const jl = byNum(intl, 'JL51');
  assert.ok(jl, 'JL51 present');
  assert.equal(jl.departure.airport.iata, 'HND');
  assert.equal(jl.departure.airport.name, 'Haneda');
  assert.equal(jl.arrival.terminal, '1');
  assert.equal(jl.arrival.revisedTime.local, '2026-09-15 05:56:00+10:00');
  assert.equal(jl.arrival.airline.name, 'Japan Airlines');
  // EK414: far out, estimatedTime "-" → no revision. SB140 → Nouméa. QF190 → Nuku'alofa.
  const ek = byNum(intl, 'EK414');
  assert.equal(ek.arrival.revisedTime, undefined);
  assert.equal(ek.arrival.scheduledTime.local, '2026-09-15 22:05:00+10:00');
  assert.equal(byNum(intl, 'SB140').departure.airport.iata, 'NOU');
  assert.equal(byNum(intl, 'QF190').departure.airport.iata, 'TBU');
  // VJ85 tomorrow comes nameless — VietJet Air.
  const vj = byNum(parse('arr', 'international', 'tomorrow'), 'VJ85');
  assert.ok(vj, 'VJ85 present');
  assert.equal(vj.arrival.airline.iata, 'VJ');
  assert.equal(vj.arrival.airline.name, 'VietJet Air');
  assert.equal(vj.departure.airport.iata, 'SGN');
  assert.equal(vj.departure.airport.name, 'Ho Chi Minh');
  assert.equal(vj.arrival.scheduledTime.local, '2026-09-16 07:20:00+10:00');
});

test('syd yesterday: Arrived carries on-blocks, most Departed rows print "-"; an estimate equal to the schedule is no revision', () => {
  const dep = parse('dep', 'domestic', 'yesterday');
  // Off-blocks reaches the feed on about a third of Departed rows; the rest show their scheduled time.
  const departed = dep.filter((x) => x.status === 'departed');
  assert.ok(departed.length > 100, `${departed.length} departed rows in the finished day`);
  assert.ok(departed.filter((x) => !x.departure.revisedTime).length > departed.filter((x) => x.departure.revisedTime).length, 'most Departed rows carry no clock');
  const qf500 = byNum(dep, 'QF500');
  assert.ok(qf500, 'QF500 present');
  assert.equal(qf500.status, 'departed');
  assert.equal(qf500.departure.scheduledTime.local, '2026-09-14 06:00:00+10:00');
  assert.equal(qf500.departure.scheduledTime.utc, '2026-09-13 20:00:00+00:00');
  assert.equal(qf500._authTs, 1789329600000);
  assert.equal(qf500.departure.revisedTime, undefined);                   // estimatedTime "-"
  assert.equal(qf500.departure.terminal, '3');
  assert.equal(qf500.arrival.airport.iata, 'BNE');
  const va901 = byNum(dep, 'VA901');                                      // estimatedTime 06:00 == scheduledTime
  assert.equal(va901.status, 'departed');
  assert.equal(va901.departure.revisedTime, undefined);
  assert.equal(byNum(dep, 'ZL6117').arrival.airport.iata, 'MYA');
  assert.equal(byNum(dep, 'ZL6117').status, 'departed');
  const arr = parse('arr', 'international', 'yesterday');
  const qf2 = byNum(arr, 'QF2');
  assert.ok(qf2, 'QF2 present');
  assert.equal(qf2.status, 'arrived');
  assert.equal(qf2.arrival.scheduledTime.local, '2026-09-14 05:10:00+10:00');
  assert.equal(qf2.arrival.revisedTime.local, '2026-09-14 05:14:00+10:00');   // on-blocks
  assert.equal(qf2._authTs, 1789326600000);
  assert.equal(qf2.departure.airport.iata, 'SIN');
  const vj = byNum(arr, 'VJ85');
  assert.equal(vj.status, 'arrived');
  assert.equal(vj.arrival.revisedTime.local, '2026-09-14 07:47:00+10:00');
  assert.equal(vj.arrival.airline.name, 'VietJet Air');
  assert.equal(byNum(arr, 'OD171').arrival.revisedTime.local, '2026-09-14 06:41:00+10:00');
  assert.ok(arr.every((x) => x.status === 'arrived' || x.status === 'cancelled'), 'a finished day is only Arrived / Cancelled');
  const arrived = arr.filter((x) => x.status === 'arrived');
  assert.ok(arrived.filter((x) => x.arrival.revisedTime).length > arrived.length * 0.9, 'nearly every Arrived row carries on-blocks');
});

test('syd: status vocabulary — the four live, the seven archived, whole-word sniffing, and scheduled for the rest', () => {
  assert.equal(sydStatus('On Time'), 'scheduled');
  assert.equal(sydStatus('Departed'), 'departed');
  assert.equal(sydStatus('Arrived'), 'arrived');
  assert.equal(sydStatus('Cancelled'), 'cancelled');
  assert.equal(sydStatus('Landed'), 'arrived');
  assert.equal(sydStatus('Delayed'), 'delayed');
  assert.equal(sydStatus('Gate Open'), 'boarding');
  assert.equal(sydStatus('Boarding'), 'boarding');
  assert.equal(sydStatus('Final Call'), 'boarding');
  assert.equal(sydStatus('Gate Closed'), 'gateclosed');
  assert.equal(sydStatus('Diverted'), 'diverted');
  assert.equal(sydStatus(' gate  closed '), 'gateclosed');
  assert.equal(sydStatus('Expected at 06:35'), 'scheduled');              // the detail endpoint's rewrite of On Time
  assert.equal(sydStatus('Cancelled - weather'), 'cancelled');
  assert.equal(sydStatus('Now Boarding'), 'boarding');
  assert.equal(sydStatus('Early'), 'scheduled');
  assert.equal(sydStatus('Delayed - weather'), 'delayed');
  assert.equal(sydStatus('Departed 10:05'), 'departed');
  assert.equal(sydStatus('Landed 10:05'), 'arrived');
  assert.equal(sydStatus(''), 'scheduled');
  assert.equal(sydStatus(null), 'scheduled');
  // Anything the map and the sniff do not know is scheduled — the raw text never reaches a board.
  for (const s of ['Retimed', 'Rescheduled', 'Go to Gate', 'Closing']) assert.equal(sydStatus(s), 'scheduled', s);
  // Whole words only: the check-in desk closing is not the gate, "Not Departed" is still on the ground,
  // "Landing" is not yet arrived.
  assert.equal(sydStatus('Check-in Closed'), 'scheduled');
  assert.equal(sydStatus('Not Departed'), 'scheduled');
  assert.equal(sydStatus('Landing'), 'scheduled');
  // Through the parser: a status the map has not seen is sniffed, never printed.
  const d = sydParseFeed(row({ status: 'Diverted to Canberra' }), 'dep', NOW);
  assert.equal(d[0].status, 'diverted');
  assert.equal(sydParseFeed(row({ status: 'Check-in Closed' }), 'dep', NOW)[0].status, 'scheduled');
});

test('syd: the offset follows the instant (AEST +10:00, AEDT +11:00 from 2026-10-04, the switch nights on the old one); estimates cross midnight', () => {
  // The Sunday after the switch: same wall clock, an hour earlier in UTC.
  const aedt = sydParseFeed(row({ scheduledDate: '2026-10-05', scheduledTime: '14:45' }), 'dep', NOW);
  assert.equal(aedt[0].departure.scheduledTime.local, '2026-10-05 14:45:00+11:00');
  assert.equal(aedt[0].departure.scheduledTime.utc, '2026-10-05 03:45:00+00:00');
  assert.equal(aedt[0]._authTs, Date.parse('2026-10-05T14:45:00+11:00'));
  const aest = sydParseFeed(row({ scheduledDate: '2026-10-03', scheduledTime: '14:45' }), 'dep', NOW);
  assert.equal(aest[0].departure.scheduledTime.local, '2026-10-03 14:45:00+10:00');
  assert.equal(aest[0].departure.scheduledTime.utc, '2026-10-03 04:45:00+00:00');
  // April: back to AEST after the first Sunday.
  const april = sydParseFeed(row({ scheduledDate: '2027-04-05', scheduledTime: '09:00' }), 'dep', NOW);
  assert.equal(april[0].departure.scheduledTime.local, '2027-04-05 09:00:00+10:00');
  // A dated estimate the next day is taken as written.
  const dated = sydParseFeed(row({ flightType: 'ARRIVAL', scheduledTime: '23:50', estimatedTime: '00:10', estimatedDate: '2026-09-16', status: 'Delayed' }), 'arr', NOW);
  assert.equal(dated[0].status, 'delayed');
  assert.equal(dated[0].arrival.scheduledTime.local, '2026-09-15 23:50:00+10:00');
  assert.equal(dated[0].arrival.revisedTime.local, '2026-09-16 00:10:00+10:00');
  assert.ok(dated[0].arrival.revisedTime.utc > dated[0].arrival.scheduledTime.utc);
  // …even 13 h out: a 20:00 departure re-timed to 09:00 the next morning (the curfew makes that real) keeps
  // the feed's date, while the same clock dateless settles to the schedule's own day — the two branches
  // diverge here, so ignoring estimatedDate cannot pass.
  const overnight = sydParseFeed(row({ scheduledTime: '20:00', estimatedTime: '09:00', estimatedDate: '2026-09-16', status: 'Delayed' }), 'dep', NOW);
  assert.equal(overnight[0].departure.revisedTime.local, '2026-09-16 09:00:00+10:00');
  assert.equal(overnight[0].departure.revisedTime.utc, '2026-09-15 23:00:00+00:00');
  const overnightDateless = sydParseFeed(row({ scheduledTime: '20:00', estimatedTime: '09:00', estimatedDate: '-', status: 'Delayed' }), 'dep', NOW);
  assert.equal(overnightDateless[0].departure.revisedTime.local, '2026-09-15 09:00:00+10:00');
  // An estimate dated the schedule's OWN day is settled like a dateless one: a 00:10 wrapped under the 23:50
  // schedule's date is 20 minutes late, never a day early (the capture never showed a cross-midnight estimate,
  // so which way the feed writes one is unknown; both ways now land on the 16th).
  const wrapped = sydParseFeed(row({ flightType: 'ARRIVAL', scheduledTime: '23:50', estimatedTime: '00:10', estimatedDate: '2026-09-15', status: 'Delayed' }), 'arr', NOW);
  assert.equal(wrapped[0].arrival.revisedTime.local, '2026-09-16 00:10:00+10:00');
  assert.equal(wrapped[0].arrival.revisedTime.utc, '2026-09-15 14:10:00+00:00');
  assert.ok(wrapped[0].arrival.revisedTime.utc > wrapped[0].arrival.scheduledTime.utc);
  // A dateless estimate (estimatedDate "-") settles toward the schedule: 00:10 on a 23:50 flight is 20 minutes late, not a day early.
  const dateless = sydParseFeed(row({ flightType: 'ARRIVAL', scheduledTime: '23:50', estimatedTime: '00:10', estimatedDate: '-' }), 'arr', NOW);
  assert.equal(dateless[0].arrival.revisedTime.local, '2026-09-16 00:10:00+10:00');
  // …and 23:30 on a 00:10 flight is 40 minutes early, the evening before — dateless or dated the schedule's day.
  const early = sydParseFeed(row({ flightType: 'ARRIVAL', scheduledDate: '2026-09-16', scheduledTime: '00:10', estimatedTime: '23:30', estimatedDate: '-' }), 'arr', NOW);
  assert.equal(early[0].arrival.revisedTime.local, '2026-09-15 23:30:00+10:00');
  const earlySameDay = sydParseFeed(row({ flightType: 'ARRIVAL', scheduledDate: '2026-09-16', scheduledTime: '00:10', estimatedTime: '23:30', estimatedDate: '2026-09-16' }), 'arr', NOW);
  assert.equal(earlySameDay[0].arrival.revisedTime.local, '2026-09-15 23:30:00+10:00');
  // An estimate equal to the schedule is no revision, dated or not.
  assert.equal(sydParseFeed(row({ estimatedTime: '10:00', estimatedDate: '2026-09-15' }), 'dep', NOW)[0].departure.revisedTime, undefined);
  assert.equal(sydParseFeed(row({ estimatedTime: '10:00', estimatedDate: '-' }), 'dep', NOW)[0].departure.revisedTime, undefined);
  // Across the switch on the day itself: a 09:00 departure on 2026-10-04 is already AEDT.
  const switchDay = sydParseFeed(row({ scheduledDate: '2026-10-04', scheduledTime: '09:00' }), 'dep', NOW);
  assert.equal(switchDay[0].departure.scheduledTime.local, '2026-10-04 09:00:00+11:00');
  // The switch night itself, before the clocks move: 01:30 on 2026-10-04 is still AEST (+10:00, 15:30Z), not
  // the day's +11:00 — the date's offset is only a guess the instant corrects. 03:00 is the first AEDT hour;
  // 02:30 never happens that night and resolves to the instant an hour on.
  const preOct = sydParseFeed(row({ scheduledDate: '2026-10-04', scheduledTime: '01:30' }), 'dep', NOW);
  assert.equal(preOct[0].departure.scheduledTime.local, '2026-10-04 01:30:00+10:00');
  assert.equal(preOct[0].departure.scheduledTime.utc, '2026-10-03 15:30:00+00:00');
  assert.equal(preOct[0]._authTs, Date.parse('2026-10-04T01:30:00+10:00'));
  assert.equal(sydParseFeed(row({ scheduledDate: '2026-10-04', scheduledTime: '00:10' }), 'dep', NOW)[0].departure.scheduledTime.utc, '2026-10-03 14:10:00+00:00');
  assert.equal(sydParseFeed(row({ scheduledDate: '2026-10-04', scheduledTime: '03:00' }), 'dep', NOW)[0].departure.scheduledTime.local, '2026-10-04 03:00:00+11:00');
  assert.equal(sydParseFeed(row({ scheduledDate: '2026-10-04', scheduledTime: '03:00' }), 'dep', NOW)[0].departure.scheduledTime.utc, '2026-10-03 16:00:00+00:00');
  assert.equal(sydParseFeed(row({ scheduledDate: '2026-10-04', scheduledTime: '02:30' }), 'dep', NOW)[0].departure.scheduledTime.utc, '2026-10-03 16:30:00+00:00');
  // April the other way: 01:30 on 2027-04-04 is still AEDT (+11:00, 14:30Z); 03:00 is AEST; the repeated 02:30
  // is its second occurrence.
  const preApr = sydParseFeed(row({ scheduledDate: '2027-04-04', scheduledTime: '01:30' }), 'dep', NOW);
  assert.equal(preApr[0].departure.scheduledTime.local, '2027-04-04 01:30:00+11:00');
  assert.equal(preApr[0].departure.scheduledTime.utc, '2027-04-03 14:30:00+00:00');
  assert.equal(sydParseFeed(row({ scheduledDate: '2027-04-04', scheduledTime: '03:00' }), 'dep', NOW)[0].departure.scheduledTime.local, '2027-04-04 03:00:00+10:00');
  assert.equal(sydParseFeed(row({ scheduledDate: '2027-04-04', scheduledTime: '03:00' }), 'dep', NOW)[0].departure.scheduledTime.utc, '2027-04-03 17:00:00+00:00');
  assert.equal(sydParseFeed(row({ scheduledDate: '2027-04-04', scheduledTime: '02:30' }), 'dep', NOW)[0].departure.scheduledTime.utc, '2027-04-03 16:30:00+00:00');
  // A late-evening flight whose estimate slips past midnight into the switch keeps its true delay: 23:50 on
  // the 3rd estimated 00:40 on the 4th is 50 minutes late, not 10 early; 01:10 is 80 late, not 20.
  const mins = (f) => (Date.parse(f.departure.revisedTime.utc.replace(' ', 'T')) - Date.parse(f.departure.scheduledTime.utc.replace(' ', 'T'))) / 60000;
  const straddle = sydParseFeed(row({ scheduledDate: '2026-10-03', scheduledTime: '23:50', estimatedTime: '00:40', estimatedDate: '2026-10-04', status: 'Delayed' }), 'dep', NOW);
  assert.equal(straddle[0].departure.scheduledTime.utc, '2026-10-03 13:50:00+00:00');
  assert.equal(straddle[0].departure.revisedTime.local, '2026-10-04 00:40:00+10:00');
  assert.equal(straddle[0].departure.revisedTime.utc, '2026-10-03 14:40:00+00:00');
  assert.equal(mins(straddle[0]), 50);
  const straddle2 = sydParseFeed(row({ scheduledDate: '2026-10-03', scheduledTime: '23:50', estimatedTime: '01:10', estimatedDate: '2026-10-04', status: 'Delayed' }), 'dep', NOW);
  assert.equal(straddle2[0].departure.revisedTime.local, '2026-10-04 01:10:00+10:00');
  assert.equal(mins(straddle2[0]), 80);
  // …and the April night: 23:50 AEDT on the 3rd estimated 00:30 on the 4th is 40 late, not 100.
  const straddleApr = sydParseFeed(row({ scheduledDate: '2027-04-03', scheduledTime: '23:50', estimatedTime: '00:30', estimatedDate: '2027-04-04', status: 'Delayed' }), 'dep', NOW);
  assert.equal(straddleApr[0].departure.scheduledTime.utc, '2027-04-03 12:50:00+00:00');
  assert.equal(straddleApr[0].departure.revisedTime.local, '2027-04-04 00:30:00+11:00');
  assert.equal(straddleApr[0].departure.revisedTime.utc, '2027-04-03 13:30:00+00:00');
  assert.equal(mins(straddleApr[0]), 40);
});

test('syd: routing — unknown city keeps its name, Sydney-only and empty routings are dropped, numbers normalise', () => {
  const unknown = sydParseFeed(row({ destinations: ['Atlantis'] }), 'dep', NOW);
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].arrival.airport.iata, null);
  assert.equal(unknown[0].arrival.airport.name, 'Atlantis');
  // Whitespace is squashed before the lookup; the name is printed clean.
  const spaced = sydParseFeed(row({ destinations: ['  Alice   Springs '] }), 'dep', NOW);
  assert.equal(spaced[0].arrival.airport.iata, 'ASP');
  assert.equal(spaced[0].arrival.airport.name, 'Alice Springs');
  // First non-Sydney on a departure, last on an arrival — whatever slot Sydney sits in. On a loop both boards
  // therefore show the last outstation (Moruya for SYD→MIM→MYA→SYD), never the first stop.
  assert.equal(sydParseFeed(row({ destinations: ['Sydney', 'Moruya', 'Merimbula'] }), 'dep', NOW)[0].arrival.airport.iata, 'MYA');
  assert.equal(sydParseFeed(row({ flightType: 'ARRIVAL', destinations: ['Sydney', 'Merimbula', 'Moruya'] }), 'arr', NOW)[0].departure.airport.iata, 'MYA');
  assert.equal(sydParseFeed(row({ flightType: 'ARRIVAL', destinations: ['London', 'Singapore'] }), 'arr', NOW)[0].departure.airport.iata, 'SIN');
  assert.equal(sydParseFeed(row({ destinations: ['London', 'Singapore'] }), 'dep', NOW)[0].arrival.airport.iata, 'LHR');
  assert.equal(sydParseFeed(row({ destinations: ['Merimbula', 'SYDNEY '] }), 'dep', NOW)[0].arrival.airport.iata, 'MIM');
  // Nothing but Sydney, or nothing at all: no row.
  assert.deepEqual(sydParseFeed(row({ destinations: ['Sydney'] }), 'dep', NOW), []);
  assert.deepEqual(sydParseFeed(row({ destinations: ['Sydney', ' sydney'] }), 'dep', NOW), []);
  assert.deepEqual(sydParseFeed(row({ destinations: [] }), 'dep', NOW), []);
  assert.deepEqual(sydParseFeed(row({ destinations: null }), 'dep', NOW), []);
  // "Sydney" never routes through the Atlantic table's SYDNEY (Cape Breton), and the far side is never SYD.
  assert.ok(!sydParseFeed(row({ destinations: ['Sydney', 'Moruya'] }), 'dep', NOW).some((x) => ['SYD', 'YQY'].includes(x.arrival.airport.iata)));
  // The table is terminal: a name the Atlantic table resolves (Halifax → YHZ there) gets no code here, only
  // its name; bare "Hamilton" is neither Hamilton Island nor Ontario.
  const halifax = sydParseFeed(row({ destinations: ['Halifax'] }), 'dep', NOW)[0];
  assert.equal(halifax.arrival.airport.iata, null);
  assert.equal(halifax.arrival.airport.name, 'Halifax');
  const hamilton = sydParseFeed(row({ destinations: ['Hamilton'] }), 'dep', NOW)[0];
  assert.equal(hamilton.arrival.airport.iata, null);
  assert.equal(hamilton.arrival.airport.name, 'Hamilton');
  assert.equal(sydParseFeed(row({ destinations: ['Hamilton Island'] }), 'dep', NOW)[0].arrival.airport.iata, 'HTI');
  // Numbers: leading zeros off, spaces out, a letter suffix ignored; airlineCode wins for the carrier.
  assert.equal(sydParseFeed(row({ flightNumbers: ['QF 0001', 'EK5003'], airlineCode: 'QF' }), 'dep', NOW)[0].number, 'QF1');
  assert.equal(sydParseFeed(row({ flightNumbers: ['fp823z'], airlineCode: 'FP', airline: '' }), 'dep', NOW)[0].number, 'FP823');
  assert.equal(sydParseFeed(row({ flightNumbers: ['fp823z'], airlineCode: 'FP', airline: '' }), 'dep', NOW)[0].departure.airline.name, 'FlyPelican');
  assert.equal(sydParseFeed(row({ flightNumbers: ['QF1'], airlineCode: '' }), 'dep', NOW)[0].departure.airline.iata, 'QF');
  // …and over the number's own prefix when the two differ (the wet-lease shape the capture never showed).
  const wet = sydParseFeed(row({ flightNumbers: ['QF2000'], airlineCode: 'ZL' }), 'dep', NOW)[0];
  assert.equal(wet.departure.airline.iata, 'ZL');
  assert.equal(wet.number, 'QF2000');
  // Terminal: the digit, whatever the case; none when the feed leaves it out.
  assert.equal(sydParseFeed(row({ terminalNumber: 't1' }), 'dep', NOW)[0].departure.terminal, '1');
  assert.equal(sydParseFeed(row({ terminalNumber: '' }), 'dep', NOW)[0].departure.terminal, undefined);
  assert.equal(sydParseFeed(row({ flightType: 'ARRIVAL', terminalNumber: 'T3' }), 'arr', NOW)[0].arrival.terminal, '3');
  assert.equal(sydParseFeed(row({ flightType: 'ARRIVAL', terminalNumber: 'T3' }), 'arr', NOW)[0].departure.terminal, undefined);
});

test('syd: the routes pre-seeded from the airport\'s destination list resolve to the codes intended', () => {
  // None of these printed in the capture, so a typo in any would otherwise pass unseen.
  const seeded = {
    'Cooma': 'OOM', 'Busselton': 'BQB', 'Noumea': 'NOU', 'Papeete': 'PPT', 'Ho Chi Minh City': 'SGN',
    'Sapporo': 'CTS', 'New Chitose': 'CTS', 'Chitose': 'CTS', 'Shenzhen': 'SZX', "Xi'an": 'XIY', 'Wuhan': 'WUH',
    'Bengaluru': 'BLR', 'Bangalore': 'BLR', 'Colombo': 'CMB', 'Houston': 'IAH', 'Las Vegas': 'LAS'
  };
  for (const [name, iata] of Object.entries(seeded)) {
    const f = sydParseFeed(row({ destinations: [name] }), 'dep', NOW)[0];
    assert.equal(f.arrival.airport.iata, iata, name);
    assert.equal(f.arrival.airport.name, name);
  }
});

test('syd: day files follow the Sydney clock around midnight, the 06:00 curfew lift and the DST switch', () => {
  assert.deepEqual(sydFeedDays(Date.parse('2026-09-15T01:30:00+10:00')), ['2026-09-14', '2026-09-15']);
  assert.deepEqual(sydFeedDays(Date.parse('2026-09-15T02:00:00+10:00')), ['2026-09-15']);
  assert.deepEqual(sydFeedDays(NOW), ['2026-09-15']);                                   // 02:15, the capture moment
  assert.deepEqual(sydFeedDays(Date.parse('2026-09-15T05:59:00+10:00')), ['2026-09-15']);
  assert.deepEqual(sydFeedDays(Date.parse('2026-09-15T06:00:00+10:00')), ['2026-09-15', '2026-09-16']);
  assert.deepEqual(sydFeedDays(Date.parse('2026-09-15T09:00:00+10:00')), ['2026-09-15', '2026-09-16']);
  assert.deepEqual(sydFeedDays(Date.parse('2026-09-15T23:30:00+10:00')), ['2026-09-15', '2026-09-16']);
  // 14:30Z is already 00:30 on the 16th in Sydney — the UTC date would ask for the wrong day.
  assert.deepEqual(sydFeedDays(Date.parse('2026-09-15T14:30:00Z')), ['2026-09-15', '2026-09-16']);
  assert.deepEqual(sydFeedDays(Date.parse('2026-09-15T12:00:00Z')), ['2026-09-15', '2026-09-16']);   // 22:00 local
  // The switch day, 2026-10-04: 01:30 is still AEST (yesterday + today), 09:00 is AEDT (today + tomorrow).
  assert.deepEqual(sydFeedDays(Date.parse('2026-10-04T01:30:00+10:00')), ['2026-10-03', '2026-10-04']);
  assert.deepEqual(sydFeedDays(Date.parse('2026-10-04T09:00:00+11:00')), ['2026-10-04', '2026-10-05']);
  assert.deepEqual(sydFeedDays(Date.parse('2026-10-05T05:59:00+11:00')), ['2026-10-05']);
  assert.deepEqual(sydFeedDays(Date.parse('2026-10-05T06:00:00+11:00')), ['2026-10-05', '2026-10-06']);
});

test('syd: the slices one direction fetches — both terminal types for every day file, two or four GETs, never six', () => {
  const base = 'https://www.sydneyairport.com.au/_a/flights?flightType=';
  const lone = sydSlices('dep', NOW);                                                     // 02:15: today alone
  assert.deepEqual(lone.map((s) => s.key), ['syd/2026-09-15/dep/international', 'syd/2026-09-15/dep/domestic']);
  assert.deepEqual(lone.map((s) => s.url), [
    `${base}departure&terminalType=international&date=2026-09-15`,
    `${base}departure&terminalType=domestic&date=2026-09-15`
  ]);
  const early = sydSlices('dep', Date.parse('2026-09-15T01:30:00+10:00'));               // yesterday rides along
  assert.deepEqual(early.map((s) => s.key), [
    'syd/2026-09-14/dep/international', 'syd/2026-09-14/dep/domestic',
    'syd/2026-09-15/dep/international', 'syd/2026-09-15/dep/domestic'
  ]);
  const day = sydSlices('arr', Date.parse('2026-09-15T09:00:00+10:00'));                 // tomorrow rides along
  assert.deepEqual(day.map((s) => s.key), [
    'syd/2026-09-15/arr/international', 'syd/2026-09-15/arr/domestic',
    'syd/2026-09-16/arr/international', 'syd/2026-09-16/arr/domestic'
  ]);
  assert.deepEqual(day.map((s) => s.url), [
    `${base}arrival&terminalType=international&date=2026-09-15`, `${base}arrival&terminalType=domestic&date=2026-09-15`,
    `${base}arrival&terminalType=international&date=2026-09-16`, `${base}arrival&terminalType=domestic&date=2026-09-16`
  ]);
  // Yesterday and tomorrow are never asked for together, so a direction is two or four GETs at every hour.
  for (let h = 0; h < 24; h++) {
    const n = sydSlices('dep', Date.parse(`2026-09-15T${String(h).padStart(2, '0')}:30:00+10:00`)).length;
    assert.ok(n === 2 || n === 4, `${h}:30 → ${n} slices`);
  }
});

test('syd list(): the direction is whole or nothing — one dead slice fails it rather than serving half the airport', async () => {
  // fetchAuthorityText wants the Worker's cache and fetch; both are stubbed here and restored after.
  const saved = { caches: globalThis.caches, fetch: globalThis.fetch, now: Date.now };
  const calls = [], puts = [];
  let failIntl = false;
  globalThis.caches = { default: {
    match: async () => undefined,
    put: async (req, res) => puts.push({ url: req.url, neg: res.headers.get('X-Auth-Neg'), cc: res.headers.get('Cache-Control') })
  } };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u);
    if (failIntl && u.searchParams.get('terminalType') === 'international') return new Response('<html>502 Bad Gateway</html>', { status: 502 });
    // The today capture whatever day is asked: rows carry their own date, so the second day file is the
    // same flights again and the number|_authTs dedupe must fold them.
    return new Response(fx(`syd-${u.searchParams.get('flightType')}-${u.searchParams.get('terminalType')}-today.json`), { status: 200 });
  };
  Date.now = () => Date.parse('2026-09-15T09:00:00+10:00');                              // today + tomorrow: four slices
  try {
    const list = _authorityHandlers.syd.list;
    const dep = await list('dep', {});
    assert.equal(calls.length, 4, 'one GET per slice');
    assert.ok(calls.every((u) => u.origin + u.pathname === 'https://www.sydneyairport.com.au/_a/flights' && u.searchParams.get('flightType') === 'departure'));
    assert.deepEqual(calls.map((u) => `${u.searchParams.get('date')}/${u.searchParams.get('terminalType')}`),
      ['2026-09-15/international', '2026-09-15/domestic', '2026-09-16/international', '2026-09-16/domestic']);
    assert.equal(dep.length, 381, '99 international + 282 domestic, the second day file deduped away');
    const terms = {};
    for (const f of dep) terms[f.departure.terminal] = (terms[f.departure.terminal] || 0) + 1;
    assert.deepEqual(terms, { '1': 99, '2': 128, '3': 154 }, 'T1 international, T2 Virgin/Jetstar/Rex, T3 Qantas all present');
    assert.equal(puts.length, 4);
    assert.ok(puts.every((p) => !p.neg && p.cc === 'public, max-age=90'), 'every slice cached as an answer for the TTL');
    calls.length = 0; puts.length = 0;
    const arr = await list('arr', {});
    assert.equal(arr.length, 381);
    assert.ok(arr.every((f) => f.arrival.airport.iata === 'SYD' && f.departure.airport.iata !== 'SYD'));
    assert.ok(calls.every((u) => u.searchParams.get('flightType') === 'arrival'));
    // The international slice answers 502: the direction is null (the client keeps its last-good board), the
    // dead slice is negative-cached for 30 s so the retry costs nothing, and nothing further is fetched.
    failIntl = true; calls.length = 0; puts.length = 0;
    assert.equal(await list('dep', {}), null);
    assert.equal(calls.length, 1, 'fails on the first dead slice');
    assert.deepEqual(puts.map((p) => [p.url, p.neg, p.cc]), [['https://authority-feeds/syd/2026-09-15/dep/international', '1', 'public, max-age=30']]);
  } finally {
    globalThis.caches = saved.caches; globalThis.fetch = saved.fetch; Date.now = saved.now;
  }
});

test('syd: garbage in, empty out', () => {
  assert.deepEqual(sydParseFeed('', 'dep', NOW), []);
  assert.deepEqual(sydParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(sydParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(sydParseFeed('[]', 'arr', NOW), []);
  assert.deepEqual(sydParseFeed('null', 'arr', NOW), []);
  assert.deepEqual(sydParseFeed('{"totalFlightCount":0,"flightData":[]}', 'dep', NOW), []);
  assert.deepEqual(sydParseFeed('{"flightData":[{"id":1}]}', 'dep', NOW), []);
  assert.deepEqual(sydParseFeed('{"flightData":[null, 7, "x"]}', 'arr', NOW), []);
  assert.deepEqual(sydParseFeed(row({ flightNumbers: [] }), 'dep', NOW), []);
  assert.deepEqual(sydParseFeed(row({ flightNumbers: ['nope'] }), 'dep', NOW), []);
  assert.deepEqual(sydParseFeed(row({ scheduledDate: '-' }), 'dep', NOW), []);
  assert.deepEqual(sydParseFeed(row({ scheduledTime: '-' }), 'dep', NOW), []);
  assert.deepEqual(sydParseFeed(row({ flightType: 'CARGO' }), 'dep', NOW), []);
  assert.deepEqual(sydParseFeed(row({ flightType: '' }), 'arr', NOW), [], 'a row with no flightType is not an arrival');
});

test('syd: registered in the worker and offered by every picker', () => {
  const worker = readFileSync(new URL('../workers/fids-proxy.js', import.meta.url), 'utf8');
  assert.ok(worker.includes('\n  syd: { tz: "Australia/Sydney", source: "syd-authority", list: async (dir, env) => {'), 'registry entry in the shape live-airports.test.js reads');
  assert.ok(worker.includes('`syd/${day}/${dir}/${terminalType}`'), 'one edge-cache key per day, direction and terminal slice');
  assert.ok(worker.includes('https://www.sydneyairport.com.au/_a/flights?flightType=${flightType}&terminalType=${terminalType}&date=${day}'));
  assert.equal(_authorityRosterHas('SYD'), true);
  assert.equal(_authorityRosterHas('syd'), true);
  const core = readFileSync(new URL('../fids-current/js/fids-core.js', import.meta.url), 'utf8');
  const s = core.indexOf('const FIDS_LIVE_AIRPORTS = new Set([');
  const live = [...core.slice(s, core.indexOf(']);', s)).matchAll(/'([A-Z0-9]{3})'/g)].map((m) => m[1]);
  assert.ok(live.includes('SYD'), 'the board picker offers SYD');
  assert.equal(live.filter((c) => c === 'SYD').length, 1);
  // The build tag is not pinned here: gate-stability.test.js reads it and holds the busters to it.
  const app = readFileSync(new URL('../fids-current/app.html', import.meta.url), 'utf8');
  assert.match(app, /\n\s*SYD:\{n:'Sydney',tz:'Australia\/Sydney',r:'INT'\}/, 'the mobile catalogue row — without it the Set alone never shows Sydney');
  const rot = readFileSync(new URL('../fids-current/rotate.html', import.meta.url), 'utf8');
  const r = rot.indexOf('var ROSTER = [');
  assert.ok(rot.slice(r, rot.indexOf('];', r)).includes("'SYD'"), 'the rotator roster knows SYD');
});
