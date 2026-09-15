'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE GATE WEATHER CARD ARRIVES IN ORDER (v23777, corrected v23778).
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
//   · THE GATE REBUILD RESTARTS CSS ANIMATIONS WITHOUT RE-ENTERING ANY JS. It
//     detaches the live carousel and re-attaches it, children and all; a
//     re-inserted node starts its animations again, while the JS deadline that
//     was going to end the sequence does not move. So DOM churn during the
//     window has to ABANDON the entrance, not restart it.
//
//   · AN ANIMATION CANNOT OUTRANK `!important`. The MET credit already carries
//     two `opacity: 1 !important` pins, and important author declarations beat
//     the animation origin outright — no guard chain helps. That layer's fade
//     has to ride a registered custom property instead.
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
const TITLE_AT = CSS.indexOf('THE WEATHER CARD ARRIVES IN ORDER');
const BLOCK_AT = TITLE_AT >= 0 ? CSS.lastIndexOf('/*', TITLE_AT) : -1;
const BLOCK = BLOCK_AT >= 0 ? CSS.slice(BLOCK_AT) : '';

// The five layers, in the order the owner asked for them. Third column is the
// class the cascade scan has to look for, which is not always the whole
// selector: NEXT HOURS is reached by `.wxc-strip:not(...)` but any rival rule
// pinning it would name `.wxc-strip`.
const STAGES = [
  ['the video', '> video.wxc-vid', '.wxc-vid'],
  ['the top', '> .wxcard-main', '.wxcard-main'],
  ['NEXT HOURS', '> .wxc-strip:not(.wxcard-outlook)', '.wxc-strip'],
  ['the 5-day band', '> .wxcard-outlook', '.wxcard-outlook'],
  ['the credit', '> .wxc-credit', '.wxc-credit'],
];

/** The declaration body of the one animation rule for a layer. */
function ruleFor(child) {
  const at = BLOCK.indexOf('.wxcard-wrap.wxc-entering ' + child + ' {');
  if (at < 0) return null;
  return BLOCK.slice(at, BLOCK.indexOf('}', at));
}

/** The body of a named @keyframes inside our block. */
function keyframe(name) {
  const m = BLOCK.match(new RegExp('@keyframes\\s+' + name + '\\s*\\{([\\s\\S]*?)\\n\\}'));
  return m ? m[1] : null;
}

const seconds = v => parseFloat(v);
const animOf = child => ruleFor(child).match(/animation:\s*([\w-]+)/)[1];
// v23781 — every timing is now calc(<base>s * var(--wxc-t, 1)), so the dial can
// stretch the whole sequence from the URL without the shape changing. These
// read the BASE, which is what every assertion here is about: the dial only
// scales, and its own clamp is tested separately.
const TIME = '(?:([\\d.]+)s|calc\\(\\s*([\\d.]+)s\\s*\\*\\s*var\\(--wxc-t[^)]*\\)\\s*\\))';
const pick = m => seconds(m[1] !== undefined ? m[1] : m[2]);
const delayOf = child => pick(ruleFor(child).match(new RegExp('animation-delay:\\s*' + TIME)));
const durOf = child => pick(ruleFor(child).match(new RegExp('animation:\\s*[\\w-]+\\s+' + TIME)));

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
    const m = rule.match(new RegExp('animation-delay:\\s*' + TIME));
    assert.ok(m, `${name} must carry an animation-delay`);
    return [name, pick(m)];
  });
  for (let i = 1; i < delays.length; i++) {
    assert.ok(delays[i][1] > delays[i - 1][1],
      `${delays[i][0]} (${delays[i][1]}s) must come AFTER ${delays[i - 1][0]} ` +
      `(${delays[i - 1][1]}s) — that order IS the thing the owner asked for`);
  }
});

test('the scene is held alone, and no band ever overlaps another', () => {
  // This is the fault that was reported twice — "it flies", "better but too
  // fast" — and both times the cause was the same: bands running into each
  // other, and the scene given a fraction of a second to itself before the
  // hero landed on it. It is not a matter of taste that can be nudged later;
  // it is the whole of what was asked for, so it is pinned as arithmetic.
  const order = ['> video.wxc-vid', '> .wxcard-main',
    '> .wxc-strip:not(.wxcard-outlook)', '> .wxcard-outlook', '> .wxc-credit'];
  const start = c => delayOf(c);
  const end = c => delayOf(c) + durOf(c);

  // The scene finishes, and is then alone for a real beat before anything
  // else begins. Under half a second is not a hold, it is a gap.
  const hold = start(order[1]) - end(order[0]);
  assert.ok(hold >= 0.6,
    `the scene is left alone for ${hold.toFixed(2)}s before the top block ` +
    'arrives — the request was that the scene be SEEN first, and under 0.6s ' +
    'it reads as the next thing landing on top of it rather than as a beat');

  // And from there each band waits for the one before it to finish.
  for (let i = 1; i < order.length - 1; i++) {
    const gap = start(order[i + 1]) - end(order[i]);
    assert.ok(gap >= 0,
      `${order[i + 1]} starts ${(-gap).toFixed(2)}s BEFORE ${order[i]} has ` +
      'finished — one row at a time means one at a time');
  }
});

test('the whole sequence finishes well inside the slide', () => {
  let last = 0;
  for (const [, child] of STAGES) last = Math.max(last, delayOf(child) + durOf(child));
  // The first cut held this under 2s and the owner rejected the result: every
  // band overlapped the one before it and the scene got 0.23s to itself. The
  // ask is the opposite — the scene SEEN, then filled one row at a time,
  // settling. That costs seconds, and they are well spent against a 22s floor;
  // what still matters is that the card spends most of its slide STILL.
  // Two cuts were rejected for being hurried before this one: 1.9s read as a
  // flurry, 5.7s as "better but too fast". The ask is a majestic arrival, so
  // the sequence is long on purpose and the pauses between bands carry as much
  // of it as the movement. What still has to hold is that the card spends most
  // of its turn STILL — the slide's floor is 22s.
  // Four cuts were rejected as hurried: 1.9s, 5.7s, 9.3s. The bound that
  // matters is not a fixed number of seconds — it is that the card is STILL
  // for longer than it spends arriving, which is what makes it readable. The
  // dwell was raised with the sequence for exactly that reason, so the two are
  // checked against each other rather than against a guess.
  const dwellSrc = SRC.match(/slide\.type === 'wxcard'\) return Math\.round\((\d+) \* _wxSpeed\(\)\)/);
  assert.ok(dwellSrc, "this card's dwell must be its own, and scale with the dial");
  const dwell = Number(dwellSrc[1]) / 1000;
  assert.ok(last < dwell / 2,
    `the arrival runs ${last.toFixed(2)}s against a ${dwell}s dwell — the card ` +
    'must be at rest for longer than it spends arriving, or it cannot be read');
  assert.ok(last > 7,
    `the last band lands at ${last.toFixed(2)}s — under 7s is pacing that was ` +
    'rejected as too fast; this entrance is meant to be unhurried');
});

test('the video opens in the clear, not under the outgoing slide', () => {
  // THE BUG THIS REPLACES. The first cut opened the video at 0.30s and the
  // note called that "a mostly-clear frame". On a real slide change the
  // carousel lifts the OUTGOING slide into an overlay and dissolves it over
  // this card, and the dissolve is kicked off in the same task as the render —
  // so both clocks start together and at 0.30s the panel was still 79% the
  // previous slide. The beat the owner named FIRST had no visible window at
  // all. The two timings live in different files, so only a test that reads
  // both can keep them honest.
  // Anchored on the dissolving overlay itself — `data-ad-fading` is the mark
  // the tick puts on the lifted copy of the outgoing slide. There are other
  // eased opacity transitions in this file and none of them is this one.
  const overlay = SRC.indexOf("_old.setAttribute('data-ad-fading', '1');");
  assert.ok(overlay >= 0, 'the carousel must still dissolve the outgoing slide ' +
    'by lifting it into a marked overlay');
  const cf = SRC.slice(overlay, overlay + 900).match(/transition:opacity ([\d.]+)s ease-in-out/);
  assert.ok(cf, 'the carousel crossfade must still be a plain eased opacity ' +
    'transition — if it is not, the arithmetic below no longer describes it');
  const span = seconds(cf[1]);

  // cubic-bezier(.42, 0, .58, 1) — the CSS `ease-in-out` keyword.
  const bx = t => 3 * (1 - t) ** 2 * t * 0.42 + 3 * (1 - t) * t * t * 0.58 + t ** 3;
  const by = t => 3 * (1 - t) * t * t * 1 + t ** 3;
  const cover = s => {
    const x = Math.min(1, s / span);
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; bx(m) < x ? lo = m : hi = m; }
    return 1 - by((lo + hi) / 2);
  };

  const opens = delayOf('> video.wxc-vid');
  assert.ok(cover(opens) < 0.15,
    `the video opens at ${opens}s, when the outgoing slide still covers ` +
    `${(cover(opens) * 100).toFixed(0)}% of the panel — "the video opens first ` +
    'on its own" has to mean the viewer can see it happen');
  // And the lead-in must not be padded past the point of usefulness either:
  // every 0.1s of it is 0.1s added to the tail.
  assert.ok(opens < span,
    'the lead-in must not wait out the whole crossfade — the cover is ' +
    'already under a tenth well before it ends, and the credit pays for it');
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
  const frames = [...BLOCK.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
  assert.ok(frames.length >= 1, 'the block must declare its own keyframes');
  for (const [, name, body] of frames) {
    for (const [, prop] of body.matchAll(/(--[a-z-]+|[a-z-]+)\s*:/g)) {
      assert.ok(prop === 'opacity' || prop === 'transform' || prop === '--wxc-fade',
        `@keyframes ${name} animates ${prop} — this file animates transform ` +
        'and opacity ONLY. Anything else either repaints every frame or, as ' +
        'measured for background-position, does nothing at all in Chrome. ' +
        '(--wxc-fade is the one exception and it IS an opacity: see the ' +
        'credit rule, where the cascade will not let a keyframe set opacity.)');
    }
  }
});

test('the travel is a settle, not a slide', () => {
  // The wrap is overflow:hidden with as little as 8px of vertical padding, so
  // a large translate starts the last band clipped against the foot of the
  // card rather than rising into place.
  const travels = [...BLOCK.matchAll(/translate3d\(0,\s*(-?[\d.]+)px,\s*0\)/g)]
    .map(m => Math.abs(parseFloat(m[1])));
  assert.ok(travels.length >= 1, 'the content bands must rise into place');
  // 26px, paired with a scale that starts slightly OVER and settles back. The
  // scale is what makes the larger rise safe: the band over-covers its box on
  // the way in rather than leaving a gap at the edge, which is what a bare
  // 26px translate on a clipped wrap would show.
  assert.ok(Math.max(...travels) <= 28,
    `the rise is ${Math.max(...travels)}px — the wrap clips its overflow and ` +
    'carries as little as 8px of bottom padding, so past roughly 28px the ' +
    'credit is drawn half-cut against the card edge on its way in');
  assert.match(BLOCK, /translate3d\(0, 26px, 0\) scale\(1\.03\)/,
    'the rise must travel with the scale that covers for it');
});

test('every stage fills BOTH ways', () => {
  // `both` is what holds a layer at the keyframe's opacity:0 THROUGH its
  // delay. With `forwards`, or with no fill at all, each layer would be fully
  // visible until its turn came, blink to nothing, and fade back in — five
  // flashes instead of an entrance, and the whole "nothing is hidden at rest"
  // argument depends on the hidden state being the fill rather than a rule.
  for (const [name, child] of STAGES) {
    assert.match(ruleFor(child), /animation:[^;]*\bboth\b/,
      `${name} must end its animation shorthand in \`both\``);
  }
});

test('three bands share ONE keyframe, and the two that cannot say why', () => {
  const shared = ['> .wxcard-main', '> .wxc-strip:not(.wxcard-outlook)', '> .wxcard-outlook']
    .map(animOf);
  assert.equal(new Set(shared).size, 1,
    'the top, the hours and the 5-day band differ only by delay, so they ' +
    'take one keyframe between them rather than three near-copies');
  assert.notEqual(animOf('> video.wxc-vid'), shared[0],
    'the video sits inset:0 / object-fit:cover BEHIND everything, so the ' +
    "bands' small rise would slide its own cover edge into frame");
  assert.notEqual(animOf('> .wxc-credit'), shared[0],
    'the credit cannot share either — its opacity is pinned !important ' +
    'elsewhere in the file, so its fade has to ride a custom property');
});

test('the video gets its own opening and is not left mid-transform', () => {
  const frame = keyframe(animOf('> video.wxc-vid'));
  assert.ok(frame, 'the video keyframe must exist');
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
  assert.match(block, /--wxc-fade:\s*1\s*!important/,
    'and it must assert the custom property too: the credit reads its ' +
    'opacity FROM --wxc-fade, so an opacity:1 that resolves through a stale ' +
    'property restores every layer except the one that needed it most');
});

// ── The cascade: an animation cannot beat !important ─────────────────────

/** Does any rule earlier in the file pin this layer's opacity !important? */
function pinsOpacity(cls) {
  const before = CSS.slice(0, BLOCK_AT).replace(/\/\*[\s\S]*?\*\//g, '');
  const hits = [];
  for (const chunk of before.split('}')) {
    const brace = chunk.lastIndexOf('{');
    if (brace < 0) continue;
    const body = chunk.slice(brace + 1);
    if (!/opacity\s*:\s*[^;]*!important/.test(body)) continue;
    const sel = chunk.slice(0, brace).replace(/:not\(#_\)/g, '');
    for (const one of sel.split(',')) {
      // `.wxc-credit` and `.wxc-credit *` both reach the element.
      if (one.trim().replace(/\s*\*$/, '').endsWith(cls)) { hits.push(one.trim()); break; }
    }
  }
  return hits;
}

test('a layer whose opacity is pinned !important fades by custom property', () => {
  // THE BUG THIS REPLACES, AND THE ONE A SPECIFICITY TEST CANNOT SEE.
  // Two rules already pin `.wxc-credit { opacity: 1 !important }` — the
  // readability fix and the foot-of-card layout rule. Important author
  // declarations outrank the ANIMATION origin (Cascading L4 §6.1), so a
  // keyframe's opacity is discarded for that element no matter how heavy the
  // guard chain is: 241 × :not(#_) against their 48 loses, because the loss is
  // by origin and not by specificity. The first cut animated the credit anyway
  // and only its translate applied, so the MET line sat fully opaque from
  // frame 0 — the last beat of the sequence was the first thing on screen.
  //
  // The file is append-only, so the pins cannot be removed. The fade is
  // re-declared at !important level instead and reads an animated registered
  // custom property. This test decides, per layer, which mechanism is the
  // correct one — so a layer that acquires a pin later fails here instead of
  // silently losing its stage.
  const pinned = STAGES.filter(([, , cls]) => pinsOpacity(cls).length > 0).map(s => s[0]);
  assert.deepEqual(pinned, ['the credit'],
    'the credit is the known case; any OTHER layer turning up here means a ' +
    'new !important opacity landed on it and its stage has silently stopped ' +
    `fading (found: ${pinned.join(', ') || 'none'})`);

  for (const [name, child, cls] of STAGES) {
    const rule = ruleFor(child);
    const frame = keyframe(animOf(child));
    if (pinsOpacity(cls).length > 0) {
      assert.match(rule, /opacity:\s*var\(--wxc-fade/,
        `${name} is pinned opacity:1 !important elsewhere, so its entrance ` +
        'rule must re-declare opacity at !important level reading --wxc-fade');
      assert.match(rule, /opacity:\s*var\(--wxc-fade[^;]*!important/,
        `${name}'s re-declaration must itself be !important, or it loses to ` +
        'the very pins it exists to outrank');
      assert.match(frame, /--wxc-fade:\s*0[\s;]/,
        `${name}'s keyframe must animate --wxc-fade from 0`);
      assert.ok(!/opacity:\s*0/.test(frame),
        `${name}'s keyframe must NOT try to animate opacity directly — that ` +
        'is the declaration the cascade throws away, and leaving it in reads ' +
        'as though the fade were working');
    } else {
      assert.match(frame, /opacity:\s*0/,
        `${name} has no !important pin against it, so it fades the ordinary ` +
        'way, from the keyframe');
      assert.ok(!/opacity:/.test(rule),
        `${name} must leave opacity to its keyframe — a rule-level opacity ` +
        'would override the animation it is meant to let through');
    }
  }
});

test('the fade property is registered so it interpolates', () => {
  const at = BLOCK.indexOf('@property --wxc-fade');
  assert.ok(at >= 0,
    'an UNREGISTERED custom property animates discretely — --wxc-fade would ' +
    'flip from 0 to 1 at the halfway mark and the credit would blink rather ' +
    'than fade');
  const body = BLOCK.slice(at, BLOCK.indexOf('}', at));
  assert.match(body, /syntax:\s*'<number>'/,
    "syntax must be '<number>' for the value to interpolate at all");
  assert.match(body, /initial-value:\s*1/,
    'the initial value must be 1: it is what a credit that never enters — no ' +
    'JS, a dropped class — resolves to, and this card hangs over a gate');
  assert.match(ruleFor('> .wxc-credit'), /var\(--wxc-fade,\s*1\)/,
    'and the var() needs its own fallback of 1 for a browser with no ' +
    '@property support, where the registration is ignored entirely');
});

// ── The fallback: nothing is hidden at rest ──────────────────────────────

test('nothing is left hidden if the entrance never runs', () => {
  // Strip the keyframes; opacity:0 is legitimate in there, and only in there.
  const outside = BLOCK.replace(/@keyframes[\s\S]*?\n\}/g, '');
  assert.ok(!/opacity:\s*0\s*[;!]/.test(outside),
    'no rule outside the keyframes may set opacity:0. A card that never gets ' +
    'its trigger — no JS, a dropped class — must still be fully readable: an ' +
    'invisible weather card on a public board is worse than an unanimated one.');
  assert.ok(!/--wxc-fade:\s*0\s*[;!]/.test(outside),
    'and the same goes for the property the credit\'s opacity now reads — ' +
    'setting it to 0 anywhere but a keyframe hides the attribution for good');
  assert.ok(!/visibility:\s*hidden/.test(outside) && !/display:\s*none/.test(outside),
    'and it may not be hidden by any other means either');
  // The hidden state is reachable only while the class is present, which means
  // every animation rule must be scoped to it.
  const scoped = [...BLOCK.matchAll(/\n(html body[^\n{]*)\{/g)].map(m => m[1]);
  for (const sel of scoped) {
    assert.ok(sel.includes('.wxc-entering') || sel.includes('.wxc-leaving'),
      'every rule in this block must be scoped to .wxc-entering or ' +
      '.wxc-leaving, or its hidden state outlives the animation: ' +
      `${sel.slice(-70).trim()}`);
  }
});

test('the exit can only ever hide a copy that is on its way out', () => {
  // The exit keyframes END at opacity 0 with fill `both`, which is the one
  // place in this family where a stuck class WOULD leave something invisible.
  // It is safe only because .wxc-leaving is never put on the live card: the
  // carousel first MOVES the outgoing slide's DOM into a throwaway overlay,
  // and the class goes on the copy inside it. That copy is removed on a timer
  // whatever happens. Both halves of that are load-bearing, so both are pinned.
  const lift = SRC.indexOf('while (el3.firstChild) _old.appendChild(el3.firstChild);');
  assert.ok(lift >= 0, 'the carousel must still lift the outgoing slide into an overlay');
  const after = SRC.slice(lift, lift + 1400);
  assert.match(after, /_old\.querySelector\('\.wxcard-wrap'\)/,
    'the mark must be decided from the lifted COPY, never from the live carousel');
  assert.match(after, /_wxLeaveWrap\.classList\.add\('wxc-leaving'\)/);
  assert.match(after, /_wxLeaveWrap\.classList\.remove\('wxc-entering'\)/,
    'and an entrance still running on that copy has to be called off, or the ' +
    'two sequences fight over the same layers');
  // The copy is always removed — no path leaves it on screen at opacity 0.
  const fade = SRC.indexOf("if (_old.getAttribute('data-wx-leaving'))");
  assert.ok(fade >= 0, 'the dissolve must special-case the marked copy');
  const tail = SRC.slice(fade, fade + 700);
  assert.match(tail, /_old\.remove\(\)/, 'and must still remove it');
  assert.match(tail, /Math\.round\(_WXC_EXIT_MS \* _wxSpeed\(\)\) \+ 120/,
    'on a deadline past the end of the sequence — and scaled by the dial, or ' +
    'a slowed exit would have its cover pulled part-way through');
  const ms = /var _WXC_EXIT_MS = (\d+);/.exec(SRC);
  assert.ok(ms, '_WXC_EXIT_MS must be declared');
  const last = Math.max(...[...BLOCK.matchAll(/wxc-leaving[^{]*\{[^}]*?animation: wxcLeave\w* ([\d.]+)s[^}]*?animation-delay: ([\d.]+)s/gs)]
    .map(m => parseFloat(m[1]) + parseFloat(m[2])));
  assert.ok(Number(ms[1]) / 1000 >= last,
    `the cover is pulled at ${Number(ms[1]) / 1000}s but the exit runs to ${last}s`);
});

// ── The guard chain ──────────────────────────────────────────────────────

test('the guard chain outweighs every other rule on this card', () => {
  // Counted PER SELECTOR, not per line. The earlier version summed each whole
  // line, and a comma-joined line of five 48-chain selectors totalled 240
  // against our 241 — so the assertion passed by one, on a number that was
  // not a specificity at all. Any future comma-joined line would have failed
  // it spuriously, and a genuine collapse of our chain to 60 — still well
  // clear of every real rival — would have failed it too.
  const weight = sel => (sel.match(/:not\(#_\)/g) || []).length;
  // Comma-split leaves an empty tail on every line that ends in a comma, which
  // is most of the reduced-motion group — those are not selectors.
  const parts = s => s.split(',').map(x => x.trim()).filter(Boolean);
  const ours = Math.min(...SELECTOR_LINES.flatMap(l => parts(l).map(weight)));
  let rival = 0;
  for (const line of CSS.slice(0, BLOCK_AT).split('\n')) {
    if (!/\.wxcard-|\.wxc-/.test(line)) continue;
    for (const sel of parts(line)) rival = Math.max(rival, weight(sel));
  }
  assert.ok(ours > rival,
    `the entrance chain (${ours} × :not(#_) per selector) must outweigh the ` +
    `heaviest existing weather-card selector (${rival}) — this file is ` +
    'append-only, so weight is the only lever against an earlier rule');
  // …and specificity is only a lever against NORMAL declarations. The check
  // that matters for !important ones is the cascade test above.
});

// ── The trigger: once per arrival, and the re-renders must not re-arm ────

test('the visit counter counts arrivals, not repaints', () => {
  // Three pieces, because they sit apart in renderGateAd on purpose: the read
  // happens at the top, ahead of the ?scene= pin; the pin stamps the slot
  // itself in between; the count happens where the carousel commits the slot.
  const read = SRC.match(/var _prevShownSlot = window\._gateAdCurrentIdx;/);
  const pinBump = SRC.match(
    /if \(window\._gateAdAuthChange\) \{\s*window\._gateAdVisitSeq = \(window\._gateAdVisitSeq \|\| 0\) \+ 1;\s*\}/);
  const count = SRC.match(
    /if \(typeof _prevShownSlot !== 'number'[\s\S]*?window\._gateAdCurrentIdx = slot;/);
  assert.ok(read && count, 'renderGateAd must stamp a slide-visit counter');
  assert.ok(read.index < SRC.indexOf("new URLSearchParams(location.search).get('scene')"),
    'the read must sit AHEAD of the ?scene= pin in renderGateAd — the pin ' +
    'writes _gateAdCurrentIdx itself, so reading it afterwards makes a pinned ' +
    "board's first paint look like a repaint and the entrance never plays");
  assert.ok(pinBump, 'the pin must re-arm on an authorised tick');
  assert.ok(pinBump.index > SRC.indexOf("new URLSearchParams(location.search).get('scene')")
    && pinBump.index < SRC.indexOf('var slide = slides[slot];'),
    'the pin re-arm must live INSIDE the scene-pin block — ?scene= is a ' +
    'review aid and must stay wholly inert on a deployed board');

  const show = new Function('window', 'slot', 'pin',
    read[0] + '\nif (pin) { ' + pinBump[0] + '\nwindow._gateAdCurrentIdx = slot; }\n' + count[0]);
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
});

test('a pinned scene re-arrives on every rotation tick', () => {
  // ?scene=wx parks the carousel on the weather card so it can be looked at
  // without waiting for the rotation — and the one scene anybody pins is this
  // one, because an entrance is the thing under review.
  //
  // The pin stamps _gateAdCurrentIdx itself, so the parked slide never looked
  // like it changed: the entrance played once at first paint and then never
  // again for the life of the page, while the tick went on crossfading the
  // card to an identical, un-animated copy of itself every 22s. Anyone
  // reviewing a pinned board for more than one dwell would have reported that
  // the entrance "only works once".
  const read = SRC.match(/var _prevShownSlot = window\._gateAdCurrentIdx;/);
  const pinBump = SRC.match(
    /if \(window\._gateAdAuthChange\) \{\s*window\._gateAdVisitSeq = \(window\._gateAdVisitSeq \|\| 0\) \+ 1;\s*\}/);
  const count = SRC.match(
    /if \(typeof _prevShownSlot !== 'number'[\s\S]*?window\._gateAdCurrentIdx = slot;/);
  const show = new Function('window', 'slot', 'pin',
    read[0] + '\nif (pin) { ' + pinBump[0] + '\nwindow._gateAdCurrentIdx = slot; }\n' + count[0]);

  const p = {};
  show(p, 6, true);
  assert.equal(p._gateAdVisitSeq, 1, 'a pinned first paint is still an arrival');
  show(p, 6, true);
  show(p, 6, true);
  assert.equal(p._gateAdVisitSeq, 1,
    'and a parked scene does not re-arrive on a plain repaint');

  p._gateAdAuthChange = true; show(p, 6, true); p._gateAdAuthChange = false;
  assert.equal(p._gateAdVisitSeq, 2,
    'but the rotation tick firing under the pin IS an arrival — otherwise ' +
    'the review aid shows the reviewer everything except the thing it is for');
});

test('the counter note describes the rebuild that actually happens', () => {
  // This comment is load-bearing: it is what the next reader consults before
  // touching the trigger. The first version asserted that a rebuild "throws
  // the element away" and hands this function a fresh childless element —
  // the opposite of the truth, and it pointed away from the detach/re-attach
  // that is the one event that really breaks the entrance.
  const note = SRC.slice(SRC.indexOf('A SLIDE VISIT IS AN ARRIVAL'),
    SRC.indexOf('window._gateAdCurrentIdx = slot;'));
  assert.ok(note.length > 200, 'the counter must keep its note');
  assert.match(note, /PRESERVES the live carousel/,
    'the note must say the rebuild preserves the carousel and its children');
  assert.ok(!/throws the element away/.test(note),
    'a rebuild does NOT throw the carousel away in the normal case — that ' +
    'claim sent the last reader looking in the wrong place');
});

// ── The sequence ends exactly once, and DOM churn abandons it ────────────

/** Builds _wxArmEntrance + _wxEndEntrance over a fake window/document. */
function harness() {
  const endSrc = SRC.match(/function _wxEndEntrance\(root\) \{[\s\S]*?\n\}/);
  const armSrc = SRC.match(/function _wxArmEntrance\(wrap\) \{[\s\S]*?\n\}/);
  const msSrc = SRC.match(/var _WXC_ENTRANCE_MS = (\d+);/);
  assert.ok(endSrc && armSrc && msSrc,
    'fids-core.js must define _wxArmEntrance, _wxEndEntrance and the duration');

  const all = [];
  const doc = {
    querySelectorAll: () => all.filter(n => n.classList.contains('wxc-entering')),
  };
  const timers = new Map();
  let nextId = 0;
  const w = { _gateAdVisitSeq: 1 };
  // _wxSpeed reads location.search; the dial itself is tested separately, so
  // here it is held at 1 and the harness is about the lifecycle only.
  const api = new Function('window', 'document', 'setTimeout', 'clearTimeout',
    '_WXC_ENTRANCE_MS', '_wxSpeed',
    endSrc[0] + '\n' + armSrc[0] + '\nreturn { arm: _wxArmEntrance, end: _wxEndEntrance };')(
    w, doc, fn => { timers.set(++nextId, fn); return nextId; },
    id => timers.delete(id), Number(msSrc[1]), () => 1);

  const wrap = () => {
    const c = new Set();
    const n = {
      c,
      classList: { add: x => c.add(x), remove: x => c.delete(x), contains: x => c.has(x) },
      // arming stamps the speed dial on the wrap when it is not 1
      style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
      querySelectorAll: () => [],
    };
    all.push(n);
    return n;
  };
  const fire = () => { [...timers.values()].forEach(fn => fn()); };
  return { ...api, wrap, fire, w, ms: Number(msSrc[1]) };
}

test('the entrance plays once per arrival and no re-render re-arms it', () => {
  // Both the visit counter and the played-marker live on `window`, precisely so
  // a gate rebuild cannot reset either. The harness therefore holds one window
  // across the whole slide.
  const h = harness();

  const first = h.wrap();
  assert.equal(h.arm(first), true, 'the card arriving must play the entrance');
  assert.ok(first.c.has('wxc-entering'), 'and mark the wrap');

  // Re-render path 2: late 7-day data swaps the strips under the same hero.
  assert.equal(h.arm(first), false, 'a strips-only refresh must NOT re-arm');
  // Re-render path 1: a re-tint only.
  assert.equal(h.arm(first), false, 'a re-tint must NOT re-arm');
  // Re-render path 3 on the SAME visit: a plain weather-content change rebuilds
  // the wrap from scratch. Freshness of the wrap must not count as an arrival.
  const rebuilt = h.wrap();
  assert.equal(h.arm(rebuilt), false,
    'a full rebuild mid-slide must NOT re-arm — path 3 reinserts the wrap for ' +
    'any weather change, so "the wrap is new" is not "the card arrived"');
  assert.ok(!rebuilt.c.has('wxc-entering'),
    'and the rebuilt card is therefore left plain — which is exactly why ' +
    'nothing may be hidden at rest');

  // The sequence ends: the class comes off, so a LATE strips-only refresh
  // cannot replay those two bands minutes into the slide.
  h.fire();
  assert.ok(!first.c.has('wxc-entering'), 'the class is stripped when it is over');
  assert.equal(h.arm(first), false, 'and stripping it does not re-arm anything');

  // The slide genuinely leaves and comes back.
  h.w._gateAdVisitSeq = 2;
  const second = h.wrap();
  assert.equal(h.arm(second), true, 'the next arrival plays it again');
});

test('the deadline outlasts the animation it is ending', () => {
  // Nothing tied the JS timer to the CSS timings before, so the constant could
  // be cut to anything at all and every test still passed — while the class
  // came off mid-fade and the late bands snapped in with no transition.
  let last = 0;
  for (const [, child] of STAGES) last = Math.max(last, delayOf(child) + durOf(child));
  const h = harness();
  assert.ok(h.ms / 1000 > last,
    `_WXC_ENTRANCE_MS is ${h.ms}ms but the last band does not land until ` +
    `${(last * 1000).toFixed(0)}ms — stripping the class early cuts the ` +
    'sequence off and the remaining layers hard-cut to full opacity');
  assert.ok(h.ms / 1000 < last + 1,
    'and it must not be padded far past the end either — the class is what ' +
    'keeps a late strips-only refresh from replaying those bands, so every ' +
    'extra second is a second that refresh can land in');
});

test('a second arm cannot strand the first wrap', () => {
  // The timer is a single global slot. It used to close over the wrap it was
  // armed for, so a second arm inside the window cleared the first timer and
  // left the earlier wrap marked with nothing left to strip it — and a
  // stranded class plus a later re-attach restarts the animations with no
  // deadline at all, which is an invisible weather card over a gate.
  const h = harness();
  const a = h.wrap();
  assert.equal(h.arm(a), true);
  h.w._gateAdVisitSeq = 2;
  const b = h.wrap();
  assert.equal(h.arm(b), true, 'a genuine second arrival arms again');
  h.fire();
  assert.ok(!b.c.has('wxc-entering'), 'the second wrap is cleared');
  assert.ok(!a.c.has('wxc-entering'),
    'and so is the first — the deadline must clear the mark wherever it is, ' +
    'not only on the wrap it happened to be armed for');
});

test('ending the sequence reaches a DETACHED carousel too', () => {
  // The gate rebuild hands the carousel over while it is OUT of the document,
  // and a detached subtree is not reachable from document.querySelectorAll —
  // so the one caller that most needs the mark cleared is the one a
  // document-wide sweep would miss.
  const h = harness();
  const orphan = {
    c: new Set(['wxc-entering', 'wxcard-wrap']),
    classList: {
      add(x) { orphan.c.add(x); }, remove(x) { orphan.c.delete(x); },
      contains: x => orphan.c.has(x),
    },
    style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    querySelectorAll: () => [],
  };
  h.end(orphan);
  assert.ok(!orphan.c.has('wxc-entering'),
    'passing the detached root must clear it — querySelectorAll does not ' +
    'match the root element itself, so the root needs its own check');
});

// ── Every path that touches the DOM mid-sequence ─────────────────────────

/** The three re-render paths of _renderWxCard, sliced by their own anchors. */
function renderPaths() {
  const fn = SRC.slice(SRC.indexOf('function _renderWxCard(el) {'));
  const end = fn.indexOf('\n}\n');
  const body = fn.slice(0, end);
  const p1a = body.indexOf('if (el._wxLastHtml === _wxSig');
  const p2a = body.indexOf("_wxWrapP && el._wxMainHtml === _wxMainHtml");
  const p3a = body.indexOf('el.innerHTML = _wxHtml;');
  assert.ok(p1a >= 0 && p2a >= 0 && p3a >= 0 && p1a < p2a && p2a < p3a,
    'the three render paths must still be locatable by their own anchors');
  return { retint: body.slice(p1a, p2a), strips: body.slice(p2a, p3a), rebuild: body.slice(p3a) };
}

test('all three render paths ask, and none of them clears the marker', () => {
  // Counting `_wxArmEntrance(` occurrences was not enough: moving path 3's
  // call into path 1 kept the count at four and disabled the entrance
  // completely, because path 3 is the ONLY path a real arrival takes — the
  // crossfade empties the carousel and nulls _wxLastHtml, so paths 1 and 2
  // both fail their .wxcard-wrap lookup on an arrival. Each path is checked
  // in its own body now.
  const p = renderPaths();
  for (const [name, body] of Object.entries(p)) {
    assert.match(body, /_wxArmEntrance\(/,
      `the ${name} path must ask — no path is allowed to reason about the ` +
      'rule on its own, the visit number decides');
  }
  assert.ok(!/_wxEntrancePlayedSeq|_gateAdVisitSeq/.test(p.strips),
    'the strips-only path must not touch the visit counter or the played ' +
    'marker — clearing either is the same bug as keying on freshness');
});

test('the arrival path marks the wrap synchronously', () => {
  // Deferring the mark by even one task lets the finished card paint and then
  // snap back to the start of the sequence.
  const { rebuild } = renderPaths();
  const upto = rebuild.slice(0, rebuild.indexOf('_wxArmEntrance('));
  assert.ok(!/setTimeout\(|requestAnimationFrame\(/.test(upto),
    'nothing may defer the mark on the rebuild path: it has to be on the ' +
    'wrap before the browser paints, in the same task as the insert');
});

test('the strips-only swap abandons the sequence instead of restarting it', () => {
  // The new strips would start their delays from INSERTION while the removal
  // deadline stayed where it was armed — so a refresh landing at t=1.0s left
  // both bands held at the keyframe's opacity:0 until the class came off, and
  // they then snapped in with no fade at all. Two of the card's three content
  // bands, blank for most of a second, mid-slide, on a public board. This
  // fires whenever late 7-day data lands, which is every half hour per
  // destination, so it is routine rather than a corner case.
  const { strips } = renderPaths();
  const ends = strips.indexOf('_wxEndEntrance(');
  const removes = strips.indexOf(":scope > .wxc-strip");
  assert.ok(ends >= 0, 'the strips-only path must be able to end the sequence');
  assert.ok(ends < removes,
    'and it must do so BEFORE it pulls the strips out — abandoning after the ' +
    're-insert leaves the new nodes mid-animation against a dead deadline');
  assert.match(strips, /classList\.contains\('wxc-entering'\)/,
    'and only when the sequence is actually running: a refresh minutes into ' +
    'the slide has nothing to abandon and must not pay for a DOM sweep');
});

test('a gate rebuild abandons the sequence on the way back in', () => {
  // The rebuild detaches the live carousel and re-attaches it to survive the
  // innerHTML wipe. Re-inserting a node RESTARTS its CSS animations — the
  // v23166 note in display-overrides measured exactly that on this carousel,
  // where it turned the largest panel on the screen into a navy rectangle on
  // every rebuild. All five stages would replay from zero against a deadline
  // that did not move, and no JS is re-entered to notice: the refill only
  // repaints a CHILDLESS carousel, and a preserved one is not childless.
  const detach = SRC.indexOf("if (_gateAdAirlineSame && _savedAd && _savedAd.firstChild) { _savedAd.remove(); }");
  const reattach = SRC.indexOf('_newAd.replaceWith(_savedAd);');
  assert.ok(detach >= 0 && reattach > detach,
    'the gate rebuild must still preserve the carousel across the wipe');
  const between = SRC.slice(detach, reattach);
  const ends = between.lastIndexOf('_wxEndEntrance(_savedAd)');
  assert.ok(ends >= 0,
    'the mark must be stripped before the carousel goes back in, or the ' +
    'entrance replays on a telemetry tick and is then cut off mid-sequence');
  assert.match(between.slice(ends - 200, ends + 60), /wxcard-wrap\.wxc-entering/,
    'and it must look for a card that is actually mid-entrance rather than ' +
    'sweeping the DOM on every rebuild');
});

test('the class the JS sets is the class the CSS animates', () => {
  assert.match(SRC, /classList\.add\('wxc-entering'\)/,
    'fids-core.js must mark the wrap with the class display-overrides selects');
  assert.match(SRC, /classList\.remove\('wxc-entering'\)/,
    'and must take it off again when the sequence is over');
});

// ── The dial ─────────────────────────────────────────────────────────────

test('?wxspeed stretches the whole sequence, and refuses nonsense', () => {
  // Three cuts of this animation were rejected as too fast. The dial exists so
  // the next number can be found by looking at a board instead of by another
  // round trip, which only works if it is honest: one multiplier over every
  // delay, every duration and every hold, plus the JS deadlines and the dwell,
  // so the SHAPE is identical at any speed and only the clock changes.
  const src = SRC.match(/function _wxSpeed\(\) \{[\s\S]*?\n\}/);
  assert.ok(src, '_wxSpeed must exist');
  const make = q => new Function('location',
    src[0] + '\nreturn _wxSpeed();')({ search: q });
  assert.equal(make(''), 1, 'no parameter is the tuned pacing, untouched');
  assert.equal(make('?wxspeed=1.4'), 1.4);
  assert.equal(make('?wxspeed=0.5'), 0.5, 'the fast end of the clamp is allowed');
  assert.equal(make('?wxspeed=4'), 4, 'and the slow end');
  assert.equal(make('?wxspeed=0.1'), 1, 'below the clamp falls back to 1');
  assert.equal(make('?wxspeed=99'), 1, 'and above it — a typo must not park a slide for an hour');
  assert.equal(make('?wxspeed=slow'), 1, 'and so must a word');

  // Every timing in the block rides the property, or the dial would stretch
  // some layers and not others and the whole shape would come apart.
  const timed = RULES_ONLY.match(/animation(?:-delay)?:[^;]+/g) || [];
  const clocked = timed.filter(t => /[\d.]+s/.test(t) && !/^animation:\s*none/.test(t));
  for (const t of clocked) {
    assert.match(t, /var\(--wxc-t/,
      `every timing must ride the dial, this one does not: ${t.trim().slice(0, 70)}`);
  }
  // and the two JS deadlines and the dwell scale with it too
  assert.match(SRC, /Math\.round\(_WXC_ENTRANCE_MS \* _wxSpeed\(\)\)/);
  assert.match(SRC, /Math\.round\(_WXC_EXIT_MS \* _wxSpeed\(\)\)/);
  assert.match(SRC, /slide\.type === 'wxcard'\) return Math\.round\(\d+ \* _wxSpeed\(\)\)/);
});
