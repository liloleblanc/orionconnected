'use strict';

// WHY THIS EXISTS
//
// v23925. Three rules, one theme: a board says only what the airport said.
//
// (A) A status that claims something happened — landed, arrived, departed,
//     boarding, final call, gate closed — shows only on the feed's own word or
//     on an actual time from the feed. adbStatus used to make all six from
//     minutes-to-scheduled-time, so Moncton's late AC7992 read "Arrived" while
//     cyqm.ca still said "Early at 10:27", and at the airports whose feeds
//     never say boarding every "Boarding" and "Gate closed" was the clock's.
//     Rows the airport says nothing new about now leave the board by TIME
//     (_fidsBoardRowPlace), half an hour past their time, the minute they left
//     before — so they never stick and never show a claim.
// (B) The gate holds a flight the feed still calls boarding, final call or gate
//     closed, up to an hour past its time, on every pick path, unless real
//     evidence says it left or the next flight at that door is boarding.
// (C) No invented delay time at the gate. A late inbound with no new airline
//     time keeps the airline's times and shows "Updated boarding time to
//     follow" in the board's two languages, and writes nothing onto the row.
// (D) v23925 — the decision of 2026-09-30 (Option B). Airports whose feed
//     never says Boarding, Final call or Gate closed (an explicit table,
//     FEED_SAYS_GATE_WORDS) show Boarding on the gate and the departures board
//     from the boarding time the gate prints until the departure time, marked
//     clock-made so the maps and the hold ignore it; never Final call or Gate
//     closed. Once the airport has said Boarding, a later Delayed keeps the
//     gate's sign as it was and only moves the departure time; and a Delayed
//     flight stays on its gate (its new time plus the grace, or an hour past
//     its schedule with no new time) unless a later flight the airport is
//     boarding at that gate takes it.
//
// Everything below RUNS the shipped code: the functions are lifted out of
// fids-core.js and feed-router.js by brace matching, the rows come from the
// real fixtures through the real adapters and the worker's own parsers, and
// fids-v2.js is evaluated whole in a sandbox.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// The gate's label helpers pick their languages through the one store
// (board-strings.js), which every board page loads first; loading it here
// puts BoardStrings on the global the lifted functions resolve against.
require('../fids-current/js/board-strings.js');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const ROUTER = fs.readFileSync(path.join(root, 'fids-current', 'js', 'feed-router.js'), 'utf8');
const V2 = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-v2.js'), 'utf8');
const workerPath = path.join(root, 'workers', 'fids-proxy.js');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const MIN = 60000;

// ── lifting real code ───────────────────────────────────────────────────────

// From the start of `function NAME(` (or of `prefix`) to its matching brace.
// Strings and comments are skipped so a brace inside either cannot end it.
function braceFrom(SRC, start, what) {
  assert.ok(start >= 0, what + ' must exist');
  let i = SRC.indexOf('{', start);
  let depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) {
        if (SRC[i] === '\\') { i++; continue; }
        if (SRC[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return SRC.slice(start, i + 1); }
  }
  throw new Error('could not find the end of ' + what);
}
function fnIn(SRC, name) {
  const m = SRC.match(new RegExp('(^|\\n)(async )?function ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\('));
  assert.ok(m, name + ' must be declared');
  return braceFrom(SRC, m.index + (m[1] ? 1 : 0), name);
}
const fn = (name) => fnIn(CORE, name);
function line(SRC, re, what) {
  const m = SRC.match(re);
  assert.ok(m, what + ' must exist');
  return m[0];
}
const constLine = (name) => line(CORE, new RegExp('^(?:var|const) ' + name + ' = [^;]+;', 'm'), name);
const block = (prefix) => braceFrom(CORE, CORE.indexOf(prefix), prefix) + ';';

const CORE_FNS = [
  'adbTs', 'adbHHMM', '_adbNearestDayTs', 'adbStatus', 'adbStatusInferred', '_rowStatusRank',
  '_fidsBoardRowPlace', '_bidsInWindow',
  '_gateRawStatus', '_gateOutboundAtGate', '_gatePushLeft', '_gateRawAirborne', '_gateDepLeft',
  '_gateOverrideWord', '_gateFlightLive', '_gateHoldYields', '_gateCsPick', '_gateFlightsAt', '_gateLiveGates',
  'fidsInboundHasArrived', '_gateIsProp', '_gateMinTurnMs', '_gateInbLateNotice', '_gateLbl',
  '_gateSignPhase', '_gateDepDisplayState', '_gateBoardingFloorTs', '_boardStripStatusKey', '_gateInbCaptionKey',
  // (D) Option B, the boarding-began memory and the Delayed rules.
  '_feedSaysGateWords', '_pageAirport', '_gateDelayHasTime', '_gateBoardingBeganHere', 'getAircraftCategory', 'getBoardingLeadMins', '_gateBoardingTimes',
  '_fidsBoardEquip', '_schedBoardingOn', '_schedBoardingWindow', '_gateIsGateFlight', '_fidsShownRow', '_gateDoorBasis', '_gateDoorRecord', '_gateDoor', '_gateDoorFor',
  '_gateRowKey', '_gateDepsSeen', '_gateSeenKeepIdentity', '_gateSeenSlim', '_gateSeenLoad', '_gateSeenSave'
];
// A browser's localStorage, enough for the seen-memory (fids_gate_seen_v1).
// Two engines handed the same one are the same screen before and after a reload.
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m
  };
}
const AP_TZ = { YQM: { tz: 'America/Moncton' }, YHZ: { tz: 'America/Halifax' }, ORD: { tz: 'America/Chicago' } };
function engine(opts) {
  const o = opts || {};
  const src = [
    constLine('DEPART_TRAIL_HRS'),
    constLine('BOARDING_HOLD_MIN'), constLine('GATE_GRACE_MIN'), constLine('BOARD_TRAIL_MIN'), constLine('DELAY_HOLD_MIN'),
    block('var FEED_SAYS_GATE_WORDS = {'), block('const AIRCRAFT_CATEGORY = {'),
    constLine('_GATE_SEEN_IDENTITY'), constLine('_GATE_DEP_SEEN'), constLine('_GATE_SEEN_KEY'), constLine('_GATE_SEEN_FIELDS'),
    constLine('BIDS_WINDOW_AHEAD_MS'), constLine('BIDS_WINDOW_TRAIL_MS'),
    constLine('_ADB_EXPLICIT_STATUS'), constLine('_CS_REGIONAL_FAM'),
    block('var _ROW_STATUS_RANK = {'),
    block('var _GATE_LBL = {'),
    ...CORE_FNS.map(fn),
    'return { ' + CORE_FNS.map((n) => n + ': ' + n).join(', ') + ', _ADB_EXPLICIT_STATUS: _ADB_EXPLICIT_STATUS, _GATE_LBL: _GATE_LBL,'
      + ' FEED_SAYS_GATE_WORDS: FEED_SAYS_GATE_WORDS, seen: function () { return _GATE_DEP_SEEN; } };'
  ].join('\n');
  const data = o.data || { dep: [], arr: [] };
  // An operator's overrides, as the gate override panel stores them (by flight
  // number); with none the override store is absent, as in a page without it.
  const ov = o.overrides ? (n) => o.overrides[String(n).toUpperCase()] || null : undefined;
  const win = o.window || {};
  const storage = o.storage || makeStorage();
  const E = new Function('data', 'langs', 'window', 'getOverrideForFlight', 'localStorage', 'AP', src)(data, o.langs || ['en', 'fr'], win, ov, storage, AP_TZ);
  E.data = data;
  E.window = win;
  E.storage = storage;
  return E;
}
const E0 = engine();

const router = new Function([
  fnIn(ROUTER, 'yqmTimeObj'), fnIn(ROUTER, 'yqmClockToMin'), fnIn(ROUTER, 'yqmStatus'),
  fnIn(ROUTER, 'yqmToAdbFlight'), fnIn(ROUTER, 'tpaStatus'), fnIn(ROUTER, 'yyzStatus'),
  'return { yqmToAdbFlight, yqmStatus, tpaStatus, yyzStatus };'].join('\n'))();

// A stand-in for mapADB over the fields these rules read. The status and its
// provenance are the real adbStatus / adbStatusInferred; _revTs and upd follow
// mapADB's order (runway > predicted > revised, upd only past five minutes).
function mapRows(E, list, mode, now) {
  return list.map((f) => {
    const side = (mode === 'dep' ? f.departure : f.arrival) || {};
    const other = (mode === 'dep' ? f.arrival : f.departure) || {};
    const pick = (t) => (t && (t.local || t.utc)) || null;
    const schedTs = E.adbTs(pick(side.scheduledTime));
    if (!schedTs) return null;
    const revL = pick(side.runwayTime) || pick(side.predictedTime) || pick(side.revisedTime);
    const revTs = revL ? E._adbNearestDayTs(E.adbTs(revL), schedTs) : null;
    const st = E.adbStatus(f, mode, schedTs, now);
    const flight = String(f.number).toUpperCase().replace(/\s+/g, '');
    return {
      flight, airline: (side.airline && side.airline.iata) || flight.replace(/\d.*/, ''),
      gate: side.gate || '—', status: st, _stInferred: E.adbStatusInferred(f, st),
      _stExplicit: E._ADB_EXPLICIT_STATUS.test(String(f.status || '').replace(/[\s_-]+/g, '').toLowerCase()),
      _raw: String(f.status || ''), _sortTs: schedTs, _revTs: revTs || null,
      time: E.adbHHMM(pick(side.scheduledTime)),
      upd: (revTs && Math.abs(revTs - schedTs) > 5 * MIN) ? E.adbHHMM(revL) : null,
      _locIata: (other.airport && other.airport.iata) || '', _aircraft: '', _aircraftCode: '', _feedAcCode: '',
      _actualDepTime: pick(f.departure && f.departure.runwayTime),
      _actualArrTime: pick(f.arrival && f.arrival.runwayTime)
    };
  }).filter(Boolean);
}

// Moncton wall clock (ADT, UTC-3) as an instant.
const T = (mo, d, hh, mm) => Date.UTC(2026, mo - 1, d, hh + 3, mm);
const YQM = {
  dep28: JSON.parse(fixture('yqm-cyqm-2026-09-28-2222-departures.json')),
  arr28: JSON.parse(fixture('yqm-cyqm-2026-09-28-2222-arrivals.json')),
  dep30: JSON.parse(fixture('yqm-cyqm-2026-09-30-0908-departures.json')),
  arr30: JSON.parse(fixture('yqm-cyqm-2026-09-30-0908-arrivals.json')),
};
// The feed's own words for one row, as cyqm.ca would print them.
function said(rows, flight, day, status, actual) {
  return rows.map((r) => (r.flightId === flight && r.displayDate === 'Sep ' + day)
    ? Object.assign({}, r, { status, actualTime: actual || r.actualTime }) : r);
}
const adb = (rows, dir) => rows.map((r) => router.yqmToAdbFlight(r, dir)).filter(Boolean);
const deps = (E, rows, now) => mapRows(E, adb(rows, 'Departure'), 'dep', now);
const arrs = (E, rows, now) => mapRows(E, adb(rows, 'Arrival'), 'arr', now);
const find = (rows, flight, day) => rows.find((r) => r.flight === flight && (!day || new Date(r._sortTs - 3 * 3600000).getUTCDate() === day));

const CLAIM = /^(landed|arrived|departed|boarding|final|gateclosed)$/;

test('mapADB stamps whether a row\'s status is the feed\'s own word, and the de-dup keeps it with the status', () => {
  const map = fn('mapADB');
  assert.match(map, /const _stExplicit=_ADB_EXPLICIT_STATUS\.test\(String\(f\.status\|\|''\)\.replace\(\/\[\\s_-\]\+\/g,''\)\.toLowerCase\(\)\);/);
  assert.equal((map.match(/_stInferred,_stExplicit,_pushStatus\}/g) || []).length, 2, 'both row shapes carry it');
  assert.match(fn('_fidsDedupeRows'), /prev\.status = r\.status;\s*prev\._stInferred = r\._stInferred;[^\n]*\n\s*prev\._stExplicit = r\._stExplicit;/);
  assert.match(fn('applyOverrideToFlight'), /flight\.status = ov\.status; flight\._stInferred = false; flight\._stExplicit = true;/,
    'an operator\'s status is an explicit word too');
});
const rawWord = (f) => String(f.status || '').replace(/[\s_-]+/g, '').toLowerCase();

// ════════════════════════════════════════════════════════════════════════════
// (A) NO CLAIM FROM THE CLOCK
// ════════════════════════════════════════════════════════════════════════════

test('(A) over every real row and every moment ±3 h, a claim only ever comes from the feed\'s word', async () => {
  const W = await import(workerPath);
  const sets = [];
  for (const [file, dir] of [['yqm-cyqm-2026-09-28-2222-departures.json', 'Departure'], ['yqm-cyqm-2026-09-28-2222-arrivals.json', 'Arrival'],
                             ['yqm-cyqm-2026-09-30-0908-departures.json', 'Departure'], ['yqm-cyqm-2026-09-30-0908-arrivals.json', 'Arrival']]) {
    sets.push([file, dir === 'Departure' ? 'dep' : 'arr', adb(JSON.parse(fixture(file)), dir)]);
  }
  const MSP_NOW = Date.parse('2026-09-05T21:10:00-05:00');
  const SLC_NOW = Date.parse('2026-09-05T20:15:00-06:00');
  const PHL_NOW = Date.parse('2026-09-05T01:00:00-04:00');
  for (const mode of ['dep', 'arr']) {
    sets.push(['msp ' + mode, mode, W.mspParsePage(fixture(`msp-${mode}-sample.html`), mode, MSP_NOW)]);
    sets.push(['slc ' + mode, mode, W.slcParsePage(fixture(`slc-${mode}-sample.html`), mode, SLC_NOW)]);
    sets.push(['phl ' + mode, mode, W.phlParsePage(fixture('phl-sample.html'), mode, PHL_NOW)]);
  }
  let rows = 0, checks = 0, neutral = 0;
  for (const [name, mode, list] of sets) {
    assert.ok(list.length > 0, name + ' parsed rows');
    for (const f of list) {
      const leg = mode === 'dep' ? f.departure : f.arrival;
      const sched = E0.adbTs(leg.scheduledTime.local);
      const explicit = E0._ADB_EXPLICIT_STATUS.test(rawWord(f));
      if (!explicit) neutral++;
      rows++;
      for (let t = sched - 180 * MIN; t <= sched + 180 * MIN; t += 5 * MIN) {
        const st = E0.adbStatus(f, mode, sched, t);
        checks++;
        if (CLAIM.test(st)) assert.ok(explicit, `${name} ${f.number} "${f.status}" read "${st}" at ${(t - sched) / MIN} min — a claim with no word behind it`);
        if (!explicit) assert.ok(/^(scheduled|ontime|delayed|early)$/.test(st), `${name} ${f.number}: a neutral row reads "${st}"`);
        assert.equal(E0.adbStatusInferred(f, st), false, `${name} ${f.number}: nothing is inferred any more`);
      }
    }
  }
  assert.ok(rows > 800 && neutral > 500 && checks > 60000, `rows=${rows} neutral=${neutral} checks=${checks}`);
});

test('(A) Moncton\'s own words, at the moments the clock used to overrule them', () => {
  const E = engine();
  // AC7753 "OnTime" at 07:10 (Sep 29, gate 1): the clock read boarding,
  // final, gate closed and departed across these minutes.
  const ac7753 = adb(YQM.dep28, 'Departure').find((f) => f.number === 'AC7753');
  const s7753 = T(9, 29, 7, 10);
  const at = (f, mode, sched, hh, mm, day) => E.adbStatus(f, mode, sched, T(9, day || 29, hh, mm));
  assert.equal(at(ac7753, 'dep', s7753, 5, 30), 'scheduled');
  for (const [hh, mm] of [[6, 50], [7, 5], [7, 12], [7, 20]]) {
    assert.equal(at(ac7753, 'dep', s7753, hh, mm), 'ontime', `AC7753 at ${hh}:${mm}`);
  }
  // AC7992 "Early at 10:27 AM", due 10:36: Early at every moment — never
  // Arrived from 10:27.
  const ac7992 = adb(YQM.arr30, 'Arrival').find((f) => f.number === 'AC7992');
  const s7992 = T(9, 30, 10, 36);
  for (const [hh, mm] of [[10, 20], [10, 40], [11, 0]]) {
    assert.equal(at(ac7992, 'arr', s7992, hh, mm, 30), 'early', `AC7992 at ${hh}:${mm}`);
  }
  // AC1986 "Delayed until 12:18 AM" and PD2381 "Arrived at 9:47 PM".
  const a28 = adb(YQM.arr28, 'Arrival');
  assert.equal(E.adbStatus(a28.find((f) => f.number === 'AC1986'), 'arr', T(9, 29, 0, 3), T(9, 29, 0, 30)), 'delayed');
  assert.equal(E.adbStatus(a28.find((f) => f.number === 'PD2381'), 'arr', T(9, 28, 21, 30), T(9, 28, 22, 0)), 'arrived');
});

test('(A) a real actual time is evidence; "Arrived" on a departure row is a departure; the adapters keep the airport\'s word', async () => {
  const E = engine();
  const now = Date.UTC(2026, 8, 30, 20, 0);
  const iso = (ts) => new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+00:00');
  const row = (runway, sched) => ({ status: 'Unknown', departure: { scheduledTime: { utc: iso(sched) }, runwayTime: { utc: iso(runway) } }, arrival: {} });
  const up = row(now - MIN, now - 4 * MIN);
  const st = E.adbStatus(up, 'dep', now - 4 * MIN, now);
  assert.equal(st, 'departed', 'a wheels-up a minute ago is a departure');
  assert.equal(E.adbStatusInferred(up, st), false, 'and it is evidence, not inference');
  const ahead = row(now + 10 * MIN, now + 7 * MIN);
  const st2 = E.adbStatus(ahead, 'dep', now + 7 * MIN, now);
  assert.ok(!CLAIM.test(st2), `a runway time still ahead is no claim (read ${st2})`);
  assert.equal(E.adbStatusInferred(ahead, st2), false);
  const landed = { status: '', arrival: { scheduledTime: { utc: iso(now - 20 * MIN) }, runwayTime: { utc: iso(now - 9 * MIN) } }, departure: {} };
  assert.equal(E.adbStatus(landed, 'arr', now - 20 * MIN, now), 'arrived');
  // The tripwire still fires on a claim with nothing behind it.
  assert.equal(E.adbStatusInferred({ status: 'scheduled' }, 'departed'), true);

  // Denver and Chicago label a departure that has reached its destination
  // "Arrived"; the departures board must not print "Arrived".
  const W = await import(workerPath);
  const NOW = Date.parse('2026-09-05T01:00:00-04:00');
  let n = 0;
  for (const list of [W.denParseFeed(fixture('den-sample.json'), 'dep', NOW), W.ordParseFeed(fixture('ord-sample.json'), 'dep', NOW)]) {
    for (const f of list.filter((x) => x.status === 'arrived')) {
      n++;
      assert.equal(E.adbStatus(f, 'dep', E.adbTs(f.departure.scheduledTime.local), NOW), 'departed', f.number);
    }
  }
  assert.ok(n >= 4, `departure rows labelled arrived: ${n}`);

  assert.equal(router.yqmStatus('Final call'), 'final');
  assert.equal(router.yqmStatus('Last call'), 'final');
  assert.equal(router.yqmStatus('Gate closed'), 'gateclosed');
  assert.equal(router.yqmStatus('Boarding'), 'boarding');
  assert.equal(router.tpaStatus('GC'), 'gateclosed');
  assert.equal(router.tpaStatus('BO'), 'boarding');
  assert.equal(router.yyzStatus('GTC'), 'gateclosed');
  assert.equal(router.yyzStatus('BRD'), 'boarding');
  // Pearson's GTO, by its pair with GTC, is "gate open" — not a boarding call.
  assert.equal(router.yyzStatus('GTO'), 'scheduled');
  assert.equal(E.adbStatus({ status: 'final' }, 'dep', now, now), 'final');
  assert.equal(E._rowStatusRank('final'), 3, 'a Final call copy outranks a Boarding copy in the de-dup');
});

test('(A) when a row leaves the departures and arrivals boards', () => {
  const E = engine();
  const now = Date.UTC(2026, 8, 30, 21, 0);
  const at = (status, mins, extra) => E._fidsBoardRowPlace(Object.assign({ status, _sortTs: now - mins * MIN }, extra || {}), now);
  assert.equal(at('departed', 29), 'past');
  assert.equal(at('departed', 31), '');
  assert.equal(at('arrived', 29), 'past');
  for (const st of ['boarding', 'final', 'gateclosed']) {
    assert.equal(at(st, 59), 'live', st + ' at +59');
    assert.equal(at(st, 61), '', st + ' at +61');
  }
  assert.equal(at('ontime', 29), 'live');
  assert.equal(at('ontime', 31), '');
  assert.equal(at('scheduled', 31), '');
  // Early and delayed rows are measured from their revised time.
  assert.equal(at('early', 20, { _revTs: now - 31 * MIN }), '');
  assert.equal(at('early', 20, { _revTs: now - 29 * MIN }), 'live');
  assert.equal(at('delayed', 60, { _revTs: now - 29 * MIN }), 'live');
  assert.equal(at('delayed', 60, { _revTs: now - 31 * MIN }), '', 'a delay the board worked out from a revision leaves on its time');
  // The feed's OWN "Delayed until X" / "Early" stays until the feed drops it,
  // within the hard stop — the clock does not hide a flight the airport lists.
  assert.equal(at('delayed', 60, { _revTs: now - 31 * MIN, _stExplicit: true }), 'live');
  assert.equal(at('delayed', 170, { _revTs: now - 140 * MIN, _stExplicit: true }), 'live');
  assert.equal(at('delayed', 181, { _revTs: now - 150 * MIN, _stExplicit: true }), '');
  assert.equal(at('early', 20, { _revTs: now - 31 * MIN, _stExplicit: true }), 'live');
  assert.equal(at('ontime', 31, { _stExplicit: false }), '');
  // Delayed with no time, cancelled, diverted: the airport's word stands until
  // the three-hour hard stop.
  assert.equal(at('delayed', 150), 'live');
  assert.equal(at('delayed', 181), '');
  assert.equal(at('cancelled', 150), 'live');
  assert.equal(at('diverted', 150), 'live');
  assert.equal(at('active', 150), 'live', 'an arrival the feed says is still in the air stays');
  assert.equal(at('active', 181), '');
  assert.equal(at('departed', 190, { _revTs: now - 10 * MIN }), '', 'nothing outlives its schedule by three hours');
  assert.equal(E._fidsBoardRowPlace({ status: 'ontime' }, now), 'live', 'a row with no time is kept');
  assert.equal(E._fidsBoardRowPlace(null, now), '');
});

test('(A) Moncton\'s rows on the boards: early, delayed and arrived leave on their own times', () => {
  const E = engine();
  // AC7992 Early at 10:27: off the arrivals board at 10:57 unless cyqm confirms.
  const a = (now) => find(arrs(E, YQM.arr30, now), 'AC7992', 30);
  assert.equal(E._fidsBoardRowPlace(a(T(9, 30, 10, 56)), T(9, 30, 10, 56)), 'live');
  assert.equal(E._fidsBoardRowPlace(a(T(9, 30, 10, 58)), T(9, 30, 10, 58)), '');
  // The belt lists it from 09:27 to 11:12, as Early.
  for (const [hh, mm, inWin] of [[9, 26, false], [9, 28, true], [11, 11, true], [11, 13, false]]) {
    const r = a(T(9, 30, hh, mm));
    assert.equal(E._bidsInWindow(r, T(9, 30, hh, mm)), inWin, `belt at ${hh}:${mm}`);
    assert.equal(r.status, 'early');
  }
  // The gate's inbound panel keeps "Arriving From": nothing says it landed.
  assert.equal(E.fidsInboundHasArrived(a(T(9, 30, 11, 0)), T(9, 30, 11, 0)), false);
  // AC1986 "Delayed until 12:18 AM", Revised 00:18: the airport's own word.
  // If cyqm.ca still prints it at 00:50, 01:10 or 01:40, the airport still
  // lists the flight and the board keeps it; only the three-hour stop past
  // its 00:03 schedule (03:03) ends it on our side.
  const d = (now) => find(arrs(E, YQM.arr28, now), 'AC1986', 29);
  const r1986 = d(T(9, 29, 0, 30));
  assert.equal(r1986.status, 'delayed');
  assert.equal(r1986.upd, '00:18');
  assert.equal(r1986._stExplicit, true);
  for (const [hh, mm] of [[0, 47], [0, 50], [1, 10], [1, 40], [3, 2]]) {
    assert.equal(E._fidsBoardRowPlace(d(T(9, 29, hh, mm)), T(9, 29, hh, mm)), 'live', `AC1986 at ${hh}:${mm}`);
  }
  assert.equal(E._fidsBoardRowPlace(d(T(9, 29, 3, 4)), T(9, 29, 3, 4)), '');
  // A departure the airport calls "Delayed until 6:00 PM" stays on the
  // departures board past 18:30 too.
  const pd = said(YQM.dep30, 'PD2382', 30, 'Delayed until 6:00 PM', '6:00 PM');
  for (const [hh, mm] of [[18, 29], [18, 31], [18, 45]]) {
    const r = find(deps(E, pd, T(9, 30, hh, mm)), 'PD2382', 30);
    assert.equal(r.status, 'delayed');
    assert.equal(E._fidsBoardRowPlace(r, T(9, 30, hh, mm)), 'live', `PD2382 at ${hh}:${mm}`);
  }
  // PD2381 Arrived at 9:47: the top group until 22:17.
  const p = (now) => find(arrs(E, YQM.arr28, now), 'PD2381', 28);
  assert.equal(E._fidsBoardRowPlace(p(T(9, 28, 22, 16)), T(9, 28, 22, 16)), 'past');
  assert.equal(E._fidsBoardRowPlace(p(T(9, 28, 22, 18)), T(9, 28, 22, 18)), '');
});

test('(A) Salt Lake City arrivals, a feed that says nothing after the time: no claim, and nothing stuck', async () => {
  const W = await import(workerPath);
  const E = engine();
  const NOW = Date.parse('2026-09-05T20:15:00-06:00');
  const raw = W.slcParsePage(fixture('slc-arr-sample.html'), 'arr', NOW);
  const rows = mapRows(E, raw, 'arr', NOW);
  let stale = 0;
  for (const r of rows) {
    if (CLAIM.test(r.status)) assert.ok(E._ADB_EXPLICIT_STATUS.test(rawWord({ status: r._raw })), `${r.flight} reads ${r.status} with no word`);
    if (r._raw === 'scheduled' && NOW - (r._revTs || r._sortTs) > 30 * MIN) {
      stale++;
      assert.notEqual(E._fidsBoardRowPlace(r, NOW), 'live', `${r.flight} would sit on the board`);
      assert.ok(!CLAIM.test(r.status), `${r.flight} reads ${r.status}`);
    }
  }
  assert.equal(stale, 212, 'the 212 rows the feed leaves neutral past their time');
});

test('(A) every board places its rows with the one rule', () => {
  const renderSrc = CORE.slice(CORE.lastIndexOf('function render() {'), CORE.indexOf('// ── DEDICATED SCREEN INTERCEPT'));
  const pageSrc = CORE.slice(CORE.indexOf('function getPageCount('), CORE.indexOf('const flights = applySearch([...departed, ...upcoming]);'));
  const mobileSrc = CORE.slice(CORE.indexOf('function renderMobile() {'), CORE.indexOf('const filtered = applySearch(all);'));
  for (const [name, src] of [['render()', renderSrc], ['getPageCount()', pageSrc], ['renderMobile()', mobileSrc]]) {
    assert.ok(src.length > 200 && src.length < 20000, name + ' sliced');
    assert.match(src, /_fidsBoardRowPlace\(f, nowTs\) === 'past'/, name + ' takes its top group from the rule');
    assert.match(src, /_fidsBoardRowPlace\(f, nowTs\) === 'live'/, name + ' takes its list from the rule');
    assert.doesNotMatch(src, /pastStatuses|pastSet|DEPARTED_SHOW_MS/, name + ' keeps no status-only copy');
  }
});

test('(A) the departures board prints the words the airport used', () => {
  const window = {};
  vm.runInNewContext(V2, { window, console });
  const fmt = (status, lang) => window.fidsFormatStatus({ status }, lang);
  assert.equal(fmt('gateclosed', 'fr').html, 'Porte fermée');
  assert.equal(fmt('gateclosed', 'fr').cssClass, 'fids-status-gate-closed');
  assert.equal(fmt('gateclosed', 'en').html, 'Gate closed');
  assert.equal(fmt('active', 'en').html, 'En route');
  assert.equal(fmt('active', 'fr').html, 'En vol');
  assert.equal(fmt('active', 'en').cssClass, 'fids-status-scheduled', 'plain ink, no new colour');
  assert.equal(fmt('final', 'en').html, 'Final call');
  assert.equal(fmt('final', 'fr').html, 'Dernier appel');
  assert.equal(fmt('ontime', 'fr').html, 'À l\'heure');
  assert.equal(fmt('scheduled', 'fr').html, 'Prévu');
  // The 'en route' words are the board's own (SS.active), in all nine languages.
  const ss = new Function('return ' + braceFrom(CORE, CORE.indexOf('const SS = {') + 'const SS = '.length, 'SS'))();
  for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.equal(window.fidsT('st-en-route', l), ss.active[l], l);
});

test('(A) the big map names the inbound it tracks in the airport\'s terms: arriving, arrived, or only where it is from', async () => {
  const E = engine();
  const now = Date.UTC(2026, 8, 30, 14, 0);
  const key = (f) => E._gateInbCaptionKey(f, now);
  assert.equal(key({ status: 'ontime', _sortTs: now + 20 * MIN }), 'arrivingFrom');
  assert.equal(key({ status: 'ontime', _sortTs: now - 29 * MIN }), 'arrivingFrom', 'the arrivals board still lists it');
  assert.equal(key({ status: 'ontime', _sortTs: now - 31 * MIN }), 'aircraftFrom', 'the arrivals board has dropped it: neither arriving nor arrived');
  assert.equal(key({ status: 'active', _sortTs: now - 90 * MIN }), 'arrivingFrom', 'the airport says it is in the air');
  assert.equal(key({ status: 'ontime', _pushStatus: 'active', _sortTs: now - 90 * MIN }), 'arrivingFrom', 'or the push does');
  assert.equal(key({ status: 'delayed', _stExplicit: true, _sortTs: now - 90 * MIN, _revTs: now - 60 * MIN }), 'arrivingFrom', 'the airport still calls it delayed');
  assert.equal(key({ status: 'arrived', _sortTs: now - 5 * MIN }), 'arrivedFrom');
  assert.equal(key({ status: 'ontime', _actualArrTime: '2026-09-30 10:52-03:00', _sortTs: now - 40 * MIN }), 'arrivedFrom');
  assert.equal(key({ status: 'landed', _stInferred: true, _sortTs: now - 20 * MIN }), 'aircraftFrom', 'an old clock-made landing is no evidence');
  for (const k of ['arrivingFrom', 'arrivedFrom', 'aircraftFrom']) {
    for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(E._GATE_LBL[k][l], k + '.' + l);
  }
  // Salt Lake City's arrivals the feed leaves neutral past their time: every
  // one the arrivals board has dropped reads "Aircraft From", none "Arriving".
  const W = await import(workerPath);
  const NOW = Date.parse('2026-09-05T20:15:00-06:00');
  const rows = mapRows(E, W.slcParsePage(fixture('slc-arr-sample.html'), 'arr', NOW), 'arr', NOW);
  let n = 0;
  for (const r of rows) {
    if (r._raw !== 'scheduled' || NOW - (r._revTs || r._sortTs) <= 30 * MIN) continue;
    n++;
    assert.equal(E._gateInbCaptionKey(r, NOW), 'aircraftFrom', r.flight);
  }
  assert.equal(n, 212);
  // The caption asks this function.
  assert.match(CORE, /var _capKey = \(ctx && ctx\.out\) \? 'departure' : _gateInbCaptionKey\(_capF, Date\.now\(\)\);/);
});

test('(A) an inbound has arrived only on evidence', () => {
  const E = engine();
  const now = Date.UTC(2026, 8, 30, 14, 0);
  assert.equal(E.fidsInboundHasArrived({ status: 'ontime', _sortTs: now - 40 * MIN }, now), false, 'forty minutes past its time is not a landing');
  assert.equal(E.fidsInboundHasArrived({ status: 'landed', _stInferred: true, _sortTs: now - 40 * MIN }, now), false, 'nor is an old clock-made "landed"');
  assert.equal(E.fidsInboundHasArrived({ status: 'arrived', _sortTs: now - 5 * MIN }, now), true);
  assert.equal(E.fidsInboundHasArrived({ status: 'ontime', _actualArrTime: '2026-09-30 10:52-03:00' }, now), true);
  assert.equal(E.fidsInboundHasArrived({ status: 'active', _sortTs: now - 90 * MIN }, now), false);
});

// ════════════════════════════════════════════════════════════════════════════
// (B) THE GATE HOLDS A BOARDING FLIGHT
// ════════════════════════════════════════════════════════════════════════════

test('(B) the one gate rule: ten minutes, or an hour on the feed\'s own boarding word', () => {
  const E = engine();
  const now = Date.UTC(2026, 8, 30, 21, 0);
  const live = (status, mins, extra) => E._gateFlightLive(Object.assign({ gate: '3', status, _sortTs: now - mins * MIN }, extra || {}), now);
  assert.equal(live('ontime', 9), true);
  assert.equal(live('ontime', 11), false);
  for (const st of ['boarding', 'final', 'gateclosed']) {
    assert.equal(live(st, 59), true, st + ' at +59');
    assert.equal(live(st, 61), false, st + ' at +61');
  }
  assert.equal(live('boarding', 11, { _stInferred: true }), false, 'a clock-made boarding holds nothing');
  assert.equal(live('boarding', 11, { _actualDepTime: new Date(now - 2 * MIN).toISOString() }), false, 'a real wheels-up ends the hold');
  assert.equal(live('boarding', 11, { _pushStatus: 'active' }), false, 'so does the push saying it is in the air');
  assert.equal(live('boarding', 30, { _pushStatus: 'departed' }), true, 'a push-back with no wheels-up does not (v23919)');
  assert.equal(live('departed', -20), false);
  assert.equal(live('cancelled', -20), false);
  assert.equal(live('delayed', 90, { _revTs: now + 30 * MIN }), true, 'a revised time extends the flight');
  assert.equal(E._gateFlightLive({ gate: '3', status: 'ontime' }, now), true, 'a flight with no time is kept');
});

test('(B) Minneapolis still saying Boarding an hour on: the cap holds', async () => {
  const W = await import(workerPath);
  const NOW = Date.parse('2026-09-05T21:10:00-05:00');
  const E = engine();
  const rows = mapRows(E, W.mspParsePage(fixture('msp-dep-sample.html'), 'dep', NOW), 'dep', NOW);
  const by = (n) => rows.find((r) => r.flight === n);
  assert.equal(by('DL2929').status, 'boarding');
  assert.equal(E._gateFlightLive(by('DL2929'), NOW), false, 'DL2929, +63: past the hour');
  assert.equal(E._gateFlightLive(by('DL2846'), NOW), true, 'DL2846, +55: held');
  assert.equal(E._gateFlightLive(by('DL1609'), NOW), true, 'DL1609, +40: held');
  const gates = E._gateLiveGates(rows, NOW);
  assert.ok(gates.includes(by('DL2846').gate) && gates.includes(by('DL1609').gate), gates.join(','));
});

test('(B) Moncton gate 1: the hold, and the yield to the next flight the airport is boarding', () => {
  const at = (rows, now) => { const E = engine(); E.data.dep = deps(E, rows, now); return E._gateFlightsAt('1', now).map((f) => f.flight); };
  // AC2037 06:35 "OnTime": gate 1's flight until 06:45.
  assert.equal(at(YQM.dep28, T(9, 29, 6, 44))[0], 'AC2037');
  assert.ok(!at(YQM.dep28, T(9, 29, 6, 46)).includes('AC2037'));
  // AC2037 "Boarding": held, with AC7753 next.
  const boarding = said(YQM.dep28, 'AC2037', 29, 'Boarding');
  assert.deepEqual(at(boarding, T(9, 29, 6, 50)), ['AC2037', 'AC7753']);
  // AC7753 boarding too: gate 1 yields to it.
  const both = said(boarding, 'AC7753', 29, 'Boarding');
  assert.equal(at(both, T(9, 29, 7, 0))[0], 'AC7753');
  // AC2037 still "Boarding" at 07:36: past the hour, gone.
  assert.ok(!at(boarding, T(9, 29, 7, 36)).includes('AC2037'));
});

test('(B) Moncton gate 3: PD2382 held while cyqm says Boarding, and only then', () => {
  // Labelled with the local day: tomorrow's PD2382 is on the same gate.
  const at = (rows, now) => {
    const E = engine(); E.data.dep = deps(E, rows, now);
    return E._gateFlightsAt('3', now).map((f) => f.flight + '@' + new Date(f._sortTs - 3 * 3600000).getUTCDate());
  };
  const b = said(YQM.dep30, 'PD2382', 30, 'Boarding');
  assert.equal(at(b, T(9, 30, 17, 50))[0], 'PD2382@30', 'held at +30');
  assert.ok(!at(b, T(9, 30, 18, 21)).includes('PD2382@30'), 'gone at +61');
  assert.equal(at(YQM.dep30, T(9, 30, 17, 29))[0], 'PD2382@30', 'an "OnTime" PD2382 is still the gate\'s at +9');
  assert.ok(!at(YQM.dep30, T(9, 30, 17, 31)).includes('PD2382@30'), 'and leaves at +10');
});

test('(B) a stale hold gives the gate up to the next flight: at its own time, on its boarding, on its departure', () => {
  const run = (rows, now, overrides) => {
    const E = engine({ overrides }); E.data.dep = deps(E, rows, now);
    return { list: E._gateFlightsAt('1', now).map((f) => f.flight), live: E._gateLiveGates(E.data.dep, now) };
  };
  const at = (rows, hh, mm) => run(rows, T(9, 29, hh, mm));
  // The grace comes first: at 06:38 AC2037 is three minutes past its time and
  // still gate 1's flight, even with AC7753 boarding too.
  const both = said(said(YQM.dep28, 'AC2037', 29, 'Boarding'), 'AC7753', 29, 'Boarding');
  assert.equal(at(both, 6, 38).list[0], 'AC2037');
  // AC2037 left on "Boarding", AC7753 "OnTime" (07:10): AC2037 holds until
  // AC7753's own time comes, then gives way for good — it does not come back
  // once AC7753 has gone either.
  const stale = said(YQM.dep28, 'AC2037', 29, 'Boarding');
  assert.deepEqual(at(stale, 7, 0).list, ['AC2037', 'AC7753']);
  assert.deepEqual(at(stale, 7, 9).list, ['AC2037', 'AC7753']);
  for (const [hh, mm] of [[7, 10], [7, 15], [7, 20]]) assert.deepEqual(at(stale, hh, mm).list, ['AC7753'], `${hh}:${mm}`);
  for (const [hh, mm] of [[7, 21], [7, 30], [7, 35]]) {
    const r = at(stale, hh, mm);
    assert.deepEqual(r.list, [], `${hh}:${mm}: no flap back to AC2037`);
    assert.ok(!r.live.includes('1'), `${hh}:${mm}: and no walking display lands on gate 1`);
  }
  // cyqm says AC7753 "Departed at 7:07 AM": AC2037's hold is over at once.
  const gone = said(stale, 'AC7753', 29, 'Departed at 7:07 AM', '7:07 AM');
  for (const [hh, mm] of [[7, 8], [7, 15], [7, 30]]) {
    const r = at(gone, hh, mm);
    assert.deepEqual(r.list, [], `${hh}:${mm}`);
    assert.ok(!r.live.includes('1'));
  }
  // The same for a stale "Gate closed".
  const closed = said(YQM.dep28, 'AC2037', 29, 'Gate closed');
  assert.deepEqual(at(closed, 7, 0).list, ['AC2037', 'AC7753']);
  assert.deepEqual(at(closed, 7, 12).list, ['AC7753']);
});

test('(B) the same departure under two numbers is one flight at the gate, and does not yield to itself', () => {
  const now = Date.UTC(2026, 8, 30, 21, 0);
  const E = engine();
  E.data.dep = [
    { flight: 'AC8800', airline: 'AC', _opCode: 'QK', gate: '7', _locIata: 'YUL', status: 'boarding', _sortTs: now - 30 * MIN },
    { flight: 'UA8000', airline: 'UA', _opCode: 'QK', gate: '7', _locIata: 'YUL', status: 'boarding', _sortTs: now - 28 * MIN },
    { flight: 'AC1000', airline: 'AC', gate: '7', _locIata: 'YYZ', status: 'ontime', _sortTs: now + 50 * MIN }
  ];
  assert.deepEqual(E._gateFlightsAt('7', now).map((f) => f.flight), ['AC8800', 'AC1000'], 'one row for the codeshare pair, held');
  assert.equal(E._gateHoldYields(E.data.dep[0], E.data.dep, now), false);
});

test('(B) an operator\'s "Boarding" holds the gate through a feed refresh, and an operator\'s "Cancelled" frees it', () => {
  const now = T(9, 30, 18, 0);   // PD2382 17:20, 40 minutes on
  const fresh = (overrides) => { const E = engine({ overrides }); E.data.dep = deps(E, YQM.dep30, now); return E; };
  // A freshly mapped feed says OnTime: without the override the gate let it go at 17:30.
  const plain = fresh();
  assert.ok(!plain._gateFlightsAt('3', now).some((f) => f.flight === 'PD2382' && f._sortTs === T(9, 30, 17, 20)));
  // The override is read in the pick itself, so a re-mapped row is held too.
  const held = fresh({ PD2382: { status: 'boarding' } });
  assert.ok(held._gateFlightsAt('3', now).some((f) => f.flight === 'PD2382' && f._sortTs === T(9, 30, 17, 20)), 'held at +40');
  assert.ok(held._gateLiveGates(held.data.dep, now).includes('3'));
  const late = fresh({ PD2382: { status: 'boarding' } });
  assert.ok(!late._gateFlightsAt('3', T(9, 30, 18, 21)).some((f) => f._sortTs === T(9, 30, 17, 20)), 'and the hour still caps it');
  const off = engine({ overrides: { PD2382: { status: 'cancelled' } } });
  assert.equal(off._gateFlightLive({ flight: 'PD2382', gate: '3', status: 'ontime', _sortTs: now + 60 * MIN }, now), false);
});

test('(B) every reader of the gate\'s flight asks the same list', () => {
  const key = CORE.slice(CORE.indexOf('function getDedicatedRenderKey()'), CORE.indexOf("if (screenType === 'baggage')", CORE.indexOf('function getDedicatedRenderKey()')));
  const time = CORE.slice(CORE.indexOf('function updateDedicatedTimeOnly()'), CORE.indexOf('const cf = gateFlights[0];'));
  const paint = CORE.slice(CORE.indexOf('function renderDedicatedScreen()'), CORE.indexOf('const currentFlight = gateFlights[0];'));
  for (const [name, src] of [['getDedicatedRenderKey', key], ['updateDedicatedTimeOnly', time], ['renderDedicatedScreen', paint]]) {
    assert.ok(src.length > 100 && src.length < 12000, name + ' sliced');
    assert.match(src, /_gateFlightsAt\(subScreenVal, _nowMs\d?\)/, name + ' reads _gateFlightsAt');
    assert.doesNotMatch(src, /> 10 \* 60000/, name + ' keeps no ten-minute copy of its own');
  }
  assert.match(fn('_gateLiveGates'), /if \(!_gateFlightLive\(f, now\)\) return;/, 'the walking pick shares the rule');
  const showLine = line(CORE, /var _showFlight = [^;]+;/, '_showFlight');
  assert.equal(showLine, 'var _showFlight = !!currentFlight;');
  assert.doesNotMatch(CORE, /_minsToDep3h/, 'no rounded clock of its own');
});

// ════════════════════════════════════════════════════════════════════════════
// (A)(B) THE SIGNS FOLLOW THE AIRPORT'S WORD
// ════════════════════════════════════════════════════════════════════════════

const UXG = CORE.slice(CORE.indexOf('function uxgGateHtml(ctx) {'), CORE.indexOf('\nfunction uxgFitDestinations()'));

test('(A)(B) the boarding, final call and gate closed signs open on the flight\'s word only', () => {
  assert.ok(UXG.length > 50000, 'uxgGateHtml sliced');
  const E = engine();
  const LEAD = 25;
  const cf = { _sortTs: 1, status: 'ontime' };
  // Every word against every minute from an hour out to an hour past: a sign
  // opens on its own word and on nothing else, and boarding never turns into
  // final call by the clock.
  const WORDS = ['scheduled', 'ontime', 'early', 'delayed', 'boarding', 'final', 'finalcall', 'final-call',
                 'gateclosed', 'gate-closed', 'departed', 'cancelled', 'diverted', 'active', 'landed', ''];
  for (const w of WORDS) {
    const n = w.replace(/[\s_-]+/g, '');
    for (let m = -60; m <= 60; m++) {
      const p = E._gateSignPhase(w, m, LEAD, cf, false);
      assert.equal(p.showBoarding, n === 'boarding', `${w} at ${m}: NOW BOARDING`);
      assert.equal(p.isFinalCallStatus, n === 'final' || n === 'finalcall', `${w} at ${m}: FINAL CALL`);
      assert.equal(p.isGateClosedStatus, n === 'gateclosed' || n === 'departed', `${w} at ${m}: GATE CLOSED`);
      assert.equal(p.finalActive, p.isFinalCallStatus || p.isGateClosedStatus, `${w} at ${m}: the final/closed panel`);
      assert.equal(p.boardActive, n === 'boarding', `${w} at ${m}: the boarding panel, never FINAL CALL by the clock`);
      if (p.showBoarding || p.isFinalCallStatus || p.isGateClosedStatus) assert.equal(p.showCountdown, false, `${w} at ${m}: no countdown over a sign`);
    }
  }
  // The countdown is the airline's forecast: the ten minutes before boarding,
  // on a neutral word.
  const cd = (w, m, f, late) => E._gateSignPhase(w, m, LEAD, f || cf, !!late).showCountdown;
  assert.equal(cd('ontime', 36), false);
  assert.equal(cd('ontime', 35), true);
  assert.equal(cd('ontime', 26), true);
  assert.equal(cd('ontime', 25), false);
  // ...never once the airport has said the time will not hold,
  for (const w of ['delayed', 'cancelled', 'canceled', 'diverted']) assert.equal(cd(w, 30), false, w + ' with no new time');
  // ...but a delay WITH a published time counts down to that time (minsToDep
  // is already revised),
  assert.equal(cd('delayed', 30, { _sortTs: 1, upd: '11:45' }), true);
  assert.equal(cd('delayed', 30, { _sortTs: 1, _revTs: 1 + 30 * MIN }), true);
  // ...and never under "Updated boarding time to follow".
  assert.equal(cd('ontime', 30, cf, true), false);

  // uxgGateHtml takes every one of these from that one answer, and assigns
  // none of them anywhere else: a clock put back into any of them shows here.
  assert.match(UXG, /var _gateSign = _gateSignPhase\(stKey, minsToDep, _boardLeadShown, currentFlight, inbDelayed\);/);
  const only = (name, want) => assert.deepEqual(UXG.match(new RegExp('\\b' + name + '\\s*=(?!=)[^\\n;]*', 'g')), want, name);
  only('showBoarding', ['showBoarding = _gateSign.showBoarding']);
  only('isGateClosedStatus', ['isGateClosedStatus = _gateSign.isGateClosedStatus']);
  only('isFinalCallStatus', ['isFinalCallStatus = _gateSign.isFinalCallStatus']);
  only('showCountdown', ['showCountdown = _gateSign.showCountdown']);
  only('finalActive', ['finalActive = false', 'finalActive = _gateSign.finalActive']);
  only('boardActive', ['boardActive = false', 'boardActive = _gateSign.boardActive']);
  // The notice is worked out before the signs, which read it.
  assert.ok(UXG.indexOf('var inbDelayed = _gateInbLateNotice(') < UXG.indexOf('var _gateSign = _gateSignPhase('));
  assert.doesNotMatch(CORE, /GATE_CLOSE_LEAD_MIN/);
  assert.doesNotMatch(CORE, /veryLate|_gateFinalStatus/);
  // 'final' reaches the boarding-class badge instead of falling through to on-time.
  assert.match(UXG, /else if \(stKey === 'final' \|\| stKey === 'finalcall' \|\| stKey === 'final-call'\) stClass = ' boarding';/);
});

test('(B) a held boarding flight\'s sign never says "On time" once its departure time has passed', () => {
  const E = engine();
  const k = (cf, state, mins) => E._boardStripStatusKey(cf, state, mins);
  // Before the departure time, with nothing from the airport: On time, as the
  // sign has always read.
  assert.equal(k({ status: 'boarding', time: '20:48' }, 'boarding', 12), 'ontime');
  assert.equal(k({ status: 'boarding', time: '20:48' }, 'boarding', 0), 'ontime');
  // Held at +1, +30, +45: the flanks are empty, not On time and not a Delayed
  // nobody announced.
  for (const m of [-1, -30, -45]) assert.equal(k({ status: 'boarding', time: '20:48' }, 'boarding', m), '', `at ${-m} min past`);
  // The airport's own words still show past the time.
  assert.equal(k({ status: 'delayed', time: '20:48', upd: '21:30' }, 'boarding', -10), 'delayed');
  assert.equal(k({ status: 'boarding', time: '20:48', upd: '20:30' }, 'boarding', -10), 'early');
  assert.equal(k({ status: 'cancelled', time: '20:48' }, 'cancelled', -10), 'cancelled');
  // uxgGateHtml's strip takes its flank from this, and an empty answer draws
  // no flank (never the class g8-bw-st-ontime).
  assert.match(UXG, /var _bwStKey = _boardStripStatusKey\(currentFlight, _stripState, minsToDep, _door\.kept\);/);
  assert.match(UXG, /var _bwAbn = !!_bwStKey;/);
  assert.match(UXG, /if \(_bwAbn\) \{\s*var _stLbl = /);
});

// ════════════════════════════════════════════════════════════════════════════
// (C) NO INVENTED DELAY TIMES AT THE GATE
// ════════════════════════════════════════════════════════════════════════════

test('(C) the gate writes no time and no status onto the shared flight row', () => {
  assert.doesNotMatch(UXG, /_inbDelayCarryOver/);
  assert.doesNotMatch(UXG, /currentFlight\.(upd|_revTs|status)\s*=(?!=)/);
  // Across the whole file, the only writers of a row's upd are a person's
  // override and the de-dup that merges two copies of the same flight.
  const writers = [];
  const re = /\.upd\s*=(?!=)/g;
  let m;
  while ((m = re.exec(CORE))) {
    const before = CORE.slice(0, m.index);
    const lineStart = before.lastIndexOf('\n') + 1;
    if (/^\s*\/\//.test(CORE.slice(lineStart, m.index))) continue;   // a comment
    const fnStart = before.lastIndexOf('\nfunction ');
    writers.push(CORE.slice(fnStart + 10, CORE.indexOf('(', fnStart)));
  }
  assert.deepEqual([...new Set(writers)].sort(), ['_fidsDedupeRows', 'applyOverrideToFlight']);
  // The departure's status and its "revised" flag come from its own row
  // only, and nothing else in uxgGateHtml assigns either — a late inbound
  // forcing "Delayed" back in would have to write one of these.
  assert.match(UXG, /var _depState = _gateDepDisplayState\(currentFlight\);/);
  // (v23925 — and the door word, _gateDoor: the schedule boarding, or a sign
  // kept through a delay; (D) below pins both.)
  assert.deepEqual(UXG.match(/\bstKey\s*=(?!=)[^\n;]*/g),
    ["stKey = currentFlight.status || 'scheduled'", 'stKey = _depState.stKey', "stKey = 'ontime'", 'stKey = _door.word']);
  assert.deepEqual(UXG.match(/\bdepDelayed\s*=(?!=)[^\n;]*/g), ['depDelayed = _depState.depDelayed']);
  // The honesty floor is the pure helper, told whether the departure is
  // revised; v23925 — it runs inside _gateBoardingTimes, which the gate's
  // Boarding field reads through _gateDoor.
  assert.match(fn('_gateBoardingTimes'), /boardTs = _gateBoardingFloorTs\(boardTs, effDep, cf, gi, arrRows, depDelayed\);/);
  assert.match(UXG, /var _door = _gateDoor\(currentFlight, Date\.now\(\), iata, window\._gateInbound, data\.arr, tz, equipRaw\);/);
  assert.doesNotMatch(UXG, /_bGi\._revTs|var _bArrTs/, 'no second copy of the floor inside the builder');
  assert.doesNotMatch(UXG, /_gateBoardingFloorTs\(|getBoardingLeadMins\(|var _delayB/, 'no second copy of the boarding time inside the builder');
});

test('(C) the departure keeps the airline\'s own status: a late inbound cannot reach it', () => {
  const E = engine();
  const st = (cf) => E._gateDepDisplayState(cf);
  assert.deepEqual(st({ status: 'ontime', _sortTs: 1 }), { stKey: 'ontime', depDelayed: false, revTsLater: false });
  assert.deepEqual(st({ status: 'scheduled', _sortTs: 1 }), { stKey: 'ontime', depDelayed: false, revTsLater: false });
  assert.deepEqual(st({}), { stKey: 'ontime', depDelayed: false, revTsLater: false });
  // "Delayed" with no time: the word shows, nothing is struck through.
  assert.deepEqual(st({ status: 'delayed', _sortTs: 1 }), { stKey: 'delayed', depDelayed: false, revTsLater: false });
  // A time the feed published, with its word: struck through and revised.
  assert.equal(st({ status: 'delayed', _sortTs: 1, upd: '11:45' }).depDelayed, true);
  assert.equal(st({ status: 'delayed', _sortTs: 1, _revTs: 1 + 30 * MIN }).depDelayed, true);
  assert.equal(st({ status: 'early', _sortTs: 1, _revTs: 1 + 30 * MIN }).revTsLater, true);
  // A revision with no delay word is not depDelayed (the shelves ink it by direction).
  assert.equal(st({ status: 'ontime', _sortTs: 1, upd: '11:45' }).depDelayed, false);
  // Its only input is the departure row: AC7995 beside a late AC7992 reads On time.
  const now = T(9, 30, 10, 0);
  const cf = find(deps(E, YQM.dep30, now), 'AC7995', 30);
  assert.equal(E._gateDepDisplayState.length, 1, 'one argument, the departure');
  assert.deepEqual(st(cf), { stKey: 'ontime', depDelayed: false, revTsLater: false });
});

test('(C) the honesty floor: the inbound\'s schedule, or its published revision when the departure is revised too', () => {
  const E = engine();
  const t = (hh, mm) => T(9, 30, hh, mm);
  const hm = (ts) => new Date(ts - 3 * 3600000).toISOString().slice(11, 16);
  // AC7995 11:15 revised by the feed to 11:45, lead 25 → 11:20 before the floor.
  const dep = { flight: 'AC7995', gate: '4', _sortTs: t(11, 15), _revTs: t(11, 45), upd: '11:45', status: 'delayed' };
  const inb = { flight: 'AC7992', gate: '4', _sortTs: t(10, 36), _revTs: t(11, 30), status: 'delayed' };
  const board = t(11, 45) - 25 * MIN;
  // The departure carries a published revision: read the inbound's published
  // revision (11:30 + 20, capped at 11:45 − 10) — never Boarding before the
  // aeroplane is due in by the airport's own time.
  assert.equal(hm(E._gateBoardingFloorTs(board, t(11, 45), dep, inb, [], true)), '11:35');
  assert.equal(hm(E._gateBoardingFloorTs(board, t(11, 45), dep, null, [inb], true)), '11:35', 'the data.arr fallback too');
  // The departure keeps the airline's time: the inbound's lateness moves
  // nothing (the notice says so instead).
  const own = { flight: 'AC7995', gate: '4', _sortTs: t(11, 15), status: 'ontime' };
  const b2 = t(11, 15) - 25 * MIN;
  assert.equal(hm(E._gateBoardingFloorTs(b2, t(11, 15), own, inb, [], false)), '10:56', 'the schedule: 10:36 + 20');
  assert.equal(hm(E._gateBoardingFloorTs(b2, t(11, 15), own, null, [inb], false)), '10:56');
  // An inbound handed over for a different departure is not this one's.
  assert.equal(E._gateBoardingFloorTs(b2, t(11, 15), own, Object.assign({}, inb, { _forOutbound: 'WS811' }), [], false), b2);
});

test('(C) the notice on Moncton\'s real rows: AC7995 and its inbound AC7992', () => {
  const E = engine();
  const now = T(9, 30, 10, 0);
  const notice = (depRows, arrRows) => {
    const cf = find(deps(E, depRows, now), 'AC7995', 30);
    const inb = find(arrs(E, arrRows, now), 'AC7992', 30);
    const before = JSON.stringify(cf);
    const r = E._gateInbLateNotice(cf, inb, cf.status, cf._revTs || cf._sortTs, now);
    assert.equal(JSON.stringify(cf), before, 'the departure row is read, never written');
    return { r, cf };
  };
  const late = said(YQM.arr30, 'AC7992', 30, 'Delayed until 11:05 AM', '11:05 AM');
  const a = notice(YQM.dep30, late);
  assert.equal(a.r, true, 'the inbound is late, the turn threatens 11:15 and the airline has given no new time');
  assert.equal(a.cf.status, 'ontime', 'and AC7995 keeps the airline\'s word');
  assert.equal(a.cf.upd, null);
  assert.equal(a.cf._revTs, null);
  // The airline publishes its own new time: that is shown instead. 11:25 is
  // a time the late inbound still threatens (11:05 + the 35-minute turn is
  // 11:40), so only condition 3 — the departure's own published time —
  // silences the notice here.
  const own = said(YQM.dep30, 'AC7995', 30, 'Delayed until 11:25 AM', '11:25 AM');
  const o = notice(own, late);
  assert.equal(o.cf.upd, '11:25');
  assert.equal(o.r, false);
  const inbLate = find(arrs(E, late, now), 'AC7992', 30);
  assert.equal(E._gateInbLateNotice(Object.assign({}, o.cf, { upd: null, _revTs: null, status: 'ontime' }), inbLate, 'ontime', o.cf._revTs, now), true,
    'the same pair without the airline\'s time does threaten');
  // Either half of the airline's own time is enough on its own: a revised
  // HH:MM (upd) with no timestamp, or a revised timestamp with no HH:MM.
  assert.equal(E._gateInbLateNotice(Object.assign({}, a.cf, { upd: '11:25', _revTs: null, status: 'delayed' }), inbLate, 'delayed', T(9, 30, 11, 15), now), false);
  assert.equal(E._gateInbLateNotice(Object.assign({}, a.cf, { upd: null, _revTs: T(9, 30, 11, 25) }), inbLate, 'ontime', T(9, 30, 11, 25), now), false);
  // Five minutes is the line for "late": three minutes is not, six is. A
  // departure at 11:10 is threatened by either (10:39 + 35 is 11:14), so only
  // the five-minute line tells them apart.
  const at1110 = Object.assign({}, a.cf, { _sortTs: T(9, 30, 11, 10) });
  const inbAt = (hhmm) => find(arrs(E, said(YQM.arr30, 'AC7992', 30, 'OnTime', hhmm), now), 'AC7992', 30);
  assert.equal(E._gateInbLateNotice(at1110, inbAt('10:39 AM'), 'ontime', at1110._sortTs, now), false, '+3 is on time');
  assert.equal(E._gateInbLateNotice(at1110, inbAt('10:42 AM'), 'ontime', at1110._sortTs, now), true, '+6 is late');
  // The inbound has landed.
  assert.equal(notice(YQM.dep30, said(YQM.arr30, 'AC7992', 30, 'Arrived at 11:05 AM', '11:05 AM')).r, false);
  // The airport is boarding the departure.
  assert.equal(notice(said(YQM.dep30, 'AC7995', 30, 'Boarding'), late).r, false);
  // Late overnight, five hours before the next departure: the turn fits.
  const t2 = T(9, 29, 0, 10);
  const ac1986 = find(arrs(E, YQM.arr28, t2), 'AC1986', 29);
  const ac1983 = find(deps(E, YQM.dep28, t2), 'AC1983', 29);
  assert.equal(ac1986.status, 'delayed');
  assert.equal(E._gateInbLateNotice(ac1983, ac1986, ac1983.status, ac1983._sortTs, t2), false);
  // A plain "Delayed" with no time: the turn test still runs, on the least the
  // word can mean (five minutes). Overnight, AC1986 due 00:03 against AC1983
  // at 05:25 is no news at 23:30 or at 00:10 ...
  const plain = said(YQM.arr28, 'AC1986', 29, 'Delayed', '12:03 AM');
  for (const tt of [T(9, 28, 23, 30), T(9, 29, 0, 10)]) {
    const r = find(arrs(E, plain, tt), 'AC1986', 29);
    assert.equal(r.status, 'delayed');
    assert.equal(r._revTs, null);
    assert.equal(E._gateInbLateNotice(ac1983, r, ac1983.status, ac1983._sortTs, tt), false, 'five hours of turn');
  }
  // ... while a plain "Delayed" AC7992 (due 10:36) does threaten AC7995 at 11:15.
  const plain92 = find(arrs(E, said(YQM.arr30, 'AC7992', 30, 'Delayed', '10:36 AM'), now), 'AC7992', 30);
  assert.equal(plain92._revTs, null);
  assert.equal(E._gateInbLateNotice(a.cf, plain92, 'ontime', a.cf._sortTs, now), true);
  // v23925 — a diverted or cancelled inbound is not coming late, it is not
  // coming: a late revised time it still carries never raises the notice.
  for (const st of ['diverted', 'cancelled', 'canceled']) {
    assert.equal(E._gateInbLateNotice(a.cf, Object.assign({}, plain92, { status: st }), 'ontime', a.cf._sortTs, now), false, st);
    const lateRev = Object.assign({}, plain92, { status: st, _revTs: (plain92._sortTs || now) + 45 * 60000 });
    assert.equal(E._gateInbLateNotice(a.cf, lateRev, 'ontime', a.cf._sortTs, now), false, st + ' with a late revised time');
  }
  // No inbound, or an inbound on time: nothing to say.
  assert.equal(E._gateInbLateNotice(ac1983, null, 'ontime', ac1983._sortTs, t2), false);
  assert.equal(E._gateInbLateNotice(a.cf, find(arrs(E, YQM.arr30, now), 'AC7992', 30), 'ontime', a.cf._sortTs, now), false, 'an EARLY inbound is not late');
});

test('(C) the notice reads in the board\'s two languages, French first in Québec', () => {
  const E = engine({ langs: ['en', 'fr'] });
  const lbl = E._GATE_LBL.inbDelayed;
  for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(lbl[l], 'inbDelayed.' + l);
  const ls = new Function('return ' + line(CORE, /^ {2}inbDelayed:(\{[^\n]*\}),$/m, 'LS.inbDelayed').replace(/^\s*inbDelayed:/, '').replace(/,$/, ''))();
  assert.equal(lbl.en, ls.en);
  assert.equal(lbl.fr, ls.fr);
  assert.equal(lbl.en, 'The incoming aircraft has been delayed. Updated boarding time to follow.');
  const wrap = (w, i) => '<span class="g8-msg-l g8-msg-l' + (i + 1) + '">' + w + '</span>';
  const qc = E._gateLbl('inbDelayed', true, wrap, '');
  // each half carries its own language (BoardStrings.markHalf)
  assert.equal(qc, '<span class="g8-msg-l g8-msg-l1" lang="fr">' + lbl.fr + '</span><span class="g8-msg-l g8-msg-l2" lang="en">' + lbl.en + '</span>');
  assert.ok(E._gateLbl('inbDelayed', false, wrap, '').startsWith('<span class="g8-msg-l g8-msg-l1" lang="en">' + lbl.en));
  const ar = engine({ langs: ['ar', 'en'] })._gateLbl('inbDelayed', false, wrap, '');
  assert.ok(ar.startsWith('<span class="g8-msg-l g8-msg-l1" lang="ar" dir="rtl">' + lbl.ar), 'an Arabic half reads right to left');
  // Wired: the idle strip and the takeover bar both carry it, an operator's
  // message still wins, and a change in the inbound's lateness repaints.
  assert.match(UXG, /var inbDelayed = _gateInbLateNotice\(currentFlight, inboundFlight, stKey, effectiveDepTs, Date\.now\(\)\);/);
  assert.match(UXG, /_gateLbl\('inbDelayed', _frF, function \(w, i\) \{ return '<span class="g8-msg-l g8-msg-l' \+ \(i \+ 1\) \+ '">' \+ w \+ '<\/span>'; \}, ''\)/);
  assert.match(UXG, /\} else if \(inbDelayed\) \{\s*r3Left = _inbNoticeHtml;/);
  assert.match(UXG, /_inbNotice: _inbNoticeHtml,/);
  assert.match(fn('buildV2GateLayout'), /var msgHtml = _ovMsg \|\| \(vars && vars\._inbNotice\) \|\| '';/);
  const key = line(CORE, /var _computeGateKey = function \(\) \{[\s\S]*?\n\s*\};/, '_computeGateKey');
  assert.match(key, /\(inboundFlight \? \(inboundFlight\._revTs \|\| ''\) : ''\)/);
  // Each language a whole line of its own (display rule 2).
  const css = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
  assert.match(css, /\.g8-r3 \.g8-msg-l \{\s*display: block;/);
  assert.match(css, /\.g8-r3 \.g8-msg-pair \{\s*display: block;/);
});

// ════════════════════════════════════════════════════════════════════════════
// (D) OPTION B: SCHEDULE BOARDING WHERE THE FEED NEVER SAYS IT; DELAYED WHILE
//     BOARDING; DELAYED FLIGHTS STAY ON THEIR GATE (decision of 2026-09-30)
// ════════════════════════════════════════════════════════════════════════════
//
// Halifax's feed (halifaxstanfield.ca, the worker's yhzParseBoard) says only
// movement words. Its rows, captured 2026-09-04 at 23:30, run through the real
// parser and the real adbStatus here: AC2057 05:15 gate 16 (no aircraft type,
// so the narrowbody lead of 35 minutes), F8655 23:00 delayed to 23:30 gate 18,
// AC7672 cancelled. Moncton's cyqm.ca says Boarding, Final call and Gate
// closed itself, so it stays strict.

const YHZ_NOW = Date.parse('2026-09-04T23:30:00-03:00');
// Halifax and Moncton wall clock (ADT, UTC-3) as an instant, and back.
const H = (d, hh, mm) => Date.UTC(2026, 8, d, hh + 3, mm);
const hmAdt = (ts) => new Date(ts - 3 * 3600000).toISOString().slice(11, 16);
let _yhzRaw = null;
async function yhzRaw() {
  if (!_yhzRaw) {
    const W = await import(workerPath);
    _yhzRaw = {
      dep: W.yhzParseBoard(fixture('yhz-departures-sample.html'), true, YHZ_NOW),
      arr: W.yhzParseBoard(fixture('yhz-arrivals-sample.html'), false, YHZ_NOW)
    };
  }
  return _yhzRaw;
}
// One parsed row changed the way the airport would change it.
const alter = (rows, number, patch) => rows.map((f) => (f.number === number ? patch(JSON.parse(JSON.stringify(f))) : f));
const boardText = (() => {
  const window = {};
  vm.runInNewContext(V2, { window, console });
  return (row, l) => window.fidsFormatStatus(row, l).html;
})();
async function yhzEngine() {
  const raw = await yhzRaw();
  const E = engine();
  E.data.arr = mapRows(E, raw.arr, 'arr', YHZ_NOW);
  return { E, raw };
}

test('(D) the capability table: strict only where the feed is seen saying a gate word, on the route the board reads', async () => {
  const E = engine();
  const table = E.FEED_SAYS_GATE_WORDS;
  const WORKER = fs.readFileSync(workerPath, 'utf8');
  const W = await import(workerPath);
  const testFile = (n) => fs.readFileSync(path.join(__dirname, n), 'utf8');
  // A worker function, from its declaration to its closing brace at column 0
  // (the worker's own style; its regex literals defeat the brace matcher).
  const wfn = (name) => {
    const i = WORKER.indexOf('\nfunction ' + name + '(');
    assert.ok(i >= 0, name + ' must be declared');
    return WORKER.slice(i + 1, WORKER.indexOf('\n}\n', i) + 2);
  };
  // The decision, pinned: these six and no others. A mapper with a boarding
  // branch is not enough (most adapters carry one for words their feed has
  // never been seen to use); the feed must be seen to say it.
  assert.deepEqual(Object.keys(table).sort(), ['IAH', 'MSP', 'SYD', 'YQM', 'YXE', 'ZRH']);
  // Every mapper the table names really can produce a gate word.
  const mappers = (SRC) => {
    const out = [];
    for (const m of SRC.matchAll(/(?:^|\n)(?:const ([A-Z][A-Z0-9_]*_(?:STATUS|STATUS_ENUM)) = \{|function ([a-z][A-Za-z0-9]*Status)\()/g)) {
      const name = m[1] || m[2];
      const body = braceFrom(SRC, m.index + (m[0].startsWith('\n') ? 1 : 0), name);
      if (/["'](?:boarding|gateclosed|final)["']/.test(body)) out.push(name);
    }
    return out;
  };
  const gateMappers = mappers(ROUTER).concat(mappers(WORKER));
  for (const v of Object.values(table)) {
    const named = v.match(/\b(?:[a-z][A-Za-z0-9]*Status|[A-Z][A-Z0-9_]*_(?:STATUS|STATUS_ENUM))\b/g) || [];
    assert.ok(named.length, v);
    for (const n of named) assert.ok(gateMappers.includes(n), n + ' is named in the table but maps no gate word');
  }
  // THE EVIDENCE, airport by airport, on the route the board reads.
  const saysGateWord = (rows) => rows.some((f) => /^(boarding|final|gateclosed)$/.test(f.status));
  // Captures, through the parser each authority handler calls.
  const handler = (ap) => {
    const i = WORKER.indexOf('\n  ' + ap + ': { tz: ');
    assert.ok(i >= 0, ap + ' has an authority handler');
    return WORKER.slice(i, WORKER.indexOf('} },', i));
  };
  assert.match(handler('msp'), /mspParsePage\(/);
  assert.match(wfn('mspParsePage'), /status: mspStatus\(/);
  assert.ok(saysGateWord(W.mspParsePage(fixture('msp-dep-sample.html'), 'dep', Date.parse('2026-09-05T21:10:00-05:00'))), 'MSP');
  assert.match(handler('yxe'), /yxeParsePage\(/);
  assert.match(wfn('yxeParsePage'), /status: yxeStatus\(/);
  assert.ok(saysGateWord(W.yxeParsePage(fixture('yxe-dep-sample.html'), 'dep', Date.parse('2026-09-06T03:00:00-06:00'))), 'YXE');
  assert.match(handler('zrh'), /zrhParseFeed\(/);
  assert.match(wfn('zrhParseFeed'), /status: zrhStatus\(/);
  assert.ok(saysGateWord(W.zrhParseFeed(fixture('zrh-sample-2026-09-06.json'), 'dep', Date.parse('2026-09-06T12:00:00+02:00'))), 'ZRH');
  // Sightings recorded with the adapter or its test.
  assert.match(handler('iah'), /parseIahFeed\(/);
  assert.match(wfn('parseIahFeed'), /status: iahStatus\(r\)/);
  assert.match(testFile('iah-feed.test.js'), /seen in the 2026-09-05 unfiltered capture: TK34 "BRD @ 830PM"/);
  assert.match(handler('syd'), /sydParseFeed\(/);
  assert.match(wfn('sydParseFeed'), /status: sydStatus\(r\.status\)/);
  assert.match(WORKER, /Boarding, Final\n\/\/ {4}Call, Gate Closed and Diverted in archived daytime captures/);
  assert.match(fnIn(ROUTER, 'yqmToAdbFlight'), /status: yqmStatus\(f\.status\)/);
  assert.match(testFile('gate-map-apron.test.js'), /feed's own words are what cyqm\.ca prints \("Arrived at 10:27 AM", "Boarding",/);
  // The worker airports reach the board through the authority handler, not a
  // route of their own in feed-router.js.
  for (const ap of ['MSP', 'YXE', 'ZRH', 'IAH', 'SYD']) assert.doesNotMatch(ROUTER, new RegExp("iata === '" + ap + "'"), ap);
  // NOT strict, with the reason in the adapter's own notes: a vocabulary
  // without a gate word.
  assert.match(ROUTER, /Vocabulary counted off the live boards: "On Time", "Delayed", "Cancelled",\n\/\/ "Departed", "Arrived", "En Route"/, 'LGA / EWR / JFK');
  assert.match(ROUTER, /The real vocabulary, counted off the live board: "On Time", "Departed H:MMP",/, 'MIA');
  assert.match(ROUTER, /status vocabulary: On time \/ Delayed \/ Delayed \(Estimated\) \/ Cancelled \/\n\/\/ Arrived/, 'YHU');
  assert.match(WORKER, /Status vocabulary seen live: Scheduled \/ On Time \/ Departed \/ Arrived \/\n\/\/ In Flight \/ InGate\./, 'SLC');
  assert.match(WORKER, /Gate-side words \(not yet seen here/, 'YKA');
  assert.match(WORKER, /the live feed has shown only "On Time" and "Early"/, 'YMM');
  assert.match(WORKER, /Statuses seen live: On Time, Late, Delayed, Departed/, 'YXS');
  assert.match(WORKER, /Statuses seen: On Time \/ Late \/ Cancelled\./, 'YZF');
  assert.match(WORKER, /Status \(only "OnTime" seen;/, 'YQX');
  // Salt Lake City, measured: every departure inside its boarding window in
  // the capture reads Scheduled.
  const SLC_NOW = Date.parse('2026-09-05T20:15:00-06:00');
  const slcIn = W.slcParsePage(fixture('slc-dep-sample.html'), 'dep', SLC_NOW).filter((f) => {
    const ts = Date.parse(f.departure.scheduledTime.utc.replace(' ', 'T').replace('+00:00', 'Z'));
    return ts > SLC_NOW && ts - SLC_NOW <= 35 * MIN;
  });
  assert.equal(slcIn.length, 12);
  assert.deepEqual([...new Set(slcIn.map((f) => f.status))], ['scheduled']);
  const jfkWords = new Set([...fixture('jfk-dep-sample.json').matchAll(/"status":"([^"]*)"/g)].map((m) => m[1]));
  assert.deepEqual([...jfkWords].sort(), ['Arrived', 'Cancelled', 'Delayed', 'Departed', 'On Time']);
  assert.doesNotMatch(fixture('yhz-departures-sample.html'), /board|final call|gate closed/i, 'Halifax says none of the words');
  // Movement words only, times only, unseen, or (Orlando) a route whose mapper
  // has no gate word: the schedule boarding.
  for (const ap of ['YHZ', 'YOW', 'YUL', 'YYC', 'YEG', 'YVR', 'BOS', 'DEN', 'ORD', 'SFO', 'LHR', 'JFK', 'CLT', 'LAS', 'KEF',
    'LGA', 'EWR', 'MIA', 'YHU', 'SLC', 'YKA', 'YMM', 'YXS', 'YZF', 'YQX', 'MCO',
    'TPA', 'YYZ', 'YTZ', 'HBA', 'MCI', 'RDU', 'DCA', 'IAD', 'YYG', '']) {
    assert.equal(E._feedSaysGateWords(ap), false, ap || '(none)');
  }
  for (const ap of ['YQM', 'yqm', 'MSP', 'YXE', 'ZRH', 'IAH', 'SYD']) assert.equal(E._feedSaysGateWords(ap), true, ap);
  // An explicit table, not a guess from the day's rows.
  assert.doesNotMatch(fn('_feedSaysGateWords') + fn('_schedBoardingOn') + fn('_schedBoardingWindow'), /data\.dep|\.some\(|\.filter\(/);
});

test('(D) Orlando: the board reads /flights/mco, whose mapper turns Boarding and Last Call into scheduled, so MCO gets the schedule boarding', () => {
  const WORKER = fs.readFileSync(workerPath, 'utf8');
  // The board's MCO route: feed-router fetches /flights/mco and never falls
  // through; the worker answers it with handleMcoFids -> mcoToAdbFlight -> mcoStatus.
  const branch = ROUTER.slice(ROUTER.indexOf("if (iata === 'MCO') {"), ROUTER.indexOf("if (iata === 'MCO') {") + 1200);
  assert.match(branch, /\/flights\/mco\?direction=\$\{dir\}/);
  assert.match(fnIn(WORKER, 'handleMcoFids'), /const adb = mcoToAdbFlight\(f\);/);
  assert.match(fnIn(WORKER, 'mcoToAdbFlight'), /status: mcoStatus\(f\)/);
  const mcoStatus = new Function(fnIn(WORKER, 'mcoStatus') + '\nreturn mcoStatus;')();
  for (const row of [{ originalStatus: 'BD', status: 'Boarding' }, { originalStatus: 'LC', status: 'Last Call' },
    { originalStatus: 'BD' }, { originalStatus: 'LC' }, { status: 'Boarding' }, { status: 'Final Call' }, { status: 'Gate Closed' }]) {
    assert.ok(!/^(boarding|final|gateclosed)$/.test(mcoStatus(row)), JSON.stringify(row));
  }
  // The authority-window enum that names BD and LC is read by mcoParseFeed only.
  assert.equal((WORKER.match(/MCO_AUTH_STATUS\[/g) || []).length, 1);
  assert.match(fnIn(WORKER, 'mcoParseFeed'), /MCO_AUTH_STATUS\[code\]/);
  assert.equal(engine()._feedSaysGateWords('MCO'), false);
});

test('(D) Halifax AC2057: Boarding on the gate and the board from its printed boarding time to its departure, then no claim', async () => {
  const { E, raw } = await yhzEngine();
  const at = (hh, mm) => {
    const t = H(5, hh, mm);
    const r = find(mapRows(E, raw.dep, 'dep', t), 'AC2057');
    return { t, r, board: E._fidsShownRow(r, t, 'YHZ'), door: E._gateDoorFor(r, t, 'YHZ') };
  };
  const first = at(4, 0);
  assert.equal(first.r.gate, '16');
  assert.equal(first.r._aircraftCode, '');
  // The boarding time the gate prints (_gateBoardingTimes): 05:15 less the
  // 35-minute narrowbody lead. The same time the door opens on.
  const bt = E._gateBoardingTimes(first.r, '', null, E.data.arr, 'America/Halifax');
  assert.equal(hmAdt(bt.boardTs), '04:40');
  assert.equal(hmAdt(first.door.bt.boardTs), '04:40');
  const sign = (x) => E._gateSignPhase(x.door.word || x.r.status, Math.round((x.r._sortTs - x.t) / MIN), x.door.bt.lead, x.r, false);
  // Boarding-time minus one: nothing yet. The countdown is the airline's
  // forecast and runs as before.
  const m1 = at(4, 39);
  assert.equal(m1.board, m1.r, 'the board shows the row as it is');
  assert.equal(m1.board.status, 'ontime');
  assert.equal(m1.door.word, '');
  assert.equal(sign(m1).showBoarding, false);
  assert.equal(sign(m1).showCountdown, true);
  // Plus one, and one minute before the departure: Boarding on both screens.
  for (const x of [at(4, 41), at(5, 14)]) {
    assert.equal(x.board.status, 'boarding');
    assert.equal(boardText(x.board, 'en'), 'Boarding');
    assert.equal(boardText(x.board, 'fr'), 'Embarquement');
    assert.equal(x.door.word, 'boarding');
    assert.equal(x.door.kept, false);
    const p = sign(x);
    assert.equal(p.showBoarding, true);
    assert.equal(p.boardActive, true);
    assert.equal(p.showCountdown, false);
    assert.equal(p.isFinalCallStatus, false);
    assert.equal(p.isGateClosedStatus, false);
    assert.equal(x.r.status, 'ontime', 'the row itself keeps the airport\'s word');
  }
  // At the departure time and five minutes on: no claim, on either screen.
  for (const x of [at(5, 15), at(5, 20)]) {
    assert.equal(x.board, x.r);
    assert.equal(x.board.status, 'ontime');
    assert.equal(boardText(x.board, 'en'), 'On time');
    assert.equal(x.door.word, '');
    assert.equal(sign(x).showBoarding, false);
    assert.equal(sign(x).finalActive, false);
  }
  // Every minute from 04:00 to 05:40: the two screens agree, and only inside
  // [04:40, 05:15).
  for (let t = H(5, 4, 0); t <= H(5, 5, 40); t += MIN) {
    const r = find(mapRows(E, raw.dep, 'dep', t), 'AC2057');
    const onBoard = E._fidsShownRow(r, t, 'YHZ').status === 'boarding';
    const onGate = E._gateDoorFor(r, t, 'YHZ').word === 'boarding';
    assert.equal(onBoard, onGate, hmAdt(t));
    assert.equal(onBoard, t >= H(5, 4, 40) && t < H(5, 5, 15), hmAdt(t));
  }
});

test('(D) Halifax F8655, delayed with a new time: the boarding window moves with it', async () => {
  const { E, raw } = await yhzEngine();
  const at = (d, hh, mm) => {
    const t = H(d, hh, mm);
    const r = find(mapRows(E, raw.dep, 'dep', t), 'F8655');
    return { t, r, board: E._fidsShownRow(r, t, 'YHZ').status, door: E._gateDoorFor(r, t, 'YHZ').word };
  };
  const x = at(4, 22, 0);
  assert.equal(x.r.status, 'delayed');
  assert.equal(x.r.time, '23:00');
  assert.equal(x.r.upd, '23:30');
  assert.equal(hmAdt(E._gateDoorFor(x.r, x.t, 'YHZ').bt.boardTs), '22:55');
  // Inside the window the schedule alone would have given (22:25-23:00): no.
  for (const [hh, mm] of [[22, 30], [22, 54]]) {
    const y = at(4, hh, mm);
    assert.equal(y.board, 'delayed', `${hh}:${mm}`);
    assert.equal(y.door, '', `${hh}:${mm}`);
  }
  // 22:55 to 23:30, past the 23:00 it was due: Boarding on both.
  for (const [hh, mm] of [[22, 56], [23, 10], [23, 29]]) {
    const y = at(4, hh, mm);
    assert.equal(y.board, 'boarding', `${hh}:${mm}`);
    assert.equal(y.door, 'boarding', `${hh}:${mm}`);
  }
  // From the new departure time: the airport's Delayed again.
  for (const [hh, mm] of [[23, 30], [23, 35]]) {
    const y = at(4, hh, mm);
    assert.equal(y.board, 'delayed', `${hh}:${mm}`);
    assert.equal(y.door, '', `${hh}:${mm}`);
  }
});

test('(D) no schedule boarding on a Delayed with no new time, a Cancelled or a Departed, and never Final call or Gate closed', async () => {
  const { E, raw } = await yhzEngine();
  const sweep = (rows, number, from, to) => {
    const seen = new Set();
    for (let t = from; t <= to; t += MIN) {
      const r = find(mapRows(E, rows, 'dep', t), number);
      const b = E._fidsShownRow(r, t, 'YHZ');
      const d = E._gateDoorFor(r, t, 'YHZ');
      seen.add(b.status + '/' + (d.word || '-'));
    }
    return [...seen].sort();
  };
  const timeless = alter(raw.dep, 'F8655', (f) => { delete f.departure.revisedTime; return f; });
  assert.deepEqual(sweep(timeless, 'F8655', H(4, 21, 0), H(5, 0, 30)), ['delayed/-']);
  assert.deepEqual(sweep(raw.dep, 'AC7672', H(5, 6, 0), H(5, 9, 0)), ['cancelled/-']);
  const departed = alter(raw.dep, 'AC2057', (f) => { f.status = 'departed'; return f; });
  assert.deepEqual(sweep(departed, 'AC2057', H(5, 4, 0), H(5, 5, 40)), ['departed/-']);
  const diverted = alter(raw.dep, 'AC2057', (f) => { f.status = 'diverted'; return f; });
  assert.deepEqual(sweep(diverted, 'AC2057', H(5, 4, 0), H(5, 5, 40)), ['diverted/-']);
  // A wheels-up (an actual time on the row's own leg) ends it at once.
  const up = alter(raw.dep, 'AC2057', (f) => { f.departure.runwayTime = { local: '2026-09-05 04:58:00-03:00', utc: '2026-09-05 07:58:00+00:00' }; return f; });
  const rUp = find(mapRows(E, up, 'dep', H(5, 5, 0)), 'AC2057');
  assert.equal(rUp.status, 'departed');
  assert.equal(E._gateDoorFor(rUp, H(5, 5, 0), 'YHZ').word, '');
  // Every Halifax row and every Moncton row, every five minutes for three
  // hours either side: the board shows the row's own word or Boarding, the
  // gate's door word is '' or Boarding, and Moncton never gets the schedule.
  const sets = [['YHZ', mapRows.bind(null, E, raw.dep, 'dep')],
    ['YQM', mapRows.bind(null, E, adb(YQM.dep28, 'Departure'), 'dep')],
    ['YQM', mapRows.bind(null, E, adb(YQM.dep30, 'Departure'), 'dep')]];
  let n = 0;
  for (const [ap, rowsAt] of sets) {
    for (const r0 of rowsAt(YHZ_NOW)) {
      for (let t = r0._sortTs - 180 * MIN; t <= r0._sortTs + 180 * MIN; t += 5 * MIN) {
        const r = rowsAt(t).find((x) => x.flight === r0.flight && x._sortTs === r0._sortTs);
        const b = E._fidsShownRow(r, t, ap);
        const d = E._gateDoorFor(r, t, ap);
        n++;
        assert.ok(b === r || b.status === 'boarding', `${ap} ${r.flight} board ${b.status}`);
        assert.ok(d.word === '' || d.word === 'boarding', `${ap} ${r.flight} door ${d.word}`);
        assert.ok(!/^(final|finalcall|gateclosed|departed|arrived|landed)$/.test(b === r ? '' : b.status));
        if (ap === 'YQM') { assert.equal(b, r, `${r.flight}: Moncton is strict`); assert.equal(d.word, ''); }
      }
    }
  }
  assert.ok(n > 2000, String(n));
  // Final call and Gate closed are made by nothing here.
  for (const name of ['_schedBoardingOn', '_fidsShownRow', '_gateDoor', '_gateBoardingTimes']) {
    assert.doesNotMatch(fn(name), /'(?:final|finalcall|gateclosed|departed|arrived|landed)'/, name);
  }
});

test('(D) the schedule boarding is marked clock-made, and the maps, the hold and the memory never see it', async () => {
  const { E, raw } = await yhzEngine();
  const t = H(5, 5, 0);
  E.data.dep = mapRows(E, raw.dep, 'dep', t);
  const r = find(E.data.dep, 'AC2057');
  const before = JSON.stringify(E.data.dep);
  const shown = E._fidsShownRow(r, t, 'YHZ');
  assert.notEqual(shown, r, 'a copy');
  assert.equal(shown.status, 'boarding');
  assert.equal(shown._stInferred, true);
  assert.equal(shown._stExplicit, false);
  assert.equal(shown._schedBoarding, true);
  for (let i = 0; i < 5; i++) { E._fidsShownRow(r, t + i * MIN, 'YHZ'); E._gateDoorFor(r, t + i * MIN, 'YHZ'); }
  assert.equal(JSON.stringify(E.data.dep), before, 'the board\'s data keeps the airport\'s word');
  // The maps' evidence refuses it exactly as it refuses any clock-made word.
  assert.equal(E._gateRawStatus(shown), '');
  assert.equal(E._gateOutboundAtGate(shown), false);
  assert.equal(E._gateOutboundAtGate(r), false);
  // The memory of what the airport said never records it.
  E._gateDepsSeen(E.data.dep, 'YHZ', t);
  assert.equal(r._doorSaid, undefined);
  // Only the departures board's row builder asks for the shown row; the map,
  // the pick, the hold and the row placement read data.dep as it is.
  assert.equal((CORE.match(/_fidsShownRow\(/g) || []).length, 3, 'the definition, render() and the templates\' window.fidsShownRow');
  assert.match(CORE, /window\.fidsShownRow = function \(f\) \{ return _fidsShownRow\(f, Date\.now\(\), _pageAirport\(\)\); \};/);
  const rs = CORE.lastIndexOf('function render() {');
  const renderSrc = CORE.slice(rs, CORE.indexOf('\nfunction ', rs + 10));
  assert.ok(renderSrc.length > 5000, 'render() sliced');
  assert.match(renderSrc, /const _fs {7}= isDep \? _fidsShownRow\(f, nowTs, _apUpBoard\) : f;/);
  assert.match(renderSrc, /window\.fidsNormStatus\(_fs\.status\)/);
  assert.match(renderSrc, /window\.fidsFormatStatus\(_fs, lang\)/);
  // The gate's door word is asked by the gate only: its paint, its two render
  // keys and its one-second clock.
  assert.equal((CORE.match(/_gateDoorFor\(/g) || []).length, 5, 'the definition, the dedicated key, the gate key, the clock, the phone-width gate');
  assert.equal((CORE.match(/[^.\w]_gateDoor\(/g) || []).length, 3, 'the definition, _gateDoorFor and uxgGateHtml');
});

test('(D) the hour-long hold is the airport\'s word only: a schedule Boarding leaves on the ordinary grace', async () => {
  const { E, raw } = await yhzEngine();
  const rowsAt = (t) => mapRows(E, raw.dep, 'dep', t);
  const r = find(rowsAt(H(5, 5, 0)), 'AC2057');
  const shown = E._fidsShownRow(r, H(5, 5, 0), 'YHZ');
  assert.equal(shown.status, 'boarding');
  // The gate: AC2057's own +10, as before v23925, whatever the board showed.
  E.data.dep = rowsAt(H(5, 5, 24));
  assert.equal(E._gateFlightsAt('16', H(5, 5, 24))[0].flight, 'AC2057');
  E.data.dep = rowsAt(H(5, 5, 26));
  assert.ok(!E._gateFlightsAt('16', H(5, 5, 26)).some((f) => f.flight === 'AC2057'));
  assert.equal(E._gateFlightLive(shown, H(5, 5, 26)), false, 'even the shown copy holds nothing');
  assert.equal(E._gateFlightLive(Object.assign({}, shown, { _stInferred: false }), H(5, 5, 26)), true,
    'the same word from the airport would hold it');
  // The board: the half-hour trail, not the gate's hour.
  assert.equal(E._fidsBoardRowPlace(find(rowsAt(H(5, 5, 44)), 'AC2057'), H(5, 5, 44)), 'live');
  assert.equal(E._fidsBoardRowPlace(find(rowsAt(H(5, 5, 46)), 'AC2057'), H(5, 5, 46)), '');
});

test('(D) a quiet morning at Moncton: no Boarding before cyqm.ca says it, then the airport\'s word', () => {
  const E = engine();
  // AC1983 05:25 gate 1, the first wave. Nothing on the board has said
  // Boarding yet today; Moncton is strict by the table, not by the morning.
  for (const [hh, mm] of [[4, 40], [4, 55], [5, 0], [5, 10], [5, 20], [5, 24]]) {
    const t = T(9, 29, hh, mm);
    const rows = deps(E, YQM.dep28, t);
    assert.ok(!rows.some((f) => /board|final|closed/.test(f.status)), 'a quiet morning');
    const r = find(rows, 'AC1983', 29);
    assert.equal(r.status, 'ontime', `${hh}:${mm}`);
    assert.equal(E._fidsShownRow(r, t, 'YQM'), r, `${hh}:${mm}: On time on the board`);
    const d = E._gateDoorFor(r, t, 'YQM');
    assert.equal(d.word, '', `${hh}:${mm}: no sign`);
    assert.equal(E._gateSignPhase(r.status, Math.round((r._sortTs - t) / MIN), d.bt.lead, r, false).showBoarding, false);
  }
  // cyqm.ca says Boarding: the sign opens on the airport's word.
  const t = T(9, 29, 5, 0);
  const r = find(deps(E, said(YQM.dep28, 'AC1983', 29, 'Boarding'), t), 'AC1983', 29);
  assert.equal(r.status, 'boarding');
  assert.equal(E._gateDoorFor(r, t, 'YQM').word, '', 'the flight\'s own word opens it');
  assert.equal(E._gateSignPhase(r.status, 25, 35, r, false).showBoarding, true);
});

test('(D) Moncton AC1983 delayed while boarding: the sign keeps running, the departure moves, the gate keeps the flight', () => {
  const storage = makeStorage();
  const g = engine({ storage });
  // 05:00 — cyqm.ca says Boarding; the gate paints (renderDedicatedScreen runs
  // _gateDepsSeen before the build).
  const t0 = T(9, 29, 5, 0);
  g.data.dep = deps(g, said(YQM.dep28, 'AC1983', 29, 'Boarding'), t0);
  g._gateDepsSeen(g.data.dep, 'YQM', t0);
  const r0 = find(g.data.dep, 'AC1983', 29);
  assert.equal(r0.gate, '1');
  assert.deepEqual(r0._doorSaid, { w: 'boarding', rev: null, upd: null, gate: '1' });
  const d0 = g._gateDoorFor(r0, t0, 'YQM');
  const sign0 = g._gateSignPhase(r0.status, 25, d0.bt.lead, r0, false);
  assert.equal(sign0.showBoarding, true);
  assert.equal(hmAdt(d0.bt.boardTs), '04:50');
  assert.equal(g._boardStripStatusKey(r0, 'boarding', 25), 'ontime');

  // 05:20 — "Delayed until 5:50 AM". A fresh map, as every feed refresh is.
  const delayed = said(YQM.dep28, 'AC1983', 29, 'Delayed until 5:50 AM', '5:50 AM');
  const t1 = T(9, 29, 5, 20);
  g.data.dep = deps(g, delayed, t1);
  const r1 = find(g.data.dep, 'AC1983', 29);
  assert.equal(r1.status, 'delayed');
  assert.equal(r1.upd, '05:50');
  assert.equal(r1._doorSaid, undefined, 'a fresh copy');
  // The render key is worked out before the paint runs _gateDepsSeen: the
  // memory answers it anyway.
  const k1 = g._gateDoorFor(r1, t1, 'YQM');
  assert.equal(k1.word, 'boarding');
  assert.equal(k1.kept, true);
  g._gateDepsSeen(g.data.dep, 'YQM', t1);
  assert.deepEqual(r1._doorSaid, { w: 'boarding', rev: null, upd: null, gate: '1' }, 'carried onto the fresh copy');
  const d1 = g._gateDoorFor(r1, t1, 'YQM');
  // The sign: unchanged — NOW BOARDING, no countdown, no switch to final call.
  const signMins = Math.round(((d1.basis._revTs || d1.basis._sortTs) - t1) / MIN);
  assert.equal(signMins, 5, 'the sign keeps the clock it was opened on');
  assert.deepEqual(g._gateSignPhase(d1.word, signMins, d1.bt.lead, d1.basis, false), sign0);
  // The boarding time it printed: unchanged, nothing struck through.
  assert.equal(d1.bt.boardTs, d0.bt.boardTs);
  assert.equal(d1.bt.depDelayed, false);
  // No Delayed on the sign: its status flanks are empty.
  assert.equal(g._boardStripStatusKey(r1, 'boarding', 30, d1.kept), '');
  assert.equal(g._boardStripStatusKey(r1, 'boarding', 30), 'delayed', 'which they would not be without the memory');
  // The Departure field moves to 05:50: it reads the real row.
  assert.deepEqual(g._gateDepDisplayState(r1), { stKey: 'delayed', depDelayed: true, revTsLater: true });
  assert.ok(UXG.indexOf('var depTimeHtml = _to12h(currentFlight.time)') < UXG.indexOf('var _door = _gateDoor('));
  assert.match(UXG, /if \(_door\.word\) \{\s*stKey = _door\.word;\s*stLabel = SL\(stKey\) \|\| stKey\.toUpperCase\(\);\s*if \(_door\.kept\) \{\s*_signDepTs = _door\.basis\._revTs \|\| _door\.basis\._sortTs \|\| effectiveDepTs;\s*if \(_signDepTs\) minsToDep = Math\.round\(\(_signDepTs - Date\.now\(\)\) \/ 60000\);/);
  assert.match(UXG, /\} else if \(depDelayed && !showBoarding\) \{/);
  // The departures board prints the airport's own Delayed and its new time.
  assert.equal(g._fidsShownRow(r1, t1, 'YQM'), r1);
  assert.equal(boardText(r1, 'en'), 'Delayed');
  assert.equal(boardText(r1, 'fr'), 'En retard');
  // The gate keeps the flight: past 05:35, when the old ten minutes ended,
  // up to 05:50 + 10.
  for (const [hh, mm] of [[5, 40], [5, 59]]) assert.equal(g._gateFlightsAt('1', T(9, 29, hh, mm))[0].flight, 'AC1983', `${hh}:${mm}`);
  assert.ok(!g._gateFlightsAt('1', T(9, 29, 6, 1)).some((f) => f.flight === 'AC1983'), '06:01');
  // Departed frees the gate and ends the sign.
  const t2 = T(9, 29, 5, 53);
  g.data.dep = deps(g, said(delayed, 'AC1983', 29, 'Departed at 5:52 AM', '5:52 AM'), t2);
  g._gateDepsSeen(g.data.dep, 'YQM', t2);
  const r2 = find(g.data.dep, 'AC1983', 29);
  assert.equal(r2.status, 'departed');
  assert.ok(!g._gateFlightsAt('1', t2).some((f) => f.flight === 'AC1983'));
  assert.equal(g._gateDoorFor(r2, t2, 'YQM').word, '');
});

test('(D) delayed while boarding with no new time; the memory survives a reload and stays with its flight and day', () => {
  const storage = makeStorage();
  const g = engine({ storage });
  const t0 = T(9, 29, 5, 0);
  g.data.dep = deps(g, said(YQM.dep28, 'AC1983', 29, 'Boarding'), t0);
  g._gateDepsSeen(g.data.dep, 'YQM', t0);
  // 05:20 — plain "Delayed", no time.
  const timeless = said(YQM.dep28, 'AC1983', 29, 'Delayed', '5:25 AM');
  const t1 = T(9, 29, 5, 20);
  g.data.dep = deps(g, timeless, t1);
  g._gateDepsSeen(g.data.dep, 'YQM', t1);
  const r1 = find(g.data.dep, 'AC1983', 29);
  assert.equal(r1.status, 'delayed');
  assert.equal(r1._revTs, null);
  const d1 = g._gateDoorFor(r1, t1, 'YQM');
  assert.equal(d1.word, 'boarding');
  assert.equal(d1.kept, true);
  assert.equal(g._gateDepDisplayState(r1).depDelayed, false, 'no new time: the Departure field keeps 05:25');
  assert.equal(g._boardStripStatusKey(r1, 'boarding', 5, d1.kept), '');
  // Boarding began at this door, so it keeps running however long the delay:
  // the gate keeps the flight until the airport says it has gone, bounded only
  // by the board's own stop for a row (DEPART_TRAIL_HRS past 05:25 = 08:25).
  // An hour (DELAY_HOLD_MIN) is for a delayed flight that never boarded.
  for (const [hh, mm] of [[5, 40], [6, 26], [7, 30], [8, 24]]) assert.equal(g._gateFlightsAt('1', T(9, 29, hh, mm))[0].flight, 'AC1983', `${hh}:${mm}`);
  assert.equal(g._gateBoardingBeganHere(r1), true);
  assert.ok(!g._gateFlightsAt('1', T(9, 29, 8, 26)).some((f) => f.flight === 'AC1983'), '08:26: the board\'s own stop');
  // The airport saying it has gone frees the gate at once.
  const left = said(YQM.dep28, 'AC1983', 29, 'Departed', '6:40 AM');
  const tl = T(9, 29, 6, 41);
  const gl = engine({ storage: makeStorage() });
  gl.data.dep = deps(gl, said(YQM.dep28, 'AC1983', 29, 'Boarding'), t0);
  gl._gateDepsSeen(gl.data.dep, 'YQM', t0);
  gl.data.dep = deps(gl, left, tl);
  gl._gateDepsSeen(gl.data.dep, 'YQM', tl);
  assert.ok(!gl._gateFlightsAt('1', tl).some((f) => f.flight === 'AC1983'), 'Departed frees the gate');
  // A delayed flight that never boarded still lets go an hour past its schedule.
  const gn = engine({ storage: makeStorage() });
  gn.data.dep = deps(gn, timeless, t1);
  gn._gateDepsSeen(gn.data.dep, 'YQM', t1);
  assert.equal(gn._gateBoardingBeganHere(find(gn.data.dep, 'AC1983', 29)), false);
  assert.equal(gn._gateFlightsAt('1', T(9, 29, 6, 24))[0].flight, 'AC1983', 'never boarded: held to +60');
  assert.ok(!gn._gateFlightsAt('1', T(9, 29, 6, 26)).some((f) => f.flight === 'AC1983'), 'never boarded: gone at +61');

  // A reload: a new page, the same browser storage.
  const saved = JSON.parse(storage.getItem('fids_gate_seen_v1'));
  const key = 'AC1983|' + r1._sortTs;
  assert.deepEqual(saved.YQM.dep[key]._doorSaid, { w: 'boarding', rev: null, upd: null, gate: '1' });
  const g2 = engine({ storage });
  const t2 = T(9, 29, 5, 30);
  g2.data.dep = deps(g2, timeless, t2);
  g2._gateDepsSeen(g2.data.dep, 'YQM', t2);
  const r2 = find(g2.data.dep, 'AC1983', 29);
  assert.equal(g2._gateDoorFor(r2, t2, 'YQM').kept, true, 'the sign comes back up after a reload');

  // Never another day's AC1983: the same number a day later is another key ...
  const tomorrow = Object.assign({}, r2, { _sortTs: r2._sortTs + 86400000, _doorSaid: undefined });
  const dT = g2._gateDoorFor(tomorrow, t2 + 86400000, 'YQM');
  assert.equal(dT.kept, false);
  assert.equal(dT.word, '');
  // ... and the real October 1 AC1983 (gate 4), delayed at 05:20 that day,
  // shows the delay; the September 29 record has expired by then.
  const g3 = engine({ storage });
  const t3 = T(10, 1, 5, 20);
  const oct1 = YQM.dep30.map((r) => (r.flightId === 'AC1983' && r.displayDate === 'Oct 1')
    ? Object.assign({}, r, { status: 'Delayed until 5:50 AM', actualTime: '5:50 AM' }) : r);
  g3.data.dep = deps(g3, oct1, t3);
  g3._gateDepsSeen(g3.data.dep, 'YQM', t3);
  const r3 = find(g3.data.dep, 'AC1983', 1);
  assert.equal(r3.status, 'delayed');
  assert.equal(r3.gate, '4');
  assert.equal(g3._gateDoorFor(r3, t3, 'YQM').word, '');
  assert.ok(!(key in JSON.parse(storage.getItem('fids_gate_seen_v1')).YQM.dep), 'expired after 30 hours');
  // Nor another flight: AC2037 at the same gate that morning never said Boarding.
  const r4 = find(g2.data.dep, 'AC2037', 29);
  assert.equal(g2._gateDoorRecord(r4), null);
});

test('(D) at an airport whose feed never says Boarding, a Delayed shows the delay: the schedule boarding is not evidence', async () => {
  const { E, raw } = await yhzEngine();
  // AC2057 inside its schedule window at 04:50, on the gate and the board.
  const t0 = H(5, 4, 50);
  E.data.dep = mapRows(E, raw.dep, 'dep', t0);
  E._gateDepsSeen(E.data.dep, 'YHZ', t0);
  const r0 = find(E.data.dep, 'AC2057');
  assert.equal(E._gateDoorFor(r0, t0, 'YHZ').word, 'boarding');
  assert.equal(E._gateDoorRecord(r0), null, 'nothing remembers a boarding the airport never said');
  // 05:00, the airport says Delayed with no time: no sign.
  const t1 = H(5, 5, 0);
  const timeless = alter(raw.dep, 'AC2057', (f) => { f.status = 'delayed'; return f; });
  E.data.dep = mapRows(E, timeless, 'dep', t1);
  E._gateDepsSeen(E.data.dep, 'YHZ', t1);
  const r1 = find(E.data.dep, 'AC2057');
  const d1 = E._gateDoorFor(r1, t1, 'YHZ');
  assert.equal(d1.word, '');
  assert.equal(d1.kept, false);
  assert.equal(E._fidsShownRow(r1, t1, 'YHZ'), r1, 'the board prints Delayed');
  assert.equal(E._gateSignPhase(r1.status, 15, 35, r1, false).showBoarding, false);
  assert.equal(E._gateSignPhase(r1.status, 30, 25, r1, false).showCountdown, false, 'and no countdown on a time that will not hold');
  // Delayed to 05:45: the window moves to 05:10-05:45.
  const later = alter(raw.dep, 'AC2057', (f) => {
    f.status = 'delayed';
    f.departure.revisedTime = { local: '2026-09-05 05:45:00-03:00', utc: '2026-09-05 08:45:00+00:00' };
    return f;
  });
  for (const [hh, mm, want] of [[5, 5, ''], [5, 11, 'boarding'], [5, 44, 'boarding'], [5, 45, '']]) {
    const t = H(5, hh, mm);
    const r = find(mapRows(E, later, 'dep', t), 'AC2057');
    assert.equal(E._gateDoorFor(r, t, 'YHZ').word, want, `${hh}:${mm}`);
    assert.equal(E._fidsShownRow(r, t, 'YHZ').status, want || 'delayed', `${hh}:${mm}`);
  }
});

test('(D) delayed flights stay on their gate, at Moncton and at Halifax, on every pick path', async () => {
  const E = engine();
  const gate = (rows, g, t) => { E.data.dep = rows; return E._gateFlightsAt(g, t).map((f) => f.flight); };
  // Moncton AC2037 06:35 gate 1, never boarded, "Delayed until 7:15 AM".
  const withTime = deps(E, said(YQM.dep28, 'AC2037', 29, 'Delayed until 7:15 AM', '7:15 AM'), T(9, 29, 6, 30));
  assert.equal(find(withTime, 'AC2037', 29).upd, '07:15');
  assert.ok(gate(withTime, '1', T(9, 29, 6, 50)).includes('AC2037'), '06:50');
  assert.ok(gate(withTime, '1', T(9, 29, 7, 24)).includes('AC2037'), '07:24');
  assert.ok(!gate(withTime, '1', T(9, 29, 7, 26)).includes('AC2037'), '07:26');
  // "Delayed" with no time: an hour past 06:35, not the old ten minutes.
  const noTime = deps(E, said(YQM.dep28, 'AC2037', 29, 'Delayed', '6:35 AM'), T(9, 29, 6, 30));
  assert.equal(find(noTime, 'AC2037', 29)._revTs, null);
  for (const [hh, mm] of [[6, 50], [7, 34]]) {
    const t = T(9, 29, hh, mm);
    assert.ok(gate(noTime.filter((f) => f.flight !== 'AC7753'), '1', t).includes('AC2037'), `${hh}:${mm}`);
    assert.ok(E._gateLiveGates(noTime.filter((f) => f.flight !== 'AC7753'), t).includes('1'), `${hh}:${mm}: the walking pick`);
  }
  assert.ok(!gate(noTime, '1', T(9, 29, 7, 36)).includes('AC2037'), '07:36');
  // The rule is _gateFlightLive's, which every path asks.
  assert.match(fn('_gateFlightLive'), /st === 'delayed' && !_gateDelayHasTime\(f\) && f\._sortTs && !_gateDepLeft\(f, now\)\) \{(?:\s*\/\/[^\n]*\n)*\s*if \(_gateBoardingBeganHere\(f\)\) return \(now - f\._sortTs\) <= DEPART_TRAIL_HRS \* 3600000;\s*return \(now - f\._sortTs\) <= DELAY_HOLD_MIN \* 60000;/);
  assert.match(fn('_gateLiveGates'), /if \(!_gateFlightLive\(f, now\)\) return;/);

  // Halifax F8655 23:00 gate 18: delayed to 23:30, and with no time.
  const { raw } = await yhzEngine();
  const yd = mapRows(E, raw.dep, 'dep', YHZ_NOW);
  assert.ok(gate(yd, '18', H(4, 23, 39)).includes('F8655'));
  assert.ok(!gate(yd, '18', H(4, 23, 41)).includes('F8655'));
  const yt = mapRows(E, alter(raw.dep, 'F8655', (f) => { delete f.departure.revisedTime; return f; }), 'dep', YHZ_NOW);
  for (const t of [H(4, 23, 20), H(4, 23, 59)]) assert.ok(gate(yt, '18', t).includes('F8655'), hmAdt(t));
  assert.ok(!gate(yt, '18', H(5, 0, 1)).includes('F8655'));
});

test('(D) a delayed flight gives its gate to a later flight the airport is boarding there, and gets it back', () => {
  const E = engine();
  const list = (rows, t) => { E.data.dep = rows; return E._gateFlightsAt('1', t).map((f) => f.flight); };
  // AC1983 05:25 "Delayed" (no time), AC2037 06:35 on gate 1.
  const base = said(YQM.dep28, 'AC1983', 29, 'Delayed', '5:25 AM');
  const t = (hh, mm) => T(9, 29, hh, mm);
  assert.equal(list(deps(E, base, t(5, 50)), t(5, 50))[0], 'AC1983', 'AC2037 not boarding: AC1983 keeps gate 1');
  // AC2037 boarding at 05:50: it takes the gate, and the walking pick still lands on gate 1.
  const boarding = said(base, 'AC2037', 29, 'Boarding');
  assert.equal(list(deps(E, boarding, t(5, 30)), t(5, 30))[0], 'AC1983', 'inside AC1983\'s own grace the grace comes first');
  const l1 = list(deps(E, boarding, t(5, 50)), t(5, 50));
  assert.equal(l1[0], 'AC2037');
  assert.ok(!l1.includes('AC1983'));
  assert.ok(E._gateLiveGates(E.data.dep, t(5, 50)).includes('1'));
  // AC2037 departs at 06:00: AC1983, still delayed, is gate 1's flight again.
  const gone = said(boarding, 'AC2037', 29, 'Departed at 6:00 AM', '6:00 AM');
  assert.equal(list(deps(E, gone, t(6, 5)), t(6, 5))[0], 'AC1983');
  // A later flight's time coming is not a yield for a delayed flight:
  // AC1983 delayed to 07:00 stays first past AC2037's 06:35.
  const longDelay = said(YQM.dep28, 'AC1983', 29, 'Delayed until 7:00 AM', '7:00 AM');
  assert.equal(list(deps(E, longDelay, t(6, 40)), t(6, 40))[0], 'AC1983');
  // Cancelled and Diverted free the gate at once.
  for (const word of ['Cancelled', 'Diverted']) {
    const rows = deps(E, said(YQM.dep28, 'AC1983', 29, word), t(5, 0));
    assert.ok(!list(rows, t(5, 0)).includes('AC1983'), word);
    assert.equal(E._gateFlightLive(find(rows, 'AC1983', 29), t(5, 0)), false, word);
  }
});

test('(D) the gate opens and closes the schedule boarding on its minute, and its keys carry the door word', () => {
  // render() runs on feed refreshes; the schedule boarding opens with nothing
  // in the feed changing. The once-a-second clock asks for one rebuild when
  // the painted door word is out of date.
  const time = CORE.slice(CORE.indexOf('function updateDedicatedTimeOnly()'), CORE.indexOf('// ── GATE SCREEN HELPERS'));
  assert.match(time, /if \(cf && _pd && _pd\.k === _gateRowKey\(cf\)\) \{\s*const _dw = _gateDoorFor\(cf, _nowMs3, iata\)\.word;\s*if \(_dw !== _pd\.w\) \{ _pd\.w = _dw; requestGateRebuild\(\); \}/);
  assert.match(UXG, /window\._gatePaintedDoor = \{ k: _gateRowKey\(currentFlight\), w: _door\.word \};/);
  const key = CORE.slice(CORE.indexOf('function getDedicatedRenderKey()'), CORE.indexOf("if (screenType === 'baggage')", CORE.indexOf('function getDedicatedRenderKey()')));
  assert.match(key, /door:_gateDoorFor\(first, _nowMs2, iata\)\.word/);
  const gk = line(CORE, /var _computeGateKey = function \(\) \{[\s\S]*?\n\s*\};/, '_computeGateKey');
  assert.match(gk, /\+ '\|' \+ _gateDoorFor\(currentFlight, Date\.now\(\), iata\)\.word;/);
  // The rail's Status shelf says what the sign says.
  assert.match(UXG, /_doorWord: _door\.word,/);
  assert.match(fn('_buildV2AircraftCol'), /var _stk = String\(\(vars && vars\._doorWord\) \|\| \(currentFlight && currentFlight\.status\) \|\| ''\)/);
});

// ════════════════════════════════════════════════════════════════════════════
// (D) v23925 — REVIEW FIXES: an Early departure, one lead on both screens, the
//     gate and the board agreeing on a shared gate, a Delayed flight yielding
//     only to a flight still at the door, and the kept sign's three limits.
// ════════════════════════════════════════════════════════════════════════════

const pad2 = (n) => String(n).padStart(2, '0');
// A Halifax departure the capture does not hold: AC2057's row under another
// number, time and destination (the parser's own shape).
function yhzAdd(rows, number, d, hh, mm, dest) {
  const f = JSON.parse(JSON.stringify(rows.find((r) => r.number === 'AC2057')));
  f.number = number;
  f.departure.scheduledTime = {
    local: `2026-09-${pad2(d)} ${pad2(hh)}:${pad2(mm)}:00-03:00`,
    utc: new Date(H(d, hh, mm)).toISOString().slice(0, 19).replace('T', ' ') + '+00:00'
  };
  delete f.departure.revisedTime;
  f.status = 'scheduled';
  f.arrival.airport = Object.assign({}, f.arrival.airport, { iata: dest });
  return rows.concat([f]);
}
// Every minute: does the departures board say this flight is Boarding, and
// does its gate show it with NOW BOARDING? The gate pick asked with the
// airport, as the departures board asks it.
function screensAt(E, rows, gate, t, ap) {
  E.data.dep = mapRows(E, rows, 'dep', t);
  const list = E._gateFlightsAt(gate, t, ap);
  const first = list[0] || null;
  // The word the gate's sign opens on: the door word, or the flight's own.
  const door = first ? (E._gateDoorFor(first, t, ap).word || first.status) : '';
  const out = {};
  for (const r of E.data.dep.filter((x) => x.gate === gate)) {
    out[r.flight] = {
      board: E._fidsShownRow(r, t, ap).status,
      gate: !!first && first.flight === r.flight && door === 'boarding',
      first: first ? first.flight : ''
    };
  }
  return out;
}

test('(D) an Early departure opens its schedule boarding on its revised time, the same morning', async () => {
  const { E, raw } = await yhzEngine();
  // Halifax AC2057 05:15 revised to 05:05 (Early): Boarding 04:30 to 05:05.
  const early = alter(raw.dep, 'AC2057', (f) => {
    f.departure.revisedTime = { local: '2026-09-05 05:05:00-03:00', utc: '2026-09-05 08:05:00+00:00' };
    return f;
  });
  const r0 = find(mapRows(E, early, 'dep', H(5, 4, 0)), 'AC2057');
  assert.equal(r0.status, 'early');
  assert.equal(r0.upd, '05:05');
  const bt = E._gateDoorFor(r0, H(5, 4, 0), 'YHZ').bt;
  assert.equal(new Date(bt.boardTs).toISOString(), '2026-09-05T07:30:00.000Z', '04:30 that morning, not the next');
  assert.equal(bt.effDepForBoard, r0._revTs);
  for (let t = H(5, 4, 0); t <= H(5, 5, 40); t += MIN) {
    const r = find(mapRows(E, early, 'dep', t), 'AC2057');
    const onBoard = E._fidsShownRow(r, t, 'YHZ').status === 'boarding';
    const onGate = E._gateDoorFor(r, t, 'YHZ').word === 'boarding';
    assert.equal(onBoard, onGate, hmAdt(t));
    assert.equal(onBoard, t >= H(5, 4, 30) && t < H(5, 5, 5), hmAdt(t));
  }
  // O'Hare UA3750, the capture's own early row: 02:11 estimated 01:52.
  const W = await import(workerPath);
  const ORD_NOW = Date.parse('2026-09-04T00:30:00-05:00');
  const ordRaw = W.ordParseFeed(fixture('ord-sample.json'), 'dep', ORD_NOW);
  const C = (hh, mm) => Date.parse(`2026-09-04T${pad2(hh)}:${pad2(mm)}:00-05:00`);
  const u0 = mapRows(E, ordRaw, 'dep', ORD_NOW).find((r) => r.flight === 'UA3750');
  assert.equal(u0.status, 'early');
  assert.equal(u0.upd, '01:52');
  let opened = 0;
  for (let t = C(0, 50); t <= C(2, 20); t += MIN) {
    const r = mapRows(E, ordRaw, 'dep', t).find((x) => x.flight === 'UA3750');
    const onBoard = E._fidsShownRow(r, t, 'ORD').status === 'boarding';
    assert.equal(E._gateDoorFor(r, t, 'ORD').word === 'boarding', onBoard, 'ORD ' + t);
    assert.equal(onBoard, t >= C(1, 17) && t < C(1, 52), 'ORD ' + new Date(t).toISOString());
    if (onBoard) opened++;
  }
  assert.equal(opened, 35);
  // A real midnight crossing still wraps: 23:50 revised to 00:20 is thirty
  // minutes late, and 00:10 revised to 23:55 the evening before is fifteen early.
  const late = { status: 'delayed', time: '23:50', upd: '00:20', _sortTs: H(4, 23, 50), _revTs: H(5, 0, 20) };
  assert.equal(E._gateBoardingTimes(late, '', null, [], 'America/Halifax').effDepForBoard, H(5, 0, 20));
  const earlyOver = { status: 'early', time: '00:10', upd: '23:55', _sortTs: H(5, 0, 10), _revTs: H(4, 23, 55) };
  assert.equal(E._gateBoardingTimes(earlyOver, '', null, [], 'America/Halifax').effDepForBoard, H(4, 23, 55));
});

test('(D) one boarding time on both screens: the lead reads the feed\'s own aircraft type, not one only the gate has resolved', async () => {
  const { E, raw } = await yhzEngine();
  // The gate resolved a Dash 8-400 for AC2057 (its lookups write the type onto
  // its own copy of the row, and into window._ACRES); Halifax's feed names no
  // aircraft, so the departures board never has it. uxgGateHtml passes the
  // resolved type (equipRaw) to _gateDoor.
  let gateFrom = 0, boardFrom = 0;
  for (let t = H(5, 4, 20); t <= H(5, 5, 20); t += MIN) {
    const r = find(mapRows(E, raw.dep, 'dep', t), 'AC2057');
    assert.equal(r._feedAcCode, '');
    const gateRow = Object.assign({}, r, { _aircraftCode: 'DH4', _aircraft: 'De Havilland Dash 8-400' });
    const g = E._gateDoor(gateRow, t, 'YHZ', null, E.data.arr, 'America/Halifax', 'DH4');
    const b = E._fidsShownRow(r, t, 'YHZ').status === 'boarding';
    assert.equal(g.word === 'boarding', b, hmAdt(t));
    assert.equal(hmAdt(g.bt.boardTs), '04:40', 'the time the gate prints is the one the board opens on');
    if (b && !boardFrom) boardFrom = t;
    if (g.word === 'boarding' && !gateFrom) gateFrom = t;
  }
  assert.equal(hmAdt(gateFrom), '04:40');
  assert.equal(gateFrom, boardFrom);
  // A strict airport keeps the gate's own type: it opens no sign on the clock,
  // so its printed boarding time keeps the Dash 8's twenty minutes.
  const m = find(deps(E, YQM.dep28, T(9, 29, 4, 0)), 'AC1983', 29);
  assert.equal(E._gateDoor(m, T(9, 29, 4, 0), 'YQM', null, [], 'America/Moncton', 'DH4').bt.lead, 20);
  assert.equal(E._gateDoor(m, T(9, 29, 4, 0), 'YQM', null, [], 'America/Moncton', 'DH4').word, '');
  // The feed's type is stamped by mapADB apart from the field a gate writes over.
  assert.equal((CORE.match(/_aircraftCode:_aircraftRaw,_feedAcCode:_aircraftRaw,/g) || []).length, 2);
  assert.equal(E._fidsBoardEquip({ _aircraftCode: 'DH4', _feedAcCode: '789' }, 'YHZ'), '789');
  assert.equal(E._fidsBoardEquip({ _aircraftCode: 'DH4', _feedAcCode: '789' }, 'YQM'), 'DH4');
  assert.match(UXG, /var _door = _gateDoor\(currentFlight, Date\.now\(\), iata, window\._gateInbound, data\.arr, tz, equipRaw\);/);
});

test('(D) a tight turn at Halifax: the next flight takes its gate on its printed boarding time, and the two screens agree every minute', async () => {
  const { E, raw } = await yhzEngine();
  // AC2057 05:15 and a 05:50 departure from the same gate 16.
  const rows = yhzAdd(raw.dep, 'AC2061', 5, 5, 50, 'YUL');
  for (let t = H(5, 4, 30); t <= H(5, 6, 5); t += MIN) {
    const s = screensAt(E, rows, '16', t, 'YHZ');
    for (const n of ['AC2057', 'AC2061']) {
      assert.equal(s[n].board === 'boarding', s[n].gate, `${n} ${hmAdt(t)}`);
    }
  }
  // 05:14: AC2057 boarding. 05:16, inside AC2057's ten-minute grace: AC2061 on
  // gate 16 with NOW BOARDING, as the board says — it used to wait to 05:25.
  assert.deepEqual(screensAt(E, rows, '16', H(5, 5, 14), 'YHZ').AC2057, { board: 'boarding', gate: true, first: 'AC2057' });
  assert.deepEqual(screensAt(E, rows, '16', H(5, 5, 16), 'YHZ').AC2061, { board: 'boarding', gate: true, first: 'AC2061' });
  // Every pick path reads the page's own airport: the gate's list, the walking
  // pick and the gids.html boot pick call these without one.
  const was = globalThis.document;
  globalThis.document = { getElementById: (id) => (id === 'apSel' ? { value: 'YHZ' } : null) };
  try {
    E.data.dep = mapRows(E, rows, 'dep', H(5, 5, 16));
    assert.equal(E._gateFlightsAt('16', H(5, 5, 16))[0].flight, 'AC2061');
    assert.ok(E._gateLiveGates(E.data.dep, H(5, 5, 16)).includes('16'));
    assert.equal(E._gateHoldYields(find(E.data.dep, 'AC2057'), E.data.dep, H(5, 5, 16)), true);
  } finally {
    if (was === undefined) delete globalThis.document; else globalThis.document = was;
  }
  // Not before AC2057's departure time, and not at a strict airport: there the
  // grace comes first, as it always has.
  E.data.dep = mapRows(E, rows, 'dep', H(5, 5, 14));
  assert.equal(E._gateHoldYields(find(E.data.dep, 'AC2057'), E.data.dep, H(5, 5, 14), 'YHZ'), false);
  E.data.dep = mapRows(E, rows, 'dep', H(5, 5, 16));
  assert.equal(E._gateHoldYields(find(E.data.dep, 'AC2057'), E.data.dep, H(5, 5, 16), 'YQM'), false);
  assert.equal(E._gateHoldYields(find(E.data.dep, 'AC2057'), E.data.dep, H(5, 5, 16)), false, 'no page airport: no Option-B yield');
});

test('(D) a Delayed flight holds its gate, and the board holds the next flight\'s schedule Boarding back with it', async () => {
  const { E, raw } = await yhzEngine();
  // AC2057 05:15 "Delayed" with no time keeps gate 16 to 06:15 (DELAY_HOLD_MIN);
  // WS3401 06:00 at gate 16 would board from 05:25.
  const rows = yhzAdd(alter(raw.dep, 'AC2057', (f) => { f.status = 'delayed'; return f; }), 'WS3401', 5, 6, 0, 'YYZ');
  for (let t = H(5, 5, 0); t <= H(5, 6, 10); t += MIN) {
    const s = screensAt(E, rows, '16', t, 'YHZ');
    assert.equal(s.WS3401.board === 'boarding', s.WS3401.gate, hmAdt(t));
    assert.equal(s.WS3401.board, 'ontime', hmAdt(t));
    assert.equal(s.AC2057.first, 'AC2057', hmAdt(t));
    assert.equal(s.AC2057.board, 'delayed', hmAdt(t));
  }
  // The same WS3401 on a gate of its own boards on its time, on both screens.
  const own = yhzAdd(alter(raw.dep, 'AC2057', (f) => { f.status = 'delayed'; return f; }), 'WS3401', 5, 6, 0, 'YYZ')
    .map((f) => (f.number === 'WS3401' ? Object.assign({}, f, { departure: Object.assign({}, f.departure, { gate: '14' }) }) : f));
  assert.deepEqual(screensAt(E, own, '14', H(5, 5, 40), 'YHZ').WS3401, { board: 'boarding', gate: true, first: 'WS3401' });
  // Delayed WITH a new time: the same, and the yield to the airport's own word stands.
  const later = yhzAdd(alter(raw.dep, 'AC2057', (f) => {
    f.status = 'delayed';
    f.departure.revisedTime = { local: '2026-09-05 06:30:00-03:00', utc: '2026-09-05 09:30:00+00:00' };
    return f;
  }), 'WS3401', 5, 6, 0, 'YYZ');
  for (const [hh, mm] of [[5, 30], [5, 50]]) {
    const s = screensAt(E, later, '16', H(5, hh, mm), 'YHZ');
    assert.equal(s.WS3401.board, 'ontime');
    assert.equal(s.AC2057.first, 'AC2057');
  }
  const said16 = later.map((f) => (f.number === 'WS3401' ? Object.assign({}, f, { status: 'boarding' }) : f));
  assert.deepEqual(screensAt(E, said16, '16', H(5, 5, 40), 'YHZ').WS3401, { board: 'boarding', gate: true, first: 'WS3401' });
});

test('(B) a delayed flight yields only to a later flight still at the door: Moncton gate 1 with AC2037 left on Boarding', () => {
  const E = engine();
  // AC1983 05:25 "Delayed until 7:50 AM"; AC2037 06:35 left on "Boarding";
  // AC7753 07:10. AC2037 gives the gate to AC7753 at 07:10 and its hour ends
  // at 07:35, so from then its Boarding proves nothing about the door.
  const rows = said(said(YQM.dep28, 'AC1983', 29, 'Delayed until 7:50 AM', '7:50 AM'), 'AC2037', 29, 'Boarding');
  const at = (hh, mm) => { const t = T(9, 29, hh, mm); E.data.dep = deps(E, rows, t); return { t, list: E._gateFlightsAt('1', t).map((f) => f.flight) }; };
  // While AC2037 really is the gate's boarding flight, the yield stands.
  assert.equal(at(6, 40).list[0], 'AC2037');
  // From 07:10 the gate is AC1983's again, through to 07:50 plus the grace.
  for (const [hh, mm] of [[7, 11], [7, 21], [7, 36], [7, 59]]) {
    const x = at(hh, mm);
    assert.equal(x.list[0], 'AC1983', `${hh}:${mm}`);
    assert.ok(E._gateLiveGates(E.data.dep, x.t).includes('1'), `${hh}:${mm}: the walking pick`);
  }
  assert.ok(!at(8, 1).list.includes('AC1983'), '08:01');
});

test('(D) the kept sign stays with its door and its flight: a gate change, real departure evidence', () => {
  const storage = makeStorage();
  const g = engine({ storage });
  const t0 = T(9, 29, 5, 0);
  g.data.dep = deps(g, said(YQM.dep28, 'AC1983', 29, 'Boarding'), t0);
  g._gateDepsSeen(g.data.dep, 'YQM', t0);
  assert.equal(find(g.data.dep, 'AC1983', 29)._doorSaid.gate, '1');
  const regate = (rows, gate) => rows.map((r) => (r.flightId === 'AC1983' && r.displayDate === 'Sep 29') ? Object.assign({}, r, { gate }) : r);
  // 05:40 — "Delayed until 6:30 AM", moved to gate 3 (an aircraft swap). Nobody
  // has boarded at gate 3: it shows the delay, no sign.
  const t1 = T(9, 29, 5, 40);
  const moved = regate(said(YQM.dep28, 'AC1983', 29, 'Delayed until 6:30 AM', '6:30 AM'), '3');
  g.data.dep = deps(g, moved, t1);
  g._gateDepsSeen(g.data.dep, 'YQM', t1);
  const r1 = find(g.data.dep, 'AC1983', 29);
  assert.equal(r1.gate, '3');
  const d1 = g._gateDoorFor(r1, t1, 'YQM');
  assert.equal(d1.kept, false);
  assert.equal(d1.word, '');
  assert.equal(g._gateFlightsAt('3', t1)[0].flight, 'AC1983', 'the flight is on its new gate, as a Delayed');
  // Back at gate 1 the record still holds: the sign comes back.
  const back = said(YQM.dep28, 'AC1983', 29, 'Delayed until 6:30 AM', '6:30 AM');
  g.data.dep = deps(g, back, t1);
  g._gateDepsSeen(g.data.dep, 'YQM', t1);
  assert.equal(g._gateDoorFor(find(g.data.dep, 'AC1983', 29), t1, 'YQM').kept, true);
  // Real evidence it has left ends the kept sign: the push says airborne, or a
  // wheels-up, while cyqm.ca still says Delayed.
  const t2 = T(9, 29, 5, 53);
  g.data.dep = deps(g, back, t2);
  const r2 = find(g.data.dep, 'AC1983', 29);
  assert.equal(g._gateDoorFor(r2, t2, 'YQM').kept, true);
  const pushed = Object.assign({}, r2, { _pushStatus: 'active' });
  assert.equal(g._gateDepLeft(pushed, t2), true);
  assert.equal(g._gateDoorFor(pushed, t2, 'YQM').kept, false);
  assert.equal(g._gateDoorFor(pushed, t2, 'YQM').word, '');
  const up = Object.assign({}, r2, { _actualDepTime: '2026-09-29 05:52:00-03:00' });
  assert.equal(g._gateDoorFor(up, t2, 'YQM').kept, false);
  assert.equal(g._gateDoorFor(up, T(9, 29, 5, 51), 'YQM').kept, true, 'not before the wheels-up');
});

test('(D) Boarding again after a delay: the sign keeps running, only the departure time is pushed', () => {
  const storage = makeStorage();
  const g = engine({ storage });
  const step = (t, rows) => { g.data.dep = deps(g, rows, t); g._gateDepsSeen(g.data.dep, 'YQM', t); const r = find(g.data.dep, 'AC1983', 29); return { r, d: g._gateDoorFor(r, t, 'YQM') }; };
  const t0 = T(9, 29, 5, 0);
  const a = step(t0, said(YQM.dep28, 'AC1983', 29, 'Boarding'));
  assert.equal(hmAdt(a.d.bt.boardTs), '04:50');
  const t1 = T(9, 29, 5, 20);
  const b = step(t1, said(YQM.dep28, 'AC1983', 29, 'Delayed until 5:50 AM', '5:50 AM'));
  assert.equal(b.d.kept, true);
  // 05:30 — cyqm.ca says Boarding again, with 5:50.
  const t2 = T(9, 29, 5, 30);
  const c = step(t2, said(YQM.dep28, 'AC1983', 29, 'Boarding', '5:50 AM'));
  assert.equal(c.r.status, 'boarding');
  assert.equal(c.r.upd, '05:50');
  assert.equal(c.d.kept, true);
  assert.equal(c.d.word, 'boarding');
  assert.equal(c.d.bt.boardTs, a.d.bt.boardTs, 'the printed boarding time does not jump to 05:15');
  assert.equal(c.d.basis._revTs, null, 'the sign keeps the clock it opened on (05:25)');
  assert.deepEqual(c.r._doorSaid, { w: 'boarding', rev: null, upd: null, gate: '1' }, 'the record keeps the time boarding began on');
  const zonesAt = (x, t) => Math.round(((x.d.basis._revTs || x.d.basis._sortTs) - t) / MIN);
  assert.equal(zonesAt(c, t2), -5, 'counted from 05:25, so nothing steps back');
  assert.equal(g._boardStripStatusKey(c.r, 'boarding', 20, c.d.kept), '');
  // 05:40 — Final call, still 5:50: the word moves on, the clock does not.
  const t3 = T(9, 29, 5, 40);
  const e = step(t3, said(YQM.dep28, 'AC1983', 29, 'Final call', '5:50 AM'));
  assert.equal(e.d.kept, true);
  assert.equal(e.d.word, 'final');
  assert.equal(e.d.bt.boardTs, a.d.bt.boardTs);
  assert.equal(e.r._doorSaid.w, 'final');
  // The same word with no later time is the airport's word, nothing kept.
  const f = step(T(9, 29, 5, 10), said(YQM.dep28, 'AC1983', 29, 'Boarding'));
  assert.equal(f.d.kept, false);
  assert.equal(f.d.word, '');
  // The Departure field shows the pushed time: the row's word is not Delayed,
  // so uxgGateHtml writes it after the door is known.
  assert.deepEqual(g._gateDepDisplayState(c.r), { stKey: 'boarding', depDelayed: false, revTsLater: true });
  assert.match(UXG, /if \(_door\.kept && !depDelayed && _gateDelayHasTime\(currentFlight\)\) \{/);
  assert.match(UXG, /depTimeHtml = '<span class="g8-r2-strike">' \+ fidsEscHtml\(_to12h\(currentFlight\.time\) \|\| '\\u2014'\) \+ '<\/span><span class="g8-r2-revised">' \+ fidsEscHtml\(_pushDisp\) \+ '<\/span>';/);
  assert.ok(UXG.indexOf('var _door = _gateDoor(') < UXG.indexOf('var _pushDisp = _to12h(_pushHM);'));
  assert.ok(UXG.indexOf('var _pushDisp = _to12h(_pushHM);') < UXG.indexOf("_cell('ac-ico-depart'"));
});

test('(D) the phone-width gate and the Designer templates say what the TV gate and the departures board say', () => {
  // The narrow gate (renderDedicatedScreen under 700 px) reads the door word.
  const mob = fn('renderMobileGateHtml');
  assert.match(mob, /_mDoor = _gateDoorFor\(currentFlight, Date\.now\(\), iata\)\.word \|\| '';/);
  assert.match(mob, /const stKey = _mDoor \|\| currentFlight\.status \|\| 'scheduled';/);
  assert.match(mob, /window\._gatePaintedDoor = \{ k: _gateRowKey\(currentFlight\), w: _mDoor \};/);
  assert.match(CORE, /if \(_isMobileGate\) \{\s*gView\.innerHTML = renderMobileGateHtml\(/);
  // Templates read window.flightsDep (data.dep as the feed gave it) through the
  // departures board's own row.
  const TR = fs.readFileSync(path.join(root, 'fids-current', 'js', 'template-renderer.js'), 'utf8');
  assert.match(TR, /const _shown = \(source !== 'arr' && typeof window\.fidsShownRow === 'function'\) \? window\.fidsShownRow : null;/);
  assert.match(TR, /return list\.map\(f0 => \{ const f = \(_shown && _shown\(f0\)\) \|\| f0; return \{/);
  assert.match(TR, /if \(f && typeof window\.fidsShownRow === 'function'\) f = window\.fidsShownRow\(f\) \|\| f;/);
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(root, 'fids-current', page), 'utf8');
    // v23925 or any later build of it
    const v = /js\/template-renderer\.js\?v=(\d+)/.exec(html);
    assert.ok(v && Number(v[1]) >= 23925, page + ' loads the changed renderer');
  }
});
