'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23787 — THE OPENING TITLE IS DRAWN BY THE BOARD.
//
// The card used to open on a supplied clip. Three separate generated takes
// all carried the same faults: a misspelling baked into the centre of the
// frame, a watermark that survived every request to drop it, 1280×720 on a
// 1080p board, and ten seconds for a six-second slot. None of that is
// fixable in a video file, and all of it is trivially fixable in markup.
//
// So the title is nine lines of text now. That buys four things the clip
// could not give: correct spelling, no watermark, crisp type at whatever
// size the panel is, and an order that can put French first where the law
// and the house rules require it.
//
// The panel it plays in is tall and narrow — measured at 408 × 792 — which
// is why the nine phrases are one centred COLUMN. A 3 × 3 grid, which is
// what the generated footage used, gives a twenty-one character phrase a
// third of 408px and is unreadable.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

const BLOCK_AT = CSS.lastIndexOf('@keyframes wxcIntroPanel');
const BLOCK = BLOCK_AT >= 0 ? CSS.slice(CSS.lastIndexOf('/*', BLOCK_AT)) : '';

/** The table of phrases, read out of the source. */
function lines() {
  const at = JS.indexOf('var _WX_INTRO_LINES = [');
  assert.ok(at >= 0, 'the phrase table must exist');
  const end = JS.indexOf('];', at);
  const body = JS.slice(at, end + 2);
  return [...body.matchAll(/\{\s*l:\s*'([a-z]{2})',\s*d:\s*'(ltr|rtl)',\s*t:\s*'([^']*)'\s*\}/g)]
    .map((m) => ({ l: m[1], d: m[2], t: m[3].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) }));
}

test('the clip is the backdrop; the words are drawn by the board', () => {
  // This is the split that makes both halves work. The clip supplies motion
  // the board cannot cheaply draw. The words are markup, so they can be spelled
  // correctly, ordered French-first, and stay crisp at any panel size — none
  // of which is fixable once type is baked into footage.
  const at = JS.indexOf('var _wxIntro = _wxWantsIntro()');
  assert.ok(at >= 0, 'the intro is still gated on the entrance arming');
  const stmt = JS.slice(at, JS.indexOf(';', at) + 1);
  assert.match(stmt, /_wxIntroHtml\(_wxFrF\)/,
    'it is built here, and it is handed the French-first flag');

  const body = JS.slice(JS.indexOf('function _wxIntroHtml('));
  const ret = body.slice(body.indexOf("return '<div class=\"wxc-intro'"), body.indexOf('\n}'));
  assert.match(ret, /_wxIntroBackdropHtml\(\)/,
    'the backdrop is one layer, chosen in one place');
  assert.match(ret, /class="wxc-intro-scrim"/,
    'and it is knocked back by a scrim — footage carries its own lettering, ' +
    'which must read as texture and not as a second headline');
  const bd = JS.slice(JS.indexOf('function _wxIntroBackdropHtml()'));
  const bdBody = bd.slice(0, bd.indexOf('\n}'));
  assert.match(bdBody, /class="wxc-intro-bg wxc-sky"/, 'sky mode draws the sky');
  assert.match(bdBody, /src="' \+ _WX_INTRO_CLIP/, 'clip mode plays the clip');
  // every phrase is still TEXT, not pixels
  for (const r of lines()) {
    assert.ok(ret.indexOf('wxc-intro-line') >= 0, 'the phrases are elements');
    void r;
  }
  assert.doesNotMatch(ret, /wxc-intro-line[^>]*<video/, 'no phrase is a clip');
});

test('the backdrop sits under the scrim, and the type over both', () => {
  const z = {};
  for (const m of BLOCK.matchAll(/> \.wxc-intro > (?:video\.)?\.?([\w-]+) \{([^}]*)\}/g)) {
    const hit = m[2].match(/z-index: (\d+)/);
    if (hit) z[m[1]] = Number(hit[1]);
  }
  assert.ok(z["wxc-intro-bg"] < z["wxc-intro-scrim"],
    'the clip is behind the scrim, or the scrim does nothing');
  assert.ok(z["wxc-intro-scrim"] < z["wxc-intro-panel"],
    'the plate the type sits on is above the scrim');
  assert.ok(z["wxc-intro-panel"] < z["wxc-intro-stack"],
    'and the type is above its plate');
  assert.ok(z["wxc-intro-stack"] < z["wxc-intro-sheen"],
    'the light crosses in front of everything');
  const bg = BLOCK.slice(BLOCK.indexOf('> video.wxc-intro-bg {'));
  assert.match(bg.slice(0, bg.indexOf('}')), /object-fit: cover/,
    'a 16:9 clip in a 408 x 792 panel is cropped, never letterboxed — black ' +
    'bands top and bottom read as a broken screen');
});

test('only one clip decodes at a time', () => {
  // The backdrop and the scene are both 1920x1080. Two simultaneous decodes
  // on top of the animating layers shows up as dropped frames, not an error.
  assert.match(JS, /function _wxHoldSceneForIntro\(wrap\)/,
    'the scene is held while the backdrop plays');
  const h = JS.slice(JS.indexOf('function _wxHoldSceneForIntro(wrap)'));
  const b = h.slice(0, h.indexOf('\n}'));
  assert.match(b, /vid\.pause\(\)/, 'the scene pauses');
  assert.match(b, /2600 \* _wxSpeed\(\)/,
    'and resumes as the title clears, on the same speed dial as everything else');
  const arm = JS.slice(JS.indexOf('function _wxArmEntrance(wrap)'));
  assert.match(arm.slice(0, arm.indexOf('\n}')), /_wxHoldSceneForIntro\(wrap\);/,
    'and it is actually called when the entrance arms');
});

test('nine languages, spelled correctly, each tagged with its own script', () => {
  const rows = lines();
  assert.equal(rows.length, 9, 'nine phrases');
  const by = Object.fromEntries(rows.map((r) => [r.l, r]));
  assert.equal(by.en.t, 'Weather Report');
  assert.equal(by.fr.t, 'Bulletin météo');
  assert.equal(by.es.t, 'Informe del clima');
  assert.equal(by.de.t, 'Wetterbericht');
  // The generated footage rendered this with three Ls, in the centre of the
  // frame, in all three takes. It is the single reason to check spelling here.
  assert.equal(by.it.t, 'Bollettino meteo');
  assert.doesNotMatch(by.it.t, /lll/i, 'Bollettino has two Ls');
  assert.equal(by.pt.t, 'Boletim meteorológico');
  assert.equal(by.ja.t, '天気予報');
  assert.equal(by.zh.t, '天气预报');
  assert.equal(by.ar.t, 'نشرة الطقس');
  // Japanese and Chinese are different strings — a generator that copies one
  // into both slots is a failure a reader of either language sees instantly.
  assert.notEqual(by.ja.t, by.zh.t, 'ja and zh are not the same phrase');
  assert.equal(by.ar.d, 'rtl', 'Arabic runs right to left');
  for (const r of rows) {
    if (r.l !== 'ar') assert.equal(r.d, 'ltr', `${r.l} runs left to right`);
  }
});

test('every line carries lang, and the right-to-left one carries dir', () => {
  const at = JS.indexOf('function _wxIntroHtml(');
  const body = JS.slice(at, JS.indexOf('\n}', at));
  assert.match(body, /lang="' \+ r\.l \+ '"/,
    'lang is what picks the font and the shaping for each script');
  assert.match(body, /r\.d === 'rtl' \? ' dir="rtl"' : ''/,
    'and dir is what puts the Arabic the right way round');
});

test('French leads where French must lead', () => {
  const at = JS.indexOf('function _wxIntroHtml(');
  const body = JS.slice(at, JS.indexOf('\n}', at));
  assert.match(body, /if \(frFirst\)/, 'the flag is honoured');
  assert.match(body, /rows\.unshift\(rows\.splice\(i, 1\)\[0\]\)/,
    'French MOVES to the front — it is not duplicated there, which would ' +
    'print the same phrase twice');
  // …and the stack draws the first line as the lead, so "first" is visible
  assert.match(BLOCK, /\.wxc-intro-line:first-child \{/,
    'the leading language is the one the eye lands on, so it is styled');
});

test('a board with no font for a script drops that line instead of drawing boxes', () => {
  const at = JS.indexOf('function _wxIntroHasGlyphs(');
  assert.ok(at >= 0, 'the coverage probe must exist');
  const body = JS.slice(at, JS.indexOf('\n}', at));
  assert.match(body, /\\uFFFF/,
    'coverage is measured against a codepoint that is permanently unassigned, ' +
    'so it is .notdef in every font that will ever exist');
  assert.match(body, /replace\(\/\\s\+\/g, ""\)/,
    'spaces have a real advance in every font and would mask the comparison');
  assert.match(body, /catch \(e\) \{ return true; \}/,
    'a probe that throws must keep the line, not silently delete a language');
  const use = JS.slice(JS.indexOf('function _wxIntroHtml('), JS.indexOf('function _wxIntroHtml(') + 900);
  assert.match(use, /if \(!_wxIntroHasGlyphs\(r\.t\)\) continue;/, 'and it is actually consulted');
  assert.match(use, /if \(!h\) return '';/,
    'if nothing survives the probe, no overlay at all — an empty black panel ' +
    'over a live card is the worst outcome available');
});

test('the nine arrive together, not one after another', () => {
  // Every line gets the SAME animation and the SAME delay. A per-line offset
  // is what turns a title into a list, and a list is not what this is.
  const lineRule = BLOCK.slice(BLOCK.indexOf('.wxc-entering > .wxc-intro .wxc-intro-line'));
  const decl = lineRule.slice(0, lineRule.indexOf('}'));
  assert.match(decl, /animation: wxcIntroInk/, 'the lines share one animation');
  assert.match(decl, /animation-delay: calc\(0\.45s \* var\(--wxc-t, 1\)\)/,
    'one delay, a constant — the beat the title opens on, not a stagger');
  assert.doesNotMatch(BLOCK, /nth-child\([^)]*\)[^{]*\{[^}]*animation-delay/,
    'and no line is singled out for a delay of its own');
  assert.doesNotMatch(BLOCK, /animation-delay[^;]*--wxc-i\b/,
    'nor is a per-index custom property threaded through one');
});

/** Every wxcIntro* animation in the block, with its duration and delay. */
function timed() {
  return [...BLOCK.matchAll(
    /animation: (wxcIntro\w+) calc\(([\d.]+)s \* var\(--wxc-t, 1\)\)[^;]*;(?:\s*animation-delay: calc\(([\d.]+)s \* var\(--wxc-t, 1\)\))?/g
  )].map((m) => ({ name: m[1], dur: Number(m[2]), delay: Number(m[3] || 0) }));
}

test('the title clears the card before the card needs the space', () => {
  // The overlay is opaque past 3.20s, when the card's own scene begins
  // underneath it, and everything is finished by 6.00s when it is gone. An
  // animation still running after that is running behind a hidden element.
  const all = timed();
  assert.equal(all.length, 6, 'overlay, panel, stack, lines, ink and sheen are each timed once');
  for (const a of all) {
    assert.ok(a.delay + a.dur <= 6.0 + 1e-9,
      `${a.name} ends at ${(a.delay + a.dur).toFixed(2)}s, past the 6.00s the overlay lives`);
  }
  const out = all.find((a) => a.name === 'wxcIntroOut');
  assert.ok(out && out.dur === 6.0 && out.delay === 0,
    'the overlay itself spans the whole window');
  // and every one of them scales with the speed dial, or they desynchronise
  // the moment anyone touches ?wxspeed=
  const anims = [...BLOCK.matchAll(/animation(?:-delay)?:\s*(?:wxcIntro\w+\s+)?calc\([^;]*/g)].map((m) => m[0]);
  assert.ok(anims.length >= 9, 'both the durations and the delays are calc()ed');
  for (const a of anims) {
    assert.match(a, /var\(--wxc-t, 1\)/, `this one ignores the speed dial: ${a.slice(0, 60)}`);
  }
});

test('the motion never stops between the settle and the drift', () => {
  // A title that arrives and then freezes reads as a stall on a board people
  // watch for minutes at a time. The drift has to pick up exactly where the
  // settle puts it down, or there is a dead beat in the middle of the title.
  const all = timed();
  const rise = all.find((a) => a.name === 'wxcIntroRise');
  const drift = all.find((a) => a.name === 'wxcIntroDrift');
  assert.ok(rise && drift, 'both halves of the movement exist');
  assert.equal(drift.delay, rise.delay + rise.dur,
    `the drift starts at ${drift.delay}s but the settle ends at ${(rise.delay + rise.dur).toFixed(2)}s`);
  assert.equal(drift.delay + drift.dur, 6.0, 'and it runs out the rest of the title');
  // the settle hands over at rest, so the seam is invisible
  const kf = BLOCK.slice(BLOCK.indexOf('@keyframes wxcIntroRise'));
  assert.match(kf.slice(0, kf.indexOf('}\n}') + 3), /to\s+\{ transform: none; \}/,
    'the settle ends at rest, which is exactly where the drift begins');
  const dk = BLOCK.slice(BLOCK.indexOf('@keyframes wxcIntroDrift'));
  assert.match(dk.slice(0, dk.indexOf('}\n}') + 3), /from \{ transform: none; \}/,
    'and the drift begins there');
});

test('each element drives its own transform', () => {
  // Two animations on one element both writing transform is the bug that
  // costs an afternoon: the later one silently wins. Six layers, six
  // animations, one apiece.
  const owners = [...BLOCK.matchAll(/\n(html body[^\n{]*)\{([^}]*)\}/g)]
    .filter((m) => /animation: wxcIntro/.test(m[2]))
    .map((m) => m[1].trim());
  assert.equal(owners.length, 6, 'six animated layers');
  assert.equal(new Set(owners).size, owners.length,
    'and no element carries two of these animations');
});

test('the tilt has somewhere to turn in, and the light crosses', () => {
  // A rotateX with no perspective on the parent is a flat vertical squash,
  // not a panel leaning upright — the whole point of the move is lost.
  const intro = BLOCK.slice(BLOCK.indexOf('> .wxc-intro {'));
  assert.match(intro.slice(0, intro.indexOf('}')), /perspective: 900px/,
    'the overlay carries the perspective the stack turns in');
  const kf = BLOCK.slice(BLOCK.indexOf('@keyframes wxcIntroRise'));
  assert.match(kf.slice(0, kf.indexOf('}\n}') + 3), /rotateX\(10deg\)/,
    'and the stack actually leans');
  const sheen = BLOCK.slice(BLOCK.indexOf('@keyframes wxcIntroSheen'));
  assert.match(sheen.slice(0, sheen.indexOf('}\n}') + 3), /translate3d\(300%/,
    'the sheen crosses the panel rather than sitting on it');
});

test('a tall narrow panel is what this is sized for', () => {
  const stack = BLOCK.slice(BLOCK.indexOf('> .wxc-intro .wxc-intro-lines'));
  assert.match(stack.slice(0, stack.indexOf('}')), /flex-direction: column/,
    'one column — the panel measured 408 × 792, so a grid cannot hold these ' +
    'phrases at a readable size');
  const lineRule = BLOCK.slice(BLOCK.indexOf('> .wxc-intro .wxc-intro-line {'));
  const decl = lineRule.slice(0, lineRule.indexOf('}'));
  assert.match(decl, /font-size: clamp\([^)]*min\(([\d.]+)vh, ([\d.]+)vw\)/,
    'type takes the SMALLER of a height and a width measure: height alone ' +
    'overflows a narrow panel, width alone overflows a short one');
  assert.match(decl, /white-space: nowrap/,
    'and no phrase may be severed across two lines');
});

test('nothing of the title survives the entrance', () => {
  assert.match(BLOCK, /\.wxcard-wrap:not\(\.wxc-entering\) > \.wxc-intro \{ display: none !important; \}/,
    'the overlay is taken out of the layout the moment the entrance is over — ' +
    'left behind it is a filled rectangle over live readings');
  assert.match(BLOCK, /prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,4000}?> \.wxc-intro \{ display: none !important; \}/,
    'and it is skipped entirely when motion is not wanted');
});

// ═══════════════════════════════════════════════════════════════════════════
// The guard for the bug this block actually shipped with, caught only because
// someone measured it in a browser rather than reading it.
//
// The sheen's base rule carried `transform: translate3d(-190%,0,0) …
// !important`, and the entering rule put `animation: wxcIntroSheen` on the
// same element. An author !important declaration outranks the ANIMATION
// origin — not the other way round — so the static transform won every frame.
// The band sat off the left edge of a clipped panel for the full six seconds
// while its opacity went on ramping 0 → .85 → 0 exactly as designed. A sweep
// that was never once drawn, and every assertion in this file still passed:
// they all read the keyframes, and the keyframes were perfect.
//
// This is the same failure the MET credit hit, with the two properties
// swapped. Once is a bug; twice is a missing test.
// ═══════════════════════════════════════════════════════════════════════════

/** Every rule in the block, keyed by the element it targets. */
function rulesByElement() {
  const by = new Map();
  for (const m of BLOCK.matchAll(/\n(html body[^\n{]*)\{([^}]*)\}/g)) {
    const el = m[1]
      .replace(/:not\(#_\)/g, '')
      .replace(/^html body /, '')
      .replace('.wxcard-wrap.wxc-entering', '.wxcard-wrap')
      .replace(/\s+/g, ' ')
      .trim();
    by.set(el, (by.get(el) || '') + '\n' + m[2]);
  }
  return by;
}

/** The properties a given @keyframes actually writes. */
function keyframeProps(name) {
  const at = CSS.lastIndexOf('@keyframes ' + name);
  if (at < 0) return [];
  const body = CSS.slice(at, CSS.indexOf('}\n}', at) + 3);
  const props = new Set();
  for (const m of body.matchAll(/([a-z-]+)\s*:/g)) {
    if (m[1] !== 'animation-timing-function') props.add(m[1]);
  }
  return [...props];
}

test('no static !important outranks these keyframes', () => {
  const by = rulesByElement();
  let checked = 0;
  for (const [el, body] of by) {
    const anim = body.match(/animation: (wxcIntro\w+)/);
    if (!anim) continue;
    const props = keyframeProps(anim[1]);
    assert.ok(props.length, `${anim[1]} writes nothing — is it named correctly?`);
    for (const p of props) {
      checked++;
      const pinned = new RegExp('(?:^|[;{\\s])' + p + '\\s*:[^;]*!important');
      assert.ok(!pinned.test(body),
        `${el} pins ${p} with !important while ${anim[1]} animates it. An ` +
        'author !important declaration outranks the ANIMATION origin, so the ' +
        'keyframe never applies and that half of the motion is silently dead — ' +
        'the animation still runs, the element still reports it, and nothing ' +
        'moves.');
    }
  }
  assert.ok(checked >= 8, `only ${checked} property/animation pairs checked — the walk is not finding the rules`);
});

// ═══════════════════════════════════════════════════════════════════════════
// The backdrop is chosen and PACED so that every word on the panel is one the
// board drew. The clip carries its own headline — they all do — but it slides
// in at about 5.2s, and the title only ever consumes the clean stretch before
// that. Measured on the 408 x 792 crop: luminance 70-87 through 5.21s with no
// blown pixels in the band the type sits in, then the lettering enters.
// ═══════════════════════════════════════════════════════════════════════════

test('the backdrop is paced to stay inside its clean stretch', () => {
  const span = Number((JS.match(/var _WX_INTRO_BG_SPAN = ([\d.]+);/) || [])[1]);
  assert.ok(span > 0, 'the span must be named');
  assert.ok(span <= 5.0,
    `${span}s of clip is consumed, but this clip's own headline slides in at ` +
    'about 5.2s — anything past that puts a second, English-only headline ' +
    'behind nine languages');

  const arm = JS.slice(JS.indexOf('function _wxArmEntrance(wrap)'));
  const body = arm.slice(0, arm.indexOf('\n}'));
  assert.match(body, /_introMs = \(_WXC_ENTRANCE_INTRO_S \|\| 6\) \* 1000 \* _wxSpeed\(\)/,
    'the window the rate is derived from follows the speed dial');
  assert.match(body, /_bg\.playbackRate = _WX_INTRO_BG_SPAN \/ \(_introMs \/ 1000\)/,
    'so the same span of clip is consumed however long the title runs — ' +
    'without this, a slowed title runs straight into the clip headline');
  // …and the window it is paced against is the one the CSS animates over
  const intro = Number((JS.match(/var _WXC_ENTRANCE_INTRO_S = (\d+);/) || [])[1]);
  assert.equal(intro, 6, 'six seconds, the same window every keyframe uses');
  for (const a of timed()) {
    assert.ok(a.delay + a.dur <= intro + 1e-9,
      `${a.name} outlives the window the backdrop is paced against`);
  }
});

test('the clip that carried a headline over the type is gone', () => {
  assert.doesNotMatch(JS, /wx-report-intro\.mp4/,
    'the previous backdrop put WEATHER REPORT in full-frame letters directly ' +
    'behind the nine phrases, and a full-frame sun through the middle of the ' +
    'title — it must not be referenced any more');
  const mode = (JS.match(/var _WX_INTRO_BACKDROP = '(\w+)';/) || [])[1];
  assert.ok(mode === 'sky' || mode === 'clip', `unknown backdrop mode: ${mode}`);
  // whichever it is, the clip it can fall back to has to be real and committed
  const clip = (JS.match(/var _WX_INTRO_CLIP = '([^']+)'/) || [])[1];
  assert.ok(clip && clip.endsWith('.mp4'), 'the clip is named once, as a path');
  const full = path.join(ROOT, 'fids-current', clip.replace(/^\//, ''));
  assert.ok(fs.existsSync(full), `the clip must be committed: ${clip}`);
  const mb = fs.statSync(full).size / 1024 / 1024;
  assert.ok(mb < 18, `the clip is ${mb.toFixed(1)}MB — it loads on every board that shows the card`);
  const man = fs.readFileSync(path.join(ROOT, 'fids-current/assets/asset-manifest.json'), 'utf8');
  assert.ok(man.includes(clip.split('/').pop()), 'and the manifest must know about it');
});

test('the backdrop stops when the title is taken out of the layout', () => {
  // display:none on the overlay does not stop a clip inside it. Measured on a
  // live board: the backdrop ran on to 11.58s of a 12s clip after the title
  // was hidden — 1080p decoding behind nothing, on a box that is also
  // encoding a stream.
  const at = JS.indexOf('function _wxEndEntrance(root)');
  assert.ok(at >= 0, 'the teardown must exist');
  const body = JS.slice(at, JS.indexOf('\n}', at));
  assert.match(body, /querySelectorAll\('video\.wxc-intro-bg'\)/,
    'the teardown has to find the backdrop');
  assert.match(body, /\.pause\(\)/, 'and pause it');
  assert.match(body, /\.currentTime = 0/,
    'and rewind it — a second visit inside the same card would otherwise open ' +
    'the backdrop wherever it stopped, which is past the clean stretch');

  const arm = JS.slice(JS.indexOf('function _wxArmEntrance(wrap)'));
  const ab = arm.slice(0, arm.indexOf('\n}'));
  // …and it stops at the end of the TITLE (6s), not the end of the entrance
  // (18.7s). The overlay is transparent from 6s but stays in the layout, so
  // the clip would otherwise decode for another twelve seconds behind nothing.
  assert.match(ab, /window\._wxIntroBgTimer = setTimeout/,
    'a timer stops the backdrop when it stops being seen');
  assert.match(ab, /\}, Math\.round\(_introMs\)\);/,
    'and that timer is the title window, not the entrance');
  assert.match(ab, /_introMs = \(_WXC_ENTRANCE_INTRO_S \|\| 6\) \* 1000 \* _wxSpeed\(\)/,
    'which follows the speed dial like everything else');
  assert.match(ab, /_bg\.currentTime = 0/,
    'and arming rewinds too: the card does not always rebuild between visits, ' +
    'so the element can be the one the last title used');
  assert.match(ab, /_bg\.play\(\)/, 'and starts it');
});

// ═══════════════════════════════════════════════════════════════════════════
// v23788 — THE NIGHT SKY THE BOARD DRAWS.
//
// Five stock clips were measured on this panel and four failed on one thing:
// brightness behind the type. A drawn sky cannot fail that way, because its
// darkness is a number in this file rather than a property of footage.
// ═══════════════════════════════════════════════════════════════════════════

const SKY_AT = CSS.lastIndexOf('@keyframes wxcSkyDrift');
const SKY = SKY_AT >= 0 ? CSS.slice(CSS.lastIndexOf('/*', SKY_AT)) : '';

/** sRGB relative luminance of a #rrggbb, 0-255. */
function lum(hex) {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('the sky is dark enough for white type, by construction', () => {
  const at = SKY.indexOf('.wxc-intro-bg.wxc-sky {');
  assert.ok(at >= 0, 'the sky must have a ground');
  const rule = SKY.slice(at, SKY.indexOf('}', at));
  const stops = [...rule.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => '#' + m[1]);
  assert.ok(stops.length >= 4, 'the gradient must actually be declared');
  for (const s of stops) {
    assert.ok(lum(s) < 46,
      `${s} has luminance ${lum(s).toFixed(0)} — the stock clips that failed ` +
      'this panel measured 118-217 in the band the phrases sit in, and the one ' +
      'that worked measured 70-87. A drawn sky has no excuse to be near that.');
  }
});

test('the aircraft crosses once and is gone', () => {
  const kf = SKY.slice(SKY.indexOf('@keyframes wxcSkyCross'));
  const body = kf.slice(0, kf.indexOf('}\n}') + 3);
  const pts = [...body.matchAll(/translate3d\((-?[\d.]+)%,\s*(-?[\d.]+)%/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  assert.equal(pts.length, 2, 'from somewhere to somewhere');
  assert.ok(pts[0].x < 0 && pts[1].x > 100,
    'it starts off one edge and ends past the other — a plane that appears ' +
    'or vanishes inside the frame reads as a glitch');
  assert.ok(pts[0].y > pts[1].y, 'and it climbs, rather than sliding flat');

  const rule = SKY.slice(SKY.indexOf('> .wxc-sky-plane {'));
  assert.doesNotMatch(rule.slice(0, rule.indexOf('}')), /(?:^|[;{\s])transform\s*:/,
    'the wrapper must not pin a transform — the crossing is the animation, ' +
    'and an !important static one would outrank it');
  const bodyRule = SKY.slice(SKY.indexOf('> .wxc-sky-plane > .wxc-sky-body'));
  assert.match(bodyRule.slice(0, bodyRule.indexOf('}')), /transform: rotate\(\d+deg\)/,
    'the heading lives on the silhouette inside, so the animation writes only ' +
    'a translate');
  // it runs exactly as long as the title
  assert.match(SKY, /animation: wxcSkyCross calc\(6\.00s \* var\(--wxc-t, 1\)\)/,
    'and it crosses over the whole six seconds, not a fraction of them');
});

test('the sky costs the board nothing it cannot afford', () => {
  // The entire point of drawing it rather than decoding a clip.
  const anims = [...SKY.matchAll(/@keyframes (wxcSky\w+) \{([\s\S]*?)\n\}/g)];
  assert.ok(anims.length >= 4, 'stars near and far, the crossing, the strobe');
  for (const [, name, body] of anims) {
    for (const m of body.matchAll(/^\s*([a-z-]+)\s*:/gm)) {
      assert.ok(['transform', 'opacity'].includes(m[1]),
        `${name} animates ${m[1]} — only transform and opacity composite, and ` +
        'this plays while the board is also decoding the scene clip');
    }
  }
  assert.doesNotMatch(SKY, /\.mp4/, 'and it fetches nothing');
  assert.match(SKY, /url\("data:image\/svg\+xml/,
    'the silhouette is inline, so it cannot 404 on a board');
});

test('a drawn sky is knocked back less than footage', () => {
  // Softening the scrim is the whole dividend: the sky is already dark where
  // the type goes, so more of it can show than a bright clip could.
  const drawn = SKY.slice(SKY.indexOf('.wxc-intro.wxc-intro-drawn > .wxc-intro-scrim'));
  const a = Number((drawn.slice(0, drawn.indexOf('}')).match(/rgba\(4,11,24,([\d.]+)\)/) || [])[1]);
  const footage = BLOCK.slice(BLOCK.indexOf('> .wxc-intro > .wxc-intro-scrim'));
  const b = Number((footage.slice(0, footage.indexOf('}')).match(/rgba\(4,11,24,([\d.]+)\)/) || [])[1]);
  assert.ok(a > 0 && b > 0, 'both scrims must be declared');
  assert.ok(a < b, `the drawn scrim (${a}) must be lighter than the footage one (${b})`);
  // and the class that selects it is actually emitted
  assert.match(JS, /_sky \? ' wxc-intro-drawn' : ''/,
    'the overlay has to say which backdrop it got');
});

test('the aircraft crosses the PANEL, not its own box', () => {
  // A percentage translate resolves against the element's own border box. The
  // first cut sized the wrapper to the aircraft (52px) and translated it 150%,
  // which crossed 78px of a 408px panel — a twitch, not a crossing, and it
  // read as a stationary dot. The wrapper is the panel now and the aircraft is
  // placed inside it, so the percentages mean what they read as.
  const rule = SKY.slice(SKY.indexOf('> .wxc-sky > .wxc-sky-plane {'));
  const decl = rule.slice(0, rule.indexOf('}'));
  assert.match(decl, /inset: 0/,
    'the animated wrapper must be panel-sized, or its percentage travel is ' +
    'measured against the aircraft instead of the sky');
  assert.doesNotMatch(decl, /width: clamp/,
    'sizing the wrapper to the aircraft is exactly the bug this replaced');
  const body = SKY.slice(SKY.indexOf('> .wxc-sky-plane > .wxc-sky-body'));
  assert.match(body.slice(0, body.indexOf('}')), /width: var\(--wxc-craft\)/,
    'the aircraft takes its size from a variable on the wrapper');
  // the strobe rides the same box, so the two cannot drift apart
  const strobe = SKY.slice(SKY.indexOf('> .wxc-sky-plane > .wxc-sky-strobe'));
  const sd = strobe.slice(0, strobe.indexOf('}'));
  assert.match(sd, /left: 4%/, 'anchored where the airframe is');
  assert.match(sd, /top: 64%/);
  assert.match(sd, /width: var\(--wxc-craft\)/,
    'and the same size, so the light stays on the aircraft as it crosses');
});
