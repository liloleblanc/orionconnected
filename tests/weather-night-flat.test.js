'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24054 — THE NIGHT ICONS. v24086 — THE FLAT SET IN THE STYLE OF VECTEEZY
// PACK 98703.
//
// At night, wherever the look draws its weather icons in a circle (Day &
// night after dark and Solid at night), the icons are the night set, one
// file per condition in logos/weather/night-flat/, built by
// scripts/wx-icons/flat.py from the masters in scripts/wx-icons/flat/: the
// flat set in the style of Vecteezy pack 98703 (licensed, no attribution),
// in the pack's own colours (white clouds, a #CCCCCC cloud behind, a
// #F2A844 sun, moon and bolt). The weather card draws them; the gate's
// circle look is wired the same way (no element of today's gate layout
// shows it). The files carry no circle; each file's frame IS the circle and
// the boards draw their circle on that frame (_WX_NIGHT_ICON = 100). One
// frame for every icon, so every icon is at one scale: the cloud pair spans
// 64 % of the circle's diameter, as the pack's icons sit in their tiles.
// The circle's colour is one choice, _WX_NIGHT_DISC: 'airline' (B, the
// default), what the card paints under the circle lifted a step toward a
// light tint of the airline, so it reads as a circle on any footage and
// blends with it; 'charcoal' (A), a charcoal circle.
//
// This test pins:
//   · every condition MET can send, read at night, to the icon it draws, and
//     that icon to an existing file in night-flat/ (and every other name the
//     boards can ask for at night, Tomorrow.io's and the gate's, to a file);
//     each file its master's shapes, as written, in the dark colourway;
//   · one frame, the circle, for every file: nothing scaled per icon, so a
//     cloud is the same size in every icon;
//   · nothing is cut: every shape inside the file's own frame, and inside
//     92 % of the circle's radius (the boards' rule for circle sets);
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
const DIR = path.join(ROOT, 'fids-current/logos/weather/night-flat');
const MASTERS = path.join(ROOT, 'scripts/wx-icons/flat');
const PALETTE = JSON.parse(fs.readFileSync(path.join(MASTERS, 'palette.json'), 'utf8'));
const FRAME = '-12.5 -12.5 125 125';   // the circle: the cloud pair (80) at 64 % of it

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
    + ' _WX_NIGHT_DISC, _WX_NIGHT_DIR, _WX_NIGHT_CHARCOAL, _WX_NIGHT_ICON, _WX_NIGHT_C, _WX_NIGHT_LIFT, _WX_NIGHT_INKS, _WX_DISC_KEEP, _WX_DISC_L, _WX_GROUND_DIM });', sb);
}
const L = lookWith();
const okDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const okLch = (h) => { const o = L._wxOklab(L._rc2Rgb(h)); return { L: o[0], C: Math.hypot(o[1], o[2]), h: (Math.atan2(o[2], o[1]) * 180 / Math.PI + 360) % 360 }; };

// ── the files and their masters ───────────────────────────────────────────
const names = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
const NAMES = names(MASTERS);
const has = (name) => fs.existsSync(path.join(DIR, name + '.svg'));
const attr = (s, k) => (new RegExp('\\b' + k + '="([^"]*)"').exec(s) || [])[1];
// a file's root and its shapes, in order: { tag, fill, role, geo } (geo: the
// shape's geometry attributes as written). Nothing but paths and circles.
function shapesOf(file, master) {
  const svg = fs.readFileSync(file, 'utf8');
  const root = master ? /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/.exec(svg)
    : /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([^"]+)">/.exec(svg);
  assert.ok(root, file + ': one plain root');
  const body = svg.slice(root[0].length).replace(/<\/svg>\n?$/, '');
  const re = master ? /<(path|circle) data-role="([a-z-]+)" fill="(#[0-9A-F]{6})" ([^>]*?)\/>/g : /<(path|circle) fill="(#[0-9A-F]{6})" ([^>]*?)\/>/g;
  const out = [];
  for (const m of body.matchAll(re)) out.push(master ? { tag: m[1], role: m[2], fill: m[3], geo: m[4] } : { tag: m[1], fill: m[2], geo: m[3] });
  assert.equal(body.replace(re, ''), '', file + ': nothing but paths and circles');
  return { view: root[1] || '0 0 100 100', shapes: out, svg };
}

test('every symbol MET sends, read at night, draws its pinned icon from an existing night-flat file', () => {
  // every symbol MET sends: 41, 21 of them with _day / _night / _polartwilight
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
  assert.equal(MET_SYMBOLS.length, 83, "MET's 83 symbol strings");
  for (const sym of MET_SYMBOLS) {
    const base = sym.replace(/_(day|night|polartwilight)$/, '');
    const wmo = MET.metWmo(sym);
    assert.equal(typeof wmo, 'number', sym + ' is a code the server knows');
    const name = ICON._wxAnimIcon(wmo, true);
    const want = /andthunder$/.test(base) ? 'thunderstorms-rain' : NIGHT_FILE[base];
    assert.ok(want, sym + ' is pinned here');
    assert.equal(name, want, sym + ' (WMO ' + wmo + ') at night');
    assert.ok(has(name), 'night-flat/' + name + '.svg exists for ' + sym);
  }
});

test('each file is its master as written, in the pack\'s own colours, and the sets drawn for the night are their own drawings', () => {
  assert.equal(NAMES.length, 31, '31 masters');
  assert.deepEqual(names(DIR), NAMES, 'one night file per master, nothing else');
  const dark = PALETTE.dark;
  for (const n of NAMES) {
    const m = shapesOf(path.join(MASTERS, n + '.svg'), true), f = shapesOf(path.join(DIR, n + '.svg'), false);
    assert.equal(f.shapes.length, m.shapes.length, n + ': every shape of the master');
    m.shapes.forEach((s, i) => {
      assert.equal(s.fill, dark[s.role], n + ': the master is in the dark colourway');
      assert.deepEqual([f.shapes[i].tag, f.shapes[i].geo], [s.tag, s.geo], n + ' shape ' + i + ': the same shape, as written');
      assert.equal(f.shapes[i].fill, dark[s.role], n + ' shape ' + i + ': the pack\'s colour for a ' + s.role);
    });
  }
  // the pack's colours: white, the grey of the cloud behind, the orange
  assert.deepEqual([...new Set(Object.values(dark))].sort(), ['#CCCCCC', '#F2A844', '#FFFFFF']);
  // and every condition is a drawing of its own (drizzle is not rain, a storm by day carries its sun)
  const drawing = (n) => shapesOf(path.join(DIR, n + '.svg'), false).shapes.map((s) => s.tag + s.geo).join('|');
  const seen = new Map();
  for (const n of NAMES) { assert.ok(!seen.has(drawing(n)), n + ' is drawn as ' + seen.get(drawing(n))); seen.set(drawing(n), n); }
});

// ── each file's frame is the circle, one for every icon ───────────────────
test('each file\'s frame is the circle: one frame for every icon, the cloud pair across 64 % of it', () => {
  for (const n of NAMES) assert.equal(shapesOf(path.join(DIR, n + '.svg'), false).view, FRAME, n);
  // the boards draw their circle on the whole frame: nothing scaled
  assert.equal(L._WX_NIGHT_ICON, 100);
  // the masters' cloud pair is 80 across: 64 % of the 125-unit circle
  assert.equal(80 / 125, 0.64);
});

test('every other name the boards can ask for at night has a night-flat file', () => {
  // every WMO code 0-99 and every Tomorrow.io code, read at night (the plates and the hours)
  const TIO_ICON = table('TIO_ICON');
  const codes = new Set([...Array(100).keys(), ...Object.keys(TIO_ICON).map(Number)]);
  for (const c of codes) assert.ok(has(ICON._wxAnimIcon(c, true)), 'code ' + c + ' at night: ' + ICON._wxAnimIcon(c, true));
  // the day forecasts, which keep their daytime icons when the board is at night
  for (const c of codes) assert.ok(has(ICON._wmoAnimIcon(c)), 'day forecast ' + c + ': ' + ICON._wmoAnimIcon(c));
  // the gate: every name the circle look draws, and every name TIO_ICON gives it
  const look = Object.keys(vm.runInNewContext('(' + /const WX_LOOK_NAMES = (\{[^}]+\});/.exec(V2)[1] + ')'));
  assert.equal(look.length, 23);
  for (const n of look) assert.ok(has(n), 'night-flat/' + n + '.svg');
  for (const n of new Set(Object.values(TIO_ICON))) if (look.includes(n)) assert.ok(has(n), n);
  // and the folder is every name the row sets draw (the same 31 drawings)
  const rows = Object.keys(vm.runInNewContext('(' + /const WX_ROW_NAMES = (\{[^}]+\});/.exec(V2)[1] + ')')).sort();
  assert.deepEqual(names(DIR), rows);
});

// ── nothing is cut ─────────────────────────────────────────────────────────
// Each shape's outline, read from its path data (the set uses M L C Z) or its
// circle. The shapes are filled, never stroked, so the outline bounds what
// each draws.
function pointsOf(s) {
  if (s.tag === 'circle') {
    const [cx, cy, r] = ['cx', 'cy', 'r'].map((k) => +attr(s.geo, k));
    return { circle: [cx, cy, r], pts: [[cx - r, cy], [cx + r, cy], [cx, cy - r], [cx, cy + r]] };
  }
  const d = attr(s.geo, 'd');
  assert.match(d, /^(?:[MLCZ]|[-\d.]+| )+$/, 'only M L C Z, absolute');
  const toks = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  const pts = [];
  let i = 0, cmd = null, cur = null, start = null;
  while (i < toks.length) {
    if (/[MLCZ]/.test(toks[i])) { cmd = toks[i++]; if (cmd === 'Z') { cur = start; continue; } }
    if (cmd === 'M') { cur = start = [+toks[i++], +toks[i++]]; pts.push(cur); cmd = 'L'; continue; }
    if (cmd === 'L') { cur = [+toks[i++], +toks[i++]]; pts.push(cur); continue; }
    const q = [cur, [+toks[i++], +toks[i++]], [+toks[i++], +toks[i++]], [+toks[i++], +toks[i++]]];
    for (let n = 1; n <= 32; n++) {
      const t = n / 32, u = 1 - t;
      pts.push([0, 1].map((k) => u * u * u * q[0][k] + 3 * u * u * t * q[1][k] + 3 * u * t * t * q[2][k] + t * t * t * q[3][k]));
    }
    cur = q[3];
  }
  return { pts };
}
function measure(file) {
  const f = shapesOf(file, false);
  const [x, y, w, h] = f.view.split(' ').map(Number);
  const cx = x + w / 2, cy = y + h / 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, reach = 0;
  for (const s of f.shapes) {
    const p = pointsOf(s);
    if (p.circle) {
      const [a, b, r] = p.circle;
      x0 = Math.min(x0, a - r); x1 = Math.max(x1, a + r); y0 = Math.min(y0, b - r); y1 = Math.max(y1, b + r);
      reach = Math.max(reach, Math.hypot(a - cx, b - cy) + r);
    }
    for (const [px, py] of p.pts) {
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      reach = Math.max(reach, Math.hypot(px - cx, py - cy));
    }
  }
  return { view: { x, y, w, h }, box: [x0, y0, x1, y1], reach, shapes: f.shapes };
}
// on the circle: the frame drawn at `share` % of a 100-unit circle, centred
const onCircle = (m, share) => m.reach * share / m.view.w;
const R_SAFE = 46;   // 92 % of the circle's radius of 50, the boards' rule for every circle set

test('nothing is cut: every shape inside its frame, and every point within 92 % of the circle\'s radius', () => {
  let far = { reach: 0 };
  for (const n of NAMES) {
    const m = measure(path.join(DIR, n + '.svg'));
    assert.ok(Math.abs(m.view.w - m.view.h) < 1e-9, n + ': a square frame');
    const [x0, y0, x1, y1] = m.box;
    const margin = Math.min(x0 - m.view.x, y0 - m.view.y, m.view.x + m.view.w - x1, m.view.y + m.view.h - y1);
    assert.ok(margin >= 0.1 * m.view.w, n + ' keeps a margin in its frame (' + (100 * margin / m.view.w).toFixed(1) + ' %)');
    const r = onCircle(m, L._WX_NIGHT_ICON);
    assert.ok(r <= R_SAFE, n + ' reaches ' + r.toFixed(2) + ' of the circle\'s 50, past the safe circle (' + R_SAFE + ')');
    // and as large as the pack's icons sit in their tiles: the longest side 57 to 66 % of the circle
    const long = Math.max(x1 - x0, y1 - y0) / m.view.w;
    assert.ok(long >= 0.57 && long <= 0.66, n + ': its longest side is ' + (100 * long).toFixed(1) + ' % of the circle');
    if (r > far.reach) far = { n, reach: r };
  }
  // the farthest point of any icon: extreme-rain's lowest drop, 42.8 of 50 (85.6 %)
  assert.equal(far.n, 'extreme-rain');
  assert.ok(far.reach > 42.6 && far.reach < 43, 'farthest: ' + far.n + ' at ' + far.reach.toFixed(2));
});

test('one scale for every icon: the cloud and the sun are the same size wherever they appear', () => {
  // the main (white) cloud, in every icon that has one; partly cloudy with
  // snow alone is drawn smaller (its middle flake staggered low, as in snow,
  // the whole fitted to 80)
  const widths = {};
  for (const n of NAMES) {
    const m = measure(path.join(DIR, n + '.svg'));
    const master = shapesOf(path.join(MASTERS, n + '.svg'), true).shapes;
    const i = master.map((s) => s.role).lastIndexOf('cloud');
    if (i < 0) continue;
    const xs = pointsOf(m.shapes[i]).pts.map((p) => p[0]);
    widths[n] = Math.max(...xs) - Math.min(...xs);
  }
  const ref = widths.cloudy;
  assert.ok(Object.keys(widths).length >= 20, Object.keys(widths).length + ' icons with a cloud');
  for (const [n, w] of Object.entries(widths)) {
    if (n === 'partly-cloudy-day-snow') { assert.ok(w < ref * 0.9 && w > ref * 0.8, n + ': fitted to 80 (' + (w / ref).toFixed(3) + ')'); continue; }
    assert.ok(Math.abs(w - ref) < 0.1, n + ': its cloud is ' + w.toFixed(2) + ' wide, ' + ref.toFixed(2) + ' in cloudy');
  }
});

test('the measure catches a cut: the circle 8 % smaller, and a frame moved off its icon', () => {
  const m = measure(path.join(DIR, 'extreme-rain.svg'));
  assert.ok(onCircle(m, 100) <= R_SAFE, 'as built, inside');
  assert.ok(onCircle(m, 108) > R_SAFE, "the icon drawn 8 % larger in its circle, the lowest drop passes 92 %");
  const right = m.box[2];
  assert.ok(right < m.view.x + m.view.w && right > m.view.x + m.view.w * 0.8, 'a frame moved 20 % left would cut the icon on the right');
});

// ── the circle the icons are drawn in, on the card and on the gate ─────────
test('the card sets each night icon on its whole circle, and colours the circle from one choice', () => {
  assert.equal(L._WX_NIGHT_DIR, '/logos/weather/night-flat/');
  assert.equal(L._WX_NIGHT_ICON, 100);
  const raw = fs.readFileSync(path.join(DIR, 'rain.svg'), 'utf8');
  const out = L._wxNightLineDisc(raw);
  assert.ok(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" style="fill:var(--wxn-disc, #2B2B2A)"/>'
    + '<svg x="0" y="0" width="100" height="100" viewBox="' + FRAME + '">'), 'the circle, then the icon on the whole of it: its frame is the circle');
  assert.ok(out.endsWith('</svg></svg>'), 'both closed');
  assert.equal((out.match(/<svg\b/g) || []).length, 2);
  assert.ok(out.includes(raw.slice(raw.indexOf('>') + 1).trim().slice(0, -6)), 'the drawing itself untouched');
  assert.equal(L._wxNightLineDisc('<svg viewBox="0 0 1 1"></svg>'), '<svg viewBox="0 0 1 1"></svg>', 'anything else passes through');
  // inlined on the card: not drawn white and still, and set in its circle
  const hyd = fnSource(CORE, '_wxHydrateSvgs');
  assert.match(hyd, /!\/\\\/\(disc-\(day\|night\)\|night-flat\)\\\/\/\.test\(img\.getAttribute\('src'\) \|\| ''\)\) rawTxt = _wxWhiteStill/);
  assert.match(hyd, /if \(\/\\\/night-flat\\\/\/\.test\(img\.getAttribute\('src'\) \|\| ''\)\) rawTxt = _wxNightLineDisc\(rawTxt\);/);
  // the card wears the circle's colour with the rest of the airline's look
  const card = fnSource(CORE, '_renderWxCard');
  assert.match(card, /wrap\.style\.setProperty\('--wxn-disc', _wxLk\.nk\);/);
  assert.match(card, /var key = \[_wxLk\.code, _wxLk\.a, _wxLk\.ink, _wxLk\.g, _wxLk\.p, _wxLk\.dk, _wxLk\.nk\]\.join\('\|'\);/);
});

test("one choice: B (the default) the ground under the circle lifted toward the airline's tint, A a charcoal", () => {
  assert.match(CORE, /\nvar _WX_NIGHT_DISC = 'airline';/, 'B is the default');
  assert.equal(L._WX_NIGHT_CHARCOAL, '#2B2B2A', 'the charcoal');
  // A: the charcoal for every airline, on the card and the gate
  const A = lookWith('charcoal');
  for (const c of ['AC', 'WS', 'PD', 'UA', 'F8', '']) {
    assert.equal(A._wxAirlineLook(c).nk, '#2B2B2A', (c || 'no airline') + ' (A, card)');
    assert.equal(A._wxNightDisc(c), '#2B2B2A', (c || 'no airline') + ' (A, gate)');
  }
  // B: a light tint in the hue the card tints the airline's ground with, laid
  // at _WX_NIGHT_LIFT over whatever the card paints under the circle
  const nk = (c) => L._wxAirlineLook(c).nk;
  const parse = (v) => { const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(v); assert.ok(m, v + ' is a tint over the ground'); return { rgb: m.slice(1, 4).map(Number), a: +m[4] }; };
  const hex = (c) => '#' + c.map((v) => ('0' + Math.round(v).toString(16)).slice(-2)).join('');
  const near = (h, lo, hi) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);
  for (const [c, lo, hi] of [['AC', 340, 20], ['WS', 180, 215], ['PD', 245, 275], ['UA', 245, 280]]) {
    const x = okLch(hex(parse(nk(c)).rgb));
    assert.ok(near(x.h, lo, hi), c + ': the hue of its ground (' + nk(c) + ', ' + x.h.toFixed(0) + ')');
  }
  assert.equal(nk('AC'), 'rgba(249, 234, 238, 0.1)', 'Air Canada: toward a faint wine (its night ground, not the day circle\'s warm beige)');
  assert.equal(nk('WS'), 'rgba(213, 246, 247, 0.1)', 'WestJet: toward a faint teal');
  assert.equal(nk('PD'), 'rgba(225, 240, 255, 0.1)', 'Porter: toward a faint navy');
  assert.equal(L._WX_NIGHT_LIFT, 0.1);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const cr = (p, q) => (Math.max(lum(p), lum(q)) + 0.05) / (Math.min(lum(p), lum(q)) + 0.05);
  const over = (top, a, under) => under.map((v, i) => top[i] * a + v * (1 - a));
  for (const c of Object.keys(L.RC2_PAIRS).concat(['AC', 'WS', 'PD', ''])) {
    const k = L._wxAirlineLook(c), t = parse(k.nk), x = okLch(hex(t.rgb));
    assert.equal(L._wxNightDisc(c), k.nk, (c || 'no airline') + ': the gate asks the same');
    assert.equal(t.a, L._WX_NIGHT_LIFT, (c || 'no airline') + ': one lift for every airline');
    assert.ok(Math.abs(x.L - L._WX_DISC_L) < 0.012, (c || 'no airline') + ': as light as the day circle (L ' + x.L.toFixed(3) + ')');
    assert.ok(x.C <= L._WX_NIGHT_C + 0.003, (c || 'no airline') + ': a tint, not a colour (C ' + x.C.toFixed(3) + ')');
    // what the card paints there: the airline's near-black at 70 % over the
    // footage, the footage from black to a bright grey, under an hour or a
    // day (nothing more) or a plate (the airline's tint at 55 % on top)
    const g = k.g.split(',').map(Number), f = /rgba\((\d+),(\d+),(\d+),/.exec(k.p).slice(1, 4).map(Number);
    for (const foot of [0, 40, 80, 120, 160]) {
      const base = over(g, L._WX_GROUND_DIM, [foot, foot, foot]);
      for (const [where, ground] of [['hour', base], ['plate', over(f, L._WX_TINT, base)]]) {
        const disc = over(t.rgb, t.a, ground);
        const step = cr(disc, ground);
        const at = (c || 'no airline') + ', ' + where + ' on footage ' + foot + ': ';
        assert.ok(step >= 1.2 && step <= 1.45, at + 'reads as a circle and blends (' + step.toFixed(2) + ':1)');
        assert.ok(lum(disc) > lum(ground), at + 'a step lighter');
        // the icons' white, grey and orange keep 3:1 on it
        for (const ink of L._WX_NIGHT_INKS) assert.ok(cr(L._rc2Rgb(ink), disc) >= 3, at + ink + ' at ' + cr(L._rc2Rgb(ink), disc).toFixed(2) + ':1');
      }
    }
  }
  // every colour the icons are drawn in is one the rule measures, and the rule measures the pack's colours
  const used = new Set();
  for (const n of NAMES) for (const s of shapesOf(path.join(DIR, n + '.svg'), false).shapes) used.add(s.fill.toUpperCase());
  const inks = L._WX_NIGHT_INKS.map((h) => h.toUpperCase());
  for (const c of used) {
    const close = inks.some((h) => okDist(L._wxOklab(L._rc2Rgb(h)), L._wxOklab(L._rc2Rgb(c))) < 0.012);
    assert.ok(close, c + ' is drawn in the night icons and measured against the circle');
  }
  assert.deepEqual([...inks].sort(), [...new Set(Object.values(PALETTE.dark))].sort(), '_WX_NIGHT_INKS are the dark colourway');
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
    assert.match(html, /--wxn-disc:rgba\(213, 246, 247, 0\.1\);--wxn-icon:url\(\/logos\/weather\/night-flat\/snow\.svg\?v=v1\);/, (look || 'default') + ': WestJet\'s faint teal lift, the night icon');
    assert.doesNotMatch(html, /'|solid-in-disc|--wx-glyph/, 'no quote in the style, and not the old glyph');
  }
  assert.match(helper({ night: true, airline: 'AC' })(1001, 48), /--wxn-disc:rgba\(249, 234, 238, 0\.1\);--wxn-icon:url\(\/logos\/weather\/night-flat\/cloudy\.svg\?v=v1\);/, 'a Tomorrow.io code, Air Canada');
  // at night the gate draws a code's night form, the icon the card draws for it
  // (a clear sky the moon, not the sun; WMO 3 the two clouds, not one)
  const gateNight = (code) => /night-flat\/([a-z-]+)\.svg/.exec(helper({ night: true, airline: 'WS' })(code, 48))[1];
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
  // their own two sets, tests/weather-rows-flat.test.js); other boards keep Classic
  assert.match(helper({ look: 'colour', night: true })('snow', 64), /\/logos\/weather\/disc-day\/snow\.svg/);
  const row = helper({ night: true })('snow', 36, { row: true });
  assert.match(row, /class="fids-wx-cell fids-wx-row"[^>]*--wxr-w:url\(\/logos\/weather\/rows-flat-white\/snow\.svg\?v=v1\);--wxr-c:url\(\/logos\/weather\/rows-flat-color\/snow\.svg\?v=v1\);/);
  assert.doesNotMatch(row, /night-flat|fids-wx-line|fids-wx-disc|--wxn-disc/, 'no night circle in a row');
  assert.match(helper({ night: true, p: '/fids' })('snow', 64), /\/logos\/weather\/animated\/snow\.svg/);
  assert.match(helper({ look: 'classic', night: true })('snow', 64), /\/logos\/weather\/animated\/snow\.svg/);
  // without fids-core.js loaded the circle is the charcoal
  const bare = new Function('window', 'document', 'location', 'FIDS_BUILD_TAG', SLICE + '\nreturn wxGateNightDisc;')(
    {}, { documentElement: { getAttribute: () => null, classList: { contains: () => true } }, body: { getAttribute: () => '' } }, { pathname: '/gids' }, 'v1');
  assert.equal(bare(), '#2B2B2A');
});

test('the gate circle is the element\'s own round background, the icon its ::after on the whole circle', () => {
  const at = CSS.indexOf('/* ══ v24054 — THE NIGHT ICONS, ON THE GATE');
  assert.ok(at > 0);
  const block = CSS.slice(at, CSS.indexOf('/* ══', at + 10));
  assert.match(block, /logos\/weather\/night-flat\//);
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
    '/logos/weather/flat/', '/logos/weather/night-flat/');
  assert.equal(dir('colour', 'daynight', false)(false), '/logos/weather/disc-day/');
  assert.equal(dir('colour', 'daynight', false)(), '/logos/weather/disc-day/');
  assert.equal(dir('solid', 'daynight', true)(false), '/logos/weather/disc-day/', 'a city in daylight on a board at night');
  assert.equal(dir('solid', 'daynight', true)(true), '/logos/weather/night-flat/');
  assert.equal(dir('solid', 'daynight', true)(), '/logos/weather/night-flat/', 'the day forecasts on a board at night');
  assert.equal(dir('', 'classic', true)(true), '/logos/weather/flat/');
  assert.match(CORE, /\nvar _WX_ICON_DIR = '\/logos\/weather\/flat\/';/, 'Classic on the card keeps the flat set');
  assert.match(L._wxAirlineLook('AC').dk, /^#[0-9A-F]{6}$/, 'the day circle still has its tint');
  assert.ok(okLch(L._wxAirlineLook('AC').dk).L > 0.9, 'and it is still light');
});

test('the files carry nothing global, and the tools that build them are kept with their source', () => {
  for (const n of NAMES) {
    const svg = fs.readFileSync(path.join(DIR, n + '.svg'), 'utf8');
    assert.doesNotMatch(svg, /\bid=|<style|\bstyle=|<script|\bon[a-z]+=|href=|<image|<foreignObject|data-role|transform=/i, n + ': drawings only');
  }
  for (const f of ['flat.py', 'rows-pixels.js', 'README.md', 'flat/palette.json']) assert.ok(fs.existsSync(path.join(ROOT, 'scripts/wx-icons', f)), f);
  // the sets they replaced are gone, with the scripts that built them
  for (const gone of ['fids-current/logos/weather/night-line', 'fids-current/logos/weather/rows-line-white', 'fids-current/logos/weather/rows-line-color',
    'scripts/wx-icons/night-line.py', 'scripts/wx-icons/rows-line.py', 'scripts/wx-icons/rows-line-split.js', 'scripts/wx-icons/rows-line-measure.js',
    'scripts/wx-icons/rows-line-pixels.js']) assert.ok(!fs.existsSync(path.join(ROOT, gone)), gone + ' is gone');
  const readme = rd('scripts/wx-icons/README.md');
  assert.match(readme, /Vecteezy pack 98703/);
  assert.match(readme, /no attribution/);
  assert.match(readme, /_WX_NIGHT_DISC/, 'the README names the one choice');
  assert.match(readme, /flat\.py/);
  assert.match(readme, /rows-pixels\.js/);
});
