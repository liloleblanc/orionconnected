'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24037 — A CITY PHOTO ON THE EMPTY-GATE SCREEN CARRIES THE CREDIT IT OWES.
//
// The gate's city backdrop comes from, in order: our own AI picture, a fixed
// Unsplash photo (no credit asked), or Openverse, which hands back CC0 and
// CC BY photos. CC BY asks for the photographer and the licence, so a CC BY
// photo now shows "Photo: name · CC BY 4.0" in the board's pair of
// languages, in small white lettering in the photo's own corner. A CC BY
// photo whose photographer Openverse does not name is never picked, and the
// Wikipedia page images (no author or licence to credit) are gone.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BS = require('../fids-current/js/board-strings.js');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');
const STORE = fs.readFileSync(path.join(ROOT, 'fids-current/js/board-strings.js'), 'utf8');

function topFn(header) {
  const at = CORE.indexOf(header);
  assert.ok(at >= 0, header + ' must still exist');
  return CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
}

test('the credit line is in the store in all nine languages, naming the photographer and the licence', () => {
  const m = STORE.match(/photoCredit: \{([^\n]+)\n/);
  assert.ok(m, 'photoCredit must be in board-strings.js');
  for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) {
    const v = m[1].match(new RegExp('\\b' + l + ": '([^']+)'"));
    assert.ok(v, l + ' is missing');
    assert.match(v[1], /\{WHO\} · CC BY \{VER\}$/, l);
  }
});

/** fetchOpenversePhoto run against a made-up Openverse answer. */
function openverse(results) {
  const fake = async () => ({ ok: true, json: async () => ({ results }) });
  const pickFirst = Object.create(Math, { random: { value: () => 0 } });
  return new Function('fetch', 'Math', topFn('async function fetchOpenversePhoto(') + '\nreturn fetchOpenversePhoto;')(fake, pickFirst);
}

test('a CC BY photo is credited with its photographer and licence version; a CC0 photo needs none', async () => {
  const by = await openverse([{ url: 'https://x/a.jpg', width: 1600, license: 'by', license_version: '4.0', creator: 'Jane Doe' }])('Moncton');
  assert.deepEqual(by, { url: 'https://x/a.jpg', credit: { who: 'Jane Doe', ver: '4.0' } });
  const cc0 = await openverse([{ url: 'https://x/b.jpg', width: 1600, license: 'cc0', license_version: '1.0', creator: 'Someone' }])('Moncton');
  assert.deepEqual(cc0, { url: 'https://x/b.jpg', credit: null });
});

test('a CC BY photo with no named photographer is never picked', async () => {
  const fn = openverse([
    { url: 'https://x/nobody.jpg', width: 2000, license: 'by', license_version: '2.0' },
    { url: 'https://x/named.jpg', width: 1200, license: 'by', license_version: '2.0', creator: 'A. Photographer' },
  ]);
  assert.equal((await fn('Halifax')).url, 'https://x/named.jpg');
  const none = openverse([{ url: 'https://x/nobody.jpg', width: 2000, license: 'by', license_version: '2.0' }]);
  assert.equal(await none('Halifax'), null);
});

/** _gateBgCredit on a tiny stand-in for the gate screen. */
function gateScreen() {
  const kids = [];
  const host = {
    querySelector: (sel) => (sel === ':scope > .gate-bg-credit' ? kids.find((k) => k.className === 'gate-bg-credit') || null : null),
    appendChild: (el) => { kids.push(el); el.parentNode = host; return el; },
    removeChild: (el) => { kids.splice(kids.indexOf(el), 1); return el; },
    kids,
  };
  const doc = { createElement: (tag) => ({ tagName: tag.toUpperCase(), className: '', innerHTML: '' }) };
  const credit = new Function('BoardStrings', 'window', 'document', topFn('function _gateBgCredit(') + '\nreturn _gateBgCredit;')(BS, { _gateIata: 'YQM' }, doc);
  return { host, bgDiv: { parentNode: host }, credit };
}

test('the credit is one small line on the gate screen, in the board\'s two languages, and goes when it is not owed', () => {
  const g = gateScreen();
  g.credit(g.bgDiv, { who: 'Jane Doe', ver: '4.0' });
  assert.equal(g.host.kids.length, 1);
  const el = g.host.kids[0];
  assert.equal(el.tagName, 'SMALL');
  assert.equal(el.className, 'gate-bg-credit');
  assert.match(el.innerHTML, /Photo: Jane Doe · CC BY 4\.0/);
  assert.match(el.innerHTML, /Crédit : Jane Doe · CC BY 4\.0/);
  g.credit(g.bgDiv, { who: 'Ann Lee', ver: '2.0' });
  assert.equal(g.host.kids.length, 1, 'one line, replaced, never stacked');
  g.credit(g.bgDiv, null);
  assert.equal(g.host.kids.length, 0);
});

test('a photo layer that is never shown carries no credit (the phone baggage view, the hidden gate layer)', () => {
  const g = gateScreen();
  g.bgDiv.style = { display: 'none' };
  g.credit(g.bgDiv, { who: 'Jane Doe', ver: '4.0' });
  assert.equal(g.host.kids.length, 0);
});

test('the credit is styled in both places a city photo shows', () => {
  for (const host of ['class="gate-screen"', 'id="gateWelcomePanel"']) assert.ok(CORE.includes(host), host + ' must still exist');
  assert.match(CORE, /<div class="gate-screen" style="position:relative;">\s*<div class="gate-bg no-photo" id="gateBgEmpty"/);
  assert.match(CORE, /<div id="gateWelcomePanel" style="[^"]*position:relative;[^"]*">' *\n *\+ '<div id="gateWelcomePhotoBg"/);
});

test('a photographer\'s name is shown as text, never as markup', () => {
  const g = gateScreen();
  g.credit(g.bgDiv, { who: '<img src=x onerror=alert(1)>', ver: '4.0' });
  assert.doesNotMatch(g.host.kids[0].innerHTML, /<img/);
});

test('every step that paints a backdrop says what credit it owes, and a cached photo keeps its credit', () => {
  const fn = topFn('async function setGateBg(');
  const clear = fn.indexOf('_gateBgCredit(bgDiv, null);');
  assert.ok(clear > 0 && clear < fn.indexOf('getCachedBgUrl(locIata)'), 'the old line goes before any new photo is tried');
  assert.match(fn, /if \(ok\) \{ bgDiv\._hasPhoto = true; _gateBgCredit\(bgDiv, BG_PHOTO_CREDIT\[locIata\]\); return; \}/);
  assert.match(fn, /setBgCache\(locIata, aiUrl, null\)/);
  assert.match(fn, /setBgCache\(locIata, unsplashUrl, null\)/);
  assert.match(fn, /setBgCache\(locIata, ov\.url, ov\.credit\);[\s\S]{0,80}_gateBgCredit\(bgDiv, ov\.credit\);/);
  assert.match(CORE, /const _BG_LS_KEY = 'fids_bg_cache_v2';/, 'photos cached before credits existed are not reused');
  assert.doesNotMatch(CORE, /function fetchWikiImage\(|WIKI_IMG_CACHE/, 'Wikipedia page images had no author or licence to credit');
});

test('the credit is white lettering in the corner — no box behind it', () => {
  const at = CSS.indexOf('.gate-screen > .gate-bg-credit,\n#gateWelcomePanel > .gate-bg-credit {');
  assert.ok(at > 0);
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(rule, /color: rgba\(255, 255, 255/);
  assert.match(rule, /right: 12px;[\s\S]*bottom: 8px;/);
  assert.doesNotMatch(rule, /background|border|box-shadow/);
});
