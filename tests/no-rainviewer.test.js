'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 2026-10-12 — NO PRECIPITATION RADAR ON THE MAPS.
//
// The route maps drew a live radar overlay (v22712) from RainViewer's free
// API, fetched through the site worker's /wxradar route. That API is for
// personal and educational use only; these boards are public and streamed,
// so the overlay must not be on screen or fetched at all. The layer, its pane,
// its CSS and the worker's upstream are removed, and /wxradar/* answers
// 410 Gone without asking anyone. A licensed source comes later, separately,
// and must not reuse this route or this host.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = rd('fids-current/js/fids-core.js');
const ENTRY = rd('worker-entry.js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const TEXT = /\.(js|mjs|cjs|html|css|json|jsonc|txt|md|svg)$/i;

test('no RainViewer host or name anywhere in the boards, the workers or the site worker', () => {
  const files = walk(path.join(ROOT, 'fids-current')).concat(walk(path.join(ROOT, 'workers')))
    .filter((f) => TEXT.test(f))
    .concat([path.join(ROOT, 'worker-entry.js')]);
  assert.ok(files.length > 50, 'the walk found the code');
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /rainviewer/i, path.relative(ROOT, f));
  }
});

test('no radar layer, pane or style is left on the maps', () => {
  for (const f of walk(path.join(ROOT, 'fids-current')).filter((p) => /\.(js|html|css)$/i.test(p))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /wxradar|wx-radar|_wxRadar/i, path.relative(ROOT, f));
  }
  // the base layer's add hook still carries everything else the maps need
  const at = CORE.indexOf('function _gateMapTileLayer() {');
  assert.ok(at >= 0);
  const tiles = CORE.slice(at, CORE.indexOf('\n}\n', at));
  assert.match(tiles, /L\.tileLayer\('\/tiles\/osm\/\{z\}\/\{x\}\/\{y\}\.png'/, 'the street map stays the base');
  assert.match(tiles, /try \{ _gatePhotoAdd\(m\); \} catch \(e\) \{\}/, 'the aerial photo stays');
  assert.match(tiles, /_mapPlaneFit\(m\)/, 'the aeroplane still follows the zoom');
  assert.match(tiles, /_gateApronSync\(m\)/, 'the aircraft on the ground still follow the camera');
  assert.doesNotMatch(tiles.replace(/\/\/[^\n]*/g, ''), /radar/i, 'no radar call left in the hook (comments aside)');
  // and why it went, in the code, dated
  assert.match(CORE, /2026-10-12 — NO PRECIPITATION RADAR ON THE MAPS/);
});

test('the site worker keeps no radar upstream', () => {
  assert.doesNotMatch(ENTRY, /WX_RADAR_/);
  assert.doesNotMatch(ENTRY, /tilecache\.|weather-maps\.json/);
  // the only /wxradar mention left is the route that says it is gone
  const at = ENTRY.indexOf("if (path === '/wxradar' || path.startsWith('/wxradar/')) {");
  assert.ok(at > 0, 'the retired route is still answered');
  const block = ENTRY.slice(at, ENTRY.indexOf('\n    }', at) + 6);
  assert.match(block, /status: 410/);
  assert.doesNotMatch(block, /fetch\(/);
  assert.equal(ENTRY.split('/wxradar').length - 1, 3, 'two in the route test, one in the note at the old constants');
});

test('the site worker answers /wxradar/* with 410 Gone and fetches nothing', async () => {
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u && u.url || u)); throw new Error('nothing upstream may be asked'); };
  try {
    const mod = await import(path.join(ROOT, 'worker-entry.js'));
    const env = { ASSETS: { fetch: async () => { asked.push('ASSETS'); return new Response('asset', { status: 200 }); } } };
    for (const p of ['/wxradar/index', '/wxradar/9fbb5e443776/7/36/46.png', '/wxradar/1696000000/6/18/23.png', '/wxradar/', '/wxradar']) {
      const res = await mod.default.fetch(new Request('https://fids.orionconnected.com' + p), env, { waitUntil() {} });
      assert.equal(res.status, 410, p);
      assert.equal(res.headers.get('Cache-Control'), 'no-store', p + ' is never cached');
      await res.text();
    }
    assert.deepEqual(asked, [], 'no upstream fetch and no asset lookup');
  } finally {
    globalThis.fetch = realFetch;
  }
});
