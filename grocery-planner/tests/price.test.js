import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, parseSize, parseMultiBuy, costFor } from '../src/engine/price.js';

test('per-pound flyer prices convert to a per-kilogram base', () => {
  const p = parsePrice({ price: 0.99, postText: '/lb', name: 'Gala or Ambrosia Apples' });
  assert.equal(p.unit, 'lb'); assert.equal(p.baseUnit, 'kg');
  assert.ok(Math.abs(p.basePrice - 2.18) < 0.01);
});

test('"lb $4.96/kg" and "Scene + member price /lb $4.39/kg" are per pound, and the member flag is set', () => {
  const a = parsePrice({ price: 2.25, postText: 'lb $4.96/kg', name: 'HONEYCRISP ORCHARD APPLES' });
  assert.equal(a.unit, 'lb'); assert.ok(Math.abs(a.basePrice - 4.96) < 0.01);
  const b = parsePrice({ price: 1.99, postText: 'Scene + member price /lb $4.39/kg', name: 'AMBROSIA APPLES' });
  assert.equal(b.unit, 'lb'); assert.deepEqual(b.flags, ['member']);
});

test('sizes written in the name: bags, ranges, multipacks, hyphens, no space', () => {
  assert.deepEqual(parseSize("FARMER'S MARKET MCINTOSH, 4 LB BAG"), { quantity: 4, unit: 'lb', text: '4 lb' });
  assert.deepEqual(parseSize('FUDGEE-O, OREO OR CHIPS AHOY! COOKIES, 251-303 G'), { quantity: 251, unit: 'g', text: '251-303 g' });
  assert.deepEqual(parseSize('Almond Breeze, 6 × 946 ml'), { quantity: 5676, unit: 'ml', text: '6 × 946 ml' });
  assert.deepEqual(parseSize('Milk 2 Go Strawberry, 310-ml'), { quantity: 310, unit: 'ml', text: '310-ml' });
  assert.deepEqual(parseSize('Sealtest 2% Milk 4L'), { quantity: 4, unit: 'l', text: '4l' });
  assert.deepEqual(parseSize('Large White Eggs, 1 dozen'), { quantity: 12, unit: 'ea', text: '1 dozen' });
  assert.deepEqual(parseSize('Bear Paws, 40 Pouches'), { quantity: 40, unit: 'ea', text: '40 pouches' });
  assert.equal(parseSize('Biscuits'), null);
});

test('a 4 lb bag at $4.99 is $2.75/kg; a 4 L jug at $7.46 is $1.87/L', () => {
  const bag = parsePrice({ price: 4.99, name: "FARMER'S MARKET MCINTOSH, 4 LB BAG" });
  assert.ok(Math.abs(bag.basePrice - 2.75) < 0.01); assert.equal(bag.baseUnit, 'kg');
  const jug = parsePrice({ price: 7.46, name: 'Beatrice Fresh Skim Milk 0% M.F. - 4L' });
  assert.ok(Math.abs(jug.basePrice - 1.865) < 0.01); assert.equal(jug.baseUnit, 'l');
});

test('multi-buy "2/5.00" gives a unit price; a sticker that already is a unit price ignores the story', () => {
  assert.deepEqual(parseMultiBuy('2/5.00'), { count: 2, total: 5 });
  assert.deepEqual(parseMultiBuy('3 for $10'), { count: 3, total: 10 });
  assert.deepEqual(parseMultiBuy('2 pour 5,00 $'), { count: 2, total: 5 });
  assert.equal(parseMultiBuy('SAVE 50¢'), null);
  const p = parsePrice({ price: null, preText: '2/5.00', name: 'Bread' });
  assert.equal(p.price, 2.5); assert.deepEqual(p.multiBuy, { count: 2, total: 5 });
  const q = parsePrice({ price: 2.89, saleStory: '100 Scene+ PTS when you buy 2', name: 'Bread' });
  assert.equal(q.price, 2.89); assert.equal(q.multiBuy, null); assert.ok(q.flags.includes('points_on_multiple'));
});

test('flags: plus tax, online only, limited time, each', () => {
  assert.ok(parsePrice({ price: 3.99, postText: '+tx', name: 'x' }).flags.includes('plus_tax'));
  assert.ok(parsePrice({ price: 12.49, preText: 'Online Price', saleStory: 'Online Price', name: 'x' }).flags.includes('online'));
  assert.ok(parsePrice({ price: 2.49, postText: 'SATURDAY, OCTOBER 31 & SUNDAY, NOVEMBER 1 ONLY!', name: 'x' }).flags.includes('limited_time'));
  const ea = parsePrice({ price: 2.25, postText: 'CH.', saleStory: 'SAVE 50¢', name: 'Pain Wonder bread' });
  assert.equal(ea.unit, 'ea'); assert.ok(ea.flags.includes('sale'));
});

test('costFor: by weight when comparable, by package for pkg lines, sticker with a note otherwise', () => {
  const apples = parsePrice({ price: 0.99, postText: '/lb', name: 'Apples' });
  const c = costFor(apples, { qty: 1, unit: 'kg' });
  assert.equal(c.comparable, true); assert.ok(Math.abs(c.cost - 2.18) < 0.01);
  const box = parsePrice({ price: 12.49, name: 'Bear Paws, 40 Pouches' });
  const b = costFor(box, { qty: 1, unit: 'pkg' });
  assert.equal(b.cost, 12.49); assert.equal(b.comparable, true);
  const unknown = parsePrice({ price: 3.99, name: 'EMPIRE APPLES' });
  const u = costFor(unknown, { qty: 1, unit: 'kg' });
  assert.equal(u.cost, 3.99); assert.equal(u.comparable, false); assert.equal(u.note, 'size unknown');
  const snack = parsePrice({ price: 1.69, name: 'Hard Boiled Eggs, 88 g' });
  const s = costFor(snack, { qty: 12, unit: 'ea' });
  assert.equal(s.comparable, false); assert.match(s.note, /sold by kg/);
});
