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
  feedClassifyResponse, feedClassifyBody, feedJsonEmpty, feedVerdict, feedHealthNext, feedAutoDocked,
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
      const mood = (state.yyzDay && state.yyzDay[u.searchParams.get('day')]) || state.yyz;
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
      return Response.json({ list: [0, 1, 2, 3].map((i) => pearsonRow(i, type)) });
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

test('Toronto: today refused and tomorrow answered is not a live list of tomorrow only — nor today answered and tomorrow refused', async () => {
  await world(async (W) => {
    const { env } = makeEnv();
    const up = { yyz: 'ok' };
    globalThis.fetch = upstream(up);
    const good = (await (await W.get(env, makeCtx(), '/flights/yyz?direction=dep')).json()).list;
    up.yyzDay = { today: 'radware', tomorrow: 'ok' };
    W.tick(6 * MIN); W.colo();
    const r = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r.headers.get('X-Feed-State'), 'stale', 'the last good list, marked, instead');
    assert.deepEqual((await r.json()).list, good);
    // v23998 — every day is the board: late in the evening most of the
    // window is tomorrow, and today's last hour alone reads as a quiet night.
    up.yyzDay = { today: 'ok', tomorrow: 'radware' };
    W.tick(6 * MIN); W.colo();
    const r2 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r2.headers.get('X-Feed-State'), 'stale', 'without tomorrow it is not the whole board either');
    assert.deepEqual((await r2.json()).list, good);
    up.yyzDay = null;
    W.tick(6 * MIN); W.colo();
    const r3 = await W.get(env, makeCtx(), '/flights/yyz?direction=dep');
    assert.equal(r3.headers.get('X-Feed-State'), 'live', 'both days answered: live again');
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
      return new Response(fx('ord-sample.json'), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.hostname === 'api.dublinairport.com') {
      // Dublin reads its day from the real clock (new Date()), so "today" is
      // the first day it asks for.
      const page2 = u.searchParams.has('after');
      bad.dubToday = bad.dubToday || u.searchParams.get('date');
      const today = u.searchParams.get('date') === bad.dubToday;
      if (b === 'dub-page2' && today && page2) return refuse();
      if (!today) return Response.json({ content: [], pagination: { hasNext: false } });
      return Response.json(page2 ? { content: dub.slice(10, 20), pagination: { hasNext: false } }
        : { content: dub.slice(0, 10), pagination: { hasNext: true, latestTimestamp: 'c1', latestId: 'c2' } });
    }
    if (u.hostname === 'slcairport.com') {
      // Salt Lake City reads its day from the real clock too.
      bad.slcToday = bad.slcToday || (u.searchParams.get('query_date1') || '').slice(0, 10);
      const today = (u.searchParams.get('query_date1') || '').slice(0, 10) === bad.slcToday;
      if (b === 'slc-tomorrow' && !today) return refuse();
      return new Response(fx('slc-dep-sample.html'), { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (u.hostname === 'flightdata.flughafen-zuerich.ch') {
      if (b === 'zrh-tomorrow' && u.searchParams.get('date') === '2026-09-07') return new Response('', { status: 502 });
      return new Response(fx('zrh-sample-2026-09-06.json'), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.hostname === 'flyymm.com') {
      if (b === 'ymm-today' && u.searchParams.get('dt') === '2026-09-06') return refuse();
      return new Response(fx('ymm-dep-sample.json'), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    if (u.hostname === 'flyyzf.ca') return refuse();
    if (u.hostname === 'www.dot.gov.nt.ca') return new Response(fx('yzf-dot-sample.html'), { status: 200, headers: { 'Content-Type': 'text/html' } });
    throw new Error('test: no network for ' + u.hostname);
  };
  f.calls = calls;
  return f;
}

test('a feed asked in parts is live only when every part answered: a refused part shows the last good list, marked, and never replaces it', async () => {
  const cases = [
    ['ORD', 'arr', 'ord-today', 'Chicago: "Today" behind a challenge page, "Tomorrow" answered'],
    ['ORD', 'arr', 'ord-tomorrow', 'Chicago: "Today" answered, "Tomorrow" a 500'],
    ['DUB', 'arr', 'dub-page2', "Dublin: today's second page refused"],
    ['SLC', 'dep', 'slc-tomorrow', "Salt Lake City: tomorrow's page refused"],
    ['ZRH', 'dep', 'zrh-tomorrow', "Zurich: tomorrow's day file a 502"],
    ['YMM', 'dep', 'ymm-today', "Fort McMurray: today's file refused"]
  ];
  for (const [code, dir, part, what] of cases) {
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
      assert.deepEqual(listOf(await r2.json()).map((f) => f.number + '|' + f._authTs), good, what + ': the last good list, whole');
      assert.equal(sharedRows(env, key), n, what + ': the shared copy is not replaced by the part');
      // With no good list behind it, nothing — not the part.
      W.colo();
      const fresh = makeEnv().env;
      const r3 = await W.get(fresh, makeCtx(), wideWin(code, dir));
      assert.equal(r3.status, 503, what + ': 503 with no last good list');
    }, code === 'ZRH' || code === 'YMM' ? Date.parse('2026-09-06T14:00:00Z') : Date.parse('2026-09-05T17:00:00Z'));
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
