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
// Two things are pinned here. The LADDER: at pace 1 the far layer moves at
// least as fast as the clip's fastest veil, the back faster, the front
// fastest. And the PACE: one number, --g8-pace, scales the clip's playback
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
// The clip's fastest veil on screen at pace 1: 455 px/s on the 1920-wide source, of which
// the clip is the 1824px centre crop scaled to 1140 (cleanplate5.swift: cropW 1824 at x 48),
// shown across the 372px sky box at 1.2 = 446 px. 455 * 446 / 1824 = 111 px/s.
const CLIP_FASTEST_PX_S = 455 * (372 * 1.2 / 1824);

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

test('the ladder: far a clear step above the fastest veil of the clip, back faster, front fastest, at pace 1', () => {
  const c = cycles();
  const far = STRIP.far / c.far, back = STRIP.back / c.back, front = STRIP.front / c.front;
  assert.ok(far >= CLIP_FASTEST_PX_S * 1.25, `far ${far.toFixed(0)} px/s is a clear step (1.25x) above the clip's fastest veil (${CLIP_FASTEST_PX_S.toFixed(0)})`);
  assert.ok(back > far, `back ${back.toFixed(0)} px/s faster than far ${far.toFixed(0)}`);
  assert.ok(front > back, `front ${front.toFixed(0)} px/s faster than back ${back.toFixed(0)}`);
  assert.equal(c.float, 9, 'the float is the bob, not speed: 9 s stays');
});

test('the stylesheet divides the same cycles by --g8-pace, on the shelf and on the archive card', () => {
  const c = cycles();
  const b = block();
  const dur = (sec) => `calc(${sec}s / var(--g8-pace, 1))`;
  for (const [id, name, key, delay] of [
    ['#gateCloudsMid', 'g8SkyMidFar', 'far', '--g8-midfar-delay'],
    ['#gateCloudsVeil', 'g8SkyVeilBk', 'back', '--g8-veil-delay'],
    ['#gateCloudsFg', 'g8SkyVeilFr', 'front', '--g8-front-delay'],
  ]) {
    const re = new RegExp(`\\.v2-rc-shelf-illus > ${id} \\{\\s*animation: ${name} ${dur(c[key]).replace(/[().]/g, '\\$&')} linear infinite !important;\\s*animation-delay: var\\(${delay}, 0s\\) !important;\\s*animation-direction: var\\(--g8-dir, reverse\\) !important;\\s*\\}`);
    assert.match(b, re, `${id}: ${name} over ${c[key]} s at pace 1, phased and facing the aeroplane`);
  }
  for (const [cls, key] of [['hcard-l-mid', 'far'], ['hcard-l-back', 'back'], ['hcard-l-front', 'front']]) {
    assert.match(b, new RegExp(`\\.hcard-wrap \\.hcard-sky \\.${cls}\\s*\\{ animation-duration: ${dur(c[key]).replace(/[().]/g, '\\$&')} !important; \\}`), `${cls}: ${c[key]} s at pace 1`);
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
  assert.ok(d >= 1 && d <= 2, `the default pace ${d} is a modest speed-up, not a fast-forward`);
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
