'use strict';

// WHY THIS EXISTS
//
// The baggage belt's bar (.b3-wordmark, the deployed bidsv3 design) drew every
// carrier's lettering 22 units tall. For a one-line wordmark (AIR CANADA,
// porter, WESTJET) that is the height of its letters; Air Inuit's lockup is
// two lines, syllabics over "Air Inuit", so each line came out about half as
// tall as the other carriers' names on the same belt (YUL belt 22, 1920x1080:
// a 22px lockup with 9px lines beside an 18px AIR CANADA).
//
// v24003 reads each file's lines of lettering once, off a canvas, and draws a
// lockup of two lines or more so its tallest line is as tall as the one-line
// slot, at most twice the slot. The rule is the artwork's shape, not a list of
// carriers, so these tests hold:
//   - the rule's own code (_wmLinesK and its helpers, run here) against the rows
//     of EVERY file the belt draws, as the board reads them in Chrome
//     (tests/fixtures/belt-wordmark-rows.json): exactly the two-line lockups
//     grow, and each of their cuts by the same amount;
//   - the shapes it must tell apart (a dot or an ascender is not a line, a
//     stroke between two lines does not join them, wide art is never read);
//   - that the answer is kept per file and written into the next render's
//     markup, so a board does not size a lockup twice;
//   - the CSS: the slot grows by --wm-k only, never past twice the slot, and
//     the bar keeps its height with room for the lockup and the flight number.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'fids-current');
const CORE = fs.readFileSync(path.join(PUB, 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(PUB, 'css', 'display-overrides.css'), 'utf8');
const ROWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'belt-wordmark-rows.json'), 'utf8'));

/** A top-level `function name(...)` in fids-core.js, up to the next one. */
function fnSource(name) {
  const at = CORE.indexOf('\nfunction ' + name + '(');
  assert.ok(at >= 0, `fids-core.js has no function ${name}`);
  const next = CORE.indexOf('\nfunction ', at + 1);
  const seg = CORE.slice(at + 1, next > at ? next : undefined);
  const end = seg.lastIndexOf('\n}');
  assert.ok(end > 0, `no closing brace for ${name}`);
  return seg.slice(0, end + 2);
}
/** A top-level `var NAME = ...;` line in fids-core.js. */
function varSource(name) {
  const m = CORE.match(new RegExp('\\nvar ' + name + ' = [^;\\n]+;'));
  assert.ok(m, `fids-core.js has no var ${name}`);
  return m[0].slice(1);
}

/** The rule, loaded from the board's own source into a sandbox. The canvas
 *  reader is replaced by one that hands back recorded rows and counts reads. */
function loadRule(profiles) {
  const box = { reads: 0, profiles };
  vm.createContext(box);
  vm.runInContext([
    varSource('WM_STACK_MAX_AR'), varSource('WM_STACK_MAX_K'), varSource('_WM_STACK_K'),
    fnSource('_wmArtKey'), fnSource('_wmLinesK'), fnSource('_wmStackAttrs'), fnSource('_wmStackOnLoad'),
    'function _wmLineProfile(img) { reads++; return profiles[_wmArtKey(img.getAttribute("src"))] || null; }',
  ].join('\n'), box);
  return box;
}

const prof = (f) => ({ w: f.w, h: f.h, n: f.n.split(' ').map(Number), s: f.s.split(' ').map(Number) });
const RULE = loadRule({});
const kOf = (f) => (f.n ? RULE._wmLinesK(prof(f)) : RULE._wmLinesK({ w: f.w, h: f.h, n: [], s: [] }));

// The two-line lockups the belt draws, and the multiplier each gets: the
// art's height over its tallest line, never more than 2.
const STACKED = {
  '3H': 2,       // Air Inuit: syllabics over "Air Inuit", lines 41 and 41 rows of 100
  'AA2': 2,      // the American Airlines lockup, "American" over "Airlines"
  '4Y': 2,       // "discover." over "airlines"
  '8P': 2,       // Pacific Coastal: the script over a small AIRLINES
  'AZ': 1.724,   // ITA over AIRWAYS
  'QR': 1.493,   // QATAR over AIRWAYS and the Arabic
  'G3': 1.299,   // GOL over its line
};
const stackedCode = (f) => f.codes.find((c) => Object.prototype.hasOwnProperty.call(STACKED, c));

test('the fixture is the belt\'s catalogue: every file on disk, both cuts, compact art with its rows', () => {
  assert.ok(ROWS.files.length >= 140, 'every wordmark file the belt can draw (' + ROWS.files.length + ')');
  for (const f of ROWS.files) {
    assert.ok(fs.existsSync(path.join(PUB, f.file)), f.file + ' is on disk');
    assert.equal(f.h, 100, f.file + ': read 100 rows tall');
    if (f.w / f.h < 4) {
      assert.ok(f.n && f.s, f.file + ': compact art carries its rows');
      assert.equal(f.n.split(' ').length, 100);
      assert.equal(f.s.split(' ').length, 100);
    }
  }
  for (const code of Object.keys(STACKED)) {
    assert.equal(ROWS.files.filter((f) => f.codes.includes(code)).length, 2, code + ': the light and the dark cut');
  }
});

test('exactly the two-line lockups grow; every one-line wordmark keeps the slot', () => {
  const grown = [];
  for (const f of ROWS.files) {
    const k = kOf(f);
    const code = stackedCode(f);
    if (code) {
      assert.ok(Math.abs(k - STACKED[code]) < 0.002, `${f.file} (${code}): ${k.toFixed(3)}, expected ${STACKED[code]}`);
      grown.push(code);
    } else {
      assert.equal(k, 1, `${f.file} (${f.codes.join(',')}) is one line of lettering and keeps the 22-unit slot, got ${k}`);
    }
  }
  assert.deepEqual([...new Set(grown)].sort(), Object.keys(STACKED).sort());
});

test('the shape alone could not decide: one-line art as compact as the lockups stays at the slot', () => {
  // flair and LOT sit between ITA Airways and the American Airlines lockup in
  // aspect; chair has a band of ascenders over its letters; North Star's
  // roundel puts arcs above and below its name; helvetic has a small "airways"
  // tag under one line; Wasaya has its syllabics over one line, narrow.
  const byCode = (c) => ROWS.files.filter((f) => f.codes.includes(c));
  for (const c of ['F8', 'LO', 'GM', 'NSA', '2L', 'WT', 'VB', 'SK', 'PD', 'B6', 'NK', 'QK']) {
    const fs_ = byCode(c);
    assert.ok(fs_.length, c + ' is on the belt');
    for (const f of fs_) {
      assert.ok(f.w / f.h < 4, f.file + ' is compact art, so it was read');
      assert.equal(kOf(f), 1, f.file + ' is one line');
    }
  }
  const ar = (c) => byCode(c)[0].w / byCode(c)[0].h;
  assert.ok(ar('AZ') < ar('F8') && ar('LO') < ar('AA2'), 'flair and LOT lie between two lockups by shape');
});

test('Air Inuit: each line is drawn about as tall as a one-line wordmark, inside the bar', () => {
  const f = ROWS.files.find((x) => x.codes.includes('3H') && /monochrome-white/.test(x.file));
  const k = kOf(f);
  // the lines are 41 rows of 100: at 22 units each was 9; now 18, beside
  // AIR CANADA's 18 (its 11:1 lettering held to the 200-unit width)
  const line = 22 * k * 41 / 100;
  assert.ok(line >= 17.5 && line <= 22, `each line ${line.toFixed(1)} units`);
  assert.ok(22 * 41 / 100 < 10, 'it was under 10 units at the one-line slot');
});

test('the gaps and lines are what the comment says', () => {
  const H = 100, W = 200;
  const mk = (rows) => { const n = [], s = []; for (let y = 0; y < H; y++) { const r = rows(y) || [0, 0]; n.push(r[0]); s.push(r[1]); } return { w: W, h: H, n, s }; };
  // two equal lines with a clear gap between them: each 40 rows -> 100/40 = 2.5, held to 2
  assert.equal(RULE._wmLinesK(mk((y) => (y >= 5 && y < 45) || (y >= 55 && y < 95) ? [100, 180] : null)), 2);
  // a tall line over a short one: 100/60
  assert.ok(Math.abs(RULE._wmLinesK(mk((y) => (y < 60 ? [120, 190] : y >= 70 && y < 90 ? [70, 150] : null))) - 100 / 60) < 1e-9);
  // the lines joined by ONE narrow stroke (Qatar): still two lines
  assert.ok(RULE._wmLinesK(mk((y) => (y < 60 ? [120, 190] : y < 66 ? [10, 12] : y < 90 ? [70, 150] : null))) > 1);
  // an ascender band (two thin stems far apart, 6% of a row) over one line: one line
  assert.equal(RULE._wmLinesK(mk((y) => (y < 25 ? [12, 120] : y < 30 ? [4, 4] : [130, 196]))), 1);
  // stems running down from tall capitals into the line (a wide, sparse band):
  // not a gap, so one band and one line
  assert.equal(RULE._wmLinesK(mk((y) => (y < 15 ? [40, 150] : y < 25 ? [16, 150] : [120, 196]))), 1);
  // a second band shorter than 8% of the art is not a line
  assert.equal(RULE._wmLinesK(mk((y) => (y < 80 ? [120, 190] : y >= 90 && y < 97 ? [80, 160] : null))), 1);
  // wide art is never read, whatever its rows say (the gate: 4:1)
  const wide = mk((y) => (y >= 5 && y < 45) || (y >= 55 && y < 95) ? [300, 380] : null);
  wide.w = 400;
  assert.equal(RULE._wmLinesK(wide), 1);
  // nothing to read: one line
  assert.equal(RULE._wmLinesK(null), 1);
  assert.equal(RULE._wmLinesK({ w: 0, h: 100, n: [], s: [] }), 1);
});

test('a file is read once; the next render writes its size into the markup', () => {
  const f = ROWS.files.find((x) => x.codes.includes('3H') && /monochrome-white/.test(x.file));
  const one = ROWS.files.find((x) => x.codes.includes('PD') && /light/.test(x.file));
  const box = loadRule({ [f.file]: prof(f), [one.file]: prof(one) });
  const img = (src) => {
    const cls = new Set(), st = {};
    return { cls, st, getAttribute: () => src,
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) },
      style: { setProperty: (p, v) => { st[p] = v; }, removeProperty: (p) => { delete st[p]; } } };
  };
  // before the file is read: the one-line slot, nothing in the markup
  assert.deepEqual({ ...box._wmStackAttrs(f.file + '?v=v24003') }, { cls: '', style: '' });
  const a = img(f.file + '?v=v24003');
  box._wmStackOnLoad(a);
  assert.equal(box.reads, 1);
  assert.ok(a.cls.has('wm-stacked'));
  assert.equal(a.st['--wm-k'], '2.000');
  // the same file again (another row, another render, another build tag): no second read
  const b = img(f.file + '?v=v24004');
  box._wmStackOnLoad(b);
  assert.equal(box.reads, 1);
  assert.equal(b.st['--wm-k'], '2.000');
  assert.deepEqual({ ...box._wmStackAttrs(f.file + '?v=v24004') }, { cls: ' wm-stacked', style: ' style="--wm-k:2.000"' });
  // a one-line wordmark is read once and left alone
  const c = img(one.file + '?v=v24003');
  box._wmStackOnLoad(c);
  assert.equal(box.reads, 2);
  assert.ok(!c.cls.has('wm-stacked'));
  assert.equal(c.st['--wm-k'], undefined);
  assert.deepEqual({ ...box._wmStackAttrs(one.file) }, { cls: '', style: '' });
  // a file that cannot be read is asked again next time, drawn at the slot meanwhile
  const d = img('/logos/elsewhere.svg');
  box._wmStackOnLoad(d);
  box._wmStackOnLoad(d);
  assert.equal(box.reads, 4);
  assert.deepEqual({ ...box._wmStackAttrs('/logos/elsewhere.svg') }, { cls: '', style: '' });
});

test('the canvas reader: wide art is never drawn; compact art is read row by row', () => {
  let made = 0;
  const box = { WM_STACK_MAX_AR: 4 };
  vm.createContext(box);
  // a 4x2 picture of the art at 100 rows: rows 0-49 ink in columns 1..2, rows 50-99 empty
  box.document = { createElement: () => { made++; return { getContext: () => ({
    drawImage() {},
    getImageData: (x, y, w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let r = 0; r < 50; r++) for (const c of [1, 2]) d[(r * w + c) * 4 + 3] = 255; return { data: d }; },
  }) }; } };
  vm.runInContext(fnSource('_wmLineProfile'), box);
  const wide = box._wmLineProfile({ naturalWidth: 1110, naturalHeight: 100 });
  assert.equal(made, 0, 'AIR CANADA\'s 11:1 lettering is answered by its size');
  assert.deepEqual([wide.w, wide.h, wide.n.length], [1110, 100, 0]);
  const p = box._wmLineProfile({ naturalWidth: 200, naturalHeight: 100 });
  assert.equal(made, 1);
  assert.deepEqual([p.w, p.h, p.n[0], p.s[0], p.n[60], p.s[60]], [200, 100, 2, 2, 0, 0]);
  assert.equal(box._wmLineProfile({ naturalWidth: 0, naturalHeight: 0 }), null, 'no size yet: not read');
});

test('the belt bar writes the mark and reads the file on load', () => {
  const at = CORE.indexOf("'<img class=\"b3-wordmark' + _b3Stack.cls + '\"' + _b3Stack.style");
  assert.ok(at > 0, 'the b3 wordmark carries the class and custom property from _wmStackAttrs');
  const tag = CORE.slice(at, CORE.indexOf('\n', at));
  assert.match(tag, /onload="_wmStackOnLoad\(this\)"/);
  assert.match(tag, /src="' \+ _b3Src \+ '"/);
  // the markup and the reader use the one URL
  assert.match(CORE, /const _b3Src = _bWmBase \? wordmarkSrc\(_bWmBase, isDelayed \? 'dark' : 'light'\) : '';\s*\n\s*const _b3Stack = _wmStackAttrs\(_b3Src\);/);
});

test('CSS: the slot grows by --wm-k only, to twice the slot at most, and the bar keeps its height', () => {
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const base = rules.match(/\.bidsv3 \.b3-wordmark \{([^}]*)\}/);
  assert.ok(base, 'the one-line slot');
  assert.match(base[1], /height:\s*calc\(22 \* var\(--b3u, 1px\)\)/);
  const st = rules.match(/\.bidsv3 \.b3-wordmark\.wm-stacked \{([^}]*)\}/);
  assert.ok(st, 'the two-line rule');
  assert.match(st[1], /height:\s*calc\(22 \* var\(--wm-k, 1\) \* var\(--b3u, 1px\)\)/);
  const cap = st[1].match(/max-height:\s*calc\((\d+) \* var\(--b3u, 1px\)\)/);
  assert.ok(cap, 'a ceiling in bar units');
  const maxK = Number(varSource('WM_STACK_MAX_K').match(/= ([\d.]+);/)[1]);
  assert.equal(Number(cap[1]), 22 * maxK, 'the CSS ceiling is the code\'s, twice the slot');
  // no other rule sizes the b3 wordmark
  const sizing = rules.split('}').map((chunk) => chunk.split('{'))
    .filter((p) => p.length >= 2 && /\.b3-wordmark\b/.test(p[p.length - 2]) && /(^|[;\s])(max-)?height\s*:/.test(p[p.length - 1]));
  assert.equal(sizing.length, 2, sizing.map((p) => p[p.length - 2].trim()).join(' | '));
  // the bar: 112 units with its inset rule 9 units in from each edge; the
  // largest lockup and the 40-unit flight number (line-height 1.05) fit inside
  const row = rules.match(/\.bidsv3 \.b3-row \{([^}]*)\}/)[1];
  assert.match(row, /height:\s*calc\(112 \* var\(--b3u, 1px\)\)/, 'the bar keeps its height');
  const off = Number(row.match(/outline-offset:\s*calc\(-(\d+) \* var/)[1]);
  const ow = Number(row.match(/outline:\s*calc\((\d+) \* var/)[1]);
  const num = rules.match(/\.bidsv3 \.b3-num \{([^}]*)\}/)[1];
  const fs40 = Number(num.match(/font-size:\s*calc\((\d+) \* var/)[1]);
  const lh = Number(num.match(/line-height:\s*([\d.]+)/)[1]);
  assert.ok(Number(cap[1]) + fs40 * lh <= 112 - 2 * (off + ow), 'lockup and flight number inside the inset rule');
  // and it is wide enough: a lockup under 4:1 at twice the slot is narrower than the 200-unit cap
  const aspect = Number(varSource('WM_STACK_MAX_AR').match(/= ([\d.]+);/)[1]);
  const maxW = Number(base[1].match(/max-width:\s*calc\((\d+) \* var/)[1]);
  assert.ok(22 * maxK * aspect <= maxW, 'never narrowed by the width cap');
});
