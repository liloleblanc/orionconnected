'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23769 — FLAT BIDS: COLOURS ONLY, NO PATTERN ART.
//
// The b3 belt panel drew a per-belt artwork behind the numeral, and one of
// those artworks was a finished illustration with its own lettering, which
// was wrong: YYC belt 3 showed "Retrait Bagage" while the DOM underneath was
// rendering the correct "Retrait des bagages". The picture covered the right
// words with the wrong ones, and the right words are what remain when it
// goes.
//
// The fix is one appended CSS block. The things that can rot are the ones
// held here: that it still outranks the v23327 rules it overrides (a short
// selector here is a silent no-op — the way the v23767 title fix first
// shipped), that it really removes every image rather than swapping one for
// another, that it stays scoped to .bidsv3 so no other board changes, and
// that it did not take the correct French down with the artwork.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

const MARK = 'FLAT BIDS: COLOURS ONLY, NO PATTERN ART, FOR NOW.';
const at = CSS.lastIndexOf(MARK);
const BLOCK = at >= 0 ? CSS.slice(at) : '';
// The rules alone. The block's own comment is free to NAME the things the
// rules must not touch, so every "must not contain" check below reads this.
const RULES = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const guards = (sel) => (sel.match(/:not\(#_\)/g) || []).length;
const selectors = () => [...BLOCK.matchAll(/^html[^{]*?(?=\s*[{,])/gm)].map((m) => m[0]);

test('the block exists and is the last word in the file', () => {
  assert.ok(at >= 0, 'the flat-BIDS block must exist');
  // Appended, never spliced: nothing may follow it, or a later rule with
  // equal weight would win by source order.
  assert.doesNotMatch(BLOCK.slice(MARK.length), /^\s*\/\*\s*═+\s*v\d{5}/m,
    'another versioned block was appended after this one — it must stay last');
});

test('every selector outranks the v23327 rules it overrides', () => {
  const sels = selectors();
  assert.ok(sels.length >= 5, `expected the block's selectors, found ${sels.length}`);
  for (const s of sels) {
    assert.ok(guards(s) >= 16, `only ${guards(s)} guards on "${s.slice(0, 60)}…"; the v23327 panel rule carries 14`);
  }
  // and the premise: the rules being overridden really do carry 14
  const v27 = CSS.indexOf('v23327 — BIDS: THE APPROVED DESIGN');
  assert.ok(v27 >= 0, 'the v23327 block this overrides must still exist');
  // v23327 styles the panel more than once — a ×12 grid placement and the
  // ×14 paint rule. The heaviest is the one to beat, and the FIRST match is
  // the light one, which is how this assertion first read 12 and failed.
  const v27Block = CSS.slice(v27, at);
  const panelWeights = [...v27Block.matchAll(/^html[^{]*\.bidsv3 \.bidsv2-carousel-block \{/gm)]
    .map((m) => guards(m[0]));
  assert.ok(panelWeights.length >= 1, 'v23327 must still style the panel');
  assert.equal(Math.max(...panelWeights), 14, 'if v23327 grew heavier this block must grow with it');
});

test('it removes every image rather than swapping one for another', () => {
  assert.doesNotMatch(RULES, /url\(/, 'no url() — the point is no images');
  assert.doesNotMatch(RULES, /--bids-accent-img|--bids-ground-img/,
    'the image vars must not be read; leaving one in place leaves one picture in place');
  // The screen and the panel both get a whole new background, not a patch.
  assert.match(BLOCK, /\.bidsv3\.bidsv2-screen \{\s*background: #eef3f8 !important;/,
    'the ground must be the flat tone the images sat over');
  assert.match(BLOCK, /\.bidsv3 \.bidsv2-carousel-block \{\s*background: #D9696B !important;/,
    "the panel must be the mock's flat salmon — a colour, not a var that could carry an image");
});

test('the belt sign is built to the mock: band, disc, number in the suitcase', () => {
  // The pictogram is a real element the renderer emits, gated on the flag,
  // so the prior design never receives it and the CSS carries no url().
  assert.match(SRC, /var _crslArt = _bidsV3On\s*\?\s*'<img class="bidsv2-carousel-art" src="\/logos\/symbols-utility\/baggage-claim-disc\.svg"/,
    'the renderer must emit the art on the b3 surface only');
  assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', 'logos', 'symbols-utility', 'baggage-claim-disc.svg')),
    'the disc SVG must be on disk');
  // Art and number share one grid cell — that is what puts the number in
  // the suitcase without an offset.
  assert.match(RULES, /\.bidsv2-carousel-art \{[^}]*grid-row: 3 !important;/);
  assert.match(RULES, /\.bidsv2-carousel-number \{[^}]*grid-row: 3 !important;/);
  assert.match(RULES, /\.bidsv2-carousel-number \{[^}]*--crsl-num-cap: 22vh/,
    'the numeral ceiling must come down to fit inside the suitcase, via the var the fitter reads');
  // Both languages in the band, one under the other.
  assert.match(RULES, /\.bidsv2-carousel-label \{[^}]*grid-row: 1 !important;/);
  assert.match(RULES, /\.bidsv2-carousel-block::after \{[^}]*grid-row: 2 !important;/);
  // A single-language board must still be able to drop the FR bar: the
  // display MUST stay routed through --crsl-l2-disp, or every EN/ES airport
  // grows a phantom second line.
  assert.match(RULES, /\.bidsv2-carousel-block::after \{[^}]*display: var\(--crsl-l2-disp, block\) !important;/,
    'the second-language bar must keep honouring --crsl-l2-disp');
  assert.match(RULES, /\[style\*="--crsl-l2-disp:none"\] \.bidsv2-carousel-label \{[^}]*padding-bottom/,
    'and the label must close the band when that bar is gone');
});

test('it is scoped to the b3 surface and nothing else', () => {
  for (const s of selectors()) {
    assert.match(s, /\.bidsv3/, `"${s.slice(0, 60)}…" is not scoped to .bidsv3 — it would reach other boards`);
  }
});

test('the armour comes off with the artwork', () => {
  // On a flat ground an outline is noise. Both the label and the ::after
  // carried a black stroke; the ::after's was NOT !important, so a weaker
  // rule here would beat one and miss the other.
  assert.match(BLOCK, /\.bidsv2-carousel-label,/);
  assert.match(BLOCK, /\.bidsv2-carousel-block::after,/);
  assert.match(BLOCK, /\.bidsv2-carousel-number \{\s*-webkit-text-stroke: 0 !important;\s*text-shadow: none !important;/);
});

test('the correct French is still rendered underneath', () => {
  // The block must not touch the words. They come from LS.bagClaim via
  // --crsl-l2; if that ever reads the wrong string, removing the artwork
  // would expose it rather than fix it.
  assert.match(SRC, /bagClaim:\{ en:'Baggage claim',fr:'Retrait des bagages'/,
    "LS.bagClaim.fr must be 'Retrait des bagages'");
  assert.doesNotMatch(RULES, /content:\s*['"]/, 'the block must not replace the label text');
  // --crsl-l2 carries the WORDS and must not be read here; --crsl-l2-disp is
  // the separate show/hide toggle, which the band layout is required to
  // honour, so it is the one exception.
  assert.doesNotMatch(RULES, /--crsl-l2(?!-disp)/, 'nor reach into the second-language words');
});
