'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — EVERY PLACE THE BOARDS LIST CAN BE PLACED, AND NAMED
//
// The overnight sweep of every airport's live board (2026-10-19) found:
//   · Roberval (YRJ), in the airport picker, opened with no position for
//     itself: the old dotted globe under its notice, and English first on a
//     Québec board;
//   · 41 places the boards listed with no position in any table, so no route
//     (West Palm Beach now arrives as DJT, its new code since August 2026);
//   · rows with no code at all because the feed wrote the name in a way no
//     whole name in our tables matches: 'Harrisburg, PA', 'St Hubert',
//     'Toronto Centre-Ville', 'Ft McMurray', 'Whitehorse, Calgary',
//     'Montreal-Trdeau'.
// The positions are OurAirports' (ourairports.com/data, public domain); the
// lists below are taken from the same data.
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

test('French leads at every Québec airport the board can open, and the list holds Québec only', () => {
  const qc = new Set(QUEBEC);
  for (const c of OPENABLE) if (qc.has(c)) assert.ok(BS.FR_FIRST.includes(c), c + ' is in Québec and must lead in French');
  for (const c of BS.FR_FIRST) if (c !== 'YMY') assert.ok(qc.has(c), c + ' is not a Québec airport');   // YMY: Montréal's central station
  assert.ok(!BS.FR_FIRST.includes('YHA'), 'YHA is Port Hope Simpson, Labrador');
  assert.deepEqual(BS.resolveLangs({ iata: 'YRJ' }).langs, ['fr', 'en'], 'Roberval reads French first');
  assert.equal(BS.boardClock24(['fr', 'en']), true, 'and so its clock is 24-hour');
});

// the board's name lookup and its rules, out of fids-core.js, with its tables
let NAMES_ = null;
const names = () => NAMES_ || (NAMES_ = (() => {
  const block = CORE.slice(CORE.indexOf('\nvar _CITY2IATA = null;') + 1, CORE.indexOf('\nfunction formatCityIata(') + 1);
  return new Function('CITY', 'CITY_FR', 'AP', 'AP_LIST', 'COORDS', 'GATE_AP', 'window',
    block + '\nreturn { look: _iataFromCityName, key: _normCityKey, box: _REGION_BOX, notAStop: _NOT_A_STOP, alias: _CITY2IATA_ALIAS, index: function () { _cityIndex(); return _CITY2IATA; } };')(
    CITY, CITY_FR, AP, AP_LIST, COORDS, GATE_AP, { AIRPORT_COORDS });
})());
// every name of ours, with every code it is ours for
function allNames() {
  const ALL = new Map(), key = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const addName = (c, n) => { if (!n) return; const k = key(n); if (k.length < 3) return; if (!ALL.has(k)) ALL.set(k, { name: n, codes: new Set() }); ALL.get(k).codes.add(String(c).toUpperCase()); };
  AP_LIST.forEach((a) => addName(a.c, a.n)); Object.keys(CITY).forEach((c) => addName(c, CITY[c])); Object.keys(CITY_FR).forEach((c) => addName(c, CITY_FR[c]));
  return ALL;
}

test('the rows the sweep found with no code now read their airport', () => {
  const NAMES = names();
  const want = {
    'Harrisburg, PA': 'MDT', 'Richmond, VA': 'RIC', 'Charlotte, NC': 'CLT', 'Burlington, VT': 'BTV', 'Pensacola, FL': 'PNS',
    'Birmingham, AL': 'BHM', 'Cincinnati, OH': 'CVG', 'St Hubert': 'YHU', 'Saint-Hubert': 'YHU', 'Toronto Centre-Ville': 'YTZ',
    'Ft Mackay/Firebag': 'YFI', 'Ft McMurray': 'YMM', 'Whitehorse, Calgary': 'YXY', 'Inuvik, Yellowknife, Norman Wells': 'YEV',
    'Montreal-Trdeau': 'YUL', 'Portland, ME': 'PWM', 'Portland, OR': 'PDX', 'London, ON': 'YXU', 'Hamilton, ON': 'YHM', 'Victoria, BC': 'YYJ',
    'Saint Louis': 'STL', 'Ft Lauderdale': 'FLL'
  };
  for (const [name, code] of Object.entries(want)) assert.equal(NAMES.look(name), code, name);
});

test('and never a wrong airport: a name with two of ours, or a place we do not hold, stays code-less', () => {
  const NAMES = names();
  for (const name of ['Montreal', 'Toronto', 'Houston', 'Chicago, IL', 'New York, NY', 'Houston, TX', 'Columbus, OH',
    'Washington, DC',            // Reagan or Dulles
    'Jacksonville, NC',          // not Jacksonville, Florida
    'Paris, TX', 'Rome, GA',     // not Paris or Rome
    'Hamilton, Bermuda',         // Bermuda is where Hamilton is, not a second stop
    'Ottawa, Ontario', 'Victoria, Seychelles', 'Kingston, Jamaica', 'Punta Cana, Rd', 'Montreal-Trudeaux International']) {
    assert.equal(NAMES.look(name), '', name);
  }
});

test('the new spellings change no whole name\'s answer, and each rule holds over the whole index', () => {
  const NAMES = names(), ALL = allNames();
  // 1 · a whole name answers as it did: its one code, or nothing for two
  for (const [k, v] of ALL) {
    const exact = NAMES.alias[k] || (v.codes.size === 1 ? [...v.codes][0] : '');
    assert.equal(NAMES.look(v.name), exact, v.name);
  }
  // 2 · St/Ste/Ft/Mt and Saint/Sainte/Fort/Mount never turn one place's name into another's
  const swaps = [[/ st /gi, ' saint '], [/ ste /gi, ' sainte '], [/ ft /gi, ' fort '], [/ mt /gi, ' mount '], [/ saint /gi, ' st '], [/ sainte /gi, ' ste '], [/ fort /gi, ' ft '], [/ mount /gi, ' mt ']];
  for (const [, v] of ALL) {
    const t = ' ' + v.name.replace(/[.\-‐-―]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    for (const [re, to] of swaps) {
      const s = t.replace(re, to).trim(); if (s === t.trim()) continue;
      const got = NAMES.look(s), other = ALL.get(NAMES.key(s));
      if (got && !other) assert.ok(v.codes.has(got), `${v.name} spelt "${s}" reads ${got}`);
    }
  }
  // 3 · 'Name, ST' reads only an airport of that name inside that state or province
  const at = (c) => coordsOf(c);
  let n = 0;
  for (const [k, v] of ALL) for (const st of Object.keys(NAMES.box)) {
    const got = NAMES.look(v.name + ', ' + st); if (!got) continue;
    if (got === (NAMES.index()[NAMES.key(v.name + ', ' + st)] || '')) continue;   // a whole name of its own ('Lisbonne')
    const b = NAMES.box[st], p = at(got);
    assert.ok(p && p[0] >= b[0] && p[0] <= b[1] && p[1] >= b[2] && p[1] <= b[3], `${v.name}, ${st} reads ${got}, outside ${st}`);
    assert.ok(v.codes.has(got) || NAMES.alias[NAMES.key(v.name + st)] === got || NAMES.look(v.name) === got, `${v.name}, ${st} reads ${got}, not one of its airports`);
    n++;
  }
  assert.ok(n > 1000, n + ' state and province readings checked');
  assert.ok(!('DC' in NAMES.box), 'Washington, DC stays code-less');
  // 4 · a name of ours that is also a country's, territory's, state's or
  // province's is never read as a second stop
  for (const nm of COUNTRIES_AND_REGIONS) {
    const k = NAMES.key(nm);
    if (ALL.has(k)) assert.ok(NAMES.notAStop[k], `"${nm}" is one of our names (${[...ALL.get(k).codes]}) and a country or region: add it to _NOT_A_STOP`);
  }
  // 5 · the airports of one city have short names at least 3 letters apart,
  // so a name one letter off reads one of them, never either
  const ed = (a, b) => { const d = []; for (let i = 0; i <= a.length; i++) d[i] = [i]; for (let j = 0; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  for (const [, v] of ALL) {
    const subs = [...v.codes].map((c) => NAMES.key((AP[c] && AP[c].sub) || '')).filter((s) => s.length >= 5);
    for (let i = 0; i < subs.length; i++) for (let j = i + 1; j < subs.length; j++) assert.ok(ed(subs[i], subs[j]) >= 3, `${v.name}: ${subs[i]} and ${subs[j]}`);
  }
});

// OurAirports' countries and territories, and the US states' and Canadian provinces' names
const COUNTRIES_AND_REGIONS = [
  "(unassigned)", "Afghanistan", "Alabama", "Alaska", "Albania", "Alberta", "Algeria", "American Samoa",
  "Andorra", "Angola", "Anguilla", "Antarctica", "Antigua and Barbuda", "Argentina", "Arizona", "Arkansas",
  "Armenia", "Aruba", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados",
  "Belarus", "Belgium", "Belize", "Benin", "Bermuda", "Bhutan", "Bolivia", "Bosnia and Herzegovina",
  "Botswana", "Brazil", "British Columbia", "British Indian Ocean Territory", "British Virgin Islands",
  "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "California", "Cambodia", "Cameroon", "Canada",
  "Cape Verde", "Caribbean Netherlands", "Cayman Islands", "Central African Republic", "Chad", "Chile",
  "China", "Christmas Island", "Cocos (Keeling) Islands", "Colombia", "Colorado", "Comoros", "Connecticut",
  "Cook Islands", "Costa Rica", "Croatia", "Cuba", "Curaçao", "Cyprus", "Czech Republic", "Côte d'Ivoire",
  "Delaware", "Democratic Republic of the Congo", "Denmark", "District of Columbia", "Djibouti", "Dominica",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia",
  "Eswatini", "Ethiopia", "Falkland Islands", "Faroe Islands", "Fiji", "Finland", "Florida", "France",
  "French Guiana", "French Polynesia", "French Southern and Antarctic Lands", "Gabon", "Gambia", "Georgia",
  "Germany", "Ghana", "Gibraltar", "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala",
  "Guernsey", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Hawaii", "Heard and McDonald Islands",
  "Honduras", "Hong Kong", "Hungary", "Iceland", "Idaho", "Illinois", "India", "Indiana", "Indonesia",
  "Iowa", "Iran", "Iraq", "Ireland", "Isle of Man", "Israel", "Italy", "Jamaica", "Japan", "Jersey",
  "Jordan", "Kansas", "Kazakhstan", "Kentucky", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Louisiana",
  "Luxembourg", "Macau", "Madagascar", "Maine", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
  "Manitoba", "Marshall Islands", "Martinique", "Maryland", "Massachusetts", "Mauritania", "Mauritius",
  "Mayotte", "Mexico", "Michigan", "Micronesia", "Minnesota", "Mississippi", "Missouri", "Moldova", "Monaco",
  "Mongolia", "Montana", "Montenegro", "Montserrat", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nebraska", "Nepal", "Netherlands", "Nevada", "New Brunswick", "New Caledonia", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "New Zealand", "Newfoundland and Labrador", "Nicaragua", "Niger",
  "Nigeria", "Niue", "Norfolk Island", "North Carolina", "North Dakota", "North Korea", "North Macedonia",
  "Northern Mariana Islands", "Northwest Territories", "Norway", "Nova Scotia", "Nunavut", "Ohio",
  "Oklahoma", "Oman", "Ontario", "Oregon", "Pakistan", "Palau", "Palestinian Territory", "Panama",
  "Papua New Guinea", "Paracel Islands (disputed)", "Paraguay", "Pennsylvania", "Peru", "Philippines",
  "Pitcairn", "Poland", "Portugal", "Prince Edward Island", "Puerto Rico", "Qatar", "Quebec",
  "Republic of the Congo", "Rhode Island", "Romania", "Russia", "Rwanda", "Réunion", "Saint Barthélemy",
  "Saint Helena, Ascension and Tristan da Cunha", "Saint Kitts and Nevis", "Saint Lucia", "Saint Martin",
  "Saint Pierre and Miquelon", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Saskatchewan",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Sint Maarten", "Slovakia",
  "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Carolina", "South Dakota",
  "South Georgia and the South Sandwich Islands", "South Korea", "South Sudan", "Spain", "Sri Lanka",
  "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "São Tomé and Principe", "Taiwan", "Tajikistan",
  "Tanzania", "Tennessee", "Texas", "Thailand", "Timor-Leste", "Togo", "Tokelau", "Tonga",
  "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Turks and Caicos Islands", "Tuvalu",
  "U.S. Virgin Islands", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States",
  "United States Minor Outlying Islands", "Unknown or unassigned country", "Uruguay", "Utah", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vermont", "Vietnam", "Virginia", "Wallis and Futuna",
  "Washington", "West Virginia", "Western Sahara (disputed territory)", "Wisconsin", "Wyoming", "Yemen",
  "Yukon", "Zambia", "Zimbabwe",
];
