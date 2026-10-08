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
// v23930 changed what puts an aeroplane on the ground. A landing ("Arrived",
// live or remembered) counts for 20 minutes, while it deplanes. After that
// only its departure boarding (Boarding, Final call, Gate closed in the
// feed's words) or a fresh live fix puts it there. The tests below put their
// aeroplanes on the ground that way. The section at the end is the evening of
// 2026-10-02 that showed the phantom.
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
  [fnSourceIn(ROUTER, 'fidsNeutralWord'), fnSourceIn(ROUTER, 'yqmTimeObj'), fnSourceIn(ROUTER, 'yqmClockToMin'), fnSourceIn(ROUTER, 'yqmStatus'),
   fnSourceIn(ROUTER, 'yqmToAdbFlight'), fnSourceIn(ROUTER, 'yqmSplitRemembered'),
   'return { yqmToAdbFlight, yqmSplitRemembered, yqmStatus };'].join('\n'))();

const FNS = [
  // the v23915 evidence rules
  '_gateLegGone', '_gateFamily', '_gateRowKey', '_gateRawStatus', '_gateRawLanded', '_gateRawAirborne', '_gatePushLeft',
  '_gateOutboundAtGate', '_gateTodayReg', '_gateIsProp', '_gateMinTurnMs', '_gateDepSchedTs',
  '_gateAcFamily', '_gateHereTz', '_gateLocalHour', '_gateNightStop', '_gateCouldTurn',
  '_gateDepOwnInbound', '_gateArrivalClaimed', '_gateTurnedByPattern', '_gateTurnConsumed', '_gateLandedAt',
  '_gateSeenOnly', '_gateStandVerdict', '_gateLegUp', '_gateAirEstProg', '_gateFixCheck', '_gateFixFor', '_gateDepsSeen',
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
  '_gateApronTagHtml', '_gateApronTagBuild', '_gateApronTagPlace',
  '_gateSeenKeepIdentity',
  // v23925 — the boarding the gate's own sign shows (v23930: the maps' door word)
  '_gateDoorBasis', '_gateDoorRecord',
  // v23919 — every aeroplane in the picture
  '_gateApronFrame', '_gateApronFrameCentre',
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
    lineSource('var _GATE_DEPLANE_MS = '),
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
  // The moment's clock, for the code that reads Date.now() itself
  // (_gateOwnParkSpot, _gateApronOwnRef): without it they answered for the
  // time the tests happened to run, and the 11:10 board's empty stand moved
  // once the afternoon's rules no longer had AC644 on the ground.
  const RealDate = Date;
  const at = ctx.now;
  const Clock = at === undefined ? RealDate : (function () {
    function D(...a) { return a.length ? new RealDate(...a) : new RealDate(at); }
    D.now = () => at; D.UTC = RealDate.UTC; D.parse = RealDate.parse; D.prototype = RealDate.prototype;
    return D;
  })();
  const mod = new Function('window', 'data', 'AP', '_lookupAirport', 'localStorage', '_apGatesFor', '_AP_GATES',
    'mapADB', '_fidsCollapseRevisions', 'L', 'gateMap', 'subScreenVal', 'console', 'Date', src)(
    window, data, { YQM: { tz: 'America/Moncton' }, YHZ: { tz: 'America/Halifax' } },
    (k) => COORDS[String(k || '').toUpperCase()] || null, ctx.storage || store(),
    (k) => gates[String(k || '').toUpperCase()] || null, gates,
    (raw, mode, kept) => E.mapADB(raw, mode, kept), (rows) => rows, ctx.L || null, ctx.map || null, ctx.sub || '',
    { log() {} }, Clock);
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

test('09:00 on Sep 30: the Porter that landed at 21:47 is not drawn on any map until PD2370 boards (v23930)', async () => {
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
  // A landing eleven hours ago is not a place: nothing on the apron.
  assert.deepEqual(g4.others(), []);
  // Gate 3: the worker's memory still names PD2370's aeroplane, but parks nothing.
  const g3 = m.board('3');
  assert.equal(g3.cf.flight, 'PD2370');
  assert.equal(g3.inb.flight, 'PD2381');
  assert.equal(g3.inb._feedKept, true, 'found only because the worker remembered it');
  assert.equal(g3.window._gateMapWhere.kind, 'none');
  assert.equal(g3.window._gateMapWhere.why, 'remembered', 'a memory puts no aeroplane on the ground');
  assert.deepEqual(g3.others(), []);
  // 11:25: PD2370 is boarding, in the feed's words. The Porter is at the door,
  // on gate 3's own map on a walk-out of doors 3/4, and lighter on gate 4's.
  const b = await momentAt(T(9, 30, 11, 25), null, { feed: { arrivals: MORNING.arrivals, departures: said(MORNING.departures, 'PD2370', 30, 'Boarding') } });
  const b3 = b.board('3');
  assert.equal(b3.window._gateMapWhere.kind, 'stand');
  assert.equal(b3.window._gateMapWhere.why, 'boarding');
  assert.equal(b3.ownStand(), '5');
  assert.deepEqual(b3.others(), [], 'never drawn twice');
  const b4 = b.board('4');
  assert.deepEqual(b4.others(), ['PD2381@5']);
  const it = b4.plan().items[0];
  assert.equal(it.spec.art.src, '/logos/map-plane-dh4.svg');
  assert.equal(it.prop, true);
  assert.ok(!YQM.bridged.includes(it.stand), 'a turboprop walks out');
  assert.ok(YQM.door_stands['3'].includes(it.stand) && YQM.door_stands['4'].includes(it.stand));
});

test('04:00 on Sep 30: last night\'s landings put nothing on any map; AC2037 boarding puts its Airbus on Bridge 1', async () => {
  const now = T(9, 30, 4, 0);
  // Before the first wave: AC2037 and AC7753 had not left yet.
  let dep = said(MORNING.departures, 'AC2037', 30, 'OnTime', '6:35 AM');
  dep = said(dep, 'AC7753', 30, 'OnTime', '7:10 AM');
  const m = await momentAt(now, null, { feed: { arrivals: MORNING.arrivals, departures: dep } });
  // Gate 4: its own AC2037 flies last night's AC2040 (remembered by the worker), but nothing says it is here now.
  const g4 = m.board('4');
  assert.equal(g4.cf.flight, 'AC2037');
  assert.equal(g4.inb && g4.inb.flight, 'AC2040');
  assert.equal(g4.window._gateMapWhere.kind, 'none', 'down at 21:38: a landing, not a place (v23930)');
  for (const g of ['1', '2', '3', '4']) assert.deepEqual(m.board(g).others(), [], '04:00 gate ' + g);
  // 06:05: AC2037 is boarding. Its Airbus is at the door: on the bridge on gate 4's map, lighter on gate 3's.
  const b = await momentAt(T(9, 30, 6, 5), null, { feed: { arrivals: MORNING.arrivals, departures: said(dep, 'AC2037', 30, 'Boarding') } });
  const b4 = b.board('4');
  assert.equal(b4.window._gateMapWhere.kind, 'stand');
  assert.equal(b4.ownStand(), 'BR1');
  assert.deepEqual(b4.others(), [], 'the Porter waiting for 11:55 is not drawn');
  const g3 = b.board('3');
  assert.deepEqual(g3.others(), ['AC2040@BR1']);
  const jet = g3.plan().items[0];
  assert.ok(YQM.bridged.includes(jet.stand) && !jet.prop, 'a jet takes the bridge');
});

test('an aeroplane the board\'s own view rules off its stand is still drawn, lighter, when it is at another departure\'s door', async () => {
  // The Sep 28 schedule's shape (tests/gate-map-evidence.test.js): a 06:15
  // Porter from gate 4 flies the night-stop Porter first, so it is not
  // PD2370's aeroplane — gate 3's own view is its empty stand. v23930: it is
  // on the apron once PD2294 is boarding, and not before.
  const pd2294 = Object.assign({}, MORNING.departures.find((r) => r.flightId === 'PD2294'),
    { localTimestamp: T(9, 30, 6, 15) / 1000 - 3 * 3600, displayDate: 'Sep 30', dateTime: 'Sep 30 - 6:15 AM', scheduledTime: '6:15 AM',
      actualTime: '6:15 AM', gate: '4', status: 'OnTime' });
  const dep = MORNING.departures.concat([pd2294]).sort((a, b) => a.localTimestamp - b.localTimestamp);
  const m4 = await momentAt(T(9, 30, 4, 0), null, { feed: { arrivals: MORNING.arrivals, departures: dep } });
  assert.deepEqual(m4.board('3').others(), [], '04:00: nothing says where the Porter is');
  const boarding = dep.map((r) => (r === pd2294 ? Object.assign({}, r, { status: 'Boarding' }) : r));
  const now = T(9, 30, 5, 50);
  const m = await momentAt(now, null, { feed: { arrivals: MORNING.arrivals, departures: boarding } });
  const g3 = m.board('3');
  assert.equal(g3.cf.flight, 'PD2370');
  assert.equal(g3.inb, null, 'PD2381 belongs to the 06:15');
  assert.equal(g3.window._gateMapWhere.kind, 'none');
  assert.ok(g3.others().includes('PD2381@5'), 'boarding PD2294: drawn, not hidden as if it were this board\'s');
  // Its empty stand is one nobody stands on: the free walk-out, not the
  // Porter's stand 5 under the label — and every board puts the Porter on 5.
  assert.equal(g3.ownStand(), '6B');
  assert.ok(!g3.others().some((x) => x.endsWith('@6B')));
  assert.equal(assertBoardsAgree(m, '05:50').PD2381, '5');
  // Once PD2294 has gone, so has it.
  const gone = dep.map((r) => (r === pd2294 ? Object.assign({}, r, { status: 'Departed at 6:21 AM' }) : r));
  const later = await momentAt(T(9, 30, 6, 40), null, { feed: { arrivals: MORNING.arrivals, departures: gone } });
  assert.ok(!later.board('3').others().some((x) => /^PD2381/.test(x)));
});

test('10:45: Air Canada\'s AC7992 is down — the jet on Bridge 1 while it deplanes, then again when AC7995 boards', async () => {
  const now = T(9, 30, 10, 45);
  const arrivals = said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM');
  const m = await momentAt(now, null, { feed: { arrivals, departures: MORNING.departures } });
  // Gate 1 has no flights of its own this morning: it shows it, lighter. The
  // Porter waiting for 11:55 is not drawn (v23930: nothing says it is there).
  const g1 = m.board('1');
  assert.deepEqual(g1.others(), ['AC7992@BR1']);
  // Gate 3: its own empty stand, the jet on the bridge.
  const g3 = m.board('3');
  assert.equal(g3.window._gateMapWhere.kind, 'none');
  assert.deepEqual(g3.others(), ['AC7992@BR1']);
  // Gate 4: AC7992 is its own (AC7995's) aeroplane, on the bridge the single view gives it.
  const g4 = m.board('4');
  assert.equal(g4.window._gateMapWhere.kind, 'stand');
  assert.equal(g4.ownStand(), 'BR1');
  assert.deepEqual(g4.others(), []);
  // 10:48: 21 minutes since "Arrived at 10:27". Nothing says it is still there.
  const m2 = await momentAt(T(9, 30, 10, 48), null, { feed: { arrivals, departures: MORNING.departures } });
  assert.deepEqual(m2.board('1').others(), []);
  assert.equal(m2.board('4').window._gateMapWhere.kind, 'none');
  // 10:50: AC7995 is boarding. Its aeroplane is at the door again, on every map.
  const m3 = await momentAt(T(9, 30, 10, 50), null, { feed: { arrivals, departures: said(MORNING.departures, 'AC7995', 30, 'Boarding') } });
  assert.equal(m3.board('4').window._gateMapWhere.why, 'boarding');
  assert.equal(m3.board('4').ownStand(), 'BR1');
  assert.deepEqual(m3.board('1').others(), ['AC7992@BR1']);
});

test('11:22: two Air Canada jets and the Porter at doors 3/4 — three aeroplanes, three stands', async () => {
  // v23930: each one on evidence of its own — AC7992 and the Porter at the
  // door of a departure that is boarding, AC644 down 18 minutes ago.
  const now = T(9, 30, 11, 22);
  let arr = said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM');
  arr = said(arr, 'AC644', 30, 'Arrived at 11:04 AM', '11:04 AM');
  const dep = said(said(MORNING.departures, 'AC7995', 30, 'Boarding'), 'PD2370', 30, 'Boarding');
  const m = await momentAt(now, null, { feed: { arrivals: arr, departures: dep } });
  const g1 = m.board('1');
  const others = g1.others();
  assert.deepEqual(others, ['AC644@5', 'AC7992@BR1', 'PD2381@6B']);
  const stands = others.map((s) => s.split('@')[1]);
  assert.equal(new Set(stands).size, stands.length, 'no stand twice');
  // Dealt in the order they came to be drawn: AC7992 on the bridge since
  // 10:27, AC644 since 11:04 (the bridge taken, the door's first free stand),
  // the Porter only since PD2370 began boarding — so it takes the next walk-out
  // and moves nobody.
  const before = await momentAt(T(9, 30, 11, 20), null, { feed: { arrivals: arr, departures: said(MORNING.departures, 'AC7995', 30, 'Boarding') } });
  assert.deepEqual(before.board('1').others(), ['AC644@5', 'AC7992@BR1'], '11:20: the same stands before the Porter appears');
  // Gates 3 and 4 each draw their own boarding aeroplane, the others round it.
  const g3 = m.board('3'), g4 = m.board('4');
  assert.equal(g3.window._gateMapWhere.why, 'boarding');
  assert.equal(g3.ownStand(), '6B');
  assert.deepEqual(g3.others(), ['AC644@5', 'AC7992@BR1']);
  assert.equal(g4.window._gateMapWhere.why, 'boarding');
  assert.equal(g4.ownStand(), 'BR1');
  assert.deepEqual(g4.others(), ['AC644@5', 'PD2381@6B']);
  assertBoardsAgree(m, '11:22');
});

test('12:10: an aeroplane the feed says has left is gone from every map', async () => {
  const now = T(9, 30, 12, 10);
  let arr = said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM');
  arr = said(arr, 'AC644', 30, 'Arrived at 11:04 AM', '11:04 AM');
  let dep = said(MORNING.departures, 'AC7995', 30, 'Departed at 11:20 AM', '11:20 AM');
  dep = said(dep, 'PD2370', 30, 'Departed at 12:02 PM', '12:02 PM');
  const m = await momentAt(now, null, { feed: { arrivals: arr, departures: dep } });
  assert.deepEqual(m.board('1').others(), [], 'the Porter and AC7992\'s jet have gone, and AC644 is an hour past its landing');
  // AC647 boarding: AC644's aeroplane is at its door, and it now has the bridge.
  const b = await momentAt(now, null, { feed: { arrivals: arr, departures: said(dep, 'AC647', 30, 'Boarding') } });
  assert.deepEqual(b.board('1').others(), ['AC644@BR1']);
  // Before it left, PD2370 boarding still had it on the stand.
  const boarding = await momentAt(T(9, 30, 11, 40), null, { feed: { arrivals: arr, departures: said(dep, 'PD2370', 30, 'Boarding') } });
  assert.ok(boarding.board('1').others().includes('PD2381@5'));
});

test('the board\'s own aeroplane keeps its stand and is never among the others', async () => {
  // 11:22, both doors boarding (v23930: the evidence that draws each board's own).
  const now = T(9, 30, 11, 22);
  let arrivals = said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM');
  arrivals = said(arrivals, 'AC644', 30, 'Arrived at 11:04 AM', '11:04 AM');
  const feed = { arrivals, departures: said(said(MORNING.departures, 'AC7995', 30, 'Boarding'), 'PD2370', 30, 'Boarding') };
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
  // 11:25: PD2370 boarding puts the Porter at its door (v23930).
  const now = T(9, 30, 11, 25);
  const m = await momentAt(now, null, { feed: { arrivals: MORNING.arrivals, departures: said(MORNING.departures, 'PD2370', 30, 'Boarding') } });
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

test('the kept tail says which Airbus boards AC2037 once AC1983 has left with another one', async () => {
  // The Sep 28 schedule's shape (the first wave from gate 1): AC1983 left at
  // 05:27 and its push named C-FYKW. A screen that saw AC2040 land as C-FYJP
  // knows AC1983 did not take it: AC2040 is the aeroplane AC2037 boards at
  // 06:05. (With the tail wiped, the claim rules gave AC2040 to AC1983.)
  // v23930: before the boarding, a landing at 21:38 puts nothing on the apron.
  const run = async (tail) => {
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
      return E._gateApronCollect('YQM', t, arrs, deps, 'America/Moncton')
        .map((e) => (e.inb ? e.inb.flight : '-') + '>' + (e.dep ? e.dep.flight : '-')).sort();
    };
    await poll(T(9, 29, 22, 22), EVENING.arrivals, EVENING.departures, tail ? { AC2040: { _reg: 'C-FYJP', _regSource: 'push', _aircraft: 'Airbus A319' } } : {});
    const dropped = EVENING.arrivals.filter((r) => !/^Arrived/.test(r.status));
    await poll(T(9, 29, 23, 50), dropped, EVENING.departures, {});
    const left = said(EVENING.departures, 'AC1983', 30, 'Departed at 5:27 AM', '5:27 AM');
    const up = new Date(T(9, 30, 5, 27)).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
    const ac1983 = { AC1983: { _reg: 'C-FYKW', _regSource: 'push', _aircraft: 'Airbus A319', _pushStatus: 'active', _actualDepTime: up } };
    const at0558 = await poll(T(9, 30, 5, 58), dropped, left, ac1983);
    const at0605 = await poll(T(9, 30, 6, 5), dropped, said(left, 'AC2037', 30, 'Boarding'), ac1983);
    return { at0558, at0605 };
  };
  const kept = await run(true);
  assert.deepEqual(kept.at0558, [], '05:58: nothing says the Airbus is still there');
  assert.ok(kept.at0605.includes('AC2040>AC2037'), kept.at0605.join(' '));
  const wiped = await run(false);
  // Without the tail the claim rules give AC2040 to AC1983: AC2037's boarding
  // aeroplane is still drawn (the door word is the evidence), with no name.
  assert.deepEqual(wiped.at0605, ['->AC2037']);
});

test('one aeroplane per departure: two Airbuses down at gate 4 overnight, the first wave from gate 1', async () => {
  // The Sep 28 schedule's shape (the first wave boards at gate 1, which has no
  // arrivals of its own), no registrations anywhere: AC2040 in from Montréal
  // at 21:38 and AC1986 from Toronto at 00:18, both at gate 4; AC1983 leaves
  // gate 1 at 05:25, AC2037 at 06:35.
  const at0030 = { arrivals: said(EVENING.arrivals, 'AC1986', 30, 'Arrived at 12:18 AM', '12:18 AM'), departures: EVENING.departures };
  const later = EVENING.arrivals.filter((r) => r.displayDate !== 'Sep 29' && r.flightId !== 'AC1986');
  const at = async (hh, mm, dep) => momentAt(T(9, 30, hh, mm), null, { polls: [[T(9, 30, 0, 30), at0030]], feed: { arrivals: later, departures: dep } });
  const pairsAt = (m, hh, mm) => {
    const g1 = m.board('1'), t = T(9, 30, hh, mm);
    return g1._gateApronCollect('YQM', t, g1._gateArrsSeen(g1._gateFeedRows('arr'), 'YQM', t),
      g1._gateDepsSeen(g1._gateFeedRows('dep'), 'YQM', t), 'America/Moncton')
      .map((e) => (e.inb ? e.inb.flight : '-') + '>' + (e.dep ? e.dep.flight : '-')).sort();
  };
  // 05:00: AC1983 is boarding. v23930: only a departure's door word puts an
  // aeroplane on the ground this long after the landings, so the one drawn is
  // AC1983's — and the gate-match gives it ONE of the two Airbuses.
  const m5 = await at(5, 0, said(EVENING.departures, 'AC1983', 30, 'Boarding'));
  assert.deepEqual(pairsAt(m5, 5, 0), ['AC1986>AC1983'], 'one aeroplane for the one departure boarding');
  const g1 = m5.board('1');
  assert.equal(g1.cf.flight, 'AC1983');
  assert.equal(g1.window._gateMapWhere.kind, 'stand');
  assert.equal(g1.ownStand(), 'BR2');
  assert.deepEqual(g1.others(), [], 'AC2040 and the Porter: landed hours ago, nothing says they are here now');
  assert.deepEqual(m5.board('3').others(), ['AC1986@BR2']);
  assertBoardsAgree(m5, '05:00');
  // 05:30: AC1983 has left with ONE of them. Nothing else is boarding: nothing on any map.
  const gone = said(EVENING.departures, 'AC1983', 30, 'Departed at 5:27 AM', '5:27 AM');
  const m530 = await at(5, 30, gone);
  assert.deepEqual(pairsAt(m530, 5, 30), []);
  for (const g of ['1', '2', '3', '4']) assert.deepEqual(m530.board(g).others(), [], 'gate ' + g);
  // Gate 1's own view finds no inbound for AC2037 (it is at another gate): its
  // empty stand is the free bridge.
  const g1b = m530.board('1');
  assert.equal(g1b.window._gateMapWhere.kind, 'none');
  assert.equal(g1b.ownStand(), 'BR2');
  // 06:10: AC2037 boards. The other Airbus — not the one AC1983 took — is at
  // its door: gate 1's own, and nobody else's.
  const m610 = await at(6, 10, said(gone, 'AC2037', 30, 'Boarding'));
  assert.deepEqual(pairsAt(m610, 6, 10), ['AC2040>AC2037']);
  const g1c = m610.board('1');
  assert.equal(g1c.window._gateMapWhere.kind, 'stand');
  assert.ok(!g1c.others().some((x) => /^AC/.test(x)), g1c.others().join(' '));
  assert.ok(m610.board('3').others().includes('AC2040@BR2'), 'at its departure\'s door');
});

test('a parked aeroplane keeps its stand when another lands, and all four boards agree', async () => {
  // v23930: every aeroplane here is on the ground on evidence that it is
  // there now — deplaning (the first 20 minutes after "Arrived at"), or at
  // the door of a departure that is boarding.
  // (a) No types: AC7992 on Bridge 1 since 10:27; AC644 lands at 10:40 — it
  // takes a free stand, it does not move AC7992.
  let arr = said(MORNING.arrivals, 'AC7992', 30, 'Arrived at 10:27 AM', '10:27 AM');
  const a1 = await momentAt(T(9, 30, 10, 35), null, { feed: { arrivals: arr, departures: MORNING.departures } });
  assert.equal(assertBoardsAgree(a1, '10:35').AC7992, 'BR1');
  const a2 = await momentAt(T(9, 30, 10, 45), null, { feed: { arrivals: said(arr, 'AC644', 30, 'Arrived at 10:40 AM', '10:40 AM'), departures: MORNING.departures } });
  const s2 = assertBoardsAgree(a2, '10:45');
  assert.equal(s2.AC7992, 'BR1', 'still on the bridge');
  assert.equal(s2.AC644, '5', 'the first free stand of its door');
  // (b) With types: the E175 on Bridge 1 since 10:27 (AC7995 boarding) keeps it
  // when the longer A320 lands at 11:13 — on gate 4's board (whose own it is) as on the rest.
  const types = { AC7992: 'E175', AC7995: 'E175', AC644: 'A320', AC647: 'A320', PD2370: 'DH8D', PD2381: 'DH8D' };
  const b1 = await momentAt(T(9, 30, 11, 10), null, { types, feed: { arrivals: arr, departures: said(MORNING.departures, 'AC7995', 30, 'Boarding') } });
  assert.equal(assertBoardsAgree(b1, '11:10').AC7992, 'BR1');
  arr = said(arr, 'AC644', 30, 'Arrived at 11:13 AM', '11:13 AM');
  const b2 = await momentAt(T(9, 30, 11, 15), null, { types, feed: { arrivals: arr, departures: said(MORNING.departures, 'AC7995', 30, 'Boarding') } });
  const s3 = assertBoardsAgree(b2, '11:15');
  assert.deepEqual([s3.AC7992, s3.AC644], ['BR1', '5']);
  assert.equal(s3.PD2381, undefined, 'the Porter waiting for 11:55 is not drawn before PD2370 boards');
  assert.equal(b2.board('4').ownStand(), 'BR1', 'gate 4\'s own E175');
  assert.deepEqual(b2.board('4').others(), ['AC644@5']);
  assert.deepEqual(b2.board('3').others(), ['AC644@5', 'AC7992@BR1']);
  // (c) The Airbus at AC2037's door since its boarding began keeps Bridge 1
  // when a Jazz Dash 8 is put on the ground by AC7753's boarding: the Dash 8
  // takes a walk-out.
  const typesC = Object.assign({ AC7753: 'DH8D', AC2040: 'A319', AC2037: 'A319' }, types);
  const c1 = await momentAt(T(9, 30, 6, 10), null, { types: typesC,
    feed: { arrivals: MORNING.arrivals, departures: said(MORNING.departures, 'AC2037', 30, 'Boarding') } });
  assert.equal(assertBoardsAgree(c1, '06:10').AC2040, 'BR1');
  const c2 = await momentAt(T(9, 30, 6, 40), null, { types: typesC,
    feed: { arrivals: MORNING.arrivals, departures: said(said(MORNING.departures, 'AC2037', 30, 'Gate Closed'), 'AC7753', 30, 'Boarding') } });
  const s4 = assertBoardsAgree(c2, '06:40');
  assert.equal(s4.AC2040, 'BR1', 'the Airbus is not moved');
  assert.equal(s4.AC7753, '5', 'the Dash 8 boarding AC7753 takes the walk-out');
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
  assert.deepEqual(g4.others(), ['AC644@BR1'], 'the Porter waiting for 11:55 is not drawn (v23930)');
  assert.equal(g4.ownStand(), '5');
  // The plan says so too, and the map's key carries it (a redraw when it changes).
  assert.equal(g4.plan().own, '5');
  assert.equal(g4._gateApronOwnRef(), '5');
  // 11:14: AC7992 is down. Gate 4's own aeroplane is drawn on that same stand; AC644 has not moved.
  const m2 = await momentAt(T(9, 30, 11, 14), null, { types,
    feed: { arrivals: said(arr, 'AC7992', 30, 'Arrived at 11:12 AM', '11:12 AM'), departures: MORNING.departures } });
  const g4b = m2.board('4');
  assert.equal(g4b.window._gateMapWhere.kind, 'stand');
  assert.equal(g4b.ownStand(), '5');
  assert.deepEqual(g4b.others(), ['AC644@BR1']);
  assert.equal(assertBoardsAgree(m2, '11:14').AC7992, '5');
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

// ── v23919 — the Porter boarding for PD2382, missing from gate 2's map ─────
//
// Moncton, 2026-09-30, 17:17. Gate 3's screen said "Boarding" for PD2382
// (cyqm.ca, until 17:20); gate 2's map showed Air Canada's AC1984 (down at
// 17:00) on Bridge 1 and no Dash 8. Two causes, both pinned here. The
// Flight-Alert push had said
// "departed" for PD2382 at 17:14 (received 20:14:05Z) with no runway time — the
// aeroplane off its blocks, not in the air — and the maps took that as gone
// while every board still said Boarding. And gate 2's map is centred on gate
// 2's own spot, with the Porter's stand 160 px below the middle: off the bottom
// of the map on a board in a laptop-sized window.

// The push merge (_yqmCacheAircraftMerge) puts its fields on the rows cyqm lists.
function withPush(E, merge) {
  for (const r of E.data.arr.concat(E.data.dep)) if (merge[r.flight]) Object.assign(r, merge[r.flight]);
  E.data.arr = E.data.arr.slice(); E.data.dep = E.data.dep.slice();   // a new feed, as the page sees it
  return E;
}
const EVENING_0930 = (() => {
  const types = { PD2373: 'Bombardier Dash 8 Q400 / DHC-8-400', PD2382: 'Bombardier Dash 8 Q400 / DHC-8-400',
                  AC1984: 'Airbus A319', AC1987: 'Airbus A319',
                  // gate 2's own, tomorrow: PAL's Dash 8-300 (/acinfo's usual type), so its empty stand is walk-out 2
                  PB923: 'DH8C' };
  let arrivals = said(MORNING.arrivals, 'PD2373', 30, 'Arrived', '4:33 PM');
  arrivals = said(arrivals, 'AC1984', 30, 'Arrived at 5:00 PM', '5:00 PM');
  return { types, arrivals, departures: said(MORNING.departures, 'PD2382', 30, 'Boarding') };
})();

test('17:17 on Sep 30: the Porter boarding for PD2382 is on the other maps, whatever the push said at 17:14', async () => {
  const { types, arrivals, departures } = EVENING_0930;
  const now = T(9, 30, 17, 17);
  const m = await momentAt(now, null, { types, feed: { arrivals, departures } });
  assert.deepEqual(m.board('2').others(), ['AC1984@BR1', 'PD2373@5'], 'both on the ground');
  assert.deepEqual(m.board('4').others(), ['PD2373@5'], 'gate 4\'s own is AC1984, for AC1987');
  // The push at 17:14: "departed", no runway time. The boards still say Boarding.
  const g2 = withPush(m.board('2'), { PD2382: { _pushStatus: 'departed' } });
  const pd = g2.data.dep.find((r) => r.flight === 'PD2382');
  assert.equal(g2._gateRawStatus(pd), 'boarding');
  assert.equal(g2._gateDepLeft(pd, now), false, 'off its blocks is not gone while the board says Boarding');
  assert.deepEqual(g2.others(), ['AC1984@BR1', 'PD2373@5']);
  assert.deepEqual(withPush(m.board('4'), { PD2382: { _pushStatus: 'departed' } }).others(), ['PD2373@5']);
  // Gate 3's own board draws it as its own, and its apron never draws it twice.
  const g3 = withPush(m.board('3'), { PD2382: { _pushStatus: 'departed' } });
  assert.equal(g3.cf.flight, 'PD2382');
  assert.deepEqual(g3.others(), ['AC1984@BR1']);
  // The push's wheels-up (its runway time, on _actualDepTime): it has gone.
  const up = new Date(T(9, 30, 17, 16)).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  assert.deepEqual(withPush(m.board('2'), { PD2382: { _pushStatus: 'departed', _actualDepTime: up } }).others(), ['AC1984@BR1']);
  // "active" (en route) is in the air, whatever the board says.
  assert.deepEqual(withPush(m.board('2'), { PD2382: { _pushStatus: 'active' } }).others(), ['AC1984@BR1']);
  // 17:19: cyqm.ca says Departed. Gone from every map.
  const departed = said(MORNING.departures, 'PD2382', 30, 'Departed', '5:19 PM');
  const m2 = await momentAt(T(9, 30, 17, 19), null, { types, feed: { arrivals, departures: departed } });
  assert.deepEqual(m2.board('2').others(), ['AC1984@BR1']);
  // 17:21: AC1984 is 21 minutes past "Arrived at 5:00 PM" and AC1987 is not
  // boarding yet. Nothing says it is still on the bridge (v23930).
  const m3 = await momentAt(T(9, 30, 17, 21), null, { types, feed: { arrivals, departures: departed } });
  assert.deepEqual(m3.board('2').others(), []);
  const m4 = await momentAt(T(9, 30, 17, 45), null, { types, feed: { arrivals, departures: said(departed, 'AC1987', 30, 'Boarding') } });
  assert.deepEqual(m4.board('2').others(), ['AC1984@BR1'], '17:45: AC1987 boarding, its aeroplane at the door');
  // An arrival's row is never "boarding": its push is read as it always was
  // (PD2381's "departed" from Montréal is the inbound in the air).
  const arr = { flight: 'PD2381', status: 'scheduled', _pushStatus: 'departed' };
  assert.equal(g2._gateRawAirborne(arr), true);
  assert.equal(g2._gatePushLeft(arr), true);
  // The turn rule reads the push the same way (_gateTurnConsumed).
  assert.match(fnSource('_gateTurnConsumed'), /_gatePushLeft\(d\)/);
  assert.doesNotMatch(fnSource('_gateTurnConsumed'), /\/\^\(active\|departed\)\$\/\.test\(p\)/);
});

// A Leaflet-shaped map with real Web Mercator pixels, for the camera.
function cameraMap(size, pv, note) {
  const px = (ll, z) => {
    const lat = Array.isArray(ll) ? ll[0] : ll.lat, lng = Array.isArray(ll) ? ll[1] : ll.lng;
    const w = 256 * Math.pow(2, z), r = lat * Math.PI / 180;
    return { x: (lng + 180) / 360 * w, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * w };
  };
  const unpx = (p, z) => {
    const w = 256 * Math.pow(2, z), n = Math.PI - 2 * Math.PI * p.y / w;
    return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: p.x / w * 360 - 180 };
  };
  const map = { _loaded: true, layers: [], center: [pv.lat, pv.lng], zoom: pv.zoom, _fidsParkView: pv, moves: 0,
    getZoom() { return this.zoom; }, getCenter() { return { lat: this.center[0], lng: this.center[1] }; },
    getSize() { return { x: size[0], y: size[1] }; },
    project: px, unproject: unpx,
    setView(ll, z) { this.center = [ll.lat, ll.lng]; this.zoom = z; this.moves++; },
    getContainer() { return { querySelector: () => note || null }; },
    removeLayer(l) { this.layers = this.layers.filter((x) => x !== l); } };
  // Where a point is drawn, in the map's own pixels (0,0 top left).
  map.at = (ll) => {
    const p = px(ll, map.zoom), c = px(map.center, map.zoom);
    return [p.x - c.x + size[0] / 2, p.y - c.y + size[1] / 2];
  };
  return map;
}
const cameraL = {
  divIcon: (o) => o,
  point: (x, y) => ({ x, y }),
  marker: (ll, opts) => {
    const el = { firstChild: { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } } };
    const mk = { ll, opts, el, getElement: () => el, getLatLng: () => ({ lat: ll[0], lng: ll[1] }), addTo(map) { map.layers.push(mk); return mk; } };
    return mk;
  },
};

test('every aeroplane on the ground is in the picture: gate 2\'s map at 17:17 on a laptop-sized board', async () => {
  const { types, arrivals, departures } = EVENING_0930;
  const now = T(9, 30, 17, 17);
  const m = await momentAt(now, null, { types, feed: { arrivals, departures } });
  // The empty stand's parked view, as _gateDrawEmptyStand leaves it.
  const probe = m.board('2');
  const spot = probe._gateOwnParkSpot('YQM', COORDS.YQM);
  assert.equal(spot.ref, '2', 'gate 2\'s empty stand, as on the board');
  const place = probe._gateParkPlace(spot, null);
  const pv = () => ({ lat: place.lat, lng: place.lng, zoom: spot.zoom, src: 'stand', empty: true, ring: [spot.lat, spot.lng] });
  const note = { offsetWidth: 248, offsetHeight: 21, textContent: 'From Deer Lake · 11:00am | De Deer Lake · 11:00' };
  // 1280 x 720: the map measured 288 x 287 on the board.
  const map = cameraMap([288, 287], pv(), note);
  const E = board(now, '2', m.arrS, m.depS, { types, L: cameraL, map });
  // Before: at the parked view, stand 5's Porter is off the bottom.
  const porterAt = () => {
    const mk = map.layers.find((l) => /map-plane-dh4/.test(l.opts.icon.html));
    return mk ? map.at(mk.ll) : null;
  };
  const save = E._gateApronFrame;
  E._gateApronSync(map);
  assert.equal(map.layers.length, 2);
  // Every picture's centre at least its half-size inside the frame, the ring and its label too.
  const inFrame = (xy, r) => xy[0] >= r && xy[1] >= r && xy[0] <= 288 - r && xy[1] <= 287 - r;
  for (const l of map.layers) assert.ok(inFrame(map.at(l.ll), 24), l.opts.icon.html.match(/map-plane-\w+/)[0] + ' at ' + map.at(l.ll).map(Math.round));
  const ring = map.at(pv().ring);
  assert.ok(ring[0] - 124 >= 0 && ring[0] + 124 <= 288 && ring[1] + 10 + 21 <= 287 && ring[1] >= 8, 'the ring and its label, at ' + ring.map(Math.round));
  assert.equal(map.zoom, 17, 'never a zoom out: the pictures are true size at stand zoom');
  // The parked view alone had the Porter's centre 160 px below the middle: past the bottom edge.
  const c0 = map.project([pv().lat, pv().lng], 17), pp = map.project(map.layers.find((l) => /dh4/.test(l.opts.icon.html)).ll, 17);
  assert.ok(pp.y - c0.y + 287 / 2 > 287 - 24, 'it needed the move: ' + Math.round(pp.y - c0.y));
  // Settled: the next tick, and the moveend of its own move, do not move it again.
  const moves = map.moves;
  E._gateApronSync(map); E._gateApronSync(map);
  assert.equal(map.moves, moves);
  assert.ok(porterAt());
  // A board-sized map (380 x 433 at 1680 x 1050) already holds them all: the camera is not touched.
  const big = cameraMap([380, 433], pv(), note);
  const E2 = board(now, '2', m.arrS, m.depS, { types, L: cameraL, map: big });
  E2._gateApronSync(big);
  assert.equal(big.layers.length, 2);
  assert.equal(big.moves, 0);
  // With nobody else on the ground, the camera is the parked view exactly.
  delete map._fidsApron;
  E._gateApronFrame(map);
  assert.deepEqual(map.center.map((v) => +v.toFixed(7)), [pv().lat, pv().lng].map((v) => +v.toFixed(7)));
  // A live aeroplane keeps the camera on itself; so does any view that is not the parked one.
  const live = cameraMap([288, 287], pv(), note);
  live._fidsLive = true;
  board(now, '2', m.arrS, m.depS, { types, L: cameraL, map: live })._gateApronSync(live);
  assert.equal(live.moves, 0);
  const flying = cameraMap([288, 287], pv(), note);
  delete flying._fidsParkView;
  board(now, '2', m.arrS, m.depS, { types, L: cameraL, map: flying })._gateApronSync(flying);
  assert.equal(flying.moves, 0);
  assert.equal(save, E._gateApronFrame);
});

test('the camera moves as little as holds them all, and keeps this board\'s own when they cannot all fit', () => {
  const E = engine({ now: T(9, 30, 17, 17) });
  const F = E._gateApronFrameCentre;
  // Already in frame: the parked view's centre, untouched.
  assert.deepEqual(F([500, 500], [300, 300], [[420, 420, 470, 470], [480, 480, 520, 520]], [480, 480, 520, 520], 8), [500, 500]);
  // One past the bottom: moved down exactly far enough (its bottom 8 px inside), not re-centred.
  assert.deepEqual(F([500, 500], [300, 300], [[470, 600, 520, 660], [480, 480, 520, 520]], [480, 480, 520, 520], 8), [500, 518]);
  // Too far apart for the frame: the middle of them, moved as little as keeps our own in it.
  const t = F([500, 500], [300, 300], [[0, 480, 40, 520], [980, 480, 1020, 520], [480, 480, 520, 520]], [480, 480, 520, 520], 8);
  assert.deepEqual(t, [510, 500]);
  const t2 = F([100, 500], [300, 300], [[80, 480, 120, 520], [980, 480, 1020, 520]], [80, 480, 120, 520], 8);
  assert.equal(t2[0], 80 + 142, 'our own at the left edge, not off it');
});

// ── v23930 — a landing is not a place ──────────────────────────────────────
//
// Moncton, 2026-10-02, 19:26-19:50. Every gate map, on all four boards, drew a
// jet on Bridge 1 (lighter, as another gate's aeroplane), with nothing parked
// there. It was AC7754 from Ottawa. Its cyqm.ca row said "Arrived at 6:53 PM",
// with no type, no tail and no live position. No departure took it, so the
// 4-hour rule kept it on the stand until 22:53. The night-stop rule would then
// have kept the evening's PD2381 and AC2040 there all night. The fixtures are
// the worker's real answers at 19:35, the feed's rows plus the rows the worker
// remembered (marked "remembered"). An aeroplane is now drawn on the apron
// only with evidence that it is there NOW. That is a fresh live ground fix, or
// its departure Boarding, on Final call or Gate closed in the feed's words, or
// the first 20 minutes after the feed's arrival time (deplaning).
const OCT2 = {
  arrivals: JSON.parse(fixture('yqm-worker-2026-10-02-1935-arrivals.json')),
  departures: JSON.parse(fixture('yqm-worker-2026-10-02-1935-departures.json')),
};
// The feed's own words for one row of the worker's answer: flight, its date
// as cyqm.ca prints it ('Oct 2'), the status, the time, and whether it is a
// row the worker remembered.
function saidOn(rows, flight, date, status, actual, remembered) {
  return rows.map((r) => (r.flightId === flight && r.displayDate === date && !!r.remembered === !!remembered)
    ? Object.assign({}, r, { status, actualTime: actual || r.actualTime }) : r);
}
// A board of gate `gate` at `now` on the worker's answer `ans`, as the page splits it.
function boardOn(now, gate, ans, extra) {
  const arrS = router.yqmSplitRemembered(ans.arrivals, 'Arrival');
  const depS = router.yqmSplitRemembered(ans.departures, 'Departure');
  return board(now, gate, arrS, depS, extra);
}
const OCT = (d, hh, mm) => Date.UTC(2026, 9, d, hh + 3, mm);

test('19:43 on Oct 2: AC7754\'s "Arrived at 6:53 PM" draws no aeroplane on any map, on any board', () => {
  const now = OCT(2, 19, 43);
  for (const g of ['1', '2', '3', '4']) {
    const b = boardOn(now, g, OCT2);
    assert.deepEqual(b.others(), [], 'gate ' + g + ': nothing on the apron');
    assert.notEqual(b.window._gateMapWhere.kind, 'stand', 'gate ' + g + ': its own view parks nothing');
  }
  // What each board's own view says instead: its empty stand.
  const g1 = boardOn(now, '1', OCT2), g3 = boardOn(now, '3', OCT2), g4 = boardOn(now, '4', OCT2);
  assert.equal(g1.cf.flight, 'WS813');
  assert.equal(g1.window._gateMapWhere.kind, 'none');
  assert.equal(g3.cf.flight, 'PD2370');
  assert.equal(g3.inb.flight, 'PD2381', 'the gate-match still names the aeroplane (the panel\'s "from" line)');
  assert.equal(g3.window._gateMapWhere.kind, 'none');
  assert.equal(g4.cf.flight, 'AC1983');
  assert.equal(g4.window._gateMapWhere.kind, 'none');
  // The row that drew the jet is still in the feed, and still counts as a landing.
  const r = g4._gateFeedRows('arr').find((x) => x.flight === 'AC7754' && x._sortTs === OCT(2, 18, 38));
  assert.ok(r && g4._gateRawLanded(r), 'cyqm.ca\'s own "Arrived"');
  assert.equal(g4._gateLandedAt(r, now), OCT(2, 18, 53));
  assert.equal(g4._gateStandVerdict(r, OCT(2, 18, 53), null, [], [], now, 'America/Moncton'), 'deplaned');
});

test('as reported: AC7754 (Arrived 6:53 PM, gate 4) is on no map at 19:42 without a fresh ground fix; WS812 (Arrived 4:46 PM, gate 1) on none at 19:33', () => {
  // Gate 4 at 19:42, the screen in the report.
  const at42 = OCT(2, 19, 42);
  const g4 = boardOn(at42, '4', OCT2);
  assert.deepEqual(g4.others(), [], 'gate 4: nothing on the apron');
  assert.equal(g4.window._gateMapWhere.kind, 'none', 'gate 4: its own view is the empty stand');
  const ac = g4._gateFeedRows('arr').find((r) => r.flight === 'AC7754' && r._sortTs === OCT(2, 18, 38));
  assert.ok(ac && g4._gateRawLanded(ac) && ac._remembered !== true && ac._feedKept !== true, 'the live row, the feed\'s own "Arrived"');
  const bare = g4._gateAircraftWhere(ac, null, at42);
  assert.equal(bare.kind, 'none', 'its landing 49 minutes ago is not a place');
  assert.equal(bare.why, 'deplaned');
  for (const g of ['1', '2', '3']) {
    assert.ok(!boardOn(at42, g, OCT2).others().some((x) => /^AC7754@/.test(x)), 'gate ' + g + ' at 19:42');
  }
  // Positive: a fresh live position on the ground here (FR24's own time, 40 s
  // old through the worker's seen_pos) is evidence, drawn where it is.
  const fix = { lat: 46.1126, lng: -64.6792, onGround: true, alt: 0, spd: 0, at: at42, fl: 'AC7754', via: 'flight', cs: 'JZA7754' };
  g4.window._adsbLast = { AC7754: Object.assign({}, fix, { age: 40 }) };
  const live = g4._gateAircraftWhere(ac, null, at42);
  assert.equal(live.kind, 'fix');
  assert.equal(live.onGround, true);
  assert.equal(live.lat, 46.1126, 'where it is, not on a guessed stand');
  // The same position 4 minutes old is not.
  g4.window._adsbLast = { AC7754: Object.assign({}, fix, { age: 240 }) };
  assert.equal(g4._gateAircraftWhere(ac, null, at42).kind, 'none');
  // Gate 1 at 19:33: WS812, down at 4:46 PM, on no map.
  const at33 = OCT(2, 19, 33);
  for (const g of ['1', '2', '3', '4']) {
    const b = boardOn(at33, g, OCT2);
    assert.ok(!b.others().some((x) => /^WS812@/.test(x)), 'gate ' + g + ' at 19:33: ' + b.others().join(' '));
    assert.deepEqual(b.others(), [], 'gate ' + g + ' at 19:33: nothing on the apron');
  }
  const g1 = boardOn(at33, '1', OCT2);
  assert.equal(g1.window._gateMapWhere.kind, 'none', 'gate 1: its own view is the empty stand');
  const ws = g1._gateFeedRows('arr').find((r) => r.flight === 'WS812' && r._sortTs === OCT(2, 17, 20));
  assert.ok(ws && g1._gateRawLanded(ws));
  assert.equal(g1._gateLandedAt(ws, at33), OCT(2, 16, 46));
  assert.equal(g1._gateAircraftWhere(ws, null, at33).kind, 'none');
  // Positive: the departure boarding at the gate, in the feed's own word.
  const boarding = { arrivals: OCT2.arrivals, departures: saidOn(OCT2.departures, 'WS813', 'Oct 2', 'Boarding') };
  const b1 = boardOn(OCT(2, 17, 40), '1', boarding);
  assert.equal(b1.window._gateMapWhere.kind, 'stand');
  assert.equal(b1.window._gateMapWhere.why, 'boarding');
  assert.ok(boardOn(OCT(2, 17, 40), '4', boarding).others().some((x) => /@BR2$/.test(x)), 'and lighter on gate 4\'s map, at door 1\'s bridge');
});

test('AC7754 is on the apron while it deplanes, and only then: 18:55 to 19:13, gone at 19:14', () => {
  for (const [hh, mm, on] of [[18, 55, true], [19, 5, true], [19, 13, true], [19, 14, false], [21, 0, false], [22, 52, false]]) {
    const now = OCT(2, hh, mm);
    for (const g of ['1', '2', '3', '4']) {
      const b = boardOn(now, g, OCT2);
      const has = b.others().some((x) => /^AC7754@/.test(x));
      assert.equal(has, on, hh + ':' + String(mm).padStart(2, '0') + ' gate ' + g + ': ' + b.others().join(' '));
    }
  }
  // While it is there, on a stand of the door it arrived at, the same on every board.
  const s = assertBoardsAgree({ board: (g) => boardOn(OCT(2, 19, 0), g, OCT2) }, '19:00');
  assert.ok(YQM.door_stands['4'].includes(s.AC7754), 'at door 4: ' + s.AC7754);
});

test('tonight\'s last arrivals: on the apron for their deplaning only, never all night, back when their departure boards', () => {
  // PD2381 lands at 21:35, AC2040 at 21:44.
  let arrivals = saidOn(OCT2.arrivals, 'PD2381', 'Oct 2', 'Arrived at 9:35 PM', '9:35 PM');
  arrivals = saidOn(arrivals, 'AC2040', 'Oct 2', 'Arrived at 9:44 PM', '9:44 PM');
  const evening = { arrivals, departures: OCT2.departures };
  const at = (hh, mm, g, ans) => boardOn(OCT(2, hh, mm), g, ans || evening);
  assert.deepEqual(at(21, 50, '1').others(), ['AC2040@BR1', 'PD2381@5'], '21:50: both deplaning');
  assert.equal(at(21, 50, '3').window._gateMapWhere.kind, 'stand', 'gate 3 draws its own Porter while it deplanes');
  assert.deepEqual(at(21, 58, '1').others(), ['AC2040@BR1'], '21:58: the Porter\'s 20 minutes are up');
  assert.equal(at(21, 58, '3').window._gateMapWhere.kind, 'none');
  assert.deepEqual(at(22, 10, '1').others(), [], '22:10: nothing says either is still there');
  // 04:00 on Oct 3, with both rows only in the worker's memory: nothing.
  const kept = (rows, flight, status, actual) => rows.map((r) => (r.flightId === flight && r.displayDate === 'Oct 2' && !r.remembered)
    ? Object.assign({}, r, { status, actualTime: actual, remembered: true }) : r);
  const night = { arrivals: kept(kept(OCT2.arrivals, 'PD2381', 'Arrived at 9:35 PM', '9:35 PM'), 'AC2040', 'Arrived at 9:44 PM', '9:44 PM'),
                  departures: OCT2.departures };
  for (const g of ['1', '2', '3', '4']) {
    const b = boardOn(OCT(3, 4, 0), g, night);
    assert.deepEqual(b.others(), [], '04:00 gate ' + g);
    assert.notEqual(b.window._gateMapWhere.kind, 'stand', '04:00 gate ' + g);
  }
  // 11:25 on Oct 3: PD2370 boards. The Porter is at the door, on gate 3's map and the others.
  const boarding = { arrivals: night.arrivals, departures: saidOn(OCT2.departures, 'PD2370', 'Oct 3', 'Boarding') };
  const g3 = boardOn(OCT(3, 11, 25), '3', boarding);
  assert.equal(g3.cf.flight, 'PD2370');
  assert.equal(g3.window._gateMapWhere.kind, 'stand');
  assert.equal(g3.window._gateMapWhere.why, 'boarding');
  assert.ok(boardOn(OCT(3, 11, 25), '4', boarding).others().some((x) => /@5$/.test(x)), 'the Porter on its walk-out, on gate 4\'s map');
});

test('a "Boarding" this screen saved before the feed dropped the row is not an aeroplane at the door now', () => {
  // A screen that saw WS813 boarding at 17:40 keeps that row (fids_gate_seen_v1).
  // At 20:30 the feed lists the 5:55 PM departure no more, and the worker kept
  // no row for it. Its saved "Boarding" draws nothing.
  const storage = store();
  const before = { arrivals: OCT2.arrivals, departures: saidOn(OCT2.departures, 'WS813', 'Oct 2', 'Boarding') };
  const b1 = boardOn(OCT(2, 17, 40), '1', before, { storage });
  assert.equal(b1.window._gateMapWhere.kind, 'stand', 'boarding, in the feed\'s words');
  const dropped = { arrivals: OCT2.arrivals, departures: OCT2.departures.filter((r) => !(r.flightId === 'WS813' && r.displayDate === 'Oct 2')) };
  const b2 = boardOn(OCT(2, 20, 30), '1', dropped, { storage });
  const saved = b2._gateDepsSeen(b2._gateFeedRows('dep'), 'YQM', OCT(2, 20, 30)).find((r) => r.flight === 'WS813' && r._sortTs === OCT(2, 18, 15));
  assert.ok(saved && saved._remembered === true && b2._gateRawStatus(saved) === 'boarding', 'the saved row still says Boarding');
  assert.equal(b2._gateAircraftWhereIn(null, saved, OCT(2, 20, 30), 'YQM', [saved], [], 'America/Moncton').kind, 'none');
  assert.deepEqual(b2.others(), []);
});

test('the same screen, no reload: a "Boarding" row the feed drops is a memory at once, and draws nothing', () => {
  // The screen's seen-memory held the dropped row as it was, without the
  // "remembered" mark a reload gives it, so its "Boarding" stood for 30 hours.
  const before = { arrivals: OCT2.arrivals, departures: saidOn(OCT2.departures, 'WS813', 'Oct 2', 'Boarding') };
  const E = boardOn(OCT(2, 17, 40), '1', before);
  assert.equal(E.window._gateMapWhere.why, 'boarding');
  assert.equal(E.window._gateMapWhere.kind, 'stand', 'gate 1 draws its own aeroplane at the door');
  // The feed drops the row (a glitch, an empty answer) while the screen runs on.
  const dropped = OCT2.departures.filter((r) => !(r.flightId === 'WS813' && r.displayDate === 'Oct 2'));
  E.data.dep = E.mapADB({ departures: router.yqmSplitRemembered(dropped, 'Departure').list }, 'dep');
  const t = OCT(2, 20, 30);
  const deps = E._gateDepsSeen(E._gateFeedRows('dep'), 'YQM', t);
  const kept = deps.find((r) => r.flight === 'WS813' && r._sortTs === OCT(2, 18, 15));
  assert.ok(kept && E._gateRawStatus(kept) === 'boarding', 'the memory still says Boarding');
  assert.equal(kept._remembered, true, 'and is marked a memory the moment the feed drops it');
  assert.equal(E._gateAircraftWhereIn(null, kept, t, 'YQM', deps, [], 'America/Moncton').kind, 'none');
  E.window._gateCurrentFlight = null; E.window._gateInbound = null; E.window._gateMapWhere = null;
  assert.deepEqual((E._gateApronPlan('YQM', t) || { items: [] }).items.map((it) => it.flight), [], 'nothing on the apron');
});

test('a fresh live ground fix is drawn where it is; once it is 3 minutes old only the deplaning window is left', () => {
  // AC2040 on the ground at Moncton by Flightradar24, before cyqm.ca says Arrived.
  const now = OCT(2, 21, 46);
  const b = boardOn(now, '4', OCT2);
  const inb = b._gateFeedRows('arr').find((r) => r.flight === 'AC2040' && r._sortTs === OCT(2, 21, 38));
  assert.ok(inb);
  const fix = { lat: 46.1155, lng: -64.6876, onGround: true, alt: 0, spd: 0, at: now - 2.5 * 60000, fl: 'AC2040', via: 'flight', cs: 'ACA2040' };
  b.window._adsbLast = { AC2040: Object.assign({}, fix, { at: now, age: 150 }) };   // the worker's seen_pos: 150 s
  const live = b._gateAircraftWhere(inb, null, now);
  assert.equal(live.kind, 'fix');
  assert.equal(live.onGround, true);
  // 3½ minutes old: no longer a position, but it was a landing at our field.
  const later = now + 60000;
  b.window._adsbLast = { AC2040: Object.assign({}, fix, { at: now, age: 150 }) };
  const res = b._gateAircraftWhere(inb, null, later);
  assert.notEqual(res.kind, 'fix');
  assert.equal(res.kind, 'stand', 'deplaning, timed from the last fix');
  assert.equal(b._gateAircraftWhere(inb, null, now - 2.5 * 60000 + 21 * 60000).kind, 'none', '20 minutes after the fix: nothing');
});

test('the map\'s door word is the gate sign\'s: boarding began at this gate, then "Delayed" — the aeroplane stays until it leaves', () => {
  // v23925's rule for the sign: once the airport has said Boarding at this
  // gate, a later Delayed keeps the sign up. The maps say the same.
  const storage = store();
  const at1740 = { arrivals: OCT2.arrivals, departures: saidOn(OCT2.departures, 'WS813', 'Oct 2', 'Boarding') };
  const b1 = boardOn(OCT(2, 17, 40), '1', at1740, { storage });
  assert.equal(b1.window._gateMapWhere.why, 'boarding');
  const at1750 = { arrivals: OCT2.arrivals, departures: saidOn(OCT2.departures, 'WS813', 'Oct 2', 'Delayed until 6:30 PM', '6:30 PM') };
  const b2 = boardOn(OCT(2, 17, 50), '1', at1750, { storage });
  assert.equal(b2._gateRawStatus(b2.cf), 'delayed', 'the feed\'s word now');
  assert.equal(b2._gateDoorBasis(b2.cf, OCT(2, 17, 50)).status, 'boarding', 'the sign stays up');
  assert.equal(b2.window._gateMapWhere.kind, 'stand');
  assert.equal(b2.window._gateMapWhere.why, 'boarding');
  assert.ok(boardOn(OCT(2, 17, 50), '3', at1750, { storage }).others().some((x) => /@BR2$/.test(x)), 'gate 3 sees it at door 1\'s bridge');
  // A screen that never saw the Boarding has only "Delayed": nothing says where the aeroplane is.
  assert.equal(boardOn(OCT(2, 17, 50), '1', at1750, { storage: store() }).window._gateMapWhere.kind, 'none');
  // Departed: gone.
  const at1800 = { arrivals: OCT2.arrivals, departures: saidOn(OCT2.departures, 'WS813', 'Oct 2', 'Departed at 5:58 PM', '5:58 PM') };
  const b3 = boardOn(OCT(2, 18, 0), '3', at1800, { storage });
  assert.ok(!b3.others().some((x) => /@BR2$/.test(x)), b3.others().join(' '));
});
