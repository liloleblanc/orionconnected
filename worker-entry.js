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
// Rebuild nonce — redeploy so the preview picks up the OAG_KEY secret (1).

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

    // ── OAG live flight data ───────────────────────────────────────────
    // /oag/departures?ap=YQM  (or /oag/arrivals) → OAG Flight Info v2,
    // cleaned server-side: codeshare duplicates collapsed to the operating
    // carrier, cargo + general-aviation filtered out, fields mapped to a
    // simple shape the board reads. The OAG_KEY secret never reaches the
    // browser. Built as a swappable data source — if the OAG trial ends,
    // only this block changes.
    if (path === '/oag/departures' || path === '/oag/arrivals') {
      const dir = path.endsWith('/arrivals') ? 'arr' : 'dep';
      const ap = (url.searchParams.get('ap') || 'YQM').toUpperCase().slice(0, 4);
      const date = (url.searchParams.get('date') || new Date().toISOString().slice(0, 10)).slice(0, 10);
      if (!env || !env.OAG_KEY) {
        return jsonOag({ error: 'OAG_KEY secret is not set on the fids worker. Add it in Cloudflare → Workers → fids → Settings → Variables and Secrets.' }, 500);
      }
      const airportParam = dir === 'arr' ? 'ArrivalAirport' : 'DepartureAirport';
      const dateParam = dir === 'arr' ? 'ArrivalDateTime' : 'DepartureDateTime';
      const oagUrl = 'https://api.oag.com/flight-instances?version=v2'
        + '&' + airportParam + '=' + encodeURIComponent(ap)
        + '&' + dateParam + '=' + encodeURIComponent(date)
        + '&CodeType=IATA&Content=Status&Limit=100';
      try {
        const r = await fetch(oagUrl, { headers: { 'Subscription-Key': env.OAG_KEY } });
        if (!r.ok) {
          const body = await r.text();
          return jsonOag({ error: 'OAG returned ' + r.status, detail: body.slice(0, 400) }, 502);
        }
        const raw = await r.json();
        const flights = oagClean(raw, dir);
        return jsonOag({ airport: ap, direction: dir, date, count: flights.length, flights }, 200);
      } catch (e) {
        return jsonOag({ error: 'OAG fetch failed' }, 502);
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

// ── OAG helpers ───────────────────────────────────────────────────────────
function jsonOag(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

// Map OAG Flight Info v2 -> a simple board row shape, with cleanup rules.
function oagClean(raw, dir) {
  const data = (raw && Array.isArray(raw.data)) ? raw.data : [];
  const out = [];
  for (const f of data) {
    // Keep only the OPERATING flight — skip marketing codeshare duplicates
    // (they carry codeshare.operatingFlight pointing at the real operator).
    if (f && f.codeshare && f.codeshare.operatingFlight) continue;
    // Drop general aviation and pure freight/cargo.
    if (f.flightType === 'GA') continue;
    if (f.serviceType && f.serviceType.iata === 'F') continue;
    const carrier = (f.carrier && (f.carrier.iata || f.carrier.icao)) || '';
    if (!carrier || !f.flightNumber) continue;

    const sd = (f.statusDetails && f.statusDetails[0]) || {};
    const sdHere = (dir === 'arr' ? sd.arrival : sd.departure) || {};
    const est = sdHere.estimatedTime || {};
    const timeliness = dir === 'arr' ? est.inGateTimeliness : est.outGateTimeliness;
    const estGate = dir === 'arr' ? (est.inGate || est.onGround) : (est.outGate || est.offGround);
    // "here" = this airport's side, "there" = the other endpoint (the city shown).
    const here = (dir === 'arr' ? f.arrival : f.departure) || {};
    const there = (dir === 'arr' ? f.departure : f.arrival) || {};
    const opName = f.codeshare && f.codeshare.operatingAirlineDisclosure
      && f.codeshare.operatingAirlineDisclosure.name;

    out.push({
      airline: carrier,
      flight: carrier + f.flightNumber,
      cityIata: (there.airport && there.airport.iata) || '',
      schedTime: (here.time && here.time.local) || '',
      estTime: (estGate && estGate.local) ? String(estGate.local).slice(11, 16) : '',
      gate: (sdHere.gate || here.gate || '') + '',
      baggage: dir === 'arr' ? (sdHere.baggage || '') : '',
      aircraft: (f.aircraftType && (f.aircraftType.iata || f.aircraftType.icao)) || '',
      reg: (sd.equipment && sd.equipment.aircraftRegistrationNumber) || '',
      operatedBy: opName || '',
      state: sd.state || f.flightType || 'Scheduled',
      timeliness: timeliness || '',
    });
  }
  out.sort((a, b) => String(a.schedTime).localeCompare(String(b.schedTime)));
  return out;
}
