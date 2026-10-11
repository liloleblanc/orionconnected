'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24037 — THE BOARDS' WEATHER IS MET NORWAY'S, AND ONLY MET NORWAY'S.
//
// The rows and the gate asked the proxy's Open-Meteo routes first; Open-Meteo's
// free tier is non-commercial only and these boards carry advertising. Every
// surface now reads the site worker's /wxcurrent and /wxdaily (MET Norway,
// NLOD 2.0 / CC BY 4.0, credited on the weather card). The proxy's /weather/
// routes answer 410, the card's Open-Meteo daily fallback and the hotel ads'
// Open-Meteo geocoder are gone, and nothing calls Open-Meteo anywhere.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = rd('fids-current/js/fids-core.js');
const ENTRY = rd('worker-entry.js');
const PROXY = rd('workers/fids-proxy.js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

test('nothing on the boards or in the workers calls Open-Meteo', () => {
  const files = walk(path.join(ROOT, 'fids-current')).filter((f) => /\.(js|html)$/.test(f))
    .concat([path.join(ROOT, 'worker-entry.js'), path.join(ROOT, 'workers/fids-proxy.js')]);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /https?:\/\/[a-z-]*\.?open-meteo\.com/, path.relative(ROOT, f));
  }
  assert.doesNotMatch(CORE, /\/weather\/realtime|\/weather\/forecast/, 'the boards no longer ask the proxy for weather');
});

test('the proxy\'s old weather routes say they are gone instead of serving weather', () => {
  const at = PROXY.indexOf('if (path.startsWith("/weather/")) {');
  assert.ok(at > 0);
  const block = PROXY.slice(at, PROXY.indexOf('\n    }', at) + 6);
  assert.match(block, /return jsonResponse\(\{ error: "gone"[^}]*\}, 410, origin\);/);
  assert.doesNotMatch(PROXY, /omCachedJson|omRound/);
});

test('the board weather is one MET reading, kept when a refresh fails', () => {
  const at = CORE.indexOf('async function fetchTomorrowWeather(iata) {');
  const fn = CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
  assert.match(fn, /const got = await _fetchMetWx\(iata\);\s*if \(!got\) return cached \|\| null;/);
  assert.doesNotMatch(fn, /fetch\(/, 'no second provider: only _fetchMetWx fetches');
  assert.match(CORE, /var r = await fetch\('\/wxcurrent\?location=' \+ lat \+ ',' \+ lon\);/);
  const daily = CORE.slice(CORE.indexOf('function _wxFetchDaily('), CORE.indexOf('\n}\n', CORE.indexOf('function _wxFetchDaily(')));
  assert.match(daily, /fetch\('\/wxdaily\?location=' \+ C\[0\] \+ ',' \+ C\[1\]\)/);
  assert.doesNotMatch(daily, /_omFb|_omDaily/);
});

test('MET\'s reading carries what the boards show: gusts, direction, cloud, pressure, rain chance', () => {
  const a = ENTRY.indexOf('const metToCurrent = (met) => {');
  const b = ENTRY.indexOf('const metToDaily', a);
  const MET_WMO = { rain: 63, cloudy: 3 };
  const metWmo = (sym) => { const base = String(sym || '').replace(/_(day|night|polartwilight)$/, ''); return base ? (MET_WMO[base] ?? null) : null; };
  const metHourStr = (iso) => String(iso || '').slice(0, 16);
  const toCurrent = new Function('metWmo', 'metHourStr', ENTRY.slice(a, b).replace('const metToCurrent =', 'return'))(metWmo, metHourStr);
  const out = toCurrent({ properties: { timeseries: [
    { time: '2026-10-11T17:00:00Z', data: { instant: { details: { air_temperature: 9.5, apparent_air_temperature: 7.1, wind_speed: 5, wind_speed_of_gust: 9,
      wind_from_direction: 220, cloud_area_fraction: 80, air_pressure_at_sea_level: 1012.3, relative_humidity: 70 } },
      next_1_hours: { summary: { symbol_code: 'rain' }, details: { probability_of_precipitation: 60 } } } },
    { time: '2026-10-11T18:00:00Z', data: { instant: { details: { air_temperature: 9 } }, next_1_hours: { summary: { symbol_code: 'cloudy' } } } }] } });
  assert.deepEqual(out.current, { temperature_2m: 9.5, apparent_temperature: 7.1, weather_code: 63, wind_speed_10m: 18, relative_humidity_2m: 70,
    wind_gusts_10m: 32.4, wind_direction_10m: 220, cloud_cover: 80, surface_pressure: 1012.3, precipitation_probability: 60 });
  assert.deepEqual(out.hourly.time, ['2026-10-11T17:00', '2026-10-11T18:00']);
  assert.deepEqual(out.hourly.wind_gusts_10m, [32.4, null]);
  assert.deepEqual(out.hourly.precipitation_probability, [60, null]);
  assert.equal(out._src, 'met-norway');
  // and the board reads those names into the fields its surfaces use
  const reader = CORE.slice(CORE.indexOf('async function _fetchMetWx(iata) {'), CORE.indexOf('async function fetchTomorrowWeather('));
  for (const f of ['windGust: num(c.wind_gusts_10m)', 'windDir: num(c.wind_direction_10m)', 'cloudCover: num(c.cloud_cover)',
                   'pressure: num(c.surface_pressure)', 'precip: num(c.precipitation_probability)']) {
    assert.ok(reader.includes(f), f);
  }
});

test('the hotel ads take coordinates from our own airport table, not a geocoder', () => {
  const fn = CORE.slice(CORE.indexOf('function fetchAccorHotels('), CORE.indexOf('\n}\n', CORE.indexOf('function fetchAccorHotels(')));
  assert.match(fn, /_apC = \(typeof _lookupAirport === 'function'\) \? _lookupAirport\(destIata\) : null;/);
  assert.doesNotMatch(fn, /geocoding/);
});
