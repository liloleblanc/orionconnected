'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24115 — A LEG IS NOT IN THE AIR HOURS BEFORE IT CAN BE.
//
// Moncton gate 3, 2026-11-05 at 10:33: PD2293 from Billy Bishop, due 13:27 on
// a two hour hop and still in Toronto, showed "En route", 648 km/h and 11,850
// ft, drawn beside Moncton from an OpenSky position of another aeroplane.
//   - A row with no flight time (Moncton gives none) was taken as four hours,
//     so its live window opened at 09:02 and every lookup since was believed.
//   - The ETA test only threw out a fix too far away to make it in time, never
//     one so close it would land hours early.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const fnSrc = (name) => {
  const a = CORE.indexOf('\nfunction ' + name + '(') + 1;
  assert.ok(a > 0, name + ' must exist');
  return CORE.slice(a, CORE.indexOf('\n}\n', a) + 2);
};

const YQM = [46.1122, -64.6786], YTZ = [43.6275, -79.3962], YYZ = [43.6772, -79.6306];
const AP = { YQM, YTZ, YYZ };
const lib = new Function('_lookupAirport', 'window', 'ARR_CONFIRM_MIN', '_gateIsProp',
  [fnSrc('_gcNm'), fnSrc('_fixCanReachByEta'), fnSrc('_fixTooEarlyForEta'), fnSrc('_gateArrEarliestTs'), fnSrc('_gateLegSpanMs'), fnSrc('_gateLegWindowOpen')].join('\n')
  + '\nreturn { _gcNm, _fixTooEarlyForEta, _gateArrEarliestTs, _gateLegSpanMs, _gateLegWindowOpen };')(
  (c) => AP[c] || null, { _gateIata: 'YQM' }, 30, (row) => /dash|dhc/i.test(String(row._aircraft || '')));

const MIN = 60000;
const ETA = Date.UTC(2026, 10, 5, 17, 27);           // 13:27 at Moncton
const pd2293 = { flight: 'PD2293', _locIata: 'YTZ', _aircraft: 'De Havilland Dash 8-400', _sortTs: ETA, _revTs: null };

test('without a flight time of its own, a two hour Dash 8 hop is not given four hours', () => {
  const span = lib._gateLegSpanMs(pd2293, 'YQM') / MIN;
  // 643 nm at 250 kt (a Dash 8-300 into a headwind is slower than a Q400) + 15 + 25
  assert.ok(span > 170 && span < 200, 'about three hours with the pad, not 265 minutes: ' + Math.round(span));
  // learning the type from the first live answer does not shrink a jet window
  const jetNoType = { flight: 'AC656', _locIata: 'YYZ', _sortTs: ETA };
  assert.equal(lib._gateLegSpanMs(jetNoType, 'YQM'), lib._gateLegSpanMs(Object.assign({}, jetNoType, { _aircraft: 'Airbus A220-300' }), 'YQM'));
});

test('the window is closed hours before a 13:27 arrival from Billy Bishop, open for the last two hours', () => {
  const realNow = Date.now;
  try {
    Date.now = () => Date.UTC(2026, 10, 5, 13, 30);
    assert.equal(lib._gateLegWindowOpen(pd2293, 'YQM'), false, '09:30: it has not left Toronto');
    Date.now = () => ETA - 100 * MIN;
    assert.equal(lib._gateLegWindowOpen(pd2293, 'YQM'), true, 'once it can be in the air');
    // a flight time of its own still wins, and no distance known keeps the old four hours
    Date.now = () => Date.UTC(2026, 10, 5, 13, 30);
    assert.equal(lib._gateLegWindowOpen(Object.assign({}, pd2293, { _durationMins: 240 }), 'YQM'), true);
    assert.equal(lib._gateLegSpanMs({ _locIata: 'XXX' }, 'YQM') / MIN, 265);
  } finally { Date.now = realNow; }
});

test('an aeroplane beside the field at 350 kt is not the flight due in three hours', () => {
  const now = Date.UTC(2026, 10, 5, 14, 33);
  const beside = [46.25, -64.55];                       // about 9 nm from Moncton
  assert.equal(lib._fixTooEarlyForEta(beside[0], beside[1], 350, YQM, ETA, now), true, 'as reported');
  assert.equal(lib._fixTooEarlyForEta(beside[0], beside[1], 350, YQM, now + 20 * MIN, now), false, 'due in 20 minutes: it is the inbound');
  assert.equal(lib._fixTooEarlyForEta(YTZ[0] + 0.3, YTZ[1] + 0.5, 300, YQM, ETA, now), false, 'climbing out of Toronto for a 13:27 arrival: fine');
  assert.equal(lib._fixTooEarlyForEta(beside[0], beside[1], undefined, YQM, ETA, now), true, 'no speed: 150 kt at least');
  // the stretch once the window is open (10:13 to 11:55): still not the inbound
  assert.equal(lib._fixTooEarlyForEta(beside[0], beside[1], 350, YQM, ETA, Date.UTC(2026, 10, 5, 15, 30)), true, '11:30');
  // a hold near the field: 30 nm out at 210 kt
  const hold = [46.6, -64.6];
  assert.equal(lib._fixTooEarlyForEta(hold[0], hold[1], 210, YQM, now + 75 * MIN, now), false, 'holding, due in 75 minutes');
});

test('an early flight and a stale delay are judged by the earliest time the row gives', () => {
  // the feed already says 45 minutes early: the revised time, not the schedule
  assert.equal(lib._gateArrEarliestTs({ _sortTs: ETA, _revTs: ETA - 45 * MIN }), ETA - 45 * MIN);
  // the row still says Delayed 15:00 while the aeroplane lands at 13:40: the schedule
  assert.equal(lib._gateArrEarliestTs({ _sortTs: ETA, _revTs: ETA + 93 * MIN }), ETA);
  assert.equal(lib._gateArrEarliestTs({ _sortTs: ETA, _revTs: null }), ETA);
  // PD2293 really landing at 13:40 under a stale 15:00: 140 nm out at 13:10 is the inbound
  const now = ETA - 17 * MIN, out140 = [44.9, -66.9];
  assert.equal(lib._fixTooEarlyForEta(out140[0], out140[1], 300, YQM, lib._gateArrEarliestTs({ _sortTs: ETA, _revTs: ETA + 93 * MIN }), now), false);
  // and the window opens from the earliest time too
  const realNow = Date.now;
  try {
    Date.now = () => ETA - 150 * MIN;
    assert.equal(lib._gateLegWindowOpen(Object.assign({}, pd2293, { _revTs: ETA + 93 * MIN }), 'YQM'), true);
  } finally { Date.now = realNow; }
});

test('the check is on every road a position comes in by: the poll, the maps and the panel', () => {
  assert.match(fnSrc('_fixPlausibleForLeg'), /if \(onGround !== true && _fixTooEarlyForEta\(lat, lng, \(typeof spdKt === 'number'\) \? spdKt : row\._liveSpd, dC, _gateArrEarliestTs\(row\), Date\.now\(\)\)\) return false;/);
  assert.match(fnSrc('_gateFixCheck'), /if \(h && arr && !c\.onGround && _fixTooEarlyForEta\(c\.lat, c\.lng, c\.spd, h, _gateArrEarliestTs\(inb\), now\)\) return false;/);
  // each path judges a fix by its own speed
  assert.match(CORE, /_fixPlausibleForLeg\(inb, _adsb\.lat, _adsb\.lng, _adsb\.onGround === true, _adsb\.spd\)/);
  assert.match(fnSrc('_gateLiveFix'), /src === 'adsb' \? \(c && c\.spd\) : row\._liveSpd\)/);
  // the panel needs only this field for the too-early half, and a rejected
  // reading clears the sticky fix and the hold
  assert.match(CORE, /if \(_cA && _cH && _candAlt !== null\) \{/);
  assert.match(CORE, /if \(window\._gateTelemHold && window\._gateTelemHold\.key === _cKey\) window\._gateTelemHold = null;/);
  assert.match(CORE, /\|\| \(_cArr && _fixTooEarlyForEta\(_cA\[0\], _cA\[1\], _candSpd, _cH, _cArr, Date\.now\(\)\)\)\) \{/);
  assert.match(CORE, /var _lwSpan = _gateLegSpanMs\(_ib, vars\.iata\);/);
  assert.match(fnSrc('_gateLegWindowOpen'), /var span = _gateLegSpanMs\(row, apIata\);/);
});

test('the speed and altitude panel reads only the live position of the flight it shows', () => {
  // switched from gate 4 (AC656 on approach) to gate 3 (PD2293 in Toronto)
  assert.match(CORE, /if \(_wpC && !\(_wpC\.fl && _wdg\(_wpC\.fl\) === _wdg\(_ib\.flight\)\)\) _wpC = null;/);
  assert.match(CORE, /if \(\(!_wp\._airport \|\| _wp\._airport === vars\.iata\) && _wpOwn\) \{/);
  // every writer of the shared position says whose it is
  const writers = CORE.split('window._gateInboundLivePos = ').slice(1).filter((w) => /^[\s(]*\{|^\(/.test(w) || /^\{/.test(w));
  for (const w of writers) assert.match(w.slice(0, 600), /\bfl: /, 'a writer without fl: ' + w.slice(0, 80));
});
