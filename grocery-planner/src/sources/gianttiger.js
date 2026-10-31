// Giant Tiger regular prices, read from the public Shopify storefront endpoints every browser
// uses on gianttiger.com: /collections/<handle>/products.json and /search/suggest.json.
// No key, no spoofing. Prices are the chain's online listing; most grocery items are tagged
// in_store_only, meaning the listed price is the store price. Behind GIANTTIGER_ENABLED.
//
// For a catalogue item we read its whole category (cached a day, up to PAGES pages of 250) and
// let the matcher pick; for anything else we use the ten-result search suggestion endpoint.

import { parsePrice } from '../engine/price.js';
import { fold } from '../engine/text.js';

const BASE = 'https://www.gianttiger.com';
const PAGES = 3;

// catalogue key -> collection handle (from /collections.json, October 2026)
export const COLLECTIONS = {
  apples: 'fresh-fruits', bananas: 'fresh-fruits', oranges: 'fresh-fruits', strawberries: 'fresh-fruits', avocados: 'fresh-fruits',
  potatoes: 'fresh-vegetables', onions: 'fresh-vegetables', carrots: 'fresh-vegetables', tomatoes: 'fresh-vegetables', lettuce: 'fresh-vegetables', peppers: 'fresh-vegetables', broccoli: 'fresh-vegetables',
  milk: 'milk-and-cream', eggs: 'eggs', butter: 'butter-and-spread', cheese: 'cheese', yogurt: 'yogurt',
  cookies: 'cookies', bread: 'bread', cereal: 'cereal-and-granola', pasta: 'pasta', rice: 'rice', sugar: 'sugars', flour: 'flours-and-baking-powders',
  coffee: 'coffee-and-tea', juice: 'juice', 'orange juice': 'juice', water: 'water-and-sparkling-water', soup: 'soups', 'olive oil': 'oils-vinegars-and-spices', 'peanut butter': 'nut-butters',
  bacon: 'bacon-sausages-and-hot-dogs', ham: 'specialty-meats', 'pork chops': 'pork', chicken: 'chicken-and-turkey', 'ground beef': 'beef', salmon: 'meat-and-seafood', 'frozen pizza': 'frozen-pizza',
  'toilet paper': 'toilet-paper', 'paper towels': 'paper-towel', diapers: 'diapers-and-wipes', 'cat food': 'pet-food', 'dog food': 'pet-food',
};

export function createGiantTiger({ fetch: fetchFn = globalThis.fetch, cache, userAgent = 'grocery-planner/0.1', ttlSeconds = 24 * 3600, now = () => new Date() } = {}) {
  async function getJson(url) {
    const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (!res.ok) throw new Error('gianttiger ' + res.status + ' for ' + url);
    return res.json();
  }
  async function cached(key, loader) {
    if (cache) { const hit = await cache.get(key); if (hit) return hit; }
    const v = await loader();
    if (cache) await cache.put(key, v, ttlSeconds);
    return v;
  }
  async function collection(handle) {
    return cached('gianttiger:collection:' + handle, async () => {
      const slim = [];
      for (let page = 1; page <= PAGES; page++) {
        const d = await getJson(`${BASE}/collections/${handle}/products.json?limit=250&page=${page}`);
        const products = d.products || [];
        for (const p of products) slim.push(slimProduct(p));
        if (products.length < 250) break;
      }
      return slim;
    });
  }
  async function searchOffers(_postal, term, _lang, ctx = {}) {
    const handle = ctx.line && !ctx.line.generic ? COLLECTIONS[ctx.line.key] : null;
    const products = handle ? await collection(handle) : await cached('gianttiger:search:' + fold(term), async () => {
      const d = await getJson(`${BASE}/search/suggest.json?q=${encodeURIComponent(term)}&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=hide`);
      return (d?.resources?.results?.products || []).map(slimSuggest);
    });
    return productsToOffers(products, now());
  }
  return { id: 'gianttiger', kind: 'regular', langs: ['en'], usesTerm: true, searchOffers, collection };
}

// products.json shape
export function slimProduct(p) {
  const v = (p.variants || [])[0] || {};
  return { id: p.id, title: p.title, handle: p.handle, vendor: p.vendor || null, price: num(v.price), compare: num(v.compare_at_price), available: v.available !== false, tags: (p.tags || []).filter(t => /^(in_store_only|L1_category_en)/.test(t)) };
}
// suggest.json shape
export function slimSuggest(p) {
  return { id: p.id, title: p.title, handle: p.handle, vendor: p.vendor || null, price: num(p.price), compare: num(p.compare_at_price_min), available: p.available !== false, tags: (p.tags || []).filter(t => /^(in_store_only|L1_category_en)/.test(t)) };
}

export function productsToOffers(products, fetchedAt = new Date()) {
  const out = [];
  for (const p of products) {
    if (!p?.title || p.available === false || !Number.isFinite(p.price) || p.price <= 0) continue;
    const compare = p.compare && p.compare > p.price ? p.compare : null;
    const parsed = parsePrice({ price: p.price, originalPrice: compare, name: p.title });
    out.push({
      id: 'gianttiger:' + p.id,
      source: 'gianttiger',
      kind: compare ? 'sale' : 'regular',
      merchant: 'Giant Tiger',
      merchantKey: 'giant tiger',
      name: p.title,
      brand: p.vendor,
      category: (p.tags.find(t => t.startsWith('L1_category_en:')) || '').replace('L1_category_en:', '') || null,
      inStoreOnly: p.tags.includes('in_store_only:true'),
      url: p.handle ? `${BASE}/products/${p.handle}` : null,
      validFrom: null, validTo: null,
      fetchedAt: fetchedAt.toISOString(),
      saleStory: null,
      parsed,
    });
  }
  return out;
}

// Kept for tests and for callers that still hold a raw suggest.json response.
export function suggestToOffers(data, fetchedAt = new Date()) {
  return productsToOffers((data?.resources?.results?.products || []).map(slimSuggest), fetchedAt);
}

function num(v) { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; }
