'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EVERY PASSENGER WORD, ALL NINE BOARD LANGUAGES — ENFORCED.
//
// en fr es de it pt ja zh ar. Anything a passenger can read on the gate,
// departures, arrivals, baggage, the weather and heritage cards, ads,
// loaders, empty and error panels, the phone layout and the Studio player
// ships in all nine, from one store: fids-current/js/board-strings.js.
//
// This has failed before, every time silently: a table declared a key twice
// and nine French city names were overwritten by English; a weather card kept
// stale languages; and in one week the same "expected | prévu" was written
// into markup twice, in English plus whichever language the airport defaults
// to second. Nothing mechanical stood in the way. This does.
//
// The checks are in tests/i18n/checks.js (B1–B14, C1, P1, P2, L1). Gaps that
// existed when it landed are listed in tests/i18n/debt.json, which can only
// shrink. How to add a word: docs/BOARD-LANGUAGES.md.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const checks = require('./i18n/checks');
const ledger = require('./i18n/ledger');
const policy = require('./i18n/policy');

const ROOT = path.resolve(__dirname, '..');
let RESULT = null;
const result = () => (RESULT = RESULT || checks.run());

function describe(list) {
  return list.slice(0, 40).map((f) => `  ${f.check} ${f.file}:${f.line}${f.fn ? ' ' + f.fn + '()' : ''}  ${f.msg}`).join('\n')
    + (list.length > 40 ? `\n  … and ${list.length - 40} more` : '');
}

test('the guard reads every passenger file without losing its place', () => {
  // fail closed: a file the tokenizer cannot follow throws here, by name
  const r = result();
  assert.ok(r.tables.LS && r.tables._GATE_LBL && r.tables.STR, 'the store and the legacy tables are found');
});

for (const check of [...ledger.NEVER_LEDGERED]) {
  test(`${check}: passes outright (never ledgered)`, () => {
    const bad = result().findings.filter((f) => f.check === check);
    assert.equal(bad.length, 0, `\n${describe(bad)}\n`);
  });
}

test('no NEW passenger-language gap: every finding is already in the debt ledger', () => {
  const entries = ledger.load();
  const { fresh, over } = ledger.compare(result().findings.filter((f) => !ledger.NEVER_LEDGERED.has(f.check)), entries, checks.id);
  const lines = fresh.concat(...over.map((o) => o.found.slice(o.entry.count)));
  assert.equal(lines.length, 0,
    `\nNew passenger text outside the nine-language store. Fix it — do not ledger it:\n${describe(lines)}\n\n`
    + 'Add the words to BOARD_STR in fids-current/js/board-strings.js with all nine languages\n'
    + '(reuse the wording a screen already shows), render them with bs()/bsPair(), and see\n'
    + 'docs/BOARD-LANGUAGES.md. Exceptions are for operator-only text, brands, units, codes,\n'
    + 'data and debug output only, each with a reason (tests/i18n/policy.js).\n');
});

test('the ledger claims no debt that is already fixed', () => {
  const entries = ledger.load();
  const { stale } = ledger.compare(result().findings.filter((f) => !ledger.NEVER_LEDGERED.has(f.check)), entries, checks.id);
  assert.equal(stale.length, 0,
    `\nFixed (well done) — now lower the count or delete the entry: node tests/i18n/ledger.js --prune\n`
    + stale.slice(0, 40).map((s) => `  ${s.entry.id}  (ledger ${s.entry.count}, found ${s.found})`).join('\n') + '\n');
});

test('the ledger only shrinks against main', (t) => {
  let base = null;
  try {
    base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) { /* no origin/main here */ }
  if (!base) {
    if (process.env.CI) assert.fail('no origin/main to compare the ledger with — checks.yml must fetch with fetch-depth: 0');
    t.skip('no origin/main in this checkout; the comparison runs in CI');
    return;
  }
  const show = (file) => {
    try { return execFileSync('git', ['show', `${base}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); }
    catch (e) { return null; }
  };
  const before = show('tests/i18n/debt.json');
  if (before == null) { t.skip('main has no ledger yet: this change introduces it'); return; }
  const was = new Map(JSON.parse(before).map((e) => [e.id, e.count]));
  const grew = ledger.load().filter((e) => !was.has(e.id) || e.count > was.get(e.id));
  assert.equal(grew.length, 0, '\nThe debt ledger may only shrink. New or larger entries:\n'
    + grew.map((e) => `  ${e.id} (${was.has(e.id) ? was.get(e.id) + ' → ' : 'new, '}${e.count})`).join('\n') + '\n');
  // nor may a passenger file be reclassified, or a frozen table grow
  const policyBefore = show('tests/i18n/policy.js');
  if (policyBefore) {
    const listOf = (src, name) => {
      const at = src.indexOf('const ' + name + ' = [');
      return at < 0 ? [] : (src.slice(at, src.indexOf('];', at)).match(/'([^']+)'/g) || []).map((q) => q.slice(1, -1));
    };
    for (const name of ['PASSENGER_SCRIPTS', 'PASSENGER_STYLES', 'PASSENGER_PAGES']) {
      const gone = listOf(policyBefore, name).filter((f) => !policy[name].includes(f) && fs.existsSync(path.join(ROOT, f)));
      assert.deepEqual(gone, [], `${name} lost files that still exist — a passenger file cannot be reclassified to escape the guard`);
    }
  }
  const frozenBefore = show('tests/i18n/legacy-keys.json');
  if (frozenBefore) {
    const prev = JSON.parse(frozenBefore), now = JSON.parse(fs.readFileSync(ledger.FROZEN, 'utf8'));
    // a table leaves the freeze only when the policy says it grows (the ad copy)
    const growable = new Set(policy.LEGACY_STORES.filter((t) => t.growable).map((t) => t.name));
    for (const name of Object.keys(prev)) {
      if (!now[name] && !growable.has(name) && policy.LEGACY_STORES.some((t) => t.name === name)) assert.fail(`${name} was taken off the freeze list; its new keys go in BOARD_STR`);
    }
    for (const [name, keys] of Object.entries(now)) {
      const had = new Set(prev[name] || []);
      const added = keys.filter((k) => !had.has(k));
      assert.deepEqual(added, [], `${name} is frozen; new keys go in BOARD_STR (board-strings.js)`);
    }
  }
});

test('summary', () => {
  const entries = ledger.load();
  const occurrences = entries.reduce((n, e) => n + e.count, 0);
  const counts = result().pragmaCounts;
  const line = `Board languages: ${entries.length} open items, ${occurrences} occurrences (tests/i18n/debt.json); `
    + `i18n-ok pragmas: ${Object.keys(counts).length ? Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ') : 'none'}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${line}\n\n${ledger.markdown(entries)}\n`); } catch (e) {}
  }
});
