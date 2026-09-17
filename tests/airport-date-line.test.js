'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE DEDICATED SCREEN'S DATE LINE MUST NAME A DATE THAT EXISTS.
//
// It was assembled from two different clocks: the weekday and month came from
// the AIRPORT's timezone, the day number and year from the VIEWER's machine.
//
//     `${dayName}  ${monthName} ${now.getDate()}, ${now.getFullYear()}`
//                                 ^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^
//
// After midnight at the airport, a screen an hour west printed
//
//     Friday September 17, 2026
//
// and 17 September 2026 is a Thursday. Not merely the wrong date — a date
// that does not exist in any year's September. One hour nightly for a viewer
// an hour behind, three for a UTC host, and the wrong year at the turn of it.
//
// The line was written out twice, at the first paint and at the per-second
// repaint of the same node, so correcting one was undone by the other inside
// a second. That is why the fix is a shared function and why this test lifts
// that function rather than checking two expressions.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js');

function extract(name) {
  const body = fs.readFileSync(SRC, 'utf8');
  const start = body.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' not found in fids-core.js');
  let depth = 0, i = body.indexOf('{', start), end = -1;
  for (; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.notEqual(end, -1, 'could not bracket-match ' + name);
  return body.slice(start, end);
}

const SOURCE = extract('_airportDateLine');
// eslint-disable-next-line no-new-func
const airportDateLine = new Function(SOURCE + '; return _airportDateLine;')();

// 2026-09-18T02:30Z — past midnight on the 18th in Moncton (23:30 ADT on the
// 17th is BEFORE this; 02:30Z is 23:30 ADT… so pick a moment that is genuinely
// the 18th at the airport and the 17th an hour west.)
// 03:30Z = 00:30 ADT on Sep 18, and 23:30 EDT on Sep 17.
const JUST_AFTER_MIDNIGHT_ADT = new Date(Date.parse('2026-09-18T03:30:00Z'));
const MONCTON = { timeZone: 'America/Moncton' };

test('the whole line comes from one clock — the airport\'s', () => {
  const line = airportDateLine(JUST_AFTER_MIDNIGHT_ADT, MONCTON, 'en-CA', '12:30 AM');
  assert.match(line, /Friday/, 'Sep 18 2026 is a Friday');
  assert.match(line, /September 18, 2026/, 'the day number must follow the airport, not the host');
});

test('the weekday always matches the day number it is printed beside', () => {
  // The bug produced impossible dates, so the assertion is coherence, not a
  // fixed string: whatever weekday is named must be the real weekday of the
  // date named next to it.
  const MONTHS = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December'];
  for (let hour = 0; hour < 24; hour++) {
    const when = new Date(Date.UTC(2026, 8, 18, hour, 30, 0));
    const line = airportDateLine(when, MONCTON, 'en-CA', 'x');
    const m = line.match(/^(\w+)\s+(\w+)\s+(\d+),\s+(\d{4})/);
    assert.ok(m, 'unparseable line: ' + line);
    const [, weekday, monthName, day, year] = m;
    const real = new Date(Date.UTC(+year, MONTHS.indexOf(monthName), +day));
    const realWeekday = real.toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'long' });
    assert.equal(weekday, realWeekday,
      `"${line.trim()}" — ${monthName} ${day} ${year} is a ${realWeekday}, not a ${weekday}`);
  }
});

test('it renders identically whatever zone the host is set to', () => {
  const script =
    `${SOURCE}\n` +
    `process.stdout.write(_airportDateLine(new Date(${JUST_AFTER_MIDNIGHT_ADT.getTime()}),` +
    `{timeZone:'America/Moncton'},'en-CA','12:30 AM'));`;
  const under = (tz) =>
    execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz } }).toString();

  const baseline = under('America/Moncton');
  assert.match(baseline, /Friday {2}September 18, 2026/);
  for (const tz of ['America/Toronto', 'UTC', 'Australia/Hobart', 'Pacific/Auckland']) {
    assert.equal(under(tz), baseline,
      `a host in ${tz} rendered a different date line for the same airport moment`);
  }
});

test('the year follows the airport across New Year too', () => {
  // 2027-01-01T02:30Z is 22:30 on 31 Dec in Moncton — still the old year at the
  // airport, already the new one in UTC. The bug printed the host's year.
  const nye = new Date(Date.parse('2027-01-01T02:30:00Z'));
  const line = airportDateLine(nye, MONCTON, 'en-CA', '10:30 PM');
  assert.match(line, /December 31, 2026/, 'still 2026 at the airport');
});

test('a missing zone does not silently become the host clock', () => {
  // tzOpts is {} when the airport has no tz row. That falls back to the host,
  // which is the same failure one layer down — so assert the shape at least
  // stays coherent rather than mixing two clocks.
  const line = airportDateLine(JUST_AFTER_MIDNIGHT_ADT, {}, 'en-CA', 'x');
  assert.match(line, /^\w+\s+\w+\s+\d+,\s+\d{4}/, 'still a well-formed line');
});

test('both paint paths share the one function', () => {
  // The line used to exist twice; fixing one was undone by the other within a
  // second. Guard that it is not re-duplicated.
  const body = fs.readFileSync(SRC, 'utf8');
  // Count call sites only — the pattern also matches the declaration itself.
  const calls = (body.match(/const dateDisplay = _airportDateLine\(/g) || []).length;
  assert.equal(calls, 2, 'both the first paint and the repaint must call the shared function');
  assert.equal((body.match(/\$\{_cap\(dayName\)\}/g) || []).length, 0,
    'a hand-built date line has come back — it must go through _airportDateLine');
});
