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
  PASSENGER_SCRIPTS: [FX + 'store.js', FX + 'legacy.js', FX + 'clean.js', FX + 'attacks.js', FX + 'datafile.js'],
  PASSENGER_STYLES: [FX + 'bad.css'],
  NON_PASSENGER: {},
  NON_PASSENGER_PAGES: {},
  STORE_FILE: FX + 'store.js',
  LEGACY_STORES: [{ file: FX + 'legacy.js', name: 'LS', helpers: ['TL'] }],
  KEY_HELPERS: { TL: ['LS', 'STR'], TLin: ['LS', 'STR'], bs: ['STR'], bsPair: ['STR'], bsList: ['LISTS'] },
  KEY_HELPERS_BY_FILE: { [FX + 'attacks.js']: { T: ['STR'], TU: ['STR'] } },
  NONTEXT_TABLES: [],
  DATA_TABLES: { [FX + 'datafile.js']: { FX_CITY: 'data: fixture city names', FX_NOTES: 'debug: notes on what each feed says, never rendered', FX_HOTELS: 'data: fixture hotel names' } },
  PAGE_ROOT: 'tests/i18n/fixtures',
  SAME_JA_ZH: {},
  NATIVE_WORDS: {},
  DATA_WRITERS: {},
  DATA_KEYS: {},
  LANG_RECORD_TABLES: {},
  DECISION_FILES: {},
  BRAND_TERMS: { 'Baggage Arrival Gateway Screen': 'brand: fixture (its words are not data one by one)' },
  SAME_AS_ENGLISH: { Gate: { langs: ['de', 'it'], why: 'fixture' } },
  OPERATOR_FUNCTIONS: {},
  TEXT_REWRITERS: {},
  LANG_STORAGE_FUNCTIONS: {},
  LANG_POSITION_FUNCTIONS: {}
});
const R = checks.run({ policy, frozen: { LS: ['dep', 'gate'] }, workerFiles: [FX + 'worker.js'] });
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

// The reviewer's bypasses (2026-10-04), one function each in
// fixtures/attacks.js: each must draw a finding.
const ATTACKS = (() => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'i18n/fixtures/attacks.js'), 'utf8');
  return [...src.matchAll(/^function ((atk_\w+|_legacyPair))\(/gm)].map((m) => m[1]);
})();
for (const fn of ATTACKS) {
  test(`self-test: the guard sees ${fn}`, () => {
    const hits = F.filter((f) => f.file === FX + 'attacks.js' && f.fn === fn);
    assert.ok(hits.length > 0, `nothing reported inside ${fn}() in fixtures/attacks.js`);
  });
}
const STORE_ATTACKS = [
  ['B1', /atkFrOnly/, 'an entry with only French'],
  ['B1', /Tomorrow de/, 'a zero-width space hiding a copied word'],
  ['B3', /Tomorrow de/, "the English inside the German ('Tomorrow (morgen)')"],
  ['B3', /Today de/, 'German copied from Spanish'],
  ['B3', /Departure zh/, 'Japanese kana in the Chinese'],
  ['B1', /atkFrList/, 'a ticker list with only French'],
  ['B3', /Tomorrow de/, "the Japanese '明日' in the German"],
  ['B3', /U\+0627|U\+063A|Arabic|does not write/, "the Arabic 'غدًا' in the German"],
  ['B3', /U\+043E/, "a Cyrillic 'о' inside 'Tomоrrow'"],
  ['B3', /English word 'Today'/, "the English of another key ('Today') in the German"],
  ['B3', /is the Chinese, character for character/, "the Chinese '明天' in the Japanese"],
  ['B3', /simplified Chinese/, 'simplified-Chinese characters in the Japanese'],
  ['B3', /English word 'closes'/, "an English paraphrase in the German ('Gate closes shortly')"],
  ['B17', /'On time' and 'Scheduled'/, 'two statuses with one word (定刻)'],
  ['B16', /STR/, 'the store rewriting itself at run time'],
  ['B3', /'XXX' is a placeholder/, "a placeholder ('XXX') in the German"],
  ['B3', /'？？？' is a placeholder/, "a placeholder ('？？？') in the Japanese"],
  ['B3', /'—' is a placeholder/, 'a dash where the German belongs'],
  ['B3', /Persian word 'فردا'/, "the Persian 'فردا' for Arabic"],
  ['B3', /Persian or Urdu letter/, "the Urdu 'کل' for Arabic"],
  ['B3', /es and pt both read 'Tramo'/, "the Spanish 'Tramo' pasted into the Portuguese"],
  ['B3', /it and pt both read 'Domani'/, "the Italian 'Domani' pasted into the Portuguese"],
  ['B3', /English word 'Doors'|English word 'momentarily'/, "English the store's English never uses ('Doors shut momentarily')"],
  ['B3', /U\+FF34|U\+FF54|a look-alike/, "fullwidth letters ('Ｔｏｍｏｒｒｏｗ')"],
  ['B3', /U\+1D21/, "a small capital ('Tomorroᴡ')"],
  ['B1', /U\+034F/, 'a combining grapheme joiner hiding a copied word'],
  ['B3', /de item 1 .*English words? 'PLEASE'/, 'an English line in the German ticker'],
  ['B3', /de item 2 'TODO' is a placeholder/, "a 'TODO' line in the German ticker"]
];
for (const [check, re, what] of STORE_ATTACKS) {
  test(`self-test: ${check} catches ${what}`, () => {
    assert.ok(F.some((f) => f.check === check && f.file === FX + 'store.js' && (re.test(f.text) || re.test(f.msg))),
      `${check} did not report ${what}\n` + F.filter((f) => f.file === FX + 'store.js').map((f) => `  ${f.check} ${f.line} ${f.text}`).join('\n'));
  });
}
test('self-test: B15 catches a label added to a data file (shared-names.js)', () => {
  assert.ok(F.some((f) => f.check === 'B15' && f.file === FX + 'datafile.js' && /Gate closes/.test(f.text)));
  assert.ok(!F.some((f) => f.file === FX + 'datafile.js' && /MONCTON|HALIFAX/.test(f.text)), 'the data table itself is data');
});
test('self-test: static text inside <svg>, <template> and <noscript> is page text (B10)', () => {
  for (const w of ['Gate closes soon', 'Gate closing now', 'Gate closed already'])
    assert.ok(F.some((f) => f.check === 'B10' && f.text === w), w + ' was not reported');
});
test('self-test: a page no list names fails (C3), and so does one an iframe shows (C1)', () => {
  assert.ok(F.some((f) => f.check === 'C3' && /unlisted\.html/.test(f.text)), 'C3 did not report unlisted.html');
  assert.ok(F.some((f) => f.check === 'C1' && /unlisted\.html/.test(f.text)), 'C1 did not report the iframe');
});
test('self-test: a word written into a notes table, or into a name table in the same change, is not data', () => {
  // words of a 'debug:' table never count; with main's name words given
  // (dataVocabBase) and the hotel table absent from it, its words do not either
  const r2 = checks.run({ policy, frozen: { LS: ['dep', 'gate'] }, dataVocabBase: new Set(['moncton', 'halifax']) });
  assert.ok(r2.findings.some((f) => f.file === FX + 'attacks.js' && f.fn === 'atk_N2c_nameWordsViaVariable'));
  assert.ok(!R.dataVocab.includes('flight') && !R.dataVocab.includes('status'), 'a notes table\'s words are not data');
  assert.ok(!R.dataVocab.includes('baggage'), 'a brand\'s words are not data one by one');
  assert.ok(!R.dataVocab.includes('hotel'), 'a word the store\'s English uses as a label is not data');
});
test('self-test: a pragma moved onto a new line is a new exception, whatever the count', () => {
  const before = { 'a.js': "var x = 'LIVE'; // i18n-ok: operator\nvar y = 1;\n" };
  const now = { 'a.js': "var x = 'LIVE';\nvar y = 'Gate closes'; // i18n-ok: operator\n" };
  const added = ratchet.pragmasAdded(ratchet.pragmaIds(['a.js'], (f) => before[f]), ratchet.pragmaIds(['a.js'], (f) => now[f]));
  assert.equal(added.length, 1);
  assert.match(added[0].entry, /Gate closes/);
  assert.equal(ratchet.pragmaCounts(['a.js'], (f) => now[f])['a.js operator'], 1, 'the per-file count did not change');
});
test('self-test: approvals are main\'s, and well formed', () => {
  assert.deepEqual(ratchet.parseApprovals(null), [], 'no approvals file on main: nothing approved');
  assert.throws(() => ratchet.parseApprovals('[{ "list": "BRAND_TERMS", "entry": "x" }]'), /where it was approved/);
});
test('self-test: a feed worker writing its own English into a row fails (W1)', () => {
  assert.ok(F.some((f) => f.check === 'W1' && /Gate closes in 10 minutes/.test(f.text)), 'a made-up status');
  assert.ok(F.some((f) => f.check === 'W1' && /Proceed to the gate now/.test(f.text)), 'a made-up remark');
  assert.ok(!F.some((f) => f.check === 'W1' && /gateclosing/.test(f.text)), 'a code is what a worker sends');
});
test('self-test: C2 catches a script injected at run time', () => {
  assert.ok(F.some((f) => f.check === 'C2' && /injected\.js/.test(f.text)));
});
test('self-test: a pragma at the end of a line of code never reaches the line below', () => {
  assert.ok(F.some((f) => f.fn === 'atk_R5_pragmaBelow' && /Gate closes in ten minutes/.test(f.text)), 'the label under an inline pragma was hidden');
  assert.ok(!F.some((f) => f.file === FX + 'clean.js' && /DEMO MODE/.test(f.text)), 'a pragma on a line of its own excuses the line below');
});
test('self-test: CSS that draws text without content: is read (B9)', () => {
  for (const what of ['quotes', 'list-style-type', 'symbols']) assert.ok(F.some((f) => f.check === 'B9' && f.file === FX + 'bad.css' && new RegExp(what).test(f.msg)), what + ' was not read');
  assert.ok(F.some((f) => f.check === 'B9' && f.fn === 'atk_R5_inlineVar'), 'a style="--x:…" drawn by content: var(--x)');
});
test('self-test: every script and stylesheet is classified (C4)', () => {
  assert.ok(F.some((f) => f.check === 'C4' && /injected\.js/.test(f.text)), 'an unclassified script file');
});

// The ratchet: a new exception of any kind is reported against main.
const ratchet = require('./i18n/ratchet');
test('self-test: the ratchet reports every new exception', () => {
  const before = real;
  const now = Object.assign({}, real, {
    BRAND_TERMS: Object.assign({ 'Gate closes': 'brand: test' }, real.BRAND_TERMS),
    NON_PASSENGER: Object.assign({ 'fids-current/js/gate-extra.js': 'operator: extra' }, real.NON_PASSENGER),
    OPERATOR_FUNCTIONS: Object.assign({}, real.OPERATOR_FUNCTIONS, { 'fids-current/js/fids-core.js': Object.assign({ _gcOpLabel: 'operator: test' }, real.OPERATOR_FUNCTIONS['fids-current/js/fids-core.js']) }),
    DATA_TABLES: Object.assign({}, real.DATA_TABLES, { 'fids-current/js/fids-core.js': Object.assign({ GATE_WORDS: 'data: test' }, real.DATA_TABLES['fids-current/js/fids-core.js']) }),
    SAME_AS_ENGLISH: Object.assign({ 'Gate closes': { langs: ['de'], why: 'test' } }, real.SAME_AS_ENGLISH),
    REASONS: real.REASONS.concat('passenger')
  });
  const added = ratchet.exceptionsAdded(before, now).map((x) => x.list + ': ' + x.entry);
  for (const want of ['BRAND_TERMS: Gate closes', 'NON_PASSENGER: fids-current/js/gate-extra.js', 'OPERATOR_FUNCTIONS: fids-current/js/fids-core.js _gcOpLabel',
    'DATA_TABLES: fids-current/js/fids-core.js GATE_WORDS', 'SAME_AS_ENGLISH: Gate closes de', 'REASONS: passenger'])
    assert.ok(added.includes(want), want + ' was not reported');
  assert.deepEqual(ratchet.exceptionsAdded(real, real), []);
  // a pragma more than main has, per file and reason
  const p = ratchet.pragmasAdded({ 'a.js data': 2 }, { 'a.js data': 3, 'a.js code': 1 });
  assert.deepEqual(p.map((x) => x.entry + ' ' + x.count), ['a.js data 3', 'a.js code 1']);
  // a loosened call list in checks.js
  const l = ratchet.loosenersAdded({ EXCLUDED_CALLS: new Set(['log']) }, { EXCLUDED_CALLS: new Set(['log', 'append']) });
  assert.deepEqual(l.map((x) => x.entry), ['append']);
  // an approval clears exactly its entry, and a pragma approval its count
  const appr = [{ list: 'BRAND_TERMS', entry: 'Gate closes', approved: 'PR #1' }, { list: 'i18n-ok', entry: 'a.js data', count: 3, approved: 'PR #1' }];
  assert.deepEqual(ratchet.unapproved([{ list: 'BRAND_TERMS', entry: 'Gate closes' }, { list: 'BRAND_TERMS', entry: 'Other' }], appr).map((x) => x.entry), ['Other']);
  assert.equal(ratchet.unapproved([{ list: 'i18n-ok', entry: 'a.js data', count: 4 }], appr).length, 1, 'an approval for 3 pragmas does not cover 4');
});

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
