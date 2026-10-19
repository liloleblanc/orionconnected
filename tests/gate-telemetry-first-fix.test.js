'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24068 — THE GATE MAP'S ALTITUDE MOVES FROM THE FIRST FIX.
//
// After a gate screen loaded, the inbound's speed and altitude digits sat still
// for minutes, then lurched. The model (_gateTelemModel) carries a rate only
// between TWO different fixes, and the Worker hands every screen the same
// Flightradar24 answer for up to 180 s, so a fresh screen held one fix and had
// nothing to carry until the second one arrived.
//
// What the board does now, and what these tests hold it to:
//   - while the screen holds ONE fix for this aircraft (airborne, not
//     Arrived), the altitude carries that fix's own vertical speed: only
//     500 ft/min or more (1,000 or more on a reading within 150 ft of a whole
//     thousand, where turbulence and level captures read a few hundred),
//     at most 1,800 ft/min, for at most 150 s and the fix's expected life;
//     never below 1,000 ft or half the reading, never above FL410; the speed
//     holds;
//   - from the second different fix on, the model is v24065's own function,
//     character for character, the speed digits are v24065's at every second,
//     and the altitude digits blend into v24065's (never back while the latest
//     fix says the aircraft is still going that way, otherwise back no faster
//     than 30 ft/s) and are v24065's, number for number, once they meet;
//   - on the ground nothing moves (v24065's own ground rule, and airborne
//     numbers held by the render after a ground fix are not news); after the
//     feed's Arrived with no ground fix, nothing moves;
//   - a different inbound starts from nothing (every field), and an answer
//     for the inbound before it is ignored;
//   - nothing here asks for anything: no request, no change to the Worker.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) return CORE.slice(at, i + 1);
  }
  throw new Error('no end for ' + name);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// v24065's anchor and animator, frozen as they shipped (the hashes below are
// of these exact texts); the model and the digit writer are still the live
// ones, and the first test proves they are v24065's too.
const V65_SET_REAL = `function _gateTelemSetReal(spdKt, altFt) {
  var T = window._gateTelemAnim;
  var sp = (typeof spdKt === 'number') ? spdKt : null;
  var al = (typeof altFt === 'number') ? altFt : null;
  if (sp === null && al === null) {
    T.spd = null; T.alt = null; T.realSpd = null; T.realAlt = null; T.realSecToArr = null;
    return;
  }
  if (sp === T.realSpd && al === T.realAlt) return;   // unchanged fix → keep drifting
  var now = Date.now();
  // Remember the PREVIOUS real fix — the pair (prev, real) measures the
  // actual climb/descent/accel rate, which the model below continues
  // between pings.
  if (T.realTs) { T.prevSpd = T.realSpd; T.prevAlt = T.realAlt; T.prevTs = T.realTs; }
  T.realSpd = sp; T.realAlt = al; T.realTs = now;
  // A fresh ping re-anchors the MODEL; the per-second animator EASES the
  // displayed digits onto it over ~10 s
  // — no hard snap after a frozen minute.
  // Only a first-ever anchor is written directly (nothing to ease from).
  if (T.spd === null && sp !== null) T.spd = sp;
  if (T.alt === null && al !== null) T.alt = al;
  _writeGateTelemDom();
  var inb = window._gateInbound;
  var arrTs = inb && (inb._revTs || inb._sortTs);
  T.realSecToArr = (arrTs && arrTs > now) ? (arrTs - now) / 1000 : null;
}`;
const V65_ANIMATE = `function _animateGateTelem() {
  var T = window._gateTelemAnim;
  var m = _gateTelemModel();
  if (!m) return;
  // The model is the last real anchor plus its bounded measured trend. The
  // DISPLAYED digits ease toward it ~22%/s — smooth continuous motion while
  // the trend runs, and a ~10 s visible 'catch-up' whenever a fresh ping
  // moves the anchor, instead of the old snap-freeze-snap cadence.
  if (typeof m.spd === 'number') T.spd = (typeof T.spd === 'number') ? T.spd + (m.spd - T.spd) * 0.22 : m.spd;
  if (typeof m.alt === 'number') T.alt = (typeof T.alt === 'number') ? T.alt + (m.alt - T.alt) * 0.22 : m.alt;
  _writeGateTelemDom();
}`;
const V65_HASH = {
  _gateTelemSetReal: 'f501c359cd7e309f21d011cef8fd4ad383a0991fd3e6338e26ed29d51fb25cc7',
  _animateGateTelem: '31c6e30016fc77b4b6aaaefe3bcb7e4766c1c793e03f5743925055f74bd2053b',
  _gateTelemModel: '7cc1b2d5ad6073c1c56df0ffa42f565fb60a7751ccea5a2e6c11090e751861b4',
  _writeGateTelemDom: 'c756a96824660de8ec9380b8614795e3a4bdcf189a16bb8f37d546d9444106ee'
};

const NEW_NAMES = ['_gateTelemKey', '_gateTelemReset', '_gateTelemSetReal', '_gateTelemModel', '_gateTelemFirstVs', '_gateTelemFirstAlt',
  '_gateTelemWay', '_gateTelemDown', '_gateTelemAltStep', '_writeGateTelemDom', '_animateGateTelem'];
const BUILDS = {
  now: { names: NEW_NAMES, src: NEW_NAMES.map(fnSource).join('\n') },
  v24065: { names: ['_gateTelemSetReal', '_gateTelemModel', '_writeGateTelemDom', '_animateGateTelem'],
    src: [V65_SET_REAL, fnSource('_gateTelemModel'), fnSource('_writeGateTelemDom'), V65_ANIMATE].join('\n') }
};
const T0 = Date.UTC(2026, 9, 19, 15, 0, 0);

// One gate screen of one build: its telemetry functions, a clock the test
// moves, the two digit spans the panel paints, the inbound row.
function screen(build, flight) {
  const B = BUILDS[build || 'now'];
  let now = T0;
  const spans = { 'spd-kph': '', 'alt-ft': '' };
  const els = Object.keys(spans).map((k) => ({
    getAttribute: () => k,
    set textContent(v) { spans[k] = v; },
    get textContent() { return spans[k]; }
  }));
  const inb = { flight: flight || 'WS812', status: 'En route' };
  const win = { _gateTelemAnim: { spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0, realSecToArr: null, shimmerPh: 0 },
    _gateInbound: inb, _gatePanelInbound: inb, _gateTelemOwner: inb.flight };
  const api = new Function('window', 'document', 'BoardStrings', 'Date', B.src + '\nreturn {' + B.names.join(',') + '};')(
    win, { querySelectorAll: () => els }, { num: (v) => Number(v).toLocaleString('en') }, { now: () => now });
  const num = (s) => (s === '' ? null : Number(String(s).replace(/,/g, '')));
  return {
    api, win, spans, inb,
    now: () => now,
    tick(sec) { now += sec * 1000; },
    // the 60 s poll's ADS-B answer, as _gateNumbersPoll hands it over
    poll(r) {
      const i = win._gateInbound;
      win._gateInboundLivePos = { onGround: !!r.ground, speed: r.spd, altitude: r.ground ? 0 : r.alt, fl: i.flight };
      if (r.ground) i._liveOnGround = true;
      api._gateTelemSetReal(r.spd, r.ground ? 0 : r.alt, r.ground ? null : r.vs, r.age || 0, i);
    },
    step(n) { for (let k = 0; k < (n || 1); k++) { now += 1000; api._animateGateTelem(); } },
    ft: () => num(spans['alt-ft']),
    kph: () => num(spans['spd-kph'])
  };
}

// An aircraft, second by second: plan(t) gives the commanded vertical speed
// (ft/min), the level it is cleared to (captured as an autopilot does, the
// climb or descent easing off over the last few hundred feet), the speed trend
// (kt/s), or the ground. Level before `from`. The vertical speed reads in
// steps of 64 ft/min, as ADS-B does.
function flight(o) {
  const from = (o.from != null) ? o.from : -600, to = 1500, tab = {};
  let alt = o.alt, spd = o.spd;
  for (let t = -2500; t < from; t++) tab[t] = { alt: Math.round(alt), spd: Math.round(spd), vs: 0 };
  for (let t = from; t <= to; t++) {
    const p = o.plan(t);
    if (p.ground) { alt = 0; spd += Math.max(-2.5, Math.min(1, p.spd - spd)); tab[t] = { alt: 0, spd: Math.round(spd), vs: 0, ground: true }; continue; }
    let v = (p.vs || 0) / 60;
    if (typeof p.level === 'number') {
      const lim = (p.level - alt) / (p.cap || 8);
      v = (v < 0) ? Math.max(v, Math.min(0, lim)) : Math.min(v, Math.max(0, lim));
    }
    alt += v; spd += (p.ds || 0);
    tab[t] = { alt: Math.round(alt), spd: Math.round(spd), vs: (p.vsRead != null) ? p.vsRead : Math.round(v * 60 / 64) * 64 };
  }
  return (t) => tab[Math.max(-2500, Math.min(to, Math.round(t)))];
}

// A gate load, replayed on one build. The Worker holds each Flightradar24
// answer 180 s (its KV copy is `kv` s old at the load, the position `lag` s
// older than the call) and serves its edge copy without ageing it, as main's
// Worker does; the board's fetch cache keeps an answer 45 s; the poll asks at
// 2 s and then every 60 s; the digits step every second.
//   others   another screen refreshes the Worker's copy the moment it expires
//   gaps     [from, to) windows in which Flightradar24 has nothing
//   status   (s) → the feed's status word for the inbound
//   every    (S, s) → anything else this second (the render's held numbers)
function replay(build, truth, o) {
  o = o || {};
  const S = screen(build);
  const lag = (o.lag != null) ? o.lag : 5, secs = o.secs || 600;
  const inGap = (t) => (o.gaps || []).some(([a, b]) => t >= a && t < b);
  let kv = null, edge = null, cache = null;
  const fr24 = (t) => (inGap(t) ? { at: t, quiet: true } : { at: t, taken: t - lag, f: truth(t - lag) });
  const kvOk = (t) => kv && (t - kv.at) < (kv.quiet ? 60 : 180);
  function worker(t) {
    if (edge && t < edge.until) return edge.ans;
    if (!kvOk(t)) kv = fr24(t);
    if (kv.quiet) { edge = null; return null; }
    const ans = { f: kv.f, seen: t - kv.taken };
    edge = { until: t + Math.max(1, 180 - (t - kv.at)), ans };
    return ans;
  }
  kv = fr24(-((o.kv != null) ? o.kv : 60));
  const rows = [];
  for (let s = 0; s <= secs; s++) {
    if (o.status) S.inb.status = o.status(s);
    if (o.others && !kvOk(s)) kv = fr24(s);
    if (s >= 2 && (s - 2) % 60 === 0 && !/arriv|land|cancel/i.test(S.inb.status)) {
      if (!cache || s - cache.at >= 45) cache = { at: s, ans: worker(s) };
      const a = cache.ans;
      if (a && a.seen <= 900) S.poll({ spd: a.f.spd, alt: a.f.alt, vs: a.f.vs, ground: !!a.f.ground, age: a.seen });
    }
    if (o.every) o.every(S, s);
    S.api._animateGateTelem();
    const T = S.win._gateTelemAnim;
    let model = null;
    try { const m = S.api._gateTelemModel(); model = m ? m.alt : null; } catch (e) {}
    rows.push({ s, ft: S.ft(), kph: S.kph(), alt: T.alt, two: typeof T.prevAlt === 'number', model, truth: truth(s) });
    S.tick(1);
  }
  return rows;
}
const both = (truth, o) => ({ a: replay('v24065', truth, o), b: replay('now', truth, o) });

// What a replay did against the way the aircraft was going (dir).
function moves(rows, dir, from, to) {
  let back = 0, worstBack = 0, worst = 0;
  for (let i = Math.max(1, from || 1); i < Math.min(rows.length, to || rows.length); i++) {
    if (rows[i].ft === null || rows[i - 1].ft === null) continue;
    const d = rows[i].ft - rows[i - 1].ft;
    if (d * dir < 0) { back += -d * dir; worstBack = Math.max(worstBack, Math.abs(d)); }
    worst = Math.max(worst, Math.abs(d));
  }
  return { back, worstBack, worst };
}
// The first second from which the two builds' altitude is the same number to
// the end (the blend's end), from the first second with two fixes.
function blended(a, b) {
  const i2 = b.findIndex((r) => r.two);
  assert.ok(i2 > 0, 'a second fix landed');
  for (let i = b.length - 1; i >= i2; i--) if (a[i].alt !== b[i].alt) return { i2, from: i + 1 };
  return { i2, from: i2 };
}

// a steady climb or descent that began two minutes before the load, at `alt`
const steady = (vs, alt) => flight({ alt, spd: 400, from: -120, plan: () => ({ vs, level: vs < 0 ? 0 : 45000, ds: vs < 0 ? -0.08 : 0.08 }) });
const LOADS = [['the Worker\'s copy 60 s old', { kv: 60 }], ['170 s old', { kv: 170 }], ['other screens refreshing it', { kv: 10, others: true }]];

// ── v24065, kept ────────────────────────────────────────────────────────────

test('the model and the digit writer are v24065\'s, character for character', () => {
  assert.equal(sha(V65_SET_REAL), V65_HASH._gateTelemSetReal, 'the frozen v24065 anchor is the shipped text');
  assert.equal(sha(V65_ANIMATE), V65_HASH._animateGateTelem, 'the frozen v24065 animator is the shipped text');
  assert.equal(sha(fnSource('_gateTelemModel')), V65_HASH._gateTelemModel, '_gateTelemModel is unchanged');
  assert.equal(sha(fnSource('_writeGateTelemDom')), V65_HASH._writeGateTelemDom, '_writeGateTelemDom is unchanged');
});

test('the telemetry code asks for nothing: no request, no timer', () => {
  for (const n of NEW_NAMES) {
    const s = fnSource(n);
    assert.doesNotMatch(s, /\bfetch\(|_adsbTelemetry|_adsbFetchOne|_adsbCached|XMLHttpRequest|setTimeout|setInterval|_flownCache/, n);
  }
  // the round-1 and round-2 helpers are gone
  for (const gone of ['_gateTelemFix', '_gateTelemCarry', '_gateTelemTrackPrev', '_gateTelemStep']) {
    assert.equal(CORE.indexOf('function ' + gone + '('), -1, gone + ' must be gone');
  }
  assert.doesNotMatch(fnSource('_adsbFetchOne'), /_rxAt/);
  assert.doesNotMatch(fnSource('_adsbTelemetry'), /taken:/);
});

test('without a vertical speed the digits are v24065\'s at every second (feed readings, held readings)', () => {
  // the feed's own position and the render's held numbers carry no vertical speed
  for (const [vs, alt] of [[-1500, 24000], [2000, 9000], [0, 37000]]) {
    const f = steady(vs, alt);
    const run = (build) => {
      const S = screen(build);
      const out = [];
      for (let s = 0; s <= 600; s++) {
        if (s >= 2 && (s - 2) % 180 === 0) { const r = f(s - 60); S.api._gateTelemSetReal(r.spd, r.alt, null, null, S.inb); }
        S.api._animateGateTelem(); out.push(S.ft() + '/' + S.kph()); S.tick(1);
      }
      return out;
    };
    assert.deepEqual(run('now'), run('v24065'), `vs ${vs}`);
  }
});

// ── the first interval: moves from the first fix ────────────────────────────

test('descending: the altitude falls every second from the first fix (v24065 sat still until the second)', () => {
  const f = steady(-1500, 26000);
  const { a, b } = both(f, { kv: 60, secs: 300 });
  const i2 = b.findIndex((r) => r.two);
  assert.equal(i2, 122, 'set-up: the second fix lands at 122 s');
  for (let i = 3; i < i2; i++) {
    assert.ok(b[i].ft < b[i - 1].ft, `second ${i}: ${b[i - 1].ft} → ${b[i].ft} must be lower`);
    assert.equal(a[i].ft, a[2].ft, `v24065, second ${i}: still`);
  }
});

test('climbing: the altitude rises every second from the first fix', () => {
  const f = steady(2400, 8000);
  const b = replay('now', f, { kv: 30, secs: 200 });
  const i2 = b.findIndex((r) => r.two);
  // the carry runs 150 s from the first fix (2 s), the second fix lands at 182 s
  for (let i = 3; i <= 150; i++) assert.ok(b[i].ft > b[i - 1].ft, `second ${i}: ${b[i - 1].ft} → ${b[i].ft} must be higher`);
  for (let i = 151; i < i2; i++) {
    assert.ok(b[i].ft >= b[i - 1].ft, `second ${i}: never back`);
    assert.ok(b[i].ft <= b[2].ft + 150 * 30, `second ${i}: ${b[i].ft} is no more than 150 s of 1,800 ft/min above the reading`);
  }
});

test('the speed holds through the first interval and is v24065\'s digit for digit, every second, in every replay', () => {
  const cases = [
    steady(-1500, 26000), steady(2000, 9000),
    flight({ alt: 30000, spd: 420, plan: () => ({ vs: -1800, level: 26000, ds: -0.1 }) }),
    flight({ alt: 33000, spd: 470, from: -100, plan: () => ({ vs: -1500, level: 3000, ds: -0.12 }) })
  ];
  for (const f of cases) {
    for (const [name, o] of LOADS) {
      const { a, b } = both(f, Object.assign({ secs: 700 }, o));
      for (let i = 0; i < b.length; i++) assert.equal(b[i].kph, a[i].kph, `${name}, second ${i}`);
      const i2 = b.findIndex((r) => r.two);
      for (let i = 3; i < i2; i++) assert.equal(b[i].kph, b[2].kph, `${name}, second ${i}: held until the second fix`);
    }
  }
});

// ── from the second fix: v24065 ────────────────────────────────────────────

test('from the second fix: v24065\'s model at every second, and its altitude digits once blended (within 25 s)', () => {
  for (const [vs, alt] of [[-1000, 30000], [-1500, 30000], [-1800, 33000], [-2500, 36000], [1500, 3000], [2500, 3000], [-700, 20000]]) {
    for (const [name, o] of LOADS) {
      const { a, b } = both(steady(vs, alt), Object.assign({ secs: 700 }, o));
      const { i2, from } = blended(a, b);
      for (let i = i2; i < b.length; i++) assert.equal(b[i].model, a[i].model, `${vs} ${name}: the model at second ${i}`);
      assert.ok(from - i2 <= 25, `${vs} ${name}: blended ${from - i2} s after the second fix`);
      for (let i = from; i < b.length; i++) assert.equal(b[i].ft, a[i].ft, `${vs} ${name}: the digits at second ${i}`);
    }
  }
});

test('the second fix blends in: never back up a steady descent or down a steady climb, and no lurch larger than v24065\'s', () => {
  // (later, v24065's own rate rule can run past the aircraft and come back:
  // from the blend on that is v24065's, and the same seconds in both builds)
  for (const [vs, alt] of [[-1000, 30000], [-1500, 30000], [-1800, 33000], [1500, 3000], [2200, 3000]]) {
    for (const [name, o] of LOADS) {
      const { a, b } = both(steady(vs, alt), Object.assign({ secs: 500 }, o));
      const { from } = blended(a, b);
      const ma = moves(a, Math.sign(vs)), mb = moves(b, Math.sign(vs), 0, from);
      assert.equal(mb.back, 0, `${vs} ${name}: wound back ${mb.back} ft before the blend ended`);
      assert.ok(moves(b, Math.sign(vs)).worst <= ma.worst, `${vs} ${name}: largest one-second change ${moves(b, Math.sign(vs)).worst} ft (v24065: ${ma.worst})`);
      assert.equal(moves(b, Math.sign(vs)).back, ma.back, `${vs} ${name}: and any wind-back after it is v24065's`);
    }
  }
});

test('a fix that lands SHORT of the digits (the descent eased off but goes on) never winds them back up', () => {
  // −1,800 ft/min until 30 s before the load, then −600: the next fix is
  // above where the first fix's vertical speed carried the digits
  const eased = flight({ alt: 30000, spd: 420, plan: (t) => (t < -30 ? { vs: -1800, level: 5000 } : { vs: -600, level: 5000 }) });
  const { a, b } = both(eased, { kv: 60, secs: 700 });
  const i2 = b.findIndex((r) => r.two);
  assert.ok(b[i2].ft < eased(i2 - 5).alt - 300, `set-up: the digits (${b[i2].ft}) are below the new fix's ${eased(i2 - 5).alt}`);
  assert.equal(moves(b, -1).back, 0, 'not one second back up');
  const { from } = blended(a, b);
  assert.ok(from < 700, 'and they become v24065\'s');
});

// The same level-offs the previous round of this change replayed. Each one
// levels AFTER the second fix of a load whose Worker copy was 60 s old: the
// digits are v24065's from the blend on, wind-back included (v24065's own rate
// rule runs past a level between two fixes, and that is unchanged here).
const LEVEL_OFFS = [
  ['a descent levelling at 17,700 ft', -1, { alt: 32450, spd: 470, plan: (t) => ({ vs: -1500, level: 17700, ds: t < 190 ? -0.12 : 0 }) }],
  ['a climb levelling at 38,400 ft', 1, { alt: 14400, spd: 400, plan: (t) => ({ vs: 2400, level: 38400, ds: t < 200 ? 0.1 : 0 }) }],
  ['a climb to FL350', 1, { alt: 8333, spd: 380, plan: () => ({ vs: 2000, level: 35000, ds: 0.08 }) }],
  ['a step-down at 11,000 ft', -1, { alt: 26000, spd: 400, plan: (t) => (t < 340 ? { vs: -1800, level: 11000, ds: -0.1 } : { vs: -1500, level: 6000, ds: -0.05 }) }],
  ['a climb with a slow capture', 1, { alt: 12000, spd: 420, plan: () => ({ vs: 2200, level: 34000, cap: 45, ds: 0.06 }) }]
];
for (const [name, dir, o] of LEVEL_OFFS) {
  test(`level-off after the second fix, ${name}: v24065's digits from the blend on`, () => {
    const f = flight(Object.assign({ from: -300 }, o));
    const { a, b } = both(f, { kv: 60, secs: 1200 });
    const { i2, from } = blended(a, b);
    assert.ok(from - i2 <= 40, `blended ${from - i2} s after the second fix`);
    for (let i = from; i < b.length; i++) assert.equal(b[i].ft, a[i].ft, `second ${i}`);
    assert.ok(moves(b, dir, 0, from).back === 0, 'and nothing went back before the blend');
  });
}

test('a level-off INSIDE the first interval: back at 1,800 ft/min at most, then v24065\'s digits', () => {
  // the aircraft levels 10 to 90 s after the load, after the fix the screen
  // carries was taken: the digits go past the level, and come back at an
  // aircraft's own pace once the next fix says it is level
  for (const L of [10, 40, 90]) {
    for (const [dir, start] of [[-1, 30000], [1, 12000]]) {
      const lvl = start + dir * 25 * (L + 120);
      // with the speed changing (every answer a new fix) and without (the
      // level answers repeat the numbers, only the vertical speed changes)
      for (const ds of [-0.05, 0]) {
        const truth = flight({ alt: start, spd: 380, from: -120, plan: () => ({ vs: dir * 1500, level: lvl, ds }) });
        const { a, b } = both(truth, { kv: 10, others: true, secs: 900 });
        const end = b.some((r) => r.two) ? blended(a, b).from : b.length;
        const m = moves(b, dir, 0, end);
        assert.ok(m.worstBack <= 30, `L ${L} dir ${dir} ds ${ds}: largest one-second move back ${m.worstBack} ft before the blend ended`);
        for (let i = end; i < b.length; i++) assert.equal(b[i].ft, a[i].ft, `L ${L} dir ${dir} ds ${ds}: v24065's digits at second ${i}`);
        const carried = Math.max(...b.filter((r) => !r.two && r.ft !== null).map((r) => (r.ft - b[2].ft) * dir));
        assert.ok(carried > 0 && carried <= 150 * 25 + 1, `carried ${carried} ft: never more than 150 s of the fix's vertical speed`);
        if (b.some((r) => r.two)) {
          const { from } = blended(a, b);
          assert.ok(from < 900, `L ${L} dir ${dir}: v24065's digits from second ${from}`);
        } else {
          assert.equal(b[900].ft, a[900].ft, `L ${L} dir ${dir}: back on the reading v24065 shows`);
        }
      }
    }
  }
});

// ── the carry's bounds ─────────────────────────────────────────────────────

test('the carry: the fix\'s own vertical speed, 500 ft/min or more, at most 1,800, for at most 150 s and its expected life', () => {
  const carried = (vs, age, alt, sec) => {
    const S = screen();
    S.poll({ spd: 400, alt: alt || 20500, vs, age: age || 0 });
    S.tick(sec);
    const a = S.api._gateTelemFirstAlt(S.win._gateTelemAnim);
    return (a === null) ? 0 : Math.round(a - (alt || 20500));
  };
  assert.equal(carried(-1500, 0, 20500, 60), -1500, '60 s at −1,500 ft/min');
  assert.equal(carried(-6000, 0, 20500, 60), -1800, 'capped at 1,800 ft/min');
  assert.equal(carried(2400, 0, 20500, 200), 150 * 30, 'at most 150 s');
  assert.equal(carried(-1200, 150, 20500, 200), -60 * 20, 'and never past the expected life: 210 s less the answer\'s 150 s');
  assert.equal(carried(-1200, 230, 20500, 200), 0, 'an answer older than its life carries nothing');
  assert.equal(carried(-448, 0, 20500, 60), 0, 'under 500 ft/min is level');
  assert.equal(carried(512, 0, 20500, 60), 512, '512 ft/min off a whole thousand is a climb');
  assert.equal(carried(768, 0, 37000, 60), 0, '768 ft/min at 37,000 is turbulence');
  assert.equal(carried(-960, 0, 9900, 60), 0, '−960 ft/min 100 ft above a whole thousand is a capture');
  assert.equal(carried(-1024, 0, 9900, 60), -1024, 'a real descent through a whole thousand still carries');
});

test('cruise turbulence of ±256 to ±768 ft/min stays level, on every load', () => {
  for (const alt of [37000, 36975, 37050, 35000, 24000, 11000]) {
    for (const bump of [256, 320, 448, 512, 640, 768]) {
      for (const sgn of [1, -1]) {
        const truth = (t) => { const k = Math.floor((t + 9000) / 60) % 3; return { alt, spd: 465, vs: k === 0 ? sgn * bump : (k === 1 ? -sgn * bump : 0) }; };
        for (const [name, o] of LOADS.concat([['5 s old', { kv: 5 }]])) {
          const rows = replay('now', truth, Object.assign({ secs: 600 }, o));
          for (const r of rows) if (r.ft !== null) assert.equal(r.ft, alt, `${alt} ft, ±${bump}, ${name}, second ${r.s}`);
        }
      }
    }
  }
});

test('a capture: the same numbers again with another vertical speed stop the carry, back at 30 ft/s at most', () => {
  const S = screen();
  S.poll({ spd: 300, alt: 10400, vs: -1088, age: 5 });   // passing 10,400 ft, capturing 10,000
  S.step(40);
  const low = S.ft();
  assert.ok(low < 10400 - 400, `set-up: carried down to ${low}`);
  // the next answer: same numbers, level (the aircraft levelled at 10,400)
  S.api._gateTelemSetReal(300, 10400, 0, 5, S.inb);
  let prev = S.ft();
  for (let i = 0; i < 120; i++) { S.step(); assert.ok(S.ft() - prev <= 30, `${i} s: ${prev} → ${S.ft()}`); assert.ok(S.ft() >= prev); prev = S.ft(); }
  assert.equal(S.ft(), 10400, 'back on the reading');
});

test('floors: never below 1,000 ft or half the reading, never 0 airborne, never above FL410', () => {
  const run = (alt, vs) => {
    const S = screen();
    S.poll({ spd: 200, alt, vs, age: 0 });
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 400; i++) { S.step(); lo = Math.min(lo, S.ft()); hi = Math.max(hi, S.ft()); }
    return { lo, hi };
  };
  assert.equal(run(3000, -2500).lo, 1500, 'half of 3,000');
  assert.equal(run(1700, -1500).lo, 1000, '1,000 ft, more than half of 1,700');
  assert.deepEqual(run(900, -900), { lo: 900, hi: 900 }, 'a reading under 1,000 ft is not carried down');
  assert.equal(run(40000, 1800).hi, 41000, 'a climb stops at FL410');
  assert.deepEqual(run(41500, 1800), { lo: 41500, hi: 41500 }, 'and above it nothing climbs');
});

test('a feed gap right after the first fix: carried at most 150 s, then held, never back', () => {
  for (const vs of [-1500, -2500, 1500]) {
    const f = steady(vs, vs < 0 ? 33000 : 4000);
    const b = replay('now', f, { kv: 20, others: true, gaps: [[60, 660]], secs: 900 });
    assert.equal(moves(b, Math.sign(vs)).back, 0, `vs ${vs}: never back`);
    const held = b.slice(200, 660).map((r) => r.ft);
    assert.equal(Math.min(...held), Math.max(...held), `vs ${vs}: held while nothing is heard`);
  }
});

// ── the ground, Arrived ────────────────────────────────────────────────────

test('touchdown in the first interval: 0 ft only after the ground fix, then nothing moves, and the held airborne numbers are not news', () => {
  const fin = flight({ alt: 2600, spd: 150, from: -60, plan: (t) => (t < 100 ? { vs: -800, level: 0, cap: 1, ds: -0.05 } : { ground: true, spd: 20 }) });
  const rows = replay('now', fin, {
    kv: 20, secs: 600,
    // the render's sticky fix and 3-minute hold hand the last airborne numbers back
    every(S, s) { if (s > 190 && s % 10 === 0) S.api._gateTelemSetReal(140, 780, null, null, S.inb); }
  });
  for (const r of rows) if (r.ft === 0) assert.ok(r.truth.ground, `second ${r.s}: 0 ft before the ground fix`);
  for (const r of rows) if (r.ft !== null && !r.truth.ground) assert.ok(r.ft >= 1000, `second ${r.s}: ${r.ft} ft airborne`);
  const g = rows.findIndex((r) => r.two && r.truth.ground);
  for (const r of rows.slice(g + 40)) {
    assert.equal(r.ft, 0, `second ${r.s}: on the ground`);
    assert.equal(r.kph, rows[g + 40].kph, `second ${r.s}: the ground speed as reported, not eased back up`);
  }
  assert.equal(moves(rows, -1).back, 0, 'never back up');
});

test('a load while the aircraft is on the ground paints 0 at once and holds it', () => {
  const S = screen();
  S.poll({ spd: 0, alt: 0, vs: 128, ground: true, age: 40 });
  S.api._animateGateTelem();
  assert.equal(S.ft(), 0);
  for (let i = 0; i < 300; i++) { S.step(); assert.equal(S.ft(), 0); assert.equal(S.kph(), 0); }
});

test('once the feed says Arrived with no ground fix, nothing moves (v24065 went on carrying)', () => {
  for (const at of [30, 150, 260]) {
    const f = flight({ alt: 6000, spd: 170, from: -60, plan: () => ({ vs: -900, level: 0, cap: 1, ds: -0.05 }) });
    const { a, b } = both((t) => Object.assign({}, f(t), { alt: Math.max(50, f(t).alt) }), { kv: 20, others: true, secs: 400, status: (s) => (s >= at ? 'Arrived' : 'En route') });
    for (let i = at + 1; i < b.length; i++) {
      assert.equal(b[i].ft, b[at].ft, `Arrived at ${at}: second ${i}`);
      assert.equal(b[i].kph, b[at].kph, `Arrived at ${at}: second ${i}`);
    }
    if (at === 260) assert.ok(a[400].ft < a[at].ft, 'set-up: v24065 kept moving');
  }
});

// ── another inbound ────────────────────────────────────────────────────────

test('another inbound for the same departure starts from nothing, and an answer for the one before is ignored', () => {
  const S = screen('now', 'AC100');
  S.poll({ spd: 250, alt: 9000, vs: -1000, age: 10 });
  S.step(70);
  S.poll({ spd: 245, alt: 7800, vs: -1000, age: 10 });   // a second fix: AC100's rate
  S.step(30);
  const T1 = S.win._gateTelemAnim;
  assert.equal(typeof T1.prevAlt, 'number');
  // the gate re-pairs to AC200 (the render's line before it builds the panel)
  const b = { flight: 'AC200', status: 'En route' };
  S.win._gateInbound = b; S.win._gatePanelInbound = b; S.win._gateTelemOwner = 'AC200';
  S.api._gateTelemReset('AC200');
  const T2 = S.win._gateTelemAnim;
  assert.notEqual(T2, T1, 'a new object');
  assert.deepEqual(Object.keys(T2).sort(), ['alt', 'realAlt', 'realSecToArr', 'realSpd', 'realTs', 'shimmerPh', 'spd', 'who'].sort(), 'nothing of AC100\'s survives');
  // AC100's late answer lands after the swap
  S.api._gateTelemSetReal(240, 7000, -1000, 10, 'AC100');
  assert.equal(S.win._gateTelemAnim.realAlt, null, 'not AC200\'s numbers');
  // AC200's first fix: its own first interval, from its own reading
  S.poll({ spd: 460, alt: 31000, vs: -1500, age: 10 });
  S.api._animateGateTelem();
  assert.equal(S.ft(), 31000, 'the first paint is AC200\'s reading');
  S.step(60);
  assert.equal(S.ft() < 31000 - 1000 && S.ft() > 31000 - 1600, true, `and it descends at AC200's own rate (${S.ft()})`);
  assert.notEqual(typeof S.win._gateTelemAnim.prevAlt, 'number', 'one fix only: AC100\'s is not the fix before');
});

test('numbers for another aircraft with no inbound on the gate (the poll\'s departure fallback) start from nothing too', () => {
  const S = screen('now', 'AC100');
  S.poll({ spd: 250, alt: 9000, vs: -1000, age: 10 });
  S.step(70);
  S.poll({ spd: 245, alt: 7800, vs: -1000, age: 10 });
  S.step(10);
  S.win._gateTelemOwner = '';                    // this render found no inbound
  S.api._gateTelemSetReal(300, 12000, 1500, 10, 'AC101');
  const T = S.win._gateTelemAnim;
  assert.equal(T.who, 'AC101');
  assert.notEqual(typeof T.prevAlt, 'number', 'AC100\'s fix is not the fix before');
  S.api._animateGateTelem();
  assert.equal(S.ft(), 12000, 'the first paint is the reading, not eased from AC100\'s');
});

test('the render resets the telemetry for a new inbound before it builds the panel, and the departure change uses the same reset', () => {
  const at = CORE.indexOf('window._gatePanelInbound = inboundFlight || null;');
  assert.ok(at > 0);
  const near = CORE.slice(at, at + 700);
  assert.match(near, /window\._gateTelemOwner = _gateTelemKey\(inboundFlight\);/);
  assert.match(near, /if \(window\._gateTelemOwner && \(window\._gateTelemAnim \|\| \{\}\)\.who !== window\._gateTelemOwner\) _gateTelemReset\(window\._gateTelemOwner\);/);
  const build = CORE.indexOf('gView.innerHTML = uxgGateHtml(', at);
  assert.ok(build > at, 'before the panel is built');
  assert.match(CORE, /\/\/ New flight → wipe the live-telemetry animator[\s\S]{0,300}_gateTelemReset\(window\._gateTelemOwner\);/);
  assert.doesNotMatch(CORE, /window\._gateTelemAnim = \{ spd:null/, 'no reset by hand that could miss a field');
});

// ── units, call sites ──────────────────────────────────────────────────────

test('units are unchanged: knots in, km/h and feet on the panel', () => {
  const S = screen();
  S.poll({ spd: 450, alt: 31000, vs: 0, age: 0 });
  S.api._animateGateTelem();
  assert.equal(S.spans['spd-kph'], (Math.round(450 * 1.852)).toLocaleString('en'));   // 833
  assert.equal(S.spans['alt-ft'], (31000).toLocaleString('en'));
});

test('the poll and the render hand over the answer\'s vertical speed and age only with its own numbers, and whose they are', () => {
  const poll = fnSource('_gateNumbersPoll');
  assert.match(poll, /_gateTelemSetReal\(_adsb\.spd, _adsb\.alt, \(_adsb\.onGround === true\) \? null : _adsb\.vs, _adsb\.age, inb\)/);
  assert.match(poll, /_gateTelemSetReal\(liveSpd, liveAlt, null, null, inb\)/);
  assert.equal((poll.match(/_gateTelemSetReal\(null, null, null, null, inb\)/g) || []).length, 2);
  const at = CORE.indexOf('function _buildV2MapCol(');
  const col = CORE.slice(at, CORE.indexOf('var _tAnim = window._gateTelemAnim', at));
  assert.match(col, /var _tFix = \(_adsbC && _adsbC\.onGround !== true && _liveAlt !== null && _liveAlt === _adsbC\.alt && _liveSpd === _adsbC\.spd\) \? _adsbC : null;/,
    'only when the numbers ARE the ADS-B answer, never a held reading');
  assert.match(col, /_gateTelemSetReal\(_liveSpd, _liveAlt, _tFix \? _tFix\.vs : null,/);
  assert.match(CORE, /_gateTelemSetReal\(liveSpd, liveAlt, null, null, _capturedInbound\)/);
});
