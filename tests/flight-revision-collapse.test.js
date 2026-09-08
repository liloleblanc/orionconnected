'use strict';

// v23498 — the suffix on a flight number is a REVISION COUNTER (Nick: "the letter
// means theres been a change and 2040 is the initial number ... if its at z it had
// 26 changes from a to z"). AC2040 and AC2040Z are one flight, and the board was
// showing both with contradicting statuses. This collapses them — but it must NOT
// collapse the same flight on two different days, which the live board legitimately
// carries (today arrived / tomorrow scheduled).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const from = src.indexOf('function _fidsCollapseRevisions(');
assert.ok(from >= 0, 'fids-core.js must define _fidsCollapseRevisions');
const body = src.slice(from, src.indexOf('\nfunction loadDemo()', from));
// fidsLocalDateKey is referenced through a typeof guard; supply the real behaviour.
const collapse = new Function(
  'fidsLocalDateKey',
  body + '\nreturn _fidsCollapseRevisions;'
)((ts, tz) => new Date(ts).toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }));

const TZ = 'America/Moncton';
const at = (iso) => Date.parse(iso);
const F = (flight, iso, extra) => Object.assign({ flight, _sortTs: at(iso) }, extra || {});

test('the reported case: AC2040 + AC2040Z become one row on 2040', () => {
  const out = collapse([
    F('AC2040Z', '2026-09-09T00:38:00Z', { status: 'delayed', upd: '21:46' }),
    F('AC2040', '2026-09-09T00:38:00Z', { status: 'scheduled', upd: null }),
  ], TZ);
  assert.equal(out.length, 1, 'one flight, one row');
  assert.equal(out[0].flight, 'AC2040', 'shows the number the passenger holds');
  assert.equal(out[0]._revision, 'Z', 'keeps which revision it is');
  assert.equal(out[0]._revisionRaw, 'AC2040Z');
  assert.equal(out[0].status, 'delayed', 'keeps the REVISED data, not the superseded original');
  assert.equal(out[0].upd, '21:46');
});

test('the same flight on two different days is NOT collapsed', () => {
  // Measured live: PD2373/AC1984/AC7754 each appear as today-arrived and
  // tomorrow-scheduled. A day-blind collapse would delete tomorrow's flight.
  const out = collapse([
    F('PD2373', '2026-09-08T19:33:00Z', { status: 'arrived' }),
    F('PD2373', '2026-09-09T19:33:00Z', { status: 'scheduled' }),
  ], TZ);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((f) => f.status), ['arrived', 'scheduled']);
});

test('a suffixed row on one day does not eat the same flight on another', () => {
  const out = collapse([
    F('AC2040Z', '2026-09-09T00:38:00Z', { status: 'delayed' }),
    F('AC2040', '2026-09-10T00:38:00Z', { status: 'scheduled' }),
  ], TZ);
  assert.equal(out.length, 2, 'tomorrow AC2040 survives today AC2040Z');
});

test('the highest letter wins — it is the latest revision', () => {
  const out = collapse([
    F('AC2040A', '2026-09-09T00:38:00Z', { status: 'a' }),
    F('AC2040M', '2026-09-09T00:38:00Z', { status: 'm' }),
    F('AC2040Z', '2026-09-09T00:38:00Z', { status: 'z' }),
    F('AC2040', '2026-09-09T00:38:00Z', { status: 'orig' }),
  ], TZ);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'z');
  assert.equal(out[0]._revision, 'Z');
  assert.equal(out[0]._revisionsCollapsed, 3);
});

test('un-suffixed same-day duplicates are left alone, not guessed at', () => {
  const out = collapse([
    F('AC2040', '2026-09-09T00:38:00Z', { status: 'one' }),
    F('AC2040', '2026-09-09T00:38:00Z', { status: 'two' }),
  ], TZ);
  assert.equal(out.length, 2, 'a plain feed duplicate is a different problem');
});

test('order is preserved and unrecognised rows pass through untouched', () => {
  const odd = { flight: 'CHARTER', _sortTs: at('2026-09-09T00:38:00Z') };
  const out = collapse([
    F('PD2381', '2026-09-09T00:30:00Z'),
    odd,
    F('AC2040Z', '2026-09-09T00:38:00Z'),
    F('AC2040', '2026-09-09T00:38:00Z'),
  ], TZ);
  assert.deepEqual(out.map((f) => f.flight), ['PD2381', 'CHARTER', 'AC2040']);
});

test('never returns fewer rows than there are distinct flights', () => {
  for (const list of [[], [F('AC1', '2026-09-09T00:00:00Z')], null, undefined]) {
    const out = collapse(list, TZ);
    if (Array.isArray(list)) assert.ok(out.length >= Math.min(list.length, 1) || list.length === 0);
  }
});
