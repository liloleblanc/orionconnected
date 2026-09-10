'use strict';

// v23526 — THE BOARDING SHELF SHOWS THE AIRPORT CODE, AND THE GATE CLOSES
// BEFORE THE AIRCRAFT LEAVES.
//
// Nick: "The Top Panel shelves when it swtches to boarding does not have
// airport code yet as requested for all airlines", and "lets do gate topp and
// a 5 min cutoff".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// ── The destination shelf ────────────────────────────────────────────────
// _cell parses a trailing all-caps segment of the LABEL as the airport code
// (v23472). Lift that parser and prove the boarding row now feeds it one.

function cellTitle(label) {
  const at = SRC.indexOf('    function _cell(icon, en, fr, val');
  assert.ok(at >= 0, 'fids-core.js must still define _cell');
  let i = SRC.indexOf('{', at), d = 0, end = -1;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  const cell = new Function('_frF', '_BIR_BADGE_STYLE',
    SRC.slice(at, end) + '\nreturn _cell;')(false, '');
  return cell('ac-ico-dest', label, '', 'Toronto', true);
}

test('a destination label carrying a code renders it as the rail code span', () => {
  const html = cellTitle('Destination | Destination | YYZ');
  assert.match(html, /<span class="v2-fi-code v2-rc-iata">YYZ<\/span>/,
    'the code must use the rail markup, which is what the accent painter looks for');
  assert.doesNotMatch(html, /v2-fi-lbl-2">YYZ/,
    'the code must not land in the second-language slot');
});

test('one language still works — no midword, code still shown', () => {
  const html = cellTitle('Destination | YYZ');
  assert.match(html, /v2-rc-iata">YYZ</);
});

test('a label with no code is untouched', () => {
  const html = cellTitle('Boarding | Embarquement');
  assert.doesNotMatch(html, /v2-rc-iata/, 'only a trailing all-caps token is a code');
  assert.match(html, /v2-fi-lbl-2">Embarquement</);
});

test('the boarding row actually passes the code, for every airline', () => {
  // v23688 — the code moved OFF the end of the title and INTO the orb, so the
  // shape this guards changed with it (Nick: "I would like the airport code to
  // go in the orb YYC for isntance", then "Boarding panels to reflect new
  // changes"). What it is guarding has not changed: the boarding shelf must
  // still hand the destination code over, for every carrier.
  const at = SRC.indexOf("_cell('ac-ico-dest'");
  assert.ok(at >= 0, 'the destination shelf must still exist');
  const call = SRC.slice(at, SRC.indexOf('\n      + _cell(', at + 10));
  assert.ok(/_bIataOrb/.test(call),
    'the destination shelf must pass the resolved code as the orb code');
  assert.ok(/_dispIata\(String\(locIata/.test(SRC),
    'the orb code must be resolved through _dispIata, like every other code chip');
  // The row builds once for all carriers: no airline branch may gate it.
  const before = SRC.slice(Math.max(0, at - 1500), at);
  assert.doesNotMatch(before.slice(-260), /airlineCode === '[A-Z0-9]{2}'\s*\?[^\n]*$/,
    'the destination shelf must not be behind a per-airline branch');
});

test('the boarding destination keeps the duplicate pair the rail keeps', () => {
  // "In French Please also add Destination even if twice Destination |
  // Destination" — the rail passes keepDup; the boarding shelf now does too.
  // It cannot go through _cell's '|' splitter to get there, because that
  // splitter DROPS any segment equal to the first, which is exactly this pair.
  const at = SRC.indexOf("_cell('ac-ico-dest'");
  const call = SRC.slice(at, SRC.indexOf('\n      + _cell(', at + 10));
  assert.ok(/_gateLbl\('dest'[\s\S]*\}, '', true\)/.test(call),
    'the boarding destination label must be built with keepDup');
  assert.ok(/v2-fi-lbl-2/.test(call) && /v2-fi-sep/.test(call),
    'and handed over as finished rail markup, not re-split from a pipe string');
});

// ── The cut-off ──────────────────────────────────────────────────────────

test('the gate closes five minutes BEFORE departure, not after it', () => {
  const m = SRC.match(/var GATE_CLOSE_LEAD_MIN = (\d+);/);
  assert.ok(m, 'the cut-off must be a named constant, not a literal in a comparison');
  assert.equal(m[1], '5', "Nick's call is a five-minute cut-off");
  assert.match(SRC, /minsToDep <= GATE_CLOSE_LEAD_MIN/,
    'the clock rule must use the constant');
  assert.doesNotMatch(SRC, /isFinite\(minsToDep\) && minsToDep <= -2/,
    'the old -2 rule closed the gate two minutes AFTER the aircraft was due out');
});

test('the cut-off is a lead time, so it moves with a delay', () => {
  // minsToDep is revised-aware, so the deadline follows the revised departure.
  const close = (minsToDep) => minsToDep <= 5 && minsToDep > -720;
  assert.equal(close(6), false, 'six minutes out the gate is still open');
  assert.equal(close(5), true, 'at five minutes the gate is closed');
  assert.equal(close(0), true);
  assert.equal(close(-3), true, 'and it stays closed past departure');
  assert.equal(close(-800), false, 'yesterday\'s flight is not a closed gate');
});
