import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, fixtureText, fakeFetch, flippRoutes } from './helpers.js';
import { flyersToMerchants, searchToOffers, createFlipp } from '../src/sources/flipp.js';
import { suggestToOffers, productsToOffers, slimProduct, createGiantTiger, COLLECTIONS } from '../src/sources/gianttiger.js';
import { extractNextData, pageDataToOffers } from '../src/sources/walmart.js';
import { observationToOffer } from '../src/sources/community.js';
import { pricesToOffer, createOpenPrices } from '../src/sources/openprices.js';
import { buildPlan } from '../src/sources/index.js';
import { memoryCache, memoryStore } from '../src/store/memory.js';
import { createCommunity } from '../src/sources/community.js';
import { CATALOG } from '../src/engine/catalog.js';

test('Moncton flyers list: grocers and pharmacies are kept, hardware and pet stores are not', () => {
  const m = flyersToMerchants(fixture('flipp_flyers_E1C.json'));
  const names = Object.fromEntries(m.map(x => [x.name, x.kind]));
  for (const g of ['Atlantic Superstore', 'Sobeys', 'Walmart', 'Costco', 'Giant Tiger', 'No Frills', 'IGA']) assert.equal(names[g], 'grocery', g);
  assert.equal(names['Shoppers Drug Mart'], 'pharmacy');
  assert.equal(names['Canadian Tire'], undefined); assert.equal(names['Pet Valu'], undefined);
});

test('Flipp search items become offers with parsed prices', () => {
  const offers = searchToOffers(fixture('flipp_search_E1C_en-ca_apples.json'));
  const sobeys = offers.find(o => o.merchant === 'Sobeys');
  assert.equal(sobeys.parsed.unit, 'lb'); assert.equal(sobeys.parsed.price, 0.99); assert.equal(sobeys.source, 'flipp');
  assert.ok(offers.every(o => o.parsed.price != null));
});

test('the Flipp feeder caches merchants and searches', async () => {
  const fetch = fakeFetch(flippRoutes());
  const flipp = createFlipp({ fetch, cache: memoryCache() });
  const a = await flipp.groceryMerchants('E1C1E8', 'en'); const b = await flipp.groceryMerchants('E1C1E8', 'en');
  assert.equal(a.merchants.get('sobeys'), 'grocery'); assert.equal(b.merchants.size, a.merchants.size);
  await flipp.searchOffers('E1C1E8', 'apples', 'en'); await flipp.searchOffers('E1C1E8', 'apples', 'en');
  assert.equal(fetch.calls.length, 2);
});

test('Giant Tiger: suggest and collection products become regular-price offers', () => {
  const offers = suggestToOffers(fixture('gianttiger_suggest_milk.json'));
  assert.ok(offers.length >= 8);
  const jug = offers.find(o => /Homogenized Milk 3.25% M.F. - 4L/.test(o.name));
  assert.equal(jug.kind, 'regular'); assert.equal(jug.merchant, 'Giant Tiger'); assert.equal(jug.parsed.baseUnit, 'l'); assert.ok(Math.abs(jug.parsed.basePrice - 8.38 / 4) < 0.001);
  assert.ok(jug.inStoreOnly);
  const sale = offers.find(o => /Condensed/.test(o.name)); assert.equal(sale.kind, 'sale'); assert.equal(sale.parsed.originalPrice, 3.96);
  const slim = slimProduct({ id: 1, title: 'Giant Value White Bread, 570 g', handle: 'bread', vendor: 'Giant Value', tags: ['in_store_only:true', 'x'], variants: [{ price: '1.97', compare_at_price: null, available: true }] });
  assert.equal(productsToOffers([slim])[0].parsed.basePrice.toFixed(2), (1.97 / 0.57).toFixed(2));
  for (const key of Object.keys(COLLECTIONS)) assert.ok(CATALOG.some(c => c.key === key), key + ' is in the catalogue');
});

test('Giant Tiger feeder reads a category for catalogue items and search for the rest', async () => {
  const fetch = fakeFetch([
    [/collections\/milk-and-cream\/products\.json/, { products: [{ id: 7, title: 'Baxter Skim Milk 0% M.F. - 4L', handle: 'h', vendor: 'Baxter', tags: [], variants: [{ price: '5.94', available: true }] }] }],
    [/search\/suggest\.json/, fixture('gianttiger_suggest_milk.json')],
  ]);
  const gt = createGiantTiger({ fetch, cache: memoryCache() });
  const line = { key: 'milk', generic: false };
  const a = await gt.searchOffers('E1C1E8', 'milk', 'en', { line });
  assert.equal(a.length, 1); assert.match(fetch.calls[0].url, /milk-and-cream/);
  const b = await gt.searchOffers('E1C1E8', 'oat milk', 'en', { line: { key: 'oat milk', generic: true } });
  assert.ok(b.length >= 8); assert.match(fetch.calls[1].url, /suggest\.json/);
});

test('Walmart page data parses into offers labelled with the default store', () => {
  const data = extractNextData(fixtureText('walmart_search_milk.html'));
  const offers = pageDataToOffers(data);
  assert.ok(offers.length >= 8);
  const first = offers[0];
  assert.equal(first.merchant, 'Walmart'); assert.equal(first.parsed.price, 6.44); assert.equal(first.parsed.baseUnit, 'l'); assert.ok(Math.abs(first.parsed.basePrice - 1.61) < 0.01);
  assert.match(first.storeNote, /Mississauga/);
  assert.ok(!offers.some(o => o.name === ''));
});

test('community observations become offers that match catalogue keys', async () => {
  const store = memoryStore();
  const community = createCommunity({ store, ttlDays: 14 });
  await community.addObservation({ fsa: 'E1C', merchant: 'Sobeys', store_label: 'Vaughan Harvey', item_text: '2% milk', item_key: 'milk', price: 5.49, quantity: 2, unit: 'l' });
  const offers = await community.searchOffers('E1C1E8', null, 'en', { fsa: 'E1C' });
  assert.equal(offers.length, 1); assert.equal(offers[0].itemKey, 'milk'); assert.equal(offers[0].parsed.baseUnit, 'l'); assert.ok(Math.abs(offers[0].parsed.basePrice - 2.745) < 0.001);
  const o = observationToOffer({ id: 1, created_at: '2026-10-01T00:00:00Z', merchant: 'IGA', item_text: 'apples', price: 1.49, unit: 'lb' });
  assert.equal(o.parsed.unit, 'lb');
});

test('Open Prices: read maps prices to offers; write needs a token and a proof', async () => {
  const o = pricesToOffer({ id: 5, price: 4.99, currency: 'CAD', date: '2026-10-20', location_id: 1, product: { product_name: 'Milk 2L', brands: 'Natrel', product_quantity: 2, product_quantity_unit: 'l' } }, { id: 1, name: 'Sobeys', brand: 'Sobeys' });
  assert.equal(o.merchant, 'Sobeys'); assert.equal(o.parsed.baseUnit, 'l');
  const fetch = fakeFetch([
    [/\/locations\?/, { items: [{ id: 1, osm_name: 'Walmart', osm_address_city: 'Moncton', price_count: 2 }] }],
    [/\/prices\?/, { items: [{ id: 5, price: 4.99, date: '2026-10-20', location_id: 1, product: { product_name: 'Milk 2L' } }] }],
    [/\/proofs\/upload/, { id: 77 }],
    [/\/prices$/, { id: 99 }],
  ]);
  const noToken = createOpenPrices({ fetch, cache: memoryCache() });
  assert.deepEqual(await noToken.submitPrice({ image: new Blob(['x']), price: 1, date: '2026-10-31' }), { ok: false, reason: 'no_token' });
  const op = createOpenPrices({ fetch, cache: memoryCache(), token: 't' });
  assert.deepEqual(await op.submitPrice({ price: 1, date: '2026-10-31' }), { ok: false, reason: 'proof_required' });
  const r = await op.submitPrice({ image: new Blob(['x']), price: 4.99, date: '2026-10-31', categoryTag: 'en:milk', locationId: 1 });
  assert.deepEqual(r, { ok: true, proofId: 77, priceId: 99 });
  const offers = await op.searchOffers('E1C1E8', null, 'en', { city: 'Moncton' });
  assert.equal(offers.length, 1);
});

test('buildPlan with the Moncton fixtures: apples, milk, cookies get sensible winners', async () => {
  const fetch = fakeFetch([...flippRoutes(), [/gianttiger\.com/, { products: [], resources: { results: { products: [] } } }]]);
  const flipp = createFlipp({ fetch, cache: memoryCache() });
  const r = await buildPlan({ sources: [flipp], postal: 'E1C1E8', lines: ['apples', 'milk', 'cookies'], tripCost: 4, maxStores: 2 });
  const apples = r.items[0];
  assert.equal(apples.best.merchant, 'Sobeys'); assert.ok(Math.abs(apples.best.cost - 2.18) < 0.01);
  const milk = r.items[1];
  assert.ok(!milk.byStore.some(s => /Dog Treats|Soft & Chewy/.test(s.offer.name)), 'no pet treats in milk');
  const cookies = r.items[2];
  assert.ok(!cookies.byStore.some(s => s.merchant === 'Pet Valu' || s.merchant === 'Showcase'));
  assert.ok(!cookies.byStore.some(s => s.offer.parsed.flags.includes('online')));
  assert.ok(r.recommended); assert.equal(r.sources.flipp, 'ok');
});
