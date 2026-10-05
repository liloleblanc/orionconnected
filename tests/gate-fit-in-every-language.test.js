'use strict';

// What the pictures of the boards in nine languages found, held here so it
// stays fixed (v23995). Each was seen on a rendered board at 1680x1050.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const fnBody = (name) => {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' exists');
  let d = 0, i = CORE.indexOf('{', at);
  for (let j = i; j < CORE.length; j++) { if (CORE[j] === '{') d++; else if (CORE[j] === '}' && --d === 0) return CORE.slice(at, j + 1); }
  return CORE.slice(at);
};

test('a sign row: the number yields before the word is drawn under it (Zones | Zone  3 • 4 • 5 • 6)', () => {
  const fit = fnBody('_fidsSignRowFit');
  assert.match(fit, /data-g8-vbase/, 'the number keeps its stylesheet size to come back to');
  assert.match(fit, /vbase \* 0\.55/, 'a floor for the number');
  assert.match(fit, /selectNodeContents/, 'the word is measured by its text, not its squeezed box');
  assert.match(fnBody('_fidsPairSeparators'), /_fidsSignRowFit\(scope\)/, 'it runs before the pairs are fitted');
  assert.match(CORE, /querySelectorAll\('\.g8-sign \.g8-sign-value\[data-g8-vbase\]'\)/, 'a resize measures afresh');
});

test('a flight number fitted once stays fitted, and is fitted again once the fonts load (WS33…)', () => {
  const f = fnBody('_fitFlightCells');
  assert.match(f, /var fitted = cell\.style\.getPropertyValue\('font-size'\)/);
  assert.match(f, /if \(fitted\) cell\.style\.setProperty\('font-size', fitted, 'important'\)/, 'the memo puts the fitted size back');
  assert.match(f, /document\.fonts\.status === 'loaded'/, 'the memo keys on the fonts');
  assert.match(f, /while \(cell\.scrollWidth > cell\.clientWidth && size > floorPx/, 'no slack: any overflow draws the ellipsis');
  assert.match(CORE, /document\.fonts\.addEventListener\('loadingdone', function \(\) \{ _fitFlightCells\(\); \}\)/);
});

test('a list keeps its dot with the item before it, so no line opens with ·', () => {
  for (const name of ['_gateLbl1Html', '_g8SignLines']) assert.match(fnBody(name), /replace\(\/ \\u00B7 \/g, '\\u00A0\\u00B7 '\)/, name);
});

test('the countdown headlines carry their language and direction', () => {
  assert.match(CORE, /_gateLbl\('boardSoon', _frF, function \(w, i, l\) \{ _cdL\[i \? 1 : 0\] = BoardStrings\.markHalf\(w, l, 'boardSoon'\); return ''; \}, ''\);/);
});

test('the pending caption is short enough in Portuguese for the operator\'s mark to keep its size', () => {
  assert.match(CORE, /acPending: \{[^}]*pt:'Aeronave a confirmar'/);
});
