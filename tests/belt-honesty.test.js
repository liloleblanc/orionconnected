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
//     carousel cell reads the store's words and which has no belt sign.
//     Moncton's domestic 1 / international 2 is our own mapping, kept as it
//     is (a question for the airport, not a fix).
//
//  2. Status colours on ordinary rows. The belt bars are coloured by an
//     airport-hash + belt rotation, and nine of its twenty gradients were red,
//     orange or green: Ottawa's belt 5 put every on-time arrival on a pure red
//     bar (read: Cancelled), belt 4 every row on a green one (read: Arrived).
//     A plain bar now never wears red, amber or green; those are the Delayed,
//     Cancelled and Diverted bars' and the status words' alone.
//
// And, while there: a Delayed row says until when, when the feed says it.
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
function beltFor(ap, { belt = null, terminal = '', airline = 'AC', from = 'YYZ' } = {}) {
  const run = new Function('f', 'mode', 'airline', 'locIata', 'terminal', 'document',
    CITY_TYPE_SRC + '\n' + BELT_RULES + '\nreturn _belt;');
  return run({ arrival: { baggageBelt: belt } }, 'arr', airline, from, terminal,
    { getElementById: () => ({ value: ap }) });
}

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

test("Moncton's domestic 1 / international 2 is untouched (our mapping, asked of the owner)", () => {
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
const onScreen = new Function('BIDS_UNASSIGNED', lift('_bidsOnScreen') + '\nreturn _bidsOnScreen;')(BIDS_UNASSIGNED);

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
  assert.match(upd, /if \(flights\.some\(f => !f\._belt \|\| f\._belt === BIDS_UNASSIGNED\)\) locations\.push\(BIDS_UNASSIGNED\);/);
  assert.ok(upd.indexOf("_apBagSel.value === 'YQM'") > 0 && upd.indexOf("_apBagSel.value === 'YQM'") < upd.indexOf('locations.push(BIDS_UNASSIGNED)'),
    "it is added after Moncton's two belts are settled");
  assert.ok(['1', '4', 'A-1', 'D-300'].every((b) => [b, BIDS_UNASSIGNED].sort()[0] === b),
    'the "to be announced" key sorts after every real belt, so a hall with belts opens on one');
  // every reader of a belt's flights asks the same rule
  const key = SRC.slice(SRC.indexOf('function getDedicatedRenderKey('), SRC.indexOf('function _bidsOnScreen('));
  assert.match(key, /\.filter\(f => _bidsOnScreen\(f, subScreenVal\)/, 'the render key');
  assert.match(SRC, /const arrFlights = \(data\.arr \|\| \[\]\)\.filter\(f =>\s*_bidsOnScreen\(f, subScreenVal\) && _bidsInWindow\(f, Date\.now\(\)\)\);/, 'the renderer');
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
    'rgb(60,120,101)', 'rgb(65,122,104)', 'rgb(217,32,121)', '#a82633', '#d05560', '#EDBB00', '#157A43', '#B3261E']) {
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
  // the seven bars that were already clear of the status hues are untouched
  const KEPT = {
    3: 'linear-gradient(100deg,rgb(42,47,84) 0%,rgb(79,164,218) 100%)',
    4: 'linear-gradient(100deg,rgb(229,18,142) 0%,rgb(169,65,153) 100%)',
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
  assert.match(SRC, /const _b3StHtml = \(isDelayed && f\.upd && f\.upd !== f\.time\)\n\s*\? '<span class="fx-unit">' \+ fidsEscHtml\(stTxt\) \+ '<\/span> <span class="b3-st-sep fx-brk">·<\/span> <span class="fx-unit b3-st-at">' \+ fidsEscHtml\(_bidsTimeForLang\(f\.upd\)\) \+ '<\/span>'\n\s*: fidsEscHtml\(stTxt\);/);
  assert.match(SRC, /<div class="b3-status \$\{_b3StCls\}">\$\{_b3StHtml\}<\/div>/);
  // the time is the feed's (mapADB's upd: actual, else predicted, else revised)
  assert.match(SRC, /const revL=_actualL\|\|_predL\|\|_revisedL;/);
  assert.match(SRC, /const upd=\(revTs&&Math\.abs\(revTs-schedTs\)>5\*60000\)\?adbHHMM\(revL\):null;/);
  // a new time repaints the belt, and the pill is fitted, never cut
  const key = SRC.slice(SRC.indexOf('function getDedicatedRenderKey('), SRC.indexOf('function _bidsOnScreen('));
  assert.match(key, /upd:f\.upd \|\| null/);
  assert.match(SRC, /\{ sel: '\.bidsv3 \.b3-status', lines: 2, units: true,/);
});
