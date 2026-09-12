'use strict';

// One contract for every carrier's branding, rather than another per-carrier
// test file. Three separate carriers were wired by hand this week and each one
// nearly went in through the wrong path, so the rules are worth asserting once
// over the whole registry:
//
//   · an emblem named under /logos/airline-tiles/ is drawn by _gateOrbParts as
//     a FINISHED TILE — transparent badge, object-fit:cover, clipped to a
//     circle, and no whitening. That only works if the art is square and
//     paints its own opaque ground, so those are contract terms, not taste.
//   · a wordmark slug is expanded to "<slug>-wordmark-dark.svg" and resolved
//     through LOGO_SUBFOLDER. A slug whose file is absent does not error — the
//     banner silently falls back to a plain text label, which is why five of
//     them have gone unnoticed.
//   · live <text> in artwork renders in whatever font the VIEWER has. Correct
//     on the machine that drew it, wrong on a signage box.
//
// Where the repo already violates a term, the violation is BASELINED by name
// rather than ignored: the test fails if the set grows, so this cannot rot
// further while the known cases wait for artwork.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'fids-current');
const core = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');

function objectBody(name) {
  const m = new RegExp('(?:var|const|let)\\s+' + name + '\\s*=\\s*(?:window\\.[\\w$]+\\s*=\\s*)?\\{').exec(core);
  assert.ok(m, `fids-core.js must declare ${name}`);
  const start = core.indexOf('{', m.index);
  let depth = 0;
  for (let i = start; i < core.length; i++) {
    if (core[i] === '{') depth++;
    else if (core[i] === '}') { depth--; if (depth === 0) return core.slice(start, i + 1); }
  }
  throw new Error(`could not find the end of ${name}`);
}
function pairs(name) {
  const out = {};
  for (const m of objectBody(name).matchAll(/'([A-Za-z0-9][\w.\-]*(?:\.svg)?)'\s*:\s*'([^']*)'/g)) out[m[1]] = m[2];
  return out;
}

const EMBLEMS = pairs('AIRLINE_EMBLEM_FILES');
const WORDMARKS = pairs('IATA_TO_WORDMARK');
const SUBFOLDER = pairs('LOGO_SUBFOLDER');
const ACCENTS = pairs('AIRLINE_ACCENT');

const localPath = (webPath) => path.join(root, webPath.replace(/^\//, '').replace(/^logos\//, 'logos/').split('?')[0]);
const isTilePath = (p) => /\/logos\/airline-tiles\//.test(p) && !/PB-arrow/i.test(p);
function deltaE(a, b) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lab = (h) => {
    const [r, g, bl] = rgb(h).map(lin);
    const X = 0.4124 * r + 0.3576 * g + 0.1805 * bl, Y = 0.2126 * r + 0.7152 * g + 0.0722 * bl, Z = 0.0193 * r + 0.1192 * g + 0.9505 * bl;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
const viewBox = (svg) => {
  const m = /viewBox="([^"]+)"/.exec(svg);
  return m ? m[1].trim().split(/[\s,]+/).map(Number) : null;
};

// ── baselines: known violations, by carrier. Shrink these, never grow them. ──
// SWR.svg, 37.3x27.8 with a trapezoid fill. Wired under BOTH keys —
// AIRLINE_EMBLEM_FILES carries four ICAO-form keys (AC1, EZY, ROU, SWR)
// alongside the IATA ones, so fixing SWISS means fixing two entries.
const KNOWN_NON_SQUARE = ['LX', 'SWR'];
const KNOWN_TEXT_EMBLEM = ['DI'];         // NAX.svg — Arial lettermark
const KNOWN_BROKEN_WORDMARK = [
  '3H:dark', '3H:light', 'BW:dark', 'BW:light', 'JV:dark', 'WL:dark', 'WL:light', 'WT:dark',
];

test('every tile-path emblem points at a file that exists', () => {
  const missing = [];
  for (const [code, p] of Object.entries(EMBLEMS)) {
    if (!isTilePath(p)) continue;
    if (!fs.existsSync(localPath(p))) missing.push(`${code} -> ${p}`);
  }
  assert.deepEqual(missing, [], `emblem entries point at files that are not there:\n${missing.join('\n')}`);
});

test('tile emblems are square — no more of them than already were', () => {
  // A non-square tile is scaled with object-fit:cover, so the long axis is
  // cropped and any transparent region shows the board through the orb.
  const bad = [];
  for (const [code, p] of Object.entries(EMBLEMS)) {
    if (!isTilePath(p) || !p.endsWith('.svg')) continue;
    const vb = viewBox(fs.readFileSync(localPath(p), 'utf8'));
    if (vb && Math.abs(vb[2] - vb[3]) > 0.01) bad.push(code);
  }
  assert.deepEqual(bad.sort(), [...KNOWN_NON_SQUARE].sort(),
    `the set of non-square tile emblems changed.\nfound: ${bad}\nbaseline: ${KNOWN_NON_SQUARE}\n` +
    'If you fixed one, remove it from KNOWN_NON_SQUARE. If you added one, it will show a bite out of the orb.');
});

test('tile emblems are not typed letters — no more of them than already were', () => {
  const bad = [];
  for (const [code, p] of Object.entries(EMBLEMS)) {
    if (!isTilePath(p) || !p.endsWith('.svg')) continue;
    if (/<text\b/.test(fs.readFileSync(localPath(p), 'utf8'))) bad.push(code);
  }
  assert.deepEqual(bad.sort(), [...KNOWN_TEXT_EMBLEM].sort(),
    `the set of lettermark-placeholder emblems changed.\nfound: ${bad}\nbaseline: ${KNOWN_TEXT_EMBLEM}`);
});

// NOTE: there is deliberately no generic full-bleed test here. Whether art
// paints its own ground edge to edge cannot be decided from the markup —
// grounds are drawn as h/v shorthand, as explicit L-paths with negative
// coordinates, as <rect>, or as a raster — and every structural guess I tried
// produced false positives on files measured as sound. It is answered by
// rendering to a canvas and sampling the corners, which belongs in the
// browser, not here. What IS asserted per carrier below is that the accent
// appears as a fill in its own emblem, which a transparent mark cannot satisfy.


test('every wordmark slug resolves to BOTH variants — no more breakage than already there', () => {
  const broken = [];
  for (const [code, slug] of Object.entries(WORDMARKS)) {
    if (!/^[A-Z0-9]{2}$/.test(code)) continue;
    for (const variant of ['dark', 'light']) {
      const base = `${slug}-wordmark-${variant}.svg`;
      const sub = SUBFOLDER[base];
      const p = path.join(root, 'logos', sub || '', base);
      if (!fs.existsSync(p)) broken.push(`${code}:${variant}`);
    }
  }
  assert.deepEqual(broken.sort(), [...KNOWN_BROKEN_WORDMARK].sort(),
    'the set of dead wordmark pointers changed.\n' +
    `found:    ${broken.sort().join(' ')}\nbaseline: ${[...KNOWN_BROKEN_WORDMARK].sort().join(' ')}\n` +
    'A dead pointer does not error — the banner silently shows a text label instead of the logo.');
});

test('accents are real hex, and never the generic fallback', () => {
  const bad = [];
  for (const [code, v] of Object.entries(ACCENTS)) {
    if (!/^[A-Z0-9]{2,3}$/.test(code)) continue;
    // 3-digit shorthand is valid CSS and TAP ships '#096'; normalise before
    // comparing rather than calling a working value a failure.
    if (!/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v)) { bad.push(`${code}=${v} (not a hex)`); continue; }
    const full = v.length === 4 ? '#' + v.slice(1).split('').map((c) => c + c).join('') : v;
    // '#0033A1' is what getAirlineAccent() returns when it finds nothing, so
    // an explicit entry set to it is indistinguishable from having none.
    if (full.toUpperCase() === '#0033A1') bad.push(`${code}=${v} (the fallback)`);
  }
  assert.deepEqual(bad, []);
});

// ── the carriers wired by this change ──────────────────────────────────────

test('Air North takes the orange its emblem is painted on', () => {
  assert.equal(ACCENTS['4N'], '#F47B21');
  const svg = fs.readFileSync(path.join(root, 'logos', 'airline-tiles', 'AirNorth-Emblem.svg'), 'utf8');
  const fills = (svg.match(/#[0-9A-Fa-f]{6}/g) || []).map((h) => h.toUpperCase());
  assert.ok(fills.includes('#F47B21'), `accent is not one of the emblem's fills: ${[...new Set(fills)]}`);
  assert.ok(isTilePath(EMBLEMS['4N']), `${EMBLEMS['4N']} would be whitened rather than drawn as a tile`);
  const vb = viewBox(svg);
  assert.equal(vb[2], vb[3], 'the emblem must be square');
});

test('Air North wordmark is two inks of one geometry', () => {
  const dir = path.join(root, 'logos', 'airlines', 'canadian-regional');
  const dark = fs.readFileSync(path.join(dir, 'airnorth-wordmark-dark.svg'), 'utf8');
  const light = fs.readFileSync(path.join(dir, 'airnorth-wordmark-light.svg'), 'utf8');
  assert.equal(viewBox(dark).join(), viewBox(light).join(), 'variants must share a viewBox or they jump when swapped');
  const strip = (s) => s.replace(/#[0-9A-Fa-f]{6}/g, '#');
  assert.equal(strip(dark), strip(light));
  assert.deepEqual([...new Set(light.match(/#[0-9A-Fa-f]{6}/g))].map((h) => h.toLowerCase()), ['#ffffff']);
  assert.doesNotMatch(dark, /<text\b/, 'live <text> renders in the viewer\'s font, not the designer\'s');
});

test('Icelandair needed only the accent — its art was already on disk', () => {
  assert.equal(ACCENTS['FI'], '#001B71');
  const tile = fs.readFileSync(path.join(root, 'logos', 'airline-tiles', 'ICE.svg'), 'utf8');
  assert.ok(tile.toUpperCase().includes('#001B71'), 'accent should be the tile ground');
  for (const v of ['dark', 'light']) {
    assert.ok(fs.existsSync(path.join(root, 'logos', 'airlines', 'european', `icelandair-wordmark-${v}.svg`)));
  }
});

test('Frontier takes Frontier Green, the value with a name', () => {
  // '#0F6744' is Frontier Green, the named brand colour and the ink FFT.svg
  // has always used. Four other files carry '#026845', but that counts how
  // often a value was copied, not whether it is right. The two are deltaE 1.45
  // apart and never appear adjacent, so the assertion below stays a proximity
  // check: a redraw may drift imperceptibly, but not to a different green.
  assert.equal(ACCENTS['F9'], '#0F6744');
  const dir = path.join(root, 'logos', 'airlines', 'us-major');
  // The accent is the palette's authoritative value. Assert it stays within
  // the cluster the artwork on disk actually uses, rather than pinning the
  // artwork to it — a redraw should be free to shift by an imperceptible
  // amount without failing, but not to drift to a different green.
  const inks = ['frontier-emblem.svg', 'frontier-wordmark-dark.svg', 'frontier.svg']
    .map((f) => (fs.readFileSync(path.join(dir, f), 'utf8').match(/#[0-9A-Fa-f]{6}/) || [])[0])
    .filter(Boolean);
  assert.equal(inks.length, 3, 'expected an ink in each of the three Frontier files');
  for (const ink of inks) {
    assert.ok(deltaE(ACCENTS['F9'], ink) < 3,
      `accent ${ACCENTS['F9']} is deltaE ${deltaE(ACCENTS['F9'], ink).toFixed(2)} from ${ink} — a different green, not a re-trace`);
  }
});

test('TAP takes the green its own tile is painted, not the teal it had', () => {
  // '#009966' sat in this table as the shorthand '#096' and is deltaE 34 from
  // both TAP's identity guidelines and the tile the board already draws.
  const accent = ACCENTS['TP'];
  const tile = fs.readFileSync(path.join(root, 'logos', 'airline-tiles', 'TAP.svg'), 'utf8');
  const ground = (tile.match(/fill="(#[0-9A-Fa-f]{6})"/) || [])[1];
  assert.ok(ground, 'TAP.svg has no ground fill to compare against');
  assert.ok(deltaE(accent, ground) < 3,
    `accent ${accent} is deltaE ${deltaE(accent, ground).toFixed(2)} from the tile ground ${ground} — the orb and the rails would draw different greens`);
  assert.ok(deltaE(accent, '#009966') > 20, 'this is the teal the accent used to be');
});

test('the new art is in the asset manifest', () => {
  const manifest = fs.readFileSync(path.join(root, 'assets', 'asset-manifest.json'), 'utf8');
  for (const f of ['AirNorth-Emblem.svg', 'airnorth-wordmark-dark.svg', 'airnorth-wordmark-light.svg']) {
    assert.ok(manifest.includes(f), `${f} missing from asset-manifest.json — run npm run assets:build`);
  }
});
