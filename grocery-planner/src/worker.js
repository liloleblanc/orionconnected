// Cloudflare Worker: JSON API for the planner plus static assets for the web app.
//
//   GET  /api/health
//   GET  /api/stores?postal=E1C1E8            grocers with a flyer around this postal code
//   POST /api/plan   { postal, items[], tripCost?, maxStores?, includePharmacies?, lang? }
//   POST /api/observe { postal, merchant, item, price, quantity?, unit?, storeLabel?, barcode?, reporter? }
//   GET  /api/observations?postal=E1C1E8      recent prices reported by shoppers nearby
//   POST /api/locate { lat, lon }             postal code from a position (Nominatim, when enabled)
//
// Everything else is served from ./web by the assets binding.

import { buildPlan } from './sources/index.js';
import { createFlipp } from './sources/flipp.js';
import { createCommunity } from './sources/community.js';
import { createOpenPrices } from './sources/openprices.js';
import { createGiantTiger } from './sources/gianttiger.js';
import { createWalmart } from './sources/walmart.js';
import { createStore, createCache } from './store/index.js';
import { interpretLine } from './engine/match.js';
import { cleanPostal, fsaOf, reverseGeocode } from './geo.js';
import { CATALOG } from './engine/catalog.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function flag(env, name, dflt) {
  const v = env?.[name];
  if (v == null || v === '') return dflt;
  return String(v).toLowerCase() === 'true';
}

export function buildContext(env, overrides = {}) {
  const store = overrides.store || createStore(env);
  const cache = overrides.cache || createCache(env);
  const fetchFn = overrides.fetch || globalThis.fetch.bind(globalThis);
  const userAgent = env?.APP_USER_AGENT || 'grocery-planner/0.1';
  const ttlDays = parseFloat(env?.COMMUNITY_TTL_DAYS || '14') || 14;
  const sources = [];
  if (flag(env, 'FLIPP_ENABLED', true)) sources.push(createFlipp({ fetch: fetchFn, cache, userAgent }));
  if (flag(env, 'GIANTTIGER_ENABLED', true)) sources.push(createGiantTiger({ fetch: fetchFn, cache, userAgent }));
  if (flag(env, 'WALMART_ENABLED', false)) sources.push(createWalmart({ fetch: fetchFn, cache, userAgent }));
  if (flag(env, 'COMMUNITY_ENABLED', true)) sources.push(createCommunity({ store, ttlDays }));
  if (flag(env, 'OPENPRICES_ENABLED', false)) sources.push(createOpenPrices({ fetch: fetchFn, cache, userAgent, token: env?.OPENPRICES_TOKEN || null }));
  return { store, cache, fetch: fetchFn, userAgent, sources, env };
}

export async function handleRequest(request, env, ctx = {}, overrides = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) {
    if (env?.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
  const c = buildContext(env, overrides);
  try {
    if (url.pathname === '/api/health') return json({ ok: true, sources: c.sources.map(s => s.id), store: c.store.kind, catalog: CATALOG.length });
    if (url.pathname === '/api/stores' && request.method === 'GET') return await apiStores(url, c);
    if (url.pathname === '/api/plan' && request.method === 'POST') return await apiPlan(await readJson(request), c, ctx);
    if (url.pathname === '/api/observe' && request.method === 'POST') return await apiObserve(await readJson(request), c);
    if (url.pathname === '/api/observations' && request.method === 'GET') return await apiObservations(url, c);
    if (url.pathname === '/api/locate' && request.method === 'POST') return await apiLocate(await readJson(request), c);
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.code, message: e.message }, e.status);
    console.error(e);
    // the detail stays in the log; the client gets no error text or stack
    return json({ error: 'internal', message: 'Something went wrong on our side; try again in a moment' }, 500);
  }
}

class ApiError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }

async function readJson(request) {
  try { return await request.json(); } catch { throw new ApiError(400, 'bad_json', 'Body must be JSON'); }
}

function needPostal(p) {
  const postal = cleanPostal(p);
  if (!postal) throw new ApiError(400, 'bad_postal', 'A Canadian postal code is needed, like E1C 1E8');
  return postal;
}

async function apiStores(url, c) {
  const postal = needPostal(url.searchParams.get('postal'));
  const flipp = c.sources.find(s => s.id === 'flipp');
  if (!flipp) return json({ postal, stores: [], note: 'flyer feeder disabled' });
  const { flyers } = await flipp.groceryMerchants(postal, 'en');
  return json({ postal, fsa: fsaOf(postal), stores: flyers.map(f => ({ name: f.name, kind: f.kind, validFrom: f.validFrom, validTo: f.validTo })) });
}

async function apiPlan(body, c, ctx) {
  const postal = needPostal(body?.postal);
  const lines = Array.isArray(body?.items) ? body.items.map(s => String(s ?? '').trim()).filter(Boolean).slice(0, 40) : [];
  if (!lines.length) throw new ApiError(400, 'empty_list', 'Give at least one item');
  const tripCost = clampNum(body?.tripCost, 0, 100, parseFloat(c.env?.DEFAULT_TRIP_COST || '4') || 4);
  const maxStores = clampNum(body?.maxStores, 1, 3, 2);
  const includePharmacies = body?.includePharmacies !== false;
  const lang = body?.lang === 'fr' ? 'fr' : 'en';
  const result = await buildPlan({ sources: c.sources, postal, lines, lang, tripCost, maxStores, includePharmacies, city: body?.city || null, log: m => console.warn(m) });
  const fsa = fsaOf(postal);
  const after = (async () => {
    try {
      await c.store.touchRegion(fsa, postal);
      const rows = [];
      for (const it of result.items) for (const s of it.byStore) rows.push({ fetched_at: result.asOf, fsa, item_key: it.line.key, source: s.offer.source, merchant: s.merchant, name: s.offer.name, price: s.offer.parsed.price, base_price: s.offer.parsed.basePrice, base_unit: s.offer.parsed.baseUnit, valid_from: s.offer.validFrom, valid_to: s.offer.validTo });
      if (rows.length) await c.store.recordHistory(rows);
    } catch (e) { console.warn('history write failed: ' + e.message); }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(after); else await after;
  return json(trimPlan(result));
}

async function apiObserve(body, c) {
  const postal = needPostal(body?.postal);
  const merchant = String(body?.merchant ?? '').trim();
  const item = String(body?.item ?? '').trim();
  const price = parseFloat(body?.price);
  if (!merchant || !item) throw new ApiError(400, 'missing_fields', 'merchant and item are needed');
  if (!Number.isFinite(price) || price <= 0 || price > 10000) throw new ApiError(400, 'bad_price', 'price must be a positive number');
  const community = c.sources.find(s => s.id === 'community');
  if (!community) throw new ApiError(503, 'community_disabled', 'Price reports are switched off');
  const line = interpretLine(item);
  const unit = ['kg', 'g', 'lb', 'l', 'ml', 'ea'].includes(String(body?.unit || '').toLowerCase()) ? String(body.unit).toLowerCase() : null;
  const quantity = Number.isFinite(parseFloat(body?.quantity)) && parseFloat(body.quantity) > 0 ? parseFloat(body.quantity) : null;
  const row = await community.addObservation({
    fsa: fsaOf(postal), merchant: merchant.slice(0, 60), store_label: body?.storeLabel ? String(body.storeLabel).slice(0, 80) : null,
    item_text: item.slice(0, 120), item_key: line && !line.generic ? line.key : null, barcode: body?.barcode ? String(body.barcode).replace(/\D/g, '').slice(0, 14) || null : null,
    price, quantity, unit, flags: body?.onSale ? 'sale' : null, reporter: body?.reporter ? String(body.reporter).slice(0, 40) : null,
  });
  return json({ ok: true, id: row.id, recognisedAs: line && !line.generic ? line.key : null }, 201);
}

async function apiObservations(url, c) {
  const postal = needPostal(url.searchParams.get('postal'));
  const rows = await c.store.listObservations({ fsa: fsaOf(postal), sinceDays: parseFloat(c.env?.COMMUNITY_TTL_DAYS || '14') || 14 });
  return json({ fsa: fsaOf(postal), observations: rows.map(r => ({ id: r.id, at: r.created_at, merchant: r.merchant, store: r.store_label, item: r.item_text, price: r.price, quantity: r.quantity, unit: r.unit, flags: r.flags })) });
}

async function apiLocate(body, c) {
  const lat = parseFloat(body?.lat), lon = parseFloat(body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new ApiError(400, 'bad_position', 'lat and lon are needed');
  if (!flag(c.env, 'NOMINATIM_ENABLED', false)) throw new ApiError(503, 'locate_disabled', 'Location lookup is switched off; type a postal code');
  const ua = c.env?.CONTACT_EMAIL ? `${c.userAgent} (${c.env.CONTACT_EMAIL})` : c.userAgent;
  const r = await reverseGeocode({ lat, lon, fetch: c.fetch, userAgent: ua, cache: c.cache });
  if (!r.postal) throw new ApiError(404, 'no_postal', 'No postal code found for that position');
  return json(r);
}

// Weekly refresh: re-run the catalogue searches for regions used recently so the history table
// gets a row per store per week even when nobody asks, which "buy now or wait" needs.
export async function runScheduled(env, overrides = {}) {
  const c = buildContext(env, overrides);
  const regions = await c.store.listRegions({ days: 21 });
  let rows = 0;
  for (const r of regions) {
    const lines = CATALOG.map(e => e.en[0]);
    const result = await buildPlan({ sources: c.sources.filter(s => s.id !== 'community'), postal: r.postal, lines, lang: 'en', tripCost: 0, maxStores: 1, log: m => console.warn(m) });
    const out = [];
    for (const it of result.items) for (const s of it.byStore) out.push({ fetched_at: result.asOf, fsa: r.fsa, item_key: it.line.key, source: s.offer.source, merchant: s.merchant, name: s.offer.name, price: s.offer.parsed.price, base_price: s.offer.parsed.basePrice, base_unit: s.offer.parsed.baseUnit, valid_from: s.offer.validFrom, valid_to: s.offer.validTo });
    rows += await c.store.recordHistory(out);
  }
  return { regions: regions.length, rows };
}

// Keep the JSON the browser gets small: the engine's internal objects carry repeated offers.
function trimPlan(r) {
  const offer = o => o && ({ id: o.id, source: o.source, kind: o.kind, merchant: o.merchant, name: o.name, price: o.parsed.price, priceText: o.parsed.priceText, originalPrice: o.parsed.originalPrice, basePrice: o.parsed.basePrice, baseUnit: o.parsed.baseUnit, sizeText: o.parsed.sizeText, multiBuy: o.parsed.multiBuy, flags: o.parsed.flags, validTo: o.validTo, saleStory: o.saleStory, storeNote: o.storeNote || null, url: o.url || null });
  return {
    postal: r.postal, fsa: r.fsa, asOf: r.asOf, tripCost: r.tripCost, maxStores: r.maxStores, notes: r.notes, sources: r.sources,
    items: r.items.map(it => ({ line: { label: it.line.label, qty: it.line.qty, key: it.line.key, generic: it.line.generic, typical: it.line.typical }, notFound: it.notFound,
      best: it.best ? { merchant: it.best.merchant, cost: round(it.best.cost), comparable: it.best.comparable, note: it.best.note, offer: offer(it.best.offer) } : null,
      byStore: it.byStore.slice(0, 8).map(s => ({ merchant: s.merchant, cost: round(s.cost), comparable: s.comparable, note: s.note, offer: offer(s.offer) })),
      offers: it.offers.slice(0, 12).map(x => ({ cost: round(x.cost), comparable: x.comparable, note: x.note, offer: offer(x.offer) })) })),
    plans: r.plans.map(p => ({ stores: p.stores, total: p.total, tripCost: p.tripCost, standIn: p.standIn, score: p.score, missing: p.missing.map(l => l.label), assignments: p.assignments.map(a => ({ item: a.line.label, merchant: a.merchant, cost: round(a.cost), comparable: a.comparable, note: a.note, offer: offer(a.offer) })) })),
    recommended: r.recommended ? r.plans.indexOf(r.recommended) : null,
    singleStore: r.singleStore ? r.plans.indexOf(r.singleStore) : null,
    savingsVsWorstStore: r.savingsVsWorstStore,
    notFound: r.notFound.map(l => l.label),
  };
}

function round(n) { return n == null ? null : Math.round(n * 100) / 100; }
function clampNum(v, min, max, dflt) { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }); }

export default {
  fetch: (request, env, ctx) => handleRequest(request, env, ctx),
  scheduled: (_event, env, ctx) => ctx.waitUntil(runScheduled(env).then(r => console.log('weekly refresh', JSON.stringify(r)))),
};
