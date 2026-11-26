'use strict';

// ════════════════════════════════════════════════════════════════════════
// v24181 — THE CAMERA FOLLOWS THE AEROPLANE AS IT IS DRAWN.
//
// Asked on 26 Nov 2026 for gate maps as smooth as Orlando's public flight
// tracker. Two faults in the camera of the live maps (the gate map and the
// big map, in the air and on the taxi) showed most:
//   1. At every new fix the camera flew to the RAW fix, which is where the
//      aeroplane was a minute or more ago, while the aeroplane is drawn where
//      it is now; the follow pan then cut that flight short, and in Leaflet
//      1.9.4 with zoomAnimation off the cut is an instant reset of the view.
//   2. Between fixes it followed in eased pans (2.2 s, easeLinearity 0.2, so
//      two thirds of the move in the first half second) every 6 to 48 s.
// And the aeroplane itself moved a whole pixel at a time: the sub-pixel
// remainder was read from latLngToLayerPoint, which Leaflet rounds.
// Now every flight goes through _gateCamFly (the follower never cuts it),
// _gateCamFollow moves the camera with the aeroplane a fraction of a pixel
// each frame, a new view starts on the drawn aeroplane (_gateCamAim), and the
// fraction comes from the projected point.
// ════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
function fnSource(name) {
  const at = CORE.indexOf('\nfunction ' + name + '(');
  assert.ok(at >= 0, name + ' must be a top-level function');
  const end = CORE.indexOf('\n}\n', at);
  return CORE.slice(at + 1, end + 2);
}
const CAM = ['_gateCamFly', '_gateCamSpot', '_gateCamAim', '_gateCamFollow', '_gateCamWantNow'];

// ── Web Mercator in 256-px tiles, as Leaflet projects ─────────────────────
const R = Math.PI / 180;
function merc(lat, lng, z) {
  const s = 256 * Math.pow(2, z);
  return { x: (lng + 180) / 360 * s, y: (0.5 - Math.log(Math.tan(Math.PI / 4 + lat * R / 2)) / (2 * Math.PI)) * s };
}
function unmerc(x, y, z) {
  const s = 256 * Math.pow(2, z);
  return { lat: (2 * Math.atan(Math.exp((0.5 - y / s) * 2 * Math.PI)) - Math.PI / 2) / R, lng: x / s * 360 - 180 };
}
const llOf = (a) => (Array.isArray(a) ? { lat: a[0], lng: a[1] } : { lat: a.lat, lng: a.lng });
const nm = (a, b) => {
  a = llOf(a); b = llOf(b);
  const dl = (b.lat - a.lat) * R, dn = (b.lng - a.lng) * R;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dn / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(h));
};

// A map with the parts of Leaflet the camera uses. The centre is kept as a
// projected point, so a raw pan of a fraction of a pixel is exact.
class FakeMap {
  constructor(center, zoom, size) {
    this._zoom = zoom; this._size = size; this._loaded = true;
    this._c = merc(center[0], center[1], zoom);
    this.raw = []; this.panBys = []; this.flights = []; this.views = []; this.events = [];
  }
  getSize() { return { x: this._size[0], y: this._size[1] }; }
  getZoom() { return this._zoom; }
  getCenter() { return unmerc(this._c.x, this._c.y, this._zoom); }
  project(ll, z) { const q = llOf(ll); return merc(q.lat, q.lng, z === undefined ? this._zoom : z); }
  unproject(p, z) { const q = Array.isArray(p) ? { x: p[0], y: p[1] } : p; return unmerc(q.x, q.y, z === undefined ? this._zoom : z); }
  _rawPanBy(o) { const d = Array.isArray(o) ? o : [o.x, o.y]; this._c = { x: this._c.x + d[0], y: this._c.y + d[1] }; this.raw.push(d); }
  panBy(o, opt) {
    const d = Array.isArray(o) ? o : [o.x, o.y];
    this.panBys.push({ d, opt });
    this._c = { x: this._c.x + d[0], y: this._c.y + d[1] };
    this.fire('move'); this.fire('moveend');
    return this;
  }
  setView(ll, z) { this.views.push({ ll: llOf(ll), z }); this._zoom = z; const q = llOf(ll); this._c = merc(q.lat, q.lng, z); return this; }
  // a flight lands at once here; the guard it leaves is what the tests read
  flyTo(ll, z, opt) { const q = llOf(ll); this.flights.push({ ll: q, z, opt }); this._zoom = z; this._c = merc(q.lat, q.lng, z); return this; }
  once() { return this; }
  fire(t) { this.events.push(t); return this; }
  // where a point is on the screen, unrounded
  screen(ll) { const p = this.project(ll); return { x: p.x - this._c.x + this._size[0] / 2, y: p.y - this._c.y + this._size[1] / 2 }; }
}

function camWorld() {
  const clock = { t: 1700000000000 };
  const src = ['var _gateGlide = { raf: null, timer: null };', 'var _gateTaxi = { on: false };',
    ...CAM.map(fnSource),
    'return { fly: _gateCamFly, spot: _gateCamSpot, aim: _gateCamAim, follow: _gateCamFollow, wantNow: _gateCamWantNow, glide: _gateGlide, taxi: _gateTaxi };'].join('\n');
  return Object.assign({ clock }, new Function('Date', src)({ now: () => clock.t }));
}

const YQM = [46.1122, -64.6786];
const FPS = 60, DT = 1000 / FPS;

// Drives an aeroplane across a map at `speed` px/s on the screen, heading
// hdgAt(t) degrees, for `secs` seconds, the follower called every frame as the
// glide calls it. Returns what the camera did.
function drive({ speed, secs, hdgAt, lead = 0.15, zoom = 11, size = [288, 180], hop = null }) {
  const w = camWorld();
  const m = new FakeMap(YQM, zoom, size);
  // the aeroplane starts at the follow spot, as a new view does
  let hdg = hdgAt(0);
  let p = m.project(YQM);
  let ll = YQM.slice();
  assert.equal(w.aim(m, ll, hdg, lead), true);
  m.panBys.length = 0; m.events.length = 0;   // the start; what follows is the follower
  const out = { m, w, worstDv: 0, worstStep: 0, outOfView: 0, outOfBox: 0, moveend: 0 };
  let last = null;
  for (let f = 1; f <= secs * FPS; f++) {
    const t = f / FPS;
    hdg = hdgAt(t);
    p = { x: p.x + Math.sin(hdg * R) * speed / FPS, y: p.y - Math.cos(hdg * R) * speed / FPS };
    if (hop && Math.abs(t - hop.at) < 1e-9) p = { x: p.x + hop.dx, y: p.y + hop.dy };
    const q = m.unproject(p);
    ll = [q.lat, q.lng];
    w.clock.t += DT;
    const c0 = { x: m._c.x, y: m._c.y };
    const ev0 = m.events.length;
    w.follow(m, ll, DT, hdg, lead);
    out.moveend += m.events.slice(ev0).filter((e) => e === 'moveend').length;
    const step = { x: m._c.x - c0.x, y: m._c.y - c0.y };
    if (last) out.worstDv = Math.max(out.worstDv, Math.hypot(step.x - last.x, step.y - last.y));
    out.worstStep = Math.max(out.worstStep, Math.hypot(step.x, step.y));
    last = step;
    const s = m.screen(ll), [W, H] = size;
    if (s.x < 0 || s.y < 0 || s.x > W || s.y > H) out.outOfView++;
    if (t > 10 && !(hop && t > hop.at && t < hop.at + 10)) {
      const sx = -Math.sin(hdg * R) * lead * W, sy = Math.cos(hdg * R) * lead * H;
      const ex = Math.abs(s.x - W / 2 - sx) - 0.1 * W, ey = Math.abs(s.y - H / 2 - sy) - 0.1 * H;
      if (ex > 2 || ey > 2) out.outOfBox++;
    }
  }
  return out;
}

test('the camera flows with the aeroplane: no lurch, always in view, in its box, about one moveend a second at most', () => {
  // cruise at z6, the approach at z11 and z13 (0.1, 2.4 and 6.2 px/s on the rail map)
  for (const speed of [0.1, 2.4, 6.2]) {
    for (const h0 of [0, 70, 135, 250]) {
      const r = drive({ speed, secs: 120, hdgAt: () => h0 });
      assert.ok(r.worstDv < 0.01, speed + ' px/s, ' + h0 + '°: the camera step changes by ' + r.worstDv.toFixed(4) + ' px a frame');
      assert.equal(r.outOfView, 0, speed + ' px/s, ' + h0 + '°: in view');
      assert.equal(r.outOfBox, 0, speed + ' px/s, ' + h0 + '°: in its box once settled');
      assert.ok(r.moveend <= 1.2 * 120, speed + ' px/s: ' + r.moveend + ' moveend in 120 s');
      assert.equal(r.m.panBys.length + r.m.flights.length + r.m.views.length, 0, 'no pan, flight or reset: only the raw pan');
    }
    // the rail map moves with the aeroplane: it covers the aeroplane's own way
    const r = drive({ speed, secs: 120, hdgAt: () => 90 });
    const moved = r.m.raw.reduce((a, d) => a + d[0], 0);
    assert.ok(Math.abs(moved - speed * 120) < Math.max(3, speed * 120 * 0.05), speed + ' px/s: the camera went ' + moved.toFixed(1) + ' px of ' + (speed * 120).toFixed(1));
  }
});

test('on the taxi it flows round the turns too, and the big map keeps it in frame the same way', () => {
  // 12 px/s on the ground at z17: straight, a right angle in 6 s, straight, back the other way
  const hdgAt = (t) => { const c = t % 40; return c < 10 ? 90 : c < 16 ? 90 + (c - 10) * 15 : c < 26 ? 180 : c < 32 ? 180 - (c - 26) * 15 : 90; };
  const r = drive({ speed: 12, secs: 120, hdgAt, lead: 0.1, zoom: 17 });
  assert.ok(r.worstDv < 0.01, 'taxi: step change ' + r.worstDv.toFixed(4));
  assert.equal(r.outOfView, 0);
  assert.ok(r.moveend <= 1.2 * 120 && r.moveend > 60, r.moveend + ' moveend');
  const big = drive({ speed: 8, secs: 60, hdgAt: () => 200, size: [1280, 640], zoom: 13 });
  assert.ok(big.worstDv < 0.01 && big.outOfView === 0 && big.outOfBox === 0, 'the big map');
});

test('a jump of the drawn spot (a new fix) is absorbed without a lurch; one past a map away is one short flight', () => {
  const r = drive({ speed: 2.4, secs: 60, hdgAt: () => 60, hop: { at: 20, dx: 0, dy: 45 } });
  assert.equal(r.outOfView, 0, 'still in view');
  assert.ok(r.worstStep < 0.6, 'never more than ' + r.worstStep.toFixed(3) + ' px in a frame');
  assert.ok(r.worstDv < 0.02, 'the speed changes gently: ' + r.worstDv.toFixed(4));
  assert.equal(r.m.flights.length, 0);
  // a jump past the map size: one flight, to the follow spot, and no raw pan with it
  const w = camWorld(), m = new FakeMap(YQM, 11, [288, 180]);
  w.aim(m, YQM, 90, 0.15);
  w.clock.t += DT; w.follow(m, YQM, DT, 90, 0.15);
  const far = m.unproject({ x: m.project(YQM).x + 600, y: m.project(YQM).y });
  w.clock.t += DT;
  const raw0 = m.raw.length;
  w.follow(m, [far.lat, far.lng], DT, 90, 0.15);
  assert.equal(m.flights.length, 1);
  assert.equal(m.raw.length, raw0);
  const sp = w.spot(m, [far.lat, far.lng], 90, 11, 0.15);
  assert.ok(nm(m.flights[0].ll, sp) < 0.01, 'to the follow spot of the new place');
  assert.equal(m.flights[0].opt.duration, 1.6);
});

test('it never pans while a flight has the camera, nor on a map not loaded, hidden or 0 x 0', () => {
  const w = camWorld();
  const m = new FakeMap(YQM, 11, [288, 180]);
  m._fidsCamFly = w.clock.t + 2000;
  let ll = YQM.slice();
  for (let f = 0; f < 100; f++) {
    w.clock.t += DT;
    const q = m.unproject({ x: m.project(ll).x + 0.2, y: m.project(ll).y }); ll = [q.lat, q.lng];
    assert.equal(w.follow(m, ll, DT, 90, 0.15), false);
  }
  assert.equal(m.raw.length + m.panBys.length + m.flights.length, 0, 'not a pixel during the flight');
  w.clock.t += 400;
  for (let f = 0; f < 60; f++) { w.clock.t += DT; const q = m.unproject({ x: m.project(ll).x + 0.2, y: m.project(ll).y }); ll = [q.lat, q.lng]; w.follow(m, ll, DT, 90, 0.15); }
  assert.ok(m.raw.length > 0, 'and it follows again after it');
  for (const bad of [{ size: [0, 0] }, { size: [30, 200] }, { loaded: false }]) {
    const b = new FakeMap(YQM, 11, bad.size || [288, 180]);
    if (bad.loaded === false) b._loaded = false;
    for (let f = 0; f < 30; f++) { w.clock.t += DT; assert.equal(w.follow(b, [YQM[0], YQM[1] + f * 0.01], DT, 90, 0.15), false); }
    assert.equal(b.raw.length + b.panBys.length + b.flights.length + b.events.length, 0, JSON.stringify(bad));
    assert.equal(w.aim(b, YQM, 90, 0.15), false, 'aim waits too: ' + JSON.stringify(bad));
  }
  assert.equal(w.follow(null, YQM, DT, 90, 0.15), false);
  assert.equal(w.follow(m, null, DT, 90, 0.15), false);
});

test('without the raw pan it falls back to whole-pixel pans, never a zero one', () => {
  const w = camWorld();
  const m = new FakeMap(YQM, 11, [288, 180]);
  m._rawPanBy = undefined;
  let p = m.project(YQM);
  for (let f = 0; f < 60 * 60; f++) {
    w.clock.t += DT;
    p = { x: p.x + 6.2 / FPS, y: p.y };
    const q = m.unproject(p);
    w.follow(m, [q.lat, q.lng], DT, 90, 0.15);
  }
  assert.ok(m.panBys.length > 100, m.panBys.length + ' pans');
  for (const pb of m.panBys) {
    assert.ok(Number.isInteger(pb.d[0]) && Number.isInteger(pb.d[1]), 'whole pixels: ' + pb.d);
    assert.ok(pb.d[0] !== 0 || pb.d[1] !== 0, 'never a zero pan (Leaflet answers it with a moveend)');
    assert.equal(pb.opt.animate, false);
  }
});

test('a new view starts on the drawn aeroplane, at once and once; the flight helper guards itself', () => {
  const w = camWorld();
  // built on the raw fix; the aeroplane is drawn 6.8 nm on (60 s at 408 kt)
  const raw = [45.9, -66.2];
  const m = new FakeMap(raw, 11, [288, 180]);
  const drawn = (() => { const p = m.project(raw), q = m.unproject({ x: p.x + 6.8 * 35, y: p.y }); return [q.lat, q.lng]; })();
  m._fidsWantZoom = 12; m._fidsCamFly = w.clock.t + 5000; m._fidsCam = { vx: 9 };
  assert.equal(w.aim(m, drawn, 90, 0.15), true);
  assert.equal(m.panBys.length, 1, 'one pan');
  assert.ok(Number.isInteger(m.panBys[0].d[0]) && Number.isInteger(m.panBys[0].d[1]));
  const s = m.screen(drawn);
  assert.ok(Math.abs(s.x - (144 - 0.15 * 288)) <= 1 && Math.abs(s.y - 90) <= 1, 'the aeroplane at the follow spot: ' + s.x.toFixed(1) + ',' + s.y.toFixed(1));
  assert.deepEqual([m._fidsWantZoom, m._fidsCamFly, m._fidsCam], [null, 0, null], 'what the old view left is dropped');
  assert.equal(w.aim(m, drawn, 90, 0.15), true);
  assert.equal(m.panBys.length, 1, 'already there: no second pan');
  // the flight helper: a guard past its own end, a fresh follower, the duration
  const f = new FakeMap(raw, 11, [288, 180]);
  f._fidsCam = { vx: 3 };
  assert.equal(w.fly(f, drawn, 12, 3.0), true);
  assert.equal(f._fidsCamFly, w.clock.t + 3300);
  assert.equal(f._fidsCam, null);
  assert.deepEqual([f.flights.length, f.flights[0].z, f.flights[0].opt.duration], [1, 12, 3.0]);
  assert.equal(w.fly(null, drawn, 12, 3.0), false);
});

test('a zoom asked at a new fix with no glide left to fly it is flown at once, to the aeroplane; never on the taxi', () => {
  const w = camWorld();
  const mk = { getLatLng: () => ({ lat: 45.95, lng: -66.0 }) };
  const m = new FakeMap(YQM, 11, [288, 180]);
  m._fidsWantZoom = 12; w.glide.raf = 7;
  assert.equal(w.wantNow(m, mk), false, 'a running glide flies it on its next frame');
  assert.equal(m._fidsWantZoom, 12);
  w.glide.raf = null;
  assert.equal(w.wantNow(m, mk), true);
  assert.deepEqual([m.flights.length, m.flights[0].z, m._fidsWantZoom], [1, 12, null]);
  assert.ok(nm(m.flights[0].ll, [45.95, -66.0]) < 1e-6, 'to the aeroplane where it is drawn');
  m._fidsWantZoom = 13; w.taxi.on = true;
  assert.equal(w.wantNow(m, mk), false);
  assert.deepEqual([m.flights.length, m._fidsWantZoom], [1, null], 'on the taxi the taxi sets the zoom');
});

test('the camera never flies to the raw fix, never pans the old way, and only _gateCamFly flies', () => {
  const live = fnSource('initGateMapLive'), big = fnSource('_bigMapCloneLive');
  for (const [name, src] of [['initGateMapLive', live], ['_bigMapCloneLive', big]]) {
    assert.doesNotMatch(src, /\.flyTo\(/, name + ' flies nothing itself');
    assert.doesNotMatch(src, /_camFix|_bcCamFix/, name + ': no camera target on the raw fix');
    assert.match(src, /_fidsWantZoom = /, name + ' asks the glide for a new zoom');
    assert.match(src, /_gateCamWantNow\(/, name + ': and flies it when no glide is left');
  }
  const glide = fnSource('_startGateMapGlide'), taxi = fnSource('_gateTaxiDraw');
  for (const [name, src] of [['_startGateMapGlide', glide], ['_gateTaxiDraw', taxi]]) {
    assert.doesNotMatch(src, /panInside|\.panTo\(|\.flyTo\(|_acFollowing|_fidsTaxiFly/, name + ': no eased pan, no flight of its own');
    assert.doesNotMatch(src, /\.latLngToLayerPoint\(/, name + ': the sub-pixel fraction is not read from a rounded point');
  }
  assert.match(glide, /_gateCamFollow\(vmap, \[lat, vlng\], _dtMs, v\.hdg, 0\.15\)/);
  assert.match(glide, /if \(_gateCamAim\(vmap, \[lat, vlng\], v\.hdg, 0\.15\)\) v\.fresh = false;/);
  assert.match(glide, /_gateCamFly\(vmap, _gateCamSpot\(vmap, \[lat, vlng\], v\.hdg, _wz, 0\.15\), _wz, 3\.0\)/);
  assert.match(glide, /var _lp = vmap\.project\(\[lat, vlng\]\);/);
  assert.match(glide, /fresh: !\(_oldView && _oldView\.marker === marker\) \|\| !!\(_oldView && _oldView\.fresh\) \};/);
  assert.match(taxi, /_gateCamFollow\(vmap, here, dt \* 1000, v\.hdg, 0\.1\)/);
  assert.match(taxi, /var lp = vmap\.project\(\[ll\[0\], ll\[1\] \+ vk\]\);/);
  assert.match(fnSource('_gateApplyParked'), /_gateCamFly\(vm, \[lat, lng\], gz, 1\.6\)/);
  // one flyTo in the whole board, and it is the helper's
  const flies = CORE.split('\n').filter((l) => /\.flyTo\(/.test(l) && !/^\s*\/\//.test(l));
  assert.equal(flies.length, 1, flies.join('\n'));
  assert.ok(fnSource('_gateCamFly').includes(flies[0].trim()));
  for (const n of CAM) {
    assert.doesNotMatch(fnSource(n), /fetch\(|\/adsb\/|_adsbTelemetry|_adsbCached/, n + ' cannot spend an FR24 credit');
    const comments = fnSource(n).split('\n').filter((l) => /^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(comments, /'/, n + ': no apostrophe in a comment (the brace matchers in other tests)');
  }
  const head = CORE.slice(CORE.indexOf('// v24181 — THE CAMERA FOLLOWS THE AEROPLANE AS IT IS DRAWN.'), CORE.indexOf('\nfunction _gateCamFly('));
  assert.ok(head.length > 200);
  assert.doesNotMatch(head, /'/);
});

// ── the real glide, sliced out as tests/gate-glide-resume.test.js does ─────
function glideWorld() {
  let T = 1700000000000;
  const rafQ = [];
  let rafId = 0;
  const ctx = {
    console: { log() {} },
    Date: { now: () => T },
    performance: { now: () => T },
    requestAnimationFrame: (cb) => { rafQ.push({ id: ++rafId, cb }); return rafId; },
    cancelAnimationFrame: (id) => { const k = rafQ.findIndex((r) => r.id === id); if (k >= 0) rafQ.splice(k, 1); },
    setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {},
    fetch: () => new Promise(() => {}),
    Math, isFinite, Object, Array, String, Number, JSON,
  };
  ctx.window = ctx;
  const slerp = (a, b, n) => {
    const v = (p) => [Math.cos(p[0] * R) * Math.cos(p[1] * R), Math.cos(p[0] * R) * Math.sin(p[1] * R), Math.sin(p[0] * R)];
    const v1 = v(a), v2 = v(b), om = Math.acos(Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2])));
    const out = [];
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1), w1 = om > 1e-9 ? Math.sin((1 - f) * om) / Math.sin(om) : 1 - f, w2 = om > 1e-9 ? Math.sin(f * om) / Math.sin(om) : f;
      const x = w1 * v1[0] + w2 * v2[0], y = w1 * v1[1] + w2 * v2[1], z = w1 * v1[2] + w2 * v2[2];
      out.push({ lat: Math.atan2(z, Math.hypot(x, y)) / R, lng: Math.atan2(y, x) / R });
    }
    return out;
  };
  ctx.L = { Polyline: { Arc: (o, d, opt) => ({ getLatLngs: () => slerp(o, d, Math.max(2, (opt && opt.vertices) || 60)) }) } };
  ctx.TOMORROW_WX = {};
  ctx.AIRPORT_RUNWAYS = {};
  ctx._mapPlaneSpec = () => ({ prop: false, known: true });
  ctx._gateTaxi = { on: false };
  ctx._gateTaxiJoin = () => false;
  ctx._gateTaxiFromGlide = () => false;
  ctx._gateApplyParked = () => {};
  ctx._taxiVAtS = () => 0;
  vm.createContext(ctx);
  const NAMES = ['_gcNm', '_gcBrgDeg', '_gcDestPt', '_gcFullRoute', '_lngChain', '_lngNear', '_gateRouteFrac',
    '_glideFlownNm', '_gateOnFinal', '_gateMapFixAlt', '_gateMapFixSpd', '_gateLands', '_runwayFinalPath',
    '_rwCommitted', '_rwPlaneSpec', '_gateGlideRunwayPick', '_gateGlideSameLeg', '_stopGateMapGlide',
    '_startGateMapGlide', '_gateHeading', '_gateTrackTrusted', '_gateGroundSpeed', '_gateFlownPath',
    '_gateParkedAtOrigin', ...CAM];
  vm.runInContext([
    'var _gateGlide = { timer: null, raf: null, gen: 0, views: {} };',
    'var _GLIDE_DR_MAX_MS = 8 * 60000;',
    'var _GATE_TRACK_MAX_AGE_MS = 120000;',
    'var _flownCache = Object.create(null);',
    'var _FLTRACK_BASE = "";',
  ].concat(NAMES.map(fnSource)).join('\n'), ctx);
  const frame = () => { T += DT; const q = rafQ.splice(0, rafQ.length); for (const r of q) r.cb(); };
  const fix = (ll, spd, ageMs) => {
    const at = T - ageMs;
    ctx._gateInbound = ctx._gatePanelInbound = { flight: 'AC1234', _locIata: 'YYZ' };
    ctx._gateMapWhere = { kind: 'fix', onGround: false };
    ctx._gateMapFix = { key: 'AC1234', lat: ll[0], lng: ll[1], alt: 24000, spd, speed: spd, ts: at };
    ctx._gateInboundLivePos = { lat: ll[0], lng: ll[1], speed: spd, altitude: 24000, onGround: false, at, fl: 'AC1234' };
    ctx._gateInboundLiveTrack = null;
    return at;
  };
  return { ctx, frame, fix, now: () => T, start: (...a) => vm.runInContext('_startGateMapGlide', ctx)(...a), glide: () => vm.runInContext('_gateGlide', ctx) };
}

test('the real glide: a new view is put on the drawn aeroplane, a new zoom is one flight to where it is drawn, never to the raw fix', () => {
  const g = glideWorld();
  const O = [43.6777, -79.6248], D = YQM;
  const raw1 = [45.60, -68.00];
  // a fresh build: the map set on the raw fix, at z9
  const m = new FakeMap(raw1, 9, [288, 180]);
  const div = { style: { transform: '' } };
  const marker = { _ll: raw1.slice(), _map: m, _icon: { querySelector: () => div },
    setLatLng(ll) { this._ll = [ll[0], ll[1]]; }, getLatLng() { return { lat: this._ll[0], lng: this._ll[1] }; } };
  const line = () => ({ setLatLngs() {} });
  const a1 = line(), a2 = line();
  let at = g.fix(raw1, 300, 60000);
  g.start(m, O, D, raw1[0], raw1[1], marker, a1, a2, 300, 'YQM', at);
  g.frame();
  assert.equal(m.panBys.length, 1, 'the new view is moved once, on its first frame');
  const drawn1 = marker._ll.slice();
  assert.ok(nm(drawn1, raw1) > 4, 'the aeroplane is drawn its age times its speed past the raw fix: ' + nm(drawn1, raw1).toFixed(1) + ' nm');
  const s1 = m.screen(drawn1);
  assert.ok(Math.hypot(s1.x - 144, s1.y - 90) > 0.12 * 180 && Math.hypot(s1.x - 144, s1.y - 90) < 0.16 * 288 + 2,
    'and it sits at the follow spot behind the middle, not at the raw fix: ' + s1.x.toFixed(1) + ',' + s1.y.toFixed(1));
  // 30 s of frames: the camera flows, nothing jumps
  for (let f = 0; f < 30 * FPS; f++) g.frame();
  assert.equal(m.panBys.length, 1, 'no second jump');
  assert.equal(m.flights.length, 0);
  assert.ok(m.raw.length > 1000, 'the raw pan moves it every frame: ' + m.raw.length);
  const s2 = m.screen(marker._ll);
  assert.ok(s2.x > 0 && s2.x < 288 && s2.y > 0 && s2.y < 180, 'in view');
  // an in-place re-anchor on the same marker: a fix half a mile past where it
  // was first drawn, a minute old, with a new zoom asked
  const raw2 = (() => { const b = vm.runInContext('_gcBrgDeg', g.ctx)(raw1, D); return vm.runInContext('_gcDestPt', g.ctx)(drawn1, b, 0.5); })();
  at = g.fix(raw2, 300, 60000);
  m._fidsWantZoom = 10;
  const pans = m.panBys.length;
  g.start(m, O, D, raw2[0], raw2[1], marker, a1, a2, 300, 'YQM', at);
  g.frame();
  assert.equal(m.panBys.length, pans, 'an in-place re-anchor is not a new view: no jump');
  assert.equal(m.flights.length, 1, 'one flight for the new zoom');
  assert.equal(m.flights[0].z, 10);
  assert.equal(m.flights[0].opt.duration, 3.0);
  const drawn2 = marker._ll.slice();
  const want = vm.runInContext('_gateCamSpot', g.ctx)(m, drawn2, g.glide().views.mini.hdg, 10, 0.15);
  assert.ok(nm(m.flights[0].ll, want) < 0.05, 'to the follow spot of the aeroplane as drawn after the fix');
  assert.ok(nm(m.flights[0].ll, raw2) > nm(drawn2, raw2), 'ahead of the drawn aeroplane, never back toward the raw fix');
  assert.equal(m._fidsWantZoom, null, 'asked once, flown once');
  // the flight has the camera: no raw pan until it is over, then it follows again
  const raw0 = m.raw.length;
  for (let f = 0; f < 3 * FPS; f++) g.frame();
  assert.equal(m.raw.length, raw0, 'the follower leaves the flight alone');
  assert.equal(m.flights.length, 1, 'and nothing flies it again');
  for (let f = 0; f < 3 * FPS; f++) g.frame();
  assert.ok(m.raw.length > raw0, 'after the flight it follows again');
});
