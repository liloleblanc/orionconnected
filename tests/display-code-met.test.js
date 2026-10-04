'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23937 — MONTRÉAL SAINT-HUBERT READS "MET" WHEREVER A PASSENGER SEES A CODE.
//
// The airport is YHU to IATA (CYHU to ICAO), to its own feed, to FR24 and to
// every table here, and MET (Montréal Métropolitain) on its own terminal and
// on Moncton's airport site. The gate's inbound line already said
// "de Montreal | MET" (the feed's own words) while the map beside it, the big
// map's caption, the belts and the phone cards said YHU.
//
// One table (host-airport.js, the first script every board loads) answers
// "which letters do passengers see"; every lookup keeps YHU.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'fids-current');
const read = (p) => fs.readFileSync(path.join(PUB, p), 'utf8');
const HOST = read('js/host-airport.js');
const CORE = read('js/fids-core.js');
const JS = CORE.replace(/^\s*\/\/.*$/gm, '');

function hostWindow() {
  const win = { location: { hostname: 'fids.orionconnected.com' } };
  const store = {};
  new Function('window', 'sessionStorage', HOST)(win, { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] || null });
  return win;
}

function blockOf(head) {
  const at = JS.indexOf(head);
  assert.ok(at >= 0, `fids-core.js must define ${head}`);
  let d = 0;
  for (let k = JS.indexOf('{', at); k < JS.length; k++) {
    if (JS[k] === '{') d++;
    else if (JS[k] === '}') { d--; if (d === 0) return JS.slice(at, k + 1); }
  }
  assert.fail(`unterminated ${head}`);
}

/** The board's own city/code helpers, run out of fids-core.js. */
function helpers() {
  const win = hostWindow();
  const tail = JS.slice(JS.indexOf('var _CITY_CODE_TAIL = '), JS.indexOf('\n', JS.indexOf('var _CITY_CODE_TAIL = ')));
  const src = [
    "var AIRPORT_DISPLAY_IATA = (typeof window !== 'undefined' && window.FIDS_DISPLAY_IATA) || {};",
    tail,
    blockOf('function _stripCityCode(s)'),
    blockOf('function _cityHasCode(s, code)'),
    blockOf('function _dispIata(code)'),
    blockOf('function _realIata(code)'),
    blockOf('function _dispCityLabel(s)'),
    blockOf('function airportCityNameSafe_v21877(code, langOverride)'),
    blockOf('function _isRealApCode(code)'),
    blockOf('function normalizeDisplayCity(raw, iata)'),
    blockOf('function formatCityIata(raw, iata, langOverride)'),
    blockOf('function cityCode(iata, overrideCity, langOverride)'),
    'return { formatCityIata, normalizeDisplayCity, cityCode, _dispIata, _realIata, _dispCityLabel, _isRealApCode };'
  ].join('\n');
  const CITY = { YHU: 'MONTREAL', YUL: 'MONTREAL', YQM: 'MONCTON', YYZ: 'TORONTO', YTZ: 'TORONTO' };
  const tc = (s) => String(s).toLowerCase().replace(/(^|[\s\-/.])(\S)/g, (m, p, c) => p + c.toUpperCase());
  // _iataFromCityName is ambiguous for Montreal (YUL and YHU) and returns ''.
  return new Function('window', 'CITY', 'CITY_FR', 'CITY_ES', 'AP', 'GATE_AP', 'AIRPORT_COORDS', 'tc', 'getLang', '_iataFromCityName', src)(
    win, CITY, {}, {}, { YHU: { city: 'Montreal' } }, {}, {}, tc, () => 'en', () => '');
}

test('the one table: YHU shows as MET, every other code as itself', () => {
  const win = hostWindow();
  assert.deepEqual(win.FIDS_DISPLAY_IATA, { YHU: 'MET' });
  assert.equal(win.fidsDisplayIata('YHU'), 'MET');
  assert.equal(win.fidsDisplayIata('yhu'), 'MET', 'case is not the caller\'s problem');
  for (const c of ['YQM', 'YUL', 'YYZ', 'YTZ', 'MET', '', null]) assert.equal(win.fidsDisplayIata(c), c);
  assert.equal(win.fidsRealIata('MET'), 'YHU', 'a label read back resolves to the real code');
  assert.equal(win.fidsRealIata('YUL'), 'YUL');
});

test('there is ONE table: fids-core.js reads host-airport.js rather than keeping its own', () => {
  assert.match(CORE, /var AIRPORT_DISPLAY_IATA = \(typeof window !== 'undefined' && window\.FIDS_DISPLAY_IATA\) \|\| \{\};/);
  for (const f of walk(PUB).filter((f) => /\.(js|html)$/.test(f))) {
    if (f.endsWith(path.join('js', 'host-airport.js'))) continue;
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\bYHU\s*:\s*['"]MET['"]/, `${path.relative(PUB, f)} keeps its own YHU→MET map; use host-airport.js`);
  }
  // and every board loads it before anything that prints a code
  for (const p of ['fids.html', 'gids.html', 'bids.html', 'app.html']) {
    const html = read(p);
    const host = html.indexOf('js/host-airport.js?v=');
    assert.ok(host >= 0, `${p} loads host-airport.js`);
    for (const later of ['js/feed-router.js', 'js/fids-core.js', '· LOADING']) {
      const at = html.indexOf(later);
      if (at >= 0) assert.ok(at > host, `${p}: ${later} comes after host-airport.js`);
    }
  }
});

test('the board\'s city labels carry MET, and never YHU', () => {
  const h = helpers();
  const shown = [
    h.formatCityIata('Montreal', 'YHU'),
    h.formatCityIata('MONTREAL', 'YHU'),
    h.formatCityIata('Montreal -MET', 'YHU'),       // cyqm.ca's own spelling
    h.formatCityIata('Montreal | YHU', 'YHU'),
    h.formatCityIata('Montreal | MET'),              // our label, read back with no code
    h.formatCityIata('Montreal (MET)'),
    h.cityCode('YHU'),
    h.cityCode('YHU', 'Montreal | MET'),
    h.cityCode('YHU', 'MET'),
    h.cityCode('MET')
  ];
  for (const s of shown) {
    assert.equal(s, 'Montreal | MET', `got ${JSON.stringify(s)}`);
    assert.doesNotMatch(s, /\bYHU\b/);
  }
  // the label goes back in clean: no doubled code, no "Montreal Met"
  assert.equal(h.normalizeDisplayCity('Montreal | MET', 'YHU'), 'Montreal');
  assert.equal(h.normalizeDisplayCity('Montreal | MET'), 'Montreal');
  assert.equal(h.normalizeDisplayCity('Montreal -MET', 'YHU'), 'Montreal');
  assert.equal(h._dispCityLabel('Montreal | YHU'), 'Montreal | MET');
  assert.equal(h._dispCityLabel('Montreal (YHU)'), 'Montreal | MET');
  assert.equal(h._dispCityLabel('Toronto | YYZ'), 'Toronto | YYZ');
});

test('every other airport is printed exactly as before', () => {
  const h = helpers();
  assert.equal(h.formatCityIata('Toronto', 'YYZ'), 'Toronto | YYZ');
  assert.equal(h.formatCityIata('Montreal', 'YUL'), 'Montreal | YUL');
  assert.equal(h.cityCode('YQM'), 'Moncton | YQM');
  assert.equal(h.normalizeDisplayCity('Goose Bay'), 'Goose Bay', 'a trailing word is still only a code if we know it');
  assert.equal(h._isRealApCode('MET'), true, 'MET is a code we print, so it is never folded into a city name');
  assert.equal(h._isRealApCode('BAY'), false);
});

test('every surface that prints a code asks the table', () => {
  // the maps: every permanent label on the gate map and the big map
  const tips = CORE.match(/\.bindTooltip\(([^,]+),/g) || [];
  assert.ok(tips.length >= 10, `expected the ten map labels, found ${tips.length}`);
  for (const t of tips) assert.match(t, /\.bindTooltip\(_dispIata\(/, `map label ${t} prints a raw code`);
  // the big map's caption, the belts, the board rows, the phone views, the
  // weather lines, the gate clock, the board header pill, the flip chips
  const sites = [
    /var _capPlc = _dispIata\(_dispCityLabel\(/,
    /_b3Code = _dispIata\(/,
    /<span class="dest-iata">' \+ fidsEscHtml\(_dispIata\(code\)\)/,
    /<span class="dest-iata">' \+ _dispIata\(_tailCode\.toUpperCase\(\)\)/,
    /<span class="dest-iata">' \+ _dispIata\(_iataUp\)/,
    /<span class="v2-fi-code v2-rc-iata">' \+ _dispIata\(c\)/,
    /<span class="v2-fi-code v2-rc-iata">' \+ _dispIata\(_tail\)/,
    /<span class="octb-ap">' \+ _e\(String\(_dispIata\(iata\)\)/,
    /<div class="fids-airport-iata">' \+ _dispIata\(iata\)/,
    /if \(_aIata\) _aIata\.textContent = _dispIata\(iata\);/,
    /return \{ c: name, ia: _dispIata\(ia\) \};/,
    /'<div class="v2-wx-lbl">' \+ \(locIata \? _dispIata\(locIata\)/,
    /return code \? \(city \+ ' \| ' \+ _dispIata\(code\)\) : city;/,
    /\(' \+ _dispIata\(code\) \+ '\)<\/span>/
  ];
  for (const re of sites) assert.match(CORE, re);
  // the boot splash (before fids-core.js exists) and the banner in fids-v2.js
  for (const p of ['fids.html', 'gids.html', 'bids.html']) {
    assert.match(read(p), /if \(ap && window\.fidsDisplayIata\) ap = String\(window\.fidsDisplayIata\(ap\)\);/, p);
  }
  assert.match(read('js/fids-v2.js'), /window\.fidsDisplayIata \? window\.fidsDisplayIata\(iata\) : iata/);
  // the companion app's codes
  const app = read('app.html');
  assert.match(app, /function dispIata\(c\)\{return \(window\.fidsDisplayIata\?window\.fidsDisplayIata\(c\):c\);\}/);
  assert.doesNotMatch(app, /esc\(f\.cityIata\|\|''\)/, 'the app prints f.cityIata through dispIata');
  assert.doesNotMatch(app, /<div class="code">'\+esc\(CURAP\)/);
});

test('lookups keep YHU: coordinates, feeds, FR24 and the airport tables are untouched', () => {
  assert.match(read('js/airport-coords.js'), /YHU:\[45\.52,-73\.42\]/);
  assert.match(read('js/feed-router.js'), /if \(iata === 'YHU'\) \{/);
  assert.match(read('js/feed-router.js'), /const home = \{ iata: 'YHU', icao: 'CYHU'/);
  assert.match(CORE, /YHU:\{ name:'Montréal Saint-Hubert Airport \(MET\)'/);
  assert.match(CORE, /YHU:\[45\.52,-73\.42\]/);
  assert.doesNotMatch(CORE, /\bMET:\s*\[/, 'no coordinate is keyed MET');
  assert.match(fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8'), /"MONTREAL-MET": "YHU"/);
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return /^(logos|aircraft|fonts|assets|textures|patterns|data)$/.test(e.name) ? [] : walk(full);
    return [full];
  });
}
