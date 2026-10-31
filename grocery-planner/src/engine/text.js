// Text helpers shared by matching and parsing. Accent-insensitive, lower-case, word-based.

export function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Words of a string, accent-folded. Keeps digits and % so "2%" survives.
export function words(s) {
  return fold(s).split(/[^a-z0-9%]+/).filter(Boolean);
}

// Crude singular: cookies -> cookie, pommes -> pomme, oeufs -> oeuf. Good enough for whole-word matching.
export function singular(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('sses') || w.endsWith('xes')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function wordSet(s) {
  return new Set(words(s).map(singular));
}

// True when every word of `phrase` appears (singularised) in `text`, as whole words.
export function hasPhrase(text, phrase) {
  const t = fold(text);
  const p = fold(phrase);
  if (!p) return false;
  if (p.includes(' ')) return (' ' + t.replace(/[^a-z0-9%]+/g, ' ') + ' ').includes(' ' + p.replace(/[^a-z0-9%]+/g, ' ') + ' ')
    || (' ' + singularWords(t) + ' ').includes(' ' + singularWords(p) + ' ');
  const set = wordSet(text);
  return set.has(singular(p));
}

function singularWords(t) {
  return words(t).map(singular).join(' ');
}

// First three characters of a Canadian postal code, upper-case, or null.
export function fsaOf(postal) {
  const p = String(postal ?? '').toUpperCase().replace(/\s+/g, '');
  return /^[A-Z]\d[A-Z]/.test(p) ? p.slice(0, 3) : null;
}

export function cleanPostal(postal) {
  const p = String(postal ?? '').toUpperCase().replace(/\s+/g, '');
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(p) ? p : null;
}
