// Postal code helpers and optional reverse geocoding (OpenStreetMap Nominatim).
// Nominatim's usage policy requires a real contact in the User-Agent and at most one request a second.

import { cleanPostal, fsaOf } from './engine/text.js';

export { cleanPostal, fsaOf };

export async function reverseGeocode({ lat, lon, fetch: fetchFn = globalThis.fetch, userAgent, cache }) {
  const key = `geo:${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache) { const hit = await cache.get(key); if (hit) return hit; }
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=16&addressdetails=1`;
  const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  if (!res.ok) throw new Error('nominatim ' + res.status);
  const d = await res.json();
  const a = d.address || {};
  const out = { postal: cleanPostal(a.postcode) || null, city: a.city || a.town || a.village || a.municipality || null, province: a.state || null, country: a.country_code || null };
  if (cache) await cache.put(key, out, 30 * 86400);
  return out;
}
