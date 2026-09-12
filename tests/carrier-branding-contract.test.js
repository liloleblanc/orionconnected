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
// EMPTY, and it should stay that way. SWISS used to sit here: SWR.svg was
// the 37.3x27.8 TAILFIN, a red parallelogram, so cover-and-clip left a bite
// out of the orb on a 416-flight carrier. It has been redrawn as a square
// full-bleed tile reusing the official cross path, so every tile-path emblem
// in the repo is now square. Anything appearing in this list is a regression.
const KNOWN_NON_SQUARE = [];
const KNOWN_TEXT_EMBLEM = ['DI'];         // NAX.svg — Arial lettermark
const KNOWN_BROKEN_WORDMARK = [
  '3H:dark', '3H:light', 'BW:dark', 'BW:light', 'JV:dark', 'WL:dark', 'WL:light', 'WT:dark',
];

// ── the tiles reached WITHOUT a path: IATA_TO_TILE_ICAO ────────────────────
// The tests below this block walk AIRLINE_EMBLEM_FILES, which names its files
// outright. But most tile art is reached by CONSTRUCTION — the board builds
// '/logos/airline-tiles/' + IATA_TO_TILE_ICAO[code] + '.svg' at four separate
// call sites, and that map covers 121 carriers against AIRLINE_EMBLEM_FILES'
// 45. Nothing was checking the larger population, and it was hiding exactly
// the kind of defect these tests exist to catch: Condor's tile at 39.83x40.00
// and Emirates' at 503.89x533.33, both non-square, both invisible to a test
// that only reads literal paths.
const TILE_MAP = (() => {
  const b = objectBody('IATA_TO_TILE_ICAO');
  const out = {};
  for (const m of b.matchAll(/'([A-Z0-9]{2})'\s*:\s*'([A-Za-z0-9_-]+)'/g)) out[m[1]] = m[2];
  return out;
})();
const tilePath = (icao) => path.join(root, 'logos', 'airline-tiles', icao + '.svg');

// Live lettermark placeholders: a coloured square with the carrier's code set
// in Arial. Real artwork exists on disk for several of these. Shrink this list,
// never grow it.
//
// AZ and OK left it together, for the same reason in opposite directions: both
// named a lettermark for an airline that no longer flies. AZ now draws
// ITY.svg, because the code belongs to ITA Airways and that artwork was
// already on disk unreferenced; OK has no tile at all, because Czech Airlines
// is filtered out of the feeds entirely.
//
// TO and QZ left it next, and neither needed new artwork invented — only the
// observation that TO is HV and QZ is AK. See the sister-code test below.
const KNOWN_LETTERMARK_TILES = ['BQ', 'D8', 'DY', 'JJ', 'SG', 'X3', 'YP', 'YV'];

test('IATA_TO_TILE_ICAO maps every carrier to a file that exists', () => {
  const missing = Object.entries(TILE_MAP).filter(([, icao]) => !fs.existsSync(tilePath(icao)));
  assert.deepEqual(missing, [], `mapped to files that are not there: ${JSON.stringify(missing)}`);
});

test('every constructed tile is square', () => {
  // Not baselined — this one must stay empty. A non-square tile is scaled with
  // object-fit:cover and clipped to a circle, so any transparent region shows
  // the board through the orb.
  const bad = [];
  for (const [iata, icao] of Object.entries(TILE_MAP)) {
    const vb = viewBox(fs.readFileSync(tilePath(icao), 'utf8'));
    if (vb && Math.abs(vb[2] - vb[3]) > 0.01) bad.push(`${iata}->${icao}.svg ${vb[2]}x${vb[3]}`);
  }
  assert.deepEqual(bad, [], `non-square tiles would show a bite out of the orb:\n${bad.join('\n')}`);
});

test('no MORE constructed tiles are Arial lettermarks than already were', () => {
  const found = [];
  for (const [iata, icao] of Object.entries(TILE_MAP)) {
    if (/<text\b/.test(fs.readFileSync(tilePath(icao), 'utf8'))) found.push(iata);
  }
  assert.deepEqual(found.sort(), [...KNOWN_LETTERMARK_TILES].sort(),
    `the set of lettermark tiles changed.\nfound:    ${found.sort().join(' ')}\nbaseline: ${[...KNOWN_LETTERMARK_TILES].sort().join(' ')}`);
});

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

// ── Carriers that stopped flying ────────────────────────────────────────────
// A dead airline leaves two traces: rows in a feed that has not caught up, and
// entries in these tables pointing at artwork nobody will ever see correctly.
// The repo already has a shape for the first — FILTER_OUT, with the carrier's
// last day in the comment. These tests hold both halves in place.

test('a carrier that no longer flies is filtered out under both its codes', () => {
  // FILTER_OUT is matched against whichever code the feed happens to use, so
  // listing only the IATA form leaves the ICAO rows coming through.
  const m = /const FILTER_OUT = new Set\(\[([\s\S]*?)\]\)/.exec(core);
  assert.ok(m, 'could not find FILTER_OUT');
  const codes = new Set([...m[1].matchAll(/'([A-Z0-9]{2,3})'/g)].map((x) => x[1]));
  for (const [iata, icao, who] of [['NK', 'NKS', 'Spirit'], ['OK', 'CSA', 'Czech Airlines']]) {
    assert.ok(codes.has(iata), `${who} (${iata}) is not filtered out`);
    assert.ok(codes.has(icao), `${who}'s ICAO form ${icao} is not filtered out — feeds that use it still get through`);
  }
});

test('a filtered-out carrier keeps no tile pointer', () => {
  // Belt and braces: a tile mapping for a carrier that can never reach the
  // board is dead weight, and the file it names is a candidate for deletion
  // that nothing will flag while the pointer survives.
  const m = /const FILTER_OUT = new Set\(\[([\s\S]*?)\]\)/.exec(core);
  const filtered = new Set([...m[1].matchAll(/'([A-Z0-9]{2,3})'/g)].map((x) => x[1]));
  const stale = Object.keys(TILE_MAP).filter((iata) => filtered.has(iata));
  assert.deepEqual(stale, [], `these carriers are filtered out but still map to a tile: ${stale.join(' ')}`);
});

test('AZ draws ITA Airways, the airline that actually holds the code', () => {
  // Alitalia stopped flying in October 2021 and ITA Airways took AZ. Both name
  // tables and the ICAO normaliser were already updated; the tile pointer was
  // the last thing still naming the old carrier, and it named a lettermark.
  assert.equal(TILE_MAP['AZ'], 'ITY');
  const svg = fs.readFileSync(tilePath('ITY'), 'utf8');
  assert.doesNotMatch(svg, /<text\b/, 'the ITA tile is drawn art, not a code set in Arial');
  const vb = viewBox(svg);
  assert.ok(vb && Math.abs(vb[2] - vb[3]) < 0.01, `ITA tile must be square, got ${vb && vb[2]}x${vb && vb[3]}`);
  // And the name surfaces agree, so the orb and the row cannot disagree.
  assert.equal(pairs('AIRLINE_NAME')['AZ'], 'ITA');
  assert.ok(!fs.existsSync(tilePath('AZA')), 'the Alitalia lettermark is back on disk');
});

// Carriers that file under two IATA codes. Both tests below walk this list, so
// adding a pair here is enough to protect it.
const SISTERS = [['HV', 'TO', 'Transavia'], ['AK', 'QZ', 'AirAsia']];

test('sister codes of one brand draw one tile', () => {
  // A carrier that files under two IATA codes must not be drawn two ways.
  // Transavia is the case that prompted this: HV (Netherlands) had the real
  // 't' roundel on #00D66C while TO (France) had an Arial 'TO' on #1A9E5F —
  // deltaE 30.6 apart, which is not a shade difference, it is a different
  // green. A passenger seeing both orbs would not read them as one airline.
  //
  // The repo already had the right artwork; nothing was pointing TO at it.
  for (const [a, b, who] of SISTERS) {
    assert.ok(TILE_MAP[a], `${who}: ${a} has no tile`);
    assert.ok(TILE_MAP[b], `${who}: ${b} has no tile`);
    assert.equal(TILE_MAP[a], TILE_MAP[b],
      `${who} draws two different tiles: ${a}->${TILE_MAP[a]}.svg vs ${b}->${TILE_MAP[b]}.svg`);
  }
});

test('a brand drawn under two codes is drawn in one colour', () => {
  // Belt and braces on the above, measured rather than assumed: read the ground
  // fill straight off the shared tile and confirm both codes land on it. This
  // is what actually failed before — the two greens, not the two filenames.
  // Every sister pair, not just the one that prompted the test — an assertion
  // that names one carrier stops protecting the next one added beside it.
  for (const [a, b, who] of SISTERS) {
    const tile = fs.readFileSync(tilePath(TILE_MAP[a]), 'utf8');
    const g = (tile.match(/fill="(#[0-9A-Fa-f]{6})"/i) || [])[1];
    assert.ok(g, `${who}: the shared tile has no ground fill to read`);
    assert.ok(ACCENTS[a] && ACCENTS[b], `${who}: one of ${a}/${b} has no accent`);
    assert.equal(ACCENTS[a].toUpperCase(), ACCENTS[b].toUpperCase(),
      `${who}: ${a} is ${ACCENTS[a]} but ${b} is ${ACCENTS[b]} — one brand, two colours`);
    assert.ok(deltaE(ACCENTS[a], g) < 2,
      `${who}: accent ${ACCENTS[a]} does not match the tile ground ${g}, so orb and rail draw different colours`);
  }

  const [a, b] = ['HV', 'TO'];
  const svg = fs.readFileSync(tilePath(TILE_MAP[a]), 'utf8');
  const ground = (svg.match(/fill="(#[0-9A-Fa-f]{6})"/) || [])[1];
  // The tile, the accent and the wordmark must all be the same green. Three
  // surfaces disagreeing is precisely what this carrier arrived in.
  assert.equal(ground.toUpperCase(), '#05CE78');

  // Neither retired green may come back. '#00D66C' is the real pre-October-2025
  // brand green — a value that was correct for a decade, which is exactly why
  // it would pass an eyeball check; '#1A9E5F' never matched any Transavia era.
  for (const dead of ['#00D66C', '#1A9E5F']) {
    assert.ok(deltaE(ground, dead) > 8, `the tile ground is back on the retired ${dead}`);
    assert.doesNotMatch(svg, new RegExp(dead, 'i'), `${dead} is back in the tile art`);
  }
  // And not the accessible UI green either — that one paints text, not the mark.
  assert.ok(deltaE(ground, '#00AB61') > 8,
    'the tile is painted in Transavia product-green, which is the UI colour, not the mark');
});

test('ITA Airways takes the blue its own design system declares', () => {
  // Held back when the tile was wired: the only value available then was the
  // tile's own ground, and a tile agreeing with itself is the TAP failure mode.
  // ITA publishes a design system, and the value is a declared token in it —
  //   --maui-color-brand-ita-deepblue: #0171cf
  //   --maui-color-brand-primary: var(--maui-color-brand-ita-deepblue)
  // so the airline names both the value and the accent role.
  const accent = ACCENTS['AZ'];
  assert.ok(accent, "AIRLINE_ACCENT is missing 'AZ'");
  assert.equal(accent.toUpperCase(), '#0171CF');
  // Not the fallback a missing entry lands on.
  assert.notEqual(accent.toUpperCase(), '#0033A1');
  // Tile ground and accent agree, so the orb and the rails draw one blue.
  const tile = fs.readFileSync(tilePath(TILE_MAP['AZ']), 'utf8');
  const ground = (tile.match(/fill="(#[0-9A-Fa-f]{6})"/i) || [])[1];
  assert.ok(deltaE(accent, ground) < 1, `accent ${accent} vs tile ground ${ground}`);
});

test('a wordmark pair is two files that differ only in ink', () => {
  // -light is the variant the FIDS table uses on dark rows, so it must be
  // reversed to white; -dark carries the brand colour for light grounds. A
  // pair that is byte-identical means one of them was never re-cut, and the
  // banner would draw dark ink on a dark row — invisible, and silent.
  const dir = path.join(root, 'logos', 'airlines', 'european');
  for (const slug of ['ita-airways', 'transavia']) {
    const lt = fs.readFileSync(path.join(dir, `${slug}-wordmark-light.svg`), 'utf8');
    const dk = fs.readFileSync(path.join(dir, `${slug}-wordmark-dark.svg`), 'utf8');
    assert.notEqual(lt, dk, `${slug}: the two variants are identical`);
    // Same drawing: identical path geometry, so only the fills were changed.
    const geom = (s) => (s.match(/\sd="[^"]+"/g) || []).join('|');
    assert.equal(geom(lt), geom(dk), `${slug}: the pair is not the same artwork`);
    // The light variant carries white ink and no dark ink.
    assert.match(lt, /#FFFFFF/i, `${slug}-wordmark-light.svg has no white ink`);
    // Live <text> renders in the viewer's font — wrong on a signage box.
    assert.doesNotMatch(lt, /<text\b/, `${slug}-wordmark-light.svg contains live text`);
    assert.doesNotMatch(dk, /<text\b/, `${slug}-wordmark-dark.svg contains live text`);
  }
});

// ── the path that actually draws most orbs: /logos/symbols/airlines/ ────────
// _airlineOrbEmblem hands back '/logos/symbols/airlines/<IATA>.svg'
// OPTIMISTICALLY, without checking the file exists, and _orbArtFailed catches
// the 404 and retries through IATA_TO_TILE_ICAO. So a MISSING symbols file is
// the designed route to the tile — but a PRESENT one wins, and the tile is
// never drawn. 54 carriers are in that position.
//
// Usually harmless, because symbol art is inked white on the accent disc. It
// is NOT harmless for a carrier in _CARD_COLOR_EMBLEMS, whose art keeps its
// own colours: then the orb paints the file while every other surface paints
// AIRLINE_ACCENT, and the two can disagree without anything noticing.
//
// Both cases found here were corrections made to the accent that never reached
// the art: TAP's orb held '#72BF44' after the accent moved to '#46A41A'
// (deltaE 12.6), and Condor's held '#FF7E27' after '#F08200' (deltaE 10.9).
// Neither was visible to any test above, because those only walk airline-tiles.
const KEEPS_COLOUR = (() => {
  // Declared as `window._CARD_COLOR_EMBLEMS = {`, not with var/const/let, so
  // objectBody's declaration form does not match it.
  const m = /window\._CARD_COLOR_EMBLEMS\s*=\s*\{/.exec(core);
  assert.ok(m, 'fids-core.js must declare window._CARD_COLOR_EMBLEMS');
  const start = core.indexOf('{', m.index);
  let depth = 0, body = '';
  for (let i = start; i < core.length; i++) {
    if (core[i] === '{') depth++;
    else if (core[i] === '}') { depth--; if (depth === 0) { body = core.slice(start, i + 1); break; } }
  }
  const set = new Set([...body.matchAll(/'([A-Z0-9]{2})'\s*:/g)].map((x) => x[1]));
  assert.ok(set.size > 0, '_CARD_COLOR_EMBLEMS parsed empty — the extractor has drifted');
  return set;
})();

// Pre-existing drift, baselined by name so it cannot grow. NOT fixed here:
// each of these needs its own sourcing pass, and guessing at a replacement is
// the failure this whole file exists to prevent.
//   UA  accent #0033A0 vs art #1414D2 (42.8) — the glossy globe; a style call
//   PC  accent #FDC300 vs art #C30B0B (77.1) — yellow accent, red art. One of
//       the two is simply wrong for Pegasus; which one is unresearched.
//   EI  accent #009A44 vs art #3CB14A (11.2) — two Aer Lingus greens
//   QR  accent #5C0632 vs art #662046 (8.5)  — two Qatar burgundies
//   TK  accent #C8102E vs art #C90019 (11.1) — the accent is the KNOWN
//       placeholder red Turkish shared with Japan Airlines before JAL was
//       corrected away from it. Its own art disagreeing is evidence the
//       placeholder is wrong, but not evidence of what is right.
const KNOWN_ORB_COLOUR_DRIFT = ['EI', 'PC', 'QR', 'TK', 'UA'];

test('colour-keeping orb art agrees with the carrier accent', () => {
  const dir = path.join(root, 'logos', 'symbols', 'airlines');
  const bad = [];
  for (const code of KEEPS_COLOUR) {
    if (KNOWN_ORB_COLOUR_DRIFT.includes(code)) continue;
    const f = path.join(dir, code + '.svg');
    if (!fs.existsSync(f)) continue;              // falls through to the tile
    const accent = ACCENTS[code];
    if (!accent) continue;
    const fills = [...new Set((fs.readFileSync(f, 'utf8').match(/#[0-9A-Fa-f]{6}/g) || []))];
    if (!fills.length) continue;
    // Some marks are legitimately multicolour, so the accent need only match
    // ONE fill — the carrier's own colour must appear somewhere in its art.
    const nearest = fills.map((h) => ({ h, d: deltaE(accent, h) })).sort((a, b) => a.d - b.d)[0];
    if (nearest.d > 8) {
      bad.push(`${code}: accent ${accent} is deltaE ${nearest.d.toFixed(1)} from its nearest art fill ${nearest.h} [${fills.join(' ')}]`);
    }
  }
  assert.deepEqual(bad, [],
    `these carriers keep their orb art's colours, so the orb and the rails draw different colours:\n${bad.join('\n')}`);
});

test('a symbols file that shadows a tile is deliberate, not accidental', () => {
  // Not a failure — 54 carriers are legitimately in this position. The test
  // exists so the COUNT cannot grow silently: adding a symbols file for a
  // carrier that already has a tile silently retires that tile.
  const dir = path.join(root, 'logos', 'symbols', 'airlines');
  const shadowing = fs.readdirSync(dir)
    .filter((f) => /^[A-Z0-9]{2}\.(svg|png)$/.test(f))
    .map((f) => f.replace(/\.(svg|png)$/, ''))
    .filter((c) => TILE_MAP[c]);
  assert.ok(shadowing.length <= 54,
    `${shadowing.length} symbols files now shadow a tile, up from 54. Newly shadowed: ${shadowing.join(' ')}`);
});

test('the baselined orb-colour drift is real, not a stale list', () => {
  // A baseline that no longer describes anything is worse than no baseline —
  // it silently excuses a carrier that has since been fixed. Every name here
  // must still be drifting; when one is corrected, it must leave this list.
  const dir = path.join(root, 'logos', 'symbols', 'airlines');
  const notDrifting = [];
  for (const code of KNOWN_ORB_COLOUR_DRIFT) {
    const f = path.join(dir, code + '.svg');
    if (!fs.existsSync(f) || !ACCENTS[code]) { notDrifting.push(`${code} (no art or no accent)`); continue; }
    const fills = [...new Set((fs.readFileSync(f, 'utf8').match(/#[0-9A-Fa-f]{6}/g) || []))];
    const nearest = Math.min(...fills.map((h) => deltaE(ACCENTS[code], h)));
    if (nearest <= 8) notDrifting.push(`${code} (now only ${nearest.toFixed(1)} — remove it)`);
  }
  assert.deepEqual(notDrifting, [],
    `these are baselined as drifting but no longer are:\n${notDrifting.join('\n')}`);
});
