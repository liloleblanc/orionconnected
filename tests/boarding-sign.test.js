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
  // PAL: open flow
  assert.match(a, /_g8SignPair\(_pbPre \? 'preboard' : 'genboard'/, "PAL's called panel names the phase");
  // generic: groups
  assert.match(a, /_g8SignPair\('groupLabel'/, 'everyone else is titled Group');
  assert.match(a, /_g8SignNext\('groupLabel', /, 'with the next group as a Next line');
  // lanes: every family passes one on each side
  const lanes = (a.match(/lanes: _gateLaneLbl\(/g) || []).length;
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
  assert.match(T, /^  boarding:\s*\{ en:'Boarding', fr:'Embarquement'/m, "'Boarding' must read in both languages");
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

test('the CSS wins, and keeps the halves unbreakable', () => {
  const at = CSS.lastIndexOf('ONE SIGN FOR EVERY AIRLINE');
  assert.ok(at >= 0, 'the sign block must exist');
  const block = CSS.slice(at);
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
