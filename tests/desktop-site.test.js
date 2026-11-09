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
function runPage({ ua = UA_IPHONE, search = '', pref = null, framed = false, storageThrows = false, name = 'fids.html' } = {}) {
  const meta = { content: 'width=device-width, initial-scale=1.0', setAttribute(k, v) { if (k === 'content') this.content = v; } };
  const classes = new Set();
  const ctx = {
    navigator: { userAgent: ua },
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
function runHandoff({ ua = UA_IPHONE, search = '', pref = null, framed = false, stream = false } = {}) {
  let to = null;
  const ctx = {
    navigator: { userAgent: ua },
    location: { search, hash: '', replace(u) { if (to === null) to = u; } },
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
    const r = runPage({ ua, search: '?nomobile=1', pref: 'site' });
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

// ── the handoff respects the remembered answer ─────────────────────────────

test('the handoff still sends an undecided phone to the app', () => {
  assert.equal(runHandoff({ search: '?ap=YQM' }), 'app.html?ap=YQM');
  assert.equal(runHandoff({ search: '?ap=YQM', pref: 'app' }), 'app.html?ap=YQM');
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
