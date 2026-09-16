'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23808 — THE OPENER ASKS A PHONE INSTEAD OF DECIDING FOR IT.
//
// index.html used to location.replace() a phone straight to app.html on
// whatever domain it arrived on, before anything painted. That was a hijack of
// a deliberately shared link, and its test for "a phone" — `w < 700` — also
// catches a desktop browser in a narrow window.
//
// These tests RUN the router rather than reading it. The whole thing is a
// decision tree over hostname, user agent, viewport, query string and a stored
// preference, and the failures that matter are combinations: a display that
// gets asked, an escape hatch that stops working, a preference that traps
// someone on a choice they cannot undo. A regex over the source proves none of
// that.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'fids-current', 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'fids-current', 'app.html'), 'utf8');

/**
 * Every attribute-less <script> body in a page, in order.
 *
 * Walked rather than matched. A regex for this trips CodeQL js/bad-tag-filter,
 * and the rule has a point even though nothing here is sanitising anything:
 * the obvious pattern is case-sensitive and blind to attributes, so it quietly
 * reads the wrong blocks the moment a page is written slightly differently.
 * Scripts with a src= are skipped — their body is empty by definition.
 */
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
    if (lower.slice(open + 7, gt).trim() === '') out.push(html.slice(gt + 1, close));
    i = close + 8;
  }
  return out;
}

/** The head script that decides where an arrival goes. */
function routerSource() {
  const hit = scriptBlocks(INDEX).filter((b) => b.includes('data-oc-offer') && b.includes('nomobile'));
  assert.equal(hit.length, 1, 'expected exactly one router script in index.html');
  return hit[0];
}

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128';

/**
 * Run the router and report what it did.
 * @returns {{to: string|null, asked: boolean, app: string|null, stored: object}}
 */
function route({ host = 'fids.orionconnected.com', search = '', ua = UA_DESKTOP, width = 1440, pref = null } = {}) {
  const store = pref === null ? {} : { oc_mobile_pref: pref };
  let to = null;
  const html = {
    _attr: {},
    setAttribute(k, v) { this._attr[k] = v; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attr, k) ? this._attr[k] : null; },
    clientWidth: width
  };
  const ctx = {
    location: { hostname: host, search, hash: '', replace(u) { if (to === null) to = u; } },
    navigator: { userAgent: ua },
    document: { documentElement: html },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };
  ctx.window = ctx;
  ctx.window.innerWidth = width;
  vm.createContext(ctx);
  vm.runInContext(routerSource(), ctx);
  return {
    to,
    asked: html.getAttribute('data-oc-offer') === '1',
    app: ctx.__ocOffer ? ctx.__ocOffer.app : null,
    board: ctx.__ocOffer ? ctx.__ocOffer.board : null,
    stored: store
  };
}

// ── the thing that changed ────────────────────────────────────────────────

test('a phone is asked, not redirected', () => {
  const r = route({ ua: UA_IPHONE, width: 390 });
  assert.equal(r.asked, true, 'the offer must be raised');
  assert.equal(r.to, null, 'nothing may navigate while the question is open');
});

test('a phone is never silently sent to app.html any more', () => {
  const r = route({ ua: UA_IPHONE, width: 390 });
  assert.doesNotMatch(String(r.to), /app\.html/);
});

test('a display is never asked, whatever shape it is', () => {
  // v23824 — THIS TEST USED TO ASSERT THE OPPOSITE, AND THAT WAS THE BUG.
  //
  // It read "a narrow desktop window is asked rather than thrown into the app",
  // which sounds right until you remember what opens this page: every display
  // in the estate boots through index.html. The detector matched bare "Android"
  // — carried by every Android TV and Fire TV stick — and anything under 700px.
  //
  // Before the offer existed those devices were silently redirected to app.html:
  // wrong, but they showed something. Once the page HOLDS for an answer, a
  // misdetected display stops on a question that cannot be answered with a TV
  // remote, and the board never arrives. The stream kept working because it runs
  // a desktop Chrome at 1920 wide; the screens did not.
  //
  // fids-core.js had it right all along, and says so in its own comment: bare
  // Android without Mobile is not a phone, and it runs no width test at all.
  const TV = 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 Chrome/94 CrKey/1.54';
  const ANDROID_TV = 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) AppleWebKit/537.36 Chrome/94';
  const FIRE_TV = 'Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7233) AppleWebKit/537.36 Chrome/70';
  for (const [label, ua, width] of [
    ['an Android TV', ANDROID_TV, 1920],
    ['a Fire TV stick', FIRE_TV, 1920],
    ['a Chromecast', TV, 1920],
    ['a 690px window', TV, 690],
    ['a small panel', TV, 480]
  ]) {
    const r = route({ ua, width });
    assert.equal(r.asked, false, label + ' must never be asked — it cannot answer');
    assert.match(String(r.to), /^fids\.html\?mode=live/, label + ' must reach the board');
  }
});

test('a real phone is still asked', () => {
  const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
  for (const [label, ua, width] of [
    ['an iPhone', UA_IPHONE, 390],
    ['an Android phone', ANDROID_PHONE, 412]
  ]) {
    const r = route({ ua, width });
    assert.equal(r.asked, true, label + ' is the audience for the offer');
  }
});

// ── what must NOT be asked ────────────────────────────────────────────────

test('a display goes straight to the live board and is never asked', () => {
  const r = route({ ua: UA_DESKTOP, width: 1920 });
  assert.equal(r.asked, false, 'a screen on a wall must never be shown a question');
  assert.match(String(r.to), /^fids\.html\?mode=live/);
});

test('?nomobile=1 still forces the board on a phone, with no question', () => {
  const r = route({ ua: UA_IPHONE, width: 390, search: '?nomobile=1' });
  assert.equal(r.asked, false, 'an explicit override must not be second-guessed');
  assert.match(String(r.to), /^fids\.html\?mode=live/);
  assert.match(String(r.to), /nomobile=1/,
    'and it must survive the hop, or the board hands the phone straight back');
});

test('?entry=1 still reaches the admin entry screen from a phone', () => {
  const r = route({ ua: UA_IPHONE, width: 390, search: '?entry=1' });
  assert.equal(r.to, null);
  assert.equal(r.asked, false, 'the entry screen must not be hidden behind the offer');
});

// ── the answer sticks, and can be taken back ──────────────────────────────

test('an answered phone is not asked twice', () => {
  const stay = route({ ua: UA_IPHONE, width: 390, pref: 'site' });
  assert.equal(stay.asked, false);
  assert.match(String(stay.to), /^fids\.html\?mode=live/);
  assert.match(String(stay.to), /nomobile=1/);

  const app = route({ ua: UA_IPHONE, width: 390, pref: 'app' });
  assert.equal(app.asked, false);
  assert.match(String(app.to), /^\/app/);
});

test('?mobile=ask takes the answer back', () => {
  const r = route({ ua: UA_IPHONE, width: 390, pref: 'site', search: '?mobile=ask' });
  assert.equal(r.asked, true, 'the question must be reachable again');
  assert.equal(r.to, null);
  assert.equal('oc_mobile_pref' in r.stored, false, 'the stored answer must be cleared');
});

test('a preference never overrides an explicit override', () => {
  const r = route({ ua: UA_IPHONE, width: 390, pref: 'app', search: '?nomobile=1' });
  assert.match(String(r.to), /^fids\.html\?mode=live/,
    'nomobile=1 is the caller being explicit and outranks a remembered answer');
});

// ── where YES actually goes ───────────────────────────────────────────────

test('the app target stays on this origin', () => {
  // /app is the Companion, and it is the address confirmed working by hand:
  // fids.orionconnected.com/app?ap=MCO. Hopping to the .app domain instead cost
  // a cross-origin navigation, a second copy of this page on the far side, and
  // a preference stored on the origin you just left.
  const r = route({ host: 'yqm.orionconnected.com', ua: UA_IPHONE, width: 390 });
  assert.match(r.app, /^\/app(\?|$)/, 'the offer must link to the Companion on this origin');
  assert.doesNotMatch(r.app, /orionconnected\.app/, 'no cross-origin hop');
});

test('the airport rides across to the app', () => {
  const r = route({ host: 'yqm.orionconnected.com', ua: UA_IPHONE, width: 390 });
  assert.equal(new URL(r.app, 'https://yqm.orionconnected.com').searchParams.get('ap'), 'YQM',
    'a phone on Moncton’s domain must land on Moncton’s app');
});

test('an explicit ?ap= beats the hostname', () => {
  const r = route({ host: 'yqm.orionconnected.com', search: '?ap=YHZ', ua: UA_IPHONE, width: 390 });
  assert.equal(new URL(r.app, 'https://yqm.orionconnected.com').searchParams.get('ap'), 'YHZ');
});

test('our own hostnames are not mistaken for airports', () => {
  for (const h of ['fids.orionconnected.com', 'www.orionconnected.com', 'app.orionconnected.com']) {
    const r = route({ host: h, ua: UA_IPHONE, width: 390 });
    assert.equal(new URL(r.app, 'https://x.orionconnected.com').searchParams.get('ap'), null,
      `${h} is a site, not an airport — it must not become ?ap=`);
  }
  const apex = route({ host: 'orionconnected.com', ua: UA_IPHONE, width: 390 });
  assert.equal(new URL(apex.app, 'https://orionconnected.com').searchParams.get('ap'), null);
});

// ── .app means the app all the way down ───────────────────────────────────

/** Run the .app handover for one hostname and report where it sent us. */
function handover(host, search = '') {
  const hit = scriptBlocks(INDEX).filter((b) => b.includes('orionconnected.app') && b.includes('location.replace("/app"'));
  assert.equal(hit.length, 1, 'expected exactly one .app handover script');
  let to = null;
  const ctx = { location: { hostname: host, search, hash: '', replace(u) { if (to === null) to = u; } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(hit[0], ctx);
  return to;
}

test('every .app host hands over to the app, not just the root', () => {
  for (const h of ['orionconnected.app', 'www.orionconnected.app',
                   'yqm.orionconnected.app', 'yhz.orionconnected.app']) {
    assert.equal(handover(h), '/app', `${h} must hand over to the app`);
  }
});

test('the handover does not reach past its own zone', () => {
  for (const h of ['orionconnected.com', 'yqm.orionconnected.com', 'orionconnected.ca',
                   'orionconnected.app.example.com', 'notorionconnected.app']) {
    assert.equal(handover(h), null, `${h} must NOT be treated as the app domain`);
  }
});

test('the handover carries the query string and hash across', () => {
  assert.equal(handover('yqm.orionconnected.app', '?ap=YHZ'), '/app?ap=YHZ');
});

test('the app can see the hostname at all', () => {
  // Without this the pretty per-airport .app link opens on whatever airport the
  // device looked at last, which is worse than not offering the link.
  assert.match(APP, /<script src="js\/host-airport\.js\?v=\d+"><\/script>/,
    'app.html must load host-airport.js');
  const at = APP.indexOf('js/host-airport.js');
  const resolves = APP.indexOf("sessionStorage.getItem('fids_airport')");
  assert.ok(at > 0 && resolves > at,
    'host-airport.js must load before the app resolves its airport');
});

test('the hostname parse still has exactly one home', () => {
  // The router builds a query string from a crude label on purpose, and says
  // so. What must not appear is a second implementation of the real parse.
  assert.equal((APP.match(/function hostAirport\s*\(/g) || []).length, 0,
    'app.html must not re-implement the parse — it loads the file that owns it');
});

// ── both languages, and the order of them ─────────────────────────────────

test('the offer is bilingual', () => {
  for (const s of ['Use the mobile app', 'Stay on the regular site',
                   'Utiliser l’application mobile', 'Rester sur le site normal']) {
    assert.ok(INDEX.includes(s), `the offer is missing: ${s}`);
  }
});

test('French leads at the Quebec airports', () => {
  const m = INDEX.match(/var QC = \{([^}]*)\}/);
  assert.ok(m, 'the offer must know which airports read French first');
  for (const c of ['YUL', 'YQB', 'YHU']) {
    assert.match(m[1], new RegExp(`\\b${c}\\b`), `${c} is in Quebec and must lead in French`);
  }
  assert.doesNotMatch(m[1], /\bYQM\b/,
    'Moncton is in New Brunswick — bilingual, but not French-first under this rule');
});

// ── the shape of the thing ────────────────────────────────────────────────

test('neither answer leaves the question in history', () => {
  const body = INDEX.slice(INDEX.indexOf('id="ocOffer"'));
  assert.doesNotMatch(body.slice(0, 4000), /location\.(assign|href\s*=)/,
    'Back from either destination must not land on a question already answered');
});

test('the entry screen cannot sit behind the offer', () => {
  assert.match(INDEX, /html\[data-oc-offer="1"\] body > \*:not\(#ocOffer\) \{ display: none !important; \}/,
    'the admin DEMO/LOGIN screen must be hidden while the offer is up');
});

// ── the two handoffs have to agree ────────────────────────────────────────
// There are TWO phone handoffs in this codebase, and they are in different
// files. index.html routes an arrival at "/", and fids-core.js hands a phone
// off again on every board page it loads. Neither knows about the other.
//
// That is how "stay on the regular site" came to land on app.html: the opener
// honoured the answer, sent the phone to the board, and the board sent it
// straight into the app a moment later. The button did the exact opposite of
// what it said, and nothing failed.
//
// So this test does not check a string. It takes the URL the opener hands a
// phone and runs fids-core's OWN guard against it.

const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

/** fids-core's phone handoff: does it let this URL through to the board? */
function boardKeepsIt(url) {
  const m = CORE.match(/if \(\/\[\?&\]\((nomobile\|[a-z|]+)\)\(\[=&\]\|\$\)\/\.test\(_hq\)\) return;/);
  assert.ok(m, 'fids-core.js must still guard its phone handoff on a query string');
  const guard = new RegExp('[?&](' + m[1] + ')([=&]|$)');
  const search = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?')) : '';
  return guard.test(search);
}

test('the board does not undo the answer', () => {
  const r = route({ ua: UA_IPHONE, width: 390 });
  assert.ok(boardKeepsIt(r.board),
    'a phone that chose to stay must survive arriving at the board — otherwise ' +
    'fids-core hands it to app.html and the button lied');
});

test('every route to the board from a phone survives the board', () => {
  for (const c of [
    { label: 'remembered answer', opts: { pref: 'site' } },
    { label: '?nomobile=1 from the root', opts: { search: '?nomobile=1' } },
    { label: 'override beating a remembered app answer', opts: { pref: 'app', search: '?nomobile=1' } }
  ]) {
    const r = route(Object.assign({ ua: UA_IPHONE, width: 390 }, c.opts));
    assert.ok(boardKeepsIt(String(r.to)), `${c.label}: the board would hand it back`);
  }
});

test('a display still reaches the board without the override', () => {
  // The override is only needed where fids-core would act. Adding it to every
  // URL would put a meaningless query string on every screen in the estate.
  const r = route({ ua: UA_DESKTOP, width: 1920 });
  assert.doesNotMatch(String(r.to), /nomobile/,
    'a wall display is not a phone and needs no escape hatch');
});

// ── nothing else may navigate while the question is open ──────────────────
// The offer holds the page instead of leaving it, and that is a change of KIND,
// not degree. Every other script on the opener was written when the head had
// already redirected a phone away before the body ran — so anything that
// navigates on load was, on a phone, unreachable code.
//
// It is reachable now. A signed-in session hitting `if (Auth.init())` at the
// bottom of the body threw the page to picker.html out from under the offer:
// the question painted and was gone before it could be answered. Only phones
// saw it, because only phones are asked, and only while signed in.

/** Run the opener's bottom script with a signed-in session. */
function bottomScript({ offering }) {
  const hit = scriptBlocks(INDEX).filter((b) => b.includes("Auth.init()"));
  assert.equal(hit.length, 1, 'expected exactly one session-check script');
  let went = null;
  const html = {
    getAttribute: (k) => (k === 'data-oc-offer' && offering ? '1' : null)
  };
  const ctx = {
    Auth: { init: () => true },                       // signed in
    document: { documentElement: html, addEventListener() {}, getElementById: () => ({}) },
    sessionStorage: { setItem() {}, getItem: () => null },
    setTimeout() {}
  };
  ctx.window = ctx;
  ctx.window.location = { href: '', assign(u) { went = u; } };
  Object.defineProperty(ctx.window.location, 'href', {
    get: () => '', set: (u) => { went = u; }
  });
  ctx.location = ctx.window.location;
  vm.createContext(ctx);
  vm.runInContext(hit[0], ctx);
  return went;
}

test('a signed-in session does not jump to the picker while the offer is up', () => {
  assert.equal(bottomScript({ offering: true }), null,
    'the page belongs to the question until it is answered');
});

test('a signed-in session still reaches the picker when nothing is being asked', () => {
  assert.equal(bottomScript({ offering: false }), 'picker.html',
    'desktop behaviour must be exactly what it always was');
});

// ── the question must not survive its own answer ──────────────────────────
// "Use the mobile app" leaves this origin for the .app zone — and index.html
// is what that zone serves at "/". So the router ran again on the far side of
// its own answer, on a domain where the question makes no sense, and neither
// answer worked: "stay" gave the full board ON orionconnected.app, and "use
// the app" replaced the page with the URL it was already showing.
//
// The .com side looked perfect throughout, which is why this was invisible.

test('the offer is never raised on the .app zone', () => {
  for (const h of ['orionconnected.app', 'www.orionconnected.app', 'yqm.orionconnected.app']) {
    const r = route({ host: h, ua: UA_IPHONE, width: 390, search: '?ap=YQM' });
    assert.equal(r.asked, false, `${h} IS the app — it must not ask`);
    assert.equal(r.to, null, `${h} must be left to the handover, not routed`);
  }
});

test('a remembered answer cannot loop the app onto itself', () => {
  // The worst shape: answered "app" while standing on the app.
  const r = route({ host: 'orionconnected.app', ua: UA_IPHONE, width: 390, search: '?ap=YQM', pref: 'app' });
  assert.equal(r.to, null, 'it must not replace() the page with the page');
});

test('a remembered answer cannot put the full board on the app domain', () => {
  const r = route({ host: 'orionconnected.app', ua: UA_IPHONE, width: 390, search: '?ap=YQM', pref: 'site' });
  assert.equal(r.to, null,
    'fids.html on orionconnected.app is the full site on the app’s own domain');
});

test('the .com side is untouched by that guard', () => {
  // The guard must be about the zone, not about phones in general.
  const r = route({ host: 'yqm.orionconnected.com', ua: UA_IPHONE, width: 390 });
  assert.equal(r.asked, true, 'the question still belongs on the site that is not the app');
  const wall = route({ ua: UA_DESKTOP, width: 1920 });
  assert.match(String(wall.to), /^fids\.html\?mode=live/);
});
