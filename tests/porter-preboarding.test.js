'use strict';

// v23522 — THE SIGN NAMES EVERYONE ENTITLED TO PRE-BOARD.
//
// the owner sent Porter's published boarding order and said "This is important if
// somehow it can be integrated":
//
//   Pre-boarding is offered as a courtesy and is available to:
//     Passengers with disabilities
//     Unaccompanied minors
//     Families traveling with children age two and younger
//     Premium VIPorter members
//     PorterReserve passengers
//   Once pre-boarding is complete, general boarding will commence.
//
// The gate sign's priority column named exactly ONE of those five — Porter
// Reserve — so a passenger with an infant, an unaccompanied minor, or anyone
// needing assistance had nothing telling them the courtesy applied to them.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Brace-matched source of a named function, so the harness lifts the REAL
// implementation rather than a copy that can drift from it.
function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must still define ${name}`);
  let depth = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) return SRC.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + name);
}

// Lift the real builder and give it the collaborators it calls.
function build(preActive, lang) {
  // v23746 — the builder gained three helpers of its own (the cabin heading and
  // its status strip, the split lane row, and the base-tier mark on the general
  // side). They live beside it rather than inside it, so they have to be lifted
  // with it or the function throws on the first call.
  const helpers = ['_pdCabinHdr', '_pdLaneRow', '_pdClassicMark'].map(lift).join('\n');
  const fn = new Function(
    '_gateLbl', '_gateLbl1', '_birArrowSvg', '_gateLaneLbl', 'TL', '_comingLineHtml', '_g8GrpValCls', '_frF',
    helpers + '\n' + lift('_pdLanesBodyHtml') + '\nreturn _pdLanesBodyHtml;',
  )(
    (key) => '[' + key + ']',
    // v23530 — the sign reads ONE language from _GATE_LBL for the phase name
    // and the roster; TL() reads a different table and returned the raw keys.
    (key) => (key === 'preboardList' ? TABLE[lang] : (key === 'preboard' ? 'Pre-boarding' : '[' + key + ']')),
    () => '',
    (v) => v,
    (key) => '[' + key + ']',
    (v) => '<coming>' + v + '</coming>',
    () => '',
    false,
  );
  return fn('23–33', '12–22', preActive);
}

// The roster as it actually ships, pulled from the translation table.
const TABLE = (() => {
  const at = SRC.indexOf('preboardList: {');
  assert.ok(at >= 0, 'the published pre-boarding roster must exist in the translation table');
  const body = SRC.slice(at, SRC.indexOf('},', at) + 2);
  return new Function('return {' + body + '}.preboardList;')();
})();

test('the roster carries every group Porter publishes', () => {
  const en = TABLE.en;
  for (const group of ['disabilities', 'Unaccompanied minors', 'children 2 and under',
                       'VIPorter', 'PorterReserve']) {
    assert.ok(en.includes(group), `the published list includes "${group}"`);
  }
});

test('every language the board can run carries the roster', () => {
  for (const lang of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) {
    assert.ok(TABLE[lang] && TABLE[lang].length > 20, `${lang} must have the roster`);
    assert.ok(/VIPorter/.test(TABLE[lang]) && /PorterReserve/.test(TABLE[lang]),
      `${lang} must keep the Porter brand names untranslated`);
  }
});

test('while pre-boarding, the column is headed Pre-boarding and lists the groups', () => {
  const html = build(true, 'en');
  assert.ok(html.includes('Pre-boarding'), 'the phase name must be the value on the panel');
  assert.match(html, /\[priority\]/,
    'the HEADER stays Priority — v23522 put the phase in both and the value clipped');
  assert.ok(html.includes('Unaccompanied minors'), 'the published list must be on the sign');
  assert.ok(html.includes('Families with children 2 and under'));
  assert.doesNotMatch(html, />Porter Reserve</,
    'during pre-boarding the single Reserve headline is replaced by the full list');
});

test('once general boarding commences it returns to the Reserve priority queue', () => {
  const html = build(false, 'en');
  assert.ok(html.includes('Porter Reserve'), 'lanes 1-2 are the Reserve queue from then on');
  assert.ok(!html.includes('Unaccompanied minors'),
    'the pre-boarding courtesy list must not linger through general boarding');
});

test('the phase is driven by the real boarding window, not a magic number', () => {
  assert.match(SRC, /_pdLanesBodyHtml\(nowVal, _comingVal, minsToDep > \(_boardLeadShown - 5\)\)/,
    'pre-boarding must key off the boarding lead the sign already computes, so it moves with the aircraft type');
});

test('the French sign says it in French', () => {
  const html = build(true, 'fr');
  assert.ok(html.includes('Mineurs non accompagn'));
  assert.ok(html.includes('PorterReserve'), 'brand names stay as Porter writes them');
});

// ── v23746 — THE COLUMNS ARE HEADED BY THE CABIN, AND THE CABIN LOCALISES ───
//
// The columns used to be headed by the queueing concept — "Priority", "Rows".
// A passenger knows which fare they bought, not which concept applies to them,
// so the heading is now the cabin and the functional label sits under it.
//
// Porter LOCALISES these names. flyporter.com writes PorterReserve /
// PorterClassic in English and PorterRéserve / PorterClassique on its fr-ca
// pages, so a bilingual sign cannot print the English form twice. That is the
// specific thing these tests hold.

function cabinNames() {
  const at = SRC.indexOf('  pdReserve: {');
  assert.ok(at >= 0, 'fids-core.js must declare the pdReserve cabin label');
  const end = SRC.indexOf('  photoId: {', at);
  assert.ok(end > at, 'expected pdClassic and photoId to follow pdReserve');
  return new Function('return {' + SRC.slice(at, end) + '};')();
}

test('the cabin names are the closed-up forms Porter publishes', () => {
  const n = cabinNames();
  assert.equal(n.pdReserve.en, 'PorterReserve');
  assert.equal(n.pdClassic.en, 'PorterClassic');
  // Spaced forms appear nowhere on flyporter.com; all 17 instances are closed up.
  assert.doesNotMatch(n.pdReserve.en, /Porter Reserve/);
  assert.doesNotMatch(n.pdClassic.en, /Porter Classic/);
});

test('the French side uses the French cabin names, accents and all', () => {
  const n = cabinNames();
  assert.equal(n.pdReserve.fr, 'PorterRéserve');
  assert.equal(n.pdClassic.fr, 'PorterClassique');
  // The failure this prevents: printing the English brand on the French half.
  assert.notEqual(n.pdReserve.fr, n.pdReserve.en);
  assert.notEqual(n.pdClassic.fr, n.pdClassic.en);
});

test('"Avid Traveller" is not used as a cabin subtitle', () => {
  // It was drawn under PorterReserve in the supplied design. Porter's own
  // footnote defines it as the VIPorter elite tiers — "Avid Traveller refers to
  // Passport, Venture, Ascent and First membership levels" — not as a name for
  // the cabin. Cabin and status are independent: an Avid Traveller can be
  // seated in PorterClassic, and PorterReserve can be bought with no status.
  // Printing it as a cabin subtitle would state something untrue about who the
  // cabin is for, and the sign already carries the term correctly in the marks.
  const hdr = lift('_pdCabinHdr');
  assert.doesNotMatch(hdr, /Avid\s*Traveller/i,
    'the cabin heading must not carry the loyalty-status term');
});

test('each cabin says whether IT is boarding', () => {
  // The best idea in the supplied design: nothing on the old sign told a
  // passenger whether their own cabin was being called — they had to infer it
  // from the row band.
  const hdr = lift('_pdCabinHdr');
  assert.match(hdr, /nowBoarding/, 'a live cabin must read Now Boarding');
  assert.match(hdr, /boardSoon/, 'a cabin not yet called must say so');
  // Reserve is live for the whole window; Classic only once general boarding
  // has commenced.
  const body = lift('_pdLanesBodyHtml');
  assert.match(body, /_pdCabinHdr\('pdReserve',\s*true\)/,
    'PorterReserve pre-boards and its queue stays open, so it is always live');
  assert.match(body, /_pdCabinHdr\('pdClassic',\s*!preActive\)/,
    'PorterClassic is not boarding while pre-boarding is still running');
});

test('each lane numeral carries its own arrow', () => {
  const row = lift('_pdLaneRow');
  // "1 • 2" in one element could only ever be pointed at once.
  assert.match(row, /g8-pd-arr dl/, 'the left lane needs a down-left arrow');
  assert.match(row, /g8-pd-arr dr/, 'the right lane needs a down-right arrow');
  const body = lift('_pdLanesBodyHtml');
  assert.match(body, /_pdLaneRow\('1',\s*'2'\)/, 'the priority queue is lanes 1 and 2');
  assert.match(body, /_pdLaneRow\('3',\s*'4'\)/, 'general boarding is lanes 3 and 4');
});

test('the base VIPorter tier sits with general boarding, not with priority', () => {
  // Three elite marks are in the priority column because those tiers pre-board.
  // A plain member does not, so the mark belongs where they actually queue.
  const classic = lift('_pdClassicMark');
  assert.match(classic, /viporter_member_single_line/,
    'the base tier mark belongs on the PorterClassic side');
  const body = lift('_pdLanesBodyHtml');
  const prioAt = body.indexOf('g8-pd-prio');
  const markAt = body.indexOf('_pdClassicMark');
  const rowsAt = body.indexOf('g8-pd-rows');
  assert.ok(rowsAt > prioAt && markAt > rowsAt,
    'the member mark must be emitted inside the general-boarding column');
});

test('AvidTraveller labels the tier marks, which is where it is true', () => {
  // Requested on the board because the term is everywhere in Porter's
  // marketing — and it belongs here rather than under the cabin heading.
  // Porter's own footnote: "Avid Traveller refers to Passport, Venture, Ascent
  // and First membership levels". It is the collective name for exactly the
  // marks it now sits above, which until this change were unlabelled.
  const body = lift('_pdLanesBodyHtml');
  assert.match(body, /g8-pd-marks-hdr">AvidTraveller</,
    'the marks row must be headed with the name');
  // Above the marks, not floating elsewhere in the column.
  const hdrAt = body.indexOf('g8-pd-marks-hdr');
  const marksAt = body.indexOf('g8-pd-preboard-marks');
  assert.ok(hdrAt > 0 && marksAt > hdrAt,
    'the heading must be emitted immediately before the marks it names');
  // Closed up, matching Porter's press usage and every other Porter name on
  // this sign. flyporter.com spaces it; if that form is ever preferred this is
  // the one string to change.
  assert.doesNotMatch(body, /g8-pd-marks-hdr">Avid Traveller</,
    'the sign uses the closed-up form for Porter names');
});
