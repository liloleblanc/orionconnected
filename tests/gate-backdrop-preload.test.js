'use strict';
// v24145: the gate backdrops (Porter pattern panel, Air Canada roundel) are
// fetched early only where a gate is drawn.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'fids-current', f), 'utf8');
const STATIC = /<link rel="preload" as="image" href="logos\/Backgrounds\//g;

test('departures and baggage pages carry no static preload of a gate backdrop', () => {
  assert.equal((read('fids.html').match(STATIC) || []).length, 0);
  assert.equal((read('bids.html').match(STATIC) || []).length, 0);
});

test('the gate page preloads each backdrop once', () => {
  const g = read('gids.html');
  assert.equal((g.match(/<link rel="preload" as="image" href="logos\/Backgrounds\/PD\/porter-pattern-panel\.png"/g) || []).length, 1);
  assert.equal((g.match(/<link rel="preload" as="image" href="logos\/Backgrounds\/AC\/aircanada-roundel-fade\.svg"/g) || []).length, 1);
});

test('the departures page asks for them early only when the address opens on a gate, after the intent is stamped', () => {
  const h = read('fids.html');
  const stamp = h.indexOf("setAttribute('data-fids-url-screen', 'gate')");
  const ask = h.indexOf("getAttribute('data-fids-url-screen') === 'gate'");
  assert.ok(stamp > 0 && ask > stamp, 'the check runs after the stamp');
  assert.match(h.slice(ask, ask + 600), /porter-pattern-panel\.png[\s\S]*aircanada-roundel-fade\.svg[\s\S]*l\.rel = 'preload'/);
});
