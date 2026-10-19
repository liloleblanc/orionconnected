'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE AIRCRAFT-PENDING NOTICE, ON SCREEN: WHOLE, IN THE SKY, IN EVERY
// LANGUAGE THE BOARD CAN SHOW IT IN.
//
// With no picture of the aircraft on file, gate-visual-integrity.js turns the
// picture's box on the gate's aircraft shelf into a notice: 'Aircraft image
// pending | Image de l'appareil à venir'. Until v24066 it was centred in the
// whole panel, whose lower part lies under the caption band, and it wrapped
// wherever it ran out of room: at 1920x1080 it read 'Aircraft image pending |
// Image de l'appareil à' with 'venir' drawn under the band (an Air Canada
// B190 on YQM gate 4), and at 1280x720 it was 10px, under the readable floor.
//
// This draws the notice on the real gate page, in headless Chrome, at the
// sizes the boards run at, through the board's own path: the picture's box
// in the state the board leaves it when every candidate file has failed (the
// picture hidden), which the page's own listener turns into the notice, in
// the board's own words for its languages (setBoardLangs). For every
// language alone and every pair (a pair's two orders draw the same widths;
// French first, the Québec boards' order, is drawn too) it judges what is on
// the screen:
//
//   · every word of the board's languages is there, each language's phrase
//     WHOLE on one line (a pair shares a line or stacks a language a line,
//     never a phrase opened);
//   · every line inside the sky the caption band leaves: not under the band,
//     not past the panel's sides or top;
//   · no word under the readable floor (fidsFitFloor), none reported as not
//     fitting (data-fx-over), and no '|' left at the start or the end of a
//     line.
//
// It skips when no Chrome or Chromium is installed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', 'fids-current');
const HARNESS = pathToFileURL(path.join(__dirname, 'render', 'words.mjs')).href;

test('the notice is built as the board builds a pair, and fitted by the shared fitter', () => {
  const giv = fs.readFileSync(path.join(ROOT, 'js', 'gate-visual-integrity.js'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'js', 'fids-core.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'display-overrides.css'), 'utf8');
  // each language one whole phrase, the bar dropped when the pair stacks
  assert.match(giv, /_gateLbl\('acImgPending', frF, function \(w\) \{ return '<span class="fx-unit">' \+ w \+ '<\/span>'; \}, ' <span class="bs-sep fx-brk">\|<\/span> '\)/);
  assert.match(giv, /'<span class="v2-rc-aircraft-pending-txt">' \+ words \+ '<\/span>'/);
  // one fitter: the shared one, two lines of whole phrases, held to the sky
  assert.match(core, /\{ sel: '\.gad-map-col-v2 \.v2-rc-aircraft-pending > \.v2-rc-aircraft-pending-txt', box: '\.v2-rc-aircraft-pending', lines: 2, units: true,/);
  assert.doesNotMatch(core, /_boxAssign\(el, Math\.floor\(shelf\.clientWidth \* 0\.88\), Math\.floor\(shelf\.clientHeight \* 0\.7\)/, 'the old fitter sized it to 70% of the whole panel');
  // its box is the sky the band leaves
  assert.match(css, /> \.v2-rc-shelf-illus > \.v2-rc-aircraft-pending \{[^}]*height: calc\(100% - var\(--rcp-cap-live, var\(--rcp-cap\)\) - var\(--rcp-sheet\)\) !important;/);
  assert.match(css, /\.v2-rc-aircraft-pending-txt\.fx-wrap:not\(\.fx-loose\) > \.fx-unit \{ display: block !important; \}/);
  assert.match(css, /\.v2-rc-aircraft-pending-txt\.fx-wrap:not\(\.fx-loose\) > \.fx-brk \{ display: none !important; \}/);
});

// Installed in the page once it is up. Nothing from this file is spliced into
// page code but whole numbers.
const PAGE = `(function () {
  var ALL = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
  var SETS = ALL.map(function (l) { return [l]; });
  for (var i = 0; i < ALL.length; i++) for (var j = i + 1; j < ALL.length; j++) SETS.push([ALL[i], ALL[j]]);
  SETS.push(['fr', 'en']);
  var frames = function (n) { return new Promise(function (res) { (function f(k) { if (!k) return res(); requestAnimationFrame(function () { f(k - 1); }); })(n); }); };
  var seq = 0;
  var r1 = function (v) { return Math.round(v * 10) / 10; };
  // [start, end) of the notice's visible text as a Range across its text nodes
  var rangeAt = function (nodes, a, b) {
    var rg = document.createRange(), s = null, e = null;
    for (var k = 0; k < nodes.length; k++) {
      var nd = nodes[k], len = nd.n.nodeValue.length;
      if (!s && a < nd.at + len) s = [nd.n, a - nd.at];
      if (b <= nd.at + len) { e = [nd.n, b - nd.at]; break; }
    }
    if (!s || !e) return null;
    rg.setStart(s[0], s[1]); rg.setEnd(e[0], e[1]);
    return rg;
  };
  var vis = function (rs) { return [].filter.call(rs, function (q) { return q.width > 0.5 && q.height > 0.5; }); };
  // how many lines a set of boxes stands on
  var linesOf = function (rs) {
    var s = rs.slice().sort(function (x, y) { return x.top - y.top; }), n = 0, bot = -Infinity;
    s.forEach(function (q) { if (q.top > bot - q.height * 0.25) { n++; bot = q.bottom; } else if (q.bottom > bot) bot = q.bottom; });
    return n;
  };
  window.__pendT = {
    sets: SETS.length,
    setLangs: function (si) { setBoardLangs(SETS[si]); return SETS[si].join(','); },
    // The picture's box as the board leaves it when no candidate file is on
    // the server: the picture hidden by its own error handler. The page's
    // listener (gate-visual-integrity.js) makes the notice of it.
    build: function () {
      var illus = document.querySelector('.gad-map-col-v2 .v2-rc-shelf-illus');
      var cap = illus && illus.querySelector('.v2-rc-acb-cap');
      if (!cap) return Promise.resolve('');
      var id = String(++seq);
      var old = illus.querySelector('.v2-rc-aircraft-hold, .v2-rc-aircraft-img, .v2-rc-aircraft-pending');
      var art = document.createElement('div');
      art.className = 'v2-rc-aircraft-img';
      art.setAttribute('data-pendtest', id);
      var im = document.createElement('img');
      im.className = 'g8-aircraft-img';
      im.alt = '';
      im.addEventListener('error', function () { im.style.display = 'none'; });
      im.src = '/aircraft/no-picture-on-file-' + id + '.png';
      art.appendChild(im);
      if (old) old.parentNode.replaceChild(art, old); else illus.insertBefore(art, cap);
      return new Promise(function (res) { var t0 = Date.now(); (function poll() {
        var el = document.querySelector('[data-pendtest="' + id + '"]');
        if (!el || !el.isConnected) return res('');
        if (el.classList.contains('v2-rc-aircraft-pending') && (el.textContent || '').trim()) return frames(3).then(function () { res(id); });
        if (Date.now() - t0 > 8000) return res('');
        setTimeout(poll, 40); })(); });
    },
    // the problems on the screen, as words; [] when there are none
    judge: function (id) {
      var el = document.querySelector('.gad-map-col-v2 .v2-rc-aircraft-pending[data-pendtest="' + id + '"]');
      if (!id || !el || !el.isConnected) return { redrawn: true };
      var illus = el.closest('.v2-rc-shelf-illus'), cap = illus.querySelector('.v2-rc-acb-cap');
      var P = illus.getBoundingClientRect(), C = cap.getBoundingClientRect();
      var sky = { l: P.left, r: P.right, t: P.top, b: C.top };
      var out = [], floor = fidsFitFloor();
      // the board's words for its languages
      var fr = frFirstAirport(window._gateIata || 'YQM');
      var want = [];
      BoardStrings.pairLangs(langs, fr).forEach(function (l) { var w = _GATE_LBL.acImgPending[l]; if (w && want.indexOf(w) < 0) want.push(w); });
      // the visible text, in order
      var nodes = [], all = '', tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n, px = [];
      while ((n = tw.nextNode())) {
        var pe = n.parentElement;
        if (!pe.getClientRects().length || getComputedStyle(pe).visibility === 'hidden') continue;
        nodes.push({ n: n, at: all.length });
        all += n.nodeValue;
        if (n.nodeValue.trim()) {
          var fs = parseFloat(getComputedStyle(pe).fontSize);
          px.push(fs);
          if (fs < floor - 0.05) out.push(JSON.stringify(n.nodeValue.trim().slice(0, 30)) + ' is ' + r1(fs) + 'px, under the readable floor (' + floor + 'px)');
        }
      }
      want.forEach(function (w) { if (all.indexOf(w) < 0) out.push(JSON.stringify(w) + ' is not on the screen'); });
      // every word on one line, inside the sky; the lines it makes
      var words = [], re = /\\S+/g, m;
      while ((m = re.exec(all))) {
        var rg = rangeAt(nodes, m.index, m.index + m[0].length);
        var rs = rg ? vis(rg.getClientRects()) : [];
        if (!rs.length) continue;
        var t = JSON.stringify(m[0]);
        if (linesOf(rs) > 1) out.push(t + ' is broken over two lines');
        rs.forEach(function (q) {
          if (q.bottom > sky.b + 0.5) out.push(t + ' is drawn ' + r1(q.bottom - sky.b) + 'px under the caption band');
          else if (q.top < sky.t - 0.5) out.push(t + ' stands above the panel');
          if (q.left < sky.l - 0.5 || q.right > sky.r + 0.5) out.push(t + ' runs past the panel\\'s side (' + r1(q.left) + '-' + r1(q.right) + ' in ' + r1(sky.l) + '-' + r1(sky.r) + ')');
        });
        words.push({ w: m[0], q: rs[0] });
      }
      // each language's phrase whole on one line
      want.forEach(function (w) {
        var at = all.indexOf(w); if (at < 0) return;
        var rg = rangeAt(nodes, at, at + w.length), rs = rg ? vis(rg.getClientRects()) : [];
        var k = linesOf(rs);
        if (k > 1) out.push(JSON.stringify(w) + ' is opened over ' + k + ' lines');
      });
      // no '|' left at a line's start or end
      var lines = [];
      words.forEach(function (x) {
        var ln = null;
        for (var a = 0; a < lines.length; a++) { var L = lines[a]; if (Math.min(L.b, x.q.bottom) - Math.max(L.t, x.q.top) > 0.5 * Math.min(L.b - L.t, x.q.height)) { ln = L; break; } }
        if (!ln) { ln = { t: x.q.top, b: x.q.bottom, ws: [] }; lines.push(ln); }
        ln.ws.push(x);
      });
      lines.forEach(function (L) {
        L.ws.sort(function (x, y) { return x.q.left - y.q.left; });
        if (L.ws[0].w === '|' || L.ws[L.ws.length - 1].w === '|') out.push('a "|" is left at the end of a line');
      });
      if (el.matches('[data-fx-over]') || el.querySelector('[data-fx-over]')) out.push('the fitter reports the notice does not fit');
      return { problems: out, info: { px: px.length ? r1(Math.min.apply(null, px)) : 0, lines: lines.length, sky: r1(sky.r - sky.l) + 'x' + r1(sky.b - sky.t) } };
    }
  };
  return 1;
})()`;

const SIZES = [[1920, 1080], [1680, 1050], [1280, 720], [1280, 1024], [1080, 1920]];

test('the aircraft-pending notice on screen: every language whole, in the sky over the band, never under the floor', { timeout: 20 * 60 * 1000 }, async (t) => {
  const { serve, browser, CHROME } = await import(HARNESS);
  if (!CHROME) { t.skip('no Chrome or Chromium installed'); return; }
  const server = await serve();
  const port = server.address().port;
  const findings = [];
  const seen = [];
  let nSets = 0;
  // one browser for each screen size, each under its own alarm
  const runSize = async (w, h) => {
    const b = await browser(300);
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
      await S('Page.navigate', { url: `http://127.0.0.1:${port}/gids.html?ap=YQM&mode=demo&gate=4` });
      // the gate in its demonstration mode, held there once its first pass at
      // the feed (which nothing here can reach) has answered
      const up = await ev(`new Promise(function (res) { var t0 = Date.now(), held = false; (function poll() {
        try { if (!held && Date.now() - t0 > 3000 && typeof loadDemo === 'function' && data
            && (window._initialFetchDone === true || Date.now() - t0 > 50000)) { held = true; LIVE_MODE = false; loadDemo(); } } catch (e) {}
        try { if (held && document.querySelector('.gad-map-col-v2 .v2-rc-shelf-illus .v2-rc-acb-cap') && typeof setBoardLangs === 'function'
          && typeof _gateLbl === 'function' && typeof fidsFitFloor === 'function' && document.fonts && document.fonts.status === 'loaded') return res(1); } catch (e) {}
        if (Date.now() - t0 > 65000) return res(0); setTimeout(poll, 400); })(); })`, 75000);
      assert.equal(up, 1, `${w}x${h}: the gate came up with its aircraft shelf`);
      assert.equal(await ev(PAGE), 1);
      nSets = await ev('window.__pendT.sets');
      await ev('new Promise(function (r) { setTimeout(r, 1500); })');
      for (let si = 0; si < nSets; si++) {
        const set = await ev(`window.__pendT.setLangs(${si | 0})`);
        await ev('new Promise(function (r) { setTimeout(r, 250); })');
        let r = null;
        for (let tries = 0; tries < 3 && (!r || r.redrawn); tries++) {
          const id = await ev('window.__pendT.build()', 20000);
          r = await ev(`window.__pendT.judge(${JSON.stringify(id)})`);
        }
        assert.ok(r && !r.redrawn, `${w}x${h} ${set}: the notice came up and stayed on the screen long enough to be read`);
        seen.push(`${w}x${h} ${set}: ${r.info.px}px, ${r.info.lines} line(s) in ${r.info.sky}`);
        for (const p of r.problems) findings.push(`${w}x${h} ${set}: ${p}`);
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
  if (process.env.PENDING_RENDER_LOG) fs.writeFileSync(process.env.PENDING_RENDER_LOG, seen.join('\n') + '\n' + findings.join('\n') + '\n');
  assert.ok(nSets >= 46 && seen.length >= SIZES.length * nSets, 'every case was drawn: ' + seen.length);
  assert.deepEqual(findings, [], '\n' + findings.slice(0, 40).join('\n'));
});
