'use strict';

// v23526 — THE BOARDING SHELF SHOWS THE AIRPORT CODE, AND THE GATE CLOSES
// BEFORE THE AIRCRAFT LEAVES.
//
// Requested: the top-panel shelves must carry the airport code once the board
// switches to boarding, for all airlines; and the gate cut-off is five minutes.
//
// v23925 — the cut-off is no longer the clock's: GATE CLOSED shows on the
// airport's own word (see the last test).

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
  // shape this guards changed with it, and the boarding panels were asked to
  // follow the rail. What it is guarding has not changed: the boarding shelf must
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
  // The destination label is a kept bilingual pair even when both languages
  // render the same word — the rail passes keepDup; the boarding shelf now does too.
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

test('GATE CLOSED is the airport\'s word, never the clock\'s', () => {
  // v23925 — the gate reads closed when the flight's own word says so (the
  // feed's, an operator's, a test flight's). The v23526 five-minute clock
  // cut-off closed every gate before its time even while the feed still said
  // Boarding, and with the gate now holding a boarding flight for up to an
  // hour it would have shown GATE CLOSED for that whole hour over people
  // still boarding.
  assert.doesNotMatch(SRC, /GATE_CLOSE_LEAD_MIN/, 'the clock cut-off constant is gone');
  // The decision lives in _gateSignPhase (status-evidence.test.js runs it over
  // every word and minute); uxgGateHtml takes isGateClosedStatus from it.
  const i = SRC.indexOf('function _gateSignPhase(');
  assert.ok(i > 0, '_gateSignPhase must exist');
  const sign = SRC.slice(i, SRC.indexOf('\n}', i));
  const m = sign.match(/var isGateClosedStatus = ([^;]+);/);
  assert.ok(m, 'isGateClosedStatus must be one plain statement');
  assert.equal(m[1].trim(), "(_gateWord === 'gateclosed' || _gateWord === 'departed')",
    'it reads only the flight\'s word, gate closed or departed');
  assert.doesNotMatch(m[1], /minsToDep/, 'no clock term');
  assert.match(sign, /var _gateWord = String\(stKey \|\| ''\)\.replace\(\/\[\\s_-\]\+\/g, ''\)\.toLowerCase\(\);/,
    'the word is the gate\'s one status key, normalised');
  assert.match(SRC, /var isGateClosedStatus = _gateSign\.isGateClosedStatus;/, 'and the gate builder uses that answer');
  assert.doesNotMatch(SRC, /isFinite\(minsToDep\) && minsToDep <= -2/,
    'the old -2 rule closed the gate two minutes AFTER the aircraft was due out');
});
