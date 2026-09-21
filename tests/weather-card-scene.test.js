'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE SCENE BEHIND THE WEATHER — v23836.
//
// The card opens on a news set whose monitor has its screen cut out, and the
// scene loop plays in that cut-out. Since v23726 the loop has followed the
// hour at the board's own airport (grass by day, fireflies after dark); since
// v23836 it follows the WEATHER there as well: rain when it rains, snow when
// it snows, each family with a day loop and a night loop. These tests pin the
// pieces of that: the loop itself, which loop is chosen and from what, the set
// it plays behind, and the files all of it depends on.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');
const CODE = SRC.replace(/\/\/.*$/gm, '');            // JS without line comments
const VIDEO = path.join(ROOT, 'fids-current/logos/Backgrounds/video');

/** A top-level function's source, by name, braces balanced. */
function fn(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must define ${name}`);
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(at, k + 1); }
  }
  assert.fail(`unterminated ${name}`);
}

// ── The video layer ──────────────────────────────────────────────────────

test('the card builds a muted, looping, inline video', () => {
  const m = SRC.match(/var _wxVid = '<video class="wxc-vid"([^']*)'/);
  assert.ok(m, 'the card must build a <video class="wxc-vid">');
  for (const attr of ['autoplay', 'loop', 'muted', 'playsinline']) {
    assert.ok(m[1].includes(attr), 'the video must carry ' + attr +
      ' — without muted+playsinline autoplay is refused outright');
  }
});

test('the set loop is first, the scene over it, the screens over both', () => {
  assert.match(SRC, /_wxSet \+ _wxVid \+ _wxS1 \+ _wxS2 \+ _wxS3 \+ _wxCredit \+ _wxIntro/,
    'set, scene, then the screens — that source order is the stacking order');
  const set = CSS.match(/\.wxcard-wrap > video\.wxc-set \{[^}]*\}/);
  assert.ok(set, 'the set loop has its own rule');
  assert.match(set[0], /z-index: 0 !important/, 'the set is the floor');
  assert.match(set[0], /object-fit: fill !important/,
    'stretched, not covered — so the monitor stays at the same percentages at every panel aspect');
  const vid = CSS.match(/\.wxcard-wrap > video\.wxc-vid \{ top: [^}]*z-index: (\d+) !important; \}/);
  assert.ok(vid && Number(vid[1]) > 0, 'the scene loop sits above the set');
});

test('the video layer beats the rule that would float it over the content', () => {
  // `.wxcard-wrap > *:not(.wxc-globe)` sets position:relative; z-index:1 on
  // every child. A weaker selector here puts the video ON TOP of the forecast.
  const rules = [...CSS.matchAll(/\.wxcard-wrap > video\.wxc-vid \{[^}]*\}/g)].map(m => m[0]);
  assert.ok(rules.length >= 2, 'the v23724 rule and the v23836 placement must both exist');
  const first = rules[0], live = rules[rules.length - 1];
  assert.match(first, /position:\s*absolute\s*!important/);
  assert.match(first, /object-fit:\s*cover\s*!important/);
  // the LAST rule is the one that wins (longest chain, latest); it lifts the
  // loop above the set and must keep it under every screen
  const z = Number((live.match(/z-index:\s*(\d+)\s*!important/) || [])[1]);
  const screen = Number((CSS.match(/\.wxcard-wrap > \.wxc-screen \{[^}]*z-index: (\d+)/) || [])[1]);
  assert.ok(z > 0, 'the scene loop sits above the set (z 0)');
  assert.ok(z < screen, `the scene loop (z ${z}) must stay under the screens (z ${screen}) — or it floats over the hours and the days`);

  const count = sel => (sel.match(/:not\(#_\)/g) || []).length;
  const ourLine = CSS.split('\n').find(l => l.includes('.wxcard-wrap > video.wxc-vid'));
  const genericLine = CSS.split('\n').find(l => l.includes('.wxcard-wrap > *:not(.wxc-globe)'));
  assert.ok(ourLine && genericLine, 'both rules must be present to compare');
  assert.ok(count(ourLine) > count(genericLine),
    `the video rule (${count(ourLine)} :not(#_)) must out-specify ` +
    `.wxcard-wrap > *:not(.wxc-globe) (${count(genericLine)}), or the video ` +
    'is given position:relative/z-index:1 and covers the forecast');
});

test('something opaque is always underneath, and it is never a photograph', () => {
  // The ground is what shows if the video is blocked or fails to load, so the
  // wrap must never be left bare. The set is a PNG in its own layer inside
  // screen 1 — it is not the wrap's ground, and nothing composes a photograph
  // back into that ground without someone deciding to.
  assert.ok(!/_wxSkyUrl\s*=/.test(CODE), 'the sky-plate variable must stay gone');
  const at = SRC.indexOf('var _wxBg = _wxNightScene');
  assert.ok(at >= 0, 'the background must branch on the scene');
  const bg = SRC.slice(at, SRC.indexOf(';', at));
  const night = bg.slice(0, bg.indexOf(': '));
  const day = bg.slice(bg.indexOf(': '));
  for (const [name, branch] of [['night', night], ['day', day]]) {
    assert.match(branch, /linear-gradient\([^)]*rgba\([^)]*\)[^)]*\)/,
      `the ${name} ground must be a real gradient, not nothing`);
    assert.match(branch, /#[0-9a-f]{6}/i,
      `the ${name} ground must end in a solid colour, so a failed gradient ` +
      'still leaves the card opaque rather than showing the carousel behind it');
    assert.ok(!/\.jpg|\.png|\.webp/i.test(branch),
      `no photograph may be composed into the ${name} ground`);
  }
  assert.notEqual(night.trim(), day.trim(), 'night and day are not the same ground');
});

// ── Which scene ──────────────────────────────────────────────────────────

const kindOf = new Function(fn('_wxSceneKindOf') + '\nreturn _wxSceneKindOf;')();

test('an icon name folds to one of five scene families', () => {
  const expect = {
    'clear-day': 'clear', 'clear-night': 'clear',
    'partly-cloudy-day': 'cloud', 'partly-cloudy-night': 'cloud', 'cloudy': 'cloud',
    'overcast-day': 'cloud', 'fog': 'cloud',
    'drizzle': 'rain', 'rain': 'rain', 'extreme-rain': 'rain', 'sleet': 'rain', 'hail': 'rain',
    'snow': 'snow', 'extreme-snow': 'snow',
    'thunderstorms-day-rain': 'storm', 'thunderstorms-rain': 'storm',
  };
  for (const [icon, kind] of Object.entries(expect)) {
    assert.equal(kindOf(icon), kind, `${icon} → ${kind}`);
  }
});

test('every icon the mappers can return has a family', () => {
  // Every string literal either mapper returns must fold somewhere real —
  // a new icon that fell through to 'clear' would put grass behind a blizzard.
  const names = new Set();
  for (const body of [fn('_wxAnimIcon'), fn('_wmoAnimIcon')]) {
    // literals in code, not in comments
    for (const m of body.replace(/\/\/.*$/gm, '').matchAll(/'([a-z-]+)'/g)) names.add(m[1]);
  }
  assert.ok(names.size >= 14, 'the mappers should name a dozen-plus icons');
  const clearOnly = [...names].filter(n => kindOf(n) === 'clear' && !/^clear-/.test(n));
  assert.deepEqual(clearOnly, [], 'these icons fall through to the clear scene: ' + clearOnly.join(', '));
});

test('WMO codes — what the boards actually receive — map to real icons, with night forms', () => {
  // /wxcurrent returns MET's conditions as WMO codes (0-99). Until v23836 the
  // card's mapper knew only Tomorrow.io's codes and every reading fell to
  // 'clear' — which also meant the scene could never be anything but grass.
  const icon = new Function(fn('_wxAnimIcon') + '\n' + fn('_wmoAnimIcon') + '\nreturn _wxAnimIcon;')();
  assert.equal(icon(0, false), 'clear-day');
  assert.equal(icon(0, true), 'clear-night');
  assert.equal(icon(2, false), 'partly-cloudy-day');
  assert.equal(icon(2, true), 'partly-cloudy-night');
  assert.equal(icon(3, true), 'overcast-day', 'overcast has no night form');
  assert.equal(icon(45, false), 'fog');
  assert.equal(icon(61, false), 'rain');
  assert.equal(icon(65, false), 'extreme-rain');
  assert.equal(icon(73, true), 'snow');
  assert.equal(icon(95, false), 'thunderstorms-day-rain');
  assert.equal(icon(95, true), 'thunderstorms-rain');
  // and the Tomorrow.io codes still answer as they did
  assert.equal(icon(1101, true), 'partly-cloudy-night');
  assert.equal(icon(4200, false), 'rain');
  assert.equal(icon(8000, true), 'thunderstorms-rain');
  // so the scene can follow the sky
  assert.equal(kindOf(icon(61, true)), 'rain');
  assert.equal(kindOf(icon(73, false)), 'snow');
  assert.equal(kindOf(icon(95, false)), 'storm');
  assert.equal(kindOf(icon(3, false)), 'cloud');
});

test('nothing sensible throws, and nonsense is clear', () => {
  assert.equal(kindOf(undefined), 'clear');
  assert.equal(kindOf(null), 'clear');
  assert.equal(kindOf(''), 'clear');
  assert.equal(kindOf(42), 'clear');
});

test('the scene is chosen from the family and the hour', () => {
  const at = SRC.indexOf('var _wxNightScene');
  const block = SRC.slice(at, SRC.indexOf('var _wxHtml = ', at));
  assert.match(block, /_wxSceneKind = _wxSceneKindOf\(_wxAnimIcon\(_wxSceneRead \? _wxSceneRead\.code : cur\.code, _wxNightScene\)\);/,
    'the reading taken at the origin is the one folded to a family, with the origin\'s own night flag');
  assert.match(block, /_wxSceneRead = _wxAtTime\(_wxOrig \|\| dest, 0\)/,
    "the reading is the board's own airport's — the departure side of the set — " +
    'so the screen shows the sky outside the terminal, not the sky at the far end');
  assert.match(block, /var _wxSceneSlot = _wxSceneKind \+ \(_wxNightScene \? '-night' : '-day'\);/,
    'the family and the hour together name one slot');
  assert.match(block, /_wxVidSrc = '\/logos\/Backgrounds\/video\/' \+ _wxSceneTake\(_wxSceneSlot\) \+ '\.mp4'/,
    'and the file for that slot is drawn rather than spelled out — v23840, a slot may hold several clips');
  // The filenames moved into _WX_SCENE_TAKES when a slot became a list. What
  // still has to hold is the mapping itself: 'clear' keeps the two loops the
  // card has always had, and the other four families each keep their own day
  // and night loop as the first take.
  const takes = SRC.slice(SRC.indexOf('var _WX_SCENE_TAKES = '),
                          SRC.indexOf('};', SRC.indexOf('var _WX_SCENE_TAKES = ')) + 2);
  assert.match(takes, /'clear-day':\s*\['wx-grass-loop'/, "'clear' by day keeps the grass");
  assert.match(takes, /'clear-night':\s*\['wx-fireflies-night'/, "'clear' after dark keeps the fireflies");
  for (const fam of ['cloud', 'rain', 'snow', 'storm']) {
    assert.match(takes, new RegExp(`'${fam}-day':\\s*\\['wx-scene-${fam}-day'`),
      `${fam} keeps its own day loop`);
    assert.match(takes, new RegExp(`'${fam}-night':\\s*\\['wx-scene-${fam}-night'`),
      `${fam} keeps its own night loop`);
  }
  assert.match(block, /_wxSceneCls = _wxNightScene \? ' wxc-scene-night' : ' wxc-scene-day'/);
  assert.match(block, /' wxc-wx-' \+ _wxSceneKind/, 'the family rides on the wrap as a class');
});

test('the hour tile\'s night class comes from the same flag as its icon', () => {
  const at = SRC.indexOf('var _wxHours = [];');
  const block = SRC.slice(at, SRC.indexOf('_wxHours.push', at) + 200);
  assert.match(block, /var hNight = h24 < 6 \|\| h24 >= 21;/);
  assert.match(block, /_wxAnimIcon\(h\.code, hNight\)/, 'the icon reads hNight');
  assert.match(block, /night: hNight/, 'and the tile carries the same value');
  assert.match(SRC, /p\.h\.night \? 'wxc-pt-night' : 'wxc-pt-day'/, 'the class is that value, not a second guess');
});

// ── The files ────────────────────────────────────────────────────────────

const MAPPER_ICONS = (() => {
  const names = new Set();
  for (const body of [fn('_wxAnimIcon'), fn('_wmoAnimIcon')]) {
    for (const m of body.replace(/\/\/.*$/gm, '').matchAll(/'([a-z-]+)'/g)) names.add(m[1]);
  }
  return [...names];
})();
// derived from the mapper, so a sixth family cannot ship without its loops
const FAMILIES = [...new Set(MAPPER_ICONS.map(kindOf))].filter(k => k !== 'clear').sort();
const LOOPS = ['wx-grass-loop.mp4', 'wx-fireflies-night.mp4']
  .concat(FAMILIES.flatMap(f => [`wx-scene-${f}-day.mp4`, `wx-scene-${f}-night.mp4`]));

test('every family has a day loop and a night loop on disk, as real MP4s', () => {
  assert.deepEqual(FAMILIES, ['cloud', 'rain', 'snow', 'storm'], 'the families the mapper can name');
  for (const f of LOOPS) {
    const p = path.join(VIDEO, f);
    assert.ok(fs.existsSync(p), `${f} is referenced but missing from the tree`);
    const mb = fs.statSync(p).size / 1024 / 1024;
    assert.ok(mb < 12, `${f} is ${mb.toFixed(1)}MB — the monitor is a fifth of the panel`);
    const head = fs.readFileSync(p, { encoding: 'latin1', start: 0, end: 16 });
    assert.ok(head.includes('ftyp'), `${f} must be an ISO media file`);
    assert.ok(!head.includes('qt  '), `${f} must be a real MP4, not a QuickTime container with an .mp4 name`);
  }
});

test('the set is a loop with the screen filled, held for the film and parked after', () => {
  const m = SRC.match(/var _wxSet = '<video class="wxc-set"([^']*)'/);
  assert.ok(m, 'the card must build a <video class="wxc-set">');
  for (const attr of ['autoplay', 'loop', 'muted', 'playsinline']) assert.ok(m[1].includes(attr), 'the set must carry ' + attr);
  const p = path.join(VIDEO, 'wx-studio-set.mp4');
  assert.ok(fs.existsSync(p), 'the set loop must be committed');
  const head = fs.readFileSync(p, { encoding: 'latin1', start: 0, end: 16 });
  assert.ok(head.includes('ftyp') && !head.includes('qt  '), 'a real MP4');
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/logos/Backgrounds/wx-studio-set.png')), 'the still it replaced is gone');
  const hold = fn('_wxHoldSceneForIntro');
  assert.match(hold, /video\.wxc-set/, 'held while the film plays, like the scene');
  const park = fn('_wxParkSceneAfterSet');
  assert.match(park, /video\.wxc-vid, :scope > video\.wxc-set/, 'and both are paused once the hours cover them (the clock is tested in the entrance suite)');
  assert.match(fn('_wxArmEntrance'), /_wxParkSceneAfterSet\(wrap, 0\)/);
  assert.match(fn('_wxCarryEntrance'), /_wxParkSceneAfterSet\(wrap, el\)/);
});

test('the scene loop covers the monitor\'s screen with a hair to spare', () => {
  // Both are percentages of the panel. The scene must reach past the screen's
  // edge on every side (or navy shows in the corner) but not past the bezel.
  const vid = CSS.match(/\.wxcard-wrap > video\.wxc-vid \{ top: ([\d.]+)% !important; left: ([\d.]+)% !important; right: ([\d.]+)% !important; bottom: ([\d.]+)% !important;/);
  const mon = CSS.match(/\.wxc-monitor \{ position: absolute !important; overflow: hidden !important; left: ([\d.]+)% !important; top: ([\d.]+)% !important; width: ([\d.]+)% !important; height: ([\d.]+)% !important;/);
  assert.ok(vid && mon, 'both rules must exist (the monitor clips its own plates as they sweep in)');
  const v = { top: +vid[1], left: +vid[2], right: +vid[3], bottom: +vid[4] };
  const s = { left: +mon[1], top: +mon[2], right: 100 - +mon[1] - +mon[3], bottom: 100 - +mon[2] - +mon[4] };
  for (const side of ['top', 'left', 'right', 'bottom']) {
    assert.ok(v[side] <= s[side], `${side}: the scene (${v[side]}%) must reach past the screen (${s[side]}%)`);
    assert.ok(s[side] - v[side] < 1.0, `${side}: but not by more than 1% — the bezel is right there`);
  }
});

test('the manifest knows about all of it', () => {
  const man = fs.readFileSync(path.join(ROOT, 'fids-current/assets/asset-manifest.json'), 'utf8');
  for (const f of LOOPS.concat(['wx-studio-set.mp4', 'wx-title-globe-bg.mp4'])) {
    assert.ok(man.includes(f), `${f} — run \`npm run assets:build\`; CI fails on a stale manifest`);
  }
});

// ── Housekeeping ─────────────────────────────────────────────────────────

test('MET is capitalised in the credit', () => {
  const m = SRC.match(/class="wxc-credit">([^<]*)</);
  assert.ok(m, 'the credit line must exist');
  assert.match(m[1], /\bMET Norway\b/, 'must credit "MET Norway", not "Met Norway"');
});

test('no malformed percentages reached the stylesheet', () => {
  const bad = CSS.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /%%|NaN|undefined/.test(l) && /wxc-/.test(l));
  assert.deepEqual(bad, [], 'malformed value in a weather-card rule');
});
