'use strict';

// WHY THIS EXISTS
//
// v24107. A word that says something happened (arrived, landed, departed) is
// the airport's, and the boards believe it (v23925), unless the same row's own
// time for that event is still too far ahead. Then the row contradicts itself
// and reads by its time, as a row with no such word does.
//
// Toronto, 2026-11-02 at 14:11: Pearson's row for AS385 from Seattle said ARR
// with its own time at 16:05, and AA1111 from Dallas said LND at 16:23. Both
// were in the air. Gate A13 said "Arrived at the gate | 4:05pm" for AS391's
// aircraft, and its map taxied AS385 in from the runway two hours early.
//
// How far ahead is too far depends on the airport (_ADB_CLAIM_AHEAD_TIMED_MS):
//   - 20 minutes where the airport writes the event's own time on the row,
//     read off the list (_adbClaimAheadMs) or known by the adapter
//     (_claimTimed: Toronto, Moncton);
//   - 90 minutes where the row keeps its schedule, because an honest early
//     landing sits ahead there by exactly how early it is (O'Hare, Seattle,
//     Minneapolis: up to 53 minutes on 2026-11-02).
// A departure that has reached its destination has left, so "Arrived" on a
// departure row may be at most 5 minutes ahead of its own departure (Las
// Vegas says "Arrived" when the aeroplane has come in FOR the departure).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const ROUTER = fs.readFileSync(path.join(root, 'fids-current', 'js', 'feed-router.js'), 'utf8');
const APP = fs.readFileSync(path.join(root, 'fids-current', 'app.html'), 'utf8');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const MIN = 60000;

// From `function NAME(` to its matching brace; strings and comments skipped.
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
  const m = SRC.match(new RegExp('(^|\\n)function ' + name + '\\('));
  assert.ok(m, name + ' must be declared');
  return braceFrom(SRC, m.index + (m[1] ? 1 : 0), name);
}
function lineIn(SRC, re, what) {
  const m = SRC.match(re);
  assert.ok(m, what + ' must exist');
  return m[0];
}
const varLine = (name) => lineIn(CORE, new RegExp('^var ' + name + ' = [^\\n]+', 'm'), name);
function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
}

const CORE_FNS = ['adbTs', '_adbNearestDayTs', '_adbLegUpdateTs', '_adbHappenedWord', '_adbClaimAheadMs',
  '_adbClaimWithheld', 'adbStatus', 'adbStatusInferred', 'fidsInboundHasArrived',
  '_gateRowKey', '_gateSeenKeepIdentity', '_gateRawStatus', '_gateRawLanded', '_gateLegGone',
  '_gateSeenSlim', '_gateSeenLoad', '_gateSeenSave', '_gateArrsSeen'];
function core(localStorage) {
  const src = [
    varLine('_ADB_CLAIM_AHEAD_TIMED_MS'), varLine('_ADB_CLAIM_AHEAD_UNTIMED_MS'), varLine('_ADB_EXPLICIT_STATUS'),
    varLine('_GATE_SEEN_IDENTITY'), varLine('_GATE_SEEN_KEY'),
    lineIn(CORE, /^var _GATE_SEEN_FIELDS = \[[\s\S]*?\];/m, '_GATE_SEEN_FIELDS'),
    varLine('_GATE_ARR_SEEN'),
    ...CORE_FNS.map((n) => fnIn(CORE, n)),
    'return { ' + CORE_FNS.map((n) => n + ': ' + n).join(', ')
      + ', TIMED: _ADB_CLAIM_AHEAD_TIMED_MS, UNTIMED: _ADB_CLAIM_AHEAD_UNTIMED_MS, SEEN_KEY: _GATE_SEEN_KEY };'
  ].join('\n');
  return new Function('localStorage', src)(localStorage || store());
}
const C = core();
const R = new Function([
  fnIn(ROUTER, 'fidsNeutralWord'), fnIn(ROUTER, 'yqmTimeObj'), fnIn(ROUTER, 'yqmClockToMin'), fnIn(ROUTER, 'yqmStatus'),
  fnIn(ROUTER, 'yqmToAdbFlight'), fnIn(ROUTER, 'yyzIataFromId2'), fnIn(ROUTER, 'yyzStatus'), fnIn(ROUTER, 'yyzToAdbFlight'),
  'return { yqmToAdbFlight, yyzToAdbFlight };'].join('\n'))();

// mapADB's part of it: the list's margin once, then each row's status.
function statuses(list, mode, now) {
  const ahead = C._adbClaimAheadMs(list, mode);
  const out = {};
  for (const f of list) {
    const leg = (mode === 'dep' ? f.departure : f.arrival) || {};
    const s = leg.scheduledTime && (leg.scheduledTime.local || leg.scheduledTime.utc);
    out[f.number] = C.adbStatus(f, mode, C.adbTs(s), now, ahead);
  }
  return out;
}
// An AeroDataBox-shaped row at an airport whose clock is UTC-6 (Chicago).
const iso = (ms) => new Date(ms - 6 * 3600000).toISOString().slice(0, 16).replace('T', ' ') + '-06:00';
function adbRow(number, status, mode, schedMs, revMs) {
  const leg = { scheduledTime: { local: iso(schedMs) } };
  if (revMs != null) leg.revisedTime = { local: iso(revMs) };
  return mode === 'dep'
    ? { number, status, departure: leg, arrival: { airport: { iata: 'DEN' } } }
    : { number, status, arrival: leg, departure: { airport: { iata: 'DEN' } } };
}

const CAP = JSON.parse(fixture('yyz-arr-2026-11-02-1918.json'));
const YYZ_NOW = Date.parse(CAP.asOfUtc);
const YYZ = CAP.list.map(R.yyzToAdbFlight).filter(Boolean);

test('Toronto, 2026-11-02 at 14:18: AS385 and AA1111 say arrived with their own time still ahead, and are not believed', () => {
  assert.equal(C._adbClaimAheadMs(YYZ, 'arr'), C.TIMED, 'Pearson writes the actual time on its arrived rows');
  const st = statuses(YYZ, 'arr', YYZ_NOW);
  assert.equal(st.AS385, 'scheduled', 'AS385: ARR at 14:18 with its time at 16:05 reads by its time');
  assert.equal(st.AA1111, 'delayed', 'AA1111: LND with its time revised to 16:23 reads Delayed, by the revision');
  // v24117 — Pearson's LND reaches the board as 'landed' and its ARR as
  // 'arrived', and a word believed keeps itself: down, and only ARR at the gate.
  const genuine = YYZ.filter((f) => (f.status === 'arrived' || f.status === 'landed') && f.number !== 'AS385' && f.number !== 'AA1111');
  assert.equal(genuine.length, 25);
  assert.ok(genuine.some((f) => f.status === 'landed') && genuine.some((f) => f.status === 'arrived'), 'both words in the list');
  for (const f of genuine) assert.equal(st[f.number], f.status, f.number + ' landed, by its own time');
  for (const f of genuine) assert.equal(C._adbClaimWithheld(f, 'arr', st[f.number]), false, f.number + ' believed');
  // Withheld, so the status the row shows is its time's, not the airport's word.
  const as385 = YYZ.find((f) => f.number === 'AS385');
  assert.equal(C._adbClaimWithheld(as385, 'arr', st.AS385), true);
  assert.equal(C._adbClaimWithheld(genuine[0], 'arr', 'arrived'), false);
  // The list says it on its own, without the adapter's flag.
  const bare = YYZ.map((f) => { const c = Object.assign({}, f); delete c._claimTimed; return c; });
  assert.equal(C._adbClaimAheadMs(bare, 'arr'), C.TIMED);
  assert.equal(statuses(bare, 'arr', YYZ_NOW).AS385, 'scheduled');
  // Inside the margin (20 minutes before 16:05) the word is believed again.
  assert.equal(statuses(YYZ, 'arr', Date.parse('2026-11-02T20:50:00Z')).AS385, 'arrived');
});

test('the adapters that know their airport writes the event\'s time say so', () => {
  assert.equal(YYZ.every((f) => f._claimTimed === true), true, 'every Toronto row');
  const rows = JSON.parse(fixture('yqm-cyqm-2026-09-28-2222-arrivals.json'));
  const pd = R.yqmToAdbFlight(rows.find((r) => r.flightId === 'PD2381'), 'Arrival');
  assert.equal(pd._claimTimed, true, 'Moncton: "Arrived at 9:47 PM"');
  // Moncton lists a dozen arrivals a day, too few for the list to tell: the
  // adapter's word gives PD2381 the 20 minutes. Due 21:30, it says it landed
  // at 21:47 (ADT, UTC-3).
  const at = (hh, mm) => Date.UTC(2026, 8, 29, hh + 3 - 24, mm);
  const one = [pd];
  assert.equal(C._adbClaimAheadMs(one, 'arr'), C.UNTIMED, 'one word is too few to read the list by');
  assert.equal(statuses(one, 'arr', at(20, 30)).PD2381, 'delayed', '77 minutes before its own time: not yet');
  assert.equal(statuses(one, 'arr', at(21, 40)).PD2381, 'arrived', '7 minutes before: within the margin');
  assert.equal(statuses(one, 'arr', at(21, 50)).PD2381, 'arrived');
});

test('where a landed row keeps its schedule, an honest early landing is believed for 90 minutes', () => {
  const now = Date.UTC(2026, 10, 2, 19, 30);
  // O'Hare's pattern: every arrived row carries only its schedule.
  const list = [];
  for (let i = 0; i < 10; i++) list.push(adbRow('UA' + (100 + i), 'Arrived', 'arr', now - (60 - 10 * i) * MIN));
  list.push(adbRow('EI123', 'Arrived', 'arr', now + 41 * MIN));   // 41 minutes early, measured
  list.push(adbRow('AA1686', 'Arrived', 'arr', now + 53 * MIN));  // 53 minutes early, measured (MSP)
  list.push(adbRow('XX9', 'Arrived', 'arr', now + 100 * MIN));
  assert.equal(C._adbClaimAheadMs(list, 'arr'), C.UNTIMED);
  const st = statuses(list, 'arr', now);
  assert.equal(st.EI123, 'arrived');
  assert.equal(st.AA1686, 'arrived');
  assert.equal(st.XX9, 'scheduled', 'an hour and a half early is not a landing');
  // The same rows with their own times written in read the tight margin.
  const timed = list.map((f, i) => (i < 10 ? adbRow(f.number, 'Arrived', 'arr', now - (60 - 10 * i) * MIN, now - (65 - 10 * i) * MIN) : f));
  assert.equal(C._adbClaimAheadMs(timed, 'arr'), C.TIMED);
  assert.equal(statuses(timed, 'arr', now).EI123, 'scheduled');
});

test('an airborne word on an arrival row is never checked against the clock', () => {
  const now = Date.UTC(2026, 10, 2, 19, 11);
  for (const w of ['EnRoute', 'Approaching', 'Active', 'Departed']) {
    assert.equal(C.adbStatus(adbRow('AS385', w, 'arr', now + 114 * MIN), 'arr', now + 114 * MIN, now, C.TIMED), 'active', w);
  }
});

test('departures: a word that says it left is held to the same margins, and "Arrived" on a departure row waits 15 minutes past its time', () => {
  const now = Date.UTC(2026, 10, 2, 19, 30);
  // Las Vegas, 2026-11-02: four departure rows said "Arrived" 13 to 25 minutes
  // before they left, and say it until "Departed"; the board said Departed on
  // flights at their gates.
  for (const [n, ahead] of [['DL2262', 13], ['AS785', 20], ['DL795', 25], ['DL334', 4], ['DL0', -10]]) {
    const f = adbRow(n, 'Arrived', 'dep', now + ahead * MIN);
    const s = C.adbStatus(f, 'dep', now + ahead * MIN, now, C.UNTIMED);
    assert.equal(s, 'scheduled', n + ' ' + ahead);
    assert.equal(C._adbClaimWithheld(f, 'dep', s), true, n);
  }
  // A departure that has reached its destination (Denver's and O'Hare's
  // "Arrived" on their departure rows, 64 to 97 minutes past on 2026-11-02) is
  // still a departure.
  assert.equal(C.adbStatus(adbRow('UA1', 'Arrived', 'dep', now - 20 * 60 * MIN), 'dep', now - 20 * 60 * MIN, now, C.UNTIMED), 'departed');
  assert.equal(C.adbStatus(adbRow('UA2', 'Landed', 'dep', now - 20 * MIN), 'dep', now - 20 * MIN, now, C.UNTIMED), 'departed');
  // "Departed" an hour ahead: not where the airport writes its times, yes where
  // it keeps the schedule.
  const f = adbRow('AC1', 'Departed', 'dep', now + 60 * MIN);
  assert.equal(C.adbStatus(f, 'dep', now + 60 * MIN, now, C.TIMED), 'scheduled');
  assert.equal(C.adbStatus(f, 'dep', now + 60 * MIN, now, C.UNTIMED), 'departed');
  // Cancelled and diverted are never held back.
  assert.equal(C.adbStatus(adbRow('AC2', 'Cancelled', 'dep', now + 5 * 60 * MIN), 'dep', now + 5 * 60 * MIN, now, C.TIMED), 'cancelled');
});

test('the row\'s own time is on the day nearest its schedule: an early landing across midnight is believed', () => {
  // Moncton's AC1986, due 12:08 AM, "Arrived at 11:48 PM" the evening before
  // (the v23109 case), read at 11:52 PM (ADT, UTC-3).
  // (cyqm.ca's localTimestamp is the wall clock written as if it were UTC)
  const due = Date.UTC(2026, 8, 30, 3, 8), now = Date.UTC(2026, 8, 30, 2, 52), wall = Date.UTC(2026, 8, 30, 0, 8) / 1000;
  const ac1986 = R.yqmToAdbFlight({ flightId: 'AC1986', flightNumber: '1986', airlineName: 'Air Canada', airlineCode: 'AC',
    airportCity: 'Toronto', airportCode: 'YYZ', localTimestamp: wall, scheduledTime: '12:08 AM', terminal: '', gate: '4',
    status: 'Arrived at 11:48 PM', actualTime: '11:48 PM' }, 'Arrival');
  assert.equal(C.adbTs(ac1986.arrival.revisedTime.local), due - 20 * MIN, 'the adapter puts 11:48 PM on the evening before');
  assert.equal(ac1986._claimTimed, true);
  assert.equal(statuses([ac1986], 'arr', now).AC1986, 'arrived');
  // A bare "Arrived" carries only its schedule: the list's margin, not the flag.
  const bare = R.yqmToAdbFlight({ flightId: 'PD2371', flightNumber: '2371', airlineName: 'Porter', airlineCode: 'PD',
    airportCity: 'Toronto', airportCode: 'YYZ', localTimestamp: wall, scheduledTime: '12:08 AM', terminal: '', gate: '3',
    status: 'Arrived', actualTime: '12:08 AM' }, 'Arrival');
  assert.equal(bare._claimTimed, undefined);
  assert.equal(statuses([bare], 'arr', due - 40 * MIN).PD2371, 'arrived', 'a Porter 40 minutes early, read as it lands');
  // A revised time stamped with its schedule's day (a day late) is snapped back.
  const late = { number: 'AC1', status: 'Arrived', departure: {}, arrival: {
    scheduledTime: { utc: new Date(due).toISOString() }, revisedTime: { utc: new Date(due - 20 * MIN + 24 * 60 * MIN).toISOString() } } };
  assert.equal(C.adbStatus(late, 'arr', due, now, C.TIMED), 'arrived');
});

test('mapADB reads the margin off its list once and a withheld word is not the airport\'s own', () => {
  const src = fnIn(CORE, 'mapADB');
  assert.match(src, /const _claimAheadMs=_adbClaimAheadMs\(list,mode\);/);
  assert.match(src, /const st=adbStatus\(f,mode,schedTs,nowTs,_claimAheadMs\);/);
  assert.match(src, /const _stExplicit=_ADB_EXPLICIT_STATUS\.test\([^\n]*\)&&!_adbClaimWithheld\(f,mode,st\);/);
});

test('an "actual" arrival still ahead of us is not an arrival', () => {
  const now = Date.UTC(2026, 10, 2, 19, 11);
  const at = (ms) => new Date(ms).toISOString();
  assert.equal(C.fidsInboundHasArrived({ _actualArrTime: at(now + 30 * MIN) }, now), false);
  assert.equal(C.fidsInboundHasArrived({ _actualArrTime: at(now + 2 * MIN) }, now), true);
  assert.equal(C.fidsInboundHasArrived({ _actualArrTime: at(now - 10 * MIN) }, now), true);
  assert.equal(C.fidsInboundHasArrived({ status: 'arrived' }, now), true, 'a mapped row\'s word');
  assert.equal(C.fidsInboundHasArrived({ status: 'scheduled' }, now), false);
});

test('a screen forgets a landing it kept for a flight its listed row says is still to come', () => {
  const ls = store();
  const as385 = { flight: 'AS385', airline: 'AS', gate: 'A13', _sortTs: Date.parse('2026-11-02T21:05:00Z'), _revTs: null };
  const ac811 = { flight: 'AC811', airline: 'AC', gate: 'E73', _sortTs: Date.parse('2026-11-02T19:45:00Z'), _revTs: Date.parse('2026-11-02T19:03:00Z') };
  // Before v24107 a screen at A13 kept AS385's "arrived" (14:11), with AC811's.
  ls.setItem('fids_gate_seen_v1', JSON.stringify({ YYZ: { arr: {
    ['AS385|' + as385._sortTs]: Object.assign({ status: 'arrived', _stInferred: false, _remembered: true }, as385),
    ['AC811|' + ac811._sortTs]: Object.assign({ status: 'arrived', _stInferred: false, _remembered: true }, ac811)
  } } }));
  const E = core(ls);
  const now = YYZ_NOW;
  const out = E._gateArrsSeen([
    Object.assign({ status: 'scheduled', _stInferred: false }, as385),   // the word withheld now
    Object.assign({ status: 'arrived', _stInferred: false }, ac811)
  ], 'YYZ', now);
  assert.deepEqual(out.map((r) => r.flight + ':' + r.status).sort(), ['AC811:arrived', 'AS385:scheduled']);
  const kept = JSON.parse(ls.getItem('fids_gate_seen_v1')).YYZ.arr;
  assert.deepEqual(Object.keys(kept), ['AC811|' + ac811._sortTs], 'AS385\'s early landing is gone; AC811\'s stays');
  // A landing whose row has since passed its time stays as it was (the feed may
  // change its word after the aeroplane is in).
  const ls2 = store();
  ls2.setItem('fids_gate_seen_v1', ls.getItem('fids_gate_seen_v1'));
  const E2 = core(ls2);
  E2._gateArrsSeen([Object.assign({ status: 'scheduled', _stInferred: false }, ac811)], 'YYZ', now);
  assert.deepEqual(Object.keys(JSON.parse(ls2.getItem('fids_gate_seen_v1')).YYZ.arr), ['AC811|' + ac811._sortTs]);
});

// ── the companion app keeps its own copy of the rule (app.html) ─────────────
function appFn(name) {
  const at = APP.search(new RegExp('\\nfunction ' + name + '\\('));
  assert.ok(at >= 0, name + ' must exist');
  return braceFrom(APP, at + 1, name);
}
const card = new Function(['REGIONAL_FAM', 'AIRLINE', 'BRAND', 'REGIONAL_OP', 'wmUrls'],
  appFn('adbHHMM') + appFn('inferOperator') + appFn('adbToCard') + '; return adbToCard;')({}, {}, {}, {}, () => null);
const claimAheadMs = new Function(appFn('claimAheadMs') + '; return claimAheadMs;')();

test('the companion app holds back the same words', () => {
  const now = Date.now();
  const u = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
  const arr = (n, st, sMin, rMin, extra) => Object.assign({ number: n, airline: { iata: n.slice(0, 2) }, status: st,
    arrival: Object.assign({ scheduledTime: { utc: u(now + sMin * MIN) } }, rMin == null ? {} : { revisedTime: { utc: u(now + rMin * MIN) } }),
    departure: { airport: { iata: 'SEA' } } }, extra || {});
  // Toronto's pattern: arrived rows carry their actual time. A slip 45
  // minutes ahead sits inside the 90-minute margin and outside the 20.
  const list = [];
  for (let i = 0; i < 9; i++) list.push(arr('AC' + (400 + i), 'Arrived', -60 + 5 * i, -70 + 5 * i));
  list.push(arr('AS385', 'Arrived', 45, null));
  const ahead = claimAheadMs(list, 'arr');
  assert.equal(ahead, 20 * MIN);
  assert.equal(card(list[9], 'arr', ahead).state, 'scheduled', 'AS385, by the list');
  assert.equal(card(list[0], 'arr', ahead).state, 'arrived');
  assert.equal(card(arr('AS385', 'Arrived', 45, null, { _claimTimed: true }), 'arr').state, 'scheduled', 'the adapter\'s word alone');
  assert.equal(card(arr('UA1', 'Arrived', 45, null), 'arr').state, 'arrived', 'a schedule-only row 45 minutes early');
  // The list's margin reaches the cards.
  assert.match(APP, /const _aheadMs=claimAheadMs\(raw,dir\);[^\n]*\n\s*let all=raw\.map\(x=>adbToCard\(x,dir,_aheadMs\)\)/);
  // A revised time stamped a day late (an early landing across midnight) is
  // on the day nearest its schedule, as on the boards.
  assert.equal(card(arr('AC1986', 'Arrived', 16, -4 + 24 * 60, { _claimTimed: true }), 'arr').state, 'arrived');
  // Las Vegas: "Arrived" on a departure row before it leaves, and until 15
  // minutes after its time.
  const dep = { number: 'AS785', airline: { iata: 'AS' }, status: 'Arrived', departure: { scheduledTime: { utc: u(now + 20 * MIN) } }, arrival: { airport: { iata: 'SEA' } } };
  assert.equal(card(dep, 'dep').state, 'scheduled');
  dep.departure.scheduledTime.utc = u(now - 5 * MIN);
  assert.equal(card(dep, 'dep').state, 'scheduled');
  dep.departure.scheduledTime.utc = u(now - 3 * 60 * MIN);
  assert.equal(card(dep, 'dep').state, 'departed');
});
