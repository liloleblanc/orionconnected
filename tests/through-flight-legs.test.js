'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23878 — A THROUGH FLIGHT HAS MORE THAN ONE DESTINATION.
//
// MCO-EWR-SFO reported San Francisco's weather and San Francisco's hotels and
// said nothing at all about Newark, where a large part of the cabin gets off.
// Both consumers read _locIata, the last stop, and the rest of the ticket was
// simply not looked at.
//
// The legs are taken in turn now, off ONE shared index, so a pass that shows
// Newark's weather also shows Newark's hotels — never one city's sky beside
// another city's beds.
//
// The tests that matter most here are the ones about NOT rotating: an ordinary
// single-destination flight must behave exactly as it did, and a leg whose
// data has not arrived must be passed over rather than shown empty.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

function load() {
  const legs = CORE.match(/function _flightLegs\(cf\) \{[\s\S]*?\n\}/);
  const pick = CORE.match(/function _legForNow\(cf, fallback, has\) \{[\s\S]*?\n\}/);
  assert.ok(legs, '_flightLegs must exist');
  assert.ok(pick, '_legForNow must exist');
  // eslint-disable-next-line no-new-func
  return new Function('window',
    legs[0] + '\n' + pick[0] + '\nreturn { _flightLegs, _legForNow };');
}

const mk = (...iatas) => ({ _stops: iatas.map((i) => ({ iata: i, city: i })) });
const all = () => true;

test('a single-destination flight does not rotate at all', () => {
  const w = {};
  const { _flightLegs, _legForNow } = load()(w);
  assert.deepEqual(_flightLegs(mk('SFO')), [], 'one stop is not a set of legs');
  assert.deepEqual(_flightLegs({}), [], 'no stops at all is not a set of legs');
  for (let i = 0; i < 4; i++) {
    w._wxLegIdx = i;
    assert.equal(_legForNow(mk('SFO'), 'SFO', all), 'SFO', 'the fallback is kept on every tick');
  }
});

test('a through flight takes its legs in turn', () => {
  const w = {};
  const { _legForNow } = load()(w);
  const f = mk('EWR', 'SFO');
  const seen = [];
  for (let i = 0; i < 6; i++) { w._wxLegIdx = i; seen.push(_legForNow(f, 'SFO', all)); }
  assert.deepEqual(seen, ['EWR', 'SFO', 'EWR', 'SFO', 'EWR', 'SFO']);
  assert.ok(seen.includes('EWR'), 'the via stop is actually reached');
});

test('weather and hotels land on the SAME leg', () => {
  const w = { _wxLegIdx: 0 };
  const { _legForNow } = load()(w);
  const f = mk('EWR', 'SFO');
  for (let i = 0; i < 5; i++) {
    w._wxLegIdx = i;
    const forWeather = _legForNow(f, 'SFO', all);
    const forHotels = _legForNow(f, 'SFO', all);
    assert.equal(forWeather, forHotels, `tick ${i}: the two must agree`);
  }
});

test('a leg whose data has not arrived is passed over, not shown empty', () => {
  const w = {};
  const { _legForNow } = load()(w);
  const f = mk('EWR', 'SFO');
  const onlySfo = (ia) => ia === 'SFO';
  for (let i = 0; i < 4; i++) {
    w._wxLegIdx = i;
    assert.equal(_legForNow(f, 'SFO', onlySfo), 'SFO',
      'with one usable leg there is nothing to rotate between');
  }
});

test('three legs all get a turn', () => {
  const w = {};
  const { _legForNow } = load()(w);
  const f = mk('EWR', 'ORD', 'SFO');
  const seen = new Set();
  for (let i = 0; i < 6; i++) { w._wxLegIdx = i; seen.add(_legForNow(f, 'SFO', all)); }
  assert.deepEqual([...seen].sort(), ['EWR', 'ORD', 'SFO']);
});

test('duplicate codes in the feed do not create a phantom leg', () => {
  const w = {};
  const { _flightLegs } = load()(w);
  assert.deepEqual(_flightLegs(mk('SFO', 'SFO')), [], 'the same stop twice is still one destination');
  assert.deepEqual(_flightLegs(mk('EWR', 'EWR', 'SFO')), ['EWR', 'SFO']);
});

test('the wiring is in place for both consumers', () => {
  assert.match(CORE, /dest = _wxLegForNow\(cf, dest\);/, 'the weather card picks a leg');
  assert.match(CORE, /destIata = _legForNow\(cf, destIata, function \(ia\) \{/, 'the ad deck picks a leg');
  assert.match(CORE, /_wxAdvanceLeg\(window\._gateCurrentFlight\)/, 'the weather card advances the shared index');
  assert.match(CORE, /if \(typeof fetchAccorHotels === 'function'\) fetchAccorHotels\(ia\);/,
    'hotels are fetched for every leg');
  assert.match(CORE, /\.concat\(_wxLegs\.map\(function \(ia\) \{ return fetchTomorrowWeather\(ia\); \}\)\)/,
    'weather is fetched for every leg');
});
