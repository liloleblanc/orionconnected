// YQM webhook-cache feed — normalization tests against REAL cache
// entries captured from /flights/cached/CYQM on 2026-09-05, the night
// cyqm.ca's new firewall and the cancelled AeroDataBox subscription
// killed both of Moncton's data legs at once. The worker now answers
// the ADB window URL for YQM straight from this cache; these tests pin
// the numeric-enum normalization to the same table the client overlay
// uses (feed-router.js ~1419) — including the lowercase-'cancelled'
// spelling whose PascalCase predecessor once let a cancelled Moncton
// flight keep showing as scheduled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yqmNormFlight, yqmSchedTs } from '../workers/fids-proxy.js';

const fix = JSON.parse(readFileSync(new URL('./fixtures/yqm-cache-sample.json', import.meta.url), 'utf8'));
const entry = (pred) => fix.flights.find(pred);
const clone = (e) => JSON.parse(JSON.stringify(e.flight));

test('yqm: numeric enums normalize to the strings the boards key on', () => {
  const dep = entry((e) => e.direction === 'dep' && !e.key.endsWith(':cx') && !e.key.endsWith(':cs'));
  const f = yqmNormFlight(clone(dep));
  assert.equal(f.status, 'active');                 // webhook 2 = EnRoute
  assert.equal(f.codeshareStatus, 'IsOperator');    // webhook 1
  assert.deepEqual(f.departure.quality, ['Basic', 'Live']);   // [0,1]
});

test('yqm: cancelled arrives as 10 and leaves as lowercase british', () => {
  const cx = entry((e) => e.key.endsWith(':cx'));
  const f = yqmNormFlight(clone(cx));
  assert.equal(f.status, 'cancelled');
});

test('yqm: codeshare records are identifiable for the operator-only filter', () => {
  const cs = entry((e) => e.key.endsWith(':cs'));
  const f = yqmNormFlight(clone(cs));
  assert.equal(f.codeshareStatus, 'IsCodeshared');
});

test('yqm: webhook time strings parse — space-separated utc and local', () => {
  const arr = entry((e) => e.direction === 'arr');
  const f = yqmNormFlight(clone(arr));
  const ts = yqmSchedTs(f, 'arr');
  assert.ok(Number.isFinite(ts), 'utc "YYYY-MM-DD HH:MMZ" must parse');
  assert.equal(ts, Date.parse(String(f.arrival.scheduledTime.utc).replace(' ', 'T')));
  // local-only fallback
  const localOnly = { arrival: { scheduledTime: { local: '2026-09-04 05:30-03:00' } } };
  assert.ok(Number.isFinite(yqmSchedTs(localOnly, 'arr')));
});

test('yqm: already-normalized and garbage inputs are harmless', () => {
  const dep = entry((e) => e.direction === 'dep');
  const once = yqmNormFlight(clone(dep));
  const twice = yqmNormFlight(JSON.parse(JSON.stringify(once)));
  assert.equal(twice.status, once.status);          // idempotent
  assert.equal(yqmNormFlight(null), null);
  assert.ok(Number.isNaN(yqmSchedTs({}, 'dep')));
  assert.ok(Number.isNaN(yqmSchedTs(null, 'arr')));
});
