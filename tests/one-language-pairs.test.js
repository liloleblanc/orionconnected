'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24076 — A BOARD IN ONE LANGUAGE SAYS EACH LABEL ONCE.
//
// A gate set to one language (gids.html?…&langs=en) read "Now Boarding |
// Now Boarding" across the top of its boarding sign, and on the countdown and
// a delayed flight it printed the flight's status at both ends of the same
// strip. The strip built its two halves by hand and, with no second
// language, filled the second half with the first one again.
//
// The rule the pair helpers already keep (BoardStrings.pair, _gateLbl):
//   - one language: its words once, no bar;
//   - two languages: both halves round the bar, even when they share a word
//     (keepDup, for symmetry), exactly as before.
// These tests RUN the strip builder, lifted out of fids-core.js by brace
// matching, with the gate's own label table and the one store, in all nine
// languages alone and in every ordered pair. The screens themselves are
// read in tests/render/words.mjs, which fails a label printed twice or a
// separator left dangling on any one-language board.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STORE = require('../fids-current/js/board-strings.js');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const LANGS = STORE.LANGS;

// ── lifting real code ───────────────────────────────────────────────────────
function braceFrom(SRC, start, what) {
  assert.ok(start >= 0, what + ' must exist');
  let i = SRC.indexOf('{', start);
  let depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) {
        if (SRC[i] === '\\') { i++; continue; }
        if (SRC[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return SRC.slice(start, i + 1); }
  }
  throw new Error('could not find the end of ' + what);
}
function fnIn(SRC, name, indent) {
  const m = SRC.match(new RegExp('\\n' + (indent || '') + 'function ' + name + '\\('));
  assert.ok(m, name + ' must be declared');
  return braceFrom(SRC, m.index + 1, name);
}
const block = (prefix) => braceFrom(CORE, CORE.indexOf(prefix), prefix) + ';';
const UXG = braceFrom(CORE, CORE.indexOf('function uxgGateHtml(ctx) {'), 'uxgGateHtml');
const STRIP = fnIn(UXG, '_boardWelcomeStripHtml', '  ');

const RUN = new Function('BoardStrings', 'langs', '_frF', '_stripState', '_statusKey', [
  block('var _GATE_LBL = {'),
  block('const SS = {').replace(/^const /, 'var '),
  fnIn(CORE, '_lblEntry'),
  fnIn(CORE, '_gateLbl'),
  'var window = {}, iata = "YQM", AP = { YQM: { tz: "America/Moncton" } }, airlineCode = "AC", starHtml = "", _allianceKey = "";',
  'var currentFlight = { status: "boarding" }, minsToDep = 20, _door = { kept: false };',
  'function _boardStripStatusKey() { return _statusKey; }',
  STRIP,
  'return { html: _boardWelcomeStripHtml(_stripState), lbl: _GATE_LBL };'
].join('\n'));
// the strip for a board showing `list`; status: the flank's key ('' none)
const strip = (list, state, status, frF) => RUN(STORE, list, !!frF, state, status || '').html;
const LBL = RUN(STORE, ['en'], false, 'boarding', '').lbl;

const midOf = (html) => {
  const m = /<div class="g8-bw-text">([\s\S]*?)<\/div><\/div>/.exec(html.replace(/<span class="g8-bw-star">[\s\S]*?<\/span>/, ''));
  assert.ok(m, 'the strip has its middle words');
  return m[1];
};
const endsOf = (html) => {
  const ends = [...html.matchAll(/<div class="g8-bw-end ([^"]*)"([^>]*)>([\s\S]*?)<\/div>(?=<div class="g8-bw-mid">|<\/div>$)/g)];
  return ends.map((m) => ({ cls: m[1], attrs: m[2], body: m[3] }));
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// what a passenger sees: the mirrored end is hidden (aria-hidden, CSS)
const seen = (html) => text(html.replace(/<div class="g8-bw-end [^"]*g8-bw-end-mirror"[^>]*>[\s\S]*?<\/div><\/div>/, ''));
// the strip's middle as the two-language boards have always had it
const SEP = ' <span class="g8-bw-sep">|</span> ';
const oldMid = (l1, l2) => STORE.markHalf(LBL.nowBoarding[l1], l1) + SEP + STORE.markHalf(LBL.nowBoarding[l2], l2);

test('one language: NOW BOARDING once, with no bar, in each of the nine', () => {
  for (const l of LANGS) {
    const mid = midOf(strip([l], 'boarding'));
    assert.equal(mid, STORE.markHalf(LBL.nowBoarding[l], l), l + ': the headline is the one word, marked with its language');
    assert.ok(!mid.includes('g8-bw-sep'), l + ': no bar beside one language');
    const words = text(mid);
    assert.equal(words.split(LBL.nowBoarding[l]).length - 1, 1, l + ': "' + words + '" says it once');
  }
  // the final call's strip, and a Québec board in French alone
  assert.equal(midOf(strip(['en'], 'final')), 'Now Boarding');
  assert.equal(midOf(strip(['fr'], 'boarding', '', true)), 'Embarquement');
});

test('one language: the status is said once, at the left end, and the right end only keeps the width', () => {
  for (const l of LANGS) {
    for (const st of ['delayed', 'ontime', 'cancelled']) {
      const html = strip([l], 'countdown', st);
      const ends = endsOf(html);
      assert.equal(ends.length, 2, l + ' ' + st + ': two ends');
      assert.ok(/g8-bw-end-l/.test(ends[0].cls) && !/mirror/.test(ends[0].cls), l + ': the left end is the one that is seen');
      assert.match(ends[0].body, /g8-bw-status/, l + ' ' + st + ': the left end says the status');
      assert.match(ends[1].cls, /g8-bw-end-r g8-bw-end-mirror/, l + ' ' + st + ': the right end is the mirror');
      assert.match(ends[1].attrs, /aria-hidden="true"/, l + ' ' + st + ': hidden from a screen reader too');
      // what is seen: the status label once
      const lbl = LBL.status[l];
      assert.equal(seen(html).split(lbl).length - 1, 1, l + ' ' + st + ': "' + seen(html) + '" says ' + lbl + ' once');
    }
    // no status: both ends are empty, as they always were
    const none = endsOf(strip([l], 'countdown', ''));
    assert.deepEqual(none.map((e) => e.cls + e.attrs + e.body), ['g8-bw-end-l', 'g8-bw-end-r'], l + ': no flank, no mirror');
  }
  // the mirror is hidden by the stylesheet, every element in it
  assert.match(CSS, /\.g8-bw-clocked \.g8-bw-end\.g8-bw-end-mirror,\s*\n[^\n]*\.g8-bw-clocked \.g8-bw-end\.g8-bw-end-mirror \* \{\s*\n\s*visibility: hidden !important;/);
});

test('two and three languages: the strip is exactly what it was', () => {
  for (const a of LANGS) {
    for (const b of LANGS) {
      if (a === b) continue;
      for (const list of [[a, b], [a, b, a === 'es' || b === 'es' ? 'de' : 'es']]) {
        const html = strip(list, 'boarding');
        assert.equal(midOf(html), oldMid(a, b), list + ': both halves round the bar');
        const d = strip(list, 'countdown', 'delayed');
        const ends = endsOf(d);
        assert.ok(!/mirror/.test(d), list + ': no mirror with two languages');
        assert.ok(ends[0].body.includes('lang="' + a + '"') && ends[0].body.includes(LBL.status[a]), list + ': the left end in the first language');
        assert.ok(ends[1].body.includes(LBL.status[b]), list + ': the right end in the second language');
      }
    }
  }
  // French leads at a Québec airport when it is selected
  assert.equal(midOf(strip(['en', 'fr'], 'boarding', '', true)), oldMid('fr', 'en'));
});

test('no pair on the strip takes its first language again as its second', () => {
  const code = STRIP.replace(/\/\/.*$/mg, '');
  assert.doesNotMatch(code, /_bwLangs\[1\]\s*\|\|\s*_bwL1/, 'one language is not a pair of itself');
  assert.doesNotMatch(code, /_bwNBl2\s*=|_bwNB2\s*=/, 'the headline is not built from two hand-made halves');
  assert.match(code, /_gateLbl\('nowBoarding', _frF, function \(w\) \{ return w; \}, ' <span class="g8-bw-sep">\|<\/span> ', true\)/,
    'NOW BOARDING goes through the pair helper, both halves kept on two-language boards');
});

test('the pair helpers: one language is its words once, for every label', () => {
  const lbl = RUN(STORE, ['en'], false, 'boarding', '').lbl;
  const gate = new Function('BoardStrings', 'langs', [block('var _GATE_LBL = {'), fnIn(CORE, '_gateLbl'),
    'return function (k, keep) { return _gateLbl(k, false, function (w) { return "<b>" + w + "</b>"; }, " | ", keep); };'].join('\n'));
  for (const l of LANGS) {
    const g = gate(STORE, [l]);
    for (const k of Object.keys(lbl)) {
      for (const keep of [false, true]) {
        const out = g(k, keep);
        assert.ok(!out.includes(' | '), `_gateLbl(${k}) on a ${l} board has no bar: ${out}`);
      }
    }
    for (const k of Object.keys(STORE.STR)) {
      const out = STORE.pair(k, { langs: [l], keepDup: true, plain: true });
      assert.ok(!out.includes(' | '), `bsPair(${k}) on a ${l} board has no bar: ${out}`);
    }
  }
});
