'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE WEATHER CARD'S SEQUENCE — v23836, three screens.
//
// The title film clears onto a news set; the set gives way to the destination's
// next hours; the hours give way to its five days. Each screen is one
// 36-second CSS animation keyframed at the flips, all three delayed by
// (0s − --wxc-el) so a rebuild resumes instead of restarting, all three timed
// through --wxc-t so ?wxspeed= stretches the whole thing. Each screen SWEEPS in
// from off the card, turning as it comes (the v23786 grand entrance), and
// swings out the other side; inside each, the readings step in 260ms apart.
// Travel is quick and the fade is mist (v23793). The base state — no
// .wxc-entering — is the END state: screen 3 up, 1 and 2 down.
//
// What these tests pin is the choreography as a contract: the order, the
// times, the handovers, the sweep, the cascade, the thing that cannot be
// !important, one arming per visit, and what a rebuild does mid-sequence.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');
const CODE = SRC.replace(/\/\/.*$/gm, '');                       // JS without line comments
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');            // CSS without comments

// The block, BOUNDED by its own reduced-motion close — not "marker to EOF",
// which grows with every later append.
const HEAD = CSS.indexOf('/* ══ v23836 — THE WEATHER REPORT IN THREE SCREENS');
assert.ok(HEAD >= 0, 'the three-screen block must exist');
const RM = CSS.indexOf('@media (prefers-reduced-motion: reduce) {', CSS.indexOf('@keyframes wxcScreen3', HEAD));
const END = CSS.indexOf('\n}', RM) + 2;
const BLOCK = CSS.slice(HEAD, END);
const BLOCK_CODE = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const SEL_LINES = BLOCK_CODE.split('\n').filter(l => l.trim().startsWith('html body'));
const trim = l => l.replace(/:not\(#_\)/g, '').replace(/^html body /, '');

/** The declarations of the rule in the block whose selector ends with `tail`. */
function rule(tail) {
  const line = SEL_LINES.find(l => trim(l).startsWith(tail + ' {') || trim(l).includes(', ' + tail + ' {'));
  assert.ok(line, `the block must have a rule for "${tail}"`);
  return line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
}
function keyframes(name) {
  const m = BLOCK.match(new RegExp('@keyframes ' + name + ' \\{([\\s\\S]*?)\\n\\}'));
  assert.ok(m, `@keyframes ${name} must be in the block`);
  return m[1].trim().split('\n').map(l => {
    const mm = l.trim().match(/^([\d.%, ]+)\{(.*)\}$/);
    assert.ok(mm, `unparsed keyframe line: ${l}`);
    return { pcts: mm[1].split(',').map(s => parseFloat(s)), body: mm[2] };
  });
}
const SPAN_S = 36;
const secs = pct => +(pct / 100 * SPAN_S).toFixed(2);
/** The value a keyframe at `pct` gives `prop` — that keyframe MUST name it. */
function at(frames, pct, prop) {
  const f = frames.find(fr => fr.pcts.includes(pct) && new RegExp(prop + ':').test(fr.body));
  assert.ok(f, `no keyframe at ${pct}% writes ${prop}`);
  return f.body.match(new RegExp(prop + ':\\s*([^;]+);'))[1].trim();
}
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
const DWELL_MS = Number(SRC.match(/if \(slide\.type === 'wxcard'\) return Math\.round\((\d+) \* _wxSpeed\(\)\);/)[1]);

/** Every staged rule in the block: selector, base delay, first duration, whether it steps by --wxc-i. */
function staged() {
  const out = [];
  for (const l of SEL_LINES) {
    if (!/\.wxc-entering/.test(l) || !/animation:/.test(l)) continue;
    const dur = l.match(/animation:\s*[\w-]+ calc\(([\d.]+)s \* var\(--wxc-t, 1\)\)/);
    const delay = l.match(/animation-delay: calc\(\(([\d.]+)s( \+ var\(--wxc-i, 0\) \* ([\d.]+)s)? - var\(--wxc-el, 0s\)\) \* var\(--wxc-t, 1\)\)/);
    if (!dur || !delay) continue;
    out.push({ sel: trim(l).slice(0, trim(l).indexOf(' {')), dur: +dur[1], delay: +delay[1], step: delay[3] ? +delay[3] : 0, decl: l });
  }
  return out;
}

// ── The order ────────────────────────────────────────────────────────────

test('set loop, scene, three screens, credit, title — in that order, and each screen is what it says', () => {
  assert.match(SRC, /var _wxHtml = '<div class="wxcard-wrap wxcard-col' \+ _wxWrapCls \+ '">' \+ _wxVid \+ _wxS1 \+ _wxS2 \+ _wxS3 \+ _wxCredit \+ _wxIntro \+ '<\/div>';/,
    'that source order is the stacking order; the footage is the ground (v23843)');
  assert.match(SRC, /var _wxS1 = '<div class="wxc-screen wxc-s1">'\s*\+ '<div class="wxc-monitor/, 'screen 1 is the monitor');
  assert.match(SRC, /_wxS2 = '<div class="wxc-screen wxc-s2">'[^;]*wxc-chart/, 'screen 2 is the hours chart');
  assert.match(SRC, /_wxS3 = '<div class="wxc-screen wxc-s3">'[^;]*wxc-days/, 'screen 3 is the days');
});

test('the monitor carries departure and arrival, each read at its own hour', () => {
  assert.match(SRC, /var _sideL = \(_wxOrig && _wxOrig !== dest\) \? _wxSide\(_wxOrig, _wxDepTs, _depShort, 'wxc-mon-dep'\) : '';\s*var _sideR = _wxSide\(dest, _wxArrTs, _arrShort, 'wxc-mon-arr'\);/,
    'departure from the board airport at departure time, arrival at the destination at arrival time');
  assert.match(SRC, /'<div class="wxc-mon-body">' \+ \(_sideL \? _sideL \+ _wxLink : ''\) \+ _sideR \+ '<\/div>'/,
    'departure left, the link, arrival right; with no origin reading the arrival stands alone');
  assert.match(SRC, /var w = _wxAtTime\(iata, ts\);[\s\S]{0,160}_wxAnimIcon\(w\.code, _wxNightAt\(iata, ts\)\)/,
    'the plate\'s icon is day or night AT THAT HOUR, not now');
  assert.match(rule('.wxcard-wrap .wxc-mon-2up .wxc-mon-body'), /grid-template-columns: 1fr auto 1fr !important/, 'two plates sit side by side');
});

test('the screens are stacked, absolute, under the title', () => {
  const r = rule('.wxcard-wrap > .wxc-screen');
  assert.match(r, /position: absolute !important/);
  assert.match(r, /inset: 0 !important/);
  const z = Number(r.match(/z-index: (\d+) !important/)[1]);
  const title = CSS.match(/\.wxcard-wrap > \.wxc-intro \{[^}]*z-index:\s*(\d+)/);
  assert.ok(title, 'the title rule must declare a z-index');
  assert.ok(z < Number(title[1]), `screens at z ${z} must stay under the title at z ${title[1]}`);
});

// ── The times ────────────────────────────────────────────────────────────

test('each screen has one 36-second sequence, resumable and stretchable', () => {
  for (const [s, name] of [['s1', 'wxcScreen1'], ['s2', 'wxcScreen2'], ['s3', 'wxcScreen3']]) {
    const r = rule('.wxcard-wrap.wxc-entering > .wxc-' + s);
    assert.match(r, new RegExp('animation: ' + name + ' calc\\(36\\.00s \\* var\\(--wxc-t, 1\\)\\) linear both !important'),
      `${s} runs ${name} for 36s × --wxc-t, filling both ways`);
    assert.match(r, /animation-delay: calc\(\(0s - var\(--wxc-el, 0s\)\) \* var\(--wxc-t, 1\)\) !important/,
      `${s}'s delay is (0 − elapsed) × speed, so a rebuild resumes and ?wxspeed stretches`);
  }
});

test('the flips are at 3.2, 18.5 and 30.5 seconds, and every handover is a crossfade', () => {
  const k1 = keyframes('wxcScreen1'), k2 = keyframes('wxcScreen2'), k3 = keyframes('wxcScreen3');
  assert.equal(secs(k1[0].pcts[1]), 3.2, 'screen 1 begins to rise at 3.2s');
  assert.ok(3.2 < INTRO_S, 'which is under the film, before it cuts');
  // 1 → 2
  const out1 = k1[2].pcts[0], in2 = k2[0].pcts[1];
  assert.equal(secs(out1), 18.5, 'screen 1 starts to leave at 18.5s');
  assert.equal(out1, in2, 'and screen 2 starts to arrive on the same frame — no gap');
  const out1done = k1[3].pcts[0], in2landed = k2[1].pcts[0], in2full = k2[2].pcts[0];
  assert.equal(out1done, in2landed, 'screen 1 is gone as screen 2 lands');
  assert.ok(in2full > in2landed && in2landed > in2, 'a crossfade, not a cut: the arrival lands, then keeps misting up');
  // 2 → 3
  const out2 = k2[3].pcts[0], in3 = k3[0].pcts[1];
  assert.equal(secs(out2), 30.5, 'screen 2 starts to leave at 30.5s');
  assert.equal(out2, in3, 'and screen 3 arrives on the same frame');
  assert.equal(k2[4].pcts[0], k3[1].pcts[0], 'screen 2 is gone as screen 3 lands');
  assert.ok(k3[2].pcts[0] > k3[1].pcts[0], 'and screen 3 keeps misting up after it lands');
});

test('each screen sweeps in from off the card, turning, and swings out the other side', () => {
  for (const name of ['wxcScreen2', 'wxcScreen3']) {
    const k = keyframes(name);
    const from = at(k, k[0].pcts[0], 'transform');
    const m = from.match(/translate3d\((-?[\d.]+)%, 0, 0\) rotateY\((\d+)deg\)/);
    assert.ok(m, `${name} arrives with a horizontal translate and a turn: ${from}`);
    assert.ok(Number(m[1]) <= -100, `${name} starts fully off the card (${m[1]}%), not a nudge`);
    assert.ok(Number(m[2]) > 0, 'and turns as it comes');
    assert.equal(at(k, k[1].pcts[0], 'transform'), 'none', 'it lands square');
  }
  for (const name of ['wxcScreen1', 'wxcScreen2']) {
    const k = keyframes(name);
    const last = k[k.length - 1];
    const to = at(k, last.pcts[0], 'transform');
    const m = to.match(/translate3d\((-?[\d.]+)%, 0, 0\) rotateY\((-?\d+)deg\)/);
    assert.ok(m && Number(m[1]) >= 100 && Number(m[2]) < 0, `${name} leaves by the other side, turning the other way: ${to}`);
  }
  assert.match(CSS, /\.wxcard-wrap\.wxc-entering,\s*[^{]*\.wxcard-wrap\.wxc-leaving \{\s*perspective: \d+px !important/,
    'a rotateY with no perspective on the parent is a flat squash, not a turn');
  // and the travel is quick while the fade is mist
  const k2 = keyframes('wxcScreen2');
  const travel = secs(k2[1].pcts[0]) - secs(k2[0].pcts[1]), fade = secs(k2[2].pcts[0]) - secs(k2[0].pcts[1]);
  assert.ok(fade / travel >= 2.5, `fade ${fade}s over travel ${travel}s — the panel arrives, then materialises`);
});

test('inside each screen the readings step in 260ms apart, after the screen has landed', () => {
  const st = staged();
  const by = Object.fromEntries(st.map(s => [s.sel, s]));
  const need = (sel) => { assert.ok(by[sel], `${sel} must be staged`); return by[sel]; };
  // screen 1: after the film cuts at 6.0
  const s1 = ['.wxcard-wrap.wxc-entering > .wxc-s1 > .wxc-monitor > .wxc-bar-head',
    '.wxcard-wrap.wxc-entering > .wxc-s1 > .wxc-monitor > .wxc-mon-body > .wxc-mon-side:first-child',
    '.wxcard-wrap.wxc-entering > .wxc-s1 > .wxc-monitor > .wxc-mon-body > .wxc-mon-link',
    '.wxcard-wrap.wxc-entering > .wxc-s1 > .wxc-monitor > .wxc-mon-body > .wxc-mon-side:last-child'].map(need);
  assert.ok(s1[0].delay >= INTRO_S, 'the monitor\'s first piece waits for the film to cut');
  for (let i = 1; i < s1.length; i++) assert.ok(Math.abs(s1[i].delay - s1[i - 1].delay - 0.26) < 1e-6, `${s1[i].sel} steps 260ms after the previous piece`);
  // screen 2: the curve draws through the points, one per 260ms
  const k2 = keyframes('wxcScreen2');
  const landed2 = secs(k2[1].pcts[0]);
  const title2 = need('.wxcard-wrap.wxc-entering > .wxc-s2 > .wxc-sc-title');
  assert.ok(title2.delay >= landed2, 'the title waits for the screen to land');
  const pts = need('.wxcard-wrap.wxc-entering > .wxc-s2 > .wxc-chart > .wxc-pt');
  assert.equal(pts.step, 0.26, 'each reading pops 260ms after the last, by its own --wxc-i');
  assert.match(pts.decl, /animation: wxcPop/, 'a reading pops in at its point on the curve');
  const draw = SEL_LINES.find(l => /\.wxc-curve-line \{/.test(l) && /\.wxc-entering/.test(l));
  assert.ok(draw && /animation: wxcDraw calc\(2\.08s/.test(draw), 'the line draws itself over the eight readings (8 × 0.26s)');
  assert.match(rule('.wxcard-wrap .wxc-curve-line'), /stroke-dasharray: 1 !important/, 'against pathLength 1');
  assert.match(SRC, /<path class="wxc-curve-line" pathLength="1"/);
  // v23848: the hours are columns in a grid; a point carries its index and nothing else inline
  assert.match(SRC, /'<div class="wxc-pt ' \+ \(p\.h\.night \? 'wxc-pt-night' : 'wxc-pt-day'\) \+ '" style="--wxc-i:' \+ i \+ '">'/, 'the point carries its index');
  assert.match(SRC, /'<div class="wxc-chart wxc-hgrid">' \+ _cols \+ '<\/div>'/, 'and the columns sit in the grid panel');
  // the note's rule lives in the v23848 block, after this one, so it is looked for in the whole sheet
  const hnote = CSS_CODE.split('\n').find(l => l.includes('.wxcard-wrap.wxc-entering > .wxc-s2 > .wxc-hnote {'));
  assert.ok(hnote, '.wxcard-wrap.wxc-entering > .wxc-s2 > .wxc-hnote must be staged');
  assert.match(hnote, /animation-delay: calc\(\(22\.20s - var\(--wxc-el, 0s\)\) \* var\(--wxc-t, 1\)\)/, 'the turn-of-weather note steps in after the last column, on the beat the legend had');
  const times = SEL_LINES.find(l => /\.wxc-pt-time \{/.test(l) && /\.wxc-entering/.test(l));
  assert.ok(times && /animation: wxcFade/.test(times) && !/wxcRise|wxcPop/.test(times),
    'the times only fade — their transform is pinned (translateX(-50%)) and must not be animated');
  const legend = need('.wxcard-wrap.wxc-entering > .wxc-s2 > .wxc-legend');
  assert.ok(legend.delay >= pts.delay + 7 * 0.26, 'the legend follows the last reading');
  // screen 3: the days one after another, then the range
  const k3 = keyframes('wxcScreen3');
  const landed3 = secs(k3[1].pcts[0]);
  const title3 = need('.wxcard-wrap.wxc-entering > .wxc-s3 > .wxc-sc-title');
  assert.ok(title3.delay >= landed3);
  const days = need('.wxcard-wrap.wxc-entering > .wxc-s3 > .wxc-days > .wxc-day2');
  assert.equal(days.step, 0.26);
  assert.match(days.decl, /wxcRise calc\(1\.20s/, 'each day sweeps in from the left');
  assert.match(SRC, /'<div class="wxc-day2" style="--wxc-i:' \+ i \+ '">'/, 'the tile carries its index');
  const rng = need('.wxcard-wrap.wxc-entering > .wxc-s3 > .wxc-rng-wrap');
  assert.ok(rng.delay >= days.delay + 4 * 0.26, 'the range follows the last day');
  // every sweeping stage: travel 1.2s, fade ≥ 2.5× the travel
  for (const s of st) {
    const m = s.decl.match(/animation: wxcFade calc\(([\d.]+)s[^;]*?, wxcRise calc\(([\d.]+)s/);
    if (!m) continue;
    assert.ok(Number(m[1]) / Number(m[2]) >= 2.5, `${s.sel}: fade ${m[1]}s over travel ${m[2]}s — too close to read as settling then misting`);
  }
});

test('the base state is the end state, and nothing animated is pinned !important', () => {
  const down = SEL_LINES.find(l => l.includes('.wxcard-wrap > .wxc-s1, ') && l.includes('.wxcard-wrap > .wxc-s2 {'));
  const up = rule('.wxcard-wrap > .wxc-s3');
  assert.ok(down, 'screens 1 and 2 share a base rule');
  assert.match(down, /\{ opacity: 0; \}/, 'down: opacity 0, no !important');
  assert.match(up, /^ opacity: 1; $/, 'up: opacity 1, no !important');
  assert.equal(at(keyframes('wxcScreen1'), 100, 'opacity'), '0');
  assert.equal(at(keyframes('wxcScreen2'), 100, 'opacity'), '0');
  assert.equal(at(keyframes('wxcScreen3'), 100, 'opacity'), '1');
  // no rule ANYWHERE pins opacity / transform / stroke-dashoffset with !important
  // on an element this block animates. Compared by the element's own class (the
  // last compound of the selector), across multi-line rules too: a pinned static
  // in a rule written for the same class years ago outranks the keyframes just
  // the same — the retired hour label's '.wxc-hr' rules are why the chart's
  // points are '.wxc-pt'.
  const lastOf = sel => sel.trim().split(/\s*[> ]\s*/).pop().replace(/:[a-z-]+(\([^)]*\))?/g, '').replace(/^[a-z]+(?=\.)/, '');
  // reduced-motion blocks pin the base state ON PURPOSE (animation: none); they are not the trap
  const withoutReducedMotion = txt => {
    let out = txt, at;
    while ((at = out.indexOf('@media (prefers-reduced-motion: reduce) {')) >= 0) {
      let d = 0, k = out.indexOf('{', at);
      for (; k < out.length; k++) { if (out[k] === '{') d++; else if (out[k] === '}') { d--; if (d === 0) break; } }
      out = out.slice(0, at) + out.slice(k + 1);
    }
    return out;
  };
  const rulesOf = txt => [...withoutReducedMotion(txt).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sels: m[1].split(',').map(x => x.trim()).filter(Boolean), decl: m[2] }));
  /** The properties a named @keyframes writes, from wherever in the stylesheet it is. */
  const kfProps = name => {
    const k = CSS.lastIndexOf('@keyframes ' + name + ' ');
    assert.ok(k >= 0, `@keyframes ${name} must exist`);
    let d = 0, e = CSS.indexOf('{', k);
    for (; e < CSS.length; e++) { if (CSS[e] === '{') d++; else if (CSS[e] === '}') { d--; if (d === 0) break; } }
    const body = CSS.slice(k, e + 1);
    return [...body.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]).filter(pn => pn !== 'animation-timing-function');
  };
  // what each animated element's animations write
  const writes = new Map();
  for (const r of rulesOf(BLOCK_CODE)) {
    const names = [...(r.decl.match(/animation:\s*([^;]*)/) || ['', ''])[1].matchAll(/\b(wxc[A-Za-z0-9]+)\b/g)].map(m => m[1]);
    if (!names.length) continue;
    for (const s of r.sels) {
      const el = lastOf(s), set = writes.get(el) || new Set();
      for (const n of names) for (const pn of kfProps(n)) set.add(pn);
      writes.set(el, set);
    }
  }
  assert.ok(writes.get('.wxc-pt') && writes.get('.wxc-pt').has('transform') && writes.get('.wxc-day2').has('transform') && writes.get('.wxc-s2').has('opacity'), 'the audit sees the movers');
  const offenders = [];
  for (const r of rulesOf(CSS_CODE)) {
    for (const s of r.sels) {
      if (/\.wxc-intro|\.wxc-sky|@keyframes/.test(s)) continue;                        // the title's own tests cover it
      const w = writes.get(lastOf(s));
      if (!w) continue;
      for (const pn of w) {
        if (new RegExp('(?:^|[;\\s])' + pn + '\\s*:[^;]*!important').test(r.decl)) offenders.push(s.replace(/:not\(#_\)/g, '').slice(0, 90) + ' pins ' + pn);
      }
    }
  }
  assert.deepEqual(offenders, [], 'a static !important on an animated property outranks the ANIMATION origin');
  const hrTime = rule('.wxcard-wrap .wxc-pt-time');
  assert.match(hrTime, /transform: translateX\(-50%\) !important/, '(the times keep their pinned transform, and are only faded — see above)');
});

test('the deadline outlasts the last arrival, and the mark is off before the slide ends', () => {
  let last = 0;
  for (const s of staged()) last = Math.max(last, s.delay + s.step * 7 + s.dur);
  const k3 = keyframes('wxcScreen3');
  last = Math.max(last, secs(k3[2].pcts[0]));
  assert.ok(last > 30, `the last arrival ends at ${last.toFixed(2)}s — the days must have their own cascade`);
  assert.ok(ENTRANCE_MS >= last * 1000, `${ENTRANCE_MS}ms must outlive the last arrival at ${last.toFixed(2)}s`);
  assert.ok(ENTRANCE_MS <= DWELL_MS, 'and come off before the slide is over');
  assert.ok(DWELL_MS / 1000 - last >= 4, `${(DWELL_MS / 1000 - last).toFixed(1)}s at rest — the last screen must be readable, not still arriving`);
  assert.ok(EXIT_MS >= 3000, 'the exit has room for the days, the loops and the ground');
});

test('the title plays to its end and cuts; the loops are full underneath by then', () => {
  const k = BLOCK.match(/@keyframes wxcFilmOut \{ 0%, (\d+)% \{ opacity: 1; \} 100% \{ opacity: 0; \} \}/);
  assert.ok(k && Number(k[1]) >= 95, 'the film holds opaque to its last frames — the approved render cut hard');
  assert.match(rule('.wxcard-wrap.wxc-entering > .wxc-intro.wxc-intro-paint'), /animation: wxcFilmOut calc\(6\.00s \* var\(--wxc-t, 1\)\) linear both !important; animation-delay: calc\(\(0s - var\(--wxc-el, 0s\)\)/,
    'and its fade resumes from the elapsed stamp after a rebuild instead of restarting from the top');
  for (const v of ['video.wxc-vid']) {
    const r = rule('.wxcard-wrap.wxc-entering > ' + v);
    const m = r.match(/wxcFade calc\(([\d.]+)s[\s\S]*?animation-delay: calc\(\(([\d.]+)s/);
    assert.ok(m && Number(m[1]) + Number(m[2]) <= INTRO_S + 1e-9, `${v} is full (${m && (+m[1] + +m[2])}s) by the time the film cuts at ${INTRO_S}s`);
  }
  const hold = fnBody('_wxHoldSceneForIntro');
  const rel = Number(hold.match(/Math\.round\((\d+) \* _wxSpeed\(\) - \(elapsedMs \|\| 0\)\)/)[1]) / 1000;
  assert.ok(rel < 0.01 * Number(k[1]) * INTRO_S, `the loops are released at ${rel}s, while the film is still opaque`);
});

// ── Leaving ──────────────────────────────────────────────────────────────

test('the outgoing copy leaves from the end state, moving, on absolute delays', () => {
  assert.match(rule('.wxcard-wrap.wxc-leaving > .wxc-s3'), /animation: wxcLeave calc\(1\.40s \* var\(--wxc-t, 1\)\)/, 'the days swing out the way the old bands did');
  const down = SEL_LINES.find(l => l.includes('.wxcard-wrap.wxc-leaving > .wxc-s1, ') && l.includes('.wxcard-wrap.wxc-leaving > .wxc-s2 {'));
  assert.ok(down && /animation: none !important; opacity: 0;/.test(down), 'screens 1 and 2 are down and stay down');
  assert.match(rule('.wxcard-wrap.wxc-leaving.wxc-one > .wxc-s1'), /animation: wxcLeave/, 'unless the set was the whole card, in which case it leaves the same way');
  const loops = SEL_LINES.find(l => /\.wxcard-wrap\.wxc-leaving > video\.wxc-set, /.test(l) && /video\.wxc-vid \{/.test(l));
  assert.ok(loops && /animation: wxcLeaveVid/.test(loops) && /animation-delay: calc\(1\.00s \* var\(--wxc-t, 1\)\)/.test(loops),
    'the set and the scene leave together, on an ABSOLUTE delay (no --wxc-el term)');
  assert.doesNotMatch(loops, /--wxc-el/);
  const ground = SEL_LINES.find(l => /\.wxcard-wrap\.wxc-leaving \{/.test(l));
  assert.ok(ground && /animation: wxcLeaveGround calc\(1\.10s/.test(ground) && /animation-delay: calc\(1\.40s \* var\(--wxc-t, 1\)\)/.test(ground),
    'the ground fades from 1.4s — after the days have gone, before the cover comes off');
  assert.ok(1.4 + 1.1 < EXIT_MS / 1000 && 1.0 + 1.9 < EXIT_MS / 1000, 'and everything is over before the cover comes off');
  // the carousel wakes the loops and strips the resume stamp before it marks the copy
  const tick = SRC.slice(SRC.indexOf("_wxLeaveWrap.classList.add('wxc-leaving');"), SRC.indexOf("_wxLeaveWrap.classList.add('wxc-leaving');") + 900);
  assert.match(tick, /_wxLeaveWrap\.style\.removeProperty\('--wxc-el'\)/, 'a stamp left by a rebuild would make the absolute delays negative');
  assert.match(tick, /querySelectorAll\(':scope > \[style\*="--wxc-el"\]'\)[\s\S]{0,120}removeProperty\('--wxc-el'\)/, 'on the swapped screens too');
  assert.match(tick, /querySelectorAll\(':scope > video\.wxc-vid'\)[\s\S]{0,120}\.play\(\)/,
    'and the scene is nudged to play — what the exit uncovers must MOVE');
});

test('a reduced-motion preference turns the sequence off', () => {
  const rm = BLOCK.slice(BLOCK.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /> \.wxc-screen \*[^{]*\{ animation: none !important; \}/, 'no flips and no cascades');
  assert.match(rm, /\.wxc-curve-line \{ stroke-dashoffset: 0 !important; \}/, 'and the curve is simply drawn');
});

// ── One arming per visit, and what a rebuild does ────────────────────────

test('the entrance plays once per arrival and no re-render re-arms it', () => {
  const arm = fnBody('_wxArmEntrance');
  assert.match(arm, /if \(window\._wxEntrancePlayedSeq === seq\) return false;/);
  assert.match(arm, /window\._wxEntranceAt = Date\.now\(\);/);
  assert.match(arm, /wrap\.classList\.add\('wxc-entering'\);/);
  assert.doesNotMatch(arm, /_wxParkSceneAfterSet/, 'v23843: nothing parks the scene, it plays the whole visit');
});

test('a pinned scene re-arrives on every rotation tick', () => {
  const at = SRC.indexOf("var _pin = new URLSearchParams(location.search).get('scene');");
  const block = SRC.slice(at, at + 2600);
  assert.match(block, /if \(window\._gateAdAuthChange\) \{\s*window\._gateAdVisitSeq = \(window\._gateAdVisitSeq \|\| 0\) \+ 1;/);
});

test('all three render paths ask, and only the full rebuild carries', () => {
  const body = fnBody('_renderWxCard');
  assert.match(body, /_wxArmEntrance\(el\.querySelector\('\.wxcard-wrap'\)\);\s*return true;/, 'path 1: nothing changed');
  assert.match(body, /_wxArmEntrance\(_wxWrapP\);\s*return true;/, 'path 2: screens 2 and 3 swapped');
  assert.match(body, /if \(!_wxArmEntrance\(_wxWrap\)\) _wxCarryEntrance\(_wxWrap\);/, 'path 3: a full rebuild, carried if mid-visit');
  assert.doesNotMatch(body.replace(/\/\/.*$/gm, ''), /_wxEndEntrance\(\)/, 'no render path ends the sequence any more');
});

test('late data swaps screens 2 and 3 under an untouched set, on the same clock, only when the wrap is the same wrap', () => {
  const body = fnBody('_renderWxCard');
  assert.match(body, /el\._wxS1Html === _wxS1 && el\._wxVidHtml === _wxVid && el\._wxWrapCls === _wxWrapCls/,
    'the set, the scene AND the wrap\'s class set must be unchanged — a substring test let a wxc-one wrap keep its mark');
  assert.match(body, /el\._wxWrapCls = _wxWrapCls;/, 'recorded on the full rebuild');
  assert.match(body, /\[\['wxc-s2', _wxS2\], \['wxc-s3', _wxS3\]\]/);
  assert.match(body, /_wxElapsed = \(\(Date\.now\(\) - window\._wxEntranceAt\) \/ 1000 \/ _wxSpeed\(\)\)\.toFixed\(2\) \+ 's';/,
    'stamped in BASE seconds — the delays multiply by --wxc-t');
  assert.match(body, /fresh\.style\.setProperty\('--wxc-el', _wxElapsed\)/);
  assert.match(body, /anchor\.insertAdjacentHTML\('beforebegin', pair\[1\]\)/, 'ahead of the credit');
});

test('a gate rebuild re-stamps the wrap AND the swapped screens, in base seconds', () => {
  const at = SRC.indexOf('var _wxR = _savedAd && _savedAd.querySelector');
  const block = SRC.slice(at, SRC.indexOf('if (_savedAd && _newAd)', at));
  assert.match(block, /var _wxBase = \(_wxEl \/ _wxSpeed\(\)\)\.toFixed\(2\) \+ 's';/);
  assert.match(block, /_wxR\.style\.setProperty\('--wxc-el', _wxBase\);/);
  assert.match(block, /_wxR\.querySelectorAll\(':scope > \[style\*="--wxc-el"\]'\)[\s\S]{0,140}setProperty\('--wxc-el', _wxBase\)/,
    'an inline stamp on a swapped screen outranks the wrap\'s; left alone, that screen resumes on the clock it was inserted at');
});

test('the carry re-marks only inside the window, stamps base seconds, and resumes the film', () => {
  const parked = [], held = [], timers = [];
  const fitted = [];
  const carry = new Function('window', 'Date', '_WXC_ENTRANCE_MS', '_WXC_ENTRANCE_INTRO_S', '_WX_INTRO_BG_SPAN', '_wxSpeed',
    '_wxParkSceneAfterSet', '_wxHoldSceneForIntro', 'setTimeout', 'clearTimeout', '_wxFitIntroPaint',
    fnBody('_wxCarryEntrance') + '\nreturn _wxCarryEntrance;');
  const NOW = 1_800_000_000_000;
  const mk = (withFilm) => {
    const w = { classes: [], vars: {}, bg: withFilm ? { rate: 1, t: 0, played: false, playbackRate: 1 } : null };
    w.classList = { add: c => w.classes.push(c), contains: c => w.classes.includes(c) };
    w.style = { setProperty: (k, v) => { w.vars[k] = v; } };
    if (w.bg) { w.bg.play = () => { w.bg.played = true; }; Object.defineProperty(w.bg, 'currentTime', { set: v => { w.bg.t = v; }, get: () => w.bg.t }); }
    w.querySelector = sel => (sel === ':scope > .wxc-intro > video.wxc-intro-bg' ? w.bg : null);
    return w;
  };
  const run = (entranceAt, playedSeq, visitSeq, speed = 1, withFilm = false) => {
    const wrap = mk(withFilm);
    parked.length = 0; held.length = 0; timers.length = 0; fitted.length = 0;
    const ok = carry({ _wxEntranceAt: entranceAt, _wxEntrancePlayedSeq: playedSeq, _gateAdVisitSeq: visitSeq },
      { now: () => NOW }, ENTRANCE_MS, INTRO_S, 6.0, () => speed,
      (w, el) => parked.push(el), (w, ms) => held.push(ms), (fn, ms) => { timers.push(ms); return 1; }, () => {}, (w) => fitted.push(w))(wrap);
    return { ok, wrap };
  };
  let r = run(NOW - 10000, 3, 3);
  assert.equal(r.ok, true, '10s into this visit\'s sequence: carried');
  assert.deepEqual(r.wrap.classes, ['wxc-entering']);
  assert.equal(r.wrap.vars['--wxc-el'], '10.00s');
  assert.deepEqual(parked, [], 'v23843: the scene is never parked — it is the picture behind every screen');
  assert.deepEqual(held, [], 'past the film, nothing to hold');
  r = run(NOW - 10000, 3, 3, 2);
  assert.equal(r.wrap.vars['--wxc-el'], '5.00s', 'at half speed 10 real seconds are 5 base seconds — the delays multiply by --wxc-t');
  assert.equal(r.wrap.vars['--wxc-t'], '2');
  r = run(NOW - 2000, 3, 3, 1, true);
  assert.equal(r.ok, true, 'inside the film');
  assert.equal(r.wrap.bg.played, true, 'the film is resumed');
  assert.equal(r.wrap.bg.t, 2, 'at the frame it had reached');
  assert.deepEqual(timers, [4000], 'and stopped when the window would have closed');
  assert.deepEqual(held, [2000], 'the loops are held for what is left of it');
  assert.equal(fitted.length, 1, 'and the painted title is fitted to the rebuilt wrap');
  r = run(NOW - 60000, 3, 3);
  assert.equal(r.ok, false, 'past the end: the end state is the right state');
  r = run(NOW - 5000, 2, 3);
  assert.equal(r.ok, false, 'a sequence armed for a previous visit is not this visit\'s');
  r = run(0, 3, 3);
  assert.equal(r.ok, false, 'never armed: nothing to carry');
  // …and the rebuild inside the film carries the film's markup again
  const wants = new Function('window', 'Date', '_WXC_ENTRANCE_INTRO_S', '_wxSpeed', fnBody('_wxWantsIntro') + '\nreturn _wxWantsIntro;');
  const w = (played, visit, ago) => wants({ _wxEntrancePlayedSeq: played, _gateAdVisitSeq: visit, _wxEntranceAt: NOW - ago }, { now: () => NOW }, INTRO_S, () => 1)();
  assert.equal(w(3, 4, 0), true, 'a new visit');
  assert.equal(w(3, 3, 2000), true, 'a rebuild two seconds into the film');
  assert.equal(w(3, 3, 9000), false, 'a rebuild after the film');
});

test('the scene is never parked: it plays from the film\'s release to the card\'s exit', () => {
  // v23843. It used to pause at 19.7s behind an opaque hours screen. The
  // screens are translucent over the footage now, and a frozen sky behind
  // live numbers is the one thing this card must not do.
  assert.doesNotMatch(SRC, /_wxParkSceneAfterSet/);
  assert.doesNotMatch(SRC, /window\._wxParkTimer/);
  const hold = fnBody('_wxHoldSceneForIntro');
  assert.match(hold, /vid\.play\(\)/, 'released under the film');
  assert.ok(hold.lastIndexOf('.pause()') < hold.indexOf('3800'), 'every pause in the hold comes before the release at 3.8s; nothing after it pauses the scene');

});

// ── The screens' own rules ───────────────────────────────────────────────

test('the hours are eight consecutive readings and the days are five finite ones', () => {
  assert.match(SRC, /\.slice\(0, 8\)\s*\.forEach\(function \(h\) \{/, 'eight hours, consecutive');
  assert.match(SRC, /if \(!_wxNum\(daily\.temperature_2m_max\[i\]\) \|\| !_wxNum\(daily\.temperature_2m_min\[i\]\)\) continue;/,
    'a day the route could not compute (null) is skipped, not drawn as 0°');
  assert.match(SRC, /if \(!\(dd\.hi > -99 && dd\.lo < 99\)\) return;/, 'and the hourly roll-up skips an empty day');
});

test('a stacked pair keeps both languages the same size and weight', () => {
  assert.match(SRC, /w\.push\('<span class="wxc-l' \+ \(w\.length \+ 1\) \+ '">' \+ t \+ '<\/span>'\);/);
  assert.doesNotMatch(rule('.wxcard-wrap .wxc-l2'), /font-size|font-weight|opacity/, 'the second line may change colour, never size or weight');
});

test('a missing screen never leaves its slot blank', () => {
  assert.match(SRC, /if \(!_wxS2 && _wxS3\) _wxS2 = _wxS3\.replace\('wxc-screen wxc-s3', 'wxc-screen wxc-s2'\);/);
  assert.match(SRC, /var _wxOnly1 = !\(_wxS2 \|\| _wxS3\);/);
  assert.match(rule('.wxcard-wrap.wxc-one > .wxc-s1'), /opacity: 1;/);
  assert.match(rule('.wxcard-wrap.wxc-entering.wxc-one > .wxc-s1'), /animation: wxcFade/);
});
