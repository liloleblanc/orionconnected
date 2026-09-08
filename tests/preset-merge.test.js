'use strict';

// v23488 — the airport-wide preset library. This merge is the one piece of the
// sync that can DESTROY operator work, so it is tested behaviourally rather than
// by grepping the source: a device that has been offline holding palettes the
// cloud has not seen must contribute them, never be wiped by an older cloud copy.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'fids-current', 'js', 'menu.js'), 'utf8');
const from = src.indexOf('function _cuPresetsMerge(');
assert.ok(from >= 0, 'menu.js must define _cuPresetsMerge');
const body = src.slice(from, src.indexOf('\nvar _cuPresetPushTimer', from));
const _cuPresetsMerge = new Function(body + '\nreturn _cuPresetsMerge;')();

const P = (id, savedAt, name) => ({ id, name: name || id, colors: { accent: '#fff' }, savedAt });

test('keeps presets the cloud has never seen', () => {
  const merged = _cuPresetsMerge([P('a', 5), P('b', 5)], [P('a', 5)]);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((p) => p.id === 'b'), 'a local-only preset must survive the merge');
});

test('adds presets this device has never seen', () => {
  const merged = _cuPresetsMerge([P('a', 5)], [P('a', 5), P('c', 9)]);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((p) => p.id === 'c'));
});

test('the newer copy of a preset wins on both sides', () => {
  const cloudNewer = _cuPresetsMerge([P('a', 100, 'old')], [P('a', 200, 'new')]);
  assert.equal(cloudNewer.find((p) => p.id === 'a').name, 'new');
  const localNewer = _cuPresetsMerge([P('a', 300, 'mine')], [P('a', 200, 'theirs')]);
  assert.equal(localNewer.find((p) => p.id === 'a').name, 'mine');
});

test('an unstamped local preset is never dropped for an unstamped cloud one', () => {
  const merged = _cuPresetsMerge([{ id: 'a', name: 'keep' }], [{ id: 'a', name: 'other' }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'keep', 'ties keep the local copy rather than overwriting blind');
});

test('never returns fewer than the local library held', () => {
  for (const cloud of [[], null, undefined, [P('x', 1)]]) {
    const local = [P('a', 2), P('b', 3), P('c', 4)];
    assert.ok(_cuPresetsMerge(local, cloud).length >= local.length);
  }
});

test('junk entries cannot corrupt the library', () => {
  const merged = _cuPresetsMerge([P('a', 1)], [null, {}, { name: 'no id' }, P('b', 2)]);
  assert.deepEqual(merged.map((p) => p.id).sort(), ['a', 'b']);
});
