'use strict';

// v23724 — THE ARRIVAL WEATHER CARD'S MOVING BACKGROUND AND TEMPERATURE SCALE.
//
// Three things here are easy to get wrong in ways that look fine on a desk and
// fail on a lit board, so each has a guard:
//
//   · The night/day class on an hour tile must come from the SAME value that
//     picked the moon-or-sun icon. Any second derivation (a 19:00 window, the
//     board's own clock rather than the destination's) drifts by season and by
//     airport, and the tile ends up day-coloured under a moon.
//
//   · The five-day colours are RELATIVE to the week on screen. That is the
//     whole point — fixed thresholds render five identical tiles whenever the
//     weather is settled — but it means the banding maths has to survive a week
//     where every day is the same temperature without dividing by zero.
//
//   · Every tint/ink pairing has to clear 4.5:1 over BOTH the grass and the sky
//     parts of the clip. The first attempt used darker tints and measured
//     3.16:1 on the coral tiles; lighter tints have MORE contrast with dark ink,
//     which is the counter-intuitive part worth pinning down.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');

// ── The video layer ──────────────────────────────────────────────────────

test('the card builds a muted, looping, inline video', () => {
  const m = SRC.match(/var _wxVid = '<video class="wxc-vid"([^']*)'/);
  assert.ok(m, 'the card must build a <video class="wxc-vid">');
  for (const attr of ['autoplay', 'loop', 'muted', 'playsinline']) {
    assert.ok(m[1].includes(attr), 'the video must carry ' + attr +
      ' — without muted+playsinline autoplay is refused outright');
  }
});

test('the video is the first child, behind the content', () => {
  assert.match(SRC, /_wxVid \+ _wxMainHtml/,
    'the video must precede the card content in source order');
});

test('the video layer beats the rule that would float it over the content', () => {
  // `.wxcard-wrap > *:not(.wxc-globe)` sets position:relative; z-index:1 on
  // every child. A weaker selector here puts the video ON TOP of the forecast.
  const rule = CSS.match(/\.wxcard-wrap > video\.wxc-vid \{[^}]*\}/);
  assert.ok(rule, 'display-overrides.css must style video.wxc-vid');
  assert.match(rule[0], /position:\s*absolute\s*!important/);
  assert.match(rule[0], /z-index:\s*0\s*!important/);
  assert.match(rule[0], /object-fit:\s*cover\s*!important/);

  const count = sel => (sel.match(/:not\(#_\)/g) || []).length;
  const ourLine = CSS.split('\n').find(l => l.includes('.wxcard-wrap > video.wxc-vid'));
  const genericLine = CSS.split('\n').find(l => l.includes('.wxcard-wrap > *:not(.wxc-globe)'));
  assert.ok(ourLine && genericLine, 'both rules must be present to compare');
  assert.ok(count(ourLine) > count(genericLine),
    `the video rule (${count(ourLine)} :not(#_)) must out-specify ` +
    `.wxcard-wrap > *:not(.wxc-globe) (${count(genericLine)}), or the video ` +
    'is given position:relative/z-index:1 and covers the forecast');
});

test('the still stays underneath as the fallback', () => {
  assert.match(SRC, /var _wxSkyUrl = '\/logos\/Backgrounds\/[^']+'/,
    'the CSS background image must still be set — it is what shows if the ' +
    'video is blocked or fails to load');
  assert.match(SRC, /url\('" \+ _wxSkyUrl \+ "'\)/,
    'and must still be composed into the wrap background');
});

// ── Night / day on the hours strip ───────────────────────────────────────

test('the hour tile class comes from the same value as its icon', () => {
  const at = SRC.indexOf('var hNight =');
  assert.ok(at >= 0, 'the hour builder must still compute hNight');
  const block = SRC.slice(at, at + 1400);
  assert.match(block, /_wxAnimIcon\(h\.code, hNight\)/,
    'hNight must still choose the icon');
  assert.match(block, /var hPhase = !hNight \? 'day'/,
    'the SAME hNight must decide day-versus-not for the tile class too, so ' +
    'a tile can never be day-coloured under a moon');
  assert.match(block, /wxc-hr-' \+ hPhase/, 'the class must come from hPhase');
  // Dawn and dusk refine night; they must never be reachable when it is day.
  assert.match(block, /'dawn'[\s\S]{0,120}'dusk'[\s\S]{0,60}'night'/,
    'dawn and dusk must sit inside the night branch, after the !hNight test');
});

test('both night and day tiles are styled, with their own ink', () => {
  for (const cls of ['wxc-hr-night', 'wxc-hr-day']) {
    assert.ok(CSS.includes('.wxc-hour.' + cls + ' {'), cls + ' must be styled');
    assert.ok(CSS.includes('.wxc-hour.' + cls + ' .wxc-ht'),
      cls + ' must set its own text colour — a dark tile with dark ink is unreadable');
  }
});

// ── The relative temperature banding ─────────────────────────────────────

function bandFn() {
  const at = SRC.indexOf('var _wxBand = function');
  assert.ok(at >= 0, 'fids-core.js must define _wxBand');
  const end = SRC.indexOf('};', at) + 2;
  return new Function(SRC.slice(at, end) + '\nreturn _wxBand;')();
}

test('the coldest day takes the first step and the warmest the last', () => {
  const band = bandFn();
  const week = [21, 23, 24, 27, 27];
  assert.equal(band(21, week), 0, 'coolest day is step 0');
  assert.equal(band(27, week), 4, 'warmest day is step 4');
  assert.ok(band(23, week) > 0 && band(23, week) < 4, 'the middle spreads between');
});

test('the same temperature always takes the same step within one week', () => {
  const band = bandFn();
  const week = [21, 23, 24, 27, 27];
  assert.equal(band(27, week), band(27, week));
  assert.equal(band(27, week), 4, 'both 27s are the warmest day, so both are coral');
});

test('a flat week sits mid-scale instead of dividing by zero', () => {
  const band = bandFn();
  assert.equal(band(18, [18, 18, 18, 18, 18]), 2,
    'five identical days must not blow up or all land on step 0');
  assert.equal(band(18, [18, 18.3]), 2, 'a span under half a degree is still flat');
});

test('bad input falls to the middle step rather than throwing', () => {
  const band = bandFn();
  assert.equal(band(NaN, [1, 2, 3]), 2);
  assert.equal(band(10, []), 2);
  assert.equal(band(undefined, [1, 2]), 2);
});

test('the step never escapes 0..4 however odd the week', () => {
  const band = bandFn();
  for (const week of [[-40, 45], [0, 0.6], [-5, -5, 30]]) {
    for (const v of [-100, -40, 0, 22, 45, 100]) {
      const b = band(v, week);
      assert.ok(Number.isInteger(b) && b >= 0 && b <= 4, `${v} in ${week} gave ${b}`);
    }
  }
});

test('highs and lows are banded against their own spreads', () => {
  // If both used one shared range the low would almost always be step 0 and
  // every tile's two numbers would read the same colour as each other.
  assert.match(SRC, /_wxBand\(daily\.temperature_2m_max\[i\], _wxHis\)/);
  assert.match(SRC, /_wxBand\(daily\.temperature_2m_min\[i\], _wxLos\)/);
  assert.ok(SRC.includes("'<div class=\"wxc-day wxc-t' + _tbHi"),
    'the tile carries the HIGH step');
  assert.ok(SRC.includes("'<div class=\"wxc-lo wxc-tl' + _tbLo"),
    'the low carries its OWN step');
});

// ── Contrast, measured the way the board composites ──────────────────────

function parseHsl(s) {
  const m = s.match(/hsla?\((\d+),\s*([\d.]+)%,\s*([\d.]+)%(?:,\s*([\d.]+))?\)/);
  return m ? { h: +m[1], s: +m[2], l: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}
const lum = c => {
  const f = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
};
const cr = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const over = (fg, al, bg) => fg.map((x, i) => x * al + bg[i] * (1 - al));

// Sampled from the clip: the grass band and the sky band.
const GRASS = [96, 153, 92], SKY = [150, 205, 215];

function bandColours() {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const tile = CSS.match(new RegExp('\\.wxc-day\\.wxc-t' + i + ' \\{ background: (hsla\\([^)]*\\))'));
    const hi = CSS.match(new RegExp('\\.wxc-day\\.wxc-t' + i + ' \\.wxc-hi \\{ color: (hsl\\([^)]*\\))'));
    const lo = CSS.match(new RegExp('\\.wxc-lo\\.wxc-tl' + i + ' \\{ color: (hsl\\([^)]*\\))'));
    // (the selectors carry a .wxc-scene-day scope; these fragments still match)
    assert.ok(tile && hi && lo, 'band ' + i + ' must define tile, hi ink and lo ink');
    out.push({ i, tile: parseHsl(tile[1]), hi: parseHsl(hi[1]), lo: parseHsl(lo[1]) });
  }
  return out;
}

test('all five temperature bands exist and are distinct hues', () => {
  const b = bandColours();
  const hues = b.map(x => x.tile.h);
  assert.equal(new Set(hues).size, 5, 'five bands must be five different hues');
  // Adjacent steps must be far enough apart to tell apart on a board.
  for (let i = 1; i < hues.length; i++) {
    const gap = Math.abs(hues[i] - hues[i - 1]);
    assert.ok(gap >= 30, `steps ${i - 1}->${i} differ by only ${gap} degrees of hue`);
  }
});

test('every ink reads on every tile, over both grass and sky', () => {
  // The low's band is independent of the tile's, so ANY ink can land on ANY
  // tile — all 25 pairings have to hold, not just the matching ones.
  const b = bandColours();
  const fails = [];
  for (const tile of b) {
    for (const ground of [GRASS, SKY]) {
      const bg = over(hslToRgb(tile.tile.h, tile.tile.s, tile.tile.l), tile.tile.a, ground);
      for (const ink of b) {
        for (const which of ['hi', 'lo']) {
          const c = cr(hslToRgb(ink[which].h, ink[which].s, ink[which].l), bg);
          if (c < 4.5) fails.push(`t${tile.i} + ${which}${ink.i} = ${c.toFixed(2)}`);
        }
      }
    }
  }
  assert.deepEqual(fails, [], 'every tint/ink pairing must clear 4.5:1');
});

test('the panel sits on the clip hue, not the old cold navy', () => {
  const m = CSS.match(/\.wxc-day, [^{]*\.wxc-hour \{\s*background: (hsla\([^)]*\))/);
  assert.ok(m, 'the panel fill must be declared');
  const p = parseHsl(m[1]);
  // The clip averages hue 181; the old panel was 218 and that 37-degree gap is
  // what read as a colour clash. Anything back up near 218 is a regression.
  assert.ok(p.h >= 185 && p.h <= 205,
    `panel hue ${p.h} is outside the clip's range — 218 was the old cold navy`);
  assert.ok(p.a <= 0.7, `panel alpha ${p.a} is too opaque for the video to read through`);
});

// ── The credit ───────────────────────────────────────────────────────────

test('a strips-only refresh puts the strips BEFORE the credit', () => {
  const at = SRC.indexOf(':scope > .wxc-strip');
  assert.ok(at >= 0, 'the strips-only refresh path must still exist');
  const block = SRC.slice(at, at + 700);
  assert.match(block, /wxc-credit/,
    'the refresh must locate the credit and insert ahead of it');
  assert.match(block, /insertAdjacentHTML\('beforebegin', _wxStripsHtml\)/,
    "'beforeend' appended the strips AFTER the credit and walked the MET " +
    'attribution into the middle of the card');
});

test('MET is capitalised in the credit', () => {
  // MET is Meteorologisk institutt. Title-casing it to "Met" misstates the
  // attribution their licence asks for.
  const m = SRC.match(/class="wxc-credit">([^<]*)</);
  assert.ok(m, 'the credit line must exist');
  assert.match(m[1], /\bMET Norway\b/, 'must credit "MET Norway", not "Met Norway"');
});

// ── The asset ────────────────────────────────────────────────────────────

test('the clip is present, an mp4, and not oversized', () => {
  const p = path.join(ROOT, 'fids-current/logos/Backgrounds/video/wx-grass-loop.mp4');
  assert.ok(fs.existsSync(p), 'the loop must be committed');
  const mb = fs.statSync(p).size / 1024 / 1024;
  assert.ok(mb < 12, `the loop is ${mb.toFixed(1)}MB — everything else on the board is under 1MB`);
  const head = fs.readFileSync(p, { encoding: 'latin1', start: 0, end: 16 });
  assert.ok(head.includes('ftyp'), 'must be an ISO media file');
  assert.ok(!head.includes('qt  '),
    'must be a real MP4, not a QuickTime container with an .mp4 name — ' +
    'canPlayType reports no support for quicktime and it plays only by sniffing');
});

test('the manifest knows about it', () => {
  const man = fs.readFileSync(path.join(ROOT, 'fids-current/assets/asset-manifest.json'), 'utf8');
  assert.ok(man.includes('wx-grass-loop.mp4'),
    'run `npm run assets:build` — CI fails on a stale manifest');
});
