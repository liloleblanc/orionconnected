'use strict';
// ━━ THE BOARD-LANGUAGES DEBT LEDGER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// tests/i18n/debt.json lists every passenger-language gap that existed when
// the guard landed and is not fixed yet. It can only shrink:
//   - a finding that is not in it fails the test (new debt is never added);
//   - an entry that no longer matches, or matches fewer times than its
//     count, fails too ("fixed: lower the count or delete the entry");
//   - against main, no id may appear and no count may rise.
// Entries are matched on check, file, function and normalised text, never
// on line numbers, so edits nearby do not churn it.
//
//   node tests/i18n/ledger.js --md      the open items, by surface, for a PR body
//   node tests/i18n/ledger.js --prune   delete fixed entries, lower counts,
//                                       drop frozen keys that no longer exist
// There is deliberately no option that ADDS an entry.

const fs = require('node:fs');
const path = require('node:path');

const DEBT = path.join(__dirname, 'debt.json');
const FROZEN = path.join(__dirname, 'legacy-keys.json');

// Checks that are never ledgered: they must simply pass.
const NEVER_LEDGERED = new Set(['B4', 'B12', 'B14', 'B16', 'B17', 'C1', 'C2', 'C3', 'P1', 'P2', 'L1', 'W1']);

function load(file) {
  const f = file || DEBT;
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function group(findings, idOf) {
  const m = new Map();
  for (const f of findings) {
    const k = idOf(f);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return m;
}

// { fresh: [finding…], over: [{entry, found}], stale: [{entry, found}] }
function compare(findings, entries, idOf) {
  const byId = group(findings, idOf);
  const led = new Map(entries.map((e) => [e.id, e]));
  const fresh = [], over = [], stale = [];
  for (const [k, list] of byId) {
    const e = led.get(k);
    if (!e || NEVER_LEDGERED.has(list[0].check)) { fresh.push(...list); continue; }
    if (list.length > e.count) over.push({ entry: e, found: list });
  }
  for (const e of entries) {
    const n = (byId.get(e.id) || []).length;
    if (n < e.count) stale.push({ entry: e, found: n });
  }
  return { fresh, over, stale };
}

// Where a passenger sees it, so the open items read by screen.
function surfaceOf(e) {
  const f = e.file, fn = e.fn || '';
  if (/studio|template-renderer/.test(f)) return 'Studio player';
  if (/app\.html/.test(f)) return 'Companion app';
  if (/heritage-board|heritage-index|heritage\.html/.test(f)) return 'Archive pages';
  if (/index\.html/.test(f)) return 'Opening page';
  if (/tour\.html|rotate\.html/.test(f)) return 'Stream';
  if (/\.css$/.test(f)) return 'Stylesheets';
  if (/gids-mobile-nav|mobile/i.test(f + fn) || /^(renderMobile|renderHero|toggleCardExpand|flightCards|_mobileNav|renderFromCache|initHeroMap|toggleHeroSection|_acR3|locDisplay|twx)/.test(fn)) return 'Phone layout';
  if (/_renderWxCard|_wx|_sideL|_mlbl|_fc|_factsWhen|tioLabel|gateWeatherWidget|_destWx|TIO_LABEL/.test(fn + ' ' + e.text)) return 'Weather card and strips';
  if (/heritage|Heritage/.test(fn)) return 'Heritage card';
  if (/Accor|accor|_badge|_stars|buildGateAdHtml|_dineT|_isMidscale|_scanFor|AD_I18N|GATE_ADS/.test(fn + ' ' + e.text)) return 'Advertising';
  if (/fids\.html|gids\.html|bids\.html/.test(f)) return 'Page markup and loaders';
  if (/^(toLocale|DateTimeFormat|hour12)/.test(e.text) || /hour12|toLocale|DateTimeFormat/.test(e.text)) return 'Clocks and dates';
  return 'Boards and gate';
}

function markdown(entries) {
  const bySurface = new Map();
  for (const e of entries) {
    const s = e.surface || surfaceOf(e);
    if (!bySurface.has(s)) bySurface.set(s, []);
    bySurface.get(s).push(e);
  }
  const total = entries.reduce((n, e) => n + e.count, 0);
  const lines = [`**Board languages — ${entries.length} open items (${total} occurrences), tests/i18n/debt.json**`, ''];
  for (const [s, list] of [...bySurface].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`- [ ] **${s}** — ${list.length}`);
    for (const e of list.slice(0, 60)) {
      lines.push(`  - [ ] ${e.check} \`${e.file.replace('fids-current/', '')}\`${e.fn ? ' ' + e.fn + '()' : ''}: ${String(e.text).slice(0, 70)}${e.count > 1 ? ' ×' + e.count : ''}${e.decision ? ' — waits on ' + e.decision : ''}`);
    }
    if (list.length > 60) lines.push(`  - … ${list.length - 60} more`);
  }
  return lines.join('\n');
}

module.exports = { DEBT, FROZEN, NEVER_LEDGERED, load, compare, group, surfaceOf, markdown };

if (require.main === module) {
  const checks = require('./checks');
  const arg = process.argv[2];
  const entries = load();
  if (arg === '--md') {
    process.stdout.write(markdown(entries) + '\n');
  } else if (arg === '--prune') {
    const { findings, entries: tables } = checks.run();
    const byId = group(findings, checks.id);
    const kept = [];
    let removed = 0, lowered = 0;
    for (const e of entries) {
      const n = (byId.get(e.id) || []).length;
      if (n === 0) { removed++; continue; }
      if (n < e.count) { lowered++; kept.push(Object.assign({}, e, { count: n })); continue; }
      kept.push(e);
    }
    fs.writeFileSync(DEBT, JSON.stringify(kept, null, 1) + '\n');
    let dropped = 0;
    if (fs.existsSync(FROZEN)) {
      const frozen = JSON.parse(fs.readFileSync(FROZEN, 'utf8'));
      for (const name of Object.keys(frozen)) {
        if (!tables[name]) { delete frozen[name]; dropped++; continue; }
        const before = frozen[name].length;
        frozen[name] = frozen[name].filter((k) => tables[name].has(k));
        dropped += before - frozen[name].length;
      }
      fs.writeFileSync(FROZEN, JSON.stringify(frozen, null, 1) + '\n');
    }
    console.log(`debt.json: ${removed} fixed entries removed, ${lowered} counts lowered, ${kept.length} open; legacy-keys.json: ${dropped} gone keys dropped`);
  } else {
    console.log('usage: node tests/i18n/ledger.js --md | --prune');
    process.exitCode = 2;
  }
}
