'use strict';

// v23522 — THE SIGN NAMES EVERYONE ENTITLED TO PRE-BOARD.
//
// Nick sent Porter's published boarding order and said "This is important if
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

// Lift the real builder and give it the collaborators it calls.
function build(preActive, lang) {
  const at = SRC.indexOf('function _pdLanesBodyHtml(');
  assert.ok(at >= 0, 'fids-core.js must still define _pdLanesBodyHtml');
  let i = SRC.indexOf('{', at), depth = 0, end = -1;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  const fn = new Function(
    '_gateLbl', '_birArrowSvg', '_gateLaneLbl', 'TL', '_comingLineHtml', '_g8GrpValCls', '_frF',
    SRC.slice(at, end) + '\nreturn _pdLanesBodyHtml;',
  )(
    (key) => '[' + key + ']',
    () => '',
    (v) => v,
    (key) => (key === 'preboardList' ? TABLE[lang] : '[' + key + ']'),
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
  assert.match(html, /\[preboard\]/, 'the column must be headed Pre-boarding, not Priority');
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
  assert.match(html, /\[priority\]/);
});

test('the phase is driven by the real boarding window, not a magic number', () => {
  assert.match(SRC, /_pdLanesBodyHtml\(nowVal, _comingVal, minsToDep > \(_boardLeadShown - 5\)\)/,
    'pre-boarding must key off the boarding lead the sign already computes, so it moves with the aircraft type');
});

test('the French sign says it in French', () => {
  const html = build(true, 'fr');
  assert.ok(html.includes('Mineurs non accompagnés'));
  assert.ok(html.includes('PorterReserve'), 'brand names stay as Porter writes them');
});
