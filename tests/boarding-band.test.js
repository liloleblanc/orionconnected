'use strict';

// WHY THIS EXISTS
//
// v24006. The boarding screen's band, built to the approved "Airline colours"
// mockup (option a, the dedicated band). For the whole time boarding lasts
// (the NOW BOARDING sign and the final call) a band sits directly under the
// strip and holds two facts:
//   LEFT, on the airline's first colour in its ink: the travel documents this
//     flight asks for, with pictograms, each language on its own line;
//   RIGHT, on the airline's second colour in white: the airline's own close
//     time in its own word ("Gate closes", WestJet's "Boarding cut-off",
//     Flair's "Boarding closes", American's "Boarding ends"), counted back
//     from the departure the board prints, in each language's own clock.
// An airline that publishes no close time (PAL, Pascan; Delta and United
// publish only a deadline to be AT the gate) has no right half: the
// documents take the whole band (an empty half read as a missing value).
// The documents follow the route: boarding pass and ID inside Canada; the
// passport to the U.S., "passport or NEXUS card" only from the ten Canadian
// U.S.-preclearance airports (never Porter at Billy Bishop); the passport and
// "visa or travel authorization if required" from Canada abroad. Outside
// Canada nothing is guessed: the boarding pass only, and on a flight TO
// Canada, IRCC's own line instead (a Schengen flight from Zurich or one from
// Heathrow to Dublin asks no passport of its own citizens; v24006 first
// showed them the passport and visa line). Every phrase is whole: a line is
// made smaller, or breaks only between two whole phrases, and each half has
// its own size (the close time is not shrunk by the documents beside it).
// Porter's photo-ID note moved off the strip into the band, and "photo ID"
// is gone from every language.
//
// Everything below runs the shipped code: functions and tables are lifted
// out of fids-core.js by brace matching; the words are the store's.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BS = require('../fids-current/js/board-strings.js');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
const MIN = 60000;

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
function fn(name) {
  const m = CORE.match(new RegExp('(^|\\n)function ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\('));
  assert.ok(m, name + ' must be declared at the top level');
  return braceFrom(CORE, m.index + (m[1] ? 1 : 0), name);
}
const block = (prefix) => braceFrom(CORE, CORE.indexOf(prefix), prefix) + ';';
function iife(prefix) {
  const a = CORE.indexOf(prefix);
  assert.ok(a >= 0, prefix + ' must exist');
  const b = CORE.indexOf('\n})();', a);
  assert.ok(b > a, prefix + ' must end');
  return CORE.slice(a, b + 6);
}

// The band engine: the close table, the documents, the band's markup, and
// what they read (the gate's label table and pair picker, the per-language
// clock, the country table).
let SRC = null;
function engine(langs) {
  const src = SRC || (SRC = [
    block('var GATE_CLOSE_POLICY = {'),
    block('var GATE_CLOSE_WORDS = {'),
    block('var _GATE_CLOSE_ALIAS = {'),
    block('var _GATE_LBL = {'),
    block('const _IATA_CC_GROUPS = {'),
    'const _IATA_CC = ' + braceFrom(CORE, CORE.indexOf('(function () {', CORE.indexOf('const _IATA_CC = ')), '_IATA_CC') + ')();',
    CORE.match(/^const _CC_PARENT = [^;]+;/m)[0],
    CORE.match(/^const _US_Y_IATA = [^;]+;/m)[0],
    CORE.match(/^var _GATE_PRECLEARANCE = \[[^\]]*\];/m)[0],
    block('var _GATE_DOCS = {'),
    iife('var _GATE_BAND_GLYPH = (function () {'),
    ...['_gateDelayHasTime', 'airportCountry', '_gateLbl', '_fidsClockForLang', '_gateCloseRouteOk', '_gateCloseCarrier',
      '_gateCloseInfo', '_gateCloseBandInfo', '_gateDocsVariant', '_gateBandHtml'].map(fn),
    'return { GATE_CLOSE_POLICY, GATE_CLOSE_WORDS, _GATE_PRECLEARANCE, _GATE_DOCS, _gateCloseBandInfo, _gateDocsVariant, _gateBandHtml };'
  ].join('\n'));
  return new Function('langs', 'window', 'BoardStrings', src)(langs || ['en', 'fr'], {}, BS);
}
// 18:15 ADT on 2026-10-04 (21:15 UTC), Moncton.
const DEP = Date.parse('2026-10-04T21:15:00Z');
const TZ = 'America/Moncton';
const row = (o) => Object.assign({ flight: 'AC1987', airline: 'AC', status: 'boarding', _sortTs: DEP, _locIata: 'YYZ', time: '18:15' }, o || {});
/** Text of markup, tags dropped (the separator and the clock read as written). */
const textOf = (html) => String(html).replace(/<[^>]*>/g, '');
/** The band's lines: [{ half, lang, dir, text }]. */
function lines(html) {
  const out = [];
  for (const half of ['docs', 'close']) {
    const a = html.indexOf('g8-band-half g8-band-' + half);
    if (a < 0) continue;
    const c = html.indexOf('g8-band-half g8-band-close');
    const b = half === 'docs' && c >= 0 ? c : html.length;
    const seg = html.slice(a, b);
    for (const m of seg.matchAll(/<div class="g8-band-ln"([^>]*)>([\s\S]*?)<\/div>/g)) {
      const lang = (/\slang="([^"]+)"/.exec(m[1]) || [])[1] || '';
      const dir = (/\sdir="([^"]+)"/.exec(m[1]) || [])[1] || '';
      out.push({ half, lang, dir, text: textOf(m[2]).replace(/ /g, ' ') });
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// THE CLOSE TIME, FOR THE WHOLE OF BOARDING
// ════════════════════════════════════════════════════════════════════════════

test('every airline that publishes a close time gets its own minutes and its own word, all through boarding and the final call', () => {
  const E = engine();
  const now = DEP - 20 * MIN;
  const want = {
    AC: [15, 'gateCloses'], WS: [15, 'boardingCutoff'], PD: [10, 'gateCloses'],
    F8: [20, 'boardingCloses'], TS: [15, 'gateCloses'], AA: [15, 'boardingEnds']
  };
  for (const [code, [min, kind]] of Object.entries(want)) {
    const early = now - 10 * MIN;   // before Flair's 20 has passed
    for (const st of ['boarding', 'final', 'final-call', 'scheduled', 'ontime']) {
      const info = E._gateCloseBandInfo(row({ airline: code, status: st }), code, DEP, early, 'YQM', 0, false);
      assert.deepEqual(info, { carrier: code, min, kind, ts: DEP - min * MIN }, code + ' ' + st);
    }
    // The band prints it, in the airline's own word and each language's clock.
    const html = E._gateBandHtml('D', E._gateCloseBandInfo(row({ airline: code }), code, DEP, early, 'YQM', 0, false), TZ, false);
    assert.match(html, new RegExp('data-close-kind="' + kind + '" data-close-min="' + min + '" data-close-ts="' + (DEP - min * MIN) + '"'), code);
    const close = lines(html).filter((l) => l.half === 'close');
    assert.equal(close.length, 2, code + ': both languages');
    const hm = new Date(DEP - min * MIN);
    const en = hm.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '').toLowerCase();
    const fr = hm.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    assert.equal(close[0].text, BS.bs(E.GATE_CLOSE_WORDS[kind].band, 'en').replace('{TIME}', en), code + ' en');
    assert.equal(close[1].text, BS.bs(E.GATE_CLOSE_WORDS[kind].band, 'fr').replace('{TIME}', fr), code + ' fr');
  }
  // the words themselves
  const E2 = engine();
  const say = (code, min) => lines(E2._gateBandHtml('D', E2._gateCloseBandInfo(row({ airline: code }), code, DEP, DEP - 40 * MIN, 'YQM', 0, false), TZ, false))
    .filter((l) => l.half === 'close').map((l) => l.text);
  assert.deepEqual(say('AC'), ['Gate closes 6:00pm', 'Fermeture de la porte 18:00']);
  assert.deepEqual(say('WS'), ['Boarding cut-off 6:00pm', 'Heure limite pour l’embarquement 18:00'], "WestJet's own word, English and French");
  assert.deepEqual(say('PD'), ['Gate closes 6:05pm', 'Fermeture de la porte 18:05'], "Porter's 10 minutes");
  assert.deepEqual(say('F8'), ['Boarding closes 5:55pm', 'Fin de l’embarquement 17:55'], "Flair's 20 minutes");
  assert.deepEqual(say('AA'), ['Boarding ends 6:00pm', 'Fin de l’embarquement 18:00']);
  // Rouge, Jazz and Encore fly as their airline and take its rule.
  for (const [code, as] of [['RV', 'AC'], ['QK', 'AC'], ['JZA', 'AC'], ['WR', 'WS'], ['POE', 'PD']]) {
    assert.equal(E._gateCloseBandInfo(row({ airline: code }), code, DEP, now, 'YQM', 0, false).carrier, as, code);
  }
});

test('no close time where the airline publishes none: PAL, Pascan, a be-at-the-gate deadline, an airline not in the table', () => {
  const E = engine();
  const now = DEP - 40 * MIN;
  // PAL publishes only "be at the gate 20 minutes before departure": not a close.
  assert.equal(E.GATE_CLOSE_POLICY.PB.kind, 'gateBeAt');
  assert.equal(E.GATE_CLOSE_WORDS.gateBeAt.band, '', 'a be-at-the-gate deadline has no band line');
  for (const code of ['PB', 'SP', 'PVL', 'P6', 'DL', 'UA', 'B6', 'XX', '']) {
    const r = row({ airline: code, _locIata: code === 'DL' ? 'ATL' : 'YYZ' });
    assert.equal(E._gateCloseBandInfo(r, code, DEP, now, code === 'DL' ? 'MSP' : 'YQM', 0, false), null, code || '(none)');
    // the band still shows the documents, across its whole width: no right
    // half at all, never an empty block in the second colour
    const html = E._gateBandHtml('D', E._gateCloseBandInfo(r, code, DEP, now, 'YQM', 0, false), TZ, false);
    assert.match(html, /^<div class="g8-band g8-band-solo"/, code + ': the documents alone');
    assert.doesNotMatch(html, /g8-band-close/, code + ': no right half');
    assert.doesNotMatch(html, /data-close-/, code);
    assert.equal(lines(html).filter((l) => l.half === 'docs').length, 2, code + ': the documents in both languages');
  }
});

test('the close time is never invented: past, gone, cancelled, a Delayed with no time, a kept sign, or at or before the printed boarding time', () => {
  const E = engine();
  const now = DEP - 20 * MIN;
  const ac = (o) => E._gateCloseBandInfo(row(o), 'AC', DEP, now, 'YQM', 0, false);
  for (const st of ['gateclosed', 'departed', 'cancelled', 'canceled', 'diverted', 'active', 'arrived', 'landed', 'enroute']) {
    assert.equal(ac({ status: st }), null, st);
  }
  assert.equal(ac({ status: 'delayed' }), null, 'Delayed with no new time: its close is not known');
  assert.equal(E._gateCloseBandInfo(row(), 'AC', DEP, DEP - 15 * MIN, 'YQM', 0, false), null, 'at the close time it comes off');
  assert.ok(E._gateCloseBandInfo(row(), 'AC', DEP, DEP - 16 * MIN, 'YQM', 0, false));
  assert.equal(E._gateCloseBandInfo(row(), 'AC', 0, now, 'YQM', 0, false), null, 'no departure');
  assert.equal(E._gateCloseBandInfo(row(), 'AC', DEP, now, 'YQM', 0, true), null, 'a sign kept through a delay: the departure has moved');
  // the same boarding-time rule as the card (a short turn's honesty floor)
  assert.equal(E._gateCloseBandInfo(row(), 'AC', DEP, now, 'YQM', DEP - 10 * MIN, false), null, 'boarding printed after the close');
  assert.equal(E._gateCloseBandInfo(row(), 'AC', DEP, now, 'YQM', DEP - 15 * MIN, false), null, 'boarding printed at the close');
  assert.ok(E._gateCloseBandInfo(row(), 'AC', DEP, now, 'YQM', DEP - 30 * MIN, false));
  // a revised departure moves it
  const later = DEP + 45 * MIN;
  assert.equal(E._gateCloseBandInfo(row({ status: 'boarding' }), 'AC', later, now, 'YQM', 0, false).ts, later - 15 * MIN);
  // and the gate takes it off at its minute, with nothing in the feed changing
  const tick = fn('updateDedicatedTimeOnly');
  assert.match(tick, /document\.querySelector\('\.g8-band\[data-close-ts\]'\)/);
  assert.match(tick, /_nowMs3 >= _bandTs\) \{ _bandEl\.removeAttribute\('data-close-ts'\); requestGateRebuild\(\); \}/);
});

// ════════════════════════════════════════════════════════════════════════════
// THE DOCUMENTS FOLLOW THE ROUTE
// ════════════════════════════════════════════════════════════════════════════

test('the documents line follows the flight: domestic, transborder (preclearance or not), international, and outside Canada', () => {
  const E = engine();
  const v = (home, to, carrier) => E._gateDocsVariant(row({ _locIata: to, airline: carrier || 'AC' }), home, carrier || 'AC');
  // inside Canada, and a destination whose country is not known (a passport
  // is an ID too: boarding pass and ID is true of every departure from Canada)
  assert.equal(v('YQM', 'YYZ'), 'D');
  assert.equal(v('YUL', 'YVR'), 'D');
  assert.equal(v('YQM', ''), 'D');
  assert.equal(v('YQM', 'ZZZ'), 'D');
  // the ten CBP preclearance airports: passport or NEXUS
  assert.deepEqual([...E._GATE_PRECLEARANCE].sort(), ['YEG', 'YHZ', 'YOW', 'YTZ', 'YUL', 'YVR', 'YWG', 'YYC', 'YYJ', 'YYZ']);
  for (const ap of E._GATE_PRECLEARANCE) assert.equal(v(ap, 'BOS', 'WS'), 'N', ap);
  // no preclearance: the passport (Moncton, Québec City, Saint John, Fredericton, St. John's)
  for (const ap of ['YQM', 'YQB', 'YSJ', 'YFC', 'YYT', 'YXE', 'YQT']) assert.equal(v(ap, 'BOS'), 'P', ap);
  // Porter's NEXUS page names Pearson and Ottawa only: never at Billy Bishop
  assert.equal(v('YTZ', 'EWR', 'PD'), 'P');
  assert.equal(v('YTZ', 'EWR', 'POE'), 'P');
  assert.equal(v('YYZ', 'EWR', 'PD'), 'N');
  assert.equal(v('YOW', 'EWR', 'PD'), 'N');
  // a U.S. territory is the U.S.
  assert.equal(v('YYZ', 'SJU'), 'N');
  // international: passport, then a visa or travel authorization if required
  assert.equal(v('YUL', 'CDG'), 'I');
  assert.equal(v('YQM', 'CUN'), 'I');
  assert.equal(v('YHZ', 'LHR', 'WS'), 'I');
  // outside Canada a Canadian rule is never said and the variant is never
  // guessed: the boarding pass only. A domestic flight (the TSA's ID rule is
  // at the checkpoint, not the gate), and a cross-border one whose rules were
  // not researched: inside Schengen an EU or Swiss citizen flies on a
  // national ID card, and the UK and Ireland share a travel area with no
  // passport rule. v24006 first put the passport and visa line on both.
  assert.equal(v('MSP', 'ATL', 'DL'), 'B');
  assert.equal(v('AUS', 'DFW', 'AA'), 'B');
  assert.equal(v('ZRH', 'CDG', 'LX'), 'B', 'Zurich to Paris, inside Schengen');
  assert.equal(v('LHR', 'DUB', 'EI'), 'B', 'Heathrow to Dublin, the Common Travel Area');
  assert.equal(v('EDI', 'AMS', 'KL'), 'B');
  assert.equal(v('SYD', 'AKL', 'NZ'), 'B');
  assert.equal(v('MSP', 'CUN', 'DL'), 'B');
  for (const [home, to] of [['ZRH', 'CDG'], ['LHR', 'DUB'], ['MSP', 'CUN'], ['SYD', 'AKL']]) {
    assert.notEqual(v(home, to), 'I', home + ' to ' + to + ': never the passport and visa line outside Canada');
  }
  // a flight TO Canada from a board outside Canada: IRCC's own line, the one
  // the research gives a board outside Canada
  assert.equal(v('MSP', 'YYZ', 'DL'), 'C');
  assert.equal(v('LHR', 'YYZ', 'AC'), 'C');
  assert.equal(v('ZRH', 'YUL', 'LX'), 'C');
  assert.equal(v('SYD', 'YVR', 'AC'), 'C');
  assert.equal(v('', 'YYZ'), 'B', 'an unknown home airport');
  assert.equal(v('MSP', 'ZZZ', 'DL'), 'B', 'an unknown destination outside Canada');
  // a Canadian gate never shows the line for a flight to Canada
  for (const ap of ['YQM', 'YUL', 'YYZ', 'YHZ']) for (const to of ['YYZ', 'BOS', 'CDG', '']) assert.notEqual(v(ap, to), 'C', ap + ' to ' + to);
});

test('each variant prints its own lines and pictograms, every language marked, French first in Québec', () => {
  const E = engine(['en', 'fr']);
  const docs = (variant, frF, E2) => lines((E2 || E)._gateBandHtml(variant, null, TZ, !!frF)).filter((l) => l.half === 'docs');
  assert.deepEqual(docs('D').map((l) => l.text), ['Boarding pass and ID ready', 'Carte d’embarquement et pièce d’identité en main']);
  assert.deepEqual(docs('P').map((l) => l.text), ['Have your passport ready', 'Ayez votre passeport à portée de main']);
  assert.deepEqual(docs('N').map((l) => l.text), ['Have your passport or NEXUS card ready', 'Ayez votre passeport ou carte NEXUS à portée de main']);
  assert.deepEqual(docs('B').map((l) => l.text), ['Have your boarding pass ready', 'Ayez votre carte d’embarquement à portée de main']);
  // international: both facts in each language, one language per line, the
  // two phrases whole round a dot a line break drops. The research's own
  // words: the singular « Visa » and "Visa" in French and Spanish.
  assert.deepEqual(docs('I').map((l) => l.text), [
    'Have your passport ready · Visa or travel authorization if required',
    'Ayez votre passeport à portée de main · Visa ou autorisation de voyage, s’il y a lieu'
  ]);
  const intl = E._gateBandHtml('I', null, TZ, false);
  assert.match(intl, /<span class="fx-unit" lang="en"[^>]*>Have your passport ready<\/span> <span class="g8-band-sep fx-brk">·<\/span> <span class="fx-unit" lang="en"[^>]*>Visa or travel authorization if required<\/span>/);
  assert.match(intl, /class="g8-band g8-band-tall g8-band-solo"/);
  // a flight to Canada from a board outside Canada: IRCC's line, on its own
  // (after the boarding pass it ran under the floor at 1280x720 in German
  // and Spanish), French with a no-break space before its colon
  assert.deepEqual(docs('C').map((l) => l.text), [
    'Flying to Canada? Visa or eTA may apply',
    'Vol vers le Canada : visa ou AVE, s’il y a lieu'
  ]);
  assert.match(E._gateBandHtml('C', null, TZ, false), /Vol vers le Canada\u00A0: visa ou AVE/);
  // EVERY PHRASE IS WHOLE: each fact in each language is one .fx-unit, a
  // lone phrase included, and so is each close line with its time, so the
  // fitter can break only between two whole phrases (display rule 2)
  const info = { carrier: 'AC', min: 15, kind: 'gateCloses', ts: DEP - 15 * MIN };
  for (const variant of ['D', 'B', 'P', 'N', 'I', 'C']) {
    const html = E._gateBandHtml(variant, info, TZ, false);
    for (const m of html.matchAll(/<div class="g8-band-ln"[^>]*>([\s\S]*?)<\/div>/g)) {
      const bare = m[1].replace(/<span class="fx-unit"[^>]*>[\s\S]*?<\/span>(?=$| <span class="g8-band-sep)/g, '').replace(/ <span class="g8-band-sep fx-brk">·<\/span> /g, '');
      assert.equal(bare, '', variant + ': every word of the line sits in a whole phrase: ' + m[1].slice(0, 120));
    }
  }
  assert.match(E._gateBandHtml('D', info, TZ, false), /<div class="g8-band-ln"[^>]*><span class="fx-unit">Gate closes <b class="g8-band-time"><bdi>6:00pm<\/bdi><\/b><\/span><\/div>/);
  // French first in Québec
  assert.deepEqual(docs('I', true).map((l) => l.lang), ['fr', 'en']);
  assert.deepEqual(docs('D', true).map((l) => l.lang), ['fr', 'en']);
  // pictograms: a boarding pass and an ID card, a passport, a passport and a
  // card, a passport and a visa page; never a programme's mark
  const glyphs = (variant) => (E._gateBandHtml(variant, null, TZ, false).split('g8-band-close')[0].match(/<svg class="g8-band-glyph"/g) || []).length;
  assert.deepEqual(['D', 'B', 'P', 'N', 'I', 'C'].map(glyphs), [2, 1, 1, 2, 2, 1]);
  assert.deepEqual(['D', 'B', 'P', 'N', 'I', 'C'].map((k) => E._GATE_DOCS[k].glyphs), ['ti', 't', 'p', 'pi', 'pv', 'v']);
  assert.doesNotMatch(CORE.slice(CORE.indexOf('var _GATE_BAND_GLYPH'), CORE.indexOf('function _gateCloseBandInfo(')), /<image|<text|href=|url\(/i, 'drawn shapes only: no artwork, no words');
  // every language of the board, each its own line and marked (Arabic right to left)
  for (const lg of LANGS) {
    const other = lg === 'en' ? 'fr' : 'en';
    const El = engine([lg, other]);
    for (const variant of ['D', 'B', 'P', 'N', 'I', 'C']) {
      const ls = docs(variant, false, El);
      assert.equal(ls.length, 2, lg + ' ' + variant);
      assert.equal(ls[0].lang, lg, lg + ' ' + variant + ' is marked');
      if (lg === 'ar') assert.equal(ls[0].dir, 'rtl');
      for (const key of El._GATE_DOCS[variant].keys) assert.ok(ls[0].text.includes(BS.bs(key, lg).replace(/\u00A0/g, ' ')), lg + ' ' + key);
    }
  }
  // the light ground takes its rule
  assert.match(E._gateBandHtml('D', null, TZ, false, true), /^<div class="g8-band g8-band-solo g8-band-light"/);
  assert.match(E._gateBandHtml('D', { carrier: 'PD', min: 10, kind: 'gateCloses', ts: DEP - 10 * MIN }, TZ, false, true), /^<div class="g8-band g8-band-light"/);
});

test('the band\'s words are in the store, all nine languages, their sources recorded, the clock words with their time', () => {
  for (const key of ['docsDomestic', 'docsPassOnly', 'docsPassport', 'docsPassportNexus', 'docsVisa', 'docsToCanada', 'closeAtGate', 'closeAtCutoff', 'closeAtBoarding', 'closeAtEnds', 'boardingCutoff', 'tickerBoardingCutoff']) {
    const e = BS.STR[key];
    assert.ok(e, key + ' is in the store');
    assert.deepEqual(LANGS.filter((l) => !e[l]), [], key + ' in all nine');
    for (const lg of LANGS) if (lg !== 'en') assert.notEqual(e[lg], e.en, key + ' ' + lg + ' is not English copied');
    assert.ok(e.$src && LANGS.every((l) => e.$src[l]), key + ' says where each language comes from');
    if (/^closeAt/.test(key)) for (const lg of LANGS) assert.equal(e[lg].split('{TIME}').length, 2, key + ' ' + lg + ' says the time once');
  }
  // WestJet's own words, English and French (westjet.com, en-ca and fr-ca)
  assert.equal(BS.bs('closeAtCutoff', 'en'), 'Boarding cut-off {TIME}');
  assert.equal(BS.bs('closeAtCutoff', 'fr'), 'Heure limite pour l’embarquement {TIME}');
  assert.equal(BS.STR.closeAtCutoff.$src.en, 'airline:WS');
  // the government's and CATSA's « carte d'embarquement », for every airline
  assert.match(BS.bs('docsDomestic', 'fr'), /carte d’embarquement/i);
  assert.doesNotMatch(BS.bs('docsDomestic', 'fr'), /accès à bord/);
  // no scheme's name that could go stale, and NEXUS only in its own line
  for (const key of ['docsDomestic', 'docsPassOnly', 'docsPassport', 'docsVisa']) {
    for (const lg of LANGS) assert.doesNotMatch(BS.bs(key, lg), /ESTA|ETIAS|eTA|AVE|NEXUS/, key + ' ' + lg);
  }
  // the visa line in the research's own words, every language (U2, B3 line 3)
  assert.deepEqual(LANGS.map((lg) => BS.bs('docsVisa', lg)), [
    'Visa or travel authorization if required', 'Visa ou autorisation de voyage, s’il y a lieu',
    'Visa o autorización de viaje, si corresponde', 'Visum oder Reisegenehmigung, falls erforderlich',
    'Visto o autorizzazione di viaggio, se richiesti', 'Visto ou autorização de viagem, se exigidos',
    '必要な方はビザまたは渡航認証', '如有需要：签证或电子旅行许可', 'تأشيرة أو تصريح سفر إلكتروني عند الاقتضاء'
  ]);
  // a flight to Canada: IRCC's line, in IRCC's name for the eTA in each
  // language (AVE in French and Portuguese; Spanish, German and Italian its
  // full name, as IRCC's own pages in those languages write it)
  assert.equal(BS.bs('docsToCanada', 'en'), 'Flying to Canada? Visa or eTA may apply');
  assert.equal(BS.bs('docsToCanada', 'fr'), 'Vol vers le Canada\u00A0: visa ou AVE, s’il y a lieu');
  assert.match(BS.bs('docsToCanada', 'pt'), /\bAVE\b/);
  assert.match(BS.bs('docsToCanada', 'es'), /Autorización Electrónica de Viaje/);
  assert.match(BS.bs('docsToCanada', 'de'), /elektronische Reisegenehmigung/);
  assert.match(BS.bs('docsToCanada', 'it'), /Autorizzazione elettronica di viaggio/);
  for (const lg of ['ja', 'zh', 'ar']) assert.match(BS.bs('docsToCanada', lg), /eTA/, lg);
  for (const lg of LANGS) assert.doesNotMatch(BS.bs('docsToCanada', lg), /ESTA|ETIAS|NEXUS/, 'docsToCanada ' + lg);
});

// ════════════════════════════════════════════════════════════════════════════
// NO "PHOTO ID" ANYWHERE
// ════════════════════════════════════════════════════════════════════════════

test('no language says "photo ID": the rule is government-issued ID (two non-photo IDs are legal)', () => {
  const PHOTO = /photo|foto|Lichtbild|写真|照片|صورة/i;
  for (const lg of LANGS) {
    assert.doesNotMatch(BS.bs('photoId', lg), PHOTO, 'photoId ' + lg + ': ' + BS.bs('photoId', lg));
    assert.doesNotMatch(BS.bs('docsDomestic', lg), PHOTO, 'docsDomestic ' + lg);
  }
  // and every language says government-issued
  const GOV = { en: /government-issued/, fr: /gouvernementale/, es: /oficial/, de: /amtlich/, it: /ufficiale/, pt: /oficial/, ja: /政府発行/, zh: /政府签发/, ar: /حكومية/ };
  for (const lg of LANGS) assert.match(BS.bs('photoId', lg), GOV[lg], 'photoId ' + lg);
  // nowhere in the store, and nowhere a passenger script or page writes it
  for (const [key, e] of Object.entries(BS.STR)) {
    for (const lg of LANGS) {
      const v = String(e[lg] || '');
      assert.doesNotMatch(v, /photo ID|photo identification|pièce d.identité avec photo|identificación con foto|Lichtbildausweis|documento con foto|identificação com foto|写真付き身分証|带照片的身份证|هوية تحمل صورة/i, key + ' ' + lg);
    }
  }
  const dir = path.join(root, 'fids-current');
  const files = [];
  for (const sub of ['js', '.', 'studio']) {
    for (const f of fs.readdirSync(path.join(dir, sub))) if (/\.(js|html)$/.test(f)) files.push(path.join(dir, sub, f));
  }
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /photo ID|identificación con foto|Lichtbildausweis|documento con foto|identificação com foto|写真付き身分証|带照片的身份证|هوية تحمل صورة/, path.relative(root, f));
  }
});

// ════════════════════════════════════════════════════════════════════════════
// THE SCREEN: WHERE IT GOES, WHAT IT REPLACES, THE ROOM IT TAKES, ITS COLOURS
// ════════════════════════════════════════════════════════════════════════════

test('the band goes under NOW BOARDING and under FINAL CALL, never the countdown or GATE CLOSED; the strip note is gone', () => {
  const uxg = fn('uxgGateHtml');
  assert.match(uxg, /function _boardBandHtml\(\) \{\s*try \{\s*var _bInfo = _gateCloseBandInfo\(currentFlight, airlineCode, _bt\.effDepForBoard, Date\.now\(\), iata, _bt\.boardTs, _door\.kept\);/);
  assert.match(uxg, /return _gateBandHtml\(_gateDocsVariant\(currentFlight, iata, airlineCode\), _bInfo, tz, _frF, _rc2Contrast\(_bPair\.ink, '#FFFFFF'\) >= 3\);/);
  assert.equal((uxg.match(/\+ _boardBandHtml\(\)/g) || []).length, 2, 'boarding and the final call');
  assert.match(uxg, /\+ _boardWelcomeStripHtml\('boarding'\)\s*\+ _boardBandHtml\(\)/);
  const closed = uxg.slice(uxg.indexOf("finalHtml = '<div class=\"g8-final active g8-final-closed\">'"), uxg.indexOf('} else {', uxg.indexOf("finalHtml = '<div class=\"g8-final active g8-final-closed\">'")));
  assert.doesNotMatch(closed, /_boardBandHtml/, 'GATE CLOSED carries no band');
  const cd = uxg.slice(uxg.indexOf("countdownHtml = '<div class=\"g8-countdown\">'"), uxg.indexOf('// Determine which row4 content to show'));
  assert.doesNotMatch(cd, /_boardBandHtml/, 'the countdown carries no band');
  assert.doesNotMatch(uxg, /_pdIdNote|g8-bw-note/, "Porter's strip note moved into the band");
  // the idle card's footer still says it only before any sign (unchanged)
  assert.match(uxg, /if \(!showBoarding && !showCountdown && !isFinalCallStatus && !isGateClosedStatus && !inbDelayed && !_door\.word\) \{\s*try \{ _gateClose = _gateCloseInfo\(/);
});

test('the band takes only the room the sign leaves, and the sign keeps every size', () => {
  const room = fn('_g8BandRoom');
  // the room is the band plus the least empty space of any column: the same
  // whatever height the band has, so the fit settles at once
  assert.match(room, /var base = band\.getBoundingClientRect\(\)\.height \+ minFree - given;/);
  // auto margins are the empty space; any other margin is needed
  assert.match(room, /if \(!\(tm && tm\.value === 'auto'\)\) need \+= parseFloat\(ccs\.marginTop\) \|\| 0;/);
  assert.match(room, /ccs\.position === 'absolute'/, 'the discs and the Next line are out of the flow');
  // the sign's top padding gives up to 2.4vh first; no font on the sign changes
  assert.match(room, /var give = Math\.max\(0, Math\.min\(want - base, \(pad0 < Infinity \? pad0 : 3\.2 \* vh\) - 0\.8 \* vh\)\);/);
  assert.doesNotMatch(room, /font-size|fontSize/, 'the sign keeps every size');
  const lineRoom = fn('_g8BandLineRoom');
  assert.match(lineRoom, /return Math\.max\(1, \(room - padV - breath\) \/ Math\.max\(1, lns\.length\)\);/);
  // a portrait board's stacked halves share the room by their lines
  assert.match(lineRoom, /if \(_g8BandStacked\(band\)\) room = room \* lns\.length \/ Math\.max\(1, band\.querySelectorAll\('\.g8-band-ln'\)\.length\);/);
  assert.match(fn('_g8BandStacked'), /getComputedStyle\(band\)\.flexDirection === 'column'/);
  // the band's lines are the shared fitter's, to that room, each HALF at one
  // size of its own: the documents never make the close time smaller (v24006
  // grouped the whole band, and an international flight at 1280x720 put the
  // close time at the 12px floor beside 470px of its own half left empty)
  const rules = CORE.slice(CORE.indexOf('var FIDS_FIT_RULES = ['), CORE.indexOf('\n];', CORE.indexOf('var FIDS_FIT_RULES = [')));
  assert.match(rules, /\{ sel: '\.g8-band \.g8-band-ln', box: '\.g8-band-tx', lines: 2, units: true, group: '\.g8-band-half', h: function \(el\) \{ return _g8BandLineRoom\(el\); \} \},/);
  assert.doesNotMatch(rules, /group: '\.g8-band'[,\s]/, 'never one size across the two halves');
  assert.doesNotMatch(rules, /g8-bw-note/);
  // and the group is taken per element the rule names (fidsFitAll: the
  // smallest of one group's lines, one group per half)
  const fitAll = fn('fidsFitAll');
  assert.match(fitAll, /var g = els\[j\]\.closest\(r\.group\);/);
  // ONE LAYOUT FOR EVERY LANGUAGE: where one language's two facts take two
  // lines, every language's do, broken at the same place (between the facts)
  assert.match(fitAll, /try \{ _g8BandOneLayout\(scope\); \} catch \(eB\) \{\}/);
  assert.ok(fitAll.indexOf('_g8BandOneLayout(scope)') > fitAll.indexOf('groups[gk].els'), 'after the group has its one size');
  const one = fn('_g8BandOneLayout');
  assert.match(one, /querySelectorAll\('\.g8-band\.g8-band-tall \.g8-band-docs'\)/);
  assert.match(one, /if \(ln\.classList\.contains\('fx-wrap'\)\) \{ if \(mine\) ln\.classList\.remove\('g8-band-brk'\); continue; \}/, "a line the fitter broke keeps the fitter's marks");
  assert.match(one, /seps\[k\]\.classList\.add\('fx-brk-off'\)/, 'the break is at the dot between two whole facts');
  assert.doesNotMatch(one, /fx-loose|white-space', 'normal/, 'never inside a phrase');
  // the forced break is the shared one (.fx-brk-off: the dot hidden, the next
  // whole phrase on a new line)
  const ALL = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
  assert.match(ALL, /\.fx-brk\.fx-brk-off \+ :is\(\.ap-name, \.fx-unit\)::before \{ content: "\\A"; white-space: pre; \}/);
});

test('the colours: the lower panel\'s pair, every word on it at 4.5:1 or better, nothing that moves', () => {
  const a = CSS.indexOf("v24006 — THE BOARDING SCREEN'S BAND, IN THE AIRLINE'S OWN COLOURS.");
  assert.ok(a > 0, 'the block exists');
  const band = CSS.slice(CSS.lastIndexOf('/*', a));
  const rulesOnly = band.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sel of rulesOnly.match(/^html body[^{]+\{/gm)) assert.ok((sel.match(/:not\(#_\)/g) || []).length >= 16, sel.slice(0, 60));
  assert.match(rulesOnly, /\.g8-band \.g8-band-docs \{\s*background: var\(--rc2-a, #0c1119\) !important;\s*color: var\(--rc2-a-ink, #ffffff\) !important;/);
  assert.match(rulesOnly, /\.g8-band \.g8-band-close \{\s*background: var\(--rc2-b, #0c1119\) !important;\s*color: #ffffff !important;/);
  assert.match(rulesOnly, /\.g8-band \{[^}]*min-height: min\(9\.5vh, 8\.8vw, var\(--g8-band-room, 9\.5vh\)\) !important;/, "the mockup's 9.5vh where the sign leaves it");
  // a portrait board stacks the halves, each across the band's whole width
  const portrait = rulesOnly.slice(rulesOnly.indexOf('@media (orientation: portrait) {'));
  assert.ok(rulesOnly.indexOf('@media (orientation: portrait) {') > 0, 'the portrait block');
  assert.match(portrait, /\.g8-band \{\s*flex-direction: column !important;/);
  assert.match(portrait, /\.g8-band \.g8-band-half \{\s*flex: 0 0 auto !important;\s*min-height: min\(9\.5vh, 8\.8vw\) !important;/);
  // a band with no close time is the documents alone: one half, which fills it
  assert.match(rulesOnly, /\.g8-band \.g8-band-half \{[^}]*flex: 1 1 0 !important;/);
  assert.doesNotMatch(rulesOnly, /animation|transition|@keyframes|opacity: 0[;\s]/, 'static');
  assert.doesNotMatch(rulesOnly, /#c2410c|#f59e0b|#fbbf24|#dc2626|#ef4444|#22c55e|#16a34a|#34d399/i, 'no status colour');
  // the house rule: a vh length always beside a width term
  for (const m of rulesOnly.matchAll(/(?:min|max|clamp)\([^;]*?vh[^;]*?\)/g)) assert.match(m[0], /vw/, m[0]);
  assert.doesNotMatch(rulesOnly.replace(/(?:min|max|clamp)\([^;]*?\)/g, ''), /\d(?:\.\d+)?vh/, 'no bare vh');
  // every pair: the documents' ink on the first colour, white on the second
  const RC2_SRC = (() => {
    const s = CORE.indexOf('var RC2_STATUS = {');
    const p = fn('_rc2Pair');
    return CORE.slice(s, CORE.indexOf(p, s) + p.length);
  })();
  const RC2 = vm.runInNewContext(RC2_SRC + '\n({ RC2_PAIRS, _rc2Pair, _rc2Contrast });', { window: {} });
  const seen = [];
  for (const code of Object.keys(RC2.RC2_PAIRS)) {
    const p = RC2._rc2Pair(code, { accent: {}, brand: {}, colors: {} });
    const inkA = RC2._rc2Contrast(p.ink, p.a), whiteB = RC2._rc2Contrast('#FFFFFF', p.b);
    assert.ok(inkA >= 4.5, code + ': ink on the first colour ' + inkA.toFixed(2));
    assert.ok(whiteB >= 4.5, code + ': white on the second colour ' + whiteB.toFixed(2));
    seen.push(code);
  }
  for (const c of ['AC', 'WS', 'PD', 'F8', 'PB', 'TS', 'AA', 'DL', 'UA']) assert.ok(seen.includes(c), c);
  // the named pairs, as approved
  const pair = (c) => JSON.parse(JSON.stringify(RC2._rc2Pair(c)));
  assert.deepEqual(pair('AC'), { a: '#A6192E', ink: '#FFFFFF', b: '#0B0D10' }, 'Air Canada: deep red over black');
  assert.deepEqual(pair('PD'), { a: '#EFE8DA', ink: '#152C53', b: '#152C53' }, 'Porter: cream with navy type over navy');
  assert.deepEqual(pair('WS'), { a: '#00B2A9', ink: '#002B55', b: '#003366' }, 'WestJet: teal with navy type (white on the teal is 2.64:1)');
  assert.deepEqual(pair('F8'), { a: '#F2F4F7', ink: '#1C1C1C', b: '#1C1C1C' }, 'Flair: white with black type over its black');
  assert.ok(RC2._rc2Contrast('#FFFFFF', '#00B2A9') < 3, 'white type on the teal would not read');
});
