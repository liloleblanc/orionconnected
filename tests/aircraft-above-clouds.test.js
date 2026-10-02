'use strict';

// WHY THIS EXISTS
//
// The aircraft drawings are opaque, but on the gate shelf and the archive card
// the nearest cloud layer was painted OVER every aircraft: #gateCloudsFg (and
// the card's .hcard-l-front) is z-index 3 and comes after the aircraft in the
// markup, while the aircraft was z-index 1 by day and 3 at night. Equal
// z-index is settled by document order, so the clouds won. Over colour the
// white cloud reads as sky showing through the paint, which is how an opaque
// drawing came to look see-through.
//
// The rule since v23928: clouds go BEHIND the aircraft, never through it. The
// fix lifts the aircraft (and the carrier mark that holds its place) above
// every sky layer and changes nothing about the clouds themselves.
//
// Nothing here can render a board, so these tests run the part of the cascade
// that decides the order: every rule in the gate's two shelf stylesheets that
// sets z-index on one of these elements, the winner picked by !important,
// specificity and source order, with the body's sky classes for day and night.
// A rule that only applies to one carrier, one facing or one layout is counted
// as applying, which is the strict reading: no such rule may put a cloud over
// the aircraft either.
//
// Measured with headless Chrome at 1680x1050 before the fix, over the front
// layer's 6 s loop: it repainted about 11% of the airframe on average, up to
// about 22% (PAL Dash 8-300 at YQM gate 2, Rouge A319 at gate 4, Porter's
// Dash 8-400 at gate 3, the archive card's BAe 146), by day and at night.
// After it: 0.0% at every phase (bar the anti-aliased rim), and the sky away
// from the aircraft unchanged.

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

/**
 * The winning declaration of `prop` for an element whose own compound is
 * `target` inside `scope` (a class the selector must name), with these body
 * classes. `star` also counts `scope > *`.
 */
function cascade(prop, target, scope, classes, star) {
  const hits = [];
  for (const r of RULES) {
    if (r.media.length) continue; // checked separately below
    const re = new RegExp('(?:^|;|\\s)' + prop + '\\s*:\\s*([^;]+?)\\s*(!important)?\\s*(?:;|$)', 'g');
    const decls = [...r.body.matchAll(re)];
    if (!decls.length) continue;
    const d = decls[decls.length - 1];
    for (const sel of splitList(r.sel)) {
      const last = lastCompound(sel);
      const own = last === target || last.startsWith(target + ':') && !last.includes('::')
        || (star && last === '*');
      if (!own || last.includes('::')) continue;
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
const short = (w) => (w ? w.sel.replace(/(?::not\(#_\))+/g, (m) => `:not(#_)x${m.length / 8}`).slice(0, 140) : '(none)');

const DAY = ['gate-acsky'];
const NIGHT = ['gate-acsky', 'gate-acsky-night'];
const SHELF = 'v2-rc-shelf-illus';
const SKY = ['#gateCloudsBg', '#gateSkyVid', '#gateCloudsMid', '#gateCloudsVeil', '#gateCloudsFg', '#gateFgVid', '#gateNightSky'];

test('the gate shelf: the aircraft is above every cloud layer, by day and at night', () => {
  for (const [label, classes] of [['day', DAY], ['night', NIGHT]]) {
    const air = zOf('.v2-rc-aircraft-img', SHELF, classes, true);
    assert.ok(air.w && air.w.imp, `${label}: the aircraft's z-index is set with !important`);
    for (const id of SKY) {
      const layer = zOf(id, SHELF, classes, true);
      assert.ok(air.z > layer.z,
        `${label}: aircraft z ${air.z} (${short(air.w)}) must be above ${id} z ${layer.z} (${short(layer.w)})`);
    }
    // The caption stays over the aircraft, as it was.
    const cap = zOf('.v2-rc-acb-cap', SHELF, classes, true);
    assert.ok(cap.z > air.z, `${label}: the caption (z ${cap.z}) stays above the aircraft (z ${air.z})`);
  }
});

test('the gate shelf: the carrier mark that holds the aircraft\'s place is above the clouds too', () => {
  for (const [label, classes] of [['day', DAY], ['night', NIGHT]]) {
    const hold = zOf('.v2-rc-aircraft-hold', SHELF, classes, true);
    for (const id of SKY) {
      const layer = zOf(id, SHELF, classes, true);
      assert.ok(hold.z > layer.z, `${label}: hold mark z ${hold.z} must be above ${id} z ${layer.z} (${short(layer.w)})`);
    }
  }
});

test('the archive card: the aeroplane is above every cloud layer', () => {
  const plane = zOf('.hcard-float', 'hcard-sky', [], false);
  assert.ok(plane.w && plane.w.imp, 'the aeroplane\'s z-index is set with !important');
  for (const layer of ['.hcard-l-mid', '.hcard-l-back', '.hcard-l-front']) {
    const l = zOf(layer, 'hcard-sky', [], false);
    assert.ok(plane.z > l.z, `aeroplane z ${plane.z} (${short(plane.w)}) must be above ${layer} z ${l.z} (${short(l.w)})`);
  }
});

test('no @media rule puts a cloud layer over the aircraft', () => {
  const names = /#gateClouds|#gateSkyVid|#gateFgVid|#gateNightSky|\.v2-rc-aircraft-(img|hold)\b|\.hcard-(float|l-)/;
  const scoped = RULES.filter((r) => r.media.length && names.test(r.sel) && /(^|;|\s)z-index\s*:/.test(r.body));
  assert.deepEqual(scoped.map((r) => r.media.join(' ') + ' ' + short(r)), []);
});

test('the clouds themselves are untouched: still in the scene, still in their order, the fix sets only z-index', () => {
  // Every shelf builder still emits the front layer, after the aircraft or its
  // hold mark, and the card builder still emits its front layer after the plane.
  const fg = [...CORE.matchAll(/'<div id="gateCloudsFg" aria-hidden="true"><\/div>'/g)].map((m) => m.index);
  assert.equal(fg.length, 2, 'both shelf builders keep the front clouds');
  for (const at of fg) {
    const before = CORE.slice(Math.max(0, at - 1200), at);
    assert.match(before, /<i id="gateCloudsVeil"/);
    assert.match(before, /v2-rc-aircraft-img|_aircraftHoldHtml|_fallbackHold/);
  }
  const card = CORE.indexOf('<i class="hcard-l-front"></i>');
  assert.ok(card > 0 && CORE.lastIndexOf('hcard-float', card) > CORE.lastIndexOf('hcard-l-back', card),
    'the card keeps far, back, the aeroplane, then front');
  // Depth among the clouds is kept: the front layer is still the nearest of them.
  for (const [label, classes] of [['day', DAY], ['night', NIGHT]]) {
    const front = zOf('#gateCloudsFg', SHELF, classes, true).z;
    for (const id of ['#gateCloudsBg', '#gateSkyVid', '#gateCloudsMid', '#gateCloudsVeil']) {
      assert.ok(front > zOf(id, SHELF, classes, true).z, `${label}: #gateCloudsFg stays nearer than ${id}`);
    }
    assert.ok(parseFloat(cascade('opacity', '#gateCloudsFg', SHELF, classes, false).value) > 0, `${label}: front clouds still visible`);
  }
  assert.ok(zOf('.hcard-l-front', 'hcard-sky', [], false).z > zOf('.hcard-l-back', 'hcard-sky', [], false).z);

  // The v23928 block's own rules (the ones straight after its header) set
  // z-index and nothing else.
  const head = CSS.indexOf('v23928 — THE CLOUDS PASS BEHIND THE AIRCRAFT');
  assert.ok(head > 0, 'the v23928 block is present');
  const own = [];
  for (const r of rulesOf(CSS.slice(CSS.indexOf('*/', head) + 2), 0)) {
    if (!/\.v2-rc-aircraft-(img|hold)|\.hcard-float/.test(r.sel)) break;
    own.push(r);
  }
  assert.equal(own.length, 2, 'the shelf rule and the card rule');
  for (const r of own) {
    const props = r.body.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean);
    assert.deepEqual(props, ['z-index'], short(r));
  }
});
