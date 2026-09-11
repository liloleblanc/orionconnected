'use strict';

// v23734 — THE ORB CODE'S INK FOLLOWS THE DISC, NOT THE AIRLINE.
//
// Reported: Hawaiian's destination badge showed HNL in black on its purple disc.
//
// v23692 gave ten carriers dark ink on their orb code, and was right to: those
// ten take a LIGHT #F2F4F7 disc from _gateOrbParts, where white-on-white had
// made the code invisible three times running. But it keyed the ink to
// data-gate-airline, and only the RAIL's orb takes that light disc. The
// boarding shelf builds its badge from _BIR_BADGE_STYLE — var(--airline-accent)
// with white ink — so the dark rule landed on an accent disc and undid it.
//
// Measured accents: AA #0078D2, HA #582C83, BA #2E5DA4, WN #F9A01B. All dark
// enough that white is right on an accent disc.
//
// The exception that makes this subtle, and which an earlier draft of this fix
// got wrong: AA and PD FORCE a #ffffff .v2-fi-icon-badge on the shelf, so their
// orb code really is on white there and really does need dark ink. They must
// stay unscoped. The other nine have no such override — their shelf badge is
// the accent, with only a ::after gloss over it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');

const MARK = 'v2-fi-orbcode-onaccent';

// Rules that set an ink colour on .v2-fi-orbcode, with their selector.
function inkRules() {
  const out = [];
  for (const part of CSS.split('}')) {
    const i = part.indexOf('{');
    if (i < 0) continue;
    const sel = part.slice(0, i), body = part.slice(i + 1);
    if (!/\.v2-fi-orbcode/.test(sel)) continue;
    const m = body.match(/(?:^|\s)color:\s*(#[0-9A-Fa-f]{3,8})/);
    if (!m) continue;
    const carriers = (sel.match(/data-gate-airline="([A-Z0-9]{2,3})"/g) || [])
      .map(s => s.match(/"([^"]+)"/)[1]);
    out.push({ ink: m[1].toUpperCase(), carriers, scoped: sel.includes(MARK) });
  }
  return out;
}

test('the boarding shelf marks its orb code as sitting on the accent', () => {
  assert.match(SRC, new RegExp('class="v2-fi-orbcode ' + MARK + '"'),
    '_cell must say which surface its badge is, so the ink can follow it');
  // _BIR_BADGE_STYLE is what makes that true.
  assert.match(SRC, /_birRailBg[\s\S]{0,200}var\(--airline-accent/,
    'the shelf badge must still be accent-coloured');
  assert.match(SRC, /var _birRailInk = _birF8 \? '#141414' : '#fff'/,
    'and still inked white by default');
});

test('the nine accent-disc carriers no longer get dark ink on the shelf', () => {
  const nine = ['2L', '4Y', 'BA', 'CJ', 'ET', 'HA', 'LY', 'PR', 'WN'];
  const rule = inkRules().find(r => nine.every(c => r.carriers.includes(c)));
  assert.ok(rule, 'the nine-carrier dark-ink rule must exist');
  assert.ok(rule.scoped,
    `${rule.ink} reaches the accent disc — that is the black HNL on Hawaiian purple`);
});

test('American and Porter keep dark ink EVERYWHERE — their shelf badge is white', () => {
  // The trap. Both force .v2-fi-icon-badge to #ffffff, so scoping them off the
  // accent disc recreates white-on-white, which is the bug v23692 and v23536
  // were written to end.
  for (const code of ['AA', 'PD']) {
    const rule = inkRules().find(r => r.carriers.includes(code));
    assert.ok(rule, code + ' must still have an ink rule');
    assert.equal(rule.scoped, false,
      `${code} forces a white .v2-fi-icon-badge, so its code needs dark ink on ` +
      'the shelf too — scoping it off the accent disc makes it invisible');
  }
});

test('the white-badge carriers are exactly the ones left unscoped', () => {
  // Derive it rather than trusting the list: find every carrier that forces a
  // light .v2-fi-icon-badge fill, and require its ink rule to be unscoped.
  const forcesLight = new Set();
  for (const part of CSS.split('}')) {
    const i = part.indexOf('{');
    if (i < 0) continue;
    const sel = part.slice(0, i), body = part.slice(i + 1);
    if (!/\.v2-fi-icon-badge(?!::)/.test(sel)) continue;   // the fill, not ::after
    const bg = (body.match(/background(?:-color)?:\s*([^;!]+)/) || [])[1];
    if (!bg || !/^#(fff|ffffff)$/i.test(bg.trim())) continue;
    for (const a of sel.match(/data-gate-airline="([A-Z0-9]{2,3})"/g) || []) {
      forcesLight.add(a.match(/"([^"]+)"/)[1]);
    }
  }
  assert.ok(forcesLight.size > 0, 'expected at least AA and PD to force a light badge');
  for (const code of forcesLight) {
    const rule = inkRules().find(r => r.carriers.includes(code));
    if (!rule) continue;
    assert.equal(rule.scoped, false,
      `${code} forces a light badge but its ink is scoped off the accent disc`);
  }
});

test('the marker is only on the shelf orb, never the rail orb', () => {
  // The rail's orb is the one that genuinely takes the light disc. If it ever
  // carried this class the v23692 fix would be undone for all ten.
  const railOrbs = SRC.match(/<span class="v2-fi-orb-code">/g) || [];
  assert.ok(railOrbs.length >= 1, 'the rail orb markup must still exist');
  assert.doesNotMatch(SRC, new RegExp('v2-fi-orb-code ' + MARK),
    'the rail orb must not be marked as accent — it is the light disc');
});

test('_gateOrbParts still gives those ten a light disc', () => {
  // The premise of the whole arrangement. If this list changes, the ink rules
  // need revisiting together.
  const m = SRC.match(/var LIGHT_DISC = \{([^}]*)\}/);
  assert.ok(m, 'LIGHT_DISC must still exist');
  for (const c of ['AA', '2L', '4Y', 'BA', 'CJ', 'ET', 'HA', 'LY', 'PR', 'WN']) {
    assert.ok(m[1].includes(`'${c}'`), c + ' must still be on the light disc');
  }
  assert.match(SRC, /var DISC = \(!isTile && LIGHT_DISC\[c\]\) \? '#F2F4F7' : ACC;/,
    'the light disc must still be conditional on !isTile');
});
