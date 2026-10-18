'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24053 — THE NIGHT ICONS DRAWN FOR ORION CONNECTED.
//
// At night, wherever the look draws its weather icons in a circle (Day &
// night after dark and Solid at night), the icons are the set drawn for
// Orion Connected, one file per condition in logos/weather/night-line/
// (scripts/wx-icons/night-line.py). The weather card draws them; the gate's
// circle look is wired the same way (no element of today's gate layout
// shows it). The files carry no circle; each file's frame IS the circle the
// icon was drawn on, and the boards draw their circle on that frame
// (_WX_NIGHT_ICON = 100), so every icon is as large and where it was drawn.
// The circle's colour is one choice, _WX_NIGHT_DISC: 'airline' (B, the
// default), a dark tint of the airline's night ground; 'charcoal' (A), the
// charcoal circle the icons were drawn on.
//
// This test pins:
//   · every condition MET can send, read at night, to the icon it draws, and
//     that icon to an existing file in night-line/ (and every other name the
//     boards can ask for at night, Tomorrow.io's and the gate's, to a file);
//   · each file's frame to the circle its icon was drawn on (its size and its
//     place on the sheet), so nothing is scaled or re-centred;
//   · nothing is cut: every shape, its edge stroke and the miters at its
//     corners, inside the file's own frame, and as drawn inside 92 % of the
//     radius of the circle to 0.06 % (the moon's tip in partly cloudy night);
//   · the two circles, the card's and the gate's wiring (the gate drawing a
//     code's night form), and that the day look is untouched.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = rd('fids-current/js/fids-core.js');
const V2 = rd('fids-current/js/fids-v2.js');
const CSS = rd('fids-current/css/display-overrides.css');
const WORKER = rd('worker-entry.js');
const COLORS_SRC = rd('fids-current/data/airline-colors.js');
const DIR = path.join(ROOT, 'fids-current/logos/weather/night-line');

function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) break;
  }
  return src.slice(i, j + 1);
}
function table(name) {
  const i = CORE.indexOf('const ' + name + ' = {');
  assert.ok(i >= 0, name + ' must exist');
  return vm.runInNewContext('(' + CORE.slice(CORE.indexOf('{', i), CORE.indexOf('\n};', i) + 2) + ')');
}

// ── the board's own code, run as written ──────────────────────────────────
// the icon a weather code draws (fids-core.js) and MET's symbol → WMO (the worker)
const ICON = vm.runInNewContext(fnSource(CORE, '_wmoAnimIcon') + '\n' + fnSource(CORE, '_wxAnimIcon') + '\n({ _wxAnimIcon, _wmoAnimIcon });');
const MET = (() => {
  const a = WORKER.indexOf('    const MET_WMO = {');
  const b = WORKER.indexOf('    };\n', WORKER.indexOf('const metWmo = (sym) => {', a)) + 7;
  assert.ok(a > 0 && b > a, "the worker's MET table and its reader");
  return vm.runInNewContext(WORKER.slice(a, b) + '\n({ MET_WMO, metWmo });');
})();
// the airline's look and the two circles (fids-core.js, _WX_LOOK … _wxWhiteStill)
const RC2_SRC = (() => { const a = CORE.indexOf('var RC2_STATUS = {'); const f = fnSource(CORE, '_rc2Pair'); return CORE.slice(a, CORE.indexOf(f, a) + f.length); })();
const LOOK_SRC = (() => { const a = CORE.indexOf('var _WX_LOOK = {'); const f = fnSource(CORE, '_wxWhiteStill'); return CORE.slice(a, CORE.indexOf(f, a) + f.length); })();
function lookWith(choice) {
  const sb = { window: {} };
  vm.runInNewContext(COLORS_SRC, sb);
  sb.AIRLINE_ACCENT = table('AIRLINE_ACCENT');
  sb.AIRLINE_BRAND = table('AIRLINE_BRAND');
  sb.AIRLINE_BRAND_COLORS = sb.window.AIRLINE_BRAND_COLORS;
  const src = choice ? LOOK_SRC.replace("var _WX_NIGHT_DISC = 'airline';", "var _WX_NIGHT_DISC = '" + choice + "';") : LOOK_SRC;
  return vm.runInNewContext(RC2_SRC + '\n' + src + '\n({ RC2_PAIRS, _rc2Rgb, _wxAirlineLook, _wxMix, _wxOklab, _wxNightDisc, _wxNightDiscTint, _wxNightLineDisc, _WX_LOOK, _WX_TINT,'
    + ' _WX_NIGHT_DISC, _WX_NIGHT_DIR, _WX_NIGHT_CHARCOAL, _WX_NIGHT_ICON, _WX_NIGHT_C, _WX_NIGHT_STEP, _WX_NIGHT_INKS, _WX_DISC_KEEP });', sb);
}
const L = lookWith();
const okDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const okLch = (h) => { const o = L._wxOklab(L._rc2Rgb(h)); return { L: o[0], C: Math.hypot(o[1], o[2]), h: (Math.atan2(o[2], o[1]) * 180 / Math.PI + 360) % 360 }; };

// ── every symbol MET sends: 41, 21 of them with _day / _night / _polartwilight
const MET_BASES = ['clearsky', 'cloudy', 'fair', 'fog', 'heavyrain', 'heavyrainandthunder', 'heavyrainshowers', 'heavyrainshowersandthunder',
  'heavysleet', 'heavysleetandthunder', 'heavysleetshowers', 'heavysleetshowersandthunder', 'heavysnow', 'heavysnowandthunder', 'heavysnowshowers',
  'heavysnowshowersandthunder', 'lightrain', 'lightrainandthunder', 'lightrainshowers', 'lightrainshowersandthunder', 'lightsleet',
  'lightsleetandthunder', 'lightsleetshowers', 'lightsnow', 'lightsnowandthunder', 'lightsnowshowers', 'lightssleetshowersandthunder',
  'lightssnowshowersandthunder', 'partlycloudy', 'rain', 'rainandthunder', 'rainshowers', 'rainshowersandthunder', 'sleet', 'sleetandthunder',
  'sleetshowers', 'sleetshowersandthunder', 'snow', 'snowandthunder', 'snowshowers', 'snowshowersandthunder'];
const MET_SUFFIXED = ['clearsky', 'fair', 'partlycloudy', 'heavyrainshowers', 'heavyrainshowersandthunder', 'heavysleetshowers',
  'heavysleetshowersandthunder', 'heavysnowshowers', 'heavysnowshowersandthunder', 'lightrainshowers', 'lightrainshowersandthunder',
  'lightsleetshowers', 'lightsnowshowers', 'lightssleetshowersandthunder', 'lightssnowshowersandthunder', 'rainshowers',
  'rainshowersandthunder', 'sleetshowers', 'sleetshowersandthunder', 'snowshowers', 'snowshowersandthunder'];
const MET_SYMBOLS = MET_BASES.flatMap((b) => (MET_SUFFIXED.includes(b) ? ['_day', '_night', '_polartwilight'].map((s) => b + s) : [b]));

// at night: the file each MET symbol draws. The server folds MET onto WMO
// codes (fair is clear sky's 1, every thunder is 95, sleet showers are snow
// showers), and the card picks the icon from the code.
const NIGHT_FILE = {
  clearsky: 'clear-night', fair: 'clear-night', partlycloudy: 'partly-cloudy-night', cloudy: 'overcast', fog: 'fog',
  lightrain: 'rain', rain: 'rain', heavyrain: 'extreme-rain', lightrainshowers: 'rain', rainshowers: 'rain', heavyrainshowers: 'extreme-rain',
  lightsnow: 'snow', snow: 'snow', heavysnow: 'extreme-snow', lightsnowshowers: 'snow', snowshowers: 'snow', heavysnowshowers: 'extreme-snow',
  lightsleet: 'sleet', sleet: 'sleet', heavysleet: 'sleet', lightsleetshowers: 'snow', sleetshowers: 'snow', heavysleetshowers: 'extreme-snow'
};
// and which of the 20 drawn icons each file is (the copies carry their
// drawing's path data under their own ids)
const DRAWN = {
  'clear-night': 'clear-night', 'partly-cloudy-night': 'partly-cloudy-night', overcast: 'overcast', fog: 'fog', rain: 'rain',
  'extreme-rain': 'rain', sleet: 'rain', drizzle: 'rain', snow: 'snow', 'extreme-snow': 'snow', hail: 'snow', mist: 'fog',
  'overcast-day': 'overcast', 'overcast-night': 'overcast', 'thunderstorms-rain': 'thunderstorms-rain',
  'thunderstorms-day-rain': 'thunderstorms-rain', 'thunderstorms-night-rain': 'thunderstorms-rain', 'wind-cloud': 'wind', wind: 'wind',
  cloudy: 'cloudy', thunderstorms: 'thunderstorms', 'clear-day': 'clear-day', 'partly-cloudy-day': 'partly-cloudy-day'
};
const ICONS20 = ['clear-day', 'partly-cloudy-day', 'sunrise', 'cloudy', 'overcast', 'clear-night', 'partly-cloudy-night', 'rain', 'lightning-bolt',
  'thunderstorms', 'snowflake', 'snow', 'fog', 'wind', 'thunderstorms-rain', 'thermometer-colder', 'partly-cloudy-day-snow', 'umbrella', 'tornado',
  'thermometer-warmer'];
const has = (name) => fs.existsSync(path.join(DIR, name + '.svg'));
const pathData = (name) => [...fs.readFileSync(path.join(DIR, name + '.svg'), 'utf8').replace(/<defs>[\s\S]*?<\/defs>/, '').matchAll(/<path [^>]*?\bd="([^"]+)"/g)].map((m) => m[1]);

test('every symbol MET sends, read at night, draws its pinned icon from an existing night-line file', () => {
  assert.equal(MET_SYMBOLS.length, 83, "MET's 83 symbol strings");
  for (const sym of MET_SYMBOLS) {
    const base = sym.replace(/_(day|night|polartwilight)$/, '');
    const wmo = MET.metWmo(sym);
    assert.equal(typeof wmo, 'number', sym + ' is a code the server knows');
    const name = ICON._wxAnimIcon(wmo, true);
    const want = /andthunder$/.test(base) ? 'thunderstorms-rain' : NIGHT_FILE[base];
    assert.ok(want, sym + ' is pinned here');
    assert.equal(name, want, sym + ' (WMO ' + wmo + ') at night');
    assert.ok(has(name), 'night-line/' + name + '.svg exists for ' + sym);
  }
  // the picture each one is
  for (const [file, drawing] of Object.entries(DRAWN)) {
    assert.ok(has(file) && has(drawing), file);
    assert.deepEqual(pathData(file), pathData(drawing), file + ' is drawn as ' + drawing);
  }
});

// ── each file's frame is the circle its icon was drawn on ────────────────
// The sheet's circles are 350 units across (measured along the curve:
// 349.995 wide, 349.017 tall); each frame is that square, centred where its
// circle is centred, read from the sheet by night-line.py. Pinned, so a
// rebuild cannot shrink or re-centre an icon (an earlier cut drew every icon
// at 92.2 % of its size, re-centred on its own extent: wind moved 22 units
// up and left of where it was drawn).
const DRAWN_FRAME = {
  'clear-day': '0 18.67 350 350', 'partly-cloudy-day': '428.5 15.35 350 350', sunrise: '857.94 3.99 350 350',
  cloudy: '1280.49 -0.5 350 350', overcast: '1706 8.32 350 350',
  'clear-night': '0 439.48 350 350', 'partly-cloudy-night': '428.5 436.16 350 350', rain: '857.94 424.79 350 350',
  'lightning-bolt': '1280.49 420.31 350 350', thunderstorms: '1706 429.13 350 350',
  snowflake: '0.63 841.39 350 350', snow: '436.86 842.4 350 350', fog: '870.76 842.4 350 350',
  wind: '1306.94 858.39 350 350', 'thunderstorms-rain': '1709.5 842.4 350 350',
  'thermometer-colder': '3.5 1290.25 350 350', 'partly-cloudy-day-snow': '432 1286.93 350 350', umbrella: '861.44 1275.56 350 350',
  tornado: '1283.99 1271.08 350 350', 'thermometer-warmer': '1709.5 1279.89 350 350'
};
const frameOf = (name) => /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([^"]+)">/.exec(fs.readFileSync(path.join(DIR, name + '.svg'), 'utf8'))[1];

test('each file\'s frame is the circle its icon was drawn on: as large, and where it was drawn', () => {
  assert.deepEqual(Object.keys(DRAWN_FRAME).sort(), [...ICONS20].sort());
  for (const [name, view] of Object.entries(DRAWN_FRAME)) assert.equal(frameOf(name), view, name);
  // the copies are their drawing, frame and all
  for (const [file, drawing] of Object.entries(DRAWN)) assert.equal(frameOf(file), frameOf(drawing), file + ' is framed as ' + drawing);
  // and the boards draw their circle on the whole frame: nothing scaled
  assert.equal(L._WX_NIGHT_ICON, 100);
});

test('every other name the boards can ask for at night has a night-line file', () => {
  // every WMO code 0-99 and every Tomorrow.io code, read at night (the plates and the hours)
  const TIO_ICON = table('TIO_ICON');
  const codes = new Set([...Array(100).keys(), ...Object.keys(TIO_ICON).map(Number)]);
  for (const c of codes) assert.ok(has(ICON._wxAnimIcon(c, true)), 'code ' + c + ' at night: ' + ICON._wxAnimIcon(c, true));
  // the day forecasts, which keep their daytime icons when the board is at night
  for (const c of codes) assert.ok(has(ICON._wmoAnimIcon(c)), 'day forecast ' + c + ': ' + ICON._wmoAnimIcon(c));
  // the gate: every name the circle look draws, and every name TIO_ICON gives it
  const names = Object.keys(vm.runInNewContext('(' + /const WX_LOOK_NAMES = (\{[^}]+\});/.exec(V2)[1] + ')'));
  assert.equal(names.length, 23);
  for (const n of names) assert.ok(has(n), 'night-line/' + n + '.svg');
  for (const n of new Set(Object.values(TIO_ICON))) if (names.includes(n)) assert.ok(has(n), n);
  // and the folder is the 20 drawings plus the copies, nothing else
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(files, [...new Set([...ICONS20, ...names])].sort());
});

// ── nothing is cut ─────────────────────────────────────────────────────────
// Each file's drawn shapes, read from their path data (the set uses
// M L H V C S Z), with the stroke: half its width all round, and at every
// corner the miter the stroke draws there (miter limit 10, so a corner up to
// 10 half-widths out; sharper ones fall back to a bevel). Clips only take
// away, so the shapes unclipped are the most any icon can draw.
function subpaths(d) {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = null, cur = [0, 0], start = [0, 0], prevC2 = null, sp = null;
  const num = () => +toks[i++];
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) {
      cmd = toks[i++];
      if (/[Zz]/.test(cmd)) { if (sp) { sp.segs.push(['L', cur, start]); sp.closed = true; } cur = start; prevC2 = null; sp = null; continue; }
    }
    const rel = cmd === cmd.toLowerCase();
    const [ox, oy] = rel ? cur : [0, 0];
    switch (cmd.toUpperCase()) {
      case 'M': cur = start = [ox + num(), oy + num()]; sp = { segs: [], closed: false }; out.push(sp); prevC2 = null; cmd = rel ? 'l' : 'L'; break;
      case 'L': { const p = [ox + num(), oy + num()]; sp.segs.push(['L', cur, p]); cur = p; prevC2 = null; break; }
      case 'H': { const p = [(rel ? cur[0] : 0) + num(), cur[1]]; sp.segs.push(['L', cur, p]); cur = p; prevC2 = null; break; }
      case 'V': { const p = [cur[0], (rel ? cur[1] : 0) + num()]; sp.segs.push(['L', cur, p]); cur = p; prevC2 = null; break; }
      case 'C': { const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()];
        sp.segs.push(['C', cur, p1, p2, p3]); cur = p3; prevC2 = p2; break; }
      case 'S': { const p1 = prevC2 ? [2 * cur[0] - prevC2[0], 2 * cur[1] - prevC2[1]] : cur;
        const p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()];
        sp.segs.push(['C', cur, p1, p2, p3]); cur = p3; prevC2 = p2; break; }
      default: throw new Error('path command ' + cmd + ' is not one this test reads — teach it before shipping the icon');
    }
  }
  return out;
}
const bez = (q, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * q[0][k] + 3 * u * u * t * q[1][k] + 3 * u * t * t * q[2][k] + t * t * t * q[3][k]); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const unit = (v) => { const l = len(v); return l > 1e-9 ? [v[0] / l, v[1] / l] : null; };
function tangents(sg) {
  if (sg[0] === 'L') { const u = unit(sub(sg[2], sg[1])); return [u, u]; }
  const [, p0, p1, p2, p3] = sg;
  return [unit(sub(p1, p0)) || unit(sub(p2, p0)) || unit(sub(p3, p0)), unit(sub(p3, p2)) || unit(sub(p3, p1)) || unit(sub(p3, p0))];
}
// the points that bound one path's geometry, in sheet units: [x, y, grow];
// sw > 0 adds the stroke (half its width all round, and the corner miters)
function pathPoints(d, sw, ml) {
  const pts = [];
  for (const sp of subpaths(d)) {
    const segs = sp.segs.filter((sg) => sg[0] === 'C' || len(sub(sg[2], sg[1])) > 1e-9);
    for (const sg of segs) {
      if (sg[0] === 'L') { pts.push([...sg[1], sw / 2], [...sg[2], sw / 2]); continue; }
      const q = sg.slice(1);
      for (let n = 0; n <= 32; n++) pts.push([...bez(q, n / 32), sw / 2]);
    }
    // the miters at the corners (an open path's ends are butt caps, inside sw/2)
    if (!sw) continue;
    const joins = [];
    for (let k = 1; k < segs.length; k++) joins.push([segs[k - 1], segs[k]]);
    if (sp.closed && segs.length > 1) joins.push([segs[segs.length - 1], segs[0]]);
    for (const [s0, s1] of joins) {
      const a = tangents(s0)[1], b = tangents(s1)[0];
      if (!a || !b) continue;
      const cosTh = -(a[0] * b[0] + a[1] * b[1]);                 // between back along the way in and on along the way out
      const th = Math.acos(Math.max(-1, Math.min(1, cosTh)));
      const ratio = 1 / Math.max(Math.sin(th / 2), 1e-9);
      if (ratio > ml) continue;                                    // too sharp: a bevel, within sw/2
      const m2 = unit(sub(a, b));
      if (!m2) continue;
      const v = s0[0] === 'L' ? s0[2] : s0[4];
      pts.push([v[0] + m2[0] * (sw / 2) * ratio, v[1] + m2[1] * (sw / 2) * ratio, 0]);
    }
  }
  return pts;
}
const attr = (s, k) => (new RegExp('\\b' + k + '="([^"]*)"').exec(s) || [])[1];
// every drawn shape of a file: its points, and the points of every clip it is
// drawn inside (what is drawn lies inside the shape AND inside each clip)
function inkPoints(file) {
  const svg = fs.readFileSync(file, 'utf8');
  const vb = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([^"]+)">/.exec(svg);
  assert.ok(vb, file + ': one plain frame');
  const [x, y, w, h] = vb[1].split(/\s+/).map(Number);
  const clips = {};
  for (const m of svg.matchAll(/<clipPath id="([^"]+)">([\s\S]*?)<\/clipPath>/g)) {
    const r = /^<rect ([^>]*)\/>$/.exec(m[2]), pa = /^<path ([^>]*)\/>$/.exec(m[2]);
    assert.ok(r || pa, file + ': clip ' + m[1] + ' is one rect or one path');
    if (r) { const [rx, ry, rw, rh] = ['x', 'y', 'width', 'height'].map((k) => +attr(r[1], k)); clips[m[1]] = [[rx, ry, 0], [rx + rw, ry, 0], [rx, ry + rh, 0], [rx + rw, ry + rh, 0]]; }
    else clips[m[1]] = pathPoints(attr(pa[1], 'd'), 0, 4);
  }
  const body = svg.slice(vb[0].length).replace(/<defs>[\s\S]*?<\/defs>/g, '');
  assert.doesNotMatch(body, /<(circle|ellipse|rect|polygon|polyline|line|image|use|text)\b/, file + ': only paths are drawn');
  const shapes = [], stack = [];
  for (const t of body.matchAll(/<(\/?)(g|path|svg)\b([^>]*?)(\/?)>/g)) {
    if (t[2] === 'svg') continue;
    if (t[2] === 'g') { if (t[1]) stack.pop(); else stack.push((/clip-path="url\(#([^)]+)\)"/.exec(t[3]) || [])[1] || null); continue; }
    const a = t[3];
    assert.doesNotMatch(a, /transform=/, file + ': no transform on a shape');
    const stroked = /\bstroke="(?!none)[^"]+"/.test(a);
    const sw = stroked ? +(attr(a, 'stroke-width') || 1) : 0;
    const ids = stack.filter(Boolean);
    for (const id of ids) assert.ok(clips[id], file + ': clip ' + id + ' is defined');
    shapes.push({ pts: pathPoints(attr(a, 'd'), sw, +(attr(a, 'stroke-miterlimit') || 4)), clips: ids.map((id) => clips[id]) });
  }
  assert.ok(shapes.length > 0, file + ': draws something');
  return { shapes, view: { x, y, w, h } };
}
// a point set's box ([x0, y0, x1, y1], grown) and its reach from (cx, cy)
function boxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, g] of pts) { x0 = Math.min(x0, x - g); y0 = Math.min(y0, y - g); x1 = Math.max(x1, x + g); y1 = Math.max(y1, y + g); }
  return [x0, y0, x1, y1];
}
const reachOf = (pts, cx, cy) => pts.reduce((r, [x, y, g]) => Math.max(r, Math.hypot(x - cx, y - cy) + g), 0);
// what each shape can draw: inside its own box and every clip's (their
// intersection), and no farther from a point than the nearest-reaching of them
function drawnBox(sh) {
  return sh.clips.map(boxOf).reduce((b, c) => [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.min(b[2], c[2]), Math.min(b[3], c[3])], boxOf(sh.pts));
}
// on the circle: the frame drawn at `share` % of a 100-unit circle, centred
function onCircle(m, share) {
  const k = share / m.view.w;
  const cx = m.view.x + m.view.w / 2, cy = m.view.y + m.view.h / 2;      // the circle's centre, in sheet units
  let reach = 0;
  for (const sh of m.shapes) reach = Math.max(reach, Math.min(reachOf(sh.pts, cx, cy), ...sh.clips.map((c) => reachOf(c, cx, cy))) * k);
  return { reach };
}
const R_SAFE = 46;   // 92 % of the circle's radius of 50, the boards' rule for every circle set
// As drawn, this set's farthest point is the moon's tip in partly cloudy
// night (its outline, not the stroke): 46.03 of the circle's 50, 92.06 %.
// That is the rule to 0.03 of 50, a thirtieth of a pixel on the card's
// 107 px circle; the set is kept as drawn rather than shrunk for it.
const R_DRAWN = 46.035;

test('nothing is cut: every shape inside its own frame, and as drawn inside 92 % of the circle to 0.06 %', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.svg'));
  let side = null, far = { reach: 0 };
  const over = [];
  for (const f of files) {
    const m = inkPoints(path.join(DIR, f));
    assert.ok(Math.abs(m.view.w - m.view.h) < 1e-6, f + ': a square frame');
    if (side === null) side = m.view.w;
    assert.equal(m.view.w, 350, f + ': the frame is the 350-unit circle it was drawn on (every line at the weight it was drawn)');
    let margin = Infinity;
    for (const sh of m.shapes) {
      const [x0, y0, x1, y1] = drawnBox(sh);
      if (x0 > x1 || y0 > y1) continue;                                    // clipped away entirely
      margin = Math.min(margin, x0 - m.view.x, y0 - m.view.y, m.view.x + m.view.w - x1, m.view.y + m.view.h - y1);
      assert.ok(x0 >= m.view.x && y0 >= m.view.y && x1 <= m.view.x + m.view.w && y1 <= m.view.y + m.view.h,
        f + ' is cut by its own frame: ' + [x0, y0, x1, y1].map((v) => v.toFixed(2)) + ' in ' + JSON.stringify(m.view));
    }
    assert.ok(margin >= 0.03 * m.view.w, f + ' keeps a margin in its frame (' + (100 * margin / m.view.w).toFixed(1) + ' %)');
    const c = onCircle(m, L._WX_NIGHT_ICON);
    assert.ok(c.reach <= R_DRAWN, f + ' reaches ' + c.reach.toFixed(3) + ' of the circle\'s 50, past the safe circle (' + R_SAFE + ') by more than as drawn');
    if (c.reach > R_SAFE) over.push(f);
    if (c.reach > far.reach) far = { f, reach: c.reach };
  }
  assert.deepEqual(over, ['partly-cloudy-night.svg'], 'only the moon\'s tip in partly cloudy night passes 46, and only by 0.03');
  assert.ok(far.reach > 46.02, 'drawn as large as it was drawn (farthest: ' + far.f + ' at ' + far.reach.toFixed(3) + ')');
});

test('the measure catches a cut: an icon drawn 1 % larger than drawn, and a frame moved off its icon', () => {
  const m = inkPoints(path.join(DIR, 'partly-cloudy-night.svg'));
  assert.ok(onCircle(m, 101).reach > R_DRAWN + 0.4, "1 % larger than drawn, the moon's tip passes as drawn by 0.46");
  const right = Math.max(...m.shapes.map((sh) => drawnBox(sh)[2]));
  assert.ok(right < m.view.x + m.view.w && right > m.view.x + m.view.w * 0.93, 'a frame moved 7 % left would cut the moon on the right');
  // and a clip is honoured: the sun's gradient is a square far larger than the sun, clipped to its outline
  const sun = inkPoints(path.join(DIR, 'clear-day.svg'));
  const big = sun.shapes.find((sh) => sh.clips.length === 3);
  assert.ok(big && boxOf(big.pts)[1] < sun.view.y, 'the gradient square, unclipped, leaves the frame');
  assert.ok(drawnBox(big)[1] >= sun.view.y, 'clipped, it does not');
});

// ── the circle the icons are drawn in, on the card and on the gate ─────────
test('the card sets each night icon on its whole circle, and colours the circle from one choice', () => {
  assert.equal(L._WX_NIGHT_DIR, '/logos/weather/night-line/');
  assert.equal(L._WX_NIGHT_ICON, 100);
  const raw = fs.readFileSync(path.join(DIR, 'rain.svg'), 'utf8');
  const view = /viewBox="([^"]+)"/.exec(raw)[1];
  const out = L._wxNightLineDisc(raw);
  assert.ok(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" style="fill:var(--wxn-disc, #2B2B2A)"/>'
    + '<svg x="0" y="0" width="100" height="100" viewBox="' + view + '">'), 'the circle, then the icon on the whole of it: its frame is the circle it was drawn on');
  assert.ok(out.endsWith('</svg></svg>'), 'both closed');
  assert.equal((out.match(/<svg\b/g) || []).length, 2);
  assert.ok(out.includes(raw.slice(raw.indexOf('>') + 1).trim().slice(0, -6)), 'the drawing itself untouched');
  assert.equal(L._wxNightLineDisc('<svg viewBox="0 0 1 1"></svg>'), '<svg viewBox="0 0 1 1"></svg>', 'anything else passes through');
  // inlined on the card: not drawn white and still, and set in its circle
  const hyd = fnSource(CORE, '_wxHydrateSvgs');
  assert.match(hyd, /!\/\\\/\(disc-\(day\|night\)\|night-line\)\\\/\/\.test\(img\.getAttribute\('src'\) \|\| ''\)\) rawTxt = _wxWhiteStill/);
  assert.match(hyd, /if \(\/\\\/night-line\\\/\/\.test\(img\.getAttribute\('src'\) \|\| ''\)\) rawTxt = _wxNightLineDisc\(rawTxt\);/);
  // the card wears the circle's colour with the rest of the airline's look
  const card = fnSource(CORE, '_renderWxCard');
  assert.match(card, /wrap\.style\.setProperty\('--wxn-disc', _wxLk\.nk\);/);
  assert.match(card, /var key = \[_wxLk\.code, _wxLk\.a, _wxLk\.ink, _wxLk\.g, _wxLk\.p, _wxLk\.dk, _wxLk\.nk\]\.join\('\|'\);/);
});

test("one choice: B (the default) a dark tint of the airline's night ground, A the charcoal the icons were drawn on", () => {
  assert.match(CORE, /\nvar _WX_NIGHT_DISC = 'airline';/, 'B is the default');
  assert.equal(L._WX_NIGHT_CHARCOAL, '#2B2B2A', 'the circle on the sheet');
  // A: the charcoal, as drawn, for every airline, on the card and the gate
  const A = lookWith('charcoal');
  for (const c of ['AC', 'WS', 'PD', 'UA', 'F8', '']) {
    assert.equal(A._wxAirlineLook(c).nk, '#2B2B2A', (c || 'no airline') + ' (A, card)');
    assert.equal(A._wxNightDisc(c), '#2B2B2A', (c || 'no airline') + ' (A, gate)');
  }
  // B: the hue the card tints the airline's ground with, dark, and a step lighter than the tile under it
  const ch = okLch('#2B2B2A');
  const nk = (c) => L._wxAirlineLook(c).nk;
  const near = (h, lo, hi) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);
  for (const [c, lo, hi] of [['AC', 340, 20], ['WS', 180, 215], ['PD', 245, 275], ['UA', 245, 280]]) {
    const x = okLch(nk(c));
    assert.ok(near(x.h, lo, hi), c + ': the hue of its ground (' + nk(c) + ', ' + x.h.toFixed(0) + ')');
  }
  assert.equal(nk('AC'), '#33282B', 'Air Canada: a dark wine (its night ground, not the day circle\'s warm beige)');
  assert.equal(nk('WS'), '#254242', 'WestJet: a dark teal');
  assert.equal(nk('PD'), '#2C3749', 'Porter: a dark navy');
  for (const c of Object.keys(L.RC2_PAIRS).concat(['AC', 'WS', 'PD', ''])) {
    const k = L._wxAirlineLook(c), x = okLch(k.nk), tile = okLch(k.ko);
    assert.equal(L._wxNightDisc(c), k.nk, (c || 'no airline') + ': the gate asks the same');
    assert.ok(x.L >= ch.L, (c || 'no airline') + ': never darker than the charcoal, as rounded to its hex (L ' + x.L.toFixed(4) + ' vs ' + ch.L.toFixed(4) + ')');
    assert.ok(x.L <= 0.45, (c || 'no airline') + ': dark, never lighter than it must be (L ' + x.L.toFixed(3) + ')');
    assert.ok(x.L >= tile.L + L._WX_NIGHT_STEP - 0.012 || x.L >= ch.L, (c || 'no airline') + ': reads as a circle on its tile');
    assert.ok(x.C <= L._WX_NIGHT_C + 0.003, (c || 'no airline') + ': a tint, not a colour (C ' + x.C.toFixed(3) + ')');
    // every colour the icons are drawn in keeps 3/4 of its distance from the charcoal they were drawn on
    const t = L._wxOklab(L._rc2Rgb(k.nk)), cc = L._wxOklab(L._rc2Rgb('#2B2B2A'));
    for (const ink of L._WX_NIGHT_INKS) {
      const p = L._wxOklab(L._rc2Rgb(ink));
      assert.ok(okDist(p, t) >= L._WX_DISC_KEEP * okDist(p, cc) - 1e-9, (c || 'no airline') + ': ' + ink + ' still reads on ' + k.nk);
    }
  }
  // every colour the icons are drawn in is one the rule measures
  const used = new Set();
  for (const f of fs.readdirSync(DIR)) {
    const svg = fs.readFileSync(path.join(DIR, f), 'utf8');
    for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{3,6})"/g)) used.add(m[1].length === 4 ? '#' + m[1].slice(1).split('').map((h) => h + h).join('') : m[1]);
    const stops = [...svg.matchAll(/stop-color="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
    if (stops.length) { used.add(stops[0]); used.add(stops[stops.length - 1]); }
  }
  const inks = L._WX_NIGHT_INKS.map((h) => h.toUpperCase());
  for (const c of used) {
    const u = c.toUpperCase();
    const close = inks.some((h) => okDist(L._wxOklab(L._rc2Rgb(h)), L._wxOklab(L._rc2Rgb(u))) < 0.012);
    assert.ok(close, u + ' is drawn in the night icons and measured against the circle');
  }
});

test('the gate: at night the circle look draws the night icon on the night circle; by day nothing changes, and the rows wear their own sets', () => {
  const a = V2.indexOf('const WX_ANIM_ALIAS');
  const END = 'window.fidsWxGateNightDisc = wxGateNightDisc;';
  assert.ok(V2.indexOf(END) > a);
  const SLICE = V2.slice(a, V2.indexOf(END) + END.length);
  const helper = ({ look = '', night = false, airline = '', p = '/gids' }) => {
    const attrs = look ? { 'data-fids-wx-icons': look } : {};
    const root = { getAttribute: (k) => (k in attrs ? attrs[k] : null), classList: { contains: (c) => c === (night ? 'fids-night' : 'fids-day') } };
    const body = { getAttribute: (k) => (k === 'data-gate-airline' ? airline : null) };
    return new Function('window', 'document', 'location', 'FIDS_BUILD_TAG', '_wxDiscPair', '_wxNightDisc', '_wxAnimIcon', SLICE + '\nreturn wxIconHtml;')(
      { TIO_ICON: { 0: 'clear-day', 2: 'partly-cloudy-day', 3: 'cloudy', 95: 'thunderstorms-rain', 1001: 'cloudy', 1000: 'clear-day', 1100: 'partly-cloudy-day' } },
      { documentElement: root, body }, { pathname: p }, 'v1',
      () => ({ disc: '#003366', ink: '#00B2A9' }), (c) => L._wxNightDisc(c), ICON._wxAnimIcon);
  };
  for (const look of ['', 'daynight', 'solid']) {
    const html = helper({ look, night: true, airline: 'WS' })('snow', 64);
    assert.match(html, /^<span class="fids-wx-cell fids-wx-disc fids-wx-line" data-wxg="snow" aria-hidden="true" style="display:inline-block;width:64px;height:64px;/, look || 'default');
    assert.match(html, /--wxn-disc:#254242;--wxn-icon:url\(\/logos\/weather\/night-line\/snow\.svg\?v=v1\);/, (look || 'default') + ': WestJet\'s dark teal, the night icon');
    assert.doesNotMatch(html, /'|solid-in-disc|--wx-glyph/, 'no quote in the style, and not the old glyph');
  }
  assert.match(helper({ night: true, airline: 'AC' })(1001, 48), /--wxn-disc:#33282B;--wxn-icon:url\(\/logos\/weather\/night-line\/cloudy\.svg\?v=v1\);/, 'a Tomorrow.io code, Air Canada');
  // at night the gate draws a code's night form, the icon the card draws for it
  // (a clear sky the moon, not the sun; WMO 3 the two clouds, not one)
  const gateNight = (code) => /night-line\/([a-z-]+)\.svg/.exec(helper({ night: true, airline: 'WS' })(code, 48))[1];
  for (const code of [0, 2, 3, 95]) assert.equal(gateNight(code), ICON._wxAnimIcon(code, true), 'WMO ' + code + ' at night, as on the card');
  assert.equal(gateNight(0), 'clear-night');
  assert.equal(gateNight(3), 'overcast');
  assert.equal(gateNight(1000), 'clear-night', 'an old Tomorrow.io clear sky');
  assert.equal(gateNight(1100), 'partly-cloudy-night');
  assert.equal(gateNight('clear-day'), 'clear-night', 'a name');
  // and by day the day name, as before
  assert.match(helper({ airline: 'WS' })(0, 64), /disc-day\/clear-day\.svg/);
  assert.match(helper({ look: 'solid', airline: 'WS' })(0, 64), /solid-in-disc\/clear-day\.svg/);
  // by day: Colour (Day & night) and Solid (chosen) as they were
  assert.match(helper({ airline: 'WS' })('snow', 64), /src="\/logos\/weather\/disc-day\/snow\.svg\?v=v1"/);
  assert.match(helper({ look: 'solid', airline: 'WS' })('snow', 64), /--wx-disc:#003366;--wx-ink:#00B2A9;--wx-glyph:url\(\/logos\/weather\/solid-in-disc\/snow\.svg\?v=v1\);/);
  // Colour chosen stays Colour at night; the rows take no circle (they wear
  // the row sets drawn for Orion Connected, tests/weather-rows-owner.test.js);
  // other boards keep Classic
  assert.match(helper({ look: 'colour', night: true })('snow', 64), /\/logos\/weather\/disc-day\/snow\.svg/);
  const row = helper({ night: true })('snow', 36, { row: true });
  assert.match(row, /class="fids-wx-cell fids-wx-row"[^>]*--wxr-w:url\(\/logos\/weather\/rows-owner-white\/snow\.svg\?v=v1\);--wxr-c:url\(\/logos\/weather\/rows-owner-color\/snow\.svg\?v=v1\);/);
  assert.doesNotMatch(row, /night-line|fids-wx-line|fids-wx-disc|--wxn-disc/, 'no night circle in a row');
  assert.match(helper({ night: true, p: '/fids' })('snow', 64), /\/logos\/weather\/animated\/snow\.svg/);
  assert.match(helper({ look: 'classic', night: true })('snow', 64), /\/logos\/weather\/animated\/snow\.svg/);
  // without fids-core.js loaded the circle is the charcoal
  const bare = new Function('window', 'document', 'location', 'FIDS_BUILD_TAG', SLICE + '\nreturn wxGateNightDisc;')(
    {}, { documentElement: { getAttribute: () => null, classList: { contains: () => true } }, body: { getAttribute: () => '' } }, { pathname: '/gids' }, 'v1');
  assert.equal(bare(), '#2B2B2A');
});

test('the gate circle is the element\'s own round background, the icon its ::after on the whole circle', () => {
  const at = CSS.indexOf('/* ══ v24053 — THE NIGHT ICONS DRAWN FOR ORION CONNECTED, ON THE GATE');
  assert.ok(at > 0);
  const block = CSS.slice(at, CSS.indexOf('/* ══', at + 10));
  assert.match(block, /\.fids-wx-line \{\s*position: relative;\s*border-radius: 50% !important;\s*background: var\(--wxn-disc, #2B2B2A\) !important;\s*\}/);
  assert.match(block, /\.fids-wx-line::after \{\s*content: '';\s*position: absolute;\s*inset: 0;\s*background: var\(--wxn-icon\) center \/ contain no-repeat;\s*\}/);
  assert.equal((100 - L._WX_NIGHT_ICON) / 2, 0, 'the inset is the card\'s: none, the frame is the circle');
  // the v24014 weather-card block stays last
  const last = CSS.lastIndexOf('/* ══');
  assert.ok(CSS.slice(last).startsWith("/* ══ v24014 — THE WEATHER CARD IN THE AIRLINE'S COLOURS"), 'the v24014 block is last');
});

test('the day look is untouched: Colour by day on the card and the gate, its circle the light tint', () => {
  const fnAt = CORE.indexOf('function _wxCardIconDir(night)');
  const dir = (look, stamped, boardNight) => new Function('window', 'document', '_WX_ICON_DIR', '_WX_NIGHT_DIR', CORE.slice(fnAt, CORE.indexOf('\n}\n', fnAt) + 2) + '\nreturn _wxCardIconDir;')(
    { fidsWxLook: () => look },
    { documentElement: { getAttribute: (k) => (k === 'data-fids-wx-icons' ? stamped : null), classList: { contains: (c) => c === (boardNight ? 'fids-night' : 'fids-day') } } },
    '/logos/weather/flat/', '/logos/weather/night-line/');
  assert.equal(dir('colour', 'daynight', false)(false), '/logos/weather/disc-day/');
  assert.equal(dir('colour', 'daynight', false)(), '/logos/weather/disc-day/');
  assert.equal(dir('solid', 'daynight', true)(false), '/logos/weather/disc-day/', 'a city in daylight on a board at night');
  assert.equal(dir('solid', 'daynight', true)(true), '/logos/weather/night-line/');
  assert.equal(dir('solid', 'daynight', true)(), '/logos/weather/night-line/', 'the day forecasts on a board at night');
  assert.equal(dir('', 'classic', true)(true), '/logos/weather/flat/');
  assert.match(L._wxAirlineLook('AC').dk, /^#[0-9A-F]{6}$/, 'the day circle still has its tint');
  assert.ok(okLch(L._wxAirlineLook('AC').dk).L > 0.9, 'and it is still light');
});

test('the tools that cut the set are kept, and say who it was drawn for', () => {
  for (const f of ['night-line.py', 'README.md']) assert.ok(fs.existsSync(path.join(ROOT, 'scripts/wx-icons', f)), f);
  // every id in a file is its own (wxnl-<file>-...), so an inlined icon brings nothing global
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(DIR, f), 'utf8');
    for (const m of svg.matchAll(/\bid="([^"]+)"/g)) assert.ok(m[1].startsWith('wxnl-' + f.slice(0, -4) + '-'), f + ': ' + m[1]);
  }
  const readme = rd('scripts/wx-icons/README.md');
  assert.match(readme, /drawn for Orion Connected/);
  assert.match(readme, /_WX_NIGHT_DISC/, 'the README names the one choice');
});
