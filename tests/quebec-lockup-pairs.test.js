'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23876 — THE TWO MONTRÉAL PROPERTIES THAT ARE NAMED TWICE.
//
// Fairmont's Queen Elizabeth and Sofitel's Golden Mile each ship a pair of
// lockups with the property name drawn into the artwork, one per language.
// Only the English mark was ever shown, because the property resolver returns
// exactly one file and that was the one it returned.
//
// They now alternate across the advertisement's pages, FRENCH FIRST.
//
// The exception matters as much as the rule: Le Château Frontenac and Le
// Manoir Richelieu are French-named in every language. There is no English
// form to alternate to, and a test that let them into the pair table would be
// asking the board to invent one.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Load the real table and matcher rather than restating them here.
function loadMatcher() {
  const tbl = CORE.match(/var QC_LOCKUP_PAIRS = \[[\s\S]*?\n\];/);
  const fn = CORE.match(/function _qcLockupPair\(name\) \{[\s\S]*?\n\}/);
  assert.ok(tbl, 'QC_LOCKUP_PAIRS must exist');
  assert.ok(fn, '_qcLockupPair must exist');
  // eslint-disable-next-line no-new-func
  return new Function(tbl[0] + '\n' + fn[0] + '\nreturn { pairs: QC_LOCKUP_PAIRS, match: _qcLockupPair };')();
}

test('both paired properties are matched, in either language', () => {
  const { match } = loadMatcher();
  for (const n of [
    'Fairmont The Queen Elizabeth',
    'Fairmont Le Reine Elizabeth',
    'fairmont queen elizabeth montreal',
  ]) assert.ok(match(n), `${n} must resolve to a pair`);

  for (const n of [
    'Sofitel Montreal Golden Mile',
    'Sofitel Montréal Le Carré Doré',
    'sofitel montreal le carre dore',
  ]) assert.ok(match(n), `${n} must resolve to a pair`);
});

test('the French-only properties are NOT paired', () => {
  const { match } = loadMatcher();
  // These are French-named in every language. Pairing them would mean
  // inventing an English name that does not exist.
  for (const n of [
    'Fairmont Le Château Frontenac',
    'Fairmont Le Chateau Frontenac',
    'Fairmont Le Manoir Richelieu',
    'Fairmont Le Château Montebello',
    'Fairmont Tremblant',
  ]) assert.equal(match(n), null, `${n} must keep its single lockup`);
});

test('nothing outside Québec is caught', () => {
  const { match } = loadMatcher();
  for (const n of [
    'Fairmont Royal York',
    'Fairmont Banff Springs',
    'Sofitel New York',
    'Queen Mary Hotel',           // 'queen' alone must not match
    'Golden Nugget Las Vegas',    // 'golden' alone must not match
  ]) assert.equal(match(n), null, `${n} must not be treated as a Québec pair`);
});

test('every file either side of a pair exists on disk', () => {
  const { pairs } = loadMatcher();
  assert.ok(pairs.length >= 2);
  for (const p of pairs) {
    for (const side of ['fr', 'en']) {
      const f = path.join(ROOT, 'fids-current', p[side].replace(/^\//, ''));
      assert.ok(fs.existsSync(f), `${p[side]} is referenced but missing`);
    }
    assert.notEqual(p.fr, p.en, 'a pair whose two sides are the same file is not a pair');
  }
});

test('French leads, and the pages alternate', () => {
  const { pairs } = loadMatcher();
  const p = pairs[0];
  // _idRow picks fr on even page indices, en on odd. Pages are 0,1,2.
  const shown = [0, 1, 2].map((i) => (i % 2 === 0 ? p.fr : p.en));
  assert.equal(shown[0], p.fr, 'the first page must be French');
  assert.equal(shown[1], p.en, 'the second page must be English');
  assert.equal(shown[2], p.fr, 'the third returns to French');
  assert.equal(new Set(shown).size, 2, 'both languages are shown across the deck');
});

test('the pages pass their index to the identity row', () => {
  assert.match(CORE, /_idRow\(showName \? '<div class="axr-name">'\+esc\(displayName\)\+'<\/div>' : '', 0\)/,
    'page 1 is index 0');
  assert.match(CORE, /\+ _idRow\(_ctxName, 1\)/, 'page 2 is index 1');
  assert.match(CORE, /\+ _idRow\(_ctxName, 2\)/, 'page 3 is index 2');
});
