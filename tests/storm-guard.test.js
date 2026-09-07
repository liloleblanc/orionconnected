// Dead-ADB storm guard — the roster classifier that decides whether a
// flight-window request gets a clean empty 200 (non-roster, no feed) or
// falls through to the passthrough (roster airport, transient null → 429
// keeps last-good). Regression cover for the SJU 429-storm fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _authorityRosterHas } from '../workers/fids-proxy.js';

test('roster airports (registry + bespoke YHZ/YQM) are recognized', () => {
  for (const iata of ['YHZ', 'YQM', 'YOW', 'YQB', 'YEG', 'LHR', 'DUB', 'KEF', 'BOS', 'ORD', 'SFO', 'CLT', 'MAN', 'DCA']) {
    assert.equal(_authorityRosterHas(iata), true, `${iata} should be roster`);
  }
});

test('case-insensitive', () => {
  assert.equal(_authorityRosterHas('yhz'), true);
  assert.equal(_authorityRosterHas('Bos'), true);
});

test('non-roster airports are NOT recognized (they get the empty-200 short-circuit)', () => {
  for (const iata of ['SJU', 'XXX', 'ZZZ', 'CDG', 'AMS', 'ATL', 'YWG']) {
    assert.equal(_authorityRosterHas(iata), false, `${iata} should be non-roster`);
  }
});

test('garbage in → false, never throws', () => {
  assert.equal(_authorityRosterHas(''), false);
  assert.equal(_authorityRosterHas(null), false);
  assert.equal(_authorityRosterHas(undefined), false);
});

// v23450 — the ENRICHMENT half of the same storm. Ottawa's own feed was
// healthy (25 departures, 34 arrivals, gates and belts on every row) but the
// live board sat on the boot splash behind a wall of 429s from the per-flight
// AeroDataBox lookups. Those routes are permanently dead; they must answer
// empty rather than relay a 429 the client will retry.
import { _adbDeadEnrichment } from '../workers/fids-proxy.js';

test('dead enrichment routes are short-circuited, bare and under /proxy alike', () => {
  const cases = [
    ['/flights/number/PD2339/2026-09-07', 'none-flightno'],
    ['/proxy/flights/number/PD2339', 'none-flightno'],
    ['/flights/callsign/POE2339', 'none-callsign'],
    ['/aircrafts/reg/C-GLQF', 'none-aircraft'],
    ['/proxy/aircrafts/icao24/C0170B', 'none-aircraft'],
    ['/proxy/airports/iata/YOW/distance-time/EWR', 'none-distance'],
    ['/airports/iata/YOW/distance-time/EWR', 'none-distance'],
  ];
  for (const [path, tag] of cases) {
    assert.equal(_adbDeadEnrichment(path), tag, `${path} should short-circuit as ${tag}`);
  }
});

test('the real data routes are NEVER short-circuited', () => {
  // The flight WINDOW is what the authority feeds answer — emptying it would
  // blank every board. The bare airport lookup is the map's coordinate source
  // and is deliberately left alone until its static fallback is verified.
  for (const path of [
    '/flights/airports/iata/YOW/2026-09-07T17:31/2026-09-08T01:31',
    '/proxy/flights/airports/iata/YOW/2026-09-07T17:31/2026-09-08T01:31',
    '/airports/iata/YOW',
    '/proxy/airports/iata/YOW',
    '/airports/search/otta',
    '/health/services/airports/CYOW/feeds',
  ]) {
    assert.equal(_adbDeadEnrichment(path), null, `${path} must pass through`);
  }
});

test('enrichment matcher: garbage in → null, never throws', () => {
  assert.equal(_adbDeadEnrichment(''), null);
  assert.equal(_adbDeadEnrichment(null), null);
  assert.equal(_adbDeadEnrichment(undefined), null);
});
