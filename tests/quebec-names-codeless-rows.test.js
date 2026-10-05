'use strict';

// WHY THIS EXISTS
//
// The YUL departures board read "Sept-Iles | YZV" for Sept-Îles and, on a
// diverted PAL row (PB852, gate A30), "Iles-De-La-Madeleine" with no code
// for Îles-de-la-Madeleine.
//
//   1. The city tables wrote three Québec names without their accents:
//      SEPT-ILES, GASPE and (in CITY, though CITY_FR had it right)
//      RIVIERE-DU-LOUP. The official names, in English and in French, are
//      Sept-Îles, Gaspé and Rivière-du-Loup.
//   2. The casing capitalised every word ('Iles-De-La-Madeleine'); the
//      shared casing (tc) keeps a place's small words small, and three
//      surfaces that cased a city on their own (the phone gate's title, the
//      destination video's caption, the gate's hotel ads) take it now too.
//   3. A row whose feed gives the name and no code. The board's name index
//      (_normCityKey) dropped an accented letter instead of folding it, so
//      our 'ÎLES-DE-LA-MADELEINE' keyed as 'lesdelamadeleine' and no feed's
//      'Iles de la Madeleine' ever met it. The feed parser's own lookup keeps
//      hyphens and spaces apart, so it missed too; and the board's row, with
//      no code, used the bare casing, which drops a code already on the label.
//      Such a row now finds its airport (only where one airport has that
//      name) and reads as the coded rows do: 'Îles-de-la-Madeleine | YGR', in
//      every board language.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, 'fids-current', p), 'utf8');
const CORE = read('js/fids-core.js');
const SHARED = read('js/shared-names.js');
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];

function blockFrom(src, at) {
  let depth = 0, j = src.indexOf('{', at);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) break;
  }
  return src.slice(at, j + 1);
}
// The LAST definition is the one a page runs (a later function declaration
// of the same name replaces an earlier one).
function fnSource(name) {
  const i = CORE.lastIndexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  return blockFrom(CORE, i + 1);
}
function tableSource(src, decl) {
  const i = src.indexOf(decl);
  assert.ok(i >= 0, decl + ' must exist');
  const body = blockFrom(src, i);
  return body.slice(body.indexOf('{'));
}
const table = (src, decl) => vm.runInNewContext('(' + tableSource(src, decl) + ')');
const CITY = table(CORE, 'const CITY = {');
const CITY_FR = table(CORE, 'const CITY_FR = {');
const SHARED_CITY = table(SHARED, 'window.FIDS_SHARED_CITY = {');
const AP = table(CORE, 'const AP = {');
function between(a, b) {
  const i = CORE.indexOf(a);
  assert.ok(i >= 0, 'marker: ' + a);
  const j = CORE.indexOf(b, i);
  assert.ok(j > i, 'marker: ' + b);
  return CORE.slice(i, j);
}

// The board's own city helpers, out of fids-core.js, with its tables.
function helpers() {
  const upAt = CORE.indexOf('const _UPPER_TOKENS');
  const src = [
    'var AIRPORT_DISPLAY_IATA = { YHU: "MET" };',
    CORE.slice(upAt, CORE.indexOf(']);', upAt) + 3),
    CORE.slice(CORE.indexOf('var _CITY_CODE_TAIL = '), CORE.indexOf('\n', CORE.indexOf('var _CITY_CODE_TAIL = '))),
    'var AP_LIST = ' + CORE.slice(CORE.indexOf('[', CORE.indexOf('const AP_LIST = [')), CORE.indexOf('\n];', CORE.indexOf('const AP_LIST = [')) + 2) + ';',
    'var _CITY2IATA = null;',
    'var _CITY2IATA_ALIAS = ' + tableSource(CORE, 'var _CITY2IATA_ALIAS = {') + ';',
    ...['_dispIata', '_realIata', 'tc', 'airportCityNameSafe_v21877', '_isRealApCode', 'normalizeDisplayCity',
      '_normCityKey', '_iataFromCityName', 'formatCityIata', '_stripCityCode', '_cityHasCode', 'cityCode'].map(fnSource),
    // the feed parser's lookup for a row with no code (fetchLive's ADB parse)
    'function parseLoc(locIata, cityName) {',
    between('    if (!locIata && cityName) {', '    let locName=formatCityIata('),
    "  return { locIata: locIata, locName: formatCityIata(CITY[locIata] || cityName || locIata || '—', locIata) };",
    '}',
    // the departures/arrivals board row's destination text (render())
    'function rowCity(f, isDep, lang) {',
    between('    const loc       = isDep ? f.dest : f.origin;', '    // v23925 — the row as shown (_fidsShownRow)'),
    '  return cityDisp;',
    '}',
    'return { tc, formatCityIata, _iataFromCityName, parseLoc, rowCity };'
  ].join('\n');
  return new Function('CITY', 'CITY_FR', 'AP', 'getLang', src)(CITY, CITY_FR, AP, () => 'en');
}

const OFFICIAL = {
  YZV: ['SEPT-ÎLES', 'Sept-Îles'],
  YRI: ['RIVIÈRE-DU-LOUP', 'Rivière-du-Loup'],
  YGP: ['GASPÉ', 'Gaspé'],
  YYY: ['MONT-JOLI', 'Mont-Joli'],
  YUY: ['ROUYN-NORANDA', 'Rouyn-Noranda'],
  YVO: ["VAL-D'OR", "Val-d'Or"],
  YGR: ['ÎLES-DE-LA-MADELEINE', 'Îles-de-la-Madeleine'],
  YMT: ['CHIBOUGAMAU', 'Chibougamau'],
  YVP: ['KUUJJUAQ', 'Kuujjuaq']
};

test('Québec names are written as the places write them, in every table that holds them', () => {
  for (const [code, [upper]] of Object.entries(OFFICIAL)) {
    assert.equal(CITY[code], upper, 'CITY.' + code);
    assert.equal(SHARED_CITY[code], upper, 'shared-names.js (the companion app) ' + code);
    if (code in CITY_FR) assert.equal(CITY_FR[code], upper, 'CITY_FR.' + code);
  }
  // one entry per key in each table (a second, later one would win silently)
  for (const [name, src, decl] of [['CITY', CORE, 'const CITY = {'], ['CITY_FR', CORE, 'const CITY_FR = {'],
    ['FIDS_SHARED_CITY', SHARED, 'window.FIDS_SHARED_CITY = {']]) {
    const body = tableSource(src, decl);
    for (const code of Object.keys(OFFICIAL)) {
      const n = (body.match(new RegExp('(^|[\\s,{])' + code + '\\s*:', 'g')) || []).length;
      assert.ok(n <= 1, `${name} holds ${code} ${n} times`);
    }
  }
});

test('the shared casing writes each name as the place does', () => {
  const { tc } = helpers();
  for (const [upper, cased] of Object.values(OFFICIAL)) assert.equal(tc(upper), cased);
  assert.equal(tc('ILES-DE-LA-MADELEINE'), 'Iles-de-la-Madeleine', 'never "Iles-De-La-Madeleine"');
});

test('the casing a surface did on its own is gone: the phone gate, the destination video, the hotel ads', () => {
  const js = CORE.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(js, /_fidsTitleCase\(\s*(s|destCity)\.toLowerCase\(\)\s*\)/,
    'a city cased word by word reads "Îles-De-La-Madeleine"; use tc()');
});

test('a name with no code finds its airport whatever its accents, hyphens and capitals', () => {
  const { _iataFromCityName } = helpers();
  for (const [name, code] of [['ILES-DE-LA-MADELEINE', 'YGR'], ['Iles de la Madeleine', 'YGR'], ['Îles-de-la-Madeleine', 'YGR'],
    ['Sept Iles', 'YZV'], ['SEPT-ILES', 'YZV'], ['Riviere du Loup', 'YRI'], ['Gaspe', 'YGP'], ['Rouyn Noranda', 'YUY'],
    ['Val d Or', 'YVO']]) {
    assert.equal(_iataFromCityName(name), code, name);
  }
  // and still never guesses a city with two of our airports
  for (const name of ['Montreal', 'Montréal', 'Toronto', 'Houston']) assert.equal(_iataFromCityName(name), '', name);
});

test('the feed parser gives a codeless row its airport, and the airport\'s own name', () => {
  const { parseLoc } = helpers();
  for (const name of ['ILES-DE-LA-MADELEINE', 'Iles de la Madeleine']) {
    const r = parseLoc('', name);
    assert.equal(r.locIata, 'YGR', name);
    assert.equal(r.locName, 'Îles-de-la-Madeleine | YGR', name);
  }
  assert.deepEqual(parseLoc('', 'Sept Iles'), { locIata: 'YZV', locName: 'Sept-Îles | YZV' });
  // a coded row, as YUL's feed sends PB852 and AC7738
  assert.deepEqual(parseLoc('YGR', 'Iles de la Madeleine'), { locIata: 'YGR', locName: 'Îles-de-la-Madeleine | YGR' });
  assert.deepEqual(parseLoc('YZV', 'Sept Iles'), { locIata: 'YZV', locName: 'Sept-Îles | YZV' });
  // a name none of our tables holds stays as the feed wrote it, with no code
  assert.deepEqual(parseLoc('', 'Somewhere Else'), { locIata: '', locName: 'Somewhere Else' });
});

test('a diverted row named "ILES-DE-LA-MADELEINE" with no code reads "Îles-de-la-Madeleine | YGR" in every board language', () => {
  const { rowCity } = helpers();
  for (const lang of LANGS) {
    // straight off a feed that gave no code
    assert.equal(rowCity({ dest: 'ILES-DE-LA-MADELEINE', _locIata: '', status: 'diverted' }, true, lang), 'Îles-de-la-Madeleine | YGR', lang);
    assert.equal(rowCity({ dest: 'Iles de la Madeleine', _locIata: '', status: 'diverted' }, true, lang), 'Îles-de-la-Madeleine | YGR', lang);
    // a label that already carries its code keeps it
    assert.equal(rowCity({ dest: 'Iles de la Madeleine | YGR', _locIata: '', status: 'diverted' }, true, lang), 'Îles-de-la-Madeleine | YGR', lang);
    // the coded row YUL's feed sends
    assert.equal(rowCity({ dest: 'Îles-de-la-Madeleine | YGR', _locIata: 'YGR', status: 'diverted' }, true, lang), 'Îles-de-la-Madeleine | YGR', lang);
    assert.equal(rowCity({ dest: 'Sept-Îles | YZV', _locIata: 'YZV', status: 'delayed' }, true, lang), 'Sept-Îles | YZV', lang);
    // an arrival from there, the same way
    assert.equal(rowCity({ origin: 'ILES-DE-LA-MADELEINE', _locIata: '' }, false, lang), 'Îles-de-la-Madeleine | YGR', lang);
  }
});

test('a codeless row keeps any other wording the feed chose, and a name we do not know stays as it came', () => {
  const { rowCity, formatCityIata } = helpers();
  assert.equal(formatCityIata('Raleigh/Durham', '', 'en'), 'Raleigh/Durham | RDU', 'the feed\'s own words, with the code');
  assert.equal(rowCity({ dest: 'Somewhere Else', _locIata: '' }, true, 'en'), 'Somewhere Else');
  assert.equal(rowCity({ dest: 'Toronto', _locIata: '' }, true, 'en'), 'Toronto', 'two of our airports: no code guessed');
  assert.equal(rowCity({ dest: '', _locIata: '' }, true, 'en'), '—');
});

test('the belts and the phone screens read a codeless row the same way as the board', () => {
  const js = CORE.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(js, /f\._locIata \? formatCityIata\([^;]*: normalizeDisplayCity\(/,
    'a row with no code is formatted, not just cased (the bare casing drops a code already on its label)');
});
