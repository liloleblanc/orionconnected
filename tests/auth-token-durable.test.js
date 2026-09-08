'use strict';

// v23492 — the session token has a DURABLE copy (localStorage, added v23170) and
// a per-TAB mirror (sessionStorage). Reading only the mirror means a second tab
// is signed in for everything that uses _acGetToken and signed OUT for every
// media call — uploads throw 'Not authenticated' and _isAdmin hides the Media
// tab, while Customize still syncs happily to the cloud. That is the state Nick
// hit: "Cannot add videos or pictures at all right now logos dont work", as an
// admin with a valid token.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'fids-current', 'js');
const core = fs.readFileSync(path.join(root, 'fids-core.js'), 'utf8');
const menu = fs.readFileSync(path.join(root, 'menu.js'), 'utf8');

test('there is one durable token reader and the media paths use it', () => {
  assert.match(core, /function _fidsAuthToken\(\)/);
  // Durable first, per-tab second — the same order as menu.js _acGetToken.
  const fn = core.slice(core.indexOf('function _fidsAuthToken()'), core.indexOf('function _fidsAuthToken()') + 420);
  assert.ok(fn.indexOf("localStorage.getItem('fids_token')") < fn.indexOf("sessionStorage.getItem('fids_token')"),
    'the durable copy must be preferred over the per-tab mirror');
  assert.match(core, /var token = _fidsAuthToken\(\);/);
});

test('no media path reads the per-tab mirror alone', () => {
  // The helper's own catch-fallback is the one legitimate per-tab read: if
  // localStorage throws (private mode, blocked storage) the mirror is all there
  // is. Everything OUTSIDE that function must go through the helper.
  for (const [name, src] of [['fids-core.js', core], ['menu.js', menu]]) {
    const lines = src.split('\n');
    const helperFrom = lines.findIndex((l) => /function _fidsAuthToken\(\)/.test(l));
    const helperTo = helperFrom >= 0 ? helperFrom + 4 : -1;   // the helper is 4 lines
    const offenders = lines
      .map((line, i) => [i + 1, line])
      .filter(([n]) => helperFrom < 0 || n <= helperFrom || n > helperTo)
      .filter(([, line]) => /sessionStorage\.getItem\('fids_token'\)/.test(line))
      .filter(([, line]) => !/localStorage\.getItem\('fids_token'\)/.test(line));
    assert.deepEqual(offenders, [], `${name} still reads the per-tab token alone at ${offenders.map(([n]) => n).join(', ')}`);
  }
});

test('the Media tab admin check is durable too', () => {
  const from = menu.indexOf('function _isAdmin()');
  assert.ok(from >= 0);
  const body = menu.slice(from, from + 900);
  assert.match(body, /_fidsAuthToken|localStorage\.getItem\('fids_token'\)/);
});
