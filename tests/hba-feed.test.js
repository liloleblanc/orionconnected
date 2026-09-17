'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// HOBART — the first Australian airport here besides Sydney.
//
// Its feed is the simplest in the estate: one WordPress JSON document with
// BOTH directions in it, already in ISO-8601 with the +10:00 offset attached.
// That last part is the reason this test exists. Every other authority parser
// receives a wall clock with no offset and has to place it in a zone; this one
// receives the instant outright, and the two paths through localIsoObj are
// different code. A regression that made Hobart read as UTC would shift the
// whole board ten hours and still look plausible, so the offset is asserted
// explicitly rather than assumed.
//
// The parser is lifted from the Worker source rather than re-implemented, so
// this tests the code that actually runs.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'hba-timetable.json'), 'utf8');

function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'fids-proxy.js must define ' + name);
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
function table(decl) {
  const at = SRC.search(decl);
  assert.ok(at >= 0, decl + ' must exist');
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1) + ';'; }
  }
  throw new Error('unterminated table');
}

// _tzOffsetFmt is a module-level cache the offset helper reads. Leaving it out
// makes tzOffsetAt throw into its own catch and quietly answer "+00:00" — the
// offsets then all look like UTC and the failure reads as a source-data bug
// rather than a missing stub. It is declared here for that reason.
function loadParser() {
  const body = [
    'const __name = (f) => f;',
    'const _tzOffsetFmt = new Map();',
    lift('tzOffsetAt'), lift('tzOffsetFor'),
    lift('localTimeObjIn'), lift('localTimeObjFromTs'),
    lift('localIsoObj'), lift('settleRevised'), lift('authorityFlight'),
    table(/const AIRLINE_IATA_NAME = \{/),
    table(/const HBA_STATUS = \{/), table(/const HBA_CITY_IATA = \{/),
    lift('hbaParseFeed'),
    'return hbaParseFeed;',
  ].join('\n');
  return new Function(body)();
}

const parse = loadParser();
const home = (f, dir) => (dir === 'dep' ? f.departure : f.arrival);
const away = (f, dir) => (dir === 'dep' ? f.arrival : f.departure);

test('both directions come out of the one document', () => {
  const dep = parse(FIXTURE, 'dep');
  const arr = parse(FIXTURE, 'arr');
  assert.ok(dep.length > 0, 'departures must parse');
  assert.ok(arr.length > 0, 'arrivals must parse');
  // The feed is a single fetch; a parser that returned the same side for both
  // would still look healthy on counts alone.
  assert.notDeepEqual(dep.map((f) => f.number), arr.map((f) => f.number),
    'departures and arrivals must not be the same rows');
});

test('the Hobart offset survives — this is not UTC', () => {
  for (const dir of ['dep', 'arr']) {
    for (const f of parse(FIXTURE, dir)) {
      const t = home(f, dir).scheduledTime;
      assert.match(t.local, /\+1[01]:00$/,
        `${f.number} local time must carry Hobart's offset, got ${t.local}`);
      assert.match(t.utc, /\+00:00$/, 'the utc field is always UTC');
      // And the two must describe the same instant: local minus offset = utc.
      const off = Number(t.local.slice(-6, -3));
      const lh = Number(t.local.slice(11, 13));
      const uh = Number(t.utc.slice(11, 13));
      assert.equal(((lh - off) % 24 + 24) % 24, uh,
        `${f.number}: local ${t.local} and utc ${t.utc} disagree`);
    }
  }
});

test('an arrival carries its carousel where a departure carries its gate', () => {
  // The board reads ONE field for both and labels it by direction, so the
  // parser has to choose the right source column per direction. Getting this
  // backwards would put a baggage belt number on a gate sign.
  const arr = parse(FIXTURE, 'arr');
  const doc = JSON.parse(FIXTURE);
  const withCarousel = doc.arrivals.filter((r) => r.carousel);
  if (withCarousel.length) {
    const want = String(withCarousel[0].carousel);
    const got = arr.find((f) => f.number === withCarousel[0].flight_number);
    assert.ok(got, 'that arrival must be present');
    assert.equal(home(got, 'arr').gate, want, 'the carousel must ride through');
  }
  const dep = parse(FIXTURE, 'dep');
  const withGate = doc.departures.filter((r) => r.gate);
  if (withGate.length) {
    const got = dep.find((f) => f.number === withGate[0].flight_number);
    assert.equal(home(got, 'dep').gate, String(withGate[0].gate));
  }
});

test('every destination resolves to a real IATA code', () => {
  // Hobart writes city names, not codes. An unmapped city leaves the board
  // with a name and no code, which breaks the route map rather than the row —
  // a quiet failure, so it is asserted.
  for (const dir of ['dep', 'arr']) {
    const unmapped = parse(FIXTURE, dir)
      .filter((f) => !away(f, dir).airport.iata)
      .map((f) => away(f, dir).airport.name);
    assert.deepEqual(unmapped, [],
      'these cities have no IATA mapping: ' + unmapped.join(', '));
  }
});

test('an empty status means scheduled, not missing', () => {
  // The feed runs five days ahead, so most rows have no status at all. Reading
  // that as a fault would empty the board of everything but today.
  const doc = JSON.parse(FIXTURE);
  const blank = doc.departures.filter((r) => !r.status);
  if (blank.length) {
    const out = parse(FIXTURE, 'dep');
    const got = out.find((f) => f.number === blank[0].flight_number);
    assert.ok(got, 'a status-less row must still produce a flight');
    assert.equal(got.status, 'scheduled');
  }
  // And a status the feed does use maps to the board's own vocabulary.
  const known = ['arrived', 'departed', 'gateclosed', 'boarding', 'cancelled',
                 'delayed', 'final', 'ontime', 'scheduled'];
  for (const dir of ['dep', 'arr']) {
    for (const f of parse(FIXTURE, dir)) {
      assert.ok(known.includes(f.status), `${f.number} has status ${f.status}`);
    }
  }
});

test('an estimate equal to schedule is not a revision', () => {
  // The feed repeats the scheduled time in estimated_time when nothing has
  // changed. Passing that through would draw every row as revised.
  const doc = JSON.parse(FIXTURE);
  for (const dir of ['dep', 'arr']) {
    const rows = dir === 'dep' ? doc.departures : doc.arrivals;
    const same = rows.filter((r) => r.estimated_time === r.scheduled_time);
    const out = parse(FIXTURE, dir);
    for (const r of same) {
      const f = out.find((x) => x.number === r.flight_number);
      if (f) assert.equal(home(f, dir).revisedTime, undefined,
        `${r.flight_number} has no real revision and must not carry one`);
    }
  }
});

test('the airport is wired into the Worker and the client together', () => {
  assert.match(SRC, /hba:\s*\{\s*tz:\s*"Australia\/Hobart"/,
    'the Worker must register an hba authority handler');
  assert.match(SRC, /hobartairport\.com\.au\/wp-json\/hba\/v1\/timetable/,
    'and point at the airport\'s own feed');
  const core = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
  assert.match(core, /HBA:\{ name:'Hobart International Airport'/, 'the client needs the airport');
  assert.match(core, /HBA: 'YMHB'/,
    'and its ICAO, because the Y-rule would derive KHBA from the IATA code');
});
