'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24089 — THE AEROPLANE TURNS LIKE ONE.
//
// Watched on Moncton's gate map: "it turns but it's not turning, it's
// dragging". Three causes:
//   1. The join on to the runway's final was a corner, so the nose swung
//      round on the spot and the marker slid along the new line.
//   2. The nose pointed 0.5% of the route ahead (3 nm on Toronto–Moncton), so
//      at a turn it came round more than a minute early.
//   3. The icon only yawed: a turning aeroplane, seen from above, banks.
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
const YQM = [46.1122, -64.6786];
const RUNWAYS = { YQM: [[46.10599, -64.6943, 46.1262, -64.66766], [46.10684, -64.69436, 46.1078, -64.66285]] };
const geo = new Function('AIRPORT_RUNWAYS', ['_gcNm', '_gcBrgDeg', '_gcDestPt', '_gcFullRoute', '_runwayFinalPath'].map(fnSource).join('\n') +
  '\nreturn { final: _runwayFinalPath, nm: _gcNm, brg: _gcBrgDeg };')(RUNWAYS);
const turns = (route) => {
  const out = [];
  for (let i = 1; i < route.length - 1; i++) {
    if (geo.nm(route[i - 1], route[i]) < 1e-4 || geo.nm(route[i], route[i + 1]) < 1e-4) continue;
    const a = geo.brg(route[i - 1], route[i]), b = geo.brg(route[i], route[i + 1]);
    out.push(Math.abs(((b - a + 540) % 360) - 180));
  }
  return out;
};

test('the join on to the final is a curve, not a corner', () => {
  // AC7894's 17:28:49 fix, 19 km north of the field, for runway 24
  const pl = [46.2853, -64.7096];
  const r = geo.final(pl, YQM, 'YQM');
  assert.ok(r && r.length > 10);
  assert.deepEqual(r[0], pl, 'it still starts at the aeroplane');
  const thr = r[r.length - 2];
  assert.ok(Math.abs(thr[0] - 46.1262) < 1e-6 && Math.abs(thr[1] + 64.66766) < 1e-6, 'and lands on runway 24\'s threshold');
  const before = turns(r.slice(0, -2));
  assert.ok(Math.max(...before) < 20, 'no single bend of more than 20° before the threshold: ' + Math.max(...before).toFixed(1) + '°');
  // the whole turn on to the final is still made
  const inb = geo.brg(r[0], r[1]), fin = geo.brg(r[r.length - 3], thr);
  const total = Math.abs(((fin - inb + 540) % 360) - 180);
  assert.ok(total > 60, 'the aeroplane still turns ' + total.toFixed(0) + '° on to the final');
  // a short final is unchanged
  const near = geo.final([46.1290, -64.6640], YQM, 'YQM');
  assert.equal(near.length, 3);
});

test('the nose points where the aeroplane is going, not 3 nm ahead', () => {
  const glide = fnSource('_startGateMapGlide');
  assert.match(glide, /var _h = Math\.max\(0\.15, Math\.min\(0\.6, speedKts \* 4 \/ 3600\)\);/);
  assert.match(glide, /var _t0 = Math\.max\(0, Math\.min\(_routeNm, nmNow\) - _h\);/);
  assert.doesNotMatch(glide, /_routeNm \* 0\.005/);
});

test('it banks into the turn by its rate, 25° at rate one, level when straight', () => {
  const glide = fnSource('_startGateMapGlide');
  assert.match(glide, /var _bTgt = \(_dts > 0\) \? Math\.max\(-25, Math\.min\(25, \(_turned \/ _dts\) \* 25 \/ 3\)\) : 0;/);
  assert.match(glide, /v\.bank = \(typeof v\.bank === 'number' && isFinite\(v\.bank\)\) \? v\.bank \+ \(_bTgt - v\.bank\) \* Math\.min\(1, _dts \/ 0\.8\) : 0;/);
  assert.match(glide, /\+ \(Math\.abs\(v\.bank\) > 0\.2 \? ' scaleX\(' \+ Math\.cos\(Math\.min\(40, Math\.abs\(v\.bank\) \* 1\.5\) \* Math\.PI \/ 180\)\.toFixed\(3\) \+ '\)' : ''\);/);
  assert.doesNotMatch(glide, /perspective\(|rotateY\(/, 'no 3D transform on the icon (it smeared a wedge across the map)');
  // a snap is not a turn: it never banks the icon
  assert.match(glide, /var _turned = 0;/);
  assert.match(glide, /v\.hdg = \(v\.hdg \+ _dh \+ 360\) % 360;\s*_turned = _dh;/);
  // the arithmetic: 3°/s for a second eases to about 18°, and a straight line levels it
  let bank = 0;
  for (let f = 0; f < 60; f++) { const t = Math.max(-25, Math.min(25, (3 / 60) / (1 / 60) * 25 / 3)); bank += (t - bank) * Math.min(1, (1 / 60) / 0.8); }
  assert.ok(bank > 15 && bank < 25, bank.toFixed(1));
  for (let f = 0; f < 240; f++) bank += (0 - bank) * Math.min(1, (1 / 60) / 0.8);
  assert.ok(Math.abs(bank) < 1);
});
