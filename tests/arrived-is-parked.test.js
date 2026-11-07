'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24124 — A ROW THAT SAYS ARRIVED IS PARKED ON THE MAP.
//
// Halifax gate 15, 2026-11-06: the card said Arrived (the aeroplane reached
// the gate at 18:43) while the map still moved it, on a live position that
// lags the blocks and on the taxi drawn from the landing. Since v24120
// Arrived is the on-stand word on every board and Landed is down and
// taxiing, so the card and the map now agree: Landed taxis, Arrived is on its
// stand. One move to the gate, then it stays.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const fnSrc = (name) => {
  const a = CORE.indexOf('\nfunction ' + name + '(') + 1;
  assert.ok(a > 0, name + ' must exist');
  return CORE.slice(a, CORE.indexOf('\n}\n', a) + 2);
};

test('the on-blocks word is the row own Arrived, never a clock-made one', () => {
  const f = new Function(fnSrc('_gateRawStatus') + fnSrc('_gateOnBlocksWord') + 'return _gateOnBlocksWord;')();
  assert.equal(f({ status: 'arrived' }), true);
  assert.equal(f({ status: 'Arrived' }), true);
  assert.equal(f({ status: 'landed' }), false, 'Landed is down and still taxiing');
  assert.equal(f({ status: 'arrived', _stInferred: true }), false, 'a status the clock made is not the feed word');
  assert.equal(f({ status: 'ontime' }), false);
  assert.equal(f(null), false);
});

test('Arrived ends the taxi and drops the live position after the blocks', () => {
  // the taxi answer: none for an Arrived row, and a running taxi is over
  assert.match(fnSrc('_gateTaxiWhere'), /if \(_gateOnBlocksWord\(inb\)\) \{ if \(mine && !st\.done\) st\.done = true; return null; \}/);
  // the one answer: a live fix of a landed aeroplane is dropped once the row says Arrived
  assert.match(fnSrc('_gateAircraftWhereIn'), /if \(!\(here0 \|\| \(!fx0\.onGround && fx0\.at > land\)\)\) fx0 = null;\s*\/\/[^\n]*\n\s*else if \(_gateOnBlocksWord\(inb\)\) fx0 = null;/);
});
