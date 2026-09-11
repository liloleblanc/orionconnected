'use strict';

// v23720 — THE ARRIVAL SHELF LEADS WITH THE EVENT AND ENDS WITH THE CLOCK.
//
// Requested shape, on stand:
//     PD2381 from | de Montreal | MET
//     Arrived at the gate | 9:20pm
//     Arrivé à la porte | 9:20pm
//
// and while still rolling, with the clock inside the clause:
//     PD2381 from | de Montreal | MET
//     Landed at 9:20pm and taxiing
//     Atterri à 9:20pm au roulage
//
// Two things this guards that are easy to regress:
//   · the SECOND language used to have no time of its own — it sat under a
//     line whose only timestamp was at the far left of the line above.
//   · every span on this line must carry a class. display-overrides.css
//     punctuates adjacent CLASSLESS spans in .v2-fi-mline3 with an automatic
//     ' | '; a bare span here reintroduces the '11:04am | | |' that was caught
//     on the live YHZ shelf.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// ── Lift _GATE_LBL and _gateLbl out of the file and run them for real ─────
// Asserting on the source text alone would pass against a dictionary entry
// that never reaches the renderer. These build the actual strings.

function sliceBraced(startIdx) {
  let i = SRC.indexOf('{', startIdx), d = 0;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(startIdx, k + 1); }
  }
  throw new Error('unbalanced braces from ' + startIdx);
}

const dictAt = SRC.indexOf('var _GATE_LBL = {');
assert.ok(dictAt >= 0, 'fids-core.js must still declare _GATE_LBL');
const dictSrc = sliceBraced(dictAt);

const lblAt = SRC.indexOf('function _gateLbl(key, frFirst, wrap, sep, keepDup)');
assert.ok(lblAt >= 0, 'fids-core.js must still define _gateLbl');
const lblSrc = sliceBraced(lblAt);

function build(langs) {
  return new Function('langs', dictSrc + '\n' + lblSrc + '\nreturn _gateLbl;')(langs);
}
const gateLbl = build(['en', 'fr']);

// ── Run the RENDERER'S OWN composition, lifted from the file ─────────────
// An earlier draft of this test transcribed the renderer's callback into the
// test instead of reading it. Mutation-testing caught that: reverting the fix
// in fids-core.js left every assertion green, because the test was exercising
// its own copy of the new behaviour and never the source at all. These slices
// take the real statements, so a revert in fids-core.js fails the test.

function sliceStmts(fromMarker, toMarker) {
  const a = SRC.indexOf(fromMarker);
  assert.ok(a >= 0, 'fids-core.js must still contain: ' + fromMarker);
  const b = SRC.indexOf(toMarker, a);
  assert.ok(b > a, 'fids-core.js must still contain: ' + toMarker);
  return SRC.slice(a, b);
}

// _mcEvtHtml → _mcSentKey → _mcArrLine, exactly as the renderer builds them.
const ARR_SRC = sliceStmts('var _mcEvtHtml = _mcEvtStr', 'var _mcFromConn');
const CONN_SRC = sliceStmts('var _mcFromConn = _gateLbl(', 'var _mcTitle =');

const railT = (t) => String(t || '').replace(/\s*([AP]M)\b/gi, (m, p) => p.toLowerCase());

const makeArrLine = new Function(
  '_mcOnStand', '_mcEvtStr', '_railT', '_frF', '_gateLbl',
  ARR_SRC + '\nreturn _mcArrLine;');

const makeConn = new Function(
  '_frF', '_gateLbl', CONN_SRC + '\nreturn _mcFromConn;');

function arrivalLine(opts) {
  return makeArrLine(!!opts.onStand, opts.evt || '', railT, false, gateLbl);
}

// Strip to a FIXPOINT, not in one pass. A single .replace(/<[^>]+>/g,'') is
// incomplete — removing the inner tag from '<<a>script' yields '<script', so
// one pass can manufacture a tag it just removed. Nothing here is attacker
// controlled, but a half-working strip in a test is a half-working assertion.
const strip = (html) => {
  let s = String(html), prev;
  do { prev = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== prev);
  return s;
};

// The English span closes before the second-language span opens, so the open
// tag of the latter is a clean split point even though both nest a time span.
function halves(html) {
  const i = html.indexOf('<span class="v2-fi-lbl-2');
  return i < 0
    ? { en: strip(html).trim(), fr: '' }
    : { en: strip(html.slice(0, i)).trim(), fr: strip(html.slice(i)).trim() };
}

// ── On stand ─────────────────────────────────────────────────────────────

test('at the gate: each language ends with its own clock', () => {
  const html = arrivalLine({ onStand: true, evt: '9:20 PM' });
  const { en, fr } = halves(html);

  assert.equal(en, 'Arrived at the gate | 9:20pm');
  assert.equal(fr, 'Arrivé à la porte | 9:20pm');

  // The clock is inside BOTH halves, not shared from the front of the line.
  assert.equal((html.match(/v2-rc-fi-evt/g) || []).length, 2,
    'both languages must carry their own time span');
  assert.doesNotMatch(html, /^<span class="v2-rc-fi-evt"/,
    'the line must not still lead with the timestamp');
});

test('at the gate: the subject is not named twice', () => {
  const html = arrivalLine({ onStand: true, evt: '9:20 PM' });
  assert.doesNotMatch(strip(html), /Your aircraft|Votre avion/,
    'the banner directly above already reads "Your Aircraft | Votre Avion"');
});

// ── Landed, still rolling ────────────────────────────────────────────────

test('taxiing: the clock sits inside the clause, not appended after it', () => {
  const html = arrivalLine({ onStand: false, evt: '9:20 PM' });
  const { en, fr } = halves(html);

  assert.equal(en, 'Landed at 9:20pm and taxiing');
  assert.equal(fr, 'Atterri à 9:20pm au roulage');

  // No trailing bar — the appended form must not also fire when {t} matched.
  assert.doesNotMatch(strip(html), /taxiing \|/, 'the time is substituted, not appended');
  assert.doesNotMatch(strip(html), /roulage \|/);
});

test('taxiing with no usable time renders a sentence, not a placeholder', () => {
  const html = arrivalLine({ onStand: false, evt: '' });
  assert.doesNotMatch(html, /\{t\}/, 'a literal {t} must never reach the sign');
  assert.equal(halves(html).en, 'Landed and taxiing');
});

test('at the gate with no usable time drops the clock cleanly', () => {
  const html = arrivalLine({ onStand: true, evt: '' });
  assert.equal(halves(html).en, 'Arrived at the gate',
    'no dangling separator when there is nothing to separate');
  assert.doesNotMatch(html, /v2-rc-bar/);
});

// ── The phantom-pipe guard ───────────────────────────────────────────────

test('every span on the arrival line carries a class', () => {
  for (const opts of [{ onStand: true, evt: '9:20 PM' }, { onStand: false, evt: '9:20 PM' },
                      { onStand: true, evt: '' }, { onStand: false, evt: '' }]) {
    const html = arrivalLine(opts);
    const bare = html.match(/<span(?![^>]*\bclass=)[^>]*>/g);
    assert.equal(bare, null,
      'a classless span here is punctuated by the generic ' +
      '.v2-fi-mline3 span:not([class]) + span:not([class])::before rule, ' +
      'which is what produced "11:04am | | |" on the live board');
  }
});

test('the composition is the one mline3 actually renders', () => {
  // Extracting _mcArrLine proves it builds the right string; this proves the
  // arrived branch of .v2-fi-mline3 is what consumes it. Without this pair,
  // the fix could be reverted at the call site and every other test stay green.
  const at = SRC.indexOf('<div class="v2-fi-mline3">');
  assert.ok(at >= 0, 'the arrival card must still build a v2-fi-mline3');
  // Wide enough to clear the comment block that sits between the div and the
  // branch, and stopping at the next card so the _ni* mline3 is never in range.
  const branch = SRC.slice(at, SRC.indexOf('_telemBar', at));
  assert.ok(/\?\s*_mcArrLine/.test(branch),
    'the arrived branch must render _mcArrLine');
  assert.ok(branch.indexOf("_gateLbl(_mcOnStand ? 'acArrivedGate' : 'acArrived'") < 0,
    'the old time-first composition must be gone from the call site');
  assert.ok(branch.indexOf("'<span class=\"v2-rc-fi-evt\">' + _railT(_mcEvtStr)") < 0,
    'the shared leading timestamp must be gone from the call site');
});

// ── Line 1: the connector ────────────────────────────────────────────────

test('line 1 names the relationship instead of an interpunct', () => {
  const conn = makeConn(false, gateLbl);
  assert.equal(strip(conn).trim(), 'from | de');
  // Two cards build a v2-fi-mline1 into this shelf: the real inbound card
  // (_ib*/_mc*) and the BACKSTOP (_ni*). They are not alternatives shown in
  // different places — the backstop is gated on `if (!_inboundCard)`, so it
  // fills the SAME rectangle whenever the real builder bails or throws. Both
  // must carry the same grammar; the backstop is asserted separately below.
  const m1 = SRC.split('\n').filter(l =>
    l.indexOf('v2-fi-mline1">') >= 0 && l.indexOf('_ibCityCode') >= 0);
  assert.equal(m1.length, 1, 'exactly one line builds the arrived card\'s mline1');
  assert.ok(m1[0].indexOf('_mcFromConn') >= 0,
    'the flight/city line must build from the connector');
  assert.ok(m1[0].indexOf('·') < 0,
    'the interpunct must be gone from the flight/city line');
});

test('the connector is lower case — it is mid-phrase, not a column heading', () => {
  const conn = makeConn(false, gateLbl);
  assert.equal(strip(conn).trim(), 'from | de', 'lower case, not the From/De column heading');
  // `from` (capitalised) still exists separately for the rail's From/De column.
  assert.equal(gateLbl('from', false, (w) => w, '|'), 'From|De');
});

test('a single-language board gets one word and no bar', () => {
  const one = build(['en']);
  assert.equal(makeConn(false, one), 'from', 'no bar with nothing to separate');
  assert.equal(strip(one('acArrivedGateShort', false, (w) => w, '')), 'Arrived at the gate');
});

// ── The other inbound panels keep the long form ──────────────────────────

test('the two other inbound panels are untouched', () => {
  // Two other renderers reference acArrived / acArrivedGate, and NEITHER
  // reaches a screen:
  //   · 11329, the g8 ROW-4 card — inbPanelHtml is assigned to row4Html and
  //     row4Html has one emission site that this arm never reaches.
  //   · 8433, _inbLine in the aircraft column — registered in _blockMap as
  //     'inbound', but _defaultOrder is ['flightinfo'], so it is not emitted.
  // They are decoys: both carry plausible arrival wording, so editing one
  // looks like a fix and changes nothing. The long form stays with them; the
  // live card gets its own keys. (fids-core.js:11335 already carries a warning
  // about a third, since-deleted sibling that had exactly this shape.)
  assert.equal(strip(gateLbl('acArrivedGate', false, (w) => w, ' | ')),
    'Your aircraft has arrived at the gate | Votre avion est arrivé à la porte');
  assert.ok(/_pair\(_inbArrivedV2 \? \(_inbOnStand \? 'acArrivedGate' : 'acArrived'\)/.test(SRC),
    'the v2-inbound panel must still use the long form');
  assert.ok(/TL\(inArrived \? \(_inbOnStandG8 \? 'acArrivedGate' : 'acArrived'\)/.test(SRC),
    'the g8-inb panel must still use the long form');
});

// ── Every language is present ────────────────────────────────────────────

test('the new keys carry the full language set', () => {
  const langs = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
  const dict = new Function(dictSrc.replace(/^var _GATE_LBL = /, 'return ')) ();
  for (const key of ['acArrivedGateShort', 'acLandedTaxi', 'acLandedTaxiNoTime', 'fromConn']) {
    assert.ok(dict[key], key + ' must exist in _GATE_LBL');
    for (const l of langs) {
      assert.ok(dict[key][l], key + ' is missing ' + l);
    }
  }
  // Every timed variant must carry the placeholder, or that language silently
  // loses its clock.
  for (const l of langs) {
    assert.match(dict.acLandedTaxi[l], /\{t\}/, 'acLandedTaxi.' + l + ' must carry {t}');
    assert.doesNotMatch(dict.acLandedTaxiNoTime[l], /\{t\}/,
      'acLandedTaxiNoTime.' + l + ' must not');
  }
});

// ── The backstop shares the slot, so it shares the grammar ───────────────

test('the backstop card uses the same connector, not the old interpunct', () => {
  // `if (!_inboundCard)` — this is the same shelf, not a different panel. A
  // viewer can meet both within minutes on one gate, so a stale grammar here
  // is visible as an inconsistency rather than hidden behind a rare state.
  const at = SRC.indexOf('PANEL BACKSTOP');
  assert.ok(at >= 0, 'the backstop block must still be identifiable');
  assert.ok(/if \(!_inboundCard\)/.test(SRC.slice(at, at + 2000)),
    'the backstop must still be keyed to an empty card, not to "no inbound"');

  const line = SRC.split('\n').filter(l =>
    l.indexOf('v2-fi-mline1">') >= 0 && l.indexOf('_niFlt') >= 0);
  assert.equal(line.length, 1, 'exactly one line builds the backstop mline1');
  assert.ok(line[0].indexOf('_niFromConn') >= 0,
    'the backstop must use the shared connector');
  assert.ok(line[0].indexOf('<span class="v2-rc-bar">\u00b7</span>') < 0,
    'the interpunct must be gone from the backstop too');
});

test('both cards build the connector identically', () => {
  // Built from the same key, with the same separator markup, in both places —
  // so they cannot drift.
  const conn = makeConn(false, gateLbl);
  const niAt = SRC.indexOf('var _niFromConn = _gateLbl(');
  assert.ok(niAt >= 0, 'the backstop must define its own _niFromConn');
  const niSrc = SRC.slice(niAt, SRC.indexOf(';', SRC.indexOf('</span> \'', niAt)) + 1);
  const niConn = new Function('_frF', '_gateLbl', niSrc + '\nreturn _niFromConn;')(false, gateLbl);
  assert.equal(niConn, conn, 'the two connectors must render identically');
  assert.equal(strip(niConn).trim(), 'from | de');
});

test('the backstop keeps the labelled form when there is no flight number', () => {
  // 'from | de Montreal' with nothing in front of it is a fragment, so the
  // flightless case keeps 'From | De: Montreal'.
  const line = SRC.split('\n').filter(l =>
    l.indexOf('v2-fi-mline1">') >= 0 && l.indexOf('_niFlt') >= 0)[0];
  assert.ok(/_niFlt \? _niFrom :/.test(line),
    'with a flight the origin stands alone after the connector');
  assert.ok(line.indexOf("_gateLbl('from', _frF") >= 0,
    'without one it falls back to the capitalised From | De label');
});
