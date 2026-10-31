// Gather offers for a list from every enabled feeder, match them to the lines, and plan.
//
// A feeder is { id, kind: 'sale' | 'regular' | 'reported', langs, usesTerm, searchOffers(postal, term, lang, ctx) }.
// Flipp additionally has groceryMerchants(postal, lang), which decides which flyer merchants count.

import { interpretLine, offerMatches, merchantAllowed } from '../engine/match.js';
import { plan } from '../engine/decide.js';
import { fsaOf } from '../engine/text.js';

export async function buildPlan({ sources, postal, lines, lang = 'en', tripCost = 4, maxStores = 2, includePharmacies = true, city = null, log = () => {} }) {
  const fsa = fsaOf(postal);
  const parsedLines = lines.map(interpretLine).filter(Boolean);
  const notes = [];
  const sourceStatus = {};

  // Which flyer merchants around here sell groceries?
  let allowed = null;
  const flipp = sources.find(s => s.id === 'flipp');
  if (flipp) {
    try { allowed = (await flipp.groceryMerchants(postal, lang)).merchants; }
    catch (e) { notes.push('flyer_list_unavailable'); log('flipp merchants failed: ' + e.message); }
  }

  const offersByLine = [];
  for (const line of parsedLines) {
    const seen = new Map();
    for (const src of sources) {
      const langs = src.langs || [lang];
      const terms = src.usesTerm === false ? [null] : termsFor(line, langs);
      for (const term of terms) {
        for (const l of langs) {
          if (term != null && term.lang && term.lang !== l) continue;
          try {
            const offers = await src.searchOffers(postal, term?.text ?? null, l, { fsa, city, line });
            sourceStatus[src.id] = sourceStatus[src.id] === 'error' ? 'error' : 'ok';
            for (const o of offers) {
              if (seen.has(o.id)) continue;
              if (o.source === 'flipp' && !merchantAllowed(o.merchant, allowed, { includePharmacies })) continue;
              const score = o.itemKey && !line.generic ? (o.itemKey === line.key ? 1 : 0) : offerMatches(line, o.name);
              if (!score) continue;
              seen.set(o.id, { kind: src.kind || 'sale', ...o, matchScore: score });
            }
          } catch (e) {
            sourceStatus[src.id] = 'error';
            log(`${src.id} search failed for "${term?.text}": ${e.message}`);
          }
        }
      }
    }
    // "2% milk": when some offers carry the qualifiers, only those count; otherwise any milk does
    const all = [...seen.values()];
    const qualified = all.filter(o => o.matchScore === 2);
    offersByLine.push((line.qualifiers || []).length && qualified.length ? qualified : all);
  }

  const result = plan({ lines: parsedLines, offersByLine, tripCost, maxStores });
  return { postal, fsa, lang, tripCost, maxStores, notes, sources: sourceStatus, asOf: new Date().toISOString(), ...result };
}

// Search words per language: the catalogue's first English and French synonyms, or the typed text.
function termsFor(line, langs) {
  if (line.generic) return [{ text: line.text, lang: null }];
  const out = [];
  if (langs.includes('en')) out.push({ text: line.queries[0], lang: 'en' });
  if (langs.includes('fr') && line.queries[1] && line.queries[1] !== line.queries[0]) out.push({ text: line.queries[1], lang: 'fr' });
  return out.length ? out : [{ text: line.text, lang: null }];
}
