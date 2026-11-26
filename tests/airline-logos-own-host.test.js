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
//   4. THE BUILDERS OF THE PHONE APP, cut from app.html and run for the same
//      codes: its tile, its lettering by day and by night, the brand of its
//      flight page. The gate band is built inside the builder of the whole
//      gate and cannot be run alone, so:
//   5. EVERY LINE OF CODE, in all of those files, names no host at all,
//      absolute or protocol-relative, but for the list of the hosts the code
//      uses, each with what it serves (the feeds, the map tiles, the fonts,
//      the hotel pages, the videos, the photographs of cities), none of them
//      an airline logo; and no line builds an address by joining a scheme to
//      a value. A list of the logo hosts known today (3) says nothing of the
//      host somebody reaches for tomorrow, and a line that only builds an
//      image is no fence: a host named on a line of its own, then joined into
//      the address of the gate band, passed it.
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
// a string read as itself inside a pattern: every character a pattern gives a meaning to, backslash included
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    'the mark of every belt slot (_beltLogo)': (c) => [the('_beltLogo')(c, 'Some Airline')],
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
    assert.match(img.set[0], new RegExp('^' + reEsc(src) + '\\?r=\\d+$'), code + ': the same file, past the cache');
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

// ── the builders of the phone app ──────────────────────────────────────────
// app.html holds its own builders of an airline mark: the tile of a card (tileHtml), the lettering
// by day and by night (wmHtml), and the brand of the flight page (heroBrand, on a light bar and on
// a dark one). They are one stretch of the page, from its escape function to the end of heroBrand,
// and run here as they stand, over the tables the app loads (js/shared-names.js and
// data/airline-colors.js).
function app() {
  const page = fs.readFileSync(path.join(FC, 'app.html'), 'utf8');
  const from = page.indexOf('function esc(s){'), to = page.indexOf('// Normalise an aircraft code/model to the livery file code');
  assert.ok(from > 0 && to > from, 'the stretch of app.html that builds an airline mark');
  const ctx = {};
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/shared-names.js', 'data/airline-colors.js']) vm.runInContext(fs.readFileSync(path.join(FC, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(page.slice(from, to) + '\n;globalThis.__app = { tileHtml: tileHtml, wmHtml: wmHtml, heroBrand: heroBrand, wmUrls: wmUrls, tileOf: tileOf };', ctx, { filename: 'app.html' });
  return ctx.__app;
}

test('the phone app, for every code: its tile, its lettering and the brand of its flight page ask no outside host', () => {
  const A = app();
  const SURFACES = {
    'the tile of a card (tileHtml)': (c) => [A.tileHtml(c)],
    'the lettering (wmHtml)': (c) => [A.wmHtml(c, 'Some Airline'), A.wmHtml(c, c)],
    'the brand of the flight page (heroBrand)': (c) => [A.heroBrand(c, 'Some Airline', true), A.heroBrand(c, 'Some Airline', false)],
    'the pair of lettering files (wmUrls)': (c) => (A.wmUrls(c) || []).map((u) => 'src="' + u + '"')
  };
  const wrong = [];
  let asked = 0, drawn = 0, tiles = 0, lettered = 0;
  for (const [surface, make] of Object.entries(SURFACES)) {
    for (const code of CODES) {
      let made;
      try { made = make(code); } catch (e) { wrong.push(surface + ', ' + code + ': threw ' + e.message); continue; }
      for (const text of made) {
        asked++;
        for (const u of addresses(text)) {
          if (u === '') continue;
          drawn++;
          if (outside(u)) wrong.push(surface + ', ' + code + ': ' + u);
        }
        if (/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(String(text))) wrong.push(surface + ', ' + code + ': an address in ' + String(text).slice(0, 160));
      }
    }
  }
  assert.deepEqual(wrong.slice(0, 40), [], wrong.length + ' marks of the app ask an outside host');
  assert.ok(asked > 7000 && drawn > 1200, asked + ' answers read, ' + drawn + ' addresses in them');
  // it was run for real: a tile where the board has one, lettering where it has that, and for a
  // code with neither a square of its letters and no address at all
  for (const code of NAMED) { if (/<img class="tile /.test(A.tileHtml(code))) tiles++; if (A.wmUrls(code)) lettered++; }
  assert.ok(tiles >= 150 && lettered >= 100, tiles + ' tiles and ' + lettered + ' letterings among the named codes');
  assert.match(A.tileHtml('AC'), /^<img class="tile tile" src="\/logos\/airline-tiles\/ACA-black\.svg"/);
  assert.match(A.tileHtml('ZZ'), /^<span class="tile mono" style="background:[^"]+">ZZ<\/span>$/);
  assert.deepEqual(addresses(A.tileHtml('ZZ') + A.wmHtml('ZZ', 'Some Airline')), []);
  assert.match(A.wmHtml('WS', 'WestJet'), /mask-image:url\('\/logos\/airlines\/canadian\/westjet-wordmark-dark\.svg'\)/);
  // and the checker reads the address inside a mask, which is how the app draws lettering by day
  assert.deepEqual(addresses('<span style="-webkit-mask-image:url(\'//x.test/a.svg\');mask-image:url(\'/logos/a.svg\')"></span>').map(outside), [true, false]);
});

// ── every line of code ─────────────────────────────────────────────────────
// The hosts a line of code may name, what each serves, and the paths on it the code names. None
// serves an airline logo. A host that is not here fails the test, whatever it is and whatever the
// line does: the gate band is built inside the builder of the gate, which cannot be run alone, and a
// list of the logo hosts known today would pass any other host. A host named on a line that builds no
// image, then joined into an image address on the next, is a host named on a line of code like any
// other.
// A HOST IS LET IN AT THE PATHS THE CODE USES, NOT WHOLE. Three of these hosts serve any file anybody
// puts there (a repository on GitHub, a package on npm, a library on cdnjs): allowed anywhere on any
// line, a new line naming a repository of airline logos on one of them passed, and was joined into the
// address of the gate band. Each host is listed with the beginnings of the paths the code names on it
// ('/' for any path, '' for the bare host), and the two hosts of script libraries only on a line that
// loads a script (a <script src=).
// (the worker of the boards is read from the one line that names its base, FIDS_API_BASE)
const OWN_WORKER = (/^const FIDS_API_BASE = 'https:\/\/([a-z0-9.-]+)';$/m.exec(fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8')) || [])[1] || '';
const NOT_LOGO_HOSTS = {
  // our own
  [OWN_WORKER]: { why: 'the worker of the boards: the flight feeds, the lookups of an aircraft and an operator, the sign-in of the menu', at: ['/'] },
  'media.orionconnected.com': { why: 'an example typed as the hint of the media address field in the menu', at: [''] },
  // feeds the boards read themselves
  'tampaairportwebprod.prod.acquia-sites.com': { why: 'the flight feed of Tampa', at: ['/api/flight-status?'] },
  'raw.githubusercontent.com': { why: 'the open list of airports (their places), when the board has none: that one file of that one repository', at: ['/mwgg/Airports/master/airports.json'] },
  // fonts and script libraries
  'fonts.googleapis.com': { why: 'the fonts of the boards', at: ['', '/css2?'] },
  'fonts.gstatic.com': { why: 'the font files those fonts load', at: [''] },
  'cdnjs.cloudflare.com': { why: 'two script libraries: the QR code of the boards, the map of the Studio', at: ['/ajax/libs/qrcodejs/', '/ajax/libs/leaflet/'], script: true },
  'unpkg.com': { why: 'a script library (the arcs of the map in the Studio)', at: ['/leaflet-arc/'], script: true },
  // photographs of cities, behind a card
  'images.unsplash.com': { why: 'photographs of cities behind the weather and hotel cards, by the id of the photograph', at: ['/'] },
  'api.openverse.org': { why: 'the search for a photograph of a city under an open licence', at: ['/v1/images/?'] },
  // hotels
  'all.accor.com': { why: 'the page of a hotel, the link of its card (a page, never an image)', at: ['/hotel/'] },
  // videos
  'img.youtube.com': { why: 'the still of a video, in the list of the menu', at: ['/vi/'] },
  'www.youtube.com': { why: 'the video player', at: ['/iframe_api', '/oembed?', '/watch?v=', '/embed/'] },
  'www.youtube-nocookie.com': { why: 'the video player, without its cookies', at: [''] },
  'youtube.com': { why: 'an example typed as the hint of a field in the menu', at: ['/watch?v=', '/playlist?list='] },
  // the rest
  'example.com': { why: 'an example typed as the hint of the address field of a background', at: ['/image.jpg'] },
  'www.w3.org': { why: 'the name space of an inline drawing (svg), not an address that is fetched', at: ['/2000/svg', '/1999/xlink'] }
};
// the hosts that serve any file of anybody: never let in whole
const ANY_FILE_HOSTS = ['raw.githubusercontent.com', 'cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net', 'gist.githubusercontent.com'];
// A LINE THAT LOADS A SCRIPT FROM THE HOST: a script tag on it (to the first > after <script) with a
// src that opens on https:// and then the host and a slash, exactly as typed. The host is compared as
// a string where the address begins, never set into a pattern, so a dot in it is a dot and nothing else.
// The tags are found by a plain search of the line (any case), not by a pattern.
const SCRIPT_SRC = /\bsrc\s*=\s*["']https:\/\//g;
function loadsScriptFrom(host, line) {
  const low = line.toLowerCase();
  for (let at = low.indexOf('<script'); at >= 0; at = low.indexOf('<script', at + 7)) {
    if (/\w/.test(low.charAt(at + 7))) continue;   // <scripts, <scripted: not a script tag
    const end = line.indexOf('>', at);
    const tag = line.slice(at, end < 0 ? line.length : end);
    for (const src of tag.matchAll(SCRIPT_SRC)) if (tag.startsWith(host + '/', src.index + src[0].length)) return true;
  }
  return false;
}
// Is a host and a path, named on this line, one the list lets in? The prefix it is let in under, or ''.
// THE PATH AS THE SERVER READS IT. A prefix was matched on the path as typed, so dot segments walked
// out of it: raw.githubusercontent.com/mwgg/Airports/master/airports.json/../../../../someone/airline-logos/
// began with the one file let in and is another repository, unpkg.com/leaflet-arc/../other-package/
// another package. The path is resolved first (new URL: the dot segments are removed as the server
// removes them, and the query kept), and a path that hides a dot or a slash in an escape (%2e, %2f,
// %5c) or a backslash is let in nowhere: its prefix says nothing of where it lands.
function resolvedPath(host, pathPart) {
  if (pathPart === '') return '';
  if (/%2e|%2f|%5c|\\/i.test(pathPart)) return null;
  let u;
  try { u = new URL('https://' + host + pathPart); } catch (e) { return null; }
  if (u.hostname !== host) return null;
  return u.pathname + u.search;
}
function letIn(host, pathPart, line) {
  if (!Object.prototype.hasOwnProperty.call(NOT_LOGO_HOSTS, host)) return null;
  const e = NOT_LOGO_HOSTS[host];
  if (e.script && !loadsScriptFrom(host, line)) return null;
  const at0 = resolvedPath(host, pathPart);
  if (at0 === null) return null;
  for (const at of e.at) {
    if (at === '/' || (at === '' ? at0 === '' : at0.startsWith(at))) return at;
  }
  return null;
}
// a line builds an image address where it names an image, a source, a background or a mask, or
// one of the words this code uses for the mark of an airline
const BUILDS_IMAGE = /<img\b|<image\b|<source\b|<video\b|\bsrc\b|\bsrcset\b|url\(|background|mask|\bposter\b|new Image\b|logo|emblem|wordmark|monogram|airline-tiles|watermark/i;
// (a map tile address names its server as {s}. before the host: the host is read past it)
const HOST = /(?:https?:)?\/\/(?:\{[a-z]\}\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(\/[^\s'"`)<>]*)?/ig;
// A RULE CITES ITS SOURCE. Two tables of rules (when a gate closes, who boards when) name the
// page of the airline each rule was read from (src, and srcFr, srcZones and the like for a page in
// another language or on another part of the rule), under a key that is also the name of an image
// attribute. Such a line builds no image address: it is a row of one of those two tables, and the
// address it names is a page, never a picture.
const CITES = (rel, line) => (rel === 'js/boarding-sequence.js' && /^\s*src(?:[A-Z][A-Za-z]*)?: 'https:\/\/[^']+',?\s*$/.test(line))
  || (rel === 'js/fids-core.js' && /^\s*(?:'?[A-Z0-9]{2}'?: \{ min: \d+, kind: '[A-Za-z]+',.*)?\bsrc: 'https:\/\/[^']+', checked: '\d{4}-\d\d-\d\d'/.test(line));
const PICTURE = /\.(?:svg|png|jpe?g|gif|webp|avif|ico|bmp)(?:[?#'"`\s)]|$)/i;
// AN ADDRESS BUILT FROM A SCHEME AND A VALUE: a string that is only a scheme (or the two slashes of
// one), joined to what follows it, or a template that opens on a scheme and a value. The host is then
// in the value, and no reading of the line can say what it is. The one form kept: an address typed
// without its scheme is given one (a hotel link, a photograph), which joins no host the line names.
const JOINED = /(['"`])(?:https?:)?\/\/\1\s*\+|`(?:https?:)?\/\/\$\{/;
const GIVES_SCHEME = /\b([A-Za-z_$][\w$]*)\s*=\s*(['"])https?:\/\/\2\s*\+\s*\1\s*;/;
// the hosts a line of code names, each with the path named after it ('' where none is): what
// follows a comment marker is commentary, but for the two slashes that begin an address
function hostsNamed(line) {
  return addressesNamed(line).map((a) => a.host);
}
function addressesNamed(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return [];
  const code = line.replace(/(^|[^:'"`(=\/])\/\/(?![a-z0-9-]+\.[a-z0-9.-]*[a-z]{2,}\/).*$/i, '$1');
  return [...code.matchAll(HOST)].map((m) => ({ host: m[1].toLowerCase(), path: m[2] || '' }));
}

// THE SWEEP, over the files of a site folder: every line of code, the hosts and paths it names
// against the list, and every address joined from a scheme and a value. Run on the real folder by
// the test below, and on a copy with a line added by the test after it.
const SWEPT = ['js/fids-core.js', 'js/shared-names.js', 'js/template-renderer.js', 'js/designer.js', 'js/menu.js', 'js/boarding-sequence.js', 'js/feed-router.js',
  'app.html', 'fids.html', 'gids.html', 'bids.html', 'screen.html', 'rotate.html', 'menu.html', 'designer.html', 'data/airline-colors.js'];
function sweep(site) {
  const found = [], seen = {}, seenAt = {};
  let lines = 0, read = 0, cited = 0, given = 0, images = 0;
  for (const rel of SWEPT) {
    const file = path.join(site, rel);
    if (!fs.existsSync(file)) continue;
    read++;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return;
      lines++;
      if (BUILDS_IMAGE.test(line)) images++;
      if (CITES(rel, line)) { cited++; if (PICTURE.test(line)) found.push(rel + ':' + (i + 1) + ': a rule cites a picture: ' + t.slice(0, 120)); return; }
      for (const { host, path: at } of addressesNamed(line)) {
        const under = letIn(host, at, line);
        if (under !== null) { seen[host] = 1; seenAt[host + ' ' + under] = 1; continue; }
        found.push(rel + ':' + (i + 1) + ': ' + host + (Object.prototype.hasOwnProperty.call(NOT_LOGO_HOSTS, host) ? ' at ' + (at || 'its bare name') + ', a path or a line it is not let in at,' : '') + ' in ' + t.slice(0, 120));
      }
      if (JOINED.test(line.replace(/(^|[^:'"`(=\/])\/\/\s.*$/, '$1'))) {
        if (GIVES_SCHEME.test(line)) given++;
        else found.push(rel + ':' + (i + 1) + ': an address joined from a scheme and a value: ' + t.slice(0, 120));
      }
    });
  }
  return { found, seen, seenAt, lines, read, cited, given, images };
}

test('no line of code names a host, but for the hosts the code uses for something other than an airline logo', () => {
  // the reader of a line
  assert.deepEqual(hostsNamed("  r1LogoSrc = r1LogoSrc || 'https://cdn.example.net/airlines/' + airlineCode + '.png';"), ['cdn.example.net']);
  assert.deepEqual(hostsNamed("  img.src = '//pics.example.io/400/120/' + code + '.png';"), ['pics.example.io']);
  assert.deepEqual(hostsNamed("  return '<img class=\"tile\" src=\"https://img.example.org/' + c + '.png\">';  // a note"), ['img.example.org']);
  assert.deepEqual(hostsNamed("  var src = '/logos/airline-tiles/' + t + '.svg'; // was https://img.example.org/x.png"), []);
  assert.deepEqual(hostsNamed('  // the logo came from https://img.example.org/x.png'), []);
  assert.deepEqual(hostsNamed("  var logo = '/logos/a.svg';"), []);
  assert.deepEqual(hostsNamed("    L.tileLayer('https://{s}.basemaps.example.com/{z}/{x}/{y}.png',"), ['basemaps.example.com']);
  // A HOST ON A LINE OF ITS OWN, THEN JOINED INTO THE GATE BAND: the two ways it passed the sweep of
  // the lines that build an image (the line that names the host builds none, and the line that
  // builds the image names none)
  assert.deepEqual(hostsNamed("  var _r1Cdn = 'https://cdn.carriermarks.example/a/';"), ['cdn.carriermarks.example']);
  assert.doesNotMatch("  var _r1Cdn = 'https://cdn.carriermarks.example/a/';", BUILDS_IMAGE, 'that line builds no image');
  assert.match("  r1LogoSrc = r1LogoSrc || ('https://' + _h + '/a/' + airlineCode + '.png');", JOINED);
  assert.deepEqual(hostsNamed("  r1LogoSrc = r1LogoSrc || ('https://' + _h + '/a/' + airlineCode + '.png');"), [], 'and this one names no host');
  assert.match('  var u = `https://${host}/a/${code}.png`;', JOINED);
  assert.match("  var u = '//' + host + '/a.png';", JOINED);
  for (const line of ["  url = 'https://' + url;", "  photoUrl = 'https://' + photoUrl;", "  else if (u && !/^https?:/i.test(u) && u.indexOf('/')!==0) u = 'https://'+u;"]) assert.ok(JOINED.test(line) && GIVES_SCHEME.test(line), line);
  assert.equal(GIVES_SCHEME.test("  r1LogoSrc = 'https://' + _h;"), false);
  for (const line of ['<img src="/logos/a.svg">', 'el.style.backgroundImage = "url(" + u + ")"', 'var r1LogoSrc = carrierLogoUrl(code);', "'/logos/airline-tiles/' + t", 'mask-image:url(x)', 'img.src = u;']) assert.match(line, BUILDS_IMAGE, line);
  const { found, seen, seenAt, lines, read, cited, given, images } = sweep(FC);
  assert.ok(read >= 14 && lines > 50000 && images > 3000, read + ' files, ' + lines + ' lines of code, ' + images + ' of them building an image address');
  assert.deepEqual(found, [], found.length + ' lines of code name a host not known to serve no airline logo, or join an address:\n' + found.join('\n'));
  assert.ok(cited >= 30 && cited <= 80, cited + ' rows of the two rule tables cite the page of an airline');
  assert.equal(given, 3, 'three addresses typed without a scheme are given one');
  assert.equal(CITES('js/fids-core.js', "    r1LogoSrc = r1LogoSrc || 'https://cdn.example.net/airlines/' + airlineCode + '.png';"), false);
  assert.equal(CITES('js/fids-core.js', "    'ZZ': { src: 'https://cdn.example.net/airlines/zz.png', h: 100 },"), false);
  assert.equal(CITES('app.html', "  src: 'https://www.example.com/page',"), false);
  assert.equal(PICTURE.test("  src: 'https://www.example.com/boarding/logo.svg',"), true);
  // the list holds only hosts a line still names: one that is no longer named leaves it
  assert.ok(/\.workers\.dev$/.test(OWN_WORKER), 'the worker of the boards: ' + OWN_WORKER);
  assert.deepEqual(Object.keys(seen).sort(), Object.keys(NOT_LOGO_HOSTS).sort());
  // and every path a host is let in at is a path a line still names
  assert.deepEqual(Object.keys(seenAt).sort(), Object.entries(NOT_LOGO_HOSTS).flatMap(([h, e]) => e.at.map((at) => h + ' ' + at)).sort());
  for (const e of Object.values(NOT_LOGO_HOSTS)) assert.ok(e.why.length > 10 && Array.isArray(e.at) && e.at.length >= 1, e.why);
  // a host that serves any file of anybody is never let in whole, and a host of script libraries
  // only on a line that loads a script
  for (const host of ANY_FILE_HOSTS.filter((h) => NOT_LOGO_HOSTS[h])) {
    assert.ok(NOT_LOGO_HOSTS[host].at.every((at) => at.length > 8 && at !== '/'), host + ': ' + NOT_LOGO_HOSTS[host].at.join(' '));
  }
  assert.deepEqual(Object.keys(NOT_LOGO_HOSTS).filter((h) => NOT_LOGO_HOSTS[h].script).sort(), ['cdnjs.cloudflare.com', 'unpkg.com']);
  assert.equal(letIn('cdnjs.cloudflare.com', '/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>'), '/ajax/libs/qrcodejs/');
  assert.equal(letIn('cdnjs.cloudflare.com', '/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', "  var u = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';"), null, 'a script host on a line that loads no script');
  assert.equal(letIn('raw.githubusercontent.com', '/someone/airline-logos/main/logos/', "  var _r1Gh = 'https://raw.githubusercontent.com/someone/airline-logos/main/logos/';"), null, 'another repository');
  assert.equal(letIn('unpkg.com', '/airline-logos/AC.png', '<script src="https://unpkg.com/airline-logos/AC.png"></script>'), null, 'another package');
  assert.equal(letIn('images.unsplash.com', '/photo-1', "  return 'https://images.unsplash.com/photo-1';"), '/');
  // a path is read as the server reads it: dot segments walk out of the prefix, an escaped dot or slash
  // hides where it lands
  assert.equal(letIn('raw.githubusercontent.com', '/mwgg/Airports/master/airports.json/../../../../someone/airline-logos/main/logos/', "  var _r1Gh = 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json/../../../../someone/airline-logos/main/logos/';"), null, 'out of the one file by its dot segments');
  assert.equal(letIn('unpkg.com', '/leaflet-arc/../other-package/marks.js', '<script src="https://unpkg.com/leaflet-arc/../other-package/marks.js"></script>'), null, 'out of the one package');
  assert.equal(letIn('raw.githubusercontent.com', '/mwgg/Airports/master/airports.json/%2e%2e/%2e%2e/x.png', "  var u = 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json/%2e%2e/%2e%2e/x.png';"), null, 'an escaped dot');
  assert.equal(letIn('raw.githubusercontent.com', '/mwgg/Airports/master/airports.json%2F..%2Fx.png', "  var u = 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json%2F..%2Fx.png';"), null, 'an escaped slash');
  assert.equal(letIn('raw.githubusercontent.com', '/mwgg/Airports/master/airports.json', "  var u = 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json';"), '/mwgg/Airports/master/airports.json', 'the one file, as it is named');
  assert.equal(letIn('unpkg.com', '/leaflet-arc/./dist/leaflet-arc.min.js', '<script src="https://unpkg.com/leaflet-arc/./dist/leaflet-arc.min.js"></script>'), '/leaflet-arc/', 'a dot segment that stays inside');
  // and none of them is a host of airline logos
  for (const host of Object.keys(NOT_LOGO_HOSTS)) assert.doesNotMatch(host, /wway|avs\.io|gstatic\.com\/flights|clearbit|airhex|kiwi|daisycon|logo/i, host);
  // the gate band: every line that sets its address is read by the sweep above, and none names a host
  const core = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
  const band = core.split('\n').filter((l) => /\br1LogoSrc\s*=[^=]/.test(l));
  assert.ok(band.length >= 6, band.length + ' lines set the address of the gate band');
  for (const l of band) { assert.match(l, BUILDS_IMAGE); assert.deepEqual(hostsNamed(l), [], l.trim().slice(0, 120)); assert.doesNotMatch(l, JOINED); }
});

// THE MUTATION THAT PASSED. A repository of airline logos on the host that serves the open list of
// airports, named on a line of its own and joined into the address of the gate band on the next. The
// host was in the list, anywhere on any line, so the sweep let it through. The sweep is run here on a
// copy of the site folder in a temporary folder, the copy of fids-core.js with the two lines added
// after the line that opens the address of the band, and it must name the first of them. The real file
// is never written.
test('the sweep catches a repository of logos on a host the list knows for another path', () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'own-host-'));
  try {
    for (const rel of SWEPT) {
      const from = path.join(FC, rel);
      if (!fs.existsSync(from)) continue;
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.copyFileSync(from, path.join(tmp, rel));
    }
    // the copy, untouched, is as clean as the real folder
    assert.deepEqual(sweep(tmp).found, []);
    const coreCopy = path.join(tmp, 'js/fids-core.js');
    const text = fs.readFileSync(coreCopy, 'utf8');
    const at = /^  var r1LogoSrc = .*$/m.exec(text);
    assert.ok(at, 'the line that opens the address of the band');
    const end = at.index + at[0].length;
    const added = "\n  var _r1Gh = 'https://raw.githubusercontent.com/someone/airline-logos/main/logos/';\n  r1LogoSrc = r1LogoSrc || (_r1Gh + airlineCode + '.png');";
    fs.writeFileSync(coreCopy, text.slice(0, end) + added + text.slice(end));
    const line = text.slice(0, end).split('\n').length + 1;
    const { found } = sweep(tmp);
    assert.deepEqual(found.map((f) => f.split(': ')[0]), ['js/fids-core.js:' + line], found.join('\n'));
    assert.match(found[0], /raw\.githubusercontent\.com at \/someone\/airline-logos\/main\/logos\//);
    // a script library from another package of the same host, on a script line, is caught too
    const page = path.join(tmp, 'designer.html');
    fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace('</head>', '  <script src="https://unpkg.com/airline-logos/dist/marks.js"></script>\n</head>'));
    assert.ok(sweep(tmp).found.some((f) => /^designer\.html:\d+: unpkg\.com at \/airline-logos\//.test(f)), 'another package of unpkg');
    // THE SECOND MIRROR: the same repository reached from the one file let in, by dot segments, joined
    // into the band the same way; and another package of unpkg reached from the arcs the same way
    fs.writeFileSync(coreCopy, text);
    fs.writeFileSync(page, fs.readFileSync(path.join(FC, 'designer.html'), 'utf8'));
    assert.deepEqual(sweep(tmp).found, [], 'the copy is clean again');
    const dots = "\n  var _r1Gh = 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json/../../../../someone/airline-logos/main/logos/';\n  r1LogoSrc = r1LogoSrc || (_r1Gh + airlineCode + '.png');";
    fs.writeFileSync(coreCopy, text.slice(0, end) + dots + text.slice(end));
    const found2 = sweep(tmp).found;
    assert.deepEqual(found2.map((f) => f.split(': ')[0]), ['js/fids-core.js:' + line], found2.join('\n'));
    assert.match(found2[0], /raw\.githubusercontent\.com at \/mwgg\/Airports\/master\/airports\.json\/\.\.\/\.\.\/\.\.\/\.\.\/someone\/airline-logos\/main\/logos\//);
    fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace('</head>', '  <script src="https://unpkg.com/leaflet-arc/../other-package/marks.js"></script>\n</head>'));
    assert.ok(sweep(tmp).found.some((f) => /^designer\.html:\d+: unpkg\.com at \/leaflet-arc\/\.\.\/other-package\//.test(f)), 'another package of unpkg, by a dot segment');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // and the real file was not touched
  assert.doesNotMatch(fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8'), /someone\/airline-logos/);
});
