#!/usr/bin/env node
// ━━ THE RENDERED LANGUAGE CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// The static guard (tests/i18n/checks.js) reads the source. What it cannot
// follow — a word that arrives through feed data, or through indirection no
// token scan sees — this sees, because it reads the SCREEN:
//
//   For the gate, the departures board and the baggage board, in each of the
//   nine languages on its own (and the pairs that stress them most), every
//   word a passenger can see must be a word of that board's languages — a
//   word of the store in that language — or data (a city, an airline, an
//   aircraft, a brand, a code, a number, a time). An English word on a German
//   board fails; so does a French word on an English one.
//
//   And it is marked right: Arabic text sits in an element whose language is
//   Arabic and whose direction is right to left; Japanese text is lang="ja";
//   Chinese text is lang="zh" (so it takes the simplified-Chinese glyphs, not
//   the Japanese forms the default stack would give it).
//
//   What is read: every visible text node, the text CSS draws (::before and
//   ::after content), placeholders, text drawn on a canvas, and the boards
//   inside same-origin iframes (the stream tour). Every key the store was
//   asked for and does not have (BoardStrings.misses — a key held in a
//   variable, a helper copied under another name) fails too: it rendered
//   blank on that screen.
//
//   What is shown: the gate (its whole centre deck, and its departure
//   delayed, cancelled, boarding, on final call, closed, at Porter's
//   pre-boarding, and moved to another gate; and the gate with no flight
//   left), the departures board, the
//   baggage board, the phone layout of the gate and of the departures board
//   in each language, the Studio player (a departures, a gate and a baggage
//   document) in each language, and the stream tour.
//
// Exit code 1 on any finding. Runs in CI (npm test, through
// tests/board-languages-render.test.js) on the boards' demonstration data, so
// it needs no network and spends no credits:
//
//   node tests/render/words.mjs                  every surface, every set
//   node tests/render/words.mjs gate de          one surface, one set
//   LIVE=1 node tests/render/words.mjs           with the live site's data
//                                                (feed text, the weather card,
//                                                ads), read-only
//   CHROME=/path/to/chrome                       the browser to use

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const ROOT = path.join(REPO, 'fids-current');
// LIVE=1 lets the boards read the live site's data; the site is fixed here
// and is the only host a request for data is ever sent to.
const LIVE = process.env.LIVE === '1';
const LIVE_ORIGIN = 'https://fids.orionconnected.com';
const W = 1680, H = 1050;
const [onlySurface, onlySet] = process.argv.slice(2);

function findChrome() {
  const c = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return c.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}
export const CHROME = findChrome();

// ── what each language may say ──────────────────────────────────────────
const BS = require(path.join(ROOT, 'js', 'board-strings.js'));
const checks = require(path.join(REPO, 'tests', 'i18n', 'checks.js'));
const policy = require(path.join(REPO, 'tests', 'i18n', 'policy.js'));
const LANGS = BS.LANGS;
const R = checks.run();
// an elided article is its own word (d'information, l'heure, dell'aereo)
const ELIDED = /^(?:d|l|qu|n|s|j|c|m|t|dell|nell|all|dall|sull)['’](?=\p{L})/iu;
const wordsOf = (s) => (String(s).replace(/<[^>]*>/g, ' ').replace(/\{[A-Za-z0-9_]+\}/g, ' ').match(/\p{L}[\p{L}\p{M}'’.-]*/gu) || [])
  .map((w) => w.replace(ELIDED, '').replace(/[^\p{L}]+$/u, '').toLowerCase()).filter((w) => w.length >= 2);
const VOCAB = Object.fromEntries(LANGS.map((l) => [l, new Set()]));
// how many entries use a word, by language: a word one entry alone gives a
// language is not trusted as that language's on its own (below)
const COUNT = Object.fromEntries(LANGS.map((l) => [l, new Map()]));
const note = (l, w, k) => { VOCAB[l].add(w); const m = COUNT[l]; if (!m.has(w)) m.set(w, new Set()); m.get(w).add(k); };
R.textObjects.forEach((o, i) => { for (const l of LANGS) if (o.langs[l] != null) for (const w of wordsOf(o.langs[l])) note(l, w, 'o' + i); });
R.listObjects.forEach((li, i) => { for (const it of li.items) for (const w of wordsOf(it)) VOCAB[li.lang] && note(li.lang, w, 'l' + li.key); });
for (const [k, e] of Object.entries(BS.STR)) for (const l of LANGS) for (const w of wordsOf(e[l] || '')) note(l, w, 's' + k);
// A word of the store's English is a word of another language only when the
// store's translations use it in two entries or more (the rule B3 holds the
// store to), or a reviewed list says it is that language's own (German
// 'Gate', French 'destinations').
// So an English word slipped into one translation does not become, on
// screen, a word of that language: the store is not trusted to vouch for
// itself (the static guard's B3 reads every value too).
{
  const own = Object.fromEntries(LANGS.map((l) => [l, new Set()]));
  for (const [en, e] of Object.entries(policy.SAME_AS_ENGLISH || {})) for (const l of (e.langs || [])) for (const w of wordsOf(en)) own[l].add(w);
  for (const [l, list] of Object.entries(policy.NATIVE_WORDS || {})) for (const w of Object.keys(list)) own[l] && own[l].add(w);
  // entries whose translations (any non-English language) use a word
  const translated = new Map();
  for (const l of LANGS) if (l !== 'en') for (const [w, ks] of COUNT[l]) { if (!translated.has(w)) translated.set(w, new Set()); for (const k of ks) translated.get(w).add(k); }
  // (English is the store's English and everyday English too: 'Doors shut
  // momentarily' in a German value uses no word of the store's English)
  const EN_DICT = new Set(R.englishWords);
  const english = (w, l) => VOCAB.en.has(w) || EN_DICT.has(w) || ((l === 'de' || l === 'it') && w.length >= 5 && /[^s]s$/.test(w) && EN_DICT.has(w.slice(0, -1)));
  for (const l of LANGS) {
    if (l === 'en') continue;
    for (const w of [...VOCAB[l]]) if (english(w, l) && (translated.get(w) || new Set()).size < 2 && !own[l].has(w)) VOCAB[l].delete(w);
  }
  // a placeholder is no language's word, whatever a value holds
  for (const l of LANGS) for (const w of ['xxx', 'fixme', 'lorem', 'ipsum', 'tbd', 'tba']) VOCAB[l].delete(w);
  for (const l of LANGS) if (l !== 'es' && l !== 'pt') VOCAB[l].delete('todo');
}
// A word of any language, or everyday English: a capitalised short word
// that is one of these ('GATE', 'LATE', 'OPEN', 'NOW', 'TODO') is a word,
// not a code, and is held to the board's languages like any other.
const ANY_WORD = new Set(R.englishWords);
for (const l of LANGS) for (const w of VOCAB[l]) ANY_WORD.add(w);
for (const w of ['xxx', 'fixme', 'todo', 'tbd', 'tba', 'lorem']) ANY_WORD.add(w);
// The codes a board shows as written: airports (IATA), airlines, ICAO codes,
// from the boards' own tables. 'SEA' (Seattle) and 'MAN' (Manchester) are
// codes even though they are words.
const CODES = new Set();
for (const f of ['js/airport-coords.js', 'js/fids-core.js', 'js/shared-names.js']) {
  let src = '';
  try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { src = ''; }
  for (const m of src.matchAll(/(?:^|[{,\s])'?([A-Z][A-Z0-9]{1,3})'?\s*:/gm)) CODES.add(m[1]);
  for (const m of src.matchAll(/:\s*'([A-Z]{3,4})'/g)) CODES.add(m[1]);
}
// weekday and month names come from Intl in each language
for (const l of LANGS) {
  for (let d = 0; d < 7; d++) for (const st of ['short', 'long']) for (const w of wordsOf(BS.weekday(Date.UTC(2026, 9, 4 + d, 16), l, st, 'UTC'))) VOCAB[l].add(w);
  for (let m = 0; m < 12; m++) for (const st of ['short', 'long']) for (const w of wordsOf(BS.date(Date.UTC(2026, m, 15), l, { month: st }, 'UTC'))) VOCAB[l].add(w);
}
VOCAB.en.add('am'); VOCAB.en.add('pm');
// Data: the words of the name tables only (cities, airports, airlines,
// aircraft, hotel brands) — never a notes table, never a word the store's
// English uses as a label (checks.js builds it the same way for B15) — and
// a whole name, or a brand as its whole phrase.
const DATA = new Set(R.dataVocab);
const DATA_PHRASES = new Set(R.dataPhrases);
for (const u of policy.UNIT_TERMS) DATA.add(u.toLowerCase());
const BRAND_RE = Object.keys(policy.BRAND_TERMS).sort((a, b) => b.length - a.length)
  .map((b) => new RegExp('(^|[^\\p{L}])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}])', 'giu'));

// ── the server: this checkout's files; data from the live site only if LIVE=1
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const BLOCK = /\/(adsb|fr24)(\/|\b)|\/aircrafts\/|\/flights\/number\//i;
// The live site's address for a request this server could not answer from
// the checkout: the request's own path and query on the live site, and null
// when the path is not a plain URL path (only the characters a path may hold
// unescaped, and percent escapes). The host is never taken from the request:
// the address is written with the site and its '/' first, so nothing in the
// path or the query can move it, and it is checked again once built.
const LIVE_PATH = /^\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/]*$/;
function liveUrl(reqUrl) {
  let u;
  try { u = new URL(reqUrl, 'http://127.0.0.1/'); } catch (e) { return null; }
  if (!LIVE_PATH.test(u.pathname)) return null;
  const target = new URL('https://fids.orionconnected.com/' + u.pathname.slice(1) + u.search);
  return target.origin === LIVE_ORIGIN ? target : null;
}
function serve() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname);
    if (BLOCK.test(p)) { res.writeHead(403); return res.end('blocked'); }
    let f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return fs.createReadStream(f).pipe(res);
    }
    if (!LIVE || req.method !== 'GET') { res.writeHead(404); return res.end(); }
    const live = liveUrl(req.url);
    if (!live) { res.writeHead(400); return res.end(); }
    https.get(live, { headers: { 'User-Agent': 'orion-language-check' } }, (r) => {
      res.writeHead(r.statusCode || 502, { 'Content-Type': r.headers['content-type'] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      r.pipe(res);
    }).on('error', () => { res.writeHead(502); res.end(); });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ── the browser, driven over a pipe (no WebSocket needed on Node 20) ─────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function browser(alarm) {
  // PROFILE_DIR: where the throwaway profile goes (default: the system's temp)
  const base = process.env.PROFILE_DIR || process.env.RUNNER_TEMP || require('node:os').tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const prof = fs.mkdtempSync(path.join(base, 'prof-words-'));
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
    '--remote-debugging-pipe', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-first-run', '--no-default-browser-check'];
  if (process.env.CI) args.push('--no-sandbox');
  // Without LIVE the page reaches nothing but this checkout: no feed, no
  // weather, no hotel — the same screens on every run, in CI and here.
  if (!LIVE) args.push('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
  // perl's alarm puts a hard ceiling on every browser even if this script dies
  // before it can kill it; each one serves a few language sets, well inside it
  const chrome = spawn('perl', ['-e', 'alarm ' + (alarm || +process.env.CHROME_ALARM || 120) + '; exec @ARGV', CHROME, ...args, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const out = chrome.stdio[3], inp = chrome.stdio[4];
  let id = 0, buf = '';
  const pend = new Map();
  const errors = [];
  inp.on('data', (d) => {
    buf += d.toString('utf8');
    let k;
    while ((k = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, k)); buf = buf.slice(k + 1);
      if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); }
      else if (msg.method === 'Runtime.exceptionThrown') errors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text || '').split('\n').slice(0, 3).join(' | '));
      else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description || '').join(' ').split('\n').slice(0, 3).join(' | '));
    }
  });
  inp.on('close', () => { for (const f of pend.values()) f({ error: { message: 'the browser went away' } }); pend.clear(); });
  const send = (method, params = {}, sessionId, ms = 60000) => new Promise((ok, no) => {
    const i = ++id;
    const t = setTimeout(() => { pend.delete(i); no(new Error(method + ' timed out')); }, ms);
    pend.set(i, (m) => { clearTimeout(t); m.error ? no(new Error(method + ': ' + m.error.message)) : ok(m.result); });
    try { out.write(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }) + '\0'); }
    catch (e) { clearTimeout(t); pend.delete(i); no(e); }
  });
  const close = () => { try { chrome.kill('SIGKILL'); } catch (e) {} try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} };
  return { send, close, errors };
}

// ── what is read off the screen ──────────────────────────────────────────
// Every visible text node; the text CSS draws (::before / ::after content,
// an attr() resolved); a placeholder; text drawn on a canvas (recorded by
// CANVAS_HOOK); and the same again inside every visible same-origin iframe.
const READ = `(function () {
  var out = [];
  function where(el) {
    var p = [];
    for (var e = el; e && e.nodeType === 1 && p.length < 4; e = e.parentElement)
      p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''));
    return p.join(' > ');
  }
  function readDoc(doc, win, ox, oy, frameTag) {
    var vw = win.innerWidth, vh = win.innerHeight;
    function shown(el) {
      for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
        var cs = win.getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
      }
      return true;
    }
    function visible(el) {
      var b = el.getBoundingClientRect();
      return !(b.width < 1 || b.height < 1 || b.bottom < 0 || b.top > vh || b.right < 0 || b.left > vw) && shown(el);
    }
    function push(t, el, extra) {
      var le = el.closest('[lang]');
      var rec = { t: String(t).slice(0, 2000), lang: le ? le.getAttribute('lang') : '', own: !!(le && le !== doc.documentElement),
        data: !!el.closest('[translate="no"]'), all: !!el.closest('[data-i18n-all]'), feed: !!el.closest('[data-i18n-feed]'),
        dir: win.getComputedStyle(el).direction, where: frameTag + where(el) + (extra || '') };
      out.push(rec);
    }
    if (!doc.body) return;
    var tw = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = tw.nextNode())) {
      var t = n.nodeValue.replace(/\\s+/g, ' ').trim();
      var el = n.parentElement;
      if (!t || !el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName)) continue;
      if (el.closest('[data-operator]')) continue;
      if (!visible(el)) continue;
      push(t, el);
    }
    var all = doc.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var e2 = all[i];
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(e2.tagName) || e2.closest('[data-operator]')) continue;
      for (var pe of ['::before', '::after']) {
        var pcs = win.getComputedStyle(e2, pe), c = pcs.content;
        if (!c || c === 'none' || c === 'normal' || pcs.display === 'none' || pcs.visibility === 'hidden' || parseFloat(pcs.opacity) < 0.05) continue;
        var txt = '';
        var re = /"((?:[^"\\\\]|\\\\.)*)"|attr\\(\\s*([\\w-]+)\\s*\\)/g, m;
        while ((m = re.exec(c))) txt += m[1] != null ? m[1] : (e2.getAttribute(m[2]) || '');
        if (/\\p{L}/u.test(txt) && visible(e2)) push(txt.replace(/\\s+/g, ' ').trim(), e2, pe);
      }
      if ((e2.tagName === 'INPUT' || e2.tagName === 'TEXTAREA') && e2.placeholder && !e2.value && visible(e2)) push(e2.placeholder, e2, '[placeholder]');
      if (e2.tagName === 'IFRAME' && visible(e2)) {
        try { var d2 = e2.contentDocument; if (d2 && d2.body) readDoc(d2, e2.contentWindow, 0, 0, frameTag + 'iframe(' + (e2.getAttribute('src') || '').split('?')[0] + ') > '); } catch (eF) {}
      }
    }
    try { (win.__canvasText || []).splice(0).forEach(function (x) { if (/\\p{L}/u.test(x.t)) out.push({ t: x.t, lang: x.lang || '', own: !!x.lang, data: false, all: false, feed: false, dir: x.dir || 'ltr', where: frameTag + 'canvas' }); }); } catch (eC) {}
  }
  readDoc(document, window, 0, 0, '');
  var L = null; try { L = langs.slice(); } catch (e) {}
  var M = []; try { M = (window.BoardStrings && BoardStrings.misses) ? BoardStrings.misses.slice() : []; } catch (e) {}
  return JSON.stringify({ langs: L, texts: out, misses: M });
})()`;

// Text drawn on a canvas never reaches the DOM: record it as it is drawn.
const CANVAS_HOOK = `(function () {
  try {
    var P = CanvasRenderingContext2D.prototype;
    ['fillText', 'strokeText'].forEach(function (name) {
      var orig = P[name];
      P[name] = function (text) {
        try {
          var c = this.canvas, el = c && c.closest ? c.closest('[lang]') : null;
          (window.__canvasText = window.__canvasText || []).push({ t: String(text), lang: el ? el.getAttribute('lang') : '' });
          if (window.__canvasText.length > 400) window.__canvasText.splice(0, 200);
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    });
  } catch (e) {}
})();`;

// The scripts, by code point. Written as escapes: a literal compatibility
// ideograph (U+F900) is changed to its unified twin (U+8C48) by any tool that
// normalises the file, and the Han range then ran from U+8C48 to U+FAFF,
// across Hangul, Yi and the private-use icons.
const RE_AR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const RE_KANA = /[\u3040-\u30FF\uFF66-\uFF9F]/;
const RE_HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

// The findings for one reading of a screen showing the languages `set`.
export function judge(texts, set, ap) {
  const allowed = (w) => DATA.has(w) || set.some((l) => VOCAB[l].has(w));
  const problems = [];
  for (const x of texts) {
    // a 12-hour clock (5:46PM, 6:15 pm, 5:20 p.m.) on a board that does not
    // lead in English: its AM/PM is an English word (a board reads the clock
    // of the language it leads with, BoardStrings.boardClock24)
    const clock12 = /\d{1,2}:\d{2}(?:\s| | )?[AaPp]\.?\s?[Mm]\b\.?/g;
    // (A half marked English may keep English's own clock on a board that
    // leads in another language, as each half of the welcome strip does.)
    const lead = BS.frenchFirst(set.slice(), ap || 'YQM')[0];
    const englishHalf = x.own && String(x.lang).toLowerCase().split('-')[0] === 'en';
    if (lead !== 'en' && !(set.includes('en') && englishHalf)) for (const m of x.t.match(clock12) || []) problems.push(`'${m}' (a 12-hour clock) on a ${set.join('+')} board: "${x.t.slice(0, 70)}" (${x.where})`);
    // words: every Latin word is one of the board's languages', or data
    // translate="no" marks data a passenger reads as written — a hotel's
    // street address or name (its words are checked for script and marks
    // below, not for language; the static guard holds the markup)
    // data-i18n-all marks a piece that shows EVERY board language by design
    // (the weather card's opening title): its lines are held to their marks
    // below, not to the board's languages
    // data-i18n-feed marks a feed's own sentences (a hotel's description):
    // no store holds those words, so they are held to their language instead
    // — the one the element is marked with, one of the board's, and the text
    // has to look like it (BoardStrings.looksLike: an English answer in a
    // Japanese column fails)
    if (x.feed && /\p{L}/u.test(x.t)) {
      const fl = String(x.lang || '').toLowerCase().split('-')[0];
      if (!set.includes(fl)) problems.push(`feed text in ${fl || 'no language'} on a ${set.join('+')} board: "${x.t.slice(0, 70)}" (${x.where})`);
      else if (!BS.looksLike(x.t, fl)) problems.push(`feed text marked ${fl} is not ${fl}: "${x.t.slice(0, 70)}" (${x.where})`);
    }
    // a whole name ('Air Canada Express') is data; a brand counts as its
    // whole phrase, never word by word
    let bare = x.t.replace(clock12, ' ');
    // a whole name as one piece of a line ('Bienvenue · Greater Moncton
    // Roméo LeBlanc International Airport'): that piece is data
    bare = bare.split(/\s+[\u00B7|\u2022\u2013\u2014]\s+/).filter((seg) => !DATA_PHRASES.has(checks.norm(seg))).join(' · ');
    for (const re of BRAND_RE) bare = bare.replace(re, '$1 ');
    const latin = (x.data || x.all || x.feed) ? [] : bare.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’.-]*/g) || [];
    for (const raw of latin) {
      const w = raw.replace(ELIDED, '').replace(/[^A-Za-zÀ-ɏ]+$/, '');
      if (w.length < 2) continue;
      // codes: YQM, AC, CYQM, MAX — but a word in capitals is a word
      if (/^[A-Z0-9]{2,4}$/.test(w) && (CODES.has(w) || /\d/.test(w) || !ANY_WORD.has(w.toLowerCase()))) continue;
      if (/^(?:[A-Z]\.){2,}[A-Z]?$/.test(raw) || /^(?:[A-Z]\.)+[A-Z]$/.test(w)) continue;   // initials: F.I.D.S.
      if (/\d/.test(raw)) continue;
      if (allowed(w.toLowerCase())) continue;
      problems.push(`'${w}' is not a word of ${set.join('+')}: "${x.t.slice(0, 70)}" (${x.where})`);
    }
    // a placeholder left on screen: '???', 'TODO', 'FIXME', 'XXX', 'Lorem ipsum'
    if (/^\s*(?:\?{2,}|\uFF1F{2,}|TODO|FIXME|XXX+|[Ll]orem ipsum.*)\s*$/.test(x.t) || (!set.includes('en') && /^\s*(?:TBD|TBA|N\/A)\s*$/.test(x.t)))
      problems.push(`a placeholder on screen: "${x.t.slice(0, 50)}" (${x.where})`);
    // Persian or Urdu shown for Arabic
    if (RE_AR.test(x.t) && (checks.RE_PERSIAN_URDU.test(x.t) || (x.t.match(/[\u0600-\u06FF]+/g) || []).some((w) => checks.PERSIAN_WORDS.has(w.replace(/[\u064B-\u065F\u0670]/g, '')))))
      problems.push(`Persian or Urdu, not Arabic: "${x.t.slice(0, 50)}" (${x.where})`);
    // scripts: none from a language the board is not showing
    if (!x.all) {
      if (RE_AR.test(x.t) && !set.includes('ar')) problems.push(`Arabic on a ${set.join('+')} board: "${x.t.slice(0, 50)}" (${x.where})`);
      if (RE_KANA.test(x.t) && !set.includes('ja')) problems.push(`Japanese on a ${set.join('+')} board: "${x.t.slice(0, 50)}" (${x.where})`);
      if (RE_HAN.test(x.t) && !RE_KANA.test(x.t) && !set.includes('ja') && !set.includes('zh')) problems.push(`Chinese characters on a ${set.join('+')} board: "${x.t.slice(0, 50)}" (${x.where})`);
    }
    // marks: the script's language and direction
    const lg = String(x.lang || '').toLowerCase().split('-')[0];
    if (RE_AR.test(x.t) && (lg !== 'ar' || x.dir !== 'rtl')) problems.push(`Arabic not marked lang="ar" and right to left (lang=${x.lang || '—'}, ${x.dir}): "${x.t.slice(0, 50)}" (${x.where})`);
    if (RE_KANA.test(x.t) && lg !== 'ja') problems.push(`Japanese not marked lang="ja" (lang=${x.lang || '—'}): "${x.t.slice(0, 50)}" (${x.where})`);
    if (RE_HAN.test(x.t) && !RE_KANA.test(x.t)) {
      const want = x.all ? ['ja', 'zh'] : set.includes('zh') && !set.includes('ja') ? ['zh'] : set.includes('ja') && !set.includes('zh') ? ['ja'] : ['ja', 'zh'];
      if (!want.includes(lg)) problems.push(`Chinese characters marked lang=${x.lang || '—'} (want ${want.join(' or ')}): "${x.t.slice(0, 50)}" (${x.where})`);
    }
  }
  return [...new Set(problems)];
}

// ── the run ──────────────────────────────────────────────────────────────
const MODE = LIVE ? 'live' : 'demo';
const SINGLES = LANGS.map((l) => [l]);
// A language set goes into page code as its positions in the store's own
// list (LANGS), never as text: nothing from the command line or a surface
// spec is spliced into code that the page evaluates.
const LANGS_JS = '[' + LANGS.map((l) => JSON.stringify(l)).join(',') + ']';
const langsJs = (set) => `[${set.map((l) => LANGS.indexOf(l)).filter((i) => i >= 0).join(',')}].map(function (i) { return ${LANGS_JS}[i]; })`;
export const SETS = SINGLES.concat([['en', 'fr'], ['fr', 'en'], ['de', 'pt'], ['ar', 'ja'], ['es', 'zh']]);
// Offline (no LIVE), a board opened with ?mode=demo loads its demonstration
// flights, but LIVE_MODE starts true, so the board's own first airport pass
// (onApChange, deferred to a frame) can run after that, clear the flights
// and ask a feed this check cannot reach: the board came up empty on one
// load in three. Here the board is held on its demonstration data instead.
const BOARD_UP = `new Promise(function (res) { var t0 = Date.now(), held = false; (function poll() {
  try {
    if (${JSON.stringify(MODE)} === 'demo' && !held && Date.now() - t0 > 4000 && typeof loadDemo === 'function'
        && data && !data.dep.length && !data.arr.length) { held = true; LIVE_MODE = false; loadDemo(); }
  } catch (e) {}
  try { if (typeof setBoardLangs === 'function' && data && (data.dep.length || data.arr.length) && Date.now() - t0 > 5000) return res(1); } catch (e) {}
  if (Date.now() - t0 > 60000) return res(0); setTimeout(poll, 500); })(); })`;
const PLAYER_UP = `new Promise(function (res) { var t0 = Date.now(); (function poll() {
  try { var f = document.getElementById('playerFrame'); if (f && !f.hidden && f.textContent.trim().length > 40 && Date.now() - t0 > 3000) return res(1); } catch (e) {}
  if (Date.now() - t0 > 45000) return res(0); setTimeout(poll, 500); })(); })`;
const SETTLE = (ms) => `new Promise(function (res) { setTimeout(function () { res(1); }, ${ms}); })`;

// The gate's departure, put through the states a passenger meets: each is
// the flight row the gate is showing, changed and repainted.
// 'empty' is the gate with no flight left: its own screen (the gate number,
// "Awaiting next flight", the date).
const GATE_STATES = ['delayed', 'cancelled', 'boarding', 'final', 'gateclosed', 'porter-preboarding', 'gate-change', 'empty'];
const GATE_STATE = (st) => `(function (st) {
  try {
    if (window.__gfaOrig) { window._gateFlightsAt = window.__gfaOrig; window.__gfaOrig = null; }
    if (st === 'empty') {
      window.__gfaOrig = window._gateFlightsAt;
      window._gateFlightsAt = function () { return []; };
      renderDedicatedScreen();
      return document.getElementById('dedicatedFooterRight') ? 'ok' : 'the empty gate screen did not come up';
    }
    var f = window._gateCurrentFlight;
    if (!f) return 'no flight on the gate';
    if (!window.__wsOrig) window.__wsOrig = JSON.stringify(f);
    var o = JSON.parse(window.__wsOrig);
    Object.keys(o).forEach(function (k) { f[k] = o[k]; });
    var tz = (AP[(document.getElementById('apSel') || {}).value] || AP.YQM || {}).tz;
    var fmt = function (ts) { return new Date(ts).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
    var at = function (mins) { f._sortTs = Date.now() + mins * 60000; f.time = fmt(f._sortTs); f.upd = null; f._revTs = null; };
    try { setGateHistory({}); } catch (e) {}
    if (st === 'delayed') { at(70); f.status = 'delayed'; f._revTs = f._sortTs + 45 * 60000; f.upd = fmt(f._revTs); }
    else if (st === 'cancelled') { at(50); f.status = 'cancelled'; }
    else if (st === 'boarding') { at(24); f.status = 'boarding'; }
    else if (st === 'final') { at(8); f.status = 'final'; }
    else if (st === 'gateclosed') { at(3); f.status = 'gateclosed'; }
    else if (st === 'porter-preboarding') { at(34); f.status = 'boarding'; f.airline = 'PD'; f.flight = 'PD2381'; f._flightKey = 'PD2381'; f._airlineName = 'PORTER'; }
    else if (st === 'gate-change') { var h = {}; h[f.flight] = { previousGate: '4', currentGate: '7', changedAt: Date.now() - 60000 }; setGateHistory(h); }
    renderDedicatedScreen();
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})(${JSON.stringify(st)})`;
const GATE_RESET = `(function () { try { if (window.__gfaOrig) { window._gateFlightsAt = window.__gfaOrig; window.__gfaOrig = null; } var f = window._gateCurrentFlight; if (f && window.__wsOrig) { var o = JSON.parse(window.__wsOrig); Object.keys(o).forEach(function (k) { f[k] = o[k]; }); } setGateHistory({}); renderDedicatedScreen(); } catch (e) {} })()`;

// The Studio player shows a published document: one per board family is
// put in the airport's published store before it loads.
const STUDIO_SEED = `(function () {
  var S = window.OrionStudioSchema, A = window.OrionStudioAirports;
  var ap = A.resolve(location.hostname, location.search);
  var pub = {};
  ['fids', 'gids', 'bids'].forEach(function (fam) {
    var d = S.newDocument({ family: fam, airport: ap, id: 'lang-check-' + fam, name: 'language check ' + fam });
    pub[d.id] = { version: 1, document: d };
  });
  localStorage.setItem(S.airportStorageKey('orion_studio_published:v1', ap), JSON.stringify(pub));
  return Object.keys(pub).join(',');
})()`;

export const SURFACES = {
  gate: { url: (port) => `http://127.0.0.1:${port}/gids.html?ap=YQM&mode=${MODE}&gate=4&wxspeed=0.5`, ready: BOARD_UP, setLangs: true, deck: true, states: true, chunk: 2, alarm: 200, parallel: 2 },
  departures: { url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YQM&mode=${MODE}`, ready: BOARD_UP, setLangs: true, chunk: 5 },
  baggage: { url: (port) => `http://127.0.0.1:${port}/bids.html?ap=YQM&mode=${MODE}`, ready: BOARD_UP, setLangs: true, chunk: 5 },
  // the phone: one language, the one the passenger picked (fids_mobile_lang)
  'phone-gate': { url: (port) => `http://127.0.0.1:${port}/gids.html?ap=YQM&mode=${MODE}&gate=4`, ready: BOARD_UP, phone: true, sets: SINGLES, chunk: 3, alarm: 200 },
  'phone-departures': { url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YQM&mode=${MODE}`, ready: BOARD_UP, phone: true, sets: SINGLES, chunk: 3, alarm: 200 },
  // the Studio player, one language at a time (?lang=), three families
  studio: { url: (port, set, fam) => `http://127.0.0.1:${port}/studio/player.html?ap=YQM&doc=lang-check-${fam}&lang=${set[0]}`,
    seed: (port) => `http://127.0.0.1:${port}/studio/player.html?ap=YQM`, families: ['fids', 'gids', 'bids'], ready: PLAYER_UP, sets: SINGLES, chunk: 2, perSet: true, alarm: 240 },
  // the arrivals board (the departures board's other side)
  arrivals: { url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YQM&mode=${MODE}`, ready: BOARD_UP, setLangs: true, prep: `(function () { try { setViewMode('arr'); return 1; } catch (e) { return 0; } })()`,
    sets: [['en', 'fr'], ['fr'], ['de', 'pt'], ['ar', 'ja'], ['es', 'zh'], ['it']], chunk: 6 },
  // a Québec airport: French leads whenever it is chosen (BoardStrings.FR_FIRST)
  'quebec-departures': { ap: 'YUL', url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YUL&mode=${MODE}`, ready: BOARD_UP, setLangs: true,
    sets: [['en', 'fr'], ['fr'], ['de', 'pt'], ['ar', 'ja']], chunk: 4 },
  'quebec-arrivals': { ap: 'YUL', url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YUL&mode=${MODE}`, ready: BOARD_UP, setLangs: true,
    prep: `(function () { try { setViewMode('arr'); return 1; } catch (e) { return 0; } })()`, sets: [['en', 'fr'], ['es', 'zh']], chunk: 2 },
  'quebec-gate': { ap: 'YUL', url: (port) => `http://127.0.0.1:${port}/gids.html?ap=YUL&mode=${MODE}&gate=72&wxspeed=0.5`, ready: BOARD_UP, setLangs: true, deck: true, states: true,
    sets: [['en', 'fr'], ['fr'], ['de', 'pt'], ['ar', 'ja'], ['en']], chunk: 2, alarm: 220, parallel: 2 },
  // the stream's rotation page: the boards it rotates, in its frames
  rotate: { url: (port, set) => `http://127.0.0.1:${port}/rotate.html?ap=YQM&mode=${MODE}&rotate=fids,gids,bids&dwell=9&langs=${set.join(',')}`, ready: SETTLE(15000),
    sets: [['de'], ['ar', 'ja'], ['fr', 'en']], perSet: true, waits: [0, 9000, 9000], chunk: 3, alarm: 200 },
  // the stream tour: its own card, and the boards in its frames
  tour: { url: (port, set) => `http://127.0.0.1:${port}/tour.html?ap=YQM&langs=${set.join(',')}`, ready: SETTLE(9000), sets: [['de'], ['ar'], ['ja'], ['en', 'fr']], chunk: 2, perSet: true }
};

// One browser for one surface and a few language sets, so no browser lives
// near its alarm; the surfaces run side by side.
async function runChunk(port, name, spec, sets) {
  const b = await browser(spec.alarm);
  const lines = [];
  let failed = 0;
  const seenMiss = new Set();
  try {
    const { targetInfos } = await b.send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page');
    const tid = page ? page.targetId : (await b.send('Target.createTarget', { url: 'about:blank' })).targetId;
    const { sessionId } = await b.send('Target.attachToTarget', { targetId: tid, flatten: true });
    const S = (m, p, ms) => b.send(m, p, sessionId, ms);
    const evalv = async (expression, ms) => { const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms); return r && r.result && r.result.value; };
    if (spec.phone) await S('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    else await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await S('Emulation.setFocusEmulationEnabled', { enabled: true });
    await S('Page.enable'); await S('Runtime.enable');
    await S('Page.addScriptToEvaluateOnNewDocument', { source: CANVAS_HOOK });
    const read = async (label, tag) => {
      const r = JSON.parse(await evalv(READ));
      const out = [];
      if (!spec.phone && spec.setLangs && String(r.langs) !== String(BS.frenchFirst(label.slice(), spec.ap || 'YQM'))) out.push(`the board shows ${r.langs}, not ${BS.frenchFirst(label.slice(), spec.ap || 'YQM').join(',')}`);
      if (spec.phone && r.langs && String(r.langs) !== String(label)) out.push(`the phone shows ${r.langs}, not ${label.join(',')}`);
      out.push(...judge(r.texts, label, spec.ap).map((p) => (tag ? `[${tag}] ` : '') + p));
      for (const m of r.misses || []) if (!seenMiss.has(m)) { seenMiss.add(m); out.push(`the store was asked for ${m}, which it does not have: it rendered blank`); }
      return out;
    };
    // a page that does not come up is loaded once more before it counts
    const go = async (url) => {
      await S('Page.navigate', { url });
      if (await evalv(spec.ready, 70000)) return 1;
      await S('Page.navigate', { url });
      return evalv(spec.ready, 70000);
    };
    if (spec.seed) { await go(spec.seed(port)).catch(() => 0); await evalv(SETTLE(1500)); await evalv(STUDIO_SEED); }
    if (!spec.perSet && !spec.phone) {
      const up = await go(spec.url(port));
      if (!up) { lines.push(`✖ ${name}: the board never came up`); return { lines, failed: 1 }; }
    }
    let phoneScript = null;
    for (const set of sets) {
      const label = set.join(',');
      const problems = [];
      if (spec.phone) {
        if (phoneScript) await S('Page.removeScriptToEvaluateOnNewDocument', { identifier: phoneScript }).catch(() => {});
        // (the board clears fids_mobile_lang once, on a browser's first visit,
        // as a v27 recovery: mark that done, or the choice is wiped)
        phoneScript = (await S('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('fids_lang_recovery_v27_done', '1'); localStorage.setItem('fids_mobile_lang', ${langsJs(set)}[0]); } catch (e) {}` })).identifier;
        if (!(await go(spec.url(port, set)))) { problems.push('the phone never came up'); }
      } else if (spec.perSet) {
        for (const fam of (spec.families || [null])) {
          const up = await go(spec.url(port, set, fam));
          if (!up) { problems.push(`${fam || name} never came up`); continue; }
          for (const wait of (spec.waits || [800, 2500])) { await evalv(SETTLE(wait)); problems.push(...await read(set, fam)); }
        }
      } else if (spec.setLangs) {
        // the saved choice, as toggleLang writes it: the airport config is re-applied
        // every 10 s (refreshAirportConfig) and keeps a saved choice, but not one
        // that was only set in memory
        await evalv(`(function () { var L = ${langsJs(set)}; try { var ap = ((document.getElementById('apSel') || {}).value || '').toUpperCase(); if (ap) localStorage.setItem('fids_langs_' + ap, L.join(',')); } catch (e) {} setBoardLangs(L); })()`);
        if (spec.prep) {
          await evalv(spec.prep);
          if (/'arr'/.test(spec.prep) && (await evalv(`(function () { try { return mode; } catch (e) { return ''; } })()`)) !== 'arr') problems.push('the board did not turn to its arrivals');
        }
      }
      if (!spec.perSet) {
        // two readings: the gate's panels and the board's paging move on
        for (const wait of [1500, 3000]) { await evalv(SETTLE(wait)); problems.push(...await read(set)); }
      }
      // the gate's centre panel: every slide of its deck in turn — the
      // welcome, the airline ads, the hotel, the map takeover, and the
      // weather card through its three screens (?wxspeed=0.5 runs it at
      // twice its speed: ~18 s for all three)
      if (spec.deck) {
        const n = await evalv(`(function () { try { return _buildGateAdSlideList().length; } catch (e) { return 0; } })()`);
        for (let i = 0; i < Math.min(n || 0, 10); i++) {
          const type = await evalv(`(function () { try { var sl = _buildGateAdSlideList()[${i}]; _gateAdIndex = ${i}; window._gateAdAuthChange = true; renderGateAd(${i}); window._gateAdAuthChange = false; return (sl && sl.type) || ''; } catch (e) { window._gateAdAuthChange = false; return 'error ' + e.message; } })()`);
          if (/^error/.test(type)) { problems.push(`slide ${i} did not render: ${type}`); continue; }
          for (const wait of (type === 'wxcard' ? (process.env.WX_WAITS ? process.env.WX_WAITS.split(',').map(Number) : [2500, 3000, 1000, 1000, 1000, 1000, 1000]) : [1500])) {
            await evalv(SETTLE(wait));
            // a hotel card is three pages that take turns: each is read
            const pages = await evalv(`document.querySelectorAll('#gateAdCarousel .axr-page').length`);
            for (let pg = 0; pg < Math.max(1, Math.min(pages || 0, 4)); pg++) {
              if (pages) {
                await evalv(`(function () { var ps = document.querySelectorAll('#gateAdCarousel .axr-page'); for (var k = 0; k < ps.length; k++) ps[k].classList.toggle('axr-page-on', k === ${pg}); })()`);
                await evalv(SETTLE(400));
              }
              problems.push(...await read(set, `${type || 'slide'} ${i}${pages ? ' p' + pg : ''}`));
            }
          }
        }
      }
      // the gate's departure, through every state a passenger meets
      if (spec.states) {
        for (const st of GATE_STATES) {
          const r = await evalv(GATE_STATE(st));
          if (r !== 'ok') { problems.push(`state ${st} did not render: ${r}`); continue; }
          await evalv(SETTLE(1200));
          problems.push(...await read(set, st));
        }
        await evalv(GATE_RESET);
      }
      if (process.env.WORDS_DEBUG) for (const e of b.errors.splice(0)) if (/TypeError|ReferenceError|RangeError/.test(e)) lines.push(`    ! ${label} ${e.slice(0, 300)}`);
      const uniq = [...new Set(problems)];
      lines.push(`${uniq.length ? '✖' : '✔'} ${name} ${label}${uniq.length ? ' — ' + uniq.length + ' problem' + (uniq.length > 1 ? 's' : '') : ''}`);
      for (const p of uniq.slice(0, 40)) lines.push('    ' + p);
      if (uniq.length > 40) lines.push(`    … and ${uniq.length - 40} more`);
      if (uniq.length) failed++;
    }
  } catch (e) {
    lines.push(`✖ ${name} ${sets.map((x) => x.join(',')).join(' ')}: ${e.message}`);
    failed++;
  } finally {
    b.close();
  }
  return { lines, failed };
}

// ── the check is itself checked ──────────────────────────────────────────
// English put onto a German departures board in every way a page can show
// words — a text node, a 'Word: ' label, capitals made by CSS, a ::after,
// a placeholder, canvas text, a key the store does not have — must each be
// reported. Run first, every time: a reader that stopped seeing would pass
// every board.
const INJECT = `(function () {
  var host = document.createElement('div');
  host.id = '__wsInject';
  host.style.cssText = 'position:fixed;left:40px;top:300px;z-index:99999;background:#000;color:#fff;font:24px sans-serif;padding:8px';
  host.innerHTML = '<div>Flight status</div><div>Delay: 45 min</div><div style="text-transform:uppercase">delayed</div>'
    + '<div class="__wsAfter">x</div><input placeholder="Search flights"><canvas width="300" height="40"></canvas>'
    + '<div>LATE</div><div>???</div><div>GATE 7</div>';
  document.body.appendChild(host);
  var st = document.createElement('style');
  st.textContent = '.__wsAfter::after { content: "Gate closes"; }';
  document.head.appendChild(st);
  var cv = host.querySelector('canvas').getContext('2d'); cv.font = '20px sans-serif'; cv.fillText('Boarding pass', 4, 24);
  try { BoardStrings.bs('selfTestNoSuchKey', 'de'); } catch (e) {}
  return 1;
})()`;
const MUST_SEE = [/'Flight' is not a word of de/, /'Delay' is not a word of de/, /'delayed' is not a word of de/, /'closes' is not a word of de/,
  /'Search' is not a word of de/, /'pass' is not a word of de/, /selfTestNoSuchKey/, /'LATE' is not a word of de/, /a placeholder on screen: "\?\?\?"/];
async function selftest(port) {
  const b = await browser(150);
  try {
    const { targetInfos } = await b.send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page');
    const { sessionId } = await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const S = (m, p, ms) => b.send(m, p, sessionId, ms);
    const evalv = async (expression, ms) => { const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms); return r && r.result && r.result.value; };
    await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await S('Page.enable'); await S('Runtime.enable');
    await S('Page.addScriptToEvaluateOnNewDocument', { source: CANVAS_HOOK });
    await S('Page.navigate', { url: SURFACES.departures.url(port) });
    if (!(await evalv(BOARD_UP, 70000))) return ['the departures board never came up'];
    await evalv(`setBoardLangs(["de"])`);
    await evalv(SETTLE(1500));
    await evalv(INJECT);
    await evalv(SETTLE(300));
    const r = JSON.parse(await evalv(READ));
    const got = judge(r.texts, ['de']).concat((r.misses || []).map((m) => 'miss ' + m));
    return MUST_SEE.filter((re) => !got.some((p) => re.test(p))).map((re) => 'the check did not see ' + re);
  } finally { b.close(); }
}

async function main() {
  if (!CHROME) { console.log('no Chrome found (set CHROME=)'); process.exit(2); }
  if (!onlySurface || onlySurface === '--selftest') {
    const server0 = await serve();
    const blind = await selftest(server0.address().port).catch((e) => ['self-test failed: ' + e.message]);
    server0.close();
    if (blind.length) { for (const l of blind) console.log('✖ self-test: ' + l); process.exit(1); }
    console.log('✔ self-test: injected English seen in every form (text, label, capitals, ::after, placeholder, canvas, a missing key)');
    if (onlySurface === '--selftest') process.exit(0);
  }
  const server = await serve();
  const port = server.address().port;
  let failed = 0;
  try {
    const jobs = [];
    for (const [name, spec] of Object.entries(SURFACES)) {
      if (onlySurface && onlySurface !== name) continue;
      const sets = (spec.sets || SETS).filter((s) => !onlySet || s.join(',') === onlySet);
      if (!sets.length) continue;
      const chunks = [];
      for (let i = 0; i < sets.length; i += spec.chunk || 5) chunks.push(sets.slice(i, i + (spec.chunk || 5)));
      // a surface's chunks one after another (or `parallel` at a time); the
      // surfaces side by side
      jobs.push((async () => {
        const out = new Array(chunks.length);
        let next = 0;
        const lane = async () => { while (next < chunks.length) { const k = next++; out[k] = await runChunk(port, name, spec, chunks[k]); } };
        await Promise.all(Array.from({ length: Math.max(1, spec.parallel || 1) }, lane));
        return out;
      })());
    }
    for (const res of await Promise.all(jobs)) for (const r of res) { for (const l of r.lines) console.log(l); failed += r.failed; }
  } finally {
    server.close();
  }
  process.exit(failed ? 1 : 0);
}

export { serve, browser, READ, GATE_STATE, GATE_RESET };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
