import { memoryStore, memoryCache } from './memory.js';
import { d1Store, kvCache } from './d1.js';

// One process-wide fallback so `wrangler dev` without bindings keeps state between requests.
const fallback = { store: null, cache: null };

export function createStore(env) {
  if (env?.DB) return d1Store(env.DB);
  return (fallback.store ||= memoryStore());
}

export function createCache(env) {
  if (env?.CACHE) return kvCache(env.CACHE);
  return (fallback.cache ||= memoryCache());
}
