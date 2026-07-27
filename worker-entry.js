/**
 * FIDS static-site Worker entry.
 *
 * Cloudflare serves matching static assets (everything under fids-current/)
 * FIRST, without invoking this Worker — so existing pages, JS and CSS are
 * served exactly as before. This script only runs for paths that do NOT match
 * a static asset, where it adds same-origin passthroughs so the route map
 * works on display networks that block public CDNs:
 *
 *   /mapcdn/<file>                 → the map engine (Leaflet / MapLibre / three)
 *   /maptiles/<z>/<x>/<y>[@2x].png → CARTO Voyager map tiles
 *   /demtiles/<z>/<x>/<y>.png      → AWS terrarium elevation tiles
 *   /tiles/<provider>/<z>/<x>/<y>.png → selectable base-map tiles
 *
 * All are fetched server-side by the Worker and returned from THIS domain,
 * so the displays only ever talk to your own site. Flight data itself comes
 * from AeroDataBox (the browser calls the fids-proxy worker directly) — this
 * worker does NOT touch the flight feed.
 */

// Each engine file lists FALLBACK upstreams, tried in order — a single-CDN
// outage (or one CDN blocked from Cloudflare's egress) must not take the
// route maps down. First upstream that answers 200 wins.
const MAP_ENGINE = {
  'leaflet.js': [
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  ],
  'leaflet.css': [
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  ],
  'leaflet-arc.js': [
    'https://unpkg.com/leaflet-arc/bin/leaflet-arc.min.js',
    'https://cdn.jsdelivr.net/npm/leaflet-arc/bin/leaflet-arc.min.js',
  ],
  // MapLibre GL JS v5 — WebGL engine with globe projection + 3D tilt, used by
  // the 3D route-map prototype. Same-origin passthrough so locked-down gate
  // display networks (which block public CDNs) can still load it.
  'maplibre-gl.js': [
    'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js',
    'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.js',
  ],
  'maplibre-gl.css': [
    'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css',
    'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.css',
  ],
  // three.js r128 (UMD global THREE) — renders the 3D plane model in a
  // MapLibre custom layer.
  'three.min.js': [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  ],
  // glTF loader (UMD, attaches THREE.GLTFLoader) + a real airliner model.
  'gltf-loader.js': [
    'https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  ],
  'plane.glb': [
    'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb',
    'https://cdn.jsdelivr.net/gh/CesiumGS/cesium@main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb',
  ],
};

// Failure responses must NEVER carry cache headers. Until v22378 every branch
// below stamped 'max-age=86400' on whatever came back — including upstream
// 5xx bodies — so a display that hit one bad moment cached a dead map engine
// for 24 h and lost every route map on screen (the CSS-sentinel / wordmark
// cache-poisoning class, third appearance).
const NO_STORE = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };

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
  // Classic OpenStreetMap street cartography (no API key). OSM's tile policy
  // requires a valid User-Agent — set on the proxy fetch below.
  osm:       'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  // Transparent place-name labels ONLY — overlaid on satellite for a
  // "satellite with names" view. Uses CARTO's labels-only tiles: city/town
  // text, NO boundary lines. (The old `labels` provider was Esri
  // Boundaries_and_Places, whose bold white country borders read like flight
  // paths on the route map — Nick: 'but the line??'.) New key so the edge
  // cache serves fresh tiles instead of the day-cached bordered ones. Standard
  // XYZ axes.
  citylabels: 'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
};

const DAY = 86400;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Map engine passthrough ──────────────────────────────────────────
    if (path.startsWith('/mapcdn/')) {
      const file = path.slice('/mapcdn/'.length);
      const upstreams = MAP_ENGINE[file];
      if (!upstreams) return new Response('Not found', { status: 404, headers: NO_STORE });
      const ct = file.endsWith('.css') ? 'text/css'
               : file.endsWith('.js')  ? 'application/javascript'
               : null;
      for (const upstream of upstreams) {
        try {
          const r = await fetch(upstream, { cf: { cacheEverything: true, cacheTtl: DAY } });
          if (!r.ok) continue;   // try the next CDN — and never cache a corpse
          return new Response(r.body, {
            status: 200,
            headers: {
              'Content-Type': ct || r.headers.get('Content-Type') || 'application/octet-stream',
              'Cache-Control': 'public, max-age=' + DAY,
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (e) { /* network error — fall through to the next upstream */ }
      }
      return new Response('Map engine fetch failed', { status: 503, headers: NO_STORE });
    }

    // ── 7-day weather passthrough (Open-Meteo, keyless) ─────────────────
    // /wxdaily?location=44.88,-63.51 → daily code + hi/lo for 7 days.
    // The Tomorrow.io proxy (separate worker) only returns 48h hourly; this
    // route feeds the gate Arrival Weather outlook's full week.
    if (path === '/wxdaily') {
      const loc = url.searchParams.get('location') || '';
      const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(loc);
      if (!m) return new Response('Bad location', { status: 400 });
      try {
        const om = 'https://api.open-meteo.com/v1/forecast?latitude=' + m[1]
          + '&longitude=' + m[2]
          + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
          + '&timezone=auto&forecast_days=7';
        const r = await fetch(om, { cf: { cacheEverything: true, cacheTtl: 1800 } });
        if (!r.ok) return new Response('wxdaily upstream ' + r.status, { status: 502, headers: NO_STORE });
        return new Response(r.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('wxdaily fetch failed', { status: 502, headers: NO_STORE });
      }
    }

    // ── Airport-logo passthrough, for palette extraction ────────────────
    // The banner derives its colours from the airport's own logo by reading
    // the image's pixels in a canvas. Logos live on the media-library bucket,
    // which serves no Access-Control-Allow-Origin, so a direct read taints
    // the canvas and getImageData throws. Streaming the bytes back through
    // this origin makes the read legal.
    //
    // Deliberately NOT a general proxy: the host allowlist below is the whole
    // point. Without it this route would fetch anything, for any caller, on
    // our egress — so it stays pinned to the bucket that holds the logos.
    if (path === '/logoimg') {
      const raw = url.searchParams.get('u') || '';
      let target;
      try { target = new URL(raw); } catch (e) { return new Response('Bad url', { status: 400, headers: NO_STORE }); }
      const hostOk = target.protocol === 'https:'
        && (target.hostname === 'pub-e392224bda1a4096843ed05df504ca91.r2.dev'
            || target.hostname.endsWith('.r2.cloudflarestorage.com'));
      if (!hostOk) return new Response('Host not allowed', { status: 403, headers: NO_STORE });
      try {
        const r = await fetch(target.toString(), { cf: { cacheEverything: true, cacheTtl: DAY } });
        if (!r.ok) return new Response('Logo upstream ' + r.status, { status: 502, headers: NO_STORE });
        const ct = r.headers.get('Content-Type') || '';
        if (!/^image\//.test(ct)) return new Response('Not an image', { status: 415, headers: NO_STORE });
        return new Response(r.body, {
          status: 200,
          headers: {
            'Content-Type': ct,
            'Cache-Control': 'public, max-age=' + DAY,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('Logo fetch failed', { status: 502, headers: NO_STORE });
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
        if (!r.ok) return new Response('Tile upstream ' + r.status, { status: 502, headers: NO_STORE });
        return new Response(r.body, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=' + DAY,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('Tile fetch failed', { status: 502, headers: NO_STORE });
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
        if (!r.ok) return new Response('DEM upstream ' + r.status, { status: 502, headers: NO_STORE });
        return new Response(r.body, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=' + DAY,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('DEM fetch failed', { status: 502, headers: NO_STORE });
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
        // OSM (and some others) reject requests without a descriptive
        // User-Agent per their tile-usage policy — always send one.
        const r = await fetch(upstream, {
          cf: { cacheEverything: true, cacheTtl: DAY },
          headers: { 'User-Agent': 'OrionConnectedFIDS/1.0 (airport display board; +https://flymco.com)' }
        });
        if (!r.ok) return new Response('Tile upstream ' + r.status, { status: 502, headers: NO_STORE });
        return new Response(r.body, {
          status: 200,
          headers: {
            'Content-Type': r.headers.get('Content-Type') || 'image/png',
            'Cache-Control': 'public, max-age=' + DAY,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('Tile fetch failed', { status: 502, headers: NO_STORE });
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
