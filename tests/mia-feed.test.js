// MIA Miami International — AirIT WebFIDS XML refresh feed against verbatim
// captures (2026-09-06 02:06 EDT, the feed's own <currentTime>). Pins:
// offset-less <stt> read as Eastern (EDT -04:00, and EST -05:00 on a winter
// date), _authTs equal to the feed's own <timeInMillis> on every row, the
// status clock as the revised gate time with cross-midnight settling
// ("Arrived 12:57A" on a 22:00 flight) and the dated <ett> taking over when
// it agrees to the minute (AA 904, a day late), gate/terminal/claim/type/
// tail/check-in counters, AirIT type codes normalised so the board never
// prints a 737-800 as a MAX 8, the Emirates DXB–MIA–BOG through-flight
// collapsing onto the FIRST route stop, and the "from MIAMI" placeholder
// row dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { miaParseFeed } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T02:06:00-04:00');

// Every row's <timeInMillis> keyed by "CXR TRN" as printed, for the offset check.
function feedMillis(xml) {
  const m = new Map();
  for (const c of xml.match(/<flight>[\s\S]*?<\/flight>/g) || []) {
    const cxr = c.match(/<CXR>([^<]*)<\/CXR>/)[1], trn = c.match(/<TRN>([^<]*)<\/TRN>/)[1].replace(/^0+(?=\d)/, '');
    const ms = Number(c.match(/<timeInMillis>(\d+)<\/timeInMillis>/)[1]);
    const k = cxr + trn;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(ms);
  }
  return m;
}

test('mia arrivals: Eastern offset on every row, status clock as revised, gate/claim/terminal/type/tail', () => {
  const xml = fx('mia-arr-sample.xml');
  const arr = miaParseFeed(xml, 'arr', NOW);
  // 220 <flight> rows: EK 213 emitted twice (DUBAI, AE + BOGOTA) and UA 4195 "from MIAMI" dropped.
  assert.equal(arr.length, 218, `parsed ${arr.length}`);
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'MIA' && x.arrival.airport.icao === 'KMIA'));
  assert.ok(arr.every((x) => x.arrival.scheduledTime.local.endsWith('-04:00')), 'EDT on every row');
  const ms = feedMillis(xml);
  for (const x of arr) assert.ok(ms.get(x.number).has(x._authTs), `${x.number} _authTs ${x._authTs} is the feed's own timeInMillis`);
  assert.ok(arr.every((x) => x.arrival.baggageBelt), 'every arrival row carries a claim');
  const aa = arr.find((x) => x.number === 'AA605');
  assert.ok(aa, 'AA605 present');
  assert.equal(aa.arrival.scheduledTime.local, '2026-09-05 16:15:00-04:00');
  assert.equal(aa.arrival.scheduledTime.utc, '2026-09-05 20:15:00+00:00');
  assert.equal(aa._authTs, 1788639300000);
  assert.equal(aa.status, 'arrived');
  assert.equal(aa.arrival.revisedTime.local, '2026-09-05 23:33:00-04:00'); // "Arrived 11:33P", not <att> 23:21
  assert.equal(aa.arrival.gate, 'D4');
  assert.equal(aa.arrival.terminal, 'D');
  assert.equal(aa.arrival.baggageBelt, '24');
  assert.equal(aa.departure.airport.iata, 'LGA');
  assert.equal(aa.departure.airport.name, 'NEW YORK - LGA');
  assert.equal(aa.arrival.airline.iata, 'AA');
  assert.equal(aa.arrival.airline.name, 'American Airlines');
  assert.equal(aa.aircraft.model, '73H');          // <TYP>7378W</TYP> — a 737-800, never "MAX 8"
  assert.equal(aa.aircraft.reg, 'N959NN');
  assert.equal(aa.codeshareStatus, 'IsOperator');
  assert.equal(aa.departure.checkInDesk, undefined);
  // "Now 12:05P" = an estimate: scheduled + revised (the AUS/YVR/DUB convention).
  const late = arr.find((x) => x.number === 'AA2526');
  assert.ok(late, 'AA2526 present');
  assert.equal(late.status, 'scheduled');
  assert.equal(late.arrival.scheduledTime.local, '2026-09-06 11:04:00-04:00');
  assert.equal(late.arrival.revisedTime.local, '2026-09-06 12:05:00-04:00');
  // International row: claim "CD" (customs hall) passed through as MIA prints it; B777 → 777.
  const gig = arr.find((x) => x.number === 'AA904');
  assert.ok(gig, 'AA904 present');
  assert.equal(gig.departure.airport.iata, 'GIG');
  assert.equal(gig.arrival.baggageBelt, 'CD');
  assert.equal(gig.arrival.terminal, 'E');
  assert.equal(gig.arrival.gate, 'E8');
  assert.equal(gig.aircraft.model, '777');
  // Precleared (DII=T) Bermuda row lands on a numbered domestic-side claim.
  const bda = arr.find((x) => x.number === 'AA414');
  assert.ok(bda, 'AA414 present');
  assert.equal(bda.departure.airport.iata, 'BDA');
  assert.equal(bda.arrival.baggageBelt, '23');
  // Air Canada's B38M is a MAX 8 for real; Delta's 7572W is a 757-200.
  assert.equal(arr.find((x) => x.number === 'AC1210').aircraft.model, '7M8');
  assert.equal(arr.find((x) => x.number === 'DL1588').aircraft.model, '752');
  // <TRN>002</TRN> loses its leading zeros.
  assert.ok(arr.find((x) => x.number === 'AV2'), 'AV2 present');
  assert.ok(!arr.some((x) => x.number === 'AV002'), 'no zero-padded numbers');
  // No row is "On Time" with a stale estimate hanging off it.
  assert.ok(arr.filter((x) => x.status === 'scheduled' && !x.arrival.revisedTime).length > 150, 'On Time rows carry no revisedTime');
});

test('mia arrivals: a status clock past midnight settles to the next day; a dated <ett> wins when it agrees', () => {
  const arr = miaParseFeed(fx('mia-arr-sample.xml'), 'arr', NOW);
  const dl = arr.find((x) => x.number === 'DL1588');    // 22:00 → "Arrived 12:57A" (<ett> 01:03 is stale)
  assert.ok(dl, 'DL1588 present');
  assert.equal(dl.arrival.scheduledTime.local, '2026-09-05 22:00:00-04:00');
  assert.equal(dl.arrival.revisedTime.local, '2026-09-06 00:57:00-04:00');
  assert.ok(dl.arrival.revisedTime.utc > dl.arrival.scheduledTime.utc, 'a delay, not a 21h jump back');
  assert.equal(dl.arrival.gate, 'H8');
  assert.equal(dl.arrival.terminal, 'H');
  assert.equal(dl.arrival.baggageBelt, '5');
  const aa = arr.find((x) => x.number === 'AA842');     // 21:00 → "Arrived 12:20A"
  assert.ok(aa, 'AA842 present');
  assert.equal(aa.arrival.revisedTime.local, '2026-09-06 00:20:00-04:00');
  // AA 904 GIG–MIA kept yesterday's <stt> 05:50 and shows "Now 5:45A" with
  // <ett> 2026-09-06T05:45 — the board must say a day late, not 5 min early.
  const gig = arr.find((x) => x.number === 'AA904');
  assert.equal(gig.arrival.scheduledTime.local, '2026-09-05 05:50:00-04:00');
  assert.equal(gig.status, 'scheduled');
  assert.equal(gig.arrival.revisedTime.local, '2026-09-06 05:45:00-04:00');
  assert.equal(gig._authTs, 1788601800000);
});

test('mia arrivals: the Emirates through-flight collapses onto its FIRST route stop; the "from MIAMI" row is dropped', () => {
  const arr = miaParseFeed(fx('mia-arr-sample.xml'), 'arr', NOW);
  const ek = arr.filter((x) => x.number === 'EK213');
  assert.equal(ek.length, 1, 'EK213 emitted twice in the feed (DUBAI, AE / BOGOTA), once here');
  assert.equal(ek[0].departure.airport.iata, 'DXB');   // DXB → MIA → BOG: so=[DUBAI, AE; BOGOTA]
  assert.equal(ek[0].departure.airport.name, 'DUBAI, AE');
  assert.equal(ek[0].arrival.scheduledTime.local, '2026-09-06 10:00:00-04:00');
  assert.equal(ek[0].arrival.gate, 'J17');
  assert.equal(ek[0].arrival.terminal, 'J');
  assert.equal(ek[0].arrival.baggageBelt, 'J3');
  assert.equal(ek[0].aircraft.model, '77W');           // <TYP>7773E</TYP>
  assert.equal(ek[0].aircraft.reg, undefined);         // <REG> blank on the inbound
  assert.equal(ek[0].arrival.airline.name, 'Emirates');
  assert.ok(!arr.some((x) => x.number === 'UA4195'), 'UA 4195 "from MIAMI" (terminal NO, no gate) is not a flight');
  assert.ok(arr.every((x) => x.departure.airport.iata !== 'MIA'));
  assert.ok(arr.every((x) => x.arrival.terminal !== 'NO'));
});

test('mia departures: EDT, status clock, gate/terminal/check-in, no belt, cancelled rows, direction respected', () => {
  const xml = fx('mia-dep-sample.xml');
  const dep = miaParseFeed(xml, 'dep', NOW);
  // 251 <flight> rows: EK 213 emitted twice (BOGOTA + a DUBAI copy with an empty <cities>).
  assert.equal(dep.length, 250, `parsed ${dep.length}`);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'MIA'));
  assert.ok(dep.every((x) => !x.departure.baggageBelt && !x.arrival.baggageBelt));
  const ms = feedMillis(xml);
  for (const x of dep) assert.ok(ms.get(x.number).has(x._authTs), `${x.number} _authTs is the feed's own timeInMillis`);
  const aa = dep.find((x) => x.number === 'AA385');
  assert.ok(aa, 'AA385 present');
  assert.equal(aa.departure.scheduledTime.local, '2026-09-05 23:30:00-04:00');
  assert.equal(aa.departure.scheduledTime.utc, '2026-09-06 03:30:00+00:00');
  assert.equal(aa.status, 'departed');
  assert.equal(aa.departure.revisedTime.local, '2026-09-06 00:34:00-04:00'); // "Departed 12:34A", not <att> 00:48
  assert.equal(aa.departure.gate, 'D43');
  assert.equal(aa.departure.terminal, 'D');
  assert.equal(aa.arrival.airport.iata, 'LIM');
  assert.equal(aa.arrival.airport.name, 'LIMA');
  assert.equal(aa.aircraft.model, '32Q');            // <TYP>A21N</TYP>
  assert.equal(aa.aircraft.reg, 'N470AN');
  // EK 214's <ett> stayed at schedule after push-back: the status clock settles across midnight.
  const ek214 = dep.find((x) => x.number === 'EK214');
  assert.ok(ek214, 'EK214 present');
  assert.equal(ek214.departure.scheduledTime.local, '2026-09-05 23:55:00-04:00');
  assert.equal(ek214.departure.revisedTime.local, '2026-09-06 00:10:00-04:00');
  assert.equal(ek214.departure.checkInDesk, '602-609');   // <CTR>
  assert.equal(ek214.arrival.airport.iata, 'DXB');
  // Through-flight out: EK 213 MIA → BOG (so=[BOGOTA, DUBAI]); the DUBAI copy has no <so> at all.
  const ek213 = dep.filter((x) => x.number === 'EK213');
  assert.equal(ek213.length, 1);
  assert.equal(ek213[0].arrival.airport.iata, 'BOG');
  assert.equal(ek213[0].arrival.airport.name, 'BOGOTA');
  assert.equal(ek213[0].departure.gate, 'J17');
  // "Now 7:10A" on an 08:15 flight is an early estimate, left on its own day.
  const ac = dep.find((x) => x.number === 'AC1205');
  assert.ok(ac, 'AC1205 present');
  assert.equal(ac.status, 'scheduled');
  assert.equal(ac.departure.scheduledTime.local, '2026-09-06 08:15:00-04:00');
  assert.equal(ac.departure.revisedTime.local, '2026-09-06 07:10:00-04:00');
  assert.equal(ac.departure.checkInDesk, '612-619');
  assert.equal(ac.aircraft.model, '7M8');            // <TYP>B38M</TYP>
  assert.equal(ac.arrival.airport.iata, 'YUL');
  // Cancelled: no times beyond schedule, gate and counters still posted.
  const xld = dep.find((x) => x.number === 'BBQ564');
  assert.ok(xld, 'BBQ564 present');
  assert.equal(xld.status, 'cancelled');
  assert.equal(xld.departure.revisedTime, undefined);
  assert.equal(xld.departure.gate, 'F10');
  assert.equal(xld.departure.terminal, 'F');
  assert.equal(xld.departure.checkInDesk, '294-299');
  assert.equal(xld.departure.airline.name, 'Eastern Air Express');
  assert.equal(xld.arrival.airport.iata, 'SCU');
  assert.equal(xld.aircraft.model, '734');           // <TYP>B7374</TYP>
  assert.equal(dep.filter((x) => x.status === 'cancelled').length, 2);
  // "On Time" with <ett> == <stt> → no revised; zero-padded numbers trimmed.
  const ly = dep.find((x) => x.number === 'LY18');   // <TRN>018</TRN>
  assert.ok(ly, 'LY18 present');
  assert.equal(ly.status, 'departed');
  assert.equal(ly.departure.checkInDesk, '630-637');
  const mq = dep.find((x) => x.number === 'MQ3764');
  assert.ok(mq, 'MQ3764 present');
  assert.equal(mq.status, 'scheduled');
  assert.equal(mq.departure.revisedTime, undefined);
  assert.equal(mq.departure.gate, 'D60');
  assert.equal(mq.departure.airline.name, 'American Eagle');
  assert.equal(mq.aircraft.model, 'E175');           // not in the map → passes through (the board labels it)
  assert.equal(dep.find((x) => x.number === 'UP222').aircraft.model, '73W');   // <TYP>7377W</TYP>, a 737-700
  // Every departure row is DIR=D, so the arrivals read of it is empty and vice versa.
  assert.deepEqual(miaParseFeed(xml, 'arr', NOW), []);
  assert.deepEqual(miaParseFeed(fx('mia-arr-sample.xml'), 'dep', NOW), []);
});

test('mia: a winter <stt> carries EST, and garbage in is empty out', () => {
  const row = (stt, ett, status) => `<?xml version="1.0" standalone="yes" ?><data><flight><city>BOSTON</city><stt>${stt}</stt>`
    + `<flightNumber>AA 2000</flightNumber><status>${status}</status><bags>22</bags><terminal>D</terminal><gate>D20</gate>`
    + `<airlineName>American Airlines</airlineName><direction>Arrival</direction><att>#</att><ett>${ett}</ett><TYP>7378W</TYP>`
    + `<DIR>A</DIR><REG>&#160;</REG><CXR>AA</CXR><TRN>2000</TRN><CTY>BOS</CTY><timeInMillis>0</timeInMillis><CTR>&#160;</CTR>`
    + `<codeShares>&#160;</codeShares><RMK>&#160;</RMK><DII>D</DII><cities><so>BOSTON</so></cities></flight><config><numFlights>1</numFlights></config></data>`;
  const jan = miaParseFeed(row('2026-01-15T08:00:00', '2026-01-15T08:00:00', 'On Time'), 'arr', NOW);
  assert.equal(jan.length, 1);
  assert.equal(jan[0].arrival.scheduledTime.local, '2026-01-15 08:00:00-05:00');
  assert.equal(jan[0].arrival.scheduledTime.utc, '2026-01-15 13:00:00+00:00');
  assert.equal(jan[0].arrival.revisedTime, undefined);
  assert.equal(jan[0].aircraft.model, '73H');
  assert.equal(jan[0].aircraft.reg, undefined);
  // "Now 11:50P" on a 23:59 flight the night before → the day before at 23:50 (an early estimate), with EST.
  const nov = miaParseFeed(row('2026-11-01T23:59:00', '#', 'Now 11:50P'), 'arr', NOW);
  assert.equal(nov[0].arrival.scheduledTime.local, '2026-11-01 23:59:00-05:00');
  assert.equal(nov[0].arrival.revisedTime.local, '2026-11-01 23:50:00-05:00');
  assert.deepEqual(miaParseFeed('', 'dep', NOW), []);
  assert.deepEqual(miaParseFeed('<html></html>', 'arr', NOW), []);
  assert.deepEqual(miaParseFeed('<?xml version="1.0" standalone="yes" ?><data><config><numFlights>0</numFlights></config><messages></messages></data>', 'arr', NOW), []);
});
