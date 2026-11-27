'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24144 — A BOARD LANDS ON ITS AIRPORT'S OWN ADDRESS, AND THE OLD BACKDROP
// SHOWS ONLY WHEN THE AIRPORT CHOSE IT.
//
//   fids.orionconnected.com/fids?ap=YYG  ->  https://yyg.orionconnected.com/fids
//
// localStorage is per origin, so one airport opened on two addresses kept two
// device copies of its settings. A device copy of the Customize field "Bottom
// of the board" (Classic) outranked the airport and showed the old backdrop
// on one address and not the other. Both halves are pinned here:
//   · airportAddress() in host-airport.js (pure), and its thin caller;
//   · _fidsAirportFloorOf() in fids-core.js and the device copy retired.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, 'fids-current', p), 'utf8');
const CORE = rd('js/fids-core.js');
const MENU = rd('js/menu.js');

// The address half (v24144, made strict in v24145: every board on its airport
// address, .app the app only, the phone asked at every arrival, one link
// helper) is pinned in tests/strict-addresses.test.js.

// ── THE BOTTOM OF THE BOARD ────────────────────────────────────────────────

function liftCore(head) {
  const at = CORE.indexOf(head);
  assert.ok(at >= 0, head);
  let d = 0;
  for (let k = CORE.indexOf('{', at); k < CORE.length; k++) {
    if (CORE[k] === '{') d++;
    else if (CORE[k] === '}') { d--; if (d === 0) return CORE.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + head);
}

test('the old backdrop is the airport choice only: classic in the cloud config, nothing else', () => {
  const box = {};
  vm.runInNewContext(liftCore('function _fidsAirportFloorOf(cfg)') + '\nthis.f = _fidsAirportFloorOf;', box);
  assert.equal(box.f({ floor: 'classic' }), 'classic');
  for (const cfg of [null, undefined, {}, { floor: '' }, { floor: 'earth' }, { floor: 'Classic' }, { floor: 'old' }]) {
    assert.equal(box.f(cfg), '', JSON.stringify(cfg));
  }
  // read from the KV copy itself, never getAirportConfig (whose per-browser
  // fids_airport_override_ would win) and never _pref (the device copy)
  const fn = liftCore('function _fidsAirportFloor(code)');
  assert.match(fn, /_airportConfigCache\[norm\]/);
  assert.doesNotMatch(fn, /getAirportConfig|_pref|localStorage/);
  assert.doesNotMatch(CORE, /_pref\('floor'\)/);
});

test('a device copy of the floor is retired where it is read, and Customize no longer keeps one', () => {
  assert.match(CORE, /if \(_userCfg && _userCfg\.floor !== undefined\) \{\s*delete _userCfg\.floor;/);
  assert.match(CORE, /if \(_flObj && _flObj\.floor !== undefined\) \{\s*delete _flObj\.floor;\s*localStorage\.setItem\(_flKey, JSON\.stringify\(_flObj\)\);/);
  // _cuSave writes the device copy without the floor; the cloud push still gets it
  const at = MENU.indexOf('function _cuSave(prefs) {');
  const end = MENU.indexOf('\n}\n', at) + 2;
  const store = {};
  const box = { localStorage: { setItem: (k, v) => { store[k] = v; } }, _cuStorageKey: () => 'fids_customize_YYG', Date };
  vm.runInNewContext(MENU.slice(at, end) + '\nthis.save = _cuSave;', box);
  const prefs = { theme: 'navy', floor: 'classic', wxIcons: '' };
  box.save(prefs);
  const kept = JSON.parse(store.fids_customize_YYG);
  assert.equal(kept.floor, undefined, 'not in the device copy');
  assert.equal(kept.theme, 'navy');
  assert.equal(prefs.floor, 'classic', 'still there for the cloud push');
  assert.match(MENU, /if \(prefs\.floor !== undefined\) body\.floor = prefs\.floor;/);
});

test('the floor control is shown disabled with the reason unless an admin is signed in, since only an admin save reaches the airport', () => {
  // v24145 — review note on #1141: Classic picked while signed out did nothing visible.
  // Signed in without admin rights the worker refuses the save (isAdmin) the same way.
  const lift = (name) => {
    const at = MENU.indexOf('function ' + name + '(');
    assert.ok(at >= 0, name);
    return MENU.slice(at, MENU.indexOf('\n}\n', at) + 2);
  };
  assert.match(lift('_cuPaintForm'), /try \{ _cuPaintAirportOnly\(true\); \} catch \(e\) \{\}/);
  const paint = lift('_cuPaintAirportOnly');
  assert.match(paint, /\['cuFloor', 'cuFloorNote', /, 'the floor and its note');
  assert.match(paint, /el\.disabled = !!why;/);
  assert.match(paint, /note\.textContent = why;/);
  // the reason, for the role read as editor-roles.js reads it (sessionStorage fids_user)
  const why = (token, user) => {
    const box = {
      _acGetToken: () => token, window: {},
      sessionStorage: { getItem: (k) => (k === 'fids_user' && user ? JSON.stringify(user) : null) },
    };
    vm.runInNewContext(lift('_cuEditorRole') + lift('_cuAirportOnlyWhy') + '\nthis.r = _cuAirportOnlyWhy();', box);
    return box.r;
  };
  assert.equal(why(null, null), 'Set for the whole airport. Sign in (Login) to change it.');
  assert.equal(why('token', { role: 'operator' }), 'Set for the whole airport. Only an admin can change it.');
  assert.equal(why('token', { role: 'viewer' }), 'Set for the whole airport. Only an admin can change it.');
  assert.equal(why('token', { role: 'admin' }), '');
  const MENU_HTML = rd('menu.html');
  assert.ok(MENU_HTML.indexOf('id="cuFloorNote"') > MENU_HTML.indexOf('id="cuFloor"'), 'the note sits under the control');
});
