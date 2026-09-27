'use strict';

// WHY THIS EXISTS
//
// The /adsb/ answer cache belonged to one Cloudflare location, so the stream
// box (Europe) and the screens (Canada) each paid FR24 for the same aircraft,
// and positions were re-bought every 90 s. With the paced allowance at ~80
// credits an hour for every screen together, one tracked flight cost ~4x the
// whole hourly budget and most lookups were skipped (2026-09-27: 3 flights
// had a recorded track 15 minutes after v23906 shipped). v23907 keeps every
// FR24 answer in KV for all locations and holds positions 180 s.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workerPath = path.resolve(__dirname, '..', 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(workerPath, 'utf8');

test('a position is held 180 s, a quiet answer longer', () => {
  assert.match(WORKER, /const ADSB_TTL = 180;/);
  assert.match(WORKER, /const ADSB_EMPTY_TTL = 300;/);
});

test('another location\'s answer is reused, aged, and FR24 is not called', async () => {
  const store = new Map();
  const edge = new Map();
  globalThis.caches = { default: {
    async match(req) { const v = edge.get(req.url); return v ? new Response(v) : undefined; },
    async put(req, res) { edge.set(req.url, await res.text()); },
  } };
  const realFetch = globalThis.fetch;
  let upstream = 0;
  globalThis.fetch = async () => { upstream++; throw new Error('FR24 must not be called'); };
  try {
    const mod = await import(workerPath);
    const body = JSON.stringify({ ac: [{ flight: 'WJA812', r: 'C-GWJO', t: 'B737', lat: 51.02, lon: -112.74, seen_pos: 4 }], _provider: 'fr24' });
    store.set('adsbans:v1:flight:WS812', JSON.stringify({ at: Date.now() - 60000, body }));
    // The handler seeds an admin account on every request; an existing user skips it.
    const env = { FR24_KEY: 'x', FIDS_USERS: { async get() { return JSON.stringify({ username: 'admin' }); }, async put() {} }, FIDS_LIVE_FLIGHTS: {
      async get(k, o) { const v = store.has(k) ? store.get(k) : null; return (v && o && o.type === 'json') ? JSON.parse(v) : v; },
      async put(k, v) { store.set(k, v); },
    } };
    const res = await mod.default.fetch(new Request('https://fids-proxy.example/adsb/flight/WS812'), env, { waitUntil() {} });
    assert.equal(res.headers.get('X-Adsb-Cache'), 'shared');
    const j = await res.json();
    assert.equal(j.ac[0].r, 'C-GWJO');
    assert.ok(j.ac[0].seen_pos >= 64, `seen_pos advanced by the answer's age (got ${j.ac[0].seen_pos})`);
    assert.equal(upstream, 0, 'no FR24 call');
    // too old: not reused
    store.set('adsbans:v1:flight:WS813', JSON.stringify({ at: Date.now() - 200000, body }));
    edge.clear();
    const res2 = await mod.default.fetch(new Request('https://fids-proxy.example/adsb/flight/WS813'), { ...env, FR24_KEY: '' }, { waitUntil() {} });
    assert.notEqual(res2.headers.get('X-Adsb-Cache'), 'shared', 'a stale shared answer is not served');
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.caches;
  }
});

test('every paid answer is shared: positions and "not transmitting"', () => {
  assert.match(WORKER, /ctx\.waitUntil\(env\.FIDS_LIVE_FLIGHTS\.put\(_gKey, JSON\.stringify\(\{ at: Date\.now\(\), body: _frBody \}\), \{ expirationTtl: ADSB_TTL \}\)\)/);
  assert.match(WORKER, /if \(_fr24SaidNothing && env\.FIDS_LIVE_FLIGHTS\) \{\s*try \{ ctx\.waitUntil\(env\.FIDS_LIVE_FLIGHTS\.put\(_gKey, JSON\.stringify\(\{ at: Date\.now\(\), quiet: true, body: _negBody \}\), \{ expirationTtl: ADSB_EMPTY_TTL \}\)\)/);
});
