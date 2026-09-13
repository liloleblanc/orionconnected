'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23758 — FROM THE ARCHIVE.
//
// /logos/airlines/canadian/heritage/ already existed in the tree and nothing
// had ever rendered it. This is the surface it was waiting for.
//
// The card is an ARCHIVE LABEL, not an advert, and the rules that make it one
// are what this file holds:
//
//   Captions are CHECKED FACTS. It goes out on a public stream, so only
//   carriers whose history could be confirmed are listed, and where sources
//   disagreed the claim was dropped rather than hedged — Air Atlantic's
//   founding year is reported as both 1985 and 1986, so no founding year is
//   printed at all.
//
//   It only appears where it is TRUE. A card for an Atlantic Canada feeder at
//   a European gate is a non sequitur, and reads as a data error.
//
//   The mark is never recoloured. Every file in the set is dark ink drawn for
//   paper, so the card is light by construction — the same rule the gate orbs
//   follow.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

function marks() {
  const m = /var HERITAGE_MARKS = (\[[\s\S]*?\n\]);/.exec(SRC);
  assert.ok(m, 'the heritage set must be declared');
  return new Function('return ' + m[1] + ';')();
}

test('every mark in the set is on disk', () => {
  for (const mk of marks()) {
    const p = path.join(ROOT, 'fids-current', mk.file.replace(/^\//, ''));
    assert.ok(fs.existsSync(p), `${mk.file} is referenced but missing from the tree`);
  }
});

test('every file in the heritage folder is either used or deliberately not', () => {
  // The folder predates this feature and carried two Air Canada marks that
  // nothing rendered. Anything left unused must be a decision, not an
  // oversight — these two are excluded because their filenames assert dates
  // (1964, 1988) that could not be confirmed to the standard the captions
  // are held to. The rondelle's 1964 origin IS well sourced; the 1988 mark
  // is not, and a half-dated pair is worse than none.
  const dir = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'canadian', 'heritage');
  const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  // A file counts as used in EITHER role — as a carrier's own wordmark, or as
  // the partner endorsement riding on one.
  const used = marks()
    .flatMap((m) => [m.file, m.endorsement])
    .filter(Boolean)
    .map((f) => path.basename(f))
    .sort();
  const unused = onDisk.filter((f) => !used.includes(f));
  assert.deepEqual(unused, ['air-canada-1964.svg', 'air-canada-1988.svg'],
    'an unused heritage file must be a recorded decision — if a mark is added ' +
    'to the folder it either gets a checked caption and joins the set, or this ' +
    'list records why it does not');
});

test('no card claims a date its sources disagree on', () => {
  const byKey = Object.fromEntries(marks().map((m) => [m.key, m]));
  // Founding year reported as 1985 in one source and 1986 in another.
  assert.doesNotMatch(byKey['air-atlantic'].en, /198[56]\s*[–-]/,
    'Air Atlantic must not print a founding year — the sources disagree');
  assert.match(byKey['air-atlantic'].en, /1998/, 'the ceasing year is solid and is printed');
  // Canadian Airlines may have a card, but ONLY on its own wordmark. The
  // partner endorsement is the mark a feeder carried, not this carrier's
  // identity, and an earlier version captioned it as the mainline airline.
  const ca = byKey['canadian-airlines'];
  if (ca) {
    assert.match(ca.file, /canadian-airlines\.svg$/,
      'a Canadian Airlines card must use Canadian s OWN wordmark');
    assert.doesNotMatch(ca.file, /partner/i,
      'the partner endorsement must never stand in for the mainline carrier');
    // Formed 27 March 1987; Air Canada subsidiary 1 January 2001.
    assert.match(ca.en, /1987–2001/, 'both ends are confirmed, so both print');
  }
});

// ── it only appears where it is true ───────────────────────────────────────

function picker() {
  const lift = (name) => {
    const at = SRC.indexOf('function ' + name + '(');
    assert.ok(at >= 0, `fids-core.js must define ${name}`);
    let d = 0;
    for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
      if (SRC[k] === '{') d++;
      else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(at, k + 1); }
    }
    throw new Error('unterminated ' + name);
  };
  const set = /var HERITAGE_MARKS = \[[\s\S]*?\n\];/.exec(SRC)[0];
  const AP = { YHZ: { country: 'CA' }, YYT: { country: 'CA' }, YYZ: { country: 'CA' },
               ZRH: { country: 'CH' }, LAX: { country: 'US' }, YQM: { country: 'CA' } };
  const win = {};
  return new Function('AP', 'window',
    set + '\n' + lift('_heritageIsCanadian') + '\n' + lift('_heritagePick')
      + '\nreturn { pick: _heritagePick, isCA: _heritageIsCanadian };')(AP, win);
}

test('a card never appears at an airport the carrier did not serve', () => {
  const { pick } = picker();
  assert.equal(pick('ZRH'), null, 'neither carrier ever served Zurich');
  assert.equal(pick('LAX'), null, 'nor Los Angeles');
  assert.equal(pick(''), null, 'and an unknown airport shows nothing');
});

test('Air Atlantic appears on its own Atlantic network', () => {
  const { pick } = picker();
  for (const ia of ['YYT', 'YHZ', 'YQM']) {
    const seen = new Set();
    for (let i = 0; i < 6; i++) { const m = pick(ia); if (m) seen.add(m.key); }
    assert.ok(seen.has('air-atlantic'), `${ia} was on Air Atlantic's network`);
  }
});

test('the partner endorsement rides on the carrier, not as its own card', () => {
  // canadian-airlines-partner.svg is the bilingual 'Partenaire / Canadian
  // Airlines / Partner' lockup — the mark a FEEDER carried to show whose
  // network it fed. An earlier version of this card used it as a standalone
  // carrier, captioned 'Canadian Airlines · Calgary · 1987–2001', which put a
  // partner endorsement on a public board as if it were the mainline
  // carrier's own logo.
  const all = marks();
  const byK = Object.fromEntries(all.map((m) => [m.key, m]));
  // The endorsement rides on Air Atlantic, which really was a Canadian Partner.
  assert.match(byK['air-atlantic'].endorsement, /canadian-airlines-partner\.svg$/);
  // And it is never a carrier's own mark, for anyone.
  for (const m of all) {
    assert.doesNotMatch(m.file, /canadian-airlines-partner/,
      `${m.key} uses the partner endorsement as its own identity — that lockup ` +
      'is what a feeder carried, not any carrier s own mark');
    if (m.endorsement) assert.notEqual(m.file, m.endorsement, 'distinct roles');
  }
});

test('the endorsement is drawn smaller than the carrier it endorses', () => {
  // Equal billing would state something false about the relationship.
  const grab = (sel) => {
    const at = CSS.indexOf(sel);
    assert.ok(at >= 0, sel + ' must be styled');
    const seg = CSS.slice(at, CSS.indexOf('}', at));
    const m = /max-height:\s*clamp\(\s*(\d+)px/.exec(seg);
    assert.ok(m, sel + ' must cap its height');
    return Number(m[1]);
  };
  assert.ok(grab('.hcard-endorse img') < grab('.hcard-mark'),
    'the endorsement must be visibly subordinate to the wordmark');
});

// ── the label itself ───────────────────────────────────────────────────────

function renderBody() {
  const at = SRC.indexOf('function _renderHeritageCard');
  assert.ok(at >= 0, '_renderHeritageCard must exist');
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(at, k + 1); }
  }
  throw new Error('unterminated');
}

test('the card does not set the carrier name under its own wordmark', () => {
  // Every mark in this set IS a wordmark — it already says the name in the
  // carrier's own lettering. Repeating it underneath in the board's font was
  // redundant the moment it was on screen and competed with the artwork it
  // was meant to introduce.
  const body = renderBody();
  assert.doesNotMatch(body, /hcard-name/,
    'the mark names the carrier; the label carries the facts');
  assert.match(body, /alt="' \+ esc\(mark\.name\)/,
    'the name still rides on alt, for anything that cannot render the image');
});

test('both languages are shown, in the airport s own order', () => {
  const body = renderBody();
  assert.match(body, /frF \? mark\.fr : mark\.en/, 'French first at French-first airports');
  assert.match(body, /frF \? mark\.en : mark\.fr/, 'and the other language under it');
  assert.match(body, /l2 !== l1/,
    'a caption identical in both languages must not be printed twice');
});

test('the card is registered, dispatched and given a dwell', () => {
  assert.match(SRC, /deck\.push\(\{ type: 'heritage' \}\)/, 'registered in the deck');
  assert.match(SRC, /slide\.type === 'heritage'/, 'dispatched at render time');
  assert.match(SRC, /slide\.type === 'heritage'\) return \d+/, 'and given its own dwell');
});

test('the slide skips itself rather than showing an empty slot', () => {
  const at = SRC.indexOf("slide.type === 'heritage'");
  const block = SRC.slice(at, at + 420);
  assert.match(block, /_renderHeritageCard\(el\)\) return;/,
    'a rendered card ends the tick');
  assert.match(block, /slot = \(slot \+ 1\) % totalSlots/,
    'and a card with nothing true to show advances the rotation, the same way ' +
    'the weather slide does, instead of holding a dead slot');
});

// ── the treatment ──────────────────────────────────────────────────────────

test('the artwork is never recoloured', () => {
  assert.match(CSS, /\.hcard-mark\s*\{[^}]*filter:\s*none/,
    'every mark is dark ink drawn for paper — the card is light so the art can ' +
    'be read as drawn, which is the same rule the gate orbs follow');
});

test('every clamp on the card carries a width term', () => {
  // The v23730 house rule: a vh-only clamp sizes off height alone and
  // overflows the moment a board is narrower than the geometry it was tuned on.
  const seg = CSS.slice(CSS.indexOf('v23758 — FROM THE ARCHIVE'));
  const all = seg.match(/clamp\([^()]*(?:\([^()]*\)[^()]*)*\)/g) || [];
  assert.ok(all.length >= 8, `expected the card's clamps, found ${all.length}`);
  const bad = all.filter((c) => c.includes('vh') && !c.includes('vw'));
  assert.deepEqual(bad, [], 'these clamps have no width term: ' + bad.join(', '));
});
