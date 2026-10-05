'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE LANGUAGE HELPERS, RUN FOR REAL OVER EVERY KEY AND EVERY PAIR.
//
// The static guard proves a word exists in nine languages. This proves the
// helpers put the right two of them on screen: every key of the store and of
// the gate's label table, through every ordered pair of the nine languages,
// with the Québec rule on and off — and the weekday, clock and language
// resolver for every language and every airport.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BS = require('../fids-current/js/board-strings.js');
const scan = require('./i18n/scan');

const LANGS = BS.LANGS;
const PAIRS = [];
for (const a of LANGS) { PAIRS.push([a]); for (const b of LANGS) if (a !== b) PAIRS.push([a, b]); }
const halves = (html) => [...String(html).matchAll(/<span class="bs-h[^"]*" lang="([a-z]{2})"( dir="rtl")?[^>]*>([\s\S]*?)<\/span>/g)]
  .map((m) => ({ lang: m[1], rtl: !!m[2], text: m[3] }));

test('the nine languages, once, with their settings', () => {
  assert.deepEqual(LANGS, ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']);
  for (const l of LANGS) {
    const m = BS.META[l];
    assert.ok(m && (m.dir === 'ltr' || m.dir === 'rtl') && m.intl && typeof m.clock24 === 'boolean' && m.colon, l);
  }
  assert.equal(BS.META.ar.dir, 'rtl');
  assert.equal(BS.META.ar.clock24, true, 'Arabic reads the 24-hour clock with the other non-English languages');
});

test('bs(): every key in every language, and never a key name', () => {
  for (const key of Object.keys(BS.STR)) {
    for (const l of LANGS) {
      const v = BS.bs(key, l);
      assert.ok(v && v === BS.STR[key][l] && !/undefined/.test(v), `${key}.${l}`);
    }
  }
  assert.equal(BS.bs('noSuchKey', 'fr'), '', 'a missing key renders nothing, not its name');
});

// every placeholder the store uses, filled with a sample value
const FIELDS = {};
for (const e of Object.values(BS.STR)) for (const l of LANGS) for (const m of String(e[l] || '').matchAll(/\{([A-Za-z0-9_]+)\}/g)) FIELDS[m[1]] = 'X' + m[1];

test('every placeholder appears in every language of its entry', () => {
  for (const [key, e] of Object.entries(BS.STR)) {
    const want = (String(e.en).match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join();
    for (const l of LANGS) assert.equal((String(e[l]).match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join(), want, `${key}.${l}`);
  }
});

test('bsPair(): only the selected languages, each half marked with its language and direction', () => {
  for (const key of Object.keys(BS.STR)) {
    const e = BS.STR[key];
    for (const langs of PAIRS) {
      for (const frFirst of [false, true]) {
        const want = BS.pairLangs(langs, frFirst);
        const html = BS.pair(key, { langs, frFirst, keepDup: true, fields: FIELDS });
        const got = halves(html);
        assert.equal(got.length, want.length, `${key} ${langs} ${frFirst}`);
        got.forEach((h, i) => {
          assert.equal(h.lang, want[i], `${key} ${langs}: half ${i} is ${want[i]}`);
          assert.equal(h.rtl, h.lang === 'ar', `${key}: an Arabic half reads right to left, and only it`);
          assert.ok(!/undefined|\{[A-Z]+\}/.test(h.text), `${key}.${h.lang}: placeholders filled`);
          assert.equal(h.text, BS.fill(e[h.lang], FIELDS), `${key}.${h.lang} is that language's own words`);
          assert.ok(h.text.length > 0);
          assert.ok(e[h.lang] != null);
        });
        const plain = BS.pair(key, { langs, frFirst, plain: true, keepDup: true, fields: FIELDS });
        assert.equal(plain.split(' | ').length, want.length);
      }
    }
  }
});

test('bsPairLangs(): a subset of the board\'s languages, at most two, French first in Québec only when chosen', () => {
  for (const langs of PAIRS) {
    for (const iata of ['YUL', 'YHU', 'YQM', 'MCO', '']) {
      const p = BS.pairLangs(langs, iata);
      assert.ok(p.length >= 1 && p.length <= 2);
      for (const l of p) assert.ok(langs.includes(l), `${langs} at ${iata} invented ${l}`);
      if (BS.isFrFirst(iata) && langs.includes('fr')) assert.equal(p[0], 'fr', `${langs} at ${iata}`);
      if (!BS.isFrFirst(iata)) assert.deepEqual(p, langs.slice(0, 2));
    }
  }
});

test('bsWeekday(): seven different names in every language and style (Arabic was cut to three letters)', () => {
  const sunday = Date.UTC(2026, 9, 4, 16);
  for (const l of LANGS) {
    for (const style of ['short', 'long']) {
      const names = new Set();
      for (let d = 0; d < 7; d++) names.add(BS.weekday(sunday + d * 86400000, l, style, 'UTC'));
      assert.equal(names.size, 7, `${l} ${style}: ${[...names].join(' ')}`);
    }
  }
});

test('bsTime(): 5:35pm in English, 17:35 in the others, no Latin am/pm in ja/zh/ar', () => {
  const t = Date.UTC(2026, 9, 4, 20, 35);
  for (const l of LANGS) {
    const s = BS.time(t, l, 'America/Halifax');
    if (l === 'en') assert.equal(s, '5:35pm');
    else assert.equal(s, '17:35', l);
    if (['ja', 'zh', 'ar'].includes(l)) assert.ok(!/[ap]m/i.test(s));
  }
  assert.equal(BS.clockText('09:05', 'en'), '9:05am');
  assert.equal(BS.clockText('9:05', 'de'), '09:05');
});

// Every airport the board knows.
const core = scan.load('fids-current/js/fids-core.js');
const apObj = scan.findTable(core.units[0], 'AP');
const AIRPORTS = apObj.keys.map((k) => k.k).filter((k) => /^[A-Z0-9]{3}$/.test(k));

test('bsResolveLangs(): URL, then saved, then configured, then default — the Québec rule on top, for every airport', () => {
  assert.ok(AIRPORTS.length > 150, 'the airport table is read');
  for (const iata of AIRPORTS) {
    const fr = BS.isFrFirst(iata);
    const d = BS.resolveLangs({ iata }).langs;
    assert.deepEqual(d, BS.defaultLangs(iata));
    if (fr) assert.equal(d[0], 'fr', `${iata} is in Québec: its board starts in French`);
    for (const langs of PAIRS) {
      const saved = BS.resolveLangs({ iata, saved: langs.join(',') });
      assert.equal(saved.source, 'saved');
      assert.deepEqual([...saved.langs].sort(), [...langs].sort(), 'no language invented or dropped');
      if (fr && langs.includes('fr')) assert.equal(saved.langs[0], 'fr');
      if (!fr) assert.deepEqual(saved.langs, langs);
      const url = BS.resolveLangs({ iata, search: '?langs=' + langs.join(','), saved: 'de,it' });
      assert.equal(url.source, 'url', 'the URL outranks the saved choice');
    }
  }
});

test('bsResolveLangs(): 504 ordered triples at every Québec airport', () => {
  for (const iata of BS.FR_FIRST) {
    for (const a of LANGS) for (const b of LANGS) for (const c of LANGS) {
      if (a === b || b === c || a === c) continue;
      const r = BS.resolveLangs({ iata, saved: [a, b, c].join(',') }).langs;
      assert.equal(r.length, 3);
      assert.equal(r.includes('fr') ? r[0] === 'fr' : true, true, `${iata} ${a},${b},${c}`);
      const p = BS.pairLangs(r, iata);
      assert.ok(p.every((l) => [a, b, c].includes(l)));
    }
  }
});

test('bsResolveLangs(): a phone shows one language — its saved choice, else the browser\'s own', () => {
  assert.deepEqual(BS.resolveLangs({ phone: true, phoneSaved: 'ja' }).langs, ['ja']);
  assert.deepEqual(BS.resolveLangs({ phone: true, navigatorLang: 'ar-EG' }).langs, ['ar']);
  assert.deepEqual(BS.resolveLangs({ phone: true, navigatorLang: 'ko-KR' }).langs, ['en']);
  assert.deepEqual(BS.resolveLangs({ phone: true, phoneSaved: 'xx', navigatorLang: 'pt-BR' }).langs, ['pt']);
});

// ── the gate's own helpers, lifted out of fids-core.js ────────────────────
function source(name) {
  const u = core.units[0];
  const t = u.toks;
  for (let i = 0; i < t.length; i++) {
    if (t[i].v === 'function' && t[i + 1] && t[i + 1].v === name) {
      let j = i + 2; while (t[j].v !== '{') j++;
      return core.src.slice(t[i].s, t[u.closeOf[j]].e);
    }
  }
  throw new Error('no function ' + name);
}
function tableSource(name) {
  const o = scan.findTable(core.units[0], name);
  return 'var ' + name + ' = ' + core.src.slice(core.units[0].toks[o.open].s, core.units[0].toks[o.close].e) + ';';
}
const GATE = new Function('langs', tableSource('_GATE_LBL') + source('_gateLbl') + source('_gateLbl1')
  + 'return { T: _GATE_LBL, lbl: _gateLbl, one: _gateLbl1 };');

test('_gateLbl(): every gate label key, every pair: only the selected languages', () => {
  const keys = Object.keys(GATE(['en']).T);
  for (const langs of PAIRS) {
    for (const frF of [false, true]) {
      const G = GATE(langs);
      const want = BS.pairLangs(langs, frF);
      for (const key of keys) {
        const got = [];
        G.lbl(key, frF, (w, i, l) => { got.push(l); return w; }, '', true);
        // a language the entry lacks is the guard's B1 finding, not this test's
        const has = want.filter((l) => G.T[key][l]);
        assert.deepEqual(got, has.length ? has : ['en'], `${key} ${langs} frFirst=${frF}`);
      }
    }
  }
});

test('_gateLbl1(): French only when French is one of the board\'s languages (it returned French at any Québec gate)', () => {
  const keys = Object.keys(GATE(['en']).T);
  for (const langs of PAIRS) {
    const G = GATE(langs);
    for (const key of keys) {
      const w = G.one(key, true);
      const lang = BS.pairLangs(langs, true)[0];
      assert.equal(w, G.T[key][lang] || G.T[key].en, `${key} ${langs}`);
    }
  }
});

function constSource(name) {
  const u = core.units[0];
  const t = u.toks;
  for (let i = 0; i < t.length; i++) {
    if ((t[i].v === 'const' || t[i].v === 'var' || t[i].v === 'let') && t[i + 1] && t[i + 1].v === name && t[i + 2] && t[i + 2].v === '=') {
      let d = 0, j = i;
      for (; j < t.length; j++) {
        if (['{', '(', '[', '${'].includes(t[j].v)) d++;
        else if (['}', ')', ']', '}$'].includes(t[j].v)) d--;
        else if (d === 0 && t[j].v === ';') break;
      }
      return core.src.slice(t[i].s, t[j].e);
    }
  }
  throw new Error('no const ' + name);
}

// a whole `function name(…) { … }` out of fids-core.js, braces matched
function fnSourceOf(name) {
  const at = core.src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('no function ' + name);
  let d = 0;
  for (let i = core.src.indexOf('{', at); i < core.src.length; i++) {
    if (core.src[i] === '{') d++;
    else if (core.src[i] === '}' && --d === 0) return core.src.slice(at, i + 1) + '\n';
  }
  throw new Error('unterminated ' + name);
}
test('TL()/SL(): a key outside the legacy table comes from the store; a missing key renders nothing', () => {
  const make = (lang) => new Function('lang', tableSource('LS') + tableSource('SS') + constSource('TL') + constSource('SL') + fnSourceOf('_ssEntry')
    + 'return { TL: TL, SL: SL };')(lang);
  for (const l of LANGS) {
    const H = make(l);
    assert.equal(H.TL('dep'), H.TL('dep') && H.TL('dep'));
    for (const key of Object.keys(BS.STR)) assert.equal(H.TL(key), BS.STR[key][l], `TL('${key}') in ${l}`);
    assert.equal(H.TL('greenKeyThatDoesNotExist'), '', 'never the key name');
    assert.equal(H.SL('noSuchStatus'), '');
    // a status the frozen SS lacks is the store's status entry, not a word
    // that shares its name ('expected', the lower-case qualifier)
    assert.equal(H.SL('expected'), BS.STR.stExpected[l], `SL('expected') in ${l}`);
  }
});

// ── v23970 (second pass) ──────────────────────────────────────────────────

test('the store is frozen: a run-time write changes nothing', () => {
  const deep = (o, path) => {
    assert.ok(Object.isFrozen(o), path + ' is frozen');
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') deep(o[k], path + '.' + k);
  };
  deep(BS.STR, 'STR'); deep(BS.LISTS, 'LISTS'); deep(BS.META, 'META');
  assert.ok(Object.isFrozen(BS.LANGS) && Object.isFrozen(BS.FR_FIRST));
  assert.throws(() => { 'use strict'; BS.STR.tomorrow.fr = 'Lendemain'; }, TypeError);
  assert.equal(BS.bs('tomorrow', 'fr'), 'Demain');
});

test('every LISTS entry carries all nine languages, of one length, and list() never falls back to English', () => {
  for (const [key, e] of Object.entries(BS.LISTS)) {
    const n = e.en.length;
    for (const l of LANGS) {
      assert.ok(Array.isArray(e[l]), `${key}.${l}`);
      assert.equal(e[l].length, n, `${key}.${l} has ${n} lines`);
      assert.deepEqual(BS.list(key, l), e[l]);
    }
  }
  assert.deepEqual(BS.list('noSuchList', 'fr'), []);
});

test('a board reads one clock: the clock of the language it leads with', () => {
  const t = Date.UTC(2026, 9, 4, 22, 1);   // 7:01pm in Moncton
  assert.equal(BS.boardTime(t, 'America/Moncton', { list: ['en', 'fr'] }), '7:01 PM');
  assert.equal(BS.boardTime(t, 'America/Moncton', { list: ['en', 'fr'], hour: '2-digit' }), '07:01 PM');
  for (const L of [['fr'], ['fr', 'en'], ['de'], ['de', 'pt'], ['ja', 'ar'], ['es', 'zh']])
    assert.equal(BS.boardTime(t, 'America/Moncton', { list: L }), '19:01', L.join(','));
  assert.equal(BS.boardTime(t, 'America/Moncton', { list: ['de'], hourOnly: true }), '19:00');
  assert.equal(BS.boardClockText('7:01PM · 6:15 pm · 12:03am · 5:20 p.m. · 11:55 AM', ['de']), '19:01 · 18:15 · 00:03 · 17:20 · 11:55');
  assert.equal(BS.boardClockText('7:01PM', ['en', 'fr']), '7:01PM', 'a board led by English keeps its own');
  assert.ok(BS.boardClock24(['fr', 'en']) && !BS.boardClock24(['en', 'fr']));
});

test('looksLike(): a feed answer is shown in a language only when it is in it', () => {
  for (const l of ['fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) {
    assert.equal(BS.looksLike('Welcome to a new era of luxury.', l), false, 'English is not ' + l);
    assert.equal(BS.looksLike('Fitness center, indoor pool, hot tub, sauna', l), false, 'an English amenity list is not ' + l);
  }
  assert.ok(BS.looksLike('Le Fairmont Royal York est situé en centre-ville de Toronto', 'fr'));
  assert.ok(BS.looksLike('Gimnasio, piscina cubierta, bañera de hidromasaje y sauna', 'es'));
  assert.ok(BS.looksLike('中心部から1 km', 'ja'));
  assert.ok(BS.looksLike('距市中心1 km', 'zh') && !BS.looksLike('中心部から1 km', 'zh'));
  assert.ok(BS.looksLike('1 km من وسط المدينة', 'ar') && !BS.looksLike('1 km from downtown', 'ar'));
  assert.ok(BS.looksLike('Anything', 'en'));
});

test('markHalf marks the word, not the separator in front of it', () => {
  assert.equal(BS.markHalf('<span class="v2-fi-sep"> | </span><span class="v2-fi-lbl-2">ご搭乗機</span>', 'ja'),
    '<span class="v2-fi-sep"> | </span><span class="v2-fi-lbl-2" lang="ja">ご搭乗機</span>');
  assert.equal(BS.markHalf('<span class="x">الآن</span>', 'ar'), '<span class="x" lang="ar" dir="rtl">الآن</span>');
});
