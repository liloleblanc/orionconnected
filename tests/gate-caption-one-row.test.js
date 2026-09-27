'use strict';

// WHY THIS EXISTS
//
// The caption under the gate aircraft was the model on one line and Operated
// By on a second (v23790), which made it the tallest thing on the shelf. v23904
// makes it one band, the same height with or without an operator:
//
//   Aircraft:   Airbus A319 | C-FTOD        Operated By:    [LOGO]
//   Appareil:                               Exploité par:
//
// Labels stacked, the model at twice the label size, the operator mark as tall
// as its label pair. A long model steps down, then goes to two lines (model
// over registration) rather than being cut. Measured on a 380 px shelf at
// 1680 wide: 50 px band (was ~90 px with an operator).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const block = CSS.slice(CSS.indexOf('v23904 — THE CAPTION IS ONE ROW'));

test('the caption has an Aircraft / Appareil label pair beside the model', () => {
  assert.match(CORE, /aircraft:\s*\{ en:'Aircraft',\s*fr:'Appareil'/, 'the label lives in _GATE_LBL');
  assert.match(CORE, /_gateLbl\('aircraft', _frF8,/, 'it follows the airport language order, French first in Québec');
  assert.match(CORE, /'<div class="v2-rc-acb-ac' \+ \(_acKnown \? '' : ' is-pending'\) \+ '">'/);
});

test('an unknown aircraft shows the pending text, not empty labels', () => {
  assert.match(CORE, /var _acKnown = !!\(_acModel \|\| _acReg\);/);
  assert.match(CORE, /\(_acKnown \? _acTypeVal : _pendingAircraftText\)/);
});

test('one band, the same height with or without an operator', () => {
  assert.ok(block.length > 0, 'the v23904 block exists');
  assert.match(block, /--acb-h: clamp\(30px, min\(5vh, 7\.6vw\), 54px\);/);
  assert.match(block, /flex-direction: row !important;/);
  assert.match(block, /height: var\(--acb-h\) !important;/);
  assert.doesNotMatch(block, /flex-direction: column !important;\s*align-items: center !important;\s*justify-content: center !important;\s*gap: clamp\(1px/,
    'the two-row caption is not reintroduced');
});

test('the model is twice its label, the operator mark never smaller than the text', () => {
  assert.match(block, /font-size: calc\(var\(--acb-h\) \* 0\.52\) !important;/, 'model');
  assert.match(block, /font-size: calc\(var\(--acb-h\) \* 0\.24\) !important;/, 'label');
  assert.match(block, /height: calc\(var\(--acb-h\) \* 0\.62\) !important;/, 'mark taller than the model text');
});

test('a long model steps down, then goes to two lines instead of being cut', () => {
  assert.match(CORE, /el\.classList\.add\('is-2line'\);/);
  assert.match(CORE, /<span class="v2-rc-acb-sep">\|<\/span>/, 'the separator is addressable so two lines can drop it');
  assert.match(block, /\.is-2line \.v2-rc-acb-sep \{\s*display: none !important;/);
  assert.match(block, /\.is-2line > span:not\(\.v2-rc-reg-expected\):not\(\.v2-rc-acb-sep\)/,
    'the hidden expected qualifier stays hidden in two-line form');
});
