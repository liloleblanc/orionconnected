'use strict';

// v24091 — two marks on the Alaska gate (SFO B3, B8).
//
// The orb: Alaska had no entry in AIRLINE_EMBLEM_FILES, so the orb fell back
// to the face's navy row tile, a navy disc on Alaska's navy panel whose edge
// disappears; Horizon (QX) printed its letters. Both now wear ASA-orb.svg,
// the same face in a white ring.
//
// The oneworld ball: sized by viewport height alone, it stood taller than the
// light band on most screens (87px at 1536x800) and was cut top and bottom.
// It now takes the band's height, never below the 82px airline tile.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUB = path.join(__dirname, '..', 'fids-current');
const SRC = fs.readFileSync(path.join(PUB, 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(PUB, 'css', 'display-overrides.css'), 'utf8');
const ids = (sel) => (sel.match(/:not\(#_\)/g) || []).length;

function fnSource(name) {
  const at = SRC.search(new RegExp('\\nfunction ' + name + '\\('));
  assert.ok(at >= 0, name + ' must be a top-level function');
  const end = SRC.indexOf('\n}\n', at);
  return SRC.slice(at + 1, end + 2);
}

test('Alaska and Horizon resolve to the face in a white ring', () => {
  const ctx = vm.createContext({});
  vm.runInContext(fnSource('_orbEmblemCarrier'), ctx);
  for (const c of ['QX', 'QXE', 'qx', 'AS']) assert.equal(vm.runInContext('_orbEmblemCarrier(' + JSON.stringify(c) + ')', ctx), 'AS', c);
  assert.match(SRC, /\n\s*'AS':\s*'\/logos\/airline-tiles\/ASA-orb\.svg'\n\};/);
});

test('the orb file is the row tile\'s own face, on a round white ground', () => {
  const tile = fs.readFileSync(path.join(PUB, 'logos', 'airline-tiles', 'ASA.svg'), 'utf8');
  const orb = fs.readFileSync(path.join(PUB, 'logos', 'airline-tiles', 'ASA-orb.svg'), 'utf8');
  // round, so no surface that leaves it unclipped shows white corners
  assert.match(orb, /^<svg[^>]*viewBox="0 0 100 100"><defs><clipPath id="asa-orb-c"><circle cx="50" cy="50" r="43"\/><\/clipPath><\/defs><circle cx="50" cy="50" r="50" fill="#FFFFFF"\/><circle cx="50" cy="50" r="43" fill="#0C4368"\/>/);
  assert.doesNotMatch(orb, /<style|d="M0 0h100v100H0z"/);
  // every path of the face, exactly as the tile draws it (they cannot drift)
  const paths = (s) => [...s.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0]);
  assert.deepEqual(paths(orb), paths(tile).filter((p) => !/d="M0 0h100v100H0z"/.test(p)));
});

// v24093 — the orbs wear a glossy copy, shaded like Delta's and United's.
test('the orbs wear the glossy face; the coin keeps the flat one', () => {
  assert.match(SRC, /var GATE_TOP_ROUND_EMBLEM_FILES = \{[\s\S]*?\n\s*'AS': '\/logos\/airline-tiles\/ASA-orb-glossy\.svg'\n\};/);
  const tile = fs.readFileSync(path.join(PUB, 'logos', 'airline-tiles', 'ASA.svg'), 'utf8');
  const gloss = fs.readFileSync(path.join(PUB, 'logos', 'airline-tiles', 'ASA-orb-glossy.svg'), 'utf8');
  const paths = (s) => [...s.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0]);
  assert.deepEqual(paths(gloss), paths(tile).filter((p) => !/d="M0 0h100v100H0z"/.test(p)));
  // round, the navy ground under the face, the shading drawn over it
  assert.match(gloss, /<circle cx="50" cy="50" r="50" fill="url\(#asa-orb-ring\)"\/>/);
  assert.match(gloss, /<circle cx="50" cy="50" r="43" fill="#0C4368"\/>/);
  assert.match(gloss, /<circle cx="50" cy="50" r="43" fill="url\(#asa-orb-shade\)"\/>/);
  assert.doesNotMatch(gloss, /<style|d="M0 0h100v100H0z"/);
});

test('the oneworld ball takes the band\'s height and is never the smaller mark', () => {
  const rules = CSS.split('\n').filter((l) => /g8-r1-alliance-oneworld\s*\{$/.test(l) || /:has\(> \.g8-r1-alliance-oneworld\)/.test(l));
  const top = Math.max(...rules.map(ids));
  const slot = rules.find((l) => /:has\(> \.g8-r1-alliance-oneworld\)/.test(l));
  const ball = rules.filter((l) => /\.g8-r1-star\.g8-r1-alliance-oneworld\s*\{$/.test(l) && ids(l) === top);
  assert.ok(slot && ids(slot) === top, 'the slot rule is the strongest');
  assert.equal(ball.length, 1, 'one strongest ball rule');
  const body = (line) => { const at = CSS.indexOf(line); return CSS.slice(at, CSS.indexOf('}', at)); };
  assert.match(body(slot), /height: 100% !important;/);
  const b = body(ball[0]);
  assert.match(b, /height: min\(104px, calc\(100% - 2px\)\) !important;/);
  assert.match(b, /max-height: calc\(100% - 2px\) !important;/);
  assert.match(b, /min-height: 0 !important;/);
  assert.match(b, /aspect-ratio: 1 \/ 1 !important;/);
  assert.match(b, /min-width: 82px !important;/);
});
