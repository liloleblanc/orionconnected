// Flipp flyer feeder.
//
// This reads the undocumented backend behind the Flipp app and website. It is the broadest
// source of this week's grocery sale prices in Canada, and the one most likely to change or
// be withdrawn without notice. It is behind FLIPP_ENABLED and nothing else depends on it.
//
// Exposes: groceryMerchants(postal, lang) and searchOffers(postal, term, lang), both cached.

import { parsePrice } from '../engine/price.js';
import { fold } from '../engine/text.js';

const BASE = 'https://backflipp.wishabi.com/flipp';

export function createFlipp({ fetch: fetchFn = globalThis.fetch, cache, userAgent = 'grocery-planner/0.1', ttlSeconds = 6 * 3600, now = () => new Date() } = {}) {
  async function getJson(url) {
    const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (!res.ok) throw new Error('flipp ' + res.status + ' for ' + url);
    return res.json();
  }

  async function cached(key, loader) {
    if (cache) {
      const hit = await cache.get(key);
      if (hit) return hit;
    }
    const value = await loader();
    if (cache) await cache.put(key, value, ttlSeconds);
    return value;
  }

  // Map of folded merchant name -> 'grocery' | 'pharmacy', built from the flyers available at this postal code.
  async function groceryMerchants(postal, lang = 'en') {
    const locale = lang === 'fr' ? 'fr-ca' : 'en-ca';
    const key = `flipp:merchants:${postal}:${locale}`;
    const list = await cached(key, async () => {
      const data = await getJson(`${BASE}/flyers?locale=${locale}&postal_code=${encodeURIComponent(postal)}`);
      return flyersToMerchants(data);
    });
    return { merchants: new Map(list.map(m => [m.key, m.kind])), flyers: list };
  }

  async function searchOffers(postal, term, lang = 'en') {
    const locale = lang === 'fr' ? 'fr-ca' : 'en-ca';
    const key = `flipp:search:${postal}:${locale}:${fold(term)}`;
    return cached(key, async () => {
      const data = await getJson(`${BASE}/items/search?locale=${locale}&postal_code=${encodeURIComponent(postal)}&q=${encodeURIComponent(term)}`);
      return searchToOffers(data, now());
    });
  }

  return { id: 'flipp', kind: 'sale', langs: ['en', 'fr'], usesTerm: true, groceryMerchants, searchOffers };
}

export function flyersToMerchants(data) {
  const flyers = Array.isArray(data) ? data : (data?.flyers || []);
  const out = new Map();
  for (const f of flyers) {
    const cats = (f.categories || []).map(c => String(c).toLowerCase());
    let kind = null;
    if (cats.includes('groceries') || cats.includes('épicerie') || cats.includes('epicerie')) kind = 'grocery';
    else if (cats.includes('pharmacy') || cats.includes('pharmacie')) kind = 'pharmacy';
    if (!kind) continue;
    const key = fold(f.merchant);
    const prev = out.get(key);
    if (!prev || prev.kind === 'pharmacy') out.set(key, { key, name: f.merchant, merchantId: f.merchant_id, kind, flyerId: f.id, validFrom: f.valid_from, validTo: f.valid_to });
  }
  return [...out.values()];
}

export function searchToOffers(data, fetchedAt = new Date()) {
  const items = Array.isArray(data) ? data : (data?.items || []);
  const offers = [];
  for (const it of items) {
    if (!it || !it.name) continue;
    if (it.item_type && it.item_type !== 'flyer') continue;
    const parsed = parsePrice({ price: it.current_price, originalPrice: it.original_price, preText: it.pre_price_text, postText: it.post_price_text, saleStory: it.sale_story, name: it.name });
    if (parsed.price == null) continue;
    offers.push({
      id: 'flipp:' + it.id,
      source: 'flipp',
      merchant: it.merchant_name,
      merchantKey: fold(it.merchant_name),
      name: it.name,
      brand: null,
      category: [it._L1, it._L2].filter(Boolean).join(' / ') || null,
      validFrom: it.valid_from || null,
      validTo: it.valid_to || null,
      fetchedAt: fetchedAt.toISOString(),
      saleStory: it.sale_story || null,
      parsed,
    });
  }
  return offers;
}
