'use strict';

// v23512 — THE FIDS TICKER AND THE BIDS BOTTOM BAND MUST STAY THE SAME HEIGHT.
//
// Originally reported as two Orlando screens not aligning: the boards hang
// side by side and their bottom bands did not share a top edge. v22831 fixed it
// by giving the BIDS band the FIDS ticker's geometry — but by TYPING 59px and
// 18px a second time. v23504 then shrank the FIDS ticker to ~38px, the copy did
// not follow, and the gap came back at twice its original size.
//
// So this is not a test of two numbers being equal today. It is a test that
// there is only ONE number: both bands must derive from the shared
// --fids-ticker-* custom properties, so the next person to resize the ticker
// cannot move one board without the other.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'css', 'display-overrides.css'),
  'utf8',
);

// Pull one declaration block by its selector's closing brace.
function block(marker) {
  const at = css.indexOf(marker);
  assert.ok(at >= 0, `display-overrides.css must still contain ${marker}`);
  const open = css.indexOf('{', at);
  return css.slice(open, css.indexOf('}', open) + 1);
}

test('the shared ticker geometry is declared once', () => {
  const root = block(':root {\n  --fids-ticker-pad');
  for (const v of ['--fids-ticker-pad', '--fids-ticker-fs', '--fids-ticker-lh', '--fids-ticker-rule']) {
    assert.match(root, new RegExp(v + ':'), `${v} must be declared in the shared block`);
  }
  // The band height is computed from the others, never typed.
  assert.match(root, /--fids-ticker-h:\s*calc\(/, '--fids-ticker-h must be a calc of the other three');
});

test('the BIDS bottom band derives its height, never hardcodes it', () => {
  const band = block('html .bidsv2-screen .bidsv2-bottom-band.bidsv2-ticker {\n  height: var(--fids-ticker-h)');
  assert.match(band, /height:\s*var\(--fids-ticker-h\)/, 'the band height must come from the shared var');
  assert.doesNotMatch(
    band,
    /height:\s*\d/,
    'a literal height here is the v22831 bug: it drifts the moment the FIDS ticker is resized',
  );
});

test('both tickers take their text size from the same variable', () => {
  const fids = block('.ticker span {\n  font-size: var(--fids-ticker-fs)');
  const bids = block('html .bidsv2-screen .bidsv2-ticker-track span {');
  for (const [name, b] of [['FIDS', fids], ['BIDS', bids]]) {
    assert.match(b, /font-size:\s*var\(--fids-ticker-fs\)/, `${name} ticker text must use the shared size`);
    assert.doesNotMatch(b, /font-size:\s*\d/, `${name} ticker must not retype a literal font-size`);
  }
});

test('the FIDS ticker padding and rule feed the height calc', () => {
  const t = block('.ticker {\n  padding: var(--fids-ticker-pad)');
  assert.match(t, /padding:\s*var\(--fids-ticker-pad\) 0/);
  assert.match(t, /border-top-width:\s*var\(--fids-ticker-rule\)/,
    'the 3px rule is part of the total height the BIDS band matches, so it must be shared too');
});
