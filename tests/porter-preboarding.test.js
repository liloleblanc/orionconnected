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
    // v23750 — _frF has to track the language the caller asked for. It was
    // pinned to false, so every "the French sign says X" test below was really
    // rendering an English sign that happened to look up a French roster. The
    // artwork picks its language off THIS flag, so with it pinned no test could
    // ever have caught a mark stuck in the wrong language.
    lang === 'fr',
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
  assert.match(body, /g8-pd-marks-hdr/, 'the marks row must be headed');
  assert.match(body, /_gateLbl1\('avidTraveller'/,
    'the name is a LABEL, not a literal — the sign is bilingual');
  // Above the marks, not floating elsewhere in the column.
  const hdrAt = body.indexOf('g8-pd-marks-hdr');
  const marksAt = body.indexOf('g8-pd-preboard-marks');
  assert.ok(hdrAt > 0 && marksAt > hdrAt,
    'the heading must be emitted immediately before the marks it names');
});

test('the tier collective name is renamed in French, not translated', () => {
  // Porter does not translate it, it renames it: "Grand Voyageur fait
  // référence aux niveaux d'adhésion Passeport, Horizon, Essor et Première".
  // Hardcoding the English would print it on the French half of the sign.
  const at = SRC.indexOf('  avidTraveller: {');
  assert.ok(at >= 0, 'fids-core.js must declare the avidTraveller label');
  const lbl = new Function('return {' + SRC.slice(at, SRC.indexOf('},', at) + 2) + '}.avidTraveller;')();
  assert.equal(lbl.en, 'AvidTraveller');
  assert.equal(lbl.fr, 'Grand Voyageur');
  assert.notEqual(lbl.fr, lbl.en, 'the French side must not print the English brand');
  // Closed up on the English side, matching Porter's press usage and every
  // other Porter name on this sign.
  assert.doesNotMatch(lbl.en, /Avid Traveller/);
});

test('all four elite tiers are named, Ascent included', () => {
  // Porter publishes FOUR elite levels. Ascent sits between Venture and First
  // and had no artwork at all, so a member of that tier read the marks and
  // found their status named nowhere on the sign.
  const body = lift('_pdLanesBodyHtml');
  // The marks are BUILT, not written out — '..._' + tier + '_single_line_' +
  // lang + '.svg' — so a literal search finds none of them. Read the tier list
  // off the calls instead, the way the branding contract resolves constructed
  // tile paths rather than grepping for filenames that no longer appear.
  const tiers = [...body.matchAll(/_pdMark\('(\w+)'/g)].map((m) => m[1]);
  for (const tier of ['passport', 'venture', 'ascent', 'first']) {
    assert.ok(tiers.includes(tier), `the ${tier} tier must be on the priority marks`);
  }
  // And the base member is NOT among them — it belongs with general boarding.
  const prio = body.slice(body.indexOf('_prioMarks ='), body.indexOf('_prioSub'));
  assert.doesNotMatch(prio, /viporter_member_single_line/,
    'a plain member does not pre-board, so the mark belongs in the other column');
});

test('every tier mark points at a file that exists', () => {
  // A missing mark fails silently — the img just does not draw, and the sign
  // looks fine with one fewer tier on it. That is how Ascent went unnoticed.
  const dir = path.resolve(__dirname, '..', 'fids-current', 'logos', 'airlines', 'canadian', 'porter');
  const body = lift('_pdLanesBodyHtml') + lift('_pdClassicMark');
  // Resolve what the renderer BUILDS, in every language it can build it in —
  // a constructed path that points at nothing draws nothing, and the tier just
  // vanishes from the sign with no error. That is how Ascent went unnoticed.
  const fr = new Function('return ' + /_PD_MARK_FR = (\{[^}]*\})/.exec(body)[1] + ';')();
  const refs = [];
  for (const m of body.matchAll(/_pdMark\('(\w+)'/g)) {
    refs.push(`viporter_${m[1]}_single_line_en.svg`);
    if (fr[m[1]]) refs.push(`viporter_${m[1]}_single_line_fr.svg`);
  }
  // The literally-named ones, plus the Reserve logo's language variants.
  for (const m of body.matchAll(/porter\/([\w.-]+)\.svg/g)) refs.push(m[1] + '.svg');
  if (/porter_reserve_logo'\s*\+/.test(body)) refs.push('porter_reserve_logo.svg', 'porter_reserve_logo_fr.svg');
  const uniq = [...new Set(refs)];
  assert.ok(uniq.length >= 6, `expected at least six marks, found ${uniq.length}`);
  const missing = uniq.filter((f) => !fs.existsSync(path.join(dir, f)));
  assert.deepEqual(missing, [], `these marks are referenced but not on disk: ${missing.join(', ')}`);
});

// Run the real _pdMark in a chosen language rather than grepping for the shape
// of its source. An earlier version of this test matched the exact expression
// the function was written with, so renaming one local variable failed it while
// the sign kept rendering perfectly — a test of the spelling, not the output.
function mark(tier, label, fr) {
  const src = lift('_pdLanesBodyHtml');
  const decl = /var _PD_MARK_FR = \{[^}]*\};/.exec(src);
  assert.ok(decl, 'the set of tiers with French art must be declared explicitly');
  const at = src.indexOf('function _pdMark(');
  assert.ok(at >= 0, '_pdMark must still exist');
  const body = src.slice(at, src.indexOf('\n    }', at) + 6);
  return new Function('_frF', decl[0] + '\n' + body + '\nreturn _pdMark;')(fr)(tier, label);
}

test('the tier marks follow the language where French art exists', () => {
  // Porter RENAMES the tiers rather than translating them — Ascent is Essor and
  // First is Première — so the French files are different artwork, not colour
  // variants. The filenames key on the English tier with a language suffix, so
  // the tier is the identity and the language is a swap.
  assert.match(mark('ascent', 'Ascent', false), /viporter_ascent_single_line_en\.svg/,
    'the English sign must show the English tier artwork');
  assert.match(mark('ascent', 'Ascent', true), /viporter_ascent_single_line_fr\.svg/,
    'the French sign must swap in the French artwork, not merely recolour it');
  // And the alt text — what a passenger reads if the file ever fails to load —
  // must be the word on their own card, not the tier name in the other language.
  assert.match(mark('ascent', 'Ascent', true), /alt="VIPorter Essor"/,
    'a French sign falling back to text must say Essor, never Ascent');
});

test('a French sign shows no English mark that has a French file on disk', () => {
  // One rule over the WHOLE panel rather than one assertion per mark. Every
  // previous version of this check named the marks it knew about, so each mark
  // added later — the base-tier member mark on the general-boarding side was the
  // last one — arrived with no language coverage at all and nobody noticed.
  // This reads the rendered French panel and asks the only question that
  // matters: is anything still in English that did not have to be?
  //
  // Two naming conventions are in play and BOTH have to be handled: the tier
  // marks suffix the language on every file (`..._en.svg` / `..._fr.svg`), while
  // the Reserve logo leaves English bare and suffixes only the French
  // (`porter_reserve_logo.svg` / `..._fr.svg`). A check that only understood the
  // first convention let a stranded Reserve logo through.
  const dir = path.resolve(__dirname, '..', 'fids-current', 'logos', 'airlines', 'canadian', 'porter');
  const html = build(false, 'fr') + build(true, 'fr');
  const stranded = [...new Set([...html.matchAll(/porter\/([\w.-]+)\.svg/g)].map((m) => m[1]))]
    .filter((stem) => !stem.endsWith('_fr'))
    .filter((stem) => fs.existsSync(
      path.join(dir, (stem.endsWith('_en') ? stem.slice(0, -3) : stem) + '_fr.svg')));
  assert.deepEqual(stranded, [],
    'these marks render their English artwork on a French sign even though the ' +
    'French file is sitting in the tree beside it: ' + stranded.join(', '));
});

test('an English sign never reaches for the French artwork', () => {
  // The other direction, which a one-way check would miss entirely.
  const html = build(false, 'en') + build(true, 'en');
  assert.doesNotMatch(html, /_fr\.svg/,
    'the English sign must not print French artwork');
});

test('a tier without French art falls back to English, never to nothing', () => {
  // This is the important half. A missing image draws nothing at all and the
  // tier silently vanishes from the sign — exactly how Ascent went unnoticed.
  // Wrong-language-but-present beats absent.
  const src = lift('_pdLanesBodyHtml');
  const frSet = new Function('return ' + /(_PD_MARK_FR = )(\{[^}]*\})/.exec(src)[2] + ';')();
  const dir = path.resolve(__dirname, '..', 'fids-current', 'logos', 'airlines', 'canadian', 'porter');
  for (const tier of ['passport', 'venture', 'ascent', 'first']) {
    // Every tier must have English art — that is the fallback.
    assert.ok(fs.existsSync(path.join(dir, `viporter_${tier}_single_line_en.svg`)),
      `${tier} has no English art to fall back to`);
    // And any tier CLAIMING French art must actually have it on disk.
    if (frSet[tier]) {
      assert.ok(fs.existsSync(path.join(dir, `viporter_${tier}_single_line_fr.svg`)),
        `${tier} is listed as having French art but the file is not there`);
    }
  }
});
