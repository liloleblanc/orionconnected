'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE FRENCH CITY NAMES ARE NOT SILENTLY OVERWRITTEN.
//
// CITY_FR opens with a curated block — LE CAIRE, LE CAP, CARTHAGÈNE,
// DJEDDAH, RIYAD, SAINT-DOMINGUE, THESSALONIQUE, HÉRAKLION — and was then
// followed, hundreds of lines later, by a bulk "international airports" block
// that declared the same keys again in English. In an object literal the last
// declaration wins, so every one of those French names was dead on arrival
// and the boards printed CAIRO on a French line. Fifty-one keys were declared
// twice; nine of them changed the word. This pins the tables to one
// declaration per key, so a later append cannot bury a curated name again.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

function literal(name) {
  const at = SRC.indexOf('const ' + name + ' = {');
  assert.ok(at >= 0, `${name} must exist`);
  return SRC.slice(at, SRC.indexOf('\n};', at)).replace(/\/\/.*$/gm, '');
}
function keysOf(lit) {
  return [...lit.matchAll(/([A-Z0-9]{3}):\s*'/g)].map(m => m[1]);
}

for (const name of ['CITY_FR', 'CITY']) {
  test(`${name} declares every key once`, () => {
    const keys = keysOf(literal(name));
    assert.ok(keys.length > 1000, `${name} should be a large table, found ${keys.length} keys`);
    const seen = new Set(), dups = [];
    for (const k of keys) { if (seen.has(k)) dups.push(k); seen.add(k); }
    assert.deepEqual([...new Set(dups)], [], `${name}: these keys are declared more than once — the later one silently wins`);
  });
}

test('the curated French names are the ones the board reads', () => {
  const lit = literal('CITY_FR');
  const table = new Function(lit + '\n};\nreturn CITY_FR;')();
  const expect = { CAI: 'LE CAIRE', CPT: 'LE CAP', CTG: 'CARTHAGÈNE', GUA: 'GUATEMALA', HER: 'HÉRAKLION',
                   JED: 'DJEDDAH', RUH: 'RIYAD', SDQ: 'SAINT-DOMINGUE', SKG: 'THESSALONIQUE',
                   HAV: 'LA HAVANE', VCE: 'VENISE', LCY: 'LONDRES', BSL: 'BÂLE' };
  for (const [k, v] of Object.entries(expect)) assert.equal(table[k], v, `${k} on a French line`);
});
