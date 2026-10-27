'use strict';

// v24089 — at night the gate shelf's veil (#gateNightSky, ~80% navy) covers
// the sky. The airframe was lifted above it in v23879; the airline's mark that
// stands in for the airframe until the aircraft details arrive was not, so it
// read as a shadow in the clouds (KLM at YUL A57, Air Canada at C77).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const ids = (sel) => (sel.match(/:not\(#_\)/g) || []).length;
const nightRule = (tail) => {
  const lines = CSS.split('\n').filter((l) => l.startsWith('html body.gate-acsky-night') && l.includes(tail));
  assert.ok(lines.length, 'a night rule for ' + tail);
  return lines[0];
};

test('the hold mark sits above the night veil, as the airframe does', () => {
  const veil = nightRule('> #gateNightSky { z-index: 2 !important; }');
  const plane = nightRule('.v2-rc-aircraft-img { position: relative !important; z-index: 3 !important; }');
  const hold = nightRule('> .v2-rc-aircraft-hold { z-index: 3 !important; }');
  assert.equal(ids(hold), ids(veil));
  assert.equal(ids(hold), ids(plane));
});

test('the mark keeps its own colour at night: no grade, no plate behind it', () => {
  const night = CSS.split('\n').filter((l) => l.startsWith('html body.gate-acsky-night') && /aircraft-hold/.test(l));
  for (const l of night) {
    assert.doesNotMatch(l, /filter:|opacity:|background/, l.slice(-160));
  }
});
