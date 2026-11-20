'use strict';

// WHY THIS EXISTS
//
// v24169. A gate screen asks Flightradar24 only about the inbound of the
// departure it shows now. At Moncton gate 4 on 2026-11-19 the gate showed
// AC1983 (05:00) all evening, so AC2040 (for AC2037 at 06:20) and AC7754 (for
// AC7753 at 07:10) were never looked up while they flew, and parked with the
// transponder off FR24 cannot see them: AC7754 had no acmem record in 29
// days. Approved 2026-11-20 as a swap: the worker asks FR24 once per arriving
// aircraft, for every screen (yqmArrSweep), paid for by cutting repeat
// empty answers. These pin the sweep: the 10 to 40 minute window, once per
// leg, one retry at most, never after landing, the budget gates of /adsb/, a
// fresh shared answer used instead of a call, the lock, and the counts.
//
// Nothing here reaches the network: fetch is stubbed (FR24 and cyqm.ca
// answer fixtures), KV and the edge cache are in-memory maps, and the clock
// is pinned.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const workerPath = path.join(__dirname, '..', 'workers', 'fids-proxy.js');
const load = () => import(pathToFileURL(workerPath).href);

// 2026-11-20 03:00 UTC = 23:00 AST on the 19th: the evening of the case.
const T0 = Date.UTC(2026, 10, 20, 3, 0);

function world(answers) {
  const store = new Map();
  const reads = [], writes = [];
  const kv = {
    async get(k, o) { reads.push(k); const v = store.has(k) ? store.get(k) : null; return (v != null && o && o.type === 'json') ? JSON.parse(v) : v; },
    async put(k, v) { writes.push(k); store.set(k, String(v)); },
  };
  // the edge cache keeps an answer for its max-age, as Cloudflare does
  const edge = new Map();
  const cache = {
    async match(req) {
      const v = edge.get(req.url);
      if (!v || Date.now() >= v.until) return undefined;
      return new Response(v.body, { headers: v.headers });
    },
    async put(req, res) {
      const m = String(res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/);
      edge.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers), until: Date.now() + (m ? Number(m[1]) : 0) * 1000 });
    },
  };
  const asked = [];
  const fetchStub = async (url) => {
    const u = String(url);
    const m = u.match(/^https:\/\/fr24api\.flightradar24\.com\/api\/live\/flight-positions\/full\?flights=([A-Z0-9]+)$/);
    if (!m) throw new Error('no network in this test: ' + u);
    asked.push(m[1]);
    if (w.onFetch) w.onFetch(m[1]);
    const a = answers[m[1]];
    if (a === 'throw') throw new Error('FR24 unreachable (fixture)');
    if (typeof a === 'number') return new Response('{}', { status: a });
    return new Response(JSON.stringify({ data: a || [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const w = {};
  const waits = [];
  const ctx = { waitUntil(p) { waits.push(Promise.resolve(p).catch(() => {})); } };
  const env = {
    FR24_KEY: 'test-key', FR24_DAILY_BUDGET: '1440', FIDS_LIVE_FLIGHTS: kv,
    FIDS_USERS: { async get() { return JSON.stringify({ username: 'admin' }); }, async put() {} },
  };
  return Object.assign(w, { store, reads, writes, edge, cache, asked, fetchStub, ctx, env, waits,
    settle: async () => { while (waits.length) await waits.shift(); },
    unlock: () => { store.delete('arrsweep:lock:v1'); edge.delete('https://arrsweep-lock/v1'); } });
}

// A cyqm.ca arrivals row, due `mins` from the pinned clock (wall-clock frame).
function row(w, flight, mins, status, actualShiftMin) {
  const ts = Math.floor((w + mins * 60) / 60) * 60;
  const clock = (s) => {
    const d = new Date(s * 1000);
    const h = d.getUTCHours(), mm = String(d.getUTCMinutes()).padStart(2, '0');
    return ((h % 12) || 12) + ':' + mm + ' ' + (h < 12 ? 'AM' : 'PM');
  };
  const r = { flightId: flight, airlineCode: flight.slice(0, 2), flightNumber: flight.slice(2), airportCode: 'YOW',
    localTimestamp: ts, scheduledTime: clock(ts), gate: '4', status: status || 'On Time', actualTime: clock(ts) };
  if (actualShiftMin) r.actualTime = clock(ts + actualShiftMin * 60);
  return r;
}
const pos = (flight, cs, reg, type) => ({ flight, callsign: cs, reg, type, lat: 45.8, lon: -65.6, alt: 9000,
  gspeed: 260, track: 80, vspeed: -800, timestamp: new Date(T0).toISOString() });

async function withWorld(answers, fn) {
  const w = world(answers);
  const realFetch = globalThis.fetch, realNow = Date.now;
  globalThis.fetch = w.fetchStub;
  globalThis.caches = { default: w.cache };
  let now = T0;
  Date.now = () => now;
  w.at = (min) => { now = T0 + min * 60000; return now; };
  try {
    const mod = await load();
    mod.yqmArrSweepReset();   // each case starts as a fresh isolate
    w.mod = mod;
    w.wall = mod.yqmMonctonWallS(T0);
    await fn(w, mod);
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
    delete globalThis.caches;
  }
}

test('the window: due 10 to 40 minutes out by its expected time, never cancelled, diverted, landed or arrived', async () => {
  const mod = await load();
  const realNow = Date.now;
  Date.now = () => T0;
  try {
    const w = mod.yqmMonctonWallS(T0);
    assert.equal(w - Math.floor(T0 / 1000), -4 * 3600, 'Moncton wall clock in November is UTC-4 (AST)');
    const list = [
      row(w, 'AC1001', 5), row(w, 'AC1002', 10), row(w, 'AC1003', 25), row(w, 'AC1004', 40), row(w, 'AC1005', 45),
      row(w, 'AC1006', 20, 'Cancelled'), row(w, 'AC1007', 20, 'Diverted'), row(w, 'AC1008', 20, 'Landed'),
      row(w, 'AC1009', 20, 'Arrived at 11:14 PM'), Object.assign(row(w, 'AC1010', 20), { remembered: true }),
      row(w, 'AC1011', 55, 'Early at 11:30 PM', -25),   // scheduled 55 out, expected 30 out
      row(w, 'AC1012', 20, 'Delayed', 30),              // scheduled 20 out, expected 50 out
    ];
    const got = mod.yqmArrSweepLegs(list, T0).map((l) => l.flight);
    assert.deepEqual(got, ['AC1002', 'AC1003', 'AC1004', 'AC1011']);
    const l = mod.yqmArrSweepLegs([list[10]], T0)[0];
    assert.equal(l.sched, list[10].localTimestamp, 'the record is keyed by the scheduled time');
    assert.equal(l.left, 30 * 60);
  } finally { Date.now = realNow; }
});

test('AC7754 at 25 minutes out: asked once through /adsb/, answer shared and remembered, then never again', async () => {
  await withWorld({ AC7754: [pos('PB7754', 'PVL7754', 'C-GPOJ', 'DH8D')] }, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC7754', 25)]);
    const r1 = await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    assert.deepEqual(w.asked, ['AC7754'], 'one FR24 call, by the number sold');
    assert.deepEqual([r1.ran, r1.asked, r1.found], [true, 1, 1]);
    const sched = JSON.parse(text)[0].localTimestamp;
    const rec = JSON.parse(w.store.get(`arrsweep:v1:AC7754:${sched}`));
    assert.deepEqual([rec.attempts, rec.found], [1, true]);
    const shared = JSON.parse(w.store.get('adsbans:v1:flight:AC7754'));
    assert.equal(JSON.parse(shared.body).ac[0].r, 'C-GPOJ', 'the answer every screen reads');
    // acmem under the number asked as well as FR24 own PB7754 (as a screen lookup files it)
    assert.equal(JSON.parse(w.store.get('acmem:v1:AC7754')).obs.slice(-1)[0].r, 'CGPOJ');
    assert.ok(w.store.has('acmem:v1:PB7754'));
    // the next minute, and the one after: nothing more
    for (const m of [1, 12, 20]) {
      w.at(m); w.unlock();
      await mod.yqmArrSweep(w.env, w.ctx, text);
      await w.settle();
    }
    assert.equal(w.asked.length, 1, 'once per leg');
    assert.equal(w.store.get('feeds:n:fr24:sweep_asked:2026-11-20'), '1');
    assert.equal(w.store.get('feeds:n:fr24:sweep_found:2026-11-20'), '1');
  });
});

test('an empty first answer allows one retry, at least 10 minutes later and before landing, never a third', async () => {
  await withWorld({ AC2040: [] }, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC2040', 38)]);
    await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    assert.deepEqual(w.asked, ['AC2040']);
    // 5 minutes on: too soon (and the quiet answer is still shared)
    w.at(5); w.unlock();
    await mod.yqmArrSweep(w.env, w.ctx, text);
    assert.equal(w.asked.length, 1, 'not within 10 minutes');
    // 11 minutes on, 27 minutes out: the one retry
    w.at(11); w.unlock();
    await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    assert.equal(w.asked.length, 2, 'the retry');
    // 22 minutes on, 16 minutes out: no third ask
    w.at(22); w.unlock();
    await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    assert.equal(w.asked.length, 2, 'never more than two');
    const sched = JSON.parse(text)[0].localTimestamp;
    const rec = JSON.parse(w.store.get(`arrsweep:v1:AC2040:${sched}`));
    assert.deepEqual([rec.attempts, rec.asks, rec.found], [2, 2, false]);
    assert.equal(w.store.get('feeds:n:fr24:sweep_asked:2026-11-20'), '2');
    assert.equal(w.store.get('feeds:n:fr24:sweep_found:2026-11-20'), undefined);
  });
});

test('a row that is not the flight, or has no tail, is not found and gets its retry', async () => {
  await withWorld({ AC2046: [pos('XX999', 'TBM999', 'C-FPPI', 'TBM8')] }, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC2046', 30)]);
    const r = await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    assert.deepEqual([r.asked, r.found], [1, 0]);
    const rec = JSON.parse(w.store.get(`arrsweep:v1:AC2046:${JSON.parse(text)[0].localTimestamp}`));
    assert.deepEqual([rec.attempts, rec.found], [1, false]);
    assert.ok(!w.store.has('acmem:v1:AC2046'), 'a stray row is never remembered');
  });
});

test('never after landing: a landed or arrived row, or one under 10 minutes out, is never asked', async () => {
  await withWorld({}, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC7760', 20, 'Landed'), row(w.wall, 'AC7762', 20, 'Arrived'),
      row(w.wall, 'AC7764', 8), row(w.wall, 'AC7766', 20, 'Cancelled')]);
    const r = await mod.yqmArrSweep(w.env, w.ctx, text);
    assert.deepEqual(w.asked, []);
    assert.equal(r.legs, 0);
    assert.deepEqual(w.reads, [], 'no row in the window: no KV read');
    assert.deepEqual(w.writes, [], 'and no KV write, not even the lock');
  });
});

test('the FR24 budget gates of /adsb/ decide: over the cap, in a cool-off, or a 402, nothing is spent on the leg', async () => {
  await withWorld({ AC7770: [pos('PB7770', 'PVL7770', 'C-GPAL', 'DH8C')], AC7772: 402 }, async (w, mod) => {
    const day = '2026-11-20';
    const text = JSON.stringify([row(w.wall, 'AC7770', 25)]);
    const sched = JSON.parse(text)[0].localTimestamp;
    // the paced allowance spent
    w.store.set(`fr24:used:${day}`, '1440');
    await mod.yqmArrSweep(w.env, w.ctx, text);
    assert.deepEqual(w.asked, [], 'over the cap: no call');
    assert.ok(!w.store.has(`arrsweep:v1:AC7770:${sched}`), 'and no attempt spent');
    // a cool-off
    w.store.set(`fr24:used:${day}`, '0');
    w.store.set(`fr24:cool:${day}`, String(T0 + 120000));
    w.at(1); w.unlock(); w.edge.clear();
    await mod.yqmArrSweep(w.env, w.ctx, text);
    assert.deepEqual(w.asked, [], 'in a cool-off: no call');
    assert.ok(!w.store.has(`arrsweep:v1:AC7770:${sched}`));
    // gates open: asked
    w.at(4); w.unlock(); w.edge.clear();
    await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    assert.deepEqual(w.asked, ['AC7770']);
    // an empty pool (402): the call is counted as an ask, not an attempt
    const t2 = JSON.stringify([row(w.wall, 'AC7772', 30)]);
    w.at(5); w.unlock(); w.edge.clear();
    await mod.yqmArrSweep(w.env, w.ctx, t2);
    await w.settle();
    assert.deepEqual(w.asked, ['AC7770', 'AC7772']);
    const r402 = JSON.parse(w.store.get(`arrsweep:v1:AC7772:${JSON.parse(t2)[0].localTimestamp}`));
    assert.deepEqual([r402.attempts, r402.asks], [0, 1], 'a refusal spends no attempt, but it is an ask');
    assert.ok(Number(w.store.get(`fr24:cool:${day}`)) >= T0 + 3600000, 'the 402 pause is set, as /adsb/ sets it');
  });
});

test('a fresh shared answer with a tail is used: found, and FR24 is not asked', async () => {
  await withWorld({}, async (w, mod) => {
    const body = JSON.stringify({ ac: [{ flight: 'ROU2048', r: 'C-GEHV', t: 'A320', lat: 45.9, lon: -66.0, seen_pos: 3 }], _provider: 'fr24' });
    w.store.set('adsbans:v1:flight:AC2048', JSON.stringify({ at: T0 - 60000, body }));
    const text = JSON.stringify([row(w.wall, 'AC2048', 22)]);
    const r = await mod.yqmArrSweep(w.env, w.ctx, text);
    assert.deepEqual(w.asked, [], 'no FR24 call');
    assert.equal(r.asked, 0);
    const rec = JSON.parse(w.store.get(`arrsweep:v1:AC2048:${JSON.parse(text)[0].localTimestamp}`));
    assert.deepEqual([rec.attempts, rec.found, rec.via], [0, true, 'shared']);
    assert.equal(w.store.get('feeds:n:fr24:sweep_shared:2026-11-20'), '1', 'counted as found in a shared answer');
    assert.equal(r.shared, 1);
    // a fresh quiet answer is no tail: no call now, no attempt (an ask, and the leg waits 10 minutes)
    w.store.set('adsbans:v1:flight:AC2050', JSON.stringify({ at: T0 - 60000, quiet: true, body: JSON.stringify({ ac: [], _provider: 'fr24', _quiet: true }) }));
    const t2 = JSON.stringify([row(w.wall, 'AC2050', 22)]);
    w.unlock();
    await mod.yqmArrSweep(w.env, w.ctx, t2);
    assert.deepEqual(w.asked, []);
    const q = JSON.parse(w.store.get(`arrsweep:v1:AC2050:${JSON.parse(t2)[0].localTimestamp}`));
    assert.deepEqual([q.attempts, q.asks, q.found], [0, 1, false]);
  });
});

test('the lock: however many screens ask in a minute, the sweep runs once', async () => {
  await withWorld({ AC8540: [], AC8542: [] }, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC8540', 25)]);
    const r1 = await mod.yqmArrSweep(w.env, w.ctx, text);
    assert.equal(r1.ran, true);
    // another screen, another leg now in the window, same minute: locked here
    const t2 = JSON.stringify([row(w.wall, 'AC8540', 25), row(w.wall, 'AC8542', 30)]);
    const r2 = await mod.yqmArrSweep(w.env, w.ctx, t2);
    assert.equal(r2.ran, false, 'the edge lock');
    // another location (no edge copy), same minute: the KV lock
    w.edge.clear();
    const r3 = await mod.yqmArrSweep(w.env, w.ctx, t2);
    assert.equal(r3.ran, false, 'the KV lock');
    await w.settle();
    assert.deepEqual(w.asked, ['AC8540']);
    // a minute on: the new leg is asked
    w.at(1); w.edge.clear();
    const r4 = await mod.yqmArrSweep(w.env, w.ctx, t2);
    await w.settle();
    assert.equal(r4.ran, true);
    assert.deepEqual(w.asked, ['AC8540', 'AC8542']);
  });
});

test('/yqm/flights/arrivals runs the sweep after its answer, and /feeds/status counts it', async () => {
  await withWorld({ AC7780: [pos('PB7780', 'PVL7780', 'C-GPAM', 'DH8D')] }, async (w, mod) => {
    const list = [row(w.wall, 'AC7780', 25)];
    globalThis.fetch = async (url, init) => {
      if (/cyqm\.ca\/wp-json\/ch-flight-data\/v1\/flights\/arrivals/.test(String(url))) {
        return new Response(JSON.stringify(list), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return w.fetchStub(url, init);
    };
    const res = await mod.default.fetch(new Request('https://fids-proxy.example/yqm/flights/arrivals'), w.env, w.ctx);
    assert.equal(res.status, 200);
    assert.equal((await res.json())[0].flightId, 'AC7780', 'the answer is unchanged');
    await w.settle();
    assert.deepEqual(w.asked, ['AC7780']);
    // departures never sweep
    await mod.default.fetch(new Request('https://fids-proxy.example/yqm/flights/departures'), w.env, w.ctx);
    await w.settle();
    assert.deepEqual(w.asked, ['AC7780']);
    const s = await mod.feedStatus(w.env, T0);
    const fr = s.counts_utc_day['2026-11-20'].fr24;
    assert.deepEqual([fr.sweep_asked, fr.sweep_found], [1, 1]);
    assert.equal(fr.answers_with_position, 1, 'and it counts as an FR24 answer like any other');
  });
});

// ── Review of 2026-11-20 ──────────────────────────────────────────────────

// Run the sweep once a minute from `from` to `to` (inclusive), as the screens
// polling the list do, the lock released between runs.
async function everyMinute(w, mod, text, from, to) {
  for (let m = from; m <= to; m++) {
    w.at(m); w.unlock();
    await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
  }
}

test('an FR24 error or a fetch that throws is an attempt: two at most per leg, never one a minute', async () => {
  await withWorld({ AC7790: 500, AC7792: 'throw' }, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC7790', 40), row(w.wall, 'AC7792', 40)]);
    await everyMinute(w, mod, text, 0, 31);
    assert.deepEqual(w.asked.filter((f) => f === 'AC7790'), ['AC7790', 'AC7790'], 'a 500: two attempts, 10 minutes apart');
    assert.deepEqual(w.asked.filter((f) => f === 'AC7792'), ['AC7792', 'AC7792'], 'a thrown fetch: the same');
    for (const f of ['AC7790', 'AC7792']) {
      const rec = JSON.parse(w.store.get(`arrsweep:v1:${f}:${JSON.parse(text)[0].localTimestamp}`));
      assert.deepEqual([rec.attempts, rec.asks, rec.found], [2, 2, false], f);
    }
  });
});

test('refusals (429) are asks: four at most per leg over the whole window, 10 minutes apart', async () => {
  await withWorld({ AC7794: 429 }, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC7794', 40)]);
    const at = [];
    w.onFetch = () => at.push(Math.round((Date.now() - T0) / 60000));
    await everyMinute(w, mod, text, 0, 31);
    assert.deepEqual(at, [0, 10, 20, 30], 'four asks, 10 minutes apart, inside the window');
    const rec = JSON.parse(w.store.get(`arrsweep:v1:AC7794:${JSON.parse(text)[0].localTimestamp}`));
    assert.deepEqual([rec.attempts, rec.asks], [0, 4]);
  });
});

test('the ask is claimed in the leg record before FR24 is called', async () => {
  await withWorld({ AC7796: [] }, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC7796', 25)]);
    const key = `arrsweep:v1:AC7796:${JSON.parse(text)[0].localTimestamp}`;
    let seen = null;
    w.onFetch = () => { seen = JSON.parse(w.store.get(key) || 'null'); };
    await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    assert.deepEqual(seen && [seen.asks, seen.attempts, seen.last], [1, 0, T0], 'claimed before the call');
    // the read of the record asks for the shortest KV read cache
    const src = require('node:fs').readFileSync(workerPath, 'utf8');
    assert.match(src, /kv\.get\(key, \{ type: "json", cacheTtl: ARRSWEEP_READ_TTL_S \}\)/);
    assert.match(src, /const ARRSWEEP_READ_TTL_S = 30;/);
  });
});

test('a leg waiting out its 10 minutes costs no KV read or write', async () => {
  await withWorld({ AC7798: [] }, async (w, mod) => {
    const text = JSON.stringify([row(w.wall, 'AC7798', 38)]);
    await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    const r0 = w.reads.length, w0 = w.writes.length;
    await everyMinute(w, mod, text, 1, 9);
    assert.equal(w.reads.length, r0, 'no read while it waits');
    assert.equal(w.writes.length, w0, 'and no lock written');
    await everyMinute(w, mod, text, 10, 10);
    assert.equal(w.asked.length, 2, 'due again at 10 minutes');
  });
});

test('a shut budget gate is read once per run, writes nothing, and this location waits 2 minutes', async () => {
  await withWorld({ AC7800: [] }, async (w, mod) => {
    w.store.set('fr24:used:2026-11-20', '1440');
    const text = JSON.stringify([row(w.wall, 'AC7800', 25)]);
    const r = await mod.yqmArrSweep(w.env, w.ctx, text);
    assert.equal(r.ran, false);
    assert.deepEqual(w.asked, []);
    assert.ok(w.reads.includes('fr24:used:2026-11-20'), 'the budget is read');
    assert.deepEqual(w.writes, [], 'no lock, no record, nothing');
    const r0 = w.reads.length;
    w.at(1);
    await mod.yqmArrSweep(w.env, w.ctx, text);
    assert.equal(w.reads.length, r0, 'a minute on: this location is still waiting');
    w.at(2); w.store.set('fr24:used:2026-11-20', '0');
    await mod.yqmArrSweep(w.env, w.ctx, text);
    await w.settle();
    assert.deepEqual(w.asked, ['AC7800'], 'two minutes on, the gate open: asked');
  });
});

test('a near ask (the arrival on final) holds a quiet answer 5 minutes, every other ask 10', async () => {
  await withWorld({ AC7673: [] }, async (w, mod) => {
    const ask = async (near) => { const info = {}; await mod.adsbAnswer(w.env, w.ctx, 'flight', 'AC7673', near, '*', info); await w.settle(); return info; };
    w.at(0); assert.equal((await ask(false)).asked, true, 'a quiet answer, held 10 minutes for the rest');
    w.at(4); assert.equal((await ask(true)).cache, 'shared', 'near, 4 minutes on: the KV copy, under 5 minutes old');
    w.at(6); assert.equal((await ask(true)).asked, true, 'near, 6 minutes on: FR24 asked again');
    w.at(8); assert.ok(!(await ask(false)).asked, 'not near: the copy still holds');
    w.at(12); assert.ok(!(await ask(false)).asked, 'not near: 6 minutes after the last answer, still held');
    assert.deepEqual(w.asked, ['AC7673', 'AC7673']);
    // clean empty answers are counted apart from refusals and errors
    assert.equal(w.store.get('feeds:n:fr24:quiet:2026-11-20'), '2');
    assert.equal(w.store.get('feeds:n:fr24:empty:2026-11-20'), undefined);
  });
});
