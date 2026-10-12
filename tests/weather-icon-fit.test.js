'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24044 — NO WEATHER ICON IS CUT BY ITS CIRCLE OR ITS OWN BOX.
//
// The rain clouds, drops, wind lines and storm clouds were cut off in their
// circles on the weather card and the stream. scripts/wx-icons/build.py had
// trimmed every number in a glyph to two decimals — the transforms that
// scale the pack's artwork too (0.2286 → 0.22, 0.375 → 0.37) — so each glyph
// was drawn a few per cent small, toward its sheet's corner, and slid up and
// left out of the box measured for it; the nested viewBox and the mask
// region cut what fell outside. Glyphs far from the sheet's corner moved the
// most: wind lost 17 % of its art, the storm clouds 12 %, hail 11 %.
//
// build.py now frames each glyph on its own drawn geometry. This test reads
// every file's path data the same way, through every transform, into the
// 100-unit icon, and asserts:
//   · nothing drawn falls outside the nested viewBox, the mask's region or
//     the masked fill (nothing is cut);
//   · on the circles (disc-day, disc-night, solid-in-disc) nothing reaches
//     past the safe circle, radius 46 of the disc's 50;
//   · every icon in a set is drawn the same size (its art's longest side)
//     and centred, unless its reach was what limited it.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WX = path.join(ROOT, 'fids-current/logos/weather');
const R_SAFE = 46;
const PAD = 0.06;
// the share of the 100-unit icon each set gives its glyph (build.py)
const SETS = { 'disc-day': 76, 'disc-night': 80, 'solid-in-disc': 80, solid: 78 };
const DISCS = ['disc-day', 'disc-night', 'solid-in-disc'];
const CONDITIONS = ['clear-day', 'clear-night', 'cloudy', 'drizzle', 'extreme-rain', 'extreme-snow', 'fog', 'hail', 'mist',
  'overcast-day', 'overcast-night', 'overcast', 'partly-cloudy-day', 'partly-cloudy-night', 'rain', 'sleet', 'snow',
  'thunderstorms-day-rain', 'thunderstorms-night-rain', 'thunderstorms-rain', 'thunderstorms', 'wind-cloud', 'wind'];

// ── path data → segments (the packs use M L H V C S Z, absolute and relative)
function segments(d) {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = null, cur = [0, 0], start = [0, 0], prevC2 = null;
  const num = () => +toks[i++];
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) {
      cmd = toks[i++];
      if (/[Zz]/.test(cmd)) { out.push(['L', cur, start]); cur = start; prevC2 = null; continue; }
    }
    const rel = cmd === cmd.toLowerCase();
    const [ox, oy] = rel ? cur : [0, 0];
    switch (cmd.toUpperCase()) {
      case 'M': cur = start = [ox + num(), oy + num()]; prevC2 = null; cmd = rel ? 'l' : 'L'; break;
      case 'L': { const p = [ox + num(), oy + num()]; out.push(['L', cur, p]); cur = p; prevC2 = null; break; }
      case 'H': { const p = [(rel ? cur[0] : 0) + num(), cur[1]]; out.push(['L', cur, p]); cur = p; prevC2 = null; break; }
      case 'V': { const p = [cur[0], (rel ? cur[1] : 0) + num()]; out.push(['L', cur, p]); cur = p; prevC2 = null; break; }
      case 'C': { const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()];
        out.push(['C', cur, p1, p2, p3]); cur = p3; prevC2 = p2; break; }
      case 'S': { const p1 = prevC2 ? [2 * cur[0] - prevC2[0], 2 * cur[1] - prevC2[1]] : cur;
        const p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()];
        out.push(['C', cur, p1, p2, p3]); cur = p3; prevC2 = p2; break; }
      default: throw new Error('path command ' + cmd + ' is not one this test reads — teach it before shipping the icon');
    }
  }
  return out;
}
const bez = (p, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };
function turns(a, b, c, d) {
  const qa = -a + 3 * b - 3 * c + d, qb = 2 * (a - 2 * b + c), qc = b - a;
  if (Math.abs(qa) < 1e-12) return Math.abs(qb) > 1e-12 ? [-qc / qb].filter((t) => t > 0 && t < 1) : [];
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return [];
  const r = Math.sqrt(disc);
  return [(-qb + r) / (2 * qa), (-qb - r) / (2 * qa)].filter((t) => t > 0 && t < 1);
}

// ── one icon file → its drawn art in the 100-unit icon
const num = (s, k) => +(new RegExp('\\b' + k + '="([-\\d.]+)"').exec(s) || [])[1];
function measure(file) {
  const svg = fs.readFileSync(file, 'utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/, file);
  const nested = [...svg.matchAll(/<svg x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" viewBox="[^"]*">/g)];
  assert.equal(nested.length, 1, file + ': one placed glyph');
  const tag = nested[0][0];
  const place = { x: num(tag, 'x'), y: num(tag, 'y'), w: num(tag, 'width'), h: num(tag, 'height') };
  const [vx, vy, vw, vh] = /viewBox="([^"]+)"/.exec(tag)[1].split(/\s+/).map(Number);
  assert.ok(Math.abs(vw - vh) < 0.011 && Math.abs(place.w - place.h) < 0.011, file + ': a square glyph in a square place (a plain scale)');
  const k = place.w / vw;
  const toIcon = ([x, y]) => [place.x + (x - vx) * k, place.y + (y - vy) * k];
  const masks = {};
  for (const m of svg.matchAll(/<mask id="([^"]+)" maskUnits="userSpaceOnUse" (x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*")>/g)) {
    masks[m[1]] = { x: num(m[2], 'x'), y: num(m[2], 'y'), w: num(m[2], 'width'), h: num(m[2], 'height') };
  }
  const fills = [...svg.matchAll(/<rect (x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*")[^>]*mask="url\(#([^)]+)\)"/g)]
    .map((m) => ({ id: m[2], x: num(m[1], 'x'), y: num(m[1], 'y'), w: num(m[1], 'width'), h: num(m[1], 'height') }));
  let ink = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, reach = 0;
  const own = []; // [x, y] in the glyph's units, extremes only (for the box checks)
  const paths = [...svg.matchAll(/<g transform="matrix\(([^)]*)\)"><path ([^>]*?)d="([^"]*)"/g)];
  assert.equal(paths.length, (svg.match(/<path /g) || []).length, file + ': every path is read');
  for (const m of paths) {
    const [a, b, c, d, e, f] = m[1].split(',').map(Number);
    if (/fill="#000"/.test(m[2])) continue;              // the mask's black paper
    ink++;
    const sw = +((/stroke-width="([\d.]+)"/.exec(m[2]) || [])[1] || 0);
    const grow = (sw / 2) * Math.hypot(a, b);           // half a stroke, in the glyph's units
    const T = ([x, y]) => [a * x + c * y + e, b * x + d * y + f];
    const pts = [], ext = [];
    for (const sg of segments(m[3])) {
      const q = sg.slice(1).map(T);
      ext.push(q[0], q[q.length - 1]);
      if (sg[0] === 'C') {
        for (const kk of [0, 1]) for (const t of turns(q[0][kk], q[1][kk], q[2][kk], q[3][kk])) ext.push(bez(q, t));
        for (let n = 1; n < 24; n++) pts.push(bez(q, n / 24));
      }
    }
    for (const p of ext) {
      own.push([p[0] - grow, p[1] - grow], [p[0] + grow, p[1] + grow]);
      const [X, Y] = toIcon(p), g = grow * k;
      x0 = Math.min(x0, X - g); y0 = Math.min(y0, Y - g); x1 = Math.max(x1, X + g); y1 = Math.max(y1, Y + g);
    }
    for (const p of pts.concat(ext)) { const [X, Y] = toIcon(p); reach = Math.max(reach, Math.hypot(X - 50, Y - 50) + grow * k); }
  }
  assert.ok(ink > 0, file + ': draws something');
  return { svg, view: { x: vx, y: vy, w: vw, h: vh }, place, masks, fills, own, box: [x0, y0, x1, y1], reach };
}
const inside = (p, r, tol = 0.02) => p[0] >= r.x - tol && p[1] >= r.y - tol && p[0] <= r.x + r.w + tol && p[1] <= r.y + r.h + tol;

function check(set, c) {
  const file = path.join(WX, set, c + '.svg');
  const m = measure(file);
  const name = set + '/' + c;
  // nothing is cut: by the nested viewBox, the mask's region or the masked fill
  for (const p of m.own) {
    assert.ok(inside(p, m.view), name + ' is cut by its own box at ' + p.map((v) => v.toFixed(1)));
    for (const f of m.fills) {
      assert.ok(inside(p, f), name + ' is cut by its masked fill at ' + p.map((v) => v.toFixed(1)));
      assert.ok(m.masks[f.id] && inside(p, m.masks[f.id]), name + ' is cut by its mask at ' + p.map((v) => v.toFixed(1)));
    }
  }
  assert.ok(m.place.x >= 0 && m.place.y >= 0 && m.place.x + m.place.w <= 100.001 && m.place.y + m.place.h <= 100.001, name + ' is placed inside the icon');
  // on a circle, nothing reaches past the safe circle
  if (DISCS.includes(set)) assert.ok(m.reach <= R_SAFE + 0.05, name + ' reaches ' + m.reach.toFixed(2) + ' from the centre, past the safe circle (' + R_SAFE + ' of the disc\'s 50)');
  // the same size and centred, unless its reach limited it
  const [x0, y0, x1, y1] = m.box;
  const side = Math.max(x1 - x0, y1 - y0), want = SETS[set] / (1 + 2 * PAD);
  const limited = Math.abs(m.reach - R_SAFE) < 0.3 && side < want;
  if (!limited) assert.ok(Math.abs(side - want) < 0.6, name + ' is drawn ' + side.toFixed(1) + ' across, the set draws ' + want.toFixed(1));
  assert.ok(Math.abs((x0 + x1) / 2 - 50) < 0.5 && Math.abs((y0 + y1) / 2 - 50) < 0.5, name + ' is centred (' + ((x0 + x1) / 2).toFixed(1) + ', ' + ((y0 + y1) / 2).toFixed(1) + ')');
  return m;
}

test('no icon on a circle is cut, and none reaches past the safe circle', () => {
  for (const set of DISCS) for (const c of CONDITIONS) check(set, c);
});

test('the rows\' glyphs (no circle) are not cut by their own box either', () => {
  for (const c of CONDITIONS) check('solid', c);
});

test('every file in the four sets is one this test measured', () => {
  for (const set of Object.keys(SETS)) {
    const files = fs.readdirSync(path.join(WX, set)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
    assert.deepEqual(files, [...CONDITIONS].sort(), set + ' holds exactly the conditions measured here');
  }
});

test('the measure catches a cut: the v24043 rain, its transform trimmed to two decimals', () => {
  // the shipped glyph as it was: the art drawn at 0.22 where its box was
  // measured at 0.2286 — the cloud's left edge and the drops fell outside
  const now = fs.readFileSync(path.join(WX, 'disc-day', 'rain.svg'), 'utf8');
  const broken = now.replace(/matrix\(0\.2286,0,0,0\.2286,0,50\)/g, 'matrix(0.22,0,0,0.22,0,50)');
  assert.notEqual(broken, now, 'the rain glyph is the solid pack\'s, scaled 0.2286');
  const tmp = path.join(require('node:os').tmpdir(), 'wx-fit-' + process.pid + '.svg');
  fs.writeFileSync(tmp, broken);
  try {
    const m = measure(tmp);
    assert.ok(m.own.some((p) => !inside(p, m.view)), 'the trimmed glyph leaves its own box');
  } finally { fs.unlinkSync(tmp); }
});

test('build.py keeps the transforms whole and frames each glyph on its own geometry', () => {
  const py = fs.readFileSync(path.join(ROOT, 'scripts/wx-icons/build.py'), 'utf8');
  assert.doesNotMatch(py, /inner = re\.sub\(r'\(\\d\+\\\.\\d\{2\}\)\\d\+', r'\\1', inner\)/, 'no trim over the whole glyph');
  assert.match(py, /re\.sub\(r'\\bd="\(\[\^"\]\*\)"'/, 'the trim reaches the path data only');
  assert.match(py, /R_SAFE = 46\.0/);
  assert.match(py, /def art\(inner, bold\):/);
});
