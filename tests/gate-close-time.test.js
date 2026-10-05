'use strict';

// WHY THIS EXISTS
//
// v23968. Three changes approved on 2026-10-04, each pinned here.
//
// (1) THE AIRLINE'S OWN GATE-CLOSE TIME. Before boarding starts, the gate's
//     Boarding card says how many minutes before departure the airline closes
//     its gate, and the clock time that makes, in the board's two languages:
//     "Gate closes 15 min before departure · 6:00pm | Fermeture de la porte
//     15 min avant le départ · 18:00". The minutes are the airline's
//     PUBLISHED number (GATE_CLOSE_POLICY, a URL and a date per row), counted
//     back from the departure the airport publishes, in the airline's own word
//     for its rule (gate closes, boarding closes, boarding ends, or only a
//     be-at-the-gate deadline). One not in the table shows nothing. Hidden
//     under any sign and under "Updated boarding time to follow". It is a
//     footer across the card that makes the card that much taller, so the
//     boarding time keeps the size of every other time on the rail (the
//     first draft put it inside the time's box and the time shrank from 54
//     to 15px at 1280x720). The ticker's airport-wide "30 minutes" and "15 minutes"
//     lines, wrong for WestJet, Porter and Flair, are gone. Every word is in
//     the gate's label table (_GATE_LBL), all nine languages.
// (2) "SCHEDULED" STAYS SCHEDULED. The adapters folded "On Time", "Expected",
//     "Scheduled" and a blank into one 'scheduled', and the board turned that
//     into "On time" by the clock — so a gate whose feed said only "Scheduled"
//     printed "On Time | À l'heure". The feed's word now travels through, to
//     the gate, the departures board and the Studio player alike, and a
//     feed's separate delay flag still upgrades any of the neutral words.
// (3) THE DEPARTURES BOARD'S "+1" can be seen: white, in an outlined pill
//     (pinned in gate-next-day.test.js beside its v23935 history).
//
// Everything below runs the shipped code: functions are lifted out of
// fids-core.js, feed-router.js and fids-v2.js by brace matching, and the
// worker is imported whole.

const test = require('node:test');
const BS = require('../fids-current/js/board-strings.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const ROUTER = fs.readFileSync(path.join(root, 'fids-current', 'js', 'feed-router.js'), 'utf8');
const V2 = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-v2.js'), 'utf8');
const workerPath = path.join(root, 'workers', 'fids-proxy.js');
const MIN = 60000;
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];

// From `start` to the brace that closes the first one opened after it.
// Strings and comments are skipped so a brace inside either cannot end it.
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
function fnIn(SRC, name) {
  const m = SRC.match(new RegExp('(^|\\n)(async )?function ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\('));
  assert.ok(m, name + ' must be declared');
  return braceFrom(SRC, m.index + (m[1] ? 1 : 0), name);
}
const fn = (name) => fnIn(CORE, name);
const block = (prefix) => braceFrom(CORE, CORE.indexOf(prefix), prefix) + ';';

// The gate-close engine: the table, the rule, the line, and what they read
// (the gate's label table and its pair picker, the per-language clock, the
// country table behind flightRegionKey).
let ENGINE_SRC = null;
function engine(langs) {
  const src = ENGINE_SRC || (ENGINE_SRC = [
    block('var GATE_CLOSE_POLICY = {'),
    block('var GATE_CLOSE_WORDS = {'),
    block('var _GATE_LBL = {'),
    block('const _IATA_CC_GROUPS = {'),
    'const _IATA_CC = ' + braceFrom(CORE, CORE.indexOf('(function () {', CORE.indexOf('const _IATA_CC = ')), '_IATA_CC') + ')();',
    CORE.match(/^const _CC_PARENT = [^;]+;/m)[0],
    CORE.match(/^const _US_Y_IATA = [^;]+;/m)[0],
    ...['_gateDelayHasTime', 'airportCountry', 'flightRegionKey', '_gateLbl', '_fidsClockForLang', '_gateCloseRouteOk', '_gateCloseInfo', '_gateCloseLineHtml'].map(fn),
    'return { GATE_CLOSE_POLICY, GATE_CLOSE_WORDS, _GATE_LBL, _gateCloseInfo, _gateCloseLineHtml };'
  ].join('\n'));
  const E = new Function('langs', 'window', 'BoardStrings', src)(langs || ['en', 'fr'], {}, BS);
  // the words: the frozen gate table, and the one store new words live in
  // (v23986: the deadline lines moved there; _gateLbl falls through to it)
  E._GATE_LBL = Object.assign({}, BS.STR, E._GATE_LBL);
  return E;
}
// 18:15 ADT on 2026-10-04 (21:15 UTC), Moncton.
const DEP = Date.parse('2026-10-04T21:15:00Z');
const TZ = 'America/Moncton';
const row = (o) => Object.assign({ flight: 'AC1987', airline: 'AC', status: 'ontime', _sortTs: DEP, _locIata: 'YYZ', time: '18:15' }, o || {});
const text = (html) => [...String(html).matchAll(/<span class="v2-fi-close-w"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1].replace(/\u00a0/g, ' '));

// ════════════════════════════════════════════════════════════════════════════
// (1) THE GATE-CLOSE TIME
// ════════════════════════════════════════════════════════════════════════════

test('(1) every airline\'s minutes are the ones it publishes, in its own word, each with its page and the date it was read', () => {
  const { GATE_CLOSE_POLICY: P, GATE_CLOSE_WORDS: Wd, _GATE_LBL: L } = engine();
  const want = {
    AC: [15, 'gateCloses', 'aircanada.com'], WS: [15, 'gateCloses', 'westjet.com'], PD: [10, 'gateCloses', 'flyporter.com'],
    F8: [20, 'boardingCloses', 'flyflair.com'], TS: [15, 'gateCloses', 'airtransat.com'], AA: [15, 'boardingEnds', 'aa.com'],
    PB: [20, 'gateBeAt', 'palairlines.ca'], DL: [15, 'gateBeAt', 'delta.com'], UA: [30, 'gateBeAt', 'united.com']
  };
  assert.deepEqual(Object.keys(P).sort(), Object.keys(want).sort(), 'no airline added or dropped without its page');
  for (const [code, [min, kind, host]] of Object.entries(want)) {
    const p = P[code];
    assert.equal(p.min, min, code);
    assert.equal(p.kind, kind, code);
    assert.ok(Wd[kind] && L[Wd[kind].card] && L[Wd[kind].ticker], code + ': its kind has its words in _GATE_LBL');
    const u = new URL(p.src);
    assert.equal(u.protocol, 'https:', code);
    assert.ok(u.hostname === host || u.hostname === 'www.' + host, code + ' is read on the airline\'s own site: ' + u.hostname);
    assert.match(p.checked, /^\d{4}-\d{2}-\d{2}$/, code + ' carries the date it was checked');
  }
  // Porter's 10 is its Conditions of Carriage ("Boarding Gate Closes 10 minutes").
  assert.match(P.PD.src, /Conditions-of-Carriage\.pdf$/);
  // Delta's 15 is its U.S. domestic rule only, United's 30 its international
  // one (Contract of Carriage); nothing else is route-limited.
  assert.equal(P.DL.route, 'usDomestic');
  assert.equal(P.UA.route, 'notUsDomestic');
  assert.match(P.UA.src, /contract-of-carriage\.html$/);
  for (const c of Object.keys(P)) if (c !== 'DL' && c !== 'UA') assert.ok(!P[c].route, c);
  // An airline with no published number is not in the table: no guessed number.
  for (const c of ['B6', 'AS', 'WN', 'NK', 'F9', 'P6', 'MO']) assert.equal(P[c], undefined, c);
});

test('(1) the close time is the airline\'s minutes before the airport\'s departure, and moves with a new time', () => {
  const E = engine();
  const now = DEP - 3 * 60 * MIN;
  assert.deepEqual(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM'), { carrier: 'AC', min: 15, kind: 'gateCloses', ts: DEP - 15 * MIN });
  assert.equal(E._gateCloseInfo(row({ airline: 'PD', flight: 'PD2382' }), 'PD', DEP, now, 'YQM').ts, DEP - 10 * MIN);
  assert.deepEqual(E._gateCloseInfo(row({ airline: 'F8', flight: 'F8671' }), 'F8', DEP, now, 'YQM'),
    { carrier: 'F8', min: 20, kind: 'boardingCloses', ts: DEP - 20 * MIN });
  assert.equal(E._gateCloseInfo(row({ airline: 'AA', flight: 'AA4120' }), 'AA', DEP, now, 'YQM').kind, 'boardingEnds');
  // PAL publishes a be-at-the-gate deadline, not a close.
  assert.deepEqual(E._gateCloseInfo(row({ airline: 'PB', flight: 'PB924' }), 'PB', DEP, now, 'YQM'),
    { carrier: 'PB', min: 20, kind: 'gateBeAt', ts: DEP - 20 * MIN });
  // The airport posts a new time: the base is the one the boarding time uses
  // (effDepForBoard), so the close moves with it.
  const later = DEP + 45 * MIN;
  assert.equal(E._gateCloseInfo(row({ status: 'delayed', upd: '19:00' }), 'AC', later, now, 'YQM').ts, later - 15 * MIN);
  // Keyed on the carrier the gate is branded for, not the operator.
  assert.equal(E._gateCloseInfo(row({ airline: 'QK' }), 'AC', DEP, now, 'YQM').carrier, 'AC');
});

test('(1) nothing is said when nothing can be: unknown airline, no time, a sign\'s word, Delayed with no new time, past the close', () => {
  const E = engine();
  const now = DEP - 3 * 60 * MIN;
  assert.equal(E._gateCloseInfo(row({ airline: 'B6' }), 'B6', DEP, now, 'YQM'), null, 'an airline not in the table');
  assert.equal(E._gateCloseInfo(row({ airline: 'XX' }), '', DEP, now, 'YQM'), null);
  assert.equal(E._gateCloseInfo(row(), 'AC', 0, now, 'YQM'), null, 'no departure time');
  for (const st of ['boarding', 'final', 'final-call', 'gateclosed', 'departed', 'cancelled', 'diverted', 'active', 'arrived']) {
    assert.equal(E._gateCloseInfo(row({ status: st }), 'AC', DEP, now, 'YQM'), null, st);
  }
  assert.equal(E._gateCloseInfo(row({ status: 'delayed' }), 'AC', DEP, now, 'YQM'), null, 'Delayed with no new time: its close is not known');
  for (const st of ['scheduled', 'ontime', 'expected', 'early', '']) {
    assert.ok(E._gateCloseInfo(row({ status: st }), 'AC', DEP, now, 'YQM'), st);
  }
  assert.equal(E._gateCloseInfo(row(), 'AC', DEP, DEP - 15 * MIN, 'YQM'), null, 'at the close time it is gone');
  assert.ok(E._gateCloseInfo(row(), 'AC', DEP, DEP - 16 * MIN, 'YQM'));
});

test('(1) the card never says the gate closes at or before the boarding time it prints (a short turn at the gate)', () => {
  const E = engine();
  const now = DEP - 3 * 60 * MIN;
  // The usual case: boarding well before the close, the line is shown.
  assert.ok(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM', DEP - 30 * MIN));
  assert.ok(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM', DEP - 16 * MIN), 'boarding a minute before the close');
  // No boarding time known: the boarding time cannot be contradicted.
  assert.ok(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM', 0));
  assert.ok(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM'));
  // The honesty floor holds boarding until the departure less 10 after a
  // short turn (a 25-minute one at Moncton): "Boarding 6:05pm" over "Gate
  // closes 6:00pm" is never printed.
  assert.equal(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM', DEP - 10 * MIN), null, 'boarding after the close');
  assert.equal(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM', DEP - 15 * MIN), null, 'boarding at the close');
  // Compared to the minute, as both are printed.
  assert.equal(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM', DEP - 15 * MIN + 30000), null, 'the same printed minute');
  assert.ok(E._gateCloseInfo(row(), 'AC', DEP, now, 'YQM', DEP - 15 * MIN - 30000), 'a printed minute earlier (5:59pm under a 6:00pm close)');
  // Porter's 10: boarding floored at the departure less 10 equals its close.
  const pd = row({ airline: 'PD', flight: 'PD2382' });
  assert.equal(E._gateCloseInfo(pd, 'PD', DEP, now, 'YQM', DEP - 10 * MIN), null);
  assert.ok(E._gateCloseInfo(pd, 'PD', DEP, now, 'YQM', DEP - 20 * MIN));
  // Flair's 20 with boarding at the departure less 15.
  assert.equal(E._gateCloseInfo(row({ airline: 'F8', flight: 'F8671' }), 'F8', DEP, now, 'YQM', DEP - 15 * MIN), null);
  // A be-at-the-gate deadline before boarding starts asks nothing impossible:
  // PAL's PB923 boards at the departure less 10 and its passengers are at the
  // gate by the departure less 20.
  assert.deepEqual(E._gateCloseInfo(row({ airline: 'PB', flight: 'PB923' }), 'PB', DEP, now, 'YQM', DEP - 10 * MIN),
    { carrier: 'PB', min: 20, kind: 'gateBeAt', ts: DEP - 20 * MIN });
});

test('(1) Delta\'s deadline is its U.S. domestic rule: shown at a U.S. airport on a U.S. route only', () => {
  const E = engine();
  const now = DEP - 3 * 60 * MIN;
  const dl = (to) => row({ airline: 'DL', flight: 'DL1234', _locIata: to });
  assert.deepEqual(E._gateCloseInfo(dl('ATL'), 'DL', DEP, now, 'MSP'), { carrier: 'DL', min: 15, kind: 'gateBeAt', ts: DEP - 15 * MIN });
  assert.equal(E._gateCloseInfo(dl('YYZ'), 'DL', DEP, now, 'MSP'), null, 'to Canada is international');
  assert.equal(E._gateCloseInfo(dl('MSP'), 'DL', DEP, now, 'YUL'), null, 'from Canada is international');
  assert.equal(E._gateCloseInfo(dl('ZZZ'), 'DL', DEP, now, 'MSP'), null, 'an unknown destination is never guessed into the rule');
});

test('(1) United\'s deadline is its international one: every flight to or from Canada, never a U.S. domestic gate', () => {
  const E = engine();
  const now = DEP - 3 * 60 * MIN;
  const ua = (to) => row({ airline: 'UA', flight: 'UA8045', _locIata: to });
  assert.deepEqual(E._gateCloseInfo(ua('EWR'), 'UA', DEP, now, 'YQM'), { carrier: 'UA', min: 30, kind: 'gateBeAt', ts: DEP - 30 * MIN }, 'Moncton to Newark');
  assert.ok(E._gateCloseInfo(ua('YUL'), 'UA', DEP, now, 'EWR'), 'Newark to Montréal');
  assert.ok(E._gateCloseInfo(ua('LHR'), 'UA', DEP, now, 'EWR'), 'Newark to London');
  assert.equal(E._gateCloseInfo(ua('ORD'), 'UA', DEP, now, 'EWR'), null, 'U.S. domestic: its 15 is not everybody\'s');
  assert.equal(E._gateCloseInfo(ua('ZZZ'), 'UA', DEP, now, 'EWR'), null, 'unknown destination');
});

test('(1) the line reads the airline\'s minutes and each language\'s own clock, in its own word, French first in Québec', () => {
  const E = engine(['en', 'fr']);
  const info = { carrier: 'AC', min: 15, kind: 'gateCloses', ts: Date.parse('2026-10-04T20:05:00Z') };
  const html = E._gateCloseLineHtml(info, TZ, false);
  assert.deepEqual(text(html), [
    'Gate closes 15 min before departure · 5:05pm',
    'Fermeture de la porte 15 min avant le départ · 17:05'
  ]);
  assert.match(html, /^<div class="v2-fi-closefoot"><div class="v2-fi-closeline" data-close-kind="gateCloses" data-close-min="15">/);
  assert.deepEqual(text(E._gateCloseLineHtml(info, TZ, true)), [
    'Fermeture de la porte 15 min avant le départ · 17:05',
    'Gate closes 15 min before departure · 5:05pm'
  ], 'French first in Québec');
  // Each airline's own word for its rule.
  const as = (kind, min) => text(E._gateCloseLineHtml(Object.assign({}, info, { kind, min }), TZ, false));
  assert.deepEqual(as('gateBeAt', 20), ['Be at the gate 20 min before departure · 5:05pm', 'Présentez-vous à la porte 20 min avant le départ · 17:05']);
  assert.equal(as('boardingCloses', 20)[0], 'Boarding closes 20 min before departure · 5:05pm', 'Flair: "Boarding closes"');
  assert.equal(as('boardingEnds', 15)[0], 'Boarding ends 15 min before departure · 5:05pm', 'American: "Boarding ends"');
  // Morning: no leading zero in English, two digits in the 24-hour languages.
  const am = Object.assign({}, info, { ts: Date.parse('2026-10-05T09:10:00Z') });   // 06:10 ADT
  assert.deepEqual(text(E._gateCloseLineHtml(am, TZ, false)).map((t) => t.split(' · ')[1]), ['6:10am', '06:10']);
  assert.equal(E._gateCloseLineHtml(null, TZ, false), '');
  // The clock is glued to its words, so a wrapped line never strands it.
  assert.match(html, /départ\u00a0·\u00a017:05</);
  assert.match(html, /15\u00a0min avant/, 'the minutes keep their unit');
  assert.equal(E._gateCloseLineHtml(Object.assign({}, info, { kind: 'close' }), TZ, false), '', 'an unknown kind says nothing');
});

test('(1) the line\'s words are in the gate\'s label table, all nine board languages, each its own words, with no placeholder left', () => {
  const info = { carrier: 'AC', min: 15, kind: 'gateCloses', ts: Date.parse('2026-10-04T20:05:00Z') };
  const E0 = engine();
  for (const w of Object.values(E0.GATE_CLOSE_WORDS)) {
    for (const key of [w.card, w.ticker]) {
      const o = E0._GATE_LBL[key];
      assert.ok(o, key + ' is in _GATE_LBL');
      assert.deepEqual(LANGS.filter((l) => !o[l]), [], key + ' in all nine');
      for (const lg of LANGS) {
        assert.ok(o[lg].includes('{MIN}'), key + ' ' + lg + ' says the minutes');
        if (key === w.card) assert.ok(o[lg].includes('{TIME}'), key + ' ' + lg + ' says the clock time');
        else assert.ok(o[lg].includes('{AIRLINE}'), key + ' ' + lg + ' names the airline');
        if (lg !== 'en') assert.notEqual(o[lg], o.en, key + ' ' + lg + ' is not English copied');
      }
    }
  }
  // German word order: the infinitive last.
  assert.equal(E0._GATE_LBL.gateBeAt.de, '{MIN} Min. vor Abflug am Gate sein · {TIME}');
  for (const lg of LANGS) {
    for (const kind of Object.keys(E0.GATE_CLOSE_WORDS)) {
      const E = engine([lg, lg === 'en' ? 'fr' : 'en']);
      const lines = text(E._gateCloseLineHtml(Object.assign({}, info, { kind }), TZ, false));
      assert.equal(lines.length, 2, lg + ' ' + kind);
      for (const t of lines) {
        assert.doesNotMatch(t, /\{MIN\}|\{TIME\}/, lg + ' ' + kind + ': ' + t);
        assert.match(t, /15/, lg + ' ' + kind + ' says the minutes');
        assert.match(t, /5:05pm|17:05/, lg + ' ' + kind + ' says the clock time');
      }
    }
  }
  // Each half carries its language; Arabic reads right to left.
  const ar = engine(['ar', 'en'])._gateCloseLineHtml(info, TZ, false);
  assert.match(ar, /<span class="v2-fi-close-w" lang="ar" dir="rtl"/);
  assert.match(ar, /<span class="v2-fi-close-w" lang="en">/);
});

test('(1) the gate shows it only in the idle layout: never under a sign or "Updated boarding time to follow"', () => {
  const uxg = fn('uxgGateHtml');
  // The printed boarding time goes in too: the close is never at or before it.
  assert.match(uxg, /if \(!showBoarding && !showCountdown && !isFinalCallStatus && !isGateClosedStatus && !inbDelayed && !_door\.word\) \{\s*try \{ _gateClose = _gateCloseInfo\(currentFlight, airlineCode, _bt\.effDepForBoard, Date\.now\(\), iata, _bt\.boardTs\); \}/);
  // ...and it is the very boarding time the card prints.
  assert.match(uxg, /var boardTs = _bt\.boardTs;\s*var bd = new Date\(boardTs\);/);
  assert.match(uxg, /gateClose: _gateClose\s*\}\);/);
});

test('(1) the line is a footer across the card that grows the card, so the boarding time keeps the rail\'s size', () => {
  // The rail's shelf takes it as its footer, below the icon and the text,
  // outside the value the box fitter sizes.
  assert.match(CORE, /function _shelf\(icon, en, second, val, valCls, rowCls, under, foot\) \{/);
  assert.match(CORE, /'<div class="v2-fi-value ' \+ \(valCls \|\| ''\) \+ '">' \+ val \+ \(under \|\| ''\) \+ '<\/div>'\s*\+ '<\/div>'[\s\S]{0,200}\+ \(foot \|\| ''\)/);
  assert.match(CORE, /_revRowCls\(_fiBrd\) \+ \(_gcl \? ' v2-fi-row-close' : ''\), _gateDayLineHtml\(vars && vars\.dayBoard\), _gcl\)/);
  const fit = fn('gateAutofit');
  const at = fit.indexOf(".v2-fi-row-close').forEach(function (row) {");
  const rail = fit.indexOf('// LEFT RAIL shelves.');
  assert.ok(at > 0 && at < rail, 'the footer is fitted before the rail\'s values');
  const seg = fit.slice(at, rail);
  // The one shared fitter, not a private one.
  assert.match(seg, /_boxAssign\(line, line\.clientWidth, capH, colRf\);/);
  assert.doesNotMatch(CORE, /function _fitGateCloseLines/);
  // Never cut: still too wide at the floor, it wraps at its words.
  assert.match(seg, /if \(line\.scrollWidth > line\.clientWidth \+ 0\.5\) \{\s*line\.classList\.add\('v2-fi-closeline-wrap'\);/);
  // The card grows by the footer's height, and the value's budget loses it.
  assert.match(seg, /row\.style\.setProperty\('flex-basis', fh \+ 'px', 'important'\)/);
  // And by its title's extra line over the rail's other times (Departure,
  // Arrival): at 1024x768 "Boarding | Embarquement" breaks onto two lines and
  // the time was fitted at 32px against the departure's 47 (42 before the
  // footer); with the difference added it is 47 against 46.
  assert.match(seg, /if \(r2 === row \|\| !r2\.querySelector\('\.v2-fi-value\.v2-fi-time'\)\) return;/);
  assert.match(seg, /if \(isFinite\(_tMin\) && _tSelf\.offsetHeight > _tMin\) fh \+= Math\.ceil\(_tSelf\.offsetHeight - _tMin\);\s*\}\s*if \(Math\.abs\(\(parseFloat\(row\.style\.flexBasis\) \|\| 0\) - fh\) > 0\.5\)/);
  assert.match(fit.slice(rail), /var _cf = row\.querySelector\(':scope > \.v2-fi-closefoot'\);\s*if \(_cf\) availH -= _cf\.offsetHeight;/);
});

test('(1) the close line is static and wears the plate\'s ink: no status colour, no animation', () => {
  const css = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
  const at = css.indexOf("v23968 — THE AIRLINE'S GATE-CLOSE LINE: A FOOTER ACROSS THE BOARDING CARD");
  assert.ok(at > 0);
  const seg = css.slice(at);
  assert.doesNotMatch(css, /\.v2-fi-value\.v2-fi-time \.v2-fi-closeline/, 'the line is not inside the time\'s box');
  assert.match(seg, /\.v2-fi-row\.v2-fi-row-close \{\s*grid-template-rows: minmax\(0, 1fr\) auto !important;/);
  assert.match(seg, /\.v2-fi-closefoot \{[^}]*grid-column: 1 \/ -1 !important;/);
  assert.match(seg, /\.v2-fi-close-w \{[^}]*color: var\(--plate-ink, #ffffff\) !important;/, 'white on dark plates, near-black on the bright ones');
  assert.match(seg, /\.v2-fi-closeline \{[^}]*flex-direction: column !important;/, 'one language per line');
  assert.match(seg, /\.v2-fi-closeline \{[^}]*white-space: nowrap !important;/, 'each language one unbreakable unit');
  assert.doesNotMatch(seg, /animation|transition|#fbbf24|#f59e0b|#d82f2e|#22c55e|#16a34a/i);
  assert.match(seg, /font-family: 'Bricolage Grotesque Cond'[^;]*var\(--fids-script-fonts/, 'the board\'s fitting face, then the script faces');
  // Sixteen guards: this file's floor for a rule after the boarding sign's block.
  for (const sel of seg.match(/^html body[^{]+\{/gm)) assert.ok((sel.match(/:not\(#_\)/g) || []).length >= 16, sel.slice(0, 60));
});

test('(1) the ticker states no airport-wide number; a one-airline board says that airline\'s own', () => {
  const src = [
    block('var GATE_CLOSE_POLICY = {'), block('var GATE_CLOSE_WORDS = {'), block('var _GATE_LBL = {'),
    block('const _IATA_CC_GROUPS = {'),
    'const _IATA_CC = ' + braceFrom(CORE, CORE.indexOf('(function () {', CORE.indexOf('const _IATA_CC = ')), '_IATA_CC') + ')();',
    CORE.match(/^const _CC_PARENT = [^;]+;/m)[0],
    CORE.match(/^const _US_Y_IATA = [^;]+;/m)[0],
    fn('airportCountry'),
    fn('_tickerCloseLine'),
    CORE.match(/^const TICKER_DEADLINE_LINE = \d+;/m)[0],
    fn('_tickerHtml'),
    fn('updateTicker'),
    // the ticker's lines live in the store (BoardStrings.LISTS.ticker)
    'return { _tickerCloseLine, updateTicker, TICKER_MSG: BoardStrings.LISTS.ticker, set: function (a) { filterAirline = a; } };'
  ].join('\n');
  // updateTicker writes markup (each line marked with its language): read its text
  const span = { _h: '', set innerHTML(v) { this._h = v; }, get textContent() { return this._h.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&'); } };
  let apNow = 'YQM';
  const doc = { querySelector: () => span, getElementById: () => ({ value: apNow }) };
  const mk = (langs) => new Function('langs', 'document', 'AIRLINE_NAME', 'window', 'BoardStrings', 'var filterAirline = "";\n' + src)(
    langs, doc, { AC: 'Air Canada', WS: 'WestJet', PD: 'Porter', PB: 'PAL Airlines', DL: 'Delta Air Lines', F8: 'Flair Airlines', AA: 'American Airlines', UA: 'United Airlines' }, {}, BS);
  const T = mk(['en', 'fr']);
  // All nine languages, the same lines in each, and no number of minutes in any.
  assert.deepEqual(LANGS.filter((l) => !Array.isArray(T.TICKER_MSG[l])), [], 'the ticker in all nine');
  for (const lg of LANGS) {
    const list = T.TICKER_MSG[lg];
    assert.equal(list.length, T.TICKER_MSG.en.length, lg);
    for (const m of list) assert.doesNotMatch(m, /\d/, lg + ': no number of minutes, for any airline: ' + m);
    if (lg !== 'en') assert.notEqual(list[2], T.TICKER_MSG.en[2], lg + ': its own words');
  }
  T.updateTicker();
  assert.match(span.textContent, /CHECK YOUR AIRLINE’S BOARDING GATE DEADLINE  ·  VÉRIFIEZ L’HEURE LIMITE À LA PORTE D’EMBARQUEMENT DE VOTRE TRANSPORTEUR/);
  assert.doesNotMatch(span.textContent, /MINUTES/);
  T.set('WS'); T.updateTicker();
  assert.match(span.textContent, /WESTJET: BOARDING GATE CLOSES 15 MINUTES BEFORE DEPARTURE  ·  WESTJET : FERMETURE DE LA PORTE D’EMBARQUEMENT 15 MINUTES AVANT LE DÉPART/);
  T.set('PD'); assert.equal(T._tickerCloseLine('en'), 'PORTER: BOARDING GATE CLOSES 10 MINUTES BEFORE DEPARTURE');
  T.set('PB'); assert.equal(T._tickerCloseLine('fr'), 'PAL AIRLINES : PRÉSENTEZ-VOUS À LA PORTE D’EMBARQUEMENT 20 MINUTES AVANT LE DÉPART');
  T.set('F8'); assert.equal(T._tickerCloseLine('en'), 'FLAIR AIRLINES: BOARDING CLOSES 20 MINUTES BEFORE DEPARTURE');
  T.set('AA'); assert.equal(T._tickerCloseLine('en'), 'AMERICAN AIRLINES: BOARDING ENDS 15 MINUTES BEFORE DEPARTURE');
  T.set('DL'); assert.equal(T._tickerCloseLine('en'), '', 'a route-limited rule is not one board-wide line');
  T.set('UA'); assert.equal(T._tickerCloseLine('en'), 'UNITED AIRLINES: BE AT THE BOARDING GATE 30 MINUTES BEFORE DEPARTURE', 'every United flight from Moncton is international');
  apNow = 'EWR'; assert.equal(T._tickerCloseLine('en'), '', 'at Newark its international rule is not every flight\'s');
  apNow = 'MSP'; T.set('DL'); assert.equal(T._tickerCloseLine('en'), '', 'nor Delta\'s domestic one');
  apNow = 'YQM';
  T.set('B6'); assert.equal(T._tickerCloseLine('en'), '');
  T.set('AC,WS'); assert.equal(T._tickerCloseLine('en'), '', 'more than one airline: the neutral line');
  // A one-airline board in Spanish and Japanese says it in those languages.
  const TS = mk(['es', 'ja']); TS.set('AC'); TS.updateTicker();
  assert.match(span.textContent, /AIR CANADA: LA PUERTA DE EMBARQUE CIERRA 15 MINUTOS ANTES DE LA SALIDA  ·  AIR CANADA：搭乗口は出発15分前に締め切ります/);
  // No page paints an airport-wide number before the script runs: the
  // ticker's markup starts empty and is filled from the store in the board's
  // own languages (v23986).
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(root, 'fids-current', page), 'utf8');
    assert.doesNotMatch(html, /\d+ MINUTES BEFORE DEPARTURE|\d+ MINUTES PRIOR TO DEPARTURE|\d+ MINUTES AVANT LE DÉPART/, page);
    assert.match(html, /<div class="ticker"><span><\/span><\/div>/, page + ' paints no ticker words of its own');
  }
  assert.equal(BS.LISTS.ticker.en[2], 'CHECK YOUR AIRLINE’S BOARDING GATE DEADLINE');
  assert.equal(BS.LISTS.ticker.fr[2], 'VÉRIFIEZ L’HEURE LIMITE À LA PORTE D’EMBARQUEMENT DE VOTRE TRANSPORTEUR');
});

// ════════════════════════════════════════════════════════════════════════════
// (2) "SCHEDULED" STAYS SCHEDULED
// ════════════════════════════════════════════════════════════════════════════

test('(2) the adapters keep the feed\'s own neutral word', async () => {
  const router = new Function(['const MIA_DELAY_MIN = 15;', fnIn(ROUTER, 'fidsNeutralWord'), fnIn(ROUTER, 'yqmStatus'), fnIn(ROUTER, 'yyzStatus'),
    fnIn(ROUTER, 'yulStatus'), fnIn(ROUTER, 'panynjStatus'), fnIn(ROUTER, 'miaStatus'),
    'return { fidsNeutralWord, yqmStatus, yyzStatus, yulStatus, panynjStatus, miaStatus };'].join('\n'))();
  // Moncton's own vocabulary: "OnTime", "Expected", "Scheduled", nothing.
  assert.equal(router.yqmStatus('OnTime'), 'ontime');
  assert.equal(router.yqmStatus('On Time'), 'ontime');
  assert.equal(router.yqmStatus('Expected'), 'expected');
  assert.equal(router.yqmStatus('Scheduled'), 'scheduled');
  assert.equal(router.yqmStatus(''), 'scheduled');
  assert.equal(router.yqmStatus(null), 'scheduled');
  assert.equal(router.yqmStatus('Delayed until 5:00 PM'), 'delayed', 'the other words are untouched');
  // Moncton's bare "Closed" is its gate closing, not a neutral word.
  assert.equal(router.yqmStatus('Closed'), 'gateclosed');
  assert.equal(router.yqmStatus('Gate Closed'), 'gateclosed');
  assert.equal(router.yqmStatus('Pre-Boarding'), 'boarding');
  assert.equal(router.yyzStatus('ONT'), 'ontime');
  assert.equal(router.yyzStatus('SKD'), 'scheduled');
  assert.equal(router.yulStatus('On time'), 'ontime');
  assert.equal(router.panynjStatus('Scheduled', true), 'scheduled');
  assert.equal(router.miaStatus('On Time', 0), 'ontime');
  // The worker's adapters, by the same rule.
  const W = await import(workerPath);
  const WSRC = fs.readFileSync(workerPath, 'utf8');
  const yhzStatus = new Function(fnIn(WSRC, 'neutralStatus') + '\n' + fnIn(WSRC, 'yhzStatus') + '\nreturn yhzStatus;')();
  assert.equal(yhzStatus('ON TIME'), 'ontime');
  assert.equal(yhzStatus('Expected 10:20'), 'expected');
  assert.equal(yhzStatus('Scheduled'), 'scheduled');
  assert.equal(yhzStatus(''), 'scheduled');
  assert.equal(yhzStatus('Early'), 'scheduled', 'Early is decided by the revision, as before');
  assert.ok(W, 'the worker still imports');
});

test('(2) a feed\'s own delay flag still upgrades every neutral word, not only Scheduled', async () => {
  const W = await import(workerPath);
  const fx = (n) => JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', n), 'utf8'));
  // Dublin: statusMessage + isDelayed.
  const dub = fx('dub-sample.json').arr.slice(0, 1).map((r) => Object.assign({}, r, { statusMessage: 'On Time', isDelayed: true }));
  assert.equal(W.dubParseRows(dub, 'arr')[0].status, 'delayed', 'DUB: "On Time" beside isDelayed');
  const dubE = fx('dub-sample.json').arr.slice(0, 1).map((r) => Object.assign({}, r, { statusMessage: 'Expected 04:00', isDelayed: true }));
  assert.equal(W.dubParseRows(dubE, 'arr')[0].status, 'delayed', 'DUB: "Expected" beside isDelayed');
  const dubOk = fx('dub-sample.json').arr.slice(0, 1).map((r) => Object.assign({}, r, { statusMessage: 'On Time', isDelayed: false }));
  assert.equal(W.dubParseRows(dubOk, 'arr')[0].status, 'ontime');
  // O'Hare: Remarks read under any neutral Status.
  const ord = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'ord-sample.json'), 'utf8')).slice(0, 1);
  const ordWith = (Status, Remarks) => W.ordParseFeed(JSON.stringify(ord.map((r) => Object.assign({}, r, { Status, Remarks }))), 'arr', Date.now())[0].status;
  assert.equal(ordWith('On Time', 'Delayed'), 'delayed', 'ORD: "Delayed" in Remarks beats an "On Time" Status');
  assert.equal(ordWith('Scheduled', 'Cancelled'), 'cancelled');
  assert.equal(ordWith('Scheduled', 'ON TIME'), 'ontime', 'a neutral Remarks word replaces a plain Scheduled');
  assert.equal(ordWith('On Time', 'Scheduled'), 'ontime', '…but never an On Time');
  // The worker's helper names the three neutral words.
  const WSRC = fs.readFileSync(workerPath, 'utf8');
  const isN = new Function(fnIn(WSRC, 'isNeutralStatus') + '\nreturn isNeutralStatus;')();
  assert.deepEqual(['scheduled', 'ontime', 'expected', 'delayed', 'boarding'].map(isN), [true, true, true, false, false]);
  assert.doesNotMatch(WSRC, /status === "scheduled" && (r\.isDelayed|String\(r\.Delayed\))/, 'no delay flag tested against Scheduled alone');
});

test('(2) the board never turns Scheduled into On time, at any moment; On time and Expected stay themselves', () => {
  const src = [fn('adbTs'), fn('_adbNearestDayTs'), fn('adbStatus'), 'return adbStatus;'].join('\n');
  const adbStatus = new Function(src)();
  const sched = Date.parse('2026-10-04T21:15:00Z');
  const leg = { scheduledTime: { utc: '2026-10-04 21:15+00:00' } };
  for (let t = sched - 6 * 60 * MIN; t <= sched + 60 * MIN; t += 5 * MIN) {
    for (const mode of ['dep', 'arr']) {
      const f = (st) => (mode === 'dep' ? { status: st, departure: leg, arrival: {} } : { status: st, arrival: leg, departure: {} });
      assert.equal(adbStatus(f('scheduled'), mode, sched, t), 'scheduled', mode + ' scheduled at ' + (t - sched) / MIN);
      assert.equal(adbStatus(f(''), mode, sched, t), 'scheduled', mode + ' blank at ' + (t - sched) / MIN);
      assert.equal(adbStatus(f('Unknown'), mode, sched, t), 'scheduled');
      assert.equal(adbStatus(f('ontime'), mode, sched, t), 'ontime');
      assert.equal(adbStatus(f('expected'), mode, sched, t), 'expected');
    }
  }
  // A revision still decides Delayed and Early, whatever the neutral word.
  const rev = (st, iso) => ({ status: st, departure: { scheduledTime: { utc: '2026-10-04 21:15+00:00' }, revisedTime: { utc: iso } }, arrival: {} });
  assert.equal(adbStatus(rev('ontime', '2026-10-04 22:00+00:00'), 'dep', sched, sched - 60 * MIN), 'delayed');
  assert.equal(adbStatus(rev('scheduled', '2026-10-04 20:50+00:00'), 'dep', sched, sched - 60 * MIN), 'early');
});

test('(2) the gate and the departures board print the same word: Scheduled | Prévu, never On time', () => {
  const st = new Function(fn('_gateDepDisplayState') + '\nreturn _gateDepDisplayState;')();
  assert.equal(st({ status: 'scheduled', _sortTs: 1 }).stKey, 'scheduled');
  assert.equal(st({}).stKey, 'scheduled');
  assert.equal(st({ status: 'ontime', _sortTs: 1 }).stKey, 'ontime');
  assert.equal(st({ status: 'expected', _sortTs: 1 }).stKey, 'expected');
  const uxg = fn('uxgGateHtml');
  assert.match(uxg, /if \(!stKey\) stKey = 'scheduled';/);
  assert.doesNotMatch(uxg, /stKey === 'scheduled' \|\| !stKey\) stKey = 'ontime'/);
  // The rail's Status card no longer converts it either.
  assert.match(CORE, /else if \(_stk === ''\) _stk = 'scheduled';/);
  assert.doesNotMatch(CORE, /else if \(_stk === 'scheduled' \|\| _stk === ''\) _stk = 'ontime';/);
  // The gate's words: SS, and Expected in the one store (stExpected: SS is
  // frozen; SL() and the gate's status word fall through to it), in all
  // nine languages.
  const SS = new Function(block('const SS = {') + '\nreturn SS;')();
  const EXP = BS.entry('stExpected');
  assert.deepEqual(LANGS.filter((l) => !(EXP || {})[l]), [], 'Expected in all nine');
  assert.equal(EXP.en, 'Expected', 'the status, not a lowercase qualifier');
  assert.equal(EXP.fr, 'Attendu');
  for (const lg of LANGS) if (lg !== 'en') assert.notEqual(EXP[lg], EXP.en, lg);
  assert.match(CORE, /function _ssEntry\(k\) \{\s*if \(SS\[k\]\) return SS\[k\];[\s\S]{0,120}BoardStrings\.entry\('st' \+ c\.charAt\(0\)\.toUpperCase\(\) \+ c\.slice\(1\)\)/, 'SL() finds a status the frozen SS lacks in the store');
  const gate = (k) => (k === 'expected' ? EXP : SS[k]);
  // The board: fids-v2's word for each, in all nine languages, the same as the gate's.
  const win = {};
  vm.runInNewContext(V2, { window: Object.assign(win, { BoardStrings: BS }), BoardStrings: BS, document: { addEventListener() {}, querySelectorAll: () => [] }, console });
  const fmt = (s, lang) => win.fidsFormatStatus({ status: s }, lang);
  for (const lg of LANGS) {
    assert.equal(fmt('scheduled', lg).html, SS.scheduled[lg], 'Scheduled reads the same on the board and the gate in ' + lg);
    assert.equal(fmt('expected', lg).html, gate('expected')[lg], 'Expected reads the same on the board and the gate in ' + lg);
    assert.equal(fmt('ontime', lg).html, SS.ontime[lg], 'On time reads the same in ' + lg);
  }
  assert.equal(fmt('expected', 'en').cssClass, 'fids-status-scheduled', 'plain ink, no status colour');
  assert.equal(win.fidsNormStatus('expected'), 'expected', 'Expected is not a departure');
});

test('(2) the Studio player prints the airport\'s word too: On time only for On Time', () => {
  const D = require('../fids-current/js/studio-data.js');
  assert.equal(D.readableStatus('ontime'), 'On time', 'the feed\'s own On Time (it printed the raw code)');
  assert.equal(D.readableStatus('OnTime'), 'On time');
  assert.equal(D.readableStatus('scheduled'), 'Scheduled');
  assert.equal(D.readableStatus('expected'), 'Expected');
  assert.equal(D.readableStatus(''), 'Scheduled');
  const R = fs.readFileSync(path.join(root, 'fids-current', 'js', 'studio-render.js'), 'utf8');
  assert.match(R, /if \(status === 'Scheduled' \|\| status === 'Expected'\) return 'status-plain';/, 'no on-time green on a neutral word');
});

test('(2) the boarding sign draws an "On time" flank only where the airport said On Time', () => {
  const k = new Function('window', fn('_boardStripStatusKey') + '\nreturn _boardStripStatusKey;')({
    fidsNormStatus: (s) => {
      const t = String(s || '').toLowerCase();
      if (t === 'ontime') return 'on-time';
      if (t === 'final') return 'final-call';
      return t || 'scheduled';
    }
  });
  assert.equal(k({ status: 'scheduled', time: '20:48' }, 'boarding', 12), '');
  assert.equal(k({ status: 'expected', time: '20:48' }, 'boarding', 12), '');
  assert.equal(k({ status: 'ontime', time: '20:48' }, 'boarding', 12), 'ontime');
  // Straight from Scheduled to Boarding (MWAA, RDU, SLC): nobody said On time.
  assert.equal(k({ status: 'boarding', time: '20:48' }, 'boarding', 12), '');
  assert.equal(k({ status: 'final', time: '20:48' }, 'boarding', 3), '');
  // A revised time and the airport's own bad news keep their flanks.
  assert.equal(k({ status: 'scheduled', time: '20:48', upd: '21:30' }, 'boarding', 12), 'delayed');
  assert.equal(k({ status: 'boarding', time: '20:48', upd: '21:30' }, 'boarding', 12), 'delayed');
  assert.equal(k({ status: 'boarding', time: '20:48', upd: '20:30' }, 'boarding', 12), 'early');
  assert.equal(k({ status: 'cancelled', time: '20:48' }, 'boarding', 12), 'cancelled');
});
