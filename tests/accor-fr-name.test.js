'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE FRENCH SPELLINGS OF A HOTEL NAME ARE FOR A FRENCH CARD.
//
// _accorFrName (fids-core.js) writes Montréal, Québec and Aéroport into the
// name of an Accor hotel, and is meant to on a card whose language is French
// only. Its guard read a global accorLang that does not exist (accorLang is
// local to buildAccorAdOnlyV6), so the guard never held and every board took
// the French spellings: an English card printed "Novotel Montréal Aéroport"
// for the "Novotel Montreal Airport" of the feed. The callers now pass the
// language of the card in, and that language has one rule, _accorCardLang,
// for the builder's labels, the names and the distance line of the older
// layout (which tested the same missing global).
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

// the real function, out of the file (whatever its parameters), with nothing else of the board
function source(name) {
  const m = CORE.match(new RegExp('\\nfunction ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' is a function of fids-core.js');
  return m[0];
}
function fnSource(name) {
  const at = CORE.indexOf('\nfunction ' + name + '(');
  assert.ok(at >= 0, name);
  const next = CORE.indexOf('\nfunction ', at + 10);
  return CORE.slice(at, next < 0 ? CORE.length : next);
}

test('an English card keeps the hotel names of the feed; a French card takes the French spellings', () => {
  // eslint-disable-next-line no-new-func
  const frName = new Function(source('_accorFrName') + '\nreturn _accorFrName;')();
  const FEED = ['Novotel Montreal Airport', 'Pullman Montreal Airport', 'Sofitel Montreal Golden Mile', 'Novotel Montreal Centre', 'Fairmont Vancouver Airport', 'Hotel Le Germain Quebec'];
  // an English board, a Spanish one, a Japanese one, and a call that names no language
  for (const lg of ['en', 'es', 'de', 'ja', 'zh', 'ar', undefined, '']) {
    for (const n of FEED) assert.equal(frName(n, lg), n, n + ' on a card in ' + lg);
  }
  // a French card
  assert.equal(frName('Novotel Montreal Airport', 'fr'), 'Novotel Montréal Aéroport');
  assert.equal(frName('Sofitel Montreal Golden Mile', 'fr'), 'Sofitel Montréal Golden Mile');
  assert.equal(frName('Hotel Le Germain Quebec', 'fr'), 'Hotel Le Germain Québec');
  // whole words only, and a name already in French stays as it is
  assert.equal(frName('Montrealer Airportside Inn', 'fr'), 'Montrealer Airportside Inn');
  assert.equal(frName('Novotel Montréal Aéroport', 'fr'), 'Novotel Montréal Aéroport');
});

test('both callers pass the language of the card; nothing tests a global accorLang', () => {
  const calls = CORE.split('\n').filter((l) => /_accorFrName\(/.test(l) && !/^\s*\/\//.test(l) && !/^function _accorFrName\(/.test(l));
  assert.equal(calls.length, 2, calls.join('\n'));
  assert.ok(calls.some((l) => l.includes('var displayName=_accorFrName(stripBrand(hotelName), accorLang());')));
  assert.ok(calls.some((l) => l.includes('var _fullName = _accorFrName(first(ad.nameFull, hotelName), accorLang());')));
  // accorLang lives inside buildAccorAdOnlyV6; a typeof test of it anywhere else never holds
  assert.doesNotMatch(CORE, /typeof accorLang\b/);
  // the distance line of the older layout reads the language of the card too
  assert.match(fnSource('buildGateAdHtml'), /\n\s*var _kmL = _accorCardLang\(ad\);/);
  // and the builder binds its labels by the same rule
  assert.match(fnSource('buildAccorAdOnlyV6'), /function accorLang\(\)\{[\s\S]*?return _accorCardLang\(ad\);\s*\}/);
});

test('the language of a card: the one its content was built in, else the deck, else the board', () => {
  const make = (deck, boardLang) =>
    // eslint-disable-next-line no-new-func
    new Function('_accorLangNow', 'lang', source('_accorCardLang') + '\nreturn _accorCardLang;')(deck, boardLang);
  const L = make(() => 'fr', 'en');
  assert.equal(L({ _adLang: 'en' }), 'en', 'an English card on a deck running French');
  assert.equal(L({ _adLang: 'es' }), 'es', 'any two-letter stamp');
  assert.equal(L({ _adLang: 'fra' }), 'fr', 'not a stamp: the deck');
  assert.equal(L({}), 'fr');
  assert.equal(L(null), 'fr');
  assert.equal(make(() => { throw new Error('x'); }, 'de')({}), 'de', 'a deck that fails: the board');
  assert.equal(make(undefined, '')({}), 'en', 'nothing at all: English');
});
