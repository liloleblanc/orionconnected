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
  return SRC.slice(at - 200, at + 900);
}

test('only 402 burns the whole day', () => {
  const b = spendBlock();
  assert.match(b, /const _hardStop = \(_fr\.status === 402\);/,
    'a dead credit pool (402) is the only thing that should stop for the day');
  assert.match(b, /const _spend = _hardStop \? _cap : _used \+ 1;/,
    'anything else costs one ordinary call');
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
  const perMonth = perDay * 30;
  assert.ok(perMonth <= 60000,
    `${perDay}/day is ${perMonth}/month, past the agreed 60,000 call ceiling`);
  assert.ok(perDay > 562,
    `${perDay}/day is below the 562 calls/day already being made, so the ` +
    'budget would still be exhausted daily');
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
