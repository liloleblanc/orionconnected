'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24074 — A NEW SCREEN SAYS IT IS LOADING WHILE ITS FIRST FLIGHTS ARRIVE.
//
// Seen on Seattle after v24071 (the worker reads about 16 of Sea-Tac's pages
// for one answer): a brand-new departures board, 1920x1080, sat for 40 s and
// more on the old world-network picture with no rows and no words, then
// filled in with 254 departures. Measured cold on 2026-10-20, the worker
// answered departures in 23.5 s and arrivals in 34 s, one after the other.
// The boot loader leaves after 8 s; fetchLive had put the loading panel up,
// and the next render() took it down again (setState('empty', false) hides
// every panel, and render() runs within half a second of boot).
//
// What a board shows before its first answer, now:
//   · a live airport with a feed: "Loading flights…" in the board's own
//     notice box, its languages, French first in Québec, the Earth floor
//     under it (never the old picture with nothing on it), until the first
//     list is in;
//   · the direction on screen known to be down with nothing to show: "Live
//     data unavailable" at once, before the other direction has answered;
//   · an airport with no feed (Roberval): "No live data" at once, never
//     "loading";
//   · a renewal: the rows stay, no notice;
//   · the airport changed on the screen: "Loading flights…" again until its
//     own first list is in (it read "No flights in window" for a minute).
//
// The first two tests read the code and the stylesheet; the third draws the
// real board in headless Chrome with every host but this checkout
// unreachable (tests/render/words.mjs serve/browser) and the feed held or
// answered from inside the page. It skips when no Chrome is installed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', 'fids-current');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'fids-core.js'), 'utf8');
const EARTH = fs.readFileSync(path.join(ROOT, 'js', 'fids-earth.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'display-overrides.css'), 'utf8');
const BS = require(path.join(ROOT, 'js', 'board-strings.js'));
const HARNESS = pathToFileURL(path.join(__dirname, 'render', 'words.mjs')).href;

// the three functions, on their own, with what they read stubbed
function load(env) {
  const at = CORE.indexOf('function _fidsFirstListPending(ap)');
  const end = CORE.indexOf('// v24069 — the no-feed notice');
  assert.ok(at > 0 && end > at, 'fids-core.js has _fidsFirstListPending before setState');
  const f = new Function('window', 'LIVE_MODE', 'mode', '_fidsAirportHasFeed', '_fidsFeedDownFor', '_fidsFeedPairHtml',
    CORE.slice(at, end) + '\nreturn { pending: _fidsFirstListPending, down: _fidsFeedKnownDown, panel: _fidsLoadingPanel };');
  return f(env.window || {}, env.live !== false, env.mode || 'dep', env.hasFeed || (() => true),
    env.downFor || (() => null), env.pair || ((k) => '<span class="bs-h">' + k + '</span>'));
}

test('which boards wait for their first list, and which say something else', () => {
  const noFeed = (c) => c !== 'YRJ';
  const cold = { _initialFetchDone: false };
  // a new live board at an airport with a feed waits, whatever the case of its code
  assert.equal(load({ window: cold, hasFeed: noFeed }).pending('SEA'), true);
  assert.equal(load({ window: cold, hasFeed: noFeed }).pending('sea'), true);
  // not a demonstration board, not an airport with no feed, not an empty code
  assert.equal(load({ window: cold, live: false }).pending('SEA'), false);
  assert.equal(load({ window: cold, hasFeed: noFeed }).pending('YRJ'), false);
  assert.equal(load({ window: cold }).pending(''), false);
  // the first list is in: a renewal never waits
  assert.equal(load({ window: { _initialFetchDone: true } }).pending('SEA'), false);
  // the airport changed on the screen: this airport waits for its own first list
  assert.equal(load({ window: { _initialFetchDone: true, _fidsRefillAp: 'SEA' } }).pending('SEA'), true);
  assert.equal(load({ window: { _initialFetchDone: true, _fidsRefillAp: 'YQM' } }).pending('SEA'), false);
  // a cold start that failed outright keeps its error panel up
  assert.equal(load({ window: { _initialFetchDone: false, _fidsColdFailAp: 'SEA' } }).pending('SEA'), false);
  // the direction on screen is known to be down with nothing to show: it says so
  const down = (want) => (ap, dir) => (dir === want ? { state: 'unavailable', asOf: null } : null);
  assert.equal(load({ window: cold, downFor: down('dep') }).pending('SEA'), false);
  assert.equal(load({ window: cold, downFor: down('dep'), mode: 'arr' }).pending('SEA'), true, 'the other direction still waits');
  assert.equal(load({ window: cold, downFor: down('arr'), mode: 'arr' }).pending('SEA'), false);
  // a last good list is coming as rows: still waiting, not "unavailable"
  assert.equal(load({ window: cold, downFor: () => ({ state: 'stale', asOf: 1 }) }).pending('SEA'), true);
  assert.equal(load({ window: cold, downFor: () => ({ state: 'stale', asOf: 1 }) }).down('SEA'), false);
});

test('the notice: the store\'s words in the board\'s notice box, render() keeps it up, the floor goes under it', () => {
  // the words: the store's appLoading, every language filled
  const e = BS.STR.appLoading;
  assert.ok(e, 'board-strings.js has appLoading');
  for (const l of BS.LANGS) assert.ok(String(e[l] || '').trim().length > 2, 'appLoading in ' + l);
  assert.equal(e.en, 'Loading flights…');
  // the panel: one pair (_fidsFeedPairHtml: the board's languages, French first
  // in Québec, each half marked) in the notice box, drawn only when it changes
  const el = { classList: { list: [], add(c) { this.list.push(c); } }, firstChild: null, innerHTML: '' };
  load({}).panel(el);
  assert.equal(el.innerHTML, '<div class="ffn-box"><span class="bs-h">appLoading</span></div>');
  assert.deepEqual(el.classList.list, ['fids-loading']);
  // setState draws it whenever it puts the panel up
  const st = CORE.slice(CORE.indexOf('function setState(which, show)'), CORE.indexOf('// v23430 — A DEAD BOARD SENDS ITSELF TO THE TOUR.'));
  assert.match(st, /if \(which === 'loading' && show\) \{ try \{ _fidsLoadingPanel\(document\.getElementById\('panelLoading'\)\); \} catch \(e\) \{\} \}/);
  // render(): waiting -> the notice; a failed cold start -> its error panel;
  // otherwise as before (and a direction known down speaks before the other answers)
  const rd = CORE.slice(CORE.indexOf("var _apNow = (document.getElementById('apSel') || {}).value || '';"), CORE.indexOf('_fidsFeedNoticeUpdate();   // v23996 — the stale strip follows what is on screen'));
  assert.match(rd, /if \(!allFiltered\.length && _fidsFirstListPending\(_apNow\)\) setState\('loading', true\);/);
  assert.match(rd, /else if \(!allFiltered\.length && window\._initialFetchDone !== true && window\._fidsColdFailAp === String\(_apNow\)\.toUpperCase\(\)\) setState\('error', true\);/);
  assert.match(rd, /else setState\('empty', !allFiltered\.length && \(window\._initialFetchDone === true \|\| !_fidsAirportHasFeed\(_apNow\) \|\| _fidsFeedKnownDown\(_apNow\)\)\);/);
  // the flags: set where a board starts over, cleared where its answer lands
  assert.match(CORE, /if \(LIVE_MODE && window\._initialFetchDone === true\) window\._fidsRefillAp = iata;\n\s*\/\/ Clear stale flights from the previous airport/);
  const fl = CORE.slice(CORE.indexOf('async function fetchLive()'), CORE.indexOf('async function fetchLive()') + 30000);
  assert.match(fl, /window\._initialFetchDone = true;\n(\s*\/\/.*\n)+\s*if \(window\._fidsRefillAp === String\(iata \|\| ''\)\.toUpperCase\(\)\) window\._fidsRefillAp = null;\n\s*window\._fidsColdFailAp = null;/);
  assert.match(fl, /if \(window\._initialFetchDone !== true\) \{\n\s*window\._fidsColdFailAp = String\(iata \|\| ''\)\.toUpperCase\(\);/);
  // fetchLive's cold start and onApChange put it up only for a board that waits
  assert.match(fl, /document\.getElementById\('fidsTable'\)\.style\.display = 'none';\n(\s*\/\/.*\n)+\s*if \(_fidsFirstListPending\(iata\)\) setState\('loading', true\);/);
  assert.match(CORE, /\(instead of seeing the old data quietly persist\)\.\n(\s*\/\/.*\n)+\s*if \(_fidsFirstListPending\(iata\)\) setState\('loading', true\);/);
  assert.equal((CORE.match(/setState\('loading', true\)/g) || []).length, 3, 'nowhere else');
  // the feed's answer for one direction repaints a board that is still waiting
  assert.match(CORE, /if \(_pl && _pl\.style\.display === 'block' && typeof render === 'function'\) render\(\);/);
  // a language change repaints it
  const follow = CORE.slice(CORE.indexOf('function _fidsBoardWordsFollowLangs()'), CORE.indexOf('BoardStrings.onLangs(_fidsBoardWordsFollowLangs)'));
  assert.match(follow, /if \(pl && pl\.style\.display === 'block'\) _fidsLoadingPanel\(pl\);/);
  // the markup: no words and no spinner of its own on any of the three pages
  for (const f of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(html, /<div id="panelLoading" class="status-msg" style="display:none"><\/div>/, f);
  }
  // the floor goes under this notice too, as under the empty and error panels
  assert.match(EARTH, /\['panelEmpty', 'panelError', 'panelLoading'\]\.forEach/);
  // the box: light ink on a dark plate, readable on any ground, nothing moving
  const rule = (sel) => { const at = CSS.indexOf(sel + ' {'); assert.ok(at >= 0, 'display-overrides.css has ' + sel); return CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at)); };
  assert.match(rule('html body #panelLoading.fids-loading'), /animation: none !important;/);
  const box = rule('html body #panelLoading.fids-loading .ffn-box');
  const plate = /background: rgba\((\d+), (\d+), (\d+), ([\d.]+)\) !important;/.exec(box);
  const ink = /color: #([0-9a-f]{6}) !important;/i.exec(box);
  assert.ok(plate && ink);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const inkRGB = [0, 2, 4].map((i) => parseInt(ink[1].slice(i, i + 2), 16));
  assert.ok(lum(inkRGB) > 0.8, 'white lettering');
  for (const g of [[255, 255, 255], [13, 77, 139], [0, 0, 0]]) {
    const bg = [1, 2, 3].map((i, k) => +plate[i] * +plate[4] + g[k] * (1 - +plate[4]));
    const c = (lum(inkRGB) + 0.05) / (lum(bg) + 0.05);
    assert.ok(c >= 4.5, `the notice reads at ${c.toFixed(2)}:1 over ${g}`);
  }
  assert.match(rule('html body #panelLoading.fids-loading .ffn-half'), /white-space: nowrap;/, 'each language whole on its line');
});

// ── on the screen ─────────────────────────────────────────────────────────
// Installed in every page before its own scripts. The feed (the worker's
// /flights/ and /yqm/ answers) is held until the test lets it go, answered at
// once with ten flights of the airport asked for, or refused ('down': the
// worker's 503 for a feed that failed; 'depdown': departures refused,
// arrivals held). The mode is read from the page's hash (#ln=...). Nothing
// from this file reaches page code but these constants.
const STUB = `(function () {
  var real = window.fetch;
  var m0 = /[#&]ln=(\\w+)/.exec(location.hash || '');
  var ln = window.__ln = { mode: m0 ? m0[1] : 'hold', held: 0, asked: 0 };
  var waiting = [];
  window.__lnRelease = function () { ln.mode = 'go'; var w = waiting; waiting = []; w.forEach(function (f) { f(); }); return w.length; };
  window.__lnHold = function () { ln.mode = 'hold'; return 1; };
  function at(ts, tz) {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(new Date(ts));
    var g = function (t) { for (var i = 0; i < p.length; i++) if (p[i].type === t) return p[i].value; return ''; };
    var off = g('timeZoneName').replace('GMT', '') || '+00:00';
    return g('year') + '-' + g('month') + '-' + g('day') + ' ' + g('hour') + ':' + g('minute') + ':00' + off;
  }
  function utc(ts) { return new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + ':00+00:00'; }
  function rows(home, arr) {
    var tz = (window.AP && AP[home] && AP[home].tz) || 'UTC';
    var far = ['PDX', 'SFO', 'LAX', 'DEN', 'ANC', 'BOI', 'LAS', 'PHX', 'SLC', 'JFK'], out = [];
    for (var i = 0; i < 10; i++) {
      var ts = Math.floor((Date.now() + (20 + i * 25) * 60000) / 60000) * 60000;
      var t = { local: at(ts, tz), utc: utc(ts) };
      var al = { iata: 'AS', icao: null, name: 'Alaska' };
      var mine = { airport: { iata: home, icao: null, name: home }, gate: 'A' + (i + 1), scheduledTime: t, airline: al, quality: ['Live'] };
      var other = { airport: { iata: far[i], icao: null, name: far[i] }, scheduledTime: t, airline: al, quality: ['Live'] };
      out.push({ number: 'AS' + (300 + i), callSign: null, status: 'scheduled', codeshareStatus: 'IsOperator', isCargo: false,
        departure: arr ? other : mine, arrival: arr ? mine : other });
    }
    return arr ? { arrivals: out } : { departures: out };
  }
  function answer(u) {
    var w = /\\/flights\\/airports\\/iata\\/([A-Z]{3})\\//.exec(u), arr = /direction=Arrival/.test(u);
    if (ln.mode === 'down' || (ln.mode === 'depdown' && w && !arr)) return Promise.resolve(new Response('{"error":"error"}', { status: 503, headers: { 'Content-Type': 'application/json' } }));
    var body = w ? JSON.stringify(rows(w[1], arr)) : '{"list":[]}';
    var res = function () { return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Feed-State': 'live' } }); };
    if (ln.mode === 'go') return Promise.resolve(res());
    ln.held++;
    return new Promise(function (ok) { waiting.push(function () { ln.held--; ok(res()); }); });
  }
  window.fetch = function (input, opts) {
    var u = String((input && input.url) || input || '');
    if (u.indexOf('fids-proxy.n-leblanc1984.workers.dev') >= 0 && /\\/(flights|yqm)\\//.test(u)) { ln.asked++; return answer(u); }
    return real.apply(this, arguments);
  };
})()`;

// what is on the screen now
const SEE = `(function () {
  function vis(el) { if (!el) return false; var b = el.getBoundingClientRect(); if (b.width < 1 || b.height < 1) return false;
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) { var cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; }
  var pl = document.getElementById('panelLoading'), box = pl && pl.querySelector('.ffn-box');
  var halves = box ? [].map.call(box.querySelectorAll('.ffn-half'), function (h) {
    var r = h.getBoundingClientRect();
    return { lang: h.getAttribute('lang'), dir: h.getAttribute('dir') || '', text: h.textContent, lines: h.getClientRects().length, inside: r.left >= 0 && r.right <= innerWidth };
  }) : [];
  var pe = document.getElementById('panelEmpty');
  return { loading: vis(pl) && !!box && pl.classList.contains('fids-loading'), halves: halves,
    empty: vis(pe) ? (pe.classList.contains('fids-feed-down') ? 'feed-down' : pe.classList.contains('fids-no-feed') ? 'no-feed' : 'no-flights') : '',
    error: vis(document.getElementById('panelError')), rows: vis(document.getElementById('fidsTable')) ? document.querySelectorAll('#tbody tr').length : 0,
    floor: document.documentElement.getAttribute('data-fids-floor') || '', oldPicture: getComputedStyle(document.getElementById('fidsBoard')).backgroundImage !== 'none',
    floorTop: (function () { var f = document.getElementById('ocFloor'); return f && f.getBoundingClientRect().height ? Math.round(f.getBoundingClientRect().top) : null; })(),
    noticeBottom: vis(pl) ? Math.round(pl.getBoundingClientRect().bottom) : null,
    done: window._initialFetchDone === true, held: window.__ln ? window.__ln.held : -1, asked: window.__ln ? window.__ln.asked : -1 };
})()`;
const until = (cond, ms) => `new Promise(function (res) { var t0 = Date.now(); (function poll() {
  var s = null; try { s = ${SEE}; if (${cond}) return res(s); } catch (e) {}
  if (Date.now() - t0 > ${ms}) return res(Object.assign(s || {}, { timedOut: true })); setTimeout(poll, 250); })(); })`;
const hold = (ms) => `new Promise(function (res) { setTimeout(function () { res(1); }, ${ms}); })`;

test('on the screen: loading until the first list, never on a renewal, feed down and no feed say so', { timeout: 6 * 60 * 1000 }, async (t) => {
  const { serve, browser, CHROME } = await import(HARNESS);
  if (!CHROME) { t.skip('no Chrome or Chromium installed'); return; }
  const server = await serve();
  const port = server.address().port;
  const b = await browser(330);
  const seen = [];
  try {
    const { targetInfos } = await b.send('Target.getTargets');
    const page = targetInfos.find((x) => x.type === 'page');
    const tid = page ? page.targetId : (await b.send('Target.createTarget', { url: 'about:blank' })).targetId;
    const { sessionId } = await b.send('Target.attachToTarget', { targetId: tid, flatten: true });
    const S = (m, p, ms) => b.send(m, p, sessionId, ms);
    const ev = async (expression, ms) => {
      const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, (ms || 60000) + 5000);
      if (r && r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r && r.result && r.result.value;
    };
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setFocusEmulationEnabled', { enabled: true });
    await S('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
    const open = async (ap, mode) => {
      await S('Page.navigate', { url: `http://127.0.0.1:${port}/fids.html?ap=${ap}&norotate=1#ln=${mode}` });
      const up = await ev(`new Promise(function (res) { var t0 = Date.now(); (function poll() {
        try { if (typeof render === 'function' && typeof setState === 'function' && window.__ln && window.__ln.asked > 0 && Date.now() - t0 > 1500) return res(1); } catch (e) {}
        if (Date.now() - t0 > 30000) return res(0); setTimeout(poll, 250); })(); })`, 35000);
      assert.equal(up, 1, ap + ': the board came up and asked its feed');
    };
    const tag = (name, s) => { seen.push(name + ': ' + JSON.stringify(s)); return s; };

    // 1. Seattle, a new screen, the feed held: the notice, and it stays up
    await open('SEA', 'hold');
    let s = tag('SEA waiting', await ev(until('s.loading', 15000), 20000));
    assert.ok(s.loading && !s.timedOut, 'a new Seattle board says it is loading: ' + seen.at(-1));
    assert.equal(s.rows, 0); assert.equal(s.empty, ''); assert.equal(s.error, false);
    assert.deepEqual(s.halves.map((h) => h.lang), BS.defaultLangs('SEA'), 'in the board\'s languages');
    assert.deepEqual(s.halves.map((h) => h.text), BS.defaultLangs('SEA').map((l) => BS.STR.appLoading[l]));
    for (const h of s.halves) assert.ok(h.lines === 1 && h.inside, 'each language whole on one line: ' + JSON.stringify(h));
    // the render that used to take it down, and a while later
    await ev('render(), render(), 1');
    await ev(hold(1500), 3000);
    s = tag('SEA still waiting', await ev(SEE));
    assert.ok(s.loading && !s.done && s.held > 0, 'still loading while the feed is held: ' + seen.at(-1));
    // the Earth floor comes up under the notice: the old picture never shows with nothing on it
    s = tag('SEA floor', await ev(until("s.floor === 'earth' && !s.oldPicture", 60000), 65000));
    assert.ok(!s.timedOut && s.loading, 'the planet under the notice, the old picture gone: ' + seen.at(-1));
    assert.ok(s.floorTop == null || s.floorTop >= s.noticeBottom - 1, 'the floor stands under the notice, not over it');
    // the board's languages changed while it waits: the notice follows, Arabic right to left
    await ev("setBoardLangs(['ar', 'zh']), 1");
    s = tag('SEA ar+zh', await ev(until("s.halves.length === 2 && s.halves[0].lang === 'ar'", 5000), 8000));
    assert.deepEqual(s.halves.map((h) => [h.lang, h.text]), [['ar', BS.STR.appLoading.ar], ['zh', BS.STR.appLoading.zh]]);
    assert.equal(s.halves[0].dir, 'rtl');
    // 2. the first list arrives: rows, and the notice is gone
    await ev('window.__lnRelease()');
    s = tag('SEA first list', await ev(until('s.rows > 0 && s.done', 30000), 35000));
    assert.ok(!s.timedOut && !s.loading && s.rows > 0, 'the rows replace the notice: ' + seen.at(-1));
    await ev(hold(6000), 9000);   // the boot's second pass (onApChange) lands too
    // 3. a renewal as slow as the first answer: the rows stay, no notice
    await ev('window.__lnHold(), window.__lnRenewal = fetchLive(), 1');
    await ev(hold(2500), 5000);
    await ev('render(), 1');
    s = tag('SEA renewing', await ev(SEE));
    assert.ok(s.held > 0, 'the renewal is waiting on the feed');
    assert.ok(s.rows > 0 && !s.loading && s.empty === '', 'a board with rows keeps them while it renews: ' + seen.at(-1));
    await ev('window.__lnRelease(), window.__lnRenewal.then(function () { return 1; })', 30000);
    s = tag('SEA renewed', await ev(SEE));
    assert.ok(s.rows > 0 && !s.loading, 'renewed: ' + seen.at(-1));
    // 4. the airport changed on the screen: loading again, not "No flights in window"
    await ev("window.__lnHold(), document.getElementById('apSel').value = 'BOS', onApChange(), 1");
    s = tag('BOS after the change', await ev(until('s.loading', 8000), 10000));
    assert.ok(!s.timedOut && s.loading && s.empty === '' && s.rows === 0, 'a changed airport says it is loading: ' + seen.at(-1));
    await ev('window.__lnRelease()');
    s = tag('BOS first list', await ev(until('s.rows > 0', 30000), 35000));
    assert.ok(!s.timedOut && !s.loading, 'and fills in: ' + seen.at(-1));

    // 5. Halifax: departures refused while arrivals are still held — it says
    // the live data is unavailable at once, not "loading"
    await open('YHZ', 'depdown');
    s = tag('YHZ departures down', await ev(until("s.empty === 'feed-down'", 20000), 25000));
    assert.ok(!s.timedOut && !s.loading && !s.done, 'feed down before the other direction answered: ' + seen.at(-1));
    await ev('window.__lnRelease()');
    s = tag('YHZ answered', await ev(until('s.done', 20000), 25000));
    assert.equal(s.loading, false); assert.equal(s.empty, 'feed-down');

    // 6. Montréal: French first in Québec
    await open('YUL', 'hold');
    s = tag('YUL waiting', await ev(until('s.loading', 15000), 20000));
    assert.ok(s.loading, seen.at(-1));
    assert.equal(s.halves[0].lang, 'fr'); assert.equal(s.halves[0].text, BS.STR.appLoading.fr);

    // 7. Roberval, no feed: says so at once and never "loading"
    await open('YRJ', 'hold');
    s = tag('YRJ', await ev(until("s.empty === 'no-feed'", 10000), 15000));
    assert.ok(!s.timedOut, seen.at(-1));
    const never = await ev(`new Promise(function (res) { var t0 = Date.now(), bad = 0; (function poll() { var s = ${SEE}; if (s.loading) bad++; if (Date.now() - t0 > 3000) return res(bad); setTimeout(poll, 100); })(); })`, 8000);
    assert.equal(never, 0, 'a board with no feed never says it is loading');
    assert.equal((await ev(SEE)).halves.length, 0, 'not even for a frame at boot: the notice was never drawn');
  } finally {
    b.close();
    server.close();
    if (process.env.LOADING_RENDER_LOG) fs.writeFileSync(process.env.LOADING_RENDER_LOG, seen.join('\n') + '\n');
  }
});
