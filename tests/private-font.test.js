'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24027 — POSSIBILITY IS SERVED FROM PRIVATE STORAGE, ON OUR DOMAIN ONLY.
//
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
const make = new Function('NO_STORE', 'Response', `const PRIVATE_FONTS = ${PRIVATE_FONTS[1]}; ${fnSrc}; return privateFont;`);
const serve = make(NO_STORE, Response);
const bucket = (has) => ({ FIDS_PRIVATE: { get: async (k) => (has && k === 'fonts/Possibility-Bold.otf') ? { body: 'OTF', httpEtag: '"e1"' } : null } });

test('the font file is not in the public repository', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/fonts/Possibility-Bold.otf')));
  assert.match(rd('fids-current/css/font.css'), /font-family:'Possibility';[^}]*url\('\.\.\/fonts\/Possibility-Bold\.otf'\)/, 'font.css still names it, served by the Worker');
  assert.match(rd('wrangler.jsonc'), /"binding": "FIDS_PRIVATE", "bucket_name": "fids-private"/);
});

test('the Worker serves it on orionconnected.com addresses only', async () => {
  for (const host of ['fids.orionconnected.com', 'yqm.orionconnected.com', 'orionconnected.com']) {
    const r = await serve(new URL('https://' + host + '/fonts/Possibility-Bold.otf'), bucket(true));
    assert.equal(r.status, 200, host);
    assert.equal(r.headers.get('Content-Type'), 'font/otf');
  }
  for (const host of ['yqm.orionconnected.ca', 'orionconnected.app', 'fids-proxy.example.workers.dev', 'localhost', 'evilorionconnected.com']) {
    const r = await serve(new URL('https://' + host + '/fonts/Possibility-Bold.otf'), bucket(true));
    assert.equal(r.status, 404, host + ' is not the licensed domain');
  }
  // a bucket that cannot answer is a 404, never a broken font
  assert.equal((await serve(new URL('https://fids.orionconnected.com/fonts/Possibility-Bold.otf'), bucket(false))).status, 404);
  assert.equal((await serve(new URL('https://fids.orionconnected.com/fonts/Possibility-Bold.otf'), {})).status, 404);
  // anything else is not this route's
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
