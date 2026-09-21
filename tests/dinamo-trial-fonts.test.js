'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23775 — THE DINAMO TRIALS, REGISTERED WHERE THEY LANDED.
//
// Ginto Rounded and Gravity were uploaded straight into the repo under
// 'fids-current/fonts/DINAMO Trial Fonts/', a doubled folder deep, with
// spaces in every path segment. They are registered in place — 36 MB is
// not worth duplicating — so the thing most likely to rot is a URL: one
// wrong percent-encoding and the pick silently falls back to sans-serif
// with nothing in the console. Every declared file is checked against disk.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = rd('fids-current/js/fids-core.js');
const MENU = rd('fids-current/js/menu.js');
const MENU_HTML = rd('fids-current/menu.html');
const FONT_CSS = rd('fids-current/css/font.css');

const CUTS = ['ABC Ginto Rounded', 'ABC Ginto Rounded Nord', 'ABC Ginto Rounded Nord Condensed',
  'ABC Gravity', 'ABC Gravity Compressed', 'ABC Gravity Condensed', 'ABC Gravity Expanded',
  'ABC Gravity Extra Condensed', 'ABC Gravity Wide', 'ABC Gravity XX Compressed', 'ABC Gravity XXXX Compressed'];
const KEYS = CUTS.map((c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '-'));

test('every Dinamo face resolves to a file that exists', () => {
  const at = FONT_CSS.indexOf('ABC Ginto Rounded + ABC Gravity (Dinamo trials');
  assert.ok(at >= 0, 'the Dinamo block must exist');
  const block = FONT_CSS.slice(at);
  const srcs = [...block.matchAll(/url\('\.\.\/([^']+)'\)/g)].map((m) => decodeURIComponent(m[1]));
  assert.ok(srcs.length >= 150, `expected the Dinamo faces, found ${srcs.length}`);
  for (const s of new Set(srcs)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', s)), `declared but missing: ${s}`);
  }
  // a space must travel as %20, never raw, or the fetch 404s on some servers
  const raw = [...block.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]).filter((u) => / /.test(u));
  assert.deepEqual(raw, [], 'every URL must be percent-encoded');
});

test('each cut is a real family with its weights, both styles', () => {
  for (const fam of CUTS) {
    for (const w of [400, 700, 800, 900]) {
      assert.match(FONT_CSS, new RegExp(`font-family:'${fam}'; font-weight:${w}; font-style:normal;`), `${fam} ${w}`);
    }
    assert.match(FONT_CSS, new RegExp(`font-family:'${fam}'; font-weight:400; font-style:italic;`), `${fam} italic`);
  }
  // the heavy weights of the base cuts can also be pinned by name
  for (const fam of ['ABC Ginto Rounded', 'ABC Ginto Rounded Nord', 'ABC Gravity']) {
    for (const w of ['Bold', 'Black', 'Ultra']) {
      assert.match(FONT_CSS, new RegExp(`font-family:'${fam} ${w}'; font-weight:1 1000;`), `${fam} ${w} pinned`);
    }
  }
});

test('every cut is pickable, on all three tables and in the picker', () => {
  for (const k of KEYS) {
    assert.equal((CORE.match(new RegExp(`^\\s*'${k}':\\s*"`, 'gm')) || []).length, 2, `${k} in both fids-core tables`);
    assert.equal((MENU.match(new RegExp(`^\\s*'${k}':\\s*"`, 'gm')) || []).length, 1, `${k} in menu.js`);
    assert.match(MENU_HTML, new RegExp(`<option value="${k}">`), `${k} offered in the picker`);
  }
  // and the widths are all there — the point of Gravity is its widths
  for (const w of ['xxxx-compressed', 'xx-compressed', 'compressed', 'extra-condensed', 'condensed', 'expanded', 'wide']) {
    assert.ok(KEYS.includes('abc-gravity-' + w), `Gravity ${w} must be pickable`);
  }
  // every stack names a family the stylesheet declares
  const stacks = [...CORE.matchAll(/^\s*'abc-(?:ginto-rounded|gravity)[^']*':\s*"'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(stacks.length >= 20);
  for (const fam of new Set(stacks)) assert.match(FONT_CSS, new RegExp(`font-family:'${fam}';`), `${fam} declared`);
});

test('the trial files are the ones registered, and the stylesheet reloads', () => {
  // Trial cuts are what the repo holds today; a licensed set is a file swap
  // in the same folder, so the paths deliberately carry "Trial".
  const at = FONT_CSS.indexOf('ABC Ginto Rounded + ABC Gravity (Dinamo trials');
  assert.match(FONT_CSS.slice(at), /Trial-Regular\.otf/);
  // Every page must reload font.css at the SAME version. Pinning one literal
  // here meant any later change to the stylesheet had to edit this test as
  // well; what actually matters is that no page is left on a stale query
  // while the others move — that is how a face ships to two of three screens.
  const versions = ['fids', 'gids', 'bids'].map((sh) => {
    const m = rd(`fids-current/${sh}.html`).match(/css\/font\.css\?v=(\d+)/);
    assert.ok(m, `${sh}.html must reload font.css with a version`);
    return m[1];
  });
  assert.equal(new Set(versions).size, 1, `the pages disagree about font.css: ${versions.join(', ')}`);
});
