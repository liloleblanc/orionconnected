'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24069 — TWO THINGS ON ROBERVAL'S BOARD (YRJ, an airport with no flight
// feed), seen live on v24067:
//
// 1. 'Aucune donnée en direct | No live data' was nearly invisible: the bare
//    status-message grey (#52525b) on the teal theme's blue, about 1.1:1. It
//    is drawn in the board's own notice box now (the feed-down panel's
//    .ffn-box: light ink on a dark plate), with its words unchanged.
// 2. The header said 'Roberval Airport', English, under the code of a
//    French-first board. The airport's name follows the board's languages
//    now, French first in Québec, from the store (AP's hdrKey/hdrName).
//
// The first test reads the code and the stylesheet and works the contrast
// out for the worst ground a theme can paint (white: the plate is lightest
// there, and its ink is light). The second draws the real board in headless
// Chrome, in every theme the departures board offers, by day and by night,
// and measures the notice's ink against the colour actually under it; and
// draws the header at the board sizes with the longest names. It skips when
// no Chrome or Chromium is installed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', 'fids-current');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'display-overrides.css'), 'utf8');
const BS = require(path.join(ROOT, 'js', 'board-strings.js'));
const HARNESS = pathToFileURL(path.join(__dirname, 'render', 'words.mjs')).href;

// WCAG 2 relative luminance and contrast
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function ruleBody(sel) {
  const at = CSS.indexOf(sel);
  assert.ok(at >= 0, 'display-overrides.css must have ' + sel);
  return CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));
}

test('the no-feed notice is the board\'s notice box, its words unchanged, readable on any ground', () => {
  const st = CORE.slice(CORE.indexOf('function setState(which, show)'), CORE.indexOf('// v23430 — A DEAD BOARD SENDS ITSELF TO THE TOUR.'));
  // the same two lines of the store, in the board's languages
  assert.match(st, /el\.innerHTML = '<div class="ffn-box">' \+ BoardStrings\.pair\('noLiveData', \{ iata: ap, upper: true \}\) \+ '<\/div>';/);
  assert.match(st, /_sub\.textContent = BoardStrings\.pair\('noFeedYet', \{ iata: ap, upper: true, plain: true, raw: true, fields: \{ AIRPORT: _apTxt \} \}\);/);
  assert.match(st, /el\.firstChild\.appendChild\(_sub\);\n\s*el\.classList\.add\('fids-no-feed'\);/);
  // and the class leaves with the message (a quiet hour, a feed that is down)
  assert.match(st, /if \(which === 'empty' && show\) \{\n\s*try \{ document\.getElementById\('panelEmpty'\)\.classList\.remove\('fids-no-feed'\); \} catch \(e\) \{\}/);
  assert.match(st, /_pe\.classList\.remove\('fids-no-feed'\);/);
  // the box's plate and ink
  const box = ruleBody('html body #panelEmpty.fids-no-feed .ffn-box {');
  const plate = /background: rgba\((\d+), (\d+), (\d+), ([\d.]+)\) !important;/.exec(box);
  const ink = /color: (#[0-9a-f]{6}) !important;/i.exec(box);
  assert.ok(plate && ink, 'the box has its plate and its ink');
  const sub = /color: rgba\((\d+), (\d+), (\d+), ([\d.]+)\) !important;/.exec(ruleBody('html body #panelEmpty.fids-no-feed .ffn-box .sub {'));
  assert.ok(sub, 'the second line has its ink');
  const pRGB = [+plate[1], +plate[2], +plate[3]], pA = +plate[4];
  for (const ground of [[255, 255, 255], [199, 210, 221], [13, 77, 139], [20, 24, 30], [0, 0, 0]]) {
    const bg = over(pRGB, pA, ground);
    const main = contrast(hex(ink[1]), bg);
    const second = contrast(over([+sub[1], +sub[2], +sub[3]], +sub[4], bg), bg);
    assert.ok(main >= 4.5, `the first line reads at ${main.toFixed(2)}:1 over ${ground}`);
    assert.ok(second >= 4.5, `the second line reads at ${second.toFixed(2)}:1 over ${ground}`);
  }
  // what it was: the status-message grey on the teal theme's blue
  assert.ok(contrast(hex('#52525b'), [13, 77, 139]) < 1.5);
});

test('the header\'s airport name: the store\'s, in the board\'s languages, French first in Québec', () => {
  const head = CORE.slice(CORE.indexOf('function _apHeaderNameHtml(iata)'), CORE.indexOf('// ── PHASE 4: APPLY ADMIN-SAVED CONFIG TO LIVE BOARD'));
  assert.match(head, /return BoardStrings\.pair\(a\.hdrKey, \{/);
  // every place that writes the pill's name goes through it
  assert.match(CORE, /\/\/ Display name \(pill sub-label\) — in the board's languages \(v24069\)\n\s*_apHeaderNameSet\(document\.getElementById\('hdrApName'\), iata, _adminCfg\);/);
  assert.doesNotMatch(CORE, /getElementById\('hdrApName'\)\.textContent = /);
  assert.doesNotMatch(CORE, /hdrInit\.textContent = /);
  assert.match(CORE, /'<div class="fids-airport-name">' \+ \(_apHeaderNameHtml\(iata\) \|\| fidsEscHtml\(\(AP\[iata\] \|\| \{\}\)\.name \|\| iata\)\) \+ '<\/div>'/, 'the belts\' pill too');
  // and a language change paints it again
  const follow = CORE.slice(CORE.indexOf('function _fidsBoardWordsFollowLangs()'), CORE.indexOf('BoardStrings.onLangs(_fidsBoardWordsFollowLangs)'));
  assert.match(follow, /_apHeaderNameSet\(_hn, ap, /);
  // AP's names: every Québec airport the table knows, each with a store entry
  const AP = Function('return ' + (function () {
    const at = CORE.indexOf('const AP = {'); let d = 0;
    for (let k = CORE.indexOf('{', at); k < CORE.length; k++) { if (CORE[k] === '{') d++; else if (CORE[k] === '}' && --d === 0) return CORE.slice(CORE.indexOf('{', at), k + 1); }
    return '{}';
  })())();
  const quebec = BS.FR_FIRST.filter((c) => AP[c]);
  assert.ok(quebec.length >= 9, 'the Québec airports in AP: ' + quebec.join(' '));
  for (const c of quebec) assert.ok(AP[c].hdrKey, c + ' has a name in the store');
  for (const [c, a] of Object.entries(AP)) {
    if (!a.hdrKey) continue;
    const e = BS.STR[a.hdrKey];
    assert.ok(e, c + ': ' + a.hdrKey + ' is in the store');
    const needs = /\{NAME\}/.test(e.en);
    assert.equal(!!a.hdrName, needs, c + ': a template entry takes the place as hdrName, a whole entry none');
    for (const l of BS.LANGS) assert.equal(/\{NAME\}/.test(e[l]), needs, c + ' ' + l);
    // the pair: both of the board's languages, French first in Québec
    const langs = BS.defaultLangs(c);
    const pair = BS.pair(a.hdrKey, { langs, iata: c, fields: a.hdrName ? { NAME: a.hdrName } : null, plain: true }).split(' | ');
    assert.equal(pair.length, 2, c + ': ' + pair.join(' | '));
    const first = BS.isFrFirst(c) ? 'fr' : langs[0];
    assert.equal(pair[0], BS.fill(e[first], a.hdrName ? { NAME: a.hdrName } : null, true), c + ' leads in ' + first);
    if (BS.isFrFirst(c)) assert.match(pair[0], /^Aéroport /, c + ': French first');
  }
  // Roberval, as reported
  assert.equal(BS.pair('apHdrAirport', { langs: ['fr', 'en'], iata: 'YRJ', fields: { NAME: AP.YRJ.hdrName }, plain: true }), 'Aéroport de Roberval | Roberval Airport');
});

// Installed in the page. Nothing from this file reaches page code but names
// of themes and whole numbers.
const PAGE = `(function () {
  var parse = function (s) { var m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
  var lin = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  var lum = function (c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); };
  var cr = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  var over = function (fg, bg) { var a = fg[3]; return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)]; };
  // the colour under an element: its ancestors' fills, composited up from the page's
  var groundOf = function (el) {
    var chain = [];
    for (var e = el; e; e = e.parentElement) chain.push(e);
    var c = [255, 255, 255];
    for (var i = chain.length - 1; i >= 0; i--) { var f = parse(getComputedStyle(chain[i]).backgroundColor); if (f && f[3] > 0) c = over(f, c); }
    return c;
  };
  window.__nf = {
    judge: function () {
      var pe = document.getElementById('panelEmpty');
      if (!pe || pe.style.display !== 'block' || !pe.classList.contains('fids-no-feed')) return { up: false };
      var box = pe.querySelector('.ffn-box'), out = [], min = 99;
      var parts = box.querySelectorAll('.bs-h, .sub');
      for (var k = 0; k < parts.length; k++) {
        var el = parts[k], cs = getComputedStyle(el);
        var g = groundOf(el.classList.contains('sub') ? box : el);
        var ink = over(parse(cs.color), g);
        var r = cr(ink, g); if (r < min) min = r;
        if (r < 4.5) out.push(JSON.stringify(el.textContent) + ' reads at ' + r.toFixed(2) + ':1');
        var b = el.getBoundingClientRect();
        if (b.right > innerWidth + 1 || b.left < -1) out.push(JSON.stringify(el.textContent) + ' runs off the screen');
      }
      return { up: true, text: box.innerText, min: Math.round(min * 100) / 100, problems: out, ground: groundOf(pe.parentElement).map(Math.round) };
    },
    header: function () {
      var nm = document.getElementById('hdrApName');
      var box = function (el) { var r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      var ov = function (a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; };
      // the words' own extent (the label's and the clock's boxes are wider
      // than their letters)
      var ink = function (el) {
        if (!el) return null;
        var rg = document.createRange(); rg.selectNodeContents(el);
        var rs = [].filter.call(rg.getClientRects(), function (r) { return r.width > 0 && r.height > 0; });
        if (!rs.length) return null;
        return [Math.min.apply(null, rs.map(function (r) { return r.left; })), Math.min.apply(null, rs.map(function (r) { return r.top; })),
          Math.max.apply(null, rs.map(function (r) { return r.right; })), Math.max.apply(null, rs.map(function (r) { return r.bottom; }))];
      };
      var n = ink(nm), out = [];
      var lb = ink(document.getElementById('hdrBoard')), ck = ink(document.getElementById('clock')), dt = ink(document.getElementById('clockDate'));
      if (lb && ov(n, lb)) out.push('the name runs into the board label');
      if ((ck && ov(n, ck)) || (dt && ov(n, dt))) out.push('the name runs into the clock');
      var tm = document.querySelector('.fids-banner-time-block');
      if (tm && ck && ck[2] > box(tm)[2] + 1) out.push('the clock is pushed out of its block');
      if (n[0] < 0 || n[2] > innerWidth) out.push('the name runs off the screen');
      if (nm.scrollWidth > nm.clientWidth + 1) out.push('the name is cut (' + nm.scrollWidth + ' > ' + nm.clientWidth + ')');
      var halves = [].map.call(nm.querySelectorAll('[lang]'), function (e) { return e.getAttribute('lang'); });
      return { text: nm.innerText, halves: halves, problems: out };
    }
  };
  return 1;
})()`;

const THEMES = ['tus-teal', 'tus-teal-deep', 'mist'];
const SIZES = [[1920, 1080], [1680, 1050], [1280, 720]];

test('on the screen: the no-feed notice reads in every theme by day and night, and the header names fit', { timeout: 10 * 60 * 1000 }, async (t) => {
  const { serve, browser, CHROME } = await import(HARNESS);
  if (!CHROME) { t.skip('no Chrome or Chromium installed'); return; }
  const server = await serve();
  const port = server.address().port;
  const b = await browser(400);
  const findings = [], seen = [];
  try {
    const { targetInfos } = await b.send('Target.getTargets');
    const page = targetInfos.find((x) => x.type === 'page');
    const tid = page ? page.targetId : (await b.send('Target.createTarget', { url: 'about:blank' })).targetId;
    const { sessionId } = await b.send('Target.attachToTarget', { targetId: tid, flatten: true });
    const S = (m, p, ms) => b.send(m, p, sessionId, ms);
    const ev = async (expression, ms) => {
      const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms);
      if (r && r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r && r.result && r.result.value;
    };
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setFocusEmulationEnabled', { enabled: true });
    const open = async (ap, w, h) => {
      await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await S('Page.navigate', { url: `http://127.0.0.1:${port}/fids.html?ap=${ap}&norotate=1` });
      const up = await ev(`new Promise(function (res) { var t0 = Date.now(); (function poll() {
        try { if (Date.now() - t0 > 2500 && typeof setState === 'function' && typeof _apHeaderNameSet === 'function'
            && (document.getElementById('apSel') || {}).value === ${JSON.stringify(ap)} && document.fonts && document.fonts.status === 'loaded') return res(1); } catch (e) {}
        if (Date.now() - t0 > 40000) return res(0); setTimeout(poll, 300); })(); })`, 50000);
      assert.equal(up, 1, `${ap} ${w}x${h}: the board came up`);
      assert.equal(await ev(PAGE), 1);
    };
    // 1. the notice, on the board's own ground, in every theme, day and night
    await open('YRJ', 1920, 1080);
    for (const theme of THEMES) {
      for (const night of [false, true]) {
        const r = await ev(`(function () {
          document.body.dataset.fidsTheme = ${JSON.stringify(theme)};
          document.documentElement.classList.toggle('fids-night', ${night});
          setState('empty', true);
          return new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(function () { res(window.__nf.judge()); }); }); });
        })()`);
        const tag = `${theme}${night ? ' night' : ''}`;
        assert.ok(r && r.up, tag + ': the no-feed notice is up');
        seen.push(`${tag}: ${r.min}:1 over ${r.ground}`);
        for (const p of r.problems) findings.push(tag + ': ' + p);
        assert.match(r.text, /AUCUNE DONNÉE EN DIRECT POUR CET AÉROPORT/);
        assert.match(r.text, /NO LIVE DATA FOR THIS AIRPORT/);
        assert.ok(r.text.indexOf('AUCUNE') < r.text.indexOf('NO LIVE'), 'French first in Québec');
      }
    }
    // 2. the header's name: the Québec board French first, and the longest
    // names whole, clear of the label and the clock, at every board size
    for (const [w, h] of SIZES) {
      for (const ap of ['YRJ', 'YGR', 'DCA']) {
        await open(ap, w, h);
        const r = await ev('window.__nf.header()');
        seen.push(`${ap} ${w}x${h}: ${r.text}`);
        const want = BS.isFrFirst(ap) ? ['fr', 'en'] : ['en', 'fr'];
        assert.deepEqual(r.halves, want, `${ap} ${w}x${h}: ${r.text}`);
        for (const p of r.problems) findings.push(`${ap} ${w}x${h}: ${p}`);
      }
    }
  } finally {
    b.close();
    server.close();
  }
  if (process.env.NOFEED_RENDER_LOG) fs.writeFileSync(process.env.NOFEED_RENDER_LOG, seen.join('\n') + '\n' + findings.join('\n') + '\n');
  assert.ok(seen.length >= THEMES.length * 2 + SIZES.length * 3, 'every case was drawn: ' + seen.length);
  assert.deepEqual(findings, [], '\n' + findings.join('\n') + '\n' + seen.join('\n'));
});
