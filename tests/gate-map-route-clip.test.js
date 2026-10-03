'use strict';

// WHY THIS EXISTS
//
// v23934. Every route line on the gate maps is drawn with Leaflet's noClip,
// which hands all of its vertices to the SVG unclipped. Since the stand views
// sit at z15-17, Moncton gate 1's dashed route to Calgary ran to
// x = -4,597,028 px on a 380x433 map, and the screen at the gate painted that
// path as a solid white wedge over the terminal (the open path filled, closed
// by a straight line back to the stand). A noClip line now keeps today's
// behaviour while it fits within 4096 px of the frame, and a longer one is cut
// to that padded frame, so no vertex sits millions of pixels off the map.
//
// _fidsRouteClipParts is lifted from the real source and driven with a port
// of Leaflet 1.9.4's own clipSegment (the version the boards load from
// /mapcdn), on the real gate-1 stand and the real 100-vertex arc to Calgary.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const YQM = JSON.parse(fs.readFileSync(path.join(root, 'fids-current', 'data', 'gates', 'YQM.json'), 'utf8'));

function fnSource(name) {
  const i = CORE.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1);
}
const clipParts = new Function('return (' + fnSource('_fidsRouteClipParts') + ')')();
const PAD = Number((CORE.match(/var _FIDS_ROUTE_CLIP_PAD = (\d+);/) || [])[1]);

// Leaflet 1.9.4 LineUtil.clipSegment (Cohen-Sutherland), ported verbatim in
// behaviour: it returns the SAME point object for an end that is inside, which
// is what the part-splitting test (seg[1] !== pts[j + 1]) depends on.
let lastCode;
function bitCode(p, b) {
  let c = 0;
  if (p.x < b.min.x) c |= 1; else if (p.x > b.max.x) c |= 2;
  if (p.y < b.min.y) c |= 4; else if (p.y > b.max.y) c |= 8;
  return c;
}
function edge(a, b, code, bounds, round) {
  const dx = b.x - a.x, dy = b.y - a.y, min = bounds.min, max = bounds.max;
  let x, y;
  if (code & 8) { x = a.x + dx * (max.y - a.y) / dy; y = max.y; }
  else if (code & 4) { x = a.x + dx * (min.y - a.y) / dy; y = min.y; }
  else if (code & 2) { x = max.x; y = a.y + dy * (max.x - a.x) / dx; }
  else if (code & 1) { x = min.x; y = a.y + dy * (min.x - a.x) / dx; }
  return round ? { x: Math.round(x), y: Math.round(y) } : { x, y };
}
function clipSegment(a, b, bounds, useLastCode, round) {
  let codeA = useLastCode ? lastCode : bitCode(a, bounds), codeB = bitCode(b, bounds);
  lastCode = codeB;
  for (;;) {
    if (!(codeA | codeB)) return [a, b];
    if (codeA & codeB) return false;
    const out = codeA || codeB, p = edge(a, b, out, bounds, round), nc = bitCode(p, bounds);
    if (out === codeA) { a = p; codeA = nc; } else { b = p; codeB = nc; }
  }
}

// The great circle leaflet-arc samples (100 vertices), in Web Mercator pixels.
const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
function arc(from, to, n) {
  const [p1, l1] = from.map(rad), [p2, l2] = to.map(rad);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([deg(Math.atan2(z, Math.sqrt(x * x + y * y))), deg(Math.atan2(y, x))]);
  }
  return out;
}
function project([lat, lng], z) {
  const s = 256 * 2 ** z, sin = Math.sin(rad(lat));
  return { x: s * (lng + 180) / 360, y: s * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) };
}
// A 380x433 small map centred on the stand; the SVG renderer's frame is the
// map grown by its 0.1 padding (the live overlay read viewBox -38 -43 456 520).
function scene(z, to) {
  const stand = YQM.stands.BR2.slice(0, 2);     // gate 1's jet stand
  const c = project(stand, z);
  const ring = arc(stand, to, 100).map((ll) => { const p = project(ll, z); return { x: p.x - c.x + 190, y: p.y - c.y + 216.5 }; });
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
  return {
    ring,
    pxBounds: { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } },
    frame: { min: { x: -38, y: -43 }, max: { x: 418, y: 476 } },
  };
}
const YYC = [51.11, -114.02];

test('the gate-1 route to Calgary at the stand view: millions of pixels off the frame before, never more than the pad after', () => {
  assert.equal(PAD, 4096);
  const s = scene(17, YYC);
  assert.ok(s.pxBounds.min.x < -4e6, 'the unclipped line really does run millions of pixels off the map (' + Math.round(s.pxBounds.min.x) + ')');
  const parts = clipParts([s.ring], s.pxBounds, s.frame, PAD, clipSegment);
  assert.ok(Array.isArray(parts) && parts.length === 1, 'one continuous visible part');
  for (const p of parts[0]) {
    assert.ok(p.x >= s.frame.min.x - PAD - 1 && p.x <= s.frame.max.x + PAD + 1, 'x within the pad: ' + p.x);
    assert.ok(p.y >= s.frame.min.y - PAD - 1 && p.y <= s.frame.max.y + PAD + 1, 'y within the pad: ' + p.y);
  }
  // It still starts at the stand (the very object, so the dashes stay
  // anchored there) and leaves it on the same heading as before.
  assert.equal(parts[0][0], s.ring[0]);
  const a = parts[0][0], b = parts[0][1];
  const hdg = (deg(Math.atan2(b.x - a.x, -(b.y - a.y))) + 360) % 360;
  assert.ok(Math.abs(hdg - 297) < 2, 'the visible line still heads 297 deg: ' + hdg.toFixed(1));
});

test('a line that fits within the pad is left to Leaflet exactly as before', () => {
  // The same route at the zoom a route view uses fits the frame many times over.
  const s = scene(4, YYC);
  assert.ok(s.pxBounds.min.x > s.frame.min.x - PAD);
  assert.equal(clipParts([s.ring], s.pxBounds, s.frame, PAD, clipSegment), null);
});

test('the hook is Leaflet\'s polyline clip only, installs once at load, before any map is built', () => {
  const at = CORE.indexOf('L.Polyline.prototype._clipPoints = function () {');
  assert.ok(at >= 0, 'the hook exists');
  // The first L.map( that is code, not a comment mentioning it.
  let firstMap = -1;
  for (let i = CORE.indexOf('L.map('); i >= 0; i = CORE.indexOf('L.map(', i + 1)) {
    const line = CORE.slice(CORE.lastIndexOf('\n', i) + 1, i);
    if (!/^\s*(\/\/|\*)/.test(line)) { firstMap = i; break; }
  }
  assert.ok(firstMap > 0 && at < firstMap, 'installed in the source before the first map is built');
  const hook = CORE.slice(CORE.lastIndexOf('(function () {', at), CORE.indexOf('})();', at));
  assert.match(hook, /L\.Polyline\.prototype\._fidsClipGuard\) return;/, 'installed once');
  assert.match(hook, /if \(!this\.options \|\| !this\.options\.noClip \|\| !rb \|\| !this\._pxBounds/, 'only noClip lines are touched; every other line keeps Leaflet\'s clipping');
  assert.match(hook, /if \(!this\._pxBounds\.intersects\(rb\)\) return _orig\.call\(this\);/, 'a line wholly off the frame is Leaflet\'s own answer (nothing drawn)');
  assert.match(hook, /_fidsRouteClipParts\(this\._rings, this\._pxBounds, rb, _FIDS_ROUTE_CLIP_PAD, L\.LineUtil\.clipSegment\)/);
  assert.doesNotMatch(hook, /L\.Polygon/, 'polygons keep their own clipper');
});
