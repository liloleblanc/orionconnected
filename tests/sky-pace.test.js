'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE SKY AT ONE PACE, NEAR FASTER THAN FAR (v24132).
//
// The gate shelf's sky is the reference clip with its aircraft removed, and
// three strips of cloud art pass over it: far (in front of the clip, behind
// the aeroplane), back (behind the aeroplane), front (in front of it). Depth
// in a scene like this is read from speed alone: a layer nearer the viewer
// must move faster than every layer behind it. Measured on the shelf at
// 1680x1050 (sky box 372px wide, clip at 1x), the clip's own veils cross at
// about 40 to 111 px/s on screen — 165 to 455 px/s on the 1920-wide source,
// of which the clip is the middle 1824 px scaled to 1140 (cleanplate5.swift),
// shown across 372 * 1.2 = 446 px — while the far layer in front of them
// crawled at 25 px/s. Big cumulus crawling across a sky that moved four
// times faster behind it read as "the back and the front do not agree", and
// as the whole scene being slow.
//
// v24136: the clip plays at 1x by default (at 0.5 it ran in slow motion), the
// two veil strips keep the speeds the display showed at 0.5, and the far big
// cumulus ease to the slower veils of the clip: in the video the big clouds
// hold still and only the thin veils sweep.
//
// v24138: that read as still a tad slow. Every slow verdict so far had the
// veils at or under the v23899 speeds (back 112, front 200 px/s), so every
// strip steps up, the far cumulus most and the front veil least; the clip
// stays at 1x.
//
// Two things are pinned here. The LADDER, as above. And the PACE: one number, --g8-pace, scales the clip's playback
// rate, the three CSS durations and the phase moduli together, so the scene
// can be sped up or slowed on any screen with ?skyspeed= and nothing drifts.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, 'fids-current', ...p), 'utf8');
const CSS = read('css', 'display-overrides.css');
const CORE = read('js', 'fids-core.js');

// The strip lengths the keyframes travel, in px at shelf size (ems on the card).
const STRIP = { far: 1500, back: 1350, front: 1200 };
// The clip's veils on screen at pace 1: 165 to 455 px/s on the 1920-wide source, of which the clip is
// the 1824px centre crop scaled to 1140 (cleanplate5.swift: cropW 1824 at x 48), shown across the 372px
// sky box at 1.2 = 446 px. 455 * 446 / 1824 = 111 px/s; 165 * 446 / 1824 = 40 px/s.
const PX_PER_SOURCE_PX = 372 * 1.2 / 1824;
const CLIP_SLOWEST_PX_S = 165 * PX_PER_SOURCE_PX;
const CLIP_FASTEST_PX_S = 455 * PX_PER_SOURCE_PX;

function cycles() {
  const m = /var SKY_LAYER_CYCLES = \{ far: ([\d.]+), back: ([\d.]+), front: ([\d.]+), float: ([\d.]+) \};/.exec(CORE);
  assert.ok(m, 'SKY_LAYER_CYCLES is declared in fids-core');
  return { far: +m[1], back: +m[2], front: +m[3], float: +m[4] };
}

function block() {
  const at = CSS.indexOf('/* ══ v24132 — THE SKY AT ONE PACE, NEAR FASTER THAN FAR');
  assert.ok(at > 0, 'the v24132 block is in display-overrides.css');
  const end = CSS.indexOf('/* ══ v23904 — THE CAPTION IS ONE ROW', at);
  assert.ok(end > at, 'the v24132 block sits right after the v23899 sky block it tunes, before the caption block');
  assert.ok(at > CSS.indexOf('/* ══ v23899 — THE SHELF SKY IS THE REFERENCE FLIGHT'), 'and after the v23899 block');
  // Many later tests slice the stylesheet from their own header to its end and require that nothing in
  // that tail animates; a block that animates belongs with the sky rules, not at the end.
  const welcome = CSS.indexOf('v23994 — THE WELCOME CARD, IN THREE LINES');
  assert.ok(welcome > 0 && at < welcome, 'before the blocks whose tests slice to the end of the file');
  return CSS.slice(at, end);
}

test('the ladder (v24138): the clip at 1x, every strip a step faster than v24136, the far cumulus most', () => {
  // v24136 — the Air France A320 video, which the clip is, shows a still sky with only thin veils
  // crossing it. The v24132 ladder put every strip well above the fastest of those veils and the scene
  // raced at 1.25; at 0.5 the clip itself ran in slow motion and read as slow. So the clip plays at 1x,
  // the two veil strips keep the speeds the display showed at 0.5 (171 and about 108 px/s), and the far
  // big cumulus ease to 60 px/s, among the slower veils of the clip: in the video the big clouds hold still.
  // v24138 — still a tad slow. Every slow verdict had the veils at or under the v23899 speeds (back 112,
  // front 200 px/s, which ran for weeks with only the far cumulus found wrong), and v24136 had both veils under
  // those. So: far 94 px/s (with the veils of the clip, below its fastest), back 159 (a step above the fastest
  // veil), front 240 (about 2.2x the fastest veil, 1.55 s per box, well clear of the 429 that raced).
  const c = cycles();
  const far = STRIP.far / c.far, back = STRIP.back / c.back, front = STRIP.front / c.front;
  assert.ok(far >= CLIP_FASTEST_PX_S * 0.6 && far <= CLIP_FASTEST_PX_S, `far ${far.toFixed(0)} px/s drifts with the veils of the clip, below its fastest (${(CLIP_FASTEST_PX_S * 0.6).toFixed(0)} to ${CLIP_FASTEST_PX_S.toFixed(0)})`);
  assert.ok(far > CLIP_SLOWEST_PX_S * 2, `far ${far.toFixed(0)} px/s is well above the crawl that read wrong (${(CLIP_SLOWEST_PX_S * 2).toFixed(0)})`);
  assert.ok(back >= CLIP_FASTEST_PX_S * 1.2 && back <= CLIP_FASTEST_PX_S * 1.7, `back ${back.toFixed(0)} px/s is a step above the fastest veil of the clip (${(CLIP_FASTEST_PX_S * 1.2).toFixed(0)} to ${(CLIP_FASTEST_PX_S * 1.7).toFixed(0)})`);
  assert.ok(front >= CLIP_FASTEST_PX_S * 1.9 && front <= CLIP_FASTEST_PX_S * 2.6, `front ${front.toFixed(0)} px/s is two steps above the fastest veil and nowhere near the 429 that raced (${(CLIP_FASTEST_PX_S * 1.9).toFixed(0)} to ${(CLIP_FASTEST_PX_S * 2.6).toFixed(0)})`);
  assert.ok(back > far && front > back, `near faster than far: ${far.toFixed(0)} < ${back.toFixed(0)} < ${front.toFixed(0)}`);
  assert.equal(c.float, 9, 'the float is the bob, not speed: 9 s stays');
});

test('the stylesheet divides the same cycles by --g8-pace, on the shelf and on the archive card', () => {
  const c = cycles();
  const b = block();
  const dur = (sec) => `calc(${sec}s / var(--g8-pace, 1))`;
  // A literal for a RegExp: every special character escaped, the backslash included.
  const rx = (lit) => lit.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  for (const [id, name, key, delay] of [
    ['#gateCloudsMid', 'g8SkyMidFar', 'far', '--g8-midfar-delay'],
    ['#gateCloudsVeil', 'g8SkyVeilBk', 'back', '--g8-veil-delay'],
    ['#gateCloudsFg', 'g8SkyVeilFr', 'front', '--g8-front-delay'],
  ]) {
    const re = new RegExp(`\\.v2-rc-shelf-illus > ${id} \\{\\s*animation: ${name} ${rx(dur(c[key]))} linear infinite !important;\\s*animation-delay: var\\(${delay}, 0s\\) !important;\\s*animation-direction: var\\(--g8-dir, reverse\\) !important;\\s*\\}`);
    assert.match(b, re, `${id}: ${name} over ${c[key]} s at pace 1, phased and facing the aeroplane`);
  }
  for (const [cls, key] of [['hcard-l-mid', 'far'], ['hcard-l-back', 'back'], ['hcard-l-front', 'front']]) {
    assert.match(b, new RegExp(`\\.hcard-wrap \\.hcard-sky \\.${cls}\\s*\\{ animation-duration: ${rx(dur(c[key]))} !important; \\}`), `${cls}: ${c[key]} s at pace 1`);
  }
  // Reduced motion is restated at this strength, or these rules would outrank the stills.
  const rm = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\}\s*\}/.exec(b);
  assert.ok(rm, 'the block restates reduced motion');
  for (const sel of ['#gateCloudsMid', '#gateCloudsVeil', '#gateCloudsFg', '.hcard-l-mid', '.hcard-l-back', '.hcard-l-front']) {
    assert.ok(rm[1].includes(sel), `${sel} is still under reduced motion`);
  }
  assert.match(rm[1], /animation: none !important;/);
});

test('the block is one step stronger than the v23899 sky block, so it wins whatever follows', () => {
  const b = block();
  const count = (sel) => (sel.match(/:not\(#_\)/g) || []).length;
  const mine = /([^\n]*#gateCloudsMid) \{\s*animation: g8SkyMidFar calc/.exec(b);
  assert.ok(mine, 'the far layer rule');
  const old = /([^\n{]*#gateCloudsMid) \{[^}]*animation: g8SkyMidFar 60s/.exec(CSS);
  assert.ok(old, 'the v23899 far layer rule (60 s) is still in the file, which the append-only stylesheet requires');
  assert.equal(count(mine[1]), count(old[1]) + 1, `mine ${count(mine[1])} vs v23899 ${count(old[1])}`);
  for (const line of b.split('\n')) {
    if (/^html body/.test(line)) assert.equal(count(line), count(mine[1]), `every selector in the block is as strong: ${line.slice(0, 60)}`);
  }
});

test('one pace: the clip rate, the phase moduli and the card all divide by the same number', () => {
  // The shelf writes --g8-pace and divides each modulus by it at build time.
  assert.match(CORE, /var p = \(typeof _skyPace === 'function'\) \? _skyPace\(\) : 1;\s*var far = SKY_LAYER_CYCLES\.far \/ p, back = SKY_LAYER_CYCLES\.back \/ p, front = SKY_LAYER_CYCLES\.front \/ p;/);
  assert.match(CORE, /style="--g8-pace:' \+ p \+ ';--g8-med-delay/);
  assert.match(CORE, /--g8-veil-delay:-' \+ \(t % back\)\.toFixed\(2\)/);
  assert.match(CORE, /--g8-front-delay:-' \+ \(t % front\)\.toFixed\(2\)/);
  assert.match(CORE, /--g8-midfar-delay:-' \+ \(t % far\)\.toFixed\(2\)/);
  // The 2 s poll makes the same division.
  assert.match(CORE, /_shelfEl\.style\.setProperty\('--g8-pace', String\(_p\)\);/);
  for (const key of ['far', 'back', 'front']) {
    assert.match(CORE, new RegExp(`\\(t % \\(SKY_LAYER_CYCLES\\.${key} / _p\\)\\)\\.toFixed\\(2\\)`), `poll divides ${key} by the pace`);
  }
  // Every clip tag sets its rate and starts at the wall clock's phase AT that rate; three tags: two shelf builders, the card.
  const tag = 'onloadedmetadata="try{var p=(window._skyPace?window._skyPace():1);this.playbackRate=p;this.currentTime=(Date.now()/1000*p)%15}catch(e){}"';
  assert.equal(CORE.split(tag).length - 1, 3, 'the two shelf clips and the card clip');
  // The poll re-asserts the rate on both surfaces.
  assert.match(CORE, /querySelectorAll\('\.v2-rc-shelf-illus > #gateSkyVid, \.hcard-sky > \.hcard-skyclip'\)/);
  // The card stage carries the pace inline, so its durations divide too.
  assert.match(CORE, /<div class="hcard-sky" aria-hidden="true" style="--g8-pace:' \+ \(typeof _skyPace === 'function' \? _skyPace\(\) : 1\) \+ '">/);
});

test('_skyPace: the default, ?skyspeed= on one screen, clamped to 0.25..4, nonsense ignored', () => {
  const def = /var SKY_PACE_DEFAULT = ([\d.]+);/.exec(CORE);
  assert.ok(def, 'SKY_PACE_DEFAULT is declared');
  const fn = /function _skyPace\(\) \{[\s\S]*?\n\}/.exec(CORE);
  assert.ok(fn, '_skyPace is declared');
  const run = (search) => {
    const ctx = { window: { location: { search } }, URLSearchParams, parseFloat, isFinite, Math, SKY_PACE_DEFAULT: +def[1] };
    vm.createContext(ctx);
    return vm.runInContext(fn[0] + '; _skyPace()', ctx);
  };
  const d = +def[1];
  // v24136 — the clip plays at the speed the Air France A320 video was made at (1.25 raced, 0.5 was slow
  // motion). v24138 — the front strip, the nearest thing in the scene, crosses the sky box in about 1.5 s
  // (2.2 s read as a tad slow twice), and nowhere near the 0.87 s that read as terrible.
  const c = cycles();
  const frontCross = 372 / (STRIP.front / c.front * d);
  assert.equal(d, 1, 'the default pace is 1: the clip at its own speed');
  assert.ok(frontCross >= 1.3 && frontCross <= 2.0, `the front strip crosses the sky box in ${frontCross.toFixed(1)} s at the default pace`);
  assert.equal(run(''), d);
  assert.equal(run('?ap=YQM&gate=3'), d);
  assert.equal(run('?skyspeed=2'), 2);
  assert.equal(run('?ap=YQM&skyspeed=1.5&gate=3'), 1.5);
  assert.equal(run('?skyspeed=0'), d, 'zero is not a pace');
  assert.equal(run('?skyspeed=-1'), d);
  assert.equal(run('?skyspeed=abc'), d);
  assert.equal(run('?skyspeed=99'), 4, 'capped: Chrome mutes and stutters far above 4x');
  assert.equal(run('?skyspeed=0.1'), 0.25, 'floored: a near-still sky is ?acsky=0, not a pace');
  assert.match(CORE, /window\._skyPace = _skyPace;/, 'the clip tags reach it through window');
});
