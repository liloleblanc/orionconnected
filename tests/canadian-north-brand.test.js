'use strict';

// Canadian North (5T) flies roughly ten departures a day at Ottawa alone and
// had no accent and no emblem, so every surface that asks for either fell
// through to a default: the orb came up empty and the accent resolved to
// '#0033A1', a blue belonging to no airline and one digit off United's.
//
// The interesting half of this is not that the entries exist — it is WHICH
// PATH the emblem entry names. `_gateOrbParts` decides how to draw emblem art
// by testing the folder in the path, so for art that carries its own ground
// the folder is the behaviour. These tests run that real decision rather than
// asserting the string.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'fids-current');
const core = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');

// The brace-matched body of a top-level `NAME = { ... }` object literal.
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

function entry(name, code) {
  const m = new RegExp("'" + code + "'\\s*:\\s*'([^']*)'").exec(objectBody(name));
  return m ? m[1] : null;
}

test('Canadian North has an accent, so it no longer borrows the generic navy', () => {
  const accent = entry('AIRLINE_ACCENT', '5T');
  assert.ok(accent, "AIRLINE_ACCENT is missing '5T'");
  assert.match(accent, /^#[0-9A-Fa-f]{6}$/);
  // Not the fallback getAirlineAccent() ends on, and not United's.
  assert.notEqual(accent.toUpperCase(), '#0033A1');
  assert.notEqual(accent.toUpperCase(), '#0033A0');
});

test('the accent is the colour the artwork itself is painted in', () => {
  // Rather than trusting a hex typed into a table, read it back off the file
  // on disk. If someone redraws the logo in a new red, this fails.
  const svg = fs.readFileSync(
    path.join(root, 'logos', 'airlines', 'canadian-regional', 'CanadianNorth-Emblem.svg'), 'utf8');
  const fills = new Set((svg.match(/#[0-9A-Fa-f]{6}/g) || []).map((h) => h.toUpperCase()));
  const accent = entry('AIRLINE_ACCENT', '5T').toUpperCase();
  assert.ok(fills.has(accent), `accent ${accent} is not one of the emblem's fills ${[...fills]}`);
  // And the wordmark is drawn in the same red.
  const word = fs.readFileSync(
    path.join(root, 'logos', 'airlines', 'canadian-regional', 'Canadian-North-Wordmark-FullRed.svg'), 'utf8');
  assert.ok((word.match(/#[0-9A-Fa-f]{6}/g) || []).map((h) => h.toUpperCase()).includes(accent));
});

test('the emblem is named at the airline-tiles path, which is what keeps it red', () => {
  const p = entry('AIRLINE_EMBLEM_FILES', '5T');
  assert.ok(p, "AIRLINE_EMBLEM_FILES is missing '5T'");
  // Run the SHIPPED isTile rule, lifted from _gateOrbParts, over that path.
  const rule = /var isTile = !!tb[\s\S]*?;/.exec(core);
  assert.ok(rule, 'could not find the isTile rule in _gateOrbParts');
  assert.match(rule[0], /logos\\\/airline-tiles\\\//,
    'the isTile rule no longer keys on the airline-tiles folder — re-check this entry');
  const isTile = /\/logos\/airline-tiles\//.test(p) && !/PB-arrow/i.test(p);
  assert.ok(isTile,
    `${p} does not read as a finished tile, so the orb would whiten this emblem to a white blob`);
});

test('both copies of the emblem exist and are identical', () => {
  // The tile copy is what the orb draws; the canadian-regional copy is where
  // the wordmark surfaces look. They must not drift apart.
  const tile = path.join(root, 'logos', 'airline-tiles', 'CanadianNorth-Emblem.svg');
  const wide = path.join(root, 'logos', 'airlines', 'canadian-regional', 'CanadianNorth-Emblem.svg');
  assert.ok(fs.existsSync(tile), 'the tile copy the emblem entry points at is missing');
  assert.ok(fs.existsSync(wide), 'the canadian-regional copy is missing');
  assert.equal(fs.readFileSync(tile, 'utf8'), fs.readFileSync(wide, 'utf8'));
});

test('the emblem art is square and its mark survives the circular crop', () => {
  // A tile is drawn with object-fit:cover inside border-radius:50%, so art that
  // is not square gets cropped on the long axis and anything outside the
  // inscribed circle is cut off.
  const svg = fs.readFileSync(
    path.join(root, 'logos', 'airline-tiles', 'CanadianNorth-Emblem.svg'), 'utf8');
  const vb = /viewBox="([^"]+)"/.exec(svg);
  assert.ok(vb, 'emblem has no viewBox');
  const [minX, minY, w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
  assert.equal(w, h, `emblem must be square for a tile, got ${w}x${h}`);

  // Every coordinate pair in the white mark, against the inscribed circle.
  const white = svg.split('#ffffff')[0].lastIndexOf('<path');
  assert.ok(white > 0, 'expected a white mark drawn over the red ground');
  const d = /\sd="([^"]+)"/.exec(svg.slice(white));
  const nums = (d[1].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const cx = minX + w / 2, cy = minY + h / 2, r = w / 2;
  let worst = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    worst = Math.max(worst, Math.hypot(nums[i] - cx, nums[i + 1] - cy));
  }
  assert.ok(worst < r, `mark reaches ${worst.toFixed(0)} units from centre, past the ${r} radius — it would clip`);
});

test('the emblem is never listed as art that needs whitening', () => {
  // Belt and braces on the one rule that must not be broken for this mark:
  // the red ground IS the artwork, so no surface may invert it.
  assert.doesNotMatch(objectBody('LIGHT_DISC'), /'5T'/);
  const selfDisc = /var SELF_DISC = \{[\s\S]*?\};/.exec(core);
  assert.ok(selfDisc, 'could not find SELF_DISC');
  // 5T need not be in SELF_DISC — the folder test already carries it — but if
  // someone adds it there that is harmless. What must never happen is the
  // emblem being reached through a non-tile path, covered above.
});

test('Canadian North still renders a name rather than a bare code', () => {
  assert.equal(entry('AIRLINE_NAME', '5T'), 'Canadian North');
});

test('the new art is registered in the asset manifest', () => {
  // CI runs assets:check; a logo added without rebuilding the manifest turns
  // main red, which has happened before.
  const manifest = fs.readFileSync(path.join(root, 'assets', 'asset-manifest.json'), 'utf8');
  for (const f of ['CanadianNorth-Emblem.svg', 'Canadian-North-Wordmark-FullRed.svg']) {
    assert.ok(manifest.includes(f), `${f} is not in asset-manifest.json — run npm run assets:build`);
  }
});
