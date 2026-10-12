/* Boarding sequences, airline by airline. Dependency-free for browser and Node tests.
 *
 * WHAT THIS IS. The gate's boarding sign (fids-core.js, uxgGateHtml) opens at
 * the same minute it always did: on the airport's word, or at the airline's
 * printed boarding time where the gate boards by the clock. Inside that
 * window it used to call every group at once. This file holds each airline's
 * PUBLISHED order of calls (pre-boarding first, then elite and premium
 * cabins, then general boarding by zone, group or row), and the pacing that
 * plays those calls one after another between boarding open and the
 * airline's close time.
 *
 * KEYS, NUMBERS AND CODES ONLY. Every word a passenger reads is a key of the
 * one store (board-strings.js STR) or of fids-core.js _GATE_LBL, in all nine
 * board languages. The zone, group and row values ('1', 'A', '14–20') are
 * the airline's own numbers and letters, data, never words.
 *
 * THE ORDER IS THE AIRLINE'S; THE MINUTES ARE OURS. Each table cites the
 * airline page it was read from (src), the day it was read (checked) and how
 * sure the reading is (conf), like GATE_CLOSE_POLICY. Re-check every quarter.
 * The minutes are worked out against the airline's own boarding time and
 * close time (pace). The airport's word always wins: its Boarding sets the
 * start, its Final call and Gate closed end the sequence, and a row field
 * _boardStage (a future feed field, or the shared operator override) picks
 * the stage outright and stops the clock.
 *
 * Exports: SEQ, ALIAS, plan(carrier, ctx), stageAt(plan, nowMs), and the
 * pure pieces the gate and the tests use: pace, t0For, fmt, atomsOf,
 * calledThrough, floorIndex, porterBands, resolve. No page access.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FIDSBoardSeq = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A stage: kind 'pre' (pre-boarding), 'prio' (elite, premium cabin,
  // priority), 'fam' (the airline's own family or courtesy call) or 'gen'
  // (general boarding by zone, group or row). title: the store key of the
  // stage's own name (pre, fam and an un-numbered priority call); label: the
  // group word ('zone', 'groupLabel', 'rows'); value: the airline's number or
  // letter; sub: the cabin key printed under the title; who: the store key of
  // who is called (shown one language at a time).
  function pre(who, sub) { return { kind: 'pre', title: 'preboard', who: who || '', sub: sub || '' }; }
  function prio(label, value, sub, who) { return { kind: 'prio', label: label || '', value: value || '', sub: sub || '', who: who || '' }; }
  function fam(title, who) { return { kind: 'fam', title: title, who: who || '' }; }
  function gen(label, value, sub) { return { kind: 'gen', label: label || '', value: value || '', sub: sub || '' }; }
  function gens(label, values, sub) { return values.map(function (v) { return gen(label, v, sub); }); }
  function allPax(sub) { return { kind: 'gen', title: 'allPax', sub: sub || '' }; }

  // ── THE TABLES (phase 1) ─────────────────────────────────────────────────
  var SEQ = {
    // Air Canada, Rouge and Air Canada Express. "Pre-boarding · Zone 1 ·
    // Zone 2 · Family Boarding / Musical Instruments · Zone 3 – General
    // Boarding · Zones 4, 5 and 6". FAMILIES COME AFTER ZONES 1 AND 2: the
    // French family page says outright « entre les zones 2 et 3 ». Express
    // ends at Zone 4. Rouge differs only in its premium cabin. Priority
    // guests in Zones 1 and 2 may board at any time once general boarding has
    // started (the page's footnote): prioAnyTime.
    AC: {
      src: 'https://www.aircanada.com/ca/en/aco/home/fly/at-the-airport/boarding-by-zone.html',
      srcFr: 'https://www.aircanada.com/ca/fr/aco/home/fly/at-the-airport/boarding-by-zone.html',
      checked: '2026-10-12', conf: 'high', prioAnyTime: true,
      stages: [pre('preboardWhoAC'), prio('zone', '1', 'cabinBiz'), prio('zone', '2', 'cabinBiz'),
        fam('familyBoard', 'familyWhoAC')].concat(gens('zone', ['3', '4', '5', '6'], 'cabinEcon')),
      variants: {
        express: { drop: ['5', '6'] },
        rouge: { sub: { cabinBiz: 'cabinPremRouge' } }
      }
    },
    // WestJet and WestJet Encore. Pre-boarding (guests who need extra time or
    // support, unaccompanied minors), Zone 1, Zone 2, then "special boarding,
    // after our priority guests" for children under five, then Zones 3
    // through 9 (rewards page, effective 2025-01-15). Encore flies one cabin.
    WS: {
      src: 'https://www.westjet.com/en-ca/airport/priority-services',
      srcFr: 'https://www.westjet.com/fr-ca/aeroport/services-prioritaires',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoWS'), prio('zone', '1', 'cabinPremiumWS'), prio('zone', '2', 'cabinPremiumWS'),
        fam('specialBoard', 'specialWhoWS')].concat(gens('zone', ['3', '4', '5', '6', '7', '8', '9'], 'cabinEconWS')),
      variants: { encore: { sub: { cabinPremiumWS: '', cabinEconWS: '' } } }
    },
    // Porter. Two phases only: one pre-boarding group (disabilities,
    // unaccompanied minors, children two and under, the four VIPorter elite
    // tiers and PorterReserve, so Porter has no separate priority step), then
    // general boarding. The row bands, back to front, are the sign's own
    // presentation (porterBands), not something Porter publishes.
    PD: {
      src: 'https://www.flyporter.com/en-ca/travel-information/at-the-airport/boarding-process',
      srcFr: 'https://www.flyporter.com/fr-ca/travel-information/at-the-airport/boarding-process',
      checked: '2026-10-12', conf: 'high', prioAnyTime: true,
      stages: [pre('preboardList', 'pdReserve'),
        { kind: 'gen', label: 'rows', band: 0, sub: 'pdClassic' },
        { kind: 'gen', label: 'rows', band: 1, sub: 'pdClassic' },
        { kind: 'gen', label: 'rows', band: 2, sub: 'pdClassic' }],
      variants: { dash: { rows: 20 }, e2: { rows: 33 } }
    },
    // PAL Airlines on its own numbers: pre-boarding, then "PAL Airlines
    // general boarding". No priority step, no zones; one lane.
    PB: {
      src: 'https://palairlines.ca/travel-hub/travel-documents/',
      srcFr: 'https://palairlines.ca/fr/travel-hub-2/documents-pour-les-vols/',
      checked: '2026-10-12', conf: 'medium', prioAnyTime: false, oneLane: true,
      stages: [pre('preboardWhoPB'), allPax()]
    },
    // Flair: pre-boarding, Priority Boarding, general boarding. Read from the
    // search index of flyflair.com (the site blocks automated readers);
    // Flair's French is not verified.
    F8: {
      src: 'https://www.flyflair.com/priority-boarding',
      checked: '2026-10-12', conf: 'medium', prioAnyTime: false,
      stages: [pre('preboardWhoF8'), prio(), allPax()]
    },
    // Air Transat publishes who pre-boards and who boards in priority, no
    // numbers. Family pre-boarding excludes flights to the U.S.
    // (preboardWhoTSus).
    TS: {
      src: 'https://www.airtransat.com/en-CA/travel-information/families-and-children/family-privileges',
      srcFr: 'https://www.airtransat.com/fr-CA/info-voyage/familles-et-enfants/privileges-familles',
      checked: '2026-10-12', conf: 'low', prioAnyTime: false,
      stages: [pre('preboardWhoTS'), prio('', '', 'cabinClub'), allPax('cabinEcon')]
    },
    // United: Pre-boarding, Groups 1 and 2 (premium, elites), Groups 3 to 6.
    UA: {
      src: 'https://www.united.com/en/us/fly/travel/airport/boarding-process.html',
      srcFr: 'https://www.united.com/fr/ca/fly/travel/airport/boarding-process.html',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoUA'), prio('groupLabel', '1', 'cabinUnitedFirst'), prio('groupLabel', '2', 'cabinUnitedFirst')]
        .concat(gens('groupLabel', ['3', '4', '5', '6'], 'cabinUnitedEcon'))
    },
    // Delta: Pre-Boarding (and active-duty military), Zones 1 and 2, Early
    // Access (car seats and strollers, an unlabeled row between Zone 2 and
    // Zone 3), Zones 3 and 4 (Sky Priority lane), Zones 5 to 8.
    DL: {
      src: 'https://www.delta.com/us/en/check-in-security/boarding-priority',
      srcFr: 'https://fr.delta.com/ca/fr/check-in-security/boarding-priority',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoDL'), prio('zone', '1', 'cabinFirst'), prio('zone', '2', 'cabinFirst'),
        fam('earlyAccess', 'earlyAccessWhoDL'), prio('zone', '3', 'cabinFirst'), prio('zone', '4', 'cabinFirst')]
        .concat(gens('zone', ['5', '6', '7', '8'], 'cabinEcon'))
    },
    // American: special assistance, then ConciergeKey, First and Business,
    // then families with children under 2, then Groups 1 to 9 (Groups 1 to 4
    // the elites' "premium perks"; 7 and 8 are one row on American's table).
    AA: {
      src: 'https://www.aa.com/web/i18n/travel-info/boarding-process.html',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoAA'), prio('', '', 'cabinFirst', 'prioWhoAA'), fam('familyBoard', 'familyWhoAA'),
        prio('groupLabel', '1', 'cabinFirst'), prio('groupLabel', '2', 'cabinFirst'),
        prio('groupLabel', '3', 'cabinFirst'), prio('groupLabel', '4', 'cabinFirst'),
        gen('groupLabel', '5', 'cabinEcon'), gen('groupLabel', '6', 'cabinEcon'),
        { kind: 'gen', label: 'groupLabel', values: ['7', '8'], sub: 'cabinEcon' },
        gen('groupLabel', '9', 'cabinEcon')]
    },
    // Alaska, and Hawaiian since 2026-04-22: Preboarding, Priority Boarding
    // (First Class, Atmos Titanium), Groups A to C, then D (back half), E
    // (front half), F. Families with infants board in Group A.
    AS: {
      src: 'https://www.alaskaair.com/content/travel-info/flight-experience/our-boarding-process',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoAS'), prio('', '', 'cabinFirst'),
        prio('groupLabel', 'A', 'cabinFirst'), prio('groupLabel', 'B', 'cabinFirst'), prio('groupLabel', 'C', 'cabinFirst')]
        .concat(gens('groupLabel', ['D', 'E', 'F'], 'cabinEcon'))
    },
    // Southwest (assigned seats since 2026-01-27): Preboarding, Priority
    // Boarding with active-duty military and A-List Preferred, Groups 1 and
    // 2, then Groups 3 to 8.
    WN: {
      src: 'https://support.southwest.com/helpcenter/article/boarding-process',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoWN'), prio('', '', '', 'prioWhoWN'), prio('groupLabel', '1'), prio('groupLabel', '2')]
        .concat(gens('groupLabel', ['3', '4', '5', '6', '7', '8']))
    },
    // JetBlue: Pre-boarding, Groups 1 to 3, Courtesy Boarding (military, car
    // seats and strollers), then Groups 4 to 8.
    B6: {
      src: 'https://www.jetblue.com/help/boarding-procedures',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoB6'), prio('groupLabel', '1'), prio('groupLabel', '2'), prio('groupLabel', '3'),
        fam('courtesyBoard', 'courtesyWhoB6')].concat(gens('groupLabel', ['4', '5', '6', '7', '8']))
    },
    // Frontier: Preboarding (with Elite Diamond), Group 1, Groups 2 to 7 (6
    // and 7 are one row on Frontier's page).
    F9: {
      src: 'https://faq.flyfrontier.com/help/frontier-boarding-process',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoF9'), prio('groupLabel', '1')]
        .concat(gens('groupLabel', ['2', '3', '4', '5']))
        .concat([{ kind: 'gen', label: 'groupLabel', values: ['6', '7'] }])
    },
    // Every airline with no published order: pre-boarding (passengers who
    // need assistance or more time, a legal duty at Canadian and U.S.
    // airports: ATPDR s.34(1), 14 CFR 382.93, so the who-line shows there
    // only), priority with the cabin where one is known and never an
    // invented tier or number, then general boarding, all passengers.
    generic: {
      src: 'house', checked: '2026-10-12', conf: 'generic', prioAnyTime: false,
      stages: [pre('preboardWhoAny'), prio(), allPax()]
    },
    // Airlines that publish no priority step at all: pre-boarding, then
    // general boarding. Air North (Advance Boarding is in no fare), Calm Air,
    // Pascan, Central Mountain Air on its own numbers.
    noPrio: {
      src: 'house', checked: '2026-10-12', conf: 'generic', prioAnyTime: false,
      stages: [pre('preboardWhoAny'), allPax()]
    }
  };

  // ── WHICH TABLE A CARRIER READS ──────────────────────────────────────────
  // 'TABLE' or 'TABLE:variant'. The gate resolves an ICAO designator
  // through its own CALLSIGN_ICAO first (Edinburgh sends ICAO codes). Not
  // here, so the generic plan: carriers flying for more than one brand (OO
  // SkyWest, YX Republic), Spirit (NK, ceased flying 2026-05-02: a row is
  // stale data), and the phase 2 tables still to be built.
  var ALIAS = {
    AC: 'AC', ACA: 'AC', RV: 'AC:rouge', ROU: 'AC:rouge', QK: 'AC:express', JZA: 'AC:express',
    WS: 'WS', WJA: 'WS', WR: 'WS:encore', WEN: 'WS:encore',
    PD: 'PD', POE: 'PD',
    PB: 'PB', PVL: 'PB',
    F8: 'F8', FLE: 'F8',
    TS: 'TS', TSC: 'TS',
    UA: 'UA', UAL: 'UA', G7: 'UA',
    DL: 'DL', DAL: 'DL', '9E': 'DL',
    AA: 'AA', AAL: 'AA', MQ: 'AA', PT: 'AA', OH: 'AA',
    AS: 'AS', ASA: 'AS', HA: 'AS', HAL: 'AS', QX: 'AS',
    WN: 'WN', SWA: 'WN',
    B6: 'B6', JBU: 'B6',
    F9: 'F9', FFT: 'F9',
    '4N': 'noPrio', MO: 'noPrio', BQ: 'noPrio', P6: 'noPrio', '9M': 'noPrio'
  };
  function resolve(carrier, ctx) {
    var code = String(carrier || '').trim().toUpperCase();
    var a = Object.prototype.hasOwnProperty.call(ALIAS, code) ? ALIAS[code] : 'generic';
    var parts = a.split(':');
    var key = parts[0], variant = parts[1] || '';
    // An Air Canada number flown as Air Canada Express (Jazz, PAL, Central
    // Mountain Air): Express zones, whatever the marketing code says.
    if (key === 'AC' && ctx && ctx.express) variant = 'express';
    if (key === 'PD') variant = (ctx && ctx.pdDash === false) ? 'e2' : 'dash';
    return { key: key, variant: variant };
  }

  // Porter's row bands, back to front, in three: no gap, no overlap, the
  // middle band called. Dash 8-400 (20 rows): 14–20, 7–13, 1–6. E195-E2 (33
  // rows): 23–33, 12–22, 1–11.
  function porterBands(rows) {
    var n = rows > 0 ? rows : 20;
    var b = Math.ceil(n / 3);
    var hi1 = n, lo1 = n - b + 1, hi2 = lo1 - 1, lo2 = Math.max(2, hi2 - b + 1);
    return [[lo1, hi1], [lo2, hi2], [1, lo2 - 1]];
  }

  // The table expanded for one flight: variants applied, values as lists,
  // each stage with its side (L for pre/prio/fam, R for gen) and its atoms
  // (what it calls, for the no-going-back memo).
  function expand(T, variant, ctx) {
    var V = (T.variants && variant && T.variants[variant]) || {};
    var out = [];
    T.stages.forEach(function (s0) {
      var s = {};
      for (var k in s0) if (Object.prototype.hasOwnProperty.call(s0, k)) s[k] = s0[k];
      if (s.band != null) {
        var bands = porterBands((ctx && ctx.pdRows) || V.rows || 20);
        var bd = bands[s.band];
        s.value = bd[0] + '–' + bd[1];
        delete s.band;
      }
      s.values = s.values ? s.values.slice() : (s.value ? [s.value] : []);
      delete s.value;
      if (V.drop && s.values.length === 1 && V.drop.indexOf(s.values[0]) >= 0) return;
      if (V.sub && s.sub && Object.prototype.hasOwnProperty.call(V.sub, s.sub)) s.sub = V.sub[s.sub];
      if (s.kind === 'pre' && s.who === 'preboardWhoAny' && !(ctx && ctx.legalPre)) s.who = '';
      if (s.kind === 'pre' && s.who === 'preboardWhoTS' && ctx && ctx.toUS) s.who = 'preboardWhoTSus';
      // A generic plan's cabins are the carrier's own where the gate knows
      // them (_G8_CABINS): the premium one over priority, the economy one
      // over general boarding.
      if (!s.sub && ctx && ctx.cabins && (T === SEQ.generic || T === SEQ.noPrio)) {
        if (s.kind === 'prio') s.sub = ctx.cabins[0] || '';
        if (s.kind === 'gen') s.sub = ctx.cabins[1] || '';
      }
      s.side = s.kind === 'gen' ? 'R' : 'L';
      out.push(s);
    });
    return out;
  }

  // ── PACING ───────────────────────────────────────────────────────────────
  // All in minutes after boarding opens (t0), the window L = dep − t0, the
  // airline's close C (pacing only, never printed).
  //   S, when the last general step is called: max(L − C − 2, L/2), never
  //     later than dep − 5.
  //   Pre-boarding: 1.5 shares, 2 to 5 minutes.
  //   Every other step: one share, 1.5 to 5 minutes (with only two or three
  //     steps the 5-minute cap brings general boarding forward before S).
  //   The last step holds until Final call, Gate closed or departure.
  // A share under 1.5 minutes merges, in this order, without dropping a
  // number: neighbouring numbered general steps in pairs (Zones 3 • 4), then
  // the numbered priority steps into one (Zones 1 • 2), then the general
  // steps into "All passengers". So the sign never changes more often than
  // every 90 seconds.
  function lastAt(L, C) {
    var S = Math.min(Math.max(L - C - 2, L / 2), L - 5);
    if (!(S >= 1.5)) S = Math.max(0, Math.min(1.5, L / 2));
    return S;
  }
  function timesFor(st, S) {
    var n = st.length;
    if (n <= 1) return { t: [0], rest: Infinity };
    var hasPre = st[0].kind === 'pre';
    var W = 0;
    for (var i = 0; i < n - 1; i++) W += (i === 0 && hasPre) ? 1.5 : 1;
    var u = S / W;
    var dPre = hasPre ? Math.min(5, Math.max(2, 1.5 * u)) : 0;
    var t = [0], r;
    if (hasPre && n === 2) { t.push(Math.min(S, dPre)); r = Infinity; }
    else if (hasPre) {
      r = Math.min(5, (S - dPre) / (n - 2));
      for (var j = 1; j < n; j++) t.push(dPre + (j - 1) * r);
    } else {
      r = Math.min(5, S / (n - 1));
      for (var j2 = 1; j2 < n; j2++) t.push(j2 * r);
    }
    // A window too short for any pacing (boarding opened minutes before
    // departure): evenly, in order.
    for (var m = 1; m < n; m++) {
      if (!(t[m] > t[m - 1])) { for (var q = 1; q < n; q++) t[q] = q * (S > 0 ? S : 0) / (n - 1); break; }
    }
    return { t: t, rest: r };
  }
  function mergeGen(st) {
    var out = [], did = false, i = 0;
    while (i < st.length) {
      var a = st[i], b = st[i + 1];
      if (a.kind === 'gen' && b && b.kind === 'gen' && a.values.length && b.values.length && !a.merged && !b.merged) {
        out.push({ kind: 'gen', label: a.label, values: a.values.concat(b.values), sub: a.sub, side: 'R', merged: true });
        i += 2; did = true;
      } else { out.push(a); i++; }
    }
    return did ? out : null;
  }
  function mergePrio(st) {
    var p = st.filter(function (s) { return s.kind === 'prio' && s.values.length; });
    if (p.length < 2) return null;
    var vals = [];
    p.forEach(function (s) { vals = vals.concat(s.values); });
    var out = [];
    st.forEach(function (s) {
      if (s.kind === 'prio' && s.values.length) {
        if (s === p[0]) out.push({ kind: 'prio', label: s.label, values: vals, sub: s.sub, who: s.who, side: 'L', merged: true });
      } else out.push(s);
    });
    return out;
  }
  function collapseGen(st) {
    var gi = -1;
    for (var i = 0; i < st.length; i++) if (st[i].kind === 'gen') { gi = i; break; }
    if (gi < 0 || st.length - gi < 2) return null;
    var g = st[gi];
    var all = { kind: 'gen', title: 'allPax', values: [], sub: g.sub, side: 'R', collapsed: [] };
    st.slice(gi).forEach(function (s) { all.collapsed = all.collapsed.concat(s.values); });
    return st.slice(0, gi).concat([all]);
  }
  function pace(stages, L, C) {
    var S = lastAt(L, C);
    var st = stages.slice();
    var r = timesFor(st, S), guard = 0;
    while (r.rest < 1.5 && guard++ < 12) {
      var m = mergeGen(st) || mergePrio(st) || collapseGen(st);
      if (!m) break;
      st = m;
      r = timesFor(st, S);
    }
    return { stages: st, at: r.t, S: S };
  }

  // ── WHEN BOARDING OPENED (t0) ────────────────────────────────────────────
  //   o.byClock  the gate opens its sign at the printed boarding time (an
  //              airport whose feed never says Boarding, or Moncton's gate);
  //   o.boardTs  the boarding time the sign opened on (_door.bt.boardTs);
  //   o.seenTs   when this screen saw the feed switch to Boarding
  //              (_doorSaid.t), 0 when it did not see the switch.
  // By the clock: the printed time, or the feed's word when it came earlier.
  // Where the feed says the words: the switch this screen saw, else the
  // printed time (a browser that arrives mid-boarding does not restart it).
  function t0For(o) {
    var bt = Number(o && o.boardTs) || 0, seen = Number(o && o.seenTs) || 0;
    if (o && o.byClock) return (bt && seen) ? Math.min(bt, seen) : (bt || seen);
    return seen || bt;
  }

  function ids(s) {
    if (s.values && s.values.length) return s.values.map(function (v) { return 'v:' + v; });
    if (s.title) return ['t:' + s.title];
    return ['k:' + s.kind];
  }
  function atomsOf(s) { return ids(s).concat(s.collapsed ? s.collapsed.map(function (v) { return 'v:' + v; }) : []); }

  // ── THE PLAN FOR ONE FLIGHT ──────────────────────────────────────────────
  // ctx: t0 and dep (ms), close (minutes, GATE_CLOSE_POLICY; 10 when the
  // airline publishes none or only a be-at-the-gate time), express, pdDash,
  // legalPre (a Canadian or U.S. airport), toUS (Transat), cabins (the gate's
  // [premium, economy] keys, for the generic plan), boardStage (the row's
  // _boardStage).
  function plan(carrier, ctx) {
    ctx = ctx || {};
    var r = resolve(carrier, ctx);
    var T = SEQ[r.key] || SEQ.generic;
    var full = expand(T, r.variant, ctx);
    var t0 = Number(ctx.t0) || 0, dep = Number(ctx.dep) || 0;
    var L = (t0 && dep) ? (dep - t0) / 60000 : 35;
    var C = (ctx.close > 0) ? Number(ctx.close) : 10;
    var p = pace(full, L, C);
    var stages = p.stages.map(function (s, i) {
      var o = {};
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k];
      o.i = i;
      o.at = p.at[i];
      o.ts = t0 + Math.round(p.at[i] * 60000);
      return o;
    });
    var premium = '', economy = '';
    full.forEach(function (s) {
      if (!premium && s.kind !== 'gen' && s.sub) premium = s.sub;
      if (!economy && s.kind === 'gen' && s.sub) economy = s.sub;
    });
    var out = {
      carrier: String(carrier || '').toUpperCase(), key: r.key, variant: r.variant,
      src: T.src, checked: T.checked, conf: T.conf, prioAnyTime: !!T.prioAnyTime, oneLane: !!T.oneLane,
      stages: stages, full: full, t0: t0, dep: dep, L: L, C: C, S: p.S, cabins: [premium, economy],
      forced: -1
    };
    if (ctx.boardStage != null && ctx.boardStage !== '') out.forced = forcedIndex(out, ctx.boardStage);
    return out;
  }
  // The airport's (or an operator's) own stage: an index, or a value or
  // title the plan calls ('3', 'familyBoard'). -1 when it names nothing.
  function forcedIndex(p, want) {
    if (typeof want === 'number' && want >= 0 && want < p.stages.length) return Math.floor(want);
    var w = String(want).trim();
    if (/^\d+$/.test(w) && !p.stages.some(function (s) { return s.values.indexOf(w) >= 0; })) {
      var n = parseInt(w, 10);
      return n < p.stages.length ? n : -1;
    }
    for (var i = 0; i < p.stages.length; i++) {
      var s = p.stages[i];
      if (s.values.indexOf(w) >= 0 || (s.collapsed && s.collapsed.indexOf(w) >= 0) || s.title === w || s.kind === w) return i;
    }
    return -1;
  }

  // Which stage is live: {i, cur, next, nextTs}. Stage 0 before t0, the last
  // after it; nextTs is when the next stage starts (0 on the last, or when
  // the airport's own stage stops the clock).
  function stageAt(p, nowMs) {
    var st = (p && p.stages) || [];
    if (!st.length) return { i: -1, cur: null, next: null, nextTs: 0 };
    var i = 0;
    if (p.forced >= 0) i = p.forced;
    else for (var j = 1; j < st.length; j++) if (nowMs >= st[j].ts) i = j;
    var next = st[i + 1] || null;
    return { i: i, cur: st[i], next: next, nextTs: (next && p.forced < 0) ? next.ts : 0 };
  }

  // ── NEVER GOING BACKWARDS ────────────────────────────────────────────────
  // What a sign has called (atoms: each value, or a stage's title), through
  // stage i; and the furthest stage of a plan that calls any of them (a
  // merged Zones 5 • 6 once Zone 5 has been called). A plan rebuilt with
  // another start or another shape (the aircraft type resolved late, the
  // window merged differently) never steps back.
  function calledThrough(p, i, called) {
    var out = {};
    for (var k in (called || {})) if (Object.prototype.hasOwnProperty.call(called, k)) out[k] = 1;
    for (var j = 0; j <= i && j < p.stages.length; j++) atomsOf(p.stages[j]).forEach(function (a) { out[a] = 1; });
    return out;
  }
  function floorIndex(p, called) {
    var f = -1;
    if (!called) return f;
    var allCalled = !!called['t:allPax'];
    for (var j = 0; j < p.stages.length; j++) {
      var s = p.stages[j];
      var ok = ids(s).some(function (a) { return called[a] || (allCalled && s.kind === 'gen'); });
      if (ok) f = j;
    }
    return f;
  }

  // ── WRITING A LIST OF VALUES ─────────────────────────────────────────────
  // Up to `max` values with • between them; more, when they run on (1 2 3 4,
  // D E F), as a range 4–9.
  function fmt(values, max) {
    var v = (values || []).filter(function (x) { return x !== '' && x != null; });
    if (!v.length) return '';
    var lim = max || 3;
    if (v.length <= lim) return v.join(' • ');
    var run = v.every(function (x, i) {
      if (i === 0) return true;
      var a = v[i - 1], b = x;
      if (/^\d+$/.test(a) && /^\d+$/.test(b)) return parseInt(b, 10) === parseInt(a, 10) + 1;
      if (/^[A-Z]$/.test(a) && /^[A-Z]$/.test(b)) return b.charCodeAt(0) === a.charCodeAt(0) + 1;
      return false;
    });
    return run ? v[0] + '–' + v[v.length - 1] : v.join(' • ');
  }

  // The values a list of stages calls, in order.
  function valuesOf(list) {
    var out = [];
    (list || []).forEach(function (s) { out = out.concat(s.values || []); });
    return out;
  }

  return {
    SEQ: SEQ, ALIAS: ALIAS, plan: plan, stageAt: stageAt, resolve: resolve, pace: pace, lastAt: lastAt,
    t0For: t0For, fmt: fmt, valuesOf: valuesOf, atomsOf: atomsOf, calledThrough: calledThrough,
    floorIndex: floorIndex, porterBands: porterBands
  };
});
