'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// MORE THAN ONE TAKE OF THE SAME WEATHER — v23840.
//
// The scene behind the weather card follows the sky at the board's own
// airport, folded to five families each with a day and a night slot. A board
// that runs around the clock reaches each slot many times a week, so a slot
// holds a LIST of clips rather than one, and the card draws a different take
// each time it comes round.
//
// Two things make that harder than a random index, and both are pinned here:
// the chosen file is part of the card's rebuild signature, so a second draw
// inside one visit would restart the clip and the card with it; and a draw
// that can repeat itself defeats the point on the very slot that matters.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const JS = SRC.replace(/^\s*\/\/.*$/gm, '');
const VIDEO = path.join(ROOT, 'fids-current/logos/Backgrounds/video');

function blockOf(head) {
  const at = JS.indexOf(head);
  assert.ok(at >= 0, `fids-core.js must define ${head}`);
  let d = 0;
  for (let k = JS.indexOf('{', at); k < JS.length; k++) {
    if (JS[k] === '{') d++;
    else if (JS[k] === '}') { d--; if (d === 0) return JS.slice(at, k + 1); }
  }
  assert.fail(`unterminated ${head}`);
}

const TABLE_SRC = blockOf('var _WX_SCENE_TAKES = ') + ';';
const PICK_SRC = blockOf('function _wxSceneTake(slot, key, avoid)');
const FOR_SRC = blockOf('function _wxSceneTakesFor(slots)');

// A picker with its own state, driven by a fake visit counter, plus an
// injectable list so the shuffle can be tested without waiting for footage.
function makePicker(overrides, rnd) {
  const win = { _gateAdVisitSeq: 0 };
  const fn = new Function('window', 'Math', `
    ${TABLE_SRC}
    var _wxTakeHeld = {}, _wxTakeLast = {};
    ${PICK_SRC}
    ${FOR_SRC}
    return { take: _wxSceneTake, takesFor: _wxSceneTakesFor, table: _WX_SCENE_TAKES, win: window };
  `)(win, rnd ? Object.assign(Object.create(Math), { random: rnd }) : Math);
  if (overrides) for (const k of Object.keys(overrides)) fn.table[k] = overrides[k];
  fn.visit = () => { win._gateAdVisitSeq++; };
  return fn;
}

const SLOTS = ['clear-day', 'clear-night', 'cloud-day', 'cloud-night',
               'rain-day', 'rain-night', 'snow-day', 'snow-night',
               'storm-day', 'storm-night'];

test('every scene slot the card can reach is listed', () => {
  const { table } = makePicker();
  for (const s of SLOTS) {
    assert.ok(Array.isArray(table[s]) && table[s].length >= 1,
      `${s} must list at least one clip`);
  }
  assert.deepEqual(Object.keys(table).sort(), SLOTS.slice().sort(),
    'the table holds exactly the ten slots, no strays');
});

test('every clip named in the table is a file that exists', () => {
  const { table } = makePicker();
  for (const slot of Object.keys(table)) {
    for (const f of table[slot]) {
      assert.ok(fs.existsSync(path.join(VIDEO, f + '.mp4')),
        `${slot} names ${f}.mp4, which is not in logos/Backgrounds/video`);
      assert.ok(!/\.mp4$/.test(f), `${slot} lists ${f} with an extension; the table holds bare names`);
      assert.ok(!/[\/\\]/.test(f), `${slot} lists a path, not a filename`);
    }
  }
});

test('clear keeps the two loops the card has always had as its first take', () => {
  const { table } = makePicker();
  assert.equal(table['clear-day'][0], 'wx-grass-loop');
  assert.equal(table['clear-night'][0], 'wx-fireflies-night');
});

test('the drawn scenes are retired: every weather slot is real footage, several takes deep', () => {
  // v23841. The owner brought the footage; the shuffle is the point of having
  // it, and a shuffle of two is a coin toss. Three is the floor.
  const { table } = makePicker();
  for (const kind of ['cloud', 'rain', 'snow', 'storm']) {
    for (const tod of ['day', 'night']) {
      const list = table[`${kind}-${tod}`];
      assert.ok(list.length >= 3, `${kind}-${tod} holds ${list.length} takes; the shuffle needs at least three`);
      assert.ok(!list.includes(`wx-scene-${kind}-${tod}`), `${kind}-${tod} still lists the retired drawn loop`);
      for (const f of list) {
        assert.match(f, new RegExp(`^wx-scene-${kind}-${tod}-\\d+$`),
          `${f} must be named for its slot and its source id, so the licence file can always be found`);
      }
    }
  }
});

// Seconds in an MP4, read from the file's own mvhd atom.
function mp4Seconds(file) {
  const b = fs.readFileSync(file);
  const find = (start, end, type) => {
    let at = start;
    while (at + 8 <= end) {
      let size = b.readUInt32BE(at); const t = b.toString('latin1', at + 4, at + 8); let hdr = 8;
      if (size === 1) { size = Number(b.readBigUInt64BE(at + 8)); hdr = 16; }
      if (size === 0) size = end - at;
      if (t === type) return [at + hdr, at + size];
      if (size < 8) return null;
      at += size;
    }
    return null;
  };
  const moov = find(0, b.length, 'moov');
  const mvhd = moov && find(moov[0], moov[1], 'mvhd');
  assert.ok(mvhd, `${path.basename(file)} has no mvhd atom`);
  const at = mvhd[0];
  return b[at] === 1
    ? Number(b.readBigUInt64BE(at + 24)) / b.readUInt32BE(at + 20)
    : b.readUInt32BE(at + 16) / b.readUInt32BE(at + 12);
}

test('every take is a real MP4 the monitor can carry: ISO container, short, small', () => {
  // The scene plays from 3.8s to 19.7s of a visit, so a loop between 3.5s and
  // 8.2s seams at most a handful of times and never mid-arrival; 12MB is the
  // bound the other scene files already live under.
  const { table } = makePicker();
  const seen = new Set();
  for (const slot of Object.keys(table)) for (const f of table[slot]) {
    if (seen.has(f)) continue; seen.add(f);
    const file = path.join(VIDEO, f + '.mp4');
    assert.ok(fs.existsSync(file), `${f}.mp4 is listed in ${slot} but not on disk`);
    const head = fs.readFileSync(file, { encoding: 'latin1', start: 0, end: 16 });
    assert.ok(head.includes('ftyp'), `${f}.mp4 must be an ISO media file`);
    assert.ok(!head.includes('qt  '), `${f}.mp4 must be a real MP4, not a QuickTime container renamed`);
    const mb = fs.statSync(file).size / 1024 / 1024;
    assert.ok(mb < 12, `${f}.mp4 is ${mb.toFixed(1)}MB`);
    if (/^wx-scene-/.test(f)) {
      const s = mp4Seconds(file);
      assert.ok(s >= 3.5 && s <= 8.2, `${f}.mp4 runs ${s.toFixed(2)}s; a take is 3.5-8.2s`);
    }
  }
});

test('an unlisted slot still resolves to the file the card used before', () => {
  const p = makePicker();
  delete p.table['snow-night'];
  delete p.table['clear-day'];
  delete p.table['clear-night'];
  assert.equal(p.take('snow-night'), 'wx-scene-snow-night');
  assert.equal(p.take('clear-day'), 'wx-grass-loop');
  assert.equal(p.take('clear-night'), 'wx-fireflies-night');
});

test('one draw per visit: a rebuild mid-card keeps the clip it is playing', () => {
  const p = makePicker({ 'snow-night': ['a', 'b', 'c', 'd'] });
  const first = p.take('snow-night');
  for (let i = 0; i < 40; i++) {
    assert.equal(p.take('snow-night'), first,
      'the same visit must draw the same file, or the card rebuilds under itself');
  }
  let changed = false;
  for (let i = 0; i < 60 && !changed; i++) {
    p.visit();
    if (p.take('snow-night') !== first) changed = true;
  }
  assert.ok(changed, 'a new visit must be able to draw a different take');
});

test('the same take never runs twice running', () => {
  const p = makePicker({ 'rain-day': ['a', 'b', 'c'] });
  let prev = p.take('rain-day');
  const seen = new Set([prev]);
  for (let i = 0; i < 200; i++) {
    p.visit();
    const now = p.take('rain-day');
    assert.notEqual(now, prev, 'a take repeated itself back to back');
    seen.add(now);
    prev = now;
  }
  assert.equal(seen.size, 3, 'over 200 visits every take should have played');
});

test('a slot holding two clips alternates rather than sticking', () => {
  const p = makePicker({ 'cloud-day': ['a', 'b'] });
  const run = [];
  for (let i = 0; i < 8; i++) { run.push(p.take('cloud-day')); p.visit(); }
  assert.deepEqual(run, ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'].slice(0, 8).map((_, i) =>
    run[0] === 'a' ? (i % 2 ? 'b' : 'a') : (i % 2 ? 'a' : 'b')));
});

test('one clip in a slot is drawn without touching the visit counter', () => {
  // A single-clip slot must not consult the counter at all: it is what a slot
  // looks like before footage lands, and it must behave exactly as before.
  const p = makePicker({ 'snow-day': ['only-one'] });
  delete p.win._gateAdVisitSeq;
  for (let i = 0; i < 20; i++) assert.equal(p.take('snow-day'), 'only-one');
});

test('the card builds the scene src from the table, not by hand', () => {
  assert.match(JS, /var _wxSceneSlot = _wxSceneKind \+ \(_wxNightScene \? '-night' : '-day'\);/,
    'the slot name is built once');
  assert.match(JS, /var _wxTakes = _wxSceneTakesFor\(_wxSlots\);/, 'the srcs come from the picker, one per screen (v23844)');
  assert.match(JS, /'src="\/logos\/Backgrounds\/video\/' \+ _wxTakes\[_vi\] \+ '\.mp4"/, 'and are spelled from what it drew');
  const callSite = JS.slice(JS.indexOf('var _wxSceneSlot'), JS.indexOf('var _wxSceneSlot') + 400);
  assert.ok(!/wx-scene-' \+ _wxSceneKind/.test(callSite),
    'the old hand-built filename must be gone, or two rules decide the scene');
});

test('the draw is per slot, so rain and snow do not share a turn', () => {
  const p = makePicker({ 'rain-day': ['r1', 'r2'], 'snow-day': ['s1', 's2'] });
  const r = p.take('rain-day');
  const s = p.take('snow-day');
  assert.ok(['r1', 'r2'].includes(r));
  assert.ok(['s1', 's2'].includes(s));
  assert.equal(p.take('rain-day'), r, 'drawing another slot must not disturb this one');
});


test('a scene per screen: three draws, all different where the slots allow, held for the visit', () => {
  const p = makePicker({ 'snow-night': ['a', 'b', 'c', 'd'], 'rain-day': ['r1', 'r2', 'r3'] });
  for (let i = 0; i < 30; i++) {
    const t = p.takesFor(['snow-night', 'snow-night', 'rain-day']);
    assert.equal(t.length, 3);
    assert.notEqual(t[0], t[1], 'two screens on the same slot must not show the same take');
    assert.ok(['r1', 'r2', 'r3'].includes(t[2]));
    assert.deepEqual(p.takesFor(['snow-night', 'snow-night', 'rain-day']), t, 'a rebuild mid-visit keeps all three');
    p.visit();
  }
});

test('a missing screen draws no scene, and a slot with one take still serves every screen', () => {
  const p = makePicker({ 'cloud-day': ['only'] });
  assert.deepEqual(p.takesFor(['cloud-day', null, null]), ['only', null, null]);
  assert.deepEqual(p.takesFor(['cloud-day', 'cloud-day', 'cloud-day']), ['only', 'only', 'only'],
    'with nothing else to show, the same take is better than no take');
});
