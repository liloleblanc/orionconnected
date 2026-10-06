'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24008 — DAY AND NIGHT FROM THE AIRPORT'S OWN SUN (fids-current/js/fids-sun.js)
//
// The gate's centre cards go light by day and dark at night, switching on
// their own at each airport's sunrise and sunset. The condition was that the
// automation works, properly, on screens nobody touches for weeks. So this
// file proves three things, with no network and no real clock:
//
//   1. THE SUMS. Sunrise and sunset computed on the screen agree with the U.S.
//      Naval Observatory's published tables (tests/fixtures/sun-usno-2026.json,
//      fetched by scripts/daynight/fetch-usno-tables.js) to within two minutes,
//      for sixteen airports on every day of 2026 — the equinoxes, the
//      solstices and every daylight-saving change included — and the polar
//      cases come out as polar.
//   2. THE SCHEDULE. A screen run for ten simulated days across a clock
//      change gets every sunrise and every sunset exactly once, within a
//      minute. A laptop asleep for three hours, a frozen tab and a device
//      clock stepped an hour either way are all put right within one
//      heartbeat.
//   3. THE PAGE. <html> carries the state, ?daynight= holds it for review,
//      and the three boards load the engine before the core.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'fids-current', 'js');
const FidsSun = require(path.join(JS, 'fids-sun.js'));
const FX = require('./fixtures/sun-usno-2026.json');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

// ── the board's own tables, read out of fids-core.js ──────────────────────
function literal(marker, open, close) {
  const at = CORE.indexOf(marker);
  assert.ok(at >= 0, 'fids-core.js no longer declares ' + marker);
  let i = CORE.indexOf(open, at), d = 0, j = i;
  for (; j < CORE.length; j++) {
    if (CORE[j] === open) d++;
    else if (CORE[j] === close && --d === 0) break;
  }
  return CORE.slice(i, j + 1);
}
const COORDS = Function('return ' + literal('const COORDS = {', '{', '}'))();
const AP = Function('return ' + literal('const AP = {', '{', '}'))();
const GATE_AP = Function('return ' + literal('var GATE_AP={', '{', '}'))();
const LIVE = Function('return new Set(' + literal('const FIDS_LIVE_AIRPORTS = new Set(', '[', ']') + ')')();

const boardCoords = (c) => COORDS[c] || GATE_AP[c] || null;
const boardTz = (c) => (AP[c] && AP[c].tz) || null;
const engine = FidsSun.create({ coords: boardCoords, tz: boardTz });

const NAMED = ['YQM', 'YHZ', 'YUL', 'YYZ', 'YVR', 'YYC', 'YOW', 'JFK', 'LAX', 'MIA', 'HNL', 'KEF', 'ZRH', 'DXB', 'SYD', 'HBA'];
// Equinoxes, solstices, and every 2026 daylight-saving change: North America,
// Europe, Australia.
const DATES = {
  '2026-03-20': 'March equinox', '2026-06-21': 'June solstice', '2026-09-23': 'September equinox', '2026-12-21': 'December solstice',
  '2026-03-08': 'N. America DST starts', '2026-11-01': 'N. America DST ends',
  '2026-03-29': 'Europe DST starts', '2026-10-25': 'Europe DST ends',
  '2026-04-05': 'Australia DST ends', '2026-10-04': 'Australia DST starts'
};

// ── USNO's table as instants ──────────────────────────────────────────────
function usnoEvents(code) {
  const p = FX.points[code];
  const out = [];
  for (const mm of Object.keys(p.months)) {
    p.months[mm].forEach((cell, i) => {
      if (!cell) return;
      const [rises, sets] = cell.split(' ');
      const day = Date.UTC(FX.year, Number(mm) - 1, i + 1);
      for (const [list, kind] of [[rises, 'sunrise'], [sets, 'sunset']]) {
        for (const hhmm of list.split(',')) {
          if (/^\d{4}$/.test(hhmm)) out.push({ at: day + Number(hhmm.slice(0, 2)) * HOUR + Number(hhmm.slice(2)) * MIN, kind });
        }
      }
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
// The airport's UTC offset at an instant, independently of the engine.
function tzOffset(tz, ms) {
  const q = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(ms)).forEach((x) => { q[x.type] = x.value; });
  return Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour % 24, +q.minute, +q.second) - Math.floor(ms / 1000) * 1000;
}
const localDate = (ms, tz) => {
  const off = tzOffset(tz, ms);
  return new Date(ms + off).toISOString().slice(0, 10);
};
// 12:00 on a calendar date at the airport, as an instant
function localNoon(date, tz) {
  const guess = Date.parse(date + 'T12:00:00Z');
  return guess - tzOffset(tz, guess - tzOffset(tz, guess));
}
const iso = (ms) => new Date(ms).toISOString().replace(':00.000Z', 'Z');

// ═══ 1. THE SUMS ═══════════════════════════════════════════════════════════

test('the reference tables are the board\'s own airports, at the board\'s own coordinates', () => {
  for (const code of Object.keys(FX.points)) {
    const p = FX.points[code];
    assert.deepEqual([p.lat, p.lon], COORDS[code], code + ': the fixture must be fetched for the COORDS point the engine uses');
    assert.match(p.url, /^https:\/\/aa\.usno\.navy\.mil\/calculated\/rstt\/year\?/, code + ' carries its source');
    if (p.tz) assert.equal(p.tz, AP[code].tz, code + ' time zone');
  }
  for (const code of NAMED) assert.ok(FX.points[code], code + ' is in the fixture');
});

test('sunrise and sunset on the equinoxes, solstices and every DST change: within 2 minutes of USNO', (t) => {
  const report = [];
  for (const code of NAMED) {
    const tz = AP[code].tz;
    const U = usnoEvents(code);
    let worst = 0;
    for (const date of Object.keys(DATES)) {
      const got = engine.times(code, localNoon(date, tz));
      assert.equal(got.date, date, `${code} ${date}: times() answers for the airport's own calendar day`);
      assert.equal(got.polar, null);
      const rise = U.filter((e) => e.kind === 'sunrise' && localDate(e.at, tz) === date);
      assert.equal(rise.length, 1, `${code} ${date}: USNO has one sunrise that local day`);
      const set = U.find((e) => e.kind === 'sunset' && e.at > rise[0].at);
      const dr = Math.abs(got.sunrise - rise[0].at), ds = Math.abs(got.sunset - set.at);
      assert.ok(dr <= 2 * MIN, `${code} ${date} (${DATES[date]}) sunrise ${iso(got.sunrise)} vs USNO ${iso(rise[0].at)}`);
      assert.ok(ds <= 2 * MIN, `${code} ${date} (${DATES[date]}) sunset ${iso(got.sunset)} vs USNO ${iso(set.at)}`);
      assert.equal(localDate(got.sunrise, tz), date, `${code} ${date}: the sunrise is on that date`);
      worst = Math.max(worst, dr, ds);
    }
    report.push(code + ' ' + (worst / MIN).toFixed(2));
  }
  t.diagnostic('largest difference from USNO on the named dates, minutes: ' + report.join(', '));
});

test('every sunrise and sunset of 2026, all sixteen airports: same count as USNO, each within 2 minutes', (t) => {
  const from = Date.UTC(2026, 0, 1), to = Date.UTC(2027, 0, 1);
  const report = [];
  for (const code of NAMED) {
    const U = usnoEvents(code), E = engine.events(code, from, to);
    assert.equal(E.length, U.length, `${code}: ${E.length} switches computed, USNO lists ${U.length}`);
    let worst = 0;
    for (let i = 0; i < U.length; i++) {
      assert.equal(E[i].kind, U[i].kind, `${code} event ${i} kind`);
      const d = Math.abs(E[i].at - U[i].at);
      assert.ok(d <= 2 * MIN, `${code} ${U[i].kind} ${iso(U[i].at)}: computed ${iso(E[i].at)}`);
      worst = Math.max(worst, d);
    }
    // they alternate: a sunrise is always followed by a sunset
    for (let i = 1; i < E.length; i++) assert.notEqual(E[i].kind, E[i - 1].kind, `${code}: two ${E[i].kind}s in a row`);
    report.push(code + ' ' + (worst / MIN).toFixed(2));
  }
  t.diagnostic('largest difference from USNO over all 730 switches, minutes: ' + report.join(', '));
});

test('the local day around midnight and across each clock change is the airport\'s own', () => {
  // 00:30 and 23:30 on the changeover dates, and on an ordinary day where the
  // UTC date has already turned (Honolulu) or not yet (Sydney).
  const cases = [
    ['YQM', '2026-11-01'], ['YQM', '2026-03-08'], ['YVR', '2026-11-01'], ['ZRH', '2026-03-29'], ['ZRH', '2026-10-25'],
    ['SYD', '2026-10-04'], ['HBA', '2026-04-05'], ['HNL', '2026-10-06'], ['SYD', '2026-10-06'], ['KEF', '2026-06-21']
  ];
  for (const [code, date] of cases) {
    const tz = AP[code].tz;
    const noon = localNoon(date, tz);
    // 00:30 and 23:30 on the airport's clock, whatever the offset did between
    const off = (ms) => tzOffset(tz, ms);
    const early = noon - 11.5 * HOUR + off(noon) - off(noon - 11.5 * HOUR);
    const late = noon + 11.5 * HOUR + off(noon) - off(noon + 11.5 * HOUR);
    for (const ms of [early, noon, late]) {
      assert.equal(localDate(ms, tz), date, `${code} ${iso(ms)} is on ${date} locally`);
      const a = engine.times(code, ms), b = engine.times(code, noon);
      assert.equal(a.date, date, `${code} ${iso(ms)}`);
      assert.equal(a.sunrise, b.sunrise, `${code} ${iso(ms)}: the same day's sunrise all day long`);
      assert.equal(a.sunset, b.sunset);
    }
  }
});

test('isDay and next agree with the switch times exactly', () => {
  for (const code of ['YQM', 'HNL', 'SYD', 'KEF']) {
    const E = engine.events(code, Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 8));
    for (const e of E) {
      assert.equal(engine.isDay(code, e.at - 1000), !e.isDay, `${code} a second before ${e.kind}`);
      assert.equal(engine.isDay(code, e.at + 1000), e.isDay, `${code} a second after ${e.kind}`);
      const n = engine.next(code, e.at - 5 * MIN);
      assert.equal(n.at, e.at);
      assert.equal(n.kind, e.kind);
      assert.notEqual(engine.next(code, e.at).at, e.at, 'next() is strictly after');
    }
  }
});

test('above the Arctic Circle: midnight sun is day all through, polar night is night all through', () => {
  for (const code of ['LYR', 'YEV']) {
    const june = Date.UTC(2026, 5, 21), dec = Date.UTC(2026, 11, 21);
    for (let h = 0; h < 24; h++) {
      assert.equal(engine.isDay(code, june + h * HOUR), true, `${code} 21 June ${h}:00 UTC`);
      assert.equal(engine.isDay(code, dec + h * HOUR), false, `${code} 21 December ${h}:00 UTC`);
    }
    const tj = engine.times(code, june + 12 * HOUR), td = engine.times(code, dec + 12 * HOUR);
    assert.equal(tj.polar, 'day'); assert.equal(tj.sunrise, null); assert.equal(tj.sunset, null);
    assert.equal(td.polar, 'night'); assert.equal(td.sunrise, null); assert.equal(td.sunset, null);
  }
  // Longyearbyen: the sun stops setting after 17 April and first sets again on
  // 24 August; it last sets on 26 October and first rises on 16 February. The
  // next() from inside each season lands on USNO's switch.
  const U = usnoEvents('LYR');
  const firstAfter = (ms, kind) => U.find((e) => e.at > ms && e.kind === kind).at;
  for (const [from, kind] of [[Date.UTC(2026, 5, 21), 'sunset'], [Date.UTC(2026, 0, 10), 'sunrise'], [Date.UTC(2026, 10, 15), null]]) {
    const n = engine.next('LYR', from);
    if (kind === null) {
      // polar night from 27 October runs into 2027: the next switch is February's sunrise
      assert.equal(n.kind, 'sunrise');
      assert.ok(n.at > Date.UTC(2027, 1, 10) && n.at < Date.UTC(2027, 1, 20), 'LYR first sunrise of 2027 ' + iso(n.at));
      continue;
    }
    const want = firstAfter(from, kind);
    assert.equal(n.kind, kind);
    assert.ok(Math.abs(n.at - want) <= 3 * MIN, `LYR next ${kind} after ${iso(from)}: ${iso(n.at)} vs USNO ${iso(want)}`);
  }
});

test('above the Arctic Circle, every switch USNO lists for 2026 is there (bar a few minutes\' graze at the edge of polar night)', (t) => {
  const from = Date.UTC(2026, 0, 1), to = Date.UTC(2027, 0, 1);
  const report = [];
  for (const code of ['LYR', 'YEV']) {
    const U = usnoEvents(code), E = engine.events(code, from, to);
    let worst = 0;
    const used = new Set();
    const missed = [];
    for (const u of U) {
      const i = E.findIndex((e, k) => !used.has(k) && e.kind === u.kind && Math.abs(e.at - u.at) <= 3 * MIN);
      if (i < 0) { missed.push(u); continue; }
      used.add(i);
      worst = Math.max(worst, Math.abs(E[i].at - u.at));
    }
    assert.equal(used.size, E.length, code + ': every computed switch is one USNO lists');
    // What may be missed is a sun that clears the horizon for a few minutes
    // on the first day after polar night: a sunrise and a sunset under 15
    // minutes apart, which no board would want to flash for.
    for (let i = 0; i < missed.length; i += 2) {
      const a = missed[i], b = missed[i + 1];
      assert.ok(a && b && a.kind === 'sunrise' && b.kind === 'sunset' && b.at - a.at < 15 * MIN,
        `${code}: USNO's ${a.kind} ${iso(a.at)} has no computed switch`);
    }
    report.push(`${code} ${(worst / MIN).toFixed(2)} min, ${missed.length / 2} graze day(s)`);
  }
  t.diagnostic('polar points against USNO: ' + report.join('; '));
});

test('every airport the boards serve resolves from the board\'s own tables', () => {
  assert.ok(LIVE.size >= 60);
  for (const code of LIVE) {
    assert.ok(COORDS[code], code + ' is in COORDS');
    assert.ok(boardTz(code), code + ' has a time zone in AP');
    for (const date of ['2026-03-20', '2026-06-21', '2026-12-21']) {
      const tz = boardTz(code);
      const got = engine.times(code, localNoon(date, tz));
      assert.equal(got.date, date, code);
      assert.ok(got.sunrise < got.solarNoon && got.solarNoon < got.sunset, code + ' ' + date);
      assert.equal(localDate(got.sunrise, tz), date, code + ' ' + date + ' sunrise is that day');
    }
  }
});

test('the gate map\'s GATE_AP agrees with COORDS wherever both carry an airport', () => {
  // Five rows had another airport's point: YGL (La Grande) sat on Havre-Saint-
  // Pierre, SDR (Santander) on San Juan's Isla Grande, BNK (Ballina) on
  // Norfolk Island, TAO on Qingdao's closed airport and GOT 18 km off. The
  // engine reads COORDS first, but the gate map reads GATE_AP first.
  for (const code of Object.keys(GATE_AP)) {
    if (!COORDS[code]) continue;
    assert.ok(Math.abs(GATE_AP[code][0] - COORDS[code][0]) <= 0.05 && Math.abs(GATE_AP[code][1] - COORDS[code][1]) <= 0.05,
      `${code}: GATE_AP ${GATE_AP[code]} vs COORDS ${COORDS[code]}`);
  }
});

test('the engine never touches the network', () => {
  const src = fs.readFileSync(path.join(JS, 'fids-sun.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts/);
});

// ═══ 2. THE SCHEDULE ═══════════════════════════════════════════════════════
//
// A screen with a hand-written clock. `wall` is Date.now(); `mono` is the
// clock timers run on. Awake, both move together. Asleep (lid closed, tab
// frozen) the wall clock moves and the timers do not; with catchUp the timers
// that fell due fire all at once on waking, as some systems do.
function fakeElement() {
  const cls = new Set(), attrs = {};
  return {
    cls, attrs,
    classList: {
      toggle(n, force) { const on = force === undefined ? !cls.has(n) : !!force; if (on) cls.add(n); else cls.delete(n); return on; },
      add(n) { cls.add(n); },
      contains(n) { return cls.has(n); }
    },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; }
  };
}
function screen(startWall, opts = {}) {
  let wall = startWall, mono = 0, seq = 0;
  const timers = new Map();
  const listeners = {};
  const root = fakeElement();
  const emitted = [];
  const env = {
    now: () => wall,
    mono: () => mono,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { due: mono + Math.max(0, ms), fn, id }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    setInterval: (fn, ms) => { const id = ++seq; timers.set(id, { due: mono + ms, fn, every: ms, id }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    on: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    visible: () => true,
    search: () => opts.search || '',
    root: () => root,
    emit: (type, detail) => emitted.push({ type, detail, wall }),
    coords: opts.coords || boardCoords,
    tz: boardTz,
    log: () => {}
  };
  function runTo(end) {
    for (;;) {
      let t = null;
      for (const x of timers.values()) if (x.due <= end && (!t || x.due < t.due || (x.due === t.due && x.id < t.id))) t = x;
      if (!t) break;
      const dt = Math.max(0, t.due - mono);
      wall += dt; mono += dt;
      if (t.every) t.due = Math.max(t.due + t.every, mono + 1); else timers.delete(t.id);
      t.fn();
    }
    wall += end - mono; mono = end;
  }
  const s = {
    env, root, emitted, timers,
    get wall() { return wall; },
    advance(ms) { runTo(mono + ms); },
    advanceTo(w) { runTo(mono + Math.max(0, w - wall)); },
    sleep(ms, catchUp) { wall += ms; if (catchUp) mono += ms; },
    jump(ms) { wall += ms; },
    fire(type) { for (const fn of listeners[type] || []) fn(); }
  };
  s.engine = FidsSun.create(env);
  return s;
}
function record(s, code) {
  const calls = [];
  s.engine.subscribe(code, (isDay, info) => calls.push({ isDay, wall: s.wall, at: info.at, why: info.why }));
  return calls;
}

// Ten days across each kind of clock change.
const RUNS = [
  ['YQM', '2026-10-28', 'N. America falls back 1 Nov'],
  ['YQM', '2026-03-04', 'N. America springs forward 8 Mar'],
  ['YVR', '2026-10-28', 'N. America falls back 1 Nov'],
  ['ZRH', '2026-10-20', 'Europe falls back 25 Oct'],
  ['SYD', '2026-09-30', 'Australia springs forward 4 Oct'],
  ['HBA', '2026-03-31', 'Australia falls back 5 Apr'],
  ['KEF', '2026-06-16', 'midsummer at 64°N, sunset after midnight'],
  ['HNL', '2026-10-28', 'no DST, UTC date turns mid-afternoon']
];

test('ten days on one screen across a clock change: every sunrise and sunset fires once, within 60 s', (t) => {
  const report = [];
  for (const [code, startDate, why] of RUNS) {
    const start = Date.parse(startDate + 'T03:17:00Z');
    const end = start + 10 * DAY;
    const s = screen(start);
    const calls = record(s, code);
    s.advanceTo(end);
    const truth = engine.events(code, start, end);
    const U = usnoEvents(code).filter((e) => e.at > start - 5 * MIN && e.at < end + 5 * MIN);
    assert.equal(calls[0].wall, start, `${code}: told the state at once`);
    assert.equal(calls[0].isDay, engine.isDay(code, start));
    const switches = calls.slice(1);
    assert.equal(switches.length, truth.length, `${code} (${why}): ${switches.length} switches for ${truth.length} sunrises and sunsets`);
    assert.ok(truth.length >= 19, `${code}: ten days have about twenty switches`);
    let late = 0;
    switches.forEach((c, i) => {
      const lag = c.wall - truth[i].at;
      assert.equal(c.isDay, truth[i].isDay, `${code} switch ${i}`);
      assert.ok(lag >= 0 && lag <= 60000, `${code} ${truth[i].kind} ${iso(truth[i].at)} fired ${lag} ms after`);
      // and against the published table: USNO prints the minute, so the true
      // instant is within 30 s of it either way
      const u = U.find((e) => e.kind === truth[i].kind && Math.abs(e.at - c.wall) <= 2 * MIN);
      assert.ok(u && Math.abs(c.wall - u.at) <= 90000, `${code} ${truth[i].kind} fired at ${iso(c.wall)}, USNO ${u ? iso(u.at) : 'none'}`);
      late = Math.max(late, lag);
    });
    for (let i = 1; i < calls.length; i++) assert.notEqual(calls[i].isDay, calls[i - 1].isDay, `${code}: never told the same state twice`);
    report.push(`${code} ${switches.length} switches, latest ${(late / 1000).toFixed(1)} s`);
    // still armed, for the eleventh day and the next
    const n = s.engine.next(code, s.wall);
    s.advanceTo(n.at + 5000);
    assert.equal(calls[calls.length - 1].isDay, n.isDay, `${code}: the eleventh day goes on`);
  }
  t.diagnostic(report.join('; '));
});

test('asleep for three hours across a sunset: right on the first heartbeat after waking, once', () => {
  for (const catchUp of [false, true]) {
    const code = 'YQM';
    const start = Date.parse('2026-10-28T12:00:00Z');
    const s = screen(start);
    const calls = record(s, code);
    const sunset = engine.next(code, start);
    assert.equal(sunset.kind, 'sunset');
    s.advanceTo(sunset.at - HOUR);                 // awake until an hour before
    assert.equal(calls.length, 1);
    s.sleep(3 * HOUR, catchUp);                    // the lid shuts; the sun sets
    const woke = s.wall;
    assert.equal(calls.length, 1, 'nothing runs while asleep');
    s.advance(FidsSun.HEARTBEAT_MS + 1000);
    assert.equal(calls.length, 2, 'catchUp=' + catchUp + ': corrected after waking');
    assert.equal(calls[1].isDay, false);
    assert.ok(calls[1].wall - woke <= 60000, 'within a minute of waking: ' + (calls[1].wall - woke) + ' ms');
    // and from there it runs on time: the next sunrise, once
    const sunrise = engine.next(code, s.wall);
    s.advanceTo(sunrise.at + 2 * MIN);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].isDay, true);
    assert.ok(calls[2].wall - sunrise.at >= 0 && calls[2].wall - sunrise.at <= 60000);
  }
});

test('asleep across a sunset, woken by the page becoming visible: right at once', () => {
  const code = 'ZRH';
  const start = Date.parse('2026-10-24T09:00:00Z');
  const s = screen(start);
  const calls = record(s, code);
  const sunset = engine.next(code, start);
  s.advanceTo(sunset.at - 30 * MIN);
  s.sleep(3 * HOUR);
  const woke = s.wall;
  s.fire('visibilitychange');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].isDay, false);
  assert.equal(calls[1].wall, woke, 'on the event itself');
  assert.equal(calls[1].why, 'visible');
  s.advance(5 * MIN);
  assert.equal(calls.length, 2, 'and not again on the heartbeat');
  for (const type of ['online', 'focus', 'pageshow', 'resume']) { s.fire(type); assert.equal(calls.length, 2, type + ' re-checks without repeating'); }
});

test('the device clock stepped forward or back an hour: corrected within a heartbeat, and the next switch on time', () => {
  const code = 'YHZ';
  const base = Date.parse('2026-11-03T12:00:00Z');
  const sunsetOf = (ms) => engine.next(code, ms).at;

  // +1 h, 30 minutes before sunset: the clock lands after it
  {
    const s = screen(base); const calls = record(s, code);
    const set = sunsetOf(base);
    s.advanceTo(set - 30 * MIN);
    s.jump(HOUR);
    s.advance(FidsSun.HEARTBEAT_MS + 1000);
    assert.equal(calls.length, 2); assert.equal(calls[1].isDay, false);
    const rise = engine.next(code, s.wall);
    s.advanceTo(rise.at + MIN);
    assert.equal(calls.length, 3); assert.ok(calls[2].wall - rise.at <= 60000);
  }
  // -1 h, 30 minutes after sunset: the clock goes back to daylight, then sets again on time
  {
    const s = screen(base); const calls = record(s, code);
    const set = sunsetOf(base);
    s.advanceTo(set + 30 * MIN);
    assert.equal(calls.length, 2); assert.equal(calls[1].isDay, false);
    s.jump(-HOUR);
    s.advance(FidsSun.HEARTBEAT_MS + 1000);
    assert.equal(calls.length, 3, 'back before sunset is daylight again'); assert.equal(calls[2].isDay, true);
    s.advanceTo(set + 2 * MIN);
    assert.equal(calls.length, 4); assert.equal(calls[3].isDay, false);
    assert.ok(calls[3].wall - set >= 0 && calls[3].wall - set <= 60000, 'sunset again, on time: ' + (calls[3].wall - set));
  }
  // ±1 h three hours before sunset: no switch crossed, so none reported, and
  // sunset still fires on time — not an hour early, not an hour late
  for (const step of [HOUR, -HOUR]) {
    const s = screen(base); const calls = record(s, code);
    const set = sunsetOf(base);
    s.advanceTo(set - 3 * HOUR);
    s.jump(step);
    s.advanceTo(set + 2 * MIN);
    assert.equal(calls.length, 2, 'step ' + step + ': one switch');
    assert.equal(calls[1].isDay, false);
    assert.ok(calls[1].wall - set >= 0 && calls[1].wall - set <= 60000, 'step ' + step + ': sunset fired ' + (calls[1].wall - set) + ' ms after');
  }
});

test('a subscriber for an airport not yet known is told as soon as its coordinates arrive', () => {
  const table = {};
  const s = screen(Date.parse('2026-10-06T15:00:00Z'), { coords: (c) => table[c] || null });
  const calls = record(s, 'YQM');
  assert.equal(calls.length, 0);
  assert.equal(s.engine.isDay('YQM'), null);
  table.YQM = COORDS.YQM;                       // the core's table has loaded
  s.advance(FidsSun.HEARTBEAT_MS + 1000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].isDay, true);
});

test('unsubscribing stops the calls and, with nothing left to watch, the heartbeat', () => {
  const s = screen(Date.parse('2026-10-06T15:00:00Z'));
  const calls = [];
  const stop = s.engine.subscribe('YQM', (d) => calls.push(d));
  assert.equal(calls.length, 1);
  stop();
  assert.equal(s.timers.size, 0, 'no timer and no heartbeat left');
  s.advance(2 * DAY);
  assert.equal(calls.length, 1);
});

// ═══ 3. THE PAGE ═══════════════════════════════════════════════════════════

test('<html> carries fids-day / fids-night for the board\'s airport, and fids-dn-ready only after the first state', () => {
  let ap = 'YQM';
  const start = Date.parse('2026-10-06T15:00:00Z');         // midday in Moncton
  const s = screen(start);
  s.engine.bindDocument(() => ap);
  const r = s.root;
  assert.ok(r.cls.has('fids-day') && !r.cls.has('fids-night'));
  assert.equal(r.getAttribute('data-daynight'), 'day');
  assert.equal(r.getAttribute('data-daynight-airport'), 'YQM');
  assert.equal(r.getAttribute('data-daynight-source'), 'sun');
  assert.ok(!r.cls.has('fids-dn-ready'), 'not ready in the same frame as the first state: nothing can fade at boot');
  s.advance(10);
  assert.ok(r.cls.has('fids-dn-ready'));
  const set = engine.next('YQM', start);
  s.advanceTo(set.at + 2 * MIN);
  assert.ok(r.cls.has('fids-night') && !r.cls.has('fids-day'));
  assert.equal(r.getAttribute('data-daynight'), 'night');
  const ev = s.emitted.filter((e) => e.type === 'fids-daynight');
  assert.equal(ev.length, 2);
  assert.equal(ev[1].detail.isDay, false);
  assert.ok(ev[1].wall - set.at <= 60000);
  // the board changes airport: the page follows within a heartbeat
  ap = 'SYD';                                                 // 05:00 next morning in Sydney, still dark
  s.advance(FidsSun.HEARTBEAT_MS + 1000);
  assert.equal(r.getAttribute('data-daynight-airport'), 'SYD');
  assert.equal(r.getAttribute('data-daynight'), engine.isDay('SYD', s.wall) ? 'day' : 'night');
});

test('?daynight=day|night holds the page for review; anything else is ignored', () => {
  assert.equal(FidsSun.parseOverride('?daynight=day'), 'day');
  assert.equal(FidsSun.parseOverride('?ap=YQM&daynight=NIGHT'), 'night');
  assert.equal(FidsSun.parseOverride('?daynight=light'), 'day');
  assert.equal(FidsSun.parseOverride('?daynight=dark#x'), 'night');
  assert.equal(FidsSun.parseOverride('?daynight=dusk'), null);
  assert.equal(FidsSun.parseOverride('?daynightx=day'), null);
  assert.equal(FidsSun.parseOverride(''), null);

  const noon = Date.parse('2026-10-06T15:00:00Z'), midnight = Date.parse('2026-10-07T03:00:00Z');
  for (const [search, at, want] of [['?daynight=night', noon, false], ['?ap=YQM&daynight=day', midnight, true]]) {
    const s = screen(at, { search });
    const calls = record(s, 'YQM');
    s.engine.bindDocument('YQM');
    assert.equal(s.engine.override, want ? 'day' : 'night');
    assert.equal(s.engine.isDay('YQM'), want);
    assert.deepEqual(calls.map((c) => c.isDay), [want]);
    s.advance(3 * DAY);
    assert.equal(calls.length, 1, search + ': held through three sunsets');
    assert.equal(s.root.getAttribute('data-daynight'), want ? 'day' : 'night');
    assert.equal(s.root.getAttribute('data-daynight-source'), 'override');
    // the astronomy itself is not overridden
    assert.equal(s.engine.times('YQM', at).sunrise, engine.times('YQM', at).sunrise);
  }
  const s = screen(noon, { search: '?daynight=sideways' });
  assert.equal(s.engine.override, null);
  assert.equal(s.engine.isDay('YQM'), true);
});

test('the three boards load the engine before the core, on the build tag', () => {
  const tag = (CORE.match(/var FIDS_BUILD_TAG = 'v(\d+)'/) || [])[1];
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'fids-current', page), 'utf8');
    const sun = html.indexOf(`js/fids-sun.js?v=${tag}`);
    const core = html.indexOf('js/fids-core.js?v=');
    const dates = html.indexOf('js/gate-date-context.js?v=');
    assert.ok(sun > 0, `${page} loads js/fids-sun.js at v${tag}`);
    assert.ok(sun < core, `${page} loads the engine before fids-core.js`);
    assert.ok(dates > 0 && dates < sun, `${page} loads the zoned-date helper the engine reads the local day from first`);
  }
  const policy = require('./i18n/policy.js');
  assert.ok(policy.PASSENGER_SCRIPTS.includes('fids-current/js/fids-sun.js'), 'scanned by the board-languages guard like every passenger script');
});

test('the crossfade a surface opts into is two seconds and waits for fids-dn-ready', () => {
  const css = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'shared.css'), 'utf8');
  assert.match(css, /--fids-dn-fade:\s*2s/);
  const rule = css.match(/html\.fids-dn-ready\s+\.fids-dn-fade\s*\{([^}]*)\}/);
  assert.ok(rule, 'the transition only applies once the first state is painted');
  assert.match(rule[1], /transition:[^;]*background-color var\(--fids-dn-fade\)/);
  assert.match(rule[1], /color var\(--fids-dn-fade\)/);
  assert.match(rule[1], /opacity var\(--fids-dn-fade\)/);
});
