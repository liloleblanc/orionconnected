'use strict';

// WHY THIS EXISTS
//
// The maps drew the "flown" half of the route as a straight great-circle arc
// from the airport to the aeroplane — no aeroplane flies that. v23906 records
// every FR24 position the boards already receive into the flight's track (at
// no extra credit) and the maps draw the solid line along it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workerPath = path.join(root, 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(workerPath, 'utf8');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const load = () => import(workerPath);

function fakeKv() {
  const m = new Map();
  return {
    m,
    async get(k, o) { const v = m.has(k) ? m.get(k).v : null; return (v && o && o.type === 'json') ? JSON.parse(v) : v; },
    async put(k, v, o) { m.set(k, { v, ttl: o && o.expirationTtl }); },
  };
}

test('positions append to the flight\'s own track, oldest first, without repeats', async () => {
  const { acTrackAppend } = await load();
  const kv = fakeKv(); const env = { FIDS_LIVE_FLIGHTS: kv };
  const base = { fr24_id: '3a4b5c6d', flight: 'WS812', orig_iata: 'YYC', dest_iata: 'YQM' };
  await acTrackAppend(env, { ...base, lat: 51.1256, lon: -114.0157, alt: 0, timestamp: '2026-09-27T16:13:00Z' }, 0);
  await acTrackAppend(env, { ...base, lat: 51.0260, lon: -112.7427, alt: 25425, timestamp: '2026-09-27T16:26:00Z' }, 0);
  await acTrackAppend(env, { ...base, lat: 51.0260, lon: -112.7427, alt: 25425, timestamp: '2026-09-27T16:26:00Z' }, 0);
  const rec = JSON.parse(kv.m.get('trk:v1:3a4b5c6d').v);
  assert.equal(rec.pts.length, 2, 'a repeat is not stored twice');
  assert.deepEqual(rec.pts.map((p) => p[3]), [1790525580, 1790526360], 'oldest first');
  assert.equal(rec.o, 'YYC'); assert.equal(rec.d, 'YQM');
  assert.equal(kv.m.get('trkix:v1:WS812').v, '3a4b5c6d', 'the flight number points at its current leg');
  assert.ok(kv.m.get('trk:v1:3a4b5c6d').ttl <= 30 * 86400, 'kept under FR24\'s 30-day storage cap');
});

test('the track is recorded on the FR24 hit, at no extra call, and served publicly', () => {
  const hit = WORKER.indexOf('const _frBody = JSON.stringify({ ac: [_ac], _provider: "fr24" });');
  assert.match(WORKER.slice(hit - 800, hit), /ctx\.waitUntil\(acTrackAppend\(env, _p, Date\.now\(\)\)\)/);
  const at = WORKER.indexOf('path.match(/^\\/fltrack\\/([A-Za-z0-9]{3,8})$/)');
  assert.ok(at > 0 && at < WORKER.indexOf('if (path.startsWith("/adsb/"))'), '/fltrack/ declared before /adsb/');
  assert.doesNotMatch(WORKER.slice(at, at + 2500), /fr24api\.flightradar24\.com/, 'serving a track never calls FR24');
});

test('the flown half of the route follows the recorded track when this leg has one', () => {
  assert.match(CORE, /function _gateFlownPath\(o, d, planeLat, planeLng, destIata\)/);
  assert.match(CORE, /var _legA = _flownA \|\| _gcFullRoute\(o, _pl, _vA\);/, 'the glide route');
  assert.match(CORE, /: _flownM \? L\.polyline\(_flownM,/, 'small map');
  assert.match(CORE, /: _bcFlown \? L\.polyline\(_bcFlown,/, 'big map');
});

test('a track from another leg is never drawn', () => {
  const fn = CORE.slice(CORE.indexOf('function _gateFlownPath('), CORE.indexOf('function _gateFlownPath(') + 2600);
  assert.match(fn, /_gcNm\(pts\[pts\.length - 1\], pl\) > 60\) return null;/, 'must end near the aeroplane');
  assert.match(fn, /String\(rec\.d\)\.toUpperCase\(\) !== String\(destIata\)\.toUpperCase\(\)\) return null;/, 'must be going to this airport');
  assert.match(fn, /> 0\.05\) path\.push/, 'no zero-length steps for the glide to divide by');
});
