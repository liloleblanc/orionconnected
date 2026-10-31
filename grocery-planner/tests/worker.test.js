import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, fakeFetch, flippRoutes } from './helpers.js';
import { handleRequest, runScheduled } from '../src/worker.js';
import { memoryStore, memoryCache } from '../src/store/memory.js';

const env = { FLIPP_ENABLED: 'true', GIANTTIGER_ENABLED: 'true', WALMART_ENABLED: 'false', COMMUNITY_ENABLED: 'true', OPENPRICES_ENABLED: 'false', NOMINATIM_ENABLED: 'true', DEFAULT_TRIP_COST: '4', COMMUNITY_TTL_DAYS: '14', APP_USER_AGENT: 'test' };
const gtRoutes = [[/gianttiger\.com\/collections\/milk-and-cream/, { products: [{ id: 7, title: 'Beatrice Skim Milk 0% M.F. - 4L', handle: 'h', vendor: 'Beatrice', tags: ['in_store_only:true'], variants: [{ price: '5.94', available: true }] }] }], [/gianttiger\.com/, { products: [], resources: { results: { products: [] } } }]];

function ctx() {
  const store = memoryStore(); const cache = memoryCache();
  const fetch = fakeFetch([...flippRoutes(), ...gtRoutes, [/nominatim/, { address: { postcode: 'E1C 1E8', city: 'Moncton', state: 'New Brunswick', country_code: 'ca' } }]]);
  return { store, cache, fetch };
}
const post = (path, body) => new Request('http://x' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('GET /api/health lists the enabled feeders', async () => {
  const res = await handleRequest(new Request('http://x/api/health'), env, {}, ctx());
  const d = await res.json();
  assert.equal(res.status, 200); assert.deepEqual(d.sources, ['flipp', 'gianttiger', 'community']);
});

test('GET /api/stores needs a postal code and lists the grocers with a flyer', async () => {
  const c = ctx();
  assert.equal((await handleRequest(new Request('http://x/api/stores?postal=nope'), env, {}, c)).status, 400);
  const d = await (await handleRequest(new Request('http://x/api/stores?postal=e1c%201e8'), env, {}, c)).json();
  assert.equal(d.fsa, 'E1C'); assert.ok(d.stores.some(s => s.name === 'Sobeys' && s.kind === 'grocery'));
});

test('POST /api/plan returns a trimmed plan and records history', async () => {
  const c = ctx();
  const res = await handleRequest(post('/api/plan', { postal: 'E1C 1E8', items: ['apples', 'milk', 'cookies'], tripCost: 4, maxStores: 2 }), env, {}, c);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.fsa, 'E1C'); assert.equal(d.items.length, 3); assert.ok(d.plans.length >= 1); assert.equal(typeof d.recommended, 'number');
  assert.ok(d.items[1].byStore.some(s => s.merchant === 'Giant Tiger' && s.offer.kind === 'regular'));
  assert.ok(d.plans[0].assignments.every(a => a.offer && a.offer.priceText));
  assert.ok((await c.store.listHistory({ fsa: 'E1C', itemKey: 'apples' })).length > 0);
  assert.equal((await c.store.listRegions()).length, 1);
  assert.equal((await handleRequest(post('/api/plan', { postal: 'E1C1E8', items: [] }), env, {}, c)).status, 400);
  assert.equal((await handleRequest(new Request('http://x/api/plan', { method: 'POST', body: '{' }), env, {}, c)).status, 400);
});

test('POST /api/observe stores a shopper price that the next plan uses', async () => {
  const c = ctx();
  const res = await handleRequest(post('/api/observe', { postal: 'E1C1E8', merchant: 'Sobeys', item: '2% milk', price: 5.49, quantity: 4, unit: 'l', storeLabel: 'Vaughan Harvey' }), env, {}, c);
  assert.equal(res.status, 201); const d = await res.json(); assert.equal(d.recognisedAs, 'milk');
  const list = await (await handleRequest(new Request('http://x/api/observations?postal=E1C1E8'), env, {}, c)).json();
  assert.equal(list.observations.length, 1);
  const planRes = await (await handleRequest(post('/api/plan', { postal: 'E1C1E8', items: ['milk'], maxStores: 1 }), env, {}, c)).json();
  const sobeys = planRes.items[0].byStore.find(s => s.merchant === 'Sobeys');
  assert.ok(sobeys && sobeys.offer.source === 'community' && sobeys.offer.kind === 'reported');
  assert.ok(Math.abs(sobeys.cost - 5.49 / 2) < 0.01, 'two litres of a four-litre jug');
  assert.equal((await handleRequest(post('/api/observe', { postal: 'E1C1E8', merchant: 'Sobeys', item: 'milk', price: -1 }), env, {}, c)).status, 400);
});

test('POST /api/locate uses Nominatim when enabled', async () => {
  const c = ctx();
  const d = await (await handleRequest(post('/api/locate', { lat: 46.09, lon: -64.78 }), env, {}, c)).json();
  assert.equal(d.postal, 'E1C1E8'); assert.equal(d.city, 'Moncton');
  assert.match(c.fetch.calls.find(x => /nominatim/.test(x.url)).opts.headers['User-Agent'], /test/);
  assert.equal((await handleRequest(post('/api/locate', { lat: 1, lon: 2 }), { ...env, NOMINATIM_ENABLED: 'false' }, {}, c)).status, 503);
});

test('unknown API routes 404; non-API paths go to assets', async () => {
  assert.equal((await handleRequest(new Request('http://x/api/nope'), env, {}, ctx())).status, 404);
  const assets = { fetch: async () => new Response('page') };
  assert.equal(await (await handleRequest(new Request('http://x/'), { ...env, ASSETS: assets }, {}, ctx())).text(), 'page');
});

test('the weekly refresh records history for regions used recently', async () => {
  const c = ctx();
  await c.store.touchRegion('E1C', 'E1C1E8');
  const r = await runScheduled(env, c);
  assert.equal(r.regions, 1); assert.ok(r.rows > 0);
});
