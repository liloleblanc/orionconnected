'use strict';

// WHY THIS EXISTS
//
// On these screens a light that flashes, pulses or travels is read as news:
// a status has changed, or something is wrong. Flashing is kept for a status
// or an emergency. Static colour is fine, airline colours included. Colour
// that MOVES when it is not a status is the problem, above all amber/yellow
// (delayed) and red (cancelled, and Air Canada's leaf). White lightning is
// fine.
//
// v23933 stilled every non-status moving amber, yellow or red light found on
// the live boards. Each keeps its look and loses only its motion:
//
//   1. Departures Weather column (and the stream's departures pages): the
//      thunderstorm icon's amber bolt blinked about once a second (navy on
//      the Delayed / Final call rows' -light icon). logos/weather/animated.
//   2. Empty-gate "Awaiting Next Flight" weather box: the same icon.
//   3. Gate weather card: the flat thunderstorm icons' yellow bolt dipped to
//      a quarter every 3.4 s. logos/weather/flat, inlined by _wxHydrateSvgs.
//   7. Weather card, clear-day city photo: the warm sun glow breathed.
//  13. Weather card, clear-day city photo: the pale sun rays turned.
//  10. Loading splash: the amber dot before "YQM · LOADING" pulsed.
//  14. Loading splash: an amber highlight stepped along EN / FR / ES / ...
//  15. Gate countdown and NOW BOARDING strip: the carrier roundel turned like
//      a coin every 7 s (red on Air Canada).
//
// Left as they are, on purpose: the white lightning in the night-storm and
// rain footage, the white stars, the white tip on the weather title's rule,
// the phone-only Final call pulse (a status), uploaded advert creative, the
// toolbar LIVE dot, and every gentle motion (rain, snow, cloud, the sun icon's
// slow turn, the aircraft float, videos, slide fades, the ticker).
//
// Measured in headless Chrome at 1680x1050, before (main, v23929) and after,
// sampling each item over at least two of its old periods; the numbers are in
// the PR. These tests pin the source that produces them.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUB = path.resolve(__dirname, '..', 'fids-current');
const read = (p) => fs.readFileSync(path.join(PUB, p), 'utf8');
const CORE = read('js/fids-core.js');
const V2 = read('js/fids-v2.js');
const CSS = read('css/display-overrides.css');

// ── a small cascade resolver for display-overrides.css ──────────────────────
// Every declaration that matters here is !important, so the rule that wins is
// the heaviest selector, then the last written. Reduced-motion blocks are left
// out: they still things on request, which is not what is being pinned.
function topLevelRules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  let i = 0;
  (function walk(lo, hi, skip) {
    let k = lo;
    while (k < hi) {
      const open = src.indexOf('{', k);
      if (open < 0 || open >= hi) break;
      const head = src.slice(k, open).trim();
      let d = 1, e = open + 1;
      for (; e < hi && d; e++) { if (src[e] === '{') d++; else if (src[e] === '}') d--; }
      const body = src.slice(open + 1, e - 1);
      if (head.startsWith('@')) {
        if (/^@media\b/.test(head) && !/prefers-reduced-motion/.test(head)) walk(open + 1, e - 1, skip);
        else if (/^@supports\b/.test(head)) walk(open + 1, e - 1, skip);
      } else if (!skip) {
        out.push({ sels: splitSelectors(head), body, order: i++ });
      }
      k = e;
    }
  })(0, src.length, false);
  return out;
}
function splitSelectors(s) {
  const out = []; let d = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') d++; else if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const bare = (sel) => sel.replace(/:not\(#_\)|:not\(\._\)/g, '').replace(/\s+/g, ' ').trim();
function weight(sel) {
  const ids = (sel.match(/#/g) || []).length;
  const cls = (sel.match(/\.[A-Za-z_-]|\[|:(?!:)(?!not\()[a-z-]+/g) || []).length;
  return ids * 1e6 + cls;
}
const RULES = topLevelRules(CSS);
/** The value that wins for `prop` on the element `tail` names (the tail is
 *  the end of the selector, e.g. '.g8-cd-mark .g8-cd-mark-still'). */
function winning(tail, props) {
  let best = null;
  for (const r of RULES) {
    for (const s of r.sels) {
      const b = bare(s);
      if (!(b === tail || b.endsWith(' ' + tail))) continue;
      for (const p of props) {
        const m = r.body.match(new RegExp('(?:^|[;\\s])' + p + '\\s*:\\s*([^;]*?)\\s*!important'));
        if (!m) continue;
        const w = weight(s);
        if (!best || w > best.w || (w === best.w && r.order >= best.order)) best = { w, order: r.order, prop: p, value: m[1].trim() };
      }
    }
  }
  return best;
}

// ── 1-3: the thunderstorm bolts ─────────────────────────────────────────────
const ANIMATED = ['thunderstorms-rain', 'thunderstorms-rain-light', 'thunderstorms-day-rain', 'thunderstorms-day-rain-light'];
const FLAT = ['thunderstorms', 'thunderstorms-rain', 'thunderstorms-day-rain', 'thunderstorms-night-rain'];

test('the departures and empty-gate storm icon: the bolt is steady, the rain still falls (items 1, 2)', () => {
  for (const n of ANIMATED) {
    const svg = read('logos/weather/animated/' + n + '.svg');
    // The bolt is the one shape drawn from this path; it used to carry an
    // <animate attributeName="opacity" values="1; 1; 0; 1; 0; 1; 0; 1">.
    const bolt = svg.match(/<path\b[^>]*\bd="m34\.8 2-32 96[^"]*"[^>]*?(\/>|>([\s\S]*?)<\/path>)/);
    assert.ok(bolt, n + ': the bolt must still be drawn');
    assert.ok(!bolt[2] || !/<animate|<set\b/.test(bolt[2]), n + ': the bolt must not animate');
    // That animation shared its id with a raindrop's ("x1"), which is why it
    // re-fired on the raindrop's timer, about once a second.
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, n + ': ids must be unique');
    // Left as it was: the three raindrops still fall and fade.
    assert.equal((svg.match(/<animateTransform\b[^>]*type="translate"[^>]*values="0 -60; 0 60"/g) || []).length, 3, n + ': the rain still falls');
  }
});

test('the weather card storm icons: the yellow bolt no longer dims (item 3)', () => {
  for (const n of FLAT) {
    const svg = read('logos/weather/flat/' + n + '.svg');
    const bolt = svg.match(/<polygon\b[^>]*fill="#FFF200"[^>]*?(\/>|>([\s\S]*?)<\/polygon>)/);
    assert.ok(bolt, n + ': the bolt must still be drawn');
    assert.ok(!bolt[2] || !/<animate|<set\b/.test(bolt[2]), n + ': the bolt must not animate');
  }
  // the cloud still bobs (gentle motion, white)
  assert.match(read('logos/weather/flat/thunderstorms-rain.svg'), /values="0 0;0 -3;0 0" dur="3\.6s"/);
});

// A general guard over both sets, so a new icon cannot bring it back: no
// weather icon may fade or blink a warm colour in and out. Rain, hail and snow
// (blue, pale blue, white, and navy on the light rows) may. A warm shape may
// still TURN (the sun), which is motion, not a flashing light.
function hue(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = v.map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, dd = max - min;
  if (!dd) return { h: 0, s: 0, l };
  const s = dd / (1 - Math.abs(2 * l - 1));
  let H = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  H *= 60; if (H < 0) H += 360;
  return { h: H, s, l };
}
const warm = (hex) => { const c = hue(hex); return c.s > 0.35 && c.l > 0.2 && c.l < 0.9 && (c.h < 70 || c.h > 330); };

test('no weather icon fades or blinks a warm colour', () => {
  const offenders = [];
  for (const dir of ['animated', 'flat']) {
    for (const f of fs.readdirSync(path.join(PUB, 'logos/weather', dir)).filter((x) => x.endsWith('.svg'))) {
      const svg = read('logos/weather/' + dir + '/' + f);
      const grad = {};
      for (const m of svg.matchAll(/<(?:linearGradient|radialGradient)\b[^>]*\bid="([^"]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/(?:linearGradient|radialGradient)>)/g)) {
        const own = [...(m[2] || '').matchAll(/stop-color="(#[0-9a-fA-F]{3,6})"/g)].map((x) => x[1]);
        const href = (m[0].match(/xlink:href="#([^"]+)"|\bhref="#([^"]+)"/) || []).slice(1).find(Boolean);
        grad[m[1]] = { own, href };
      }
      const colours = (txt) => {
        const out = [...txt.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,6})"/g)].map((x) => x[1]);
        for (const u of txt.matchAll(/url\(#([^)]+)\)/g)) {
          let g = grad[u[1]], hops = 0;
          while (g && hops++ < 4) { out.push(...g.own); g = g.href ? grad[g.href] : null; }
        }
        return out;
      };
      for (const m of svg.matchAll(/<(animate|set)\b[^>]*attributeName="(?:opacity|fill-opacity|stroke-opacity|fill|stroke|visibility|display)"[^>]*>/g)) {
        // what the animation is applied to: from its element's opening tag
        const before = svg.slice(0, m.index);
        const at = Math.max(before.lastIndexOf('<path'), before.lastIndexOf('<polygon'), before.lastIndexOf('<g '), before.lastIndexOf('<g>'),
          before.lastIndexOf('<circle'), before.lastIndexOf('<rect'), before.lastIndexOf('<ellipse'), before.lastIndexOf('<use'), before.lastIndexOf('<line'));
        const hot = colours(before.slice(at)).filter(warm);
        if (hot.length) offenders.push(dir + '/' + f + ' fades ' + hot.join(','));
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('an icon edited in place is fetched fresh, not from a stale cache', () => {
  // the departures / empty-gate icon: the URL carries the build tag
  assert.match(V2, /const _wxV = \(typeof FIDS_BUILD_TAG !== 'undefined'\) \? '\?v=' \+ encodeURIComponent\(FIDS_BUILD_TAG\) : '';/);
  assert.match(V2, /src="\/logos\/weather\/animated\/' \+ nameKey \+ '\.svg' \+ _wxV \+ '"/);
  // the weather card's flat set: every <img> and the inlining fetch
  assert.match(CORE, /function _wxIconQ\(\) \{\n  return \(typeof FIDS_BUILD_TAG !== 'undefined'\) \? '\?v=' \+ encodeURIComponent\(FIDS_BUILD_TAG\) : '';\n\}/);
  const uses = [...CORE.matchAll(/_WX_ICON_DIR \+ [\w.]+ \+ '\.svg'( \+ _wxIconQ\(\))?/g)];
  assert.ok(uses.length >= 3, 'the plates, the hours and the days');
  for (const u of uses) assert.ok(u[1], 'every flat icon URL carries the tag: ' + u[0]);
  assert.match(CORE, /fetch\(dir \+ name \+ '\.svg' \+ q\)/);
  // the light-row twins are swapped in by CSS, with their own token
  for (const n of ['thunderstorms-rain-light', 'thunderstorms-day-rain-light']) {
    const m = CSS.match(new RegExp('url\\("/logos/weather/animated/' + n + '\\.svg\\?v=(\\d+)"\\)'));
    assert.ok(m && +m[1] >= 23933, n + ' must be re-versioned past the blinking file');
  }
});

// ── 7, 13: the clear-day city photo ─────────────────────────────────────────
test('the clear-day sun glow and its rays hold still, and the glow is kept (items 7, 13)', () => {
  const glow = '.wxcard-wrap .wxc-mon-fx.wxc-fx-clear-day::after';
  const rays = '.wxcard-wrap .wxc-mon-fx.wxc-fx-clear-day::before';
  assert.equal(winning(glow, ['animation', 'animation-name']).value, 'none', 'the glow no longer breathes');
  assert.equal(winning(rays, ['animation', 'animation-name']).value, 'none', 'the rays no longer turn');
  // it keeps its look: the middle of the old breathing range, the same warm light
  assert.equal(winning(glow, ['opacity']).value, '.85');
  assert.equal(winning(glow, ['transform']).value, 'scale(1.03)');
  assert.match(winning(glow, ['background']).value, /rgba\(255,246,200,\.98\)/, 'the warm glow itself is unchanged');
  assert.match(winning(rays, ['background']).value, /repeating-conic-gradient/, 'the rays are still drawn');
  assert.equal(winning(rays, ['transform']).value, 'none');
});

// ── 15: the carrier roundel ─────────────────────────────────────────────────
test('the carrier roundel stands face-on on the countdown and the boarding strip, for every carrier (item 15)', () => {
  for (const tail of ['.g8-bw-clocked .g8-bw-emblem', '.g8-cd-mark .g8-cd-mark-still']) {
    assert.equal(winning(tail, ['animation', 'animation-name']).value, 'none', tail + ' no longer turns');
    assert.equal(winning(tail, ['transform']).value, 'none', tail + ' rests face-on');
  }
  // The other way a mark could turn: a clip registered in the motion slot
  // replaces the still with a video of the mark swinging. It stays empty.
  const m = CORE.match(/var GATE_RONDELLE_MOTION = window\._GATE_RONDELLE_MOTION = (\{[\s\S]*?\n\});/);
  assert.ok(m, 'the motion slot must exist');
  assert.equal(m[1].replace(/\/\/.*$/gm, '').replace(/\s+/g, ''), '{}', 'no carrier registers a turning mark');
});

// ── 10, 14: the loading splash ──────────────────────────────────────────────
test('the loading splash: a still amber dot and a still row of languages (items 10, 14)', () => {
  for (const p of ['fids.html', 'gids.html', 'bids.html']) {
    const html = read(p);
    const dot = html.match(/#fidsLoader \.ocb-dot\{([\s\S]*?)\n    \}/);
    assert.ok(dot, p + ': the dot rule must exist');
    const decl = dot[1].replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(decl, /animation:none;/, p + ': the dot is still');
    assert.doesNotMatch(decl, /fids-loader-pulse/, p + ': the dot no longer pulses');
    assert.match(decl, /background:#eab308;/, p + ': and stays amber');
    // no highlight steps along the labels: nothing marks one of them on
    assert.doesNotMatch(html, /is-on/, p + ': no travelling highlight on the language labels');
    assert.doesNotMatch(html, /ocb-lang[^{]*\{[^}]*--ld-accent/, p + ': no amber on a label');
    // left as it was: the greeting still changes language (a text fade)
    assert.match(html, /var langTimer = setInterval\(function\(\)\{ i=\(i\+1\)%GREET\.length; paint\(\); \}, 2800\);/, p);
  }
});

// ── what is NOT stilled ─────────────────────────────────────────────────────
test('status motion, white light and gentle motion are left alone', () => {
  // a status may still flash: the phone view's Final call
  assert.match(read('css/fids.css'), /\.p-final\s+\{ animation: textPulse 2s ease-in-out infinite;/);
  // the white stars on a clear night still twinkle
  assert.match(winning('.wxcard-wrap .wxc-mon-fx.wxc-fx-clear-night::before', ['animation', 'animation-name']).value, /^wxcFxTwinkle /);
  // the night-storm footage (white lightning) is unchanged
  assert.match(CORE, /'storm-night': \['wx-scene-storm-night-12821882'/);
  // rain over the photo still falls
  assert.match(winning('.wxcard-wrap .wxc-mon-fx.wxc-fx-rain-day::before', ['animation', 'animation-name']).value, /^wxcFxRain2 /);
});
