// Canada wave 2 — YLW / YXX / YQR / YHM parsers against verbatim
// captures (2026-09-05). Pins: Kelowna's UTC-ISO + tail number, the
// direction field; Abbotsford's carrier-name→IATA and local scheddate;
// Regina's icon-class airline codes on a fixed (no-DST) offset; and
// Hamilton's #arrivals/#departures pane split with data-attr rows.
// 2026-11-18 — Hamilton rebuilt its page (board plugin hia-flight-status):
// the fixture is that page as answered on the day, and the old markup, which
// the parser read until then, now parses to nothing instead of to stale rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ylwParseFeed, yxxParseFeed, yqrParsePage, yhmParseBoard } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-04T22:00:00-07:00');

test('ylw: UTC ISO to Pacific, gate/belt/tail, direction field respected', () => {
  const arr = ylwParseFeed(fx('ylw-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const f = arr.find((x) => x.number === '4N579');
  assert.ok(f, '4N579 present');
  assert.ok(f.arrival.scheduledTime.local.startsWith('2026-09-04 19:00'), f.arrival.scheduledTime.local);
  assert.ok(f.arrival.scheduledTime.local.endsWith('-07:00'), 'PDT');
  assert.equal(f.arrival.gate, '4');
  assert.equal(f.arrival.baggageBelt, '3');           // "03" → "3"
  assert.equal(f.aircraft.reg, 'C-FANF');
  assert.equal(f.status, 'arrived');
  assert.equal(f.departure.airport.iata, 'YVR');
  // Departures direction must be filtered out of the arrivals read.
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'YLW'));
});

test('yxx: carrier name maps to IATA; local scheddate; revised time', () => {
  const arr = yxxParseFeed(fx('yxx-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const flair = arr.find((x) => /507$/.test(x.number));
  assert.ok(flair, 'Flair 507 present');
  assert.equal(flair.departure.airline.iata, 'F8');   // "Flair Air" → F8
  assert.equal(flair.status, 'cancelled');
  assert.ok(flair.arrival.scheduledTime.local.startsWith('2026-09-03 10:10'), flair.arrival.scheduledTime.local);
  assert.equal(flair.departure.airport.iata, 'YYC');  // Calgary
});

test('yqr: icon-class airline code, fixed Regina offset, revised', () => {
  const arr = yqrParsePage(fx('yqr-arr-sample.html'), 'arr', NOW);
  assert.ok(arr.length >= 2, `parsed ${arr.length}`);
  const ws = arr.find((x) => x.number === 'WS3368');
  assert.ok(ws, 'WS3368 present');
  assert.equal(ws.arrival.airline.iata, 'WS');        // icon-ws-blue
  assert.ok(ws.arrival.scheduledTime.local.startsWith('2026-09-04 20:30'), ws.arrival.scheduledTime.local);
  assert.ok(ws.arrival.scheduledTime.local.endsWith('-06:00'), 'Regina CST, no DST');
  assert.equal(ws.status, 'arrived');
  assert.ok(ws.arrival.revisedTime && ws.arrival.revisedTime.local.includes('21:43'));
  assert.equal(ws.departure.airport.iata, 'YYC');
});

// The page prints no year ("Nov 18"): the clock sits where the capture does.
const YHM_NOW = Date.parse('2026-11-18T15:41:00Z');
test('yhm: the rebuilt page (2026-11-18) — panel split, row attributes, the place with its code, the estimate', () => {
  const html = fx('yhm-sample.html');
  const arr = yhmParseBoard(html, 'arr', YHM_NOW);
  const dep = yhmParseBoard(html, 'dep', YHM_NOW);
  // id="tab-arrivals" on the tab button is not the panel: four and three, not seven and seven.
  assert.deepEqual(arr.map((x) => x.number), ['PD2426', 'AC8931', 'PD2439', 'PD482']);
  assert.deepEqual(dep.map((x) => x.number), ['AC8932', 'PD2446', 'AC8928']);
  for (const x of arr) assert.equal(x.arrival.airport.iata, 'YHM');
  for (const x of dep) assert.equal(x.departure.airport.iata, 'YHM');
  // PD 2426 from Halifax (YHZ): 11:00, "Delayed", estimate "11:32 / Nov 18".
  const pd = arr[0];
  assert.equal(pd.status, 'delayed');
  assert.equal(pd.arrival.scheduledTime.local, '2026-11-18 11:00:00-05:00');
  assert.equal(pd.arrival.scheduledTime.utc, '2026-11-18 16:00:00+00:00');
  assert.equal(pd.arrival.revisedTime.local, '2026-11-18 11:32:00-05:00');
  assert.equal(pd._authTs, Date.parse('2026-11-18T11:00:00-05:00'));
  assert.equal(pd.arrival.airline.iata, 'PD');           // data-airline-code
  assert.equal(pd.arrival.airline.name, 'Porter');       // data-airline
  assert.equal(pd.departure.airport.iata, 'YHZ');        // "Halifax (YHZ)": the page's own code
  assert.equal(pd.departure.airport.name, 'Halifax');
  // AC 8931: the word is "Early" (in a pill classed "landed": the word is read, not the class), estimate before the time.
  const ac = arr[1];
  assert.equal(ac.status, 'scheduled');
  assert.equal(ac.arrival.scheduledTime.local, '2026-11-18 11:25:00-05:00');
  assert.equal(ac.arrival.revisedTime.local, '2026-11-18 11:09:00-05:00');
  assert.ok(ac.arrival.revisedTime.utc < ac.arrival.scheduledTime.utc, 'early, not late');
  // An estimate equal to the time is no revised time ("On Time", "22:05 / Nov 18").
  const yhu = arr[2];
  assert.equal(yhu.status, 'ontime');
  assert.equal(yhu.arrival.revisedTime, undefined);
  assert.equal(yhu.departure.airport.iata, 'YHU');
  // Past midnight the row carries its own date: Nov 19 00:08, not Nov 18.
  assert.equal(arr[3].arrival.scheduledTime.local, '2026-11-19 00:08:00-05:00');
  assert.equal(dep[0].departure.scheduledTime.local, '2026-11-18 11:40:00-05:00');
  assert.equal(dep[0].arrival.airport.iata, 'YYZ');
  assert.equal(dep[0].departure.airline.name, 'Air Canada');
  assert.equal(dep[2].departure.scheduledTime.local, '2026-11-19 05:30:00-05:00');
  // Each row repeats its cells as spans for the phone layout: read once, not twice.
  assert.equal((html.match(/hia-flight-status__row"/g) || []).length, 7);
});

test('yhm: the year the page does not print is the nearest one, and the old markup is no longer read as rows', () => {
  const html = fx('yhm-sample.html').replace(/Nov 18/g, 'Dec 31').replace(/Nov 19/g, 'Jan 1');
  const arr = yhmParseBoard(html, 'arr', Date.parse('2026-12-31T20:00:00-05:00'));
  assert.equal(arr[0].arrival.scheduledTime.local, '2026-12-31 11:00:00-05:00');
  assert.equal(arr[3].arrival.scheduledTime.local, '2027-01-01 00:08:00-05:00');
  // The September page: .flight divs with data-datetime. Nothing in it is a row now.
  const old = "<div id=\"arrivals\"><div class='flight Delayed' data-datetime='2026-09-04 23:13:00' data-city='Calgary' data-airline='Porter'>"
    + "<span class='flight-number'>PD 486</span></div></div><div id=\"departures\"></div>";
  assert.deepEqual(yhmParseBoard(old, 'arr', YHM_NOW), []);
});

test('canada-wave2: garbage in, empty out', () => {
  assert.deepEqual(ylwParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(yxxParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(yqrParsePage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(yhmParseBoard('<html></html>', 'dep', NOW), []);
});
