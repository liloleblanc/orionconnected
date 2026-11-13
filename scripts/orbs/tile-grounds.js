#!/usr/bin/env node
'use strict';

// THE GROUND COLOUR OF EVERY FINISHED TILE, read from the art and written
// into fids-core.js as window._ORB_TILE_GROUNDS.
//
// A carrier with no emblem of its own takes its finished tile as the orb of
// its gate, and the five glyph badges under that orb take the tile's ground.
// The gate cannot read the colour of a file while it runs, so this script
// reads it: every svg in fids-current/logos/airline-tiles is sampled round
// the circle the orb crops it to (at 98% and at 95% of the radius), and a
// tile whose rim is one opaque colour all the way round is listed with that
// colour. A tile with a split ground, a clear surround, a rim the mark
// crosses or a rim painted by a gradient is left out: its gate needs a
// decision by hand (window._GATE_ORB_LOOKS in fids-core.js).
//
// A gradient is one colour only when all its opaque stops are within 6 of
// each other (CIEDE2000). The sampler reads a fill, not a ramp: it took the
// middle stop for the whole shape, so the Wizz tile (magenta down to blue)
// and the Qantas tile (two reds 11 apart) were listed as one flat ground that
// most of their rim is not.
//
// The same pass writes window._ORB_TILE_LETTERS: the tiles that are a flat
// square with a code set as svg text (a placeholder, not an emblem) and the
// code each one letters. The gate draws such a tile only for that code.
//
//   node scripts/orbs/tile-grounds.js           rewrite the table in place
//   node scripts/orbs/tile-grounds.js --check   exit 1 if table and art differ
//
// No dependencies. tests/gate-orbs-every-airline.test.js calls tileGrounds()
// and fails when the table in the code is not what the files give.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const TILES = path.join(ROOT, 'fids-current', 'logos', 'airline-tiles');
const CORE = path.join(ROOT, 'fids-current', 'js', 'fids-core.js');
const BEGIN = '// orb-tile-grounds:begin (written by scripts/orbs/tile-grounds.js, do not edit by hand)';
const END = '// orb-tile-grounds:end';

// The rim is one colour when the ring at the very edge of the crop is that colour for nine
// samples in ten and the ring just inside it for eight in ten (a mark may reach the inner ring).
const RINGS = [[0.98, 0.9], [0.95, 0.8]];
const RIM_SAMPLES = 72;

const NAMED = { white: '#FFFFFF', black: '#000000', red: '#FF0000', none: null, transparent: null, navy: '#000080',
  blue: '#0000FF', yellow: '#FFFF00', green: '#008000', orange: '#FFA500', gray: '#808080', grey: '#808080',
  silver: '#C0C0C0', gold: '#FFD700', maroon: '#800000', purple: '#800080' };

function colour(v) {
  if (v == null) return undefined;
  v = String(v).trim();
  if (!v || /^inherit$/i.test(v)) return undefined;
  if (/^url\(/i.test(v)) return 'url:' + v.replace(/^url\(\s*['"]?#?|['"]?\s*\)$/g, '');
  if (/^currentColor$/i.test(v)) return '#000000';
  const lv = v.toLowerCase();
  if (lv in NAMED) return NAMED[lv];
  let m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return '#' + m[1].split('').map((c) => c + c).join('').toUpperCase();
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) return '#' + m[1].toUpperCase();
  m = v.match(/^rgba?\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?/i);
  if (m) return '#' + [m[1], m[2], m[3]].map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}
function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? (m[2] !== undefined ? m[2] : m[3]) : undefined;
}
function styleProp(tag, prop) {
  const s = attr(tag, 'style');
  if (!s) return undefined;
  const m = s.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'i'));
  return m ? m[1].trim() : undefined;
}

// ── colour difference (CIEDE2000) ───────────────────────────────────────
const RAMP_DE = 6;
function lab(h) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16)));
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), Y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), Z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function dE(a, b) {
  const [L1, a1, b1] = lab(a), [L2, a2, b2] = lab(b), rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
  const hue = (x, y) => { if (x === 0 && y === 0) return 0; const t = Math.atan2(y, x) / rad; return t < 0 ? t + 360 : t; };
  const h1 = hue(a1p, b1), h2 = hue(a2p, b2);
  let dh = 0;
  if (C1 * C2 !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh * rad / 2), Lb = (L1 + L2) / 2, Cm = (C1 + C2) / 2;
  let hb = h1 + h2;
  if (C1 * C2 !== 0) hb = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad);
  const Rc = 2 * Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7)));
  const Sl = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2)), Sc = 1 + 0.045 * Cm, Sh = 1 + 0.015 * Cm * T;
  const Rt = -Math.sin(2 * 30 * Math.exp(-Math.pow((hb - 275) / 25, 2)) * rad) * Rc;
  return Math.sqrt(Math.pow((L2 - L1) / Sl, 2) + Math.pow((C2 - C1) / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * ((C2 - C1) / Sc) * (dH / Sh));
}
// How far apart the colours of a list are: the largest difference between any two.
function spread(colours) {
  let d = 0;
  for (let i = 0; i < colours.length; i++) for (let j = i + 1; j < colours.length; j++) d = Math.max(d, dE(colours[i], colours[j]));
  return d;
}

// ── transforms ──────────────────────────────────────────────────────────
const IDENT = [1, 0, 0, 1, 0, 0];
function mul(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function transform(s) {
  let M = IDENT.slice();
  if (!s) return M;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(s))) {
    const v = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let T;
    if (m[1] === 'matrix') T = v;
    else if (m[1] === 'translate') T = [1, 0, 0, 1, v[0], v[1] || 0];
    else if (m[1] === 'scale') T = [v[0], 0, 0, v[1] === undefined ? v[0] : v[1], 0, 0];
    else if (m[1] === 'rotate') {
      const a = v[0] * Math.PI / 180, c = Math.cos(a), s2 = Math.sin(a);
      T = [c, s2, -s2, c, 0, 0];
      if (v.length > 2) T = mul(mul([1, 0, 0, 1, v[1], v[2]], T), [1, 0, 0, 1, -v[1], -v[2]]);
    } else if (m[1] === 'skewX') T = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0];
    else T = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0];
    M = mul(M, T);
  }
  return M;
}
const apply = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];

// ── path data to polygons ───────────────────────────────────────────────
function pathPolys(d) {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const polys = [];
  let i = 0, cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = '', lcx = 0, lcy = 0, lq = null;
  const num = () => parseFloat(toks[i++]);
  const N = 12;
  const cubic = (x0, y0, x1, y1, x2, y2, x3, y3) => {
    for (let k = 1; k <= N; k++) {
      const t = k / N, u = 1 - t;
      cur.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
    }
  };
  const quad = (x0, y0, x1, y1, x2, y2) => {
    for (let k = 1; k <= N; k++) {
      const t = k / N, u = 1 - t;
      cur.push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]);
    }
  };
  const arc = (x1, y1, rx, ry, phi, fa, fs2, x2, y2) => {
    if (rx === 0 || ry === 0) { cur.push([x2, y2]); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const p = phi * Math.PI / 180, c = Math.cos(p), s = Math.sin(p);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
    const L = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
    if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
    const n2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, n2 / den));
    if (fa === fs2) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs2 && dt > 0) dt -= 2 * Math.PI; else if (fs2 && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
    for (let k = 1; k <= n; k++) {
      const t = t1 + dt * k / n;
      cur.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]);
    }
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0);
      x = nx; y = ny; sx = x; sy = y; cur = [[x, y]]; polys.push(cur); cmd = rel ? 'l' : 'L'; lq = null; lcx = x; lcy = y;
      continue;
    }
    if (!cur) { cur = [[x, y]]; polys.push(cur); }
    if (C === 'Z') { x = sx; y = sy; cur = null; lq = null; lcx = x; lcy = y; continue; }
    if (C === 'L') { const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0); x = nx; y = ny; cur.push([x, y]); lcx = x; lcy = y; lq = null; }
    else if (C === 'H') { x = num() + (rel ? x : 0); cur.push([x, y]); lcx = x; lcy = y; lq = null; }
    else if (C === 'V') { y = num() + (rel ? y : 0); cur.push([x, y]); lcx = x; lcy = y; lq = null; }
    else if (C === 'C') {
      const a = num() + (rel ? x : 0), b = num() + (rel ? y : 0), c2 = num() + (rel ? x : 0), d2 = num() + (rel ? y : 0),
        e = num() + (rel ? x : 0), f = num() + (rel ? y : 0);
      cubic(x, y, a, b, c2, d2, e, f); lcx = c2; lcy = d2; x = e; y = f; lq = null;
    } else if (C === 'S') {
      const c2 = num() + (rel ? x : 0), d2 = num() + (rel ? y : 0), e = num() + (rel ? x : 0), f = num() + (rel ? y : 0);
      cubic(x, y, 2 * x - lcx, 2 * y - lcy, c2, d2, e, f); lcx = c2; lcy = d2; x = e; y = f; lq = null;
    } else if (C === 'Q') {
      const a = num() + (rel ? x : 0), b = num() + (rel ? y : 0), e = num() + (rel ? x : 0), f = num() + (rel ? y : 0);
      quad(x, y, a, b, e, f); lq = [a, b]; x = e; y = f; lcx = x; lcy = y;
    } else if (C === 'T') {
      const e = num() + (rel ? x : 0), f = num() + (rel ? y : 0);
      const q = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
      quad(x, y, q[0], q[1], e, f); lq = q; x = e; y = f; lcx = x; lcy = y;
    } else if (C === 'A') {
      const rx = num(), ry = num(), ph = num();
      let fa = toks[i], fs2;
      if (/^[01]{2,}/.test(fa) && fa.length > 1) {   // flags written together, as in 01
        i++; fs2 = +fa[1]; const rest = fa.slice(2); fa = +fa[0];
        if (rest) toks.splice(i, 0, rest);
      } else { fa = +num(); fs2 = num(); }
      const e = num() + (rel ? x : 0), f = num() + (rel ? y : 0);
      arc(x, y, rx, ry, ph, !!fa, !!fs2, e, f); x = e; y = f; lcx = x; lcy = y; lq = null;
    } else { i++; }
  }
  return polys;
}
function shapePolys(name, tag) {
  const g = (k) => parseFloat(attr(tag, k) || '0');
  if (name === 'path') return pathPolys(attr(tag, 'd') || '');
  if (name === 'rect') { const x = g('x'), y = g('y'), w = g('width'), h = g('height'); return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]]; }
  if (name === 'circle' || name === 'ellipse') {
    const cx = g('cx'), cy = g('cy'), rx = name === 'circle' ? g('r') : g('rx'), ry = name === 'circle' ? g('r') : g('ry');
    const p = [];
    for (let k = 0; k < 64; k++) { const a = k / 64 * 2 * Math.PI; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return [p];
  }
  if (name === 'polygon' || name === 'polyline') {
    const v = (attr(tag, 'points') || '').split(/[\s,]+/).filter(Boolean).map(Number);
    const p = [];
    for (let k = 0; k + 1 < v.length; k += 2) p.push([v[k], v[k + 1]]);
    return [p];
  }
  return [];
}
function inside(shape, x, y) {
  let w = 0, cross = 0;
  for (const p of shape.polys) {
    for (let k = 0; k < p.length; k++) {
      const a = p[k], b = p[(k + 1) % p.length];
      const side = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
      if (a[1] <= y) { if (b[1] > y && side > 0) w++; } else if (b[1] <= y && side < 0) w--;
      if ((a[1] > y) !== (b[1] > y) && a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]) > x) cross++;
    }
  }
  return shape.rule === 'evenodd' ? cross % 2 === 1 : w !== 0;
}

// ── the drawing as painted shapes, in document order ────────────────────
function build(txt) {
  const classFill = {};
  const styles = [...txt.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1].replace(/<!\[CDATA\[|\]\]>/g, '')).join('\n');
  for (const r of styles.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const f = (r[2].match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i) || [])[1];
    const fr = (r[2].match(/fill-rule\s*:\s*([^;]+)/i) || [])[1];
    const op = (r[2].match(/(?:^|;)\s*(?:fill-)?opacity\s*:\s*([^;]+)/i) || [])[1];
    for (const sel of r[1].split(',')) {
      const s = sel.trim();
      if (!/^\.[\w-]+$/.test(s)) continue;
      classFill[s.slice(1)] = Object.assign(classFill[s.slice(1)] || {}, f !== undefined ? { fill: colour(f) } : {}, fr ? { rule: fr.trim() } : {}, op ? { op: +op } : {});
    }
  }
  const grads = {};
  for (const g of txt.matchAll(/<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const id = attr('<x ' + g[2] + '>', 'id');
    const stops = [...g[3].matchAll(/<stop\b[^>]*>/gi)].map((s) => {
      const c = colour(attr(s[0], 'stop-color') || styleProp(s[0], 'stop-color')) || '#000000';
      const o = attr(s[0], 'stop-opacity') || styleProp(s[0], 'stop-opacity');
      return (o !== undefined && +o < 0.35) ? null : c;
    });
    if (id) grads[id] = stops;
  }
  for (const g of txt.matchAll(/<(linearGradient|radialGradient)\b([^>]*?)\/>/gi)) {
    const id = attr('<x ' + g[2] + '>', 'id');
    const h = (attr('<x ' + g[2] + '>', 'xlink:href') || attr('<x ' + g[2] + '>', 'href') || '').replace('#', '');
    if (id && grads[h]) grads[id] = grads[h];
  }
  const body = txt.replace(/<defs[\s\S]*?<\/defs>/gi, '')
    .replace(/<(clipPath|mask|symbol|linearGradient|radialGradient|pattern|filter|style|title|desc|metadata)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const svgTag = (body.match(/<svg\b[^>]*>/i) || [''])[0];
  const vb = (attr(svgTag, 'viewBox') || '').split(/[\s,]+/).filter(Boolean).map(Number);
  const shapes = [];
  const stack = [{ M: IDENT.slice(), fill: colour(styleProp(svgTag, 'fill') || attr(svgTag, 'fill')), rule: styleProp(svgTag, 'fill-rule') || attr(svgTag, 'fill-rule'), op: 1 }];
  let sawRoot = false;
  for (const t of body.matchAll(/<\/?([a-zA-Z][\w:-]*)\b[^>]*?\/?>/g)) {
    const tag = t[0], name = t[1].toLowerCase();
    if (tag.startsWith('</')) { if ((name === 'g' || name === 'a' || name === 'svg') && stack.length > 1) stack.pop(); continue; }
    const top = stack[stack.length - 1];
    if (name === 'svg') {
      if (!sawRoot) { sawRoot = true; continue; }
      // a drawing set inside the tile: its own box and viewBox, fitted and centred (xMidYMid meet)
      if (tag.endsWith('/>')) continue;
      const num = (k, d) => { const v = parseFloat(attr(tag, k)); return Number.isFinite(v) ? v : d; };
      const x = num('x', 0), y = num('y', 0), w = num('width', vb[2] || 0), h = num('height', vb[3] || 0);
      const b = (attr(tag, 'viewBox') || '').split(/[\s,]+/).filter(Boolean).map(Number);
      let M = [1, 0, 0, 1, x, y];
      if (b.length === 4 && b[2] > 0 && b[3] > 0) {
        const none = /none/i.test(attr(tag, 'preserveAspectRatio') || '');
        const s = Math.min(w / b[2], h / b[3]), sx = none ? w / b[2] : s, sy = none ? h / b[3] : s;
        M = [sx, 0, 0, sy, x + (w - b[2] * sx) / 2 - b[0] * sx, y + (h - b[3] * sy) / 2 - b[1] * sy];
      }
      const f = colour(styleProp(tag, 'fill') || attr(tag, 'fill'));
      stack.push({ M: mul(top.M, M), fill: f !== undefined ? f : top.fill, rule: top.rule, op: top.op });
      continue;
    }
    const cls = attr(tag, 'class');
    const cf = {};
    if (cls) for (const c of cls.split(/\s+/)) if (classFill[c]) Object.assign(cf, classFill[c]);
    let own = colour(styleProp(tag, 'fill'));
    if (own === undefined) own = colour(attr(tag, 'fill'));
    if (own === undefined && cf.fill !== undefined) own = cf.fill;
    const rule = styleProp(tag, 'fill-rule') || attr(tag, 'fill-rule') || cf.rule;
    let op = attr(tag, 'opacity') || styleProp(tag, 'opacity') || attr(tag, 'fill-opacity') || styleProp(tag, 'fill-opacity');
    op = op !== undefined ? +op : (cf.op !== undefined ? cf.op : 1);
    const M = mul(top.M, transform(attr(tag, 'transform')));
    const st = { M, fill: own !== undefined ? own : top.fill, rule: rule || top.rule, op: op * top.op };
    if (name === 'g' || name === 'a') { if (!tag.endsWith('/>')) stack.push(st); continue; }
    if (!/^(path|rect|circle|ellipse|polygon|polyline)$/.test(name)) continue;
    let fill = st.fill;
    if (fill === undefined) fill = '#000000';
    if (fill === null) continue;
    // A gradient is read as its middle stop, and marked as a ramp when its opaque stops are
    // not one colour: a rim that lands on a ramp has no single ground.
    let ramp = false;
    if (typeof fill === 'string' && fill.startsWith('url:')) {
      const s = grads[fill.slice(4)];
      fill = s ? s[Math.floor(s.length / 2)] : '#808080';
      if (fill === null) continue;
      ramp = !s || spread(s.filter(Boolean)) >= RAMP_DE;
    }
    if (st.op < 0.35) continue;
    shapes.push({ fill, ramp, rule: (st.rule || 'nonzero').trim(), polys: shapePolys(name, tag).map((p) => p.map((q) => apply(M, q))) });
  }
  return { shapes, vb };
}
// The shape painted on top at a point, or null where the drawing is clear.
function shapeAt(model, x, y) {
  let hit = null;
  for (const s of model.shapes) if (inside(s, x, y)) hit = s;
  return hit;
}
function colourAt(model, x, y) {
  const s = shapeAt(model, x, y);
  return s ? s.fill : null;
}

// The colour painted round the rim of the circle the orb crops a tile to,
// or null when the rim is not one opaque colour.
function rimGround(txt) {
  const m = build(txt);
  if (m.vb.length !== 4 || !(m.vb[2] > 0) || !(m.vb[3] > 0)) return null;
  const [vx, vy, vw, vh] = m.vb;
  const cx = vx + vw / 2, cy = vy + vh / 2, R = Math.min(vw, vh) / 2;
  let ground = null;
  for (const [rf, share] of RINGS) {
    const seen = {};
    for (let k = 0; k < RIM_SAMPLES; k++) {
      const a = k / RIM_SAMPLES * 2 * Math.PI;
      const s = shapeAt(m, cx + Math.cos(a) * R * rf, cy + Math.sin(a) * R * rf);
      if (!s) continue;
      // a sample on a ramp is counted as a ramp, never as the middle stop it was read as: where the
      // ramp is what the rim is painted in, the tile has no single ground (the last line refuses it)
      const key = s.ramp ? 'ramp' : s.fill;
      seen[key] = (seen[key] || 0) + 1;
    }
    const top = Object.entries(seen).sort((p, q) => q[1] - p[1])[0];
    if (!top || top[1] / RIM_SAMPLES < share) return null;
    if (ground && ground !== top[0]) return null;
    ground = top[0];
  }
  return /^#[0-9A-F]{6}$/.test(ground || '') ? ground : null;
}

function tileGrounds() {
  const out = {};
  for (const f of fs.readdirSync(TILES).sort()) {
    if (!/\.svg$/i.test(f)) continue;
    let g = null;
    try { g = rimGround(fs.readFileSync(path.join(TILES, f), 'utf8')); } catch (e) { g = null; }
    if (g) out[f.replace(/\.svg$/i, '')] = g;
  }
  return out;
}

// The code a placeholder tile letters: a tile whose only words are one svg text holding two or
// three capitals or digits (PSC.svg prints BQ, NAX.svg prints DY), or '' for a drawn tile.
function lettersOf(txt) {
  const texts = [...txt.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((m) => m[1].replace(/<[^>]*>/g, '').trim());
  return (texts.length === 1 && /^[A-Z0-9]{2,3}$/.test(texts[0])) ? texts[0] : '';
}
function tileLetters() {
  const out = {};
  for (const f of fs.readdirSync(TILES).sort()) {
    if (!/\.svg$/i.test(f)) continue;
    let l = '';
    try { l = lettersOf(fs.readFileSync(path.join(TILES, f), 'utf8')); } catch (e) { l = ''; }
    if (l) out[f.replace(/\.svg$/i, '')] = l;
  }
  return out;
}

function rows(table) {
  const keys = Object.keys(table).sort();
  const out = [];
  for (let i = 0; i < keys.length; i += 6) {
    out.push('  ' + keys.slice(i, i + 6).map((k) => "'" + k + "':'" + table[k] + "'").join(', ') + (i + 6 < keys.length ? ',' : ''));
  }
  return out.join('\n');
}
function render(table, letters) {
  return BEGIN + '\nwindow._ORB_TILE_GROUNDS = {\n' + rows(table) + '\n};\n'
    + '// The tiles that are a flat square with a code set as text, and the code each one letters.\n'
    + 'window._ORB_TILE_LETTERS = {\n' + rows(letters || {}) + '\n};\n' + END;
}

function readBlock(core) {
  const a = core.indexOf(BEGIN), b = core.indexOf(END);
  if (a < 0 || b < a) return null;
  return { a, b: b + END.length, text: core.slice(a, b + END.length) };
}

module.exports = { tileGrounds, tileLetters, lettersOf, rimGround, build, colourAt, shapeAt, dE, spread, render, readBlock, BEGIN, END, CORE, TILES };

if (require.main === module) {
  const core = fs.readFileSync(CORE, 'utf8');
  const blk = readBlock(core);
  if (!blk) { console.error('markers not found in fids-core.js'); process.exit(2); }
  const want = render(tileGrounds(), tileLetters());
  if (process.argv.includes('--check')) {
    if (blk.text !== want) { console.error('window._ORB_TILE_GROUNDS and window._ORB_TILE_LETTERS are not what the tiles on disk give: run node scripts/orbs/tile-grounds.js'); process.exit(1); }
    console.log('tile grounds: table and art agree');
  } else if (blk.text !== want) {
    fs.writeFileSync(CORE, core.slice(0, blk.a) + want + core.slice(blk.b));
    console.log('tile grounds: table rewritten');
  } else {
    console.log('tile grounds: nothing to change');
  }
}
