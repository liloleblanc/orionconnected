'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24005 — THE BAGGAGE BOARD SAYS ONLY WHAT A FEED SAYS.
//
// Two ways the belt screens misled a passenger, both measured on the live
// board at v24001:
//
//  1. A made-up belt. When a feed published no belt, every arrival was put on
//     "Baggage claim 1" at any airport outside an eleven-airport list: all 17
//     of Halifax's, and Detroit's 256 on "belt 1, page 2 of 26". Nobody
//     published that 1. A flight with no belt in its feed now has none
//     (null); it is listed on the hall's own "to be announced" screen, whose
//     carousel cell reads the store's words and which has no belt sign. A
//     flight whose feed did publish a belt the board cannot place (a bare
//     number at a multi-terminal airport) is on no screen, as before: "to be
//     announced" would be untrue of it.
//     Moncton's domestic 1 / international 2 is our own mapping, kept as it
//     is (an open question, not a fix).
//
//  2. Status colours on ordinary rows. The belt bars are coloured by an
//     airport-hash + belt rotation, and thirteen of its twenty gradients were
//     red, orange or green: Ottawa's belt 5 put every on-time arrival on a
//     pure red bar (read: Cancelled), belt 4 every row on a green one (read:
//     Arrived). A plain bar now never wears red, amber or green; those are
//     the Delayed, Cancelled and Diverted bars' and the status words' alone.
//     The belt sign's own surfaces (band, body, suitcase) are held to the same
//     rule on every belt but 1, whose sign is the approved mock (red band,
//     marigold disc) and is kept exactly; the warm discs that carry that
//     mock's marigold onto belts 4, 7 and 8 are kept too.
//
// And, while there: a Delayed row says until when, when the feed says it,
// with the word at the size every other pill's word has.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const BS = require(path.join(ROOT, 'fids-current', 'js', 'board-strings.js'));

// A function from fids-core.js, by name, brace-matched (comments and strings
// inside these small helpers hold no braces).
function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must define ${name}`);
  const i = SRC.indexOf('{', at);
  let depth = 0;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}' && --depth === 0) return SRC.slice(at, k + 1);
  }
  assert.fail(`could not brace-match ${name}`);
}
// An array or block literal starting at `from`, skipping strings and comments.
function closeAt(src, from, open, close) {
  let depth = 0, line = false, block = false, quote = '';
  for (let i = from; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  return -1;
}

// ── 1. THE BELT A FLIGHT IS ON ─────────────────────────────────────────────

// The belt rules from mapADB, run as they are: the airport sets, the feed's
// belt, and the arrivals branch that turns them into f._belt.
const BELT_RULES = (() => {
  const a = SRC.indexOf('    const _MULTI_TERMINAL_AIRPORTS = new Set([');
  const b = SRC.indexOf("    if (mode === 'arr') {", a);
  assert.ok(a > 0 && b > a, 'the belt rules must still be where mapADB builds a row');
  const end = closeAt(SRC, SRC.indexOf('{', b), '{', '}');
  assert.ok(end > b, 'could not close the arrivals belt branch');
  return SRC.slice(a, end + 1);
})();
const CITY_TYPE_SRC = (() => {
  const a = SRC.indexOf('const CITY_TYPE = {');
  return SRC.slice(a, closeAt(SRC, SRC.indexOf('{', a), '{', '}') + 1) + ';';
})();
function rowFor(ap, { belt = null, terminal = '', airline = 'AC', from = 'YYZ' } = {}) {
  const run = new Function('f', 'mode', 'airline', 'locIata', 'terminal', 'document',
    CITY_TYPE_SRC + '\n' + BELT_RULES + '\nreturn { _belt, _beltUnplaced };');
  return run({ arrival: { baggageBelt: belt } }, 'arr', airline, from, terminal,
    { getElementById: () => ({ value: ap }) });
}
const beltFor = (ap, o) => rowFor(ap, o)._belt;

test('a feed with no belt gives no belt: never "1"', () => {
  // The 24 airports the audit found sending every arrival to belt 1, among
  // them Halifax (17 of 17) and Detroit (256 of 256), and the feeds the
  // single-terminal rule reached.
  for (const ap of ['YHZ', 'DTW', 'DEN', 'HBA', 'MSP', 'PHL', 'RDU', 'SLC', 'SYD', 'YFC', 'YHM',
    'YMM', 'YQR', 'YSJ', 'YXE', 'YXX', 'YYJ', 'YYT', 'ZRH', 'DUB', 'YOW', 'BOS']) {
    assert.equal(beltFor(ap), null, `${ap}: a flight its feed gives no belt was put on belt ${beltFor(ap)}`);
  }
  // and the multi-terminal airports, as before
  for (const ap of ['YYZ', 'ORD', 'MCO', 'JFK']) assert.equal(beltFor(ap), null, ap);
});

test('a belt the feed publishes is shown as published', () => {
  assert.equal(beltFor('YOW', { belt: '4' }), '4');
  assert.equal(beltFor('YOW', { belt: 5 }), '5');
  assert.equal(beltFor('BOS', { belt: '1', terminal: 'A' }), 'A-1', 'a terminal keeps its belts apart');
  assert.equal(beltFor('YYC', { belt: '300', terminal: 'D' }), 'D-300');
  assert.equal(beltFor('YUL', { belt: '20' }), '20', "Montréal's own feed numbers its whole hall");
  assert.equal(beltFor('ORD', { belt: '7' }), null, 'a bare belt at a multi-terminal airport is still not trusted');
  // a feed's word for "no belt" is not a belt (Boston's feed sends "None")
  for (const w of ['None', 'none', 'TBA', 'N/A', '-', '—', ' ']) {
    assert.equal(beltFor('BOS', { belt: w, terminal: 'A' }), null, `"${w}" is not a belt`);
  }
  assert.equal(beltFor('BOS', { belt: 'INTL', terminal: 'A' }), 'A-INTL', "Boston's international claim keeps its name");
});

test("Moncton's domestic 1 / international 2 is untouched (our own mapping, an open question)", () => {
  assert.equal(beltFor('YQM', { from: 'YYZ', airline: 'AC' }), '1');
  assert.equal(beltFor('YQM', { from: 'YHU', airline: 'PD' }), '1', 'any Canadian Y-code is domestic');
  assert.equal(beltFor('YQM', { from: 'MCO', airline: 'WS' }), '2', 'a US origin clears customs: international');
  assert.equal(beltFor('YQM', { from: 'YYZ', airline: 'TS' }), '2', 'Air Transat sun flights: international');
  assert.equal(beltFor('YQM', { from: 'YYZ', airline: 'AC', belt: '4' }), '1', "the feed's phantom belts are still overridden");
  // and it is the only belt the code writes by itself
  const literal = [...BELT_RULES.matchAll(/_belt = ([^;]+);/g)].map((m) => m[1].trim());
  for (const rhs of literal) {
    assert.doesNotMatch(rhs.replace(/_isIntl \? '2' : '1'/, ''), /'\d+'/,
      `"_belt = ${rhs}" writes a belt number no feed sent`);
  }
});

const BIDS_UNASSIGNED = '—';
const onScreen = new Function('BIDS_UNASSIGNED', lift('_bidsUnassigned') + '\n' + lift('_bidsOnScreen') + '\nreturn _bidsOnScreen;')(BIDS_UNASSIGNED);

test('a flight with no belt is listed on the hall\'s "to be announced" screen, and on no belt', () => {
  const none = { flight: 'AC2048', _belt: null };
  const four = { flight: 'AC1946', _belt: '4' };
  assert.equal(onScreen(none, BIDS_UNASSIGNED), true);
  assert.equal(onScreen(none, '1'), false, 'never on belt 1');
  assert.equal(onScreen(four, '4'), true);
  assert.equal(onScreen(four, BIDS_UNASSIGNED), false, 'a flight with a belt is on its belt only');
  assert.equal(onScreen(four, '1'), false);
  // the screen list: the real belts first, then the "to be announced" screen
  const upd = lift('updateSubScreens');
  assert.match(upd, /if \(flights\.some\(_bidsUnassigned\)\) locations\.push\(BIDS_UNASSIGNED\);/);
  assert.ok(upd.indexOf("_apBagSel.value === 'YQM'") > 0 && upd.indexOf("_apBagSel.value === 'YQM'") < upd.indexOf('locations.push(BIDS_UNASSIGNED)'),
    "it is added after Moncton's two belts are settled");
  assert.ok(['1', '4', 'A-1', 'D-300'].every((b) => [b, BIDS_UNASSIGNED].sort()[0] === b),
    'the "to be announced" key sorts after every real belt, so a hall with belts opens on one');
  // every reader of a belt's flights asks the same rule
  const key = SRC.slice(SRC.indexOf('function getDedicatedRenderKey('), SRC.indexOf('function _bidsOnScreen('));
  assert.match(key, /\.filter\(f => _bidsOnScreen\(f, subScreenVal\)/, 'the render key');
  assert.match(SRC, /const arrFlights = \(data\.arr \|\| \[\]\)\.filter\(f =>\s*_bidsOnScreen\(f, subScreenVal\) && _bidsInWindow\(f, Date\.now\(\)\)\);/, 'the renderer');
});

test('an announced belt the board cannot place is on no screen, not "to be announced"', () => {
  // At the multi-terminal airports a bare belt with no terminal is not
  // trusted (belt 7 of which terminal?). Before v24005 such a flight was on
  // no screen; the "to be announced" list must not take it, because its feed
  // did announce a belt.
  const unAt = new Function('BIDS_UNASSIGNED', lift('_bidsUnassigned') + '\nreturn _bidsUnassigned;')(BIDS_UNASSIGNED);
  const onS = new Function('BIDS_UNASSIGNED', '_bidsUnassigned', lift('_bidsOnScreen') + '\nreturn _bidsOnScreen;')(BIDS_UNASSIGNED, unAt);
  for (const ap of ['ORD', 'JFK', 'LHR', 'TPA', 'YYZ']) {
    const r = rowFor(ap, { belt: '7' });
    assert.equal(r._belt, null, ap);
    assert.equal(r._beltUnplaced, true, `${ap}: the feed's belt 7 is marked as announced, not missing`);
    const row = { flight: 'XX1', ...r };
    assert.equal(onS(row, BIDS_UNASSIGNED), false, `${ap}: listed as "to be announced" though its feed announced belt 7`);
    assert.equal(onS(row, '7'), false, `${ap}: put on a bare belt 7 with no terminal`);
  }
  // with its terminal it is placed; with no belt at all it is "to be announced"
  assert.deepEqual(rowFor('ORD', { belt: '7', terminal: '3' }), { _belt: '3-7', _beltUnplaced: false });
  const none = rowFor('ORD');
  assert.deepEqual(none, { _belt: null, _beltUnplaced: false });
  assert.equal(onS({ flight: 'XX2', ...none }, BIDS_UNASSIGNED), true);
  // and the native-feed airports keep their whole-hall numbers
  assert.deepEqual(rowFor('YUL', { belt: '20' }), { _belt: '20', _beltUnplaced: false });
  // the row carries the mark, and the screen list and the belt walk read it
  assert.match(SRC, /_actualArrTime,_belt,_beltUnplaced,_checkIn,/);
  assert.match(lift('updateSubScreens'), /if \(flights\.some\(_bidsUnassigned\)\) locations\.push\(BIDS_UNASSIGNED\);/);
  assert.match(lift('bagBelts'), /list\.filter\(function \(f\) \{ return f && !f\._beltUnplaced; \}\)/);
});

test('the "to be announced" key survives the sub-screen sanitizer, and markup still does not', () => {
  const safe = new Function(lift('_fidsSafeSub') + '\nreturn _fidsSafeSub;')();
  assert.equal(safe(BIDS_UNASSIGNED), BIDS_UNASSIGNED, 'stripped, the screen\'s key became "" and it listed nobody');
  assert.equal(safe('A-1'), 'A-1');
  assert.equal(safe('<img src=x onerror=alert(1)>'), 'img srcx onerroralert1');
  assert.equal(safe('"4"&'), '4');
});

test('the belt walk visits the "to be announced" screen last, and a hall with no belts does not walk', () => {
  const NOW = 1_757_400_000_000;
  const mk = (belt, mins) => ({ _belt: belt, _sortTs: NOW + mins * 60000 });
  const walk = (arr, ap = 'YHZ') => new Function('data', 'document', '_bidsInWindow', 'Date',
    lift('bagBelts') + '\nreturn bagBelts();')(
    { arr }, { getElementById: () => ({ value: ap }) },
    (f, nowTs) => f._sortTs >= nowTs - 45 * 60000 && f._sortTs <= nowTs + 60 * 60000,
    { now: () => NOW });
  assert.deepEqual(walk([mk(null, 10), mk(null, 20)]), ['—'], 'Halifax: one screen, nothing to cycle');
  assert.deepEqual(walk([mk('3', 10), mk(null, 5), mk('1', 20)], 'BOS'), ['1', '3', '—']);
  assert.deepEqual(walk([mk('1', 10), mk('2', 400)], 'YQM'), ['1', '2'], 'Moncton walks its two belts as before');
});

test('the "to be announced" screen claims no number: no sign, the store\'s words in the carousel cell', () => {
  assert.match(SRC, /\$\{\(function\(\)\{\n\s*\/\/ v24005 — the hall's "to be announced" list[^\n]*\n[^\n]*\n\s*if \(_bidsTba && _bidsV3On\) return '';/,
    'the belt sign is not drawn on the list');
  assert.match(SRC, /const _bidsTba = subScreenVal === BIDS_UNASSIGNED;/);
  assert.match(SRC, /var _bidsTbaHtml = _bidsTba\n\s*\? BoardStrings\.pair\('beltTba', \{ langs: langs, frFirst: iata, cls: 'fx-unit', sep: ' <span class="bs-sep fx-brk">\|<\/span> ' \}\)/,
    "the cell is the store's pair, French first in Québec");
  assert.match(SRC, /\$\{_bidsTba \? '<div class="b3-belt">' \+ _bidsTbaHtml \+ '<\/div>' : ''\}/);
  assert.match(SRC, /<div class="b3-h-belt">\$\{_bidsHdr\('carousel'\)\}<\/div>/, 'its column is titled in both languages');
  // the store holds the words in all nine languages
  const e = BS.STR.beltTba;
  assert.ok(e, 'the store must hold beltTba');
  for (const l of BS.LANGS) assert.ok(typeof e[l] === 'string' && e[l].trim(), `beltTba.${l}`);
  assert.equal(e.en, 'To be announced');
  assert.equal(e.fr, 'À venir');
  assert.equal(BS.pair('beltTba', { langs: ['en', 'fr'], plain: true }), 'To be announced | À venir');
  assert.equal(BS.pair('beltTba', { langs: ['en', 'fr'], frFirst: 'YUL', plain: true }), 'À venir | To be announced');
  // and the phone says it too, never a dash where the number would be
  assert.match(lift('renderMobileBaggageHtml'), /\(subScreenVal === BIDS_UNASSIGNED\)\n\s*\? '<div[^\n]*fidsEscHtml\(BoardStrings\.bs\('beltTba', lang\)\)/);
  // the list across the body, inside the flat block the b3 surface belongs to
  assert.match(CSS, /:not\(#_\) \.bidsv3 \.bidsv2-body\.bids-tba \{\n  grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(CSS, /:not\(#_\) \.bidsv3 \.bidsv2-body\.bids-tba \.bidsv2-flight-list \{\n  grid-column: 1 \/ -1 !important;/);
  assert.match(SRC, /\{ sel: '\.bidsv3 \.b3-belt', lines: 2, units: true,/, 'the cell is fitted, never cut');
});

test('the page count is counted in the rows that fit, so a second page is never hidden', () => {
  // On a 1080 belt six rows were fitted and "Page 1 / 2" went under the list's
  // clipped edge: nothing said there was a second page of arrivals.
  assert.match(SRC, /const _pg = bView\.querySelector\('\.bidsv2-page-indicator'\);\n\s*const _pgH = \(_pg && _pg\.offsetHeight\) \? _pg\.offsetHeight \+ _rowGap : 0;\n\s*const _avail = _listH - _listPad - _headerH - _pgH - 8;/);
  // the list's column titles are counted too, and the list keeps its own fit
  assert.match(SRC, /const _header = bView\.querySelector\('\.b3-head'\) \|\| bView\.querySelector\('\.bidsv2-list-header'\);/);
  assert.match(SRC, /const _BF = _bidsTba \? _BIDS_FIT_TBA : _BIDS_FIT;/);
});

// ── 2. NO STATUS COLOUR ON A ROW WITHOUT A STATUS ──────────────────────────

const HUE = new Function(lift('_bidsIsStatusHue') + '\n' + lift('_bidsBarIsStatusColour') + '\nreturn { hue: _bidsIsStatusHue, bar: _bidsBarIsStatusColour };')();
const ACCENTS = (() => {
  const at = SRC.indexOf('var _bidsAccents = [');
  assert.ok(at > 0, 'the belt bar table must exist');
  const from = SRC.indexOf('[', at);
  return new Function('return ' + SRC.slice(from, closeAt(SRC, from, '[', ']') + 1) + ';')();
})();
const TBA_BAR = /var BIDS_TBA_BAR = '([^']+)';/.exec(SRC)[1];
const AIRPORTS = (() => {
  const a = SRC.indexOf('const AP = {');
  const body = SRC.slice(a, closeAt(SRC, SRC.indexOf('{', a), '{', '}'));
  return [...new Set([...body.matchAll(/^\s{2}([A-Z0-9]{3}):\s*\{/gm)].map((m) => m[1]))];
})();
// the renderer's own pick: the airport hash and the belt number
const HASH = new Function('iata', (() => {
  const l = /var _bidsApHash = 0;\n\s*try \{ var _apStr[^\n]*\n/.exec(SRC);
  assert.ok(l, 'the airport hash line must still exist');
  return l[0] + 'return _bidsApHash;';
})());
function barFor(ap, belt) {
  return ACCENTS[(HASH(ap) + Math.max(1, belt) - 1) % ACCENTS.length].bar;
}

test('the status colours are recognised for what they are', () => {
  for (const c of ['rgb(254,19,1)', 'rgb(1,154,1)', 'rgb(243,110,49)', 'rgb(236,80,3)', 'rgb(248,58,28)',
    'rgb(60,120,101)', 'rgb(65,122,104)', 'rgb(217,32,121)', '#a82633', '#d05560', '#EDBB00', '#157A43', '#B3261E',
    // a hot pink a few degrees off red (325°) is taken for red, and teal for green
    'rgb(229,18,142)', '#2F8F8E', '#0F4C50']) {
    assert.equal(HUE.bar(c), true, `${c} is a status colour`);
  }
  for (const c of ['rgb(79,164,218)', 'rgb(42,47,84)', 'rgb(75,7,177)', 'rgb(222,1,222)', 'rgb(39,105,233)',
    'rgb(169,65,153)', 'rgb(0,0,0)', '#0d2a52', '#16283C', '#ffffff']) {
    assert.equal(HUE.bar(c), false, `${c} is not a status colour`);
  }
});

test('no belt bar at any airport wears red, amber or green', () => {
  assert.equal(ACCENTS.length, 20);
  for (const [i, a] of ACCENTS.entries()) {
    assert.equal(HUE.bar(a.bar), false, `entry ${i + 1} is a status colour: ${a.bar}`);
    // belts step through the table, so neighbours are neighbouring belts
    assert.notEqual(a.bar, ACCENTS[(i + 1) % ACCENTS.length].bar, `entries ${i + 1} and ${(i + 1) % 20 + 1} are alike`);
  }
  // six of the seven bars that were already clear of the status hues are
  // untouched; the seventh, entry 4, started on a hot pink (325°) and now
  // starts on a magenta (310°) into its own orchid
  const KEPT = {
    3: 'linear-gradient(100deg,rgb(42,47,84) 0%,rgb(79,164,218) 100%)',
    4: 'linear-gradient(100deg,rgb(205,22,175) 0%,rgb(169,65,153) 100%)',
    5: 'linear-gradient(100deg,rgb(150,9,136) 0%,rgb(185,12,129) 100%)',
    6: 'linear-gradient(100deg,rgb(59,5,149) 0%,rgb(75,7,177) 100%)',
    15: 'linear-gradient(100deg,rgb(155,1,155) 0%,rgb(222,1,222) 100%)',
    16: 'linear-gradient(100deg,rgb(0,0,0) 0%,rgb(65,22,80) 100%)',
    20: 'linear-gradient(100deg,rgb(49,70,237) 0%,rgb(39,105,233) 100%)',
  };
  for (const [n, bar] of Object.entries(KEPT)) assert.equal(ACCENTS[n - 1].bar, bar, `entry ${n} must be as it was`);
  // and the two that were the photographs' red and green are gone
  assert.ok(!ACCENTS.some((a) => /rgb\(254,19,1\)|rgb\(1,154,1\)/.test(a.bar)), 'the pure red and pure green bars');
  assert.ok(AIRPORTS.length > 50, `found ${AIRPORTS.length} airports`);
  for (const ap of AIRPORTS) {
    for (let belt = 1; belt <= 40; belt++) {
      assert.equal(HUE.bar(barFor(ap, belt)), false, `${ap} belt ${belt}: ${barFor(ap, belt)}`);
    }
    // neighbouring belts still differ
    assert.notEqual(barFor(ap, 1), barFor(ap, 2), `${ap}: belts 1 and 2 share a colour`);
  }
  // the two belts the audit photographed
  for (const b of [4, 5]) assert.equal(HUE.bar(barFor('YOW', b)), false, `Ottawa belt ${b}`);
  assert.equal(HUE.bar(TBA_BAR), false, 'the "to be announced" list is dark navy');
  // and the renderer never paints one, whatever the table holds
  assert.match(SRC, /var _bidsAcc = _bidsAccents\[\(_bidsApHash \+ Math\.max\(1, _bidsBeltNo\) - 1\) % _bidsAccents\.length\];\n\s*if \(_bidsTba \|\| _bidsBarIsStatusColour\(_bidsAcc\.bar\)\) _bidsAcc = \{ img: _bidsAcc\.img, ground: _bidsAcc\.ground, bar: BIDS_TBA_BAR, tint: _bidsAcc\.tint \};/);
});

test("the belt sign's surfaces wear no status colour, except belt 1's approved mock", () => {
  const at = SRC.indexOf('var _BIDS_CARD_PALETTES = [');
  assert.ok(at > 0, 'the sign palette table must exist');
  const from = SRC.indexOf('[', at);
  const P = new Function('return ' + SRC.slice(from, closeAt(SRC, from, '[', ']') + 1) + ';')();
  assert.equal(P.length, 8);
  // belt 1 is the approved mock, exactly (tests/bids-flat.test.js holds it)
  assert.equal(P[0].band, '#8A1C2B');
  for (const [i, p] of P.entries()) {
    if (i === 0) continue;
    // the band, the body and the suitcase are the sign; the handle and the
    // number's ink sit on them. The disc and its dots carry the mock's
    // marigold disc (belts 4, 7 and 8 keep their warm ones).
    for (const k of ['band', 'body', 'suitcase', 'handle', 'ink']) {
      assert.equal(HUE.bar(p[k]), false, `belt ${i + 1}'s sign ${k} is a status colour: ${p[k]}`);
    }
  }
  // the three that were green, teal and rust are clear all through, disc
  // included: Ottawa's belt 5 sign was teal
  for (const n of [3, 5, 6]) {
    for (const [k, v] of Object.entries(P[n - 1])) assert.equal(HUE.bar(v), false, `belt ${n}'s sign ${k}: ${v}`);
  }
  for (const old of ['#1E4D2B', '#4F9A5E', '#0F4C50', '#2F8F8E', '#6E2A0E', '#C9683B']) {
    assert.ok(!P.some((p) => p.band === old || p.body === old), `${old} (forest, teal or rust) is still a sign colour`);
  }
  // neighbouring belts' signs still differ
  for (let i = 0; i < P.length; i++) assert.notEqual(P[i].body, P[(i + 1) % P.length].body);
});

test('only the Delayed, Cancelled and Diverted bars are painted in a status colour', () => {
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  let seen = 0;
  for (const chunk of rules.split('}')) {
    const brace = chunk.lastIndexOf('{');
    if (brace < 0) continue;
    const sel = chunk.slice(0, brace).trim(), body = chunk.slice(brace + 1);
    if (sel.indexOf('.b3-row') < 0 || !/background/.test(body)) continue;
    seen++;
    const status = /\.b3-(delayed|cancelled|diverted)\b/.test(sel);
    const bg = (/background[^;]*;/.exec(body) || [''])[0];
    if (!status) assert.equal(HUE.bar(bg), false, `"${sel}" paints a plain row in a status colour: ${bg}`);
  }
  assert.ok(seen >= 3, 'the b3 bar rules must still be found');
  // the plain bar reads the belt's colour, with a blue fallback
  assert.match(rules, /\.bidsv3 \.b3-row \{[^}]*background: var\(--bids-bar-grad, linear-gradient\(100deg,#12417e,#2a6cc0,#6ea4e2\)\);/);
});

// ── 3. A DELAYED ROW SAYS UNTIL WHEN, WHEN THE FEED SAYS IT ────────────────

test('a Delayed row carries the feed\'s revised time beside the word, and no other row is given one', () => {
  assert.match(SRC, /const _b3StTimed = !!\(isDelayed && f\.upd && f\.upd !== f\.time\);\n\s*const _b3StHtml = _b3StTimed\n\s*\? '<span class="fx-unit">' \+ fidsEscHtml\(stTxt\) \+ '<\/span> <span class="b3-st-sep fx-brk">·<\/span> <span class="fx-unit b3-st-at">' \+ fidsEscHtml\(_bidsTimeForLang\(f\.upd\)\) \+ '<\/span>'\n\s*: fidsEscHtml\(stTxt\);/);
  // the time is the feed's (mapADB's upd: actual, else predicted, else revised)
  assert.match(SRC, /const revL=_actualL\|\|_predL\|\|_revisedL;/);
  assert.match(SRC, /const upd=\(revTs&&Math\.abs\(revTs-schedTs\)>5\*60000\)\?adbHHMM\(revL\):null;/);
  // a new time repaints the belt, and the pill is fitted, never cut
  const key = SRC.slice(SRC.indexOf('function getDedicatedRenderKey('), SRC.indexOf('function _bidsUnassigned('));
  assert.match(key, /upd:f\.upd \|\| null/);
  assert.match(SRC, /\{ sel: '\.bidsv3 \.b3-status', lines: 2, units: true,/);
});

test('a Delayed pill with its time keeps the word at full size: stacked, not shrunk', () => {
  // On a Moncton belt 'Delayed · 8:34pm' was held on one line at 22.5px
  // (1920x1080; 19px seen on the live board) while every other pill's word
  // was 26px. A pill that carries a time is fitted with keep: 1, before the
  // general pill rule.
  const timed = SRC.indexOf("{ sel: '.bidsv3 .b3-status.b3-st-timed', lines: 2, units: true, keep: 1,");
  const plain = SRC.indexOf("{ sel: '.bidsv3 .b3-status', lines: 2, units: true,");
  assert.ok(timed > 0 && plain > timed, 'the timed pill rule must come first (an element is fitted by the first rule it matches)');
  assert.match(SRC, /<div class="b3-status \$\{_b3StCls\}\$\{_b3StTimed \? ' b3-st-timed' : ''\}">\$\{_b3StHtml\}<\/div>/);
  assert.match(SRC, /var res = _fxPlan\(base, floor, lines, hasSub, units, at, giveWay, o\.keep\);/);
  // the planner, run as it is: the word and the time fit on one line only at
  // 22.5px of a designed 26 (87%), and stacked at 26
  const plan = new Function(lift('_fxSearch') + '\n' + lift('_fxApMin') + '\n' + lift('_fxPlan') + '\nreturn _fxPlan;')();
  const fits = (oneMax, twoMax) => (px, wrap) => px <= (wrap ? twoMax : oneMax) + 1e-9;
  const was = plan(26, 14, 2, false, true, fits(22.5, 26));
  assert.equal(was.wrap, false, 'the default keeps a single line at 80% of the design or more');
  assert.ok(Math.abs(was.px - 22.5) < 0.3);
  const now = plan(26, 14, 2, false, true, fits(22.5, 26), undefined, 1);
  assert.deepEqual([now.wrap, Math.round(now.px)], [true, 26], 'keep: 1 stacks the word over the time at 26px');
  // one line is still kept when it holds the full size, or when stacking
  // would be no bigger
  assert.deepEqual(plan(26, 14, 2, false, true, fits(26, 26), undefined, 1), { px: 26, wrap: false });
  const tight = plan(26, 14, 2, false, true, fits(22, 20), undefined, 1);
  assert.equal(tight.wrap, false, 'a row too short to stack keeps the larger single line');
  // and every other fit keeps the old 80% rule
  assert.deepEqual([plan(28, 14, 2, false, false, fits(24, 27)).wrap, plan(28, 14, 2, false, false, fits(18, 27)).wrap], [false, true]);
});
