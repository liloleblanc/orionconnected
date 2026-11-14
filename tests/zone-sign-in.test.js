'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE SIGN-IN TRAVELS WITH THE ADMIN ACROSS THE ADDRESSES OF A ZONE.
//
// Every board lives on the address of its airport (tests/strict-addresses
// .test.js), and an admin was the exception: the sign-in is a bearer token in
// localStorage and sessionStorage, storage belongs to one origin, and moving
// to another airport address would have signed the admin out. So a signed-in
// admin never moved, and yqm.orionconnected.com/gids?ap=YUL&gate=128 stayed
// on the Moncton address.
//
// Now the sign-in is also kept in one cookie on the zone (fidsSignIn, in
// host-airport.js), and the admin moves as a visitor does. These tests run
// the real file against a stubbed window and the cookie jar of a browser.
//
// The token here is MADE UP: three made-up parts with an expiry in the
// middle one. No real token, user or password is in this file.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, 'fids-current', p), 'utf8');
const SRC = rd('js/host-airport.js');
const CORE = rd('js/fids-core.js');
const MENU = rd('js/menu.js');
const AUTH = rd('js/auth.js');

const NAME = '__Secure-fids_signin';
const NOW = Date.now();
const SEC = Math.floor(NOW / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** A made-up token: the shape of a JWT, an expiry `left` seconds from now (null: none it can read). */
const token = (left, who) => b64({ alg: 'none', made: 'up' }) + '.'
  + (left === null ? b64({ sub: who || 'tester' }) : b64({ sub: who || 'tester', exp: SEC + left })) + '.bm90LWEtcmVhbC1zaWduYXR1cmU';
const LIVE = token(3600);
const NEWER = token(7200, 'tester-again');
const DEAD = token(-60);
const NO_EXPIRY = token(null);
const USER = JSON.stringify({ username: 'tester', role: 'admin', displayName: 'Test Admin' });

/**
 * The cookies of one browser. `on(host)` is the document of a page on that
 * host: it reads the cookies whose Domain covers the host and takes a write
 * by the rules a browser applies to this cookie (Secure for the __Secure-
 * prefix, a Domain the host belongs to, Max-Age=0 removes).
 */
function browser(opts) {
  const o = opts || {};
  const kept = [];            // { name, value, domain }
  const writes = [];          // every string given to document.cookie, with its host
  return {
    kept, writes,
    value(domain) { const c = kept.find((k) => k.domain === domain && k.name === NAME); return c ? c.value : null; },
    on(host) {
      return {
        get cookie() { return kept.filter((k) => host === k.domain || host.endsWith('.' + k.domain)).map((k) => k.name + '=' + k.value).join('; '); },
        set cookie(text) {
          writes.push({ host, text: String(text) });
          if (o.refuse) return;
          const bits = String(text).split(';').map((b) => b.trim());
          const eq = bits[0].indexOf('=');
          const name = bits[0].slice(0, eq), value = bits[0].slice(eq + 1);
          const attr = {};
          for (const b of bits.slice(1)) { const i = b.indexOf('='); attr[(i < 0 ? b : b.slice(0, i)).toLowerCase()] = i < 0 ? true : b.slice(i + 1); }
          if (name.startsWith('__Secure-') && !attr.secure) return;
          const domain = String(attr.domain || host).toLowerCase();
          if (!(host === domain || host.endsWith('.' + domain))) return;
          const at = kept.findIndex((k) => k.name === name && k.domain === domain);
          if (at >= 0) kept.splice(at, 1);
          if (attr['max-age'] !== undefined && Number(attr['max-age']) <= 0) return;
          kept.push({ name, value, domain });
        }
      };
    }
  };
}

const mem = (init) => {
  const s = Object.assign({}, init || {});
  return { _s: s, getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } };
};

/**
 * A page load: host-airport.js run against a stubbed window on `url`, in
 * browser `b` (none: a page with no document). Returns the window, where it
 * went, both stores, and what the stores and the jar held AT THE MOMENT the
 * page was replaced (the order of things is part of the contract).
 */
function load(url, b, opts) {
  const o = opts || {};
  const u = new URL(url);
  const went = [], atMove = [];
  const win = {
    location: {
      hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, href: u.href, origin: u.origin,
      replace: (to) => { went.push(to); atMove.push({ local: win.localStorage.getItem('fids_token'), tab: win.sessionStorage.getItem('fids_token'), jar: b ? b.on(u.hostname).cookie : '' }); },
      assign: (to) => { went.push(to); }
    },
    navigator: { userAgent: o.ua || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15' },
    localStorage: o.localStore || mem(o.local),
    sessionStorage: mem(o.session)
  };
  win.self = win;
  win.top = o.framed ? {} : win;
  if (b) win.document = b.on(u.hostname);
  new Function('window', 'sessionStorage', SRC)(win, win.sessionStorage);
  return { win, went, atMove, local: win.localStorage._s, tab: win.sessionStorage._s, S: win.fidsSignIn };
}

const S = load('https://fids.orionconnected.com/credits').S;
const ATTRS = (zone, age) => '; Domain=' + zone + '; Path=/; Max-Age=' + age + '; Secure; SameSite=Strict';
const KEPT = LIVE + '|' + encodeURIComponent(USER);

// ── the cookie, attribute by attribute ─────────────────────────────────────

test('the cookie of each host: the zone as Domain, Path=/, Secure, SameSite=Strict, and it ends when the token does', () => {
  const com = NAME + '=' + KEPT + '; Domain=orionconnected.com; Path=/; Max-Age=3600; Secure; SameSite=Strict';
  const ca = NAME + '=' + KEPT + '; Domain=orionconnected.ca; Path=/; Max-Age=3600; Secure; SameSite=Strict';
  for (const host of ['yqm.orionconnected.com', 'yul.orionconnected.com', 'fids.orionconnected.com', 'www.orionconnected.com', 'orionconnected.com',
                      'YQM.OrionConnected.com', 'yqm.orionconnected.com:443', 'cyqm.orionconnected.com']) {
    assert.equal(S.cookieFor(host, LIVE, USER, SEC * 1000), com, host);
  }
  for (const host of ['yqm.orionconnected.ca', 'yul.orionconnected.ca', 'fids.orionconnected.ca', 'www.orionconnected.ca', 'orionconnected.ca']) {
    assert.equal(S.cookieFor(host, LIVE, USER, SEC * 1000), ca, host);
  }
  // exactly these attributes and no other: above all never HttpOnly (script
  // could not set it, and the page must read the token to send the header)
  const attrs = com.split('; ').slice(1);
  assert.deepEqual(attrs, ['Domain=orionconnected.com', 'Path=/', 'Max-Age=3600', 'Secure', 'SameSite=Strict']);
  assert.doesNotMatch(SRC, /HttpOnly\s*[;'"]/i, 'no cookie string carries HttpOnly');
  assert.match(SRC, /It CANNOT be HttpOnly: the page itself reads the token/, 'and the file says why');
  assert.equal(S.NAME, NAME);
  // the value: the token as it is, then the small user record, encoded
  assert.equal(S.cookieFor('yqm.orionconnected.com', LIVE, '', SEC * 1000), NAME + '=' + LIVE + ATTRS('orionconnected.com', 3600));
  assert.equal(S.cookieFor('yqm.orionconnected.com', LIVE, 'not json', SEC * 1000), NAME + '=' + LIVE + ATTRS('orionconnected.com', 3600), 'a record that is no record stays behind');
  assert.equal(S.cookieFor('yqm.orionconnected.com', LIVE, JSON.stringify({ note: 'x'.repeat(2000) }), SEC * 1000), NAME + '=' + LIVE + ATTRS('orionconnected.com', 3600),
    'so does one too long for a cookie');
  assert.deepEqual(S.read(com.split('; ')[0]), { token: LIVE, user: USER });
  assert.deepEqual(S.read('a=b; ' + NAME + '=' + LIVE + '; c=d'), { token: LIVE, user: '' });
  assert.deepEqual(S.read(NAME + '=out'), { out: true });
  for (const junk of ['', 'a=b', NAME + '=', NAME + '=not-a-token', NAME + '=a.b', NAME + '=a.b.c.d', NAME + '=<script>.x.y', 'x' + NAME + '=' + LIVE]) {
    assert.equal(S.read(junk), null, junk);
  }
});

test('the lifetime ends with the token; an unreadable expiry gets one hour; an expired token gets no cookie', () => {
  const age = (t, now) => Number((/Max-Age=(-?\d+)/.exec(S.cookieFor('yqm.orionconnected.com', t, USER, now)) || [])[1]);
  assert.equal(age(LIVE, SEC * 1000), 3600);
  assert.equal(age(LIVE, (SEC + 3000) * 1000), 600, 'less as the token ages');
  assert.equal(age(LIVE, (SEC + 3599) * 1000), 1);
  assert.equal(age(token(86400), SEC * 1000), 86400, 'a day, as the server issues it');
  assert.equal(S.cookieFor('yqm.orionconnected.com', LIVE, USER, (SEC + 3600) * 1000), '', 'at its expiry: nothing');
  assert.equal(S.cookieFor('yqm.orionconnected.com', LIVE, USER, (SEC + 9999) * 1000), '');
  assert.equal(S.cookieFor('yqm.orionconnected.com', DEAD, USER, SEC * 1000), '', 'an expired token is never kept');
  assert.equal(age(NO_EXPIRY, SEC * 1000), 3600, 'no expiry it can read: a short lifetime, not a long one');
  assert.equal(age(b64({ a: 1 }) + '.bm90LWpzb24.c2ln', SEC * 1000), 3600, 'a middle part that is no JSON: the same');
  for (const bad of ['', null, undefined, 't', 'a.b', 'a b.c.d', LIVE + ';x', LIVE + ' ', 'x'.repeat(4000) + '.y.z', 42, {}]) {
    assert.equal(S.cookieFor('yqm.orionconnected.com', bad, USER, SEC * 1000), '', 'no token, no cookie: ' + String(bad).slice(0, 20));
  }
});

test('no Domain cookie on any host that is not .com or .ca of ours: a preview, a local page, the .app zone', () => {
  const OFF = ['zone-sign-in-fids.example.workers.dev', 'fids.example.workers.dev', 'localhost', 'localhost:8080', '127.0.0.1', '[::1]', '',
               'orionconnected.app', 'yqm.orionconnected.app', 'fids.orionconnected.app',
               'orionconnected.com.evil.test', 'notorionconnected.com', 'evil-orionconnected.com', 'orionconnected.com.', 'a.b.orionconnected.com', '.orionconnected.com',
               'yqm.orionconnected.org', 'com', 'ca'];
  for (const host of OFF) {
    assert.equal(S.zoneFor(host), '', host);
    assert.equal(S.cookieFor(host, LIVE, USER, SEC * 1000), '', host);
    assert.equal(S.outCookieFor(host), '', host);
    assert.equal(S.goneCookieFor(host), '', host);
  }
  // and on such a page nothing is written and nothing is taken, whatever the storage and the jar hold
  for (const url of ['https://zone-sign-in-fids.example.workers.dev/fids?ap=YUL', 'http://localhost:8080/gids.html?ap=YUL&gate=128',
                     'https://yqm.orionconnected.app/app?ap=YQM', 'https://yqm.orionconnected.app/fids?screen=ABCDEF', 'https://orionconnected.app/fids?stream=1']) {
    const host = new URL(url).hostname;
    let b = browser();
    let r = load(url, b, { local: { fids_token: LIVE, fids_user: USER } });
    assert.deepEqual(b.writes, [], url + ': the sign-in stays where it is');
    assert.equal(r.local.fids_token, LIVE);
    assert.equal(r.S.travels(), false);
    r.S.keep(LIVE, USER);
    assert.deepEqual(b.writes, [], url + ': nor at a sign-in made there');
    r.S.end();
    assert.deepEqual(b.writes, [], url + ': nor at a sign-out');
    assert.equal(r.local.fids_token, undefined, 'the sign-out itself still clears this origin');
    // a cookie of that name, however it came to be there, is not a sign-in
    b = browser();
    b.kept.push({ name: NAME, value: KEPT, domain: host });
    r = load(url, b);
    assert.equal(r.local.fids_token, undefined, url + ': nothing is taken from a cookie');
    assert.equal(r.tab.fids_token, undefined);
    b = browser();
    b.kept.push({ name: NAME, value: 'out', domain: host });
    r = load(url, b, { local: { fids_token: LIVE } });
    assert.equal(r.local.fids_token, LIVE, url + ': nor is a sign-in ended by one');
  }
});

// ── arriving ───────────────────────────────────────────────────────────────

test('adopt: an origin with no live token takes the token of the zone into both storage copies', () => {
  const b = browser();
  load('https://yqm.orionconnected.com/fids', b).S.keep(LIVE, USER);
  assert.equal(b.value('orionconnected.com'), KEPT);
  for (const url of ['https://yul.orionconnected.com/gids?gate=128', 'https://fids.orionconnected.com/picker.html', 'https://www.orionconnected.com/',
                     'https://orionconnected.com/credits', 'https://yhz.orionconnected.com/bids?belt=2']) {
    const r = load(url, b);
    assert.deepEqual([r.local.fids_token, r.tab.fids_token], [LIVE, LIVE], url);
    assert.deepEqual([r.local.fids_user, r.tab.fids_user], [USER, USER], url + ': the user record too');
    assert.equal(r.S.travels(), true);
  }
  // an expired copy here is no live token: the one of the zone replaces it
  let r = load('https://yul.orionconnected.com/fids', b, { local: { fids_token: DEAD, fids_user: '{"username":"old"}' }, session: { fids_token: DEAD } });
  assert.deepEqual([r.local.fids_token, r.tab.fids_token, r.local.fids_user], [LIVE, LIVE, USER]);
  // the zone has one sign-in: another live token here gives way to it
  r = load('https://yul.orionconnected.com/fids', b, { local: { fids_token: NEWER, fids_user: '{"username":"other"}' } });
  assert.deepEqual([r.local.fids_token, r.tab.fids_token, r.local.fids_user], [LIVE, LIVE, USER]);
  // a cookie with no user record leaves no record of someone else behind
  const b2 = browser();
  load('https://yqm.orionconnected.com/fids', b2).S.keep(LIVE, '');
  r = load('https://yul.orionconnected.com/fids', b2, { local: { fids_user: '{"username":"old"}' } });
  assert.deepEqual([r.local.fids_token, r.local.fids_user, r.tab.fids_user], [LIVE, undefined, undefined]);
  // .ca is another zone: a sign-in on .com is not one there
  r = load('https://yul.orionconnected.ca/fids', b);
  assert.equal(r.local.fids_token, undefined);
  assert.equal(r.S.travels(), false);
  // storage that throws (a private window) is not a crash, and not a sign-in
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  r = load('https://yul.orionconnected.com/fids', b, { localStore: broken });
  assert.equal(r.tab.fids_token, LIVE, 'the copy that works takes it');
});

test('write-back: a sign-in made before the cookie existed starts travelling at the next page load', () => {
  for (const [zone, held] of [['orionconnected.com', { local: { fids_token: LIVE, fids_user: USER } }], ['orionconnected.ca', { session: { fids_token: LIVE, fids_user: USER } }]]) {
    const b = browser();
    const r = load('https://yqm.' + zone + '/fids', b, held);
    assert.equal(b.writes.length, 1, zone);
    assert.match(b.writes[0].text, new RegExp('^' + NAME + '=' + KEPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '; Domain=' + zone.replace(/\./g, '\\.') + '; Path=/; Max-Age=(3600|3599); Secure; SameSite=Strict$'));
    assert.equal(r.S.travels(), true);
    assert.deepEqual(r.went, []);
    // and the next address of the zone is signed in without signing in again
    assert.equal(load('https://yul.' + zone + '/fids', b).local.fids_token, LIVE);
  }
  // once it is there, a page load writes nothing more
  const b = browser();
  load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: LIVE } });
  load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: LIVE } });
  load('https://yul.orionconnected.com/fids', b);
  assert.equal(b.writes.length, 1);
  // a browser that refuses the cookie: the write is tried, and the sign-in is known not to travel
  const no = browser({ refuse: true });
  const r = load('https://yqm.orionconnected.com/fids', no, { local: { fids_token: LIVE } });
  assert.equal(no.writes.length, 1);
  assert.equal(r.S.travels(), false, 'travels is read back from the jar, never assumed');
  assert.equal(r.local.fids_token, LIVE, 'and the sign-in on this origin is untouched');
  // a visitor writes nothing at all
  const v = browser();
  load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128', v);
  assert.deepEqual(v.writes, []);
});

test('expiry: an expired token is never written, never taken and never left in the cookie', () => {
  // storage holds a dead token: no cookie for it
  let b = browser();
  let r = load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: DEAD, fids_user: USER } });
  assert.deepEqual(b.writes, []);
  assert.equal(r.S.travels(), false);
  assert.equal(r.S.keep(DEAD, USER), false);
  assert.deepEqual(b.writes, [], 'nor through a sign-in call');
  // the cookie holds a dead token (a clock that moved): not taken, and removed
  b = browser();
  b.kept.push({ name: NAME, value: DEAD, domain: 'orionconnected.com' });
  r = load('https://yul.orionconnected.com/fids', b);
  assert.deepEqual([r.local.fids_token, r.tab.fids_token], [undefined, undefined]);
  assert.equal(b.value('orionconnected.com'), null);
  assert.equal(b.writes[0].text, NAME + '=; Domain=orionconnected.com; Path=/; Max-Age=0; Secure; SameSite=Strict');
  // a dead cookie and a live token here: the live one is what the zone keeps
  b = browser();
  b.kept.push({ name: NAME, value: DEAD, domain: 'orionconnected.com' });
  r = load('https://yul.orionconnected.com/fids', b, { local: { fids_token: LIVE } });
  assert.equal(b.value('orionconnected.com'), LIVE);
  assert.equal(r.local.fids_token, LIVE);
  // a token with no expiry it can read is kept an hour at a time
  b = browser();
  load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: NO_EXPIRY } });
  assert.equal(b.writes[0].text, NAME + '=' + NO_EXPIRY + ATTRS('orionconnected.com', 3600));
  // a cookie that is not a token at all is nothing
  b = browser();
  b.kept.push({ name: NAME, value: 'javascript:alert(1)', domain: 'orionconnected.com' });
  r = load('https://yul.orionconnected.com/fids', b);
  assert.equal(r.local.fids_token, undefined);
  // travels stops being true the moment the token dies, with no page load
  b = browser();
  const soon = token(120);
  r = load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: soon } });
  assert.equal(r.S.travels(), true);
  const realNow = Date.now;
  try { Date.now = () => realNow() + 121000; assert.equal(r.S.travels(), false); } finally { Date.now = realNow; }
});

// ── signing in ─────────────────────────────────────────────────────────────

/** auth.js as the page runs it, with the window of a loaded page; fetch answers the made-up sign-in. */
function authOn(r) {
  const fetchStub = async () => ({ ok: true, json: async () => ({ token: NEWER, user: JSON.parse(USER) }) });
  return new Function('window', 'localStorage', 'sessionStorage', 'fetch', 'atob', AUTH + '\nreturn Auth;')(r.win, r.win.localStorage, r.win.sessionStorage, fetchStub, atob);
}
/** Brace-matched lift of a named function out of a source file. */
function lift(src, name) {
  let at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' is still defined');
  if (src.slice(Math.max(0, at - 6), at) === 'async ') at -= 6;
  let depth = 0;
  for (let k = src.indexOf('{', at); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + name);
}

test('both sign-in paths write the cookie: auth.js (the opener, the picker) and the login of the boards', async () => {
  // auth.js
  let b = browser();
  let r = load('https://fids.orionconnected.com/', b);
  const Auth = authOn(r);
  assert.equal(Auth.init(), false);
  assert.deepEqual(await Auth.login('tester', 'made-up'), { success: true, user: JSON.parse(USER) });
  assert.equal(b.value('orionconnected.com'), NEWER + '|' + encodeURIComponent(USER));
  assert.deepEqual([r.local.fids_token, r.tab.fids_token], [NEWER, NEWER]);
  assert.equal(r.S.travels(), true);
  assert.equal(load('https://yul.orionconnected.com/fids', b).local.fids_token, NEWER, 'and the airport addresses are signed in');
  // a sign-in replaces the signed-out mark of an earlier sign-out
  Auth.logout();
  assert.equal(b.value('orionconnected.com'), 'out');
  await Auth.login('tester', 'made-up');
  assert.equal(b.value('orionconnected.com'), NEWER + '|' + encodeURIComponent(USER));
  // the boards: attemptLogin writes both copies, then the cookie, with the same values
  const login = lift(CORE, 'attemptLogin');
  assert.match(login, /sessionStorage\.setItem\('fids_token', data\.token\);\s*sessionStorage\.setItem\('fids_user', _userJson\);[\s\S]{0,400}?try \{ if \(typeof fidsSignIn !== 'undefined' && fidsSignIn\) fidsSignIn\.keep\(data\.token, _userJson\); \} catch \(e\) \{\}\s*LIVE_MODE = true;/);
  b = browser();
  r = load('https://yqm.orionconnected.com/fids?live', b);
  const els = {};
  const doc = { getElementById: (id) => els[id] || (els[id] = { value: id === 'loginUser' ? 'tester' : 'made-up', style: {}, textContent: '', className: '' }), querySelector: () => ({ style: {} }) };
  await new Function('document', 'fetch', 'localStorage', 'sessionStorage', 'fidsSignIn', 'onApChange', '_paintFeedSource', 'var LIVE_MODE = false;\n' + login + '\nreturn attemptLogin();')(
    doc, async () => ({ ok: true, json: async () => ({ token: LIVE, user: JSON.parse(USER) }) }), r.win.localStorage, r.win.sessionStorage, r.S, () => {}, () => {});
  assert.equal(b.value('orionconnected.com'), KEPT);
  assert.deepEqual([r.local.fids_token, r.tab.fids_token], [LIVE, LIVE]);
  // every place that stores a token is one of these two (a third would sign in without travelling)
  const writers = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'fids-current', 'js')).filter((n) => n.endsWith('.js')).map((n) => 'js/' + n)
    .concat(fs.readdirSync(path.join(ROOT, 'fids-current')).filter((n) => n.endsWith('.html')))) {
    const n = (rd(f).match(/setItem\((?:'fids_token'|TOKEN_KEY)/g) || []).length;
    if (n) writers.push(f + ':' + n);
  }
  assert.deepEqual(writers.sort(), ['js/auth.js:4', 'js/fids-core.js:2', 'js/host-airport.js:1'], 'auth.js saveToken and loadToken, attemptLogin, and the module itself');
  assert.match(AUTH, /function saveToken\(jwt, user\) \{[\s\S]*?try \{ if \(window\.fidsSignIn\) window\.fidsSignIn\.keep\(jwt, JSON\.stringify\(user\)\); \} catch \(e\) \{\}\s*\}\s*function loadToken/);
});

// ── signing out ────────────────────────────────────────────────────────────

test('signing out anywhere signs out everywhere on the zone: the mark, and every origin obeys it', () => {
  const b = browser();
  load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: LIVE, fids_user: USER } });
  const yul = load('https://yul.orionconnected.com/fids', b);
  assert.equal(yul.local.fids_token, LIVE);
  // sign out on yul (auth.js logout, as the picker calls it)
  const Auth = authOn(yul);
  assert.equal(Auth.init(), true);
  b.writes.length = 0;
  Auth.logout();
  assert.deepEqual(b.writes.map((w) => w.text), [NAME + '=out; Domain=orionconnected.com; Path=/; Max-Age=34560000; Secure; SameSite=Strict']);
  assert.deepEqual([yul.local.fids_token, yul.local.fids_user, yul.tab.fids_token, yul.tab.fids_user], [undefined, undefined, undefined, undefined]);
  assert.equal(yul.S.travels(), false);
  // open yqm, which still holds the live token in its own storage: it goes, and is not written back
  b.writes.length = 0;
  const yqm = load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128', b, { local: { fids_token: LIVE, fids_user: USER }, session: { fids_token: LIVE, fids_user: USER } });
  assert.deepEqual([yqm.local.fids_token, yqm.local.fids_user, yqm.tab.fids_token, yqm.tab.fids_user], [undefined, undefined, undefined, undefined]);
  assert.deepEqual(b.writes, [], 'the mark stays; nothing is written back');
  assert.equal(b.value('orionconnected.com'), 'out');
  assert.deepEqual(yqm.went, ['https://yul.orionconnected.com/gids?gate=128'], 'and the page moves, as for the visitor it now is');
  // every other address of the zone the same, and the other zone not at all
  assert.equal(load('https://fids.orionconnected.com/fids?ap=YQM', b, { session: { fids_token: NEWER } }).tab.fids_token, undefined);
  assert.equal(load('https://yqm.orionconnected.ca/fids', b, { local: { fids_token: LIVE } }).local.fids_token, LIVE, '.ca has its own sign-in');
  // signed out stays signed out: a page with nothing writes nothing
  assert.equal(load('https://yhz.orionconnected.com/fids', b).local.fids_token, undefined);
  assert.equal(b.value('orionconnected.com'), 'out');
  // the module: end is the sign-out, with exactly this cookie
  assert.equal(S.outCookieFor('yul.orionconnected.ca'), NAME + '=out; Domain=orionconnected.ca; Path=/; Max-Age=34560000; Secure; SameSite=Strict');
  assert.match(AUTH, /function logout\(\) \{\s*clearToken\(\);/);
  assert.match(AUTH, /if \(window\.fidsSignIn\) \{ if \(dead\) window\.fidsSignIn\.drop\(dead\); else window\.fidsSignIn\.end\(\); \}/);
});

/** The two dead-token rescues of fids-core.js, real code, on a loaded page. */
function coreOn(r) {
  let shown = 0;
  const api = new Function('localStorage', 'sessionStorage', 'showLoginModal', 'Auth', 'fidsSignIn',
    lift(CORE, '_fidsTokenExpired') + '\n' + lift(CORE, '_fidsSaveAuthRescue') + '\n' + lift(CORE, '_fidsAuthToken')
    + '\nreturn { rescue: _fidsSaveAuthRescue, token: _fidsAuthToken };')(r.win.localStorage, r.win.sessionStorage, () => { shown++; }, undefined, r.S);
  return Object.assign(api, { shown: () => shown });
}
/** The 401 rescue of menu.js (_acFetch), real code, on a loaded page; every request answers 401. */
function menuOn(r) {
  return new Function('localStorage', 'sessionStorage', 'showLoginModal', 'Auth', 'fidsSignIn', 'fetch', '_acFlash', 'atob',
    lift(MENU, '_acGetToken') + '\n' + lift(MENU, '_acFetch') + '\nreturn _acFetch;')(r.win.localStorage, r.win.sessionStorage, () => {}, undefined, r.S, async () => ({ status: 401 }), () => {}, atob);
}

test('every dead-token rescue takes the dead token out of the cookie as well', async () => {
  const gone = NAME + '=; Domain=orionconnected.com; Path=/; Max-Age=0; Secure; SameSite=Strict';
  const paths = {
    'fids-core.js _fidsAuthToken (the read path)': (r) => { assert.equal(coreOn(r).token(), null); },
    'fids-core.js _fidsSaveAuthRescue (a 401 on a save)': (r) => { assert.equal(coreOn(r).rescue({ status: 401 }), true); },
    'menu.js _acFetch (a 401 on a menu save)': async (r) => { await menuOn(r)('https://proxy.test/x', {}); },
    'auth.js loadToken (the opener and the picker)': (r) => { assert.equal(authOn(r).init(), false); }
  };
  for (const [name, run] of Object.entries(paths)) {
    // the token dies while the page is open: storage and the cookie both hold it
    let b = browser();
    let r = load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: DEAD, fids_user: USER }, session: { fids_token: DEAD, fids_user: USER } });
    b.kept.push({ name: NAME, value: DEAD, domain: 'orionconnected.com' });
    b.writes.length = 0;
    await run(r);
    assert.deepEqual([r.local.fids_token, r.local.fids_user, r.tab.fids_token, r.tab.fids_user], [undefined, undefined, undefined, undefined], name);
    assert.deepEqual(b.writes.map((w) => w.text), [gone], name + ': the cookie that held it goes');
    assert.equal(b.value('orionconnected.com'), null, name);
    // a newer sign-in made on another address meanwhile is not ended by this old tab
    b = browser();
    r = load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: DEAD, fids_user: USER } });
    load('https://yul.orionconnected.com/fids', b).S.keep(NEWER, USER);
    b.writes.length = 0;
    await run(r);
    assert.equal(r.local.fids_token, undefined, name);
    assert.deepEqual(b.writes, [], name + ': the newer sign-in stays');
    assert.equal(load('https://yqm.orionconnected.com/fids', b).local.fids_token, NEWER, name + ': and this origin takes it at its next load');
    // a dead token is no sign-out of the zone: a live sign-in held only on another origin is not ended
    b = browser();
    r = load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: DEAD, fids_user: USER } });
    await run(r);
    assert.equal(r.local.fids_token, undefined, name);
    assert.equal(b.value('orionconnected.com'), null, name + ': no signed-out mark');
    assert.equal(load('https://fids.orionconnected.com/fids?ap=YQM', b, { local: { fids_token: LIVE } }).local.fids_token, LIVE, name);
    // off our zones the rescue is what it always was: storage only
    b = browser();
    r = load('http://localhost:8080/fids.html', b, { local: { fids_token: DEAD, fids_user: USER } });
    await run(r);
    assert.equal(r.local.fids_token, undefined, name);
    assert.deepEqual(b.writes, [], name + ': no cookie off the zones');
  }
  // a live token is not a dead one: none of the rescues touches it or the cookie
  const b = browser();
  const r = load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: LIVE, fids_user: USER } });
  b.writes.length = 0;
  assert.equal(coreOn(r).token(), LIVE);
  assert.equal(coreOn(r).rescue({ status: 401 }), false);
  await menuOn(r)('https://proxy.test/x', {});
  assert.equal(authOn(r).init(), true);
  assert.deepEqual(b.writes, []);
  assert.equal(r.local.fids_token, LIVE);
});

test('every place that clears the sign-in tells the module: no sign-out path is left out', () => {
  // each removal of fids_token from storage, outside the module, is followed by the call
  for (const [name, src] of [['js/fids-core.js', CORE], ['js/menu.js', MENU]]) {
    const lines = src.split('\n');
    const at = lines.map((l, i) => (/sessionStorage\.removeItem\('fids_token'\)/.test(l) ? i : -1)).filter((i) => i >= 0);
    assert.ok(at.length >= 1, name);
    for (const i of at) {
      assert.match(lines.slice(i + 1, i + 5).join('\n'), /try \{ if \(typeof fidsSignIn !== 'undefined' && fidsSignIn\) fidsSignIn\.drop\((tok|_t \|\| null)\); \} catch \(e\) \{\}/, name + ':' + (i + 1));
    }
  }
  assert.equal((CORE.match(/sessionStorage\.removeItem\('fids_token'\)/g) || []).length, 2, 'the two rescues of fids-core.js');
  assert.equal((MENU.match(/sessionStorage\.removeItem\('fids_token'\)/g) || []).length, 1, 'the one of menu.js');
  assert.equal((AUTH.match(/removeItem\(TOKEN_KEY\)/g) || []).length, 2, 'auth.js clears in clearToken only');
  assert.equal((AUTH.match(/clearToken\(/g) || []).length, 3, 'clearToken: defined once, called by loadToken (a dead token) and logout');
  assert.match(AUTH, /clearToken\(stored\);/);
  // and no other file clears it at all
  const others = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'fids-current', 'js')).filter((n) => n.endsWith('.js')).map((n) => 'js/' + n)
    .concat(fs.readdirSync(path.join(ROOT, 'fids-current')).filter((n) => n.endsWith('.html')))) {
    if (/removeItem\((?:'fids_token'|TOKEN_KEY)/.test(rd(f))) others.push(f);
  }
  assert.deepEqual(others.sort(), ['js/auth.js', 'js/fids-core.js', 'js/host-airport.js', 'js/menu.js']);
  // the Logout button of the board menu is a sign-out, not a rescue: it ends (the test below)
  assert.equal((MENU.match(/localStorage\.removeItem\('fids_token'\)/g) || []).length, 2, 'the rescue of menu.js, and menuLogout');
});

/** Every .js and .html file of the site, as [path, text]. */
function siteFiles() {
  const out = [];
  const walk = (dir) => {
    for (const n of fs.readdirSync(path.join(ROOT, 'fids-current', dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, n.name);
      if (n.isDirectory()) walk(rel);
      else if (/\.(js|html)$/.test(n.name)) out.push([rel, rd(rel)]);
    }
  };
  walk('');
  return out;
}
/** The Logout button of the board menu (menu.js menuLogout), real code, pressed on a loaded page. */
function pressMenuLogout(r, opts) {
  const o = opts || {};
  const went = [];
  const tab = r.win.sessionStorage;
  tab.clear = () => { for (const k of Object.keys(tab._s)) delete tab._s[k]; };
  new Function('window', 'localStorage', 'sessionStorage', 'closeOverlayMenu', 'fidsSignIn', lift(MENU, 'menuLogout') + '\nmenuLogout();')(
    { location: { set href(to) { went.push(to); } } }, r.win.localStorage, tab, o.menuThrows ? () => { throw new Error('no menu'); } : () => {}, o.noModule ? undefined : r.S);
  return went;
}
const OUT_COM = NAME + '=out; Domain=orionconnected.com; Path=/; Max-Age=34560000; Secure; SameSite=Strict';

test('every control that says it signs out ends the sign-in on the whole zone: the picker, and the Logout button of the board menu', () => {
  // ── the controls there are: every function named for a sign-out, in every file of the site ──
  const named = new Set(), handlers = [];
  for (const [rel, text] of siteFiles()) {
    for (const m of text.matchAll(/function\s+(\w*(?:log_?out|sign_?out|log_?off|sign_?off)\w*)\s*\(/gi)) named.add(rel + ' ' + m[1]);
    for (const m of text.matchAll(/\son\w+="([^"]*(?:log_?out|sign_?out|log_?off|sign_?off|goBack)[^"]*)"/gi)) handlers.push(rel + ' ' + m[1]);
  }
  assert.deepEqual([...named].sort(), ['js/auth.js logout', 'js/menu.js menuLogout', 'picker.html doLogout']);
  assert.deepEqual(handlers.sort(), ['menu.html menuLogout()', 'picker.html doLogout();return false;', 'picker.html goBack()']);
  // and every label that offers one is on one of them
  const labelled = siteFiles().filter(([rel, text]) => /\.html$/.test(rel) && />[^<]*(?:log\s?out|sign\s?out|log\s?off|d[ée]connexion|se d[ée]connecter)[^<]*</i.test(text)).map(([rel]) => rel);
  assert.deepEqual(labelled.sort(), ['menu.html', 'picker.html']);
  assert.match(rd('menu.html'), /<button class="sm-btn sm-btn-danger sm-btn-sm" onclick="menuLogout\(\)">Logout<\/button>/);
  const PICKER = rd('picker.html');
  assert.match(PICKER, /<a href="#" onclick="doLogout\(\);return false;">LOGOUT<\/a>/);
  // the picker: Logout, Back and Escape are all auth.js logout, which is clearToken() and so fidsSignIn.end()
  assert.match(lift(PICKER, 'doLogout'), /^function doLogout\(\) \{\s*Auth\.logout\(\);/);
  assert.match(lift(PICKER, 'goBack'), /^function goBack\(\) \{\s*Auth\.logout\(\);/);
  assert.match(PICKER, /if \(e\.key === 'Escape'\) goBack\(\);/);
  assert.match(lift(AUTH, 'logout'), /^function logout\(\) \{\s*clearToken\(\);/);
  // auth.js is on the opener and the picker only: on a board, the Auth.logout() of a dead-token rescue is nothing
  const withAuth = siteFiles().filter(([rel, text]) => /\.html$/.test(rel) && /js\/auth\.js/.test(text)).map(([rel]) => rel);
  assert.deepEqual(withAuth.sort(), ['index.html', 'picker.html']);

  // ── the Logout button of the board menu, pressed by an admin signed in on yqm ──
  const src = lift(MENU, 'menuLogout');
  assert.ok(src.indexOf('fidsSignIn.end()') > 0 && src.indexOf('fidsSignIn.end()') < src.indexOf('sessionStorage.clear()'),
    'end() runs while the tab still holds the token: it writes the mark only when there is a sign-in to end');
  assert.match(src, /try \{ if \(typeof fidsSignIn !== 'undefined' && fidsSignIn && fidsSignIn\.end\) fidsSignIn\.end\(\); \} catch \(e\) \{\}\s*try \{ localStorage\.removeItem\('fids_token'\); localStorage\.removeItem\('fids_user'\); \} catch \(e\) \{\}\s*try \{ sessionStorage\.clear\(\); \} catch \(e\) \{\}\s*window\.location\.href = 'index\.html';/);
  let b = browser();
  let r = load('https://yqm.orionconnected.com/gids?gate=3', b, { local: { fids_token: LIVE, fids_user: USER }, session: { fids_token: LIVE, fids_user: USER, fids_mode: 'live' } });
  const yul = load('https://yul.orionconnected.com/fids', b);
  assert.equal(yul.local.fids_token, LIVE, 'the sign-in had travelled');
  b.writes.length = 0;
  assert.deepEqual(pressMenuLogout(r), ['index.html']);
  assert.deepEqual(b.writes.map((w) => w.text), [OUT_COM], 'the signed-out mark, and nothing else');
  assert.deepEqual([r.local.fids_token, r.local.fids_user, r.tab.fids_token, r.tab.fids_user], [undefined, undefined, undefined, undefined], 'the durable copy and the tab copy are both gone');
  assert.deepEqual(r.tab, {}, 'and the tab is cleared, as it always was');
  // the opener it goes to does not take the token back, and is signed out
  b.writes.length = 0;
  const opener = load('https://yqm.orionconnected.com/', b, { local: r.local });
  assert.equal(authOn(opener).init(), false);
  assert.deepEqual([opener.local.fids_token, opener.tab.fids_token], [undefined, undefined]);
  // every other address of the zone, which still holds the live token in its own storage, is signed out at its next load
  const again = load('https://yul.orionconnected.com/fids', b, { local: { fids_token: LIVE, fids_user: USER }, session: { fids_token: LIVE, fids_user: USER } });
  assert.deepEqual([again.local.fids_token, again.tab.fids_token], [undefined, undefined]);
  assert.deepEqual(b.writes, [], 'the mark stays; nothing is written back');
  assert.equal(b.value('orionconnected.com'), 'out');
  // the token only in the durable copy (a tab opened later): the same
  b = browser();
  r = load('https://fids.orionconnected.com/fids?ap=YQM', b, { local: { fids_token: LIVE, fids_user: USER } });
  b.writes.length = 0;
  pressMenuLogout(r, { menuThrows: true });
  assert.deepEqual(b.writes.map((w) => w.text), [OUT_COM], 'a menu that will not close does not stop the sign-out');
  assert.deepEqual([r.local.fids_token, r.local.fids_user], [undefined, undefined]);
  // where the module is absent, both copies are removed here
  b = browser();
  r = load('https://yqm.orionconnected.com/fids', b, { local: { fids_token: LIVE, fids_user: USER }, session: { fids_token: LIVE, fids_user: USER } });
  b.writes.length = 0;
  assert.deepEqual(pressMenuLogout(r, { noModule: true }), ['index.html']);
  assert.deepEqual([r.local.fids_token, r.local.fids_user, r.tab.fids_token, r.tab.fids_user], [undefined, undefined, undefined, undefined]);
  assert.deepEqual(b.writes, []);
  // off our zones (a preview, a local page): storage only, no cookie
  for (const url of ['https://zone-sign-in-fids.example.workers.dev/fids?ap=YUL', 'http://localhost:8080/fids.html']) {
    b = browser();
    r = load(url, b, { local: { fids_token: LIVE, fids_user: USER }, session: { fids_token: LIVE } });
    pressMenuLogout(r);
    assert.deepEqual([r.local.fids_token, r.local.fids_user, r.tab.fids_token], [undefined, undefined, undefined], url);
    assert.deepEqual(b.writes, [], url);
  }
});

test('a visitor is given no cookie: a sign-out with nothing to end (Back or Escape on the picker) writes nothing', () => {
  // the picker is open to anyone (the Demo button of the opener), and Back and Escape run the sign-out
  let b = browser();
  let r = load('https://fids.orionconnected.com/picker', b);
  const Auth = authOn(r);
  assert.equal(Auth.init(), false, 'a visitor');
  Auth.logout();
  assert.deepEqual(b.writes, [], 'no cookie write at all');
  assert.deepEqual(b.kept, [], 'and no cookie');
  r.S.end();
  r.S.end();
  assert.deepEqual(b.writes, []);
  assert.deepEqual(pressMenuLogout(load('https://yqm.orionconnected.com/fids', b)), ['index.html']);
  assert.deepEqual(b.writes, [], 'nor from the Logout button of the menu');
  for (const host of ['www.orionconnected.com', 'orionconnected.ca', 'yul.orionconnected.ca', 'yqm.orionconnected.app', 'localhost']) {
    load('https://' + host + '/picker', b).S.end();
  }
  assert.deepEqual(b.writes, []);
  // signed out already and nothing held: the mark is left as it is, not written again
  b = browser();
  b.kept.push({ name: NAME, value: 'out', domain: 'orionconnected.com' });
  r = load('https://fids.orionconnected.com/picker', b);
  r.S.end();
  assert.deepEqual(b.writes, []);
  assert.equal(b.value('orionconnected.com'), 'out');
  // there IS something to end when this origin holds a token (either copy)...
  for (const held of [{ local: { fids_token: LIVE, fids_user: USER } }, { session: { fids_token: LIVE } }]) {
    b = browser();
    r = load('https://fids.orionconnected.com/picker', b, held);
    b.writes.length = 0;
    r.S.end();
    assert.deepEqual(b.writes.map((w) => w.text), [OUT_COM]);
    assert.deepEqual([r.local.fids_token, r.tab.fids_token], [undefined, undefined]);
  }
  // ...or when the cookie holds one this origin has not taken yet (signed in on another address since this page loaded)
  b = browser();
  r = load('https://fids.orionconnected.com/picker', b);
  load('https://yul.orionconnected.com/fids', b).S.keep(NEWER, USER);
  b.writes.length = 0;
  r.S.end();
  assert.deepEqual(b.writes.map((w) => w.text), [OUT_COM], 'signing out here ends the sign-in of the zone');
  // ...and a token held where the cookie cannot be written still leaves this origin clean
  b = browser({ refuse: true });
  r = load('https://fids.orionconnected.com/picker', b, { local: { fids_token: LIVE, fids_user: USER } });
  r.S.end();
  assert.deepEqual([r.local.fids_token, r.local.fids_user], [undefined, undefined]);
  // a page with no document at all does not throw
  r = load('https://fids.orionconnected.com/picker', null, { local: { fids_token: LIVE } });
  r.S.end();
  assert.equal(r.local.fids_token, undefined);
  // in the source: one place writes the mark, behind the question whether there was a sign-in
  assert.match(SRC, /function end\(\) \{\s*var had = false;\s*try \{ had = !!held\(\)\.token; \} catch \(e\) \{\}\s*if \(!had\) \{ try \{ var c = read\(jar\(\)\); had = !!\(c && c\.token\); \} catch \(e\) \{\} \}\s*wipe\(\);\s*if \(had\) bake\(outCookieFor\(host\(\)\)\);\s*\}/);
  assert.equal((SRC.match(/outCookieFor\(host\(\)\)/g) || []).length, 1);
});

// ── the order of things, and the address rule ──────────────────────────────

test('order: the sign-in is taken, or written, before the address rule reads admin and before the page moves', () => {
  // in the file: the module is defined and has arrived before the address rule exists
  const arriveAt = SRC.indexOf('try { arrive(); } catch (e) {}');
  const ruleAt = SRC.indexOf('function airportAddress(loc, ctx, hostAirport, realIata) {');
  const decideAt = SRC.indexOf('var r = window.__ocOpener === true ?');
  assert.ok(arriveAt > 0 && ruleAt > arriveAt && decideAt > ruleAt);
  assert.ok(SRC.indexOf('window.fidsSignIn = {') < arriveAt);
  assert.match(SRC.slice(decideAt, decideAt + 700), /admin: adminNow\(\),\s*travels: travelsNow\(\),/);
  // a sign-in made on yqm, a page that must move: at the move this origin already holds the token
  let b = browser();
  load('https://yqm.orionconnected.com/fids', b).S.keep(LIVE, USER);
  let r = load('https://fids.orionconnected.com/gids?ap=YUL&gate=128', b);
  assert.deepEqual(r.went, ['https://yul.orionconnected.com/gids?gate=128']);
  assert.deepEqual([r.atMove[0].local, r.atMove[0].tab], [LIVE, LIVE], 'adopted before the decision');
  // a sign-in from before the cookie, held only here: at the move the cookie is already written
  b = browser();
  r = load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128', b, { local: { fids_token: LIVE, fids_user: USER } });
  assert.deepEqual(r.went, ['https://yul.orionconnected.com/gids?gate=128']);
  assert.equal(r.atMove[0].jar, NAME + '=' + KEPT, 'written first, then moved');
  // and it arrives signed in, on an address that stays: no loop
  r = load(r.went[0], b);
  assert.deepEqual(r.went, []);
  assert.deepEqual([r.local.fids_token, r.tab.fids_token, r.local.fids_user], [LIVE, LIVE, USER]);
  assert.equal(r.S.travels(), true);
  assert.deepEqual(load(r.win.location.href, b, { local: r.local, session: r.tab }).went, [], 'nor on a reload');
  // where the cookie cannot be written the admin does not move at all: never a move that signs out
  for (const jar of [browser({ refuse: true }), null]) {
    r = load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128', jar, { local: { fids_token: LIVE, fids_user: USER } });
    assert.deepEqual(r.went, [], jar ? 'cookies refused' : 'no document');
    assert.equal(r.local.fids_token, LIVE);
    assert.equal(r.win.fidsBoardUrl('YUL', 'gids', { gate: '128' }), 'gids.html?ap=YUL&gate=128');
  }
  // an expired sign-in is no travelling sign-in: the page stays for the rescue of the board, and no cookie is made
  b = browser();
  r = load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128', b, { local: { fids_token: DEAD } });
  assert.deepEqual(r.went, []);
  assert.deepEqual(b.writes, []);
});

test('the other exceptions are untouched for an admin whose sign-in travels: a frame, a registered screen, a kiosk, a preview, .app', () => {
  const b = browser();
  load('https://yqm.orionconnected.com/fids', b).S.keep(LIVE, USER);
  const held = { local: { fids_token: LIVE, fids_user: USER } };
  for (const url of ['https://yqm.orionconnected.com/gids?screen=ABCDEF&ap=YUL', 'https://yqm.orionconnected.com/fids?stream=1&ap=YUL',
                     'https://yqm.orionconnected.com/fids?yt=1&ap=YUL', 'https://yqm.orionconnected.com/fids?compact&ap=YUL']) {
    const r = load(url, b, held);
    assert.deepEqual(r.went, [], url);
    assert.equal(r.win.fidsBoardUrl('YUL', 'gids', { gate: '128' }), 'gids.html?ap=YUL&gate=128', url + ': pinned, its links stay');
  }
  let r = load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128', b, Object.assign({ framed: true }, held));
  assert.deepEqual(r.went, [], 'a frame belongs to its parent');
  assert.equal(r.win.fidsBoardUrl('YUL', 'gids', { gate: '128' }), 'gids.html?ap=YUL&gate=128');
  // a phone: asked where a visitor is asked, on the address of the airport
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  r = load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128', b, Object.assign({ ua: IPHONE }, held));
  assert.deepEqual(r.went, ['https://yul.orionconnected.com/?ap=YUL&next=' + encodeURIComponent('/gids?gate=128')]);
  assert.deepEqual(r.went, load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128', browser(), { ua: IPHONE }).went, 'the same as a visitor on a phone');
  r = load('https://yqm.orionconnected.com/gids?ap=YUL&gate=128&nomobile=1', b, Object.assign({ ua: IPHONE }, held));
  assert.deepEqual(r.went, ['https://yul.orionconnected.com/gids?gate=128&nomobile=1']);
  // .app: the app only. A board page goes to /app on the same host, as for anyone, and no sign-in is put there
  const app = browser();
  r = load('https://yqm.orionconnected.app/gids?gate=3', app, held);
  assert.deepEqual(r.went, ['/app?ap=YQM&gate=3&screen=gate']);
  assert.deepEqual(app.writes, []);
});

// ── what it must never do ──────────────────────────────────────────────────

test('the token is never in an address, a query or a hash: every string the module and the address rule build', () => {
  const secrets = [LIVE, NEWER].flatMap((t) => t.split('.').concat([t, encodeURIComponent(t)])).concat([encodeURIComponent(USER), 'tester', 'Test%20Admin']);
  const built = [];
  const b = browser();
  const pages = ['https://yqm.orionconnected.com/gids?ap=YUL&gate=128', 'https://fids.orionconnected.com/fids', 'https://fids.orionconnected.com/fids?ap=YHZ&mode=live#top',
                 'https://yul.orionconnected.com/gids?gate=128', 'https://www.orionconnected.com/bids?ap=YQM&belt=2', 'https://yqm.orionconnected.ca/fids?ap=YUL',
                 'https://met.orionconnected.com/fids', 'https://yqm.orionconnected.com/fids?stream=1', 'https://yqm.orionconnected.app/gids?gate=3',
                 'https://orionconnected.app/', 'http://localhost:8080/gids.html?ap=YUL', 'https://zone-sign-in-fids.example.workers.dev/fids?ap=YUL'];
  const UAS = [undefined, 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'];
  for (const ua of UAS) {
    for (const url of pages) {
      for (const held of [{ local: { fids_token: LIVE, fids_user: USER } }, { session: { fids_token: NEWER, fids_user: USER } }, {}]) {
        const r = load(url, b, Object.assign({ ua }, held));
        built.push(...r.went);
        if (r.win.__ocArrival) built.push(String(r.win.__ocArrival.to));
        if (r.win.__ocAddressMove) built.push(String(r.win.__ocAddressMove));
        for (const page of ['fids', 'gids', 'bids']) {
          built.push(r.win.fidsBoardUrl('YUL', page, { gate: '128', mode: 'live' }), r.win.fidsBoardUrl('YQM', page, 'belt=2'), r.win.fidsBoardUrl('', page, null));
        }
        const loc = { hostname: r.win.location.hostname, pathname: r.win.location.pathname, search: r.win.location.search, hash: r.win.location.hash };
        for (const ctx of [{ admin: true, travels: true }, { admin: true }, { phone: true, admin: true, travels: true }]) {
          built.push(r.win.fidsAirportAddress(loc, Object.assign({ fallback: 'YQM' }, ctx), r.win.fidsHostAirport, r.win.fidsRealIata));
          built.push(r.win.fidsArrival(loc, Object.assign({ fallback: 'YQM' }, ctx), r.win.fidsHostAirport, r.win.fidsRealIata).to);
          built.push(r.win.fidsAppAddress(loc, r.win.fidsHostAirport, r.win.fidsRealIata));
        }
        r.S.keep(NEWER, USER);
        built.push(r.win.fidsBoardUrl('YHZ', 'gids', { gate: '3' }));
        // nothing but fidsSignIn carries the token on the window, and the tab airport memory never does
        for (const k of Object.keys(r.win)) {
          if (typeof r.win[k] === 'string') built.push(r.win[k]);
        }
        built.push(String(r.tab.fids_airport || ''), String(r.tab.oc_board_tab || ''));
      }
    }
  }
  assert.ok(built.filter(Boolean).length > 300, 'the scan saw the strings it is about');
  assert.ok(built.some((s) => s === 'https://yul.orionconnected.com/gids?gate=128'), 'the move of a signed-in admin is among them');
  for (const s of built) {
    for (const secret of secrets) assert.ok(!String(s).includes(secret), 'a built string carries part of the sign-in: ' + String(s).slice(0, 80));
  }
  // the only strings that hold the token are the cookie and the two storage copies
  for (const w of b.writes) assert.match(w.text, new RegExp('^' + NAME + '=[^;]*; Domain=orionconnected\\.(com|ca); Path=/; Max-Age=\\d+; Secure; SameSite=Strict$'));
  assert.ok(b.writes.length > 10);
});

test('in the source: one module touches the cookie, and nothing of it reaches an address, a log or the server', () => {
  const from = SRC.indexOf(' * THE SIGN-IN TRAVELS WITH THE ADMIN ACROSS THE ADDRESSES OF A ZONE');
  const codeFrom = SRC.indexOf('(function () {', from);
  const to = SRC.indexOf(' * EVERY BOARD LIVES ON ITS AIRPORT ADDRESS');
  assert.ok(from > 0 && codeFrom > from && to > codeFrom);
  const MOD = SRC.slice(codeFrom, SRC.lastIndexOf('})();', to) + 5);
  const REST = SRC.slice(0, codeFrom) + SRC.slice(codeFrom + MOD.length);
  // the module: the hostname is all it reads of the address, and it writes to the cookie and the two stores only
  assert.deepEqual(MOD.match(/window\.location\.\w+/g), ['window.location.hostname']);
  assert.doesNotMatch(MOD, /console\.|href|\.search|\.hash|pathname|replace\(\s*['"`h]|assign\(|fetch\(|XMLHttpRequest|sendBeacon|postMessage|history\.|\bopen\(|navigator|innerHTML|\.title/);
  assert.equal((MOD.match(/window\.document\.cookie/g) || []).length, 2, 'one read (jar) and one write (bake)');
  assert.match(MOD, /function jar\(\) \{ try \{ return String\(window\.document\.cookie \|\| ''\); \} catch \(e\) \{ return ''; \} \}/);
  assert.match(MOD, /function bake\(cookie\) \{ try \{ if \(cookie\) window\.document\.cookie = cookie; \} catch \(e\) \{\} \}/);
  // every cookie it bakes comes from one of three builders, all with the one attribute list
  assert.deepEqual((MOD.match(/bake\(([a-zA-Z]+)For\(/g) || []).sort(), ['bake(cookieFor(', 'bake(cookieFor(', 'bake(goneCookieFor(', 'bake(goneCookieFor(', 'bake(outCookieFor(']);
  assert.equal((MOD.match(/bake\(/g) || []).length, 6, 'the five calls and the function itself');
  assert.match(MOD, /function attrs\(zone, age\) \{\s*return '; Domain=' \+ zone \+ '; Path=\/; Max-Age=' \+ age \+ '; Secure; SameSite=Strict';\s*\}/);
  assert.match(MOD, /var ZONES = \['orionconnected\.com', 'orionconnected\.ca'\];/, '.app is not a zone of the sign-in');
  // the rest of the file: the address rule knows only WHETHER a token is held, never the token
  assert.doesNotMatch(REST.replace(/\/\*[\s\S]*?\*\//g, ''), /\.cookie/, 'no other code of the file touches a cookie');
  const tokenReads = REST.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => /fids_token|fids_user|fidsSignIn/.test(l) && !/^\s*\/\//.test(l)).map((l) => l.trim());
  assert.deepEqual(tokenReads, [
    "try { return !!(window.localStorage.getItem('fids_token') || window.sessionStorage.getItem('fids_token')); } catch (e) { return false; }",
    'try { return !!(window.fidsSignIn && window.fidsSignIn.travels()); } catch (e) { return false; }'
  ]);
  // in every file of the site, document.cookie is this module and nothing else
  const touching = [];
  const walk = (dir) => {
    for (const n of fs.readdirSync(path.join(ROOT, 'fids-current', dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, n.name);
      if (n.isDirectory()) { if (/^(js|studio|data)$/.test(rel)) walk(rel); continue; }
      if (/\.(js|html)$/.test(n.name) && /\.cookie\b/.test(rd(rel).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$|<!--[\s\S]*?-->/gm, ''))) touching.push(rel);
    }
  };
  walk('');
  assert.deepEqual(touching, ['js/host-airport.js']);
  // the server: nothing about the worker or the header changes. The boards still send the bearer header, to the proxy host
  assert.match(MENU, /if \(token\) opts\.headers\['Authorization'\] = 'Bearer ' \+ token;/);
  assert.match(AUTH, /'Authorization': `Bearer \$\{token\}`/);
  const WORKER = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');
  assert.doesNotMatch(WORKER, /fids_signin/, 'the server does not know this cookie exists');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'worker-entry.js'), 'utf8'), /fids_signin/);
});

// ── the server ─────────────────────────────────────────────────────────────
// The browser sends the cookie with every request to the zone, so both
// Workers receive it. Neither may read it: the Authorization bearer header to
// the proxy is the only thing the server trusts. A Worker that took the
// sign-in from a cookie would be open to requests forged from another page
// of the zone, and one that logged request headers would write the token
// down. The two text checks above (the name of the cookie) would see neither.

const WORKER_FILES = ['worker-entry.js'].concat(fs.readdirSync(path.join(ROOT, 'workers')).filter((n) => n.endsWith('.js')).map((n) => 'workers/' + n));
const workerSrc = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
/** The lines of a file that are code: not blank, not a // comment. */
const codeLines = (text) => text.split('\n').map((l, i) => ({ n: i + 1, l })).filter((x) => x.l.trim() && !/^\s*\/\//.test(x.l));

test('the server, in the source: no Worker reads a Cookie header, the gate reads Authorization only, no log is handed a request header', () => {
  assert.deepEqual(WORKER_FILES, ['worker-entry.js', 'workers/fids-proxy.js'], 'the Workers there are');
  const ENTRY = workerSrc('worker-entry.js'), PROXY = workerSrc('workers/fids-proxy.js');

  // the word cookie, in any case, in code: only the fixed cookie two airport sites ask of every visitor, SENT, never read
  const FIXED = /^\s*const t = await fetchAuthorityText\("(dca|iad)\/all", "https:\/\/www\.fly(reagan|dulles)\.com\/arrivals-and-departures\/json", '"flightnumber"', 90, \{ headers: \{ "Cookie": "flight-info=1", "User-Agent": MWAA_UA \} \}\);$/;
  for (const f of WORKER_FILES) {
    const hits = codeLines(workerSrc(f)).filter((x) => /cookie/i.test(x.l));
    for (const x of hits) assert.match(x.l, FIXED, f + ':' + x.n + ' names a cookie');
    assert.equal(hits.length, f === 'workers/fids-proxy.js' ? 2 : 0, f);
  }

  // the board Worker reads no header of the request at all; it hands the request, whole, to our own two layers only
  assert.doesNotMatch(ENTRY, /request\s*\.\s*headers|headers\s*:\s*request\b|\.\.\.\s*request\b/);
  assert.deepEqual([...new Set(ENTRY.match(/\b[A-Za-z_$][\w$]*\.headers\b/g))].sort(), ['img.headers', 'r.headers', 'res.headers'], 'answers only: an upstream, a picture, an asset');
  assert.deepEqual(codeLines(ENTRY).filter((x) => /\brequest\b/.test(x.l)).map((x) => x.l.trim()), [
    'async function homePage(request, url, page, env) {',
    'const res = await env.ASSETS.fetch(new Request(new URL(page + url.search, url.origin), request));',
    'async fetch(request, env, ctx) {',
    'const url = new URL(request.url);',
    'if (home) return homePage(request, url, home, env);',
    'return env.ASSETS.fetch(request);',
    'return inert(await proxy.fetch(request, env, ctx));',
    'const res = await env.ASSETS.fetch(request);'
  ], 'every line of code that names the request: its address is read, and it goes to the asset server or the bundled proxy');

  // the proxy reads these headers of a request and no other, each by its literal name
  const reads = {};
  for (const m of PROXY.matchAll(/\brequest\s*\.\s*headers\b(\.get\("([A-Za-z-]+)"\))?/g)) {
    assert.ok(m[2], 'request.headers is used for anything but .get("<a literal name>"): ' + PROXY.slice(m.index, m.index + 60));
    reads[m[2]] = (reads[m[2]] || 0) + 1;
  }
  assert.deepEqual(reads, { 'Content-Type': 4, 'Origin': 3, 'CF-Connecting-IP': 1, 'Content-Length': 1, 'X-Relay-Key': 1, 'Authorization': 1, 'Accept-Language': 1 });
  assert.deepEqual([...new Set(PROXY.match(/\b[A-Za-z_$][\w$]*\.headers\b/g))].sort(), ['fileRes.headers', 'hit.headers', 'opts.headers', 'r.headers', 'request.headers', 'response.headers'],
    'no request under another name: the rest are answers, and the options of an outgoing fetch');
  assert.doesNotMatch(PROXY, /(?<!async )\bfetch\(\s*request\b|new Request\([^()]*,\s*request\b|headers\s*:\s*request\b|\.\.\.\s*request\b/, 'and the request is never passed on to another host');

  // the gate: the bearer header, and nothing else, is what is verified
  assert.match(PROXY, /if \(path\.startsWith\("\/auth\/users"\) \|\| path\.startsWith\("\/api\/"\)\) \{\s*const authHeader = request\.headers\.get\("Authorization"\);\s*if \(!authHeader \|\| !authHeader\.startsWith\("Bearer "\)\) \{\s*return jsonResponse\(\{ error: "Authentication required" \}, 401, origin\);\s*\}\s*const token = authHeader\.replace\("Bearer ", ""\);\s*const payload = await verifyJwt\(token, env\.JWT_SECRET\);\s*if \(!payload\) \{\s*return jsonResponse\(\{ error: "Invalid or expired token" \}, 401, origin\);\s*\}/);
  assert.equal((PROXY.match(/\bverifyJwt\(/g) || []).length, 2, 'verifyJwt: defined once, called once, by the gate');
  assert.equal((PROXY.match(/\bauthHeader\b/g) || []).length, 4, 'and the header it reads is used there only');

  // no log line is handed a request, its headers, or anything named for a credential
  for (const f of WORKER_FILES) {
    const lines = workerSrc(f).split('\n');
    let calls = 0;
    lines.forEach((l, i) => {
      if (/^\s*\/\//.test(l) || !/\bconsole\s*\.\s*\w+\s*\(/.test(l)) return;
      calls++;
      const call = lines.slice(i, i + 4).join('\n');
      const end = call.indexOf(');');
      assert.doesNotMatch(end < 0 ? call : call.slice(0, end), /headers|\brequest\b|cookie|authorization|\btoken\b|password|secret/i, f + ':' + (i + 1) + ' logs something of a request');
    });
    assert.equal(calls, f === 'worker-entry.js' ? 2 : 15, f + ': a new log line is read here before it is counted');
  }
  assert.doesNotMatch(ENTRY + PROXY, /\bconsole\s*\[|=\s*console\b|\(console\b/, 'console is called by name, so the scan above sees every call');
});

/** A token signed as the proxy signs one, with a secret made up for this test. */
function signedToken(secret, payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' }), body = b64(payload);
  return head + '.' + body + '.' + require('node:crypto').createHmac('sha256', secret).update(head + '.' + body).digest('base64url');
}

test('the server, run: a token that would be accepted as a bearer header opens nothing as a cookie, and nothing of a request is logged or passed on', async () => {
  const SECRET = 'made-up-secret-' + NOW;
  const GOOD = signedToken(SECRET, { sub: 'tester', role: 'admin', exp: SEC + 600 });
  const admin = JSON.stringify({ role: 'admin', displayName: 'Test Admin', createdAt: '2026-01-01T00:00:00.000Z' });
  const puts = [];
  const kv = {
    get: async (k) => (k === 'user:admin' || k === 'user:tester' ? admin : null), put: async (k) => { puts.push(k); }, delete: async (k) => { puts.push('delete ' + k); },
    list: async () => ({ keys: [{ name: 'user:tester' }] }), getWithMetadata: async () => ({ value: null, metadata: null })
  };
  const env = { JWT_SECRET: SECRET, FIDS_USERS: kv, FIDS_LIVE_FLIGHTS: kv, CITY_BG_CACHE: kv,
    ASSETS: { fetch: async () => new Response('asset', { headers: { 'Content-Type': 'text/plain' } }) }, FIDS_ASSETS: { get: async () => null }, FIDS_PRIVATE: { get: async () => null } };
  const realFetch = globalThis.fetch, realCaches = globalThis.caches, realConsole = {};
  const upstream = [], logged = [];
  globalThis.fetch = async (u, init) => {
    const h = new Headers(u instanceof Request ? u.headers : undefined);
    if (init && init.headers) new Headers(init.headers).forEach((v, k) => h.set(k, v));
    upstream.push(String(u instanceof Request ? u.url : u) + ' ' + [...h].map(([k, v]) => k + '=' + v).join('; '));
    return new Response('{"hits":[],"properties":{"timeseries":[]}}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  for (const k of ['log', 'warn', 'error', 'info', 'debug']) { realConsole[k] = console[k]; console[k] = (...a) => { logged.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }; }
  try {
    const proxy = (await import(path.join(ROOT, 'workers', 'fids-proxy.js'))).default;
    const entry = (await import(path.join(ROOT, 'worker-entry.js'))).default;
    const ctx = { waitUntil() {} };
    // the real proxy on its own address, and the copy bundled in the board Worker, which answers on a label of the zone
    const doors = [
      ['the proxy', (p, init) => proxy.fetch(new Request('https://fids-proxy.example.workers.dev' + p, init), env, ctx)],
      ['the bundled proxy on a label of the zone', (p, init) => entry.fetch(new Request('https://fids-proxy.orionconnected.com' + p, init), env, ctx)]
    ];
    const cookies = [NAME + '=' + GOOD, NAME + '=' + GOOD + '|' + encodeURIComponent(USER), 'fids_token=' + GOOD, 'token=' + GOOD + '; ' + NAME + '=' + GOOD, 'Authorization=Bearer ' + GOOD];
    for (const [name, ask] of doors) {
      // the token is a good one: as the bearer header it opens the door
      let res = await ask('/auth/users', { headers: { Authorization: 'Bearer ' + GOOD } });
      assert.equal(res.status, 200, name);
      assert.deepEqual(await res.json(), { users: [{ username: 'tester', role: 'admin', displayName: 'Test Admin', createdAt: '2026-01-01T00:00:00.000Z' }] });
      // the same token in a cookie, with no bearer header, is no sign-in: every guarded route, read or write
      for (const cookie of cookies) {
        for (const [method, p, body] of [['GET', '/auth/users'], ['POST', '/auth/users', '{"username":"made-up","password":"made-up","role":"admin"}'], ['DELETE', '/auth/users/tester'],
                                         ['PUT', '/api/airport-config/YQM', '{}'], ['POST', '/api/media-config', '{}'], ['GET', '/api/screens']]) {
          res = await ask(p, { method, body, headers: Object.assign({ Cookie: cookie }, body ? { 'Content-Type': 'application/json' } : {}) });
          assert.equal(res.status, 401, name + ': ' + method + ' ' + p + ' with only a cookie');
          assert.deepEqual(await res.json(), { error: 'Authentication required' });
        }
      }
      // a bearer header that is not a good token is refused, whatever the cookie says
      res = await ask('/auth/users', { headers: { Authorization: 'Bearer ' + signedToken('another-made-up-secret', { sub: 'tester', role: 'admin', exp: SEC + 600 }), Cookie: NAME + '=' + GOOD } });
      assert.equal(res.status, 401, name);
      assert.deepEqual(await res.json(), { error: 'Invalid or expired token' });
    }
    assert.deepEqual(puts, [], 'and nothing was written');

    // every route of the board Worker, asked with the cookie and the header: neither is logged, neither leaves for another host
    const paths = ['/', '/credits', '/fids', '/gids?ap=YUL&gate=128', '/a', '/s', '/t', '/o', '/mapcdn/leaflet.js', '/mapcdn/leaflet.css', '/mapcdn/leaflet-arc.js', '/wxdaily?location=46.1,-64.7', '/wxcurrent?location=46.1,-64.7',
      '/wxsun?location=46.1,-64.7', '/citypic?iata=YQM&q=Moncton', '/logoimg?u=' + encodeURIComponent('https://' + (/const LOGO_HOST = '([^']+)';/.exec(workerSrc('worker-entry.js')) || [])[1] + '/airports/yqm/logo.png'),
      '/miafids?direction=dep', '/maptiles/5/9/11.png', '/demtiles/5/9/11.png', '/tiles/osm/5/9/11.png', '/tiles/satellite/5/9/11.png', '/tiles/photo/YQM/14/1/1', '/fonts/Possibility-Bold-Web.woff2', '/wxradar/1/2/3.png',
      '/gids/ap=YUL', '/auth/users', '/api/dry-dock', '/health', '/stream/agent.sh'];
    upstream.length = 0; logged.length = 0;
    let asked = 0;
    for (const host of ['yqm.orionconnected.com', 'www.orionconnected.com', 'fids.orionconnected.ca', 'fids-proxy.orionconnected.com']) {
      for (const p of paths) {
        const res = await entry.fetch(new Request('https://' + host + p, { headers: { Cookie: NAME + '=' + GOOD + '|' + encodeURIComponent(USER), Authorization: 'Bearer ' + GOOD } }), Object.assign({ PIXABAY_KEY: 'made-up-key' }, env), ctx);
        await res.arrayBuffer();
        asked++;
      }
    }
    assert.equal(asked, 4 * paths.length);
    assert.ok(upstream.length > 40, 'the routes did reach for their upstreams (' + upstream.length + ')');
    const parts = GOOD.split('.').concat([encodeURIComponent(USER), 'Test%20Admin', NAME]);
    for (const line of upstream.concat(logged)) {
      for (const part of parts) assert.ok(!line.includes(part), 'part of the sign-in left the Worker: ' + line.slice(0, 90));
      assert.doesNotMatch(line, /cookie=|authorization=/i, 'a request header of the visitor was passed on: ' + line.slice(0, 90));
    }
  } finally {
    globalThis.fetch = realFetch;
    globalThis.caches = realCaches;
    for (const k of Object.keys(realConsole)) console[k] = realConsole[k];
  }
});

test('every page that reads the sign-in loads the module first', () => {
  const pages = fs.readdirSync(path.join(ROOT, 'fids-current')).filter((n) => n.endsWith('.html'))
    .concat(fs.readdirSync(path.join(ROOT, 'fids-current', 'studio')).filter((n) => n.endsWith('.html')).map((n) => 'studio/' + n));
  const readers = [];
  for (const page of pages) {
    const html = rd(page);
    const first = html.search(/fids_token|fids_user(?!_presets)|js\/auth\.js|js\/fids-core\.js|js\/menu\.js|js\/editor-roles\.js/);
    if (first < 0) continue;
    readers.push(page);
    const helper = html.search(/<script src="\/?js\/host-airport\.js\?v=\d+"><\/script>/);
    assert.ok(helper >= 0 && helper < first, page + ': host-airport.js (fidsSignIn) comes before anything that reads the sign-in');
  }
  assert.deepEqual(readers.sort(), ['bids.html', 'fids.html', 'gids.html', 'index.html', 'picker.html']);
  // .app: no page that is shown there reads the sign-in (app.html), so none is put there
  assert.doesNotMatch(rd('app.html'), /fids_token|fids_user(?!_presets)|js\/auth\.js|js\/fids-core\.js|js\/menu\.js/);
});
