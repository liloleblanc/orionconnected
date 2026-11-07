'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24127 — EACH WEATHER PICTURE AT THE TIME IT STANDS FOR.
//
// 2026-11-05, late morning: weather cards showed night pictures in broad
// daylight. Since the clocks changed on 1 November it is dark by about 17:00
// in Moncton and Toronto, so a plate for an 18:00 departure is a night
// plate, and that is the rule: the departure picture at the departure time,
// the arrival picture at the arrival time. What did not follow it:
//   - with no arrival time published (Pearson arrivals blocked) the arrival
//     plate was read now, a day Toronto beside a night Moncton;
//   - the days screen took its picture and its scene at night when it was
//     night now or at the arrival, though days ahead are read by day;
//   - Billy Bishop had no picture of its own, day or night.
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

const AP = { YQM: [46.1122, -64.6786], YYZ: [43.6772, -79.6306], YTZ: [43.6275, -79.3962] };
const est = new Function('_lookupAirport', fnSrc('_gcNm') + fnSrc('_wxEstArrTs') + 'return _wxEstArrTs;')((c) => AP[c] || null);

test('an unpublished arrival is estimated from the departure and the flight', () => {
  const dep = Date.UTC(2026, 10, 5, 22, 20);                 // AC1987 YQM 18:20 AST
  const mins = (est('YQM', 'YYZ', dep) - dep) / 60000;
  assert.ok(mins > 100 && mins < 130, 'about two hours for Moncton to Toronto: ' + Math.round(mins));
  assert.equal(est('YQM', 'YYZ', 0), 0, 'no departure, no estimate');
  assert.equal(est('YQM', 'XXX', dep), 0, 'an airport not known, no estimate');
  assert.equal(est('YQM', 'YQM', dep), 0);
});

test('the arrival plate is read at the estimate, with no clock and no Now', () => {
  assert.match(CORE, /if \(!_wxArrTs && _wxDepTs\) _wxArrEst = _wxEstArrTs\(_wxOrig, dest, _wxDepTs\);/);
  assert.match(CORE, /var _sideR = _wxSide\(dest, _wxArrTs, _arrShort, 'wxc-mon-arr', _wxArrEst\);/);
  assert.match(CORE, /var _wxSide = function \(iata, ts, shortLbl, cls, estTs\) \{\s*var tw = ts \|\| estTs \|\| 0;\s*var w = _wxAtTime\(iata, tw\);/);
  // the clock is still only a published one, and Now only when nothing is known
  assert.match(CORE, /var when = _wxClock\(iata, ts\);/);
  assert.match(CORE, /if \(!ts && !estTs\) note = _wxPairT\(BoardStrings\.entry\('wxNowTitle'\)\);/);
});

test('the hours screen pictures its first hour, the days screen is by day', () => {
  assert.match(CORE, /_wxS2 = '<div class="wxc-screen wxc-s2">' \+ _wxBar \+ _wxBandAt\(_wxBand2Night\)/);
  assert.match(CORE, /if \(_wxHours\.length && typeof _wxHours\[0\]\.night === 'boolean'\) _wxBand2Night = _wxHours\[0\]\.night;/);
  assert.match(CORE, /_wxS3 = '<div class="wxc-screen wxc-s3">' \+ _wxBar \+ _wxBandAt\(false\)/);
  // and its footage by day too
  assert.match(CORE, /\/\/ v24127 — days ahead are by day, whatever the hour of arrival\s*var _dNight = false;/);
  assert.doesNotMatch(CORE, /_dNight = !!_wxNightAt\(dest, _wxArrTs \|\| Date\.now\(\)\)/);
});

test('Billy Bishop takes Toronto, by day and by night', () => {
  const pics = CORE.slice(CORE.indexOf('var _WX_CITY_PICS = {'), CORE.indexOf('\n};\n', CORE.indexOf('var _WX_CITY_PICS = {')));
  const night = CORE.slice(CORE.indexOf('var _WX_CITY_NIGHT = {'), CORE.indexOf('\n};\n', CORE.indexOf('var _WX_CITY_NIGHT = {')));
  assert.match(pics, /YTZ:'YYZ'/);
  assert.match(night, /YTZ:'YYZ'/);
});
