#!/usr/bin/env node
'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE LIST OF THE AIRPORTS OF THE AMERICAS THE BOARDS CAN NAME
//
//   node scripts/names/americas-list.js      writes docs/airport-names-americas.md
//
// Every airport of North, Central and South America and the Caribbean that a
// board prints by name, with the name as the board prints it, read from the
// board's own code and tables, never typed here:
//   · the airports CITY and CITY_FR name (fids-current/js/fids-core.js);
//   · the airports only the map's table named until the boards read it too
//     (fids-current/js/earth-places.js NAME, label): the ones marked +.
// The list is the whole board script run in a page of its own (no screen, no
// network, no timers), asked for each code's row as a departures row prints
// it. tests/americas-airport-names.test.js holds the file to this script, so
// a name added to a table and not listed, or listed and not printed, fails.
//
// AN AIRPORT IS OF THE AMERICAS by its clock: a zone of America/, or one of
// the islands of the Americas the tz database files under an ocean (Bermuda,
// the Falklands, South Georgia, Galápagos, Easter Island, Hawaii); a place
// with no zone on purpose by its longitude, between 170°W and 30°W
// (earth-places.js americas, americasZone). Greenland is in: its zones are
// America/Nuuk, America/Thule and America/Scoresbysund.
//
// ITS COUNTRY is the board's country table's (_IATA_CC_GROUPS), else the
// country that table gives the other airports of its zone (a zone of the tz
// database lies in one country), else one of the few written below.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join('docs', 'airport-names-americas.md');
const BOARD_FILES = ['js/host-airport.js', 'js/board-strings.js', 'js/feed-router.js', 'js/earth-places.js', 'js/fids-core.js', 'js/airport-coords.js'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// The whole board script, with the scripts it reads first and the coordinates
// after it, as the pages load them, in a page of its own. `places: false`
// leaves the table of the Americas out, as a page that has not loaded it.
function board(root, opts) {
  const o = opts || {};
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
  const page = o.page || 'fids.html', search = '?ap=' + (o.ap || 'YQM');
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, localStorage: ls, sessionStorage: ls, document: nothing('document'),
    navigator: { userAgent: 'node', language: 'en' }, fetch: () => new Promise(() => {}), performance: { now: () => Date.now() },
    location: { search, hostname: 'localhost', href: 'http://localhost/' + page + search, pathname: '/' + page, origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of BOARD_FILES) {
    if (o.places === false && f === 'js/earth-places.js') continue;
    vm.runInContext(fs.readFileSync(path.join(root, 'fids-current', f), 'utf8'), ctx, { filename: f });
  }
  // the board's language (a `let` of fids-core.js's), and a table of its own
  vm.runInContext('var __setLang = function (l) { lang = l; }; var __table = function (n) { return eval(n); };', ctx);
  return ctx;
}

// The countries and territories of the Americas, as the list names them
// (English; the list is a document, not a screen).
const COUNTRY = {
  AG: 'Antigua and Barbuda', AI: 'Anguilla', AR: 'Argentina', AW: 'Aruba', BB: 'Barbados', BL: 'Saint Barthélemy', BM: 'Bermuda', BO: 'Bolivia',
  BQ: 'Caribbean Netherlands', BR: 'Brazil', BS: 'Bahamas', BZ: 'Belize', CA: 'Canada', CL: 'Chile', CO: 'Colombia', CR: 'Costa Rica', CU: 'Cuba',
  CW: 'Curaçao', DM: 'Dominica', DO: 'Dominican Republic', EC: 'Ecuador', FK: 'Falkland Islands', GD: 'Grenada', GF: 'French Guiana', GL: 'Greenland',
  GP: 'Guadeloupe', GT: 'Guatemala', GY: 'Guyana', HN: 'Honduras', HT: 'Haiti', JM: 'Jamaica', KN: 'Saint Kitts and Nevis', KY: 'Cayman Islands',
  LC: 'Saint Lucia', MF: 'Saint Martin', MQ: 'Martinique', MS: 'Montserrat', MX: 'Mexico', NI: 'Nicaragua', PA: 'Panama', PE: 'Peru',
  PM: 'Saint Pierre and Miquelon', PR: 'Puerto Rico', PY: 'Paraguay', SR: 'Suriname', SV: 'El Salvador', SX: 'Sint Maarten', TC: 'Turks and Caicos Islands',
  TT: 'Trinidad and Tobago', US: 'United States', UY: 'Uruguay', VC: 'Saint Vincent and the Grenadines', VE: 'Venezuela', VG: 'British Virgin Islands',
  VI: 'U.S. Virgin Islands'
};
// A zone with no airport in the board's country table, and the airports with
// no zone and no entry there (Swift Current; Carauari in Amazonas;
// Musselwhite in Ontario, under its two codes)
const ZONE_COUNTRY = { 'America/Swift_Current': 'CA' };
const CODE_COUNTRY = { CAF: 'BR', YMU: 'CA', KM8: 'CA' };

function build(root) {
  const B = board(root || ROOT);
  const P = B.FIDS_EARTH_PLACES;
  const E = require(path.join(root || ROOT, 'fids-current', 'js', 'fids-earth.js'));
  const T = (n) => B.__table(n);
  const CITY = T('CITY'), CITY_FR = T('CITY_FR'), AP = T('AP'), COORDS = T('COORDS'), GATE_AP = T('GATE_AP'), GROUPS = T('_IATA_CC_GROUPS');
  const CC = {};
  for (const cc of Object.keys(GROUPS)) String(GROUPS[cc]).split(/\s+/).forEach((c) => { if (c) CC[c] = cc; });
  const pair = (v) => (v ? [+(v.lat != null ? v.lat : v[0]), +(v.lon != null ? v.lon : (v.lng != null ? v.lng : v[1]))] : null);
  const at = (c) => pair(COORDS[c]) || pair((B.AIRPORT_COORDS || {})[c]) || pair(GATE_AP[c]) || pair(P.AT[c]);
  const zoneOf = (c) => E.zoneOf(c, (AP[c] && AP[c].tz) || null, P.zones) || '';
  const ofAmericas = (c) => {
    const z = zoneOf(c);
    if (z) return P.americasZone(z);
    const p = at(c);
    return !!p && p[1] > -170 && p[1] < -30;
  };
  const codes = [...new Set(Object.keys(CITY).concat(Object.keys(CITY_FR), Object.keys(P.NAME)))].filter((c) => /^[A-Z0-9]{3}$/.test(c)).sort();
  const listed = codes.filter((c) => ofAmericas(c) && (CITY[c] || CITY_FR[c] || P.label(c, 'en')));
  // a zone's country: the one the country table gives its airports
  const zoneCountry = Object.assign({}, ZONE_COUNTRY);
  for (const c of listed) {
    const z = zoneOf(c);
    if (!z || !CC[c]) continue;
    if (zoneCountry[z] && zoneCountry[z] !== CC[c]) throw new Error('the zone ' + z + ' is in two countries of the country table: ' + zoneCountry[z] + ' and ' + CC[c] + ' (' + c + ')');
    zoneCountry[z] = CC[c];
  }
  const printed = (c, l) => { B.__setLang(l); return String(B._stripCityCode(B.formatCityIata(c, c, l)) || ''); };
  const rows = listed.map((c) => {
    const cc = CC[c] || zoneCountry[zoneOf(c)] || CODE_COUNTRY[c] || '';
    if (!own(COUNTRY, cc)) throw new Error(c + ': no country (' + (cc || 'none') + ', ' + (zoneOf(c) || 'no zone') + ')');
    const en = printed(c, 'en');
    if (!en || (en.toUpperCase() === c && String(CITY[c] || P.NAME[c] || '').toUpperCase() !== c)) throw new Error(c + ' prints no name: ' + en);
    // In French, where a table of the board's writes the name otherwise. A
    // name printed with its country ('Valencia, Venezuela') carries the
    // country in the language on screen, which is the browser's to write
    // (Intl.DisplayNames), not a table's: it is not listed, so that the list
    // reads the same wherever it is written.
    const byCountry = /^[A-Z]{2}$/.test(P.inOf(c)) && !(CITY[c] || CITY_FR[c]);
    const fr = byCountry ? en : printed(c, 'fr');
    return { code: c, shown: String(B._dispIata(c)), en, fr: fr !== en ? fr : '', cc, country: COUNTRY[cc], zone: zoneOf(c), added: !(CITY[c] || CITY_FR[c]) };
  });
  B.__setLang('en');
  rows.sort(order);
  return { rows, text: markdown(rows) };
}
// By country, then by name, then by code: read without accents, capitals or
// punctuation, letter by letter (the same order on every machine, which a
// locale's own collation is not)
const sortKey = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cmp = (a, b) => (a < b ? -1 : (a > b ? 1 : 0));
function order(a, b) {
  return cmp(sortKey(a.country), sortKey(b.country)) || cmp(sortKey(a.en), sortKey(b.en)) || cmp(a.en, b.en) || cmp(a.code, b.code);
}

function markdown(rows) {
  const n = (x) => x.toLocaleString('en-US');
  const added = rows.filter((r) => r.added).length;
  const countries = [...new Set(rows.map((r) => r.country))];
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  const out = [
    '# ' + n(rows.length) + ' airports of the Americas have a name on the boards; ' + n(added) + ' of them were added by the change that wrote this list',
    '',
    'Every airport of North America, Central America, the Caribbean and South America that the boards print by name:',
    'the gate\'s destination and origin, its map label, the departures and arrivals rows, the belt sign, the companion',
    'app and the destination card. An airport is of the Americas by its clock: a zone of `America/`, or Bermuda, the',
    'Falklands, Galápagos, Easter Island or Hawaii (Greenland\'s zones are `America/`, so it is in).',
    '',
    '- **Name on the boards** is what a departures row prints before the code, in English.',
    '- **In French** is filled only where a French board prints the name otherwise (a country after a comma is',
    '  written in the language on screen, and is listed in English only).',
    '- **+** marks the ' + n(added) + ' airports named since the boards read the map\'s table of names',
    '  (`fids-current/js/earth-places.js`, from OurAirports, public domain). Before that they printed their',
    '  three-letter code: a gate to Río Hato read "Rih". The other ' + n(rows.length - added) + ' are named by the board\'s own tables',
    '  (`CITY` and `CITY_FR` in `fids-current/js/fids-core.js`).',
    '- Where a name is another place\'s too, it is printed with its state, province or country, as the map under the',
    '  rows prints it ("London, KY", "Valencia, Venezuela"). A city\'s second airport takes the city\'s name.',
    '',
    'This file is written by `node scripts/names/americas-list.js` from the board\'s own code and tables, and',
    '`tests/americas-airport-names.test.js` fails when the two differ. ' + n(countries.length) + ' countries and territories, sorted by country,',
    'then by name.',
    '',
    '| Code | Name on the boards | In French | Country or territory | |',
    '|---|---|---|---|---|'
  ];
  for (const r of rows) {
    out.push('| ' + [r.code + (r.shown && r.shown !== r.code ? ' (printed ' + r.shown + ')' : ''), cell(r.en), cell(r.fr), r.country, r.added ? '+' : ''].join(' | ') + ' |');
  }
  return out.join('\n') + '\n';
}

module.exports = { board, build, markdown, order, OUT, BOARD_FILES, COUNTRY };

if (require.main === module) {
  const { rows, text } = build(ROOT);
  fs.writeFileSync(path.join(ROOT, OUT), text);
  console.log(OUT + ': ' + rows.length + ' airports, ' + rows.filter((r) => r.added).length + ' added');
}
