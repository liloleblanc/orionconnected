'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23762 — QATAR'S ORB AND THE RAIL'S BADGE COLUMN.
//
// Three things are held here, because each one silently produces a board that
// looks plausible while being wrong.
//
//   THE ORB MUST NOT GET THE FULL LOCKUP. Qatar's complete mark is the oryx
//   beside a field of grey speed lines. It is drawn for a page; in a 48px disc
//   the lines collapse into a smudge and squeeze the oryx down to something no
//   passenger can identify. Without an emblem entry the resolver falls through
//   to exactly that file, and the failure looks like a slightly busy orb
//   rather than a bug.
//
//   THE ART MUST STAY IN THE TILE FOLDER. The folder IS the treatment: under
//   /logos/airline-tiles/ the orb renders it full-bleed with no filter; under
//   /logos/airlines/<region>/ the same file is flattened to a white silhouette
//   by the white-force filter. Moving it would whiten a real brand mark, which
//   is the one emblem treatment this repo does not allow.
//
//   THE SPEED LINES MUST STAY ON QATAR'S BOARDS. They are Qatar's artwork, not
//   a neutral texture. Unscoped, they would sit behind Air Canada's leaf and
//   Delta's widget on every other gate.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

const TILE = path.join(ROOT, 'fids-current', 'logos', 'airline-tiles', 'QTR.svg');
const LINES = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'asian-other', 'qatar-speedlines.svg');
const LOCKUP = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'asian-other', 'qatar-lockup.svg');

// Qatar's stated brand values — Pantone 229 C and Pantone 430 C. The pair that
// shipped in the supplied artwork (#5c0632 / #747f8a) are eyedropper samples
// off a rendered image and are ~8.5 dE away, which reads as a different colour.
const BURGUNDY = '#662046';
const GREY = '#818A8F';
const SAMPLED = ['#5c0632', '#5C0632', '#747f8a', '#747F8A'];

function emblemTable() {
  const at = SRC.indexOf('AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {');
  assert.ok(at >= 0, 'the emblem table must exist');
  const from = SRC.indexOf('{', at);
  let depth = 0, line = false, block = false, quote = '';
  for (let i = from; i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return new Function('return ' + SRC.slice(from, i + 1) + ';')();
  }
  throw new Error('could not find the end of the emblem table');
}

test('Qatar has an emblem, so the orb never falls through to the full lockup', () => {
  const t = emblemTable();
  assert.ok(t['QR'], "QR has no emblem entry — the orb falls back to the page-sized lockup");
  assert.ok(t['QTR'], 'the ICAO form needs the same entry, or ICAO-coded feeds miss it');
  assert.equal(t['QR'], t['QTR'], 'the two codes must resolve to the same art');
});

test('the orb art sits in the tile folder, which is what keeps it in colour', () => {
  const t = emblemTable();
  assert.match(t['QR'], /^\/logos\/airline-tiles\//,
    'outside airline-tiles the white-force filter flattens it to a silhouette');
  // and prove the folder test that grants the exemption still reads that way
  const at = SRC.indexOf('var isTile');
  assert.ok(at >= 0, '_gateOrbParts must still compute isTile');
  assert.match(SRC.slice(at, at + 260), /\/logos\\\/airline-tiles\\\//,
    'the tile exemption is a path test — if it stops being one, this art is whitened');
});

test('every Qatar asset exists and is square where the orb needs it to be', () => {
  for (const f of [TILE, LINES, LOCKUP]) {
    assert.ok(fs.existsSync(f), path.basename(f) + ' is referenced but missing');
  }
  const vb = /viewBox="([^"]+)"/.exec(fs.readFileSync(TILE, 'utf8'));
  assert.ok(vb, 'the tile needs a viewBox');
  const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
  assert.ok(Math.abs(w - h) < 0.01,
    `the orb crops a circle out of this frame, so it must be square — got ${w} x ${h}`);
});

/**
 * The fill values a file actually paints with.
 *
 * Read the fill attributes rather than searching the file text: each of these
 * SVGs carries a header comment that NAMES the superseded colours, so a plain
 * substring search finds them in prose and fails a correct file. Matching the
 * attribute is also the more honest test — it checks what renders.
 */
function fills(file) {
  const text = fs.readFileSync(file, 'utf8');
  const found = new Set();
  const re = /\sfill="([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) found.add(m[1].trim().toUpperCase());
  return found;
}

test('the artwork carries the guideline colours, not the sampled ones', () => {
  for (const f of [TILE, LINES, LOCKUP]) {
    const painted = fills(f);
    assert.ok(painted.size > 0, path.basename(f) + ' paints nothing');
    for (const bad of SAMPLED) {
      assert.ok(!painted.has(bad.toUpperCase()),
        `${path.basename(f)} still paints ${bad}; Qatar's guideline states ` +
        `${BURGUNDY} (Pantone 229 C) and ${GREY} (Pantone 430 C)`);
    }
  }
  assert.ok(fills(TILE).has(BURGUNDY.toUpperCase()), 'the oryx must be the brand burgundy');
  assert.ok(fills(LINES).has(GREY.toUpperCase()), 'the lines must be the brand grey');
});

test('the speed lines are scoped to Qatar and reach only the disc, not the glyph', () => {
  const at = CSS.indexOf('qatar-speedlines.svg');
  assert.ok(at >= 0, 'the column ground must be applied from the stylesheet');
  const rule = CSS.slice(Math.max(0, at - 400), at + 200);
  assert.match(rule, /\[data-gate-airline="QR"\]/,
    'unscoped, these lines sit behind every other carrier\'s emblem');
  assert.match(rule, /\.v2-fi-icon-wrap/,
    'the ground belongs on the disc wrap');
  assert.doesNotMatch(rule, /\.v2-fi-icon-wrap\s+(img|svg)/,
    'giving it to the inner image would paint the pattern over the glyph');
});

test('the lockup is kept for surfaces with room, and is not what the orb uses', () => {
  // Both marks come from one supplied file, so they cannot drift apart — but
  // the orb must take the cropped one.
  const t = emblemTable();
  assert.ok(!/qatar-lockup/.test(t['QR']), 'the orb must not use the full lockup');
  const lock = fs.readFileSync(LOCKUP, 'utf8');
  assert.ok(lock.includes(BURGUNDY) && lock.includes(GREY),
    'the lockup keeps both brand colours — it is the complete mark');
});
