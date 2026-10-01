'use strict';

// WHY THIS EXISTS
//
// v23923. Three rules, one theme: a board says only what the airport said.
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
//
// Everything below RUNS the shipped code: the functions are lifted out of
// fids-core.js and feed-router.js by brace matching, the rows come from the
// real fixtures through the real adapters and the worker's own parsers, and
// fids-v2.js is evaluated whole in a sandbox.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  const m = SRC.match(new RegExp('(^|\\n)(async )?function ' + name.replace(/[$]/g, '\\$') + '\\('));
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
  '_gateSignPhase', '_gateDepDisplayState', '_gateBoardingFloorTs', '_boardStripStatusKey', '_gateInbCaptionKey'
];
function engine(opts) {
  const o = opts || {};
  const src = [
    constLine('DEPART_TRAIL_HRS'),
    constLine('BOARDING_HOLD_MIN'), constLine('GATE_GRACE_MIN'), constLine('BOARD_TRAIL_MIN'),
    constLine('BIDS_WINDOW_AHEAD_MS'), constLine('BIDS_WINDOW_TRAIL_MS'),
    constLine('_ADB_EXPLICIT_STATUS'), constLine('_CS_REGIONAL_FAM'),
    block('var _ROW_STATUS_RANK = {'),
    block('var _GATE_LBL = {'),
    ...CORE_FNS.map(fn),
    'return { ' + CORE_FNS.map((n) => n + ': ' + n).join(', ') + ', _ADB_EXPLICIT_STATUS: _ADB_EXPLICIT_STATUS, _GATE_LBL: _GATE_LBL };'
  ].join('\n');
  const data = o.data || { dep: [], arr: [] };
  // An operator's overrides, as the gate override panel stores them (by flight
  // number); with none the override store is absent, as in a page without it.
  const ov = o.overrides ? (n) => o.overrides[String(n).toUpperCase()] || null : undefined;
  const E = new Function('data', 'langs', 'window', 'getOverrideForFlight', src)(data, o.langs || ['en', 'fr'], {}, ov);
  E.data = data;
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
      upd: (revTs && Math.abs(revTs - schedTs) > 5 * MIN) ? E.adbHHMM(revL) : null,
      _locIata: (other.airport && other.airport.iata) || '', _aircraft: '', _aircraftCode: '',
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
  assert.match(UXG, /var _bwStKey = _boardStripStatusKey\(currentFlight, _stripState, minsToDep\);/);
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
  assert.deepEqual(UXG.match(/\bstKey\s*=(?!=)[^\n;]*/g),
    ["stKey = currentFlight.status || 'scheduled'", 'stKey = _depState.stKey', "stKey = 'ontime'"]);
  assert.deepEqual(UXG.match(/\bdepDelayed\s*=(?!=)[^\n;]*/g), ['depDelayed = _depState.depDelayed']);
  // The honesty floor is the pure helper, told whether the departure is revised.
  assert.match(UXG, /boardTs = _gateBoardingFloorTs\(boardTs, _effDepForBoard, currentFlight,\s*window\._gateInbound, data\.arr, depDelayed\);/);
  assert.doesNotMatch(UXG, /_bGi\._revTs|var _bArrTs/, 'no second copy of the floor inside the builder');
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
  assert.equal(qc, '<span class="g8-msg-l g8-msg-l1">' + lbl.fr + '</span><span class="g8-msg-l g8-msg-l2">' + lbl.en + '</span>');
  assert.ok(E._gateLbl('inbDelayed', false, wrap, '').startsWith('<span class="g8-msg-l g8-msg-l1">' + lbl.en));
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
