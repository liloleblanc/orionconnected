'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// BOARDING SEQUENCES — EACH AIRLINE'S CALLS, ONE AFTER ANOTHER.
//
// The gate's boarding sign called every group at once: both panels came up
// at the first second of boarding, so priority and general boarding were
// called together, and the steps inside were tied to fixed minutes before
// departure. The order the sign now follows: pre-boarding (people who need
// assistance or more time, small children, infants), then elite and premium
// cabins, then general boarding — each airline in its own published order
// and its own words.
//
// The boarding WINDOW does not change (when the sign opens, the lead per
// aircraft type, the close time, Final call and Gate closed). Inside it,
// js/boarding-sequence.js holds each airline's published calls and the
// pacing; fids-core.js builds the same two panels from the stage that is
// live. These tests RUN the shipped code: the module directly, and the
// gate's own functions lifted out of fids-core.js by brace matching.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SEQ = require('../fids-current/js/boarding-sequence.js');
const STORE = require('../fids-current/js/board-strings.js');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const LANGS = STORE.LANGS;
const MIN = 60000;
const T0 = Date.UTC(2026, 9, 12, 15, 0);

// ── lifting real code ───────────────────────────────────────────────────────
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
function fnIn(SRC, name, indent) {
  const m = SRC.match(new RegExp('\\n' + (indent || '') + 'function ' + name + '\\('));
  assert.ok(m, name + ' must be declared');
  return braceFrom(SRC, m.index + 1, name);
}
const top = (name) => fnIn(CORE, name);
const UXG = braceFrom(CORE, CORE.indexOf('function uxgGateHtml(ctx) {'), 'uxgGateHtml');
const inner = (name) => fnIn(UXG, name, '  ');
const block = (prefix) => braceFrom(CORE, CORE.indexOf(prefix), prefix) + ';';

// Every table and its variants, as the gate reaches them.
const CARRIERS = [
  ['AC', {}], ['AC', { express: true }], ['RV', {}], ['QK', {}],
  ['WS', {}], ['WR', {}], ['PD', { pdDash: true }], ['PD', { pdDash: false }], ['PB', {}],
  ['F8', {}], ['TS', {}], ['TS', { toUS: true }], ['UA', {}], ['DL', {}], ['AA', {}], ['AS', {}],
  ['HA', {}], ['WN', {}], ['B6', {}], ['F9', {}], ['ZZ', { legalPre: true }], ['ZZ', {}], ['4N', { legalPre: true }]
];
const LEADS = [20, 25, 30, 35, 45];
const CLOSES = [10, 15, 20];
const planFor = (code, ctx, lead, close) => SEQ.plan(code, Object.assign({ t0: T0, dep: T0 + lead * MIN, close }, ctx));

// ════════════════════════════════════════════════════════════════════════════
// THE TABLES
// ════════════════════════════════════════════════════════════════════════════

// Every key a table can name: stage titles, who-lists, cabins, and the group
// words the gate turns its labels into (singular and plural).
function keysOf(T) {
  const out = new Set(['preboard', 'priority', 'genboard', 'allPax', 'all', 'rows', 'zone', 'zones', 'groupLabel', 'groups',
    'boardSoon', 'boardConv', 'nextUp', 'useLane', 'useLanes', 'preboardWhoAny', 'preboardWhoTSus']);
  for (const s of T.stages) for (const k of ['title', 'who', 'sub', 'label']) if (s[k]) out.add(s[k]);
  for (const v of Object.values(T.variants || {})) for (const k of Object.values(v.sub || {})) if (k) out.add(k);
  return out;
}
// _GATE_LBL as the gate holds it (the frozen legacy table _gateLbl reads first).
const GATE_LBL = new Function(block('var _GATE_LBL = {') + '\nreturn _GATE_LBL;')();

test('every table cites its source, the day it was read and how sure it is', () => {
  for (const [key, T] of Object.entries(SEQ.SEQ)) {
    assert.ok(T.src && /^(https:\/\/|house$)/.test(T.src), key + ': src');
    assert.match(T.checked || '', /^\d{4}-\d{2}-\d{2}$/, key + ': checked');
    assert.ok(['high', 'medium', 'low', 'generic'].includes(T.conf), key + ': conf');
    assert.ok(Array.isArray(T.stages) && T.stages.length >= 2, key + ': stages');
    for (const s of T.stages) assert.ok(['pre', 'prio', 'fam', 'gen'].includes(s.kind), key + ': a stage kind');
  }
});

test('every key a table names exists where the gate looks, in all nine languages', () => {
  const missing = [];
  for (const [key, T] of Object.entries(SEQ.SEQ)) {
    for (const k of keysOf(T)) {
      const e = GATE_LBL[k] || STORE.entry(k);
      if (!e) { missing.push(key + ': ' + k + ' (no entry)'); continue; }
      for (const l of LANGS) if (!(typeof e[l] === 'string' && e[l].trim())) missing.push(key + ': ' + k + ' ' + l);
    }
  }
  assert.deepEqual(missing, []);
  // the new words carry where they come from
  for (const k of ['groups', 'familyBoard', 'specialBoard', 'earlyAccess', 'courtesyBoard', 'preboardWhoAny',
    'preboardWhoAC', 'familyWhoAC', 'preboardWhoWS', 'specialWhoWS', 'preboardWhoPB', 'preboardWhoF8', 'preboardWhoTS',
    'preboardWhoTSus', 'preboardWhoUA', 'preboardWhoDL', 'earlyAccessWhoDL', 'preboardWhoAA', 'prioWhoAA', 'familyWhoAA',
    'preboardWhoAS', 'preboardWhoB6', 'courtesyWhoB6', 'preboardWhoWN', 'prioWhoWN', 'preboardWhoF9']) {
    const e = STORE.entry(k);
    assert.ok(e && e.$src, k + ' carries $src');
    for (const l of LANGS) assert.ok(e.$src[l], k + ' $src ' + l);
  }
  // the airline's own French where it publishes one
  assert.equal(STORE.bs('familyBoard', 'fr'), 'Embarquement des familles', "Air Canada's French");
  assert.equal(STORE.bs('specialBoard', 'fr'), 'Embarquement spécial', "WestJet's French");
  assert.equal(STORE.bs('earlyAccess', 'fr'), 'Accès anticipé', "Delta's French");
  assert.equal(STORE.entry('preboardWhoF8').$src.fr, 'careful', "Flair's French is not verified, and says so");
  // the fixes in the same change
  assert.equal(STORE.bs('cabinPremiumWS', 'fr'), 'Privilège', "WestJet's own French for its cabin");
  assert.notEqual(STORE.bs('preboard', 'ja'), GATE_LBL.priority.ja + '搭乗', 'pre-boarding no longer reads "priority boarding" in Japanese');
  assert.ok(!STORE.bs('preboard', 'ja').includes(GATE_LBL.priority.ja), 'nor contains the priority word');
  assert.ok(!STORE.bs('preboard', 'zh').includes(GATE_LBL.priority.zh), 'nor in Chinese');
});

test('a programme name never stands on its own: only inside a translated who-list', () => {
  const NAMES = ['Aeroplan', 'ConciergeKey', 'A-List Preferred', 'Global Services', 'Premier 1K', 'Medallion', 'Elite Diamond'];
  for (const [key, T] of Object.entries(SEQ.SEQ)) {
    for (const s of T.stages) {
      for (const k of ['title', 'sub', 'label']) {
        if (!s[k]) continue;
        const e = GATE_LBL[s[k]] || STORE.entry(s[k]);
        for (const n of NAMES) assert.ok(!String(e.en).includes(n), `${key}: ${s[k]} names ${n} outside a who-list`);
      }
    }
  }
  for (const n of NAMES) assert.ok(!Object.keys(require('./i18n/policy.js').BRAND_TERMS).includes(n), n + ' is not a brand term on its own');
});

test('every carrier starts with pre-boarding, and its calls run in its published order', () => {
  // Phase 1 has no airline without pre-boarding (Iberia, Ryanair and
  // Norwegian, which differ, are phase 2 and stay on the generic plan).
  const EXCEPTIONS = new Set(['IB', 'FR', 'DY']);
  for (const [code, ctx] of CARRIERS) {
    const p = planFor(code, ctx, 35, 15);
    if (EXCEPTIONS.has(code)) continue;
    assert.equal(p.full[0].kind, 'pre', code + ' starts with pre-boarding');
    assert.equal(p.stages[0].kind, 'pre', code + ' paced: pre-boarding first');
    // the left panel always runs first: no left call after a general one
    const firstGen = p.full.findIndex((s) => s.kind === 'gen');
    assert.ok(firstGen > 0, code + ' has a general call');
    assert.ok(p.full.slice(firstGen).every((s) => s.kind === 'gen'), code + ': general boarding comes last');
  }
  for (const code of ['IB', 'FR', 'DY', 'NK', 'OO', 'YX']) assert.equal(SEQ.plan(code).key, 'generic', code + ' gets the generic plan');
  // the airline's own order where it differs from pre → elite → general
  const kinds = (c, ctx) => SEQ.plan(c, ctx).full.map((s) => s.kind + (s.values.length ? s.values.join('') : (s.title ? ':' + s.title : ''))).join(' ');
  assert.equal(kinds('AC'), 'pre:preboard prio1 prio2 fam:familyBoard gen3 gen4 gen5 gen6', 'Air Canada: families between Zones 2 and 3');
  assert.equal(kinds('AC', { express: true }), 'pre:preboard prio1 prio2 fam:familyBoard gen3 gen4', 'Express tops out at Zone 4');
  assert.equal(kinds('WS'), 'pre:preboard prio1 prio2 fam:specialBoard gen3 gen4 gen5 gen6 gen7 gen8 gen9', 'WestJet: special boarding after the priority zones, then 3 to 9');
  assert.equal(kinds('DL'), 'pre:preboard prio1 prio2 fam:earlyAccess prio3 prio4 gen5 gen6 gen7 gen8', 'Delta: Early Access after Zone 2');
  assert.equal(kinds('B6'), 'pre:preboard prio1 prio2 prio3 fam:courtesyBoard gen4 gen5 gen6 gen7 gen8', 'JetBlue: Courtesy Boarding after Group 3');
  assert.equal(kinds('AA'), 'pre:preboard prio fam:familyBoard prio1 prio2 prio3 prio4 gen5 gen6 gen78 gen9', 'American: families after Business');
  assert.equal(kinds('UA'), 'pre:preboard prio1 prio2 gen3 gen4 gen5 gen6');
  assert.equal(kinds('PD', { pdDash: true }), 'pre:preboard gen14–20 gen7–13 gen1–6', 'Porter: pre-boarding, then rows back to front');
  assert.equal(kinds('PB'), 'pre:preboard gen:allPax', "PAL's two steps");
  assert.equal(kinds('ZZ'), 'pre:preboard prio gen:allPax', 'the generic plan: three steps, nothing invented');
  assert.equal(kinds('4N'), 'pre:preboard gen:allPax', 'a carrier with no priority step: two');
});

test('for every table, every lead and every close: increasing starts, steps 1.5–5 min, pre-boarding 2–5, the last call in time', () => {
  let n = 0;
  for (const [code, ctx] of CARRIERS) {
    for (const lead of LEADS) {
      for (const close of CLOSES) {
        const p = planFor(code, ctx, lead, close);
        const at = p.stages.map((s) => s.at);
        const where = `${code}${JSON.stringify(ctx)} lead ${lead} close ${close}: ${at.map((x) => x.toFixed(2)).join(' ')}`;
        assert.equal(at[0], 0, where + ' — starts at boarding open');
        for (let i = 1; i < at.length; i++) {
          assert.ok(at[i] > at[i - 1], where + ' — strictly increasing');
          const step = at[i] - at[i - 1];
          if (i === 1 && p.stages[0].kind === 'pre') assert.ok(step >= 2 - 1e-9 && step <= 5 + 1e-9, where + ' — pre-boarding 2 to 5 minutes');
          else assert.ok(step >= 1.5 - 1e-9 && step <= 5 + 1e-9, where + ' — a step 1.5 to 5 minutes');
        }
        const last = at[at.length - 1];
        assert.ok(last <= Math.max(lead - close - 2, lead / 2) + 1e-9, where + ' — the last call by max(L − C − 2, L/2)');
        assert.ok(lead - last >= 5 - 1e-9, where + ' — at least five minutes before departure');
        // the absolute times agree with the minutes
        p.stages.forEach((s) => assert.equal(s.ts, T0 + Math.round(s.at * MIN)));
        n++;
      }
    }
  }
  assert.ok(n >= CARRIERS.length * 15);
});

test('the worked offsets in the design', () => {
  const at = (c, ctx, L, C) => planFor(c, ctx, L, C).stages.map((s) => Math.round(s.at * 10) / 10);
  assert.deepEqual(at('AC', {}, 30, 15), [0, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(at('AC', {}, 35, 15), [0, 3.6, 6, 8.4, 10.8, 13.2, 15.6, 18]);
  assert.deepEqual(at('AC', {}, 45, 15), [0, 5, 8.8, 12.7, 16.5, 20.3, 24.2, 28]);
  assert.deepEqual(at('QK', {}, 20, 15), [0, 2.7, 4.5, 6.4, 8.2, 10]);
  assert.deepEqual(at('WS', {}, 35, 15).slice(0, 4), [0, 2.6, 4.3, 6]);
  assert.equal(at('WS', {}, 35, 15).slice(-1)[0], 18);
  assert.deepEqual(at('WR', {}, 20, 15), [0, 2.3, 3.8, 5.4, 6.9, 8.5, 10]);
  assert.deepEqual(at('PD', { pdDash: true }, 20, 10), [0, 4.3, 7.1, 10]);
  assert.deepEqual(at('PD', { pdDash: false }, 35, 10), [0, 5, 10, 15]);
  assert.deepEqual(at('PB', {}, 25, 10), [0, 5]);
  assert.deepEqual(at('PB', {}, 20, 10), [0, 5]);
  assert.deepEqual(at('F8', {}, 35, 20), [0, 5, 10]);
  assert.deepEqual(at('UA', {}, 35, 10), [0, 5, 8.6, 12.2, 15.8, 19.4, 23]);
  assert.equal(at('DL', {}, 35, 10).slice(-1)[0], 23);
  assert.deepEqual(at('ZZ', {}, 35, 10), [0, 5, 10]);
  // the airport said Boarding 12 minutes late: the window is 18 minutes
  const late = planFor('AC', {}, 18, 15);
  assert.deepEqual(late.stages.map((s) => s.values.join('•') || s.title), ['preboard', '1', '2', 'familyBoard', '3•4', '5•6']);
  assert.deepEqual(late.stages.map((s) => Math.round(s.at * 10) / 10), [0, 2.5, 4.1, 5.7, 7.4, 9]);
});

test('a window too short merges calls and never drops a number', () => {
  for (const [code, ctx] of CARRIERS) {
    for (const L of [6, 8, 10, 12, 14, 16, 18, 20, 25]) {
      for (const C of CLOSES) {
        const p = planFor(code, ctx, L, C);
        const want = SEQ.valuesOf(p.full);
        const got = [];
        for (const s of p.stages) got.push(...s.values, ...(s.collapsed || []));
        assert.deepEqual(got, want, `${code} L=${L} C=${C}: every number is still called, in order`);
        for (let i = 1; i < p.stages.length; i++) assert.ok(p.stages[i].at >= p.stages[i - 1].at, `${code} L=${L}: in order`);
      }
    }
  }
  // the order of the merges: general pairs, then the priority numbers, then All passengers
  const ws = planFor('WR', {}, 20, 15).stages.map((s) => s.values.join('•') || s.title);
  assert.deepEqual(ws, ['preboard', '1•2', 'specialBoard', '3•4', '5•6', '7•8', '9']);
  const tiny = planFor('UA', {}, 8, 10).stages.map((s) => s.values.join('•') || s.title);
  assert.equal(tiny[tiny.length - 1], 'allPax', 'a few minutes left: general boarding, all passengers');
});

test('Porter boards in three row bands: no gap, no overlap, the middle band called', () => {
  assert.deepEqual(SEQ.porterBands(20), [[14, 20], [7, 13], [1, 6]], 'Dash 8-400: 14–20, 7–13, 1–6 (row 7 was in two bands)');
  assert.deepEqual(SEQ.porterBands(33), [[23, 33], [12, 22], [1, 11]], 'E195-E2: 23–33, 12–22, 1–11');
  for (const rows of [20, 33]) {
    const b = SEQ.porterBands(rows);
    assert.equal(b[0][1], rows, 'the back row first');
    assert.equal(b[2][0], 1, 'the front row last');
    assert.equal(b[1][1] + 1, b[0][0], 'no gap or overlap behind the middle band');
    assert.equal(b[2][1] + 1, b[1][0], 'no gap or overlap in front of it');
  }
  const p = planFor('PD', { pdDash: true }, 20, 10);
  assert.deepEqual(p.stages.filter((s) => s.kind === 'gen').map((s) => s.values[0]), ['14–20', '7–13', '1–6'], 'the middle band is called');
  // during pre-boarding the waiting panel shows the first band, never 1–7
  assert.equal(SEQ.stageAt(p, T0 + MIN).cur.kind, 'pre');
});

test("PAL's pre-boarding lasts min(S, 5) whatever the aircraft", () => {
  for (const lead of LEADS) {
    for (const close of CLOSES) {
      const p = planFor('PB', {}, lead, close);
      assert.equal(p.stages.length, 2);
      assert.equal(p.stages[1].at, Math.min(p.S, 5), `lead ${lead} close ${close}`);
    }
  }
});

test('stageAt: stage 0 before boarding opens, the last after the last call, and when the next one starts', () => {
  const p = planFor('AC', {}, 30, 15);
  const before = SEQ.stageAt(p, T0 - 5 * MIN);
  assert.equal(before.i, 0);
  assert.equal(before.nextTs, p.stages[1].ts);
  const mid = SEQ.stageAt(p, T0 + 6 * MIN);
  assert.equal(mid.cur.values[0], '2', '6 minutes in: Zone 2');
  assert.equal(mid.next.title, 'familyBoard');
  assert.equal(mid.nextTs, T0 + 7 * MIN);
  assert.equal(SEQ.stageAt(p, T0 + 7 * MIN).cur.title, 'familyBoard', 'a call comes on at its own minute');
  const after = SEQ.stageAt(p, T0 + 60 * MIN);
  assert.equal(after.i, p.stages.length - 1);
  assert.equal(after.nextTs, 0, 'nothing after the last call');
  // the airport's own stage (_boardStage) picks the stage and stops the clock
  const forced = SEQ.plan('AC', { t0: T0, dep: T0 + 30 * MIN, close: 15, boardStage: '4' });
  const f = SEQ.stageAt(forced, T0 + MIN);
  assert.deepEqual(f.cur.values, ['4']);
  assert.equal(f.nextTs, 0, 'no clock under the airport\'s word');
  assert.equal(SEQ.stageAt(SEQ.plan('AC', { t0: T0, dep: T0 + 30 * MIN, boardStage: 'familyBoard' }), T0).cur.title, 'familyBoard');
});

test('carriers resolve to their tables', () => {
  const r = (c, ctx) => { const x = SEQ.resolve(c, ctx); return x.key + (x.variant ? ':' + x.variant : ''); };
  assert.equal(r('AC'), 'AC');
  assert.equal(r('AC', { express: true }), 'AC:express', 'an AC7xxx number flown as Express');
  assert.equal(r('QK'), 'AC:express');
  assert.equal(r('JZA'), 'AC:express');
  assert.equal(r('RV'), 'AC:rouge');
  assert.equal(r('WR'), 'WS:encore');
  assert.equal(r('WJA'), 'WS');
  assert.equal(r('POE', { pdDash: false }), 'PD:e2');
  assert.equal(r('PD', { pdDash: true }), 'PD:dash');
  assert.equal(r('PVL'), 'PB');
  assert.equal(r('HA'), 'AS', 'Hawaiian boards by Alaska\'s groups since 2026-04-22');
  assert.equal(r('QX'), 'AS');
  assert.equal(r('9E'), 'DL');
  for (const c of ['MQ', 'PT', 'OH']) assert.equal(r(c), 'AA', c);
  assert.equal(r('G7'), 'UA');
  for (const c of ['OO', 'YX', 'NK', 'XX', '']) assert.equal(r(c), 'generic', (c || 'empty') + ' is ambiguous or unpublished');
  for (const c of ['4N', 'MO', 'BQ', 'P6', '9M']) assert.equal(r(c), 'noPrio', c + ' publishes no priority step');
  // Edinburgh's ICAO designators go through CALLSIGN_ICAO first
  assert.match(inner('_g8SeqPlan'), /CALLSIGN_ICAO\[_seqCode\]/);
});

test('the generic plan: the legal pre-boarding line only at Canadian and U.S. airports, the cabin where known', () => {
  const at = SEQ.plan('ZZ', { legalPre: true }).stages[0];
  assert.equal(at.who, 'preboardWhoAny');
  assert.equal(SEQ.plan('ZZ', { legalPre: false }).stages[0].who, '', 'elsewhere no who-line');
  assert.match(inner('_g8SeqPlan'), /legalPre: _homeC === 'CA' \|\| _homeC === 'US'/);
  const withCabins = SEQ.plan('ZZ', { cabins: ['cabinFirst', 'cabinEcon'] });
  assert.equal(withCabins.full[1].sub, 'cabinFirst');
  assert.equal(withCabins.full[2].sub, 'cabinEcon');
  assert.equal(withCabins.full[1].values.length, 0, 'never an invented tier number');
  assert.equal(SEQ.plan('TS', { toUS: true }).stages[0].who, 'preboardWhoTSus', "Transat's family pre-boarding excludes U.S. flights");
});

// ════════════════════════════════════════════════════════════════════════════
// WHEN BOARDING OPENED, AND NEVER GOING BACK — the gate's own functions
// ════════════════════════════════════════════════════════════════════════════

function storage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function gate() {
  const consts = ['_GATE_SEEN_IDENTITY', '_GATE_DEP_SEEN', '_GATE_SEEN_KEY', '_GATE_SEEN_FIELDS', '_GATE_SEQ_MEMO']
    .map((n) => (CORE.match(new RegExp('^var ' + n + ' = [^;]+;', 'm')) || [])[0]);
  consts.forEach((c, i) => assert.ok(c, 'constant ' + i));
  const fns = ['_gateRowKey', '_gateRawStatus', '_gateSeenKeepIdentity', '_gateSeenSlim', '_gateSeenLoad', '_gateSeenSave',
    '_gateDepsSeen', '_gateDoorRecord', '_feedSaysGateWords', '_gateBoardsByClock', '_gateSeqT0', '_gateSeqMemo', '_gateStageTerm'];
  const src = [block('var FEED_SAYS_GATE_WORDS = {'), block('var GATE_BOARDS_BY_CLOCK = {'), ...consts, ...fns.map(top),
    'return { ' + fns.map((n) => n + ': ' + n).join(', ') + ' };'].join('\n');
  const win = {};
  const G = new Function('localStorage', 'FIDSBoardSeq', 'window', src)(storage(), SEQ, win);
  G.window = win;
  return G;
}
const row = (status, extra) => Object.assign({ flight: 'AC1234', airline: 'AC', gate: '4', status, _sortTs: T0 + 30 * MIN, _revTs: null }, extra || {});
const doorAt = (cf, boardTs) => ({ bt: { boardTs }, basis: cf, kept: false });

test('boarding open (t0): by the clock, and from the moment the feed was seen to say Boarding', () => {
  // The rule itself.
  assert.equal(SEQ.t0For({ byClock: true, boardTs: T0, seenTs: 0 }), T0, 'by the clock: the printed time');
  assert.equal(SEQ.t0For({ byClock: true, boardTs: T0, seenTs: T0 - 4 * MIN }), T0 - 4 * MIN, 'by the clock, the feed early: the feed');
  assert.equal(SEQ.t0For({ byClock: true, boardTs: T0, seenTs: T0 + 6 * MIN }), T0, 'by the clock, the feed later: the clock had already opened it');
  assert.equal(SEQ.t0For({ byClock: false, boardTs: T0, seenTs: T0 + 12 * MIN }), T0 + 12 * MIN, 'the feed late and seen: late');
  assert.equal(SEQ.t0For({ byClock: false, boardTs: T0, seenTs: 0 }), T0, 'the feed late and not seen: the printed time');
  assert.equal(SEQ.t0For({ byClock: false, boardTs: T0, seenTs: T0 - 3 * MIN }), T0 - 3 * MIN, 'the feed early and seen: early');

  // The gate's own memory: Minneapolis's feed says the words.
  const G = gate();
  const t1 = T0 + 10 * MIN, t2 = T0 + 12 * MIN;
  const a = row('ontime');
  G._gateDepsSeen([a], 'MSP', t1);
  const b = row('boarding');
  G._gateDepsSeen([b], 'MSP', t2);
  assert.equal(b._doorSaid.t, t2, 'the switch to Boarding was seen, at the poll that saw it');
  assert.equal(G._gateSeqT0(b, doorAt(b, T0), 'MSP'), t2, 'feed late and seen: the sequence starts late');
  // a browser that arrives mid-boarding: no earlier copy, no t
  const H = gate();
  const c = row('boarding');
  H._gateDepsSeen([c], 'MSP', t2);
  assert.equal(c._doorSaid.t, undefined, 'a row met already boarding says nothing about when');
  assert.equal(H._gateSeqT0(c, doorAt(c, T0), 'MSP'), T0, 'feed not seen: the printed time, and nothing restarts');
  // the record keeps its t through later polls
  const d = row('final');
  G._gateDepsSeen([d], 'MSP', t2 + 5 * MIN);
  assert.equal(d._doorSaid.t, t2, 'kept through Final call');
  // a record at another gate does not count
  const e = row('boarding', { gate: '9' });
  e._doorSaid = { w: 'boarding', gate: '4', t: t2 };
  assert.equal(G._gateSeqT0(e, doorAt(e, T0), 'MSP'), T0);
});

test("Moncton: the clock opened the sign, then cyqm.ca says Boarding — nothing restarts", () => {
  const G = gate();
  // the gate boards by the clock at YQM (GATE_BOARDS_BY_CLOCK)
  const was = row('ontime');
  G._gateDepsSeen([was], 'YQM', T0 + 2 * MIN);
  const now = row('boarding');
  G._gateDepsSeen([now], 'YQM', T0 + 9 * MIN);
  assert.equal(now._doorSaid.t, T0 + 9 * MIN);
  assert.equal(G._gateSeqT0(now, doorAt(now, T0), 'YQM'), T0, 'the sequence stays on the boarding time the clock opened it on');
  // and the stage the sign is on does not step back
  const p = SEQ.plan('AC', { t0: T0, dep: T0 + 30 * MIN, close: 15 });
  const st = SEQ.stageAt(p, T0 + 9 * MIN);
  assert.equal(G._gateSeqMemo(now, p, st).i, st.i);
});

test('a delay after boarding began: the sequence runs on the clock it opened with', () => {
  // _signDepTs is the departure the sign was opened for (_door.kept), so the
  // sequence's departure does not move with the new time.
  assert.match(inner('_g8SeqPlan'), /var _dep = _signDepTs \|\| effectiveDepTs \|\| 0;/);
  const p = SEQ.plan('AC', { t0: T0, dep: T0 + 30 * MIN, close: 15 });
  // the new departure is 40 minutes later; the sequence has reached Zone 6
  // and stays there, it never restarts at pre-boarding
  const st = SEQ.stageAt(p, T0 + 25 * MIN);
  assert.equal(st.cur.values[0], '6');
  assert.equal(st.nextTs, 0);
});

test('the memo never steps back, whatever the plan is rebuilt from', () => {
  const G = gate();
  const cf = row('boarding');
  const p1 = SEQ.plan('AC', { t0: T0, dep: T0 + 30 * MIN, close: 15 });
  const s1 = G._gateSeqMemo(cf, p1, SEQ.stageAt(p1, T0 + 13.5 * MIN));
  assert.deepEqual(s1.cur.values, ['5']);
  // t0 worked out again, later (the aircraft type resolved: a shorter lead)
  const p2 = SEQ.plan('AC', { t0: T0 + 10 * MIN, dep: T0 + 30 * MIN, close: 15 });
  const raw = SEQ.stageAt(p2, T0 + 14 * MIN);
  assert.ok(raw.i < s1.i, 'the rebuilt plan alone would step back');
  const s2 = G._gateSeqMemo(cf, p2, raw);
  assert.ok(SEQ.valuesOf([s2.cur]).includes('5') || s2.cur.values.some((v) => +v >= 5), 'the memo holds Zone 5');
  assert.deepEqual(s2.cur.values, ['5', '6'], 'the merged Zones 5 • 6 once Zone 5 was called');
  assert.ok(s2.nextTs === 0 || s2.nextTs > T0 + 14 * MIN, 'and a next call, if any, is still to come');
  // a plan that turns into Express (top zone 4) after Zone 5 was called
  const p3 = SEQ.plan('AC', { t0: T0, dep: T0 + 30 * MIN, close: 15, express: true });
  const s3 = G._gateSeqMemo(cf, p3, SEQ.stageAt(p3, T0 + 3 * MIN));
  assert.equal(s3.i, p3.stages.length - 1, 'every call it has was made: the last');
  // the pure pieces
  const called = SEQ.calledThrough(p1, 4, null);
  assert.ok(called['v:1'] && called['v:2'] && called['t:familyBoard'] && called['v:3'] && !called['v:4']);
  assert.equal(SEQ.floorIndex(p1, called), 4);
  // All passengers called: a general call is never shown again as waiting
  const merged = planFor('UA', {}, 8, 10);
  const allAt = merged.stages.length - 1;
  const c2 = SEQ.calledThrough(merged, allAt, null);
  assert.equal(SEQ.floorIndex(p1, Object.assign({}, c2, { 'v:1': 1, 'v:2': 1, 't:familyBoard': 1 })), p1.stages.length - 1);
});

// ════════════════════════════════════════════════════════════════════════════
// THE SIGN, RENDERED — every stage of every table, in the board's languages
// ════════════════════════════════════════════════════════════════════════════

// The gate's own sign builders, lifted out of uxgGateHtml with the label
// helpers they call, run over every stage. A key that does not resolve
// renders as nothing or as its own name; either fails here.
function signRenderer(langs, frF) {
  const helpers = ['_g8GrpValCls', '_g8SignPair', '_g8SignLanes', '_g8SignLines', '_g8SignNext', '_g8ArrowDisc', '_g8ArrowGlyph',
    '_g8SignCol', '_g8SignHtml', '_g8SeqLabelKey', '_g8SeqValue', '_g8SeqWho', '_g8SeqPanels'].map(inner);
  const arrow = (UXG.match(/  var _G8_ARROW_PATH = [^;]+;/) || [])[0];
  assert.ok(arrow, 'the arrow path');
  const src = [block('var _GATE_LBL = {'), top('_lblEntry'), top('_gateLbl'), top('_gateLbl1Pick'), top('_gateLbl1Html'),
    arrow, ...helpers,
    'return function (seq, isFinal) { var P = _g8SeqPanels(seq, isFinal); return _g8SignHtml(P.L, P.R, isFinal ? 0 : seq.st.nextTs); };'].join('\n');
  return new Function('langs', '_frF', 'BoardStrings', 'FIDSBoardSeq', src)(langs, frF, STORE, SEQ);
}
const textOf = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ').trim();
// (the keys that are not everyday words: 'priority' or 'rows' may be a
// passenger's word, 'preboardWhoAC' never is)
const ALL_KEYS = (() => {
  const s = new Set();
  for (const T of Object.values(SEQ.SEQ)) for (const k of keysOf(T)) if (/[A-Z]/.test(k) || /board$/.test(k)) s.add(k);
  return [...s];
})();

test('no missing label key on any stage, in any language: every panel says its words', () => {
  const SETS = [[['en', 'fr'], false], [['en', 'fr'], true], [['de', 'pt'], false], [['ja'], false], [['zh'], false], [['ar'], false], [['es', 'it'], false]];
  let frames = 0;
  for (const [langs, frF] of SETS) {
    const render = signRenderer(langs, frF);
    for (const [code, ctx] of CARRIERS) {
      const p = planFor(code, ctx, 35, 15);
      const moments = p.stages.map((s) => s.ts + 30000);
      for (const [k, at] of moments.entries()) {
        const st = SEQ.stageAt(p, at);
        for (const isFinal of [false, true]) {
          if (isFinal && k > 0) continue;
          const html = render({ p, st }, isFinal);
          const text = textOf(html);
          const where = `${code}${JSON.stringify(ctx)} ${langs.join('+')} stage ${st.i}${isFinal ? ' final' : ''}`;
          // no key's own name on screen
          for (const key of ALL_KEYS) assert.ok(!new RegExp('\\b' + key + '\\b').test(text), `${where}: the raw key "${key}" is on the sign`);
          assert.doesNotMatch(text, /undefined|null|NaN|\[object/, where);
          // both panels, each with a title
          const cols = html.split('class="g8-board-col ').slice(1);
          assert.equal(cols.length, 2, where + ': both panels');
          for (const c of cols) assert.match(c, /class="g8-sign-title g8-pair"><span class="bs-h|class="g8-sign-title g8-pair"><span /, where + ': a title on each panel');
          for (const c of cols) assert.match(c, /g8-sign-lanes g8-pair"><span/, where + ': a lane line on each panel');
          // a who-list where the stage names one, in the board's first language
          if (!isFinal && st.cur.side === 'L' && st.cur.who) {
            const e = STORE.entry(st.cur.who);
            const first = STORE.pairLangs(langs, frF)[0];
            assert.ok(text.includes(e[first].split(' · ')[0]), `${where}: who is called (${st.cur.who})`);
          }
          // a pair is two whole halves round one bar: never stacked halves
          assert.doesNotMatch(html, /g8-bir-l1|g8-bir-l2/, where + ': no stacked halves');
          frames++;
        }
      }
    }
  }
  assert.ok(frames > 500, 'frames rendered: ' + frames);
});

test('the panels say the right thing at the right stage', () => {
  const render = signRenderer(['en', 'fr'], false);
  const at = (code, ctx, mins, isFinal) => {
    const p = planFor(code, ctx, 30, 15);
    return textOf(render({ p, st: SEQ.stageAt(p, T0 + mins * MIN) }, !!isFinal));
  };
  // Air Canada A320, 30-minute window
  const pre = at('AC', {}, 1);
  assert.match(pre, /Pre-boarding \| Préembarquement/);
  assert.match(pre, /wheelchair/, "Air Canada's own words for who pre-boards");
  assert.match(pre, /Next : Zone 1|Next: Zone 1/);
  assert.match(pre, /General boarding \| Embarquement général/);
  assert.match(pre, /Boarding Will Begin Shortly/, 'general boarding is not called yet');
  assert.doesNotMatch(pre, /Zones/, 'a single zone is singular');
  const z1 = at('AC', {}, 3.5);
  assert.match(z1, /Priority \| Prioritaire/);
  assert.match(z1, /Business Class \| Classe affaires/);
  assert.match(z1, /Zone 1/);
  assert.match(z1, /Next: Zone 2/);
  const fam = at('AC', {}, 7.5);
  assert.match(fam, /Family boarding \| Embarquement des familles/);
  assert.match(fam, /under the age of 6/);
  const z3 = at('AC', {}, 9.5);
  assert.match(z3, /Priority \| Prioritaire.*Zones 1 • 2/, 'the priority values called stay listed');
  assert.match(z3, /Board at your convenience/, "Air Canada's footnote: priority may board at any time");
  assert.match(z3, /Zone 3/);
  assert.match(z3, /Next: Zones 4 • 5 • 6/);
  const z6 = at('AC', {}, 20);
  assert.match(z6, /Zone 6/);
  assert.doesNotMatch(z6, /Next/, 'nothing after the last call');
  const fc = at('AC', {}, 20, true);
  assert.match(fc, /Zones 3 • 4 • 5 • 6/);
  assert.doesNotMatch(fc, /Pre-boarding|wheelchair|Next/, 'the final call: no pre-boarding words, no Next line');
  // WestJet: special boarding, and its final call 3–9
  const wsP = planFor('WS', {}, 30, 15);
  const wsSp = wsP.stages.find((x) => x.title === 'specialBoard');
  assert.match(at('WS', {}, wsSp.at + 0.5), /Special boarding \| Embarquement spécial/);
  assert.match(at('WS', {}, wsSp.at + 0.5), /under five/);
  assert.match(at('WS', {}, 20, true), /Zones 3–9/);
  assert.match(at('WS', {}, 9), /Next: Zones 4–9|Next: Zones 5–9|Next: Zones 6–9/, 'more than three still to come: a range');
  // Porter: pre-boarding keeps PorterReserve; the rows; Rows All at the final call
  const pd = at('PD', { pdDash: true }, 1);
  assert.match(pd, /Pre-boarding/);
  assert.match(pd, /PorterReserve/);
  assert.match(pd, /Unaccompanied minors/, "Porter's published roster");
  assert.match(pd, /Rows \| Rangées 14–20/, 'waiting: the first band, never 1–7');
  assert.match(at('PD', { pdDash: true }, 6), /Rows \| Rangées 14–20.*Next: Rows 7–13 • 1–6|Rows \| Rangées 14–20/);
  assert.match(at('PD', { pdDash: true }, 20, true), /Rows \| Rangées All \| Toutes/);
  // the generic plan: All passengers, never an invented group number
  const g = at('ZZ', { legalPre: true }, 12);
  assert.match(g, /All passengers \| Tous les passagers/);
  assert.doesNotMatch(g, /Group \d|Groupe \d/);
  assert.match(at('ZZ', { legalPre: true }, 1), /Passengers who need assistance or more time to board/);
  assert.doesNotMatch(at('ZZ', { legalPre: true }, 20, true), /Pre-boarding|need assistance/);
  // PAL: one lane, its own two steps
  assert.match(at('PB', {}, 1), /Use Lane 1 \| Utilisez la voie 1/);
  assert.match(at('PB', {}, 8), /All passengers/);
  assert.match(at('PB', {}, 1), /Pre-boarding.*Unaccompanied minors/, "PAL's own pre-boarding list");
  // an airline with no priority step is never given one: its left lane stays
  // its pre-boarding lane, without the list
  for (const [code, mins, fin] of [['PB', 8, false], ['PB', 20, true], ['4N', 8, false]]) {
    const x = at(code, { legalPre: true }, mins, fin);
    assert.doesNotMatch(x, /Priority|Prioritaire/, code + ': no priority step is invented');
    assert.match(x, /Pre-boarding \| Préembarquement/, code + ': the pre-boarding lane');
    assert.doesNotMatch(x, /Unaccompanied minors|need assistance/, code + ': without the list');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// WHAT DOES NOT CHANGE, AND THE SIGN'S OWN CLOCK
// ════════════════════════════════════════════════════════════════════════════

test("the window's start and the gate close are unchanged versus main", (t) => {
  let main = null;
  try {
    main = execFileSync('git', ['show', 'origin/main:fids-current/js/fids-core.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { main = null; }
  if (!main) { t.skip('no origin/main here'); return; }
  // The functions that decide when the sign opens and when the gate closes:
  // the airport's word (_gateSignPhase), the clock where the feed never says
  // it (_schedBoardingOn, GATE_BOARDS_BY_CLOCK), the lead per aircraft type
  // (getBoardingLeadMins: 20 / 25 / 30 / 35 / 45), the printed boarding time
  // (_gateBoardingTimes), the door (_gateDoor, _gateDoorBasis), and the
  // airline's close time (GATE_CLOSE_POLICY, _gateCloseInfo,
  // _gateCloseBandInfo).
  for (const name of ['_gateSignPhase', '_schedBoardingOn', '_schedBoardingWindow', 'getBoardingLeadMins', 'getAircraftCategory',
    '_gateBoardingTimes', '_gateBoardingFloorTs', '_gateDoor', '_gateDoorBasis', '_gateCloseInfo', '_gateCloseBandInfo', '_gateCloseCarrier']) {
    assert.equal(fnIn(CORE, name), fnIn(main, name), name + ' is unchanged');
  }
  for (const prefix of ['var GATE_CLOSE_POLICY = {', 'var GATE_BOARDS_BY_CLOCK = {', 'var FEED_SAYS_GATE_WORDS = {', 'const AIRCRAFT_CATEGORY = {']) {
    assert.equal(braceFrom(CORE, CORE.indexOf(prefix), prefix), braceFrom(main, main.indexOf(prefix), prefix), prefix + ' is unchanged');
  }
});

test('no fixed minutes-before-departure thresholds are left in the sign builder', () => {
  const at = UXG.indexOf('  // Build boarding panel HTML');
  const end = UXG.indexOf('  // Build countdown panel', at);
  assert.ok(at > 0 && end > at);
  const builder = UXG.slice(at, end) + inner('_g8SeqPlan') + inner('_g8SeqPanels');
  assert.doesNotMatch(builder, /minsToDep\s*[<>]=?/, 'no minsToDep threshold');
  for (const old of ['lateBoarding', '_zStep', '_wzStep', '_pdPre', '_pbPre', 'nowVal', 'nextVal', '_acZonesVal', '_comingVal', '_fcNext', 'getZoneCount']) {
    assert.ok(!builder.includes(old), old + ' is gone');
  }
  assert.doesNotMatch(CORE.replace(/\/\/.*$/mg, ''), /getZoneCount\(|AIRLINE_ZONES/, 'the invented group counts are retired');
});

test('the gate repaints when a call is due: the sign carries its next minute, the clock and the key read it', () => {
  // the sign
  assert.match(inner('_g8SignHtml'), /data-stage-next-ts="' \+ Math\.round\(nextTs\) \+ '"/);
  assert.match(UXG, /return _g8SignHtml\(_P\.L, _P\.R, _seq\.st\.nextTs\);/);
  // the once-a-second clock
  const time = CORE.slice(CORE.indexOf('function updateDedicatedTimeOnly()'), CORE.indexOf('// ── GATE SCREEN HELPERS'));
  assert.match(time, /document\.querySelector\('\.g8-sign\[data-stage-next-ts\]'\)/);
  assert.match(time, /if \(_sgEl && _sgTs > 0 && _nowMs3 >= _sgTs\) \{ _sgEl\.removeAttribute\('data-stage-next-ts'\); requestGateRebuild\(\); \}/);
  // the gate key carries the stage (a background tab catches up on its next render)
  assert.match(CORE, /\+ '\|' \+ _gateStageTerm\(currentFlight, Date\.now\(\)\) \+ '\|' \+ _gateDoorFor\(currentFlight, Date\.now\(\), iata\)\.word;/);
  assert.match(UXG, /window\._gatePaintedStage = \{ k: _gateRowKey\(currentFlight\), i: _seq\.st\.i, next: _seq\.st\.nextTs \|\| 0 \};/);
  const G = gate();
  const cf = row('boarding');
  G.window._gatePaintedStage = { k: G._gateRowKey(cf), i: 2, next: T0 + 7 * MIN };
  assert.equal(G._gateStageTerm(cf, T0 + 6 * MIN), 's2');
  assert.equal(G._gateStageTerm(cf, T0 + 7 * MIN), 's2due', 'due at its minute: the key changes');
  assert.equal(G._gateStageTerm(row('boarding', { flight: 'WS1' }), T0), '', 'another flight: no term');
});

test('the module is a passenger script loaded before the core on every board', () => {
  const policy = require('./i18n/policy.js');
  assert.ok(policy.PASSENGER_SCRIPTS.includes('fids-current/js/boarding-sequence.js'), 'scanned by the board-languages guard');
  const tag = (CORE.match(/var FIDS_BUILD_TAG = 'v(\d+)'/) || [])[1];
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'fids-current', page), 'utf8');
    const seq = html.indexOf(`js/boarding-sequence.js?v=${tag}`);
    const core = html.indexOf('js/fids-core.js?v=');
    assert.ok(seq > 0 && seq < core, page + ' loads the sequences before the core, on the build tag');
  }
  // keys, numbers and codes only: no word in the module
  const MOD = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'boarding-sequence.js'), 'utf8');
  assert.doesNotMatch(MOD.replace(/\/\/.*$|\/\*[\s\S]*?\*\//mg, ''), /'[A-Z][a-z]+ [a-z]+/, 'no label-shaped literal');
});
