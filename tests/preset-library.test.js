'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23776 — THE SAVED PALETTES COME BACK ON ANY BROWSER.
//
// Reported as "all the settings I had for my airport colors, they're all
// gone" — while the worker still held 36 palettes for YQM, 35 for YTZ, 21
// for YOW and 12 for YUL, and every board was still painting its custom
// colours. Nothing was lost: the panel was reading the wrong store.
//
// There are two preset stores. 'fids_presets' is the Customize library,
// {id, name, colors:{…}}, and it is the one that syncs to the airport
// config. 'fids_user_presets' is the older sidebar list, flat
// accent/bg/text, and nothing ever synced it. The sidebar was therefore
// empty on a browser that had not personally saved a palette, which is
// every new profile and every machine that is not the one it was saved on.
//
// Three things had to be true and only the first was: the library pulls
// from the cloud; the sidebar reads the library; and something pulls
// before the Customize tab is opened, because the swatches are on screen
// first.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MENU = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'menu.js'), 'utf8');

/** Run a function out of menu.js with a stubbed localStorage. */
function withStore(store, body) {
  const src = [
    'var localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : null; },',
    '  setItem: function (k, v) { STORE[k] = String(v); } };',
    MENU.slice(MENU.indexOf('var _PRESETS_KEY'), MENU.indexOf('function smRenderPresets')),
    MENU.slice(MENU.indexOf('function _cuPresetsAll()'), MENU.indexOf('function _cuPresetsSave')),
    'return (' + body + ')();'
  ].join('\n');
  return new Function('STORE', src)(store);
}

test('the sidebar list shows the cloud-backed library, not just its own store', () => {
  // A fresh browser: nothing in fids_user_presets, the library already
  // pulled from the airport config.
  const store = {
    fids_presets: JSON.stringify([
      { id: 'p_1', name: 'YQM', colors: { accent: '#eab308', bg: '#cbcc94', text: '#18181b', hdr: '#27272a' }, savedAt: 2 },
      { id: 'p_2', name: 'YHZ', colors: { accent: '#0091c2', bg: '#0091c2', text: '#ffffff' }, savedAt: 3 }
    ])
  };
  const names = withStore(store, 'function () { return _getPresets().map(function (p) { return p.name; }); }');
  assert.ok(names.includes('YQM'), 'a cloud palette must reach the sidebar');
  assert.ok(names.includes('YHZ'));
  assert.ok(names.includes('Gold (Default)'), 'the built-ins stay');
  // and it is drawable: the swatch reads p.accent, the flat shape
  const first = withStore(store, 'function () { return _getPresets().filter(function (p) { return p.name === "YQM"; })[0]; }');
  assert.equal(first.accent, '#eab308');
  assert.equal(first.bg, '#cbcc94');
  assert.equal(first.text, '#18181b');
});

test('a palette saved in this browser is not duplicated by its cloud copy', () => {
  const store = {
    fids_user_presets: JSON.stringify([{ id: 'p_1', name: 'YQM local', accent: '#111111', bg: '#222222', text: '#fff' }]),
    fids_presets: JSON.stringify([{ id: 'p_1', name: 'YQM cloud', colors: { accent: '#eab308' }, savedAt: 9 }])
  };
  const names = withStore(store, 'function () { return _getPresets().map(function (p) { return p.name; }); }');
  assert.equal(names.filter((n) => n.startsWith('YQM')).length, 1, 'one entry per id');
  assert.ok(names.includes('YQM local'), 'the local copy wins — it is the one this browser edited');
});

test('an empty library is still just the built-ins', () => {
  const names = withStore({}, 'function () { return _getPresets().map(function (p) { return p.name; }); }');
  assert.equal(names.length, 6, 'the six built-ins, nothing invented');
  assert.ok(names.includes('Midnight'));
});

test('the library is pulled before anything needs it, and on an airport change', () => {
  const at = MENU.indexOf("if (tabId === 'customize') { try { _cuPresetsPull(); } catch (e) {} }");
  assert.ok(at >= 0, 'the tab hook must stay');
  const after = MENU.slice(at, at + 1200);
  assert.match(after, /DOMContentLoaded', _cuPullOnce\)/, 'pulled on load');
  assert.match(after, /addEventListener\('fids-airport-config-ready', _cuPullOnce\)/, 'and when the airport config lands');
  assert.match(after, /_apSel\.addEventListener\('change'/, 'and when the picker changes airport — the library is per airport');
});

test('a pull that adds nothing still paints both lists', () => {
  const at = MENU.indexOf('function _cuPresetsPull()');
  const body = MENU.slice(at, MENU.indexOf('\n}', MENU.indexOf('.catch(function () {});', at)));
  assert.match(body, /if \(merged\.length !== local\.length\) \{/, 'only the WRITE is conditional');
  assert.match(body, /_cuRenderPresetGroup\(\);/, 'the Customize group is drawn every pull');
  assert.match(body, /smRenderPresets\(\);/, 'and so is the sidebar');
  // the old early return must be gone, or a browser that already held the
  // palettes never draws them
  assert.doesNotMatch(body, /if \(merged\.length === local\.length\) return;/);
});
