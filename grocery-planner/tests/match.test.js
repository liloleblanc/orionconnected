import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretLine, offerMatches, findCatalog, merchantAllowed } from '../src/engine/match.js';
import { fsaOf, cleanPostal } from '../src/engine/text.js';

test('list lines map to catalogue entries in either language, with quantities', () => {
  assert.equal(interpretLine('apples').key, 'apples');
  assert.equal(interpretLine('Pommes').key, 'apples');
  assert.equal(interpretLine('2 x milk').qty, 2);
  assert.equal(interpretLine('milk x3').qty, 3);
  assert.equal(interpretLine('orange juice').key, 'orange juice');
  assert.equal(interpretLine('oranges').key, 'oranges');
  assert.equal(findCatalog('œufs').key, 'eggs');
  const g = interpretLine('oat milk');
  assert.equal(g.generic, false); assert.equal(g.key, 'milk'); assert.deepEqual(g.qualifiers, ['oat']);
  const q = interpretLine('2% milk');
  assert.equal(q.key, 'milk'); assert.deepEqual(q.qualifiers, ['2%']);
  assert.equal(offerMatches(q, 'Sealtest Partly Skimmed 2% Milk 4L'), 2);
  assert.equal(offerMatches(q, 'NORTHUMBERLAND Milk'), 1);
  const z = interpretLine('zucchini');
  assert.equal(z.generic, true); assert.equal(z.key, 'zucchini');
  assert.equal(interpretLine('   '), null);
});

test('apples: fruit yes, potatoes, juice and deer attractant no', () => {
  const line = interpretLine('apples');
  assert.ok(offerMatches(line, 'Gala or Ambrosia Apples'));
  assert.ok(offerMatches(line, 'POMMES HONEYCRISP | HONEYCRISP APPLES'));
  assert.ok(!offerMatches(line, 'POMMES DE TERRE RUSSET'));
  assert.ok(!offerMatches(line, 'Apple juice 1.89 L'));
  assert.ok(!offerMatches(line, 'Attractifs minéraux, Pomme épicée, 20 lb'));
  assert.ok(!offerMatches(line, 'Apple Watch Series 9'));
});

test('milk: plain milk yes, flavoured, plant, pet and frozen no', () => {
  const line = interpretLine('milk');
  assert.ok(offerMatches(line, 'Sealtest Partly Skimmed 2% Milk 4L'));
  assert.ok(offerMatches(line, 'NORTHUMBERLAND Milk'));
  assert.ok(offerMatches(line, 'Lait Natrel sans lactose'));
  assert.ok(!offerMatches(line, 'Milk 2 Go Strawberry 1% M.F. Partly Skimmed Milk, 310-ml'));
  assert.ok(!offerMatches(line, 'Comfort Chews Dog Treats'));
  assert.ok(!offerMatches(line, 'Almond Breeze - Lait d\'amande non sucré'));
  assert.ok(!offerMatches(line, 'PC® FROZEN FRUIT 300-600 g or NO NAME® ICE MILK 1.5 L'));
  assert.ok(!offerMatches(line, 'Natrel 1% chocolate milk'));
});

test('cookies and eggs: packages yes, mixes, pet biscuits and cooked egg snacks no', () => {
  const c = interpretLine('cookies');
  assert.ok(offerMatches(c, 'Britannia Marie Gold biscuits'));
  assert.ok(offerMatches(c, 'BISCUITS CHIPS AHOY!, OU OREO CHRISTIE, 240-303 g'));
  assert.ok(!offerMatches(c, 'MÉLANGE À BISCUITS ISABELLE HUOT'));
  assert.ok(!offerMatches(c, 'Northern Biscuit Pumpkin Pie Dog Treats'));
  assert.ok(!offerMatches(c, 'BISCUITS SODA PREMIUM PLUS CHRISTIE'));
  const e = interpretLine('eggs');
  assert.ok(offerMatches(e, 'MARITIME PRIDE Large White Eggs'));
  assert.ok(!offerMatches(e, 'Burnbrae Farms Eggs2go! Peeled Hard Boiled Eggs, 2 pack'));
  assert.ok(!offerMatches(e, 'COMPLIMENTS BALANCE Egg Whites'));
});

test('generic lines need every typed word', () => {
  const line = interpretLine('sparkling water lime');
  assert.equal(line.key, 'water');
  assert.equal(offerMatches(line, 'Bubly Sparkling Water Lime 12 x 355 ml'), 0, 'sparkling is excluded for plain water');
  const g = interpretLine('zucchini');
  assert.ok(offerMatches(g, 'Green Zucchini'));
  assert.ok(!offerMatches(g, 'Yellow Squash'));
});

test('merchant filter keeps grocers, pharmacies only when allowed, nothing else', () => {
  const allowed = new Map([['sobeys', 'grocery'], ['shoppers drug mart', 'pharmacy']]);
  assert.ok(merchantAllowed('Sobeys', allowed));
  assert.ok(merchantAllowed('Shoppers Drug Mart', allowed));
  assert.ok(!merchantAllowed('Shoppers Drug Mart', allowed, { includePharmacies: false }));
  assert.ok(!merchantAllowed('Princess Auto', allowed));
  assert.ok(merchantAllowed('Anything', null));
});

test('postal codes', () => {
  assert.equal(cleanPostal('e1c 1e8'), 'E1C1E8'); assert.equal(cleanPostal('E1C'), null); assert.equal(fsaOf('E4P 2A3'), 'E4P');
});
