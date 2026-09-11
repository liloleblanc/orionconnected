'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE GATE MAPS RUN WITH ZOOM ANIMATION OFF.
//
// Reported: the route line on the gate map renders as a very wide white band
// instead of a thin stroke, on a map that is also zoomed in too far.
//
// The stroke weight cannot explain it — every route line in the codebase is a
// fixed pixel weight (3-4px) with no casing and nothing derived from zoom,
// distance or container size, and no stylesheet sets stroke-width on a leaflet
// path. Nothing in the drawing code can produce a band.
//
// What can: Leaflet's zoom animation puts a CSS scale() transform on the
// overlay pane holding the route SVG while tiles reload, and clears it when the
// transition ends. If that transitionend never fires -- because the container
// was hidden or detached inside the animation window, BOTH of which happen on
// this board -- the transform sticks. A 4px stroke under an 8x scale is a 32px
// band, while tiles and the plane marker (positioned, not scaled) render
// normally. That is exactly the reported picture.
//
// The designer and template maps already pass zoomAnimation:false. The six gate
// and board maps did not. This test keeps them aligned.
//
// HONEST LIMIT: this was not reproduced. Leaflet is proxied rather than
// vendored so its internals could not be read here, and the symptom is
// intermittent by nature. What this change does is remove the only mechanism
// anyone has identified that can produce the symptom, at the cost of an instant
// rather than animated zoom on maps that are already non-interactive.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..', 'fids-current', 'js');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

function mapCreations(src) {
  // Each `L.map(...)` call with its options object.
  return [...src.matchAll(/L\.map\(\s*[^,)]+,\s*\{[\s\S]{0,400}?\}/g)].map(m => m[0]);
}

test('every non-interactive map disables zoom animation', () => {
  const offenders = [];
  for (const f of ['fids-core.js', 'designer.js', 'template-renderer.js']) {
    for (const call of mapCreations(read(f))) {
      // Only maps that are already non-interactive — an interactive map may
      // legitimately want the animation.
      if (!/dragging:\s*false/.test(call)) continue;
      if (!/zoomAnimation:\s*false/.test(call)) {
        offenders.push(`${f}: ${call.replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'A non-interactive Leaflet map with zoom animation enabled can strand its ' +
    'overlay pane on a scale() transform if the container is hidden or detached ' +
    'mid-animation — which renders the route line as a wide band.');
});

// A second assertion lived here, checking that no route stroke weight is
// COMPUTED (from zoom or distance) rather than declared. It was removed after
// three attempts, all of which failed on false positives: `weight:` in this file
// is overwhelmingly CSS font-weight inside HTML strings — `font-weight:bold;`,
// `font-weight:700;">...`  — and separating those from Leaflet stroke weights
// needs a JS parser, not a regex.
//
// The value it added was low: it guarded a hypothetical future change, while the
// assertion above guards the actual diagnosis. A test that reports typography as
// a drawing bug is worse than no test, because the next person to see it red
// learns to ignore it. Recorded here so the idea is not re-attempted a fourth
// time with the same tool.
