'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE MINI MAP'S ZOOM HOLD MUST MEASURE THE AIRCRAFT, NOT THE CAMERA.
//
// Nick: "map issues still" — the small map sat zoomed deep into the MIDDLE of a
// YHZ->LGA route while the big centre map framed the whole thing.
//
// initGateMapLive holds the current zoom when the aircraft has barely moved, to
// stop the distance tier flapping between two levels. The reference it used was
// `_fidsLastView` — which the GLIDE also writes on every eased follow-pan, using
// the current INTERPOLATED position (fids-core.js :31945). So the delta measured
// at the next real ADS-B fix was a dead-reckoning residual, never the distance
// actually flown. The hold fired every time and the zoom latched for the whole
// cruise.
//
// This is arithmetic, so it is testable without a browser — and it has to be,
// because reproducing it live needs a gate whose inbound happens to be airborne
// at the moment you look. The real block is lifted from source rather than
// restated, so the test cannot drift from the code.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Lift the real hold, from the record selection through the hysteresis line.
const at = SRC.indexOf('var _lv = null, _fx = null;');
assert.ok(at >= 0, 'initGateMapLive must still keep the camera record and the fix record apart');
const endMark = SRC.indexOf('if (zoom !== _lv.zoom)', at);
assert.ok(endMark > at, 'the hysteresis line must still follow the hold');
// The slice stops mid-block — it opens `if (_lv) {` and ends on the hysteresis
// line, deliberately excluding the early-return that follows (a separate
// concern). Close the block so the lifted source is valid on its own.
const EXPR = SRC.slice(at, SRC.indexOf('\n', endMark) + 1) + '\n}\n';

// Run it with the surrounding state stubbed. `_liveReuse` true is the steady
// state on a live leg; the window records stand in for a rebuilt map.
function holdZoom({ lastView, lastFix, planeLat, planeLng, tierZoom, routeKey = 'R' }) {
  const gateMap = { _fidsLastView: lastView, _fidsLastFix: lastFix };
  const window = {
    _GATE_MAP_VIEW: lastView ? { key: routeKey, ...lastView } : null,
    _GATE_MAP_FIX: lastFix ? { key: routeKey, ...lastFix } : null,
  };
  const fn = new Function(
    'gateMap', 'window', '_liveReuse', '_liveRouteKey', 'planeLat', 'planeLng', 'zoom',
    EXPR + '\nreturn zoom;');
  return fn(gateMap, window, true, routeKey, planeLat, planeLng, tierZoom);
}

// A 60-second poll on a jet covers roughly 0.12 degrees of latitude. That is the
// number the 0.05 gate was written against, and the number the old reference
// could never see.
const REAL_MOVE = 0.12;
// What the glide leaves behind between frames: a dead-reckoning residual.
const GLIDE_RESIDUAL = 0.004;

test('a real 60s move RELEASES the hold and the distance tier applies', () => {
  const z = holdZoom({
    lastView: { lat: 44.88, lng: -63.51, zoom: 13 },   // camera, deep tier
    lastFix:  { lat: 44.88, lng: -63.51 },             // last real fix, same place
    planeLat: 44.88 + REAL_MOVE, planeLng: -63.51 + REAL_MOVE,
    tierZoom: 9,                                       // what the ladder now wants
  });
  assert.notEqual(z, 13,
    'the aircraft moved a full poll — the hold must NOT pin the old zoom');
  assert.equal(z, 12,
    'and the one-level hysteresis must step toward the tier, not jump to it');
});

test('THE REGRESSION: a glide residual must not look like a real move — nor latch the zoom', () => {
  // Before the fix the camera record WAS the reference, so this is the exact
  // shape that fired the hold on every single fix.
  const z = holdZoom({
    lastView: { lat: 44.884, lng: -63.514, zoom: 13 },
    lastFix:  { lat: 44.88,  lng: -63.51 },
    planeLat: 44.88 + GLIDE_RESIDUAL, planeLng: -63.51 + GLIDE_RESIDUAL,
    tierZoom: 9,
  });
  assert.equal(z, 13,
    'a residual genuinely IS "barely moved" — holding here is correct and must stay');
});

test('the fix record, not the camera record, is what the movement test reads', () => {
  // Same aircraft movement, two very different camera records. If the camera
  // record still influenced the decision these two would disagree.
  const common = { lastFix: { lat: 44.88, lng: -63.51 },
                   planeLat: 44.88 + REAL_MOVE, planeLng: -63.51 + REAL_MOVE,
                   tierZoom: 9 };
  const a = holdZoom({ ...common, lastView: { lat: 44.88, lng: -63.51, zoom: 11 } });
  const b = holdZoom({ ...common, lastView: { lat: 46.90, lng: -60.10, zoom: 11 } });
  assert.equal(a, b,
    'moving the CAMERA record must not change whether the aircraft is judged to have moved');
});

test('a rebuilt map recovers the fix record from the window, keyed by route', () => {
  const z = holdZoom({
    lastView: null, lastFix: null,                    // instance was torn down
    planeLat: 44.88, planeLng: -63.51, tierZoom: 9, routeKey: 'R',
  });
  assert.equal(z, 9, 'with no records at all the tier applies unmodified');
});

test('the glide still owns the camera record — the fix record is written only by the live builder', () => {
  // Direct source assertion: _fidsLastFix must never appear in the glide.
  const glideAt = SRC.indexOf('_fidsLastView = { lat: lat, lng: lng, zoom: vmap.getZoom() }');
  assert.ok(glideAt > 0, "the glide's follow-pan must still keep the camera record");
  const glideRegion = SRC.slice(glideAt - 2000, glideAt + 2000);
  assert.ok(!glideRegion.includes('_fidsLastFix'),
    'the glide must NOT write the fix record — that is the whole bug: it would ' +
    'once again be answering a question about how far the aircraft has flown');
});
