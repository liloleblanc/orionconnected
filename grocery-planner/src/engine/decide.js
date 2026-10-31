// From matched offers to a shopping plan.
//
// plan({ lines, offersByLine, tripCost, maxStores }) ->
// {
//   items: [{ line, best, byStore: [{ merchant, offer, cost }], notFound }],
//   plans: [{ stores, total, tripCost, score, assignments: [{ line, merchant, offer, cost }], missing: [...] }],
//   recommended: plans[0], singleStore: best one-store plan,
// }
//
// Scoring: cost of covered items + tripCost for each store beyond the first + a stand-in price
// for each item the plan's stores do not carry (the dearest best-per-store price seen for it,
// since the shopper still has to buy it somewhere at an unknown regular price).

import { costFor } from './price.js';

export function plan({ lines, offersByLine, tripCost = 4, maxStores = 2, includeOnline = false }) {
  const items = lines.map((line, i) => {
    const offers = (offersByLine[i] || []).filter(o => includeOnline || !o.parsed.flags.includes('online')).map(o => ({ offer: o, ...costFor(o.parsed, line.typical) }))
      .filter(x => x.cost != null)
      .map(x => ({ ...x, cost: x.cost * line.qty }));
    // best per store: a comparable offer always beats one whose size or unit is unknown, because
    // an unknown size is usually a small or odd item, not a bargain
    const byStore = new Map();
    for (const x of offers) {
      const k = x.offer.merchant;
      const cur = byStore.get(k);
      if (!cur) { byStore.set(k, x); continue; }
      if (x.comparable && !cur.comparable) { byStore.set(k, x); continue; }
      if (!x.comparable && cur.comparable) continue;
      if (x.cost < cur.cost - 1e-9) byStore.set(k, x);
    }
    const stores = [...byStore.entries()].map(([merchant, x]) => ({ merchant, ...x })).sort((a, b) => a.cost - b.cost);
    return { line, offers: offers.sort((a, b) => a.cost - b.cost), byStore: stores, best: stores[0] || null, notFound: stores.length === 0 };
  });

  const found = items.filter(it => !it.notFound);
  const merchants = [...new Set(found.flatMap(it => it.byStore.map(s => s.merchant)))];
  const standIn = new Map(found.map(it => [it, Math.max(...it.byStore.map(s => s.cost))]));

  const plans = [];
  const combos = [];
  for (const m of merchants) combos.push([m]);
  if (maxStores >= 2) for (let i = 0; i < merchants.length; i++) for (let j = i + 1; j < merchants.length; j++) combos.push([merchants[i], merchants[j]]);
  if (maxStores >= 3) for (let i = 0; i < merchants.length; i++) for (let j = i + 1; j < merchants.length; j++) for (let k = j + 1; k < merchants.length; k++) combos.push([merchants[i], merchants[j], merchants[k]]);

  for (const stores of combos) {
    const assignments = [];
    const missing = [];
    let total = 0, penalty = 0;
    for (const it of found) {
      const choice = it.byStore.filter(s => stores.includes(s.merchant)).sort((a, b) => a.cost - b.cost)[0];
      if (choice) { assignments.push({ line: it.line, merchant: choice.merchant, offer: choice.offer, cost: choice.cost, comparable: choice.comparable, note: choice.note }); total += choice.cost; }
      else { missing.push(it.line); penalty += standIn.get(it); }
    }
    const trips = tripCost * (stores.length - 1);
    // a plan that uses a store for nothing is not a plan
    if (stores.some(s => !assignments.some(a => a.merchant === s))) continue;
    plans.push({ stores, total: round(total), tripCost: round(trips), standIn: round(penalty), score: round(total + trips + penalty), assignments, missing });
  }
  plans.sort((a, b) => a.score - b.score || a.stores.length - b.stores.length);
  const singleStore = plans.find(p => p.stores.length === 1) || null;
  const recommended = plans[0] || null;
  const worstSingle = plans.filter(p => p.stores.length === 1).sort((a, b) => b.score - a.score)[0] || null;
  return {
    items,
    plans: plans.slice(0, 6),
    recommended,
    singleStore,
    savingsVsWorstStore: recommended && worstSingle ? round(worstSingle.score - recommended.score) : 0,
    notFound: items.filter(it => it.notFound).map(it => it.line),
  };
}

function round(n) { return Math.round(n * 100) / 100; }
