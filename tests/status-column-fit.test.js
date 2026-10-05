'use strict';

// v23970 — NO STATUS IS EVER CUT.
//
// On a French-only departures board, and at Montréal (fr,en), 'Embarquement'
// was cut to 'Embarqueme…' in the status column. The column keeps the
// stylesheet's width on boards with no geometry pass, and where the geometry
// pass runs it was sized from the statuses on screen when it ran (a board of
// 'Prévu') and cached per flight set. Two holds:
//   · every render of the table fits each status cell's own word
//     (_fidsNoStatusClip) after the swap and after the settle pass;
//   · the geometry pass sizes the status column for every status word of the
//     page's language, not only the ones on screen.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

test('every table render fits its status cells', () => {
  const at = SRC.indexOf('tbody.innerHTML = _newHtml;');
  assert.ok(at > 0);
  const after = SRC.slice(at, at + 1600);
  assert.match(after, /boardAutofit\(true\)[\s\S]*_fidsNoStatusClip\(document\.getElementById\('fidsTable'\)\)/,
    'the swap is followed by the status fit');
  assert.match(after, /setTimeout\(function \(\) \{ boardAutofit\(false\); try \{ _fidsNoStatusClip\(document\.getElementById\('fidsTable'\)\); \} catch \(e2\) \{\} \}, 350\)/,
    'and so is the settle pass');
});

test('the geometry pass sizes the status column for every status of its language', () => {
  assert.match(SRC, /if \(td0\.classList\.contains\('td-status'\)\) \{[\s\S]{0,900}Object\.keys\(SS\)\.forEach\(function \(k\) \{[\s\S]{0,200}var _sw = SL\(k\);/);
});

test('the fit steps a cell down until its word fits, never below 9px', () => {
  const fn = SRC.slice(SRC.indexOf('function _fidsNoStatusClip(tbl) {'), SRC.indexOf('async function _gateNumbersPoll()'));
  assert.match(fn, /while \(guard-- > 0 && td\.scrollWidth > td\.clientWidth \+ 1 && f > 9\)/);
});
