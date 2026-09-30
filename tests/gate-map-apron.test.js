'use strict';

// WHY THIS EXISTS
//
// v23918. At stand zoom a Moncton gate map showed one aeroplane (the board's
// own, or its empty stand) on an apron that usually has two or three more on
// it. Both gate maps now draw, at ground zoom over our own field, every other
// aeroplane the SAME evidence rules put on the ground (v23915's resolver,
// untouched), each on its own stand of its door's group — a jet on the bridge,
// a turboprop on a walk-out, larger first, the board's own stand kept for the
// board's own aeroplane — lighter, under it, with no route and no label. And
// the worker now remembers what cyqm.ca said landed and left (see
// tests/yqm-seen-memory.test.js), so a screen opened in the morning knows about
// the aeroplane that stayed the night.
//
// The replay: the real answers of /yqm/flights/* through the worker at 22:22 ADT
// on 2026-09-28 and 09:08 ADT on 2026-09-30. There is no capture of the evening
// between them, so the 28th's evening answer stands in for the 29th's (every
// row moved one day on: the same schedule, flown the same way — PD2381 "Arrived
// at 9:47 PM" at gate 3, AC2040 "Arrived" at gate 4). Later in the morning the
// feed's own words are what cyqm.ca prints ("Arrived at 10:27 AM", "Boarding",
// "Departed at 12:02 PM"), written into the 09:08 rows. The rows go through the
// worker's memory and feed-router's own mapping (lifted), a stand-in for
// fids-core's mapADB covering the fields the gate rules read, and the real gate
// rules and apron functions lifted out of fids-core.js, on the real gate file.
//
// Four things the first cut got wrong, each pinned below. The worker's copy of
// a dropped row (no tail, no type) replaced the copy the screen had seen with
// the webhook's tail on it. Two Airbuses down overnight at gate 4 were both
// "AC1983's aeroplane" at gate 1, so gate 1 hid both and both vanished when
// AC1983 left. Stands were dealt afresh every minute largest first and each
// board kept its own aeroplane where its single view put it, so parked
// aeroplanes jumped and neighbouring boards disagreed; the empty stand's ring
// was drawn under another aeroplane. And stands 1B and 2, 3.8 m apart in the
// gate file, were handed out as two places.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const ROUTER = fs.readFileSync(path.join(root, 'fids-current', 'js', 'feed-router.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const YQM = JSON.parse(fs.readFileSync(path.join(root, 'fids-current', 'data', 'gates', 'YQM.json'), 'utf8'));
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const workerPath = path.resolve(__dirname, '..', 'workers', 'fids-proxy.js');

function fnSourceIn(SRC, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let i = SRC.search(new RegExp('(^|\\n)(async )?function ' + escaped + '\\('));
  assert.ok(i >= 0, name + ' must exist');
  if (SRC[i] === '\n') i++;
  let depth = 0, j = SRC.indexOf('{', i);
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) break;
  }
  return SRC.slice(i, j + 1);
}
const fnSource = (name) => fnSourceIn(CORE, name);
function lineSource(prefix) {
  const i = CORE.indexOf(prefix);
  assert.ok(i >= 0, prefix + ' must exist');
  return CORE.slice(i, CORE.indexOf('\n', i));
}
function braceSource(prefix) {
  const i = CORE.indexOf(prefix);
  assert.ok(i >= 0, prefix + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1) + ';';
}
function blockSource(prefix, end) {
  const i = CORE.indexOf(prefix);
  assert.ok(i >= 0, prefix + ' must exist');
  return CORE.slice(i, CORE.indexOf(end, i) + end.length);
}
function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// feed-router's own mapping of a cyqm row, and its split of the remembered rows.
const router = new Function(
  [fnSourceIn(ROUTER, 'yqmTimeObj'), fnSourceIn(ROUTER, 'yqmClockToMin'), fnSourceIn(ROUTER, 'yqmStatus'),
   fnSourceIn(ROUTER, 'yqmToAdbFlight'), fnSourceIn(ROUTER, 'yqmSplitRemembered'),
   'return { yqmToAdbFlight, yqmSplitRemembered, yqmStatus };'].join('\n'))();

const FNS = [
  // the v23915 evidence rules
  '_gateLegGone', '_gateFamily', '_gateRowKey', '_gateRawStatus', '_gateRawLanded', '_gateRawAirborne',
  '_gateOutboundAtGate', '_gateTodayReg', '_gateIsProp', '_gateMinTurnMs', '_gateDepSchedTs',
  '_gateAcFamily', '_gateHereTz', '_gateLocalHour', '_gateNightStop', '_gateCouldTurn',
  '_gateDepOwnInbound', '_gateArrivalClaimed', '_gateTurnConsumed', '_gateOvernightOk', '_gateLandedAt',
  '_gateStandVerdict', '_gateLegUp', '_gateAirEstProg', '_gateFixCheck', '_gateFixFor', '_gateDepsSeen',
  '_gateAircraftWhere', '_gateAircraftWhereIn', '_gateFeedRows', '_gateFeedKept', '_gateInboundForDeparture',
  '_gcNm', '_fixCanReachByEta', '_estRouteFrac', '_gateRefNorm', 'adbTs', '_adbNearestDayTs', 'adbStatus',
  'adbStatusInferred', '_gateSeenSlim', '_gateSeenLoad', '_gateSeenSave', '_gateArrsSeen', 'aircraftCodeToIata',
  // where an aeroplane stands, and its size
  '_gcBrgDeg', '_gcDestPt', '_gateStandHeading', '_gateParkSpot', '_gateStandAlloc', '_gateParkPlace',
  '_mapPlaneSpecFor', '_mapPlaneScale', '_mapPlaneSpec', '_mapPlaneFit', '_gateOwnGateRef',
  // v23918 — the apron
  '_gateApronOn', '_gateDepLeft', '_gateApronSpec', '_gateApronDoor', '_gateApronCollect', '_gateApronOwn',
  '_gateApronIsOwn', '_gateApronAssign', '_gateApronStandSpot', '_gateApronPlan', '_gateApronClear',
  '_gateApronFit', '_gateApronSync', '_gateApronSince', '_gateApronOwnIndex', '_gateApronOwnRef', '_gateOwnParkSpot',
  '_gateSeenKeepIdentity',
];
const EXPORTS = FNS.map((n) => n + ': ' + n).join(', ');
// The board's own table of airport points (GATE_AP) rounds Moncton to two decimals.
const COORDS = { YQM: [46.11, -64.68], YYZ: [43.68, -79.62], YUL: [45.47, -73.74], YOW: [45.32, -75.67],
                 YHU: [45.52, -73.42], YDF: [49.21, -57.39], YYY: [48.61, -68.21], YYC: [51.12, -114.01],
                 YTZ: [43.63, -79.40], RIX: [56.92, 23.97], YHZ: [44.88, -63.51] };

// A stand-in for fids-core's mapADB, for the fields the gate rules read. The
// status and its provenance are the real adbStatus / adbStatusInferred; the
// three-hour trail and the 30 h "kept" trail are mapADB's; Porter's 2xxx
// numbers are its Dash 8-400s as _porterSeriesEquipment says.
function mapLite(E, now) {
  return function (raw, mode, kept) {
    const list = mode === 'dep' ? (raw.departures || []) : (raw.arrivals || []);
    return list.map((f) => {
      const side = mode === 'dep' ? f.departure : f.arrival, other = mode === 'dep' ? f.arrival : f.departure;
      const sL = side.scheduledTime && side.scheduledTime.local;
      const schedTs = E.adbTs(sL);
      if (!schedTs) return null;
      if (now - schedTs > (kept === true ? 30 : 3) * 3600000) return null;
      if (schedTs - now > 24 * 3600000) return null;
      const revL = side.revisedTime && side.revisedTime.local;
      const revTs = revL ? E._adbNearestDayTs(E.adbTs(revL), schedTs) : null;
      const st = E.adbStatus(f, mode, schedTs, now);
      const flight = String(f.number).toUpperCase().replace(/\s+/g, '');
      const dash8 = /^PD2\d{3}$/.test(flight) ? 'DHC-8-400' : '';
      return { flight, airline: (f.airline && f.airline.iata) || flight.replace(/\d.*/, ''),
               gate: side.gate || '—', status: st, _stInferred: E.adbStatusInferred(f, st), _sortTs: schedTs,
               _revTs: revTs || null, _locIata: other.airport.iata, _aircraft: dash8, _aircraftCode: dash8,
               _reg: '', _actualDepTime: null, _actualArrTime: null };
    }).filter(Boolean).sort((a, b) => a._sortTs - b._sortTs);
  };
}

function engine(ctx) {
  const window = Object.assign({ _gateIata: ctx.ap || 'YQM' }, ctx.window || {});
  const data = ctx.data || { arr: [], dep: [] };
  const gates = ctx.gates || { YQM };
  const src = [
    lineSource('var _GATE_DOWN_SEEN = {};'),
    lineSource('var _GATE_DEP_SEEN = '),
    lineSource('var _GATE_SEEN_KEY = '),
    blockSource('var _GATE_SEEN_FIELDS = [', '];'),
    lineSource('var _GATE_ARR_SEEN = '),
    lineSource('var _GATE_SEEN_IDENTITY = '),
    lineSource('var _ADB_EXPLICIT_STATUS = '),
    lineSource('var _GATE_FEED_KEPT = '),
    lineSource('var _GATE_APRON_AIRPORTS = '),
    ctx.bySize ? 'var _GATE_APRON_BY_SIZE = true;' : lineSource('var _GATE_APRON_BY_SIZE = '),
    lineSource('var _GATE_APRON_MAX_GATES = '),
    lineSource('var _GATE_APRON_MIN_ZOOM = '),
    lineSource('var _GATE_APRON_CLEAR_M = '),
    lineSource('var _GATE_APRON_CACHE = '),
    braceSource('var _MAP_PLANE_DIMS = {'),
    lineSource('var _MAP_PLANE_UNKNOWN = '),
    braceSource('var _MAP_PLANE_ART = {'),
    ...FNS.map(fnSource),
    'return { ' + EXPORTS + ' };',
  ].join('\n');
  const E = {};
  const mod = new Function('window', 'data', 'AP', '_lookupAirport', 'localStorage', '_apGatesFor', '_AP_GATES',
    'mapADB', '_fidsCollapseRevisions', 'L', 'gateMap', 'subScreenVal', 'console', src)(
    window, data, { YQM: { tz: 'America/Moncton' }, YHZ: { tz: 'America/Halifax' } },
    (k) => COORDS[String(k || '').toUpperCase()] || null, ctx.storage || store(),
    (k) => gates[String(k || '').toUpperCase()] || null, gates,
    (raw, mode, kept) => E.mapADB(raw, mode, kept), (rows) => rows, ctx.L || null, ctx.map || null, ctx.sub || '',
    { log() {} });
  Object.assign(E, mod);
  // ctx.types: { flight: type } put on every row mapped for that flight, the
  // way the webhook merge or /acinfo name a type on a real board.
  const lite = mapLite(E, ctx.now || Date.now());
  E.mapADB = !ctx.types ? lite : (raw, mode, kept) => lite(raw, mode, kept).map((r) => {
    const ty = ctx.types[r.flight];
    if (ty) { r._aircraft = ty; r._aircraftCode = ty; }
    return r;
  });
  E.window = window;
  E.data = data;
  return E;
}

// Moncton wall clock (ADT, UTC-3) as a real instant.
const T = (mo, d, hh, mm) => Date.UTC(2026, mo - 1, d, hh + 3, mm);

// One day on: the 28th's 22:22 answer as the 29th's.
function nextDay(r) {
  const bump = (s) => String(s || '').replace(/Sep (\d+)/, (m, d) => 'Sep ' + (Number(d) + 1)).replace(/(\d+) sep/, (m, d) => (Number(d) + 1) + ' sep');
  return Object.assign({}, r, { localTimestamp: r.localTimestamp + 86400, displayDate: bump(r.displayDate),
    dateTime: bump(r.dateTime), dateTimeFR: bump(r.dateTimeFR), haystack: bump(r.haystack) });
}
const EVENING = {
  arrivals: JSON.parse(fixture('yqm-cyqm-2026-09-28-2222-arrivals.json')).map(nextDay),
  departures: JSON.parse(fixture('yqm-cyqm-2026-09-28-2222-departures.json')).map(nextDay),
};
const MORNING = {
  arrivals: JSON.parse(fixture('yqm-cyqm-2026-09-30-0908-arrivals.json')),
  departures: JSON.parse(fixture('yqm-cyqm-2026-09-30-0908-departures.json')),
};
// The feed's own words later that morning, written into the 09:08 rows.
function said(rows, flight, day, status, actual) {
  return rows.map((r) => (r.flightId === flight && r.displayDate === 'Sep ' + day)
    ? Object.assign({}, r, { status, actualTime: actual || r.actualTime }) : r);
}

// The whole path for one moment: the worker's answer (its memory fed the
// evening first), feed-router's split, then a board of gate `gate`.
async function momentAt(now, seg, opts) {
  const o = opts || {};
  const mod = await import(workerPath);
  mod._yqmSeenMem.arrivals = null; mod._yqmSeenMem.departures = null;
  const kv = new Map();
  const env = { FIDS_LIVE_FLIGHTS: {
    async get(k, t) { const v = kv.has(k) ? kv.get(k) : null; return (v && t && t.type === 'json') ? JSON.parse(v) : v; },
    async put(k, v) { kv.set(k, v); } } };
  const ctx = { waitUntil() {} };
  const answer = {};
  for (const dir of ['arrivals', 'departures']) {
    await mod.yqmWithMemory(env, ctx, dir, JSON.stringify(EVENING[dir]), T(9, 29, 22, 22));
    for (const [at, feed] of (o.polls || [])) await mod.yqmWithMemory(env, ctx, dir, JSON.stringify(feed[dir]), at);
    const rows = (o.feed && o.feed[dir]) || MORNING[dir];
    answer[dir] = JSON.parse((await mod.yqmWithMemory(env, ctx, dir, JSON.stringify(rows), now)).text);
  }
  const arrS = router.yqmSplitRemembered(answer.arrivals, 'Arrival');
  const depS = router.yqmSplitRemembered(answer.departures, 'Departure');
  return { answer, arrS, depS, board: (gate, extra) => board(now, gate, arrS, depS, Object.assign({ types: o.types }, extra || {})) };
}
function board(now, gate, arrS, depS, extra) {
  const x = extra || {};
  const E = engine(Object.assign({ now, window: { _yqmRemembered: { ap: 'YQM', arrivals: arrS.kept, departures: depS.kept } } }, x));
  E.data.arr = E.mapADB({ arrivals: arrS.list }, 'arr');
  E.data.dep = E.mapADB({ departures: depS.list }, 'dep');
  // The gate's current flight, and its inbound, the way the gate render finds them.
  const deps = E._gateDepsSeen(E._gateFeedRows('dep'), 'YQM', now);
  const arrs = E._gateArrsSeen(E._gateFeedRows('arr'), 'YQM', now);
  const cf = deps.filter((d) => d.gate === gate && d._sortTs + 15 * 60000 > now && !E._gateDepLeft(d, now))
    .sort((a, b) => a._sortTs - b._sortTs)[0] || null;
  const inb = cf ? E._gateInboundForDeparture(cf, gate, arrs, deps) : null;
  E.window._gateCurrentFlight = cf;
  E.window._gateInbound = inb;
  E.window._gateMapWhere = E._gateAircraftWhere(inb, cf, now);
  E.cf = cf; E.inb = inb; E.gate = gate;
  E.plan = () => E._gateApronPlan('YQM', now);
  E.others = () => (E.plan() || { items: [] }).items.map((it) => it.flight + '@' + it.stand).sort();
  // Where this board draws its own aeroplane, or its empty stand (_gateOwnParkSpot).
  E.ownStand = () => { const s = E._gateOwnParkSpot('YQM', COORDS.YQM); return s && s.ref; };
  return E;
}

test('feed-router maps a remembered row as the raw evidence it is, and keeps it off the board', () => {
  const rows = [
    Object.assign({}, EVENING.arrivals[0], { remembered: true }),            // PD2381 "Arrived at 9:47 PM"
    EVENING.arrivals[3],                                                     // AC7992 "OnTime"
    Object.assign({}, MORNING.departures[0], { remembered: true }),          // AC2037 "Departed at 6:33 AM"
    null,
  ];
  const a = router.yqmSplitRemembered(rows.slice(0, 2), 'Arrival');
  assert.deepEqual(a.list.map((f) => f.number), ['AC7992'], 'the board lists what the airport lists');
  assert.deepEqual(a.kept.map((f) => f.number), ['PD2381']);
  assert.equal(a.kept[0].status, 'arrived');
  assert.equal(a.kept[0]._yqmRemembered, true);
  assert.equal(a.kept[0].arrival.gate, '3');
  assert.equal(a.kept[0].arrival.revisedTime.local.slice(0, 16), '2026-09-29 21:47', 'its actual time as the revision');
  const d = router.yqmSplitRemembered(rows.slice(2), 'Departure');
  assert.equal(d.kept[0].status, 'departed');
  // Through the board's status rules: the feed's word, never the clock's.
  const E = engine({ now: T(9, 30, 9, 0) });
  const st = E.adbStatus(a.kept[0], 'arr', T(9, 29, 21, 30), T(9, 30, 9, 0));
  assert.equal(st, 'arrived');
  assert.equal(E.adbStatusInferred(a.kept[0], st), false, 'not _stInferred');
  const row = E.mapADB({ arrivals: a.kept }, 'arr', true)[0];
  assert.equal(row._stInferred, false);
  assert.equal(E._gateRawLanded(row), true);
  assert.equal(E.mapADB({ arrivals: a.kept }, 'arr').length, 0, 'the board\'s three-hour trail would have dropped it');
  // The branch that fetches Moncton uses the split and hands the kept rows to the gate maps only.
  assert.match(ROUTER, /const _split = yqmSplitRemembered\(rowsAll, direction\);/);
  assert.match(ROUTER, /window\._yqmRemembered\[seg\] = _split\.kept;/);
  assert.match(ROUTER, /const list = _split\.list;/);
});

test('09:00 on Sep 30: the Porter that stayed the night for PD2370 is on a walk-out of doors 3/4, drawn on gate 4\'s map', async () => {
  const now = T(9, 30, 9, 0);
  const m = await momentAt(now);
  // The worker handed back last night's landings the feed had dropped.
  assert.deepEqual(m.arrS.kept.map((f) => f.number + ' ' + f.arrival.scheduledTime.local.slice(0, 16)).sort(),
    ['AC2040 2026-09-29 21:38', 'PD2381 2026-09-29 21:30']);
  // Gate 4 (Air Canada): its own AC7995's aeroplane (AC7992, "Early at 10:27") has not landed.
  const g4 = m.board('4');
  assert.equal(g4.cf.flight, 'AC7995');
  assert.equal(g4.inb.flight, 'AC7992');
  assert.equal(g4.window._gateMapWhere.kind, 'none', 'the board\'s own map is its empty stand, as before');
  assert.deepEqual(g4.others(), ['PD2381@5'], 'the Porter on stand 5, a walk-out of doors 3 and 4');
  const it = g4.plan().items[0];
  assert.equal(it.spec.art.src, '/logos/map-plane-dh4.svg');
  assert.equal(it.prop, true);
  assert.ok(!YQM.bridged.includes(it.stand), 'a turboprop walks out');
  assert.ok(YQM.door_stands['3'].includes(it.stand) && YQM.door_stands['4'].includes(it.stand));
  // No Air Canada aeroplane is on the ground at 09:00: last night's AC2040
  // left on the 06:35 (the feed's "Departed at 6:33 AM").
  assert.ok(!g4.others().some((s) => /^AC/.test(s)));
  // Gate 3: that Porter IS its own aeroplane, on the same stand the single view gives it; nothing else.
  const g3 = m.board('3');
  assert.equal(g3.cf.flight, 'PD2370');
  assert.equal(g3.inb.flight, 'PD2381');
  assert.equal(g3.inb._feedKept, true, 'found only because the worker remembered it');
  assert.equal(g3.window._gateMapWhere.kind, 'stand');
  assert.equal(g3.ownStand(), '5');
  assert.deepEqual(g3.others(), [], 'never drawn twice');
  // A screen with no memory of its own and none from the worker: no evidence, no aeroplane.
  const bare = board(now, '3', { list: m.arrS.list, kept: [] }, { list: m.depS.list, kept: [] });
  assert.equal(bare.inb, null);
  assert.equal(bare.window._gateMapWhere.kind, 'none');
  assert.deepEqual(bare.others(), []);
});

test('04:00 on Sep 30: last night\'s Air Canada jet on Bridge 1 and the Porter on its walk-out, each on the other\'s map', async () => {
  const now = T(9, 30, 4, 0);
  // Before the first wave: AC2037 and AC7753 had not left yet.
  let dep = said(MORNING.departures, 'AC2037', 30, 'OnTime', '6:35 AM');
  dep = said(dep, 'AC7753', 30, 'OnTime', '7:10 AM');
  const m = await momentAt(now, null, { feed: { arrivals: MORNING.arrivals, departures: dep } });
  // Gate 4: its own AC2037 flies last night's AC2040 (remembered by the worker), on the bridge.
  const g4 = m.board('4');
  assert.equal(g4.cf.flight, 'AC2037');
  assert.equal(g4.inb && g4.inb.flight, 'AC2040');
  assert.equal(g4.window._gateMapWhere.kind, 'stand', 'a night stop: down at 21:38, the family\'s first departure after it');
  assert.equal(g4.ownStand(), 'BR1');
  assert.deepEqual(g4.others(), ['PD2381@5']);
  // Gate 3: its own Porter on 5, and the Air Canada jet on the bridge beside it.
  const g3 = m.board('3');
  assert.deepEqual(g3.others(), ['AC2040@BR1']);
  const jet = g3.plan().items[0];
  assert.ok(YQM.bridged.includes(jet.stand) && !jet.prop, 'a jet takes the bridge');
});

test('an aeroplane the board\'s own view rules off its stand is still drawn, lighter, when it is on the ground for another departure', async () => {
  // The Sep 28 schedule's shape (tests/gate-map-evidence.test.js): a 06:15
  // Porter from gate 4 flies the night-stop Porter first, so it is not
  // PD2370's aeroplane — gate 3's own view is its empty stand — but it is on
  // the ground all the same.
  const now = T(9, 30, 4, 0);
  const pd2294 = Object.assign({}, MORNING.departures.find((r) => r.flightId === 'PD2294'),
    { localTimestamp: T(9, 30, 6, 15) / 1000 - 3 * 3600, displayDate: 'Sep 30', dateTime: 'Sep 30 - 6:15 AM', scheduledTime: '6:15 AM',
      actualTime: '6:15 AM', gate: '4', status: 'OnTime' });
  const dep = MORNING.departures.concat([pd2294]).sort((a, b) => a.localTimestamp - b.localTimestamp);
  const m = await momentAt(now, null, { feed: { arrivals: MORNING.arrivals, departures: dep } });
  const g3 = m.board('3');
  assert.equal(g3.cf.flight, 'PD2370');
  assert.equal(g3.inb, null, 'PD2381 belongs to the 06:15');
  assert.equal(g3.window._gateMapWhere.kind, 'none');
  assert.ok(g3.others().includes('PD2381@5'), 'on the ground for PD2294: drawn, not hidden as if it were this board\'s');
  // Its empty stand is one nobody stands on: the free walk-out, not the
  // Porter's stand 5 under the label — and the Porter is not moved for it,
  // so gate 4's board beside it draws the Porter on stand 5 as well.
  assert.equal(g3.ownStand(), '6B');
  assert.ok(!g3.others().some((x) => x.endsWith('@6B')));
  assert.ok(m.board('4').others().includes('PD2381@5'));
  // Once PD2294 has gone, so has it.
  const gone = dep.map((r) => (r === pd2294 ? Object.assign({}, r, { status: 'Departed at 6:21 AM' }) : r));
  const later = await momentAt(T(9, 30, 6, 40), null, { feed: { arrivals: MORNING.arrivals, departures: gone } });
  assert.ok(!later.board('3').others().some((x) => /^PD2381/.test(x)));
});

test('10:45: Air Canada\'s AC7992 is down — the jet on Bridge 1, the Porter still on its walk-out, distinct stands', async () => {
  const now = T(9, 30, 10, 45);
  const feed = { arrivals: said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM'), departures: MORNING.departures };
  const m = await momentAt(now, null, { feed });
  // Gate 1 has no flights of its own this morning: it shows both, lighter.
  const g1 = m.board('1');
  assert.deepEqual(g1.others(), ['AC7992@BR1', 'PD2381@5']);
  // Gate 3: its own Porter on 5, the jet on the bridge.
  const g3 = m.board('3');
  assert.equal(g3.ownStand(), '5');
  assert.deepEqual(g3.others(), ['AC7992@BR1']);
  // Gate 4: AC7992 is its own (AC7995's) aeroplane now, on the bridge the single view gives it.
  const g4 = m.board('4');
  assert.equal(g4.window._gateMapWhere.kind, 'stand');
  assert.equal(g4.ownStand(), 'BR1');
  assert.deepEqual(g4.others(), ['PD2381@5']);
});

test('11:10: two Air Canada jets and the Porter at doors 3/4 — three aeroplanes, three stands', async () => {
  const now = T(9, 30, 11, 10);
  let arr = said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM');
  arr = said(arr, 'AC644', 30, 'Arrived at 11:04 AM', '11:04 AM');
  const m = await momentAt(now, null, { feed: { arrivals: arr, departures: said(MORNING.departures, 'AC7995', 30, 'Boarding') } });
  const g1 = m.board('1');
  const others = g1.others();
  assert.deepEqual(others, ['AC644@6B', 'AC7992@BR1', 'PD2381@5']);
  const stands = others.map((s) => s.split('@')[1]);
  assert.equal(new Set(stands).size, stands.length, 'no stand twice');
  // Largest first, and the earlier departure's aeroplane keeps the bridge; the
  // Porter keeps the walk-out it has stood on since last night — the second jet
  // takes the next free stand, it does not move the Porter off its own.
  assert.equal(g1.plan().items.find((i) => i.flight === 'AC7992').stand, 'BR1');
  assert.equal(g1.plan().items.find((i) => i.flight === 'PD2381').stand, '5');
  // On gate 4's board AC7995's aeroplane is its own, still on BR1; the others fit around it.
  const g4 = m.board('4');
  assert.equal(g4.ownStand(), 'BR1');
  assert.deepEqual(g4.others(), ['AC644@6B', 'PD2381@5']);
});

test('12:10: an aeroplane the feed says has left is gone from every map', async () => {
  const now = T(9, 30, 12, 10);
  let arr = said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM');
  arr = said(arr, 'AC644', 30, 'Arrived at 11:04 AM', '11:04 AM');
  let dep = said(MORNING.departures, 'AC7995', 30, 'Departed at 11:20 AM', '11:20 AM');
  dep = said(dep, 'PD2370', 30, 'Departed at 12:02 PM', '12:02 PM');
  const m = await momentAt(now, null, { feed: { arrivals: arr, departures: dep } });
  const g1 = m.board('1');
  assert.deepEqual(g1.others(), ['AC644@BR1'], 'the Porter and AC7992\'s jet have gone; AC644\'s now has the bridge');
  // Before it left, PD2370 boarding still had it on the stand.
  const boarding = await momentAt(T(9, 30, 11, 40), null, { feed: { arrivals: arr, departures: said(dep, 'PD2370', 30, 'Boarding') } });
  assert.ok(boarding.board('1').others().includes('PD2381@5'));
});

test('the board\'s own aeroplane keeps its stand and is never among the others', async () => {
  const now = T(9, 30, 10, 45);
  const feed = { arrivals: said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM'), departures: MORNING.departures };
  const m = await momentAt(now, null, { feed });
  for (const gate of ['3', '4']) {
    const b = m.board(gate);
    assert.equal(b.window._gateMapWhere.kind, 'stand', 'gate ' + gate + ' draws its own');
    const own = b.ownStand();
    const plan = b.plan();
    assert.ok(!plan.items.some((i) => i.stand === own), 'gate ' + gate + ': nobody else on ' + own);
    assert.ok(!plan.items.some((i) => i.flight === b.inb.flight), 'gate ' + gate + ': its own inbound is not an "other"');
  }
  // Pure: a reserved stand is never handed out, and the one longest on the
  // ground is dealt first (larger first only between two down at one time).
  const E = engine({});
  const jet = E._mapPlaneSpecFor('B38M'), prop = E._mapPlaneSpecFor('DH8D'), crj = E._mapPlaneSpecFor('CRJ9');
  const it = (id, door, s, since) => ({ id, door, prop: s.prop, len: s.len, spec: s, since: since || 0 });
  assert.deepEqual(E._gateApronAssign(YQM, COORDS.YQM, [it('j', '4', jet, T(9, 30, 11, 4)), it('p', '3', prop, T(9, 29, 21, 47))], ['BR1']),
    { j: '6B', p: '5' }, 'BR1 is reserved: the 737 takes the first free stand, never the one the Porter stands on');
  assert.deepEqual(E._gateApronAssign(YQM, COORDS.YQM, [it('c', '4', crj, T(9, 30, 10, 27)), it('j', '3', jet, T(9, 30, 11, 13)), it('p', '4', prop, T(9, 29, 21, 47))], []),
    { c: 'BR1', j: '6B', p: '5' }, 'the jet on the bridge since 10:27 keeps it when the longer one lands; the Porter keeps its walk-out');
  assert.deepEqual(E._gateApronAssign(YQM, COORDS.YQM, [it('c', '4', crj), it('j', '3', jet), it('p', '4', prop)], []),
    { j: 'BR1', c: '6B', p: '5' }, 'down at one time (or not known): the longer jet gets the bridge, the turboprop its walk-out');
  assert.deepEqual(E._gateApronAssign(YQM, COORDS.YQM, [it('a', '1', jet), it('b', '2', prop), it('c', '—', jet)], []),
    { a: 'BR2', b: '2', c: null }, 'doors 1/2 have their own bridge; a row with no gate has no stand');
});

test('drawn at ground zoom over our field only: lighter, under the board\'s own, no route, no label', async () => {
  const now = T(9, 30, 9, 0);
  const m = await momentAt(now);
  const markers = [];
  const L = {
    divIcon: (o) => o,
    marker: (ll, opts) => {
      const el = { firstChild: { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } } };
      const mk = { ll, opts, el, getElement: () => el, addTo(map) { map.layers.push(mk); markers.push(mk); return mk; } };
      return mk;
    },
  };
  const mkMap = (center, zoom) => ({ _loaded: true, layers: [], center, zoom,
    getZoom() { return this.zoom; }, getCenter() { return { lat: this.center[0], lng: this.center[1] }; },
    removeLayer(l) { this.layers = this.layers.filter((x) => x !== l); } });
  const map = mkMap([46.1158, -64.6878], 17);
  const E = board(now, '4', m.arrS, m.depS, { L, map });
  E._gateApronSync(map);
  assert.equal(map.layers.length, 1);
  const mk = map.layers[0];
  assert.equal(mk.opts.icon.className, 'gate-apron-other');
  assert.equal(mk.opts.zIndexOffset, -1000, 'under the board\'s own aeroplane (1000)');
  assert.equal(mk.opts.interactive, false);
  assert.match(mk.opts.icon.html, /<img src="\/logos\/map-plane-dh4\.svg" width="48" height="48"/);
  assert.doesNotMatch(mk.opts.icon.html, /gate-map-note|gate-map-label/, 'no label');
  const rot = +mk.opts.icon.html.match(/rotate\((-?[\d.]+)deg\)/)[1];
  assert.equal(rot, 335, 'nose along stand 5\'s lead-in line');
  const ky = +mk.opts.icon.html.match(/--fids-plane-ky:([\d.]+)/)[1];
  const mpp = 156543.03392 * Math.cos(mk.ll[0] * Math.PI / 180) / Math.pow(2, 17);
  assert.ok(Math.abs(ky - 32.8 / mpp / 34.88) < 0.01, 'true scale at z17, like the board\'s own');
  // The nose is on stand 5's stop point: the marker is half a Dash 8 back along 335°.
  const back = E._gcNm(mk.ll, YQM.stands['5'].slice(0, 2)) * 1852;
  assert.ok(Math.abs(back - 16.4) < 0.6, 'centre 16.4 m behind the stop point, got ' + back.toFixed(1));
  // Nothing redrawn while nothing changed.
  E._gateApronSync(map);
  assert.equal(markers.length, 1);
  // The zoom hook re-sizes it like the board's own.
  map.zoom = 18;
  E._gateApronFit(map, 18);
  assert.ok(Math.abs(+mk.el.firstChild.style.props['--fids-plane-ky'] - 2 * ky) < 0.02);
  // Out to z15 (the flight views, the approach): taken off.
  map.zoom = 15;
  E._gateApronSync(map);
  assert.equal(map.layers.length, 0);
  // At another airport (a live view parked at the origin): nothing.
  map.zoom = 17; map.center = [45.4706, -73.7408];
  E._gateApronSync(map);
  assert.equal(map.layers.length, 0);
  // A map that is not one of the two gate maps: nothing.
  const other = mkMap([46.1158, -64.6878], 17);
  E._gateApronSync(other);
  assert.equal(other.layers.length, 0);
  // The CSS draws them lighter; the board's own picture is not dimmed.
  const at = CSS.indexOf('v23918 — THE OTHER AEROPLANES ON THE GROUND');
  assert.ok(at > 0);
  assert.match(CSS.slice(at), /\.leaflet-marker-icon\.gate-apron-other img\[src\*="\/logos\/map-plane-"\] \{\s*opacity: 0\.55;\s*\}/);
  // The board's own picture-swap never touches theirs.
  assert.match(fnSource('_mapPlaneFit'), /querySelector\('\.leaflet-marker-icon:not\(\.gate-apron-other\) img\[src\*="\/logos\/map-plane-"\]'\)/);
});

test('the empty-stand view still shows the others, and every map keeps itself current', () => {
  // gate 4 at 09:00 above: its own map is 'none' (the empty stand) and the Porter is drawn.
  const tiles = fnSource('_gateMapTileLayer');
  assert.match(tiles, /m\.on\('zoomend moveend', function \(\) \{ _gateApronSync\(m\); \}\);/);
  assert.match(tiles, /setTimeout\(function \(\) \{ try \{ _gateApronSync\(m\); \} catch \(e2\) \{\} \}, 0\);/);
  assert.match(fnSource('_mapPlaneFit'), /try \{ _gateApronFit\(map, z\); \} catch \(eA\) \{\}/);
  const apply = fnSource('_gateMapApply');
  const sync = apply.indexOf('_gateApronSync(gateMap); _gateApronSync(window._bigCraftMap);');
  assert.ok(sync > apply.indexOf('window._gateMapWhere = res;') && sync < apply.indexOf('window._lastMapProgKey === key) return;'),
    'every tick, after the answer is published, before the unchanged-key return');
  // The list is rebuilt per minute or per feed change, not per frame.
  const plan = fnSource('_gateApronPlan');
  assert.match(plan, /Math\.floor\(now \/ 60000\)/);
  assert.match(plan, /c\.arr === dA && c\.dep === dD && c\.kA === kA && c\.kD === kD/);
  // And asks nothing of the network: no fetch, and no registration lookup.
  for (const name of ['_gateApronSpec', '_gateApronCollect', '_gateApronPlan', '_gateApronSync', '_gateApronAssign', '_gateFeedKept', '_gateFeedRows']) {
    assert.doesNotMatch(fnSource(name), /fetch\(|_regTrueType\(|_apGatesFor\([^)]*,/, name);
  }
});

test('Moncton only: other airports draw no others, and the ten-gate rule is written but off', () => {
  const E = engine({ ap: 'YHZ' });
  assert.equal(E._gateApronOn('YQM'), true);
  assert.equal(E._gateApronOn('YHZ'), false);
  assert.equal(E._gateApronOn(''), false);
  const small = { stands: {}, gates: { 1: [0, 0], 2: [0, 0], 3: [0, 0] } };
  const off = engine({ gates: { YQM, YFC: small } });
  assert.equal(off._gateApronOn('YFC'), false, 'a three-door field waits for the switch');
  const on = engine({ gates: { YQM, YFC: small, YYZ: { gates: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i + 1), [0, 0]])) } }, bySize: true });
  assert.equal(on._gateApronOn('YFC'), true, 'switched on, ten doors or fewer qualify');
  assert.equal(on._gateApronOn('YYZ'), false, 'forty do not');
  // A non-Moncton board never draws one, whatever is on the ground.
  const markers = [];
  const L = { divIcon: (o) => o, marker: () => ({ addTo() { markers.push(1); return this; } }) };
  const map = { _loaded: true, layers: [], getZoom: () => 17, getCenter: () => ({ lat: 44.8808, lng: -63.5086 }), removeLayer() {} };
  const hz = engine({ ap: 'YHZ', L, map, data: { arr: [], dep: [] } });
  hz._gateApronSync(map);
  assert.equal(markers.length, 0);
  assert.match(lineSource('var _GATE_APRON_AIRPORTS = '), /\{ YQM: true \}/);
  assert.match(lineSource('var _GATE_APRON_BY_SIZE = '), /false/);
});

// ── v23918 review fixes ────────────────────────────────────────────────────

// Every board's flight → stand, its own aeroplane included whenever its own
// view draws it at a stand: the four Moncton boards must agree on every one.
function standsOn(b) {
  const out = {};
  for (const it of (b.plan() || { items: [] }).items) out[it.flight] = it.stand;
  const wh = b.window._gateMapWhere;
  if (wh && wh.kind === 'stand') out[(b.inb && b.inb.flight) || ('dep ' + b.cf.flight)] = b.ownStand();
  return out;
}
function assertBoardsAgree(m, label) {
  const seen = {};
  for (const g of ['1', '2', '3', '4']) {
    const s = standsOn(m.board(g));
    for (const [fl, st] of Object.entries(s)) {
      if (seen[fl]) assert.equal(st, seen[fl].st, label + ': ' + fl + ' on ' + st + ' at gate ' + g + ', on ' + seen[fl].st + ' at gate ' + seen[fl].g);
      else seen[fl] = { st, g };
    }
  }
  return Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.st]));
}
// One day back: a row of the 28th's evening answer (moved to the 29th) as the 28th's again.
function dayBack(r) {
  const bump = (s) => String(s || '').replace(/Sep (\d+)/, (m, d) => 'Sep ' + (Number(d) - 1)).replace(/(\d+) sep/, (m, d) => (Number(d) - 1) + ' sep');
  return Object.assign({}, r, { localTimestamp: r.localTimestamp - 86400, displayDate: bump(r.displayDate),
    dateTime: bump(r.dateTime), dateTimeFR: bump(r.dateTimeFR), haystack: bump(r.haystack) });
}

test('a row the worker remembered never wipes the tail, type and wheels-up this screen saw', async () => {
  // One screen running all night. While cyqm.ca lists AC2040, the webhook
  // merge puts C-FYJP and its A319 on the board's copy; once cyqm drops the
  // row, the worker's copy (cyqm's own row: no tail, no type) comes back
  // under the same key.
  const mod = await import(workerPath);
  mod._yqmSeenMem.arrivals = null; mod._yqmSeenMem.departures = null;
  const kv = new Map();
  const env = { FIDS_LIVE_FLIGHTS: {
    async get(k, t) { const v = kv.has(k) ? kv.get(k) : null; return (v && t && t.type === 'json') ? JSON.parse(v) : v; },
    async put(k, v) { kv.set(k, v); } } };
  const wctx = { waitUntil() {} };
  const storage = store();
  const push = {
    AC2040: { _reg: 'C-FYJP', _regSource: 'push', _aircraft: 'Airbus A319', _aircraftCode: 'A319' },
    // A departure's tail arrives with the push after wheels-up (never before, at Moncton).
    AC1983: { _reg: 'C-FYKW', _regSource: 'push', _aircraft: 'Airbus A319', _aircraftCode: 'A319', _pushStatus: 'active',
              _actualDepTime: new Date(T(9, 30, 5, 27)).toISOString().slice(0, 16).replace('T', ' ') + 'Z' },
  };
  const screen = (E) => async (t, arrivals, departures, merged) => {
    const a = JSON.parse((await mod.yqmWithMemory(env, wctx, 'arrivals', JSON.stringify(arrivals), t)).text);
    const d = JSON.parse((await mod.yqmWithMemory(env, wctx, 'departures', JSON.stringify(departures), t)).text);
    const aS = router.yqmSplitRemembered(a, 'Arrival'), dS = router.yqmSplitRemembered(d, 'Departure');
    E.mapADB = mapLite(E, t);
    E.window._yqmRemembered = { ap: 'YQM', arrivals: aS.kept, departures: dS.kept };
    E.data.arr = E.mapADB({ arrivals: aS.list }, 'arr');
    E.data.dep = E.mapADB({ departures: dS.list }, 'dep');
    // The webhook merge (_yqmCacheAircraftMerge) runs on the rows cyqm lists, never on the kept ones.
    for (const r of E.data.arr.concat(E.data.dep)) if ((merged || []).includes(r.flight) && push[r.flight]) Object.assign(r, push[r.flight]);
    return { arrs: E._gateArrsSeen(E._gateFeedRows('arr'), 'YQM', t), deps: E._gateDepsSeen(E._gateFeedRows('dep'), 'YQM', t) };
  };
  const E = engine({ now: T(9, 29, 22, 22), storage });
  const run = screen(E);
  const find = (rows, fl, day) => rows.find((r) => r.flight === fl && new Date(r._sortTs - 3 * 3600000).getUTCDate() === day);
  const s1 = await run(T(9, 29, 22, 22), EVENING.arrivals, EVENING.departures, ['AC2040']);
  assert.equal(find(s1.arrs, 'AC2040', 29)._reg, 'C-FYJP');
  const dropped = EVENING.arrivals.filter((r) => !/^Arrived/.test(r.status));
  const s2 = await run(T(9, 29, 23, 50), dropped, EVENING.departures, []);
  const kept = find(s2.arrs, 'AC2040', 29);
  assert.equal(kept._feedKept, true, 'the worker\'s copy');
  assert.equal(kept.status, 'arrived', 'its own word stays');
  assert.equal(kept._reg, 'C-FYJP', 'the tail this screen saw');
  assert.equal(kept._regSource, 'push');
  assert.equal(kept._aircraft, 'Airbus A319');
  assert.equal(s2.arrs.filter((r) => r.flight === 'AC2040' && r._sortTs === kept._sortTs).length, 1, 'one row, not two');
  // And a reload (every build bump reloads every board) keeps it too: the saved row carries the tail.
  const E2 = engine({ now: T(9, 29, 23, 55), storage });
  const s3 = await screen(E2)(T(9, 29, 23, 55), dropped, EVENING.departures, []);
  assert.equal(find(s3.arrs, 'AC2040', 29)._reg, 'C-FYJP');
  const saved = JSON.parse(storage.getItem('fids_gate_seen_v1')).YQM.arr;
  assert.equal(Object.values(saved).find((r) => r.flight === 'AC2040' && r._sortTs === kept._sortTs)._reg, 'C-FYJP');
  // A departure: AC1983's tail and wheels-up from the push after it left at 05:27.
  const dep0540 = said(EVENING.departures, 'AC1983', 30, 'Departed at 5:27 AM', '5:27 AM');
  const s4 = await screen(E2)(T(9, 30, 5, 40), dropped, dep0540, ['AC1983']);
  assert.equal(find(s4.deps, 'AC1983', 30)._reg, 'C-FYKW');
  // 09:00: cyqm no longer lists it; the worker's copy comes back without the push.
  const s5 = await screen(E2)(T(9, 30, 9, 0), MORNING.arrivals, MORNING.departures, []);
  const d = find(s5.deps, 'AC1983', 30);
  assert.equal(d._feedKept, true);
  assert.equal(d.status, 'departed');
  assert.equal(d._reg, 'C-FYKW');
  assert.equal(d._pushStatus, 'active');
  assert.equal(d._actualDepTime, push.AC1983._actualDepTime);
});

test('the kept tail keeps last night\'s Airbus on the stand once AC1983 has left with another one', async () => {
  // 05:58 on Sep 30, the Sep 28 schedule's shape (the first wave from gate 1):
  // AC1983 left at 05:27 and its push named C-FYKW. A screen that saw AC2040
  // land as C-FYJP knows AC1983 did not take it: AC2040 is still here for
  // AC2037 at 06:35. (With the tail wiped, the claim rules gave AC2040 to AC1983.)
  const mod = await import(workerPath);
  mod._yqmSeenMem.arrivals = null; mod._yqmSeenMem.departures = null;
  const kv = new Map();
  const env = { FIDS_LIVE_FLIGHTS: {
    async get(k, t) { const v = kv.has(k) ? kv.get(k) : null; return (v && t && t.type === 'json') ? JSON.parse(v) : v; },
    async put(k, v) { kv.set(k, v); } } };
  const wctx = { waitUntil() {} };
  const E = engine({ now: T(9, 29, 22, 22) });
  const poll = async (t, arrivals, departures, merge) => {
    const a = JSON.parse((await mod.yqmWithMemory(env, wctx, 'arrivals', JSON.stringify(arrivals), t)).text);
    const d = JSON.parse((await mod.yqmWithMemory(env, wctx, 'departures', JSON.stringify(departures), t)).text);
    const aS = router.yqmSplitRemembered(a, 'Arrival'), dS = router.yqmSplitRemembered(d, 'Departure');
    E.mapADB = mapLite(E, t);
    E.window._yqmRemembered = { ap: 'YQM', arrivals: aS.kept, departures: dS.kept };
    E.data.arr = E.mapADB({ arrivals: aS.list }, 'arr');
    E.data.dep = E.mapADB({ departures: dS.list }, 'dep');
    for (const r of E.data.arr.concat(E.data.dep)) if (merge[r.flight]) Object.assign(r, merge[r.flight]);
    const arrs = E._gateArrsSeen(E._gateFeedRows('arr'), 'YQM', t), deps = E._gateDepsSeen(E._gateFeedRows('dep'), 'YQM', t);
    return E._gateApronCollect('YQM', t, arrs, deps, 'America/Moncton').map((e) => e.inb.flight + '>' + e.dep.flight).sort();
  };
  await poll(T(9, 29, 22, 22), EVENING.arrivals, EVENING.departures, { AC2040: { _reg: 'C-FYJP', _regSource: 'push', _aircraft: 'Airbus A319' } });
  const dropped = EVENING.arrivals.filter((r) => !/^Arrived/.test(r.status));
  await poll(T(9, 29, 23, 50), dropped, EVENING.departures, {});
  const left = said(EVENING.departures, 'AC1983', 30, 'Departed at 5:27 AM', '5:27 AM');
  const up = new Date(T(9, 30, 5, 27)).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  const on = await poll(T(9, 30, 5, 58), dropped, left,
    { AC1983: { _reg: 'C-FYKW', _regSource: 'push', _aircraft: 'Airbus A319', _pushStatus: 'active', _actualDepTime: up } });
  assert.ok(on.includes('AC2040>AC2037'), on.join(' '));
});

test('one aeroplane per departure: two Airbuses down at gate 4 overnight, the first wave from gate 1', async () => {
  // The Sep 28 schedule's shape (the first wave boards at gate 1, which has no
  // arrivals of its own), no registrations anywhere: AC2040 in from Montréal
  // at 21:38 and AC1986 from Toronto at 00:18, both at gate 4; AC1983 leaves
  // gate 1 at 05:25, AC2037 at 06:35.
  const at0030 = { arrivals: said(EVENING.arrivals, 'AC1986', 30, 'Arrived at 12:18 AM', '12:18 AM'), departures: EVENING.departures };
  const later = EVENING.arrivals.filter((r) => r.displayDate !== 'Sep 29' && r.flightId !== 'AC1986');
  const at = async (hh, mm, dep) => momentAt(T(9, 30, hh, mm), null, { polls: [[T(9, 30, 0, 30), at0030]], feed: { arrivals: later, departures: dep } });
  // 05:00: AC1983 is boarding.
  const m5 = await at(5, 0, said(EVENING.departures, 'AC1983', 30, 'Boarding'));
  const g1 = m5.board('1');
  const coll = g1._gateApronCollect('YQM', T(9, 30, 5, 0), g1._gateArrsSeen(g1._gateFeedRows('arr'), 'YQM', T(9, 30, 5, 0)),
    g1._gateDepsSeen(g1._gateFeedRows('dep'), 'YQM', T(9, 30, 5, 0)), 'America/Moncton');
  const pairs = coll.map((e) => (e.inb ? e.inb.flight : '-') + '>' + (e.dep ? e.dep.flight : '-')).sort();
  assert.deepEqual(pairs, ['AC1986>AC1983', 'AC2040>AC2037', 'PD2381>PD2370'], 'each departure flies one of them');
  // Gate 1 draws its own boarding aeroplane and, lighter, the other Airbus.
  assert.equal(g1.cf.flight, 'AC1983');
  assert.equal(g1.window._gateMapWhere.kind, 'stand');
  assert.equal(g1.ownStand(), 'BR2');
  assert.deepEqual(g1.others(), ['AC2040@BR1', 'PD2381@5']);
  assert.deepEqual(m5.board('3').others(), ['AC1986@BR2', 'AC2040@BR1']);
  assertBoardsAgree(m5, '05:00');
  // 05:30: AC1983 has left with ONE of them. The other is still here for AC2037, on every board.
  const gone = said(EVENING.departures, 'AC1983', 30, 'Departed at 5:27 AM', '5:27 AM');
  const m530 = await at(5, 30, gone);
  for (const g of ['1', '2', '3', '4']) {
    assert.ok(m530.board(g).others().includes('AC2040@BR1'), 'gate ' + g + ': ' + m530.board(g).others().join(' '));
    assert.ok(!m530.board(g).others().some((x) => /^AC1986/.test(x)), 'gate ' + g + ': AC1986 left on AC1983');
  }
  // Gate 1's own view finds no inbound for AC2037 (it is at another gate): its
  // empty stand is the free bridge, not a stand anybody stands on.
  const g1b = m530.board('1');
  assert.equal(g1b.window._gateMapWhere.kind, 'none');
  assert.equal(g1b.ownStand(), 'BR2');
  // 06:10: AC2037 boards — that Airbus is gate 1's own now, and nobody else's.
  const m610 = await at(6, 10, said(gone, 'AC2037', 30, 'Boarding'));
  const g1c = m610.board('1');
  assert.equal(g1c.window._gateMapWhere.kind, 'stand');
  assert.ok(!g1c.others().some((x) => /^AC/.test(x)), g1c.others().join(' '));
  assert.ok(m610.board('3').others().includes('AC2040@BR2'), 'at its departure\'s door');
});

test('a parked aeroplane keeps its stand when another lands, and all four boards agree', async () => {
  // (a) Night of Sep 29, no types: AC2040 on Bridge 1 since 21:38; AC1986
  // lands at 00:18 with an earlier departure — it takes a free stand, it does
  // not move AC2040.
  const n1 = await momentAt(T(9, 29, 23, 55), null, { feed: { arrivals: EVENING.arrivals, departures: EVENING.departures } });
  assert.equal(assertBoardsAgree(n1, '23:55').AC2040, 'BR1');
  const at0030 = { arrivals: said(EVENING.arrivals, 'AC1986', 30, 'Arrived at 12:18 AM', '12:18 AM'), departures: EVENING.departures };
  const n2 = await momentAt(T(9, 30, 0, 30), null, { feed: at0030 });
  const s2 = assertBoardsAgree(n2, '00:30');
  assert.equal(s2.AC2040, 'BR1', 'still on the bridge');
  assert.equal(s2.PD2381, '5');
  assert.equal(s2.AC1986, '6B', 'the free walk-out');
  // (b) Sep 30 with types: the E175 on Bridge 1 since 10:27 keeps it when the
  // longer A320 lands at 11:13 — on gate 4's board (whose own it is) as on the rest.
  const types = { AC7992: 'E175', AC7995: 'E175', AC644: 'A320', AC647: 'A320', PD2370: 'DH8D', PD2381: 'DH8D' };
  let arr = said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM');
  const b1 = await momentAt(T(9, 30, 11, 10), null, { types, feed: { arrivals: arr, departures: said(MORNING.departures, 'AC7995', 30, 'Boarding') } });
  assert.equal(assertBoardsAgree(b1, '11:10').AC7992, 'BR1');
  arr = said(arr, 'AC644', 30, 'Arrived at 11:13 AM', '11:13 AM');
  const b2 = await momentAt(T(9, 30, 11, 15), null, { types, feed: { arrivals: arr, departures: said(MORNING.departures, 'AC7995', 30, 'Boarding') } });
  const s3 = assertBoardsAgree(b2, '11:15');
  assert.deepEqual([s3.AC7992, s3.AC644, s3.PD2381], ['BR1', '6B', '5']);
  assert.equal(b2.board('4').ownStand(), 'BR1', 'gate 4\'s own E175');
  assert.deepEqual(b2.board('4').others(), ['AC644@6B', 'PD2381@5']);
  assert.deepEqual(b2.board('3').others(), ['AC644@6B', 'AC7992@BR1']);
  // (c) The Porter on stand 5 all night keeps it when a Jazz Dash 8 with an
  // earlier departure is put on the ground by its boarding (AC7754, down at
  // 18:36 on the 29th — past four hours and no night stop, so not drawn
  // overnight): the Dash 8 takes the next walk-out.
  const jazz = dayBack(EVENING.arrivals.find((r) => r.flightId === 'AC7754'));
  const jazzIn = Object.assign({}, jazz, { status: 'Arrived at 6:36 PM', actualTime: '6:36 PM' });
  const typesC = Object.assign({ AC7754: 'DH8D', AC7753: 'DH8D', AC2040: 'A319', AC2037: 'A319' }, types);
  const polls = [[T(9, 29, 18, 50), { arrivals: [jazzIn].concat(EVENING.arrivals), departures: EVENING.departures }]];
  const c1 = await momentAt(T(9, 30, 6, 0), null, { types: typesC, polls,
    feed: { arrivals: MORNING.arrivals, departures: said(said(MORNING.departures, 'AC2037', 30, 'Boarding'), 'AC7753', 30, 'OnTime', '7:10 AM') } });
  assert.equal(assertBoardsAgree(c1, '06:00').PD2381, '5');
  const c2 = await momentAt(T(9, 30, 6, 40), null, { types: typesC, polls,
    feed: { arrivals: MORNING.arrivals, departures: said(MORNING.departures, 'AC7753', 30, 'Boarding') } });
  const s4 = assertBoardsAgree(c2, '06:40');
  assert.equal(s4.PD2381, '5', 'the Porter is not moved');
  assert.equal(s4.AC7754, '6B', 'the Dash 8 boarding AC7753 takes the next walk-out');
});

test('the empty stand is one nobody stands on, and nothing moves when this board\'s aeroplane lands', async () => {
  // Gate 4 at 11:10 on Sep 30: its own AC7995's aeroplane (AC7992) is late,
  // AC644 is already down (11:04). The empty stand's ring and label go to the
  // stand everyone on the ground leaves free — not Bridge 1 under AC644.
  const types = { AC7992: 'E175', AC7995: 'E175', AC644: 'A320', AC647: 'A320' };
  let arr = said(MORNING.arrivals, 'AC7992', 30, 'Delayed until 11:45 AM', '11:45 AM');
  arr = said(arr, 'AC644', 30, 'Arrived at 11:04 AM', '11:04 AM');
  const m1 = await momentAt(T(9, 30, 11, 10), null, { types, feed: { arrivals: arr, departures: MORNING.departures } });
  const g4 = m1.board('4');
  assert.equal(g4.cf.flight, 'AC7995');
  assert.equal(g4.window._gateMapWhere.kind, 'none');
  assert.deepEqual(g4.others(), ['AC644@BR1', 'PD2381@5']);
  assert.equal(g4.ownStand(), '6B');
  // The plan says so too, and the map's key carries it (a redraw when it changes).
  assert.equal(g4.plan().own, '6B');
  assert.equal(g4._gateApronOwnRef(), '6B');
  // 11:14: AC7992 is down. Gate 4's own aeroplane is drawn on that same stand; AC644 has not moved.
  const m2 = await momentAt(T(9, 30, 11, 14), null, { types,
    feed: { arrivals: said(arr, 'AC7992', 30, 'Arrived at 11:12 AM', '11:12 AM'), departures: MORNING.departures } });
  const g4b = m2.board('4');
  assert.equal(g4b.window._gateMapWhere.kind, 'stand');
  assert.equal(g4b.ownStand(), '6B');
  assert.deepEqual(g4b.others(), ['AC644@BR1', 'PD2381@5']);
  assert.equal(assertBoardsAgree(m2, '11:14').AC7992, '6B');
  // Every place the board draws its own aeroplane or its empty stand goes through the one deal.
  const sites = CORE.match(/_gateOwnParkSpot\((_hK, \[_hC\[0\], _hC\[1\]\]|_stI, _stC|_bcStI, _bcStC)\)/g) || [];
  assert.equal(sites.length, 4, 'both maps, both paths');
  assert.doesNotMatch(CORE, /_gateParkSpot\((_hK|_stI|_bcStI),/);
  assert.match(fnSource('_gateMapApply'), /if \(res\.kind === 'stand' \|\| res\.kind === 'none'\) \{ try \{ key \+= '\|' \+ _gateApronOwnRef\(\); \} catch \(eO\) \{\} \}/);
});

test('two stands a few metres apart are one place: no aeroplane is drawn on top of another', () => {
  const E = engine({});
  const prop = E._mapPlaneSpecFor('DH8D'), jet = E._mapPlaneSpecFor('A320');
  const it = (id, door, s, since) => ({ id, door, prop: s.prop, len: s.len, spec: s, since: since || 0 });
  const m = (a, b) => E._gcNm(YQM.stands[a], YQM.stands[b]) * 1852;
  assert.ok(m('1B', '2') < 5, 'Moncton\'s gate file: stand 1B is 3.8 m from stand 2');
  // Two Dash 8s at door 2: stand 2 and the next walk-out that is not on top of it.
  const two = E._gateApronAssign(YQM, COORDS.YQM, [it('a', '2', prop, 1), it('b', '2', prop, 2)], []);
  assert.deepEqual(two, { a: '2', b: '1A' });
  assert.ok(m(two.a, two.b) > prop.span, 'at least a wingspan apart');
  // A board whose own aeroplane stands on 2: nobody is dealt 1B.
  assert.deepEqual(E._gateApronAssign(YQM, COORDS.YQM, [it('x', '1', prop, 1), it('y', '1', prop, 2)], ['2']), { x: '1A', y: 'BR2' });
  // Whatever the mix, every pair dealt is at least _GATE_APRON_CLEAR_M apart.
  const mixes = [
    [it('j1', '1', jet, 1), it('j2', '1', jet, 2), it('j3', '1', jet, 3), it('p', '2', prop, 4)],
    [it('p1', '2', prop, 1), it('p2', '1', prop, 2), it('p3', '2', prop, 3), it('j', '2', jet, 4)],
    [it('p1', '1', prop, 1), it('p2', '1', prop, 2), it('p3', '1', prop, 3), it('p4', '2', prop, 4)],
  ];
  for (const mix of mixes) {
    const got = Object.values(E._gateApronAssign(YQM, COORDS.YQM, mix, [])).filter(Boolean);
    for (let i = 0; i < got.length; i++) for (let j = i + 1; j < got.length; j++) {
      assert.ok(m(got[i], got[j]) >= 20, got[i] + ' / ' + got[j] + ' in ' + JSON.stringify(got));
    }
  }
});
