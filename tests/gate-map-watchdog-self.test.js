'use strict';

// WHY THIS EXISTS
//
// The 10-second map tick has a watchdog that rebuilds the small gate map when
// its box holds no map. It asked `#gateMapBox.querySelector('.leaflet-container')`,
// but L.map('gateMapBox') makes the box ITSELF the Leaflet container, and
// querySelector only searches descendants. So the check always read "empty"
// and destroyed a working map every 10 s while an inbound was tracked.
// Measured on the live Moncton gate 1 board: 11 teardowns in 2.6 minutes,
// each repainting the tiles from blank (white flashes on the small map).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const core = fs.readFileSync(path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

const watchdog = (() => {
  const at = core.indexOf("[MAP-WATCHDOG] map container EMPTY while an inbound is tracked");
  assert.ok(at > 0, 'the empty-map watchdog must exist');
  return core.slice(Math.max(0, at - 1500), at);
})();

test('the box itself counts as the map', () => {
  assert.match(watchdog, /_mbW\.classList\.contains\('leaflet-container'\)/,
    'a box that is itself the Leaflet container is not empty');
  assert.match(watchdog, /gateMap\.getContainer\(\) === _mbW/,
    'a map attached to this very box is alive');
});

test('the rebuild only fires when the map is really gone', () => {
  assert.match(watchdog, /_inbW && !_mbAlive\)/);
  assert.doesNotMatch(watchdog, /&& !_mbW\.querySelector\('\.leaflet-container'\)\)/,
    'a descendant-only search cannot be the whole test');
});
