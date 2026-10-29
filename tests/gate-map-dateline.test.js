'use strict';

// v24095 — a flight across the date line (UA878 Hong Kong → San Francisco,
// SFO gate G8, 2026-10-28). The glide's route was Hong Kong → plane (unwrapped
// from Hong Kong, so the plane sat at 215.6) joined to plane → SFO (unwrapped
// from the plane, -144.4). Between those two vertices the marker's longitude
// was interpolated the long way round the planet: it raced west at ~70 km a
// second and the distance to SFO climbed 5,246 → 6,238 km in 15 seconds.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
function fnSource(name) {
  const at = SRC.search(new RegExp('\\nfunction ' + name + '\\('));
  assert.ok(at >= 0, name + ' must be a top-level function');
  const end = SRC.indexOf('\n}\n', at);
  return SRC.slice(at + 1, end + 2);
}

// A stand-in for leaflet-arc: great-circle vertices with RAW longitudes in
// -180..180, the worst case the unwrapping has to survive.
function gcPoints(o, d, n) {
  const r = Math.PI / 180, p1 = [o[0] * r, o[1] * r], p2 = [d[0] * r, d[1] * r];
  const v = (p) => [Math.cos(p[0]) * Math.cos(p[1]), Math.cos(p[0]) * Math.sin(p[1]), Math.sin(p[0])];
  const a = v(p1), b = v(p2), w = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
    const x = s1 * a[0] + s2 * b[0], y = s1 * a[1] + s2 * b[1], z = s1 * a[2] + s2 * b[2];
    out.push({ lat: Math.atan2(z, Math.hypot(x, y)) / r, lng: Math.atan2(y, x) / r });
  }
  return out;
}
const L = { Polyline: { Arc: (o, d, opts) => { const ll = gcPoints(o, d, opts.vertices); return { getLatLngs: () => ll }; } } };

const ctx = vm.createContext({ L, Date, Math, window: {}, fetch: undefined });
vm.runInContext(['_lngChain', '_gcFullRoute', '_gcNm', '_gateRouteFrac', '_gateFlownPath'].map(fnSource).join('\n')
  + '\nvar _flownCache = Object.create(null);', ctx);
const run = (expr) => vm.runInContext(expr, ctx);

const HKG = [22.308, 113.918], SFO = [37.6213, -122.379], FIX = [48.4095, -144.3622];   // the fix FR24 recorded at 00:13:45Z

// The route exactly as _startGateMapGlide joins it (no flown track).
function glideRoute() {
  ctx.o = HKG; ctx.d = SFO; ctx.pl = FIX;
  return run('(function(){var a=_gcFullRoute(o,pl,80),b=_gcFullRoute(pl,d,38);return {route:_lngChain(a.concat(b.slice(1)),a.length-1,pl[1]),seed:a.length-1};})()');
}
const maxStep = (r) => Math.max(...r.slice(1).map((p, i) => Math.abs(p[1] - r[i][1])));

test('the glide joins its two legs in one frame, through the aeroplane', () => {
  assert.match(SRC, /var route = _lngChain\(_legA\.concat\(_legB\.slice\(1\)\), _legA\.length - 1, planeLng\);/);
  const { route, seed } = glideRoute();
  assert.ok(maxStep(route) < 5, 'no 360-degree step between vertices: ' + maxStep(route).toFixed(1));
  assert.ok(Math.abs(route[seed][1] - FIX[1]) < 1e-9, 'the plane is where the fix is, in its own frame');
  assert.ok(Math.abs(route[route.length - 1][1] - SFO[1]) < 1e-6, 'SFO at its real longitude');
  assert.ok(Math.abs(route[0][1] - (HKG[1] - 360)) < 1e-6, 'Hong Kong one turn west, on the same line');
});

test('a minute of flight moves the marker 8.75 nm nearer SFO, not across the planet', () => {
  const { route, seed } = glideRoute();
  ctx.route = route;
  const cum = run('(function(){var c=[0];for(var i=1;i<route.length;i++)c.push(c[i-1]+_gcNm(route[i-1],route[i]));return c;})()');
  // the frame loop's own walk (_ptAtNm): linear between vertices
  const at = (nm) => { let k = 0; while (k < route.length - 2 && cum[k + 1] < nm) k++; const f = (nm - cum[k]) / (cum[k + 1] - cum[k]); const A = route[k], B = route[k + 1]; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]; };
  ctx.SFO = SFO;
  const dist = (p) => { ctx.p = p; return run('_gcNm(p,SFO)'); };
  const d0 = dist(FIX);
  for (let s = 1; s <= 60; s++) {
    const p = at(cum[seed] + 525 * s / 3600);
    assert.ok(Math.abs(p[1] - FIX[1]) < 2, 'second ' + s + ': lng ' + p[1].toFixed(2));
    assert.ok(dist(p) < d0, 'second ' + s + ': closer to SFO');
  }
  assert.ok(Math.abs((d0 - dist(at(cum[seed] + 8.75))) - 8.75) < 0.2);
});

test('the drawn point is found on the route in either world copy', () => {
  const { route, seed } = glideRoute();
  ctx.route = route;
  ctx.cum = run('(function(){var c=[0];for(var i=1;i<route.length;i++)c.push(c[i-1]+_gcNm(route[i-1],route[i]));return c;})()');
  ctx.total = ctx.cum[ctx.cum.length - 1];
  const want = ctx.cum[seed] / ctx.total;
  for (const lng of [FIX[1], FIX[1] + 360, FIX[1] - 360]) {
    ctx.pt = [FIX[0], lng];
    const out = run('(function(){var o={};var f=_gateRouteFrac(route,cum,total,pt,o);return [f,o.offNm];})()');
    assert.ok(Math.abs(out[0] - want) < 1e-3, 'lng ' + lng + ': frac ' + out[0]);
    assert.ok(out[1] < 0.01, 'lng ' + lng + ': on the route');
  }
});

test('the recorded track joins its arc without a jump, and ends at the aeroplane', () => {
  // fixes recorded the way the proxy stores them: -180..180, crossing the line
  const raw = gcPoints(HKG, FIX, 40).slice(8).map((q) => [q.lat, q.lng, 35000, 0]);
  assert.ok(raw.some((q) => q[1] > 170) && raw.some((q) => q[1] < -170), 'the track crosses the date line');
  ctx.window._gateInbound = { flight: 'UA878' };
  run('_flownCache.UA878 = { at: Date.now(), rec: ' + JSON.stringify({ f: 'UA878', o: 'HKG', d: 'SFO', pts: raw }) + ' };');
  ctx.o = HKG; ctx.d = SFO;
  const p = run('_gateFlownPath(o, d, ' + FIX[0] + ', ' + FIX[1] + ', "SFO")');
  assert.ok(p && p.length > 10);
  assert.ok(maxStep(p) < 5, 'continuous: ' + maxStep(p).toFixed(1));
  assert.ok(Math.abs(p[p.length - 1][1] - FIX[1]) < 1e-9, 'ends on the marker');
});

test('a flight that never nears the line is left exactly as it was', () => {
  ctx.o = [46.1122, -64.6786]; ctx.d = [43.6777, -79.6248]; ctx.pl = [45.2, -70.1];   // YQM → YYZ
  const r = run('(function(){var a=_gcFullRoute(o,pl,40),b=_gcFullRoute(pl,d,20);return {raw:a.concat(b.slice(1)),ch:_lngChain(a.concat(b.slice(1)),a.length-1,pl[1])};})()');
  assert.equal(JSON.stringify(r.ch), JSON.stringify(r.raw.map((q) => [q[0], q[1]])));
});

test('without the arc plugin the straight fallback goes the short way', () => {
  const ctx2 = vm.createContext({ Math });
  vm.runInContext(fnSource('_gcFullRoute'), ctx2);
  ctx2.o = HKG; ctx2.d = SFO;
  const pts = vm.runInContext('_gcFullRoute(o, d, 10)', ctx2);
  assert.ok(pts[pts.length - 1][1] > 180, 'east across the Pacific, not west across Asia: ' + pts[pts.length - 1][1]);
});

// Review follow-ups (two fixes either side of the line; pins; zoom; the old
// arc's frozen copy).
test('a raw fix is moved into the world copy it is compared with', () => {
  const c = vm.createContext({});
  vm.runInContext(fnSource('_lngNear'), c);
  const near = (a, b) => vm.runInContext('_lngNear(' + a + ',' + b + ')', c);
  assert.equal(near(-178.75, 181.3), 181.25);
  assert.equal(near(174.79, -177.5), 174.79 - 360);
  assert.equal(near(-122.379, -144.36), -122.379);
  assert.equal(near(10, 20), 10);
});

test('each map draws the glide in its own camera copy, and the in-place camera tests use it', () => {
  assert.match(SRC, /_vk = Math\.round\(\(vmap\.getCenter\(\)\.lng - lng\) \/ 360\) \* 360;/);
  assert.match(SRC, /vmarker\.setLatLng\(\[lat, vlng\]\);\n\s*_gateGlide\.ll = \[lat, lng\];/);
  assert.match(SRC, /v\.a1\.setLatLngs\(_vk \? route\.slice\(0, i1\)\.map\(_vsh\) : route\.slice\(0, i1\)\)/);
  assert.match(SRC, /vmap\.panInside\(\[lat, vlng\]/);
  assert.match(SRC, /var _camFix = \[planeLat, _lngNear\(planeLng, gateMap\.getCenter\(\)\.lng\)\];/);
  assert.match(SRC, /gateMap\.flyTo\(_camFix, zoom/);
  assert.match(SRC, /var _bcCamFix = \[planeLat, _lngNear\(planeLng, window\._bigCraftMap\.getCenter\(\)\.lng\)\];/);
  assert.match(SRC, /window\._bigCraftMap\.flyTo\(_bcCamFix, _bcAirZ/);
  assert.match(SRC, /_dLng = Math\.abs\(_lngNear\(_ref\.lng, planeLng\) - planeLng\)/);
});

test('the live maps measure the zoom ladder the short way, draw one line per leg, and pin both ends where the lines end', () => {
  const ladders = SRC.match(/var totalDist = Math\.sqrt\(Math\.pow\(o\[0\]-d\[0\],2\)\+Math\.pow\(_lngNear\(o\[1\],d\[1\]\)-d\[1\],2\)\)/g) || [];
  assert.equal(ladders.length, 2);
  assert.equal((SRC.match(/var distToDst = Math\.sqrt\(Math\.pow\(planeLat-d\[0\],2\)\+Math\.pow\(planeLng-d\[1\],2\)\)/g) || []).length, 0, 'no raw ladder left');
  for (const m of ['gateMap', 'window\\._bigCraftMap']) {
    assert.match(SRC, new RegExp('L\\.polyline\\(_lngChain\\(_gcFullRoute\\(o,_pp,60\\),60,planeLng\\), \\{[^}]*\\}\\)\\.addTo\\(' + m + '\\)'));
    assert.match(SRC, new RegExp('L\\.polyline\\(_lngChain\\(_gcFullRoute\\(_pp,d,60\\),0,planeLng\\), \\{[^}]*\\}\\)\\.addTo\\(' + m + '\\)'));
  }
  assert.match(SRC, /L\.circleMarker\(_oPin,/);
  assert.match(SRC, /L\.circleMarker\(_dPin,/);
  assert.match(SRC, /L\.circleMarker\(_bcOPin,/);
  assert.match(SRC, /L\.circleMarker\(_bcDPin,/);
  // HKG–SFO: the ladder's total is the short way round (124.6 degrees), so the
  // fix 1,150 nm out keeps the cruise zoom instead of zoom 9
  const lng = (a, b) => a + Math.round((b - a) / 360) * 360;
  const total = Math.hypot(HKG[0] - SFO[0], lng(HKG[1], SFO[1]) - SFO[1]);
  const toDst = Math.hypot(FIX[0] - SFO[0], lng(FIX[1], SFO[1]) - SFO[1]);
  assert.ok(Math.abs(total - 124.6) < 0.2, String(total));
  assert.ok(toDst / total > 0.14, 'still cruise zoom: ' + (toDst / total).toFixed(3));
});

// Second review: a map whose camera followed the glide across the line, then
// a landing or a park (a raw fix), and the estimate maps' arc copy.
test('parking or landing moves a turned map back to the raw copy, everything with it', () => {
  assert.match(fnSource('_gateApplyParked'), /^function _gateApplyParked\(view, lat, lng, d, here\) \{\n  try \{\n    _mapToRawCopy\(view\.map \|\| \(view\.marker && view\.marker\._map\) \|\| null, lng\);/);
  // a fake map: camera in the +360 copy, marker/line/pin there, one layer raw
  const mkLayer = (ll) => ({ _ll: ll, getLatLng() { return this._ll; }, setLatLng(q) { this._ll = Array.isArray(q) ? { lat: q[0], lng: q[1] } : q; } });
  const mkLine = (lls) => ({ _lls: lls, getLatLngs() { return this._lls; }, setLatLngs(q) { this._lls = q; } });
  let grid = null;
  const marker = mkLayer({ lat: 37.618, lng: 237.605 }), pin = mkLayer({ lat: 37.62, lng: 237.62 }), raw = mkLayer({ lat: 37.6, lng: -122.4 });
  const line = mkLine([{ lat: 22.3, lng: 113.9 }, { lat: 37.618, lng: 237.605 }]);
  let view = null;
  const map = { _c: { lat: 37.62, lng: 237.6 }, getCenter() { return this._c; }, getZoom() { return 13; },
    eachLayer(f) { [grid, marker, pin, raw, line].forEach(f); }, setView(c, z, o) { view = { c, z, o }; this._c = { lat: c[0], lng: c[1] }; } };
  const c2 = vm.createContext({ L: { GridLayer: function () {}, latLng: (a, b) => ({ lat: a, lng: b }) }, Math, Array });
  grid = Object.create(c2.L.GridLayer.prototype);   // the tile layer: never shifted
  vm.runInContext(fnSource('_mapToRawCopy'), c2);
  c2.map = map;
  vm.runInContext('_mapToRawCopy(map, -122.39)', c2);
  assert.ok(Math.abs(marker._ll.lng - (237.605 - 360)) < 1e-9, 'the marker');
  assert.ok(Math.abs(pin._ll.lng - (237.62 - 360)) < 1e-9, 'the pin');
  assert.ok(Math.abs(line._lls[1].lng - (237.605 - 360)) < 1e-9 && Math.abs(line._lls[0].lng - (113.9 - 360)) < 1e-9, 'the flown line, whole');
  assert.equal(raw._ll.lng, -122.4, 'a layer already in the raw copy stays');
  assert.ok(view && Math.abs(view.c[1] - (237.6 - 360)) < 1e-9 && view.z === 13 && view.o.animate === false, 'the camera, without animation');
  // an ordinary map is left alone
  const m2 = { getCenter: () => ({ lat: 46.1, lng: -64.7 }), eachLayer() { throw new Error('touched'); }, setView() { throw new Error('moved'); } };
  c2.m2 = m2; vm.runInContext('_mapToRawCopy(m2, -64.68)', c2);
});

test('the arc drawer\'s date-line copy leaves the map with its arc', () => {
  const arc = fnSource('_gcAddArc');
  assert.match(arc, /var _copy = L\.polyline\(/);
  assert.match(arc, /a\.on\('remove', function \(\) \{ try \{ _copy\.remove\(\); \} catch \(eR\) \{\} \}\);/);
});
