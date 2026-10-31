// In-memory store and cache: used by tests and by `wrangler dev` before D1/KV exist.

export function memoryStore() {
  const observations = [];
  const history = [];
  const regions = new Map();
  let nextId = 1;
  return {
    kind: 'memory',
    async addObservation(o) { const row = { id: nextId++, ...o }; observations.push(row); return row; },
    async listObservations({ fsa, sinceDays = 14 } = {}) {
      const since = Date.now() - sinceDays * 86400000;
      return observations.filter(o => (!fsa || o.fsa === fsa) && new Date(o.created_at).getTime() >= since);
    },
    async recordHistory(rows) { for (const r of rows) history.push({ id: nextId++, ...r }); return rows.length; },
    async listHistory({ fsa, itemKey, weeks = 12 } = {}) {
      const since = Date.now() - weeks * 7 * 86400000;
      return history.filter(h => (!fsa || h.fsa === fsa) && (!itemKey || h.item_key === itemKey) && new Date(h.fetched_at).getTime() >= since);
    },
    async touchRegion(fsa, postal) { regions.set(fsa, { fsa, postal, last_used: new Date().toISOString() }); },
    async listRegions({ days = 14 } = {}) {
      const since = Date.now() - days * 86400000;
      return [...regions.values()].filter(r => new Date(r.last_used).getTime() >= since);
    },
  };
}

export function memoryCache() {
  const m = new Map();
  return {
    async get(key) { const e = m.get(key); if (!e) return null; if (e.exp && e.exp < Date.now()) { m.delete(key); return null; } return e.value; },
    async put(key, value, ttlSeconds) { m.set(key, { value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 }); },
  };
}
