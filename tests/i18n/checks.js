'use strict';
// ━━ THE BOARD-LANGUAGES CHECKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// run(options) reads the policy's files and returns findings:
//   { check, file, line, fn, text, msg }
// `id(finding)` is what the debt ledger matches on: check, file, function and
// normalised text, never the line, so edits nearby do not churn the ledger.
//
//   B1  nine languages: every language-keyed table has all nine, as plain,
//       non-empty strings, and no unknown language code
//   B2  no table outside the store: a language-keyed object, [code, text]
//       array or X_FR-style parallel table anywhere but board-strings.js and
//       the registered (frozen) tables
//   B3  not left in English: a translation equal to the English, ja/zh/ar
//       without its own script, or a French value pasted into es/de/it/pt
//   B4  one declaration per key, in every object of every script; no key in
//       two stores that one helper reads
//   B5  no words in markup: text in an HTML-building string, a literal put
//       into textContent/innerHTML/…, a literal fallback after a label
//       helper, a bilingual "X | Y" literal, an English sentence literal
//   B6  a literal key passed to a label helper exists in the tables it reads
//   B7  one translation per phrase across every table
//   B8  a known label phrase written as a literal outside a table
//   B9  CSS `content:` text, and data-* text drawn by `content: attr()`
//   B10 static page text not marked data-i18n (filled from the store) or
//       data-operator
//   B11 a language chosen outside the store: lang === 'xx' ?, a French-first
//       ternary, boardLangsFor()[1], langs.slice(0, 2), a literal locale or
//       hour12, a private list of language codes, fids_langs_ outside its
//       owners, direct .en/.fr reads of a table entry
//   B12 the Québec list exists once
//   B13 no text rewritten on a timer except the registered data normalisers
//   B14 board-strings.js and fids-core.js are served from the same build
//   B15 no passenger word kept outside the store: a label-shaped literal in a
//       variable, a property, a list, a return value or a call argument —
//       wherever it goes next — unless every word in it is data (a city, an
//       airline, an aircraft, a brand) or it is a key the ad table translates
//   B16 the store is never changed at run time: no assignment, delete,
//       Object.assign/defineProperty or push into BOARD_STR, STR, LISTS,
//       META or a registered table (the CITY_FR collapse, at run time)
//   C1  every script and stylesheet a passenger page loads is classified
//   C2  every script, stylesheet or page a passenger script loads at run
//       time is classified too (a script injected by code is still loaded)
//   P1  every policy exception still matches something; reasons are valid
//   P2  every `i18n-ok:` pragma has a valid reason, and suppresses something
//   L1  the frozen tables gain no key
//
// What a static scan cannot see — words that arrive through feed data, or
// through indirection it cannot follow — the rendered check sees:
// tests/render/words.mjs puts each board on screen in each of the nine
// languages and fails on any word that is not that language's.

const fs = require('node:fs');
const path = require('node:path');
const scan = require('./scan');

const ROOT = scan.ROOT;

// ── text helpers ──────────────────────────────────────────────────────────
const RE_SCRIPT = {
  ja: /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]/,
  zh: /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/,
  ar: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
};
// The accented letters each Latin-script board language writes. A letter
// outside its set is another language's word pasted in ('Mañana' in German).
const LATIN_ALPHABET = {
  fr: 'àâæçéèêëîïôœùûüÿ', es: 'áéíóúüñ', de: 'äöüßé', it: 'àèéìíîòóùú', pt: 'áâãàçéêíóôõú'
};
const LANG_NAME = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese', ar: 'Arabic' };
const RE_LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
const RE_WORD = /[A-Za-z\u00C0-\u024F]{2,}|[\u0600-\u06FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

function stripTags(s) { return String(s).replace(/<[^>]*>/g, ' '); }
function stripEntities(s) { return String(s).replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi, ' '); }
// Characters that draw nothing: a zero-width space hides 'Tomor\u200Brow'
// from a comparison with 'Tomorrow' and from a reader not at all.
const RE_INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;
const RE_INVISIBLE_G = new RegExp(RE_INVISIBLE.source, 'g');
function norm(s) {
  return stripEntities(stripTags(String(s).replace(RE_INVISIBLE_G, ''))).replace(/\{[A-Za-z0-9_]+\}|%[a-z]\b/g, ' ').replace(/[\s\u00A0\u202F:\u00B7\u2022|\u2026.,;!?'\u2019"\u00AB\u00BB()\[\]\-\u2013\u2014/]+/g, ' ').trim().toLowerCase();
}
// The words of a value, lower-cased, for vocabulary comparisons.
function wordsOf(s) {
  return stripEntities(stripTags(String(s).replace(RE_INVISIBLE_G, ''))).replace(/\{[A-Za-z0-9_]+\}/g, ' ')
    .split(/[^\p{L}\p{N}'\u2019.\-]+/u)
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase())
    .filter((w) => w.length >= 2 && /\p{L}/u.test(w));
}
function shortText(s) { return String(s).replace(/\s+/g, ' ').trim().slice(0, 80); }
function id(f) { return `${f.check}:${f.file}:${f.fn || '-'}:${shortText(f.text)}`; }

const FUNCTION_WORDS = new Set(['the', 'to', 'for', 'of', 'your', 'our', 'now', 'next', 'please', 'this', 'that', 'and',
  'not', 'no', 'is', 'are', 'will', 'be', 'has', 'have', 'until', 'available', 'unavailable', 'pending', 'loading',
  'found', 'with', 'by', 'at', 'from', 'in', 'on', 'before', 'after', 'into', 'all', 'any', 'more', 'see', 'here']);

// ── the run ───────────────────────────────────────────────────────────────
function run(options) {
  options = options || {};
  const P = options.policy || require('./policy');
  DATA_KEYS_SET = new Set(Object.keys(P.DATA_KEYS || {}));
  const LANGS = P.LANGS;
  const LSET = new Set(LANGS);
  const read = options.read || ((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const exists = options.exists || ((rel) => fs.existsSync(path.join(ROOT, rel)));
  const load = (rel) => scan.load(rel, options.read ? read(rel) : undefined);
  const findings = [];
  const used = { brand: new Set(), same: new Set(), op: new Set(), rewriters: new Set(), nontext: new Set(), storage: new Set(), data: new Set(), records: new Set(), position: new Set(), pages: new Set() };
  const pragmaHits = new Map();        // "file:line" -> reason
  const pragmaUsed = new Set();
  const add = (f) => {
    // a pragma on the finding's line (or the line above) suppresses it
    const key = f.file + ':' + f.line, key0 = f.file + ':' + (f.line - 1);
    for (const k of [key, key0]) {
      if (pragmaHits.has(k) && f.check !== 'P1' && f.check !== 'P2' && f.check !== 'C1' && f.check !== 'B4' && f.check !== 'B14') {
        pragmaUsed.add(k);
        return;
      }
    }
    findings.push(f);
  };

  const passengerScripts = P.PASSENGER_SCRIPTS.filter(exists);
  const passengerPages = P.PASSENGER_PAGES.filter(exists);
  const jsUnits = [];                  // { rel, unit, store: bool }
  for (const rel of passengerScripts.concat(passengerPages)) {
    const L = load(rel);
    for (const u of L.units) jsUnits.push({ rel, unit: u, isStore: rel === P.STORE_FILE });
  }

  // ── pragmas ──
  for (const { rel, unit } of jsUnits) {
    for (const c of unit.comments) {
      const m = /i18n-ok:\s*([a-z]+)?/.exec(c.v);
      if (!m) continue;
      if (!m[1] || !P.REASONS.includes(m[1])) {
        add({ check: 'P2', file: rel, line: c.line, fn: null, text: c.v.trim(), msg: `i18n-ok needs a reason from: ${P.REASONS.join(', ')}` });
        continue;
      }
      pragmaHits.set(rel + ':' + c.line, m[1]);
    }
  }

  // ── C1: every resource of a passenger page is classified ──
  const classified = new Set(P.PASSENGER_SCRIPTS.concat(P.PASSENGER_STYLES, Object.keys(P.NON_PASSENGER)));
  for (const page of passengerPages) {
    const html = read(page);
    const base = path.posix.dirname(page);
    const refs = [];
    for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) refs.push(m[1]);
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      if (!/rel\s*=\s*["']?stylesheet/i.test(m[0])) continue;
      const h = /href\s*=\s*["']([^"']+)["']/i.exec(m[0]);
      if (h) refs.push(h[1]);
    }
    for (const r of refs) {
      if (/^(https?:)?\/\//i.test(r)) continue;                      // external CDN
      const clean = r.split('?')[0].split('#')[0];
      const rel = clean.startsWith('/') ? (clean.startsWith('/mapcdn/') ? clean : 'fids-current' + clean) : path.posix.normalize(base + '/' + clean);
      if (!classified.has(rel)) add({ check: 'C1', file: page, line: lineOf(html, r), fn: null, text: rel, msg: `${rel} is loaded by a passenger page and is in neither PASSENGER_SCRIPTS/PASSENGER_STYLES nor NON_PASSENGER (tests/i18n/policy.js)` });
    }
  }

  // ── find the registered tables ──
  const storeNamesByFile = new Map();
  for (const s of P.LEGACY_STORES) {
    if (!storeNamesByFile.has(s.file)) storeNamesByFile.set(s.file, new Map());
    storeNamesByFile.get(s.file).set(s.name, s);
  }
  if (!storeNamesByFile.has(P.STORE_FILE)) storeNamesByFile.set(P.STORE_FILE, new Map());
  storeNamesByFile.get(P.STORE_FILE).set('STR', { file: P.STORE_FILE, name: 'STR', store: true });
  storeNamesByFile.get(P.STORE_FILE).set('LISTS', { file: P.STORE_FILE, name: 'LISTS', list: true, store: true });

  const tables = {};                   // name -> { file, unit, obj, spec }
  for (const { rel, unit } of jsUnits) {
    const names = storeNamesByFile.get(rel);
    if (!names) continue;
    for (const [name, spec] of names) {
      const o = scan.findTable(unit, name);
      if (o) tables[name] = { file: rel, unit, obj: o, spec };
    }
  }
  for (const s of P.LEGACY_STORES.concat([{ file: P.STORE_FILE, name: 'STR' }])) {
    if (!tables[s.name] && exists(s.file)) add({ check: 'P1', file: s.file, line: 1, fn: null, text: s.name, msg: `registered table ${s.name} not found in ${s.file} \u2014 remove it from LEGACY_STORES if it moved to board-strings.js` });
  }

  // table entries: name -> Map(key -> { lang: { value, line, literal } , $meta })
  const entries = {};
  function readLangObject(unit, o) {
    const out = { langs: {}, meta: {}, other: [], line: o.line };
    for (const k of o.keys) {
      if (k.k.startsWith('$')) { out.meta[k.k] = k; continue; }
      if (LSET.has(k.k)) out.langs[k.k] = { value: k.str, literal: !!k.simple, line: k.line, tok: k.v0, arr: k.arrVal, obj: k.objVal };
      else out.other.push(k);
    }
    return out;
  }
  for (const [name, t] of Object.entries(tables)) {
    const spec = t.spec;
    const m = new Map();
    if (spec.keyIsEnglish || spec.list || spec.store || !spec.flat) {
      for (const k of t.obj.keys) {
        if (k.objVal == null) continue;
        const inner = scan.objectAt(t.unit, k.objVal);
        if (inner) m.set(k.k, Object.assign(readLangObject(t.unit, inner), { obj: inner }));
      }
    }
    entries[name] = m;
  }

  // ── language objects anywhere in passenger code ──
  const isLangObj = (o) => {
    const ks = o.keys.map((k) => k.k).filter((k) => !k.startsWith('$'));
    // a record carrying its own words: { id, art, en: '…', fr: '…' }
    const en = o.keys.find((k) => k.k === 'en'), fr = o.keys.find((k) => k.k === 'fr');
    if (en && fr && en.simple && fr.simple && RE_WORD.test(en.str || '') && RE_WORD.test(fr.str || '')) return true;
    const lk = ks.filter((k) => LSET.has(k));
    const other = ks.length - lk.length;
    if (lk.length >= 3 && other <= Math.max(1, Math.floor(lk.length / 3))) return true;
    if (lk.length >= 2 && (lk.includes('en') || lk.includes('fr')) && other <= Math.max(1, Math.floor(lk.length / 3))) return true;
    // one language on its own, holding words: { fr: 'Fermeture de la porte' }
    // (rendered as x.fr, it is a French-only label, the worst kind)
    if (lk.length >= 1 && other <= 1) {
      const vals = o.keys.filter((k) => LSET.has(k.k));
      if (vals.some((k) => (k.simple && RE_WORD.test(k.str || '')) || k.arrVal != null)) return true;
    }
    return false;
  };
  const registeredObj = new Set();     // "file:open" of objects that are table entries or tables
  for (const [name, t] of Object.entries(tables)) {
    registeredObj.add(t.file + ':' + t.obj.open);
    for (const [, e] of entries[name]) registeredObj.add(t.file + ':' + e.obj.open);
  }
  const nontext = (rel, o) => {
    for (const n of P.NONTEXT_TABLES) {
      if (n.file === rel && ((n.name && (n.name === o.name || o.parent.includes(n.name))) || (n.fn && n.fn === o.fn))) { used.nontext.add(n.file + ':' + (n.name || n.fn)); return true; }
    }
    return false;
  };

  const allTextObjects = [];           // for B3/B7: { file, line, fn, store, key, langs }
  const listObjects = [];              // per-language lists (tickers): { file, key, lang, items }
  const langObjSeen = new Set();       // "file:open" of every object the loop below held to B1
  for (const { rel, unit, isStore } of jsUnits) {
    for (const o of unit.objects) {
      if ((o.name || '').startsWith('$')) continue;
      if (!isLangObj(o)) continue;
      langObjSeen.add(rel + ':' + o.open);
      const lo = readLangObject(unit, o);
      const vals = Object.values(lo.langs);
      const allNum = vals.every((v) => v.tok != null && unit.toks[v.tok] && (unit.toks[v.tok].t === 'num' || unit.toks[v.tok].v === 'true' || unit.toks[v.tok].v === 'false'));
      const allCodes = vals.every((v) => v.literal && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(v.value)));
      const reg = registeredObj.has(rel + ':' + o.open);
      if (nontext(rel, o)) continue;
      // artwork per language (a logo file for each): files, not words
      const allFiles = vals.every((v) => v.literal && /^(\/|https?:\/\/|\.\.?\/)\S+\.(svg|png|jpe?g|webp|gif|avif|mp4|webm|json)$/i.test(String(v.value)));
      if (allFiles) continue;
      if (allNum || allCodes) {
        if (!isStore) add({ check: 'B11', file: rel, line: o.line, fn: o.fn, text: '{' + Object.keys(lo.langs).join(',') + '}' + (allCodes ? ' locales' : ''), msg: 'a private per-language setting; it lives in BoardStrings.META (board-strings.js), read through bsTime/bsDate/bsWeekday' });
        continue;
      }
      const shape = vals.some((v) => v.arr != null) ? 'lists' : vals.some((v) => v.obj != null) ? 'major' : 'text';
      // B2: outside the store and the registered tables
      if (!isStore && !reg) {
        const en = (lo.langs.en && lo.langs.en.value) || (lo.langs.fr && lo.langs.fr.value) || Object.keys(lo.langs).join(',');
        add({ check: 'B2', file: rel, line: o.line, fn: o.fn, text: en || '(expression)', msg: `a language table outside the store: move it into BOARD_STR in board-strings.js (all nine languages) and render it with bs()/bsPair()` });
      }
      // B1
      const tableName = o.parent.length ? o.parent[o.parent.length - 1] : o.name;
      const spec = (tables[tableName] && tables[tableName].spec) || {};
      const need = spec.keyIsEnglish ? LANGS.filter((l) => l !== 'en') : LANGS;
      const label = (lo.langs.en && lo.langs.en.value) || (spec.keyIsEnglish ? o.name : null) || o.name || '(object)';
      const missing = need.filter((l) => !lo.langs[l]);
      if (missing.length) add({ check: 'B1', file: rel, line: o.line, fn: o.fn, text: label, msg: `missing ${missing.join(' ')} \u2014 every passenger word ships in all nine languages (en fr es de it pt ja zh ar)` });
      for (const k of lo.other) {
        if (/^[a-z]{2,3}([_-][A-Za-z]{2,4})?$/.test(k.k) && !['id', 'src', 'art', 'key', 'url', 'alt', 'img', 'tag', 'cls', 'dir', 'fn'].includes(k.k))
          add({ check: 'B1', file: rel, line: k.line, fn: o.fn, text: label + ' ' + k.k, msg: `'${k.k}' is not one of the nine language codes` });
      }
      if (shape === 'text') {
        for (const l of Object.keys(lo.langs)) {
          const v = lo.langs[l];
          if (!v.literal) add({ check: 'B1', file: rel, line: v.line, fn: o.fn, text: label + ' ' + l, msg: `${l} is an expression; each language value is a plain string literal so the guard can read it` });
          else if (!String(v.value).replace(RE_INVISIBLE_G, '').trim()) add({ check: 'B1', file: rel, line: v.line, fn: o.fn, text: label + ' ' + l, msg: `${l} is empty` });
          else if (RE_INVISIBLE.test(String(v.value))) add({ check: 'B1', file: rel, line: v.line, fn: o.fn, text: label + ' ' + l, msg: `${l} carries an invisible character (U+${String(v.value).match(RE_INVISIBLE)[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}); it hides a copied word from every comparison and from no reader` });
        }
        const langsOut = {};
        for (const l of Object.keys(lo.langs)) if (lo.langs[l].literal) langsOut[l] = lo.langs[l].value;
        if (spec.keyIsEnglish && !langsOut.en) langsOut.en = o.name;
        allTextObjects.push({ file: rel, line: o.line, fn: o.fn, table: tableName, key: o.name, langs: langsOut, ctx: lo.meta.$ctx && lo.meta.$ctx.str });
      } else if (shape === 'lists') {
        let len = null;
        for (const l of Object.keys(lo.langs)) {
          const v = lo.langs[l];
          if (v.arr == null) { add({ check: 'B1', file: rel, line: v.line, fn: o.fn, text: label + ' ' + l, msg: `${l} is not a list like the others` }); continue; }
          const arrToks = []; const close = unit.closeOf[v.arr];
          for (let j = v.arr + 1; j < close; j++) { if (unit.frameOf[j] === v.arr && (unit.toks[j].t === 'str' || unit.toks[j].t === 'tpl')) arrToks.push(unit.toks[j].v); }
          if (arrToks.some((s) => !String(s).replace(RE_INVISIBLE_G, '').trim())) add({ check: 'B1', file: rel, line: v.line, fn: o.fn, text: label + ' ' + l, msg: `${l} has an empty item` });
          if (arrToks.some((s) => RE_INVISIBLE.test(String(s)))) add({ check: 'B1', file: rel, line: v.line, fn: o.fn, text: label + ' ' + l, msg: `${l} has an item carrying an invisible character` });
          listObjects.push({ file: rel, line: v.line, fn: o.fn, table: tableName, key: o.name, lang: l, items: arrToks });
          if (len == null) len = arrToks.length;
          else if (arrToks.length !== len) add({ check: 'B1', file: rel, line: v.line, fn: o.fn, text: label + ' ' + l, msg: `${l} has ${arrToks.length} items where the others have ${len}` });
        }
      }
    }
  }

  // Every entry of the store and of a registered table is held to all nine,
  // whatever its shape: { fr: ['…'] } in LISTS, or an entry whose only
  // language is French, is still an entry with eight missing.
  for (const [name, t] of Object.entries(tables)) {
    const spec = t.spec || {};
    if (spec.keyIsEnglish || !entries[name]) continue;
    const lk = t.obj.keys.filter((k) => LSET.has(k.k) && k.objVal != null);
    if (lk.length >= 2) continue;                       // language-major, below
    for (const [key, e] of entries[name]) {
      if (key.startsWith('$') || langObjSeen.has(t.file + ':' + e.obj.open) || nontext(t.file, e.obj)) continue;
      const have = Object.keys(e.langs);
      if (!have.length && !e.other.some((k) => /^[a-z]{2,3}([_-][A-Za-z]{2,4})?$/.test(k.k))) continue;   // not a language entry (a nested group)
      const missing = LANGS.filter((l) => !e.langs[l]);
      const label = (e.langs.en && e.langs.en.value) || key;
      if (missing.length) add({ check: 'B1', file: t.file, line: e.obj.line, fn: e.obj.fn, text: label, msg: `missing ${missing.join(' ')} \u2014 every passenger word ships in all nine languages (en fr es de it pt ja zh ar)` });
    }
  }

  // language-major tables (app.html I18N: { en: {k: …}, fr: {…} })
  const majorKeys = {};
  for (const [name, t] of Object.entries(tables)) {
    const lk = t.obj.keys.filter((k) => LSET.has(k.k) && k.objVal != null);
    if (lk.length < 2) continue;
    const sets = {};
    for (const k of lk) {
      const inner = scan.objectAt(t.unit, k.objVal);
      sets[k.k] = new Map(inner.keys.map((x) => [x.k, x.str]));
    }
    majorKeys[name] = new Set(sets.en ? sets.en.keys() : []);
    const missing = LANGS.filter((l) => !sets[l]);
    if (missing.length) add({ check: 'B1', file: t.file, line: t.obj.line, fn: t.obj.fn, text: name, msg: `missing ${missing.join(' ')} \u2014 every passenger word ships in all nine languages` });
    const enKeys = sets.en ? [...sets.en.keys()] : [];
    for (const l of Object.keys(sets)) {
      if (l === 'en') continue;
      const gone = enKeys.filter((k) => !sets[l].has(k));
      if (gone.length) add({ check: 'B1', file: t.file, line: t.obj.line, fn: t.obj.fn, text: name + ' ' + l, msg: `${l} lacks ${gone.join(', ')}` });
      for (const k of enKeys) {
        const v = sets[l].get(k);
        if (v != null) allTextObjects.push({ file: t.file, line: t.obj.line, fn: t.obj.fn, table: name, key: k, langs: Object.assign({}, ...Object.keys(sets).map((x) => ({ [x]: sets[x].get(k) }))) });
      }
    }
  }

  // Language-record tables: [{ l: 'en', t: '…' }, …] — the weather card's
  // opening title. Registered ones (LANG_RECORD_TABLES) are held to all nine
  // languages; any other is a table outside the store (B2).
  const recordTables = [];
  for (const { rel, unit, isStore } of jsUnits) {
    const t = unit.toks;
    const byFrame = new Map();
    for (const o of unit.objects) {
      const f = unit.frameOf[o.open];
      if (!byFrame.has(f)) byFrame.set(f, []);
      byFrame.get(f).push(o);
    }
    for (const [i, kids] of byFrame) {
      if (i < 0 || t[i].v !== '[') continue;
      const recs = kids.filter((o) => o.keys.some((k) => k.k === 'l' && LSET.has(k.str)) && o.keys.some((k) => k.k === 't'));
      if (recs.length < 3) continue;
      const name = t[i - 1] && t[i - 1].v === '=' && t[i - 2] && t[i - 2].t === 'id' ? t[i - 2].v : '(list)';
      for (const o of recs) unit.langRecordObjs = (unit.langRecordObjs || new Set()).add(o.open);
      const reg = ((P.LANG_RECORD_TABLES || {})[rel] || {})[name];
      if (isStore) continue;
      if (!reg) { add({ check: 'B2', file: rel, line: t[i].line, fn: unit.fnAt[i], text: name, msg: 'a [{ l, t }] language list outside the store; derive it from BOARD_STR (all nine languages)' }); continue; }
      used.records.add(rel + ':' + name);
      const have = new Map(recs.map((o) => [o.keys.find((k) => k.k === 'l').str, o.keys.find((k) => k.k === 't')]));
      const missing = LANGS.filter((l) => !have.has(l));
      if (missing.length) add({ check: 'B1', file: rel, line: t[i].line, fn: null, text: name, msg: `missing ${missing.join(' ')}` });
      for (const [l, k] of have) {
        if (!k.simple || !String(k.str || '').trim()) add({ check: 'B1', file: rel, line: k.line, fn: null, text: name + ' ' + l, msg: `${l} is empty or an expression` });
        else if (RE_SCRIPT[l] && !RE_SCRIPT[l].test(k.str)) add({ check: 'B3', file: rel, line: k.line, fn: null, text: name + ' ' + l, msg: `${l} '${k.str}' has no characters of its own script` });
      }
      recordTables.push({ rel, name, langs: Object.fromEntries([...have].map(([l, k]) => [l, k.str])) });
    }
  }
  for (const r of recordTables) if (r.langs.en) allTextObjects.push({ file: r.rel, line: 0, fn: null, table: r.name, key: '(record)', langs: r.langs });

  // B2: [code, text] arrays (loader GREET) and parallel X_FR tables
  for (const { rel, unit, isStore } of jsUnits) {
    if (isStore) continue;
    const t = unit.toks;
    for (let i = 0; i < t.length; i++) {
      if (t[i].t === 'punc' && t[i].v === '[' && t[i + 1] && t[i + 1].v === '[' && t[i + 2] && t[i + 2].t === 'str' && /^(EN|FR|ES|DE|IT|PT|JA|ZH|AR|\u4E2D\u6587|\u65E5\u672C\u8A9E|\u0627\u0644\u0639\u0631\u0628\u064A\u0629)$/i.test(t[i + 2].v) && t[i + 3] && t[i + 3].v === ',' && t[i + 4] && t[i + 4].t === 'str')
        add({ check: 'B2', file: rel, line: t[i].line, fn: unit.fnAt[i], text: '[' + t[i + 2].v + ', ' + t[i + 4].v + ']', msg: 'a [language, text] list outside the store; greet in the board\'s own languages from BOARD_STR' });
      if (t[i].t === 'id' && /^_?[A-Z][A-Z0-9_]*_(FR|ES|DE|IT|PT|JA|ZH|AR)$/.test(t[i].v) && t[i + 1] && t[i + 1].v === '=' && t[i + 2] && t[i + 2].v === '{'
        && !P.NONTEXT_TABLES.some((x) => x.file === rel && x.name === t[i].v && used.nontext.add(rel + ':' + x.name)))
        add({ check: 'B2', file: rel, line: t[i].line, fn: unit.fnAt[i], text: t[i].v, msg: 'a parallel per-language table; one keyed table with all nine languages per entry' });
    }
  }

  // the store's vocabulary, by language (isBilingual, B15)
  VOCAB = new Map();
  for (const o of allTextObjects) for (const l of LANGS) {
    const v = o.langs[l];
    if (v == null) continue;
    for (const w of wordsOf(v)) { if (!VOCAB.has(w)) VOCAB.set(w, new Set()); VOCAB.get(w).add(l); }
  }
  for (const li of listObjects) for (const item of li.items) for (const w of wordsOf(item)) { if (!VOCAB.has(w)) VOCAB.set(w, new Set()); VOCAB.get(w).add(li.lang); }

  // ── B3: not left in English ──
  const sameAllowed = (en, l) => {
    const e = P.SAME_AS_ENGLISH[en];
    if (e && (e.langs || e).includes(l)) { used.same.add(en); return true; }
    return false;
  };
  const brand = (s) => {
    const k = String(s).trim();
    if (Object.prototype.hasOwnProperty.call(P.BRAND_TERMS, k)) { used.brand.add(k); return true; }
    return false;
  };
  for (const o of allTextObjects) {
    const en = o.langs.en;
    if (en == null) continue;
    const nen = norm(en);
    for (const l of LANGS) {
      const v = o.langs[l];
      if (v == null || l === 'en') continue;
      if (!RE_LETTER.test(v)) continue;
      if (RE_SCRIPT[l]) {
        if (!RE_SCRIPT[l].test(v) && !brand(v) && !sameAllowed(en, l) && !P.UNIT_TERMS.includes(v.trim()))
          add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + l, msg: `${l} '${v}' has no ${l === 'ar' ? 'Arabic' : l === 'ja' ? 'Japanese' : 'Chinese'} characters \u2014 a missed translation, or a brand name for BRAND_TERMS` });
        continue;
      }
      const nv = norm(v);
      if (nen && nv === nen && !brand(en) && !sameAllowed(en, l) && !P.UNIT_TERMS.includes(en.trim()))
        add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + l, msg: `${l} is the English '${v}' \u2014 translate it, or list it in SAME_AS_ENGLISH if it is that language's own word` });
      else if (l !== 'fr' && o.langs.fr && nv === norm(o.langs.fr) && nv !== nen && !sameAllowed(en, l))
        add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + l, msg: `${l} is the French '${v}'` });
      // the English, with something added: 'Tomorrow (morgen)'
      else if (nen.length >= 3 && nv !== nen && (' ' + nv + ' ').includes(' ' + nen + ' ') && !brand(en) && !sameAllowed(en, l) && !P.UNIT_TERMS.includes(en.trim()))
        add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + l, msg: `${l} '${v}' carries the English '${en}' inside it \u2014 translate the whole phrase` });
      // German copied from a Romance language ('Ma\u00f1ana'); a Romance copy of
      // German is the same pair seen from the other side
      else if (l === 'de') {
        for (const l2 of ['es', 'it', 'pt']) {
          if (o.langs[l2] != null && norm(o.langs[l2]) === nv && nv !== nen && !sameAllowed(en, l) && !P.UNIT_TERMS.includes(nv) && !P.UNIT_TERMS.includes(String(v).trim()))
            add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + l, msg: `de is the ${({ es: 'Spanish', it: 'Italian', pt: 'Portuguese' })[l2]} '${v}'` });
        }
      }
      // a letter the language does not write: '\u00f1' in German, '\u00e3' in Italian
      const alpha = LATIN_ALPHABET[l];
      if (alpha) {
        const bad = [...new Set((String(v).toLowerCase().match(/[\u00c0-\u024f]/g) || []).filter((ch) => !alpha.includes(ch)))];
        if (bad.length && !brand(v)) add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + l, msg: `${l} '${v}' has ${bad.map((c) => "'" + c + "'").join(' ')}, which ${LANG_NAME[l]} does not write \u2014 another language's word was pasted in` });
      }
    }
    // Chinese with Japanese kana in it is Japanese
    if (o.langs.zh != null && /[\u3040-\u30ff]/.test(o.langs.zh))
      add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' zh', msg: `zh '${o.langs.zh}' has Japanese kana \u2014 the Japanese was pasted in` });
  }
  // the ticker lists: the same per item
  for (const li of listObjects) {
    const alpha = LATIN_ALPHABET[li.lang];
    for (const item of li.items) {
      if (RE_SCRIPT[li.lang] && RE_LETTER.test(item) && !RE_SCRIPT[li.lang].test(item) && !brand(item))
        add({ check: 'B3', file: li.file, line: li.line, fn: li.fn, text: li.key + ' ' + li.lang + ' ' + shortText(item), msg: `${li.lang} item '${shortText(item)}' has no characters of its own script` });
      if (alpha) {
        const bad = [...new Set((String(item).toLowerCase().match(/[\u00c0-\u024f]/g) || []).filter((ch) => !alpha.includes(ch)))];
        if (bad.length) add({ check: 'B3', file: li.file, line: li.line, fn: li.fn, text: li.key + ' ' + li.lang + ' ' + shortText(item), msg: `${li.lang} item has ${bad.join(' ')}, which ${LANG_NAME[li.lang]} does not write` });
      }
    }
  }
  // the English list copied into another language
  {
    const byKey = new Map();
    for (const li of listObjects) { if (!byKey.has(li.file + ':' + li.key)) byKey.set(li.file + ':' + li.key, {}); byKey.get(li.file + ':' + li.key)[li.lang] = li; }
    for (const [, ls] of byKey) {
      if (!ls.en) continue;
      for (const l of LANGS) {
        if (l === 'en' || !ls[l]) continue;
        ls[l].items.forEach((item, k) => {
          const e = ls.en.items[k];
          if (e != null && norm(item) === norm(e) && RE_WORD.test(e) && !brand(e) && !sameAllowed(e, l) && !P.UNIT_TERMS.includes(String(e).trim()))
            add({ check: 'B3', file: ls[l].file, line: ls[l].line, fn: ls[l].fn, text: ls[l].key + ' ' + l + ' ' + shortText(item), msg: `${l} item ${k + 1} is the English '${shortText(e)}'` });
        });
      }
    }
  }

  // ── B4: one declaration per key, everywhere ──
  const allJs = new Set(passengerScripts.concat(passengerPages));
  for (const rel of Object.keys(P.NON_PASSENGER)) if (/\.(js|html)$/.test(rel) && !rel.startsWith('/') && exists(rel)) allJs.add(rel);
  for (const rel of (P.EXTRA_DUPLICATE_SCAN || [])) if (exists(rel)) allJs.add(rel);
  for (const rel of allJs) {
    const L = load(rel);
    for (const u of L.units) for (const o of u.objects) {
      const seen = new Map();
      for (const k of o.keys) {
        if (seen.has(k.k)) add({ check: 'B4', file: rel, line: k.line, fn: o.fn, text: (o.parent.concat(o.name || '?')).join('.') + '.' + k.k, msg: `'${k.k}' is declared twice in ${o.name || 'an object'} (lines ${seen.get(k.k)} and ${k.line}); the later one silently wins` });
        else seen.set(k.k, k.line);
      }
    }
  }
  // no key in two stores one helper reads
  if (entries.STR) {
    for (const legacy of ['LS', 'SS', '_GATE_LBL']) {
      if (!entries[legacy]) continue;
      for (const k of entries.STR.keys()) if (entries[legacy].has(k)) add({ check: 'B4', file: P.STORE_FILE, line: entries.STR.get(k).line, fn: null, text: 'STR.' + k + ' and ' + legacy + '.' + k, msg: `'${k}' is in BOARD_STR and in ${legacy}; a key lives in one table (delete it from ${legacy})` });
    }
  }

  // ── L1: frozen legacy key sets ──
  const frozenPath = options.frozenPath || path.join(__dirname, 'legacy-keys.json');
  const frozen = options.frozen || (fs.existsSync(frozenPath) ? JSON.parse(fs.readFileSync(frozenPath, 'utf8')) : null);
  if (frozen) {
    for (const [name, keys] of Object.entries(frozen)) {
      if (!entries[name]) continue;
      const allowed = new Set(keys);
      for (const [k, e] of entries[name]) if (!allowed.has(k)) add({ check: 'L1', file: tables[name].file, line: e.line, fn: null, text: name + '.' + k, msg: `${name} is frozen: add '${k}' to BOARD_STR in fids-current/js/board-strings.js (its helpers fall through to it)` });
    }
  }

  // ── B6: keys exist ──
  const helperTables = P.KEY_HELPERS;
  for (const { rel, unit, isStore } of jsUnits) {
    if (isStore) continue;
    const t = unit.toks;
    for (let i = 0; i < t.length - 2; i++) {
      if (t[i].t !== 'id' || !t[i + 1] || t[i + 1].v !== '(' || !t[i + 2] || t[i + 2].t !== 'str') continue;
      if (t[i - 1] && t[i - 1].v === 'function') continue;
      // BoardStrings.fmt('k'), window.bs('k'): the store's own methods
      const viaStore = t[i - 1] && t[i - 1].v === '.' && t[i - 2] && /^(BoardStrings|Strings|window|self|globalThis|root)$/.test(t[i - 2].v);
      if (t[i - 1] && t[i - 1].v === '.' && !viaStore) continue;
      // T/TU/TF are different helpers in different files: the policy names
      // the file a helper belongs to when the name is shared
      const scoped = (P.KEY_HELPERS_BY_FILE || {})[rel] || {};
      const tbls = (!viaStore && scoped[t[i].v]) || (viaStore ? STORE_METHODS[t[i].v] : helperTables[t[i].v]);
      if (!tbls) continue;
      if (t[i + 3] && t[i + 3].v === '+') continue;          // a computed key: 'st-' + state
      const key = t[i + 2].v;
      const ok = tbls.some((name) => (entries[name] && entries[name].has(key)) || (majorKeys[name] && majorKeys[name].has(key)));
      if (!ok && !brand(key)) add({ check: 'B6', file: rel, line: t[i].line, fn: unit.fnAt[i], text: t[i].v + "('" + key + "')", msg: `'${key}' is not in ${tbls.join(' or ')} \u2014 it renders blank (or, before, its raw key name)` });
    }
  }
  // ad copy: every GATE_ADS headline/sub is translated
  if (entries.AD_I18N) {
    for (const { rel, unit, isStore } of jsUnits) {
      if (isStore) continue;
      for (const o of unit.objects) {
        if (!(o.parent.concat(o.name || '')).some((n) => /^GATE_ADS/.test(n))) continue;
        for (const k of o.keys) {
          if (!['headline', 'sub', 'title', 'body', 'cta'].includes(k.k) || k.str == null) continue;
          const s = k.str.trim();
          if (!s || entries.AD_I18N.has(s) || brand(s)) continue;
          add({ check: 'B6', file: rel, line: k.line, fn: o.fn, text: s, msg: `ad copy with no AD_I18N row \u2014 add its eight translations, or list it in BRAND_TERMS if it is a brand name` });
        }
      }
    }
  }

  // ── B7: one translation per phrase ──
  const byPhrase = new Map();
  for (const o of allTextObjects) {
    const en = o.langs.en;
    if (!en || !RE_WORD.test(en)) continue;
    if (P.DECISION_FILES && P.DECISION_FILES[o.file]) continue;   // its wording waits on a decision
    const k = norm(en) + '|' + (o.ctx || '');
    if (!byPhrase.has(k)) byPhrase.set(k, []);
    byPhrase.get(k).push(o);
  }
  for (const [k, list] of byPhrase) {
    if (list.length < 2) continue;
    const diffs = [];
    for (const l of LANGS) {
      if (l === 'en') continue;
      const vs = new Set(list.map((o) => o.langs[l]).filter((v) => v != null).map((v) => norm(v)));
      if (vs.size > 1) diffs.push(l);
    }
    if (diffs.length) {
      const first = list[0];
      // one finding per phrase, whichever table it is first met in: the id
      // must not move when a table is deleted or reordered
      add({ check: 'B7', file: '*', line: 0, fn: null, text: norm(first.langs.en), msg: `'${first.langs.en}' is translated differently in ${list.map((o) => o.table + '.' + o.key).join(', ')} (${diffs.join(' ')}); reuse one wording, or separate the meanings with $ctx` });
    }
  }

  // ── the data vocabulary (B15): every word of a data table's values ──
  DATA_VOCAB = new Set();
  const addData = (str) => { for (const w of wordsOf(str)) DATA_VOCAB.add(w); };
  for (const { rel, unit } of jsUnits) {
    const names = Object.keys((P.DATA_TABLES || {})[rel] || {}).concat(P.NONTEXT_TABLES.filter((n) => n.file === rel && n.name).map((n) => n.name));
    for (const name of names) {
      const r = dataRange(unit, name);
      if (!r) continue;
      for (let j = r[0]; j < r[1]; j++) if (unit.toks[j].t === 'str' || unit.toks[j].t === 'tpl') addData(unit.toks[j].v);
    }
  }
  for (const k of Object.keys(P.BRAND_TERMS)) addData(k);
  for (const k of (P.DATA_WORDS || [])) addData(k);

  // ── B5, B8, B9 (attr), B11, B13, B15: token walks ──
  const knownPhrases = new Map();      // norm(en) -> en, from the stores
  for (const name of Object.keys(entries)) for (const [, e] of entries[name]) {
    const en = e.langs.en && e.langs.en.value;
    if (en && RE_WORD.test(en) && (/^[A-Z]/.test(en.trim()) || /\s/.test(en.trim())) && norm(en).length > 2) knownPhrases.set(norm(en), en);
  }
  const contentAttrs = new Set();
  const cssFiles = P.PASSENGER_STYLES.filter(exists);
  const cssTexts = cssFiles.map((rel) => ({ rel, css: read(rel) }));
  for (const page of passengerPages) {
    const html = read(page);
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) cssTexts.push({ rel: page, css: m[1], offset: lineOf(html, m[0]) - 1 });
  }
  for (const { css } of cssTexts) for (const m of css.matchAll(/content\s*:\s*[^;]*attr\(\s*(data-[\w-]+)/g)) contentAttrs.add(m[1]);

  const opFns = P.OPERATOR_FUNCTIONS;
  // An operator function is named by its own name, or by its path when the
  // name alone is ambiguous ('manageCustomBgUrls>render' is not the board's
  // render()). Every function inside it is operator UI too.
  const fnIsOperator = (rel, fn, fnPath) => {
    const list = opFns[rel];
    if (!list || !fn) return false;
    const parts = String(fnPath || fn).split('>');
    for (let a = 0; a < parts.length; a++) {
      for (let b = a; b < parts.length; b++) {
        const name = parts.slice(a, b + 1).join('>');
        if (Object.prototype.hasOwnProperty.call(list, name)) { used.op.add(rel + ':' + name); return true; }
      }
    }
    return false;
  };
  const fnSeen = new Map();            // rel -> Set(fn names) for P1 staleness
  for (const { rel, unit, isStore } of jsUnits) {
    if (!fnSeen.has(rel)) fnSeen.set(rel, new Set());
    for (const f of unit.fnPathAt) if (f) { const parts = f.split('>'); for (let a = 0; a < parts.length; a++) for (let b = a; b < parts.length; b++) fnSeen.get(rel).add(parts.slice(a, b + 1).join('>')); }
    if (isStore) continue;
    walkMarkup(rel, unit);
    walkLanguageChoice(rel, unit);
  }

  function walkMarkup(rel, unit) {
    const t = unit.toks;
    const n = t.length;
    // the registered tables in this unit: their values are the store, not markup
    const ranges = Object.values(tables).filter((x) => x.unit === unit).map((x) => [x.obj.open, x.obj.close]);
    for (const name of Object.keys((P.DATA_TABLES || {})[rel] || {})) {
      const r = dataRange(unit, name);
      if (r) { ranges.push(r); used.data.add(rel + ':' + name); }
    }
    const inTable = (i) => ranges.some((r) => i > r[0] && i < r[1]);
    // Text sinks open over a whole expression: `el.textContent = x ? 'Gate
    // closes' : ''` puts the literal on screen as surely as a direct one.
    // { depth, name, check, arg } — arg: the one argument that is text
    const sinks = [];
    // function bodies and blocks opened inside a sink's expression are not
    // its text (`innerHTML = rows.map(function (r) { var cls = 'a'; … })`)
    const blocks = [];
    const sinkAt = (i) => {
      const inner = blocks.length ? blocks[blocks.length - 1] : 0;
      for (let k = sinks.length - 1; k >= 0; k--) {
        const s = sinks[k];
        if (frames.length < s.depth) continue;
        if (inner > s.depth) continue;
        if (s.open != null && s.arg != null && argIndexAtDepth(t, i, unit, s.open) !== s.arg) continue;
        return s;
      }
      return null;
    };
    const dropSinks = () => {
      while (sinks.length && sinks[sinks.length - 1].depth > frames.length) sinks.pop();
      while (blocks.length && blocks[blocks.length - 1] > frames.length) blocks.pop();
    };
    // per-frame HTML state; a chain is reset at expression boundaries
    // Each frame (bracket level) carries the HTML state of the chain being
    // built in it. `entry` is the state the frame was opened in (a ( or ${
    // inside a markup chain inherits it), and a ternary or logical operand
    // restarts from it; a statement boundary (; , = return) ends the chain.
    const frames = [{ st: null, entry: null, tag: false, pend: [], pend8: [], saved: null }];
    const varState = new Map();
    let assignTarget = null;
    const top = () => frames[frames.length - 1];
    // A chain that ends without becoming markup: its English sentences and
    // known labels are still reported; its other words are not markup text.
    const endChain = (f) => { for (const r of f.pend8) add(r); for (const r of f.pend) { if (r.sentence) add(r.sentence); else if (r.label) add(r.label); } f.pend8 = []; f.pend = []; };
    const plainRec = (r) => { const x = Object.assign({}, r); delete x.sentence; delete x.label; return x; };
    // an assignment to a property that is text on screen
    function openAssignSink(i) {
      const p1 = t[i - 1], p2 = t[i - 2];
      if (!p1 || p1.t !== 'id' || !p2 || p2.v !== '.') return;
      // document.title is the browser tab, not the screen
      if (p1.v === 'title' && t[i - 3] && t[i - 3].v === 'document') return;
      // a stylesheet's text (style.textContent = '.row { … }') is CSS
      const fr0 = unit.frameOf[i];
      for (let j = i + 1; j < n; j++) {
        if (unit.frameOf[j] === fr0 && (t[j].v === ';' || t[j].v === ',')) break;
        if (unit.frameOf[j] !== fr0 && (unit.frameOf[j] == null || unit.frameOf[j] < fr0)) break;
        if ((t[j].t === 'str' || t[j].t === 'tpl') && (CSS_LIKE.test(t[j].v) || CODE_LIKE.test(t[j].v) || /\{\s*[a-z-]+\s*:|^\s*[.#][\w-]+\s*$/.test(t[j].v))) return;
      }
      if (SINK_PROPS.has(p1.v)) { sinks.push({ depth: frames.length, name: p1.v, check: 'B5', arg: undefined }); return; }
      // el.dataset.baremsg = …  where [data-baremsg] is drawn by content: attr()
      if (t[i - 3] && t[i - 3].v === 'dataset') {
        const attr = 'data-' + p1.v.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        if (contentAttrs.has(attr)) sinks.push({ depth: frames.length, name: attr, check: 'B9', arg: undefined });
      }
    }
    const reset = (f) => { endChain(f); f.st = null; f.entry = null; f.tag = false; };
    const restart = (f) => { f.st = f.entry; };
    for (let i = 0; i < n; i++) {
      const tk = t[i];
      if (tk.t === 'punc') {
        if (tk.v === '(' || tk.v === '[' || tk.v === '{' || tk.v === '${') {
          const parent = top();
          const inherit = tk.v === '${' || (tk.v === '(' && !(t[i - 1] && (t[i - 1].t === 'id' || t[i - 1].v === ')' || t[i - 1].v === ']')));
          const st = inherit ? parent.st : null;
          frames.push({ st, entry: st, tag: inherit ? parent.tag : false, pend: [], pend8: [], saved: null, parent: inherit ? parent : null });
          if (tk.v === '{' && !unit.isObj[i]) blocks.push(frames.length);
          // a call whose arguments are put on screen: el.append('…')
          if (tk.v === '(' && t[i - 1] && t[i - 1].t === 'id' && CALL_SINKS[t[i - 1].v] !== undefined
              && (t[i - 2] && t[i - 2].v === '.' || /^(createTextNode)$/.test(t[i - 1].v)))
            sinks.push({ depth: frames.length, open: i, name: t[i - 1].v + '()', check: 'B5', arg: CALL_SINKS[t[i - 1].v] });   // arg null: every argument
          continue;
        }
        if (tk.v === ')' || tk.v === ']' || tk.v === '}' || tk.v === '}$') {
          const f = frames.pop();
          if (f && f.parent) {
            if (f.tag && !f.parent.tag) { f.parent.tag = true; flushPending(f.parent); }
            if (f.parent.tag) { for (const r of f.pend) add(plainRec(r)); f.pend8 = []; }
            else { f.parent.pend.push(...f.pend); f.parent.pend8.push(...f.pend8); }
          } else if (f) endChain(f);
          if (frames.length === 0) frames.push({ st: null, entry: null, tag: false, pend: [], pend8: [], saved: null });
          dropSinks();
          continue;
        }
        if (tk.v === '+') continue;
        if (tk.v === '+=') {
          const tgt = t[i - 1] && t[i - 1].t === 'id' ? t[i - 1].v : null;
          const f = top();
          const sv = tgt && varState.get(tgt);
          f.st = sv ? sv.st : null; f.tag = sv ? sv.tag : false; f.pend = [];
          assignTarget = tgt;
          openAssignSink(i);
          continue;
        }
        if (tk.v === '?') { const f = top(); f.saved = true; restart(f); continue; }
        if (tk.v === ':' && top().saved) { const f = top(); f.saved = false; restart(f); continue; }
        if (['&&', '||', '??', '==', '===', '!=', '!=='].includes(tk.v)) { restart(top()); continue; }
        if ([';', ',', '=', '=>', ':', '||=', '??=', '&&='].includes(tk.v)) {
          const f = top();
          if (assignTarget && (tk.v === ';' || tk.v === ',')) varState.set(assignTarget, { st: f.st, tag: f.tag });
          if (tk.v === ';' || tk.v === ',') assignTarget = null;
          if (tk.v === '=' && t[i - 1] && t[i - 1].t === 'id') assignTarget = t[i - 1].v;
          reset(f);
          if (tk.v === ';' || (tk.v === ',' && !(t[frameOpen(unit, i)] && t[frameOpen(unit, i)].v === '('))) {
            while (sinks.length && sinks[sinks.length - 1].depth >= frames.length && sinks[sinks.length - 1].open == null) sinks.pop();
          }
          if (tk.v === '=' || tk.v === '||=' || tk.v === '??=' || tk.v === '&&=') openAssignSink(i);
          continue;
        }
        continue;
      }
      if (tk.t === 'id' && (tk.v === 'return' || tk.v === 'case')) { reset(top()); continue; }
      if (tk.t !== 'str' && tk.t !== 'tpl') continue;
      const f = top();
      let ctx = literalContext(t, i, unit);
      if (t[i - 1] && t[i - 1].v === ':' && t[i - 2] && t[i - 2].v === 't' && unit.langRecordObjs && unit.langRecordObjs.has(unit.frameOf[i])) ctx = 'langvalue';
      if (dataKeyOf(t, i, unit)) ctx = 'excluded';
      const fn = unit.fnAt[i];
      const isOp = fnIsOperator(rel, fn, unit.fnPathAt[i]);
      // setAttribute('title' | 'data-baremsg', 'Words') — the value is text
      if (!isOp && ctx === 'excluded' && !inTable(i)) {
        const fr0 = unit.frameOf[i];
        if (fr0 >= 0 && t[fr0].v === '(' && t[fr0 - 1] && t[fr0 - 1].v === 'setAttribute' && argIndex(t, i, unit) === 1 && t[fr0 + 1] && t[fr0 + 1].t === 'str') {
          const an = String(t[fr0 + 1].v).toLowerCase();
          const plainS = stripEntities(stripTags(tk.v)).trim();
          if ((TEXT_ATTRS.has(an) || contentAttrs.has(an)) && countsAsWords(plainS))
            add({ check: contentAttrs.has(an) ? 'B9' : 'B5', file: rel, line: tk.line, fn, text: an + '=' + plainS, msg: contentAttrs.has(an)
              ? `${an} is drawn by CSS content: attr(), so its words are passenger text \u2014 put them in the store and render them as markup`
              : `'${shortText(plainS)}' is put into a ${an} attribute \u2014 render it from the store` });
        }
      }
      // object keys and table values are not markup
      if (ctx === 'key' || ctx === 'langvalue' || ctx === 'compare' || ctx === 'excluded' || inTable(i)) continue;
      // ad copy is written in English and translated at render by adTL
      // through AD_I18N (B6 holds every GATE_ADS line to having a row)
      if (entries.AD_I18N && entries.AD_I18N.has(tk.v.trim())) continue;
      // a literal inside an open text sink: an assignment's whole right-hand
      // side (`el.textContent = x ? 'Gate closes' : ''`), or the text
      // argument of a call that puts text on screen (`el.append('…')`)
      // (a bare identifier passed to a call is a key: _bidsHdr('flight'))
      const keyArg = /^[A-Za-z][A-Za-z0-9_:-]*$/.test(tk.v) && unit.frameOf[i] >= 0 && t[unit.frameOf[i]].v === '(' && t[unit.frameOf[i] - 1] && t[unit.frameOf[i] - 1].t === 'id' && !CALL_SINKS.hasOwnProperty(t[unit.frameOf[i] - 1].v);
      const sk = !isOp && ctx === 'plain' && !keyArg ? sinkAt(i) : null;
      const adKey = entries.AD_I18N && entries.AD_I18N.has(tk.v.trim());
      // markup assigned to innerHTML is markup even with no tag in it
      if (sk && HTML_SINKS.has(sk.name) && !adKey) f.tag = true;
      // lex this literal from the frame's state (CSS text in a style element
      // or attribute keeps the chain's state but is never reported)
      const res = lexHtml(tk.v, f.st);
      if (sk && !HTML_SINKS.has(sk.name) && !adKey) {
        const plainS = stripEntities(stripTags(tk.v)).trim();
        const ok = sk.arg === undefined ? countsAsWords(plainS) : (isLabel(plainS) || isSentence(plainS));
        if (ok && !CSS_LIKE.test(tk.v) && !CODE_LIKE.test(tk.v)) add({ check: sk.check, file: rel, line: tk.line, fn, text: plainS, msg: sk.check === 'B9'
          ? `'${shortText(plainS)}' goes into ${sk.name}, which CSS draws with content: attr() \u2014 put the words in the store and render them as markup`
          : `'${shortText(plainS)}' is put into ${sk.name} \u2014 render it from the store` });
      }
      if (res.tag) f.tag = true;
      f.st = res.st;
      const cssLike = CSS_LIKE.test(tk.v);
      const runs = cssLike ? [] : res.text.map((r) => r.trim()).filter((r) => countsAsWords(r));
      const attrRuns = res.attrs.filter((a) => contentAttrs.has(a.name) && RE_WORD.test(a.value));
      if (!isOp) {
        for (const a of attrRuns) add({ check: 'B9', file: rel, line: tk.line, fn, text: a.name + '=' + a.value, msg: `${a.name} is drawn by CSS content: attr(), so its words are passenger text \u2014 put them in the store and render them as markup` });
        // attributes a passenger reads: placeholder, title, alt, aria-label…
        for (const a of res.attrs) {
          if (!(TEXT_ATTRS.has(a.name) || (a.name === 'value' && /^(input|button|option)$/i.test(a.tag || ''))) || !countsAsWords(a.value.trim())) continue;
          add({ check: 'B5', file: rel, line: tk.line, fn, text: a.name + '=' + a.value.trim(), msg: `'${shortText(a.value)}' is written into a ${a.name} attribute \u2014 render it from the store (bs(), or bsPair({ plain: true }))` });
        }
        // a language half built by hand: <span lang="fr">…
        for (const a of res.attrs) {
          if (a.name === 'lang' && LSET.has(a.value.trim()) && !a.open)
            add({ check: 'B5', file: rel, line: tk.line, fn, text: 'lang="' + a.value.trim() + '"', msg: `a ${a.value.trim()} half built by hand; the store's helpers (bsPair, BoardStrings.half/markHalf with a key) mark halves, and choose their words` });
        }
        for (const r of runs) {
          const rec = { check: 'B5', file: rel, line: tk.line, fn, text: r, msg: `'${shortText(r)}' is written into markup \u2014 add a key to BOARD_STR (board-strings.js) with all nine languages and render it with bs()/bsPair()` };
          if (f.tag || res.tag) add(rec);
          else {
            rec.sentence = ctx === 'plain' && isSentence(r) ? { check: 'B5', file: rel, line: tk.line, fn, text: r, msg: `'${shortText(r)}' is an English sentence in passenger code \u2014 it belongs in the store` } : null;
            rec.label = !rec.sentence && ctx === 'plain' && isLabel(r) ? { check: 'B15', file: rel, line: tk.line, fn, text: r, msg: `'${shortText(r)}' is a passenger word kept outside the store \u2014 in a variable, a property, a list or a return value it reaches the screen all the same. Add it to BOARD_STR (board-strings.js) with all nine languages and render it with bs()/bsPair()` } : null;
            f.pend.push(rec);
          }
        }
        if (f.tag && f.pend.length) flushPending(f);
      }
      if (isOp) continue;
      const plain = stripEntities(stripTags(tk.v));
      // a literal put straight into a text sink
      const sink = sinkBefore(t, i);
      if (sink && !res.tag && !cssLike && countsAsWords(plain.trim())) add({ check: 'B5', file: rel, line: tk.line, fn, text: plain.trim(), msg: `'${shortText(plain)}' is put into ${sink} \u2014 render it from the store` });
      // a fallback after a label helper:  TL('x') || 'Text'
      if (t[i - 1] && t[i - 1].v === '||' && t[i - 2] && t[i - 2].v === ')' && RE_WORD.test(plain)) {
        const callee = calleeOfClose(t, i - 2);
        if (callee && /^(TL|TLF|SL|_gateLbl\w*|_g8Sign\w*|adTL|fidsT|tioLabel|bs|bsPair|bsFmt)$/.test(callee))
          add({ check: 'B5', file: rel, line: tk.line, fn, text: plain.trim(), msg: `a literal fallback after ${callee}() shows English whenever the key is missing; the key must exist instead (B6)` });
      }
      // a bilingual literal  "X | Y"
      if (ctx !== 'compare' && isBilingual(plain))
        add({ check: 'B5', file: rel, line: tk.line, fn, text: plain.trim(), msg: 'a hard-coded language pair; pairs come from bsPair() with the board\'s own languages' });
      // B8: a known label phrase as a literal outside markup (in markup it
      // is B5 already)
      const np = norm(tk.v);
      if (ctx === 'plain' && knownPhrases.has(np) && /^\s*[A-Z]|\S\s+\S/.test(tk.v) && !sink && !res.tag && !f.tag) {
        const rec = { check: 'B8', file: rel, line: tk.line, fn, text: tk.v.trim(), msg: `'${shortText(tk.v)}' is a label the store already translates (${knownPhrases.get(np)}) \u2014 use the helper, not the English` };
        f.pend8.push(rec);
        // the pending B5 record for the same literal gives way to it
        f.pend = f.pend.filter((r) => r.line !== tk.line || norm(r.text) !== np);
      }
    }
    endChain(frames[0]);
    function flushPending(f) {
      for (const r of f.pend) add(plainRec(r));
      f.pend = [];
      f.pend8 = [];
    }
  }

  function countsAsWords(r) {
    if (!r) return false;
    const s = stripEntities(r).replace(/\{[A-Za-z0-9_]+\}/g, ' ').trim();
    if (!RE_WORD.test(s)) return false;
    if (brand(s)) return false;
    const words = s.split(/[\s\u00A0\u202F]+/).filter(Boolean);
    const real = words.filter((w) => {
      const x = w.replace(/^[^\p{L}\p{N}\u00B0%]+|[^\p{L}\p{N}\u00B0%]+$/gu, '');
      if (!x) return false;
      if (!RE_WORD.test(x)) return false;
      if (P.UNIT_TERMS.includes(x) || P.UNIT_TERMS.includes(x.toLowerCase())) return false;
      if (/^[A-Z0-9]{2,3}$/.test(x)) return false;                 // codes: YQM, AC, km
      if (/^[A-Z]{1,3}\d+[A-Z]?$/.test(x)) return false;             // flight numbers
      if (brand(x)) return false;
      return true;
    });
    return real.length > 0;
  }

  // 'Gate closes | Fermeture', with or without spaces, any space (a
  // non-breaking one too), and '/', '\u00B7' or '\u2022' when the two sides are two
  // languages' words: the store's own vocabulary tells which language a
  // side's words belong to.
  function isBilingual(s) {
    if (s.length > 400) return false;
    const x = stripEntities(stripTags(s));
    const W = '[A-Za-z\\u00C0-\\u024F\\u0600-\\u06FF\\u3040-\\u30FF\\u3400-\\u9FFF]';
    const m = new RegExp('(' + W + '{2,}[^|/\\u00B7\\u2022]{0,60}?)[\\s\\u00A0\\u202F]*([|/\\u00B7\\u2022])[\\s\\u00A0\\u202F]*([^|/\\u00B7\\u2022]{0,60}' + W + '{2,})').exec(x);
    if (!m) return false;
    if (m[2] === '|') return true;
    // '/' or '\u00B7': only when one side is another language's words
    const a = langsOfWords(m[1]), b = langsOfWords(m[3]);
    if (!a.size || !b.size) return false;
    for (const l of a) if (b.has(l)) return false;
    return true;
  }
  function langsOfWords(side) {
    // the languages whose own vocabulary (and no other's) holds a word here
    const out = new Set();
    if (/[\u0600-\u06FF]/.test(side)) out.add('ar');
    if (/[\u3040-\u30FF]/.test(side)) out.add('ja');
    for (const w of wordsOf(side)) {
      const ls = VOCAB.get(w);
      if (ls) for (const l of ls) out.add(l);
    }
    return out;
  }

  // A literal shaped like a label a passenger reads — a Capitalised or
  // CAPITALISED word, two words or more, a word only another board language
  // uses ('fermeture'), or Japanese, Chinese or Arabic — with at least one
  // word that is not data (a city, an airport, an airline, an aircraft, a
  // brand, a unit or a code).
  function isLabel(r) {
    const x = stripEntities(stripTags(String(r).replace(RE_INVISIBLE_G, ''))).replace(/\{[A-Za-z0-9_]+\}|%[a-z]\b/g, ' ').trim();
    if (!x || x.length > 600) return false;
    if (CSS_LIKE.test(x) || CODE_LIKE.test(x) || CODE_LIKE2.test(x)) return false;
    if (brand(x)) return false;
    if (/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\u0600-\u06FF]/.test(x)) return true;
    const raw = x.split(/[\s\u00A0\u202F]+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter((w) => /\p{L}{2,}/u.test(w));
    if (!raw.length) return false;
    // identifiers: camelCase, snake_case, kebab-case, dotted, paths
    const isIdent = (w) => /^[a-z]+[A-Z][A-Za-z0-9]*$|_|^[a-z0-9]+(-[a-z0-9]+)+$|^[\w-]+\.[\w.-]+$|\//.test(w);
    const words = raw.filter((w) => !isIdent(w));
    if (!words.length) return false;
    const notData = words.filter((w) => {
      if (/^[A-Z0-9]{2,3}$/.test(w) || /^[A-Z]{1,3}\d+[A-Z]?$/.test(w) || /^\d/.test(w)) return false;
      if (P.UNIT_TERMS.includes(w) || P.UNIT_TERMS.includes(w.toLowerCase())) return false;
      const lw = w.toLowerCase();
      if (DATA_VOCAB.has(lw)) return false;
      if (brand(w)) return false;
      return true;
    });
    if (!notData.length) return false;
    const cap = words.some((w) => /^\p{Lu}\p{Ll}{2,}/u.test(w) && !/^\p{Lu}\p{Ll}+\p{Lu}/u.test(w));
    const caps = words.some((w) => /^\p{Lu}{4,}$/u.test(w));
    const phrase = words.length >= 2 && /\p{L}{2,}[\s\u00A0\u202F]+\p{L}{2,}/u.test(x);
    const foreign = words.some((w) => { const ls = VOCAB.get(w.toLowerCase()); return w.length >= 4 && ls && !ls.has('en'); });
    return cap || caps || phrase || foreign;
  }

  function isSentence(s) {
    const x = s.trim().split(/\s+/).filter((w) => !/^[A-Z0-9]{2,3}$/.test(w)).join(' ');
    if (/[{};]|=>|function\b|\bvar\(|px\b|rgba?\(|https?:|\.(png|svg|jpg|js|css|json|mp4)\b|^[#.\[]|\$\{|^\w+-\w+$/.test(x)) return false;
    const words = x.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'\u2019]*[.,:!?\u2026]?$/.test(w));
    if (words.length < 2) return false;
    if (words.length < x.split(/\s+/).length * 0.6) return false;
    return words.some((w) => FUNCTION_WORDS.has(w.replace(/[.,:!?\u2026]$/, '').toLowerCase()));
  }

  function walkLanguageChoice(rel, unit) {
    const t = unit.toks;
    const n = t.length;
    for (let i = 0; i < n; i++) {
      const tk = t[i];
      const fn = unit.fnAt[i];
      // lang === 'xx' ? …   /  'xx' === lang ? …
      if (tk.t === 'str' && LSET.has(tk.v)) {
        const p = t[i - 1], nx = t[i + 1];
        const cmpBefore = p && /^[!=]==?$/.test(p.v);
        const cmpAfter = nx && /^[!=]==?$/.test(nx.v);
        if (cmpBefore || cmpAfter) {
          // within the next few tokens, a ? (or &&) choosing a string — out
          // through any parentheses: (lang === 'fr') ? 'Fermeture' : …
          let j = i + (cmpAfter ? 2 : 1), d = 0;
          for (; j < Math.min(n, i + 12); j++) {
            if (t[j].v === '(' || t[j].v === '[') d++;
            else if (t[j].v === ')' || t[j].v === ']') { if (d > 0) d--; }
            else if (d === 0 && (t[j].v === '?' || t[j].v === '&&')) break;
            else if (t[j].v === ';' || t[j].v === '{' || (d === 0 && t[j].v === ',')) { j = n; break; }
          }
          if (j < n && (t[j].v === '?' || t[j].v === '&&') && t[j + 1] && (t[j + 1].t === 'str' || t[j + 1].t === 'tpl') && RE_WORD.test(t[j + 1].v) && !LANG_CODE_RE.test(t[j + 1].v.trim()))
            add({ check: 'B11', file: rel, line: tk.line, fn, text: "=== '" + tk.v + "' ?", msg: `a word chosen by comparing the language; per-language words live in the store (bs/bsPair) and per-language settings in BoardStrings.META` });
          // … or an if-statement whose body picks a word: if (lang === 'fr') x = 'Fermeture'
          if (j >= n) {
            let k = i, dd = 0;
            for (; k > Math.max(0, i - 8); k--) { if (t[k].v === ')') dd++; else if (t[k].v === '(') { if (dd === 0) break; dd--; } }
            if (t[k] && t[k].v === '(' && t[k - 1] && t[k - 1].v === 'if' && unit.closeOf[k]) {
              const c = unit.closeOf[k];
              for (let m = c + 1; m < Math.min(n, c + 8); m++) {
                if (t[m].v === ';' || t[m].v === '}') break;
                if ((t[m].t === 'str' || t[m].t === 'tpl') && (isLabel(t[m].v) || isSentence(t[m].v)) && literalContext(t, m, unit) === 'plain') {
                  add({ check: 'B11', file: rel, line: tk.line, fn, text: "if (=== '" + tk.v + "')", msg: 'a word chosen by comparing the language; per-language words live in the store (bs/bsPair)' });
                  break;
                }
              }
            }
          }
        }
      }
      // switch (lang) { case 'fr': … }
      if (tk.t === 'id' && tk.v === 'case' && t[i + 1] && t[i + 1].t === 'str' && LSET.has(t[i + 1].v) && t[i + 2] && t[i + 2].v === ':') {
        add({ check: 'B11', file: rel, line: tk.line, fn, text: "case '" + t[i + 1].v + "':", msg: 'a branch per language; per-language words live in the store (bs/bsPair) and per-language settings in BoardStrings.META' });
      }
      // ['fr', 'es'].includes(lang) ? … — a private set of languages
      if (tk.t === 'punc' && tk.v === '[' && unit.closeOf[i] && t[unit.closeOf[i] + 1] && t[unit.closeOf[i] + 1].v === '.' && t[unit.closeOf[i] + 2] && /^(includes|indexOf)$/.test(t[unit.closeOf[i] + 2].v)) {
        const close = unit.closeOf[i];
        let codes = 0, others = 0;
        for (let j = i + 1; j < close; j++) { if (unit.frameOf[j] !== i) continue; if (t[j].t === 'str' && LSET.has(t[j].v)) codes++; else if (t[j].v !== ',') others++; }
        if (codes >= 1 && codes < 3 && others === 0) add({ check: 'B11', file: rel, line: tk.line, fn, text: '[' + codes + ' language codes].includes', msg: 'a private set of languages; a per-language setting lives in BoardStrings.META, a per-language word in the store' });
      }
      // a language picked by its position: langs[1], boardLangs()[0]
      if (tk.t === 'id' && tk.v === 'langs' && t[i + 1] && t[i + 1].v === '[' && t[i + 2] && t[i + 2].t === 'num' && t[i + 3] && t[i + 3].v === ']' && !(t[i - 1] && t[i - 1].v === '.')) {
        const owners = P.LANG_POSITION_FUNCTIONS && P.LANG_POSITION_FUNCTIONS[rel] || {};
        if (fn && Object.prototype.hasOwnProperty.call(owners, fn)) used.position.add(rel + ':' + fn);
        else add({ check: 'B11', file: rel, line: tk.line, fn, text: 'langs[' + t[i + 2].v + ']', msg: 'a language picked by its position; the pair is bsPairLangs(langs, iata) (the Québec rule), the language on screen is `lang`' });
      }
      // an English fallback: o[lang] || o.en — the missing language shows English
      if (tk.t === 'punc' && (tk.v === '||' || tk.v === '??') && t[i + 1] && t[i + 1].t === 'id' && t[i + 2] && t[i + 2].v === '.' && t[i + 3] && t[i + 3].v === 'en' && !(t[i + 4] && t[i + 4].v === '(')) {
        add({ check: 'B11', file: rel, line: tk.line, fn, text: '|| ' + t[i + 1].v + '.en', msg: 'an English fallback: a missing language shows English. Every entry has all nine (B1); render the language asked for, or nothing' });
      }
      if (tk.t === 'punc' && (tk.v === '||' || tk.v === '??') && t[i + 1] && t[i + 1].t === 'id' && t[i + 2] && t[i + 2].v === '[' && t[i + 3] && t[i + 3].t === 'str' && t[i + 3].v === 'en' && t[i + 4] && t[i + 4].v === ']') {
        add({ check: 'B11', file: rel, line: tk.line, fn, text: "|| " + t[i + 1].v + "['en']", msg: 'an English fallback: a missing language shows English' });
      }
      // _frF ? 'x' : 'y'
      if (tk.t === 'id' && /^_?fr(F|First|Fst)\d*$|^_?frF\w*$/.test(tk.v) && t[i + 1] && t[i + 1].v === '?' && t[i + 2] && (t[i + 2].t === 'str' || t[i + 2].t === 'tpl') && RE_WORD.test(t[i + 2].v))
        add({ check: 'B11', file: rel, line: tk.line, fn, text: tk.v + ' ?', msg: 'French-first only reorders a pair; it never chooses a word (bsPair does both halves)' });
      // boardLangsFor(…)[1]
      if (tk.t === 'id' && tk.v === 'boardLangsFor' && t[i + 1] && t[i + 1].v === '(') {
        const close = unit.closeOf[i + 1];
        if (close && t[close + 1] && t[close + 1].v === '[') add({ check: 'B11', file: rel, line: tk.line, fn, text: 'boardLangsFor()[]', msg: 'the airport default is not the board\'s languages; use bsPairLangs(langs)' });
      }
      // langs.slice(0, 2)
      if (tk.t === 'id' && /^langs$/.test(tk.v) && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && t[i + 2].v === 'slice' && t[i + 4] && t[i + 4].v === '0' && t[i + 6] && t[i + 6].v === '2')
        add({ check: 'B11', file: rel, line: tk.line, fn, text: 'langs.slice(0, 2)', msg: 'the pair\'s languages come from bsPairLangs(langs, iata), which also applies the Qu\u00E9bec rule' });
      // a literal locale or hour12
      if (tk.t === 'id' && /^(toLocaleTimeString|toLocaleDateString|toLocaleString|DateTimeFormat)$/.test(tk.v) && t[i + 1] && t[i + 1].v === '(' && t[i + 2] && t[i + 2].t === 'str' && /^[a-z]{2}(-[A-Z]{2})?$/.test(t[i + 2].v))
        add({ check: 'B11', file: rel, line: tk.line, fn, text: tk.v + "('" + t[i + 2].v + "')", msg: 'a locale chosen in place; times and dates go through bsTime/bsDate/bsWeekday (BoardStrings.META)' });
      if (tk.t === 'id' && tk.v === 'hour12' && t[i + 1] && t[i + 1].v === ':' && t[i - 1] && (t[i - 1].v === '{' || t[i - 1].v === ','))
        add({ check: 'B11', file: rel, line: tk.line, fn, text: 'hour12', msg: 'the 12/24-hour choice is BoardStrings.META[lang].clock24, read by bsTime' });
      // a private list of ≥3 language codes
      if (tk.t === 'punc' && tk.v === '[' && unit.closeOf[i]) {
        const close = unit.closeOf[i];
        let codes = 0, others = 0;
        for (let j = i + 1; j < close; j++) {
          if (unit.frameOf[j] !== i) continue;
          if (t[j].t === 'str' && LSET.has(t[j].v)) codes++;
          else if (t[j].v !== ',') others++;
        }
        if (codes >= 3 && others === 0) add({ check: 'B11', file: rel, line: tk.line, fn, text: '[' + codes + ' language codes]', msg: 'a private copy of the language list; use BoardStrings.LANGS' });
      }
      // fids_langs_ outside its owners
      if (tk.t === 'str' && /^fids_langs_/.test(tk.v)) {
        const owners = P.LANG_STORAGE_FUNCTIONS[rel] || {};
        if (fn && Object.prototype.hasOwnProperty.call(owners, fn)) used.storage.add(rel + ':' + fn);
        else add({ check: 'B11', file: rel, line: tk.line, fn, text: 'fids_langs_', msg: 'the saved languages are written by toggleLang and read through bsResolveLangs only' });
      }
      // STORE.key.en / STORE[k][lang] read outside the helpers
      if (tk.t === 'id' && entries[tk.v] && tables[tk.v] && tables[tk.v].file === rel) {
        const nx = t[i + 1];
        if (nx && (nx.v === '.' || nx.v === '[')) {
          let j = nx.v === '.' ? i + 3 : (unit.closeOf[i + 1] || i) + 1;
          const t2 = t[j];
          if (t2 && ((t2.v === '.' && t[j + 1] && LSET.has(t[j + 1].v)) || t2.v === '[')) {
            const helpers = new Set(['TL', 'TLF', 'SL', '_legacyPair', '_gateLbl', '_gateLbl1', '_gateLaneLbl', 'adTL', 'fidsT', 'T']);
            const helperFns = (P.LEGACY_STORES.find((s) => s.name === tk.v) || {}).helpers || [];
            if (!(fn && (helpers.has(fn) || helperFns.includes(fn))))
              add({ check: 'B11', file: rel, line: tk.line, fn, text: tk.v + (t2.v === '.' ? '.' + t[j + 1].v : '[lang]'), msg: `a language read straight out of ${tk.v}; read words through the helpers so the board's languages decide` });
          }
        }
      }
      // B13: text rewritten on a timer or by a MutationObserver
      if (tk.t === 'id' && (tk.v === 'setInterval' || tk.v === '_ocEvery' || tk.v === 'MutationObserver') && t[i + 1] && t[i + 1].v === '(') {
        const names = new Set();
        if (t[i + 2] && t[i + 2].t === 'id' && t[i + 2].v !== 'function') names.add(t[i + 2].v);
        else {
          // a function expression: the functions it calls
          const close = unit.closeOf[i + 1] || i + 2;
          for (let k = i + 2; k < close; k++) if (t[k].t === 'id' && t[k + 1] && t[k + 1].v === '(' && !(t[k - 1] && t[k - 1].v === '.')) names.add(t[k].v);
        }
        for (const name of names) {
          const body = functionBody(unit, name);
          if (!body || !SWEEP.test(body.text)) continue;
          const reg = (P.TEXT_REWRITERS[rel] || {})[name];
          if (reg) used.rewriters.add(rel + ':' + name);
          else add({ check: 'B13', file: rel, line: tk.line, fn, text: name, msg: `${name} sweeps the page and rewrites its text on a timer, after render — a guard on the render code cannot see what it writes. Fix the render instead, or register it in TEXT_REWRITERS if it only normalises data` });
          if (reg && body.langObj) add({ check: 'B13', file: rel, line: tk.line, fn, text: name + ' (language table)', msg: `${name} holds a language table; a rewriter may only normalise data` });
        }
      }
    }
  }

  function functionBody(unit, name) {
    const t = unit.toks;
    for (let i = 0; i < t.length; i++) {
      if (t[i].t === 'id' && t[i].v === 'function' && t[i + 1] && t[i + 1].v === name) {
        let j = i + 2; while (j < t.length && t[j].v !== '{') j++;
        const close = unit.closeOf[j];
        if (close == null) return null;
        const objs = unit.objects.filter((o) => o.open > j && o.close < close && isLangObj(o));
        return { text: t.slice(j, close).map((x) => x.t === 'str' ? JSON.stringify(x.v) : x.v).join(' '), langObj: objs.length > 0 };
      }
    }
    return null;
  }

  // ── B9: CSS content text ──
  for (const { rel, css, offset } of cssTexts) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    for (const m of clean.matchAll(/content\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
      const v = m[2].replace(/\\[0-9a-fA-F]{1,6}\s?/g, ' ').replace(/\\(.)/g, '$1');
      if (!countsAsWords(v)) continue;
      add({ check: 'B9', file: rel, line: (offset || 0) + lineOf(clean, m[0], m.index), fn: null, text: v, msg: `CSS content '${v}' is passenger text in one language \u2014 render it from the store` });
    }
  }

  // ── B10: static page text ──
  for (const page of passengerPages) {
    const html = read(page);
    for (const r of staticText(html)) {
      if (!countsAsWords(r.text)) continue;
      add({ check: 'B10', file: page, line: r.line, fn: null, text: r.text, msg: `static text '${shortText(r.text)}' \u2014 give the element data-i18n="key" (filled from the store at boot), or data-operator if only an operator sees it` });
    }
  }

  // ── B16: the store is never changed at run time ──
  // An assignment, a delete, a mutating call or Object.assign into BOARD_STR,
  // STR, LISTS, META or a registered table: the CITY_FR collapse again, at
  // run time, where no duplicate-key check can see it. (board-strings.js
  // also freezes its tables, so such a write does nothing in a browser.)
  {
    const STORE_ROOTS = new Set(['BOARD_STR'].concat(P.LEGACY_STORES.map((x) => x.name)));
    const STORE_PARTS = /^(STR|LISTS|META|LANGS|FR_FIRST|LANG_DEFAULTS|ES_AIRPORTS)$/;
    const MUTATORS = /^(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)$/;
    for (const { rel, unit, isStore } of jsUnits) {
      const t = unit.toks;
      for (let i = 0; i < t.length; i++) {
        const tk = t[i];
        if (tk.t !== 'id' || (t[i - 1] && t[i - 1].v === '.')) continue;
        let root = null, j = i;
        const ownTable = tables[tk.v] && tables[tk.v].file === rel;
        if ((STORE_ROOTS.has(tk.v) && (ownTable || tk.v === 'BOARD_STR')) || (isStore && STORE_PARTS.test(tk.v))) root = tk.v;
        else if (/^(BoardStrings|api|Strings)$/.test(tk.v) && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && STORE_PARTS.test(t[i + 2].v)) { root = tk.v + '.' + t[i + 2].v; j = i + 2; }
        if (!root) continue;
        if (t[i - 1] && /^(var|let|const)$/.test(t[i - 1].v)) continue;          // its declaration
        let k = j + 1, depth = 0;
        while (k < t.length) {
          if (t[k].v === '.' && t[k + 1] && t[k + 1].t === 'id') { k += 2; depth++; continue; }
          if (t[k].v === '?.' && t[k + 1] && t[k + 1].t === 'id') { k += 2; depth++; continue; }
          if (t[k].v === '[' && unit.closeOf[k] != null) { k = unit.closeOf[k] + 1; depth++; continue; }
          break;
        }
        const nx = t[k];
        if (!nx) continue;
        const assign = /^(=|\+=|-=|\|\|=|\?\?=|&&=|\+\+|--)$/.test(nx.v) && depth >= 1;
        const rebind = depth === 0 && nx.v === '=' && !(t[i - 1] && (t[i - 1].v === ',' && unit.isObj[unit.frameOf[i]]));
        const mut = nx.v === '(' && depth >= 1 && t[k - 1] && MUTATORS.test(t[k - 1].v);
        const del = t[i - 1] && t[i - 1].v === 'delete';
        if (assign || rebind || mut || del)
          add({ check: 'B16', file: rel, line: tk.line, fn: unit.fnAt[i], text: root + (depth ? '…' : '') + ' ' + (del ? 'delete' : mut ? t[k - 1].v + '()' : nx.v), msg: `${root} is changed at run time \u2014 the store's words are fixed where they are declared, one key per phrase; a run-time write overwrites them silently (the CITY_FR collapse)` });
      }
      // Object.assign(BOARD_STR.tomorrow, …), Object.defineProperty(STR, …)
      for (let i = 0; i < t.length - 4; i++) {
        if (t[i].v !== 'Object' || !t[i + 1] || t[i + 1].v !== '.' || !t[i + 2] || !/^(assign|defineProperty|defineProperties|setPrototypeOf)$/.test(t[i + 2].v) || !t[i + 3] || t[i + 3].v !== '(') continue;
        const a = t[i + 4];
        const b = t[i + 6];
        const hit = a && a.t === 'id' && ((STORE_ROOTS.has(a.v) && ((tables[a.v] && tables[a.v].file === rel) || a.v === 'BOARD_STR')) || (isStore && STORE_PARTS.test(a.v))
          || (/^(BoardStrings|api|Strings)$/.test(a.v) && t[i + 5] && t[i + 5].v === '.' && b && STORE_PARTS.test(b.v)));
        if (hit) add({ check: 'B16', file: rel, line: t[i].line, fn: unit.fnAt[i], text: 'Object.' + t[i + 2].v + '(' + a.v + '…)', msg: `Object.${t[i + 2].v} writes into the store at run time \u2014 its words are fixed where they are declared` });
      }
    }
  }

  // ── C2: what a passenger script loads at run time is classified too ──
  {
    const classifiedPages = new Set(P.PASSENGER_PAGES.concat(Object.keys(P.NON_PASSENGER_PAGES || {})));
    const resolve = (v, from) => {
      const clean = v.trim().split('?')[0].split('#')[0];
      if (/^(https?:)?\/\//i.test(clean)) return [];
      if (clean.startsWith('/mapcdn/')) return [clean];
      if (clean.startsWith('/')) return ['fids-current' + clean];
      // relative to the page that loads the script (fids-current/ or
      // fids-current/studio/), or to the script itself
      return ['fids-current/', 'fids-current/studio/', 'fids-current/js/', 'fids-current/css/', path.posix.dirname(from) + '/']
        .map((b) => path.posix.normalize(b + clean));
    };
    for (const { rel, unit } of jsUnits) {
      const t = unit.toks;
      for (let i = 0; i < t.length; i++) {
        if (t[i].t !== 'str' && t[i].t !== 'tpl') continue;
        const m = /^\s*((?:\.{1,2}\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.(js|css|html?))(?:[?#][^\s'"]*)?\s*$/i.exec(t[i].v);
        if (!m) continue;
        const cands = resolve(m[1], rel);
        if (!cands.length) continue;
        const isPage = /^html?$/i.test(m[2]);
        const known = cands.some((c) => (isPage ? classifiedPages.has(c) : classified.has(c)));
        if (isPage) for (const c of cands) if (classifiedPages.has(c)) used.pages.add(c);
        if (known || !cands.some((c) => exists(c))) continue;
        add({ check: 'C2', file: rel, line: t[i].line, fn: unit.fnAt[i], text: m[1], msg: isPage
          ? `${m[1]} is opened by a passenger script and is in neither PASSENGER_PAGES nor NON_PASSENGER_PAGES (tests/i18n/policy.js)`
          : `${m[1]} is loaded at run time by a passenger script and is in neither PASSENGER_SCRIPTS/PASSENGER_STYLES nor NON_PASSENGER (tests/i18n/policy.js) \u2014 a script injected by code is still on the screen` });
      }
    }
  }

  // ── data-i18n="key": the key exists ──
  for (const page of passengerPages) {
    const html = read(page);
    for (const m of html.matchAll(/data-i18n\s*=\s*["']([^"']+)["']/g)) {
      if (!entries.STR || entries.STR.has(m[1])) continue;
      add({ check: 'B6', file: page, line: lineOf(html, m[0], m.index), fn: null, text: 'data-i18n=' + m[1], msg: `'${m[1]}' is not in BOARD_STR \u2014 the element renders blank` });
    }
  }

  // ── B12: the Québec list exists once ──
  const FR = new Set(require(path.join(ROOT, P.STORE_FILE)).FR_FIRST);
  for (const { rel, unit, isStore } of jsUnits) {
    if (isStore) continue;
    for (let i = 0; i < unit.toks.length; i++) {
      const tk = unit.toks[i];
      if (tk.t !== 'regex' && tk.t !== 'str') continue;
      const all = tk.v.match(/\b[A-Z]{3}\b/g) || [];
      const codes = all.filter((c) => FR.has(c));
      if (new Set(codes).size >= 3 && codes.length >= all.length * 0.6) add({ check: 'B12', file: rel, line: tk.line, fn: unit.fnAt[i], text: 'Qu\u00E9bec airport list', msg: 'a second list of Qu\u00E9bec airports; BoardStrings.FR_FIRST (board-strings.js) is the only one' });
    }
  }

  // ── B14: board-strings.js and fids-core.js from the same build ──
  for (const page of passengerPages) {
    const html = read(page);
    const core = /js\/fids-core\.js\?v=([0-9][0-9.-]*)/.exec(html);
    const store = /js\/board-strings\.js\?v=([0-9][0-9.-]*)/.exec(html);
    if (core && !store) add({ check: 'B14', file: page, line: lineOf(html, core[0]), fn: null, text: 'board-strings.js missing', msg: 'a page that loads fids-core.js loads board-strings.js first' });
    if (core && store) {
      if (core[1] !== store[1]) add({ check: 'B14', file: page, line: lineOf(html, store[0]), fn: null, text: 'board-strings.js?v=' + store[1], msg: `board-strings.js?v=${store[1]} but fids-core.js?v=${core[1]}: a table and the helpers that read it must come from one build` });
      for (const later of ['js/fids-core.js', 'js/gate-date-context.js', 'js/fids-v2.js']) {
        const at = html.indexOf(later + '?v=');
        if (at >= 0 && at < store.index) add({ check: 'B14', file: page, line: lineOf(html, later), fn: null, text: later + ' before board-strings.js', msg: `${later} reads the store, so board-strings.js loads before it` });
      }
    }
  }

  // ── P1: stale policy entries ──
  for (const k of Object.keys(P.BRAND_TERMS)) if (!used.brand.has(k)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'BRAND_TERMS ' + k, msg: `BRAND_TERMS '${k}' matches nothing \u2014 remove it` });
  for (const k of Object.keys(P.SAME_AS_ENGLISH)) if (!used.same.has(k)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'SAME_AS_ENGLISH ' + k, msg: `SAME_AS_ENGLISH '${k}' matches nothing \u2014 remove it` });
  for (const [rel, list] of Object.entries(P.OPERATOR_FUNCTIONS)) for (const fn of Object.keys(list)) {
    const seenFns = fnSeen.get(rel) || new Set();
    if (!seenFns.has(fn)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'OPERATOR_FUNCTIONS ' + rel + ' ' + fn, msg: `operator function ${fn} no longer exists in ${rel} \u2014 remove it` });
    if (!P.REASONS.includes(String(list[fn]).split(':')[0])) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'OPERATOR_FUNCTIONS reason ' + fn, msg: `'${list[fn]}' does not start with a reason from: ${P.REASONS.join(', ')}` });
  }
  for (const [rel, list] of Object.entries(P.TEXT_REWRITERS)) for (const fn of Object.keys(list)) if (!used.rewriters.has(rel + ':' + fn)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'TEXT_REWRITERS ' + fn, msg: `TEXT_REWRITERS ${fn} is not run on a timer in ${rel} any more \u2014 remove it` });
  for (const [rel, list] of Object.entries(P.LANG_STORAGE_FUNCTIONS)) for (const fn of Object.keys(list)) if (!used.storage.has(rel + ':' + fn)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'LANG_STORAGE_FUNCTIONS ' + fn, msg: `${fn} no longer touches fids_langs_ \u2014 remove it` });
  for (const [rel, list] of Object.entries(P.DATA_TABLES || {})) for (const name of Object.keys(list)) if (!used.data.has(rel + ':' + name)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'DATA_TABLES ' + name, msg: `data table ${name} not found in ${rel} — remove it` });
  for (const [rel, list] of Object.entries(P.LANG_RECORD_TABLES || {})) for (const name of Object.keys(list)) if (!used.records.has(rel + ':' + name)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'LANG_RECORD_TABLES ' + name, msg: 'matches nothing — remove it' });
  for (const n of P.NONTEXT_TABLES) if (!used.nontext.has(n.file + ':' + (n.name || n.fn))) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'NONTEXT_TABLES ' + (n.name || n.fn), msg: 'matches nothing \u2014 remove it' });
  for (const [rel, list] of Object.entries(P.LANG_POSITION_FUNCTIONS || {})) for (const fn of Object.keys(list)) if (!used.position.has(rel + ':' + fn)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'LANG_POSITION_FUNCTIONS ' + fn, msg: `${fn} no longer picks a language by position in ${rel} \u2014 remove it` });
  for (const [pg, why] of Object.entries(P.NON_PASSENGER_PAGES || {})) {
    if (!used.pages.has(pg)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'NON_PASSENGER_PAGES ' + pg, msg: `no passenger script opens ${pg} any more \u2014 remove it` });
    if (!P.REASONS.includes(String(why).split(':')[0])) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'NON_PASSENGER_PAGES reason ' + pg, msg: `reason '${why}' must start with one of: ${P.REASONS.join(', ')}` });
  }
  for (const [rel, why] of Object.entries(P.NON_PASSENGER)) if (!P.REASONS.includes(String(why).split(':')[0])) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'NON_PASSENGER ' + rel, msg: `reason '${why}' must start with one of: ${P.REASONS.join(', ')}` });
  for (const k of pragmaHits.keys()) if (!pragmaUsed.has(k)) {
    const [file, line] = [k.slice(0, k.lastIndexOf(':')), +k.slice(k.lastIndexOf(':') + 1)];
    add({ check: 'P2', file, line, fn: null, text: 'stale i18n-ok', msg: 'this i18n-ok pragma suppresses nothing \u2014 remove it' });
  }

  // one report per finding
  const seenF = new Set();
  for (let k = findings.length - 1; k >= 0; k--) {
    const f = findings[k];
    const key = f.check + '|' + f.file + '|' + f.line + '|' + f.text + '|' + f.msg;
    if (seenF.has(key)) findings.splice(k, 1); else seenF.add(key);
  }
  const pragmaCounts = {};
  for (const r of pragmaHits.values()) pragmaCounts[r] = (pragmaCounts[r] || 0) + 1;
  return { findings, pragmaCounts, entries, tables, textObjects: allTextObjects };
}

// ── markup lexing ─────────────────────────────────────────────────────────
// A small HTML state machine. Text is only collected in the text state;
// attribute values are reported with their attribute name; tag names,
// attributes, inline handlers and styles are never text.
const ST_TEXT = 0, ST_TAG = 1, ST_ATTR_NAME = 2, ST_ATTR_EQ = 3, ST_DQ = 4, ST_SQ = 5, ST_UQ = 6, ST_COMMENT = 7, ST_TAGNAME = 8;
function lexHtml(s, start) {
  let st = start == null ? ST_TEXT : start.st;
  let attr = start && start.attr || '';
  let val = start && start.val || '';
  let tagName = start && start.tagName || '';
  let raw = start && start.raw || false;      // inside <style>/<script> content
  const text = [];
  const attrs = [];
  let tag = false;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    switch (st) {
      case ST_TEXT:
        if (c === '<' && isTagStart(s, i)) {
          if (raw && !/^<\/(style|script)/i.test(s.slice(i))) { break; }
          if (cur) { if (!raw) text.push(cur); cur = ''; }
          if (s.startsWith('<!--', i)) { st = ST_COMMENT; i += 3; break; }
          st = ST_TAGNAME; tagName = ''; tag = true; break;
        }
        if (!raw) cur += c;
        break;
      case ST_COMMENT:
        if (s.startsWith('-->', i)) { st = ST_TEXT; i += 2; }
        break;
      case ST_TAGNAME:
        if (/[\s]/.test(c)) { st = ST_TAG; break; }
        if (c === '>') { st = ST_TEXT; raw = /^(style|script)$/i.test(tagName); break; }
        tagName += c; break;
      case ST_TAG:
        if (c === '>') { st = ST_TEXT; raw = /^(style|script)$/i.test(tagName); break; }
        if (/[^\s\/=]/.test(c)) { st = ST_ATTR_NAME; attr = c; }
        break;
      case ST_ATTR_NAME:
        if (c === '=') { st = ST_ATTR_EQ; break; }
        if (c === '>') { st = ST_TEXT; raw = /^(style|script)$/i.test(tagName); break; }
        if (/\s/.test(c)) { st = ST_TAG; break; }
        attr += c; break;
      case ST_ATTR_EQ:
        if (c === '"') { st = ST_DQ; val = ''; break; }
        if (c === "'") { st = ST_SQ; val = ''; break; }
        if (/\s/.test(c)) break;
        st = ST_UQ; val = c; break;
      case ST_DQ:
        if (c === '"') { attrs.push({ name: attr.toLowerCase(), value: val, tag: tagName }); st = ST_TAG; break; }
        val += c; break;
      case ST_SQ:
        if (c === "'") { attrs.push({ name: attr.toLowerCase(), value: val, tag: tagName }); st = ST_TAG; break; }
        val += c; break;
      case ST_UQ:
        if (/\s/.test(c)) { attrs.push({ name: attr.toLowerCase(), value: val, tag: tagName }); st = ST_TAG; break; }
        if (c === '>') { attrs.push({ name: attr.toLowerCase(), value: val, tag: tagName }); st = ST_TEXT; break; }
        val += c; break;
    }
  }
  if (st === ST_TEXT && cur && !raw) text.push(cur);
  if ((st === ST_DQ || st === ST_SQ || st === ST_UQ) && val) attrs.push({ name: attr.toLowerCase(), value: val, open: true, tag: tagName });
  return { st: { st, attr, val: '', tagName, raw }, text, attrs, tag };
}

// `<` starts a tag only when an HTML or SVG element name follows, so script
// text inside a handler (i<fbs.length) is not mistaken for markup.
const TAGS = new Set(('a abbr article aside b bdi bdo blockquote br button canvas caption circle code col dd defs del details dfn div dl dt em '
  + 'ellipse feGaussianBlur figcaption figure filter footer g h1 h2 h3 h4 h5 h6 header hr i iframe img input ins kbd label legend li '
  + 'line linearGradient main mark mask nav ol optgroup option p path pattern picture polygon polyline pre q radialGradient rect s '
  + 'section select small source span stop strong style sub summary sup svg table tbody td text textarea tfoot th thead time tr tspan u ul '
  + 'use var video wbr script noscript template audio track meta link marquee clipPath foreignObject symbol marker image desc '
  + 'fieldset form object embed').split(' '));
function isTagStart(s, i) {
  const m = /^<\/?([A-Za-z][A-Za-z0-9]*)/.exec(s.slice(i, i + 24));
  if (m) return TAGS.has(m[1]) || TAGS.has(m[1].toLowerCase());
  return s.startsWith('<!--', i);
}

// What a literal is being used for.
//   key        an object key
//   langvalue  a value in a language-keyed object
//   compare    an operand of ===, a case label, an includes()/indexOf() arg
//   excluded   console, errors, selectors, storage, URLs, regex sources
//   plain      anything else
const EXCLUDED_CALLS = new Set(['log', 'warn', 'error', 'info', 'debug', 'trace', 'Error', 'TypeError', 'RangeError',
  'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'getElementsByTagName', 'closest', 'matches',
  'getItem', 'setItem', 'removeItem', 'fetch', 'RegExp', 'postMessage', 'addEventListener', 'removeEventListener',
  'createElement', 'createElementNS', 'setAttribute', 'getAttribute', 'removeAttribute', 'hasAttribute', 'setProperty', 'getPropertyValue',
  'add', 'remove', 'toggle', 'contains', 'replace', 'split', 'test', 'match', 'matchAll', 'search', 'startsWith', 'endsWith',
  'includes', 'indexOf', 'lastIndexOf', 'has', 'get', 'set', 'delete', 'open', 'send', 'matchMedia', 'require', 'importScripts',
  'insertRule', 'dispatchEvent', 'CustomEvent', 'Event', 'URL', 'URLSearchParams', 'encodeURIComponent', 'decodeURIComponent',
  'join', 'padStart', 'padEnd', 'localeCompare', 'Function', 'eval', 'setTimeout', 'setInterval', 'alert', 'confirm', 'prompt',
  'console', 'assert', 'fidsLog', '_fidsLog', '_dbg', 'dbg', '_log', '_diag', 'reportError', 'track', 'sendBeacon', 'measureText',
  'parse', 'stringify', 'toLocaleTimeString', 'toLocaleDateString', 'toLocaleString', 'DateTimeFormat', 'NumberFormat', 'animate', 'scrollTo', 'execCommand',
  'TL', 'TLF', 'SL', '_gateLbl', '_gateLbl1', '_gateLblSpans', '_g8SignPair', '_g8SignLines', '_g8SignNext', 'adTL', 'fidsT', 'bs', 'bsFmt', 'bsPair', 'tioLabel']);
// The store's methods that take a key, and the table each reads (B6).
const STORE_METHODS = { bs: ['STR'], fmt: ['STR'], pair: ['STR'], filled: ['STR'], entry: ['STR'], loaderLine: ['STR'], list: ['LISTS'] };
// Calls whose FIRST argument is code and the rest may be words:
// s.replace('{GC}', 'Gate closes | Fermeture') puts its second argument on
// screen. Every argument of the other EXCLUDED_CALLS is code.
const LOG_CALLS = new Set(['log', 'warn', 'error', 'info', 'debug', 'trace', 'Error', 'TypeError', 'RangeError', 'assert',
  'fidsLog', '_fidsLog', '_dbg', 'dbg', '_log', '_diag', 'reportError', 'alert', 'confirm', 'prompt', 'groupCollapsed', 'group']);
const LANG_CODE_RE = /^[a-z]{2,3}([-_][A-Za-z]{2,4})?(\s*,\s*[a-z]{2,3}([-_][A-Za-z]{2,4})?(;q=[\d.]+)?)*$/;
const FIRST_ARG_ONLY = new Set(['replace', 'replaceAll', 'set']);
// Calls that put an argument on screen as text: the index of that argument,
// or null for every one.
const CALL_SINKS = { append: null, prepend: null, before: null, after: null, replaceWith: null, replaceChildren: null,
  createTextNode: 0, insertAdjacentText: 1, fillText: 0, strokeText: 0 };
// Properties whose value is text on screen.
const HTML_SINKS = new Set(['innerHTML', 'outerHTML']);
const SINK_PROPS = new Set(['textContent', 'innerText', 'innerHTML', 'outerHTML', 'nodeValue', 'placeholder', 'title', 'alt', 'ariaLabel']);
// Attributes a passenger reads (or a screen reader speaks).
const TEXT_ATTRS = new Set(['placeholder', 'title', 'alt', 'aria-label', 'aria-description', 'aria-roledescription', 'label']);
// Object keys whose values are protocol, not words: request headers and
// fetch options.
const CODE_KEYS = new Set(['Authorization', 'authorization', 'Content-Type', 'content-type', 'Accept', 'accept', 'method', 'mode', 'cache', 'credentials', 'redirect', 'referrerPolicy', 'X-Requested-With']);
function literalContext(t, i, unit) {
  const p = t[i - 1], n = t[i + 1];
  if (n && n.v === ':' && p && (p.v === '{' || p.v === ',')) return 'key';
  if (p && p.v === ':' && t[i - 2] && /^(en|fr|es|de|it|pt|ja|zh|ar)$/.test(String(t[i - 2].v)) && t[i - 3] && (t[i - 3].v === '{' || t[i - 3].v === ',')) return 'langvalue';
  if ((p && /^[!=]==?$/.test(p.v)) || (n && /^[!=]==?$/.test(n.v)) || (p && p.v === 'case')) return 'compare';
  if (p && (p.v === 'in' || p.v === 'instanceof')) return 'compare';
  if (n && n.v === 'in') return 'compare';
  if (p && p.v === 'throw') return 'excluded';
  if (p && p.v === '[' && t[i - 2] && (t[i - 2].t === 'id' || t[i - 2].v === ']' || t[i - 2].v === ')')) return 'excluded';   // obj['prop']
  // the call this literal is an argument of, if any
  const fr = unit.frameOf[i];
  if (fr >= 0 && t[fr].v === '(') {
    const callee = t[fr - 1];
    if (callee && callee.t === 'id') {
      if (EXCLUDED_CALLS.has(callee.v) && !(FIRST_ARG_ONLY.has(callee.v) && argIndex(t, i, unit) > 0)) return 'excluded';
      if (t[fr - 2] && t[fr - 2].v === '.' && t[fr - 3] && t[fr - 3].v === 'console') return 'excluded';
    }
  }
  // anywhere inside the arguments of a logging call or an error, however
  // deep: console.log('x', (a ? ' (extras kept)' : ''))
  for (let k = fr; k != null && k >= 0; k = unit.frameOf[k]) {
    if (t[k].v === '{' && !unit.isObj[k]) break;            // a function body: its own code
    if (t[k].v !== '(') continue;
    const c = t[k - 1];
    if (c && c.t === 'id' && LOG_CALLS.has(c.v)) return 'excluded';
    if (c && c.t === 'id' && t[k - 2] && t[k - 2].v === '.' && t[k - 3] && t[k - 3].v === 'console') return 'excluded';
  }
  // { Authorization: 'Bearer ' + token }
  if (p && p.v === ':' && t[i - 2] && (t[i - 2].t === 'id' || t[i - 2].t === 'str') && CODE_KEYS.has(String(t[i - 2].v)) && t[i - 3] && (t[i - 3].v === '{' || t[i - 3].v === ',')) return 'excluded';
  // array literal used for includes/indexOf: ['a','b'].includes(x)
  if (fr >= 0 && t[fr].v === '[') {
    const close = unit.closeOf[fr];
    if (close && t[close + 1] && t[close + 1].v === '.' && t[close + 2] && /^(includes|indexOf|some|every|find|filter)$/.test(t[close + 2].v)) return 'compare';
  }
  if (/^\s*(https?:|\/|\.\/|data:|#[\w-]+$|[.#]?[a-z][\w-]*\s*[.#\[>:]|[a-z-]+:\s)/i.test(t[i].v) && !/\s[a-z]{3,}\s[a-z]{3,}/i.test(t[i].v.slice(0, 40))) return 'excluded';
  return 'plain';
}

// Code, not words: font stacks, CSS declarations and values, SVG attribute
// values, HTML attribute lists outside a tag, MIME types, units of CSS.
const CODE_LIKE2 = /^\s*use strict\s*$|^\s*[#.][A-Za-z][\w-]*(\s*[>+~]?\s*[a-z][\w.:()-]*)*\s*[{,]?\s*$|\{\s*[a-z-]+\s*:|^\s*(normal|multiply|screen|overlay)(,\s*(normal|multiply|screen|overlay))*\s*$|color-mix\(|^\s*(left|right|center|top|bottom)(\s+(left|right|center|top|bottom|\d+%))?\s*$|\b(var|let|const)\s+\w+\s*=|\bthis\.\w+|\btypeof\s|\bfunction\s*\(|^\s*(zoom|zoomend|zoomstart|moveend|movestart|viewreset|resize|load|click|touchstart|touchend|mouseenter|mouseleave)(\s+(zoom|zoomend|zoomstart|moveend|movestart|viewreset|resize|load|click|touchstart|touchend|mouseenter|mouseleave))+\s*$|^\s*(Geist|Inter|Roboto|Arial|Helvetica)\s*$/i;
const CODE_LIKE = /,\s*(sans-serif|serif|monospace|system-ui|cursive)\b|-apple-system|BlinkMacSystemFont|!important|\b\d+(\.\d+)?(px|em|rem|vh|vw|ms|deg)\b|rgba?\(|hsla?\(|var\(--|drop-shadow\(|translate[XY]?\(|cubic-bezier|\b(xMinYMid|xMidYMid|xMaxYMid)\b|\b(autoplay|playsinline|muted|loop|preload)\b.*\b(autoplay|playsinline|muted|loop|preload)\b|^\s*(thead|tbody|tr|td|th|div|span|img|svg)\b[\s>.#]|\b(application|image|text|video|font)\/[a-z0-9.+-]+/i;
const CSS_LIKE = /:(not|where|is|has)\(|^\s*[*.#\[][^\s]*\s*[{,]|\{[^}]*:[^}]*[;}]|^\s*['"]?\)?;?\s*--?[a-z0-9-]+\s*:|^\s*[a-z][\w-]*\s*\{|format\(|@font-face|url\(|^[^<>]*\)\s*;|^\s*\.(jpe?g|png|svg|webp|gif|mp4)\b/i;

// A sweep over the page's text: what a post-render rewriter does.
const SWEEP = /createTreeWalker|\.nodeValue\s*=|querySelectorAll\s*\(\s*"(body \*|\*)"\s*\)/;

// The property a literal is the value of — directly, or as an element of an
// array value: `quality: ['Live']` → 'quality'. Keys in DATA_KEYS carry data
// (feed fields), not words a passenger reads.
let DATA_KEYS_SET = new Set();
// word -> the board languages whose store values use it (built each run)
let VOCAB = new Map();
// words that are data: cities, airports, airlines, aircraft, brands (built each run)
let DATA_VOCAB = new Set();
function dataKeyOf(t, i, unit) {
  let k = i;
  const fr = unit.frameOf[i];
  if (fr >= 0 && t[fr].v === '[') k = fr;
  const p = t[k - 1], key = t[k - 2];
  if (p && p.v === ':' && key && (key.t === 'id' || key.t === 'str') && DATA_KEYS_SET.has(String(key.v))) return String(key.v);
  return null;
}

function sinkBefore(t, i) {
  const p = t[i - 1], p2 = t[i - 2], p3 = t[i - 3];
  if (p && (p.v === '=' || p.v === '+=') && p2 && p2.t === 'id' && /^(textContent|innerText|innerHTML|outerHTML|placeholder|nodeValue)$/.test(p2.v) && p3 && p3.v === '.') return p2.v;
  if (p && p.v === '(' && p2 && p2.t === 'id' && /^(createTextNode|insertAdjacentText)$/.test(p2.v)) return p2.v + '()';
  return null;
}

function calleeOfClose(t, closeIdx) {
  let d = 0;
  for (let j = closeIdx; j >= 0; j--) {
    if (t[j].v === ')') d++;
    else if (t[j].v === '(') { d--; if (d === 0) return t[j - 1] && t[j - 1].t === 'id' ? t[j - 1].v : null; }
  }
  return null;
}

// Which argument of its call a token is (0-based), counting from the call's
// own parenthesis even when the token sits deeper (inside a ternary or a
// nested call): -1 when the token is not inside that call.
function argIndexAtDepth(t, i, unit, open) {
  let k = i;
  while (k >= 0 && unit.frameOf[k] !== open) { k = unit.frameOf[k]; if (k == null || k < 0) return -1; }
  let n = 0;
  for (let j = open + 1; j < k; j++) if (unit.frameOf[j] === open && t[j].v === ',') n++;
  return n;
}
function argIndex(t, i, unit) {
  const fr = unit.frameOf[i];
  if (fr == null || fr < 0) return -1;
  return argIndexAtDepth(t, i, unit, fr);
}
function frameOpen(unit, i) { return unit.frameOf[i]; }

// A data table by name: an object (findTable) or an array, `NAME = [ … ]`
// or `NAME = Object.freeze([ … ])`. [open, close] token indexes.
function dataRange(unit, name) {
  const o = scan.findTable(unit, name);
  if (o) return [o.open, o.close];
  const t = unit.toks;
  for (let i = 0; i < t.length - 2; i++) {
    if (t[i].t !== 'id' || t[i].v !== name || !t[i + 1] || t[i + 1].v !== '=') continue;
    let j = i + 2;
    if (t[j] && t[j].v === 'Object' && t[j + 1] && t[j + 1].v === '.' && t[j + 2] && t[j + 2].v === 'freeze' && t[j + 3] && t[j + 3].v === '(') j += 4;
    if (t[j] && t[j].v === '[' && unit.closeOf[j] != null) return [j, unit.closeOf[j]];
  }
  return null;
}

function lineOf(text, needle, at) {
  const idx = at != null ? at : text.indexOf(needle);
  if (idx < 0) return 1;
  return text.slice(0, idx).split('\n').length;
}

// Text nodes of an HTML page's <body>, outside script/style/template/svg
// and outside any element carrying data-i18n or data-operator.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function staticText(html) {
  const out = [];
  // the real <body>, not the word inside a comment
  const blanked = html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const bodyAt = blanked.search(/<body\b/i);
  if (bodyAt < 0) return out;
  const stack = [];
  let i = bodyAt;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  re.lastIndex = bodyAt;
  let m;
  const skipTags = new Set(['script', 'style', 'template', 'svg', 'noscript', 'textarea', 'select', 'option']);
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] != null) {
      const txt = m[5].replace(/\s+/g, ' ').trim();
      if (!txt) continue;
      if (stack.some((f) => f.skip || f.marked)) continue;
      out.push({ text: txt, line: html.slice(0, m.index).split('\n').length });
      continue;
    }
    const close = m[1] === '/', name = m[2].toLowerCase(), attrs = m[3] || '', selfClose = m[4] === '/';
    if (close) {
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      if (name === 'body') break;
      continue;
    }
    if (VOID.has(name) || selfClose) continue;
    const marked = /\bdata-(i18n|operator)\b/.test(attrs);
    const skip = skipTags.has(name);
    stack.push({ name, marked, skip });
    if (skip) {
      // jump to the matching close tag
      const endRe = new RegExp('</' + name + '\\s*>', 'gi');
      endRe.lastIndex = re.lastIndex;
      const em = endRe.exec(html);
      if (em) { re.lastIndex = em.index + em[0].length; stack.pop(); }
    }
  }
  return out;
}

// The lists that loosen a check: the ratchet (tests/board-languages.test.js)
// holds each of them to main's, so loosening one is as visible as an
// exception in policy.js.
const LOOSENERS = { EXCLUDED_CALLS, LOG_CALLS, FIRST_ARG_ONLY, CODE_KEYS };

module.exports = { run, id, norm, lexHtml, staticText, shortText, LOOSENERS };
