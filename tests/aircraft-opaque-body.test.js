'use strict';

// WHY THIS EXISTS
//
// The gate shelf and the archive card draw every aircraft picture in
// fids-current/aircraft over a moving sky, so a part of an airframe that is
// not opaque shows the sky and the clouds through the paint. An audit in
// October 2026 composited all 319 pictures over the shelf's day sky (#8DCBEB)
// and over white and compared the two in CIE76 dE*ab, pixel by pixel, inside
// the body (the outline at alpha 128 or more with its enclosed holes filled,
// 2 px in from its edge so the anti-aliased rim does not count). Five
// pictures showed sky where there should be paint:
//   - CR7, CR9 and CRK (the same file as CR9): an alpha-0 slit between the
//     wing-root fairing and the belly, a thin line of sky under the cabin;
//   - AS/73W: the dorsal-fin fillet knocked out by background removal;
//   - 9A/146 (Air Atlantic's BAe 146 on heritage gates): the whole white
//     upper fuselage, nose and fin fillet went out with the background. That
//     one joins the sky outside, so a check inside the outline cannot see it;
//     the third test below closes the outline first.
// Each was repaired by raising alpha (9A/146 took its matte from the clean
// drawing the archive card uses). In the first four, the pixels that were at
// alpha 0 store pure black and no paint, so they take their colour from the
// opaque pixels around them; every other pixel keeps its own colour. The tool
// is scripts/aircraft-opacity/fill-named-holes.py.
//
// The thresholds are what can be seen on the shelf, on purpose. 110 more
// pictures differ faintly over sky and white (soft anti-aliased rims, bodies
// at alpha 249-254, hairlines between abutting shapes); none of it shows at
// shelf size, and a broader repair that closed every 1-2 px crack was turned
// down because it also painted over real sky outside the airframe in 34
// pictures. Rule: clouds go behind an aircraft, never through it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DIR = path.resolve(__dirname, '..', 'fids-current', 'aircraft');

const SKY = [141, 203, 235];  // median sky pixel of the day shelf
const BODY_SHARE_MAX = 0.03;  // share of the body at dE >= 6 that is still allowed
const SPOT_PX_MAX = 200;      // largest 8-connected area at dE >= 15 that is still allowed
const OPEN_MAX = 0.01;        // transparent share of the airframe inside its closed outline
// A pixel at this alpha or above cannot reach dE 6 whatever its colour (the
// fourth test checks it), so its colour is never needed.
const ALPHA_SAFE = 232;

// The holes repaired in October 2026: the inclusive boxes [x0, y0, x1, y1]
// that fill-named-holes.py searched. In a box, no pixel may be non-opaque and
// enclosed by opaque ones; a non-opaque area that reaches the canvas edge is
// sky outside the airframe and is allowed. The body checks above catch these
// holes with little margin (AS/73W was 211 px against the 200 px limit), so
// this list is what keeps every pixel of them closed.
const REPAIRED = {
  'CR7.png': [[440, 250, 660, 290]],
  'CR9.png': [[440, 215, 620, 250]],
  'CRK.png': [[440, 215, 620, 250]],
  'AS/73W.png': [[1145, 305, 1235, 340]],
};

function pngFiles(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...pngFiles(path.join(dir, e.name), rel));
    else if (/\.png$/i.test(e.name)) out.push(rel);
  }
  return out.sort();
}

// ── PNG ─────────────────────────────────────────────────────────────────────
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Undo the PNG row filters of `raw` (rows of 1 + stride bytes). */
function unfilter(raw, h, stride, bpp, file) {
  const px = new Uint8Array(stride * h);
  for (let y = 0, rp = 0; y < h; y++, rp += stride) {
    const f = raw[rp++], o = y * stride, u = o - stride;
    if (f === 0 || (f === 2 && !y)) {
      px.set(raw.subarray(rp, rp + stride), o);
    } else if (f === 1 || (f === 4 && !y)) {
      for (let x = 0; x < bpp; x++) px[o + x] = raw[rp + x];
      for (let x = bpp; x < stride; x++) px[o + x] = raw[rp + x] + px[o + x - bpp];
    } else if (f === 2) {
      for (let x = 0; x < stride; x++) px[o + x] = raw[rp + x] + px[u + x];
    } else if (f === 3) {
      if (!y) {
        for (let x = 0; x < bpp; x++) px[o + x] = raw[rp + x];
        for (let x = bpp; x < stride; x++) px[o + x] = raw[rp + x] + (px[o + x - bpp] >> 1);
      } else {
        for (let x = 0; x < bpp; x++) px[o + x] = raw[rp + x] + (px[u + x] >> 1);
        for (let x = bpp; x < stride; x++) px[o + x] = raw[rp + x] + ((px[o + x - bpp] + px[u + x]) >> 1);
      }
    } else if (f === 4) {
      for (let x = 0; x < bpp; x++) px[o + x] = raw[rp + x] + px[u + x];
      for (let x = bpp; x < stride; x++) {
        const a = px[o + x - bpp], b = px[u + x], c = px[u + x - bpp];
        const pa = b > c ? b - c : c - b, pb = a > c ? a - c : c - a, q = a + b - 2 * c, pc = q < 0 ? -q : q;
        px[o + x] = raw[rp + x] + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
      }
    } else assert.fail(file + ': bad PNG filter ' + f + ' on row ' + y);
  }
  return px;
}

/** The alpha plane alone of an 8-bit RGBA PNG. Each channel is filtered on
 *  its own, so alpha can be undone without the colours. */
function unfilterAlpha(raw, w, h, file) {
  const A = new Uint8Array(w * h), stride = w * 4;
  for (let y = 0, rp = 0; y < h; y++, rp += stride) {
    const f = raw[rp++], o = y * w, u = o - w, r = rp + 3;
    if (f === 0 || (f === 2 && !y)) {
      for (let x = 0; x < w; x++) A[o + x] = raw[r + 4 * x];
    } else if (f === 1 || (f === 4 && !y)) {
      A[o] = raw[r];
      for (let x = 1; x < w; x++) A[o + x] = raw[r + 4 * x] + A[o + x - 1];
    } else if (f === 2) {
      for (let x = 0; x < w; x++) A[o + x] = raw[r + 4 * x] + A[u + x];
    } else if (f === 3) {
      if (!y) {
        A[o] = raw[r];
        for (let x = 1; x < w; x++) A[o + x] = raw[r + 4 * x] + (A[o + x - 1] >> 1);
      } else {
        A[o] = raw[r] + (A[u] >> 1);
        for (let x = 1; x < w; x++) A[o + x] = raw[r + 4 * x] + ((A[o + x - 1] + A[u + x]) >> 1);
      }
    } else if (f === 4) {
      A[o] = raw[r] + A[u];
      for (let x = 1; x < w; x++) {
        const a = A[o + x - 1], b = A[u + x], c = A[u + x - 1];
        const pa = b > c ? b - c : c - b, pb = a > c ? a - c : c - a, q = a + b - 2 * c, pc = q < 0 ? -q : q;
        A[o + x] = raw[r + 4 * x] + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
      }
    } else assert.fail(file + ': bad PNG filter ' + f + ' on row ' + y);
  }
  return A;
}

/** Any non-interlaced PNG: greyscale, RGB, palette (with or without tRNS,
 *  1-8 bits), grey+alpha, RGBA; 16-bit channels are read by their high byte.
 *  Returns the alpha plane, and the RGBA pixels on demand. */
function decode(file) {
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47, file + ': not a PNG');
  let p = 8, w = 0, h = 0, bd = 0, ct = -1, plte = null, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9];
      assert.equal(d[12], 0, file + ': interlaced PNG not supported here');
    } else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = CHANNELS[ct];
  assert.ok(ch, file + ': colour type ' + ct + ' not supported');
  assert.ok([1, 2, 4, 8, 16].includes(bd), file + ': bit depth ' + bd);
  if (ct === 3) assert.ok(plte, file + ': palette PNG without PLTE');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bits = ch * bd, stride = Math.ceil((w * bits) / 8), bpp = Math.max(1, bits >> 3);
  assert.ok(raw.length >= (stride + 1) * h, file + ': image data is short');

  if (ct === 6 && bd === 8) {
    let rgba = null;
    return { w, h, A: unfilterAlpha(raw, w, h, file), rgba: () => rgba || (rgba = unfilter(raw, h, stride, bpp, file)) };
  }

  const px = unfilter(raw, h, stride, bpp, file);
  const N = w * h, rgba = new Uint8Array(N * 4);
  const step = bd === 16 ? 2 : 1;
  const sample = (row, s) => {           // one sample: a byte, or a palette index / grey level
    if (bd >= 8) return px[row + s * step];
    const per = 8 / bd, byte = px[row + Math.floor(s / per)];
    return (byte >> (8 - bd * (1 + (s % per)))) & ((1 << bd) - 1);
  };
  const toByte = bd >= 8 ? (v) => v : (v) => Math.round((v * 255) / ((1 << bd) - 1));
  const key = (k) => (trns && trns.length >= 2 * (k + 1) ? trns.readUInt16BE(2 * k) : -1);
  const keyByte = (k) => (bd === 16 ? k >> 8 : k);
  const kGrey = ct === 0 ? key(0) : -1;
  const kRgb = ct === 2 ? [key(0), key(1), key(2)] : null;
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ct === 3) {
        const k = sample(row, x);
        rgba[o] = plte[k * 3]; rgba[o + 1] = plte[k * 3 + 1]; rgba[o + 2] = plte[k * 3 + 2];
        rgba[o + 3] = trns && k < trns.length ? trns[k] : 255;
      } else if (ct === 0 || ct === 4) {
        const g = sample(row, ct === 4 ? x * 2 : x);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = toByte(g);
        rgba[o + 3] = ct === 4 ? sample(row, x * 2 + 1) : (kGrey >= 0 && g === keyByte(kGrey) ? 0 : 255);
      } else {
        const s = x * ch;
        rgba[o] = sample(row, s); rgba[o + 1] = sample(row, s + 1); rgba[o + 2] = sample(row, s + 2);
        rgba[o + 3] = ct === 6 ? sample(row, s + 3)
          : (kRgb[0] >= 0 && rgba[o] === keyByte(kRgb[0]) && rgba[o + 1] === keyByte(kRgb[1]) && rgba[o + 2] === keyByte(kRgb[2]) ? 0 : 255);
      }
    }
  }
  const A = new Uint8Array(N);
  for (let i = 0; i < N; i++) A[i] = rgba[i * 4 + 3];
  return { w, h, A, rgba: () => rgba };
}

// ── colour ──────────────────────────────────────────────────────────────────
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const fl = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab(r, g, b) {
  r = lin(r); g = lin(g); b = lin(b);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const fx = fl(X), fy = fl(Y), fz = fl(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const deCache = new Map();
/** How differently a pixel reads over the shelf's sky and over white (CIE76). */
function seeThrough(r, g, b, a) {
  const k = ((r * 256 + g) * 256 + b) * 256 + a;
  let v = deCache.get(k);
  if (v === undefined) {
    const al = a / 255;
    const s = lab(al * r + (1 - al) * SKY[0], al * g + (1 - al) * SKY[1], al * b + (1 - al) * SKY[2]);
    const t = lab(al * r + (1 - al) * 255, al * g + (1 - al) * 255, al * b + (1 - al) * 255);
    v = Math.hypot(s[0] - t[0], s[1] - t[1], s[2] - t[2]);
    deCache.set(k, v);
  }
  return v;
}

// ── shapes ──────────────────────────────────────────────────────────────────
/** The background of a plane (cells below `thr`) as runs per row, labelled
 *  4-connected; `out[j]` is 1 when run j's area reaches the edge of the plane. */
function backgroundRuns(P, w, h, thr) {
  let cap = 1024, n = 0;
  let x0s = new Int32Array(cap), x1s = new Int32Array(cap), parent = new Int32Array(cap);
  const rowStart = new Int32Array(h + 1);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  let prev0 = 0, prev1 = 0;
  for (let y = 0; y < h; y++) {
    rowStart[y] = n;
    const o = y * w;
    for (let x = 0; x < w;) {
      if (P[o + x] >= thr) { x++; continue; }
      const x0 = x;
      while (x < w && P[o + x] < thr) x++;
      if (n === cap) {
        cap *= 2;
        const a = new Int32Array(cap), b = new Int32Array(cap), c = new Int32Array(cap);
        a.set(x0s); b.set(x1s); c.set(parent); x0s = a; x1s = b; parent = c;
      }
      x0s[n] = x0; x1s[n] = x; parent[n] = n;
      for (let j = prev0; j < prev1; j++) {
        if (x0s[j] < x && x0 < x1s[j]) { const a = find(n), b = find(j); if (a !== b) parent[a] = b; }
      }
      n++;
    }
    prev0 = rowStart[y]; prev1 = n;
  }
  rowStart[h] = n;
  const edge = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let j = rowStart[y]; j < rowStart[y + 1]; j++) {
      if (y === 0 || y === h - 1 || x0s[j] === 0 || x1s[j] === w) edge[find(j)] = 1;
    }
  }
  const out = new Uint8Array(n);
  for (let j = 0; j < n; j++) out[j] = edge[find(j)];
  return { x0s, x1s, rowStart, out };
}

/** A 0/1 grid with every empty area that does not reach its edge filled. */
function fillHoles(m, w, h) {
  const { x0s, x1s, rowStart, out } = backgroundRuns(m, w, h, 1);
  const f = new Uint8Array(w * h).fill(1);
  for (let y = 0; y < h; y++) {
    for (let j = rowStart[y]; j < rowStart[y + 1]; j++) if (out[j]) f.fill(0, y * w + x0s[j], y * w + x1s[j]);
  }
  return f;
}

/** Square dilation (grow) or erosion (shrink) of a 0/1 grid by r cells;
 *  the outside of the grid counts as empty. */
function morph(m, w, h, r, grow) {
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h), pre = new Int32Array(Math.max(w, h) + 1);
  const full = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + m[row + x];
    for (let x = 0; x < w; x++) {
      t[row + x] = grow ? (pre[Math.min(w, x + r + 1)] - pre[Math.max(0, x - r)] > 0 ? 1 : 0)
        : (x >= r && x + r < w && pre[x + r + 1] - pre[x - r] === full ? 1 : 0);
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + t[y * w + x];
    for (let y = 0; y < h; y++) {
      o[y * w + x] = grow ? (pre[Math.min(h, y + r + 1)] - pre[Math.max(0, y - r)] > 0 ? 1 : 0)
        : (y >= r && y + r < h && pre[y + r + 1] - pre[y - r] === full ? 1 : 0);
    }
  }
  return o;
}

/** Sorted, merged [x0, x1) intervals. */
function mergeIntervals(iv) {
  iv.sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const [a, b] of iv) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) { if (b > last[1]) last[1] = b; } else out.push([a, b]);
  }
  return out;
}

let MARK = new Uint8Array(0);

/** All the measurements for one picture. */
function measure(rel) {
  const img = decode(path.join(DIR, rel));
  const { w, h, A } = img, N = w * h;

  // The outside: background (alpha < 128) whose area reaches the canvas
  // edge. Everything else is the airframe with its enclosed holes filled.
  const { x0s, x1s, rowStart, out } = backgroundRuns(A, w, h, 128);

  // 1+2. The body: the filled airframe 2 px in (the canvas edge counts as
  //      outside). In it, how differently each pixel reads over sky and white.
  let bodyN = 0;
  const cand = [];
  for (let y = 2; y < h - 2; y++) {
    const ban = [];
    for (let yy = y - 2; yy <= y + 2; yy++) {
      for (let j = rowStart[yy]; j < rowStart[yy + 1]; j++) if (out[j]) ban.push([x0s[j] - 2, x1s[j] + 2]);
    }
    ban.push([w - 2, w - 2]);
    let x = 2;
    for (const [a, b] of mergeIntervals(ban)) {
      const end = Math.min(a, w - 2);
      if (end > x) {
        bodyN += end - x;
        for (let i = y * w + x, stop = y * w + end; i < stop; i++) if (A[i] < ALPHA_SAFE) cand.push(i);
      }
      if (b > x) x = b;
    }
  }
  let n6 = 0, worst = 0;
  const spots = [];
  if (cand.length) {
    const rgba = img.rgba();
    if (MARK.length < N) MARK = new Uint8Array(N);
    for (const i of cand) {
      const d = seeThrough(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], A[i]);
      if (d >= 6) n6++;
      if (d >= 15) { MARK[i] = 1; spots.push(i); }
      if (d > worst) worst = d;
    }
  }
  // the largest 8-connected area at dE >= 15
  let biggest = 0, biggestAt = null;
  const queue = [];
  for (const s of spots) {
    if (MARK[s] !== 1) continue;
    MARK[s] = 2; queue.length = 0; queue.push(s);
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % w, y = (i - x) / w;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (MARK[k] === 1) { MARK[k] = 2; queue.push(k); }
      }
    }
    if (queue.length > biggest) { biggest = queue.length; biggestAt = [bx0, by0, bx1, by1]; }
  }
  for (const s of spots) MARK[s] = 0;

  // 3. Paint that went out with the background joins the sky outside, so the
  //    body above cannot see it. Pool the outline (alpha >= 128) to about
  //    500 px wide (a block is outline if any of it is: a 1 px stroke must
  //    survive), close it by r blocks so gaps narrower than about 2r join up,
  //    fill it, and count what the outline itself leaves empty.
  const k = Math.max(1, Math.floor(w / 500)), sw = Math.ceil(w / k), sh = Math.ceil(h / k), M = sw * sh;
  const Ss = new Uint8Array(M);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / k) * sw;
    let x = 0;
    for (let j = rowStart[y]; j <= rowStart[y + 1]; j++) {
      const end = j < rowStart[y + 1] ? x0s[j] : w;
      if (end > x) Ss.fill(1, row + Math.floor(x / k), row + Math.floor((end - 1) / k) + 1);
      if (j < rowStart[y + 1]) x = x1s[j];
    }
  }
  const r = Math.max(2, Math.round(Math.max(4, w / 250) / k));
  const C = fillHoles(morph(morph(Ss, sw, sh, r, true), sw, sh, r, false), sw, sh), Sf = fillHoles(Ss, sw, sh);
  const gap = new Uint8Array(M);
  for (let j = 0; j < M; j++) gap[j] = C[j] && !Sf[j] ? 1 : 0;
  const g1 = morph(gap, sw, sh, 1, false);
  let openN = 0, sfN = 0;
  for (let j = 0; j < M; j++) { openN += g1[j]; sfN += Sf[j]; }

  // the repaired holes: non-opaque pixels in a box that do not join the
  // canvas edge (4-connected, through non-opaque pixels)
  const unrepaired = [];
  const boxes = REPAIRED[rel] || [];
  if (boxes.length) {
    const t = backgroundRuns(A, w, h, 255);
    for (const [bx0, by0, bx1, by1] of boxes) {
      assert.ok(bx0 <= bx1 && by0 <= by1 && bx1 < w && by1 < h, rel + ': repaired box ' + [bx0, by0, bx1, by1].join(',') + ' is off the canvas');
      let n = 0;
      for (let y = by0; y <= by1; y++) {
        for (let j = t.rowStart[y]; j < t.rowStart[y + 1]; j++) {
          if (t.out[j]) continue;
          const a = Math.max(t.x0s[j], bx0), b = Math.min(t.x1s[j], bx1 + 1);
          if (b > a) n += b - a;
        }
      }
      if (n) unrepaired.push(n + ' px not opaque and enclosed by the airframe in ' + [bx0, by0, bx1, by1].join(','));
    }
  }

  return { w, h, bodyN, n6, share6: bodyN ? n6 / bodyN : 0, worst, biggest, biggestAt,
    openShare: sfN ? openN / sfN : 0, unrepaired };
}

const FILES = pngFiles(DIR);
const RESULTS = new Map();
const result = (rel) => { if (!RESULTS.has(rel)) RESULTS.set(rel, measure(rel)); return RESULTS.get(rel); };
const pct = (v) => (100 * v).toFixed(2) + '%';

test('the aircraft folder is where the shelf reads it, and holds the pictures', () => {
  assert.ok(FILES.length >= 300, 'expected the full set of aircraft pictures, found ' + FILES.length);
  for (const rel of Object.keys(REPAIRED)) assert.ok(FILES.includes(rel), rel + ' is listed as repaired but is not in the folder');
});

test('no aircraft picture shows the sky through its body', () => {
  const bad = [];
  for (const rel of FILES) {
    const m = result(rel);
    if (m.share6 >= BODY_SHARE_MAX) {
      bad.push(rel + ': ' + pct(m.share6) + ' of the body reads differently over sky and white (dE >= 6), limit ' + pct(BODY_SHARE_MAX));
    }
    if (m.biggest > SPOT_PX_MAX) {
      bad.push(rel + ': a ' + m.biggest + ' px area of sky inside the body (dE >= 15) at ' + m.biggestAt.join(',') + ', limit ' + SPOT_PX_MAX + ' px');
    }
  }
  assert.deepEqual(bad, [], 'sky through the airframe:\n' + bad.join('\n'));
});

test('no aircraft picture is missing paint that joins the sky outside', () => {
  const bad = [];
  for (const rel of FILES) {
    const m = result(rel);
    if (m.openShare > OPEN_MAX) bad.push(rel + ': ' + pct(m.openShare) + ' of the airframe is transparent inside its closed outline, limit ' + pct(OPEN_MAX));
  }
  assert.deepEqual(bad, [], 'paint keyed out with the background (rebuild the matte from a clean copy of the drawing):\n' + bad.join('\n'));
});

test('the holes repaired in October 2026 stay closed', () => {
  const bad = [];
  for (const rel of Object.keys(REPAIRED)) for (const u of result(rel).unrepaired) bad.push(rel + ': ' + u);
  assert.deepEqual(bad, [], 'a repaired hole shows sky again:\n' + bad.join('\n'));
});

test('a pixel at ALPHA_SAFE or above cannot reach dE 6, whatever its colour', () => {
  let worst = 0;
  for (let r = 0; r < 256; r += 5) for (let g = 0; g < 256; g += 5) for (let b = 0; b < 256; b += 5) {
    worst = Math.max(worst, seeThrough(r, g, b, ALPHA_SAFE));
  }
  assert.ok(worst < 5.5, 'dE ' + worst.toFixed(2) + ' at alpha ' + ALPHA_SAFE);
});

test('the PNG reader handles palette, grey and RGB pictures', () => {
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
    // the CRC is left 0: the reader does not check it
    return b;
  };
  const png = (w, h, bd, ct, rows, extra = []) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = bd; ihdr[9] = ct;
    const raw = Buffer.concat(rows.map((r, i) => Buffer.from([i % 5, ...r])));
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra,
      chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  };
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aircraft-png-'));
  try {
    // filters 0-4 by row; check against the same pixels written unfiltered
    const filtered = (bpp, rows) => {
      const out = [];
      rows.forEach((row, y) => {
        const f = y % 5, up = y ? rows[y - 1] : row.map(() => 0);
        out.push(row.map((v, x) => {
          const a = x >= bpp ? row[x - bpp] : 0, b = up[x], c = x >= bpp ? up[x - bpp] : 0;
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)][f];
          return (v - pred) & 255;
        }));
      });
      return out;
    };
    // 2-bit palette with tRNS: index 1 transparent
    const pal = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
    const idx = [[0, 1, 2, 3], [3, 2, 1, 0], [1, 1, 1, 1], [0, 0, 0, 0], [2, 3, 2, 3], [3, 3, 0, 1]];
    const packed = idx.map((r) => [(r[0] << 6) | (r[1] << 4) | (r[2] << 2) | r[3]]);
    fs.writeFileSync(path.join(tmp, 'p.png'), png(4, 6, 2, 3, filtered(1, packed), [chunk('PLTE', pal), chunk('tRNS', Buffer.from([255, 0]))]));
    const p = decode(path.join(tmp, 'p.png')), prgba = p.rgba();
    idx.forEach((row, y) => row.forEach((k, x) => {
      const o = (y * 4 + x) * 4;
      assert.deepEqual([...prgba.subarray(o, o + 4)], [pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2], k === 1 ? 0 : 255]);
      assert.equal(p.A[y * 4 + x], k === 1 ? 0 : 255);
    }));
    // 8-bit RGBA through every filter: the alpha-only path agrees with the full one
    const rows = [];
    for (let y = 0; y < 7; y++) { const r = []; for (let x = 0; x < 5; x++) r.push((x * 37 + y * 11) & 255, (x * y * 13) & 255, (200 - x * 9) & 255, (x * 53 + y * 29) & 255); rows.push(r); }
    fs.writeFileSync(path.join(tmp, 'a.png'), png(5, 7, 8, 6, filtered(4, rows)));
    const a = decode(path.join(tmp, 'a.png')), argba = a.rgba();
    rows.forEach((row, y) => row.forEach((v, j) => assert.equal(argba[y * 20 + j], v)));
    for (let i = 0; i < 35; i++) assert.equal(a.A[i], argba[i * 4 + 3]);
    // 8-bit grey: opaque
    fs.writeFileSync(path.join(tmp, 'g.png'), png(3, 2, 8, 0, filtered(1, [[0, 128, 255], [1, 2, 3]])));
    const g = decode(path.join(tmp, 'g.png'));
    assert.deepEqual([...g.rgba().subarray(4, 8)], [128, 128, 128, 255]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
