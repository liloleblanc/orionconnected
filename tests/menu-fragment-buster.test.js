'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23800 — THE CONSOLE'S MARKUP IS BUSTED LIKE EVERYTHING ELSE.
//
// menu.js is loaded from the HTML with ?v=<FIDS_BUILD_TAG>, so a new build
// always gets new script. The fragment it pulls in — menu.html, fetched at
// runtime — carried no version at all.
//
// The two are ONE UNIT: the script reads elements the fragment declares. A
// stale fragment against a fresh script is a console whose newest controls are
// simply absent, with no error to explain it — which is exactly the shape of
// the report that led here ("the Gate field isn't there" for a field that had
// shipped).
//
// no-cache asks for revalidation and the edge sets must-revalidate, so this was
// usually survivable. Usually is not a guarantee.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MENU_JS = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'menu.js'), 'utf8');
const PAGES = ['fids.html', 'gids.html', 'bids.html'];

test('the console fragment is fetched with the build tag', () => {
  assert.match(MENU_JS, /fetch\('menu\.html\?v=' \+ encodeURIComponent\(_mv\)/,
    'menu.html must carry a version, like every other asset on the board');
  assert.match(MENU_JS, /typeof FIDS_BUILD_TAG !== 'undefined'\) \? FIDS_BUILD_TAG/,
    'and it must be the SAME tag the script itself was busted with, or the two ' +
    'halves of the console can still disagree');
  assert.doesNotMatch(MENU_JS, /fetch\('menu\.html',/,
    'the unversioned fetch must be gone, not merely joined by a versioned one');
});

test('the tag exists by the time the fragment is fetched', () => {
  // FIDS_BUILD_TAG is declared in fids-core.js. If menu.js ran first the
  // fallback would be a timestamp, which busts the cache every single load and
  // turns a cached fragment into a fetch on every board, forever.
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, 'fids-current', page), 'utf8');
    const core = html.indexOf('js/fids-core.js?v=');
    const menu = html.indexOf('js/menu.js?v=');
    assert.ok(core > 0 && menu > 0, `${page} must load both scripts`);
    assert.ok(core < menu,
      `${page} loads menu.js before fids-core.js — FIDS_BUILD_TAG would be ` +
      'undefined and every board would re-fetch the fragment on every load');
  }
});

test('the fallback is only a fallback', () => {
  const at = MENU_JS.indexOf('const _mv =');
  const line = MENU_JS.slice(at, MENU_JS.indexOf('\n', at));
  assert.match(line, /Date\.now\(\)/,
    'there must be a fallback — a console that fails to load because a global ' +
    'was missing is worse than one that re-fetches');
  assert.match(line, /FIDS_BUILD_TAG : Date\.now\(\)/,
    'and the tag must be preferred over it');
});
