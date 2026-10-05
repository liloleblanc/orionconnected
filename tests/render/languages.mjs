#!/usr/bin/env node
// ━━ THE LANGUAGE PICTURES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Serves this checkout's fids-current/ on localhost, opens the gate, the
// departures board and the baggage board in headless Chrome with the
// languages that stress a screen most, and for each one:
//   - writes a picture to tests/render/out/<surface>-<langs>.jpg,
//   - lists text that is clipped by its box or runs off the screen
//     (German and Portuguese run longest),
//   - checks that every Arabic half reads right to left,
//   - checks that Japanese, Chinese and Arabic text is set in a stack that
//     carries the board's script fonts (var(--fids-script-fonts)), so a host
//     with no fonts of its own still draws it,
//   - checks that an operator's mark is never smaller than the words beside
//     it (at least 1.2 times their size: the Rouge mark shrank to 22x12 px
//     beside 12.5 px German and Portuguese labels).
// Exit code 1 if anything fails. The pictures go in the pull request.
//
//   node tests/render/languages.mjs                 every surface, every set
//   node tests/render/languages.mjs gate de,pt      one surface, one set
//
// Flight data comes from the live site, read-only. Routes that spend FR24
// credits (/adsb, /fr24) and the banned AeroDataBox passthroughs are blocked
// here, so taking pictures costs nothing. CHROME=/path overrides the browser.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', 'fids-current');
const OUT = path.join(HERE, 'out');
// The live site: the only host a request for data is ever sent to.
const LIVE_ORIGIN = 'https://fids.orionconnected.com';
const PORT = 8400 + Math.floor(Math.random() * 90);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1680, H = 1050;

// French alone and French first too: 'Embarquement' was cut to
// 'Embarqueme…' in the departures board's status column on a French-only
// board and at Montréal (fr,en), and no picture ever put French first.
// English alone and English first too: the English 12-hour times ('12:07 PM')
// and WestJet's flight numbers were cut on the departures board in every
// language, and no picture ever led with English, so nothing reported it.
const SETS = [['de', 'pt'], ['pt', 'de'], ['ar', 'ja'], ['ja', 'ar'], ['es', 'zh'], ['zh', 'es'], ['fr'], ['fr', 'en'], ['en'], ['en', 'fr']];
const SURFACES = {
  gate: (l) => `/gids.html?ap=YQM&mode=live&gate=4&langs=${l}`,
  departures: (l) => `/fids.html?ap=YQM&mode=live&langs=${l}`,
  baggage: (l) => `/bids.html?ap=YQM&mode=live&langs=${l}`
};
const [onlySurface, onlySet] = process.argv.slice(2);

const BLOCK = /\/(adsb|fr24)(\/|\b)|\/aircrafts\/|\/flights\/number\//i;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

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

// ── the server: this checkout's files, the live site's data ──────────────
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
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const live = liveUrl(req.url);
  if (!live) { res.writeHead(400); return res.end(); }
  https.get(live, { headers: { 'User-Agent': 'orion-language-pictures' } }, (r) => {
    res.writeHead(r.statusCode || 502, { 'Content-Type': r.headers['content-type'] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    r.pipe(res);
  }).on('error', () => { res.writeHead(502); res.end(); });
});

// ── what is checked inside the page ───────────────────────────────────────
const CHECK = `(async function () {
  try { await document.fonts.ready; } catch (e) {}
  var vw = innerWidth, vh = innerHeight, clipped = [], seen = new Set();
  function shown(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    return true;
  }
  var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
  var script = 0, scriptBare = [];
  while ((n = tw.nextNode())) {
    var t = n.nodeValue.replace(/\\s+/g, ' ').trim();
    var el = n.parentElement;
    if (!t || !el || /^(SCRIPT|STYLE|OPTION)$/.test(el.tagName)) continue;
    var b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1 || b.bottom < 0 || b.top > vh || !shown(el)) continue;
    // a scrolling ticker runs off the screen by design
    if (el.closest('.ticker, [class*="ticker"], marquee')) continue;
    if (/[\\u3040-\\u30ff\\u4e00-\\u9fff\\u0600-\\u06ff]/.test(t)) {
      script++;
      if (!/fids-script-fonts|Noto Sans (JP|SC|Arabic)/.test(getComputedStyle(el).fontFamily)) scriptBare.push(t.slice(0, 40) + ' :: ' + getComputedStyle(el).fontFamily.slice(0, 60));
    }
    if (seen.has(el) || !/\\p{L}/u.test(t)) continue;
    seen.add(el);
    // the words themselves, against every box that clips them: a container
    // that is wider than the screen for some other reason is not clipped text
    var r = document.createRange(); r.selectNodeContents(n); var tb = r.getBoundingClientRect();
    for (var e = el, k = 0; e && e !== document.body && k < 6; e = e.parentElement, k++) {
      var cs = getComputedStyle(e);
      // any overflow at all under an ellipsis draws the '…' (a 2px overflow cut 'WS3340' to 'WS33…')
      if (k === 0 && cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth) { clipped.push(t.slice(0, 60) + ' [ellipsis]'); break; }
      if (/hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflow)) {
        var eb = e.getBoundingClientRect();
        if (tb.right > eb.right + 1 || tb.left < eb.left - 1) { clipped.push(t.slice(0, 60) + ' [cut at ' + Math.round(tb.right > eb.right + 1 ? eb.right : eb.left) + 'px]'); break; }
      }
    }
    if (tb.right > vw + 1 || tb.left < -1) clipped.push(t.slice(0, 60) + ' [off screen]');
  }
  // every Arabic word on screen, not only the elements already marked
  // lang="ar": its element must read right to left, and Chinese must sit
  // under lang="zh" so it takes the simplified-Chinese glyphs
  var notRtl = [], zhNotZh = [];
  var tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n2;
  var Lset = null; try { Lset = langs.slice(); } catch (e) {}
  while ((n2 = tw2.nextNode())) {
    var t2 = n2.nodeValue.trim(), el2 = n2.parentElement;
    if (!t2 || !el2 || /^(SCRIPT|STYLE)$/.test(el2.tagName) || el2.closest('[data-operator]')) continue;
    var b2 = el2.getBoundingClientRect();
    if (b2.width < 1 || b2.height < 1 || !shown(el2)) continue;
    if (/[\u0600-\u06ff]/.test(t2) && getComputedStyle(el2).direction !== 'rtl') notRtl.push(t2.slice(0, 40));
    if (Lset && Lset.indexOf('zh') >= 0 && Lset.indexOf('ja') < 0 && /[\u4e00-\u9fff]/.test(t2)) {
      var lz = el2.closest('[lang]');
      if (!lz || !/^zh/.test(lz.getAttribute('lang'))) zhNotZh.push(t2.slice(0, 40));
    }
  }
  // an operator's mark is never smaller than the words beside it
  var logos = [];
  document.querySelectorAll('img.v2-rc-opby-logo').forEach(function (im) {
    var lb = im.getBoundingClientRect();
    if (lb.width < 1 || lb.height < 1 || !shown(im)) return;
    var box = im.closest('.v2-rc-acb-opby, .v2-rc-opby, .v2-rc-acb-cap');
    var lab = box && box.querySelector('.v2-rc-opby-lline');
    if (!lab) return;
    var fs = parseFloat(getComputedStyle(lab).fontSize) || 0;
    if (fs && lb.height < fs * 1.2) logos.push((im.getAttribute('alt') || 'a mark') + ' ' + Math.round(lb.width) + 'x' + Math.round(lb.height) + 'px beside ' + fs.toFixed(1) + 'px words');
  });
  var fonts = {};
  document.fonts.forEach(function (f) { if (/Noto Sans (JP|SC|Arabic)/.test(f.family) && f.status === 'loaded') fonts[f.family.replace(/["']/g, '')] = 1; });
  var L = null; try { L = langs.slice(); } catch (e) {}
  return JSON.stringify({ langs: L, clipped: clipped, notRtl: notRtl, zhNotZh: zhNotZh, script: script, scriptBare: scriptBare, fontsLoaded: Object.keys(fonts), logos: logos });
})()`;

// ── the browser ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shoot(url, out) {
  const port = String(9300 + Math.floor(Math.random() * 600));
  // PROFILE_DIR: where the throwaway profile goes (default: beside the pictures)
  const prof = fs.mkdtempSync(process.env.PROFILE_DIR ? path.join(process.env.PROFILE_DIR, 'prof-pics-') : path.join(OUT, '.prof-'));
  // perl's alarm puts a hard ceiling on the browser even if this
  // script dies before it can kill it
  const chrome = spawn('perl', ['-e', 'alarm 120; exec @ARGV', CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${prof}`,
    `--window-size=${W},${H}`, `--remote-debugging-port=${port}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  const kill = setTimeout(() => { try { chrome.kill('SIGKILL'); } catch (e) {} }, 115000);
  try {
    let ws = null;
    for (let i = 0; i < 60 && !ws; i++) {
      await sleep(500);
      try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) {}
    }
    if (!ws) throw new Error('Chrome did not start (set CHROME=)');
    const sock = new WebSocket(ws);
    await new Promise((r) => sock.addEventListener('open', r, { once: true }));
    let id = 0; const pend = new Map();
    sock.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id).ok(m); pend.delete(m.id); } });
    // a browser that dies or stalls fails the picture; it never hangs the run
    sock.addEventListener('close', () => { for (const p of pend.values()) p.no(new Error('the browser went away')); pend.clear(); });
    const send = (method, params = {}, ms = 60000) => new Promise((ok, no) => {
      const i = ++id;
      const t = setTimeout(() => { pend.delete(i); no(new Error(method + ' timed out')); }, ms);
      pend.set(i, { ok: (m) => { clearTimeout(t); ok(m); }, no: (e) => { clearTimeout(t); no(e); } });
      sock.send(JSON.stringify({ id: i, method, params }));
    });
    const evalv = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result && r.result.result && r.result.result.value; };
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url });
    await sleep(24000);
    // the board pages its languages: wait for the first one to be on screen
    await evalv(`new Promise(function (res) { var t0 = Date.now(); (function poll() { try { if (lang === langs[0] && Date.now() - t0 > 200) return res(1); } catch (e) {} if (Date.now() - t0 > 40000) return res(0); setTimeout(poll, 250); })(); })`);
    await sleep(1800);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    const res = JSON.parse(await evalv(CHECK));
    sock.close();
    return res;
  } finally {
    clearTimeout(kill);
    try { chrome.kill('SIGKILL'); } catch (e) {}
    await sleep(300);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  }
}

fs.mkdirSync(OUT, { recursive: true });
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
let failed = 0;
try {
  for (const [name, route] of Object.entries(SURFACES)) {
    if (onlySurface && onlySurface !== name) continue;
    for (const set of SETS) {
      const l = set.join(',');
      if (onlySet && onlySet !== l) continue;
      const out = path.join(OUT, `${name}-${set.join('-')}.jpg`);
      let r;
      try { r = await shoot(`http://127.0.0.1:${PORT}${route(l)}`, out); }
      catch (e) { console.log(`✖ ${name} ${l}: ${e.message}`); failed++; continue; }
      const problems = [];
      if (String(r.langs) !== String(set)) problems.push(`the board shows ${r.langs}, not ${l}`);
      for (const c of r.clipped) problems.push('clipped: ' + c);
      for (const a of r.notRtl) problems.push('Arabic not right to left: ' + a);
      for (const z of r.zhNotZh) problems.push('Chinese not marked lang="zh" (drawn with Japanese glyph forms): ' + z);
      for (const s of r.scriptBare) problems.push('no script font in the stack: ' + s);
      for (const g of (r.logos || [])) problems.push('a mark smaller than the words beside it: ' + g);
      const need = set.map((x) => ({ ja: 'Noto Sans JP', zh: 'Noto Sans SC', ar: 'Noto Sans Arabic' })[x]).filter(Boolean);
      for (const f of need) if (r.script && !r.fontsLoaded.includes(f)) problems.push(f + ' never loaded');
      console.log(`${problems.length ? '✖' : '✔'} ${name} ${l} → ${path.relative(process.cwd(), out)}`);
      for (const p of problems) console.log('    ' + p);
      if (problems.length) failed++;
    }
  }
} finally {
  server.close();
}
process.exit(failed ? 1 : 0);
