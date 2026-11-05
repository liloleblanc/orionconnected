// v24120 — THE AIRPORT WORD "LANDED" REACHES THE BOARDS AS 'landed'.
//
// Sea-Tac, 2026-11-05 02:10Z: AC8806 (Jazz CRJ900) from Vancouver, inbound to
// S1A. The airport's page said only "Landed", with no time. Every adapter
// folded any "land" or "arriv" word into 'arrived', and the boards read
// 'arrived' as on its blocks, so the gate card said "Arrived at the gate |
// 6:22pm" (the schedule) while the map still had the jet rolling out.
//
// Now Landed is 'landed' (down, not on the stand) and Arrived / At gate / In
// blocks is 'arrived', in the worker (yhzStatus and every adapter that had its
// own copy of the fold) and in the board's own adapters (feed-router.js).
// Where an airport keeps writing Landed once the aeroplane is at the gate, the
// row's own on-stand evidence makes it 'arrived' again (vendorOnStand: Boston,
// Charlotte, Las Vegas, Houston, O'Hare, Edinburgh, Zurich).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const WSRC = readFileSync(new URL('../workers/fids-proxy.js', import.meta.url), 'utf8');
const ROUTER = readFileSync(new URL('../fids-current/js/feed-router.js', import.meta.url), 'utf8');
const P = (s) => Date.parse(s);
const num = (rows, n) => rows.find((r) => r.number === n);

// From `function NAME(` to its matching brace; strings and comments skipped.
function fnIn(SRC, name) {
  const m = SRC.match(new RegExp('(^|\\n)function ' + name + '\\('));
  assert.ok(m, name + ' must be declared');
  const start = m.index + (m[1] ? 1 : 0);
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < SRC.length && SRC[i] !== c; i++) if (SRC[i] === '\\') i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error('no end for ' + name);
}
const yhzStatus = new Function(['neutralStatus', 'landWord', 'yhzStatus'].map((n) => fnIn(WSRC, n)).join('\n') + '\nreturn yhzStatus;')();

test('yhzStatus: Landed is landed; Arrived, at the gate, in blocks and bags delivered are arrived', () => {
  for (const s of ['Landed', 'LANDED', 'landed', 'LANDED 03:54', 'Landed 10:05', 'Landed at 06:10']) assert.equal(yhzStatus(s), 'landed', s);
  for (const s of ['Arrived', 'ARRIVED', 'Arrived at Gate', 'Arrived 8:58P', 'Arrived at 9:47 PM', 'All Bags Arrived', 'Arrivé',
    'Landed - at gate', 'Landed, in gate', 'Landed / In Blocks', 'Landed on block', 'Landed 05:09, bags delivered on belt 5']) {
    assert.equal(yhzStatus(s), 'arrived', s);
  }
  // Unchanged around it.
  assert.equal(yhzStatus('Departed'), 'departed');
  assert.equal(yhzStatus('Cancelled'), 'cancelled');
  assert.equal(yhzStatus('Delayed'), 'delayed');
  assert.equal(yhzStatus('On Time'), 'ontime');
  // A bare At gate says nothing of a landing (on a departure row it is the
  // aeroplane waiting to board, as Salt Lake City's InGate is): neutral, as before.
  assert.equal(yhzStatus('At Gate'), 'scheduled');
});

test('Sea-Tac: AC8806 from Vancouver, "Landed" with no time at S1A, is landed, not arrived', () => {
  // The row as Sea-Tac's status page lists it (the same cells as the 2026-10-12 capture).
  const row = '<tr class="ItemStyleClass"><td>Vancouver <span>(YVR)</span></td><td>Air Canada</td><td>AC8806</td>'
    + '<td>11-04-2026</td><td>6:22 PM</td><td><span>Landed</span></td><td>S1A</td><td>16</td>'
    + '<td><a data-target="#modalAirline19205265368806ACYVR"></a></td></tr>';
  const [ac] = W.seaParsePage('<table>' + row + '</table>', 'arr', P('2026-11-05T02:10:00Z'));
  assert.ok(ac, 'AC8806 parsed');
  assert.equal(ac.status, 'landed');
  assert.equal(ac.arrival.gate, 'S1A');
  assert.equal(ac.arrival.revisedTime, undefined, 'no time: the board must not print the schedule as the landing');
  assert.equal(ac.arrival.runwayTime, undefined);
  // The captured page: its three Landed rows.
  const cap = W.seaParsePage(fx('sea-rows-arr-2026-10-12.html'), 'arr', P('2026-10-12T14:45:00-07:00'));
  assert.deepEqual(cap.filter((r) => r.status === 'landed').map((r) => r.number).sort(), ['AF8992', 'DL143', 'KL6033']);
  assert.equal(cap.filter((r) => r.status === 'arrived').length, 0);
});

test('the airports that have both words keep them apart', () => {
  // Minneapolis: LANDED and ARRIVED AT GATE.
  const msp = W.mspParsePage(fx('msp-arr-sample.html'), 'arr', P('2026-09-05T21:10:00-05:00'));
  assert.equal(num(msp, 'UA2076').status, 'landed', 'MSP "Landed"');
  assert.equal(num(msp, 'WN1577').status, 'arrived', 'MSP "Arrived at Gate"');
  // Raleigh-Durham: flightStatus-Landed and flightStatus-InGate.
  const rdu = W.rduParsePage(fx('rdu-arr-sample.html'), 'arr', P('2026-09-05T22:10:00-04:00'));
  assert.deepEqual(rdu.filter((r) => r.status === 'landed').map((r) => r.number).sort(), ['MX1067', 'UA1706', 'UA1989', 'UA2359']);
  assert.equal(rdu.filter((r) => r.status === 'arrived').length, 66, 'the InGate rows');
  // Heathrow: LD "Landed 05:09" and LB "Landed 05:09, bags delivered on belt 5".
  const lhr = W.lhrParseFeed(fx('lhr-sample.json'), 'arr', P('2026-09-05T05:00:00+01:00'));
  assert.equal(num(lhr, 'BA074').status, 'arrived', 'LB: the bags are off');
  // The tables of the airports whose vocabularies carry both.
  assert.equal(W.sydStatus('Landed'), 'landed');
  assert.equal(W.sydStatus('Arrived'), 'arrived');
  assert.equal(W.ymmStatus('Landed'), 'landed');
  assert.equal(W.ymmStatus('Arrived'), 'arrived');
  assert.equal(W.yxsStatus('Landed'), 'landed');
  assert.equal(W.yxsStatus('Arrived'), 'arrived');
  assert.match(fnIn(WSRC, 'mcoStatus'), /case "LD": return "landed";/);
  assert.match(WSRC, /AR: "arrived", LD: "landed", DP: "departed"/, 'Orlando: AR Arrived, LD Landed');
  assert.match(WSRC, /LANDED: "landed", ARRIVED: "arrived",/, 'JFK');
  assert.match(WSRC, /"landed": "landed", "arrived": "arrived"/, 'Hobart');
  assert.match(WSRC, /ARRIVED: "arrived", LANDED: "landed",/, 'Salt Lake City');
  assert.match(WSRC, /const RDU_STATUS = \{ INGATE: "arrived", LANDED: "landed",/);
  assert.match(WSRC, /LDD: "landed", LND: "landed", BAG: "arrived", ONB: "arrived"/, 'Pearson, far-arrival rows');
});

test('Zurich: Landed (7) and the landing roll (200) are landed; the first bag on the race track makes it arrived', () => {
  assert.equal(W.zrhStatus(7, 'Landed', 'arr'), 'landed');
  assert.equal(W.zrhStatus(7, 'Landed', 'arr', true), 'arrived');
  assert.equal(W.zrhStatus(200, 'Rolling', 'arr'), 'landed');
  assert.equal(W.zrhStatus(200, 'Rolling', 'arr', true), 'landed', 'still rolling, whatever else');
  assert.equal(W.zrhStatus(200, 'Rolling', 'dep'), 'departed');
  const zrh = W.zrhParseFeed(fx('zrh-sample-2026-09-06.json'), 'arr', P('2026-09-06T08:17:56+02:00'));
  assert.equal(num(zrh, 'WK369').status, 'arrived', 'Landed, first bag 05:07Z: at the gate');
  assert.equal(num(zrh, 'TG970').status, 'landed', 'Landed, no bag yet');
  assert.equal(num(zrh, 'VY6246').status, 'landed', 'Rolling');
  assert.equal(zrh.filter((r) => r.status === 'arrived').length, 22);
  assert.equal(zrh.filter((r) => r.status === 'landed').length, 16);
});

test('where the airport keeps writing Landed at the gate, its own gate evidence makes it arrived', () => {
  // Boston: Remarks "Landed", RemarksWithTime "Arrived", ActualGateTime 9:12 PM.
  const bos = W.bosParseFeed(JSON.stringify(JSON.parse(fx('bos-sample.json')).arr), 'arr', P('2026-09-05T01:00:00-04:00'));
  assert.equal(num(bos, 'B6474').status, 'arrived');
  const bare = JSON.parse(fx('bos-sample.json')).arr;
  bare.Flights = bare.Flights.map((r) => Object.assign({}, r, { RemarksWithTime: 'Landed', ActualGateTime: '' }));
  assert.equal(num(W.bosParseFeed(JSON.stringify(bare), 'arr', P('2026-09-05T01:00:00-04:00')), 'B6474').status, 'landed', 'no gate time: landed');
  // Charlotte (and Las Vegas, Houston: the same vendor): status Landed, originalStatus Arrived.
  const clt = W.cltParseFeed(fx('clt-sample.json'), 'arr', P('2026-09-04T22:00:00-04:00'));
  assert.equal(num(clt, 'B62149').status, 'arrived');
  const b6 = JSON.parse(fx('clt-sample.json')).data.flights.find((r) => r.codeShareFlightNumber === 'B62149');
  const one = (o) => JSON.stringify({ data: { flights: [Object.assign({}, b6, o)] } });
  assert.equal(W.cltParseFeed(one({ originalStatus: 'ON TIME' }), 'arr', P('2026-09-04T22:00:00-04:00'))[0].status, 'landed');
  assert.equal(W.cltParseFeed(one({ originalStatus: 'ON TIME', onBlockTimestamp: 1788577500 }), 'arr', P('2026-09-04T22:00:00-04:00'))[0].status, 'arrived');
  const iah = W.parseIahFeed(fx('iah-arr-sample.json'), 'arr', P('2026-09-06T01:15:42-05:00'));
  assert.equal(num(iah, 'UA1660').status, 'arrived', 'Landed / ARRIVED');
  // O'Hare: Status Landed from the runway on; ArrivalDateTimeActualGate on stand.
  const ord = W.ordParseFeed(fx('ord-sample.json'), 'arr', P('2026-09-05T01:00:00-04:00'));
  assert.equal(num(ord, '5Y753').status, 'landed', 'runway time only');
  const atGate = JSON.parse(fx('ord-sample.json')).map((r) => (r.AirlineCodeFlightNumber === '5Y753'
    ? Object.assign({}, r, { ArrivalDateTimeActualGate: r.ArrivalDateTimeActualRunway }) : r));
  assert.equal(num(W.ordParseFeed(JSON.stringify(atGate), 'arr', P('2026-09-05T01:00:00-04:00')), '5Y753').status, 'arrived', 'its gate time');
  // Edinburgh: "LANDED 03:54" stays on the row; the first bag (04:18) makes it on stand once it has passed.
  assert.equal(num(W.ediParseFeed(fx('edi-arr-sample.json'), 'arr', P('2026-09-05T03:00:00Z')), 'LS726').status, 'landed');
  assert.equal(num(W.ediParseFeed(fx('edi-arr-sample.json'), 'arr', P('2026-09-05T03:30:00Z')), 'LS726').status, 'arrived');
});

test('the board\'s own adapters (feed-router.js) split the same way', () => {
  const R = new Function(['fidsNeutralWord', 'yqmStatus', 'tpaStatus', 'yyzStatus', 'yulStatus', 'yhuStatus', 'ytzStatus', 'panynjStatus', 'miaStatus']
    .map((n) => fnIn(ROUTER, n)).join('\n')
    + '\nreturn { yqmStatus, tpaStatus, yyzStatus, yulStatus, yhuStatus, ytzStatus, panynjStatus, miaStatus };')();
  assert.equal(R.yyzStatus('LND'), 'landed', 'Pearson LND');
  assert.equal(R.yyzStatus('LDD'), 'landed', 'Pearson LDD');
  for (const c of ['ARR', 'BAG', 'ONB']) assert.equal(R.yyzStatus(c), 'arrived', c);
  assert.equal(R.yqmStatus('Arrived at 9:47 PM'), 'arrived', 'Moncton');
  assert.equal(R.yqmStatus('Landed'), 'landed');
  for (const f of ['yulStatus', 'yhuStatus', 'ytzStatus']) {
    assert.equal(R[f]('Landed'), 'landed', f);
    assert.equal(R[f]('Arrived'), 'arrived', f);
  }
  assert.equal(R.tpaStatus('', 'Landed'), 'landed');
  assert.equal(R.tpaStatus('AR', ''), 'arrived');
  assert.equal(R.tpaStatus('', 'Baggage on belt'), 'arrived');
  assert.equal(R.panynjStatus('Landed', false), 'landed');
  assert.equal(R.panynjStatus('Arrived', false), 'arrived');
  assert.equal(R.panynjStatus('Landed', true), 'departed', 'a departure that reached its destination');
  assert.equal(R.miaStatus('Landed 9:08P', 0), 'landed');
  assert.equal(R.miaStatus('Arrived 9:08P', 0), 'arrived');
  // The YQM memory filter keeps both: each is a row that came down.
  assert.equal(W.yqmSeenStatus('Landed'), 'arrived');
  assert.equal(W.yqmSeenStatus('Arrived at 9:47 PM'), 'arrived');
});
