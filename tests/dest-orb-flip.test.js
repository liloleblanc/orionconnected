'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23874 — ON A THROUGH FLIGHT THE ORB SAYS THE LEG THE NAME SAYS.
//
// Reported from a United board at MCO: UA1227 runs to Newark and on to San
// Francisco, and the panel read 'SFO' in the orb beside the word 'Newark'.
//
// The rule already existed in the source — "if the city flips and the chip
// can't flip with it, drop the chip entirely" — and had already been applied
// once, by deleting the IATA from the shelf title. It broke when the code
// reappeared in the orb as a STATIC value: the rule was attached to a place
// rather than to the code itself, so moving the code escaped it.
//
// These tests attach it to the code. They fail if the orb or the arrival row
// is ever wired back to the frozen destination, and they fail if a code flip
// and a city flip can drift apart.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

// The real builder, taken out of the source rather than restated here, so the
// test cannot pass against a copy that has drifted from what ships.
function loadFlipBuilder() {
  const m = CORE.match(/function _destFlipFromItems\(items, kind, cls\) \{[\s\S]*?\n\}/);
  assert.ok(m, '_destFlipFromItems must exist');
  // eslint-disable-next-line no-new-func
  return new Function(m[0] + '; return _destFlipFromItems;')();
}

const parse = (html) => ({
  items: JSON.parse(decodeURIComponent(html.match(/data-destflip="([^"]*)"/)[1])),
  kind: html.match(/data-dfk="([^"]*)"/)[1],
});

// The ticker advances every [data-destflip] off ONE shared counter. Reproduced
// here exactly: a per-element index would pass this test and still drift on a
// real board, which is the bug being guarded.
const valueAt = (el, idx) => {
  const it = el.items[idx % el.items.length];
  return el.kind === 'ia' ? (it.ia || '') : it.c;
};

test('the orb renders the flipping code, not the frozen destination', () => {
  assert.match(CORE, /var _dfIata = _dfStops \? _destFlipStops\(_dfStops, 'ia'\) : null;/,
    'a code flip must be built from the same stops as the city flip');
  assert.match(CORE, /var _orbCode = _dfIata \|\| \(_dfStops \? '' : _destIataDisp\);/,
    'multi-stop with no usable code flip must yield an empty orb code, never a frozen one');
  assert.match(CORE, /\+ _shelf\(_badge\(_orbCode\s*\n\s*\? '<span class="v2-fi-orbcode">' \+ _orbCode \+ '<\/span>'/,
    'the orb must render _orbCode');
  assert.doesNotMatch(CORE, /_badge\(_destIataDisp\s*\n\s*\? '<span class="v2-fi-orbcode">/,
    'the orb must not be wired back to the static destination code');
  assert.match(CORE, /\+ _codeSeg\(_orbCode\);/,
    'the arrival row carries the same code as the orb');
});

test('the code and the city never disagree, on any tick', () => {
  const build = loadFlipBuilder();
  const stops = [{ c: 'Newark', ia: 'EWR' }, { c: 'San Francisco', ia: 'SFO' }];
  const city = parse(build(stops, 'c'));
  const code = parse(build(stops, 'ia'));
  for (let i = 0; i < 12; i++) {
    const name = valueAt(city, i);
    const iata = valueAt(code, i);
    const leg = stops.find((s) => s.c === name);
    assert.ok(leg, `tick ${i}: '${name}' is not one of the legs`);
    assert.equal(iata, leg.ia, `tick ${i}: orb '${iata}' beside name '${name}'`);
  }
});

test('three legs stay in step too', () => {
  const build = loadFlipBuilder();
  const stops = [{ c: 'Denver', ia: 'DEN' }, { c: 'Reno', ia: 'RNO' }, { c: 'Seattle', ia: 'SEA' }];
  const city = parse(build(stops, 'c'));
  const code = parse(build(stops, 'ia'));
  for (let i = 0; i < 9; i++) {
    const leg = stops.find((s) => s.c === valueAt(city, i));
    assert.equal(valueAt(code, i), leg.ia, `tick ${i}`);
  }
});

test('a leg with no code suppresses the whole chip rather than freezing one', () => {
  const build = loadFlipBuilder();
  const partial = [{ c: 'Newark', ia: 'EWR' }, { c: 'Somewhere', ia: '' }];
  assert.equal(build(partial, 'ia'), null,
    'one codeless leg must suppress the code flip — a half-right chip is worse than none');
  assert.ok(build(partial, 'c'), 'the city still flips; only the code is withheld');
});

test('a single-destination flight is untouched', () => {
  const build = loadFlipBuilder();
  assert.equal(build([{ c: 'Atlanta', ia: 'ATL' }], 'ia'), null);
  assert.equal(build([{ c: 'Atlanta', ia: 'ATL' }], 'c'), null);
});
