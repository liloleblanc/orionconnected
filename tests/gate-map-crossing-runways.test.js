'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24129 — WHERE TWO EXTENDED CENTRELINES CROSS, AND ON SHORT FINAL.
//
// Ottawa, 2026-11-07, two arrivals on the gate maps (positions from OpenSky):
//
//   1. AC450 (jet), 13:59:46: 2.1 nm out the fix sat 23 m off the 04
//      centreline and 25 m off the 07 centreline, where the two cross. The
//      v24105 on-centreline rule kept the strictly smaller cross-track, gave
//      the jet 04 (951 m), landed it on the model and rolled it out while the
//      real one landed on 07. The next fix (14:00:30, on the 07 final, 0.8 nm
//      off 04) was older than the taxi and was read as "the fix it was carried
//      from" and ignored; the ground fix re-routed the taxi three minutes on.
//      Now: a fix on two crossing centrelines inside 5 nm of both thresholds
//      is AMBIGUOUS; a jet (or an unnamed type) is never given a runway under
//      1,500 m while a longer one is as close; a known type with one runway
//      left is plain and lands; an ambiguous pick is not landed on and holds
//      SHORT (the non-established cap) until a LATER fix of the same leg picks
//      the same end; and a newer airborne fix off the committed runway
//      un-lands a model touchdown (_gateTaxiWrongRunway).
//   2. PD2366 (Dash 8-400), established on 07 from 5 nm: at 525 ft the fix sat
//      0.18 nm short of the 07 threshold, outside the 0.3-12 nm on-centreline
//      window, and the bearing to the field re-picked 04. The marker swung
//      through 250 degrees and froze short of a threshold it was never
//      landing on for 100 s. Now: a runway this flight is committed to
//      (_gateGlide.rw, inside 40 min, not ambiguous) is KEPT while the fix is
//      still on its centreline, from 1 nm past the threshold out to 12 nm.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) return CORE.slice(at, i + 1);
  }
  throw new Error('no end for ' + name);
}
const RWCTX = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'airport-runways.js'), 'utf8').replace('var AIRPORT_RUNWAYS', 'this.AIRPORT_RUNWAYS'), RWCTX);
const RUNWAYS = RWCTX.AIRPORT_RUNWAYS;
const COORDS = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'airport-coords.js'), 'utf8'), { window: w }); return w.AIRPORT_COORDS; })();
const NAMES = ['_gcNm', '_gcBrgDeg', '_gcDestPt', '_gcFullRoute', '_rwPlaneSpec', '_rwCommitted', '_runwayFinalPath', '_gateOnFinal', '_gateLands'];
// lib(track, planeSpec, glide, win): the live track the glide reads, the type
// on the gate, the glide state the committed runway lives on, and the window
const lib = (trk, spec, glide, win) => new Function('AIRPORT_RUNWAYS', '_gateHeading', '_mapPlaneSpec', 'window', '_gateGlide', NAMES.map(fnSource).join('\n') +
  '\nreturn {' + NAMES.map((n) => n.replace(/^_/, '') + ':' + n).join(',') + '};')(
  RUNWAYS, trk === undefined ? undefined : () => trk, spec === undefined ? undefined : () => spec, win || { _gateInbound: {} }, glide);
const pickFn = (glide) => new Function('_gateGlide', fnSource('_gateGlideRunwayPick') + '\nreturn _gateGlideRunwayPick;')(glide);
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

const YOW = COORDS.YOW;
const THR04 = [45.32668, -75.68902], FAR04 = [45.3343, -75.6835];
const THR07 = [45.3133, -75.671], FAR07 = [45.3252, -75.6448];
const JET = { prop: false, known: true, key: '223' };
const DH4 = { prop: true, known: true, key: 'DH4' };
// AC450 YYZ-YOW, 2026-11-07 (OpenSky): 13:59:46 ADT 137 kt 1,150 ft track 27;
// 14:00:30 135 kt 625 ft; on the ground 14:03:04 at 19 kt
const FIX1 = [45.2947, -75.7125], FIX2 = [45.3096, -75.6795], GND = [45.3218, -75.6574];
const T1 = Date.UTC(2026, 10, 7, 16, 59, 46), T2 = Date.UTC(2026, 10, 7, 17, 0, 30), TG = Date.UTC(2026, 10, 7, 17, 3, 4);
const H = 3600000, MIN = 60000;

test('YOW fix 1: on both the 04 and the 07 centrelines, the pick is ambiguous; a jet is given the 2,439 m runway, not the 951 m one', () => {
  const G = lib(27);
  const r = G.runwayFinalPath(FIX1, YOW, 'YOW');
  assert.ok(r && r.rw, 'a runway final');
  assert.equal(r.rw.ambiguous, true, 'two crossing centrelines within 0.3 nm: ambiguous');
  assert.ok(same(r.rw.t, THR07), 'a jet (no type named) gets 07, 2,439 m: ' + r.rw.t);
  assert.ok(r.rw.nm * 1852 > 1500);
  const n = r.length;
  assert.equal(G.gateOnFinal(FIX1, r[n - 2], r[n - 1], 1150), true, 'it IS on that final');
  assert.equal(G.gateLands(FIX1, r.rw, r[n - 2], r[n - 1], 1150), false, 'but an ambiguous pick is not landed on by one fix');
  // the same with no live track
  const r0 = lib().runwayFinalPath(FIX1, YOW, 'YOW');
  assert.equal(r0.rw.ambiguous, true);
  assert.ok(same(r0.rw.t, THR07));
  // an unnamed type (the _MAP_PLANE_UNKNOWN jet) is still a guess: 07, but ambiguous
  const ru = lib(27, { prop: false, known: false, key: 'jet' }).runwayFinalPath(FIX1, YOW, 'YOW');
  assert.equal(ru.rw.ambiguous, true, 'type unknown: the length rule picks, a later fix must agree');
  assert.ok(same(ru.rw.t, THR07));
});

test('YOW fix 1 for a KNOWN jet: the length rule decides alone, 07 is not ambiguous and it lands at once', () => {
  for (const trk of [27, undefined]) {
    const G = lib(trk, JET);
    const r = G.runwayFinalPath(FIX1, YOW, 'YOW');
    assert.ok(same(r.rw.t, THR07), 'track ' + trk + ': ' + r.rw.t);
    assert.equal(r.rw.ambiguous, false, 'track ' + trk + ': a named jet does not use a 951 m runway, nothing is left to doubt');
    const n = r.length;
    assert.equal(G.gateLands(FIX1, r.rw, r[n - 2], r[n - 1], 1150), true, 'track ' + trk + ': and it lands');
  }
});

test('YOW fix 1 for a turboprop: the nearest centreline (04) as before, still ambiguous, still not landed on alone', () => {
  const G = lib(27, DH4);
  const r = G.runwayFinalPath(FIX1, YOW, 'YOW');
  assert.equal(r.rw.ambiguous, true);
  assert.ok(same(r.rw.t, THR04), 'a Dash 8 may take 04: ' + r.rw.t);
  const n = r.length;
  assert.equal(G.gateLands(FIX1, r.rw, r[n - 2], r[n - 1], 1150), false);
});

test('YOW fix 2: 0.42 nm from the 07 threshold and 0.8 nm off 04, the pick is 07, unambiguous, and it lands', () => {
  for (const trk of [27, 57, undefined]) {
    const G = lib(trk);
    const r = G.runwayFinalPath(FIX2, YOW, 'YOW');
    assert.ok(same(r.rw.t, THR07), 'track ' + trk + ': ' + r.rw.t);
    assert.equal(r.rw.ambiguous, false, 'track ' + trk);
    const n = r.length;
    assert.equal(G.gateLands(FIX2, r.rw, r[n - 2], r[n - 1], 625), true, 'track ' + trk);
  }
});

test('the glide confirms an ambiguous pick only from a LATER, RECENT fix of the same leg that picks the same end', () => {
  const g = { views: {} };
  const P = pickFn(g);
  const rw1 = { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: true };
  P(rw1, T1, 'AC450');
  assert.equal(rw1.ambiguous, true, 'the first fix: still ambiguous');
  assert.equal(g.rwFix, T1);
  assert.equal(g.rwFl, 'AC450');
  // a rebuild on the same fix (the other surface, a redraw) confirms nothing
  const rw1b = Object.assign({}, rw1, { ambiguous: true });
  P(rw1b, T1, 'AC450');
  assert.equal(rw1b.ambiguous, true, 'the same fix again: no confirmation');
  // a later fix, still ambiguous, same end: confirmed
  const rw2 = Object.assign({}, rw1, { ambiguous: true });
  P(rw2, T2, 'AC450');
  assert.equal(rw2.ambiguous, false, 'a second fix agreeing: lands');
  assert.equal(g.rwFix, T2);
  // a later fix for a different end: ambiguous still, and the new end is remembered
  const rw3 = { t: THR04, f: FAR04, hdg: 27, nm: 0.5, past: false, ambiguous: true };
  P(rw3, T2 + 30000, 'AC450');
  assert.equal(rw3.ambiguous, true);
  assert.ok(same(g.rw.t, THR04));
  // another flight never confirms this one
  const rw4 = Object.assign({}, rw3, { ambiguous: true });
  P(rw4, T2 + 60000, 'AC452');
  assert.equal(rw4.ambiguous, true);
  // and an unambiguous pick passes through untouched
  const rw5 = { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: false };
  P(rw5, T2 + 90000, 'AC452');
  assert.equal(rw5.ambiguous, false);
  // a fix with no time of its own neither confirms nor moves rwFix
  const g2 = { views: {} }, P2 = pickFn(g2);
  P2(Object.assign({}, rw1, { ambiguous: true }), T1, 'AC450');
  const rwNoT = Object.assign({}, rw1, { ambiguous: true });
  P2(rwNoT, undefined, 'AC450');
  assert.equal(rwNoT.ambiguous, true);
  assert.equal(g2.rwFix, T1);
});

test('a previous pick from yesterday (same flight number, same end) vouches for nothing: the first fix of today stays ambiguous', () => {
  // gate screens run for days and flight numbers repeat daily: _gateGlide.rw still holds the last leg's 07
  const g = { views: {}, rw: { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: false }, rwAt: Date.now() - 24 * H, rwFl: 'AC450', rwFix: T1 - 24 * H };
  const P = pickFn(g);
  const rw = { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: true };
  P(rw, T1, 'AC450');
  assert.equal(rw.ambiguous, true, 'a 24 h old pick is not a second fix');
  assert.equal(g.rwFix, T1, 'and today replaces it');
  // a previous pick 20 minutes old whose fix is 16 minutes older than this one: a gap too long to be one approach
  const g3 = { views: {}, rw: { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: true }, rwAt: Date.now() - 20 * MIN, rwFl: 'AC450', rwFix: T1 - 16 * MIN };
  const rw3 = { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: true };
  pickFn(g3)(rw3, T1, 'AC450');
  assert.equal(rw3.ambiguous, true, 'fixes 16 minutes apart do not confirm each other');
  // the same two minutes apart, the pick a minute old: confirmed
  const g4 = { views: {}, rw: { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: true }, rwAt: Date.now() - MIN, rwFl: 'AC450', rwFix: T1 - 2 * MIN };
  const rw4 = { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: true };
  pickFn(g4)(rw4, T1, 'AC450');
  assert.equal(rw4.ambiguous, false);
});

test('landed on the model from fix 1: fix 2, older than the taxi but newer than fix 1 and 0.8 nm off 04, un-lands it; one on the 04 centreline, a slow one or a low one does not', () => {
  const win = { _gateIata: 'YOW' };
  const inb = { flight: 'AC450', _locIata: 'YYZ' };
  win._gateInbound = inb;
  const G = lib(27);
  const ended = [];
  const taxi = { on: true, fl: 'AC450', done: false, anchor: 'model', anchorAt: 0, since: 0, plan: { tEnd: 540 } };
  const M = new Function('window', '_gateTaxi', '_gateGlide', '_gateLandedInfo', '_gateTaxiRoute', '_apTaxiFor', '_lookupAirport', '_gcNm', '_gcBrgDeg', '_gateOnBlocksWord', '_gateTaxiEnd',
    fnSource('_gateTaxiWhere') + '\n' + fnSource('_gateTaxiWrongRunway') + '\nreturn { where: _gateTaxiWhere, wrong: _gateTaxiWrongRunway };')(
    win, taxi, { p: 0.5, ll: FIX1 }, () => ({ t: null, by: 'actual' }), () => ({ tEnd: 540 }), () => null, () => YOW, G.gcNm, G.gcBrgDeg,
    () => false, () => { ended.push(1); taxi.on = false; });
  const where = M.where, wrong = M.wrong;
  // the model landed on 04 at 14:00:45 from fix 1 (13:59:46)
  const r1 = lib(27, DH4).runwayFinalPath(FIX1, YOW, 'YOW');
  assert.ok(same(r1.rw.t, THR04));
  const since = T2 + 15000;   // 14:00:45
  Object.assign(taxi, { since, anchorAt: since, fixAt: T1, rw: r1.rw });
  // a fix before fix 1 is the one it was carried from: the model stands
  const old = { kind: 'fix', leg: 'in', onGround: false, lat: 45.28, lng: -75.73, at: T1 - 60000, alt: 1800, spd: 140 };
  assert.equal(where(old, inb, since + 30000, 'YOW').anchor, 'model');
  // fix 2: 14:00:30, older than the taxi (14:00:45), newer than fix 1, 0.8 nm off the 04 centreline, 135 kt at 625 ft
  const fix2 = { kind: 'fix', leg: 'in', onGround: false, lat: FIX2[0], lng: FIX2[1], at: T2, alt: 625, spd: 135 };
  assert.equal(wrong(fix2, taxi), true);
  assert.equal(where(fix2, inb, since + 30000, 'YOW'), null, 'the landing was wrong: the fix is the answer');
  assert.equal(ended.length, 1, 'and the taxi ended');
  // a newer fix ON the 04 centreline, short of the threshold (a late fix of the same landing): the model stands
  Object.assign(taxi, { on: true });
  const onFinal04 = G.gcDestPt(THR04, (27 + 180) % 360, 0.3);
  const fixOn = { kind: 'fix', leg: 'in', onGround: false, lat: onFinal04[0], lng: onFinal04[1], at: T2, alt: 300, spd: 120 };
  assert.equal(wrong(fixOn, taxi), false);
  assert.equal(where(fixOn, inb, since + 30000, 'YOW').anchor, 'model');
  assert.equal(ended.length, 1);
  // the ground fix (14:03:04, 19 kt, 1.3 nm off the 04 centreline) with a ground flag that lags: a taxi, never a go-around
  const gndAir = { kind: 'fix', leg: 'in', onGround: false, lat: GND[0], lng: GND[1], at: TG, alt: 0, spd: 19 };
  assert.equal(wrong(gndAir, taxi), false, '19 kt is not in the air');
  assert.equal(wrong(Object.assign({}, fix2, { alt: 150 }), taxi), false, '150 ft is not in the air');
  assert.equal(wrong(Object.assign({}, fix2, { spd: undefined, alt: undefined }), taxi), true, 'a fix with no speed or altitude is judged on its position');
  // through the answer: a taxi the model started after that fix keeps its model anchor on it
  Object.assign(taxi, { since: TG + 60000, anchorAt: TG + 60000 });
  assert.equal(where(gndAir, inb, TG + 90000, 'YOW').anchor, 'model');
  assert.equal(ended.length, 1, 'no second end');
  // a ground fix at the field is as before: the fix re-times or re-routes
  Object.assign(taxi, { since, anchorAt: since });
  const gnd = { kind: 'fix', leg: 'in', onGround: true, lat: GND[0], lng: GND[1], at: TG, spd: 19 };
  assert.equal(where(gnd, inb, TG + 20000, 'YOW').anchor, 'fix');
  // a taxi that did not land on the model (the feed, a fix) is never un-landed by this rule
  assert.equal(wrong(fix2, Object.assign({}, taxi, { anchor: 'land' })), false);
  assert.equal(wrong(fix2, Object.assign({}, taxi, { rw: null })), false);
});

test('the glide wires it: the pick goes through _gateGlideRunwayPick, an ambiguous runway holds SHORT, a new leg and a finished taxi forget the pick, the taxi keeps fixAt and rw', () => {
  const glide = fnSource('_startGateMapGlide');
  assert.match(glide, /_gateGlideRunwayPick\(_rwFinal\.rw, fixAt, /);
  assert.doesNotMatch(glide, /_gateGlide\.rw = _rwFinal\.rw/);
  // the v24088 established cap stays word for word (tests/gate-approach-map.test.js pins it); the ambiguous hold is its own block
  assert.match(glide, /if \(_rwFinal && n >= 3 && !_gateOnFinal\(_pl, route\[n - 2\], route\[n - 1\], _gateMapFixAlt\(planeLat, planeLng\)\)\) \{/);
  assert.match(glide, /_drCapP = Math\.min\(_drCapP, _seedP >= _preP \? Math\.max\(_seedP, _thrP\) : _preP\);/);
  // hold short, as a non-established approach does: a mile, or a quarter of what was left, never on the threshold
  assert.match(glide, /if \(_rwFinal && n >= 3 && _rwFinal\.rw\.ambiguous === true\) \{\s*var _thrA = _cum\[n - 2\], _seedA = _seedP \* _routeNm;\s*_drCapP = Math\.min\(_drCapP, Math\.max\(_seedP, \(_thrA - Math\.max\(1, 0\.25 \* \(_thrA - _seedA\)\)\) \/ _routeNm\)\);\s*\}/);
  assert.doesNotMatch(glide, /_drCapP = Math\.min\(_drCapP, Math\.max\(_seedP, _cum\[n - 2\] \/ _routeNm\)\);/, 'not parked on the threshold');
  // a leg change forgets the pick BEFORE the new pick is made
  const legClear = glide.search(/if \(_gateGlide\.rw && _gateGlide\.o && _gateGlide\.d && !\(_gateGlideSameLeg\(_gateGlide\.o, o\) && _gateGlideSameLeg\(_gateGlide\.d, d\)\)\) \{\s*_gateGlide\.rw = null; _gateGlide\.rwFl = ''; _gateGlide\.rwFix = 0; _gateGlide\.rwAt = 0;/);
  assert.ok(legClear >= 0, 'a leg change clears the pick');
  assert.ok(legClear < glide.indexOf('var _rwFinal = _runwayFinalPath(_pl, d, destIata);'), 'before the pick');
  // an ambiguous pick is never landed on
  assert.match(fnSource('_gateLands'), /if \(rw\.past\) return true;\s*(\/\/[^\n]*\n\s*)*if \(rw\.ambiguous === true\) return false;/);
  // the taxi remembers what it landed from, and the un-land path ends it
  assert.match(fnSource('_gateTaxiFromGlide'), /st\.fixAt = \(_gateGlide\.fixAt > 0\) \? _gateGlide\.fixAt : 0; st\.rw = rw;/);
  assert.match(fnSource('_gateTaxiWhere'), /if \(typeof _gateTaxiWrongRunway === 'function' && _gateTaxiWrongRunway\(res, st\)\) \{\s*_gateTaxiEnd\(\);\s*try \{ _gateGlide\.p = null; _gateGlide\.ll = null; \} catch \(eG\) \{\}\s*return null;/);
  // the remembered runway is not reused while ambiguous (the feed's Arrived, a ground fix)
  assert.match(fnSource('_gateTaxiWhere'), /var rwP = \(_gateGlide\.rw && _gateGlide\.rw\.ambiguous !== true && _gateGlide\.rwFl === fl && t - \(_gateGlide\.rwAt \|\| 0\) < 40 \* 60000\) \? _gateGlide\.rw : null;/);
  assert.match(fnSource('_gateTaxiApply'), /var rwG = \(_gateGlide\.rw && _gateGlide\.rw\.ambiguous !== true && _gateGlide\.rwFl === fl\) \? _gateGlide\.rw : null;/);
  // a finished taxi forgets the pick
  const taxiSt = { gen: 0, raf: null, on: true, plan: {}, views: {}, done: true, key: 'k', fl: 'AC450' };
  const g = { rw: { t: THR07 }, rwFl: 'AC450', rwFix: T1, rwAt: Date.now() };
  new Function('_gateTaxi', '_gateGlide', fnSource('_gateTaxiEnd') + '\nreturn _gateTaxiEnd;')(taxiSt, g)();
  assert.equal(taxiSt.on, false);
  assert.equal(g.rw, null);
  assert.equal(g.rwFl, '');
  assert.equal(g.rwFix, 0);
  assert.equal(g.rwAt, 0);
});

test('the committed runway is not reused while ambiguous: _rwCommitted says null for an ambiguous, stale, or other-flight pick', () => {
  const C = (glide, win) => new Function('_gateGlide', 'window', fnSource('_rwCommitted') + '\nreturn _rwCommitted;')(glide, win)();
  const rw = { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: false };
  const win = { _gateInbound: { flight: 'PD2366' } };
  assert.equal(C({ rw, rwAt: Date.now() - MIN, rwFl: 'PD2366' }, win), rw);
  assert.equal(C({ rw: Object.assign({}, rw, { ambiguous: true }), rwAt: Date.now() - MIN, rwFl: 'PD2366' }, win), null, 'ambiguous');
  assert.equal(C({ rw, rwAt: Date.now() - 41 * MIN, rwFl: 'PD2366' }, win), null, '41 minutes old');
  assert.equal(C({ rw, rwAt: Date.now() - MIN, rwFl: 'PD2367' }, win), null, 'another flight');
  assert.equal(C({ rw, rwAt: Date.now() - MIN, rwFl: '' }, { _gateInbound: {} }), null, 'no flight named');
  assert.equal(C({ views: {} }, win), null, 'nothing picked');
  assert.equal(C(undefined, win), null, 'no glide state (the sliced harness)');
  // the panel's inbound serves when the board has none
  assert.equal(C({ rw, rwAt: Date.now() - MIN, rwFl: 'PD2366' }, { _gatePanelInbound: { flight: 'PD2366' } }), rw);
});

// PD2366 YYG-YOW (Dash 8-400), 2026-11-07, OpenSky fixes: lat, lng, kt, ft, time (ADT)
const PD2366 = [
  [45.4830, -75.0730, 250, 14000, [14, 15, 39]], [45.4617, -75.1207, 232, 13425, [14, 16, 15]], [45.4213, -75.2099, 243, 12350, [14, 17, 23]],
  [45.3798, -75.3028, 250, 11225, [14, 18, 31]], [45.3375, -75.3962, 247, 10075, [14, 19, 39]], [45.3169, -75.4425, 242, 9500, [14, 20, 13]],
  [45.2758, -75.5345, 236, 8375, [14, 21, 23]], [45.2356, -75.6233, 235, 7300, [14, 22, 31]], [45.1960, -75.7114, 224, 6225, [14, 23, 40]],
  [45.1768, -75.7543, 216, 5700, [14, 24, 15]], [45.1788, -75.8341, 207, 4425, [14, 25, 22]], [45.2341, -75.8414, 196, 3200, [14, 26, 31]],
  [45.2657, -75.7772, 153, 2175, [14, 27, 39]], [45.2776, -75.7505, 144, 1775, [14, 28, 12]], [45.2989, -75.7035, 114, 1000, [14, 29, 20]],
  [45.3118, -75.6747, 112, 525, [14, 30, 6]]
].map((f) => ({ pl: [f[0], f[1]], kt: f[2], ft: f[3], at: Date.UTC(2026, 10, 7, f[4][0] + 3, f[4][1], f[4][2]), label: f[4].map((x) => String(x).padStart(2, '0')).join(':') + ' ' + f[3] + ' ft' }));

test('PD2366 into Ottawa: once 07 is committed on the final, no later fix re-picks 04; the 525 ft fix, 0.18 nm short of the threshold, keeps 07 and lands', () => {
  // the board as it was: no live track for the OpenSky fixes, a Dash 8-400 on the gate
  const glide = { views: {} };
  const win = { _gateInbound: { flight: 'PD2366' } };
  const G = lib(undefined, DH4, glide, win);
  const P = pickFn(glide);
  const picks = [];
  for (const f of PD2366) {
    const r = G.runwayFinalPath(f.pl, YOW, 'YOW');
    assert.ok(r && r.rw, f.label + ': a runway final');
    P(r.rw, f.at, 'PD2366');   // what _startGateMapGlide does with the pick
    const n = r.length;
    picks.push({ label: f.label, hdg: Math.round(r.rw.hdg), amb: r.rw.ambiguous, past: r.rw.past, lands: G.gateLands(f.pl, r.rw, r[n - 2], r[n - 1], f.ft) });
  }
  // before the final the bearing to the field chooses as before (the board showed 25, 32, 04, then 07)
  assert.deepEqual(picks.slice(0, 12).map((p) => p.hdg), [237, 237, 237, 237, 237, 237, 306, 306, 27, 27, 27, 57], JSON.stringify(picks));
  // on the base at 3,200 ft the fix is on the 07 centreline 8.6 nm out: 07, plain
  assert.equal(picks[11].amb, false);
  // the 2,175 ft fix commits 07; from here every pick is 07, none ambiguous, and every one lands
  const final = picks.slice(12);
  assert.deepEqual(final.map((p) => p.hdg), [57, 57, 57, 57], JSON.stringify(final));
  assert.deepEqual(final.map((p) => p.amb), [false, false, false, false], 'never ambiguous once committed: ' + JSON.stringify(final));
  assert.deepEqual(final.map((p) => p.lands), [true, true, true, true], JSON.stringify(final));
  // the 1,000 ft fix is within 0.3 nm of BOTH centrelines (0.21 nm off 04): the committed 07 is kept, not re-weighed
  assert.equal(picks[14].hdg, 57);
  // the 525 ft fix is short of the threshold, not past it: the short final, then touchdown
  assert.equal(picks[15].past, false);
  assert.ok(same(glide.rw.t, THR07));
  // the same fix list without the memory of the pick shows the fault this pins: 04 at 525 ft, not landing
  const G0 = lib(undefined, DH4);
  const r0 = G0.runwayFinalPath(PD2366[15].pl, YOW, 'YOW');
  assert.equal(Math.round(r0.rw.hdg), 27, 'without the committed runway the bearing to the field picks 04');
  assert.equal(G0.gateLands(PD2366[15].pl, r0.rw, r0[r0.length - 2], r0[r0.length - 1], 525), false, 'and it does not land: the marker froze short of 04');
});

test('the committed runway is kept from 1 nm past the threshold out to 12 nm on its centreline, and no further', () => {
  const rw07 = { t: THR07, f: FAR07, hdg: 57.1, nm: 1.3, past: false, ambiguous: false };
  const win = { _gateInbound: { flight: 'PD2366' } };
  const G = (glide) => lib(undefined, DH4, glide, win);
  const fresh = () => ({ views: {}, rw: rw07, rwAt: Date.now() - MIN, rwFl: 'PD2366', rwFix: T1 });
  const out = (nm, off) => {
    const on = G().gcDestPt(THR07, (57.1 + 180) % 360, nm);
    return off ? G().gcDestPt(on, (57.1 + 90) % 360, off) : on;
  };
  // on the centreline: kept, out to 12 nm
  for (const nm of [0.1, 0.18, 0.29, 0.5, 2, 6, 11.5]) {
    const r = G(fresh()).runwayFinalPath(out(nm), YOW, 'YOW');
    assert.ok(same(r.rw.t, THR07), nm + ' nm out on the 07 centreline: 07, got ' + r.rw.hdg.toFixed(0));
    assert.equal(r.rw.ambiguous, false);
  }
  // just past the threshold: rw.past, on 07
  const past = G(fresh()).runwayFinalPath(G().gcDestPt(THR07, 57.1, 0.3), YOW, 'YOW');
  assert.ok(same(past.rw.t, THR07));
  assert.equal(past.rw.past, true);
  // 0.4 nm off the centreline at 2 nm: not on it any more, the ordinary rules choose
  const offC = G(fresh()).runwayFinalPath(out(2, 0.4), YOW, 'YOW');
  assert.ok(offC && offC.rw);
  // the 04 crossing fix for the same flight with 07 committed: kept on 07 (it is on both)
  const atX = G(fresh()).runwayFinalPath(FIX1, YOW, 'YOW');
  assert.ok(same(atX.rw.t, THR07));
  assert.equal(atX.rw.ambiguous, false);
  // but an AMBIGUOUS committed pick is not kept: the crossing fix is weighed again
  const ambG = Object.assign(fresh(), { rw: Object.assign({}, rw07, { ambiguous: true }) });
  const again = G(ambG).runwayFinalPath(FIX1, YOW, 'YOW');
  assert.equal(again.rw.ambiguous, true, 'a Dash 8 at the crossing with nothing confirmed: still ambiguous');
  // another flight committed 07: this one is weighed on its own
  const other = G(Object.assign(fresh(), { rwFl: 'AC450' })).runwayFinalPath(PD2366[15].pl, YOW, 'YOW');
  assert.equal(Math.round(other.rw.hdg), 27, 'another flight: the ordinary rule (04 from the bearing to the field)');
});

test('the Orlando parallels are untouched: UA2779 on 35R is not ambiguous and lands', () => {
  const G = lib(359);
  const MCO = COORDS.MCO, UA2779 = [28.2807, -81.281];
  const r = G.runwayFinalPath(UA2779, MCO, 'MCO');
  assert.ok(same(r.rw.t, [28.4189, -81.2823]));
  assert.equal(r.rw.ambiguous, false);
  assert.equal(G.gateLands(UA2779, r.rw, r[r.length - 2], r[r.length - 1], 2650), true);
});

test('an arrival with no approach seen (the feed, a ground fix): a jet is never routed from a runway under 1,500 m while a longer one exists; a turboprop may be', () => {
  const endsFor = (spec) => new Function('AIRPORT_RUNWAYS', '_lookupAirport', '_gcNm', '_gcBrgDeg', '_rwPlaneSpec',
    fnSource('_gateTaxiRunwayEnds') + '\nreturn _gateTaxiRunwayEnds;')(RUNWAYS, (ia) => COORDS[ia], lib().gcNm, lib().gcBrgDeg, () => spec);
  const G = lib();
  const len = (e) => G.gcNm(e.t, e.f) * 1852;
  // from Toronto (bearing about 60): a jet lands on 07, never 04 (951 m)
  const jet = endsFor({ prop: false, known: true })('YOW', 'YYZ');
  assert.ok(jet.length >= 1);
  for (const e of jet) assert.ok(len(e) >= 1500, 'a jet end of ' + len(e).toFixed(0) + ' m');
  assert.ok(same(jet[0].t, THR07), 'into the wind from Toronto: 07, got ' + jet[0].hdg.toFixed(0));
  const unnamed = endsFor({ prop: false, known: false })('YOW', 'YYZ');
  for (const e of unnamed) assert.ok(len(e) >= 1500, 'an unnamed type is a jet here');
  // a turboprop from Charlottetown (bearing about 250): the short pair stays in the list of candidates
  const propAll = endsFor({ prop: true, known: true })('YOW', 'XXX');   // no origin known: every end
  assert.equal(propAll.length, 6);
  assert.ok(propAll.some((e) => len(e) < 1500), 'a Dash 8 may use 04/22');
  const jetAll = endsFor({ prop: false, known: false })('YOW', 'XXX');
  assert.equal(jetAll.length, 4, 'a jet: 07/25 and 14/32 only');
  // and where every runway is short, nothing is dropped
  const RW1 = { ZZZ: [[45.0, -75.0, 45.005, -75.0]] };
  const short = new Function('AIRPORT_RUNWAYS', '_lookupAirport', '_gcNm', '_gcBrgDeg', '_rwPlaneSpec',
    fnSource('_gateTaxiRunwayEnds') + '\nreturn _gateTaxiRunwayEnds;')(RW1, () => null, G.gcNm, G.gcBrgDeg, () => ({ prop: false, known: true }))('ZZZ', 'YYZ');
  assert.equal(short.length, 2);
});

test('across the table: a fix on a lone centreline is never ambiguous; a crossing inside 5 nm of both thresholds is; a crossing further out keeps the old pick', () => {
  const G = lib();
  let n = 0, amb = 0, far = 0;
  for (const ap of Object.keys(RUNWAYS)) {
    if (!COORDS[ap]) continue;
    const E = [];
    for (const rr of RUNWAYS[ap]) { const a = [rr[0], rr[1]], b = [rr[2], rr[3]]; E.push({ t: a, f: b }, { t: b, f: a }); }
    E.forEach((e) => { e.hdg = G.gcBrgDeg(e.t, e.f); e.len = G.gcNm(e.t, e.f) * 1852; });
    for (const e of E) {
      for (const nm of [8, 4, 2]) {
        const pl = G.gcDestPt(e.t, (e.hdg + 180) % 360, nm);
        const r = G.runwayFinalPath(pl, COORDS[ap], ap);
        if (!r) continue;
        n++;
        // which other ends is this fix on (crossing, not parallel), and how far from their thresholds?
        const near = E.filter((o) => {
          if (o === e || Math.abs(((o.hdg - e.hdg + 540) % 360) - 180) <= 3) return false;
          const d = G.gcNm(o.t, pl), b = (G.gcBrgDeg(o.t, pl) - o.hdg) * Math.PI / 180;
          const al = -d * Math.cos(b), xt = Math.abs(d * Math.sin(b));
          const diff = Math.abs(((G.gcBrgDeg(pl, COORDS[ap]) - o.hdg + 540) % 360) - 180);
          o._al = al;
          return al > 0.3 && al < 12 && xt < 0.3 && diff <= 60;
        });
        const diffE = Math.abs(((G.gcBrgDeg(pl, COORDS[ap]) - e.hdg + 540) % 360) - 180);
        if (!near.length || diffE > 60) { assert.notEqual(r.rw.ambiguous, true, ap + ' ' + e.hdg.toFixed(0) + ' ' + nm + ' nm: a lone centreline is not ambiguous'); continue; }
        const inside = nm < 5 && near.some((o) => o._al < 5);
        if (!inside) {
          // a crossing beyond 5 nm of one threshold or the other: the old rule, this end, not flagged
          far++;
          assert.notEqual(r.rw.ambiguous, true, ap + ' ' + e.hdg.toFixed(0) + ' ' + nm + ' nm: a far crossing is not flagged');
          assert.ok(same(r.rw.t, e.t), ap + ' ' + e.hdg.toFixed(0) + ' ' + nm + ' nm: the nearest centreline as before');
          continue;
        }
        amb++;
        assert.equal(r.rw.ambiguous, true, ap + ' ' + e.hdg.toFixed(0) + ' ' + nm + ' nm crosses ' + near.map((o) => o.hdg.toFixed(0)).join(','));
        const longest = Math.max(e.len, ...near.filter((o) => o._al < 5).map((o) => o.len));
        if (longest >= 1500) assert.ok(r.rw.nm * 1852 >= 1500, ap + ' ' + e.hdg.toFixed(0) + ': a jet on ' + (r.rw.nm * 1852).toFixed(0) + ' m with ' + longest.toFixed(0) + ' m as close');
      }
    }
  }
  assert.ok(n > 3000, 'the table: ' + n);
  assert.ok(amb > 0, 'some crossings exist inside 5 nm: ' + amb);
  assert.ok(far > 0, 'and some further out (BRU, SLC, BOS, DEL, ...): ' + far);
  console.log('    ambiguous fixes in the table:', amb, 'of', n, '; far crossings left as they were:', far);
});
