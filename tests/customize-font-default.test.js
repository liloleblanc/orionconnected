'use strict';

// v23965 — PICKING "DEFAULT" IN THE FONT PICKER CLEARS THE AIRPORT'S FONT.
//
// cuApplyAndSave merges the form over what is stored, and _cuReadForm only
// writes a font when one is picked. So choosing Default in Customize left the
// old pick in place, on the device and in the airport config: the picker said
// Default and every board of that airport kept the old face. The way to take
// an airport off a face it was given is exactly that pick, so it has to work.
//
// The functions run here are sliced out of menu.js, not re-implemented; only
// the DOM, storage and network around them are stand-ins.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'fids-current', 'js', 'menu.js'), 'utf8');
const MENU_HTML = fs.readFileSync(path.resolve(__dirname, '..', 'fids-current', 'menu.html'), 'utf8');

function slice(startMarker, endMarker) {
  const at = SRC.indexOf(startMarker);
  assert.ok(at >= 0, 'menu.js must contain ' + startMarker);
  const end = SRC.indexOf(endMarker, at);
  assert.ok(end > at, 'end of ' + startMarker + ' not found');
  return SRC.slice(at, end + endMarker.length);
}
const FONT_CHANGED = slice('function cuFontChanged() {', '\n}\n');
const APPLY_AND_SAVE = slice('var _cuThemeExplicitDefault = false;', '\n}\n');
const CLOUD_PUSH = slice('function _cuCloudPush(code, prefs) {', '\n}\n');

// One Customize panel for airport `code`, with `stored` already saved on the
// device. `formFont` is what _cuReadForm reports (it omits the font when the
// picker sits on Default). Returns the hooks and what got saved and pushed.
function panel({ code = 'ORD', stored = {}, pickerValue = '', formFont } = {}) {
  const ls = new Map([['fids_customize_' + code, JSON.stringify(stored)]]);
  const out = { saved: null, pushed: null };
  const env = {
    document: {
      getElementById: (id) => (id === 'cuFontSelect' ? picker : null),
    },
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => { ls.set(k, String(v)); },
    },
    _cuStorageKey: () => 'fids_customize_' + code,
    _cuReadForm: () => (formFont ? { font: formFont } : {}),
    _cuSave: (p) => { out.saved = JSON.parse(JSON.stringify(p)); },
    _cuApplyFont: () => {},
    _acCurrentCode: () => code,
    _acGetToken: () => 'token',
    _cuSyncNote: () => {},
    _acFetch: (url, init) => { out.pushed = { url, body: JSON.parse(init.body) }; return { then: () => ({ then: () => ({ catch: () => {} }) }) }; },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  };
  const picker = { value: pickerValue };
  const names = Object.keys(env);
  const hooks = new Function(...names,
    'var _AC_WORKER_URL = "https://worker.test"; var _cuCloudTimer = null;\n' +
    'var applyAirportConfigToBoard, render;\n' +
    CLOUD_PUSH + '\n' + APPLY_AND_SAVE + '\n' + FONT_CHANGED + '\n' +
    'return { cuFontChanged: cuFontChanged, cuApplyAndSave: cuApplyAndSave };',
  )(...names.map((n) => env[n]));
  return { hooks, out, picker };
}

test('picking Default clears the saved font on the device and in the airport config', () => {
  const p = panel({ stored: { theme: 'mist', font: 'ac-nord-display-bold' }, pickerValue: '' });
  p.hooks.cuFontChanged();
  assert.equal(p.out.saved.font, '', 'the device copy must stop naming the old face');
  assert.equal(p.out.saved.theme, 'mist', 'and nothing else saved is touched');
  assert.ok(p.out.pushed, 'the change must go to the airport config');
  assert.ok('font' in p.out.pushed.body,
    'the push must carry the font, or the cloud keeps the old one and every board reads it');
  assert.equal(p.out.pushed.body.font, '');
});

test('an untouched picker never erases a saved font', () => {
  // Any other Customize change (a theme, a toggle) also runs cuApplyAndSave.
  const p = panel({ stored: { font: 'cabinet-extrabold' }, pickerValue: '' });
  p.hooks.cuApplyAndSave();
  assert.equal(p.out.saved.font, 'cabinet-extrabold');
  assert.equal(p.out.pushed.body.font, 'cabinet-extrabold');
});

test('the Default pick clears once; a later save of something else keeps the result', () => {
  const p = panel({ stored: { font: 'possibility' }, pickerValue: '' });
  p.hooks.cuFontChanged();
  assert.equal(p.out.saved.font, '');
  // The next save starts from what is stored now.
  const q = panel({ stored: p.out.saved, pickerValue: '' });
  q.hooks.cuApplyAndSave();
  assert.equal(q.out.saved.font, '');
});

test('picking a real font still saves that font', () => {
  const p = panel({ stored: { font: 'ac-nord-text-bold' }, pickerValue: 'bricolage', formFont: 'bricolage' });
  p.hooks.cuFontChanged();
  assert.equal(p.out.saved.font, 'bricolage');
  assert.equal(p.out.pushed.body.font, 'bricolage');
});

test('the picker\'s Default label names the real default', () => {
  const at = MENU_HTML.indexOf('id="cuFontSelect"');
  const sel = MENU_HTML.slice(at, MENU_HTML.indexOf('</select>', at));
  assert.match(sel, /<option value="">Default \(Bricolage Grotesque\)<\/option>/,
    'the board default has been Bricolage Grotesque since v23872; the label said Possibility');
});
