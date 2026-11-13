'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// AN AIRLINE'S LOGO COMES FROM THIS REPOSITORY, OR IT IS NOT DRAWN
//
// An airline on a board prints its name and its own art from this repository,
// or a deliberate monogram. It never prints a file fetched from another host.
//
// What went wrong: for a carrier with no art here, the row, the belt, the gate
// band, the phone-board card, the menu's flight search and the Studio's flight
// list each asked an outside host for a logo (img.wway.io, then pics.avs.io,
// then a Google Flights address), and drew whatever came back, unfiltered. For
// a code that had changed hands the host sent the art of another airline (4Y,
// YP); for others a lockup on a white box. 94 carrier-and-surface pairs seen
// on the boards went that way, and fifteen header themes named a Google
// address outright.
//
// What holds it now:
//   1. THE REAL BUILDERS, FOR EVERY CODE. fids-core.js is loaded whole, as the
//      names test loads it, and every function that hands a surface an airline
//      mark is run for every code the name tables know, every carrier code
//      found in the recordings of tests/fixtures, and every code of two
//      characters there can be. Every address in what they write (src, the
//      second address of an onerror, a CSS url) is a path under /logos/.
//   2. THE MISSING-FILE HANDLERS, run against a stand-in for the image: a file
//      of ours that does not load is asked once more and then gives way to the
//      monogram or the typed name. No handler ever sets an outside address.
//   3. THE SOURCE. No line of code in the board, the app, the menu or the
//      Studio names one of the logo hosts.
// The hotel, map, weather and font hosts are not this rule.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const FC = path.join(ROOT, 'fids-current');
const JS = path.join(FC, 'js');
const FX = path.join(__dirname, 'fixtures');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ── the whole board script in a page of its own (as tests/airline-names-every-row.test.js) ──
function board() {
  const nothing = (name) => new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'toString' || k === 'valueOf') return () => '';
      return nothing(name + '.' + String(k));
    },
    set() { return true; }, apply() { return nothing(name + '()'); }, construct() { return nothing('new ' + name); }, has() { return true; }
  });
  const store = {};
  const ls = { getItem: (k) => (own(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, length: 0, clear() {} };
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, localStorage: ls, sessionStorage: ls, document: nothing('document'),
    navigator: { userAgent: 'node', language: 'en' }, fetch: () => new Promise(() => {}), performance: { now: () => Date.now() },
    location: { search: '?ap=YQM', hostname: 'localhost', href: 'http://localhost/fids.html?ap=YQM', pathname: '/fids.html', origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['host-airport.js', 'board-strings.js', 'feed-router.js', 'fids-core.js', 'airport-coords.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('var __the = function (n) { return eval(n); };', ctx);
  return ctx;
}
const B = board();
const the = (n) => B.__the(n);

// ── the codes ──────────────────────────────────────────────────────────────
const NAMED = [...new Set([...Object.keys(the('AIRLINE_NAME')), ...Object.keys(the('_AIRLINE_NAME_OVERRIDE'))])].sort();
// Every carrier code in the recordings: the prefix of everything shaped like a flight number, and
// every "iata" a recording gives. It takes in more than airlines (a gate, a postcode); the rule
// holds for any code, so more is only more.
const RECORDED = (() => {
  const out = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(json|html|xml|txt)$/i.test(e.name)) continue;
      const text = fs.readFileSync(p, 'latin1');
      for (const m of text.matchAll(/\b([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])\s?[0-9]{1,4}[A-Z]?\b/g)) out.add(m[1]);
      for (const m of text.matchAll(/"iata"\s*:\s*"([A-Z0-9]{2,3})"/g)) out.add(m[1]);
    }
  };
  walk(FX);
  return [...out].sort();
})();
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const EVERY_TWO = ALNUM.flatMap((a) => ALNUM.map((b) => a + b));
const CODES = [...new Set([...NAMED, ...RECORDED, ...EVERY_TWO, '', 'ACEX', 'ZZZZ'])];

// ── every address a piece of markup or a value carries ─────────────────────
function addresses(text) {
  const s = String(text == null ? '' : text), out = [];
  for (const re of [/\bsrc\s*=\s*"([^"]*)"/g, /\bsrc\s*=\s*'([^']*)'/g, /\bhref\s*=\s*"([^"]*)"/g, /\bsrcset\s*=\s*"([^"]*)"/g,
    /\bdata-(?:fb|tile|src)\s*=\s*"([^"]*)"/g, /\.src\s*=\s*'([^']*)'/g, /\.src\s*=\s*&quot;(.*?)&quot;/g, /url\(\s*['"]?([^'")]+)['"]?\s*\)/g]) {
    for (const m of s.matchAll(re)) out.push(m[1]);
  }
  return [...new Set(out)];
}
// One of ours: a path under /logos/ (with a query), or a picture written into the page itself.
const OURS = /^\/logos\/[^\s"'<>]+$|^data:image\//;
const outside = (u) => !OURS.test(u) || /\/\/|^[a-z][a-z0-9+.-]*:(?!image\/)/i.test(u.replace(/^data:image\/[^;,]+[;,].*$/, ''));

test('the address checker knows an outside host when it sees one', () => {
  for (const u of ['https://img.wway.io/pics/root/AC@svg', '//pics.avs.io/400/120/AC.png', 'http://x.test/logos/a.svg', 'logos/a.svg', '/img/a.svg', 'javascript:alert(1)', '/logos//evil.test/a.svg', '']) {
    assert.equal(outside(u), true, u);
  }
  for (const u of ['/logos/airline-tiles/ACA-black.svg', '/logos/airlines/canadian/air-canada-wordmark-light.svg?v=v24154', '/logos/airline-tiles/UA-globe-glossy.png?v=22350', 'data:image/png;base64,iVBORw0KGgo=']) {
    assert.equal(outside(u), false, u);
  }
  assert.deepEqual(addresses('<img src="/a.svg" onerror="this.src=\'/b.svg\'" style="background:url(/c.png)">'), ['/a.svg', '/b.svg', '/c.png']);
});

test('every surface, for every code: no airline mark asks an outside host', () => {
  assert.ok(NAMED.length >= 255, NAMED.length + ' codes in the name tables');
  assert.ok(RECORDED.length >= 150, RECORDED.length + ' codes in the recordings');
  assert.equal(EVERY_TWO.length, 1296);
  // what each surface is handed for a code: markup, or the address itself
  const tiles = the('IATA_TO_TILE_ICAO'), WM = the('IATA_TO_WORDMARK');
  const SURFACES = {
    'the row and the belt (mkLogo)': (c) => [the('mkLogo')(c, 'Some Airline')],
    'the phone-board card (mkCardLogo)': (c) => [the('mkCardLogo')(c, 'Some Airline')],
    'the belt of the hall (_b5Airline, _b5Tag)': (c) => [the('_b5Airline')({ airline: c, _airlineName: 'Some Airline' }), the('_b5Tag')({ airline: c, _airlineName: 'Some Airline', flight: c + '123' })],
    'the gate band (carrierLogoUrl)': (c) => ['src="' + the('carrierLogoUrl')(c) + '"'],
    'the sky watermark (airlineWatermarkUrl)': (c) => ['src="' + the('airlineWatermarkUrl')(c) + '"'],
    'the phone gate header (_mgHeaderLogo)': (c) => [the('_mgHeaderLogo')(c, 'Some Airline', true, '#fff', ''), the('_mgHeaderLogo')(c, 'Some Airline', false, '#111', '')],
    'the Welcome card (_welcomeCardEmblem, _welcomeCardName)': (c) => ['src="' + the('_welcomeCardEmblem')(c).src + '"', 'src="' + the('_welcomeCardName')(c).wordmark + '"'],
    'the boarding strip and the countdown (_gateMarkPick)': (c) => [B._BW_EMBLEM, B._CD_MARK].flatMap((t) => { const p = B._gateMarkPick(t, c); return ['<img src="' + p.src + '"' + B._gateMarkAttrs(p) + '>']; }),
    'the gate orbs (_gateOrbParts, _gateCardOrb)': (c) => ['src="' + (B._gateOrbParts(c).path || '') + '"', B._gateCardOrb(c, '').html, B._gateCardOrb('AC', c).html],
    'the Operated-by caption (operatorLogoUrl, operatorWordmarkUrl, operatorLogoUrlThemed)': (c) => [the('operatorLogoUrl')(c), the('operatorWordmarkUrl')(c), the('operatorLogoUrlThemed')(c, true), the('operatorLogoUrlThemed')(c, false)].map((u) => 'src="' + (u || '') + '"'),
    'the monogram (_monogramTile)': (c) => [the('_monogramTile')(c, 'Some Airline')],
    'the lettering (wordmarkSrc)': (c) => (WM[c] ? ['light', 'dark'].map((v) => 'src="' + the('wordmarkSrc')(WM[c], v) + '"') : []),
    'the row tile': (c) => (tiles[c] ? ['src="/logos/airline-tiles/' + tiles[c] + '.svg"'] : [])
  };
  const wrong = [];
  let asked = 0, drawn = 0;
  for (const [surface, make] of Object.entries(SURFACES)) {
    for (const code of CODES) {
      let made;
      try { made = make(code); } catch (e) { wrong.push(surface + ', ' + code + ': threw ' + e.message); continue; }
      for (const text of made) {
        asked++;
        for (const u of addresses(text)) {
          if (u === '') continue;            // no address at all: the surface types the name
          drawn++;
          if (outside(u)) wrong.push(surface + ', ' + code + ': ' + u);
        }
        // and no outside address hides in the markup under another attribute
        if (/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(String(text))) wrong.push(surface + ', ' + code + ': an address in ' + String(text).slice(0, 160));
      }
    }
  }
  assert.deepEqual(wrong.slice(0, 40), [], wrong.length + ' marks ask an outside host');
  assert.ok(asked > 20000 && drawn > 5000, asked + ' answers read, ' + drawn + ' addresses in them');
  // the count the audit asked for: carriers that still reach an outside host, on any surface
  assert.equal(new Set(wrong.map((w) => w.split(', ')[1].split(':')[0])).size, 0);
});

test('a carrier with no art here is a monogram on the row and a typed name on the band and the card', () => {
  for (const code of ['IV', 'ZG', 'SM', '4T', 'FC', 'M6', 'KP', 'HF', 'IZ', 'QN', 'FP', 'OD', 'HO', '3U', 'A1', 'ZZ']) {
    assert.match(the('mkLogo')(code, 'Some Airline'), /^<div class="full-logo logo-monogram" data-code="[A-Z0-9]{2}" style="background:[^"]+;">[A-Z0-9]{2}<\/div>$/, code);
    assert.equal(the('carrierLogoUrl')(code), '', code + ': the band is handed no address, and types the name');
    assert.match(the('mkCardLogo')(code, 'Some Airline'), /^<span class="card-logo-fb">[^<]+<\/span>$/, code);
  }
  // a name from a feed is written as text, never as markup
  assert.equal(the('mkCardLogo')('ZZ', '<b>x</b>'), '<span class="card-logo-fb">&lt;b&gt;x&lt;/b&gt;</span>');
  // the band types the name at once when it is handed no address
  const core = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
  assert.match(core, /if \(_g8LogoCache\[airlineCode\] === 'text' \|\| !r1LogoSrc\) \{/);
  assert.doesNotMatch(core, /data-fb=/);
  // a carrier with a file of ours still gets it
  assert.equal(the('carrierLogoUrl')('AC'), the('LOCAL_LOGOS').AC);
  assert.match(the('mkLogo')('WG', 'Sunwing'), /data-logo-set="wordmark"[^>]* src="\/logos\/airlines\/canadian\/sunwing\/Sunwing-Logo-Colour\.png"/);
});

// ── the handlers of a file that does not load ──────────────────────────────
function image(attrs) {
  const a = Object.assign({}, attrs), set = [];
  const img = {
    dataset: {}, style: { removeProperty() {} }, alt: a.alt || '', parentNode: { replaceChild(n) { img.replacedBy = n; } },
    getAttribute: (k) => (k === 'src' ? img._src : own(a, k) ? a[k] : null), setAttribute: (k, v) => { a[k] = v; }, removeAttribute: (k) => { delete a[k]; },
    get src() { return img._src; }, set src(v) { img._src = String(v); set.push(String(v)); },
    set outerHTML(v) { img.became = String(v); }, _src: a.src || '', set
  };
  if (a['data-code']) img.dataset.code = a['data-code'];
  return img;
}

test('a file of ours that does not load: asked once more, then the monogram or the typed name, never another host', () => {
  // the row, the belt, the phone list
  for (const [code, src] of [['AC', '/logos/airline-tiles/ACA-black.svg'], ['WG', '/logos/airlines/canadian/sunwing/Sunwing-Logo-Colour.png'], ['ZZ', '/logos/airline-tiles/NOPE.svg']]) {
    const img = image({ src, 'data-code': code, alt: 'Some Airline' });
    the('logoFallback')(img);
    assert.equal(img.set.length, 1, code + ': one more try');
    assert.match(img.set[0], new RegExp('^' + src.replace(/[.\/-]/g, '\\$&') + '\\?r=\\d+$'), code + ': the same file, past the cache');
    assert.equal(img.became, undefined);
    the('logoFallback')(img);
    assert.equal(img.set.length, 1, code + ': no third address');
    assert.match(img.became, /^<div class="full-logo logo-monogram"/, code + ': the monogram');
    // and the row goes straight to the monogram after that
    assert.match(the('mkLogo')(code, 'Some Airline'), /^<div class="full-logo logo-monogram"/, code);
  }
  // the gate band, alone and beside an emblem
  for (const pair of ['', '1']) {
    const img = image({ src: '/logos/airlines/canadian/air-canada-wordmark-dark.svg?v=x', 'data-code': 'Q9', 'data-name': 'Some Airline', 'data-pairmode': pair });
    the('g8LogoFail')(img);
    assert.deepEqual(img.set.map((u) => u.replace(/\d+$/, 'N')), ['/logos/airlines/canadian/air-canada-wordmark-dark.svg?r=N']);
    the('g8LogoFail')(img);
    assert.equal(img.set.length, 1, 'no second address');
    assert.ok(img.replacedBy, 'the name, typed');
  }
  // the boarding strip and the countdown: the row tile, then nothing
  const hidden = image({ src: '/logos/symbols/airlines/ZZ.svg', 'data-guess': '1' });
  B._gateMarkMiss(hidden);
  assert.deepEqual([hidden.set, hidden.style.display], [[], 'none']);
  const fell = image({ src: '/logos/symbols/airlines/B6.svg', 'data-guess': '1', 'data-tile': '/logos/airline-tiles/JBU.svg' });
  B._gateMarkMiss(fell);
  assert.deepEqual(fell.set, ['/logos/airline-tiles/JBU.svg']);
  B._gateMarkMiss(fell);
  assert.deepEqual([fell.set.length, fell.style.display], [1, 'none'], 'the tile itself missing: hidden, no third address');
  // every handler the markup names is one of these, or hides the image
  for (const fn of ['logoFallback', 'g8LogoFail']) {
    const body = String(the(fn));
    assert.doesNotMatch(body, /https?:|\/\/[a-z]/i, fn + ' names no host');
    assert.doesNotMatch(body, /wwayUrl|data-fb|gstatic|avs\.io/, fn);
  }
  assert.equal(B.wwayUrl, undefined, 'the function that built the outside address is gone');
});

test('no line of code names a host that serves airline logos', () => {
  const HOSTS = /img\.wway\.io|wway\.io\/pics|pics\.avs\.io|avs\.io\/|gstatic\.com\/flights|airline_logos|logo\.clearbit\.com|content\.airhex\.com|images\.kiwi\.com\/airlines|daisycon\.io\/images\/airline/i;
  const files = ['js/fids-core.js', 'js/shared-names.js', 'js/template-renderer.js', 'js/designer.js', 'js/menu.js', 'js/boarding-sequence.js', 'js/feed-router.js',
    'app.html', 'fids.html', 'gids.html', 'bids.html', 'screen.html', 'rotate.html', 'menu.html', 'designer.html', 'data/airline-colors.js'];
  const found = [];
  for (const rel of files) {
    const file = path.join(FC, rel);
    if (!fs.existsSync(file)) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      // a line that is a comment may tell the history; a line of code may not name the host
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return;
      if (HOSTS.test(line)) found.push(rel + ':' + (i + 1) + ': ' + t.slice(0, 120));
    });
  }
  assert.deepEqual(found, []);
  // the header themes name tiles of ours (they named fifteen Google addresses)
  const THEME_LOGOS = the('THEME_LOGOS');
  assert.ok(Object.keys(THEME_LOGOS).length >= 16);
  for (const [name, u] of Object.entries(THEME_LOGOS)) {
    assert.equal(outside(u), false, name + ': ' + String(u).slice(0, 60));
    if (!/^data:/.test(u)) assert.ok(fs.existsSync(path.join(FC, u)), name + ': ' + u);
  }
  // the app's copies are paths of ours
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: win });
  const shared = [...Object.values(win.FIDS_SHARED_TILE), ...Object.values(win.FIDS_SHARED_EMBLEM), ...Object.values(win.FIDS_SHARED_WORDMARK).flat()];
  assert.ok(shared.length > 380, shared.length + ' addresses in the app copies');
  for (const u of shared) assert.equal(outside(u), false, u);
  // the Studio's two resolvers end on no address
  for (const rel of ['js/template-renderer.js', 'js/designer.js']) {
    assert.match(fs.readFileSync(path.join(FC, rel), 'utf8'), /if \(typeof carrierLogoUrl === 'function'\) return carrierLogoUrl\(code\); \} catch \(e\) \{\}\n\s*return '';/, rel);
  }
});
