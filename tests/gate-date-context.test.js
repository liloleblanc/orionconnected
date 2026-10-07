'use strict';

// The day words a gate prints under a time that is not on the board's today
// (FIDSGateDate.getFlightDayWords). See tests/gate-next-day.test.js for the
// gate itself.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const MOD = path.join(__dirname, '..', 'fids-current', 'js', 'gate-date-context.js');
const gateDate = require(MOD);
const words = (o) => gateDate.getFlightDayWords(Object.assign({ timeZone: 'America/Moncton', languages: ['en', 'fr'] }, o));

// Moncton, Friday 2026-10-02 19:33 ADT (UTC-3): the moment on the gate-1 screen.
const NOW = Date.parse('2026-10-02T22:33:00Z');

test('tomorrow\'s flight says Tomorrow | Demain', () => {
  const r = words({ timestamp: Date.parse('2026-10-03T21:15:00Z'), nowTimestamp: NOW });   // WS813 Oct 3 6:15pm
  assert.equal(r.dayOffset, 1);
  assert.deepEqual(r.words, ['Tomorrow', 'Demain']);
  assert.equal(r.text, 'Tomorrow | Demain');
});

test('a flight on today\'s date says nothing, however late in the day', () => {
  for (const iso of ['2026-10-02T12:00:00Z', '2026-10-03T02:50:00Z']) {   // 9:00am, and 11:50pm ADT
    const r = words({ timestamp: Date.parse(iso), nowTimestamp: NOW });
    assert.equal(r.dayOffset, 0, iso);
    assert.deepEqual(r.words, [], iso);
    assert.equal(r.text, '');
  }
});

test('the first flight after midnight is tomorrow\'s, even minutes away', () => {
  const r = words({ timestamp: Date.parse('2026-10-03T03:10:00Z'), nowTimestamp: Date.parse('2026-10-03T02:55:00Z') });   // 00:10 at 23:55
  assert.equal(r.dayOffset, 1);
  assert.deepEqual(r.words, ['Tomorrow', 'Demain']);
});

test('an earlier day says nothing: last night\'s flight still at its door is tonight\'s to the people there', () => {
  const r = words({ timestamp: Date.parse('2026-10-03T02:50:00Z'), nowTimestamp: Date.parse('2026-10-03T03:20:00Z') });   // 23:50 seen at 00:20
  assert.equal(r.dayOffset, -1);
  assert.deepEqual(r.words, []);
});

test('two or more days out it is the weekday and the date, in each language', () => {
  const r = words({ timestamp: Date.parse('2026-10-04T21:15:00Z'), nowTimestamp: NOW });   // Sunday Oct 4
  assert.equal(r.dayOffset, 2);
  assert.equal(r.words.length, 2);
  assert.match(r.words[0], /^Sun\b/);
  assert.match(r.words[0], /Oct 4/);
  assert.match(r.words[1], /^dim\./, 'French weekdays are lower case');
  assert.match(r.words[1], /4 oct\./);
});

test('French first in Québec', () => {
  const r = words({ timestamp: Date.parse('2026-10-03T10:30:00Z'), nowTimestamp: NOW, timeZone: 'America/Toronto', frenchFirst: true });
  assert.deepEqual(r.words, ['Demain', 'Tomorrow']);
  const far = words({ timestamp: Date.parse('2026-10-04T10:30:00Z'), nowTimestamp: NOW, timeZone: 'America/Toronto', frenchFirst: true });
  assert.match(far.words[0], /^dim\./);
  assert.match(far.words[1], /^Sun\b/);
});

test('the board\'s own languages: one word on a one-language board, Spanish where Spanish is picked', () => {
  const t = Date.parse('2026-10-03T21:15:00Z');
  assert.deepEqual(words({ timestamp: t, nowTimestamp: NOW, languages: ['en'] }).words, ['Tomorrow']);
  assert.deepEqual(words({ timestamp: t, nowTimestamp: NOW, languages: ['es', 'en'] }).words, ['Mañana', 'Tomorrow']);
});

test('an arrival is read in its own zone and judged against the board\'s today', () => {
  // WS813's arrival printed in Calgary time (UTC-6) on the Moncton board.
  const calgary = { timeZone: 'America/Edmonton', nowTimeZone: 'America/Moncton', nowTimestamp: NOW };
  // Oct 3 7:54pm in Calgary: tomorrow.
  assert.equal(words(Object.assign({ timestamp: Date.parse('2026-10-04T01:54:00Z') }, calgary)).text, 'Tomorrow | Demain');
  // Tonight's 11:30pm Calgary arrival is 02:30 on Oct 3 in Moncton, but the
  // time printed is Calgary's, on Calgary's Oct 2: today, no line. Judged by
  // Moncton's calendar alone it would wrongly read "Tomorrow".
  const tonight = words(Object.assign({ timestamp: Date.parse('2026-10-03T05:30:00Z') }, calgary));
  assert.equal(tonight.dayOffset, 0);
  assert.deepEqual(tonight.words, []);
  // And "today" is the BOARD's: at 01:00 in Moncton (Oct 3) it is still Oct 2
  // in Calgary, and a Calgary arrival on Oct 3 is today's, not tomorrow's.
  const lateNight = words({ timestamp: Date.parse('2026-10-04T01:54:00Z'), timeZone: 'America/Edmonton', nowTimeZone: 'America/Moncton', nowTimestamp: Date.parse('2026-10-03T04:00:00Z') });
  assert.equal(lateNight.dayOffset, 0);
});

test('nothing without a usable time', () => {
  for (const ts of [0, null, undefined, NaN, 'soon']) {
    assert.deepEqual(words({ timestamp: ts, nowTimestamp: NOW }).words, [], String(ts));
  }
});

test('the same instant gives the same words whatever zone the host is set to', () => {
  const script = `const g=require(${JSON.stringify(MOD)});process.stdout.write(g.getFlightDayWords({timestamp:${Date.parse('2026-10-03T21:15:00Z')},nowTimestamp:${NOW},timeZone:'America/Moncton',languages:['en','fr']}).text);`;
  const under = (tz) => execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz } }).toString();
  for (const tz of ['America/Moncton', 'UTC', 'Pacific/Auckland', 'America/Los_Angeles']) {
    assert.equal(under(tz), 'Tomorrow | Demain', tz);
  }
});

test('uses the airport timezone rather than the computer timezone', () => {
  const now = Date.parse('2026-08-13T02:30:00Z');
  const flight = Date.parse('2026-08-13T04:30:00Z');
  assert.equal(gateDate.dayOffset(flight, now, 'America/Moncton'), 1);
  assert.equal(gateDate.dayOffset(flight, now, 'UTC'), 0);
});

test('an arrival that has happened is dated when it was yesterday, only when the caller asks (v24018)', () => {
  // Moncton, Oct 7 at 10:18 ADT: the Your Aircraft card's "Arrived at the gate | 4:33pm" was Oct 6.
  const now = Date.parse('2026-10-07T13:18:00Z');
  const yday = Date.parse('2026-10-06T19:33:00Z');            // 4:33pm ADT on Oct 6
  assert.deepEqual(words({ timestamp: yday, nowTimestamp: now }).words, [], 'a departure never asks: nothing, as before');
  const r = words({ timestamp: yday, nowTimestamp: now, pastDays: true });
  assert.equal(r.dayOffset, -1);
  assert.deepEqual(r.words, ['Yesterday', 'Hier']);
  assert.deepEqual(words({ timestamp: Date.parse('2026-10-07T12:00:00Z'), nowTimestamp: now, pastDays: true }).words, [], 'today: nothing');
  const older = words({ timestamp: Date.parse('2026-10-05T19:33:00Z'), nowTimestamp: now, pastDays: true });
  assert.equal(older.dayOffset, -2);
  assert.equal(older.words.length, 2, 'two days back: the date, in both languages');
  assert.doesNotMatch(older.text, /Yesterday|Hier/);
});
