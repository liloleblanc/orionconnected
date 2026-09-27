'use strict';

// WHY THIS EXISTS
//
// Reported with a screenshot: the big map at street level over Calgary, a
// solid line from the airport's pin to a point on the apron, then dashed to
// Moncton, and the aeroplane icon 800 m from both. Measured on the board:
// FR24 had C-GWJO at a Calgary gate (speed 0, altitude 0), but the worker
// dropped altitude 0, so no FR24 fix was ever "on the ground"; the board then
// drew a flown line for a flight that had not started and glided the icon on
// a stale 2 kt speed. v23905: FR24 altitude 0 is "ground", and a ground fix
// within 5 nm of the origin is parked — no flown line, no glide, route dashed
// from the aeroplane.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const WORKER = fs.readFileSync(path.join(root, 'workers', 'fids-proxy.js'), 'utf8');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');

test('an FR24 fix at altitude 0 is on the ground', () => {
  assert.match(WORKER, /alt_baro: \(typeof _p\.alt === "number" && _p\.alt > 0\) \? Math\.round\(_p\.alt\)\s*: \(typeof _p\.alt === "number" \? "ground" : void 0\),/);
});

test('a ground fix near the origin is parked', () => {
  assert.match(CORE, /function _gateParkedAtOrigin\(lat, lng, o\)/);
  assert.match(CORE, /_gcNm\(\[lat, lng\], o\) < 5/);
});

test('parked: no flown line, no glide, on both maps and in every path', () => {
  assert.match(CORE, /var _a1 = _parkedO \? L\.polyline\(\[\]/, 'small map fresh draw');
  assert.match(CORE, /var _bcA1 = _bcParked \? L\.polyline\(\[\]/, 'big map fresh draw');
  assert.match(CORE, /var _glSpd = _parkedO \? 0/);
  assert.match(CORE, /var _bcGlSpd = _bcParked \? 0/);
  const applied = CORE.match(/_gateApplyParked\(/g) || [];
  assert.ok(applied.length >= 6, 'applied in the re-anchor paths, before the no-change shortcut and in the glide loop');
  assert.match(CORE, /if \(_lpF && _lpF\.onGround === true && _gateParkedAtOrigin\(_lpF\.lat, _lpF\.lng, o\)\) \{\s*_stopGateMapGlide\(\);/,
    'a running glide stops itself once the fix is parked');
});
