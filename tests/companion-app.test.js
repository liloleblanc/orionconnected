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
  // vNEXT — with nothing to list, the list says it (once); the line is hidden
  const down = hint({ loaded: true, feed: { state: 'unavailable' } });
  assert.equal(down.dot, 'live down');
  assert.equal(down.text, '');
  const downOld = hint({ loaded: true, feed: { state: 'unavailable' }, flights: [{}, {}] });
  assert.equal(downOld.text, BS.bs('feedUnavailable', 'en'));
  assert.match(src('paintHint'), /if\(hint\.parentNode\)hint\.parentNode\.hidden=!txt;/);
  const stale = hint({ loaded: true, feed: { state: 'stale', asOf: Date.now() - 3600000 }, flights: [{}, {}] });
  assert.equal(stale.dot, 'live stale');
  assert.equal(stale.text, BS.fmt('feedStale', 'en', { TIME: '3:01 AM' }, true));
  const live = hint({ loaded: true, feed: { state: 'live' }, flights: Array(13).fill({}) });
  assert.equal(live.dot, 'live');
  assert.equal(live.text, 'Live departures · 13 flights');
  // an empty live list: 'No departures right now' is the list's own words
  const quiet = hint({ loaded: true, feed: { state: 'live' }, flights: [] });
  assert.equal(quiet.text, '');
  assert.match(src('render'), /else cards\.innerHTML=emptyHtml\(IC_PLANE,isArr\?T\('noArr'\):T\('noDep'\)\);/);
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
    // the band: white on navy, and on the tabs' white wash (vNEXT: the tab
    // that is not chosen reads in full white, for Moncton's red band)
    const band = rgb(V['--band']);
    assert.ok(contrast([255, 255, 255], rgb('rgba(255,255,255,.1)', band)) >= 4.5, name + ' band');
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
  assert.match(src('render'), /cards\.innerHTML=\(gone\?goneHtml\(gone\):''\)\+rowsHtml\(list,0,n,isArr\)/);
  assert.match(src('showMore'), /insertAdjacentHTML\('beforebegin',rowsHtml\(RENDERED,from,to,/);
  assert.match(src('onSearch'), /clearTimeout\(_qT\);_qT=setTimeout\(/);
  assert.match(APP, /oninput="onSearch\(\)"/);
  // the 3-minute refresh holds the reader's row where it was
  assert.match(src('refresh'), /load\(\{keepScroll:true\}\)/);
  assert.match(src('render'), /const anchor=o\.keepScroll\?anchorGet\(\):null;/);
});

test('a cancelled flight is the board\'s red row; a moved time puts the new time in the big slot', () => {
  const th = new Function('clk', fn('isDone') + fn('movedTime') + fn('timeHtml') + '; return timeHtml;')((t) => t);
  // a flight that has gone carries the time it went, when that is 5 minutes
  // off its printed one — vNEXT: in plain ink; amber is for a time still to come
  assert.match(th({ schedTime: '22:03', estTime: '01:50', state: 'arrived' }), /<div class="was">22:03<\/div><div class="hh">01:50<\/div>/);
  assert.match(th({ schedTime: '08:00', estTime: '08:30', state: 'delayed' }), /<div class="was">08:00<\/div><div class="hh moved">08:30<\/div>/);
  assert.match(th({ schedTime: '22:03', estTime: '22:05', state: 'arrived' }), /^<div class="tcol"><div class="hh">22:03<\/div><\/div>$/);
  assert.match(th({ schedTime: '08:00', estTime: '08:30', state: 'scheduled' }), /^<div class="tcol"><div class="hh">08:00<\/div><\/div>$/, 'a moved time with no word from the airport is not shown as moved');
  assert.equal(th({ schedTime: '06:55', estTime: '06:46', state: 'early' }), '<div class="tcol"><div class="was">06:55</div><div class="hh moved">06:46</div></div>');
  assert.equal(th({ schedTime: '06:55', estTime: '06:55', state: 'scheduled' }), '<div class="tcol"><div class="hh">06:55</div></div>');
  assert.match(src('rowHtml'), /\(f\.state==='cancelled'\?' cx':''\)/);
  assert.match(APP, /\.fcard\.cx\{background:var\(--cx\);/);
  assert.match(APP, /\.fcard\.cx \.hh::after/, 'the cancelled time is struck');
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

// ═══════════════════════════════════════════════════════════════════════════
// vNEXT — THE PHONE, SECOND PASS (the design and function reviews of the
// companion app, 2026-10-12)
// ═══════════════════════════════════════════════════════════════════════════

test('the cutoff runs first, and a duplicate is the same flight on the same day', () => {
  // The duplicate check matched number and time only, before the cutoff:
  // yesterday's copy won it and was then cut as gone, and today's flight went
  // with it (YUL departures: 224 of 439 shown). At 22:30 Moncton showed no
  // departures while the feed carried 9 for the morning.
  const cardList = new Function(fn('cardList') + '; return cardList;')();
  const now = Date.parse('2026-10-12T22:30:00-03:00');
  const H = 3600000;
  const mk = (flight, date, time, ts) => ({ flight, schedDate: date, schedTime: time, _ts: ts, _effTs: ts });
  const day = 24 * H;
  const feed = [
    mk('UA3549', '2026-10-11', '16:55', now - 5.5 * H - day),   // yesterday's copy first
    mk('UA3549', '2026-10-12', '16:55', now - 5.5 * H + 6 * H),  // (an evening flight, still to go)
    mk('AC1983', '2026-10-12', '05:25', now - 17 * H),          // this morning's: gone
    mk('AC1983', '2026-10-13', '05:25', now + 7 * H),           // tomorrow's
    mk('AC1983', '2026-10-13', '05:25', now + 7 * H),           // the same flight twice in the feed
    mk('PD2294', '2026-10-13', '06:10', now + 7.75 * H)
  ];
  const out = cardList(feed, 'dep', now);
  assert.deepEqual(out.map((f) => f.flight + ' ' + f.schedDate), ['UA3549 2026-10-12', 'AC1983 2026-10-13', 'PD2294 2026-10-13']);
  // the evening: nothing left today, the morning's flights are the list
  const eve = cardList([mk('AC1983', '2026-10-12', '05:25', now - 17 * H), mk('AC1983', '2026-10-13', '05:25', now + 7 * H)], 'dep', now);
  assert.equal(eve.length, 1);
  assert.equal(eve[0].schedDate, '2026-10-13');
  // fetchDir hands its rows to it; the old key is gone
  assert.match(src('fetchDir'), /return cardList\(all,dir,Date\.now\(\)\);/);
  assert.doesNotMatch(APP, /const k=f\.flight\+'\|'\+f\.schedTime;/);
});

test('at Moncton the app wears its boards\' font and band', () => {
  const vm = require('node:vm');
  const ctx = {};
  vm.runInNewContext(line(/^const BAND_OWN=\{[^\n]*\};/m) + line(/^const FONT_STACK=\{[^\n]*\};/m)
    + fn('_wcr') + fn('bandOk') + fn('brandOf') + ';this.brandOf=brandOf;this.bandOk=bandOk;this.BAND_OWN=BAND_OWN;this.FONT_STACK=FONT_STACK;', ctx);
  // Moncton: the board's own Acadian red, whatever its config's header colour
  const yqm = ctx.brandOf('YQM', { font: 'possibility', theme: 'custom', customColors: { hdr: '#28364d' }, logo: { url: 'https://x/l.svg' } });
  assert.equal(yqm.band, '#D21034');
  assert.equal(yqm.font, 'possibility');
  assert.match(ctx.FONT_STACK.possibility, /^'Possibility','Bricolage Grotesque'/);
  const OV = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');
  const m = OV.match(/body\.fids-ap-YQM \.fids-banner-board \{[^}]*background:\s*(#[0-9A-Fa-f]{6})/);
  assert.ok(m, 'the board\'s Moncton band rule');
  assert.equal(ctx.BAND_OWN.YQM.toLowerCase(), m[1].toLowerCase(), 'the same red as the board');
  // elsewhere the config's header colour (the board's --fids-banner-bg)
  assert.equal(ctx.brandOf('YUL', { theme: 'custom', customColors: { hdr: '#27272a' } }).band, '#27272a');
  // a band white words cannot read on is not worn
  assert.equal(ctx.brandOf('XXX', { theme: 'custom', customColors: { hdr: '#f2d16b' } }).band, '');
  for (const c of Object.values(ctx.BAND_OWN)) assert.ok(ctx.bandOk(c), c);
  // the face is the licensed webfont the Worker serves, never a file in the repo
  assert.match(APP, /@font-face\{font-family:'Possibility';[^}]*src:url\('fonts\/Possibility-Bold-Web\.woff2'\)/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/fonts/Possibility-Bold-Web.woff2')));
  assert.match(APP, /body\{[^}]*font-family:var\(--app-font\);/);
  // set from the config, remembered for the next visit
  const ab = src('applyBrand');
  assert.match(ab, /root\.style\.setProperty\('--band',\(b&&b\.band\)\|\|''\);/);
  assert.match(ab, /root\.style\.setProperty\('--app-font',fs\|\|''\);/);
  assert.match(src('loadBrand'), /brandPut\(code,b\);/);
  assert.match(src('setAirport'), /applyBrand\(code,brandGet\(code\),true\);/);
});

test('the header names the airport once', () => {
  assert.doesNotMatch(APP, /class="meta"|id="apIata"/);
  assert.match(APP, /\.brand \.apn:empty,\.brand\.has-logo \.apn\{display:none;\}/);
  // the name only where it says more than the code ('XYZ XYZ XYZ')
  assert.match(src('paintHeader'), /\(nm&&nm!==code&&nm!==dispIata\(code\)\)\?nm:''/);
});

test('the tabs fit a 320 px phone, with the boards\' own icons', () => {
  assert.match(APP, /\.tic\.dep\{-webkit-mask-image:url\('logos\/icons\/takeoff\.svg'\)/);
  assert.match(APP, /\.tic\.arr\{-webkit-mask-image:url\('logos\/icons\/landing\.svg'\)/);
  assert.match(APP, /<button id="segDep"[^>]*><span class="tic dep"/);
  assert.doesNotMatch(APP.slice(APP.indexOf('<button id="segDep"'), APP.indexOf('</div>', APP.indexOf('<button id="segDep"'))), /<svg/);
  assert.match(APP, /@media \(max-width:359\.98px\)\{\n\s*\.seg button\{padding:0 4px;gap:0;\}\n\s*\.seg button \.tic\{display:none;\}/);
  for (const f of ['takeoff', 'landing', 'plane']) assert.ok(fs.existsSync(path.join(ROOT, 'fids-current/logos/icons/' + f + '.svg')), f);
  // the route card's plane is the boards' own, in the page's ink, not app blue
  assert.match(APP, /\.dt-route \.pl\{[^}]*color:var\(--txt\);/);
  assert.match(src('openFlight'), /<span class="pl"><span class="tic pln"/);
});

test('a place is never cut inside its name', () => {
  // 'Toronto · Billy / Bishop' at 360 px; 'Toronto · / Pearson' at 320. The
  // city and the airport's own name are two units; the '·' rides on the second.
  const vm = require('node:vm');
  const ctx = { BoardStrings: BS, CURAP: 'YQM', LANG: 'en' };
  ctx.window = ctx;   // as in a page: window's properties are globals
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current/js/shared-names.js'), 'utf8'), ctx);
  vm.runInNewContext('var langRes=function(){return LANG;};' + fn('esc') + line(/^const CITY=\{[\s\S]*?\};/m).replace('const CITY', 'var CITY')
    + fn('_tcCity') + line(/^if\(window\.FIDS_SHARED_CITY\)[^\n]*/m) + fn('apSub') + fn('placeOf') + fn('cityOf') + fn('placeHtml'), ctx);
  assert.equal(ctx.placeHtml(ctx.placeOf('YTZ')), '<span class="pl-in"><span class="pl-c">Toronto</span><span class="pl-q"><span>Billy Bishop</span></span></span>');
  assert.equal(ctx.placeHtml(ctx.placeOf('YOW')), '<span class="pl-in"><span class="pl-c">Ottawa</span></span>');
  assert.equal(ctx.cityOf({ cityIata: 'LGA' }), 'New York · LaGuardia', 'the board\'s name, not the catalogue\'s');
  assert.equal(ctx.cityOf({ cityIata: 'ORD' }), "Chicago · O'Hare");
  ctx.LANG = 'fr';
  assert.equal(ctx.cityOf({ cityIata: 'YTZ' }), 'Toronto · Billy-Bishop', 'a person\'s name, hyphenated in French');
  ctx.LANG = 'ja';
  assert.equal(ctx.cityOf({ cityIata: 'DXB' }).split(' · ')[1], BS.bs('apIntl', 'ja'));
  // the units: a line breaks between them only; the dot is drawn in the
  // room the line is shifted by, so a second line does not start with it
  assert.match(APP, /\.pl-c,\.pl-q\{display:inline-block;max-width:100%;/);
  assert.match(APP, /\.fcard \.city\{[^}]*overflow:hidden;/);
  assert.match(APP, /\.pl-in\{display:block;margin-inline-start:-\.8em;\}/);
  assert.match(src('rowHtml'), /placeHtml\(placeOf\(f\.cityIata,f\.cityName\)\)/);
  assert.match(src('openFlight'), /placeHtml\(placeOf\(f\.cityIata,f\.cityName\)\)/);
  // no city in the app's own table carries an airport's name any more
  for (const [k, v] of Object.entries(ctx.CITY)) assert.doesNotMatch(String(v), / · /, k);
});

test('the shared airport names are the board\'s own, and cannot drift', () => {
  const CORE = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
  const at = CORE.indexOf('\nconst AP = {');
  assert.ok(at >= 0);
  let i = CORE.indexOf('{', at), d = 0, j = i;
  for (; j < CORE.length; j++) {
    const ch = CORE[j];
    if (ch === "'" || ch === '"') { const q = ch; for (j++; j < CORE.length && CORE[j] !== q; j++) if (CORE[j] === '\\') j++; continue; }
    if (ch === '/' && CORE[j + 1] === '/') { j = CORE.indexOf('\n', j); continue; }
    if (ch === '{') d++; else if (ch === '}' && --d === 0) break;
  }
  const AP = new Function('return ' + CORE.slice(i, j + 1))();
  const want = {};
  for (const k of Object.keys(AP)) { const a = AP[k]; if (a && a.subKey) want[k] = { subKey: a.subKey }; else if (a && a.sub) want[k] = a.sub; }
  const win = {};
  require('node:vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current/js/shared-names.js'), 'utf8'), { window: win });
  assert.deepEqual(JSON.parse(JSON.stringify(win.FIDS_SHARED_SUBLINE)), want, 'shared-names.js FIDS_SHARED_SUBLINE is fids-core.js AP sub/subKey');
  const person = (CORE.match(/var AIRPORT_SUBLINE_PERSON = (\[[^\]]*\]);/) || [])[1];
  assert.deepEqual(JSON.parse(JSON.stringify(win.FIDS_SHARED_SUBLINE_PERSON)), new Function('return ' + person)());
  for (const v of Object.values(want)) if (typeof v === 'object') for (const L of BS.LANGS) assert.ok(BS.bs(v.subKey, L), v.subKey + ' ' + L);
});

test('the airport picker speaks the app\'s language, one bracket per line', () => {
  const keys = new Function(line(/^const APP_KEY=\{[^\n]*\};/m) + '; return APP_KEY;')();
  const reg = new Function(line(/^const REGION_KEY=\{[^\n]*\};/m) + '; return REGION_KEY;')();
  for (const r of ['CA', 'US', 'INT']) for (const L of BS.LANGS) assert.ok(BS.bs(keys[reg[r]], L), r + ' ' + L);
  assert.match(src('buildAirportOptions'), /'<optgroup label="'\+esc\(T\(REGION_KEY\[r\]\)\)\+'">'/);
  assert.match(src('applyLang'), /buildAirportOptions\(\);/);
  assert.doesNotMatch(APP, /Sun & International|REGION_LABEL/);
  // no catalogue name carries a bracket of its own
  const cat = APP.slice(APP.indexOf('const AIRPORTS={'), APP.indexOf('};', APP.indexOf('const AIRPORTS={')));
  for (const m of cat.matchAll(/\n\s*([A-Z0-9]{3}):\{n:(?:'([^']+)'|"([^"]+)")/g)) assert.doesNotMatch(m[2] || m[3], /[()]/, m[1]);
  assert.match(src('buildAirportOptions'), /esc\(pickerName\(k\)\)\+' \('\+esc\(dispIata\(k\)\)\+'\)<\/option>'/);
});

test('the status keeps its line: one layout for the whole list', () => {
  // At 340 px and below the pill fell to a line of its own on every row (rows
  // of 88, 97, 112 and 121 px); at 360 px in Spanish, Portuguese and Italian too.
  const rh = src('rowHtml');
  assert.match(rh, /'<div class="l1">.*\+pill\+'<\/div>'/);
  assert.match(rh, /'<div class="sub"><span class="sx">.*<\/span>'\+pill\+'<\/div>'/);
  assert.match(APP, /\.fcard \.sub \.st\{display:none;\}/);
  assert.match(APP, /\.cards\.tight \.fcard \.l1 \.st\{display:none;\}/);
  assert.match(APP, /\.cards\.tight \.fcard \.sub \.st\{display:inline-flex;\}/);
  assert.match(APP, /\.cards\.tight \.slot\{grid-row:1 \/ 3;\}/);
  const fr = src('fitRows');
  assert.match(fr, /if\(window\.innerWidth<360\)\{c\.classList\.add\('tight'\);return;\}/);
  assert.match(fr, /offsetHeight>34/);
  assert.match(src('render'), /fitRows\(true\);/);
  assert.match(src('showMore'), /fitRows\(false\);/);
  // a small phone: 62 px time column with AM/PM under it, the mark capped at 88 x 13
  assert.match(APP, /@media \(max-width:359\.98px\)\{\n\s*\.fcard\{grid-template-columns:62px minmax\(0,1fr\) auto;/);
  assert.match(APP, /\.fcard \.hh small\{display:block;/);
  assert.match(APP, /img\.wm\{max-width:88px;height:13px;\}/);
});

test('one line through the whole time, never text-decoration', () => {
  // the line struck '7:10' and ran under the smaller AM, which read as a typo
  assert.doesNotMatch(APP, /text-decoration:\s*line-through/);
  assert.match(APP, /\.fcard \.was::after,\.fcard\.cx \.hh::after,\.dt-cell \.v\.strike \.ltr::after,\.dt-cell \.v\.was \.ltr::after\{content:'';position:absolute;left:-1px;right:-1px;top:\.68em;height:2px;/);
  assert.match(APP, /\.fcard\.cx \.hh\{display:inline-block;position:relative;\}/);
});

test('the gate box\'s word is 10 px or more, in every language', () => {
  // it was 8.5 px, and 7.5 px for CARROUSEL
  const sizes = [...APP.matchAll(/\.slot \.k(?:\.[a-z]+)?\{[^}]*font-size:([\d.]+)px/g)].map((m) => +m[1]);
  assert.ok(sizes.length >= 1);
  for (const s of sizes) assert.ok(s >= 10, s + 'px');
  assert.doesNotMatch(APP, /\.slot \.k\.long|' long':''/);
  // the column takes the word's width (CARROUSEL, ターンテーブル) and no value widens it
  assert.match(APP, /\.fcard\{display:grid;grid-template-columns:74px minmax\(0,1fr\) auto;/);
  assert.match(APP, /\.slot\{[^}]*min-width:58px;max-width:88px;/);
  assert.match(APP, /\.slot \.v\{contain:inline-size;/);
  // the longest label at 10 px with its spacing fits the widest box
  for (const L of BS.LANGS) for (const k of ['gateWord', 'appBelt']) {
    const w = [...BS.bs(k, L)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 10 : 7.2), 0) * 1.06;
    assert.ok(w + 8 <= 88, k + ' ' + L + ' ' + w.toFixed(1));
  }
});

test('a flight that has gone is quieter in ink, not faded, and departures fold it', () => {
  assert.doesNotMatch(APP, /\.fcard\.done\{opacity/);
  assert.match(APP, /\.fcard\.done \.hh,\.fcard\.done \.city,\.fcard\.done \.sub b\{color:var\(--muted\);\}/);
  // --muted on the card is held to 4.5:1 by the contrast test above
  const r = src('render');
  assert.match(r, /else if\(!isArr&&!SHOW_GONE\)\{const left=list\.filter\(f=>!isDone\(f\)\);/, 'departures only: a landed flight is the one whose belt people want');
  assert.match(src('goneHtml'), /BoardStrings\.fmt\('appGoneDep',L,\{N:ns\},true\)/);
  for (const L of BS.LANGS) assert.match(BS.bs('appGoneDep', L), /\{N\}/, L);
  assert.match(src('startView'), /SHOW_GONE=false;/);
});

test('the detail: flat hero, night colours for a light carrier, nothing half-empty', () => {
  assert.doesNotMatch(APP, /\.dt-hero::before/);
  assert.doesNotMatch(APP, /\.dt-cell\.key\{background/);
  assert.match(APP, /\.dt-grid > \.dt-cell:last-child:nth-child\(odd\)\{grid-column:1 \/ -1;\}/);
  assert.match(APP, /:root\[data-theme="dark"\] \.dt-hero\{background:var\(--hero-n,var\(--hero,#0b1f3a\)\);/);
  const ABC = { PD: { r1: '#EFE8DA', r1Text: '#152C53', r2: '#152C53' }, AC: { r1: '#0A0A0A', r1Text: '#FFFFFF' } };
  const hc = new Function('window', 'AIRLINE_BRAND_COLORS', 'WM_INK', fn('_lum') + fn('heroColors') + '; return heroColors;')(
    { AIRLINE_BRAND_COLORS: ABC }, ABC, {});
  assert.deepEqual(hc('PD'), { bg: '#EFE8DA', ink: '#152C53', light: true, night: '#152C53' });
  assert.equal(hc('AC').night, '');
  // both marks drawn on a light carrier's hero; the theme shows one
  const hb = new Function('wmUrls', 'esc', 'tileHtml', '_wmOnlyWhite', 'WM_INK', fn('heroBrand') + '; return heroBrand;')(
    () => ['/d.svg', '/l.svg'], String, () => '', () => false, {});
  assert.match(hb('PD', 'Porter', true), /<img class="wm wm-l" src="\/d\.svg"[^>]*><img class="wm wm-d" src="\/l\.svg"/);
  assert.doesNotMatch(hb('AC', 'Air Canada', false), /wm-l/);
});

test('the detail carries what the boards show: the weather there, the aircraft before it flies', () => {
  // the boards' own sources: the site's /wxcurrent (MET Norway) by the
  // airport's position, and the Worker's /acinfo — never FR24 from the app
  assert.match(src('_wxPump'), /fetch\('\/wxcurrent\?location='\+p\[0\]\+','\+p\[1\]\)/);
  assert.match(src('_coords'), /js\/airport-coords\.js/);
  assert.match(src('acKick'), /fetch\(APP_PROXY\+'\/acinfo\?f='/);
  assert.match(src('acKick'), /reg:j\.basis==='feed'\?String\(j\.reg\|\|''\):''/, 'a registration only from the far end\'s own feed');
  assert.doesNotMatch(APP, /(['"])(?:(?!\1)[^\n])*(?:fr24|flightradar)(?:(?!\1)[^\n])*\1/i, 'no FR24 address anywhere in the app');
  // MET's credit wherever a temperature shows
  assert.match(src('wxPaint'), /BoardStrings\.bs\('wxCredit',langRes\(\)\)/);
  assert.match(src('openFlight'), /BoardStrings\.bs\('wxCredit',langRes\(\)\)/);
  assert.match(src('rowHtml'), /wxHtml\(f\.cityIata\)/);
  // an airport whose boards hide the weather hides it here
  assert.match(APP, /\.no-wx \.wx,\.no-wx #wxCredit,\.no-wx \.dt-credit\{display:none !important;\}/);
  assert.match(src('applyBrand'), /WX_ON=!\(b&&b\.hw\); root\.classList\.toggle\('no-wx',!WX_ON\);/);
  // the type /acinfo answers with reads as a name
  const AT = new Function(line(/^const ACTYPE=\{[\s\S]*?\};/m) + '; return ACTYPE;')();
  assert.equal(AT.DH8C, 'De Havilland Dash 8-300');
});

test('at 320 px both tabs and every gate box word fit, in all nine languages and both faces', () => {
  // Measured on the rendered app (tests/fixtures/app-phone-fit-320.json):
  // English 'Departures' ran 2 px past its white pill at 320 px. The CSS the
  // measurement was taken with is held too, so a change to it is measured again.
  const fit = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/app-phone-fit-320.json'), 'utf8'));
  const runs = Object.entries(fit.runs);
  assert.deepEqual(runs.map(([k]) => k).sort(), ['YQM-arr', 'YQM-dep', 'YUL-arr', 'YUL-dep']);
  assert.deepEqual([...new Set(runs.map(([, r]) => r.font))].sort(), ['Bricolage Grotesque', 'Possibility']);
  for (const [k, r] of runs) {
    assert.equal(r.w, 320, k);
    assert.deepEqual(Object.keys(r.langs).sort(), [...BS.LANGS].sort(), k + ': every language measured');
    for (const [L, m] of Object.entries(r.langs)) {
      for (const t of ['dep', 'arr']) {
        assert.equal(m[t].over, false, `${k} ${L} ${t} tab overflows`);
        assert.ok(m[t].text <= m[t].room, `${k} ${L} ${t}: ${m[t].text} > ${m[t].room}`);
      }
      assert.ok(m.slotK.px >= 10, `${k} ${L} gate word ${m.slotK.px}px`);
      assert.ok(m.slotK.w <= m.slotK.box, `${k} ${L} gate word ${m.slotK.w} in a ${m.slotK.box} box`);
      // the word measured is the store's
      assert.equal(m.slotK.word, BS.bs(k.endsWith('arr') ? 'appBelt' : 'gateWord', L), k + ' ' + L);
    }
  }
  assert.match(APP, /\.seg button\{[^}]*padding:0 8px;[^}]*font-size:14px;font-weight:750;/);
  assert.match(APP, /\.slot \.k\{font-size:10px;letter-spacing:\.06em;/);
});
