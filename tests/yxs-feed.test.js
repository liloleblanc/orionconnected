// YXS Prince George — pgairport.ca "yxs_ifids" WordPress admin-ajax board
// against two verbatim captures of the nonce-less endpoint:
//   yxs-feed-sample.json          2026-09-05 23:07 PDT (data.raw 23:06:11) — 53 arr / 52 dep
//   yxs-feed-evening-sample.json  2026-09-05 21:48 PDT (data.raw 21:48:48) — 46 arr / 47 dep,
//                                 the one with Late / Delayed / Departed rows still on the board
// Pins: the {success,data:{html}} envelope, the #panel-arrivals /
// #panel-departures split, "23:34, Sep 5" (no year) landing on the Pacific
// offset, the dateless "Expected HH:MM" becoming revisedTime only when it
// differs from Scheduled (and settling across midnight), the carrier code
// from the logo filename (icon-9m → 9M, icon-pca → 8P) prefixed onto the
// digits-only flight number, city names → IATA (Terrace/Fort Nelson from
// the YXS map, the big ones from the shared map), gate on both directions,
// and data-baggage attached to arrivals only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYxsPanels, yxsStatus } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T23:07:00-07:00');           // the 23:07 capture moment
const NOW_EVENING = Date.parse('2026-09-05T21:49:00-07:00');   // the 21:48 capture moment

test('yxs arrivals: count, Pacific offset, AC8349 fields, estimate one minute off schedule', () => {
  const arr = parseYxsPanels(fx('yxs-feed-sample.json'), 'arr', NOW);
  assert.equal(arr.length, 53, `parsed ${arr.length}`);
  for (const f of arr) {
    assert.equal(f.arrival.airport.iata, 'YXS');
    assert.equal(f.arrival.airport.icao, 'CYXS');
    assert.equal(f.arrival.airport.name, 'Prince George');
    assert.ok(f.arrival.scheduledTime.local.endsWith('-07:00'), f.arrival.scheduledTime.local);   // PDT, not the page's "PST" label
  }
  // The only row left for Sep 5 at 23:07: AC8349 from Vancouver, 23:34 expected 23:35.
  const ac = arr.find((f) => f.number === 'AC8349' && f.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(ac, 'AC8349 (Sep 5) present');
  assert.equal(ac.arrival.scheduledTime.local, '2026-09-05 23:34:00-07:00');
  assert.equal(ac.arrival.scheduledTime.utc, '2026-09-06 06:34:00+00:00');
  assert.equal(ac.arrival.revisedTime.local, '2026-09-05 23:35:00-07:00');
  assert.equal(ac.arrival.revisedTime.utc, '2026-09-06 06:35:00+00:00');
  assert.equal(ac.arrival.gate, '2A');
  assert.equal(ac.arrival.baggageBelt, undefined);            // data-baggage=""
  assert.equal(ac.status, 'scheduled');                       // "On Time"
  assert.equal(ac.departure.airport.iata, 'YVR');
  assert.equal(ac.departure.airport.name, 'Vancouver');
  assert.equal(ac.arrival.airline.iata, 'AC');                // icon-ac.png
  assert.equal(ac.arrival.airline.name, 'Air Canada');
  assert.equal(ac.departure.scheduledTime.local, ac.arrival.scheduledTime.local);   // far side mirrors home time (no far-end times in the feed)
  assert.equal(ac._authTs, Date.parse('2026-09-05T23:34:00-07:00'));
  assert.equal(ac._authTs, 1788676440000);
  // The same flight runs daily: five instances, Sep 5 through Sep 9.
  assert.equal(arr.filter((f) => f.number === 'AC8349').length, 5);
  // 23:07 PDT on Sep 5 is 06:07 UTC on Sep 6 — the year/day anchor must not slip.
  assert.equal(arr.filter((f) => f.arrival.scheduledTime.local.startsWith('2026-09-05')).length, 1);
});

test('yxs arrivals: belt on 8P1498, 9M/8P from the logo filename, regional cities resolve', () => {
  const arr = parseYxsPanels(fx('yxs-feed-sample.json'), 'arr', NOW);
  const pc = arr.find((f) => f.number === '8P1498' && f.arrival.scheduledTime.local.startsWith('2026-09-06'));
  assert.ok(pc, '8P1498 (Sep 6) present');
  assert.equal(pc.arrival.scheduledTime.local, '2026-09-06 18:40:00-07:00');
  assert.equal(pc.arrival.baggageBelt, '1');                  // data-baggage="1"
  assert.equal(pc.arrival.gate, '1A');
  assert.equal(pc.arrival.revisedTime, undefined);            // Expected 18:40 == Scheduled 18:40
  assert.equal(pc.departure.airport.iata, 'YLW');
  assert.equal(pc.departure.airport.name, 'Kelowna');
  assert.equal(pc.arrival.airline.iata, '8P');                // icon-pca.png
  assert.equal(pc.arrival.airline.name, 'Pacific Coastal Airlines');
  assert.equal(arr.filter((f) => f.arrival.baggageBelt).length, 4, 'the four 8P1498 rows are the only belted arrivals');
  // Central Mountain Air: 13 rows, all 9M, from the northern-BC map and the shared map.
  const cma = arr.filter((f) => f.arrival.airline.name === 'Central Mountain Air');
  assert.equal(cma.length, 13);
  for (const f of cma) { assert.equal(f.arrival.airline.iata, '9M'); assert.match(f.number, /^9M\d{3}$/); }
  const terrace = arr.find((f) => f.number === '9M708' && f.arrival.scheduledTime.local.startsWith('2026-09-06'));
  assert.ok(terrace, '9M708 present');
  assert.equal(terrace.departure.airport.iata, 'YXT');
  assert.equal(terrace.departure.airport.name, 'Terrace');
  assert.equal(terrace.arrival.scheduledTime.local, '2026-09-06 14:55:00-07:00');
  const fn = arr.find((f) => f.number === '9M786');
  assert.ok(fn, '9M786 present');
  assert.equal(fn.departure.airport.iata, 'YYE');             // Fort Nelson
  assert.equal(fn.arrival.scheduledTime.local, '2026-09-07 13:45:00-07:00');
  assert.equal(arr.find((f) => f.number === '9M631').departure.airport.iata, 'YEG');
  assert.equal(arr.find((f) => f.number === '8P1413').departure.airport.iata, 'YYJ');
  assert.equal(arr.find((f) => f.number === 'WS3597').departure.airport.iata, 'YYC');
  // Every row resolved a carrier and a far-end code; the four carriers of the board.
  assert.ok(arr.every((f) => f.arrival.airline.iata && f.departure.airport.iata), 'no unresolved carrier/city');
  assert.deepEqual([...new Set(arr.map((f) => f.arrival.airline.iata))].sort(), ['8P', '9M', 'AC', 'WS']);
  assert.equal(arr.filter((f) => f.arrival.airline.iata === 'WS').length, 15);
  assert.equal(arr.filter((f) => f.arrival.airline.iata === 'AC').length, 17);
  assert.equal(arr.filter((f) => f.arrival.airline.iata === '8P').length, 8);
  assert.ok(arr.every((f) => f.number.startsWith(f.arrival.airline.iata)), 'number carries the carrier prefix');
});

test('yxs departures: count, first/last rows, four-day horizon, gate but never a belt', () => {
  const dep = parseYxsPanels(fx('yxs-feed-sample.json'), 'dep', NOW);
  assert.equal(dep.length, 52, `parsed ${dep.length}`);
  for (const f of dep) {
    assert.equal(f.departure.airport.iata, 'YXS');
    assert.ok(f.departure.scheduledTime.local.endsWith('-07:00'));
    assert.ok(f.departure.gate, 'gate on every departure');
    assert.equal(f.departure.baggageBelt, undefined);
    assert.equal(f.arrival.baggageBelt, undefined);           // data-baggage="1" on 9M728/8P1493 is ignored for departures
  }
  assert.equal(dep[0].number, 'AC8342');                      // the day was done at 23:07; first row is tomorrow 06:15
  assert.equal(dep[0].departure.scheduledTime.local, '2026-09-06 06:15:00-07:00');
  assert.equal(dep[0].departure.gate, '2A');
  assert.equal(dep[0].arrival.airport.iata, 'YVR');
  assert.equal(dep[0].status, 'scheduled');
  const last = dep[dep.length - 1];
  assert.equal(last.number, 'AC8350');
  assert.equal(last.departure.scheduledTime.local, '2026-09-09 20:20:00-07:00');
  assert.deepEqual([...new Set(dep.map((f) => f.departure.scheduledTime.local.slice(0, 10)))],
    ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09']);
  // 9M728 to Kelowna carries data-baggage="1" in the payload — a departure has no belt.
  const k = dep.find((f) => f.number === '9M728');
  assert.ok(k, '9M728 present');
  assert.equal(k.arrival.airport.iata, 'YLW');
  assert.equal(k.arrival.baggageBelt, undefined);
  // Nothing revised and everything "On Time" in this capture (dep side).
  assert.ok(dep.every((f) => f.status === 'scheduled' && !f.departure.revisedTime));
  // A departures read of the arrivals-only slice is empty and vice versa (panel split, not aria text).
  const html = JSON.parse(fx('yxs-feed-sample.json')).data.html;
  const arrOnly = html.slice(0, html.indexOf('id="panel-departures"'));
  assert.equal(parseYxsPanels(arrOnly, 'dep', NOW).length, 0);
  assert.equal(parseYxsPanels(arrOnly, 'arr', NOW).length, 53);
});

test('yxs evening capture: Late / Delayed / Departed with the expected clock as revisedTime', () => {
  const arr = parseYxsPanels(fx('yxs-feed-evening-sample.json'), 'arr', NOW_EVENING);
  const dep = parseYxsPanels(fx('yxs-feed-evening-sample.json'), 'dep', NOW_EVENING);
  assert.equal(arr.length, 46);
  assert.equal(dep.length, 47);
  // "Flight 3412 from Vancouver scheduled at 19:25, Sep 5 expected at 21:47 status Late."
  const late = arr.find((f) => f.number === 'WS3412' && f.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(late, 'WS3412 (Sep 5) present');
  assert.equal(late.status, 'delayed');
  assert.equal(late.arrival.scheduledTime.local, '2026-09-05 19:25:00-07:00');
  assert.equal(late.arrival.revisedTime.local, '2026-09-05 21:47:00-07:00');
  assert.equal(late.arrival.revisedTime.utc, '2026-09-06 04:47:00+00:00');
  assert.equal(late.arrival.gate, '1B');
  assert.equal(late.arrival.airline.iata, 'WS');              // icon-wja.png
  assert.equal(late.arrival.airline.name, 'WestJet');
  // Departures: WS3415 "Delayed" 20:00 → 22:00, AC8350 "Departed" 20:20 → 21:05 (still listed 40 min after).
  const d1 = dep.find((f) => f.number === 'WS3415' && f.departure.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(d1, 'WS3415 (Sep 5) present');
  assert.equal(d1.status, 'delayed');
  assert.equal(d1.departure.revisedTime.local, '2026-09-05 22:00:00-07:00');
  const d2 = dep.find((f) => f.number === 'AC8350' && f.departure.scheduledTime.local.startsWith('2026-09-05'));
  assert.ok(d2, 'AC8350 (Sep 5) present');
  assert.equal(d2.status, 'departed');
  assert.equal(d2.departure.scheduledTime.local, '2026-09-05 20:20:00-07:00');
  assert.equal(d2.departure.revisedTime.local, '2026-09-05 21:05:00-07:00');
  assert.equal(d2.arrival.airport.iata, 'YVR');
  // The estimate moves between captures: AC8349 read 23:29 at 21:48 and 23:35 at 23:07.
  const ac = arr.find((f) => f.number === 'AC8349' && f.arrival.scheduledTime.local.startsWith('2026-09-05'));
  assert.equal(ac.arrival.revisedTime.local, '2026-09-05 23:29:00-07:00');
  assert.deepEqual([...new Set([...arr, ...dep].map((f) => f.status))].sort(), ['delayed', 'departed', 'scheduled']);
});

// A minimal row in the plugin's own markup, for the cases the captures
// don't exhibit (midnight-crossing estimates, other statuses, winter,
// New Year, unknown carriers/cities).
const row = (o) => {
  const status = o.status || 'On Time';
  const airline = o.airline || 'Air Canada';
  const from = o.from || 'Vancouver';
  const img = o.icon === null ? '' : `<img class="yxs-ifids-widget__carrier-logo" src="https://www.pgairport.ca/wp-content/plugins/yxs_ifids/public/assets/images/icon-${o.icon || 'ac'}.png" alt="${airline} logo">`;
  return `<li class="yxs-ifids-widget__list-item"><button role="button" class="yxs-ifids-widget__item yxs-ifids-widget__item--${status.toLowerCase().replace(/\s+/g, '-')}" tabindex="0" aria-label="Flight ${o.flight} from ${from} scheduled at ${o.sched} status ${status}. 1 of 1 Fights." data-flight="${o.flight}" data-airline="${airline}" data-from="${from}" data-scheduled="${o.sched}" data-status="${status}" data-gate="${o.gate || '2A'}" data-baggage="${o.belt || ''}"><div class="yxs-ifids-widget__flight-carrier">${img}<span class="yxs-ifids-widget__carrier-name"><span class="yxs-ifids-widget__mobile-label">Carrier</span> ${airline}</span></div><div class="yxs-ifids-widget__flight-number"><span class="yxs-ifids-widget__mobile-label">Flight #</span> ${o.flight}</div><div class="yxs-ifids-widget__flight-from"><span class="yxs-ifids-widget__mobile-label yxs-from-to-label">From</span> ${from}</div><div class="yxs-ifids-widget__flight-scheduled"><span class="yxs-ifids-widget__mobile-label">Scheduled</span> ${o.sched}</div><div class="yxs-ifids-widget__flight-expected"><span class="yxs-ifids-widget__mobile-label">Expected</span> ${o.expected || o.sched.split(',')[0]}</div><div class="yxs-ifids-widget__flight-status"><span class="yxs-ifids-widget__mobile-label">Status</span> ${status}</div></button></li>`;
};
const panels = (arrRows, depRows) =>
  `<div id="panel-arrivals" class="yxs-ifids-widget__panel yxs-ifids-widget__panel--a" ><ol class="yxs-ifids-widget__list">${arrRows.join('')}</ol></div>`
  + `<div id="panel-departures" class="yxs-ifids-widget__panel yxs-ifids-widget__panel--d"  hidden><ol class="yxs-ifids-widget__list">${depRows.join('')}</ol></div>`;
const envelope = (html) => JSON.stringify({ success: true, data: { html, timestamp: 'September 5th 2026 at 11:06pm', raw: '2026-09-05 23:06:11' } });

test('yxs synthetic: estimate across midnight settles, statuses, belt only on arrivals', () => {
  const p = envelope(panels(
    [row({ flight: '8349', sched: '23:50, Sep 5', expected: '00:10', status: 'Late', belt: '2' }),
     row({ flight: '3414', sched: '00:10, Sep 6', expected: '23:50', status: 'Early', airline: 'WestJet', icon: 'wja' }),
     row({ flight: '631', sched: '08:55, Sep 6', status: 'Arrived', airline: 'Central Mountain Air', icon: '9m', from: 'Edmonton' })],
    [row({ flight: '8342', sched: '06:15, Sep 6', status: 'Cancelled', belt: '1' }),
     row({ flight: '1493', sched: '07:45, Sep 6', expected: '07:52', status: 'Boarding', airline: 'Pacific Coastal Airlines', icon: 'pca', from: 'Kelowna' })]
  ));
  const arr = parseYxsPanels(p, 'arr', NOW);
  assert.equal(arr.length, 3);
  // 23:50 expected 00:10 → next calendar day, a 20-minute delay, not a 23 h jump back.
  assert.equal(arr[0].arrival.scheduledTime.local, '2026-09-05 23:50:00-07:00');
  assert.equal(arr[0].arrival.revisedTime.local, '2026-09-06 00:10:00-07:00');
  assert.ok(arr[0].arrival.revisedTime.utc > arr[0].arrival.scheduledTime.utc);
  assert.equal(arr[0].status, 'delayed');
  assert.equal(arr[0].arrival.baggageBelt, '2');
  // 00:10 expected 23:50 → the evening before, 20 minutes early.
  assert.equal(arr[1].arrival.revisedTime.local, '2026-09-05 23:50:00-07:00');
  assert.equal(arr[1].status, 'scheduled');                   // "Early" is not a delay
  assert.equal(arr[1].number, 'WS3414');
  assert.equal(arr[2].status, 'arrived');
  assert.equal(arr[2].number, '9M631');
  assert.equal(arr[2].departure.airport.iata, 'YEG');
  const dep = parseYxsPanels(p, 'dep', NOW);
  assert.equal(dep.length, 2);
  assert.equal(dep[0].status, 'cancelled');
  assert.equal(dep[0].arrival.baggageBelt, undefined);        // belt on a departure row is ignored
  assert.equal(dep[0].departure.baggageBelt, undefined);
  assert.equal(dep[1].status, 'boarding');
  assert.equal(dep[1].departure.revisedTime.local, '2026-09-06 07:52:00-07:00');
  assert.equal(dep[1].number, '8P1493');
  assert.equal(dep[1].arrival.airport.iata, 'YLW');
});

test('yxs synthetic: winter offset, New Year rollover, carrier/city fallbacks, bare fragment', () => {
  // December in Prince George is PST, -08:00 — the tz helper, not a constant.
  const w = parseYxsPanels(envelope(panels([row({ flight: '8339', sched: '09:44, Dec 15' })], [])), 'arr', Date.parse('2026-12-14T12:00:00-08:00'));
  assert.equal(w[0].arrival.scheduledTime.local, '2026-12-15 09:44:00-08:00');
  assert.equal(w[0].arrival.scheduledTime.utc, '2026-12-15 17:44:00+00:00');
  // Read at 23:30 PST on Dec 31: "Dec 31" stays 2026, "Jan 1" becomes 2027.
  const ny = parseYxsPanels(envelope(panels([row({ flight: '8349', sched: '23:50, Dec 31' }), row({ flight: '8339', sched: '06:15, Jan 1' })], [])), 'arr', Date.parse('2026-12-31T23:30:00-08:00'));
  assert.equal(ny[0].arrival.scheduledTime.local, '2026-12-31 23:50:00-08:00');
  assert.equal(ny[1].arrival.scheduledTime.local, '2027-01-01 06:15:00-08:00');
  // A year on the date is honoured if the plugin ever prints one.
  const yr = parseYxsPanels(envelope(panels([row({ flight: '8349', sched: '23:50, Dec 31, 2025' })], [])), 'arr', NOW);
  assert.equal(yr[0].arrival.scheduledTime.local, '2025-12-31 23:50:00-08:00');
  // Carrier: unknown logo + unknown name → no code, bare digits, name kept; known name with no logo → code from the name.
  const c = parseYxsPanels(envelope(panels([
    row({ flight: '123', sched: '10:00, Sep 6', airline: 'Northern Thunderbird Air', icon: 'nta', from: 'Fort St. James' }),
    row({ flight: '631', sched: '11:00, Sep 6', airline: 'Central Mountain Air', icon: null, from: 'Fort St. John' }),
    row({ flight: '1413', sched: '12:00, Sep 6', airline: 'Pacific Coastal', icon: 'unknownlogo', from: 'St. John&#039;s' })
  ], [])), 'arr', NOW);
  assert.equal(c[0].number, '123');
  assert.equal(c[0].arrival.airline.iata, null);
  assert.equal(c[0].arrival.airline.name, 'Northern Thunderbird Air');
  assert.equal(c[0].departure.airport.iata, null);
  assert.equal(c[0].departure.airport.name, 'Fort St. James');
  assert.equal(c[1].number, '9M631');
  assert.equal(c[1].departure.airport.iata, 'YXJ');           // Fort St. John, YXS map
  assert.equal(c[2].number, '8P1413');                        // name map beats an unknown logo
  assert.equal(c[2].departure.airport.name, "St. John's");    // attribute entity decoded
  assert.equal(c[2].departure.airport.iata, 'YYT');           // shared map
  // The parser also accepts the bare HTML fragment (no JSON envelope).
  const bare = parseYxsPanels(panels([], [row({ flight: '8342', sched: '06:15, Sep 6' })]), 'dep', NOW);
  assert.equal(bare.length, 1);
  assert.equal(bare[0].number, 'AC8342');
  assert.equal(parseYxsPanels(panels([], [row({ flight: '8342', sched: '06:15, Sep 6' })]), 'arr', NOW).length, 0);
});

test('yxs status vocabulary', () => {
  assert.equal(yxsStatus('On Time'), 'scheduled');
  assert.equal(yxsStatus('Early'), 'scheduled');
  assert.equal(yxsStatus('Late', 'late'), 'delayed');
  assert.equal(yxsStatus('Delayed'), 'delayed');
  assert.equal(yxsStatus('Departed'), 'departed');
  assert.equal(yxsStatus('Arrived'), 'arrived');
  assert.equal(yxsStatus('Landed'), 'arrived');
  assert.equal(yxsStatus('Cancelled'), 'cancelled');
  assert.equal(yxsStatus('Diverted'), 'diverted');
  assert.equal(yxsStatus('Boarding'), 'boarding');
  assert.equal(yxsStatus('Final Call'), 'boarding');
  assert.equal(yxsStatus('Gate Closed'), 'gateclosed');
  assert.equal(yxsStatus('', 'on-time'), 'scheduled');
  assert.equal(yxsStatus(null), 'scheduled');
});

test('yxs: garbage in, empty out', () => {
  assert.deepEqual(parseYxsPanels('{}', 'dep', NOW), []);
  assert.deepEqual(parseYxsPanels('{"success":false,"data":"No data"}', 'arr', NOW), []);   // the refresh=1 answer
  assert.deepEqual(parseYxsPanels('{"success":true,"data":{"html":""}}', 'arr', NOW), []);
  assert.deepEqual(parseYxsPanels('x', 'arr', NOW), []);
  assert.deepEqual(parseYxsPanels('<html></html>', 'dep', NOW), []);
  assert.deepEqual(parseYxsPanels('', 'arr', NOW), []);
  assert.deepEqual(parseYxsPanels(null, 'arr', NOW), []);
  // A row with an unparseable date is skipped, not mis-dated.
  assert.deepEqual(parseYxsPanels(envelope(panels([row({ flight: '8349', sched: 'TBA' })], [])), 'arr', NOW), []);
});
