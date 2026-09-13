'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23757 — DAY AND NIGHT COME FROM THE ACTUAL SUN.
//
// The card decided day from night with a hardcoded 06:00-21:00 window.
// Measured against MET Norway's own published figures, that window is wrong
// by hours for much of the year and absurd where this roster flies:
//
//   KEF 21 Jun   sunrise 03:01  sunset 00:02   dusk off by 21 hours
//   KEF 21 Dec   sunrise 11:22  sunset 15:34   dawn off 5h22, dusk off 5h26
//   ZRH 21 Dec   sunrise 08:10  sunset 16:37   dawn off 2h10, dusk off 4h23
//   YDF 21 Dec   sunrise 08:11  sunset 16:23   dawn off 2h11, dusk off 4h37
//
// Those are real readings taken from the API, not estimates.
//
// MET's Sunrise 3.0 is the same publisher, the same keyless access and the
// same NLOD 2.0 / CC BY 4.0 licence as the forecast already in use — so it
// adds no account, quota or licence question. (open-meteo also publishes
// sunrise/sunset and is NOT usable here: its free tier is non-commercial only
// and these boards carry advertising, which is why v23452 moved off it.)
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const WORKER = fs.readFileSync(path.join(ROOT, 'worker-entry.js'), 'utf8');

// Lift the real decision function and drive it with a stubbed solar cache.
function decider(sunByKey) {
  const at = SRC.indexOf('var _wxNightAt = function');
  assert.ok(at >= 0, 'fids-core.js must still define _wxNightAt');
  let d = 0; let body = null;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) { body = SRC.slice(at, k + 1) + ';'; break; } }
  }
  assert.ok(body, 'unterminated _wxNightAt');
  const AP = {
    KEF: { tz: 'Atlantic/Reykjavik' },
    ZRH: { tz: 'Europe/Zurich' },
    YQM: { tz: 'America/Moncton' },
    SVALBARD: { tz: 'Arctic/Longyearbyen' },
  };
  const _wxFetchSun = (iata) => sunByKey[iata] || null;
  return new Function('AP', '_wxFetchSun', body + '\nreturn _wxNightAt;')(AP, _wxFetchSun);
}

// ── the readings this change exists for ────────────────────────────────────

test('KEF midsummer: still daylight at 22:00, where the old window said night', () => {
  // Reykjavik on 21 June — sunrise 03:01, sunset 00:02 the NEXT day. The fixed
  // window called night from 21:00, three hours early, every night for weeks.
  const night = decider({ KEF: { sunrise: '2026-06-21T03:01:00+00:00',
                                 sunset:  '2026-06-22T00:02:00+00:00' } });
  assert.equal(night('KEF', Date.parse('2026-06-21T22:00:00+00:00')), false,
    '22:00 is broad daylight in Reykjavik in June');
  assert.equal(night('KEF', Date.parse('2026-06-21T23:30:00+00:00')), false,
    'and so is 23:30, half an hour before sunset');
  assert.equal(night('KEF', Date.parse('2026-06-22T00:30:00+00:00')), true,
    'after 00:02 it really is night');
});

test('a sunset past midnight is handled as an interval, not a same-day pair', () => {
  // set < rise numerically; comparing naively would mark the whole day night.
  const night = decider({ KEF: { sunrise: '2026-06-21T03:01:00+00:00',
                                 sunset:  '2026-06-22T00:02:00+00:00' } });
  for (const h of ['04:00', '09:00', '14:00', '19:00', '23:00']) {
    assert.equal(night('KEF', Date.parse(`2026-06-21T${h}:00+00:00`)), false,
      `${h} falls inside the daylight interval`);
  }
});

test('KEF midwinter: dark at 09:00, where the old window said day', () => {
  // sunrise 11:22, sunset 15:34. The fixed window called day from 06:00 —
  // more than five hours before the sun came up.
  const night = decider({ KEF: { sunrise: '2026-12-21T11:22:00+00:00',
                                 sunset:  '2026-12-21T15:34:00+00:00' } });
  assert.equal(night('KEF', Date.parse('2026-12-21T09:00:00+00:00')), true,
    '09:00 is still dark in Reykjavik in December');
  assert.equal(night('KEF', Date.parse('2026-12-21T13:00:00+00:00')), false,
    '13:00 is the short daylight');
  assert.equal(night('KEF', Date.parse('2026-12-21T17:00:00+00:00')), true,
    '17:00 is dark again — the old window held it as day until 21:00');
});

// ── polar day and polar night are answers, not missing data ────────────────

test('polar day is day, all twenty-four hours of it', () => {
  const night = decider({ SVALBARD: { sunrise: null, sunset: null, polarDay: true } });
  for (const h of ['00:00', '06:00', '12:00', '23:00']) {
    assert.equal(night('SVALBARD', Date.parse(`2026-06-21T${h}:00Z`)), false, `${h} in polar day`);
  }
});

test('polar night is night, all twenty-four hours of it', () => {
  const night = decider({ SVALBARD: { sunrise: null, sunset: null, polarNight: true } });
  for (const h of ['00:00', '06:00', '12:00', '23:00']) {
    assert.equal(night('SVALBARD', Date.parse(`2026-12-21T${h}:00Z`)), true, `${h} in polar night`);
  }
});

test('the polar flags are checked BEFORE the times, since there are none', () => {
  // A polar response carries null times. Reading those first would fall
  // through to the fixed window and silently discard the real answer.
  const night = decider({ SVALBARD: { sunrise: null, sunset: null, polarNight: true } });
  assert.equal(night('SVALBARD', Date.parse('2026-12-21T12:00:00Z')), true,
    'midday in polar night must be night, not the 06/21 guess');
});

// ── the fallback, which every cold boot uses ───────────────────────────────

test('with no reading yet it degrades to exactly the old 06:00-21:00 window', () => {
  // The fetch is asynchronous and the card paints immediately, so the first
  // frame after a cold boot always takes this path. It must be the previous
  // behaviour, not a blank and not a throw.
  const night = decider({});
  const zurichAt = (hhmm) => night('ZRH', Date.parse(`2026-09-13T${hhmm}:00+02:00`));
  assert.equal(zurichAt('05:59'), true);
  assert.equal(zurichAt('06:00'), false);
  assert.equal(zurichAt('20:59'), false);
  assert.equal(zurichAt('21:00'), true);
});

test('a half-formed reading falls back rather than guessing from one time', () => {
  // sunrise without sunset says nothing usable about when night begins.
  const night = decider({ ZRH: { sunrise: '2026-09-13T05:00:00+00:00', sunset: null } });
  assert.equal(night('ZRH', Date.parse('2026-09-13T12:00:00+02:00')), false);
  assert.equal(night('ZRH', Date.parse('2026-09-13T23:00:00+02:00')), true,
    'the 06/21 fallback still answers, rather than the incomplete pair');
});

test('an unparseable time falls back instead of throwing', () => {
  const night = decider({ ZRH: { sunrise: 'not-a-time', sunset: 'also-not' } });
  assert.doesNotThrow(() => night('ZRH', Date.parse('2026-09-13T12:00:00+02:00')));
  assert.equal(night('ZRH', Date.parse('2026-09-13T12:00:00+02:00')), false);
});

// ── the route ──────────────────────────────────────────────────────────────

test('the worker route exists and reuses the forecast route s discipline', () => {
  assert.match(WORKER, /path === '\/wxsun'/, 'the /wxsun route must be registered');
  const at = WORKER.indexOf("path === '/wxsun'");
  const block = WORKER.slice(at, at + 5200);
  assert.match(block, /api\.met\.no\/weatherapi\/sunrise\/3\.0\/sun/, 'MET Sunrise 3.0');
  assert.match(block, /MET_UA/, 'MET requires a real User-Agent naming the app');
  assert.match(block, /Accept-Encoding': 'gzip'/, 'and asks for gzip');
  assert.match(block, /toFixed\(2\)/,
    'coordinates rounded so every board at one airport shares one upstream call');
  assert.match(block, /kFresh/, 'fresh cache');
  assert.match(block, /kLkg/, 'last-known-good, so an outage shows yesterday rather than nothing');
  assert.match(block, /kNeg/, 'negative cache, so a refusal is not re-fetched in a loop');
  assert.match(block, /status === 203/,
    'MET signals deprecation with 203 — it must not become a silent hard failure');
});

test('the route normalises polar state instead of leaving it to be inferred', () => {
  const at = WORKER.indexOf("path === '/wxsun'");
  const block = WORKER.slice(at, at + 5200);
  assert.match(block, /polarDay/);
  assert.match(block, /polarNight/);
  assert.match(block, /disc_centre_elevation|noon\.visible/,
    'above the circle the state comes from solar noon, not from a rise/set pair');
  assert.match(block, /sunUpAtNoon === null\) body = null/,
    'a response with neither times nor a usable solar noon must be treated as ' +
    'upstream failure, not reported as a polar state we never established');
});

test('open-meteo is not reintroduced for solar times', () => {
  // It publishes sunrise/sunset and is the obvious shortcut. Its free tier is
  // non-commercial only and these boards carry advertising — v23452 moved off
  // it for exactly that reason.
  const at = WORKER.indexOf("path === '/wxsun'");
  const block = WORKER.slice(at, at + 5200);
  assert.doesNotMatch(block, /api\.open-meteo\.com/,
    'solar times must come from MET, under the licence the boards actually hold');
});

test('the client keys its cache by airport AND local date', () => {
  // A board runs for weeks without reloading; the answer changes at the
  // airport's own midnight, not the player machine's.
  const dateAt = SRC.indexOf('function _wxLocalDate');
  assert.ok(dateAt >= 0, 'the local date helper must exist');
  const dateBody = SRC.slice(dateAt, dateAt + 600);
  assert.match(dateBody, /en-CA/,
    'en-CA formats as YYYY-MM-DD, which is both the cache key and MET s date parameter');
  assert.match(dateBody, /timeZone: z/, 'the date is the AIRPORT s local date, not the host s');

  const at = SRC.indexOf('function _wxFetchSun');
  assert.ok(at >= 0, '_wxFetchSun must exist');
  const body = SRC.slice(at, at + 2200);
  assert.match(body, /iata \+ '\|' \+ day/, 'cache key is airport plus local date');
  assert.match(body, /pending/, 'in-flight guard, like _wxFetchDaily');
  assert.match(body, /j\.error/, 'an unavailable body is not a reading and must not be cached');
});
