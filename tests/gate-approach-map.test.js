'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24088 — THE APPROACH IS DRAWN WHERE THE AEROPLANE IS.
//
// Moncton gate 4, AC7894 from Toronto, 2026-10-26, about 17:29–17:33 ADT,
// photographed twice: the map held the aeroplane 16 km north of the field
// over Saint-Antoine, "Distance 20 km" both times, the altitude 361 ft and
// then 1 ft, while Flightradar24 had it at 4,300 ft (17:28:49, 19 km out) and
// 1,900 ft (17:32:56, 10 km out) on the way to runway 24.
//
//   1. A re-anchor measured the drawn spot against the fix as if the
//      aeroplane were still standing on it; a marker that had flown past an
//      old fix read as ahead, and the correction (never flown backwards)
//      stopped it. The truth is now the fix carried forward for its age.
//   2. The glide's speed profile slowed the last fifth of the ROUTE to
//      35–60 % of the aeroplane's own ground speed; now only the last 4 nm.
//   3. OpenSky answers a position up to 15 minutes old; it was published
//      over a newer Flightradar24 fix and stopped the Flightradar24 lookup.
//      An older fix never replaces a newer one, and an OpenSky position past
//      150 s asks Flightradar24 too.
//   4. A carried descent stops at a 3° path to the field.
//   5. The distance follows the drawn aeroplane every second.
//   6. The estate spends Flightradar24 to its pace line by mid-afternoon; a
//      board's own inbound in its last half hour (?near=1) keeps the last
//      stretch of the line, and its approach positions are held 90 s.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const WORKER = fs.readFileSync(path.join(__dirname, '..', 'workers', 'fids-proxy.js'), 'utf8');
function fnSource(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('no end for ' + name);
}
const YQM = [46.1122, -64.6786];
const FIX_1728 = [46.2853, -64.7096];   // Flightradar24, 17:28:49, 4,300 ft
const FIX_1732 = [46.1844, -64.5908];   // Flightradar24, 17:32:56, 1,900 ft


test('the worker keeps the last stretch of the pace line for a board\'s own arrival', () => {
  const f = new Function(fnSource(WORKER, 'fr24PacedAllowance') + '\n' + fnSource(WORKER, 'fr24NearReserve') +
    '\nreturn { paced: fr24PacedAllowance, reserve: fr24NearReserve };')();
  const cap = 1900;
  const at = (h, m) => Date.UTC(2026, 9, 26, h, m);
  // 20:30 UTC (17:30 ADT): half of what the line gives in a 90-minute window
  assert.equal(f.reserve(cap, at(20, 30)), Math.ceil(cap * 45 / 1440));
  assert.ok(f.reserve(cap, at(20, 30)) < 0.55 * cap * 90 / 1440, 'about half the window\'s supply, never the whole');
  // the first minutes of the UTC day are never held up by more than half the line
  assert.ok(f.reserve(cap, at(0, 0)) <= f.paced(cap, at(0, 0)) / 2);
  assert.match(WORKER, /const _near = url\.searchParams\.get\("near"\) === "1";/);
  assert.match(WORKER, /_used < fr24PacedAllowance\(_cap\) - \(_near \? 0 : fr24NearHeld\(_cap, _nearDoc\)\)\) \{/);
  assert.match(WORKER, /used \+ DTW_FR24_PAGE_CREDITS <= Math\.min\(cap, fr24PacedAllowance\(cap\) - fr24NearHeld\(cap, nearDoc\)\)/,
    'the bulk sweep stays behind the reserve too');
  assert.match(WORKER, /if \(_used < _cap && Date\.now\(\) >= _coolUntil/, 'the cap itself is untouched');
});

test('the arrivals\' reserve is a bucket that refills at half the line\'s rate, never snapping back', () => {
  const f = new Function('const FR24_NEAR_KEY = "fr24:nearb:v1";\n' + fnSource(WORKER, 'fr24PacedAllowance') + '\n' + fnSource(WORKER, 'fr24NearReserve') + '\n' +
    fnSource(WORKER, 'fr24NearBucket') + '\n' + fnSource(WORKER, 'fr24NearHeld') + '\nreturn { held: fr24NearHeld, bucket: fr24NearBucket, reserve: fr24NearReserve };')();
  const at = Date.UTC(2026, 9, 26, 20, 30), cap = 1900;
  const R = f.reserve(cap, at);
  assert.equal(f.held(cap, null, at), R, 'no doc: a full bucket waits');
  assert.equal(f.held(cap, { b: 4, at }, at), 4, 'just spent: almost nothing held back');
  // ten minutes later it has refilled by half the line's rise (0.66 credits a minute)
  const ten = f.bucket(cap, { b: 4, at }, at + 600000);
  assert.ok(Math.abs(ten - (4 + 0.5 * cap / 1440 * 10)) < 1e-9, ten.toFixed(2));
  assert.equal(f.held(cap, { b: 4, at }, at + 6 * 3600000), R, 'never above the reserve');
  // whoever else asks keeps at least half the line's rise while it refills
  const lineRise = cap / 1440 * 10, heldRise = f.held(cap, { b: 4, at }, at + 600000) - 4;
  assert.ok(lineRise - heldRise >= lineRise / 2 - 1);
  assert.match(WORKER, /const _nb = Math\.max\(0, fr24NearBucket\(_cap, _nearDoc\) - \(_spend - _used\)\);/);
  assert.match(WORKER, /env\.FIDS_LIVE_FLIGHTS\.put\(FR24_NEAR_KEY, JSON\.stringify\(\{ b: _nb, at: Date\.now\(\) \}\), \{ expirationTtl: 172800 \}\)/);
  assert.doesNotMatch(WORKER, /fr24NearKey|fr24:near:\$\{/, 'no per-window counter left');
});

test('an older fix never replaces a newer one, and is not news', () => {
  const now = Date.UTC(2026, 9, 26, 20, 30, 40);
  const held = (store) => new Function('window', 'Date',
    fnSource(CORE, '_adsbFixAt') + '\n' + fnSource(CORE, '_adsbNewerHeld') + '\nreturn _adsbNewerHeld;')(
    { _adsbLast: store }, { now: () => now });
  const fr = { lat: FIX_1728[0], lng: FIX_1728[1], alt: 4300, at: now - 20000, age: 91, onGround: false };   // 17:28:49
  const osky = { lat: 46.27, lng: -64.86, alt: 5600, at: now, age: 280, onGround: false, osky: true };    // 17:26:00
  const k = held({ AC7894: fr })(osky, ['', 'JZA7894', 'AC7894']);
  assert.ok(k && k.kept === true && k.lat === FIX_1728[0], 'the newer Flightradar24 fix stands');
  assert.equal(held({ AC7894: fr })(Object.assign({}, osky, { age: 10 }), ['AC7894']), null, 'a newer answer is published');
  assert.equal(held({ AC7894: Object.assign({}, fr, { at: now - 400000 }) })(osky, ['AC7894']), null, 'a held fix past 5 minutes is not kept');
  assert.equal(held({ AC7894: fr })(Object.assign({}, osky, { onGround: true }), ['AC7894']), null, 'a touchdown is always news');
  // both answers go through it, and the cache's refresh does not repaint for it
  assert.equal((CORE.match(/_adsbNewerHeld\((_osk|_res), \[_r, _cs, _fn\]\)/g) || []).length, 3);
  assert.match(CORE, /if \(r && !r\.kept\) \{ try \{ window\._lastGateKey = '';/);
});

test('an OpenSky position past 150 s does not stop the Flightradar24 lookup', () => {
  const tel = fnSource(CORE, '_adsbTelemetry');
  assert.match(tel, /if \(_osk && !\(typeof _osk\.age === 'number' && _osk\.age > \(_near \? 150 : 240\)\)\) \{/);
  // kept only when Flightradar24 has nothing
  const tail = tel.slice(tel.lastIndexOf('for (var i = 0; i < tries.length; i++)'));
  assert.match(tail, /\n  if \(_osk\) \{\s*_osk\.fl = _fn \|\| _cs;/);
});

test('a carried descent stops at a 3° path to the field: never 1 ft 16 km out', () => {
  const now = Date.now();
  // the pair the board measured: a reading at 6,900 ft, then the 4,300 ft fix
  // 30 s later — the rate caps at 1,800 ft/min and was carried for minutes
  const T = { realAlt: 4300, realSpd: 167, realTs: now - 210000, prevAlt: 6900, prevSpd: 200, prevTs: now - 240000 };
  const spot = [46.259, -64.669];   // where the marker stood, 16 km out
  const sb = telemSandbox(T, spot);
  const m = sb.model();
  const nm = 16.3 / 1.852;
  assert.ok(m.alt >= (nm - 1) * 300 - 1, 'at or above the 3° path: ' + Math.round(m.alt) + ' ft');
  assert.ok(m.alt > 2000, 'not 361 ft, not 1 ft');
  assert.ok(m.alt <= 4300, 'and never above the real reading');
  // beyond 40 nm the bridge is as it was
  assert.equal(telemSandbox(T, [46.9, -66.0]).floor(), null);
  // a climb is not floored
  const C = { realAlt: 4300, realSpd: 200, realTs: now - 60000, prevAlt: 3000, prevSpd: 190, prevTs: now - 90000 };
  assert.ok(telemSandbox(C, spot).model().alt > 4300);
});

test('a re-anchor resumes only from a spot on the new route, never onto the runway from miles off', () => {
  const frac = new Function(fnSource(CORE, '_gateRouteFrac') + '\nreturn _gateRouteFrac;')();
  // the route rebuilt through the 17:28:49 fix, ending at the touchdown point
  const route = [[45.6729, -68.372], FIX_1728, [46.19, -64.50], [46.124, -64.655], [46.112, -64.678]];
  const nm = (a, b) => { const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2;
    return 2 * 3440.065 * Math.asin(Math.sqrt(h)); };
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + nm(route[i - 1], route[i]));
  const total = cum[cum.length - 1];
  // the marker had glided from OpenSky's last position towards runway 11, west of the field
  const out = {};
  const f = frac(route, cum, total, [46.1173, -64.8661], out);
  assert.ok(f > 0.99, 'its nearest point on the new route is the runway end');
  assert.ok(out.offNm > 2, 'and it is ' + out.offNm.toFixed(1) + ' nm off the route: no resume');
  const on = {};
  frac(route, cum, total, [46.2525, -64.6583], on);
  assert.ok(on.offNm < 2, 'a marker on the new final resumes as before');
  assert.equal(frac(route, cum, total, [44.9, -73.0]) >= 0, true, 'the fourth argument stays optional');
  assert.match(fnSource(CORE, '_startGateMapGlide'), /var _snapNm = Math\.max\(5, speedKts \/ 60\), _snapBackNm = Math\.max\(10, speedKts \/ 30\);\s*if \(\(_dp < 0 \? -_dp \* _routeNm <= _snapNm : _dp \* _routeNm <= _snapBackNm\) && !\(typeof _rOff\.offNm === 'number' && _rOff\.offNm > 2\)\) \{/,
    'only from within 5 nm ahead (a minute\'s flying) or 10 nm behind (two minutes\') of the aeroplane');
});

test('dead reckoning stops short of the threshold (a mile, or a quarter of what was left) unless the fix is inside', () => {
  const glide = fnSource(CORE, '_startGateMapGlide');
  assert.match(glide, /var _rwFinal = _runwayFinalPath\(_pl, d, destIata\);/);
  assert.match(glide, /var _preP = \(_thrNm - Math\.max\(1, 0\.25 \* \(_thrNm - _seedNm\)\)\) \/ _routeNm, _thrP = _thrNm \/ _routeNm;/,
    'a mile, or a quarter of what was left at the fix');
  assert.match(glide, /_drCapP = Math\.min\(_drCapP, _seedP >= _preP \? Math\.max\(_seedP, _thrP\) : _preP\);/);
});

test('the 3° floor never lifts the digits above what is on screen', () => {
  const now = Date.now();
  // 50 nm out the bridge carried the descent to 9,506 ft; the spot then crosses 40 nm
  const T = { realAlt: 13000, realSpd: 280, realTs: now - 120000, prevAlt: 15000, prevSpd: 285, prevTs: now - 180000, alt: 9506 };
  const sb = telemSandbox(T, [46.69, -64.68]);   // 34.8 nm north of the field
  const m = sb.model();
  assert.ok(m.alt <= 9506 + 1, 'no climb: ' + Math.round(m.alt));
});

test('a cached answer is older by its time in the cache', async () => {
  let now = 1000000;
  const fetchStub = async () => ({ ok: true, json: async () => ({ ac: [{ lat: 46.28, lon: -64.71, alt_baro: 4300, gs: 167, seen_pos: 10 }] }) });
  const one = new Function('fetch', 'Date', 'AbortController', 'setTimeout', 'clearTimeout',
    'var _ADSB_BASE = "x"; var _adsbCache = Object.create(null); var _ADSB_TTL_MS = 45000;\nasync ' + fnSource(CORE, '_adsbFetchOne') + '\nreturn _adsbFetchOne;')(
    fetchStub, { now: () => now }, undefined, setTimeout, clearTimeout);
  const a = await one('/flight/AC7894');
  assert.equal(a.seen_pos, 10);
  now += 30000;
  const b = await one('/flight/AC7894');
  assert.equal(b.seen_pos, 40, 'thirty seconds in the cache');
  assert.equal(a.seen_pos, 10, 'the cached copy itself is not changed');
  assert.match(fnSource(CORE, '_oskyTelemetry'), /seen_pos: hit\.ac\.seen_pos \+ \(now - hit\.at\) \/ 1000/);
  assert.match(WORKER, /const _hAt = Number\(hit\.headers\.get\("X-Adsb-At"\)\) \|\| 0;/);
  assert.equal((WORKER.match(/"X-Adsb-At": String\(Date\.now\(\)\)/g) || []).length, 2, 'both edge copies carry their time');
});

test('the near flag trusts only a recent fix of this flight', () => {
  const eta = Date.UTC(2026, 9, 26, 22, 0);
  const now = eta - 3 * 3600000;
  const win = { _gateInbound: { flight: 'AC7894', _revTs: eta, status: 'OnTime' }, _gateIata: 'YQM',
    _adsbLast: { AC7894: { lat: 46.15, lng: -64.70, onGround: false, at: now - 20 * 3600000, age: 5, fl: 'AC7894' } } };
  const near = new Function('window', 'Date', '_gateRawLanded', '_lookupAirport',
    fnSource(CORE, '_gcNm') + '\n' + fnSource(CORE, '_adsbFixAt') + '\n' + fnSource(CORE, '_adsbNearFinal') + '\nreturn _adsbNearFinal;')(
    win, { now: () => now }, () => false, (i) => (i === 'YQM' ? YQM : null));
  assert.equal(near('AC7894'), false, 'yesterday\'s last fix 3 nm out is not today\'s flight near');
  win._adsbLast.AC7894.at = now - 60000;
  assert.equal(near('AC7894'), true, 'a fix a minute old within 60 nm is');
});

test('the worker holds a near arrival below 10,000 ft for 90 s, and every location reads that hold', () => {
  assert.match(WORKER, /const ADSB_NEAR_TTL = 90;/);
  assert.match(WORKER, /const _hold = \(_near && typeof _ac\.alt_baro === "number" && _ac\.alt_baro < 10000\) \? ADSB_NEAR_TTL : ADSB_TTL;/);
  assert.match(WORKER, /JSON\.stringify\(\{ at: Date\.now\(\), hold: _hold, body: _frBody \}\), \{ expirationTtl: Math\.max\(60, _hold\) \}/);
  assert.match(WORKER, /const _gMax = _g\.quiet \? ADSB_EMPTY_TTL : \(typeof _g\.hold === "number" && _g\.hold > 0 \? _g\.hold : ADSB_TTL\);/);
  assert.match(WORKER, /"Cache-Control": `public, max-age=\$\{_hold\}`/);
});


function nearSandbox(win, now) {
  const RealDate = Date;
  const src = fnSource(CORE, '_gcNm') + '\n' + fnSource(CORE, '_adsbFixAt') + '\n' + fnSource(CORE, '_adsbNearFinal') + '\nreturn _adsbNearFinal;';
  return new Function('window', 'Date', '_gateRawLanded', '_lookupAirport', src)(
    win, { now: () => now }, (r) => /arriv|land/i.test(String(r.status || '')),
    (iata) => (iata === 'YQM' ? YQM : null));
}

test('a board asks with ?near=1 for its own inbound in its last half hour, or within 60 nm', () => {
  const eta = Date.UTC(2026, 9, 26, 20, 30);
  const inb = { flight: 'AC7894', _revTs: eta, _sortTs: eta + 7 * 60000, status: 'Early' };
  const win = { _gateInbound: inb, _gateIata: 'YQM', _adsbLast: {} };
  assert.equal(nearSandbox(win, eta - 12 * 60000)('AC7894'), true, '12 minutes out');
  assert.equal(nearSandbox(win, eta - 12 * 60000)('JZA7894'), true, 'by its callsign too (the digits)');
  assert.equal(nearSandbox(win, eta - 12 * 60000)('AC7897'), false, 'another flight');
  assert.equal(nearSandbox(win, eta - 25 * 60000)('AC7894'), false, '25 minutes out is not the final stretch');
  assert.equal(nearSandbox(win, eta - 90 * 60000)('AC7894'), false, 'an hour and a half out, far away');
  win._adsbLast.AC7894 = { lat: 46.0, lng: -65.6, onGround: false, at: eta - 90 * 60000 - 30000, age: 10, fl: 'AC7894' };
  assert.equal(nearSandbox(win, eta - 90 * 60000)('AC7894'), true, 'early, but already within 40 nm');
  win._adsbLast.AC7894 = { lat: 46.0, lng: -66.4, onGround: false, at: eta - 90 * 60000 - 30000, age: 10, fl: 'AC7894', alt: 8000 };
  assert.equal(nearSandbox(win, eta - 90 * 60000)('AC7894'), true, '65 nm out but below 10,000 ft');
  win._adsbLast.AC7894.alt = 24000;
  assert.equal(nearSandbox(win, eta - 90 * 60000)('AC7894'), false, '65 nm out at 24,000 ft: not yet');
  win._adsbLast.AC7894 = { lat: 43.7, lng: -79.6, onGround: false, at: eta - 90 * 60000 - 30000, age: 10, fl: 'AC7894', alt: 3000 };
  assert.equal(nearSandbox(win, eta - 90 * 60000)('AC7894'), false, 'climbing out of Toronto: never');
  win._adsbLast.AC7894 = { lat: 46.0, lng: -65.6, onGround: false, at: eta - 90 * 60000 - 30000, age: 10, fl: 'AC7894' };
  inb.status = 'Arrived';
  assert.equal(nearSandbox(win, eta)('AC7894'), false, 'landed');
  assert.equal(nearSandbox({ _gateInbound: { flight: 'AC7897', dest: 'YYZ' }, _gateIata: 'YQM' }, eta)('AC7897'), false, 'an outbound');
  // and it rides on every lookup, outside the cache key
  assert.match(CORE, /fetch\(_ADSB_BASE \+ path \+ \(near \? '\?near=1' : ''\)/);
  assert.match(CORE, /var ac = await _adsbFetchOne\(tries\[i\], _near\);/);
  assert.match(CORE, /var maxAge = maxAgeMs \|\| \(_adsbNearFinal\(flightNo \|\| callSign\) \? 45000 : 90000\);/);
});


const flown = new Function(fnSource(CORE, '_glideFlownNm') + '\nreturn _glideFlownNm;')();

test('the glide measures a re-anchor against the fix carried forward for its age', () => {
  const glide = fnSource(CORE, '_startGateMapGlide');
  assert.match(glide, /var _fixAgeMs = \(typeof fixAt === 'number' && isFinite\(fixAt\) && fixAt > 0\)\s*\? Math\.max\(0, Math\.min\(_drMax, Date\.now\(\) - fixAt\)\) : 0;/);
  assert.match(glide, /var _nowP = Math\.min\(_drCapP, _seedP \+ _flown\(_dFix, _fixAgeMs\) \/ _routeNm\);/);
  assert.match(glide, /var p = _nowP;/);
  assert.match(glide, /var _dp = _nowP - _pRes;/);
  // 2026-10-26: the 17:28:49 fix served at 17:30:40 (111 s old) at 167 kt,
  // ~20 nm of route left, is ~5 nm further on: a marker drawn 1.9 nm past the
  // fix is BEHIND that, so it is sped up, not stopped.
  const ahead = flown(20, 111 / 3600, 20, 167, 140);
  assert.ok(ahead > 1.9 && ahead < 5.2, ahead.toFixed(2) + ' nm');
});

test('the approach model: the fix\'s speed beyond the ramp, slowing evenly with distance to 140 kt at the end', () => {
  assert.ok(Math.abs(flown(150, 0.1, 40, 450, 140) - 45) < 1e-9, 'beyond the ramp, the fix\'s own speed');
  let last = 0, lastStep = Infinity;
  for (let s = 30; s <= 1200; s += 30) {
    const f = flown(30, s / 3600, 30, 250, 140);
    assert.ok(f >= last && f <= 30, 'rising and bounded at ' + s + ' s');
    if (f < 30) { assert.ok(f - last <= lastStep + 1e-9, 'slowing at ' + s + ' s'); lastStep = f - last; }
    last = f;
  }
  let tEnd = 0; while (flown(30, tEnd / 3600, 30, 250, 140) < 30 - 1e-6 && tEnd < 3000) tEnd += 1;
  let tMile = 0; while (flown(30, tMile / 3600, 30, 250, 140) < 29 - 1e-6) tMile += 1;
  assert.ok(tEnd - tMile > 22 && tEnd - tMile < 28, 'the last mile at about 140 kt: ' + (tEnd - tMile) + ' s');
  assert.ok(Math.abs(flown(10, 60 / 3600, 10, 120, 140) - 2) < 1e-9, 'already slower than 140 kt: keeps its speed');
  assert.equal(flown(10, 0, 10, 200, 140), 0);
  assert.equal(flown(0, 1, 10, 200, 140), 0);
  assert.equal(flown(10, 1, 10, 0, 140), 0);
  const glide = fnSource(CORE, '_startGateMapGlide');
  assert.match(glide, /var _flown = function \(dStart, ms\) \{ return _glideFlownNm\(dStart, ms \/ 3600000, _dRamp, speedKts, _vMin\); \};/);
  assert.match(glide, /var _dRamp = Math\.min\(_dFix, 80, _routeNm \/ 2\);/, 'from 80 nm (a jet slows from the top of its descent), never the first half of a short hop');
  assert.doesNotMatch(glide, /_p0 > 0\.82|0\.62 \+ 0\.38|_close|fixHist|_gateHeading\(null\)/, 'no route-share profile, no track or fix-history factors');
});

test('the correction lasts only as long as the error it flies off, then the model alone', () => {
  const glide = fnSource(CORE, '_startGateMapGlide');
  assert.match(glide, /var _corrMs = \(_errNm === 0 \|\| !\(_vLow > 0\)\) \? 0\s*: Math\.max\(_CONVERGE_MS, Math\.abs\(_errNm\) \/ \(\(_errNm > 0 \? _MAX_RATE_MULT - 1 : 0\.65\) \* _vLow\)\);/);
  assert.match(glide, /p = Math\.max\(_p0, Math\.min\(_drCapP, _p0 \+ \(_flown\(_dAnchor, elapsed\)\s*\+ \(_corrMs > 0 \? _errNm \* Math\.min\(1, elapsed \/ _corrMs\) : 0\)\) \/ _routeNm\)\);/);
  assert.doesNotMatch(glide, /_rate \* elapsed/, 'never a corrected rate for the whole glide');
  // a marker 2 nm ahead at 160 kt never stops or reverses, then is exactly the model
  const vLow = 140 / 3600000, err = -2, corr = Math.max(45000, Math.abs(err) / (0.65 * vLow));
  const pos = (ms) => flown(15, ms / 3600000, 15, 160, 140) + err * Math.min(1, ms / corr);
  let last = pos(0);
  for (let ms = 1000; ms <= 300000; ms += 1000) { const x = pos(ms); assert.ok(x > last, 'forward at ' + ms / 1000 + ' s'); last = x; }
  const t = corr + 1000;
  assert.ok(Math.abs(pos(t) - (flown(15, t / 3600000, 15, 160, 140) - 2)) < 1e-9);
});

function telemSandbox(T, glideLl) {
  const src = [fnSource(CORE, '_gcNm'), fnSource(CORE, '_gateTelemSpotNm'), fnSource(CORE, '_gateTelemPathFloorFt'), fnSource(CORE, '_gateTelemModel'),
    fnSource(CORE, '_gateTelemDistKm'), 'return { model: _gateTelemModel, dist: _gateTelemDistKm, floor: _gateTelemPathFloorFt };'].join('\n');
  const win = { _gateTelemAnim: T, _gateIata: 'YQM', _gateInbound: { flight: 'AC7894' }, _gateMapFix: null };
  return new Function('window', '_gateGlide', '_lookupAirport', 'AIRPORT_COORDS', src)(
    win, { raf: true, ll: glideLl, d: YQM, fl: 'AC7894' }, (i) => (i === 'YQM' ? YQM : null), { YQM: YQM });
}

test('a carried descent stops at a 3° path to the field: never 1 ft 16 km out', () => {
  const now = Date.now();
  const T = { realAlt: 4300, realSpd: 167, realTs: now - 210000, prevAlt: 6900, prevSpd: 200, prevTs: now - 240000 };
  const spot = [46.259, -64.669];   // where the marker stood, 16 km out
  const m = telemSandbox(T, spot).model();
  const nm = 16.3 / 1.852;
  assert.ok(m.alt >= (nm - 1) * 300 - 1, 'at or above the 3° path: ' + Math.round(m.alt) + ' ft');
  assert.ok(m.alt > 2000 && m.alt <= 4300, 'not 361 ft, not 1 ft, never above the reading');
  assert.equal(telemSandbox(T, [46.9, -66.0]).floor(), null, 'beyond 40 nm the bridge is as it was');
  const C = { realAlt: 4300, realSpd: 200, realTs: now - 60000, prevAlt: 3000, prevSpd: 190, prevTs: now - 90000 };
  assert.ok(telemSandbox(C, spot).model().alt > 4300, 'a climb is not floored');
});

test('the 3° floor never lifts the digits above what is on screen', () => {
  const now = Date.now();
  const T = { realAlt: 13000, realSpd: 280, realTs: now - 120000, prevAlt: 15000, prevSpd: 285, prevTs: now - 180000, alt: 9506 };
  const m = telemSandbox(T, [46.69, -64.68]).model();   // 34.8 nm north of the field
  assert.ok(m.alt <= 9506 + 1, 'no climb: ' + Math.round(m.alt));
});

test('the distance is the drawn aeroplane\'s, every second, and only this flight\'s', () => {
  assert.equal(telemSandbox({ realAlt: 1900, realSpd: 150, realTs: Date.now(), prevAlt: null }, FIX_1732).dist(), 10,
    'the 17:32:56 fix is 10 km from the field, not 20');
  const src = [fnSource(CORE, '_gcNm'), fnSource(CORE, '_gateTelemSpotNm'), fnSource(CORE, '_gateTelemDistKm'), 'return _gateTelemDistKm;'].join('\n');
  const mk = (glideFl, inb) => new Function('window', '_gateGlide', 'AIRPORT_COORDS', src)(
    { _gateIata: 'YQM', _gatePanelInbound: { flight: inb }, _gateMapFix: { key: inb, lat: 46.9, lng: -64.68 } },
    { raf: true, ll: [46.20, -64.68], d: YQM, fl: glideFl }, { YQM: YQM });
  assert.equal(mk('AC7894', 'AC7894')(), 10, 'its own glide');
  assert.equal(mk('AC7894', 'AC7896')(), null, 'another flight\'s glide: nothing (the built number stays)');
  assert.equal(mk('AC7894', 'AC7894')('AC7896'), null, 'nor for a panel built for another flight');
  assert.match(CORE, /<span data-gtelem="dist-km">' \+ BoardStrings\.num\(_distKm\) \+ '<\/span>/);
  assert.match(fnSource(CORE, '_writeGateTelemDom'), /else if \(kind === 'dist-km'\) v = distKm;/);
  assert.match(CORE, /var _dLive = _gateTelemDistKm\(String\(_ib\.flight \|\| ''\)\);\s*if \(_distKm !== null && _dLive !== null\) _distKm = _dLive;/);
  assert.match(CORE, /_gateGlide\.fl = String\(\(\(window\._gatePanelInbound \|\| window\._gateInbound\) \|\| \{\}\)\.flight \|\| ''\);/);
});

test('the glide takes its speed from the fix it draws', () => {
  const spd = new Function('window', fnSource(CORE, '_lngNear') + fnSource(CORE, '_gateMapFixSpd') + '\nreturn _gateMapFixSpd;')(
    { _gateMapFix: { lat: 46.2853, lng: -64.7096, spd: 167 } });
  assert.equal(spd(46.2853, -64.7096), 167);
  assert.equal(spd(46.1844, -64.5908), null, 'not another fix\'s');
  assert.equal((CORE.match(/\(_gateMapFixSpd\(planeLat, planeLng\) !== null\) \? _gateMapFixSpd\(planeLat, planeLng\)/g) || []).length, 4,
    'all four glide starts (mini in place and rebuilt, big in place and rebuilt)');
});

test('the watchdog knows a marker held on purpose', () => {
  assert.match(CORE, /_gateGlide\.holding = \(p >= _drCapP\) \|\| elapsed >= _drLeftMs;/);
  assert.match(CORE, /\|\| !!\(typeof _gateGlide !== 'undefined' && _gateGlide\.holding === true\);/);
  assert.match(CORE, /Date\.now\(\) - _gateGlide\.fixAt > \(_gateGlide\.drMaxMs \|\| _GLIDE_DR_MAX_MS\)\)/);
  assert.match(fnSource(CORE, '_stopGateMapGlide'), /_gateGlide\.holding = false;/);
  assert.match(CORE, /var _GLIDE_DR_MAX_MS = 8 \* 60000;/);
});

test('an aeroplane established on final is carried on to touchdown', () => {
  const on = new Function(fnSource(CORE, '_gateOnFinal') + '\nreturn _gateOnFinal;')();
  // Moncton runway 24: the threshold at the north-east end, landing south-west
  const THR = [46.1262, -64.66766], TDZ = [46.1209, -64.6772];
  // points out along the extended centreline (the reverse of the landing direction)
  const kx = Math.cos(THR[0] * Math.PI / 180), ex = (THR[1] - TDZ[1]) * kx, ey = THR[0] - TDZ[0], el = Math.hypot(ex, ey);
  const out = (nm) => [THR[0] + ey / el * nm / 60, THR[1] + ex / el * nm / 60 / kx];
  assert.equal(on(out(5), THR, TDZ, 1600), true, '5 nm out on the centreline at 1,600 ft');
  assert.equal(on(out(5), THR, TDZ, null), true, 'no altitude known');
  assert.equal(on(out(5), THR, TDZ, 4000), false, 'too high to be on final');
  assert.equal(on(out(14), THR, TDZ, 2500), false, 'beyond 12 nm');
  assert.equal(on([out(5)[0] + 0.02, out(5)[1]], THR, TDZ, 1600), false, '1.2 nm off the centreline');
  assert.equal(on([THR[0] - (out(3)[0] - THR[0]), THR[1] - (out(3)[1] - THR[1])], THR, TDZ, 500), false, 'past the threshold, the other side');
  assert.equal(on(FIX_1728, THR, TDZ, 4300), false, 'the 17:28:49 fix, 19 km north at 4,300 ft, is not');
  assert.match(fnSource(CORE, '_startGateMapGlide'), /if \(_rwFinal && n >= 3 && !_gateOnFinal\(_pl, route\[n - 2\], route\[n - 1\], _gateMapFixAlt\(planeLat, planeLng\)\)\) \{/);
});
