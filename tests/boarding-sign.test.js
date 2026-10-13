'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23769 — ONE SIGN FOR EVERY AIRLINE.
//
// The boarding panel had four bodies and four layouts. The design mock fixes
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
// The pre-boarding, travel-document, loyalty and cabin words moved from
// _GATE_LBL to the one store (board-strings.js), where _gateLbl and _gateLbl1
// also look; a key the sign asks for may be in either.
const STORE = require('../fids-current/js/board-strings.js');

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
  const b = fn('_g8SignHtml') + fn('_g8SignCol') + fn('_g8SignPair') + fn('_g8SignGo') + fn('_g8SignInstr') + fn('_g8SeqSeated');
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
  // BOARDING SEQUENCES — each airline's words come from its own table
  // (js/boarding-sequence.js) through ONE panel builder, _g8SeqPanels, for
  // the stage that is live; no family keeps a body of its own.
  const a = assembly();
  assert.match(a, /_g8SeqPanels\(_seq, false\)/, 'the boarding sign is built from the live stage');
  const P = fn('_g8SeqPanels');
  assert.match(P, /title: _g8SignPair\('preboard'\)/, 'pre-boarding is titled Pre-boarding');
  assert.match(P, /title: _g8SignPair\('priority'\)/, 'the priority calls keep Priority');
  assert.match(P, /title: _g8SignPair\(cur\.title\)/, "the airline's own family or courtesy call, in its own words");
  // THE FINAL DESIGN — General boarding is said only at the switch to
  // everyone, over the airline's own unit (ALL ZONES), never over one zone
  assert.doesNotMatch(P, /'genboard'/, 'never over a single call');
  assert.match(fn('_g8SeqAll'), /title: _g8SignPair\('genboard'\), value: _g8SignPair\(k\),/, 'General boarding over ALL ZONES at the switch');
  assert.match(fn('_g8SeqValue'), /_g8SignPair\(_g8SeqLabelKey\(s\.label, s\.values\.length\)\)/, "the group word is the airline's own: zone, group or rows");
  assert.match(fn('_g8SeqValue'), /value: _g8SignPair\('allPax'\)/, 'All passengers where no number is called');
  // the words each table names
  const SEQ = require('../fids-current/js/boarding-sequence.js');
  const labels = (c, ctx) => SEQ.plan(c, ctx).full.map((s) => s.label).filter(Boolean);
  assert.ok(labels('AC').every((l) => l === 'zone'), 'Air Canada calls zones');
  assert.ok(labels('WS').every((l) => l === 'zone'), 'and WestJet');
  assert.ok(labels('PD', { pdDash: true }).every((l) => l === 'rows'), 'Porter calls rows');
  assert.ok(labels('UA').every((l) => l === 'groupLabel'), 'United calls groups');
  assert.deepEqual(SEQ.plan('PB').full.map((s) => s.title), ['preboard', 'allPax'], "PAL's two phases");
  // lanes: every panel carries its lane line, 1 • 2 left and 3 • 4 right
  // (PAL's one lane on both)
  assert.match(P, /var lanesL = p\.oneLane \? _g8SignLanes\('1', false\) : _g8SignLanes\('1 \\u2022 2', true\);/);
  assert.match(P, /var lanesR = p\.oneLane \? _g8SignLanes\('1', false\) : _g8SignLanes\('3 \\u2022 4', true\);/);
  const panels = (P.match(/p[LR] = \{(?!\})/g) || []).length;
  const withLanes = (P.match(/p[LR] = \{[^}]*lanes: lanes[LR]/g) || []).length;
  assert.ok(panels >= 6, `expected every left and right panel state, found ${panels}`);
  assert.equal(withLanes, panels, `every panel carries its lane line (${withLanes} of ${panels})`);
  // and the switch's panel, built by _g8SeqAll, is handed the right lane line
  assert.match(P, /pR = _g8SeqAll\(p, lanesR\);/);
  assert.match(fn('_g8SeqAll'), /lanes: lanes \};/);
  // the one panel built by copying (a no-priority airline's lanes 1 • 2,
  // serving the right panel's call) takes the left lane line
  assert.match(P, /pL = \{\};\s*for \(var kR in pR\)[^\n]*\n\s*pL\.lanes = lanesL; pL\.instr = '';/);
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
    assert.ok(new RegExp('^  ' + key + ':\\s*\\{', 'm').test(T) || STORE.entry(key), `_GATE_LBL or the store must carry '${key}' — the sign asks for it`);
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
    'cabinBiz', 'cabinFirst', 'cabinClub', 'cabinEcon', 'cabinEconWS', 'cabinPremiumWS', 'cabinPremRouge', 'cabinUnitedFirst', 'cabinUnitedEcon',
    // THE FINAL DESIGN — the switch, who still waits, the instruction line,
    // the status bar and gate closed
    'allZones', 'allGroups', 'allRows', 'paxRemainGo', 'seeAgent', 'finalCall', 'gateClosed',
    'seatedZone', 'seatedZones', 'seatedZonesTwo', 'seatedGroup', 'seatedGroups', 'seatedGroupsTwo', 'seatedRows',
    'seatedUntilZone', 'seatedUntilGroup', 'seatedUntilRow', 'seatedUntilGen'];
  const short = [];
  for (const k of KEYS) {
    const m = new RegExp('^  ' + k + ':\\s*\\{([\\s\\S]*?)\\n  \\}|^  ' + k + ':\\s*\\{([^\\n]*)\\}', 'm').exec(T);
    const stored = STORE.entry(k);
    assert.ok(m || stored, `_GATE_LBL or the store must carry '${k}'`);
    const body = m ? (m[1] || m[2] || '') : '';
    const have = m ? FULL.filter((l) => new RegExp('(^|[\\s,{])' + l + ':').test(body))
      : FULL.filter((l) => typeof stored[l] === 'string' && stored[l]);
    const missing = FULL.filter((l) => !have.includes(l));
    if (missing.length && !BRAND.has(k)) short.push(`${k}: ${missing.join(' ')}`);
    if (BRAND.has(k)) assert.ok(have.includes('en') && have.includes('fr'), `${k} must at least carry en and fr`);
  }
  assert.deepEqual(short, [], 'these labels are missing languages the board offers:\n  ' + short.join('\n  '));
  // and no fallback hides a gap: a language the board shows is that
  // language's word, never the English one standing in for it (every entry
  // carries all nine; tests/board-languages.test.js holds them to it)
  assert.doesNotMatch(SRC, /function _gateLbl1\([\s\S]{0,400}return t\.en/, '_gateLbl1 must not fall back to English');
});

test('who still waits and the instruction line are whole phrases, one per language', () => {
  // THE FINAL DESIGN — the Next line is gone. Under a numbered call, who
  // still waits (« Zones 4, 5 and 6: please remain seated »); at the foot of
  // the general panel, the instruction line. Each is one whole line per
  // language, from the one chooser, each line marked with its language.
  const go = fn('_g8SignGo');
  assert.match(go, /return _gateLbl\(key, _frF, function \(w\) \{ return '<span class="g8-seat-line">' \+ w \+ '<\/span>'; \}, ''\);/, 'the pair chooser: one line per language');
  const seated = fn('_g8SeqSeated');
  assert.match(seated, /BoardStrings\.pairLangs\(langs, _frF\)/, 'the pair comes from the one chooser');
  assert.match(seated, /BoardStrings\.markHalf\('<span class="g8-seat-line">' \+ line \+ '<\/span>', lg\)/, 'each line marked with its language');
  assert.match(seated, /!\(st\.cur\.values \|\| \[\]\)\.length\) return '';/, 'only under a numbered call');
  const instr = fn('_g8SignInstr');
  assert.match(instr, /if \(sw\) return _g8SignGo\('paxRemainGo'\);/, 'from the switch: all remaining passengers');
  assert.match(instr, /if \(seated\) return seated;/, 'under a numbered call, who still waits IS the line: one "remain seated", not two');
  assert.match(instr, /'seatedUntilZone' : \(u === 'groupLabel' \? 'seatedUntilGroup' : \(u === 'rows' \? 'seatedUntilRow' : 'seatedUntilGen'\)\)/, "before it, in the airline's own unit");
  const BS = require('../fids-current/js/board-strings.js');
  assert.equal(BS.META.fr.colon, ' : ', 'French takes the space before the colon');
  assert.match(BS.bs('seatedZones', 'fr'), /^Zones \{LIST\}\u00A0: /, 'and so does its remain-seated line (a no-break space)');
  assert.match(SRC, /boardConv:\s*\{ en:'Board at your convenience', fr:'Embarquez à votre convenance'/,
    'the standing priority note exists in both languages');
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
  const P = fn('_g8SeqPanels');
  // BOARDING SEQUENCES — the lane lines are built once per side and every
  // panel carries one (see "each family still says its own words").
  assert.equal((P.match(/_g8SignLanes\(/g) || []).length, 4, 'the lane lines come from _g8SignLanes, left and right, one lane or two');
  assert.ok(!a.includes('_gateLaneLbl(') && !P.includes('_gateLaneLbl('), 'the old lane markup must not reach the sign');
  // A column carrying a note or roster or marks says so, so the CSS can make
  // room — Porter's pre-boarding overflowed both columns without it.
  assert.match(col, /\(S\.note \|\| S\.roster\) \? ' has-note' : ''/);
  // v23773 — the tier marks are off the sign: the design mock has none.
  assert.doesNotMatch(col, /S\.marks/, 'no marks slot on the sign');
  assert.doesNotMatch(assembly(), /_pdPrioMarksHtml\(|_pdClassicMark\(/, 'the marks are not rendered');
  // The roster is a list and wraps in its own slot; poured into a nowrap
  // line it lost three of its five groups.
  // BOARDING SEQUENCES — every airline's who-list (Porter's roster among
  // them) goes in that slot, one language at a time, marked with it.
  assert.match(fn('_g8SeqWho'), /return _gateLbl\(s\.who, _frF, function \(w\) \{/, 'the roster has its own slot: both of the board\'s languages, each marked with its own');
  assert.match(fn('_g8SeqWho'), /'<span class="g8-who-blk">' \+ items\.map/, 'each language a block of whole items');
  assert.match(P, /roster: _g8SeqWho\(cur\)/, 'pre-boarding and the family calls name who they are for');
  assert.equal(require('../fids-current/js/boarding-sequence.js').SEQ.PD.stages[0].who, 'preboardList', "Porter's pre-boarding roster is its published list");
  assert.match(col, /if \(S\.roster\) h \+= '<div class="g8-sign-roster">'/, 'which the column renders');
  // While the left panel runs, general boarding says it is not being
  // called yet (every airline, Porter's pre-phase pattern).
  // The waiting panel never reads as a live call: 'will begin shortly' is
  // its main line (words: no number, no arrow), its first call the Next line.
  assert.match(P, /pR = \{ title: _g8SeqCab\(g0 && g0\.sub\), soon: _g8SignGo\('boardSoon'\), lanes: lanesR, instr: instr, waiting: true \};/, "the waiting panel says 'will begin shortly', each language a whole line, with the instruction line");
  assert.match(col, /if \(S\.soon\) h \+= '<div class="g8-sign-soon">' \+ S\.soon \+ '<\/div>';/, 'which the column renders as its own block');
  assert.match(col, /\(S\.waiting \? ' is-waiting' : ''\)/, 'and says so in its class');
  assert.match(col, /\(side === 'right' && !_txt\) \? '<span class="g8-sign-valarrow">'/, 'a word value carries no arrow');
  // 'Pre-boarding' is said once, on the left: PAL's right panel names its
  // general call, All passengers.
  const right = ((P.split('// ── RIGHT ──')[1] || '').split('// ── LEFT ──')[0]).replace(/\/\/.*$/mg, '');
  assert.ok(right.length > 200, 'the right panel\'s code');
  assert.doesNotMatch(right, /'preboard'/);
  // The made-up counts are gone: a carrier's word comes from its own table,
  // and a single zone or group is singular ('Zones 3' was the bug).
  assert.doesNotMatch(SRC, /AIRLINE_ZONES\[|getZoneCount\(/, 'the invented group numbers are retired');
  assert.match(fn('_g8SeqLabelKey'), /if \(label === 'zone'\) return n > 1 \? 'zones' : 'zone';/);
  assert.match(fn('_g8SeqLabelKey'), /if \(label === 'groupLabel'\) return n > 1 \? 'groups' : 'groupLabel';/);
  assert.match(fn('_g8SeatKey'), /if \(form === 'one'\) return base;/, 'a single zone still waiting takes the singular');
  // A word that is the same in both languages is printed once — 'Zones', not
  // 'Zones | Zones' — and only doubles when the second language differs.
  assert.doesNotMatch(SRC, /_g8SignPair\('zones', true\)/, "'Zones' must not be kept twice");
  assert.doesNotMatch(SRC, /_g8SignPair\(_gkey, _gkey === 'zones'\)/);
  // And the priority panel names what its values are — the word beside the
  // number, on one row (v23773, the design mock): once every left call is
  // made, and at the final call, Priority with the priority values called
  // (Zones 1 • 2) and their group word.
  assert.match(P, /label: pvals\.length \? _g8SignPair\(_g8SeqLabelKey\(prios\[0\]\.label, pvals\.length\)\) : '',\s*value: pvals\.length \? B\.fmt\(pvals, 3\) : '',/);
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
  for (const [, pair] of Object.entries(map)) for (const k of pair) assert.ok(new RegExp('^  ' + k + ':\\s*\\{', 'm').test(T) || STORE.entry(k), `${k} must be a gate label`);
  // BOARDING SEQUENCES — EACH ZONE NAMES ITS OWN CABIN, OR NONE. The map is
  // what a carrier with no table of its own reads; the airlines with a table
  // carry a cabin on each stage, read from the airline's own page, by
  // aircraft and route where the cabin depends on them.
  const SEQ = require('../fids-current/js/boarding-sequence.js');
  const subs = (c, ctx) => SEQ.plan(c, ctx).full.map((x) => (x.values.join('•') || x.title || x.who || x.kind) + '=' + (x.sub || '-')).join(' ');
  assert.equal(subs('AC', { cat: 'narrowbody' }), 'preboard=- 1=cabinBiz 2=- familyBoard=- 3=cabinEcon 4=cabinEcon 5=cabinEcon 6=cabinEcon', 'Air Canada A320: Business in Zone 1, no cabin in Zone 2');
  assert.match(subs('AC', { cat: 'widebody' }), / 2=cabinPremEconAC /, 'Air Canada widebody: Premium Economy in Zone 2');
  assert.match(subs('AC', { express: true }), / 1=- 2=- /, 'Express on a Dash 8 or a CRJ200: no Business');
  assert.match(subs('AC', { express: true, twoCabin: true }), / 1=cabinBiz 2=- /, 'Express on a CRJ900 or an E175: Business in Zone 1');
  assert.match(subs('RV', { region: 'dom' }), / 1=cabinPremRouge 2=- /, 'Rouge domestic: Premium Rouge in Zone 1');
  assert.match(subs('RV', { region: 'carib' }), / 1=cabinPremRouge 2=- /, 'and Caribbean');
  assert.match(subs('RV', { region: 'intl' }), / 1=- 2=cabinPremRouge /, 'international: Zone 2');
  assert.match(subs('RV', { region: 'na' }), / 1=- 2=- /, 'neither (U.S., Mexico): none');
  assert.match(subs('WS'), / 1=cabinPremiumWS 2=cabinExtComfortWS /, 'WestJet: Premium, then Extended Comfort');
  assert.match(subs('WR'), / 1=cabinPremiumWS 2=- /, 'Encore sells Premium; no page says Extended Comfort');
  assert.match(subs('UA', { cat: 'narrowbody' }), / 1=cabinUnitedFirst 2=- 3=cabinUnitedEcon/, 'United: First in Group 1 only');
  assert.match(subs('UA', { cat: 'widebody' }), / 1=- /, 'a widebody: Polaris or Business, never guessed');
  assert.match(subs('UA', {}), / 1=- /, 'an unknown type: none');
  assert.ok(!/cabinFirst|cabinEcon\b/.test(subs('DL')), "Delta: no 'First Class' or 'Economy Class'");
  assert.match(subs('AA'), / 1=- 2=- 3=- 4=- 5=cabinMainAA 6=cabinMainAA 7•8=cabinMainAA 9=cabinMainAA/, "American: Main Cabin, its word");
  assert.ok(!/cabinFirst|cabinEcon\b/.test(subs('AS')), 'Alaska: named in the who-lists');
  assert.deepEqual(SEQ.plan('PD').cabins, ['pdReserve', 'pdClassic'], "Porter's cabins by its own names");
  assert.deepEqual(SEQ.plan('ZZ', { cabins: ['cabinFirst', 'cabinEcon'] }).cabins, ['cabinFirst', 'cabinEcon'], 'a carrier with no table gets the map');
  assert.match(fn('_g8SeqPlan'), /cabins: _G8_CABINS\[airlineCode\] \|\| null/);
  assert.match(fn('_g8SeqPlan'), /cat: _cat, twoCabin: _twoCabin, region: _region,/, 'the gate gives the aircraft and the route');
  // the panels print the live call's own cabin; a merged or summed-up panel
  // only the cabin every call in it shares
  const P = fn('_g8SeqPanels');
  assert.doesNotMatch(P, /p\.cabins\[/, 'never the first priority or general call\'s cabin for another');
  assert.match(P, /pR = \{ title: _g8SeqCab\(cur\.sub\), label: lv\.label, value: lv\.value, roster: _g8SeqWho\(cur\), lanes: lanesR, instr: instr \};/, 'the live general panel: its own cabin over its number, never General boarding');
  assert.match(P, /pL = \{ picto: pv\.value \? '' : 'prio', title: _g8SignPair\('priority'\), sub: _g8SeqCab\(cur\.sub\),/, 'the live priority panel: its own cabin, and its symbol when it has no number');
  assert.match(P, /pL = \{ picto: pvals\.length \? '' : 'prio', title: _g8SignPair\('priority'\), sub: _g8SeqCab\(_g8SeqCabOf\(prioMade\)\),/, 'the made panel: the cabin they all share');
  assert.match(fn('_g8SeqCabOf'), /if \(\(list\[i\]\.sub \|\| ''\) !== v\) return '';/);
  const colSrc = fn('_g8SignCol');
  assert.doesNotMatch(colSrc, /g8-sign-kicker/, 'no kicker slot');
  assert.match(colSrc, /'<div class="g8-sign-row"><div class="g8-sign-label g8-pair">' \+ S\.label \+ '<\/div>' \+ _val \+ '<\/div>'/, 'the word and the number share one row');
});

test("the picture: the words, the strip's reminder, the row, the blue half", () => {
  // v23773 — the mock drawn over the v23742 board, then two later
  // amendments: plain "Embarquement" (not "en cours"), and the photo-ID
  // reminder under NOW BOARDING on the strip in an attention colour that is
  // not red.
  const lblAt = SRC.indexOf('var _GATE_LBL = {');
  const T = SRC.slice(lblAt, lblAt + 80000);
  assert.match(T, /^  priority:\s*\{ en:'Priority',\s*fr:'Prioritaire'/m, 'Priority | Prioritaire');
  assert.match(T, /^  nowBoarding: \{ en:'Now Boarding', fr:'Embarquement',/m, 'the strip says Embarquement, plain');
  assert.match(SRC, /^  nowBoarding:\{ en:'NOW BOARDING',fr:'EMBARQUEMENT',/m, 'and so does the board countdown');
  // v24006 — the reminder says what the rule says (government-issued ID, in
  // every language), and it has moved off the strip to the band under it
  // (_boardBandHtml), where every airline's documents line now is.
  assert.equal(STORE.bs('photoId', 'en'), 'Have your government-issued ID ready for presentation', 'the reminder');
  assert.equal(STORE.bs('photoId', 'fr'), 'Veuillez avoir votre pièce d’identité gouvernementale prête', 'in French');
  assert.equal(SRC.indexOf('function _pdIdNote('), -1, 'the strip note is gone');
  const stripAt = SRC.indexOf('function _boardWelcomeStripHtml(');
  const strip = SRC.slice(stripAt, SRC.indexOf('\n  }\n', stripAt));
  assert.doesNotMatch(strip, /_bwNote|g8-bw-note|photoId/, 'the strip holds its headline alone');
  assert.match(strip, /'<div class="g8-bw-text">' \+ _bwMidWords \+ '<\/div>'/, 'the phase words alone, at full size');
  assert.match(assembly(), /\+ _boardWelcomeStripHtml\('boarding'\)\s*\+ _boardBandHtml\(\)/, 'the band under NOW BOARDING');
  assert.match(SRC, /'<div class="g8-final-hdr">' \+ finalHdr \+ '<\/div>'[\s\S]{0,400}\+ _boardBandHtml\(\)/, 'and under FINAL CALL: it must not vanish for the last minutes');
  assert.doesNotMatch(assembly(), /_g8SignLines\('photoId'\)/, 'and not in the column');
  // Only a numeral earns the row; a word value (All | Toutes at the final
  // call) keeps its own size under its word, or the row's numeral size
  // would blow it past the column.
  const colFn = fn('_g8SignCol');
  assert.match(colFn, /h \+= \(S\.label && !_txt\) \? '<div class="g8-sign-row">/, 'a row only for a numeral');
  assert.match(colFn, /: \(\(S\.label \? '<div class="g8-sign-label g8-pair">' \+ S\.label \+ '<\/div>' : ''\) \+ _val\)/, 'a word value stands under its word');
  assert.match(colFn, /\(S\.roster \? ' has-roster' : ''\)/, 'a roster column says so, so only it is shrunk');
  // The final call's panels come from _g8SeqPanels(_seq, true): THE FINAL
  // DESIGN keeps the switch there, the airline's own unit and never a bare
  // All (Porter: ALL ROWS | TOUTES LES RANGÉES; All passengers where nothing
  // is numbered).
  const fcP = fn('_g8SeqPanels');
  assert.match(fcP, /var sw = isFinal \|\| B\.isSwitch\(p, st\);/, 'the final call keeps the switch');
  const all = fn('_g8SeqAll');
  assert.match(all, /var k = u === 'zone' \? 'allZones' : \(u === 'groupLabel' \? 'allGroups' : \(u === 'rows' \? 'allRows' : 'allPax'\)\);/, "each airline's own unit: zones, groups, Porter's rows");
  assert.doesNotMatch(SRC, /_g8SignPair\('all'\)/, 'never a bare All | Toutes');
  assert.doesNotMatch(SRC.slice(SRC.indexOf('var _GATE_LBL = {'), SRC.indexOf('var _GATE_LBL = {') + 80000), /^  all:\s*\{/m, "the bare 'All' label is gone");
  // Each half of a pair carries its language, so Porter blue lands on the
  // French half wherever the airport puts it (first at YUL/YQB).
  // (a half cut from a brand also says it is a name, translate="no")
  assert.match(fn('_g8SignPair'), /BoardStrings\.markHalf\('<span class="g8-pair-h"' \+ \(i === cut \? ' translate="no"' : ''\) \+ '>' \+ w \+ '<\/span>', langsOf\[i\], key\)/, 'halves carry lang=');
  assert.match(SRC, /BoardStrings\.markHalf\(wrap\(w, i, partLangs\[i\]\), partLangs\[i\], key\)/, '_gateLbl hands the language to wrap() and marks the half');
  // The fitter measures a row's word against the column less the number.
  const pairPass = SRC.slice(SRC.indexOf('function _fidsPairSeparators('), SRC.indexOf('\n}\n', SRC.indexOf('function _fidsPairSeparators(')));
  assert.match(pairPass, /var rowEl = col\.classList\.contains\('g8-sign-row'\) \? col : null;\s*if \(rowEl && rowEl\.parentElement\) col = rowEl\.parentElement;/, 'a row word is measured against the column, not the row');
  assert.match(pairPass, /avail -= sib\.getBoundingClientRect\(\)\.width \+ \(parseFloat\(getComputedStyle\(rowEl\)\.columnGap\) \|\| 0\);/);
  // A general panel is titled by its call's own cabin, waiting ("will begin
  // shortly") and live; General boarding is the switch's title alone. The
  // cabin pair drops the repeated brand prefix (PorterClassic | Classique).
  assert.equal((fcP.match(/title: _g8SeqCab\((g0 && g0\.sub|cur\.sub)\)/g) || []).length, 2, 'the waiting and the live general panel: the cabin as the title');
  assert.match(fn('_g8SeqCab'), /return k \? _g8SignPair\(k, false, true\) : '';/);
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
  for (const sel of ['.g8-sign .g8-sign-row {', '.g8-sign .g8-sign-label {', '.g8-sign .g8-sign-sub .g8-pair-h[lang="fr"] {', '.g8-sign .g8-sign-value.g8-grp-txt {', '.g8-sign .g8-sign-col.has-note:not(.has-roster) .g8-sign-title {']) {
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
  // v24006 — no rule styles the strip's old reminder; the band that took its
  // place is painted in the airline's own pair, never a status colour
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /\.g8-bw-note/, 'the strip note has no styles left');
  const bAt2 = block.indexOf("v24006 — THE BOARDING SCREEN'S BAND");
  assert.ok(bAt2 > 0, 'the band block must exist');
  const band = block.slice(bAt2).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(band, /\.g8-band \.g8-band-docs \{[^}]*background: var\(--rc2-a, #0c1119\) !important;[^}]*color: var\(--rc2-a-ink, #ffffff\) !important;/, "the documents on the airline's first colour, in its ink");
  assert.match(band, /\.g8-band \.g8-band-close \{[^}]*background: var\(--rc2-b, #0c1119\) !important;[^}]*color: #ffffff !important;/, 'the close time white on its second');
  assert.doesNotMatch(band, /#c2410c|#f59e0b|#fbbf24|#dc2626|#ef4444|#f87171|#22c55e|#16a34a|#34d399|animation|transition|@keyframes/i, 'no status colour, nothing moves');
  assert.match(block, /\.g8-sign \.g8-sign-marks, [^{]*\.g8-sign \.g8-sign-kicker \{ display: none !important; \}/, 'marks and kicker cannot leak back');
  // A cabin pair can be long (Economy Class | Classe économique). The rule is
  // one line per pair, so the pass shrinks a sign pair to its column before
  // it lets it stack — and never below 68% of the stylesheet's size.
  const pAt = SRC.indexOf('function _fidsPairSeparators(');
  assert.ok(pAt >= 0, 'the pair pass must exist');
  const pass = SRC.slice(pAt, SRC.indexOf('\n}\n', pAt));
  assert.match(pass, /el\.closest\('\.g8-sign'\)/, 'the shrink is scoped to the sign');
  assert.match(pass, /data-g8-base/, 'measured against the stylesheet size, not its own earlier shrink');
  assert.match(pass, /var floor = \(el\.closest\('\.g8-sign-two'\) \? 0\.5 : 0\.68\);/, 'floor of 68%, half in the two panels (half the screen each)');
  assert.match(pass, /Math\.max\(base \* floor, base \* ratio \* 0\.985\)/);
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
  assert.match(f, /var _P = _g8SeqPanels\(_seq, true\);\s*return _g8SignHtml\(_P\.L, _P\.R\);/, 'the final call must use the builder');
  assert.match(f, /if \(_signOne\) return _g8SignCentreHtml\(_g8SeqCentre\(_seq, true\)\);/, 'or the one centre, as boarding does');
  for (const old of ['_acLanesBodyHtml(', '_pdLanesBodyHtml(', '_pbFlowBodyHtml(', 'g8-lanes-std', '_gateLblHalf']) {
    assert.ok(!f.includes(old), `${old} must not be rendered at the final call`);
  }
  // BOARDING SEQUENCES — every general value the plan uses, from the table:
  // Air Canada 3 • 4 • 5 • 6, Express 3 • 4, WestJet 3–9 (not 2 – 9: Zone 2
  // is priority), Porter Rows All, All passengers where none is numbered.
  const SEQ = require('../fids-current/js/boarding-sequence.js');
  const finalR = (c, ctx) => { const p = SEQ.plan(c, ctx); return SEQ.fmt(SEQ.valuesOf(p.full.filter((s) => s.side === 'R')), 4); };
  assert.equal(finalR('AC'), '3 \u2022 4 \u2022 5 \u2022 6', 'AC family: all zones');
  assert.equal(finalR('AC', { express: true }), '3 \u2022 4', 'Express: 3 • 4');
  assert.equal(finalR('QK'), '3 \u2022 4');
  assert.equal(finalR('WS'), '3+', "WestJet: Zone 3+, its own words");
  assert.equal(finalR('XX'), '', 'a carrier with no numbers: All passengers');
  assert.doesNotMatch(f, /'2 – 9'/);
  // and the left panel: Priority with the values called, no pre-boarding words
  const P = fn('_g8SeqPanels');
  assert.match(P, /var made = isFinal \? sideOf\(p\.full, 'L'\)/, 'at the final call every priority value is called');
  assert.match(P, /if \(!isFinal && cur && cur\.side === 'L'\)/, 'no pre-boarding panel at the final call');
  assert.doesNotMatch(f, /next:/, 'nothing comes after the final call');
  // THE FINAL DESIGN — the final call keeps the switch (ALL ZONES, all
  // remaining passengers), never the list of numbers under it: ALL ZONES
  // already says every zone, and WestJet's 3+ or Porter's rows would not
  // read as one line
  assert.match(P, /if \(sw\) \{\s*pR = _g8SeqAll\(p, lanesR\);/, 'the final right panel is the switch');
  assert.match(fn('_g8SeqCentre'), /if \(isFinal \|\| !cur \|\| B\.isSwitch\(p, st\)\) return _g8SeqAll\(p, lanesR\);/, 'and so is the one centre');
  assert.doesNotMatch(fn('_g8SeqAll'), /valuesOf|B\.fmt|label:/, 'no list of numbers under ALL ZONES');
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
