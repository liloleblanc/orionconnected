'use strict';

// WHY THIS EXISTS
//
// v23946. The gate's Arrival card printed a distance guess: great-circle
// distance at 850 km/h plus 25 minutes (estimateFlightDuration), moved again by
// the departure's delay. On 2026-10-02 it was early on all 8 Moncton
// departures checked, by 19 to 42 minutes (AC1983 read 6:15 where Pearson said
// 6:47; PD2382 5:33 PM where Montréal-Métropolitain said 6:15 PM). The board's
// rule is that a screen states nothing the airport or airline has not said.
//
// The Arrival card now prints the time the DESTINATION airport publishes for
// this flight, from its own arrivals list (the worker's /fararr), with its
// revised time in the board's revised form when it publishes one with its
// word, and its terminal and arrival gate on a small line under the time
// where its row has room for one. On the main landscape screens (1920x1080,
// 1680x1050, 1280x720) it has none, so the line is never shown there; it
// shows at 1280x1024 and in portrait. Where it goes on landscape is an open
// design call.
// Where no far-end list has the flight, the card prints a dash. The weather
// card's arrival clock reads the same source.
//
// The fixtures are the real lists of 2026-10-04 (tests/fixtures/fararr-2026-10-04),
// trimmed to Moncton's flights and a few rows that exercise the rules. Pearson
// blocked every request that day (its bot manager answers the worker with a
// challenge page), so its arrivals could not be captured; its row shape is
// pinned from the same day's departures capture instead.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workerPath = path.join(root, 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(workerPath, 'utf8');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const load = () => import(workerPath);
const FX = path.join(root, 'tests', 'fixtures', 'fararr-2026-10-04');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(FX, n), 'utf8'));

function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) break;
  }
  return src.slice(i, j + 1);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const farArrival = new Function(fnSource(CORE, '_gateFarArrival') + '\nreturn _gateFarArrival;')();
const revisedHtml = new Function('fidsEscHtml', fnSource(CORE, '_gateArrRevisedHtml') + '\nreturn _gateArrRevisedHtml;')(esc);
const to12h = new Function(fnSource(CORE, '_to12h') + '\nreturn _to12h;')();
// The real label rows, read out of _GATE_LBL.
const lblRow = (key) => {
  const m = CORE.match(new RegExp('\\n  ' + key + ':\\s*(\\{[^\\n]*\\}),\\n'));
  assert.ok(m, '_GATE_LBL.' + key + ' must exist');
  return new Function('return ' + m[1])();
};
// arrTerminal lives in the one store (board-strings.js); the gate's label
// table is frozen. _gateArrPlaceHtml reads both through _lblEntry, and picks
// and marks the languages through the store (pairLangs, markHalf).
const BS = require('../fids-current/js/board-strings.js');
const GATE_LBL = { gate: lblRow('gate') };
const lblEntry = (k) => GATE_LBL[k] || BS.entry(k) || { en: '' };
const placeHtml = (langs) => new Function('BoardStrings', '_lblEntry', 'fidsEscHtml', 'langs',
  fnSource(CORE, '_gateArrPlaceHtml') + '\nreturn _gateArrPlaceHtml;')(BS, lblEntry, esc, langs);

// Moncton's own departures list of 2026-10-04, read the way its row reads:
// "Oct 4 - 5:20 PM" in Moncton (Atlantic daylight time, UTC-3).
const YQM = fx('yqm-departures.json').list;
const MON = { Oct: '10' };
function yqmDep(flight, day) {
  const r = YQM.find((x) => x.flightId === flight && x.displayDate === 'Oct ' + day);
  assert.ok(r, flight + ' on Oct ' + day + ' is in the Moncton fixture');
  const m = r.dateTime.match(/^(\w{3}) (\d{1,2}) - (\d{1,2}):(\d{2}) (AM|PM)$/);
  let h = Number(m[3]) % 12; if (m[5] === 'PM') h += 12;
  const iso = `2026-${MON[m[1]]}-${String(m[2]).padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[4]}:00-03:00`;
  return { flight, to: r.airportCode, gate: r.gate, ts: Date.parse(iso) };
}

async function indexes() {
  const m = await load();
  return {
    m,
    YUL: m.farArrYulRows(fx('yul-arr.json').list),
    YHU: m.farArrYhuRows(fx('yhu-arr.json').list),
    YTZ: m.farArrYtzRows(fx('ytz-arr.json').list),
    YOW: m.farArrFromAdb(fx('yow-arr.json').arrivals),
    YYC: m.farArrFromAdb(fx('yyc-arr.json').arrivals),
    YDF: m.farArrFromAdb(fx('ydf-arr.json').arrivals)
  };
}

test('every Moncton departure of 2026-10-04 with a far-end list gets that airport\'s own arrival', async () => {
  const ix = await indexes();
  const { m } = ix;
  // flight, day, the destination's wall clock, its arrival gate, terminal.
  const want = [
    ['AC659', 4, 'YUL', '2026-10-04 11:54', '5', null],
    ['AC2037', 5, 'YUL', '2026-10-05 07:10', '15', null],
    ['AC659', 5, 'YUL', '2026-10-05 11:54', '15', null],       // tomorrow's AC659 takes tomorrow's row
    ['PD2382', 4, 'YHU', '2026-10-04 18:15', null, null],      // MET publishes no gate
    ['PD2294', 5, 'YTZ', '2026-10-05 07:45', null, null],      // Billy Bishop publishes no gate
    ['AC7753', 4, 'YOW', '2026-10-04 08:09', '30', null],
    ['PD2370', 4, 'YOW', '2026-10-04 12:52', '20', null],
    ['AC7753', 5, 'YOW', '2026-10-05 08:09', '25', null],
    ['WS813', 4, 'YYC', '2026-10-04 20:40', 'A12', null],      // Calgary's "terminal A" is the pier of gate A12
    ['WS813', 5, 'YYC', '2026-10-05 20:40', 'A15', null],
    ['PB924', 4, 'YDF', '2026-10-04 20:25', null, null]
  ];
  for (const [f, day, to, sched, gate, term] of want) {
    const d = yqmDep(f, day);
    assert.equal(d.to, to, f + ' flies to ' + to);
    const a = m.farArrAnswer(f, to, 'YQM', m.farArrPick(ix[to], f, 'YQM', d.ts, to));
    assert.equal(a.found, true, `${f} Oct ${day} is found at ${to}`);
    assert.equal(a.sched, sched, `${f} Oct ${day}: ${to}'s own scheduled arrival`);
    assert.equal(a.gate, gate, `${f} Oct ${day}: ${to}'s arrival gate`);
    assert.equal(a.term, term, `${f} Oct ${day}: terminal`);
    assert.equal(a.cancelled, false);
    // The card's rules turn it into one printed time, never before we leave.
    const shown = farArrival(a, { effDepTs: d.ts });
    assert.ok(shown && shown.instant >= d.ts + 20 * 60000, `${f}: a printable arrival`);
    assert.equal(shown.shown, sched.slice(11));
  }
});

test('the old guess was early: the destination\'s own times are later on every one of today\'s flights', async () => {
  // estimateFlightDuration's arithmetic (850 km/h + 25 min), kept here only to
  // show what the card used to print. The far end said later every time.
  const C = { YQM: [46.1122, -64.6786], YUL: [45.4706, -73.7408], YOW: [45.3225, -75.6692], YYC: [51.1139, -114.0203], YHU: [45.5175, -73.4169] };
  const guessMins = (a, b) => {
    const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) / 850 * 60 + 25);
  };
  const ix = await indexes();
  for (const [f, day, to] of [['AC659', 4, 'YUL'], ['AC7753', 4, 'YOW'], ['PD2370', 4, 'YOW'], ['WS813', 4, 'YYC'], ['PD2382', 4, 'YHU']]) {
    const d = yqmDep(f, day);
    const pick = ix.m.farArrPick(ix[to], f, 'YQM', d.ts);
    const guess = d.ts + guessMins(C.YQM, C[to]) * 60000;
    assert.ok(pick.s > guess, `${f}: ${to} publishes ${Math.round((pick.s - guess) / 60000)} min later than the guess`);
  }
});

test('the pick: same number, from our airport, the first arrival after we leave', async () => {
  const ix = await indexes();
  const { m } = ix;
  const ac659 = yqmDep('AC659', 4).ts;
  assert.equal(m.farArrPick(ix.YUL, 'AC0659', 'YQM', ac659).sl, '2026-10-04 11:54', 'a zero-padded number is the same flight');
  assert.equal(m.farArrPick(ix.YUL, 'AC659', 'YYZ', ac659), null, 'a row from another origin is not ours');
  assert.equal(m.farArrPick(ix.YUL, 'AC659', 'YQM', 0), null, 'no departure time, no pick');
  // Nothing that lands within 20 minutes of our departure, nothing 20 h on.
  assert.equal(m.farArrPick(ix.YUL, 'AC659', 'YQM', Date.parse('2026-10-04T11:40:00-04:00')), null);
  assert.equal(m.farArrPick(ix.YUL, 'AC659', 'YQM', Date.parse('2026-10-04T12:00:00-04:00')), null, 'not tomorrow\'s, 24 h on');
  // Montréal-Trudeau lists TS397 twice at 10:40: cancelled from Marrakech,
  // delayed from Halifax. The origin decides.
  const ts397 = Date.parse('2026-10-04T08:00:00-04:00');
  const fromYhz = m.farArrAnswer('TS397', 'YUL', 'YHZ', m.farArrPick(ix.YUL, 'TS397', 'YHZ', ts397));
  assert.deepEqual([fromYhz.rev, fromYhz.status, fromYhz.gate, fromYhz.cancelled], ['2026-10-04 17:10', 'delayed', '17', false]);
  const fromRak = m.farArrAnswer('TS397', 'YUL', 'RAK', m.farArrPick(ix.YUL, 'TS397', 'RAK', ts397 - 7 * 3600000));
  assert.equal(fromRak.cancelled, true);
  // The ACA and JZA twins of one Jazz flight collapse to one answer.
  const twin = m.farArrPick(ix.YUL, 'AC7776', 'YOW', Date.parse('2026-10-04T19:15:00-04:00'));
  assert.deepEqual([twin.sl, twin.g], ['2026-10-04 20:20', '25']);
  // A far end that names no origin (Billy Bishop) is matched on number and time.
  assert.equal(m.farArrPick(ix.YTZ, 'PD2294', 'YQM', yqmDep('PD2294', 5).ts).sl, '2026-10-05 07:45');
});

// THE WINDOW CLOSES AT THE ROUTE'S BLOCK TIME. On 2026-10-05 the live /fararr
// answered AC7753, Moncton to Ottawa, asked about with a 13:10 departure,
// with the NEXT day's 08:09 arrival: 19 h 59 min on, inside the 20 hours the
// window allowed on every route, for the gate to print with Tomorrow. The
// window now closes at 1.6 x the distance estimate (850 km/h + 25 min) plus
// 90 minutes, never later than 20 hours, and keeps 20 hours where an airport
// has no coordinates (farArrMaxMs).
const H = 3600000, MIN = 60000;
const farRow = (n, o, s) => ({ n, o, s, sl: 'x', r: null, rl: null, t: null, g: null, st: 'scheduled' });
// The edge's arithmetic, written out once more so a change to it is seen.
const edgeOf = (km) => Math.min(20 * H, Math.round((1.6 * (km / 850 * 60 + 25) + 90) * MIN));
const BOARD_COORDS = (() => {
  const w = {};
  new Function('window', fs.readFileSync(path.join(root, 'fids-current', 'js', 'airport-coords.js'), 'utf8'))(w);
  return w.AIRPORT_COORDS;
})();
const kmOf = (a, b) => {
  const p = BOARD_COORDS[a], q = BOARD_COORDS[b], r = Math.PI / 180;
  const h = Math.sin((q[0] - p[0]) * r / 2) ** 2 + Math.cos(p[0] * r) * Math.cos(q[0] * r) * Math.sin((q[1] - p[1]) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('tomorrow\'s instance of a short hop is never this departure\'s arrival', async () => {
  const ix = await indexes();
  const { m } = ix;
  // The live case, on the fixture's day: asked with 13:10, after Ottawa's
  // 08:09 row for that day; the next day's 08:09 is 19 h 59 min on.
  const late = Date.parse('2026-10-04T13:10:00-03:00');
  assert.equal(m.farArrPick(ix.YOW, 'AC7753', 'YQM', late).sl, '2026-10-05 08:09', 'what the 20-hour window took');
  assert.equal(m.farArrPick(ix.YOW, 'AC7753', 'YQM', late, 'YOW'), null, 'not tomorrow\'s 08:09');
  assert.deepEqual(m.farArrAnswer('AC7753', 'YOW', 'YQM', m.farArrPick(ix.YOW, 'AC7753', 'YQM', late, 'YOW')),
    { f: 'AC7753', to: 'YOW', from: 'YQM', found: false }, 'a dash, not a time from another day');
  for (const t of ['12:55', '11:00']) assert.equal(m.farArrPick(ix.YOW, 'AC7753', 'YQM', Date.parse(`2026-10-04T${t}:00-03:00`), 'YOW'), null, t);
  // The same for every Moncton departure that has a far-end list: asked
  // after its own row has gone by, with only the next day's left, inside the
  // old 20 hours.
  for (const [f, to] of [['AC659', 'YUL'], ['AC2037', 'YUL'], ['PD2370', 'YOW'], ['PD2382', 'YHU'], ['PD2294', 'YTZ'], ['WS813', 'YYC'], ['PB924', 'YDF']]) {
    const today = m.farArrPick(ix[to], f, 'YQM', yqmDep(f, 4).ts, to);
    assert.ok(today, `${f} Oct 4 has its row at ${to}`);
    const list = ix[to].concat([Object.assign({}, today, { s: today.s + 24 * H, sl: 'the next day' })]);
    const asked = today.s + 4 * H;
    assert.ok(m.farArrPick(list, f, 'YQM', asked), `${f}: the 20-hour window took the next day's`);
    assert.equal(m.farArrPick(list, f, 'YQM', asked, to), null, `${f} to ${to}: not the next day's`);
  }
  // The edge for Moncton-Ottawa (857 km): 1.6 x (60.5 + 25) + 90 = 227 min.
  const edge = m.farArrMaxMs('YQM', 'YOW');
  assert.equal(Math.round(edge / MIN), 227);
  assert.equal(edge, edgeOf(m.farArrKm('YQM', 'YOW')));
  const dep = yqmDep('AC7753', 5).ts;
  assert.ok(m.farArrPick([farRow('AC7753', 'YQM', dep + edge)], 'AC7753', 'YQM', dep, 'YOW'), 'at the edge: taken');
  assert.equal(m.farArrPick([farRow('AC7753', 'YQM', dep + edge + MIN)], 'AC7753', 'YQM', dep, 'YOW'), null, 'a minute past it: not');
  // The route asks with the far end: AC7754, Ottawa to Moncton, asked with
  // 23:00 after Moncton's 18:38 row; the next day's is 18 h 38 min on.
  const worker = (await load()).default;
  const kv = { get: async () => null, put: async () => {}, list: async () => ({ keys: [] }), delete: async () => {} };
  const env = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : kv) });
  const yqm = JSON.stringify(fx('yqm-arr.json').list.filter((r) => !r.remembered));
  const ask = async (q) => (await worker.fetch(new Request('https://fids-proxy.example/fararr?' + q, { headers: { Origin: 'https://fids.orionconnected.com' } }),
    env, { waitUntil() {}, passThroughOnException() {} })).json();
  await withNet(() => new Response(yqm, { status: 200 }), async () => {
    assert.deepEqual(await ask('f=AC7754&to=YQM&from=YOW&dep=' + Date.parse('2026-10-04T23:00:00-04:00')),
      { f: 'AC7754', to: 'YQM', from: 'YOW', found: false });
    const today = await ask('f=AC7754&to=YQM&from=YOW&dep=' + Date.parse('2026-10-04T16:00:00-04:00'));
    assert.deepEqual([today.found, today.sched], [true, '2026-10-04 18:38'], 'today\'s row is still found');
  });
});

test('today\'s instance and every real block time are inside the edge', async () => {
  const m = await load();
  // Real scheduled block times, minutes. Moncton's own are 2026-10-04/05
  // (its departures fixture against each far end's fixture); the rest are
  // the airlines' published timetables.
  // Halifax is the route's published 57 minutes (AC7200 is the flight
  // Moncton listed there on 2026-10-03).
  const real = [
    ['YQM', 'YHZ', 57, 'AC7200'], ['YQM', 'YUL', 95, 'AC2037'], ['YQM', 'YDF', 100, 'PB924'],
    ['YQM', 'YHU', 115, 'PD2382'], ['YQM', 'YOW', 119, 'AC7753'], ['YQM', 'YYZ', 142, 'AC1983'],
    ['YQM', 'YYZ', 141, 'AC647'], ['YQM', 'YYZ', 140, 'F8671'], ['YQM', 'YTZ', 155, 'PD2294'],
    ['YQM', 'MCO', 208, 'TS2328'], ['YQM', 'YYC', 325, 'WS813'], ['YHZ', 'LHR', 355, 'AC868'],
    ['YYZ', 'LHR', 440, 'AC858'], ['YVR', 'SYD', 940, 'AC33']
  ];
  for (const [a, b, mins, f] of real) {
    const edge = m.farArrMaxMs(a, b);
    assert.ok(edge < 20 * H || b === 'SYD', `${a}-${b} has its own edge`);
    assert.ok(mins * MIN + 90 * MIN <= edge, `${f} ${a}-${b}: ${mins} min is at least 90 min inside ${Math.round(edge / MIN)}`);
    const t0 = Date.parse('2026-10-05T12:00:00Z');
    assert.ok(m.farArrPick([farRow(f, a, t0 + mins * MIN)], f, a, t0, b), `${f} is taken`);
    assert.equal(m.farArrPick([farRow(f, a, t0 + mins * MIN + 24 * H)], f, a, t0, b), null, `${f}: tomorrow's is not`);
  }
  // One stop under the same number still fits: St. John's-Deer Lake-Moncton
  // (PB923), 200 min against 234.
  assert.ok(m.farArrMaxMs('YYT', 'YQM') - 200 * MIN >= 30 * MIN);
  // Moncton's other sun routes, by the same arithmetic on the board's own
  // coordinates (neither airport has a list /fararr reads): Punta Cana TS626
  // 275 min, Cancún TS682 325 min.
  for (const [b, mins] of [['PUJ', 275], ['CUN', 325]]) assert.ok(mins * MIN + 90 * MIN <= edgeOf(kmOf('YQM', b)), b);
  // Long-haul: the edge stops at the old 20 hours and still takes them.
  assert.equal(m.farArrMaxMs('YVR', 'SYD'), 20 * H);
  assert.equal(Math.round(m.farArrMaxMs('YHZ', 'LHR') / MIN), 648);
  const ac33 = Date.parse('2026-10-05T22:55:00-07:00');
  assert.ok(m.farArrPick([farRow('AC33', 'YVR', ac33 + 15 * H + 40 * MIN)], 'AC33', 'YVR', ac33, 'SYD'));
  const ac868 = Date.parse('2026-10-05T11:05:00-03:00');
  assert.ok(m.farArrPick([farRow('AC868', 'YHZ', ac868 + 5 * H + 55 * MIN)], 'AC868', 'YHZ', ac868, 'LHR'));
  assert.equal(m.farArrPick([farRow('AC868', 'YHZ', ac868 + 11 * H)], 'AC868', 'YHZ', ac868, 'LHR'), null, 'eleven hours is not a Halifax-London block');
  assert.ok(m.farArrPick([farRow('AC868', 'YHZ', ac868 + 11 * H)], 'AC868', 'YHZ', ac868), 'which the 20-hour window took');
  // No edge anywhere is later than 20 hours or earlier than the 20-minute floor.
  const codes = Object.keys(m._farArrCoords);
  for (const a of codes) for (const b of codes) {
    const e = m.farArrMaxMs(a, b);
    assert.ok(e <= 20 * H && e > 20 * MIN, `${a}-${b}`);
  }
});

test('every far end /fararr reads has coordinates, the board\'s own', async () => {
  const m = await load();
  const farEnds = Object.keys(m._authorityHandlers).map((k) => k.toUpperCase()).concat(['YHZ', 'YQM', 'YYZ', 'YUL', 'YHU', 'YTZ']);
  assert.ok(farEnds.length > 50);
  for (const c of farEnds) {
    assert.ok(m.farArrHas(c), c + ' is a far end');
    assert.ok(Array.isArray(m._farArrCoords[c]), c + ' has coordinates: add it to FARARR_COORDS with its far-end feed');
  }
  for (const c of ['EWR', 'LGA', 'TPA']) assert.ok(m._farArrCoords[c], c + ', a board airport, has coordinates');
  for (const [c, v] of Object.entries(m._farArrCoords)) assert.deepEqual(v, BOARD_COORDS[c], c + ' is where the board puts it');
  assert.equal(Math.round(m.farArrKm('YQM', 'YOW')), Math.round(kmOf('YQM', 'YOW')));
});

test('with no coordinates the window keeps the old 20 hours', async () => {
  const m = await load();
  // Narita and Dubai have no far-end list and no coordinates here; a board
  // that sent no origin, or no far end, measures nothing either.
  assert.equal(m.farArrMaxMs('YUL', 'NRT'), 20 * H);
  assert.equal(m.farArrMaxMs('YYZ', 'DXB'), 20 * H);
  assert.equal(m.farArrMaxMs('', 'YOW'), 20 * H, 'no origin');
  assert.equal(m.farArrMaxMs('YQM', undefined), 20 * H, 'no far end');
  assert.ok(Number.isNaN(m.farArrKm('YQM', 'NRT')));
  // AC5 Montréal-Narita, 13 h 50 min, and EK242 Toronto-Dubai, 13 h 40 min,
  // are taken; tomorrow's are not; the old edge holds at exactly 20 hours.
  const dep = Date.parse('2026-10-05T12:45:00-04:00');
  assert.ok(m.farArrPick([farRow('AC5', 'YUL', dep + 13 * H + 50 * MIN)], 'AC5', 'YUL', dep, 'NRT'));
  assert.ok(m.farArrPick([farRow('EK242', 'YYZ', dep + 13 * H + 40 * MIN)], 'EK242', 'YYZ', dep, 'DXB'));
  assert.equal(m.farArrPick([farRow('AC5', 'YUL', dep + 37 * H + 50 * MIN)], 'AC5', 'YUL', dep, 'NRT'), null);
  assert.ok(m.farArrPick([farRow('AC5', 'YUL', dep + 20 * H)], 'AC5', 'YUL', dep, 'NRT'));
  assert.equal(m.farArrPick([farRow('AC5', 'YUL', dep + 20 * H + MIN)], 'AC5', 'YUL', dep, 'NRT'), null);
  // A request that names no origin keeps exactly the old window: no better
  // than before, never worse.
  const ix = m.farArrFromAdb(fx('yow-arr.json').arrivals);
  assert.equal(m.farArrPick(ix, 'AC7753', '', Date.parse('2026-10-04T13:10:00-03:00'), 'YOW').sl, '2026-10-05 08:09');
});

test('each far end keeps its own clocks, its revisions and its words', async () => {
  const { YUL, YHU, YTZ, YOW, YYC } = await indexes();
  const row = (ix, n, sl) => ix.find((e) => e.n === n && e.sl === sl);
  // Montréal-Trudeau: the estimate the feed spells "Formated", the words.
  assert.deepEqual(row(YUL, 'UA3621', '2026-10-04 13:09'), { n: 'UA3621', o: 'EWR', s: Date.parse('2026-10-04T13:09:00-04:00'), sl: '2026-10-04 13:09', r: Date.parse('2026-10-04T12:40:00-04:00'), rl: '2026-10-04 12:40', t: null, g: '80', st: 'early' });
  assert.equal(row(YUL, 'DL5387', '2026-10-04 13:31').st, 'delayed');
  assert.equal(row(YUL, 'AC8570', '2026-10-04 15:45').st, 'cancelled');
  // Saint-Hubert: mostConfidentTime is the revision; its stand is never shown.
  assert.deepEqual([row(YHU, 'PD494', '2026-10-03 18:20').rl, row(YHU, 'PD494', '2026-10-03 18:20').st], ['2026-10-03 18:06', 'early']);
  assert.ok(YHU.every((e) => e.g === null), 'MET publishes no gate; the derived stand is not printed');
  // Billy Bishop: no codeshare mirrors, no derived stands, its words.
  assert.ok(!YTZ.some((e) => e.n === 'TS7078'), 'TS7078 on the Porter logo is a mirror of PD2294');
  assert.ok(YTZ.every((e) => e.g === null && e.r === null));
  assert.equal(row(YTZ, 'AC7865', '2026-10-04 10:55').st, 'cancelled');
  // Ottawa and Calgary arrive in the ADB shape; their wall clocks are kept
  // as printed, in their own zones.
  assert.deepEqual([row(YOW, 'AC7689', '2026-10-04 14:45').rl, row(YOW, 'AC7689', '2026-10-04 14:45').st], ['2026-10-04 15:10', 'delayed']);
  assert.equal(row(YYC, 'WS669', '2026-10-04 10:20').s, Date.parse('2026-10-04T10:20:00-06:00'));
  assert.ok(YYC.every((e) => e.t === null), 'a pier letter is not printed as a terminal');
});

test('Toronto Pearson: terminal and gate, codeshares, arrivals only', async () => {
  const m = await load();
  const cap = fx('yyz-dep-capture.json');
  // The real departures list gives no arrival rows.
  assert.equal(m.farArrYyzRows(cap.list).length, 0, 'type DEP rows are never read as arrivals');
  // An arrivals row has the same shape with type ARR and the origin first in
  // routes[]. Built from the real AC644 row, with the values Pearson published
  // for AC1983 on 2026-10-02 (06:47, Terminal 1, gate D53).
  const base = cap.list.find((r) => r.id2 === 'AC644');
  const arr = Object.assign({}, base, {
    key: 'A1005ACA1983YQMYYZ', id: 'ACA1983', id2: 'AC1983', type: 'ARR',
    schTime: '2026-10-05T06:47:00-04:00', latestTm: '2026-10-05T07:05:00-04:00', status: 'DEL',
    term: 'T1', gate: 'D53', routes: [Object.assign({}, base.routes[0])],
    ids: [{ id: 'UAL8079', id2: 'UA8079', alName: 'United Airlines' }]
  });
  const rows = m.farArrYyzRows([arr].concat(cap.list));
  assert.equal(rows.length, 2, 'the operating number and its codeshare');
  const dep = Date.parse('2026-10-05T05:25:00-03:00');
  const a = m.farArrAnswer('AC1983', 'YYZ', 'YQM', m.farArrPick(rows, 'AC1983', 'YQM', dep));
  assert.deepEqual([a.sched, a.rev, a.term, a.gate, a.status], ['2026-10-05 06:47', '2026-10-05 07:05', '1', 'D53', 'delayed']);
  assert.equal(m.farArrPick(rows, 'UA8079', 'YQM', dep).g, 'D53', 'the marketing number reads the operating row');
  // While Pearson blocks the worker its list is empty: no row, a dash.
  assert.deepEqual(m.farArrAnswer('AC1983', 'YYZ', 'YQM', m.farArrPick([], 'AC1983', 'YQM', dep)), { f: 'AC1983', to: 'YYZ', from: 'YQM', found: false });
});

test('the card prints the destination\'s time, its revision only with its word, and a dash otherwise', () => {
  const dep = Date.parse('2026-10-04T17:20:00-03:00');
  const base = { found: true, sched: '2026-10-04 18:15', schedTs: Date.parse('2026-10-04T18:15:00-04:00'), status: 'scheduled' };
  assert.deepEqual(farArrival(base, { effDepTs: dep }), {
    shown: '18:15', sched: '18:15', revised: false, early: false, instant: base.schedTs, schedTs: base.schedTs, term: '', gate: ''
  });
  const late = Object.assign({}, base, { rev: '2026-10-04 18:40', revTs: base.schedTs + 25 * 60000 });
  assert.equal(farArrival(late, { effDepTs: dep }).shown, '18:15', 'a revision the destination does not call Delayed is not printed');
  const delayed = farArrival(Object.assign({}, late, { status: 'delayed' }), { effDepTs: dep });
  assert.deepEqual([delayed.shown, delayed.sched, delayed.revised, delayed.early, delayed.instant], ['18:40', '18:15', true, false, late.revTs]);
  const early = farArrival(Object.assign({}, base, { status: 'early', rev: '2026-10-04 18:06', revTs: base.schedTs - 9 * 60000 }), { effDepTs: dep });
  assert.deepEqual([early.shown, early.revised, early.early], ['18:06', true, true]);
  // Dashes.
  assert.equal(farArrival(null, { effDepTs: dep }), null, 'no answer yet');
  assert.equal(farArrival({ found: false }, { effDepTs: dep }), null, 'no far-end row');
  assert.equal(farArrival(Object.assign({}, base, { cancelled: true, status: 'cancelled' }), { effDepTs: dep }), null, 'the destination says Cancelled');
  // Our airport posts a delay the destination has not caught up with: its
  // scheduled time would land before we can. Never moved by our delay.
  assert.equal(farArrival(base, { effDepTs: base.schedTs - 10 * 60000 }), null);
  assert.ok(farArrival(base, { effDepTs: base.schedTs - 20 * 60000 }));
});

test('the revised pair and the terminal-and-gate line', () => {
  assert.equal(revisedHtml({ shown: '18:40', was: '18:15', revised: true, early: false, fmt: to12h }),
    '<span class="g8-r2-strike">6:15 PM</span><span class="g8-r2-revised">6:40 PM</span>');
  assert.match(revisedHtml({ shown: '18:06', was: '18:15', revised: true, early: true, fmt: to12h }), /class="g8-r2-revised g8-rev-early"/);
  assert.equal(revisedHtml({ shown: '18:15', was: '18:15', revised: false, fmt: to12h }), '');
  assert.equal(revisedHtml({ shown: '18:40', was: '18:15', revised: false, fmt: to12h }), '');
  // A line per language when the pair is long, each whole and marked with its
  // language; French first in Québec. The terminal rides in its own span so
  // the fitter can keep the gate alone (data-both); the bar is in the markup
  // and shows only on one line.
  const en = placeHtml(['en', 'fr']);
  assert.equal(en('1', 'D53', false),
    '<span class="v2-fi-arrplace" data-both="1"><span class="v2-fi-arrplace-w" lang="en"><span class="v2-fi-arrplace-t">Terminal\u00a01 \u00b7 </span>Gate\u00a0D53</span>'
    + '<span class="v2-fi-arrplace-sep"> | </span><span class="v2-fi-arrplace-w" lang="fr"><span class="v2-fi-arrplace-t">Aérogare\u00a01 \u00b7 </span>Porte\u00a0D53</span></span>');
  // A short pair starts on one line, the bar between the two whole units.
  assert.equal(en('', '15', true),
    '<span class="v2-fi-arrplace v2-fi-arrplace-one"><span class="v2-fi-arrplace-w" lang="fr">Porte\u00a015</span><span class="v2-fi-arrplace-sep"> | </span><span class="v2-fi-arrplace-w" lang="en">Gate\u00a015</span></span>');
  // A terminal with no gate: nothing to fall back to.
  assert.equal(en('3', '', false),
    '<span class="v2-fi-arrplace"><span class="v2-fi-arrplace-w" lang="en"><span class="v2-fi-arrplace-t">Terminal\u00a03</span></span><span class="v2-fi-arrplace-sep"> | </span><span class="v2-fi-arrplace-w" lang="fr"><span class="v2-fi-arrplace-t">Aérogare\u00a03</span></span></span>');
  assert.equal(en('', '', false), '', 'nothing published, no line');
  assert.match(placeHtml(['en', 'de'])('', 'A12', false), /^<span class="v2-fi-arrplace"><span class="v2-fi-arrplace-w" lang="en">Gate\u00a0A12<\/span><\/span>$/, 'Gate | Gate prints once');
  assert.doesNotMatch(en('<b>', 'x"', false), /<b>|x"/, 'feed text is escaped');
  for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(BS.entry('arrTerminal')[l], 'Terminal in ' + l);
});

test('no gate surface prints the guess any more', () => {
  assert.doesNotMatch(CORE, /function estimateFlightDuration\(|estimateFlightDuration\(/, 'the 850 km/h guess is gone');
  assert.doesNotMatch(CORE, /function fidsMlFlightTimeMins\(|fidsMlFlightTimeMins\(|distance-time\/' \+/, 'the dead ADB route-time lookup is gone');
  assert.doesNotMatch(CORE, /\/ 850 \* 60/);
  const render = fnSource(CORE, 'renderDedicatedScreen');
  assert.match(render, /_farArrKick\(currentFlight, window\._gateIata \|\| iata\);/);
  assert.match(render, /_gateFarArrival\(_farArrGet\(currentFlight\), \{ effDepTs: _arrDepTs \}\)/);
  assert.doesNotMatch(render, /_dlyMs|_arrMovedMs|flightMins/, 'no arrival is moved or estimated');
  assert.match(render, /uxgGateHtml\(\{[^}]*arrSchedStr: _arrSchedStr, arrRevised: _arrRevised, arrEarly: _arrEarly, arrTerm: _arrTerm, arrGate: _arrGate, arrInstant: _arrInstant, arrTz: arrTz \}\)/);
  const uxg = fnSource(CORE, 'uxgGateHtml');
  assert.match(uxg, /var arrHtml = arrTimeStr \? _to12h\(arrTimeStr\) : '\\u2014';/, 'a dash when there is no published time');
  assert.match(uxg, /var _arrRevHtml = _gateArrRevisedHtml\(\{/);
  assert.match(uxg, /arrPlace: _arrPlaceHtml/);
  assert.doesNotMatch(uxg, /_gateArrMovedHtml|arrMovedMs/);
  // The rail's Arrival shelf: the day line, then the terminal and gate.
  assert.match(CORE, /_shelf\(_badge\(_svgArrive\)[^\n]*'v2-fi-time', _revRowCls\(_fiArr\), _gateDayLineHtml\(vars && vars\.dayArrive\) \+ \(\(vars && vars\.arrPlace\) \|\| ''\)\)/);
  // The weather card's arrival clock reads the same source under the same
  // rules, never the guess, and has no third source: our schedule plus the
  // feed's block time is the feed arrival _gateFarArrival may have rejected
  // (the plate then printed a time where the rail printed a dash).
  const wx = CORE.slice(CORE.indexOf('var _wxDepTs = 0, _wxArrTs = 0;'), CORE.indexOf('var _wxAtTime = function'));
  assert.match(wx, /_gateFarArrival\(_farArrGet\(cf\), \{ effDepTs: _wxEffDep \}\)/);
  const wxCode = wx.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(wxCode, /estimateFlightDuration|_wxDur\b|_durationMins|_arrTs\b/);
  assert.deepEqual(wxCode.match(/_wxArrTs = (?!0;)[^;]*;/g), ['_wxArrTs = _wxPub.instant;'], 'one assignment: the published instant');
  // The line under the time is sized with it, never clipped.
  assert.match(CSS, /\.v2-fi-value\.v2-fi-time \.v2-fi-arrplace \{\n  display: block !important;\n  font-size: \.26em !important;/);
  assert.match(CSS, /\.v2-fi-arrplace \.v2-fi-arrplace-w \{\n  display: block !important;\n  white-space: nowrap !important;/);
  assert.match(CSS, /\.v2-fi-arrplace\.v2-fi-arrplace-one \.v2-fi-arrplace-w \{\n  display: inline-block !important;/);
  assert.match(CSS, /\.v2-fi-arrplace \.v2-fi-arrplace-sep \{\n  display: none !important;/, 'the bar only on one line');
  assert.match(CSS, /\.v2-fi-arrplace\.v2-fi-arrplace-one \.v2-fi-arrplace-sep \{\n  display: inline !important;/);
  assert.match(CSS, /\.v2-fi-arrplace\.v2-fi-arrplace-noterm \.v2-fi-arrplace-t \{\n  display: none !important;/);
  // The rail's fitter sizes the Arrival time with the line hidden, then lets
  // the line take only the room left (_gateArrPlaceFit).
  assert.match(CORE, /var _ap = el\.querySelector\('\.v2-fi-arrplace'\);\n\s*if \(_ap\) \{ _ap\.style\.setProperty\('display', 'none', 'important'\); _ap\.parentNode\.removeChild\(_ap\); \}\n\s*_boxAssign\(el, tc\.clientWidth, availH, colR\);\n\s*if \(_ap\) \{ el\.appendChild\(_ap\); _gateArrPlaceFit\(el, _ap, availH, colR\); \}/);
});

// A small stand-in for the rail's Arrival value: its height is the time's
// line plus, when shown, the terminal-and-gate line; widths scale with size.
function fakeArrival({ timePx, timeH, place, units = 2, both = true, widthAt1px, valueW = 260 }) {
  const cls = new Set(place.one ? ['v2-fi-arrplace-one'] : []);
  const st = {};
  const ap = {
    style: { setProperty: (k, v) => { st[k] = v; }, removeProperty: (k) => { delete st[k]; } },
    classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) },
    getAttribute: (n) => (n === 'data-both' && both ? '1' : null),
    querySelectorAll: () => ({ length: units }),
    getBoundingClientRect: () => ({ right: 0 }),
    get shown() { return st.display !== 'none'; },
    get px() { return parseFloat(st['font-size']) || timePx * 0.26; },
    get lines() { return cls.has('v2-fi-arrplace-one') ? 1 : units; },
    get scrollWidth() { return this.shown ? widthAt1px(cls.has('v2-fi-arrplace-one'), !cls.has('v2-fi-arrplace-noterm')) * this.px : 0; },
    get clientWidth() { return valueW; }
  };
  const el = {
    get offsetHeight() { return timeH + (ap.shown ? ap.px * (ap.lines * 1.14 + 0.14) : 0); },
    scrollWidth: valueW, clientWidth: valueW
  };
  return { el, ap, st, cls };
}
const placeFit = new Function('window', fnSource(CORE, '_gateArrPlaceFit') + '\nreturn _gateArrPlaceFit;');

test('the terminal-and-gate line takes only the room the Arrival time leaves', () => {
  const win = (px) => ({ getComputedStyle: () => ({ fontSize: px + 'px' }) });
  // "Terminal 1 · Gate D53" is ~11 em wide; on one line with its French twin
  // ~23 em; "Gate D53 | Porte D53" ~10.5 em; "Gate D53" alone ~4.6 em.
  const widths = (one, term) => term ? (one ? 23 : 11) : (one ? 10.5 : 4.9);
  // 1680x1050: the time fills its box (82px of 89). No room: not shown, and
  // the time is not touched (its size is the fitter's, read only).
  let f = fakeArrival({ timePx: 77, timeH: 82, place: { one: false }, widthAt1px: widths });
  assert.equal(placeFit(win(77))(f.el, f.ap, 89, Infinity), false);
  assert.equal(f.st.display, 'none');
  // 1280x1024: room for one line under a 61px time, not for two.
  f = fakeArrival({ timePx: 61, timeH: 64, place: { one: false }, widthAt1px: widths, valueW: 194 });
  assert.equal(placeFit(win(61))(f.el, f.ap, 85, Infinity), true);
  assert.equal(f.ap.shown, true);
  assert.ok(f.cls.has('v2-fi-arrplace-one') && f.cls.has('v2-fi-arrplace-noterm'), 'the gate alone, one line: "Gate D53 | Porte D53"');
  assert.ok(f.ap.px <= 61 * 0.26 && f.ap.px >= 61 * 0.26 * 0.75, 'between three quarters of the day-line size and that size');
  assert.ok(f.el.offsetHeight <= 85 && f.ap.scrollWidth <= 194);
  // Portrait 1080x1920: room for both lines, so the whole line, a line per language.
  f = fakeArrival({ timePx: 51, timeH: 54, place: { one: false }, widthAt1px: widths, valueW: 162 });
  assert.equal(placeFit(win(51))(f.el, f.ap, 86, Infinity), true);
  assert.ok(!f.cls.has('v2-fi-arrplace-one') && !f.cls.has('v2-fi-arrplace-noterm'), 'Terminal 1 · Gate D53 / Aérogare 1 · Porte D53');
  // Never below 11px, however much room: a small time keeps no line.
  f = fakeArrival({ timePx: 38, timeH: 40, place: { one: false }, widthAt1px: widths });
  assert.equal(placeFit(win(38))(f.el, f.ap, 120, Infinity), false, '38px time: .26em is under 11px');
  // A terminal with no gate has no gate-alone form to fall back to.
  f = fakeArrival({ timePx: 61, timeH: 64, place: { one: false }, both: false, widthAt1px: () => 30, valueW: 194 });
  assert.equal(placeFit(win(61))(f.el, f.ap, 85, Infinity), false);
});

// v23946 — a line under a rail time that reaches the Login chip starts just
// right of it. The chip's box and the line's box as measured at 1280x1024 on
// YQM gate 1 (WS813, "Gate A12 | Porte A12" at 15.6px).
const clearOfChip = (doc, cs) => new Function('window', 'document',
  fnSource(CORE, '_gateClearOfLoginChip') + '\nreturn _gateClearOfLoginChip;')(
  { getComputedStyle: () => cs || { display: 'inline-flex', visibility: 'visible' } }, doc);
function fakeLine({ left = 80, right = 274, top = 988, bottom = 1006, contentW = 165 } = {}) {
  const st = {};
  return {
    st,
    style: { setProperty: (k, v) => { st[k] = v; }, removeProperty: (k) => { delete st[k]; } },
    getBoundingClientRect: () => ({ left, right, top, bottom }),
    get scrollWidth() { return Math.max(right - left, contentW + (parseFloat(st['padding-left']) || 0)); },
    get clientWidth() { return right - left; }
  };
}
const CHIP = { left: 14, right: 93, top: 981, bottom: 1010, width: 79, height: 29 };
const chipDoc = (r) => ({ getElementById: (id) => (id === 'ocAdminLogin' && r ? { getBoundingClientRect: () => r } : null) });

test('a line under a rail time is moved clear of the Login chip, never under it', () => {
  // Under the chip: starts 4px right of it, and still fits its box.
  let ln = fakeLine();
  assert.equal(clearOfChip(chipDoc(CHIP))(ln), true);
  assert.equal(ln.st['padding-left'], '17px', '93 + 4 - 80');
  // Moved, it no longer fits: false, so the fitter tries a smaller form.
  ln = fakeLine({ contentW: 185 });
  assert.equal(clearOfChip(chipDoc(CHIP))(ln), false);
  // Clear of the chip (higher up the card, or right of it): untouched.
  ln = fakeLine({ top: 900, bottom: 918 });
  assert.equal(clearOfChip(chipDoc(CHIP))(ln), true);
  assert.equal(ln.st['padding-left'], undefined);
  ln = fakeLine({ left: 104, right: 372 });
  assert.equal(clearOfChip(chipDoc(CHIP))(ln), true);
  assert.equal(ln.st['padding-left'], undefined);
  // A move from an earlier pass is taken back first.
  ln = fakeLine({ top: 900, bottom: 918 }); ln.st['padding-left'] = '17px';
  clearOfChip(chipDoc(CHIP))(ln);
  assert.equal(ln.st['padding-left'], undefined);
  // The streams hide the chip; a board without it has none: no obstacle.
  ln = fakeLine();
  assert.equal(clearOfChip(chipDoc(CHIP), { display: 'none', visibility: 'visible' })(ln), true);
  assert.equal(ln.st['padding-left'], undefined);
  ln = fakeLine();
  assert.equal(clearOfChip(chipDoc(null))(ln), true);
  assert.equal(ln.st['padding-left'], undefined);
  // The terminal-and-gate fitter asks it for every form it tries, and the
  // rail's fitter asks it for the day line.
  const fit = fnSource(CORE, '_gateArrPlaceFit');
  assert.match(fit, /if \(el\.offsetHeight > availH\) return false;\n\s*if \(!clearChip\(ap\)\) return false;\n\s*if \(el\.scrollWidth > el\.clientWidth \+ 0\.5\) return false;\n\s*if \(ap\.scrollWidth > ap\.clientWidth \+ 0\.5\) return false;/);
  assert.match(CORE, /if \(_dl && !_gateClearOfLoginChip\(_dl\)\) _dl\.style\.removeProperty\('padding-left'\);/);
});

// v23946 — a dash is sized as the times beside it, in its own block.
test('a dash in place of a time is the size of the times beside it', () => {
  const val = (text, px) => {
    const st = { 'font-size': px + 'px' };
    return { textContent: text, st, style: { setProperty: (k, v) => { st[k] = v; } } };
  };
  const block = (vals) => ({ querySelectorAll: (q) => (assert.equal(q, '.v2-fi-value.v2-fi-time'), vals) });
  const dashAsTimes = new Function('window', fnSource(CORE, '_gateDashAsTimes') + '\nreturn _gateDashAsTimes;')(
    { getComputedStyle: (v) => ({ fontSize: v.st['font-size'] }) });
  // Portrait YUL C75: Boarding 48px, Departure 48px, the Arrival dash 139px.
  const rail = [val('4:05pm', 48), val('4:40pm', 48), val('—', 139)];
  // The strip is its own set: a dash there follows the strip's times.
  const strip = [val('4:05pm', 30), val('\n  — ', 60)];
  // A block of dashes only has nothing to follow, and keeps its size.
  const lone = [val('—', 90)];
  // A dash already smaller than its neighbours is never grown.
  const small = [val('6:15pm', 86), val('—', 70)];
  const root = { querySelectorAll: (q) => {
    assert.equal(q, '.gad-aircraft-col .v2-flightinfo-block, .g8-bir-shelves .v2-flightinfo-block');
    return [block(rail), block(strip), block(lone), block(small)];
  } };
  dashAsTimes(root);
  assert.deepEqual(rail.map((v) => v.st['font-size']), ['48px', '48px', '48px']);
  assert.deepEqual(strip.map((v) => v.st['font-size']), ['30px', '30px']);
  assert.equal(lone[0].st['font-size'], '90px');
  assert.equal(small[1].st['font-size'], '70px');
  // The times themselves are never touched; it runs after the rail's fit.
  assert.match(CORE, /if \(_dl && !_gateClearOfLoginChip\(_dl\)\) _dl\.style\.removeProperty\('padding-left'\);\n\s*\}\);\n\s*\/\/ v23946 — a dash is the size of the times beside it \(_gateDashAsTimes\)\.\n\s*_gateDashAsTimes\(root\);/);
});

test('the worker route: public, pattern-checked, always an answer, no new upstream', async () => {
  const m = await load();
  assert.match(WORKER, /if \(path === "\/fararr"\) \{/);
  const route = WORKER.slice(WORKER.indexOf('if (path === "/fararr") {'), WORKER.indexOf('// ── ADS-B LIVE POSITIONS'));
  assert.match(route, /!AC_FLIGHT_RE\.test\(f\) \|\| !\/\^\[a-z\]\{3\}\$\/\.test\(to\)/);
  assert.match(route, /farArrPick\(index, f, from, dep, to\)/);
  assert.doesNotMatch(route, /fr24|adsb|aerodatabox|rapidapi|flightview|aeroapi/i, 'no FR24, no banned provider');
  const list = fnSource(WORKER, 'farArrList');
  assert.doesNotMatch(list, /fr24|adsb|fetch\(/i, 'only the feeds the boards already read');
  for (const c of ['YYZ', 'YUL', 'YHU', 'YTZ', 'YHZ', 'YQM', 'YOW', 'YYC', 'YQB', 'YVR', 'YLW', 'YYT', 'YDF', 'JFK', 'MCO']) assert.ok(m.farArrHas(c), c + ' has a far-end list');
  assert.equal(m.farArrHas('YYY'), false, 'Mont-Joli has none: the card prints a dash');
  // Montréal-Trudeau's arrivals are read without its per-flight belt calls.
  assert.match(list, /handleYulFids, \{ noBelts: true \}/);
  assert.match(WORKER, /if \(page === "arrivals" && merged\.length && !\(opts && opts\.noBelts\)\) \{/);
  assert.equal(m.farArrNorm('ac 0659'), 'AC659');
  assert.equal(m.farArrTerminal('T3', 'B22'), '3');
  assert.equal(m.farArrTerminal('A', 'A12'), null);
  assert.equal(m.farArrWall('2026-10-04 20:25:00-02:30'), '2026-10-04 20:25');
});

test('Moncton is a far end: flights into YQM read cyqm.ca\'s own arrivals', async () => {
  const m = await load();
  const rows = m.farArrYqmRows(fx('yqm-arr.json').list);
  assert.ok(rows.length > 20);
  // Montréal-Trudeau's gate: AC2040 to Moncton, due 21:38 at Moncton's gate 4.
  const ac2040 = m.farArrAnswer('AC2040', 'YQM', 'YUL', m.farArrPick(rows, 'AC2040', 'YUL', Date.parse('2026-10-04T19:15:00-04:00'), 'YQM'));
  assert.deepEqual([ac2040.found, ac2040.sched, ac2040.schedTs, ac2040.rev, ac2040.gate, ac2040.term],
    [true, '2026-10-04 21:38', Date.parse('2026-10-04T21:38:00-03:00'), null, '4', null]);
  // localTimestamp is Moncton's wall clock written as UTC: never shifted.
  assert.equal(rows.find((e) => e.n === 'PD2373' && e.sl === '2026-10-04 16:33').s, Date.parse('2026-10-04T16:33:00-03:00'));
  // "Early at 5:07 PM": the revised clock, with its word.
  const ws812 = m.farArrAnswer('WS812', 'YQM', 'YYC', m.farArrPick(rows, 'WS812', 'YYC', Date.parse('2026-10-04T09:10:00-06:00'), 'YQM'));
  assert.deepEqual([ws812.sched, ws812.rev, ws812.status, ws812.gate], ['2026-10-04 17:20', '2026-10-04 17:07', 'early', '1']);
  const shown = farArrival(ws812, { effDepTs: Date.parse('2026-10-04T09:10:00-06:00') });
  assert.deepEqual([shown.shown, shown.sched, shown.revised, shown.early], ['17:07', '17:20', true, true]);
  // Pearson's gate the next evening takes the next day's row.
  assert.equal(m.farArrPick(rows, 'AC1984', 'YYZ', Date.parse('2026-10-05T14:35:00-04:00'), 'YQM').sl, '2026-10-05 17:23');
  // From another origin, not ours.
  assert.equal(m.farArrPick(rows, 'AC2040', 'YYZ', Date.parse('2026-10-04T19:15:00-04:00')), null);
  // The list /fararr reads is cyqm.ca's own, through the fetch the YQM boards
  // use (yqmCyqmText), not a new upstream.
  assert.match(fnSource(WORKER, 'farArrList'), /if \(k === "yqm"\) \{\n\s*const txt = await yqmCyqmText\("arrivals"\);/);
  // v23996 — through the feed protection, which asks the very same function.
  assert.match(WORKER, /feedGuard\(env, ctx, "YQM", _seg, "cyqm", \(\) => yqmCyqmText\(_seg\)/, 'the /yqm/flights route shares it');
});

// The worker with the network and the edge cache stood in for.
async function withNet(answer, fn) {
  const realFetch = globalThis.fetch, realCaches = globalThis.caches;
  const mem = new Map();
  globalThis.caches = { default: {
    match: async (req) => { const v = mem.get(typeof req === 'string' ? req : req.url); return v ? new Response(v.body, { headers: v.headers }) : undefined; },
    put: async (req, resp) => { mem.set(typeof req === 'string' ? req : req.url, { body: await resp.text(), headers: Object.fromEntries(resp.headers) }); }
  } };
  globalThis.fetch = async (u) => answer(String(u && u.url ? u.url : u));
  try { return await fn(); } finally { globalThis.fetch = realFetch; globalThis.caches = realCaches; }
}

test('a far end that is down is "unavailable", never "no such flight"', async () => {
  const m = await load();
  const yqm = JSON.stringify(fx('yqm-arr.json').list.filter((r) => !r.remembered));
  // Up: rows.
  await withNet(() => new Response(yqm, { status: 200 }), async () => {
    const rows = await m.farArrList('yqm', {});
    assert.ok(Array.isArray(rows) && rows.length > 10);
  });
  // A firewall's 403, a challenge page, an empty list: null, not [].
  for (const [label, resp] of [['403', () => new Response('blocked', { status: 403 })], ['challenge page', () => new Response('<html>challenge</html>', { status: 200 })], ['empty list', () => new Response('[]', { status: 200 })]]) {
    await withNet(resp, async () => { assert.equal(await m.farArrList('yqm', {}), null, label); });
  }
  // The route answers it as unavailable, cached briefly; a row found is found.
  const worker = (await load()).default;
  const kv = { get: async () => null, put: async () => {}, list: async () => ({ keys: [] }), delete: async () => {} };
  const env = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : kv) });
  const ask = async (q) => {
    const r = await worker.fetch(new Request('https://fids-proxy.example/fararr?' + q, { headers: { Origin: 'https://fids.orionconnected.com' } }), env, { waitUntil() {}, passThroughOnException() {} });
    return { status: r.status, cc: r.headers.get('Cache-Control'), j: await r.json() };
  };
  const q = 'f=AC2040&to=YQM&from=YUL&dep=' + Date.parse('2026-10-04T19:15:00-04:00');
  await withNet(() => new Response('<html>challenge</html>', { status: 200 }), async () => {
    const a = await ask(q);
    assert.equal(a.status, 200);
    assert.deepEqual(a.j, { f: 'AC2040', to: 'YQM', from: 'YUL', found: false, unavailable: true });
    assert.equal(a.cc, 'public, max-age=30');
  });
  await withNet(() => new Response(yqm, { status: 200 }), async () => {
    const a = await ask(q);
    assert.deepEqual([a.j.found, a.j.sched, a.j.gate, a.j.unavailable], [true, '2026-10-04 21:38', '4', undefined]);
    assert.equal(a.cc, 'public, max-age=120');
    // The far end is up and has no such flight: found:false, no unavailable.
    const b = await ask('f=AC9999&to=YQM&from=YUL&dep=' + Date.parse('2026-10-04T19:15:00-04:00'));
    assert.deepEqual(b.j, { f: 'AC9999', to: 'YQM', from: 'YUL', found: false });
  });
});

test('the gate keeps the time it printed while the far end is unavailable', async () => {
  let next = null, rebuilds = 0;
  const fetchStub = async () => ({ ok: true, json: async () => next });
  const board = new Function('fetch', 'requestGateRebuild',
    "var _FARARR_BASE = 'https://fids-proxy.example/fararr';\n"
    + 'var _farArrStore = Object.create(null);\nvar _farArrTried = Object.create(null);\n'
    + fnSource(CORE, '_farArrKey') + '\n' + fnSource(CORE, '_farArrGet') + '\n' + fnSource(CORE, '_farArrKick')
    + '\nreturn { kick: _farArrKick, get: _farArrGet, tried: _farArrTried };')(fetchStub, () => { rebuilds++; });
  const row = { flight: 'AC2040', _sortTs: Date.parse('2026-10-04T19:15:00-04:00'), _locIata: 'YQM', dest: 'Moncton' };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const again = async (j) => { next = j; for (const k in board.tried) board.tried[k] = 0; board.kick(row, 'YUL'); await settle(); await settle(); };
  const found = { f: 'AC2040', to: 'YQM', from: 'YUL', found: true, sched: '2026-10-04 21:38', schedTs: 1, gate: '4', status: 'scheduled' };
  await again(found);
  assert.equal(board.get(row).sched, '2026-10-04 21:38');
  assert.equal(rebuilds, 1);
  await again({ f: 'AC2040', to: 'YQM', from: 'YUL', found: false, unavailable: true });
  assert.equal(board.get(row).sched, '2026-10-04 21:38', 'a far end that is down does not blank the printed time');
  assert.equal(rebuilds, 1, 'and does not repaint');
  await again({ f: 'AC2040', to: 'YQM', from: 'YUL', found: false });
  assert.equal(board.get(row).found, false, 'a far end that is up and has no row: the dash');
  assert.equal(rebuilds, 2);
});
