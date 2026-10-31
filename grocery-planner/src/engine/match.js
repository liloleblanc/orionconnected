// Decide which offers answer which list line.

import { CATALOG } from './catalog.js';
import { fold, hasPhrase, words, singular } from './text.js';

// Interpret a typed list line: "2 x milk", "apples", "oat milk", "milk 4L".
// Returns { label, qty, key, synonyms, exclude, typical, generic }.
export function interpretLine(line) {
  const raw = String(line ?? '').trim();
  if (!raw) return null;
  let qty = 1;
  let text = raw;
  let m = text.match(/^(\d+)\s*(?:x|×)\s*(.+)$/i) || text.match(/^(.+?)\s*(?:x|×)\s*(\d+)$/i);
  if (m) {
    const n = parseInt(m[1], 10) || parseInt(m[2], 10);
    if (Number.isFinite(n) && n > 0 && n < 100) { qty = n; text = (isNaN(parseInt(m[1], 10)) ? m[1] : m[2]).trim(); }
  }
  const exact = findCatalog(text);
  const within = exact ? null : findCatalogWithin(text);
  const entry = exact || within?.entry;
  if (entry) {
    // "2% milk", "large eggs", "white bread": the catalogue item plus qualifier words the offer should carry
    const qualifiers = within ? within.qualifiers : [];
    return { label: raw, text, qty, key: entry.key, synonyms: [...entry.en, ...entry.fr], exclude: entry.exclude, typical: entry.typical, generic: false, qualifiers, queries: [entry.en[0], entry.fr[0]] };
  }
  return { label: raw, text, qty, key: fold(text), synonyms: [text], exclude: [], typical: { qty: 1, unit: 'ea' }, generic: true, qualifiers: [], queries: [text] };
}

// The longest catalogue synonym that appears inside the typed text, with the other words as qualifiers.
export function findCatalogWithin(text) {
  let best = null;
  for (const c of CATALOG) {
    for (const s of [...c.en, ...c.fr]) {
      if (!hasPhrase(text, s)) continue;
      const len = words(s).length;
      if (!best || len > best.len) best = { entry: c, synonym: s, len };
    }
  }
  if (!best) return null;
  const synWords = new Set(words(best.synonym).map(singular));
  const qualifiers = words(text).map(singular).filter(w => !synWords.has(w));
  return { entry: best.entry, qualifiers };
}

// The catalogue entry whose synonym equals the typed text (singular, accent-folded). Longest match wins
// so "ground beef" beats nothing and "orange juice" beats "juice" and "oranges".
export function findCatalog(text) {
  const t = words(text).map(singular).join(' ');
  if (!t) return null;
  let best = null;
  for (const c of CATALOG) {
    for (const s of [...c.en, ...c.fr]) {
      const ss = words(s).map(singular).join(' ');
      if (ss === t && (!best || ss.length > best.len)) best = { c, len: ss.length };
    }
  }
  return best ? best.c : null;
}

// Does this offer name answer the list line? 0 = no, 1 = yes, 2 = yes and it carries every qualifier.
export function offerMatches(line, name) {
  const n = fold(name);
  if (!n) return 0;
  for (const ex of line.exclude) if (hasPhrase(n, ex)) return 0;
  if (line.generic) {
    // every typed word must be present
    return words(line.text).map(singular).every(w => hasPhrase(n, w)) ? 2 : 0;
  }
  if (!line.synonyms.some(s => hasPhrase(n, s))) return 0;
  const q = line.qualifiers || [];
  return q.length && q.every(w => hasPhrase(n, w)) ? 2 : 1;
}

// Keep grocers and (optionally) pharmacies; drop hardware, pet, electronics and the like.
export function merchantAllowed(merchant, allowed, { includePharmacies = true } = {}) {
  if (!allowed) return true;
  const k = fold(merchant);
  const kind = allowed.get(k);
  if (!kind) return false;
  if (kind === 'pharmacy') return includePharmacies;
  return true;
}
