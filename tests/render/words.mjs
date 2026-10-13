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
//   What is shown: the gate (its whole centre deck, its three information
//   cards each through its own ?scene=, its standby lists (every row whole,
//   with Later at this gate up and without; with eight names on the full
//   panel, the documents kept; painted while a face is still loading,
//   fitted in their first frame; and their window, not in the deck a minute
//   before 15 minutes ahead of boarding and the deck alone a minute after),
//   and its departure
//   delayed, cancelled, boarding (with the band under NOW BOARDING on a
//   U.S., an international and a domestic flight, checked to be on the
//   screen with every line fitted; and the lists' column beside the sign,
//   made short and read frame by frame as the takeover comes up, through a
//   resize and while a face is still loading, never a row past its foot),
//   on final call, closed, at
//   Porter's pre-boarding, and moved to another gate; and the gate with no
//   flight left), the departures board, the
//   baggage board, the phone layout of the gate and of the departures board
//   in each language, the Studio player (a departures, a gate and a baggage
//   document) in each language, and the stream tour. On the boards and the
//   gate (YQM and YUL), the airport's feed down too — no list, the last
//   update's time, the last good list with its age — each reached in other
//   languages and then read after a change to the set's, mid-visit.
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
// A face that is still loading when the standby lists paint (SB_LOADING,
// which names it as written here): answered, with nothing, only after 20 s.
const HELD_FACE = '/__words/held-face.woff2';
function serve() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname);
    if (p === HELD_FACE) { setTimeout(() => { try { res.writeHead(404); res.end(); } catch (e) {} }, 20000); return; }
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
  const args = ['--headless=new', '--use-mock-keychain', '--password-store=basic', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
    '--remote-debugging-pipe', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-first-run', '--no-default-browser-check'];
  // CI runners give Chrome a small /dev/shm; without this a long run can lose
  // its renderer, which reads as 'the browser went away'
  if (process.env.CI) args.push('--no-sandbox', '--disable-dev-shm-usage');
  // Without LIVE the page reaches nothing but this checkout: no feed, no
  // weather, no hotel — the same screens on every run, in CI and here.
  if (!LIVE) args.push('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
  // perl's alarm puts a hard ceiling on every browser even if this script dies
  // before it can kill it; each one serves a few language sets, well inside it
  const alarmS = alarm || +process.env.CHROME_ALARM || 120, born = Date.now();
  const chrome = spawn('perl', ['-e', 'alarm ' + alarmS + '; exec @ARGV', CHROME, ...args, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
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
  // a browser that lived to its alarm was stopped by it: a chunk too long for
  // its ceiling (give the surface a smaller chunk or a longer alarm), not a
  // fault in the page
  inp.on('close', () => {
    const lived = (Date.now() - born) / 1000;
    const why = lived >= alarmS - 2 ? 'the browser was stopped by its ' + alarmS + ' s alarm after ' + Math.round(lived) + ' s (this surface needs a smaller chunk or a longer alarm)' : 'the browser went away after ' + Math.round(lived) + ' s';
    for (const f of pend.values()) f({ error: { message: why } }); pend.clear();
  });
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
// A fixed word of this check's own (a mode, a screen state) written into page
// code: only lowercase letters and hyphens, quoted. Anything else stops the
// run (CodeQL js/bad-code-sanitization: JSON.stringify is not an escape for
// code).
const jsWord = (w) => {
  if (!/^[a-z][a-z-]*$/.test(String(w))) throw new Error('not a plain word for page code: ' + w);
  return "'" + w + "'";
};
// A language set goes into page code as its positions in the store's own
// list (LANGS), never as text: nothing from the command line or a surface
// spec is spliced into code that the page evaluates.
// The list itself is written from the store's codes, each checked to be two
// lowercase letters (CodeQL js/bad-code-sanitization: JSON.stringify is not
// an escape for code); anything else stops the run.
const LANGS_JS = '[' + LANGS.map((l) => {
  if (!/^[a-z]{2}$/.test(l)) throw new Error('board-strings LANGS holds a code that is not two letters: ' + l);
  return "'" + l + "'";
}).join(',') + ']';
const langsJs = (set) => `[${set.map((l) => LANGS.indexOf(l)).filter((i) => i >= 0).join(',')}].map(function (i) { return ${LANGS_JS}[i]; })`;
export const SETS = SINGLES.concat([['en', 'fr'], ['fr', 'en'], ['de', 'pt'], ['ar', 'ja'], ['es', 'zh']]);
// Offline (no LIVE), a board opened with ?mode=demo loads its demonstration
// flights, but LIVE_MODE starts true, so the board's own first airport pass
// (onApChange, deferred to a frame) runs too and asks a feed this check
// cannot reach (every host but this one is unresolvable here). Before
// v23998 that pass threw and the board kept whatever it had; since feed
// protection it is answered — the live data is unavailable (fidsFeedStatus),
// and with no last good list the board shows that instead of its rows. For
// Moncton the answer lands about ten seconds in (three tries at cyqm.ca and
// three at the second source, each way), after the board has come up, so the
// board went from its demonstration rows to "Live data unavailable" in the
// middle of the first language set. A board opened in demonstration mode is
// therefore held on its demonstration data only once that pass has answered
// (_initialFetchDone; 50 s at most, inside the 60 s this waits) — also when
// the pass cleared the board before loadDemo filled it, which used to be
// held at once and then emptied by the same pass landing seconds later —
// every time: the same screens on every run. The feed-down screens
// themselves are read on purpose below (FEED_STATES), each one in every
// language set, after a change of languages mid-visit.
const BOARD_UP = `new Promise(function (res) { var t0 = Date.now(), held = false, demo = ${jsWord(MODE)} === 'demo'; (function poll() {
  try {
    if (demo && !held && Date.now() - t0 > 4000 && typeof loadDemo === 'function' && data
        && (window._initialFetchDone === true || Date.now() - t0 > 50000)) { held = true; LIVE_MODE = false; loadDemo(); }
  } catch (e) {}
  try { if (typeof setBoardLangs === 'function' && data && (data.dep.length || data.arr.length) && (held || !demo) && Date.now() - t0 > 5000) return res(1); } catch (e) {}
  if (Date.now() - t0 > 60000) return res(0); setTimeout(poll, 500); })(); })`;
const PLAYER_UP = `new Promise(function (res) { var t0 = Date.now(); (function poll() {
  try { var f = document.getElementById('playerFrame'); if (f && !f.hidden && f.textContent.trim().length > 40 && Date.now() - t0 > 3000) return res(1); } catch (e) {}
  if (Date.now() - t0 > 45000) return res(0); setTimeout(poll, 500); })(); })`;
const SETTLE = (ms) => `new Promise(function (res) { setTimeout(function () { res(1); }, ${ms}); })`;

// The gate's departure, put through the states a passenger meets: each is
// the flight row the gate is showing, changed and repainted.
// 'empty' is the gate with no flight left: its own screen (the gate number,
// "Awaiting next flight", the date).
// v24006 — and the boarding screen's band under NOW BOARDING (the documents
// and the airline's close time) on the routes that change its words: an
// international flight on WestJet (passport and visa; "Boarding cut-off"), a
// domestic one on Flair (boarding pass and ID; "Boarding closes"), and one
// to the U.S. on WestJet (the passport at Moncton; passport or NEXUS card at
// Montréal, a preclearance airport).
const GATE_STATES = ['delayed', 'cancelled', 'boarding', 'boarding-intl', 'boarding-domestic', 'boarding-us', 'final', 'gateclosed', 'porter-preboarding', 'gate-change', 'empty'];
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
    else if (st === 'boarding-intl') { at(24); f.status = 'boarding'; f.airline = 'WS'; f.flight = 'WS2604'; f._flightKey = 'WS2604'; f._airlineName = 'WESTJET'; f._locIata = 'CDG'; f.dest = 'Paris'; }
    else if (st === 'boarding-domestic') { at(30); f.status = 'boarding'; f.airline = 'F8'; f.flight = 'F8902'; f._flightKey = 'F8902'; f._airlineName = 'FLAIR AIRLINES'; f._locIata = 'YYZ'; f.dest = 'Toronto'; }
    else if (st === 'boarding-us') { at(24); f.status = 'boarding'; f.airline = 'WS'; f.flight = 'WS1272'; f._flightKey = 'WS1272'; f._airlineName = 'WESTJET'; f._locIata = 'BOS'; f.dest = 'Boston'; }
    else if (st === 'gate-change') { var h = {}; h[f.flight] = { previousGate: '4', currentGate: '7', changedAt: Date.now() - 60000 }; setGateHistory(h); }
    renderDedicatedScreen();
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})(${jsWord(st)})`;
// v24006 — and the band is ON THE SCREEN, not only in the markup: under the
// sign's strip, inside the screen, every line fitted (none reported over
// the floor), the documents line the route asks for, and the close time
// where the airline publishes one and it has not passed ('any' route; the
// variants in lowercase, as page code takes only plain words: 'pn' is the
// passport, or the passport or NEXUS card at a preclearance airport).
const BAND_STATES = { boarding: ['any', false], final: ['any', false], 'boarding-intl': ['i', true], 'boarding-domestic': ['d', true], 'boarding-us': ['pn', true] };
// 2026-10-12 — and under those signs the standby lists stay up, in their
// column beside the sign (gate-centre-cards.test.js): the column on the
// screen, beside the band and the sign and over neither, every row inside
// its card (none cut off at its foot) and every line fitted.
const COL_CHECK = `(function () {
  try {
    var col = document.querySelector('.g8-wrap.g8-sbcol-on .g8-sbcol');
    var card = col && col.querySelector('.gcard-col[data-gcard="sbcard"]');
    if (!card) return 'the lists are not beside the sign';
    var r = card.getBoundingClientRect(), c = col.getBoundingClientRect();
    if (!(r.width > 100 && r.height > 100) || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) return 'the lists are not on the screen';
    var others = document.querySelectorAll('.g8-takeover .g8-band, .g8-takeover .g8-board-body.g8-sign');
    for (var k = 0; k < others.length; k++) {
      var o = others[k].getBoundingClientRect();
      if (o.right > c.left + 1 && o.left < c.right - 1 && o.bottom > c.top + 1 && o.top < c.bottom - 1) return 'the lists overlap the ' + (others[k].classList.contains('g8-band') ? 'band' : 'sign');
    }
    var over = card.querySelector('[data-fx-over]');
    if (over) return 'a line of the lists does not fit at the floor: ' + over.textContent;
    var rows = card.querySelectorAll('.gc-sbr, .gc-sbhd');
    for (var i = 0; i < rows.length; i++) {
      var b = rows[i].getBoundingClientRect();
      if (b.bottom > r.bottom + 1) return 'a row of the lists is cut off at the foot of its column: ' + rows[i].textContent;
    }
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
// 2026-10-12 — and the column is fitted in the frame it paints, every frame:
// its scale used to come down 0.04 a frame, each step painted with its last
// rows cut off (1-5 frames at the switch into the countdown); it waited for
// the board's fonts (cut off for a whole load after a reload, 3-18 s); and a
// resize sent it back to its full size for a frame. Here the column is made
// short (COL_SHORT: its box is given the height that holds 0.8 of its lists
// at their full size, so its scale has to come down in every language set),
// every frame is read after its layout and before its paint (COL_REC: a
// ResizeObserver's second round, after any of the page's own), and the
// column is painted afresh as the takeover comes up (COL_REPAINT), through a
// resize, and while a face is still loading (HELD_FACE): no frame may show a
// row past the column's foot, or a line of the lists past its own edge
// (2026-10-13), and the resize may not move its scale.
const COL_SHORT = `(function () {
  try {
    var col = document.querySelector('.g8-wrap.g8-sbcol-on .g8-sbcol'), card = col && col.querySelector('.gcard-col');
    if (!card) return 'the lists are not beside the sign';
    var k = parseFloat(card.style.getPropertyValue('--gc-k') || '1') || 1;
    var sbl = card.querySelector('.gc-sbl'), last = sbl && sbl.lastElementChild;
    if (!last) return 'the column has no list';
    var top = sbl.getBoundingClientRect().top, r = card.getBoundingClientRect();
    var room = r.bottom - (parseFloat(getComputedStyle(card).paddingBottom) || 0) - top;
    var lists = last.getBoundingClientRect().bottom - top;
    var h = Math.round(col.offsetHeight - room + 0.8 * lists / k);
    var st = document.getElementById('__wordsColShort');
    if (!st) { st = document.createElement('style'); st.id = '__wordsColShort'; document.head.appendChild(st); }
    st.textContent = '.g8-sbcol { max-height: ' + h + 'px !important; }';
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
const COL_UNSHORT = `(function () { try { var st = document.getElementById('__wordsColShort'); if (st) st.remove(); if (window.__wordsColRec) window.__wordsColRec.stop(); } catch (e) {} })()`;
const COL_REC = `(function () {
  try {
    if (window.__wordsColRec) window.__wordsColRec.stop();
    var R = window.__wordsColRec = { frames: 0, seen: 0, bad: [], ks: [], on: true };
    var a = document.createElement('div'), top = document.createElement('div'), d = top;
    a.style.cssText = 'position:fixed;left:-40px;top:-40px;width:1px;height:1px;opacity:0;pointer-events:none';
    top.style.cssText = 'position:fixed;left:-80px;top:-80px;width:4px;height:4px;opacity:0;pointer-events:none;overflow:hidden';
    for (var i = 0; i < 60; i++) { var c = document.createElement('div'); c.style.cssText = 'width:3px;height:3px'; d.appendChild(c); d = c; }
    document.documentElement.appendChild(a); document.documentElement.appendChild(top);
    var read = function () {
      R.frames++;
      var card = document.querySelector('.g8-sbcol .gcard-col');
      if (!card) return;
      var r = card.getBoundingClientRect();
      if (!(r.width > 50 && r.height > 50)) return;
      var sbl = card.querySelector('.gc-sbl'), last = sbl && sbl.lastElementChild;
      if (!last) return;
      R.seen++;
      var k = card.style.getPropertyValue('--gc-k') || '1';
      if (R.ks[R.ks.length - 1] !== k) R.ks.push(k);
      var past = last.getBoundingClientRect().bottom - (r.bottom - (parseFloat(getComputedStyle(card).paddingBottom) || 0));
      if (past > 1 && R.bad.length < 20) R.bad.push(Math.round(past) + 'px at scale ' + k);
      // 2026-10-13 — and across: no line of the lists run past its own edge,
      // which cuts it (a status word a landing face widened, its first
      // letters cut for 250-500 ms until the face's own pass)
      var lns = card.querySelectorAll('.gc-sbl .gc-sbx, .gc-sbl .gc-sbnm, .gc-sbl .gc-sbtt, .gc-sbl .gc-sbcab');
      for (var j = 0; j < lns.length; j++) {
        var ln = lns[j];
        if (ln.hasAttribute('data-fx-over') || !(ln.clientWidth > 4)) continue;
        if (ln.scrollWidth > ln.clientWidth + 1) { if (R.bad.length < 20) R.bad.push('a line cut at its edge by ' + (ln.scrollWidth - ln.clientWidth) + 'px (' + (ln.textContent || '').trim().slice(0, 24) + ') at scale ' + k); break; }
      }
    };
    // the shallow box changes every frame; its callback changes a box deeper
    // than any the page watches, delivered in the next round, after the
    // page's own observers: the frame is read there
    var flip = false, dflip = false, first = true;
    var ro1 = new ResizeObserver(function () { d.style.width = (dflip = !dflip) ? '2px' : '1px'; });
    var ro2 = new ResizeObserver(function () { if (first) { first = false; return; } read(); });
    ro1.observe(a); ro2.observe(d);
    (function loop() { requestAnimationFrame(function () { if (!R.on) return; a.style.width = (flip = !flip) ? '2px' : '1px'; loop(); }); })();
    R.stop = function () { R.on = false; ro1.disconnect(); ro2.disconnect(); a.remove(); top.remove(); };
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
const COL_REC_READ = (ms, still) => `new Promise(function (res) {
  setTimeout(function () {
    var R = window.__wordsColRec;
    if (!R) return res('the frames were not read');
    R.stop();
    if (R.seen < 8) return res('the column was on screen for ' + R.seen + ' frames of ' + R.frames + ' read');
    if (R.bad.length) return res(R.bad.length + ' frames painted the column cut: its last row past its foot, or a line past its edge (' + R.bad.slice(0, 4).join(', ') + '; scales ' + R.ks.join(' > ') + ')');
    if (${still ? 'true' : 'false'} && R.ks.length > 1) return res('its scale moved: ' + R.ks.join(' > '));
    res('ok');
  }, ${Number(ms)});
})`;
// the takeover painted afresh, as when the countdown or NOW BOARDING comes up
const COL_REPAINT = `(function () {
  try {
    window._lastGateKey = ''; dedicatedRenderKey = '';
    renderDedicatedScreen();
    var card = document.querySelector('.g8-sbcol .gcard-col');
    if (!card) return 'the lists are not beside the sign';
    if (card.hasAttribute('data-sb-k') || card.style.getPropertyValue('--gc-k')) return 'the column was not painted afresh';
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
const COL_RESIZE = `(function () { try { window.dispatchEvent(new Event('resize')); return 'ok'; } catch (e) { return 'error ' + e.message; } })()`;
// a face held loading (as SB_LOADING), then the takeover painted afresh
const COL_HOLD = `(function () {
  try {
    var ff = new FontFace('WordsHeldFace', 'url(/__words/held-face.woff2)');
    document.fonts.add(ff);
    ff.load().catch(function () {});
    window.__wordsHeldFace = ff;
    return document.fonts.status === 'loading' ? 'ok' : 'a face held loading did not hold the fonts loading (' + document.fonts.status + ')';
  } catch (e) { return 'error ' + e.message; }
})()`;
const COL_LOADED_FIT = `(function () {
  var card = document.querySelector('.g8-sbcol .gcard-col');
  if (!card) return 'the lists are not beside the sign';
  if (document.fonts.status !== 'loading') return 'the fonts finished loading before the column was read';
  return /\\|f\\d+$/.test(card.getAttribute('data-sb-fit') || '') ? 'ok' : 'the column was not measured while the fonts were loading (' + (card.getAttribute('data-sb-fit') || 'unfitted') + ')';
})()`;
const BAND_CHECK = (want, close) => `(function (want, close) {
  try {
    var band = document.querySelector('.g8-board.active .g8-band, .g8-final.active .g8-band');
    if (!band) return 'no band under the sign';
    var r = band.getBoundingClientRect();
    if (!(r.width > 50 && r.height > 20) || r.top < 0 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1) return 'the band is not on the screen (' + [r.left, r.top, r.width, r.height].map(Math.round).join(',') + ')';
    var doc = (band.getAttribute('data-doc') || '').toLowerCase();
    if (want !== 'any' && (!doc || want.indexOf(doc) < 0)) return 'the documents line is ' + doc + ', the route asks for ' + want;
    var lns = band.querySelectorAll('.g8-band-ln');
    if (!band.querySelector('.g8-band-docs .g8-band-ln')) return 'no documents line';
    for (var i = 0; i < lns.length; i++) {
      var lr = lns[i].getBoundingClientRect();
      if (!(lr.height > 4 && lr.width > 4)) return 'a band line is not drawn: ' + lns[i].textContent;
      if (lns[i].hasAttribute('data-fx-over')) return 'a band line does not fit at the floor: ' + lns[i].textContent;
      if (lr.top < r.top - 1 || lr.bottom > r.bottom + 1) return 'a band line runs out of the band: ' + lns[i].textContent;
    }
    if (close && !band.querySelector('.g8-band-close .g8-band-ln')) return 'no close time';
    if (band.querySelector('.g8-band-close') && !band.querySelector('.g8-band-close .g8-band-ln')) return 'an empty close half';
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})(${jsWord(want)}, ${close ? 'true' : 'false'})`;
// v24012 — and the centre deck's three cards (gate-centre-cards.test.js),
// each reached through its own ?scene= pin (written into the address, as a
// reviewer would load it), with the gate's departure 50 minutes out and
// Scheduled so all three are due (the gate-closes card shows only in the last
// 45 minutes before the close): the card on the screen, inside the centre
// panel, and every one of its lines fitted and inside it.
// 2026-10-12 — and the standby lists (sbcard), with the documents and the
// close time at their foot.
const CARD_SCENES = ['ovcard', 'docscard', 'closecard', 'sbcard'];
const CARD_PREP = `(function () {
  try {
    var f = window._gateCurrentFlight;
    if (!f) return 'no flight on the gate';
    if (!window.__wsOrig) window.__wsOrig = JSON.stringify(f);
    var o = JSON.parse(window.__wsOrig);
    Object.keys(o).forEach(function (k) { f[k] = o[k]; });
    var tz = (AP[(document.getElementById('apSel') || {}).value] || AP.YQM || {}).tz;
    var at = function (ts) { f._sortTs = ts; f.time = new Date(ts).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
    at(Date.now() + 50 * 60000);
    f.upd = null; f._revTs = null; f.status = 'scheduled';
    try { setGateHistory({}); } catch (e) {}
    renderDedicatedScreen();
    // 2026-10-13 — the standby lists come up 15 minutes before the printed
    // boarding time and go beside the countdown 10 minutes before it: the
    // boarding time is put 14 minutes on (the departure the gate's own lead
    // after it, read back from the paint), so every card is due in the
    // centre for the next four minutes
    var m = window._gateCardsModel;
    if (!(m && m.depAt > 0 && m.boardAt > 0)) return 'the gate printed no boarding time';
    at(Date.now() + 14 * 60000 + (m.depAt - m.boardAt));
    renderDedicatedScreen();
    var due = _gateCardsDue(window._gateCardsModel, Date.now());
    if (!due.sbcard) return 'the standby lists are not due 14 minutes before boarding';
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
const CARD_SCENE = (t) => `(function (t) {
  try {
    var u = new URL(location.href); u.searchParams.set('scene', t); history.replaceState(null, '', u.toString());
    var sl = _buildGateAdSlideList(), i = -1;
    for (var k = 0; k < sl.length; k++) if (sl[k] && sl[k].type === t) { i = k; break; }
    if (i < 0) return 'the deck has no ' + t + ' (' + sl.map(function (x) { return x && x.type; }).join(',') + ')';
    _gateAdIndex = i;
    window._gateAdAuthChange = true; renderGateAd(i); window._gateAdAuthChange = false;
    return 'ok';
  } catch (e) { window._gateAdAuthChange = false; return 'error ' + e.message; }
})(${jsWord(t)})`;
const CARD_CHECK = (t) => `(function (t) {
  try {
    var screen = document.getElementById('gateAdCarousel');
    var card = screen && screen.querySelector(':scope > .gcard[data-gcard="' + t + '"]');
    if (!card) return 'the ' + t + ' card is not on the screen';
    var r = card.getBoundingClientRect(), s = screen.getBoundingClientRect();
    if (!(r.width > 100 && r.height > 100) || r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1) return 'the ' + t + ' card is not inside the centre panel';
    var over = card.querySelector('[data-fx-over]');
    if (over) return 'a line does not fit at the floor: ' + over.textContent;
    var els = card.querySelectorAll('.gc-ttl, .gc-lbl, .gc-sub, .gc-t, .gc-stw, .gc-day, .gc-dtitle, .gc-hl, .gc-dl, .gc-gtl, .gc-bigt, .gc-bday, .gc-rule, .gc-dlbl, .gc-dt, .gc-sbtt, .gc-sbcab, .gc-sbnm, .gc-sbx, .gc-sbfl');
    if (!els.length) return 'the ' + t + ' card has no words';
    for (var i = 0; i < els.length; i++) {
      var b = els[i].getBoundingClientRect();
      if (b.width < 1) continue;
      if (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1) return 'a line runs out of the card: ' + els[i].textContent;
    }
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})(${jsWord(t)})`;
const CARD_RESET = `(function () { try { var u = new URL(location.href); u.searchParams.delete('scene'); history.replaceState(null, '', u.toString()); } catch (e) {} })()`;
// 2026-10-13 — the standby lists' window, on the board itself: they come up
// 15 minutes before the printed boarding time (the 90 or 120 minutes before
// the departure they had was far too early). A minute before it opens the
// centre deck turns as it always has, the lists not in it; a minute after,
// the deck is the lists alone. The gate's own boarding lead is read back
// from its paint (the departure minus the boarding time it printed).
const SB_WINDOW = `(function () {
  try {
    var f = window._gateCurrentFlight;
    if (!f) return 'no flight on the gate';
    if (!window.__wsOrig) window.__wsOrig = JSON.stringify(f);
    var o = JSON.parse(window.__wsOrig);
    Object.keys(o).forEach(function (k) { f[k] = o[k]; });
    var u = new URL(location.href); u.searchParams.delete('scene'); history.replaceState(null, '', u.toString());
    var tz = (AP[(document.getElementById('apSel') || {}).value] || AP.YQM || {}).tz;
    var at = function (ts) { f._sortTs = ts; f.time = new Date(ts).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); renderDedicatedScreen(); };
    f.upd = null; f._revTs = null; f.status = 'scheduled';
    try { setGateHistory({}); } catch (e) {}
    at(Date.now() + 50 * 60000);
    var m = window._gateCardsModel;
    if (!(m && m.depAt > 0 && m.boardAt > 0)) return 'the gate printed no boarding time';
    var lead = m.depAt - m.boardAt;
    var deck = function (mins) { at(Date.now() + mins * 60000 + lead); return _buildGateAdSlideList().map(function (d) { return (d && d.type) || ''; }); };
    var early = deck(16);
    if (early.indexOf('sbcard') >= 0) return 'the lists are in the deck 16 minutes before boarding (' + early.join(',') + ')';
    if (early.length < 2) return 'the deck does not turn 16 minutes before boarding (' + early.join(',') + ')';
    var open = deck(14);
    if (open.join(',') !== 'sbcard') return 'the deck is not the lists alone 14 minutes before boarding (' + open.join(',') + ')';
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
// 2026-10-12 — and the standby lists in the centre never run into
// themselves (_gateSbFit), measured on the screen: every row at least as
// tall as its pieces (its ring, its name, its status word, its seat) and
// none over the row before it, every list's tile holding its rows and no
// list over the one before it, the last list inside its box and clear of the
// line and the foot under it, and no card the fitting pass gave up on
// (data-sb-over). Read on the full centre panel and again with "Later at
// this gate" up (SB_SHORT), where the card is 705px of 849 at 1680x1050 and
// the rows went under their own words (YUL C76, YHZ 20, Oct 12).
const SB_CHECK = `(function () {
  try {
    var card = document.querySelector('#gateAdCarousel > .gcard-sbcard');
    if (!card) return 'the lists are not in the centre';
    if (card.hasAttribute('data-sb-over')) return 'the lists do not fit their card (' + card.offsetWidth + 'x' + card.offsetHeight + ')';
    var name = function (e) { return e ? (e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) : ''; };
    var R = function (e) { return e.getBoundingClientRect(); };
    var secs = card.querySelectorAll('.gc-sbsec');
    if (!secs.length) return 'the lists card has no list';
    for (var i = 0; i < secs.length; i++) {
      var tile = secs[i].querySelector('.gc-sbt'), tr = R(tile);
      var rows = tile.querySelectorAll('.gc-sbr'), prev = null;
      for (var j = 0; j < rows.length; j++) {
        var b = R(rows[j]);
        if (b.top < tr.top - 1 || b.bottom > tr.bottom + 1) return 'a row runs out of its list: ' + name(rows[j]);
        if (prev && b.top < prev.bottom - 1) return 'a row lies over the one before it: ' + name(rows[j]);
        for (var p = rows[j].firstElementChild; p; p = p.nextElementSibling) {
          var q = R(p);
          if (q.height > 0 && (q.top < b.top - 1 || q.bottom > b.bottom + 1)) return 'a row is shorter than its words (' + Math.round(b.height) + 'px for ' + Math.round(q.height) + '): ' + name(rows[j]);
        }
        prev = b;
      }
      if (i && R(secs[i]).top < R(secs[i - 1]).bottom - 1) return 'a list lies over the one before it: ' + name(secs[i].querySelector('.gc-sbhd'));
    }
    var sbl = card.querySelector('.gc-sbl'), lr = R(sbl);
    if (R(secs[secs.length - 1]).bottom > lr.bottom + 1) return 'the last list runs past its box: ' + name(secs[secs.length - 1].querySelector('.gc-sbhd'));
    for (var n = sbl.nextElementSibling; n; n = n.nextElementSibling) {
      var nr = R(n);
      if (nr.height > 0 && nr.top < lr.bottom - 1) return 'the lists run into what is under them: ' + name(n);
    }
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
// "Later at this gate" up: the gate's own flight, and the same flight three
// hours on under another number (_gateFlightsAt, put back by SB_UNSHORT)
const SB_SHORT = `(function () {
  try {
    if (!window.__gfaOrig) window.__gfaOrig = window._gateFlightsAt;
    var orig = window.__gfaOrig;
    var tz = (AP[(document.getElementById('apSel') || {}).value] || AP.YQM || {}).tz;
    window._gateFlightsAt = function () {
      var gf = orig.apply(this, arguments) || [];
      if (gf.length !== 1) return gf;
      var f = gf[0], g = {};
      Object.keys(f).forEach(function (k) { g[k] = f[k]; });
      g._sortTs = (f._sortTs || Date.now()) + 3 * 3600000;
      g.time = new Date(g._sortTs).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      g.upd = null; g._revTs = null; g.status = 'scheduled';
      g.flight = String(f.airline || 'AC') + '8583'; g._flightKey = g.flight;
      return [f, g];
    };
    renderDedicatedScreen();
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
const SB_SHORT_UP = `(function () { return document.querySelector('.gad-media-col.gl-on') ? 'ok' : 'Later at this gate did not come up'; })()`;
// 2026-10-12 — and the documents (the boarding pass, ID, passport or NEXUS
// card) stay at the lists' foot on the full centre panel: the pass takes them
// away only when the rows at their floor and the card at 0.62 of its size
// cannot hold them (_gateSbLadder). Read with eight names, the most the lists
// hold with a premium cabin (2 upgrades, 4 standbys, 2 seat changes: YQM
// gate 1, WS813, the full 873px panel at 1920x1080), whatever the day's draw
// gives the demonstration flight (SB_EIGHT; SB_UNEIGHT puts it back), on the
// full panel whatever else the demonstration day has at the gate (SB_FULL:
// the gate's own flight alone, no later or moved flight; SB_UNFULL puts both
// back).
const SB_EIGHT = `(function () {
  try {
    if (!window.__sbListsOrig) window.__sbListsOrig = window._gateSbLists;
    var orig = window.__sbListsOrig;
    window._gateSbLists = function () {
      var L = orig.apply(this, arguments);
      if (!L) return L;
      var used = {};
      [L.upgrade, L.standby, L.seats].forEach(function (x) { ((x && x.rows) || []).forEach(function (r) { used[r.name] = 1; }); });
      var spare = ['KIN, B.', 'SCO, D.', 'HUN, F.', 'EVA, G.', 'FRA, J.', 'STE, K.', 'RIC, L.', 'DAV, N.'].filter(function (nm) { return !used[nm]; });
      var take = function (x, n, cabin) {
        var rows = ((x && x.rows) || []).slice(0, n).map(function (r) { return { st: r.st, name: r.name, seat: r.seat, pos: 0 }; });
        while (rows.length < n) rows.push({ st: 'wait', name: spare.shift(), seat: '14C', pos: 0 });
        var pos = 0;
        rows.forEach(function (r) { if (r.st !== 'cleared') r.pos = ++pos; });
        return { cabin: x ? x.cabin : cabin, rows: rows };
      };
      return { upgrade: take(L.upgrade, 2, 'cabinBiz'), standby: take(L.standby, 4, 'cabinEcon'), seats: take(L.seats, 2, null) };
    };
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
const SB_FULL = `new Promise(function (res) {
  try {
    if (!window.__gfaOrig) window.__gfaOrig = window._gateFlightsAt;
    var orig = window.__gfaOrig;
    window._gateFlightsAt = function () { return (orig.apply(this, arguments) || []).slice(0, 1); };
    if (!window.__gmaOrig) window.__gmaOrig = window._gateMovedAway;
    window._gateMovedAway = function () { return []; };
    // (the gate's own key does not carry what Later at this gate shows:
    // the gate is painted afresh)
    try { dedicatedRenderKey = null; window._lastGateKey = null; } catch (e) {}
    renderDedicatedScreen();
  } catch (e) { return res('error ' + e.message); }
  var t0 = Date.now();
  (function poll() {
    if (!document.querySelector('.gad-media-col.gl-on')) return res('ok');
    if (Date.now() - t0 > 6000) return res('Later at this gate did not go');
    setTimeout(poll, 100);
  })();
})`;
const SB_UNFULL = `(function () { try { if (window.__gmaOrig) { window._gateMovedAway = window.__gmaOrig; window.__gmaOrig = null; } if (window.__gfaOrig) { window._gateFlightsAt = window.__gfaOrig; window.__gfaOrig = null; } try { dedicatedRenderKey = null; window._lastGateKey = null; } catch (e) {} renderDedicatedScreen(); } catch (e) {} })()`;
const SB_UNEIGHT = `(function () { try { if (window.__sbListsOrig) { window._gateSbLists = window.__sbListsOrig; window.__sbListsOrig = null; } } catch (e) {} })()`;
const SB_DOCS = `(function () {
  try {
    var card = document.querySelector('#gateAdCarousel > .gcard-sbcard');
    if (!card) return 'the lists are not in the centre';
    if (document.querySelector('.gad-media-col.gl-on')) return 'the centre panel is not the full panel (Later at this gate is up)';
    var n = card.querySelectorAll('.gc-sbr').length;
    if (n !== 8) return 'the lists hold ' + n + ' names, not 8';
    var d = card.querySelector('.gc-sbfoot .gc-sbfd');
    if (!d) return 'the lists carry no documents line';
    var step = card.getAttribute('data-sb-foot');
    if (!(d.getBoundingClientRect().height > 4) || step === '2' || step === '3') return 'the documents gave way on the full panel with 8 names (foot step ' + step + ', scale ' + (card.style.getPropertyValue('--gc-k') || '1') + ')';
    var l = d.querySelector('.gc-sbfl');
    if (!l || !(l.getBoundingClientRect().height > 4)) return 'the documents line is not drawn';
    if (l.hasAttribute('data-fx-over')) return 'the documents line does not fit at the floor: ' + l.textContent;
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})()`;
// 2026-10-12 — and the lists are fitted in the frame they first paint, while
// the board's fonts are still loading. The boards reload on every deploy, and
// the pass used to wait for the fonts: the lists painted unfitted, rows cut
// off at their edge, for 3.6 s on a typical load and 25 s or more on two of
// 528 (a Japanese or Arabic face lands in many pieces). Here a face is held
// loading (HELD_FACE, answered only after 20 s), the lists are painted afresh,
// and read one frame later: the fonts still loading, the card measured and
// fitted (data-sb-fit), then SB_CHECK. SB_RELEASE lets the face go.
const SB_LOADING = `new Promise(function (res) {
  try {
    var ff = new FontFace('WordsHeldFace', 'url(/__words/held-face.woff2)');
    document.fonts.add(ff);
    ff.load().catch(function () {});
    window.__wordsHeldFace = ff;
    if (document.fonts.status !== 'loading') return res('a face held loading did not hold the fonts loading (' + document.fonts.status + ')');
    var sl = _buildGateAdSlideList(), i = -1;
    for (var k = 0; k < sl.length; k++) if (sl[k] && sl[k].type === 'sbcard') { i = k; break; }
    if (i < 0) return res('the deck has no sbcard');
    var car = document.getElementById('gateAdCarousel');
    car.innerHTML = ''; car.__gcardHtml = null;
    _gateAdIndex = i;
    window._gateAdAuthChange = true; renderGateAd(i); window._gateAdAuthChange = false;
    var card0 = car.querySelector(':scope > .gcard-sbcard');
    if (!card0) return res('the lists did not paint');
    if (card0.hasAttribute('data-sb-fit')) return res('the lists were not painted afresh');
    requestAnimationFrame(function () {
      setTimeout(function () {
        if (document.fonts.status !== 'loading') return res('the fonts finished loading before the frame was read');
        var card = car.querySelector(':scope > .gcard-sbcard');
        if (card !== card0) return res('the lists were painted again before the frame was read');
        if (!card.getAttribute('data-sb-fit')) return res('the lists painted unfitted while the fonts were loading (the frame after their paint)');
        res('ok');
      }, 0);
    });
  } catch (e) { res('error ' + e.message); }
})`;
const SB_RELEASE = `new Promise(function (res) {
  try { if (window.__wordsHeldFace) { document.fonts.delete(window.__wordsHeldFace); window.__wordsHeldFace = null; } } catch (e) {}
  var t0 = Date.now();
  (function poll() { if (document.fonts.status === 'loaded' || Date.now() - t0 > 22000) return res(document.fonts.status); setTimeout(poll, 100); })();
})`;
const SB_UNSHORT = `(function () { try { if (window.__gfaOrig) { window._gateFlightsAt = window.__gfaOrig; window.__gfaOrig = null; } renderDedicatedScreen(); } catch (e) {} })()`;
const GATE_RESET = `(function () { try { if (window.__sbListsOrig) { window._gateSbLists = window.__sbListsOrig; window.__sbListsOrig = null; } if (window.__gmaOrig) { window._gateMovedAway = window.__gmaOrig; window.__gmaOrig = null; } if (window.__gfaOrig) { window._gateFlightsAt = window.__gfaOrig; window.__gfaOrig = null; } var f = window._gateCurrentFlight; if (f && window.__wsOrig) { var o = JSON.parse(window.__wsOrig); Object.keys(o).forEach(function (k) { f[k] = o[k]; }); } setGateHistory({}); renderDedicatedScreen(); } catch (e) {} })()`;

// When the airport's feed is down (v23996, fidsFeedStatus): 'unavailable' —
// no list at all ("Live data unavailable" in the board's empty panel, on the
// empty gate and on the empty belt); 'lastupdate' — the last list had nothing
// here (the same, with "Last update {TIME}"); 'stale' — the board keeps the
// last good list, 40 minutes old, and says so on the strip. Each state is
// reached in other languages (FEED_CONTRAST, none of the set's) and the
// languages are then changed to the set's, mid-visit: a line or a header
// painted once in the old languages fails here.
const FEED_STATES = ['unavailable', 'lastupdate', 'stale'];
const FEED_CONTRAST = [['ja', 'ar'], ['de', 'pt'], ['es', 'it']];
const FEED_ENTER = (st) => `(function (st) {
  try {
    var ap = String((document.getElementById('apSel') || {}).value || '').toUpperCase();
    if (!window.__wsFeedOrig) window.__wsFeedOrig = { dep: data.dep, arr: data.arr, live: LIVE_MODE, done: window._initialFetchDone, status: JSON.stringify(window.__fidsFeedStatus || {}) };
    var o = window.__wsFeedOrig;
    var one = st === 'unavailable' ? { state: 'unavailable', asOf: null } : { state: 'stale', asOf: Date.now() - 40 * 60000 };
    window.__fidsFeedStatus = window.__fidsFeedStatus || {};
    window.__fidsFeedStatus[ap] = { dep: one, arr: one };
    data.dep = st === 'stale' ? o.dep : [];
    data.arr = st === 'stale' ? o.arr : [];
    LIVE_MODE = true;
    window._initialFetchDone = true;
    try { dedicatedRenderKey = null; } catch (e) {}
    render();
    return 'ok';
  } catch (e) { return 'error ' + e.message; }
})(${jsWord(st)})`;
// What says it on this screen: the board's empty panel, the gate's or the
// belt's own empty line, or the strip. With the last good list on screen the
// strip says how old it is — unless this page's own list is empty (a belt
// with no arrivals), where the empty line says it. Waited for (up to 6 s: a
// busy machine paints late), then '' and what the board's status was if
// nothing ever says it.
const FEED_SHOWN = (st) => `new Promise(function (res) { var t0 = Date.now(); (function poll() {
  var st = ${jsWord(st)};
  function vis(el) {
    if (!el) return false;
    var b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1 || b.bottom < 0 || b.top > innerHeight) return false;
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) { var cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; }
    return true;
  }
  var sel = st === 'stale' ? ['#fidsFeedNotice', '#panelEmpty.fids-feed-down .sub', '#gateView .ffn-inview-sub', '#baggageView .ffn-inview-sub']
    : st === 'lastupdate' ? ['#panelEmpty.fids-feed-down .sub', '#gateView .ffn-inview-sub', '#baggageView .ffn-inview-sub', '#fidsFeedNotice']
    : ['#panelEmpty.fids-feed-down', '#gateView .ffn-inview', '#baggageView .ffn-inview', '#fidsFeedNotice'];
  for (var i = 0; i < sel.length; i++) if (vis(document.querySelector(sel[i]))) return res(sel[i]);
  if (Date.now() - t0 < 6000) return setTimeout(poll, 200);
  var ap = String((document.getElementById('apSel') || {}).value || '').toUpperCase();
  try { res('!' + JSON.stringify((window.__fidsFeedStatus || {})[ap] || null) + ' live=' + LIVE_MODE); } catch (e) { res('!'); }
})(); })`;
const FEED_RESET = `(function () {
  try {
    var o = window.__wsFeedOrig;
    if (!o) return 0;
    data.dep = o.dep; data.arr = o.arr; LIVE_MODE = o.live; window._initialFetchDone = o.done;
    window.__fidsFeedStatus = JSON.parse(o.status);
    window.__wsFeedOrig = null;
    try { dedicatedRenderKey = null; } catch (e) {}
    render();
    return 1;
  } catch (e) { return 0; }
})()`;

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
  gate: { url: (port) => `http://127.0.0.1:${port}/gids.html?ap=YQM&mode=${MODE}&gate=4&wxspeed=0.5`, ready: BOARD_UP, setLangs: true, deck: true, cards: true, states: true, feed: true, chunk: 2, alarm: 280, parallel: 2 },
  departures: { url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YQM&mode=${MODE}`, ready: BOARD_UP, setLangs: true, feed: true, chunk: 3, alarm: 240 },
  baggage: { url: (port) => `http://127.0.0.1:${port}/bids.html?ap=YQM&mode=${MODE}`, ready: BOARD_UP, setLangs: true, feed: true, chunk: 3, alarm: 240 },
  // v24013 — the baggage hall board (bids5: welcome band, hall list, Moncton's
  // hall map), switched on for this screen by its URL
  bids5: { url: (port) => `http://127.0.0.1:${port}/bids.html?ap=YQM&mode=${MODE}&bidslook=5`, ready: BOARD_UP, setLangs: true, feed: true, chunk: 3, alarm: 240 },
  // the phone: one language, the one the passenger picked (fids_mobile_lang)
  'phone-gate': { url: (port) => `http://127.0.0.1:${port}/gids.html?ap=YQM&mode=${MODE}&gate=4`, ready: BOARD_UP, phone: true, sets: SINGLES, chunk: 3, alarm: 200 },
  'phone-departures': { url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YQM&mode=${MODE}`, ready: BOARD_UP, phone: true, sets: SINGLES, chunk: 3, alarm: 200 },
  // the Studio player, one language at a time (?lang=), three families
  studio: { url: (port, set, fam) => `http://127.0.0.1:${port}/studio/player.html?ap=YQM&doc=lang-check-${fam}&lang=${set[0]}`,
    seed: (port) => `http://127.0.0.1:${port}/studio/player.html?ap=YQM`, families: ['fids', 'gids', 'bids'], ready: PLAYER_UP, sets: SINGLES, chunk: 2, perSet: true, alarm: 240 },
  // the arrivals board (the departures board's other side)
  arrivals: { url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YQM&mode=${MODE}`, ready: BOARD_UP, setLangs: true, feed: true, prep: `(function () { try { setViewMode('arr'); return 1; } catch (e) { return 0; } })()`,
    sets: [['en', 'fr'], ['fr'], ['de', 'pt'], ['ar', 'ja'], ['es', 'zh'], ['it']], chunk: 3, alarm: 240 },
  // a Québec airport: French leads whenever it is chosen (BoardStrings.FR_FIRST)
  'quebec-departures': { ap: 'YUL', url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YUL&mode=${MODE}`, ready: BOARD_UP, setLangs: true, feed: true,
    sets: [['en', 'fr'], ['fr'], ['de', 'pt'], ['ar', 'ja']], chunk: 2, alarm: 240 },
  'quebec-arrivals': { ap: 'YUL', url: (port) => `http://127.0.0.1:${port}/fids.html?ap=YUL&mode=${MODE}`, ready: BOARD_UP, setLangs: true, feed: true,
    prep: `(function () { try { setViewMode('arr'); return 1; } catch (e) { return 0; } })()`, sets: [['en', 'fr'], ['es', 'zh']], chunk: 2, alarm: 240 },
  'quebec-gate': { ap: 'YUL', url: (port) => `http://127.0.0.1:${port}/gids.html?ap=YUL&mode=${MODE}&gate=72&wxspeed=0.5`, ready: BOARD_UP, setLangs: true, deck: true, states: true, feed: true,
    sets: [['en', 'fr'], ['fr'], ['de', 'pt'], ['ar', 'ja'], ['en']], chunk: 2, alarm: 280, parallel: 2 },
  // the stream's rotation page: the boards it rotates, in its frames
  rotate: { url: (port, set) => `http://127.0.0.1:${port}/rotate.html?ap=YQM&mode=${MODE}&rotate=fids,gids,bids&dwell=9&langs=${set.join(',')}`, ready: SETTLE(15000),
    // one set per browser: three sets in one browser came in at 200-201 s on
    // CI's runners (twice on 2026-10-10, #1024 and #1026), its alarm, and
    // failed a change that never touched the stream page
    sets: [['de'], ['ar', 'ja'], ['fr', 'en']], perSet: true, waits: [0, 9000, 9000], chunk: 1, alarm: 200 },
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
        // 2026-10-12 — while the flight's standby lists are up the deck is
        // the list alone (_buildGateAdSlideList); a review pin that names no
        // scene (?scene=deck) gives the whole deck back, the list in it, so
        // every slide is still read (CARD_RESET takes the pin off again)
        await evalv(`(function () { try { var u = new URL(location.href); u.searchParams.set('scene', 'deck'); history.replaceState(null, '', u.toString()); } catch (e) {} })()`);
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
        await evalv(CARD_RESET);
      }
      // the centre deck's three cards, each through its own ?scene= (v24012)
      if (spec.cards) {
        const win = await evalv(SB_WINDOW);
        if (win !== 'ok') problems.push(`the standby lists' window: ${win}`);
        const prep = await evalv(CARD_PREP);
        if (prep !== 'ok') problems.push(`the centre cards: ${prep}`);
        else {
          for (const t of CARD_SCENES) {
            const r = await evalv(CARD_SCENE(t));
            if (r !== 'ok') { problems.push(`scene ${t}: ${r}`); continue; }
            await evalv(SETTLE(1500));
            problems.push(...await read(set, t));
            const c = await evalv(CARD_CHECK(t));
            if (c !== 'ok') problems.push(`scene ${t}: ${c}`);
            if (t === 'sbcard') {
              const sb = await evalv(SB_CHECK);
              if (sb !== 'ok') problems.push(`scene ${t}: ${sb}`);
              // eight names on the full panel: the documents stay
              const e8 = await evalv(SB_EIGHT);
              const f8 = e8 === 'ok' ? await evalv(SB_FULL) : e8;
              const r8 = f8 === 'ok' ? await evalv(CARD_SCENE(t)) : f8;
              if (r8 !== 'ok') problems.push(`scene ${t} with 8 names: ${r8}`);
              else {
                await evalv(SETTLE(900));
                const dc = await evalv(SB_DOCS);
                if (dc !== 'ok') problems.push(`scene ${t} with 8 names: ${dc}`);
                const sb8 = await evalv(SB_CHECK);
                if (sb8 !== 'ok') problems.push(`scene ${t} with 8 names: ${sb8}`);
                // painted while a face is still loading: fitted in its first frame
                const ld = await evalv(SB_LOADING, 30000);
                if (ld !== 'ok') problems.push(`scene ${t} while the fonts load: ${ld}`);
                else {
                  const sbl = await evalv(SB_CHECK);
                  if (sbl !== 'ok') problems.push(`scene ${t} while the fonts load: ${sbl}`);
                }
                const rel = await evalv(SB_RELEASE, 30000);
                if (rel !== 'loaded') problems.push(`scene ${t}: the held face did not let the fonts finish (${rel})`);
              }
              await evalv(SB_UNEIGHT);
              await evalv(SB_UNFULL);
              await evalv(SETTLE(900));
              const rb = await evalv(CARD_SCENE(t));
              if (rb !== 'ok') problems.push(`scene ${t}: ${rb}`);
              await evalv(SETTLE(600));
              // and with "Later at this gate" up
              const sh = await evalv(SB_SHORT);
              const r2 = sh === 'ok' ? await evalv(CARD_SCENE(t)) : sh;
              if (r2 !== 'ok') { problems.push(`scene ${t} with Later at this gate: ${r2}`); await evalv(SB_UNSHORT); continue; }
              await evalv(SETTLE(1500));
              const up = await evalv(SB_SHORT_UP);
              if (up !== 'ok') problems.push(`scene ${t}: ${up}`);
              problems.push(...await read(set, t + ' (Later at this gate up)'));
              const c2 = await evalv(CARD_CHECK(t));
              if (c2 !== 'ok') problems.push(`scene ${t} with Later at this gate: ${c2}`);
              const sb2 = await evalv(SB_CHECK);
              if (sb2 !== 'ok') problems.push(`scene ${t} with Later at this gate: ${sb2}`);
              await evalv(SB_UNSHORT);
            }
          }
        }
        await evalv(CARD_RESET);
      }
      // the gate's departure, through every state a passenger meets
      if (spec.states) {
        for (const st of GATE_STATES) {
          const r = await evalv(GATE_STATE(st));
          if (r !== 'ok') { problems.push(`state ${st} did not render: ${r}`); continue; }
          await evalv(SETTLE(1200));
          problems.push(...await read(set, st));
          if (BAND_STATES[st]) {
            const b = await evalv(BAND_CHECK(BAND_STATES[st][0], BAND_STATES[st][1]));
            if (b !== 'ok') problems.push(`state ${st}: ${b}`);
            const lc = await evalv(COL_CHECK);
            if (lc !== 'ok') problems.push(`state ${st}: ${lc}`);
          }
          // the column under NOW BOARDING, short, read frame by frame: as the
          // takeover comes up, through a resize, and while a face loads
          if (st === 'boarding') {
            const cs = await evalv(COL_SHORT);
            if (cs !== 'ok') problems.push(`state ${st}, the column made short: ${cs}`);
            else {
              const steps = [
                ['as the takeover comes up', [COL_REC, COL_REPAINT], COL_REC_READ(1000, false)],
                ['through a resize', [COL_REC, COL_RESIZE], COL_REC_READ(700, true)],
                ['while a face is still loading', [COL_HOLD, COL_REC, COL_REPAINT], COL_REC_READ(600, false)]
              ];
              for (const [what, run, readBack] of steps) {
                let r = 'ok';
                for (const x of run) { if (r === 'ok') r = await evalv(x); }
                if (r === 'ok') r = await evalv(readBack, 10000);
                if (r === 'ok' && what === 'while a face is still loading') r = await evalv(COL_LOADED_FIT);
                if (r !== 'ok') problems.push(`state ${st}, the column made short, ${what}: ${r}`);
                else {
                  const c3 = await evalv(COL_CHECK);
                  if (c3 !== 'ok') problems.push(`state ${st}, the column made short, ${what}: ${c3}`);
                }
              }
              const rel = await evalv(SB_RELEASE, 30000);
              if (rel !== 'loaded') problems.push(`state ${st}: the held face did not let the fonts finish (${rel})`);
            }
            await evalv(COL_UNSHORT);
          }
        }
        await evalv(GATE_RESET);
      }
      // the airport's feed down, each state reached in other languages and
      // the languages then changed to this set's, mid-visit (FEED_STATES)
      if (spec.feed) {
        const other = FEED_CONTRAST.find((c) => !c.some((l) => set.includes(l)));
        for (const st of FEED_STATES) {
          await evalv(`setBoardLangs(${langsJs(other)})`);
          const r = await evalv(FEED_ENTER(st));
          if (r !== 'ok') { problems.push(`feed ${st} did not render: ${r}`); continue; }
          await evalv(SETTLE(400));
          await evalv(`setBoardLangs(${langsJs(set)})`);
          await evalv(SETTLE(800));
          const shown = await evalv(FEED_SHOWN(st));
          if (!shown || shown[0] === '!') problems.push(`feed ${st}: nothing on the screen says the live data is unavailable (status ${String(shown || '').slice(1)})`);
          problems.push(...await read(set, 'feed ' + st));
        }
        await evalv(FEED_RESET);
        await evalv(SETTLE(300));
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
        await Promise.all(Array.from({ length: Math.max(1, Number(process.env.WORDS_PARALLEL) || spec.parallel || 1) }, lane));
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
