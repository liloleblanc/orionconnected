import proxy from "./workers/fids-proxy.js";

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
  // v23167 — THE 3D ENGINE STACK IS GONE (Nick: "It never was installed
  // properly", "Remove anything not serving seriously").
  //
  // This used to proxy MapLibre GL v5, three.js r128, GLTFLoader and a
  // Cesium airliner .glb "used by the 3D route-map prototype". That prototype
  // was never installed: js/map3d.js was deleted from the repo, no page ever
  // loaded it, and the model it wanted (/models/a320neo.glb) never existed at
  // all. window.GateMap3D was therefore permanently undefined, so the four
  // guards in fids-core.js that called it silently evaluated false forever —
  // they are removed in the same commit.
  //
  // What was left was a route to four third-party downloads that nothing on
  // any board could ask for. Not merely unused: an unused fetch path is still
  // surface area, and it read as if 3D were a supported feature.
  //
  // If 3D is ever revisited, note the constraint that killed it: the streaming
  // droplet has 2 vCPUs and no GPU, so WebGL there falls back to software
  // rendering and would be slower than the 2D board it replaced.
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
// RainViewer composite precipitation radar — free, no API key. The index
// lists available frame timestamps; tiles are fetched per-frame. Both are
// fixed constants (same SSRF discipline as every other upstream here).
const WX_RADAR_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const WX_RADAR_TILE_BASE = 'https://tilecache.rainviewer.com/v2/radar/';

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

// ── MIA WebFIDS ────────────────────────────────────────────────────────
// Fixed upstream, never caller-supplied. 60s is well inside how fast the
// board actually changes and keeps our footprint on MIA's server to about
// one request a minute per edge no matter how many displays are running.
const MIA_FIDS_BASE = 'https://webvids.miami-airport.com/webfids/webfids?action=';
const MIA_TTL = 60;

// Only the fields the board renders. Everything else in the record (their
// own logo paths, formatted-time duplicates, sort keys) is dropped here so
// the display never receives it.
const MIA_FIELDS = [
  'city', 'stt', 'ett', 'att', 'status', 'gate', 'terminal', 'bags',
  'airlineName', 'CXR', 'TRN', 'CTY', 'TYP', 'REG', 'timeInMillis',
];

const MIA_ENTITIES = {
  '&#160;': ' ', '&nbsp;': ' ', '\u00a0': ' ',
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'",
};
const MIA_ENTITY_RE = /&(?:#160|nbsp|amp|lt|gt|quot|#39|apos);|\u00a0/g;

// Minimal XML field reader. The payload is flat, machine-generated and
// regular — one <flight> per record with non-nested leaf tags — so a real
// parser buys nothing, and Workers has no DOMParser anyway.
//
// '#' and &#160; are how this feed spells "empty"; both normalise to ''.
function miaField(rec, tag) {
  const m = rec.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
  if (!m) return '';
  // ONE pass over the whole string, not a chain. Chained replaces
  // double-unescape: "&amp;lt;" becomes "&lt;" on the &amp; pass and then "<"
  // on the &lt; pass, so escaped markup in the source comes back as live
  // markup. A single alternation consumes each entity exactly once.
  const v = m[1].replace(MIA_ENTITY_RE, (e) => MIA_ENTITIES[e] || ' ').trim();
  return v === '#' ? '' : v;
}

function miaParseFlights(xml) {
  const out = [];
  const recs = String(xml || '').match(/<flight>[\s\S]*?<\/flight>/g) || [];
  for (const rec of recs) {
    const o = {};
    for (const f of MIA_FIELDS) o[f] = miaField(rec, f);
    // A record with no carrier or no flight number can't be rendered.
    if (!o.CXR && !o.TRN) continue;
    // First codeshare only — that's all the row has space to show.
    const cs = rec.match(/<csFlight>([\s\S]*?)<\/csFlight>/);
    if (cs) o.codeshare = cs[1].replace(/&#160;/g, ' ').trim();
    out.push(o);
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // v23323 — RECOVERY ROUTE. The fids-proxy Worker's auto-build deploys
    // THIS entry (root wrangler.jsonc) under the fids-proxy name, which
    // tonight replaced the real backend and took the feeds down. Until that
    // build is repointed at workers/wrangler.fids-proxy.jsonc, this entry
    // carries the real proxy bundled in and hands the request over whenever
    // it is running under the fids-proxy hostname. Secrets persist on the
    // Worker; KV/R2/AI bindings are declared in the root config below.
    if (url.hostname.startsWith("fids-proxy")) {
      return proxy.fetch(request, env, ctx);
    }

    // ── Map engine passthrough ──────────────────────────────────────────
    // Short alias for the stream-agent installer, so it can be TYPED into a
    // server console that refuses pastes:  curl -sL fids.orionconnected.com/a|bash
    // The script itself lives in the fids-proxy worker (/stream/agent.sh);
    // this only shortens the URL people have to key in by hand.
    if (path === '/a') {
      try {
        const r = await fetch('https://fids-proxy.n-leblanc1984.workers.dev/stream/agent.sh');
        if (!r.ok) return new Response('agent fetch failed ' + r.status, { status: 502, headers: NO_STORE });
        return new Response(r.body, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE }
        });
      } catch (e) {
        return new Response('agent fetch failed', { status: 502, headers: NO_STORE });
      }
    }
    // Short aliases for the two stream installers — same reasoning as /a above.
    // These get TYPED into the Hetzner web console, which drops characters on
    // long lines, so the raw.githubusercontent URL is unusable by hand:
    //     wget fids.orionconnected.com/t
    //     bash t
    //   /s → rebuild the FIRST stream  (/opt/fids-stream)
    //   /t → rebuild the SECOND stream (/opt/fids-stream-tpa)
    // Served straight from the repository, so there is one source of truth and
    // nothing shell-shaped has to live in the public asset directory — which
    // tests/repository-cleanliness.test.js forbids outright.
    const STREAM_INSTALLERS = {
      '/s': 'stream-server/setup.sh',
      '/t': 'stream-server/tools/repair-second-stream.sh',
    };
    if (STREAM_INSTALLERS[path]) {
      const src = 'https://raw.githubusercontent.com/liloleblanc/orionconnected/main/'
                + STREAM_INSTALLERS[path];
      try {
        const r = await fetch(src);
        if (!r.ok) return new Response('installer fetch failed ' + r.status, { status: 502, headers: NO_STORE });
        // Normalise line endings on the way out. A single stray CR makes line
        // one read `set -euo pipefail\r`, and bash rejects it with "invalid
        // option name: pipefail" — which reads like a corrupt download and cost
        // hours to identify on a console with no copy/paste. Whatever the file
        // is committed as, what leaves here runs.
        const body = (await r.text()).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE }
        });
      } catch (e) {
        return new Response('installer fetch failed', { status: 502, headers: NO_STORE });
      }
    }
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
    // v23448 — open-meteo answers a quota refusal with HTTP 200 and a body of
    // {"error":true,"reason":"Daily API request limit exceeded…"}. r.ok was
    // therefore TRUE, and this route forwarded that refusal AND stamped it
    // max-age=1800 — so a single refusal poisoned the week's forecast for half
    // an hour at a time (Nick: 'Weather doesnt work either'). The status is not
    // enough; the body has to be read. Coordinates are rounded to ~1km so all
    // callers for one airport share a cache entry, and a good reading is kept
    // for six hours so an outage shows last week's real numbers rather than
    // nothing. See the matching omCachedJson in workers/fids-proxy.js.
    // ══════════════════════════════════════════════════════════════════
    // v23452 — WEATHER COMES FROM MET NORWAY NOW.
    //
    // Nick: 'Weather doesnt work either'. open-meteo's free tier was refusing
    // with "Daily API request limit exceeded". v23448 cached it, which stops
    // the burn — but two things came out of researching the replacement that
    // made a cache alone the wrong answer:
    //
    //   1. The free tier is licensed NON-COMMERCIAL ONLY. open-meteo's terms:
    //      "You may only use the free API services for non-commercial
    //      purposes", and their own example of commercial use is "Operating
    //      websites or apps that ... display advertisements". These boards
    //      carry advertising — the product is literally Gate & Advertisement
    //      Terminal Experience. So the old arrangement was outside its licence
    //      regardless of how politely we cached it.
    //
    //   2. MET Norway (the Norwegian Meteorological Institute, the service
    //      behind yr.no) publishes the same kind of forecast with NO key, NO
    //      account, NO credit budget and NO daily quota — the failure mode that
    //      took the boards down does not exist here. The only ceiling is 20
    //      requests/second for the whole application; this roster runs about
    //      600x under it. It is dual-licensed NLOD 2.0 / CC BY 4.0, and NLOD
    //      grants use "for any purpose and in all contexts" — public display
    //      and broadcast included, commercially, which is exactly what a gate
    //      board on a live stream is.
    //
    // Their terms ask for specific manners, all honoured below: a real
    // User-Agent naming the app and a reachable contact (placeholder domains
    // are actively rejected — a UA containing example.com gets a 403); gzip;
    // coordinates truncated to at most 4 decimals; no browser calling the API
    // directly ("use a local proxy ... where you can cache data"); and no
    // refetching before the Expires header, which sits ~30 minutes out. The
    // cache below already satisfied the last one at 30 minutes.
    //
    // Attribution, per Nick: a line on the board reading "Weather data
    // generously provided by MET Norway". NLOD allows the credit to live on an
    // about page; showing it on the board itself is more than required.
    // ══════════════════════════════════════════════════════════════════
    const MET_UA = 'OrionFIDS/1.0 (+https://fids.orionconnected.com)';
    // MET encodes conditions as symbol_code strings; the boards speak WMO
    // codes and already own the icon and label tables for them. 41 base
    // symbols, 21 of which take _day/_night/_polartwilight suffixes, giving 83
    // distinct strings — all of which collapse onto WMO codes the boards
    // already handle, so no new artwork is needed.
    //
    // Two of MET's own strings are misspelled — lightssleetshowersandthunder
    // and lightssnowshowersandthunder carry an extra 's'. MET has deliberately
    // NOT fixed them ("correcting this would mean breaking existing
    // applications"), so they are the real wire values. Both end in
    // 'andthunder' and are caught by the rule below rather than needing to be
    // spelled out, misspelling and all.
    const MET_WMO = {
      clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
      lightrain: 61, rain: 63, heavyrain: 65,
      lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
      lightsnow: 71, snow: 73, heavysnow: 75,
      lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
      // Sleet is the one lossy step. WMO's strictly-correct mixed-precipitation
      // codes are 68/69 and 83/84, which open-meteo never emitted and the
      // boards therefore have no icons for. Mapping onto the freezing-rain and
      // snow-shower codes reuses art that exists and reads correctly.
      lightsleet: 66, sleet: 67, heavysleet: 67,
      lightsleetshowers: 85, sleetshowers: 85, heavysleetshowers: 86
    };
    const metWmo = (sym) => {
      const base = String(sym || '').replace(/_(day|night|polartwilight)$/, '');
      if (!base) return null;
      // Every *andthunder variant, including MET's two misspelled ones.
      if (/andthunder$/.test(base)) return 95;
      const w = MET_WMO[base];
      return (w === undefined) ? null : w;
    };
    // MET timestamps are UTC ISO ("2026-09-07T18:00:00Z"). The boards parse the
    // hourly series as `new Date(t + ':00Z')`, i.e. open-meteo's UTC form with
    // no seconds, so hand back exactly that.
    const metHourStr = (iso) => String(iso || '').slice(0, 16);

    // MET → open-meteo CURRENT + HOURLY. The client reads exactly:
    //   current.temperature_2m / .apparent_temperature / .weather_code
    //          .wind_speed_10m / .relative_humidity_2m
    //   hourly.time[] / .temperature_2m[] / .weather_code[]
    // and parses each hourly time as `new Date(t + ':00Z')`.
    //
    // MET gives wind in m/s where open-meteo gave km/h, so it is scaled here —
    // getting that wrong would quietly under-report every wind on every board.
    const metToCurrent = (met) => {
      const ts = (met && met.properties && met.properties.timeseries) || [];
      if (!ts.length) return null;
      const d0 = ts[0].data || {};
      const inst = (d0.instant && d0.instant.details) || {};
      if (typeof inst.air_temperature !== 'number') return null;
      const sym0 = (d0.next_1_hours && d0.next_1_hours.summary && d0.next_1_hours.summary.symbol_code)
                || (d0.next_6_hours && d0.next_6_hours.summary && d0.next_6_hours.summary.symbol_code);
      const time = [], temp = [], code = [];
      for (const step of ts) {
        const det = (step.data && step.data.instant && step.data.instant.details) || {};
        if (typeof det.air_temperature !== 'number') continue;
        const sym = (step.data.next_1_hours && step.data.next_1_hours.summary && step.data.next_1_hours.summary.symbol_code)
                 || (step.data.next_6_hours && step.data.next_6_hours.summary && step.data.next_6_hours.summary.symbol_code);
        time.push(metHourStr(step.time));
        temp.push(det.air_temperature);
        code.push(metWmo(sym));
      }
      return {
        current: {
          temperature_2m: inst.air_temperature,
          // apparent_air_temperature exists only on /complete, which is what
          // we request; fall back to the dry-bulb rather than emit null.
          apparent_temperature: (typeof inst.apparent_air_temperature === 'number')
            ? inst.apparent_air_temperature : inst.air_temperature,
          weather_code: metWmo(sym0),
          wind_speed_10m: (typeof inst.wind_speed === 'number')
            ? Math.round(inst.wind_speed * 3.6 * 10) / 10 : null,
          relative_humidity_2m: (typeof inst.relative_humidity === 'number')
            ? Math.round(inst.relative_humidity) : null
        },
        hourly: { time: time, temperature_2m: temp, weather_code: code },
        _src: 'met-norway'
      };
    };

    // MET → open-meteo DAILY. MET publishes no daily summary, so the week is
    // derived from the next_6_hours blocks: bucket every step into its LOCAL
    // day, take the max of air_temperature_max and the min of
    // air_temperature_min across that day's blocks, and take the day's icon
    // from the block nearest local noon (a day is better represented by its
    // afternoon than by whatever happens to fall at midnight).
    //
    // Local day comes from longitude — MET stamps everything UTC, and bucketing
    // by UTC would roll the day over at mid-afternoon for western airports,
    // shifting every high and low by one day. Longitude/15 is within an hour
    // everywhere and only ever has to be right enough to pick a date.
    //
    // Deriving highs and lows is a modification of MET's data, which CC BY 4.0
    // asks be indicated — hence the credit line reads "Weather data generously
    // provided by MET Norway" rather than presenting these as MET's own
    // published daily figures.
    const metToDaily = (met, lonStr) => {
      const ts = (met && met.properties && met.properties.timeseries) || [];
      if (!ts.length) return null;
      const offMs = Math.round(Number(lonStr) / 15) * 3600000;
      const days = new Map();
      for (const step of ts) {
        const t = Date.parse(step.time);
        if (!Number.isFinite(t)) continue;
        const key = new Date(t + offMs).toISOString().slice(0, 10);
        const six = step.data && step.data.next_6_hours;
        const det = (six && six.details) || {};
        let day = days.get(key);
        if (!day) { day = { max: null, min: null, sym: null, symGap: Infinity }; days.set(key, day); }
        if (typeof det.air_temperature_max === 'number') {
          day.max = (day.max == null) ? det.air_temperature_max : Math.max(day.max, det.air_temperature_max);
        }
        if (typeof det.air_temperature_min === 'number') {
          day.min = (day.min == null) ? det.air_temperature_min : Math.min(day.min, det.air_temperature_min);
        }
        const sym = (six && six.summary && six.summary.symbol_code)
                 || (step.data.next_1_hours && step.data.next_1_hours.summary && step.data.next_1_hours.summary.symbol_code);
        if (sym) {
          const localHour = new Date(t + offMs).getUTCHours();
          const gap = Math.abs(localHour - 12);
          if (gap < day.symGap) { day.symGap = gap; day.sym = sym; }
        }
      }
      const time = [], code = [], tmax = [], tmin = [];
      for (const key of [...days.keys()].sort()) {
        const d = days.get(key);
        // A day with no max/min is the tail of the series, not a real day.
        if (d.max == null && d.min == null) continue;
        time.push(key); code.push(metWmo(d.sym));
        tmax.push(d.max); tmin.push(d.min);
        if (time.length >= 7) break;
      }
      if (!time.length) return null;
      return {
        daily: { time: time, weather_code: code, temperature_2m_max: tmax, temperature_2m_min: tmin },
        _src: 'met-norway'
      };
    };

    if (path === '/wxdaily' || path === '/wxcurrent') {
      const loc = url.searchParams.get('location') || '';
      const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(loc);
      if (!m) return new Response('Bad location', { status: 400 });
      // MET asks for at most 4 decimals; 2 is ~1km and makes every board at an
      // airport share one cache entry and one upstream call.
      const rnd = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : null; };
      const la = rnd(m[1]), lo = rnd(m[2]);
      if (la == null || lo == null) return new Response('Bad location', { status: 400 });
      const daily = path === '/wxdaily';
      const om = 'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=' + la + '&lon=' + lo;
      const base = 'https://wx.cache.invalid' + path + '?lat=' + la + '&lng=' + lo;
      const kFresh = new Request(base);
      const kLkg = new Request(base + '&lkg=1');
      const kNeg = new Request(base + '&neg=1');
      const ok = (txt, age, state) => new Response(txt, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=' + age,
          'X-Weather-State': state,
          'Access-Control-Allow-Origin': '*',
        },
      });
      let cache = null;
      try { cache = caches.default; } catch (e) {}
      const lastGood = async () => {
        if (!cache) return null;
        const old = await cache.match(kLkg).catch(() => null);
        return old ? await old.text().catch(() => null) : null;
      };
      try {
        if (cache) {
          const hit = await cache.match(kFresh).catch(() => null);
          if (hit) return ok(await hit.text(), 1800, 'fresh');
          const neg = await cache.match(kNeg).catch(() => null);
          if (neg) {
            const lg = await lastGood();
            return lg ? ok(lg, 120, 'stale')
                      : ok(JSON.stringify({ error: true, reason: 'weather upstream unavailable' }), 120, 'unavailable');
          }
        }
        const r = await fetch(om, {
          headers: { 'User-Agent': MET_UA, 'Accept': 'application/json', 'Accept-Encoding': 'gzip' }
        });
        // 203 is how MET signals a deprecated product version — it keeps
        // serving for about a month, then stops. Surface it so it cannot
        // become a silent hard failure later.
        if (r.status === 203) console.warn('[wx] MET Norway signalled deprecation (HTTP 203) for', path);
        const raw = await r.text();
        let met = null; try { met = JSON.parse(raw); } catch (e) {}
        // Normalise MET's shape into the open-meteo shape the boards already
        // parse, so nothing downstream changes.
        let body = null;
        try { body = met ? (daily ? metToDaily(met, lo) : metToCurrent(met)) : null; } catch (e) { body = null; }
        const txt = body ? JSON.stringify(body) : raw;
        if (!r.ok || !body || body.error) {
          if (cache) {
            await cache.put(kNeg, new Response('1', { headers: { 'Cache-Control': 'public, max-age=120' } })).catch(() => {});
          }
          const lg = await lastGood();
          if (lg) return ok(lg, 120, 'stale');
          return ok(JSON.stringify({
            error: true,
            reason: (met && met.reason) || ('MET Norway upstream ' + r.status)
          }), 120, 'unavailable');
        }
        if (cache) {
          await cache.put(kFresh, new Response(txt, {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' }
          })).catch(() => {});
          await cache.put(kLkg, new Response(txt, {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' }
          })).catch(() => {});
        }
        return ok(txt, 1800, 'fresh');
      } catch (e) {
        const lg = await lastGood();
        if (lg) return ok(lg, 120, 'stale');
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

    // ── MIA flight feed ─────────────────────────────────────────────────
    // /miafids?direction=dep|arr → Miami International's own WebFIDS board.
    //
    // MIA runs AirIT WebFIDS at webvids.miami-airport.com. Its refresh
    // endpoint (action=updateDepartures / updateArrivals) returns the whole
    // board as XML with no auth, no session and no cookie — and crucially it
    // carries the REAL gate on 100% of departures and 97% of arrivals, plus
    // aircraft type and tail number, straight from the airport's own system.
    //
    // Three reasons this is a Worker route and not a browser fetch:
    //
    //  1. CORS. The upstream sends no Access-Control-Allow-Origin, so a
    //     display cannot read it directly — same wall Toronto's feed hit.
    //  2. POLITENESS. Each poll is ~350KB. If every screen fetched its own
    //     copy we would be hammering somebody else's airport infrastructure.
    //     cacheEverything + cacheTtl means MIA sees at most one request per
    //     TTL per edge, however many boards are running, and we identify
    //     ourselves in the User-Agent rather than arriving anonymously.
    //  3. WEIGHT. Parsing 350KB of XML on a signage box every minute is work
    //     the display should not be doing. The Worker reduces it to the ~15
    //     fields the board actually renders, which cuts it by roughly 80%.
    //
    // Deliberately NOT a general proxy, exactly like /logoimg: the upstream
    // is a fixed constant, not a caller-supplied URL. There is nothing here
    // for someone else to point at their own host.
    if (path === '/miafids') {
      const dir = url.searchParams.get('direction') === 'arr' ? 'arr' : 'dep';
      const action = dir === 'dep' ? 'updateDepartures' : 'updateArrivals';
      // https first; plain http second. MIA's firewall silently drops the
      // TCP handshake from Cloudflare's egress ranges on 443 (20s → 522 on
      // every attempt, while the same URL answers instantly from elsewhere).
      // Some origins only apply that filter to TLS, so port 80 is worth one
      // try before giving up — the payload is public-board data, not secrets.
      const upstreams = [
        MIA_FIDS_BASE + action,
        MIA_FIDS_BASE.replace('https://', 'http://') + action,
      ];
      try {
        let r = null;
        for (const upstream of upstreams) {
          try {
            r = await fetch(upstream, {
              cf: { cacheEverything: true, cacheTtl: MIA_TTL },
              headers: {
                'Accept': 'text/xml,application/xml',
                'User-Agent': 'OrionConnectedFIDS/1.0 (airport display board; +https://fids.orionconnected.com)',
              },
            });
            if (r.ok) break;
          } catch (e) { r = null; }
        }
        if (!r || !r.ok) return new Response('MIA upstream ' + (r ? r.status : 'unreachable'), { status: 502, headers: NO_STORE });
        const xml = await r.text();
        const list = miaParseFlights(xml);
        // An empty parse means the upstream shape changed under us. Say so
        // with a 502 rather than serving [] — the client falls back to its
        // other source on a bad status, but would treat [] as "no flights"
        // and wipe the board.
        if (!list.length) return new Response('MIA parse produced 0 flights', { status: 502, headers: NO_STORE });
        return new Response(JSON.stringify({ list, direction: dir, count: list.length }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=' + MIA_TTL,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('MIA fetch failed', { status: 502, headers: NO_STORE });
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

    // ── Weather radar passthrough (RainViewer) ─────────────────────────
    // /wxradar/index → frame-index JSON (which timestamps exist);
    // /wxradar/<ts>/<z>/<x>/<y>.png → composite radar tile for that frame.
    // Same-origin so locked-down display networks never talk to a third
    // party; <ts> is constrained to digits so the upstream URL can only
    // ever point at RainViewer's own frame tree.
    if (path === '/wxradar/index') {
      try {
        const r = await fetch(WX_RADAR_INDEX, { cf: { cacheEverything: true, cacheTtl: 300 } });
        if (!r.ok) return new Response('Radar index upstream ' + r.status, { status: 502, headers: NO_STORE });
        return new Response(r.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('Radar index fetch failed', { status: 502, headers: NO_STORE });
      }
    }
    if (path.startsWith('/wxradar/')) {
      // Frame token: RainViewer moved from numeric timestamps to opaque hex
      // tokens in the index's `path` field ("/v2/radar/9fbb5e443776") —
      // accept both shapes, nothing else.
      const wm = path.slice('/wxradar/'.length).match(/^([0-9a-f]{4,32})\/(\d+)\/(\d+)\/(\d+)\.png$/i);
      if (!wm) return new Response('Bad radar path', { status: 400 });
      // /2/1_1.png = color scheme 2 (universal blue), smoothed, snow shown.
      const upstream = WX_RADAR_TILE_BASE + wm[1] + '/256/' + wm[2] + '/' + wm[3] + '/' + wm[4] + '/2/1_1.png';
      try {
        // Frames are immutable once published — cache hard for an hour.
        const r = await fetch(upstream, { cf: { cacheEverything: true, cacheTtl: 3600 } });
        if (!r.ok) return new Response('Radar upstream ' + r.status, { status: 502, headers: NO_STORE });
        return new Response(r.body, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response('Radar fetch failed', { status: 502, headers: NO_STORE });
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

    // ── A LOST QUESTION MARK STILL FINDS THE BOARD ─────────────────────
    // The stream boxes are configured through a web console that silently
    // drops or substitutes characters, and '?' is one of the casualties: a
    // board URL typed as rotate.html?ap=YQM… reaches the server as
    // rotate.html/ap=YQM…, which is a path that has never existed. Chrome
    // renders the 404, the capture shows a white page, and every component
    // reports healthy — the failure is indistinguishable from a broken board
    // unless you happen to read the address in the screenshot.
    //
    // The last segment of such a path is unmistakably a query string: it
    // carries '=' and the path has no real query of its own. Rather than 404,
    // put the '?' back and redirect. These URLs are already dead, so nothing
    // that works today changes behaviour — and a display cannot be taken off
    // air by one missing keystroke.
    if (!url.search && /\/[^/]*=[^/]*$/.test(path)) {
      const cut = path.lastIndexOf('/');
      const page = path.slice(0, cut);
      const query = path.slice(cut + 1);
      if (page && query.indexOf('=') !== -1) {
        return Response.redirect(url.origin + page + '?' + query, 302);
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
  async scheduled(event, env, ctx) {
    // Only the fids-proxy Worker carries the proxy's secrets — the board
    // Worker (no JWT_SECRET) must not run the credit top-up.
    if (env && env.JWT_SECRET && proxy.scheduled) return proxy.scheduled(event, env, ctx);
  }
};
