'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — the planet's sunlight is the board's own sun
//
// The Earth floor (fids-current/js/fids-earth.js) lights its planet from the
// sub-solar point fids-sun.js gives (fidsSun.subsolar), the same sums the
// board switches html.fids-day / fids-night on. So at the moment the board
// calls sunrise or sunset at an airport, the planet must show that airport
// exactly on its day and night line: the sun's centre at -0°50'. Checked at
// the airports and on the dates of the U.S. Naval Observatory fixture the
// day-and-night engine is held to (tests/fixtures/sun-usno-2026.json).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const JS = path.resolve(__dirname, '..', 'fids-current', 'js');
const FidsSun = require(path.join(JS, 'fids-sun.js'));
const E = require(path.join(JS, 'fids-earth.js'));
const FX = require('./fixtures/sun-usno-2026.json');

const H0 = -50 / 60;
const POINTS = Object.entries(FX.points).filter(([, p]) => Math.abs(p.lat) < 60);
const engine = FidsSun.create({
  coords: (c) => (FX.points[c] ? [FX.points[c].lat, FX.points[c].lon] : null),
  tz: (c) => (FX.points[c] ? FX.points[c].tz : null)
});

test('fids-sun.js gives the sub-solar point, and the floor reads it', () => {
  assert.equal(typeof FidsSun.subsolar, 'function');
  const ms = Date.UTC(2026, 9, 12, 22, 0);
  const s = FidsSun.subsolar(ms), f = E.sunAt(ms);
  assert.ok(Math.abs(s.lat - f.lat) < 1e-9 && Math.abs(s.lon - f.lon) < 1e-9, 'the floor uses fids-sun.js, not its own sums');
  // and the floor's own fallback agrees with it to well under a tenth of a degree
  for (let d = 0; d < 365; d += 17) {
    const t = Date.UTC(2026, 0, 1 + d, (d * 7) % 24, 13);
    const a = FidsSun.subsolar(t), b = E.sunVecLocal(t);
    assert.ok(Math.abs(a.lat - b.lat) < 0.05, 'latitude ' + new Date(t).toISOString());
    assert.ok(Math.abs(((a.lon - b.lon + 540) % 360) - 180) < 0.1, 'longitude ' + new Date(t).toISOString());
  }
});

test('at the board sunrise and sunset, the planet shows the airport on its day and night line', () => {
  let n = 0;
  for (const [code, p] of POINTS) {
    for (let mo = 0; mo < 12; mo++) {
      for (const day of [1, 15]) {
        const noon = Date.UTC(2026, mo, day, 12) - p.lon / 15 * 3600000;
        const t = engine.times(code, noon);
        for (const at of [t.sunrise, t.sunset]) {
          if (at == null) continue;
          const alt = E.sunAltitude(p.lat, p.lon, at);
          assert.ok(Math.abs(alt - H0) <= 0.1, `${code} ${new Date(at).toISOString()}: the planet puts the sun at ${alt.toFixed(3)}°`);
          // and agrees with the engine's own altitude there
          assert.ok(Math.abs(alt - FidsSun.altitude(p.lat, p.lon, at)) < 1e-6);
          n++;
        }
      }
    }
  }
  assert.ok(n > 300, 'checked ' + n + ' sunrises and sunsets');
});
