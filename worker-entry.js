/**
 * FIDS static-site Worker entry.
 *
 * Cloudflare serves matching static assets (everything under fids-current/)
 * FIRST, without invoking this Worker — so existing pages, JS and CSS are
 * served exactly as before. This script only runs for paths that do NOT match
 * a static asset, where it adds same-origin passthroughs so the route map and
 * live-position lookups work on display networks that block public CDNs:
 *
 *   /mapcdn/<file>                 → the map engine (Leaflet / MapLibre / three)
 *   /maptiles/<z>/<x>/<y>[@2x].png → CARTO Voyager map tiles
 *   /demtiles/<z>/<x>/<y>.png      → AWS terrarium elevation tiles
 *   /tiles/<provider>/<z>/<x>/<y>.png → selectable base-map tiles
 *   /adsb/v2/<callsign|registration>/<id> → adsb.lol live position
 *
 * All are fetched server-side by the Worker and returned from THIS domain,
 * so the displays only ever talk to your own site. Flight data itself comes
 * from AeroDataBox (the browser calls the fids-proxy worker directly) — this
 * worker does NOT touch the flight feed.
 */

const MAP_ENGINE = {
  'leaflet.js':     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'leaflet.css':    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'leaflet-arc.js': 'https://unpkg.com/leaflet-arc/bin/leaflet-arc.min.js',
  // MapLibre GL JS v5 — WebGL engine with globe projection + 3D tilt, used by
  // the 3D route-map prototype. Same-origin passthrough so locked-down gate
  // display networks (which block public CDNs) can still load it.
  'maplibre-gl.js':  'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js',
  'maplibre-gl.css': 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css',
  // three.js r128 (UMD global THREE) — renders the 3D plane model in a
  // MapLibre custom layer.
  'three.min.js':    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  // glTF loader (UMD, attaches THREE.GLTFLoader) + a real airliner model.
  'gltf-loader.js':  'https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  'plane.glb':       'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb',
};

const TILE_BASE = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/';
// AWS open elevation tiles (terrarium encoding) — free, no API key.
const DEM_BASE = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/';

// Selectable base-map providers for the 3D route map (all free, no key).
// Requested as /tiles/<provider>/{z}/{x}/{y}.png; the Worker reorders the
// axes per provider (Esri uses z/y/x) and proxies from this origin.
const TILE_PROVIDERS = {
  voyager:   'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  dark:      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  positron:  'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  topo:      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
  // Transparent place-name + boundary labels (halo'd for imagery) — overlaid
  // on satellite to make a hybrid "satellite with names" view.
  labels:    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
};

const DAY = 86400;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Map engine passthrough ──────────────────────────────────────────
    if (path.startsWith('/mapcdn/')) {
      const file = path.slice('/mapcdn/'.length);
      const upstream = MAP_ENGINE[file];
      if (!upstream) return new Response('Not found', { status: 404 });
      try {
        const r = await fetch(upstream, { cf: { cacheEverything: true, cacheTtl: DAY } });
        const ct = file.endsWith('.css') ? 'text/css'
                 : file.endsWith('.js')  ? 'application/javascript'
                 : (r.headers.get('Content-Type') || 'application/octet-stream');
        return new Response(r.body, {
          status: r.status,
          headers: {
            'Content-Type': ct,
            'Cache-Control': 'public, max-age=' + DAY,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('Map engine fetch failed', { status: 502 });
      }
    }

    // ── Map tiles passthrough ───────────────────────────────────────────
    // /maptiles/7/40/72.png  or  /maptiles/7/40/72@2x.png
    if (path.startsWith('/maptiles/')) {
      const rest = path.slice('/maptiles/'.length);
      if (!/^\d+\/\d+\/\d+(@2x)?\.png$/.test(rest)) {
        return new Response('Bad tile path', { status: 400 });
      }
      try {
        const r = await fetch(TILE_BASE + rest, { cf: { cacheEverything: true, cacheTtl: DAY } });
        return new Response(r.body, {
          status: r.status,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=' + DAY,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('Tile fetch failed', { status: 502 });
      }
    }

    // ── Terrain elevation tiles passthrough ────────────────────────────
    // /demtiles/9/40/72.png → AWS open "terrarium" DEM (RGB-encoded heights).
    // Free, no key. MapLibre reads these as a raster-dem source to extrude
    // real 3D terrain. Same-origin so locked-down display networks work.
    if (path.startsWith('/demtiles/')) {
      const rest = path.slice('/demtiles/'.length);
      if (!/^\d+\/\d+\/\d+\.png$/.test(rest)) {
        return new Response('Bad DEM path', { status: 400 });
      }
      try {
        const r = await fetch(DEM_BASE + rest, { cf: { cacheEverything: true, cacheTtl: DAY } });
        return new Response(r.body, {
          status: r.status,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=' + DAY,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('DEM fetch failed', { status: 502 });
      }
    }

    // ── Selectable base-map tiles passthrough ──────────────────────────
    // /tiles/satellite/7/40/72.png → provider tile (axes reordered per provider).
    if (path.startsWith('/tiles/')) {
      const m = path.slice('/tiles/'.length).match(/^([a-z]+)\/(\d+)\/(\d+)\/(\d+)\.png$/);
      if (!m) return new Response('Bad tile path', { status: 400 });
      const tpl = TILE_PROVIDERS[m[1]];
      if (!tpl) return new Response('Unknown provider', { status: 404 });
      const upstream = tpl.replace('{z}', m[2]).replace('{x}', m[3]).replace('{y}', m[4]);
      try {
        const r = await fetch(upstream, { cf: { cacheEverything: true, cacheTtl: DAY } });
        return new Response(r.body, {
          status: r.status,
          headers: {
            'Content-Type': r.headers.get('Content-Type') || 'image/png',
            'Cache-Control': 'public, max-age=' + DAY,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('Tile fetch failed', { status: 502 });
      }
    }

    // ── adsb.lol live-position passthrough ─────────────────────────────
    // /adsb/v2/callsign/<cs>  or  /adsb/v2/registration/<reg>  → adsb.lol,
    // fetched server-side so the gate's altitude/speed fallback isn't blocked
    // by browser CORS. Free, keyless feed; short shared cache avoids hammering
    // it. This is NOT a flight-schedule source — only live lat/lng/alt/speed.
    if (path.startsWith('/adsb/')) {
      const rest = path.slice('/adsb/'.length);
      if (!/^v2\/(callsign|registration)\/[A-Za-z0-9.\-]+$/.test(rest)) {
        return new Response('Bad adsb path', { status: 400 });
      }
      // adsb.lol rate-limits (HTTP 429) when over-queried — that was leaving the
      // altimeter blank. Serve from a shared edge cache so many gate screens use
      // ONE upstream call per airframe per 45s, and never cache a non-200 (so a
      // 429 doesn't stick). Send a real User-Agent too.
      const adsbCache = caches.default;
      const adsbKey = new Request('https://adsb-cache.fids/' + rest);
      const hit = await adsbCache.match(adsbKey);
      if (hit) return hit;
      try {
        const r = await fetch('https://api.adsb.lol/' + rest, {
          headers: { 'User-Agent': 'orionconnected-fids/1.0 (gate display)' },
        });
        const body = await r.text();
        const resp = new Response(body, {
          status: r.status,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': r.ok ? 'public, max-age=45' : 'no-store',
            'Access-Control-Allow-Origin': '*',
          },
        });
        if (r.ok && ctx && ctx.waitUntil) ctx.waitUntil(adsbCache.put(adsbKey, resp.clone()));
        return resp;
      } catch (e) {
        return new Response('adsb fetch failed', { status: 502 });
      }
    }

    // ── Everything else → static assets ────────────────────────────────
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const res = await env.ASSETS.fetch(request);
      // Never let the HTML documents cache — kiosks/browsers were holding a
      // stale page that pinned old ?v= CSS/JS references, so pushed changes
      // never appeared. The versioned assets (css/js) can still cache.
      const isHtml = path === '/' || path.endsWith('/') || path.endsWith('.html')
                  || (res.headers.get('Content-Type') || '').indexOf('text/html') !== -1;
      if (isHtml) {
        const h = new Headers(res.headers);
        // Guarantee the browser renders it as a page (not raw source).
        h.set('Content-Type', 'text/html; charset=utf-8');
        h.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        h.set('Pragma', 'no-cache');
        h.set('Expires', '0');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
      }
      return res;
    }
    return new Response('Not found', { status: 404 });
  },
};
