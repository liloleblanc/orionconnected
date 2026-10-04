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
const LIVE = process.env.LIVE === '1' ? 'https://fids.orionconnected.com' : null;
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
const wordsOf = (s) => (String(s).replace(/<[^>]*>/g, ' ').replace(/\{[A-Za-z0-9_]+\}/g, ' ').match(/\p{L}[\p{L}\p{M}'’.-]*/gu) || [])
  .map((w) => w.replace(/[^\p{L}]+$/u, '').toLowerCase()).filter((w) => w.length >= 2);
const VOCAB = Object.fromEntries(LANGS.map((l) => [l, new Set()]));
for (const o of R.textObjects) for (const l of LANGS) if (o.langs[l] != null) for (const w of wordsOf(o.langs[l])) VOCAB[l].add(w);
for (const li of R.listObjects) for (const it of li.items) for (const w of wordsOf(it)) VOCAB[li.lang] && VOCAB[li.lang].add(w);
for (const [k, e] of Object.entries(BS.STR)) for (const l of LANGS) for (const w of wordsOf(e[l] || '')) VOCAB[l].add(w);
// weekday and month names come from Intl in each language
for (const l of LANGS) {
  for (let d = 0; d < 7; d++) for (const st of ['short', 'long']) for (const w of wordsOf(BS.weekday(Date.UTC(2026, 9, 4 + d, 16), l, st, 'UTC'))) VOCAB[l].add(w);
  for (let m = 0; m < 12; m++) for (const st of ['short', 'long']) for (const w of wordsOf(BS.date(Date.UTC(2026, m, 15), l, { month: st }, 'UTC'))) VOCAB[l].add(w);
}
VOCAB.en.add('am'); VOCAB.en.add('pm');
const DATA = new Set(R.dataVocab);
for (const b of Object.keys(policy.BRAND_TERMS)) for (const w of wordsOf(b)) DATA.add(w);
for (const u of policy.UNIT_TERMS) DATA.add(u.toLowerCase());

// ── the server: this checkout's files; data from the live site only if LIVE=1
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const BLOCK = /\/(adsb|fr24)(\/|\b)|\/aircrafts\/|\/flights\/number\//i;
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
    https.get(LIVE + req.url, { headers: { 'User-Agent': 'orion-language-check' } }, (r) => {
      res.writeHead(r.statusCode || 502, { 'Content-Type': r.headers['content-type'] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      r.pipe(res);
    }).on('error', () => { res.writeHead(502); res.end(); });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ── the browser, driven over a pipe (no WebSocket needed on Node 20) ─────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function browser() {
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
  const chrome = spawn('perl', ['-e', 'alarm ' + (+process.env.CHROME_ALARM || 120) + '; exec @ARGV', CHROME, ...args, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
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
const READ = `(function () {
  var vw = innerWidth, vh = innerHeight, out = [], seen = new Set();
  function shown(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    return true;
  }
  function where(el) {
    var p = [];
    for (var e = el; e && e.nodeType === 1 && p.length < 4; e = e.parentElement)
      p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''));
    return p.join(' > ');
  }
  var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
  while ((n = tw.nextNode())) {
    var t = n.nodeValue.replace(/\\s+/g, ' ').trim();
    var el = n.parentElement;
    if (!t || !el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName)) continue;
    if (el.closest('[data-operator]')) continue;
    var b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1 || b.bottom < 0 || b.top > vh || b.right < 0 || b.left > vw || !shown(el)) continue;
    var le = el.closest('[lang]');
    out.push({ t: t.slice(0, 2000), lang: le ? le.getAttribute('lang') : '', own: !!(le && le !== document.documentElement),
      data: !!el.closest('[translate="no"]'), all: !!el.closest('[data-i18n-all]'), feed: !!el.closest('[data-i18n-feed]'),
      dir: getComputedStyle(el).direction, where: where(el) });
  }
  var L = null; try { L = langs.slice(); } catch (e) {}
  return JSON.stringify({ langs: L, texts: out });
})()`;

const RE_AR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const RE_KANA = /[぀-ヿｦ-ﾟ]/;
const RE_HAN = /[㐀-䶿一-鿿豈-﫿]/;

// The findings for one reading of a screen showing the languages `set`.
export function judge(texts, set) {
  const allowed = (w) => DATA.has(w) || set.some((l) => VOCAB[l].has(w));
  const problems = [];
  for (const x of texts) {
    // a 12-hour clock (5:46PM, 6:15 pm, 5:20 p.m.) on a board that does not
    // lead in English: its AM/PM is an English word (a board reads the clock
    // of the language it leads with, BoardStrings.boardClock24)
    const clock12 = /\d{1,2}:\d{2}(?:\s| | )?[AaPp]\.?\s?[Mm]\b\.?/g;
    // (A half marked English may keep English's own clock on a board that
    // leads in another language, as each half of the welcome strip does.)
    const lead = BS.frenchFirst(set.slice(), 'YQM')[0];
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
    const latin = (x.data || x.all || x.feed) ? [] : x.t.replace(clock12, ' ').match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’.-]*/g) || [];
    for (const raw of latin) {
      const w = raw.replace(/[^A-Za-zÀ-ɏ]+$/, '');
      if (w.length < 2) continue;
      if (/^[A-Z0-9]{2,4}$/.test(w)) continue;              // codes: YQM, AC, CYQM, MAX
      if (/\d/.test(raw)) continue;
      if (allowed(w.toLowerCase())) continue;
      problems.push(`'${w}' is not a word of ${set.join('+')}: "${x.t.slice(0, 70)}" (${x.where})`);
    }
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
export const SURFACES = {
  gate: (port) => `http://127.0.0.1:${port}/gids.html?ap=YQM&mode=${LIVE ? 'live' : 'demo'}&gate=4&langs=en,fr&wxspeed=0.5`,
  departures: (port) => `http://127.0.0.1:${port}/fids.html?ap=YQM&mode=${LIVE ? 'live' : 'demo'}&langs=en,fr`,
  baggage: (port) => `http://127.0.0.1:${port}/bids.html?ap=YQM&mode=${LIVE ? 'live' : 'demo'}&langs=en,fr`
};
export const SETS = LANGS.map((l) => [l]).concat([['en', 'fr'], ['fr', 'en'], ['de', 'pt'], ['ar', 'ja'], ['es', 'zh']]);

// One browser for one surface and a few language sets, so no browser lives
// near its alarm; the surfaces run side by side.
async function runChunk(port, name, route, sets) {
  const b = await browser();
  const lines = [];
  let failed = 0;
  try {
    const { targetInfos } = await b.send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page');
    const tid = page ? page.targetId : (await b.send('Target.createTarget', { url: 'about:blank' })).targetId;
    const { sessionId } = await b.send('Target.attachToTarget', { targetId: tid, flatten: true });
    const S = (m, p, ms) => b.send(m, p, sessionId, ms);
    const evalv = async (expression, ms) => { const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms); return r && r.result && r.result.value; };
    await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await S('Emulation.setFocusEmulationEnabled', { enabled: true });
    await S('Page.enable'); await S('Runtime.enable');
    await S('Page.navigate', { url: route(port) });
    // the board is up: its functions exist and it has flights to show
    const up = await evalv(`new Promise(function (res) { var t0 = Date.now(); (function poll() {
      try { if (typeof setBoardLangs === 'function' && data && (data.dep.length || data.arr.length) && Date.now() - t0 > 5000) return res(1); } catch (e) {}
      if (Date.now() - t0 > 60000) return res(0); setTimeout(poll, 500); })(); })`, 70000);
    if (!up) { lines.push(`✖ ${name}: the board never came up`); return { lines, failed: 1 }; }
    for (const set of sets) {
      const label = set.join(',');
      await evalv(`setBoardLangs(${JSON.stringify(set)})`);
      const problems = [];
      // two readings: the gate's panels and the board's paging move on
      for (const wait of [1500, 3000]) {
        await sleep(wait);
        const r = JSON.parse(await evalv(READ));
        if (String(r.langs) !== String(BS.frenchFirst(set.slice(), 'YQM'))) problems.push(`the board shows ${r.langs}, not ${label}`);
        problems.push(...judge(r.texts, set));
      }
      // the gate's centre panel: every slide of its deck in turn — the
      // welcome, the airline ads, the hotel, the map takeover, and the
      // weather card through its three screens (?wxspeed=0.5 runs it at
      // twice its speed: ~18 s for all three)
      if (name === 'gate') {
        const n = await evalv(`(function () { try { return _buildGateAdSlideList().length; } catch (e) { return 0; } })()`);
        for (let i = 0; i < Math.min(n || 0, 10); i++) {
          const type = await evalv(`(function () { try { var sl = _buildGateAdSlideList()[${i}]; _gateAdIndex = ${i}; window._gateAdAuthChange = true; renderGateAd(${i}); window._gateAdAuthChange = false; return (sl && sl.type) || ''; } catch (e) { window._gateAdAuthChange = false; return 'error ' + e.message; } })()`);
          if (/^error/.test(type)) { problems.push(`slide ${i} did not render: ${type}`); continue; }
          for (const wait of (type === 'wxcard' ? (process.env.WX_WAITS ? process.env.WX_WAITS.split(',').map(Number) : [2500, 3000, 1000, 1000, 1000, 1000, 1000]) : [1500])) {
            await sleep(wait);
            // a hotel card is three pages that take turns: each is read
            const pages = await evalv(`document.querySelectorAll('#gateAdCarousel .axr-page').length`);
            for (let pg = 0; pg < Math.max(1, Math.min(pages || 0, 4)); pg++) {
              if (pages) {
                await evalv(`(function () { var ps = document.querySelectorAll('#gateAdCarousel .axr-page'); for (var k = 0; k < ps.length; k++) ps[k].classList.toggle('axr-page-on', k === ${pg}); })()`);
                await sleep(400);
              }
              const r = JSON.parse(await evalv(READ));
              if (process.env.WORDS_DEBUG) lines.push(`    · ${label} slide ${i} ${type}${pages ? ' page ' + pg : ''}: ` + r.texts.filter((x) => /gateAdCarousel|wxc|axr|hcard|bigcraft/.test(x.where)).map((x) => x.t.slice(0, 40)).slice(0, 12).join(' / '));
              problems.push(...judge(r.texts, set).map((p) => `[${type || 'slide'} ${i}${pages ? ' p' + pg : ''}] ` + p));
            }
          }
        }
      }
      if (process.env.WORDS_DEBUG) for (const e of b.errors.splice(0)) if (/ACCOR|TypeError|ReferenceError|RangeError/.test(e)) lines.push(`    ! ${label} ${e.slice(0, 300)}`);
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

async function main() {
  if (!CHROME) { console.log('no Chrome found (set CHROME=)'); process.exit(2); }
  const server = await serve();
  const port = server.address().port;
  const sets = SETS.filter((s) => !onlySet || s.join(',') === onlySet);
  // language sets per browser: the gate sweeps its whole deck for each, so it
  // takes fewer, and no browser comes near its alarm
  const CHUNKS = { gate: 2 };
  let failed = 0;
  try {
    const jobs = [];
    for (const [name, route] of Object.entries(SURFACES)) {
      if (onlySurface && onlySurface !== name) continue;
      const chunks = [];
      const CHUNK = CHUNKS[name] || 5;
      for (let i = 0; i < sets.length; i += CHUNK) chunks.push(sets.slice(i, i + CHUNK));
      // a surface's chunks one after another; the surfaces side by side
      jobs.push((async () => { const out = []; for (const c of chunks) out.push(await runChunk(port, name, route, c)); return out; })());
    }
    for (const res of await Promise.all(jobs)) for (const r of res) { for (const l of r.lines) console.log(l); failed += r.failed; }
  } finally {
    server.close();
  }
  process.exit(failed ? 1 : 0);
}

export { serve, browser, READ };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
