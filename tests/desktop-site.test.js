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
function runPage({ ua = UA_IPHONE, search = '', pref = null, framed = false, storageThrows = false, name = 'fids.html', touch = 5, screen = IPHONE_SCREEN } = {}) {
  const meta = { content: 'width=device-width, initial-scale=1.0', setAttribute(k, v) { if (k === 'content') this.content = v; } };
  const classes = new Set();
  const ctx = {
    navigator: { userAgent: ua, maxTouchPoints: touch },
    screen,
    location: { search },
    document: {
      querySelector: (sel) => (sel === 'meta[name="viewport"]' ? meta : null),
      documentElement: { classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) } }
    },
    localStorage: storageThrows
      ? { getItem() { throw new Error('blocked'); } }
      : { getItem: (k) => (k === 'oc_mobile_pref' ? pref : null) }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.top = framed ? {} : ctx;
  vm.createContext(ctx);
  vm.runInContext(desktopSiteBlock(name).body, ctx);
  return { viewport: meta.content, desktop: classes.has('fids-desktop-site') };
}

/** The handoff IIFE from fids-core, run against a phone. */
function handoffSource() {
  const a = CORE.indexOf('// ── PHONE HANDOFF → app.html');
  const b = CORE.indexOf('// ── CROSS-DEVICE SCREEN STATE', a);
  assert.ok(a > 0 && b > a, 'the handoff block is where it was');
  return CORE.slice(a, b);
}
function runHandoff({ ua = UA_IPHONE, search = '', pref = null, framed = false, stream = false, pathname = '/fids' } = {}) {
  let to = null;
  const ctx = {
    navigator: { userAgent: ua },
    location: { pathname, search, hash: '', replace(u) { if (to === null) to = u; } },
    document: { documentElement: { classList: { contains: (c) => (c === 'fids-stream' ? stream : false) } } },
    localStorage: { getItem: (k) => (k === 'oc_mobile_pref' ? pref : null) }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.top = framed ? {} : ctx;
  vm.createContext(ctx);
  vm.runInContext(handoffSource(), ctx);
  return to;
}

// ── the script is one script, early, on all three pages ───────────────────

test('fids, gids and bids carry the same desktop-site script, before any stylesheet', () => {
  const ref = desktopSiteBlock('fids.html').body;
  for (const name of Object.keys(PAGES)) {
    const html = PAGES[name];
    const blk = desktopSiteBlock(name);
    assert.equal(blk.body, ref, name + ': identical to fids.html');
    const meta = html.indexOf('<meta name="viewport"');
    const firstCss = html.indexOf('<link rel="stylesheet"');
    assert.ok(meta > 0 && meta < blk.at, name + ': after the viewport meta');
    assert.ok(firstCss > blk.at, name + ': before the first stylesheet, so the width queries never see the phone width');
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

test('a phone that answered the regular site once keeps it on every board link', () => {
  const r = runPage({ search: '?ap=YQM&screen=gate&gate=2', pref: 'site' });
  assert.equal(r.viewport, 'width=1280');
  assert.equal(r.desktop, true);
});

test('a phone that chose the app, or has not answered, is left to the handoff', () => {
  for (const pref of [null, 'app', '']) {
    const r = runPage({ search: '?ap=YQM', pref });
    assert.equal(r.viewport, 'width=device-width, initial-scale=1.0', 'pref=' + pref);
    assert.equal(r.desktop, false);
  }
});

test('displays, laptops, televisions and rotator frames never change width', () => {
  for (const ua of [UA_DESKTOP, UA_ANDROID_TV]) {
    const r = runPage({ ua, search: '?nomobile=1', pref: 'site', touch: 0, screen: MAC_SCREEN });
    assert.equal(r.viewport, 'width=device-width, initial-scale=1.0', ua.slice(0, 40));
    assert.equal(r.desktop, false);
  }
  const framed = runPage({ search: '?nomobile=1', framed: true });
  assert.equal(framed.desktop, false, 'an iframe in the rotator keeps its own width');
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

test('the handoff sends an undecided phone to the opener, carrying the link it opened', () => {
  assert.equal(runHandoff({ search: '?ap=YQM' }), '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=YQM'));
  assert.equal(runHandoff({ search: '?ap=YQM&screen=gate&gate=2', pathname: '/gids' }),
    '/?ap=YQM&next=' + encodeURIComponent('/gids?ap=YQM&screen=gate&gate=2'));
  assert.equal(runHandoff({ search: '', pathname: '/bids' }), '/?next=' + encodeURIComponent('/bids'));
  assert.equal(runHandoff({ search: '?ap=YQM', pref: '' }), '/?ap=YQM&next=' + encodeURIComponent('/fids?ap=YQM'));
});

test('the handoff still sends a phone that chose the app straight to it', () => {
  assert.equal(runHandoff({ search: '?ap=YQM', pref: 'app' }), 'app.html?ap=YQM');
  assert.equal(runHandoff({ search: '?ap=YQM&screen=gate&gate=2', pref: 'app' }), 'app.html?ap=YQM&screen=gate&gate=2');
});

test('the handoff keeps a phone that chose the regular site on the board', () => {
  assert.equal(runHandoff({ search: '?ap=YQM', pref: 'site' }), null);
  assert.equal(runHandoff({ search: '?ap=YQM&screen=gate&gate=2', pref: 'site' }), null);
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
function runApp({ ua = UA_CRIOS_DESKTOP, search = '?ap=YQM', touch = 5, screen = IPHONE_SCREEN, framed = false } = {}) {
  let to = null;
  const ctx = {
    navigator: { userAgent: ua, maxTouchPoints: touch },
    screen,
    location: { search, replace(u) { if (to === null) to = u; } }
  };
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

test('the app is left alone everywhere else', () => {
  assert.equal(runApp({ ua: UA_IPHONE }), null, 'a phone in its own mode is using the app');
  assert.equal(runApp({ ua: UA_ANDROID_PHONE }), null);
  assert.equal(runApp({ ua: UA_DESKTOP, touch: 0, screen: MAC_SCREEN }), null, 'a Mac opening the app');
  assert.equal(runApp({ ua: UA_DESKTOP, touch: 5, screen: IPAD_SCREEN }), null, 'an iPad');
  assert.equal(runApp({ framed: true }), null, 'a frame');
});
