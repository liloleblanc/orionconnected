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
  // 20:30 UTC (17:30 ADT): the reserve is an hour and a half's share
  assert.equal(f.reserve(cap, at(20, 30)), Math.ceil(cap * 90 / 1440));
  // the first minutes of the UTC day are never held up by more than half the line
  assert.ok(f.reserve(cap, at(0, 0)) <= f.paced(cap, at(0, 0)) / 2);
  // the lookup: everything else stops short by the reserve; the near arrival does not
  assert.match(WORKER, /const _near = url\.searchParams\.get\("near"\) === "1";/);
  assert.match(WORKER, /_used < fr24PacedAllowance\(_cap\) - \(_near \? 0 : fr24NearReserve\(_cap\)\)\) \{/);
  assert.match(WORKER, /used \+ DTW_FR24_PAGE_CREDITS <= Math\.min\(cap, fr24PacedAllowance\(cap\) - fr24NearReserve\(cap\)\)/,
    'the bulk sweep stays behind the reserve too');
  // the cap itself is untouched
  assert.match(WORKER, /if \(_used < _cap && Date\.now\(\) >= _coolUntil/);
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
  const src = fnSource(CORE, '_gcNm') + '\n' + fnSource(CORE, '_adsbNearFinal') + '\nreturn _adsbNearFinal;';
  return new Function('window', 'Date', '_gateRawLanded', '_lookupAirport', src)(
    win, { now: () => now }, (r) => /arriv|land/i.test(String(r.status || '')),
    (iata) => (iata === 'YQM' ? YQM : null));
}

test('a board asks with ?near=1 for its own inbound in its last half hour, or within 60 nm', () => {
  const eta = Date.UTC(2026, 9, 26, 20, 30);
  const inb = { flight: 'AC7894', _revTs: eta, _sortTs: eta + 7 * 60000, status: 'Early' };
  const win = { _gateInbound: inb, _gateIata: 'YQM', _adsbLast: {} };
  assert.equal(nearSandbox(win, eta - 25 * 60000)('AC7894'), true, '25 minutes out');
  assert.equal(nearSandbox(win, eta - 25 * 60000)('JZA7894'), true, 'by its callsign too (the digits)');
  assert.equal(nearSandbox(win, eta - 25 * 60000)('AC7897'), false, 'another flight');
  assert.equal(nearSandbox(win, eta - 90 * 60000)('AC7894'), false, 'an hour and a half out, far away');
  win._adsbLast.AC7894 = { lat: 46.0, lng: -65.6, onGround: false };
  assert.equal(nearSandbox(win, eta - 90 * 60000)('AC7894'), true, 'early, but already within 60 nm');
  inb.status = 'Arrived';
  assert.equal(nearSandbox(win, eta)('AC7894'), false, 'landed');
  assert.equal(nearSandbox({ _gateInbound: { flight: 'AC7897', dest: 'YYZ' }, _gateIata: 'YQM' }, eta)('AC7897'), false, 'an outbound');
  // and it rides on every lookup, outside the cache key
  assert.match(CORE, /fetch\(_ADSB_BASE \+ path \+ \(near \? '\?near=1' : ''\)/);
  assert.match(CORE, /var ac = await _adsbFetchOne\(tries\[i\], _near\);/);
  assert.match(CORE, /var maxAge = maxAgeMs \|\| \(_adsbNearFinal\(flightNo \|\| callSign\) \? 45000 : 90000\);/);
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
  assert.match(tel, /if \(_osk && !\(typeof _osk\.age === 'number' && _osk\.age > 150\)\) \{/);
  // kept only when Flightradar24 has nothing
  const tail = tel.slice(tel.lastIndexOf('for (var i = 0; i < tries.length; i++)'));
  assert.match(tail, /\n  if \(_osk\) \{\s*_osk\.fl = _fn \|\| _cs;/);
});

test('the glide measures a re-anchor against the fix carried forward for its age', () => {
  const glide = fnSource(CORE, '_startGateMapGlide');
  assert.match(glide, /var _fixAgeMs = \(typeof fixAt === 'number' && isFinite\(fixAt\) && fixAt > 0\)\s*\? Math\.max\(0, Math\.min\(_GLIDE_DR_MAX_MS, Date\.now\(\) - fixAt\)\) : 0;/);
  assert.match(glide, /var _nowP = Math\.min\(Math\.max\(_seedP, 1 - 0\.05 \/ _routeNm\), _seedP \+ \(speedKts \/ 3600000 \/ _routeNm\) \* _fixAgeMs\);/);
  assert.match(glide, /var p = _nowP;/);
  assert.match(glide, /var _dp = _nowP - _pRes;/);
  // The arithmetic of 2026-10-26: the 17:28:49 fix served at 17:30:40 (111 s
  // old) at 167 kt is 5.1 nm further on. A marker drawn 1.9 nm past the fix
  // is BEHIND that, so the correction speeds it up instead of stopping it.
  const ahead = 167 * 111 / 3600;
  assert.ok(ahead > 1.9 && Math.abs(ahead - 5.15) < 0.1);
  // and a marker still ahead of that slows to a third of the speed, never stops
  assert.match(glide, /var _rate = Math\.max\(_errP < 0 \? _baseRate \* _phase \* 0\.35 : 0, Math\.min\(_rateRaw, _rateCap\)\);/);
});

test('the glide slows only over the last 4 nm, not the last fifth of the route', () => {
  const glide = fnSource(CORE, '_startGateMapGlide');
  assert.doesNotMatch(glide, /_p0 > 0\.82/);
  assert.doesNotMatch(glide, /0\.62 \+ 0\.38/);
  assert.match(glide, /var _leftNm = Math\.max\(0, \(1 - _p0\) \* _routeNm\);\s*if \(_leftNm < 4\) _phase = 0\.8 \+ 0\.2 \* \(_leftNm \/ 4\);/);
});

function telemSandbox(T, glideLl) {
  const src = [fnSource(CORE, '_gcNm'), fnSource(CORE, '_gateTelemPathFloorFt'), fnSource(CORE, '_gateTelemModel'),
    fnSource(CORE, '_gateTelemDistKm'), 'return { model: _gateTelemModel, dist: _gateTelemDistKm, floor: _gateTelemPathFloorFt };'].join('\n');
  const win = { _gateTelemAnim: T, _gateIata: 'YQM', _gateInbound: { flight: 'AC7894' }, _gateMapFix: null };
  return new Function('window', '_gateGlide', '_lookupAirport', 'AIRPORT_COORDS', src)(
    win, { raf: true, ll: glideLl, d: YQM }, (i) => (i === 'YQM' ? YQM : null), { YQM: YQM });
}

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

test('the distance is measured from the drawn aeroplane, every second', () => {
  const sb = telemSandbox({ realAlt: 1900, realSpd: 150, realTs: Date.now(), prevAlt: null }, FIX_1732);
  assert.equal(sb.dist(), 10, 'the 17:32:56 fix is 10 km from the field, not 20');
  assert.match(CORE, /<span data-gtelem="dist-km">' \+ BoardStrings\.num\(_distKm\) \+ '<\/span>/);
  assert.match(fnSource(CORE, '_writeGateTelemDom'), /else if \(kind === 'dist-km'\) v = distKm;/);
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
  assert.match(fnSource(CORE, '_startGateMapGlide'), /if \(Math\.abs\(_dp\) \* totalNm < 40 && !\(typeof _rOff\.offNm === 'number' && _rOff\.offNm > 2\)\) \{/);
});
