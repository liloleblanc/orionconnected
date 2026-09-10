'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER BANS ARE ENFORCED BY CI, NOT BY A COMMENT SOMEBODY MIGHT READ.
//
// Nick, 2026-09-10, after finding an unattended cron I had added on 2026-08-26
// that BOUGHT API credits on an account he had settled and closed:
//   "NO RAPID API IS NOT APPROVED GET IT??????"
//   "ITS TOO EXPENSIVE"
//   "anything from Rapid API disconnected RIGHT NOW this was never authorized"
//   "I am appalled right now this is not ok this is doing things agaisnt my wish"
//
// and, on the fifth time of being told:
//   "this must be the 5th time i tell you no.... They do not do this...
//    I emailed and I was told to fuck off."   (airplanes.live)
//
// Comments did not hold the line — three separate ones described the
// airplanes.live refusal as a "pending" registration, which is exactly why it
// kept being re-proposed to him. These assertions do hold it: re-enabling
// either provider turns CI red with his own words in the failure message.
//
// See docs/FLIGHT-DATA-PROVIDERS.md.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKER = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');
const WRANGLER = fs.readFileSync(path.join(ROOT, 'workers', 'wrangler.fids-proxy.jsonc'), 'utf8');

// These bans are documented in long prose blocks that necessarily QUOTE the
// thing being banned, so a naive substring search finds the warning label and
// scores it as the offence. Assertions about what the worker DOES must read
// code with the comments stripped; assertions about what it SAYS read the
// original. Getting this backwards is how a guard test passes while the bug
// it guards is live.
const CODE = WORKER
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// ── RapidAPI / AeroDataBox ────────────────────────────────────────────────

test('the AeroDataBox kill switch is ON', () => {
  assert.match(WORKER, /const ADB_DISCONNECTED = true;/,
    'ADB_DISCONNECTED must stay true — RapidAPI is not an approved provider and Nick has refused it on cost');
});

test('adbFetch actually blocks, and does not fall through to fetch()', () => {
  const at = WORKER.indexOf('function adbFetch(');
  assert.ok(at >= 0, 'adbFetch must exist — it is the single enforcement point');
  const body = WORKER.slice(at, WORKER.indexOf('\n}', at));
  assert.match(body, /if \(ADB_DISCONNECTED\)/, 'adbFetch must check the switch');
  assert.match(body, /return Promise\.resolve\(new Response\(/,
    'a blocked call must be answered locally, never forwarded');
});

test('NOTHING in the worker can reach aerodatabox.p.rapidapi.com', () => {
  // Every AeroDataBox call site must go through adbFetch. A bare fetch() to
  // that host — even an unauthenticated one after the secret is deleted — is
  // a request to an unapproved provider and therefore a billable event.
  const offenders = CODE.split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /\bfetch\s*\(/.test(line) && !/adbFetch\s*\(/.test(line))
    .filter(({ line }) => /aerodatabox|adbUrl|\$\{ADB\}/.test(line));
  assert.deepEqual(offenders.map(o => `${o.n}: ${o.line.trim()}`), [],
    'these lines call AeroDataBox directly — route them through adbFetch()');
});

test('the credit-buying cron is disabled in the worker', () => {
  const at = WORKER.indexOf('async scheduled(');
  assert.ok(at >= 0, 'scheduled() must still exist so the history stays readable');
  const head = WORKER.slice(at, at + 2600);
  assert.match(head, /return;/,
    'scheduled() must return before doing any AeroDataBox work');
  const guard = head.indexOf('return;');
  const spend = head.indexOf('balance/refill');
  assert.ok(guard >= 0 && (spend === -1 || guard < spend),
    'the early return must come BEFORE the refill call — that call SPENDS money');
});

test('the cron trigger is removed from the wrangler config', () => {
  assert.doesNotMatch(WRANGLER, /"crons"\s*:\s*\[[^\]]*"[^"]+"/,
    'no cron may be scheduled: the only job it ever had was buying AeroDataBox credits twice a day');
});

test('a purchase is never made without asking — no refill path stays reachable', () => {
  // The specific failure: "use aerodatabox for now" was read as licence to buy.
  // Any future automated spend must be gated, not merely conditioned on a key
  // existing. Read CODE, not comments — the doc block above scheduled() quotes
  // the refill path while explaining why it is dead.
  // There are TWO refill paths and they need different proofs:
  //   · the manual HTTP route handler — blocked because it calls adbFetch
  //   · the copy inside scheduled() — blocked because scheduled() returns first
  // Both must hold. Asserting only one is how a live spend path survives.
  let from = 0, seen = 0;
  for (;;) {
    const refill = CODE.indexOf('subscriptions/balance/refill', from);
    if (refill === -1) break;
    seen++;
    assert.match(CODE.slice(Math.max(0, refill - 400), refill + 400), /adbFetch\(/,
      `refill site #${seen} PURCHASES credits with real money — it must go through the kill switch`);
    from = refill + 1;
  }
  const sched = CODE.indexOf('async scheduled(');
  if (sched !== -1) {
    const guard = CODE.indexOf('return;', sched);
    const cronRefill = CODE.indexOf('subscriptions/balance/refill', sched);
    assert.ok(guard !== -1 && (cronRefill === -1 || guard < cronRefill),
      'the cron copy must also sit after scheduled()\'s early return, unreachable');
  }
});

// ── airplanes.live ────────────────────────────────────────────────────────

test('airplanes.live stays out of the provider ring without a key', () => {
  assert.match(WORKER, /\.filter\(\(p\) => p !== "airplanes\.live" \|\| !!env\.ADSB_KEY\)/,
    'airplanes.live refused us access — it must not be called anonymously');
});

test('no comment describes the airplanes.live refusal as pending or outstanding', () => {
  // THIS is the assertion that stops the fifth, sixth and seventh time.
  // "pending" / "never registered" / "not done" read as an open task, and every
  // session that read them proposed registering again.
  const lines = WORKER.split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /airplanes\.live/i.test(line))
    .filter(({ line }) => /registration (is )?pending|pending|never (been )?registered|key was never|not yet|todo|to-do/i.test(line))
    // The corrected comments are allowed to QUOTE the old wording while
    // explaining that it was a misreading.
    .filter(({ line }) => !/MISREAD|refused|closed question|do not|REFUSED/i.test(line));
  assert.deepEqual(lines.map(o => `${o.n}: ${o.line.trim()}`), [],
    'airplanes.live is a CLOSED question — Nick emailed them and was refused. Do not describe it as pending.');
});

// ── Flightradar24 — the approved feed ─────────────────────────────────────

test('EVERY FR24 call site is behind a spend cap', () => {
  // Nick: "BE sparing with flight radar only 60000 a month its simple use when
  // needed but use it". The last quota was lost to unattended polling, so the
  // invariant is per-call-site, not "a budget exists somewhere in the file".
  //
  // There are two independent gates with different local names — the DTW
  // schedule sweep uses `used`/`cap`, the ADS-B lookup uses `_used`/`_cap`.
  // An earlier version of this test hardcoded the second spelling, matched the
  // first site by accident, and would have passed with the real cap deleted.
  const sites = [];
  let from = 0;
  for (;;) {
    const i = CODE.indexOf('fr24api.flightradar24.com', from);
    if (i === -1) break;
    sites.push(i);
    from = i + 1;
  }
  assert.ok(sites.length > 0, 'FR24 is the approved paid feed and must still be wired');
  for (const i of sites) {
    const window = CODE.slice(Math.max(0, i - 1400), i);
    assert.match(window, /_?used\s*>=?\s*_?cap|_?used\s*<\s*_?cap/,
      `the FR24 call at offset ${i} must be gated by its daily budget before it fires`);
    assert.match(window, /FR24_DAILY_BUDGET/,
      `the FR24 call at offset ${i} must take its cap from FR24_DAILY_BUDGET, not a literal`);
  }
});

test('the settled decisions are documented where a human will find them', () => {
  const doc = path.join(ROOT, 'docs', 'FLIGHT-DATA-PROVIDERS.md');
  assert.ok(fs.existsSync(doc), 'docs/FLIGHT-DATA-PROVIDERS.md must exist');
  const md = fs.readFileSync(doc, 'utf8');
  for (const must of ['BANNED', 'REFUSED', 'APPROVED', 'airplanes.live', 'RapidAPI', 'Flightradar24']) {
    assert.ok(md.includes(must), `the provider doc must still cover ${must}`);
  }
});
