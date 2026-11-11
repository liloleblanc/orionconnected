'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24145 — STRICT ADDRESSES.
//
//   .com and .ca are the boards, and a board lives on its airport address:
//     fids.orionconnected.com/fids?ap=YQM  ->  https://yqm.orionconnected.com/fids
//     fids.orionconnected.com/fids         ->  the airport it falls back to
//   .app is the phone app only: every board page there shows /app.
//   A phone is asked board or app at every fresh arrival, and never on a tap
//   inside a board (sessionStorage oc_board_tab, nomobile=1 across origins).
//   One link helper (fidsBoardUrl) builds every board link.
//
// Everything is pure in host-airport.js, so these tests run the real file
// against a stubbed window and call the functions it exports.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, 'fids-current', p), 'utf8');
const SRC = rd('js/host-airport.js');

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const TV = 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Run host-airport.js against a stubbed window; returns the window, where it went and the tab storage. */
function load(opts) {
  const o = opts || {};
  const url = new URL(o.url || 'https://fids.orionconnected.com/credits');
  const went = [];
  const mem = (init) => {
    const s = Object.assign({}, init || {});
    return { _s: s, getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } };
  };
  const win = {
    location: {
      hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash, href: url.href,
      replace: (to) => { went.push(to); }
    },
    navigator: { userAgent: o.ua || MAC },
    localStorage: mem(o.local),
    sessionStorage: mem(o.session)
  };
  win.self = win;
  win.top = o.framed ? {} : win;
  new Function('window', 'sessionStorage', SRC)(win, win.sessionStorage);
  return { win, went, tab: win.sessionStorage._s };
}

const { win: W } = load();
const L = (url) => { const u = new URL(url); return { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash }; };
const addr = (url, ctx) => W.fidsAirportAddress(L(url), Object.assign({ fallback: 'YQM' }, ctx || {}), W.fidsHostAirport, W.fidsRealIata);
const app = (url) => W.fidsAppAddress(L(url), W.fidsHostAirport, W.fidsRealIata);
const arrive = (url, ctx) => W.fidsArrival(L(url), Object.assign({ fallback: 'YQM' }, ctx || {}), W.fidsHostAirport, W.fidsRealIata);
const link = (code, page, params, env) => W.fidsBoardUrlFor(code, page, params, env, W.fidsRealIata);

// ── .com and .ca: the board address ────────────────────────────────────────

test('fids., www. and the apex send a board with ?ap= to its airport address, on .com and on .ca', () => {
  for (const zone of ['orionconnected.com', 'orionconnected.ca']) {
    for (const site of ['fids.', 'www.', '']) {
      const from = 'https://' + site + zone;
      assert.equal(addr(from + '/fids?ap=YYG'), 'https://yyg.' + zone + '/fids', from);
      assert.equal(addr(from + '/gids?ap=YHZ&gate=3'), 'https://yhz.' + zone + '/gids?gate=3', from);
      assert.equal(addr(from + '/bids?belt=2&ap=yqm'), 'https://yqm.' + zone + '/bids?belt=2', from);
    }
  }
});

test('the path loses .html and a trailing slash, so the host adds no second hop', () => {
  assert.equal(addr('https://fids.orionconnected.com/fids.html?ap=YYG'), 'https://yyg.orionconnected.com/fids');
  assert.equal(addr('https://fids.orionconnected.com/gids.html?ap=YYG&gate=2'), 'https://yyg.orionconnected.com/gids?gate=2');
  assert.equal(addr('https://fids.orionconnected.com/bids/?ap=YYG'), 'https://yyg.orionconnected.com/bids');
  assert.equal(addr('https://fids.orionconnected.ca/fids.html/?ap=YUL'), 'https://yul.orionconnected.ca/fids');
});

test('every other parameter, its order and its encoding, and the hash come along', () => {
  const from = 'https://fids.orionconnected.com/fids?mode=live&ap=YYG&nomobile=1&screen_x=1&gate=A%2012&belt=3'
    + '&holiday=harvest&holidayat=2026-10-12T10%3A00&floor=classic&langs=fr,en&rot=90#top';
  assert.equal(addr(from), 'https://yyg.orionconnected.com/fids?mode=live&nomobile=1&screen_x=1&gate=A%2012&belt=3'
    + '&holiday=harvest&holidayat=2026-10-12T10%3A00&floor=classic&langs=fr,en&rot=90#top');
  assert.equal(addr('https://fids.orionconnected.com/gids?ap=YHZ&gate=4&ap=YYZ'), 'https://yhz.orionconnected.com/gids?gate=4',
    'a second ap goes too; the first decides, as URLSearchParams.get does on the board');
  assert.equal(addr('https://FIDS.OrionConnected.com:443/fids?ap=%20yyg%20'), 'https://yyg.orionconnected.com/fids');
  assert.equal(addr('https://fids.orionconnected.com/fids?ap=CYQM'), 'https://cyqm.orionconnected.com/fids', 'four letters are a code too');
});

test('with no ?ap= a board on a site host goes to the airport it would show: this tab, else YQM', () => {
  assert.equal(addr('https://fids.orionconnected.com/fids'), 'https://yqm.orionconnected.com/fids');
  assert.equal(addr('https://fids.orionconnected.com/fids?mode=live'), 'https://yqm.orionconnected.com/fids?mode=live');
  assert.equal(addr('https://fids.orionconnected.com/gids?gate=3', { fallback: 'YHZ' }), 'https://yhz.orionconnected.com/gids?gate=3');
  assert.equal(addr('https://orionconnected.ca/bids', { fallback: 'yul' }), 'https://yul.orionconnected.ca/bids');
  assert.equal(addr('https://www.orionconnected.com/fids.html', { fallback: 'MET' }), 'https://yhu.orionconnected.com/fids');
  // an empty ?ap= falls back on the board as well (params.get('ap') || ...)
  assert.equal(addr('https://fids.orionconnected.com/fids?ap=&mode=live', { fallback: 'YYG' }), 'https://yyg.orionconnected.com/fids?mode=live');
  assert.equal(addr('https://fids.orionconnected.com/fids', { fallback: '' }), '', 'no airport at all: stay');
  assert.equal(addr('https://fids.orionconnected.com/fids', { fallback: 'FIDS' }), '', 'a fallback that is no code: stay');
});

test('an airport address with another airport in ?ap= goes to that airport; its own stays', () => {
  assert.equal(addr('https://yqm.orionconnected.com/gids?ap=YHZ&gate=3'), 'https://yhz.orionconnected.com/gids?gate=3');
  assert.equal(addr('https://yyg.orionconnected.ca/fids?ap=yul&mode=live'), 'https://yul.orionconnected.ca/fids?mode=live');
  assert.equal(addr('https://yyg.orionconnected.com/fids?ap=YYG&mode=live'), '', 'its own code in ?ap= is no reason to hop');
  assert.equal(addr('https://yyg.orionconnected.com/fids?ap=yyg'), '');
  assert.equal(addr('https://yyg.orionconnected.com/fids'), '', 'home, with no ?ap=, whatever this tab holds');
  assert.equal(addr('https://yyg.orionconnected.com/fids', { fallback: 'YHZ' }), '');
  assert.equal(addr('https://yyg.orionconnected.com/gids.html?gate=2'), '', 'an airport address keeps the path it was given');
});

test('MET: the address of Saint-Hubert is yhu, and met. moves there', () => {
  assert.equal(W.fidsHostAirport('met.orionconnected.com'), 'YHU');
  assert.equal(addr('https://fids.orionconnected.com/fids?ap=YHU'), 'https://yhu.orionconnected.com/fids');
  assert.equal(addr('https://fids.orionconnected.com/fids?ap=MET'), 'https://yhu.orionconnected.com/fids');
  assert.equal(addr('https://met.orionconnected.com/fids'), 'https://yhu.orionconnected.com/fids', 'one airport, one address');
  assert.equal(addr('https://met.orionconnected.ca/gids?gate=1&ap=YHU'), 'https://yhu.orionconnected.ca/gids?gate=1');
  assert.equal(addr('https://yhu.orionconnected.com/fids?ap=MET'), '', 'yhu is home for MET');
  assert.equal(addr('https://yhu.orionconnected.com/fids'), '');
});

test('?screen=gate and ?screen=baggage are sub-screens and move; only a registry id stays', () => {
  assert.equal(addr('https://fids.orionconnected.com/fids?ap=YHZ&screen=gate&gate=3'), 'https://yhz.orionconnected.com/fids?screen=gate&gate=3');
  assert.equal(addr('https://fids.orionconnected.com/fids?ap=YHZ&screen=baggage&belt=2'), 'https://yhz.orionconnected.com/fids?screen=baggage&belt=2');
  assert.equal(addr('https://fids.orionconnected.com/fids?screen=main'), 'https://yqm.orionconnected.com/fids?screen=main');
  assert.equal(addr('https://yqm.orionconnected.com/fids?screen=gate&ap=YHZ'), 'https://yhz.orionconnected.com/fids?screen=gate');
  // the registry alphabet has no I, O, 0 or 1, and an id is exactly six long
  for (const notId of ['ABCDE1', 'ABCDEO', 'ABCDEI', 'ABCDE0', 'ABCDE', 'ABCDEFG', 'abcdef', 'GATE10', 'BAGGAGE']) {
    assert.ok(addr('https://fids.orionconnected.com/gids?ap=YHZ&screen=' + notId), notId + ' is not a registry id');
  }
  for (const id of ['ABCDEF', 'K7M2XP', 'ZZZZ99', 'H2J3K4']) {
    assert.equal(addr('https://fids.orionconnected.com/gids?ap=YYG&screen=' + id), '', id);
    assert.equal(addr('https://fids.orionconnected.com/gids?screen=' + id + '&ap=YYG&gate=2'), '', id);
    assert.equal(addr('https://yqm.orionconnected.com/gids?ap=YHZ&screen=' + id), '', id + ' on an airport address');
    assert.equal(addr('https://fids.orionconnected.com/fids?screen=' + id), '', id + ' with no ?ap=');
  }
});

test('nothing that is not a board page, a board site of ours or a valid code moves', () => {
  for (const url of [
    // not a board page
    'https://fids.orionconnected.com/?ap=YYG', 'https://fids.orionconnected.com/index.html?ap=YYG',
    'https://fids.orionconnected.com/app?ap=YYG', 'https://fids.orionconnected.com/app.html?ap=YYG',
    'https://fids.orionconnected.com/credits?ap=YYG', 'https://fids.orionconnected.com/rotate?ap=YYG',
    'https://fids.orionconnected.com/rotate.html?ap=MIA&stream=2', 'https://fids.orionconnected.com/tour?ap=YYG',
    'https://fids.orionconnected.com/screen.html?ap=YYG', 'https://fids.orionconnected.com/studio/?ap=YYG',
    'https://fids.orionconnected.com/picker?ap=YYG', 'https://fids.orionconnected.com/heritage.html?ap=YYG',
    'https://fids.orionconnected.com/fidsx?ap=YYG', 'https://fids.orionconnected.com/js/fids?ap=YYG',
    // an ?ap= that is not a code the board can show
    'https://fids.orionconnected.com/fids?ap=YY', 'https://fids.orionconnected.com/fids?ap=YYGGG',
    'https://fids.orionconnected.com/fids?ap=Y1G', 'https://fids.orionconnected.com/fids?ap=Y-G',
    'https://fids.orionconnected.com/fids?ap=%E0%A4', 'https://fids.orionconnected.com/fids?ap=FIDS',
    'https://fids.orionconnected.com/fids?ap=www', 'https://fids.orionconnected.com/fids?ap=demo',
    'https://fids.orionconnected.com/fids?ap=APP', 'https://fids.orionconnected.com/fids?ap=api',
    'https://yqm.orionconnected.com/fids?ap=FIDS',
    // hosts that are not a board address of ours
    'https://app.orionconnected.com/fids?ap=YYG', 'https://studio.orionconnected.com/fids?ap=YYG',
    'https://dev.orionconnected.com/fids?ap=YYG', 'https://api.orionconnected.ca/fids?ap=YYG',
    'https://yyg.gate2.orionconnected.com/fids?ap=YHZ', 'https://ab.orionconnected.com/fids?ap=YHZ',
    'https://abcde.orionconnected.com/fids?ap=YHZ',
    'https://airport-address-redirect-fids.n-leblanc1984.workers.dev/fids?ap=YYG',
    'https://strict-addresses-fids.n-leblanc1984.workers.dev/fids',
    'http://localhost:8080/fids?ap=YYG', 'http://localhost:8080/fids.html', 'http://127.0.0.1/fids?ap=YYG',
    'http://[::1]/fids?ap=YYG', 'https://yyg.orionconnected.com.evil.test/fids?ap=YHZ',
    'https://fids.orionconnected.co/fids?ap=YYG', 'https://notorionconnected.com/fids?ap=YYG',
    // the kiosk layouts, which keep their settings on their origin
    'https://fids.orionconnected.com/fids?ap=YYG&stream=1', 'https://fids.orionconnected.com/fids?ap=YYG&yt=1',
    'https://fids.orionconnected.com/fids?ap=YYG&compact', 'https://fids.orionconnected.com/fids?stream=2'
  ]) {
    assert.equal(addr(url), '', url);
  }
});

test('a frame and an admin signed in on this origin never move', () => {
  for (const url of ['https://fids.orionconnected.com/fids?ap=YYG', 'https://fids.orionconnected.com/fids',
                     'https://yqm.orionconnected.com/gids?ap=YHZ', 'https://met.orionconnected.com/fids']) {
    assert.equal(addr(url, { framed: true }), '', 'framed: ' + url);
    assert.equal(addr(url, { admin: true }), '', 'admin: ' + url);
  }
});

test('the tab memory that stays behind travels in the address: demo and a phone in a board', () => {
  assert.equal(addr('https://fids.orionconnected.com/fids', { demo: true }), 'https://yqm.orionconnected.com/fids?mode=demo');
  assert.equal(addr('https://fids.orionconnected.com/fids?mode=live', { demo: true }), 'https://yqm.orionconnected.com/fids?mode=live',
    'an explicit mode in the address wins');
  assert.equal(addr('https://fids.orionconnected.com/gids?ap=YHZ', { carry: true }), 'https://yhz.orionconnected.com/gids?nomobile=1');
  assert.equal(addr('https://fids.orionconnected.com/gids?ap=YHZ&nomobile=1', { carry: true }), 'https://yhz.orionconnected.com/gids?nomobile=1',
    'never twice');
});

test('it cannot loop: where it sends a board, that board stays, for a desktop and a phone alike', () => {
  const froms = [
    'https://fids.orionconnected.com/fids?ap=YYG&mode=live', 'https://orionconnected.ca/gids?ap=YHZ&gate=3',
    'https://www.orionconnected.com/bids.html?ap=YQM&belt=2', 'https://yqm.orionconnected.com/gids?ap=YHZ',
    'https://fids.orionconnected.com/fids?ap=MET', 'https://fids.orionconnected.com/fids?ap=YYG&ap=YHZ',
    'https://fids.orionconnected.com/fids', 'https://met.orionconnected.ca/gids?screen=gate&gate=4#g',
    'https://fids.orionconnected.com/fids.html/?screen=baggage'
  ];
  for (const from of froms) {
    const to = addr(from);
    assert.ok(to, from);
    assert.equal(addr(to), '', 'one hop only: ' + from + ' -> ' + to);
    assert.equal(addr(to, { fallback: 'YHZ', carry: true, demo: true }), '', 'whatever the tab holds: ' + to);
    const r = arrive(to, { phone: true, inBoard: true });
    assert.equal(r.to, '', 'a phone in a board stays there too: ' + to);
  }
});

// ── .app: the app, only ────────────────────────────────────────────────────

test('every board page and "/" on every .app host shows /app on the same host', () => {
  for (const host of ['orionconnected.app', 'fids.orionconnected.app', 'www.orionconnected.app', 'yqm.orionconnected.app']) {
    for (const p of ['/', '/index.html', '/fids', '/fids.html', '/gids', '/gids.html', '/bids', '/bids.html', '/fids/']) {
      assert.match(app('https://' + host + p), /^\/app(\?|$)/, host + p);
    }
  }
});

test('on .app the app takes ap (from the query or the address), screen, gate and belt, and nothing else', () => {
  assert.equal(app('https://yqm.orionconnected.app/fids'), '/app?ap=YQM');
  assert.equal(app('https://yqm.orionconnected.app/gids?gate=3&mode=live&nomobile=1'), '/app?ap=YQM&gate=3&screen=gate');
  assert.equal(app('https://yqm.orionconnected.app/bids.html?belt=2'), '/app?ap=YQM&belt=2&screen=baggage');
  assert.equal(app('https://yqm.orionconnected.app/fids?ap=YHZ&screen=gate&gate=A%205#x'), '/app?ap=YHZ&screen=gate&gate=A%205#x',
    'the query airport wins over the address, as on the boards');
  assert.equal(app('https://orionconnected.app/fids?ap=yyg'), '/app?ap=YYG');
  assert.equal(app('https://orionconnected.app/'), '/app', 'no airport anywhere: the app uses its own memory');
  assert.equal(app('https://fids.orionconnected.app/gids?gate=2'), '/app?gate=2&screen=gate');
  assert.equal(app('https://met.orionconnected.app/fids'), '/app?ap=YHU', 'the address of MET is Saint-Hubert');
  assert.equal(app('https://orionconnected.app/fids?ap=MET'), '/app?ap=YHU');
  assert.equal(app('https://yqm.orionconnected.app/fids?ap=FIDS'), '/app?ap=YQM', 'a query airport that is no code gives way to the address');
  assert.equal(app('https://yqm.orionconnected.app/gids?screen=ABCDEF&gate=2'), '/app?ap=YQM&gate=2&screen=gate',
    'a registry id is no app screen');
  assert.equal(app('https://yqm.orionconnected.app/fids?screen=baggage&screen=gate'), '/app?ap=YQM&screen=baggage', 'the first of a key');
});

test('.app leaves every other page alone, and no other zone is .app', () => {
  for (const url of ['https://yqm.orionconnected.app/app', 'https://yqm.orionconnected.app/app.html?ap=YQM',
                     'https://orionconnected.app/rotate.html', 'https://orionconnected.app/credits', 'https://orionconnected.app/studio/',
                     'https://yqm.orionconnected.com/fids', 'https://fids.orionconnected.ca/fids', 'https://orionconnected.app.example.com/fids',
                     'https://notorionconnected.app/fids', 'https://a.b.orionconnected.app/fids', 'http://localhost/fids']) {
    assert.equal(app(url), '', url);
  }
});

test('.app is the app on a desktop and on a phone, signed in or not', () => {
  for (const ctx of [{}, { phone: true }, { phone: true, inBoard: true }, { admin: true }, { phone: true, admin: true }]) {
    const r = arrive('https://yqm.orionconnected.app/gids?gate=3&nomobile=1', ctx);
    assert.equal(r.to, '/app?ap=YQM&gate=3&screen=gate', JSON.stringify(ctx));
    assert.equal(r.mark, false);
  }
  assert.deepEqual(arrive('https://yqm.orionconnected.app/gids?gate=3', { framed: true }), { to: '', mark: false, phoneBoard: false },
    'a frame belongs to its parent, even on .app');
  assert.equal(arrive('https://yqm.orionconnected.app/app?ap=YQM', { phone: true }).to, '', 'the app itself never moves');
});

// ── a page arriving: desktops, phones fresh and phones in a board ─────────

test('a desktop moves to the address in one hop and marks the tab only where it stays', () => {
  assert.deepEqual(arrive('https://fids.orionconnected.com/gids?ap=YHZ&gate=3#g'),
    { to: 'https://yhz.orionconnected.com/gids?gate=3#g', mark: false, phoneBoard: false });
  assert.deepEqual(arrive('https://yhz.orionconnected.com/gids?gate=3'), { to: '', mark: true, phoneBoard: false });
  assert.deepEqual(arrive('https://yhz.orionconnected.com/credits'), { to: '', mark: false, phoneBoard: false }, 'not a board page');
  assert.deepEqual(arrive('https://fids.orionconnected.com/fids?ap=YHZ', { admin: true }), { to: '', mark: true, phoneBoard: false });
  assert.equal(arrive('https://fids.orionconnected.com/fids?ap=YHZ', { phone: false, inBoard: true }).to, 'https://yhz.orionconnected.com/fids',
    'a desktop never carries nomobile');
});

test('a fresh phone is asked once, on the address the board belongs to, in the same hop as the move', () => {
  assert.equal(arrive('https://fids.orionconnected.com/gids?ap=YHZ&gate=3#g', { phone: true }).to,
    'https://yhz.orionconnected.com/?ap=YHZ&next=' + encodeURIComponent('/gids?gate=3') + '#g');
  assert.equal(arrive('https://fids.orionconnected.ca/fids', { phone: true, fallback: 'YUL' }).to,
    'https://yul.orionconnected.ca/?ap=YUL&next=' + encodeURIComponent('/fids'));
  assert.equal(arrive('https://met.orionconnected.com/bids?belt=2', { phone: true }).to,
    'https://yhu.orionconnected.com/?ap=YHU&next=' + encodeURIComponent('/bids?belt=2'));
  // already on its address: the question here
  assert.equal(arrive('https://yhz.orionconnected.com/gids?gate=3', { phone: true }).to, '/?ap=YHZ&next=' + encodeURIComponent('/gids?gate=3'));
  assert.equal(arrive('https://yhz.orionconnected.com/gids.html?gate=3', { phone: true }).to, '/?ap=YHZ&next=' + encodeURIComponent('/gids.html?gate=3'));
  // where a page cannot leave (a preview, an admin), the question on this origin, with the airport in next
  assert.equal(arrive('https://strict-addresses-fids.n-leblanc1984.workers.dev/fids?ap=YQM', { phone: true }).to,
    '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=YQM'));
  assert.equal(arrive('http://localhost:8080/gids.html?ap=YHZ&gate=2', { phone: true }).to,
    '/?ap=YHZ&next=' + encodeURIComponent('/gids.html?ap=YHZ&gate=2'));
  assert.equal(arrive('https://fids.orionconnected.com/fids?ap=YHZ', { phone: true, admin: true }).to,
    '/?ap=YHZ&next=' + encodeURIComponent('/fids?ap=YHZ'));
  for (const [url, ctx] of [['https://fids.orionconnected.com/gids?ap=YHZ', { phone: true }], ['https://yhz.orionconnected.com/gids', { phone: true }]]) {
    const r = arrive(url, ctx);
    assert.equal(r.mark, false, 'a page that is leaving to ask is not a board shown');
    assert.equal(r.phoneBoard, false);
  }
});

test('a fresh arrival is asked even where this tab once showed the board, and ?mobile=ask asks again', () => {
  // The tab memory is per origin. Arriving fresh at fids. and moving to yhz.
  // asks there, whatever yhz. remembers, because the question is part of the hop.
  assert.match(arrive('https://fids.orionconnected.com/gids?ap=YHZ', { phone: true, inBoard: false }).to, /^https:\/\/yhz\.orionconnected\.com\/\?ap=YHZ&next=/);
  const again = arrive('https://yhz.orionconnected.com/gids?gate=3&mobile=ask', { phone: true, inBoard: true });
  assert.equal(again.to, '/?ap=YHZ&next=' + encodeURIComponent('/gids?gate=3'), 'and mobile=ask is not carried into the answer');
  assert.equal(arrive('https://yhz.orionconnected.com/gids?mobile=ask&gate=3', { phone: true, inBoard: true }).to,
    '/?ap=YHZ&next=' + encodeURIComponent('/gids?gate=3'));
  assert.equal(arrive('https://yhz.orionconnected.com/gids?mobile=ask&nomobile=1', { phone: true }).to, '', 'nomobile=1 outranks it');
});

test('a phone inside a board is never asked: same origin by the tab memory, another origin by nomobile=1', () => {
  assert.deepEqual(arrive('https://yhz.orionconnected.com/gids?gate=4', { phone: true, inBoard: true }), { to: '', mark: true, phoneBoard: true });
  assert.deepEqual(arrive('https://yhz.orionconnected.com/gids?gate=4&nomobile=1', { phone: true }), { to: '', mark: true, phoneBoard: true });
  assert.deepEqual(arrive('https://fids.orionconnected.com/gids?ap=YHZ&gate=4', { phone: true, inBoard: true }),
    { to: 'https://yhz.orionconnected.com/gids?gate=4&nomobile=1', mark: false, phoneBoard: true }, 'a move takes the answer along');
  assert.deepEqual(arrive('https://fids.orionconnected.com/gids?ap=YHZ&nomobile=1', { phone: true }),
    { to: 'https://yhz.orionconnected.com/gids?nomobile=1', mark: false, phoneBoard: true }, 'and never adds it twice');
  assert.equal(arrive('https://yqm.orionconnected.com/fids?ap=YHZ', { phone: true, inBoard: true }).to, 'https://yhz.orionconnected.com/fids?nomobile=1',
    'a relative link to another airport, tapped inside a board');
});

test('a whole phone journey: asked once, then never again inside the board', () => {
  // 1. a shared link, opened fresh on a phone, on the main site
  let tabs = {};                                    // origin -> its sessionStorage
  const visit = (url) => {
    const u = new URL(url);
    const r = load({ url, ua: IPHONE, session: tabs[u.origin] });
    tabs[u.origin] = r.tab;
    return r;
  };
  let r = visit('https://fids.orionconnected.com/gids?ap=YHZ&gate=3');
  assert.equal(r.went.length, 1);
  const opener = new URL(r.went[0]);
  assert.equal(opener.origin, 'https://yhz.orionconnected.com', 'asked on the airport address, one hop');
  assert.equal(opener.searchParams.get('next'), '/gids?gate=3');
  // 2. "Stay on the regular site": the opener marks the tab and sends next + nomobile=1
  tabs[opener.origin] = Object.assign(tabs[opener.origin] || {}, { oc_board_tab: '1' });
  r = visit('https://yhz.orionconnected.com/gids?gate=3&nomobile=1');
  assert.deepEqual(r.went, [], 'the board it chose');
  assert.equal(r.win.__ocPhoneBoard, true);
  // 3. a tap on a gate, same origin, no nomobile in the link
  r = visit('https://yhz.orionconnected.com/gids?gate=5');
  assert.deepEqual(r.went, [], 'never asked inside the board');
  // 4. the menu picks another airport: the helper carries the answer across
  const to = r.win.fidsBoardUrl('YUL', 'fids', { mode: 'live' });
  assert.equal(to, 'https://yul.orionconnected.com/fids?mode=live&nomobile=1');
  r = visit(to);
  assert.deepEqual(r.went, [], 'nor on another airport address');
  assert.equal(tabs['https://yul.orionconnected.com'].oc_board_tab, '1', 'and that address now remembers it too');
  // 5. a desktop on the same links is never asked and never carries nomobile
  const d = load({ url: 'https://fids.orionconnected.com/gids?ap=YHZ&gate=3', ua: MAC });
  assert.deepEqual(d.went, ['https://yhz.orionconnected.com/gids?gate=3']);
  assert.equal(load({ url: 'https://yhz.orionconnected.com/gids', ua: MAC }).win.fidsBoardUrl('YUL', 'fids'), 'https://yul.orionconnected.com/fids');
});

test('the kiosk layouts and a television are displays: never asked, and the kiosks never moved', () => {
  assert.deepEqual(arrive('https://fids.orionconnected.com/fids?ap=YHZ&stream=1', { phone: true }), { to: '', mark: true, phoneBoard: false });
  assert.deepEqual(arrive('https://yhz.orionconnected.com/fids?yt=1', { phone: true }), { to: '', mark: true, phoneBoard: false });
  assert.deepEqual(load({ url: 'https://fids.orionconnected.com/gids?ap=YHZ&gate=2', ua: TV }).went, ['https://yhz.orionconnected.com/gids?gate=2'],
    'bare Android is a television: it moves like a display, unasked');
  assert.match(load({ url: 'https://fids.orionconnected.com/gids?ap=YHZ&gate=2', ua: ANDROID }).went[0], /^https:\/\/yhz\.orionconnected\.com\/\?ap=YHZ&next=/);
});

// ── the caller ─────────────────────────────────────────────────────────────

test('the caller replaces the page, marks the tab only on a board that stays, and leaves its decision for fids-core', () => {
  let r = load({ url: 'https://fids.orionconnected.com/gids?ap=YYG&gate=2&mode=live' });
  assert.deepEqual(r.went, ['https://yyg.orionconnected.com/gids?gate=2&mode=live']);
  assert.equal(r.tab.oc_board_tab, undefined);
  assert.ok(r.win.__ocArrival, 'the hand-off in fids-core.js stands down on this');
  r = load({ url: 'https://fids.orionconnected.com/fids', session: { fids_airport: 'YHZ' } });
  assert.deepEqual(r.went, ['https://yhz.orionconnected.com/fids'], 'the tab airport is the fallback');
  r = load({ url: 'https://fids.orionconnected.com/fids', session: { fids_mode: 'demo' } });
  assert.deepEqual(r.went, ['https://yqm.orionconnected.com/fids?mode=demo'], 'a demo tab stays a demo');
  r = load({ url: 'https://yyg.orionconnected.com/gids?gate=2' });
  assert.deepEqual(r.went, [], 'already home');
  assert.equal(r.tab.oc_board_tab, '1');
  assert.equal(r.tab.fids_airport, 'YYG');
  for (const o of [{ framed: true }, { local: { fids_token: 't' } }, { session: { fids_token: 't' } }]) {
    r = load(Object.assign({ url: 'https://fids.orionconnected.com/gids?ap=YYG&gate=2' }, o));
    assert.deepEqual(r.went, [], JSON.stringify(o));
  }
  assert.equal(load({ url: 'https://fids.orionconnected.com/gids?ap=YYG', framed: true }).tab.oc_board_tab, undefined, 'a frame is not the tab');
  r = load({ url: 'https://yqm.orionconnected.app/bids?belt=2' });
  assert.deepEqual(r.went, ['/app?ap=YQM&belt=2&screen=baggage']);
  r = load({ url: 'https://yqm.orionconnected.com/app?ap=YQM', ua: IPHONE });
  assert.deepEqual(r.went, [], 'the app on .com is left alone');
  r = load({ url: 'https://www.orionconnected.com/', ua: IPHONE });
  assert.deepEqual(r.went, [], 'the homepage is no board');
});

// ── the one link helper ───────────────────────────────────────────────────

test('fidsBoardUrl builds the airport address on .com and .ca, and .com from .app', () => {
  const on = (h) => ({ hostname: h, pathname: '/fids' });
  assert.equal(link('YHZ', 'gids', { gate: '3' }, on('yqm.orionconnected.com')), 'https://yhz.orionconnected.com/gids?gate=3');
  assert.equal(link('yqm', 'bids', { belt: 2 }, on('yqm.orionconnected.com')), 'https://yqm.orionconnected.com/bids?belt=2');
  assert.equal(link('YUL', 'fids', { mode: 'live' }, on('fids.orionconnected.ca')), 'https://yul.orionconnected.ca/fids?mode=live');
  assert.equal(link('YHZ', 'gids.html', null, on('www.orionconnected.com')), 'https://yhz.orionconnected.com/gids');
  assert.equal(link('YHZ', '/fids', '', on('orionconnected.ca')), 'https://yhz.orionconnected.ca/fids');
  assert.equal(link('YQM', 'gids', { gate: '3' }, on('yqm.orionconnected.app')), 'https://yqm.orionconnected.com/gids?gate=3', 'boards are not on .app');
  assert.equal(link('MET', 'fids', null, on('yqm.orionconnected.com')), 'https://yhu.orionconnected.com/fids');
  assert.equal(link('YHZ', 'nonsense', null, on('yqm.orionconnected.com')), 'https://yhz.orionconnected.com/fids', 'an unknown page is the departures board');
});

test('fidsBoardUrl keeps the old relative link where a page cannot leave its origin', () => {
  assert.equal(link('YHZ', 'gids', { gate: '3' }, { hostname: 'localhost' }), 'gids.html?ap=YHZ&gate=3');
  assert.equal(link('YHZ', 'gids', { gate: '3' }, { hostname: 'strict-addresses-fids.n-leblanc1984.workers.dev' }), 'gids.html?ap=YHZ&gate=3');
  assert.equal(link('YHZ', 'gids', { gate: '3' }, { hostname: 'fids.orionconnected.com', framed: true }), 'gids.html?ap=YHZ&gate=3', 'frames stay same-origin');
  assert.equal(link('YHZ', 'gids', { gate: '3' }, { hostname: 'fids.orionconnected.com', admin: true }), 'gids.html?ap=YHZ&gate=3', 'an admin keeps the sign-in');
  assert.equal(link('', 'fids', null, { hostname: 'fids.orionconnected.com' }), 'fids.html', 'no airport: the plain page, which then moves');
  assert.equal(link('FIDS', 'bids', { belt: 1 }, { hostname: 'fids.orionconnected.com' }), 'bids.html?belt=1');
});

test('fidsBoardUrl takes params as an object, a query string or URLSearchParams, and never two ap', () => {
  const env = { hostname: 'yqm.orionconnected.com' };
  assert.equal(link('YHZ', 'gids', '?ap=YQM&gate=3&mode=live', env), 'https://yhz.orionconnected.com/gids?gate=3&mode=live');
  assert.equal(link('YHZ', 'gids', new URLSearchParams('ap=YQM&gate=A 5&mode=live'), env), 'https://yhz.orionconnected.com/gids?gate=A%205&mode=live');
  assert.equal(link('YHZ', 'gids', { ap: 'YQM', gate: '', belt: null, mode: 'live', nomobile: true }, env), 'https://yhz.orionconnected.com/gids?mode=live&nomobile=1');
  assert.equal(link('YHZ', 'gids', { gate: 'A&B' }, { hostname: 'localhost' }), 'gids.html?ap=YHZ&gate=A%26B');
});

test('a phone in a board takes nomobile=1 to another origin, and only there', () => {
  const env = { hostname: 'yqm.orionconnected.com', phoneBoard: true };
  assert.equal(link('YHZ', 'gids', { gate: '3' }, env), 'https://yhz.orionconnected.com/gids?gate=3&nomobile=1');
  assert.equal(link('YQM', 'gids', { gate: '3' }, env), 'https://yqm.orionconnected.com/gids?gate=3', 'same origin: the tab memory is enough');
  assert.equal(link('YHZ', 'gids', { gate: '3', nomobile: 1 }, env), 'https://yhz.orionconnected.com/gids?gate=3&nomobile=1', 'not twice');
  assert.equal(link('YHZ', 'gids', { gate: '3' }, { hostname: 'yqm.orionconnected.com' }), 'https://yhz.orionconnected.com/gids?gate=3');
});

// ── where it runs, and who uses it ────────────────────────────────────────

function headOf(page) {
  const html = rd(page);
  return html.slice(0, html.indexOf('</head>'));
}

test('on the boards the viewport is decided first, then host-airport.js is the first file loaded', () => {
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const head = headOf(page);
    const firstScript = head.search(/<script\b[^>]*>/i);
    assert.match(head.slice(firstScript, firstScript + 200), /<script>\s*\/\* v24145 — THE VIEWPORT IS DECIDED BEFORE ANYTHING ELSE/, page);
    const firstSrc = head.search(/<script\b[^>]*\bsrc=/i);
    assert.match(head.slice(firstSrc, firstSrc + 80), /<script src="js\/host-airport\.js\?v=\d+"><\/script>/, page);
    assert.doesNotMatch(head.replace(/<noscript>[\s\S]*?<\/noscript>/i, ''), /<meta name="viewport"/, page + ': no static viewport meta to rewrite');
    assert.match(head, /<noscript><meta name="viewport" content="width=device-width, initial-scale=1\.0"><\/noscript>/, page);
  }
  for (const page of ['app.html', 'home.html', 'credits.html', 'picker.html', 'heritage.html']) {
    assert.match(rd(page), /<script src="\/?js\/host-airport\.js\?v=\d+"><\/script>/, page + ' loads the helper');
  }
  assert.doesNotMatch(rd('index.html'), /<script[^>]*host-airport\.js/i, 'the opener stays light');
});

test('every board link goes through the one helper; frames and the rotator are untouched', () => {
  const MENU = rd('js/menu.js');
  const CORE = rd('js/fids-core.js');
  // the old hand-built links survive only as the fallback inside each wrapper
  assert.equal((MENU.match(/\.html\?ap='/g) || []).length, 0, 'menu.js builds no page.html?ap= link itself');
  assert.match(MENU, /function _menuBoardUrl\(code, page, params\) \{\s*try \{ if \(typeof window\.fidsBoardUrl === 'function'\) return window\.fidsBoardUrl\(code, page, params\);/);
  for (const call of ["_menuBoardUrl(ap, target, { mode: mode })", "_menuBoardUrl(ap, 'gids', { gate: flight })",
                      "_menuBoardUrl(ap, 'gids', { gate: gate })", "_menuBoardUrl(ap, 'bids', { belt: belt })"]) {
    assert.ok(MENU.includes(call), call);
  }
  assert.doesNotMatch(CORE, /'(gids|bids)\.html\?ap=' \+/, 'fids-core.js builds no gids.html?ap= link itself');
  assert.match(CORE, /function _fidsBoardLink\(code, page, params\) \{\s*try \{ if \(typeof window\.fidsBoardUrl === 'function'\) return window\.fidsBoardUrl\(code, page, params\);/);
  assert.ok(CORE.includes("screenUrl = _fidsBoardLink(homeIata, 'gids', { gate: f.gate });"), 'the phone departures card');
  assert.ok(CORE.includes("var _swTo = window.fidsBoardUrl(code, _swPage, _swQ);"), 'the airport picker');
  assert.match(rd('js/home.js'), /var u = window\.fidsBoardUrl\(code, 'fids'\);/);
  assert.match(rd('picker.html'), /to = window\.fidsBoardUrl\(ap, /);
  assert.match(rd('app.html'), /to = window\.fidsBoardUrl\(decodeURIComponent\(code\), 'fids', q\)/);
  assert.match(rd('js/heritage-index.js'), /window\.fidsBoardUrl\(c\.home, 'gids', \{ heritage: c\.code \}\)/);
  assert.ok(rd('heritage.html').indexOf('js/host-airport.js') < rd('heritage.html').indexOf('js/heritage-index.js'), 'heritage.html loads the helper first');
  for (const page of ['rotate.html', 'tour.html']) {
    assert.doesNotMatch(rd(page), /fidsBoardUrl|fidsAirportAddress|https:\/\/'\s*\+/, page + ': frame URLs stay relative and same-origin');
  }
});
