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
// Letters each language does not write (any script but its own; Latin
// letters stay allowed in ja/zh/ar for brands, codes and units).
const S_CYR = '\\u0400-\\u04FF', S_GRK = '\\u0370-\\u03FF', S_ARB = '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF',
  S_HEB = '\\u0590-\\u05FF', S_KANA = '\\u3040-\\u30FF\\uFF66-\\uFF9F', S_HAN = '\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF',
  S_HANGUL = '\\u1100-\\u11FF\\uAC00-\\uD7AF', S_INDIC = '\\u0900-\\u0DFF\\u0E00-\\u0E7F';
// Letters that look like Latin ones and are not: fullwidth forms ('Ｔｏｍｏｒｒｏｗ'),
// small capitals and phonetic letters ('Tomorroᴡ'), mathematical letters.
const S_LOOKALIKE = '\\uFF01-\\uFF5E\\u1D00-\\u1DBF\\u0250-\\u02AF\\u2C60-\\u2C7F\\uA720-\\uA7FF\\u{1D400}-\\u{1D7FF}\\u{1F130}-\\u{1F189}';
const notLatin = new RegExp('[' + S_CYR + S_GRK + S_ARB + S_HEB + S_KANA + S_HAN + S_HANGUL + S_INDIC + S_LOOKALIKE + ']', 'u');
const FOREIGN_SCRIPT = {
  en: notLatin, fr: notLatin, es: notLatin, de: notLatin, it: notLatin, pt: notLatin,
  ja: new RegExp('[' + S_CYR + S_GRK + S_ARB + S_HEB + S_HANGUL + S_INDIC + ']', 'u'),
  zh: new RegExp('[' + S_CYR + S_GRK + S_ARB + S_HEB + S_HANGUL + S_INDIC + S_KANA + ']', 'u'),
  ar: new RegExp('[' + S_CYR + S_GRK + S_HEB + S_KANA + S_HAN + S_HANGUL + S_INDIC + S_LOOKALIKE + ']', 'u')
};
// Characters only simplified Chinese writes (Japanese has its own forms:
// 门 is 門, 时 is 時, 东 is 東): one in a Japanese value is pasted Chinese.
const SIMPLIFIED_ONLY = new Set([...'们这说时么开关门场发达对过还进车东飞间问题从让习书长电话报乐动应该张钟预计离气风阴转载务验证护闸运输盘带换线终队观览馆层请误华为际见没给办网页贵钱买卖备总统团园业专单币岁兴处级红约纸经结绿维编缩罗联节药获营蓝规视觉订认讨训议讯记讲许论设访评识词译试诗询详语读课谁调谈谢负财责败账货质购费资赛赶跃轨轮软轻较辆辑迁远违连迟选递邮释针钢钥铁铃银链销锁错镜闪闭闲闻阅阳阵阶陆陈险随隐难顶项顺须顾顿领频颜额饭饮驶驾鱼鲜鸟鸡齐龙广厅']);
// Common English signage words, so an English word is recognised even when
// the store's own English never uses it ('shortly').
const ENGLISH_COMMON = ('the to for of your our now next please this that and not no is are will be has have until with by at from in on '
  + 'before after into all any more see here soon shortly closes closed closing opens open opening gate gates boarding board boards flight flights '
  + 'departure departures departing arrival arrivals arriving delayed delay cancelled canceled landed arrived departed time times today tomorrow '
  + 'yesterday minute minutes hour hours check baggage bags bag belt claim welcome thank thanks you go proceed wait waiting final last call '
  + 'expected estimated scheduled early late new changed change moved information status connection connections weather sunny cloudy rain '
  + 'snow showers clear partly mostly wind temperature feels like high low lounge shops food drink coffee free passengers passenger seat '
  + 'seats group priority members member families children assistance economy business first class premium travel traveller traveler '
  + 'documents passport ready keep follow signs please only also every each other while when where which who what why how about over under '
  + 'between during without within near far left right up down back away again still just very much many some most few less least '
  // More of everyday English, so a translation written in English words the
  // store's own English never uses ('Doors shut momentarily' for German) is
  // still seen. Words that are also words of fr/es/de/it/pt (die, also,
  // main, fine, come, hall, will, kind, see, still, train…) are left out.
  + 'about above across action add afternoon against ago ahead airline airport aisle allow allowed almost alone along already always among '
  + 'amount another answer anyone anything appear apply arrive asked asking avoid awake baby bag bags bathroom beach beautiful became because '
  + 'become bed been behind believe belonging belongings below beside best better beyond big bill bit black blue both bottom bought box boy break '
  + 'breakfast bring brought brown build building built busy but buy cab call called came cannot careful carry cart catch caught checked checkpoint '
  + 'child choose city class clean clearly close clothes cloud coat cold collect coming confiscated connect connecting could count counter country '
  + 'couple cover cross crowd cup current customer customs cut daily dark day days deal dear decide desk did different dinner direct dirty does '
  + 'dog doing done door doors downstairs drink drive driver drop earth east easy eat edge either else empty end enjoy enough enter entrance entry '
  + 'evening ever everyone everything exactly exit expect explain eye family fare fee feel feet field fight fill find finish fire fit flew floor fly '
  + 'flying friend friendly front full fun gave get gets getting girl give given glad glass goes going gone good got great green ground grow guest '
  + 'guide half happen happy hard head hear heard heavy held hello help her him his hold holiday home hope hot house however hurry husband inside '
  + 'instead item items itself job join journey keep kept key kid kids lady landing large later leave leaving led less let letter lift light line '
  + 'listen little look looking lose lost lot loud love luggage lunch made mail make making may maybe meal mean meet meeting men might mind miss '
  + 'missed momentarily money month morning mother move moving must myself nearly need never news night nobody noise north nothing notice number '
  + 'off offer office often old once one opened order out outside own paid pair paper parent past pay people perhaps person phone pick picture '
  + 'piece plane planned play pocket point police poor possible power pretty price print problem pull push put quick quickly quiet quite ran rather '
  + 'reach read really reason receive remain remember return road room round row run rush safe said same sat saw say says school security seem seen '
  + 'sell send sent seven several shall she ship shoe shop short should show shower shown shut side sign since sir sit sitting size sky sleep slow '
  + 'slowly small smoke smoking someone something sometimes sorry sound south speak special spend spent stay step store story straight street '
  + 'strong such sun sure suspicious take taken talk tall tax tell than thank them then there these they thing things think third those though thought '
  + 'three through throw ticket tickets till tired together told too took touch toward towards towel town tray tree trip trolley true trust truth try '
  + 'trying turn twice two unattended understand unless upon upstairs use used useful usual usually visit voice walk walking wall want wanted wash '
  + 'watch water way wear week weight well went were west what wheel wheelchair whether white whole whose wide wife window wish woman women '
  + 'wonder word work world worry would write wrong year yes yet young yours yourself activity monitors suspicious belongings watching').split(' ');
// Placeholders left where a translation belongs: a value of punctuation or
// a dash only, '???', 'N/A', 'TBD', 'TODO', 'FIXME', 'XXX', 'Lorem ipsum'.
const RE_PLACEHOLDER = /^\s*(?:[?\uFF1F.\u2026\u00B7\u2022\-\u2010-\u2015_*#~=+]+(?:\s+[?\uFF1F.\u2026\u00B7\u2022\-\u2010-\u2015_*#~=+]+)*|[Nn]\s*\/\s*[Aa]|TBD|TBA|TODO|FIXME|XXX+|[Ll]orem(?:\s+ipsum)?\b.*|placeholder|untranslated|undefined)\s*$/;
const RE_PLACEHOLDER_IN = /\b(?:TODO|FIXME|XXX|TBD|TBA)\b|\b[Nn]\/[Aa]\b|\b[Ll]orem ipsum\b|\?\?|\uFF1F\uFF1F/;
// Letters Persian and Urdu write and Arabic does not (keheh, Farsi yeh,
// gaf, pe, che, zhe, the Urdu letters, the Persian digits), and Persian
// words written with Arabic's own letters ('فردا', tomorrow, for غدًا).
const RE_PERSIAN_URDU = /[پچژکگیےٹڈڑںھہۃ۰-۹]/;
const PERSIAN_WORDS = new Set(['فردا', 'امروز', 'است', 'شما', 'از', 'را', 'هست', 'نیست', 'برای', 'دیروز', 'پرواز']);
// rel words of a value, as written (case kept)
function rawWordsOf(s) {
  return (stripEntities(stripTags(String(s).replace(RE_INVISIBLE_G, ''))).replace(/\{[A-Za-z0-9_]+\}|%[a-z]\b/g, ' ').match(/\p{L}[\p{L}'\u2019-]*/gu) || [])
    // an elided article is its own word: d'information, l'heure, dell'aereo
    .map((w) => w.replace(/^(?:d|l|qu|n|s|j|c|m|t|dell|nell|all|dall|sull)['\u2019](?=\p{L})/iu, '').replace(/[-'\u2019]+$/, ''));
}
let ENGLISH_WORDS = new Set(), TRANSLATED_WORDS = new Map();
const LANG_NAME = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese', ar: 'Arabic' };
const RE_LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
const RE_WORD = /[A-Za-z\u00C0-\u024F]{2,}|[\u0600-\u06FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

function stripTags(s) { return String(s).replace(/<[^>]*>/g, ' '); }
function stripEntities(s) { return String(s).replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi, ' '); }
// Characters that draw nothing: a zero-width space hides 'Tomor\u200Brow'
// from a comparison with 'Tomorrow' and from a reader not at all.
const RE_INVISIBLE = /[\u00AD\u034F\u115F\u1160\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/;
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
  const used = { brand: new Set(), same: new Set(), op: new Set(), rewriters: new Set(), nontext: new Set(), storage: new Set(), data: new Set(), records: new Set(), position: new Set(), pages: new Set(), jazh: new Set(), native: new Set(), writers: new Set(), statusSame: new Set(), across: new Set() };
  const pragmaHits = new Map();        // "file:line" -> reason
  const pragmaOwnLine = new Set();     // "file:line" of a pragma on a line of its own
  const pragmaUsed = new Set();
  const add = (f) => {
    // A pragma excuses the code on its own line. A pragma on a line of its
    // own (nothing but the comment there) excuses the line below it instead.
    // A pragma at the end of a line of code never reaches the next line: a
    // label written just under `x = 'Fairmont'; // i18n-ok: data` is new
    // code, and must not hide behind an old exception (the ratchet would see
    // nothing new, since the pragma's own line has not changed).
    const key = f.file + ':' + f.line, key0 = f.file + ':' + (f.line - 1);
    for (const k of [key, key0]) {
      if (k === key0 && !pragmaOwnLine.has(k)) continue;
      if (pragmaHits.has(k) && !/^(P1|P2|C1|C3|C4|B4|B14)$/.test(f.check)) {
        pragmaUsed.add(k);
        return;
      }
    }
    findings.push(f);
    REPORTED.add(f.file + ':' + f.line + ':' + String(f.text).trim());
  };
  const REPORTED = new Set();

  const passengerScripts = P.PASSENGER_SCRIPTS.filter(exists);
  const passengerPages = P.PASSENGER_PAGES.filter(exists);
  const jsUnits = [];                  // { rel, unit, store: bool }
  for (const rel of passengerScripts.concat(passengerPages)) {
    const L = load(rel);
    for (const u of L.units) jsUnits.push({ rel, unit: u, isStore: rel === P.STORE_FILE });
  }

  // ── pragmas ──
  for (const { rel, unit } of jsUnits) {
    // the lines that carry code (a multi-line literal covers every line it spans)
    const codeLines = new Set();
    for (const tk of unit.toks) {
      codeLines.add(tk.line);
      if ((tk.t === 'str' || tk.t === 'tpl') && /\n/.test(String(tk.v))) for (let k = 1, n = String(tk.v).split('\n').length; k < n; k++) codeLines.add(tk.line + k);
    }
    for (const c of unit.comments) {
      const m = /i18n-ok:\s*([a-z]+)?/.exec(c.v);
      if (!m) continue;
      if (!m[1] || !P.REASONS.includes(m[1])) {
        add({ check: 'P2', file: rel, line: c.line, fn: null, text: c.v.trim(), msg: `i18n-ok needs a reason from: ${P.REASONS.join(', ')}` });
        continue;
      }
      pragmaHits.set(rel + ':' + c.line, m[1]);
      if (!codeLines.has(c.line) && !(c.endLine && c.endLine !== c.line)) pragmaOwnLine.add(rel + ':' + c.line);
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
    // a page a passenger page puts on screen (an iframe, an object, an
    // embed) or opens (a link): classified like the page itself
    const pageRefs = [];
    for (const m of html.matchAll(/<(iframe|frame|embed)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) pageRefs.push(m[2]);
    for (const m of html.matchAll(/<object\b[^>]*\bdata\s*=\s*["']([^"']+)["']/gi)) pageRefs.push(m[1]);
    for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#?]+\.html?)(?:[?#][^"']*)?["']/gi)) pageRefs.push(m[1]);
    for (const r of pageRefs) {
      if (/^(https?:)?\/\//i.test(r) || /^(about|data|javascript):/i.test(r)) continue;
      const clean = r.split('?')[0].split('#')[0];
      const rel = clean.startsWith('/') ? 'fids-current' + clean : path.posix.normalize(base + '/' + clean);
      if (!/\.html?$/i.test(rel) && !exists(rel)) continue;
      const known = P.PASSENGER_PAGES.includes(rel) || Object.prototype.hasOwnProperty.call(P.NON_PASSENGER_PAGES || {}, rel);
      if (!known) add({ check: 'C1', file: page, line: lineOf(html, r), fn: null, text: rel, msg: `${rel} is shown or opened by a passenger page and is in neither PASSENGER_PAGES nor NON_PASSENGER_PAGES (tests/i18n/policy.js)` });
    }
  }

  // ── C4: every script and stylesheet is classified ──
  // A new .js or .css file is in PASSENGER_SCRIPTS/PASSENGER_STYLES (and
  // scanned) or in the reviewed NON_PASSENGER, however it is loaded: a
  // script whose src is built from parts at run time is still a file here.
  {
    const root = P.PAGE_ROOT || 'fids-current';
    const files = options.listAssets ? options.listAssets(root) : listFiles(path.join(ROOT, root), /\.(m?js|css)$/i).map((f) => path.posix.join(root, f));
    const known = new Set(P.PASSENGER_SCRIPTS.concat(P.PASSENGER_STYLES, Object.keys(P.NON_PASSENGER)));
    for (const f of files) if (!known.has(f)) add({ check: 'C4', file: f, line: 1, fn: null, text: f, msg: `${f} is in neither PASSENGER_SCRIPTS/PASSENGER_STYLES nor NON_PASSENGER (tests/i18n/policy.js): a script or stylesheet a passenger can see is scanned like every other` });
  }

  // ── C3: every page is classified ──
  // A new page is a passenger page (scanned by every check) or a reviewed
  // non-passenger page; it cannot stand outside the guard by being new.
  {
    const root = P.PAGE_ROOT || 'fids-current';
    const pages = options.listPages ? options.listPages(root) : listHtml(path.join(ROOT, root)).map((f) => path.posix.join(root, f));
    for (const pg of pages) {
      if (P.PASSENGER_PAGES.includes(pg) || Object.prototype.hasOwnProperty.call(P.NON_PASSENGER_PAGES || {}, pg)) continue;
      add({ check: 'C3', file: pg, line: 1, fn: null, text: pg, msg: `${pg} is a page in neither PASSENGER_PAGES nor NON_PASSENGER_PAGES (tests/i18n/policy.js): a page a passenger can see is a passenger page, scanned like every other` });
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
  // English words: every word of the store's English, and the common
  // signage words; translated words: every word of every non-English value,
  // with the entries that use it.
  ENGLISH_WORDS = new Set(ENGLISH_COMMON);
  TRANSLATED_WORDS = new Map();
  for (const o of allTextObjects) {
    if (o.langs.en != null) for (const w of rawWordsOf(o.langs.en)) ENGLISH_WORDS.add(w.toLowerCase().replace(/['\u2019-]+$/, ''));
    for (const l of ['fr', 'es', 'de', 'it', 'pt']) {
      if (o.langs[l] == null) continue;
      for (const raw of rawWordsOf(o.langs[l])) {
        const w = raw.toLowerCase().replace(/['\u2019-]+$/, '');
        if (!TRANSLATED_WORDS.has(w)) TRANSLATED_WORDS.set(w, new Set());
        TRANSLATED_WORDS.get(w).add(o);
      }
    }
  }
  // the ticker lists too: their English is English, each item of another
  // language a translation (an item is its own "entry")
  for (const li of listObjects) {
    li.itemObjs = li.items.map((item, k) => ({ list: li, k }));
    li.items.forEach((item, k) => {
      for (const raw of rawWordsOf(item)) {
        const w = raw.toLowerCase().replace(/['\u2019-]+$/, '');
        if (li.lang === 'en') ENGLISH_WORDS.add(w);
        else if (['fr', 'es', 'de', 'it', 'pt'].includes(li.lang)) {
          if (!TRANSLATED_WORDS.has(w)) TRANSLATED_WORDS.set(w, new Set());
          TRANSLATED_WORDS.get(w).add(li.itemObjs[k]);
        }
      }
    });
  }
  const sameJaZh = (en) => {
    if (Object.prototype.hasOwnProperty.call(P.SAME_JA_ZH || {}, en)) { used.jazh.add(en); return true; }
    return false;
  };
  const nativeWord = (l, w) => {
    const list = (P.NATIVE_WORDS || {})[l] || {};
    if (Object.prototype.hasOwnProperty.call(list, w)) { used.native.add(l + ':' + w); return true; }
    return false;
  };
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
      else if (l !== 'fr' && o.langs.fr && nv === norm(o.langs.fr) && nv !== nen && !sameAllowed(en, l) && !P.UNIT_TERMS.includes(nv) && !P.UNIT_TERMS.includes(String(v).trim()))
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
    // a script the language does not write: '明日' or 'غدًا' in German, a
    // Cyrillic 'о' inside 'Tomоrrow', Arabic in the Japanese
    for (const l of LANGS) {
      const v = o.langs[l];
      if (v == null || brand(v)) continue;
      const bad = FOREIGN_SCRIPT[l] && FOREIGN_SCRIPT[l].exec(String(v));
      if (bad) add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + l, msg: `${l} '${shortText(v)}' has '${bad[0]}' (U+${bad[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}), a letter ${LANG_NAME[l]} does not write \u2014 another language's word, or a look-alike letter, was pasted in` });
    }
    // Japanese written with simplified-Chinese characters, or the Chinese
    // pasted in whole ('明天' for 明日)
    if (o.langs.ja != null) {
      const simp = [...String(o.langs.ja)].filter((ch) => SIMPLIFIED_ONLY.has(ch));
      if (simp.length) add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ja', msg: `ja '${o.langs.ja}' has ${[...new Set(simp)].join('')}, simplified Chinese \u2014 the Chinese was pasted in` });
      else if (o.langs.zh != null && norm(o.langs.ja) === norm(o.langs.zh) && !/[\u3040-\u30ff]/.test(o.langs.ja) && RE_SCRIPT.zh.test(o.langs.ja) && !sameJaZh(en))
        add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ja', msg: `ja '${o.langs.ja}' is the Chinese, character for character \u2014 if Japanese really writes it the same, list '${en}' in SAME_JA_ZH (tests/i18n/policy.js)` });
    }
  }
  // the ticker lists: the same per item
  for (const li of listObjects) {
    const alpha = LATIN_ALPHABET[li.lang];
    for (const item of li.items) {
      const fx = FOREIGN_SCRIPT[li.lang] && !brand(item) && FOREIGN_SCRIPT[li.lang].exec(String(item));
      if (fx) add({ check: 'B3', file: li.file, line: li.line, fn: li.fn, text: li.key + ' ' + li.lang + ' ' + shortText(item), msg: `${li.lang} item '${shortText(item)}' has '${fx[0]}' (U+${fx[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}), a letter ${LANG_NAME[li.lang]} does not write \u2014 another language's word, or a look-alike letter, was pasted in` });
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
  // Every key a helper is given must be in the tables it reads — through
  // whatever name the helper is reached by (BoardStrings.bs, S.bs, a copy
  // var f = BoardStrings.bs, var b2 = bs) and whatever the key is written as
  // (a literal, either branch of a ternary, a variable holding a literal).
  // A key only known at run time is caught on screen: the store records
  // every miss in BoardStrings.misses, which the rendered check reads.
  const helperTables = P.KEY_HELPERS;
  for (const { rel, unit, isStore } of jsUnits) {
    if (isStore) continue;
    const t = unit.toks;
    const al = storeAliases(unit);
    for (let i = 0; i < t.length - 2; i++) {
      if (t[i].t !== 'id' || !t[i + 1] || t[i + 1].v !== '(') continue;
      if (t[i - 1] && t[i - 1].v === 'function') continue;
      const name = t[i].v;
      const recv = t[i - 1] && (t[i - 1].v === '.' || t[i - 1].v === '?.') ? t[i - 2] : null;
      let tbls = null;
      if (recv) {
        if (recv.t === 'id' && (al.objects.has(recv.v) || /^(window|self|globalThis|root)$/.test(recv.v))) tbls = STORE_METHODS[name] || null;
        else if (name === 'bs') tbls = STORE_METHODS.bs;                  // X.bs('k'), whatever X is
      } else {
        // T/TU/TF are different helpers in different files: the policy names
        // the file a helper belongs to when the name is shared
        const scoped = (P.KEY_HELPERS_BY_FILE || {})[rel] || {};
        const real = al.fns.get(name);
        tbls = scoped[name] || helperTables[name] || (real ? (scoped[real] || helperTables[real] || STORE_METHODS[real]) : null);
      }
      if (!tbls) continue;
      for (const k of keyLiterals(unit, i + 1)) {
        const key = k.v;
        const ok = tbls.some((tn) => (entries[tn] && entries[tn].has(key)) || (majorKeys[tn] && majorKeys[tn].has(key)));
        if (!ok && !brand(key)) add({ check: 'B6', file: rel, line: k.line, fn: unit.fnAt[i], text: name + "('" + key + "')", msg: `'${key}' is not in ${tbls.join(' or ')} \u2014 it renders blank (or, before, its raw key name)` });
      }
    }
  }
  // The literals a call's first argument can be: itself, either branch of a
  // ternary or a logical, or what a variable named there was assigned. A
  // computed key ('st-' + state) is left to the rendered check.
  function keyLiterals(unit, open) {
    const t = unit.toks, close = unit.closeOf[open];
    if (close == null) return [];
    let end = open + 1, d = 0;
    for (; end < close; end++) { const x = t[end]; if (x.v === '(' || x.v === '[' || x.v === '{' || x.v === '${') d++; else if (x.v === ')' || x.v === ']' || x.v === '}' || x.v === '}$') d--; else if (d === 0 && x.v === ',') break; }
    const arg = [];
    for (let j = open + 1; j < end; j++) arg.push(j);
    if (!arg.length) return [];
    if (arg.some((j) => t[j].v === '+' || t[j].t === 'tpl')) return [];
    if (arg.length === 1 && t[arg[0]].t === 'str') return [t[arg[0]]];
    if (arg.length === 1 && t[arg[0]].t === 'id') {
      const nm = t[arg[0]].v, sc = scopeOf(unit, arg[0], nm), out = [];
      for (let j = 0; j < t.length - 2; j++) {
        if (t[j].t === 'id' && t[j].v === nm && t[j + 1] && t[j + 1].v === '=' && t[j + 2] && t[j + 2].t === 'str' && t[j + 3] && /^[;,)}]$/.test(t[j + 3].v)
            && !(t[j - 1] && t[j - 1].v === '.') && scopeOf(unit, j, nm) === sc) out.push(t[j + 2]);
      }
      return out;
    }
    const out = [];
    for (const j of arg) {
      if (t[j].t !== 'str') continue;
      const p = t[j - 1], n = t[j + 1];
      if ((p && /^[!=]==?$/.test(p.v)) || (n && /^[!=]==?$/.test(n.v))) continue;           // a condition
      if (p && !/^(\?|:|\|\||&&|\?\?|\()$/.test(p.v) && j !== open + 1) continue;
      // inside a call within the argument: that call's business
      let k = unit.frameOf[j];
      let nested = false;
      for (; k != null && k > open; k = unit.frameOf[k]) if (t[k].v !== '(' || (t[k - 1] && (t[k - 1].t === 'id' || t[k - 1].v === ')' || t[k - 1].v === ']'))) nested = true;
      if (!nested) out.push(t[j]);
    }
    return out;
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

  // ── B17: two statuses never read the same ──
  // A board shows statuses side by side: 'On time' and 'Scheduled' both
  // reading 定刻 makes two flights look alike that are not. Within each
  // status table (SS, the store's st* keys, fids-v2's st-* keys) and each
  // weather table (the store's wx* keys, _WXLBL), two different English
  // words have two different words in every language ('Flurries' and 'Snow
  // Showers' both read 'Averses de neige').
  {
    const groups = new Map();
    for (const o of allTextObjects) {
      const g = o.table === 'SS' ? 'SS' : (o.table === 'STR' && /^st[A-Z]/.test(o.key || '')) ? 'STR st*' : (o.table === 'TX' && /^st-/.test(o.key || '')) ? 'TX st-*'
        : (o.table === 'STR' && /^wx[A-Z]/.test(o.key || '')) ? 'STR wx*' : o.table === '_WXLBL' ? '_WXLBL' : null;
      if (!g || o.langs.en == null) continue;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(o);
    }
    for (const [g, list] of groups) for (const l of LANGS) {
      if (l === 'en') continue;
      const by = new Map();
      for (const o of list) {
        const v = o.langs[l];
        if (v == null) continue;
        const k = norm(v);
        if (!by.has(k)) by.set(k, new Map());
        by.get(k).set(norm(o.langs.en), o);
      }
      for (const [v, ens] of by) {
        if (ens.size < 2) continue;
        const os = [...ens.values()];
        const allowed = os.every((o) => ((P.SAME_STATUS_WORD || {})[o.langs.en] || []).includes(l));
        if (allowed) { for (const o of os) used.statusSame.add(o.langs.en); continue; }
        add({ check: 'B17', file: os[0].file, line: os[0].line, fn: null, text: g + ' ' + l + ' ' + v, msg: `${os.map((o) => "'" + o.langs.en + "'").join(' and ')} both read '${os[0].langs[l]}' in ${LANG_NAME[l]} (${g}) \u2014 two statuses on one board must read differently` });
      }
    }
  }

  // ── the data vocabulary (B15): the words of the NAME tables ──
  // A literal whose every word is data (a city, an airline, an aircraft, a
  // hotel brand) is not a label. Three things keep that from becoming a way
  // round the guard:
  //   - only tables of names count ('data:' or 'brand:' reasons): a table of
  //     notes ('debug:', 'operator:') is never vocabulary, so a word written
  //     into a debug note is not made data by it;
  //   - a brand counts as its whole phrase, never word by word ('Baggage
  //     Arrival Gateway Screen' does not make 'baggage' data);
  //   - a word the store translates as a label ('gate', 'boarding', 'final',
  //     'status', 'flight', 'information') is never data, whatever table it
  //     also appears in;
  // and, in CI, a word is data only if it was data on main as well
  // (options.dataVocabBase): a word added to a name table in the same change
  // cannot carry a label past the guard.
  DATA_VOCAB = new Set();
  DATA_PHRASES = new Set();
  const nameTable = (why) => /^(data|brand):/.test(String(why || ''));
  const addData = (str) => {
    for (const w of wordsOf(str)) DATA_VOCAB.add(w);
    const np = norm(str);
    if (np) DATA_PHRASES.add(np);
  };
  for (const { rel, unit } of jsUnits) {
    const names = Object.entries((P.DATA_TABLES || {})[rel] || {}).filter(([, why]) => nameTable(why)).map(([n]) => n)
      .concat(P.NONTEXT_TABLES.filter((n) => n.file === rel && n.name && nameTable(n.reason)).map((n) => n.name));
    for (const name of names) {
      const r = dataRange(unit, name);
      if (!r) continue;
      for (let j = r[0]; j < r[1]; j++) if (unit.toks[j].t === 'str' || unit.toks[j].t === 'tpl') addData(unit.toks[j].v);
    }
  }
  for (const k of Object.keys(P.BRAND_TERMS)) DATA_PHRASES.add(norm(k));
  const NAME_WORDS = new Set(DATA_VOCAB);
  for (const k of (P.DATA_WORDS || [])) addData(k);
  // a label word: one the store's English writes in lower case somewhere
  // ('the hotel', 'your gate', 'boarding pass'). A name word (Air, Canada,
  // Airlines) is capitalised wherever the store's English uses it.
  const enLower = new Set();
  const addLower = (v) => { for (const m of String(v).replace(/<[^>]*>/g, ' ').replace(/\{[A-Za-z0-9_]+\}/g, ' ').matchAll(/\p{L}[\p{L}'\u2019-]*/gu)) if (m[0] === m[0].toLowerCase() && /\p{Ll}/u.test(m[0])) enLower.add(m[0].toLowerCase()); };
  for (const o of allTextObjects) if (o.langs.en != null) addLower(o.langs.en);
  for (const li of listObjects) if (li.lang === 'en') for (const it of li.items) addLower(it);
  for (const w of [...DATA_VOCAB]) if (enLower.has(w)) DATA_VOCAB.delete(w);
  LABEL_WORDS = enLower;
  RENDERED = new Map();
  if (options.dataVocabBase) for (const w of [...DATA_VOCAB]) if (!options.dataVocabBase.has(w)) DATA_VOCAB.delete(w);

  // ── B3 (after the data vocabulary): English words inside a translation ──
  // 'Gate closes shortly' for German, 'Today' for German 'Morgen'. A word
  // counts as English when the store's English or the common signage words
  // use it and no other entry's translation (in any language) does. A word
  // kept from the entry's own English stays only when it is a name (a word
  // of the name tables: 'Air France') or a brand: 'Gate Closing Bald' keeps
  // nothing from 'Gate closing soon' that is a name.
  // An English word: one the store's English or everyday English writes, a
  // plural of one ('doors'), or an English adverb ('momentarily').
  // (A plural is read as English only in German and Italian, whose own
  // plurals do not end in -s: French 'archives', Portuguese 'extras' are
  // their own words.)
  const isEnglishWord = (w, l) => w.length >= 3 && (ENGLISH_WORDS.has(w)
    || ((l === 'de' || l === 'it') && w.length >= 5 && /[^s]s$/.test(w) && ENGLISH_WORDS.has(w.slice(0, -1)))
    || (/^[a-z]{3,}ly$/.test(w) && w.length >= 6));
  // the English words in one translation `v` of language l (an entry `o`,
  // or one ticker item), past names, brands, web addresses, words another
  // translation also uses, and the language's own words (NATIVE_WORDS)
  const englishWordsIn = (l, v, en, self) => {
    const out = [];
    const enNames = new Set();
    if (en != null) for (const seg of String(en).split(/\s*[\u00B7|:;.!?()\u2014\u2013]\s*/)) {
      rawWordsOf(seg).forEach((w, k) => { if (/^\p{Lu}/u.test(w) && (k > 0 || /\p{Lu}/u.test(w.slice(1)))) enNames.add(w); });
    }
    const ownEn = new Set(en != null ? rawWordsOf(en) : []);
    // a brand is its whole phrase ('Priority Pass'): taken out first
    let vb = String(v);
    for (const b of Object.keys(P.BRAND_TERMS)) if (vb.includes(b)) { vb = vb.split(b).join(' '); used.brand.add(b); }
    for (const raw of rawWordsOf(vb)) {
      const w = raw.toLowerCase().replace(/['\u2019-]+$/, '');
      if (!isEnglishWord(w, l)) continue;
      if (/^\p{Lu}/u.test(raw) && ownEn.has(raw) && (enNames.has(raw) || NAME_WORDS.has(w) || brand(raw))) continue;   // a name kept as written
      if (new RegExp('(^|[^\\p{L}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.(com|ca|org|net)\\b', 'iu').test(v)) continue;   // a web address
      const users = TRANSLATED_WORDS.get(w);
      if (users && [...users].some((x) => x !== self)) continue;              // another entry's translation uses it
      if (nativeWord(l, w)) continue;
      out.push(raw);
    }
    return out;
  };
  for (const o of allTextObjects) {
    const en = o.langs.en;
    if (en == null) continue;
    for (const l of ['fr', 'es', 'de', 'it', 'pt']) {
      const v = o.langs[l];
      if (v == null || brand(v) || sameAllowed(en, l)) continue;
      for (const raw of englishWordsIn(l, v, en, o))
        add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + l, msg: `${l} '${shortText(v)}' has the English word '${raw}' \u2014 translate it; if it really is ${LANG_NAME[l]}, list it in NATIVE_WORDS (tests/i18n/policy.js)` });
    }
  }
  // the ticker lists: an English line in another language's list, at its own
  // place or any other ('PLEASE WATCH YOUR BELONGINGS' in the German)
  for (const li of listObjects) {
    if (!['fr', 'es', 'de', 'it', 'pt'].includes(li.lang)) continue;
    li.items.forEach((item, k) => {
      if (brand(item)) return;
      const hits = englishWordsIn(li.lang, item, null, li.itemObjs[k]);
      if (hits.length) add({ check: 'B3', file: li.file, line: li.line, fn: li.fn, text: li.key + ' ' + li.lang + ' ' + shortText(item), msg: `${li.lang} item ${k + 1} '${shortText(item)}' has the English word${hits.length > 1 ? 's' : ''} ${hits.map((h) => "'" + h + "'").join(', ')} \u2014 translate it` });
    });
  }

  // ── B3: placeholders, Persian in the Arabic, another Romance language ──
  // A placeholder where a translation belongs ('???', '—', 'TBD', 'TODO',
  // 'N/A', 'Lorem ipsum'): it has no words, or it is not words at all.
  {
    // ('todo' is Spanish and Portuguese for 'all', and English writes TBD
    // and N/A as words of its own)
    const placeholderIn = (v, en, l) => {
      const x = String(v).replace(/\{[A-Za-z0-9_]+\}/g, ' ');
      const own = (tok) => (/^todo$/i.test(tok) && (l === 'es' || l === 'pt')) || (/^(TBD|TBA|N\/A)$/i.test(tok) && l === 'en')
        || (en != null && String(en).includes(tok));
      if (RE_PLACEHOLDER.test(x) && !own(x.trim())) return x.trim() || '(blank)';
      for (const m of x.matchAll(new RegExp(RE_PLACEHOLDER_IN.source, 'g'))) if (!own(m[0])) return m[0];
      return null;
    };
    for (const o of allTextObjects) {
      for (const l of LANGS) {
        const v = o.langs[l];
        if (v == null) continue;
        const ph = placeholderIn(v, l === 'en' ? null : o.langs.en, l);
        if (ph != null) add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: (o.langs.en || o.key) + ' ' + l, msg: `${l} '${shortText(v)}' is a placeholder (${shortText(ph)}), not a translation \u2014 write the ${LANG_NAME[l]} words` });
      }
    }
    for (const li of listObjects) li.items.forEach((item, k) => {
      const ph = placeholderIn(item, null, li.lang);
      if (ph != null) add({ check: 'B3', file: li.file, line: li.line, fn: li.fn, text: li.key + ' ' + li.lang + ' ' + shortText(item), msg: `${li.lang} item ${k + 1} '${shortText(item)}' is a placeholder, not a translation` });
    });
    // Persian or Urdu written for Arabic: their own letters, or a Persian
    // word in Arabic's letters
    const persianIn = (v) => {
      const m = RE_PERSIAN_URDU.exec(String(v));
      if (m) return `'${m[0]}' (U+${m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}), a Persian or Urdu letter`;
      const w = (String(v).match(/[\u0600-\u06FF]+/g) || []).map((x) => x.replace(/[\u064B-\u065F\u0670]/g, '')).find((x) => PERSIAN_WORDS.has(x));
      return w ? `the Persian word '${w}'` : null;
    };
    for (const o of allTextObjects) {
      if (o.langs.ar == null) continue;
      const p = persianIn(o.langs.ar);
      if (p) add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: (o.langs.en || o.key) + ' ar', msg: `ar '${shortText(o.langs.ar)}' has ${p} \u2014 Persian or Urdu, not Arabic` });
    }
    for (const li of listObjects) if (li.lang === 'ar') li.items.forEach((item, k) => {
      const p = persianIn(item);
      if (p) add({ check: 'B3', file: li.file, line: li.line, fn: li.fn, text: li.key + ' ar ' + shortText(item), msg: `ar item ${k + 1} has ${p} \u2014 Persian or Urdu, not Arabic` });
    });

    // Spanish, Italian or Portuguese pasted into another of the three. The
    // three share many words (Programado, Zona, Neve), so a shared value is
    // fine when each language already writes its words in another entry of
    // the store. A value that is new to one of them and is the other's word
    // ('Tramo' in the Portuguese as in the Spanish, 'Domani' in the
    // Portuguese) is a paste, unless SAME_ACROSS (tests/i18n/policy.js) says
    // both languages write it so.
    const ROM = ['es', 'it', 'pt'];
    const attested = Object.fromEntries(ROM.concat(['fr']).map((l) => [l, new Map()]));
    const note = (l, w, who) => { const m = attested[l]; if (!m) return; if (!m.has(w)) m.set(w, new Set()); m.get(w).add(who); };
    const romWords = (s) => rawWordsOf(String(s)).map((w) => w.toLowerCase()).filter((w) => w.length >= 3);
    for (const o of allTextObjects) for (const l of Object.keys(attested)) if (o.langs[l] != null) for (const w of romWords(o.langs[l])) note(l, w, o);
    for (const li of listObjects) if (attested[li.lang]) li.items.forEach((item, k) => { for (const w of romWords(item)) note(li.lang, w, li.itemObjs[k]); });
    const elsewhere = (l, w, self) => [...(attested[l].get(w) || [])].some((x) => x !== self);
    const sameAcross = (en, a, b) => {
      const e = (P.SAME_ACROSS || {})[en];
      if (e && (e.langs || []).includes(a) && (e.langs || []).includes(b)) { used.across.add(en); return true; }
      return false;
    };
    for (const o of allTextObjects) {
      const en = o.langs.en;
      if (en == null) continue;
      for (let a = 0; a < ROM.length; a++) for (let b = a + 1; b < ROM.length; b++) {
        const la = ROM[a], lb = ROM[b], va = o.langs[la], vb = o.langs[lb];
        if (va == null || vb == null) continue;
        const nv = norm(va);
        if (nv !== norm(vb) || nv === norm(en) || !romWords(va).length) continue;
        const newTo = [la, lb].filter((l) => romWords(o.langs[l]).some((w) => !elsewhere(l, w, o) && !nativeWord(l, w)));
        if (!newTo.length || sameAcross(en, la, lb)) continue;
        add({ check: 'B3', file: o.file, line: o.line, fn: o.fn, text: en + ' ' + la + '=' + lb, msg: `${la} and ${lb} both read '${shortText(va)}', and ${newTo.map((l) => LANG_NAME[l]).join(' and ')} use${newTo.length > 1 ? '' : 's'} its words nowhere else in the store \u2014 one language's word pasted into the other? If both really write it so, list '${en}' in SAME_ACROSS (tests/i18n/policy.js)` });
      }
    }
  }

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
  // custom properties a stylesheet draws as text: content: var(--x)
  const contentVars = new Set();
  for (const { css } of cssTexts) for (const d of css.matchAll(/content\s*:\s*([^;{}]*)/g)) for (const m of d[1].matchAll(/var\(\s*(--[\w-]+)/g)) contentVars.add(m[1]);
  // CSS text drawn on screen besides content: quotes (open-quote), a list
  // marker string, a @counter-style's symbols, prefix and suffix, and a
  // custom property drawn with content: var(--x)
  const cssDrawnStrings = (text) => {
    const out = [];
    const clean = String(text).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    for (const d of clean.matchAll(/(?:^|[;{\s"'])(quotes|list-style(?:-type)?|symbols|additive-symbols|prefix|suffix|negative|pad|(--[\w-]+))\s*:\s*([^;{}]*)/g)) {
      if (d[2] && !contentVars.has(d[2])) continue;
      for (const m of d[3].replace(/url\(\s*(["']?)[^)]*\1\s*\)/g, ' ').matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g)) {
        const v = m[2].replace(/\\[0-9a-fA-F]{1,6}\s?/g, ' ').replace(/\\(.)/g, '$1');
        if (countsAsWords(v)) out.push({ v, prop: d[1], at: d.index });
      }
    }
    return out;
  };

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
  // what reaches the screen through a name (pass 2 of RENDERED, below)
  for (const { rel, unit, isStore } of jsUnits) if (!isStore) walkDestinations(rel, unit);

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
      // RENDERED, pass 1: a name whose value is put on screen as text — an
      // operand of a markup chain in its text state, or of a text sink
      if (tk.t === 'id' && !(t[i - 1] && (t[i - 1].v === '.' || t[i - 1].v === '?.')) && !JS_WORDS.has(tk.v)) {
        const f0 = top();
        const sk0 = sinkAt(i);
        const inText = (f0.tag && f0.st && f0.st.st === ST_TEXT)
          || (sk0 && (TEXT_SINK_NAMES.has(sk0.name) || (HTML_SINKS.has(sk0.name) && (!f0.st || f0.st.st === ST_TEXT))));
        // an index (X[k]) or a call's argument (f(x)) is not what is shown,
        // unless the call shows its argument as it is (esc(x))
        const fk = unit.frameOf[i], fo = fk >= 0 ? t[fk] : null, fp = fk > 0 ? t[fk - 1] : null;
        const sub = fo && (fo.v === '[' || fo.v === '(') && fp && (fp.t === 'id' || fp.v === ')' || fp.v === ']') && !(fo.v === '(' && fp.t === 'id' && PASS_THROUGH.test(fp.v));
        if (inText && !sub && !fnIsOperator(rel, unit.fnAt[i], unit.fnPathAt[i])) recordRendered(rel, unit, i);
        continue;
      }
      if (tk.t !== 'str' && tk.t !== 'tpl') continue;
      const f = top();
      let ctx = literalContext(t, i, unit);
      // code-shaped (a URL, a selector, a CSS declaration) is code, except a
      // capitalised word inside markup text, which is a word whatever its
      // punctuation: '<span>' + 'Status: Delayed' + '</span>'
      if (ctx === 'codeish') ctx = (f.tag && f.st && f.st.st === ST_TEXT && /\p{Lu}\p{Ll}/u.test(tk.v)) ? 'plain' : 'excluded';
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
      // CSS written from code: a stylesheet's text, insertRule(), cssText, or
      // a custom property a stylesheet draws with content: var(--x)
      if (!isOp && !inTable(i) && ctx !== 'compare') {
        for (const m of String(tk.v).matchAll(/content\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
          const v = m[2].replace(/\\[0-9a-fA-F]{1,6}\s?/g, ' ').replace(/\\(.)/g, '$1');
          if (countsAsWords(v)) add({ check: 'B9', file: rel, line: tk.line, fn, text: v, msg: `CSS content '${shortText(v)}' written from code is passenger text in one language \u2014 render it from the store as markup` });
        }
        if (/(quotes|list-style|symbols|prefix|suffix|--[\w-]+)\s*:/.test(String(tk.v))) for (const x of cssDrawnStrings(tk.v)) add({ check: 'B9', file: rel, line: tk.line, fn, text: x.v, msg: `CSS ${x.prop} '${shortText(x.v)}' written from code is drawn on screen as text in one language \u2014 render it from the store` });
        const fr0 = unit.frameOf[i];
        if (fr0 >= 0 && t[fr0].v === '(' && t[fr0 - 1] && t[fr0 - 1].v === 'setProperty' && argIndex(t, i, unit) === 1) {
          const q = /^\s*(["'])(.*)\1\s*$/.exec(String(tk.v));
          if (q && countsAsWords(q[2])) add({ check: 'B9', file: rel, line: tk.line, fn, text: q[2], msg: `'${shortText(q[2])}' is a CSS string set from code (setProperty), drawn by content: var() \u2014 render the words from the store as markup` });
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
      if (f.tag || res.tag || f.st) (unit.markupToks = unit.markupToks || new Set()).add(i);
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
        // a style="" that draws text: --x:'…' read by content: var(--x),
        // quotes, a list marker string
        for (const a of res.attrs) {
          if (a.name !== 'style') continue;
          const val = a.value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
          for (const x of cssDrawnStrings(val)) add({ check: 'B9', file: rel, line: tk.line, fn, text: x.v, msg: `CSS ${x.prop} '${shortText(x.v)}' in a style attribute is drawn on screen as text in one language \u2014 render it from the store` });
        }
        // a language half built by hand: <span lang="fr">…
        for (const a of res.attrs) {
          if (a.name === 'lang' && LSET.has(a.value.trim()) && !a.open)
            add({ check: 'B5', file: rel, line: tk.line, fn, text: 'lang="' + a.value.trim() + '"', msg: `a ${a.value.trim()} half built by hand; the store's helpers (bsPair, BoardStrings.half/markHalf with a key) mark halves, and choose their words` });
        }
        for (const r of runs) {
          const rec = { check: 'B5', file: rel, line: tk.line, fn, text: r, msg: looksLikeName(r) ? `'${shortText(r)}' is written into markup \u2014 ${wordAdvice(r)}` : `'${shortText(r)}' is written into markup \u2014 add a key to BOARD_STR (board-strings.js) with all nine languages and render it with bs()/bsPair()` };
          if (f.tag || res.tag) add(rec);
          else {
            rec.sentence = ctx === 'plain' && isSentence(r) ? { check: 'B5', file: rel, line: tk.line, fn, text: r, msg: `'${shortText(r)}' is an English sentence in passenger code \u2014 it belongs in the store` } : null;
            rec.label = !rec.sentence && ctx === 'plain' && isLabel(r) ? { check: 'B15', file: rel, line: tk.line, fn, text: r, msg: `'${shortText(r)}' is a passenger word kept outside the store \u2014 in a variable, a property, a list or a return value it reaches the screen all the same. ${wordAdvice(r)}` } : null;
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

  // ── RENDERED: a word that reaches the screen through a name ──────────
  // Pass 1 (walkMarkup) records each name whose value is put on screen as
  // text; pass 2 (walkDestinations) finds every literal stored under such a
  // name — in a variable, a property, an array, an object's keys or a
  // function's return — and holds it to the store like a literal written
  // into the markup itself. That covers what a label-shaped test cannot: a
  // lower-case word shown in capitals by CSS ({ late: 'delayed' }), a phrase
  // of words that are also names, and a label kept as an object key.
  //   v:<scope>:<name>   a variable           e:<scope>:<name>  its elements
  //   p:<prop>           a property           k:<scope>:<name>  its keys
  //   r:<function>       a function's return value
  // Lexical scope, near enough: the function body that declares a name
  // (var/let/const, a parameter, a function declaration), or '' for a global.
  function bodies(unit) {
    if (unit._bodies) return unit._bodies;
    const t = unit.toks, n = t.length;
    const openOf = new Map();
    for (let o = 0; o < n; o++) if (unit.closeOf[o] != null) openOf.set(unit.closeOf[o], o);
    const isBody = new Set(), decl = new Map();
    const bodyOf = (i) => { for (let k = unit.frameOf[i]; k != null && k >= 0; k = unit.frameOf[k]) if (isBody.has(k)) return k; return null; };
    for (let i = 0; i < n; i++) {
      if (t[i].v !== '{' || unit.isObj[i]) continue;
      const p = t[i - 1];
      if (!p) continue;
      if (p.v === '=>') { isBody.add(i); continue; }
      if (p.v !== ')') continue;
      const o = openOf.get(i - 1);
      if (o == null) continue;
      const b = t[o - 1];
      if (b && b.t === 'id' && /^(if|for|while|switch|catch|with)$/.test(b.v)) continue;
      isBody.add(i);
      // its parameters
      const ps = new Set();
      for (let j = o + 1; j < i - 1; j++) if (unit.frameOf[j] === o && t[j].t === 'id' && t[j + 1] && /^[,)=]$/.test(t[j + 1].v) && !(t[j - 1] && t[j - 1].v === '=')) ps.add(t[j].v);
      decl.set(i, ps);
    }
    for (let i = 0; i < n; i++) {
      if (t[i].t !== 'id') continue;
      let name = null;
      if (/^(var|let|const)$/.test(t[i].v) && t[i + 1] && t[i + 1].t === 'id') name = t[i + 1].v;
      else if (t[i].v === 'function' && t[i + 1] && t[i + 1].t === 'id') name = t[i + 1].v;
      else if (t[i].v === ',' ) name = null;
      if (!name) continue;
      // `var a = 1, b = 2`: the later names of one declaration
      const b = bodyOf(i);
      const key = b == null ? -1 : b;
      if (!decl.has(key)) decl.set(key, new Set());
      decl.get(key).add(name);
      if (/^(var|let|const)$/.test(t[i].v)) {
        let d = 0;
        for (let j = i + 2; j < n; j++) {
          const x = t[j];
          if (x.v === '(' || x.v === '[' || x.v === '{' || x.v === '${') d++;
          else if (x.v === ')' || x.v === ']' || x.v === '}' || x.v === '}$') { if (d === 0) break; d--; }
          else if (d === 0 && x.v === ';') break;
          else if (d === 0 && x.v === ',' && t[j + 1] && t[j + 1].t === 'id' && t[j + 2] && /^[=,;]$/.test(t[j + 2].v)) decl.get(key).add(t[j + 1].v);
        }
      }
    }
    unit._bodies = { bodyOf, decl };
    return unit._bodies;
  }
  function scopeOf(unit, i, name) {
    const { bodyOf, decl } = bodies(unit);
    for (let b = bodyOf(i); b != null; b = bodyOf(b)) if ((decl.get(b) || new Set()).has(name)) return String(b);
    return '';
  }
  function recordRendered(rel, unit, i) {
    const t = unit.toks;
    if (!RENDERED.has(rel)) RENDERED.set(rel, new Set());
    const R = RENDERED.get(rel);
    // a condition, not a value: x === 'a' ? …, !x, x && …
    const before = t[i - 1];
    if (before && /^(!|===|!==|==|!=|<|>|<=|>=|typeof|instanceof|in|void|delete)$/.test(before.v)) return;
    // Object.keys(X) / Object.entries(X): X's keys reach the screen
    if (t[i].v === 'Object' && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && /^(keys|entries)$/.test(t[i + 2].v) && t[i + 3] && t[i + 3].v === '(' && t[i + 4] && t[i + 4].t === 'id') {
      R.add('k:' + scopeOf(unit, i + 4, t[i + 4].v) + ':' + t[i + 4].v);
      return;
    }
    let k = i + 1, last = { kind: 'v', name: t[i].v };
    for (;;) {
      const x = t[k];
      if (!x) break;
      if ((x.v === '.' || x.v === '?.') && t[k + 1] && t[k + 1].t === 'id') {
        const name = t[k + 1].v;
        if (STRING_METHODS.has(name) && t[k + 2] && t[k + 2].v === '(') { k = (unit.closeOf[k + 2] || k + 2) + 1; continue; }   // 'x'.toUpperCase()
        last = { kind: 'p', name };
        k += 2; continue;
      }
      if (x.v === '[' && unit.closeOf[k] != null) { last = { kind: last.kind === 'v' ? 'e' : 'pe', name: last.name }; k = unit.closeOf[k] + 1; continue; }
      if (x.v === '(' && unit.closeOf[k] != null) {
        const callee = last.name;
        // esc(x), String(x): the argument is what is shown
        if (PASS_THROUGH.test(callee) && t[k + 1] && t[k + 1].t === 'id') recordRendered(rel, unit, k + 1);
        last = { kind: 'r', name: callee };
        k = unit.closeOf[k] + 1; continue;
      }
      break;
    }
    const after = t[k];
    if (after && /^(===|!==|==|!=|<|>|<=|>=|\?|&&|instanceof|in)$/.test(after.v)) return;
    const scope = scopeOf(unit, i, t[i].v);
    if (last.kind === 'v') R.add('v:' + scope + ':' + last.name);
    else if (last.kind === 'e') R.add('e:' + scope + ':' + last.name);
    else if (last.kind === 'p') R.add('p:' + last.name);
    else if (last.kind === 'pe') R.add('pe:' + last.name);
    else if (last.kind === 'r') R.add('r:' + last.name);
  }
  // for (k in X) … k on screen: X's keys are on screen
  function forInKeys(rel, unit) {
    const t = unit.toks, R = RENDERED.get(rel);
    if (!R) return;
    for (let i = 0; i < t.length - 6; i++) {
      if (t[i].v !== 'for' || !t[i + 1] || t[i + 1].v !== '(') continue;
      let j = i + 2;
      if (/^(var|let|const)$/.test(t[j].v)) j++;
      if (t[j] && t[j].t === 'id' && t[j + 1] && t[j + 1].v === 'in' && t[j + 2] && t[j + 2].t === 'id') {
        if (R.has('v:' + scopeOf(unit, j, t[j].v) + ':' + t[j].v)) R.add('k:' + scopeOf(unit, j + 2, t[j + 2].v) + ':' + t[j + 2].v);
      }
    }
  }
  // A literal is a passenger word when it reads as one: a label (isLabel),
  // a sentence, or a word the store's English uses as a label ('delayed',
  // 'boarding'), whatever its case.
  function renderedWord(v) {
    const x = stripEntities(stripTags(String(v).replace(RE_INVISIBLE_G, ''))).trim();
    if (!x || x.length > 400 || CSS_LIKE.test(x) || CODE_LIKE.test(x) || CODE_LIKE2.test(x) || codeShaped(x)) return false;
    if (brand(x) || DATA_PHRASES.has(norm(x))) return false;
    if (/^[a-z]+([A-Z][a-z0-9]*)+$|^[a-z0-9]+([_-][a-z0-9]+)+$|^[\w-]+\.[\w.-]+$/.test(x)) return false;   // an identifier
    if (isLabel(x) || isSentence(x)) return true;
    return wordsOf(x).some((w) => w.length >= 2 && (ENGLISH_WORDS.has(w) || LABEL_WORDS.has(w) || ((VOCAB.get(w) || new Set()).size > 0))
      && !DATA_VOCAB.has(w) && !P.UNIT_TERMS.includes(w));
  }
  function walkDestinations(rel, unit) {
    const R = RENDERED.get(rel);
    if (!R || !R.size) return;
    forInKeys(rel, unit);
    const t = unit.toks;
    const ranges = Object.values(tables).filter((x) => x.unit === unit).map((x) => [x.obj.open, x.obj.close]);
    for (const name of Object.keys((P.DATA_TABLES || {})[rel] || {})) { const r = dataRange(unit, name); if (r) ranges.push(r); }
    const inTable = (i) => ranges.some((r) => i > r[0] && i < r[1]);
    const has = (scope, kind, name) => R.has(kind + ':' + scope + ':' + name);
    // each bracket carries where a value written in it ends up
    const frames = [{ dest: null }];
    const top = () => frames[frames.length - 1];
    const report = (i, why) => {
      const v = t[i].v;
      const plain = stripEntities(stripTags(v)).trim();
      if (REPORTED.has(rel + ':' + t[i].line + ':' + plain)) return;
      add({ check: 'B15', file: rel, line: t[i].line, fn: unit.fnAt[i], text: plain, msg: `'${shortText(plain)}' reaches the screen through ${why} \u2014 ${wordAdvice(plain)}` });
    };
    for (let i = 0; i < t.length; i++) {
      const tk = t[i];
      if (tk.t === 'punc' && (tk.v === '(' || tk.v === '[' || tk.v === '{' || tk.v === '${')) {
        const parent = top();
        let dest = null;
        if (tk.v === '[' && !(t[i - 1] && (t[i - 1].t === 'id' || t[i - 1].v === ')' || t[i - 1].v === ']'))) {
          // an array literal: its elements end up as the parent's elements
          if (parent.dest && parent.dest.kind === 'v') dest = { kind: 'e', name: parent.dest.name, scope: parent.dest.scope };
          else if (parent.dest && parent.dest.kind === 'p') dest = { kind: 'pe', name: parent.dest.name };
          else if (parent.dest && parent.dest.kind === 'r') dest = { kind: 're', name: parent.dest.name };
        } else if (tk.v === '{' && unit.isObj[i]) {
          dest = { kind: 'obj', of: parent.dest };
        } else if (tk.v === '(' && !(t[i - 1] && (t[i - 1].t === 'id' || t[i - 1].v === ')' || t[i - 1].v === ']'))) {
          dest = parent.dest;                                     // grouping
        }
        frames.push({ dest, obj: tk.v === '{' && unit.isObj[i] ? dest : null });
        continue;
      }
      if (tk.t === 'punc' && (tk.v === ')' || tk.v === ']' || tk.v === '}' || tk.v === '}$')) { if (frames.length > 1) frames.pop(); continue; }
      if (tk.t === 'punc' && (tk.v === ';' || tk.v === ',')) {
        const f = top();
        f.dest = f.obj ? null : (tk.v === ',' && f.dest && /^(e|pe|re)$/.test(f.dest.kind) ? f.dest : null);
        continue;
      }
      if (tk.t === 'punc' && tk.v === '=' && t[i - 1]) {
        const p = t[i - 1];
        if (p.t === 'id') {
          if (t[i - 2] && (t[i - 2].v === '.' || t[i - 2].v === '?.')) top().dest = { kind: 'p', name: p.v };
          else top().dest = { kind: 'v', name: p.v, scope: scopeOf(unit, i - 1, p.v) };
        } else if (p.v === ']' ) {
          // X[k] = '…' / X.y[k] = '…'
          let k = i - 1, d = 0;
          for (; k >= 0; k--) { if (t[k].v === ']') d++; else if (t[k].v === '[') { d--; if (d === 0) break; } }
          const b = t[k - 1];
          if (b && b.t === 'id') top().dest = (t[k - 2] && t[k - 2].v === '.') ? { kind: 'pe', name: b.v } : { kind: 'e', name: b.v, scope: scopeOf(unit, k - 1, b.v) };
        }
        continue;
      }
      if (tk.t === 'id' && tk.v === 'return') { const fn = unit.fnAt[i]; top().dest = fn ? { kind: 'r', name: fn } : null; continue; }
      // an object literal's key: its value goes to that property, and to
      // the object's own destination (M[k] reads any value of M)
      if ((tk.t === 'id' || tk.t === 'str') && top().obj !== null && frames.length > 1 && unit.isObj[unit.frameOf[i]] && t[i + 1] && t[i + 1].v === ':' && t[i - 1] && (t[i - 1].v === '{' || t[i - 1].v === ',')) {
        const of = top().obj && top().obj.of;
        top().dest = { kind: 'prop', name: String(tk.v), of };
        // a quoted key shown through Object.keys(X)
        if (tk.t === 'str' && of && of.kind === 'v' && has(of.scope, 'k', of.name) && renderedWord(tk.v) && !inTable(i) && !fnIsOperator(rel, unit.fnAt[i], unit.fnPathAt[i]))
          report(i, `the keys of ${of.name} (Object.keys/for…in)`);
        i++;
        continue;
      }
      if (tk.t !== 'str' && tk.t !== 'tpl') continue;
      const d = top().dest;
      if (!d) continue;
      if (inTable(i) || fnIsOperator(rel, unit.fnAt[i], unit.fnPathAt[i])) continue;
      // a piece of a markup chain: B5 read it with the chain's state
      if (unit.markupToks && unit.markupToks.has(i)) continue;
      if (/[<>]|=["']|^["']|["']$/.test(tk.v)) continue;
      if (t[i - 1] && t[i - 1].v === ':' && t[i - 2] && (LSET.has(String(t[i - 2].v)) || (t[i - 2].v === 't' && unit.langRecordObjs && unit.langRecordObjs.has(unit.frameOf[i])))) continue;
      const ctx = literalContext(t, i, unit);
      if (ctx !== 'plain' || dataKeyOf(t, i, unit)) continue;
      if (entries.AD_I18N && entries.AD_I18N.has(tk.v.trim())) continue;
      // a call's argument is the callee's business (bs('k'), esc('…') are
      // read as keys or by the sinks)
      const fr = unit.frameOf[i];
      if (fr >= 0 && t[fr].v === '(' && t[fr - 1] && (t[fr - 1].t === 'id' || t[fr - 1].v === ')' || t[fr - 1].v === ']')) continue;
      if (!renderedWord(tk.v)) continue;
      let why = null;
      if (d.kind === 'v' && has(d.scope, 'v', d.name)) why = 'the variable ' + d.name;
      else if (d.kind === 'e' && has(d.scope, 'e', d.name)) why = 'an element of ' + d.name;
      else if (d.kind === 'p' && R.has('p:' + d.name)) why = 'the property .' + d.name;
      else if (d.kind === 'pe' && R.has('pe:' + d.name)) why = 'an element of .' + d.name;
      else if (d.kind === 'r' && R.has('r:' + d.name)) why = 'the return value of ' + d.name + '()';
      else if (d.kind === 'prop') {
        if (R.has('p:' + d.name)) why = 'the property .' + d.name;
        else if (d.of && d.of.kind === 'v' && has(d.of.scope, 'e', d.of.name)) why = 'a value of ' + d.of.name + '[…]';
        else if (d.of && d.of.kind === 'e' && R.has('p:' + d.name)) why = 'the property .' + d.name;
      }
      if (why) report(i, why);
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
    if (DATA_PHRASES.has(norm(x))) return false;
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

  // A literal that reads as a name (every word capitalised, none a word the
  // store or everyday English uses): 'Fiumicino', 'Daxing', 'Congonhas'.
  // Names are data (decision D2: they stay as written), so their home is a
  // name table, not the store.
  function looksLikeName(x) {
    const ws = rawWordsOf(String(x));
    if (!ws.length || !ws.some((w) => w.length >= 3)) return false;
    return ws.every((w) => /^\p{Lu}/u.test(w) && !LABEL_WORDS.has(w.toLowerCase()) && !ENGLISH_WORDS.has(w.toLowerCase()) && !VOCAB.has(w.toLowerCase()));
  }
  function wordAdvice(x) {
    return looksLikeName(x)
      ? `'${shortText(x)}' reads as a name. A name is data, kept as written (decision D2): it belongs in a name table listed in DATA_TABLES (tests/i18n/policy.js) \u2014 a new name table is an exception, approved on its own first. If it is a word a passenger reads, add it to BOARD_STR (board-strings.js) with all nine languages`
      : 'Add it to BOARD_STR (board-strings.js) with all nine languages and render it with bs()/bsPair()';
  }

  function walkLanguageChoice(rel, unit) {
    const t = unit.toks;
    const n = t.length;
    for (let i = 0; i < n; i++) {
      const tk = t[i];
      const fn = unit.fnAt[i];
      // a language fixed in a call to the store: bs(k, 'fr'), S.bs(k, 'fr'),
      // bsPair(k, { langs: ['en', 'fr'] }), BoardStrings.time(d, 'fr'). The
      // board's languages choose; a literal code chooses for them. (A literal
      // 'en' as the fallback after a language variable — isLang(l) ? l :
      // 'en', l || 'en' — is a default, not a choice.)
      if (tk.t === 'str' && LSET.has(tk.v)) {
        const call = storeCallAround(unit, i, rel);
        if (call && !fallbackDefault(unit, i, call.open))
          add({ check: 'B11', file: rel, line: tk.line, fn, text: call.name + "(…'" + tk.v + "'…)", msg: `${call.name}() is given the language '${tk.v}' \u2014 the board's languages decide (bsPairLangs(langs, iata) for the pair, \`lang\` for the language on screen), never a literal` });
      }
      // lang === 'xx' ? …   /  'xx' === lang ? …   /  lang.indexOf('xx') === 0 ? …
      if (tk.t === 'str' && LSET.has(tk.v)) {
        const p = t[i - 1];
        let nx = t[i + 1];
        let iAfter = i;
        const fr0 = unit.frameOf[i];
        if (fr0 >= 0 && t[fr0].v === '(' && t[fr0 - 1] && /^(indexOf|lastIndexOf|startsWith|endsWith|includes|test|match|search)$/.test(t[fr0 - 1].v) && unit.closeOf[fr0] === i + 1) {
          iAfter = i + 1; nx = t[i + 2];
        }
        const cmpBefore = p && /^[!=]==?$/.test(p.v);
        const cmpAfter = nx && (/^[!=]==?$/.test(nx.v) || (iAfter !== i && /^(\?|&&|>|<|>=|<=)$/.test(nx.v)));
        if (cmpBefore || cmpAfter) {
          // within the next few tokens, a ? (or &&) choosing a string — out
          // through any parentheses: (lang === 'fr') ? 'Fermeture' : …
          let j = iAfter + (cmpAfter ? 2 : 1), d = 0;
          if (iAfter !== i && nx && /^(\?|&&)$/.test(nx.v)) j = iAfter + 1;
          for (; j < Math.min(n, i + 14); j++) {
            if (t[j].v === '(' || t[j].v === '[') d++;
            else if (t[j].v === ')' || t[j].v === ']') { if (d > 0) d--; }
            else if (d === 0 && (t[j].v === '?' || t[j].v === '&&')) break;
            else if (t[j].v === ';' || t[j].v === '{' || (d === 0 && t[j].v === ',')) { j = n; break; }
          }
          if (j < n && (t[j].v === '?' || t[j].v === '&&') && t[j + 1] && (((t[j + 1].t === 'str' || t[j + 1].t === 'tpl') && RE_WORD.test(t[j + 1].v) && !LANG_CODE_RE.test(t[j + 1].v.trim()))
              || (t[j + 1].t === 'id' && t[j + 2] && (t[j + 2].v === '(' || t[j + 2].v === '.') && /^(bs|bsFmt|bsPair|TL|SL|TLin|_gateLbl\w*|BoardStrings|Strings|S)$/.test(t[j + 1].v))))
            add({ check: 'B11', file: rel, line: tk.line, fn, text: "=== '" + tk.v + "' ?", msg: `a word chosen by comparing the language; per-language words live in the store (bs/bsPair) and per-language settings in BoardStrings.META` });
          // … or an if-statement whose body picks a word: if (lang === 'fr') x = 'Fermeture'
          if (j >= n) {
            let k = i, dd = 0;
            for (; k > Math.max(0, i - 8); k--) { if (t[k].v === ')') dd++; else if (t[k].v === '(') { if (dd === 0) break; dd--; } }
            if (t[k] && t[k].v === '(' && t[k - 1] && t[k - 1].v === 'if' && unit.closeOf[k]) {
              const c = unit.closeOf[k];
              for (let m = c + 1; m < Math.min(n, c + 8); m++) {
                if (t[m].v === ';' || t[m].v === '}') break;
                if ((t[m].t === 'str' || t[m].t === 'tpl') && (isLabel(t[m].v) || isSentence(t[m].v)) && /^(plain|codeish)$/.test(literalContext(t, m, unit)) && !codeShaped(t[m].v)) {
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
      // any read of a word table's English outside the store's helpers:
      // x.en standing in for the language on screen (a fallback, or a fixed
      // English half). META.en (settings) is not words.
      if (tk.t === 'id' && tk.v === 'en' && t[i - 1] && (t[i - 1].v === '.' || t[i - 1].v === '?.') && t[i - 2] && (t[i - 2].t === 'id' || t[i - 2].v === ')' || t[i - 2].v === ']') && t[i - 2].v !== 'META'
          && !(t[i + 1] && /^(\(|=|\+=|\|\|=|\?\?=)$/.test(t[i + 1].v)) && !(t[i - 3] && t[i - 3].v === '.' && t[i - 4] && t[i - 4].v === 'META')
          && !(t[i - 3] && t[i - 3].v === '||')) {
        add({ check: 'B11', file: rel, line: tk.line, fn, text: (t[i - 2].t === 'id' ? t[i - 2].v : '(…)') + '.en', msg: 'the English read directly — a fallback, or a half fixed in English. Read the language the board is showing (every entry has all nine)' });
      }
      if (tk.t === 'punc' && (tk.v === '||' || tk.v === '??') && t[i + 1] && t[i + 1].t === 'id' && t[i + 2] && t[i + 2].v === '[' && t[i + 3] && t[i + 3].t === 'str' && t[i + 3].v === 'en' && t[i + 4] && t[i + 4].v === ']') {
        add({ check: 'B11', file: rel, line: tk.line, fn, text: "|| " + t[i + 1].v + "['en']", msg: 'an English fallback: a missing language shows English' });
      }
      // a label helper falling back to the raw value: SL(k) || k.toUpperCase(),
      // TL(k) || f.status — a key the table lacks shows the feed's English
      // code instead of nothing (the key must exist; the rendered check
      // reads BoardStrings.misses for keys only known at run time)
      if (tk.t === 'punc' && (tk.v === '||' || tk.v === '??') && t[i - 1] && t[i - 1].v === ')' && t[i + 1] && t[i + 1].t === 'id') {
        const callee = calleeOfClose(t, i - 1);
        const nx = t[i + 1];
        const isHelperNext = (STORE_LANG_FUNCS.has(nx.v) || /^(TL|TLF|SL|SLbi|TLbi|adTL|fidsT|tioLabel|BoardStrings|Strings)$/.test(nx.v));
        if (callee && /^(TL|TLF|SL|TLin|_gateLbl\w*|_g8Sign\w*|adTL|fidsT|tioLabel|bs|bsPair|bsFmt)$/.test(callee) && !isHelperNext && !/^(undefined|null)$/.test(nx.v))
          add({ check: 'B5', file: rel, line: tk.line, fn, text: callee + '(…) ' + tk.v + ' ' + nx.v, msg: `${callee}() falls back to the raw value (${nx.v}) when its key is missing \u2014 that is the feed's English code on a board in any language; the key must exist, and an unknown one shows nothing` });
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
      // a language picked by its position through a method: langs.filter(…)[0],
      // langs.slice(1, 2), langs.at(-1), langs.shift(), LANGS[3]
      if (tk.t === 'id' && LANG_LIST_NAME.test(tk.v) && !(t[i - 1] && t[i - 1].v === '.' && !(t[i - 2] && /^(BoardStrings|Strings|api)$/.test(t[i - 2].v)))) {
        let k = i + 1, picked = null;
        while (t[k] && t[k].v === '.' && t[k + 1] && t[k + 1].t === 'id' && t[k + 2] && t[k + 2].v === '(' && unit.closeOf[k + 2] != null) {
          const m = t[k + 1].v, a = k + 3, close = unit.closeOf[k + 2];
          if (m === 'slice' && t[a] && (t[a].t === 'num' || (t[a].v === '-' && t[a + 1] && t[a + 1].t === 'num')) && !(t[a].v === '0' && t[a + 1] && t[a + 1].v === ')')) { picked = 'slice'; break; }
          if (/^(at|shift|pop)$/.test(m)) {
            // langs.shift(); as a statement keeps the list short; a pick uses it
            const pv = t[i - 1];
            if (m === 'at' || (pv && /^(=|\(|,|return|:|\?|\+|\[|&&|\|\|)$/.test(pv.v))) picked = m;
            break;
          }
          k = close + 1;
        }
        if (!picked && k > i + 1 && t[k] && t[k].v === '[' && t[k + 1] && t[k + 1].t === 'num') picked = '[' + t[k + 1].v + ']';
        if (!picked && tk.v === 'LANGS' && t[i + 1] && t[i + 1].v === '[' && t[i + 2] && t[i + 2].t === 'num') picked = '[' + t[i + 2].v + ']';
        const owners = P.LANG_POSITION_FUNCTIONS && P.LANG_POSITION_FUNCTIONS[rel] || {};
        if (picked && !(picked === 'slice' && t[k + 3] && t[k + 3].v === '0' && t[k + 5] && t[k + 5].v === '2')) {
          if (fn && Object.prototype.hasOwnProperty.call(owners, fn)) used.position.add(rel + ':' + fn);
          else add({ check: 'B11', file: rel, line: tk.line, fn, text: tk.v + '…' + picked, msg: 'a language picked by its position; the pair is bsPairLangs(langs, iata) (the Québec rule), the language on screen is `lang`' });
        }
      }
      // a locale chosen outside the store: toLocaleTimeString([], …),
      // Intl.DateTimeFormat(navigator.language), toLocaleString() — the
      // browser's language, or any locale not the store's own
      // (BoardStrings.intl(lang), BoardStrings.META[lang].intl)
      if (tk.t === 'id' && LOCALE_CALLS.test(tk.v) && t[i + 1] && t[i + 1].v === '(' && unit.closeOf[i + 1] != null) {
        const isIntl = t[i - 1] && t[i - 1].v === '.' && t[i - 2] && t[i - 2].v === 'Intl';
        const isMethod = t[i - 1] && t[i - 1].v === '.' && !isIntl;
        if (isIntl || (isMethod && /^toLocale/.test(tk.v))) {
          const close = unit.closeOf[i + 1];
          let a0 = i + 2, a1 = a0, d = 0;
          for (; a1 < close; a1++) { const x = t[a1]; if (x.v === '(' || x.v === '[' || x.v === '{') d++; else if (x.v === ')' || x.v === ']' || x.v === '}') d--; else if (d === 0 && x.v === ',') break; }
          const arg = t.slice(a0, a1);
          const literal = arg.length === 1 && arg[0].t === 'str';           // reported by the literal-locale check below
          const viaStore = arg.some((x) => x.v === 'intl') && arg.some((x) => /^(META|BoardStrings|Strings|S|intl)$/.test(x.v));
          if (!literal && !viaStore && !inLogCall(unit, i))
            add({ check: 'B11', file: rel, line: tk.line, fn, text: (isIntl ? 'Intl.' : '') + tk.v + '(' + (arg.length ? arg.map((x) => x.t === 'str' ? JSON.stringify(x.v) : x.v).join('').slice(0, 40) : '') + ')', msg: 'a locale chosen outside the store \u2014 the browser\'s language or a private choice; times, dates and numbers go through BoardStrings.time/date/weekday/num, or take BoardStrings.intl(lang)' });
        }
      }
      // the browser's language: only the store's resolver reads it
      if (tk.t === 'id' && tk.v === 'navigator' && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && /^(language|languages|userLanguage|browserLanguage)$/.test(t[i + 2].v))
        add({ check: 'B11', file: rel, line: tk.line, fn, text: 'navigator.' + t[i + 2].v, msg: 'the browser\'s language is read by the store\'s resolver only (BoardStrings.resolveLangs); a board speaks its own languages' });
      // a literal locale or hour12
      if (tk.t === 'id' && /^(toLocaleTimeString|toLocaleDateString|toLocaleString|DateTimeFormat)$/.test(tk.v) && t[i + 1] && t[i + 1].v === '(' && t[i + 2] && t[i + 2].t === 'str' && /^[a-z]{2}(-[A-Z]{2})?$/.test(t[i + 2].v))
        add({ check: 'B11', file: rel, line: tk.line, fn, text: tk.v + "('" + t[i + 2].v + "')", msg: 'a locale chosen in place; times and dates go through bsTime/bsDate/bsWeekday (BoardStrings.META)' });
      if (tk.t === 'id' && (tk.v === 'hour12' || tk.v === 'hourCycle') && t[i + 1] && t[i + 1].v === ':' && t[i - 1] && (t[i - 1].v === '{' || t[i - 1].v === ','))
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
      // text built so that no literal shows it: String.fromCharCode(71, 97…),
      // atob('R2F0ZQ=='), ['G','a','t','e'].join(''), 'setag'.split('').reverse()
      if (tk.t === 'id' && /^(fromCharCode|fromCodePoint)$/.test(tk.v) && t[i + 1] && t[i + 1].v === '(' && unit.closeOf[i + 1] != null && !inLogCall(unit, i)) {
        const args = t.slice(i + 2, unit.closeOf[i + 1]).filter((x) => x.v !== ',');
        if (args.length >= 2 && args.every((x) => x.t === 'num')) add({ check: 'B5', file: rel, line: tk.line, fn, text: String.fromCharCode(...args.map((x) => +x.v)), msg: 'text built from character codes — a word a passenger reads comes from the store, written as itself' });
      }
      if (tk.t === 'id' && tk.v === 'atob' && t[i + 1] && t[i + 1].v === '(' && t[i + 2] && t[i + 2].t === 'str' && t[i + 3] && t[i + 3].v === ')' && !inLogCall(unit, i)) {
        let dec = ''; try { dec = Buffer.from(t[i + 2].v, 'base64').toString('utf8'); } catch (e) { dec = ''; }
        add({ check: 'B5', file: rel, line: tk.line, fn, text: dec || t[i + 2].v, msg: 'text hidden in base64 (atob of a literal) — a word a passenger reads comes from the store, written as itself' });
      }
      if (tk.t === 'punc' && tk.v === '[' && unit.closeOf[i] != null && t[unit.closeOf[i] + 1] && t[unit.closeOf[i] + 1].v === '.' && t[unit.closeOf[i] + 2] && t[unit.closeOf[i] + 2].v === 'join'
          && !(t[i - 1] && (t[i - 1].t === 'id' || t[i - 1].v === ')' || t[i - 1].v === ']'))) {
        const items = t.slice(i + 1, unit.closeOf[i]).filter((x) => x.v !== ',');
        if (items.length >= 3 && items.every((x) => x.t === 'str' && [...x.v].length <= 1) && /\p{L}{3}/u.test(items.map((x) => x.v).join('')))
          add({ check: 'B5', file: rel, line: tk.line, fn, text: items.map((x) => x.v).join(''), msg: 'a word spelled out letter by letter and joined — a word a passenger reads comes from the store' });
      }
      if (tk.t === 'str' && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && t[i + 2].v === 'split' && t[i + 3] && t[i + 3].v === '(' && t[i + 4] && t[i + 4].t === 'str' && t[i + 4].v === ''
          && t[i + 5] && t[i + 5].v === ')' && t[i + 6] && t[i + 6].v === '.' && t[i + 7] && t[i + 7].v === 'reverse' && /\p{L}{3}/u.test(tk.v))
        add({ check: 'B5', file: rel, line: tk.line, fn, text: [...tk.v].reverse().join(''), msg: 'a word written backwards and reversed at run time — a word a passenger reads comes from the store' });
      // JSON.parse of a literal: its strings are literals all the same
      if (tk.t === 'id' && tk.v === 'parse' && t[i - 1] && t[i - 1].v === '.' && t[i - 2] && t[i - 2].v === 'JSON' && t[i + 1] && t[i + 1].v === '(' && t[i + 2] && t[i + 2].t === 'str' && t[i + 3] && t[i + 3].v === ')') {
        let obj = null; try { obj = JSON.parse(t[i + 2].v); } catch (e) { obj = null; }
        const strs = [];
        (function walk(x) { if (typeof x === 'string') strs.push(x); else if (x && typeof x === 'object') for (const k of Object.keys(x)) { strs.push(k); walk(x[k]); } })(obj);
        for (const v of strs) if (!codeShaped(v) && (isLabel(v) || isSentence(v)) && !fnIsOperator(rel, fn, unit.fnPathAt[i]))
          add({ check: 'B15', file: rel, line: tk.line, fn, text: v, msg: `'${shortText(v)}' is a passenger word inside a JSON literal — add it to BOARD_STR (board-strings.js) with all nine languages` });
      }
      // a label kept as an object key and read back by Object.keys/entries
      if (tk.t === 'id' && tk.v === 'Object' && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && /^(keys|entries|getOwnPropertyNames)$/.test(t[i + 2].v) && t[i + 3] && t[i + 3].v === '(' && t[i + 4] && t[i + 4].v === '{' && unit.isObj[i + 4]) {
        const o = unit.objects.find((x) => x.open === i + 4);
        for (const k of (o ? o.keys : [])) if (/[\s\p{Lu}]/u.test(k.k) && (isLabel(k.k) || isSentence(k.k)) && !fnIsOperator(rel, fn, unit.fnPathAt[i]))
          add({ check: 'B15', file: rel, line: k.line, fn, text: k.k, msg: `'${shortText(k.k)}' is a passenger word kept as an object key and read back with Object.${t[i + 2].v} — add it to BOARD_STR (board-strings.js) with all nine languages` });
      }
      // ── a language fixed another way (round 5) ──
      // a language held in a name: var L = 'fr'; bs(k, L) — also 'f' + 'r',
      // { l: 'fr' }.l. Every value the name is given in its scope is a
      // literal language code.
      if (tk.t === 'punc' && tk.v === '(' && unit.closeOf[i] != null) {
        const call = storeCallAt(unit, i, rel);
        if (call) {
          const close = unit.closeOf[i];
          let a = i + 1;
          while (a < close) {
            let b = a, d = 0;
            for (; b < close; b++) { const x = t[b]; if (x.v === '(' || x.v === '[' || x.v === '{' || x.v === '${') d++; else if (x.v === ')' || x.v === ']' || x.v === '}' || x.v === '}$') d--; else if (d === 0 && x.v === ',') break; }
            const n0 = b - a;
            const simple = t[a] && t[a].t === 'id' && !JS_WORDS.has(t[a].v) && (n0 === 1 || (n0 === 3 && (t[a + 1].v === '.' || t[a + 1].v === '?.') && t[a + 2].t === 'id')
              || (n0 === 4 && t[a + 1].v === '[' && t[a + 2].t === 'str' && t[a + 3].v === ']'));
            if (simple && !/^(BoardStrings|Strings|window|self|globalThis)$/.test(t[a].v)) {
              const r = assignedValues(unit, a);
              if (r.lits.length && !r.other && r.lits.every((v) => LSET.has(v)))
                add({ check: 'B11', file: rel, line: t[a].line, fn, text: call.name + '(…' + t.slice(a, b).map((x) => x.v).join('') + "='" + r.lits[0] + "'…)", msg: `${call.name}() is given the language '${r.lits[0]}' through ${t.slice(a, b).map((x) => x.v).join('')} — the board's languages decide (bsPairLangs(langs, iata) for the pair, \`lang\` for the language on screen), never a fixed one` });
            }
            a = b + 1;
          }
        }
      }
      // the board's languages overwritten: lang = 'en', langs = ['en', 'fr'],
      // langs.splice(0, langs.length, 'en', 'fr')
      if (tk.t === 'id' && /^(lang|langs|_boardLangs|boardLangs)$/.test(tk.v) && !(t[i - 1] && /^(\.|\?\.|var|let|const)$/.test(t[i - 1].v))) {
        const nx = t[i + 1];
        let lit = null;
        if (nx && nx.v === '=' && t[i + 2]) {
          if (t[i + 2].t === 'str' && LSET.has(t[i + 2].v) && t[i + 3] && /^[;,)}]$/.test(t[i + 3].v)) lit = t[i + 2].v;
          else if (t[i + 2].v === '[' && unit.closeOf[i + 2] != null) {
            const c = unit.closeOf[i + 2], items = t.slice(i + 3, c).filter((x) => x.v !== ',');
            if (items.length && items.every((x) => x.t === 'str' && LSET.has(x.v))) lit = '[' + items.map((x) => x.v).join(',') + ']';
          }
        } else if (nx && nx.v === '.' && t[i + 2] && /^(splice|push|unshift|fill)$/.test(t[i + 2].v) && t[i + 3] && t[i + 3].v === '(' && unit.closeOf[i + 3] != null) {
          const c = unit.closeOf[i + 3];
          const codes = t.slice(i + 4, c).filter((x) => unit.frameOf[t.indexOf(x)] === i + 3 && x.t === 'str' && LSET.has(x.v));
          if (codes.length) lit = t[i + 2].v + '(' + codes.map((x) => x.v).join(',') + ')';
        }
        if (lit) add({ check: 'B11', file: rel, line: tk.line, fn, text: tk.v + ' = ' + lit, msg: `the board's languages overwritten with ${lit} — they are chosen by the resolver (bsResolveLangs) and toggleLang, never fixed in code` });
      }
      // a language picked by a literal out of a table: X.fr, X['fr'],
      // BoardStrings.entry(k).fr (x.en has its own rule above). META holds
      // settings, not words.
      if (((tk.t === 'id' && LSET.has(tk.v) && tk.v !== 'en' && t[i - 1] && (t[i - 1].v === '.' || t[i - 1].v === '?.'))
          || (tk.t === 'str' && LSET.has(tk.v) && t[i - 1] && t[i - 1].v === '[' && t[i + 1] && t[i + 1].v === ']'))
          && t[i - 2] && ((t[i - 2].t === 'id' && !JS_WORDS.has(t[i - 2].v)) || t[i - 2].v === ')' || t[i - 2].v === ']') && t[i - 2].v !== 'META'
          && !(t[i + (tk.t === 'str' ? 2 : 1)] && /^(=|\+=|\|\|=|\?\?=)$/.test(t[i + (tk.t === 'str' ? 2 : 1)].v))
          && !(t[i + 1] && t[i + 1].v === '(')) {
        const helperFns = new Set(['TL', 'TLF', 'SL', '_legacyPair', '_gateLbl', '_gateLbl1', '_gateLaneLbl', 'adTL', 'fidsT', 'T']);
        const recv = t[i - 2].t === 'id' ? t[i - 2].v : '(…)';
        const isMetaChain = t[i - 3] && t[i - 3].v === '.' && t[i - 4] && t[i - 4].v === 'META';
        if (!isMetaChain && !(fn && helperFns.has(fn)) && !(tables[recv] && tables[recv].file === rel && ((P.LEGACY_STORES.find((x) => x.name === recv) || {}).helpers || []).includes(fn)))
          add({ check: 'B11', file: rel, line: tk.line, fn, text: recv + '.' + tk.v, msg: `the ${LANG_NAME[tk.v]} picked by a literal (${recv}.${tk.v}) — read the language the board is showing through the store's helpers` });
      }
      // … or by a name that only ever holds a literal code: var L = 'fr'; X.k[L]
      if (tk.t === 'id' && t[i - 1] && t[i - 1].v === '[' && t[i + 1] && t[i + 1].v === ']' && !JS_WORDS.has(tk.v)
          && t[i - 2] && ((t[i - 2].t === 'id' && !JS_WORDS.has(t[i - 2].v)) || t[i - 2].v === ')' || t[i - 2].v === ']') && t[i - 2].v !== 'META'
          && !(t[i + 2] && /^(=|\+=|\|\|=|\?\?=|\()$/.test(t[i + 2].v))) {
        const r = assignedValues(unit, i);
        if (r.lits.length && !r.other && r.lits.every((v) => LSET.has(v)))
          add({ check: 'B11', file: rel, line: tk.line, fn, text: (t[i - 2].t === 'id' ? t[i - 2].v : '(…)') + '[' + tk.v + "='" + r.lits[0] + "']", msg: `the ${LANG_NAME[r.lits[0]]} picked through ${tk.v}, which only ever holds '${r.lits[0]}' \u2014 read the language the board is showing through the store's helpers` });
      }
      // a locale method reached by a name built from literals: d['toLocale' + 'TimeString']
      if (tk.t === 'punc' && tk.v === '[' && unit.closeOf[i] != null && t[i - 1] && (t[i - 1].t === 'id' || t[i - 1].v === ')' || t[i - 1].v === ']')) {
        const inner = t.slice(i + 1, unit.closeOf[i]);
        if (inner.length >= 3 && inner.every((x, k) => (k % 2 === 0 ? x.t === 'str' : x.v === '+'))) {
          const nm = inner.filter((x) => x.t === 'str').map((x) => x.v).join('');
          if (LOCALE_CALLS.test(nm) || /^(toDateString|toUTCString|toGMTString|toTimeString)$/.test(nm))
            add({ check: 'B11', file: rel, line: tk.line, fn, text: "['" + nm + "']", msg: `${nm} reached by a name built from pieces \u2014 times and dates go through bsTime/bsDate` });
        }
      }
      // a language's settings picked by a literal: BoardStrings.META.en.intl
      // as a locale is English whatever the board shows
      if (tk.t === 'id' && tk.v === 'META' && t[i + 1] && ((t[i + 1].v === '.' && t[i + 2] && LSET.has(t[i + 2].v)) || (t[i + 1].v === '[' && t[i + 2] && t[i + 2].t === 'str' && LSET.has(t[i + 2].v)))) {
        // (META[l] || META.en): the fallback after the board's own language
        const pv = t[i - 1], pv2 = t[i - 2];
        const fallback = (pv && pv.v === '||') || (pv && pv.v === '.' && pv2 && /^(BoardStrings|Strings|api)$/.test(pv2.v) && t[i - 3] && t[i - 3].v === '||');
        if (!fallback) add({ check: 'B11', file: rel, line: tk.line, fn, text: 'META.' + (t[i + 2].v), msg: `the ${LANG_NAME[t[i + 2].v] || t[i + 2].v} settings picked by a literal (META.${t[i + 2].v}) — the board's language decides (BoardStrings.intl(lang), bsTime/bsDate)` });
      }
      // a store entry taken apart by its language keys: var { en } = STR.k
      if (tk.t === 'id' && /^(var|let|const)$/.test(tk.v) && t[i + 1] && t[i + 1].v === '{' && unit.closeOf[i + 1] != null) {
        const c = unit.closeOf[i + 1];
        let hit = null;
        for (let j = i + 2; j < c && !hit; j++) {
          if (unit.frameOf[j] !== i + 1) continue;
          const k = t[j];
          if ((k.t === 'id' || k.t === 'str') && LSET.has(k.v) && (t[j - 1].v === '{' || t[j - 1].v === ',') && t[j + 1] && /^[,}:=]$/.test(t[j + 1].v)) hit = k.v;
        }
        if (hit && t[c + 1] && t[c + 1].v === '=') add({ check: 'B11', file: rel, line: tk.line, fn, text: '{ ' + hit + ' } =', msg: `a language taken out of an entry by name ({ ${hit} }) \u2014 read the language the board is showing through the store's helpers` });
      }
      // a language picked by position out of an entry or a pair:
      // Object.values(entry)[0], BoardStrings.pairLangs(langs)[1]
      if (tk.t === 'id' && ((tk.v === 'Object' && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && /^(values|entries)$/.test(t[i + 2].v) && t[i + 3] && t[i + 3].v === '(')
          || (/^(pairLangs|bsPairLangs|frenchFirst)$/.test(tk.v) && t[i + 1] && t[i + 1].v === '('))) {
        const open = tk.v === 'Object' ? i + 3 : i + 1, close = unit.closeOf[open];
        // (the first of the pair is the language the board leads with: [0] is its own choice)
        if (close != null && t[close + 1] && t[close + 1].v === '[' && t[close + 2] && t[close + 2].t === 'num' && !(tk.v !== 'Object' && t[close + 2].v === '0')) {
          const owners = P.LANG_POSITION_FUNCTIONS && P.LANG_POSITION_FUNCTIONS[rel] || {};
          if (fn && Object.prototype.hasOwnProperty.call(owners, fn)) used.position.add(rel + ':' + fn);
          else add({ check: 'B11', file: rel, line: tk.line, fn, text: (tk.v === 'Object' ? 'Object.' + t[i + 2].v : tk.v) + '(…)[' + t[close + 2].v + ']', msg: 'a language picked by its position; the pair is bsPairLangs(langs, iata) (the Québec rule), the language on screen is `lang`' });
        }
      }
      // a date or time written in English by the browser: toDateString(),
      // toUTCString(), String(new Date()), new Date().toString(), and a
      // locale call borrowed through .call/.apply
      if (tk.t === 'id' && /^(toDateString|toUTCString|toGMTString|toTimeString)$/.test(tk.v) && t[i - 1] && t[i - 1].v === '.' && t[i + 1] && t[i + 1].v === '(' && !inLogCall(unit, i))
        add({ check: 'B11', file: rel, line: tk.line, fn, text: tk.v + '()', msg: `${tk.v}() writes the date in English whatever the board shows — dates and times go through bsDate/bsWeekday/bsTime and BoardStrings.boardTime` });
      if (tk.t === 'id' && tk.v === 'String' && t[i + 1] && t[i + 1].v === '(' && t[i + 2] && t[i + 2].v === 'new' && t[i + 3] && t[i + 3].v === 'Date' && !inLogCall(unit, i))
        add({ check: 'B11', file: rel, line: tk.line, fn, text: 'String(new Date())', msg: 'a Date turned into text is English (Mon Oct 05 2026…) — dates and times go through bsDate/bsTime' });
      if (tk.t === 'id' && tk.v === 'new' && t[i + 1] && t[i + 1].v === 'Date' && t[i + 2] && t[i + 2].v === '(' && unit.closeOf[i + 2] != null) {
        const c = unit.closeOf[i + 2];
        if (t[c + 1] && t[c + 1].v === '.' && t[c + 2] && t[c + 2].v === 'toString' && !inLogCall(unit, i))
          add({ check: 'B11', file: rel, line: tk.line, fn, text: 'new Date().toString()', msg: 'a Date turned into text is English — dates and times go through bsDate/bsTime' });
      }
      if (tk.t === 'id' && LOCALE_CALLS.test(tk.v) && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && /^(call|apply)$/.test(t[i + 2].v) && !inLogCall(unit, i))
        add({ check: 'B11', file: rel, line: tk.line, fn, text: tk.v + '.' + t[i + 2].v, msg: 'a locale call borrowed through .call/.apply, with a locale the store did not choose — times and dates go through bsTime/bsDate' });
      // a 12-hour clock written by hand: h < 12 ? 'am' : 'pm'
      if (tk.t === 'str' && /^\s*[AaPp]\.?\s?[Mm]\.?\s*$/.test(tk.v) && t[i - 1] && (t[i - 1].v === '?' || t[i - 1].v === ':')) {
        let other = null;
        if (t[i - 1].v === '?' && t[i + 1] && t[i + 1].v === ':' && t[i + 2] && t[i + 2].t === 'str') other = t[i + 2].v;
        if (t[i - 1].v === ':' && t[i - 2] && t[i - 2].t === 'str' && t[i - 3] && t[i - 3].v === '?') other = t[i - 2].v;
        if (other != null && /^\s*[AaPp]\.?\s?[Mm]\.?\s*$/.test(other) && t[i - 1].v === '?')
          add({ check: 'B11', file: rel, line: tk.line, fn, text: "? '" + tk.v.trim() + "' : '" + other.trim() + "'", msg: "a 12-hour clock's am/pm written by hand — English's own words on every board; times go through BoardStrings.boardTime/boardClockText (a board reads the clock of the language it leads with)" });
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

  // The store's helpers a language can be given to, by name; and the
  // store's methods, on BoardStrings or any name it is copied to.
  function storeAliases(unit) {
    if (unit._storeAliases) return unit._storeAliases;
    const t = unit.toks, out = new Set(['BoardStrings', 'Strings']), fns = new Map();
    for (let i = 0; i < t.length - 2; i++) {
      if (t[i].t !== 'id' || !t[i + 1] || t[i + 1].v !== '=' ) continue;
      // X = BoardStrings / window.BoardStrings / (… && window.BoardStrings) || require(…)
      let j = i + 2, d = 0, hit = false, end = i + 2;
      for (; j < Math.min(t.length, i + 40); j++) {
        const x = t[j];
        if (x.v === '(' || x.v === '[' || x.v === '{') d++;
        else if (x.v === ')' || x.v === ']' || x.v === '}') { if (d === 0) break; d--; }
        else if (d === 0 && (x.v === ';' || x.v === ',')) break;
        if (x.t === 'id' && x.v === 'BoardStrings' && !(t[j + 1] && t[j + 1].v === '.' && t[j + 2] && t[j + 2].t === 'id' && !/^(bs|fmt|pair|half|markHalf|list|time|date|weekday|pairLangs|frenchFirst|intl|num)$/.test(t[j + 2].v))) hit = true;
        end = j;
      }
      if (!hit) continue;
      // f = BoardStrings.bs  → a helper copied under another name
      const last = t[end], before = t[end - 1];
      if (last && last.t === 'id' && before && before.v === '.' && STORE_LANG_METHODS.has(last.v) && end === i + 4) fns.set(t[i].v, last.v);
      else out.add(t[i].v);
    }
    // b2 = bs, t = TL, T2 = T  → a helper copied under another name
    const helperName = (v) => STORE_LANG_FUNCS.has(v) || Object.prototype.hasOwnProperty.call(P.KEY_HELPERS, v)
      || Object.values(P.KEY_HELPERS_BY_FILE || {}).some((m) => Object.prototype.hasOwnProperty.call(m, v));
    for (let i = 0; i < t.length - 3; i++) {
      if (t[i].t === 'id' && t[i + 1] && t[i + 1].v === '=' && t[i + 2] && t[i + 2].t === 'id' && helperName(t[i + 2].v) && t[i + 3] && /^[;,)]$/.test(t[i + 3].v)) fns.set(t[i].v, t[i + 2].v);
    }
    // var { bs: f } = BoardStrings / var { bs } = BoardStrings
    for (let i = 0; i < t.length - 3; i++) {
      if (!(t[i].t === 'id' && /^(var|let|const)$/.test(t[i].v) && t[i + 1] && t[i + 1].v === '{')) continue;
      const c = unit.closeOf[i + 1];
      if (c == null || !t[c + 1] || t[c + 1].v !== '=' || !t[c + 2] || !(out.has(t[c + 2].v) || /^(window|self|globalThis)$/.test(t[c + 2].v))) continue;
      for (let j = i + 2; j < c; j++) {
        if (t[j].t !== 'id' || !(STORE_LANG_METHODS.has(t[j].v) || STORE_LANG_FUNCS.has(t[j].v))) continue;
        if (t[j + 1] && t[j + 1].v === ':' && t[j + 2] && t[j + 2].t === 'id') fns.set(t[j + 2].v, t[j].v);
        else if (t[j + 1] && /^[,}]$/.test(t[j + 1].v)) fns.set(t[j].v, t[j].v);
      }
    }
    unit._storeAliases = { objects: out, fns };
    return unit._storeAliases;
  }
  // The store call whose arguments token i sits in (directly, or inside an
  // option object or array of one of them): { name, open } or null.
  function storeCallAround(unit, i, rel) {
    const t = unit.toks;
    for (let k = unit.frameOf[i], hops = 0; k != null && k >= 0 && hops < 4; k = unit.frameOf[k], hops++) {
      if (t[k].v === '{' && !unit.isObj[k]) return null;            // a function body: its own code
      if (t[k].v !== '(') continue;
      return storeCallAt(unit, k, rel);
    }
    return null;
  }
  // The store call whose argument list opens at token k: bs(…), S.bs(…),
  // window.bs(…), a copy of a helper, BoardStrings.bs?.(…),
  // BoardStrings['bs'](…), bs.call(null, …) and bs.apply(null, […]).
  function storeCallAt(unit, k, rel) {
    const t = unit.toks;
    const al = storeAliases(unit);
    const isFn = (v) => STORE_LANG_FUNCS.has(v) || al.fns.has(v) || Object.prototype.hasOwnProperty.call(P.KEY_HELPERS, v) || Object.prototype.hasOwnProperty.call((P.KEY_HELPERS_BY_FILE || {})[rel] || {}, v);
    let c = t[k - 1], at = k - 1;
    if (c && c.v === '?.') { at = k - 2; c = t[at]; }                 // f?.(…)
    if (!c) return null;
    // X['bs'](…)
    if (c.v === ']') {
      let o = at, d = 0;
      for (; o >= 0; o--) { if (t[o].v === ']') d++; else if (t[o].v === '[') { d--; if (d === 0) break; } }
      const key = t[o + 1], recv = t[o - 1];
      if (key && key.t === 'str' && o + 2 === at && recv && recv.t === 'id' && (al.objects.has(recv.v) || /^(window|self|globalThis)$/.test(recv.v)) && (STORE_LANG_METHODS.has(key.v) || STORE_LANG_FUNCS.has(key.v)))
        return { name: recv.v + "['" + key.v + "']", open: k };
      return null;
    }
    if (c.t !== 'id') return null;
    const recv = t[at - 1] && (t[at - 1].v === '.' || t[at - 1].v === '?.') ? t[at - 2] : null;
    // bs.call(null, k, 'fr'), BoardStrings.bs.apply(null, [k, 'fr'])
    if ((c.v === 'call' || c.v === 'apply') && recv && recv.t === 'id') {
      const r2 = t[at - 3] && t[at - 3].v === '.' ? t[at - 4] : null;
      if (!r2 && isFn(recv.v)) return { name: recv.v + '.' + c.v, open: k };
      if (r2 && r2.t === 'id' && (al.objects.has(r2.v) || /^(window|self|globalThis)$/.test(r2.v)) && (STORE_LANG_METHODS.has(recv.v) || STORE_LANG_FUNCS.has(recv.v))) return { name: r2.v + '.' + recv.v + '.' + c.v, open: k };
      return null;
    }
    if (recv && recv.t === 'id' && (al.objects.has(recv.v) || (/^(window|self|globalThis)$/.test(recv.v) && STORE_LANG_FUNCS.has(c.v))) && STORE_LANG_METHODS.has(c.v)) return { name: recv.v + '.' + c.v, open: k };
    if (recv && recv.t === 'id' && /^(window|self|globalThis)$/.test(recv.v) && isFn(c.v)) return { name: recv.v + '.' + c.v, open: k };
    if (recv && STORE_DISTINCT_METHODS.has(c.v)) return { name: '.' + c.v, open: k };
    if (!recv && isFn(c.v)) return { name: c.v, open: k };
    return null;
  }
  // What a name is given in its scope: { lits: the literal values (x =
  // 'fr', x = 'f' + 'r'; for x.l, the l of an object literal x is given),
  // other: how many other values it is given }.
  function assignedValues(unit, i) {
    const t = unit.toks, nm = t[i].v, sc = scopeOf(unit, i, nm);
    const prop = t[i + 1] && (t[i + 1].v === '.' || t[i + 1].v === '?.') && t[i + 2] && t[i + 2].t === 'id' ? t[i + 2].v
      : (t[i + 1] && t[i + 1].v === '[' && t[i + 2] && t[i + 2].t === 'str' && t[i + 3] && t[i + 3].v === ']' ? t[i + 2].v : null);
    const lits = [];
    let other = 0;
    if (!unit._idIndex) {
      unit._idIndex = new Map();
      for (let j = 0; j < t.length; j++) if (t[j].t === 'id') { if (!unit._idIndex.has(t[j].v)) unit._idIndex.set(t[j].v, []); unit._idIndex.get(t[j].v).push(j); }
    }
    for (const j of unit._idIndex.get(nm) || []) {
      if (j >= t.length - 2 || (t[j - 1] && (t[j - 1].v === '.' || t[j - 1].v === '?.'))) continue;
      if (scopeOf(unit, j, nm) !== sc) continue;
      // a parameter, a for-of/for-in name, a destructured name: given at run time
      if (!(t[j + 1] && t[j + 1].v === '=')) {
        const fr = unit.frameOf[j];
        if (t[j + 1] && /^(of|in)$/.test(t[j + 1].v)) other++;
        else if (fr >= 0 && t[fr].v === '(' && t[fr - 1] && (t[fr - 1].t === 'id' || t[fr - 1].v === 'function') && t[unit.closeOf[fr] + 1] && t[unit.closeOf[fr] + 1].v === '{' && !(t[j - 1] && t[j - 1].v === '=')) other++;
        else if (t[j + 1] && t[j + 1].v === '=>' ) other++;
        continue;
      }
      if (prop == null) {
        let k = j + 2, str = '', ok = false;
        while (t[k] && t[k].t === 'str') { str += t[k].v; ok = true; if (t[k + 1] && t[k + 1].v === '+' && t[k + 2] && t[k + 2].t === 'str') k += 2; else break; }
        if (ok && t[k + 1] && /^[;,)}]$/.test(t[k + 1].v)) lits.push(str); else other++;
      } else if (t[j + 2] && t[j + 2].v === '{' && unit.isObj[j + 2]) {
        const o = unit.objects.find((x) => x.open === j + 2);
        const kk = o && o.keys.find((x) => x.k === prop);
        if (kk && kk.simple && kk.str != null) lits.push(kk.str); else other++;
      } else other++;
    }
    return { lits, other };
  }
  // 'en' as the fallback after a language variable: l || 'en',
  // isLang(l) ? l : 'en'
  function fallbackDefault(unit, i, open) {
    const t = unit.toks;
    if (t[i].v !== 'en') return false;
    const p = t[i - 1];
    if (p && (p.v === '||' || p.v === '??') && t[i - 2] && (t[i - 2].t === 'id' || t[i - 2].v === ')' || t[i - 2].v === ']')) return true;
    if (p && p.v === ':' && unit.frameOf[i] === unit.frameOf[i - 1]) {
      // the consequent of the ternary is not a literal
      let d = 0;
      for (let k = i - 2; k > open; k--) {
        const x = t[k];
        if (x.v === ')' || x.v === ']' || x.v === '}') d++;
        else if (x.v === '(' || x.v === '[' || x.v === '{') { if (d === 0) break; d--; }
        else if (d === 0 && x.v === '?') return !(t[k + 1] && t[k + 1].t === 'str' && t[k + 2] && t[k + 2].v === ':');
      }
    }
    return false;
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
    // every quoted string in a content value, a var() fallback included:
    // content: var(--crsl-l2, 'CARROUSEL') drew French on every board that
    // left the variable unset
    for (const d of clean.matchAll(/(?:^|[;{\s])content\s*:\s*([^;{}]*)/g)) {
      for (const m of d[1].replace(/url\(\s*(["']?)[^)]*\1\s*\)/g, ' ').matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g)) {
        const v = m[2].replace(/\\[0-9a-fA-F]{1,6}\s?/g, ' ').replace(/\\(.)/g, '$1');
        if (!countsAsWords(v)) continue;
        add({ check: 'B9', file: rel, line: (offset || 0) + lineOf(clean, d[0], d.index), fn: null, text: v, msg: `CSS content '${v}' is passenger text in one language \u2014 render it from the store` });
      }
    }
    for (const x of cssDrawnStrings(css)) add({ check: 'B9', file: rel, line: (offset || 0) + lineOf(clean, '', x.at), fn: null, text: x.v, msg: `CSS ${x.prop} '${shortText(x.v)}' is drawn on screen as text in one language \u2014 render it from the store` });
  }
  // the same in a page's style="" attributes
  for (const page of passengerPages) {
    const html = read(page);
    for (const m of html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) {
      const val = m[2].replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
      for (const x of cssDrawnStrings(val)) add({ check: 'B9', file: page, line: lineOf(html, m[0], m.index), fn: null, text: x.v, msg: `CSS ${x.prop} '${shortText(x.v)}' in a style attribute is drawn on screen as text in one language \u2014 render it from the store` });
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
    // the name tables too (CITY_FR, CITY, AIRLINE_NAME, FIDS_SHARED_CITY…):
    // the collapse was French city names overwritten by English, and a
    // run-time CITY_FR.YUL = 'MONTREAL' is the same thing where a duplicate-key
    // check cannot see it. Written from any file, bare or through window.
    const DATA_ROOTS = new Set();
    for (const list of Object.values(P.DATA_TABLES || {})) for (const name of Object.keys(list)) DATA_ROOTS.add(name);
    for (const n of P.NONTEXT_TABLES) if (n.name) DATA_ROOTS.add(n.name);
    for (const { rel, unit, isStore } of jsUnits) {
      const t = unit.toks;
      // another name for a table (var c = CITY_FR; c.YUL = …): its writes
      // are the table's writes
      const ALIAS = new Map();
      for (let i = 0; i < t.length - 3; i++) {
        if (t[i].t === 'id' && t[i + 1] && t[i + 1].v === '=' && t[i + 2] && t[i + 2].t === 'id' && t[i + 3] && /^[;,)]$/.test(t[i + 3].v)
            && (((P.DATA_TABLES || {})[rel] && Object.prototype.hasOwnProperty.call(P.DATA_TABLES[rel], t[i + 2].v)) || scan.findTable(unit, t[i + 2].v)
              || /^(CITY_FR|CITY|AIRLINE_NAME|FIDS_SHARED_\w+|BOARD_STR)$/.test(t[i + 2].v) || (STORE_ROOTS.has(t[i + 2].v) && tables[t[i + 2].v] && tables[t[i + 2].v].file === rel))
            && (DATA_ROOTS.has(t[i + 2].v) || STORE_ROOTS.has(t[i + 2].v)) && !(t[i - 1] && t[i - 1].v === '.'))
          ALIAS.set(t[i].v, t[i + 2].v);
      }
      // a table reached by a name built at run time: globalThis['CITY_' + 'FR']
      for (let i = 0; i < t.length - 2; i++) {
        if (!(t[i].t === 'id' && /^(window|self|globalThis|root)$/.test(t[i].v) && t[i + 1] && t[i + 1].v === '[' && unit.closeOf[i + 1] != null)) continue;
        if (t[i - 1] && t[i - 1].v === '.') continue;
        const c = unit.closeOf[i + 1];
        const inner = t.slice(i + 2, c);
        const name = inner.length === 1 && inner[0].t === 'str' ? inner[0].v
          : (inner.length && inner.every((x, k) => (k % 2 === 0 ? x.t === 'str' : x.v === '+')) ? inner.filter((x) => x.t === 'str').map((x) => x.v).join('') : null);
        const nx = t[c + 1];
        const writes = nx && (/^(=|\+=|\|\|=|\?\?=)$/.test(nx.v) || ((nx.v === '.' || nx.v === '[') && (() => {
          let k = c + 1;
          while (t[k] && ((t[k].v === '.' && t[k + 1] && t[k + 1].t === 'id') || (t[k].v === '[' && unit.closeOf[k] != null))) k = t[k].v === '.' ? k + 2 : unit.closeOf[k] + 1;
          return t[k] && /^(=|\+=|\|\|=|\?\?=|\+\+|--)$/.test(t[k].v);
        })()));
        if (!writes) continue;
        if (name != null && (DATA_ROOTS.has(name) || name === 'BOARD_STR' || (STORE_ROOTS.has(name) && tables[name]))) add({ check: 'B16', file: rel, line: t[i].line, fn: unit.fnAt[i], text: name + ' write', msg: `${name} is changed at run time through ${t[i].v}['${name}'] \u2014 the store's words are fixed where they are declared (the CITY_FR collapse)` });
      }
      for (let i = 0; i < t.length; i++) {
        const tk = t[i];
        if (tk.t !== 'id') continue;
        const viaGlobal = t[i - 1] && t[i - 1].v === '.' && t[i - 2] && /^(window|self|globalThis|root)$/.test(t[i - 2].v) && !(t[i - 3] && t[i - 3].v === '.');
        if (t[i - 1] && t[i - 1].v === '.' && !viaGlobal) continue;
        let root = null, j = i;
        const ownTable = tables[tk.v] && tables[tk.v].file === rel;
        if ((STORE_ROOTS.has(tk.v) && (ownTable || tk.v === 'BOARD_STR' || viaGlobal)) || (isStore && STORE_PARTS.test(tk.v))) root = tk.v;
        else if (DATA_ROOTS.has(tk.v) && !dataWriterFor(rel, unit.fnAt[i], tk.v)) root = tk.v;
        else if (ALIAS.has(tk.v) && !(t[i + 1] && t[i + 1].v === '=') && !dataWriterFor(rel, unit.fnAt[i], ALIAS.get(tk.v))) root = ALIAS.get(tk.v) + ' (as ' + tk.v + ')';
        else if (/^(BoardStrings|api|Strings)$/.test(tk.v) && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && STORE_PARTS.test(t[i + 2].v)) { root = tk.v + '.' + t[i + 2].v; j = i + 2; }
        if (!root) continue;
        if (t[i - 1] && /^(var|let|const)$/.test(t[i - 1].v)) continue;          // its declaration
        // window.X = X: the table published under its own name, not changed
        if (viaGlobal && t[i + 1] && t[i + 1].v === '=' && t[i + 2] && t[i + 2].v === tk.v && t[i + 3] && /^[;,)]$/.test(t[i + 3].v)) continue;
        // the store publishing itself (root.BOARD_STR = api.STR)
        if (isStore && viaGlobal && t[i + 1] && t[i + 1].v === '=' && t[i + 2] && t[i + 2].v === 'api') continue;
        // window.CITY = window.CITY || { … }: the table's own declaration
        if (viaGlobal && DATA_ROOTS.has(tk.v) && t[i + 1] && t[i + 1].v === '=' && scan.findTable(unit, tk.v)) continue;
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
        const hit = a && a.t === 'id' && ((STORE_ROOTS.has(a.v) && ((tables[a.v] && tables[a.v].file === rel) || a.v === 'BOARD_STR')) || (isStore && STORE_PARTS.test(a.v)) || DATA_ROOTS.has(a.v) || ALIAS.has(a.v)
          || (/^(BoardStrings|api|Strings)$/.test(a.v) && t[i + 5] && t[i + 5].v === '.' && b && STORE_PARTS.test(b.v)));
        if (hit) add({ check: 'B16', file: rel, line: t[i].line, fn: unit.fnAt[i], text: 'Object.' + t[i + 2].v + '(' + a.v + '…)', msg: `Object.${t[i + 2].v} writes into the store at run time \u2014 its words are fixed where they are declared` });
      }
    }
  }

  // A function registered to fill a name table at run time (a heritage gate
  // taking its carrier's historic name, the app building its city map from
  // the airport catalogue): { file: { fn or '-' (top level): { tables, why } } }
  function dataWriterFor(rel, fn, name) {
    const w = ((P.DATA_WRITERS || {})[rel] || {})[fn || '-'];
    if (!w || !(w.tables || []).includes(name)) return false;
    used.writers.add(rel + ':' + (fn || '-'));
    return true;
  }

  // ── W1: a word made up in a feed worker ──
  // The workers turn airports' feeds into the rows every board shows. A
  // worker that writes its own English into a row ('Gate closes in 10
  // minutes' as a status) puts it on every board in every language, past
  // every check above. A worker sends codes; the board says them in its own
  // languages. Every .js under workers/, and the site's worker-entry.js, is
  // read for a label or sentence written into a row's text fields (status,
  // remark, label, caption, word…) or returned by a function that makes one.
  {
    const files = options.workerFiles || listWorkerFiles();
    // (and a row field named for its text: statusLabel, gateText, delayNote…)
    const TEXT_PROPS = /^(status|statusText|status_text|statusWord|remark|remarks|label|caption|headline|word|words|gateNote|boardingNote|displayStatus|display|(status|remark|gate|boarding|board|flight|delay|belt|bag|baggage|row|cancel|cancell?ation|diversion)_?(Label|Text|Note|Msg|Message|Word|Words|Caption|Display|Line|label|text|note|msg|message|word|words|caption|display|line))$/;
    const TEXT_FN = /status|remark|label|caption|word|display/i;
    for (const rel of files) {
      let L;
      try { L = load(rel); } catch (e) { add({ check: 'W1', file: rel, line: 1, fn: null, text: 'unreadable', msg: `${rel} could not be read by the guard: ${e.message}` }); continue; }
      for (const unit of L.units) {
        const t = unit.toks;
        for (let i = 0; i < t.length; i++) {
          if (t[i].t !== 'str' && t[i].t !== 'tpl') continue;
          const v = String(t[i].v);
          if (!/[A-Za-z]{2,}/.test(v) || /^[a-z][a-z0-9_-]*$/.test(v.trim()) || codeShaped(v)) continue;
          if (!(isLabel(v) || isSentence(v))) continue;
          // where the literal ends up: a text field of a row, or a text-making function's return
          let k = i, why = null;
          // through a ternary or a logical: x ? 'Words' : y
          while (t[k - 1] && /^(\?|:|\|\||&&|\?\?|\()$/.test(t[k - 1].v) && !(t[k - 1].v === ':' && t[k - 2] && (t[k - 2].t === 'id' || t[k - 2].t === 'str') && t[k - 3] && (t[k - 3].v === '{' || t[k - 3].v === ','))) {
            // walk back over the condition to the start of the expression
            let j = k - 2, d = 0;
            for (; j >= 0; j--) { const x = t[j]; if (x.v === ')' || x.v === ']' || x.v === '}') d++; else if (x.v === '(' || x.v === '[' || x.v === '{') { if (d === 0) break; d--; } else if (d === 0 && /^(=|return|:|,|;)$/.test(x.v)) break; }
            k = j + 1;
            if (k >= i) break;
          }
          const p = t[k - 1], key = t[k - 2];
          if (p && p.v === ':' && key && (key.t === 'id' || key.t === 'str') && TEXT_PROPS.test(String(key.v)) && t[k - 3] && (t[k - 3].v === '{' || t[k - 3].v === ',')) why = 'the row field ' + key.v;
          else if (p && /^(=|\+=)$/.test(p.v) && key && key.t === 'id' && TEXT_PROPS.test(key.v) && t[k - 3] && t[k - 3].v === '.') why = 'the row field .' + key.v;
          else if (p && p.v === 'return' && unit.fnAt[i] && TEXT_FN.test(unit.fnAt[i])) why = 'the return of ' + unit.fnAt[i] + '()';
          if (!why) continue;
          add({ check: 'W1', file: rel, line: t[i].line, fn: unit.fnAt[i], text: stripTags(v).trim(), msg: `'${shortText(v)}' is written by a feed worker into ${why} \u2014 every board would show it in English. Send a code and let the board say it in its languages (the store)` });
        }
        // the same words held in a name first: const GC = 'Gate closes soon';
        // r.status = GC, or return { remark: rm }
        for (let i = 0; i < t.length - 2; i++) {
          if (t[i].t !== 'id' || JS_WORDS.has(t[i].v) || (t[i - 1] && (t[i - 1].v === '.' || t[i - 1].v === '?.'))) continue;
          if (!(t[i + 1] && /^[;,})]$/.test(t[i + 1].v))) continue;
          const p = t[i - 1], key = t[i - 2];
          let why = null;
          if (p && p.v === ':' && key && (key.t === 'id' || key.t === 'str') && TEXT_PROPS.test(String(key.v)) && t[i - 3] && (t[i - 3].v === '{' || t[i - 3].v === ',')) why = 'the row field ' + key.v;
          else if (p && /^(=|\+=)$/.test(p.v) && key && key.t === 'id' && TEXT_PROPS.test(key.v) && t[i - 3] && t[i - 3].v === '.') why = 'the row field .' + key.v;
          else if (p && p.v === 'return' && unit.fnAt[i] && TEXT_FN.test(unit.fnAt[i])) why = 'the return of ' + unit.fnAt[i] + '()';
          if (!why) continue;
          for (const v of assignedValues(unit, i).lits) {
            if (!/[A-Za-z]{2,}/.test(v) || /^[a-z][a-z0-9_-]*$/.test(v.trim()) || codeShaped(v) || !(isLabel(v) || isSentence(v))) continue;
            add({ check: 'W1', file: rel, line: t[i].line, fn: unit.fnAt[i], text: stripTags(v).trim(), msg: `'${shortText(v)}' is written by a feed worker into ${why} (through ${t[i].v}) \u2014 every board would show it in English. Send a code and let the board say it in its languages (the store)` });
          }
        }
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
        // a URL built from literal parts: 'js/' + 'gate' + '-extra.js'
        let v = t[i].v, k = i;
        if (!(t[i - 1] && t[i - 1].v === '+' && t[i - 2] && t[i - 2].t === 'str')) {
          while (t[k + 1] && t[k + 1].v === '+' && t[k + 2] && t[k + 2].t === 'str') { v += t[k + 2].v; k += 2; }
        }
        const m = /^\s*((?:\.{1,2}\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.(js|css|html?|json))(?:[?#][^\s'"]*)?\s*$/i.exec(v);
        if (!m) continue;
        const cands = resolve(m[1], rel);
        if (!cands.length) continue;
        const isPage = /^html?$/i.test(m[2]);
        const known = cands.some((c) => (isPage ? classifiedPages.has(c) : classified.has(c)));
        if (isPage) for (const c of cands) if (classifiedPages.has(c)) used.pages.add(c);
        if (known || !cands.some((c) => exists(c))) continue;
        if (/^json$/i.test(m[2])) { add({ check: 'C2', file: rel, line: t[i].line, fn: unit.fnAt[i], text: m[1], msg: `${m[1]} is data a passenger script loads at run time and is not in NON_PASSENGER (tests/i18n/policy.js) \u2014 a word in it reaches the screen past every check: put the words in the store, or classify the file as data with its reason` }); continue; }
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
  for (const [rel, list] of Object.entries(P.DATA_WRITERS || {})) for (const fn of Object.keys(list)) {
    if (!used.writers.has(rel + ':' + fn)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'DATA_WRITERS ' + rel + ' ' + fn, msg: `${fn} no longer writes a name table in ${rel} \u2014 remove it` });
    if (!P.REASONS.includes(String(list[fn].why).split(':')[0])) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'DATA_WRITERS reason ' + fn, msg: `'${list[fn].why}' does not start with a reason from: ${P.REASONS.join(', ')}` });
  }
  for (const [k, e] of Object.entries(P.SAME_ACROSS || {})) {
    if (!used.across.has(k)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'SAME_ACROSS ' + k, msg: `SAME_ACROSS '${k}' matches nothing \u2014 remove it` });
    if (!P.REASONS.includes(String(e.why).split(':')[0])) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'SAME_ACROSS reason ' + k, msg: `'${e.why}' does not start with a reason from: ${P.REASONS.join(', ')}` });
  }
  for (const k of Object.keys(P.SAME_JA_ZH || {})) if (!used.jazh.has(k)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'SAME_JA_ZH ' + k, msg: `SAME_JA_ZH '${k}' matches nothing \u2014 remove it` });
  for (const [l, list] of Object.entries(P.NATIVE_WORDS || {})) for (const w of Object.keys(list)) if (!used.native.has(l + ':' + w)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'NATIVE_WORDS ' + l + ' ' + w, msg: `NATIVE_WORDS ${l} '${w}' matches nothing \u2014 remove it` });
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
    if (!exists(pg)) add({ check: 'P1', file: 'tests/i18n/policy.js', line: 1, fn: null, text: 'NON_PASSENGER_PAGES ' + pg, msg: `${pg} no longer exists \u2014 remove it` });
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
  return { findings, pragmaCounts, entries, tables, textObjects: allTextObjects, listObjects, dataVocab: [...DATA_VOCAB], dataPhrases: [...DATA_PHRASES], englishWords: [...ENGLISH_WORDS] };
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
// inside the arguments of a logging call or an error
function inLogCall(unit, i) {
  const t = unit.toks;
  for (let k = unit.frameOf[i]; k != null && k >= 0; k = unit.frameOf[k]) {
    if (t[k].v === '{' && !unit.isObj[k]) return false;
    if (t[k].v !== '(') continue;
    const c = t[k - 1];
    if (c && c.t === 'id' && LOG_CALLS.has(c.v)) return true;
    if (c && c.t === 'id' && t[k - 2] && t[k - 2].v === '.' && t[k - 3] && t[k - 3].v === 'console') return true;
  }
  return false;
}
// the store's helper functions a language is passed to, and its methods
const STORE_LANG_FUNCS = new Set(['bs', 'bsFmt', 'bsPair', 'bsHalf', 'bsList', 'bsTime', 'bsDate', 'bsWeekday', 'bsPairLangs', 'bsResolveLangs',
  'TLin', '_gateLbl', '_gateLbl1', '_gateLblSpans', '_g8SignPair', '_g8SignLines', '_g8SignNext', 'SLpair', '_wxPair', 'fidsT']);
const STORE_LANG_METHODS = new Set(['bs', 'fmt', 'pair', 'half', 'markHalf', 'list', 'time', 'date', 'weekday', 'pairLangs', 'frenchFirst',
  'intl', 'num', 'clockText', 'boardTime', 'boardClockText', 'setLang', 'loaderLine', 'entry', 'filled', 'looksLike', 'withScripts']);
// methods whose names no other object here uses: checked on any receiver
const STORE_DISTINCT_METHODS = new Set(['bs', 'markHalf', 'pairLangs', 'frenchFirst', 'clockText', 'boardTime', 'boardClockText', 'looksLike']);
// a list of the board's languages, by name
const LANG_LIST_NAME = /^_?(langs|boardLangs|selLangs|selectedLangs|LANGS)$/;
// calls that format by locale
const LOCALE_CALLS = /^(toLocaleTimeString|toLocaleDateString|toLocaleString|DateTimeFormat|NumberFormat|RelativeTimeFormat|ListFormat|PluralRules|DisplayNames)$/;
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
  if (codeShaped(t[i].v)) return 'codeish';
  return 'plain';
}

// A URL, a path, an element id, a CSS selector or a CSS declaration — code,
// not words. Each shape is matched on the WHOLE literal and case by case:
// 'Gate: ' and 'Delayed.' are words with punctuation, never a selector
// ('Gate' does not start one, and a selector has something after its '.'),
// and 'status: delayed' is not a CSS declaration ('status' is no property).
const CSS_PROPERTY = /^(-(webkit|moz|ms)-)?(align|animation|appearance|aspect|backdrop|backface|background|block|border|bottom|box|break|caret|clear|clip|color|column|columns|contain|content|counter|cursor|direction|display|fill|filter|flex|float|font|gap|grid|height|hyphens|image|inline|inset|isolation|justify|left|letter|line|list|margin|mask|max|min|mix|object|offset|opacity|order|outline|overflow|overscroll|padding|page|perspective|place|pointer|position|quotes|resize|right|rotate|row|scale|scroll|shape|stroke|tab|table|text|top|touch|transform|transition|translate|unicode|user|vertical|visibility|white|width|will|word|writing|z)(-[a-z]+)*$/;
function codeShaped(v) {
  const s = String(v);
  if (/^\s*(https?:|\/\/|data:|blob:|mailto:|tel:)/i.test(s)) return true;
  if (/^\s*\.{0,2}\/[\w.~%\-\/?=&#]*\s*$/.test(s)) return true;                 // a path
  if (/^\s*#[A-Za-z][\w-]*\s*$/.test(s)) return true;                           // #id
  // a selector: lower-case element or .class/#id start, then selector
  // punctuation with a name right after it, and no free-standing word.
  // Each step is one separator, a name's first character, then the rest of
  // the name. A separator that is itself a name character ('.', ':', '~')
  // can only open the first step: after that the previous name has taken
  // it, so every later step opens on a character no name holds (white
  // space, '>', '+', '#', '['). One way to read any selector, so the match
  // never backtracks through the ways a long one could be cut up.
  const SEL = /^\s*([.#]?[a-z_][\w-]*|\*)(?:(?:[.:][.#:]?|~\s*)[a-z_*\-\[][\w\-="'()\]^$|*~:.]*)?(?:(?:\s*[>+]\s*|\s+(?:~\s*)?|#[.#:]?|\[)[a-z_*\-\[][\w\-="'()\]^$|*~:.]*)*\s*(?:[{,]\s*)?$/;
  if (SEL.test(s) && /[.#\[>:]/.test(s) && !/[.:]\s*$/.test(s) && !/\p{Lu}/u.test(s.replace(/[.#][\w-]+/g, ''))) return true;
  // a selector list: '#fidsTable tbody td.td-time, #fidsTable tbody td.td-status'
  if (/,/.test(s)) {
    const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every((x) => SEL.test(x) && !/\p{Lu}/u.test(x.replace(/[.#][\w-]+/g, ''))) && parts.some((x) => /[.#\[>:]/.test(x)) && !/[.:]\s*$/.test(s)) return true;
  }
  // a CSS declaration: a real property (or a custom one) and a value
  const d = /^\s*(--[\w-]+|[a-z]+(?:-[a-z]+)*)\s*:\s*(.+?)\s*;?\s*$/.exec(s);
  if (d && (d[1].startsWith('--') || CSS_PROPERTY.test(d[1])) && !/\p{Lu}\p{Ll}{2,}\s+\p{Ll}{3,}/u.test(d[2])
      && !/^\p{Lu}\p{Ll}+([\s\u00A0]+\p{L}+)*[.!]?$/u.test(d[2])) return true;
  return false;
}

// Code, not words: font stacks, CSS declarations and values, SVG attribute
// values, HTML attribute lists outside a tag, MIME types, units of CSS.
// The selector shape ('#id name.x > name'): after the first name, either
// nothing but name characters, or a '.', ':' or parenthesis once a letter
// has come; then steps that each open on white space or a combinator. One
// way to read any string, so the match never backtracks through the ways a
// long one could be cut up.
const CODE_LIKE2 = /^\s*use strict\s*$|^\s*[#.][A-Za-z](?:[\d_-]*[a-z][\w-]*[.:()][\w.:()-]*|[\w-]*)(?:(?:\s+|\s*[>+~]\s*)[a-z][\w.:()-]*)*\s*(?:[{,]\s*)?$|\{\s*[a-z-]+\s*:|^\s*(normal|multiply|screen|overlay)(,\s*(normal|multiply|screen|overlay))*\s*$|color-mix\(|^\s*(left|right|center|top|bottom)(\s+(left|right|center|top|bottom|\d+%))?\s*$|\b(var|let|const)\s+\w+\s*=|\bthis\.\w+|\btypeof\s|\bfunction\s*\(|^\s*(zoom|zoomend|zoomstart|moveend|movestart|viewreset|resize|load|click|touchstart|touchend|mouseenter|mouseleave)(\s+(zoom|zoomend|zoomstart|moveend|movestart|viewreset|resize|load|click|touchstart|touchend|mouseenter|mouseleave))+\s*$|^\s*(Geist|Inter|Roboto|Arial|Helvetica)\s*$/i;
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
// whole values of the name tables, normalised (a literal that IS one is data)
let DATA_PHRASES = new Set();
// words the store's English uses as labels, in lower case (built each run)
let LABEL_WORDS = new Set();
// rel -> names whose value is put on screen as text (built each run)
let RENDERED = new Map();
// JavaScript's own words: never a name whose value is shown
const JS_WORDS = new Set(['var', 'let', 'const', 'function', 'return', 'typeof', 'new', 'delete', 'void', 'in', 'of', 'instanceof',
  'this', 'null', 'undefined', 'true', 'false', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'default',
  'try', 'catch', 'finally', 'throw', 'class', 'extends', 'super', 'import', 'export', 'await', 'async', 'yield', 'NaN', 'Infinity']);
// String methods that pass their receiver on: 'x'.toUpperCase() shows x
const STRING_METHODS = new Set(['toUpperCase', 'toLowerCase', 'toLocaleUpperCase', 'toLocaleLowerCase', 'trim', 'trimStart', 'trimEnd',
  'normalize', 'padStart', 'padEnd', 'concat', 'repeat', 'toString', 'valueOf']);
// Calls that show their first argument as it is (escaped, stringified)
const PASS_THROUGH = /^(esc|_esc|escHtml|escapeHtml|_escHtml|_escapeHtml|htmlEsc|_htmlEsc|_niEsc|escAttr|_e|e|h|String|_upper|upper|_fidsTitleCaseIn|titleCase|_titleCase)$/;
// Sinks whose value is text (not markup)
const TEXT_SINK_NAMES = new Set(['textContent', 'innerText', 'nodeValue', 'append()', 'prepend()', 'before()', 'after()', 'replaceWith()',
  'replaceChildren()', 'createTextNode()', 'insertAdjacentText()', 'fillText()', 'strokeText()', 'placeholder', 'title', 'alt', 'ariaLabel']);
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

// the feed workers: every .js under workers/, and the site's worker
function listWorkerFiles() {
  const out = [];
  const walk = (dir) => {
    let ents = [];
    try { ents = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) { if (!/^(node_modules|\.git|\.wrangler)$/.test(e.name)) walk(rel); }
      else if (/\.m?js$/.test(e.name)) out.push(rel);
    }
  };
  walk('workers');
  if (fs.existsSync(path.join(ROOT, 'worker-entry.js'))) out.push('worker-entry.js');
  return out;
}

// every file under a directory whose name matches re, relative to it
function listFiles(dir, re, sub) {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(path.join(dir, sub || ''), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const rel = sub ? sub + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!/^(node_modules|\.git|out)$/.test(e.name)) out.push(...listFiles(dir, re, rel)); }
    else if (re.test(e.name)) out.push(rel);
  }
  return out;
}
// every .html file under a directory, relative to it
function listHtml(dir, sub) {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(path.join(dir, sub || ''), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const rel = sub ? sub + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!/^(node_modules|\.git)$/.test(e.name)) out.push(...listHtml(dir, rel)); }
    else if (/\.html?$/i.test(e.name)) out.push(rel);
  }
  return out;
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
  // svg <text>, <template> and <noscript> content is text a passenger can
  // read (a template is cloned onto the screen); only code and form
  // controls' option lists are skipped
  const skipTags = new Set(['script', 'style', 'textarea']);
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
    // a script that is not code (type="text/template", text/html, text/x-…)
    // is markup a page clones onto the screen: its text is page text
    const skip = skipTags.has(name) && !(name === 'script' && /\btype\s*=\s*["']?text\/(?:template|html|x-[\w-]+)/i.test(attrs));
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

// The words of the name tables (cities, airports, airlines, aircraft,
// hotel brands), from any version of the files: the test passes main's as
// options.dataVocabBase, so a word added to a name table in the same change
// cannot carry a label past B15.
function nameTableWords(P, read) {
  const out = new Set();
  const nameTable = (why) => /^(data|brand):/.test(String(why || ''));
  const files = new Set(Object.keys(P.DATA_TABLES || {}).concat(P.NONTEXT_TABLES.map((n) => n.file)));
  for (const rel of files) {
    let src = null;
    try { src = read(rel); } catch (e) { src = null; }
    if (src == null) continue;
    let L;
    try { L = scan.load(rel, src); } catch (e) { continue; }
    const names = Object.entries((P.DATA_TABLES || {})[rel] || {}).filter(([, why]) => nameTable(why)).map(([n]) => n)
      .concat(P.NONTEXT_TABLES.filter((n) => n.file === rel && n.name && nameTable(n.reason)).map((n) => n.name));
    for (const unit of L.units) for (const name of names) {
      const r = dataRange(unit, name);
      if (!r) continue;
      for (let j = r[0]; j < r[1]; j++) if (unit.toks[j].t === 'str' || unit.toks[j].t === 'tpl') for (const w of wordsOf(unit.toks[j].v)) out.add(w);
    }
  }
  return out;
}

module.exports = { run, id, norm, lexHtml, staticText, shortText, nameTableWords, LOOSENERS, RE_PLACEHOLDER, RE_PERSIAN_URDU, PERSIAN_WORDS };
