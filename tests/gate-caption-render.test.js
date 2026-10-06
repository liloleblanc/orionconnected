'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE GATE'S AIRCRAFT CAPTION, ON SCREEN: ONE ROW, NOTHING OVER ANYTHING,
// THE MARK'S LETTERS AS TALL AS THE CAPITALS BESIDE THEM, THE ART CLEAR.
//
// tests/gate-caption-one-row.test.js reads the fitter's source. This draws
// the caption in the real gate page, in headless Chrome, at the sizes the
// boards run at, and judges what is on the screen:
//
//   · ONE ROW: the operator's half stands beside the aircraft's half (the
//     v23904 caption), never under it (step 7a, v23972 to v24003, stacked
//     it, and at YOW gate 25 the band went from 60px to 121px and covered the
//     foot of the Air Canada roundel).
//   · NOTHING CUT, NOTHING OVER: every line of text stands inside its own
//     half and inside the band, and the halves do not overlap (on a
//     1280x1024 board and in a portrait screen's 237px column the model ran
//     through the rule into 'Durchgeführt von:'); no word under the readable
//     floor; no caption reported as not fitting.
//   · RULE 1, READ ON THE LETTERS: the operator's mark is drawn into a canvas
//     at the size it is painted, and the height of its letters (the median
//     glyph of each line of lettering) is held against the capitals of the
//     type beside it (canvas measureText). Air Canada Express is AIR CANADA
//     over EXPRESS, each line a third of its file: drawn as tall as 12px
//     words its letters were 6px beside 8px capitals.
//   · THE ART CLEAR OF THE BAND: the airline's emblem (no aircraft yet) is
//     drawn whole between the panel's top and the band's top, and the
//     aircraft picture's box ends on the band's top, however tall the band
//     has grown.
//
// The cases are built in the page from the board's own words (the
// language store, French first in Québec) and its own art: no aircraft
// yet beside Air Canada Express and PAL; a Dash 8-400 beside Air Canada
// Express; a Dash 8-100 with its registration beside PAL; a Rouge A319; a
// Dash 8-300 beside an operator shown by name. The page is the gate in its
// demonstration mode, with every host but this checkout's unreachable.
// It skips when no Chrome or Chromium is installed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HARNESS = pathToFileURL(path.join(__dirname, 'render', 'words.mjs')).href;

// Installed in the page once it is up. Each case is built where the board
// builds its caption and fitted by the board's own gateAutofit; nothing from
// this file is spliced into page code but the page's own constants below and
// whole numbers.
const PAGE = `(function () {
  var CASES = [
    { id: 'no aircraft yet, Air Canada Express', art: 'hold', op: 'ACEX' },
    { id: 'no aircraft yet, PAL', art: 'hold', op: 'PB' },
    { id: 'Dash 8-400, Air Canada Express', art: 'aircraft', eq: 'DH4', model: 'De Havilland Dash 8-400', op: 'ACEX' },
    { id: 'Dash 8-100 C-FPAE, PAL', art: 'aircraft', eq: 'DH4', model: 'De Havilland Dash 8-100', reg: 'C-FPAE', op: 'PB' },
    { id: 'A319 C-FYKC, Rouge', art: 'aircraft', eq: '319', model: 'Airbus A319', reg: 'C-FYKC', op: 'RV' },
    { id: 'Dash 8-300 C-GPCY, Air Saint-Pierre', art: 'aircraft', eq: 'DH4', model: 'De Havilland Dash 8-300', reg: 'C-GPCY', name: 'Air Saint-Pierre' }
  ];
  // (fr,en is en,fr's widths in the other order; the Québec boards are
  // read in the full render matrix)
  var SETS = [['en', 'fr'], ['de', 'pt'], ['es', 'it'], ['ja', 'ar']];
  var frames = function (n) { return new Promise(function (res) { (function f(k) { if (!k) return res(); requestAnimationFrame(function () { f(k - 1); }); })(n); }); };
  var loaded = function (imgs) {
    return Promise.all([].map.call(imgs, function (im) {
      if (im.complete && im.naturalWidth) return 1;
      return new Promise(function (res) { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); setTimeout(res, 4000); });
    }));
  };
  window.__capT = {
    count: CASES.length, sets: SETS.length,
    setLangs: function (si) { try { setBoardLangs(SETS[si]); } catch (e) {} return SETS[si].join(','); },
    build: function (ci) {
      var s = CASES[ci];
      var cap = document.querySelector('.gad-map-col-v2 .v2-rc-acb-cap');
      if (!cap) return Promise.resolve('no caption');
      var illus = cap.closest('.v2-rc-shelf-illus');
      // the art: the airline's emblem with no aircraft yet, else the picture
      var old = illus.querySelector('.v2-rc-aircraft-hold, .v2-rc-aircraft-img');
      var art = document.createElement('div');
      if (s.art === 'hold') {
        art.className = 'v2-rc-aircraft-hold';
        art.innerHTML = '<img class="v2-rc-aircraft-hold-logo" src="' + _airlineOrbEmblem('AC') + '" alt="">';
      } else {
        art.className = 'v2-rc-aircraft-img';
        art.innerHTML = aircraftImgTag(s.op === 'RV' ? 'RV' : 'AC', s.eq, { rawModel: s.model, reg: s.reg || '' });
      }
      if (old) old.parentNode.replaceChild(art, old); else illus.insertBefore(art, cap);
      // the caption, as the board writes it
      var fr = frFirstAirport(window._gateIata || 'YQM');
      var nbw = function (t) { return '<span style="white-space:nowrap;">' + t + '</span>'; };
      var model = function (t) { var g = _acbModelGroups(t); return '<span style="white-space:nowrap;">' + (g.length > 1 ? g.map(function (x) { return '<span class="fx-unit">' + x + '</span>'; }).join(' ') : t) + '</span>'; };
      var known = !!s.model;
      var val = known ? (model(s.model) + (s.reg ? ' <span class="v2-rc-acb-sep">|</span> ' + nbw(s.reg) : ''))
        : _gateLbl('acPending', fr, nbw, ' <span class="v2-rc-fi-sep">|</span> ');
      var acLbl = _gateLbl('aircraft', fr, function (w) { return '<span class="v2-rc-opby-lline v2-rc-acb-lline">' + w + ':</span>'; }, '');
      var opLbl = _gateLbl('operatedBy', fr, function (w) { return '<span class="v2-rc-opby-lline">' + w + ':</span>'; }, '');
      var op = s.op ? '<img class="v2-rc-opby-logo" data-op="' + s.op + '" src="' + OPBY_WORDMARKS_THEMED[s.op].onDark + '" alt="">' : '<b>' + s.name + '</b>';
      cap.className = 'v2-rc-acb-cap' + (known ? '' : ' is-pending') + ' has-op' + (s.reg ? ' has-reg' : '')
        + (/^(PB|ACEX)$/.test(s.op || '') ? ' has-widemark' : '');
      cap.setAttribute('data-captest', String(ci));
      cap.innerHTML = '<div class="v2-rc-acb-ac' + (known ? '' : ' is-pending') + '">'
        + (known ? '<span class="v2-rc-acb-lbl v2-rc-acb-opby-lbl">' + acLbl + '</span>' : '')
        + '<div class="v2-rc-acb-actype v2-rc-actype-val">' + val + '</div></div>'
        + '<div class="v2-rc-acb-opby"><span class="v2-rc-acb-opby-lbl">' + opLbl + '</span><span class="v2-rc-acb-opby-logo v2-rc-opby-val">' + op + '</span></div>';
      return loaded(illus.querySelectorAll('img')).then(function () {
        var gv = document.getElementById('gateView');
        gateAutofit(gv); gateAutofit(gv);
        return frames(2);
      }).then(function () { return s.id; });
    },
    // the problems on the screen, as words; [] when there are none
    judge: function (ci) {
      var out = [], r1 = function (v) { return Math.round(v * 10) / 10; };
      var cap = document.querySelector('.gad-map-col-v2 .v2-rc-acb-cap');
      // the board drew its own caption over this one (a timed repaint): ask again
      if (!cap || cap.getAttribute('data-captest') !== String(ci)) return { redrawn: true };
      var illus = cap.closest('.v2-rc-shelf-illus');
      var ac = cap.querySelector('.v2-rc-acb-ac'), opc = cap.querySelector('.v2-rc-acb-opby');
      var C = cap.getBoundingClientRect(), A = ac.getBoundingClientRect(), O = opc.getBoundingClientRect();
      var info = { band: r1(C.height), cls: cap.className.replace(/v2-rc-acb-cap|has-op|has-reg|has-widemark|is-pending/g, '').trim() };
      // one row
      var vOver = Math.min(A.bottom, O.bottom) - Math.max(A.top, O.top);
      if (!(vOver > 0.5 * Math.min(A.height, O.height) && O.left >= A.right - 1))
        out.push('two rows: the operator\\'s half (' + r1(O.left) + ',' + r1(O.top) + ') is not beside the aircraft\\'s (' + r1(A.right) + ',' + r1(A.bottom) + ')');
      // every line of text inside its own half and the band
      var walker = document.createTreeWalker(cap, NodeFilter.SHOW_TEXT, null), n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        var pe = n.parentElement, cs = getComputedStyle(pe);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        var half = pe.closest('.v2-rc-acb-opby') ? O : A, other = half === O ? A : O;
        var rg = document.createRange(); rg.selectNodeContents(n);
        [].forEach.call(rg.getClientRects(), function (q) {
          if (q.width < 0.5) return;
          var t = JSON.stringify(n.nodeValue.trim().slice(0, 30));
          if (q.left < half.left - 0.5 || q.right > half.right + 0.5) out.push(t + ' runs out of its half (' + r1(q.left) + '-' + r1(q.right) + ' in ' + r1(half.left) + '-' + r1(half.right) + ')');
          if (q.right > other.left + 0.5 && q.left < other.right - 0.5 && q.bottom > other.top && q.top < other.bottom) out.push(t + ' is drawn over the other half');
          if (q.top < C.top - 1 || q.bottom > C.bottom + 1) out.push(t + ' stands out of the band');
        });
        if (parseFloat(cs.fontSize) < 12 - 0.05) out.push(JSON.stringify(n.nodeValue.trim().slice(0, 30)) + ' is ' + cs.fontSize + ', under the readable floor');
      }
      if (cap.querySelector('[data-fx-over]')) out.push('the fitter reports the caption does not fit');
      if (cap.getAttribute('data-acb-r1')) out.push('the fitter reports the mark under rule 1');
      // rule 1, on the letters: the mark drawn at its painted size
      var im = cap.querySelector('img.v2-rc-opby-logo');
      if (im && im.naturalWidth) {
        var ics = getComputedStyle(im), b = im.getBoundingClientRect();
        var pw = b.width - parseFloat(ics.paddingLeft) - parseFloat(ics.paddingRight), ph = b.height - parseFloat(ics.paddingTop) - parseFloat(ics.paddingBottom);
        var k = Math.min(pw / im.naturalWidth, ph / im.naturalHeight), W = im.naturalWidth * k, H = im.naturalHeight * k;
        // the file drawn 300px tall: its lettering's share of its height,
        // then that share of the height it is painted at
        var S = 300 / H, cv = document.createElement('canvas'); cv.width = Math.ceil(W * S); cv.height = Math.ceil(H * S);
        var g = cv.getContext('2d'); g.drawImage(im, 0, 0, cv.width, cv.height);
        var d = g.getImageData(0, 0, cv.width, cv.height).data, cw = cv.width, ch = cv.height;
        var ink = function (x, y) { return d[(y * cw + x) * 4 + 3] > 100; };
        var bands = [], st = -1, last = -99;
        for (var y = 0; y < ch; y++) { var any = false; for (var x = 0; x < cw; x++) if (ink(x, y)) { any = true; break; }
          if (any) { if (st < 0 || y - last > Math.max(2, ch * 0.015)) { if (st >= 0) bands.push([st, last]); st = y; } last = y; } }
        if (st >= 0) bands.push([st, last]);
        var letters = [];
        bands.forEach(function (bd) {
          var runs = [], rs = -1, top = 1e9, bot = -1;
          for (var x = 0; x <= cw; x++) {
            var t = -1, bt = -1;
            if (x < cw) for (var y2 = bd[0]; y2 <= bd[1]; y2++) if (ink(x, y2)) { if (t < 0) t = y2; bt = y2; }
            if (t >= 0) { if (rs < 0) { rs = x; top = 1e9; bot = -1; } top = Math.min(top, t); bot = Math.max(bot, bt); }
            else if (rs >= 0) { if (x - rs > ch * 0.02) runs.push(bot - top + 1); rs = -1; }
          }
          if (runs.length >= 2) { runs.sort(function (a, c) { return a - c; }); letters.push(runs[Math.floor(runs.length / 2)] / S); }
        });
        // the name's lettering: the line whose glyphs stand tallest (AIR
        // CANADA over EXPRESS: either line; 'rouge' under its small AIR
        // CANADA; ENDEAVOR AIR under its swoosh, which is one glyph)
        var L = letters.length ? Math.max.apply(null, letters) : (bands.length ? (bands[bands.length - 1][1] - bands[0][0] + 1) / S : H);
        var capOf = function (el) {
          var s2 = getComputedStyle(el), c2 = document.createElement('canvas').getContext('2d');
          c2.font = s2.fontStyle + ' ' + s2.fontWeight + ' ' + s2.fontSize + ' ' + s2.fontFamily;
          return c2.measureText('H').actualBoundingBoxAscent;
        };
        var caps = Math.max(capOf(cap.querySelector('.v2-rc-acb-actype')), capOf(opc.querySelector('.v2-rc-opby-lline')));
        info.letters = r1(L); info.caps = r1(caps);
        if (L < caps - 0.3) out.push('rule 1: the mark\\'s letters are ' + r1(L) + 'px beside ' + r1(caps) + 'px capitals');
        if (b.right > C.right + 0.5 || b.left < C.left - 0.5 || b.top < C.top - 0.5 || b.bottom > C.bottom + 0.5) out.push('the mark stands out of the band');
      }
      // the art, clear of the band: laid out (offsets, inside the panel), and
      // the aircraft at every point of its float (its animation sampled, the
      // picture's corners carried through each transform)
      var bandTop = cap.offsetTop;
      var painted = function (im, box) {
        var k = Math.min(box.w / im.naturalWidth, box.h / im.naturalHeight), cs = getComputedStyle(im);
        if (cs.objectFit !== 'contain' && cs.objectFit !== 'scale-down') return box;
        var w = im.naturalWidth * k, h = im.naturalHeight * k;
        var pos = (cs.objectPosition || '50% 50%').split(' ');
        var at = function (v, free) { return /%$/.test(v) ? free * parseFloat(v) / 100 : (v === 'left' || v === 'top') ? 0 : (v === 'right' || v === 'bottom') ? free : (v === 'center') ? free / 2 : parseFloat(v) || 0; };
        return { x: box.x + at(pos[0] || '50%', box.w - w), y: box.y + at(pos[1] || pos[0] || '50%', box.h - h), w: w, h: h };
      };
      var within = function (el, top) { var x = 0, y = 0; for (var e = el; e && e !== top; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight }; };
      var hold = illus.querySelector('.v2-rc-aircraft-hold-logo');
      if (hold && hold.naturalWidth) {
        var hp = painted(hold, within(hold, illus));
        info.emblemGap = r1(bandTop - (hp.y + hp.h));
        if (hp.y + hp.h > bandTop + 0.5) out.push('the emblem\\'s foot is ' + r1(hp.y + hp.h - bandTop) + 'px under the band');
        if (hp.y < -0.5) out.push('the emblem stands above the panel');
        if (hp.h < 20) out.push('the emblem is ' + r1(hp.h) + 'px tall');
      }
      var acw = illus.querySelector('.v2-rc-aircraft-img'), aci = acw && acw.querySelector('img');
      if (acw) {
        var wb = within(acw, illus);
        if (wb.y + wb.h > bandTop + 0.5) out.push('the aircraft picture\\'s box ends ' + r1(wb.y + wb.h - bandTop) + 'px under the band');
        if (aci && aci.naturalWidth) {
          var ib = within(aci, illus), ap = painted(aci, ib);
          var corners = [[ap.x, ap.y], [ap.x + ap.w, ap.y], [ap.x, ap.y + ap.h], [ap.x + ap.w, ap.y + ap.h]];
          var anims = acw.getAnimations ? acw.getAnimations() : [], worst = -1e9;
          var sample = function () {
            var cs = getComputedStyle(acw), m = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform) : new DOMMatrix();
            var o = cs.transformOrigin.split(' ').map(parseFloat), ox = wb.x + (o[0] || 0), oy = wb.y + (o[1] || 0);
            corners.forEach(function (c) { var q = m.transformPoint(new DOMPoint(c[0] - ox, c[1] - oy)); worst = Math.max(worst, q.y + oy); });
          };
          if (anims.length) {
            var a0 = anims[0], dur = a0.effect.getComputedTiming().duration || 0, was = a0.currentTime;
            for (var si = 0; si <= 24; si++) { a0.currentTime = dur * si / 24; sample(); }
            a0.currentTime = was;
          } else sample();
          info.aircraftGap = r1(bandTop - worst);
          if (worst > bandTop + 0.5) out.push('the aircraft picture dips ' + r1(worst - bandTop) + 'px under the band at the low point of its float');
        }
      }
      return { problems: out, info: info };
    }
  };
  return 1;
})()`;

const SIZES = [[1680, 1050], [1280, 720], [1280, 1024], [1080, 1920]];

test('the gate caption on screen: one row, nothing over anything, rule 1 on the letters, the art clear of the band', { timeout: 6 * 60 * 1000 }, async (t) => {
  const { serve, browser, CHROME } = await import(HARNESS);
  if (!CHROME) { t.skip('no Chrome or Chromium installed'); return; }
  const server = await serve();
  const port = server.address().port;
  const b = await browser(330);
  const findings = [];
  const seen = [];
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
    await S('Emulation.setDeviceMetricsOverride', { width: SIZES[0][0], height: SIZES[0][1], deviceScaleFactor: 1, mobile: false });
    await S('Emulation.setFocusEmulationEnabled', { enabled: true });
    await S('Page.enable'); await S('Runtime.enable');
    await S('Page.navigate', { url: `http://127.0.0.1:${port}/gids.html?ap=YQM&mode=demo&gate=4` });
    // The gate in its demonstration mode, held there once its first pass at
    // the feed (which nothing here can reach) has answered, as the rendered
    // language check holds it (tests/render/words.mjs, BOARD_UP).
    const up = await ev(`new Promise(function (res) { var t0 = Date.now(), held = false; (function poll() {
      try { if (!held && Date.now() - t0 > 3000 && typeof loadDemo === 'function' && data
          && (window._initialFetchDone === true || Date.now() - t0 > 50000)) { held = true; LIVE_MODE = false; loadDemo(); } } catch (e) {}
      try { if (held && typeof gateAutofit === 'function' && document.querySelector('.gad-map-col-v2 .v2-rc-acb-cap') && typeof aircraftImgTag === 'function'
        && typeof _gateLbl === 'function' && document.fonts && document.fonts.status === 'loaded') return res(1); } catch (e) {}
      if (Date.now() - t0 > 65000) return res(0); setTimeout(poll, 400); })(); })`, 75000);
    assert.equal(up, 1, 'the gate came up with its caption');
    assert.equal(await ev(PAGE), 1);
    const nCases = await ev('window.__capT.count'), nSets = await ev('window.__capT.sets');
    for (const [w, h] of SIZES) {
      await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await ev('new Promise(function (r) { setTimeout(r, 1800); })');
      for (let si = 0; si < nSets; si++) {
        const set = await ev(`window.__capT.setLangs(${si | 0})`);
        await ev('new Promise(function (r) { setTimeout(r, 900); })');
        for (let ci = 0; ci < nCases; ci++) {
          let r = null, id = '';
          for (let tries = 0; tries < 3 && (!r || r.redrawn); tries++) {
            id = await ev(`window.__capT.build(${ci | 0})`, 20000);
            r = await ev(`window.__capT.judge(${ci | 0})`);
          }
          assert.ok(r && !r.redrawn, `${w}x${h} ${set} ${id}: the case stayed on the screen long enough to be read`);
          seen.push(`${w}x${h} ${set} ${id}: band ${r.info.band}${r.info.letters ? `, letters ${r.info.letters}/${r.info.caps}` : ''}`
            + `${r.info.emblemGap != null ? `, emblem ${r.info.emblemGap} clear` : ''}${r.info.aircraftGap != null ? `, aircraft ${r.info.aircraftGap} clear` : ''}${r.info.cls ? ' [' + r.info.cls + ']' : ''}`);
          for (const p of r.problems) findings.push(`${w}x${h} ${set} — ${id}: ${p}`);
        }
      }
    }
  } finally {
    b.close();
    server.close();
  }
  if (process.env.CAPTION_RENDER_LOG) fs.writeFileSync(process.env.CAPTION_RENDER_LOG, seen.join('\n') + '\n' + findings.join('\n') + '\n');
  assert.ok(seen.length >= SIZES.length * 4 * 6, 'every case was drawn: ' + seen.length);
  assert.deepEqual(findings, [], '\n' + findings.slice(0, 40).join('\n'));
});
