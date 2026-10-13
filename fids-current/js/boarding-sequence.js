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
 * pure pieces the gate and the tests use: pace, t0For, fmt, joinWho, atomsOf,
 * calledThrough, floorIndex, porterBands, resolve, pickSub, coverPlus. No
 * page access.
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
  // who is called (shown in both of the board's languages). A PRIORITY CALL
  // NAMES EVERYONE IN IT: its cabin stays the sub, and its who-list names
  // everyone else the airline puts in that call (elite tiers, alliance
  // status, cardholders, paid priority, companions on the same reservation),
  // read from the airline's own boarding page (prioWho* in the store).
  //
  // EACH STAGE NAMES ITS OWN CABIN, OR NONE. A sub is a key, or a list of
  // [condition, key] read in order (the first that holds wins, none: no
  // cabin), because the cabin in a zone depends on the aircraft and the
  // route: Air Canada's Premium Economy (Zone 2) flies only on its widebodies,
  // Premium Rouge boards in Zone 1 on domestic and Caribbean flights and in
  // Zone 2 on international ones. Conditions (subWhen): 'wide' and 'narrow'
  // (the aircraft's category, when the type is known), 'twoCabin' (a regional
  // jet with a business cabin: CRJ900, CRJ700, E175), 'domcarib' and 'intl'
  // (the route), '*' (always). A cabin the airline names only by a brand
  // that is the same in every language (Delta One, Delta Main, United
  // Polaris) is not a sub: the board-languages guard takes a new brand term
  // only with its own approval, so those cabins are named inside a who-list
  // in the airline's own words, or not at all.
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
    // ends at Zone 4. Priority guests in Zones 1 and 2 may board at any time
    // once general boarding has started (the page's footnote): prioAnyTime.
    // Cabins, as the page lists them: Zone 1 "Business Class passengers and
    // Premium Rouge passengers on domestic or Caribbean flights"; Zone 2
    // "Premium Economy passengers and Premium Rouge passengers on
    // international flights" (Premium Economy flies only on Air Canada's
    // widebodies; a U.S. or Mexican Rouge flight is neither, so it names no
    // cabin). Air Canada Express sells Business only on its two-cabin jets
    // (CRJ900, E175), never on the Dash 8 or the CRJ200.
    AC: {
      src: 'https://www.aircanada.com/ca/en/aco/home/fly/at-the-airport/boarding-by-zone.html',
      srcFr: 'https://www.aircanada.com/ca/fr/aco/home/fly/at-the-airport/boarding-by-zone.html',
      checked: '2026-10-12', conf: 'high', prioAnyTime: true,
      stages: [pre('preboardWhoAC'), prio('zone', '1', 'cabinBiz', 'prioWhoAC1'), prio('zone', '2', [['wide', 'cabinPremEconAC']], 'prioWhoAC2'),
        fam('familyBoard', 'familyWhoAC')].concat(gens('zone', ['3', '4', '5', '6'], 'cabinEcon')),
      variants: {
        express: { drop: ['5', '6'], stageSub: { '1': [['twoCabin', 'cabinBiz']], '2': '' } },
        rouge: { stageSub: { '1': [['domcarib', 'cabinPremRouge']], '2': [['intl', 'cabinPremRouge']] } }
      }
    },
    // WestJet and WestJet Encore. Pre-boarding (guests who need extra time or
    // support, unaccompanied minors), Zone 1 (Premium), Zone 2 ("Gold and
    // Silver Rewards members… Guests seated in Extended Comfort"), then
    // "special boarding, after our priority guests" for children under five,
    // then "Zone 3+ — Remaining guests" (rewards page, effective 2025-01-15).
    // The sign calls Zone 3, then Zone 3+: WestJet publishes no top zone (the
    // highest is printed on the pass), so the sign never steps through zones
    // an aircraft may not use. Encore sells Premium (no extra legroom on its
    // aircraft, inflight/premium-cabin); no page says Encore sells Extended
    // Comfort, so its Zone 2 names no cabin. Business flies only on the
    // 787-9, so Zone 1 reads "Business or Premium" on a widebody.
    // Who else each zone takes (Platinum; Gold, Silver and Delta Gold
    // Medallion) is from priority services and the rewards page, read
    // 2026-10-13.
    WS: {
      src: 'https://www.westjet.com/en-ca/airport/priority-services',
      srcFr: 'https://www.westjet.com/fr-ca/aeroport/services-prioritaires',
      srcZones: 'https://www.westjet.com/en-ca/rewards',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoWS'), prio('zone', '1', [['wide', 'cabinBizPremWS'], ['*', 'cabinPremiumWS']], 'prioWhoWS1'), prio('zone', '2', 'cabinExtComfortWS', 'prioWhoWS2'),
        fam('specialBoard', 'specialWhoWS')].concat(gens('zone', ['3', '3+'], 'cabinEconWS')),
      variants: { encore: { stageSub: { '2': '' } } }
    },
    // Porter. Two phases only: one pre-boarding group (disabilities,
    // unaccompanied minors, children two and under, the four VIPorter elite
    // tiers and PorterReserve, so Porter has no separate priority step), then
    // general boarding. The row bands, back to front, are the sign's own
    // presentation (porterBands), not something Porter publishes; nor is a
    // "board at your convenience" line (prioAnyTime false: Porter publishes
    // none).
    PD: {
      src: 'https://www.flyporter.com/en-ca/travel-information/at-the-airport/boarding-process',
      srcFr: 'https://www.flyporter.com/fr-ca/travel-information/at-the-airport/boarding-process',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false, rowsHouse: true,
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
    // Flair's French is not verified. Who its priority call is for (Flair
    // Express, included with a carry-on bag since 2025-12-03) is from the
    // search index of https://www.flyflair.com/flair-express only (low).
    F8: {
      src: 'https://www.flyflair.com/priority-boarding',
      checked: '2026-10-12', conf: 'medium', prioAnyTime: false,
      stages: [pre('preboardWhoF8'), prio('', '', '', 'prioWhoF8'), allPax()]
    },
    // Air Transat publishes who pre-boards and who boards in priority, no
    // numbers. Family pre-boarding excludes flights to the U.S.
    // (preboardWhoTSus).
    // Transat boards by zone (the zone is printed on the pass), but no page
    // lists who is in which: its calls carry no number, and the switch to
    // everyone says ALL ZONES (unit).
    TS: {
      src: 'https://www.airtransat.com/en-CA/travel-information/families-and-children/family-privileges',
      srcFr: 'https://www.airtransat.com/fr-CA/info-voyage/familles-et-enfants/privileges-familles',
      checked: '2026-10-12', conf: 'low', prioAnyTime: false, unit: 'zone',
      stages: [pre('preboardWhoTS'), prio('', '', 'cabinClub', 'prioWhoTS'), allPax('cabinEcon')]
    },
    // United: Pre-boarding, Group 1 (its premium cabins and top elites),
    // Group 2 (Premier Silver, Premier Access: no cabin), Groups 3 to 6.
    // United First is the front cabin of United's mainline narrowbodies; on a
    // widebody it is United Polaris or United Business, and a one-cabin
    // regional jet has none, so only a known mainline narrowbody names it.
    UA: {
      src: 'https://www.united.com/en/us/fly/travel/airport/boarding-process.html',
      srcFr: 'https://www.united.com/fr/ca/fly/travel/airport/boarding-process.html',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoUA'), prio('groupLabel', '1', [['narrow', 'cabinUnitedFirst']], 'prioWhoUA1'), prio('groupLabel', '2', '', 'prioWhoUA2')]
        .concat(gens('groupLabel', ['3', '4', '5', '6'], 'cabinUnitedEcon'))
    },
    // Delta: Pre-Boarding (and active-duty military), Zone 1 ("Delta One
    // customers", "Delta First customers"), Zone 2 (Delta 360°, Diamond
    // Medallion, Delta Premium Select), Early Access (car seats and
    // strollers, an unlabeled row between Zone 2 and Zone 3), Zone 3 ("Delta
    // Comfort customers"), Zone 4 (Medallion elites, Sky Priority lane),
    // Zones 5 to 8 (Delta Main Extra, Classic and Basic). Delta's cabins are
    // brands, so they are named in the who-lists.
    DL: {
      src: 'https://www.delta.com/us/en/check-in-security/boarding-priority',
      srcFr: 'https://fr.delta.com/ca/fr/check-in-security/boarding-priority',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoDL'), prio('zone', '1', '', 'prioWhoDL1'), prio('zone', '2', '', 'prioWhoDL2'),
        fam('earlyAccess', 'earlyAccessWhoDL'), prio('zone', '3', '', 'prioWhoDL3'), prio('zone', '4', '', 'prioWhoDL4')]
        .concat(gens('zone', ['5', '6', '7', '8']))
    },
    // American: special assistance, then ConciergeKey, First and Business
    // (three rows on American's table, called as one step here: one after
    // another, the who-list names all three in American's order), then
    // families with children under 2, then Groups 1 to 9 (Groups 1 to 4 the
    // elites and oneworld tiers, and Premium Economy where it flies, so no
    // cabin; 7 and 8 are one row on American's table; Groups 5 to 9 board
    // the Main Cabin).
    AA: {
      src: 'https://www.aa.com/web/i18n/travel-info/boarding-process.html',
      srcFr: 'https://www.aa.com/web/i18n/travel-info/boarding-process.html?locale=fr_CA',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoAA'), prio('', '', '', 'prioWhoAA'), fam('familyBoard', 'familyWhoAA'),
        prio('groupLabel', '1', '', 'prioWhoAA1'), prio('groupLabel', '2', '', 'prioWhoAA2'), prio('groupLabel', '3', '', 'prioWhoAA3'), prio('groupLabel', '4', '', 'prioWhoAA4'),
        gen('groupLabel', '5', 'cabinMainAA'), gen('groupLabel', '6', 'cabinMainAA'),
        { kind: 'gen', label: 'groupLabel', values: ['7', '8'], sub: 'cabinMainAA' },
        gen('groupLabel', '9', 'cabinMainAA')]
    },
    // Alaska, and Hawaiian since 2026-04-22: Preboarding, Priority Boarding
    // ("First Class", "Atmos Titanium"), Group A (Atmos Million Milers,
    // Platinum and Gold, families with children under 2, active military),
    // Group B (Atmos Silver, Premium Class seats), Group C (Atmos Rewards
    // Visa cardholders), then D (Main seats, back half), E (Main seats, front
    // half), F (Saver seats). Each named in its who-list, never as a cabin
    // line of its own.
    AS: {
      src: 'https://www.alaskaair.com/content/travel-info/flight-experience/our-boarding-process',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoAS'), prio('', '', '', 'prioWhoAS'),
        prio('groupLabel', 'A', '', 'prioWhoASa'), prio('groupLabel', 'B', '', 'prioWhoASb'), prio('groupLabel', 'C', '', 'prioWhoASc')]
        .concat(gens('groupLabel', ['D', 'E', 'F']))
    },
    // Southwest (assigned seats since 2026-01-27): Preboarding, Priority
    // Boarding (with active-duty military), A-List Preferred (its own row,
    // before Group 1), Groups 1 and 2, then Groups 3 to 8.
    WN: {
      src: 'https://support.southwest.com/helpcenter/article/boarding-process',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoWN'), prio('', '', '', 'prioWhoWN'), prio('', '', '', 'prioWhoWNalp'), prio('groupLabel', '1', '', 'prioWhoWN1'), prio('groupLabel', '2', '', 'prioWhoWN2')]
        .concat(gens('groupLabel', ['3', '4', '5', '6', '7', '8']))
    },
    // JetBlue: Pre-boarding, Groups 1 to 3, Courtesy Boarding (military, car
    // seats and strollers), then Groups 4 to 8.
    B6: {
      src: 'https://www.jetblue.com/help/boarding-procedures',
      srcFr: 'https://www.jetblue.com/fr/help/boarding-procedures',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoB6'), prio('groupLabel', '1', '', 'prioWhoB6g1'), prio('groupLabel', '2', '', 'prioWhoB6g2'), prio('groupLabel', '3', '', 'prioWhoB6g3'),
        fam('courtesyBoard', 'courtesyWhoB6')].concat(gens('groupLabel', ['4', '5', '6', '7', '8']))
    },
    // Frontier: Preboarding (with Elite Diamond), Group 1, Groups 2 to 7 (6
    // and 7 are one row on Frontier's page).
    F9: {
      src: 'https://faq.flyfrontier.com/help/frontier-boarding-process',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoF9'), prio('groupLabel', '1', '', 'prioWhoF9g1')]
        .concat(gens('groupLabel', ['2', '3', '4', '5']))
        .concat([{ kind: 'gen', label: 'groupLabel', values: ['6', '7'] }])
    },
    // Calm Air: "Pre-boarding is offered to passengers traveling with small
    // children, unaccompanied minors, persons with disabilities, or for those
    // requiring additional time or assistance while boarding" (check-in, en
    // and fr). No priority step.
    MO: {
      src: 'https://www.calmair.com/travel-info/check-in',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [pre('preboardWhoMO'), allPax()]
    },
    // Ryanair: "Ryanair does not pre-board passengers" (help centre,
    // assistance and Priority Boarding); its paid Priority Boarding queue
    // boards first, then everyone else. No pre-boarding step.
    FR: {
      src: 'https://help.ryanair.com/hc/en-gb/articles/48217528757265',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [prio(), allPax()]
    },
    // Norwegian: "Passengers with Priority Boarding (Boarding Group A) will
    // board first, followed by Boarding Group B passengers, and finally,
    // Boarding Group C passengers." No pre-boarding is published.
    DY: {
      src: 'https://www.norwegian.com/en/travel-info/check-in-and-boarding/priority-boarding/',
      checked: '2026-10-12', conf: 'high', prioAnyTime: false,
      stages: [prio('groupLabel', 'A'), gen('groupLabel', 'B'), gen('groupLabel', 'C')]
    },
    // Iberia: Group 0 boards first, then customers needing special assistance
    // and families with children under 2, then Group 1, Group 2 (where its
    // paid Priority Boarding sits), then the remaining groups in turn. Read
    // from the search index (iberia.com refuses automated readers); the
    // number of groups after 2 is not published there, so the rest are
    // called as general boarding, all passengers.
    IB: {
      src: 'https://www.iberia.com/ca/boarding/',
      checked: '2026-10-12', conf: 'low', prioAnyTime: false,
      stages: [prio('groupLabel', '0'), pre('preboardWhoIB'), prio('groupLabel', '1'), prio('groupLabel', '2'), allPax()]
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
    // general boarding. Air North (Advance Boarding is in no fare), Pascan,
    // Central Mountain Air on its own numbers.
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
    MO: 'MO', CAV: 'MO',
    FR: 'FR', RYR: 'FR',
    DY: 'DY', NOZ: 'DY',
    IB: 'IB', IBE: 'IB',
    '4N': 'noPrio', BQ: 'noPrio', P6: 'noPrio', '9M': 'noPrio'
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

  // A stage's cabin for this flight: a key, or the first [condition, key]
  // that holds (subWhen), or none.
  function subWhen(cond, ctx) {
    var c = ctx || {};
    if (cond === '*') return true;
    if (cond === 'wide') return c.cat === 'widebody';
    if (cond === 'narrow') return c.cat === 'narrowbody';
    if (cond === 'twoCabin') return !!c.twoCabin;
    if (cond === 'domcarib') return c.region === 'dom' || c.region === 'carib';
    if (cond === 'intl') return c.region === 'intl';
    return false;
  }
  function pickSub(spec, ctx) {
    if (!spec) return '';
    if (typeof spec === 'string') return spec;
    for (var i = 0; i < spec.length; i++) if (spec[i] && subWhen(spec[i][0], ctx)) return spec[i][1] || '';
    return '';
  }
  // What two or more stages share, or nothing: a merged call names a cabin or
  // a who-list only when every call in it has that same one.
  function common(list, k) {
    var v = list.length ? (list[0][k] || '') : '';
    for (var i = 1; i < list.length; i++) if ((list[i][k] || '') !== v) return '';
    return v;
  }
  // A value 'N+' (WestJet's Zone 3+) covers every number from N up: listed
  // with them, it stands for them.
  function coverPlus(values) {
    var v = (values || []).slice(), lo = Infinity;
    v.forEach(function (x) { var m = /^(\d+)\+$/.exec(String(x)); if (m) lo = Math.min(lo, parseInt(m[1], 10)); });
    if (lo === Infinity) return v;
    var out = [];
    v.forEach(function (x) {
      var s = String(x);
      if (/^\d+$/.test(s) && parseInt(s, 10) >= lo) return;
      var m = /^(\d+)\+$/.exec(s);
      if (m && parseInt(m[1], 10) > lo) return;
      if (out.indexOf(s) < 0) out.push(s);
    });
    // the plus value stands where its first covered number stood
    var plus = lo + '+', at = out.indexOf(plus);
    if (at > 0) {
      out.splice(at, 1);
      var k = 0;
      while (k < out.length && !(/^\d+$/.test(out[k]) && parseInt(out[k], 10) > lo)) k++;
      out.splice(k, 0, plus);
    }
    return out;
  }

  // The table expanded for one flight: variants applied, values as lists,
  // cabins resolved, each stage with its side (L for pre/prio/fam, R for gen)
  // and its atoms (what it calls, for the no-going-back memo).
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
      if (V.stageSub && s.values.length === 1 && Object.prototype.hasOwnProperty.call(V.stageSub, s.values[0])) s.sub = V.stageSub[s.values[0]];
      s.sub = pickSub(s.sub, ctx);
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
  //   S, when the last general step is called: L − C − 2, and never later
  //     than dep − 5: NEVER AT OR AFTER THE CLOSE THE SAME SCREEN PRINTS. A
  //     window that is short against the close (an Air Canada Express or
  //     Encore Dash 8: the sign opens 20 minutes out, the gate closes 15 out)
  //     plays its calls in the few minutes it has, merged; it never runs
  //     them past the close.
  //   Pre-boarding (first): 1.5 shares, 2 to 5 minutes.
  //   Every other step: one share, 1.5 to 5 minutes (with only two or three
  //     steps the 5-minute cap brings general boarding forward before S).
  //   The last step holds until Final call, Gate closed or departure.
  // A share under 1.5 minutes merges, in this order, without dropping a
  // number: neighbouring numbered general steps in pairs (Zones 3 • 4), then
  // neighbouring numbered priority steps (Zones 1 • 2; never across a family
  // call, which keeps its place), then the general steps into "All
  // passengers". Only when nothing is left to merge and the window is still
  // too short are the calls spread evenly to S, in order, never closer than a
  // minute (an Express Dash 8: a call a minute); a window shorter still (the
  // airport said Boarding a few minutes before the close) holds pre-boarding
  // to S and calls everything else there, together.
  function lastAt(L, C) {
    return Math.max(0, Math.min(L - C - 2, L - 5));
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
  function evenly(n, S) {
    var t = [0];
    for (var q = 1; q < n; q++) t.push(q * (S > 0 ? S : 0) / (n - 1));
    return t;
  }
  function mergeGen(st) {
    var out = [], did = false, i = 0;
    while (i < st.length) {
      var a = st[i], b = st[i + 1];
      if (a.kind === 'gen' && b && b.kind === 'gen' && a.values.length && b.values.length && !a.merged && !b.merged) {
        out.push({ kind: 'gen', label: a.label, values: coverPlus(a.values.concat(b.values)), sub: common([a, b], 'sub'), side: 'R', merged: true });
        i += 2; did = true;
      } else { out.push(a); i++; }
    }
    return did ? out : null;
  }
  // Neighbouring numbered priority calls, one run at a time: Zones 1 • 2, and
  // Delta's Zones 3 • 4 after its Early Access row, never Zones 1 to 4 ahead
  // of the families.
  function mergePrio(st) {
    var out = [], did = false, i = 0;
    var num = function (s) { return s && s.kind === 'prio' && s.values.length; };
    while (i < st.length) {
      if (num(st[i]) && num(st[i + 1]) && st[i + 1].label === st[i].label) {
        var run = [st[i]], j = i + 1;
        while (num(st[j]) && st[j].label === st[i].label) { run.push(st[j]); j++; }
        var vals = [];
        run.forEach(function (s) { vals = vals.concat(s.values); });
        // WHO A MERGED CALL IS FOR: every call in it names its own list
        // (Air Canada's Zone 1 and Zone 2 on a Moncton Dash 8, called
        // together), so the merged call names them all (whos, joined per
        // language by joinWho); a run where one call names nobody keeps
        // none, so a list never stands for a call it leaves out.
        var cw = common(run, 'who');
        var ws = (!cw && run.every(function (s) { return !!s.who; })) ? run.map(function (s) { return s.who; }) : [];
        out.push({ kind: 'prio', label: st[i].label, values: vals, sub: common(run, 'sub'), who: cw, whos: ws, side: 'L', merged: true });
        i = j; did = true;
      } else { out.push(st[i]); i++; }
    }
    return did ? out : null;
  }
  function collapseGen(st) {
    var gi = -1;
    for (var i = 0; i < st.length; i++) if (st[i].kind === 'gen') { gi = i; break; }
    if (gi < 0 || st.length - gi < 2) return null;
    var all = { kind: 'gen', title: 'allPax', values: [], sub: common(st.slice(gi), 'sub'), side: 'R', collapsed: [] };
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
    // Nothing left to merge and still too short: evenly to S, in order, a
    // minute apart at the least; closer than that, the first call (pre-
    // boarding) holds to S and every other call comes on together there
    // (the panels then show everything called), so the sign never changes
    // more often than once a minute.
    var at = r.t, even = false;
    if (r.rest < 1.5) {
      even = true;
      var n = st.length, u = n > 1 ? S / (n - 1) : 0;
      if (u >= 1) at = evenly(n, S);
      else { at = [0]; for (var q = 1; q < n; q++) at.push(S); }
    }
    // (two calls in a window shorter than pre-boarding's two minutes: the
    // first holds to S, the second comes there)
    for (var k = 1; k < at.length; k++) if (at[k] - at[k - 1] < (k === 1 && st[0].kind === 'pre' ? 2 : 1.5) - 1e-9) even = true;
    return { stages: st, at: at, S: S, even: even };
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

  // (an un-numbered call is known by its title, or by who it calls:
  // Southwest's Priority Boarding and A-List Preferred are two calls)
  function ids(s) {
    if (s.values && s.values.length) return s.values.map(function (v) { return 'v:' + v; });
    if (s.title) return ['t:' + s.title];
    if (s.who) return ['w:' + s.who];
    return ['k:' + s.kind];
  }
  function atomsOf(s) { return ids(s).concat(s.collapsed ? s.collapsed.map(function (v) { return 'v:' + v; }) : []); }

  // ── THE PLAN FOR ONE FLIGHT ──────────────────────────────────────────────
  // ctx: t0 and dep (ms), close (minutes, GATE_CLOSE_POLICY; 10 when the
  // airline publishes none or only a be-at-the-gate time), express, pdDash,
  // legalPre (a Canadian or U.S. airport), toUS (Transat), cabins (the gate's
  // [premium, economy] keys, for the generic plan), cat ('widebody',
  // 'narrowbody', 'regional', or '' when the type is not known), twoCabin (a
  // regional jet with a business cabin), region ('dom', 'carib', 'na' for
  // the rest of North America, 'intl', or '' when the destination is not
  // known), boardStage (the row's _boardStage).
  // The plan's cabins are each stage's own (stage.sub); p.cabins is only the
  // first priority and the first general one, for a quick look.
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
    // THE UNIT the airline counts in, for the switch to everyone (ALL ZONES,
    // ALL GROUPS, ALL ROWS) and the remain-seated line: the table's own, or
    // the word its general calls use, or any call's; none (All passengers)
    // for an airline that numbers nothing.
    var unit = T.unit || '';
    if (!unit) full.forEach(function (s) { if (s.kind === 'gen' && s.label) unit = s.label; });
    if (!unit) full.forEach(function (s) { if (!unit && s.label) unit = s.label; });
    full.forEach(function (s) {
      if (!premium && s.kind !== 'gen' && s.sub) premium = s.sub;
      if (!economy && s.kind === 'gen' && s.sub) economy = s.sub;
    });
    var out = {
      carrier: String(carrier || '').toUpperCase(), key: r.key, variant: r.variant,
      src: T.src, checked: T.checked, conf: T.conf, prioAnyTime: !!T.prioAnyTime, oneLane: !!T.oneLane,
      stages: stages, full: full, t0: t0, dep: dep, L: L, C: C, S: p.S, even: !!p.even, cabins: [premium, economy], unit: unit,
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

  // ── WHO A MERGED CALL IS FOR ─────────────────────────────────────────────
  // The who-lists of the calls a merged call holds, in ONE language, as one
  // list: each call's ' · ' items in order, an item two of them share (Air
  // Canada's "Travel companions on the same reservation", in both of its
  // zones) said once, where it stood last, so it closes the list as it
  // closes each zone's.
  function joinWho(texts) {
    var items = [];
    (texts || []).forEach(function (t) {
      String(t || '').split(' \u00B7 ').forEach(function (it) { if (it) items.push(it); });
    });
    return items.filter(function (it, i) { return items.indexOf(it, i + 1) < 0; }).join(' \u00B7 ');
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

  // The values a list of stages calls, in order (Zone 3 and Zone 3+ are
  // Zone 3+).
  function valuesOf(list) {
    var out = [];
    (list || []).forEach(function (s) { out = out.concat(s.values || []); });
    return coverPlus(out);
  }

  // ── THE SWITCH TO EVERYONE ───────────────────────────────────────────────
  // The last call of a sequence is the general call that takes everyone
  // still waiting (Air Canada's Zone 6, WestJet's 3+, Porter's front rows,
  // PAL's general boarding): from that moment the sign says so as GENERAL
  // BOARDING over ALL ZONES (ALL GROUPS, ALL ROWS, ALL PASSENGERS), not as
  // one more number. The airport's Final call keeps it.
  function isSwitch(p, st) {
    if (!p || !st || !st.cur || !p.stages || !p.stages.length) return false;
    return st.i === p.stages.length - 1 && st.cur.kind === 'gen';
  }
  // Who still waits after stage i: every value the later calls name (a
  // collapsed "All passengers" call names the ones it holds), in order.
  // NEVER THE NUMBER BEING CALLED: a value the live call names, or an open
  // band 'N+' that covers one of its numbers, is not waiting. WestJet calls
  // Zone 3, then "Zone 3+ — Remaining guests": under ZONE 3 the line read
  // « Zone 3+: please remain seated », which tells a Zone 3 passenger both to
  // go and to stay. With the band gone nothing numbered is left to name, and
  // the instruction line says the rest ("until your zone is called").
  function waitingAfter(p, i) {
    var stg = (p && p.stages) || [], out = [];
    stg.slice(i + 1).forEach(function (s) {
      out = out.concat(s.values || []).concat(s.collapsed || []);
    });
    var called = ((stg[i] && stg[i].values) || []).map(String);
    var nums = called.filter(function (x) { return /^\d+$/.test(x); }).map(function (x) { return parseInt(x, 10); });
    out = out.filter(function (x) {
      var s = String(x);
      if (called.indexOf(s) >= 0) return false;
      var m = /^(\d+)\+$/.exec(s);
      return !(m && nums.some(function (n) { return n >= parseInt(m[1], 10); }));
    });
    return coverPlus(out);
  }

  return {
    SEQ: SEQ, ALIAS: ALIAS, plan: plan, stageAt: stageAt, resolve: resolve, pace: pace, lastAt: lastAt,
    t0For: t0For, fmt: fmt, valuesOf: valuesOf, joinWho: joinWho, atomsOf: atomsOf, calledThrough: calledThrough,
    isSwitch: isSwitch, waitingAfter: waitingAfter,
    floorIndex: floorIndex, porterBands: porterBands, pickSub: pickSub, coverPlus: coverPlus
  };
});
