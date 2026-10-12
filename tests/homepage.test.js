'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE HOMEPAGE (www.orionconnected.com) AND ITS CREDITS PAGE.
//
// home.html and credits.html speak the nine board languages, one at a time,
// the reader's: ?lang= first, then the saved choice, then the browser's
// languages, then English (BoardStrings.pageLang). Every word is the store's.
// Arabic reads right to left. The airport index is the live roster. The
// Worker serves the two pages at "/" and "/credits" on the www host and the
// bare domain only, and leaves every other host as it was.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BS = require(path.join(ROOT, 'fids-current/js/board-strings.js'));
const HOME = rd('fids-current/home.html');
const CREDITS = rd('fids-current/credits.html');
const JS = rd('fids-current/js/home.js');
const CSS = rd('fids-current/css/home.css');
const WORKER = rd('worker-entry.js');
const CORE = rd('fids-current/js/fids-core.js');
const PAGES = { 'home.html': HOME, 'credits.html': CREDITS };

// ── home.js, run against a page that has only begun to load ───────────────
function runHome(o) {
  o = o || {};
  const attrs = { lang: 'en' }, classes = new Set(), stored = {};
  if (o.saved != null) stored.oc_home_lang = o.saved;
  let replaced = null;
  const listeners = [];
  const g = {
    URL, URLSearchParams, Intl, console, Object, Array, String, Number, Math, JSON, Date,
    document: {
      readyState: 'loading',
      documentElement: {
        setAttribute: (k, v) => { attrs[k] = String(v); },
        removeAttribute: (k) => { delete attrs[k]; },
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        classList: { add: (c) => classes.add(c) }
      },
      addEventListener: (ev, fn) => listeners.push(ev),
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    },
    location: { search: o.search || '', href: 'https://www.orionconnected.com/' + (o.search || ''), hostname: 'www.orionconnected.com', origin: 'https://www.orionconnected.com' },
    navigator: { languages: o.languages || ['en-US'], language: (o.languages || ['en-US'])[0], userAgent: o.ua || 'Mozilla/5.0 (Macintosh)' },
    localStorage: { getItem: (k) => (k in stored ? stored[k] : null), setItem: (k, v) => { stored[k] = String(v); } },
    history: { replaceState: (a, b, u) => { replaced = u; } },
    matchMedia: () => ({ matches: !!o.narrow })
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(rd('fids-current/js/host-airport.js'), g);
  vm.runInContext(rd('fids-current/js/board-strings.js'), g);
  vm.runInContext(JS, g);
  return { g, attrs, classes, stored, home: g.OCHome, replaced: () => replaced, listeners };
}

// ── home.js, run against the real page ────────────────────────────────────
// A small DOM, enough for what the store and home.js do with a page: the
// page's own HTML parsed into elements, selectors (tag, #id, .class,
// [attr], [attr="v"], descendant, lists), events, details' open state and
// focus. home.js then runs exactly as in a browser: DOMContentLoaded fires
// the store's applyStatic and home.js's boot, in that order.
const VOID = new Set(['meta', 'link', 'img', 'br', 'hr', 'input', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr']);
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }[e.toLowerCase()] || m;
});
class Txt {
  constructor(t) { this.nodeType = 3; this.data = t; this.parentNode = null; }
  get textContent() { return this.data; }
}
class El {
  constructor(doc, tag) {
    this.nodeType = 1; this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.localName = tag.toLowerCase();
    this.attributes = new Map(); this.childNodes = []; this.parentNode = null; this.listeners = {};
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get classList() {
    const el = this, has = (c) => el.className.split(/\s+/).includes(c);
    return { contains: has, add: (c) => { if (!has(c)) el.className = (el.className + ' ' + c).trim(); } };
  }
  get href() { return this.getAttribute('href') || ''; }
  set href(v) { this.setAttribute('href', v); }
  get open() { return this.hasAttribute('open'); }
  set open(v) {
    if (!!v === this.open) return;
    if (v) this.setAttribute('open', ''); else this.removeAttribute('open');
    this.dispatchEvent({ type: 'toggle' });
  }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((n) => { n.parentNode = null; }); this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Txt(String(v))); }
  set innerHTML(v) { this.textContent = String(v).replace(/<[^>]*>/g, ''); }
  appendChild(n) { if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1); n.parentNode = this; this.childNodes.push(n); return n; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  dispatchEvent(e) { (this.listeners[e.type] || []).slice().forEach((fn) => fn.call(this, e)); }
  focus() { this.ownerDocument.activeElement = this; }
  matches(sel) { return parseSel(sel).some((chain) => matchChain(this, chain)); }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(sel)) return n; return null; }
  descendants() { const out = []; const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); }); walk(this); return out; }
  querySelectorAll(sel) { return this.descendants().filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
// a selector list: each item a chain of compounds joined by descendant spaces
function parseSel(sel) {
  return sel.split(',').map((one) => one.trim().split(/\s+/).map((part) => {
    const c = { tag: null, id: null, cls: [], attrs: [] };
    const re = /^([a-z][\w-]*|\*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([\^]?=)"([^"]*)")?\]/gi;
    let m, at = 0;
    while ((m = re.exec(part)) && m.index === at) {
      at = re.lastIndex;
      if (m[1]) c.tag = m[1] === '*' ? null : m[1].toLowerCase();
      else if (m[2]) c.id = m[2];
      else if (m[3]) c.cls.push(m[3]);
      else c.attrs.push({ name: m[4], op: m[5], value: m[6] });
    }
    assert.equal(at, part.length, 'the test DOM cannot read the selector ' + sel);
    return c;
  }));
}
function matchOne(el, c) {
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  const cls = el.className.split(/\s+/);
  if (!c.cls.every((x) => cls.includes(x))) return false;
  return c.attrs.every((a) => {
    if (!el.hasAttribute(a.name)) return false;
    if (a.op === '=') return el.getAttribute(a.name) === a.value;
    if (a.op === '^=') return el.getAttribute(a.name).startsWith(a.value);
    return true;
  });
}
function matchChain(el, chain) {
  if (!matchOne(el, chain[chain.length - 1])) return false;
  let i = chain.length - 2;
  for (let n = el.parentNode; n && n.nodeType === 1 && i >= 0; n = n.parentNode) if (matchOne(n, chain[i])) i--;
  return i < 0;
}
function parsePage(html, doc) {
  const root = new El(doc, '#root');
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(script|style|title)\b([^>]*)>([\s\S]*?)<\/\1>|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/gi;
  const attrsOf = (el, s) => { for (const a of s.matchAll(/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) el.setAttribute(a[1], decode(a[2] ?? a[3] ?? a[4] ?? '')); };
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[1]) { const el = top.appendChild(new El(doc, m[1])); attrsOf(el, m[2]); if (m[1].toLowerCase() === 'title') el.appendChild(new Txt(decode(m[3]))); }
    else if (m[4]) { const at = stack.map((n) => n.localName).lastIndexOf(m[4].toLowerCase()); if (at > 0) stack.length = at; }
    else if (m[5]) { const el = top.appendChild(new El(doc, m[5])); attrsOf(el, m[6]); if (!m[7] && !VOID.has(el.localName)) stack.push(el); }
    else if (m[8]) top.appendChild(new Txt(decode(m[8])));
  }
  return root.children.find((n) => n.localName === 'html');
}
// o: { url, languages, saved, blocked (storage throws), ua }
function loadPage(name, o) {
  o = o || {};
  const listeners = {};
  const doc = {
    readyState: 'loading', activeElement: null, title: '',
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    createElement: (t) => new El(doc, t),
    createElementNS: (ns, t) => new El(doc, t),
    getElementById: (id) => doc.querySelector('#' + id),
    querySelectorAll: (sel) => [doc.documentElement].concat(doc.documentElement.descendants()).filter((n) => n.matches(sel)),
    querySelector: (sel) => doc.querySelectorAll(sel)[0] || null
  };
  doc.documentElement = parsePage(rd('fids-current/' + name), doc);
  doc.body = doc.querySelector('body');
  const url = new URL(o.url || 'https://www.orionconnected.com/');
  const location = { href: url.href, search: url.search, hash: url.hash, pathname: url.pathname, hostname: url.hostname, origin: url.origin };
  const stored = {};
  if (o.saved != null) stored.oc_home_lang = o.saved;
  const store = { getItem: (k) => (k in stored ? stored[k] : null), setItem: (k, v) => { stored[k] = String(v); }, removeItem: (k) => { delete stored[k]; } };
  const g = {
    URL, URLSearchParams, Intl, console, Object, Array, String, Number, Math, JSON, Date, Error,
    document: doc, location,
    navigator: { languages: o.languages || ['en-US'], language: (o.languages || ['en-US'])[0], userAgent: o.ua || 'Mozilla/5.0 (Macintosh)' },
    history: { replaceState: (a, b, u) => { const n = new URL(u, location.href); Object.assign(location, { href: n.href, search: n.search, hash: n.hash, pathname: n.pathname }); } },
    innerWidth: 1440
  };
  for (const k of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(g, k, { get: () => { if (o.blocked) throw new Error('storage is blocked'); return store; } });
  }
  g.window = g;
  vm.createContext(g);
  vm.runInContext(rd('fids-current/js/host-airport.js'), g);
  vm.runInContext(rd('fids-current/js/board-strings.js'), g);
  vm.runInContext(JS, g);
  doc.readyState = 'interactive';
  (listeners.DOMContentLoaded || []).forEach((fn) => fn({ type: 'DOMContentLoaded' }));
  const fire = (type, target, extra) => {
    const e = Object.assign({ type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, extra);
    (listeners[type] || []).forEach((fn) => fn(e));
    return e;
  };
  const html = doc.documentElement;
  return {
    g, doc, html, stored, location, fire,
    $: (s) => doc.querySelector(s), $$: (s) => doc.querySelectorAll(s),
    click: (el) => fire('click', el),
    key: (k) => fire('keydown', doc.activeElement || doc.body, { key: k }),
    home: g.OCHome
  };
}

// every key a page or home.js asks the store for
function keysUsed() {
  const keys = new Set();
  for (const html of Object.values(PAGES)) {
    for (const m of html.matchAll(/data-i18n(?:-alt|-label|-content|-title)?="([^"]+)"/g)) keys.add(m[1]);
  }
  for (const m of JS.matchAll(/S\.(?:bs|fmt)\('([^']+)'/g)) keys.add(m[1]);
  for (const m of JS.matchAll(/'(home[A-Z]\w*)'/g)) keys.add(m[1]);
  return keys;
}

test('every word the pages show is in the store, in all nine languages', () => {
  const keys = keysUsed();
  assert.ok(keys.size > 100, 'the pages ask the store for their words: ' + keys.size);
  for (const k of keys) {
    const e = BS.entry(k);
    assert.ok(e, `'${k}' is not in BOARD_STR`);
    for (const l of BS.LANGS) assert.ok(typeof e[l] === 'string' && e[l].trim(), `'${k}' has no ${l}`);
  }
  // and nothing of theirs sits in the store unused
  const own = Object.keys(BS.STR).filter((k) => /^(home|cred)[A-Z0-9]/.test(k));
  for (const k of own) assert.ok(keys.has(k), `${k} is in the store and on neither page`);
});

test('the pages carry no words outside the store', () => {
  for (const [name, html] of Object.entries(PAGES)) {
    const body = html.slice(html.indexOf('<body'));
    // every element with words in it is filled from the store
    for (const m of body.matchAll(/<(span|a|p|h1|h2|h3|li|dt|dd|b|i|blockquote|summary)\b([^>]*)>([^<]*[A-Za-zÀ-ÿ]{2,}[^<]*)</g)) {
      assert.match(m[2], /data-i18n/, `${name}: '${m[3].trim()}' is not from the store`);
    }
    // an image's words too
    for (const m of body.matchAll(/<img\b[^>]*>/g)) {
      const alt = /alt="([^"]*)"/.exec(m[0]);
      assert.ok(alt, `${name}: an image with no alt`);
      if (alt[1]) assert.match(m[0], /data-i18n-alt="/, `${name}: an alt not from the store: ${alt[1].slice(0, 40)}`);
    }
    for (const m of body.matchAll(/<[^>]+aria-label="([^"]+)"[^>]*>/g)) {
      if (m[1] === 'Orion Connected') continue;   // the name, the same in every language
      assert.match(m[0], /data-i18n-label="/, `${name}: an aria-label not from the store: ${m[1]}`);
    }
  }
});

test('the English written into the pages, for a reader without script, is the store\'s own', () => {
  const { home } = runHome();
  const c = home.counts();
  const F = { N: String(c.N), LIVE: String(c.LIVE), CA: String(c.CA), US: String(c.US), EU: String(c.EU), AU: String(c.AU), GATE: '1',
    HERE: BS.bs('youAreHere', 'en'), WORD: BS.bs('appDep', 'en'), KICKER: BS.bs('heritageKicker', 'en'),
    TITLE: home.MODEL.title, AUTHOR: home.MODEL.author };
  const dec = (s) => s.replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&');
  let n = 0;
  for (const [name, html] of Object.entries(PAGES)) {
    for (const m of html.matchAll(/<\w+\b([^>]*?)data-i18n="([^"]+)"([^>]*)>([^<]*)</g)) {
      const own = /data-i18n-n="(\d+)"/.exec(m[1] + m[3]);
      assert.equal(dec(m[4]), BS.fmt(m[2], 'en', Object.assign({}, F, own ? { N: own[1] } : {}), true), `${name} ${m[2]}`);
      n++;
    }
    for (const m of html.matchAll(/(alt|aria-label|content)="([^"]*)"\s+data-i18n-(?:alt|label|content)="([^"]+)"([^>]*)/g)) {
      const own = /data-i18n-n="(\d+)"/.exec(m[4]);
      assert.equal(dec(m[2]), BS.fmt(m[3], 'en', Object.assign({}, F, own ? { N: own[1] } : {}), true), `${name} ${m[1]} ${m[3]}`);
      n++;
    }
  }
  assert.ok(n > 120, 'checked ' + n);
});

test('the page speaks ?lang= first, then the saved choice, then the browser, then English', () => {
  assert.equal(runHome({ search: '?lang=fr', saved: 'de', languages: ['ja'] }).attrs.lang, 'fr');
  assert.equal(runHome({ search: '?lang=xx', saved: 'de', languages: ['ja'] }).attrs.lang, 'de', 'an unknown ?lang= is ignored');
  assert.equal(runHome({ saved: 'de', languages: ['ja'] }).attrs.lang, 'de');
  assert.equal(runHome({ saved: 'klingon', languages: ['ja-JP', 'en'] }).attrs.lang, 'ja');
  assert.equal(runHome({ languages: ['xx-YY', 'pt-BR', 'fr'] }).attrs.lang, 'pt', 'the first browser language the store speaks');
  assert.equal(runHome({ languages: ['zh-CN'] }).attrs.lang, 'zh');
  assert.equal(runHome({ languages: ['ko', 'ru'] }).attrs.lang, 'en', 'English when nothing else matches');
  // the store's resolver is the only reader of the browser's language
  assert.deepEqual(BS.pageLang({ search: '', saved: null, navigatorLangs: ['es-MX'] }), { lang: 'es', source: 'browser' });
  assert.deepEqual(BS.pageLang({ search: '?lang=AR', navigatorLangs: [] }), { lang: 'ar', source: 'url' });
  assert.doesNotMatch(JS, /navigator\.languages?\b/, 'home.js asks the store, never the browser directly');
});

test('Arabic turns the page right to left, and the switch saves and shares the choice', () => {
  const ar = runHome({ search: '?lang=ar' });
  assert.equal(ar.attrs.lang, 'ar');
  assert.equal(ar.attrs.dir, 'rtl');
  assert.ok(ar.classes.has('js'), 'the page marks itself as scripted (the switch shows)');
  assert.deepEqual(Array.from(ar.g.langs), ['ar'], 'the store fills data-i18n in the page language');
  const en = runHome({ languages: ['en-CA'] });
  assert.equal(en.attrs.dir, undefined);
  en.home.choose('ar');
  assert.equal(en.attrs.lang, 'ar');
  assert.equal(en.attrs.dir, 'rtl');
  assert.equal(en.stored.oc_home_lang, 'ar', 'the choice is remembered');
  assert.match(en.replaced(), /[?&]lang=ar\b/, 'and written into the address');
  en.home.choose('de');
  assert.equal(en.attrs.lang, 'de');
  assert.equal(en.attrs.dir, undefined, 'back to left to right');
  en.home.choose('xx');
  assert.equal(en.attrs.lang, 'de', 'an unknown language changes nothing');
  // the hooks in the pages and the stylesheet
  for (const [name, html] of Object.entries(PAGES)) {
    assert.match(html, /<details class="lsw">\s*<summary>/, `${name} has the language switch`);
    assert.match(html, /<span class="sr" data-i18n="homeLang" data-i18n-one>/, `${name}: the switch is named for a screen reader`);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<script src="\/js\/board-strings\.js\?v=\d+"><\/script>\s*<script src="\/js\/home\.js\?v=\d+"><\/script>/, `${name} loads the store, then home.js, in the head`);
  }
  assert.match(JS, /a\.setAttribute\('hreflang', c\)/, 'each choice names its language');
  assert.match(JS, /a\.setAttribute\('aria-current', 'true'\)/, 'the language on screen is marked');
  assert.match(JS, /e\.key !== 'Escape'/, 'Escape closes the switch');
  assert.match(CSS, /\[dir="rtl"\] \.arw\{transform:scaleX\(-1\)\}/, 'arrows turn round right to left');
  assert.match(CSS, /\.menu summary,\.lsw summary\{[^}]*min-height:44px;min-width:44px/, 'the switch is a 44 px target');
  assert.match(CSS, /\.lsw-list a\{[^}]*min-height:46px/, 'each language is a 44 px target or more');
  assert.doesNotMatch(CSS, /(margin|padding)-(left|right)\s*:|text-align:\s*(left|right)|float:\s*(left|right)/,
    'sides are logical (start/end), so the page mirrors in Arabic');
});

test('the airport index is the live roster', () => {
  const s = CORE.indexOf('const FIDS_LIVE_AIRPORTS = new Set([');
  const live = [...CORE.slice(s, CORE.indexOf(']);', s)).matchAll(/'([A-Z0-9]{3})'/g)].map((m) => m[1]).sort();
  const { home } = runHome();
  const codes = Array.from(home.AIRPORTS, (a) => a[1]);
  assert.deepEqual(codes.slice().sort(), live, 'home.js lists exactly the airports the boards serve');
  assert.equal(new Set(codes).size, codes.length, 'each once');
  const c = home.counts();
  assert.equal(c.N, live.length);
  assert.equal(c.CA + c.US + c.EU + c.AU, c.N, 'every airport counted in one region');
  assert.deepEqual(Array.from(Object.keys(home.PAUSED)), ['SYD'], 'Sydney is docked, and shown as paused');
  // grouped by country, each named by CLDR from its ISO code
  for (const a of home.AIRPORTS) assert.match(a[0], /^[A-Z]{2}$/, a[1] + ' has an ISO country code');
  assert.deepEqual(Array.from(home.groups('en', new Intl.Collator('en'))), ['CA', 'US', 'IS', 'IE', 'CH', 'GB', 'AU']);
  // "Live now" counts the airports live now: the paused one is not, and the
  // index beside it says so (homeNotePaused)
  assert.equal(c.LIVE, c.N - Object.keys(home.PAUSED).length, 'the folio line leaves the paused airports out');
  assert.match(BS.bs('homeLiveNow', 'en'), /\{LIVE\}/);
  // the words written into the page before its script runs say the same
  assert.match(HOME, new RegExp(`Live now at ${c.LIVE} airports`));
  assert.match(HOME, new RegExp(`${c.CA} in Canada, ${c.US} in the United States, ${c.EU} in Europe and ${c.AU} in Australia\\.`));
  // each airport links to its own address
  assert.match(JS, /link\.href = 'https:\/\/' \+ a\[1\]\.toLowerCase\(\) \+ '\.orionconnected\.com';/);
});

test('airport names in French are the boards\' own (CITY_FR)', () => {
  const s = CORE.indexOf('const CITY_FR = {');
  const CITY_FR = new Function('return ' + CORE.slice(s + 'const CITY_FR = '.length, CORE.indexOf('\n};', s) + 3))();
  const win = {};
  new Function('window', rd('fids-current/js/shared-names.js'))(win);
  const { home } = runHome();
  for (const a of home.AIRPORTS) {
    const fr = CITY_FR[a[1]], en = win.FIDS_SHARED_CITY[a[1]];
    if (a[3]) assert.ok(fr && a[3].toUpperCase().startsWith(fr), `${a[1]}: '${a[3]}' is not the boards' French name ${fr}`);
    else if (fr && en) assert.equal(fr.normalize('NFD').replace(/[̀-ͯ]/g, ''), en.normalize('NFD').replace(/[̀-ͯ]/g, ''), `${a[1]}: the boards say ${fr} in French; the index needs it`);
  }
});

test('the region counts read right in every language', () => {
  const { home } = runHome();
  assert.equal(home.countText(28, 'en'), '28 airports');
  assert.equal(home.countText(1, 'en'), '1 airport');
  assert.equal(home.countText(2, 'ar'), 'المطارات: 2');
  assert.equal(home.countText(27, 'ar'), 'المطارات: 27');
  assert.equal(home.countText(2, 'fr'), '2 aéroports');
  assert.equal(home.countText(28, 'ja'), '28空港');
  for (const l of BS.LANGS) for (const n of [1, 2, 5, 27, 28, 62]) assert.ok(home.countText(n, l), `${l} ${n}`);
});

// ── home.js in the page, as a browser runs it ─────────────────────────────
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
// the links between the two pages (not a file, not a choice in the language switch)
const pageLinks = (p) => p.$$('a[href]').filter((a) => /^\/(?!\/)/.test(a.getAttribute('href')) && !/\.txt$/.test(a.getAttribute('href')) && !a.hasAttribute('data-lang-pick'));

test('home.js paints the homepage: the index, the nine languages, the switch, the words and the links', () => {
  const p = loadPage('home.html', { languages: ['en-US'] });
  const { home } = p;
  assert.equal(p.html.getAttribute('lang'), 'en');
  assert.ok(p.html.classList.contains('js'));
  // the airport index: one link per airport, to its own address, grouped by country
  const aps = p.$$('#airport-index a.ap');
  assert.equal(aps.length, home.AIRPORTS.length, 'every airport of the roster is in the index');
  assert.deepEqual(aps.map((a) => a.href).sort(), Array.from(home.AIRPORTS, (a) => 'https://' + a[1].toLowerCase() + '.orionconnected.com').sort());
  assert.deepEqual(p.$$('#airport-index .region h3').map((h) => h.textContent),
    Array.from(home.groups('en', new Intl.Collator('en'))).map((c) => new Intl.DisplayNames(['en'], { type: 'region' }).of(c)));
  assert.equal(p.$$('#airport-index a.paused').length, Object.keys(home.PAUSED).length);
  assert.equal(p.$('#paused-note').textContent, BS.fmt('homeNotePaused', 'en', { CITY: 'Sydney' }));
  // the words the page fills: the folio line counts what is live now
  assert.equal(p.$('[data-i18n="homeLiveNow"]').textContent, BS.fmt('homeLiveNow', 'en', { LIVE: home.counts().LIVE }));
  assert.equal(p.$('h1').textContent, BS.fmt('homeHeroTitle', 'en', { N: home.AIRPORTS.length }));
  // nine tiles, each word in its own language and direction; the tile itself
  // keeps the page's, so its divider and padding sit where every other one's do
  const tiles = p.$$('#lang-tiles li.lang');
  assert.deepEqual(tiles.map((t) => t.querySelector('.w').getAttribute('lang')), Array.from(BS.LANGS));
  assert.deepEqual(tiles.map((t) => t.querySelector('.w').textContent), BS.LANGS.map((l) => BS.bs('appDep', l)));
  for (const t of tiles) {
    assert.equal(t.getAttribute('lang'), null, 'a tile is in the page language');
    assert.equal(t.getAttribute('dir'), null, 'a tile keeps the page direction');
  }
  const ar = tiles[BS.LANGS.indexOf('ar')];
  assert.equal(ar.querySelector('.w').getAttribute('dir'), 'rtl');
  assert.equal(ar.querySelector('.m').getAttribute('dir'), 'rtl');
  // the switch: the nine languages, the one on screen marked, once
  const sws = p.$$('details.lsw');
  assert.equal(sws.length, 1);
  const links = sws[0].querySelectorAll('.lsw-list a');
  assert.deepEqual(links.map((a) => a.getAttribute('data-lang-pick')), Array.from(BS.LANGS));
  assert.deepEqual(links.filter((a) => a.getAttribute('aria-current') === 'true').map((a) => a.getAttribute('data-lang-pick')), ['en']);
  assert.equal(sws[0].querySelector('.lsw-name').textContent, BS.META.en.name);
  for (const a of links) assert.equal(new URL(a.href, 'https://www.orionconnected.com/').searchParams.get('lang'), a.getAttribute('data-lang-pick'), 'each choice links to its own language');
  // the boards' links go to the boards on a computer, to the app on a phone
  for (const a of p.$$('[data-boards-link]')) assert.equal(a.href, 'https://fids.orionconnected.com/picker');
  for (const a of loadPage('home.html', { ua: IPHONE }).$$('[data-boards-link]')) assert.equal(a.href, 'https://orionconnected.app');
  // addresses shown as they are
  assert.equal(p.$('[data-addr] .code').textContent + p.$('[data-addr] .dom').textContent, 'yqm.orionconnected.com');
  assert.equal(p.$('a[href="mailto:contact@orionconnected.com"] [data-href-text]').textContent, 'contact@orionconnected.com');
  // the links between the two pages carry the page's language
  assert.deepEqual(pageLinks(p).map((a) => a.getAttribute('href')), ['/?lang=en', '/credits?lang=en', '/credits?lang=en']);
});

test('picking a language turns the whole page, saves the choice, and gives focus back to the switch', () => {
  const p = loadPage('home.html', { languages: ['en-CA'] });
  const sw = p.$('details.lsw');
  sw.open = true;
  const e = p.click(sw.querySelector('[data-lang-pick="ar"]'));
  assert.ok(e.defaultPrevented, 'the page turns in place');
  assert.equal(p.html.getAttribute('lang'), 'ar');
  assert.equal(p.html.getAttribute('dir'), 'rtl');
  assert.equal(p.stored.oc_home_lang, 'ar', 'the choice is remembered');
  assert.match(p.location.search, /[?&]lang=ar\b/, 'and written into the address');
  assert.equal(sw.open, false, 'the switch closes');
  assert.equal(p.doc.activeElement, sw.querySelector('summary'), 'focus goes back to the switch');
  // everything follows
  assert.deepEqual(sw.querySelectorAll('.lsw-list a').filter((a) => a.getAttribute('aria-current') === 'true').map((a) => a.getAttribute('data-lang-pick')), ['ar']);
  assert.equal(sw.querySelector('.lsw-name').textContent, BS.META.ar.name);
  assert.equal(p.$('[data-i18n="homeLiveNow"]').textContent, BS.fmt('homeLiveNow', 'ar', { LIVE: p.home.counts().LIVE }));
  assert.equal(p.$('[data-i18n="homeScreensTitle"]').textContent, BS.bs('homeScreensTitle', 'ar'));
  assert.equal(p.$$('#airport-index a.ap').length, p.home.AIRPORTS.length);
  assert.equal(p.$$('#lang-tiles li.lang').length, 9);
  assert.deepEqual(pageLinks(p).map((a) => a.getAttribute('href')), ['/?lang=ar', '/credits?lang=ar', '/credits?lang=ar']);
  for (const a of sw.querySelectorAll('.lsw-list a')) assert.equal(new URL(a.href, 'https://www.orionconnected.com/').searchParams.get('lang'), a.getAttribute('data-lang-pick'));
  // and back to left to right
  sw.open = true;
  p.click(sw.querySelector('[data-lang-pick="de"]'));
  assert.equal(p.html.getAttribute('lang'), 'de');
  assert.equal(p.html.getAttribute('dir'), null);
  assert.equal(p.stored.oc_home_lang, 'de');
});

test('the next page speaks the same language, even when the choice cannot be saved or came with a link', () => {
  // storage blocked: the choice is lost on a reload, but not on the next page
  const p = loadPage('home.html', { blocked: true });
  assert.equal(p.html.getAttribute('lang'), 'en');
  p.click(p.$('details.lsw [data-lang-pick="fr"]'));
  assert.equal(p.html.getAttribute('lang'), 'fr');
  assert.deepEqual(p.stored, {}, 'nothing could be saved');
  const credits = p.$$('a[href^="/credits"]');
  assert.equal(credits.length, 2);
  for (const a of credits) assert.equal(a.getAttribute('href'), '/credits?lang=fr');
  const next = loadPage('credits.html', { url: new URL(credits[0].getAttribute('href'), 'https://www.orionconnected.com/').href, blocked: true });
  assert.equal(next.html.getAttribute('lang'), 'fr', 'the credits page opens in French');
  // and back home from the credits page
  assert.equal(next.$('a.brand').getAttribute('href'), '/?lang=fr');
  assert.equal(loadPage('home.html', { url: 'https://www.orionconnected.com' + next.$('a.brand').getAttribute('href'), blocked: true }).html.getAttribute('lang'), 'fr');
  // a shared ?lang= link: the page and the next one speak it; the reader's own saved choice stays
  const s = loadPage('home.html', { url: 'https://www.orionconnected.com/?lang=de', saved: 'es' });
  assert.equal(s.html.getAttribute('lang'), 'de');
  assert.equal(s.stored.oc_home_lang, 'es', 'a shared link does not change the saved choice');
  for (const a of s.$$('a[href^="/credits"]')) assert.equal(a.getAttribute('href'), '/credits?lang=de');
  // a link to a file, to a part of the page, to another site or an address stays as written
  const c = loadPage('credits.html', { url: 'https://www.orionconnected.com/credits?lang=pt' });
  assert.deepEqual(pageLinks(c).map((a) => a.getAttribute('href')), ['/?lang=pt', '/credits?lang=pt']);
  for (const h of ['/logos/icons/LICENSE-Apache-2.0.txt', '/logos/weather/animated/LICENSE-MIT.txt', '/fonts/bricolage/OFL.txt', '#main',
    'mailto:contact@orionconnected.com', 'https://epcotfont.com', 'https://orionconnected.app']) {
    assert.ok(c.$(`a[href="${h}"]`), h + ' is still there, as written');
  }
});

test('Escape, or a click elsewhere, closes an open menu or language switch', () => {
  const p = loadPage('home.html');
  const menu = p.$('details.menu'), sw = p.$('details.lsw');
  menu.open = true;
  p.key('Tab');
  assert.equal(menu.open, true, 'another key leaves it open');
  p.key('Escape');
  assert.equal(menu.open, false, 'Escape closes it');
  assert.equal(p.doc.activeElement, menu.querySelector('summary'), 'and focus goes back to it');
  sw.open = true;
  menu.open = true;
  assert.equal(sw.open, false, 'opening one closes the other');
  p.click(p.$('#h-screens'));
  assert.equal(menu.open, false, 'a click elsewhere closes it');
  menu.open = true;
  p.click(menu.querySelector('.menu-list a[href="#airports"]'));
  assert.equal(menu.open, false, 'choosing a place in the menu closes it');
});

// ── the Worker ─────────────────────────────────────────────────────────────
function lift(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head + ' must exist');
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('no end for ' + head);
}
const CONSTS = ['HOME_HOSTS', 'HOME_PAGES', 'HOME_RUN_FIRST'].map((n) => {
  const m = WORKER.match(new RegExp('^const ' + n + ' = ([^\\n]*);', 'm'));
  assert.ok(m, n + ' must exist');
  return `const ${n} = ${m[1]};`;
}).join('\n');
const homeRoute = new Function(`${CONSTS}\n${lift(WORKER, 'function homeRoute(')}\nreturn homeRoute;`)();
const route = (u) => homeRoute(new URL(u));

// the whole Worker, with the proxy it bundles stubbed out
function worker() {
  const src = WORKER.replace('import proxy from "./workers/fids-proxy.js";', 'const proxy = { fetch: async () => new Response("proxy") };')
    .replace('export default {', 'return {');
  return new Function(src)();
}
function assets() {
  const calls = [];
  const env = {
    ASSETS: {
      fetch: async (req) => {
        calls.push(req);
        const r = new Response('asset:' + new URL(req.url).pathname, { status: 200, headers: { 'Content-Type': 'text/html', ETag: '"e1"', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
        r.tag = 'from-assets';
        return r;
      }
    }
  };
  return { env, calls };
}

test('the routing: "/" and /credits on www and the bare domain are the homepage and its credits page', () => {
  for (const host of ['www.orionconnected.com', 'orionconnected.com', 'WWW.OrionConnected.com']) {
    assert.equal(route(`https://${host}/`), '/home', host);
    assert.equal(route(`https://${host}/?lang=fr`), '/home');
    assert.equal(route(`https://${host}/credits`), '/credits');
    assert.equal(route(`https://${host}/credits/`), '/credits');
    // everything else on these hosts is what it is on any host
    for (const p of ['/picker', '/css/home.css', '/css/font.css', '/logos/home/gate.jpg', '/fonts/Possibility-Bold-Web.woff2',
      '/js/home.js', '/home', '/home.html', '/credits.html', '/index.html', '/app', '/fids', '/credits/x', '/a']) {
      assert.equal(route(`https://${host}${p}`), null, host + p);
    }
  }
  for (const host of ['fids.orionconnected.com', 'yqm.orionconnected.com', 'yhz.orionconnected.ca', 'orionconnected.ca',
    'www.orionconnected.ca', 'orionconnected.app', 'www.orionconnected.app', 'yul.orionconnected.app', 'fids-proxy.example.workers.dev',
    'localhost', 'www.orionconnected.com.example.com', 'evilorionconnected.com']) {
    for (const p of ['/', '/credits', '/credits/']) assert.equal(route(`https://${host}${p}`), null, host + p);
  }
});

test('the Worker serves the pages there, without .html and never cached', async () => {
  const w = worker();
  let { env, calls } = assets();
  let r = await w.fetch(new Request('https://www.orionconnected.com/?lang=ar'), env, {});
  assert.equal(new URL(calls[0].url).pathname + new URL(calls[0].url).search, '/home?lang=ar');
  assert.equal(await r.text(), 'asset:/home');
  assert.equal(r.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, max-age=0');
  assert.equal(r.headers.get('Content-Type'), 'text/html; charset=utf-8');
  ({ env, calls } = assets());
  r = await w.fetch(new Request('https://orionconnected.com/credits/'), env, {});
  assert.equal(new URL(calls[0].url).pathname, '/credits');
  assert.equal(await r.text(), 'asset:/credits');
  // the fonts still come from the site's own storage on these hosts
  const font = await w.fetch(new Request('https://www.orionconnected.com/fonts/Possibility-Bold-Web.woff2'),
    { FIDS_PRIVATE: { get: async () => ({ body: 'WOFF2', httpEtag: '"f"' }) } }, {});
  assert.equal(font.status, 200);
  assert.equal(font.headers.get('Content-Type'), 'font/woff2');
});

test('every other host gets "/" and /credits exactly as the asset server gives them', async () => {
  const w = worker();
  for (const host of ['fids.orionconnected.com', 'yqm.orionconnected.com', 'orionconnected.ca', 'yhz.orionconnected.ca',
    'orionconnected.app', 'www.orionconnected.app', 'fids-proxy.example.workers.dev']) {
    for (const p of ['/', '/credits', '/credits/']) {
      const { env, calls } = assets();
      const req = new Request(`https://${host}${p}`);
      const r = await w.fetch(req, env, {});
      assert.equal(calls.length, 1, host + p);
      assert.equal(calls[0], req, `${host}${p}: the request itself, untouched`);
      assert.equal(r.tag, 'from-assets', `${host}${p}: the asset server's own response, untouched`);
      assert.equal(r.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
    }
  }
  // the route runs first, before every other route in the Worker
  const fetchAt = WORKER.indexOf('async fetch(request, env, ctx) {');
  const homeAt = WORKER.indexOf('const home = homeRoute(url);', fetchAt);
  assert.ok(homeAt > fetchAt && homeAt < WORKER.indexOf('if (url.hostname.startsWith("fids-proxy"))', fetchAt));
});

test('wrangler sends exactly those paths to the Worker first', () => {
  const cfg = JSON.parse(rd('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  const first = new Function(`${CONSTS}\nreturn HOME_RUN_FIRST;`)();
  assert.deepEqual(cfg.assets.run_worker_first, first);
  assert.deepEqual(first.slice().sort(), Object.keys(new Function(`${CONSTS}\nreturn HOME_PAGES;`)()).sort());
  assert.match(WORKER, /DORMANT for now\. A Cloudflare redirect rule sends www\.orionconnected\.com/, 'the comment says the route waits on the redirect rule');
});

// ── links, fonts, the logo, the facts ─────────────────────────────────────
test('the links go where they should', () => {
  assert.match(HOME, /href="https:\/\/fids\.orionconnected\.com\/picker" data-boards-link/, 'the live boards');
  assert.match(JS, /var LIVE_BOARDS = 'https:\/\/fids\.orionconnected\.com\/picker';/);
  assert.match(JS, /var PHONE_APP = 'https:\/\/orionconnected\.app';/);
  // a phone goes to the app, by the boards' own rule (fids-core.js PHONE
  // HANDOFF): the user agent alone
  assert.equal(runHome({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }).home.isPhone(), true);
  assert.equal(runHome({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' }).home.isPhone(), true);
  assert.equal(runHome({ ua: 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K)' }).home.isPhone(), false, 'an Android TV keeps the boards');
  assert.equal(runHome({ narrow: true }).home.isPhone(), false, 'a narrow desktop window keeps the boards, as it does on the boards');
  assert.equal(runHome({}).home.isPhone(), false);
  assert.doesNotMatch(JS, /matchMedia|max-width/, 'no width test');
  const core = CORE.slice(CORE.indexOf('// ── PHONE HANDOFF'), CORE.indexOf('// ── CROSS-DEVICE SCREEN STATE'));
  const rule = (src) => /\/iPhone\|iPod\|iPad\|Windows Phone\/i\.test\(\w+\) \|\| \(\/Android\/i\.test\(\w+\) && \/Mobile\/i\.test\(\w+\)\)/.test(src);
  assert.ok(rule(core) && rule(JS), 'the same user-agent rule as the boards');
  for (const html of Object.values(PAGES)) {
    assert.match(html, /href="https:\/\/orionconnected\.app"/);
    assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=5BUvFGF7AT4"/);
    assert.match(html, /href="\/credits"/);
    assert.match(html, /href="mailto:contact@orionconnected\.com"/);
  }
  assert.match(CREDITS, /href="https:\/\/epcotfont\.com"/, 'Possibility is credited with its link');
  assert.doesNotMatch(HOME + CREDITS, /vecteezy/i);
  // contact is the address alone
  assert.doesNotMatch(CREDITS, /<form\b|tel:|type="tel"/);
});

test('fonts: only the site\'s own, never AC Nord or a font host', () => {
  const buster = /css\/font\.css\?v=(\d+)/.exec(rd('fids-current/fids.html'))[1];
  for (const [name, html] of Object.entries(PAGES)) {
    const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sheets.map((s) => s.split('?')[0]), ['/css/font.css', '/css/home.css'], name);
    assert.equal(sheets[0], '/css/font.css?v=' + buster, `${name} loads font.css at the boards' version`);
    assert.doesNotMatch(html, /<script\b[^>]*src="https?:/i, `${name} loads no outside script`);
  }
  for (const src of [HOME, CREDITS, CSS, JS]) {
    assert.doesNotMatch(src, /AC Nord/i);
    assert.doesNotMatch(src, /fonts\.googleapis|fonts\.gstatic|typekit|use\.fontawesome|cdnjs|jsdelivr|unpkg/i);
    assert.doesNotMatch(src, /@import/);
  }
  assert.match(CSS, /--display:'Possibility','Bricolage Grotesque'/);
  assert.match(CSS, /--text:'Bricolage Grotesque'/);
});

test('the logo on a dark ground is white lettering with nothing behind it', () => {
  assert.match(CSS, /\.night\{[^}]*--lg-n:#fff;--lg-p:#fff;--lg-c:#fff;--lg-g:#fff\}/);
  for (const rule of CSS.matchAll(/([^{}]*(?:brand|logo)[^{}]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(rule[2], /background|box-shadow|border:/, 'no box behind the logo: ' + rule[1].trim());
  }
  for (const html of Object.values(PAGES)) assert.match(html, /<a class="brand" href="\/"[^>]*>\s*<svg class="logo"/);
});

test('the facts: a one-person start-up, no company words, no invented figures', () => {
  const words = [HOME, CREDITS, JS];
  for (const k of Object.keys(BS.STR).filter((x) => /^(home|cred)[A-Z0-9]/.test(x))) for (const l of BS.LANGS) words.push(BS.STR[k][l]);
  for (const w of words) {
    assert.doesNotMatch(w, /\bInc\.|\bLtd\.|\bLLC\b|\bCorp\.|our team|testimonial|\$\s?\d/i);
  }
});

test('a name of two words never breaks across lines (no severed phrases)', () => {
  // a no-break space inside the name, or in French a no-break hyphen (U+2011)
  const SEVERABLE = /Orion Connected|MET Norway|(New|Nuevo|Nuovo|Novo) Brunswick|نيو برونزويك|Nouveau-Brunswick/;
  // every word the two pages show, but the page title and the logo link's
  // name for a screen reader, which are never set across lines
  const keys = Object.keys(BS.STR).filter((k) => /^(home|cred)[A-Z0-9]/.test(k) && !['homeHomeLink', 'credDocTitle'].includes(k))
    .concat(['wxCredit', 'mapCreditOglNb']);
  let named = 0;
  for (const k of keys) {
    for (const l of BS.LANGS) {
      const s = BS.STR[k][l];
      assert.doesNotMatch(s, SEVERABLE, `${k} ${l}`);
      if (/Orion Connected|MET Norway|Brunswick|برونزويك/.test(s)) named++;
    }
  }
  assert.ok(named > 60, 'the names are there, held whole: ' + named);
  // and in the English written into the pages
  for (const [name, html] of Object.entries(PAGES)) {
    const text = html.slice(html.indexOf('<body')).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
    assert.doesNotMatch(text, SEVERABLE, name);
  }
});
