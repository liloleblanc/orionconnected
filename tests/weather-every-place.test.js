'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EVERY PLACE A BOARD PRINTS BY NAME HAS ITS WEATHER ASKED FOR.
//
// Seen on the live boards on 2026-11-18: flights to St. Thomas (STT), Tortola
// (EIS), Anguilla (AXA) and Guayaquil (GYE) printed the place by name and a
// dash where its weather goes. The weather read ONE table of positions,
// COORDS, and a place can stand in any of four:
//   COORDS          fids-current/js/fids-core.js
//   AIRPORT_COORDS  fids-current/js/airport-coords.js
//   GATE_AP         fids-current/js/fids-core.js (the gate map)
//   AT              fids-current/js/earth-places.js (OurAirports)
// STT, EIS and GYE stood in GATE_AP alone, AXA in AT alone. Measured on the
// build before this one (v24165), by the loop below: of the 5,677 places the
// boards had a name for, 2,395 were asked for and 3,282 never were (63 in
// GATE_AP alone, 3,219 in AT alone). The phone app read AIRPORT_COORDS alone:
// 136 of the 2,485 places it names had no temperature, 109 of them in no file
// it loads.
//
// One lookup now reads the four tables, in one order (fids-core.js
// _placeLatLon; app.html wxPlaceAt over the two of them the app loads), and
// every question the weather asks goes through it. What is held here:
//   · THE SHIPPED CODE IS RUN, not read: the whole board script in a page of
//     its own (scripts/names/americas-list.js board), its network replaced by
//     a recorder, and the app's own functions lifted out of app.html;
//   · every place with a name and a position in any table is asked for, at
//     that position, by name for the four that were reported;
//   · the order of the tables, and that each one is really read;
//   · what is not a place (a four-letter code, two codes in one field) is
//     never asked for;
//   · no check in front of the weather reads one table alone again;
//   · a code cut from an ICAO code, which the feed never sent, is a place
//     only where CITY names it: a row that prints the feed's own words for
//     Belgrade never has the weather of Uranium City (board and app);
//   · the app and a board ask for a place at the same spot, so they share
//     the one reading the site worker keeps for it.
// A NAME WITH NO POSITION IN ANY TABLE fails here too: it would be a place
// printed by name with no weather, which is what this file is against.
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
const LIST = require('../scripts/names/americas-list.js');
const PLACES = require('../fids-current/js/earth-places.js');
const FidsSun = require('../fids-current/js/fids-sun.js');   // the engine alone, as a page without the board script has it

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const isCode = (c) => /^[A-Z0-9]{3}$/.test(c);
// the reading the recorder answers with (the site worker's /wxcurrent shape)
const READING = { current: { temperature_2m: 27.5, weather_code: 1 }, hourly: { time: [] }, _src: 'met-norway' };
const answer = () => Promise.resolve({ ok: true, json: async () => READING });
// the cell the site worker keeps one reading in: both numbers at two decimals
// (worker-entry.js, the /wxcurrent and /wxdaily cache key)
const cell = (p) => Number(p[0]).toFixed(2) + ',' + Number(p[1]).toFixed(2);
// ONE PLACE THE APP AND THE BOARDS ASK FOR IN TWO CELLS, known and left:
// Abbotsford. COORDS holds it at three decimals (49.025, which the worker
// reads as 49.02), js/airport-coords.js at two (49.03), 0.6 km apart. The
// row of js/airport-coords.js is also the one the proxy worker copies for
// its far-end table (FARARR_COORDS), held equal to it by
// tests/gate-arrival-from-destination.test.js, and COORDS is what the maps
// and the sun read: bringing the three together is a change of its own. Its
// cost is one more reading upstream per half hour while an app and a board
// both show Abbotsford. Nothing may be added to this list.
const TWO_CELLS = ['YXX'];

// ── the tables, as the files write them ────────────────────────────────────
function literalIn(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, 'fids-core.js no longer declares ' + marker);
  const open = marker.slice(-1), close = open === '[' ? ']' : '}';
  let i = src.indexOf(open, at), d = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close && --d === 0) break; }
  return src.slice(i, j + 1);
}
const table = (marker) => vm.runInNewContext('(' + literalIn(CORE, marker) + ')');
const COORDS = table('const COORDS = {'), GATE_AP = table('var GATE_AP={');
const CITY = table('const CITY = {'), CITY_FR = table('const CITY_FR = {'), AP = table('const AP = {'), AP_LIST = table('const AP_LIST = [');
const acWin = {};
vm.runInNewContext(fs.readFileSync(path.join(JS, 'airport-coords.js'), 'utf8'), { window: acWin });
const AIRPORT_COORDS = acWin.AIRPORT_COORDS;
const shWin = {};
vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: shWin });

// THE ORDER, written once more here on purpose: the test's own reading of the
// four tables, which the board's and the app's answers are held to
const TABLES = [['COORDS', COORDS], ['AIRPORT_COORDS', AIRPORT_COORDS], ['GATE_AP', GATE_AP], ['AT', PLACES.AT]];
function placed(c) {
  for (const [name, t] of TABLES) if (own(t, c)) return { table: name, at: [Number(t[c][0]), Number(t[c][1])] };
  return null;
}
const urlOf = (p) => '/wxcurrent?location=' + p[0] + ',' + p[1];

// every code a board has a name for: CITY, CITY_FR, the airports' own rows
// (AP), the picker (AP_LIST) and the names of js/earth-places.js
const NAMED = [...new Set(Object.keys(CITY).concat(Object.keys(CITY_FR), Object.keys(AP), AP_LIST.map((a) => a.c), Object.keys(PLACES.NAME)))].filter(isCode).sort();

// ── the board, run ─────────────────────────────────────────────────────────
// One page for the whole file (the script is large); each test starts from no
// reading and puts back what it moves.
let PAGE_ = null;
function page() {
  if (!PAGE_) {
    const B = LIST.board(ROOT, { ap: 'MIA' });
    B.render = function () {};                    // nothing is drawn here
    PAGE_ = { B, calls: [] };
    B.fetch = (u) => { PAGE_.calls.push(String(u)); return answer(); };
  }
  const P = PAGE_, WX = P.B.__table('TOMORROW_WX');
  for (const k of Object.keys(WX)) delete WX[k];
  P.calls.length = 0;
  return P;
}
async function ask(P, code) {
  const n = P.calls.length;
  const got = await P.B.fetchTomorrowWeather(code);
  return { got, calls: P.calls.slice(n) };
}

test('the four that were reported: St. Thomas, Tortola, Anguilla and Guayaquil are asked for, each at its position', async () => {
  const P = page();
  // (where each stood on 2026-11-18; the position is what is held, whichever
  // table holds it from now on)
  const WANT = {
    STT: '/wxcurrent?location=18.34,-64.97',     // St. Thomas: the gate map table had it, COORDS did not
    EIS: '/wxcurrent?location=18.44,-64.54',     // Tortola: the same
    GYE: '/wxcurrent?location=-2.16,-79.88',     // Guayaquil: the same
    AXA: '/wxcurrent?location=18.205,-63.054'    // Anguilla: js/earth-places.js alone
  };
  for (const c of Object.keys(WANT)) {
    assert.ok(CITY[c], c + ' has a name on the boards');
    const r = await ask(P, c);
    assert.deepEqual(r.calls, [WANT[c]], c);
    assert.equal(r.got && r.got.current.temp, READING.current.temperature_2m, c + ' keeps its reading');
    assert.equal(P.B.__table('TOMORROW_WX')[c].current.temp, READING.current.temperature_2m, c + ' is where every surface reads it');
  }
});

test('every place with a name is asked for, at the position of the first table that holds it', async () => {
  const P = page();
  const none = NAMED.filter((c) => !placed(c));
  assert.deepEqual(none, [], 'a place with a name and no position in any table is printed with no weather: add its position'
    + ' (OurAirports, public domain) to AT in fids-current/js/earth-places.js');
  const by = {}, wrong = [];
  for (const c of NAMED) {
    const p = placed(c), r = await ask(P, c);
    by[p.table] = (by[p.table] || 0) + 1;
    if (r.calls.length !== 1 || r.calls[0] !== urlOf(p.at) || !r.got) wrong.push(c + ' (' + p.table + '): ' + (r.calls.join(' ') || 'nothing asked'));
  }
  assert.deepEqual(wrong.slice(0, 20), [], wrong.length + ' places are not asked for at their position');
  // the size of what is held, so that an empty list cannot pass (2026-11-18:
  // 5,677 places; 2,395 by COORDS, 63 by the rows js/airport-coords.js took
  // from GATE_AP, 3,219 by AT)
  assert.ok(NAMED.length >= 5600, NAMED.length + ' places have a name');
  assert.ok(by.COORDS >= 2000 && by.AT >= 3000, JSON.stringify(by));
  // and asked once: the second time within the half hour is the kept reading
  const again = await ask(P, 'GYE');
  assert.deepEqual(again.calls, [], 'a place just read is not asked again');
});

test('the order is COORDS, AIRPORT_COORDS, GATE_AP, AT, and each of the four is read', async () => {
  const P = page(), B = P.B;
  const T = { COORDS: B.__table('COORDS'), AC: B.AIRPORT_COORDS, GATE: B._GATE_AP_OWN, AT: B.FIDS_EARTH_PLACES.AT };
  const at = (c) => { const v = B._placeLatLon(c); return v ? v[0] + ',' + v[1] : null; };
  // one code put in all four, then taken out of them one by one
  const Z = 'ZZ9';
  assert.equal(at(Z), null, Z + ' is no place');
  try {
    T.COORDS[Z] = [1, 1]; T.AC[Z] = [2, 2]; T.GATE[Z] = [3, 3]; T.AT[Z] = [4, 4];
    assert.equal(at(Z), '1,1', 'COORDS first');
    delete T.COORDS[Z];
    assert.equal(at(Z), '2,2', 'then AIRPORT_COORDS');
    delete T.AC[Z];
    assert.equal(at(Z), '3,3', 'then GATE_AP');
    delete T.GATE[Z];
    assert.equal(at(Z), '4,4', 'then AT');
    assert.deepEqual((await ask(P, Z)).calls, ['/wxcurrent?location=4,4'], 'and the reading is asked there');
    delete T.AT[Z];
    assert.equal(at(Z), null, 'and in none of them, no position');
    // a row that is not a position is passed over for the next table
    T.COORDS[Z] = [NaN, 1]; T.AT[Z] = [4, 4];
    assert.equal(at(Z), '4,4');
    T.COORDS[Z] = [91, 0];
    assert.equal(at(Z), '4,4');
  } finally { delete T.COORDS[Z]; delete T.AC[Z]; delete T.GATE[Z]; delete T.AT[Z]; }

  // the real tables: where COORDS and GATE_AP hold a place at two spots the
  // weather is asked at COORDS, the spot it has always been asked at
  // (83 places on 2026-11-18, Toronto Pearson among them)
  const two = Object.keys(GATE_AP).filter((c) => own(COORDS, c) && cell(GATE_AP[c]) !== cell(COORDS[c]));
  for (const c of two) assert.equal(at(c), COORDS[c][0] + ',' + COORDS[c][1], c);

  // a page that has not loaded js/airport-coords.js (it comes after the core)
  // still places what the gate map table holds, and what AT holds
  const keep = B.AIRPORT_COORDS;
  try {
    B.AIRPORT_COORDS = undefined;
    // (63 places on 2026-11-18: St. Thomas, Tortola and Guayaquil among them)
    const gateOnly = Object.keys(GATE_AP).filter((c) => !own(COORDS, c));
    for (const c of gateOnly) {
      assert.deepEqual((await ask(P, c)).calls, [urlOf([Number(GATE_AP[c][0]), Number(GATE_AP[c][1])])], c + ' by GATE_AP');
    }
    assert.deepEqual((await ask(P, 'AXA')).calls, ['/wxcurrent?location=18.205,-63.054'], 'AXA by AT');
  } finally { B.AIRPORT_COORDS = keep; }
});

test('a position the gate map learns while it runs does not move where the weather is asked', async () => {
  const P = page(), B = P.B;
  const before = B._placeLatLon('AXA');
  assert.deepEqual([before[0], before[1]], [18.205, -63.054]);
  const had = own(B.GATE_AP, 'AXA');
  assert.equal(had, false, 'AXA is not in GATE_AP as the file writes it');
  try {
    // what _lookupAirport and _fetchAirportCoords do with an airport this
    // browser has looked up before: write it into GATE_AP
    B.GATE_AP.AXA = [18.3, -63.1];
    assert.deepEqual(Array.from(B._lookupAirport('AXA')), [18.3, -63.1], 'the gate map reads its own');
    const now = B._placeLatLon('AXA');
    assert.deepEqual([now[0], now[1]], [18.205, -63.054], 'the weather still asks at the table position');
    assert.deepEqual((await ask(P, 'AXA')).calls, ['/wxcurrent?location=18.205,-63.054']);
    // The hotel ads copy a position into COORDS for a destination COORDS
    // does not hold (fetchAccorHotels, from the gate map lookup), and COORDS
    // is the first table the weather reads: what they copy is the table
    // position where a table has one, not the looked-up one.
    const C = B.__table('COORDS'), net = B.fetch;
    assert.ok(!own(C, 'AXA'));
    try {
      B.fetch = () => new Promise(() => {});      // the hotel list itself is not asked for here
      B.fetchAccorHotels('AXA', 'en');
      assert.deepEqual(Array.from(C.AXA), [18.205, -63.054], 'the hotel ads wrote the table position into COORDS');
      const then = B._placeLatLon('AXA');
      assert.deepEqual([then[0], then[1]], [18.205, -63.054]);
    } finally { B.fetch = net; delete C.AXA; }
  } finally { delete B.GATE_AP.AXA; }
  // the copy is taken beside the table, before anything can add to it
  assert.match(CORE, /\nvar GATE_AP=\{[^\n]*\};\n(?:\/\/[^\n]*\n)*var _GATE_AP_OWN = \(function \(\) \{ var o = \{\}; Object\.keys\(GATE_AP\)\.forEach\(function \(k\) \{ o\[k\] = GATE_AP\[k\]; \}\); return o; \}\)\(\);\n/);
  assert.deepEqual(Object.keys(B._GATE_AP_OWN).sort(), Object.keys(GATE_AP).sort());
  // and the lookup reads tables only: never the gate map network lookup
  const fn = CORE.slice(CORE.indexOf('\nfunction _placeLatLon(code) {'), CORE.indexOf('\nasync function _fetchMetWx(iata) {'));
  assert.ok(fn.length > 200, '_placeLatLon stands just above _fetchMetWx');
  assert.doesNotMatch(fn, /_fetchAirportCoords|_lookupAirport|fetch\(|localStorage/);
});

test('what is not one code of three characters is not a place, and nothing is asked for it', async () => {
  const P = page(), B = P.B;
  // Ottawa arrivals of 2026-11-07 carried the first two
  for (const c of ['TNCA', 'YVP,YFB', '', null, undefined, 'YY', 'Y Q', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 0, 12345, {}, []]) {
    assert.equal(B._placeLatLon(c), null, String(c));
    assert.deepEqual((await ask(P, c)).calls, [], String(c));
  }
  // and that is the rule, not an accident of what the tables hold: a row
  // keyed by such a thing would still not be a place
  const T = B.__table('COORDS'), AT = B.FIDS_EARTH_PLACES.AT;
  try {
    T.TNCA = [12.19, -68.96]; AT['YVP,YFB'] = [58.1, -68.4];
    assert.equal(B._placeLatLon('TNCA'), null);
    assert.equal(B._placeLatLon('YVP,YFB'), null);
    assert.deepEqual((await ask(P, 'TNCA')).calls, []);
  } finally { delete T.TNCA; delete AT['YVP,YFB']; }
  // a code in the tables in small letters is the same place
  assert.deepEqual(Array.from(B._placeLatLon('gye')), [-2.16, -79.88]);
});

// ── a code the feed never sent ─────────────────────────────────────────────
// The feed mapper reads a row with no IATA code by the last three letters of
// its ICAO code. In the United States and Canada that is the place; elsewhere
// it is often another one (Belgrade, LYBE, reads YBE: Uranium City,
// Saskatchewan). The names refuse such a code and print the words of the
// feed (tests/americas-airport-names.test.js). The first build of the one
// lookup read AT for it all the same: of 40 such rows mapped at Ottawa, 9
// printed the feed's name with the weather of the other place ('Belgrade'
// at 59.561,-108.481). The row a feed would send, built here as the feed
// writes it:
function feedRow(i, here, airport) {
  const pad = (n) => String(n).padStart(2, '0');
  const t = new Date(Date.now() + 3600000);
  const utc = t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()) + ' ' + pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()) + ':00+00:00';
  return { number: 'JU' + (500 + i), status: 'ontime', codeshareStatus: 'IsOperator', isCargo: false,
    departure: { airport: { iata: here, icao: 'K' + here, name: 'Miami' }, scheduledTime: { local: utc, utc }, airline: { iata: 'AC', name: 'Air Canada' } },
    arrival: { airport, scheduledTime: { local: utc, utc }, airline: { iata: 'AC', name: 'Air Canada' } }, airline: { iata: 'AC', name: 'Air Canada' } };
}

test('a row cut from an ICAO code has no weather of another place: a code the feed never sent is a place only where CITY names it', async () => {
  const P = page(), B = P.B;
  const CUT = B._PLACE_AM_CUT, SENT = B._PLACE_AM_SENT;
  assert.ok(CUT && SENT, 'the two notes of the names (_placeAmCut)');
  const cutWas = Object.assign({}, CUT), sentWas = Object.assign({}, SENT);
  const restore = () => {
    for (const k of Object.keys(CUT)) if (!own(cutWas, k)) delete CUT[k];
    for (const k of Object.keys(SENT)) if (!own(sentWas, k)) delete SENT[k];
  };
  // [ICAO code, the feed's name, the three letters it is cut to, whose weather it took]
  const OTHER = [['LYBE', 'Belgrade', 'YBE', 'Uranium City'], ['LSGG', 'Geneva', 'SGG', 'Sermiligaaq'], ['TAPA', 'Antigua', 'APA', 'Denver'],
    ['RJAA', 'Tokyo', 'JAA', 'Jalalabad'], ['MMUN', 'Cancun', 'MUN', 'Maturín']];
  // and two that CITY names, which print that name: Bangor by COORDS, as on
  // every build; Cranbrook by the row js/airport-coords.js took from the
  // gate map table
  const NAMED_BY_CITY = [['KBGR', 'Bangor', 'BGR'], ['CYXC', 'Cranbrook', 'YXC']];
  try {
    for (const [, , c, whose] of OTHER) {
      assert.ok(!own(CITY, c) && own(PLACES.AT, c) && PLACES.NAME[c] === whose, c + ' is ' + whose + ' in js/earth-places.js alone');
      assert.ok(B._placeLatLon(c), c + ' is a place until a feed row is cut to it');
    }
    const rows = B.mapADB({ departures: OTHER.concat(NAMED_BY_CITY).map((r, i) => feedRow(i, 'MIA', { iata: null, icao: r[0], name: r[1] })) }, 'dep');
    assert.equal(rows.length, OTHER.length + NAMED_BY_CITY.length, 'every row is mapped');
    OTHER.forEach(([, name, c], i) => {
      assert.equal(rows[i]._locIata, c);
      assert.ok(String(rows[i].dest).startsWith(name), c + ' prints the words of the feed: ' + rows[i].dest);
      assert.equal(B._placeLatLon(c), null, name + ' cut to ' + c + ' is not placed');
    });
    NAMED_BY_CITY.forEach(([, , c], i) => {
      const f = rows[OTHER.length + i];
      assert.equal(f._locIata, c);
      assert.ok(String(f.dest).toUpperCase().startsWith(String(B.__table('CITY')[c]).toUpperCase()), c + ' prints the name CITY has for it: ' + f.dest);
      assert.ok(own(COORDS, c) || own(GATE_AP, c), c);
      assert.deepEqual(Array.from(B._placeLatLon(c)), placed(c).at, c + ' is placed where it always was');
    });
    // the line of the live board that lists what to ask for, cut and run over
    // these rows, then the asking itself
    const m = /const destCodes = (\[\.\.\.new Set\(\[\.\.\.data\.dep, \.\.\.data\.arr\]\.flatMap\(_flightWxCodes\)\.filter\([^\n]*\)\)\]);\n\s*_fetchBoardWeather\(destCodes\);/.exec(CORE);
    assert.ok(m, 'the live board lists its weather codes');
    const codes = Array.from(vm.runInContext('(function (data) { return ' + m[1] + '; })', B)({ dep: rows, arr: [] }));
    assert.deepEqual(codes, NAMED_BY_CITY.map((r) => r[2]), 'only the places the rows print by a name of CITY');
    await B._fetchBoardWeather(codes);
    assert.deepEqual(P.calls.slice().sort(), NAMED_BY_CITY.map((r) => urlOf(placed(r[2]).at)).sort());
    const WX = B.__table('TOMORROW_WX');
    // every other way to the weather: the reading by code (the gate, the test
    // flight), the belt sign, the week and the sun of the weather card, its
    // arrival hour, and the sun on the icon
    if (!B.FidsSun) vm.runInContext(fs.readFileSync(path.join(JS, 'fids-sun.js'), 'utf8'), B, { filename: 'js/fids-sun.js' });
    const sunAt = B.FidsSun.browserEnv(B).coords;
    for (const [, name, c] of OTHER) {
      const n = P.calls.length;
      assert.equal(await B.fetchTomorrowWeather(c), null, c);
      B._b5AskWx({}, c); B._wxFetchDaily(c, null); B._wxFetchSun(c, Date.UTC(2026, 10, 18, 12));
      assert.deepEqual(P.calls.slice(n), [], 'nothing is asked for ' + name + ' at ' + c);
      assert.equal(WX[c], undefined, 'and the row has no reading to print');
      assert.equal(B._wxEstArrTs('MIA', c, Date.UTC(2026, 10, 18, 15)), 0, c);
      assert.equal(sunAt(c), null, c + ' has no sun of another place');
    }
    await new Promise((r) => setImmediate(r));

    // A CODE THE FEED SENDS ITSELF OUTRANKS THE NOTE, as it does for the
    // name: Uranium City, sent as YBE, is Uranium City
    B.mapADB({ departures: [feedRow(90, 'MIA', { iata: 'YBE', icao: 'CYBE', name: 'Uranium City' })] }, 'dep');
    assert.deepEqual(Array.from(B._placeLatLon('YBE')), [59.561, -108.481]);
    assert.deepEqual((await ask(P, 'YBE')).calls, ['/wxcurrent?location=59.561,-108.481']);
    assert.equal(B._placeLatLon('SGG'), null, 'the others stay as they were');

    // and the note alone takes nothing from a place CITY names: Anguilla
    // stands in AT alone, and CITY names it
    assert.ok(own(CITY, 'AXA') && !own(COORDS, 'AXA') && !own(AIRPORT_COORDS, 'AXA') && !own(GATE_AP, 'AXA'));
    B._placeAmCut('AXA', false);
    assert.deepEqual(Array.from(B._placeLatLon('AXA')), [18.205, -63.054]);
  } finally { restore(); }
  for (const [, , c] of OTHER) assert.ok(B._placeLatLon(c), c + ' is put back for the tests after this one');
  // the lookup reads the two notes of the names and CITY, before any table
  const fn = CORE.slice(CORE.indexOf('\nfunction _placeLatLon(code) {'), CORE.indexOf('\nasync function _fetchMetWx(iata) {'));
  assert.match(fn, /if \(_PLACE_AM_CUT\[c\] === true && _PLACE_AM_SENT\[c\] !== true && !has\.call\(CITY, c\)\) return null;[^\n]*\n\s*try \{ tables\.push\(COORDS\); \}/);
});

test('no check in front of the weather reads one table alone', () => {
  const fnSrc = (name) => {
    const m = new RegExp('\\n(?:async )?function ' + name + '\\(').exec(CORE);
    assert.ok(m, name + ' must exist');
    return CORE.slice(m.index, CORE.indexOf('\n}\n', m.index) + 2);
  };
  for (const name of ['_fetchMetWx', 'fetchTomorrowWeather', '_b5AskWx', '_wxFetchDaily', '_wxFetchSun', '_wxEstArrTs']) {
    const src = fnSrc(name);
    assert.match(src, /_placeLatLon\(/, name + ' asks the one lookup');
    assert.doesNotMatch(src, /COORDS\[|_lookupAirport\(|GATE_AP\[/, name + ' reads no table of its own');
  }
  // the reading, the week and the sun are asked at the position it answers
  assert.match(fnSrc('_fetchMetWx'), /var pos = _placeLatLon\(iata\);\s*if \(!pos\) return null;\s*var lat = pos\[0\], lon = pos\[1\];\s*var r = await fetch\('\/wxcurrent\?location=' \+ lat \+ ',' \+ lon\);/);
  assert.match(fnSrc('_wxFetchDaily'), /var C = _placeLatLon\(iata\);\s*if \(!C\) return null;/);
  assert.match(fnSrc('_wxFetchSun'), /var C = _placeLatLon\(iata\);\s*if \(!C\) return null;/);
  // every line that asks for weather, or lists the codes to ask for
  const lines = CORE.split('\n').filter((l) => /fetchTomorrowWeather\(|_fetchBoardWeather\(|flatMap\(_flightWxCodes\)/.test(l) && !/^\s*\/\//.test(l));
  assert.ok(lines.length >= 12, lines.length + ' lines ask for weather');
  for (const l of lines) assert.doesNotMatch(l, /COORDS\[|GATE_AP\[|AIRPORT_COORDS\[/, l.trim().slice(0, 120));
  // each check that stood on COORDS, by its own line: the test flight, the
  // gate destination, the empty gate, the rows board and the example board
  assert.match(CORE, /\n  if \(destIata && _placeLatLon\(destIata\)\) fetchTomorrowWeather\(destIata\);\n/);
  assert.match(CORE, /\n      if \(!TOMORROW_WX\[locIata\] && _placeLatLon\(locIata\)\) \{\n\s*fetchTomorrowWeather\(locIata\)/);
  assert.match(CORE, /\n      if \(!localTio && _placeLatLon\(iata\)\) fetchTomorrowWeather\(iata\);\n/);
  assert.equal((CORE.match(/\n\s*if \(_placeLatLon\(iata\)\) fetchTomorrowWeather\(iata\)\.then\(\(\) => render\(\)\);\n/g) || []).length, 2, 'the board own airport, live and example');
  // the season of the weather scene, by hemisphere
  assert.match(CORE, /var _cS = _placeLatLon\(_apS\);\s*if \(_mo >= 1 && _mo <= 12\) _wxSceneMonth = \(_cS && _cS\[0\] < 0\)/);
});

test('the rows board lists the four for its weather after a feed load, and asks', async () => {
  const P = page(), B = P.B;
  // the two lines that list the codes (fetchLive and loadDemo), cut and run
  const re = /const (destCodes|allCodes) = (\[\.\.\.new Set\(\[\.\.\.(\w+)\.dep, \.\.\.\3\.arr\]\.flatMap\(_flightWxCodes\)\.filter\(([^\n]*)\)\)\]);\n\s*_fetchBoardWeather\(\1\);/g;
  const found = [...CORE.matchAll(re)];
  assert.deepEqual(found.map((m) => m[1]), ['destCodes', 'allCodes'], 'the live board and the example board');
  const feed = {
    dep: [{ _locIata: 'STT' }, { _locIata: 'EIS', _stops: [{ iata: 'AXA' }] }, { _locIata: 'TNCA' }, { _locIata: 'STT' }],
    arr: [{ _locIata: 'GYE' }, { _locIata: 'YVP,YFB' }, {}]
  };
  for (const m of found) {
    const WX = B.__table('TOMORROW_WX');
    for (const k of Object.keys(WX)) delete WX[k];
    P.calls.length = 0;
    const codes = Array.from(vm.runInContext('(function (' + m[3] + ') { return ' + m[2] + '; })', B)(feed));
    assert.deepEqual(codes, ['STT', 'EIS', 'AXA', 'GYE'], m[1] + ': the places, once each, and nothing that is not a place');
    await B._fetchBoardWeather(codes);
    assert.deepEqual(P.calls.slice().sort(), ['STT', 'EIS', 'AXA', 'GYE'].map((c) => urlOf(placed(c).at)).sort(), m[1]);
    for (const c of codes) assert.equal(WX[c].current.temp, READING.current.temperature_2m, c);
  }
});

test('the belt sign asks for the weather of every airport a board can be set to', async () => {
  const P = page(), B = P.B;
  const picker = AP_LIST.map((a) => a.c);
  assert.ok(picker.length >= 120, picker.length + ' airports in the picker');
  // four of them stood in the gate map table alone (Kuwait, Kuala Lumpur,
  // Jakarta, Manila): no temperature in the header, none on the belt sign,
  // none on an empty gate
  for (const c of ['KWI', 'KUL', 'CGK', 'MNL']) assert.ok(picker.includes(c), c);
  for (const c of picker) {
    const p = placed(c);
    assert.ok(p, c + ' has a position');
    const n = P.calls.length;
    B._b5AskWx({}, c);
    assert.deepEqual(P.calls.slice(n), [urlOf(p.at)], c + ' on the belt sign');
  }
  await new Promise((r) => setImmediate(r));
});

test('the weather card of a place outside COORDS has its week, its sun and its arrival hour', async () => {
  const P = page(), B = P.B;
  for (const c of ['AXA', 'GYE', 'STT']) {
    const p = placed(c).at;
    let n = P.calls.length;
    B._wxFetchDaily(c, null);
    assert.deepEqual(P.calls.slice(n), ['/wxdaily?location=' + p[0] + ',' + p[1]], c + ' week');
    n = P.calls.length;
    B._wxFetchSun(c, Date.UTC(2026, 10, 18, 12));
    assert.equal(P.calls.length, n + 1, c + ' sun');
    assert.match(P.calls[n], new RegExp('^/wxsun\\?location=' + String(p[0]).replace('.', '\\.') + ',' + String(p[1]).replace('.', '\\.') + '&date=2026-11-1[789]$'), c + ' sun');
  }
  await new Promise((r) => setImmediate(r));
  // the arrival hour of the weather plate: Miami to each, some hours on
  const dep = Date.UTC(2026, 10, 18, 15);
  for (const c of ['AXA', 'GYE', 'STT', 'ACC']) {
    const ts = B._wxEstArrTs('MIA', c, dep);
    assert.ok(ts > dep + 3600000 && ts < dep + 16 * 3600000, c + ' ' + (ts - dep) / 3600000);
  }
  assert.equal(B._wxEstArrTs('MIA', 'TNCA', dep), 0, 'no place, no hour');
});

// ── the phone app ──────────────────────────────────────────────────────────
// Its own functions, lifted out of app.html by brace matching and run.
// from the first brace at or after `from` to the brace that closes it
function appBraces(from, what) {
  let i = APP.indexOf('{', from), d = 0;
  const start = i;
  for (; i < APP.length; i++) {
    const c = APP[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < APP.length && APP[i] !== q; i++) if (APP[i] === '\\') i++; continue; }
    if (c === '/' && APP[i + 1] === '/') { i = APP.indexOf('\n', i); continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return { start, end: i + 1 };
  }
  throw new Error(what);
}
function appFn(name) {
  const m = new RegExp('\\n(?:async )?function ' + name + '\\(').exec(APP);
  assert.ok(m, name + ' must exist in app.html');
  return APP.slice(m.index + 1, appBraces(m.index, name).end);
}
function app(win) {
  const state = /\nconst WX=\{\}, WX_TRY=\{\}; let WX_Q=\[\], WX_RUN=0, WX_ON=true, _coordsP=null;\n/.exec(APP);
  assert.ok(state, 'the app weather state');
  const calls = [];
  const fetch = (u) => { calls.push(String(u)); return answer(); };
  // the app's names (its own table, then the boards' it is served) and its
  // two notes of cut and sent codes, as app.html declares them
  for (const d of ['const _CODE_CUT=Object.create(null);', 'const _CODE_SENT=Object.create(null);']) assert.ok(APP.includes('\n' + d + '\n'), d);
  const CITY_ = Object.assign({}, shWin.FIDS_SHARED_CITY, appOwnCity());
  const CUT = Object.create(null), SENT = Object.create(null);
  const api = new Function('window', 'document', 'fetch', 'wxPaint', 'CITY', '_CODE_CUT', '_CODE_SENT',
    state[0] + appFn('_coords') + '\n' + appFn('wxPlaceAt') + '\n' + appFn('wxCodeOf') + '\n' + appFn('wxKick') + '\n' + appFn('_wxPump')
    + '\nreturn { wxKick: wxKick, wxPlaceAt: wxPlaceAt, wxCodeOf: wxCodeOf, WX: WX, idle: function () { return WX_RUN === 0 && WX_Q.length === 0; } };')(win, {}, fetch, () => {}, CITY_, CUT, SENT);
  api.calls = calls; api.CITY = CITY_; api.CUT = CUT; api.SENT = SENT;
  api.settle = async () => { for (let i = 0; i < 200000 && !api.idle(); i++) await new Promise((r) => setImmediate(r)); assert.ok(api.idle(), 'the app queue drains'); };
  return api;
}
// the places the app names: its own short table, the boards' names it is
// served (js/shared-names.js) and the names of js/earth-places.js
function appOwnCity() {
  const m = /\nconst CITY=\{/.exec(APP);
  assert.ok(m, 'the app CITY table');
  const lit = appBraces(m.index, 'CITY');
  return vm.runInNewContext('(' + APP.slice(lit.start, lit.end) + ')');
}
function appNamed() {
  const mine = appOwnCity();
  assert.ok(Object.keys(mine).length >= 40 && Object.keys(shWin.FIDS_SHARED_CITY).length >= 2400);
  return [...new Set(Object.keys(mine).concat(Object.keys(shWin.FIDS_SHARED_CITY), Object.keys(PLACES.NAME)))].filter(isCode).sort();
}

test('the phone app asks for every place it names, at the spot a board asks', async () => {
  const A = app({ AIRPORT_COORDS, FIDS_EARTH_PLACES: PLACES });
  const codes = appNamed();
  assert.ok(codes.length >= 5600, codes.length + ' places have a name in the app');
  A.wxKick(codes);
  await A.settle();
  assert.equal(A.calls.length, codes.length, 'one request for each place');
  const asked = new Set(A.calls), wrong = [];
  for (const c of codes) {
    // p: where a board asks for it; mine: where the app does
    const p = placed(c), mine = A.wxPlaceAt(AIRPORT_COORDS, c);
    if (!p || !mine || !asked.has(urlOf(mine)) || (cell(mine) !== cell(p.at) && !TWO_CELLS.includes(c)) || !A.WX[c] || A.WX[c].t !== READING.current.temperature_2m) wrong.push(c);
  }
  assert.deepEqual(wrong.slice(0, 20), [], wrong.length + ' places the app does not ask for where a board does');
  // by name
  const B = { STT: '18.34,-64.97', EIS: '18.44,-64.54', GYE: '-2.16,-79.88', AXA: '18.205,-63.054' };
  for (const c of Object.keys(B)) assert.ok(A.calls.includes('/wxcurrent?location=' + B[c]), c);
  // asked once in the half hour, and what is not a place is never asked for
  const n = A.calls.length;
  A.wxKick(['STT', 'TNCA', 'YVP,YFB', '', null, 'constructor']);
  await A.settle();
  assert.equal(A.calls.length, n);
  for (const c of ['TNCA', 'YVP,YFB', '', null, undefined, 'constructor', '__proto__', 'YY']) assert.equal(A.wxPlaceAt(AIRPORT_COORDS, c), null, String(c));
});

test('the app reads AIRPORT_COORDS, then AT: the boards\' order over the two tables it loads', async () => {
  // without the table of js/earth-places.js: what js/airport-coords.js holds
  const A = app({ AIRPORT_COORDS, FIDS_EARTH_PLACES: undefined });
  A.wxKick(['STT', 'AXA', 'YYZ']);
  await A.settle();
  assert.deepEqual(A.calls.slice().sort(), ['/wxcurrent?location=18.34,-64.97', '/wxcurrent?location=43.68,-79.63']);
  // without js/airport-coords.js (it failed to load): what AT holds
  const A2 = app({ AIRPORT_COORDS: {}, FIDS_EARTH_PLACES: PLACES });
  A2.wxKick(['STT', 'AXA', 'YYZ']);
  await A2.settle();
  assert.deepEqual(A2.calls, ['/wxcurrent?location=18.205,-63.054']);
  // a place in both is read from AIRPORT_COORDS
  const A3 = app({ AIRPORT_COORDS: { AXA: [1, 2] }, FIDS_EARTH_PLACES: PLACES });
  assert.deepEqual(A3.wxPlaceAt({ AXA: [1, 2] }, 'AXA'), [1, 2]);
  assert.deepEqual(A3.wxPlaceAt({}, 'AXA'), [18.205, -63.054]);
  assert.match(appFn('_wxPump'), /const c=WX_Q\.shift\(\), p=wxPlaceAt\(co,c\); if\(!p\)continue;/);
});

test('a card of the phone app cut from an ICAO code has no weather of another place', async () => {
  // the two notes and the card's own flag, as adbToCard writes them where it
  // reads the feed (the lines themselves, cut out and run)
  const noted = /\n  (const cityCut=!!\(other\.airport&&!other\.airport\.iata&&other\.airport\.icao\);\n  if\(cityCut\)_CODE_CUT\[String\(other\.airport\.icao\)\.slice\(1\)\.toUpperCase\(\)\]=1;\n  else if\(typeof _CODE_SENT!=='undefined'&&other\.airport&&other\.airport\.iata\)_CODE_SENT\[String\(other\.airport\.iata\)\.trim\(\)\.toUpperCase\(\)\]=1;)\n  return\{\n    airline:code, flight:num, dir:dir,\n    cityIata:\(\(\(other\.airport&&\(other\.airport\.iata\|\|\(other\.airport\.icao\|\|''\)\.slice\(1\)\)\)\|\|''\)\)\.toUpperCase\(\), cityCut:cityCut,\n/.exec(APP);
  assert.ok(noted, 'adbToCard cuts a code from an ICAO code, notes it, and the card carries its own cut');
  const A = app({ AIRPORT_COORDS, FIDS_EARTH_PLACES: PLACES });
  const note = new Function('_CODE_CUT', '_CODE_SENT', 'other', noted[1] + ' return cityCut;');
  const card = (airport) => ({ cityIata: String(airport.iata || (airport.icao || '').slice(1) || '').toUpperCase(), cityCut: note(A.CUT, A.SENT, { airport }), cityName: airport.name || '' });
  assert.ok(!A.CITY.YBE && !A.CITY.SGG && !A.CITY.APA && A.CITY.BGR && A.CITY.AXA, 'the names the app has');

  const belgrade = card({ icao: 'LYBE', name: 'Belgrade' }), geneva = card({ icao: 'LSGG', name: 'Geneva' }), antigua = card({ icao: 'TAPA', name: 'Antigua' });
  const bangor = card({ icao: 'KBGR', name: 'Bangor' }), stt = card({ iata: 'STT', icao: 'TIST', name: 'St. Thomas' }), rih = card({ iata: 'RIH', icao: 'MPSM', name: 'Rio Hato' });
  assert.deepEqual([belgrade.cityIata, belgrade.cityCut, geneva.cityIata, antigua.cityIata, bangor.cityIata, bangor.cityCut, stt.cityCut], ['YBE', true, 'SGG', 'APA', 'BGR', true, false]);
  for (const f of [belgrade, geneva, antigua]) {
    assert.ok(A.wxPlaceAt(AIRPORT_COORDS, f.cityIata), f.cityIata + ' is another place, with a position');
    assert.equal(A.wxCodeOf(f), '', f.cityName + ' cut to ' + f.cityIata + ' has no weather code');
    // a card kept from before the flag, known by the note alone
    assert.equal(A.wxCodeOf({ cityIata: f.cityIata }), '', f.cityIata);
  }
  // a cut code CITY names prints that name, and has its weather as before;
  // a code the feed sent is a place, whether CITY names it or AT alone does
  assert.equal(A.wxCodeOf(bangor), 'BGR');
  assert.equal(A.wxCodeOf(stt), 'STT');
  assert.equal(A.wxCodeOf(rih), 'RIH');
  for (const f of [null, undefined, {}, { cityIata: '' }]) assert.equal(A.wxCodeOf(f), '');
  // what a list of rows asks for (render and showMore hand wxKick this)
  A.wxKick([belgrade, geneva, antigua, bangor, stt, rih].map(A.wxCodeOf));
  await A.settle();
  assert.deepEqual(A.calls.slice().sort(), ['BGR', 'STT', 'RIH'].map((c) => urlOf(A.wxPlaceAt(AIRPORT_COORDS, c))).sort());
  for (const c of ['YBE', 'SGG', 'APA']) assert.equal(A.WX[c], undefined, c + ' has no temperature to print');

  // the feed then sends YBE itself (Uranium City): its own cards have their
  // weather; the card that was cut still has none
  const uranium = card({ iata: 'YBE', icao: 'CYBE', name: 'Uranium City' });
  assert.equal(A.wxCodeOf(uranium), 'YBE');
  assert.equal(A.wxCodeOf({ cityIata: 'YBE' }), 'YBE');
  assert.equal(A.wxCodeOf(belgrade), '', 'the card that was cut never takes it');
  // and a cut alone takes nothing from a place CITY names (Anguilla, in AT alone)
  assert.equal(A.wxCodeOf({ cityIata: 'AXA', cityCut: true }), 'AXA');

  // EVERY WAY TO A TEMPERATURE in the app goes through it: the row, the two
  // lists that ask, and the route card (its code, its temperature, its
  // credit and its own asking)
  assert.match(appFn('rowHtml'), /\+rowSubParts\(f\)\+wxHtml\(wxCodeOf\(f\)\)\+/);
  const kicks = APP.match(/[^\n]*\bwxKick\([^\n]*/g).filter((l) => !/^\s*\/\//.test(l) && !/^function wxKick\(/.test(l)).map((l) => /wxKick\([^;]*\);/.exec(l)[0]);
  assert.deepEqual(kicks, ['wxKick(list.slice(0,n).map(wxCodeOf));', 'wxKick(RENDERED.slice(from,to).map(wxCodeOf));', 'wxKick([oc]);']);
  const open = appFn('openFlight');
  assert.match(open, /\n  const oc=String\(wxCodeOf\(f\)\|\|''\);\n/);
  assert.match(open, /data-wx="'\+esc\(oc\)\+'">'\+\(wxTemp\(oc\)\?'<bdi>'\+esc\(wxTemp\(oc\)\)\+'<\/bdi>':''\)/);
  assert.match(open, /data-wxc="'\+esc\(oc\)\+'">'\+\(WX_ON&&wxTemp\(oc\)\?/);
  assert.match(open, /\n  if\(WX_ON&&oc\)wxKick\(\[oc\]\);\n/);
  assert.doesNotMatch(APP, /wx(?:Temp|Html)\(f\.cityIata\)|=>f\.cityIata\)\);/);
});

test('js/airport-coords.js holds every place COORDS and GATE_AP hold, in the cell the board asks at', () => {
  // The app loads neither board table. A place added to one of them and not
  // to js/airport-coords.js has a name in the app and no temperature; one
  // that stands in another cell there is asked for twice upstream.
  // EACH ROW IS HELD TO THE TABLE IT WAS TAKEN FROM, never to the lookup:
  // the lookup reads js/airport-coords.js before GATE_AP, so for a place
  // COORDS lacks it answers with the row itself, and a row held to itself
  // holds nothing (Kuala Lumpur moved to northern Italy passed).
  const missing = [], moved = [], fromGate = [];
  for (const c of [...new Set(Object.keys(COORDS).concat(Object.keys(GATE_AP)))].filter(isCode)) {
    if (!own(AIRPORT_COORDS, c)) { missing.push(c); continue; }
    const inCoords = own(COORDS, c), src = inCoords ? COORDS[c] : GATE_AP[c];
    const a = AIRPORT_COORDS[c], b = [Number(src[0]), Number(src[1])];
    if (cell(a) !== cell(b)) moved.push(c);
    // and never far: the rule the board tables are already held to
    // (tests/day-night-engine.test.js), 0.05 of a degree
    assert.ok(Math.abs(a[0] - b[0]) <= 0.05 && Math.abs(a[1] - b[1]) <= 0.05, c + ': ' + a + ' / ' + b);
    // a row taken from GATE_AP is that row, digit for digit: for these
    // places js/airport-coords.js is where the boards ask too
    if (!inCoords) { fromGate.push(c); assert.deepEqual([Number(a[0]), Number(a[1])], b, c + ' is not the position GATE_AP holds'); }
  }
  // (63 on 2026-11-18, Kuala Lumpur, Jakarta and Manila among them; fewer
  // only as COORDS takes them)
  for (const c of ['STT', 'EIS', 'GYE', 'KUL', 'CGK', 'MNL']) assert.ok(fromGate.includes(c) || own(COORDS, c), c);
  assert.deepEqual(missing, [], 'add these rows to fids-current/js/airport-coords.js, at the position of COORDS (else GATE_AP)');
  assert.deepEqual(moved, TWO_CELLS, 'the places that stand in another two-decimal cell than the board asks at: the one known, and no other');
  // and nothing AT holds is in it (AT is only what no other table places:
  // tests/earth-places.test.js)
  assert.deepEqual(Object.keys(PLACES.AT).filter((c) => own(AIRPORT_COORDS, c)), []);
});

test('the sun or the moon on a row\'s weather icon is the one over the place: the day and night engine places what the weather places', () => {
  // js/fids-sun.js, run in the page beside the board script as the pages
  // load it (its own tables first, then the weather's lookup)
  const P = page(), B = P.B;
  if (!B.FidsSun) vm.runInContext(fs.readFileSync(path.join(JS, 'fids-sun.js'), 'utf8'), B, { filename: 'js/fids-sun.js' });
  assert.equal(typeof B.FidsSun.browserEnv, 'function');
  const coords = B.FidsSun.browserEnv(B).coords;
  for (const c of ['AXA', 'ABV', 'STT', 'GYE', 'YYZ']) {
    const p = placed(c).at, got = coords(c);
    assert.ok(got, c + ' has a position for its sun');
    assert.deepEqual([Number(got[0]), Number(got[1])], p, c);
  }
  assert.equal(coords('TNCA'), null);
  // and night falls there by its own sun: Abuja (in AT alone) is in the dark
  // at 01:00 UTC and in daylight at 12:00 UTC, whatever the board's own hour
  const sun = B.FidsSun.create({ coords, tz: () => null });
  assert.equal(sun.isDay('ABV', Date.UTC(2026, 10, 18, 1)), false);
  assert.equal(sun.isDay('ABV', Date.UTC(2026, 10, 18, 12)), true);
  assert.equal(sun.isDay('AXA', Date.UTC(2026, 10, 18, 4)), false);
  assert.equal(sun.isDay('AXA', Date.UTC(2026, 10, 18, 16)), true);
  // a page without the board script (the engine can be loaded alone) keeps
  // its own three tables and answers nothing for the rest
  const alone = FidsSun.browserEnv({}).coords;
  assert.equal(alone('AXA'), null);
});
