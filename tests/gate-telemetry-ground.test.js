'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24126 — THE DIGITS UNDER THE MAP ON FINAL AND ON THE GROUND.
//
// Moncton gate 1, PD2293 from Billy Bishop, 2026-11-07 13:17-13:37 ADT, a
// Dash 8-400 watched from 22 km out to the stand (the recorder read the
// screen every four seconds):
//
//   1. On final the altitude read 512 ft, then 1,167 ft, then down again, 3 km
//      out. A fix 35 s old (FR24 says how old) re-anchored the model at the
//      moment it arrived, so the carried descent restarted from a height the
//      aeroplane had already left. The anchor now sits at the fix's own time,
//      and while the measured trend is down the digits never rise to meet a
//      fresh anchor above them: they hold until the model comes down past.
//   2. From touchdown to the stand the speed read 215 km/h (the last reading
//      in the air, 116 kt) and the distance 1 km. On the ground the speed is
//      the taxi the map draws, never above that last reading, 0 once parked;
//      the distance is the drawn aeroplane's to the field, 0 at the stand.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
const YHZ = [44.8808, -63.5086];

// The animator's functions with the taxi state and the field stubbed.
function sandbox(T, taxi, livePos) {
  const src = [fnSource('_gcNm'), fnSource('_gateTelemSpotNm'), fnSource('_gateTelemPathFloorFt'), fnSource('_gateTelemModel'),
    fnSource('_gateTelemDistKm'), fnSource('_gateTelemSetReal'), fnSource('_taxiIdx'), fnSource('_taxiVAtS'),
    'function _writeGateTelemDom() {}',
    'return { model: _gateTelemModel, dist: _gateTelemDistKm, setReal: _gateTelemSetReal };'].join('\n');
  const win = { _gateTelemAnim: T, _gateIata: 'YHZ', _gateInbound: { flight: 'AC7673' }, _gateMapFix: null, _gateInboundLivePos: livePos || null };
  const mine = () => !!(taxi && taxi.on);
  return new Function('window', '_gateGlide', '_lookupAirport', 'AIRPORT_COORDS', '_gateTaxiMine', '_gateTaxi', src)(
    win, { raf: false, ll: null, d: YHZ, fl: 'AC7673' }, (i) => (i === 'YHZ' ? YHZ : null), { YHZ: YHZ }, mine, taxi || {});
}
// A roll-out and taxi plan: 70 m/s at touchdown, 10 m/s along the taxiway, 0 at the stand.
const PLAN = { s: [0, 500, 1500, 2000], v: [70, 10, 10, 0] };

test('the anchor sits at the fix\'s own time, when known and sane', () => {
  const now = Date.now();
  const T = { spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0 };
  const S = sandbox(T, null);
  S.setReal(150, 3000, now - 35000);
  assert.ok(Math.abs(T.realTs - (now - 35000)) < 50, 'anchored 35 s back: ' + (now - T.realTs));
  S.setReal(140, 2500, now - 5000);
  assert.ok(Math.abs(T.prevTs - (now - 35000)) < 50, 'the previous anchor kept its own time');
  assert.ok(Math.abs(T.realTs - (now - 5000)) < 50, 'the new one at 5 s back');
  S.setReal(140, 2500, now - 1000);
  assert.ok(Math.abs(T.realTs - (now - 5000)) < 50, 'an unchanged reading keeps drifting from its anchor');
  S.setReal(130, 2200, now + 60000);
  assert.ok(Math.abs(T.realTs - Date.now()) < 200, 'a time in the future is not believed: now');
  S.setReal(120, 2000, now - 11 * 60000);
  assert.ok(Math.abs(T.realTs - Date.now()) < 200, 'nor one older than ten minutes');
  S.setReal(110, 1800);
  assert.ok(Math.abs(T.realTs - Date.now()) < 200, 'no time given: now, as before');
  assert.match(CORE, /_gateTelemSetReal\(_adsb\.spd, _adsb\.alt, \(typeof _fxAt === 'number'\) \? _fxAt : undefined\)/,
    'the ADS-B poll hands over the fix\'s own time');
});

test('on the ground the speed is the taxi the map draws, never above the last reading, 0 parked', () => {
  const T = { realSpd: 116, realAlt: 275, realTs: Date.now() - 20000 };
  let m = sandbox(T, { on: true, plan: PLAN, s: 0, done: false }).model();
  assert.equal(m.alt, 0);
  assert.equal(m.spd, 116, 'rolling out at 70 m/s (136 kt) reads the 116 kt it landed with: ' + m.spd);
  m = sandbox(T, { on: true, plan: PLAN, s: 1000, done: false }).model();
  assert.ok(Math.abs(m.spd - 10 / 0.514444) < 0.01, 'on the taxiway 10 m/s = 19.4 kt: ' + m.spd);
  m = sandbox(T, { on: true, plan: PLAN, s: 2000, done: true }).model();
  assert.equal(m.spd, 0, 'parked');
  m = sandbox({ realSpd: null, realAlt: 0, realTs: Date.now() }, { on: true, plan: PLAN, s: 1000, done: false }).model();
  assert.ok(Math.abs(m.spd - 10 / 0.514444) < 0.01, 'no reading from the air: the taxi speed as it is');
  // a ground fix with no taxi (the paid feed saw it on the apron) keeps its own speed
  m = sandbox({ realSpd: 12, realAlt: 0, realTs: Date.now() }, null, { onGround: true }).model();
  assert.deepEqual(m, { spd: 12, alt: 0 });
});

test('the distance follows the taxi: to the field while rolling, 0 at the stand, only this flight\'s', () => {
  const oneKmNorth = [44.8898, -63.5086];
  assert.equal(sandbox({}, { on: true, fl: 'AC7673', ll: oneKmNorth, done: false }).dist(), 1);
  assert.equal(sandbox({}, { on: true, fl: 'AC7673', ll: oneKmNorth, done: true }).dist(), 0, 'parked');
  assert.equal(sandbox({}, { on: true, fl: 'AC7673', ll: oneKmNorth, done: false }).dist('AC7673'), 1, 'asked for by name');
  assert.equal(sandbox({}, { on: true, fl: 'AC7673', ll: oneKmNorth, done: false }).dist('AC7677'), null, 'another flight: the built number stays');
  assert.equal(sandbox({}, { on: false }).dist(), null, 'no taxi, no glide: as before');
});

test('Arrives in N min counts down to the airport\'s new time, early as well as late', () => {
  // Ottawa gate 21, PD2366 from Charlottetown, 2026-11-07: scheduled 13:55,
  // early at 13:18; at 13:13 the card printed "1:18pm" and "Arrives in 41 min".
  const later = new Function(fnSource('_gateLaterTs') + '\nreturn _gateLaterTs;')();
  const sched = Date.parse('2026-11-07T18:55:00Z'), rev = Date.parse('2026-11-07T18:18:00Z');
  assert.equal(later({ status: 'early', upd: '13:18', _sortTs: sched, _revTs: rev }), rev, 'early: the new time');
  assert.equal(later({ status: 'delayed', upd: '14:30', _sortTs: sched, _revTs: sched + 2100000 }), sched + 2100000, 'delayed: the new time');
  assert.equal(later({ status: 'ontime', upd: '13:18', _sortTs: sched, _revTs: rev }), sched, 'no word: the schedule');
  // every inbound card measures its minutes with it
  const hits = CORE.match(/var _effArrTs = _gateLaterTs\((_inb|inboundFlight)\);/g) || [];
  assert.equal(hits.length, 2, 'the phone card and the v2 rail: ' + hits.length);
  assert.match(CORE, /const _inbEta = _gateLaterTs\(inboundFlight\);\s*if \(_inbEta\) \{\s*const minsOut = Math\.round\(\(_inbEta - Date\.now\(\)\) \/ 60000\);/, 'the g8 inbound block');
  assert.doesNotMatch(CORE, /_arrRevTs > _arrTs/, 'the later-only rule is gone');
});

test('a descent never reads as a climb: a fresh anchor above the digits holds them', () => {
  const src = [fnSource('_animateGateTelem'), 'function _writeGateTelemDom() {}', 'return _animateGateTelem;'].join('\n');
  const run = (T, m) => { new Function('window', '_gateTelemModel', src)({ _gateTelemAnim: T }, () => m)(); return T; };
  let T = run({ spd: 90, alt: 512 }, { spd: 116, alt: 1167, desc: true });
  assert.equal(T.alt, 512, 'held on a measured descent');
  assert.ok(T.spd > 90, 'the speed still eases');
  T = run({ spd: 90, alt: 512 }, { spd: 116, alt: 1300, desc: false });
  assert.ok(T.alt > 512, 'a measured climb (a go-around) rises: ' + T.alt);
  T = run({ spd: 90, alt: 512 }, { spd: 100, alt: 400, desc: true });
  assert.ok(T.alt < 512 && T.alt > 400, 'and it comes down past the hold: ' + T.alt);
  T = run({ spd: null, alt: null }, { spd: 116, alt: 1300, desc: true });
  assert.equal(T.alt, 1300, 'a first anchor is written as it is');
  // the model says which way the trend runs
  assert.match(fnSource('_gateTelemModel'), /_desc = altRate < 0;/);
  assert.match(fnSource('_gateTelemModel'), /return \{ spd: spd, alt: alt, desc: _desc \};/);
});
