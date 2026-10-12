'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24030 — THE COMPANION APP (app.html) TELLS THE TRUTH, IN NINE LANGUAGES.
//
// Worked on 2026-10-10, which answers decision D6 ("translate now, or leave
// it to its replacement": now). It used to:
//   - make statuses up from the clock: Boarding 45 minutes out, Final call
//     at 12, Departed 2 minutes after the time, whatever the airport said;
//   - show the printed time only, never the airport's new one;
//   - print a 24-hour clock in English, and a far-end "Arr" time that was
//     this airport's own time again;
//   - speak three languages;
//   - load Inter from Google; leave its tab bar white in dark mode; say
//     "No departures right now" while it was still loading.
// The status is now the boards' rule (fids-core.js adbStatus), times read the
// boards' clock (BoardStrings.boardTime), and every word comes from the store.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BS = require('../fids-current/js/board-strings.js');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'fids-current/app.html'), 'utf8');

function fn(name) {
  const at = APP.search(new RegExp('\\nfunction ' + name + '\\('));
  assert.ok(at >= 0, name + ' must exist');
  let i = APP.indexOf('{', at), d = 0;
  for (; i < APP.length; i++) {
    const c = APP[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < APP.length && APP[i] !== q; i++) if (APP[i] === '\\') i++; continue; }
    if (c === '/' && APP[i + 1] === '/') { i = APP.indexOf('\n', i); continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return APP.slice(at + 1, i + 1);
  }
  throw new Error(name);
}
const line = (re) => { const m = APP.match(re); assert.ok(m, String(re)); return m[0]; };

// adbToCard with the tables it reads stubbed
const card = new Function(['REGIONAL_FAM', 'AIRLINE', 'BRAND', 'REGIONAL_OP', 'wmUrls'],
  fn('adbHHMM') + fn('inferOperator') + fn('adbToCard') + '; return adbToCard;')({}, {}, {}, {}, () => null);
const MIN = 60000;
const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
const loc = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
function row(o) {
  const dep = Date.now() + (o.inMin || 0) * MIN;
  const d = { scheduledTime: { utc: iso(dep), local: loc(dep) } };
  if (o.revMin != null) { const r = dep + o.revMin * MIN; d.revisedTime = { utc: iso(r), local: loc(r) }; }
  if (o.runwayAgo != null) { const r = Date.now() - o.runwayAgo * MIN; d.runwayTime = { utc: iso(r), local: loc(r) }; }
  return { number: 'AC 123', airline: { iata: 'AC' }, status: o.status || '', departure: d, arrival: { airport: { iata: 'YYZ' } } };
}

test('a status is the airport\'s word, never the clock\'s', () => {
  // ten minutes out, the feed saying only Scheduled: no Boarding, no Final call
  assert.equal(card(row({ inMin: 10, status: 'Scheduled' }), 'dep').state, 'scheduled');
  assert.equal(card(row({ inMin: 40, status: '' }), 'dep').state, 'scheduled');
  // past its time with nothing said: still not Departed
  assert.equal(card(row({ inMin: -6, status: 'Scheduled' }), 'dep').state, 'scheduled');
  // the feed's own words
  assert.equal(card(row({ inMin: 20, status: 'Boarding' }), 'dep').state, 'boarding');
  assert.equal(card(row({ inMin: 5, status: 'Final Call' }), 'dep').state, 'final');
  assert.equal(card(row({ inMin: 20, status: 'OnTime' }), 'dep').state, 'ontime');
  assert.equal(card(row({ inMin: 20, status: 'Expected' }), 'dep').state, 'expected');
  assert.equal(card(row({ inMin: -60, status: 'Arrived' }), 'dep').state, 'departed', '"Arrived" on a departure is a departure');
  assert.equal(card(row({ inMin: 20, status: 'Canceled' }), 'dep').state, 'cancelled');
  // an actual runway time is evidence
  assert.equal(card(row({ inMin: -10, runwayAgo: 3 }), 'dep').state, 'departed');
  // a moved time: Delayed (5 minutes or more), with the new time
  const late = card(row({ inMin: 20, revMin: 40 }), 'dep');
  assert.equal(late.state, 'delayed');
  assert.notEqual(late.estTime, late.schedTime);
  assert.equal(card(row({ inMin: 20, revMin: 3 }), 'dep').state, 'scheduled');
  assert.equal(card(row({ inMin: 30, revMin: -10 }), 'dep').state, 'early');
  // and the clock's old rules are gone
  assert.doesNotMatch(APP, /_mins<=12\)state='final'|_mins<=45\)state='boarding'|state='outgate'/);
});

test('every status has its word, Scheduled and Expected in no status colour', () => {
  const ST = new Function(line(/^const ST_WORD=\{[\s\S]*?\};/m) + '; return ST_WORD;')();
  for (const k of ['cancelled', 'diverted', 'departed', 'active', 'arrived', 'boarding', 'final', 'gateclosed', 'delayed', 'early', 'ontime', 'expected', 'scheduled']) assert.ok(ST[k], k);
  assert.equal(ST.scheduled[1], 'neutral');
  assert.equal(ST.expected[1], 'neutral');
  assert.match(APP, /\.st\.neutral\{color:var\(--muted\);\}/);
});

test('times read the boards\' clock: 12-hour in English, 24-hour in the other eight', () => {
  const mk = (L) => new Function('window', 'langRes', 'esc', fn('clk') + '; return clk;')({ BoardStrings: BS }, () => L, String);
  assert.equal(mk('en')('15:09'), '3:09<small>PM</small>');
  for (const L of ['fr', 'es', 'de', 'ja', 'ar']) assert.equal(mk(L)('15:09'), '15:09', L);
  assert.match(APP, /const otherLine=\(f\.otherTime&&f\.durMin>0\)/, 'a far-end time only when it is real');
});

test('every word of the app is in the store, in all nine languages', () => {
  const map = new Function(line(/^const APP_KEY=\{[^\n]*\};/m) + '; return APP_KEY;')();
  assert.ok(Object.keys(map).length >= 50);
  for (const [k, sk] of Object.entries(map)) {
    for (const L of BS.LANGS) assert.ok(BS.bs(sk, L), `${k} (${sk}) in ${L}`);
  }
  assert.match(APP, /<script src="js\/board-strings\.js\?v=\d+"><\/script>/);
  assert.match(APP, /const APP_LANGS=\(window\.BoardStrings&&BoardStrings\.LANGS\)\|\|\[\];/, 'the store\'s nine languages');
});

test('the boards\' font from this site, the frame dark in dark mode, loading says loading', () => {
  assert.doesNotMatch(APP, /fonts\.googleapis\.com|'Inter'/);
  assert.match(APP, /font-family:'Bricolage Grotesque';[^}]*src:url\('fonts\/bricolage\/BricolageGrotesque-latin\.woff2'\)/);
  // vNEXT — the tab bar is gone (see "nothing on screen leads nowhere"); the
  // header and the band carry the theme instead, from the same palette
  assert.match(APP, /\.topbar\{[^}]*background:var\(--head\);/);
  assert.match(APP, /\.band\{[^}]*background:var\(--band\);/);
  const dark = cssVars(':root[data-theme="dark"]{');
  assert.equal(dark['--head'], '#081a33');
  assert.match(APP, /\(!LOADED\?BoardStrings\.bs\('appLoading',langRes\(\)\)/);
  for (const L of BS.LANGS) assert.ok(BS.bs('appLoading', L), L);
});

// ═══════════════════════════════════════════════════════════════════════════
// vNEXT — THE COMPANION APP, MADE FOR A PHONE (the mobile audit of 2026-10-12)
// ═══════════════════════════════════════════════════════════════════════════

// A function's source (async too), for building it against stubs
function src(name) {
  const at = APP.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' must exist');
  let i = APP.indexOf('{', APP.indexOf('(', at)), d = 0;
  // skip the parameter list
  i = APP.indexOf('{', APP.indexOf(')', at));
  for (; i < APP.length; i++) {
    const c = APP[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < APP.length && APP[i] !== q; i++) if (APP[i] === '\\') i++; continue; }
    if (c === '/' && APP[i + 1] === '/') { i = APP.indexOf('\n', i); continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return APP.slice(at + 1, i + 1) + '\n';
  }
  throw new Error(name);
}
// The custom properties of one :root block of the app's stylesheet
function cssVars(opener) {
  const at = APP.indexOf(opener);
  assert.ok(at >= 0, opener);
  const body = APP.slice(at + opener.length, APP.indexOf('}', at));
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

test('every live airport opens as itself, never as Moncton', () => {
  // 19 of the 62 live airports were missing from the catalogue, and boot took
  // only catalogue codes: a phone sent from the Fredericton board landed on
  // Moncton under ?ap=YQM. The rows themselves are held to the board's time
  // zones by tests/live-airports.test.js.
  const live = [...APP.slice(APP.indexOf('const APP_LIVE_AIRPORTS = new Set(['), APP.indexOf(']);', APP.indexOf('const APP_LIVE_AIRPORTS'))).matchAll(/'([A-Z0-9]{3})'/g)].map((m) => m[1]);
  assert.ok(live.length >= 60);
  for (const c of live) assert.match(APP, new RegExp('\\n\\s*' + c + ":\\{n:(?:'[^']+'|\"[^\"]+\"),tz:'[^']+',r:'(CA|US|INT)'\\}"), c + ' needs a catalogue row');
  // the link's own code is the airport shown, whatever the catalogue knows
  assert.match(APP, /ap=uAp\|\|\[ss,ls\]\.find\(/);
  assert.doesNotMatch(APP, /\[uAp,ss,ls,'YQM'\]\.find/);
  // and an airport with no feed of ours is said to have no live data
  assert.match(src('load'), /if\(!APP_LIVE_AIRPORTS\.has\(ap\)\)\{APPLIED=seq;showList\(ap,dir,\[\],\{state:'unavailable'/);
});

// load() and the two functions it draws through, against a feed we control
function harness() {
  const code = `
    let CURAP='ORD',DIR='dep',FLIGHTS=[],RENDERED=[],LOADED=false,FEED=null,REQ=0,APPLIED=0,BOOT_GATE='';
    const CACHE={}, drawn=[], pending=[];
    const APP_LIVE_AIRPORTS=new Set(['ORD','YQM','YYZ']);
    const fidsFeedStatus=window.fidsFeedStatus;
    function paintHint(){}
    function render(){ drawn.push(CURAP+'|'+DIR+'|'+FLIGHTS.map(f=>f.ap+'/'+f.dir).join(',')); }
    function T(k){return k;}
    function openFlight(){}
    function fetchDir(dir,ap){ return new Promise(r=>pending.push({dir,ap,r})); }
    ${src('feedState')}${src('showList')}${src('load')}
    return { load, pending, drawn, set(ap,dir){CURAP=ap;DIR=dir;}, get FLIGHTS(){return FLIGHTS;}, get FEED(){return FEED;} };`;
  return new Function('document', 'window', code)(
    { hidden: false, getElementById: () => ({ textContent: '' }) },
    { fidsFeedStatus: (ap) => ({ state: ap === 'YYZ' ? 'stale' : 'live', asOf: 1 }) });
}
const rows = (ap, dir, n) => Array.from({ length: n }, () => ({ ap, dir }));

test('an answer is drawn only under the airport and direction it was asked for', async () => {
  const h = harness();
  // O'Hare asked, then Moncton; Moncton answers first, O'Hare last
  h.set('ORD', 'dep'); const ord = h.load();
  h.set('YQM', 'dep'); const yqm = h.load();
  h.pending[1].r(rows('YQM', 'dep', 13)); await yqm;
  h.pending[0].r(rows('ORD', 'dep', 1331)); await ord;
  assert.equal(h.FLIGHTS.length, 13);
  assert.ok(h.FLIGHTS.every((f) => f.ap === 'YQM'));
  assert.ok(!h.drawn.some((d) => /^YQM\|.*ORD/.test(d)), 'Chicago never drawn under Moncton');
  // Departures asked after Arrivals: the arrivals answer lands last and is dropped
  h.set('YQM', 'arr'); const arr = h.load();
  h.set('YQM', 'dep'); const dep = h.load();
  h.pending[3].r(rows('YQM', 'dep', 13)); await dep;
  h.pending[2].r(rows('YQM', 'arr', 12)); await arr;
  assert.ok(h.FLIGHTS.every((f) => f.dir === 'dep'));
  // the same view asked twice: an older answer never replaces a newer one
  h.set('YYZ', 'dep'); const a = h.load(); const b = h.load();
  h.pending[5].r(rows('YYZ', 'dep', 2)); await b;
  h.pending[4].r(rows('YYZ', 'dep', 9)); await a;
  assert.equal(h.FLIGHTS.length, 2);
  // the feed's own word comes with the list
  assert.equal(h.FEED.state, 'stale');
  // an airport with no feed of ours is not fetched, and is unavailable
  h.set('ZZZ', 'dep'); await h.load();
  assert.equal(h.pending.length, 6);
  assert.equal(h.FEED.state, 'unavailable');
  assert.equal(h.FLIGHTS.length, 0);
});

test('switching airport or direction clears the old list, it does not linger under the new name', () => {
  for (const name of ['setAirport', 'setDir']) assert.match(src(name), /startView\(\);/, name);
  const sv = src('startView');
  assert.match(sv, /FLIGHTS=\[\];FEED=null;LOADED=false;/);
  assert.match(sv, /CACHE\[CURAP\+'\|'\+DIR\]/, 'only this airport and direction\'s own last list');
  // the airport's logo is written only while that airport is still shown
  assert.match(src('loadBrand'), /if\(code!==CURAP\)return;/);
});

// paintHint against the real store
function hint(state) {
  const els = { hint: { textContent: '' }, liveDot: { className: '' } };
  const keys = new Function(line(/^const APP_KEY=\{[^\n]*\};/m) + '; return APP_KEY;')();
  const f = new Function('document', 'BoardStrings', 'langRes', 'T', 'timeAt', 'LOADED', 'FEED', 'FLIGHTS', 'DIR',
    src('paintHint') + '; paintHint();')(
    { getElementById: (id) => els[id] }, BS, () => 'en', (k) => BS.bs(keys[k], 'en'), () => '3:01 AM',
    state.loaded, state.feed, state.flights || [], state.dir || 'dep');
  return { dot: els.liveDot.className, text: els.hint.textContent };
}

test('the feed line is green and says Live only when the feed is live', () => {
  // A down feed used to read "No departures right now" beside a green dot,
  // and a last-good list hours old was labelled "Live departures".
  const loading = hint({ loaded: false });
  assert.equal(loading.dot, 'live wait');
  assert.equal(loading.text, BS.bs('appLoading', 'en'));
  const down = hint({ loaded: true, feed: { state: 'unavailable' } });
  assert.equal(down.dot, 'live down');
  assert.equal(down.text, BS.bs('feedUnavailable', 'en'));
  const stale = hint({ loaded: true, feed: { state: 'stale', asOf: Date.now() - 3600000 }, flights: [{}, {}] });
  assert.equal(stale.dot, 'live stale');
  assert.equal(stale.text, BS.fmt('feedStale', 'en', { TIME: '3:01 AM' }, true));
  const live = hint({ loaded: true, feed: { state: 'live' }, flights: Array(13).fill({}) });
  assert.equal(live.dot, 'live');
  assert.equal(live.text, 'Live departures · 13 flights');
  const quiet = hint({ loaded: true, feed: { state: 'live' }, flights: [] });
  assert.equal(quiet.text, 'No departures right now');
  for (const s of [loading, down, stale]) assert.doesNotMatch(s.text, /^Live (departures|arrivals)/);
  // and the list reads the same word: an unavailable feed is never "no flights"
  assert.match(src('render'), /else if\(FEED&&FEED\.state==='unavailable'\) cards\.innerHTML=emptyHtml\(IC_OFF,BoardStrings\.bs\('feedUnavailable',langRes\(\)\)\)/);
  assert.match(src('load'), /const feed=feedState\(ap,dir\);/);
});

test('a carrier code is never cut to one letter, and the feed\'s airline name comes along', () => {
  const r = (number, iata, name) => ({ number, airline: iata ? { iata, name } : {}, status: '',
    departure: { scheduledTime: { utc: '2026-10-12 10:00Z', local: '2026-10-12 06:00-04:00' } }, arrival: { airport: { iata: 'PUJ' } } });
  for (const [num, code] of [['Y8 7452', 'Y8'], ['O3 200', 'O3'], ['5Y9371', '5Y'], ['7L784', '7L'], ['3S443', '3S'], ['W1 4211', 'W1'], ['EZY123', 'EZY']]) {
    assert.equal(card(r(num), 'dep').airline, code, num);
  }
  const known = new Function(['REGIONAL_FAM', 'AIRLINE', 'BRAND', 'REGIONAL_OP', 'wmUrls'],
    fn('adbHHMM') + fn('inferOperator') + fn('adbToCard') + '; return adbToCard;')({}, { F9: 'Frontier' }, {}, {}, () => null);
  assert.equal(known(r('F91204', 'F'), 'dep').airline, 'F9', 'MIA\'s split F + 91204 is still Frontier');
  const c = card(r('TK 18', 'TK', 'Turkish Airlines'), 'dep');
  assert.equal(c.alName, 'Turkish Airlines');
  assert.equal(c.schedDate, '2026-10-12');
});

test('airline names read in full, not in the board\'s capitals', () => {
  const nm = new Function('AIRLINE', line(/^const AL_CASE=\{[\s\S]*?\};/m) + fn('alCase') + fn('airlineName') + '; return airlineName;')(
    { EI: 'AER LINGUS', FR: 'RYANAIR', TK: 'TURKISH', KL: 'KLM', B6: 'JETBLUE', LY: 'EL AL', X3: 'TUI FLY' });
  assert.equal(nm({ airline: 'EI' }), 'Aer Lingus');
  assert.equal(nm({ airline: 'FR' }), 'Ryanair');
  assert.equal(nm({ airline: 'TK', alName: 'Turkish Airlines' }), 'Turkish Airlines', 'the feed\'s fuller spelling of the same name');
  assert.equal(nm({ airline: 'TK', alName: 'Jazz Aviation' }), 'Turkish', 'never another carrier\'s name');
  assert.equal(nm({ airline: 'KL' }), 'KLM');
  assert.equal(nm({ airline: 'B6' }), 'jetBlue');
  assert.equal(nm({ airline: 'X3' }), 'TUI Fly');
  assert.equal(nm({ airline: 'DM' }), 'DM', 'a carrier nobody names keeps its code, never a blank');
});

test('the board\'s own airline tiles and emblems reach the app, and cannot drift', () => {
  const vm = require('node:vm');
  const CORE = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
  const lit = (name) => {
    const at = CORE.search(new RegExp('\\n(?:const|var|let) ' + name + ' = \\{'));
    assert.ok(at >= 0, name);
    let i = CORE.indexOf('{', at), d = 0, j = i;
    for (; j < CORE.length; j++) {
      const ch = CORE[j];
      if (ch === "'" || ch === '"') { const q = ch; for (j++; j < CORE.length && CORE[j] !== q; j++) if (CORE[j] === '\\') j++; continue; }
      if (ch === '/' && CORE[j + 1] === '/') { j = CORE.indexOf('\n', j); continue; }
      if (ch === '{') d++; else if (ch === '}' && --d === 0) break;
    }
    return new Function('return ' + CORE.slice(i, j + 1))();
  };
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current/js/shared-names.js'), 'utf8'), { window: win });
  const tiles = lit('IATA_TO_TILE_ICAO');
  const want = {}; for (const k of Object.keys(tiles)) want[k] = '/logos/airline-tiles/' + tiles[k] + '.svg';
  const plain = (o) => JSON.parse(JSON.stringify(o));   // out of the vm's own Object
  assert.deepEqual(plain(win.FIDS_SHARED_TILE), want, 'shared-names.js FIDS_SHARED_TILE is fids-core.js IATA_TO_TILE_ICAO');
  assert.deepEqual(plain(win.FIDS_SHARED_EMBLEM), plain(lit('IATA_TO_EMBLEM')), 'shared-names.js FIDS_SHARED_EMBLEM is fids-core.js IATA_TO_EMBLEM');
  for (const u of [...Object.values(win.FIDS_SHARED_TILE), ...Object.values(win.FIDS_SHARED_EMBLEM)]) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', u.split('?')[0])), u);
  }
  // the row reads them, tile first, the board's monogram last
  assert.match(src('tileOf'), /FIDS_SHARED_TILE[\s\S]*FIDS_SHARED_EMBLEM/);
  assert.match(src('tileHtml'), /tile mono/);
});

test('the day changes are marked: Tomorrow, with its date', () => {
  const build = (L) => new Function('BoardStrings', 'langRes', 'apToday', 'rowHtml', 'svg', 'esc', 'IC_CAL',
    line(/^const DAY_FMT=\{[^\n]*\};/m) + fn('_dayShift') + fn('dayDate') + fn('dayLabel') + fn('rowsHtml') + '; return rowsHtml;')(
    BS, () => L, () => '2026-10-12', () => '<r>', () => '', String, '');
  const list = ['2026-10-12', '2026-10-12', '2026-10-13', '2026-10-13'].map((d) => ({ schedDate: d }));
  const en = build('en')(list, 0, 4, false);
  assert.equal((en.match(/class="day"/g) || []).length, 1);
  assert.match(en, /<r><r><div class="day"><span>Tomorrow · Tue, Oct 13<\/span><\/div><r><r>/);
  assert.match(build('fr')(list, 0, 4, false), /Demain · mar\. 13 oct\./);
  // a page drawn later still knows the day it continues
  assert.doesNotMatch(build('en')(list, 3, 4, false), /class="day"/);
  // a list that opens on yesterday's late arrivals says so, then gives today its date
  const y = build('en')([{ schedDate: '2026-10-11' }, { schedDate: '2026-10-12' }], 0, 2, true);
  assert.match(y, /^<div class="day"><span>Yesterday · Sun, Oct 11<\/span><\/div><r><div class="day"><span>Mon, Oct 12<\/span><\/div><r>$/);
});

// WCAG relative luminance and contrast, over the card where a colour is translucent
function rgb(v, over) {
  v = v.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(v.replace(/\s+/g, ''));
  assert.ok(m, 'colour ' + v);
  const a = +m[4], base = over || [255, 255, 255];
  return [1, 2, 3].map((k, i) => Math.round(+m[k] * a + base[i] * (1 - a)));
}
function contrast(fg, bg) {
  const lum = (c) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('every word on a row reads at 4.5:1 or better, in both themes', () => {
  // Flair's green bubble put a green "On time" on it at 1.07:1; WestJet's teal
  // put its status under 2:1. Rows are now one surface per theme, and every
  // word on them is a pair from this sheet.
  const light = cssVars(':root{');
  const dark = cssVars(':root[data-theme="dark"]{');
  assert.deepEqual(cssVars('    :root[data-theme="auto"]{'), dark, 'the system\'s dark is the same night as the switch\'s');
  for (const [name, V] of [['light', light], ['dark', dark]]) {
    const card = rgb(V['--card']);
    const on = (bgVar) => rgb(V[bgVar], card);
    const pairs = [
      ['--txt', '--card'], ['--muted', '--card'], ['--moved', '--card'],
      ['--ok-ink', '--ok-bg'], ['--late-ink', '--late-bg'], ['--cx-ink', '--cx-bg'], ['--brd-ink', '--brd-bg'], ['--muted', '--neu-bg'],
      ['--slot-ink', '--slot'], ['--muted', '--slot'], ['--head-ink', '--head'], ['--head-muted', '--head']];
    for (const [fg, bg] of pairs) {
      const r = contrast(rgb(V[fg], on(bg)), bg === '--card' ? card : on(bg));
      assert.ok(r >= 4.5, `${name}: ${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
    // a cancelled row: white on the board's red, and on its darker pill
    const cx = rgb(V['--cx']);
    assert.ok(contrast([255, 255, 255], cx) >= 4.5, name + ' cancelled row');
    assert.ok(contrast([255, 255, 255], rgb('rgba(0,0,0,.24)', cx)) >= 4.5, name + ' cancelled pill');
    // the band: white on navy, and the unselected tab's lighter white
    const band = rgb(V['--band']);
    assert.ok(contrast(rgb('rgba(255,255,255,.8)', rgb('rgba(255,255,255,.1)', band)), rgb('rgba(255,255,255,.1)', band)) >= 4.5, name + ' band');
  }
  // no airline colour is ever painted under a row's words again
  assert.doesNotMatch(APP, /function bubBg|BUB_LIGHT|class="cardmark/);
});

test('nothing on screen leads nowhere', () => {
  // Explore and Trip were "Coming soon" pages, the person button an English
  // alert, Baggage was Arrivals a second time with cards that did not open.
  assert.doesNotMatch(APP, /<nav class="nav"|id="view-explore"|id="view-trip"|function personalize|alert\(/);
  // the belt is on every arrival, where the gate is on a departure, and the
  // boards' baggage links open Arrivals
  assert.match(src('slotHtml'), /isArr\?T\('belt'\):T\('gate'\)/);
  assert.match(APP, /if\(scr==='baggage'\|\|q\.get\('belt'\)\|\|q\.get\('carousel'\)\)\{\n\s*DIR='arr';/);
  // and every row opens its flight
  assert.match(src('rowHtml'), /onclick="openFlight\('\+i\+'\)"/);
});

test('a big airport is drawn a page at a time, and search waits for the typing to pause', () => {
  // O'Hare was 1,333 cards, 225,000 px and 27,000 nodes in one pass, rebuilt on every keystroke
  const page = +line(/^const PAGE=(\d+);/m).match(/\d+/)[0];
  assert.ok(page >= 30 && page <= 80, 'PAGE ' + page);
  assert.match(src('render'), /cards\.innerHTML=rowsHtml\(list,0,n,isArr\)/);
  assert.match(src('showMore'), /insertAdjacentHTML\('beforebegin',rowsHtml\(RENDERED,from,to,/);
  assert.match(src('onSearch'), /clearTimeout\(_qT\);_qT=setTimeout\(/);
  assert.match(APP, /oninput="onSearch\(\)"/);
  // the 3-minute refresh holds the reader's row where it was
  assert.match(src('refresh'), /load\(\{keepScroll:true\}\)/);
  assert.match(src('render'), /const anchor=o\.keepScroll\?anchorGet\(\):null;/);
});

test('a cancelled flight is the board\'s red row; a moved time puts the new time in the big slot', () => {
  const th = new Function('clk', fn('movedTime') + fn('timeHtml') + '; return timeHtml;')((t) => t);
  // a flight that has gone carries the time it went, when that is 5 minutes off its printed one
  assert.match(th({ schedTime: '22:03', estTime: '01:50', state: 'arrived' }), /<div class="was">22:03<\/div><div class="hh moved">01:50<\/div>/);
  assert.match(th({ schedTime: '22:03', estTime: '22:05', state: 'arrived' }), /^<div class="tcol"><div class="hh">22:03<\/div><\/div>$/);
  assert.match(th({ schedTime: '08:00', estTime: '08:30', state: 'scheduled' }), /^<div class="tcol"><div class="hh">08:00<\/div><\/div>$/, 'a moved time with no word from the airport is not shown as moved');
  assert.equal(th({ schedTime: '06:55', estTime: '06:46', state: 'early' }), '<div class="tcol"><div class="was">06:55</div><div class="hh moved">06:46</div></div>');
  assert.equal(th({ schedTime: '06:55', estTime: '06:55', state: 'scheduled' }), '<div class="tcol"><div class="hh">06:55</div></div>');
  assert.match(src('rowHtml'), /\(f\.state==='cancelled'\?' cx':''\)/);
  assert.match(APP, /\.fcard\.cx\{background:var\(--cx\);/);
  assert.match(APP, /\.fcard\.cx \.hh\{text-decoration:line-through;/);
  // the gate has its own box, TBD until the airport names one, none when cancelled
  const slot = new Function('T', 'esc', fn('slotHtml') + '; return slotHtml;')((k) => ({ gate: 'Gate', belt: 'Belt', tbd: 'TBD' })[k], String);
  assert.match(slot({ gate: 'A12', state: 'scheduled' }, false), /<div class="k">Gate<\/div><div class="v l3">A12<\/div>/);
  assert.match(slot({ gate: '', state: 'scheduled' }, false), /<div class="v tbd">TBD<\/div>/);
  assert.match(slot({ belt: '7', state: 'arrived' }, true), /<div class="k">Belt<\/div><div class="v">7<\/div>/);
  assert.match(slot({ gate: '4', state: 'cancelled' }, false), /<div class="v tbd">—<\/div>/);
  // and the detail does not offer a cancelled flight's gate or its time as if it were going
  const det = src('openFlight');
  assert.match(det, /if\(!cx\)\{const gv=/);
  assert.match(det, /\{html:true,big:true,strike:cx\}/);
  assert.match(det, /'<div class="dt-cx">'/);
});

test('the airport\'s logo is drawn at its own width, white lettering at night, never a white box', () => {
  // A wide logo was squeezed into a 46 px square tile with 6 px padding and
  // drew at about 32x6 px.
  assert.doesNotMatch(APP, /\.brand \.logo\{width:46px/);
  assert.match(APP, /\.brand \.logo img\{display:block;height:34px;width:auto;max-width:40vw;/);
  // whitened only where it is lettering; a plate of its own keeps its colours,
  // a white plate (or a box with dark words) gives way to the code
  assert.match(APP, /:root\[data-theme="dark"\] \.brand \.logo\[data-night="white"\] img\{filter:brightness\(0\) invert\(1\);\}/);
  assert.doesNotMatch(APP, /:root\[data-theme="dark"\] \.brand \.logo img\{filter/);
  const night = new Function(line(/^const LOGO_NIGHT=\{[^\n]*\};/m) + '; return LOGO_NIGHT;')();
  assert.equal(night.YSJ, 'own');
  assert.equal(night.SYD, 'code');
  for (const v of Object.values(night)) assert.ok(v === 'own' || v === 'code', v);
});
