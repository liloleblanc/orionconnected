'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 2026-10-25 — THE TWO PANELS ON SCREEN: PRIORITY FOR THE WHOLE OF BOARDING,
// EVERY LIST AT A READABLE SIZE.
//
// The decision: real gates keep who boards in priority on the screen for the
// whole of boarding, so the boarding sign's two panels are the default again
// (fids-core.js _G8_SIGN_LAYOUT): the left is the airline's priority group
// from pre-boarding to the final call, the right the current call as the
// one centre shows it. tests/boarding-sequence.test.js reads what each panel
// says; this draws the real gate page in headless Chrome at the sizes the
// boards run at (1920x1080 and 1680x1050), puts a test flight on a gate no
// demonstration flight uses, walks it through every call of its airline's
// own sequence (the row's _boardStage, the airport's own stage, picks each
// call in turn) and then the final call, and judges what is on the screen:
//
//   · THE FRAME: the two panels at every call; the left is the priority
//     group (is-prio) at every call; once its first call has been made it
//     carries its check and it never goes back to "not yet" (ahead, part,
//     called, in that order only; nothing faint once all are called); at the
//     final call, everything called.
//   · NOT SQUEEZED: every list item on screen, on every page of a paged list
//     and in both languages of one shown a language at a time, is at least
//     22 px at 1920x1080 (the same share of the screen's height at
//     1680x1050), and stands inside its panel above the arrow discs; no
//     panel runs past its foot; no pair is stacked; no word is drawn over
//     its number.
//   · BIG NUMBERS: the current call's number is the one centre's size (20vh,
//     216 px at 1920x1080) where it stands alone, and never under 72% of it
//     (beside a list too long for the panel).
//   · 2026-10-26, AFTER REVIEW: a who-item that wraps never leaves one word
//     alone on its last line; the two panels show one language at a time
//     together (one clock for the sign, turned here through every turn of
//     its cycle); the priority group's number is never smaller than its own
//     title, nor does it change size from one call to the next while
//     boarding (the final call's shorter panel may take it down); under the
//     check its row has something lit; at the switch its
//     group of passengers is drawn at least 60% of a call's number (20vh;
//     all of it where the panel has the room, 72% under Transat's final
//     call and its taller band) and taller than the other panel's number, and its words are not
//     smaller than the other panel's (ALL ZONES against the title, GENERAL
//     BOARDING against the state line and the list, the list never under
//     its floor).
//   Portrait (1080x1920) is out of scope here: the sign's list and line under
//   the number are sized by the panel's own width (cqw), which keeps a list
//   at about 19-24 px in a 540 px panel, but the boards run landscape and
//   the final call's two-line bar leaves a portrait sign little room.
//
// The airlines: Air Canada (A320, an E175 flown by Jazz, a Dash 8 flown by
// Jazz on a 21-minute window, which calls Zones 1 • 2 together), WestJet,
// Porter (no priority step: its pre-boarding group), United, American's E175
// (Groups 1-4 called together on a 25-minute window, the list that came
// down to 16 px in the 2026-10-13 build), Delta, Transat (no numbers) and a
// carrier with no table (the generic plan); in English and French, and
// American and Delta again in German and French, United in Japanese and
// Arabic. The page is the gate in its demonstration mode with every host but
// this checkout unreachable. It skips when no Chrome or Chromium is
// installed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HARNESS = pathToFileURL(path.join(__dirname, 'render', 'words.mjs')).href;

const CASES0 = [
  { id: 'AC A320', airline: 'AC', flight: 'AC612', dest: 'TORONTO', destIata: 'YYZ', equip: '320', dep: 35 },
  { id: 'AC E175 (Jazz)', airline: 'AC', flight: 'AC8790', dest: 'MONTREAL', destIata: 'YUL', equip: 'E75', oper: 'QK', dep: 30 },
  { id: 'AC Dash 8 (Jazz), 21 minutes', airline: 'AC', flight: 'AC8915', dest: 'MONTREAL', destIata: 'YUL', equip: 'DH4', oper: 'QK', dep: 21 },
  { id: 'WestJet 737 MAX 8', airline: 'WS', flight: 'WS254', dest: 'CALGARY', destIata: 'YYC', equip: '7M8', dep: 35 },
  { id: 'Porter Dash 8', airline: 'PD', flight: 'PD2381', dest: 'OTTAWA', destIata: 'YOW', equip: 'DH4', dep: 30 },
  { id: 'United A320', airline: 'UA', flight: 'UA1204', dest: 'NEWARK', destIata: 'EWR', equip: '320', dep: 35, sets: [['en', 'fr'], ['ja', 'ar']] },
  { id: 'American E175, 25 minutes', airline: 'AA', flight: 'AA4012', dest: 'CHICAGO', destIata: 'ORD', equip: 'E75', oper: 'MQ', dep: 25, sets: [['en', 'fr'], ['de', 'fr']] },
  { id: 'Delta', airline: 'DL', flight: 'DL5112', dest: 'DETROIT', destIata: 'DTW', equip: '', dep: 35, sets: [['en', 'fr'], ['de', 'fr']] },
  { id: 'Transat A321', airline: 'TS', flight: 'TS610', dest: 'CANCUN', destIata: 'CUN', equip: '321', dep: 35 },
  { id: 'a carrier with no table', airline: 'BA', flight: 'BA2277', dest: 'LONDON', destIata: 'LHR', equip: '', dep: 35 }
];
const CASES = process.env.SIGN_RENDER_ONLY ? CASES0.filter((c) => c.id.includes(process.env.SIGN_RENDER_ONLY)) : CASES0;
const SIZES = [[1920, 1080], [1680, 1050]];

// Installed in the page once it is up: the test flight, the stage it shows,
// and the judge. Nothing from this file is spliced into page code but the
// cases above (as JSON) and whole numbers.
const PAGE = `(function () {
  var frames = function (n) { return new Promise(function (res) { (function f(k) { if (!k) return res(); requestAnimationFrame(function () { f(k - 1); }); })(n); }); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  // (a fetch the page makes can replace the departures it holds: the test
  // flight is put back before every paint, as the gate's operators do)
  var inject = function () {
    try {
      var miss = false;
      (window._testFlights || []).forEach(function (tf) { if (!data.dep.some(function (f) { return f._flightKey === tf._flightKey; })) { data.dep.push(tf); miss = true; } });
      if (miss) data.dep.sort(function (a, b) { return a._sortTs - b._sortTs; });
      return miss;
    } catch (e) { return false; }
  };
  // (2026-10-26: on a loaded machine a pass can land after the frames
  // below: the lists' column takes its width, its observer runs the passes
  // again, and the priority group's number was read once at 102 px against
  // 87 px settled, American at 1680x1050, in the full suite. So the sign is
  // read once its sizes and the left's width have held for three frames,
  // a second and a half at most, without painting it again)
  var steady = function () {
    var key = function () {
      var s = document.querySelector('.g8-board.active .g8-sign, .g8-final.active .g8-sign');
      if (!s) return '';
      var l = s.querySelector('.g8-sign-left');
      return [].map.call(s.querySelectorAll('.g8-sign-value, .g8-sign-label'), function (e) { return getComputedStyle(e).fontSize; }).join(',') + '|' + (l ? l.clientWidth : 0);
    };
    return new Promise(function (res) {
      var last = key(), same = 0, n = 0;
      (function f() { requestAnimationFrame(function () { var k = key(); if (k === last) same++; else { same = 0; last = k; } if (same >= 3 || ++n > 90) return res(); f(); }); })();
    });
  };
  var settle = function () {
    inject();
    window._lastGateKey = null; renderDedicatedScreen();
    return frames(3).then(function () { try { _fidsPairSeparators(document); } catch (e) {} return frames(2); }).then(steady);
  };
  var flight = function () { return (window._testFlights || [])[0] || null; };
  window.__sgnT = {
    // a new test flight on gate 99 (the one before it taken off)
    make: function (c) {
      try {
        window._testFlights = [];
        data.dep = data.dep.filter(function (f) { return !/_test$/.test(f._flightKey || ''); });
        openTestFlight();
        var d = new Date(Date.now() + c.dep * 60000), pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var set = function (id, v) { document.getElementById(id).value = v; };
        set('tfGate', '99'); set('tfAirline', c.airline); set('tfFlight', c.flight); set('tfDest', c.dest); set('tfDestIata', c.destIata);
        set('tfTime', pad(d.getHours()) + ':' + pad(d.getMinutes())); set('tfStatus', 'boarding'); set('tfEquip', c.equip || ''); set('tfOperator', c.oper || '');
        submitTestFlight();
        LIVE_MODE = false; try { clearInterval(autoRefreshTimer); } catch (e) {}
        loadDemo();
        if (!window.__sgnReinj) window.__sgnReinj = setInterval(function () { if (inject()) { window._lastGateKey = null; renderDedicatedScreen(); } }, 1000);
      } catch (e) { return Promise.resolve('error ' + e.message); }
      return settle().then(function () { return document.querySelector('.g8-sign') ? 'ok' : 'no sign'; });
    },
    setLangs: function (l) { try { setBoardLangs(l); } catch (e) {} return settle().then(function () { return 1; }); },
    // the airport's own stage, by its index in the plan (a number), or the final call
    stage: function (i) {
      var f = flight();
      if (!f) return Promise.resolve(-1);
      if (i === 'final') { f.status = 'final'; delete f._boardStage; }
      else { f.status = 'boarding'; f._boardStage = i; }
      return settle().then(function () { var p = window._gatePaintedStage; return p ? p.i : -1; });
    },
    // the same stage painted afresh, for a second reading
    again: function () { return settle().then(function () { return 1; }); },
    judge: function () {
      var out = [], r1 = function (v) { return Math.round(v * 10) / 10; };
      var sign = document.querySelector('.g8-board.active .g8-sign, .g8-final.active .g8-sign');
      if (!sign) return { problems: ['no sign on the screen: ' + [].map.call(document.querySelectorAll('.g8-board, .g8-final, .g8-countdown'), function (e) { return e.className; }).join(', ')], nosign: true };
      if (!sign.classList.contains('g8-sign-two')) out.push('not the two panels: ' + sign.className);
      var cols = sign.querySelectorAll(':scope > .g8-sign-col');
      if (cols.length !== 2) return { problems: out.concat(['panels: ' + cols.length]) };
      var L = cols[0], R = cols[1];
      var state = (L.className.match(/prio-(ahead|part|called)/) || [])[1] || '';
      if (!L.classList.contains('is-prio') || !state) out.push('the left is not the priority group: ' + L.className);
      if (state !== 'ahead' && !L.querySelector('.g8-sign-status > .g8-sign-chk')) out.push('the priority group\\'s call was made and its check is not there');
      if (state === 'ahead' && L.querySelector('.g8-sign-chk')) out.push('a check before the priority group\\'s first call');
      if (state === 'called' && L.querySelector('.g8-v-wait')) out.push('a number faint after its call was made');
      var floor = 22 * innerHeight / 1080 - 0.25, small = 1e9, pagesSeen = {};
      [['left', L], ['right', R]].forEach(function (pr) {
        var side = pr[0], col = pr[1], cs = getComputedStyle(col), cb = col.getBoundingClientRect();
        // (the fitter measures whole pixels, scrollHeight, with a pixel to
        // spare: an item may reach 2 px into the foot's padding, no more)
        var foot = cb.bottom - parseFloat(cs.paddingBottom) + 2;
        if (col.scrollHeight > col.clientHeight + 1) out.push(side + ': runs ' + (col.scrollHeight - col.clientHeight) + ' px past its foot');
        var ro = col.querySelector('.g8-sign-roster');
        if (ro) {
          var paged = ro.classList.contains('is-paged'), alt = ro.classList.contains('is-alt');
          var n = paged ? (parseInt(ro.getAttribute('data-g8-pages'), 10) || 0) : (alt ? 2 : 1);
          if (paged && n < 1) out.push(side + ': a paged list with no pages');
          pagesSeen[side] = paged ? n : (alt ? 'alt' : 1);
          for (var k = 0; k < n; k++) {
            if (paged) _fidsSignPageShow(ro, k);
            else if (alt) ro.classList.toggle('alt-b', k === 1);
            var shown = [].filter.call(ro.querySelectorAll('.g8-who-i'), function (it) {
              for (var e = it; e && e !== ro; e = e.parentElement) { var s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; }
              return true;
            });
            if (!shown.length) out.push(side + ': page ' + k + ' of its list shows nothing');
            shown.forEach(function (it) {
              var fsz = parseFloat(getComputedStyle(it).fontSize), b = it.getBoundingClientRect();
              small = Math.min(small, fsz);
              if (fsz < floor) out.push(side + ': "' + it.textContent.trim().slice(0, 40) + '" is ' + r1(fsz) + ' px, under the readable floor (' + r1(floor + 0.25) + ')');
              if (b.bottom > foot || b.top < cb.top - 1) out.push(side + ': "' + it.textContent.trim().slice(0, 40) + '" stands out of its panel (page ' + k + ')');
            });
          }
          ro.removeAttribute('data-g8-pg-on'); _fidsSignWhoAlt(ro);
        }
        [].forEach.call(col.querySelectorAll('.g8-pair.is-stacked'), function (p) { out.push(side + ': a pair stacked: ' + p.textContent.trim().slice(0, 50)); });
        var row = col.querySelector('.g8-sign-row'), lb = row && row.querySelector('.g8-sign-label'), vl = row && row.querySelector('.g8-sign-value');
        if (lb && vl) {
          var a = lb.getBoundingClientRect(), v = vl.getBoundingClientRect();
          if (a.right > v.left + 1 && a.left < v.right - 1 && a.bottom > v.top + 1 && a.top < v.bottom - 1) out.push(side + ': the word is drawn over its number');
          if (v.right > cb.right + 1 || v.left < cb.left - 1 || a.left < cb.left - 1 || a.right > cb.right + 1) out.push(side + ': the number or its word runs out of the panel');
        }
      });
      // 2026-10-26 — AN ITEM NEVER LEAVES ONE WORD ON ITS LAST LINE: every
      // item of every page, in both languages, its words' lines read
      [['left', L], ['right', R]].forEach(function (pr) {
        var ro = pr[1].querySelector('.g8-sign-roster');
        if (!ro) return;
        var paged = ro.classList.contains('is-paged'), alt = ro.classList.contains('is-alt');
        var n = paged ? (parseInt(ro.getAttribute('data-g8-pages'), 10) || 0) : (alt ? 2 : 1);
        for (var k = 0; k < n; k++) {
          if (paged) _fidsSignPageShow(ro, k); else if (alt) ro.classList.toggle('alt-b', k === 1);
          [].forEach.call(ro.querySelectorAll('.g8-who-i'), function (it) {
            for (var e = it; e && e !== ro; e = e.parentElement) { var cs0 = getComputedStyle(e); if (cs0.display === 'none' || cs0.visibility === 'hidden') return; }
            var words = [], w = document.createTreeWalker(it, NodeFilter.SHOW_TEXT), tn;
            while ((tn = w.nextNode())) {
              var re = /[^\\s\\u00A0\\u00B7]+/g, m;
              while ((m = re.exec(tn.textContent))) {
                var rg = document.createRange(); rg.setStart(tn, m.index); rg.setEnd(tn, m.index + m[0].length);
                var rs = rg.getClientRects(); if (rs.length) words.push(rs[rs.length - 1].top);
              }
            }
            if (words.length < 3) return;
            var last = Math.max.apply(null, words), first = Math.min.apply(null, words);
            if (last - first < 4) return;
            if (words.filter(function (t) { return Math.abs(t - last) <= 4; }).length < 2) out.push(pr[0] + ': "' + it.textContent.trim().slice(0, 50) + '" leaves one word alone on its last line');
          });
        }
        ro.removeAttribute('data-g8-pg-on'); _fidsSignWhoAlt(ro);
      });
      // ONE LANGUAGE AT A TIME ON BOTH PANELS: every turn of the sign's cycle
      var turning = sign.querySelectorAll('.g8-sign-roster.is-paged, .g8-sign-roster.is-alt');
      if (turning.length > 1) {
        var realNow = Date.now;
        try {
          for (var tk = 0; tk < 24; tk++) {
            var at = (Math.floor(realNow() / 10000) + tk) * 10000 + 5000;
            Date.now = function () { return at; };
            _fidsSignWhoAlt();
            var ls = {};
            [].forEach.call(turning, function (ro) {
              [].forEach.call(ro.querySelectorAll(':scope > .g8-who-blk'), function (b) {
                var vis = [].some.call(b.querySelectorAll('.g8-who-i'), function (it) {
                  for (var e = it; e && e !== ro; e = e.parentElement) { var cs1 = getComputedStyle(e); if (cs1.display === 'none' || cs1.visibility === 'hidden') return false; }
                  return true;
                });
                if (vis) ls[b.getAttribute('lang') || '?'] = 1;
              });
            });
            if (Object.keys(ls).length > 1) { out.push('the two panels show two languages at once: ' + Object.keys(ls).join(' and ')); break; }
          }
        } finally { Date.now = realNow; _fidsSignWhoAlt(); }
      }
      // THE PRIORITY GROUP'S NUMBER, never smaller than its own title; under
      // the check, something in its row lit
      var lv = L.querySelector('.g8-sign-row .g8-sign-value'), lt = L.querySelector('.g8-sign-title');
      if (lv && lt && parseFloat(getComputedStyle(lv).fontSize) < parseFloat(getComputedStyle(lt).fontSize) - 0.5) out.push('left: its number (' + r1(parseFloat(getComputedStyle(lv).fontSize)) + ' px) is smaller than its title');
      if (lv && state !== 'ahead' && !lv.querySelector('.g8-v-on, .g8-v-sym:not(.is-wait)')) out.push('left: the check stands under a row that is all faint');
      // THE SWITCH LEADS BY ITS OWN SIZE
      if (R.classList.contains('is-switch')) {
        var fz = function (e) { return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
        var sp = R.querySelector('.g8-sign-picto'), sh = sp ? sp.getBoundingClientRect().height : 0;
        if (sh < 0.6 * 0.2 * innerHeight) out.push('the switch\\'s group of passengers is ' + r1(sh) + ' px tall, under 60% of the size of a number of a call');
        if (lv && sh < lv.getBoundingClientRect().height - 1) out.push('the switch\\'s group of passengers is smaller than the number of the priority group');
        var sv = fz(R.querySelector('.g8-sign-value')), st0 = fz(R.querySelector('.g8-sign-title'));
        if (fz(lt) > sv + 0.5) out.push('left: its title (' + r1(fz(lt)) + ' px) is bigger than the switch\\'s ' + r1(sv));
        var lst = L.querySelector('.g8-sign-status');
        if (fz(lst) > st0 + 0.5) out.push('left: its state line (' + r1(fz(lst)) + ' px) is bigger than GENERAL BOARDING (' + r1(st0) + ')');
        var lro = L.querySelector('.g8-sign-roster');
        if (lro && fz(lro) > Math.max(st0, floor + 0.25) + 0.5) out.push('left: its list (' + r1(fz(lro)) + ' px) is bigger than GENERAL BOARDING (' + r1(st0) + ')');
      }
      var info = { state: state, list: small < 1e9 ? r1(small) : 0, pages: pagesSeen };
      var ln = L.querySelector('.g8-sign-lanes');
      if (ln) info.lanes = r1(parseFloat(getComputedStyle(ln).fontSize));
      if (lv) info.prio = r1(parseFloat(getComputedStyle(lv).fontSize));
      var rv = R.querySelector('.g8-sign-row .g8-sign-value');
      if (rv && !R.classList.contains('is-switch')) {
        var fsv = parseFloat(getComputedStyle(rv).fontSize), full = 0.2 * innerHeight;
        info.number = r1(fsv);
        var plain = rv.textContent.replace(/\\s+/g, '').length <= 2;
        if (fsv < full * 0.72 - 1) out.push('the current call\\'s number is ' + r1(fsv) + ' px, under 72% of the one centre\\'s ' + r1(full));
        if (plain && !R.querySelector('.g8-sign-roster') && fsv < full - 1) out.push('the current call\\'s number, alone, is ' + r1(fsv) + ' px, not the one centre\\'s ' + r1(full));
      }
      return { problems: out, info: info };
    }
  };
  return 1;
})()`;

test('the two panels on screen: priority for the whole of boarding, every list readable, the current call big', { timeout: 20 * 60 * 1000 }, async (t) => {
  const { serve, browser, CHROME } = await import(HARNESS);
  if (!CHROME) { t.skip('no Chrome or Chromium installed'); return; }
  const server = await serve();
  const port = server.address().port;
  const findings = [], seen = [];
  const runSize = async (w, h) => {
    const b = await browser(330);
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
      await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await S('Emulation.setFocusEmulationEnabled', { enabled: true });
      await S('Page.enable'); await S('Runtime.enable');
      await S('Page.navigate', { url: `http://127.0.0.1:${port}/gids.html?ap=YHZ&mode=demo&gate=99` });
      const up = await ev(`new Promise(function (res) { var t0 = Date.now(); (function poll() {
        try { if (Date.now() - t0 > 3000 && typeof openTestFlight === 'function' && document.getElementById('tfGate') && typeof renderDedicatedScreen === 'function'
          && typeof _fidsSignPageShow === 'function' && document.fonts && document.fonts.status === 'loaded') return res(1); } catch (e) {}
        if (Date.now() - t0 > 60000) return res(0); setTimeout(poll, 400); })(); })`, 70000);
      assert.equal(up, 1, `${w}x${h}: the gate came up`);
      assert.equal(await ev(PAGE), 1);
      for (const c of CASES) {
        const made = await ev(`window.__sgnT.make(${JSON.stringify(c)})`, 30000);
        assert.equal(made, 'ok', `${w}x${h} ${c.id}: the test flight is boarding on gate 99`);
        for (const set of (c.sets || [['en', 'fr']])) {
          await ev(`window.__sgnT.setLangs(${JSON.stringify(set)})`, 20000);
          const RANK = { ahead: 0, part: 1, called: 2 };
          let rank = 0, shownStages = 0;
          // (the priority group's number at each call: one size for the whole of boarding)
          const prioAt = [];
          // the airport's own stage, each call of the plan in turn, then the final call
          for (let i = 0; i < 16; i++) {
            const at = await ev(`window.__sgnT.stage(${i})`, 20000);
            if (at !== i) break;
            let r = await ev('window.__sgnT.judge()');
            // (a paint the page made between two frames, its passes still to
            // run, or the flight put back after a fetch: read once more)
            for (let k = 0; k < 2 && r.problems.length; k++) { await ev('window.__sgnT.again()', 20000); r = await ev('window.__sgnT.judge()'); }
            if (r.nosign) {
              if (process.env.SIGN_RENDER_SHOTS) { const sh = await S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.SIGN_RENDER_SHOTS, `nosign-${w}-${c.flight}-${i}.png`), Buffer.from(sh.data, 'base64')); fs.writeFileSync(path.join(process.env.SIGN_RENDER_SHOTS, `nosign-${w}-${c.flight}-${i}.txt`), String(await ev("JSON.stringify({ cf: window._gateCurrentFlight && [window._gateCurrentFlight.flight, window._gateCurrentFlight.status, window._gateCurrentFlight._sortTs - Date.now()], tf: (window._testFlights || []).map(function (f) { return [f.flight, f.status, f._boardStage, f.gate]; }), dep: data.dep.filter(function (f) { return f.gate === '99'; }).map(function (f) { return f.flight; }), screen: screenType, sub: subScreenVal, gv: document.getElementById('gateView') && document.getElementById('gateView').innerHTML.slice(0, 600) })"))); }
              await ev(`window.__sgnT.stage(${i})`, 20000); r = await ev('window.__sgnT.judge()');
            }
            const where = `${w}x${h} ${set.join('+')} ${c.id}, call ${i}`;
            seen.push(`${where}: ${JSON.stringify(r.info || {})}`);
            for (const p of r.problems) findings.push(`${where}: ${p}`);
            const k = RANK[(r.info || {}).state];
            if (k == null) continue;
            if (k < rank) findings.push(`${where}: the priority group went back to "${r.info.state}" after it was called`);
            rank = Math.max(rank, k);
            shownStages++;
            if (r.info.prio) prioAt.push(r.info.prio);
          }
          if (shownStages < 3) findings.push(`${w}x${h} ${set.join('+')} ${c.id}: only ${shownStages} calls were shown`);
          if (prioAt.length && Math.max(...prioAt) - Math.min(...prioAt) > 0.5) findings.push(`${w}x${h} ${set.join('+')} ${c.id}: the priority group's number changes size from call to call (${prioAt.join(', ')} px)`);
          await ev(`window.__sgnT.stage('final')`, 20000);
          let fr = await ev('window.__sgnT.judge()');
          for (let k = 0; k < 2 && fr.problems.length; k++) { await ev('window.__sgnT.again()', 20000); fr = await ev('window.__sgnT.judge()'); }
          const where = `${w}x${h} ${set.join('+')} ${c.id}, final call`;
          seen.push(`${where}: ${JSON.stringify(fr.info || {})}`);
          for (const p of fr.problems) findings.push(`${where}: ${p}`);
          if ((fr.info || {}).state !== 'called') findings.push(`${where}: the priority group is "${(fr.info || {}).state}" at the final call`);
          await ev(`window.__sgnT.stage(0)`, 20000);
        }
      }
    } finally {
      b.close();
    }
  };
  try {
    for (const [w, h] of SIZES) await runSize(w, h);
  } finally {
    server.close();
  }
  if (process.env.SIGN_RENDER_LOG) fs.writeFileSync(process.env.SIGN_RENDER_LOG, seen.join('\n') + '\n\n' + findings.join('\n') + '\n');
  assert.ok(seen.length >= SIZES.length * CASES.length * 4, 'every case was drawn: ' + seen.length);
  assert.deepEqual(findings, [], '\n' + findings.slice(0, 40).join('\n'));
});

// 2026-10-29 — MORE ROOM NEVER TAKES THE PRIORITY GROUP'S NUMBER DOWN. The
// test above failed now and then on CI, United in Japanese and Arabic at
// 1680x1050: the priority group's number 111.6 px at its first call and
// 131.3 px at every other. The band over the sign is not the same height
// from one pass to the next (82.7 to 86.3 px), so the sign was fitted in a
// panel two or three pixels taller on some passes than on others; on a
// taller one the list's pages filled it to the fitter's pixel, the box held
// to the tallest page rounded up came to two past the foot, and the number
// took a step it did not need (_fidsSignPaginate). Here the same sign, at
// 1720x1055 where that happened on every taller pass, is fitted again with
// the band held a quarter of a pixel shorter each time, down to four: the
// panel only grows, so its number never comes down.
test('the priority group\'s number: a panel with more room never takes it down a step', { timeout: 5 * 60 * 1000 }, async (t) => {
  const { serve, browser, CHROME } = await import(HARNESS);
  if (!CHROME) { t.skip('no Chrome or Chromium installed'); return; }
  const server = await serve();
  const port = server.address().port;
  const [w, h] = [1720, 1055];
  const c = CASES0.find((x) => x.airline === 'UA');
  const b = await browser(330);
  let r;
  try {
    const { targetInfos } = await b.send('Target.getTargets');
    const page = targetInfos.find((x) => x.type === 'page');
    const tid = page ? page.targetId : (await b.send('Target.createTarget', { url: 'about:blank' })).targetId;
    const { sessionId } = await b.send('Target.attachToTarget', { targetId: tid, flatten: true });
    const S = (m, p, ms) => b.send(m, p, sessionId, ms);
    const ev = async (expression, ms) => {
      const x = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms);
      if (x && x.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(x.exceptionDetails).slice(0, 400));
      return x && x.result && x.result.value;
    };
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await S('Emulation.setFocusEmulationEnabled', { enabled: true });
    await S('Page.enable'); await S('Runtime.enable');
    await S('Page.navigate', { url: `http://127.0.0.1:${port}/gids.html?ap=YHZ&mode=demo&gate=99` });
    const up = await ev(`new Promise(function (res) { var t0 = Date.now(); (function poll() {
      try { if (Date.now() - t0 > 3000 && typeof openTestFlight === 'function' && document.getElementById('tfGate') && typeof renderDedicatedScreen === 'function'
        && typeof _fidsSignPageShow === 'function' && document.fonts && document.fonts.status === 'loaded') return res(1); } catch (e) {}
      if (Date.now() - t0 > 60000) return res(0); setTimeout(poll, 400); })(); })`, 70000);
    assert.equal(up, 1, `${w}x${h}: the gate came up`);
    assert.equal(await ev(PAGE), 1);
    assert.equal(await ev(`window.__sgnT.make(${JSON.stringify(c)})`, 30000), 'ok', 'the test flight is boarding on gate 99');
    await ev(`window.__sgnT.setLangs(["ja", "ar"])`, 20000);
    assert.equal(await ev(`window.__sgnT.stage(0)`, 20000), 0, 'its first call');
    // (the band held at each height, the sign's passes run twice there: a
    // step two passes take is kept for the flight)
    r = await ev(`(function () {
      var band = document.querySelector('.g8-board.active .g8-band');
      var L = document.querySelector('.g8-board.active .g8-sign .g8-sign-left');
      if (!band || !L) return { error: 'no band or no sign: ' + !!band + ' ' + !!L };
      var ro = L.querySelector('.g8-sign-roster'), lv = L.querySelector('.g8-sign-row .g8-sign-value');
      var h0 = band.getBoundingClientRect().height, out = [];
      try {
        for (var q = 0; q <= 16; q++) {
          var bh = h0 - q * 0.25;
          ['height', 'min-height', 'max-height'].forEach(function (p) { band.style.setProperty(p, bh + 'px', 'important'); });
          _fidsPairSeparators(document); _fidsPairSeparators(document);
          out.push({ band: Math.round(bh * 100) / 100, panel: L.clientHeight, over: L.scrollHeight - L.clientHeight,
            paged: !!(ro && ro.classList.contains('is-paged')), prio: Math.round(parseFloat(getComputedStyle(lv).fontSize) * 10) / 10 });
        }
      } finally {
        ['height', 'min-height', 'max-height'].forEach(function (p) { band.style.removeProperty(p); });
        _fidsPairSeparators(document);
      }
      var memo = window._g8PrioStep;
      return { reads: out, kept: memo && memo.n ? (memo.n.boarding || 0) : 0 };
    })()`, 60000);
  } finally {
    b.close();
    server.close();
  }
  assert.ok(r && !r.error, r && r.error);
  const reads = r.reads, at0 = reads[0];
  const show = reads.map((x) => `band ${x.band} px: panel ${x.panel}, number ${x.prio}${x.paged ? ', in pages' : ''}${x.over > 1 ? `, ${x.over} px past its foot` : ''}`).join('\n');
  // (the case still pages its list here: otherwise this proves nothing)
  assert.ok(reads.some((x) => x.paged), 'the priority group\'s list in pages at some height:\n' + show);
  assert.ok(reads[reads.length - 1].panel > at0.panel, 'the panel grew as the band was held shorter:\n' + show);
  for (const x of reads) {
    assert.ok(x.over <= 1, `the panel runs ${x.over} px past its foot under a ${x.band} px band:\n` + show);
    assert.ok(Math.abs(x.prio - at0.prio) <= 0.5, `the priority group's number came down under a band ${Math.round((at0.band - x.band) * 100) / 100} px shorter (${x.prio} against ${at0.prio}):\n` + show);
  }
  // (and no step kept for the flight: one taken before this began would
  // have held every reading here at the smaller size)
  assert.equal(r.kept, 0, 'a step kept for the priority group\'s number on its first call, where every page fits at its size:\n' + show);
});
