'use strict';

// WHY THIS EXISTS
//
// A feed that names the Dash 8-400 by its marketing name alone,
// 'Bombardier Q400', lost the picture: aircraftCodeToIata strips the maker,
// and the bare 'Q400' matched none of the DHC-8 / Dash 8 patterns, so it fell
// through to the first three characters, 'Q40', a file that does not exist.
// The gate then hid the aircraft while the caption (which reads the name)
// said De Havilland Dash 8-400. The Q-series names now resolve to the same
// codes as the Dash 8 names.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

function fnSource(name) {
  const i = CORE.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1);
}
const toIata = new Function('return (' + fnSource('aircraftCodeToIata') + ')')();

test('the Q-series marketing names resolve to the Dash 8 codes', () => {
  for (const s of ['Bombardier Q400', 'Q400', 'Q-400', 'De Havilland Q400', 'Bombardier Q400 NextGen']) assert.equal(toIata(s), 'DH4', s);
  assert.equal(toIata('Bombardier Q300'), 'DH3');
  assert.equal(toIata('Bombardier Q200'), 'DH2');
  assert.equal(toIata('Bombardier Q100'), 'DH1');
});

test('the Dash 8 names and codes that already worked are unchanged', () => {
  for (const s of ['DH8D', 'DHC-8-400', 'Dash 8 Q400', 'Bombardier Dash 8 Q400', 'De Havilland Dash 8-400', 'DH4']) assert.equal(toIata(s), 'DH4', s);
  assert.equal(toIata('DHC-8-300'), 'DH3');
  assert.equal(toIata('Bombardier CRJ900'), 'CR9');
});
