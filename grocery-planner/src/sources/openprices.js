// Open Prices (Open Food Facts): an open, crowdsourced price database with a free API.
// https://prices.openfoodfacts.org — data under the Open Database License.
//
// Read: recent prices at shops in the user's city. Write: a price with a photo as proof,
// which Open Prices requires. Both are behind OPENPRICES_ENABLED.

import { parsePrice } from '../engine/price.js';
import { fold } from '../engine/text.js';

const BASE = 'https://prices.openfoodfacts.org/api/v1';

export function createOpenPrices({ fetch: fetchFn = globalThis.fetch, cache, token = null, userAgent = 'grocery-planner/0.1', ttlSeconds = 6 * 3600, now = () => new Date() } = {}) {
  async function getJson(url) {
    const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (!res.ok) throw new Error('openprices ' + res.status + ' for ' + url);
    return res.json();
  }
  async function cached(key, loader) {
    if (cache) { const hit = await cache.get(key); if (hit) return hit; }
    const v = await loader();
    if (cache) await cache.put(key, v, ttlSeconds);
    return v;
  }

  // Shops Open Prices knows in this city.
  async function locationsInCity(city) {
    return cached('openprices:locations:' + fold(city), async () => {
      const d = await getJson(`${BASE}/locations?osm_address_country__like=Canada&osm_address_city__like=${encodeURIComponent(city)}&size=100`);
      return (d.items || []).map(l => ({ id: l.id, name: l.osm_name, city: l.osm_address_city, brand: l.osm_brand || null, priceCount: l.price_count || 0 }));
    });
  }

  // Prices seen in the last `days` days at those shops, as offers.
  async function searchOffers(_postal, _term, _lang, { city, days = 30 } = {}) {
    if (!city) return [];
    const locs = await locationsInCity(city);
    if (!locs.length) return [];
    const ids = locs.map(l => l.id).join(',');
    const since = new Date(now().getTime() - days * 86400000).toISOString().slice(0, 10);
    const d = await cached(`openprices:prices:${fold(city)}:${since}`, () => getJson(`${BASE}/prices?location_id__in=${ids}&date__gte=${since}&size=100&order_by=-date`));
    const byId = new Map(locs.map(l => [l.id, l]));
    return (d.items || []).map(p => pricesToOffer(p, byId.get(p.location_id))).filter(Boolean);
  }

  // Submit one price with a proof image. Needs a bearer token (an Open Food Facts account).
  async function submitPrice({ image, imageName = 'proof.jpg', proofType = 'PRICE_TAG', date, price, currency = 'CAD', productCode, categoryTag, productName, locationId, locationOsmId, locationOsmType = 'NODE', pricePer }) {
    if (!token) return { ok: false, reason: 'no_token' };
    if (!image) return { ok: false, reason: 'proof_required' };
    const fd = new FormData();
    fd.append('file', image, imageName);
    fd.append('type', proofType);
    fd.append('date', date);
    fd.append('currency', currency);
    if (locationId) fd.append('location_id', String(locationId));
    else if (locationOsmId) { fd.append('location_osm_id', String(locationOsmId)); fd.append('location_osm_type', locationOsmType); }
    const pr = await fetchFn(`${BASE}/proofs/upload`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'User-Agent': userAgent }, body: fd });
    if (!pr.ok) return { ok: false, reason: 'proof_upload_failed', status: pr.status };
    const proof = await pr.json();
    const body = { proof_id: proof.id, price, currency, date, type: productCode ? 'PRODUCT' : 'CATEGORY' };
    if (productCode) body.product_code = productCode; else { body.category_tag = categoryTag; if (pricePer) body.price_per = pricePer; }
    if (productName) body.product_name = productName;
    if (locationId) body.location_id = locationId; else if (locationOsmId) { body.location_osm_id = locationOsmId; body.location_osm_type = locationOsmType; }
    const res = await fetchFn(`${BASE}/prices`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': userAgent }, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, reason: 'price_post_failed', status: res.status };
    const created = await res.json();
    return { ok: true, proofId: proof.id, priceId: created.id };
  }

  return { id: 'openprices', kind: 'reported', langs: ['en'], usesTerm: false, searchOffers, locationsInCity, submitPrice };
}

export function pricesToOffer(p, loc) {
  const name = p.product?.product_name || p.product_name || p.category_tag || null;
  if (!name || p.price == null) return null;
  const merchant = loc?.brand || loc?.name || 'Unknown shop';
  const sizeName = p.product?.product_quantity && p.product?.product_quantity_unit ? `${name}, ${p.product.product_quantity} ${p.product.product_quantity_unit}` : name;
  const postText = p.price_per === 'KILOGRAM' ? '/kg' : p.price_per === 'UNIT' ? 'ea' : null;
  const parsed = parsePrice({ price: p.price, originalPrice: p.price_is_discounted ? p.price_without_discount : null, name: sizeName, postText });
  return {
    id: 'openprices:' + p.id,
    source: 'openprices',
    merchant, merchantKey: fold(merchant),
    name, brand: p.product?.brands || null, category: p.category_tag || null,
    validFrom: p.date, validTo: null, fetchedAt: p.created || p.date, saleStory: null, parsed,
  };
}
