'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — EVERY PLACE THE BOARDS CAN MEET HAS A POSITION, A CLOCK AND A
// NAME ON THE MAP UNDER THE ROWS, AND NOTHING ELSE CHANGES (v24070)
//
// After v24067 the live boards still listed places the map could not draw,
// so they had no line: Abuja, Colombo, Abidjan, Enfidha, Qaanaaq, Lord Howe
// Island, Nuku'alofa, Apia, Busselton, Port Hardy, Braunschweig, Ulukhaktok,
// Gjoa Haven and the Yellowknife network. Now every code the boards can meet
// has a position (OurAirports), a clock (the IANA tz database) and a name:
//   · every code in the board's tables (CITY, CITY_FR, AP, AP_LIST, GATE_AP,
//     COORDS, AIRPORT_COORDS, the floor's zones, the country table
//     _IATA_CC_GROUPS and the board's other airport tables), every code the
//     live boards' rows were recorded with, and every airport OurAirports
//     gives airline service and an IATA code, or calls a medium or large
//     airport with one (tests/fixtures/earth-places-codes-2026-10-19.txt).
//
// THE MAP'S OWN TABLE. What no table of the board had (the positions, the
// clocks and the names) is in js/earth-places.js, which the floor alone
// loads, once, as it starts, and which only the floor reads. The board's own
// tables are exactly as they were: so the rows, the gate, the belt, the
// companion app, the destination card, the city photos and the weather card
// print every place exactly as v24071 printed it. Held here by running this
// checkout's whole fids-core.js with the floor's table and the floor loaded
// beside it and without them, and v24071's (from the repository's history,
// while the rows' scripts are v24071's but for their cache tokens), over
// every code and name of their tables and the floor's, every row the live
// boards were recorded with, and every ICAO code a feed can send in place
// of one.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'fids-current', 'js');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
const MOD = fs.readFileSync(path.join(JS, 'fids-earth.js'), 'utf8');
const PLACES_SRC = fs.readFileSync(path.join(JS, 'earth-places.js'), 'utf8');
const E = require(path.join(JS, 'fids-earth.js'));
const PLACES = require(path.join(JS, 'earth-places.js'));

function literalIn(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, 'fids-core.js no longer declares ' + marker);
  const open = marker.slice(-1), close = open === '[' ? ']' : '}';
  let i = src.indexOf(open, at), d = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === open) d++; else if (src[j] === close && --d === 0) break; }
  return src.slice(i, j + 1);
}
const table = (marker) => vm.runInNewContext('(' + literalIn(CORE, marker) + ')');
const AP = table('const AP = {'), COORDS = table('const COORDS = {'), GATE_AP = table('var GATE_AP={'), AP_LIST = table('const AP_LIST = [');
const CITY = table('const CITY = {'), CITY_FR = table('const CITY_FR = {');
const CC_GROUPS = table('const _IATA_CC_GROUPS = {');
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(JS, 'airport-coords.js'), 'utf8'), { window: win });
const AIRPORT_COORDS = win.AIRPORT_COORDS;
const SHARED = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: SHARED });
const pair = (v) => (v ? [+(v.lat != null ? v.lat : v[0]), +(v.lon != null ? v.lon : (v.lng != null ? v.lng : v[1]))] : null);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// the floor's own order (fids-earth.js boardAt, then coordsOf)
const boardAt = (c) => pair(COORDS[c]) || pair(AIRPORT_COORDS[c]) || pair(GATE_AP[c]);
const coordsOf = (c) => boardAt(c) || pair(PLACES.AT[c]);
const zoneOf = (c) => E.zoneOf(c, (AP[c] && AP[c].tz) || null, PLACES.zones);
const CC = {};
for (const [cc, list] of Object.entries(CC_GROUPS)) for (const c of list.split(' ')) if (c) CC[c] = cc;

// every code the boards can meet
function universe() {
  const codes = new Set();
  const add = (c) => { c = String(c || '').toUpperCase(); if (/^[A-Z]{3}$/.test(c)) codes.add(c); };
  [CITY, CITY_FR, AP, GATE_AP, COORDS, AIRPORT_COORDS, E.ZONES, CC].forEach((T) => Object.keys(T).forEach(add));
  AP_LIST.forEach((a) => add(a.c));
  // the board's other airport tables, by their keys
  for (const marker of ['const WIKI_CITY = {', 'const UNSPLASH_FB = {', 'const CITY_TYPE = {', 'var DEST_TYPE_MAP = {']) {
    for (const m of literalIn(CORE, marker).matchAll(/\b([A-Z]{3})\s*:/g)) add(m[1]);
  }
  for (const m of CORE.matchAll(/\bdi:'([A-Z]{3})'/g)) add(m[1]);
  const fx = fs.readFileSync(path.join(__dirname, 'fixtures', 'earth-places-codes-2026-10-19.txt'), 'utf8');
  const parts = {};
  let cur = null;
  for (const line of fx.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const h = /^\[(.*)\]$/.exec(line.trim()); if (h) { cur = h[1]; parts[cur] = []; continue; }
    line.trim().split(/\s+/).forEach((c) => { parts[cur].push(c); add(c); });
  }
  return { codes: [...codes].sort(), parts };
}
const U = universe();
// left with no position on purpose: El Borma (EBM), which stood on Pamplona
// in the gate table (v24067 took it out; a feed's EBM is not El Borma); the
// country table's codes OurAirports does not have (no source for where they
// are); and two whose code OurAirports gives to an airport in another country
// than the board's table does (a guess either way)
const NOT_IN_OURAIRPORTS = ('AEI BPR BYY DPP EKK FRU IQR KIV KVD MLH NVK PUM PXN QDU QJG QKL QMK QPP QQP QQS QUP RTW SXF SZC TJX UPK VIF VLO '
  + 'XDB XDS XEF XEG XNB XSH XWG XYD ZAJ ZFV ZGC ZWS ZYA ZYK ZYR').split(' ');
const OTHER_COUNTRY = { KUB: 'KR in the country table, Brunei to OurAirports', KRV: 'RU in the country table, Kenya to OurAirports' };
const UNPLACED = ['EBM'].concat(NOT_IN_OURAIRPORTS, Object.keys(OTHER_COUNTRY)).sort();
const TAIL = /,|\b(AIRPORT|AIRFIELD|AERODROME|AIRSTRIP|HELIPORT|AIR BASE|AIR FORCE|ARMY AVIATION|AUTONOMOUS COUNTY|SEAPLANE BASE|NAVAL)\b/i;

test('every code the boards can meet: the board\'s tables, its country table, the live boards\' rows, every airport with airline service', () => {
  assert.deepEqual(Object.keys(U.parts), ['recorded', 'ourairports scheduled', 'ourairports medium and large']);
  assert.ok(U.parts.recorded.length >= 790, U.parts.recorded.length + ' recorded codes');
  assert.ok(U.parts['ourairports scheduled'].length >= 4100, U.parts['ourairports scheduled'].length + ' airports with airline service');
  assert.ok(U.parts['ourairports medium and large'].length >= 1300);
  assert.ok(U.codes.length >= 5600, U.codes.length + ' codes');
  assert.ok(Object.keys(CC).length >= 3900, Object.keys(CC).length + ' codes in the country table');
  // the reviewer's: places on the live boards with no line after v24067
  for (const c of ['ABV', 'CMB', 'ABJ', 'NBE', 'NAQ', 'LDH', 'TBU', 'APW', 'BQB', 'YZT', 'BWE', 'YHI', 'YHK', 'YBB', 'YPC', 'YSY', 'YLE', 'YWJ',
    'YGH', 'ZFN', 'YRA', 'YFR', 'YJF', 'YWY', 'YSG']) assert.ok(U.codes.includes(c), c);
});

test('every one of them has a position: the board\'s tables, else js/earth-places.js (OurAirports), but for the ones left off on purpose', () => {
  const none = U.codes.filter((c) => !coordsOf(c));
  assert.deepEqual(none, UNPLACED, 'codes the map cannot place');
  for (const c of NOT_IN_OURAIRPORTS) assert.ok(CC[c], c + ' is a country-table code');
  // the table holds only what no other table places, each once
  for (const c of Object.keys(PLACES.AT)) {
    assert.ok(!boardAt(c), c + ' is placed twice');
    const [lat, lon] = PLACES.AT[c];
    const r3 = (x) => Math.abs(x * 1000 - Math.round(x * 1000)) < 1e-6;
    assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && r3(lat) && r3(lon), c + ' ' + PLACES.AT[c]);
  }
  assert.ok(Object.keys(PLACES.AT).length >= 3200, Object.keys(PLACES.AT).length + ' positions');
  // OurAirports (airports.csv, 2026-10-19), three decimals
  const want = {
    ABV: [9.007, 7.263], CMB: [7.181, 79.884], ABJ: [5.261, -3.926], NBE: [36.076, 10.439], NAQ: [77.489, -69.389], LDH: [-31.538, 159.075],
    TBU: [-21.241, -175.149], APW: [-13.83, -172.008], BQB: [-33.687, 115.4], YZT: [50.681, -127.367], BWE: [52.319, 10.556], YHI: [70.763, -117.806],
    YHK: [68.636, -95.85], YBB: [68.536, -89.806], YWJ: [65.211, -123.436], YFR: [61.181, -113.69], YJF: [60.236, -123.469], YWY: [63.209, -123.437],
    // the country table's, with no airline service (scheduled_service no)
    FGI: [-13.849, -171.74], SWP: [-22.662, 14.568], YHS: [49.461, -123.719], NFO: [-15.571, -175.631], GJR: [65.995, -21.327]
  };
  for (const [c, p] of Object.entries(want)) assert.deepEqual(coordsOf(c), p, c);
});

test('every one of them has a clock (the IANA tz database), or none on purpose, never a guess', () => {
  const noZone = U.codes.filter((c) => !zoneOf(c)).sort();
  assert.deepEqual(noZone, PLACES.NONE.concat(UNPLACED).sort(), 'codes with no zone');
  // left out on purpose: communities near Ontario's 90th meridian that keep
  // their own clocks, south-west Amazonas, a Sakha district the tz database
  // does not name, and YMU (a seaplane base in British Columbia to
  // OurAirports, Musselwhite to the boards)
  assert.deepEqual(PLACES.NONE, ['CAF', 'KIF', 'LBR', 'SUK', 'SUR', 'TBT', 'WNN', 'XKS', 'YAX', 'YER', 'YFH', 'YLH', 'YMU', 'YPL', 'YTL', 'YWP']);
  for (const c of PLACES.NONE) assert.ok(coordsOf(c), c + ' is still on the map, with no time');
  // the table's zones are the ones AP and the floor's list do not give, each once, each one the browser knows
  const seen = new Set();
  // (and five one by one: a string of Québec codes alone would be a second
  // list of Québec's airports, which BoardStrings.FR_FIRST is)
  assert.deepEqual(PLACES.ONE, { YBX: 'America/Blanc-Sablon', YIF: 'America/Blanc-Sablon', ZGS: 'America/Blanc-Sablon', ZLT: 'America/Blanc-Sablon', ZTB: 'America/Blanc-Sablon' });
  for (const [z, list] of Object.entries(PLACES.ZONE).concat(Object.entries(PLACES.ONE).map(([c, z1]) => [z1, c]))) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: z }).format(0), z);
    for (const c of list.split(' ')) {
      assert.match(c, /^[A-Z]{3}$/, z + ': ' + JSON.stringify(c));
      assert.ok(!seen.has(c), c + ' twice'); seen.add(c);
      assert.ok(!(AP[c] && AP[c].tz) && !E.ZONES[c], c + ' has a zone in AP or ZONE_LIST');
    }
  }
  assert.ok(seen.size >= 4800, seen.size + ' zones');
  // each clock agrees with the sun there (its offset within 2.6 h of the
  // longitude's), but where a country keeps one clock across far more:
  // western China on Beijing time, north Greenland on Nuuk's
  const off = (z, d) => { const p = new Intl.DateTimeFormat('en', { timeZone: z, timeZoneName: 'longOffset' }).formatToParts(d).find((x) => x.type === 'timeZoneName').value; const m = /GMT([+-])(\d\d):?(\d\d)?/.exec(p); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] + (+m[3] || 0) / 60) : 0; };
  const jan = new Date('2026-01-15T12:00:00Z'), far = [];
  for (const c of seen) {
    const p = coordsOf(c), z = PLACES.zones[c];
    let d = off(z, jan) - p[1] / 15; if (d > 12) d -= 24; if (d < -12) d += 24;
    if (Math.abs(d) > 2.6) far.push(c);
  }
  assert.deepEqual(far.sort(), ['AKU', 'HQL', 'HTN', 'KHG', 'NAQ', 'NGQ', 'QSZ', 'SRK', 'TWC']);
});

test('the clocks that are easy to get wrong', () => {
  const want = {
    // the Aleutians west of 169.5°W on Hawaii-Aleutian time; St Lawrence Island and the Pribilofs on Alaska's
    ADK: 'America/Adak', AKB: 'America/Adak', GAM: 'America/Anchorage', SNP: 'America/Anchorage', JNU: 'America/Juneau', SIT: 'America/Sitka',
    // the Florida panhandle, the Nebraska Panhandle, northwest Indiana, El Paso, Kentucky and Tennessee by their lines
    DSI: 'America/Chicago', BFF: 'America/Denver', MCK: 'America/Chicago', GYY: 'America/Chicago', BIF: 'America/Denver', BWG: 'America/Chicago',
    LOZ: 'America/New_York', CSV: 'America/Chicago', RCA: 'America/Denver', ONO: 'America/Boise',
    // Canada: Labrador's south-east coast to Black Tickle on Newfoundland time, Cartwright and the north coast Atlantic
    YHA: 'America/St_Johns', YMH: 'America/St_Johns', YFX: 'America/St_Johns', YBI: 'America/St_Johns', YRF: 'America/Goose_Bay', YDP: 'America/Goose_Bay',
    // Québec east of Natashquan on Atlantic time
    ZGS: 'America/Blanc-Sablon', YBX: 'America/Blanc-Sablon', YIF: 'America/Blanc-Sablon', YGV: 'America/Toronto',
    // Nunavut by its regions; Coral Harbour on EST all year; the Northwest Territories' Mountain time; Ontario west of 90.5°W
    YHK: 'America/Cambridge_Bay', YBB: 'America/Cambridge_Bay', YUT: 'America/Rankin_Inlet', YZS: 'America/Atikokan', YRB: 'America/Resolute',
    YSK: 'America/Iqaluit', YHI: 'America/Inuvik', YFR: 'America/Edmonton', YSG: 'America/Edmonton', YHD: 'America/Winnipeg', YIB: 'America/Atikokan',
    YDQ: 'America/Dawson_Creek', YYN: 'America/Swift_Current', YOC: 'America/Dawson',
    // Mexico's border, Brazil's islands, Chile's, Ecuador's, Polynesia's, Bougainville, Kwajalein, northern Cyprus
    CJS: 'America/Ciudad_Juarez', PDS: 'America/Matamoros', FEN: 'America/Noronha', IPC: 'Pacific/Easter', GPS: 'Pacific/Galapagos', NHV: 'Pacific/Marquesas',
    GMR: 'Pacific/Gambier', BUA: 'Pacific/Bougainville', KWA: 'Pacific/Kwajalein', ECN: 'Asia/Famagusta', LDH: 'Australia/Lord_Howe', BHQ: 'Australia/Broken_Hill',
    // Sakha's three clocks; China on Beijing time
    SYA: 'America/Adak', YKS: 'Asia/Yakutsk', USR: 'Asia/Ust-Nera', SEK: 'Asia/Srednekolymsk', BGN: 'Asia/Srednekolymsk', URC: 'Asia/Shanghai', KHG: 'Asia/Shanghai',
    // the reviewer's: Prestwick printed no time
    PIK: 'Europe/London', TBU: 'Pacific/Tongatapu', APW: 'Pacific/Apia', NBE: 'Africa/Tunis', NAQ: 'America/Nuuk', BQB: 'Australia/Perth',
    // Chetwynd keeps Mountain time all year with Dawson Creek; Valparaiso,
    // Indiana is Central (Porter County); Sevastopol is on Simferopol's
    // clock; Aysén on Punta Arenas's (America/Coyhaique keeps the same clock
    // all year, and older browsers do not know it)
    YCQ: 'America/Dawson_Creek', VPZ: 'America/Chicago', UKS: 'Europe/Simferopol', BBA: 'America/Punta_Arenas', GXQ: 'America/Punta_Arenas',
    // the country table's: Kiribati's Line Islands, Karakalpakstan, Tierra del Fuego
    TNV: 'Pacific/Kiritimati', TNQ: 'Pacific/Kiritimati', MOK: 'Asia/Samarkand', DPB: 'America/Punta_Arenas', CZN: 'America/Anchorage'
  };
  for (const [c, z] of Object.entries(want)) assert.equal(zoneOf(c), z, c);
  // the floor reads AP, then its list, then the table
  assert.equal(E.zoneOf('ABJ', null, PLACES.zones), 'Africa/Abidjan');
  assert.equal(E.zoneOf('YQM', 'America/Halifax', PLACES.zones), 'America/Halifax');
  assert.equal(E.zoneOf('ZZZ', null, PLACES.zones), null);
});

test('every one of them the map can draw has a name: the board\'s (CITY, CITY_FR), else the floor\'s own (NAME), by the naming rules', () => {
  const bad = [];
  for (const c of U.codes) {
    if (UNPLACED.includes(c)) continue;
    const inTables = !!(CITY[c] || CITY_FR[c]), mine = PLACES.nameOf(c);
    if (!inTables && !mine) bad.push(c + ' has no name');
    if (inTables && own(PLACES.NAME, c)) bad.push(c + ' is named twice: CITY/CITY_FR and the floor\'s table');
  }
  assert.deepEqual(bad, []);
  // the floor's names are its own: no table the rows or the companion app
  // read names any of its codes
  for (const c of Object.keys(PLACES.NAME)) {
    assert.ok(!CITY[c] && !CITY_FR[c] && !SHARED.FIDS_SHARED_CITY[c], c + ' is in the board\'s tables');
    const n = PLACES.NAME[c];
    // (no figure but La Grande-4's, whose figure is its name)
    assert.ok(n && n === n.trim() && !TAIL.test(n) && !/[|()]/.test(n) && (!/[0-9]/.test(n) || (c === 'YAH' && n === 'La Grande-4')) && !/\//.test(n), `${c} '${n}'`);
    // written as the place writes it, never the board's title case of it
    assert.ok(!/\b[A-Z]'[a-zà-ÿ]|-(I|Na|Ul|Al|El|Le|La|De)-|\bMc [A-Z]/.test(n), `${c} '${n}'`);
    assert.equal(PLACES.nameOf(c.toLowerCase()), n);
  }
  assert.ok(Object.keys(PLACES.NAME).length >= 3190, Object.keys(PLACES.NAME).length + ' names');
  // (no French or other name has been read for them yet: a French board
  // prints the name as it is, as the rows print a place CITY_FR does not name)
  assert.equal(PLACES.NAME_FR, undefined);
  const want = {
    ABJ: 'Abidjan', CMB: 'Colombo', NBE: 'Enfidha', NAQ: 'Qaanaaq', LDH: 'Lord Howe Island', TBU: "Nuku'alofa", APW: 'Apia', BQB: 'Busselton',
    BWE: 'Braunschweig', YHI: 'Ulukhaktok', YHK: 'Gjoa Haven', YBB: 'Kugaaruk', YPC: 'Paulatuk', YLE: 'Whatì', YWJ: 'Déline', YGH: 'Fort Good Hope',
    ZFN: 'Tulita', YRA: 'Gamètì', YFR: 'Fort Resolution', YJF: 'Fort Liard', YWY: 'Wrigley', YSG: "Lutselk'e",
    // a village or a district: the city the airport serves; an island's name; two places joined: the one it is named for
    BNX: 'Banja Luka', DJJ: 'Jayapura', LLW: 'Lilongwe', KNO: 'Medan', KUT: 'Kutaisi', JRO: 'Kilimanjaro', BBQ: 'Barbuda', INU: 'Nauru', IUE: 'Niue',
    HLE: 'Saint Helena', RAR: 'Rarotonga', NEV: 'Nevis', SCT: 'Socotra', ISC: 'Isles of Scilly', ILR: 'Ilorin', RVY: 'Rivera',
    // Aosta (OurAirports' town is 'Saint-Christophe (AO)', a province
    // code), Jask and Ndolo by their airports' own names
    AOT: 'Aosta', JSK: 'Jask', NLO: 'Ndolo',
    // as the places write them (the board's title case made 'N'djamena',
    // 'Mazar-I-Sharif', 'Mc Alester')
    NDJ: "N'Djamena", NGE: "N'Gaoundéré", HRM: "Hassi R'Mel", MZR: 'Mazar-i-Sharif', NLI: 'Nikolayevsk-on-Amur', MLC: 'McAlester',
    // a name that is its own code is a name: the map draws it
    AHE: 'Ahe', YAP: 'Yap', UFA: 'Ufa',
    // the country table's, by the same rules (the city an airstrip serves, the island)
    FGI: 'Apia', SLV: 'Shimla', LLI: 'Lalibela', DRK: 'Drake Bay', XZM: 'Macau', NFO: "Niuafo'ou", CXY: 'Cat Cay', SWP: 'Swakopmund'
  };
  for (const [c, n] of Object.entries(want)) assert.equal(PLACES.nameOf(c), n, c);
  assert.equal(CITY.ABV, 'ABUJA', 'Abuja had its name, and now its position');
  assert.equal(CITY.YZT, 'PORT HARDY');
});

// ── the floor's table is the floor's ───────────────────────────────────────

test('only the floor loads js/earth-places.js and reads it; the floor writes to no table of the board\'s', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]));
  const readers = [];
  for (const f of walk(path.join(ROOT, 'fids-current')).concat(walk(path.join(ROOT, 'workers')), [path.join(ROOT, 'worker-entry.js')])) {
    if (!/\.(js|html|mjs|css)$/.test(f)) continue;
    if (/\/fids-current\/js\/(fids-earth|earth-places)\.js$/.test(f)) continue;
    if (/earth-places|FIDS_EARTH_PLACES/.test(fs.readFileSync(f, 'utf8'))) readers.push(path.relative(ROOT, f));
  }
  assert.deepEqual(readers, [], 'nothing but the floor reads the floor\'s table');
  assert.match(MOD, /var PLACES_URL = '\/js\/earth-places\.js\?v=\d+';/);
  const tag = /var FIDS_BUILD_TAG = 'v(\d+)';/.exec(CORE)[1];
  assert.equal(/earth-places\.js\?v=(\d+)/.exec(MOD)[1], tag, 'the table\'s cache token is the build\'s');
  assert.match(MOD, /function loadPlaces\(\) \{\s*if \(placesAsked\) return;/);
  assert.match(MOD, /loadPlaces\(\);\s*if \(!placesReady\(\)\) return;/, 'measure waits for it');
  assert.match(MOD, /var PLACES_WAIT_MS = 6000;/);
  assert.match(MOD, /function coordsOf\(c\) \{\s*var v = boardAt\(c\);\s*if \(!v && PLACES && PLACES\.AT && Object\.prototype\.hasOwnProperty\.call\(PLACES\.AT, c\)\) v = asPair\(PLACES\.AT\[c\]\);\s*return v;/);
  assert.match(MOD, /function apTz\(c\) \{[^\n]*return zoneOf\(c, z, PLACES && PLACES\.zones\); \}/);
  assert.match(MOD, /placeName: function \(c\) \{ return \(PLACES && PLACES\.nameOf\) \? PLACES\.nameOf\(c\) : ''; \},/);
  // the floor never writes into a table of the board's (an assignment to one
  // of its entries, or a merge into it)
  const TABLES = 'CITY|CITY_FR|CITY_ES|AP|AP_LIST|COORDS|GATE_AP|AIRPORT_COORDS|FIDS_SHARED_CITY|_IATA_CC|_IATA_CC_GROUPS|WIKI_CITY';
  const writes = MOD.split('\n').filter((l) => new RegExp('\\b(?:root\\.)?(' + TABLES + ')\\s*(\\[[^\\]]*\\]|\\.[A-Za-z_]\\w*)\\s*=(?!=)').test(l)
    || new RegExp('Object\\.assign\\(\\s*(?:root\\.)?(' + TABLES + ')\\b').test(l) || new RegExp('\\b(' + TABLES + ')\\s*=(?!=)').test(l.replace(/var GATE0 = \{\};/, '')));
  assert.deepEqual(writes, [], 'the floor writes no table of the board\'s');
  // it is one compact table, its size kept down
  assert.ok(PLACES_SRC.length < 175000, PLACES_SRC.length + ' bytes');
  assert.match(PLACES_SRC, /OurAirports/); assert.match(PLACES_SRC, /IANA tz database/);
});

// ── the rows and every other screen print what v24071 printed ──────────────

// The whole board script (fids-core.js, with the scripts it reads first and
// the coordinates after it, as fids.html loads them) in a page of its own:
// no screen, no network, no timers. `extra`: scripts loaded after it, as the
// departures board loads the floor.
function board(files, extra) {
  const nothing = (name) => new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'toString' || k === 'valueOf') return () => '';
      return nothing(name + '.' + String(k));
    },
    set() { return true; }, apply() { return nothing(name + '()'); }, construct() { return nothing('new ' + name); }, has() { return true; }
  });
  const store = {};
  const ls = { getItem: (k) => (own(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, length: 0, clear() {} };
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, localStorage: ls, sessionStorage: ls, document: nothing('document'),
    navigator: { userAgent: 'node', language: 'en' }, fetch: () => new Promise(() => {}), performance: { now: () => Date.now() },
    location: { search: '?ap=YQM', hostname: 'localhost', href: 'http://localhost/fids.html?ap=YQM', pathname: '/fids.html', origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const [name, src] of files.concat(extra || [])) vm.runInContext(src, ctx, { filename: name });
  const core = files.find(([n]) => n === 'js/fids-core.js')[1];
  // what each screen prints, by the board's own code, cut from its own source:
  // the departures and arrivals row (render), the AI destination card's city
  // (renderDedicatedScreen), the gate's photo search (setGateBg), the weather
  // card's city (_renderWxCard) and its cities' plates (_wxCityOf)
  const cut = (a, b) => { const i = core.indexOf(a), j = core.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return core.slice(i, j); };
  const line = (re) => { const m = re.exec(core); assert.ok(m, String(re)); return m[1]; };
  vm.runInContext([
    'var __row = function (f, isDep, lang) {',
    cut('    const loc       = isDep ? f.dest : f.origin;', '    // v23925 — the row as shown (_fidsShownRow)'),
    '  return cityDisp; };',
    'var __destInfo = function (locIata) { return ' + line(/var _destCity = (CITY\[locIata\] \|\| _cityForIata\(locIata\) \|\| locIata);/) + '; };',
    'var __photo = function (locIata) { return ' + line(/var cityName = (CITY\[locIata\] \|\| _cityForIata\(locIata\) \|\| '');\n  if \(cityName\) \{\n    var ov = await fetchOpenversePhoto/) + '; };',
    'var __wxCard = function (dest) { var city = ""; ' + line(/\n(    try \{ city = \(typeof CITY !== 'undefined' && CITY\[dest\]\) \|\| \(AP\[dest\] && AP\[dest\]\.city\) \|\| dest; \} catch \(e\) \{ city = dest; \}\n    if \(typeof tc === 'function'\) \{ try \{ city = tc\(city\); \} catch \(e2\) \{\} \})/) + ' return city; };',
    line(/\n    (var _wxCityOf = function \(iata\) \{[\s\S]*?\n    \};)/),
    // the feed's airport code as mapADB reads it: the IATA code, else the
    // last three letters of the ICAO code
    'var __locIata = function (f, mode) { ' + line(/\n    (let locIata=mode==='dep'\n[^;]*;)/) + ' return locIata; };',
    // the board's language (a \`let\` of fids-core.js's)
    'var __setLang = function (l) { lang = l; };'
  ].join('\n'), ctx);
  return ctx;
}
const atBase = (() => {
  // v24071: main as this change was made (337fef1d, #1067)
  const C = '337fef1d26b4a9eea462a044af6cc6820e211e80';
  try { execFileSync('git', ['cat-file', '-e', C + '^{commit}'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) { return null; }
  return (rel) => execFileSync('git', ['show', C + ':' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
})();
const BOARD_FILES = ['js/host-airport.js', 'js/board-strings.js', 'js/feed-router.js', 'js/fids-core.js', 'js/airport-coords.js'];
const here = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let BOARD_ = null;
const thisBoard = () => BOARD_ || (BOARD_ = board(BOARD_FILES.map((f) => [f, here('fids-current/' + f)]),
  [['js/earth-places.js', PLACES_SRC], ['js/fids-earth.js', MOD]]));
// The comparison with v24071 holds while the rows' scripts are v24071's but
// for their cache tokens and the build tag, as this change leaves them. A
// later change that means the rows to print otherwise is not held to v24071
// (that comparison stands aside, and says which files moved); what keeps
// holding the floor's table away from the rows, whatever they print, is the
// board with and without the floor's table and the floor, which needs no
// history.
const ROW_FILES = BOARD_FILES.map((f) => 'fids-current/' + f).concat(['fids-current/app.html', 'fids-current/js/shared-names.js']);
const untokened = (s) => s.replace(/\?v=\d+/g, '?v=').replace(/var FIDS_BUILD_TAG = 'v\d+';/, "var FIDS_BUILD_TAG = 'v';");
let MOVED_ = null;
const movedSinceBase = () => MOVED_ || (MOVED_ = atBase ? ROW_FILES.filter((rel) => untokened(here(rel)) !== untokened(atBase(rel))) : null);
const ROWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'rows-v24067.json'), 'utf8'));
const LANGS = ['en', 'fr', 'ja'];

// Every way a screen can print a place, for one board. `feeds`: rows as a
// feed sends them, [iata, icao, name]; `codes`: every code.
function prints(B, feeds, codes) {
  const out = [];
  const flight = (x, i, dep) => {
    const ap = {}; if (x[0]) ap.iata = x[0]; if (x[1]) ap.icao = x[1]; if (x[2]) ap.name = x[2];
    const t = { local: '2026-10-20 12:00Z', utc: '2026-10-20 12:00Z' };
    return dep ? { number: 'AC ' + (100000 + i), airline: { iata: 'AC', name: 'Air Canada' }, status: 'Expected', departure: { scheduledTime: t }, arrival: { airport: ap, scheduledTime: t } }
      : { number: 'AC ' + (100000 + i), airline: { iata: 'AC', name: 'Air Canada' }, status: 'Expected', arrival: { scheduledTime: t }, departure: { airport: ap, scheduledTime: t } };
  };
  for (const dep of [true, false]) {
    // (arrivals: the same reading of the feed, by its other airport; every
    // row with a code, and the recorded ones)
    const list = dep ? feeds : feeds.filter((x) => x[0] && !x[1]);
    B.__setLang('en');
    const rows = [];
    for (let i = 0; i < list.length; i += 400) rows.push(...B.mapADB({ [dep ? 'departures' : 'arrivals']: list.slice(i, i + 400).map((x, k) => flight(x, i + k, dep)) }, dep ? 'dep' : 'arr'));
    const by = new Map(rows.map((f) => [f.flight, f]));
    list.forEach((x, i) => {
      const f = by.get('AC' + (100000 + i));
      if (!f) { out.push('dropped'); return; }
      const loc = dep ? f.dest : f.origin, r = [f._locIata || '', loc || ''];
      for (const l of (dep ? LANGS : ['en', 'fr'])) {
        B.__setLang(l);
        r.push(B.__row(f, dep, l));
        // the belt and the gate: the row's place as fetchLive named it, read again
        r.push(f._locIata ? B.formatCityIata(loc || f._locIata, f._locIata, l) : B.formatCityIata(loc || '—', '', l));
        r.push(f._locIata ? B.cityCode(f._locIata, '', l) : '');
      }
      // a via stop (_destFlipStops)
      if (dep) r.push(String(B._destFlipStops([{ iata: x[0], city: x[2] }, { iata: 'YYZ', city: 'Toronto' }], 'c')));
      out.push(JSON.stringify(r));
    });
  }
  for (const c of codes) {
    const r = [c];
    for (const l of LANGS) { B.__setLang(l); r.push(B.airportCityNameSafe_v21877(c, l), B.formatCityIata(c, c, l), B._wxCityOf(c)); }
    B.__setLang('en');
    r.push(B.__destInfo(c), B.__photo(c), B._wxCityQuery(c), B.__wxCard(c), B._cityForIata(c), String(B._iataFromCityName(c)));
    // every ICAO code a feed can send for it: its first letter, any
    for (const p of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') r.push(B.__locIata({ arrival: { airport: { icao: p + c } } }, 'dep') + B.__locIata({ departure: { airport: { icao: p + c } } }, 'arr'));
    out.push(JSON.stringify(r));
  }
  return out;
}
// the companion app's names (app.html placeOf and cityCodeOf, over shared-names.js), as tests/companion-app-rows.test.js builds them
function app(APP, SHAREDSRC) {
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
  const ctx = { console };
  ctx.window = ctx;
  vm.runInNewContext(SHAREDSRC, ctx);
  ctx.BoardStrings = require(path.join(JS, 'board-strings.js'));
  vm.runInNewContext('var dispIata=function(c){return c;};var CURAP=\'YQM\';var langRes=function(){return \'en\';};' + line(/^const AIRPORTS=\{[\s\S]*?\n\};/m).replace('const AIRPORTS', 'var AIRPORTS')
    + line(/^const CITY=\{[\s\S]*?\};/m).replace('const CITY', 'var CITY') + fn('_tcCity') + line(/^if\(window\.FIDS_SHARED_CITY\)[^\n]*/m)
    + line(/^for\(var _ck in AIRPORTS\)[^\n]*/m) + 'var _CITY_CODE=null;' + fn('_cityKey') + fn('cityCodeOf') + fn('apSub') + fn('placeOf'), ctx);
  return ctx;
}

// the corpus: every code and name in v24071's tables and this checkout's and
// the floor's table, as a feed sends them (with its code, without it, with an
// ICAO code in its place), and every row the live boards were recorded with
function corpus(...boards) {
  const tables = (B) => ['CITY', 'CITY_FR', 'AP', 'AP_LIST'].map((t) => vm.runInContext(t, B));
  const codes = new Set(U.codes.concat(Object.keys(PLACES.NAME), Object.keys(PLACES.AT)));
  const names = new Map();
  const name = (c, n) => { if (!n) return; if (!names.has(c)) names.set(c, new Set()); names.get(c).add(String(n)); };
  for (const B of boards) {
    const [C, F, A, L] = tables(B);
    for (const T of [C, F]) for (const [c, n] of Object.entries(T)) { codes.add(c); name(c, n); }
    for (const [c, a] of Object.entries(A)) { codes.add(c); name(c, a && a.name); name(c, a && a.city); }
    for (const a of L) if (a && a.c) { codes.add(a.c); name(a.c, a.n); }
  }
  for (const [c, n] of Object.entries(PLACES.NAME)) name(c, n);
  const tcw = (s) => String(s).toLowerCase().replace(/(^|[\s\-\/(.])[a-zà-ÿ]/g, (m) => m.toUpperCase());
  const feeds = [], seen = new Set();
  let sixth = 0;
  const add = (iata, icao, nm) => { const k = iata + '\u0001' + icao + '\u0001' + nm; if (!seen.has(k)) { seen.add(k); feeds.push([iata, icao, nm]); } };
  for (const c of codes) {
    if (!/^[A-Z0-9]{3}$/.test(c)) continue;
    // with its code, and its name as the feed writes it; and a place of the
    // floor's table without its code, by its name and by its code written
    // as a word ('Gao'), which the board reads from the words: every sixth
    // (two thousandths of a second a row, the board's own lookup; every
    // name of every table was read so, with and without its code, in every
    // way, when this test was written)
    add(c, '', ''); add(c, '', c);
    for (const n of names.get(c) || []) { add(c, '', n); add(c, '', tcw(n)); }
    if (own(PLACES.NAME, c) && ++sixth % 6 === 0) { add('', '', PLACES.NAME[c]); add('', '', tcw(c)); }
    // a feed that sends an ICAO code in place of the IATA one: the board
    // reads its last three letters (mapADB), whatever its first (every first
    // letter is read below, prints: __locIata); the whole row once each way
    add('', 'L' + c, '');
    const n0 = [...(names.get(c) || [])][0];
    if (n0) add('', 'E' + c, tcw(n0));
  }
  // the reviews': three letters written as a name, a code written as a word
  for (const w of ['Gao', 'Osh', 'Sui', 'Bor', 'Jam', 'Oyo', 'Abj', 'ABJ', 'Yhi', 'YHI', 'Aaa', 'AAA', 'Abidjan', 'Ulukhaktok', 'Paris', 'Rome', 'Athens', 'Naples']) add('', '', w);
  // the reviewer's: a feed's ICAO code that names another place than the board's code does
  for (const [icao, nm] of [['LYBE', 'Belgrade Nikola Tesla'], ['LSGG', 'Geneva'], ['LSZB', 'Bern'], ['OOMS', 'Muscat'], ['EGNS', 'Isle of Man'], ['UAAA', 'Almaty']]) { add('', icao, ''); add('', icao, nm); }
  for (const [raw, code] of ROWS.recorded) { add(code || '', '', raw); add(code || '', '', String(raw).replace(/\s*\|\s*[A-Z0-9]{3}$/, '')); add('', '', raw); }
  return { feeds, codes: [...codes].filter((c) => /^[A-Z0-9]{3}$/.test(c)).sort() };
}

// the boards compared, the corpus over all their tables, and what each prints (once for both tests)
let RUN_ = null;
function run() {
  if (RUN_) return RUN_;
  const B1 = thisBoard();
  const Bare = board(BOARD_FILES.map((f) => [f, here('fids-current/' + f)]));
  const moved = movedSinceBase();
  const B0 = moved && !moved.length ? board(BOARD_FILES.map((f) => [f, atBase('fids-current/' + f)])) : null;
  const { feeds, codes } = corpus(...[B0, Bare, B1].filter(Boolean));
  // the floor names every place first, by its own naming and the board's
  // helpers, as it does on screen: whatever it did to a table of the board's
  // would show in what the board prints after it
  const E1 = B1.FidsEarth;
  const BF = { formatCityIata: B1.formatCityIata, stripCode: B1._stripCityCode, tableCity: B1.airportCityNameSafe_v21877, normalize: B1.normalizeDisplayCity,
    inTables: (c) => !!(vm.runInContext('CITY', B1)[c] || vm.runInContext('CITY_FR', B1)[c]), placeName: B1.FIDS_EARTH_PLACES.nameOf,
    onlyHere: (c) => !boardAt(c) && own(B1.FIDS_EARTH_PLACES.AT, c), readWords: (w) => B1._iataFromCityName(w) || B1._iataFromRowName(w) || '', at: coordsOf };
  for (const c of codes) {
    for (const text of [c, c + ' | ' + c, 'Belgrade Nikola Tesla | ' + c]) {
      E1.namedBy(BF, c, text); E1.misread(BF, c, text);
      for (const l of LANGS) E1.cityNameOf(BF, c, text, l);
    }
  }
  const P1 = prints(B1, feeds, codes), Pbare = prints(Bare, feeds, codes), P0 = B0 ? prints(B0, feeds, codes) : null;
  return (RUN_ = { B0, Bare, B1, feeds, codes, P0, Pbare, P1 });
}
const diffOf = (A, B, a, b) => {
  const out = [];
  for (let i = 0; i < A.length && out.length < 20; i++) if (A[i] !== B[i]) out.push('\n    ' + a + ': ' + A[i] + '\n    ' + b + ': ' + B[i]);
  return out;
};

test('the floor\'s table and the floor change nothing the rows, the belt, the gate, the destination card, the photos or the weather print: the board with them and without them', () => {
  const { Bare, B1, feeds, codes, Pbare, P1 } = run();
  assert.equal(typeof B1.FIDS_EARTH_PLACES, 'object', 'the floor\'s table is loaded, as on a board whose floor has started');
  assert.equal(B1.FidsEarth && typeof B1.FidsEarth.cityNameOf, 'function', 'and the floor');
  assert.equal(Bare.FIDS_EARTH_PLACES, undefined); assert.equal(Bare.FidsEarth, undefined);
  assert.ok(feeds.length > 33000 && codes.length > 5600, feeds.length + ' feed rows, ' + codes.length + ' codes');
  assert.equal(P1.length, Pbare.length);
  assert.deepEqual(diffOf(Pbare, P1, 'without the floor', 'with it'), [], 'the floor\'s table or the floor changed what the board prints');
  // and the board's tables are as they were, every entry
  for (const t of ['CITY', 'CITY_FR', 'AP', 'AP_LIST', 'COORDS', 'GATE_AP', 'window.AIRPORT_COORDS']) {
    assert.equal(JSON.stringify(vm.runInContext(t, B1)), JSON.stringify(vm.runInContext(t, Bare)), t);
  }
});

test('the rows, the belt, the gate, the companion app, the destination card, the photos and the weather print every place as v24071 did, the floor\'s table loaded beside them', (t) => {
  if (!atBase) { t.skip('v24071 (337fef1d) is not in this checkout\'s history'); return; }
  const moved = movedSinceBase();
  if (moved.length) { t.skip('the rows\' scripts have changed since v24071 (' + moved.join(', ') + '): the board with and without the floor holds the floor\'s table away from them'); return; }
  const { feeds, P0, P1 } = run();
  assert.equal(P1.length, P0.length);
  assert.deepEqual(diffOf(P0, P1, 'v24071', 'now   '), [], 'printed differently from v24071');
  // the reviewer's: an ICAO code is read as its last three letters, as it was
  const at = feeds.findIndex((x) => x[1] === 'LYBE' && x[2]);
  assert.match(P1[at], /^\["YBE","Belgrade Nikola Tesla \| YBE"/, 'Belgrade\'s LYBE reads YBE on the rows, as v24071 read it');
  // the companion app: its names and its lookup, v24071's
  const A0 = app(atBase('fids-current/app.html'), atBase('fids-current/js/shared-names.js'));
  const A1 = app(here('fids-current/app.html'), here('fids-current/js/shared-names.js'));
  const bad = [];
  for (const [c, , nm] of feeds) {
    const k = JSON.stringify([A0.placeOf(c, nm), A0.cityCodeOf(nm)]), k1 = JSON.stringify([A1.placeOf(c, nm), A1.cityCodeOf(nm)]);
    if (k !== k1 && bad.length < 20) bad.push(`${c} ${JSON.stringify(nm)}: ${k} -> ${k1}`);
  }
  assert.deepEqual(bad, [], 'the companion app names a place differently from v24071');
});

// the board's row helpers out of fids-core.js, as the fixture's rows were
// printed (tests/earth-floor-places.test.js makes them so too)
function rowHelpers() {
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
    'return { rowCity, airportCityNameSafe_v21877 };'
  ].join('\n');
  return new Function('CITY', 'CITY_FR', 'AP', 'AP_LIST', 'COORDS', 'GATE_AP', 'window', 'BoardStrings', 'getLang', src)(CITY, CITY_FR, AP, AP_LIST, COORDS, GATE_AP, { AIRPORT_COORDS },
    require(path.join(JS, 'board-strings.js')), () => 'en');
}

test('every row the live boards were recorded with prints what it printed in v24067, in English and in French', (t) => {
  // (held while the rows' scripts are v24071's, as the comparison with
  // v24071 is: a later change that means a row to print otherwise is not
  // held to v24067)
  const moved = movedSinceBase();
  if (moved && moved.length) { t.skip('the rows\' scripts have changed since v24071 (' + moved.join(', ') + ')'); return; }
  const B = rowHelpers();
  assert.ok(ROWS.recorded.length >= 860, ROWS.recorded.length + ' rows');
  const bad = [];
  for (const [raw, code, en, fr] of ROWS.recorded) {
    const e = B.rowCity({ dest: raw, _locIata: code }, true, 'en'), f = B.rowCity({ dest: raw, _locIata: code }, true, 'fr');
    if (e !== en) bad.push(`${raw} | ${code}: '${en}' -> '${e}'`);
    if (f !== fr) bad.push(`${raw} | ${code} (fr): '${fr}' -> '${f}'`);
  }
  assert.deepEqual(bad, []);
  // a row the feed named keeps its words; a row with nothing but a code the
  // board's tables do not name prints the code, as it always has
  assert.equal(B.rowCity({ dest: 'Abidjan Felix Houphouet-Boigny | ABJ', _locIata: 'ABJ' }, true, 'en'), 'Abidjan Felix Houphouet-Boigny | ABJ');
  assert.equal(B.rowCity({ dest: 'ABJ', _locIata: 'ABJ' }, true, 'en'), 'ABJ');
  assert.equal(B.airportCityNameSafe_v21877('ABJ', 'en'), '', 'the rows\' tables do not name Abidjan');
});

// ── the floor names them ───────────────────────────────────────────────────

test('the map names a place CITY and CITY_FR do not name by its own table, whatever the row\'s words, and keeps the row\'s words for the rest', () => {
  const B = thisBoard();
  const BF = { formatCityIata: B.formatCityIata, stripCode: B._stripCityCode, tableCity: B.airportCityNameSafe_v21877, normalize: B.normalizeDisplayCity,
    inTables: (c) => !!(CITY[c] || CITY_FR[c]), placeName: PLACES.nameOf };
  for (const l of ['en', 'fr', 'de', 'ja']) {
    assert.equal(E.cityNameOf(BF, 'ABJ', 'Abidjan Felix Houphouet-Boigny | ABJ', l), 'Abidjan');
    assert.equal(E.cityNameOf(BF, 'ABJ', 'Abj | ABJ', l), 'Abidjan', 'a row that prints the code alone');
    assert.equal(E.cityNameOf(BF, 'BWE', 'Braunschweig/Wolfsburg | BWE', l), 'Braunschweig');
    assert.equal(E.cityNameOf(BF, 'NDJ', "N'djamena | NDJ", l), "N'Djamena");
  }
  // a place the board's tables name keeps its row's words, as before
  assert.equal(E.cityNameOf(BF, 'YUL', 'Montreal | YUL', 'fr'), 'Montréal');
  assert.equal(E.cityNameOf(BF, 'ORD', "Chicago · O'Hare | ORD", 'en'), 'Chicago');
  // a name that is its own code is a name (Ahe, Yap, Ufa), and a code no table names is not drawn
  for (const c of ['AHE', 'YAP', 'UFA', 'ABJ']) assert.equal(E.namedBy(BF, c, c), true, c);
  assert.equal(E.namedBy(BF, 'ZZZ', 'ZZZ'), false);
  assert.equal(E.namedBy(Object.assign({}, BF, { placeName: null }), 'AHE', 'AHE'), false, 'without the floor\'s table, as before');
  assert.match(MOD, /function hasName\(code, text\) \{[\s\S]{0,600}return \(nameSeen\[k\] = namedBy\(B, code, text\) && !misread\(B, code, text\)\);/);
});

test('a code the feed never sent is not drawn: Belgrade\'s LYBE reads YBE on the rows, and the map draws no line to Uranium City', () => {
  const B = thisBoard();
  const BF = { inTables: (c) => !!(CITY[c] || CITY_FR[c]), placeName: PLACES.nameOf, onlyHere: (c) => !boardAt(c) && own(PLACES.AT, c),
    readWords: (w) => B._iataFromCityName(w) || B._iataFromRowName(w) || '', at: coordsOf };
  for (const [code, words] of [['YBE', 'Belgrade Nikola Tesla | YBE'], ['SGG', 'Geneva Cointrin | SGG'], ['OMS', 'Muscat International | OMS'], ['GNS', 'Isle of Man | GNS']]) {
    assert.ok(BF.onlyHere(code), code + ' is placed by the floor\'s table alone');
    assert.equal(E.misread(BF, code, words), true, words);
  }
  // words that name the place, or no other place, or no words at all: drawn
  for (const [code, words] of [['AHN', 'Athens Ben Epps | AHN'], ['PRX', 'Paris Cox Field | PRX'], ['DJJ', 'Sentani | DJJ'], ['YBE', 'Ybe | YBE'], ['YBE', 'Uranium City | YBE'],
    ['ABJ', 'Abidjan Felix Houphouet-Boigny | ABJ'], ['AFW', 'Fort Worth Alliance | AFW'], ['YBE', '']]) assert.equal(E.misread(BF, code, words), false, words);
  // a place the board's own tables place is drawn as v24067 drew it
  assert.equal(E.misread(BF, 'BEG', 'Uranium City | BEG'), false);
  assert.equal(E.MISREAD_KM, 300);
});

// ── a name that is another place's too (v24073) ────────────────────────────

const kmApart = (a, b) => { const r = Math.PI / 180, d = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(Math.min(1, d))); };
const BS_ = require(path.join(JS, 'board-strings.js'));
const NINE = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
// the board's own (fids-earth.js boardFns regionName)
const regionNameOf = (cc, l) => { try { return new Intl.DisplayNames([BS_.intl(l)], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; } };

test('a name of the floor\'s table that CITY gives a place elsewhere is printed with where it is, in the language on screen; a city\'s own other airports keep its name', () => {
  // (read as a passenger reads them: without accents, case, punctuation or
  // the difference between St and Saint, so Mérida is Merida and Saint
  // Louis is St Louis)
  const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\b(SAINTE?|STE?)\b/g, 'ST').trim();
  assert.equal(fold('Mérida'), fold('MERIDA')); assert.equal(fold('Saint Louis'), fold('ST LOUIS')); assert.equal(fold('St. Thomas'), fold('St Thomas'));
  assert.notEqual(fold('La Grande-4'), fold('LA GRANDE'));
  const byFold = (T) => { const o = new Map(); for (const [d, v] of Object.entries(T)) { const k = fold(v); if (!o.has(k)) o.set(k, []); o.get(k).push(d); } return o; };
  const CITY_BY = byFold(CITY), CITY_FR_BY = byFold(CITY_FR);
  const namesakes = (c) => (CITY_BY.get(fold(PLACES.NAME[c])) || []).filter((d) => d !== c);
  const homonyms = Object.keys(PLACES.NAME).filter((c) => namesakes(c).length);
  assert.equal(homonyms.length, 211, 'the floor\'s names that CITY gives another place');
  assert.equal(Object.keys(PLACES.IN).length, 69);
  // (and none more by CITY_FR's names)
  assert.deepEqual(Object.keys(PLACES.NAME).filter((c) => !homonyms.includes(c) && (CITY_FR_BY.get(fold(PLACES.NAME[c])) || []).some((d) => d !== c)), []);
  for (const [c, w] of Object.entries(PLACES.IN)) {
    assert.ok(homonyms.includes(c), c + ' is one of them');
    assert.match(w, /^(US|CA)-[A-Z]{2}$|^[A-Z]{2}$/, c);
    assert.equal(/^(US|CA)-/.test(w) ? w.slice(0, 2) : w, CC[c] || (/^(US|CA)-/.test(w) ? w.slice(0, 2) : w), c + ': the country table agrees');
    // farther than 100 km from every place CITY gives the name, and in
    // another country (or, in the United States and Canada, maybe another
    // state or province)
    for (const d of namesakes(c)) {
      assert.ok(kmApart(coordsOf(c), coordsOf(d)) > 100, c + ' and ' + d);
      if (!/^(US|CA)-/.test(w) && CC[d]) assert.notEqual(CC[d], w, c + ' and ' + d + ' share a country');
    }
  }
  // the 142 others are the city's own other airports: within 100 km of a
  // place CITY gives the name, or in its country (Batajnica for Belgrade,
  // the Hong Kong heliport, Biggin Hill for London, Allegheny County for
  // Pittsburgh, North Island for San Diego)
  // (one the country table does not have: OurAirports puts Dejiang in
  // Guizhou with Tongren's other airport)
  const kept = homonyms.filter((c) => !own(PLACES.IN, c)), ccOf = (c) => CC[c] || { DEJ: 'CN' }[c];
  assert.equal(kept.length, 142);
  for (const c of kept) {
    const near = namesakes(c).some((d) => kmApart(coordsOf(c), coordsOf(d)) <= 100);
    assert.ok(near || namesakes(c).some((d) => CC[d] && CC[d] === ccOf(c)), c + ' ' + PLACES.NAME[c]);
  }
  for (const c of ['BJY', 'HHP', 'BQH', 'AGC', 'NZY', 'BLB']) assert.ok(kept.includes(c), c);
  // La Grande-4 is named as OurAirports names it, not as La Grande
  // Rivière's La Grande (YGL), 265 km away in the same province, where no
  // two letters could tell them apart
  assert.equal(PLACES.nameOf('YAH'), 'La Grande-4'); assert.ok(!homonyms.includes('YAH'));
  assert.ok(kmApart(coordsOf('YAH'), coordsOf('YGL')) > 260);
  // (Zhukovsky's Moscow and Ratmalana's Colombo share their names with the
  // floor's own Sheremetyevo and Bandaranaike, not with CITY: the same city)
  assert.equal(PLACES.nameOf('ZIA'), 'Moscow'); assert.equal(PLACES.nameOf('DWO'), 'Colombo');
  assert.deepEqual(Object.fromEntries(['YHG', 'LOZ', 'YQS', 'ONO', 'AHN', 'PRX', 'VLN', 'BLA', 'BQT', 'NCS', 'HLT', 'ZIC'].map((c) => [c, PLACES.inOf(c)])),
    { YHG: 'CA-NL', LOZ: 'US-KY', YQS: 'CA-ON', ONO: 'US-OR', AHN: 'US-GA', PRX: 'US-TX', VLN: 'VE', BLA: 'VE', BQT: 'BY', NCS: 'ZA', HLT: 'AU', ZIC: 'CL' });
  // the five that differ from CITY's by an accent or by St and Saint alone
  // (Mérida in Venezuela and Mexico's Merida, Córdoba in Spain and
  // Argentina's Cordoba, Concepción in Paraguay and Chile's Concepcion, Orán
  // in Argentina and Algeria's Oran, Saint Louis in Senegal and St Louis)
  assert.deepEqual(Object.fromEntries(['MRD', 'ODB', 'CIO', 'ORA', 'XLS'].map((c) => [c, [PLACES.inOf(c), namesakes(c).join()]])),
    { MRD: ['VE', 'MID'], ODB: ['ES', 'COR'], CIO: ['PY', 'CCP'], ORA: ['AR', 'ORN'], XLS: ['SN', 'STL'] });
  assert.equal(PLACES.inOf('yhg'), 'CA-NL'); assert.equal(PLACES.inOf('YYG'), ''); assert.equal(PLACES.inOf('ZIA'), '');

  // the floor prints them so, in the language on screen (the board's locale)
  const BF = { inTables: (c) => !!(CITY[c] || CITY_FR[c]), placeName: PLACES.nameOf, placeIn: PLACES.inOf, regionName: regionNameOf };
  const of = (c, l) => E.cityNameOf(BF, c, c + ' | ' + c, l);
  assert.equal(of('YHG', 'en'), 'Charlottetown, NL');
  assert.equal(of('LOZ', 'fr'), 'London, KY');
  assert.equal(of('YQS', 'en'), 'St Thomas, ON');
  assert.equal(of('ONO', 'de'), 'Ontario, OR');
  assert.equal(of('AHN', 'en'), 'Athens, GA');
  assert.equal(of('PRX', 'es'), 'Paris, TX');
  assert.equal(of('VLN', 'en'), 'Valencia, Venezuela');
  assert.equal(of('VLN', 'fr'), 'Valencia, Vénézuéla');
  assert.equal(of('BLA', 'it'), 'Barcelona, Venezuela');
  assert.equal(of('BQT', 'pt'), 'Brest, Bielorrússia');
  assert.equal(of('NCS', 'de'), 'Newcastle, Südafrika');
  assert.equal(of('HLT', 'es'), 'Hamilton, Australia');
  assert.equal(of('ZIC', 'fr'), 'Victoria, Chili');
  assert.equal(of('VLN', 'ja'), 'Valencia, ベネズエラ');
  assert.equal(of('VLN', 'zh'), 'Valencia, 委内瑞拉');
  assert.equal(of('VLN', 'ar'), 'Valencia, فنزويلا');
  assert.equal(of('LOZ', 'ja'), 'London, KY');
  assert.equal(of('MRD', 'es'), 'Mérida, Venezuela');
  assert.equal(of('ODB', 'en'), 'Córdoba, Spain');
  assert.equal(of('XLS', 'fr'), 'Saint Louis, Sénégal');
  assert.equal(of('ORA', 'de'), 'Orán, Argentinien');
  assert.equal(of('CIO', 'pt'), 'Concepción, Paraguai');
  assert.equal(of('YAH', 'en'), 'La Grande-4');
  for (const c of ['ZIA', 'BJY', 'DWO', 'HHP', 'YYG']) for (const l of NINE) assert.ok(!/,/.test(of(c, l)), c + ' ' + l + ': ' + of(c, l));
  // every country's name is the language's own, never the English one or
  // the code, in each of the nine
  for (const w of new Set(Object.values(PLACES.IN).filter((x) => !/^(US|CA)-/.test(x)))) {
    const n = NINE.map((l) => E.placeIn(BF, 'X', w, l));
    for (const [i, s] of n.entries()) assert.ok(!s.endsWith(' ' + w), w + ' in ' + NINE[i] + ': ' + s);
    assert.notEqual(n[6], n[0], w + ': Japanese is not English');
    assert.notEqual(n[8], n[0], w + ': Arabic is not English');
  }
  // without a country's name in the language (no Intl.DisplayNames), its two letters
  assert.equal(E.placeIn({}, 'Valencia', 'VE', 'fr'), 'Valencia, VE');
  assert.equal(E.placeIn({ regionName: () => '' }, 'Valencia', 'VE', 'fr'), 'Valencia, VE');
  // what a row's words are read against is the name itself (misread)
  assert.match(MOD, /var mine = wordsOf\(floorNameBare\(B, c, 'en'\)\)/);
  // and the browser's helpers give it (js/earth-places.js inOf; the
  // country's name in the board's locale, BoardStrings.intl)
  assert.match(MOD, /placeIn: function \(c\) \{ return \(PLACES && PLACES\.inOf\) \? PLACES\.inOf\(c\) : ''; \},/);
  assert.match(MOD, /regionName: function \(cc, l\) \{ var B = S\(\); try \{ return new Intl\.DisplayNames\(\[B\.intl\(l\)\], \{ type: 'region' \}\)\.of\(cc\) \|\| cc; \} catch \(e\) \{ return cc; \} \},/);
});

test('a longer name is measured with what it adds and placed by the same rules: Charlottetown and Charlottetown, NL on one floor', () => {
  const here = coordsOf('YQM');
  const P = E.placesFrom([{ _locIata: 'YYG', dest: 'Charlottetown | YYG', status: 'scheduled', _sortTs: Date.UTC(2026, 9, 20, 15) }, { _locIata: 'YHG', dest: 'Charlottetown | YHG', status: 'scheduled', _sortTs: Date.UTC(2026, 9, 20, 16) }],
    { dir: 'dep', ap0: 'YQM', now: Date.UTC(2026, 9, 20, 12), coords: coordsOf, tz: zoneOf });
  const BF = { inTables: (c) => !!(CITY[c] || CITY_FR[c]), placeName: PLACES.nameOf, placeIn: PLACES.inOf, regionName: regionNameOf, tableCity: (c) => (CITY[c] ? 'Charlottetown' : '') };
  const places = P.list.map((p) => { const names = ['en', 'fr'].map((l) => E.cityNameOf(BF, p.code, p.raw, l)); return Object.assign({}, p, { name: names[0], names }); });
  assert.deepEqual(places.map((p) => p.name), ['Charlottetown', 'Charlottetown, NL']);
  const W = 1920, H = 420, measure = (s, f) => String(s).length * f * 0.56;
  const view = E.chooseView(here, places, W, H);
  const L = E.layout({ view, W, H, here, full: true, places, timeOf: () => '', hereTz: 'America/Moncton', measure });
  const lab = L.labels.find((l) => l.code === 'YHG');
  assert.ok(lab, 'named');
  assert.equal(lab.rows[0].texts[0].s, 'Charlottetown, NL');
  assert.ok(lab.box.x1 - lab.box.x0 >= measure('Charlottetown, NL', lab.rows[0].texts[0].fs) - 0.01, 'its box holds the whole name');
  assert.ok(L.labels.some((l) => l.code === 'YYG' && l.rows[0].texts[0].s === 'Charlottetown'), 'and Prince Edward Island\'s is Charlottetown');
});
