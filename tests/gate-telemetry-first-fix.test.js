'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24068 — THE GATE MAP'S ALTITUDE MOVES FROM THE FIRST FIX.
//
// After a gate screen loaded, the inbound's altitude digits sat still for
// minutes, then lurched. The model (_gateTelemModel) carries a rate only
// between TWO different fixes, and the Worker hands every screen the same
// Flightradar24 answer for up to 180 s, so a fresh screen held one fix and had
// nothing to carry until the second one arrived.
//
// What the board does now, and what these tests hold it to:
//   - on the aircraft's FIRST fix on this screen (airborne, not Arrived), and
//     only then, the altitude carries that fix's own vertical speed: only
//     1,000 ft/min or more (a level aircraft reads ±256 to ±768 in turbulence
//     at any level), at most 1,800 ft/min, for at most 150 s and the fix's
//     expected life; never below 1,000 ft or half the reading, never above
//     FL410; the speed holds;
//   - from the second different fix on, the model is v24065's own function,
//     character for character, and the speed digits are v24065's; the
//     altitude digits ease onto v24065's with its own 22 % step, but never
//     against the way the model is carrying the aircraft (500 ft/min or more,
//     with the newest reading agreeing) and never more than 30 ft in a second
//     beyond the model's own rate unless v24065's own digits move further,
//     and they are v24065's, number for number, from the second they meet;
//   - no one-second change is larger than v24065's that second, or 30 ft;
//   - on the ground the speed goes only to a ground fix's own speed (v24065
//     eased it back up to the panel's held airborne reading, at 0 ft); after
//     the feed's Arrived with no ground fix, nothing moves;
//   - a different inbound starts from nothing (every field), an answer for the
//     inbound before it is ignored, and the render no longer hands the new
//     inbound the shared live position of the one before;
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

const NEW_NAMES = ['_gateTelemKey', '_gateTelemReset', '_gateLivePosFor', '_gateTelemSetReal', '_gateTelemModel', '_gateTelemFirstVs',
  '_gateTelemFirstAlt', '_gateTelemOnGround', '_gateTelemStill', '_gateTelemRate', '_gateTelemAltStep', '_writeGateTelemDom', '_animateGateTelem'];
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

// The largest one-second change of the digits, and every second where the
// new build's digits moved further than v24065's did that same second (by
// more than 30 ft).
function stepsVs65(a, b, from, to) {
  let worstA = 0, worstB = 0;
  const over = [];
  for (let i = Math.max(1, from || 1); i < Math.min(b.length, to || b.length); i++) {
    if (a[i].ft === null || a[i - 1].ft === null || b[i].ft === null || b[i - 1].ft === null) continue;
    const da = Math.abs(a[i].ft - a[i - 1].ft), db = Math.abs(b[i].ft - b[i - 1].ft);
    worstA = Math.max(worstA, da); worstB = Math.max(worstB, db);
    if (db > Math.max(da, 30) + 1) over.push(`second ${i}: ${b[i - 1].ft} → ${b[i].ft} (v24065 ${a[i - 1].ft} → ${a[i].ft})`);
  }
  return { worstA, worstB, over };
}

// The real render lines of _buildV2MapCol that feed the digits: the
// candidates (the ADS-B answer, the row's own numbers, the shared live
// position), the sticky fix, the 3-minute hold and the anchor call, lifted
// verbatim and run after the gate render's line that records whose numbers
// these are (_gateTelemOwner).
function renderScreen() {
  const a = CORE.indexOf('      var _wpC = ');
  const b = CORE.indexOf('      var _tAnim = window._gateTelemAnim || {};', a);
  assert.ok(a > 0 && b > a, 'the render\'s telemetry lines');
  let now = T0;
  const spans = { 'spd-kph': '', 'alt-ft': '' };
  const els = Object.keys(spans).map((k) => ({ getAttribute: () => k, set textContent(v) { spans[k] = v; }, get textContent() { return spans[k]; } }));
  const win = { _gateTelemAnim: { spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0, realSecToArr: null, shimmerPh: 0 }, _adsbLast: {} };
  const names = NEW_NAMES.concat(['_gateStickyFix']);
  const src = 'var _gateFixCache = null; var _GATE_FIX_TTL = 240000; var ARR_CONFIRM_MIN = 30;\n'
    + 'function _gateTrackPush(){}\nfunction _gateLegWindowOpen(){ return true; }\nfunction _gateLiveFix(){ return null; }\nfunction _liveFixPhysOk(){ return true; }\n'
    + 'function _adsbCached(reg, cs, fl){ var v = window._adsbLast[String(fl || "")]; return (v && Date.now() - v.at < 90000) ? v : null; }\n'
    + names.map(fnSource).join('\n')
    + '\nfunction renderTelem(vars){ var _liveSpd = null, _liveAlt = null; var _ib = vars.inboundFlight;\n' + CORE.slice(a, b)
    + '\n return { liveSpd: _liveSpd, liveAlt: _liveAlt }; }\n'
    + 'return { renderTelem: renderTelem, ' + names.join(',') + ' };';
  const api = new Function('window', 'document', 'BoardStrings', 'Date', src)(win, { querySelectorAll: () => els }, { num: (v) => String(v) }, { now: () => now });
  return {
    api, win, spans,
    tick(sec) { now += sec * 1000; },
    step(n) { for (let k = 0; k < (n || 1); k++) { now += 1000; api._animateGateTelem(); } },
    // the gate render: whose numbers these are (before the panel is built), then the panel's telemetry lines
    render(inbound) {
      win._gatePanelInbound = inbound;
      win._gateTelemOwner = api._gateTelemKey(inbound);
      if (win._gateTelemOwner && (win._gateTelemAnim || {}).who !== win._gateTelemOwner) api._gateTelemReset(win._gateTelemOwner);
      win._gateInbound = inbound;
      return api.renderTelem({ inboundFlight: inbound, iata: 'YQM' });
    },
    // the 60 s poll's ADS-B branch for `inb`, in its own order: the shared
    // live position first (stamped with the flight), the row, then the anchor
    poll(inb, ans) {
      win._adsbLast[inb.flight] = Object.assign({ at: now, fl: inb.flight, via: 'flight', cs: '' }, ans);
      inb._liveAlt = ans.alt; inb._liveSpd = ans.spd;
      win._gateInboundLivePos = { lat: 46, lng: -64, speed: ans.spd, altitude: ans.alt, onGround: false, at: now - ans.age * 1000, fl: inb.flight, via: 'flight', cs: '' };
      api._gateTelemSetReal(ans.spd, ans.alt, ans.vs, ans.age, inb);
    },
    ft: () => (spans['alt-ft'] === '' ? null : Number(spans['alt-ft']))
  };
}

// ── v24065, kept ────────────────────────────────────────────────────────────

test('the model and the digit writer are v24065\'s, character for character', () => {
  assert.equal(sha(V65_SET_REAL), V65_HASH._gateTelemSetReal, 'the frozen v24065 anchor is the shipped text');
  assert.equal(sha(V65_ANIMATE), V65_HASH._animateGateTelem, 'the frozen v24065 animator is the shipped text');
  assert.equal(sha(fnSource('_gateTelemModel')), V65_HASH._gateTelemModel, '_gateTelemModel is unchanged');
  assert.equal(sha(fnSource('_writeGateTelemDom')), V65_HASH._writeGateTelemDom, '_writeGateTelemDom is unchanged');
});

test('the telemetry code asks for nothing: no request, no timer, and the earlier rounds\' helpers are gone', () => {
  for (const n of NEW_NAMES) {
    const s = fnSource(n);
    assert.doesNotMatch(s, /\bfetch\(|_adsbTelemetry|_adsbFetchOne|_adsbCached|XMLHttpRequest|setTimeout|setInterval|_flownCache|requestGateRebuild/, n);
  }
  for (const gone of ['_gateTelemFix', '_gateTelemCarry', '_gateTelemTrackPrev', '_gateTelemStep', '_gateTelemWay', '_gateTelemDown']) {
    assert.equal(CORE.indexOf('function ' + gone + '('), -1, gone + ' must be gone');
  }
  assert.doesNotMatch(fnSource('_adsbFetchOne'), /_rxAt/);
  assert.doesNotMatch(fnSource('_adsbTelemetry'), /taken:/);
});

test('with no vertical speed, or one under 1,000 ft/min, the digits are v24065\'s at every second', () => {
  // the feed's own position and the render's held numbers carry no vertical
  // speed; a level aircraft or a slow climb reads under 1,000
  for (const [vs, alt, withVs] of [[-1500, 24000, false], [2000, 9000, false], [0, 37000, true], [-768, 11275, true], [640, 3300, true], [-960, 20000, true]]) {
    const f = steady(vs, alt);
    const run = (build) => {
      const S = screen(build);
      const out = [];
      for (let s = 0; s <= 600; s++) {
        if (s >= 2 && (s - 2) % 120 === 0) {
          const r = f(s - 60);
          S.api._gateTelemSetReal(r.spd, r.alt, withVs ? vs : null, withVs ? 60 : null, S.inb);
        }
        S.api._animateGateTelem(); out.push(S.ft() + '/' + S.kph()); S.tick(1);
      }
      return out;
    };
    assert.deepEqual(run('now'), run('v24065'), `vs ${vs}, ${withVs ? 'with' : 'without'} the reading`);
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

test('from the second fix: v24065\'s model at every second, and its altitude digits within 40 s', () => {
  for (const [vs, alt] of [[-1000, 30000], [-1500, 30000], [-1800, 33000], [-2500, 36000], [1500, 3000], [2500, 3000], [-700, 20000]]) {
    for (const [name, o] of LOADS) {
      const { a, b } = both(steady(vs, alt), Object.assign({ secs: 700 }, o));
      const { i2, from } = blended(a, b);
      for (let i = i2; i < b.length; i++) assert.equal(b[i].model, a[i].model, `${vs} ${name}: the model at second ${i}`);
      assert.ok(from - i2 <= 40, `${vs} ${name}: blended ${from - i2} s after the second fix`);
      for (let i = from; i < b.length; i++) assert.equal(b[i].ft, a[i].ft, `${vs} ${name}: the digits at second ${i}`);
    }
  }
});

test('no one-second change is larger than v24065\'s that second, or 30 ft, and nothing goes back up a descent or down a climb that v24065 did not', () => {
  // steady, and slowing between the first fix and the second (the carry ends
  // up ahead of the second fix: the digits wait for the model)
  const profiles = [];
  for (const [vs, alt] of [[-1000, 30000], [-1800, 33000], [1500, 3000], [2200, 3000]]) profiles.push([Math.sign(vs), steady(vs, alt)]);
  for (const dir of [-1, 1]) {
    for (const [v1, v2, sw] of [[3000, 1000, 0], [1800, 900, -10], [2000, 500, -60], [2400, 1200, -20], [1500, 700, 60]]) {
      const a0 = dir < 0 ? 33000 : 4000;
      profiles.push([dir, flight({ alt: a0, spd: 380, from: -400, plan: (t) => ({ vs: dir * (t < sw ? v1 : v2), level: dir < 0 ? 2000 : 41000 }) })]);
    }
  }
  for (const [dir, f] of profiles) {
    for (const [name, o] of LOADS.concat([['10 s old', { kv: 10 }], ['5 s old, refreshed', { kv: 5, others: true }]])) {
      const { a, b } = both(f, Object.assign({ secs: 700 }, o));
      const st = stepsVs65(a, b);
      assert.deepEqual(st.over, [], `${name}: a one-second change larger than v24065's`);
      assert.ok(moves(b, dir).back <= moves(a, dir).back, `${name}: went back ${moves(b, dir).back} ft against the aircraft (v24065 ${moves(a, dir).back})`);
    }
  }
});

test('the second fix lands behind the carried digits: they wait, never jump on or back (the round-3 jump)', () => {
  // first fix 20,000 ft at −3,000 ft/min (carried at 1,800), the second 182 s
  // later at 17,000 ft and −1,000 ft/min: v24065 moves toward 17,000; the
  // carried digits are already at 15,500 and wait for the model there
  const run = (build) => {
    const S = screen(build);
    S.api._gateTelemSetReal(330, 20000, -3000, 5, S.inb);
    const out = [];
    for (let s = 1; s <= 400; s++) {
      S.tick(1);
      if (s === 182) S.api._gateTelemSetReal(328, 17000, -1000, 5, S.inb);
      S.api._animateGateTelem();
      out.push(S.ft());
    }
    return out;
  };
  const a = run('v24065'), b = run('now');
  assert.equal(b[180], 15500, 'set-up: carried to 15,500 ft');
  for (let i = 181; i < b.length; i++) {
    assert.ok(b[i] <= b[i - 1], `second ${i + 1}: ${b[i - 1]} → ${b[i]}, never back up`);
    assert.ok(b[i - 1] - b[i] <= Math.max(30, Math.abs(a[i] - a[i - 1])) + 1, `second ${i + 1}: no lurch on (${b[i - 1]} → ${b[i]})`);
  }
  const from = b.findIndex((x, i) => i > 181 && x === a[i]);
  assert.ok(from > 181 && from < 300, `v24065's digits from second ${from + 1}`);
  for (let i = from; i < b.length; i++) assert.equal(b[i], a[i], `second ${i + 1}`);
});

test('a fix that lands SHORT of the digits (the descent eased off but goes on) never winds them back up, and they are v24065\'s within 2 minutes', () => {
  // −1,800 ft/min until 30 s before the load, then −600
  const eased = flight({ alt: 30000, spd: 420, plan: (t) => (t < -30 ? { vs: -1800, level: 5000 } : { vs: -600, level: 5000 }) });
  const { a, b } = both(eased, { kv: 60, secs: 700 });
  const i2 = b.findIndex((r) => r.two);
  assert.ok(b[i2].ft < eased(i2 - 5).alt - 300, `set-up: the digits (${b[i2].ft}) are below the new fix's ${eased(i2 - 5).alt}`);
  assert.equal(moves(b, -1, 0, i2 + 120).back, moves(a, -1, 0, i2 + 120).back, 'no second back up that v24065 did not have');
  const { from } = blended(a, b);
  assert.ok(from - i2 <= 120, `v24065's digits ${from - i2} s after the second fix`);
});

// The same level-offs the previous rounds replayed. Each one levels AFTER the
// second fix of a load whose Worker copy was 60 s old: the digits are
// v24065's from the blend on, wind-back included (v24065's own rate rule runs
// past a level between two fixes, and that is unchanged here).
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

test('a level-off INSIDE the first interval: past the level by at most the carry, back at 30 ft/s at most, then v24065\'s digits', () => {
  // the aircraft levels 10 to 90 s after the load, after the fix the screen
  // carries was taken: the digits go past the level, and come back no faster
  // than an aircraft's own 1,800 ft/min once the next fix says it is level
  for (const L of [10, 40, 90]) {
    for (const [dir, start] of [[-1, 30000], [1, 12000]]) {
      const lvl = start + dir * 25 * (L + 120);
      for (const ds of [-0.05, 0]) {
        const truth = flight({ alt: start, spd: 380, from: -120, plan: () => ({ vs: dir * 1500, level: lvl, ds }) });
        const { a, b } = both(truth, { kv: 10, others: true, secs: 900 });
        const end = b.some((r) => r.two) ? blended(a, b).from : b.length;
        const m = moves(b, dir, 0, end);
        assert.ok(m.worstBack <= 30, `L ${L} dir ${dir} ds ${ds}: largest one-second move back ${m.worstBack} ft before the blend ended`);
        for (let i = end; i < b.length; i++) assert.equal(b[i].ft, a[i].ft, `L ${L} dir ${dir} ds ${ds}: v24065's digits at second ${i}`);
        const carried = Math.max(...b.filter((r) => !r.two && r.ft !== null).map((r) => (r.ft - b[2].ft) * dir));
        assert.ok(carried > 0 && carried <= 150 * 25 + 1, `carried ${carried} ft: never more than 150 s of the fix's vertical speed`);
        assert.ok(end < 900, `L ${L} dir ${dir}: v24065's digits from second ${end}`);
      }
    }
  }
});

test('a level-off before the second fix: the newest reading says level, so the digits come back (30 ft/s at most) instead of waiting', () => {
  // descending 1,800 ft/min, levelling 0 to 20 s before the load; the fix the
  // screen carries is 65 s old, so the model's own rate between the two fixes
  // still says descending, and only the newest reading's vertical speed (0)
  // says the aircraft has stopped
  for (const lv of [-20, -10, 0]) {
    const at = flight({ alt: 30000, spd: 420, from: -400, plan: (t) => (t < lv ? { vs: -1800, level: 2000 } : { vs: 0, level: 0 }) })(lv).alt;
    const f = flight({ alt: 30000, spd: 420, from: -400, plan: () => ({ vs: -1800, level: at, cap: 3 }) });
    const { a, b } = both(f, { kv: 60, secs: 700 });
    const { i2, from } = blended(a, b);
    assert.ok(b[i2].ft < at - 1000, `set-up (level ${lv} s): carried past the level, to ${b[i2].ft}`);
    assert.ok(b[i2 + 30].ft > b[i2].ft + 500, `level ${lv} s: coming back up (${b[i2].ft} → ${b[i2 + 30].ft})`);
    assert.ok(moves(b, -1, i2, from).worstBack <= 30, `level ${lv} s: no faster than 30 ft/s`);
    assert.ok(from - i2 <= 90, `level ${lv} s: v24065's digits ${from - i2} s after the second fix`);
  }
});

test('an airborne first fix next to a ground fix the row still carries is not carried, then or once the flag goes', () => {
  // the board calls the aircraft on the ground (its row's ground flag) while
  // the answer says airborne: v24065's model holds 0 ft; nothing is carried,
  // and when the feed rebuilds the row the digits are v24065's
  const run = (build) => {
    const S = screen(build);
    S.inb._liveOnGround = true;
    S.poll({ spd: 160, alt: 1500, vs: 2500, age: 5 });
    const out = [];
    for (let s = 0; s <= 400; s++) {
      if (s === 120) { const nr = { flight: 'WS812', status: 'En route' }; S.win._gateInbound = nr; S.win._gatePanelInbound = nr; }
      S.api._animateGateTelem(); out.push(S.ft() + '/' + S.kph()); S.tick(1);
    }
    return out;
  };
  assert.deepEqual(run('now'), run('v24065'));
});

// ── the carry's bounds ─────────────────────────────────────────────────────

test('the carry: the fix\'s own vertical speed, 1,000 ft/min or more, at most 1,800, for at most 150 s and its expected life', () => {
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
  assert.equal(carried(-960, 0, 20500, 60), 0, 'under 1,000 ft/min is not carried');
  assert.equal(carried(768, 0, 10700, 60), 0, '768 ft/min at 10,700 ft (a level read as pressure altitude) is turbulence');
  assert.equal(carried(1024, 0, 9900, 60), 1024, '1,024 ft/min is a climb');
});

test('turbulence of ±256 to ±768 ft/min stays level at any level, on every load, and is v24065\'s digit for digit', () => {
  // below the transition level the altitude is pressure altitude: a level
  // aircraft reads 10,700, 11,275 or 3,300 ft as readily as 11,000
  for (const alt of [37000, 36975, 24500, 11275, 11000, 10700, 6400, 3300]) {
    for (const bump of [256, 512, 640, 768]) {
      for (const pat of ['same', 'alternate']) {
        const truth = (t) => {
          const k = Math.floor((t + 9000) / 60);
          return { alt, spd: 300, vs: pat === 'same' ? bump : ((k % 2) ? bump : -bump) };
        };
        for (const [name, o] of LOADS.concat([['5 s old', { kv: 5 }]])) {
          const { a, b } = both(truth, Object.assign({ secs: 900 }, o));
          for (let i = 0; i < b.length; i++) {
            if (b[i].ft !== null) assert.equal(b[i].ft, alt, `${alt} ft, ${pat} ±${bump}, ${name}, second ${i}`);
            assert.equal(b[i].ft, a[i].ft, `${alt} ft, ${pat} ±${bump}, ${name}, second ${i}: v24065's`);
          }
        }
      }
    }
  }
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
  assert.deepEqual(run(900, -1200), { lo: 900, hi: 900 }, 'a reading under 1,000 ft is not carried down');
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

test('only the aircraft\'s first fix on this screen is carried: after a gap that dropped the numbers, the next fix is v24065\'s', () => {
  const f = steady(-1800, 33000);
  const run = (build) => {
    const S = screen(build);
    const out = [];
    for (let s = 0; s <= 700; s++) {
      if (s === 2 || s === 182) { const r = f(s - 10); S.poll({ spd: r.spd, alt: r.alt, vs: r.vs, age: 10 }); }
      if (s === 300) S.api._gateTelemSetReal(null, null, null, null, S.inb);    // the panel lost the fix (gap past the hold)
      if (s === 420 || s === 600) { const r = f(s - 10); S.poll({ spd: r.spd, alt: r.alt, vs: r.vs, age: 10 }); }
      S.api._animateGateTelem(); out.push(S.ft()); S.tick(1);
    }
    return out;
  };
  const a = run('v24065'), b = run('now');
  assert.ok(b[100] < a[100] - 1000, 'set-up: the first fix was carried');
  for (let i = 420; i < b.length; i++) assert.equal(b[i], a[i], `second ${i}: v24065's after the gap`);
});

// ── the ground, Arrived ────────────────────────────────────────────────────

test('touchdown in the first interval: 0 ft only after the ground fix, then the ground fix\'s own speed, not the held airborne one', () => {
  for (const vs of [-800, -1100]) {
    const fin = flight({ alt: 3000, spd: 150, from: -60, plan: (t) => (t < 100 ? { vs, level: 0, cap: 1, ds: -0.05 } : { ground: true, spd: 20 }) });
    const { a, b } = both(fin, {
      kv: 20, secs: 600,
      // the render's sticky fix and 3-minute hold hand the last airborne numbers back
      every(S, s) { if (s > 190 && s % 10 === 0) S.api._gateTelemSetReal(140, 780, null, null, S.inb); }
    });
    for (const r of b) if (r.ft === 0) assert.ok(r.truth.ground, `vs ${vs}, second ${r.s}: 0 ft before the ground fix`);
    for (const r of b) if (r.ft !== null && !r.truth.ground) assert.ok(r.ft >= 1000, `vs ${vs}, second ${r.s}: ${r.ft} ft airborne`);
    const g = b.findIndex((r) => r.two && r.truth.ground);
    for (const r of b.slice(g + 40)) {
      assert.equal(r.ft, 0, `vs ${vs}, second ${r.s}: on the ground`);
      assert.equal(r.kph, b[g + 40].kph, `vs ${vs}, second ${r.s}: the ground speed as reported, not eased back up`);
    }
    assert.ok(a[500].kph > b[500].kph + 100, `set-up: v24065 eased the speed back up to ${a[500].kph} km/h at 0 ft`);
    assert.equal(moves(b, -1).back, 0, 'never back up');
  }
});

test('a load while the aircraft is on the ground paints 0 at once and holds it', () => {
  const S = screen();
  S.poll({ spd: 0, alt: 0, vs: 128, ground: true, age: 40 });
  S.api._animateGateTelem();
  assert.equal(S.ft(), 0);
  for (let i = 0; i < 300; i++) { S.step(); assert.equal(S.ft(), 0); assert.equal(S.kph(), 0); }
});

test('a take-off after a ground fix at the origin: every airborne answer is anchored as v24065 anchors it, the altitude is v24065\'s every second', () => {
  // taxiing at the origin when the gate loads (the row keeps its ground flag
  // until the feed rebuilds it, here at 300 s), off at 120 s, 2,500 ft/min
  const f = flight({ alt: 0, spd: 0, from: -600, plan: (t) => (t < 120 ? { ground: true, spd: 15 } : { vs: 2500, level: 33000, ds: 0.6 }) });
  const run = (build) => {
    const S = screen(build);
    const out = [];
    for (let s = 0; s <= 700; s++) {
      if (s === 300) { const nr = { flight: 'WS812', status: 'En route' }; S.win._gateInbound = nr; S.win._gatePanelInbound = nr; }
      if (s >= 2 && (s - 2) % 60 === 0) { const r = f(s - 20); S.poll({ spd: r.spd, alt: r.alt, vs: r.vs, ground: !!r.ground, age: 20 }); }
      S.api._animateGateTelem();
      const T = S.win._gateTelemAnim;
      out.push({ ft: S.ft(), kph: S.kph(), anchor: T.realTs + ':' + T.realAlt + ':' + T.realSpd + ':' + T.prevAlt, exact: (build === 'now') ? T.spd === T.spd65 : true });
      S.tick(1);
    }
    return out;
  };
  const a = run('v24065'), b = run('now');
  for (let i = 0; i < b.length; i++) {
    assert.equal(b[i].anchor, a[i].anchor, `second ${i}: the same anchor`);
    assert.equal(b[i].ft, a[i].ft, `second ${i}: the same altitude`);
  }
  // while the board still calls it on the ground, the speed holds the ground
  // fix's (v24065 eased it up at 0 ft); airborne, it is v24065's within 30 s
  for (let i = 3; i < 300; i++) assert.equal(b[i].kph, b[2].kph, `second ${i}: on the ground, the taxi speed`);
  for (let i = 330; i < b.length; i++) {
    assert.equal(b[i].kph, a[i].kph, `second ${i}: airborne, v24065's speed`);
    assert.ok(b[i].exact, `second ${i}: v24065's number exactly, not one that rounds the same`);
  }
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
  assert.ok(S.ft() < 31000 - 1000 && S.ft() > 31000 - 1600, `and it descends at AC200's own rate (${S.ft()})`);
  assert.notEqual(typeof S.win._gateTelemAnim.prevAlt, 'number', 'one fix only: AC100\'s is not the fix before');
});

test('the render, on an inbound swap: the aircraft before\'s numbers are not handed to the new one, from the shared live position or a late answer', () => {
  const R = renderScreen();
  const A = { flight: 'WS812', status: 'En route' };
  const B = { flight: 'PD522', status: 'En route' };
  R.render(A);
  R.poll(A, { spd: 250, alt: 9000, vs: -1024, age: 5 });
  for (let s = 0; s < 100; s++) { if (s % 10 === 0) R.render(A); R.step(); }
  assert.ok(R.ft() < 9000, `set-up: WS812 shown descending (${R.ft()})`);
  // the gate re-pairs to PD522 for the same departure; PD522 has no answer
  // yet, and the shared live position is still WS812's
  let p = R.render(B);
  assert.equal(R.win._gateInboundLivePos.fl, 'WS812', 'set-up: the shared position is still the aircraft before\'s');
  assert.equal(p.liveAlt, null, 'the panel shows no altitude for PD522');
  assert.equal(R.win._gateTelemAnim.who, 'PD522');
  assert.equal(R.win._gateTelemAnim.realAlt, null, 'and nothing of WS812\'s is anchored');
  // WS812's poll was in flight: it lands 3 s later and writes the shared position again
  R.tick(3);
  R.poll(A, { spd: 248, alt: 8000, vs: -1024, age: 5 });
  p = R.render(B);
  assert.equal(p.liveAlt, null, 'still nothing on PD522\'s panel');
  assert.equal(R.win._gateTelemAnim.realAlt, null, 'and nothing anchored');
  for (let s = 0; s < 57; s++) { if (s % 10 === 0) R.render(B); R.step(); }
  // PD522's own first answer: descending through 31,000
  R.poll(B, { spd: 460, alt: 31000, vs: -1536, age: 5 });
  R.render(B);
  const T = R.win._gateTelemAnim;
  assert.equal(T.nFix, 1, 'PD522\'s first fix is its first');
  assert.notEqual(typeof T.prevAlt, 'number');
  let prev = 31000;
  for (let s = 0; s < 120; s++) {
    if (s % 10 === 0) R.render(B);
    R.step();
    if (s > 2) assert.ok(R.ft() <= prev, `second ${s}: ${prev} → ${R.ft()}, descending, never the aircraft before's rate`);
    prev = R.ft();
  }
  assert.ok(prev < 31000 - 2500 && prev > 31000 - 3200, `PD522 descends at its own 1,536 ft/min (${prev} after 120 s)`);
});

test('_gateLivePosFor: the shared live position only for the flight it was asked for', () => {
  const R = renderScreen();
  R.win._gateInboundLivePos = { speed: 250, altitude: 9000, fl: 'WS812' };
  assert.equal(R.api._gateLivePosFor({ flight: 'WS 812' }), R.win._gateInboundLivePos, 'the same flight, spaced');
  assert.equal(R.api._gateLivePosFor({ flight: 'PD522' }), null, 'another flight');
  R.win._gateInboundLivePos = { speed: 250, altitude: 9000 };
  assert.equal(R.api._gateLivePosFor({ flight: 'PD522' }), R.win._gateInboundLivePos, 'unstamped, as before');
  R.win._gateInboundLivePos = null;
  assert.equal(R.api._gateLivePosFor({ flight: 'PD522' }), null);
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
  assert.match(col, /var _wpC = _gateLivePosFor\(_ib\);/, 'the shared live position only when it is this inbound\'s');
  const toAnchor = col.slice(col.indexOf('var _ib = vars.inboundFlight;')).replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(toAnchor, /window\._gateInboundLivePos/, 'and no other read of it on the way to the anchor');
  assert.match(col, /var _tFix = \(_adsbC && _adsbC\.onGround !== true && _liveAlt !== null && _liveAlt === _adsbC\.alt && _liveSpd === _adsbC\.spd\) \? _adsbC : null;/,
    'only when the numbers ARE the ADS-B answer, never a held reading');
  assert.match(col, /_gateTelemSetReal\(_liveSpd, _liveAlt, _tFix \? _tFix\.vs : null,/);
  assert.match(CORE, /_gateTelemSetReal\(liveSpd, liveAlt, null, null, _capturedInbound\)/);
});
