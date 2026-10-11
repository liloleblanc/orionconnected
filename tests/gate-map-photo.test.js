'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24031 — MONCTON'S OWN AERIAL PHOTO UNDER ITS GATE MAPS.
//
// New Brunswick publishes an aerial photo of the province (GeoNB Imagery
// Basemap, 2021) under the Open Government Licence – New Brunswick, which
// allows commercial use and asks for its credit line. The 23 aircraft parked
// on the field the day it was flown are painted out (no evidence, no
// aircraft), the photo is cut to the web map's tiles at zooms 14-18 and kept
// in R2, and the worker serves it at /tiles/photo/YQM/<z>/<x>/<y>. The board
// lays it over the street map inside the photo's box from zoom 14 in, and
// shows the licence's line whenever it is in view (v24032: off the map, in
// the strip under the centre panel, one language at a time).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const WORKER = rd('worker-entry.js');
const CORE = rd('fids-current/js/fids-core.js');
const CSS = rd('fids-current/css/display-overrides.css');
const BS = require(path.join(ROOT, 'fids-current/js/board-strings.js'));
const TOOLS = 'scripts/geonb-photo/';

function lift(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head + ' must exist');
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('no end for ' + head);
}

// ── the worker route ──────────────────────────────────────────────────────
const SETS = WORKER.match(/^const PHOTO_TILE_SETS = (\{[^\n]*\});/m);
const serve = new Function('NO_STORE', 'DAY', 'Response',
  `const PHOTO_TILE_SETS = ${SETS[1]}; ${lift(WORKER, 'async function photoTile(')}; return photoTile;`
)({ 'Cache-Control': 'no-store' }, 86400, Response);
const bucket = (keys) => ({ FIDS_ASSETS: { get: async (k) => keys[k] ? { body: 'IMG', httpEtag: '"e1"', httpMetadata: { contentType: keys[k] } } : null } });

test('the worker serves Moncton\'s photo tiles from R2, with the type each was stored as', async () => {
  const env = bucket({ 'maptiles/geonb-yqm/18/83967/93139': 'image/jpeg', 'maptiles/geonb-yqm/14/5247/5820': 'image/png' });
  let r = await serve('/tiles/photo/YQM/18/83967/93139', env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'image/jpeg');
  assert.match(r.headers.get('Cache-Control'), /max-age=2592000/, 'a month: the photo does not change');
  r = await serve('/tiles/photo/YQM/14/5247/5820', env);
  assert.equal(r.headers.get('Content-Type'), 'image/png', 'an edge tile is a PNG, clear beyond the photo');
  // a tile the photo does not reach, an airport with no photo, no bucket: 404,
  // and the street map under it shows through
  assert.equal((await serve('/tiles/photo/YQM/18/1/1', env)).status, 404);
  assert.equal((await serve('/tiles/photo/YHZ/18/83967/93139', env)).status, 404);
  assert.equal((await serve('/tiles/photo/YQM/18/83967/93139', {})).status, 404);
  // anything else is not this route's
  for (const p of ['/tiles/osm/18/83967/93139.png', '/tiles/photo/YQM/18/83967', '/tiles/photo/yqm/18/1/1', '/tiles/photo/YQM/18/1/1.jpg']) {
    assert.equal(await serve(p, env), null, p);
  }
});

test('the photo route answers before the base-map passthrough, which would call it an unknown provider', () => {
  const photo = WORKER.indexOf("if (path.startsWith('/tiles/photo/'))");
  const generic = WORKER.indexOf("if (path.startsWith('/tiles/')) {");
  assert.ok(photo > 0 && generic > 0 && photo < generic);
  assert.match(rd('wrangler.jsonc'), /"binding": "FIDS_ASSETS", "bucket_name": "fids-assets"/);
});

// ── the board layer ───────────────────────────────────────────────────────
const PHOTO = Function(lift(CORE, 'var _GATE_PHOTO = ') + '; return _GATE_PHOTO;')();
const GRID = JSON.parse(rd(TOOLS + 'grid.json'));

test('the photo\'s box is the tile grid it was cut to, and Moncton airport is inside it', () => {
  const ll = (x, y, z) => {
    const n = 2 ** z;
    return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI, x / n * 360 - 180];
  };
  const nw = ll(GRID.x0, GRID.y0, GRID.z), se = ll(GRID.x0 + GRID.nx, GRID.y0 + GRID.ny, GRID.z);
  const [[s, w], [n, e]] = PHOTO.YQM.bounds;
  assert.ok(Math.abs(n - nw[0]) < 1e-5 && Math.abs(w - nw[1]) < 1e-5, 'north-west corner');
  assert.ok(Math.abs(s - se[0]) < 1e-5 && Math.abs(e - se[1]) < 1e-5, 'south-east corner');
  const yqm = [46.1122, -64.6786];
  assert.ok(yqm[0] > s && yqm[0] < n && yqm[1] > w && yqm[1] < e);
  assert.equal(GRID.z, 18, 'GeoNB\'s 2021 photo is cut at z18, its own resolution');
});

test('every gate map gets the photo over its street map, bounded, from zoom 14 in', () => {
  const add = lift(CORE, 'function _gatePhotoAdd(');
  assert.match(add, /L\.tileLayer\('\/tiles\/photo\/' \+ ap \+ '\/\{z\}\/\{x\}\/\{y\}'/);
  assert.match(add, /minZoom: _GATE_PHOTO_MINZ, maxNativeZoom: 18, maxZoom: 19, bounds: b, zIndex: 2/, 'over the street map (zIndex 1), inside its box only');
  assert.match(CORE, /var _GATE_PHOTO_MINZ = 14;/);
  assert.match(add, /if \(!m \|\| m\._fidsPhoto/, 'once per map');
  const tiles = lift(CORE, 'function _gateMapTileLayer(');
  assert.match(tiles, /L\.tileLayer\('\/tiles\/osm\/\{z\}\/\{x\}\/\{y\}\.png'/, 'the street map stays the base everywhere');
  assert.match(tiles, /_gatePhotoAdd\(m\)/, 'hooked where every map build passes (the radar\'s hook)');
  assert.doesNotMatch(CORE, /mapphoto|geonb\.snb\.ca/, 'the preview that asked GeoNB live is gone');
});

// ── the licence's credit line ─────────────────────────────────────────────
test('the credit line is the licence\'s own wording, in all nine languages', () => {
  const e = BS.STR.mapCreditOglNb;
  for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(e[l], l);
  assert.equal(e.en, 'Contains information licensed under the Open Government Licence – New Brunswick');
  assert.equal(e.fr, 'Contient de l’information visée par la Licence du gouvernement ouvert — Nouveau-Brunswick');
  assert.equal(e.$src.en, 'gov:NB');
  assert.equal(e.$src.fr, 'gov:NB');
});

// A board with its centre panel, and maps that can be moved, hidden or torn
// down, enough for _gatePhotoCredit to run as it does on a gate.
function board() {
  const made = [];
  const node = (cls) => {
    const n = { className: cls || '', hidden: false, innerHTML: '', style: {}, kids: [], parentNode: null, isConnected: true,
      offsetWidth: 400, scrollWidth: 300, clientWidth: 600, tag: '' };
    n.appendChild = (k) => { k.parentNode = n; n.kids.push(k); };
    n.removeChild = (k) => { n.kids = n.kids.filter((x) => x !== k); k.parentNode = null; };
    return n;
  };
  const col = node('gad-media-col');
  const doc = {
    querySelector: (sel) => {
      if (sel === '.g8-wrap .gad-media-col') return col;
      if (sel === '.gate-photo-credit') return made.find((k) => k.parentNode) || null;
      return null;
    },
    createElement: (tag) => { const n = node(); n.tag = tag; made.push(n); return n; },
  };
  const timers = [];
  const env = {
    document: doc, window: { _gateIata: 'YQM' },
    getComputedStyle: () => ({ fontSize: '10px' }),
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: (id) => { timers[id - 1] = null; },
  };
  const map = (z, center) => {
    const span = 0.02, box = node('gate-map');
    const [[s, w], [n, e]] = PHOTO.YQM.bounds;
    return {
      box, z, center,
      getContainer: () => box,
      getZoom() { return this.z; },
      getBounds() { const c = this.center; return { intersects: (b) => !(c[0] - span > b.n || c[0] + span < b.s || c[1] - span > b.e || c[1] + span < b.w) }; },
      _fidsPhoto: [{ ap: 'YQM', b: { s, w, n, e } }],
    };
  };
  const credit = new Function('BoardStrings', 'document', 'window', 'getComputedStyle', 'setInterval', 'clearInterval',
    'var _GATE_PHOTO_MINZ = 14; var _GATE_PHOTO_MAPS = []; var _gatePhotoCreditTurn = 0, _gatePhotoCreditTimer = null; '
      + lift(CORE, 'function _gatePhotoInView(') + '; ' + lift(CORE, 'function _gatePhotoCredit(') + '; return _gatePhotoCredit;'
  )(BS, doc, env.window, env.getComputedStyle, env.setInterval, env.clearInterval);
  const tick = () => timers.forEach((f) => f && f());
  return { col, credit, map, tick, line: () => col.kids[0] };
}
const YQM_AT = [46.1122, -64.6786];

test('the credit line is off the map: under the centre panel, one language at a time', () => {
  assert.match(CORE, /var _GATE_PHOTO_MAPS = \[\];\nvar _gatePhotoCreditTurn = 0, _gatePhotoCreditTimer = null;/);
  const b = board();
  const m = b.map(17, YQM_AT);
  b.credit(m);
  const el = b.line();
  assert.ok(el, 'drawn in the centre column');
  assert.equal(el.tag, 'small', 'the element for attribution, and not a div (the column stretches its divs)');
  assert.equal(m.box.kids.length, 0, 'nothing drawn on the map');
  assert.equal(el.hidden, false);
  assert.match(el.innerHTML, /lang="en">Contains information licensed under the Open Government Licence – New Brunswick</);
  assert.doesNotMatch(el.innerHTML, /lang="fr"/, 'one language at once');
  b.tick();
  assert.match(b.line().innerHTML, /lang="fr">Contient de l’information visée par la Licence du gouvernement ouvert — Nouveau-Brunswick</);
  b.tick();
  assert.match(b.line().innerHTML, /lang="en">/, 'and back');
});

test('the line goes when the photo leaves the view, and when its map is torn down', () => {
  const b = board();
  const m = b.map(17, YQM_AT);
  b.credit(m);
  m.z = 11; b.credit(m);
  assert.equal(b.line().hidden, true, 'zoomed out past the photo');
  m.z = 17; m.center = [44.88, -63.51]; b.credit(m);
  assert.equal(b.line().hidden, true, 'looking at another city');
  m.center = YQM_AT; b.credit(m);
  assert.equal(b.line().hidden, false, 'back over the field');
  m.box.isConnected = false; b.tick();
  assert.equal(b.line().hidden, true, 'the map was rebuilt: its old copy no longer counts');
  const far = board(); far.credit(far.map(16, [44.88, -63.51]));
  assert.equal(far.line(), undefined, 'a board that never shows the photo never draws the line');
});

test('a long language steps its type down rather than run past the strip', () => {
  const b = board();
  const m = b.map(17, YQM_AT);
  b.credit(m);
  const el = b.line();
  el.innerHTML = ''; el.scrollWidth = 700; el.clientWidth = 600;
  b.credit(m);
  assert.equal(el.style.fontSize, '8.5px', '10 px x 600/700, to the tenth');
  el.innerHTML = ''; el.scrollWidth = 2000;
  b.credit(m);
  assert.equal(el.style.fontSize, '7px', 'never under 7 px');
});

test('the line takes exactly the strip under the glass card, white lettering, no box, no words in the stylesheet', () => {
  const at = CSS.indexOf('\n.g8-wrap .gad-media-col > .gate-photo-credit {');
  assert.ok(at > 0);
  const rule = CSS.slice(at, CSS.indexOf('\n}', at) + 2);
  assert.match(rule, /left: var\(--gx-g, 10px\);\s*right: var\(--gx-g, 10px\);/, 'as wide as the glass card');
  assert.match(rule, /bottom: 0;[\s\S]*height: var\(--gx-g, 10px\);/, 'the card\'s own inset is the strip');
  assert.match(rule, /line-height: var\(--gx-g, 10px\);/);
  assert.match(rule, /font-size: min\(clamp\(9px, min\(1\.1vh, 0\.62vw\), 13px\), calc\(var\(--gx-g, 10px\) \* 0\.9\)\);/);
  assert.match(rule, /color: rgba\(255, 255, 255, 0\.72\);/);
  assert.doesNotMatch(rule, /background|border-radius|content:/, 'no box behind it, and its words come from the string table');
  assert.match(CSS, /\.gate-photo-credit\[hidden\] \{ display: none !important; \}/);
  assert.match(rd('fids-current/css/gate-display.css'), /\.gad-media-col > div:not\(#gateAdLogo\)/, 'the rule a div would have been stretched by (why it is a <small>)');
  assert.doesNotMatch(CSS, /\.gate-map-photo-credit/, 'the on-map line of v24031 is gone');
});

// ── how the photo was made ────────────────────────────────────────────────
test('the tools that cleaned the photo are kept, with every aircraft that was painted out', () => {
  const fixes = JSON.parse(rd(TOOLS + 'fixes-yqm.json'));
  assert.equal(fixes.length, 23, 'the jet at the gate and 22 light aircraft');
  const jet = fixes.find((f) => f.name === 'jet');
  assert.ok(jet && Array.isArray(jet.offset), 'the jet is filled from the empty stand beside it');
  for (const f of fixes.filter((x) => x !== jet)) {
    assert.equal(f.tight, true, f.name + ' takes only the aircraft\'s own pixels, not the lawn round it');
    assert.ok(f.poly.length >= 3, f.name);
  }
  for (const f of ['README.md', 'fetch.py', 'mosaic.swift', 'inpaint.swift']) assert.ok(fs.existsSync(path.join(ROOT, TOOLS, f)), f);
  assert.match(rd(TOOLS + 'README.md'), /Open Government Licence – New Brunswick/);
});
