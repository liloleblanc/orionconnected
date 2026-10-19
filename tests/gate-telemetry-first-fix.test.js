'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24068 — THE GATE MAP'S SPEED AND ALTITUDE MOVE FROM THE FIRST SECOND.
//
// After a load, the inbound's speed and altitude digits sat still for minutes,
// then lurched and started moving. The model (_gateTelemModel) only carried a
// climb or descent between TWO DIFFERENT fixes, and the Worker re-serves one
// Flightradar24 answer to every screen for up to 180 s (KV adsbans:v1:), so a
// fresh screen had one fix and nothing to measure a rate from until the
// Worker's copy expired and a second answer arrived. Replayed on the old code:
// 24,000 ft for 119 s, then 990 ft in one second as it caught up.
//
// What the board does now, and what these tests hold it to:
//   - every Flightradar24 fix's own vertical speed is an altitude rate from
//     the first second; the flight's recorded track (/fltrack/, which now
//     keeps the ground speed) is the fix before, so the speed has a measured
//     rate from the first second too;
//   - a rate is carried for at most 135 s past its fix (all of it for 45 s,
//     then less and less until 225 s), at the SMALLER of the
//     vertical speed and the two-fix rate, at most 1,800 ft/min: an aircraft
//     that levels off between two fixes is not carried far past its level;
//   - the digits never jump: behind, they catch up no faster than the
//     aircraft's own rate plus 40 ft/s; ahead of an aircraft still going that
//     way, they never go back; only a fix that says it stopped brings them
//     back, at 30 ft/s;
//   - a carried descent never takes the digits below half the reading, so no
//     airborne aircraft reads 0 ft; on the ground, or once the feed says
//     Arrived, nothing moves;
//   - an answer is timed when its position was taken, and the Worker's edge
//     copy now ages like its KV copy (a copy that said seen_pos 4 for three
//     minutes had the digits carried from the wrong moment).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const workerPath = path.resolve(__dirname, '..', 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(workerPath, 'utf8');
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
const NAMES = ['_gateTelemFix', '_gateTelemSetReal', '_gateTelemCarry', '_gateTelemTrackPrev', '_gateTelemModel',
  '_writeGateTelemDom', '_animateGateTelem', '_gateTelemStep'];
const SRC = NAMES.map(fnSource).join('\n');
const FLIGHT = 'WS812';
const T0 = Date.UTC(2026, 9, 19, 15, 0, 0);

// One gate screen: the telemetry functions as the board runs them, a clock
// this test moves, the two digit spans the panel paints, and the flown-track
// cache the map fills from /fltrack/.
function screen() {
  let now = T0;
  const spans = { 'spd-kph': '', 'alt-ft': '' };
  const els = Object.keys(spans).map((k) => ({
    getAttribute: () => k,
    set textContent(v) { spans[k] = v; },
    get textContent() { return spans[k]; }
  }));
  const win = { _gateTelemAnim: { spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0, realSecToArr: null, shimmerPh: 0 },
    _gateInbound: { flight: FLIGHT, status: '' } };
  const flown = {};
  const api = new Function('window', 'document', 'BoardStrings', 'Date', '_flownCache', SRC + '\nreturn {' + NAMES.join(',') + '};')(
    win, { querySelectorAll: () => els }, { num: (v) => Number(v).toLocaleString('en') }, { now: () => now }, flown);
  const num = (s) => (s === '' ? null : Number(String(s).replace(/,/g, '')));
  return {
    api, win, spans, flown,
    now: () => now,
    tick(sec) { now += sec * 1000; },
    // An _adsbTelemetry answer as the poll hands it over: taken `age` s ago.
    answer(f, age) {
      return { spd: f.spd, alt: f.ground ? 0 : f.alt, vs: f.vs, onGround: !!f.ground, at: now, age: age || 0 };
    },
    poll(r) { api._gateTelemSetReal(r.spd, r.alt, api._gateTelemFix(r)); },
    ft: () => num(spans['alt-ft']),
    kph: () => num(spans['spd-kph'])
  };
}

// An aircraft, second by second: plan(t) gives the commanded vertical speed
// (ft/min), the level it is cleared to (captured as an autopilot does, the
// climb or descent easing off over the last few hundred feet) and the speed
// trend (kt/s). Level before `from`.
function flight(o) {
  const from = (o.from != null) ? o.from : -400, to = 1000, tab = {};
  let alt = o.alt, spd = o.spd;
  for (let t = -1500; t < from; t++) tab[t] = { alt: Math.round(alt), spd: Math.round(spd), vs: 0 };
  for (let t = from; t <= to; t++) {
    const p = o.plan(t);
    if (p.ground) { alt = 0; spd = p.spd; tab[t] = { alt: 0, spd, vs: 0, ground: true }; continue; }
    let v = (p.vs || 0) / 60;
    if (typeof p.level === 'number') {
      const lim = (p.level - alt) / (p.cap || 8);
      v = (v < 0) ? Math.max(v, Math.min(0, lim)) : Math.min(v, Math.max(0, lim));
    }
    alt += v; spd += (p.ds || 0);
    tab[t] = { alt: Math.round(alt), spd: Math.round(spd), vs: Math.round(v * 60 / 64) * 64 };
  }
  return (t) => tab[Math.max(-1500, Math.min(to, Math.round(t)))];
}

// A gate load, replayed. The Worker holds each Flightradar24 answer 180 s
// (fetched `age` s before the load, the position 3 s older than that); the
// board asks every 60 s from 2 s after the load; the digits step every second.
//   others   another screen refreshes the Worker's copy the moment it expires
//   track    the Worker records each answer in the flight's track, with its
//            ground speed, and the map's flown-track cache holds it
//   frozen   the answers' seen_pos never advances (the old edge copy)
//   gaps     [from, to) windows in which Flightradar24 has nothing
function replay(truth, opts) {
  opts = opts || {};
  const S = screen();
  const LAG = 3, secs = opts.secs || 600, age0 = (opts.age != null) ? opts.age : 60;
  const inGap = (t) => (opts.gaps || []).some(([a, b]) => t >= a && t < b);
  const pts = [];
  const record = (t) => { if (opts.track) { const f = truth(t - LAG); pts.push([0, 0, f.ground ? 0 : f.alt, Math.round((T0 + (t - LAG) * 1000) / 1000), f.spd]); } };
  for (let t = -age0 - 720; t < -age0; t += 180) record(t);
  let kv = null;
  if (!inGap(-age0)) { kv = { at: -age0 }; record(-age0); }
  const rows = [];
  for (let s = 0; s <= secs; s++) {
    if (opts.others && (!kv || s - kv.at >= 180) && !inGap(s)) { kv = { at: s }; record(s); }
    if (s >= 2 && (s - 2) % 60 === 0) {
      if (!kv || s - kv.at >= 180) { if (!inGap(s)) { kv = { at: s }; record(s); } else kv = null; }
      if (opts.track) S.flown[FLIGHT] = { at: S.now(), rec: { pts: pts.slice() } };
      if (kv) {
        const f = truth(kv.at - LAG);
        const seen = LAG + (opts.frozen ? 0 : s - kv.at);
        if (f.ground) S.win._gateInboundLivePos = { onGround: true };
        S.poll({ spd: f.spd, alt: f.ground ? 0 : f.alt, vs: f.vs, onGround: !!f.ground, at: S.now(), age: seen });
      }
    }
    if (opts.everySecond) opts.everySecond(S, s);
    S.api._animateGateTelem();
    rows.push({ s, ft: S.ft(), kph: S.kph(), truth: truth(s) });
    S.tick(1);
  }
  return rows;
}

// What a replay did, against the way the aircraft was going (dir).
function moves(rows, dir) {
  let back = 0, worstBack = 0, worst = 0, worstKph = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].ft === null || rows[i - 1].ft === null) continue;
    const d = rows[i].ft - rows[i - 1].ft;
    if (d * dir < 0) { back += -d * dir; worstBack = Math.max(worstBack, Math.abs(d)); }
    worst = Math.max(worst, Math.abs(d));
    worstKph = Math.max(worstKph, Math.abs(rows[i].kph - rows[i - 1].kph));
  }
  return { back, worstBack, worst, worstKph };
}

const descent = (t) => ({   // −1,500 ft/min, then −1,800 from t = 200
  alt: Math.round(t < 200 ? 24000 - 25 * (t + 60) : 24000 - 25 * 260 - 30 * (t - 200)),
  spd: Math.round(450 - 0.12 * (t + 60)),
  vs: t < 200 ? -1500 : -1800
});

// ── moves from the first second ─────────────────────────────────────────────

test('descending: the altitude falls every second from the first fix, not after the Worker\'s 180 s', () => {
  const rows = replay(descent, { secs: 420 });
  for (let i = 3; i <= 120; i++) {
    assert.ok(rows[i].ft < rows[i - 1].ft, `second ${i}: ${rows[i - 1].ft} → ${rows[i].ft} must be lower`);
  }
  // and it is where the aeroplane is: the answer was 62 s old when it landed
  const atLoad = rows[3].ft;
  assert.ok(Math.abs(atLoad - descent(3).alt) < 200, `first paint ${atLoad} ft, aircraft at ${descent(3).alt} ft`);
});

test('climbing: the altitude rises every second from the first fix', () => {
  const climb = (t) => ({ alt: Math.round(8000 + (2400 / 60) * (t + 30)), spd: Math.round(280 + 0.1 * (t + 30)), vs: 2400 });
  const rows = replay(climb, { age: 30, secs: 150 });
  for (let i = 3; i <= 150; i++) assert.ok(rows[i].ft > rows[i - 1].ft, `second ${i}: ${rows[i - 1].ft} → ${rows[i].ft} must be higher`);
});

test('the speed moves from the first seconds too, from the fix before in the flight\'s track', () => {
  for (const [name, f, dir] of [
    ['descent', flight({ alt: 33000, spd: 470, plan: () => ({ vs: -1500, level: 3000, ds: -0.12 }) }), -1],
    ['climb', flight({ alt: 9000, spd: 300, plan: () => ({ vs: 2000, level: 37000, ds: 0.12 }) }), 1],
    ['step-down', flight({ alt: 26000, spd: 400, plan: (t) => (t < 340 ? { vs: -1800, level: 11000, ds: -0.1 } : { vs: -1500, level: 6000, ds: -0.05 }) }), -1]
  ]) {
    const rows = replay(f, { track: true, secs: 400 });
    const first = rows.findIndex((r) => r.kph !== null);
    const moved = rows.findIndex((r, i) => i > first && r.kph !== rows[first].kph);
    assert.ok(moved > 0 && moved - first <= 20, `${name}: the km/h digits first changed ${moved - first} s after the first paint`);
    assert.ok((rows[moved].kph - rows[first].kph) * dir > 0, `${name}: and the right way`);
    const m = moves(rows, dir);
    assert.ok(m.worstKph <= 4, `${name}: largest one-second speed change ${m.worstKph} km/h (the old rule: 10 to 15 when the second fix landed)`);
  }
});

test('with no track yet, the speed holds as reported until a second fix, then blends in without a jump', () => {
  const rows = replay(descent, { secs: 420 });
  for (let i = 3; i <= 121; i++) assert.equal(rows[i].kph, rows[3].kph, `second ${i}: steady until the second fix`);
  for (let i = 123; i < rows.length; i++) {
    assert.ok(rows[i].kph <= rows[i - 1].kph, `second ${i}: ${rows[i - 1].kph} → ${rows[i].kph} km/h went back up while slowing`);
    assert.ok(rows[i - 1].kph - rows[i].kph <= 4, `second ${i}: ${rows[i - 1].kph} → ${rows[i].kph} km/h is a jump`);
  }
  assert.ok(rows[400].kph < rows[200].kph, 'and it keeps slowing between fixes, at the measured rate');
});

// ── the next real fix blends in ─────────────────────────────────────────────

test('the next real fix blends in: no second goes back up a descent, and no lurch', () => {
  for (const others of [false, true]) {
    const rows = replay(descent, { secs: 420, others });
    const m = moves(rows, -1);
    assert.equal(m.back, 0, 'never back up');
    assert.ok(m.worst < 150, `largest one-second change ${m.worst} ft (the old rule: 990 ft as the second fix landed)`);
  }
});

test('a fix that lands SHORT of the digits (the descent eased off but goes on) never winds them back up', () => {
  // −1,800 ft/min until 30 s before the load, then −600: the next fix is
  // above where the first fix's rate had carried the digits
  const eased = flight({ alt: 30000, spd: 420, plan: (t) => (t < -30 ? { vs: -1800, level: 5000 } : { vs: -600, level: 5000 }) });
  const rows = replay(eased, { secs: 600 });
  assert.ok(rows[121].ft < eased(122).alt - 500, `set-up: the digits (${rows[121].ft}) are well below the new fix's ${eased(122).alt}`);
  assert.equal(moves(rows, -1).back, 0, 'not one second back up');
  assert.ok(Math.abs(rows[600].ft - eased(600).alt) < 400, `and they meet the aircraft again: ${rows[600].ft} vs ${eased(600).alt}`);
});

// ── level-offs between fixes ────────────────────────────────────────────────
// The Worker shares a new fix every three to four minutes; an aircraft that
// levels off between two fixes was carried past its level and the digits
// then wound back. The first round of this change carried a fix's vertical
// speed 240 s at up to 6,000 ft/min and made it worse. The numbers in
// `before` are what the v24065 rule wound back in these same replays.
const LEVEL_OFFS = [
  ['a descent levelling at 17,700 ft', -1, 2521, { alt: 32450, spd: 470, plan: (t) => ({ vs: -1500, level: 17700, ds: t < 190 ? -0.12 : 0 }) }],
  ['a descent levelling just after the first fix', -1, 1908, { alt: 33500, spd: 470, plan: () => ({ vs: -1500, level: 23500, ds: -0.05 }) }],
  ['a climb levelling at 38,400 ft', 1, 1033, { alt: 14400, spd: 400, plan: (t) => ({ vs: 2400, level: 38400, ds: t < 200 ? 0.1 : 0 }) }],
  ['a climb to FL350', 1, 3638, { alt: 8333, spd: 380, plan: () => ({ vs: 2000, level: 35000, ds: 0.08 }) }],
  ['a step-down at 11,000 ft', -1, 6907, { alt: 26000, spd: 400, plan: (t) => (t < 340 ? { vs: -1800, level: 11000, ds: -0.1 } : { vs: -1500, level: 6000, ds: -0.05 }) }],
  ['a step-down at 12,000 ft', -1, 5407, { alt: 31500, spd: 380, plan: (t) => (t < 450 ? { vs: -1800, level: 12000, ds: -0.1 } : { vs: -1500, level: 8000, ds: -0.05 }) }],
  ['a climb with a slow capture', 1, 3697, { alt: 12000, spd: 420, plan: () => ({ vs: 2200, level: 34000, cap: 45, ds: 0.06 }) }],
  ['a -2,500 ft/min descent levelling at 4,000 ft', -1, 4083, { alt: 26900, spd: 330, plan: () => ({ vs: -2500, level: 4000, ds: -0.1 }) }]
];
for (const [name, dir, before, o] of LEVEL_OFFS) {
  test(`level-off between fixes, ${name}: winds back less than before, and never faster than 30 ft/s`, () => {
    for (const track of [false, true]) {
      const rows = replay(flight(o), { secs: 900, track });
      const m = moves(rows, dir);
      assert.ok(m.worstBack <= 30, `largest one-second move back ${m.worstBack} ft`);
      assert.ok(m.back < before, `wound back ${m.back} ft in all (v24065: ${before} ft)`);
      assert.ok(m.worst < 200, `largest one-second change ${m.worst} ft`);
    }
  });
}

test('a carried rate never runs far past a level: at most 135 s of it, at most 1,800 ft/min', () => {
  const S = screen();
  S.poll(S.answer({ alt: 20000, spd: 400, vs: -6000 }, 0));
  for (const [sec, want] of [[30, 20000 - 30 * 30], [45, 20000 - 30 * 45], [240, 20000 - 30 * 135], [900, 20000 - 30 * 135]]) {
    S.tick(sec - (S.now() - T0) / 1000);
    assert.equal(Math.round(S.api._gateTelemModel().alt), want, `${sec} s after the fix`);
  }
  const c = S.api._gateTelemCarry;
  assert.deepEqual([c(0).c, c(45).c, c(135).c, c(225).c, c(600).c], [0, 45, 112.5, 135, 135]);
  assert.deepEqual([c(30).k, c(45).k, c(135).k, c(225).k], [1, 1, 0.5, 0]);
});

test('the vertical speed and the two-fix rate: the smaller, in the way they agree; level is level; a disagreement carries nothing', () => {
  const rate = (prevAlt, alt, vs) => {
    const S = screen();
    S.poll(S.answer({ alt: prevAlt, spd: 400, vs: -1500 }, 0));
    S.tick(180);
    S.poll(S.answer({ alt, spd: 400, vs }, 0));
    return Math.round(S.api._gateTelemModel().altRate * 60);
  };
  assert.equal(rate(24000, 21000, -1500), -1000, 'slowed to -1,000 on average: that, not -1,500');
  assert.equal(rate(24000, 18600, -1500), -1500, 'the vertical speed when it is the smaller');
  assert.equal(rate(24000, 21000, 0), 0, 'it reads level now');
  assert.equal(rate(24000, 24600, -1500), 0, 'the fixes climbed, the vertical speed says descending: nothing');
});

// ── gaps, captures and the ground ───────────────────────────────────────────

test('a 10-minute feed gap: a descent that levels during it is held, never wound back when the feed returns', () => {
  const f = flight({ alt: 28830, spd: 420, plan: () => ({ vs: -1800, level: 10200, ds: -0.08 }) });
  for (const track of [false, true]) {
    const rows = replay(f, { secs: 900, gaps: [[60, 700]], track });
    const m = moves(rows, -1);
    assert.equal(m.back, 0, `wound back ${m.back} ft`);
    assert.ok(m.worst < 400, `largest one-second change ${m.worst} ft as the feed returned`);
    // held while nothing is heard: nothing carried past 135 s of the last rate
    const held = rows.slice(300, 700).map((r) => r.ft);
    assert.equal(Math.min(...held), Math.max(...held), 'held still while the feed is silent');
  }
});

test('a capture that reads its level with -400 ft/min, then level fixes with the same numbers: the rate is cancelled at the next fix', () => {
  const cap = (t) => (t < -8 ? { alt: Math.round(10000 + (400 / 60) * (-8 - t)), spd: 300, vs: -400 }
                             : { alt: 10000, spd: 300, vs: t === -8 ? -400 : 0 });
  const rows = replay(cap, { age: 5, secs: 900 });
  const low = Math.min(...rows.filter((r) => r.ft !== null).map((r) => r.ft));
  assert.ok(low >= 10000 - 135 * 400 / 60 - 1, `never carried past 135 s of -400 ft/min (lowest ${low})`);
  assert.ok(moves(rows, -1).worstBack <= 30, 'and back at an aircraft\'s pace');
  for (const r of rows.slice(400)) assert.equal(r.ft, 10000, `second ${r.s}: back on the level every fix reports`);
});

test('no airborne aircraft reads 0 ft: coverage lost on a low approach that levels', () => {
  const f = flight({ alt: 10740, spd: 220, plan: () => ({ vs: -1200, level: 2500, ds: -0.05 }) });
  for (const track of [false, true]) {
    const rows = replay(f, { secs: 900, gaps: [[60, 660]], track });
    for (const r of rows) if (r.ft !== null) assert.ok(r.ft > 0, `second ${r.s}: ${r.ft} ft while airborne at ${r.truth.alt}`);
    const low = Math.min(...rows.filter((r) => r.ft !== null).map((r) => r.ft));
    assert.ok(low >= 1500, `never below half the last reading (lowest ${low} ft)`);
  }
  // and a steep descent with no new fix stops at half the reading, not at the ground
  const S = screen();
  S.poll(S.answer({ alt: 3000, spd: 180, vs: -2500 }, 0));
  for (let i = 0; i < 900; i++) { S.tick(1); S.api._animateGateTelem(); assert.ok(S.ft() >= 1500, `${i} s: ${S.ft()}`); }
});

test('0 ft only after the ground: a final approach, touchdown, then the render\'s held airborne numbers', () => {
  const fin = flight({ alt: 4000, spd: 160, from: -200, plan: (t) => (t < 100 ? { vs: -800, level: 0, cap: 1, ds: -0.05 } : { ground: true, spd: 20 }) });
  const rows = replay(fin, {
    age: 30, secs: 600,
    // the render's held last airborne numbers (sticky fix, 3-minute hold)
    everySecond(S, s) { if (s > 190 && s % 10 === 0) S.api._gateTelemSetReal(140, 780, null); }
  });
  for (const r of rows) if (r.ft === 0) assert.ok(r.truth.ground, `second ${r.s}: 0 ft before the ground fix`);
  const settled = rows.slice(240);
  for (const r of settled) {
    assert.equal(r.ft, 0, `second ${r.s}: altitude on the ground`);
    assert.equal(r.kph, Math.round(20 * 1.852), `second ${r.s}: the ground speed as reported`);
  }
  assert.equal(moves(rows, -1).back, 0, 'the touchdown is a blend down, never back up');
});

test('the fix\'s own on-ground flag stops every trend, with no other signal on the page', () => {
  const S = screen();
  S.poll(S.answer({ alt: 900, spd: 140, vs: -700 }, 0));
  S.tick(180);
  S.poll(S.answer({ alt: 0, spd: 30, vs: 128, ground: true }, 0));   // taxiing: 140 kt to 30 kt is no trend
  for (let i = 0; i < 300; i++) { S.tick(1); S.api._animateGateTelem(); }
  assert.equal(S.ft(), 0);
  assert.equal(S.kph(), Math.round(30 * 1.852), 'the ground speed as reported, not carried on down');
});

test('a load while the aircraft is on the ground paints 0 at once and holds it', () => {
  const S = screen();
  S.poll(S.answer({ alt: 0, spd: 0, vs: 128, ground: true }, 40));
  S.api._animateGateTelem();
  assert.equal(S.ft(), 0);
  for (let i = 0; i < 300; i++) { S.tick(1); S.api._animateGateTelem(); assert.equal(S.ft(), 0); assert.equal(S.kph(), 0); }
});

test('once the feed says Arrived, an airborne fix with a vertical speed carries no trend', () => {
  const S = screen();
  S.win._gateInbound.status = 'arrived';
  S.poll(S.answer({ alt: 600, spd: 130, vs: -700 }, 20));
  const first = S.ft();
  for (let i = 0; i < 240; i++) { S.tick(1); S.api._animateGateTelem(); }
  assert.equal(S.ft(), 0, 'eases to the ground and stays');
  for (let i = 0; i < 120; i++) { S.tick(1); S.api._animateGateTelem(); assert.equal(S.ft(), 0); }
  assert.ok(first <= 600);
});

test('level flight stays level: cruise jitter in the vertical speed is not a climb', () => {
  const cruise = (t) => ({ alt: 37000, spd: 470, vs: (t % 2) ? 64 : -64 });
  for (const track of [false, true]) {
    const rows = replay(cruise, { secs: 420, track });
    for (let i = 3; i < rows.length; i++) assert.equal(rows[i].ft, 37000, `second ${i}`);
  }
});

test('one fix with no vertical speed: the digits hold the real reading (nothing invented)', () => {
  const S = screen();
  S.poll({ spd: 420, alt: 24000, onGround: false, at: S.now(), age: 30 });   // no vs
  const seen = new Set();
  for (let i = 0; i < 170; i++) { S.api._animateGateTelem(); seen.add(S.ft() + '/' + S.kph()); S.tick(1); }
  assert.deepEqual([...seen], ['24000/778'], 'no rate to carry, so the reading as reported');
});

// ── signs, units, timing ────────────────────────────────────────────────────

test('signs: a climb rises, a descent falls, the same rate both ways', () => {
  for (const [vs, dir] of [[1800, 1], [-1800, -1]]) {
    const S = screen();
    S.poll(S.answer({ alt: 20000, spd: 400, vs }, 0));
    S.tick(45);
    const m = S.api._gateTelemModel();
    assert.equal(Math.round(m.alt), 20000 + dir * 1350, `vs ${vs}: 45 s = ${dir * 1350} ft`);
    assert.equal(m.altRate, dir * 30, 'ft/s');
  }
});

test('units are unchanged: knots in, km/h and feet on the panel', () => {
  const S = screen();
  S.poll(S.answer({ alt: 31000, spd: 450, vs: 0 }, 0));
  S.api._animateGateTelem();
  assert.equal(S.spans['spd-kph'], (Math.round(450 * 1.852)).toLocaleString('en'));   // 833
  assert.equal(S.spans['alt-ft'], (31000).toLocaleString('en'));
});

test('the fix is timed when it was taken, and the same answer served again changes nothing', () => {
  const S = screen();
  const r = S.answer({ alt: 24000, spd: 420, vs: -1500 }, 90);
  const fx = S.api._gateTelemFix(r);
  assert.equal(fx.at, S.now() - 90000);
  assert.equal(fx.vs, -1500);
  assert.equal(fx.onGround, false);
  assert.equal(S.api._gateTelemFix(Object.assign({}, r, { taken: S.now() - 120000 })).at, S.now() - 120000,
    'the time the answer reached the screen wins over a later re-read of its age');
  S.poll(r);
  const T = S.win._gateTelemAnim, ts = T.realTs;
  assert.equal(ts, S.now() - 90000);
  // the Worker's copy again a minute later
  S.tick(60);
  S.poll(S.answer({ alt: 24000, spd: 420, vs: -1500 }, 150));
  assert.equal(T.realTs, ts, 'the same fix does not restart the clock');
  // and the render's call with the same numbers and no fix keeps the vertical speed
  S.api._gateTelemSetReal(420, 24000, null);
  assert.equal(T.realVs, -1500);
  // an older answer arriving after a newer one is not news
  S.poll(S.answer({ alt: 25000, spd: 425, vs: -1500 }, 400));
  assert.equal(T.realAlt, 24000, 'an older fix does not replace a newer one');
});

test('a copy whose age never advanced is re-timed by the flight\'s own track', () => {
  const f = flight({ alt: 30000, spd: 450, plan: () => ({ vs: -1500, level: 3000, ds: -0.1 }) });
  // the edge copy at this location says seen_pos 3 though it is 153 s old
  const frozen = replay(f, { age: 150, secs: 300, frozen: true, track: true });
  const aged = replay(f, { age: 150, secs: 300, track: true });
  assert.equal(frozen[3].ft, aged[3].ft, 'the same first paint as a copy whose age was right');
  // without a track it lags (forward), never jumps or goes back
  const lag = replay(f, { age: 150, secs: 300, frozen: true });
  assert.ok(Math.abs(lag[3].ft - f(3).alt) > 2 * Math.abs(frozen[3].ft - f(3).alt), 'the track is what puts it right');
  const m = moves(lag, -1);
  assert.equal(m.back, 0);
  assert.ok(m.worst < 250, `largest one-second change ${m.worst} ft`);
});

// ── the call sites and the Worker ───────────────────────────────────────────

test('the poll and the render hand the model the fix behind the numbers', () => {
  const poll = fnSource('_gateNumbersPoll');
  assert.match(poll, /_gateTelemSetReal\(_adsb\.spd, _adsb\.alt, _gateTelemFix\(_adsb\)\)/);
  // the render's builder holds markup strings with braces: take its opening stretch
  const at = CORE.indexOf('function _buildV2MapCol(');
  assert.ok(at >= 0, '_buildV2MapCol must exist');
  const col = CORE.slice(at, CORE.indexOf('var _tAnim = window._gateTelemAnim', at));
  assert.match(col, /_liveAlt === _adsbC\.alt && _liveSpd === _adsbC\.spd\)\s*\?\s*_gateTelemFix\(_adsbC\) : null/,
    'only when the numbers ARE the ADS-B answer, never a held reading');
  assert.match(col, /_adsbC\.onGround !== true/);
  // an answer the board's own 45 s cache hands out again keeps the time it arrived
  const one = fnSource('_adsbFetchOne');
  assert.match(one, /ac\._rxAt = Date\.now\(\)/);
  assert.match(fnSource('_adsbTelemetry'), /taken: \(typeof ac\.seen_pos === 'number' && typeof ac\._rxAt === 'number'\) \? ac\._rxAt - ac\.seen_pos \* 1000 : null/);
});

test('the Worker\'s edge copy ages like its KV copy', async () => {
  const store = new Map();
  const edge = new Map();
  let now = Date.now();
  const realNow = Date.now;
  globalThis.caches = { default: {
    async match(req) { const v = edge.get(req.url); return v ? new Response(v.body, { headers: v.headers }) : undefined; },
    async put(req, res) { edge.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
  } };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('FR24 must not be called'); };
  Date.now = () => now;
  try {
    const mod = await import(workerPath);
    const body = JSON.stringify({ ac: [{ flight: 'WJA812', r: 'C-GWJO', t: 'B737', lat: 51.02, lon: -112.74, alt_baro: 24000, gs: 420, baro_rate: -1500, seen_pos: 4 }], _provider: 'fr24' });
    store.set('adsbans:v1:flight:WS812', JSON.stringify({ at: now - 10000, body }));
    const env = { FR24_KEY: 'x', FIDS_USERS: { async get() { return JSON.stringify({ username: 'admin' }); }, async put() {} }, FIDS_LIVE_FLIGHTS: {
      async get(k, o) { const v = store.has(k) ? store.get(k) : null; return (v && o && o.type === 'json') ? JSON.parse(v) : v; },
      async put(k, v) { store.set(k, v); },
    } };
    const ask = async () => {
      const res = await mod.default.fetch(new Request('https://fids-proxy.example/adsb/flight/WS812'), env, { waitUntil() {} });
      return { cache: res.headers.get('X-Adsb-Cache'), seen: (await res.json()).ac[0].seen_pos };
    };
    const a = await ask();
    assert.deepEqual(a, { cache: 'shared', seen: 14 }, 'the KV copy, aged 10 s');
    now += 120000;
    const b = await ask();
    assert.equal(b.cache, 'hit');
    assert.equal(b.seen, 134, 'the edge copy two minutes later is two minutes older');
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
    delete globalThis.caches;
  }
  assert.equal((WORKER.match(/"X-Adsb-Stored": String\(Date\.now\(\)\)/g) || []).length, 2, 'both edge copies carry their time');
});

test('the flight\'s track keeps each fix\'s ground speed', async () => {
  const { acTrackAppend } = await import(workerPath);
  const m = new Map();
  const env = { FIDS_LIVE_FLIGHTS: {
    async get(k, o) { const v = m.has(k) ? m.get(k) : null; return (v && o && o.type === 'json') ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
  } };
  const base = { fr24_id: '3a4b5c6d', flight: 'WS812', orig_iata: 'YYC', dest_iata: 'YQM' };
  await acTrackAppend(env, { ...base, lat: 51.0260, lon: -112.7427, alt: 25425, gspeed: 431.6, timestamp: '2026-09-27T16:26:00Z' }, 0);
  await acTrackAppend(env, { ...base, lat: 50.9, lon: -111.9, alt: 24900, timestamp: '2026-09-27T16:29:00Z' }, 0);
  const pts = JSON.parse(m.get('trk:v1:3a4b5c6d')).pts;
  assert.deepEqual(pts.map((p) => p[4]), [432, null], 'knots, rounded as the /adsb/ answer rounds them; none when FR24 gave none');
  assert.deepEqual(pts[0].slice(0, 4), [51.026, -112.7427, 25425, 1790526360], 'the first four values as before');
});
