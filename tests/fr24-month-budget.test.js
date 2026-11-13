'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24118 — THE MONTH HAS TO LAST TO THE RENEWAL.
//
// 2026-11-04 at 12:32 AST Flightradar24 started answering 402 to every call:
// the month's 60,000 credits were gone a day before the plan renewed on the
// 5th (1,900 counted a day is 58,900 in a 31-day period, and the counter
// misses a little of what FR24 bills). The worker then marked each day spent
// at its first refusal, so even after the renewal every gate stayed without
// aircraft until 20:00 AST. Pinned here:
//   - the day's cap is the month's credits x 0.95 over the days in this
//     billing period (5th to 5th), so a period cannot spend past its credits;
//   - a 402 pauses FR24 for an hour and costs nothing (fr24-budget-backoff);
//   - while FR24 holds back, OpenSky asks its boxes every 30 s.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modP = null;
const worker = () => (modP = modP || import(pathToFileURL(path.join(__dirname, '..', 'workers', 'fids-proxy.js')).href));
const fakeKv = () => {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, String(v)); } };
};
const EXPLORER = { FR24_MONTHLY_CREDITS: '60000', FR24_MONTHLY_CREDITS_2027: '30000', FR24_DAILY_BUDGET: '1900' };

test('a billing period runs from the 5th to the 5th', async () => {
  const w = await worker();
  assert.equal(w.fr24PeriodDays(Date.UTC(2026, 10, 5, 12)), 30, 'Nov 5 to Dec 5');
  assert.equal(w.fr24PeriodDays(Date.UTC(2026, 10, 4, 12)), 31, 'Oct 5 to Nov 5: the period that ran out');
  assert.equal(w.fr24PeriodDays(Date.UTC(2027, 0, 3, 12)), 31, 'Dec 5 to Jan 5, across the year');
  assert.equal(w.fr24PeriodDays(Date.UTC(2027, 1, 10, 12)), 28, 'Feb 5 to Mar 5');
});

test('the day cap comes from the month, so no period spends past its credits', async () => {
  const w = await worker();
  assert.equal(w.fr24EffectiveCap(1900, Date.UTC(2026, 10, 10, 12), EXPLORER), 1900);
  assert.equal(w.fr24EffectiveCap(1900, Date.UTC(2026, 9, 20, 12), EXPLORER), 1838, 'a 31-day period');
  // the period that ran out: 31 days at the new cap, with the counter 3% short, fits
  const oct = w.fr24EffectiveCap(1900, Date.UTC(2026, 9, 20, 12), EXPLORER);
  assert.ok(oct * 31 * 1.03 <= 60000, oct * 31 * 1.03 + ' credits billed in the 31-day period');
  assert.ok(1900 * 31 * 1.03 > 60000, 'and the old flat 1,900 did not');
  // after the promotion: the plan's own 30,000
  const jan = w.fr24EffectiveCap(1900, Date.UTC(2027, 0, 10, 12), EXPLORER);
  assert.equal(jan, Math.floor(30000 * 0.95 / 31));
  // a bigger plan is one number
  assert.equal(w.fr24EffectiveCap(1900, Date.UTC(2026, 10, 10, 12), { FR24_MONTHLY_CREDITS: '666000', FR24_MONTHLY_CREDITS_2027: '333000' }), 21090);
  // without the monthly figure, the old daily budget and the 2027 clamp
  assert.equal(w.fr24EffectiveCap(1900, Date.UTC(2026, 10, 10, 12), {}), 1900);
  assert.equal(w.fr24EffectiveCap(1900, Date.UTC(2027, 0, 10, 12), {}), 950);
});

test('the config sets the monthly credits: the Essential plan since 2026-11-12', async () => {
  const cfg = require('node:fs').readFileSync(path.join(__dirname, '..', 'workers', 'wrangler.fids-proxy.jsonc'), 'utf8');
  assert.match(cfg, /"FR24_MONTHLY_CREDITS": "333000",/);
  assert.match(cfg, /"FR24_MONTHLY_CREDITS_2027": "333000",/);
  // the day's cap that follows: twice what the boards need, and a whole period inside the plan
  const w = await worker();
  const ESSENTIAL = { FR24_MONTHLY_CREDITS: '333000', FR24_MONTHLY_CREDITS_2027: '333000', FR24_DAILY_BUDGET: '1900' };
  assert.equal(w.fr24EffectiveCap(1900, Date.UTC(2026, 10, 14, 12), ESSENTIAL), 10545);
  assert.equal(w.fr24EffectiveCap(1900, Date.UTC(2027, 0, 10, 12), ESSENTIAL), Math.floor(333000 * 0.95 / 31));
  assert.ok(10545 * 30 * 1.03 <= 333000, 'a 30-day period at the cap, with the counter 3% short, fits the plan');
});

test('while Flightradar24 holds back, OpenSky asks every 30 seconds', async () => {
  const w = await worker();
  const now = Date.UTC(2026, 10, 6, 16), day = '2026-11-06';
  const env = { ...EXPLORER, FR24_KEY: 'k', OSKY_FOCUS: '', OSKY_FOCUS_UNTIL: '' };
  let kv = fakeKv();
  assert.equal(await w.fr24Rationed(env, kv, now), false, 'a fresh day: FR24 answers');
  await kv.put('fr24:used:' + day, '1900');
  assert.equal(await w.fr24Rationed(env, kv, now), true, 'the day cap spent');
  kv = fakeKv();
  await kv.put('fr24:cool:' + day, String(now + 30 * 60000));
  assert.equal(await w.fr24Rationed(env, kv, now), true, 'paused (an empty pool, a rate limit)');
  kv = fakeKv();
  await kv.put('fr24:used:' + day, '1400');
  assert.equal(await w.fr24Rationed(env, kv, now), true, 'at the pace line (16:00 UTC: 1,346)');
  assert.equal(await w.fr24Rationed({ ...env, FR24_KEY: '' }, fakeKv(), now), false, 'no FR24 at all: unchanged');
  assert.equal(w.oskyRefreshS(env, now, true), 30);
  assert.equal(w.oskyRefreshS(env, now, false), 120);
});

test('/feeds/status shows refusals for an empty pool and the cap the month allows', async () => {
  const w = await worker();
  const kv = fakeKv();
  const now = Date.UTC(2026, 9, 20, 12), day = '2026-10-20';
  await kv.put('feeds:n:fr24:refused:' + day, '3');
  const s = await w.feedStatus({ FIDS_LIVE_FLIGHTS: kv, ...EXPLORER }, now);
  assert.equal(s.counts_utc_day[day].fr24.refused_no_credit, 3);
  assert.equal(s.counts_utc_day[day].fr24.daily_budget, 1838);
});
