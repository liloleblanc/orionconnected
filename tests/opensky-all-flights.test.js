'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24123 — OPENSKY IS ASKED FOR EVERY FLIGHT THE BOARD LISTS NEAR ITS MOVE.
//
// Ottawa, 2026-11-05 at 15:18 UTC: OpenSky had 45 aircraft in the airport box
// and the boards had named four flights, none of them flying; the day used
// about 600 of the licence 14,400 credits. One call answers with every
// aircraft in the box, so naming more costs nothing. Pinned here:
//   - a box holds thirty names; a relay older than v24123 (no refresh_s in
//     its report) is handed four, the most important first;
//   - /oskywant takes a board list of callsigns for its airport, our pages
//     only, untracked;
//   - the relay accepts thirty names a box, and install.sh pins it;
//   - the board names arrivals due from 10 minutes ago to 75 ahead and
//     departures from 45 ago to 20 ahead, one callsign each.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
let modP = null;
const worker = () => (modP = modP || import(pathToFileURL(path.join(ROOT, 'workers', 'fids-proxy.js')).href));
const fakeKv = () => {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, String(v)); }, async delete(k) { m.delete(k); } };
};
const ON = { OPENSKY_ON: '1', OSKY_STOP_AT: '2026-11-12T22:59:59Z' };
const ORIGIN = 'https://fids.orionconnected.com';

test('a box keeps thirty names; an older relay is handed four, the tracked first', async () => {
  const w = await worker();
  const now = Date.UTC(2026, 10, 5, 18);
  const kv = fakeKv();
  const env = { ...ON, FIDS_LIVE_FLIGHTS: kv };
  await kv.put('osky:report', JSON.stringify({ at: new Date(now).toISOString(), cap: 12000, calls_today: 100 }));
  await w.oskyBoardWant(env, kv, 'YOW', ['c:ACA446'], 2, now);
  const names = Array.from({ length: 12 }, (_, i) => 'c:POE' + (2200 + i));
  await w.oskyBoardWant(env, kv, 'YOW', names, 1, now + 1000);
  const box = Object.values(JSON.parse(await kv.get('osky:wanted')).boxes)[0];
  assert.equal(Object.keys(box.f).length, 13, 'all thirteen kept');
  // a relay that does not report its names (v24115 and older): four, the tracked one among them
  let r = await (await w.oskyWanted(kv, now + 2000)).json();
  assert.equal(r.boxes[0].callsign.length, 4);
  assert.ok(r.boxes[0].callsign.includes('ACA446'));
  // the v24115 relay reports its refresh but still takes four (live on 2026-11-05)
  await kv.put('osky:report', JSON.stringify({ at: new Date(now).toISOString(), cap: 12000, calls_today: 100, refresh_s: 30 }));
  r = await (await w.oskyWanted(kv, now + 3000)).json();
  assert.equal(r.boxes[0].callsign.length, 4);
  // the v24123 relay says it takes thirty: all thirteen
  await kv.put('osky:report', JSON.stringify({ at: new Date(now).toISOString(), cap: 12000, calls_today: 100, refresh_s: 30, names: 30 }));
  r = await (await w.oskyWanted(kv, now + 4000)).json();
  assert.equal(r.boxes[0].callsign.length, 13);
});

test('/oskywant takes a board list for its airport, our pages only', async () => {
  const w = await worker();
  const now = Date.UTC(2026, 10, 5, 18);
  const kv = fakeKv();
  await kv.put('osky:report', JSON.stringify({ at: new Date(now).toISOString(), cap: 12000, calls_today: 100, refresh_s: 30 }));
  const env = { ...ON, FIDS_LIVE_FLIGHTS: kv };
  const req = (q, origin = ORIGIN) => new Request('https://w.example/oskywant?' + q, { headers: { Origin: origin } });
  const url = (q) => new URL('https://w.example/oskywant?' + q);
  let res = await w.handleOskyWant(req('ap=YOW&cs=JZA864,ACA446,POE2217,bad!,ACA446'), env, url('ap=YOW&cs=JZA864,ACA446,POE2217,bad!,ACA446'), now);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { on: true, named: 3 });
  const box = Object.values(JSON.parse(await kv.get('osky:wanted')).boxes)[0];
  assert.deepEqual(Object.keys(box.f).sort(), ['c:ACA446', 'c:JZA864', 'c:POE2217']);
  assert.deepEqual(box.p, {}, 'a board list is untracked');
  res = await w.handleOskyWant(req('ap=YOW&cs=ACA446', 'https://evil.example'), env, url('ap=YOW&cs=ACA446'), now);
  assert.equal(res.status, 403);
  res = await w.handleOskyWant(req('ap=XXX&cs=ACA446'), env, url('ap=XXX&cs=ACA446'), now);
  assert.equal(res.status, 400);
  res = await w.handleOskyWant(req('ap=YOW&cs=ACA446'), { FIDS_LIVE_FLIGHTS: kv }, url('ap=YOW&cs=ACA446'), now);
  assert.deepEqual(await res.json(), { on: false });
});

test('the relay takes thirty names a box, and install.sh pins that file', () => {
  const R = fs.readFileSync(path.join(ROOT, 'stream-server', 'opensky-relay', 'relay.py'));
  assert.match(R.toString(), /^MAX_FILTER_VALUES = 30 /m);
  assert.match(R.toString(), /\('names', str\(MAX_FILTER_VALUES\)\)/, 'and says so in its heartbeat');
  const W = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');
  assert.match(W, /names: oskyInt\(q\.get\("names"\), 0, 1000\)/);
  const pin = (fs.readFileSync(path.join(ROOT, 'stream-server', 'opensky-relay', 'install.sh'), 'utf8').match(/RELAY_SHA256="([0-9a-f]{64})"/) || [])[1];
  assert.equal(pin, crypto.createHash('sha256').update(R).digest('hex'));
});

test('the board names its arrivals and departures near their move, one callsign each', () => {
  const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
  const a = CORE.indexOf('\nfunction _oskyWantNames(') + 1;
  const src = CORE.slice(a, CORE.indexOf('\n}\n', a) + 2);
  const names = new Function('_operatorCallsigns', '_icaoCallsign', src + 'return _oskyWantNames;')(
    (op, fn) => (op === 'QK' && /^AC8\d{3}$/.test(fn) ? ['JZA' + fn.slice(3)] : []),
    (fn) => (/^AC\d+$/.test(fn) ? 'ACA' + fn.slice(2) : /^PD\d+$/.test(fn) ? 'POE' + fn.slice(2) : ''));
  const now = Date.UTC(2026, 10, 5, 18);
  const M = 60000;
  const arr = [
    { flight: 'AC8864', _opCode: 'QK', _sortTs: now + 30 * M },   // Jazz: JZA864
    { flight: 'AC446', _sortTs: now + 70 * M },
    { flight: 'PD2332', _sortTs: now + 90 * M },                 // too far ahead
    { flight: 'PD2217', _sortTs: now - 15 * M },                 // landed a while ago
    { flight: 'AC450', _sortTs: now + 200 * M, _revTs: now + 40 * M },  // revised time counts
  ];
  assert.deepEqual(names(arr, now, 10, 75, []), ['JZA864', 'ACA446', 'ACA450']);
  const dep = [{ flight: 'PD154', _sortTs: now - 30 * M }, { flight: 'AC447', _sortTs: now + 25 * M }];
  assert.deepEqual(names(dep, now, 45, 20, []), ['POE154']);
  assert.match(CORE, /_oskyWantNames\(_gateFeedRows\('arr'\) \|\| \[\], now, 10, 75, names\);/);
  assert.match(CORE, /_oskyWantNames\(_gateFeedRows\('dep'\) \|\| \[\], now, 45, 20, names\);/);
});
