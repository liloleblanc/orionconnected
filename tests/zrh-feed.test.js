// ZRH Zürich — flightdata.flughafen-zuerich.ch ?date= JSON against a
// verbatim capture (2026-09-06 08:17:56 CEST, both directions, 871 rows).
// Pins: Z-times to Zürich wall clock (CEST +02:00); the actual outranking
// the estimate and only a different MINUTE counting as a revision (an
// on-block 05:50:12 on a 05:50 schedule is on time); "Gate Info at
// 19:10" NOT read as a revised clock; the numeric status vocabulary
// (Rolling splitting by direction); GA/ferry/cargo rows dropped; easyJet's
// ICAO-form FLCs (EZY/EZS/EJU) rekeyed to U2 with the callsign kept; the
// IATA sub-type winning over the feed's wrong `model`; RTK as the belt,
// TER (arrivals) / CAM check-in area (departures) as terminal; and the
// day-file selection around midnight and the 06:00 first wave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zrhParseFeed, zrhFeedDays, zrhStatus } from '../workers/fids-proxy.js';

const fix = readFileSync(new URL('./fixtures/zrh-sample-2026-09-06.json', import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T08:17:56+02:00');
const raw = JSON.parse(fix);
const byNum = (list, n) => list.find((x) => x.number === n);

test('zrh departures: every commercial D row, nothing else; home side is ZRH', () => {
  const dep = zrhParseFeed(fix, 'dep', NOW);
  const want = raw.filter((r) => r.flightType === 'D' && r.isCommercial === true && r.FLC !== 'XXC' && r.statusCode !== 10).length;
  assert.equal(dep.length, want, `parsed ${dep.length}, fixture has ${want} commercial departures`);
  assert.equal(dep.length, 387);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'ZRH' && x.departure.airport.icao === 'LSZH'));
  assert.ok(dep.every((x) => !x.number.startsWith('XXC')), 'placeholder carrier never surfaces');
  assert.ok(dep.every((x) => x.departure.baggageBelt === undefined && x.arrival.baggageBelt === undefined));
  assert.ok(dep.every((x) => x.departure.scheduledTime.local.endsWith('+02:00')), 'CEST offset on every row');
  // LX5024 (a 5000-series ferry leg, cancelled) is isCommercial=false in the capture — dropped.
  assert.equal(byNum(dep, 'LX5024'), undefined);
  // KE568 is Korean Air Cargo (statusCode 10 "Cargo", isCommercial=false) — dropped.
  assert.equal(byNum(dep, 'KE568'), undefined);
});

test('zrh departures: LX562 — Z schedule to CEST, ATD (with seconds) as the revision, gate/check-in area/type/tail', () => {
  const dep = zrhParseFeed(fix, 'dep', NOW);
  const lx = byNum(dep, 'LX562');
  assert.ok(lx, 'LX562 present');
  assert.equal(lx.status, 'departed');
  assert.equal(lx.departure.scheduledTime.local, '2026-09-06 07:15:00+02:00');   // STD 05:15Z
  assert.equal(lx.departure.scheduledTime.utc, '2026-09-06 05:15:00+00:00');
  assert.equal(lx._authTs, Date.parse('2026-09-06T05:15:00Z'));
  assert.equal(lx.departure.revisedTime.local, '2026-09-06 07:39:00+02:00');     // ATD 05:39:23Z, floored
  assert.equal(lx.departure.revisedTime.utc, '2026-09-06 05:39:00+00:00');
  assert.equal(lx.departure.gate, 'A57');
  assert.equal(lx.departure.terminal, '1');                                       // CAM check-in 1
  assert.equal(lx.arrival.airport.iata, 'NCE');
  assert.equal(lx.arrival.airport.name, 'Nice');
  assert.equal(lx.arrival.gate, undefined);
  assert.equal(lx.departure.airline.iata, 'LX');
  assert.equal(lx.departure.airline.name, 'SWISS');
  assert.equal(lx.aircraft.model, '290');                                         // TYS, an IATA sub-type
  assert.equal(lx.aircraft.reg, 'HBAZF');
  assert.equal(lx.callSign, null);
  assert.equal(lx.codeshareStatus, 'IsOperator');
  assert.equal(lx.isCargo, false);
});

test('zrh departures: the actual outranks the estimate; the status vocabulary maps by code', () => {
  const dep = zrhParseFeed(fix, 'dep', NOW);
  const fi = byNum(dep, 'FI571');                 // ETD 05:45Z, ATD 05:51:37Z
  assert.ok(fi, 'FI571 present');
  assert.equal(fi.departure.revisedTime.local, '2026-09-06 07:51:00+02:00');
  assert.equal(fi.departure.gate, 'A75');
  assert.equal(fi.departure.terminal, '2');
  assert.equal(fi.arrival.airport.iata, 'KEF');
  const lh = byNum(dep, 'LH1183');                // 2 Closed, ETD 06:20Z
  assert.equal(lh.status, 'gateclosed');
  assert.equal(lh.departure.revisedTime.local, '2026-09-06 08:20:00+02:00');
  assert.equal(lh.departure.gate, 'A66');
  const lx750 = byNum(dep, 'LX750');              // 3 Boarding, no estimate
  assert.equal(lx750.status, 'boarding');
  assert.equal(lx750.departure.revisedTime, undefined);
  assert.equal(lx750.departure.gate, 'B41');
  const lx1660 = byNum(dep, 'LX1660');            // 13 Go to Gate, ETD 06:45Z
  assert.equal(lx1660.status, 'boarding');
  assert.equal(lx1660.departure.revisedTime.local, '2026-09-06 08:45:00+02:00');
  const lx976 = byNum(dep, 'LX976');              // 200 Rolling on a departure = off blocks
  assert.equal(lx976.status, 'departed');
  assert.equal(lx976.departure.revisedTime.local, '2026-09-06 08:11:00+02:00');   // ATD 06:11:26Z
  const ba = byNum(dep, 'BA741');                 // 200 Rolling, ETD 06:10Z, ATD 06:10:15Z
  assert.equal(ba.status, 'departed');
  assert.equal(ba.departure.revisedTime.local, '2026-09-06 08:10:00+02:00');
  assert.equal(ba.departure.terminal, '2');
  assert.equal(ba.arrival.airport.iata, 'LHR');
});

test('zrh departures: "New Gate" and "Gate Info at HH:MM" are scheduled, and that clock is not a revision', () => {
  const dep = zrhParseFeed(fix, 'dep', NOW);
  const ua = byNum(dep, 'UA12');                  // FLN "012" loses its leading zero
  assert.ok(ua, 'UA12 present');
  assert.equal(ua.status, 'scheduled');           // 57 New Gate
  assert.equal(ua.departure.gate, 'E42');
  assert.equal(ua.departure.terminal, '2');
  assert.equal(ua.departure.revisedTime, undefined);
  assert.equal(ua.aircraft.model, '763');         // the feed's own `model` says "B757-200" for this B763
  assert.equal(ua.aircraft.reg, 'N685UA');
  assert.equal(ua.arrival.airport.iata, 'ORD');
  const et = byNum(dep, 'ET737');                 // 90 "Gate Info at 19:10", STD 19:00Z, via Milan
  assert.ok(et, 'ET737 present');
  assert.equal(et.status, 'scheduled');
  assert.equal(et.departure.scheduledTime.local, '2026-09-06 21:00:00+02:00');
  assert.equal(et.departure.revisedTime, undefined, '"Gate Info at 19:10" is an announcement time, not a revised clock');
  assert.equal(et.departure.gate, undefined);
  assert.equal(et.arrival.airport.iata, 'ADD');
  assert.equal(et.arrival.airport.name, 'Addis Ababa');
  assert.equal(et.aircraft.model, '359');
  assert.ok(byNum(dep, 'LX64'), 'LX064 → LX64');
});

test('zrh: easyJet ICAO-form carriers rekey to U2 with the callsign kept; KM gets a name', () => {
  const dep = zrhParseFeed(fix, 'dep', NOW);
  const ezy = byNum(dep, 'U28472');               // FLC EZY
  assert.ok(ezy, 'EZY8472 → U28472');
  assert.equal(ezy.callSign, 'EZY8472');
  assert.equal(ezy.departure.airline.iata, 'U2');
  assert.equal(ezy.departure.airline.name, 'EasyJet');
  assert.equal(ezy.departure.terminal, '3');      // CAM check-in 3
  assert.equal(ezy.arrival.airport.iata, 'LGW');
  const eju = byNum(dep, 'U22987');               // FLC EJU, 2 Closed
  assert.ok(eju, 'EJU2987 → U22987');
  assert.equal(eju.callSign, 'EJU2987');
  assert.equal(eju.status, 'gateclosed');
  assert.equal(eju.departure.gate, 'A85');
  assert.equal(dep.filter((x) => /^E(ZY|ZS|JU)\d/.test(x.number)).length, 0, 'no ICAO-form numbers leak');
  const km = byNum(dep, 'KM491');                 // no `airline` on the row
  assert.ok(km, 'KM491 present');
  assert.equal(km.departure.airline.iata, 'KM');
  assert.equal(km.departure.airline.name, 'KM Malta Airlines');
  assert.equal(km.arrival.airport.iata, 'MLA');
  const arr = zrhParseFeed(fix, 'arr', NOW);
  const ezs = byNum(arr, 'U21219');               // FLC EZS
  assert.ok(ezs, 'EZS1219 → U21219');
  assert.equal(ezs.callSign, 'EZS1219');
  assert.equal(byNum(arr, 'KM490').departure.airline.name, 'KM Malta Airlines');
});

test('zrh arrivals: WK369 — landed, ATA as revision, RTK belt, TER terminal, far end IATA', () => {
  const arr = zrhParseFeed(fix, 'arr', NOW);
  const want = raw.filter((r) => r.flightType === 'A' && r.isCommercial === true && r.FLC !== 'XXC' && r.statusCode !== 10).length;
  assert.equal(arr.length, want, `parsed ${arr.length}, fixture has ${want} commercial arrivals`);
  assert.equal(arr.length, 387);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'ZRH'));
  assert.ok(arr.every((x) => x.arrival.gate === undefined && x.departure.gate === undefined), 'the feed posts no arrival gate');
  assert.ok(arr.every((x) => ['1', '2'].includes(x.arrival.terminal)), 'every arrival carries TER 1|2');
  const wk = byNum(arr, 'WK369');
  assert.ok(wk, 'WK369 present');
  assert.equal(wk.status, 'arrived');
  assert.equal(wk.arrival.scheduledTime.local, '2026-09-06 06:30:00+02:00');     // STA 04:30Z
  assert.equal(wk.arrival.revisedTime.local, '2026-09-06 06:34:00+02:00');       // ATA 04:34:32Z
  assert.equal(wk.arrival.baggageBelt, '26');
  assert.equal(wk.arrival.terminal, '2');
  assert.equal(wk.departure.airport.iata, 'LCA');
  assert.equal(wk.departure.airport.name, 'Larnaca');
  assert.equal(wk.arrival.airline.iata, 'WK');
  assert.equal(wk.arrival.airline.name, 'Edelweiss');
  assert.equal(wk.aircraft.model, '320');
  assert.equal(wk.aircraft.reg, 'HBJLR');
  assert.equal(wk._authTs, Date.parse('2026-09-06T04:30:00Z'));
  // Landed at 05:50:12Z against a 05:50Z schedule: same minute, so no revision (ETA 05:44 is ignored once the actual exists).
  const lx = byNum(arr, 'LX1683');
  assert.ok(lx, 'LX1683 present');
  assert.equal(lx.status, 'arrived');
  assert.equal(lx.arrival.revisedTime, undefined);
  assert.equal(lx.arrival.baggageBelt, '32');
  assert.equal(lx.departure.airport.iata, 'FLR');
});

test('zrh arrivals: en route / approach / rolling / delayed / cancelled', () => {
  const arr = zrhParseFeed(fix, 'arr', NOW);
  const eju = byNum(arr, 'U25187');               // 202 En Route, STA 07:15Z, ETA 07:00Z
  assert.ok(eju, 'EJU5187 present');
  assert.equal(eju.status, 'active');
  assert.equal(eju.arrival.scheduledTime.local, '2026-09-06 09:15:00+02:00');
  assert.equal(eju.arrival.revisedTime.local, '2026-09-06 09:00:00+02:00');
  assert.equal(eju.arrival.terminal, '1');
  assert.equal(eju.arrival.baggageBelt, undefined);
  assert.equal(eju.departure.airport.iata, 'BER');
  const ey = byNum(arr, 'EY139');                 // 202 En Route, ETA == STA
  assert.equal(ey.status, 'active');
  assert.equal(ey.arrival.revisedTime, undefined, 'estimate equal to schedule is no revision');
  const lx1109 = byNum(arr, 'LX1109');            // 201 Approach, ETA 06:29Z, belt already posted
  assert.equal(lx1109.status, 'active');
  assert.equal(lx1109.arrival.revisedTime.local, '2026-09-06 08:29:00+02:00');
  assert.equal(lx1109.arrival.baggageBelt, '13');
  const vy = byNum(arr, 'VY6246');                // 200 Rolling on an arrival = on the ground
  assert.equal(vy.status, 'arrived');
  assert.equal(vy.arrival.revisedTime.local, '2026-09-06 08:19:00+02:00');
  assert.equal(vy.arrival.baggageBelt, '12');
  assert.equal(vy.arrival.terminal, '1');
  const wk = byNum(arr, 'WK67');                  // 18 Delayed, no estimate yet; FLN "067"
  assert.ok(wk, 'WK067 → WK67');
  assert.equal(wk.status, 'delayed');
  assert.equal(wk.arrival.revisedTime, undefined);
  assert.equal(wk.arrival.scheduledTime.local, '2026-09-06 19:15:00+02:00');
  assert.equal(wk.departure.airport.iata, 'MLE');
  assert.equal(wk.departure.airport.name, 'Malé');
  const lx55 = byNum(arr, 'LX55');                // 8 Cancelled; FLN "055"
  assert.ok(lx55, 'LX055 → LX55');
  assert.equal(lx55.status, 'cancelled');
  assert.equal(lx55.arrival.revisedTime, undefined);
  assert.equal(lx55.arrival.terminal, '2');
  assert.equal(lx55.departure.airport.iata, 'BOS');
  const wk76 = byNum(arr, 'WK76');                // through flight: POR is the origin, via Zanzibar
  assert.equal(wk76.departure.airport.iata, 'JRO');
  assert.equal(wk76.departure.airport.name, 'Kilimanjaro');
  assert.equal(wk76.status, 'arrived');
  assert.equal(wk76.arrival.baggageBelt, '26');
});

test('zrh: direction is respected and a 4-letter far end lands in the icao slot', () => {
  // Every D row parses only under 'dep' and vice versa: the two reads are disjoint by number.
  const dep = zrhParseFeed(fix, 'dep', NOW), arr = zrhParseFeed(fix, 'arr', NOW);
  const depNums = new Set(dep.map((x) => x.number + '|' + x._authTs));
  assert.ok(arr.every((x) => !depNums.has(x.number + '|' + x._authTs)));
  // The capture's only ICAO-coded far ends are non-commercial (LSGG, LZIB, LJLJ…); a
  // commercial row with one keeps the code legible on the icao slot.
  const one = zrhParseFeed(JSON.stringify([{
    flightType: 'D', isCommercial: true, FLC: 'LX', FLN: '5024', STD: '2026-09-06T07:30:00Z',
    PDS: 'LSGG', cityEn: 'Geneva', airline: 'SWISS', TYS: '223', CAM: '1'
  }]), 'dep', NOW);
  assert.equal(one.length, 1);
  assert.equal(one[0].arrival.airport.iata, null);
  assert.equal(one[0].arrival.airport.icao, 'LSGG');
  assert.equal(one[0].arrival.airport.name, 'Geneva');
  assert.equal(one[0].departure.scheduledTime.local, '2026-09-06 09:30:00+02:00');
});

test('zrh: status fallback by text for codes the map has not seen', () => {
  assert.equal(zrhStatus(200, 'Rolling', 'dep'), 'departed');
  assert.equal(zrhStatus(200, 'Rolling', 'arr'), 'arrived');
  assert.equal(zrhStatus(999, 'Diverted', 'arr'), 'diverted');
  assert.equal(zrhStatus(999, 'Airborne', 'arr'), 'active');
  assert.equal(zrhStatus(999, 'Gate Closed', 'dep'), 'gateclosed');
  assert.equal(zrhStatus(999, 'Final Call', 'dep'), 'scheduled');
  assert.equal(zrhStatus(undefined, null, 'dep'), 'scheduled');
});

test('zrh: day files follow the Zürich clock around midnight and the 06:00 first wave', () => {
  assert.deepEqual(zrhFeedDays(Date.parse('2026-09-06T01:30:00+02:00')), ['2026-09-05', '2026-09-06']);
  assert.deepEqual(zrhFeedDays(Date.parse('2026-09-06T03:00:00+02:00')), ['2026-09-06']);
  assert.deepEqual(zrhFeedDays(NOW), ['2026-09-06', '2026-09-07']);
  assert.deepEqual(zrhFeedDays(Date.parse('2026-09-06T23:30:00+02:00')), ['2026-09-06', '2026-09-07']);
  // 22:30Z is already 00:30 on the 7th in Zürich.
  assert.deepEqual(zrhFeedDays(Date.parse('2026-09-06T22:30:00Z')), ['2026-09-06', '2026-09-07']);
  // Winter clock (CET): 05:59 local is still today-only, 06:00 adds tomorrow.
  assert.deepEqual(zrhFeedDays(Date.parse('2026-12-10T05:59:00+01:00')), ['2026-12-10']);
  assert.deepEqual(zrhFeedDays(Date.parse('2026-12-10T06:00:00+01:00')), ['2026-12-10', '2026-12-11']);
});

test('zrh: garbage in, empty out', () => {
  assert.deepEqual(zrhParseFeed('nope', 'dep', NOW), []);
  assert.deepEqual(zrhParseFeed('{}', 'arr', NOW), []);
  assert.deepEqual(zrhParseFeed('[]', 'dep', NOW), []);
  assert.deepEqual(zrhParseFeed('[{"flightType":"D","isCommercial":true,"FLC":"LX","FLN":"1","STD":"garbage"}]', 'dep', NOW), []);
  assert.deepEqual(zrhParseFeed('[{"flightType":"D","isCommercial":false,"FLC":"LX","FLN":"1","STD":"2026-09-06T05:00:00Z"}]', 'dep', NOW), []);
});
