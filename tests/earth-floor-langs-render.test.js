'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW: THE FLOOR'S TIMES FOLLOW THE BOARD'S LANGUAGES, ON SCREEN.
//
// The floor under the rows prints the time in each place in the board's own
// clock: 12-hour on a board led by English ("9:10 AM"), 24-hour on one led
// by any other language ("09:10"). CI failed on 2026-10-19 with "9:10 AM" on
// a French board (tests/board-languages-render.test.js). The cause: while
// the NEXT floor was being lit (a page, a direction or a language that
// changed the rows' height), the floor on screen stayed up, and so did the
// words it had been drawn with; nothing drew them again until the next floor
// was lit, which takes seconds on a slow screen. This holds that moment open
// on purpose (the next floor's pictures are not decoded until the test lets
// them), so it fails every time on the old code, not one run in ten:
//
//   · the floor ready: the board turned to French reads 24-hour at once,
//     inside the change, and back to English 12-hour;
//   · the next floor held half-lit: the same, at once and 1.5 s later;
//   · let go: the next floor comes up in the board's language.
//
// It opens the departures board at Moncton on its demonstration rows under
// the 10:10 demo clock, with every host but this checkout unreachable
// (tests/render/words.mjs serve/browser). It skips when no Chrome or Chromium
// is installed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HARNESS = pathToFileURL(path.join(__dirname, 'render', 'words.mjs')).href;

// the board held on its demonstration rows once its first pass at the feed
// (which nothing here can reach) has answered (as words.mjs BOARD_UP does)
const HOLD_DEMO = `new Promise(function (res) { var t0 = Date.now(); (function poll() {
  try { if (Date.now() - t0 > 3000 && typeof loadDemo === 'function' && data
      && (window._initialFetchDone === true || Date.now() - t0 > 50000)) { LIVE_MODE = false; loadDemo(); return res(1); } } catch (e) {}
  if (Date.now() - t0 > 60000) return res(0); setTimeout(poll, 400); })(); })`;

// what the floor shows now: its state and every text it draws, the times
// apart (a time is h:mm or hh:mm, with AM/PM on a 12-hour clock)
const READ = `(function () {
  var e = window.__ocfEarth ? window.__ocfEarth() : {};
  var texts = [].map.call(document.querySelectorAll('#ocFloor svg text'), function (t) { return t.textContent; });
  return { langs: langs.slice(), mode: e.mode, ready: e.ready, cache: e.cache, texts: texts,
    times: texts.filter(function (s) { return /\\d{1,2}:\\d{2}/.test(s); }) };
})()`;
const SWITCH = (list) => `(function () { setBoardLangs(${JSON.stringify(list)}); return ${READ}; })()`;

// the next floor's pictures held undecoded (and let go): every floor is lit
// from pictures decoded through createImageBitmap, also those already at hand
const HOLD = `(function () {
  if (window.__heldDecode) return 1;
  var orig = window.createImageBitmap; window.__heldDecode = { orig: orig, list: [] };
  window.createImageBitmap = function (b) { return new Promise(function (ok, no) { window.__heldDecode.list.push(function () { orig.call(window, b).then(ok, no); }); }); };
  return 1;
})()`;
const LET_GO = `(function () { var h = window.__heldDecode; if (!h) return 0; window.createImageBitmap = h.orig; window.__heldDecode = null; h.list.forEach(function (f) { f(); }); return h.list.length; })()`;

const twelve = (s) => /\d{1,2}:\d{2}\s?[AP]M/i.test(s);
const twentyFour = (s) => /^\d{2}:\d{2}$/.test(String(s).trim());

test('the floor\'s times follow the board\'s languages at once, also while the next floor is being lit', { timeout: 5 * 60 * 1000 }, async (t) => {
  const { serve, browser, CHROME } = await import(HARNESS);
  if (!CHROME) { t.skip('no Chrome or Chromium installed'); return; }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await browser(280);
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
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (what, ok, ms) => {
      const t0 = Date.now();
      let r = null;
      while (Date.now() - t0 < ms) { r = await ev(READ); if (ok(r)) return r; await sleep(400); }
      assert.fail(what + ' (after ' + ms + ' ms): ' + JSON.stringify(r));
    };
    const allIn = (r, clock, what) => {
      assert.ok(r.times.length >= 1, what + ': the floor shows a time (' + JSON.stringify(r) + ')');
      const bad = r.times.filter((s) => (clock === 12 ? !twelve(s) : !twentyFour(s)));
      assert.deepEqual(bad, [], what + ': every time on the floor reads the ' + clock + '-hour clock of a board led by ' + r.langs[0] + ' (' + JSON.stringify(r.texts) + ')');
    };

    await S('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
    await S('Emulation.setFocusEmulationEnabled', { enabled: true });
    await S('Page.enable'); await S('Runtime.enable');
    await S('Page.navigate', { url: base + '/fids.html?ap=YQM&mode=demo' });
    await ev(`new Promise(function (r) { (function w() { if (document.readyState !== 'loading' && typeof BoardStrings !== 'undefined' && typeof setBoardLangs === 'function') return r(1); setTimeout(w, 200); })(); })`, 30000);
    assert.equal(await ev(HOLD_DEMO, 70000), 1, 'the board came up on its demonstration rows');
    // the departures alone (no turning to the arrivals mid-test), in English
    await ev(`(function () { setViewMode('dep'); setBoardLangs(['en']); return 1; })()`);
    allIn(await until('a full floor with its times, in English', (r) => r.ready && r.mode === 'full' && r.times.length >= 1, 60000), 12, 'English');

    // 1 · the floor ready: the change of language is drawn inside the change
    allIn(await ev(SWITCH(['fr'])), 24, 'turned to French, read at once');
    allIn(await ev(SWITCH(['en'])), 12, 'back to English, read at once');
    allIn(await ev(SWITCH(['ja', 'ar'])), 24, 'turned to Japanese and Arabic, read at once');
    allIn(await ev(SWITCH(['en', 'fr'])), 12, 'English and French, read at once');
    await until('the floor settled back in English', (r) => r.ready && r.mode === 'full' && r.times.length >= 1, 30000);

    // 2 · the next floor held half-lit: a new size under the rows is acted on
    // once it has held 3 s, and that floor's pictures are not decoded
    assert.equal(await ev(HOLD), 1);
    await S('Emulation.setDeviceMetricsOverride', { width: 1680, height: 980, deviceScaleFactor: 1, mobile: false });
    const held = await until('the next floor being lit, the one on screen kept up with its times', (r) => r.ready === false && r.times.length >= 1, 20000);
    allIn(held, 12, 'held, still English');
    allIn(await ev(SWITCH(['fr'])), 24, 'held, turned to French, read at once');
    await sleep(1500);
    allIn(await ev(READ), 24, 'held, French, 1.5 s later');
    allIn(await ev(SWITCH(['en'])), 12, 'held, back to English, read at once');
    allIn(await ev(SWITCH(['fr'])), 24, 'held, French again, read at once');
    await sleep(1500);
    const still = await ev(READ);
    assert.equal(still.ready, false, 'the next floor was still held while the languages changed');
    allIn(still, 24, 'held, French, 1.5 s later again');

    // 3 · let go: the next floor comes up, in the board's language
    assert.ok(await ev(LET_GO) >= 1, 'pictures were waiting to be decoded');
    const lit = await until('the next floor lit', (r) => r.ready === true && r.times.length >= 1, 60000);
    allIn(lit, 24, 'the next floor, French');
    allIn(await ev(SWITCH(['en'])), 12, 'the next floor, back to English, read at once');
  } finally {
    b.close();
    server.close();
  }
});
