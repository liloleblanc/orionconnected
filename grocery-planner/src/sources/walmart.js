// Walmart Canada regular prices, parsed from the public search page's embedded page data.
//
// Caveats, which is why this is OFF by default (WALMART_ENABLED=false):
//  - the page prices a default Ontario store unless the visitor has chosen a store in the
//    site's own UI; wiring that up needs Walmart's internal location calls, not done here;
//  - the site's bot protection blocks automated clients intermittently.
// Offers from here are labelled "default store pricing, not confirmed for your store".

import { parsePrice } from '../engine/price.js';

const BASE = 'https://www.walmart.ca';

export function createWalmart({ fetch: fetchFn = globalThis.fetch, cache, userAgent = 'grocery-planner/0.1', ttlSeconds = 12 * 3600, now = () => new Date() } = {}) {
  async function cached(key, loader) {
    if (cache) { const hit = await cache.get(key); if (hit) return hit; }
    const v = await loader();
    if (cache) await cache.put(key, v, ttlSeconds);
    return v;
  }
  async function searchOffers(_postal, term, _lang) {
    return cached('walmart:search:' + term.toLowerCase(), async () => {
      const res = await fetchFn(`${BASE}/en/search?q=${encodeURIComponent(term)}`, { headers: { 'User-Agent': userAgent, Accept: 'text/html' } });
      if (!res.ok) throw new Error('walmart ' + res.status);
      const html = await res.text();
      const data = extractNextData(html);
      if (!data) throw new Error('walmart page data not found');
      return pageDataToOffers(data, now());
    });
  }
  return { id: 'walmart', kind: 'regular', langs: ['en'], usesTerm: true, searchOffers };
}

export function extractNextData(html) {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export function pageDataToOffers(data, fetchedAt = new Date()) {
  const init = data?.props?.pageProps?.initialData || {};
  const loc = init.pageMetadata?.location || {};
  const stacks = init.searchResult?.itemStacks || [];
  const out = [];
  for (const st of stacks) for (const it of (st.items || [])) {
    if (!it?.name || it.type !== 'REGULAR') continue;
    const pi = it.priceInfo || {};
    const price = money(pi.linePrice);
    if (price == null) continue;
    const was = money(pi.wasPrice);
    const parsed = parsePrice({ price, originalPrice: was && was > price ? was : null, name: it.name });
    // Walmart gives a unit price like "16¢/100ml" or "$1.07/100g"; use it when the name had no size.
    if (parsed.basePrice == null && pi.unitPrice) {
      const u = /(\d+(?:\.\d+)?)\s*(¢|\$)?\s*\/\s*(\d+)?\s*(g|ml|kg|l|ea|unit)/i.exec(pi.unitPrice.replace('$', '').replace(/^\s*/, '')) || /(\d+(?:\.\d+)?)(¢)\/(\d+)?(g|ml|kg|l)/i.exec(pi.unitPrice);
      if (u) {
        let v = parseFloat(u[1]); if (u[2] === '¢' || /¢/.test(pi.unitPrice)) v = v / 100;
        const per = parseFloat(u[3] || '1'); const unit = u[4].toLowerCase();
        const scale = unit === 'g' || unit === 'ml' ? 1000 / per : 1 / per;
        parsed.basePrice = v * scale; parsed.baseUnit = unit === 'g' || unit === 'kg' ? 'kg' : unit === 'ml' || unit === 'l' ? 'l' : 'ea';
      }
    }
    out.push({
      id: 'walmart:' + (it.usItemId || it.id),
      source: 'walmart',
      kind: was && was > price ? 'sale' : 'regular',
      merchant: 'Walmart',
      merchantKey: 'walmart',
      name: it.name,
      brand: it.brand || null,
      category: it.category || null,
      storeId: loc.storeId || null,
      storeNote: loc.city ? `priced for the ${loc.city}, ${loc.stateOrProvinceCode} default store` : 'default store pricing',
      availability: it.availabilityStatusDisplayValue || null,
      url: it.canonicalUrl ? BASE + it.canonicalUrl : null,
      validFrom: null, validTo: null,
      fetchedAt: fetchedAt.toISOString(),
      saleStory: null,
      parsed,
    });
  }
  return out;
}

function money(s) {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
