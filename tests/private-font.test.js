'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24027 — POSSIBILITY IS SERVED FROM PRIVATE STORAGE, ON OUR DOMAIN ONLY.
//
// v24036: now licensed (Commercial Use and Webfont), served as the webfont.
// Possibility-Bold.otf is licensed for one domain, with no passing the file
// on. It sat in the public repository, which anyone could download. It now
// lives in the private R2 bucket fids-private, and the board Worker serves it
// at the path font.css names, only for orionconnected.com and its airport
// addresses. Everywhere else it is a 404, and the stacks fall back to
// Bricolage Grotesque. Phones take the board's own font (they used Possibility).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const WORKER = rd('worker-entry.js');

function lift(src, name) {
  const at = src.indexOf('async function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('no end for ' + name);
}
const NO_STORE = { 'Cache-Control': 'no-store' };
const PRIVATE_FONTS = WORKER.match(/^const PRIVATE_FONTS = (\{[^\n]*\});/m);
const fnSrc = lift(WORKER, 'privateFont');
const DOMAINS = WORKER.match(/^const PRIVATE_FONT_DOMAINS = (\[[^\n]*\]);/m);
const make = new Function('NO_STORE', 'Response', `const PRIVATE_FONTS = ${PRIVATE_FONTS[1]}; const PRIVATE_FONT_DOMAINS = ${DOMAINS[1]}; ${fnSrc}; return privateFont;`);
const serve = make(NO_STORE, Response);
const WEB = '/fonts/Possibility-Bold-Web.woff2';
const bucket = (has) => ({ FIDS_PRIVATE: { get: async (k) => (has && k === 'fonts/Possibility-Bold-Web.woff2') ? { body: 'WOFF2', httpEtag: '"e1"' } : null } });

test('the font files are not in the public repository, and the board loads the webfont', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/fonts/Possibility-Bold.otf')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/fonts/Possibility-Bold-Web.woff2')));
  // v24036 — the licence (Commercial Use and Webfont) covers the WEB font on
  // our site; the desktop file may not be downloadable over the internet
  assert.match(rd('fids-current/css/font.css'), /font-family:'Possibility';[^}]*url\('\.\.\/fonts\/Possibility-Bold-Web\.woff2'\) format\('woff2'\)/, 'font.css names the webfont, served by the Worker');
  assert.doesNotMatch(rd('fids-current/css/font.css'), /Possibility-Bold\.otf/);
  assert.match(rd('wrangler.jsonc'), /"binding": "FIDS_PRIVATE", "bucket_name": "fids-private"/);
});

test('the Worker serves the webfont on our site only: .com, .ca and .app', async () => {
  // one website on three domains = one licence (Matthew Reynolds, in writing, 2026-10-11)
  for (const host of ['fids.orionconnected.com', 'yqm.orionconnected.com', 'orionconnected.com',
                      'yhz.orionconnected.ca', 'orionconnected.ca', 'yul.orionconnected.app', 'orionconnected.app']) {
    const r = await serve(new URL('https://' + host + WEB), bucket(true));
    assert.equal(r.status, 200, host);
    assert.equal(r.headers.get('Content-Type'), 'font/woff2');
  }
  for (const host of ['fids-proxy.example.workers.dev', 'localhost', 'evilorionconnected.com', 'orionconnected.ca.example.com']) {
    const r = await serve(new URL('https://' + host + WEB), bucket(true));
    assert.equal(r.status, 404, host + ' is not our site');
  }
  // a bucket that cannot answer is a 404, never a broken font
  assert.equal((await serve(new URL('https://fids.orionconnected.com' + WEB), bucket(false))).status, 404);
  assert.equal((await serve(new URL('https://fids.orionconnected.com' + WEB), {})).status, 404);
  // the desktop file is not served at all any more, and nothing else is this route's
  assert.equal(await serve(new URL('https://fids.orionconnected.com/fonts/Possibility-Bold.otf'), bucket(true)), null);
  assert.equal(await serve(new URL('https://fids.orionconnected.com/fonts/other.otf'), bucket(true)), null);
  // the route runs before every other Worker path
  const fetchAt = WORKER.indexOf('async fetch(request, env, ctx) {');
  assert.ok(WORKER.indexOf('const font = await privateFont(url, env);', fetchAt) > fetchAt);
});

test('every stack falls back to Bricolage, and phones use the board font', () => {
  const stack = "'Possibility', 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, sans-serif";
  assert.equal(rd('fids-current/js/fids-core.js').split(stack).length - 1, 2);
  assert.equal(rd('fids-current/js/menu.js').split(stack).length - 1, 1);
  assert.match(rd('fids-current/css/font.css'), /--font-possibility:\s+'Possibility', 'Bricolage Grotesque'/);
  assert.doesNotMatch(rd('fids-current/css/mobile-display.css'), /--font-possibility/);
});
