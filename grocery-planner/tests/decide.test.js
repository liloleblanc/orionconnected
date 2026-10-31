import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/engine/decide.js';
import { parsePrice } from '../src/engine/price.js';
import { interpretLine } from '../src/engine/match.js';

const offer = (merchant, name, price, extra = {}) => ({ id: merchant + ':' + name, source: 'test', kind: 'sale', merchant, merchantKey: merchant.toLowerCase(), name, parsed: parsePrice({ price, name, ...extra }) });

test('one store that has everything beats a cheaper split when the trip costs more than it saves', () => {
  const lines = ['apples', 'milk', 'cookies'].map(interpretLine);
  const offersByLine = [
    [offer('A', 'Apples 3 lb bag', 3.0), offer('B', 'Apples 3 lb bag', 2.7)],
    [offer('A', 'Milk 4L', 6.0), offer('B', 'Milk 4L', 5.8)],
    [offer('A', 'Cookies 300 g', 2.0), offer('B', 'Cookies 300 g', 2.1)],
  ];
  const r = plan({ lines, offersByLine, tripCost: 4, maxStores: 2 });
  assert.deepEqual(r.recommended.stores, ['B']);
  assert.equal(r.recommended.missing.length, 0);
  const split = r.plans.find(p => p.stores.length === 2);
  assert.ok(split.score > r.recommended.score);
});

test('a split wins when the trip is cheap and the saving is real', () => {
  const lines = ['apples', 'milk'].map(interpretLine);
  const offersByLine = [
    [offer('A', 'Apples', 1.0, { postText: '/lb' }), offer('B', 'Apples', 2.0, { postText: '/lb' })],
    [offer('A', 'Milk 4L', 9.0), offer('B', 'Milk 4L', 5.0)],
  ];
  const r = plan({ lines, offersByLine, tripCost: 0.5, maxStores: 2 });
  assert.deepEqual(r.recommended.stores.sort(), ['A', 'B']);
  assert.equal(r.recommended.tripCost, 0.5);
});

test('an item no store carries is reported, and a store missing an item pays a stand-in', () => {
  const lines = ['apples', 'milk', 'bread'].map(interpretLine);
  const offersByLine = [
    [offer('A', 'Apples 3 lb bag', 3.0)],
    [offer('B', 'Milk 4L', 6.0)],
    [],
  ];
  const r = plan({ lines, offersByLine, tripCost: 10, maxStores: 1 });
  assert.deepEqual(r.notFound.map(l => l.label), ['bread']);
  assert.equal(r.recommended.stores.length, 1);
  assert.equal(r.recommended.missing.length, 1);
  assert.ok(r.recommended.standIn > 0);
});

test('a comparable offer beats a size-unknown one at the same store even when the unknown is cheaper', () => {
  const lines = ['milk'].map(interpretLine);
  const offersByLine = [[offer('A', 'Milk', 1.97), offer('A', 'Milk 4L', 5.94)]];
  const r = plan({ lines, offersByLine, tripCost: 4, maxStores: 1 });
  assert.equal(r.items[0].best.offer.name, 'Milk 4L');
  assert.ok(Math.abs(r.items[0].best.cost - 2.97) < 0.01); // 2 L of a 4 L jug
});

test('online-only prices stay out unless asked', () => {
  const lines = ['cookies'].map(interpretLine);
  const online = offer('Costco', 'Bear Paws, 40 Pouches', 12.49, { preText: 'Online Price' });
  const shelf = offer('Sobeys', 'Biscuits', 2.19);
  assert.deepEqual(plan({ lines, offersByLine: [[online, shelf]], maxStores: 1 }).recommended.stores, ['Sobeys']);
  const r = plan({ lines, offersByLine: [[online, shelf]], maxStores: 1, includeOnline: true });
  assert.equal(r.items[0].byStore.length, 2);
});

test('quantities multiply the cost', () => {
  const lines = ['2 x milk'].map(interpretLine);
  const r = plan({ lines, offersByLine: [[offer('A', 'Milk 2L', 5.0)]], maxStores: 1 });
  assert.equal(r.recommended.total, 10);
});
