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
  // Air Canada: the DC-9-32 years are checked (1968–2002; the fleet's 1966 start
  // is the earlier -14s and -15s, not the model drawn). v24015 — each card
  // names the aeroplane and its livery by the year the livery came in (1987
  // dual stripe, 1980 simplified red stripe), not a city; the year a livery
  // went out is disputed (1992/93/94) and never printed.
  // v24082 — and the green-tail livery that followed, by the year it came in:
  // 1993 in Air Canada's own rondelle history (Open Jaw, January 2025) and in
  // Skies Magazine. The supplied mark's filename says 1994; it is not printed.
  const LIVERY = { 'air-canada': '1987', 'air-canada-caps': '1980', 'air-canada-dc9-93': '1993' };
  for (const k of Object.keys(LIVERY)) {
    const acm = byKey[k];
    assert.ok(acm, k + ': the Air Canada DC-9 card exists');
    for (const l of STORE.LANGS) {
      const cap = acm.caption[l];
      assert.match(cap, /DC-9-32 · 1968–2002 · /, 'the model drawn and its checked years print, in ' + l);
      assert.match(cap, new RegExp(LIVERY[k]), 'the livery is named by the year it came in, in ' + l);
      const years = (cap.match(/\b(19|20)\d\d\b/g) || []).filter((y) => y !== '1968' && y !== '2002' && y !== LIVERY[k]);
      assert.deepEqual(years, [], 'no other year (no disputed end of a livery), in ' + l);
      assert.doesNotMatch(cap, /Montr[eé]al|モントリオール|蒙特利尔|مونتريال/, 'no city: the card names the aeroplane, in ' + l);
    }
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
  // Read rule by rule: every rule whose selector names .hcard, wherever it sits.
  // The file is append-only, and a block appended between two of the card's
  // blocks is not the card: v23973's Later-at-this-gate strip copies the left
  // rail's plate inset and orb size (vh-only clamps) on purpose, so that it
  // lines up with the rail's bottom card. (v24015 — the card's credit line was
  // appended after that strip; the old first-to-last slice swept the strip in.)
  const flat = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seg = (flat.match(/[^{}]*\{[^{}]*\}/g) || []).filter((r) => /\.hcard/.test(r.split('{')[0])).join('\n');
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
  // A later drawing of the same 1987 livery (C-FTML, fleet 726) replaced the
  // AC87 SVG as a PNG; the SVG stays on disk.
  assert.equal(byK['air-canada'].aircraft, '/aircraft/heritage/air-canada-dc9-ac87.png');
  assert.match(byK['air-canada'].file, /AC-1987-LOGO\.svg$/);
  // v24077 — the caps card's supplied polished drawing, a PNG too; its SVG is gone.
  assert.equal(byK['air-canada-caps'].aircraft, '/aircraft/heritage/air-canada-dc9-ac80.png');
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current', 'aircraft', 'heritage', 'air-canada-dc9-ac80.svg')),
    'the replaced caps SVG is not left on disk: nothing uses it');
  assert.match(byK['air-canada-caps'].file, /retro-airlines\/ACLOGO-1980-2\.svg$/, 'the 1980 livery carries the 1980 lockup of the supplied family (v24149)');
  // v24082 — the third DC-9 card: the 1993 livery with the 1993 mark.
  assert.equal(byK['air-canada-dc9-93'].aircraft, '/aircraft/heritage/air-canada-dc9-ac93.png');
  assert.match(byK['air-canada-dc9-93'].file, /retro-airlines\/AC-1993-LOGO\.svg$/, 'the 1993 livery carries the 1993 mark');
  for (const k of ['air-canada', 'air-canada-caps', 'air-canada-dc9-93']) {
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
  // v24077 — the caps-livery DC-9 is a PNG now and its SVG is deleted; the 1987
  // drawing's SVG is still on disk, so this keeps checking whatever SVG is left.
  assert.ok(files.size >= 1, 'the heritage SVG drawings are found');
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

test('the 767 card: the capitals livery and mark, a year every source agrees on, and its maker credited', () => {
  // v24015 — the aeroplane is a render of a CC BY 3D model, so the card names
  // the model's maker where the picture is seen, in all nine languages.
  // v24077 — the picture is now a drawing made over that render (its windows,
  // doors, wing and engine sit where the render's do), so the credit stays.
  const byK = Object.fromEntries(marks().map((m) => [m.key, m]));
  const m = byK['air-canada-767'];
  assert.ok(m, 'the 767 card exists');
  assert.equal(m.aircraft, '/aircraft/heritage/air-canada-767.png');
  assert.match(m.file, /retro-airlines\/ACLOGO-1980-2\.svg$/, 'the 1980 livery carries the 1980 mark, as the caps DC-9 card does');
  assert.equal(m.airports, '*CA');
  assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', m.aircraft.replace(/^\//, ''))), 'the picture is on disk');
  for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) {
    const cap = STORE.bs('heritage:air-canada-767', l);
    assert.match(cap, /767-233/, 'the type prints as Air Canada\'s own designation, in ' + l);
    assert.match(cap, /1982–2008/, 'the checked years print, in ' + l);
    assert.doesNotMatch(cap, /Montr[eé]al|モントリオール|蒙特利尔|مونتريال/, 'no city: the card names the aeroplane, in ' + l);
    assert.match(cap, /1980/, 'the livery is named by the year it came in, in ' + l);
    assert.doesNotMatch(cap, /19[67]\d|198[1-17-9]|199\d/, 'and no other year: when it went out the sources disagree, in ' + l);
    const cr = STORE.bs('heritageCredit:air-canada-767', l);
    assert.match(cr, /1883/, 'the maker is named, in ' + l);
    assert.match(cr, /CC BY 4\.0/, 'the licence is named, in ' + l);
  }
  assert.equal(m.credit, true, 'the card asks for its credit line');
  assert.match(SRC, /if \(mark\.credit\) _hLangs\.forEach/, 'the credit is written in the board\'s languages');
  assert.match(SRC, /'<div class="hcard-credit">' \+ _credit\.join\('<br>'\)/, 'and placed on the card');
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'licenses', '3d-models.md')), 'the full notice is filed');
  // only a mark that asks for a credit gets one: the drawn aeroplanes are the supplied artwork
  for (const k of ['air-canada', 'air-canada-caps', 'air-canada-dc9-93', 'canadian-airlines']) assert.ok(!byK[k].credit, k + ' carries no credit line');
});

test('the 1987 767 card: the dual-stripe livery and its mark, the same checked years, and the same credit', () => {
  // v24082 — a second drawing of C-GAUN, in the 1987 livery. It follows the
  // 1980 drawing, which follows the CC BY model, so it names the maker too.
  const byK = Object.fromEntries(marks().map((m) => [m.key, m]));
  const m = byK['air-canada-767-87'];
  assert.ok(m, 'the 1987 767 card exists');
  assert.equal(m.aircraft, '/aircraft/heritage/air-canada-767-ac87.png');
  assert.match(m.file, /AC-1987-LOGO\.svg$/, 'the 1987 livery carries the 1987 mark, as the 1987 DC-9 card does');
  assert.equal(m.airports, '*CA');
  assert.equal(m.credit, true, 'the card asks for its credit line');
  for (const f of [m.aircraft, m.file]) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', f.replace(/^\//, ''))), f + ' is on disk');
  }
  for (const l of STORE.LANGS) {
    const cap = STORE.bs('heritage:air-canada-767-87', l);
    assert.match(cap, /767-233 · 1982–2008 · /, 'the type and its checked years, in ' + l);
    assert.match(cap, /1987/, 'the livery by the year it came in, in ' + l);
    const years = (cap.match(/\b(19|20)\d\d\b/g) || []).filter((y) => !['1982', '2008', '1987'].includes(y));
    assert.deepEqual(years, [], 'no other year, in ' + l);
    const cr = STORE.bs('heritageCredit:air-canada-767-87', l);
    assert.equal(cr, STORE.bs('heritageCredit:air-canada-767', l), 'the same credit as the 1980 card, in ' + l);
  }
  // The two 767s never come up back to back: the rotation runs in set order.
  const keys = marks().map((k) => k.key);
  assert.ok(Math.abs(keys.indexOf('air-canada-767') - keys.indexOf('air-canada-767-87')) > 1, 'the two 767 cards are apart in the rotation');
});

test('the DC-8 card: the -61 drawn, its own checked years, the 1965 livery and the mark it came in with', () => {
  // The drawing is CF-TJU, fleet 861: a DC-8-61 (MSN 45891, delivered 4 October
  // 1967). Its shape agrees: length over fuselage depth 13.59 against the -61's
  // 13.83 (Douglas, MDC K0369, 2.2), 22% too long for the short-body -50.
  const byK = Object.fromEntries(marks().map((m) => [m.key, m]));
  const m = byK['air-canada-dc8'];
  assert.ok(m, 'the DC-8 card exists');
  assert.equal(m.aircraft, '/aircraft/heritage/air-canada-dc8.png');
  assert.match(m.file, /retro-airlines\/ACLOGO-1965\.svg$/, 'the supplied 1965 lockup, black lettering beside the red rondelle (v24149: the one of the supplied family)');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'fids-current', m.file), 'utf8'), /fill="#f[0-9a-f]{5}"|clipPath/, 'its letter counters are holes, not white shapes clipped inside the letters');
  assert.equal(m.airports, '*CA');
  assert.ok(!m.credit, 'a supplied drawing: no credit line');
  for (const f of [m.aircraft, m.file]) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', f.replace(/^\//, ''))), f + ' is on disk');
  }
  for (const l of STORE.LANGS) {
    const cap = STORE.bs('heritage:air-canada-dc8', l);
    assert.match(cap, /DC-8-61 · 1967–1983 · /, 'the model drawn and its checked years, in ' + l);
    assert.match(cap, /1965/, 'the livery by the year it came in, in ' + l);
    const years = (cap.match(/\b(19|20)\d\d\b/g) || []).filter((y) => !['1967', '1983', '1965'].includes(y));
    assert.deepEqual(years, [], 'no other year (not the October 1964 unveiling, not when the livery went out), in ' + l);
    assert.doesNotMatch(cap, /Montr[eé]al|モントリオール|蒙特利尔|مونتريال/, 'no city: the card names the aeroplane, in ' + l);
  }
});

test('the second DC-8 card: the -63 drawn, its own checked years, the 1980 livery and its mark, apart from the 1965 card', () => {
  // v24137 — the supplied drawing is C-FTIV, fleet 877, a DC-8-63 (MSN 46126,
  // delivered 1 April 1970, with Air Canada to April 1983), in the red
  // capitals of 1980. Air Canada took its first -63, CF-TIK, on 16 February
  // 1969 and the stretched DC-8s left passenger service on 23 April 1983.
  const byK = Object.fromEntries(marks().map((m) => [m.key, m]));
  const m = byK['air-canada-dc8-80'];
  assert.ok(m, 'the DC-8-63 card exists');
  assert.equal(m.aircraft, '/aircraft/heritage/air-canada-dc8-ac80.png');
  assert.match(m.file, /retro-airlines\/ACLOGO-1980-2\.svg$/, 'the 1980 livery carries the 1980 mark');
  assert.equal(m.airports, '*CA');
  assert.ok(!m.credit, 'a supplied drawing: no credit line');
  for (const f of [m.aircraft, m.file]) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', f.replace(/^\//, ''))), f + ' is on disk');
  }
  for (const l of STORE.LANGS) {
    const cap = STORE.bs('heritage:air-canada-dc8-80', l);
    assert.match(cap, /DC-8-63 · 1969–1983 · /, 'the model drawn and its checked years, in ' + l);
    assert.match(cap, /1980/, 'the livery by the year it came in, in ' + l);
    const years = (cap.match(/\b(19|20)\d\d\b/g) || []).filter((y) => !['1969', '1983', '1980'].includes(y));
    assert.deepEqual(years, [], 'no other year (not the 1970 delivery of the aeroplane drawn), in ' + l);
    assert.doesNotMatch(cap, /Montr[eé]al|モントリオール|蒙特利尔|مونتريال/, 'no city: the card names the aeroplane, in ' + l);
  }
  // The two DC-8s never come up back to back, in the pools the board runs, the wrap included.
  const apart = (pool, a, b) => { const gap = Math.abs(pool.indexOf(a) - pool.indexOf(b)); return Math.min(gap, pool.length - gap) > 1; };
  for (const ia of ['YHZ', 'YVR']) {
    const pool = marks().filter((mk) => mk.airports === '*CA' || (Array.isArray(mk.airports) && mk.airports.includes(ia))).map((mk) => mk.key);
    assert.ok(pool.includes('air-canada-dc8') && pool.includes('air-canada-dc8-80'), 'both DC-8s run at ' + ia);
    assert.ok(apart(pool, 'air-canada-dc8', 'air-canada-dc8-80'), 'the two DC-8 cards are apart at ' + ia);
  }
});

test('the Future Retro DC-9 card: a real aeroplane in a livery it never wore, said in nine languages, with no years of service', () => {
  // v24147 — a supplied drawing of C-FTMA, fleet 726: a real Air Canada DC-9-32 (MSN 47266, line 352,
  // delivered 27 July 1968, to Cebu Pacific in December 1997) in the livery unveiled on 9 February
  // 2017. Air Canada flew its last DC-9 in January 2002, so no DC-9 wore it: the card is a what-if,
  // and its caption says so where the other cards print the years the type flew.
  const byK = Object.fromEntries(marks().map((m) => [m.key, m]));
  const m = byK['air-canada-dc9-2017'];
  assert.ok(m, 'the Future Retro DC-9 card exists');
  assert.equal(m.aircraft, '/aircraft/heritage/air-canada-dc9-ac17.png', 'named as the other DC-9 drawings are, by the livery year');
  assert.equal(m.name, 'Air Canada');
  assert.equal(m.airports, '*CA', 'Canadian airports only, as its siblings');
  assert.ok(!m.credit, 'a supplied drawing: no credit line');
  assert.ok(!m.endorsement, 'no second mark');
  for (const f of [m.aircraft, m.file]) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', f.replace(/^\//, ''))), f + ' is on disk');
  }
  // The drawing is the working size of the capitals and 1993 DC-9s, and a cut-out (it flies over the sky).
  const png = fs.readFileSync(path.join(ROOT, 'fids-current', m.aircraft.replace(/^\//, '')));
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 2272, 'scaled to the 2272 px of the other DC-9 drawings');
  assert.ok(Math.abs(png.readUInt32BE(16) / png.readUInt32BE(20) - 7710 / 1686) < 0.01, 'at its own proportions: cropped and scaled, never stretched');
  assert.equal(png[25], 6, 'RGBA: the sky shows around the aeroplane');

  // THE MARK is the lockup the live Air Canada boards use today, in the black lettering the 2017
  // scheme paints on the aeroplane. The card is paper, so the white-lettering twin of the dark
  // gate banner would vanish on it; no new file is made and nothing is recoloured.
  assert.equal(m.file, '/logos/airlines/canadian/air-canada.svg');
  assert.match(SRC, /var LOCAL_LOGOS = \{[\s\S]{0,400}?'AC': '\/logos\/airlines\/canadian\/air-canada\.svg'/, 'the file the live boards map AC to');
  assert.match(SRC, /'AC': '\/logos\/airlines\/canadian\/air-canada-white\.svg'/, 'whose white-lettering twin stays on the dark banner');
  const svg = fs.readFileSync(path.join(ROOT, 'fids-current', m.file.replace(/^\//, '')), 'utf8');
  assert.doesNotMatch(svg, /fill\s*[:=]\s*["']?\s*(#fff\b|#ffffff\b|white\b)/i, 'no white lettering and no white plate on the paper card');
  assert.doesNotMatch(svg, /<image\b/, 'all shapes: no picture inside it');
  assert.equal((svg.match(/<(?:path|rect|polygon)\b(?![^>]*\bclass=)(?![^>]*\bfill=)[^>]*>/g) || []).length, 9, 'nine letters with no fill of their own, so they are drawn black: AIR CANADA');
  assert.match(svg, /fill:#D82F2E/, 'the red rondelle');
  assert.match(CSS, /\.hcard-wrap \{[^}]*background: linear-gradient\(180deg, #F6F3EC 0%, #EFEAE0 100%\)/, 'the card ground is still the warm paper the black lettering is chosen for');

  // THE CAPTION: the type, what it is, the livery by the year it came in. Three parts, as the pattern.
  const WHAT_IF = { en: 'Future Retro what-if', fr: 'et si…', es: '¿y si…?', de: 'Fiktion', it: 'e se…', pt: 'e se…', ja: 'もしも', zh: '假想', ar: 'ماذا لو' };
  assert.deepEqual(Object.keys(WHAT_IF).sort(), STORE.LANGS.slice().sort(), 'all nine board languages');
  const sib = STORE.entry('heritage:air-canada-dc9-93');
  const seen = new Set();
  for (const l of STORE.LANGS) {
    const cap = STORE.bs('heritage:air-canada-dc9-2017', l);
    assert.ok(cap, 'a caption in ' + l);
    const parts = cap.split(' · ');
    assert.equal(parts.length, 3, 'type · what it is · livery, in ' + l);
    assert.equal(parts[0], sib[l].split(' · ')[0], 'the type as the other DC-9 cards name it, in ' + l);
    assert.match(parts[0], /DC-9-32$/, 'the model drawn, in ' + l);
    assert.equal(parts[1], WHAT_IF[l], 'it says it is a what-if, in ' + l);
    assert.equal(parts[2], sib[l].split(' · ')[2].replace('1993', '2017'), 'the livery in the words of the other cards, by the year it came in, in ' + l);
    const years = (cap.match(/\b(19|20)\d\d\b/g) || []).filter((y) => y !== '2017');
    assert.deepEqual(years, [], 'no years of service (not 1968–2002: it never flew in this livery), in ' + l);
    assert.doesNotMatch(cap, /\d–\d/, 'no year range at all, in ' + l);
    if (l !== 'en') assert.doesNotMatch(cap, /Future|Retro|what-if/i, 'the idea in its own words, not the English name, in ' + l);
    assert.doesNotMatch(cap, /Montr[eé]al|モントリオール|蒙特利尔|مونتريال/, 'no city: the card names the aeroplane, in ' + l);
    seen.add(cap);
  }
  assert.equal(seen.size, STORE.LANGS.length, 'nine different lines: none left in another language');
});

test('the Future Retro DC-9 is three cards or more from every other DC-9, and only on Air Canada pages', () => {
  // The board rotates each airport pool in set order and wraps. Four DC-9s in one deck would
  // read as one aeroplane on repeat if they came close together, so the what-if sits three or
  // more cards from each of the three real ones, the wrap included, in both pools the board
  // runs: the Atlantic network (with Air Atlantic and Air Nova) and any other Canadian airport.
  const keys = marks().map((k) => k.key);
  const dc9s = ['air-canada', 'air-canada-caps', 'air-canada-dc9-93'];
  assert.ok(keys.indexOf('air-canada-dc9-2017') > Math.max(...dc9s.map((k) => keys.indexOf(k))), 'after the last real DC-9 in the deck');
  const dist = (pool, a, b) => { const gap = Math.abs(pool.indexOf(a) - pool.indexOf(b)); return Math.min(gap, pool.length - gap); };
  for (const ia of ['YHZ', 'YVR']) {
    const pool = marks().filter((mk) => mk.airports === '*CA' || (Array.isArray(mk.airports) && mk.airports.includes(ia))).map((mk) => mk.key);
    assert.ok(pool.includes('air-canada-dc9-2017'), 'the card runs at ' + ia);
    for (const k of dc9s) {
      assert.ok(pool.includes(k), k + ' runs at ' + ia);
      assert.ok(dist(pool, 'air-canada-dc9-2017', k) >= 3, 'three or more cards from ' + k + ' at ' + ia + ' (it is ' + dist(pool, 'air-canada-dc9-2017', k) + ')');
    }
    // and it disturbs none of the pairs already kept apart
    for (const [a, b] of [['air-canada-dc8', 'air-canada-dc8-80'], ['air-canada-767', 'air-canada-767-87'], ['air-canada-l1011-87', 'air-canada-l1011-93']]) {
      assert.ok(dist(pool, a, b) > 1, a + ' and ' + b + ' are still apart at ' + ia);
    }
  }
  assert.equal(keys[keys.length - 1], 'air-canada-l1011-93', 'the 1993 TriStar is still last, as its own note asks');

  // Only on Air Canada pages, like its siblings: an Air Canada gate reaches it in one turn of the
  // deck and draws the what-if caption under the live lockup; a WestJet gate never draws anything.
  const g = gate({ flight: 'AC659', airline: 'AC' }, { iata: 'YHZ' });
  const el = { innerHTML: '' };
  let card = '';
  for (let i = 0; i < keys.length && !card; i++) {
    el.innerHTML = '';
    assert.equal(g.render(el), true);
    if (el.innerHTML.includes('/aircraft/heritage/air-canada-dc9-ac17.png')) card = el.innerHTML;
  }
  assert.ok(card, 'the Air Canada gate at Halifax comes to the card within one turn of the deck');
  assert.match(card, /class="hcard-mark" src="\/logos\/airlines\/canadian\/air-canada\.svg" alt="Air Canada"/, 'under the live lockup');
  assert.match(card, /Future Retro what-if · 2017 livery/, 'the English line');
  assert.match(card, /et si… · livrée de 2017/, 'and the French line');
  assert.match(card, /hcard-kicker/, 'with the shared kicker');
  assert.doesNotMatch(card, /hcard-credit"|hcard-endorse/, 'no credit line and no endorsement');
  const ws = gate({ flight: 'WS813', airline: 'WS' }, { iata: 'YHZ' });
  for (let i = 0; i < keys.length; i++) {
    const e2 = { innerHTML: '' };
    assert.equal(ws.render(e2), false, 'a WestJet gate skips the slide every time');
    assert.equal(e2.innerHTML, '');
  }
  assert.equal(gate({ flight: 'AC880', airline: 'AC' }, { iata: 'ZRH' }).render({ innerHTML: '' }), false, 'and an Air Canada gate abroad shows nothing');
});

test('the supplied family of Air Canada marks: three of each scheme, used as supplied', () => {
  // v24149 — a matching set was supplied for the 1965 and the 1980 schemes: the wordmark alone,
  // the rondelle beside the wordmark, the rondelle alone. The lockups are the marks of the cards.
  // They are used as supplied: nothing in them is redrawn or recoloured here.
  const dir = path.join(ROOT, 'fids-current', 'logos', 'advertisements', 'retro-airlines');
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const fills = (s) => (s.match(/fill="#[0-9a-f]{6}"/g) || []);
  const FAMILY = ['AC-RONDELLE-1965.svg', 'ACWORDMARK-1965.svg', 'ACLOGO-1965.svg', 'ACWORDMARK-1980.svg', 'ACLOGO1980.svg', 'ACLOGO-1980-2.svg'];
  for (const f of FAMILY) {
    const s = read(f);
    assert.match(s, /<svg[^>]*viewBox="[^"]+"/, f + ' has a frame');
    assert.doesNotMatch(s, /<script|<image|<style|clipPath|fill="#f[0-9a-f]f[0-9a-f]f[0-9a-f]"/i, f + ': shapes only, no white counters, no clip paths, no style block');
  }
  // the two wordmarks stand in one frame, black in 1965 and red in 1980
  const frame = (s) => /viewBox="([^"]+)"/.exec(s)[1];
  assert.equal(frame(read('ACWORDMARK-1965.svg')), frame(read('ACWORDMARK-1980.svg')), 'one frame for the two wordmarks');
  assert.equal(fills(read('ACWORDMARK-1965.svg')).length, 9);
  assert.equal(fills(read('ACWORDMARK-1980.svg')).length, 9);
  assert.deepEqual([...new Set(fills(read('ACWORDMARK-1965.svg')))], ['fill="#000000"']);
  assert.deepEqual([...new Set(fills(read('ACWORDMARK-1980.svg')))], ['fill="#d31500"']);
  // the lockups on the cards: nine black letters and a red rondelle in 1965, all red in 1980
  const a = read('ACLOGO-1965.svg'), b = read('ACLOGO-1980-2.svg');
  assert.equal(fills(a).filter((x) => x === 'fill="#000000"').length, 9, 'nine black letters on the 1965 lockup');
  assert.equal(fills(a).filter((x) => x !== 'fill="#000000"').length, 1, 'and its one red rondelle');
  assert.equal(fills(b).length, 10, 'the 1980 lockup: the rondelle and nine letters');
  assert.deepEqual([...new Set(fills(b))], ['fill="#d31500"'], 'all in the one red');
  // the lockups of v24137 are still on disk, and no card uses them
  for (const f of ['AC-1965-LOGO.svg', 'AC-1980-LOGO.svg']) {
    assert.ok(fs.existsSync(path.join(dir, f)), f + ' is kept');
    assert.ok(!marks().some((m) => String(m.file).endsWith('/' + f)), f + ' is on no card');
  }
});

test('the two TriStar cards: the long body drawn, its checked years, each livery with its own mark', () => {
  // v24108 — two supplied drawings of Air Canada's long-body Lockheed L-1011:
  // C-FTND, fleet 504, in the 1987 livery it flew in 1989–90 and on its 1994
  // return from the desert, before its repaint (supplied as 508,
  // which never wore it; the fin repainted in v24109) and C-FTNG, fleet 507, in
  // the 1993 livery.
  // Both measure 9.06–9.09 length over fuselage depth against the long body's
  // 9.07 (177 ft 8.5 in over the 19 ft 7 in fuselage); the shorter -500 is
  // 8.38. Air Canada flew the long body from 1973 to the last scheduled flight,
  // AC152 Vancouver–Toronto, on 14 January 1996.
  const byK = Object.fromEntries(marks().map((m) => [m.key, m]));
  const CARDS = {
    'air-canada-l1011-87': { aircraft: '/aircraft/heritage/air-canada-l1011-ac87.png', mark: /retro-airlines\/AC-1987-LOGO\.svg$/, livery: '1987' },
    'air-canada-l1011-93': { aircraft: '/aircraft/heritage/air-canada-l1011-ac93.png', mark: /retro-airlines\/AC-1993-LOGO\.svg$/, livery: '1993' },
  };
  for (const [k, want] of Object.entries(CARDS)) {
    const m = byK[k];
    assert.ok(m, k + ' exists');
    assert.equal(m.aircraft, want.aircraft);
    assert.match(m.file, want.mark, k + ': the livery carries the mark it came in with');
    assert.equal(m.airports, '*CA');
    assert.ok(!m.credit, k + ': a supplied drawing, no credit line');
    for (const f of [m.aircraft, m.file]) {
      assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', f.replace(/^\//, ''))), f + ' is on disk');
    }
    for (const l of STORE.LANGS) {
      const cap = STORE.bs('heritage:' + k, l);
      assert.match(cap, /L-1011/, 'the type, in ' + l);
      assert.match(cap, / · 1973–1996 · /, 'its checked years, in ' + l);
      assert.match(cap, new RegExp(want.livery), 'the livery by the year it came in, in ' + l);
      const years = (cap.match(/\b(19|20)\d\d\b/g) || []).filter((y) => !['1973', '1996', want.livery].includes(y));
      assert.deepEqual(years, [], 'no other year (not the 1990–91 storage, not the 1994 return), in ' + l);
      assert.doesNotMatch(cap, /-100|-150|-500|\b150\b|\b500\b/, 'no sub-model the sources dispute, in ' + l);
    }
  }
  // The board rotates each airport's own pool in set order and wraps, so the
  // gap is measured in the pools the board really runs: the Atlantic
  // network's (with Air Atlantic and Air Nova) and a Canadian airport's
  // outside it. The two TriStars, and the two 767s, never come up back to
  // back, the wrap from last to first included.
  const apart = (pool, a, b) => {
    const gap = Math.abs(pool.indexOf(a) - pool.indexOf(b));
    return Math.min(gap, pool.length - gap) > 1;
  };
  for (const ia of ['YHZ', 'YVR']) {
    const pool = marks().filter((m) => m.airports === '*CA' || (Array.isArray(m.airports) && m.airports.includes(ia))).map((m) => m.key);
    assert.ok(pool.includes('air-canada-l1011-87') && pool.includes('air-canada-l1011-93'), 'both TriStars run at ' + ia);
    assert.ok(apart(pool, 'air-canada-l1011-87', 'air-canada-l1011-93'), 'the two TriStar cards are apart at ' + ia);
    assert.ok(apart(pool, 'air-canada-767', 'air-canada-767-87'), 'the two 767 cards are apart at ' + ia);
  }
});

// ── v24042 — Air Canada gates only ──────────────────────────────────────────
//
// The whole set is Air Canada's history: its own DC-9s and 767, and the
// carriers that came into its family (Air Nova, Canadian Airlines, Air
// Atlantic). Scoped by airport alone it ran on every gate at a Canadian
// airport, so YQM gate 1's WestJet WS813 showed Air Atlantic in the middle of
// a WestJet page. The decision is that these cards belong on Air Canada pages
// only: a gate whose flight is Air Canada, Rouge or Air Canada Express,
// whoever operates it. Everything below runs the shipping functions, lifted
// out of fids-core.js, against the rows the YQM feed actually sends.

function gate(flight, opts = {}) {
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
  const fam = /var HERITAGE_AC_FAMILY = \{[^}]*\};/.exec(SRC);
  assert.ok(fam, 'the Air Canada family must be declared');
  const demo = /var HERITAGE_AC_DEMO = \{[^}]*\};/.exec(SRC);
  assert.ok(demo, 'the family\'s heritage demonstration gates must be declared');
  const AP = { YQM: { country: 'CA' }, YHZ: { country: 'CA' }, YYZ: { country: 'CA' },
               YYT: { country: 'CA' }, YYC: { country: 'CA' }, ZRH: { country: 'CH' } };
  const win = { _gateIata: opts.iata === undefined ? 'YQM' : opts.iata };
  if (flight) {
    // As the gate writes them: both from the same row, in the same pass.
    win._gateCurrentFlight = flight;
    win._gateCurrentAirline = flight.airline || '';
  }
  const doc = { documentElement: { classList: { contains: () => false } } };
  const names = ['_heritageIsCanadian', '_heritageIsAirCanada', '_heritageOnAirCanadaGate',
                 '_heritagePick', '_renderHeritageCard', '_buildGateAdSlideList'];
  // _heritageCode reads ?heritage= off the URL; the stub answers what a
  // heritage demonstration gate's URL would.
  const heritageCode = () => opts.heritage || '';
  return new Function('AP', 'window', 'document', 'getGateAds', '_welcomeCardData', 'BoardStrings', 'langs', '_heritageCode',
    set + '\n' + fam[0] + '\n' + demo[0] + '\n' + names.map(lift).join('\n')
      + '\nreturn { isAC: _heritageIsAirCanada, onAC: _heritageOnAirCanadaGate, render: _renderHeritageCard,'
      + ' deck: function () { return _buildGateAdSlideList().map(function (s) { return s.type; }); } };')(
    AP, win, doc, () => [], (c) => ({ welcome: c }), STORE, ['en', 'fr'], heritageCode);
}

// The YQM departures as the feed sent them on 12 October 2026 (flight,
// airline, operator), plus the Jazz and ICAO shapes other feeds send.
const AIR_CANADA_ROWS = [
  { flight: 'AC659', airline: 'AC' },                         // mainline
  { flight: 'AC1983', airline: 'AC', _opCode: 'RV' },         // Rouge, as YQM sends it
  { flight: 'AC7753', airline: 'AC', _opCode: 'ACEX' },       // Air Canada Express, operator unproven
  { flight: 'AC8790', airline: 'AC', _opCode: 'QK' },         // Express, operated by Jazz
  { flight: 'AC7672', airline: 'AC', _opCode: 'PB' },         // Express, operated by PAL
  { flight: 'QK8790', airline: 'QK' },                        // a feed that sends the operator
  { flight: 'RV1983', airline: 'RV' },
  { flight: 'ACA659', airline: 'ACA' },                       // ICAO designators (EDI-style feeds)
  { flight: 'JZA8790', airline: 'JZA' },
  { flight: 'ROU1983', airline: 'ROU' },
  { flight: 'AC7672', airline: 'PB' }                         // operator in the carrier field, AC number
];
const OTHER_ROWS = [
  { flight: 'WS813', airline: 'WS' },                         // YQM gate 1
  { flight: 'WS3101', airline: 'WS', _opCode: 'WR' },         // WestJet Encore
  { flight: 'PD2382', airline: 'PD' },                        // Porter, YQM gate 3
  { flight: 'PB924', airline: 'PB' },                         // PAL's own flight, YQM gate 2
  { flight: 'F8671', airline: 'F8' },                         // Flair
  { flight: 'TS123', airline: 'TS' },
  { flight: 'ZX7300', airline: 'ZX' },                        // stale 'Air Canada' names, not AC today
  { flight: '9M200', airline: '9M' },
  { flight: '500', airline: '9A' }                            // a demo gate's row, off its demo page
];

test('an Air Canada, Rouge or Air Canada Express gate is an Air Canada page', () => {
  const { isAC } = gate(null);
  for (const f of AIR_CANADA_ROWS) assert.equal(isAC(f), true, `${f.airline} ${f.flight} flies as Air Canada`);
});

test('a WestJet, Porter, PAL, Flair or any other gate is not', () => {
  const { isAC } = gate(null);
  for (const f of OTHER_ROWS) assert.equal(isAC(f), false, `${f.airline} ${f.flight} is not an Air Canada page`);
  assert.equal(isAC(null), false, 'no flight, no page');
  assert.equal(isAC({}), false, 'an empty row is nobody');
});

test('the deck carries the archive card on an Air Canada gate', () => {
  for (const f of AIR_CANADA_ROWS) {
    assert.ok(gate(f).deck().includes('heritage'), `${f.flight} at YQM rotates through the archive`);
  }
});

test('and never on any other gate, the WestJet gate at Moncton included', () => {
  for (const f of OTHER_ROWS) {
    assert.ok(!gate(f).deck().includes('heritage'), `${f.flight} at YQM must not carry the archive card`);
  }
});

test('nor on a board with no gate flight (departures, arrivals, belts)', () => {
  assert.ok(!gate(null).deck().includes('heritage'), 'no gate flight, no archive card');
  assert.ok(!gate(null, { iata: '' }).deck().includes('heritage'));
});

test('the airport scope still holds on top: an Air Canada gate abroad shows nothing untrue', () => {
  assert.ok(!gate({ flight: 'AC880', airline: 'AC' }, { iata: 'ZRH' }).deck().includes('heritage'),
    'no card in the set is true at Zurich');
});

test('the gate asks the row it drew; a row with no carrier qualifies by its number alone', () => {
  assert.equal(gate({ flight: 'AC659', airline: 'AC' }).onAC(), true);
  assert.equal(gate({ flight: 'WS813', airline: 'WS' }).onAC(), false);
  // A refresh that drops the carrier field leaves _gateCurrentAirline blank
  // too (the gate writes it from the same row), so the number is all there is.
  assert.equal(gate({ flight: 'AC659', airline: '' }).onAC(), true, 'an AC number is Air Canada');
  assert.equal(gate({ flight: 'ACA659' }).onAC(), true, 'so is the ICAO form');
  assert.equal(gate({ flight: '659', airline: '' }).onAC(), false, 'a bare number is nobody');
  assert.equal(gate({ flight: 'WS813', airline: '' }).onAC(), false);
  assert.equal(gate(null).onAC(), false, 'no row on the gate, no Air Canada page');
});

test('the heritage demonstration gates are the family\'s own pages and keep the card', () => {
  // heritage.html links these: Air Nova at Halifax, Air Atlantic at St John's,
  // Canadian Airlines at Calgary. Their rows carry the demo code and a bare
  // number, so the PAGE is what qualifies them.
  for (const [code, iata] of [['ANV', 'YHZ'], ['9A', 'YYT'], ['CDX', 'YYC']]) {
    const g = gate({ flight: '500', airline: code }, { heritage: code, iata });
    assert.equal(g.onAC(), true, `gids.html?ap=${iata}&heritage=${code} is an Air Canada family page`);
    assert.ok(g.deck().includes('heritage'), `and its deck carries the archive card`);
    const el = { innerHTML: '' };
    assert.equal(g.render(el), true, `and draws it at ${iata}`);
  }
  assert.ok(gate(null, { heritage: 'ANV', iata: 'YHZ' }).deck().includes('heritage'),
    'between demo flights too, as before');
  // A heritage carrier added later is not family until someone lists it.
  assert.equal(gate({ flight: '500', airline: 'XQ' }, { heritage: 'XQ', iata: 'YHZ' }).onAC(), false);
  assert.ok(!gate({ flight: '500', airline: 'XQ' }, { heritage: 'XQ', iata: 'YHZ' }).deck().includes('heritage'));
});

test('the family\'s demonstration list names only heritage carriers that exist', () => {
  const demo = Object.keys(new Function('return ' + /var HERITAGE_AC_DEMO = (\{[^}]*\});/.exec(SRC)[1])()).sort();
  assert.deepEqual(demo, ['9A', 'ANV', 'CDX']);
  const block = /var HERITAGE_CARRIERS = \{[\s\S]*?\n\};/.exec(SRC);
  assert.ok(block, 'the heritage carriers table exists');
  const carriers = [...block[0].matchAll(/^  '([A-Z0-9]+)': \{/gm)].map((m) => m[1]);
  for (const c of demo) assert.ok(carriers.includes(c), `${c} is a heritage demonstration carrier`);
});

test('a slide left on screen when the gate changes carrier renders nothing', () => {
  // The renderer is the backstop: a WestJet gate cannot draw the card even if
  // a heritage slide reaches it.
  const el = { innerHTML: '' };
  assert.equal(gate({ flight: 'WS813', airline: 'WS' }).render(el), false, 'the WestJet gate skips the slide');
  assert.equal(el.innerHTML, '', 'and draws nothing into the slot');
  const el2 = { innerHTML: '' };
  assert.equal(gate({ flight: 'AC659', airline: 'AC' }).render(el2), true, 'the Air Canada gate draws it');
  assert.match(el2.innerHTML, /hcard-wrap/, 'the archive card itself');
  assert.match(el2.innerHTML, /From the archive/, 'with its kicker');
});

test('the Air Canada family is the codes the board already folds into AC', () => {
  // The rail palette's ALIAS table lists the codes Air Canada reaches a gate
  // under; the archive family must not drift from it. ACEX is the shared
  // Express brand the operator ladder writes when the operator is unproven.
  const fam = Object.keys(new Function('return ' + /var HERITAGE_AC_FAMILY = (\{[^}]*\});/.exec(SRC)[1])()).sort();
  const alias = /var ALIAS = \{([^}]*)\};/.exec(SRC);
  assert.ok(alias, 'the rail palette ALIAS table exists');
  const toAC = [...alias[1].matchAll(/(\w+):\s*'AC'/g)].map((m) => m[1]);
  assert.deepEqual(fam, ['AC', 'ACEX'].concat(toAC).sort());
  assert.match(SRC, /var AC_EXPRESS_OP = 'ACEX';/, 'and ACEX is still the Express brand code');
});

test('a year range on the card is never split across two lines', () => {
  // Under the Later-at-this-gate strip at 1680x1050 the French Air Nova line
  // broke inside '1986–2001' and left '2001' alone on a line of its own.
  const el = { innerHTML: '' };
  const g = gate({ flight: 'AC659', airline: 'AC' });
  let seen = 0;
  for (let i = 0; i < 12; i++) {
    el.innerHTML = '';
    assert.equal(g.render(el), true);
    for (const m of el.innerHTML.matchAll(/\d(.)–(.)\d/g)) {
      seen++;
      assert.equal(m[1], '⁠', 'a word joiner before the dash');
      assert.equal(m[2], '⁠', 'and after it');
    }
  }
  assert.ok(seen > 0, 'the rotation reached a card with a year range');
});
