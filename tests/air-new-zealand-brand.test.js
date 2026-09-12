'use strict';

// Air New Zealand flies roughly 260 flights across this network, nearly all of
// them at San Francisco, and had no accent, no emblem and no wordmark — so it
// drew an empty orb on getAirlineAccent()'s last-resort '#0033A1', a blue
// belonging to no airline.
//
// As with Canadian North, the load-bearing detail is the FOLDER in the emblem
// path: _gateOrbParts decides whether art keeps its own ground by testing for
// /logos/airline-tiles/. These tests run that real rule rather than asserting
// a string, and they check the wordmark pair the banner resolver expects to
// find by name.

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
const entry = (tbl, key) => {
  const m = new RegExp("'" + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'\\s*:\\s*'([^']*)'").exec(objectBody(tbl));
  return m ? m[1] : null;
};

const EMBLEM = path.join(root, 'logos', 'airline-tiles', 'NZ-Emblem.svg');
const WM_DARK = path.join(root, 'logos', 'airlines', 'asian-other', 'NZ-wordmark-dark.svg');
const WM_LIGHT = path.join(root, 'logos', 'airlines', 'asian-other', 'NZ-wordmark-light.svg');

test('Air New Zealand has an accent instead of the generic navy', () => {
  const accent = entry('AIRLINE_ACCENT', 'NZ');
  assert.ok(accent, "AIRLINE_ACCENT is missing 'NZ'");
  assert.notEqual(accent.toUpperCase(), '#0033A1');
});

test('the accent is the ground its own emblem is painted on', () => {
  const svg = fs.readFileSync(EMBLEM, 'utf8');
  const accent = entry('AIRLINE_ACCENT', 'NZ').toUpperCase();
  const fills = (svg.match(/#[0-9A-Fa-f]{6}/g) || []).map((h) => h.toUpperCase());
  assert.ok(fills.includes(accent), `accent ${accent} is not a fill in the emblem (${[...new Set(fills)]})`);
  // The dark wordmark is inked in the same colour, so the two never drift.
  const wm = (fs.readFileSync(WM_DARK, 'utf8').match(/#[0-9A-Fa-f]{6}/g) || []).map((h) => h.toUpperCase());
  assert.ok(wm.includes(accent), `wordmark ink ${[...new Set(wm)]} does not match the accent ${accent}`);
});

test('the emblem is named at the airline-tiles path, which is what keeps its ground', () => {
  const p = entry('AIRLINE_EMBLEM_FILES', 'NZ');
  assert.ok(p, "AIRLINE_EMBLEM_FILES is missing 'NZ'");
  const rule = /var isTile = !!tb[\s\S]*?;/.exec(core);
  assert.ok(rule, 'could not find the isTile rule in _gateOrbParts');
  assert.match(rule[0], /logos\\\/airline-tiles\\\//,
    'the isTile rule no longer keys on the airline-tiles folder — re-check this entry');
  assert.ok(/\/logos\/airline-tiles\//.test(p) && !/PB-arrow/i.test(p),
    `${p} does not read as a finished tile, so the orb would whiten this emblem to a white blob`);
});

test('the emblem is square, and its mark clears the circular crop', () => {
  const svg = fs.readFileSync(EMBLEM, 'utf8');
  const [minX, minY, w, h] = /viewBox="([^"]+)"/.exec(svg)[1].trim().split(/[\s,]+/).map(Number);
  assert.equal(w, h, `a tile must be square, got ${w}x${h}`);

  // The mark's own coordinates OVERHANG the inscribed circle — the furthest is
  // ~412 against a 400 radius — but those are bezier CONTROL points, which lie
  // outside the curve they steer. Rendering the file to a canvas and sampling
  // the painted white pixels puts the true furthest ink at 394.3. That was
  // measured in a browser; what is pinned here is the thing that would make
  // the measurement stale, namely the art changing shape.
  const white = /<path[^>]*fill="#ffffff"[^>]*d="([^"]+)"/.exec(svg)
             || /<path[^>]*d="([^"]+)"[^>]*fill="#ffffff"/.exec(svg);
  assert.ok(white, 'expected a white mark drawn over the dark ground');
  const nums = (white[1].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const cx = minX + w / 2, cy = minY + h / 2;
  let worst = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) worst = Math.max(worst, Math.hypot(nums[i] - cx, nums[i + 1] - cy));
  assert.ok(worst < (w / 2) * 1.05,
    `control points now reach ${worst.toFixed(0)} against a ${w / 2} radius — beyond the 5% bezier slack this was measured under, so re-measure the painted ink on a canvas`);
});

test('the banner wordmark resolves to files that exist, in both variants', () => {
  // The banner builds its path as logoPath(slug + '-wordmark-dark.svg'), and
  // logoPath finds the folder via LOGO_SUBFOLDER[basename]. A slug with no
  // matching file falls back to a plain text label, silently.
  const slug = entry('IATA_TO_WORDMARK', 'NZ');
  assert.ok(slug, "IATA_TO_WORDMARK is missing 'NZ'");
  for (const variant of ['dark', 'light']) {
    const base = `${slug}-wordmark-${variant}.svg`;
    const sub = entry('LOGO_SUBFOLDER', base);
    assert.ok(sub, `LOGO_SUBFOLDER has no entry for ${base}, so logoPath would look in /logos/ root`);
    const resolved = path.join(root, 'logos', sub, base);
    assert.ok(fs.existsSync(resolved), `${slug} resolves to ${resolved}, which does not exist`);
  }
});

test('the two wordmark variants are the same artwork in two inks', () => {
  const dark = fs.readFileSync(WM_DARK, 'utf8');
  const light = fs.readFileSync(WM_LIGHT, 'utf8');
  const vb = (s) => /viewBox="([^"]+)"/.exec(s)[1];
  assert.equal(vb(dark), vb(light), 'the variants must share a viewBox or they jump when swapped');
  // Same geometry, different colour: identical once the colours are stripped.
  const strip = (s) => s.replace(/#[0-9A-Fa-f]{6}/g, '#');
  assert.equal(strip(dark), strip(light), 'the light variant is not the same artwork as the dark one');
  assert.deepEqual([...new Set(light.match(/#[0-9A-Fa-f]{6}/g))].map((h) => h.toLowerCase()), ['#ffffff'],
    'the light variant must be pure white so it reads on a dark banner');
});

test('the wordmark is words only, not a lockup', () => {
  // A lockup carries the emblem beside the words, which would double up with
  // the orb. A words-only mark is wide; the emblem is square.
  const [, , w, h] = /viewBox="([^"]+)"/.exec(fs.readFileSync(WM_DARK, 'utf8'))[1].trim().split(/[\s,]+/).map(Number);
  assert.ok(w / h > 6, `wordmark aspect is ${(w / h).toFixed(1)}:1 — too square to be words alone`);
});

test('the new art is registered in the asset manifest', () => {
  const manifest = fs.readFileSync(path.join(root, 'assets', 'asset-manifest.json'), 'utf8');
  for (const f of ['NZ-Emblem.svg', 'NZ-wordmark-dark.svg', 'NZ-wordmark-light.svg']) {
    assert.ok(manifest.includes(f), `${f} is not in asset-manifest.json — run npm run assets:build`);
  }
});
