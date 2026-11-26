'use strict';

// ════════════════════════════════════════════════════════════════════════
// v24180 — NO MAP ON CARTO.
//
// By 25 Nov 2026 CARTO answered every tile request made without a paid
// account key with one picture: the words API KEY REQUIRED on a blank tile
// (the same 2 KB image for any tile, any style, any referrer, the address of
// the boards included). Three maps still used it: the small map of a flight
// on the phone (through the worker's /maptiles/ route), and the route map of
// the Studio and of a Studio screen on a board (straight from CARTO). All
// three now draw the OpenStreetMap map the gate maps already use, from our
// own address, and /maptiles/ serves OpenStreetMap to a page that still asks
// there. The worker's four CARTO styles are gone from its provider list.
// ════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('no page, script or route of the site names a CARTO tile server', () => {
  const files = ['worker-entry.js'];
  for (const dir of ['fids-current', 'fids-current/js', 'fids-current/studio']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (/\.(html|js)$/.test(f) && fs.statSync(path.join(ROOT, dir, f)).isFile()) files.push(dir + '/' + f);
    }
  }
  assert.ok(files.length > 20, files.length + ' files read');
  for (const f of files) assert.doesNotMatch(rd(f), /cartocdn\.com/i, f);
});

test('the three maps that used it draw the OpenStreetMap map from our own address', () => {
  const core = rd('fids-current/js/fids-core.js');
  const at = core.indexOf('function initHeroMap(');
  assert.ok(at > 0, 'the small map of a flight');
  const hero = core.slice(at, core.indexOf('\n}\n', at));
  assert.match(hero, /L\.tileLayer\('\/tiles\/osm\/\{z\}\/\{x\}\/\{y\}\.png'/);
  assert.doesNotMatch(hero, /maptiles/);
  for (const f of ['fids-current/js/designer.js', 'fids-current/js/template-renderer.js']) {
    assert.match(rd(f), /L\.tileLayer\('\/tiles\/osm\/\{z\}\/\{x\}\/\{y\}\.png',/, f);
  }
});

test('the worker serves /maptiles/ and /tiles/osm/ from OpenStreetMap with our User-Agent, and no CARTO style', async () => {
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u, init) => {
    asked.push({ url: String(u && u.url || u), ua: (init && init.headers && init.headers['User-Agent']) || '' });
    return new Response('PNG', { status: 200, headers: { 'Content-Type': 'image/png' } });
  };
  try {
    const mod = await import(path.join(ROOT, 'worker-entry.js'));
    const ask = (p) => mod.default.fetch(new Request('https://fids.orionconnected.com' + p), {}, { waitUntil() {} });
    // OpenStreetMap has no @2x tiles: a retina request gets the normal one
    for (const p of ['/maptiles/8/82/90.png', '/maptiles/8/82/90@2x.png', '/tiles/osm/8/82/90.png']) {
      asked.length = 0;
      const res = await ask(p);
      assert.equal(res.status, 200, p);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*', p);
      await res.text();
      assert.deepEqual(asked.map((a) => a.url), ['https://tile.openstreetmap.org/8/82/90.png'], p);
      assert.match(asked[0].ua, /^OrionConnectedFIDS\/1\.0 \(.+; \+https:\/\/fids\.orionconnected\.com\)$/, p + ' names us, as the tile policy asks');
    }
    for (const style of ['voyager', 'dark', 'positron', 'citylabels']) {
      asked.length = 0;
      const res = await ask('/tiles/' + style + '/8/82/90.png');
      assert.equal(res.status, 404, style);
      await res.text();
      assert.deepEqual(asked, [], style + ' asks nobody');
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
