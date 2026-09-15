'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE GATE WEATHER CARD ARRIVES IN ORDER (v23777).
//
// The motion asked for: the video opens on its own, then the top, then NEXT
// HOURS, then the 5-day band, then the credit.
//
// Almost everything that can go wrong here is in the TRIGGER, not the motion,
// and each hazard below cost real debugging to find, so each has a guard:
//
//   · THE CARD RE-RENDERS UNDER ITS OWN POWER. _renderWxCard has three paths —
//     a re-tint early return, a strips-only swap when late hourly/7-day data
//     lands, and a full innerHTML rebuild on any weather change — and the gate
//     rebuilds its DOM on telemetry ticks besides. An entrance keyed on the
//     wrap being fresh, or on the class being absent, replays on every one of
//     those, and the card is then seen re-assembling itself mid-slide.
//
//   · THE MIDDLE BAND HAS NO CLASS OF ITS OWN. NEXT HOURS is a bare
//     .wxc-strip, and the 5-day band carries .wxc-strip TOO. Only
//     `.wxc-strip:not(.wxcard-outlook)` names the middle band alone; a rule on
//     bare .wxc-strip hits both and collapses two stages into one.
//
//   · .wxc-globe LOOKS LIKE THE BACKGROUND AND IS NOT. It is display:none; the
//     real ground is video.wxc-vid. Animating the decoy animates nothing.
//
//   · A CARD THAT MISSES ITS TRIGGER MUST STILL BE VISIBLE. This hangs over a
//     gate. An unanimated weather card is a small disappointment; an invisible
//     one is a fault. So nothing may be hidden at rest — the only opacity:0
//     allowed is inside the keyframes, where it is reachable solely while the
//     entrance class is on the wrap.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');

// The block is appended at the foot of an append-only file, so everything from
// the comment that opens it is ours. Starting at the `/*` and not at the title
// matters: the comment-stripping below needs the opener to strip the header.
const TITLE_AT = CSS.indexOf('THE WEATHER CARD ARRIVES IN ORDER.');
const BLOCK_AT = TITLE_AT >= 0 ? CSS.lastIndexOf('/*', TITLE_AT) : -1;
const BLOCK = BLOCK_AT >= 0 ? CSS.slice(BLOCK_AT) : '';

// The five layers, in the order the owner asked for them.
const STAGES = [
  ['the video', '> video.wxc-vid'],
  ['the top', '> .wxcard-main'],
  ['NEXT HOURS', '> .wxc-strip:not(.wxcard-outlook)'],
  ['the 5-day band', '> .wxcard-outlook'],
  ['the credit', '> .wxc-credit'],
];

/** The declaration body of the one animation rule for a layer. */
function ruleFor(child) {
  const at = BLOCK.indexOf('.wxcard-wrap.wxc-entering ' + child + ' {');
  if (at < 0) return null;
  return BLOCK.slice(at, BLOCK.indexOf('}', at));
}

const seconds = v => parseFloat(v);

// The block's prose names .wxc-globe (to say it is deliberately absent) and
// .wxc-entering (to explain what drives the thing), so anything asking what
// the CSS actually TARGETS has to read the rules, not the commentary.
const RULES_ONLY = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const SELECTOR_LINES = RULES_ONLY.split('\n').filter(l => l.trim().startsWith('html body'));

// ── The stage order ──────────────────────────────────────────────────────

test('all five layers are staged, and nothing else is', () => {
  assert.ok(BLOCK, 'display-overrides.css must carry the entrance block');
  for (const [name, child] of STAGES) {
    assert.ok(ruleFor(child), `${name} (${child}) must have an entrance rule`);
  }
  // A wildcard would sweep in .wxc-globe — the display:none decoy that looks
  // like the background layer — and anything added to the card later.
  assert.ok(!/\.wxc-entering\s*>\s*\*/.test(BLOCK),
    'no wildcard child selector: every staged layer is named explicitly');
});

test('the delays run video → top → hours → 5-day → credit, ascending', () => {
  const delays = STAGES.map(([name, child]) => {
    const rule = ruleFor(child);
    const m = rule.match(/animation-delay:\s*([\d.]+)s/);
    assert.ok(m, `${name} must carry an animation-delay`);
    return [name, seconds(m[1])];
  });
  for (let i = 1; i < delays.length; i++) {
    assert.ok(delays[i][1] > delays[i - 1][1],
      `${delays[i][0]} (${delays[i][1]}s) must come AFTER ${delays[i - 1][0]} ` +
      `(${delays[i - 1][1]}s) — that order IS the thing the owner asked for`);
  }
});

test('the whole sequence finishes well inside the slide', () => {
  let last = 0;
  for (const [, child] of STAGES) {
    const body = ruleFor(child);
    const delay = seconds(body.match(/animation-delay:\s*([\d.]+)s/)[1]);
    const dur = seconds(body.match(/animation:\s*\w+\s+([\d.]+)s/)[1]);
    last = Math.max(last, delay + dur);
  }
  assert.ok(last < 2,
    `the last band must land under 2s (measured ${last.toFixed(2)}s) — the ` +
    'slide holds for 22s at minimum, but a card still assembling seconds in ' +
    'reads as a slow board rather than as an entrance');
});

// ── The two selectors that are easy to get wrong ─────────────────────────

test('the middle band is addressed as .wxc-strip:not(.wxcard-outlook)', () => {
  assert.ok(ruleFor('> .wxc-strip:not(.wxcard-outlook)'),
    'NEXT HOURS has no class of its own — this is the only selector that ' +
    'reaches it without also reaching the 5-day band');
  assert.ok(!/\.wxc-entering\s*>\s*\.wxc-strip\s*\{/.test(BLOCK),
    'a rule on bare .wxc-strip matches BOTH strips: the 5-day band carries ' +
    '.wxc-strip too, so the two stages would collapse into one');
});

test('the 5-day band is addressed as .wxcard-outlook', () => {
  assert.ok(ruleFor('> .wxcard-outlook'),
    '.wxcard-outlook is the only class unique to the 5-day band');
});

test('the display:none decoy is never animated', () => {
  assert.ok(!RULES_ONLY.includes('wxc-globe'),
    '.wxc-globe reads like the card background and is display:none — the ' +
    'real ground is video.wxc-vid. Animating the decoy animates nothing.');
  assert.ok(SELECTOR_LINES.length >= STAGES.length,
    'and the selector scan must actually be seeing the rules');
});

// ── The motion vocabulary ────────────────────────────────────────────────

test('the keyframes move transform and opacity, nothing else', () => {
  const frames = [...BLOCK.matchAll(/@keyframes\s+(\w+)\s*\{([\s\S]*?)\n\}/g)];
  assert.ok(frames.length >= 1, 'the block must declare its own keyframes');
  for (const [, name, body] of frames) {
    for (const [, prop] of body.matchAll(/([a-z-]+)\s*:/g)) {
      assert.ok(prop === 'opacity' || prop === 'transform',
        `@keyframes ${name} animates ${prop} — this file animates transform ` +
        'and opacity ONLY. Anything else either repaints every frame or, as ' +
        'measured for background-position, does nothing at all in Chrome.');
    }
  }
});

test('the four content bands share ONE keyframe', () => {
  const used = STAGES.slice(1).map(([, child]) =>
    ruleFor(child).match(/animation:\s*(\w+)/)[1]);
  assert.equal(new Set(used).size, 1,
    'the top, the hours, the 5-day band and the credit differ only by delay, ' +
    'so they take one keyframe between them rather than four near-copies');
});

test('the video gets its own opening and is not left mid-transform', () => {
  const vid = ruleFor('> video.wxc-vid');
  const vidKf = vid.match(/animation:\s*(\w+)/)[1];
  const bandKf = ruleFor('> .wxcard-main').match(/animation:\s*(\w+)/)[1];
  assert.notEqual(vidKf, bandKf,
    'the video sits inset:0 / object-fit:cover BEHIND everything, so the ' +
    "bands' small rise would slide its own cover edge into frame");
  const frame = BLOCK.match(new RegExp('@keyframes\\s+' + vidKf + '\\s*\\{([\\s\\S]*?)\\n\\}'))[1];
  assert.match(frame, /to\s*\{[^}]*transform:\s*scale\(1\)/,
    'the video must settle on scale(1): it is the layer everything else sits ' +
    'on, and a transform left part-applied shifts the whole card');
});

test('every animated layer declares will-change', () => {
  for (const [name, child] of STAGES) {
    assert.match(ruleFor(child), /will-change:\s*transform/,
      `${name} must carry will-change: transform, like every other animated ` +
      'layer in this file');
  }
});

test('a reduced-motion preference turns the whole entrance off', () => {
  const at = BLOCK.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(at >= 0,
    'every animation family in this file carries a reduced-motion block — an ' +
    'airport screen should not be the one surface that ignores the setting');
  const block = BLOCK.slice(at, BLOCK.indexOf('\n}', BLOCK.indexOf('{', at + 40)));
  for (const [name, child] of STAGES) {
    assert.ok(block.includes('.wxcard-wrap.wxc-entering ' + child),
      `${name} must be listed in the reduced-motion block`);
  }
  assert.match(block, /animation:\s*none\s*!important/);
  assert.match(block, /opacity:\s*1\s*!important/,
    'switching the animation off must also assert opacity:1 — without it a ' +
    'band whose fill-mode had already applied opacity:0 stays hidden');
});

// ── The fallback: nothing is hidden at rest ──────────────────────────────

test('nothing is left hidden if the entrance never runs', () => {
  // Strip the keyframes; opacity:0 is legitimate in there, and only in there.
  const outside = BLOCK.replace(/@keyframes[\s\S]*?\n\}/g, '');
  assert.ok(!/opacity:\s*0\s*[;!]/.test(outside),
    'no rule outside the keyframes may set opacity:0. A card that never gets ' +
    'its trigger — no JS, a dropped class — must still be fully readable: an ' +
    'invisible weather card on a public board is worse than an unanimated one.');
  assert.ok(!/visibility:\s*hidden/.test(outside) && !/display:\s*none/.test(outside),
    'and it may not be hidden by any other means either');
  // The hidden state is reachable only while the class is present, which means
  // every animation rule must be scoped to it.
  const scoped = [...BLOCK.matchAll(/\n(html body[^\n{]*)\{/g)].map(m => m[1]);
  for (const sel of scoped) {
    assert.ok(sel.includes('.wxc-entering'),
      'every rule in this block must be scoped to .wxc-entering, or its ' +
      `hidden start state outlives the entrance: ${sel.slice(-70).trim()}`);
  }
});

// ── The guard chain ──────────────────────────────────────────────────────

test('the guard chain outweighs every other rule on this card', () => {
  const weight = line => (line.match(/:not\(#_\)/g) || []).length;
  const ours = Math.min(...SELECTOR_LINES.map(weight));
  const rival = Math.max(...CSS.slice(0, BLOCK_AT).split('\n')
    .filter(l => /\.wxcard-|\.wxc-/.test(l))
    .map(weight));
  assert.ok(ours > rival,
    `the entrance chain (${ours} × :not(#_)) must outweigh the heaviest ` +
    `existing weather-card rule (${rival}) — !important does not beat ` +
    'specificity, and this file is append-only, so weight is the only lever');
});

// ── The trigger: once per arrival, and the re-renders must not re-arm ────

test('the visit counter counts arrivals, not repaints', () => {
  // Two pieces, because they sit apart in renderGateAd on purpose: the read
  // happens at the top, ahead of the ?scene= pin, and the count happens where
  // the carousel commits the slot. `pin` reproduces what the pin does between
  // them — it stamps _gateAdCurrentIdx itself.
  const read = SRC.match(/var _prevShownSlot = window\._gateAdCurrentIdx;/);
  const count = SRC.match(
    /if \(typeof _prevShownSlot !== 'number'[\s\S]*?window\._gateAdCurrentIdx = slot;/);
  assert.ok(read && count, 'renderGateAd must stamp a slide-visit counter');
  assert.ok(read.index < SRC.indexOf("new URLSearchParams(location.search).get('scene')"),
    'the read must sit AHEAD of the ?scene= pin in renderGateAd — the pin ' +
    'writes _gateAdCurrentIdx itself, so reading it afterwards makes a pinned ' +
    "board's first paint look like a repaint and the entrance never plays");
  const show = new Function('window', 'slot', 'pin',
    read[0] + '\nif (pin) window._gateAdCurrentIdx = slot;\n' + count[0]);
  const w = {};

  show(w, 3);                                   // first paint of the session
  assert.equal(w._gateAdVisitSeq, 1, 'the first paint is an arrival');

  show(w, 3);                                   // gate rebuild, same slide
  show(w, 3);
  assert.equal(w._gateAdVisitSeq, 1,
    'a repaint of the slide already showing is NOT an arrival — the gate ' +
    'rebuilds several times a minute and every one of those would replay');

  w._gateAdAuthChange = true; show(w, 4); w._gateAdAuthChange = false;
  assert.equal(w._gateAdVisitSeq, 2, 'the rotation tick moving on is an arrival');

  w._gateAdAuthChange = true; show(w, 4); w._gateAdAuthChange = false;
  assert.equal(w._gateAdVisitSeq, 2,
    'an authorised repaint of the SAME slot is still not an arrival');

  show(w, 9);                                   // stray unauthorised caller
  assert.equal(w._gateAdVisitSeq, 2,
    'only the rotation tick and the pin recovery may declare a slide change');

  // ?scene=wx parks the carousel on the weather card so it can be looked at
  // without waiting for the rotation. The pin stamps _gateAdCurrentIdx before
  // the count, so reading the previous slot LATE made a pinned board's first
  // paint indistinguishable from a repaint — and the one scene anybody pins is
  // this one.
  const p = {};
  show(p, 6, true);
  assert.equal(p._gateAdVisitSeq, 1,
    'a pinned first paint is still an arrival');
  show(p, 6, true);
  show(p, 6, true);
  assert.equal(p._gateAdVisitSeq, 1,
    'and a parked scene does not re-arrive on every repaint');
});

test('the entrance plays once per arrival and no re-render re-arms it', () => {
  const fnSrc = SRC.match(/function _wxArmEntrance\(wrap\) \{[\s\S]*?\n\}/);
  assert.ok(fnSrc, 'fids-core.js must define _wxArmEntrance');
  const msSrc = SRC.match(/var _WXC_ENTRANCE_MS = (\d+);/);
  assert.ok(msSrc, 'the entrance duration must be declared as a constant');

  // Both the visit counter and the played-marker live on `window`, precisely so
  // a gate rebuild — which throws the carousel ELEMENT away — cannot reset
  // either. The harness therefore holds one window across the whole slide.
  const w = { _gateAdVisitSeq: 1 };
  const timers = [];
  const armOn = new Function('window', 'setTimeout', 'clearTimeout', '_WXC_ENTRANCE_MS',
    fnSrc[0] + '\nreturn _wxArmEntrance;')(
    w, fn => (timers.push(fn), timers.length), () => {}, Number(msSrc[1]));
  const wrap = () => {
    const c = new Set();
    return { c, classList: { add: x => c.add(x), remove: x => c.delete(x), contains: x => c.has(x) } };
  };

  const first = wrap();
  assert.equal(armOn(first), true, 'the card arriving must play the entrance');
  assert.ok(first.c.has('wxc-entering'), 'and mark the wrap');

  // Re-render path 2: late 7-day data swaps the strips under the same hero.
  assert.equal(armOn(first), false, 'a strips-only refresh must NOT re-arm');
  // Re-render path 1: a re-tint only.
  assert.equal(armOn(first), false, 'a re-tint must NOT re-arm');
  // Re-render path 3 on the SAME visit: a plain weather-content change rebuilds
  // the wrap from scratch. Freshness of the wrap must not count as an arrival.
  const rebuilt = wrap();
  assert.equal(armOn(rebuilt), false,
    'a full rebuild mid-slide must NOT re-arm — path 3 reinserts the wrap for ' +
    'any weather change, so "the wrap is new" is not "the card arrived"');
  assert.ok(!rebuilt.c.has('wxc-entering'),
    'and the rebuilt card is therefore left plain — which is exactly why ' +
    'nothing may be hidden at rest');

  // The sequence ends: the class comes off, so a LATE strips-only refresh
  // cannot replay those two bands minutes into the slide.
  timers.forEach(fn => fn());
  assert.ok(!first.c.has('wxc-entering'), 'the class is stripped when it is over');
  assert.equal(armOn(first), false, 'and stripping it does not re-arm anything');

  // The slide genuinely leaves and comes back.
  w._gateAdVisitSeq = 2;
  const second = wrap();
  assert.equal(armOn(second), true, 'the next arrival plays it again');
});

test('all three render paths ask, and none of them clears the marker', () => {
  const calls = (SRC.match(/_wxArmEntrance\(/g) || []).length;
  assert.equal(calls, 4,
    'one definition plus exactly three call sites — one per render path, so ' +
    'no path has to reason about the rule on its own');

  // The strips-only path is the one that fires often enough to matter.
  const p2 = SRC.slice(
    SRC.indexOf("_wxWrapP.querySelectorAll(':scope > .wxc-strip')"),
    SRC.indexOf('_wxArmEntrance(_wxWrapP);') + 30);
  assert.ok(p2.length > 40 && p2.length < 2000, 'the strips-only path must be locatable');
  assert.ok(!/_wxEntrancePlayedSeq|_gateAdVisitSeq/.test(p2),
    'the strips-only path must not touch the visit counter or the played ' +
    'marker — clearing either is the same bug as keying on freshness');
});

test('the class the JS sets is the class the CSS animates', () => {
  assert.match(SRC, /classList\.add\('wxc-entering'\)/,
    'fids-core.js must mark the wrap with the class display-overrides selects');
  assert.match(SRC, /classList\.remove\('wxc-entering'\)/,
    'and must take it off again when the sequence is over');
});
