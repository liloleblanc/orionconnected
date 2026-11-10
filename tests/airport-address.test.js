'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24144 — A BOARD LANDS ON ITS AIRPORT'S OWN ADDRESS, AND THE OLD BACKDROP
// SHOWS ONLY WHEN THE AIRPORT CHOSE IT.
//
//   fids.orionconnected.com/fids?ap=YYG  ->  https://yyg.orionconnected.com/fids
//
// localStorage is per origin, so one airport opened on two addresses kept two
// device copies of its settings. A device copy of the Customize field "Bottom
// of the board" (Classic) outranked the airport and showed the old backdrop
// on one address and not the other. Both halves are pinned here:
//   · airportAddress() in host-airport.js (pure), and its thin caller;
//   · _fidsAirportFloorOf() in fids-core.js and the device copy retired.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, 'fids-current', p), 'utf8');
const SRC = rd('js/host-airport.js');
const CORE = rd('js/fids-core.js');
const MENU = rd('js/menu.js');

/** Run host-airport.js against a stubbed window; returns the window and where it went. */
function load(opts) {
  const o = opts || {};
  const url = new URL(o.url || 'https://fids.orionconnected.com/credits');
  const went = [];
  const mem = (init) => {
    const s = Object.assign({}, init || {});
    return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } };
  };
  const win = {
    location: {
      hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash, href: url.href,
      replace: (to) => { went.push(to); }
    },
    navigator: { userAgent: o.ua || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15' },
    localStorage: mem(o.local),
    sessionStorage: mem(o.session)
  };
  win.self = win;
  win.top = o.framed ? {} : win;
  new Function('window', 'sessionStorage', SRC)(win, win.sessionStorage);
  return { win, went };
}

const { win: W } = load();
const addr = (url, ctx) => {
  const u = new URL(url);
  return W.fidsAirportAddress({ hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash },
    ctx || {}, W.fidsHostAirport, W.fidsRealIata);
};

test('the main sites send a board with ?ap= to its airport address', () => {
  for (const [from, to] of [
    ['https://fids.orionconnected.com/fids?ap=YYG', 'https://yyg.orionconnected.com/fids'],
    ['https://fids.orionconnected.com/fids.html?ap=yyg', 'https://yyg.orionconnected.com/fids.html'],
    ['https://fids.orionconnected.ca/gids?ap=YHZ&gate=3', 'https://yhz.orionconnected.ca/gids?gate=3'],
    ['https://fids.orionconnected.app/bids?belt=2&ap=YQM', 'https://yqm.orionconnected.app/bids?belt=2'],
    ['https://orionconnected.ca/fids?ap=YYG', 'https://yyg.orionconnected.ca/fids'],
    ['https://orionconnected.app/gids.html?ap=YUL&gate=A5#x', 'https://yul.orionconnected.app/gids.html?gate=A5#x'],
    ['https://FIDS.OrionConnected.com:443/fids?ap=%20yyg%20', 'https://yyg.orionconnected.com/fids'],
    ['https://fids.orionconnected.com/fids/?ap=YYG', 'https://yyg.orionconnected.com/fids/'],
    ['https://fids.orionconnected.com/fids?ap=CYQM', 'https://cyqm.orionconnected.com/fids']
  ]) {
    assert.equal(addr(from), to, from);
  }
});

test('every other query parameter, its order and its encoding, and the hash survive', () => {
  const from = 'https://fids.orionconnected.com/fids?mode=live&ap=YYG&nomobile=1&screen_x=1&gate=A%2012&belt=3'
    + '&holiday=harvest&holidayat=2026-10-12T10%3A00&wk=tile,hover&floor=classic&langs=fr,en#top';
  assert.equal(addr(from), 'https://yyg.orionconnected.com/fids?mode=live&nomobile=1&screen_x=1&gate=A%2012&belt=3'
    + '&holiday=harvest&holidayat=2026-10-12T10%3A00&wk=tile,hover&floor=classic&langs=fr,en#top');
  // a second ap= goes too; the first one decides
  assert.equal(addr('https://fids.orionconnected.com/gids?ap=YHZ&gate=4&ap=YYZ'), 'https://yhz.orionconnected.com/gids?gate=4');
});

test('an airport address with another airport in ?ap= goes to that airport', () => {
  assert.equal(addr('https://yqm.orionconnected.com/gids?ap=YHZ&gate=3'), 'https://yhz.orionconnected.com/gids?gate=3');
  assert.equal(addr('https://yyg.orionconnected.ca/fids?ap=yul&mode=live'), 'https://yul.orionconnected.ca/fids?mode=live');
  // the same airport stays: no hop for a link that already agrees with itself
  assert.equal(addr('https://yyg.orionconnected.com/fids?ap=YYG&mode=live'), '');
  assert.equal(addr('https://yyg.orionconnected.com/fids?ap=yyg'), '');
});

test('the display code MET: the address is yhu, and met reads back as YHU', () => {
  assert.equal(W.fidsHostAirport('met.orionconnected.com'), 'YHU');
  assert.equal(W.fidsHostAirport('yhu.orionconnected.com'), 'YHU');
  assert.equal(addr('https://fids.orionconnected.com/fids?ap=YHU'), 'https://yhu.orionconnected.com/fids');
  assert.equal(addr('https://fids.orionconnected.com/fids?ap=MET'), 'https://yhu.orionconnected.com/fids');
  assert.equal(addr('https://met.orionconnected.com/fids?ap=YHU'), '', 'met is already Saint-Hubert');
  assert.equal(addr('https://yhu.orionconnected.com/fids?ap=MET'), '', 'and so is yhu');
});

test('nothing that is not a board page, a board site or a valid code moves', () => {
  for (const url of [
    // not a board page
    'https://fids.orionconnected.com/?ap=YYG', 'https://fids.orionconnected.com/index.html?ap=YYG',
    'https://fids.orionconnected.com/app?ap=YYG', 'https://fids.orionconnected.com/app.html?ap=YYG',
    'https://fids.orionconnected.com/credits?ap=YYG', 'https://fids.orionconnected.com/rotate?ap=YYG',
    'https://fids.orionconnected.com/rotate.html?ap=MIA&stream=2', 'https://fids.orionconnected.com/tour?ap=YYG',
    'https://fids.orionconnected.com/screen.html?ap=YYG', 'https://fids.orionconnected.com/studio/?ap=YYG',
    'https://fids.orionconnected.com/fidsx?ap=YYG', 'https://fids.orionconnected.com/js/fids?ap=YYG',
    // no ?ap=, or one that is not a code
    'https://fids.orionconnected.com/fids', 'https://fids.orionconnected.com/fids?mode=live',
    'https://fids.orionconnected.com/fids?ap=', 'https://fids.orionconnected.com/fids?ap=YY',
    'https://fids.orionconnected.com/fids?ap=YYGGG', 'https://fids.orionconnected.com/fids?ap=Y1G',
    'https://fids.orionconnected.com/fids?ap=Y-G', 'https://fids.orionconnected.com/fids?ap=%E0%A4',
    'https://fids.orionconnected.com/fids?ap=FIDS', 'https://fids.orionconnected.com/fids?ap=www',
    'https://fids.orionconnected.com/fids?ap=demo', 'https://fids.orionconnected.com/fids?ap=APP',
    'https://fids.orionconnected.com/fids?ap=api',
    // hosts that are not a board site of ours
    'https://orionconnected.com/fids?ap=YYG', 'https://www.orionconnected.com/fids?ap=YYG',
    'https://www.orionconnected.ca/fids?ap=YYG', 'https://app.orionconnected.app/fids?ap=YYG',
    'https://studio.orionconnected.com/fids?ap=YYG', 'https://dev.orionconnected.com/fids?ap=YYG',
    'https://yyg.gate2.orionconnected.com/fids?ap=YHZ', 'https://ab.orionconnected.com/fids?ap=YHZ',
    'https://airport-address-redirect-fids.n-leblanc1984.workers.dev/fids?ap=YYG',
    'https://fids-proxy.n-leblanc1984.workers.dev/fids?ap=YYG',
    'http://localhost:8080/fids?ap=YYG', 'http://127.0.0.1/fids?ap=YYG', 'http://[::1]/fids?ap=YYG',
    'https://yyg.orionconnected.com.evil.test/fids?ap=YHZ', 'https://fids.orionconnected.co/fids?ap=YYG',
    // pages that keep their origin on purpose
    'https://fids.orionconnected.com/gids?ap=YYG&screen=ABCDEF', 'https://fids.orionconnected.com/gids?screen=ABCDEF&ap=YYG&gate=2',
    'https://fids.orionconnected.com/fids?ap=YYG&stream=1', 'https://fids.orionconnected.com/fids?ap=YYG&yt=1',
    'https://fids.orionconnected.com/fids?ap=YYG&compact', 'https://yqm.orionconnected.com/gids?ap=YHZ&screen=ABCDEF'
  ]) {
    assert.equal(addr(url), '', url);
  }
});

test('a frame, an admin sign-in and a phone the hand-off is about to take never move', () => {
  const url = 'https://fids.orionconnected.com/fids?ap=YYG';
  assert.equal(addr(url, { framed: true }), '');
  assert.equal(addr(url, { admin: true }), '');
  assert.equal(addr(url, { phone: true }), '');
  // a phone that chose the board moves, and carries its answer
  assert.equal(addr(url, { sitePhone: true }), 'https://yyg.orionconnected.com/fids?nomobile=1');
  assert.equal(addr(url + '&nomobile=1', { sitePhone: true }), 'https://yyg.orionconnected.com/fids?nomobile=1');
});

test('it cannot loop: where it sends a board, that board stays', () => {
  const froms = [
    'https://fids.orionconnected.com/fids?ap=YYG&mode=live', 'https://orionconnected.ca/gids?ap=YHZ&gate=3',
    'https://orionconnected.app/bids?ap=YQM&belt=2', 'https://yqm.orionconnected.com/gids?ap=YHZ',
    'https://fids.orionconnected.com/fids?ap=MET', 'https://fids.orionconnected.com/fids?ap=YYG&ap=YHZ'
  ];
  for (const from of froms) {
    const to = addr(from);
    assert.ok(to, from);
    assert.equal(addr(to), '', 'one hop only: ' + from + ' -> ' + to);
    assert.equal(addr(to, { sitePhone: true }), '', 'and none for a phone either: ' + to);
  }
});

test('the caller: a desktop moves with replace(), a frame, an admin and an undecided phone stay', () => {
  const url = 'https://fids.orionconnected.com/gids?ap=YYG&gate=2&mode=live';
  assert.deepEqual(load({ url }).went, ['https://yyg.orionconnected.com/gids?gate=2&mode=live']);
  assert.deepEqual(load({ url, framed: true }).went, [], 'rotator frames, the tour, Studio previews');
  assert.deepEqual(load({ url, local: { fids_token: 't' } }).went, [], 'a sign-in kept in localStorage');
  assert.deepEqual(load({ url, session: { fids_token: 't' } }).went, [], 'a sign-in kept for this tab');
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
  const tv = 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  assert.deepEqual(load({ url, ua: iphone }).went, [], 'the phone hand-off asks on this origin, one hop');
  assert.deepEqual(load({ url, ua: android, local: { oc_mobile_pref: 'app' } }).went, [], 'and sends an app phone on this origin');
  assert.deepEqual(load({ url, ua: iphone, local: { oc_mobile_pref: 'site' } }).went,
    ['https://yyg.orionconnected.com/gids?gate=2&mode=live&nomobile=1'], 'a phone that chose the board takes its answer along');
  assert.deepEqual(load({ url: url + '&nomobile=1', ua: iphone }).went,
    ['https://yyg.orionconnected.com/gids?gate=2&mode=live&nomobile=1'], 'the opener Stay link');
  assert.deepEqual(load({ url, ua: tv }).went, ['https://yyg.orionconnected.com/gids?gate=2&mode=live'], 'an Android TV is a display');
  assert.deepEqual(load({ url: 'https://yyg.orionconnected.com/gids?gate=2' }).went, [], 'already home');
});

test('the move runs first: host-airport.js is the first script of every board', () => {
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = rd(page);
    const head = html.slice(0, html.indexOf('</head>'));
    const first = head.search(/<script\b[^>]*>/);
    assert.match(head.slice(first, first + 80), /<script src="js\/host-airport\.js\?v=\d+"><\/script>/, page);
  }
  // and the opener does not load it: "/" hands a display to fids.html, which moves it
  assert.doesNotMatch(rd('index.html'), /<script[^>]*host-airport\.js/);
});

// ── THE BOTTOM OF THE BOARD ────────────────────────────────────────────────

function liftCore(head) {
  const at = CORE.indexOf(head);
  assert.ok(at >= 0, head);
  let d = 0;
  for (let k = CORE.indexOf('{', at); k < CORE.length; k++) {
    if (CORE[k] === '{') d++;
    else if (CORE[k] === '}') { d--; if (d === 0) return CORE.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + head);
}

test('the old backdrop is the airport choice only: classic in the cloud config, nothing else', () => {
  const box = {};
  vm.runInNewContext(liftCore('function _fidsAirportFloorOf(cfg)') + '\nthis.f = _fidsAirportFloorOf;', box);
  assert.equal(box.f({ floor: 'classic' }), 'classic');
  for (const cfg of [null, undefined, {}, { floor: '' }, { floor: 'earth' }, { floor: 'Classic' }, { floor: 'old' }]) {
    assert.equal(box.f(cfg), '', JSON.stringify(cfg));
  }
  // read from the KV copy itself, never getAirportConfig (whose per-browser
  // fids_airport_override_ would win) and never _pref (the device copy)
  const fn = liftCore('function _fidsAirportFloor(code)');
  assert.match(fn, /_airportConfigCache\[norm\]/);
  assert.doesNotMatch(fn, /getAirportConfig|_pref|localStorage/);
  assert.doesNotMatch(CORE, /_pref\('floor'\)/);
});

test('a device copy of the floor is retired where it is read, and Customize no longer keeps one', () => {
  assert.match(CORE, /if \(_userCfg && _userCfg\.floor !== undefined\) \{\s*delete _userCfg\.floor;/);
  assert.match(CORE, /if \(_flObj && _flObj\.floor !== undefined\) \{\s*delete _flObj\.floor;\s*localStorage\.setItem\(_flKey, JSON\.stringify\(_flObj\)\);/);
  // _cuSave writes the device copy without the floor; the cloud push still gets it
  const at = MENU.indexOf('function _cuSave(prefs) {');
  const end = MENU.indexOf('\n}\n', at) + 2;
  const store = {};
  const box = { localStorage: { setItem: (k, v) => { store[k] = v; } }, _cuStorageKey: () => 'fids_customize_YYG', Date };
  vm.runInNewContext(MENU.slice(at, end) + '\nthis.save = _cuSave;', box);
  const prefs = { theme: 'navy', floor: 'classic', wxIcons: '' };
  box.save(prefs);
  const kept = JSON.parse(store.fids_customize_YYG);
  assert.equal(kept.floor, undefined, 'not in the device copy');
  assert.equal(kept.theme, 'navy');
  assert.equal(prefs.floor, 'classic', 'still there for the cloud push');
  assert.match(MENU, /if \(prefs\.floor !== undefined\) body\.floor = prefs\.floor;/);
});
