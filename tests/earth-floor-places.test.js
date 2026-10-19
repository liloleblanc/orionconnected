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
    'London, ON': 'YXU', 'Hamilton, ON': 'YHM', 'Victoria, BC': 'YYJ', 'Saint Louis': 'STL', 'Ft Lauderdale': 'FLL', 'Norman Wells': 'YVQ'
  };
  for (const [name, code] of Object.entries(want)) {
    assert.equal(NAMES.row(name), code, 'the map reads ' + name);
    assert.equal(NAMES.look(name), '', 'the row of ' + name + ' keeps no code (as on main)');
  }
});

test('and never a wrong airport: a name with two of ours, a place in another state, or a list of stops stays code-less', () => {
  const NAMES = names();
  for (const name of ['Montreal', 'Toronto', 'Houston', 'Chicago, IL', 'New York, NY', 'Houston, TX', 'Columbus, OH',
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

test('the rows\' own lookup is main\'s, and the map reads every whole name as the rows do', () => {
  const NAMES = names(), ALL = allNames();
  for (const [k, v] of ALL) {
    const exact = MAIN_ALIAS[k] || (v.codes.size === 1 ? [...v.codes][0] : '');
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
