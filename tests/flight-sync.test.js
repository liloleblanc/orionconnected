'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24115 — THE PAID FEEDS FIRST, AND ONE CLOCK FOR THE LANDING.
//
// Sea-Tac, 2026-11-04: AC8806 (a Jazz CRJ900) landed early. Sea-Tac's page
// says only "Landed", with no time. The boards
//   - asked Flightradar24 and OpenSky for it as ACA8806, a name it does not fly
//     under (Jazz files it as JZA806), so neither found it;
//   - stopped asking at the airport word, and ignored any live fix after it;
//   - took NOW as the landing time on every call, so each new taxi landed the
//     aeroplane again, and printed the 6:22pm schedule as the time it arrived.
// These tests pin each of those, and the OpenSky test window that measures
// what the paid feed brings (Moncton and Halifax in one box, Ottawa in one).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

function braceFrom(SRC, start, what) {
  assert.ok(start >= 0, what + ' must exist');
  let i = SRC.indexOf('{', start);
  let depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) {
        if (SRC[i] === '\\') { i++; continue; }
        if (SRC[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return SRC.slice(start, i + 1); }
  }
  throw new Error('could not find the end of ' + what);
}
const fn = (name) => braceFrom(CORE, CORE.indexOf('\nfunction ' + name + '(') + 1, name);

// ── the operator callsign ──────────────────────────────────────────────────
function callsigns() {
  // eslint-disable-next-line no-new-func
  return new Function('_IATA_TO_CALLSIGN', 'var _OP_SHORT_CS = { JZA: 1 };\n'
    + fn('_operatorCallsigns') + '\n' + fn('_csDigitsOk') + '\nreturn { _operatorCallsigns, _csDigitsOk };')(
    { AC: 'ACA', QK: 'JZA', PB: 'PVL', WS: 'WJA', WR: 'WEN', RV: 'ROU' });
}

test('an Air Canada Express flight is asked under the Jazz name, the short form first for an 8000 number', () => {
  const { _operatorCallsigns } = callsigns();
  assert.deepEqual(_operatorCallsigns('QK', 'AC8806'), ['JZA806', 'JZA8806']);
  assert.deepEqual(_operatorCallsigns('JZA', 'AC8806'), ['JZA806', 'JZA8806'], 'an ICAO operator code too');
  assert.deepEqual(_operatorCallsigns('QK', 'AC7992'), ['JZA7992', 'JZA992'], 'a 7000 number whole first (seen as JZA7992)');
  assert.deepEqual(_operatorCallsigns('PB', 'AC7754'), ['PVL7754'], 'no short form for another operator');
  assert.deepEqual(_operatorCallsigns('AC', 'AC8806'), [], 'the seller itself adds nothing');
  assert.deepEqual(_operatorCallsigns('', 'AC8806'), []);
  assert.deepEqual(_operatorCallsigns('QK', 'AC8056'), ['JZA8056'], 'never a short form with a leading zero (JZA056)');
});

test('an answer under the short form is this flight; the seller short form never is', () => {
  const { _csDigitsOk } = callsigns();
  assert.equal(_csDigitsOk('JZA806', '8806'), true);
  assert.equal(_csDigitsOk('JZA8806', '8806'), true);
  assert.equal(_csDigitsOk('ACA806', '8806'), false, 'Air Canada flight 806 is another flight');
  assert.equal(_csDigitsOk('JZA807', '8806'), false);
  assert.equal(_csDigitsOk('', '8806'), true, 'no callsign: the other checks decide');
});

test('the gate poll passes the operator, and both guards read the short form', () => {
  assert.match(CORE, /_adsbTelemetry\(inb\._reg, inb\._callSign, flt, _inbHex, true, inb\._opCode\)/);
  assert.match(CORE, /if \(!_csDigitsOk\(acCs, ourDigits\)\) return null;/);
  assert.match(CORE, /if \(!_csDigitsOk\(ac\.flight, _ourDigits\)\) \{/);
  assert.match(CORE, /if \(c\.cs\) \{ if \(!_csDigitsOk\(c\.cs, dg\(inb\.flight\)\)\) return false; \}/);
});

// ── the landing time ───────────────────────────────────────────────────────
function landing(state) {
  const src = ['var _GATE_DOWN_SEEN = state.down;', 'var _GATE_ARR_SEEN = state.seen;',
    'var _GATE_ARR_UP = state.up, _GATE_LAND_FIRST = state.first;',
    fn('_gateLandedInfo'), fn('_gateSeenLand'), fn('_gateLandedAt')].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function('state', '_gateLegGone', '_gateRowKey', 'adbTs', '_gateRawLanded',
    src + '\nreturn { _gateLandedInfo, _gateLandedAt };')(
    state, () => false, (r) => r.flight, (v) => (typeof v === 'number' ? v : Date.parse(v)),
    (r) => /^(landed|arrived)$/.test(r.status));
}
const T = Date.UTC(2026, 10, 5, 2, 7);        // 18:07 at Sea-Tac
const MIN = 60000;
const row = (o) => Object.assign({ flight: 'AC8806', status: 'arrived', _sortTs: T + 15 * MIN }, o);

test('each piece of evidence says it was down BY a time: the earliest wins', () => {
  const st = { down: { AC8806: T - 3 * MIN }, seen: { rows: {} }, up: {}, first: {} };
  assert.deepEqual(landing(st)._gateLandedInfo(row({ _actualArrTime: T - 1 * MIN }), T), { t: T - 3 * MIN, by: 'live' },
    'the paid live fix on the ground before the airport on-block time');
  // a first ground fix long after the landing (the jet parked 49 minutes) does not move it on
  st.down = { AC8806: T };
  assert.deepEqual(landing(st)._gateLandedInfo(row({ _sortTs: T - 49 * MIN }), T), { t: T - 49 * MIN, by: 'own' });
  st.down = {};
  assert.deepEqual(landing(st)._gateLandedInfo(row({ _actualArrTime: T - 1 * MIN }), T), { t: T - MIN, by: 'actual' });
  assert.equal(landing(st)._gateLandedInfo(row({ _actualArrTime: T + 30 * MIN }), T).by !== 'actual', true, 'an actual still to come is an estimate');
});

test('a Landed with no time of its own: when this screen saw it, and it never moves with the clock', () => {
  // seen still to come two minutes ago, then down: warm, kept
  const st = { down: {}, seen: { rows: {} }, up: { AC8806: T - 2 * MIN }, first: {} };
  const L = landing(st);
  const a = L._gateLandedInfo(row(), T);
  assert.deepEqual(a, { t: T, by: 'seen' });
  assert.deepEqual(L._gateLandedInfo(row(), T + 5 * MIN), { t: T, by: 'seen' }, 'five minutes later: the same time, not now');
  // met already down with its time still to come: cold, at a time nobody knows
  const c = landing({ down: {}, seen: { rows: {} }, up: {}, first: {} });
  assert.equal(c._gateLandedInfo(row(), T).by, 'cold');
  assert.equal(c._gateLandedInfo(row(), T + 9 * MIN).t, T, 'cold too: never the moving clock');
  assert.deepEqual(c._gateLandedInfo(row(), T + 20 * MIN), { t: T, by: 'cold' },
    'and still cold when the 6:22pm schedule passes: it was down by 6:07, so 6:22 cannot be the landing');
  // a row time already passed: that time
  const p = landing({ down: {}, seen: { rows: {} }, up: {}, first: {} });
  assert.deepEqual(p._gateLandedInfo(row({ _sortTs: T - 10 * MIN }), T), { t: T - 10 * MIN, by: 'own' });
  // remembered with the row after a reload
  const r = landing({ down: {}, seen: { rows: { AC8806: { _seenLandAt: T - 4 * MIN } } }, up: {}, first: {} });
  assert.deepEqual(r._gateLandedInfo(row(), T), { t: T - 4 * MIN, by: 'seen' });
});

test('a cold landing starts no taxi, and a later time never sets a running one back', () => {
  const where = fn('_gateTaxiWhere');
  assert.match(where, /if \(li\.by === 'cold'\) return null;/);
  assert.match(CORE, /if \(st\.anchor === 'model' && res\.land < st\.t0 && st\.t0 - res\.land < 3 \* 60000 && res\.landBy !== 'cold'\)/);
  assert.doesNotMatch(CORE, /Math\.min\(now, inb\._revTs \|\| inb\._sortTs \|\| now\)/, 'the moving clock is gone');
  assert.match(CORE, /if \(!_GATE_DOWN_SEEN\[_dk\]\) _GATE_DOWN_SEEN\[_dk\] = fx\.at;/, 'the first ground fix only');
});

test('the card prints the landing it knows, never the schedule of a flight that landed early', () => {
  assert.match(CORE, /_mcLand = _gateLandedInfo\(_ib, Date\.now\(\)\)/);
  assert.match(CORE, /else if \(_mcLand\.by === 'cold'\) \{\s*_mcEvtStr = '';/);
  const shown = new Function('return ' + fn('_gateInboundShownTs'))();
  assert.equal(shown({ arrived: true, landedAt: T - 2 * MIN, sched: T + 15 * MIN }), T - 2 * MIN);
  assert.equal(shown({ arrived: true, landedUnknown: true, sched: T + 15 * MIN }), 0, 'no time rather than the schedule');
  assert.equal(shown({ arrived: false, sched: T + 15 * MIN }), T + 15 * MIN, 'still to come: as before');
});

test('the paid position goes on through the taxi in, and wins over the airport word', () => {
  assert.match(CORE, /if \(!_inTaxi && \/cancel\|arriv\|land\/i\.test\(String\(inb\.status \|\| ''\)\)\) \{/);
  const win = fn('_gateTaxiInWindow');
  assert.match(win, /now - li\.t > 15 \* 60000/, 'at most 15 minutes after it came down');
  assert.match(win, /lp\.speed < 3/, 'until a live fix shows it stopped');
  assert.match(win, /lp\.at - _GATE_STOPPED\[key\] >= 60000\) \{ _GATE_PARKED\[key\] = lp\.at; return false; \}/, 'two stopped fixes a minute apart, then no more asking');
  assert.doesNotMatch(win, /q\.quiet/, 'a quiet number is not a parked Jazz flight');
  assert.match(CORE, /if \(_numberQuiet && \/\^\\\/callsign\\\/\/\.test\(tries\[i\]\) && _opPaths\.indexOf\(tries\[i\]\) < 0\) continue;/,
    'the operator names are asked even after Flightradar24 found nothing under the number sold');
  assert.match(fn('_adsbNearFinal'), /_gateTaxiInWindow\(inb, Date\.now\(\)\)\) return true;/, 'taxiing in counts as near');
  assert.match(CORE, /var fx0 = null;\s*try \{ fx0 = _gateFixFor\(inb, ap, t\); \}/);
  assert.match(CORE, /if \(!\(here0 \|\| \(!fx0\.onGround && fx0\.at > land\)\)\) fx0 = null;/);
});

// ── the worker: names, the test window, the counts ──────────────────────────
let modP = null;
async function worker() {
  if (!modP) modP = import(pathToFileURL(path.join(ROOT, 'workers', 'fids-proxy.js')).href);
  return modP;
}
function fakeKv() {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, String(v)); }, async delete(k) { m.delete(k); } };
}

test('OpenSky matches the Jazz short form under Jazz only', async () => {
  const w = await worker();
  assert.equal(w.oskyCsDigitsOk('JZA806', '8806'), true);
  assert.equal(w.oskyCsDigitsOk('JZA8806', '8806'), true);
  assert.equal(w.oskyCsDigitsOk('ACA806', '8806'), false);
  assert.equal(w.oskyCsDigitsOk('PVL754', '7754'), false);
});

test('the test window: each airport its own box, first while it lasts, ending by itself', async () => {
  const w = await worker();
  const now = Date.UTC(2026, 10, 6, 12);
  const env = { FIDS_LIVE_FLIGHTS: fakeKv(), OSKY_FOCUS: 'YQM,YHZ,YOW', OSKY_FOCUS_UNTIL: '2026-11-09T04:00:00Z', OSKY_STOP_AT: '2026-11-12T22:59:59Z', OSKY_FOCUS_REFRESH_S: '30' };
  assert.equal(w.oskyFocusGroup(env, 'YQM', now), 'YQM');
  assert.equal(w.oskyFocusGroup(env, 'YYZ', now), '');
  assert.equal(w.oskyFocus(env, Date.UTC(2026, 10, 9, 5)), null, 'over by itself');
  assert.equal(w.oskyRefreshS(env, now), 30);
  assert.equal(w.oskyRefreshS({ ...env, OSKY_FOCUS_REFRESH_S: '5' }, now), 30, 'never under 30 s');
  assert.equal(w.oskyRefreshS(env, Date.UTC(2026, 10, 9, 5)), 120);
  const kv = env.FIDS_LIVE_FLIGHTS;
  // the old relay (1,500 a day, 120 s, no refresh reported), half the day spent at noon:
  // room for two boxes, and they go to the window
  await kv.put('osky:report', JSON.stringify({ at: new Date(now).toISOString(), cap: 1500, calls_today: 750 }));
  assert.equal(w.oskyBoxBudget({ at: new Date(now).toISOString(), cap: 1500, calls_today: 750 }, now), 2);
  const kYyz = await w.oskyBoardWant(env, kv, 'YYZ', ['c:ACA100'], 2, now);
  assert.ok(kYyz, 'another airport gets a box while there is room');
  const kYqm = await w.oskyBoardWant(env, kv, 'YQM', ['c:JZA806'], 1, now + 1000);
  const kYhz = await w.oskyBoardWant(env, kv, 'YHZ', ['c:WJA248'], 1, now + 2000);
  assert.ok(kYqm && kYhz && kYqm !== kYhz, 'Moncton and Halifax each their own box');
  let wanted = JSON.parse(await kv.get('osky:wanted')).boxes;
  assert.deepEqual(Object.values(wanted).map((e) => e.z || '').sort(), ['YHZ', 'YQM'], 'the window took the other airport place');
  // the rebuilt relay (12,000 a day at 30 s): room for all three and one more
  await kv.put('osky:report', JSON.stringify({ at: new Date(now).toISOString(), cap: 12000, calls_today: 0, refresh_s: 30 }));
  assert.ok(await w.oskyBoardWant(env, kv, 'YOW', ['c:ACA442'], 2, now + 3000));
  // after the window the mark is gone: a tracked flight elsewhere takes a former window box place
  const after = Date.UTC(2026, 10, 9, 4, 5);
  await kv.put('osky:report', JSON.stringify({ at: new Date(after).toISOString(), cap: 1500, calls_today: 300 }));
  assert.equal(w.oskyBoxBudget({ at: new Date(after).toISOString(), cap: 1500, calls_today: 300 }, after), 2);
  for (const [ap, cs] of [['YQM', 'c:JZA806'], ['YHZ', 'c:WJA248']]) await w.oskyBoardWant(env, kv, ap, [cs], 1, after);
  assert.ok(await w.oskyBoardWant(env, kv, 'YYC', ['c:WJA100'], 2, after + 1000), 'a tracked YYC flight is not locked out');
  wanted = JSON.parse(await kv.get('osky:wanted')).boxes;
  assert.ok(Object.values(wanted).every((e) => !e.z), 'no mark outlives the window');
});

test('a box open before the window takes the mark the first time its airport asks', async () => {
  const w = await worker();
  const kv = fakeKv();
  const before = Date.UTC(2026, 10, 4, 12), now = Date.UTC(2026, 10, 5, 12);
  const off = { FIDS_LIVE_FLIGHTS: kv, OSKY_STOP_AT: '2026-11-12T22:59:59Z' };
  await kv.put('osky:report', JSON.stringify({ at: new Date(before).toISOString(), cap: 12000, calls_today: 0 }));
  await w.oskyBoardWant(off, kv, 'YOW', ['c:ACA442'], 2, before);
  const on = { ...off, OSKY_FOCUS: 'YQM,YHZ,YOW', OSKY_FOCUS_UNTIL: '2026-11-09T04:00:00Z' };
  await w.oskyBoardWant(on, kv, 'YOW', ['c:ACA442'], 2, before + 60000);
  const boxes = JSON.parse(await kv.get('osky:wanted')).boxes;
  assert.deepEqual(Object.values(boxes).map((e) => e.z), ['YOW']);
});

test('/feeds/status counts what each paid feed brought, counts only', async () => {
  const w = await worker();
  const kv = fakeKv();
  const now = Date.UTC(2026, 10, 6, 12);
  const day = '2026-11-06';
  await kv.put('fr24:used:' + day, '412');
  await kv.put('feeds:n:fr24:pos:' + day, '40');
  await kv.put('feeds:n:fr24:empty:' + day, '61');
  await kv.put('osky:n:' + day, JSON.stringify({ puts: 90, asked: 300, found: 120, 'asked:YQM': 200, 'found:YQM': 50 }));
  const s = await w.feedStatus({ FIDS_LIVE_FLIGHTS: kv, FR24_DAILY_BUDGET: '1900', OSKY_FOCUS: 'YQM,YHZ,YOW', OSKY_FOCUS_UNTIL: '2026-11-09T04:00:00Z' }, now);
  const d = s.counts_utc_day[day];
  assert.deepEqual(d.fr24, { credits_used: 412, answers_with_position: 40, answers_empty: 61, refused_no_credit: 0, daily_budget: 1900 });
  assert.deepEqual([d.opensky.box_answers, d.opensky.flights_asked, d.opensky.flights_found], [90, 300, 120]);
  assert.deepEqual(d.opensky.test_window, { YQM: { flights_asked: 200, flights_found: 50 } });
  assert.deepEqual(s.opensky_test_window.airports, ['YQM', 'YHZ', 'YOW']);
  assert.doesNotMatch(JSON.stringify(s), /JZA|ACA|lat|lon|key|secret/i, 'counts only');
});
