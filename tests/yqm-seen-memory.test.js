'use strict';

// WHY THIS EXISTS
//
// v23918. Moncton's feed (cyqm.ca) drops an arrived row about an hour after the
// aeroplane lands and a departed row a few hours after it leaves. The gate maps
// draw an aeroplane only on evidence, so a screen opened in the morning had no
// evidence that last night's Porter was still on gate 3's stand: the v23915
// memory lived in each screen's own storage and only helped a screen that was
// running when the row was listed. The worker now remembers, once, for every
// screen: each row whose own status says it arrived or departed is kept in one
// small KV document per direction for 30 hours from its scheduled time, and
// every answer carries the kept rows the feed no longer lists, in cyqm's own
// row shape, marked "remembered": true.
//
// The captures are the real answers of /yqm/flights/* through the worker:
// 2026-09-28 22:22 ADT and 2026-09-30 09:08 ADT.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workerPath = path.resolve(__dirname, '..', 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(workerPath, 'utf8');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const EVENING_ARR = fixture('yqm-cyqm-2026-09-28-2222-arrivals.json');
const MORNING_ARR = fixture('yqm-cyqm-2026-09-30-0908-arrivals.json');
const MORNING_DEP = fixture('yqm-cyqm-2026-09-30-0908-departures.json');

// Moncton wall clock (ADT, UTC-3) as a real instant.
const T = (mo, d, hh, mm) => Date.UTC(2026, mo - 1, d, hh + 3, mm);

function kv(opts) {
  const o = opts || {};
  const store = new Map();
  const log = { gets: 0, puts: 0, ttl: [] };
  return {
    store, log,
    async get(k, t) {
      log.gets++;
      if (o.getThrows) throw new Error('KV down');
      const v = store.has(k) ? store.get(k) : null;
      return (v && t && t.type === 'json') ? JSON.parse(v) : v;
    },
    async put(k, v, p) {
      log.puts++;
      if (o.putThrows) throw new Error('KV down');
      store.set(k, v);
      log.ttl.push(p && p.expirationTtl);
    },
  };
}
const ctx = () => { const waits = []; return { waits, waitUntil(p) { waits.push(p); } }; };

async function worker() {
  const mod = await import(workerPath);
  mod._yqmSeenMem.arrivals = null;                 // a fresh isolate
  mod._yqmSeenMem.departures = null;
  return mod;
}

test('only the feed\'s own words are remembered: arrived / landed for arrivals, departed for departures', async () => {
  const { yqmSeenStatus } = await worker();
  for (const s of ['Arrived at 9:47 PM', 'Arrived', 'Landed', 'landed at 10:02 AM']) assert.equal(yqmSeenStatus(s), 'arrived', s);
  for (const s of ['Departed at 6:33 AM', 'Departed']) assert.equal(yqmSeenStatus(s), 'departed', s);
  for (const s of ['OnTime', 'On Time', 'Early at 10:27 AM', 'Delayed until 12:18 AM', 'Boarding', 'Final Call',
                   'Gate Closed', 'Cancelled', 'Diverted', '', null]) {
    assert.equal(yqmSeenStatus(s), '', String(s));
  }
});

test('a landing the feed dropped comes back on the end of every answer, in cyqm\'s own shape, marked', async () => {
  const { yqmWithMemory } = await worker();
  const env = { FIDS_LIVE_FLIGHTS: kv() };
  // 22:22 on Sep 28: PD2381 "Arrived at 9:47 PM" and AC2040 "Arrived" are listed.
  const first = await yqmWithMemory(env, ctx(), 'arrivals', EVENING_ARR, T(9, 28, 22, 22));
  assert.equal(first.added, 0, 'nothing to add while the feed still lists them');
  assert.equal(first.text, EVENING_ARR, 'the answer goes out exactly as cyqm sent it');
  const doc = JSON.parse(env.FIDS_LIVE_FLIGHTS.store.get('yqm:seen:v1:arrivals'));
  assert.deepEqual(Object.keys(doc.rows).sort(), ['AC2040|1790631480', 'PD2381|1790631000']);
  // 00:40: the feed has dropped both rows (what it did that night).
  const later = JSON.parse(EVENING_ARR).filter((r) => !/^Arrived/.test(r.status));
  const out = await yqmWithMemory(env, ctx(), 'arrivals', JSON.stringify(later), T(9, 29, 0, 40));
  assert.equal(out.added, 2);
  const rows = JSON.parse(out.text);
  assert.equal(rows.length, later.length + 2);
  assert.deepEqual(rows.slice(0, later.length), later, 'the feed\'s own rows first, untouched');
  const pd = rows.find((r) => r.flightId === 'PD2381' && r.remembered);
  const orig = JSON.parse(EVENING_ARR).find((r) => r.flightId === 'PD2381' && r.localTimestamp === 1790631000);
  assert.deepEqual(pd, Object.assign({}, orig, { remembered: true }), 'the same row, plus the mark');
  assert.equal(rows.filter((r) => r.remembered).length, 2);
  assert.ok(rows.every((r) => !r.remembered || /^Arrived/.test(r.status)));
});

test('a row the feed still lists is never repeated; the next day\'s same flight is another movement', async () => {
  const { yqmWithMemory } = await worker();
  const env = { FIDS_LIVE_FLIGHTS: kv() };
  await yqmWithMemory(env, ctx(), 'arrivals', EVENING_ARR, T(9, 28, 22, 22));
  const again = await yqmWithMemory(env, ctx(), 'arrivals', EVENING_ARR, T(9, 28, 22, 30));
  assert.equal(again.added, 0);
  // The same flight re-timed by a few minutes is still the same movement.
  const retimed = JSON.parse(EVENING_ARR).map((r) => (r.flightId === 'PD2381' && r.localTimestamp === 1790631000)
    ? Object.assign({}, r, { localTimestamp: r.localTimestamp + 600 }) : r);
  const r2 = await yqmWithMemory(env, ctx(), 'arrivals', JSON.stringify(retimed), T(9, 28, 22, 35));
  assert.ok(!JSON.parse(r2.text).some((r) => r.remembered && r.flightId === 'PD2381'), 'not twice');
  const doc = JSON.parse(env.FIDS_LIVE_FLIGHTS.store.get('yqm:seen:v1:arrivals'));
  assert.deepEqual(Object.keys(doc.rows).sort(), ['AC2040|1790631480', 'PD2381|1790631600'], 'kept once, as last listed');
  // Put back as first listed, for the morning below.
  await yqmWithMemory(env, ctx(), 'arrivals', EVENING_ARR, T(9, 28, 22, 40));
  // On Sep 30 the feed lists PD2381 for Sep 30 21:30 — 24 h after the kept one.
  const morning = await yqmWithMemory(env, ctx(), 'arrivals', MORNING_ARR, T(9, 29, 9, 0));
  const kept = JSON.parse(morning.text).filter((r) => r.remembered).map((r) => r.flightId + ' ' + r.dateTime);
  assert.deepEqual(kept.sort(), ['AC2040 Sep 28 - 9:38 PM', 'PD2381 Sep 28 - 9:30 PM']);
});

test('kept 30 hours from the scheduled time, then gone from the answer and from the document', async () => {
  const { yqmWithMemory } = await worker();
  const env = { FIDS_LIVE_FLIGHTS: kv() };
  await yqmWithMemory(env, ctx(), 'arrivals', EVENING_ARR, T(9, 28, 22, 22));
  const without = JSON.stringify(JSON.parse(EVENING_ARR).filter((r) => !/^Arrived/.test(r.status)));
  // PD2381 was due 21:30 Sep 28: kept to 03:30 Sep 30; AC2040 (21:38) to 03:38.
  const r1 = await yqmWithMemory(env, ctx(), 'arrivals', without, T(9, 30, 3, 29));
  assert.equal(r1.added, 2);
  const r2 = await yqmWithMemory(env, ctx(), 'arrivals', without, T(9, 30, 3, 35));
  assert.deepEqual(JSON.parse(r2.text).filter((r) => r.remembered).map((r) => r.flightId), ['AC2040']);
  const r3 = await yqmWithMemory(env, ctx(), 'arrivals', without, T(9, 30, 3, 45));
  assert.equal(r3.added, 0);
  assert.equal(r3.text, without);
  const doc = JSON.parse(env.FIDS_LIVE_FLIGHTS.store.get('yqm:seen:v1:arrivals'));
  assert.deepEqual(doc.rows, {}, 'aged-out rows are dropped from the document too');
  assert.ok(env.FIDS_LIVE_FLIGHTS.log.ttl.every((s) => s >= 30 * 3600), 'the key itself outlives its rows');
  // A row already older than 30 h is never taken in.
  const env2 = { FIDS_LIVE_FLIGHTS: kv() };
  const { yqmWithMemory: w2 } = await worker();
  await w2(env2, ctx(), 'arrivals', EVENING_ARR, T(9, 30, 3, 45));
  assert.equal(env2.FIDS_LIVE_FLIGHTS.log.puts, 0);
});

test('written only when something is new or changed; read at most once per 45 s per isolate', async () => {
  const { yqmWithMemory } = await worker();
  const env = { FIDS_LIVE_FLIGHTS: kv() };
  const t0 = T(9, 30, 9, 8);
  for (let i = 0; i < 10; i++) await yqmWithMemory(env, ctx(), 'departures', MORNING_DEP, t0 + i * 5000);
  assert.equal(env.FIDS_LIVE_FLIGHTS.log.puts, 1, 'the two departed rows were written once, not on every answer');
  assert.equal(env.FIDS_LIVE_FLIGHTS.log.gets, 2, 'ten answers in 45 s: one read, then one after the window');
  const doc = JSON.parse(env.FIDS_LIVE_FLIGHTS.store.get('yqm:seen:v1:departures'));
  assert.deepEqual(Object.keys(doc.rows).sort(), ['AC2037|1790750100', 'AC7753|1790752200']);
  // A new departure: one more write.
  const next = JSON.parse(MORNING_DEP).map((r) => (r.flightId === 'AC7995' && r.localTimestamp === 1790766900)
    ? Object.assign({}, r, { status: 'Departed at 11:20 AM', actualTime: '11:20 AM' }) : r);
  await yqmWithMemory(env, ctx(), 'departures', JSON.stringify(next), t0 + 60000);
  await yqmWithMemory(env, ctx(), 'departures', JSON.stringify(next), t0 + 65000);
  assert.equal(env.FIDS_LIVE_FLIGHTS.log.puts, 2);
  // A departures document never takes an arrival's words, nor the other way round.
  assert.ok(!env.FIDS_LIVE_FLIGHTS.store.has('yqm:seen:v1:arrivals'));
  // The write is handed to waitUntil, so the answer does not wait for it.
  const c = ctx();
  const moved = JSON.parse(MORNING_DEP).map((r) => (r.flightId === 'AC647' && r.localTimestamp === 1790770800)
    ? Object.assign({}, r, { status: 'Departed at 12:31 PM' }) : r);
  await yqmWithMemory(env, c, 'departures', JSON.stringify(moved), t0 + 70000);
  assert.equal(c.waits.length, 1);
});

test('a KV failure still answers with the upstream list, and writes nothing', async () => {
  const { yqmWithMemory } = await worker();
  const down = { FIDS_LIVE_FLIGHTS: kv({ getThrows: true }) };
  const r = await yqmWithMemory(down, ctx(), 'arrivals', EVENING_ARR, T(9, 28, 22, 22));
  assert.equal(r.text, EVENING_ARR);
  assert.equal(down.FIDS_LIVE_FLIGHTS.log.puts, 0, 'nothing written from a document that could not be read');
  // Inside the window the failed read is not retried on every request.
  await yqmWithMemory(down, ctx(), 'arrivals', EVENING_ARR, T(9, 28, 22, 22) + 20000);
  assert.equal(down.FIDS_LIVE_FLIGHTS.log.gets, 1);
  // A failing write loses nothing from the answer.
  const { yqmWithMemory: w2 } = await worker();
  const flaky = { FIDS_LIVE_FLIGHTS: kv({ putThrows: true }) };
  const c = ctx();
  const r2 = await w2(flaky, c, 'arrivals', EVENING_ARR, T(9, 28, 22, 22));
  await Promise.all(c.waits);
  assert.equal(r2.text, EVENING_ARR);
  // No binding, or a body that is not a list: passed through.
  assert.equal((await w2({}, ctx(), 'arrivals', EVENING_ARR, T(9, 28, 22, 22))).text, EVENING_ARR);
  assert.equal((await w2(flaky, ctx(), 'arrivals', '<html>blocked</html>', T(9, 28, 22, 22))).text, '<html>blocked</html>');
});

test('the /yqm/flights route answers the feed plus what it dropped; an upstream failure is still a 503', async () => {
  const mod = await worker();
  // Rows timed against the real clock: one landed two hours ago and dropped, one due later.
  const wall = Math.floor(Date.now() / 1000) + (() => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Moncton', timeZoneName: 'shortOffset' }).formatToParts(new Date());
    const m = ((p.find((x) => x.type === 'timeZoneName') || {}).value || '').match(/GMT([+-])(\d{1,2})/);
    return m ? (m[1] === '-' ? -1 : 1) * Number(m[2]) * 3600 : 0;
  })();
  const base = JSON.parse(EVENING_ARR)[0];
  const landed = Object.assign({}, base, { localTimestamp: wall - 7200, status: 'Arrived at 9:47 PM' });
  const later = Object.assign({}, base, { flightId: 'PD2373', flightNumber: '2373', localTimestamp: wall + 7200, status: 'OnTime' });
  const edge = new Map();
  globalThis.caches = { default: {
    async match(req) { return edge.has(req.url) ? new Response(edge.get(req.url)) : undefined; },
    async put(req, res) { edge.set(req.url, await res.text()); },
  } };
  const realFetch = globalThis.fetch;
  let upstream = JSON.stringify([landed, later]), ok = true;
  globalThis.fetch = async (u) => {
    assert.match(String(u), /^https:\/\/www\.cyqm\.ca\/wp-json\/ch-flight-data\/v1\/flights\/arrivals$/);
    return ok ? new Response(upstream, { status: 200 }) : new Response('blocked', { status: 403 });
  };
  try {
    const env = { FIDS_USERS: { async get() { return JSON.stringify({ username: 'admin' }); }, async put() {} }, FIDS_LIVE_FLIGHTS: kv() };
    const call = () => mod.default.fetch(new Request('https://fids-proxy.example/yqm/flights/arrivals'), env, { waitUntil() {} });
    const r1 = await call();
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('X-Feed-Remembered'), '0');
    assert.equal((await r1.json()).length, 2);
    // The feed drops the landed row; the next answer (after the edge cache) carries it back.
    edge.clear();
    upstream = JSON.stringify([later]);
    const r2 = await call();
    const rows = await r2.json();
    assert.equal(r2.headers.get('X-Feed-Remembered'), '1');
    assert.deepEqual(rows.map((r) => [r.flightId, !!r.remembered]), [['PD2373', false], ['PD2381', true]]);
    // Upstream refusing: the 503 the client falls back on, not a list made of memory.
    edge.clear();
    ok = false;
    const r3 = await call();
    assert.equal(r3.status, 503);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.caches;
  }
});

test('the route wires the memory in, guarded, and the key stays apart from the webhook cache', () => {
  assert.match(WORKER, /try \{ _mem = await yqmWithMemory\(env, ctx, _seg, _txt, Date\.now\(\)\); \} catch \(e\) \{ _mem = \{ text: _txt, added: 0 \}; \}/);
  assert.match(WORKER, /const YQM_SEEN_KEY = "yqm:seen:v1:";/);
  assert.match(WORKER, /const YQM_SEEN_READ_MS = 45000;/);
  assert.match(WORKER, /const YQM_SEEN_TTL_S = 30 \* 3600;/);
  // The AeroDataBox webhook's records live under CYQM:<dir>:… and are not touched here.
  const block = WORKER.slice(WORKER.indexOf('v23918 — WHAT MONCTON\'S FEED SAID LANDED AND LEFT'), WORKER.indexOf('__name(yqmWithMemory'));
  assert.doesNotMatch(block, /CYQM:/);
  assert.doesNotMatch(block, /\.delete\(|\.list\(/);
});
