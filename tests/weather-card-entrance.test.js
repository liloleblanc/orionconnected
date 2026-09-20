'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE WEATHER CARD'S SEQUENCE — v23836, three screens.
//
// The title clears onto a news set; the set gives way to the destination's
// next hours; the hours give way to its five days. Each screen is one
// 32-second CSS animation keyframed at the flips, all three delayed by
// (0s − --wxc-el) so a rebuild resumes instead of restarting, all three timed
// through --wxc-t so ?wxspeed= stretches the whole thing. The base state — no
// .wxc-entering — is the END state: screen 3 up, 1 and 2 down. That is what
// lets the mark come off without anything moving, and what the outgoing copy
// leaves from.
//
// What these tests pin is the choreography as a contract: the order, the
// times, the handovers, the thing that cannot be !important, the one arming
// per visit, and what happens to a sequence when the card is rebuilt under it.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');

// The block, BOUNDED by its own last rule — not "marker to EOF", which grows
// with every later append (see the note on segment bounds in the dev notes).
const HEAD = CSS.indexOf('/* ══ v23836 — THE WEATHER REPORT IN THREE SCREENS');
assert.ok(HEAD >= 0, 'the three-screen block must exist');
const K3 = CSS.indexOf('@keyframes wxcScreen3', HEAD);
const RM = CSS.indexOf('@media (prefers-reduced-motion: reduce) {', K3);
const END = CSS.indexOf('\n}', RM) + 2;
const BLOCK = CSS.slice(HEAD, END);
const SEL_LINES = BLOCK.split('\n').filter(l => l.trim().startsWith('html body'));

/** The declarations of the rule in the block whose selector ends with `tail`. */
function rule(tail) {
  const line = SEL_LINES.find(l => l.includes(tail + ' {'));
  assert.ok(line, `the block must have a rule ending "${tail}"`);
  return line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
}
function keyframes(name) {
  const m = BLOCK.match(new RegExp('@keyframes ' + name + ' \\{([\\s\\S]*?)\\n\\}'));
  assert.ok(m, `@keyframes ${name} must be in the block`);
  // [{pcts:[..], body}]
  return m[1].trim().split('\n').map(l => {
    const mm = l.trim().match(/^([\d.%, ]+)\{(.*)\}$/);
    assert.ok(mm, `unparsed keyframe line: ${l}`);
    return { pcts: mm[1].split(',').map(s => parseFloat(s)), body: mm[2] };
  });
}
const SPAN_S = 32;
const secs = pct => +(pct / 100 * SPAN_S).toFixed(2);
const opacityAt = (frames, pct) => {
  const f = frames.find(fr => fr.pcts.includes(pct));
  assert.ok(f, `no keyframe at ${pct}%`);
  return parseFloat(f.body.match(/opacity:\s*([\d.]+)/)[1]);
};
function fnBody(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must define ${name}`);
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(at, k + 1); }
  }
  assert.fail(`unterminated ${name}`);
}
const ENTRANCE_MS = Number(SRC.match(/var _WXC_ENTRANCE_MS = (\d+);/)[1]);
const EXIT_MS = Number(SRC.match(/var _WXC_EXIT_MS = (\d+);/)[1]);
const INTRO_S = Number(SRC.match(/var _WXC_ENTRANCE_INTRO_S = (\d+);/)[1]);

// ── The order ────────────────────────────────────────────────────────────

test('three screens, in order, over the scene and under the title', () => {
  assert.match(SRC, /var _wxHtml = '<div class="wxcard-wrap wxcard-col' \+ _wxWrapCls \+ '">' \+ _wxVid \+ _wxS1 \+ _wxS2 \+ _wxS3 \+ _wxCredit \+ _wxIntro \+ '<\/div>';/,
    'scene, set, hours, days, credit, title — that order is the stacking order');
  for (const [v, cls] of [['_wxS1', 'wxc-s1'], ['_wxS2', 'wxc-s2'], ['_wxS3', 'wxc-s3']]) {
    assert.match(SRC, new RegExp(v + " = '<div class=\"wxc-screen " + cls + '"'), `${v} opens the ${cls} screen`);
  }
});

test('the screens are stacked, absolute, and the title still sits above them', () => {
  const r = rule('.wxcard-wrap > .wxc-screen');
  assert.match(r, /position: absolute !important/);
  assert.match(r, /inset: 0 !important/);
  const z = Number(r.match(/z-index: (\d+) !important/)[1]);
  const title = CSS.match(/\.wxcard-wrap > \.wxc-intro \{[^}]*z-index:\s*(\d+)/);
  assert.ok(title, 'the title rule must declare a z-index');
  assert.ok(z < Number(title[1]), `screens at z ${z} must stay under the title at z ${title[1]}`);
});

// ── The times ────────────────────────────────────────────────────────────

test('each screen has one 32-second sequence, resumable and stretchable', () => {
  for (const [s, name] of [['s1', 'wxcScreen1'], ['s2', 'wxcScreen2'], ['s3', 'wxcScreen3']]) {
    const r = rule('.wxcard-wrap.wxc-entering > .wxc-' + s);
    assert.match(r, new RegExp('animation: ' + name + ' calc\\(32\\.00s \\* var\\(--wxc-t, 1\\)\\) linear both !important'),
      `${s} runs ${name} for 32s × --wxc-t, filling both ways`);
    assert.match(r, /animation-delay: calc\(\(0s - var\(--wxc-el, 0s\)\) \* var\(--wxc-t, 1\)\) !important/,
      `${s}'s delay is (0 − elapsed) × speed, so a rebuild resumes and ?wxspeed stretches`);
  }
});

test('the flips are at 3.2, 18.5 and 30.5 seconds, and every handover overlaps', () => {
  const k1 = keyframes('wxcScreen1'), k2 = keyframes('wxcScreen2'), k3 = keyframes('wxcScreen3');
  // screen 1 rises under the title at the same beat the old scene did
  const rise = k1[0].pcts[1];
  assert.equal(secs(rise), 3.2, 'screen 1 begins to rise at 3.2s');
  assert.ok(secs(rise) < INTRO_S, 'which is under the title, before it clears');
  // 1 → 2
  const out1 = k1.find(f => /opacity: 1/.test(f.body) && f.pcts.length === 1 && f.pcts[0] > 20).pcts[0];
  const in2 = k2[0].pcts[1];
  assert.equal(secs(out1), 18.5, 'screen 1 starts to leave at 18.5s');
  assert.equal(out1, in2, 'and screen 2 starts to arrive on the same frame — no gap');
  const in2done = k2[1].pcts[0];
  const out1done = k1[k1.length - 1].pcts[0];
  assert.equal(in2done, out1done, 'both fades end together');
  // 2 → 3
  const out2 = k2.find(f => /opacity: 1/.test(f.body) && f.pcts.length === 1 && f.pcts[0] > 70).pcts[0];
  const in3 = k3[0].pcts[1];
  assert.equal(secs(out2), 30.5, 'screen 2 starts to leave at 30.5s');
  assert.equal(out2, in3, 'and screen 3 arrives on the same frame');
  assert.equal(k2[k2.length - 1].pcts[0], k3[k3.length - 1].pcts[0], 'both fades end together');
});

test('the base state is the end state, and nothing about it is !important', () => {
  // The mark comes off past the last flip; if the base disagreed with the
  // keyframes' last frame the card would jump when it did. And an !important
  // static opacity outranks the ANIMATION origin — the light-sweep trap — so
  // the base opacities must be plain.
  const down = SEL_LINES.find(l => l.includes('.wxcard-wrap > .wxc-s1, ') && l.includes('.wxcard-wrap > .wxc-s2 {'));
  const up = rule('.wxcard-wrap > .wxc-s3');
  assert.ok(down, 'screens 1 and 2 share a base rule');
  assert.match(down, /\{ opacity: 0; \}/, 'down: opacity 0, no !important');
  assert.match(up, /^ opacity: 1; $/, 'up: opacity 1, no !important');
  assert.equal(opacityAt(keyframes('wxcScreen1'), 100), 0, 'screen 1 ends down');
  assert.equal(opacityAt(keyframes('wxcScreen2'), 100), 0, 'screen 2 ends down');
  assert.equal(opacityAt(keyframes('wxcScreen3'), 100), 1, 'screen 3 ends up');
  // …and no rule anywhere pins opacity or transform on a screen with !important
  const pinned = CSS.split('\n').filter(l => /\.wxc-(screen|s[123])\b[^{]*\{/.test(l) && /(opacity|transform):[^;]*!important/.test(l) && !/animation/.test(l));
  assert.deepEqual(pinned, [], 'a static !important opacity/transform would outrank the keyframes');
});

test('the deadline outlasts the last flip and precedes the exit', () => {
  const lastFlipEnd = secs(keyframes('wxcScreen3')[1].pcts[0]);
  assert.ok(ENTRANCE_MS >= lastFlipEnd * 1000, `${ENTRANCE_MS}ms must outlive the last flip at ${lastFlipEnd}s`);
  const dwell = Number(SRC.match(/if \(slide\.type === 'wxcard'\) return Math\.round\((\d+) \* _wxSpeed\(\)\);/)[1]);
  assert.ok(ENTRANCE_MS + EXIT_MS <= dwell, `the sequence (${ENTRANCE_MS}) plus the exit (${EXIT_MS}) must fit the ${dwell}ms slide`);
});

test('the credit rides above every screen, and arrives with the set', () => {
  const r = rule('.wxcard-wrap > .wxc-credit');
  assert.match(r, /position: absolute !important/);
  assert.ok(Number(r.match(/z-index: (\d+)/)[1]) > Number(rule('.wxcard-wrap > .wxc-screen').match(/z-index: (\d+)/)[1]));
  assert.match(rule('.wxcard-wrap.wxc-entering > .wxc-credit'), /animation-delay: calc\(\(4\.40s - var\(--wxc-el, 0s\)\)/,
    'it used to wait for the fifth band at 15.2s; now it comes up as the set settles');
});

// ── Leaving, and not moving ──────────────────────────────────────────────

test('the outgoing copy leaves from the end state', () => {
  assert.match(rule('.wxcard-wrap.wxc-leaving > .wxc-s3'), /animation: wxcLeave calc\(1\.40s \* var\(--wxc-t, 1\)\)/,
    'screen 3 — the one up when the slide ends — goes the way the old bands went');
  const down = SEL_LINES.find(l => l.includes('.wxcard-wrap.wxc-leaving > .wxc-s1, ') && l.includes('.wxcard-wrap.wxc-leaving > .wxc-s2 {'));
  assert.ok(down && /animation: none !important; opacity: 0;/.test(down), 'screens 1 and 2 are down and stay down');
  assert.match(SRC, /_wxLeaveWrap\.classList\.remove\('wxc-entering'\); _wxLeaveWrap\.classList\.add\('wxc-leaving'\);/,
    'the carousel still swaps the mark for the leaving one');
  // …and the ground goes last, so the incoming slide is not hidden behind a flat
  // opaque wrap for the tail of the 4.2s cover
  const ground = SEL_LINES.find(l => /\.wxcard-wrap\.wxc-leaving \{/.test(l));
  assert.ok(ground, 'the leaving wrap has its own rule');
  assert.match(ground, /animation: wxcLeaveGround calc\(1\.10s \* var\(--wxc-t, 1\)\)/);
  assert.match(ground, /animation-delay: calc\(1\.90s \* var\(--wxc-t, 1\)\)/, 'after screen 3 (1.4s) and the scene (1.9s) have gone');
  assert.ok(1.9 + 1.1 < EXIT_MS / 1000, 'and it is over before the cover comes off');
  // (only rules that reach the LEAVING wrap itself count — the entering-only
  // and scene-class rules never apply to it)
  const pinnedWrap = CSS.split('\n').filter(l => /\.wxcard-wrap(\.wxc-leaving)? \{/.test(l) && /opacity:[^;]*!important/.test(l));
  assert.deepEqual(pinnedWrap, [], 'no rule may pin the wrap\'s own opacity, or the ground never fades');
});

test('a reduced-motion preference turns the sequence off', () => {
  const rm = BLOCK.slice(BLOCK.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /> \.wxc-screen[^{]*\{ animation: none !important; \}/,
    'no flips; the base state — the five days — is what such a viewer sees');
});

// ── One arming per visit, and what a rebuild does ────────────────────────

test('the entrance plays once per arrival and no re-render re-arms it', () => {
  const arm = fnBody('_wxArmEntrance');
  assert.match(arm, /if \(window\._wxEntrancePlayedSeq === seq\) return false;/);
  assert.match(arm, /window\._wxEntranceAt = Date\.now\(\);/);
  assert.match(arm, /wrap\.classList\.add\('wxc-entering'\);/);
});

test('a pinned scene re-arrives on every rotation tick', () => {
  const at = SRC.indexOf("var _pin = new URLSearchParams(location.search).get('scene');");
  const block = SRC.slice(at, at + 2600);
  assert.match(block, /if \(window\._gateAdAuthChange\) \{\s*window\._gateAdVisitSeq = \(window\._gateAdVisitSeq \|\| 0\) \+ 1;/,
    'an authorised tick under the pin counts as an arrival, so the sequence can be reviewed');
});

test('all three render paths ask, and only the full rebuild carries', () => {
  const body = fnBody('_renderWxCard');
  assert.match(body, /_wxArmEntrance\(el\.querySelector\('\.wxcard-wrap'\)\);\s*return true;/, 'path 1: nothing changed');
  assert.match(body, /_wxArmEntrance\(_wxWrapP\);\s*return true;/, 'path 2: screens 2 and 3 swapped');
  assert.match(body, /if \(!_wxArmEntrance\(_wxWrap\)\) _wxCarryEntrance\(_wxWrap\);/, 'path 3: a full rebuild, carried if mid-visit');
  assert.doesNotMatch(body, /_wxEndEntrance\(\)/, 'no render path ends the sequence any more — the screens are swapped under it');
});

test('late data swaps screens 2 and 3 under an untouched set, on the same clock', () => {
  const body = fnBody('_renderWxCard');
  assert.match(body, /el\._wxS1Html === _wxS1 && el\._wxVidHtml === _wxVid/, 'only when the set and the scene are unchanged');
  assert.match(body, /\[\['wxc-s2', _wxS2\], \['wxc-s3', _wxS3\]\]/, 'both later screens');
  assert.match(body, /fresh\.style\.setProperty\('--wxc-el', _wxElapsed\)/,
    'the fresh nodes are stamped with the elapsed time, or their flips would count from insertion');
  assert.match(body, /anchor\.insertAdjacentHTML\('beforebegin', pair\[1\]\)/, 'inserted ahead of the credit, so the credit stays last');
});

test('the carry re-marks only inside the window, and stamps the elapsed time', () => {
  const carry = new Function('window', 'Date', '_WXC_ENTRANCE_MS', '_wxSpeed',
    fnBody('_wxCarryEntrance') + '\nreturn _wxCarryEntrance;');
  const NOW = 1_800_000_000_000;
  const mk = () => {
    const w = { classes: [], vars: {} };
    w.classList = { add: c => w.classes.push(c), contains: c => w.classes.includes(c) };
    w.style = { setProperty: (k, v) => { w.vars[k] = v; } };
    return w;
  };
  const run = (entranceAt, playedSeq, visitSeq, speed = 1) => {
    const wrap = mk();
    const ok = carry({ _wxEntranceAt: entranceAt, _wxEntrancePlayedSeq: playedSeq, _gateAdVisitSeq: visitSeq },
                     { now: () => NOW }, 33000, () => speed)(wrap);
    return { ok, wrap };
  };
  let r = run(NOW - 5000, 3, 3);
  assert.equal(r.ok, true, '5s into this visit\'s sequence: carried');
  assert.deepEqual(r.wrap.classes, ['wxc-entering']);
  assert.equal(r.wrap.vars['--wxc-el'], '5.00s');
  r = run(NOW - 40000, 3, 3);
  assert.equal(r.ok, false, 'past the end: the end state is the right state');
  assert.deepEqual(r.wrap.classes, []);
  r = run(NOW - 5000, 2, 3);
  assert.equal(r.ok, false, 'a sequence armed for a previous visit is not this visit\'s');
  r = run(0, 3, 3);
  assert.equal(r.ok, false, 'never armed: nothing to carry');
  r = run(NOW - 40000, 3, 3, 2);
  assert.equal(r.ok, true, 'at half speed the window is twice as long, so 40s is still inside it');
  assert.equal(r.wrap.vars['--wxc-t'], '2', 'and the speed rides along');
});

// ── The screens' own rules ───────────────────────────────────────────────

test('the hours are eight consecutive readings and the days are five', () => {
  assert.match(SRC, /\.slice\(0, 8\)\s*\.forEach\(function \(h\) \{/, 'eight hours, consecutive — a curve through 3h steps is a guess');
  assert.match(SRC, /for \(var i = 0; i < Math\.min\(5, daily\.time\.length\); i\+\+\) \{\s*_wxDays\.push/, 'five days');
});

test('a stacked pair keeps both languages the same size and weight', () => {
  assert.match(SRC, /w\.push\('<span class="wxc-l' \+ \(w\.length \+ 1\) \+ '">' \+ t \+ '<\/span>'\);/,
    '_wxPairS wraps each language in its own line');
  const l2 = rule('.wxc-l2');
  assert.doesNotMatch(l2, /font-size|font-weight|opacity/, 'the second line may change colour, never size or weight');
});

test('a missing screen never leaves its slot blank', () => {
  assert.match(SRC, /if \(!_wxS2 && _wxS3\) _wxS2 = _wxS3\.replace\('wxc-screen wxc-s3', 'wxc-screen wxc-s2'\);/,
    'the days stand in for the hours');
  assert.match(SRC, /var _wxOnly1 = !\(_wxS2 \|\| _wxS3\);/);
  assert.match(SRC, /\(_wxOnly1 \? ' wxc-one' : ''\)/, 'and with neither, the set simply holds');
  assert.match(rule('.wxcard-wrap.wxc-one > .wxc-s1'), /opacity: 1;/);
  assert.match(rule('.wxcard-wrap.wxc-entering.wxc-one > .wxc-s1'), /animation: wxcFade/);
});
