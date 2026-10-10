'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24025 — THE FONT PICKER HOLDS FOUR FAMILIES.
//
// Decided 2026-10-09: keep AC Nord for now, keep Possibility and the faces in
// real use (Bricolage Grotesque, the default; Cabinet Grotesk), and remove the
// rest. Gone: TR Tahoma, the Dinamo trials (ABC Ginto Nord, Ginto Rounded,
// Gravity), ABC Areal, and Airport / Airport X from the board picker. No
// airport's saved config named any of them when they went.
//
// A key that is no longer in the stack tables is simply not applied
// (restoreFontChoice and the airport config pass both test the table), so a
// device that still remembers one falls back to the default.
//
// Airport / Airport X keep their files and airport-fonts.css: the old
// designer and tour.html still draw with them. Only the board picker lost
// them.
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
const WORKER = rd('workers/fids-proxy.js');

const picker = () => {
  const a = MENU_HTML.indexOf('id="cuFontSelect"');
  const b = MENU_HTML.indexOf('</select>', a);
  return [...MENU_HTML.slice(a, b).matchAll(/<option value="([^"]*)">/g)].map((m) => m[1]);
};
const GONE = /^(?:tr-tahoma|ginto-nord(?:-[a-z]+)?|abc-(?:areal|ginto-rounded|gravity)[a-z0-9-]*|airport|airport-x)$/;

test('the picker offers Default, Possibility, AC Nord, Bricolage and Cabinet Grotesk only', () => {
  const keys = picker();
  assert.equal(keys[0], '', 'Default comes first');
  for (const k of keys.slice(1)) {
    assert.match(k, /^(?:possibility|ac-nord-[a-z-]+|bricolage(?:-[a-z]+)?|cabinet(?:-[a-z]+)?)$/, `${k} is not one of the kept families`);
  }
  for (const k of ['possibility', 'ac-nord-display', 'ac-nord-text-heavy', 'bricolage', 'bricolage-cond', 'cabinet-extrabold']) {
    assert.ok(keys.includes(k), `${k} must still be offered`);
  }
  assert.match(MENU_HTML, /<optgroup label="Custom fonts" id="cuFontCustomGroup">/, 'uploaded fonts keep their group');
});

// The airport-config pass (fids-core's second table) is what puts a saved
// font on a board. AC Nord has never been in the first table, the one a
// device's own Customize copy and ?font= read, and is deliberately not added
// now: a screen still holding an old local copy would go back to AC Nord.
test('every key the picker offers draws on the boards', () => {
  for (const k of picker().filter(Boolean)) {
    const n = (CORE.match(new RegExp(`^\\s*'${k}':\\s*"`, 'gm')) || []).length;
    assert.equal(n, /^ac-nord/.test(k) ? 1 : 2, `${k} in the fids-core tables`);
    assert.equal((MENU.match(new RegExp(`^\\s*'${k}':\\s*"`, 'gm')) || []).length, 1, `${k} in menu.js`);
  }
});

test('the removed keys are gone from every table, the bulk tool and the worker', () => {
  for (const src of [CORE, MENU]) {
    const left = [...src.matchAll(/^\s*'([a-z0-9-]+)':\s*"'/gm)].map((m) => m[1]).filter((k) => GONE.test(k));
    assert.deepEqual(left, []);
  }
  const m = WORKER.match(/const BULK_FONT_KEYS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m, 'BULK_FONT_KEYS parsed');
  const bulk = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(bulk.slice().sort(), picker().filter(Boolean).sort(), 'the worker accepts exactly the picker keys');
  assert.doesNotMatch(MENU, /\['(?:ginto-nord|abc-areal|abc-ginto-rounded|abc-gravity)',/, 'the bulk tool groups no removed family');
});

test('the stylesheet names only files that exist, and the removed faces and files are gone', () => {
  const srcs = [...FONT_CSS.matchAll(/url\('\.\.\/([^']+)'\)/g)].map((m) => decodeURIComponent(m[1]));
  assert.ok(srcs.length >= 20);
  // Possibility is served from private storage (v24027, worker-entry.js privateFont)
  const PRIVATE = ['fonts/Possibility-Bold.otf'];
  for (const s of new Set(srcs)) {
    if (PRIVATE.includes(s)) continue;
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', s)), `declared but missing: ${s}`);
  }
  assert.doesNotMatch(FONT_CSS, /font-family:'(?:TR Tahoma|ABC [^']+)'/);
  for (const p of ['TR-Tahoma-Bold.ttf', 'ginto-nord', 'abc-areal', 'DINAMO Trial Fonts']) {
    assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/fonts', p)), `fonts/${p} must be gone`);
  }
});

test('the three board pages reload font.css at the same version', () => {
  const versions = ['fids', 'gids', 'bids'].map((sh) => {
    const m = rd(`fids-current/${sh}.html`).match(/css\/font\.css\?v=(\d+)/);
    assert.ok(m, `${sh}.html must reload font.css with a version`);
    return +m[1];
  });
  assert.equal(new Set(versions).size, 1, `the pages disagree about font.css: ${versions.join(', ')}`);
  assert.ok(versions[0] >= 332, 'font.css changed in v24027, so its token moved');
});
