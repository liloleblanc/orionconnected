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
// day/night classes the look switches on. And (2026-10-12) the lists' window:
// from 90 minutes before a domestic departure (120 abroad) without a break
// until the flight closes, the centre deck the list alone, a column beside
// the boarding signs, never in the way of the countdown or the sign.
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
    line(/^var _GC_SEP_HOLD = [^\n]+;/m),
    block('var _GC_STATUS = {'),
    ...['_gateDelayHasTime', 'airportCountry', '_gateLbl', '_fidsClockForLang', '_gateCloseRouteOk', '_gateCloseCarrier', '_gateCloseInfo',
      '_gateDocsVariant', '_ssEntry', 'SLpair', '_rc2Rgb', '_rc2Lin', '_rc2Contrast', '_rc2DeltaE', '_rc2StatusLike',
      '_gateDayWords', 'flightRegionKey', '_gateSbPretendOn', '_gateSbRand', '_gateSbSeed', '_gateSbLists', '_gateCardsBuild', '_gateCardsDue', '_gateCardTint', '_gateCardEmblem', '_gcPair', '_gcStatusPair', '_gcDayPair',
      '_gcTime', '_gcCloseLabel', '_gcRow', '_gateCardHtml', '_gcSbFoot', '_gateSbColHtml'].map(fn),
    'return { GATE_CLOSE_WORDS, _GATE_DOCS, _GATE_CARD_TYPES, _GATE_CARD_DWELL_MS, _GATE_CARD_CLOSE_WINDOW_MS, _gateCloseInfo, _gateDocsVariant,'
      + ' _gateCardsBuild, _gateCardsDue, _gateCardTint, _gateCardEmblem, _gcCloseLabel, _gateCardHtml, _gateSbLists, GATE_SB_CABINS, _gcSbFoot, _gateSbColHtml };'
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

test('the facts are kept under the signs (never idle there) and dropped once the flight has closed', () => {
  const E = engine();
  const m = E._gateCardsBuild(facts());
  assert.ok(m, 'a scheduled departure, no sign up');
  assert.equal(m.docs, 'D');
  assert.equal(m.idle, true);
  // 2026-10-12 — under the countdown, a sign or a door word the facts stay
  // (the lists hold until the flight closes), marked not idle
  const sign = E._gateCardsBuild(facts({ idle: false }));
  assert.ok(sign, 'under the countdown or a door word: kept');
  assert.equal(sign.idle, false);
  for (const st of ['boarding', 'final', 'finalcall', 'final-call']) {
    const k = E._gateCardsBuild(facts({ stKey: st, cf: row({ status: st }) }));
    assert.ok(k, st + ': kept');
    assert.equal(k.idle, false, st + ' is never the idle layout');
  }
  // the flight has closed: nothing
  for (const st of ['gateclosed', 'gate_closed', 'departed', 'cancelled', 'canceled', 'diverted', 'active', 'enroute', 'landed', 'arrived']) {
    assert.equal(E._gateCardsBuild(facts({ stKey: st, cf: row({ status: st }) })), null, st);
  }
  for (const st of ['scheduled', 'ontime', 'expected', 'early']) assert.equal(E._gateCardsBuild(facts({ stKey: st })).idle, true, st);
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
  // timeline and no close time; the documents still hold, and so do the
  // lists (2026-10-12: they do not wait for a firm time)
  assert.deepEqual(due({ inbLate: true }, DEP - 30 * MIN), { ovcard: false, docscard: true, closecard: false, sbcard: true });
  // under a sign or the countdown (not idle): the lists only
  assert.deepEqual(due({ idle: false }, DEP - 30 * MIN), { ovcard: false, docscard: false, closecard: false, sbcard: true });
  assert.deepEqual(due({ idle: false }, DEP - 3 * 60 * MIN), { ovcard: false, docscard: false, closecard: false, sbcard: false });
  // Delayed with no new time: the same; with the airport's new time, the timeline
  assert.deepEqual(due({ stKey: 'delayed', cf: row({ status: 'delayed' }) }, DEP - 3 * 60 * MIN), { ovcard: false, docscard: true, closecard: false, sbcard: false });
  assert.equal(due({ stKey: 'delayed', cf: row({ status: 'delayed', upd: '19:00', _revTs: DEP + 45 * MIN }), depTs: DEP + 45 * MIN }, DEP - 3 * 60 * MIN).ovcard, true);
  // no boarding time printed: no timeline
  assert.equal(due({ boardTs: 0 }, DEP - 3 * 60 * MIN).ovcard, false);
});

test('the gate publishes the facts from its own paint, not idle under any sign, and the deck carries only cards that are due', () => {
  const uxg = fn('uxgGateHtml');
  assert.match(uxg, /window\._gateCardsModel = _gateCardsBuild\(\{\s*cf: currentFlight,\s*idle: !showBoarding && !showCountdown && !isFinalCallStatus && !isGateClosedStatus && !_door\.word,\s*stKey: stKey, inbLate: !!inbDelayed,\s*depTs: _bt\.effDepForBoard \|\| 0, boardTs: _bt\.boardTs \|\| 0, close: _gateClose,/);
  // the boarding takeover is exactly a sign or the countdown: never idle
  assert.match(CORE, /\+ \(\(finalActive \|\| boardActive \|\| showCountdown\) \? ' g8-takeover' : ''\)/);
  assert.match(fn('_gateSignPhase'), /finalActive: isGateClosedStatus \|\| isFinalCallStatus,\s*boardActive: showBoarding && !isGateClosedStatus && !isFinalCallStatus/);
  // the deck: only through _gateCardsDue, on the facts of this gate's own
  // flight; while the lists are due, the lists alone (below)
  const deck = fn('_buildGateAdSlideList');
  assert.match(deck, /var _gcDue = _gateCardsDue\(_gateCardsLive\(\), Date\.now\(\)\);[\s\S]{0,200}if \(_gcDue\.sbcard && !_gcPin\) return \[\{ type: 'sbcard' \}\];\s*if \(_gcDue\.ovcard\) deck\.splice\(Math\.min\(2, deck\.length\), 0, \{ type: 'ovcard' \}\);\s*if \(_gcDue\.docscard\) deck\.splice\(Math\.min\(6, deck\.length\), 0, \{ type: 'docscard' \}\);\s*if \(_gcDue\.closecard\) deck\.push\(\{ type: 'closecard' \}\);/);
  assert.equal((deck.match(/type: '(ovcard|docscard|closecard)'/g) || []).length, 3, 'nowhere else');
  assert.match(fn('_gateCardsLive'), /if \(!m \|\| !cf \|\| String\(cf\.flight \|\| ''\) !== m\.flight\) return null;/);
  // the renderer draws a card only when it has something true to show, after
  // the big map is taken down, and skips it otherwise (as the weather card)
  const ad = fn('renderGateAd');
  const tear = ad.indexOf('_bigCraftTeardown();');
  const cards = ad.indexOf('_GATE_CARD_TYPES.indexOf(slide.type) >= 0');
  const heritage = ad.indexOf("slide.type === 'heritage'");
  assert.ok(tear > 0 && cards > tear && heritage > cards, 'after the map is torn down, before the other scenes');
  assert.match(ad, /if \(_renderGateCard\(el, slide\.type, true\)\) return;[\s\S]{0,420}?slot = \(slot \+ 1\) % totalSlots;\s*_gateAdIndex = slot;\s*window\._gateAdCurrentIdx = slot;/);
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

test('the lists run from 90 minutes before a domestic departure (120 abroad) without a break until the flight closes', () => {
  const E = engine();
  const dom = E._gateCardsBuild(facts({ cf: testRow() }));
  assert.equal(dom.region, 'dom');
  const at = (m, mins) => E._gateCardsDue(m, DEP - mins * MIN).sbcard;
  // the start: 90 minutes before the departure the gate prints, not a
  // millisecond earlier
  assert.equal(E._gateCardsDue(dom, DEP - 90 * MIN - 1).sbcard, false, 'not before the window');
  assert.equal(at(dom, 91), false);
  assert.equal(at(dom, 90), true);
  // counted from the departure the gate prints (the airport's revised time)
  const rev = E._gateCardsBuild(facts({ cf: testRow({ status: 'delayed', upd: '19:00', _revTs: DEP + 45 * MIN }), stKey: 'delayed', depTs: DEP + 45 * MIN, boardTs: DEP + 10 * MIN }));
  assert.equal(E._gateCardsDue(rev, DEP + 45 * MIN - 91 * MIN).sbcard, false);
  assert.equal(E._gateCardsDue(rev, DEP + 45 * MIN - 90 * MIN).sbcard, true);
  // no break: due at every minute from the start to the departure, in the
  // idle layout, under the countdown (DEP-45 .. DEP-35, idle false), under
  // NOW BOARDING (the airport's word, or the schedule's door word at an
  // airport whose feed never says it) and under FINAL CALL
  for (let t = 90; t >= 1; t--) assert.equal(at(dom, t), true, 'idle, DEP-' + t);
  const cd = E._gateCardsBuild(facts({ cf: testRow(), idle: false }));
  for (let t = 45; t >= 36; t--) assert.equal(at(cd, t), true, 'countdown, DEP-' + t);
  for (const w of ['boarding', 'final', 'finalcall']) {
    const sg = E._gateCardsBuild(facts({ cf: testRow(), idle: false, stKey: w }));
    for (let t = 35; t >= 1; t--) assert.equal(at(sg, t), true, w + ', DEP-' + t);
  }
  // the close: the printed departure passed while the times are firm ...
  assert.equal(E._gateCardsDue(dom, DEP).sbcard, false, 'gone at the departure');
  assert.equal(at(dom, -5), false);
  const sgB = E._gateCardsBuild(facts({ cf: testRow(), idle: false, stKey: 'boarding' }));
  assert.equal(E._gateCardsDue(sgB, DEP).sbcard, false, 'under NOW BOARDING too');
  // ... on a sign kept through a delay, the new departure the gate prints
  const kept = E._gateCardsBuild(facts({ cf: testRow(), idle: false, stKey: 'boarding', depEnd: DEP + 30 * MIN }));
  assert.equal(at(kept, -10), true, 'boarding goes on to the new time');
  assert.equal(at(kept, -30), false);
  // ... or the flight's own word (the model is then null)
  for (const w of ['gateclosed', 'departed', 'cancelled', 'diverted']) {
    assert.equal(E._gateCardsDue(E._gateCardsBuild(facts({ cf: testRow({ status: w }), stKey: w })), DEP - 20 * MIN).sbcard, false, w);
  }
  // not firm: a Delayed with no new time neither waits for one nor closes on
  // the clock (the flight's own hold on the gate bounds it)
  const dl = E._gateCardsBuild(facts({ cf: testRow({ status: 'delayed' }), stKey: 'delayed' }));
  assert.equal(dl.firm, false);
  assert.equal(at(dl, 91), false);
  assert.equal(at(dl, 60), true);
  assert.equal(at(dl, 0), true, 'not closed by a departure that will not hold');
  assert.equal(at(dl, -30), true);
  // "Updated boarding time to follow" coming up mid-window takes nothing down,
  // and redraws nothing: the same names in the same states
  const late = E._gateCardsBuild(facts({ cf: testRow(), inbLate: true }));
  assert.equal(at(late, 60), true);
  const names = (L) => [L.upgrade, L.standby, L.seats].map((x) => x && x.rows.map((r) => r.name + r.st).join(','));
  assert.deepEqual(names(E._gateSbLists(late, DEP - 60 * MIN)), names(E._gateSbLists(dom, DEP - 60 * MIN)));
  // abroad: 120 minutes, transborder and international
  const intl = E._gateCardsBuild(facts({ cf: testRow({ _locIata: 'LHR' }), code: 'LHR', city: 'London' }));
  assert.equal(intl.region, 'intl');
  assert.equal(at(intl, 121), false);
  assert.equal(at(intl, 120), true);
  const trans = E._gateCardsBuild(facts({ cf: testRow({ _locIata: 'BOS' }), code: 'BOS', city: 'Boston' }));
  assert.equal(trans.region, 'trans');
  assert.equal(at(trans, 121), false);
  assert.equal(at(trans, 120), true);
});

test('the names clear until the boarding countdown, then the list holds its last state until the flight closes', () => {
  const E = engine();
  const m = E._gateCardsBuild(facts({ cf: testRow() }));
  const atCd = E._gateSbLists(m, DEP - 45 * MIN);
  for (const t of [44, 40, 35, 20, 5, 1]) assert.deepEqual(E._gateSbLists(m, DEP - t * MIN), atCd, 'DEP-' + t);
  // the countdown is ten minutes before the printed boarding time
  assert.notDeepEqual(E._gateSbLists(m, DEP - 90 * MIN), atCd);
});

test('while the lists are up the centre deck is the list alone; the full deck comes back when the flight closes; ?scene= still reaches every scene', () => {
  const deckSrc = fn('_buildGateAdSlideList');
  const build = (due, search) => new Function('window', 'document', 'location', 'getGateAds', '_welcomeCardData', '_gateCardsDue', '_gateCardsLive',
    'return (' + deckSrc + ')();')(
    { FIDS_MEDIA: null, _gateCurrentAirline: 'WS' },
    { documentElement: { classList: { contains: () => false } } },
    { search: search || '' },
    () => [{ headline: 'one' }, { headline: 'two' }, { headline: 'three' }],
    (c) => ({ adLayout: 'welcome-card', code: c }),
    () => Object.assign({ ovcard: false, docscard: false, closecard: false, sbcard: false }, due),
    () => ({}));
  assert.deepEqual(build({ sbcard: true, ovcard: true, docscard: true }), [{ type: 'sbcard' }], 'the list alone');
  const closed = build({ ovcard: true, docscard: true });
  assert.ok(closed.length >= 4 && !closed.some((d) => d.type === 'sbcard'), 'the deck again after the close');
  assert.ok(closed.some((d) => d.type === 'ovcard') && closed.some((d) => d.type === 'ad'));
  const pinned = build({ sbcard: true, ovcard: true }, '?scene=ovcard');
  assert.ok(pinned.some((d) => d.type === 'sbcard') && pinned.some((d) => d.type === 'ovcard') && pinned.length > 2, 'the review pin sees the whole deck');
  // the list never waits out a gap: every turn is its turn
  const turnSrc = fn('_gateCardTurnDue');
  const win = { _gateAdVisitSeq: 1 };
  const turn = new Function('window', 'location', '_GATE_CARD_GAP_MS', 'return (' + turnSrc + ');')(win, { search: '' }, 4 * MIN);
  for (let i = 0; i < 5; i++) { win._gateAdVisitSeq++; assert.equal(turn('sbcard'), true, 'visit ' + i); }
  assert.equal(turn('ovcard'), true);
  win._gateAdVisitSeq++;
  assert.equal(turn('ovcard'), false, 'the other cards keep their gap');
  // on screen and next again: repainted in place, never crossfaded into a
  // copy of itself (before the outgoing slide is lifted into the overlay)
  const tick = fn('_restartGateAdsTimer');
  const stay = tick.indexOf(":scope > .gcard[data-gcard=\"sbcard\"]");
  assert.ok(stay > 0 && stay < tick.indexOf('var _old = null;'), 'checked before the crossfade');
  assert.match(tick.slice(stay, tick.indexOf('var _old = null;')), /if \(_sbNext && _sbNext\.type === 'sbcard'\) \{[\s\S]*renderGateAd\(_gateAdIndex\);[\s\S]*_gateAdTimer = setTimeout\(_tick, Math\.max\(22000, _getGateAdDwellMs\(_sbNext\)\)\);\s*return;/);
  // and its minute still posts the rotator's boundary (that comes first)
  assert.ok(tick.indexOf('ocGateBoundary') < stay);
});

test('a card after a skipped weather or heritage slot is drawn, never a blank panel', () => {
  // the skip loop of renderGateAd, run as written
  const ad = fn('renderGateAd');
  const a = ad.indexOf('var _skipN = 0;');
  const b = ad.indexOf('if (_skipN >= totalSlots) return;');
  assert.ok(a > 0 && b > a, 'one loop for every scene that skips itself');
  const loop = ad.slice(a, b + 'if (_skipN >= totalSlots) return;'.length);
  const run = (slides, slot, ok) => {
    const drawn = [];
    const out = new Function('slides', 'slot', 'el', 'window', '_GATE_CARD_TYPES', '_renderGateCard', '_renderHeritageCard', '_wxTurnDue', '_renderWxCard',
      'var totalSlots = slides.length, slide = slides[slot], _gateAdIndex = slot;\n' + loop + '\nreturn { fell: slide && slide.type, slot: slot };')(
      slides, slot, {}, {}, ['ovcard', 'docscard', 'closecard', 'sbcard'],
      (el, t) => { if (ok[t]) { drawn.push(t); return true; } return false; },
      () => { if (ok.heritage) { drawn.push('heritage'); return true; } return false; },
      () => true,
      () => { if (ok.wxcard) { drawn.push('wxcard'); return true; } return false; });
    return { drawn, out };
  };
  const S = (...t) => t.map((type) => ({ type }));
  let r = run(S('ad', 'wxcard', 'docscard', 'ad'), 1, { docscard: true });
  assert.deepEqual(r.drawn, ['docscard'], 'the documents after a weather slot with no data');
  assert.equal(r.out, undefined, 'drawn, so the painter returned');
  r = run(S('ad', 'heritage', 'closecard'), 1, { closecard: true });
  assert.deepEqual(r.drawn, ['closecard'], 'the close card after a heritage slot with nothing to show');
  r = run(S('ad', 'heritage', 'wxcard', 'ovcard', 'ad'), 1, {});
  assert.deepEqual(r.drawn, []);
  assert.deepEqual(r.out, { fell: 'ad', slot: 4 }, 'a run of skipped scenes lands on the next ad, for the ad painter');
  r = run(S('sbcard'), 0, {});
  assert.equal(r.out, undefined, 'a pass where everything skipped itself leaves the panel as it is');
});

test('under the countdown, NOW BOARDING and FINAL CALL the list is a column beside the sign, never over it', () => {
  const uxg = fn('uxgGateHtml');
  // built from the same facts, only under a takeover
  assert.match(uxg, /var _sbColHtml = '';\s*if \(_gateSign\.boardActive \|\| _gateSign\.finalActive \|\| showCountdown\) \{\s*try \{ _sbColHtml = _gateSbColHtml\(window\._gateCardsModel, Date\.now\(\)\); \}/);
  // the last child of each takeover, after the sign (or the countdown's body)
  assert.match(uxg, /return _g8SignHtml\(_L, _R\);\s*\}\)\(\)\s*\+ _sbColHtml\s*\+ '<\/div>';\s*\}\s*\/\/ Build final call HTML/);
  assert.match(uxg, /return _g8SignHtml\(_L, _R\);\s*\}\)\(\)\s*\+ _sbColHtml\s*\+ '<\/div>';\s*\}\s*\}\s*\/\/ Build countdown panel/);
  assert.match(uxg, /\+ '<\/div>' \+ _sbColHtml \+ '<\/div>';\s*\}\s*\/\/ Determine which row4 content to show/);
  const closed = uxg.slice(uxg.indexOf('finalHtml = \'<div class="g8-final active g8-final-closed">\''), uxg.indexOf('} else {', uxg.indexOf('g8-final-closed')));
  assert.doesNotMatch(closed, /_sbColHtml/, 'GATE CLOSED: the flight has closed');
  assert.match(uxg, /\+ \(\(\(finalActive \|\| boardActive \|\| showCountdown\) && _sbColHtml\) \? ' g8-sbcol-on' : ''\)/);
  // the column form: the lists alone, no title, no foot
  const E = engine();
  const m = E._gateCardsBuild(facts({ cf: testRow(), idle: false, stKey: 'boarding' }));
  const col = E._gateSbColHtml(m, DEP - 20 * MIN);
  assert.match(col, /^<div class="g8-sbcol"><div class="gcard gcard-sbcard gcard-col /);
  assert.doesNotMatch(col, /gc-hd|gc-sbfoot|gc-ft/);
  for (const k of ['sbUpgradeList', 'sbStandbyList', 'sbSeatList']) assert.ok(textOf(col).includes(BS.bs(k, 'en')), k);
  assert.equal(E._gateSbColHtml(m, DEP + MIN), '', 'gone once the flight has closed');
  assert.equal(E._gateSbColHtml(E._gateCardsBuild(facts({ cf: testRow(), idle: false })), DEP - 91 * MIN), '', 'not before the window');
  // the layout: the banner, the tiles and the strip keep the width; the
  // band and the sign (or the countdown) in the first column, the list in
  // the second, so neither covers the other
  const G = 'html body' + ':not(#_)'.repeat(16) + ' .g8-wrap.g8-sbcol-on';
  const has = (sel, decl) => {
    const i = CSS.indexOf(sel + ' {');
    assert.ok(i >= 0, sel);
    assert.ok(CSS.slice(i, CSS.indexOf('}', i)).includes(decl), sel + ': ' + decl);
  };
  assert.ok(CSS.includes(G + ' .g8-board.active,\n' + G + ' .g8-final.active,\n' + G + ' .g8-countdown {'));
  assert.ok(CSS.includes(G + ' .g8-countdown { grid-template-rows: auto auto minmax(0, 1fr) !important; }'));
  assert.ok(CSS.includes('grid-template-columns: minmax(0, 1fr) var(--g8-sbcol-w) !important;'));
  assert.ok(CSS.includes('--g8-sbcol-w: 22.66vw;'), 'as wide as the idle right column (435px at 1920)');
  has(G + ' .g8-board.active > *, ' + G + ' .g8-final.active > *, ' + G + ' .g8-countdown > *', 'grid-column: 1 / -1 !important;');
  has(G + ' .g8-board.active > .g8-band, ' + G + ' .g8-final.active > .g8-band', 'grid-column: 1 !important; grid-row: 3 !important;');
  has(G + ' .g8-board.active > .g8-board-body, ' + G + ' .g8-final.active > .g8-board-body', 'grid-column: 1 !important; grid-row: 4 !important;');
  has(G + ' .g8-countdown > .g8-cd-body', 'grid-column: 1 !important; grid-row: 3 !important;');
  has(G + ' .g8-board.active > .g8-sbcol, ' + G + ' .g8-final.active > .g8-sbcol', 'grid-column: 2 !important; grid-row: 3 / span 2 !important;');
  has(G + ' .g8-countdown > .g8-sbcol', 'grid-column: 2 !important; grid-row: 3 !important;');
  // the sign's pairs keep one line in the narrower half (down to half
  // their size, then two whole phrases), the rest of the sign untouched
  const pairs = fn('_fidsPairSeparators');
  assert.match(pairs, /var target = ratio >= 1 \? base : Math\.max\(base \* 0\.68, base \* ratio \* 0\.985\);\s*(\/\/[^\n]*\n\s*)*if \(ratio < 1 && el\.closest\('\.g8-sbcol-on'\)\) target = Math\.max\(base \* 0\.5, base \* ratio \* 0\.985\);/);
  // every word whole in the narrow column: a heading, its cabin and a status
  // word may take a second line there (each language one phrase, the bar
  // held to the phrase before it), and the column's rules come first (an
  // element is fitted by the first rule that matches it)
  const colRules = CORE.indexOf("{ sel: '.gcard-col .gc-sbtt, .gcard-col .gc-sbcab', box: '.gc-sbhd', lines: 2, units: true, keep: 0.5, group: '.gc-sbl' }");
  const colX = CORE.indexOf("{ sel: '.gcard-col .gc-sbx', box: '.gc-sbr', lines: 2, units: true, group: '.gc-sbl' }");
  assert.ok(colRules > 0 && colX > colRules, 'the column\'s rules');
  assert.ok(colX < CORE.indexOf("{ sel: '.gcard .gc-sbtt, .gcard .gc-sbcab'") && colX < CORE.indexOf("{ sel: '.gcard .gc-sbx'"), 'ahead of the lists\' own');
  assert.match(CORE, /^var _GC_SEP_HOLD = '\\u00a0<span class="gc-sep fx-brk">\|<\/span> ';/m);
  assert.equal((fn('_gateCardHtml').match(/_GC_SEP_HOLD/g) || []).length, 4, 'headings, cabins and both status words');
  // and every row inside the column: the card's scale steps down after the
  // fitting pass until the last list ends above the card's foot
  const fit = fn('_gateSbColFit');
  assert.match(fit, /if \(lb > foot \+ 0\.5\) \{\s*card\.setAttribute\('data-sb-max', String\(Math\.min\(max, k\)\)\);\s*nk = Math\.max\(0\.62, Math\.round\(\(k - 0\.04\) \* 100\) \/ 100\);/);
  assert.match(fit, /if \(up < max - 0\.005\) nk = up;/, 'back up, never to a scale that ran over');
  assert.match(fit, /document\.fonts\.status !== 'loaded'\) return;/, 'not before the fonts land');
  assert.match(fn('_fidsSchedulePairPass'), /_fidsPairSeparators\(document\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*try \{ _gateSbColFit\(\); \} catch \(eSb\) \{\}/);
  assert.ok(CSS.includes('--gc-u: calc(min(.84vh, .47vw) * var(--gc-k, 1));'));
  // the clock opens and closes the column with nothing in the feed changing
  const clock = fn('updateDedicatedTimeOnly');
  assert.match(clock, /const _sbNow = !!_gateSbLists\(_sbM, _nowMs3\);\s*const _sbCol = _tkW\.querySelector\('\.g8-sbcol'\);\s*if \(_sbNow !== !!_sbCol\) \{/);
  assert.match(clock, /requestGateRebuild\(\);/);
});

test('in the centre the list carries the documents and the close time at its foot, the band\'s own words', () => {
  for (const pair of [['en', 'fr'], ['fr', 'en'], ['en', 'ja'], ['en', 'ar']]) {
    const E = engine(pair);
    const m = E._gateCardsBuild(facts({ cf: testRow() }));
    const html = E._gateCardHtml('sbcard', m, DEP - 60 * MIN, null);
    assert.match(html, /<div class="gc-sbfoot gc-zone fids-dn-fade" data-doc="D">/);
    const foot = html.slice(html.indexOf('gc-sbfoot'));
    const txt = textOf(foot);
    for (const lg of pair) {
      assert.ok(txt.includes(textOf(BS.bs('docsDomestic', lg))), 'docsDomestic ' + lg);
      assert.ok(foot.includes('lang="' + lg + '"'), 'marked ' + lg);
    }
    assert.doesNotMatch(foot, /\{[A-Z]+\}/, 'no placeholder left');
    assert.match(foot, /gc-sbfc/, 'the close time while it is still to come');
    if (pair.includes('ar')) assert.match(foot, /lang="ar" dir="rtl"/);
  }
  const E = engine();
  const m = E._gateCardsBuild(facts({ cf: testRow() }));
  // the close time has passed (DEP-15): the documents alone
  const late = E._gateCardHtml('sbcard', m, DEP - 10 * MIN, null);
  assert.match(late, /gc-sbfoot/);
  assert.doesNotMatch(late, /gc-sbfc/);
  // an airline with no close time: the documents alone
  const noClose = E._gateCardHtml('sbcard', E._gateCardsBuild(facts({ cf: testRow(), close: null })), DEP - 60 * MIN, null);
  assert.doesNotMatch(noClose, /gc-sbfc/);
  // an international flight: both documents, the variant the band shows
  const intl = E._gateCardsBuild(facts({ cf: testRow({ _locIata: 'LHR' }), code: 'LHR', city: 'London' }));
  assert.match(E._gateCardHtml('sbcard', intl, DEP - 100 * MIN, null), new RegExp('data-doc="' + intl.docs + '"'));
  // every phrase whole: the shared fitter holds the foot's lines
  assert.ok(CORE.includes("{ sel: '.gcard .gc-sbfl', box: '.gc-sbfx', lines: 2, units: true, group: '.gc-sbfoot' }"));
});

// ════════════════════════════════════════════════════════════════════════════
// 2026-10-12 — THE LISTS IN THE CENTRE KEEP EVERY ROW WHOLE (_gateSbFit). With
// "Later at this gate" up the centre card is 718px at 1920x1080, and with the
// foot the rows went under their own words (YUL C76 AC513, YHZ 20 PD244: 11-13
// rows lying on each other). The rendered check (tests/render/words.mjs,
// SB_CHECK) measures it on the screen in every language set, with the strip
// up and without; here the pass itself runs against a card whose layout is
// computed from the stylesheet's own sizes, so its order and its floors hold.
// ════════════════════════════════════════════════════════════════════════════

// A card of the lists, laid out as the stylesheet lays it out (in the card's
// unit, --gc-u = u0 x --gc-k): its padding, its header, the lists (a heading,
// a tile, rows of --gc-sbrf units, never under 4.67), the line under them,
// and the foot (the documents on two lines and the close time, or the
// documents on one line at `docsOneLine` of their size (step 1), or the close
// time alone (2), or none (3)). Every try the pass makes is logged.
function sbCard(o) {
  const W = o.W || 970, H = o.H, U0 = o.u0 || 10.8, LISTS = o.lists || [2, 4, 2];
  const attrs = {}, props = {}, log = [];
  const k = () => parseFloat(props['--gc-k'] || '1');
  const u = () => U0 * k();
  const f = () => parseFloat(props['--gc-sbrf'] || '5.9');
  const step = () => +(attrs['data-sb-foot'] || 0);
  const ruleLines = () => (o.ruleOneLineUnderK && k() < o.ruleOneLineUnderK ? 1 : 2);
  const docsLines = () => (step() >= 2 ? 0 : step() === 1 ? 1 : 2);
  const footH = () => {
    if (!o.foot || step() === 3) return 0;
    const U = u(), d = docsLines(), c = o.close ? 1 : 0;
    return 2.28 * U + (d + c) * 2.56 * U + (d && c ? 0.57 * U : 0);
  };
  const lay = () => {
    const U = u(), padT = 1.9 * U, padB = 1.14 * U, hd = 7.61 * U, ft = 1.71 * U + ruleLines() * 3.42 * U, fo = footH();
    const rowH = Math.max(f(), 4.67) * U;
    const secs = [];
    let y = 1.33 * U;
    LISTS.forEach((n, i) => { if (i) y += 1.33 * U; const top = y; y += 3.97 * U + 0.76 * U + n * rowH; secs.push([top, y]); });
    const sblTop = padT + hd, sblH = Math.max(0, H - padT - padB - hd - ft - fo);
    return { U, padB, hd, ft, fo, rowH, secs, sblTop, sblH };
  };
  const rect = (top, h, w) => ({ top, bottom: top + h, height: h, left: 0, width: w == null ? W : w, right: w == null ? W : w });
  const el = (r, x) => Object.assign({ getBoundingClientRect: r, hasAttribute: () => false, removeAttribute() {}, classList: { contains: () => false }, nextElementSibling: null }, x || {});
  const lastSec = el(() => { const L = lay(), s = L.secs[L.secs.length - 1]; return rect(L.sblTop + s[0], s[1] - s[0]); });
  const sbl = el(() => { const L = lay(); return rect(L.sblTop, L.sblH); }, { lastElementChild: lastSec });
  const hd = el(() => { const L = lay(); return rect(L.sblTop - L.hd, L.hd); });
  const ft = el(() => { const L = lay(); return rect(L.sblTop + L.sblH, L.ft); });
  const footEl = el(() => { const L = lay(); return rect(L.sblTop + L.sblH + L.ft, L.fo); });
  hd.nextElementSibling = sbl; sbl.nextElementSibling = ft; ft.nextElementSibling = o.foot ? footEl : null;
  const rows = [];
  LISTS.forEach((n) => { for (let i = 0; i < n; i++) {
    const ring = el(() => rect(0, 4.29 * u(), 4.29 * u()));
    ring.nextElementSibling = el(() => rect(0, 3.4 * u(), 200));
    rows.push(el(() => rect(0, lay().rowH), { firstElementChild: ring, _cs: { borderTopWidth: rows.length ? '2px' : '0px' } }));
  } });
  const line = (docs) => el(() => rect(0, (docs ? docsLines() : 1) ? 2.56 * u() : 0), { _cs: { get fontSize() { return (2.29 * u() * (docs && step() === 1 ? o.docsOneLine : 1)) + 'px'; } } });
  const lines = o.foot ? [line(true)].concat(o.close ? [line(false)] : []) : [];
  const card = {
    offsetWidth: W, offsetHeight: H, firstElementChild: hd,
    getBoundingClientRect: () => rect(0, H),
    _cs: { get paddingBottom() { return lay().padB + 'px'; } },
    getAttribute: (a) => (a in attrs ? attrs[a] : null),
    setAttribute: (a, v) => { attrs[a] = String(v); },
    removeAttribute: (a) => { delete attrs[a]; },
    hasAttribute: (a) => a in attrs,
    style: {
      setProperty: (p, v) => { props[p] = String(v); if (p === '--gc-k') log.push({ foot: step(), f: f(), k: k() }); },
      removeProperty: (p) => { delete props[p]; if (p === '--gc-k') log.push({ foot: step(), f: f(), k: k() }); },
      getPropertyValue: (p) => props[p] || ''
    },
    querySelector: (s) => ({ '.gc-sbl': sbl, '.gc-sbfoot': o.foot ? footEl : null, '.gc-sbfoot .gc-sbfc': o.foot && o.close ? {} : null, '.gc-sbn': rows[0].firstElementChild }[s] || null),
    querySelectorAll: (s) => ({ '.gc-sbr': rows, '.fx-fit': [], '.gc-sbfoot .gc-sbfl': lines }[s] || [])
  };
  return { card, log, attrs, props, u, f, k, step, rows: rows.length };
}
function sbFitter() {
  const src = [
    line(/^var _GATE_SB_ROW_U = [^;]+;/m), line(/^var _GATE_SB_ROW_MIN_U = [^;]+;/m), line(/^var _GATE_SB_RING_U = [^;]+;/m),
    line(/^var _GATE_SB_FOOT_U = [^;]+;/m), line(/^var _GATE_SB_K_MIN = [^;]+;/m), line(/^var _GATE_SB_K_MIN_BARE = [^;]+;/m),
    fn('_gateSbExcess'), fn('_gateSbLadder'), fn('_gateSbFit'),
    'return { _gateSbExcess, _gateSbLadder, _gateSbFit };'
  ].join('\n');
  const gcs = (e) => e._cs || {};
  return (doc) => new Function('getComputedStyle', 'fidsFitAll', '_fidsPairSeparators', 'document', 'window', 'console', src)(gcs, () => {}, () => {}, doc || {}, { innerWidth: 1920, innerHeight: 1080 }, { warn() {} });
}
// a row never under its ring and its rule (2px) with a hair: the floor
const sbFloorOk = (C, st) => st.f * 10.8 * st.k + 1e-6 >= 4.29 * 10.8 * st.k + 2 - 1e-6 && st.f >= 4.67;

test('the lists in the centre: the foot gives way first, then the rows come closer, then the card comes down, and no row goes under its words', () => {
  const F = sbFitter()();
  // "Later at this gate" up (718px), three lists of 2, 4 and 2 names, the
  // documents too long for one line (en|fr), a close time
  const C = sbCard({ H: 718, foot: true, close: true, docsOneLine: 0.65 });
  F._gateSbLadder(C.card);
  assert.ok(F._gateSbExcess(C.card) <= 0.5, 'every row inside the card');
  assert.equal(C.attrs['data-sb-over'], undefined);
  assert.equal(C.step(), 2, 'the documents go to the boarding band; the close time stays, on one line');
  assert.ok(C.k() < 1 && C.k() >= 0.62, 'then the card came down: ' + C.k());
  for (const st of C.log) assert.ok(sbFloorOk(C, st), 'no try puts a row under its ring: ' + JSON.stringify(st));
  // the order: no row closer before the foot has given all it can, no
  // smaller card before the rows are at their floor
  const firstClose = C.log.findIndex((s) => s.f < 5.9), firstSmall = C.log.findIndex((s) => s.k < 1);
  assert.ok(firstClose > 0 && C.log.slice(0, firstClose).some((s) => s.foot === 2) && C.log[firstClose].foot === 2, 'the foot first');
  assert.ok(firstSmall > firstClose, 'the rows before the card');
  assert.ok(C.log.slice(0, firstClose).every((s) => s.k === 1), 'full size until the rows are at their floor');

  // where one line of the documents keeps four fifths of its size, the foot
  // keeps them (step 1) when that is enough
  const C1 = sbCard({ H: 800, foot: true, close: true, docsOneLine: 0.9 });
  F._gateSbLadder(C1.card);
  assert.ok(F._gateSbExcess(C1.card) <= 0.5);
  assert.ok(C1.log.some((s) => s.foot === 1), 'one line each was tried');
  // and a smaller one is not taken: straight to the close time alone
  const C2 = sbCard({ H: 800, foot: true, close: true, docsOneLine: 0.7 });
  F._gateSbLadder(C2.card);
  assert.notEqual(C2.step(), 1);

  // the full panel with room to spare: nothing changes
  const T = sbCard({ H: 1100, foot: true, close: true, docsOneLine: 0.65 });
  F._gateSbLadder(T.card);
  assert.equal(T.step(), 0);
  assert.equal(T.f(), 5.9);
  assert.equal(T.k(), 1);

  // a smaller card can let a line take one line instead of two: the largest
  // scale that fits is kept, and the room left goes back to the rows
  const B = sbCard({ H: 718, foot: true, close: true, docsOneLine: 0.65, ruleOneLineUnderK: 0.845 });
  F._gateSbLadder(B.card);
  assert.ok(F._gateSbExcess(B.card) <= 0.5);
  const first = B.log.find((s) => s.k < 1).k;
  assert.ok(B.k() > first + 0.015 && B.k() < 0.845, 'not the first estimate (' + first + '): ' + B.k());
  assert.ok(F._gateSbExcess(B.card) > -2, 'the rows take what is left');

  // far too short: the foot goes last, the card down to half, and what still
  // does not fit is reported (data-sb-over), the rows never under their floor
  const X = sbCard({ H: 300, foot: true, close: true, docsOneLine: 0.65 });
  F._gateSbLadder(X.card);
  assert.equal(X.step(), 3);
  assert.equal(X.attrs['data-sb-over'], '1');
  assert.ok(X.k() >= 0.5);
  for (const st of X.log) assert.ok(sbFloorOk(X, st), JSON.stringify(st));
  assert.ok(X.log.findIndex((s) => s.foot === 3) > X.log.findIndex((s) => s.k < 1), 'the foot goes only after the card came down');

  // fitted once for its size; a resize fits it again
  const D = sbCard({ H: 718, foot: true, close: true, docsOneLine: 0.65 });
  const doc = { fonts: { status: 'loaded' }, querySelectorAll: () => [D.card] };
  const G = sbFitter()(doc);
  G._gateSbFit();
  const n = D.log.length;
  assert.ok(n > 0 && D.attrs['data-sb-fit']);
  G._gateSbFit();
  assert.equal(D.log.length, n, 'not again for the same size');
  D.card.offsetHeight = 873;
  G._gateSbFit();
  assert.ok(D.log.length > n, 'again for a new size');
  // not before the board's fonts have landed
  const E = sbCard({ H: 718, foot: true, close: true, docsOneLine: 0.65 });
  sbFitter()({ fonts: { status: 'loading' }, querySelectorAll: () => [E.card] })._gateSbFit();
  assert.equal(E.log.length, 0);
});

test('the lists in the centre: the stylesheet gives every row a set height and a floor, and nothing gives up height on its own', () => {
  const C = 'html body' + ':not(#_)'.repeat(16) + ' .gcard.gcard-sbcard:not(.gcard-col)';
  const P = 'html body' + ':not(#_)'.repeat(16);
  assert.ok(CSS.includes(C + ' { --gc-u: calc(min(1vh, .625vw) * var(--gc-k, 1)); }'), 'the card\'s scale');
  assert.ok(CSS.includes(C + ' .gc-sbr { flex: 0 0 auto !important; height: calc(var(--gc-sbrf, 5.9) * var(--gc-u)) !important; min-height: calc(4.67 * var(--gc-u)) !important; }'), 'a row: its set height and its floor (the ring, 4.29, and a hair)');
  assert.ok(CSS.includes(C + ' .gc-sbsec, ' + C + ' .gc-sbt { flex: 0 0 auto !important; }'), 'a list and its tile never shrink under their rows');
  assert.ok(CSS.includes(C + ' .gc-sbl { overflow: hidden !important; }'), 'what does not fit is hidden, never drawn over the line under it');
  assert.ok(CSS.includes(P + ' .gcard[data-sb-foot="2"] .gc-sbfoot .gc-sbfd { display: none !important; }'));
  assert.ok(CSS.includes(P + ' .gcard[data-sb-foot="3"] .gc-sbfoot { display: none !important; }'));
  // the v24026 rows gave up height with no floor; that rule is still there
  // for the column's own, but the centre's is overridden after it
  assert.ok(CSS.indexOf(C + ' .gc-sbr {') > CSS.indexOf('.gcard .gc-sbr { flex: 0 1 calc(5.9 * var(--gc-u)) !important; min-height: 0 !important;'));
  // one line each in the foot's first step: ahead of the foot's own rule
  const one = CORE.indexOf("{ sel: '.gcard[data-sb-foot] .gc-sbfl', box: '.gc-sbfx', lines: 1, units: true, group: '.gc-sbfoot' }");
  assert.ok(one > 0 && one < CORE.indexOf("{ sel: '.gcard .gc-sbfl', box: '.gc-sbfx', lines: 2, units: true, group: '.gc-sbfoot' }"));
  // after every fitting pass, once the column has had its own
  assert.match(fn('_fidsSchedulePairPass'), /try \{ _gateSbColFit\(\); \} catch \(eSb\) \{\}\s*\/\/[^\n]*\n\s*try \{ _gateSbFit\(\); \} catch \(eSc\) \{\}/);
  // and the rendered check measures it, with "Later at this gate" up too
  const WORDS = fs.readFileSync(path.join(root, 'tests', 'render', 'words.mjs'), 'utf8');
  assert.match(WORDS, /const SB_CHECK = `/);
  assert.match(WORDS, /a row is shorter than its words/);
  assert.match(WORDS, /const sb2 = await evalv\(SB_CHECK\);/);
});

test('names clear one by one as boarding comes closer, the next one called', () => {
  const E = engine();
  const m = E._gateCardsBuild(facts({ cf: testRow() }));
  const first = E._gateSbLists(m, DEP - 90 * MIN);
  const last = E._gateSbLists(m, DEP - 46 * MIN);
  const n = (L, st) => L.rows.filter((r) => r.st === st).length;
  assert.ok(first.upgrade && first.standby && first.seats, 'Air Canada: upgrade, standby and seat-change lists');
  assert.equal(first.seats.cabin, null, 'seat changes are for the whole flight');
  assert.equal(first.seats.rows.length, 2);
  assert.ok(first.upgrade.rows.length >= 2 && first.upgrade.rows.length <= 3);
  assert.ok(first.standby.rows.length >= 3 && first.standby.rows.length <= 4);
  assert.ok(n(first.upgrade, 'cleared') >= 1, 'upgrades are cleared from check-in on');
  assert.equal(n(first.standby, 'cleared'), 0, 'standby clears at the gate');
  assert.ok(n(last.standby, 'cleared') > n(first.standby, 'cleared'));
  assert.ok(n(last.upgrade, 'cleared') >= n(first.upgrade, 'cleared'));
  for (const L of [first.upgrade, first.standby, first.seats, last.upgrade, last.standby, last.seats]) {
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
  assert.ok(L.standby && L.standby.rows.length >= 3);
  assert.ok(L.seats && L.seats.rows.length === 2, 'seat changes for every airline');
  assert.deepEqual(E.GATE_SB_CABINS.PD, ['pdReserve', 'pdClassic'], "Porter's own cabin names");
});

test('the card is drawn in the board pair, its status words the only colour', () => {
  for (const pair of [['en', 'fr'], ['en', 'es']]) {
    const E = engine(pair);
    const m = E._gateCardsBuild(facts({ cf: testRow() }));
    const html = E._gateCardHtml('sbcard', m, DEP - 50 * MIN, null);
    const txt = textOf(html);
    for (const k of ['sbUpgradeList', 'sbStandbyList', 'sbSeatList', 'sbRefresh', 'cabinBiz', 'cabinEcon']) {
      for (const lg of pair) assert.ok(txt.includes(BS.bs(k, lg)), `${k} in ${lg}`);
    }
    assert.match(html, /<span class="gc-st-ok">/, 'a cleared name says so in words');
    assert.doesNotMatch(html, /style="[^"]*color/, 'no colour but the status words');
    assert.match(html, /data-gcard="sbcard"/);

  }
});

test('the lists’ words exist in all nine languages', () => {
  for (const k of ['sbUpgradeList', 'sbStandbyList', 'sbSeatList', 'sbCleared', 'sbNewSeat', 'sbSeeAgent', 'sbRefresh']) {
    for (const lg of LANGS) assert.ok(BS.bs(k, lg), `${k} ${lg}`);
  }
});

test('no made-up surname is a word in any board language', () => {
  // The rendered language check (tests/render/words.mjs) reads a capitalised
  // short word as a word unless no language has it: CI read "PAR, Y." as the
  // French "par". The same vocabulary: everyday English and every word of
  // the store and the guard's tables.
  const checks = require('./i18n/checks.js');
  const R = checks.run();
  const ELIDED = /^(?:d|l|qu|n|s|j|c|m|t|dell|nell|all|dall|sull)['\u2019](?=\p{L})/iu;
  const wordsOf = (s) => (String(s).replace(/<[^>]*>/g, ' ').replace(/\{[A-Za-z0-9_]+\}/g, ' ').match(/\p{L}[\p{L}\p{M}'\u2019.-]*/gu) || [])
    .map((w) => w.replace(ELIDED, '').replace(/[^\p{L}]+$/u, '').toLowerCase()).filter((w) => w.length >= 2);
  const ANY = new Set(R.englishWords);
  for (const o of R.textObjects) for (const l of Object.keys(o.langs || {})) for (const w of wordsOf(o.langs[l])) ANY.add(w);
  for (const li of R.listObjects) for (const it of li.items) for (const w of wordsOf(it)) ANY.add(w);
  for (const e of Object.values(BS.STR)) for (const l of LANGS) for (const w of wordsOf(e[l] || '')) ANY.add(w);
  const sur = JSON.parse(line(/^var _GATE_SB_SUR = (\[[^\]]*\]);/m).replace(/^var _GATE_SB_SUR = /, '').replace(/;$/, '').replace(/'/g, '"'));
  assert.ok(sur.length >= 30);
  assert.deepEqual(sur.filter((w) => !/^[A-Z]{3}$/.test(w)), [], 'three capital letters each');
  assert.deepEqual(sur.filter((w) => ANY.has(w.toLowerCase())), [], 'a prefix that is a word would read as one');
  assert.equal(new Set(sur).size, sur.length, 'no prefix twice');
});
