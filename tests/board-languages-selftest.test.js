'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE BOARD-LANGUAGES GUARD IS ITSELF TESTED.
//
// A guard that quietly stops seeing is worse than none: it reads as
// protection. tests/i18n/fixtures/ holds one seeded violation of every kind
// the guard exists to stop, and a clean twin. If a change to the scanner
// makes it blind to any of them, this fails.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');

const checks = require('./i18n/checks');
const ledger = require('./i18n/ledger');
const real = require('./i18n/policy');

const FX = 'tests/i18n/fixtures/';
const policy = Object.assign({}, real, {
  PASSENGER_PAGES: [FX + 'bad.html'],
  PASSENGER_SCRIPTS: [FX + 'store.js', FX + 'legacy.js', FX + 'clean.js'],
  PASSENGER_STYLES: [FX + 'bad.css'],
  NON_PASSENGER: {},
  STORE_FILE: FX + 'store.js',
  LEGACY_STORES: [{ file: FX + 'legacy.js', name: 'LS', helpers: ['TL'] }],
  KEY_HELPERS: { TL: ['LS', 'STR'], bs: ['STR'], bsPair: ['STR'] },
  NONTEXT_TABLES: [],
  BRAND_TERMS: {},
  SAME_AS_ENGLISH: { Gate: { langs: ['de', 'it'], why: 'fixture' } },
  OPERATOR_FUNCTIONS: {},
  TEXT_REWRITERS: {},
  LANG_STORAGE_FUNCTIONS: {}
});
const R = checks.run({ policy, frozen: { LS: ['dep', 'gate'] } });
const F = R.findings;
const has = (check, file, re) => F.some((f) => f.check === check && (f.file === FX + file || f.file === '*') && (!re || re.test(f.text) || re.test(f.msg)));

const SEEDED = [
  ['B1', 'store.js', /noArabic|Boarding pass/, 'a table missing ar'],
  ['B1', 'store.js', /pt_BR/, 'an unknown language code'],
  ['B1', 'store.js', /expression/, 'a value that is an expression'],
  ['B1', 'store.js', /empty/, 'an empty value'],
  ['B1', 'legacy.js', /Arriving/, 'an inline table missing six languages'],
  ['B2', 'legacy.js', /Arriving/, 'a table outside the store'],
  ['B2', 'bad.html', /EN, Now boarding/, 'a [language, text] greeting list'],
  ['B3', 'store.js', /Baggage hall fr/, 'a value left in English'],
  ['B3', 'store.js', /Exit zh/, 'zh with no Chinese characters'],
  ['B3', 'store.js', /Arrivals hall es/, 'French pasted into Spanish'],
  ['B4', 'legacy.js', /CITY\.YYT/, 'a double-quoted key declared twice (the YYT case)'],
  ['B5', 'legacy.js', /^Gate/, "'<b>Gate ' + n in markup"],
  ['B5', 'legacy.js', /^to$/, '${a} to ${b} in a markup template'],
  ['B5', 'legacy.js', /fallback after TL/, "TL('x') || 'Fallback'"],
  ['B5', 'legacy.js', /expected \| prévu/, 'a bilingual literal'],
  ['B5', 'legacy.js', /Please proceed/, 'an English sentence literal'],
  ['B5', 'legacy.js', /Loading flights/, 'a literal put into textContent'],
  ['B6', 'legacy.js', /greenKey/, 'a key that does not exist'],
  ['B7', 'store.js', /^departures$/, 'two translations of one phrase'],
  ['B8', 'legacy.js', /^Departures/, 'a known label written as a literal'],
  ['B9', 'bad.css', /Aircraft/, 'CSS content text'],
  ['B9', 'bad.html', /data-baremsg/, 'data-* text drawn by content: attr()'],
  ['B10', 'bad.html', /^LOADING$/, 'static page text'],
  ['B11', 'legacy.js', /=== 'fr' \?/, "lang === 'fr' ? 'Porte' : 'Gate'"],
  ['B11', 'legacy.js', /langs\.slice/, 'langs.slice(0, 2)'],
  ['B11', 'legacy.js', /toLocaleTimeString\('en-US'\)/, 'a literal locale'],
  ['B11', 'legacy.js', /hour12/, 'hour12 chosen in place'],
  ['B11', 'legacy.js', /\{fr,de,it\}/, 'a {fr:1, de:1, it:1} set'],
  ['B11', 'legacy.js', /language codes/, 'a private list of language codes'],
  ['B11', 'legacy.js', /_frF \?/, 'a French-first ternary choosing a word'],
  ['B11', 'legacy.js', /LS\.fr/, 'a language read straight out of a table'],
  ['B12', 'legacy.js', /Québec/, 'a second Québec list'],
  ['B13', 'legacy.js', /relabel/, 'a timer sweeping the page text'],
  ['B14', 'bad.html', /board-strings\.js\?v=100/, 'mismatched cache busters'],
  ['C1', 'bad.html', /unknown\.js/, 'an unclassified script on a passenger page'],
  ['L1', 'legacy.js', /LS\.added/, 'a new key in a frozen table'],
  ['P2', 'legacy.js', /i18n-ok|because/, 'a pragma without a valid reason']
];

for (const [check, file, re, what] of SEEDED) {
  test(`self-test: ${check} catches ${what}`, () => {
    assert.ok(has(check, file, re), `${check} did not report ${what} in ${file}\n`
      + F.filter((f) => f.check === check).map((f) => `  ${f.file}:${f.line} ${f.text}`).join('\n'));
  });
}

test('self-test: the clean twin passes every check', () => {
  const bad = F.filter((f) => f.file === FX + 'clean.js');
  assert.deepEqual(bad.map((f) => `${f.check} ${f.line} ${f.text}`), []);
});

test('self-test: operator markup and the data-i18n element are not reported', () => {
  assert.ok(!F.some((f) => f.check === 'B10' && /SAVE OVERRIDE/.test(f.text)), 'data-operator is honoured');
  assert.equal(F.filter((f) => f.check === 'B10' && /^LOADING$/.test(f.text)).length, 1, 'data-i18n is honoured');
});

test('self-test: a stale exception fails (an allowlist cannot rot into a blanket pass)', () => {
  const stale = Object.assign({}, policy, { BRAND_TERMS: { 'Nothing Matches This': 'brand: fixture' } });
  const r = checks.run({ policy: stale, frozen: { LS: ['dep', 'gate', 'added'] } });
  assert.ok(r.findings.some((f) => f.check === 'P1' && /Nothing Matches This/.test(f.text)));
});

test('self-test: the ledger reports new, raised and fixed entries', () => {
  const finding = { check: 'B5', file: 'f.js', line: 1, fn: 'x', text: 'Gate', msg: '' };
  const id = checks.id(finding);
  // a new finding
  assert.equal(ledger.compare([finding], [], checks.id).fresh.length, 1);
  // a raised count: two where the ledger allows one
  assert.equal(ledger.compare([finding, finding], [{ id, count: 1 }], checks.id).over.length, 1);
  // fixed: the ledger claims more than is there
  assert.equal(ledger.compare([], [{ id, count: 1 }], checks.id).stale.length, 1);
  // exactly as ledgered
  const ok = ledger.compare([finding], [{ id, count: 1 }], checks.id);
  assert.equal(ok.fresh.length + ok.over.length + ok.stale.length, 0);
  // a never-ledgered check cannot be excused by an entry
  const dup = { check: 'B4', file: 'f.js', line: 1, fn: null, text: 'T.k', msg: '' };
  assert.equal(ledger.compare([dup], [{ id: checks.id(dup), count: 1 }], checks.id).fresh.length, 1);
});

test('self-test: the tokenizer fails closed', () => {
  const { tokenize } = require('./i18n/tok');
  assert.throws(() => tokenize("var a = 'unterminated;\n", { file: 'x.js' }), /unterminated string/);
  assert.throws(() => tokenize('function f() { if (a) { }', { file: 'x.js' }), /unclosed/);
  assert.throws(() => tokenize('var t = `open ${a}', { file: 'x.js' }), /unterminated template|unclosed/);
});
