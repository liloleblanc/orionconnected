'use strict';

// WHY THIS EXISTS
//
// v23934: on Québec City's gate 23 the inbound line of the lower right panel
// read "P6687 de | from Iles De La Madeleine | Ygr", and the aircraft caption
// read "SF3".
//
// YQB's feed names Pascan's origin ('Iles de la Madeleine') with a null code.
// The board resolves a code from the name (formatCityIata, unambiguous names
// only), so the origin arrives at the gate card as 'Iles de la Madeleine |
// YGR'. The card title-cased that whole string, code included, and with no
// feed code there was no code chip: 'Ygr' sat in the city's words. The same
// feed sends the aircraft as its IATA type code alone ('SF3'), which had no
// name in IATA_AIRCRAFT, so the caption printed it raw.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

/** The gate card's origin block, from its city to its display string. */
function originBlock() {
  const a = CORE.indexOf('      // Origin display: "Calgary (YYC)"');
  assert.ok(a > 0, 'the origin block is where it was');
  const b = CORE.indexOf('var _origDisplay = ', a);
  assert.ok(b > a && b - a < 2000, 'and it ends at the display string');
  // eslint-disable-next-line no-new-func
  return Function('_origIata', '_ib', 'CITY', 'AP', 'tc',
    CORE.slice(a, b) + 'return { city: _origCity, code: _origIata };');
}
const tc = (s) => String(s).toLowerCase().replace(/(^|[\s\-/.])(\S)/g, (m, p, c) => p + c.toUpperCase());
const CITY = { YGR: 'ILES-DE-LA-MADELEINE', YYC: 'CALGARY' };

test('a code the board resolved from the name goes to the code chip, not into the city', () => {
  const run = originBlock();
  const r = run('', { origin: 'Iles de la Madeleine | YGR' }, CITY, {}, tc);
  assert.equal(r.code, 'YGR', 'the code chip gets it, in capitals');
  assert.equal(r.city, 'Iles De La Madeleine', 'the city keeps the feed\'s own words, without the code');
  assert.doesNotMatch(r.city, /ygr|\|/i);
});

test('rows the feed already coded, and rows with no code at all, are built as before', () => {
  const run = originBlock();
  assert.deepEqual(run('YYC', { origin: 'Calgary | YYC' }, CITY, {}, tc), { city: 'Calgary', code: 'YYC' });
  assert.deepEqual(run('', { origin: 'Somewhere' }, CITY, {}, tc), { city: 'Somewhere', code: '' });
  assert.deepEqual(run('', { origin: '' }, CITY, {}, tc), { city: '', code: '' });
});

test('the Saab 340 has a name: the caption never prints the type code', () => {
  const tbl = CORE.slice(CORE.indexOf('const IATA_AIRCRAFT = {'), CORE.indexOf('\n};\n', CORE.indexOf('const IATA_AIRCRAFT = {')));
  assert.match(tbl, /'SF3':'Saab 340'/);
});
