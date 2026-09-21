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
  // v23844: one element per screen, built in a loop; the attributes follow the class
  const m = SRC.match(/'<video class="wxc-vid wxc-vid-' \+ \(_vi \+ 1\) \+ '"([^']*)'/);
  assert.ok(m, 'the card must build <video class="wxc-vid wxc-vid-N"> elements');
  for (const attr of ['autoplay', 'loop', 'muted', 'playsinline']) {
    assert.ok(m[1].includes(attr), 'the video must carry ' + attr +
      ' — without muted+playsinline autoplay is refused outright');
  }
});

test('the scene is first and the screens sit over it — that source order is the stacking order', () => {
  // v23843: no studio set, no plate. The footage is the ground of the card.
  assert.match(SRC, /'">' \+ _wxVid \+ _wxS1 \+ _wxS2 \+ _wxS3 \+ _wxCredit \+ _wxIntro \+ '<\/div>'/,
    'scene, then the three screens, the credit and the title');
  assert.doesNotMatch(SRC, /_wxSet\b/, 'the studio set is gone from the markup');
  assert.doesNotMatch(SRC, /_wxPlate\b/, 'and so is the navy plate');
  const vid = CSS.match(/\.wxcard-wrap > video\.wxc-vid \{ top: [^}]*z-index: (\d+) !important; \}/);
  assert.ok(vid && Number(vid[1]) > 0, 'the scene loop sits above the wrap');
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
  assert.match(block, /var _wxSlots = \[_wxSceneSlot, _wxS2 \? \(_wxSlot2 \|\| _wxSceneSlot\) : null, _wxS3 \? \(_wxSlot3 \|\| _wxSceneSlot\) : null\];/,
    'v23844: one slot per screen — now at the board, the coming hours, the destination day — each falling back to now');
  assert.match(block, /var _wxTakes = _wxSceneTakesFor\(_wxSlots, _wxSceneMonth\);/, 'and the files are drawn together so they differ, in the board\'s season (v23845)');
  assert.match(block, /'<video class="wxc-vid wxc-vid-' \+ \(_vi \+ 1\) \+ '" autoplay loop muted playsinline preload="auto" '/, 'one scene element per screen, numbered');
  // The filenames moved into _WX_SCENE_TAKES when a slot became a list. What
  // still has to hold is the mapping itself: 'clear' keeps the two loops the
  // card has always had, and the other four families each keep their own day
  // and night loop as the first take.
  const takes = SRC.slice(SRC.indexOf('var _WX_SCENE_TAKES = '),
                          SRC.indexOf('};', SRC.indexOf('var _WX_SCENE_TAKES = ')) + 2);
  assert.match(takes, /'clear-day':\s*\['wx-grass-loop'/, "'clear' by day keeps the grass");
  assert.match(takes, /'clear-night':\s*\['wx-fireflies-night'/, "'clear' after dark keeps the fireflies");
  for (const fam of ['cloud', 'rain', 'snow', 'storm']) {
    for (const tod of ['day', 'night']) {
      assert.match(takes, new RegExp(`'${fam}-${tod}':\\s*\\['wx-scene-${fam}-${tod}-\\d+'`),
        `${fam} by ${tod} opens on real footage, named for its slot and source (v23841); the drawn loop is retired`);
    }
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
// v23841: a slot holds several real takes, so the files to check are whatever
// _WX_SCENE_TAKES lists — read from the source, never from a naming pattern.
const TAKES = (() => {
  const at = SRC.indexOf('var _WX_SCENE_TAKES = {');
  assert.ok(at >= 0, 'fids-core.js must define _WX_SCENE_TAKES');
  return new Function(SRC.slice(at, SRC.indexOf('};', at) + 2) + '\nreturn _WX_SCENE_TAKES;')();
})();
const LOOPS = [...new Set(Object.values(TAKES).flat().map(e => typeof e === 'object' ? e.f : e))].map(f => f + '.mp4');

test('every family has a day loop and a night loop on disk, as real MP4s', () => {
  assert.deepEqual(FAMILIES, ['cloud', 'rain', 'snow', 'storm'], 'the families the mapper can name');
  for (const f of FAMILIES) for (const tod of ['day', 'night']) {
    assert.ok((TAKES[`${f}-${tod}`] || []).length >= 1, `${f}-${tod} must list at least one take`);
  }
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

test('there is no set and no park: the footage is the picture for the whole visit', () => {
  assert.doesNotMatch(SRC, /wx-studio-set\.mp4/, 'the set loop is not referenced');
  assert.ok(!fs.existsSync(path.join(VIDEO, 'wx-studio-set.mp4')), 'and not in the tree (its generator stays under scripts/wx-scenes)');
  assert.doesNotMatch(SRC, /function _wxParkSceneAfterSet/, 'nothing parks the scene behind the screens any more');
  assert.doesNotMatch(SRC, /_wxParkSceneAfterSet\(/);
  const hold = fn('_wxHoldSceneForIntro');
  assert.match(hold, /vid\.pause\(\)/, 'the scene is still held while the film plays');
  assert.match(hold, /3800 \* _wxSpeed\(\)/, 'and released at 3.8s, under the film');
  assert.doesNotMatch(hold, /wxc-set/);
});

test('the scene fills the panel, and screen one\'s panel sits centred over it', () => {
  const rules = [...CSS.matchAll(/\.wxcard-wrap > video\.wxc-vid \{[^}]*\}/g)].map(m => m[0]);
  const live = rules[rules.length - 1];
  assert.match(live, /inset: 0 !important/, 'the scene is the whole card');
  assert.match(live, /width: 100% !important; height: 100% !important; object-fit: cover !important/, 'covering it, whatever the panel aspect');
  const mon = CSS.match(/\.wxc-monitor \{ position: absolute !important; overflow: hidden !important; left: ([\d.]+)% !important; top: ([\d.]+)% !important; width: ([\d.]+)% !important; height: ([\d.]+)% !important;/);
  assert.ok(mon, 'screen one\'s panel keeps its own box');
  const cx = +mon[1] + +mon[3] / 2, cy = +mon[2] + +mon[4] / 2;
  assert.ok(Math.abs(cx - 50) < 0.6 && Math.abs(cy - 50) < 0.6, `it sits centred over the footage (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
});

test('the manifest knows about all of it', () => {
  const man = fs.readFileSync(path.join(ROOT, 'fids-current/assets/asset-manifest.json'), 'utf8');
  for (const f of LOOPS.concat(['wx-title-globe-bg.mp4'])) {
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


// ── v23843: the footage is the whole picture; the screens are translucent ─

test('the hours and the days are translucent over the footage, dark enough for white type', () => {
  const rules = [...CSS.matchAll(/\.wxcard-wrap > \.wxc-screen \{[^}]*\}/g)].map(m => m[0]);
  const live = rules[rules.length - 1];
  const alphas = [...live.matchAll(/rgba\(\d+,\d+,\d+,(\.\d+|\d\.\d+)\)/g)].map(m => Number(m[1]));
  assert.ok(alphas.length >= 2, 'the live screen background is a translucent gradient');
  for (const a of alphas) assert.ok(a >= 0.45 && a <= 0.8, `stop alpha ${a}: the footage must show through, and the type must still read`);
  assert.match(CSS, /\.wxcard-wrap > \.wxc-s1 \{ background: transparent !important; \}/, 'screen one shows the footage plain, its plates carry their own ground');
  assert.match(CSS, /\.wxcard-wrap > \.wxc-plate, [^{]*\.wxcard-wrap > video\.wxc-set \{ display: none !important; \}/, 'the plate and the set are retired in the stylesheet as well');
});


// ── v23844: a scene for each screen ──────────────────────────────────────

test('the second and third scenes fade in on exactly the beats their screens arrive', () => {
  const kf = n => { const m = CSS.match(new RegExp('@keyframes ' + n + ' \\{([\\s\\S]*?)\\n\\}')); assert.ok(m, n); return m[1]; };
  const rise = k => k.match(/0%, ([\d.]+)%\s*\{ opacity: 0;/)[1], up = k => k.match(/([\d.]+)%, 100%\s*\{ opacity: 1; \}/)[1];
  const s2 = kf('wxcScreen2'), s3 = kf('wxcScreen3');
  const s2in = s2.match(/0%, ([\d.]+)%\s*\{ opacity: 0;/)[1], s2at = s2.match(/\n\s*([\d.]+)%\s*\{ transform: none; \}/)[1];
  const s3in = s3.match(/0%, ([\d.]+)%\s*\{ opacity: 0;/)[1], s3at = s3.match(/\n\s*([\d.]+)%\s*\{ transform: none; \}/)[1];
  assert.equal(rise(kf('wxcScene2')), s2in, 'scene two starts fading as screen two starts in');
  assert.equal(up(kf('wxcScene2')), s2at, 'and is full as screen two lands');
  assert.equal(rise(kf('wxcScene3')), s3in);
  assert.equal(up(kf('wxcScene3')), s3at);
  for (const n of ['2', '3']) {
    assert.match(CSS, new RegExp('\\.wxcard-wrap\\.wxc-entering > video\\.wxc-vid\\.wxc-vid-' + n + ' \\{ animation: wxcScene' + n + ' calc\\(36\\.00s \\* var\\(--wxc-t, 1\\)\\) linear both !important; animation-delay: calc\\(\\(0s - var\\(--wxc-el, 0s\\)\\) \\* var\\(--wxc-t, 1\\)\\) !important; \\}'),
      'scene ' + n + ' runs on the same resumable 36s clock as the screens');
  }
  assert.ok(!/video\.wxc-vid\.wxc-vid-[23] \{[^}]*opacity: [\d.]+ !important/.test(CSS), 'no pinned opacity on the scenes');
});

test('the hold pauses every scene under the film and releases them together', () => {
  const hold = fn('_wxHoldSceneForIntro');
  assert.match(hold, /querySelectorAll\(':scope > video\.wxc-vid'\)/, 'all of them');
  assert.match(hold, /vids\[vp\]\.pause\(\)/); assert.match(hold, /vids\[vq\]\.play\(\)/);
});
