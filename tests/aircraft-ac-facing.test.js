'use strict';

// WHY THIS EXISTS
//
// October 2026: the Air Canada fleet art was replaced, and every new
// picture faces the same way (nose LEFT). The regional pictures it replaced
// faced RIGHT, and the gate shelf flies each picture the way PLANE_FACING in
// fids-core.js says its nose points. A picture whose entry still says the old
// direction flies backwards against the clouds. Nothing checked the table
// against the pictures, so this does it for the AC folder: every picture has
// an entry, every entry has a picture, and each entry is the nose direction
// measured on the picture itself.
//
// Nose direction, measured the way the art pipeline measures it: over the
// columns that hold opaque pixels (alpha 128 or more), the tail fin is the
// highest point, so whichever end's first fifth reaches higher holds the fin
// and the nose is the other end.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'fids-current', 'aircraft', 'AC');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

function facingTable() {
  const i = CORE.indexOf('var PLANE_FACING = {');
  assert.ok(i >= 0, 'PLANE_FACING must exist');
  const j = CORE.indexOf('};', i);
  return new Function('return (' + CORE.slice(CORE.indexOf('{', i), j + 1) + ')')();
}

/** Alpha plane of an 8-bit non-interlaced RGBA or palette PNG (what the AC folder holds). */
function alphaOf(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt32BE(0), 0x89504e47, file + ': not a PNG');
  let p = 8, w = 0, h = 0, bd = 0, ct = -1, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9];
      assert.equal(d[12], 0, file + ': interlaced PNG');
    } else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  assert.equal(bd, 8, file + ': expected 8-bit channels');
  assert.ok(ct === 6 || ct === 3, file + ': expected RGBA or palette, got colour type ' + ct);
  const bpp = ct === 6 ? 4 : 1, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(stride * h);
  for (let y = 0, rp = 0; y < h; y++, rp += stride) {
    const f = raw[rp++], o = y * stride, u = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[u + x] : 0, c = (x >= bpp && y) ? px[u + x - bpp] : 0;
      let v = raw[rp + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else assert.equal(f, 0, file + ': bad filter ' + f);
      px[o + x] = v & 255;
    }
  }
  const A = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    A[i] = ct === 6 ? px[i * 4 + 3] : (trns && px[i] < trns.length ? trns[px[i]] : 255);
  }
  return { w, h, A };
}

function noseOf(file) {
  const { w, h, A } = alphaOf(file);
  const top = new Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) if (A[y * w + x] >= 128) { top[x] = y; break; }
  }
  const xs = top.map((t, x) => (t >= 0 ? x : -1)).filter((x) => x >= 0);
  assert.ok(xs.length > 0, file + ': no opaque pixels');
  const x0 = xs[0], x1 = xs[xs.length - 1], e = Math.max(1, Math.floor(0.2 * (x1 - x0 + 1)));
  const high = (from, to) => Math.min(...top.slice(from, to).filter((t) => t >= 0));
  return high(x1 - e + 1, x1 + 1) < high(x0, x0 + e) ? 'L' : 'R';
}

const TABLE = facingTable();
const FILES = fs.readdirSync(DIR).filter((f) => /\.png$/i.test(f)).sort();

test('every Air Canada picture has a facing entry, and every entry has a picture', () => {
  const entries = Object.keys(TABLE).filter((k) => k.startsWith('AC/'));
  for (const f of FILES) assert.ok(TABLE['AC/' + f], 'AC/' + f + ' has no PLANE_FACING entry');
  for (const k of entries) assert.ok(FILES.includes(k.slice(3)), k + ' is in PLANE_FACING but there is no such picture');
});

test("each Air Canada entry is the picture's own nose direction", () => {
  for (const f of FILES) {
    assert.equal(TABLE['AC/' + f], noseOf(path.join(DIR, f)), 'AC/' + f + ': PLANE_FACING says ' + TABLE['AC/' + f]);
  }
});
