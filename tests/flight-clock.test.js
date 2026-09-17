// A flight time must read the same on every screen on earth.
//
// The bug this guards: `new Date(s).toLocaleTimeString()` with no timeZone
// renders in whatever zone the HOST is set to. Measured on the deployed board,
// the same Moncton 17:20 departure read 5:20 PM in Moncton, 4:20 PM in Toronto
// and 8:20 PM on a UTC host — three machines, one flight, three answers.
//
// Aviation's answer is one clock (UTC) converted at the station, and that is
// what flightClock implements: an instant in, the station's zone beside it,
// the airport's wall clock out.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const MOD = path.join(__dirname, '..', 'fids-current', 'js', 'gate-date-context.js');
const { flightClock } = require(MOD);

// Moncton, 2026-09-17 17:20 ADT (UTC-3).
const YQM_1720 = Date.parse('2026-09-17T20:20:00Z');
// Moncton, 2026-09-18 05:25 ADT — the next-day case the board was getting wrong.
const YQM_NEXT = Date.parse('2026-09-18T08:25:00Z');
const NOON_SEP17_ADT = Date.parse('2026-09-17T15:00:00Z');

test('the airport clock is what renders, not the host clock', () => {
  const r = flightClock({ timestamp: YQM_1720, timeZone: 'America/Moncton', nowTimestamp: NOON_SEP17_ADT });
  assert.equal(r.time, '5:20 PM');
  assert.equal(r.dayOffset, 0);
  assert.equal(r.marker, '');
});

test('the same instant renders identically whatever TZ the host is set to', () => {
  // The decisive test. Run the formatter in child processes whose TZ differs;
  // a leak of the host clock shows up here and nowhere else in a suite that
  // happens to run in the airport's own zone.
  const script =
    `const {flightClock}=require(${JSON.stringify(MOD)});` +
    `process.stdout.write(flightClock({timestamp:${YQM_1720},timeZone:'America/Moncton',` +
    `nowTimestamp:${NOON_SEP17_ADT}}).text);`;

  const under = (tz) =>
    execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz } }).toString();

  const moncton = under('America/Moncton');
  assert.equal(moncton, '5:20 PM', 'baseline in the airport\'s own zone');
  for (const tz of ['America/Toronto', 'UTC', 'Australia/Hobart', 'Pacific/Auckland']) {
    assert.equal(under(tz), moncton,
      `a host in ${tz} rendered a different time for the same flight`);
  }
});

test('a next-day flight always carries its marker, and the marker is bold', () => {
  const r = flightClock({ timestamp: YQM_NEXT, timeZone: 'America/Moncton', nowTimestamp: NOON_SEP17_ADT });
  assert.equal(r.time, '5:25 AM');
  assert.equal(r.dayOffset, 1);
  assert.equal(r.marker, '+1');
  assert.equal(r.text, '5:25 AM+1');
  assert.match(r.html, /<b class="fids-dayoff">\+1<\/b>/,
    'the marker renders bold and in its own element');
});

test('the day offset is measured against the AIRPORT\'s today, not the viewer\'s', () => {
  // 2026-09-18 00:30 UTC is still Sep 17 in Moncton (21:30 ADT). A board that
  // asked its own calendar would call this flight "tomorrow"; Moncton's
  // calendar says today.
  const lateUtc = Date.parse('2026-09-18T00:30:00Z');
  const r = flightClock({ timestamp: lateUtc, timeZone: 'America/Moncton', nowTimestamp: Date.parse('2026-09-17T15:00:00Z') });
  assert.equal(r.dayOffset, 0, 'still Sep 17 by Moncton\'s clock');
  assert.equal(r.marker, '');
});

test('a bare wall clock is refused rather than guessed at', () => {
  // Without an offset there is no instant, only a reading. Guessing which zone
  // it was read in is how this whole class of bug starts.
  for (const bare of ['2026-09-17 17:20:00', '17:20', '5:20 PM']) {
    const r = flightClock({ timestamp: bare, timeZone: 'America/Moncton' });
    assert.equal(r.ok, false, `accepted a bare wall clock: ${bare}`);
    assert.equal(r.text, '');
  }
});

test('an offset-bearing string is accepted, in either ISO spelling', () => {
  const spaced = flightClock({ timestamp: '2026-09-17 17:20:00-03:00', timeZone: 'America/Moncton', nowTimestamp: NOON_SEP17_ADT });
  const tee = flightClock({ timestamp: '2026-09-17T20:20:00Z', timeZone: 'America/Moncton', nowTimestamp: NOON_SEP17_ADT });
  assert.equal(spaced.text, '5:20 PM');
  assert.equal(tee.text, '5:20 PM');
});

test('a missing zone is reported rather than silently assumed', () => {
  const r = flightClock({ timestamp: YQM_1720, nowTimestamp: NOON_SEP17_ADT });
  assert.equal(r.zoneAssumed, true,
    'omitting the zone must be visible to the guard test, not silent');
  const given = flightClock({ timestamp: YQM_1720, timeZone: 'America/Moncton', nowTimestamp: NOON_SEP17_ADT });
  assert.equal(given.zoneAssumed, false);
});

test('one instant, two airports, two different day offsets', () => {
  // The same moment is a different calendar day in Hobart than in Moncton, so
  // "tomorrow" is not a property of the flight — it is a property of the flight
  // AND the station reading it. Asserting this from an Atlantic mindset is how
  // this test was wrong on its first run: at 15:00Z it is already 01:00 on the
  // 18th in Hobart, so a 06:00 Hobart departure is that station's today.
  const instant = Date.parse('2026-09-17T20:00:00Z');
  const now = NOON_SEP17_ADT;                       // 2026-09-17T15:00Z

  const hba = flightClock({ timestamp: instant, timeZone: 'Australia/Hobart', nowTimestamp: now });
  assert.equal(hba.time, '6:00 AM');
  assert.equal(hba.dayOffset, 0, 'Sep 18 in Hobart, and Hobart is already on Sep 18');
  assert.equal(hba.marker, '');

  const yqm = flightClock({ timestamp: instant, timeZone: 'America/Moncton', nowTimestamp: now });
  assert.equal(yqm.time, '5:00 PM');
  assert.equal(yqm.dayOffset, 0, 'still Sep 17 in Moncton');

  // Same instant, 14 hours apart on the clock, and each station right.
  assert.notEqual(hba.time, yqm.time);
});

// ── DAYLIGHT SAVING ──────────────────────────────────────────────────────
//
// The offset an airport is on is a property of the INSTANT, not of the airport.
// Moncton is UTC-3 in September and UTC-4 in December; Hobart is UTC+10 in
// September and UTC+11 in November. This is the reason the station is stored as
// an IANA zone name and never as a number: a stored '-4' is correct in Moncton
// for four months of the year and an hour wrong for the other eight, and it
// fails silently, twice a year, in opposite directions.

test('Moncton: the same wall clock is a different instant in ADT and AST', () => {
  // 17:20 local on both dates. September is ADT (UTC-3), December is AST (UTC-4),
  // so the two differ by an hour in UTC while reading the same on the board.
  const sept = flightClock({ timestamp: Date.parse('2026-09-17T20:20:00Z'), timeZone: 'America/Moncton' });
  const dec = flightClock({ timestamp: Date.parse('2026-12-17T21:20:00Z'), timeZone: 'America/Moncton' });
  assert.equal(sept.time, '5:20 PM', 'ADT, UTC-3');
  assert.equal(dec.time, '5:20 PM', 'AST, UTC-4');
});

test('Moncton: the hour the clocks go back is handled, not fudged', () => {
  // DST ends 2026-11-01 at 02:00 ADT. 05:00Z is 02:00 ADT (the last ADT minute
  // rolls at 05:00Z); 06:00Z is 02:00 AST an hour later. Both read 2:00 AM
  // locally — the repeated hour — and both must render honestly.
  const beforeFallBack = flightClock({ timestamp: Date.parse('2026-11-01T04:59:00Z'), timeZone: 'America/Moncton' });
  const afterFallBack = flightClock({ timestamp: Date.parse('2026-11-01T06:00:00Z'), timeZone: 'America/Moncton' });
  assert.equal(beforeFallBack.time, '1:59 AM', 'still ADT');
  assert.equal(afterFallBack.time, '2:00 AM', 'now AST, one UTC hour later');
});

test('Hobart: southern DST runs the other way round', () => {
  // Australian DST starts as northern DST ends. Hobart is AEST (UTC+10) in
  // September and AEDT (UTC+11) from 2026-10-04.
  const sept = flightClock({ timestamp: Date.parse('2026-09-17T20:00:00Z'), timeZone: 'Australia/Hobart' });
  const nov = flightClock({ timestamp: Date.parse('2026-11-17T19:00:00Z'), timeZone: 'Australia/Hobart' });
  assert.equal(sept.time, '6:00 AM', 'AEST, UTC+10');
  assert.equal(nov.time, '6:00 AM', 'AEDT, UTC+11');
});

test('Honolulu never shifts, and must not be shifted for', () => {
  // Hawaii keeps UTC-10 all year. A system that applied a blanket "North
  // America springs forward" would put every Hawaiian flight an hour out for
  // eight months.
  const summer = flightClock({ timestamp: Date.parse('2026-07-15T20:00:00Z'), timeZone: 'Pacific/Honolulu' });
  const winter = flightClock({ timestamp: Date.parse('2026-12-15T20:00:00Z'), timeZone: 'Pacific/Honolulu' });
  assert.equal(summer.time, '10:00 AM');
  assert.equal(winter.time, '10:00 AM', 'no seasonal shift in Hawaii');
});

test('the day marker respects DST too', () => {
  // A flight just after local midnight on the day the clocks change must still
  // be counted into the right calendar day.
  const r = flightClock({
    timestamp: Date.parse('2026-11-01T06:30:00Z'),   // 02:30 AST, Nov 1
    timeZone: 'America/Moncton',
    nowTimestamp: Date.parse('2026-10-31T18:00:00Z') // 15:00 ADT, Oct 31
  });
  assert.equal(r.dayOffset, 1, 'Nov 1 against Oct 31, across the transition');
  assert.equal(r.marker, '+1');
});

test('a genuinely next-day flight is marked at an eastern station too', () => {
  // Hobart at 2026-09-18T01:00Z is 11:00 on the 18th; a flight at 20:00Z lands
  // on the 19th by Hobart's calendar.
  const r = flightClock({
    timestamp: Date.parse('2026-09-18T20:00:00Z'),
    timeZone: 'Australia/Hobart',
    nowTimestamp: Date.parse('2026-09-18T01:00:00Z')
  });
  assert.equal(r.dayOffset, 1);
  assert.equal(r.marker, '+1');
  assert.match(r.html, /<b class="fids-dayoff">\+1<\/b>/);
});
