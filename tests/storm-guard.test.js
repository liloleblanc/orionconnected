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
