'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE PLANE'S SKY: THE FRONT CLOUDS PASS IN FRONT, AND NOTHING BLURS BEHIND IT.
//
// Two surfaces run the same scene: the gate screen's aircraft shelf
// (.v2-rc-shelf-illus) and the From the Archive card in the gate's centre
// carousel (.hcard-sky). Each is a sky, three cloud layers (far 60 s, back
// 12 s, front 6 s) and the aircraft. Two regressions crept into that scene
// within one week, and both read on the board as "the animation changed".
//
// FIRST, THE FRONT CLOUDS. From #501 through v23927 the nearest cloud layer
// (#gateCloudsFg on the shelf, .hcard-l-front on the card) passed IN FRONT of
// the aircraft: the shelf aircraft is z-index 1 by day and 3 at night, the card
// plane 2, the front layer 3, and the front layer comes later in the markup, so
// a tie goes to the clouds. v23928 (#969) appended a block that lifted the
// aircraft, its hold mark and the card plane to z-index 4, so the front clouds
// went behind them and the plane's own drop shadow and night glow were drawn
// over the clouds. Decision of 2026-10-12: the front clouds cross in front of
// the aircraft again. That block is gone, and this file pins the order back.
//
// SECOND, THE BLUR. v23899 (#939) made the sky the reference A320 clip with
// its aircraft removed (scripts/heritage-sky/src/cleanplate.swift). That removal
// fill was spatial (a dilate, a feather and a push-pull pyramid on each frame),
// so every cloud that drifted through the removed band, right behind and below
// the gate aircraft, became a soft, glowing smear. The first frame has no cloud
// in that band, which is why the poster and every still looked clean and the
// blur only showed while the clip played. The sky must move like the reference,
// so it stays a clip, on both surfaces, re-rendered with cleanplate5.swift: each
// cloud is carried through the hole from the frames where it shows, at its own
// layer's speed and from the hole's own edges, so it keeps its shape and texture
// and keeps moving. (Carried at one speed from one pair of far columns, a fast
// cloud came out a box with straight sides and the fin's outline showed.) The
// tests below pin the clip, its poster, and the re-render's tool and recipe.
//
// Nothing here renders a board, so these tests run the part of the cascade that
// decides the order: every rule in the gate's two shelf stylesheets that sets
// the property on one of these elements, the winner picked by !important,
// specificity and source order, with the body's sky classes for day and night.
// A rule that applies to only one carrier, facing or layout counts as applying.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, 'fids-current', ...p), 'utf8');
const CSS = read('css', 'display-overrides.css');
const GATE = read('css', 'gate-display.css');
const CORE = read('js', 'fids-core.js');

/** Every style rule of a stylesheet, comments blanked, @keyframes skipped, @media rules kept with their condition. */
function rulesOf(src, file) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const out = [];
  const media = [];
  let start = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === ';') { start = k + 1; continue; }           // @import / @charset at rule level
    if (ch === '}') { media.pop(); start = k + 1; continue; } // end of an @media block
    if (ch !== '{') continue;
    const prelude = s.slice(start, k).trim();
    if (/^@(-webkit-)?keyframes\b/.test(prelude)) {
      let d = 1, j = k + 1;
      for (; j < s.length && d; j++) { if (s[j] === '{') d++; else if (s[j] === '}') d--; }
      k = j - 1; start = j; continue;
    }
    if (prelude.startsWith('@')) { media.push(prelude); start = k + 1; continue; }
    const end = s.indexOf('}', k);
    out.push({ file, at: k, sel: prelude, body: s.slice(k + 1, end), media: media.slice() });
    k = end; start = end + 1;
  }
  return out;
}

// gids.html loads display-overrides.css and then gate-display.css.
const RULES = [...rulesOf(CSS, 0), ...rulesOf(GATE, 1)];

/** Split a selector list on its top-level commas. */
function splitList(sel) {
  const out = []; let d = 0, from = 0;
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === '(') d++; else if (sel[i] === ')') d--;
    else if (sel[i] === ',' && d === 0) { out.push(sel.slice(from, i).trim()); from = i + 1; }
  }
  out.push(sel.slice(from).trim());
  return out;
}

/** The last compound selector (what the rule styles). */
function lastCompound(sel) {
  let d = 0;
  for (let i = sel.length - 1; i >= 0; i--) {
    const c = sel[i];
    if (c === ')') d++; else if (c === '(') d--;
    else if (d === 0 && /[\s>+~]/.test(c)) return sel.slice(i + 1).trim();
  }
  return sel.trim();
}

/** [ids, classes] — enough for this file, whose rules win on long :not(#_) chains. */
function specificity(sel) {
  const ids = (sel.match(/#/g) || []).length;
  const cls = (sel.match(/\.[\w-]|\[|:(?!:)(?!not\(|is\(|where\(|has\()/g) || []).length;
  return [ids, cls];
}

/** Whether the selector's body compound allows the given body classes. */
function bodyAllows(sel, classes) {
  const m = sel.match(/(?:^|[\s>])body((?:[.:[][^\s>+~]*)?)/);
  if (!m) return true;
  const comp = m[1];
  for (const n of comp.matchAll(/:not\(\.([\w-]+)\)/g)) if (classes.includes(n[1])) return false;
  const plain = comp.replace(/:not\([^)]*\)/g, '');
  for (const c of plain.matchAll(/\.([\w-]+)/g)) if (!classes.includes(c[1])) return false;
  return true;
}

/** Whether a rule's last compound styles `target` itself (not a pseudo-element of it). */
function styles(last, target, star) {
  if (last.includes('::')) return false;
  return last === target || (last.startsWith(target + ':') || last.startsWith(target + '.') || last.startsWith(target + '['))
    || (star && last === '*');
}

/**
 * The winning declaration of `prop` for an element whose own compound is
 * `target` inside `scope` (a class the selector must name), with these body
 * classes. `star` also counts `scope > *`.
 */
function cascade(prop, target, scope, classes, star) {
  const hits = [];
  const re = new RegExp('(?:^|;|\\s)' + prop + '\\s*:\\s*([^;]+?)\\s*(!important)?\\s*(?:;|$)', 'g');
  for (const r of RULES) {
    if (r.media.length) continue; // checked separately below
    const decls = [...r.body.matchAll(re)];
    if (!decls.length) continue;
    const d = decls[decls.length - 1];
    for (const sel of splitList(r.sel)) {
      if (!styles(lastCompound(sel), target, star)) continue;
      if (!sel.includes(scope)) continue;
      if (!bodyAllows(sel, classes)) continue;
      hits.push({ value: d[1].trim(), imp: !!d[2], spec: specificity(sel), file: r.file, at: r.at, sel });
    }
  }
  hits.sort((a, b) => (a.imp - b.imp) || (a.spec[0] - b.spec[0]) || (a.spec[1] - b.spec[1])
    || (a.file - b.file) || (a.at - b.at));
  return hits[hits.length - 1] || null;
}

const zOf = (target, scope, classes, star) => {
  const w = cascade('z-index', target, scope, classes, star);
  return w ? { z: parseInt(w.value, 10) || 0, w } : { z: 0, w: null };
};
const short = (w) => (w ? (w.sel || '').replace(/(?::not\(#_\))+/g, (m) => `:not(#_)x${m.length / 8}`).slice(0, 140) : '(none)');

const DAY = ['gate-acsky'];
const NIGHT = ['gate-acsky', 'gate-acsky-night'];
const SHELF = 'v2-rc-shelf-illus';
const CARD = 'hcard-sky';

/** The two shelf builders: the main one and the last-resort fallback. Each is the string from its shelf div to the caption. */
function shelfBuilders() {
  const out = [];
  let from = 0;
  for (;;) {
    const at = CORE.indexOf('<div id="gateCloudsBg"></div>', from);
    if (at < 0) break;
    const end = CORE.indexOf('<div id="gateCloudsFg"', at);
    out.push({ at, src: CORE.slice(Math.max(0, at - 400), end + 60), fg: end });
    from = at + 1;
  }
  return out;
}

test('the gate shelf: the front clouds stack above the aircraft, by day and at night', () => {
  for (const [label, classes] of [['day', DAY], ['night', NIGHT]]) {
    const fg = zOf('#gateCloudsFg', SHELF, classes, true);
    for (const el of ['.v2-rc-aircraft-img', '.v2-rc-aircraft-hold']) {
      const air = zOf(el, SHELF, classes, true);
      assert.ok(fg.z >= air.z,
        `${label}: #gateCloudsFg z ${fg.z} (${short(fg.w)}) must not be below ${el} z ${air.z} (${short(air.w)})`);
    }
  }
  // An equal z-index goes to the later element, so the front clouds must come
  // after the aircraft (or the carrier mark that holds its place) in both builders.
  const builders = shelfBuilders();
  assert.equal(builders.length, 2, 'both shelf builders still emit the scene');
  for (const b of builders) {
    const plane = Math.max(b.src.lastIndexOf('v2-rc-aircraft-img'), b.src.lastIndexOf('_aircraftHoldHtml'), b.src.lastIndexOf('_fallbackHold'));
    const fg = b.src.indexOf('<div id="gateCloudsFg"');
    assert.ok(plane > 0 && fg > plane, 'the front clouds come after the aircraft in the markup');
  }
});

test('the gate shelf: the aircraft stays above the sky and the far and back clouds; the caption above it all', () => {
  for (const [label, classes] of [['day', DAY], ['night', NIGHT]]) {
    const air = zOf('.v2-rc-aircraft-img', SHELF, classes, true);
    const behind = ['#gateCloudsBg', '#gateSkyVid', '#gateCloudsMid', '#gateCloudsVeil'];
    if (label === 'night') behind.push('#gateNightSky');
    for (const id of behind) {
      const layer = zOf(id, SHELF, classes, true);
      assert.ok(air.z > layer.z, `${label}: aircraft z ${air.z} (${short(air.w)}) must be above ${id} z ${layer.z} (${short(layer.w)})`);
    }
    const fg = zOf('#gateCloudsFg', SHELF, classes, true);
    const cap = zOf('.v2-rc-acb-cap', SHELF, classes, true);
    assert.ok(cap.z > air.z && cap.z > fg.z, `${label}: the caption (z ${cap.z}) stays above the aircraft and the clouds`);
  }
});

test('the gate shelf: the front clouds are visible and moving, by day and at night', () => {
  for (const [label, classes] of [['day', DAY], ['night', NIGHT]]) {
    const op = cascade('opacity', '#gateCloudsFg', SHELF, classes, false);
    assert.ok(op && parseFloat(op.value) > 0, `${label}: front clouds opacity ${op && op.value}`);
    const disp = cascade('display', '#gateCloudsFg', SHELF, classes, false);
    assert.ok(!disp || !/^none\b/.test(disp.value), `${label}: front clouds displayed`);
    const anim = cascade('animation', '#gateCloudsFg', SHELF, classes, false);
    assert.ok(anim, `${label}: front clouds animated`);
    assert.match(anim.value, /^g8SkyVeilFr\s+6s\s+linear\s+infinite$/, `${label}: front clouds keep their 6 s loop (${anim.value})`);
    assert.match(CSS, /@keyframes g8SkyVeilFr \{ from \{ transform: translate3d\(0,0,0\); \} to \{ transform: translate3d\(-1200px,0,0\); \} \}/);
  }
});

test('the archive card: front clouds over the plane, the plane over the far and back clouds', () => {
  const plane = zOf('.hcard-float', CARD, [], false);
  const front = zOf('.hcard-l-front', CARD, [], false);
  const back = zOf('.hcard-l-back', CARD, [], false);
  const mid = zOf('.hcard-l-mid', CARD, [], false);
  assert.ok(front.z > plane.z, `front z ${front.z} (${short(front.w)}) must be above the plane z ${plane.z} (${short(plane.w)})`);
  assert.ok(plane.z > back.z && plane.z > mid.z, `the plane z ${plane.z} stays above back ${back.z} and far ${mid.z}`);
  // Markup order: far, back, the plane, then front.
  const at = CORE.indexOf('<i class="hcard-l-front"></i>');
  assert.ok(at > 0, 'the card emits its front layer');
  const fl = CORE.lastIndexOf('hcard-float', at);
  const bk = CORE.lastIndexOf('hcard-l-back', at);
  const md = CORE.lastIndexOf('hcard-l-mid', at);
  assert.ok(md > 0 && md < bk && bk < fl && fl < at, 'far, back, the aeroplane, then front');
  // Visible and moving.
  const op = cascade('opacity', '.hcard-l-front', CARD, [], false);
  assert.ok(op && parseFloat(op.value) > 0, 'front clouds visible on the card');
  const name = cascade('animation-name', '.hcard-l-front', CARD, [], false);
  const dur = cascade('animation-duration', '.hcard-l-front', CARD, [], false);
  assert.equal(name && name.value, 'hcardFront');
  assert.equal(dur && dur.value, '6s');
});

test('no @media rule reorders the plane and its clouds', () => {
  const names = /#gateClouds|#gateSkyVid|#gateFgVid|#gateNightSky|\.v2-rc-aircraft-(img|hold)\b|\.hcard-(float|l-)/;
  const scoped = RULES.filter((r) => r.media.length && names.test(r.sel) && /(^|;|\s)z-index\s*:/.test(r.body));
  assert.deepEqual(scoped.map((r) => r.media.join(' ') + ' ' + short(r)), []);
});

test('the sky moves: both surfaces play the re-rendered reference clip, with its first frame as the poster', () => {
  const shelfSky = [...CORE.matchAll(/'<(\w+) id="gateSkyVid"[^']*'/g)];
  assert.equal(shelfSky.length, 2, 'both shelf builders emit the sky');
  for (const m of shelfSky) {
    assert.equal(m[1], 'video', 'the shelf sky is the clip');
    assert.match(m[0], /\bautoplay muted loop playsinline\b/);
    assert.match(m[0], /src="\/textures\/gate-sky-shelf\.mp4\?v=\d+"/);
    assert.match(m[0], /poster="\/textures\/gate-sky-model\.jpg\?v=\d+"/);
    assert.match(m[0], /currentTime=\(Date\.now\(\)\/1000\)%15/, 'it starts at the wall clock\'s phase');
  }
  const at = CORE.indexOf('<video class="hcard-skyclip"');
  assert.ok(at > 0, 'the archive card plays the same clip');
  const card = CORE.slice(at, CORE.indexOf('</video>', at));
  assert.match(card, /src="\/textures\/gate-sky-shelf\.mp4\?v=\d+"/);
  assert.match(card, /poster="\/textures\/gate-sky-model\.jpg\?v=\d+"/);
  assert.match(card, /currentTime=\(Date\.now\(\)\/1000\)%15/);
  for (const f of ['gate-sky-shelf.mp4', 'gate-sky-model.jpg']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', 'textures', f)), `${f} is in the repo`);
  }
});

test('no blur behind the plane: the clip is the motion-compensated re-render, and its tool and recipe are in the repo', () => {
  const tool = path.join(ROOT, 'scripts', 'heritage-sky', 'src', 'cleanplate5.swift');
  assert.ok(fs.existsSync(tool), 'cleanplate5.swift is in the repo');
  const src = fs.readFileSync(tool, 'utf8');
  assert.match(src, /TRANSPORT, per layer, from the hole's own edges/, 'the fill carries the clouds through the hole from other frames');
  assert.match(src, /LAYER MEMBERSHIP/, 'each cloud is carried at its own speed');
  const layers = /opt\("--layers"\)\?\.first \?\? "([\d,]+)"/.exec(src);
  assert.ok(layers && layers[1].split(',').length >= 4, 'several veil layers, not one speed for every row');
  assert.ok(!/pushPull/.test(src), 'no per-frame push-pull fill (the smear)');
  const recipe = fs.readFileSync(path.join(ROOT, 'scripts', 'heritage-sky', 'make-shelf-strips.sh'), 'utf8');
  assert.match(recipe, /bin\/cleanplate5" A320\.mp4 "\$O\/gate-sky-shelf\.mp4"/, 'the recipe renders the shelf clip with cleanplate5');
  // The shipped clip is the re-render: 1140x674 H.264, as the CSS expects. The width and height sit in the
  // 'tkhd' box as 16.16 fixed point; a byte search is enough here.
  const mp4 = fs.readFileSync(path.join(ROOT, 'fids-current', 'textures', 'gate-sky-shelf.mp4'));
  const tk = mp4.indexOf('tkhd');
  assert.ok(tk > 0, 'the clip has a track header');
  const w = mp4.readUInt32BE(tk + 4 + 76) >>> 16, h = mp4.readUInt32BE(tk + 4 + 80) >>> 16;
  assert.deepEqual([w, h], [1140, 674], 'the clip keeps the shelf geometry');
  assert.ok(mp4.includes(Buffer.from('avc1')), 'H.264');
});

test('no blur behind the plane: no filter or backdrop-filter blurs any layer of the scene', () => {
  // Every rule that styles a layer of either scene (or the scene box itself),
  // in any stylesheet order, @media included: none may blur it.
  const layer = /(#gateClouds(Bg|Mid|Veil|Fg)|#gateSkyVid|#gateNightSky|\.v2-rc-shelf-illus|\.hcard-(sky|skyclip|stage|l-mid|l-back|l-front))(?![\w-])/;
  const bad = [];
  for (const r of RULES) {
    for (const sel of splitList(r.sel)) {
      if (!layer.test(lastCompound(sel))) continue;
      if (/(^|;|\s)(-webkit-)?backdrop-filter\s*:\s*(?!none\b)/.test(r.body) || /(^|;|\s)filter\s*:[^;]*blur\(/.test(r.body)) {
        bad.push(short({ sel }));
      }
    }
  }
  assert.deepEqual(bad, []);
});
