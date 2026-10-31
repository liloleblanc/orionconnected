// Run the planner from the command line against the live feeders.
//   node scripts/demo.mjs E1C1E8 "apples, milk, cookies" [tripCost] [maxStores]
import { buildContext } from '../src/worker.js';
import { buildPlan } from '../src/sources/index.js';
import { fmtMoney } from '../src/engine/price.js';

const postal = (process.argv[2] || 'E1C1E8').toUpperCase().replace(/\s/g, '');
const items = (process.argv[3] || 'apples, milk, cookies').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
const tripCost = parseFloat(process.argv[4] || '4');
const maxStores = parseInt(process.argv[5] || '2', 10);
const env = { FLIPP_ENABLED: process.env.FLIPP_ENABLED ?? 'true', GIANTTIGER_ENABLED: process.env.GIANTTIGER_ENABLED ?? 'true', WALMART_ENABLED: process.env.WALMART_ENABLED ?? 'false', COMMUNITY_ENABLED: 'true', OPENPRICES_ENABLED: process.env.OPENPRICES_ENABLED ?? 'false', APP_USER_AGENT: 'grocery-planner/0.1 (demo)' };
const c = buildContext(env);
const t0 = Date.now();
const r = await buildPlan({ sources: c.sources, postal, lines: items, tripCost, maxStores, log: m => console.error('  ! ' + m) });
console.log(`\n${postal} (${r.fsa}) — ${items.join(', ')} — trip cost ${fmtMoney(tripCost)}, up to ${maxStores} store(s) — ${Date.now() - t0} ms`);
console.log('sources:', JSON.stringify(r.sources), r.notes.length ? 'notes: ' + r.notes.join(', ') : '');
for (const it of r.items) {
  console.log(`\n${it.line.label}  (as ${it.line.qty} × ${it.line.typical.qty} ${it.line.typical.unit}${it.line.generic ? ', not in catalogue' : ''})`);
  if (it.notFound) { console.log('   no price found this week'); continue; }
  for (const s of it.byStore.slice(0, 6)) {
    const o = s.offer;
    const base = o.parsed.basePrice != null ? ` = ${fmtMoney(o.parsed.basePrice)}/${o.parsed.baseUnit}` : '';
    console.log(`   ${fmtMoney(s.cost).padStart(7)}  ${s.merchant.padEnd(24)} ${o.name.slice(0, 48).padEnd(48)} ${o.parsed.priceText}${base}  [${o.kind}/${o.source}${s.comparable ? '' : ', ' + s.note}${o.parsed.flags.length ? ', ' + o.parsed.flags.join(' ') : ''}]`);
  }
}
console.log('\nPlans:');
for (const p of r.plans.slice(0, 4)) {
  const tag = p === r.recommended ? '  <- recommended' : p === r.singleStore ? '  (best single store)' : '';
  console.log(`  ${fmtMoney(p.score).padStart(7)}  ${p.stores.join(' + ').padEnd(40)} items ${fmtMoney(p.total)}${p.tripCost ? ' + trips ' + fmtMoney(p.tripCost) : ''}${p.standIn ? ' + not carried ' + fmtMoney(p.standIn) : ''}${p.missing.length ? '  missing: ' + p.missing.map(l => l.label).join(', ') : ''}${tag}`);
  for (const a of p.assignments) console.log(`             ${a.line.label.padEnd(12)} -> ${a.merchant}: ${a.offer.name.slice(0, 50)} ${fmtMoney(a.cost)}`);
}
if (r.notFound.length) console.log('\nNot found this week:', r.notFound.map(l => l.label).join(', '));
console.log(`\nSavings versus the dearest single store: ${fmtMoney(r.savingsVsWorstStore)}`);
