// v23335 — the airport picker must offer exactly the airports that have data.
// Nick: "Maui doesn't work, all airports don't work"; "that's stupid to have an
// airport with no feed on a list of airports that people would watch". A board
// fills only when the worker has a handler for that airport; everything else
// answers an empty 200 and paints blank. This test keeps the client's
// FIDS_LIVE_AIRPORTS in step with the worker's AUTHORITY_HANDLERS, so adding a
// handler fails the suite until the picker learns about it (and vice versa).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(path.join(here, '..', 'workers', 'fids-proxy.js'), 'utf8');
const core = readFileSync(path.join(here, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Airports served outside AUTHORITY_HANDLERS: YQM from the webhook cache
// (maybeServeYqmCache) and YHZ from its bespoke handler (maybeServeYhzAuthority).
const EXTRA = ['YQM', 'YHZ'];

// Handlers that exist and parse correctly, but whose upstream blocks the
// Worker's datacenter IP: every request 429s, so the board would be blank.
// Verified live 2026-09-06. Remove a code here the day its block lifts.
const EGRESS_BLOCKED = ['YVR', 'MAN', 'DCA', 'IAD'];

function registryCodes() {
  const start = worker.indexOf('const AUTHORITY_HANDLERS = {');
  assert.ok(start >= 0, 'AUTHORITY_HANDLERS not found in the worker');
  const end = worker.indexOf('\n};', start);
  assert.ok(end > start, 'AUTHORITY_HANDLERS end not found');
  const block = worker.slice(start, end);
  return [...block.matchAll(/^ {2}([a-z0-9]{3}): \{ tz: "/gm)].map((m) => m[1].toUpperCase());
}

function clientCodes() {
  const start = core.indexOf('const FIDS_LIVE_AIRPORTS = new Set([');
  assert.ok(start >= 0, 'FIDS_LIVE_AIRPORTS not found in fids-core.js');
  const end = core.indexOf(']);', start);
  assert.ok(end > start, 'FIDS_LIVE_AIRPORTS end not found');
  return [...core.slice(start, end).matchAll(/'([A-Z0-9]{3})'/g)].map((m) => m[1]);
}

test('the picker offers exactly the airports the worker can serve', () => {
  const expected = new Set([...registryCodes(), ...EXTRA].filter((c) => !EGRESS_BLOCKED.includes(c)));
  const actual = new Set(clientCodes());
  const missing = [...expected].filter((c) => !actual.has(c)).sort();
  const extra = [...actual].filter((c) => !expected.has(c)).sort();
  assert.deepEqual(missing, [], `airports with a working feed that the picker hides: ${missing.join(' ')}`);
  assert.deepEqual(extra, [], `airports the picker offers with no working feed: ${extra.join(' ')}`);
});

test('no egress-blocked airport is offered', () => {
  const actual = new Set(clientCodes());
  for (const c of EGRESS_BLOCKED) assert.equal(actual.has(c), false, `${c} answers 429 and must not be offered`);
});

test('the picker filters its autocomplete on that set', () => {
  assert.match(core, /FIDS_LIVE_AIRPORTS\.has\(a\.c\)/, 'the AP_LIST autocomplete no longer filters on FIDS_LIVE_AIRPORTS');
});

test('every offered airport has a name and a timezone in the AP table', () => {
  const start = core.indexOf('const AP = {');
  const end = core.indexOf('\n};', start);
  const apBlock = core.slice(start, end);
  for (const c of clientCodes()) {
    assert.match(apBlock, new RegExp(`\\n\\s*${c}\\s*:\\s*\\{[^}]*tz\\s*:`), `${c} is offered but missing from the AP table`);
  }
});

// v23338 — the mobile companion (app.html) has its own hardcoded airport
// catalogue and its own picker, so it needs the same cut. Nick saw dead
// airports still on offer there after the board's picker was filtered.
test('the mobile app offers the same live airports as the board', () => {
  const app = readFileSync(path.join(here, '..', 'fids-current', 'app.html'), 'utf8');
  const s = app.indexOf('const APP_LIVE_AIRPORTS = new Set([');
  assert.ok(s >= 0, 'APP_LIVE_AIRPORTS not found in app.html');
  const codes = [...app.slice(s, app.indexOf(']);', s)).matchAll(/'([A-Z0-9]{3})'/g)].map((m) => m[1]);
  assert.deepEqual(codes.slice().sort(), clientCodes().slice().sort(), 'app.html and fids-core.js disagree on which airports are live');
  assert.match(app, /APP_LIVE_AIRPORTS\.has\(k\)/, 'the app picker no longer filters on APP_LIVE_AIRPORTS');
});

// v23346 — the rotator filters hand-written tour lists against its own copy of
// the roster (a URL can name any airport), so it has to agree with the board.
test('the rotator knows the same live airports as the board', () => {
  const rot = readFileSync(path.join(here, '..', 'fids-current', 'rotate.html'), 'utf8');
  const s = rot.indexOf('var ROSTER = [');
  assert.ok(s >= 0, 'ROSTER not found in rotate.html');
  const codes = [...rot.slice(s, rot.indexOf('];', s)).matchAll(/'([A-Z0-9]{3})'/g)].map((m) => m[1]);
  assert.deepEqual(codes.slice().sort(), clientCodes().slice().sort(), 'rotate.html and fids-core.js disagree on which airports are live');
});

test('every airport in the default tour has a feed', () => {
  const rot = readFileSync(path.join(here, '..', 'fids-current', 'rotate.html'), 'utf8');
  const s = rot.indexOf('var TOUR_DEFAULT = [');
  const tour = [...rot.slice(s, rot.indexOf('];', s)).matchAll(/'([A-Z0-9]{3})'/g)].map((m) => m[1]);
  const live = new Set(clientCodes());
  const dead = tour.filter((c) => !live.has(c));
  assert.deepEqual(dead, [], `the stream tour would show airports with no feed: ${dead.join(' ')}`);
});
