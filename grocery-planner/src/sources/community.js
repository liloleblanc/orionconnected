// Prices reported by the app's own users. Durable, permission-free, grows with use.

import { parsePrice } from '../engine/price.js';
import { fold } from '../engine/text.js';

export function createCommunity({ store, ttlDays = 14, now = () => new Date() }) {
  async function searchOffers(postal, _term, _lang, { fsa } = {}) {
    const rows = await store.listObservations({ fsa, sinceDays: ttlDays });
    return rows.map(r => observationToOffer(r, ttlDays));
  }
  async function addObservation(o) {
    return store.addObservation({ ...o, created_at: now().toISOString(), source: 'community' });
  }
  return { id: 'community', kind: 'reported', langs: ['en'], usesTerm: false, searchOffers, addObservation };
}

export function observationToOffer(r, ttlDays = 14) {
  const sizeName = r.quantity && r.unit ? `${r.item_text}, ${r.quantity} ${r.unit}` : r.item_text;
  const parsed = parsePrice({ price: r.price, name: sizeName, postText: r.unit === 'lb' && !r.quantity ? '/lb' : null, saleStory: r.flags });
  const created = new Date(r.created_at);
  const validTo = new Date(created.getTime() + ttlDays * 86400000);
  return {
    id: 'community:' + r.id,
    source: 'community',
    merchant: r.merchant,
    merchantKey: fold(r.merchant),
    name: r.item_text + (r.store_label ? ` (${r.store_label})` : ''),
    brand: null,
    category: null,
    validFrom: r.created_at,
    validTo: validTo.toISOString(),
    fetchedAt: r.created_at,
    saleStory: null,
    itemKey: r.item_key || null,
    parsed,
  };
}
