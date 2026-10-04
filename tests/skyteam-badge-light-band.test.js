'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23942 — THE SKYTEAM BADGE ON THE LIGHT BAND.
//
// Every SkyTeam carrier with its own banner (Air France, Aeromexico, Korean,
// ITA and the rest; Delta and KLM carry SkyTeam inside their lockups) gets an
// alliance badge beside the wordmark. ALLIANCE_LOGOS gave it skyteam-white.png,
// drawn for the near-black banner. Since v23646 every banner is a LIGHT band,
// a pale tint of the carrier's own colour, so the badge was white on pale grey
// and could hardly be seen on the Air France gate.
//
// The fix swaps in the official colour mark on a light band. The colour file
// is the repo's own skyteam.svg with its white background square removed and
// nothing else changed, so no artwork is invented: this file holds that, and
// that the swap actually reaches the banner.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const ALLIANCES = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'alliances');
const BG_SQUARE = '<path fill="#fff" d="M0 0h192.756v192.756H0V0z"/>';

/** Brace-matched slice from the first '{' after `decl`, comment and string aware. */
function block(decl) {
  const at = SRC.indexOf(decl);
  assert.ok(at >= 0, decl + ' must exist in fids-core.js');
  const from = SRC.indexOf('{', at);
  let depth = 0, line = false, blk = false, quote = '';
  for (let i = from; i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { blk = true; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { at, from, to: i + 1, text: SRC.slice(at, i + 1) };
  }
  throw new Error('could not close ' + decl);
}
const table = (decl) => new Function('return ' + SRC.slice(block(decl).from, block(decl).to) + ';')();

function luminance(hex) {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(h.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// The band painter itself, lifted from the source so the test measures the
// band the board really paints.
const silkTint = new Function(block('var _silkTint = function').text.replace(/^var _silkTint = /, 'return ') + ';')();
const ALLIANCE_MAP = table('var ALLIANCE_MAP = {');
const ACCENT = table('const AIRLINE_ACCENT = {');

test('the colour mark is the repo\'s official skyteam.svg minus its background square, nothing else', () => {
  const official = fs.readFileSync(path.join(ALLIANCES, 'skyteam.svg'), 'utf8');
  const colour = fs.readFileSync(path.join(ALLIANCES, 'skyteam-colour.svg'), 'utf8');
  assert.equal(official.split(BG_SQUARE).length, 2, 'skyteam.svg carries exactly one white background square');
  assert.equal(colour, official.replace(BG_SQUARE, ''), 'only the background square may differ');
  assert.ok(!/M0 0h192\.756v192\.756H0V0z/.test(colour), 'no full-canvas ground left in the colour file');
  const fills = [...new Set(colour.match(/fill="#[0-9a-fA-F]{3,6}"/g))];
  assert.deepEqual(fills, ['fill="#234b8d"'], 'one ink, the SkyTeam navy');
});

test('on every SkyTeam carrier\'s band the colour mark reads and the white one does not', () => {
  const skyteam = Object.keys(ALLIANCE_MAP).filter((c) => ALLIANCE_MAP[c] === 'skyteam');
  assert.ok(skyteam.includes('AF'), 'Air France is a SkyTeam carrier in the map');
  for (const code of skyteam) {
    const band = silkTint(ACCENT[code] || '#0c1119', 0.12);   // _silkBase falls back the same way
    assert.ok(contrast('#234b8d', band) >= 4.5, code + ': colour mark on ' + band + ' = ' + contrast('#234b8d', band).toFixed(2));
    assert.ok(contrast('#ffffff', band) < 1.5, code + ': the white mark was ' + contrast('#ffffff', band).toFixed(2) + ':1 on ' + band);
  }
  // The darkest band the tint can paint at all (a black carrier colour) still clears it.
  assert.ok(contrast('#234b8d', silkTint('#000000', 0.12)) >= 4.5);
});

test('the swap reaches the banner, and only on a light band', () => {
  const logos = block('var ALLIANCE_LOGOS = {').text;
  assert.match(logos, /'skyteam':\s*'\/logos\/airlines\/alliances\/skyteam-white\.png'/,
    'the string the swap replaces must still be the one ALLIANCE_LOGOS writes');
  const fn = block('function _skyTeamOnBand(html)').text;
  const run = (key, silk, light, html) =>
    new Function('_allianceKey', '_silkBanner', '_silkLightBand', 'html', fn + '\nreturn _skyTeamOnBand(html);')(key, silk, light, html);
  const img = '<img class="g8-r1-star g8-r1-alliance-skyteam" src="/logos/airlines/alliances/skyteam-white.png">';
  assert.match(run('skyteam', true, true, img), /skyteam-colour\.svg/, 'light band: colour mark');
  assert.match(run('skyteam', true, false, img), /skyteam-white\.png/, 'dark band: the white mark stays');
  assert.match(run('skyteam', false, true, img), /skyteam-white\.png/, 'classic banner: unchanged');
  const star = '<img src="/logos/airlines/alliances/star-3d-tile.jpg">';
  assert.equal(run('star', true, true, star), star, 'other alliances are untouched');
  assert.equal(run('skyteam', true, true, ''), '', 'no badge, nothing to swap');
  // The logo slot hands the badge through the swap.
  assert.match(SRC, /return r1LogoHtml \+ _skyTeamOnBand\(starHtml\);/);
  // Both files are served.
  for (const f of ['skyteam-white.png', 'skyteam-colour.svg']) assert.ok(fs.existsSync(path.join(ALLIANCES, f)), f);
});
