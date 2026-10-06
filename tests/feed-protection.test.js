// ═══════════════════════════════════════════════════════════════════════════
// v23996 — FEED PROTECTION, THE WORKER HALF.
//
// 2026-10-04: Toronto Pearson's bot manager (Radware) answered this Worker with
// a 302 to its challenge page. /flights/yyz followed it, parsed the HTML to
// nothing and answered 200 {"list":[]}; every Toronto board read "NO FLIGHTS IN
// WINDOW" under LIVE, and nothing noticed. These tests hold the protection
// built for every airport's own feed:
//   1. every upstream answer is labelled ok / blocked / error, and a failed
//      feed is a 503 saying which — never an empty list; zero rows from a
//      valid answer stays OK (small airports are empty at night);
//   2. the last good answer is kept in KV for 3 hours and served marked stale;
//   3. one shared copy per airport and direction, asked every 3–5 minutes;
//   4. feed health is written only on a change of state, a feed blocked for
//      30 minutes docks itself (beside the admin's list, never in it), the dock
//      poll re-probes it at most every 10 minutes, and two good answers in a
//      row undock it.
// Nothing here reaches a network: fetch, the Cache API and KV are all fakes.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, {
  feedClassifyResponse, feedClassifyBody, feedJsonEmpty, feedVerdict, feedPartial, feedHealthNext, feedAutoDocked,
  feedBodyComplete, feedBackoffS,
  _feedResetMemory, FEED_LASTGOOD_MAX_MS, FEED_AUTODOCK_MS, FEED_PROBE_EVERY_MS, FEED_FAIL_CONFIRM_MS, FEED_FAIL_PREFIX
} from '../workers/fids-proxy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');
const MIN = 60000;

// ── fakes ──────────────────────────────────────────────────────────────────
function fakeKv(name, log) {
  const m = new Map();
  return {
    m,
    async get(k, o) {
      const e = m.get(k);
      if (!e) return null;
      if (e.exp && e.exp <= Date.now()) { m.delete(k); return null; }
      return (o === 'json' || (o && o.type === 'json')) ? JSON.parse(e.v) : e.v;
    },
    async put(k, v, o) {
      log.push({ ns: name, k, at: Date.now() });
      m.set(k, { v: String(v), exp: o && o.expirationTtl ? Date.now() + o.expirationTtl * 1000 : 0 });
    },
    async delete(k) { m.delete(k); },
    async list() { return { keys: [], list_complete: true }; }
  };
}
function makeEnv(manualDock) {
  const writes = [];
  const env = { FIDS_USERS: fakeKv('FIDS_USERS', writes), FIDS_LIVE_FLIGHTS: fakeKv('FIDS_LIVE_FLIGHTS', writes) };
  if (manualDock) env.FIDS_USERS.m.set('dry-dock', { v: JSON.stringify({ v: 1, docked: manualDock, updatedAt: 1, updatedBy: 'admin' }), exp: 0 });
  return { env, writes };
}
function makeCtx() {
  const waits = [];
  return { waits, waitUntil(p) { waits.push(Promise.resolve(p).catch(() => {})); }, async settle() { while (waits.length) await Promise.all(waits.splice(0)); } };
}
const RADWARE_HTML = '<!DOCTYPE html><html><head><title>Radware Bot Manager Captcha</title></head><body>'
  + '<script src="https://validate.perfdrive.com/captcha.js"></script><footer>rdwr</footer></body></html>';
function pearsonRow(i, type) {
  const t = new Date(Date.now() + i * 20 * MIN).toISOString().replace('Z', '+00:00');
  return { key: type + i, id: 'ACA' + (100 + i), id2: 'AC' + (100 + i), type, schTime: t, latestTm: t, gate: 'D' + (20 + i),
    status: 'ONT', term: 'T1', al: 'Air Canada', alCode: 'ACA', ids: [], routes: [{ code: 'YUL', name: 'Montréal', city: 'Montréal' }] };
}
// The upstream: Pearson in one of its moods, everything else refused.
function upstream(state) {
  const calls = [];
  const f = async (url, init) => {
    const u = new URL(String(url && url.url || url));
    calls.push(u.hostname + u.pathname + u.search);
    if (u.hostname === 'www.torontopearson.com') {
      const type = u.searchParams.get('type') || 'DEP';
      // A mood per direction and day (yyzMood), per day (yyzDay), or for every ask (yyz).
      const mood = (state.yyzMood && state.yyzMood(type, u.searchParams.get('day')))
        || (state.yyzDay && state.yyzDay[u.searchParams.get('day')]) || state.yyz;
      if (mood === 'radware') {
        return new Response('', { status: 302, headers: { Location: 'https://validate.perfdrive.com/x?ssk=support@shieldsquare.com' } });
      }
      if (mood === 'radware-followed') {
        const r = new Response(RADWARE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        Object.defineProperty(r, 'redirected', { value: true });
        Object.defineProperty(r, 'url', { value: 'https://validate.perfdrive.com/x' });
        return r;
      }
      if (mood === 'empty') return Response.json({ list: [] });
      if (mood === 'timeout') return new Response('gateway timeout', { status: 504 });
      // Tomorrow's rows are numbered apart from today's (ACA110…), so a list says which day it holds.
      const base = u.searchParams.get('day') === 'tomorrow' ? 10 : 0;
      return Response.json({ list: [0, 1, 2, 3].map((i) => pearsonRow(i + base, type)) });
    }
    // Deer Lake: the sub-page moved or refused; the home page carries both
    // tables, with no flights in them tonight.
    if (u.hostname === 'flyyyg.com') {
      if (u.pathname !== '/') return new Response('<html><body>Forbidden</body></html>', { status: state.yygPage === 'blocked' ? 403 : 404, headers: { 'Content-Type': 'text/html' } });
      return new Response('<html><body><table class="arrdeptables departing"><tr><th>Date</th></tr></table>'
        + '<table class="arrdeptables arriving"><tr><th>Date</th></tr></table></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    // Victoria: the first page read holds a nonce that has since died (the
    // ajax call answers WordPress's 403); a fresh read holds a live one, whose
    // board has no flights tonight.
    if (u.hostname === 'yyj.ca') {
      state.yyjPages = state.yyjPages || 0;
      if (u.pathname.startsWith('/en/flights-info/')) {
        const nonce = state.yyjPages++ === 0 ? 'dead' : 'fresh';
        return new Response(`<html><script>var flightsData = {"nonce":"${nonce}"}</script></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
      }
      const body = init && init.body ? String(init.body) : '';
      if (/nonce=dead/.test(body)) return new Response('-1', { status: 403, headers: { 'Content-Type': 'text/html' } });
      return Response.json({ success: true, data: { html: '<table class="flightsTable"><thead><tr><th>Flight</th></tr></thead><tbody></tbody></table>' } });
    }
    if (u.hostname === 'www.sydneyairport.com.au') {
      if (state.syd === 'challenge') {
        return new Response('<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cf-chl</body></html>',
          { status: 403, headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' } });
      }
      const fx = `syd-${u.searchParams.get('flightType')}-${u.searchParams.get('terminalType')}-today.json`;
      return new Response(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', fx), 'utf8'), { status: 200 });
    }
    throw new Error('test: no network for ' + u.hostname);
  };
  f.calls = calls;
  return f;
}
// One test's world: a clock it moves, a fetch, and a Cache API that works.
async function world(fn, start) {
  const saved = { fetch: globalThis.fetch, caches: globalThis.caches, now: Date.now };
  let now = start || Date.parse('2026-10-04T16:21:00Z');
  Date.now = () => now;
  const store = new Map();
  globalThis.caches = { default: {
    async match(req) { const e = store.get(req.url); return e && e.until > Date.now() ? new Response(e.body, { headers: e.h }) : undefined; },
    async put(req, res) {
      const m = (res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/);
      const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
      store.set(req.url, { body: await res.text(), h, until: Date.now() + (m ? +m[1] : 60) * 1000 });
    }
  } };
  _feedResetMemory();
  const W = {
    tick(ms) { now += ms; },
    get now() { return now; },
    colo() { _feedResetMemory(); store.clear(); },          // another data centre: no memo, no edge cache
    async get(env, ctx, p) { const r = await worker.fetch(new Request('https://fids-proxy.test' + p, { headers: { Origin: 'https://fids.orionconnected.com' } }), env, ctx); await ctx.settle(); return r; }
  };
  try { return await fn(W); } finally { globalThis.fetch = saved.fetch; globalThis.caches = saved.caches; Date.now = saved.now; _feedResetMemory(); }
}

// ── 1. labels ──────────────────────────────────────────────────────────────
test('an upstream answer is labelled by status, redirect and type: a challenge is "blocked", an outage "error"', () => {
  const R = (status, h, extra) => Object.assign(new Response(status >= 200 && status !== 204 && status !== 304 ? 'x' : null, { status, headers: h || {} }), {});
  assert.equal(feedClassifyResponse(R(302), 'json', 'https://www.torontopearson.com/api'), 'blocked', 'the 302 to the challenge page');
  assert.equal(feedClassifyResponse(R(403), 'json'), 'blocked');
  assert.equal(feedClassifyResponse(R(429), 'html'), 'blocked');
  assert.equal(feedClassifyResponse(R(503, { 'cf-mitigated': 'challenge' }), 'html'), 'blocked', "Cloudflare's own challenge");
  assert.equal(feedClassifyResponse(R(503), 'json'), 'error');
  assert.equal(feedClassifyResponse(R(504), 'html'), 'error');
  assert.equal(feedClassifyResponse(R(200, { 'Content-Type': 'application/json' }), 'json'), 'ok');
  assert.equal(feedClassifyResponse(R(200, { 'Content-Type': 'text/html' }), 'json'), 'blocked', 'HTML where JSON was asked for');
  assert.equal(feedClassifyResponse(R(200, { 'Content-Type': 'text/html' }), 'html'), 'ok', 'an HTML board is HTML');
  const hop = R(200, { 'Content-Type': 'text/html' });
  Object.defineProperty(hop, 'redirected', { value: true });
  Object.defineProperty(hop, 'url', { value: 'https://validate.perfdrive.com/x' });
  assert.equal(feedClassifyResponse(hop, 'html', 'https://www.torontopearson.com/api'), 'blocked', 'followed to another host');
  assert.equal(feedClassifyResponse(null), 'error');
});

test('a body that is not the feed: a challenge page or non-JSON is "blocked", a page that lost its shape is "error"', () => {
  assert.equal(feedClassifyBody(RADWARE_HTML, 'json'), 'blocked');
  assert.equal(feedClassifyBody(RADWARE_HTML, 'html'), 'blocked', 'the challenge words give it away on an HTML feed too');
  assert.equal(feedClassifyBody('<html><body>maintenance</body></html>', 'json'), 'blocked', 'HTML where JSON was asked for');
  assert.equal(feedClassifyBody('not json at all', 'json'), 'blocked', 'non-JSON where JSON was asked for');
  assert.equal(feedClassifyBody('{"data":null}', 'json'), 'error', 'JSON, but not the list');
  assert.equal(feedClassifyBody('<html><body><h1>Flights</h1></body></html>', 'html'), 'error', 'the page, without its rows');
  assert.equal(feedClassifyBody('<html>WP Remote Firewall — Blocked because of Malicious Activities</html>', 'json'), 'blocked', "Moncton's firewall page");
});

test('what a fetch means: rows are OK, zero rows from a valid answer are OK, nothing with no evidence is an error', () => {
  assert.equal(feedVerdict(5, [], null), 'ok');
  // v23998 — half a feed is NOT the feed: a part refused fails the whole answer
  // (Chicago's "Today" challenged while "Tomorrow" answered was served live).
  assert.equal(feedVerdict(3, [{ state: 'ok' }, { state: 'blocked' }], null), 'blocked', 'half a feed is not the feed');
  assert.equal(feedVerdict(3, [{ state: 'ok' }, { state: 'error' }], null), 'error', 'nor is a feed with a page lost');
  assert.equal(feedVerdict(3, [{ state: 'blocked', superseded: true }, { state: 'ok' }], null), 'ok', 'a failure a later step answered');
  assert.equal(feedVerdict(3, [{ state: 'ok' }, { state: 'error', notFeed: true, superseded: true }], null), 'ok', 'the page past the end of a list');
  assert.equal(feedVerdict(0, [{ state: 'ok' }], null), 'ok', 'an empty night is not a block');
  assert.equal(feedVerdict(0, [{ state: 'blocked' }], null), 'blocked', 'the Toronto case: an empty list made of a challenge page');
  assert.equal(feedVerdict(null, [{ state: 'ok' }], null), 'ok');
  assert.equal(feedVerdict(null, [{ state: 'ok' }, { state: 'error' }], null), 'error');
  assert.equal(feedVerdict(null, [], null), 'error', 'no answer and no evidence it worked');
  assert.equal(feedVerdict(null, [], new Error('x')), 'error');
  // A failure a later step of the same fetch answered (a fallback page, a fresh nonce) is not evidence.
  assert.equal(feedVerdict(null, [{ state: 'blocked', superseded: true }, { state: 'ok' }], null), 'ok',
    'Victoria on a quiet night: a dead nonce, then a fresh one, then nothing to show');
  assert.equal(feedVerdict(0, [{ state: 'error', superseded: true }, { state: 'ok' }], null), 'ok');
  assert.equal(feedVerdict(null, [{ state: 'blocked', superseded: true }, { state: 'blocked' }], null), 'blocked',
    'only the answered failure stops counting');
});

// v24002 — the partial-answer rule, as decided: when today answered and only a
// LATER day (tomorrow, asked through feedLaterDay, its notes marked `later`)
// failed — an outage or a refusal by a bot manager alike — today's fresh rows
// are live. Everything else keeps the v23998 rule.
test('a later day that failed or was refused leaves today live; a failed or refused today, page or slice of today, or yesterday still fails', () => {
  const T = { state: 'ok' }, TOMORROW_OK = { state: 'ok', later: true };
  const TOMORROW_ERR = { state: 'error', later: true }, TOMORROW_BLOCKED = { state: 'blocked', later: true };
  // today ok + tomorrow failed → live with today's rows
  assert.equal(feedVerdict(40, [T, TOMORROW_ERR], null), 'ok', "today answered, tomorrow a 500: today's rows are live");
  assert.equal(feedVerdict(40, [T, T, T, TOMORROW_OK, TOMORROW_ERR], null), 'ok', "today's three pages, tomorrow's second page lost");
  assert.equal(feedPartial([T, TOMORROW_ERR]), true, 'and it is marked partial');
  assert.equal(feedPartial([T, TOMORROW_OK]), false, 'a whole answer is not');
  assert.equal(feedPartial([T, { state: 'error', later: true, superseded: true }]), false, 'nor one whose later failure was answered');
  // …but only with rows from today: nothing fresh to show is no live answer.
  assert.equal(feedVerdict(0, [T, TOMORROW_ERR], null), 'error', 'an empty today beside a failed tomorrow is not a quiet night');
  assert.equal(feedVerdict(null, [T, TOMORROW_ERR], null), 'error', 'nor is a today that produced nothing');
  // today failed + tomorrow ok → still fails (the Chicago case)
  assert.equal(feedVerdict(40, [{ state: 'error' }, TOMORROW_OK], null), 'error', 'Chicago: tomorrow alone is not the board');
  assert.equal(feedVerdict(40, [{ state: 'blocked' }, TOMORROW_OK], null), 'blocked', 'Chicago as it happened: "Today" behind a challenge');
  // a failed page (or slice) of today → fails
  assert.equal(feedVerdict(40, [T, { state: 'error' }, TOMORROW_OK], null), 'error', "today's second page lost");
  assert.equal(feedVerdict(40, [T, { state: 'error' }, TOMORROW_ERR], null), 'error', 'a lost page of today is not forgiven by tomorrow failing too');
  // yesterday is not a later day: its failure still fails the answer
  assert.equal(feedVerdict(40, [{ state: 'error' }, T], null), 'error', "yesterday's file lost");
  // today ok + tomorrow REFUSED (a challenge page, a 403, a 429) → live with today's rows, like an outage
  assert.equal(feedVerdict(40, [T, TOMORROW_BLOCKED], null), 'ok', "tomorrow behind a challenge page: today's rows are live");
  assert.equal(feedVerdict(40, [T, TOMORROW_ERR, TOMORROW_BLOCKED], null), 'ok', 'one later page lost, the next refused');
  assert.equal(feedVerdict(40, [T, T, TOMORROW_OK, TOMORROW_BLOCKED], null), 'ok', "today's two pages, tomorrow's second refused");
  assert.equal(feedPartial([T, TOMORROW_BLOCKED]), true, 'and it is marked partial');
  // …but only with rows from today; with none, the later day's refusal is the answer's
  assert.equal(feedVerdict(0, [T, TOMORROW_BLOCKED], null), 'blocked', 'an empty today beside a refused tomorrow');
  assert.equal(feedVerdict(null, [T, TOMORROW_ERR, TOMORROW_BLOCKED], null), 'blocked');
  // a refusal of today, of a page or slice of today, or of yesterday → blocked, whatever tomorrow did
  assert.equal(feedVerdict(40, [{ state: 'blocked' }, TOMORROW_BLOCKED], null), 'blocked', 'today and tomorrow refused');
  assert.equal(feedVerdict(40, [T, { state: 'blocked' }, TOMORROW_OK], null), 'blocked', "today's second page refused");
  assert.equal(feedVerdict(40, [T, { state: 'blocked' }, TOMORROW_BLOCKED], null), 'blocked', "today's domestic slice refused, tomorrow too");
  assert.equal(feedVerdict(40, [{ state: 'blocked' }, T, TOMORROW_OK], null), 'blocked', "yesterday's file refused");
  // a producer that threw fails the answer, whatever the notes say
  assert.equal(feedVerdict(40, [T, TOMORROW_ERR], new Error('x')), 'error');
});

// When today FAILED, the kind of failure is as it was before v24002: a refusal
// anywhere in the answer, a later day's included, makes it "blocked" — what
// the health and the 30-minute dock count. Salt Lake City, Zurich and Fort
// McMurray still ask tomorrow after today failed, so this happens for real.
test('a failed today keeps its kind as before: a refusal anywhere, tomorrow included, makes the failure "blocked"', () => {
  const T = { state: 'ok' }, TOMORROW_OK = { state: 'ok', later: true };
  const TOMORROW_ERR = { state: 'error', later: true }, TOMORROW_BLOCKED = { state: 'blocked', later: true };
  assert.equal(feedVerdict(5, [{ state: 'error' }, TOMORROW_BLOCKED], null), 'blocked', 'today a 5xx, tomorrow refused: blocked, as under v23998');
  assert.equal(feedVerdict(40, [T, { state: 'error' }, TOMORROW_BLOCKED], null), 'blocked', "today's second page lost, tomorrow refused");
  assert.equal(feedVerdict(40, [{ state: 'error' }, T, TOMORROW_BLOCKED], null), 'blocked', "yesterday's file lost, tomorrow refused");
  assert.equal(feedVerdict(40, [T, TOMORROW_BLOCKED], new Error('x')), 'blocked', 'a producer that threw beside a refusal');
  // …and without a refusal anywhere, still "error"
  assert.equal(feedVerdict(5, [{ state: 'error' }, TOMORROW_ERR], null), 'error');
  assert.equal(feedVerdict(5, [{ state: 'error' }, TOMORROW_OK], null), 'error');
  assert.equal(feedVerdict(5, [T, TOMORROW_ERR], new Error('x')), 'error');
  // the later day is forgiven only when today answered: it never softens today's failure
  assert.equal(feedVerdict(40, [T, TOMORROW_BLOCKED], null), 'ok');
});

test('what a partial answer left out: the later day, when it begins, and whether it was refused', async () => {
  const { feedPartialInfo, feedDayStartMs } = await import('../workers/fids-proxy.js');
  const from = Date.parse('2026-10-06T00:00:00-04:00');
  const T = { state: 'ok' };
  assert.equal(feedPartialInfo([T, { state: 'ok', later: true, day: '2026-10-06', from }]), null, 'nothing left out');
  assert.deepEqual(feedPartialInfo([T, { state: 'error', later: true, day: '2026-10-06', from }]), { day: '2026-10-06', from, failure: 'error' });
  assert.deepEqual(feedPartialInfo([T, { state: 'error', later: true, day: '2026-10-06', from }, { state: 'blocked', later: true, day: '2026-10-06', from }]),
    { day: '2026-10-06', from, failure: 'blocked' }, 'a refusal anywhere in the day makes it a refused day');
  assert.equal(feedPartialInfo([T, { state: 'blocked', later: true, superseded: true }]), null, 'a refusal a later step answered');
  // The instant a day begins is the airport's own midnight, daylight time and all.
  assert.equal(feedDayStartMs('America/Chicago', '2026-09-04'), Date.parse('2026-09-04T05:00:00Z'));
  assert.equal(feedDayStartMs('America/Chicago', '2026-11-01'), Date.parse('2026-11-01T05:00:00Z'), 'the day the clocks go back begins in daylight time');
  assert.equal(feedDayStartMs('America/Chicago', '2026-11-02'), Date.parse('2026-11-02T06:00:00Z'));
  assert.equal(feedDayStartMs('Australia/Sydney', '2026-09-16'), Date.parse('2026-09-15T14:00:00Z'));
  assert.equal(feedDayStartMs('America/St_Johns', '2026-10-06'), Date.parse('2026-10-06T02:30:00Z'), 'a half-hour zone');
  assert.equal(feedDayStartMs('America/Chicago', 'tomorrow'), null);
});

test('feedLaterDay marks every answer inside it as a later day and says whether the day came back whole', async () => {
  const { feedLaterDay, feedLocalDay } = await import('../workers/fids-proxy.js');
  // Without a guard around it: nothing is recorded anywhere, and `whole` still tells.
  const okDay = await feedLaterDay(async () => 'rows');
  assert.deepEqual(okDay, { value: 'rows', whole: true });
  const threw = await feedLaterDay(async () => { throw new Error('network'); });
  assert.deepEqual(threw, { value: null, whole: false }, 'a throw is a failed day');
  // With its day named, the same (each mark then carries the day: the health and /fararr tests read them).
  assert.deepEqual(await feedLaterDay(async () => { throw new Error('network'); }, 'America/Toronto', '2026-10-06'), { value: null, whole: false });
  assert.equal(feedLocalDay('America/Chicago', Date.parse('2026-09-05T04:30:00Z')), '2026-09-04', "Chicago's calendar, not UTC's");
  assert.equal(feedLocalDay('Australia/Sydney', Date.parse('2026-09-14T23:00:00Z'), 1), '2026-09-16');
  assert.equal(feedLocalDay('Europe/Zurich', Date.parse('2026-12-31T23:30:00Z'), 1), '2027-01-02', 'already the new year in Zürich');
});

// ── 2. honest failure and last-good ─────────────────────────────────────────
test('a Radware 302 is a 503 "blocked", never 200 with an empty list — followed or not', async () => {
  await world(async (W) => {
    for (const mood of ['radware', 'radware-followed']) {
      W.colo();
      const { env } = makeEnv();
      globalThis.fetch = upstream({ yyz: mood });
      const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
      assert.equal(r.status, 503, mood);
      const j = await r.json();
      assert.equal(j.error, 'blocked', mood);
      assert.ok(!('list' in j), 'no list at all, so nothing can read it as "no flights"');
      assert.equal(r.headers.get('X-Feed-State'), 'blocked');
      assert.match(r.headers.get('Access-Control-Expose-Headers') || '', /X-Feed-State/, 'the board, on another origin, can read it');
      assert.equal(r.headers.get('Cache-Control'), 'no-store', 'a failure is never cached by a browser');
    }
  });
});

test('a good answer is kept; when the feed is blocked later, it is served marked stale with its age — for three hours, not longer', async () => {
  await world(async (W) => {
    const { env } = makeEnv();
    const up = { yyz: 'ok' };
    globalThis.fetch = upstream(up);
    const r1 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('X-Feed-State'), 'live');
    const good = (await r1.json()).list;
    assert.equal(good.length, 8, 'today and tomorrow, merged as before');
    assert.ok(env.FIDS_LIVE_FLIGHTS.m.has('fg:v1:YYZ:list:dep'), 'the shared copy is in KV');

    up.yyz = 'radware';
    W.tick(6 * MIN); W.colo();
    const r2 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get('X-Feed-State'), 'stale');
    assert.equal(r2.headers.get('X-Feed-Stale'), '1');
    assert.equal(r2.headers.get('X-Feed-Age'), '360');
    assert.equal(r2.headers.get('Cache-Control'), 'no-store');
    const j2 = await r2.json();
    assert.deepEqual(j2.list, good, 'the last good rows, unchanged');
    assert.equal(j2._feed.state, 'stale');
    assert.equal(j2._feed.failure, 'blocked');
    assert.equal(Date.parse(j2._feed.asOf), W.now - 6 * MIN);

    W.tick(FEED_LASTGOOD_MAX_MS - 6 * MIN + MIN); W.colo();
    const r3 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r3.status, 503, 'three hours on, the copy is too old to show');
    assert.equal((await r3.json()).error, 'blocked');
  });
});

test('zero rows from a valid answer is OK: 200, live, and no health entry however long it lasts', async () => {
  await world(async (W) => {
    const { env, writes } = makeEnv();
    globalThis.fetch = upstream({ yyz: 'empty' });
    for (let i = 0; i < 8; i++) {
      const r = await W.get(env, makeCtx(), '/flights/yyz?direction=arr');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('X-Feed-State'), 'live');
      assert.deepEqual((await r.json()).list, []);
      W.tick(6 * MIN); W.colo();
    }
    assert.ok(!writes.some((w) => w.k === 'feed-health'), 'an empty night is not an outage');
  });
});

test('a timeout is "error", not "blocked"', async () => {
  await world(async (W) => {
    const { env } = makeEnv();
    globalThis.fetch = upstream({ yyz: 'timeout' });
    const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'error');
  });
});

test('a registry airport behind a challenge: 503 "blocked", then its last good list marked stale — never the dead provider', async () => {
  await world(async (W) => {
    const { env } = makeEnv();
    const up = { syd: 'challenge' };
    const f = upstream(up);
    globalThis.fetch = f;
    const win = '/flights/airports/iata/SYD/2026-09-15T07:00/2026-09-15T19:00?direction=Departure&withLeg=true';
    const r0 = await W.get(env, makeCtx(), win);
    assert.equal(r0.status, 503);
    const j0 = await r0.json();
    assert.equal(j0.error, 'blocked');
    assert.ok(!f.calls.some((c) => /rapidapi|aerodatabox/.test(c)), 'no fall-through to the disconnected provider');

    up.syd = 'ok'; W.tick(3 * MIN); W.colo();
    const r1 = await W.get(env, makeCtx(), win);
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('X-Feed-Source'), 'syd-authority');
    assert.equal(r1.headers.get('X-Feed-State'), 'live');
    const dep = (await r1.json()).departures;
    assert.ok(dep.length > 10, 'the window has Sydney\'s rows');

    up.syd = 'challenge'; W.tick(4 * MIN); W.colo();
    const r2 = await W.get(env, makeCtx(), win);
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get('X-Feed-State'), 'stale');
    const j2 = await r2.json();
    assert.deepEqual(j2.departures.map((f) => f.number), dep.map((f) => f.number));
    assert.equal(j2._feed.failure, 'blocked');
  }, Date.parse('2026-09-15T09:00:00+10:00'));
});

// ── 3. backoff ─────────────────────────────────────────────────────────────
test('backoff: inside the share window no other colo asks the airport, and the shared copy is written once', async () => {
  await world(async (W) => {
    const { env, writes } = makeEnv();
    const f = upstream({ yyz: 'ok' });
    globalThis.fetch = f;
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    const asked = f.calls.length;
    assert.equal(asked, 2, 'today and tomorrow');
    // Thirty requests over four minutes, from several colos: Pearson is not asked again.
    for (let i = 0; i < 30; i++) {
      if (i % 5 === 0) W.colo();
      W.tick(8000);
      const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('X-Feed-State'), 'live');
    }
    assert.equal(f.calls.length, asked, 'Pearson asked once in the window, not every 30 s by every colo');
    assert.equal(writes.filter((w) => w.k === 'fg:v1:YYZ:list:dep').length, 1, 'one KV write for the window');
    // Past Pearson's five minutes, one colo asks again.
    W.tick(2 * MIN); W.colo();
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(f.calls.length, asked + 2);
    assert.equal(writes.filter((w) => w.k === 'fg:v1:YYZ:list:dep').length, 2);
  });
});

test('the share interval follows each feed: three minutes by default, five for the slow ones; Moncton keeps its fast path', () => {
  assert.match(WORKER_SRC, /const FEED_SHARE_DEFAULT_S = 180;/);
  assert.match(WORKER_SRC, /const FEED_SHARE_S = \{ YYZ: 300, YDF: 300, YMM: 300 \};/);
  assert.match(WORKER_SRC, /const FEED_FAST = \{ YQM: true \};/);
  // The fast path is asked on every request: the guard neither memoises nor serves the shared copy for it.
  const g = WORKER_SRC.slice(WORKER_SRC.indexOf('async function feedGuard('), WORKER_SRC.indexOf('__name(feedGuard'));
  assert.match(g, /if \(!opts\.force && !fast\) \{\n\s*const m = _feedMemoGet/);
  assert.match(g, /if \(doc && !opts\.force && !fast && now - doc\.at < shareS \* 1000\)/);
});

// ── 4. health, auto-dock, auto-undock ───────────────────────────────────────
test('feed health: written only on a change, one refused request costs nothing, error never downgrades blocked', () => {
  const t = 1e12;
  assert.equal(feedHealthNext(null, 'ok', t), undefined, 'a healthy feed answering is not news');
  assert.equal(feedHealthNext(null, 'blocked', t, { since: t }), undefined, 'the first refusal is not written');
  assert.equal(feedHealthNext(null, 'blocked', t + FEED_FAIL_CONFIRM_MS - 1, { since: t }), undefined);
  assert.deepEqual(feedHealthNext(null, 'blocked', t + FEED_FAIL_CONFIRM_MS, { since: t }),
    { state: 'blocked', since: t, oks: 0, okAt: null }, 'persisting, it is written once, dated from its start');
  const cur = { state: 'blocked', since: t, oks: 0, okAt: null };
  assert.equal(feedHealthNext(cur, 'blocked', t + 20 * MIN, { since: t }), undefined, 'still blocked: nothing to write');
  assert.equal(feedHealthNext(cur, 'error', t + 20 * MIN, { since: t }), undefined, 'a timeout inside a block is still the block');
  const err = { state: 'error', since: t, oks: 0, okAt: null };
  assert.deepEqual(feedHealthNext(err, 'blocked', t + 5 * MIN), { state: 'blocked', since: t + 5 * MIN, oks: 0, okAt: null });
  const one = feedHealthNext(cur, 'ok', t + 40 * MIN);
  assert.deepEqual(one, { state: 'blocked', since: t, oks: 1, okAt: t + 40 * MIN }, 'one good answer is counted, not believed');
  assert.equal(feedHealthNext(one, 'ok', t + 40 * MIN + 30000), undefined, 'two screens asking at once are not two in a row');
  assert.equal(feedHealthNext(one, 'ok', t + 51 * MIN), null, 'two good answers in a row: healthy, the entry goes');
  assert.deepEqual(feedHealthNext(one, 'blocked', t + 45 * MIN), { state: 'blocked', since: t, oks: 0, okAt: null }, 'a refusal breaks the streak');
  assert.equal(feedHealthNext(cur, 'blocked', t + 50 * MIN, { since: t }), undefined,
    'a dock probe that finds it still blocked writes nothing: the probe keeps its own time');
  assert.equal(feedHealthNext(one, 'ok', t + 40 * MIN + 30000, { since: t }), undefined);
});

test('auto-dock: blocked for 30 minutes or more; an error never; Moncton never automatically', () => {
  const now = 1e12;
  const doc = { feeds: {
    YYZ: { state: 'blocked', since: now - FEED_AUTODOCK_MS },
    YOW: { state: 'blocked', since: now - FEED_AUTODOCK_MS + MIN },
    PHL: { state: 'error', since: now - 5 * 3600e3 },
    YQM: { state: 'blocked', since: now - 5 * 3600e3 }
  } };
  const r = feedAutoDocked(doc, now);
  assert.deepEqual(r.auto, ['YYZ']);
  assert.deepEqual(Object.keys(r.watch).sort(), ['PHL', 'YOW', 'YQM']);
  assert.ok(r.watch.YQM.noAuto, 'its health is shown, with the reason it stays on air');
  assert.equal(r.autoInfo.YYZ.state, 'blocked');
  assert.deepEqual(feedAutoDocked(null, now).auto, []);
});

test('blocked for 30 minutes docks itself beside the manual list; the poll re-probes every 10 minutes; two good probes undock it', async () => {
  await world(async (W) => {
    const { env, writes } = makeEnv(['SYD']);
    const up = { yyz: 'radware' };
    const f = upstream(up);
    globalThis.fetch = f;
    const t0 = W.now;
    // A Toronto board keeps asking, every two minutes, for 32 minutes.
    for (let m = 0; m <= 32; m += 2) {
      const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
      assert.equal(r.status, 503);
      W.tick(2 * MIN);
    }
    const health = writes.filter((w) => w.k === 'feed-health');
    assert.equal(health.length, 1, 'feed health written once, when the state changed');
    assert.equal(JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds.YYZ.since, t0, 'dated from the first refusal');

    const asked = f.calls.length;
    const d1 = await (await W.get(env, makeCtx(), '/api/dry-dock?_oc=1')).json();
    assert.deepEqual(d1.docked, ['SYD'], "the admin's list, as the admin left it");
    assert.deepEqual(d1.auto, ['YYZ']);
    assert.equal(Date.parse(d1.autoInfo.YYZ.since), t0);
    assert.ok(!writes.some((w) => w.k === 'dry-dock'), 'automation never writes the manual dock');
    assert.equal(f.calls.length, asked + 1, 'the poll re-probed Toronto (today, refused, and so not tomorrow)');

    // Boards poll the dock every minute; the probe waits its ten.
    for (let i = 0; i < 5; i++) { W.tick(MIN); await W.get(env, makeCtx(), '/api/dry-dock?_oc=2'); }
    W.colo();
    await W.get(env, makeCtx(), '/api/dry-dock?_oc=3');
    assert.equal(f.calls.length, asked + 1, 'not before ten minutes, from any colo');

    // Pearson lets us back in. One good probe is counted; it stays docked.
    up.yyz = 'ok';
    W.tick(FEED_PROBE_EVERY_MS);
    const d2 = await (await W.get(env, makeCtx(), '/api/dry-dock?_oc=4')).json();
    assert.deepEqual(d2.auto, ['YYZ'], 'docked still: the answer was taken after the list was read');
    const d3 = await (await W.get(env, makeCtx(), '/api/dry-dock?_oc=5')).json();
    assert.deepEqual(d3.auto, ['YYZ'], 'one good answer is not two');
    assert.equal(JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds.YYZ.oks, 1);
    // The second good probe, ten minutes on, undocks it.
    W.tick(FEED_PROBE_EVERY_MS);
    await W.get(env, makeCtx(), '/api/dry-dock?_oc=6');
    const d4 = await (await W.get(env, makeCtx(), '/api/dry-dock?_oc=7')).json();
    assert.deepEqual(d4.auto, []);
    assert.deepEqual(d4.docked, ['SYD']);
    assert.ok(!('YYZ' in JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds), 'healthy again');
    assert.ok(!writes.some((w) => w.k === 'dry-dock'), 'and the manual dock was never touched');
  });
});

test('one refused request among good ones writes nothing to feed health', async () => {
  await world(async (W) => {
    const { env, writes } = makeEnv();
    const up = { yyz: 'ok' };
    globalThis.fetch = upstream(up);
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    up.yyz = 'radware'; W.tick(6 * MIN); W.colo();
    assert.equal((await W.get(env, makeCtx(), '/flights/yyz?direction=dep')).headers.get('X-Feed-State'), 'stale');
    up.yyz = 'ok'; W.tick(2 * MIN); W.colo();
    assert.equal((await W.get(env, makeCtx(), '/flights/yyz?direction=dep')).headers.get('X-Feed-State'), 'live');
    W.tick(10 * MIN); W.colo();
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.ok(!writes.some((w) => w.k === 'feed-health'), 'a blip is not a state');
  });
});

test('the protection is wired into every own-feed route and the registry, and no cron was added', () => {
  for (const [route, code] of [['/flights/yyz', 'YYZ'], ['/flights/yul', 'YUL'], ['/flights/yhu', 'YHU'], ['/flights/ytz', 'YTZ'], ['/flights/mco', 'MCO']]) {
    const at = WORKER_SRC.indexOf(`if (path === "${route}") {`);
    assert.ok(at > 0, route);
    assert.match(WORKER_SRC.slice(at, at + 400), new RegExp(`serveGuardedList\\(env, ctx, origin, "${code}"`), route + ' is guarded');
  }
  assert.match(WORKER_SRC, /return serveGuardedList\(env, ctx, origin, ap, direction, "panynj"\);/);
  const win = WORKER_SRC.slice(WORKER_SRC.indexOf('async function maybeServeAuthorityWindow('), WORKER_SRC.indexOf('__name(maybeServeAuthorityWindow'));
  assert.match(win, /const g = await feedGuard\(env, ctx, code, dir, "win", \(\) => h\.list\(dir, env\)\);/);
  assert.match(win, /if \(!g\.payload\) return feedDownResponse\(code, g, origin\);/, 'a failed registry feed no longer falls through');
  assert.match(WORKER_SRC, /const g = await feedGuard\(env, ctx, "YHZ", kind, "win"/);
  // provider-ban: no scheduled trigger came back with this.
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'workers', 'wrangler.fids-proxy.jsonc'), 'utf8'), /"crons"/);
});

// ── 5. what the first review of this branch found ────────────────────────────
// Two isolates (two copies of the module, as two Workers isolates are) share
// one KV. A sees a Radware 302 at 5 minutes; B keeps Toronto fresh every five
// minutes while A only ever serves B's shared copy; A sees a second 302 at 40.
// Two blips half an hour apart, with good answers between, are not an outage.
test('two blips half an hour apart, with good answers between from another isolate, are not an outage: nothing written, nothing docked', async () => {
  const A = await import(new URL('../workers/fids-proxy.js?iso=blipA', import.meta.url).href);
  const B = await import(new URL('../workers/fids-proxy.js?iso=blipB', import.meta.url).href);
  await world(async (W) => {
    const { env, writes } = makeEnv();
    const up = { yyz: 'ok' };
    globalThis.fetch = upstream(up);
    const t0 = W.now;
    const at = (min) => { W.tick(t0 + min * MIN - W.now); };
    const ask = async (mod, p) => { const c = makeCtx(); const r = await mod.default.fetch(new Request('https://fids-proxy.test' + p), env, c); await c.settle(); return r; };
    assert.equal((await ask(A, '/flights/yyz?direction=dep')).status, 200);
    at(5); up.yyz = 'radware';
    assert.equal((await ask(A, '/flights/yyz?direction=dep')).headers.get('X-Feed-State'), 'stale', 'the first blip');
    up.yyz = 'ok';
    for (let m = 5; m < 40; m++) {
      at(m + 1 / 60);
      assert.equal((await ask(B, '/flights/yyz?direction=dep')).headers.get('X-Feed-State'), 'live');
      const ra = await ask(A, '/flights/yyz?direction=dep');
      assert.equal(ra.status, 200);
    }
    at(40.5); up.yyz = 'radware';
    assert.equal((await ask(A, '/flights/yyz?direction=dep')).headers.get('X-Feed-State'), 'stale',
      'the second blip: A is the first to find the shared copy past its five minutes');
    up.yyz = 'ok';
    assert.ok(!writes.some((w) => w.k === 'feed-health'), 'no outage was written');
    const dd = await (await ask(B, '/api/dry-dock')).json();
    assert.deepEqual(dd.auto, [], 'and Toronto stays on the air');
  });
});

test('a run of failures is one outage only while unbroken: after a long silence the clock starts again', async () => {
  await world(async (W) => {
    const { env, writes } = makeEnv();
    globalThis.fetch = upstream({ yyz: 'radware' });
    const t0 = W.now;
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');          // a blip at 0
    W.tick(20 * MIN);                                                    // nobody asks for 20 minutes
    for (let m = 20; m <= 26; m += 2) {
      await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
      W.tick(2 * MIN);
    }
    const h = writes.filter((w) => w.k === 'feed-health');
    assert.equal(h.length, 1, 'written once, three minutes into the unbroken run');
    assert.equal(JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds.YYZ.since, t0 + 20 * MIN,
      'dated from the start of this run, not from the blip twenty minutes before it');
  });
});

test('a real outage seen by two isolates still docks itself after 30 minutes', async () => {
  const A = await import(new URL('../workers/fids-proxy.js?iso=outA', import.meta.url).href);
  const B = await import(new URL('../workers/fids-proxy.js?iso=outB', import.meta.url).href);
  await world(async (W) => {
    const { env } = makeEnv();
    globalThis.fetch = upstream({ yyz: 'radware' });
    const ask = async (mod, p) => { const c = makeCtx(); const r = await mod.default.fetch(new Request('https://fids-proxy.test' + p), env, c); await c.settle(); return r; };
    const t0 = W.now;
    for (let m = 0; m <= 32; m += 1) {
      await ask(m % 2 ? A : B, '/flights/yyz?direction=dep');
      W.tick(MIN);
    }
    const dd = await (await ask(A, '/api/dry-dock')).json();
    assert.deepEqual(dd.auto, ['YYZ']);
    assert.equal(Date.parse(dd.autoInfo.YYZ.since), t0, 'dated from the first refusal');
  });
});

// A board asks for its airport every five minutes (fids-core.js fetchLive), and
// an airport with one screen on it may be asked by nobody else. Its polls can
// land in different isolates. A run that a five-minute silence broke would
// never reach the three-minute confirmation in either isolate, and the
// airport would never dock itself.
test('one board polling every five minutes, its polls landing in two isolates in turn, still docks the airport at 30 minutes', async () => {
  const A = await import(new URL('../workers/fids-proxy.js?iso=pollA', import.meta.url).href);
  const B = await import(new URL('../workers/fids-proxy.js?iso=pollB', import.meta.url).href);
  await world(async (W) => {
    const { env, writes } = makeEnv();
    globalThis.fetch = upstream({ yyz: 'radware' });
    const ask = async (mod, p) => { const c = makeCtx(); const r = await mod.default.fetch(new Request('https://fids-proxy.test' + p), env, c); await c.settle(); return r; };
    const t0 = W.now;
    for (let m = 0, i = 0; m <= 35; m += 5, i++) {
      const iso = i % 2 ? B : A;
      assert.equal((await ask(iso, '/flights/yyz?direction=dep')).status, 503);
      assert.equal((await ask(iso, '/flights/yyz?direction=arr')).status, 503);
      W.tick(5 * MIN + 400);   // a poll is never exactly five minutes after the last
    }
    assert.equal(writes.filter((w) => w.k === 'feed-health').length, 1, 'written once');
    const dd = await (await ask(A, '/api/dry-dock')).json();
    assert.deepEqual(dd.auto, ['YYZ'], 'docked itself');
    assert.equal(Date.parse(dd.autoInfo.YYZ.since), t0, 'dated from the first refusal');
  });
});

test('while docked, the probes keep their own time: the health document changes only when the airport does', async () => {
  await world(async (W) => {
    const { env, writes } = makeEnv();
    const up = { yyz: 'radware' };
    const f = upstream(up);
    globalThis.fetch = f;
    for (let m = 0; m <= 32; m += 2) { await W.get(env, makeCtx(), '/flights/yyz?direction=dep'); W.tick(2 * MIN); }
    const health = () => writes.filter((w) => w.k === 'feed-health').length;
    assert.equal(health(), 1);
    // An hour docked: a probe every ten minutes, each still refused.
    for (let i = 0; i < 60; i++) {
      if (i % 7 === 0) W.colo();
      await W.get(env, makeCtx(), '/api/dry-dock');
      W.tick(MIN);
    }
    const probes = writes.filter((w) => w.k === 'fp:v1:YYZ').length;
    assert.ok(probes >= 5 && probes <= 7, `about six probes in the hour, from any colo (${probes})`);
    assert.equal(health(), 1, 'a refused probe changes nothing, so nothing is written');
    assert.ok(!('probeAt' in JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds.YYZ), 'no probe time in the shared document');
    // Back: one good probe counted (one write), the second undocks (one write).
    up.yyz = 'ok';
    for (let i = 0; i < 25; i++) { await W.get(env, makeCtx(), '/api/dry-dock'); W.tick(MIN); }
    assert.equal(health(), 3);
    assert.ok(!('YYZ' in JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds));
  });
});

test('Toronto: today refused and tomorrow answered is not a live list of tomorrow only — but today answered and tomorrow refused by the bot manager is today, live', async () => {
  await world(async (W) => {
    const { env, writes } = makeEnv();
    const up = { yyz: 'ok' };
    globalThis.fetch = upstream(up);
    const good = (await (await W.get(env, makeCtx(), '/flights/yyz?direction=dep')).json()).list;
    up.yyzDay = { today: 'radware', tomorrow: 'ok' };
    W.tick(6 * MIN); W.colo();
    const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r.headers.get('X-Feed-State'), 'stale', 'the last good list, marked, instead');
    const b1 = await r.json();
    assert.equal(b1._feed.failure, 'blocked', 'a refused today is a block');
    assert.deepEqual(b1.list, good);
    // v24002 — the rule covers a REFUSED tomorrow too: today answered whole,
    // so today's rows are live; tomorrow behind the challenge is left out.
    up.yyzDay = { today: 'ok', tomorrow: 'radware' };
    W.tick(6 * MIN); W.colo();
    const before = writes.length;
    const r2 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get('X-Feed-State'), 'live', "today's rows are fresh: live");
    assert.equal(r2.headers.get('X-Feed-Partial'), 'later-day');
    const b2 = await r2.json();
    assert.equal(b2._feed.state, 'live');
    assert.equal(b2._feed.failure, null, 'not a failure');
    assert.deepEqual(b2.list.map((x) => x.id), good.slice(0, 4).map((x) => x.id), "today's four rows, none of tomorrow's");
    assert.ok(!writes.slice(before).some((w) => w.k.startsWith(FEED_FAIL_PREFIX)), 'no backoff: today is asked as usual');
    assert.equal(JSON.parse(env.FIDS_LIVE_FLIGHTS.m.get('fg:v1:YYZ:list:dep').v).pt, 1, 'the shared copy is today, marked partial');
    up.yyzDay = null;
    W.tick(6 * MIN); W.colo();
    const r3 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r3.headers.get('X-Feed-State'), 'live', 'both days answered: live again');
  });
});

// v24002 — the rule: if only tomorrow's part of a feed fails, keep showing
// today's fresh flights, live.
test("Toronto: today answered and tomorrow failed — today's fresh rows are live, the shared copy is today's, and nothing is counted as a failure", async () => {
  await world(async (W) => {
    const { env, writes } = makeEnv();
    const up = { yyz: 'ok' };
    globalThis.fetch = upstream(up);
    const ids = (j) => j.list.map((r) => r.id);
    const r1 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    const good = ids(await r1.json());
    assert.deepEqual(good, ['ACA100', 'ACA101', 'ACA102', 'ACA103', 'ACA110', 'ACA111', 'ACA112', 'ACA113'], 'today, then tomorrow');
    assert.equal(r1.headers.get('X-Feed-Partial'), null);
    up.yyzDay = { today: 'ok', tomorrow: 'timeout' };
    W.tick(6 * MIN); W.colo();
    const r2 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get('X-Feed-State'), 'live', "today's rows are fresh: live, not the last good list");
    assert.equal(r2.headers.get('X-Feed-Stale'), null);
    assert.equal(r2.headers.get('X-Feed-Partial'), 'later-day', 'marked for anyone diagnosing it');
    assert.match(r2.headers.get('Access-Control-Expose-Headers') || '', /X-Feed-Partial/);
    assert.equal(Date.parse(r2.headers.get('X-Feed-As-Of')), W.now, 'as of now: every row on it is from this answer');
    const b2 = await r2.json();
    assert.equal(b2._feed.state, 'live');
    assert.equal(b2._feed.partial, 'later-day');
    assert.deepEqual(ids(b2), good.slice(0, 4), "today's four rows, and nothing of tomorrow's");
    // The shared copy is today's (so no other colo asks Pearson for five
    // minutes), and says it is partial; no failure is written or counted.
    const doc = JSON.parse(env.FIDS_LIVE_FLIGHTS.m.get('fg:v1:YYZ:list:dep').v);
    assert.equal(doc.n, 4);
    assert.equal(doc.pt, 1);
    assert.equal(doc.at, W.now);
    assert.ok(!writes.some((w) => w.k === FEED_FAIL_PREFIX + 'YYZ:list:dep'), 'no backoff: the answer did not fail');
    assert.ok(!writes.some((w) => w.k === 'feed-health'), 'and the airport is not failing');
    W.colo();
    const r3 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r3.headers.get('X-Feed-State'), 'live', 'another colo serves the same fresh copy');
    assert.equal(r3.headers.get('X-Feed-Partial'), 'later-day');
    assert.deepEqual(ids(await r3.json()), good.slice(0, 4));
    // Tomorrow back: the whole list, no mark.
    up.yyzDay = null;
    W.tick(6 * MIN); W.colo();
    const r4 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r4.headers.get('X-Feed-State'), 'live');
    assert.equal(r4.headers.get('X-Feed-Partial'), null);
    assert.deepEqual(ids(await r4.json()), good);
    assert.equal(JSON.parse(env.FIDS_LIVE_FLIGHTS.m.get('fg:v1:YYZ:list:dep').v).pt, undefined);
    // Today failed with tomorrow answering is still the Chicago case.
    up.yyzDay = { today: 'timeout', tomorrow: 'ok' };
    W.tick(6 * MIN); W.colo();
    const r5 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r5.headers.get('X-Feed-State'), 'stale', 'the last good list, marked');
    assert.deepEqual(ids(await r5.json()), good);
  });
});

test('a fallback step that worked answers the failure before it: Deer Lake and Victoria on an empty night are live and empty', async () => {
  await world(async (W) => {
    for (const [code, state] of [['YYG', { yygPage: 'blocked' }], ['YYG', { yygPage: 'gone' }], ['YYJ', {}]]) {
      W.colo();
      const { env, writes } = makeEnv();
      globalThis.fetch = upstream(state);
      const r = await W.get(env, makeCtx(), `/flights/airports/iata/${code}/2026-10-04T00:00/2026-10-04T12:00?direction=Departure`);
      assert.equal(r.status, 200, code + ' ' + JSON.stringify(state));
      assert.equal(r.headers.get('X-Feed-State'), 'live', code);
      assert.deepEqual((await r.json()).departures, [], code + ': no flights tonight, honestly');
      W.tick(4 * MIN); W.colo();
      await W.get(env, makeCtx(), `/flights/airports/iata/${code}/2026-10-04T00:00/2026-10-04T12:00?direction=Departure`);
      assert.ok(!writes.some((w) => w.k === 'feed-health'), code + ': nothing failing');
    }
  }, Date.parse('2026-10-04T05:00:00Z'));
});

// ── 6. what the second review found ─────────────────────────────────────────
// (a) A valid JSON answer with no rows carries no row's field name, and most
//     feeds' markers are one ("FlightNumber", "scheddate", '"flightNo"'): an
//     empty night at Kamloops or Abbotsford read as "the page is not the feed"
//     — 503, "Live data unavailable", and "feed failing" in the menu.
// (b) A feed's kind was guessed only from a quoted marker, so eight JSON and
//     XML feeds were handled as HTML boards: a challenge page no vendor list
//     knows was an "error" there, and never docked them.
// (c) A text/html Content-Type on a JSON feed was "blocked" before anyone read
//     the body, so a valid empty answer sent that way was a block, and would
//     have docked a small airport after half an hour.
const GENERIC_WAIT_HTML = '<!DOCTYPE html><html><head><title>Please wait</title></head><body>'
  + 'Checking your browser before accessing the site. Enable JavaScript and cookies to continue.</body></html>';
// Every host gives the same answer; Victoria's page still hands out a nonce.
function anyHost(answer) {
  const calls = [];
  const f = async (url) => {
    const u = new URL(String(url && url.url || url));
    calls.push(u.hostname + u.pathname);
    if (u.hostname === 'yyj.ca' && u.pathname.startsWith('/en/flights-info/')) {
      return new Response('<html><script>var flightsData = {"nonce":"n1"}</script></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    const [body, type] = answer(u);
    return new Response(body, { status: 200, headers: { 'Content-Type': type } });
  };
  f.calls = calls;
  return f;
}
const winOf = (code) => `/flights/airports/iata/${code}/2026-10-04T00:00/2026-10-04T12:00?direction=Departure`;

test('a text/html label on a body that IS the expected kind is not a block; on any other body, or unread, it still is', () => {
  const H = 'text/html; charset=utf-8';
  const R = () => new Response('x', { status: 200, headers: { 'Content-Type': H } });
  const src = 'https://feed.example/api';
  assert.equal(feedClassifyResponse(R(), 'json', src, '{"list":[]}'), 'ok', "Toronto's empty list, labelled text/html");
  assert.equal(feedClassifyResponse(R(), 'json', src, '{"flightsByDate":{}}'), 'ok', "Saint-Hubert's empty list, labelled text/html");
  assert.equal(feedClassifyResponse(R(), 'json', src, '"[]"'), 'ok', "Calgary's string of JSON");
  assert.equal(feedClassifyResponse(R(), 'json', src, GENERIC_WAIT_HTML), 'blocked', 'a page where JSON was asked for');
  assert.equal(feedClassifyResponse(R(), 'json', src, RADWARE_HTML), 'blocked');
  assert.equal(feedClassifyResponse(R(), 'json', src, 'OK'), 'blocked', 'plain words are not JSON');
  assert.equal(feedClassifyResponse(R(), 'json', src), 'blocked', 'unread, the label stands');
  assert.equal(feedClassifyResponse(R(), 'xml', src, '<?xml version="1.0" standalone="yes" ?><data></data>'), 'ok');
  assert.equal(feedClassifyResponse(R(), 'xml', src, GENERIC_WAIT_HTML), 'blocked');
  // A body never overrules a status or a hop to another host.
  assert.equal(feedClassifyResponse(new Response(null, { status: 302, headers: { Location: 'https://validate.perfdrive.com/x' } }), 'json', src, '{"list":[]}'), 'blocked');
  const hop = new Response('{"list":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  Object.defineProperty(hop, 'redirected', { value: true });
  Object.defineProperty(hop, 'url', { value: 'https://validate.perfdrive.com/x' });
  assert.equal(feedClassifyResponse(hop, 'json', src, '{"list":[]}'), 'blocked');
  // Cut short is still JSON that lost its shape: an error, not a block.
  assert.equal(feedClassifyBody('[{"FlightNumber":"579","Airl', 'json'), 'error');
  assert.equal(feedClassifyBody('"[{\\"AirlineIATACode\\":\\"WS\\"', 'json'), 'error', "Calgary's string, cut short");
});

test('a valid empty answer: it parses, holds a list, and every list in it is empty — and it does not say it failed', () => {
  for (const t of ['[]', ' [ ] ', '{"flights":[]}', '{"departures":[],"arrivals":[]}', '"[]"',
    '{"meta":{"count":0},"data":{"flights":[]}}', '{"errors":[],"flights":[]}', '{"success":true,"data":[]}']) {
    assert.equal(feedJsonEmpty(t), true, t);
  }
  for (const t of ['{}', '{"data":null}', '[{"FlightNumber":"579"}]', '{"flights":[],"other":[1]}',
    '{"success":false,"data":[]}', '{"error":"rate limited","flights":[]}', '{"errors":[{"message":"x"}]}',
    '{"errors":[]}', 'null', '0', '""', '', 'OK', RADWARE_HTML, GENERIC_WAIT_HTML, '[{"a":1},']) {
    assert.equal(feedJsonEmpty(t), false, t);
  }
});

test('a registry airport with no flights tonight is live and empty — whatever its marker, and however the answer is labelled', async () => {
  await world(async (W) => {
    for (const code of ['YKA', 'YLW', 'YXX', 'DEN', 'YYC', 'EDI', 'KEF', 'MSY', 'DTW', 'ORD', 'YOW']) {
      for (const [body, type] of [['[]', 'application/json'], ['[]', 'text/html; charset=utf-8'], [code === 'YYC' ? '"[]"' : '{"flights":[]}', 'application/json']]) {
        W.colo();
        const { env, writes } = makeEnv();
        globalThis.fetch = anyHost(() => [body, type]);
        const r = await W.get(env, makeCtx(), winOf(code));
        const what = `${code} ${body} as ${type}`;
        assert.equal(r.status, 200, what);
        assert.equal(r.headers.get('X-Feed-State'), 'live', what);
        assert.deepEqual((await r.json()).departures, [], what);
        W.tick(4 * MIN); W.colo();
        await W.get(env, makeCtx(), winOf(code));
        assert.ok(!writes.some((w) => w.k === 'feed-health'), what + ': nothing failing, nothing to dock');
      }
    }
    // Manchester's and Dublin's own fetchers: an empty answer is a quiet night
    // too, held like a full one (a second ask inside the edge cache's time is
    // still live, not "recent failure").
    for (const [code, body] of [['MAN', '{"data":{"searchDepartures":[]}}'], ['DUB', '{"content":[],"pagination":{"hasNext":false}}']]) {
      W.colo();
      const { env, writes } = makeEnv();
      globalThis.fetch = anyHost(() => [body, 'application/json']);
      for (let i = 0; i < 2; i++) {
        _feedResetMemory();
        const r = await W.get(env, makeCtx(), winOf(code) + '&n=' + i);
        assert.equal(r.status, 200, `${code} ask ${i}`);
        assert.equal(r.headers.get('X-Feed-State'), 'live', `${code} ask ${i}`);
        assert.deepEqual((await r.json()).departures, [], code);
        await env.FIDS_LIVE_FLIGHTS.delete(`fg:v1:${code}:win:dep`);   // past the shared copy, to the fetcher's own cache
      }
      assert.ok(!writes.some((w) => w.k === 'feed-health'), code);
    }
    for (const [code, body] of [['MAN', '{"errors":[{"message":"Cannot query field"}],"data":null}'], ['DUB', '{"message":"moved"}']]) {
      W.colo();
      const { env } = makeEnv();
      globalThis.fetch = anyHost(() => [body, 'application/json']);
      const r = await W.get(env, makeCtx(), winOf(code));
      assert.equal(r.status, 503, code + ' ' + body);
      assert.equal((await r.json()).error, 'error', code + ' ' + body);
    }
    // Not empty, and not the feed: a list whose rows lost the marker, an
    // answer that says it failed, or JSON with no list at all is an error.
    for (const body of ['[{"Flight":"579"}]', '{"success":false,"data":[]}', '{"error":"quota","flights":[]}', '{"data":null}']) {
      W.colo();
      const { env } = makeEnv();
      globalThis.fetch = anyHost(() => [body, 'application/json']);
      const r = await W.get(env, makeCtx(), winOf('YLW'));
      assert.equal(r.status, 503, body);
      assert.equal((await r.json()).error, 'error', body);
    }
  }, Date.parse('2026-10-04T08:00:00Z'));
});

test('a challenge page no vendor list knows is "blocked" on every JSON or XML feed, whatever its marker looks like', async () => {
  await world(async (W) => {
    for (const code of ['YYC', 'ORD', 'DTW', 'YLW', 'DEN', 'YXX', 'YXS', 'YYJ', 'MIA', 'AUS', 'YKA', 'YOW']) {
      for (const type of ['text/html; charset=utf-8', 'application/json']) {
        W.colo();
        const { env } = makeEnv();
        globalThis.fetch = anyHost(() => [GENERIC_WAIT_HTML, type]);
        const r = await W.get(env, makeCtx(), winOf(code));
        assert.equal(r.status, 503, `${code} as ${type}`);
        assert.equal((await r.json()).error, 'blocked', `${code} as ${type}`);
      }
    }
  }, Date.parse('2026-10-04T08:00:00Z'));
});

test('an own route whose valid empty answer is labelled text/html is live and empty; a page there is still blocked', async () => {
  await world(async (W) => {
    for (const [route, empty] of [['/flights/yhu?direction=dep', '{"flightsByDate":{}}'], ['/flights/yyz?direction=dep', '{"list":[]}']]) {
      W.colo();
      const { env, writes } = makeEnv();
      globalThis.fetch = anyHost(() => [empty, 'text/html; charset=utf-8']);
      for (let i = 0; i < 8; i++) {
        const r = await W.get(env, makeCtx(), route);
        assert.equal(r.status, 200, route);
        assert.equal(r.headers.get('X-Feed-State'), 'live', route);
        W.tick(6 * MIN); W.colo();
      }
      assert.ok(!writes.some((w) => w.k === 'feed-health'), route + ': 45 minutes of empty nights dock nothing');
      W.colo();
      globalThis.fetch = anyHost(() => [GENERIC_WAIT_HTML, 'text/html; charset=utf-8']);
      const b = await W.get(env, makeCtx(), route);
      assert.equal(b.headers.get('X-Feed-State') === 'stale' ? (await b.json())._feed.failure : (await b.json()).error, 'blocked', route);
    }
  });
});

test('every authority fetch that feeds a JSON or XML parser says so: a quoted marker, or feedExpect', () => {
  // Read each fetchAuthorityText call, find the parser its text goes to, and
  // read that parser's first parameter: jsonText / rawText / json is a JSON
  // feed, xmlText an XML one. A bare-word marker cannot tell JSON from HTML.
  const sig = {};
  for (const m of WORKER_SRC.matchAll(/function\s+([\w$]+)\s*\(\s*([\w$]+)/g)) sig[m[1]] = m[2];
  const args = (s) => {        // top-level arguments of a call's text, as source
    const out = []; let depth = 0, q = null, cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { cur += c; if (c === '\\') { cur += s[++i]; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
      if ('([{'.includes(c)) depth++;
      if (')]}'.includes(c)) depth--;
      if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  let checked = 0;
  const kinds = {};
  for (const m of WORKER_SRC.matchAll(/fetchAuthorityText\(/g)) {
    const start = m.index + m[0].length;
    if (/async function $/.test(WORKER_SRC.slice(start - 40, m.index))) continue;     // the definition
    let depth = 1, i = start, q = null;
    for (; i < WORKER_SRC.length && depth; i++) {
      const c = WORKER_SRC[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const call = WORKER_SRC.slice(start, i - 1);
    const after = WORKER_SRC.slice(i, i + 500).split(/\n\s*\}\s*\}|\n\}\n/)[0];
    const pm = after.match(/\b([\w$]*(?:[Pp]arse|FeedRows)[\w$]*)\(\s*t\b/);
    if (!pm || !sig[pm[1]]) continue;
    const param = sig[pm[1]];
    const kind = /^(jsonText|rawText|json)$/.test(param) ? 'json' : (param === 'xmlText' ? 'xml' : 'html');
    if (kind === 'html') continue;
    const a = args(call);
    const marker = a[2] || '';
    const fe = (call.match(/feedExpect:\s*"(\w+)"/) || [])[1] || null;
    const ok = kind === 'json' ? (fe === 'json' || (!fe && /^'"/.test(marker))) : fe === 'xml';
    assert.ok(ok, `${a[0]} feeds ${pm[1]}(${param}) with marker ${marker} and no feedExpect: "${kind}"`);
    kinds[a[0]] = fe || 'quoted';
    checked++;
  }
  assert.ok(checked >= 30, `the guard read ${checked} calls`);
  for (const k of ['`dtw/${dir}`', '`ylw/${dir}`', '`yxx/${dir}`', '"yyc/all"', '`den/${dir}`', '`ord/${dir}/${day}`', '"yxs/panels"', '`mia/${dir}`', '`aus/${dir}`']) {
    assert.ok(kinds[k] && kinds[k] !== 'quoted', k + ' declares its kind');
  }
  assert.match(WORKER_SRC, /fetchAuthorityText\(`yyj\/flights\/\$\{nonce\}`, YYJ_AJAX_URL, "flightsTable", 75, \{\n\s*feedExpect: "json",/, "Victoria's ajax answers JSON");
});

// ── 7. what the third review found (v23998) ─────────────────────────────────
// (a) A JSON body that carries the feed's marker but does not parse — cut off
//     mid-row, or rows followed by a PHP "<b>Fatal error</b>" — was labelled
//     ok. The parser found nothing, the guard served a quiet night under LIVE,
//     and the three-hour shared copy was overwritten with an empty list, so
//     the next block had no last good list to show.
// (b) A feed asked in parts was served live whenever any part answered:
//     Chicago with "Today" behind a challenge and "Tomorrow" answered, Dublin
//     with a page refused, the Port Authority with page 2 refused.
// (c) The backoff while failing was per isolate: three isolates asked a
//     refusing Pearson 60 times in 30 minutes (today AND tomorrow every time).
// (d) The menu's "auto-docked since" printed when the block began.
const fx = (f) => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', f), 'utf8');
const WIDE = '2026-09-01T00:00/2026-09-30T00:00';
const wideWin = (code, dir) => `/flights/airports/iata/${code}/${WIDE}?direction=${dir === 'arr' ? 'Arrival' : 'Departure'}`;
const listOf = (j) => j.departures || j.arrivals || j.list || [];
const sharedRows = (env, key) => { const e = env.FIDS_LIVE_FLIGHTS.m.get(key); return e ? JSON.parse(e.v).n : null; };
const PHP_FATAL = '<br />\n<b>Fatal error</b>:  Allowed memory size of 134217728 bytes exhausted in <b>/var/www/flights.php</b> on line <b>88</b><br />';

test('a JSON body cut off mid-row, or rows followed by a PHP fatal error, is an error: 503, never a quiet night, and the last good list survives it', async () => {
  await world(async (W) => {
    const rows = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ ArrivalOrDeparture: 'Departure', AirlineCode: 'WS', FlightNumber: String(300 + i),
      ScheduleTime: new Date(Date.now() + (i + 1) * 40 * MIN).toISOString(), City: 'Calgary' })));
    for (const broken of [(t) => t.slice(0, Math.floor(t.length * 0.6)), (t) => t + PHP_FATAL]) {
      W.colo();
      const { env } = makeEnv();
      let body = rows(4);
      globalThis.fetch = anyHost(() => [body, 'application/json']);
      const r1 = await W.get(env, makeCtx(), winOf('YLW'));
      assert.equal(r1.headers.get('X-Feed-State'), 'live');
      const good = listOf(await r1.json()).map((f) => f.number);
      assert.equal(good.length, 4);
      body = broken(rows(4));
      assert.ok(body.includes('FlightNumber'), 'the broken body still carries the marker');
      W.tick(4 * MIN); W.colo();
      const r2 = await W.get(env, makeCtx(), winOf('YLW'));
      assert.equal(r2.headers.get('X-Feed-State'), 'stale', 'the last good list, marked — not "no flights" under LIVE');
      const j2 = await r2.json();
      assert.equal(j2._feed.failure, 'error', 'cut short is an error, not a block');
      assert.deepEqual(listOf(j2).map((f) => f.number), good);
      assert.equal(sharedRows(env, 'fg:v1:YLW:win:dep'), 4, 'the shared copy still holds the four rows');
      // With no good list behind it: 503 "error", not 200 with nothing.
      W.colo();
      const fresh = makeEnv().env;
      const r3 = await W.get(fresh, makeCtx(), winOf('YLW'));
      assert.equal(r3.status, 503);
      assert.equal((await r3.json()).error, 'error');
      assert.equal(sharedRows(fresh, 'fg:v1:YLW:win:dep'), null, 'nothing was written');
    }
    // The XML feeds: a body cut short is not the board either.
    for (const code of ['MIA', 'AUS']) {
      W.colo();
      const { env } = makeEnv();
      const xml = fx(code === 'MIA' ? 'mia-dep-sample.xml' : 'aus-dep-sample.xml');
      globalThis.fetch = anyHost(() => [xml.slice(0, Math.floor(xml.length * 0.7)), 'text/xml']);
      const r = await W.get(env, makeCtx(), winOf(code));
      assert.equal(r.status, 503, code);
      assert.equal((await r.json()).error, 'error', code);
    }
    // Manchester's own fetcher: cut short, or a GraphQL error that names the field.
    for (const body of ['{"data":{"searchDepartures":[{"flightNumber":"EZY123","status":"Sch', '{"errors":[{"message":"Cannot query field flightNumber on type X"}],"data":null}']) {
      W.colo();
      const { env } = makeEnv();
      globalThis.fetch = anyHost(() => [body, 'application/json']);
      const r = await W.get(env, makeCtx(), winOf('MAN'));
      assert.equal(r.status, 503, body);
      assert.equal((await r.json()).error, 'error', body);
    }
    // Charlo's PHP leaves a comma before the bracket on a row-less day: still
    // the whole document, still a quiet night.
    W.colo();
    const { env: e4, writes: w4 } = makeEnv();
    globalThis.fetch = anyHost(() => ['{"flights":[],}', 'text/html; charset=UTF-8']);
    const r4 = await W.get(e4, makeCtx(), winOf('YQY'));
    assert.equal(r4.status, 200);
    assert.equal(r4.headers.get('X-Feed-State'), 'live');
    assert.ok(!w4.some((w) => w.k === 'feed-health'));
  }, Date.parse('2026-10-04T08:00:00Z'));
});

test('every real body the feeds have sent is whole by the new rule, and none of them is once cut short or followed by an error page', () => {
  let n = 0;
  for (const f of fs.readdirSync(path.join(ROOT, 'tests', 'fixtures'))) {
    const kind = /\.json$/.test(f) ? 'json' : (/\.xml$/.test(f) ? 'xml' : null);
    if (!kind) continue;
    const t = fx(f);
    assert.equal(feedBodyComplete(t, kind), true, f + ' is whole');
    assert.equal(feedBodyComplete(t.slice(0, Math.floor(t.length * 0.5)), kind), false, f + ' cut in half');
    assert.equal(feedBodyComplete(t.slice(0, t.length - 2), kind), false, f + ' missing its last characters');
    assert.equal(feedBodyComplete(t + PHP_FATAL, kind), false, f + ' followed by a PHP fatal error');
    n++;
  }
  assert.ok(n >= 60, `read ${n} real bodies`);
  assert.equal(feedBodyComplete('"[{\\"AirlineIATACode\\":\\"WS\\"}]"', 'json'), true, "Calgary's string of JSON");
  assert.equal(feedBodyComplete('{"flights":[ ],}', 'json'), true, "Charlo's dangling comma");
  assert.equal(feedBodyComplete('<?xml version="1.0"?><data/>', 'xml'), true, 'an empty XML board');
  assert.equal(feedBodyComplete('<html><body>anything</body>', 'html'), true, 'an HTML board is proved by its marker, not by this');
});

// One fake upstream per airport asked in parts. `bad` names the part that
// fails; everything else answers from the real bodies in tests/fixtures.
function partsUpstream(bad) {
  const calls = [];
  const refuse = () => { bad.failed = (bad.failed || 0) + 1; return new Response(RADWARE_HTML, { status: 403, headers: { 'Content-Type': 'text/html' } }); };
  const dub = JSON.parse(fx('dub-sample.json')).arr;
  // Dublin's tomorrow: the sample's arrivals a day later, under numbers of their own.
  const dayLater = (t) => (t ? new Date(Date.parse(t) + 864e5).toISOString() : t);
  const dubTmw = dub.map((r) => ({ ...r, flightIdentity: String(r.flightIdentity).replace(/\d+$/, (n) => String(+n + 1000)),
    scheduledDateTime: dayLater(r.scheduledDateTime), estimatedDateTime: dayLater(r.estimatedDateTime) }));
  const f = async (url, init) => {
    const r = await answer(url, init);
    if (r.status === 200 && !/Radware/.test(await r.clone().text())) bad.answered = (bad.answered || 0) + 1;
    else if (r.status === 200 || r.status >= 500) bad.failed = (bad.failed || 0) + 1;
    return r;
  };
  const answer = async (url, init) => {
    const u = new URL(String(url && url.url || url));
    calls.push(u.hostname + u.pathname + u.search);
    const b = bad.v;
    if (u.hostname === 'prod-flightwarehousewebservice.flychicago.com') {
      const day = /\/Today\//.test(u.pathname) ? 'today' : 'tomorrow';
      if (b === 'ord-' + day) return day === 'today' ? new Response(RADWARE_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } }) : new Response('err', { status: 500 });
      if (b === 'ord-tomorrow-blocked' && day === 'tomorrow') return refuse();
      return new Response(fx('ord-sample.json'), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.hostname === 'api.dublinairport.com') {
      // Dublin reads its day from the real clock (new Date()), so "today" is
      // the first day it asks for.
      const page2 = u.searchParams.has('after');
      bad.dubToday = bad.dubToday || u.searchParams.get('date');
      const today = u.searchParams.get('date') === bad.dubToday;
      if (b === 'dub-page2' && today && page2) return refuse();
      if (b === 'dub-page2-500' && today && page2) return new Response('err', { status: 500 });
      if (b === 'dub-tomorrow' && !today) return refuse();
      if (b === 'dub-tomorrow-500' && !today) return new Response('err', { status: 500 });
      if (b === 'dub-tomorrow-page2-500' && !today && page2) return new Response('err', { status: 500 });
      // Tomorrow: two pages of its own.
      if (!today) return Response.json(page2 ? { content: dubTmw.slice(3), pagination: { hasNext: false } }
        : { content: dubTmw.slice(0, 3), pagination: { hasNext: true, latestTimestamp: 't1', latestId: 't2' } });
      return Response.json(page2 ? { content: dub.slice(10, 20), pagination: { hasNext: false } }
        : { content: dub.slice(0, 10), pagination: { hasNext: true, latestTimestamp: 'c1', latestId: 'c2' } });
    }
    if (u.hostname === 'slcairport.com') {
      // Salt Lake City reads its day from the real clock too.
      bad.slcToday = bad.slcToday || (u.searchParams.get('query_date1') || '').slice(0, 10);
      const today = (u.searchParams.get('query_date1') || '').slice(0, 10) === bad.slcToday;
      if (b === 'slc-tomorrow' && !today) return refuse();
      if (b === 'slc-today-blocked' && today) return refuse();
      if (b === 'slc-tomorrow-500' && !today) return new Response('err', { status: 500 });
      if (b === 'slc-today-500-tomorrow-blocked') return today ? new Response('err', { status: 500 }) : refuse();
      // Tomorrow's page: the same board, dated the next day.
      const page = fx(u.searchParams.get('query_leg') === 'A' ? 'slc-arr-sample.html' : 'slc-dep-sample.html');
      return new Response(today ? page : page.replace('Sat, Sep 05', 'Sun, Sep 06'), { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (u.hostname === 'flightdata.flughafen-zuerich.ch') {
      if (b === 'zrh-tomorrow' && u.searchParams.get('date') === '2026-09-07') return new Response('', { status: 502 });
      if (b === 'zrh-tomorrow-blocked' && u.searchParams.get('date') === '2026-09-07') return refuse();
      if (b === 'zrh-yesterday-blocked' && u.searchParams.get('date') === '2026-09-06') return refuse();
      if (b === 'zrh-today-502-tomorrow-blocked' && u.searchParams.get('date') === '2026-09-06') return new Response('', { status: 502 });
      if (b === 'zrh-today-502-tomorrow-blocked' && u.searchParams.get('date') === '2026-09-07') return refuse();
      return new Response(fx('zrh-sample-2026-09-06.json'), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.hostname === 'flyymm.com') {
      if (b === 'ymm-today' && u.searchParams.get('dt') === '2026-09-06') return refuse();
      if (b === 'ymm-today-500-tomorrow-blocked') return u.searchParams.get('dt') === '2026-09-06' ? new Response('err', { status: 500 }) : refuse();
      if ((b === 'ymm-tomorrow-500' || b === 'ymm-evening') && u.searchParams.get('dt') === '2026-09-07') return new Response('err', { status: 500 });
      if ((b === 'ymm-tomorrow-blocked' || b === 'ymm-evening-blocked') && u.searchParams.get('dt') === '2026-09-07') return refuse();
      if (b === 'ymm-evening' || b === 'ymm-evening-blocked') return new Response(fx('ymm-empty-sample.json'), { status: 200, headers: { 'Content-Type': 'application/json' } });
      // Tomorrow's file: the same day's flights, dated the next day.
      const day = fx(u.searchParams.get('type') === 'A' ? 'ymm-arr-sample.json' : 'ymm-dep-sample.json');
      return new Response(u.searchParams.get('dt') === '2026-09-07' ? day.replaceAll('2026-09-06', '2026-09-07') : day,
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.hostname === 'www.laguardiaairport.com') {
      bad.lgaPage = (bad.lgaPage || 0) + 1;
      const n = bad.lgaPage;
      if (b === 'lga-page2' && n % 2 === 0) return refuse();
      const rows = Array.from({ length: 3 }, (_, i) => ({ flightNumber: 'DL' + (n * 10 + i) }));
      return Response.json({ data: { getDepartingFlights: { data: rows, paging: { next: n % 2 ? 'page2' : '' } } } });
    }
    if (u.hostname === 'www.mspairport.com') {
      const p = Number(u.searchParams.get('page'));
      if (p === 0) return new Response(fx('msp-dep-sample.html'), { status: 200, headers: { 'Content-Type': 'text/html' } });
      if (b === 'msp-page1') return refuse();
      return new Response('<html><body><div class="view-empty">No flights match your search.</div></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (u.hostname === 'www.sydneyairport.com.au') {
      // Sydney's real captures: its "today" files for the first day asked,
      // its "tomorrow" files for the next.
      bad.sydToday = bad.sydToday || u.searchParams.get('date');
      const today = u.searchParams.get('date') === bad.sydToday;
      const tt = u.searchParams.get('terminalType');
      if (b === 'syd-tomorrow-dom' && !today && tt === 'domestic') return new Response('<html>502 Bad Gateway</html>', { status: 502 });
      if (b === 'syd-today-dom' && today && tt === 'domestic') return new Response('<html>502 Bad Gateway</html>', { status: 502 });
      if (b === 'syd-tomorrow-dom-blocked' && !today && tt === 'domestic') return refuse();
      if (b === 'syd-today-dom-blocked' && today && tt === 'domestic') return refuse();
      return new Response(fx(`syd-${u.searchParams.get('flightType')}-${tt}-${today ? 'today' : 'tomorrow'}.json`), { status: 200 });
    }
    if (u.hostname === 'flyyzf.ca') return refuse();
    if (u.hostname === 'www.dot.gov.nt.ca') return new Response(fx('yzf-dot-sample.html'), { status: 200, headers: { 'Content-Type': 'text/html' } });
    throw new Error('test: no network for ' + u.hostname);
  };
  f.calls = calls;
  return f;
}

test('a feed asked in parts is live only when every part answered: a refused part shows the last good list, marked, and never replaces it', async () => {
  // v24002 — only a later day that failed or was refused is forgiven (the
  // next test); these are the parts that still fail the whole answer, each
  // with the kind of failure it is.
  const cases = [
    ['ORD', 'arr', 'ord-today', 'Chicago: "Today" behind a challenge page, "Tomorrow" answered', 'blocked'],
    ['ORD', 'arr', 'ord-tomorrow', 'Chicago: "Today" still yesterday\'s operational day (its rows dated yesterday), so "Tomorrow" is the calendar today — and a 500', 'error'],
    ['DUB', 'arr', 'dub-page2', "Dublin: today's second page refused", 'blocked'],
    ['DUB', 'arr', 'dub-page2-500', "Dublin: today's second page a 500 — a failed page of today", 'error'],
    ['SLC', 'dep', 'slc-today-blocked', "Salt Lake City: today's page refused", 'blocked'],
    ['ZRH', 'dep', 'zrh-yesterday-blocked', "Zürich at 01:30: yesterday's day file refused — yesterday is no later day", 'blocked', Date.parse('2026-09-06T23:30:00Z')],
    ['YMM', 'dep', 'ymm-today', "Fort McMurray: today's file refused", 'blocked'],
    ['YMM', 'dep', 'ymm-evening', "Fort McMurray late in the evening: today's file answered empty, tomorrow's a 500 — nothing fresh to show is not a quiet night", 'error'],
    ['YMM', 'dep', 'ymm-evening-blocked', "Fort McMurray late in the evening: today's file answered empty, tomorrow's refused — the refusal is the answer's", 'blocked'],
    ['SYD', 'dep', 'syd-today-dom', "Sydney: today's domestic slice a 502 — a failed slice of today", 'error'],
    ['SYD', 'dep', 'syd-today-dom-blocked', "Sydney: today's domestic slice refused — a refused slice of today", 'blocked']
  ];
  for (const [code, dir, part, what, kind, clock] of cases) {
    await world(async (W) => {
      const { env } = makeEnv();
      const bad = { v: null };
      globalThis.fetch = partsUpstream(bad);
      const key = `fg:v1:${code}:win:${dir}`;
      const r1 = await W.get(env, makeCtx(), wideWin(code, dir));
      assert.equal(r1.headers.get('X-Feed-State'), 'live', what + ': every part answered');
      const good = listOf(await r1.json()).map((f) => f.number + '|' + f._authTs);
      assert.ok(good.length > 0, what);
      const n = sharedRows(env, key);
      bad.v = part; bad.answered = 0; bad.failed = 0;
      W.tick(10 * MIN); W.colo();
      const r2 = await W.get(env, makeCtx(), wideWin(code, dir));
      assert.ok(bad.answered > 0 && bad.failed > 0, `${what}: a real partial answer (${bad.answered} parts answered, ${bad.failed} failed)`);
      assert.equal(r2.status, 200, what);
      assert.equal(r2.headers.get('X-Feed-State'), 'stale', what + ': not live');
      assert.equal(r2.headers.get('X-Feed-Partial'), null, what + ': and not partial');
      const b2 = await r2.json();
      assert.equal(b2._feed.failure, kind, what + ': ' + kind);
      assert.deepEqual(listOf(b2).map((f) => f.number + '|' + f._authTs), good, what + ': the last good list, whole');
      assert.equal(sharedRows(env, key), n, what + ': the shared copy is not replaced by the part');
      // With no good list behind it, nothing — not the part.
      W.colo();
      const fresh = makeEnv().env;
      const r3 = await W.get(fresh, makeCtx(), wideWin(code, dir));
      assert.equal(r3.status, 503, what + ': 503 with no last good list');
    }, clock || PARTS_CLOCK[code] || Date.parse('2026-09-05T17:00:00Z'));
  }
});

// v24002 — a failed today keeps the kind it had under v23998: Salt Lake
// City, Zurich and Fort McMurray still ask tomorrow after today failed, and a
// refused tomorrow beside it makes the failure "blocked", which the health and
// the 30-minute dock count — the later day is forgiven only when today answered.
test('today failed and tomorrow refused: the failure is "blocked", as before — Salt Lake City, Zurich, Fort McMurray', async () => {
  const cases = [
    ['SLC', 'dep', 'slc-today-500-tomorrow-blocked', "Salt Lake City: today's page a 500, tomorrow's refused"],
    ['ZRH', 'dep', 'zrh-today-502-tomorrow-blocked', "Zurich: today's day file a 502, tomorrow's refused"],
    ['YMM', 'dep', 'ymm-today-500-tomorrow-blocked', "Fort McMurray: today's file a 500, tomorrow's refused"]
  ];
  for (const [code, dir, part, what] of cases) {
    await world(async (W) => {
      const { env } = makeEnv();
      const bad = { v: null };
      globalThis.fetch = partsUpstream(bad);
      const r1 = await W.get(env, makeCtx(), wideWin(code, dir));
      assert.equal(r1.headers.get('X-Feed-State'), 'live', what + ': every part answered');
      bad.v = part; bad.answered = 0; bad.failed = 0;
      W.tick(10 * MIN); W.colo();
      const r2 = await W.get(env, makeCtx(), wideWin(code, dir));
      assert.ok(bad.failed >= 2, `${what}: today failed and tomorrow was asked and refused (${bad.failed} failed)`);
      assert.equal(r2.headers.get('X-Feed-State'), 'stale', what + ': not live');
      assert.equal(r2.headers.get('X-Feed-Partial'), null, what + ': and not partial');
      assert.equal((await r2.json())._feed.failure, 'blocked', what + ': blocked, as under v23998');
      W.colo();
      const r3 = await W.get(makeEnv().env, makeCtx(), wideWin(code, dir));
      assert.equal(r3.status, 503, what);
      assert.equal((await r3.json()).error, 'blocked', what + ': 503 blocked with no last good list');
    }, PARTS_CLOCK[code] || Date.parse('2026-09-05T17:00:00Z'));
  }
});

// Each airport's clock for the parts tests: Zürich and Fort McMurray on their
// captures' day, Sydney at 09:00 (tomorrow rides along from 06:00).
const PARTS_CLOCK = { ZRH: Date.parse('2026-09-06T14:00:00Z'), YMM: Date.parse('2026-09-06T14:00:00Z'), SYD: Date.parse('2026-09-15T09:00:00+10:00') };

// v24002 — the rule, airport by airport: today answered and only a LATER
// day failed (a 500, a 502) or was refused by a bot manager (a challenge page,
// a 403) → today's fresh rows are served LIVE, marked partial, and become the
// shared copy; tomorrow is left out whole, never half of it; nothing is
// counted as a failure; and the next whole answer puts tomorrow back.
test("a feed asked in days: today answered and only tomorrow failed or was refused — today's fresh rows are live, tomorrow is left out whole", async () => {
  // tz: the airport's clock, when tomorrow's fake rows are dated tomorrow;
  // null when the fake answers tomorrow with today's own rows again (Chicago,
  // Zürich), so tomorrow is exactly the second half of the whole list.
  const cases = [
    ['ORD', 'arr', 'ord-tomorrow', 'Chicago: "Today" (rolled onto the calendar day) answered, "Tomorrow" a 500', null, Date.parse('2026-09-04T10:00:00Z')],
    ['DUB', 'arr', 'dub-tomorrow-500', "Dublin: tomorrow's first page a 500", 'Europe/Dublin'],
    ['DUB', 'arr', 'dub-tomorrow-page2-500', "Dublin: tomorrow's second page a 500 — its first page is not kept either", 'Europe/Dublin'],
    ['SLC', 'dep', 'slc-tomorrow-500', "Salt Lake City: tomorrow's page a 500", 'America/Denver'],
    ['ZRH', 'dep', 'zrh-tomorrow', "Zurich: tomorrow's day file a 502", null],
    ['YMM', 'dep', 'ymm-tomorrow-500', "Fort McMurray: tomorrow's file a 500", 'America/Edmonton'],
    ['SYD', 'dep', 'syd-tomorrow-dom', "Sydney: tomorrow's domestic slice a 502 — its international slice is not kept either", 'Australia/Sydney'],
    // Refused by a bot manager: the same, by the same rule.
    ['ORD', 'arr', 'ord-tomorrow-blocked', 'Chicago: "Today" (rolled onto the calendar day) answered, "Tomorrow" refused', null, Date.parse('2026-09-04T10:00:00Z')],
    ['DUB', 'arr', 'dub-tomorrow', "Dublin: tomorrow's first page refused", 'Europe/Dublin'],
    ['SLC', 'dep', 'slc-tomorrow', "Salt Lake City: tomorrow's page refused", 'America/Denver'],
    ['ZRH', 'dep', 'zrh-tomorrow-blocked', "Zurich: tomorrow's day file refused", null],
    ['YMM', 'dep', 'ymm-tomorrow-blocked', "Fort McMurray: tomorrow's file refused", 'America/Edmonton'],
    ['SYD', 'dep', 'syd-tomorrow-dom-blocked', "Sydney: tomorrow's domestic slice refused — its international slice is not kept either", 'Australia/Sydney']
  ];
  const { feedLocalDay } = await import('../workers/fids-proxy.js');
  for (const [code, dir, part, what, tz, clock] of cases) {
    await world(async (W) => {
      const { env, writes } = makeEnv();
      const bad = { v: null };
      globalThis.fetch = partsUpstream(bad);
      const key = `fg:v1:${code}:win:${dir}`;
      // Today alone, as the airport answers it: tomorrow's part answering
      // nothing new is told apart by asking once with tomorrow failed below.
      const r1 = await W.get(env, makeCtx(), wideWin(code, dir));
      assert.equal(r1.headers.get('X-Feed-State'), 'live', what + ': every part answered');
      const full = listOf(await r1.json()).map((f) => f.number + '|' + f._authTs);
      bad.v = part; bad.answered = 0; bad.failed = 0;
      W.tick(10 * MIN); W.colo();
      const r2 = await W.get(env, makeCtx(), wideWin(code, dir));
      assert.ok(bad.answered > 0 && bad.failed > 0, `${what}: a real partial answer (${bad.answered} parts answered, ${bad.failed} failed)`);
      assert.equal(r2.status, 200, what);
      assert.equal(r2.headers.get('X-Feed-State'), 'live', what + ": today's rows are fresh — live");
      assert.equal(r2.headers.get('X-Feed-Partial'), 'later-day', what + ': marked partial');
      const b2 = await r2.json();
      assert.equal(b2._feed.state, 'live', what);
      assert.equal(b2._feed.failure, null, what + ': not a failure');
      assert.equal(b2._feed.partial, 'later-day', what);
      const part2 = listOf(b2).map((f) => f.number + '|' + f._authTs);
      assert.ok(part2.length > 0, what + ": today's rows are there");
      assert.ok(part2.length < full.length, `${what}: tomorrow is left out (${part2.length} of ${full.length})`);
      assert.deepEqual(part2, full.slice(0, part2.length), what + ": today's rows, as the whole answer had them");
      // …and nothing of tomorrow, not even the half of it that answered.
      if (tz) {
        const today = feedLocalDay(tz, W.now);
        const dayOf = (k) => feedLocalDay(tz, Number(k.split('|')[1]));
        assert.ok(full.some((k) => dayOf(k) > today), what + ': the whole answer does hold tomorrow');
        assert.deepEqual(part2, full.filter((k) => dayOf(k) <= today), what + ": exactly today's rows");
      } else {
        assert.equal(part2.length * 2, full.length, what + ": exactly today's rows");
      }
      const doc = JSON.parse(env.FIDS_LIVE_FLIGHTS.m.get(key).v);
      assert.equal(doc.n, part2.length, what + ": the shared copy is today's fresh rows");
      assert.equal(doc.pt, 1, what + ': and says it is partial');
      assert.ok(!writes.some((w) => w.k.startsWith(FEED_FAIL_PREFIX)), what + ': no failure written');
      assert.ok(!writes.some((w) => w.k === 'feed-health'), what + ': and the airport is not failing');
      // Tomorrow answering again: the whole list, no mark.
      bad.v = null;
      W.tick(10 * MIN); W.colo();
      const r3 = await W.get(env, makeCtx(), wideWin(code, dir));
      assert.equal(r3.headers.get('X-Feed-State'), 'live', what);
      assert.equal(r3.headers.get('X-Feed-Partial'), null, what);
      assert.deepEqual(listOf(await r3.json()).map((f) => f.number + '|' + f._authTs), full, what + ': tomorrow is back');
    }, clock || PARTS_CLOCK[code] || Date.parse('2026-09-05T17:00:00Z'));
  }
});

test('the Port Authority: page 2 refused is not the day, and is not kept for a minute either', async () => {
  await world(async (W) => {
    const { env } = makeEnv();
    const bad = { v: null };
    globalThis.fetch = partsUpstream(bad);
    const r1 = await W.get(env, makeCtx(), '/flights/panynj?ap=LGA&direction=dep');
    assert.equal(r1.headers.get('X-Feed-State'), 'live');
    const good = (await r1.json()).list.map((f) => f.flightNumber);
    assert.equal(good.length, 6, 'both pages');
    bad.v = 'lga-page2';
    W.tick(6 * MIN); W.colo();
    const r2 = await W.get(env, makeCtx(), '/flights/panynj?ap=LGA&direction=dep');
    assert.equal(r2.headers.get('X-Feed-State'), 'stale', 'page 1 alone is not served as the day');
    assert.deepEqual((await r2.json()).list.map((f) => f.flightNumber), good);
    assert.equal(sharedRows(env, 'fg:v1:LGA:list:dep'), 6);
  });
});

test('the end of a paginated list is not a failure, a refused next page is; a second source standing in is still the board', async () => {
  await world(async (W) => {
    // Minneapolis: page 0 holds exactly 100 rows, so page 1 is asked; it is a
    // page of the site with no table on it — the end of the list.
    const { env, writes } = makeEnv();
    const bad = { v: null };
    const f = partsUpstream(bad);
    globalThis.fetch = f;
    const r1 = await W.get(env, makeCtx(), wideWin('MSP', 'dep'));
    assert.equal(r1.headers.get('X-Feed-State'), 'live', 'a round hundred flights is the whole list');
    assert.equal(sharedRows(env, 'fg:v1:MSP:win:dep'), 100);
    assert.ok(f.calls.some((c) => /page=1/.test(c)), 'page 1 was asked');
    W.tick(4 * MIN); W.colo();
    await W.get(env, makeCtx(), wideWin('MSP', 'dep'));
    assert.ok(!writes.some((w) => w.k === 'feed-health'), 'and it never reads as failing');
    // …but page 1 refused is a block, and the board is not the first hundred.
    bad.v = 'msp-page1';
    W.tick(4 * MIN); W.colo();
    const r2 = await W.get(env, makeCtx(), wideWin('MSP', 'dep'));
    assert.equal(r2.headers.get('X-Feed-State'), 'stale');
    assert.equal((await r2.json())._feed.failure, 'blocked');
    // Yellowknife: flyyzf.ca refused, the territory's mirror answering — the
    // mirror is the board by design, live.
    W.colo();
    const y = makeEnv();
    const r3 = await W.get(y.env, makeCtx(), `/flights/airports/iata/YZF/${WIDE}?direction=Departure`);
    assert.equal(r3.status, 200);
    assert.equal(r3.headers.get('X-Feed-State'), 'live', 'the second source stands in');
  }, Date.parse('2026-09-05T17:00:00Z'));
});

test('the backoff is shared: a refusing airport is asked about as often as a healthy one by every colo together, and a refused today costs no tomorrow', async () => {
  const isos = [];
  for (const k of ['sbA', 'sbB', 'sbC']) isos.push(await import(new URL('../workers/fids-proxy.js?iso=' + k, import.meta.url).href));
  await world(async (W) => {
    const { env, writes } = makeEnv();
    const f = upstream({ yyz: 'radware' });
    globalThis.fetch = f;
    // Three isolates, a request every 30 s, for 30 minutes, Pearson refusing.
    for (let i = 0; i < 60; i++) {
      const c = makeCtx();
      const r = await isos[i % 3].default.fetch(new Request('https://fids-proxy.test/flights/yyz?direction=dep'), env, c);
      await c.settle();
      assert.equal(r.status, 503);
      W.tick(30000);
    }
    assert.ok(!f.calls.some((c) => /day=tomorrow/.test(c)), 'tomorrow is never asked once today is refused');
    // The first refusal in each isolate is its own; from the second in a row,
    // every colo holds it for Pearson's five minutes.
    assert.ok(f.calls.length <= 10, `${f.calls.length} asks in 30 minutes (was 60)`);
    assert.equal(feedBackoffS('YYZ', 'blocked'), 300, "a block waits Pearson's own five minutes");
    assert.equal(feedBackoffS('YLW', 'blocked'), 180);
    assert.equal(feedBackoffS('YLW', 'error'), 60, 'an outage is asked again after a minute');
    const failWrites = writes.filter((w) => w.k === FEED_FAIL_PREFIX + 'YYZ:list:dep').length;
    assert.equal(failWrites, f.calls.length, 'one small write per refused ask, no more');
    const dd = await (await W.get(env, makeCtx(), '/api/dry-dock')).json();
    assert.deepEqual(dd.auto, ['YYZ'], 'and the outage still docks itself at 30 minutes');
  });
});

test('one refusal is not shared: the next colo asks for itself, and a good answer ends any shared hold', async () => {
  await world(async (W) => {
    const { env } = makeEnv();
    const up = { yyz: 'ok' };
    const f = upstream(up);
    globalThis.fetch = f;
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    up.yyz = 'radware'; W.tick(6 * MIN); W.colo();
    assert.equal((await W.get(env, makeCtx(), '/flights/yyz?direction=dep')).headers.get('X-Feed-State'), 'stale');
    up.yyz = 'ok'; W.tick(30000); W.colo();
    const before = f.calls.length;
    const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(f.calls.length, before + 2, 'asked, not held by the other colo\'s one refusal');
    assert.equal(r.headers.get('X-Feed-State'), 'live');
    // Two refusals in a row are held everywhere — until a good answer lands.
    up.yyz = 'radware'; W.tick(6 * MIN); W.colo();
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    W.tick(30000); W.colo();
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    up.yyz = 'ok'; W.tick(30000); W.colo();
    const held = f.calls.length;
    assert.equal((await W.get(env, makeCtx(), '/flights/yyz?direction=dep')).headers.get('X-Feed-State'), 'stale');
    assert.equal(f.calls.length, held, 'held by the shared backoff');
    // The dock probe is never held: it asks, Pearson answers, the copy is new.
    await env.FIDS_USERS.put('feed-health', JSON.stringify({ v: 1, feeds: { YYZ: { state: 'blocked', since: W.now - 40 * MIN, oks: 0, okAt: null } } }));
    await W.get(env, makeCtx(), '/api/dry-dock');
    assert.ok(f.calls.length > held, 'the probe asked');
    W.colo();
    assert.equal((await W.get(env, makeCtx(), '/flights/yyz?direction=dep')).headers.get('X-Feed-State'), 'live',
      'the good answer, newer than the refusal, ends the hold');
  });
});

test('the menu says when an airport was docked, not when its block began', () => {
  const t0 = Date.parse('2026-10-05T02:37:00Z');
  const r = feedAutoDocked({ v: 1, feeds: { YYZ: { state: 'blocked', since: t0, oks: 0 } } }, t0 + 45 * MIN);
  assert.equal(Date.parse(r.autoInfo.YYZ.since), t0);
  assert.equal(Date.parse(r.autoInfo.YYZ.dockedAt), t0 + FEED_AUTODOCK_MS);
  const MENU = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'menu.js'), 'utf8');
  const block = MENU.slice(MENU.indexOf('html += (_ddAuto || [])'), MENU.indexOf('html += Object.keys(_ddWatch'));
  assert.match(block, /var dockedIso = info\.dockedAt/);
  assert.match(block, /var since = _ddHhmm\(dockedIso\);/);
  assert.match(block, /Date\.parse\(info\.since\) \+ 30 \* 60000/, 'an older worker without dockedAt reads the same');
});

// ── v24002 — a partial answer is visible, and /fararr reads the same rule ────
test('feed health "partial": per direction, written once it has lasted, again only when another day goes missing or an outage turns into a refusal, gone with the first whole answer FOR THAT DIRECTION', () => {
  const t = 1e12;
  const tmw = { day: '2026-10-06', from: t + 3 * 3600e3, failure: 'error' };
  const refused = { ...tmw, failure: 'blocked' };
  const part = (since, day, failure, why) => ({ since, day, failure, ...(why ? { why } : {}) });
  assert.equal(feedHealthNext(null, 'partial', t, { since: t, last: t }, tmw, 'dep'), undefined, 'one partial answer is not written');
  assert.equal(feedHealthNext(null, 'partial', t + FEED_FAIL_CONFIRM_MS - 1, { since: t, last: t + FEED_FAIL_CONFIRM_MS - 1 }, tmw, 'dep'), undefined);
  const p = feedHealthNext(null, 'partial', t + FEED_FAIL_CONFIRM_MS, { since: t, last: t + FEED_FAIL_CONFIRM_MS }, tmw, 'dep');
  assert.deepEqual(p, { state: 'partial', since: t, oks: 0, okAt: null, day: '2026-10-06', failure: 'error', dirs: { dep: part(t, '2026-10-06', 'error') } },
    'lasting, it is written, dated from its start, under its direction');
  // A run seen only through other colos' copies is dated by when the airport was asked, not by now.
  assert.equal(feedHealthNext(null, 'partial', t + 20 * MIN, { since: t, last: t }, tmw, 'dep'), undefined, 'one copy served for twenty minutes is still one answer');
  assert.equal(feedHealthNext(p, 'partial', t + 20 * MIN, { since: t, last: t + 20 * MIN }, tmw, 'dep'), undefined, 'still partial: nothing to write');
  const pb = feedHealthNext(p, 'partial', t + 21 * MIN, { since: t, last: t + 21 * MIN }, refused, 'dep');
  assert.deepEqual(pb, { ...p, failure: 'blocked', dirs: { dep: part(t, '2026-10-06', 'blocked') } }, 'an outage turned into a refusal');
  assert.equal(feedHealthNext(pb, 'partial', t + 22 * MIN, { since: t }, tmw, 'dep'), undefined, 'a refusal is never downgraded');
  assert.deepEqual(feedHealthNext(p, 'partial', t + 25 * MIN, { since: t }, { ...tmw, day: '2026-10-07' }, 'dep'),
    { ...p, day: '2026-10-07', dirs: { dep: part(t, '2026-10-07', 'error') } }, 'another day missing');
  // THE OTHER DIRECTION answering whole says nothing about this one…
  assert.equal(feedHealthNext(p, 'ok', t + 30 * MIN, null, null, 'arr'), undefined, 'arrivals whole: departures are still partial');
  assert.equal(feedHealthNext(p, 'ok', t + 30 * MIN, null, null, 'arrivals'), undefined, "Moncton's names for the directions read the same");
  // …only a whole answer for the same direction ends it.
  assert.equal(feedHealthNext(p, 'ok', t + 30 * MIN, null, null, 'dep'), null, 'departures whole: the entry goes');
  assert.equal(feedHealthNext(p, 'ok', t + 30 * MIN, null, null, 'departures'), null);
  // The other direction partial too: it joins once its own run has lasted, and the entry sums them up.
  assert.equal(feedHealthNext(p, 'partial', t + 31 * MIN, { since: t + 30 * MIN, last: t + 31 * MIN }, refused, 'arr'), undefined, "arrivals' run has not lasted");
  const both = feedHealthNext(p, 'partial', t + 33 * MIN, { since: t + 30 * MIN, last: t + 33 * MIN }, refused, 'arr');
  assert.deepEqual(both, { state: 'partial', since: t, oks: 0, okAt: null, day: '2026-10-06', failure: 'blocked',
    dirs: { dep: part(t, '2026-10-06', 'error'), arr: part(t + 30 * MIN, '2026-10-06', 'blocked') } }, 'the earliest start, the earliest day, refused if either was');
  // One direction whole again: the other stays, and the summary is its own.
  assert.deepEqual(feedHealthNext(both, 'ok', t + 40 * MIN, null, null, 'dep'),
    { state: 'partial', since: t + 30 * MIN, oks: 0, okAt: null, day: '2026-10-06', failure: 'blocked', dirs: { arr: part(t + 30 * MIN, '2026-10-06', 'blocked') } });
  assert.equal(feedHealthNext(feedHealthNext(both, 'ok', t + 40 * MIN, null, null, 'dep'), 'ok', t + 41 * MIN, null, null, 'arr'), null, 'both whole: healthy');
  // An entry with no directions recorded, or an answer naming none, ends it whole.
  const { dirs: _d, ...bare } = p;
  assert.equal(feedHealthNext(bare, 'ok', t + 30 * MIN, null, null, 'arr'), null);
  assert.equal(feedHealthNext(p, 'ok', t + 30 * MIN), null);
  // Never towards a block: a failing airport whose today answers again counts it as a good answer…
  const blocked = { state: 'blocked', since: t, oks: 0, okAt: null };
  assert.deepEqual(feedHealthNext(blocked, 'partial', t + 40 * MIN, { since: t + 40 * MIN }, refused, 'dep'), { ...blocked, oks: 1, okAt: t + 40 * MIN });
  const one = { ...blocked, oks: 1, okAt: t + 40 * MIN };
  assert.equal(feedHealthNext(one, 'partial', t + 45 * MIN, { since: t + 44 * MIN, last: t + 45 * MIN }, refused, 'dep'), null, '…two of them: healthy');
  assert.deepEqual(feedHealthNext(one, 'partial', t + 45 * MIN, { since: t + 40 * MIN, last: t + 45 * MIN }, refused, 'dep'),
    { state: 'partial', since: t + 40 * MIN, oks: 0, okAt: null, day: '2026-10-06', failure: 'blocked', dirs: { dep: part(t + 40 * MIN, '2026-10-06', 'blocked') } },
    '…or partial, once that has lasted');
  // …and today itself failing replaces a partial entry only once that failure has lasted.
  assert.equal(feedHealthNext(p, 'blocked', t + 50 * MIN, { since: t + 50 * MIN }, null, 'arr'), undefined);
  assert.deepEqual(feedHealthNext(p, 'blocked', t + 53 * MIN, { since: t + 50 * MIN }, null, 'arr'), { state: 'blocked', since: t + 50 * MIN, oks: 0, okAt: null });
  // The dock lists it apart, never docked, never as failing, with its directions.
  const now = t + 60 * MIN;
  const withWhy = { ...pb, why: 'HTTP 302', dirs: { dep: part(t, '2026-10-06', 'blocked', 'HTTP 302') } };
  const r = feedAutoDocked({ feeds: { YYZ: withWhy, YOW: { state: 'blocked', since: t } } }, now);
  assert.deepEqual(r.auto, ['YOW']);
  assert.deepEqual(Object.keys(r.watch), []);
  assert.deepEqual(r.partial, { YYZ: { state: 'partial', since: new Date(t).toISOString(), day: '2026-10-06', failure: 'blocked', why: 'HTTP 302',
    dirs: { dep: { since: new Date(t).toISOString(), day: '2026-10-06', failure: 'blocked' } } } });
});

test('a tomorrow that keeps being refused is not invisible: today stays live, feed health says "partial" with the day and since when, and it never docks or backs off', async () => {
  await world(async (W) => {
    const { feedLocalDay } = await import('../workers/fids-proxy.js');
    const { env, writes } = makeEnv();
    const up = { yyz: 'ok', yyzDay: { today: 'ok', tomorrow: 'radware' } };
    const f = upstream(up);
    globalThis.fetch = f;
    const t0 = W.now;
    // A Toronto board asks every two minutes for 40 minutes, now and then
    // from another colo; Pearson refuses tomorrow throughout.
    for (let m = 0; m <= 40; m += 2) {
      if (m % 10 === 8) W.colo();
      const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
      assert.equal(r.headers.get('X-Feed-State'), 'live', `minute ${m}: today is live`);
      assert.equal(r.headers.get('X-Feed-Partial'), 'later-day', `minute ${m}`);
      W.tick(2 * MIN);
    }
    const asks = f.calls.filter((c) => /day=today/.test(c)).length;
    assert.ok(asks <= 9, `today asked ${asks} times in 40 minutes: once per share interval, as when healthy`);
    assert.ok(!writes.some((w) => w.k.startsWith(FEED_FAIL_PREFIX)), 'no backoff is written');
    assert.equal(writes.filter((w) => w.k === 'feed-health').length, 1, 'feed health written once, when it had lasted');
    const e = JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds.YYZ;
    assert.deepEqual([e.state, e.since, e.day, e.failure], ['partial', t0, feedLocalDay('America/Toronto', t0, 1), 'blocked']);
    assert.match(e.why, /HTTP 302/, "the refusal's own words");
    // Forty minutes on, the dock lists it apart: not docked, not "failing".
    const dd = await (await W.get(env, makeCtx(), '/api/dry-dock')).json();
    assert.deepEqual(dd.auto, [], 'a refused tomorrow never docks the airport');
    assert.deepEqual(dd.watch, {});
    assert.deepEqual(Object.keys(dd.partial), ['YYZ']);
    assert.deepEqual([Date.parse(dd.partial.YYZ.since), dd.partial.YYZ.day, dd.partial.YYZ.failure],
      [t0, feedLocalDay('America/Toronto', t0, 1), 'blocked']);
    // Tomorrow answers again: the next whole answer clears it.
    up.yyzDay = null;
    W.tick(6 * MIN); W.colo();
    const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r.headers.get('X-Feed-Partial'), null);
    assert.ok(!('YYZ' in JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds), 'healthy again');
    assert.deepEqual((await (await W.get(env, makeCtx(), '/api/dry-dock')).json()).partial, {});
  });
});

// v24002 — health is kept per airport, answers per direction. Pearson,
// Chicago, Dublin, Salt Lake City, Sydney and Fort McMurray ask tomorrow once
// per direction, and a bot manager can refuse one ask and pass the next: the
// direction answering whole must not hide the one left partial.
test('one direction left partial while the other answers whole is still not invisible: feed health and the menu say which side, and only that side answering whole clears it', async () => {
  const { feedLocalDay } = await import('../workers/fids-proxy.js');
  const runs = [
    // [what, Pearson's answer to the departures' tomorrow, minutes between polls, which direction a poll asks first, when a poll lands in another colo]
    ['refused (302), polled every 2 minutes', 'radware', 2, ['dep', 'arr'], (m) => m % 10 === 8, 'blocked', /HTTP 302/],
    ['timed out (504), polled every minute', 'timeout', 1, ['arr', 'dep'], (m) => m % 7 === 3, 'error', /HTTP 504/]
  ];
  for (const [what, mood, every, order, colo, failure, why] of runs) {
    await world(async (W) => {
      const { env, writes } = makeEnv();
      const up = { yyz: 'ok', yyzMood: (type, day) => (type === 'DEP' && day === 'tomorrow' ? mood : null) };
      globalThis.fetch = upstream(up);
      const t0 = W.now;
      let depPartial = 0, arrPartial = 0, polls = 0;
      for (let m = 0; m <= 60; m += every) {
        if (colo(m)) W.colo();
        for (const dir of order) {
          const r = await W.get(env, makeCtx(), '/flights/yyz?direction=' + dir);
          assert.equal(r.headers.get('X-Feed-State'), 'live', `${what}, minute ${m}, ${dir}: today is live`);
          if (r.headers.get('X-Feed-Partial')) { if (dir === 'dep') depPartial++; else arrPartial++; }
        }
        polls++;
        W.tick(every * MIN);
      }
      assert.equal(depPartial, polls, what + ': every departures answer is marked partial');
      assert.equal(arrPartial, 0, what + ': no arrivals answer is');
      assert.ok(!writes.some((w) => w.k.startsWith(FEED_FAIL_PREFIX)), what + ': no backoff is written');
      assert.equal(writes.filter((w) => w.k === 'feed-health').length, 1, what + ': feed health written once, when it had lasted, and never undone by the arrivals');
      const e = JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds.YYZ;
      const tmw = feedLocalDay('America/Toronto', t0, 1);
      assert.deepEqual([e.state, e.since, e.day, e.failure, Object.keys(e.dirs)], ['partial', t0, tmw, failure, ['dep']], what);
      assert.match(e.why, why, what + ": the later day's own words");
      const dd = await (await W.get(env, makeCtx(), '/api/dry-dock')).json();
      assert.deepEqual(dd.auto, [], what + ': never docked');
      assert.deepEqual(dd.watch, {}, what + ': never read as failing');
      assert.deepEqual(Object.keys(dd.partial), ['YYZ'], what + ': listed as partial');
      assert.deepEqual(Object.keys(dd.partial.YYZ.dirs), ['dep'], what + ': the departures side');
      assert.deepEqual([Date.parse(dd.partial.YYZ.dirs.dep.since), dd.partial.YYZ.dirs.dep.day, dd.partial.YYZ.dirs.dep.failure], [t0, tmw, failure], what);
      // Tomorrow's departures answer again: the next whole DEPARTURES answer clears it.
      up.yyzMood = null;
      W.tick(6 * MIN); W.colo();
      await W.get(env, makeCtx(), '/flights/yyz?direction=arr');
      assert.ok('YYZ' in JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds, what + ': an arrivals answer does not clear it');
      const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
      assert.equal(r.headers.get('X-Feed-Partial'), null, what);
      assert.ok(!('YYZ' in JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds), what + ': the departures answer does: healthy again');
      assert.deepEqual((await (await W.get(env, makeCtx(), '/api/dry-dock')).json()).partial, {}, what);
    });
  }
});

test('both directions partial: each side is its own, and the airport is healthy only when both answer whole', async () => {
  await world(async (W) => {
    const { env } = makeEnv();
    const up = { yyz: 'ok', yyzDay: { today: 'ok', tomorrow: 'radware' } };
    globalThis.fetch = upstream(up);
    const t0 = W.now;
    for (let m = 0; m <= 20; m += 2) {
      await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
      await W.get(env, makeCtx(), '/flights/yyz?direction=arr');
      W.tick(2 * MIN);
    }
    const health = () => JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds.YYZ;
    assert.deepEqual(Object.keys(health().dirs).sort(), ['arr', 'dep'], 'both sides recorded');
    assert.equal(health().since, t0);
    // The departures' tomorrow answers again; the arrivals' is still refused.
    up.yyzDay = null;
    up.yyzMood = (type, day) => (type === 'ARR' && day === 'tomorrow' ? 'radware' : null);
    W.tick(6 * MIN); W.colo();
    await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    await W.get(env, makeCtx(), '/flights/yyz?direction=arr');
    assert.deepEqual(Object.keys(health().dirs), ['arr'], 'departures whole: only the arrivals side is left');
    assert.equal(health().state, 'partial');
    const dd = await (await W.get(env, makeCtx(), '/api/dry-dock')).json();
    assert.deepEqual(Object.keys(dd.partial.YYZ.dirs), ['arr']);
    // …and the arrivals' too.
    up.yyzMood = null;
    W.tick(6 * MIN); W.colo();
    await W.get(env, makeCtx(), '/flights/yyz?direction=arr');
    assert.ok(!('YYZ' in JSON.parse(env.FIDS_USERS.m.get('feed-health').v).feeds), 'both whole: healthy');
  });
});

test('the menu shows an airport served partial: which day, refused or failing, since when, and that today is live and nothing is docked', () => {
  const MENU = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'menu.js'), 'utf8');
  const src = (name) => {
    const i = MENU.indexOf('function ' + name + '(');
    assert.ok(i >= 0, name);
    let d = 0, j = MENU.indexOf('{', i);
    for (; j < MENU.length; j++) { if (MENU[j] === '{') d++; else if (MENU[j] === '}' && --d === 0) break; }
    return MENU.slice(i, j + 1);
  };
  const box = { innerHTML: '' };
  const render = new Function('document', 'docked', 'partial', 'watch',
    'var _ddDocked = docked, _ddAuto = [], _ddAutoInfo = {}, _ddWatch = watch, _ddPartial = partial;\n'
    + src('_ddHhmm') + '\n' + src('_ddCodeSafe') + '\n' + src('_ddRender') + '\nreturn _ddRender;');
  const doc = { getElementById: (id) => (id === 'ddList' ? box : null) };
  render(doc, [], { YYZ: { state: 'partial', since: '2026-10-05T23:10:00Z', day: '2026-10-06', failure: 'blocked' } }, {})();
  assert.match(box.innerHTML, /YYZ<span[^>]*>tomorrow \(2026-10-06\) blocked since \d\d:\d\d — today live, not docked<\/span>/);
  assert.doesNotMatch(box.innerHTML, /feed failing|feed blocked|docks itself/, 'never read as a failing feed');
  // Which side, when only one is partial; no prefix when both are, or the worker names none.
  render(doc, [], { YYZ: { state: 'partial', since: '2026-10-05T23:10:00Z', day: '2026-10-06', failure: 'blocked', dirs: { dep: {} } } }, {})();
  assert.match(box.innerHTML, /YYZ<span[^>]*>departures: tomorrow \(2026-10-06\) blocked since/);
  render(doc, [], { YYZ: { state: 'partial', since: '2026-10-05T23:10:00Z', day: '2026-10-06', failure: 'error', dirs: { arr: {} } } }, {})();
  assert.match(box.innerHTML, /YYZ<span[^>]*>arrivals: tomorrow \(2026-10-06\) failing since/);
  render(doc, [], { YYZ: { state: 'partial', since: '2026-10-05T23:10:00Z', day: '2026-10-06', failure: 'error', dirs: { arr: {}, dep: {} } } }, {})();
  assert.match(box.innerHTML, /YYZ<span[^>]*>tomorrow \(2026-10-06\) failing since/);
  render(doc, [], { YYZ: { state: 'partial', day: '2026-10-06', failure: 'error', dirs: { '<b>': {} } } }, {})();
  assert.doesNotMatch(box.innerHTML, /<b>/, 'a direction is one of two words, never printed as given');
  render(doc, [], { 'X"><b>': { day: '<i>', failure: 'error' } }, {})();
  assert.doesNotMatch(box.innerHTML, /<b>|<i>/, 'codes and days are checked before they are printed');
  assert.match(MENU, /_ddPartial = \(doc\.partial && typeof doc\.partial === 'object'\) \? doc\.partial : \{\};/, 'read from the dock answer');
});

test('/fararr: a far end with only its tomorrow missing is unavailable for a flight that would land on that tomorrow, and still answers for today', async () => {
  // 22:30 in Toronto: Pearson's today runs to midnight, 90 minutes on.
  await world(async (W) => {
    const { env } = makeEnv();
    const up = { yyz: 'ok' };
    globalThis.fetch = upstream(up);
    const now = W.now;
    const midnight = Date.parse('2026-10-05T04:00:00Z');
    const ask = async (f, depTs) => (await W.get(env, makeCtx(), `/fararr?f=${f}&to=YYZ&from=YUL&dep=${depTs}`)).json();
    // The fake's rows: today's AC100–AC103 every 20 min from now; "tomorrow's" AC110–AC113 from 01:50.
    const ac111 = now + 11 * 20 * MIN;
    assert.ok(ac111 > midnight);
    const whole = await ask('AC111', ac111 - 80 * MIN);
    assert.deepEqual([whole.found, whole.schedTs], [true, ac111], 'tomorrow answered: its row is found');
    // Pearson refuses tomorrow (and, in a second round, times it out).
    for (const mood of ['radware', 'timeout']) {
      up.yyzDay = { today: 'ok', tomorrow: mood };
      W.colo();
      assert.deepEqual(await ask('AC111', ac111 - 80 * MIN), { f: 'AC111', to: 'YYZ', from: 'YUL', found: false, unavailable: true },
        `${mood}: a flight landing on the missing tomorrow is unavailable, never "no such flight"`);
      const a101 = await ask('AC101', now + 20 * MIN - 80 * MIN);
      assert.deepEqual([a101.found, a101.schedTs], [true, now + 20 * MIN], `${mood}: a flight landing today is found`);
      assert.deepEqual(await ask('AC999', now - 120 * MIN), { f: 'AC999', to: 'YYZ', from: 'YUL', found: false },
        `${mood}: a window that closes before midnight with no row is still "no such flight"`);
      assert.deepEqual(await ask('AC998', now), { f: 'AC998', to: 'YYZ', from: 'YUL', found: false, unavailable: true },
        `${mood}: a window reaching past midnight with no row is unavailable`);
    }
    // Today refused: the whole far end is unavailable, as before.
    up.yyzDay = { today: 'radware', tomorrow: 'ok' };
    W.colo();
    assert.equal((await ask('AC101', now + 20 * MIN - 80 * MIN)).unavailable, true);
  }, Date.parse('2026-10-05T02:30:00Z'));
});

test('/fararr reads every far end by the board\'s rule: a failed or refused today (or yesterday) is unavailable — Chicago, Zürich, Salt Lake City and Fort McMurray included — and a missing tomorrow says when it begins', async () => {
  const { farArrList, farArrOnMissingDay, feedDayStartMs } = await import('../workers/fids-proxy.js');
  const cases = [
    // [far end, failing part, clock, expect: null (unavailable) | the missing day's start]
    ['ord', 'ord-today', Date.parse('2026-09-05T17:00:00Z'), null, 'Chicago: "Today" refused — it used to answer with "Tomorrow" alone'],
    ['ord', 'ord-tomorrow', Date.parse('2026-09-05T17:00:00Z'), null, 'Chicago pre-roll: "Tomorrow" is the calendar today, and a 500'],
    ['ord', 'ord-tomorrow', Date.parse('2026-09-04T10:00:00Z'), ['America/Chicago', '2026-09-05'], 'Chicago rolled: tomorrow a 500'],
    ['ord', 'ord-tomorrow-blocked', Date.parse('2026-09-04T10:00:00Z'), ['America/Chicago', '2026-09-05'], 'Chicago rolled: tomorrow refused'],
    ['zrh', 'zrh-yesterday-blocked', Date.parse('2026-09-06T23:30:00Z'), null, "Zürich: yesterday's file refused — it used to answer without it"],
    ['zrh', 'zrh-tomorrow', Date.parse('2026-09-06T14:00:00Z'), ['Europe/Zurich', '2026-09-07'], "Zürich: tomorrow's file a 502"],
    ['slc', 'slc-today-blocked', Date.parse('2026-09-05T17:00:00Z'), null, "Salt Lake City: today's page refused — it used to answer with tomorrow alone"],
    ['slc', 'slc-tomorrow-500', Date.parse('2026-09-05T17:00:00Z'), ['America/Denver', '2026-09-06'], "Salt Lake City: tomorrow's page a 500"],
    ['ymm', 'ymm-today', Date.parse('2026-09-06T14:00:00Z'), null, "Fort McMurray: today's file refused — it used to answer with tomorrow alone"],
    ['ymm', 'ymm-tomorrow-blocked', Date.parse('2026-09-06T14:00:00Z'), ['America/Edmonton', '2026-09-07'], "Fort McMurray: tomorrow's file refused"],
    ['dub', 'dub-page2', Date.parse('2026-09-05T17:00:00Z'), null, "Dublin: today's second page refused"],
    ['dub', 'dub-tomorrow-500', Date.parse('2026-09-05T17:00:00Z'), ['Europe/Dublin', '2026-09-06'], "Dublin: tomorrow's first page a 500"],
    ['syd', 'syd-today-dom-blocked', Date.parse('2026-09-15T09:00:00+10:00'), null, "Sydney: today's domestic slice refused"],
    ['syd', 'syd-tomorrow-dom', Date.parse('2026-09-15T09:00:00+10:00'), ['Australia/Sydney', '2026-09-16'], "Sydney: tomorrow's domestic slice a 502"]
  ];
  for (const [code, part, clock, expect, what] of cases) {
    await world(async (W) => {
      const bad = { v: null };
      globalThis.fetch = partsUpstream(bad);
      const whole = {};
      const all = await farArrList(code, {}, whole);
      assert.ok(Array.isArray(all) && all.length > 0, what + ': the whole list has rows');
      assert.equal(whole.missingFrom, undefined, what + ': nothing missing when every part answered');
      bad.v = part;
      W.colo();
      const info = {};
      const rows = await farArrList(code, {}, info);
      if (expect === null) {
        assert.equal(rows, null, what + ': unavailable');
      } else {
        assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length < all.length, `${what}: today's rows (${rows && rows.length} of ${all.length})`);
        assert.equal(info.missingFrom, feedDayStartMs(expect[0], expect[1]), what + ': the missing day begins at its midnight');
        assert.equal(info.missingDay, expect[1]);
        assert.ok(rows.every((e) => e.s < info.missingFrom || code === 'ord' || code === 'zrh'), what + ': every row is before it');
      }
    }, clock);
  }
  // The rule itself.
  const m0 = Date.parse('2026-10-05T04:00:00Z');
  assert.equal(farArrOnMissingDay(null, null, 'YUL', m0 - 60 * MIN, 'yyz'), false, 'a whole list: no pick is "no such flight"');
  assert.equal(farArrOnMissingDay({ s: m0 - MIN }, m0, 'YUL', m0 - 90 * MIN, 'yyz'), false, 'a pick before midnight stands');
  assert.equal(farArrOnMissingDay({ s: m0 }, m0, 'YUL', m0 - 90 * MIN, 'yyz'), true, 'a pick on the missing day cannot be told from it');
  assert.equal(farArrOnMissingDay(null, m0, 'YUL', m0 - 190 * MIN, 'yyz'), false, 'a window closing before midnight');
  assert.equal(farArrOnMissingDay(null, m0, 'YUL', m0 - 180 * MIN, 'yyz'), true, 'a window reaching past it');
});

test("Chicago's roll is read against its midnight, worked out once — not a date formatted per row", () => {
  const ord = WORKER_SRC.slice(WORKER_SRC.indexOf('  ord: { tz: "America/Chicago"'), WORKER_SRC.indexOf('  phl: { tz:'));
  assert.match(ord, /const calStart = feedDayStartMs\("America\/Chicago", cal\);/);
  assert.match(ord, /parts\.every\(\(f\) => f\._authTs >= calStart\)/);
  assert.doesNotMatch(ord, /parts\.every\(\(f\) => feedLocalDay\(/);
  assert.match(WORKER_SRC, /let f = _feedDayFmt\.get\(tz\);/, 'and feedLocalDay keeps one formatter per zone');
});
