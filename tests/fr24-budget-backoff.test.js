'use strict';

// v23732 — A TRANSIENT FR24 ERROR MUST NOT COST THE WHOLE DAY.
//
// Symptoms reported on a live MCO gate, which all turned out to be one fault:
// no aircraft type, no registration, and the map icon pointing sideways.
//
// The chain, measured rather than reasoned:
//   · The community ADS-B ring answers a Cloudflare Worker with 403/429 no
//     matter what. The SAME query returns HTTP 200 from a home IP — they block
//     datacenter egress, not the account.
//   · So FR24 is the only working source of reg, type and track. The proxy
//     already maps FR24's response into the ADS-B shape (r / t / track), so the
//     client needs no change.
//   · But the budget guard burned the ENTIRE daily cap on 402 OR 429 OR 403.
//     Only 402 means the credit pool is empty. A 429 says "slower", not "stop".
//   · One rate-limit therefore took FR24 off the board until the next UTC
//     midnight, and every lookup fell through to a ring that cannot answer.
//     With no track, _gateHeading() falls back to bearing-toward-airport —
//     which is the sideways plane.
//
// This pins the distinction, and separately raises the cap on instruction:
// real demand was already 562 calls/day against a 240/day cap, so the budget
// was being exhausted daily regardless of the back-off. 402 still stops for
// the day, and the CODE default stays 240 so a missing config fails safe.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'workers', 'fids-proxy.js'), 'utf8');

function spendBlock() {
  const at = SRC.indexOf('const _hardStop');
  assert.ok(at >= 0, 'the FR24 spend decision must still exist');
  // Widened from 900: the spend decision now reads the response body before it
  // can price the call, so the block it lives in is longer than it was.
  return SRC.slice(at - 200, at + 1800);
}

test('only 402 burns the whole day', () => {
  const b = spendBlock();
  assert.match(b, /const _hardStop = \(_fr\.status === 402\);/,
    'a dead credit pool (402) is the only thing that should stop for the day');
  // This used to pin the literal `_used + 1`, which was itself the defect: FR24
  // bills per returned row, so counting one per request meant FR24_DAILY_BUDGET
  // capped request COUNT and not spend. The INTENT of this assertion — that
  // anything short of 402 costs one ordinary call rather than the whole day —
  // is unchanged and is what is checked now; only the price of that call is
  // correct. See fr24-credit-accounting.test.js for the arithmetic.
  assert.match(b, /_spend = _hardStop\s*\?\s*_cap\s*:\s*_used \+ fr24Charge\(/,
    'a non-402 must cost one call at its real price, not the whole cap');
  assert.doesNotMatch(b, /_used \+ 1;/,
    'the per-request counter is back — the cap would stop capping spend');
});

test('a rate limit no longer costs the day', () => {
  // The exact regression: 429 or 403 in the hard-stop test.
  const b = spendBlock();
  assert.doesNotMatch(b, /_hardStop = \([^)]*429/,
    '429 is a rate limit, not an empty pool');
  assert.doesNotMatch(b, /_hardStop = \([^)]*403/,
    '403 here is a momentary refusal, not an empty pool');
});

test('a rate limit sets a short cool-off instead', () => {
  const b = spendBlock();
  assert.match(b, /fr24:cool:/, 'a cool-off key must be written');
  const m = b.match(/Date\.now\(\) \+ (\d+)\)/);
  assert.ok(m, 'the cool-off must carry a duration');
  const ms = Number(m[1]);
  assert.ok(ms >= 60000 && ms <= 900000,
    `${ms}ms is outside 1-15 minutes — long enough to be polite, short enough ` +
    'that the board recovers without waiting for UTC midnight');
});

test('the cool-off is actually honoured before spending', () => {
  // Writing the key without reading it would be a no-op fix.
  const at = SRC.indexOf('fr24:cool:');
  assert.ok(at >= 0);
  const readSite = SRC.indexOf('_coolUntil');
  assert.ok(readSite >= 0, 'the cool-off must be read back');
  assert.match(SRC, /if \(_used < _cap && Date\.now\(\) >= _coolUntil\)/,
    'the budget gate must check both the cap and the cool-off');
});

test('the cap still gates every call', () => {
  // Raising the cap is one thing; removing the gate would be another. Both
  // spend sites must still refuse to call once the day's allowance is used.
  const caps = SRC.match(/Number\(env\.FR24_DAILY_BUDGET \|\| (\d+)\)/g) || [];
  assert.ok(caps.length >= 2, 'both spend sites must still read the cap');
  assert.match(SRC, /if \(_used < _cap/, 'the cap must still gate the call');
  assert.match(SRC, /if \(used >= cap\) return/,
    'the second spend site must bail once the allowance is gone');
});

test('FR24 stays the only paid provider in this path', () => {
  // Guard against a future edit reaching for a banned provider when the ring
  // fails. RapidAPI/AeroDataBox is not approved; airplanes.live refused us.
  const at = SRC.indexOf('const _hardStop');
  const around = SRC.slice(at - 3000, at + 3000);
  assert.doesNotMatch(around, /rapidapi|aerodatabox/i,
    'RapidAPI/AeroDataBox is not an approved provider');
  assert.doesNotMatch(around, /airplanes\.live/i,
    'airplanes.live declined access — it is a closed question');
});

// ── The configured cap ───────────────────────────────────────────────────

test('the code default stays a conservative floor', () => {
  // The default is what applies if the var is ever removed. It must stay low
  // so a missing config fails safe rather than spending freely.
  const caps = SRC.match(/Number\(env\.FR24_DAILY_BUDGET \|\| (\d+)\)/g) || [];
  assert.ok(caps.length >= 2, 'both spend sites must read the cap');
  for (const c of caps) {
    assert.match(c, /\|\| 240\)/, 'the fail-safe default must stay 240');
  }
});

test('the configured cap is explicit, and inside the agreed call budget', () => {
  // Raised on instruction 2026-09-11. The ceiling is 60,000 CALLS a month.
  const W = fs.readFileSync(
    path.resolve(__dirname, '..', 'workers', 'wrangler.fids-proxy.jsonc'), 'utf8');
  const m = W.match(/"FR24_DAILY_BUDGET"\s*:\s*"(\d+)"/);
  assert.ok(m, 'the cap must be set explicitly in wrangler, not left to the default');
  const perDay = Number(m[1]);
  // A 31-day month is the one that has to fit, not an average one.
  const perMonth = perDay * 31;
  assert.ok(perMonth <= 60000,
    `${perDay}/day is ${perMonth} in a 31-day month, past the agreed 60,000 ceiling`);
  assert.ok(perDay > 562 * 2,
    `${perDay}/day leaves too little room above the observed 562 calls/day — ` +
    'an allowance that is never reached is the point, and an unused one is waste');
});

test('the reasoning for the cap is recorded next to it', () => {
  // This number is the owner\'s money. A bare value invites a future edit to
  // move it without knowing what it was measured against.
  const W = fs.readFileSync(
    path.resolve(__dirname, '..', 'workers', 'wrangler.fids-proxy.jsonc'), 'utf8');
  const at = W.indexOf('"FR24_DAILY_BUDGET"');
  const above = W.slice(Math.max(0, at - 1600), at);
  assert.match(above, /credits/i,
    'the comment must note that calls and credits are different meters');
  assert.match(above, /60,?000/,
    'the comment must state the monthly ceiling it was sized against');
});

// ── The second spender: the Detroit schedule sweep ───────────────────────
// This is the one that actually caused "half the time there is no airplane
// data". It fires up to 30 requests back to back — the shape that trips a rate
// limiter — and wrote used = cap into the SHARED fr24:used:<day> key, blinding
// registration, type and heading on EVERY gate board until the next UTC
// midnight. Fixing only the /adsb/ path would have left this untouched.

function dtwBlock() {
  const at = SRC.indexOf('DTW_FR24_MAX_CALLS');
  assert.ok(at >= 0, 'the Detroit sweep must still exist');
  const start = SRC.indexOf('while (cursor < endTs', at);
  assert.ok(start >= 0, 'its loop must still exist');
  return SRC.slice(start, start + 1800);
}

test('the Detroit sweep only burns the day on an empty pool', () => {
  const b = dtwBlock();
  assert.match(b, /if \(r\.status === 402\) \{ used = cap; break; \}/,
    '402 alone should stop the day');
  assert.doesNotMatch(b, /r\.status === 402 \|\| r\.status === 429/,
    'a rate limit from a 30-call burst must not blind every board for the day');
});

test('a rate limit ends the sweep and sets the shared cool-off', () => {
  const b = dtwBlock();
  assert.match(b, /r\.status === 429 \|\| r\.status === 403/,
    'a rate limit must be handled explicitly');
  assert.match(b, /fr24:cool:/,
    'and must set the same cool-off the other path honours');
  assert.match(b, /break;/, 'and end this sweep');
});

test('the sweep respects a cool-off before starting a burst', () => {
  const at = SRC.indexOf('DTW_FR24_CACHE_KEY');
  const seg = SRC.slice(at, at + 4000);
  assert.match(seg, /coolUntil/,
    'the sweep must check the cool-off before firing 30 requests');
  assert.match(seg, /if \(Date\.now\(\) < coolUntil\) return/,
    'and bail out while it is in force');
});

test('both spenders share one cool-off key', () => {
  // Two different keys would let each path burst past the other's back-off.
  const keys = [...SRC.matchAll(/fr24:cool:\$\{(\w+)\}/g)].map(m => m[1]);
  assert.ok(keys.length >= 2, 'both paths must write a cool-off');
  const reads = [...SRC.matchAll(/get\(`fr24:cool:\$\{(\w+)\}`\)/g)];
  assert.ok(reads.length >= 2, 'both paths must read it back');
});

// ── The expensive endpoint cannot drain the pool ─────────────────────────
// The concern this answers, in the owner's words: "I just dont want to see it
// flush out like last time." Last time an unattended cron BOUGHT credits and
// emptied the quota, and every board lost aircraft data for days.
//
// Nothing here buys anything — that cron is gone and this code only ever
// spends calls the plan already includes. But the two endpoints cost very
// differently (2.7 credits a call for a position, 59 for a summary), so the
// summary sweep is the one that could empty a credit pool. It gets its own
// ceiling so it can never take the cheap lookups' room.

test('the summary sweep has a budget of its own, separate from the shared one', () => {
  assert.match(SRC, /fr24:sweep:/,
    'the expensive endpoint must count against its own key');
  assert.match(SRC, /FR24_SUMMARY_DAILY_CALLS \|\| (\d+)/,
    'and have its own configurable cap');
  assert.match(SRC, /if \(sweepUsed >= sweepCap\) return/,
    'and bail out once that cap is reached');
});

test('the sweep cap is small next to the shared budget', () => {
  const m = SRC.match(/FR24_SUMMARY_DAILY_CALLS \|\| (\d+)/);
  assert.ok(m);
  const sweepCap = Number(m[1]);
  const d = SRC.match(/Number\(env\.FR24_DAILY_BUDGET \|\| (\d+)\)/);
  assert.ok(d);
  // At 59 vs 2.7 credits a call, the sweep must stay a minority of the burn.
  const sweepCredits = sweepCap * 59;
  const posCredits = 1800 * 2.7;         // the configured shared cap
  assert.ok(sweepCredits < posCredits,
    `${sweepCap} summary calls is ${sweepCredits} credits against ${posCredits} ` +
    'for the position lookups — the expensive endpoint must not dominate');
  assert.ok(sweepCap >= 30,
    'but it must still allow a full sweep (DTW_FR24_MAX_CALLS) plus a retry');
});

test('the sweep still writes back what it actually spent', () => {
  assert.match(SRC, /put\(sweepKey, String\(sweepUsed \+ calls\)/,
    'its own counter must advance by the calls made, or the cap never bites');
});

test('nothing in this path purchases anything', () => {
  // The 2026-08-26 incident was a cron that BOUGHT credits. Both are gone and
  // must stay gone: this code may spend the plan, never top it up.
  //
  // Scanned with COMMENTS STRIPPED. The first draft flagged the word "billing"
  // inside its own explanatory comment — a guard that reads prose as if it were
  // code reports the documentation, not the behaviour.
  const at = SRC.indexOf('dtwFr24Schedule');
  const around = SRC.slice(Math.max(0, at - 2000), at + 6000)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(around, /\b(purchase|topUp|top_up|buyCredits|creditBalance)\b/i,
    'this path must never buy credits — that is what emptied the quota before');
  // And the removed cron must stay removed.
  const W = fs.readFileSync(
    path.resolve(__dirname, '..', 'workers', 'wrangler.fids-proxy.jsonc'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(W, /"crons"\s*:/,
    'no cron on this worker — an unattended schedule is what spent the money');
});
