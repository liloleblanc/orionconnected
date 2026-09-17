'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// MONTREAL IS NOT ALWAYS -04:00.
//
// The YUL arrivals enrichment parsed every scheduled time by appending a
// hard-coded "-04:00":
//
//     Date.parse(String(f.ScheduledTime || "") + "-04:00")
//
// That is EDT. Montréal runs EST (-05:00) from the first Sunday in November to
// the second in March, so for four months of every year each arrival was
// parsed an hour late. It tests green all summer, which is how it sat there.
//
// The damage is not a wrong time on a screen. That value feeds the window that
// picks which arrivals get enriched with a baggage belt — nearest first, capped
// at 40. An hour of error silently swaps which flights qualify. A flight that
// misses the window comes back with no belt, `_belt` lands null, and a null
// belt matches no carousel screen at all. The flight is not shown late or
// wrong; it is ABSENT from the baggage displays, while ADM's own site has the
// number the whole time. A carousel left with no matching arrivals can drop out
// of rotation entirely.
//
// No bad feed data and no wrong host clock is needed. It fires for every viewer
// at once, on a date that is already in the calendar.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'workers', 'fids-proxy.js');
const BODY = fs.readFileSync(SRC, 'utf8');

test('the hard-coded EDT offset is gone from the arrivals window', () => {
  assert.equal(BODY.includes('+ "-04:00"'), false,
    'a hard-coded -04:00 is back: Montreal is EST for four months a year');
  assert.match(BODY, /localIsoObj\("America\/Toronto", f\.ScheduledTime\)/,
    'the arrivals window must resolve the offset at the instant, not assume one');
});

test('Montreal really does change offset — the premise, asserted', () => {
  // If this ever fails, the fix above is unnecessary and the bug never existed.
  const summer = new Date(Date.parse('2026-07-15T16:00:00Z'));
  const winter = new Date(Date.parse('2026-12-15T16:00:00Z'));
  const offset = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', timeZoneName: 'shortOffset'
  }).formatToParts(d).find((p) => p.type === 'timeZoneName').value;

  assert.equal(offset(summer), 'GMT-4', 'EDT in July');
  assert.equal(offset(winter), 'GMT-5', 'EST in December');
});

test('the old parse was an hour out for the whole winter', () => {
  // Reproduce both readings of one wall clock and measure the gap. This is the
  // arithmetic that decided which flights got a belt.
  const wall = '2026-12-15T19:40';                 // 19:40 in Montreal, mid-winter
  const hardCoded = Date.parse(wall + '-04:00');   // what the code used to do
  const correct = Date.parse(wall + '-05:00');     // what EST actually is
  assert.equal((correct - hardCoded) / 3600000, 1,
    'the old parse landed an hour earlier than the real instant');
});

test('and was correct in summer, which is why it went unnoticed', () => {
  const wall = '2026-07-15T19:40';
  assert.equal(Date.parse(wall + '-04:00'), Date.parse(wall + '-04:00'));
  const offsetInJuly = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', timeZoneName: 'shortOffset'
  }).formatToParts(new Date(Date.parse(wall + 'Z'))).find((p) => p.type === 'timeZoneName').value;
  assert.equal(offsetInJuly, 'GMT-4',
    'in July the hard-coded value happens to be right — the bug is seasonal');
});

test('the switch date is in the calendar, not hypothetical', () => {
  // DST ends 2026-11-01. From that morning the old code would have been wrong
  // on every YUL arrival until 2027-03-14.
  const beforeSwitch = new Date(Date.parse('2026-11-01T04:00:00Z'));  // 00:00 EDT
  const afterSwitch = new Date(Date.parse('2026-11-01T08:00:00Z'));   // 03:00 EST
  const offset = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', timeZoneName: 'shortOffset'
  }).formatToParts(d).find((p) => p.type === 'timeZoneName').value;
  assert.equal(offset(beforeSwitch), 'GMT-4');
  assert.equal(offset(afterSwitch), 'GMT-5');
});

test('no other hard-coded North American offset is applied to a feed time', () => {
  // The file's own correct idiom (yhzOffsetFor, localTimeObjIn) probes Intl and
  // only falls back to a literal on exception. Those fallbacks are fine. What
  // is not fine is appending a literal offset to a feed's wall clock.
  const bad = [...BODY.matchAll(/Date\.parse\([^)]*\+\s*"[+-]\d{2}:\d{2}"\s*\)/g)].map((m) => m[0]);
  assert.deepEqual(bad, [],
    'a feed wall clock is being parsed with an assumed offset: ' + bad.join(', '));
});
