'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — the pictures under fids-current/earth/v1
//
// NASA's Blue Marble Next Generation (a day picture per month) and Black
// Marble 2016 (the night), cut by scripts/earth/tile.swift into the squares
// the floor reads. scripts/earth/manifest.json lists every file; this holds
// the disk to it, so a square that goes missing, changes or appears from
// nowhere fails here and not on a screen.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const EARTH = path.join(ROOT, 'fids-current', 'earth');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'earth', 'manifest.json'), 'utf8'));
const LAYERS = Array.from({ length: 12 }, (_, i) => 'day-' + String(i + 1).padStart(2, '0')).concat(['night']);
const BUDGET = 160e6;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(path.relative(EARTH, p).split(path.sep).join('/'));
  }
  return out;
}
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}
// every APP segment a file carries (APP0 is the JFIF header)
function appSegments(buf) {
  const out = [];
  let i = 2;
  while (i + 4 < buf.length && buf[i] === 0xff && buf[i + 1] !== 0xda) {
    const m = buf[i + 1];
    if (m >= 0xe0 && m <= 0xef) out.push(m - 0xe0);
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return out;
}

const want = [];
for (const layer of LAYERS) {
  want.push('v1/world/' + layer + '.jpg');
  for (const [dir, span] of [['t16', 60], ['t32', 30]]) {
    for (let latS = -90; latS < 90; latS += span) for (let lonW = -180; lonW < 180; lonW += span) want.push('v1/' + dir + '/' + layer + '/' + latS + '_' + lonW + '.jpg');
  }
}

test('the set is whole: 13 layers of 91 files, and nothing else under earth/', () => {
  assert.equal(want.length, 13 * 91);
  const have = walk(EARTH, []).sort();
  assert.deepEqual(have, want.slice().sort());
  assert.ok(!have.some((f) => /\.DS_Store$|(^|\/)\./.test(f)), 'no hidden files');
});

test('the disk matches the manifest, byte for byte', () => {
  assert.equal(MANIFEST.count, want.length);
  assert.deepEqual(MANIFEST.files.map((f) => f.path).sort(), want.slice().sort());
  let total = 0;
  for (const f of MANIFEST.files) {
    const buf = fs.readFileSync(path.join(EARTH, f.path));
    assert.equal(buf.length, f.bytes, f.path);
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), f.sha256, f.path + ' changed');
    total += buf.length;
  }
  assert.equal(total, MANIFEST.bytes);
});

test('every file is a JPEG of the right size, small, and carries nothing but the picture', () => {
  let total = 0;
  for (const p of want) {
    const buf = fs.readFileSync(path.join(EARTH, p));
    const sz = jpegSize(buf), world = p.startsWith('v1/world/');
    assert.deepEqual(sz, world ? { w: 2048, h: 1024 } : { w: 960, h: 960 }, p);
    assert.ok(buf.length < 1e6, p + ' is over 1 MB');
    assert.deepEqual(appSegments(buf), [0], p + ': no Exif, ICC or Photoshop segments');
    total += buf.length;
  }
  assert.ok(total <= BUDGET, 'the set is ' + (total / 1e6).toFixed(1) + ' MB, over its budget');
});

test('the sources are pinned and documented', () => {
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'earth', 'sources.json'), 'utf8'));
  assert.deepEqual(src.sources.map((s) => s.layer), LAYERS);
  for (const s of src.sources) {
    assert.match(s.url, /^https:\/\/assets\.science\.nasa\.gov\//, s.layer);
    assert.ok(s.bytes > 1e6 && /^[0-9a-f]{64}$/.test(s.sha256), s.layer + ' is pinned');
  }
  const readme = fs.readFileSync(path.join(ROOT, 'scripts', 'earth', 'README.md'), 'utf8');
  assert.match(readme, /public domain/i);
  assert.match(readme, /endorse/i);
});
