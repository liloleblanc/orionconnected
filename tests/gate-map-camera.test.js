'use strict';

// ════════════════════════════════════════════════════════════════════════
// v24181 — THE CAMERA FOLLOWS THE AEROPLANE AS IT IS DRAWN.
//
// Asked on 26 Nov 2026 for gate maps as smooth as Orlando's public flight
// tracker, a still map with the aeroplanes gliding across it. Two faults in
// the camera of the live maps (the gate map and the big map, in the air and
// on the taxi) showed most:
//   1. At every new fix the camera flew to the RAW fix, which is where the
//      aeroplane was a minute or more ago, while the aeroplane is drawn where
//      it is now; the follow pan then cut that flight short, and in Leaflet
//      1.9.4 with zoomAnimation off the cut is an instant reset of the view.
//   2. Between fixes it followed in eased pans (2.2 s, easeLinearity 0.2, so
//      two thirds of the move in the first half second) every 6 to 48 s.
// And the aeroplane itself moved a whole pixel at a time: the sub-pixel
// remainder was read from latLngToLayerPoint, which Leaflet rounds.
// Now every flight goes through _gateCamFly (the follower never cuts it);
// between flights the map holds still on whole pixels (Leaflet draws it soft
// between them: measured in Chrome, half a pixel off loses more than half the
// fine detail) while the aeroplane glides across it, and one smooth glide,
// starting and ending at rest, reframes it near the side (_gateCamFollow); a
// new view starts on the drawn aeroplane (_gateCamAim); and the fraction
// comes from the projected point.
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
const CAM = ['_gateCamFly', '_gateCamFresh', '_gateCamSpot', '_gateCamAim', '_gateCamSnap', '_gateCamFollow', '_gateCamWantNow'];

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
const frac = (v) => Math.abs(v - Math.round(v));

// A map with the parts of Leaflet the camera uses. The centre is kept as a
// projected point, so a raw pan of a fraction of a pixel is exact; the pane
// moves against it, as Leaflet's map pane does (a setView here starts it
// again at 0, as a reset does).
class FakeMap {
  constructor(center, zoom, size) {
    this._zoom = zoom; this._size = size; this._loaded = true;
    this._c = merc(center[0], center[1], zoom); this._pane = { x: 0, y: 0 };
    this.raw = []; this.panBys = []; this.flights = []; this.views = []; this.events = [];
  }
  getSize() { return { x: this._size[0], y: this._size[1] }; }
  getZoom() { return this._zoom; }
  getCenter() { return unmerc(this._c.x, this._c.y, this._zoom); }
  project(ll, z) { const q = llOf(ll); return merc(q.lat, q.lng, z === undefined ? this._zoom : z); }
  unproject(p, z) { const q = Array.isArray(p) ? { x: p[0], y: p[1] } : p; return unmerc(q.x, q.y, z === undefined ? this._zoom : z); }
  _getMapPanePos() { return { x: this._pane.x, y: this._pane.y }; }
  _move(d) { this._c = { x: this._c.x + d[0], y: this._c.y + d[1] }; this._pane = { x: this._pane.x - d[0], y: this._pane.y - d[1] }; }
  _rawPanBy(o) { const d = Array.isArray(o) ? o : [o.x, o.y]; this._move(d); this.raw.push(d); }
  panBy(o, opt) {
    const d = Array.isArray(o) ? o : [o.x, o.y];
    this.panBys.push({ d, opt }); this._move(d);
    this.fire('move'); this.fire('moveend');
    return this;
  }
  setView(ll, z) { const q = llOf(ll); this.views.push({ ll: q, z }); this._zoom = z; this._c = merc(q.lat, q.lng, z); this._pane = { x: 0, y: 0 }; return this; }
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
    'return { fly: _gateCamFly, fresh: _gateCamFresh, spot: _gateCamSpot, aim: _gateCamAim, snap: _gateCamSnap, follow: _gateCamFollow, wantNow: _gateCamWantNow, glide: _gateGlide, taxi: _gateTaxi };'].join('\n');
  return Object.assign({ clock }, new Function('Date', src)({ now: () => clock.t }));
}

const YQM = [46.1122, -64.6786];
const FPS = 60, DT = 1000 / FPS;

// Drives an aeroplane across a map at `speed` px/s on the screen, heading
// hdgAt(t) degrees, for `secs` seconds, the follower called every frame as the
// glide calls it. Returns what the camera did.
function drive({ speed, secs, hdgAt, lead = 0.2, zoom = 11, size = [288, 180], hop = null }) {
  const w = camWorld();
  const m = new FakeMap(YQM, zoom, size);
  let hdg = hdgAt(0);
  let p = m.project(YQM);
  let ll = YQM.slice();
  assert.equal(w.aim(m, ll, hdg, lead), true);
  m.views.length = 0; m.events.length = 0;   // the start; what follows is the follower
  const [W, H] = size;
  const out = { m, w, worstDv: 0, worstStep: 0, outOfView: 0, outOfMiddle: 0, softAtRest: 0, movingFrames: 0, glides: 0, moveend: 0, offAfterHop: 0 };
  let last = null, wasMoving = false;
  for (let f = 1; f <= secs * FPS; f++) {
    const t = f / FPS;
    hdg = hdgAt(t);
    p = { x: p.x + Math.sin(hdg * R) * speed / FPS, y: p.y - Math.cos(hdg * R) * speed / FPS };
    if (hop && f === Math.round(hop.at * FPS)) p = { x: p.x + hop.dx, y: p.y + hop.dy };
    const q = m.unproject(p);
    ll = [q.lat, q.lng];
    w.clock.t += DT;
    const c0 = { x: m._c.x, y: m._c.y };
    const ev0 = m.events.length;
    w.follow(m, ll, DT, hdg, lead);
    out.moveend += m.events.slice(ev0).filter((e) => e === 'moveend').length;
    const step = { x: m._c.x - c0.x, y: m._c.y - c0.y };
    const moving = Math.hypot(step.x, step.y) > 0.6;   // a glide, not the half-pixel snap
    if (moving && !wasMoving) out.glides++;
    wasMoving = moving;
    if (moving) out.movingFrames++;
    const nearHop = hop && t >= hop.at - 1e-9 && t < hop.at + 1.5;
    if (last && !nearHop) out.worstDv = Math.max(out.worstDv, Math.hypot(step.x - last.x, step.y - last.y));
    if (!nearHop) out.worstStep = Math.max(out.worstStep, Math.hypot(step.x, step.y));
    last = step;
    const s = m.screen(ll);
    if (s.x < 0 || s.y < 0 || s.x > W || s.y > H) { out.outOfView++; if (hop && t >= hop.at) out.offAfterHop++; }
    if (!nearHop && (Math.abs(s.x - W / 2) > 0.4 * W || Math.abs(s.y - H / 2) > 0.4 * H)) out.outOfMiddle++;
    // at rest the map is on whole pixels, where Leaflet draws it sharp
    if (!m._fidsCam || !m._fidsCam.gl) { const pp = m._getMapPanePos(); if (frac(pp.x) > 1e-6 || frac(pp.y) > 1e-6) out.softAtRest++; }
  }
  return out;
}

test('the map holds still and sharp while the aeroplane crosses it; near the side one smooth glide reframes it', () => {
  // cruise at z6, the approach at z11 and z13 (0.1, 2.4 and 6.2 px/s on the rail map)
  for (const speed of [0.1, 2.4, 6.2]) {
    for (const h0 of [0, 70, 135, 250]) {
      const r = drive({ speed, secs: 120, hdgAt: () => h0 });
      const tag = speed + ' px/s, ' + h0 + '°';
      assert.ok(r.worstDv < 0.02, tag + ': the camera step changes by ' + r.worstDv.toFixed(4) + ' px a frame');
      assert.equal(r.outOfView, 0, tag + ': in view');
      assert.equal(r.outOfMiddle, 0, tag + ': never in the outer tenth');
      assert.equal(r.softAtRest, 0, tag + ': on whole pixels whenever the camera rests');
      assert.ok(r.moveend <= 1.2 * 120, tag + ': ' + r.moveend + ' moveend');
      assert.equal(r.m.panBys.length + r.m.flights.length + r.m.views.length, 0, tag + ': only raw pans');
      assert.ok(r.movingFrames <= 0.35 * 120 * FPS, tag + ': moving ' + (r.movingFrames / FPS).toFixed(1) + ' s of 120');
    }
  }
  // cruise: the aeroplane creeps 12 px in two minutes and the map never moves
  assert.equal(drive({ speed: 0.1, secs: 120, hdgAt: () => 90 }).m.raw.length, 0, 'not one pan at cruise');
  // the approach: about one reframe a minute, each one glide
  const appr = drive({ speed: 2.4, secs: 120, hdgAt: () => 90 });
  assert.ok(appr.glides >= 1 && appr.glides <= 3, appr.glides + ' glides');
});

test('on the taxi round its turns, and on the big map, the same', () => {
  // 12 px/s on the ground at z17: straight, a right angle in 6 s, straight, back the other way
  const hdgAt = (t) => { const c = t % 40; return c < 10 ? 90 : c < 16 ? 90 + (c - 10) * 15 : c < 26 ? 180 : c < 32 ? 180 - (c - 26) * 15 : 90; };
  const r = drive({ speed: 12, secs: 120, hdgAt, zoom: 17 });
  assert.ok(r.worstDv < 0.03, 'taxi: step change ' + r.worstDv.toFixed(4));
  assert.equal(r.outOfView, 0);
  assert.equal(r.softAtRest, 0);
  assert.ok(r.moveend <= 1.2 * 120, r.moveend + ' moveend');
  const big = drive({ speed: 8, secs: 120, hdgAt: () => 200, size: [1280, 640], zoom: 13 });
  assert.ok(big.worstDv < 0.03, 'big map: step change ' + big.worstDv.toFixed(4));
  assert.deepEqual([big.outOfView, big.outOfMiddle, big.softAtRest], [0, 0, 0]);
});

test('a jump at a new fix: no lurch inside the picture; off it, back within about half a second; past a map away, one flight', () => {
  const small = drive({ speed: 2.4, secs: 60, hdgAt: () => 60, hop: { at: 20, dx: 0, dy: 45 } });
  assert.equal(small.outOfView, 0, 'a 45 px jump stays in view');
  assert.ok(small.worstStep < 1.5, small.worstStep.toFixed(2) + ' px in a frame at most');
  assert.equal(small.softAtRest, 0);
  // the review cases: 200 and 285 px across a 288 px map heading north, 140
  // and 175 px down a 180 px map heading east (the slow pull left these off
  // the picture for 1 to 2.4 s), and 600 px on the big map
  const cases = [[0, 200, 0], [0, 285, 0], [90, 0, 140], [90, 0, 175]];
  for (const [h, dx, dy] of cases) {
    const r = drive({ speed: 2.4, secs: 30, hdgAt: () => h, hop: { at: 10, dx, dy } });
    assert.ok(r.offAfterHop > 0 && r.offAfterHop <= 0.6 * FPS, h + '°, ' + (dx || dy) + ' px: off the picture ' + (r.offAfterHop / FPS).toFixed(2) + ' s');
    assert.equal(r.m.flights.length, 0, 'inside a map: a glide, not a flight');
    assert.equal(r.softAtRest, 0);
  }
  const big = drive({ speed: 8, secs: 30, hdgAt: () => 90, size: [1280, 640], zoom: 13, hop: { at: 10, dx: 0, dy: 600 } });
  assert.ok(big.offAfterHop <= 0.6 * FPS, 'big map: off ' + (big.offAfterHop / FPS).toFixed(2) + ' s');
  // a jump past the map size: one flight, to the follow spot, and no raw pan with it
  const w = camWorld(), m = new FakeMap(YQM, 11, [288, 180]);
  w.aim(m, YQM, 90, 0.2);
  w.clock.t += DT; w.follow(m, YQM, DT, 90, 0.2);
  const far = m.unproject({ x: m.project(YQM).x + 600, y: m.project(YQM).y });
  w.clock.t += DT;
  const raw0 = m.raw.length;
  w.follow(m, [far.lat, far.lng], DT, 90, 0.2);
  assert.equal(m.flights.length, 1);
  assert.equal(m.raw.length, raw0);
  assert.ok(nm(m.flights[0].ll, w.spot(m, [far.lat, far.lng], 90, 11, 0.2)) < 0.01, 'to the follow spot of the new place');
  assert.deepEqual([m.flights[0].z, m.flights[0].opt.duration], [11, 1.6]);
});

test('it never moves while a flight has the camera, between two zoom levels, or on a map not loaded, hidden or 0 x 0', () => {
  const w = camWorld();
  const m = new FakeMap(YQM, 11, [288, 180]);
  m._fidsCamFly = w.clock.t + 2000;
  let p = m.project(YQM);
  const step = (dx) => { w.clock.t += DT; p = { x: p.x + dx, y: p.y }; const q = m.unproject(p); return w.follow(m, [q.lat, q.lng], DT, 90, 0.2); };
  for (let f = 0; f < 100; f++) assert.equal(step(1), false);
  assert.equal(m.raw.length + m.panBys.length + m.flights.length, 0, 'not a pixel during the flight (the aeroplane went 100 px)');
  w.clock.t += 400;
  for (let f = 0; f < 120; f++) step(0.2);
  assert.ok(m.raw.length > 0, 'once it has landed, the aeroplane past the side is reframed');
  // between two zoom levels: a flight whose last frame came late
  const z = new FakeMap(YQM, 11, [288, 180]);
  z._zoom = 11.4;
  let pz = z.project(YQM);
  for (let f = 0; f < 120; f++) {
    w.clock.t += DT; pz = { x: pz.x + 2, y: pz.y }; const q = z.unproject(pz);
    assert.equal(w.follow(z, [q.lat, q.lng], DT, 90, 0.2), false);
  }
  assert.deepEqual([z.raw.length, z.flights.length, z._fidsCam], [0, 0, undefined], 'no move, no flight, nothing recorded');
  assert.equal(w.fly(z, YQM, 11.6, 1.6), true);
  assert.equal(z.flights[0].z, 12, 'a flight always goes to a whole zoom');
  for (const bad of [{ size: [0, 0] }, { size: [30, 200] }, { loaded: false }]) {
    const b = new FakeMap(YQM, 11, bad.size || [288, 180]);
    if (bad.loaded === false) b._loaded = false;
    for (let f = 0; f < 30; f++) { w.clock.t += DT; assert.equal(w.follow(b, [YQM[0], YQM[1] + f * 0.01], DT, 90, 0.2), false); }
    assert.equal(b.raw.length + b.panBys.length + b.flights.length + b.events.length, 0, JSON.stringify(bad));
    assert.equal(w.aim(b, YQM, 90, 0.2), false, 'aim waits too: ' + JSON.stringify(bad));
  }
  assert.equal(w.follow(null, YQM, DT, 90, 0.2), false);
  assert.equal(w.follow(m, null, DT, 90, 0.2), false);
});

test('without the raw pan it falls back to whole-pixel pans, never a zero one', () => {
  const w = camWorld();
  const m = new FakeMap(YQM, 11, [288, 180]);
  m._rawPanBy = undefined;
  let p = m.project(YQM);
  for (let f = 0; f < 120 * FPS; f++) {
    w.clock.t += DT;
    p = { x: p.x + 6.2 / FPS, y: p.y };
    const q = m.unproject(p);
    w.follow(m, [q.lat, q.lng], DT, 90, 0.2);
  }
  assert.ok(m.panBys.length > 50, m.panBys.length + ' pans');
  for (const pb of m.panBys) {
    assert.ok(Number.isInteger(pb.d[0]) && Number.isInteger(pb.d[1]), 'whole pixels: ' + pb.d);
    assert.ok(pb.d[0] !== 0 || pb.d[1] !== 0, 'never a zero pan (Leaflet answers it with a moveend)');
    assert.equal(pb.opt.animate, false);
  }
});

test('a new view starts on the drawn aeroplane at once, with a setView; the flight and the new-view rules', () => {
  const w = camWorld();
  // built on the raw fix; the aeroplane is drawn 6.8 nm on (60 s at 408 kt)
  const raw = [45.9, -66.2];
  const m = new FakeMap(raw, 11, [288, 180]);
  const drawn = (() => { const p = m.project(raw), q = m.unproject({ x: p.x + 6.8 * 35, y: p.y }); return [q.lat, q.lng]; })();
  m._fidsWantZoom = 12; m._fidsCamFly = w.clock.t - 1; m._fidsCam = { gl: { t0: 0 } };
  assert.equal(w.aim(m, drawn, 90, 0.2), true);
  assert.equal(m.views.length, 1, 'one setView (it stops a pan or flight still running, a panBy would not)');
  assert.equal(m.panBys.length + m.raw.length, 0);
  const s = m.screen(drawn);
  assert.ok(Math.abs(s.x - (144 - 0.2 * 288)) < 1e-6 && Math.abs(s.y - 90) < 1e-6, 'the aeroplane at the follow spot: ' + s.x.toFixed(2) + ',' + s.y.toFixed(2));
  assert.deepEqual([m._fidsWantZoom, m._fidsCamFly, m._fidsCam], [null, 0, null], 'what the old view left is dropped');
  assert.equal(w.aim(m, drawn, 90, 0.2), true);
  assert.equal(m.views.length, 1, 'already there: no second move');
  // the flight helper: a guard past its own end, a fresh follower, the duration
  const f = new FakeMap(raw, 11, [288, 180]);
  f._fidsCam = { gl: {} };
  assert.equal(w.fly(f, drawn, 12, 3.0), true);
  assert.equal(f._fidsCamFly, w.clock.t + 3300);
  assert.equal(f._fidsCam, null);
  assert.deepEqual([f.flights.length, f.flights[0].z, f.flights[0].opt.duration], [1, 12, 3.0]);
  assert.equal(w.fly(null, drawn, 12, 3.0), false);
  // a view is new only on a new marker, or while it waits for its first aim
  const mk = {}, other = {};
  assert.equal(w.fresh(null, mk), true);
  assert.equal(w.fresh({ marker: other }, mk), true);
  assert.equal(w.fresh({ marker: mk }, mk), false, 'the same marker keeps its camera and its asked zoom');
  assert.equal(w.fresh({ marker: mk, fresh: true }, mk), true);
  // back on whole pixels at rest
  const g = new FakeMap(raw, 11, [288, 180]);
  g._rawPanBy([0.3, -0.45]);
  assert.equal(w.snap(g), true);
  assert.deepEqual([frac(g._pane.x), frac(g._pane.y)].map((v) => v < 1e-9), [true, true]);
  assert.equal(w.snap(g), false, 'already whole');
});

test('a zoom asked at a new fix with no glide left to fly it is flown, to the aeroplane; it waits for a landing flight; never on the taxi', () => {
  const w = camWorld();
  const mk = { getLatLng: () => ({ lat: 45.95, lng: -66.0 }) };
  const m = new FakeMap(YQM, 11, [288, 180]);
  m._fidsWantZoom = 12; w.glide.raf = 7;
  assert.equal(w.wantNow(m, mk), false, 'a running glide flies it on its next frame');
  assert.equal(m._fidsWantZoom, 12);
  w.glide.raf = null; m._fidsCamFly = w.clock.t + 1000;
  assert.equal(w.wantNow(m, mk), false, 'a flight is landing: it waits');
  assert.equal(m._fidsWantZoom, 12);
  m._fidsCamFly = 0;
  assert.equal(w.wantNow(m, mk), true);
  assert.deepEqual([m.flights.length, m.flights[0].z, m._fidsWantZoom], [1, 12, null]);
  assert.ok(nm(m.flights[0].ll, [45.95, -66.0]) < 1e-6, 'to the aeroplane where it is drawn');
  m._fidsWantZoom = 13; m._fidsCamFly = 0; w.taxi.on = true;
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
  assert.match(glide, /_gateCamFollow\(vmap, \[lat, vlng\], _dtMs, v\.hdg, 0\.2\)/);
  assert.match(glide, /if \(_gateCamAim\(vmap, \[lat, vlng\], v\.hdg, 0\.2\)\) v\.fresh = false;\s*\} else if \(vmap\._fidsCamFly > Date\.now\(\)\) \{/, 'a zoom asked waits for a landing flight');
  assert.match(glide, /_gateCamFly\(vmap, _gateCamSpot\(vmap, \[lat, vlng\], v\.hdg, _wz, 0\.2\), _wz, 3\.0\)/);
  assert.match(glide, /var _lp = vmap\.project\(\[lat, vlng\]\);/);
  assert.match(glide, /var _prevView = _gateGlide\.views\[_viewKey\];[^\n]*\n\s*if \(!_sameLeg\) _gateGlide\.views = \{\};/, 'judged on the view before a leg reset');
  assert.match(glide, /fresh: _gateCamFresh\(_prevView, marker\) \};/);
  assert.match(glide, /var _jv = _gateGlide\.views\[_viewKey\];\s*_gateGlide\.views\[_viewKey\] = \{[^}]*fresh: _gateCamFresh\(_jv, marker\) \};/, 'the no-speed join too');
  assert.match(taxi, /_gateCamFollow\(vmap, here, dt \* 1000, v\.hdg, 0\.2\)/);
  assert.match(taxi, /var lp = vmap\.project\(\[ll\[0\], ll\[1\] \+ vk\]\);/);
  assert.match(fnSource('_gateApplyParked'), /_gateCamFly\(vm, \[lat, lng\], gz, 1\.6\)/);
  assert.match(fnSource('_gateCamAim'), /m\.setView\(at, z, \{ animate: false \}\)/);
  assert.doesNotMatch(fnSource('_gateCamAim'), /panBy/);
  // one flyTo in the whole board, and it is the helper's
  const flies = CORE.split('\n').filter((l) => /\.flyTo\(/.test(l) && !/^\s*\/\//.test(l));
  assert.equal(flies.length, 1, flies.join('\n'));
  assert.ok(fnSource('_gateCamFly').includes(flies[0].trim()));
  for (const n of CAM) {
    assert.doesNotMatch(fnSource(n), /fetch\(|\/adsb\/|_adsbTelemetry|_adsbCached/, n + ' cannot spend an FR24 credit');
    const comments = fnSource(n).split('\n').filter((l) => /^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(comments, /['{}]/, n + ': no apostrophe or brace in a comment (the brace matchers in other tests)');
  }
  const head = CORE.slice(CORE.indexOf('// v24181 — THE CAMERA FOLLOWS THE AEROPLANE AS IT IS DRAWN.'), CORE.indexOf('\nfunction _gateCamFly('));
  assert.ok(head.length > 200);
  assert.doesNotMatch(head, /['{}]/);
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

test('the real glide: the new view is put on the drawn aeroplane, the map then holds still and sharp, a new zoom is one flight to where it is drawn, never to the raw fix', () => {
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
  const inView = () => { const s = m.screen(marker._ll); return s.x > 0 && s.x < 288 && s.y > 0 && s.y < 180; };
  const whole = () => frac(m._pane.x) < 1e-6 && frac(m._pane.y) < 1e-6;
  let at = g.fix(raw1, 300, 60000);
  g.start(m, O, D, raw1[0], raw1[1], marker, a1, a2, 300, 'YQM', at);
  g.frame();
  assert.equal(m.views.length, 1, 'the new view is moved once, on its first frame');
  const drawn1 = marker._ll.slice();
  assert.ok(nm(drawn1, raw1) > 4, 'the aeroplane is drawn its age times its speed past the raw fix: ' + nm(drawn1, raw1).toFixed(1) + ' nm');
  const s1 = m.screen(drawn1), off1 = Math.hypot(s1.x - 144, s1.y - 90);
  assert.ok(off1 > 0.2 * 180 - 1 && off1 < 0.2 * 288 + 1, 'at the follow spot, a fifth of the map behind the middle: ' + s1.x.toFixed(1) + ',' + s1.y.toFixed(1));
  // the fraction Leaflet drops, from the projected point
  const pr = m.project(drawn1), tr = /translate\(([-\d.]+)px,([-\d.]+)px\)/.exec(div.style.transform);
  assert.ok(tr && Math.abs(+tr[1] - (pr.x - Math.round(pr.x))) < 0.002 && Math.abs(+tr[2] - (pr.y - Math.round(pr.y))) < 0.002, div.style.transform);
  // 30 s on: the aeroplane crosses 22 px of the middle and the map holds still on whole pixels
  for (let f = 0; f < 30 * FPS; f++) { g.frame(); assert.ok(inView()); }
  assert.deepEqual([m.views.length, m.panBys.length, m.flights.length, m.raw.length], [1, 0, 0, 0], 'no second jump, no flight, no pan');
  assert.ok(whole());
  // an in-place re-anchor on the same marker: a fix half a mile past where it
  // was first drawn, a minute old, with a new zoom asked
  const raw2 = (() => { const b = vm.runInContext('_gcBrgDeg', g.ctx)(raw1, D); return vm.runInContext('_gcDestPt', g.ctx)(drawn1, b, 0.5); })();
  at = g.fix(raw2, 300, 60000);
  m._fidsWantZoom = 10;
  g.start(m, O, D, raw2[0], raw2[1], marker, a1, a2, 300, 'YQM', at);
  g.frame();
  assert.equal(m.views.length, 1, 'an in-place re-anchor is not a new view: no jump');
  assert.equal(m.flights.length, 1, 'one flight for the new zoom');
  assert.deepEqual([m.flights[0].z, m.flights[0].opt.duration], [10, 3.0]);
  const drawn2 = marker._ll.slice();
  const want = vm.runInContext('_gateCamSpot', g.ctx)(m, drawn2, g.glide().views.mini.hdg, 10, 0.2);
  assert.ok(nm(m.flights[0].ll, want) < 0.05, 'to the follow spot of the aeroplane as drawn after the fix');
  assert.ok(nm(m.flights[0].ll, raw2) > nm(drawn2, raw2), 'ahead of the drawn aeroplane, never back toward the raw fix');
  assert.equal(m._fidsWantZoom, null, 'asked once, flown once');
  // a second zoom asked while it flies waits for the landing, then flies once
  m._fidsWantZoom = 11;
  for (let f = 0; f < 3 * FPS; f++) g.frame();
  assert.deepEqual([m.flights.length, m.raw.length], [1, 0], 'the follower and the new zoom leave the flight alone');
  for (let f = 0; f < 1 * FPS; f++) g.frame();
  assert.deepEqual([m.flights.length, m.flights[1].z], [2, 11], 'then the zoom asked meanwhile, once');
  // two minutes on at z11: the map holds, then reframes in one glide, always sharp at rest
  for (let f = 0; f < 4 * FPS; f++) g.frame();
  const raw0 = m.raw.length;
  let softAtRest = 0;
  for (let f = 0; f < 120 * FPS; f++) {
    g.frame();
    assert.ok(inView(), 'in view');
    if (!(m._fidsCam && m._fidsCam.gl) && !whole()) softAtRest++;
  }
  assert.ok(m.raw.length > raw0, 'the aeroplane reached the side and was reframed');
  assert.equal(softAtRest, 0, 'on whole pixels whenever the camera rests');
  assert.equal(m.flights.length, 2, 'no other flight');
});
