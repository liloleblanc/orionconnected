'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24069 — °C OR °F IS THE AIRPORT'S COUNTRY'S, IN EVERY LANGUAGE.
//
// The departures board's paging clock set the unit by the language slide: the
// first language read °C and every later one °F, unless the airport was one of
// the Spanish-speaking (Bolivian) ones. Québec City (French, then English) read
// 16°C in French and 61°F in English (2026-10-19, v24067); Halifax read °F in
// French, and Chicago, a Fahrenheit country, read °C in English. The gate's
// weather card had its own rule (a time-zone table) and the companion app
// always printed °C.
//
// Now one rule, BoardStrings.tempUnit: Fahrenheit for an airport in the United
// States or one of its territories, Celsius everywhere else, whatever language
// is on the screen. Every surface reads it: displayTemp (the departures rows,
// the header, the BIDS, the phone list, the gate's other weather lines), the
// gate's weather card, and the companion app.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'fids-current');
const CORE = fs.readFileSync(path.join(PUB, 'js/fids-core.js'), 'utf8');
const APP = fs.readFileSync(path.join(PUB, 'app.html'), 'utf8');
const BS = require(path.join(PUB, 'js/board-strings.js'));

function blockOf(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, `must define ${head}`);
  let d = 0;
  for (let k = src.indexOf('{', at); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(at, k + 1); }
  }
  assert.fail(`unterminated ${head}`);
}
// `const NAME = {…};` (or an IIFE) as source, to its closing `;`
function constOf(head) {
  const at = CORE.indexOf(head);
  assert.ok(at >= 0, `fids-core.js must define ${head}`);
  const end = CORE.indexOf('\n};', at);
  const iife = CORE.indexOf('\n})();', at);
  const stop = (iife > 0 && (end < 0 || iife < end)) ? iife + 6 : end + 3;
  return CORE.slice(at, stop);
}

// The board's own country table, airport table and unit rule, run out of
// fids-core.js, with the page airport the caller names.
function board(pageAp) {
  const src = [
    constOf('const _IATA_CC_GROUPS = {'),
    constOf('const _IATA_CC = (function () {'),
    CORE.slice(CORE.indexOf('const _CC_PARENT = '), CORE.indexOf('\n', CORE.indexOf('const _CC_PARENT = '))),
    CORE.slice(CORE.indexOf('const _US_Y_IATA = '), CORE.indexOf('\n', CORE.indexOf('const _US_Y_IATA = '))),
    blockOf(CORE, 'function airportCountry(iata)'),
    'var AP = ' + blockOf(CORE, 'const AP = {').slice('const AP = '.length) + ';',
    'var COORDS = {};',
    blockOf(CORE, 'function boardTempUnitFor(iata)'),
    blockOf(CORE, 'function _boardTempUnit()'),
    'var tempUnit = "F";',          // what the old paging clock left behind on a second slide
    blockOf(CORE, 'function displayTemp(c)'),
    'this.out = { airportCountry: airportCountry, boardTempUnitFor: boardTempUnitFor, displayTemp: displayTemp, AP: AP };'
  ].join('\n');
  const ctx = { BoardStrings: BS, window: {}, _pageAirport: () => pageAp };
  vm.runInNewContext(src, ctx);
  return ctx.out;
}

test('the store: Fahrenheit for the United States and its territories, Celsius everywhere else', () => {
  for (const cc of ['US', 'PR', 'VI', 'GU', 'MP', 'AS', 'UM']) assert.equal(BS.tempUnit(cc, ''), 'F', cc);
  for (const cc of ['CA', 'GB', 'IE', 'CH', 'IS', 'AU', 'NZ', 'FR', 'MX', 'BO', 'BS', 'JM', 'DO', 'AW', 'JP']) assert.equal(BS.tempUnit(cc, ''), 'C', cc);
  // the country wins over the time zone; the zone only places a code nothing else knows
  assert.equal(BS.tempUnit('CA', 'America/New_York'), 'C');
  assert.equal(BS.tempUnit('', 'America/Chicago'), 'F');
  assert.equal(BS.tempUnit('', 'Pacific/Honolulu'), 'F');
  assert.equal(BS.tempUnit('', 'America/Puerto_Rico'), 'F');
  for (const tz of ['America/Toronto', 'America/Halifax', 'America/Moncton', 'Europe/London', 'Australia/Sydney', 'America/Cancun', '']) assert.equal(BS.tempUnit('', tz), 'C', tz);
  // whole degrees, Celsius rounded first, as the boards always printed it
  assert.equal(BS.temp(16, 'C'), '16°C');
  assert.equal(BS.temp(15.6, 'C'), '16°C');
  assert.equal(BS.temp(16, 'F'), '61°F');
  assert.equal(BS.temp(-3.4, 'F'), '27°F');
  assert.equal(BS.temp(undefined, 'C'), '');
});

test('a Canadian board is °C in every language, an American one °F in every language', () => {
  // Québec City, the reported board: °C on its French slide AND its English one
  // (the old clock left tempUnit at 'F' on the English slide; displayTemp no
  // longer reads it)
  assert.equal(board('YQB').displayTemp(16), '16°C');
  // Celsius countries
  for (const ap of ['YQB', 'YUL', 'YRJ', 'YQM', 'YHZ', 'YYZ', 'YVR', 'LHR', 'EDI', 'DUB', 'ZRH', 'KEF', 'SYD', 'HBA', 'AKL', 'LPB', 'CUN', 'NAS']) {
    const b = board(ap);
    assert.equal(b.boardTempUnitFor(ap), 'C', ap + ' (' + b.airportCountry(ap) + ')');
    assert.equal(b.displayTemp(20), '20°C', ap);
  }
  // Fahrenheit: the United States and its territories
  for (const ap of ['ORD', 'MCO', 'JFK', 'DCA', 'SEA', 'PHX', 'HNL', 'OGG', 'ANC', 'SJU', 'STT', 'GUM']) {
    const b = board(ap);
    assert.equal(b.boardTempUnitFor(ap), 'F', ap + ' (' + b.airportCountry(ap) + ')');
    assert.equal(b.displayTemp(20), '68°F', ap);
  }
});

test('every airport the boards know reads the unit of its own country', () => {
  const b = board('');
  const us = new Set(['US']);
  for (const ap of Object.keys(b.AP)) {
    const cc = b.airportCountry(ap);
    const want = cc ? (us.has(cc) ? 'F' : 'C') : BS.tempUnit('', b.AP[ap].tz);
    assert.equal(b.boardTempUnitFor(ap), want, ap + ' ' + cc + ' ' + b.AP[ap].tz);
    // an airport in a US time zone is a US airport, and the reverse (the two
    // tables agree, so the app's time-zone reading matches the boards')
    assert.equal(BS.tempUnit('', b.AP[ap].tz), b.boardTempUnitFor(ap), ap + ': its zone says the same as its country');
  }
});

test('no surface picks the unit by the language slide any more', () => {
  const tick = blockOf(CORE, 'function tick_carousel()');
  assert.doesNotMatch(tick, /_slideIdx === 0\) \? 'C'/, 'the first-slide-Celsius flip is gone');
  assert.match(tick, /tempUnit = boardTempUnitFor\(_ap\);/);
  assert.doesNotMatch(CORE, /function boardMetricFor\(/);
  assert.match(blockOf(CORE, 'function displayTemp(c)'), /return BoardStrings\.temp\(c, _boardTempUnit\(\)\);/);
  // the BIDS render key carries the airport's unit
  assert.match(CORE, /unit: _boardTempUnit\(\), portrait: _b5Portrait\(\),/);
  // the gate's weather card: the same rule, not a second table
  const card = blockOf(CORE, 'function _renderWxCard(el)');
  assert.match(card, /var _wxUnit = boardTempUnitFor\(window\._gateIata \|\| _pageAirport\(\)\);/);
  assert.match(card, /var dT = function \(v\) \{ return BoardStrings\.temp\(v, _wxUnit\); \};/);
  assert.doesNotMatch(CORE, /_WX_F_TZ/);
  // nothing else in the board builds a unit of its own
  const code = CORE.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\* 9 ?\/ ?5 \+ 32/, 'the only Fahrenheit conversion is the store\'s');
});

test('the companion app prints the unit of the airport it shows', () => {
  const fn = (name) => {
    const at = APP.search(new RegExp('\\nfunction ' + name + '\\('));
    assert.ok(at >= 0, name);
    return APP.slice(at + 1, APP.indexOf('}', APP.indexOf('return', at)) + 1);
  };
  const src = 'var AIRPORTS = ' + APP.match(/\nconst AIRPORTS=(\{[\s\S]*?\n\});/)[1] + ';\n'
    + 'var CURAP = "YQM"; var WX = {};\n' + fn('wxUnit') + '\n' + fn('wxTemp') + '\nthis.out = { wxTemp: wxTemp, set: function (c) { CURAP = c; }, WX: WX, AIRPORTS: AIRPORTS };';
  const ctx = { BoardStrings: BS };
  vm.runInNewContext(src, ctx);
  const app = ctx.out;
  app.WX.YYZ = { t: 16.2 };
  for (const ap of ['YQM', 'YQB', 'YUL', 'LHR', 'SYD', 'CUN']) { app.set(ap); assert.equal(app.wxTemp('YYZ'), '16°C', ap); }
  for (const ap of ['ORD', 'MCO', 'HNL', 'SJU']) { app.set(ap); assert.equal(app.wxTemp('YYZ'), '61°F', ap); }
  assert.doesNotMatch(APP, /Math\.round\(w\.t\)\+'°C'/, 'the fixed Celsius is gone');
});
