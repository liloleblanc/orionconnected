// IAH Houston Intercontinental — Houston Airport System's own vendor feed
// (api.houstonairports.mobi, the LAS/CLT cousin) against verbatim captures
// taken 2026-09-06 01:15:42 CDT with a -2h..+10h window. Pins: epoch
// seconds rendered in Central (CDT -05:00) with the late-night rows keeping
// their 09-05 local date while the UTC date has rolled, bestKnownTimestamp
// as the revision (a "Now 1:00a" crossing midnight, an early arrival),
// the vendor's status enum folded with isDelayed, the feed's terminal on
// departures and the gate letter as terminal on arrivals, baggageBelt[]
// joined, the ICAO callsign, and the Hobby multi-stop collapse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIahFeed, _authorityRosterHas } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T01:15:42-05:00');
const tally = (list, k) => list.reduce((m, f) => (m[f[k]] = (m[f[k]] || 0) + 1, m), {});

test('iah departures: Central offset across the UTC date line, feed terminal, bestKnown revision, callsign', () => {
  const raw = fx('iah-dep-sample.json');
  assert.equal(JSON.parse(raw).status.code, 200);
  const dep = parseIahFeed(raw, 'dep', NOW);
  assert.equal(dep.length, 164, `parsed ${dep.length}`);   // 164 feed rows, no duplicates at IAH
  assert.ok(dep.every((x) => x.departure.airport.iata === 'IAH' && x.departure.airport.icao === 'KIAH'));
  assert.ok(dep.every((x) => !x.departure.baggageBelt && !x.arrival.baggageBelt), 'departures never carry a belt');
  assert.ok(dep.every((x) => x.codeshareStatus === 'IsOperator'));
  assert.deepEqual(tally(dep, 'status'), { departed: 1, delayed: 1, scheduled: 162 });
  // UA1004 IAH→UIO: scheduledTimestamp 1788669900 is 04:45Z on the 6th = 23:45 CDT on the 5th.
  const ua = dep.find((x) => x.number === 'UA1004');
  assert.ok(ua, 'UA1004 present');
  assert.equal(ua.departure.scheduledTime.local, '2026-09-05 23:45:00-05:00');
  assert.equal(ua.departure.scheduledTime.utc, '2026-09-06 04:45:00+00:00');
  assert.equal(ua._authTs, 1788669900000);
  assert.equal(ua.status, 'departed');                                   // "Departed" / DEPARTED
  assert.equal(ua.departure.revisedTime.local, '2026-09-05 23:48:00-05:00'); // bestKnownTimestamp 1788670080
  assert.equal(ua.departure.gate, 'E11');
  assert.equal(ua.departure.terminal, 'C');                              // the feed's check-in terminal, not the gate letter
  assert.equal(ua.arrival.airport.iata, 'UIO');
  assert.equal(ua.arrival.airport.name, null);                           // no names in this feed
  assert.equal(ua.departure.airline.iata, 'UA');
  assert.equal(ua.callSign, 'UAL1004');
  // UA209 IAH→BOG: isDelayed with originalStatus "Now   1:00a" — the revision crosses local midnight.
  const late = dep.find((x) => x.number === 'UA209');
  assert.ok(late, 'UA209 present');
  assert.equal(late.status, 'delayed');
  assert.equal(late.departure.scheduledTime.local, '2026-09-05 23:59:00-05:00');
  assert.equal(late.departure.revisedTime.local, '2026-09-06 01:00:00-05:00');
  assert.ok(late.departure.revisedTime.utc > late.departure.scheduledTime.utc, 'a delay, not a jump back');
  // BR51 IAH→TPE: bestKnown == scheduled → no revision; Terminal E, gate D11.
  const br = dep.find((x) => x.number === 'BR51');
  assert.ok(br, 'BR51 present');
  assert.equal(br.status, 'scheduled');                                  // ON TIME
  assert.equal(br.departure.revisedTime, undefined);
  assert.equal(br.departure.scheduledTime.local, '2026-09-06 01:10:00-05:00');
  assert.equal(br.departure.terminal, 'E');
  assert.equal(br.departure.gate, 'D11');
  assert.equal(br.callSign, 'EVA51');
  const ac = dep.find((x) => x.number === 'AC1734');                    // letter-digit-letter gates survive intact
  assert.ok(ac, 'AC1734 present');
  assert.equal(ac.departure.gate, 'D1A');
  assert.equal(ac.arrival.airport.iata, 'YYZ');
  // Only the three gateless rows (Amerijet and two VivaAerobus) have no terminal to show.
  assert.deepEqual(dep.filter((x) => !x.departure.terminal).map((x) => [x.number, x.departure.gate]),
    [['M65771', undefined], ['VB611', undefined], ['VB153', undefined]]);
  // Two rows are still on the 5th in Houston though already the 6th in UTC.
  const lateNight = dep.filter((x) => x.departure.scheduledTime.local.startsWith('2026-09-05'));
  assert.equal(lateNight.length, 2);
  assert.ok(lateNight.every((x) => x.departure.scheduledTime.utc.startsWith('2026-09-06')));
});

test('iah arrivals: gate letter as terminal, belts joined, early Landed, Canceled, en-route Departed, "Now" estimates', () => {
  const arr = parseIahFeed(fx('iah-arr-sample.json'), 'arr', NOW);
  assert.equal(arr.length, 188, `parsed ${arr.length}`);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'IAH'));
  assert.deepEqual(tally(arr, 'status'), { arrived: 9, scheduled: 167, departed: 9, cancelled: 1, delayed: 2 });
  assert.equal(arr.filter((x) => x.arrival.revisedTime).length, 32);      // bestKnownTimestamp differs from scheduled
  assert.equal(arr.filter((x) => x.arrival.baggageBelt).length, 173);
  // The feed's terminal is null on every arrival; the gate letter is the terminal at IAH (A–E).
  assert.deepEqual(tally(arr.map((x) => ({ t: x.arrival.terminal || 'none' })), 't'), { A: 26, B: 49, C: 51, D: 10, E: 43, none: 9 });
  assert.ok(arr.filter((x) => !x.arrival.terminal).every((x) => !x.arrival.gate), 'no terminal only where there is no gate');
  // UA1660 SEA→IAH landed 7 minutes early: an earlier revision, not a delay.
  const ua = arr.find((x) => x.number === 'UA1660');
  assert.ok(ua, 'UA1660 present');
  assert.equal(ua.status, 'arrived');                                    // "Landed" / ARRIVED
  assert.equal(ua.arrival.scheduledTime.local, '2026-09-05 23:39:00-05:00');
  assert.equal(ua.arrival.scheduledTime.utc, '2026-09-06 04:39:00+00:00');
  assert.equal(ua.arrival.revisedTime.local, '2026-09-05 23:32:00-05:00');
  assert.ok(ua.arrival.revisedTime.utc < ua.arrival.scheduledTime.utc);
  assert.equal(ua.arrival.gate, 'C40');
  assert.equal(ua.arrival.terminal, 'C');
  assert.equal(ua.arrival.baggageBelt, 'C4');
  assert.equal(ua.departure.airport.iata, 'SEA');
  assert.equal(ua.arrival.airline.iata, 'UA');
  // ZG16 NRT→IAH: "Canceled" (one L) → cancelled; ZIPAIR's real code is ZG.
  const zg = arr.find((x) => x.number === 'ZG16');
  assert.ok(zg, 'ZG16 present');
  assert.equal(zg.status, 'cancelled');
  assert.equal(zg.departure.airport.iata, 'NRT');
  assert.equal(zg.arrival.gate, 'D14');
  assert.equal(zg.arrival.terminal, 'D');
  assert.equal(zg.arrival.airline.iata, 'ZG');
  assert.equal(zg.callSign, 'TZP16');
  assert.equal(zg.arrival.scheduledTime.local, '2026-09-06 09:45:00-05:00');
  assert.equal(zg.arrival.revisedTime, undefined);
  // UA818 EZE→IAH: "Departed" on an arrival is en route (the boards render it so), running 70 min late.
  const enroute = arr.find((x) => x.number === 'UA818');
  assert.ok(enroute, 'UA818 present');
  assert.equal(enroute.status, 'departed');
  assert.equal(enroute.arrival.scheduledTime.local, '2026-09-06 05:10:00-05:00');
  assert.equal(enroute.arrival.revisedTime.local, '2026-09-06 06:20:00-05:00');
  assert.equal(enroute.arrival.baggageBelt, 'F8');
  assert.equal(enroute.arrival.gate, 'E5');
  assert.equal(enroute.arrival.terminal, 'E');
  // UA1907 GUA→IAH: originalStatus "Now   5:18a" with isDelayed=false — an estimate: scheduled + earlier revised.
  const est = arr.find((x) => x.number === 'UA1907');
  assert.ok(est, 'UA1907 present');
  assert.equal(est.status, 'scheduled');
  assert.equal(est.arrival.scheduledTime.local, '2026-09-06 05:21:00-05:00');
  assert.equal(est.arrival.revisedTime.local, '2026-09-06 05:18:00-05:00');
  // UA6144 MTY→IAH: "Now   10:30a" with isDelayed=true → delayed, 20 min.
  const dl = arr.find((x) => x.number === 'UA6144');
  assert.ok(dl, 'UA6144 present');
  assert.equal(dl.status, 'delayed');
  assert.equal(dl.arrival.scheduledTime.local, '2026-09-06 10:10:00-05:00');
  assert.equal(dl.arrival.revisedTime.local, '2026-09-06 10:30:00-05:00');
  assert.equal(dl.arrival.baggageBelt, 'F12');
  assert.equal(dl.departure.airport.iata, 'MTY');
  // VB152 MEX→IAH: estimated/actual are null, bestKnown == scheduled, no gate yet.
  const vb = arr.find((x) => x.number === 'VB152');
  assert.ok(vb, 'VB152 present');
  assert.equal(vb.status, 'scheduled');
  assert.equal(vb.arrival.revisedTime, undefined);
  assert.equal(vb.arrival.gate, undefined);
  assert.equal(vb.arrival.terminal, undefined);
  assert.equal(vb.arrival.baggageBelt, undefined);
  assert.equal(vb.arrival.scheduledTime.local, '2026-09-06 09:40:00-05:00');
  assert.equal(vb.callSign, 'VIV152');
  // NH114 HND→IAH: "Now   8:23a" — 22 minutes early into Terminal D, belt F7.
  const nh = arr.find((x) => x.number === 'NH114');
  assert.ok(nh, 'NH114 present');
  assert.equal(nh.arrival.scheduledTime.local, '2026-09-06 08:45:00-05:00');
  assert.equal(nh.arrival.revisedTime.local, '2026-09-06 08:23:00-05:00');
  assert.equal(nh.arrival.gate, 'D11');
  assert.equal(nh.arrival.terminal, 'D');
  assert.equal(nh.arrival.baggageBelt, 'F7');
  // Eight late-night rows are still the 5th in Houston.
  const lateNight = arr.filter((x) => x.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.equal(lateNight.length, 8);
  assert.ok(lateNight.every((x) => x.arrival.scheduledTime.utc.startsWith('2026-09-06')));
});

test('iah: direction flag respected, feed order (by schedule) kept', () => {
  assert.deepEqual(parseIahFeed(fx('iah-dep-sample.json'), 'arr', NOW), []);
  assert.deepEqual(parseIahFeed(fx('iah-arr-sample.json'), 'dep', NOW), []);
  for (const dir of ['dep', 'arr']) {
    const list = parseIahFeed(fx(`iah-${dir}-sample.json`), dir, NOW);
    assert.ok(list.every((f, i) => i === 0 || list[i - 1]._authTs <= f._authTs), `${dir} sorted by _authTs`);
  }
});

// The same payload carries Hobby (baseAirport=HOU). Southwest's multi-stop
// arrivals there come once per route city with the same number and
// timestamp: a bare "Scheduled" placeholder without a gate beside the real
// row. These two are WN313 verbatim from the scout's unfiltered capture of
// 2026-09-05 (MCO copy + PIT leg that actually landed).
const WN313 = [
  { scheduledDate: '2026-09-05', arrival: true, codeShareFlightNumber: 'WN313', codeShareAirlineTrackNumber: '313', iataCodeShareAirline: 'WN', icaoCodeShareAirline: 'SWA', operatingAirlineFlightNumber: 'WN313', operatingAirlineTrackNumber: '313', operatingAirlineSuffix: null, iataOperatingAirline: 'WN', icaoOperatingAirline: 'SWA', baseAirport: 'HOU', departureAirport: 'MCO', arrivalAirport: 'HOU', viaAirport: 'MCO', viaSequencePosition: 0, terminal: null, gate: null, baggageBelt: [], status: 'Scheduled', originalStatus: 'Scheduled', isDelayed: false, isVisible: true, isDeleted: false, scheduledTimestamp: 1788630300, estimatedTimestamp: null, actualTimestamp: null, bestKnownTimestamp: 1788630300, lastUpdatedTimestamp: 1780814039, iataOperatingAirlineFlightNumber: 'WN313', icaoOperatingAirlineFlightNumber: 'SWA313', iataCodeShareFlightNumber: 'WN313', icaoCodeShareFlightNumber: 'SWA313', id: 'eyJjb2RlU2hhcmVGbGlnaHROdW1iZXIiOiJXTjMxMyIsInZpYUFpcnBvcnQiOiJNQ08iLCJhcnJpdmFsIjp0cnVlLCJzY2hlZHVsZWREYXRlIjoiMjAyNi0wOS0wNSIsImFycml2YWxBaXJwb3J0IjoiSE9VIiwiZGVwYXJ0dXJlQWlycG9ydCI6Ik1DTyJ9' },
  { scheduledDate: '2026-09-05', arrival: true, codeShareFlightNumber: 'WN313', codeShareAirlineTrackNumber: '313', iataCodeShareAirline: 'WN', icaoCodeShareAirline: 'SWA', operatingAirlineFlightNumber: 'WN313', operatingAirlineTrackNumber: '313', operatingAirlineSuffix: null, iataOperatingAirline: 'WN', icaoOperatingAirline: 'SWA', baseAirport: 'HOU', departureAirport: 'PIT', arrivalAirport: 'HOU', viaAirport: 'PIT', viaSequencePosition: 0, terminal: null, gate: '40', baggageBelt: ['1'], status: 'Landed', originalStatus: 'Arrived', isDelayed: true, isVisible: true, isDeleted: false, scheduledTimestamp: 1788630300, estimatedTimestamp: 1788631860, actualTimestamp: 1788631860, bestKnownTimestamp: 1788631860, lastUpdatedTimestamp: 1788632408, iataOperatingAirlineFlightNumber: 'WN313', icaoOperatingAirlineFlightNumber: 'SWA313', iataCodeShareFlightNumber: 'WN313', icaoCodeShareFlightNumber: 'SWA313', id: 'eyJjb2RlU2hhcmVGbGlnaHROdW1iZXIiOiJXTjMxMyIsInZpYUFpcnBvcnQiOiJQSVQiLCJhcnJpdmFsIjp0cnVlLCJzY2hlZHVsZWREYXRlIjoiMjAyNi0wOS0wNSIsImFycml2YWxBaXJwb3J0IjoiSE9VIiwiZGVwYXJ0dXJlQWlycG9ydCI6IlBJVCJ9' }
];
const payload = (rows) => JSON.stringify({ data: { flights: rows }, status: { code: 200, message: '' } });

test('iah: Hobby multi-stop copies collapse to the real leg; the home code gates rows', () => {
  for (const rows of [WN313, [...WN313].reverse()]) {
    const hou = parseIahFeed(payload(rows), 'arr', NOW, 'HOU');
    assert.equal(hou.length, 1, 'one WN313, whichever copy came first');
    assert.equal(hou[0].departure.airport.iata, 'PIT');
    assert.equal(hou[0].status, 'arrived');
    assert.equal(hou[0].arrival.gate, '40');
    assert.equal(hou[0].arrival.terminal, undefined);                    // numeric gates derive nothing
    assert.equal(hou[0].arrival.baggageBelt, '1');
    assert.equal(hou[0].arrival.scheduledTime.local, '2026-09-05 12:45:00-05:00');
    assert.equal(hou[0].arrival.revisedTime.local, '2026-09-05 13:11:00-05:00');
    assert.deepEqual(hou[0].arrival.airport, { iata: 'HOU', icao: 'KHOU', name: 'Houston Hobby' });
  }
  assert.deepEqual(parseIahFeed(payload(WN313), 'arr', NOW), [], 'HOU rows are not IAH rows');
  assert.deepEqual(parseIahFeed(payload(WN313), 'dep', NOW, 'HOU'), []);
});

test('iah: status folding — Boarding, airline DELAYED text, hidden rows, codeshare rows', () => {
  const base = JSON.parse(fx('iah-dep-sample.json')).data.flights.find((r) => r.operatingAirlineFlightNumber === 'BR51');
  const row = (patch) => ({ ...base, ...patch });
  // Real originalStatus strings seen in the 2026-09-05 unfiltered capture: TK34 "BRD @ 830PM"
  // (status Boarding), LH441 "DELAYED" with status Scheduled and isDelayed=false, one "InGate".
  const st = (patch) => parseIahFeed(payload([row(patch)]), 'dep', NOW)[0].status;
  assert.equal(st({ status: 'Boarding', originalStatus: 'Boarding' }), 'boarding');
  assert.equal(st({ status: 'Boarding', originalStatus: 'BRD @ 830PM' }), 'boarding');
  assert.equal(st({ status: 'Scheduled', originalStatus: 'DELAYED', isDelayed: false }), 'delayed');
  assert.equal(st({ status: 'Scheduled', originalStatus: 'ON TIME', isDelayed: true }), 'delayed');
  assert.equal(st({ status: 'Scheduled', originalStatus: 'InGate', isDelayed: false }), 'scheduled');
  assert.equal(st({ status: 'Departed', originalStatus: 'DEPARTED', isDelayed: true }), 'departed');   // late but gone
  assert.equal(st({ status: 'Landed', originalStatus: 'ARRIVED' }), 'arrived');
  assert.equal(st({ status: 'Canceled', originalStatus: 'CANCELED' }), 'cancelled');
  assert.equal(st({ status: null, originalStatus: null }), 'scheduled');
  assert.deepEqual(parseIahFeed(payload([row({ isVisible: false })]), 'dep', NOW), []);
  assert.deepEqual(parseIahFeed(payload([row({ isDeleted: true })]), 'dep', NOW), []);
  assert.deepEqual(parseIahFeed(payload([row({ iataCodeShareAirline: 'NH', codeShareFlightNumber: 'NH7051' })]), 'dep', NOW), [], 'marketing rows skipped');
  assert.deepEqual(parseIahFeed(payload([row({ scheduledTimestamp: null })]), 'dep', NOW), []);
  assert.deepEqual(parseIahFeed(payload([row({ arrival: null })]), 'dep', NOW), []);
});

test('iah: garbage in, empty out; on the roster', () => {
  assert.deepEqual(parseIahFeed('', 'dep', NOW), []);
  assert.deepEqual(parseIahFeed('{}', 'arr', NOW), []);
  assert.deepEqual(parseIahFeed('x', 'dep', NOW), []);
  assert.deepEqual(parseIahFeed('[]', 'arr', NOW), []);
  assert.deepEqual(parseIahFeed('{"data":{"flights":null}}', 'dep', NOW), []);
  assert.equal(_authorityRosterHas('IAH'), true);
  assert.equal(_authorityRosterHas('iah'), true);
});
