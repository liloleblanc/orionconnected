'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23762 — THE WELCOME CARD'S SUB LINE.
//
// The card presents the carrier: its emblem, then its name beneath. That name
// used to be TYPED in the board font for all but two airlines, so a passenger
// saw a real leaf above a lettering approximation below. It now draws the
// carrier's own wordmark, resolved through the same pair the rest of the board
// uses — IATA_TO_WORDMARK for the base, wordmarkSrc() for the file.
//
// What is worth holding here is not that the table has entries. It is that the
// paths those entries BUILD actually exist. The base is a slug, the variant is
// appended at runtime, and the directory comes from logoPath() — so no literal
// path for these files appears anywhere in the source, and a grep for a
// missing one finds nothing. That is the shape of bug this file exists to
// catch: a carrier that resolves to a filename nobody ever wrote.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const LOGOS = path.join(ROOT, 'fids-current', 'logos');

/**
 * Pull an object literal out of the source and evaluate it. Brace-matched
 * rather than matched against a closing pattern: these tables carry comments
 * full of braces and apostrophes, and a regex for the end of one lands in the
 * middle of a sentence.
 */
function table(decl) {
  const at = SRC.indexOf(decl);
  assert.ok(at >= 0, decl + ' must exist in fids-core.js');
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
    else if (c === '}' && --depth === 0) {
      return new Function('return ' + SRC.slice(from, i + 1) + ';')();
    }
  }
  throw new Error('could not find the end of ' + decl);
}

const WORDMARK = table('const IATA_TO_WORDMARK = {');
const ICAO = table('var _FB_WM_ICAO = {');
const HAS_NAME = table('var _FB_LOGO_HAS_NAME = {');

/** Every carrier that can reach the Welcome card, with its brand grounds. */
function welcomeCarriers() {
  const at = SRC.indexOf('AIRLINE_BRAND = {');
  assert.ok(at >= 0, 'AIRLINE_BRAND must exist');
  const seg = SRC.slice(at, at + 200000);
  const body = seg.slice(0, seg.search(/\n\s{0,2}\};/));
  const re = /['"]([A-Z0-9]{2,3})['"]\s*:\s*\{([^}]*)\}/g;
  const out = new Map();
  let m;
  while ((m = re.exec(body))) {
    if (!/name\s*:/.test(m[2]) || out.has(m[1])) continue;
    const get = (k) => {
      const x = new RegExp(k + "\\s*:\\s*['\"]([^'\"]+)").exec(m[2]);
      return x ? x[1] : '';
    };
    out.set(m[1], { name: get('name'), bg1: get('bg1'), bg2: get('bg2') });
  }
  return out;
}

/** Find the file wordmarkSrc() would serve for a base, anywhere under logos/. */
function resolve(base, variant) {
  const want = base + '-wordmark-' + variant;
  const hits = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (path.parse(e.name).name === want) hits.push(p);
    }
  })(LOGOS);
  return hits;
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(h.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('a carrier types its name only when it genuinely has no lettering', () => {
  // A carrier falling back to board type is not a bug by itself — some have no
  // logotype in the tree to draw. What IS a bug is a carrier whose artwork sits
  // on disk while the card still sets its name in the board's font, because
  // that looks exactly like a working board until somebody reads one.
  //
  // So this asserts the invariant rather than a frozen list of stragglers: a
  // carrier may be uncovered ONLY if no wordmark file exists for it. Wiring a
  // new one makes the list shrink without failing here; forgetting to wire one
  // that was added fails immediately.
  const carriers = [...welcomeCarriers().keys()].filter((c) => !HAS_NAME[c]);
  const uncovered = carriers.filter((c) => !WORDMARK[c]);
  const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stranded = uncovered.filter((code) => {
    const name = welcomeCarriers().get(code).name;
    // any light-cut wordmark on disk whose slug plausibly names this carrier
    return resolve(slug(name), 'light').length > 0
        || resolve(slug(name).split('-')[0], 'light').length > 0;
  });
  assert.deepEqual(stranded, [],
    'these carriers HAVE wordmark artwork on disk but the card still types ' +
    'their name — the file was added and never registered in IATA_TO_WORDMARK');
  // and coverage must never go backwards
  assert.ok(carriers.length - uncovered.length >= 15,
    `only ${carriers.length - uncovered.length} carriers draw a real wordmark`);
});

test('every wordmark the card can build exists on disk', () => {
  // The path is assembled at runtime — base + variant + a directory chosen by
  // logoPath() — so it appears nowhere in the source as a literal, and a
  // missing file cannot be found by searching for its name.
  const missing = [];
  for (const [code] of welcomeCarriers()) {
    if (HAS_NAME[code]) continue;
    const base = WORDMARK[code];
    if (!base) continue;
    if (!resolve(base, 'light').length) missing.push(`${code} -> ${base}-wordmark-light`);
  }
  assert.deepEqual(missing, [], 'these resolve to files that do not exist');
});

test('each ICAO alias points at a carrier the wordmark table knows', () => {
  // An alias to a code with no wordmark entry is silently useless: the lookup
  // finds nothing and the card drops back to the typed name on exactly those
  // feeds that publish ICAO — a failure visible at some airports and not
  // others, which is the hardest kind to notice.
  const dead = Object.entries(ICAO).filter(([, iata]) => !WORDMARK[iata]);
  assert.deepEqual(dead, [], 'these aliases resolve to no wordmark');
});

test('the light cut is legible on every carrier ground the card paints', () => {
  // The variant is forced to light rather than measured, because this card's
  // ground is the carrier's own brand gradient, not the board's. That is only
  // safe while every one of those gradients is dark.
  const dim = [];
  for (const [code, b] of welcomeCarriers()) {
    if (HAS_NAME[code] || !WORDMARK[code] || !b.bg1) continue;
    for (const bg of [b.bg1, b.bg2]) {
      if (contrast('#ffffff', bg) < 4.5) dim.push(`${code} ${bg}`);
    }
  }
  assert.deepEqual(dim, [],
    'white lettering is forced here — a light ground needs the dark cut instead');
});

test('the carriers whose emblem already says the name get no wordmark', () => {
  // Their welcome mark is a lockup or a logotype, so a wordmark beneath it
  // would set the name a second time.
  const at = SRC.indexOf('subLogo: (function () {');
  assert.ok(at >= 0, 'the sub-logo resolver must exist');
  assert.match(SRC.slice(at, at + 1400), /if \(_FB_LOGO_HAS_NAME\[code\]\) return '';/,
    'the resolver must honour the same rule that empties the typed line');
});

test('the card goes through the shared resolver, not a private table', () => {
  // A second hand-kept table is what this replaced: it drifted to two entries
  // while the board's own map grew past a hundred.
  const at = SRC.indexOf('subLogo: (function () {');
  const body = SRC.slice(at, at + 1400);
  assert.match(body, /wordmarkSrc\(_base, 'light'\)/, 'it must call the shared resolver');
  assert.doesNotMatch(body, /\/logos\//,
    'a literal logo path here means the card has started keeping its own table again');
});
