'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — EVERY PLACE THE BOARDS LIST CAN BE PLACED, AND NAMED
//
// The overnight sweep of every airport's live board (2026-10-19) found:
//   · Roberval (YRJ), in the airport picker, opened with no position for
//     itself: the old dotted globe under its notice, and English first on a
//     Québec board (and so would any Québec airport off the French-first
//     list: the board opens on any airport by URL);
//   · 41 places the boards listed with no position in any table, so no route
//     (West Palm Beach now arrives as DJT, its new code since August 2026,
//     with no name either: 'Djt', 'West Palm Beach Donald J. Trump Intl');
//   · rows with no code at all because the feed wrote the name in a way no
//     whole name in our tables matches: 'Harrisburg, PA', 'St Hubert',
//     'Toronto Centre-Ville', 'Ft McMurray', 'Montreal-Trdeau'. The map
//     reads these (_iataFromRowName); the rows themselves keep their words
//     and their missing code (_iataFromCityName is main's), so nothing else
//     on the board changes. A list of stops ('Whitehorse, Calgary') is not
//     read at all: the feeds disagree on which name is the destination.
// The positions and regions are OurAirports' (ourairports.com/data, public
// domain); the lists below are taken from the same data.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'fids-current', 'js');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
const BS = require(path.join(JS, 'board-strings.js'));
const E = require(path.join(JS, 'fids-earth.js'));

function literal(marker) {
  const at = CORE.indexOf(marker);
  assert.ok(at >= 0, 'fids-core.js no longer declares ' + marker);
  const open = marker.slice(-1), close = open === '[' ? ']' : '}';
  let i = CORE.indexOf(open, at), d = 0, j = i;
  for (; j < CORE.length; j++) { if (CORE[j] === open) d++; else if (CORE[j] === close && --d === 0) break; }
  return CORE.slice(i, j + 1);
}
const table = (marker) => vm.runInNewContext('(' + literal(marker) + ')');
const AP = table('const AP = {'), COORDS = table('const COORDS = {'), GATE_AP = table('var GATE_AP={'), AP_LIST = table('const AP_LIST = [');
const CITY = table('const CITY = {'), CITY_FR = table('const CITY_FR = {');
const LIVE = vm.runInNewContext(CORE.slice(CORE.indexOf('const FIDS_LIVE_AIRPORTS = new Set(') + 'const FIDS_LIVE_AIRPORTS = new Set('.length, CORE.indexOf(']);', CORE.indexOf('const FIDS_LIVE_AIRPORTS = new Set(')) + 1));
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(JS, 'airport-coords.js'), 'utf8'), { window: win });
const AIRPORT_COORDS = win.AIRPORT_COORDS;
const pair = (v) => (v ? [+(v.lat != null ? v.lat : v[0]), +(v.lon != null ? v.lon : (v.lng != null ? v.lng : v[1]))] : null);
// the floor's own order (fids-earth.js coordsOf)
const coordsOf = (c) => pair(COORDS[c]) || pair(AIRPORT_COORDS[c]) || pair(GATE_AP[c]);
const OPENABLE = [...new Set(AP_LIST.map((a) => a.c).concat([...LIVE]))].sort();

// OurAirports (public domain), 2026-10-19: the positions added in v24067
const OURAIRPORTS = {
  YRJ: [48.520, -72.266], DJT: [26.683, -80.096], PVC: [42.072, -70.221], FMN: [36.741, -108.230],
  BZE: [17.540, -88.304], XPL: [14.382, -87.621], RTB: [16.317, -86.523], SAP: [15.453, -87.924],
  MGA: [12.142, -86.168], CAP: [19.726, -72.201], CYA: [18.271, -73.788], BON: [12.131, -68.269],
  ANU: [17.137, -61.793], DOM: [15.547, -61.301], SKB: [17.311, -62.719], MAR: [10.558, -71.729],
  FAE: [62.063, -7.276], SFJ: [67.010, -50.715], GIB: [36.152, -5.350], JER: [49.208, -2.196],
  GCI: [49.435, -2.602], BTS: [48.170, 17.213], KSC: [48.663, 21.241], LOS: [6.577, 3.321],
  WDH: [-22.480, 17.471], MLE: [4.192, 73.529], GYD: [40.473, 50.051], OAG: [-33.382, 149.131],
  YYE: [58.836, -122.597], YYF: [49.463, -119.602], YWL: [52.183, -122.054], YAA: [52.452, -125.304],
  XQU: [49.337, -124.393], ZMT: [54.028, -132.125], ZEL: [52.185, -128.157], YZZ: [49.056, -117.609],
  YFI: [57.276, -110.977], ZFD: [59.334, -107.182], YVQ: [65.282, -126.798], YYH: [69.547, -93.577],
  YCO: [67.816, -115.143], YMX: [45.680, -74.039], YKQ: [51.473, -78.758], YHR: [50.468, -59.638],
  YTF: [48.509, -71.642], AKV: [60.819, -78.149], YIK: [62.417, -77.925], YQC: [61.046, -69.618],
  YKG: [60.027, -69.999], XGR: [58.711, -65.993],
};
// every IATA code OurAirports places in Québec (iso_region CA-QC)
const QUEBEC = ('AKV SSQ XGR YAH YAR YAU YBC YBG YBJ YBX YDO YEY YFE YFG YGL YGP YGR YGV YGW YHR YHU YIF YIK YJN ' +
  'YKG YKL YKQ YKU YLP YLQ YLS YME YML YMT YMW YMX YNA YNC YND YNM YNS YOI YPH YPJ YPN YPX YQB YQC ' +
  'YRI YRJ YRQ YSC YTF YTM YTQ YUD YUL YUY YVB YVO YVP YWB YWQ YXK YYY YZG YZV ZBM ZEM ZGS ZKG ZLT ' +
  'ZTB').split(' ').filter(Boolean);

test('every airport the board can open has a position: the floor is drawn at all of them', () => {
  assert.ok(OPENABLE.length >= 138, OPENABLE.length + ' airports');
  assert.deepEqual(OPENABLE.filter((c) => !coordsOf(c)), [], 'airports the board opens with no position (the old dotted globe stays under their notice)');
  assert.deepEqual(coordsOf('YRJ'), [48.52, -72.266], 'Roberval');
});

test('the places the sweep found unplaceable have OurAirports\' positions, the same in both tables', () => {
  for (const [c, ref] of Object.entries(OURAIRPORTS)) {
    assert.deepEqual(pair(COORDS[c]), ref, 'COORDS.' + c);
    assert.deepEqual(pair(AIRPORT_COORDS[c]), ref, 'AIRPORT_COORDS.' + c);
  }
  assert.ok(Object.keys(OURAIRPORTS).length >= 50);
  // West Palm Beach's new code is the airport PBI was: same place, same clock
  const d = coordsOf('DJT'), p = coordsOf('PBI');
  assert.ok(Math.abs(d[0] - p[0]) < 0.02 && Math.abs(d[1] - p[1]) < 0.02, 'DJT stands where PBI does');
  assert.equal(E.ZONES.DJT, E.ZONES.PBI);
  assert.equal(E.ZONES.DJT, 'America/New_York');
});

test('French leads at every Québec airport (the board opens on any airport by URL), and the list holds Québec only', () => {
  const qc = new Set(QUEBEC);
  assert.equal(QUEBEC.length, 73);
  for (const c of QUEBEC) assert.ok(BS.FR_FIRST.includes(c), c + ' is in Québec and must lead in French');
  for (const c of BS.FR_FIRST) if (c !== 'YMY') assert.ok(qc.has(c), c + ' is not a Québec airport');   // YMY: Montréal's central station
  assert.equal(new Set(BS.FR_FIRST).size, BS.FR_FIRST.length, 'each code once');
  assert.ok(!BS.FR_FIRST.includes('YHA'), 'YHA is Port Hope Simpson, Labrador');
  // the ones in the board's own tables that the list missed: in the airport
  // table (Îles-de-la-Madeleine, Mont-Joli) and the gate table (Chibougamau,
  // Schefferville)
  for (const c of ['YRJ', 'YGR', 'YYY', 'YMT', 'YKL']) {
    assert.ok(AP[c] || GATE_AP[c] || CITY[c], c + ' is one of ours');
    assert.deepEqual(BS.resolveLangs({ iata: c }).langs, ['fr', 'en'], c + ' reads French first');
  }
  assert.equal(BS.boardClock24(['fr', 'en']), true, 'and so its clock is 24-hour');
  assert.deepEqual(BS.resolveLangs({ iata: 'YQM' }).langs[0], 'en', 'Moncton, in New Brunswick, is not on it');
});

// the board's name lookup (the rows': _iataFromCityName) and the map's
// reading of a row with no code (_iataFromRowName), out of fids-core.js,
// with their tables
let NAMES_ = null;
const names = () => NAMES_ || (NAMES_ = (() => {
  const block = CORE.slice(CORE.indexOf('\nvar _CITY2IATA = null;') + 1, CORE.indexOf('\nfunction formatCityIata(') + 1);
  return new Function('CITY', 'CITY_FR', 'AP', 'AP_LIST', 'COORDS', 'GATE_AP', 'window', 'BoardStrings',
    block + '\nreturn { look: _iataFromCityName, row: _iataFromRowName, key: _normCityKey, region: _ROW_REGION, alias: _CITY2IATA_ALIAS, rowAlias: _ROW_NAME_ALIAS, renamed: _IATA_RENAMED, index: function () { _iataFromCityName(\'xxx\'); return _CITY2IATA; } };')(
    CITY, CITY_FR, AP, AP_LIST, COORDS, GATE_AP, { AIRPORT_COORDS }, BS);
})());
// main's own lookup, as it was before v24067: a whole name, or one of its aliases
const MAIN_ALIAS = { gulfportbiloxi: 'GPT', gulfport: 'GPT', bentonvillefayetteville: 'XNA', northwestarkansas: 'XNA',
  pensacola: 'PNS', syracuse: 'SYR', raleighdurham: 'RDU', raleighdurhamnc: 'RDU' };
// every name of ours, with every code it is ours for
function allNames() {
  const ALL = new Map(), key = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const addName = (c, n) => { if (!n) return; const k = key(n); if (k.length < 3) return; if (!ALL.has(k)) ALL.set(k, { name: n, codes: new Set() }); ALL.get(k).codes.add(String(c).toUpperCase()); };
  // (DJT is PBI's new code: one airport, named as PBI is)
  AP_LIST.forEach((a) => addName(a.c, a.n)); Object.keys(CITY).forEach((c) => c !== 'DJT' && addName(c, CITY[c])); Object.keys(CITY_FR).forEach((c) => c !== 'DJT' && addName(c, CITY_FR[c]));
  return ALL;
}

test('the rows the sweep found with no code: the map reads their airport, the rows keep their words and no code', () => {
  const NAMES = names();
  const want = {
    'Harrisburg, PA': 'MDT', 'Richmond, VA': 'RIC', 'Charlotte, NC': 'CLT', 'Burlington, VT': 'BTV', 'Pensacola, FL': 'PNS',
    'Birmingham, AL': 'BHM', 'Cincinnati, OH': 'CVG', 'Cincinnati, KY': 'CVG', 'St Hubert': 'YHU', 'Saint-Hubert': 'YHU', 'Toronto Centre-Ville': 'YTZ',
    'Ft Mackay/Firebag': 'YFI', 'Ft McMurray': 'YMM', 'Montreal-Trdeau': 'YUL', 'Portland, ME': 'PWM', 'Portland, OR': 'PDX',
    'London, ON': 'YXU', 'Hamilton, ON': 'YHM', 'Victoria, BC': 'YYJ', 'Saint Louis': 'STL', 'Ft Lauderdale': 'FLL'
  };
  for (const [name, code] of Object.entries(want)) {
    assert.equal(NAMES.row(name), code, 'the map reads ' + name);
    assert.equal(NAMES.look(name), '', 'the row of ' + name + ' keeps no code (as on main)');
  }
  // a place that has its own name now (CITY, v24067) is read by that name,
  // by the rows as by the map, as every city in the table is
  for (const [name, code] of [['Norman Wells', 'YVQ'], ['Firebag', 'YFI'], ['Managua', 'MGA'], ['Tegucigalpa', 'XPL']]) {
    assert.equal(NAMES.row(name), code, name);
    assert.equal(NAMES.look(name), code, name);
  }
});

test('and never a wrong airport: a name with two of ours, a place in another state, or a list of stops stays code-less', () => {
  const NAMES = names();
  for (const name of ['Montreal', 'Toronto', 'Houston', 'Chicago, IL', 'New York, NY', 'Houston, TX', 'Columbus, OH',
    'Dallas, TX', 'Orlando, FL', 'Miami, FL', 'Phoenix, AZ', 'Atlanta, GA', 'Seattle, WA', 'Denver, CO',   // a city with two or more of ours there
    'Washington, DC',            // Reagan or Dulles
    'Jacksonville, NC',          // not Jacksonville, Florida
    'Paris, TX', 'Rome, GA',     // not Paris or Rome
    'Ottawa, Ontario', 'Victoria, Seychelles', 'Kingston, Jamaica', 'Punta Cana, Rd', 'Montreal-Trudeaux International',
    // a name of ours, in a state or province its airport is not in
    // (OurAirports' regions, not boxes: neighbouring boxes overlap)
    'Waterloo, ON',              // Waterloo, Iowa is ALO; Ontario's is Kitchener-Waterloo
    'Victoria, WA', 'Greenville, TN', 'Columbia, GA', 'Jackson, LA', 'Moncton, NS', 'Ottawa, QC',
    // a list of stops: which is the destination, the feeds disagree
    // (Edmonton writes it first, Orlando's coded rows last)
    'Whitehorse, Calgary', 'Inuvik, Yellowknife, Norman Wells', 'Brussels, Charleroi', 'Venice, Treviso',
    'Barcelona, Girona', 'Tampa, St Pete', 'Los Angeles, Burbank', 'San Francisco, Oakland', 'Vancouver, Abbotsford',
    'Raleigh, Ogdensburg', 'Myrtle Beach, White Plains', 'Hamilton, Bermuda']) {
    assert.equal(NAMES.row(name), '', name);
    assert.equal(NAMES.look(name), '', name);
  }
});

// (but for one name: 'Fort Worth' is Dallas/Fort Worth's second name and
// Meacham's, FTW, which has no airline service; it has no code now, as
// 'Houston' has none: the fifth review, below)
const SECOND_NAMES = { fortworth: ['DFW', 'FTW'] };
test('the rows\' own lookup is main\'s, and the map reads every whole name as the rows do', () => {
  const NAMES = names(), ALL = allNames();
  for (const [k, v] of ALL) {
    const exact = MAIN_ALIAS[k] || (v.codes.size === 1 && !SECOND_NAMES[k] ? [...v.codes][0] : '');
    assert.equal(NAMES.look(v.name), exact, v.name);
    if (exact) assert.equal(NAMES.row(v.name), exact, 'the map reads ' + v.name);
  }
  assert.deepEqual(NAMES.alias, MAIN_ALIAS, 'the rows\' aliases are main\'s');
  assert.equal(NAMES.look('West Palm Beach'), 'PBI', 'West Palm Beach reads PBI, as it did');
  assert.equal(NAMES.index().westpalmbeach, 'PBI', 'not a name with two codes');
  // the feed mapper reads the rows' lookup, and nothing on the board but the map reads the map's
  assert.match(CORE, /if \(!locIata && typeof _iataFromCityName === 'function'\) locIata = _iataFromCityName\(cityName\) \|\| '';\s*\}\s*let locName=formatCityIata\(CITY\[locIata\] \|\| cityName \|\| locIata \|\| '—', locIata\);/);
  assert.equal((CORE.match(/_iataFromRowName\(/g) || []).length, 1, 'fids-core.js defines _iataFromRowName and never calls it');
});

test('each of the map\'s rules holds over the whole index', () => {
  const NAMES = names(), ALL = allNames();
  // 1 · St/Ste/Ft/Mt and Saint/Sainte/Fort/Mount never turn one place's name into another's
  const swaps = [[/ st /gi, ' saint '], [/ ste /gi, ' sainte '], [/ ft /gi, ' fort '], [/ mt /gi, ' mount '], [/ saint /gi, ' st '], [/ sainte /gi, ' ste '], [/ fort /gi, ' ft '], [/ mount /gi, ' mt ']];
  for (const [, v] of ALL) {
    const t = ' ' + v.name.replace(/[.\-‐-―]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    for (const [re, to] of swaps) {
      const s = t.replace(re, to).trim(); if (s === t.trim()) continue;
      const got = NAMES.row(s), other = ALL.get(NAMES.key(s));
      if (got && !other) assert.ok(v.codes.has(got), `${v.name} spelt "${s}" reads ${got}`);
    }
  }
  // 2 · 'Name, ST' reads only one of that name's airports, and only one
  // OurAirports places in that state or province
  const regionOf = {};
  Object.entries(NAMES.region).forEach(([r, list]) => list.split(' ').forEach((c) => { assert.ok(!regionOf[c], c + ' in two regions'); regionOf[c] = r; }));
  // Québec's are the board's one list of them (BoardStrings.FR_FIRST)
  assert.ok(!('QC' in NAMES.region), 'no second list of Québec airports');
  BS.FR_FIRST.forEach((c) => { assert.ok(!regionOf[c], c + ' is in Québec and in ' + regionOf[c]); regionOf[c] = 'QC'; });
  assert.equal(NAMES.row('Rouyn-Noranda, QC'), 'YUY');
  assert.equal(NAMES.row('Sept-Iles, QC'), 'YZV');
  let n = 0;
  for (const [, v] of ALL) for (const st of Object.keys(REGION_EXTENTS).concat(['DC'])) {
    const got = NAMES.row(v.name + ', ' + st); if (!got) continue;
    if (got === (NAMES.index()[NAMES.key(v.name + ', ' + st)] || '')) continue;   // a whole name of its own
    if (NAMES.rowAlias[NAMES.key(v.name + ', ' + st)] === got) continue;          // 'Cincinnati, OH'
    assert.equal(regionOf[got], st, `${v.name}, ${st} reads ${got}, which OurAirports places in ${regionOf[got] || 'no state or province'}`);
    const spelt = (NAMES.row(v.name) === got);
    assert.ok(v.codes.has(got) || spelt, `${v.name}, ${st} reads ${got}, not one of its airports`);
    n++;
  }
  assert.ok(n > 700, n + ' state and province readings checked');
  assert.ok(!('DC' in NAMES.region), 'Washington, DC stays code-less');
  // 3 · and the regions agree with the board's own positions: each code
  // stands inside its state's or province's airports (OurAirports' extents),
  // two sources that must not disagree (YMU, where they do, is left out)
  let k = 0;
  for (const [c, r] of Object.entries(regionOf)) {
    const p = coordsOf(c), b = REGION_EXTENTS[r];
    assert.ok(b, r + ' has its extents');
    if (!p) continue;
    assert.ok(p[0] >= b[0] - 0.5 && p[0] <= b[1] + 0.5 && p[1] >= b[2] - 0.5 && p[1] <= b[3] + 0.5, `${c} stands at ${p}, outside ${r}`);
    k++;
  }
  assert.ok(k > 700, k + ' codes checked against their positions');
  assert.ok(!regionOf.YMU, 'YMU: OurAirports and our tables disagree on what it is');
  // 4 · the airports of one city have short names at least 3 letters apart,
  // so a name one letter off reads one of them, never either
  const ed = (a, b) => { const d = []; for (let i = 0; i <= a.length; i++) d[i] = [i]; for (let j = 0; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  for (const [, v] of ALL) {
    const subs = [...v.codes].map((c) => NAMES.key((AP[c] && AP[c].sub) || '')).filter((s) => s.length >= 5);
    for (let i = 0; i < subs.length; i++) for (let j = i + 1; j < subs.length; j++) assert.ok(ed(subs[i], subs[j]) >= 3, `${v.name}: ${subs[i]} and ${subs[j]}`);
  }
});

test('West Palm Beach\'s new code is named in every table as PBI is', () => {
  const SHARED = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: SHARED });
  assert.equal(CITY.DJT, CITY.PBI);
  assert.equal(CITY_FR.DJT, CITY_FR.PBI);
  assert.equal(SHARED.FIDS_SHARED_CITY.DJT, SHARED.FIDS_SHARED_CITY.PBI, 'the companion app\'s copy');
  assert.equal(CITY.DJT, 'WEST PALM BEACH');
  assert.deepEqual(names().renamed, { DJT: 'PBI' });
});

// OurAirports' extents of each US state's and Canadian province's airports
// (every airport in it, its furthest south, north, west and east, rounded
// out to 0.1 degree): [south, north, west, east]
const REGION_EXTENTS = {
  AB: [48.9, 59.7, -119.9, -109.9], AK: [51.8, 71.4, -176.7, -129.9], AL: [30.1, 35.1, -88.5, -84.8],
  AR: [32.9, 36.6, -94.7, -89.7], AZ: [31.2, 37.1, -114.8, -109], BC: [48.3, 59.9, -136.7, -114.8],
  CA: [32.5, 42, -124.3, -114.1], CO: [37, 41.1, -109.1, -102], CT: [41.1, 42.1, -73.6, -71.7],
  DE: [38.4, 39.8, -75.8, -75], FL: [24.5, 31.1, -87.6, -80], GA: [30.6, 35.1, -85.6, -81],
  HI: [19.6, 24, -159.9, -154.9], IA: [40.4, 43.6, -96.5, -90.1], ID: [41.9, 49.1, -117.2, -111],
  IL: [37, 42.6, -91.5, -87.4], IN: [37.8, 41.9, -88, -84.7], KS: [36.9, 40, -102.1, -94.5],
  KY: [36.4, 39.1, -89.4, -82.2], LA: [28.9, 33.1, -94.1, -89.1], MA: [41.2, 43, -73.5, -69.9],
  MB: [49, 59.8, -101.9, -90], MD: [37.9, 39.8, -79.6, -75], ME: [43, 47.5, -71.1, -66.9],
  MI: [41.6, 47.3, -90.2, -82.4], MN: [43.4, 49.4, -97.1, -90.3], MO: [35.9, 40.7, -95.7, -89.1],
  MS: [30.2, 35.1, -91.4, -88.1], MT: [44.6, 49.1, -116.1, -104], NB: [44.6, 48.1, -68.6, -64.3],
  NC: [33.8, 36.6, -84, -75.5], ND: [45.9, 49.1, -104.1, -96.5], NE: [39.9, 43, -104.1, -95.5],
  NH: [42.6, 45, -72.5, -70.7], NJ: [38.9, 41.3, -75.6, -73.9], NL: [47, 58.6, -67, -52.7],
  NM: [31.4, 37.1, -109.1, -103], NS: [43.5, 46.4, -66.5, -59.8], NT: [59.8, 72.1, -135.1, -102.4],
  NU: [61, 83.2, -116.3, -62.2], NV: [35.2, 42.1, -120.1, -114], NY: [40.5, 45.1, -79.8, -71.8],
  OH: [38.3, 41.9, -84.9, -80.4], OK: [33.7, 37.1, -102.6, -94.4], ON: [41.7, 56.1, -94.8, -74.3],
  OR: [41.9, 46.3, -124.6, -116.4], PA: [39.6, 42.3, -80.6, -74.8], PE: [46.2, 46.5, -63.9, -62.5],
  QC: [44.9, 62.5, -79.5, -57.1], RI: [41.1, 42, -71.9, -71], SC: [32, 35.3, -83.1, -78.6],
  SD: [42.4, 46.1, -104.1, -96.4], SK: [48.9, 59.9, -110, -101.4], TN: [34.9, 36.7, -90.2, -81.7],
  TX: [25.8, 36.6, -106.5, -93.6], UT: [36.9, 42.1, -114.1, -109], VA: [36.4, 39.5, -83.3, -75.3],
  VT: [42.7, 45.1, -73.5, -71.7], WA: [45.5, 49.1, -124.7, -116.9], WI: [42.4, 47, -92.9, -86.8],
  WV: [37.2, 40.7, -82.7, -77.7], WY: [40.9, 45.1, -111.1, -104], YT: [60, 69.7, -141, -128.2]
};


test('Kuujjuarapik is named as itself: YGW was written Chisasibi, which is YKU', () => {
  const SHARED = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: SHARED });
  assert.equal(CITY.YGW, 'KUUJJUARAPIK');
  assert.equal(SHARED.FIDS_SHARED_CITY.YGW, 'KUUJJUARAPIK');
  assert.ok(!CITY_FR.YGW || CITY_FR.YGW === 'KUUJJUARAPIK');
  const p = coordsOf('YGW');
  assert.ok(Math.abs(p[0] - 55.28) < 0.05 && Math.abs(p[1] + 77.77) < 0.05, 'YGW stands at Kuujjuarapik (OurAirports CYGW 55.28, -77.77)');
  assert.equal(names().look('Chisasibi'), 'YKU', 'and the name Chisasibi is no longer two codes');
});


// ── v24067, third review ──────────────────────────────────────────────────

test('every place the map can draw has a city name, in English and in French, and in the companion app\'s copy', () => {
  const SHARED = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: SHARED });
  const S = SHARED.FIDS_SHARED_CITY;
  // (the gate table's EBM, El Borma's code, stood on Pamplona, whose code is
  // PNA: the row is gone, and EBM has no position)
  assert.ok(!GATE_AP.EBM && !coordsOf('EBM'), 'EBM is not on the map at Pamplona');
  assert.deepEqual(coordsOf('PNA'), [42.77, -1.65], 'Pamplona is PNA');
  const all = [...new Set(Object.keys(COORDS).concat(Object.keys(AIRPORT_COORDS), Object.keys(GATE_AP)))];
  assert.ok(all.length > 2400, all.length + ' places with a position');
  const noName = all.filter((c) => !CITY[c]), noFr = all.filter((c) => !CITY_FR[c]);
  const noApp = all.filter((c) => String(S[c] || '').toUpperCase() !== String(CITY[c] || '').toUpperCase());
  assert.deepEqual(noName, [], 'places the map can draw with no name: the floor would print the code ("Xpl")');
  assert.deepEqual(noFr, [], 'places with no French name');
  assert.deepEqual(noApp, [], 'the companion app\'s copy of CITY (shared-names.js) differs');
  // the 50 positions this build adds, and every place the sweep's pages
  // carry, by name in both tables
  for (const c of Object.keys(OURAIRPORTS)) assert.ok(CITY[c] && CITY_FR[c], c + ' (a new position)');
  const FX = require('./fixtures/earth-sweep-2026-10-19.json');
  for (const fl of FX.floors) for (const p of fl.places) assert.ok(CITY[p[0]] && CITY_FR[p[0]], fl.id + ': ' + p[0]);
  // the cases the checker found, and the French that differs
  const want = { XPL: ['TEGUCIGALPA', 'TEGUCIGALPA'], MGA: ['MANAGUA', 'MANAGUA'], CAP: ['CAP-HAÏTIEN', 'CAP-HAÏTIEN'], GYD: ['BAKU', 'BAKOU'],
    MLE: ['MALÉ', 'MALÉ'], JER: ['JERSEY', 'JERSEY'], YVQ: ['NORMAN WELLS', 'NORMAN WELLS'], YYE: ['FORT NELSON', 'FORT NELSON'],
    ZAG: ['ZAGREB', 'ZAGREB'], MCT: ['MUSCAT', 'MASCATE'], MLA: ['MALTA', 'MALTE'], STX: ['ST CROIX', 'SAINTE-CROIX'] };
  for (const [c, [en, fr]] of Object.entries(want)) { assert.equal(CITY[c], en, c); assert.equal(CITY_FR[c], fr, c + ' in French'); }
});

// ── v24067, fourth review ─────────────────────────────────────────────────

// the board's own city helpers, out of fids-core.js, with its tables (as
// tests/quebec-names-codeless-rows.test.js builds them), and the floor's
// reading of a row's name (fids-earth.js cityName)
let BOARD_ = null;
function board() { return BOARD_ || (BOARD_ = makeBoard(CITY, CITY_FR)); }
// (and with other tables: a code with no name anywhere)
function makeBoard(CITY, CITY_FR) {
  const blockFrom = (src, at) => { let d = 0, j = src.indexOf('{', at); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(at, j + 1); };
  const fn = (name) => { const i = CORE.lastIndexOf('\nfunction ' + name + '('); assert.ok(i >= 0, name); return blockFrom(CORE, i + 1); };
  const between = (a, b) => { const i = CORE.indexOf(a), j = CORE.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return CORE.slice(i, j); };
  const upAt = CORE.indexOf('const _UPPER_TOKENS');
  const src = [
    'var AIRPORT_DISPLAY_IATA = { YHU: "MET" };',
    CORE.slice(upAt, CORE.indexOf(']);', upAt) + 3),
    CORE.slice(CORE.indexOf('var _CITY_CODE_TAIL = '), CORE.indexOf('\n', CORE.indexOf('var _CITY_CODE_TAIL = '))),
    CORE.slice(CORE.indexOf('\nvar _CITY2IATA = null;') + 1, CORE.indexOf('\nfunction formatCityIata(') + 1),
    ...['_dispIata', '_realIata', 'tc', 'airportCityNameSafe_v21877', '_isRealApCode', '_cityWholeName', '_cityWordIsCode', 'normalizeDisplayCity',
      'formatCityIata', '_stripCityCode', '_cityHasCode', 'cityCode'].map(fn),
    'function rowCity(f, isDep, lang) {',
    between('    const loc       = isDep ? f.dest : f.origin;', '    // v23925 — the row as shown (_fidsShownRow)'),
    '  return cityDisp;',
    '}',
    // fids-earth.js cityName: the city as the row prints it, without its code
    'function floorName(code, raw, l) { var n = String(formatCityIata(raw, code, l) || ""); n = _stripCityCode(n) || n; return n.split(" · ")[0].trim(); }',
    'return { tc, formatCityIata, rowCity, floorName, airportCityNameSafe_v21877, normalizeDisplayCity, _stripCityCode };'
  ].join('\n');
  return new Function('CITY', 'CITY_FR', 'AP', 'AP_LIST', 'COORDS', 'GATE_AP', 'window', 'BoardStrings', 'getLang', src)(CITY, CITY_FR, AP, AP_LIST, COORDS, GATE_AP, { AIRPORT_COORDS }, BS, () => 'en');
}
// the board's city helpers as fids-earth.js reads them (boardFns: its
// cityNameOf, tableNameOf and namedBy take them), over these tables
function floorFns(B, CITY, CITY_FR) {
  return { formatCityIata: B.formatCityIata, stripCode: B._stripCityCode, tableCity: B.airportCityNameSafe_v21877, normalize: B.normalizeDisplayCity,
    inTables: (c) => !!(CITY[c] || CITY_FR[c]) };
}

test('a name is the place, as travellers know it: no county or region after a comma, never the word Airport, one spelling in both tables', () => {
  const placed = [...new Set(Object.keys(COORDS).concat(Object.keys(AIRPORT_COORDS), Object.keys(GATE_AP)))];
  const TAIL = /,|\b(AIRPORT|AIRFIELD|AERODROME|AIRSTRIP|HELIPORT|AIR BASE|ARMY AVIATION|AUTONOMOUS COUNTY)\b/;
  const bad = [];
  for (const c of placed) for (const [t, n] of [['CITY', CITY[c]], ['CITY_FR', CITY_FR[c]]]) if (TAIL.test(String(n))) bad.push(`${t}.${c} '${n}'`);
  assert.deepEqual(bad, [], 'names with a county, a region or the word Airport');
  // the ones on the sweep's pages, and others like them
  const want = { LSI: 'LERWICK', KOI: 'KIRKWALL', SYY: 'STORNOWAY', LDY: 'DERRY', ILY: 'ISLAY', TRE: 'TIREE', NWI: 'NORWICH', PIK: 'PRESTWICK',
    MME: 'DARLINGTON', HUY: 'GRIMSBY', SEN: 'SOUTHEND-ON-SEA', RNS: 'RENNES', TLN: 'TOULON', TUF: 'TOURS', LME: 'LE MANS', SPC: 'LA PALMA',
    BQL: 'BOULIA', KNS: 'KING ISLAND', TIU: 'TIMARU', HKK: 'HOKITIKA', JNH: 'JIAXING', CHG: 'CHAOYANG', FUG: 'FUYANG', XPL: 'TEGUCIGALPA',
    // and names that were an airport's own, or two places joined
    LEU: "LA SEU D'URGELL", YSQ: 'SONGYUAN', TRS: 'TRIESTE', MPL: 'MONTPELLIER', LDE: 'TARBES', OKY: 'OAKEY', CPC: 'SAN MARTÍN DE LOS ANDES',
    JYV: 'JYVÄSKYLÄ', GCN: 'GRAND CANYON', MYG: 'MAYAGUANA' };
  for (const [c, n] of Object.entries(want)) { assert.equal(CITY[c], n, c); assert.equal(CITY_FR[c], n, c + ' in French'); }
  for (const [c, n] of [['NCL', 'NEWCASTLE'], ['EXT', 'EXETER'], ['LBA', 'LEEDS'], ['EMA', 'EAST MIDLANDS'], ['LIH', 'LIHUE']]) assert.equal(CITY_FR[c], n, c + ' in French');
  // one spelling of Fort St John in both halves of a board (the row reads 'Fort St John | YXJ')
  assert.equal(CITY.YXJ, 'FORT ST JOHN'); assert.equal(CITY_FR.YXJ, CITY.YXJ);
  // no stray characters (Cayo Coco was 'CAY0 COCO' in French) and no airline in the city table
  for (const [t, T] of [['CITY', CITY], ['CITY_FR', CITY_FR]]) for (const [c, n] of Object.entries(T)) {
    assert.ok(/^[A-Z0-9]{3}$/.test(c), `${t} key ${c}`);
    assert.doesNotMatch(String(n), /[0-9|()]/, `${t}.${c} '${n}'`);
  }
  const SHARED = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: SHARED });
  for (const c of Object.keys(want)) assert.equal(SHARED.FIDS_SHARED_CITY[c], CITY[c], 'shared-names.js ' + c);
});

test('Dar es Salaam keeps its small word small, in English and in French, on every board', () => {
  const B = board();
  assert.equal(B.tc('DAR ES SALAAM'), 'Dar es Salaam');
  assert.equal(B.tc('DAR ES SALAM'), 'Dar es Salam');
  for (const l of ['en', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.equal(B.rowCity({ dest: 'DAR', _locIata: 'DAR' }, true, l), 'Dar es Salaam | DAR', l);
  assert.equal(B.rowCity({ dest: 'DAR', _locIata: 'DAR' }, true, 'fr'), 'Dar es Salam | DAR');
  // a first word stays a name, as before
  assert.equal(B.tc('DES MOINES'), 'Des Moines');
  assert.equal(B.tc('RIO DE JANEIRO'), 'Rio de Janeiro');
});

test('a word of a whole name is never read as an airport code: \'Le Cap\' is Cape Town, not \'Le\' at Cap-Haïtien', () => {
  const B = board();
  // the cases the checker found (this build gave CAP, MAR and others names),
  // and the older ones of the same kind (Manchester for the Isle of Man, Poza
  // Rica for La Paz, Mount Isa cut to 'Mount')
  const want = [
    ['Le Cap', '', 'Le Cap | CPT'], ['LE CAP', '', 'Le Cap | CPT'], ['Viña del Mar', '', 'Viña del Mar'], ['Del Mar', '', 'Del Mar'],
    ['Isle of Man', '', 'Isle of Man | IOM'], ['La Paz', '', 'La Paz'], ['Mount Isa', '', 'Mount Isa | ISA'], ['Mount Isa', 'ISA', 'Mount Isa | ISA'],
    ['Al Ain', '', 'Al Ain | AAN'], ['Hua Hin', '', 'Hua Hin | HHQ'], ['Nan', '', 'Nan | NNT'],
    // and a code is still read where it is one
    ['Toronto-YYZ', '', 'Toronto | YYZ'], ['TORONTO YYZ', '', 'Toronto | YYZ'], ['Atlanta (ATL) ATL', 'ATL', 'Atlanta | ATL'], ['YYZ', '', 'Toronto | YYZ'],
    ['NAN', '', 'Nadi | NAN'], ['Goose Bay', '', 'Goose Bay | YYR'], ['Montreal | MET', '', 'Montréal | MET']
  ];
  for (const [dest, code, row] of want) for (const l of ['en', 'fr']) {
    const got = B.rowCity({ dest, _locIata: code }, true, l);
    if (l === 'fr' && dest === 'Isle of Man') assert.equal(got, 'Île de Man | IOM'); else assert.equal(got, row, `${dest} (${l})`);
  }
  assert.equal(B.floorName('', 'Le Cap', 'fr'), 'Le Cap', 'the map names it as the row does');
  // every name of ours, written as a name, reads as itself and never with
  // another airport's code (in capitals too, but for a word of three letters:
  // in capitals that is a code, as it always was)
  const key = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const codes = new Map();
  for (const T of [CITY, CITY_FR]) for (const [c, n] of Object.entries(T)) { const k = key(n); if (k.length < 3) continue; if (!codes.has(k)) codes.set(k, new Set()); codes.get(k).add(c); }
  const bad = [];
  let n = 0;
  for (const T of [CITY, CITY_FR]) for (const nm of Object.values(T)) for (const form of [B.tc(nm), nm]) {
    if (form === nm && /^[A-Z]{3}$/.test(nm)) continue;
    for (const l of ['en', 'fr']) {
      n++;
      const out = B.formatCityIata(form, '', l), m = /^(.*?) \| ([A-Z0-9]{3})$/.exec(out), city = m ? m[1] : out, code = m ? m[2] : '';
      const own = codes.get(key(nm)) || new Set();
      if (code && !own.has(code) && !(code === 'MET' && own.has('YHU'))) bad.push(`${l} '${form}' -> '${out}'`);
      else if (key(city.split(' · ')[0]) !== key(nm) && !(code && key(B.airportCityNameSafe_v21877(code, l)) === key(city.split(' · ')[0]))) bad.push(`${l} '${form}' -> '${out}' (cut)`);
    }
  }
  assert.ok(n > 19000, n + ' names read');
  assert.deepEqual(bad, []);
});

test('Musselwhite\'s code, KM8, has a digit in it and stays whole: the row and the map read Musselwhite', () => {
  const B = board();
  assert.equal(CITY.KM8, 'MUSSELWHITE');
  for (const l of ['en', 'fr']) {
    assert.equal(B.rowCity({ dest: 'KM8', _locIata: 'KM8' }, true, l), 'Musselwhite | KM8', 'was \'KM\'');
    assert.equal(B.rowCity({ dest: 'Musselwhite | KM8', _locIata: 'KM8' }, true, l), 'Musselwhite | KM8', 'was \'Musselwhite | Km8 | KM\'');
    assert.equal(B.rowCity({ dest: 'KM8', _locIata: '' }, true, l), 'Musselwhite | KM8');
    assert.equal(B.floorName('KM8', 'Musselwhite | KM8', l), 'Musselwhite', 'was \'Musselwhite | Km8\'');
  }
  assert.equal(B.tc('MUSSELWHITE | KM8'), 'Musselwhite | KM8');
  // a code of three letters is as it was
  assert.equal(B.rowCity({ dest: 'YQT', _locIata: 'YQT' }, true, 'en'), 'Thunder Bay | YQT');
});

test('a place the board can name only by its code is not on the map (its position from the gate table or the airport cache, and no name)', () => {
  const rows = [{ dest: 'EBM', _locIata: 'EBM', status: 'scheduled', _revTs: 2e12 }, { dest: 'Pamplona', _locIata: 'PNA', status: 'scheduled', _revTs: 2e12 + 6e4 }];
  const opts = { dir: 'dep', ap0: 'MAD', now: 1e12, coords: () => [42.8, -1.65] };
  assert.deepEqual(E.placesFrom(rows, opts).list.map((p) => p.code), ['EBM', 'PNA'], 'without the check, both');
  const BF = floorFns(board(), CITY, CITY_FR), named = (c, t) => E.namedBy(BF, c, t);
  const P = E.placesFrom(rows, Object.assign({ named }, opts));
  assert.deepEqual(P.list.map((p) => p.code), ['PNA'], '\'Ebm\' is not drawn');
  assert.equal(P.next.code, 'PNA', 'and the next flight is the next one it can name');
  const MOD = fs.readFileSync(path.join(JS, 'fids-earth.js'), 'utf8');
  assert.match(MOD, /function hasName\(code, text\) \{[\s\S]{0,300}return \(nameSeen\[k\] = namedBy\(boardFns\(\), code, text\)\);/);
  assert.match(MOD, /if \(o\.named && !o\.named\(c, text\)\) return;/);
  // and its positions are the board's own tables as the page loaded them,
  // never the airport cache the gate map fills at run time (from the
  // AeroDataBox passthrough the boards no longer use)
  assert.doesNotMatch(MOD, /_lookupAirport\(/, 'the map never reads the board\'s airport cache');
  assert.match(MOD, /var GATE0 = \{\};\s*try \{[^\n]*Object\.keys\(GATE_AP\)\.forEach\(function \(k\) \{ GATE0\[k\] = GATE_AP\[k\]; \}\)/);
  assert.match(MOD, /function coordsOf\(c\) \{[\s\S]{0,400}GATE0\[c\][\s\S]{0,40}return v;/);
});

test('every Québec airport on the French-first list that has a position has a zone and a name', () => {
  const bad = [];
  for (const c of BS.FR_FIRST) {
    if (!coordsOf(c)) continue;
    const zone = (AP[c] && AP[c].tz) || E.ZONES[c];
    if (!zone) bad.push(c + ' has no zone');
    if (!CITY[c] || !CITY_FR[c]) bad.push(c + ' has no name');
  }
  assert.deepEqual(bad, []);
  for (const c of ['YKU', 'YRI', 'YMT', 'YNA']) assert.equal(E.ZONES[c], 'America/Toronto', c);
  for (const [c, n] of [['YTF', 'ALMA'], ['AKV', 'AKULIVIK'], ['YIK', 'IVUJIVIK'], ['YKG', 'KANGIRSUK']]) assert.equal(CITY[c], n);
});

test('DJT is West Palm Beach wherever PBI is: a US airport, its runways, Florida', () => {
  const pick = (name) => { const a = CORE.indexOf(name); assert.ok(a >= 0, name); return a; };
  const start = pick('const _IATA_CC_GROUPS = {'), end = CORE.indexOf('\nfunction flightRegionKey(', start);
  const tail = CORE.indexOf('\n}\n', end) + 3;
  const box = new Function('COORDS', CORE.slice(start, tail) + '\nreturn { airportCountry: airportCountry, flightRegionKey: flightRegionKey };')(COORDS);
  assert.equal(box.airportCountry('PBI'), 'US');
  assert.equal(box.airportCountry('DJT'), 'US', 'DJT is in the US group, beside PBI');
  // a West Palm Beach row at a US airport is domestic, not international
  assert.equal(box.flightRegionKey({ _locIata: 'DJT' }, 'LGA'), 'dom');
  assert.equal(box.flightRegionKey({ _locIata: 'DJT' }, 'YYZ'), 'trans');
  const RW = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'airport-runways.js'), 'utf8').replace('var AIRPORT_RUNWAYS', 'this.AIRPORT_RUNWAYS'), RW);
  assert.deepEqual(RW.AIRPORT_RUNWAYS.DJT, RW.AIRPORT_RUNWAYS.PBI, 'the gate map\'s runways');
  assert.equal(names().row('West Palm Beach, FL'), 'PBI', 'Florida has West Palm Beach (as PBI, the name\'s code)');
  assert.equal(E.ZONES.DJT, E.ZONES.PBI);
});

test('\'City, ST\' never reads the wrong one of a city\'s airports: the feeds\' own samples', () => {
  // Kennedy's feed (originName + its code) and Raleigh-Durham's (FlightView:
  // the city cell + the flight's own two codes), as recorded in the repo
  const seen = new Map();
  const add = (n, c) => { if (!/, [A-Z]{2}$/.test(n)) return; if (!seen.has(n)) seen.set(n, new Set()); seen.get(n).add(c); };
  for (const f of ['jfk-arr-sample.json', 'jfk-dep-sample.json']) {
    const d = require('./fixtures/' + f).data;
    for (const k of Object.keys(d)) for (const r of d[k].data) add(r.originName || r.destinationName || '', r.originAirportCode || r.destinationAirportCode || '');
  }
  for (const f of ['rdu-arr-sample.html', 'rdu-dep-sample.html']) {
    const s = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
    for (const m of s.matchAll(/<td class="c3">([^<]+)<\/td>\s*<td class="c4[^"]*"><a [^>]*ffDtNm\('[^']*','[^']*','[^']*','([A-Z]{3})','([A-Z]{3})'/g)) add(m[1], m[2] === 'RDU' ? m[3] : m[2]);
  }
  assert.ok(seen.size > 60, seen.size + ' names');
  const NAMES = names(), bad = [];
  let read = 0;
  // (DJT is PBI's new code: one airport; the name reads PBI, as the rows do)
  for (const [n, set] of seen) {
    const codes = new Set([...set].map((c) => NAMES.renamed[c] || c)), got = NAMES.row(n);
    if (codes.size > 1 && got) bad.push(`${n} means ${[...codes].join(' or ')} in these feeds, and reads ${got}`);
    if (codes.size === 1 && got && !codes.has(got)) bad.push(`${n} is ${[...codes][0]} in these feeds, and reads ${got}`);
    if (got) read++;
  }
  assert.deepEqual(bad, []);
  assert.ok(read > 40, read + ' read');
  assert.deepEqual(seen.get('Dallas, TX'), new Set(['DAL', 'DFW']), 'Love Field at Raleigh-Durham, Dallas/Fort Worth at Kennedy');
  assert.equal(NAMES.row('Dallas, TX'), '');
  assert.equal(NAMES.row('Dallas-Fort Worth, TX'), 'DFW');
});

// ── v24067, fifth review ──────────────────────────────────────────────────

const LANGS9 = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];

test('a place is named when the board\'s tables name its code, or its row gives more than its code: Umeå, Höfn, Van, Iki and Eek are drawn', () => {
  // the floor took every letter outside A to Z out of the name before it
  // compared it with the code, so 'Umeå' read 'UME' and 'Van' 'VAN': real
  // places, with their names in the tables, never drawn (main draws them)
  const rows = [['Umeå | UME', 'UME'], ['Göteborg | GOT', 'GOT'], ['Höfn | HFN', 'HFN'], ['Van | VAN', 'VAN'], ['Iki | IKI', 'IKI'], ['Eek | EEK', 'EEK'], ['Luleå | LLA', 'LLA']];
  for (const [, c] of rows) assert.ok(CITY[c], c + ' has its name in the table');
  // and a code no table names: the tables as they were before Tegucigalpa
  const C2 = Object.assign({}, CITY), F2 = Object.assign({}, CITY_FR);
  delete C2.XPL; delete F2.XPL;
  const BF = floorFns(board(), CITY, CITY_FR), BF2 = floorFns(makeBoard(C2, F2), C2, F2);
  const list = rows.concat([['Xpl | XPL', 'XPL']]).map(([dest, c], i) => ({ dest, _locIata: c, status: 'scheduled', _revTs: 2e12 + i * 6e4 }));
  const P = E.placesFrom(list, { dir: 'dep', ap0: 'YQM', now: 1e12, coords: () => [50, 10], named: (c, t) => E.namedBy(BF2, c, t) });
  assert.deepEqual(P.list.map((p) => p.code).sort(), ['EEK', 'GOT', 'HFN', 'IKI', 'LLA', 'UME', 'VAN'], 'every named place, and not \'Xpl\'');
  for (const [dest, c] of rows) assert.equal(E.namedBy(BF, c, dest), true, dest);
  assert.equal(E.namedBy(BF2, 'XPL', 'Xpl | XPL'), false, 'a code with no name, written as a word, is still the code');
  assert.equal(E.namedBy(BF2, 'XPL', 'XPL'), false);
  assert.equal(E.namedBy(BF2, 'XPL', 'Palmerola | XPL'), true, 'the row\'s own words, where they are more than the code');
  assert.equal(E.namedBy(BF, 'XPL', 'Xpl | XPL'), true, 'and its table name, now that it has one');
  // the row's words are compared without case and with every letter kept
  const noTables = Object.assign({}, BF2, { inTables: () => false });
  assert.equal(E.namedBy(noTables, 'UME', 'Umeå | UME'), true, '\'Umeå\' is not \'UME\'');
  assert.equal(E.namedBy(noTables, 'HFN', 'Höfn | HFN'), true);
  assert.equal(E.namedBy(noTables, 'VAN', 'Van | VAN'), false, 'with no table name, a name that is its code is the code');
  assert.equal(E.namedBy(BF, 'KM8', 'Musselwhite | KM8'), true, 'KM8, as before');
  // the browser's hasName is this rule, over the board's own tables
  const MOD = fs.readFileSync(path.join(JS, 'fids-earth.js'), 'utf8');
  assert.match(MOD, /function hasName\(code, text\) \{[\s\S]{0,300}return \(nameSeen\[k\] = namedBy\(boardFns\(\), code, text\)\);/);
  assert.match(MOD, /inTables: function \(c\) \{ try \{ return !!\(\(typeof CITY !== 'undefined' && CITY\[c\]\) \|\| \(typeof CITY_FR !== 'undefined' && CITY_FR\[c\]\)\); \}/);
  assert.doesNotMatch(MOD, /replace\(\/\[\^A-Za-z0-9\]\/g, ''\)/, 'no letter is taken out of a name');
});

// every name this review changed, in English (CITY and the companion app's
// copy) and in French (CITY_FR): two places joined, a suburb or a village
// where the airport is named for a city, an island's town for the island
const RENAMED_BOTH = {
  ABX: 'ALBURY', AKJ: 'ASAHIKAWA', AVV: 'GEELONG', BEB: 'BENBECULA', BEM: 'BENI MELLAL', BKW: 'BECKLEY',
  BRR: 'BARRA', CHQ: 'CHANIA', CHT: 'CHATHAM ISLANDS', CMI: 'CHAMPAIGN', CYB: 'CAYMAN BRAC', EAS: 'SAN SEBASTIÁN',
  ETZ: 'METZ', FCN: 'CUXHAVEN', FKB: 'KARLSRUHE', FMO: 'MÜNSTER', FNI: 'NÎMES', FSZ: 'SHIZUOKA',
  FUE: 'FUERTEVENTURA', GAJ: 'YAMAGATA', GET: 'GERALDTON', GGT: 'EXUMA', GRY: 'GRÍMSEY', GRZ: 'GRAZ',
  HDF: 'HERINGSDORF', IEG: 'ZIELONA GÓRA', IMT: 'IRON MOUNTAIN', JSH: 'SITIA', KAT: 'KAITAIA', KEM: 'KEMI',
  KGI: 'KALGOORLIE', KJB: 'KURNOOL', KOK: 'KOKKOLA', KRF: 'KRAMFORS', KSF: 'KASSEL', KUO: 'KUOPIO', KUU: 'KULLU',
  LCG: 'A CORUÑA', LEJ: 'LEIPZIG', LEN: 'LEÓN', LGG: 'LIÈGE', LIG: 'LIMOGES', LIL: 'LILLE', LRT: 'LORIENT',
  LSC: 'LA SERENA', LUG: 'LUGANO', MQT: 'MARQUETTE', MTT: 'MINATITLÁN', NOC: 'KNOCK', OKE: 'OKINOERABU',
  OSR: 'OSTRAVA', OUD: 'OUJDA', OUL: 'OULU', OVD: 'OVIEDO', PAD: 'PADERBORN', PGF: 'PERPIGNAN', PIB: 'HATTIESBURG',
  PIS: 'POITIERS', PSO: 'PASTO', RDZ: 'RODEZ', RJA: 'RAJAHMUNDRY', SAG: 'SHIRDI', SDJ: 'SENDAI', SDL: 'SUNDSVALL',
  SDW: 'SINDHUDURG', SKN: 'STOKMARKNES', SNR: 'SAINT-NAZAIRE', SRP: 'STORD', SSJ: 'SANDNESSJØEN', SZY: 'OLSZTYN',
  TDX: 'TRAT', TKN: 'TOKUNOSHIMA', TMP: 'TAMPERE', TRN: 'TURIN', TTN: 'TRENTON', VDM: 'VIEDMA',
  VIT: 'VITORIA-GASTEIZ', VST: 'VÄSTERÅS', WGA: 'WAGGA WAGGA', WOL: 'SHELLHARBOUR', WUZ: 'WUZHOU', YIW: 'YIWU',
  YNY: 'YANGYANG'
};
// where the French is the place's own French name (Wikidata's French label)
const RENAMED_FR_OWN = { BEM: 'BÉNI MELLAL', CHQ: 'LA CANÉE', EAS: 'SAINT-SÉBASTIEN', JSH: 'SITÍA', KSF: 'CASSEL', LCG: 'LA COROGNE' };
// French only, where the English already named the city
const RENAMED_FR = {
  ABE: 'ALLENTOWN', ACE: 'LANZAROTE', ADB: 'IZMIR', BGY: 'BERGAME', CIU: 'SAULT STE. MARIE MI', EGE: 'EAGLE VAIL',
  ISP: 'LONG ISLAND', JAC: 'JACKSON HOLE', KIR: 'KERRY', KOA: 'KONA', KRK: 'CRACOVIE', MBS: 'SAGINAW',
  PIE: 'ST PETE', PVD: 'PROVIDENCE', RMU: 'MURCIE', SRQ: 'SARASOTA', SUN: 'SUN VALLEY', TYS: 'KNOXVILLE',
  VPS: 'DESTIN', VRN: 'VÉRONE', XCR: 'CHÂLONS-EN-CHAMPAGNE'
};

test('two places joined, or a suburb, give way to the city the airport is named for: Allentown, not \'Allentown / Bethlehem\'; Bergame, not Orio al Serio', () => {
  const SHARED = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: SHARED });
  const S = SHARED.FIDS_SHARED_CITY;
  for (const [c, n] of Object.entries(RENAMED_BOTH)) {
    assert.equal(CITY[c], n, c);
    assert.equal(CITY_FR[c], RENAMED_FR_OWN[c] || n, c + ' in French');
    assert.equal(S[c], n, c + ' in the companion app\'s copy');
  }
  for (const [c, n] of Object.entries(RENAMED_FR)) assert.equal(CITY_FR[c], n, c + ' in French');
  assert.equal(Object.keys(RENAMED_BOTH).length + Object.keys(RENAMED_FR).length, 104);
  // the ones the checker found
  assert.deepEqual([CITY_FR.ABE, CITY_FR.PVD, CITY_FR.SRQ, CITY_FR.TYS, CITY_FR.BGY], ['ALLENTOWN', 'PROVIDENCE', 'SARASOTA', 'KNOXVILLE', 'BERGAME']);
  assert.equal(CITY.BGY, 'Bergamo', 'Bergamo in English');
  // and Pointe-à-Pitre keeps its accent in English too
  assert.equal(CITY.PTP, 'POINTE-À-PITRE'); assert.equal(S.PTP, 'POINTE-À-PITRE');
  // no name joins two places with a slash, but Dallas/Fort Worth, the airport's own
  for (const [t, T] of [['CITY', CITY], ['CITY_FR', CITY_FR], ['shared-names.js', S]]) for (const [c, n] of Object.entries(T)) if (c !== 'DFW') assert.doesNotMatch(String(n), /\//, `${t}.${c} '${n}'`);
  // and none of these names is another airport's name: no name with two codes
  const key = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const codesOf = new Map();
  const own = (c, n) => { const k = key(n); if (k.length < 3 || c === 'DJT') return; if (!codesOf.has(k)) codesOf.set(k, new Set()); codesOf.get(k).add(c); };
  AP_LIST.forEach((a) => own(a.c, a.n)); Object.entries(CITY).forEach(([c, n]) => own(c, n)); Object.entries(CITY_FR).forEach(([c, n]) => own(c, n));
  const twice = [];
  for (const c of Object.keys(RENAMED_BOTH).concat(Object.keys(RENAMED_FR))) for (const n of new Set([CITY[c], CITY_FR[c]])) {
    const o = [...codesOf.get(key(n))].filter((x) => x !== c);
    if (o.length && !(c === 'VPS' && o.join() === 'DSI')) twice.push(`${c} '${n}' is also ${o.join(', ')}'s`);   // (Destin is DSI's too, in English as before)
  }
  assert.deepEqual(twice, []);
  // the rows print them so in every language
  const B = board();
  assert.equal(B.rowCity({ dest: 'TRN', _locIata: 'TRN' }, true, 'en'), 'Turin | TRN');
  assert.equal(B.rowCity({ dest: 'ABE', _locIata: 'ABE' }, true, 'fr'), 'Allentown | ABE');
  assert.equal(B.rowCity({ dest: 'BGY', _locIata: 'BGY' }, true, 'fr'), 'Bergame | BGY');
  assert.equal(B.rowCity({ dest: 'KOK', _locIata: 'KOK' }, true, 'de'), 'Kokkola | KOK');
  assert.equal(B.rowCity({ dest: 'LCG', _locIata: 'LCG' }, true, 'fr'), 'La Corogne | LCG');
});

test('small words inside a name stay small, as the place writes them; a first word, or a whole name, never shrinks', () => {
  const B = board();
  const small = {
    "LA SEU D'URGELL": "La Seu d'Urgell", 'SOUTHEND-ON-SEA': 'Southend-on-Sea', 'SAN MARTÍN DE LOS ANDES': 'San Martín de los Andes',
    'FRANKFURT AM MAIN': 'Frankfurt am Main', 'KLAGENFURT AM WÖRTHERSEE': 'Klagenfurt am Wörthersee', 'CHÂLONS-EN-CHAMPAGNE': 'Châlons-en-Champagne',
    'MO I RANA': 'Mo i Rana', 'POINTE-À-PITRE': 'Pointe-à-Pitre', 'STRATFORD-UPON-AVON': 'Stratford-upon-Avon', 'NEWCASTLE UPON TYNE': 'Newcastle upon Tyne',
    'SANTA CRUZ DE LA SIERRA': 'Santa Cruz de la Sierra', 'RIO DE JANEIRO': 'Rio de Janeiro', "VAL-D'OR": "Val-d'Or", 'ÎLES-DE-LA-MADELEINE': 'Îles-de-la-Madeleine'
  };
  const keep = {
    'LOS ANGELES': 'Los Angeles', 'LAS VEGAS': 'Las Vegas', 'LE HAVRE': 'Le Havre', 'LA PAZ': 'La Paz', 'EL PASO': 'El Paso', 'DEN HAAG': 'Den Haag',
    'AL AIN': 'Al Ain', 'ON': 'On', 'AM': 'Am', 'EN': 'En', 'I': 'I', 'DES MOINES': 'Des Moines', 'LAS PALMAS': 'Las Palmas', 'LOS MOCHIS': 'Los Mochis',
    "D'ARCY": "D'Arcy", "L'ANSE-AU-LOUP": "L'Anse-au-Loup", "O'HARE": "O'Hare",
    // Arabic 'Al' and 'El' as the places write them, and a Spanish 'Sur' that is a word of the name
    'RAS AL KHAIMAH': 'Ras Al Khaimah', 'WADI AL DAWASIR': 'Wadi Al Dawasir', 'SHARM EL SHEIKH': 'Sharm El Sheikh', 'CAYO LARGO DEL SUR': 'Cayo Largo del Sur'
  };
  for (const [s, w] of Object.entries(Object.assign({}, small, keep))) assert.equal(B.tc(s), w, s);
  // every table name, as the rows print it in each of the nine languages: a
  // word written small is one of these, inside the name, never its first
  const SMALL = new Set(['de', 'da', 'do', 'dos', 'das', 'del', 'di', 'du', 'des', 'la', 'le', 'les', 'of', 'and', 'upon', 'et', 'es', 'am', 'en', 'i',
    'los', 'las', 'on', 'sur', 'au', 'aux', 'sous', 'à', 'a', "d'"]);
  const bad = [], inside = new Set();
  let n = 0;
  for (const c of new Set(Object.keys(CITY).concat(Object.keys(CITY_FR)))) for (const l of LANGS9) {
    const city = B.rowCity({ dest: c, _locIata: c }, true, l).replace(/ \| [A-Z0-9]{3}$/, ''), words = city.split(/[\s-]+/);
    n++;
    words.forEach((w, i) => {
      if (!/^[a-zà-ÿ]/.test(w)) return;
      if (!i || !SMALL.has(w.replace(/^d'.*$/, "d'"))) bad.push(`${l} ${c}: '${city}'`); else inside.add(city);
    });
  }
  assert.ok(n > 2400 * 9, n + ' readings');
  assert.deepEqual(bad, []);
  // and each name with a small word inside is written so by the place itself
  // (OurAirports' and Wikidata's spellings): the whole list
  assert.deepEqual([...inside].sort((a, b) => a.localeCompare(b)), [
    'Baie de Cambridge', 'Campos dos Goytacazes', 'Castellón de la Plana', 'Caxias do Sul', 'Cayo Largo del Sur', 'Châlons-en-Champagne', 'Ciudad del Carmen',
    'Cruzeiro do Sul', 'Dar es Salaam', 'Dar es Salam', 'Feira de Santana', 'Fernando de Noronha', 'Fond-du-Lac', 'Fort de France', 'Fort-de-France',
    'Foz do Iguaçu', 'Frankfurt am Main', 'Île de Man', 'Îles-de-la-Madeleine', 'Isla de Pascua', 'Isle of Man', 'Isola di Capo Rizzuto',
    'Jerez de la Frontera', 'Juiz de Fora', 'Klagenfurt am Wörthersee', "La Seu d'Urgell", 'Mar del Plata', 'Mo i Rana', 'Pointe-à-Pitre',
    'Port of Spain', 'Praia da Vitória', 'Rio de Janeiro', 'Rivière-du-Loup', 'San Carlos de Bariloche', 'San José del Guaviare',
    'San Martín de los Andes', 'San Miguel de Tucumán', 'San Salvador de Jujuy', 'San Vicente del Caguán', 'Santa Cruz da Graciosa',
    'Santa Cruz das Flores', 'Santa Cruz de la Sierra', 'Santiago de Compostela', 'Santiago de Cuba', 'Santiago del Estero', 'São Gabriel da Cachoeira',
    'São José do Rio Preto', 'São José dos Campos', 'Southend-on-Sea', 'Termas de Río Hondo', "Val-d'Or", 'Vasco da Gama', 'Vila do Porto',
    'Vitória da Conquista'].sort((a, b) => a.localeCompare(b)));
  // the map names them as the rows do
  assert.equal(B.floorName('LEU', 'LEU', 'en'), "La Seu d'Urgell");
  assert.equal(B.floorName('HHN', 'HHN', 'fr'), 'Frankfurt am Main');
});

test('Fort Worth is Dallas/Fort Worth\'s second name, and never Meacham (FTW, no airline service), on the rows or the map', () => {
  const NAMES = names();
  for (const s of ['Fort Worth, TX', 'Ft Worth, TX', 'Ft. Worth, TX', 'Fort Worth', 'Ft Worth', 'Ft. Worth', 'FORT WORTH', 'Fort Worth, Texas']) {
    assert.ok(['', 'DFW'].includes(NAMES.row(s)), `the map reads '${s}' as ${NAMES.row(s)}`);
    assert.ok(['', 'DFW'].includes(NAMES.look(s)), `the rows read '${s}' as ${NAMES.look(s)}`);
  }
  assert.equal(CITY.FTW, 'FORT WORTH', 'Meacham keeps its own name');
  for (const s of ['Dallas/Fort Worth', 'Dallas-Fort Worth, TX', 'DALLAS-FT. WORTH', 'Dallas Fort Worth']) assert.equal(NAMES.row(s), 'DFW', s);
  assert.equal(NAMES.look('Dallas/Fort Worth'), 'DFW');
  assert.equal(NAMES.index().fortworth, '!', 'a name with two airports');
  // the same for every joined name of ours: its later parts, alone, St/Ft
  // spelt, and with the state or province of the airport, never read
  // another airport (Dallas/Fort Worth's is the only joined name the tables
  // hold; the region table's airports of one city, read by state, are no
  // one of them: 'Dallas, TX', 'Houston, TX' above)
  const regionOf = {};
  Object.entries(NAMES.region).forEach(([r, l]) => l.split(' ').forEach((c) => { if (c) regionOf[c] = r; }));
  BS.FR_FIRST.forEach((c) => { if (!regionOf[c]) regionOf[c] = 'QC'; });
  const joined = AP_LIST.map((a) => [a.c, a.n]).concat(Object.entries(CITY), Object.entries(CITY_FR)).filter(([, nm]) => /\//.test(String(nm)));
  assert.deepEqual([...new Set(joined.map(([c]) => c))], ['DFW']);
  const bad = [];
  let k = 0;
  for (const [c, nm] of joined) for (const part of String(nm).split(/\s*\/\s*/).slice(1)) {
    const st = regionOf[c], spelt = part.replace(/\bFort\b/i, 'Ft').replace(/\bSaint\b/i, 'St').replace(/\bMount\b/i, 'Mt');
    for (const f of [part, spelt, part + ', ' + st, spelt + ', ' + st, part.toUpperCase()]) {
      k++;
      const got = NAMES.row(f) || NAMES.look(f);
      if (got && got !== c) bad.push(`'${f}' (${c} '${nm}') reads ${got}`);
    }
  }
  assert.ok(k >= 10, k + ' readings');
  assert.deepEqual(bad, []);
});

test('a coded row whose words list its stops is named on the map by its code: Orlando\'s \'Chicago, Wichita, Las Vegas, Burbank\' is Burbank', () => {
  const B = board(), BF = floorFns(B, CITY, CITY_FR);
  const want = [['Chicago, Wichita, Las Vegas, Burbank', 'BUR', 'Burbank'], ['Newark, San Francisco, Portland', 'PDX', 'Portland'],
    ['Newark, Chicago, Cedar Rapids', 'CID', 'Cedar Rapids'], ['Denver, Lihue', 'LIH', 'Lihue'], ['Washington, DC', 'DCA', 'Washington'],
    ['Dallas-Fort Worth, TX', 'DFW', 'Dallas/Fort Worth'], ['Portland, ME', 'PWM', 'Portland']];
  for (const [raw, c, en] of want) {
    for (const l of LANGS9) {
      const got = E.cityNameOf(BF, c, raw, l);
      assert.equal(got, E.tableNameOf(BF, c, l), `${raw} (${c}, ${l})`);
      assert.doesNotMatch(got, /,/, `${raw} (${l}): one place`);
    }
    assert.equal(E.cityNameOf(BF, c, raw, 'en'), en, raw);
    // the row keeps its own words
    assert.equal(B.rowCity({ dest: raw, _locIata: c }, true, 'en'), raw + ' | ' + c, 'the row of ' + raw);
  }
  // a row's words with no comma are named as the row prints them, as before
  assert.equal(E.cityNameOf(BF, 'ORD', "Chicago · O'Hare | ORD", 'en'), 'Chicago');
  assert.equal(E.cityNameOf(BF, 'KM8', 'Musselwhite | KM8', 'en'), 'Musselwhite');
  assert.equal(E.cityNameOf(BF, 'YUL', 'Montreal | YUL', 'fr'), 'Montréal');
  assert.equal(E.cityNameOf(BF, 'TRS', '', 'en'), 'Trieste', 'and a row with no words by its table name');
  // the browser's cityName is this one, and it names every place the floor draws
  const MOD = fs.readFileSync(path.join(JS, 'fids-earth.js'), 'utf8');
  assert.match(MOD, /function cityName\(code, raw, l\) \{ return cityNameOf\(boardFns\(\), code, raw, l\); \}/);
  assert.match(MOD, /var names = langs\.map\(function \(l\) \{ return cityName\(p\.code, raw, l\); \}\);/);
  // no name the sweep's floors draw is a list
  const FX = require('./fixtures/earth-sweep-2026-10-19.json');
  for (const fl of FX.floors) for (const p of fl.places) for (const nm of [p[4]].concat(p[5])) assert.doesNotMatch(nm, /,/, fl.id + ' ' + p[0]);
});
