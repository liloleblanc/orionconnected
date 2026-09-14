'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23769 — ONE SIGN FOR EVERY AIRLINE.
//
// The boarding panel had four bodies and four layouts. The owner's mock fixes
// one frame: two panels, LEFT the priority group and RIGHT the group being
// called, every bilingual pair on ONE line round a bar, whole phrases one per
// language where a line is a sentence, the same two arrow discs in the corners
// — and each airline's own words inside it. Zones for Air Canada and WestJet,
// rows and cabins for Porter, groups for the rest, PAL's open flow.
//
// The failure this replaces was a label split into two stacked halves —
// 'Priority' over 'Priorité' — so the tests here are mostly about what the
// sign is NOT allowed to do again, plus the parts that would rot silently: a
// family slipping back to its old body, a lane line going missing, the CSS
// losing the fight it has to win.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

/** The boardHtml assembly — from its opening to the end of the if-block. */
function assembly() {
  const at = SRC.indexOf("boardHtml = '<div class=\"g8-board active\">'");
  assert.ok(at >= 0, 'the boarding assembly must exist');
  const end = SRC.indexOf('\n  }\n', at);
  return SRC.slice(at, end);
}

/** The body of a 2-space-indented function, to its closing brace. */
function fn(name) {
  const at = SRC.indexOf('  function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  const end = SRC.indexOf('\n  }\n', at);
  return SRC.slice(at, end + 4);
}

test('every family goes through the one builder', () => {
  const a = assembly();
  assert.match(a, /_g8SignHtml\(/, 'the assembly must call _g8SignHtml');
  for (const old of ['_acLanesBodyHtml(', '_pdLanesBodyHtml(', '_pbFlowBodyHtml(']) {
    assert.ok(!a.includes(old), `${old} must no longer be rendered — that is a second layout`);
  }
  // and no family keeps a private body of its own
  assert.doesNotMatch(a, /<div class="g8-board-body">/, 'no inline body beside the builder');
});

test('no label is ever split into stacked halves again', () => {
  const b = fn('_g8SignHtml') + fn('_g8SignCol') + fn('_g8SignPair') + fn('_g8SignNext');
  assert.ok(!b.includes('_gateLblHalf'), 'the sign must never use _gateLblHalf — that is the stacked form');
  // the assembly's per-family data must not either
  assert.ok(!assembly().includes('_gateLblHalf'), "nor may the families' data");
  // pairs are built the Welcome headline's way, so the runtime pass that
  // measures those keeps them on one line or two whole phrases
  assert.match(fn('_g8SignPair'), /g8-pair-h/, 'halves must be .g8-pair-h spans');
  assert.match(fn('_g8SignPair'), /g8-pair-sep/, 'and the bar a .g8-pair-sep');
});

test('the same two arrow discs, on both panels, for everyone', () => {
  const d = fn('_g8ArrowDisc');
  assert.match(d, /<circle[^>]*fill="#414042"/, "the disc is the arrow pack's dark grey");
  assert.match(d, /<path[^>]*fill="#fff"/, 'with a white arrow');
  assert.match(d, /rotate\(' \+ rot \+ ' 100 100\)/, 'rotated about the disc centre');
  assert.match(d, /dir === 'dl' \? 45 : -45/, 'down-left is +45, down-right is -45');
  const c = fn('_g8SignCol');
  assert.match(c, /g8-sign-arrow l[^']*'\s*\+\s*_g8ArrowDisc\('dl'\)/, 'left disc points down-left');
  assert.match(c, /g8-sign-arrow r[^']*'\s*\+\s*_g8ArrowDisc\('dr'\)/, 'right disc points down-right');
  // the column builder is unconditional about them — no family opts out
  assert.doesNotMatch(c, /if \([^)]*arrow/i, 'the discs are not optional');
});

test("each family still says its own words, with a lane line each side", () => {
  const a = assembly();
  // Air Canada / WestJet: zones, priority 1 • 2, called zone, lanes 1 • 2 / 3 • 4
  assert.match(a, /_acLanes[\s\S]{0,400}value: '1 \\u2022 2'/, 'AC/WS priority panel shows Zones 1 • 2');
  assert.match(a, /_g8SignPair\('zones'/, 'AC/WS right panel is titled Zones');
  // Porter: rows and cabins
  assert.match(a, /_g8SignPair\('pdReserve'/, "Porter's priority panel carries the Reserve cabin");
  assert.match(a, /_g8SignPair\('pdClassic'/, "and the called panel the Classic cabin");
  assert.match(a, /_g8SignPair\('rows'/, 'titled Rows');
  assert.match(a, /_g8SignNext\('rows', _comingVal\)/, 'with the next row band as a Next line');
  // PAL: open flow — 'will begin shortly' then the general call
  assert.match(a, /_g8SignPair\(_pbPre \? 'boardSoon' : 'genboard'/, "PAL's called panel names the phase");
  // generic: groups, or zones for a carrier AIRLINE_ZONES says boards by zone
  assert.match(a, /_g8SignPair\(_gkey\)/, 'everyone else is titled Group or Zones by their own model');
  assert.match(a, /_g8SignNext\(_gkey, nextVal\)/, 'with the next group as a Next line');
  // lanes: every family passes one on each side
  const lanes = (a.match(/lanes: _g8SignLanes\(/g) || []).length;
  assert.ok(lanes >= 8, `expected a lane line on both panels of all four families, found ${lanes}`);
});

test('every title the sign asks for exists where the gate looks', () => {
  // _gateLbl reads _GATE_LBL and nothing else. 'Group' and 'Boarding' lived
  // only in the board's LS table, so the generic sign's called panel came up
  // with no title at all on a live United board, and its Next line read
  // 'Next: 6' with no word for what 6 was.
  const at = SRC.indexOf('var _GATE_LBL = {');
  assert.ok(at >= 0, '_GATE_LBL must exist');
  const T = SRC.slice(at, at + 40000);
  for (const key of ['priority', 'zones', 'rows', 'groupLabel', 'boarding', 'preboard', 'genboard', 'allPax', 'pdReserve', 'pdClassic', 'nextUp', 'boardConv']) {
    assert.match(T, new RegExp('^  ' + key + ':\\s*\\{', 'm'), `_GATE_LBL must carry '${key}' — the sign asks for it`);
  }
  assert.match(T, /^  groupLabel:\{ en:'Group', fr:'Groupe'/m, "'Group' must read in both languages");
  // the table's own entry is column-aligned, so the spacing is loose here
  assert.match(T, /^  boarding:\s*\{ en:'Boarding',\s+fr:'Embarquement'/m, "'Boarding' must read in both languages");
});

test('every word the sign can say, it can say in all nine languages', () => {
  // The board offers en fr es de it pt ja zh ar, and a gate speaks whichever
  // two its airport assigns. A label missing a language falls back to English
  // through _gateLbl1, silently — so the only way to know the languages are
  // connected is to count them. Brand names are the one exemption: Porter
  // publishes PorterReserve, PorterClassic and AvidTraveller in English and
  // French only, and a brand is not translated.
  const at = SRC.indexOf('var _GATE_LBL = {');
  const T = SRC.slice(at, at + 60000);
  const FULL = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
  const BRAND = new Set(['pdReserve', 'pdClassic', 'avidTraveller', 'cabinPremRouge', 'cabinUnitedFirst', 'cabinUnitedEcon', 'cabinPremiumWS']);
  const KEYS = ['priority', 'zones', 'zone', 'rows', 'groupLabel', 'boarding', 'preboard', 'genboard', 'allPax',
    'nextUp', 'boardConv', 'useLanes', 'useLane', 'comingUp', 'nowBoarding', 'boardSoon', 'preboardList',
    'photoId', 'pdReserve', 'pdClassic', 'avidTraveller',
    'cabinBiz', 'cabinFirst', 'cabinClub', 'cabinEcon', 'cabinEconWS', 'cabinPremiumWS', 'cabinPremRouge', 'cabinUnitedFirst', 'cabinUnitedEcon'];
  const short = [];
  for (const k of KEYS) {
    const m = new RegExp('^  ' + k + ':\\s*\\{([\\s\\S]*?)\\n  \\}|^  ' + k + ':\\s*\\{([^\\n]*)\\}', 'm').exec(T);
    assert.ok(m, `_GATE_LBL must carry '${k}'`);
    const body = m[1] || m[2] || '';
    const have = FULL.filter((l) => new RegExp('(^|[\\s,{])' + l + ':').test(body));
    const missing = FULL.filter((l) => !have.includes(l));
    if (missing.length && !BRAND.has(k)) short.push(`${k}: ${missing.join(' ')}`);
    if (BRAND.has(k)) assert.ok(have.includes('en') && have.includes('fr'), `${k} must at least carry en and fr`);
  }
  assert.deepEqual(short, [], 'these labels are missing languages the board offers:\n  ' + short.join('\n  '));
  // and the fallback that hides a gap really is there, so a missing language
  // shows English rather than nothing
  assert.match(SRC, /function _gateLbl1\([\s\S]{0,400}return t\.en \|\| '';/, '_gateLbl1 must fall back to English');
});

test('the Next line is whole phrases, one per language', () => {
  const n = fn('_g8SignNext');
  assert.match(n, /nextUp/, "reads the 'Next' label");
  assert.match(n, /g8-sign-line/, 'emits one line per language');
  assert.match(n, /lg === 'fr' \? ' : ' : ': '/, "French takes the space before the colon");
  assert.match(SRC, /nextUp:\s*\{ en:'Next', fr:'Prochain'/, "the label exists in both languages");
  assert.match(SRC, /boardConv:\s*\{ en:'Board at your convenience', fr:'Embarquez à votre convenance'/,
    'and so does the standing priority note');
});

test('what the review found, held so it stays fixed', () => {
  // Reviewed after v23769 by six independent readers; these are the things
  // that survived their own skeptics.
  const col = fn('_g8SignCol');
  // The pair-measuring pass looks for .g8-pair. Without it a pair that has
  // to go to two rows keeps its bar, stranded — the exact defect the pair
  // machinery exists to remove.
  assert.match(col, /class="g8-sign-title g8-pair"/, 'the title must be on the pass\'s radar');
  assert.match(col, /class="g8-sign-sub g8-pair"/, 'and the sub');
  assert.match(col, /\(_txt \? ' g8-pair' : ''\)/, 'and a value made of words');
  assert.match(SRC, /var SEL = '[^']*\.g8-pair'/, 'the pass must still select .g8-pair');
  // And the pass must actually RUN. It was appended in v23768 inside
  // manageCustomBgUrls() by accident, so it installed itself only when an
  // operator opened the custom-background dialog and never on a live board
  // or gate — found on a gate at 4:3, where a stacked lane pair kept its bar.
  const passAt = SRC.indexOf('function _fidsPairSeparators(root)');
  const hostAt = SRC.indexOf('function manageCustomBgUrls() {');
  assert.ok(passAt >= 0 && hostAt >= 0);
  assert.ok(passAt < hostAt, 'the pair pass must be defined at top level, before manageCustomBgUrls, not inside it');
  const hostBody = SRC.slice(hostAt, SRC.indexOf('function render() {', hostAt));
  assert.doesNotMatch(hostBody, /_fidsPairSeparators|_fidsPairMO/, 'nothing of the pass may live inside the dialog');
  assert.match(SRC, /window\._fidsPairMO\.observe\(document\.body, \{ childList: true, subtree: true, characterData: true \}\)/,
    'and it must watch the whole document, which is how it reaches the gate');
  // The lane line lost its nowrap armour and its stacking guard when it got
  // a new container: on 4:3 and portrait screens 'Utilisez les voies 1 • 2'
  // broke after the bullet, and once armoured it stacked with its bar
  // stranded, because the old guard is keyed on a container this sign does
  // not have. So the lane line is a PAIR like the titles — one mechanism
  // for every pair on the sign, and it honours French-first the way the
  // titles do.
  assert.match(col, /class="g8-sign-lanes g8-pair"/, 'the lane line must be a pair container');
  assert.match(fn('_g8SignLanes'), /'useLanes' : 'useLane'/, 'built from the lane labels');
  assert.match(fn('_g8SignLanes'), /_gateLbl\([^,]+, _frF,/, 'French-first like every other pair');
  assert.match(fn('_g8SignLanes'), /g8-pair-h[^']*' \+ w \+ ' ' \+ nums/, 'each half is the phrase plus the lane numbers, one unit');
  const a = assembly();
  const laneCalls = a.match(/lanes: _g8SignLanes\(/g) || [];
  assert.ok(laneCalls.length >= 8, `expected the eight lane lines, found ${laneCalls.length}`);
  assert.ok(!a.includes('_gateLaneLbl('), 'the old lane markup must not reach the sign');
  // A column carrying a note or roster or marks says so, so the CSS can make
  // room — Porter's pre-boarding overflowed both columns without it.
  assert.match(col, /\(S\.note \|\| S\.roster\) \? ' has-note' : ''/);
  // v23773 — the tier marks are off the sign: the owner's picture has none.
  assert.doesNotMatch(col, /S\.marks/, 'no marks slot on the sign');
  assert.doesNotMatch(assembly(), /_pdPrioMarksHtml\(|_pdClassicMark\(/, 'the marks are not rendered');
  // The roster is a list and wraps in its own slot; poured into a nowrap
  // line it lost three of its five groups.
  assert.match(a, /roster: _pdPre \? \(_gateLbl1\('preboardList', _frF\) \|\| ''\) : ''/, 'the roster has its own slot');
  assert.match(col, /if \(S\.roster\) h \+= '<div class="g8-sign-roster">'/, 'which the column renders');
  // During pre-boarding the Classic panel says it is not being called yet.
  assert.match(a, /_R = _pdPre\s*\? \{[^}]*note: _g8SignLines\('boardSoon'\)/, "Porter's called panel says 'will begin shortly' during pre-boarding");
  // PAL says 'Pre-boarding' once, not on both panels.
  assert.match(a, /value: _g8SignPair\(_pbPre \? 'boardSoon' : 'genboard'\)/);
  assert.match(a, /next: _pbPre \? _g8SignNext\(null, null, 'genboard'\) : ''/);
  // Zone carriers are titled Zones, and a single zone is singular.
  assert.match(a, /AIRLINE_ZONES\[airlineCode\] \|\| \{\}\)\.label === 'Zone'\) \? 'zones' : 'groupLabel'/);
  assert.match(fn('_g8SignNext'), /groupKey = 'zone'/, 'a single number takes the singular');
  // A word that is the same in both languages is printed once — 'Zones', not
  // 'Zones | Zones' — and only doubles when the second language differs.
  assert.doesNotMatch(SRC, /_g8SignPair\('zones', true\)/, "'Zones' must not be kept twice");
  assert.doesNotMatch(SRC, /_g8SignPair\(_gkey, _gkey === 'zones'\)/);
  // And the priority panel names what its 1 • 2 are — the word beside the
  // number, on one row (v23773, the owner's picture).
  const zoneLeft = (SRC.match(/_L = \{ title: _prioT, sub: _g8CabinPair\(airlineCode, 0\), label: _g8SignPair\('zones'\), value: '1 \\u2022 2'/g) || []).length;
  assert.equal(zoneLeft, 3, `the AC/WS priority panel must say Zones beside 1 • 2 during boarding and at the final call (found ${zoneLeft})`);
});

test("each airline's cabins, named the way it names them", () => {
  // The priority panel says who it is for — Porter's PorterReserve line, for
  // everyone that sells a premium cabin — and the called panel is titled by
  // the economy cabin with the group word under it. One-cabin carriers get
  // no cabin line and keep the group word as the title.
  const m = SRC.indexOf('var _G8_CABINS = {');
  assert.ok(m >= 0, 'the cabin map must exist');
  const map = new Function('return ' + SRC.slice(SRC.indexOf('{', m), SRC.indexOf('};', m) + 1) + ';')();
  assert.deepEqual(map['AC'], ['cabinBiz', 'cabinEcon'], 'Air Canada sells Business Class');
  assert.deepEqual(map['QK'], ['cabinBiz', 'cabinEcon'], 'Jazz flies Air Canada cabins');
  assert.deepEqual(map['RV'], ['cabinPremRouge', 'cabinEcon'], 'Rouge has its own');
  assert.deepEqual(map['WS'], ['cabinPremiumWS', 'cabinEconWS']);
  assert.deepEqual(map['UA'], ['cabinUnitedFirst', 'cabinUnitedEcon']);
  assert.deepEqual(map['TS'], ['cabinClub', 'cabinEcon']);
  for (const one of ['F8', 'PB', 'WR', 'PD']) assert.ok(!map[one], `${one} has one cabin (or its own sign) and no entry`);
  // every key the map names exists in _GATE_LBL
  const lblAt = SRC.indexOf('var _GATE_LBL = {');
  const T = SRC.slice(lblAt, lblAt + 80000);
  for (const [, pair] of Object.entries(map)) for (const k of pair) assert.match(T, new RegExp('^  ' + k + ':\\s*\\{', 'm'), `${k} must be a gate label`);
  // the helper is what the panels read, and a missing cabin is an empty string
  assert.match(fn('_g8CabinPair'), /return \(c && c\[which\]\) \? _g8SignPair\(c\[which\]\) : '';/);
  const a = assembly();
  // v23773 — the called panel is titled General boarding, the economy cabin
  // under it, and the group word shares a row with its number.
  assert.match(a, /_R = \{ title: _g8SignPair\('genboard'\), sub: _g8CabinPair\(airlineCode, 1\), label: _g8SignPair\('zones'\), value: _acZonesVal/,
    'the AC/WS called panel: General boarding, the economy cabin, Zones beside the number');
  assert.match(a, /_R = \{ title: _g8SignPair\('genboard'\), sub: _g8CabinPair\(airlineCode, 1\), label: _g8SignPair\(_gkey\), value: String\(nowVal\)/,
    'the generic called panel does the same with its own group word');
  assert.match(a, /sub: _g8CabinPair\(airlineCode, 0\), note: _g8SignLines\('preboard'\)/, 'the generic priority panel names its premium cabin');
  const colSrc = fn('_g8SignCol');
  assert.doesNotMatch(colSrc, /g8-sign-kicker/, 'no kicker slot');
  assert.match(colSrc, /'<div class="g8-sign-row"><div class="g8-sign-label g8-pair">' \+ S\.label \+ '<\/div>' \+ _val \+ '<\/div>'/, 'the word and the number share one row');
});

test("the picture: the words, the strip's reminder, the row, the blue half", () => {
  // v23773 — drawn over the v23742 board by the owner, then two spoken
  // amendments: plain "Embarquement" (not "en cours"), and the photo-ID
  // reminder under NOW BOARDING on the strip in an attention colour that is
  // not red.
  const lblAt = SRC.indexOf('var _GATE_LBL = {');
  const T = SRC.slice(lblAt, lblAt + 80000);
  assert.match(T, /^  priority:\s*\{ en:'Priority',\s*fr:'Prioritaire'/m, 'Priority | Prioritaire');
  assert.match(T, /^  nowBoarding: \{ en:'Now Boarding', fr:'Embarquement',/m, 'the strip says Embarquement, plain');
  assert.match(SRC, /^  nowBoarding:\{ en:'NOW BOARDING',fr:'EMBARQUEMENT',/m, 'and so does the board countdown');
  assert.match(T, /photoId: \{\s*en:'Have your ID ready for presentation',\s*fr:'Veuillez avoir votre pièce d’identité prête',/, 'the reminder, in both languages');
  // The strip carries the reminder for Porter's general phase only, gated by
  // the same five-minute rule the sign uses for pre-boarding.
  const noteFn = fn('_pdIdNote');
  assert.match(noteFn, /if \(airlineCode !== 'PD' \|\| \(minsToDep > \(_boardLeadShown - 5\)\)\) return '';/, 'Porter, and never during pre-boarding');
  assert.match(noteFn, /_gateLbl\('photoId', _frF/, 'it is the photoId label');
  const stripAt = SRC.indexOf('function _boardWelcomeStripHtml(');
  const strip = SRC.slice(stripAt, SRC.indexOf('\n  }\n', stripAt));
  assert.match(strip, /var _bwNote = \(String\(_stripState \|\| ''\) === 'boarding'\) \? _pdIdNote\(\) : '';/, 'the strip prints it while boarding');
  assert.match(strip, /'<div class="g8-bw-text">' \+ _bwMidWords \+ _bwNote \+ '<\/div>'/, 'under the phase words');
  assert.match(SRC, /'<div class="g8-final-hdr">' \+ finalHdr \+ _pdIdNote\('g8-final-note'\) \+ '<\/div>'/, 'and the final-call header prints it too — it must not vanish for the last minutes');
  assert.doesNotMatch(assembly(), /_g8SignLines\('photoId'\)/, 'and no longer in the column');
  // Only a numeral earns the row; a word value (All | Toutes at the final
  // call) keeps its own size under its word, or the row's numeral size
  // would blow it past the column.
  const colFn = fn('_g8SignCol');
  assert.match(colFn, /h \+= \(S\.label && !_txt\) \? '<div class="g8-sign-row">/, 'a row only for a numeral');
  assert.match(colFn, /: \(\(S\.label \? '<div class="g8-sign-label g8-pair">' \+ S\.label \+ '<\/div>' : ''\) \+ _val\)/, 'a word value stands under its word');
  assert.match(colFn, /\(S\.roster \? ' has-roster' : ''\)/, 'a roster column says so, so only it is shrunk');
  const fc = SRC.slice(SRC.indexOf("finalHtml = '<div class=\"g8-final active\">'"));
  assert.match(fc, /label: _g8SignPair\('rows'\), value: _g8SignPair\('all'\)/, "Porter's final call: Rows beside All | Toutes");
  assert.match(fc, /label: _g8SignPair\(_gkey\), value: _g8SignPair\('all'\)/, 'and the generic one');
  // Each half of a pair carries its language, so Porter blue lands on the
  // French half wherever the airport puts it (first at YUL/YQB).
  assert.match(fn('_g8SignPair'), /' lang="' \+ langsOf\[i\] \+ '"'/, 'halves carry lang=');
  assert.match(SRC, /return wrap\(w, i, partLangs\[i\]\);/, '_gateLbl hands the language to wrap()');
  // The fitter measures a row's word against the column less the number.
  const pairPass = SRC.slice(SRC.indexOf('function _fidsPairSeparators('), SRC.indexOf('\n}\n', SRC.indexOf('function _fidsPairSeparators(')));
  assert.match(pairPass, /var rowEl = col\.classList\.contains\('g8-sign-row'\) \? col : null;\s*if \(rowEl && rowEl\.parentElement\) col = rowEl\.parentElement;/, 'a row word is measured against the column, not the row');
  assert.match(pairPass, /avail -= sib\.getBoundingClientRect\(\)\.width \+ \(parseFloat\(getComputedStyle\(rowEl\)\.columnGap\) \|\| 0\);/);
  // The general phase panels are titled General boarding with the cabin under
  // it; Porter's pre-boarding keeps the cabin as the title with "will begin
  // shortly" as the note.
  const a = assembly();
  assert.equal((a.match(/title: _g8SignPair\('genboard'\)/g) || []).length, 3, 'AC/WS, PD, generic during boarding');
  assert.equal((SRC.match(/title: _g8SignPair\('genboard'\)/g) || []).length, 7, 'and four more at the final call — AC, WS, PD, generic');
  assert.match(a, /_R = _pdPre\s*\? \{ title: _g8SignPair\('pdClassic', false, true\), label: _g8SignPair\('rows'\), value: nowVal,\s*note: _g8SignLines\('boardSoon'\)/);
  assert.match(a, /: \{ title: _g8SignPair\('genboard'\), sub: _g8SignPair\('pdClassic', false, true\), label: _g8SignPair\('rows'\), value: nowVal/);
  // CSS: the row, the Porter blue half, the note's colour — none of them red.
  const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
  const bAt = CSS.lastIndexOf('v23773 — THE SIGN, TO THE PICTURE');
  assert.ok(bAt >= 0, 'the block must exist');
  const block = CSS.slice(bAt);
  // every selector in the block outranks the ×14 sign block — all of them,
  // not a sample
  const sels = [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^html[^{]*?(?=\s*\{)/gm)].map((m) => m[0]);
  assert.ok(sels.length >= 12, `expected the block's selectors, found ${sels.length}`);
  for (const s of sels) assert.ok((s.match(/:not\(#_\)/g) || []).length >= 16, `"${s.slice(-70)}" must carry 16 guards`);
  for (const sel of ['.g8-sign .g8-sign-row {', '.g8-sign .g8-sign-label {', '.g8-sign .g8-sign-sub .g8-pair-h[lang="fr"] {', '.g8-board-welcome .g8-bw-text .g8-bw-note {', '.g8-final-hdr .g8-bw-note {', '.g8-sign .g8-sign-value.g8-grp-txt {', '.g8-sign .g8-sign-col.has-note:not(.has-roster) .g8-sign-title {']) {
    assert.ok(block.indexOf(sel) >= 0, sel + ' must be styled');
  }
  assert.match(block, /\.g8-sign-row \{[^}]*flex-direction: row !important;[^}]*align-items: center !important;[^}]*margin: auto 0 !important;/s, 'the word beside the number, centred on it, and the row floats like the number did');
  assert.match(block, /\.g8-sign \.g8-sign-row \.g8-sign-value \{ margin: 0 !important; \}/, "the number's own auto margin is inert inside the row");
  assert.match(block, /\.g8-sign-row \.g8-sign-value:not\(\.g8-grp-txt\) \{\s*font-size: min\(18vh, 22cqw\) !important;/, 'numerals only, capped by the column');
  assert.doesNotMatch(block, /\.g8-sign-row \.g8-sign-value \{\s*font-size/, 'no row size that a word value could inherit');
  assert.match(block, /\.g8-sign-value\.g8-grp-txt \{ font-size: 6\.6vh !important; \}/, 'a word value keeps the size the sign gave it');
  assert.match(block, /\.g8-sign-label \{[^}]*white-space: nowrap !important;/s, 'the word never wraps');
  assert.match(block, /\.g8-sign-sub \.g8-pair-h\[lang="fr"\] \{ color: #2e86de !important; \}/, "Porter's French half in Porter blue, by language");
  assert.doesNotMatch(block, /\.g8-pair-sep \+ \.g8-pair-h \{ color/, 'never by position');
  assert.match(block, /\[data-gate-airline="PD"\]/, 'scoped to Porter');
  const note = block.slice(block.indexOf('.g8-bw-note {'), block.indexOf('}', block.indexOf('.g8-bw-note {')));
  assert.match(note, /color: #c2410c !important;/, 'an attention colour');
  assert.doesNotMatch(note, /#f87171|#ef4444|#dc2626|#ff0000|\bred\b/, 'never bright red — it is not an emergency');
  assert.match(block, /\.g8-sign \.g8-sign-marks, [^{]*\.g8-sign \.g8-sign-kicker \{ display: none !important; \}/, 'marks and kicker cannot leak back');
  // A cabin pair can be long (Economy Class | Classe économique). The rule is
  // one line per pair, so the pass shrinks a sign pair to its column before
  // it lets it stack — and never below 68% of the stylesheet's size.
  const pAt = SRC.indexOf('function _fidsPairSeparators(');
  assert.ok(pAt >= 0, 'the pair pass must exist');
  const pass = SRC.slice(pAt, SRC.indexOf('\n}\n', pAt));
  assert.match(pass, /el\.closest\('\.g8-sign'\)/, 'the shrink is scoped to the sign');
  assert.match(pass, /data-g8-base/, 'measured against the stylesheet size, not its own earlier shrink');
  assert.match(pass, /Math\.max\(base \* 0\.68, base \* ratio \* 0\.985\)/, 'floor of 68%');
  assert.match(pass, /el\.style\.setProperty\('font-size', target \+ 'px', 'important'\)/, "the stylesheet's size is !important — a plain inline value loses to it");
  assert.match(pass, /el\.classList\.remove\('is-stacked'\);[\s\S]{0,900}var need = 0/, 'a pair once stacked is re-judged at the new size, not left stacked by its own class');
  assert.match(pass, /parseFloat\(ks\.marginLeft\)/, "the separator's margins are part of what has to fit");
  assert.match(SRC, /\.g8-sign \.g8-pair\[data-g8-base\]'\);[\s\S]{0,300}removeAttribute\('data-g8-base'\)/, 'a resize clears the stored base');
  assert.match(SRC, /^  zone:\s*\{ en:'Zone', fr:'Zone'/m, "and the singular exists");
  // the duplicate 'boarding' key is gone — the gate table had it all along
  const gl = SRC.indexOf('var _GATE_LBL = {');
  const dup = (SRC.slice(gl, gl + 60000).match(/^  boarding:\s*\{/gm) || []).length;
  assert.equal(dup, 1, `'boarding' appears ${dup} times in _GATE_LBL`);
});

test('the final call goes through the same sign', () => {
  // Without this an AC gate flipped from the sign back to three
  // quarter-columns with stacked halves for the last minutes of boarding.
  const at = SRC.indexOf("finalHtml = '<div class=\"g8-final active\">'");
  assert.ok(at >= 0, 'the final-call assembly must exist');
  const f = SRC.slice(at, SRC.indexOf('\n    }\n', at));
  assert.match(f, /_g8SignHtml\(_L, _R\)/, 'the final call must use the builder');
  for (const old of ['_acLanesBodyHtml(', '_pdLanesBodyHtml(', '_pbFlowBodyHtml(', 'g8-lanes-std', '_gateLblHalf']) {
    assert.ok(!f.includes(old), `${old} must not be rendered at the final call`);
  }
  assert.match(f, /_fcExpress \? '3 \\u2022 4' : '3 \\u2022 4 \\u2022 5 \\u2022 6'/, 'AC family: all zones');
  assert.match(f, /value: _fcNext, lanes/, "WestJet: its own '2 – 9'");
  assert.match(f, /value: _g8SignPair\('all'\)/, "everyone else: 'All | Tous'");
  assert.doesNotMatch(f, /next:/, 'nothing comes after the final call');
});

test('the CSS wins, and keeps the halves unbreakable', () => {
  const at = CSS.lastIndexOf('ONE SIGN FOR EVERY AIRLINE');
  assert.ok(at >= 0, 'the sign block must exist');
  // to the next versioned block, or the end — never the whole tail
  const nextAt = (() => { const m = /\n\/\* ═+\n\s+v\d{5}/g; m.lastIndex = at + 30; const r = m.exec(CSS); return r ? r.index : CSS.length; })();
  const block = CSS.slice(at, nextAt);
  // sizes are bounded by the column so a 4:3 or portrait column cannot
  // overflow; the ellipsis that could sever a phrase is gone; the roster
  // wraps; the lane halves keep their armour; the marks caption is styled
  assert.match(block, /\.g8-sign-value \{[^}]*font-size: min\(22vh, 40cqw\)/);
  assert.match(block, /\.g8-sign-title \{[^}]*font-size: min\(5\.2vh, 9cqw\)/);
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /text-overflow: ellipsis/, 'an ellipsis is a mid-phrase sever');
  assert.match(block, /\.g8-sign-roster \{[^}]*white-space: normal !important;/);
  assert.match(block, /\.g8-sign \.g8-pd-marks-hdr \{/, 'the marks caption keeps its treatment inside the sign');
  // the Next line lives between the discs, clear of them at any column width
  assert.match(block, /\.g8-sign \.g8-sign-next \{[^}]*position: absolute !important;/);
  assert.match(block, /\.g8-sign \.g8-sign-next \{[^}]*left: calc\(3% \+ min\(11vh, 20cqw\) \+ 1vh\)/, 'its margin is the disc plus a breath');
  assert.match(block, /\.g8-sign-arrow \{[^}]*width: min\(11vh, 20cqw\)/, 'and the disc is that size');
  // a column with a note gives its number back some room
  assert.match(block, /\.g8-sign-col\.has-note \.g8-sign-value \{[^}]*font-size: min\(14vh, 30cqw\)/);
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = [...rules.matchAll(/^html[^{]*?(?=\s*[{,])/gm)].map((m) => m[0]);
  assert.ok(sels.length >= 15, `found only ${sels.length} selectors`);
  for (const s of sels) {
    const g = (s.match(/:not\(#_\)/g) || []).length;
    assert.ok(g >= 14, `"${s.slice(0, 50)}…" carries ${g} guards; the heaviest .g8-board rule above it carries 12`);
  }
  assert.match(rules, /\.g8-pair-h \{[^}]*white-space: nowrap !important;/, 'a half never breaks inside itself');
  assert.match(rules, /\.is-stacked > \.g8-pair-sep \{ display: none !important; \}/, 'the bar goes when the pair stacks');
  assert.doesNotMatch(rules, /url\(/, 'no images in the sign');
  assert.doesNotMatch(rules, /background(-color)?:/, 'backgrounds stay with each airline\'s own brand rules');
});
