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
// Every Flightradar24 fix carries its own vertical speed. That is now the
// altitude rate from the first fix, timed from when the position was taken;
// the displayed digits never wind back up a descent (or down a climb) when
// the next fix lands a little short of them; and on the ground, or once the
// feed says Arrived, nothing moves.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
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
const NAMES = ['_gateTelemFix', '_gateTelemSetReal', '_gateTelemModel', '_writeGateTelemDom', '_animateGateTelem', '_gateTelemStep'];
const SRC = NAMES.map(fnSource).join('\n');

// One gate screen: the four telemetry functions as the board runs them, a
// clock this test moves, and the two digit spans the panel paints.
function screen() {
  let now = Date.UTC(2026, 9, 19, 15, 0, 0);
  const spans = { 'spd-kph': '', 'alt-ft': '' };
  const els = Object.keys(spans).map((k) => ({
    getAttribute: () => k,
    set textContent(v) { spans[k] = v; },
    get textContent() { return spans[k]; }
  }));
  const win = { _gateTelemAnim: { spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0, realSecToArr: null, shimmerPh: 0 } };
  const api = new Function('window', 'document', 'BoardStrings', 'Date', SRC + '\nreturn {' + NAMES.join(',') + '};')(
    win, { querySelectorAll: () => els }, { num: (v) => Number(v).toLocaleString('en') }, { now: () => now });
  const num = (s) => Number(String(s).replace(/,/g, ''));
  return {
    api, win, spans,
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

// A gate load, replayed: the Worker holds each Flightradar24 answer 180 s,
// the board asks every 60 s from 2 s after load, the digits step every second.
// `truth(t)` is the aircraft at t seconds after load; `takes` are the moments
// Flightradar24 was asked (an answer already 60 s old at load is the first).
function replay(truth, opts) {
  const S = screen();
  const takes = (opts && opts.takes) || [-60, 120, 300];
  const secs = (opts && opts.secs) || 420;
  const rows = [];
  for (let s = 0; s <= secs; s++) {
    if (s >= 2 && (s - 2) % 60 === 0) {
      let tk = takes[0];
      for (const x of takes) if (x <= s) tk = x;
      const f = truth(tk);
      if (opts && opts.beforePoll) opts.beforePoll(S, s, f);
      S.poll(S.answer(f, s - tk));
    }
    if (opts && opts.everySecond) opts.everySecond(S, s);
    S.api._animateGateTelem();
    rows.push({ s, ft: S.ft(), kph: S.kph() });
    S.tick(1);
  }
  return rows;
}
const descent = (t) => ({   // −1,500 ft/min, then −1,800 from t = 200
  alt: Math.round(t < 200 ? 24000 - 25 * (t + 60) : 24000 - 25 * 260 - 30 * (t - 200)),
  spd: Math.round(450 - 0.12 * (t + 60)),
  vs: t < 200 ? -1500 : -1800
});

test('descending: the altitude falls every second from the first fix, not after the Worker\'s 180 s', () => {
  const rows = replay(descent);
  for (let i = 3; i <= 120; i++) {
    assert.ok(rows[i].ft < rows[i - 1].ft, `second ${i}: ${rows[i - 1].ft} → ${rows[i].ft} must be lower`);
  }
  // and it is where the aeroplane is: the answer was 62 s old when it landed
  const atLoad = rows[3].ft;
  assert.ok(Math.abs(atLoad - descent(3).alt) < 200, `first paint ${atLoad} ft, aircraft at ${descent(3).alt} ft`);
});

test('climbing: the altitude rises every second from the first fix', () => {
  const climb = (t) => ({ alt: Math.round(8000 + (2400 / 60) * (t + 30)), spd: Math.round(280 + 0.1 * (t + 30)), vs: 2400 });
  const rows = replay(climb, { takes: [-30, 150], secs: 150 });
  for (let i = 3; i <= 150; i++) assert.ok(rows[i].ft > rows[i - 1].ft, `second ${i}: ${rows[i - 1].ft} → ${rows[i].ft} must be higher`);
});

test('the next real fix blends in: no second goes back up a descent, and no lurch', () => {
  const rows = replay(descent);
  let worst = 0;
  for (let i = 3; i < rows.length; i++) {
    const d = rows[i].ft - rows[i - 1].ft;
    assert.ok(d <= 0, `second ${i}: ${rows[i - 1].ft} → ${rows[i].ft} went back up`);
    worst = Math.max(worst, -d);
  }
  assert.ok(worst < 200, `largest one-second change ${worst} ft (the old rule: 990 ft as the second fix landed)`);
});

test('a fix that lands SHORT of the digits (the descent eased off) never winds them back up', () => {
  // −1,500 ft/min until t = 60, then −900: the next fix is above where the
  // first fix's rate had carried the digits
  const eased = (t) => ({
    alt: Math.round(t < 60 ? 24000 - 25 * (t + 60) : 24000 - 25 * 120 - 15 * (t - 60)),
    spd: 400, vs: t < 60 ? -1500 : -900
  });
  const rows = replay(eased, { takes: [-60, 120, 300] });
  const before = rows[121].ft, model = eased(122).alt;
  assert.ok(before < model, `set-up: the digits (${before}) are below the new fix's ${model}`);
  for (let i = 3; i < rows.length; i++) {
    assert.ok(rows[i].ft <= rows[i - 1].ft, `second ${i}: ${rows[i - 1].ft} → ${rows[i].ft} went back up`);
  }
  // and they meet the aircraft again instead of sitting still under it
  assert.ok(Math.abs(rows[300].ft - eased(300).alt) < 150, `by 300 s: ${rows[300].ft} vs ${eased(300).alt}`);
  assert.ok(rows[200].ft < rows[150].ft, 'still descending while the model closes the gap');
});

test('level flight stays level: cruise jitter in the vertical speed is not a climb', () => {
  const cruise = (t) => ({ alt: 37000, spd: 470, vs: (t % 2) ? 64 : -64 });
  const rows = replay(cruise, { takes: [-60, 120, 300] });
  for (let i = 3; i < rows.length; i++) assert.equal(rows[i].ft, 37000, `second ${i}`);
});

test('one fix with no vertical speed: the digits hold the real reading (nothing invented)', () => {
  const S = screen();
  S.poll({ spd: 420, alt: 24000, onGround: false, at: S.now(), age: 30 });   // no vs
  const seen = new Set();
  for (let i = 0; i < 170; i++) { S.api._animateGateTelem(); seen.add(S.ft() + '/' + S.kph()); S.tick(1); }
  assert.deepEqual([...seen], ['24000/778'], 'no rate to carry, so the reading as reported');
});

test('the ground speed has no reading of its own: it stays as reported until a second fix measures a change, then blends', () => {
  const rows = replay(descent, { takes: [-60, 120, 300] });
  for (let i = 3; i <= 121; i++) assert.equal(rows[i].kph, rows[3].kph, `second ${i}: steady until the second fix`);
  for (let i = 123; i < rows.length; i++) {
    assert.ok(rows[i].kph <= rows[i - 1].kph, `second ${i}: ${rows[i - 1].kph} → ${rows[i].kph} km/h went back up while slowing`);
  }
  assert.ok(rows[400].kph < rows[200].kph, 'and it keeps slowing between fixes, at the measured rate');
});

test('on the ground nothing moves: altitude 0 and still, a ground vertical speed and an airborne trend ignored', () => {
  // airborne on final, measured descending, then touchdown
  const fin = (t) => (t < 120 ? { alt: Math.round(1500 - 12 * (t + 60)), spd: 140, vs: -700 }
                              : { alt: 0, spd: 18, vs: -64, ground: true });
  const rows = replay(fin, {
    takes: [-60, 60, 120],
    secs: 600,
    // the render's held last airborne numbers (sticky fix, 3-minute hold)
    everySecond(S, s) { if (s > 122 && s % 10 === 0) S.api._gateTelemSetReal(140, 780, null); }
  });
  const settled = rows.slice(200);
  for (const r of settled) {
    assert.equal(r.ft, 0, `second ${r.s}: altitude on the ground`);
    assert.equal(r.kph, Math.round(18 * 1.852), `second ${r.s}: the ground speed as reported`);
  }
  // and the touchdown itself is a blend down, never back up
  for (let i = 123; i < 200; i++) assert.ok(rows[i].ft <= rows[i - 1].ft, `second ${i}: ${rows[i - 1].ft} → ${rows[i].ft}`);
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
  S.win._gateInbound = { status: 'arrived' };
  S.poll(S.answer({ alt: 600, spd: 130, vs: -700 }, 20));
  const first = S.ft();
  for (let i = 0; i < 240; i++) { S.tick(1); S.api._animateGateTelem(); }
  assert.equal(S.ft(), 0, 'eases to the ground and stays');
  const at = S.ft();
  for (let i = 0; i < 120; i++) { S.tick(1); S.api._animateGateTelem(); assert.equal(S.ft(), at); }
  assert.ok(first <= 600);
});

test('signs: a climb rises, a descent falls, the same rate both ways', () => {
  for (const [vs, dir] of [[1800, 1], [-1800, -1]]) {
    const S = screen();
    S.poll(S.answer({ alt: 20000, spd: 400, vs }, 0));
    S.tick(60);
    const m = S.api._gateTelemModel();
    assert.equal(Math.round(m.alt), 20000 + dir * 1800, `vs ${vs}: one minute = ${dir * 1800} ft`);
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
  S.poll(r);
  const T = S.win._gateTelemAnim, ts = T.realTs;
  assert.equal(ts, S.now() - 90000);
  // the Worker's copy again a minute later, its age not advanced (edge cache)
  S.tick(60);
  S.poll(S.answer({ alt: 24000, spd: 420, vs: -1500 }, 90));
  assert.equal(T.realTs, ts, 'the same fix does not restart the clock');
  // and the render's call with the same numbers and no fix keeps the vertical speed
  S.api._gateTelemSetReal(420, 24000, null);
  assert.equal(T.realVs, -1500);
});

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
});
