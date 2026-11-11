'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24134 — STAY ON THE REGULAR SITE MEANS THE REGULAR SITE.
//
// The opener asks a phone whether it wants the app, and remembers the answer.
// A phone that answered "the regular site" was sent to the board with
// ?nomobile=1 and got the phone layouts anyway: fids.html drew the card list
// (phone.css under 800px), gids and bids drew the older mobile sheets under
// 640px, and a shared board link opened on that same phone bounced it into the
// app regardless of the answer. Three different mobile pages for one choice
// that said "regular site".
//
// Now every board page lays itself out at a desktop width for such a phone
// (the viewport meta, before any stylesheet), and the handoff in fids-core
// respects the remembered answer. These tests RUN the two scripts against the
// cases that matter rather than reading them.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, 'fids-current', p), 'utf8');
const PAGES = { 'fids.html': rd('fids.html'), 'gids.html': rd('gids.html'), 'bids.html': rd('bids.html') };
const CORE = rd('js/fids-core.js');

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Mobile Safari/537.36';
const UA_ANDROID_TV = 'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K VH2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
// What Chrome on an iPhone sends after "Request desktop site", and Chrome on Android.
const UA_CRIOS_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Version/18.0 Safari/605.1.15';
const UA_ANDROID_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
// Screens: an iPhone 15 (393 x 852 points), an iPad Air (820 x 1180), a MacBook Air (1470 x 956).
const IPHONE_SCREEN = { width: 393, height: 852 };
const IPAD_SCREEN = { width: 820, height: 1180 };
const MAC_SCREEN = { width: 1470, height: 956 };

/** Attribute-less <script> bodies, walked not matched (see mobile-offer.test.js). */
function scriptBlocks(html) {
  const out = [];
  const lower = html.toLowerCase();
  let i = 0;
  for (;;) {
    const open = lower.indexOf('<script', i);
    if (open < 0) break;
    const gt = lower.indexOf('>', open);
    if (gt < 0) break;
    const close = lower.indexOf('</script', gt);
    if (close < 0) break;
    if (lower.slice(open + 7, gt).trim() === '') out.push({ body: html.slice(gt + 1, close), at: open });
    i = close + 8;
  }
  return out;
}

function desktopSiteBlock(name) {
  const hits = scriptBlocks(PAGES[name]).filter((b) => b.body.includes('fids-desktop-site'));
  assert.equal(hits.length, 1, name + ': exactly one desktop-site script');
  return hits[0];
}

/** Run a page's desktop-site script and report what it did. */
function runPage({ ua = UA_IPHONE, search = '', tab = null, framed = false, storageThrows = false, name = 'fids.html', touch = 5, screen = IPHONE_SCREEN, visual = { w: 1280, h: 2146 }, layout = { w: 1280, h: 2146 } } = {}) {
  // v24145 — the script MAKES the one viewport meta, with its final content
  const metas = [];
  const classes = new Set();
  // innerWidth/innerHeight as Safari reports them (the part on screen: the zoom
  // shrinks them) and the layout size (documentElement.clientWidth/Height).
  const view = { w: visual.w, h: visual.h };
  const ctx = {
    navigator: { userAgent: ua, maxTouchPoints: touch },
    screen,
    location: { search },
    document: {
      createElement: (t) => ({ tag: t, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
      head: { appendChild: (m) => { metas.push(m); return m; } },
      documentElement: { classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) }, get clientWidth() { return layout.w; }, get clientHeight() { return layout.h; } }
    },
    // an answer an older board kept on the device: decides nothing now
    localStorage: { getItem: (k) => (k === 'oc_mobile_pref' ? 'site' : null) },
    sessionStorage: storageThrows
      ? { getItem() { throw new Error('blocked'); } }
      : { getItem: (k) => (k === 'oc_board_tab' ? tab : null) }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.top = framed ? {} : ctx;
  Object.defineProperty(ctx, 'innerWidth', { configurable: true, get: () => view.w });
  Object.defineProperty(ctx, 'innerHeight', { configurable: true, get: () => view.h });
  vm.createContext(ctx);
  vm.runInContext(desktopSiteBlock(name).body, ctx);
  assert.equal(metas.length, 1, 'exactly one viewport meta, made once');
  assert.equal(metas[0].tag, 'meta');
  assert.equal(metas[0].attrs.name, 'viewport');
  return { viewport: metas[0].attrs.content, desktop: classes.has('fids-desktop-site'), win: ctx, view };
}

/** The handoff IIFE from fids-core, run against a phone. */
function handoffSource() {
  const a = CORE.indexOf('// ── PHONE HANDOFF → app.html');
  const b = CORE.indexOf('// ── CROSS-DEVICE SCREEN STATE', a);
  assert.ok(a > 0 && b > a, 'the handoff block is where it was');
  return CORE.slice(a, b);
}
function runHandoff({ ua = UA_IPHONE, search = '', hash = '', pref = null, tab = null, decided = false, framed = false, stream = false, pathname = '/fids' } = {}) {
  let to = null;
  // v24145 — the opener address is made as a URL on this origin and checked
  // against it; read back here without the origin.
  const origin = 'https://fids.orionconnected.com';
  const ctx = {
    navigator: { userAgent: ua },
    location: { pathname, search, hash, origin, href: origin + pathname + search + hash, replace(u) { if (to === null) to = u; } },
    URL, URLSearchParams,
    document: { documentElement: { classList: { contains: (c) => (c === 'fids-stream' ? stream : false) } } },
    localStorage: { getItem: (k) => (k === 'oc_mobile_pref' ? pref : null) },
    sessionStorage: { getItem: (k) => (k === 'oc_board_tab' ? tab : null) }
  };
  if (decided) ctx.__ocArrival = { to: '', mark: true, phoneBoard: false };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.top = framed ? {} : ctx;
  vm.createContext(ctx);
  vm.runInContext(handoffSource(), ctx);
  return typeof to === 'string' && to.indexOf(origin + '/') === 0 ? to.slice(origin.length) : to;
}

// ── the script is one script, early, on all three pages ───────────────────

test('fids, gids and bids carry the same desktop-site script, first in the head, before anything loads', () => {
  const ref = desktopSiteBlock('fids.html').body;
  for (const name of Object.keys(PAGES)) {
    const html = PAGES[name];
    const blk = desktopSiteBlock(name);
    assert.equal(blk.body, ref, name + ': identical to fids.html');
    const head = html.indexOf('<head>');
    assert.ok(head > 0 && /^\s*$/.test(html.slice(head + 6, blk.at)), name + ': the first thing in the head');
    const firstCss = html.indexOf('<link rel="stylesheet"');
    const firstSrc = html.search(/<script[^>]*\ssrc=/i);
    assert.ok(firstCss > blk.at && firstSrc > blk.at, name + ': before any stylesheet or script file, so nothing can lay the page out first');
    // v24145 — no static viewport meta for the script to rewrite: the phone
    // viewport never exists on a page that shows the wall board
    const outside = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
    assert.equal((outside.match(/<meta name="viewport"/g) || []).length, 0, name + ': no static viewport meta');
    assert.match(html, /<noscript><meta name="viewport" content="width=device-width, initial-scale=1\.0"><\/noscript>/, name + ': without scripts, the phone viewport');
  }
});

// ── what it does ───────────────────────────────────────────────────────────

test('a phone that asked for the board gets a desktop width', () => {
  for (const ua of [UA_IPHONE, UA_ANDROID_PHONE]) {
    const r = runPage({ ua, search: '?mode=live&ap=YQM&nomobile=1' });
    assert.equal(r.viewport, 'width=1280');
    assert.equal(r.desktop, true);
  }
});

test('a phone inside a board it chose in this tab keeps the wall board on every tap', () => {
  const r = runPage({ search: '?screen=gate&gate=2', tab: '1' });
  assert.equal(r.viewport, 'width=1280');
  assert.equal(r.desktop, true);
  assert.equal(runPage({ search: '?gate=2&mobile=ask', tab: '1' }).desktop, false, 'asked again: the phone viewport');
  assert.equal(runPage({ search: '?stream=1', tab: '1' }).desktop, false, 'a kiosk layout is not that board');
});

test('a fresh phone has the phone viewport while it is asked, whatever an older board stored', () => {
  for (const tab of [null, '', '0']) {
    const r = runPage({ search: '?ap=YQM', tab });
    assert.equal(r.viewport, 'width=device-width, initial-scale=1.0', 'tab=' + tab);
    assert.equal(r.desktop, false);
  }
});

test('displays, laptops, televisions and rotator frames never change width', () => {
  for (const ua of [UA_DESKTOP, UA_ANDROID_TV]) {
    const r = runPage({ ua, search: '?nomobile=1', tab: '1', touch: 0, screen: MAC_SCREEN });
    assert.equal(r.viewport, 'width=device-width, initial-scale=1.0', ua.slice(0, 40));
    assert.equal(r.desktop, false);
  }
  const framed = runPage({ search: '?nomobile=1', framed: true });
  assert.equal(framed.desktop, false, 'an iframe in the rotator keeps its own width');
  assert.equal(framed.viewport, 'width=device-width, initial-scale=1.0', 'and still has its meta');
});

test('blocked storage does not break the explicit flag', () => {
  const r = runPage({ search: '?nomobile=1', storageThrows: true });
  assert.equal(r.viewport, 'width=1280');
});

test('nomobile must be the whole value, not a prefix of another one', () => {
  assert.equal(runPage({ search: '?nomobile=10' }).desktop, false);
  assert.equal(runPage({ search: '?nomobile=1&x=1' }).desktop, true);
  assert.equal(runPage({ search: '?x=1&nomobile=1' }).desktop, true);
});

// ── v24139: a phone that asked its browser for the desktop site ────────────
//
// Safari and Chrome on an iPhone send a Mac user agent after "Request desktop
// site" (Chrome on Android a Linux one). The phone test missed it and the board
// was laid out at the width of the phone: the card list upright, a squeezed
// board with columns cut off sideways.

test('a phone that asked its browser for the desktop site gets the wall board, unasked', () => {
  for (const ua of [UA_DESKTOP, UA_CRIOS_DESKTOP, UA_ANDROID_DESKTOP]) {
    for (const screen of [IPHONE_SCREEN, { width: 852, height: 393 }]) {
      const r = runPage({ ua, search: '?mode=live&ap=YQM', touch: 5, screen });
      assert.equal(r.viewport, 'width=1280', ua.slice(13, 40) + ' ' + screen.width);
      assert.equal(r.desktop, true);
    }
  }
});

test('an iPad, which asks for the desktop site by default, and a Mac keep their own width', () => {
  assert.equal(runPage({ ua: UA_DESKTOP, search: '?ap=YQM', touch: 5, screen: IPAD_SCREEN }).desktop, false, 'iPad');
  assert.equal(runPage({ ua: UA_DESKTOP, search: '?ap=YQM', touch: 0, screen: MAC_SCREEN }).desktop, false, 'Mac');
  assert.equal(runPage({ ua: UA_DESKTOP, search: '?ap=YQM', touch: 0, screen: IPHONE_SCREEN }).desktop, false, 'no touch points: not a phone');
  assert.equal(runPage({ ua: UA_DESKTOP, search: '?ap=YQM', touch: 5, screen: { width: 0, height: 0 } }).desktop, false, 'no screen size: left alone');
  assert.equal(runPage({ ua: UA_CRIOS_DESKTOP, search: '?ap=YQM', touch: 5, screen: IPHONE_SCREEN, framed: true }).desktop, false, 'a rotator frame');
});

// ── the handoff: an undecided phone is asked, with the page it came for ────
// v24145 — on fids, gids and bids the decision is made in the head
// (host-airport.js fidsArrival, tests/strict-addresses.test.js); this block
// stands down when it sees it and is the fallback for a page without it.

test('the handoff stands down when the head has decided', () => {
  assert.equal(runHandoff({ search: '?ap=YQM', decided: true }), null);
  assert.equal(runHandoff({ search: '?ap=YQM', pref: 'app', decided: true }), null);
});

test('the handoff sends an undecided phone to the opener, carrying the link it opened', () => {
  assert.equal(runHandoff({ search: '?ap=YQM' }), '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=YQM'));
  assert.equal(runHandoff({ search: '?ap=YQM&screen=gate&gate=2', pathname: '/gids' }),
    '/?ap=YQM&next=' + encodeURIComponent('/gids?ap=YQM&screen=gate&gate=2'));
  assert.equal(runHandoff({ search: '', pathname: '/bids' }), '/?next=' + encodeURIComponent('/bids'));
  assert.equal(runHandoff({ search: '?ap=YQM', hash: '#m' }), '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=YQM') + '#m');
});

test('a stored answer decides nothing: the phone is asked, never sent to the app unasked', () => {
  for (const pref of ['app', 'site', '']) {
    assert.equal(runHandoff({ search: '?ap=YQM', pref }), '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=YQM'), 'pref=' + pref);
  }
});

test('the handoff keeps a phone inside a board it chose in this tab', () => {
  assert.equal(runHandoff({ search: '?ap=YQM', tab: '1' }), null);
  assert.equal(runHandoff({ search: '?ap=YQM&screen=gate&gate=2', tab: '1' }), null);
  assert.equal(runHandoff({ search: '?ap=YQM&mobile=ask', tab: '1' }), '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=YQM&mobile=ask'));
});

test('the handoff builds the opener address, it does not pass text along', () => {
  const src = handoffSource();
  assert.match(src, /var _hTo = new URL\('\/', location\.href\);/);
  assert.match(src, /_hTo\.hash = location\.hash \|\| '';\s*if \(_hTo\.origin === location\.origin\) location\.replace\(_hTo\.href\);/);
  assert.equal((src.match(/location\.replace\(/g) || []).length, 1);
  // an airport that is no code is not carried; the link still is
  assert.equal(runHandoff({ search: '?ap=' + encodeURIComponent('//evil.test') }), '/?next=' + encodeURIComponent('/fids?ap=%2F%2Fevil.test'));
  assert.equal(runHandoff({ search: '?ap=yqm' }), '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=yqm'));
  assert.equal(runHandoff({ search: '?ap=YQM', hash: '#//evil.test' }), '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=YQM') + '#//evil.test');
});

test('only nomobile=1 is the board answer for the handoff too', () => {
  for (const q of ['?ap=YQM&nomobile=0', '?ap=YQM&nomobile', '?ap=YQM&nomobile=10', '?ap=YQM&nomobile=']) {
    assert.notEqual(runHandoff({ search: q }), null, q + ' is asked');
  }
  assert.equal(runHandoff({ search: '?nomobile=1&ap=YQM' }), null);
});

test('the escape hatches and the display guards are unchanged', () => {
  assert.equal(runHandoff({ search: '?ap=YQM&nomobile=1' }), null);
  assert.equal(runHandoff({ search: '?ap=YQM&stream=1' }), null);
  assert.equal(runHandoff({ search: '?ap=YQM', framed: true }), null);
  assert.equal(runHandoff({ search: '?ap=YQM', stream: true }), null);
  assert.equal(runHandoff({ ua: UA_DESKTOP, search: '?ap=YQM' }), null);
  assert.equal(runHandoff({ ua: UA_ANDROID_TV, search: '?ap=YQM' }), null);
});

// ── v24139: request desktop site on the app hands the phone to the board ──

const APP = rd('app.html');
function appDesktopBlock() {
  const hits = scriptBlocks(APP).filter((b) => b.body.includes('asksDesktop'));
  assert.equal(hits.length, 1, 'app.html: exactly one desktop-request script');
  const viewport = APP.indexOf('<meta name="viewport"');
  const firstLink = APP.indexOf('<link ');
  assert.ok(viewport > 0 && viewport < hits[0].at, 'after the viewport meta');
  assert.ok(firstLink < 0 || firstLink > hits[0].at, 'before any stylesheet');
  return hits[0].body;
}
function runApp({ ua = UA_CRIOS_DESKTOP, search = '?ap=YQM', touch = 5, screen = IPHONE_SCREEN, framed = false, hostname = 'yqm.orionconnected.com', helper = null } = {}) {
  let to = null;
  const ctx = {
    navigator: { userAgent: ua, maxTouchPoints: touch },
    screen,
    location: { hostname, search, replace(u) { if (to === null) to = u; } }
  };
  if (helper) ctx.fidsBoardUrl = helper;
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.top = framed ? {} : ctx;
  vm.createContext(ctx);
  vm.runInContext(appDesktopBlock(), ctx);
  return to;
}

test('request desktop site on the app opens the board, with the state it carried', () => {
  assert.equal(runApp(), '/fids?ap=YQM&mode=live&nomobile=1');
  assert.equal(runApp({ search: '?ap=YQM&screen=gate&gate=2' }), '/fids?ap=YQM&screen=gate&gate=2&mode=live&nomobile=1');
  assert.equal(runApp({ search: '' }), '/fids?mode=live&nomobile=1');
  assert.equal(runApp({ search: '?mode=live&ap=YQM&nomobile=1' }), '/fids?mode=live&ap=YQM&nomobile=1');
  assert.equal(runApp({ ua: UA_ANDROID_DESKTOP }), '/fids?ap=YQM&mode=live&nomobile=1');
});

test('on .app the app is the app: a desktop request stays there', () => {
  for (const hostname of ['orionconnected.app', 'yqm.orionconnected.app', 'fids.orionconnected.app', 'YQM.OrionConnected.app']) {
    assert.equal(runApp({ hostname }), null, hostname);
  }
});

test('on .com and .ca the desktop request goes straight to the airport address, through the one helper', () => {
  const calls = [];
  const helper = (code, page, q) => { calls.push([code, page, q]); return 'https://' + code.toLowerCase() + '.orionconnected.com/' + page + '?x'; };
  assert.equal(runApp({ helper }), 'https://yqm.orionconnected.com/fids?x');
  assert.deepEqual(calls[0], ['YQM', 'fids', '?ap=YQM&mode=live&nomobile=1']);
  assert.equal(runApp({ helper, search: '' }), '/fids?mode=live&nomobile=1', 'no airport to name: the plain board, which then moves');
});

test('the app is left alone everywhere else', () => {
  assert.equal(runApp({ ua: UA_IPHONE }), null, 'a phone in its own mode is using the app');
  assert.equal(runApp({ ua: UA_ANDROID_PHONE }), null);
  assert.equal(runApp({ ua: UA_DESKTOP, touch: 0, screen: MAC_SCREEN }), null, 'a Mac opening the app');
  assert.equal(runApp({ ua: UA_DESKTOP, touch: 5, screen: IPAD_SCREEN }), null, 'an iPad');
  assert.equal(runApp({ framed: true }), null, 'a frame');
});

// ── v24139: a phone zoomed in on the board still reads the page size ──────
//
// Safari reports innerWidth/innerHeight as the part of the page on screen, so a
// phone zoomed in on the 1280 board read as a page a few hundred pixels wide:
// the map gave way to the old skyline (under 800) and the board code took its
// phone layouts (under 700).

test('zoomed in, the board still reads its own page size, on every board page', () => {
  for (const name of Object.keys(PAGES)) {
    const r = runPage({ name, search: '?ap=YQM&nomobile=1' });
    assert.equal(r.desktop, true);
    r.view.w = 520; r.view.h = 873;           // pinched in, about 2.5x
    assert.equal(r.win.innerWidth, 1280, name + ': the page width, not the zoomed view');
    assert.equal(r.win.innerHeight, 2146, name + ': the page height');
    r.view.w = 1280; r.view.h = 2400;         // toolbar gone, fully out
    assert.equal(r.win.innerWidth, 1280);
    assert.equal(r.win.innerHeight, 2400, 'the larger of the two, as before');
  }
});

test('the sizes are untouched where the page keeps its own width', () => {
  for (const opts of [
    { ua: UA_DESKTOP, touch: 0, screen: MAC_SCREEN, search: '?nomobile=1' },
    { ua: UA_IPHONE, search: '?ap=YQM' },
    { ua: UA_IPHONE, search: '?nomobile=1', framed: true },
  ]) {
    const r = runPage(Object.assign({ visual: { w: 520, h: 873 } }, opts));
    assert.equal(r.desktop, false);
    assert.equal(r.win.innerWidth, 520, 'left as the browser reports it');
  }
});

// ── v24145: one reading of the board answer, in the head and in the address ─
//
// The viewport script of each board (inline, first in the head) and
// fidsArrival in host-airport.js (the next thing to run) each decide whether
// a phone is showing the wall board. They cannot share code, so this holds
// them together: for every address and every state of the tab, the page is
// laid out wide exactly when the address logic calls it a phone in a board.

const HOST_AIRPORT = rd('js/host-airport.js');
function arrivalOf(url, ctx) {
  const u = new URL(url);
  const store = { getItem: () => null, setItem() {}, removeItem() {} };
  const win = {
    location: { hostname: 'www.orionconnected.com', pathname: '/credits', search: '', hash: '', href: 'https://www.orionconnected.com/credits', replace() {} },
    navigator: { userAgent: UA_DESKTOP }, localStorage: store, sessionStorage: store
  };
  win.self = win; win.top = win;
  new Function('window', 'sessionStorage', HOST_AIRPORT)(win, store);
  return win.fidsArrival({ hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash },
    Object.assign({ fallback: 'YQM' }, ctx), win.fidsHostAirport, win.fidsRealIata);
}

test('the head and the address logic agree on which phone is showing the board', () => {
  const searches = [
    '', '?ap=YQM', '?nomobile=1', '?ap=YQM&nomobile=1', '?nomobile=1&gate=2', '?nomobile=0', '?nomobile', '?nomobile=', '?nomobile=10', '?nomobile=1x',
    '?xnomobile=1', '?mobile=ask', '?mobile=ask&nomobile=1', '?gate=2&mobile=ask', '?stream=1', '?yt=1', '?compact', '?compact=1', '?stream', '?streams=1',
    '?stream=1&nomobile=1', '?yt=1&nomobile=0', '?compact&mobile=ask', '?screen=gate&gate=2', '?screen=ABCDEF'
  ];
  for (const name of Object.keys(PAGES)) {
    for (const search of searches) {
      for (const tab of [null, '1']) {
        const wide = runPage({ name, search, tab }).desktop;
        const a = arrivalOf('https://yqm.orionconnected.com/' + name.replace('.html', '') + search, { phone: true, inBoard: tab === '1' });
        assert.equal(a.phoneBoard, wide, name + search + ' tab=' + tab);
        // and a phone is either in the board, on a kiosk, or sent to be asked: never left on a narrow board unasked
        const kiosk = /[?&](stream|yt|compact)([=&]|$)/.test(search);
        assert.equal(/^\/\?/.test(a.to), !wide && !kiosk, name + search + ' tab=' + tab + ': asked');
        // a display is never either
        const d = arrivalOf('https://yqm.orionconnected.com/' + name.replace('.html', '') + search, { phone: false, inBoard: tab === '1' });
        assert.equal(d.phoneBoard, false);
        assert.equal(runPage({ name, search, tab, ua: UA_ANDROID_TV }).desktop, false);
      }
    }
  }
});

test('the two read the kiosk keys and nomobile=1 with the same patterns', () => {
  for (const [name, html] of Object.entries(PAGES)) {
    const body = desktopSiteBlock(name).body;
    assert.ok(body.includes('/[?&]nomobile=1(&|$)/.test(q)'), name);
    assert.ok(body.includes('/[?&](stream|yt|compact)([=&]|$)/.test(q)'), name);
    assert.ok(html.length > 0);
  }
  assert.ok(HOST_AIRPORT.includes('var KIOSK = /[?&](stream|yt|compact)([=&]|$)/;'));
  assert.ok(HOST_AIRPORT.includes('var NO_MOBILE = /[?&]nomobile=1(&|$)/;'));
  assert.doesNotMatch(HOST_AIRPORT, /nomobile\(\[=&\]\|\$\)/, 'no pattern left that takes any value of nomobile');
  assert.doesNotMatch(CORE, /\[\?&\]\(nomobile\|/, 'nor in the hand-off of fids-core.js');
  assert.ok(rd('index.html').includes('if (/[?&]nomobile=1(&|$)/.test(qs)) {'), 'nor in the opener');
});
