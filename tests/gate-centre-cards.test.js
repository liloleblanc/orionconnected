'use strict';

// WHY THIS EXISTS
//
// v24012. Three information cards in the gate's centre deck (#gateAdCarousel),
// approved as look C, "wayfinding signage" (BLEND-2 by day, NIGHT at night):
//   ovcard     GATE OVERVIEW: Your aircraft, Boarding, Gate closes, Departure,
//              Arrival, on one timeline;
//   docscard   BEFORE YOU BOARD: this flight's documents (the boarding band's
//              own _gateDocsVariant and docs* lines);
//   closecard  GATE CLOSES: one huge time and the airline's rule, in the last
//              45 minutes before the close, for an airline that publishes one.
// Each holds a minute and rotates with the ads, the map and the weather,
// before boarding only. They replace the small gate-close line under the
// Boarding time (its removal is pinned in gate-close-time.test.js).
//
// Pinned here: the cards only before boarding, the gate-closes window, the
// documents from _gateDocsVariant, status words only on evidence and no
// invented times, the words in all nine languages, the emblems, and the
// day/night classes the look switches on.
//
// Everything below runs the shipped code: the functions are lifted out of
// fids-core.js by brace matching.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BS = require('../fids-current/js/board-strings.js');
const GD = require('../fids-current/js/gate-date-context.js');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const SUN = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-sun.js'), 'utf8');
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
const MIN = 60000;

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
function fn(name) {
  const m = CORE.match(new RegExp('(^|\\n)function ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\('));
  assert.ok(m, name + ' must be declared at the top level');
  return braceFrom(CORE, m.index + (m[1] ? 1 : 0), name);
}
const block = (prefix) => braceFrom(CORE, CORE.indexOf(prefix), prefix) + ';';
const line = (re) => { const m = CORE.match(re); assert.ok(m, String(re)); return m[0]; };
function iife(prefix) {
  const a = CORE.indexOf(prefix);
  assert.ok(a >= 0, prefix + ' must exist');
  const b = CORE.indexOf('\n})();', a);
  assert.ok(b > a, prefix + ' must end');
  return CORE.slice(a, b + 6);
}

let SRC = null;
function engine(langs) {
  const src = SRC || (SRC = [
    block('var GATE_CLOSE_POLICY = {'),
    block('var GATE_CLOSE_WORDS = {'),
    block('var _GATE_CLOSE_ALIAS = {'),
    block('var _GATE_LBL = {'),
    block('const _IATA_CC_GROUPS = {'),
    'const _IATA_CC = ' + braceFrom(CORE, CORE.indexOf('(function () {', CORE.indexOf('const _IATA_CC = ')), '_IATA_CC') + ')();',
    line(/^const _CC_PARENT = [^;]+;/m),
    line(/^const _US_Y_IATA = [^;]+;/m),
    line(/^var _GATE_PRECLEARANCE = \[[^\]]*\];/m),
    block('var _GATE_DOCS = {'),
    iife('var _GATE_BAND_GLYPH = (function () {'),
    block('const SS = {'),
    block('var RC2_STATUS = {'),
    line(/^var _GATE_CARD_TYPES = [^;]+;/m),
    line(/^var _GATE_CARD_DWELL_MS = [^;]+;/m),
    line(/^var _GATE_CARD_CLOSE_WINDOW_MS = [^;]+;/m),
    line(/^var GATE_SB_PRETEND_EVERYWHERE = [^;]+;/m),
    block('var _GATE_SB_LEAD_MIN = {'),
    line(/^var _GATE_SB_COUNTDOWN_MS = [^;]+;/m),
    block('var GATE_SB_CABINS = {'),
    block('var GATE_SB_NAME_FMT = {'),
    line(/^var _GATE_SB_SUR = \[[^\]]*\];/m),
    block('var _GATE_SB_SEATS = {'),
    block('var _GATE_CARD_TINT = {'),
    block('var _GATE_CARD_ALIAS = {'),
    block('var _GATE_CARD_EMBLEM = {'),
    line(/^var _GC_SEP = [^\n]+;/m),
    block('var _GC_STATUS = {'),
    ...['_gateDelayHasTime', 'airportCountry', '_gateLbl', '_fidsClockForLang', '_gateCloseRouteOk', '_gateCloseCarrier', '_gateCloseInfo',
      '_gateDocsVariant', '_ssEntry', 'SLpair', '_rc2Rgb', '_rc2Lin', '_rc2Contrast', '_rc2DeltaE', '_rc2StatusLike',
      '_gateDayWords', 'flightRegionKey', '_gateSbPretendOn', '_gateSbRand', '_gateSbSeed', '_gateSbLists', '_gateCardsBuild', '_gateCardsDue', '_gateCardTint', '_gateCardEmblem', '_gcPair', '_gcStatusPair', '_gcDayPair',
      '_gcTime', '_gcCloseLabel', '_gcRow', '_gateCardHtml'].map(fn),
    'return { GATE_CLOSE_WORDS, _GATE_DOCS, _GATE_CARD_TYPES, _GATE_CARD_DWELL_MS, _GATE_CARD_CLOSE_WINDOW_MS, _gateCloseInfo, _gateDocsVariant,'
      + ' _gateCardsBuild, _gateCardsDue, _gateCardTint, _gateCardEmblem, _gcCloseLabel, _gateCardHtml, _gateSbLists, GATE_SB_CABINS };'
  ].join('\n'));
  const win = { FIDSGateDate: GD, _gateOrbParts: () => null };
  // (fidsEscHtml is the board's own escape; its regex literals hold quotes the
  // brace matcher cannot read, so it is given here, the same five characters)
  const esc = (v) => String(v == null ? '' : v).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;').split("'").join('&#39;');
  return new Function('langs', 'window', 'BoardStrings', 'getAirlineAccent', 'fidsEscHtml', src)(langs || ['en', 'fr'], win, BS, () => '#3466A8', esc);
}

// 18:15 ADT on 2026-10-04 (21:15 UTC), Moncton.
const DEP = Date.parse('2026-10-04T21:15:00Z');
const TZ = 'America/Moncton';
const row = (o) => Object.assign({ flight: 'AC1987', airline: 'AC', status: 'scheduled', _sortTs: DEP, _locIata: 'YYZ', time: '18:15' }, o || {});
const facts = (o) => Object.assign({
  cf: row(), idle: true, stKey: 'scheduled', inbLate: false, depTs: DEP, boardTs: DEP - 35 * MIN,
  close: { carrier: 'AC', min: 15, kind: 'gateCloses', ts: DEP - 15 * MIN },
  arr: { ts: DEP + 107 * MIN, tz: 'America/Toronto', revised: false, early: false },
  iata: 'YQM', airline: 'AC', tz: TZ, frF: false, city: 'Toronto', code: 'YYZ', flight: 'AC1987'
}, o || {});
const textOf = (html) => String(html).replace(/<\/?small>/g, '').replace(/<[^>]*>/g, ' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
/** One timeline row's markup, by its data-row. */
function rowOf(html, kind) {
  const a = html.indexOf('<div class="gc-row" data-row="' + kind + '">');
  if (a < 0) return '';
  const b = html.indexOf('<div class="gc-row" data-row="', a + 10);
  return html.slice(a, b < 0 ? html.length : b);
}

// ════════════════════════════════════════════════════════════════════════════
// BEFORE BOARDING ONLY
// ════════════════════════════════════════════════════════════════════════════

test('the cards have facts only in the idle layout, for a departure still to go', () => {
  const E = engine();
  const m = E._gateCardsBuild(facts());
  assert.ok(m, 'a scheduled departure, no sign up');
  assert.equal(m.docs, 'D');
  assert.equal(E._gateCardsBuild(facts({ idle: false })), null, 'under a sign, the countdown or a door word: nothing');
  for (const st of ['boarding', 'final', 'finalcall', 'final-call', 'gateclosed', 'gate_closed', 'departed', 'cancelled', 'canceled', 'diverted', 'active', 'enroute', 'landed', 'arrived']) {
    assert.equal(E._gateCardsBuild(facts({ stKey: st, cf: row({ status: st }) })), null, st);
  }
  for (const st of ['scheduled', 'ontime', 'expected', 'early']) assert.ok(E._gateCardsBuild(facts({ stKey: st })), st);
  assert.equal(E._gateCardsBuild(null), null);
  assert.equal(E._gateCardsBuild(facts({ cf: null })), null);
});

test('which cards are due: the overview and the documents before boarding, nothing once the departure has passed', () => {
  const E = engine();
  const due = (o, now) => E._gateCardsDue(E._gateCardsBuild(facts(o)), now);
  assert.deepEqual(due({}, DEP - 3 * 60 * MIN), { ovcard: true, docscard: true, closecard: false, sbcard: false });
  assert.deepEqual(E._gateCardsDue(null, DEP - 3 * 60 * MIN), { ovcard: false, docscard: false, closecard: false, sbcard: false });
  assert.deepEqual(due({}, DEP + MIN), { ovcard: false, docscard: false, closecard: false, sbcard: false }, 'past its departure');
  // "Updated boarding time to follow": the gate's times are not firm, so no
  // timeline and no close time; the documents still hold
  assert.deepEqual(due({ inbLate: true }, DEP - 30 * MIN), { ovcard: false, docscard: true, closecard: false, sbcard: false });
  // Delayed with no new time: the same; with the airport's new time, the timeline
  assert.deepEqual(due({ stKey: 'delayed', cf: row({ status: 'delayed' }) }, DEP - 3 * 60 * MIN), { ovcard: false, docscard: true, closecard: false, sbcard: false });
  assert.equal(due({ stKey: 'delayed', cf: row({ status: 'delayed', upd: '19:00', _revTs: DEP + 45 * MIN }), depTs: DEP + 45 * MIN }, DEP - 3 * 60 * MIN).ovcard, true);
  // no boarding time printed: no timeline
  assert.equal(due({ boardTs: 0 }, DEP - 3 * 60 * MIN).ovcard, false);
});

test('the gate publishes the facts from its own paint, null under any sign, and the deck carries only cards that are due', () => {
  const uxg = fn('uxgGateHtml');
  assert.match(uxg, /window\._gateCardsModel = _gateCardsBuild\(\{\s*cf: currentFlight,\s*idle: !showBoarding && !showCountdown && !isFinalCallStatus && !isGateClosedStatus && !_door\.word,\s*stKey: stKey, inbLate: !!inbDelayed,\s*depTs: _bt\.effDepForBoard \|\| 0, boardTs: _bt\.boardTs \|\| 0, close: _gateClose,/);
  // the boarding takeover is exactly a sign or the countdown: never idle
  assert.match(CORE, /\+ \(\(finalActive \|\| boardActive \|\| showCountdown\) \? ' g8-takeover' : ''\)/);
  assert.match(fn('_gateSignPhase'), /finalActive: isGateClosedStatus \|\| isFinalCallStatus,\s*boardActive: showBoarding && !isGateClosedStatus && !isFinalCallStatus/);
  // the deck: only through _gateCardsDue, on the facts of this gate's own flight
  const deck = fn('_buildGateAdSlideList');
  assert.match(deck, /var _gcDue = _gateCardsDue\(_gateCardsLive\(\), Date\.now\(\)\);\s*if \(_gcDue\.ovcard\) deck\.splice\(Math\.min\(2, deck\.length\), 0, \{ type: 'ovcard' \}\);\s*if \(_gcDue\.docscard\) deck\.splice\(Math\.min\(6, deck\.length\), 0, \{ type: 'docscard' \}\);\s*if \(_gcDue\.closecard\) deck\.push\(\{ type: 'closecard' \}\);/);
  assert.equal((deck.match(/type: '(ovcard|docscard|closecard)'/g) || []).length, 3, 'nowhere else');
  assert.match(fn('_gateCardsLive'), /if \(!m \|\| !cf \|\| String\(cf\.flight \|\| ''\) !== m\.flight\) return null;/);
  // the renderer draws a card only when it has something true to show, after
  // the big map is taken down, and skips it otherwise (as the weather card)
  const ad = fn('renderGateAd');
  const tear = ad.indexOf('_bigCraftTeardown();');
  const cards = ad.indexOf('_GATE_CARD_TYPES.indexOf(slide.type) >= 0');
  const heritage = ad.indexOf("slide.type === 'heritage'");
  assert.ok(tear > 0 && cards > tear && heritage > cards, 'after the map is torn down, before the other scenes');
  assert.match(ad, /if \(_renderGateCard\(el, slide\.type, true\)\) return;\s*slot = \(slot \+ 1\) % totalSlots;\s*_gateAdIndex = slot;\s*window\._gateAdCurrentIdx = slot;/);
  // a minute each, as the weather card
  const E = engine();
  assert.deepEqual(E._GATE_CARD_TYPES, ['ovcard', 'docscard', 'closecard', 'sbcard']);
  assert.equal(E._GATE_CARD_DWELL_MS, 60000);
  assert.match(fn('_getGateAdDwellMs'), /if \(_GATE_CARD_TYPES\.indexOf\(slide\.type\) >= 0\) return _GATE_CARD_DWELL_MS;/);
  // ?scene= reaches each card (the review pin matches the slide's type)
  assert.match(ad, /String\(slides\[_pi\]\.type \|\| ''\)\.toLowerCase\(\) === String\(_pin\)\.toLowerCase\(\)/);
});

// ════════════════════════════════════════════════════════════════════════════
// THE GATE-CLOSES WINDOW
// ════════════════════════════════════════════════════════════════════════════

test('the gate-closes card shows only in the last 45 minutes before the close, and only for an airline that publishes one', () => {
  const E = engine();
  assert.equal(E._GATE_CARD_CLOSE_WINDOW_MS, 45 * MIN);
  const ts = DEP - 15 * MIN;
  const m = E._gateCardsBuild(facts());
  const at = (now) => E._gateCardsDue(m, now).closecard;
  assert.equal(at(ts - 46 * MIN), false, '46 minutes before the close');
  assert.equal(at(ts - 45 * MIN), true, '45 minutes before');
  assert.equal(at(ts - MIN), true, 'a minute before');
  assert.equal(at(ts), false, 'at the close');
  assert.equal(at(ts + MIN), false, 'after it');
  // a deadline to be AT the gate is not a close time (PAL, Delta, United)
  const pb = E._gateCardsBuild(facts({ airline: 'PB', cf: row({ airline: 'PB', flight: 'PB923' }), close: { carrier: 'PB', min: 20, kind: 'gateBeAt', ts: DEP - 20 * MIN } }));
  assert.equal(E._gateCardsDue(pb, DEP - 30 * MIN).closecard, false);
  assert.equal(E._gateCardHtml('closecard', pb, DEP - 30 * MIN, null), '');
  // no close time at all (an airline not in the table): no card
  assert.equal(E._gateCardsDue(E._gateCardsBuild(facts({ close: null })), ts - 10 * MIN).closecard, false);
  // each airline's own word and minutes, the clock its own language's
  const html = E._gateCardHtml('closecard', m, ts - 20 * MIN, null);
  assert.match(html, /data-close-kind="gateCloses" data-close-min="15" data-close-ts="\d+"/);
  assert.match(textOf(html), /Gate closes Fermeture de la porte 6:00pm 15 min before departure \| 15 min avant le départ Departure \| Départ 6:15pm/);
  const ws = E._gateCardsBuild(facts({ airline: 'WS', cf: row({ airline: 'WS', flight: 'WS3380' }), close: { carrier: 'WS', min: 15, kind: 'boardingCutoff', ts } }));
  assert.match(textOf(E._gateCardHtml('closecard', ws, ts - 20 * MIN, null)), /^Boarding cut-off Heure limite pour l’embarquement 6:00pm/);
  const pd = E._gateCardsBuild(facts({ airline: 'PD', cf: row({ airline: 'PD', flight: 'PD2382' }), close: { carrier: 'PD', min: 10, kind: 'gateCloses', ts: DEP - 10 * MIN } }));
  assert.match(textOf(E._gateCardHtml('closecard', pd, DEP - 30 * MIN, null)), /10 min before departure \| 10 min avant le départ/);
});

test('the overview\'s close row: the airline\'s close word, or its be-at-the-gate sentence with its minutes, and its time', () => {
  const E = engine();
  const m = E._gateCardsBuild(facts());
  const r = rowOf(E._gateCardHtml('ovcard', m, DEP - 3 * 60 * MIN, null), 'close');
  assert.equal(textOf(r), 'Gate closes | Fermeture de la porte 6:00pm');
  const pb = E._gateCardsBuild(facts({ airline: 'PB', cf: row({ airline: 'PB', flight: 'PB923' }), close: { carrier: 'PB', min: 20, kind: 'gateBeAt', ts: DEP - 20 * MIN } }));
  assert.equal(textOf(rowOf(E._gateCardHtml('ovcard', pb, DEP - 3 * 60 * MIN, null), 'close')), 'Be at the gate 20 min before departure | Présentez-vous à la porte 20 min avant le départ 5:55pm');
  // no close time: no row
  assert.equal(rowOf(E._gateCardHtml('ovcard', E._gateCardsBuild(facts({ close: null })), DEP - 3 * 60 * MIN, null), 'close'), '');
  // and the band's close words end with their clock in every language, so the
  // word without it is the word (closeAtGate "Gate closes {TIME}" -> "Gate closes")
  for (const w of Object.values(E.GATE_CLOSE_WORDS)) {
    if (!w.band) continue;
    for (const lg of LANGS) assert.match(BS.bs(w.band, lg), /\s\{TIME\}$/, w.band + ' ' + lg);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// THE DOCUMENTS ARE THE BOARDING BAND'S OWN
// ════════════════════════════════════════════════════════════════════════════

test('the documents card follows _gateDocsVariant and says the store\'s docs lines, with their pictograms', () => {
  const E = engine();
  const cases = [
    ['YQM', 'YYZ', 'AC', 'D'], ['YQM', 'BOS', 'WS', 'P'], ['YUL', 'BOS', 'AC', 'N'], ['YTZ', 'EWR', 'PD', 'P'],
    ['YUL', 'CDG', 'AC', 'I'], ['BOS', 'YUL', 'AC', 'C'], ['BOS', 'LAX', 'AA', 'B']
  ];
  for (const [home, dest, air, want] of cases) {
    const cf = row({ airline: air, _locIata: dest });
    const m = E._gateCardsBuild(facts({ cf, iata: home, airline: air }));
    assert.equal(m.docs, E._gateDocsVariant(cf, home, air), home + '-' + dest);
    assert.equal(m.docs, want, home + '-' + dest);
    const html = E._gateCardHtml('docscard', m, DEP - 3 * 60 * MIN, null);
    const d = E._GATE_DOCS[want];
    assert.match(html, new RegExp('data-doc="' + want + '"'));
    for (const k of d.keys) for (const lg of ['en', 'fr']) assert.ok(html.includes(BS.bs(k, lg)), want + ' says ' + k + ' in ' + lg);
    // the first line's pictograms large (all of them for one line, its own for
    // two), the second line beside its own
    const hero = (html.match(/class="gc-hero-pic"/g) || []).length;
    assert.equal(hero, d.keys.length > 1 ? 1 : d.glyphs.length, want + ' pictograms');
    assert.equal((html.match(/class="gc-drow"/g) || []).length, d.keys.length - 1, want + ' rows');
    assert.match(html, /Before you board/);
    assert.doesNotMatch(html, /<image|<text|href=/, 'drawn pictograms only');
  }
  // the documents card speaks the board's languages, French first in Québec
  const yul = E._gateCardsBuild(facts({ cf: row({ _locIata: 'CDG' }), iata: 'YUL', frF: true }));
  const t = textOf(E._gateCardHtml('docscard', yul, DEP - 3 * 60 * MIN, null));
  assert.ok(t.indexOf('Avant l’embarquement') < t.indexOf('Before you board'));
  assert.ok(t.indexOf(BS.bs('docsPassport', 'fr')) < t.indexOf(BS.bs('docsPassport', 'en')));
});

// ════════════════════════════════════════════════════════════════════════════
// STATUS ONLY ON EVIDENCE, NO INVENTED TIMES
// ════════════════════════════════════════════════════════════════════════════

test('the overview prints the gate\'s own times and a status word only where its source said one', () => {
  const E = engine();
  const now = DEP - 3 * 60 * MIN;
  const m = E._gateCardsBuild(facts());
  const html = E._gateCardHtml('ovcard', m, now, null);
  assert.equal(textOf(rowOf(html, 'boarding')), 'Boarding | Embarquement 5:40pm');
  assert.equal(textOf(rowOf(html, 'departure')), 'Departure | Départ 6:15pm', 'Scheduled says no status word');
  assert.equal(textOf(rowOf(html, 'arrival')), 'Arrival | Arrivée Time in Toronto | Heure à Toronto 7:02pm', 'the destination\'s own clock');
  assert.equal(rowOf(html, 'inbound'), '', 'no inbound known: no row');
  assert.match(html, /^<div class="gcard gcard-ovcard fids-dn-fade" data-gcard="ovcard"/);
  // the airport said On time / Early / Delayed (with its new time)
  assert.match(rowOf(E._gateCardHtml('ovcard', E._gateCardsBuild(facts({ stKey: 'ontime' })), now, null), 'departure'), /class="gc-stw gc-st-ok fids-dn-fade"><span class="bs-h fx-unit gc-h" lang="en">On time<\/span>/);
  const dl = E._gateCardsBuild(facts({ stKey: 'delayed', cf: row({ status: 'delayed', upd: '19:00', _revTs: DEP + 45 * MIN }), depTs: DEP + 45 * MIN, boardTs: DEP + 10 * MIN }));
  const dr = rowOf(E._gateCardHtml('ovcard', dl, now, null), 'departure');
  assert.match(dr, /gc-st-amb/);
  assert.equal(textOf(dr), 'Departure | Départ 7:00pm Delayed | En retard');
  // the destination with no row: a dash, never a time made up from ours
  const none = rowOf(E._gateCardHtml('ovcard', E._gateCardsBuild(facts({ arr: null })), now, null), 'arrival');
  assert.match(none, /<div class="gc-t gc-t-dash">—<\/div>/);
  // the inbound: the Your Aircraft card's own time and word
  const inb = (st) => rowOf(E._gateCardHtml('ovcard', m, now, { flight: 'AC1986', city: 'Toronto · Pearson', code: 'YYZ', ts: DEP - 95 * MIN, st }), 'inbound');
  assert.equal(textOf(inb('scheduled')), 'Your Aircraft | Votre avion AC1986 · Toronto · Pearson · YYZ 4:40pm', 'Scheduled: no word');
  assert.match(inb('early'), /gc-st-ok/);
  assert.match(inb('delayed'), /gc-st-amb/);
  assert.match(inb('cancelled'), /gc-st-red/);
  assert.match(inb('arrived'), /gc-st-ok[^>]*><span[^>]*>Arrived/);
  assert.equal(rowOf(E._gateCardHtml('ovcard', m, now, { flight: 'AC1986', ts: 0, st: 'ontime' }), 'inbound'), '', 'no time: no row');
  // tomorrow's times say so, each in its own row; today's say nothing
  // (the day is the board's own today, as every gate time's day line)
  const T = Date.now() + 24 * 60 * MIN;
  const tm = E._gateCardsBuild(facts({ depTs: T, boardTs: T - 35 * MIN, close: null, arr: null }));
  const tt = textOf(rowOf(E._gateCardHtml('ovcard', tm, Date.now(), null), 'departure'));
  assert.match(tt, /^Departure \| Départ \d{1,2}:\d\d[ap]m Tomorrow \| Demain$/);
  // the status colours are on status words only
  for (const kind of ['boarding', 'close', 'arrival']) assert.doesNotMatch(rowOf(html, kind), /gc-st-/, kind);
});

// ════════════════════════════════════════════════════════════════════════════
// WORDS, EMBLEMS, THE LOOK
// ════════════════════════════════════════════════════════════════════════════

test('every word is the store\'s, in all nine languages, each language marked, French first in Québec', () => {
  for (const k of ['cardBeforeBoard', 'closeMinBefore']) {
    const e = BS.STR[k];
    assert.ok(e, k + ' is in the store');
    assert.deepEqual(LANGS.filter((l) => !e[l]), [], k + ' in all nine');
    for (const l of LANGS) if (l !== 'en') assert.notEqual(e[l], e.en, k + ' ' + l + ' is its own');
  }
  for (const l of LANGS) assert.ok(BS.STR.closeMinBefore[l].includes('{MIN}'), 'closeMinBefore ' + l);
  const now = DEP - 30 * MIN;
  for (const lg of LANGS) {
    const pair = [lg, lg === 'en' ? 'fr' : 'en'];
    const E = engine(pair);
    const m = E._gateCardsBuild(facts({ cf: row({ _locIata: 'CDG' }), iata: 'YUL' }));
    const inb = { flight: 'AC871', city: 'Paris', code: 'CDG', ts: DEP - 90 * MIN, st: 'ontime' };
    for (const type of ['ovcard', 'docscard', 'closecard']) {
      const html = E._gateCardHtml(type, m, now, inb);
      assert.ok(html, lg + ' ' + type);
      assert.doesNotMatch(html, /\{[A-Z]+\}/, lg + ' ' + type + ': a placeholder left');
      assert.ok(html.includes('lang="' + lg + '"'), lg + ' ' + type + ' marks its language');
      if (lg === 'ar') assert.match(html, /lang="ar" dir="rtl"/);
    }
  }
  // Québec: French first in every pair
  const E = engine(['en', 'fr']);
  const q = textOf(E._gateCardHtml('ovcard', E._gateCardsBuild(facts({ iata: 'YUL', frF: true })), DEP - 3 * 60 * MIN, null));
  assert.ok(q.indexOf('Embarquement | Boarding') >= 0 && q.indexOf('Départ | Departure') >= 0, q);
  // every pair is two whole phrases with one break offered between them
  assert.match(fn('_gcPair'), /'<span class="fx-unit gc-h">' \+ t \+ '<\/span>'/);
  assert.match(CORE, /var _GC_SEP = ' <span class="gc-sep fx-brk">\|<\/span> ';/);
  // and the shared fitter holds every card line (never cut)
  for (const sel of ['.gcard .gc-ttl', '.gcard .gc-lbl', '.gcard .gc-sub', '.gcard .gc-t', '.gcard .gc-hl', '.gcard .gc-dl', '.gcard .gc-gtl', '.gcard .gc-bigt', '.gcard .gc-rule']) {
    assert.ok(CORE.includes("{ sel: '" + sel), sel + ' is fitted');
  }
});

test('the emblems keep their colours on the dark frame and never sit on a box', () => {
  const E = engine();
  const ac = E._gateCardEmblem('AC');
  assert.match(ac, /src="\/logos\/airlines\/canadian\/AC\.TO\.svg"/);
  assert.doesNotMatch(ac, /gc-emb-white/, 'the roundel in its red');
  assert.match(E._gateCardEmblem('RV'), /AC\.TO\.svg/, 'Rouge flies as Air Canada');
  assert.match(E._gateCardEmblem('WS'), /WestJet-leaf-colour\.svg/);
  assert.doesNotMatch(E._gateCardEmblem('WS'), /gc-emb-white/);
  assert.match(E._gateCardEmblem('PD'), /porter-p\.svg/, 'Porter\'s white lettering, as drawn');
  assert.doesNotMatch(E._gateCardEmblem('PD'), /gc-emb-white/);
  const seg = CSS.slice(CSS.indexOf("v24012 — THE GATE'S CENTRE CARDS"), CSS.indexOf('/* ══ v23973 — LATER AT THIS GATE'));
  assert.match(seg, /\.gcard \.gc-emb \{[^}]*background: none !important;/);
  assert.match(seg, /\.gcard \.gc-embw \{[^}]*background: none !important;/);
  // the logo is never smaller than the words beside it (rule 1)
  const size = (sel) => Number((new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*?(?:height|font-size): calc\\(([\\d.]+) \\* var\\(--gc-u\\)\\)').exec(seg) || [])[1]);
  assert.ok(size('.gcard .gc-emb') >= size('.gcard .gc-ttl'), 'overview');
  assert.ok(size('.gcard.gcard-docscard .gc-emb') >= size('.gcard .gc-dtitle'), 'documents');
  assert.ok(size('.gcard.gcard-closecard .gc-emb') >= size('.gcard .gc-gtl'), 'gate closes');
  // the approved mockup's tints for the three, a guarded accent for others
  assert.deepEqual(E._gateCardTint('AC'), { frame: '#1D1B20', acc: '#F01428' });
  assert.deepEqual(E._gateCardTint('PD'), { frame: '#0F2142', acc: '#4F86D6' });
  assert.deepEqual(E._gateCardTint('WS'), { frame: '#08303A', acc: '#00B2A9' });
});

test('by day the card is BLEND-2, at night NIGHT, switched by the engine\'s html.fids-day / html.fids-night with a 2 s crossfade', () => {
  // the engine's own classes
  assert.match(SUN, /fids-day/);
  assert.match(SUN, /fids-night/);
  const at = CSS.indexOf("v24012 — THE GATE'S CENTRE CARDS");
  assert.ok(at > 0);
  const seg = CSS.slice(at, CSS.indexOf('/* ══ v23973 — LATER AT THIS GATE', at));
  assert.ok(seg.length > 2000, 'the block, up to the next one');
  const G = 'body' + ':not(#_)'.repeat(16);
  const rule = (sel) => { const i = seg.indexOf(sel + ' {'); assert.ok(i >= 0, sel); return seg.slice(i, seg.indexOf('}', i) + 1); };
  // BLEND-2 is the card's own look: the light tiles, the darkened status words
  const day = rule('html ' + G + ' .gcard');
  for (const v of ['--gc-z-bg: #F3F2EE', '--gc-z-ink: #10151D', '--gc-ok: #0B6E3A', '--gc-amb: #8A5300', '--gc-red: #B0141C']) assert.ok(day.includes(v), v);
  assert.match(day, /background: var\(--gc-frame, #151a22\) !important;/, 'the dark frame');
  // NIGHT: only the colour tokens change (the geometry is the same in both)
  const night = rule('html.fids-night ' + G + ' .gcard');
  for (const v of ['--gc-z-ink: #FFFFFF', '--gc-ok: #3DDC97', '--gc-amb: #FFC23D', '--gc-red: #FF6B6B']) assert.ok(night.includes(v), v);
  const decls = night.slice(night.indexOf('{') + 1, night.lastIndexOf('}')).split(';').map((d) => d.trim()).filter(Boolean);
  assert.ok(decls.length >= 8);
  for (const d of decls) assert.match(d, /^--gc-[a-z0-9-]+:/, 'night changes tokens only: ' + d);
  assert.match(night, /--gc-z-bg: rgba\(243, 242, 238, 0\)/, 'the tiles fade clear, their own colour');
  // the crossfade: after the engine's first paint, colours only, its 2 s
  const fade = rule('html.fids-dn-ready ' + G + ' .gcard .fids-dn-fade, html.fids-dn-ready ' + G + ' .gcard .gc-rb::before');
  assert.match(fade, /transition: background-color var\(--fids-dn-fade, 2s\) ease, color var\(--fids-dn-fade, 2s\) ease, border-color var\(--fids-dn-fade, 2s\) ease, box-shadow var\(--fids-dn-fade, 2s\) ease !important;/);
  assert.match(CSS.slice(0, at) + fs.readFileSync(path.join(root, 'fids-current', 'css', 'shared.css'), 'utf8'), /--fids-dn-fade: 2s/);
  // the zones that change are marked to fade
  const E = engine();
  const m = E._gateCardsBuild(facts());
  for (const type of ['ovcard', 'docscard', 'closecard']) assert.match(E._gateCardHtml(type, m, DEP - 30 * MIN, null), /gc-zone fids-dn-fade/, type);
  // nothing moves or flashes; the status colours are on status words only
  assert.doesNotMatch(seg, /animation|@keyframes/i);
  for (const tok of ['--gc-ok', '--gc-amb', '--gc-red']) {
    const uses = seg.split('\n').filter((l) => l.includes('var(' + tok + ')'));
    assert.ok(uses.length >= 1, tok);
    for (const l of uses) assert.match(l, /\.gc-st-(ok|amb|red) \{/, tok + ' on a status word only');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// v24026 — THE UPGRADE AND STANDBY LISTS, PRETEND FLIGHTS ONLY
// ════════════════════════════════════════════════════════════════════════════

const testRow = (o) => row(Object.assign({ _flightKey: 'AC1987_test' }, o || {}));

// the same engine with the switch off: pretend flights only
function engineOff() {
  engine();
  const off = SRC.replace(/^var GATE_SB_PRETEND_EVERYWHERE = true;/m, 'var GATE_SB_PRETEND_EVERYWHERE = false;');
  assert.notEqual(off, SRC, 'the switch is in the lifted source');
  const esc = (v) => String(v == null ? '' : v).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;').split("'").join('&#39;');
  return new Function('langs', 'window', 'BoardStrings', 'getAirlineAccent', 'fidsEscHtml', off)(['en', 'fr'], { FIDSGateDate: GD, _gateOrbParts: () => null }, BS, () => '#3466A8', esc);
}

test('the lists show on every flight (decided 2026-10-10); with the switch off, on pretend flights only', () => {
  assert.match(CORE, /^var GATE_SB_PRETEND_EVERYWHERE = true;/m, 'shown on every flight');
  const E = engine();
  // boarding at DEP-35, so a domestic list runs DEP-90 .. DEP-35
  const real = E._gateCardsBuild(facts());
  assert.equal(real.pretend, true);
  assert.equal(E._gateCardsDue(real, DEP - 60 * MIN).sbcard, true);
  const O = engineOff();
  const realOff = O._gateCardsBuild(facts());
  assert.equal(realOff.pretend, false);
  assert.equal(O._gateCardsDue(realOff, DEP - 60 * MIN).sbcard, false, 'switch off: a live flight carries no made-up names');
  assert.equal(O._gateCardHtml('sbcard', realOff, DEP - 60 * MIN, null), '');
  const fake = O._gateCardsBuild(facts({ cf: testRow() }));
  assert.equal(fake.pretend, true, 'a test flight (✚ ADD FLIGHT) is pretend');
  assert.equal(O._gateCardsDue(fake, DEP - 60 * MIN).sbcard, true);
});

test('the lists run from 90 minutes before a domestic departure (120 abroad) until boarding', () => {
  const E = engine();
  const dom = E._gateCardsBuild(facts({ cf: testRow() }));
  assert.equal(dom.region, 'dom');
  const at = (m, mins) => E._gateCardsDue(m, DEP - mins * MIN).sbcard;
  assert.equal(at(dom, 91), false, 'not before the window');
  assert.equal(at(dom, 90), true);
  assert.equal(at(dom, 46), true, 'up to the countdown (DEP-45), which then takes the screen');
  assert.equal(at(dom, 35), false, 'gone at boarding: the sign takes the screen');
  const intl = E._gateCardsBuild(facts({ cf: testRow({ _locIata: 'LHR' }), code: 'LHR', city: 'London' }));
  assert.equal(intl.region, 'intl');
  assert.equal(at(intl, 121), false);
  assert.equal(at(intl, 120), true);
  // no firm times (Delayed with no new time), no list
  const late = E._gateCardsBuild(facts({ cf: testRow(), inbLate: true }));
  assert.equal(at(late, 60), false);
});

test('names clear one by one as boarding comes closer, the next one called', () => {
  const E = engine();
  const m = E._gateCardsBuild(facts({ cf: testRow() }));
  const first = E._gateSbLists(m, DEP - 90 * MIN);
  const last = E._gateSbLists(m, DEP - 46 * MIN);
  const n = (L, st) => L.rows.filter((r) => r.st === st).length;
  assert.ok(first.upgrade && first.standby, 'Air Canada: an upgrade list and a standby list');
  assert.ok(n(first.upgrade, 'cleared') >= 1, 'upgrades are cleared from check-in on');
  assert.equal(n(first.standby, 'cleared'), 0, 'standby clears at the gate');
  assert.ok(n(last.standby, 'cleared') > n(first.standby, 'cleared'));
  assert.ok(n(last.upgrade, 'cleared') >= n(first.upgrade, 'cleared'));
  for (const L of [first.upgrade, first.standby, last.upgrade, last.standby]) {
    assert.ok(n(L, 'cleared') < L.rows.length, 'someone is always still waiting');
    assert.ok(n(L, 'called') <= 1, 'one name called at a time');
    for (const r of L.rows) {
      assert.match(r.name, /^[A-Z]{3}, [A-Z]\.$/, 'the masked name: three letters of the surname and an initial');
      assert.match(r.seat, /^\d{1,2}[A-F]$/);
    }
    // the queue numbers count only who is still waiting
    assert.deepEqual(L.rows.filter((r) => r.st !== 'cleared').map((r) => r.pos), L.rows.filter((r) => r.st !== 'cleared').map((_, i) => i + 1));
  }
  // the same flight draws the same list on every paint and every screen
  assert.deepEqual(E._gateSbLists(m, DEP - 60 * MIN), E._gateSbLists(m, DEP - 60 * MIN));
  const names = (L) => L.rows.map((r) => r.name);
  assert.deepEqual(names(first.standby), names(last.standby), 'the names stay; only their status moves');
});

test('an airline with no premium cabin shows the standby list alone', () => {
  const E = engine();
  const m = E._gateCardsBuild(facts({ cf: testRow({ airline: 'F8', flight: 'F8123' }), airline: 'F8', flight: 'F8123' }));
  const L = E._gateSbLists(m, DEP - 60 * MIN);
  assert.equal(L.upgrade, null);
  assert.ok(L.standby && L.standby.rows.length >= 4);
  assert.deepEqual(E.GATE_SB_CABINS.PD, ['pdReserve', 'pdClassic'], "Porter's own cabin names");
});

test('the card is drawn in the board pair, its status words the only colour', () => {
  for (const pair of [['en', 'fr'], ['en', 'es']]) {
    const E = engine(pair);
    const m = E._gateCardsBuild(facts({ cf: testRow() }));
    const html = E._gateCardHtml('sbcard', m, DEP - 50 * MIN, null);
    const txt = textOf(html);
    for (const k of ['sbUpgradeList', 'sbStandbyList', 'sbRefresh', 'cabinBiz', 'cabinEcon']) {
      for (const lg of pair) assert.ok(txt.includes(BS.bs(k, lg)), `${k} in ${lg}`);
    }
    assert.match(html, /<span class="gc-st-ok">/, 'a cleared name says so in words');
    assert.doesNotMatch(html, /style="[^"]*color/, 'no colour but the status words');
    assert.match(html, /data-gcard="sbcard"/);
  }
});

test('the lists’ words exist in all nine languages', () => {
  for (const k of ['sbUpgradeList', 'sbStandbyList', 'sbCleared', 'sbSeeAgent', 'sbRefresh']) {
    for (const lg of LANGS) assert.ok(BS.bs(k, lg), `${k} ${lg}`);
  }
});
