// SYD Sydney Kingsford Smith — sydneyairport.com.au/_a/flights JSON against
// twelve verbatim captures (2026-09-14T16:15Z = 02:15 AEST 2026-09-15:
// departure/arrival × international/domestic × yesterday/today/tomorrow,
// 2,385 rows; headers in syd-capture-headers.txt). Pins: wall-clock
// "HH:MM" + "YYYY-MM-DD" read in Australia/Sydney with the offset derived
// per date (+10:00 on the capture, +11:00 once AEDT starts 2026-10-04);
// estimatedTime "-" as no revision and an estimate equal to the schedule
// as none either; the four live statuses and the seven archived ones;
// flightNumbers[0] as the one row (QF654's nine codeshares never
// surface); destinations[] as routing — first non-Sydney city on a
// departure, last on an arrival, Rex's "Sydney" slot skipped and no
// SYD→SYD row ever; terminalNumber T1/T2/T3 as the digit; the three
// nameless carriers named; the hand-keyed city table incl. the leading
// space on " Alice Springs", Haneda, Avalon and Newcastle (NSW); the
// day-file selection around midnight, 06:00 and the DST switch; and the
// registration points the picker tests read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sydParseFeed, sydFeedDays, sydStatus, _authorityRosterHas } from '../workers/fids-proxy.js';

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
  // ZL6117 SYD–Moruya–Merimbula–SYD prints ["Sydney","Moruya","Merimbula"]: Sydney skipped, first stop shown.
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

test('syd yesterday: Departed and Arrived keep the actual clock; an estimate equal to the schedule is no revision', () => {
  const dep = parse('dep', 'domestic', 'yesterday');
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
});

test('syd: status vocabulary — the four live, the seven archived, and the text fallback', () => {
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
  assert.equal(sydStatus(''), 'scheduled');
  assert.equal(sydStatus(null), 'scheduled');
  // Through the parser: a status the map has not seen still lands on the text.
  const d = sydParseFeed(row({ status: 'Diverted to Canberra' }), 'dep', NOW);
  assert.equal(d[0].status, 'diverted');
});

test('syd: the offset follows the date (AEST +10:00, AEDT +11:00 from 2026-10-04); estimates cross midnight', () => {
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
  // A dateless estimate (estimatedDate "-") settles toward the schedule: 00:10 on a 23:50 flight is 20 minutes late, not a day early.
  const dateless = sydParseFeed(row({ flightType: 'ARRIVAL', scheduledTime: '23:50', estimatedTime: '00:10', estimatedDate: '-' }), 'arr', NOW);
  assert.equal(dateless[0].arrival.revisedTime.local, '2026-09-16 00:10:00+10:00');
  // …and 23:30 on a 00:10 flight is 40 minutes early, the evening before.
  const early = sydParseFeed(row({ flightType: 'ARRIVAL', scheduledDate: '2026-09-16', scheduledTime: '00:10', estimatedTime: '23:30', estimatedDate: '-' }), 'arr', NOW);
  assert.equal(early[0].arrival.revisedTime.local, '2026-09-15 23:30:00+10:00');
  // An estimate equal to the schedule is no revision, dated or not.
  assert.equal(sydParseFeed(row({ estimatedTime: '10:00', estimatedDate: '2026-09-15' }), 'dep', NOW)[0].departure.revisedTime, undefined);
  assert.equal(sydParseFeed(row({ estimatedTime: '10:00', estimatedDate: '-' }), 'dep', NOW)[0].departure.revisedTime, undefined);
  // Across the switch on the day itself: a 09:00 departure on 2026-10-04 is already AEDT.
  const switchDay = sydParseFeed(row({ scheduledDate: '2026-10-04', scheduledTime: '09:00' }), 'dep', NOW);
  assert.equal(switchDay[0].departure.scheduledTime.local, '2026-10-04 09:00:00+11:00');
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
  // First non-Sydney on a departure, last on an arrival — whatever slot Sydney sits in.
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
  // Numbers: leading zeros off, spaces out, a letter suffix ignored; airlineCode wins for the carrier.
  assert.equal(sydParseFeed(row({ flightNumbers: ['QF 0001', 'EK5003'], airlineCode: 'QF' }), 'dep', NOW)[0].number, 'QF1');
  assert.equal(sydParseFeed(row({ flightNumbers: ['fp823z'], airlineCode: 'FP', airline: '' }), 'dep', NOW)[0].number, 'FP823');
  assert.equal(sydParseFeed(row({ flightNumbers: ['fp823z'], airlineCode: 'FP', airline: '' }), 'dep', NOW)[0].departure.airline.name, 'FlyPelican');
  assert.equal(sydParseFeed(row({ flightNumbers: ['QF1'], airlineCode: '' }), 'dep', NOW)[0].departure.airline.iata, 'QF');
  // Terminal: the digit, whatever the case; none when the feed leaves it out.
  assert.equal(sydParseFeed(row({ terminalNumber: 't1' }), 'dep', NOW)[0].departure.terminal, '1');
  assert.equal(sydParseFeed(row({ terminalNumber: '' }), 'dep', NOW)[0].departure.terminal, undefined);
  assert.equal(sydParseFeed(row({ flightType: 'ARRIVAL', terminalNumber: 'T3' }), 'arr', NOW)[0].arrival.terminal, '3');
  assert.equal(sydParseFeed(row({ flightType: 'ARRIVAL', terminalNumber: 'T3' }), 'arr', NOW)[0].departure.terminal, undefined);
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
  assert.match(core, /var FIDS_BUILD_TAG = 'v23772';/);
  const app = readFileSync(new URL('../fids-current/app.html', import.meta.url), 'utf8');
  assert.match(app, /\n\s*SYD:\{n:'Sydney',tz:'Australia\/Sydney',r:'INT'\}/, 'the mobile catalogue row — without it the Set alone never shows Sydney');
  const rot = readFileSync(new URL('../fids-current/rotate.html', import.meta.url), 'utf8');
  const r = rot.indexOf('var ROSTER = [');
  assert.ok(rot.slice(r, rot.indexOf('];', r)).includes("'SYD'"), 'the rotator roster knows SYD');
});
