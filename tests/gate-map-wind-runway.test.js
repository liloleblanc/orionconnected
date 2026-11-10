'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24141 — NEVER A TAILWIND LANDING WHEN THE WIND SAYS OTHERWISE.
//
// AC648 YYZ-YQM, 2026-11-10 (FR24 via the worker, recorded live on gate 4):
// from Toronto in the west, the bearing to the field chose runway 11 (landing
// east) and the map drew a straight-in final from the west. The wind was
// 12 km/h from 260; the aeroplane flew past north of the field at 3,775 ft and
// turned back to land on 24. The fix north of the field lay 7.5 nm off the
// route drawn a fix earlier, and the plane jumped to the other side of the
// airport. An end with more than 5 kt (9.3 km/h) of tailwind is now out, the
// ICAO limit for picking even a noise-preferred runway, and the bearing
// chooses among the rest; everything else in _runwayFinalPath is unchanged
// (an aeroplane on a centreline still lands on it).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
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
const RWCTX = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'airport-runways.js'), 'utf8').replace('var AIRPORT_RUNWAYS', 'this.AIRPORT_RUNWAYS'), RWCTX);
const RUNWAYS = RWCTX.AIRPORT_RUNWAYS;
const COORDS = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'airport-coords.js'), 'utf8'), { window: w }); return w.AIRPORT_COORDS; })();
const NAMES = ['_gcNm', '_gcBrgDeg', '_gcDestPt', '_gcFullRoute', '_rwPlaneSpec', '_rwCommitted', '_runwayFinalPath', '_gateOnFinal', '_gateLands'];
const JET = { prop: false, known: true, key: '7M8' };
// lib(track, weather): the live track the glide reads and TOMORROW_WX (MET Norway, as the weather card has it)
const lib = (trk, wx) => new Function('AIRPORT_RUNWAYS', '_gateHeading', '_mapPlaneSpec', 'window', '_gateGlide', 'TOMORROW_WX',
  NAMES.map(fnSource).join('\n') + '\nreturn {' + NAMES.map((n) => n.replace(/^_/, '') + ':' + n).join(',') + '};')(
  RUNWAYS, trk == null ? undefined : () => trk, () => JET, { _gateInbound: {} }, undefined, wx);
const wind = (dir, kmh) => ({ YQM: { current: { windDir: dir, windSpeed: kmh } } });
const TONIGHT = wind(259.8, 12.2);

// The FR24 fixes the board was given (lat, lng, track where FR24 sent one).
const AC648 = [
  ['03:15:08Z', [46.1386, -65.2774], null],   // 10,275 ft, west of the field
  ['03:18:37Z', [46.2022, -64.8772], null],   // 5,675 ft, north-west
  ['03:20:35Z', [46.2316, -64.69], null],     // 3,775 ft, north of the field
  ['03:22:36Z', [46.1767, -64.6052], 203],    // 1,850 ft, north-east, turning on to 24
  ['03:24:15Z', [46.1285, -64.6646], 222],    // 600 ft, short final 24
];
const offRoute = (p, route) => {
  let best = Infinity;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i], b = route[i + 1], k = Math.cos(p[0] * Math.PI / 180);
    const ax = (a[1] - p[1]) * k, ay = a[0] - p[0], dx = (b[1] - a[1]) * k, dy = b[0] - a[0], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy) * 60);
  }
  return best;
};
function replay(wx) {
  let prev = null;
  return AC648.map(([t, pl, trk]) => {
    const r = lib(trk, wx).runwayFinalPath(pl, COORDS.YQM, 'YQM');
    const row = { t, hdg: r && r.rw ? r.rw.hdg : null, off: prev ? offRoute(pl, prev) : 0 };
    prev = r;
    return row;
  });
}
const near = (h, want) => Math.abs(((h - want + 540) % 360) - 180) < 3;

test('AC648, 2026-11-10: with that night’s wind the map draws runway 24 from the first fix, and never jumps sides', () => {
  const rows = replay(TONIGHT);
  for (const r of rows) assert.ok(near(r.hdg, 222), `${r.t}: runway 24 (222 true), got ${r.hdg && r.hdg.toFixed(0)}`);
  const worst = Math.max(...rows.map((r) => r.off));
  assert.ok(worst < 2.5, `every fix within 2.5 nm of the route drawn a fix earlier (worst ${worst.toFixed(2)} nm)`);
});

test('without the wind (or with no more than 5 kt behind 11) the picture is exactly as before: 11 from the west, then the 7.5 nm jump', () => {
  for (const wx of [undefined, {}, wind(259.8, 5), wind(259.8, 9.3)]) {
    const rows = replay(wx);
    assert.ok(near(rows[0].hdg, 87) && near(rows[1].hdg, 87), 'straight in on 11 while the aeroplane is west of the field');
    assert.ok(near(rows[2].hdg, 222), 'north of the field the bearing turns it to 24');
    assert.ok(rows[2].off > 6, `and that fix lies ${rows[2].off.toFixed(2)} nm off the route drawn before: the jump`);
  }
});

test('a wind the arrival already faces changes nothing', () => {
  const calm = replay(undefined), east = replay(wind(80, 15));
  assert.ok(near(east[0].hdg, 87) && near(east[1].hdg, 87), 'from the west into an east wind: 11, as before');
  assert.equal(east[0].hdg, calm[0].hdg);
  assert.equal(east[1].hdg, calm[1].hdg);
});

test('a tailwind of 5 kt or less never rules a runway out; just over it does', () => {
  // Wind straight down 11 from behind (from 267, 11 lands on 087).
  const G = lib(null, wind(267, 9.2)), H = lib(null, wind(267, 9.6));
  const west = AC648[1][1];
  assert.ok(near(G.runwayFinalPath(west, COORDS.YQM, 'YQM').rw.hdg, 87), '9.2 km/h behind: 11 stays');
  assert.ok(!near(H.runwayFinalPath(west, COORDS.YQM, 'YQM').rw.hdg, 87), '9.6 km/h behind: 11 is out');
});

test('an aeroplane established on a centreline still lands there, whatever the wind', () => {
  const G = lib(87, TONIGHT);
  const rq = RUNWAYS.YQM[1], T11 = [rq[0], rq[1]], F11 = [rq[2], rq[3]];
  const h11 = G.gcBrgDeg(T11, F11);
  const onFinal = G.gcDestPt(T11, (h11 + 180) % 360, 4);       // 4 nm out on the 11 final, tracking 087
  const r = G.runwayFinalPath(onFinal, COORDS.YQM, 'YQM');
  assert.ok(near(r.rw.hdg, h11), `on the 11 final with a tailwind it lands on 11 (got ${r.rw.hdg.toFixed(0)})`);
});

test('the rule sits before the parallel-runway choice and reads the weather the board already has', () => {
  const fn = fnSource('_runwayFinalPath');
  const at = fn.indexOf('NEVER A TAILWIND LANDING');
  assert.ok(at > 0 && at < fn.indexOf('OF PARALLEL RUNWAYS, THE ONE IT IS LINED UP WITH'), 'right after the bearing pick');
  assert.match(fn, /TOMORROW_WX\[String\(destIata \|\| ''\)\.toUpperCase\(\)\]/);
  assert.match(fn, /var _tail = -_wc\.windSpeed \* Math\.cos\(\(_wc\.windDir - cw\.hdg\) \* Math\.PI \/ 180\);/);
  assert.match(fn, /if \(_tail > 9\.3\) continue;/);
});
