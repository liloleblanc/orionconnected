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

// The captions live in the one store (board-strings.js) as 'heritage:<key>',
// in all nine languages; each record carries its art and facts. en/fr are
// joined back onto the record here so the date checks read as before.
const STORE = require('../fids-current/js/board-strings.js');
function marks() {
  const m = /var HERITAGE_MARKS = (\[[\s\S]*?\n\]);/.exec(SRC);
  assert.ok(m, 'the heritage set must be declared');
  return new Function('return ' + m[1] + ';')().map((mk) => Object.assign({}, mk,
    { en: STORE.bs('heritage:' + mk.key, 'en'), fr: STORE.bs('heritage:' + mk.key, 'fr'), caption: STORE.entry('heritage:' + mk.key) }));
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
  // v23902 — the modern horizontal Air Canada logo is no longer on the Air
  // Nova card: the endorsement there is now the 1987 lockup of the period,
  // supplied as artwork in logos/advertisements/retro-airlines/.
  assert.deepEqual(unused, ['air-canada-1964.svg', 'air-canada-1988.svg', 'air-canada-horizontal.svg'],
    'an unused heritage file must be a recorded decision — if a mark is added ' +
    'to the folder it either gets a checked caption and joins the set, or this ' +
    'list records why it does not');
});

test('no card claims a date its sources disagree on', () => {
  const byKey = Object.fromEntries(marks().map((m) => [m.key, m]));
  // Air Canada: the DC-9 years are checked (1966–2002); the livery's own years
  // are not (start 1977/78 vs 1980, end 1992/93/94), so none is printed.
  for (const k of ['air-canada', 'air-canada-caps']) {
    const acm = byKey[k];
    assert.ok(acm, k + ': the Air Canada DC-9 card exists');
    for (const l of STORE.LANGS) {
      const cap = acm.caption[l];
      assert.match(cap, /DC-9 · 1966–2002$/, 'the checked DC-9 years print, in ' + l);
      assert.doesNotMatch(cap, /19(6[5-9]|7\d|8\d|9[0-4])(?!–2002)/, 'no disputed livery or logo year appears');
    }
    assert.match(acm.fr, /^Montréal/, 'the French caption spells Montréal');
  }
  // Founding year reported as 1985 in one source and 1986 in another.
  for (const l of STORE.LANGS) {
    assert.doesNotMatch(byKey['air-atlantic'].caption[l], /198[56]\s*[–-]/,
      'Air Atlantic must not print a founding year — the sources disagree (' + l + ')');
    assert.match(byKey['air-atlantic'].caption[l], /1998/, 'the ceasing year is solid and is printed (' + l + ')');
  }
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
    for (const l of STORE.LANGS) assert.match(ca.caption[l], /1987–2001/, 'both ends are confirmed, so both print (' + l + ')');
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

test('the board\'s two languages are shown, in the airport\'s own order', () => {
  // It printed English and French whatever the board spoke. Now it is the
  // board's own pair, French first at a French-first airport, one line each.
  const body = renderBody();
  assert.match(body, /var _hLangs = BoardStrings\.pairLangs\(langs, frF\);/, 'the board\'s pair, French first in Québec');
  assert.match(body, /BoardStrings\.bs\(_capKey, lg\)/, 'each line from the store');
  assert.match(body, /if \(!w \|\| _seenL\[w\]\) return;/,
    'a caption identical in both languages must not be printed twice');
  assert.match(body, /BoardStrings\.pair\('heritageKicker'/, 'and the kicker too');
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
  // Bounded at the card's OWN last rule (the last rule naming .hcard, to its
  // closing brace). The file is append-only, and a block appended after the
  // card is not the card: v23973's Later-at-this-gate strip copies the left
  // rail's plate inset and orb size (vh-only clamps) on purpose, so that it
  // lines up with the rail's bottom card.
  const start = CSS.indexOf('v23758 — FROM THE ARCHIVE');
  let lastRule = -1;
  const ruleRe = /\n[^\n{}]*\.hcard[^\n{]*\{/g;
  for (let m = ruleRe.exec(CSS); m; m = ruleRe.exec(CSS)) lastRule = m.index;
  const end = lastRule > start ? CSS.indexOf('\n}', lastRule) : -1;
  const seg = CSS.slice(start, end > start ? end + 2 : undefined);
  const all = seg.match(/clamp\([^()]*(?:\([^()]*\)[^()]*)*\)/g) || [];
  assert.ok(all.length >= 8, `expected the card's clamps, found ${all.length}`);
  const bad = all.filter((c) => c.includes('vh') && !c.includes('vw'));
  assert.deepEqual(bad, [], 'these clamps have no width term: ' + bad.join(', '));
});

test('every card that names its own aeroplane has the file on disk', () => {
  // v23903 — Canadian Airlines' DC-10 is named explicitly (the supplied art
  // lives with the other retro artwork); a missing file would silently drop
  // the whole sky from the card.
  const named = marks().filter((m) => m.aircraft);
  assert.ok(named.some((m) => m.key === 'canadian-airlines'), 'Canadian Airlines names its DC-10');
  // v23912 — Air Canada's DC-9, filed with the heritage aeroplanes and never
  // as the type folder's D9S picture, which stands for every DC-9 on the boards.
  // Two liveries, two cards: the 1987 mark with the AC87 drawing, the
  // capitals mark with the AC80 drawing.
  const byK = Object.fromEntries(named.map((m) => [m.key, m]));
  assert.equal(byK['air-canada'].aircraft, '/aircraft/heritage/air-canada-dc9-ac87.svg');
  assert.match(byK['air-canada'].file, /AC-1987-LOGO\.svg$/);
  assert.equal(byK['air-canada-caps'].aircraft, '/aircraft/heritage/air-canada-dc9-ac80.svg');
  assert.match(byK['air-canada-caps'].file, /air-canada-logo-1965-1987\.png$/);
  for (const k of ['air-canada', 'air-canada-caps']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', byK[k].file.replace(/^\//, ''))), k + ' mark on disk');
  }
  for (const m of named) {
    const p = path.join(ROOT, 'fids-current', m.aircraft.replace(/^\//, ''));
    assert.ok(fs.existsSync(p), `${m.aircraft} is referenced but missing from the tree`);
  }
});

test('a heritage aeroplane drawn as SVG is all shapes, with no picture inside it', () => {
  // Illustrator cannot write some shading into an SVG (a freeform gradient, a
  // gradient mesh, an fx effect), so on export it pastes that part in as a
  // bitmap at the document's raster resolution, 72 ppi by default. The shaded
  // caps-livery DC-9 came out with its engine as a 74 x 30 pixel picture:
  // blurred, with stepped edges, on a card that draws the aeroplane at many
  // times that size. The engine now carries an ordinary linear gradient.
  const dir = path.join(ROOT, 'fids-current', 'aircraft', 'heritage');
  const files = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => path.join(dir, f)));
  for (const m of marks()) {
    if (m.aircraft && /\.svg$/.test(m.aircraft)) files.add(path.join(ROOT, 'fids-current', m.aircraft.replace(/^\//, '')));
  }
  assert.ok(files.size >= 2, 'the Air Canada DC-9 drawings are found');
  for (const f of files) {
    const svg = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(svg, /<image\b/, path.basename(f) + ' has a bitmap pasted into it');
    assert.doesNotMatch(svg, /href\s*=\s*["']data:image\//, path.basename(f) + ' embeds a data: image');
  }
});

test('a shape drawn see-through in a heritage aeroplane has the artboard behind it', () => {
  // A drawing made on a white artboard leans on that white without anyone
  // meaning it to: the caps-livery DC-9's thrust reverser is a 67 % gradient
  // and its intake ring fades to 37 %, both white in the editor and both
  // tinted blue by the card's sky. scripts/heritage-sky/artboard-backing.py
  // puts a white copy of every such shape (and of every enclosed gap) at the
  // bottom of the drawing, in <g id="artboard-backing">. The gaps need a
  // render to find; the shapes can be checked here.
  const dir = path.join(ROOT, 'fids-current', 'aircraft', 'heritage');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    const grads = {};
    for (const m of svg.matchAll(/<(linearGradient|radialGradient)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
      const id = (m[2].match(/\bid="([^"]+)"/) || [])[1];
      const ops = [...String(m[3] || '').matchAll(/stop-opacity="([0-9.eE+-]+)"/g)].map((x) => +x[1]);
      const href = (m[2].match(/href="#([^"]+)"/) || [])[1];
      if (id) grads[id] = { op: ops.length ? Math.min(...ops) : null, href };
    }
    const gmin = (id, n = 0) => {
      const g = grads[id];
      if (!g) return 1;
      if (g.op == null && g.href && n < 8) return gmin(g.href, n + 1);
      return g.op == null ? 1 : g.op;
    };
    const backing = (svg.match(/<g id="artboard-backing">([\s\S]*?)<\/g>/) || [])[1] || '';
    const art = svg.replace(/<g id="artboard-backing">[\s\S]*?<\/g>/, '');
    for (const m of art.matchAll(/<(path|rect|ellipse|circle|polygon)\b[^>]*?\/?>/g)) {
      const t = m[0];
      if (/fill="none"/.test(t)) continue;
      const op = +((t.match(/\sopacity="([0-9.eE+-]+)"/) || [])[1] || 1);
      const fo = +((t.match(/fill-opacity="([0-9.eE+-]+)"/) || [])[1] || 1);
      const fg = (t.match(/fill="url\(#([^)]+)\)"/) || [])[1];
      if (Math.min(op, fo, fg ? gmin(fg) : 1) >= 0.999) continue;
      const d = (t.match(/\sd="([^"]+)"/) || [])[1];
      assert.ok(d && backing.includes('d="' + d + '"'),
        f + ': a see-through shape has nothing behind it but the sky: ' + t.slice(0, 90));
    }
  }
});
