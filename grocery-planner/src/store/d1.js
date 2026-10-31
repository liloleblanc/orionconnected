// Cloudflare D1 store and KV cache, same interface as memory.js.

export function d1Store(db) {
  return {
    kind: 'd1',
    async addObservation(o) {
      const r = await db.prepare(`INSERT INTO observations (created_at, fsa, merchant, store_label, item_text, item_key, barcode, price, quantity, unit, flags, reporter, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(o.created_at, o.fsa, o.merchant, o.store_label ?? null, o.item_text, o.item_key ?? null, o.barcode ?? null, o.price, o.quantity ?? null, o.unit ?? null, o.flags ?? null, o.reporter ?? null, o.source ?? 'community').first();
      return { id: r?.id, ...o };
    },
    async listObservations({ fsa, sinceDays = 14 } = {}) {
      const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
      const q = fsa
        ? db.prepare('SELECT * FROM observations WHERE fsa = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 500').bind(fsa, since)
        : db.prepare('SELECT * FROM observations WHERE created_at >= ? ORDER BY created_at DESC LIMIT 500').bind(since);
      return (await q.all()).results || [];
    },
    async recordHistory(rows) {
      if (!rows.length) return 0;
      const stmt = db.prepare(`INSERT INTO offer_history (fetched_at, fsa, item_key, source, merchant, name, price, base_price, base_unit, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      await db.batch(rows.map(r => stmt.bind(r.fetched_at, r.fsa, r.item_key, r.source, r.merchant, r.name, r.price ?? null, r.base_price ?? null, r.base_unit ?? null, r.valid_from ?? null, r.valid_to ?? null)));
      return rows.length;
    },
    async listHistory({ fsa, itemKey, weeks = 12 } = {}) {
      const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
      return (await db.prepare('SELECT * FROM offer_history WHERE fsa = ? AND item_key = ? AND fetched_at >= ? ORDER BY fetched_at DESC LIMIT 1000').bind(fsa, itemKey, since).all()).results || [];
    },
    async touchRegion(fsa, postal) {
      await db.prepare('INSERT INTO regions (fsa, postal, last_used) VALUES (?, ?, ?) ON CONFLICT(fsa) DO UPDATE SET postal = excluded.postal, last_used = excluded.last_used').bind(fsa, postal, new Date().toISOString()).run();
    },
    async listRegions({ days = 14 } = {}) {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      return (await db.prepare('SELECT * FROM regions WHERE last_used >= ?').bind(since).all()).results || [];
    },
  };
}

export function kvCache(kv) {
  return {
    async get(key) { return kv.get(key, { type: 'json' }); },
    async put(key, value, ttlSeconds) { await kv.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: Math.max(60, ttlSeconds) } : undefined); },
  };
}
