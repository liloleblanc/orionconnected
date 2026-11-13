'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EVERY AIRPORT OF THE AMERICAS THAT HAS A NAME PRINTS IT, ON EVERY SCREEN
//
// Reported from a live gate: Montréal's A68, a flight to Río Hato in Panama
// (RIH). The gate printed its destination as 'Rih' and its map label as
// 'To RIH'. The board's own name tables (CITY and CITY_FR in fids-core.js)
// had no entry for RIH, and a code in neither table printed as the code
// itself. The name existed: the map under the rows has had 'Río Hato' since
// v24070, in its own table (js/earth-places.js NAME, from OurAirports), with
// the names of 1,055 places of North, Central and South America and the
// Caribbean that the board's tables do not name. No other screen read it.
//
// THE RULE
//   · A place is of the Americas by its clock: a zone of America/ (Greenland
//     is in), or Bermuda, the Falklands, South Georgia, Galápagos, Easter
//     Island or Hawaii; a place left with no zone on purpose, by its
//     longitude (170°W to 30°W).
//   · Where CITY and CITY_FR have no name for a code of the Americas and the
//     table has one, every screen that prints a place prints that name: the
//     gate's destination and origin, its map label, the departures and
//     arrivals rows, the belt sign, the phone screens, the companion app, the
//     destination card, the weather card. Cased as every name is ('Río
//     Hato'), with its accent as the table writes it.
//   · A name that is another place's too is printed with where it is, as the
//     map prints it: 'London, KY', 'Valencia, Venezuela' (the country in the
//     language on screen). A city's second airport takes the city's name, and
//     its French name on a French board (Détroit for DET). Another place's:
//     one CITY names elsewhere (IN, v24073), or another place of the table
//     itself (IN_MORE: Salinas in California, in Ecuador and in Brazil all
//     printed 'Salinas'). A country is spelt as the board's own French
//     spells it (Belize, Venezuela, never fr-CA's Bélize and Vénézuéla), and
//     where no country's name can be had the name prints bare, never with
//     the country's two letters ('Valencia, Ve' on a browser with no
//     Intl.DisplayNames; 'Orán, AR' read as Arkansas).
//   · A place outside the Americas prints exactly what it printed: a code the
//     tables do not name still prints as the code.
//   · A code the feed never sent is never named from the table: a row whose
//     code was cut from an ICAO code (Belgrade's LYBE reads YBE, which is
//     Uranium City's), and a row with no code at all, print as before.
//     A CODE THE FEED HAS ITSELF SENT, in its IATA field, on that page,
//     outranks the cut: one row with CYHI alone took the name from every
//     row the feed codes YHI for the life of a page that lives for weeks.
//     The row that was cut still reads the tables alone as it is mapped.
//   · A via stop is the bare name ('London', not 'London, KY': in a list of
//     stops a comma reads as one more stop).
//   · Nothing is copied into CITY: the name indexes that find a row's code
//     from its words, the reading of a last word as a code ('West End' is
//     not 'West | END'), the photo search and the weather query read the
//     board's tables alone, as before.
//
// The board is the whole fids-core.js, run in a page of its own with the
// scripts the pages load before it (scripts/names/americas-list.js board),
// with the table and without it. The lines a gate prints a place with are
// cut from its source and run there, so what is held is the board's code.
// The list of every airport of the Americas the boards name is
// docs/airport-names-americas.md, held to the same board at the end.
// (tests/earth-places.test.js compares the two boards over 33,000 feed rows.)
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'fids-current', 'js');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'fids-current', 'app.html'), 'utf8');
const LIST = require(path.join(ROOT, 'scripts', 'names', 'americas-list.js'));
const PLACES = require(path.join(JS, 'earth-places.js'));
const E = require(path.join(JS, 'fids-earth.js'));
const BS = require(path.join(JS, 'board-strings.js'));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const NINE = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
// a country's name in a language, in the board's locale (fids-earth.js
// boardFns regionName); the board's own French where the browser's fr-CA
// differs from it (CITY_FR writes BELIZE: js/earth-places.js REGION_FR)
const FR_OWN = { BZ: 'Belize', VE: 'Venezuela' };
const regionNameOf = (cc, l) => { if (l === 'fr' && own(FR_OWN, cc)) return FR_OWN[cc]; try { return new Intl.DisplayNames([BS.intl(l)], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; } };

// the board with the table of the Americas, as the pages load it, and without
let WITH_ = null, WITHOUT_ = null;
const withTable = () => WITH_ || (WITH_ = LIST.board(ROOT));
const without = () => WITHOUT_ || (WITHOUT_ = LIST.board(ROOT, { places: false }));
let BUILT_ = null;
const built = () => BUILT_ || (BUILT_ = LIST.build(ROOT));
let TABLES_ = null;
const tables = () => TABLES_ || (TABLES_ = { CITY: without().__table('CITY'), CITY_FR: without().__table('CITY_FR') });

// ── the rule, worked out from the table's data ─────────────────────────────

const ISLES = ['Atlantic/Bermuda', 'Atlantic/Stanley', 'Atlantic/South_Georgia', 'Pacific/Galapagos', 'Pacific/Easter', 'Pacific/Honolulu'];
function ofAmericas(c) {
  const z = PLACES.zones[c];
  if (z) return z.startsWith('America/') || ISLES.includes(z);
  return PLACES.NONE.includes(c) && own(PLACES.AT, c) && PLACES.AT[c][1] > -170 && PLACES.AT[c][1] < -30;
}
const AMERICAS = Object.keys(PLACES.NAME).filter(ofAmericas).sort();
const ELSEWHERE = Object.keys(PLACES.NAME).filter((c) => !ofAmericas(c)).sort();
// The name a board prints for one of them in a language, as the table writes
// it: NAME; with its state's or province's letters, or its country's name in
// that language, where IN or IN_MORE says the name is another place's too
// (inOf reads both); the city's
// own French name, cased as the board cases every name, where OF says the
// place is a second airport of a city CITY_FR writes otherwise.
function want(c, l) {
  const { CITY, CITY_FR } = tables();
  const n = PLACES.NAME[c], of = PLACES.OF[c], w = PLACES.inOf(c);
  if (of) return (l === 'fr' && CITY_FR[of] && CITY_FR[of] !== CITY[of]) ? without().tc(CITY_FR[of]) : n;
  if (!w) return n;
  const st = /^(?:US|CA)-([A-Z]{2})$/.exec(w);
  return n + ', ' + (st ? st[1] : regionNameOf(w, l));
}

// ── the gate's own lines, cut from fids-core.js and run on a board ─────────

const cut = (a, b, whole) => { const i = CORE.indexOf(a), j = CORE.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return CORE.slice(i, whole ? j + b.length : j); };
const blockOf = (head) => { const i = CORE.indexOf(head); assert.ok(i >= 0, head); let d = 0, j = CORE.indexOf('{', i); for (; j < CORE.length; j++) { if (CORE[j] === '{') d++; else if (CORE[j] === '}' && --d === 0) break; } return CORE.slice(i, j + 1); };
const line = (re) => { const m = re.exec(CORE); assert.ok(m, String(re)); return m[1]; };
const GATE_SRC = [
  // the rail's Destination shelf (the gate printed 'Rih' here)
  'var __railDest = function (locIata, currentFlight) {', cut("      var _destCityName = '';", '      var _destCityHtml = '), ' return _destCityName; };',
  // the boarding row's Destination
  'var __boardDest = function (locIata, currentFlight) {', cut("    var _bDest = '';", '    // v23688 — the code the destination badge wears while boarding'), ' return _bDest; };',
  // the Your Aircraft line's origin
  'var __aircraftFrom = function (_origIata, _ib) {', cut('      // Origin display: "Calgary (YYC)"', 'var _origDisplay = '), ' return _origCity; };',
  // the inbound panel's origin
  'var __inboundFrom = function (inboundFlight) {', cut("    var _fromIata = inboundFlight._locIata || '';", "    } catch(e) { _fromCity = inboundFlight.origin || ''; }", true), ' return _fromCity; };',
  // the phone gate: its destination and its inbound origin, through its own city cleaner
  'var __phone = function (loc, locIata, currentFlight, _inb) {', blockOf('  function _cleanCity(s){'),
  "  var dest = tc(loc || currentFlight.dest || currentFlight._locCity || '—'), destIata = locIata || currentFlight._locIata || '';",
  cut('  var _destAmWhere = false;', "  var _destCity = _cleanCity(dest, _destAmWhere) || destIata || '—';", true),
  cut("      var _fromIata = _inb._locIata || '';", "      if (typeof _cityAp === 'function') _fromCity = _cityAp(_fromCity, _fromIata);", true),
  ' return { dest: _destCity, from: _fromCity }; };',
  // the 3D map's place names (_map3dFlightCtx)
  'var __map3dCity = function (ia) {', cut('    var cityOf = function (ia) {', '    var _hav = function (a, b) {'), ' return cityOf(ia); };',
  // the destination card's city, as loadDestInfoForGate cases it
  'var __destCard = function (locIata) { ' + line(/\n        (var _destCity = CITY\[locIata\] \|\| _cityForIata\(locIata\) \|\| locIata;)/) + ' return tc(_destCity || locIata); };',
  // the gate's photo search (a query, never a print)
  'var __photo = function (locIata) { return ' + line(/var cityName = (CITY\[locIata\] \|\| _cityForIata\(locIata, true\) \|\| '');\n  if \(cityName\) \{\n    var ov = await fetchOpenversePhoto/) + '; };',
  // the weather card's title
  'var __wxCard = function (dest) { var city = ""; ' + line(/\n(    try \{ city = \(typeof CITY !== 'undefined' && CITY\[dest\]\)[^\n]*\n    if \(typeof tc === 'function'\) \{ try \{ city = tc\(city\); \} catch \(e2\) \{\} \})/) + ' return city; };',
  // the departures and arrivals row (render)
  'var __row = function (f, isDep, lang) {', cut('    const loc       = isDep ? f.dest : f.origin;', '    // v23925 — the row as shown (_fidsShownRow)'), '  return cityDisp; };',
  // the ads that print the destination
  'var __adStays = function (f) { ' + line(/\n    (const cityName = \(CITY\[f\._locIata\] [^\n]*;)/) + ' return tc(cityName); };',
  'var __adVideo = function (destIata, cf) { ' + line(/\n  (var destCity = \(typeof CITY !== 'undefined' && CITY\[destIata\]\) [^\n]*;)/) + ' return tc(destCity); };',
  'var __adHotel = function (destIata, cf) { var destCity = ""; ' + line(/\n      (destCity = \(typeof CITY !== 'undefined' && CITY\[destIata\]\) [^\n]*;)/) + ' return tc(destCity); };',
  'var __adFull = function (_gIata) { var _gCity = ""; ' + line(/\n      (_gCity = \(typeof CITY !== 'undefined' && CITY\[_gIata\]\)\n[^;]*;)/) + ' return tc(_gCity); };'
].join('\n');
const GATED_ = new Map();
const gate = (B) => { if (!GATED_.has(B)) { vm.runInContext(GATE_SRC, B); GATED_.set(B, true); } return B; };

// a feed row as the feeds send it (the AeroDataBox shape), an hour from now
const FLIGHT_AT = new Date(Math.floor(Date.now() / 3600000) * 3600000 + 3600000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
const feedRow = (ap, i, dep) => {
  const t = { local: FLIGHT_AT, utc: FLIGHT_AT }, base = { number: 'TS ' + (200 + i), airline: { iata: 'TS', name: 'Air Transat' }, status: 'Expected' };
  return dep === false ? Object.assign(base, { arrival: { scheduledTime: t }, departure: { airport: ap, scheduledTime: t } })
    : Object.assign(base, { departure: { scheduledTime: t }, arrival: { airport: ap, scheduledTime: t } });
};
// a through flight as Orlando's feed sends it: its stops as codes, before a final stop CITY names
const through = (B, vias) => { B.__setLang('en'); return [...B.mapADB({ departures: vias.map((v, i) => Object.assign(feedRow({ iata: 'ALB' }, i), { _mcoViaStop: v })) }, 'dep')]; };
const mapped = (B, aps, dep) => { B.__setLang('en'); return B.mapADB({ [dep === false ? 'arrivals' : 'departures']: aps.map((a, i) => feedRow(a, i, dep)) }, dep === false ? 'arr' : 'dep'); };

// Every way a screen prints the place at the other end of a flight, for a
// code and a language: [surface, what it prints].
function surfaces(B, c, l, f) {
  gate(B); B.__setLang(l);
  const out = [];
  const p = (name, v) => out.push([name, String(v)]);
  // language by language
  p('row', B.__row(f, true, l));
  p('belt, phone', B.formatCityIata(f.dest || f._locIata, f._locIata, l));
  p('belt sign city', B._b5CityHtml({ _locIata: c, origin: f.dest }, { L: [l] }).city);
  p('cityCode', B.cityCode(c, '', l));
  p('gate map label', B._gateMapCity(c, l));
  p('name for a code', B.airportCityNameSafe_v21877(c, l));
  // in the board's language of the moment
  p('via stop', JSON.parse(decodeURIComponent(/data-destflip="([^"]*)"/.exec(String(B._destFlipStops([{ iata: c, city: '' }, { iata: 'YYZ', city: 'Toronto' }], 'c')))[1]))[0].c);
  return out;
}
// The surfaces that read CITY, in English whatever the language on screen,
// as they print every place CITY names.
function gateSurfaces(B, c, f) {
  gate(B); B.__setLang('en');
  const out = [];
  const p = (name, v) => out.push([name, String(v)]);
  p('rail destination', B.__railDest(c, f));
  // (the boarding row's is markup: its text)
  p('boarding row destination', String(B.__boardDest(c, f)).replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
  p('Your Aircraft origin', B.__aircraftFrom(c, { origin: 'Scarlett Martinez Intl' }));
  p('inbound panel origin', B.__inboundFrom({ _locIata: c, origin: 'Scarlett Martinez Intl' }));
  const ph = B.__phone(f.dest, c, f, { _locIata: c, origin: 'Scarlett Martinez Intl' });
  p('phone gate destination', B._stripCityCode(ph.dest)); p('phone gate origin', ph.from);
  p('later at this gate', B._gateLaterPlace(f).city);
  p('destination card', B.__destCard(c));
  p('weather card title', B.__wxCard(c));
  p('weather strip label', B.tc(B._cityForIata(c)));
  p('3D map place', B.tc(B.__map3dCity(c)));
  p('ad: stays', B.__adStays(f)); p('ad: video', B.__adVideo(c, f)); p('ad: hotels', B.__adHotel(c, f)); p('ad: full', B.__adFull(c));
  return out;
}

// ── 1. the Americas ────────────────────────────────────────────────────────

test('the Americas: the places whose clock is a zone of America/ or an island of the Americas, and the ones with no zone on purpose between 170°W and 30°W: 1,055 that the board\'s tables do not name', () => {
  const every = new Set(Object.keys(PLACES.NAME).concat(Object.keys(PLACES.AT), Object.keys(PLACES.zones), PLACES.NONE));
  for (const c of every) assert.equal(PLACES.americas(c), ofAmericas(c), c);
  assert.equal(AMERICAS.length, 1055);
  const byZone = AMERICAS.filter((c) => (PLACES.zones[c] || '').startsWith('America/')), isles = AMERICAS.filter((c) => ISLES.includes(PLACES.zones[c])), noZone = AMERICAS.filter((c) => !PLACES.zones[c]);
  assert.equal(byZone.length, 1036);
  assert.deepEqual(isles, ['GPS', 'IBB', 'MPN', 'NGF', 'PSY', 'SCY'], 'Galápagos, the Falklands, Hawaii');
  assert.deepEqual(noZone, ['CAF', 'KIF', 'LBR', 'SUR', 'WNN', 'XKS', 'YAX', 'YER', 'YFH', 'YLH', 'YPL', 'YTL', 'YWP'], 'Ontario\'s far north and south-west Amazonas');
  // the reported one, and the edges
  assert.equal(PLACES.zones.RIH, 'America/Panama'); assert.equal(PLACES.NAME.RIH, 'Río Hato'); assert.ok(AMERICAS.includes('RIH'));
  for (const c of ['YHI', 'YSG', 'NAQ', 'THU', 'CNP', 'LOZ', 'VLN', 'DET', 'IRZ', 'MPN', 'NGF']) assert.ok(AMERICAS.includes(c), c + ' is in (Greenland by its zones, America/Nuuk, America/Thule, America/Scoresbysund)');
  // (Sakha has no zone and is not between 170°W and 30°W; Midway, Tahiti,
  // the Azores and Cape Verde are another ocean's)
  for (const c of ['SUK', 'MDY', 'BOB', 'SID', 'BVC', 'ABJ', 'CMB', 'BWE']) assert.ok(PLACES.NAME[c] && !AMERICAS.includes(c), c + ' is out');
  for (const z of ['America/Panama', 'America/Nuuk', 'America/Argentina/Ushuaia', 'Pacific/Honolulu', 'Atlantic/Stanley', 'Pacific/Galapagos', 'Pacific/Easter', 'Atlantic/Bermuda']) assert.equal(PLACES.americasZone(z), true, z);
  for (const z of ['Pacific/Midway', 'Pacific/Tahiti', 'Pacific/Pago_Pago', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Atlantic/Reykjavik', 'Europe/London', 'Antarctica/Palmer', '', null]) assert.equal(PLACES.americasZone(z), false, String(z));
  // each has a position, and none is named by a table of the board's or the app's
  const { CITY, CITY_FR } = tables();
  const SHARED = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: SHARED });
  for (const c of AMERICAS) {
    assert.ok(own(PLACES.AT, c), c + ' has a position');
    assert.ok(!CITY[c] && !CITY_FR[c] && !SHARED.FIDS_SHARED_CITY[c], c + ' is in no table of the board\'s');
  }
  // the table names a place for the boards only where it is of the Americas
  for (const c of AMERICAS) assert.ok(PLACES.label(c, 'en'), c);
  for (const c of ELSEWHERE) for (const l of ['en', 'fr']) assert.equal(PLACES.label(c, l, () => 'X', () => 'Y'), '', c + ' is outside the Americas');
  assert.equal(ELSEWHERE.length, Object.keys(PLACES.NAME).length - 1055);
  for (const c of ['YUL', 'JFK', 'ZZZ', '', null, undefined, 'rih ']) assert.equal(PLACES.label(c, 'en'), '', String(c));
  assert.equal(PLACES.label('rih', 'en'), 'Río Hato');
});

// ── 2. the name ────────────────────────────────────────────────────────────

test('the name: as the table writes it; with its state, province or country where the name is another place\'s too, the same words as the map; the city\'s French name for a city\'s second airport', () => {
  const { CITY, CITY_FR } = tables();
  const cityOf = (k, l) => (l === 'fr' && CITY_FR[k]) || CITY[k] || '';
  // the table's own answer, with the board's helpers, is the rule's
  for (const c of AMERICAS) for (const l of NINE) {
    const got = PLACES.label(c, l, cityOf, regionNameOf);
    assert.equal(PLACES.OF[c] && got === got.toUpperCase() ? without().tc(got) : got, want(c, l), c + ' ' + l);
  }
  // 74 of them carry where they are (53 whose name CITY gives a place
  // elsewhere, 21 whose name is another place's that CITY does not hold),
  // and the map prints the same words
  const where = AMERICAS.filter((c) => PLACES.inOf(c));
  assert.equal(where.length, 74);
  assert.equal(AMERICAS.filter((c) => own(PLACES.IN, c)).length, 53);
  const BF = { inTables: (c) => !!(CITY[c] || CITY_FR[c]), placeName: PLACES.nameOf, placeIn: PLACES.inOf, regionName: regionNameOf };
  for (const c of where) for (const l of NINE) assert.equal(want(c, l), E.cityNameOf(BF, c, c + ' | ' + c, l), c + ' ' + l + ': the board and the map');
  assert.equal(want('LOZ', 'en'), 'London, KY'); assert.equal(want('LOZ', 'ja'), 'London, KY');
  assert.equal(want('YHG', 'fr'), 'Charlottetown, NL'); assert.equal(want('PRX', 'es'), 'Paris, TX'); assert.equal(want('YQS', 'en'), 'St Thomas, ON');
  assert.equal(want('VLN', 'en'), 'Valencia, Venezuela'); assert.equal(want('BAI', 'en'), 'Punta Arenas, Costa Rica'); assert.equal(want('ZIC', 'en'), 'Victoria, Chile');
  assert.equal(want('VLN', 'ja'), 'Valencia, ' + regionNameOf('VE', 'ja')); assert.notEqual(regionNameOf('VE', 'ja'), 'Venezuela');

  // A COUNTRY AS THE BOARD'S OWN FRENCH SPELLS IT. The browser's fr-CA
  // writes Bélize and Vénézuéla; the board's own table writes BELIZE (BZE,
  // TZA), so one French board read 'Belize | BZE' above 'Corozal, Bélize |
  // CZH'. The table answers first for those two, whatever the browser says.
  assert.equal(without().tc(CITY_FR.BZE), 'Belize');
  for (const c of where) {
    const w = PLACES.inOf(c);
    if (own(FR_OWN, w)) assert.equal(PLACES.label(c, 'fr', cityOf, (cc) => ({ BZ: 'Bélize', VE: 'Vénézuéla' })[cc]), PLACES.NAME[c] + ', ' + FR_OWN[w], c);
  }
  assert.equal(want('VLN', 'fr'), 'Valencia, Venezuela'); assert.equal(want('CZH', 'fr'), 'Corozal, Belize'); assert.equal(want('SPR', 'fr'), 'San Pedro, Belize');
  assert.equal(want('ZIC', 'fr'), 'Victoria, Chili'); assert.equal(want('SNC', 'fr'), 'Salinas, Équateur');
  assert.deepEqual([PLACES.regionOf('ve', 'fr', () => 'Vénézuéla'), PLACES.regionOf('BZ', 'fr', () => 'Bélize'), PLACES.regionOf('VE', 'fr', () => 'Venezuela')], ['Venezuela', 'Belize', 'Venezuela']);
  // (only French, only those two: every other language and country is the
  // browser's own, accents and all: Équateur, Brésil, México)
  for (const l of NINE) for (const w of new Set(where.map((c) => PLACES.inOf(c)).filter((x) => /^[A-Z]{2}$/.test(x)))) {
    if (!(l === 'fr' && own(FR_OWN, w))) assert.equal(PLACES.regionOf(w, l, () => 'Équateur à é'), 'Équateur à é', w + ' ' + l);
    else assert.equal(PLACES.regionOf(w, l, () => 'Équateur à é'), 'Equateur a e', w);
  }

  // WHERE NO COUNTRY'S NAME CAN BE HAD (a browser with no Intl.DisplayNames,
  // or one that hands the code back as the name): the bare name, never the
  // country's two letters, which the board cased as a word ('Valencia, Ve')
  // or left reading as a state ('Orán, AR'). A state's or a province's
  // letters need no browser and stay.
  assert.equal(PLACES.label('VLN', 'en'), 'Valencia'); assert.equal(PLACES.label('VLN', 'ja', null, () => { throw new Error('none'); }), 'Valencia');
  assert.equal(PLACES.label('ORA', 'en', null, (cc) => cc), 'Orán'); assert.equal(PLACES.label('SYP', 'de', null, () => ''), 'Santiago');
  assert.equal(PLACES.label('LOZ', 'en'), 'London, KY'); assert.equal(PLACES.label('YHG', 'fr', null, () => { throw new Error('none'); }), 'Charlottetown, NL');
  const NoIntl = LIST.board(ROOT);
  NoIntl.Intl = Object.assign(Object.create(Intl), { DisplayNames: undefined });
  for (const c of where) {
    const st = /^(?:US|CA)-([A-Z]{2})$/.exec(PLACES.inOf(c));
    const exp = PLACES.NAME[c] + (st ? ', ' + st[1] : '');
    assert.equal(NoIntl._stripCityCode(NoIntl.formatCityIata(c, c, 'en')), exp, c + ' on a board with no Intl.DisplayNames');
    assert.equal(NoIntl._gateMapCity(c, 'de'), exp, c);
  }
  assert.equal(NoIntl.formatCityIata('VLN', 'VLN', 'en'), 'Valencia | VLN'); assert.equal(NoIntl.formatCityIata('VLN', 'VLN', 'fr'), 'Valencia | VLN');
  assert.equal(NoIntl.formatCityIata('ORA', 'ORA', 'en'), 'Orán | ORA'); assert.equal(NoIntl.formatCityIata('LOZ', 'LOZ', 'en'), 'London, KY | LOZ');

  // TWO PLACES OF THE TABLE ITSELF, ONE NAME (IN_MORE). IN was built against
  // CITY's names (v24073, tests/earth-places.test.js), so two places that
  // CITY holds neither of were never looked for: a gate to Salinas read the
  // same for California, Ecuador and Brazil. 21 more carry where they are:
  // 19 that share their name with another place of the table, and two whose
  // name is a territory's or a country's: Puerto Rico in Bolivia, which
  // reads as the island, and Peru in Indiana, the town of Grissom's field.
  const more = Object.keys(PLACES.IN_MORE).sort();
  assert.deepEqual(more, ['ELY', 'GUS', 'GWO', 'IAL', 'LGR', 'LYU', 'MTH', 'MUO', 'NOG', 'OLS', 'PUR', 'SCI', 'SCY', 'SNC', 'SNS', 'SPR', 'UOX', 'WMH', 'YCN', 'YSP', 'YZX']);
  const ccOf = Object.fromEntries(built().rows.map((r) => [r.code, r.cc]));
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\b(SAINTE?|STE?)\b/g, 'ST').trim();
  const km = (a, b) => { const r = Math.PI / 180, d = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(Math.min(1, d))); };
  const sameName = (c) => Object.keys(PLACES.NAME).filter((d) => d !== c && fold(PLACES.NAME[d]) === fold(PLACES.NAME[c]));
  for (const c of more) {
    const w = PLACES.IN_MORE[c];
    assert.ok(AMERICAS.includes(c) && !own(PLACES.IN, c) && !own(PLACES.OF, c), c);
    assert.equal(PLACES.inOf(c), w); assert.match(w, /^(US|CA)-[A-Z]{2}$|^[A-Z]{2}$/, c);
    assert.equal(w.slice(0, 2), ccOf[c], c + ': the country the list gives it, from its clock and the board\'s country table');
    assert.ok(!Object.values(CITY).some((v) => fold(v) === fold(PLACES.NAME[c])), c + ': CITY gives the name to no place, which is why IN never held it');
    if (c === 'PUR' || c === 'GUS') continue;
    // another place of the table has the name: in another country, or more than 100 km away
    const others = sameName(c);
    assert.ok(others.length, c + ' ' + PLACES.NAME[c]);
    for (const d of others) assert.ok(km(PLACES.AT[c], PLACES.AT[d]) > 100 || (ccOf[d] && ccOf[d] !== ccOf[c]), c + ' and ' + d);
  }
  // (Puerto Rico, Bolivia: the town's name is a territory's in the list's own country table)
  assert.equal(PLACES.NAME.PUR, LIST.COUNTRY.PR); assert.equal(PLACES.zones.PUR, 'America/La_Paz'); assert.equal(want('PUR', 'en'), 'Puerto Rico, Bolivia');
  // (Peru, Indiana: the town's name is a country's in the same table. The
  // field is Grissom Air Reserve Base, a joint-use field with no airline,
  // and the FAA's record gives it to Peru, 14 km to its north.)
  assert.equal(PLACES.NAME.GUS, LIST.COUNTRY.PE); assert.equal(PLACES.zones.GUS, 'America/Indiana/Indianapolis'); assert.equal(PLACES.IN_MORE.GUS, 'US-IN');
  for (const l of NINE) assert.equal(want('GUS', l), 'Peru, IN', l);
  assert.deepEqual([sameName('PUR'), sameName('GUS')], [[], []]);
  assert.equal(want('SNS', 'en'), 'Salinas, CA'); assert.equal(want('SNC', 'en'), 'Salinas, Ecuador'); assert.equal(want('IAL', 'en'), 'Salinas, Brazil');
  assert.equal(want('MTH', 'ja'), 'Marathon, FL'); assert.equal(want('YSP', 'fr'), 'Marathon, ON'); assert.equal(want('YZX', 'en'), 'Greenwood, NS');
  assert.equal(want('NOG', 'es'), 'Nogales, México'); assert.equal(want('OLS', 'es'), 'Nogales, AZ'); assert.equal(want('SCY', 'en'), 'San Cristóbal, Ecuador');
  // (Oxford in Mississippi and San Pedro in Belize: their namesakes are
  // outside the Americas, where no board prints the table's name)
  assert.equal(want('UOX', 'en'), 'Oxford, MS'); assert.equal(PLACES.label('OXF', 'en'), ''); assert.equal(want('SPR', 'en'), 'San Pedro, Belize'); assert.equal(PLACES.label('SPY', 'en'), '');
  // NO TWO OF THE 1,055 PRINT THE SAME WORDS unless they are one town's
  // airports (within 100 km, in one country). Written out, the two pairs
  // that still do: Aappilattoq, two villages of Greenland 1,496 km apart,
  // which no state or country can tell apart; and Columbus, Mississippi's
  // and Ohio's second airports, whose cities CITY itself prints alike (GTR
  // and CMH, as before this change).
  const byLabel = new Map();
  for (const c of AMERICAS) { const k = want(c, 'en'); if (!byLabel.has(k)) byLabel.set(k, []); byLabel.get(k).push(c); }
  const alike = [];
  for (const cs of byLabel.values()) for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    if (!(km(PLACES.AT[cs[i]], PLACES.AT[cs[j]]) <= 100 && ccOf[cs[i]] === ccOf[cs[j]])) alike.push(cs[i] + ' ' + cs[j] + ' ' + want(cs[i], 'en'));
  }
  assert.deepEqual(alike, ['AOQ QUV Aappilattoq', 'CBM OSU Columbus']);
  assert.ok(km(PLACES.AT.AOQ, PLACES.AT.QUV) > 1400 && ccOf.AOQ === 'GL' && ccOf.QUV === 'GL');
  assert.deepEqual([PLACES.OF.CBM, PLACES.OF.OSU, CITY.GTR, CITY.CMH], ['GTR', 'CMH', 'COLUMBUS', 'COLUMBUS']);

  // 103 are a city's own other airport: the nearest airport of that name in
  // CITY, read without accents, case or St and Saint, never one IN places
  const pair = (v) => (v ? [+(v.lat != null ? v.lat : v[0]), +(v.lon != null ? v.lon : (v.lng != null ? v.lng : v[1]))] : null);
  const B0 = without(), COORDS = B0.__table('COORDS'), GATE_AP = B0.__table('GATE_AP');
  const at = (c) => pair(COORDS[c]) || pair(B0.AIRPORT_COORDS[c]) || pair(GATE_AP[c]) || pair(PLACES.AT[c]);
  const byName = new Map();
  for (const [d, v] of Object.entries(CITY)) { const k = fold(v); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(d); }
  const nearest = {};
  for (const c of AMERICAS) {
    if (PLACES.inOf(c)) continue;
    const same = (byName.get(fold(PLACES.NAME[c])) || []).filter((d) => d !== c);
    if (!same.length) continue;
    const far = same.map((d) => [d, km(at(c), at(d))]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    nearest[c] = far[0][0];
    assert.ok(far[0][1] <= 100, c + ' is within 100 km of ' + far[0][0] + ', its city\'s airport');
  }
  assert.equal(Object.keys(nearest).length, 103);
  assert.deepEqual(PLACES.OF, nearest, 'OF is each one\'s city, the nearest airport of that name in CITY');
  for (const [c, d] of Object.entries(PLACES.OF)) { assert.ok(CITY[d], d); assert.ok(!own(PLACES.OF, d), d); assert.equal(PLACES.cityCodeOf(c), d); }
  assert.equal(PLACES.cityCodeOf('RIH'), ''); assert.equal(PLACES.cityCodeOf('det'), 'DTW');
  // Alexandria's England Air Park is Louisiana's Alexandria, never Egypt's
  assert.equal(PLACES.OF.ESF, 'AEX'); assert.equal(PLACES.OF.DET, 'DTW'); assert.equal(PLACES.OF.TMB, 'MIA'); assert.equal(PLACES.OF.YRO, 'YOW');
  // the ones a French board writes otherwise, today
  const french = Object.fromEntries(Object.keys(PLACES.OF).filter((c) => want(c, 'fr') !== want(c, 'en')).map((c) => [c, want(c, 'fr')]));
  assert.deepEqual(french, { DCF: 'Dominique', DET: 'Détroit', NBG: 'La Nouvelle-Orléans', NEW: 'La Nouvelle-Orléans', PNE: 'Philadelphie', TZA: 'Belize', UPB: 'La Havane', YIP: 'Détroit' });
  for (const c of Object.keys(PLACES.OF)) for (const l of NINE) if (l !== 'fr') assert.equal(want(c, l), PLACES.NAME[c], c + ' ' + l);
  // A city's second airport prints its city's own spelling: Panamá Pacífico
  // read 'Panamá City | BLB' on a board that prints 'Panama City | PTY'
  assert.equal(want('BLB', 'en'), 'Panama City'); assert.equal(PLACES.NAME.BLB.toUpperCase(), CITY.PTY);
  // Georgetown's own city airport is named for the village it stands in
  // (Ogle) in OurAirports; the table's rule is the city an airport serves,
  // and CITY names it 38 km away (GEO, Cheddi Jagan, in the same country)
  assert.equal(PLACES.OF.OGL, 'GEO'); assert.equal(want('OGL', 'en'), 'Georgetown'); assert.ok(km(PLACES.AT.OGL, at('GEO')) < 40);
  // SEVEN READ AGAIN FROM THEIR OWN SOURCES (the airport's authority, the
  // airline that sells it, its town; docs/licenses/places-data.md), where
  // OurAirports gives the airfield or the village it stands in.
  // Canefield is Dominica's second airport, 5 km from Roseau, and its
  // airline sells it as Dominica: the island CITY names by its main
  // airport, 25 km away, and in French as CITY_FR does.
  assert.equal(PLACES.OF.DCF, 'DOM'); assert.equal(CITY.DOM, 'DOMINICA'); assert.ok(km(PLACES.AT.DCF, at('DOM')) < 30);
  assert.equal(want('DCF', 'en'), 'Dominica'); assert.equal(want('DCF', 'fr'), 'Dominique'); assert.equal(want('DCF', 'es'), 'Dominica');
  // Ken Jones is Port Antonio's aerodrome; Catamayo's airport is sold as
  // Loja, the city 30 km away it was built for; Nerlerit Inaat as its
  // airport's authority and its airline spell it (the table read
  // Neerlerit), and never the town it serves, which has a heliport and a
  // code of its own; Cutral Có with no hyphen, as the national decree on
  // its aerodrome writes it (the municipality drops the accent, and a bare
  // Co at the end of a name is cased as Colorado's letters); DeRidder as
  // the city writes it.
  assert.deepEqual(['POT', 'LOH', 'CNP', 'OBY', 'CUT', 'DRI', 'GUS', 'DCF'].map((c) => PLACES.NAME[c]),
    ['Port Antonio', 'Loja', 'Nerlerit Inaat', 'Ittoqqortoormiit', 'Cutral Có', 'DeRidder', 'Peru', 'Dominica']);
  assert.notEqual(want('CNP', 'en'), want('OBY', 'en')); assert.ok(km(PLACES.AT.CNP, PLACES.AT.OBY) > 30);
  for (const c of ['POT', 'LOH', 'CNP', 'CUT', 'DRI']) { assert.equal(PLACES.inOf(c), '', c); assert.ok(!own(PLACES.OF, c), c); assert.deepEqual(sameName(c), [], c); }
  // THE CASING KEEPS THE CAPITAL INSIDE DeRidder, and that word alone: the
  // gate cases a name from its capitals, and read Deridder. No other name
  // of CITY, CITY_FR, AP or the table holds the word, so no other name is
  // cased otherwise than it was; and a bare Co still ends as a state does.
  const TC = without().tc, APT = B0.__table('AP'), CITYFR = tables().CITY_FR;
  assert.deepEqual([TC('DERIDDER'), TC('Deridder'), TC('DERIDDER | DRI'), TC('DENVER'), TC('DERBY'), TC('DE RIDDER'), TC('DES MOINES')],
    ['DeRidder', 'DeRidder', 'DeRidder | DRI', 'Denver', 'Derby', 'De Ridder', 'Des Moines']);
  const held = [];
  const word = (t, c, v) => { if (/deridder/i.test(String(v || ''))) held.push(t + ' ' + c); };
  for (const [c, v] of Object.entries(CITY)) word('CITY', c, v);
  for (const [c, v] of Object.entries(CITYFR)) word('CITY_FR', c, v);
  for (const [c, v] of Object.entries(APT)) for (const k of Object.keys(v || {})) if (typeof v[k] === 'string') word('AP', c, v[k]);
  for (const [c, v] of Object.entries(PLACES.NAME)) word('NAME', c, v);
  assert.ok(Object.keys(CITY).length > 2000 && Object.keys(CITYFR).length > 2000 && Object.keys(APT).length > 200);
  assert.deepEqual(held, ['NAME DRI']);
  assert.equal(TC('CUTRAL CÓ'), 'Cutral Có'); assert.equal(TC('CUTRAL CO'), 'Cutral CO'); assert.equal(TC('PERU, IN'), 'Peru, IN');
  // THE NAMES AS THEIR PLACES WRITE THEM: an accent the table had dropped
  // beside names that kept theirs (Río Hato next to Rio Cuarto), and five
  // misspelt or miscased
  assert.deepEqual(['CBL', 'CBV', 'CCA', 'GHU', 'GUI', 'LFR', 'LGS', 'RCU', 'RDS', 'RYO', 'SVZ', 'ULA', 'UZU', 'VMI', 'YAI', 'ZPC', 'YDO'].map((c) => PLACES.NAME[c]),
    ['Ciudad Bolívar', 'Cobán', 'Chimoré', 'Gualeguaychú', 'Güiria', 'La Fría', 'Malargüe', 'Río Cuarto', 'Rincón de los Sauces', 'Río Turbio', 'San Antonio del Táchira',
      'San Julián', 'Curuzú Cuatiá', 'Puerto Vallemí', 'Chillán', 'Pucón', 'Dolbeau-Saint-Félicien']);
  assert.deepEqual(['AAZ', 'SJX', 'INT', 'TCS', 'YJN'].map((c) => PLACES.NAME[c]), ['Quetzaltenango', 'Sarteneja', 'Winston-Salem', 'Truth or Consequences', 'Saint-Jean-sur-Richelieu']);
  // (a Río of a Spanish-speaking country of the list keeps its accent: one
  // board read 'Río Hato' beside 'Rio Cuarto'. Brazil's Rio and Texas's Del
  // Rio have none.)
  const SPANISH = new Set(['AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'GT', 'HN', 'MX', 'NI', 'PA', 'PE', 'PY', 'SV', 'UY', 'VE']);
  const rios = AMERICAS.filter((c) => /(^|[\s-])R[ií]o([\s-]|$)/.test(PLACES.NAME[c]));
  assert.deepEqual(rios.filter((c) => SPANISH.has(ccOf[c])).map((c) => PLACES.NAME[c]), ['Río Cuarto', 'Río Hato', 'Río Turbio']);
  assert.deepEqual(rios.filter((c) => !SPANISH.has(ccOf[c])).map((c) => PLACES.NAME[c]), ['Del Rio', 'Del Rio', 'Santa Isabel do Rio Negro', 'Rio de Janeiro']);
});

// ── 3. the reported gate ───────────────────────────────────────────────────

test('the reported gate: a flight to Río Hato prints Río Hato, with its accent, as its destination, on its map label, on its row, on the belt sign and in the app; without the table it printed Rih and To RIH', () => {
  const B = withTable(), B0 = without();
  const note = (X, leg) => { X._gateIata = 'YUL'; return String(X._gateMapNote({ leg, other: 'RIH', at: Date.UTC(2026, 10, 13, 20, 5) })).replace(/<[^>]*>/g, ''); };
  for (const words of ['', 'RIH', 'Rio Hato', 'Scarlett Martinez Intl']) {
    const ap = { iata: 'RIH' }; if (words) ap.name = words;
    const f = mapped(B, [ap])[0], a = mapped(B, [ap], false)[0];
    assert.equal(f._locIata, 'RIH'); assert.equal(f.dest, 'Río Hato | RIH', 'the row as the feed is read, whatever words came with the code');
    assert.equal(a.origin, 'Río Hato | RIH');
    for (const l of NINE) for (const [name, v] of surfaces(B, 'RIH', l, f)) {
      const whole = ['row', 'belt, phone', 'cityCode'].includes(name);
      assert.equal(v, name === 'name for a code' ? 'RÍO HATO' : (whole ? 'Río Hato | RIH' : 'Río Hato'), name + ' in ' + l);
    }
    for (const [name, v] of gateSurfaces(B, 'RIH', f)) assert.equal(v, 'Río Hato', name);
  }
  assert.match(note(B, 'out'), /^To Río Hato · /); assert.match(note(B, 'in'), /^From Río Hato · /);
  assert.equal(B._cityForIata('RIH'), 'RÍO HATO', 'in capitals, as CITY holds its names');
  // as it was, and still is on a page that has not loaded the table
  const f0 = mapped(B0, [{ iata: 'RIH' }])[0];
  assert.equal(f0.dest, 'Rih | RIH');
  assert.equal(gate(B0).__railDest('RIH', f0), 'Rih'); assert.equal(B0.__boardDest('RIH', f0), 'Rih');
  assert.match(note(B0, 'out'), /^To RIH · /);
  assert.equal(B0._gateMapCity('RIH', 'en'), 'RIH'); assert.equal(B0._cityForIata('RIH'), 'RIH'); assert.equal(B0.cityCode('RIH', '', 'en'), 'RIH');
  assert.equal(mapped(B0, [{ iata: 'RIH', name: 'Scarlett Martinez Intl' }])[0].dest, 'Scarlett Martinez Intl | RIH');
});

// ── 4. every one of them, on every screen ──────────────────────────────────

test('every place of the Americas the tables do not name prints its name on the gate, the gate map, the rows, the belt sign, the destination card, the weather card and the ads, in every language', () => {
  const B = withTable();
  const rows = mapped(B, AMERICAS.map((c) => ({ iata: c }))), arr = mapped(B, AMERICAS.map((c) => ({ iata: c, name: 'Some Field Intl' })), false);
  assert.equal(rows.length, AMERICAS.length); assert.equal(arr.length, AMERICAS.length);
  const by = new Map(rows.map((f) => [f._locIata, f])), byArr = new Map(arr.map((f) => [f._locIata, f]));
  const bad = [];
  let checked = 0;
  for (const c of AMERICAS) {
    const f = by.get(c), a = byArr.get(c);
    assert.ok(f && a, c + ' is a row');
    if (f.dest !== want(c, 'en') + ' | ' + c) bad.push(`${c} row: '${f.dest}'`);
    if (a.origin !== want(c, 'en') + ' | ' + c) bad.push(`${c} arrival: '${a.origin}'`);
    // a qualified name or a French one differs by language: all nine; the rest in three
    const langs = (PLACES.inOf(c) || own(PLACES.OF, c)) ? NINE : ['en', 'fr', 'ja'];
    for (const l of langs) {
      const n = want(c, l);
      for (const [name, v] of surfaces(B, c, l, f)) {
        const exp = name === 'name for a code' ? n.toUpperCase() : (['row', 'belt, phone', 'cityCode'].includes(name) ? n + ' | ' + c : n);
        checked++;
        if (v !== exp && bad.length < 30) bad.push(`${c} ${name} in ${l}: '${v}', not '${exp}'`);
      }
    }
    for (const [name, v] of gateSurfaces(B, c, f)) {
      checked++;
      if (v !== want(c, 'en') && bad.length < 30) bad.push(`${c} ${name}: '${v}', not '${want(c, 'en')}'`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(checked > 40000, checked + ' prints');
  // written out: where a name is another place's too, a city's second
  // airport, an apostrophe, a figure, a name that is its own code
  const print = (c, l) => { B.__setLang(l); return B.cityCode(c, '', l); };
  assert.equal(print('LOZ', 'fr'), 'London, KY | LOZ');
  assert.equal(print('VLN', 'en'), 'Valencia, Venezuela | VLN');
  assert.equal(print('VLN', 'fr'), 'Valencia, ' + regionNameOf('VE', 'fr') + ' | VLN');
  assert.equal(print('DET', 'en'), 'Detroit | DET'); assert.equal(print('DET', 'fr'), 'Détroit | DET');
  assert.equal(print('NEW', 'fr'), 'La Nouvelle-Orléans | NEW'); assert.equal(print('UPB', 'fr'), 'La Havane | UPB');
  assert.equal(print('COE', 'en'), "Coeur d'Alene | COE"); assert.equal(print('YSG', 'en'), "Lutselk'e | YSG"); assert.equal(print('YMH', 'en'), "Mary's Harbour | YMH");
  assert.equal(print('YAH', 'en'), 'La Grande-4 | YAH'); assert.equal(print('MOA', 'en'), 'Moa | MOA'); assert.equal(print('IRZ', 'en'), 'Santa Isabel do Rio Negro | IRZ');
  assert.equal(print('MLC', 'en'), 'McAlester | MLC'); assert.equal(print('YHI', 'en'), 'Ulukhaktok | YHI');
  assert.equal(print('SNS', 'en'), 'Salinas, CA | SNS'); assert.equal(print('SNC', 'fr'), 'Salinas, Équateur | SNC'); assert.equal(print('CZH', 'fr'), 'Corozal, Belize | CZH');
  assert.equal(print('TCS', 'en'), 'Truth or Consequences | TCS'); assert.equal(print('YJN', 'fr'), 'Saint-Jean-sur-Richelieu | YJN'); assert.equal(print('OGL', 'en'), 'Georgetown | OGL');
  assert.equal(print('BLB', 'en'), 'Panama City | BLB'); assert.equal(print('PUR', 'en'), 'Puerto Rico, Bolivia | PUR'); assert.equal(print('INT', 'en'), 'Winston-Salem | INT');
  assert.equal(print('POT', 'en'), 'Port Antonio | POT'); assert.equal(print('LOH', 'es'), 'Loja | LOH'); assert.equal(print('CNP', 'en'), 'Nerlerit Inaat | CNP'); assert.equal(print('OBY', 'en'), 'Ittoqqortoormiit | OBY');
  assert.equal(print('CUT', 'es'), 'Cutral Có | CUT'); assert.equal(print('DRI', 'en'), 'DeRidder | DRI'); assert.equal(print('GUS', 'fr'), 'Peru, IN | GUS');
  assert.equal(print('DCF', 'en'), 'Dominica | DCF'); assert.equal(print('DCF', 'fr'), 'Dominique | DCF'); assert.equal(print('DOM', 'en'), 'Dominica | DOM');

  // THE VIA STOPS OF A THROUGH FLIGHT (a stop sent as a code, as Orlando's
  // feed sends it): each of the 1,055 prints its name, bare. With its state
  // or country the text read as one stop more ('London, Ky, Albany'), and
  // the next-departure footers, which case this text again (tc), print it
  // as it is.
  const thru = through(B, AMERICAS);
  assert.equal(thru.length, AMERICAS.length);
  const viaBad = [];
  thru.forEach((f, i) => {
    const c = AMERICAS[i], exp = (own(PLACES.OF, c) ? want(c, 'en') : PLACES.NAME[c]) + ', Albany';
    if ((f.dest !== exp || B.tc(f.dest) !== exp || f._locIata !== 'ALB') && viaBad.length < 20) viaBad.push(c + ': ' + f.dest + ' / ' + B.tc(f.dest) + ', not ' + exp);
  });
  assert.deepEqual(viaBad, []);
  assert.deepEqual(through(B, ['RIH', 'LOZ', 'VLN', 'ZFM', 'AVI', 'RIH,LOZ', 'RDU', 'Raleigh']).map((f) => f.dest),
    ['Río Hato, Albany', 'London, Albany', 'Valencia, Albany', 'Fort McPherson, Albany', 'Ciego de Ávila, Albany', 'Río Hato, London, Albany', 'Raleigh, Albany', 'Raleigh, Albany']);
  // (and as before for every other stop, and on a page without the table)
  const B9 = without();
  assert.deepEqual(through(B, ELSEWHERE.slice(0, 300).concat(['YUL', 'ZZZ', 'Some Town'])).map((f) => f.dest), through(B9, ELSEWHERE.slice(0, 300).concat(['YUL', 'ZZZ', 'Some Town'])).map((f) => f.dest));
  assert.equal(through(B9, ['RIH'])[0].dest, 'Rih, Albany');
  // the phone gate keeps where the place is (its cleaner cuts a feed's
  // 'Saint_John,_NB' at the comma, and still does)
  const loz = by.get('LOZ'), ph = gate(B).__phone(loz.dest, 'LOZ', loz, { _locIata: 'LOZ', origin: '' });
  assert.equal(ph.dest, 'London, KY | LOZ'); assert.equal(ph.from, 'London, KY');
  const B0 = gate(without());
  for (const [words, code] of [['Saint_John,_NB', ''], ['Saint John, NB', 'YSJ'], ['Paris, Texas | CDG', 'CDG'], ['Abidjan, Ivory Coast | ABJ', 'ABJ']]) {
    const now = B.__phone(words, code, { _locIata: code }, { _locIata: code, origin: words }), was = B0.__phone(words, code, { _locIata: code }, { _locIata: code, origin: words });
    assert.deepEqual([now.dest, now.from], [was.dest, was.from], words);
    assert.doesNotMatch(now.dest, /,/, words + ': any other place is cut at the comma, as before');
  }
  assert.equal(B.__phone('Paris, Texas | CDG', 'CDG', { _locIata: 'CDG' }, { _locIata: 'YUL', origin: '' }).dest, 'Paris | CDG');
});

// ── 5. everywhere else, as before ──────────────────────────────────────────

test('a place outside the Americas prints what it printed: a code the tables do not name still prints as the code, and a place they name prints their name', () => {
  const B = withTable(), B0 = without(), { CITY } = tables();
  assert.ok(ELSEWHERE.length > 2100);
  const named = ['YUL', 'YYZ', 'YHU', 'JFK', 'LHR', 'CDG', 'PTY', 'HAV', 'DTW', 'MSY', 'BDA', 'IPC', 'HNL', 'YYG', 'KM8'];
  for (const c of named) assert.ok(CITY[c], c);
  const codes = ELSEWHERE.concat(named, ['ZZZ', 'QQQ']);
  const aps = codes.map((c, i) => (i % 2 ? { iata: c } : { iata: c, name: 'Some Field Intl' }));
  const rows = mapped(B, aps), rows0 = mapped(B0, aps);
  assert.equal(rows.length, codes.length); assert.equal(rows0.length, codes.length);
  const bad = [];
  rows.forEach((f, i) => {
    const f0 = rows0[i], c = f._locIata;
    assert.equal(f.flight, f0.flight);
    if (f.dest !== f0.dest || c !== f0._locIata) bad.push(`${c}: '${f0.dest}' -> '${f.dest}'`);
    for (const l of ['en', 'fr', 'ja']) {
      const a = JSON.stringify(surfaces(B, c, l, f)), b = JSON.stringify(surfaces(B0, c, l, f0));
      if (a !== b && bad.length < 20) bad.push(`${c} in ${l}: ${b} -> ${a}`);
    }
    const a = JSON.stringify(gateSurfaces(B, c, f)), b = JSON.stringify(gateSurfaces(B0, c, f0));
    if (a !== b && bad.length < 20) bad.push(`${c}: ${b} -> ${a}`);
  });
  assert.deepEqual(bad, []);
  // written out: Abidjan is named in the map's table and is not of the Americas
  const abj = mapped(B, [{ iata: 'ABJ' }])[0];
  assert.equal(abj.dest, 'Abj | ABJ');
  assert.equal(gate(B).__railDest('ABJ', abj), 'Abj'); assert.equal(B._gateMapCity('ABJ', 'en'), 'ABJ'); assert.equal(B.cityCode('ABJ', '', 'fr'), 'ABJ');
  assert.equal(B._cityForIata('ABJ'), 'ABJ'); assert.equal(B.airportCityNameSafe_v21877('ABJ', 'en'), '');
  assert.equal(mapped(B, [{ iata: 'ABJ', name: 'Abidjan Felix Houphouet-Boigny' }])[0].dest, 'Abidjan Felix Houphouet-Boigny | ABJ');
  for (const c of ELSEWHERE) assert.equal(B._placeNameAm(c, 'en'), '', c);
  for (const c of named) assert.equal(B._placeNameAm(c, 'en'), '', c + ' is the tables\'');
});

// ── 6. a code the feed never sent ──────────────────────────────────────────

test('a code the feed never sent takes no name: Belgrade\'s LYBE reads YBE and is never Uranium City; a code the feed has itself sent outranks a cut, so a coded row before or after a cut row on the same board keeps its name, and the row that was cut is mapped as before; a row with no code prints as before; the name indexes and the last-word reading do not know the table', () => {
  // (a board of its own: it notes the codes it cut from an ICAO code and the codes the feed sent)
  const B = LIST.board(ROOT), B0 = without();
  assert.equal(B._cityForIata('YBE'), 'URANIUM CITY'); assert.equal(B._cityForIata('SGG'), 'SERMILIGAAQ');
  const aps = [{ icao: 'LYBE', name: 'Belgrade Nikola Tesla' }, { icao: 'LSGG', name: 'Geneva' }, { icao: 'LYBE' }, { icao: 'MPSM', name: 'Rio Hato' }];
  const rows = mapped(B, aps), rows0 = mapped(B0, aps);
  // (rows are the board's own arrays: read here as text)
  const texts = (list) => JSON.stringify([...list].map((f) => [f._locIata, f.dest]));
  const AS_EVER = JSON.stringify([['YBE', 'Belgrade Nikola Tesla | YBE'], ['SGG', 'Geneva | SGG'], ['YBE', 'Ybe | YBE'], ['PSM', 'Portsmouth | PSM']]);
  assert.equal(texts(rows), texts(rows0));
  assert.equal(texts(rows), AS_EVER,
    'as they always read: Río Hato\'s own ICAO code, MPSM, reads Portsmouth\'s PSM, which CITY names; no name of the table is ever given to such a code');
  // while the feed has not sent the code itself, nothing prints it by name: every surface as without the table
  for (const [i, c] of [[0, 'YBE'], [1, 'SGG'], [2, 'YBE']]) {
    for (const l of ['en', 'fr', 'ja']) assert.deepEqual(surfaces(B, c, l, rows[i]), surfaces(B0, c, l, rows0[i]), c + ' ' + l);
    assert.deepEqual(gateSurfaces(B, c, rows[i]), gateSurfaces(B0, c, rows0[i]), c);
  }
  assert.equal(B._cityForIata('YBE'), 'YBE', 'and it stays so while the feed has not sent YBE'); assert.equal(B._placeNameAm('YBE', 'en'), '');
  assert.equal(B._cityForIata('YHI'), 'ULUKHAKTOK', 'the other places keep their names');

  // A CODE THE FEED HAS ITSELF SENT OUTRANKS A CUT, ON THE SAME BOARD. The
  // note of a cut alone lasted as long as the page: one row with CYHI and
  // no IATA code, and every row the feed codes YHI printed 'Yhi' from then
  // on, with the gate and the map, for weeks. Coded, then cut, then coded:
  const dests = (list) => [...list].map((f) => f.dest);
  assert.deepEqual(dests(mapped(B, [{ iata: 'YHI' }])), ['Ulukhaktok | YHI']);
  assert.deepEqual(dests(mapped(B, [{ icao: 'CYHI' }])), ['Yhi | YHI'], 'the row that was cut is mapped as before');
  assert.deepEqual(dests(mapped(B, [{ iata: 'YHI' }])), ['Ulukhaktok | YHI'], 'and the coded row after it keeps its name');
  assert.deepEqual(dests(mapped(B, [{ iata: 'YHI', icao: 'CYHI' }, { icao: 'CYHI', name: 'Ulukhaktok Holman' }])), ['Ulukhaktok | YHI', 'Ulukhaktok Holman | YHI']);
  assert.equal(B._gateMapCity('YHI', 'en'), 'Ulukhaktok'); assert.equal(B._cityForIata('YHI'), 'ULUKHAKTOK'); assert.equal(B.airportCityNameSafe_v21877('YHI', 'fr'), 'ULUKHAKTOK');
  // cut first, then coded, in one refresh and the next (arrivals too)
  assert.deepEqual(dests(mapped(B, [{ icao: 'KMTH' }])), ['Mth | MTH']); assert.equal(B._cityForIata('MTH'), 'MTH'); assert.equal(B._gateMapCity('MTH', 'en'), 'MTH');
  for (let pass = 0; pass < 2; pass++) assert.deepEqual(dests(mapped(B, [{ icao: 'KMTH' }, { iata: 'MTH' }, { icao: 'KMTH' }])), ['Mth | MTH', 'Marathon, FL | MTH', 'Mth | MTH'], 'pass ' + pass);
  assert.equal(B._gateMapCity('MTH', 'en'), 'Marathon, FL');
  assert.deepEqual([...mapped(B, [{ icao: 'KSNS' }, { iata: 'SNS', icao: 'KSNS' }], false)].map((f) => f.origin), ['Sns | SNS', 'Salinas, CA | SNS']);
  // Belgrade once more, on a board whose feed now sends YBE itself: its
  // rows are still mapped as they always were, whatever the notes say, and
  // Uranium City's own row has its name
  assert.deepEqual(dests(mapped(B, [{ iata: 'YBE' }])), ['Uranium City | YBE']);
  assert.equal(texts(mapped(B, aps)), AS_EVER); assert.equal(texts(mapped(B, aps)), texts(rows0));
  assert.deepEqual(dests(mapped(B, [{ iata: 'YBE', name: 'Uranium City Arpt' }, { icao: 'LYBE' }])), ['Uranium City | YBE', 'Ybe | YBE']);
  assert.equal(B._cityForIata('SGG'), 'SGG', 'a code that was cut and never sent stays unnamed');
  // every one of the 1,055, cut by a first letter that is not its own
  // country's, then sent, then cut again, on one board: mapped as ever, named, mapped as ever
  const C = LIST.board(ROOT);
  const cutAll = AMERICAS.map((c) => ({ icao: 'L' + c })), bare = dests(mapped(B0, cutAll));
  assert.deepEqual(dests(mapped(C, cutAll)), bare);
  for (const c of AMERICAS) assert.equal(C._placeNameAm(c, 'en'), '', c);
  assert.deepEqual(dests(mapped(C, AMERICAS.map((c) => ({ iata: c })))), AMERICAS.map((c) => want(c, 'en') + ' | ' + c));
  assert.deepEqual(dests(mapped(C, cutAll)), bare, 'the rows that were cut never take the name as they are mapped');
  for (const c of AMERICAS) assert.equal(C._placeNameAm(c, 'en'), want(c, 'en').toUpperCase(), c);
  // the two notes, and the row that was cut, where the feed is read
  assert.match(CORE, /const _locSent=!!String\(\(mode==='dep'\?f\.arrival\?\.airport\?\.iata:f\.departure\?\.airport\?\.iata\)\|\|''\)\.trim\(\);\n    const _locCut=!!locIata&&!_locSent;\n    if \(locIata\) _placeAmCut\(locIata, _locSent\);/);
  assert.match(CORE, /let locName=formatCityIata\(CITY\[locIata\] \|\| cityName \|\| locIata \|\| '—', locIata, undefined, _locCut\);/);
  assert.match(CORE, /if \(locIata && !_locCut && !CITY\[locIata\]\) \{ const _amName=_placeNameAm\(locIata, 'en'\);/);
  assert.match(CORE, /if \(!\/\^\[A-Z\]\{3\}\$\/\.test\(c\) \|\| \(_PLACE_AM_CUT\[c\] === true && _PLACE_AM_SENT\[c\] !== true\)\) return '';/);

  // A ROW WITH NO CODE: its words are read as they always were
  const W = withTable();
  const words = ['Rih', 'RIH', '(RIH)', 'RIH (RIH)', 'Rio Hato', 'Río Hato', 'Rio Hato (RIH)', 'Rio Hato | RIH', 'Yhi', 'Ulukhaktok', 'North End', 'Staniel Cay', 'Big', 'New', 'May', 'End', 'London', 'Detroit', 'West End', 'West End BIG'];
  const cl = mapped(W, words.map((name) => ({ name }))), cl0 = mapped(B0, words.map((name) => ({ name })));
  [...cl].forEach((f, i) => {
    const f0 = cl0[i];
    assert.deepEqual([f._locIata, f.dest], [f0._locIata, f0.dest], words[i]);
    for (const l of ['en', 'fr', 'ja']) {
      W.__setLang(l); B0.__setLang(l);
      assert.equal(gate(W).__row(f, true, l), gate(B0).__row(f0, true, l), words[i] + ' ' + l);
      assert.equal(W.formatCityIata(f.dest, '', l), B0.formatCityIata(f0.dest, '', l), words[i] + ' ' + l);
      assert.equal(W.cityCode('', words[i], l), B0.cityCode('', words[i], l), words[i] + ' ' + l);
      assert.equal(W.normalizeDisplayCity(words[i], ''), B0.normalizeDisplayCity(words[i], ''), words[i] + ' ' + l);
    }
  });
  assert.deepEqual([cl[0]._locIata, cl[0].dest], ['', 'Rih | RIH']);
  // THE GATE OF A ROW WITH NO CODE. The rail's Destination and the boarding
  // row take the row's words where it has no code; three letters were then
  // looked up as a code, so the row read 'Gao | GAO' and its gate
  // 'Guantánamo'. They read the tables alone there, as the rows do: every
  // code of the 1,055 written as a word prints on the gate as without the
  // table.
  gate(W); gate(B0);
  const gateBad = [];
  for (const c of AMERICAS) for (const w of [c, W.tc(c)]) {
    const f = { dest: w };
    const now = [W.__railDest('', f), W.__boardDest('', f)], was = [B0.__railDest('', f), B0.__boardDest('', f)];
    if (JSON.stringify(now) !== JSON.stringify(was) && gateBad.length < 20) gateBad.push(w + ': ' + JSON.stringify(was) + ' -> ' + JSON.stringify(now));
  }
  assert.deepEqual(gateBad, []);
  assert.deepEqual([W.__railDest('', { dest: 'Gao' }), W.__boardDest('', { dest: 'Gao' }), W.__railDest('', { dest: 'Rih' })], ['Gao', 'Gao', 'Rih']);
  assert.deepEqual([W.__railDest('GAO', { dest: 'Gao' }), W.__boardDest('RIH', { dest: 'Rih' })], ['Guantánamo', 'Río Hato'], 'a row with its code is named');
  assert.deepEqual([cl[4]._locIata, cl[4].dest], ['', 'Rio Hato'], 'a name of the table with no code finds no code');
  // (END is Enid's code and CAY Cayenne's in the table; a name's last word is not read as either,
  // and three letters alone are read as a code, as they always were, and take no name)
  assert.equal(cl[10].dest, 'North End'); assert.equal(cl[11].dest, 'Staniel Cay'); assert.equal(cl[15].dest, 'End | END'); assert.equal(cl[12].dest, 'Big | BIG');
  // the indexes and the reading of a last word as a code are the tables' alone
  for (const c of ['END', 'CAY', 'BIG', 'NEW', 'MAY', 'TOP', 'AIR', 'CAR', 'OFF', 'RIH', 'YHI']) {
    assert.ok(AMERICAS.includes(c), c); assert.equal(W._isRealApCode(c), B0._isRealApCode(c), c); assert.equal(W._isRealApCode(c), false, c + ' is no code to the word parser');
  }
  for (const n of ['Río Hato', 'Rio Hato', 'Ulukhaktok', 'Enid', 'Cayenne', 'London', 'Detroit', 'Valencia']) {
    assert.equal(String(W._iataFromCityName(n)), String(B0._iataFromCityName(n)), n); assert.equal(String(W._iataFromRowName(n)), String(B0._iataFromRowName(n)), n);
  }
  assert.equal(String(W._iataFromCityName('Río Hato')), ''); assert.equal(String(W._iataFromCityName('Ulukhaktok')), '');
});

// ── 7. the queries ─────────────────────────────────────────────────────────

test('nothing is copied into the board\'s tables, and the photo search and the weather query ask what they asked: a name of the table is never searched for a picture', () => {
  const B = withTable(), B0 = without();
  gate(B); gate(B0);
  for (const c of AMERICAS.concat(ELSEWHERE.slice(0, 200), ['YUL', 'JFK', 'ZZZ'])) {
    assert.equal(B.__photo(c), B0.__photo(c), c + ': the photo search');
    assert.equal(B._wxCityQuery(c), B0._wxCityQuery(c), c + ': the weather query');
    assert.equal(B._cityForIata(c, true), B0._cityForIata(c), c + ': the tables alone');
    assert.equal(B.airportCityNameSafe_v21877(c, 'en', true), B0.airportCityNameSafe_v21877(c, 'en'), c);
  }
  assert.equal(B.__photo('RIH'), 'RIH'); assert.equal(B._wxCityQuery('RIH'), '');
  // (mining and oil towns are among the names: none is ever a picture search)
  for (const c of ['YOP', 'YNL', 'YKJ', 'YOA', 'RDS']) { assert.ok(AMERICAS.includes(c), c); assert.equal(B.__photo(c), c); assert.equal(B._wxCityQuery(c), ''); }
  for (const t of ['CITY', 'CITY_FR', 'AP', 'AP_LIST', 'COORDS', 'GATE_AP', '_CITY_V24066', '_CITY_FR_V24066']) assert.equal(JSON.stringify(B.__table(t)), JSON.stringify(B0.__table(t)), t);
  for (const c of AMERICAS) assert.ok(!own(B.__table('CITY'), c) && !own(B.__table('CITY_FR'), c), c);
  // the one function is the board's one reading of the table, and every
  // caller outside the feed mapper asks whether it is there (a page, or a
  // test, that runs a piece of the board without it is as it was)
  const calls = CORE.split('\n').filter((ln) => /_placeNameAm\(/.test(ln) && !/^\s*\/\//.test(ln) && !/^function _placeNameAm\(/.test(ln));
  // (fourteen, each held by what it prints in the tests above: one more, or
  // one fewer, is a surface to add to them or one that lost its name)
  assert.equal(calls.length, 14, calls.length + ' callers');
  const mapAt = CORE.indexOf('\nfunction mapADB('), mapper = CORE.slice(mapAt, CORE.indexOf('\n}\n', mapAt));
  assert.ok(mapAt > 0 && mapper.includes('    let locName=formatCityIata('));
  for (const ln of calls) assert.ok(/typeof _placeNameAm === 'function'/.test(ln) || mapper.includes(ln), ln.trim().slice(0, 120));
});

// ── 8. the companion app ───────────────────────────────────────────────────

// app.html's place names (placeOf and cityCodeOf over shared-names.js), as
// tests/companion-app-rows.test.js builds them; `places`: with the table
function app(places) {
  const fn = (name) => {
    const at = APP.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert.ok(at >= 0, name + ' must exist');
    let i = APP.indexOf('{', APP.indexOf(')', at)), d = 0;
    for (; i < APP.length; i++) {
      const c = APP[i];
      if (c === "'" || c === '"') { const q = c; for (i++; i < APP.length && APP[i] !== q; i++) if (APP[i] === '\\') i++; continue; }
      if (c === '/' && APP[i + 1] === '/') { i = APP.indexOf('\n', i); continue; }
      if (c === '{') d++; else if (c === '}' && --d === 0) return APP.slice(at + 1, i + 1) + '\n';
    }
    throw new Error(name);
  };
  const line = (re) => { const m = APP.match(re); assert.ok(m, String(re)); return m[0]; };
  const ctx = { console, Intl };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), ctx);
  if (places) vm.runInContext(fs.readFileSync(path.join(JS, 'earth-places.js'), 'utf8'), ctx);
  ctx.BoardStrings = BS;
  vm.runInContext('var dispIata=function(c){return c;};var CURAP=\'YUL\';var __lang=\'en\';var langRes=function(){return __lang;};' + line(/^const AIRPORTS=\{[\s\S]*?\n\};/m).replace('const AIRPORTS', 'var AIRPORTS')
    + line(/^const CITY=\{[\s\S]*?\};/m).replace('const CITY', 'var CITY') + fn('_tcCity') + line(/^if\(window\.FIDS_SHARED_CITY\)[^\n]*/m)
    + line(/^for\(var _ck in AIRPORTS\)[^\n]*/m) + 'var _CITY_CODE=null;' + fn('_cityKey') + fn('cityCodeOf') + fn('apSub')
    + line(/^const _CODE_CUT=Object\.create\(null\);/m).replace('const _CODE_CUT', 'var _CODE_CUT')
    + line(/^const _CODE_SENT=Object\.create\(null\);/m).replace('const _CODE_SENT', 'var _CODE_SENT') + fn('placeOf') + fn('cityOf') + fn('ensureOption'), ctx);
  return ctx;
}

test('the companion app prints the same names, through its one function, in its rows, its header and its airport picker; a code cut from an ICAO code and never sent, the card that was cut, and a name with no code are as before; its own table is not written', () => {
  const A = app(true), A0 = app(false);
  assert.equal(A.placeOf('RIH').c, 'Río Hato'); assert.equal(A.placeOf('RIH', 'Scarlett Martinez Intl').c, 'Río Hato');
  assert.equal(A.cityOf({ cityIata: 'RIH', cityName: 'Rio Hato' }), 'Río Hato');
  assert.equal(A0.placeOf('RIH').c, 'RIH', 'as it was, and is on a page without the table'); assert.equal(A0.placeOf('RIH', 'Rio Hato').c, 'Rio Hato');
  const bad = [];
  let own_ = 0;
  for (const c of AMERICAS) {
    // (a few the app's own list or airport catalogue names: they keep that name)
    if (A0.CITY[c]) { assert.equal(A.placeOf(c, 'Some Field Intl').c, A0.CITY[c], c); own_++; continue; }
    for (const l of NINE) {
      A.__lang = l;
      // (the app has no French names of its own: a city's second airport reads as the table writes it)
      const exp = own(PLACES.OF, c) ? PLACES.NAME[c] : want(c, l);
      const got = A.placeOf(c, 'Some Field Intl').c;
      if (got !== exp && bad.length < 20) bad.push(`${c} ${l}: '${got}', not '${exp}'`);
    }
  }
  A.__lang = 'en';
  assert.deepEqual(bad, []);
  assert.ok(own_ < 60, own_ + ' of them are named by the app\'s own tables');
  assert.equal(A.placeOf('LOZ').c, 'London, KY'); assert.equal(A.placeOf('VLN').c, 'Valencia, Venezuela'); assert.equal(A.placeOf('DET').c, 'Detroit');
  // a code the feed did not send (the last three letters of an ICAO code)
  // is noted as the app reads the feed, and prints as before; a code the
  // feed sends itself is noted too, and outranks that (as on the boards)
  assert.equal(A.placeOf('YBE').c, 'Uranium City'); assert.equal(A.placeOf('SGG', 'Geneva').c, 'Sermiligaaq');
  const noted = /\n  (const cityCut=!!\(other\.airport&&!other\.airport\.iata&&other\.airport\.icao\);\n  if\(cityCut\)_CODE_CUT\[String\(other\.airport\.icao\)\.slice\(1\)\.toUpperCase\(\)\]=1;\n  else if\(typeof _CODE_SENT!=='undefined'&&other\.airport&&other\.airport\.iata\)_CODE_SENT\[String\(other\.airport\.iata\)\.trim\(\)\.toUpperCase\(\)\]=1;)\n  return\{\n    airline:code, flight:num, dir:dir,\n    cityIata:\(\(\(other\.airport&&\(other\.airport\.iata\|\|\(other\.airport\.icao\|\|''\)\.slice\(1\)\)\)\|\|''\)\)\.toUpperCase\(\), cityCut:cityCut,/.exec(APP);
  assert.ok(noted, 'adbToCard notes a code it cut from an ICAO code, and a code the feed sent, where it reads the feed; the card carries its own cut');
  const note = (other) => vm.runInContext('(function (other) { ' + noted[1] + ' return cityCut; })', A)(other);
  assert.equal(note({ airport: null }), false); assert.equal(note({}), false);
  assert.equal(note({ airport: { icao: 'LYBE', name: 'Belgrade Nikola Tesla' } }), true); assert.equal(note({ airport: { icao: 'lsgg' } }), true); assert.equal(note({ airport: { icao: 'CYHI' } }), true);
  assert.equal(A.placeOf('YBE', 'Belgrade Nikola Tesla').c, 'Belgrade Nikola Tesla'); assert.equal(A.placeOf('YBE').c, 'YBE'); assert.equal(A.placeOf('YHI').c, 'YHI');
  assert.equal(A.cityOf({ cityIata: 'SGG', cityName: 'Geneva' }), 'Geneva'); assert.equal(A.placeOf('YSG').c, "Lutselk'e", 'the other places keep their names');
  assert.equal(JSON.stringify([A0.placeOf('YBE', 'Belgrade Nikola Tesla'), A0.placeOf('YBE')]), JSON.stringify([A.placeOf('YBE', 'Belgrade Nikola Tesla'), A.placeOf('YBE')]), 'as on a page without the table');
  // the feed then sends YHI itself: its rows have their name again, before
  // and after another cut; the card that was cut never takes it
  assert.equal(note({ airport: { iata: 'YHI', icao: 'CYHI' } }), false);
  assert.equal(A.placeOf('YHI').c, 'Ulukhaktok'); assert.equal(A.cityOf({ cityIata: 'YHI', cityName: '' }), 'Ulukhaktok');
  assert.equal(note({ airport: { icao: 'CYHI' } }), true);
  assert.equal(A.placeOf('YHI').c, 'Ulukhaktok', 'a code the feed sent is the feed\'s');
  assert.equal(A.cityOf({ cityIata: 'YHI', cityName: '', cityCut: true }), 'YHI'); assert.equal(A.cityOf({ cityIata: 'YHI', cityName: 'Holman', cityCut: true }), 'Holman');
  assert.equal(A.placeOf('YHI', 'Holman', true).c, A0.placeOf('YHI', 'Holman').c); assert.equal(A.placeOf('YBE').c, 'YBE', 'a code that was cut and never sent stays unnamed');
  note({ airport: { iata: ' ybe ' } });
  assert.equal(A.placeOf('YBE').c, 'Uranium City'); assert.equal(A.cityOf({ cityIata: 'YBE', cityName: 'Belgrade Nikola Tesla', cityCut: true }), 'Belgrade Nikola Tesla');
  // (the three places that print a card's place pass the card's own cut)
  assert.equal((APP.match(/placeOf\(f\.cityIata,f\.cityName,f\.cityCut===true\)/g) || []).length, 3);
  assert.equal((APP.match(/placeOf\(f\.cityIata,f\.cityName\)/g) || []).length, 0);

  // THE AIRPORT PICKER names a linked airport as the header does (app.html?ap=RIH
  // read 'RIH' in the picker under a header that read 'Río Hato')
  const option = (X, code) => {
    let made = null;
    X.document = { getElementById: () => ({ querySelector: () => null, insertBefore: (o) => { made = o; }, firstChild: null }), createElement: () => ({}) };
    X.ensureOption(code);
    return made.textContent;
  };
  assert.equal(option(A, 'RIH'), 'Río Hato (RIH)'); assert.equal(option(A, 'LOZ'), 'London, KY (LOZ)'); assert.equal(option(A, 'YGT'), 'Igloolik (YGT)');
  assert.equal(option(A0, 'RIH'), 'RIH', 'as it was, and is on a page without the table');
  for (const c of ['YUL', 'CDG', 'ZZZ', 'ABJ']) assert.equal(option(A, c), A0.CITY[c] ? A0.CITY[c] + ' (' + c + ')' : c, c + ': as before');
  assert.match(APP, /\n  const nm=placeOf\(code\)\.c;\n/);
  // every other place, and every name read back to a code, as without the table
  for (const c of ELSEWHERE.concat(['YUL', 'YYZ', 'JFK', 'ZZZ', ''])) assert.equal(JSON.stringify(A.placeOf(c, 'Some Field')), JSON.stringify(A0.placeOf(c, 'Some Field')), c);
  for (const n of ['Río Hato', 'Rio Hato', 'Ulukhaktok', 'London', 'Detroit', 'Whitehorse', 'Valencia', 'Enid']) assert.equal(A.cityCodeOf(n), A0.cityCodeOf(n), n);
  assert.equal(A.cityCodeOf('Río Hato'), '');
  assert.equal(JSON.stringify(A.CITY), JSON.stringify(A0.CITY), 'the app\'s own table is not written');
  assert.equal(A.CITY.RIH, undefined);
});

// ── 9. the list ────────────────────────────────────────────────────────────

test('docs/airport-names-americas.md is the list of every airport of the Americas the boards name, as they print it, by country then name, with how many there are and how many this added', () => {
  const { rows, text } = LIST.build(ROOT);
  const file = fs.readFileSync(path.join(ROOT, LIST.OUT), 'utf8');
  assert.equal(file, text, 'the list is not what the board prints now: node scripts/names/americas-list.js writes it');
  const added = rows.filter((r) => r.added);
  assert.deepEqual(added.map((r) => r.code).sort(), AMERICAS, 'the ones marked + are the 1,055');
  const { CITY, CITY_FR } = tables();
  for (const r of rows) {
    assert.equal(r.added, !(CITY[r.code] || CITY_FR[r.code]), r.code);
    // (in French where a table writes the name otherwise: a city's second
    // airport; a country after a comma is the browser's to write, and the
    // list gives it in English only)
    if (r.added) { assert.equal(r.en, want(r.code, 'en'), r.code); assert.equal(r.fr, own(PLACES.OF, r.code) && want(r.code, 'fr') !== want(r.code, 'en') ? want(r.code, 'fr') : '', r.code); }
    assert.ok(r.en && r.country && LIST.COUNTRY[r.cc] === r.country, r.code);
    if (r.zone) assert.ok(PLACES.americasZone(r.zone), r.code + ' ' + r.zone);
  }
  assert.equal(new Set(rows.map((r) => r.code)).size, rows.length, 'each airport once');
  // every code of the Americas the board's tables name is on it too
  for (const c of ['YUL', 'YYZ', 'YHU', 'YQM', 'JFK', 'PTY', 'HAV', 'GRU', 'EZE', 'SCL', 'BDA', 'IPC', 'HNL', 'KM8', 'NAQ']) assert.ok(rows.some((r) => r.code === c), c);
  for (const c of ['LHR', 'CDG', 'ABJ', 'MDY', 'PPT', 'PDL', 'KEF']) assert.ok(!rows.some((r) => r.code === c), c + ' is not of the Americas');
  // sorted by country, then by name (read without accents or capitals)
  const flat = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    assert.ok(flat(a.country) < flat(b.country) || (a.country === b.country && flat(a.en) <= flat(b.en)), a.country + ' / ' + a.en + ' before ' + b.country + ' / ' + b.en);
  }
  assert.equal(rows[0].country, 'Anguilla'); assert.equal(rows[rows.length - 1].country, 'Venezuela');
  // its first line says how many, and how many were added
  const n = (x) => x.toLocaleString('en-US');
  assert.equal(file.split('\n')[0], '# ' + n(rows.length) + ' airports of the Americas have a name on the boards; ' + n(added.length) + ' of them were added by the change that wrote this list');
  assert.equal(added.length, 1055); assert.ok(rows.length >= 2290, rows.length + ' airports');
  assert.ok(file.includes('\n| RIH | Río Hato |  | Panama | + |\n'));
  assert.ok(file.includes('\n| LOZ | London, KY |  | United States | + |\n'));
  assert.ok(file.includes('\n| DET | Detroit | Détroit | United States | + |\n'));
  assert.ok(file.includes('\n| YUL | Montréal · Trudeau |  | Canada |  |\n'));
  assert.equal(file.split('\n').filter((ln) => /^\| [A-Z0-9]{3}[ |]/.test(ln)).length, rows.length, 'a line for each');
});
