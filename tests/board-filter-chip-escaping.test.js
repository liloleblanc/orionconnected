// ═══════════════════════════════════════════════════════════════════════════
// A SCREEN'S FILTER IS A URL PARAMETER, AND A URL PARAMETER IS NOT MARKUP.
//
// CodeQL js/xss #124 (high) pointed at the BIDS screen template
// (bView.innerHTML = `<div class="bidsv2-screen…`). The path it traced:
//
//   window.location.search
//     → ?terminal= / ?term=        → filterTerminal   (trimmed only)
//     → ?airline=  / ?al=          → filterAirline    (trimmed, upper-cased)
//     → _boardFilterChipHtml()     → the "Terminal 3 · Air Canada" chip
//     → _boardLabelBilingual()     → '<div class="fids-board-label">…'
//     → bView.innerHTML
//
// Real, not a false positive: neither value is reduced to a character class on
// the way in (only ?ap= is — [A-Z0-9]), so ?terminal=<img src=x onerror=…>
// reached innerHTML intact. The same chip is also the FIDS #hdrBoard header,
// which CodeQL did not flag but which is the same string. Upper-casing the
// airline is no defence either: HTML event attributes are case-insensitive and
// a numeric character reference (&#X61; = 'a') spells lower-case script
// through an upper-cased string.
//
// The fix escapes both values with fidsEscHtml at the one place they become
// markup. These tests run the real functions lifted from fids-core.js — the
// URL intake, the chip builder and the label that carries it into both
// templates — against hostile values, and check that the legitimate chip is
// byte-for-byte what it was.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Same slicing rule as feed-html-escaping.test.js: from the header to the first
// closer at the same column. A brace counter walks off the end of this file's
// regex literals.
function slice(header, closer) {
  const at = CORE.indexOf(header);
  assert.ok(at >= 0, header.trim() + ' must still exist');
  const end = CORE.indexOf(closer, at);
  assert.ok(end > at, 'could not find the end of ' + header.trim());
  return CORE.slice(at, end + closer.length);
}
const topFn = (name) => slice('\nfunction ' + name + '(', '\n}');

const SRC = {
  esc: topFn('fidsEscHtml'),
  regionKeys: slice('\nvar _BOARD_REGION_KEY = ', ';\n'),
  chip: topFn('_boardFilterChipHtml'),
  label: topFn('_boardLabelBilingual'),
  // The URL intake runs inside the boot try-block; lift its three filters.
  intake: slice('  var _pTerm = ', '  if (_pReg) filterRegion = _pReg;'),
  airlineNames: slice('\nconst AIRLINE_NAME = {', '\n};'),
};

const REAL_AIRLINE_NAME = new Function(SRC.airlineNames + '\nreturn AIRLINE_NAME;')();

// The board's own words, standing in for fids-v2.js's translation table.
const WORDS = {
  terminal: 'Terminal',
  'f-domestic': 'Domestic',
  'f-transborder': 'Transborder',
  'f-international': 'International',
};

/**
 * Boot the filter chip the way a screen does: parse a query string through the
 * real intake, then build the chip and the baggage label from what it set.
 */
function boot(query, { names = REAL_AIRLINE_NAME, translate = true } = {}) {
  const run = new Function('_initParams', 'AIRLINE_NAME', 'window', 'document', 'LS',
    'let filterTerminal = "", filterAirline = "", filterRegion = "";\n'
    + 'let lang = "en", langs = ["en", "fr"];\n'
    + SRC.esc + '\n' + SRC.regionKeys + '\n' + SRC.chip + '\n' + SRC.label + '\n'
    + SRC.intake + '\n'
    + 'return { chip: _boardFilterChipHtml(), label: _boardLabelBilingual("baggage") };');
  const classes = [];
  return Object.assign(run(
    new URLSearchParams(query),
    names,
    translate ? { fidsT: (k) => WORDS[k] || k } : {},
    { body: { classList: { toggle: (c, on) => classes.push([c, on]) } } },
    { bagClaim: { en: 'Baggage claim', fr: 'Retrait des bagages' } },
  ), { classes });
}

// Everything the chip and label are allowed to emit as markup.
const OWN_TAG = /<\/?span(?: class="(?:fids-board-filter|fbl-en|fbl-fr)")?>/g;

function assertOnlyOwnMarkup(html, payload) {
  const text = html.replace(OWN_TAG, '');
  assert.ok(!/[<>]/.test(text),
    `a tag survived from ${JSON.stringify(payload)}: ${html}`);
  assert.ok(!/["']/.test(text),
    `a quote survived from ${JSON.stringify(payload)}: ${html}`);
  // Every & left is one the escaper wrote, so no character reference in the
  // payload can decode back into markup.
  assert.ok(!/&(?!(?:amp|lt|gt|quot|#39);)/.test(text),
    `a raw & survived from ${JSON.stringify(payload)}: ${html}`);
}

/** What a browser shows for the chip's text — the escapes decoded once. */
function shown(html) {
  const m = /^<span class="fids-board-filter">([^<>]*)<\/span>$/.exec(html);
  assert.ok(m, 'the chip must be exactly one span of text: ' + html);
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '</span><script>alert(document.cookie)</script>',
  '"><svg onload=alert(1)>',
  "' onmouseover='alert(1)",
  // Survives upper-casing: attributes are case-insensitive and the character
  // references spell alert in lower case once the browser decodes them.
  '<IMG SRC=X ONERROR=&#X61;&#X6C;&#X65;&#X72;&#X74;(1)>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
];

// ── hostile values ────────────────────────────────────────────────────────

for (const [param, label] of [['terminal', 'terminal'], ['term', 'terminal (alias)'],
  ['airline', 'airline'], ['al', 'airline (alias)']]) {
  test(`?${param}= cannot put markup into the board-filter chip — ${label}`, () => {
    for (const p of PAYLOADS) {
      const { chip, label: lbl } = boot('?' + param + '=' + encodeURIComponent(p));
      assert.ok(chip, 'a hostile filter is still a filter — the chip must render');
      assertOnlyOwnMarkup(chip, p);
      // …and the same string, carried into both innerHTML templates.
      assertOnlyOwnMarkup(lbl, p);
      assert.ok(lbl.endsWith(chip), 'the label carries the chip verbatim');
    }
  });
}

test('the hostile value is shown as the text it was, not dropped', () => {
  // Escaped, not stripped: a wrong URL on a wall screen should be visible as
  // what it says, so staff can see what the kiosk was given.
  const p = '<img src=x onerror=alert(1)>';
  assert.equal(shown(boot('?terminal=' + encodeURIComponent(p)).chip),
    'Terminal <IMG SRC=X ONERROR=ALERT(1)>');
  assert.equal(shown(boot('?airline=' + encodeURIComponent(p)).chip),
    '<IMG SRC=X ONERROR=ALERT(1)>');
});

test('the untranslated fallback path escapes too', () => {
  // Before fids-v2.js has loaded there is no fidsT; the chip still renders.
  for (const p of PAYLOADS) {
    const { chip } = boot('?terminal=' + encodeURIComponent(p) + '&airline='
      + encodeURIComponent(p), { translate: false });
    assertOnlyOwnMarkup(chip, p);
  }
});

test('a region that is not one of the three is never rendered at all', () => {
  const { chip, classes } = boot('?region=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
  assert.equal(chip, '');
  assert.deepEqual(classes.at(-1), ['has-board-filter', false]);
});

// ── legitimate values: the chip is exactly what it was ────────────────────

test('real filters render byte-for-byte as before', () => {
  const chipOf = (q, opt) => boot(q, opt).chip;
  assert.equal(chipOf(''), '');
  assert.equal(chipOf('?terminal=3'), '<span class="fids-board-filter">Terminal 3</span>');
  assert.equal(chipOf('?terminal=t3'), '<span class="fids-board-filter">Terminal 3</span>');
  assert.equal(chipOf('?term=%20B%20'), '<span class="fids-board-filter">Terminal B</span>');
  assert.equal(chipOf('?airline=ac'), '<span class="fids-board-filter">AIR CANADA</span>');
  assert.equal(chipOf('?al=WS'), '<span class="fids-board-filter">WESTJET</span>');
  assert.equal(chipOf('?airline=ZZ'), '<span class="fids-board-filter">ZZ</span>');
  assert.equal(chipOf('?region=dom,trans'),
    '<span class="fids-board-filter">Domestic · Transborder</span>');
  assert.equal(chipOf('?terminal=1&region=intl&airline=AC'),
    '<span class="fids-board-filter">Terminal 1 · International · AIR CANADA</span>');
  assert.equal(boot('?terminal=1').label,
    '<span class="fbl-en">Baggage claim</span><span class="fbl-fr">Retrait des bagages</span>'
    + '<span class="fids-board-filter">Terminal 1</span>');
});

test('no carrier name on the board changes under the escape', () => {
  // The chip shows AIRLINE_NAME[code] for a known carrier. Escaping it is only
  // invisible if no name carries a character the escaper rewrites — check the
  // whole table, plus the heritage names that are written into it at runtime.
  const heritage = [...slice('\nvar HERITAGE_CARRIERS = {', '\n};').matchAll(/name:\s*'([^']*)'/g)]
    .map((m) => m[1]);
  assert.ok(heritage.length >= 3, 'the heritage carriers must still carry names');
  const names = Object.values(REAL_AIRLINE_NAME).concat(heritage);
  assert.ok(names.length > 100, 'the airline name table must still be found');
  for (const n of names) {
    assert.ok(!/[&<>"']/.test(n), `${n} would render differently once escaped`);
  }
});

// ── the code shape, so a later edit cannot quietly undo it ────────────────

test('both user-supplied chip values pass through fidsEscHtml', () => {
  const body = SRC.chip;
  assert.ok(/fidsEscHtml\(String\(filterTerminal\)/.test(body),
    'the terminal value must be escaped where it joins the chip');
  assert.ok(/fidsEscHtml\(\(typeof AIRLINE_NAME[^)]*\)[^)]*\|\| code\)/.test(body),
    'the airline name-or-code must be escaped where it joins the chip');
});

test('the filter values reach markup only through the chip', () => {
  // Any other line that pairs a filter value with innerHTML or a tag literal is
  // a second sink this file does not cover.
  const chipAt = CORE.indexOf(SRC.chip);
  const outside = CORE.slice(0, chipAt) + CORE.slice(chipAt + SRC.chip.length);
  for (const line of outside.split('\n')) {
    if (!/\bfilter(?:Terminal|Airline)\b/.test(line)) continue;
    assert.ok(!/innerHTML|['"`]\s*<[a-z/]/i.test(line),
      'filter value next to markup outside the chip: ' + line.trim());
  }
});
