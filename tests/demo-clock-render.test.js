'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE DEMO CLOCK, ON SCREEN.
//
// tests/demo-clock-1010.test.js proves the store's sums and reads where the
// boards call them. This opens the three boards in headless Chrome, with
// every host but this checkout unreachable, and reads what they PRINT:
//
//   · ?clock=1010 on the departures board (#clock), the gate (its time tab,
//     .v2-fi-clock-val) and the baggage hall (#dedicatedBannerClock): 10:10.
//   · ?mode=demo by itself: 10:10 once the demonstration rows are in.
//   · ?mode=demo&clock=live: the real time, the URL outranking the demo.
//   · Day or night follows the clock shown: under 10:10 the page is day
//     (html[data-daynight], fids-sun.js) and the weather card's "now" is day
//     (_wxNightAt); with the real time both are the real answer.
//   · fids.html?mode=arr: the Arrivals board from its first painted header,
//     on the live path (not the demo rows), even when this tab remembers a
//     visit to the demo.
//
// It skips when no Chrome or Chromium is installed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HARNESS = pathToFileURL(path.join(__dirname, 'render', 'words.mjs')).href;

// What a board's clock reads, once it is up: the visible elements' text, the
// hour and minute in it, the real hour and minute at the airport, and the
// day-or-night answers. `wantDemo` waits for the demonstration rows first.
const READ_CLOCK = (sel, want, wantDemo) => `new Promise(function (res) {
  var t0 = Date.now(), SEL = ${JSON.stringify(sel)}, WANT = ${JSON.stringify(want)}, DEMO = ${wantDemo ? 'true' : 'false'};
  var hm = function (s) { var m = /(\\d{1,2})\\s*(?::|h)\\s*(\\d{2})/.exec(String(s || '')); return m ? (+m[1]) + ':' + m[2] : ''; };
  (function poll() {
    var r = null;
    try {
      var ia = (document.getElementById('apSel') || {}).value || 'YQM';
      var tz = (AP[ia] || {}).tz || null;
      var els = [].filter.call(document.querySelectorAll(SEL), function (e) { return e.offsetParent !== null && /\\d/.test(e.textContent); });
      var texts = els.map(function (e) { return e.textContent.trim().replace(/\\s+/g, ' '); });
      var real = hm(BoardStrings.boardTime(new Date(), tz)), before = hm(BoardStrings.boardTime(new Date(Date.now() - 60000), tz));
      var shown = texts.map(hm);
      var goal = WANT === 'real' ? [real, before] : [WANT];
      r = { texts: texts, shown: shown, real: real, before: before, demoClock: BoardStrings.demoClock(), isDemo: !!window._fidsBoardIsDemo,
            daynight: document.documentElement.getAttribute('data-daynight'),
            realDay: (window.fidsSun && fidsSun.isDay(ia, Date.now())),
            wxNightNow: (typeof _wxNightAt === 'function') ? !!_wxNightAt(ia) : null,
            wxNightReal: (typeof _wxNightAt === 'function') ? !!_wxNightAt(ia, Date.now()) : null };
      var ok = shown.length && shown.every(function (s) { return goal.indexOf(s) >= 0; }) && (!DEMO || r.isDemo) && r.daynight;
      if (ok && Date.now() - t0 > 2500) return res(r);
    } catch (e) { r = { error: String(e && e.message || e) }; }
    if (Date.now() - t0 > 50000) return res(r || { timeout: true });
    setTimeout(poll, 400);
  })();
})`;

// The board held on its demonstration rows once its first pass at the feed
// (which nothing here can reach) has answered, as the rendered language check
// holds it (tests/render/words.mjs, BOARD_UP): that pass would otherwise
// clear the rows, and with them the demo flag, seconds after they painted.
const HOLD_DEMO = `new Promise(function (res) { var t0 = Date.now(); (function poll() {
  try { if (Date.now() - t0 > 3000 && typeof loadDemo === 'function' && data
      && (window._initialFetchDone === true || Date.now() - t0 > 50000)) { LIVE_MODE = false; loadDemo(); return res(1); } } catch (e) {}
  if (Date.now() - t0 > 60000) return res(0); setTimeout(poll, 400); })(); })`;

// Every text #hdrBoard (the board's title) has held since the page began,
// recorded from the first frame (installed before the page's own scripts).
const WATCH_TITLE = `(function () {
  window.__hdrSeen = [];
  var note = function () {
    var h = document.getElementById('hdrBoard');
    var t = h ? h.textContent.trim().replace(/\\s+/g, ' ') : '';
    if (t && window.__hdrSeen[window.__hdrSeen.length - 1] !== t) window.__hdrSeen.push(t);
  };
  new MutationObserver(note).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

test('the demo clock on screen: 10:10 on the three boards, the real time on request, day under 10:10, ?mode=arr is Arrivals', { timeout: 10 * 60 * 1000 }, async (t) => {
  const { serve, browser, CHROME } = await import(HARNESS);
  if (!CHROME) { t.skip('no Chrome or Chromium installed'); return; }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await browser(540);
  try {
    const { targetInfos } = await b.send('Target.getTargets');
    const page = targetInfos.find((x) => x.type === 'page');
    const tid = page ? page.targetId : (await b.send('Target.createTarget', { url: 'about:blank' })).targetId;
    const { sessionId } = await b.send('Target.attachToTarget', { targetId: tid, flatten: true });
    const S = (m, p, ms) => b.send(m, p, sessionId, ms);
    const ev = async (expression, ms) => {
      const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms || 70000);
      if (r && r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r && r.result && r.result.value;
    };
    const open = async (url) => {
      await S('Page.navigate', { url: base + url });
      await ev(`new Promise(function (r) { (function w() { if (document.readyState !== 'loading' && typeof BoardStrings !== 'undefined' && typeof AP !== 'undefined') return r(1); setTimeout(w, 200); })(); })`, 30000);
    };
    await S('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
    await S('Emulation.setFocusEmulationEnabled', { enabled: true });
    await S('Page.enable'); await S('Runtime.enable');
    await S('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_TITLE });

    const CASES = [
      { what: 'departures, ?clock=1010', url: '/fids.html?ap=YQM&mode=demo&clock=1010', sel: '#clock', want: '10:10' },
      { what: 'gate, ?clock=1010', url: '/gids.html?ap=YQM&mode=demo&gate=4&clock=1010', sel: '.v2-fi-clock-val', want: '10:10' },
      { what: 'baggage, ?clock=1010', url: '/bids.html?ap=YQM&mode=demo&clock=1010', sel: '#dedicatedBannerClock', want: '10:10' },
      { what: 'departures, demo data by itself', url: '/fids.html?ap=YQM&mode=demo', sel: '#clock', want: '10:10', demo: true },
      { what: 'departures, demo with ?clock=live', url: '/fids.html?ap=YQM&mode=demo&clock=live', sel: '#clock', want: 'real', demo: true }
    ];
    for (const c of CASES) {
      await open(c.url);
      assert.equal(await ev(HOLD_DEMO, 70000), 1, `${c.what}: the board came up`);
      const r = await ev(READ_CLOCK(c.sel, c.want, c.demo), 70000);
      assert.ok(r && !r.error && !r.timeout && r.shown && r.shown.length, `${c.what}: the clock came up (${JSON.stringify(r)})`);
      if (c.want === 'real') {
        assert.equal(r.demoClock, false, `${c.what}: the URL outranks the demo`);
        assert.ok(r.shown.every((s) => s === r.real || s === r.before), `${c.what}: the real time ${r.real} (${r.texts})`);
        // day or night is the real answer
        assert.equal(r.daynight, r.realDay ? 'day' : 'night', `${c.what}: the page's day or night is the real one`);
        assert.equal(r.wxNightNow, r.wxNightReal, `${c.what}: the weather card's "now" is the real one`);
      } else {
        assert.equal(r.demoClock, true, `${c.what}: the demo clock is on`);
        assert.deepEqual([...new Set(r.shown)], ['10:10'], `${c.what}: every clock reads 10:10 (${r.texts})`);
        // 10:10 in Moncton is daylight in every month of the year
        assert.equal(r.daynight, 'day', `${c.what}: no night look under a 10:10 AM clock`);
        assert.equal(r.wxNightNow, false, `${c.what}: the weather card's "now" is 10:10, in daylight`);
      }
    }

    // ?mode=arr: Arrivals from the first painted title, on the live path —
    // also in a tab that remembers a visit to the demo (sessionStorage)
    await open('/fids.html?ap=YQM&clock=live');
    await ev(`sessionStorage.setItem('fids_mode', 'demo'); 1`);
    await open('/fids.html?ap=YQM&mode=arr');
    const arr = await ev(`new Promise(function (res) { var t0 = Date.now(); (function poll() {
      var h = document.getElementById('hdrBoard'), t = h ? h.textContent.trim() : '';
      if (t && Date.now() - t0 > 6000) return res({ title: t, seen: window.__hdrSeen || [], viewMode: viewMode, mode: mode, live: LIVE_MODE, isDemo: !!window._fidsBoardIsDemo, stored: sessionStorage.getItem('fids_mode') });
      if (Date.now() - t0 > 40000) return res({ title: t, timeout: true, seen: window.__hdrSeen || [] });
      setTimeout(poll, 300); })(); })`, 50000);
    assert.equal(arr.stored, 'demo', 'the tab does remember the demo');
    assert.match(arr.title, /Arrivals/, '?mode=arr shows Arrivals: ' + JSON.stringify(arr));
    assert.equal(arr.viewMode, 'arr');
    assert.equal(arr.mode, 'arr');
    assert.ok(arr.seen.length >= 1 && arr.seen.every((s) => /Arrivals/.test(s) && !/Departures/.test(s)), 'Arrivals from the first painted title: ' + JSON.stringify(arr.seen));
    assert.equal(arr.live, true, 'the live flights, not the demo branch');
    assert.equal(arr.isDemo, false, 'no demonstration rows');
  } finally {
    b.close();
    server.close();
  }
});
