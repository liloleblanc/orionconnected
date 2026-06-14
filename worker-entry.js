/**
 * FIDS static-site Worker entry.
 *
 * Cloudflare serves matching static assets (everything under fids-current/)
 * FIRST, without invoking this Worker — so existing pages, JS and CSS are
 * served exactly as before. This script only runs for paths that do NOT match
 * a static asset, where it adds two same-origin passthroughs so the gate route
 * map works on display networks that block public CDNs:
 *
 *   /mapcdn/<file>      → the Leaflet map engine (cdnjs / unpkg)
 *   /maptiles/<z>/<x>/<y>[@2x].png → CARTO Voyager map tiles
 *
 * Both are fetched server-side by the Worker and returned from THIS domain,
 * so the displays only ever talk to your own site.
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
};

const TILE_BASE = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/';

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
