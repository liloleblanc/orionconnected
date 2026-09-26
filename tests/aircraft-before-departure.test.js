'use strict';

// WHY THIS EXISTS
//
// No home feed we read names the aircraft, and FR24 only sees aircraft that are
// transmitting, so a gate's next departure — and its inbound until it left the
// far end — drew no aircraft at all. Two free sources fill it (v23901):
//
//   1. The far end's own feed. Calgary names the IATA type on every row and the
//      registration days ahead; our parser dropped both. Measured on a capture
//      of 2026-09-26: 1,222 departures and 1,233 arrivals, every one with a
//      type; tomorrow's WS812 (a Calgary departure, a Moncton arrival) is a
//      737-700, C-GWJO.
//   2. The type a flight number usually flies, remembered from FR24 hits the
//      boards already pay for. Type only, never a registration, kept at most
//      29 days (FR24's API terms cap storage at 30).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workerPath = path.join(root, 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(workerPath, 'utf8');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const load = () => import(workerPath);
const fixture = (n) => fs.readFileSync(path.join(root, 'tests', 'fixtures', n), 'utf8');

test('Calgary rows keep their aircraft type and registration', async () => {
  const m = await load();
  const rows = m.yycParseFeed(fixture('yyc-sample.json'), 'dep', Date.now())
    .concat(m.yycParseFeed(fixture('yyc-sample.json'), 'arr', Date.now()));
  assert.ok(rows.length > 0, 'fixture parses');
  assert.ok(rows.every((r) => r.aircraft && r.aircraft.model), 'every Calgary row names its type');
  const regs = rows.map((r) => r.aircraft.reg).filter(Boolean);
  assert.ok(regs.length > 0, 'registrations are kept');
  regs.forEach((r) => assert.match(r, /^C-[FGI][A-Z]{3}$|^N[1-9][0-9A-Z]{0,4}$/, `printable registration: ${r}`));
});

test('Québec rows keep the IATA type code', async () => {
  const m = await load();
  const rows = m.yqbParseHits(fixture('yqb-hits-sample.json'), 'dep');
  assert.deepEqual(rows.map((r) => r.aircraft && r.aircraft.model), ['319', 'CR9', 'E7W']);
});

test('San Francisco reads the type out of its object', async () => {
  const m = await load();
  const rows = m.sfoParseFeed(fixture('sfo-sample.json'), 'dep', Date.now())
    .concat(m.sfoParseFeed(fixture('sfo-sample.json'), 'arr', Date.now()));
  assert.ok(rows.some((r) => r.aircraft && r.aircraft.model), 'at least one SFO row names its type');
  rows.forEach((r) => { if (r.aircraft) assert.equal(typeof r.aircraft.model, 'string'); });
});

test('only registrations that print correctly are shown', async () => {
  const { acDisplayRegistration: reg } = await load();
  assert.equal(reg('CGWJO'), 'C-GWJO');
  assert.equal(reg('C-FKWS'), 'C-FKWS');
  assert.equal(reg('N77576'), 'N77576');
  assert.equal(reg('PHAKE'), null, 'a guessed hyphen is a wrong registration');
  assert.equal(reg('GXLEA'), null);
  assert.equal(reg(''), null);
});

test('the remembered type is the usual one, and nothing older than 29 days', async () => {
  const { acMemAddObservation: add, acMemUsualType: usual } = await load();
  const day = (n) => Date.parse('2026-09-26T12:00:00Z') + n * 86400000;
  let rec = null;
  rec = add(rec, 'dh8d', day(0));
  rec = add(rec, 'DH8D', day(1));
  rec = add(rec, 'CRJ9', day(2));
  assert.equal(usual(rec, day(2)), 'DH8D', 'one swap does not outvote the usual');
  rec = add(rec, 'CRJ9', day(2));
  assert.equal(rec.obs.filter((o) => o.d === new Date(day(2)).toISOString().slice(0, 10)).length, 1,
    'one observation per day');
  assert.equal(usual(rec, day(40)), null, 'observations past the window are not used');
  rec = add(rec, 'E75L', day(40));
  assert.equal(rec.obs.length, 1, 'old observations are dropped on write');
  assert.equal(add(null, 'not a type!', day(0)), null);
  let big = null;
  for (let i = 0; i < 25; i++) big = add(big, 'A320', day(i));
  assert.ok(big.obs.length <= 10, 'bounded');
});

test("the far end's row is today's instance of the flight", async () => {
  const { acFeedIndexRows: index, acFeedPick: pick } = await load();
  const t0 = Date.parse('2026-09-27T16:00:00Z');
  const ix = index([
    { number: 'WS812', _authTs: t0, aircraft: { model: '73W', reg: 'C-GWJO' } },
    { number: 'WS812', _authTs: t0 + 86400000, aircraft: { model: '7M8', reg: 'C-FKWS' } },
    { number: 'AC156', _authTs: t0, aircraft: null },
  ]);
  assert.equal(ix.length, 2, 'rows without an aircraft are not indexed');
  assert.deepEqual(pick(ix, 'WS812', t0 + 4 * 3600000), { model: '73W', reg: 'C-GWJO' });
  assert.deepEqual(pick(ix, 'WS812', t0 + 86400000 + 3600000), { model: '7M8', reg: 'C-FKWS' });
  assert.equal(pick(ix, 'WS812', t0 + 3 * 86400000), null, 'nothing within 20 h, nothing shown');
  assert.equal(pick(ix, 'WS999', t0), null);
});

test('/acinfo is a public route ahead of the ADS-B and ADB catch-alls', () => {
  const at = WORKER.indexOf('if (path === "/acinfo")');
  assert.ok(at > 0, 'the route exists');
  assert.ok(at < WORKER.indexOf('if (path.startsWith("/adsb/"))'), 'declared before /adsb/');
  assert.ok(at < WORKER.indexOf('if (path.startsWith("/airports/") || path.startsWith("/flights/")'),
    'declared before the /flights/ catch-all');
  const body = WORKER.slice(at, at + 4000);
  assert.match(body, /AC_FLIGHT_RE\.test\(f\)/, 'the flight number is pattern-checked');
  assert.match(body, /basis = "usual"/);
  assert.doesNotMatch(body, /fr24api\.flightradar24\.com/, 'the lookup never calls FR24');
});

test('every FR24 hit is remembered, at no extra call', () => {
  const hit = WORKER.indexOf('const _frBody = JSON.stringify({ ac: [_ac], _provider: "fr24" });');
  assert.ok(hit > 0);
  assert.match(WORKER.slice(hit - 600, hit), /ctx\.waitUntil\(acMemRemember\(env, _p\.flight/);
  assert.match(WORKER, /const ACMEM_TTL_S = 29 \* 86400;/, 'kept under FR24\'s 30-day storage cap');
});

test('the board asks only when nothing is known, and repaints on an answer', () => {
  assert.match(CORE, /function _acInfoKick\(row, ourDir\)/);
  assert.match(CORE, /\} else if \(typeof _acInfoKick === 'function'\) \{\n\s+_acInfoKick\(currentFlight, 'dep'\);/,
    'the departing flight asks when its fallback is empty');
  assert.match(CORE, /\} else if \(typeof _acInfoKick === 'function'\) \{\n\s+_acInfoKick\(_ib2, 'arr'\);/,
    'the inbound asks when its fallback is empty');
  const fn = CORE.slice(CORE.indexOf('function _acInfoKick('), CORE.indexOf('function _acInfoKick(') + 2600);
  assert.match(fn, /< 600000\) return;/, 'at most once per flight per 10 minutes');
  assert.match(fn, /j\.basis === 'feed' \? \(j\.reg \|\| ''\) : ''/, 'a usual-type answer never carries a registration');
  assert.match(fn, /requestGateRebuild\(\)/);
});

test('an FR24 type that fills an empty field repaints the gate', () => {
  assert.match(CORE, /if \(_atFilled && typeof requestGateRebuild === 'function'\) requestGateRebuild\(\);/);
});
