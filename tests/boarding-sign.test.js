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
  assert.match(a, /_g8SignPair\(_gkey, _gkey === 'zones'\)/, 'everyone else is titled Group or Zones by their own model');
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
  const BRAND = new Set(['pdReserve', 'pdClassic', 'avidTraveller']);
  const KEYS = ['priority', 'zones', 'rows', 'groupLabel', 'boarding', 'preboard', 'genboard', 'allPax',
    'nextUp', 'boardConv', 'useLanes', 'useLane', 'comingUp', 'nowBoarding', 'boardSoon', 'preboardList',
    'photoId', 'pdReserve', 'pdClassic', 'avidTraveller'];
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
  assert.match(col, /S\.marks \? ' has-marks' : ''/);
  // The roster is a list and wraps in its own slot; poured into a nowrap
  // line it lost three of its five groups.
  assert.match(a, /roster: _pdPre \? \(_gateLbl1\('preboardList', _frF\) \|\| ''\) : ''/, 'the roster has its own slot');
  assert.match(col, /if \(S\.roster\) h \+= '<div class="g8-sign-roster">'/, 'which the column renders');
  // During pre-boarding the Classic panel says it is not being called yet.
  assert.match(a, /note: _pdPre \? _g8SignLines\('boardSoon'\) : ''/, "Porter's called panel says 'will begin shortly' during pre-boarding");
  // PAL says 'Pre-boarding' once, not on both panels.
  assert.match(a, /value: _g8SignPair\(_pbPre \? 'boardSoon' : 'genboard'\)/);
  assert.match(a, /next: _pbPre \? _g8SignNext\(null, null, 'genboard'\) : ''/);
  // Zone carriers are titled Zones, and a single zone is singular.
  assert.match(a, /AIRLINE_ZONES\[airlineCode\] \|\| \{\}\)\.label === 'Zone'\) \? 'zones' : 'groupLabel'/);
  assert.match(fn('_g8SignNext'), /groupKey = 'zone'/, 'a single number takes the singular');
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
