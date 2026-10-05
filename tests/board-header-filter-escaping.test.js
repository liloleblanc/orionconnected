// ═══════════════════════════════════════════════════════════════════════════
// THE DEPARTURES HEADER SHOWS A SCREEN'S FILTER AS TEXT, NEVER AS MARKUP.
//
// A screen can be filtered to one terminal or one airline from its URL
// (?terminal= / ?term= / ?airline= / ?al=), and the board says so in a chip
// beside its title: "Departures | Départs  Terminal 3 · Air Canada". The
// title and the chip are one string, _boardLabelBilingual(), which render()
// sets as the innerHTML of #hdrBoard (and the baggage board puts in its
// screen template). The two values arrive from the URL trimmed but
// otherwise as written, so ?terminal=<img src=x onerror=…> was live markup
// in the header (CodeQL js/xss). They are escaped where they join the chip.
//
// These tests run the real functions lifted from fids-core.js (the URL
// intake, the chip, the bilingual title) with the real language store, and
// check that a hostile value is shown as the text it was, and that a real
// filter reads exactly as before.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BS = require('../fids-current/js/board-strings.js');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// From the header to the first closer after it (a top-level function ends at
// the first "\n}"; the intake at its last line).
function slice(header, closer) {
  const at = CORE.indexOf(header);
  assert.ok(at >= 0, header.trim() + ' must still exist');
  const end = CORE.indexOf(closer, at);
  assert.ok(end > at, 'could not find the end of ' + header.trim());
  return CORE.slice(at, end + closer.length);
}
const topFn = (name) => slice('\nfunction ' + name + '(', '\n}');

const SRC = [
  topFn('fidsEscHtml'),
  slice('\nvar _BOARD_REGION_KEY = ', ';\n'),
  topFn('_boardFilterChipHtml'),
  topFn('_boardLabelBilingual'),
].join('\n');
const INTAKE = slice('  var _pTerm = ', '  if (_pReg) filterRegion = _pReg;');

// The board's own words for the title and the chip.
const LS = {
  dep: { en: 'Departures', fr: 'Départs', ar: 'المغادرة' },
  arr: { en: 'Arrivals', fr: 'Arrivées', ar: 'الوصول' },
  bagClaim: { en: 'Baggage claim', fr: 'Retrait des bagages', ar: 'استلام الأمتعة' },
};
const WORDS = { terminal: 'Terminal', 'f-domestic': 'Domestic', 'f-transborder': 'Transborder', 'f-international': 'International' };

/** A screen booted from `query`: the header it draws for `mode`. */
function header(query, mode, langs) {
  const run = new Function('_initParams', 'BoardStrings', 'LS', 'TL', 'AIRLINE_NAME', 'window', 'document', 'langs', 'lang',
    'var filterTerminal = "", filterAirline = "", filterRegion = "";\n'
    + SRC + '\n' + INTAKE + '\n'
    + 'return _boardLabelBilingual(' + JSON.stringify(mode) + ');');
  return run(
    new URLSearchParams(query), BS, LS, (k) => WORDS[k] || k, { AC: 'Air Canada', WS: 'WestJet' },
    { fidsT: (k) => WORDS[k] || k },
    { getElementById: () => ({ value: 'YQM' }), body: { classList: { toggle() {} } } },
    langs || ['en', 'fr'], (langs || ['en'])[0]);
}

/** The tags of a piece of markup, and its text, scanned from '<' to '>'. */
function parts(html) {
  const tags = [];
  let text = '', i = 0;
  for (;;) {
    const a = html.indexOf('<', i);
    if (a < 0) { text += html.slice(i); break; }
    text += html.slice(i, a);
    const b = html.indexOf('>', a + 1);
    if (b < 0) { text += html.slice(a); break; }
    tags.push(html.slice(a, b + 1));
    i = b + 1;
  }
  return { tags, text };
}

// The only markup the header writes: its two halves (each marked with its
// language, an Arabic one right to left) and the chip.
const OWN_TAG = /^<(?:\/span|span class="(?:fbl-en|fbl-fr|fids-board-filter)"(?: lang="[a-z]{2}")?(?: dir="rtl")?)>$/;

function assertOnlyOwnMarkup(html, payload) {
  const { tags, text } = parts(html);
  for (const t of tags) assert.match(t, OWN_TAG, `a tag from ${JSON.stringify(payload)} reached the header: ${html}`);
  assert.doesNotMatch(text, /[<>"']/, `markup from ${JSON.stringify(payload)} survived: ${html}`);
  assert.doesNotMatch(text, /&(?!(?:amp|lt|gt|quot|#39);)/, `a raw & from ${JSON.stringify(payload)} survived: ${html}`);
}

/** The chip as a passenger reads it: its text, the escapes decoded once. */
function chipText(html) {
  const m = /<span class="fids-board-filter">([^<>]*)<\/span>$/.exec(html);
  assert.ok(m, 'the header must end in the chip: ' + html);
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '</span><script>alert(1)</script>',
  '"><svg onload=alert(1)>',
  "' onmouseover='alert(1)",
  // upper-casing is no defence: attributes are case-insensitive, and the
  // character references spell lower-case script once a browser reads them
  '<IMG SRC=X ONERROR=&#X61;&#X6C;&#X65;&#X72;&#X74;(1)>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
];

for (const param of ['terminal', 'term', 'airline', 'al']) {
  test(`?${param}= is text in the departures and arrivals header, in any board languages`, () => {
    for (const p of PAYLOADS) {
      for (const mode of ['dep', 'arr', 'baggage']) {
        for (const langs of [['en', 'fr'], ['fr'], ['ar', 'en']]) {
          const h = header('?' + param + '=' + encodeURIComponent(p), mode, langs);
          assertOnlyOwnMarkup(h, p);
        }
      }
    }
  });
}

test('a hostile filter is shown as what it says, not dropped', () => {
  const p = '<img src=x onerror=alert(1)>';
  assert.equal(chipText(header('?terminal=' + encodeURIComponent(p), 'dep')), 'Terminal <IMG SRC=X ONERROR=ALERT(1)>');
  assert.equal(chipText(header('?al=' + encodeURIComponent(p), 'arr')), '<IMG SRC=X ONERROR=ALERT(1)>');
});

test('a real filter reads exactly as before', () => {
  assert.equal(header('', 'dep'), '<span class="fbl-en" lang="en">Departures</span><span class="fbl-fr" lang="fr">Départs</span>');
  assert.equal(header('?terminal=t3&airline=ac', 'dep'),
    '<span class="fbl-en" lang="en">Departures</span><span class="fbl-fr" lang="fr">Départs</span>'
    + '<span class="fids-board-filter">Terminal 3 · Air Canada</span>');
  assert.equal(header('?term=%20B%20&region=dom,trans&al=ZZ', 'arr', ['en']),
    '<span class="fbl-en" lang="en">Arrivals</span><span class="fids-board-filter">Terminal B · Domestic · Transborder · ZZ</span>');
  // a region that is not one of the three is never shown at all
  assert.equal(header('?region=' + encodeURIComponent('<b>x</b>'), 'dep', ['en']), '<span class="fbl-en" lang="en">Departures</span>');
});
