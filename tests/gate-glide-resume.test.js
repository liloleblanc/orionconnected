'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24034 — THE AEROPLANE ON THE MAP FLIES THE WAY IT IS FLYING.
//
// Moncton, AC1986 inbound from Toronto, 2026-10-11, watched live: the
// aeroplane cut sharp turns, flew sideways and backed up, then landed and sat
// "crashed" over Scoudouc at 0 ft.
//
//   1. Every fix rebuilds the route through the aeroplane (the recorded track,
//      a runway-aligned final). The glide resumed at the OLD route's fraction,
//      which on the NEW route is another spot: behind, beside, round a bend.
//      It now resumes from where the marker is DRAWN, measured on the new
//      route (_gateRouteFrac), and the error is flown off forward as before.
//   2. The nose's heading carries across that re-anchor, so it turns from
//      where it points instead of snapping onto the new route's bend.
//   3. On the ground the speed is 0, so no glide restarts and the marker
//      stayed where the last airborne glide left it. The first ground fix,
//      and the feed's own Arrived, now redraw the map as a fresh load does.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) return CORE.slice(at, i + 1);
  }
  throw new Error('no end for ' + name);
}
const frac = new Function(fnSource('_gateRouteFrac') + '\nreturn _gateRouteFrac;')();
function cumOf(route) {
  const nm = (a, b) => { const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2;
    return 2 * 3440.065 * Math.asin(Math.sqrt(h)); };
  const c = [0];
  for (let i = 1; i < route.length; i++) c.push(c[i - 1] + nm(route[i - 1], route[i]));
  return c;
}

test('a drawn point is measured on the route by distance: middle, beside, before and past the ends', () => {
  // Toronto to Moncton, roughly: a straight leg
  const route = [[43.68, -79.63], [44.9, -73.0], [46.11, -64.68]];
  const cum = cumOf(route), total = cum[cum.length - 1];
  const mid = frac(route, cum, total, [44.9, -73.0]);
  assert.ok(Math.abs(mid - cum[1] / total) < 1e-6, 'the middle vertex is where its distance says');
  const beside = frac(route, cum, total, [45.1, -73.0]);
  assert.ok(Math.abs(beside - mid) < 0.02, 'a point 12 nm off the line projects across onto it, not along it');
  assert.equal(frac(route, cum, total, [43.0, -82.0]), 0, 'before the start is the start');
  assert.equal(frac(route, cum, total, [46.3, -63.0]), 1, 'past the end is the end');
  assert.equal(frac([[0, 0]], [0], 0, [0, 0]), null, 'no route, no answer');
});

test('the old fraction on a rebuilt route lands elsewhere; the drawn spot does not', () => {
  // the route before the fix, and after it: rebuilt through a fix 30 nm on,
  // with a runway-aligned final that bends at the end
  const before = [[45.6, -68.0], [46.11, -64.68]];
  const after = [[45.6, -68.0], [45.75, -67.3], [45.95, -66.0], [46.05, -65.2], [46.11, -64.68]];
  const cb = cumOf(before), ca = cumOf(after);
  const drawn = [45.8, -66.8];                                  // where the marker is drawn
  const pOld = frac(before, cb, cb[cb.length - 1], drawn);     // its fraction on the old route
  const pNew = frac(after, ca, ca[ca.length - 1], drawn);      // measured on the new route
  const at = (route, cum, f) => {
    const target = f * cum[cum.length - 1]; let k = 0;
    while (k < route.length - 2 && cum[k + 1] < target) k++;
    const t = (target - cum[k]) / (cum[k + 1] - cum[k]);
    return [route[k][0] + (route[k + 1][0] - route[k][0]) * t, route[k][1] + (route[k + 1][1] - route[k][1]) * t];
  };
  const gap = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180)) * 60;   // nm
  assert.ok(gap(at(after, ca, pNew), drawn) < gap(at(after, ca, pOld), drawn), 'resuming at the drawn spot is the shorter step');
  assert.ok(gap(at(after, ca, pNew), drawn) < 6, 'and it stays beside where the aeroplane was drawn');
});

test('the glide resumes a fix from the drawn spot, keeps the nose, and publishes where it draws', () => {
  const glide = fnSource('_startGateMapGlide');
  assert.match(glide, /var _pDrawn = _gateRouteFrac\(route, _cum, _routeNm, _gateGlide\.ll\);/);
  assert.match(glide, /var _dp = _seedP - _pRes;/);
  assert.match(glide, /p = _pRes;\s*_errP = _dp;/);
  assert.doesNotMatch(glide, /p = _gateGlide\.p;\s*_errP/, 'never the old route\'s fraction');
  assert.match(glide, /var _keepHdg = \(_oldView && typeof _oldView\.hdg === 'number'\) \? _oldView\.hdg : null;/);
  assert.match(glide, /hdg: _keepHdg, kept: _keepHdg !== null,/);
  assert.match(glide, /if \(Math\.abs\(_dh\) > 35 && !v\.kept\) \{ v\.hdg = _tgt; \}/, 'a carried nose turns, never snaps');
  assert.match(glide, /vmarker\.setLatLng\(\[lat, lng\]\);\s*_gateGlide\.ll = \[lat, lng\];/);
  // a negative correction is still never flown: the marker holds and the
  // real aeroplane catches up (unchanged from v22927)
  assert.match(glide, /_errP/);
});

test('touchdown and the feed\'s Arrived redraw the map, once, instead of leaving the aeroplane on the approach', () => {
  const poll = fnSource('_gateNumbersPoll');
  assert.match(poll, /if \(_adsb\.onGround === true\) \{[\s\S]*?if \(inb\._liveOnGround !== true\) \{\s*try \{ _stopGateMapGlide\(\); \} catch \(eSt\) \{\}\s*window\._lastMapPosKey = null; window\._lastMapProgKey = null;\s*\}\s*inb\._liveOnGround = true;/);
  assert.match(poll, /window\._gateInboundLivePos = null;\s*\/\/[^\n]*\n[^\n]*\n\s*try \{ _stopGateMapGlide\(\); \} catch \(eSt\) \{\}\s*window\._lastMapPosKey = null; window\._lastMapProgKey = null;/);
});
