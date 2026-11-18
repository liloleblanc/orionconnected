'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// A ROW NO PASSENGER LOOKS FOR IS ON NO SCREEN, AND IT IS THE ROW THAT SAYS SO
//
// The standing rule (2026-11-13): a flight a passenger can be on prints its
// airline by name; a flight no passenger looks for (cargo, courier, private,
// positioning) is off the board. tests/airline-names-every-row.test.js holds
// the first half and the code list. This holds what the code list cannot do:
// take ONE flight of an airline off while its passenger flights stay.
//
// What stood on the Miami boards and in the phone app on 2026-11-18:
//   - BBQ 2211A, an arrival "from Miami" at Miami, gate F21;
//   - G6 6175 in from Maracay and out to Alexandria, Louisiana, which Miami
//     files under terminal "NO" and gives no gate;
// beside the Cuba and Haiti charters of Eastern Air Express, World Atlantic
// and GlobalX, which have gates, concourses and belts and stay, by name.
//
// The rule is ONE function, fidsRowOffBoard in fids-current/js/feed-router.js,
// the data layer every board page and the phone app load. What is held here:
//   1. ONE FUNCTION, ASKED BY EVERY SCREEN: it is defined once, mapADB
//      (fids-core.js), adbToCard (app.html) and the live list of the Studio
//      player (studio-data.js) all ask it, and every page that maps rows
//      loads the file that holds it. A board whose cache still holds an
//      older feed-router.js maps its rows as before and does not go empty.
//   2. THE RULE, KIND BY KIND, on rows written for it, through the real
//      mapADB and the real adbToCard: each kind leaves both screens, and each
//      thing that is NOT evidence stays on both.
//   3. MIAMI, 2026-11-18, as the airport sent it (rows-off-board-2026-11-18
//      .json): the three rows leave, the public charters stay and print their
//      airline. A row that comes back fails here.
//   4. MIAMI THROUGH THE BACKUP LIST: the worker's parser carries the
//      airport's mark, so the row is off whichever list the board is on.
//   5. THE OTHER AIRPORTS of the same morning, each list read as a list:
//      the rows that leave, the scheduled flights that look like them and
//      stay (Avelo and Arajet at Chicago with no terminal, gate or belt;
//      AA179Q and AA473Q, flights filed again under a letter), and the rows
//      nothing can decide, which stay and are listed so the list can only
//      shrink.
//   6. THE THREE SCREENS GIVE THE SAME ANSWER on every row of the file: the
//      board, the phone app and the live list of the Studio player.
//
// Every recorded row of tests/fixtures goes through the same rule in
// tests/airline-names-every-row.test.js, where a row that leaves must be
// listed by name: a scheduled passenger flight cannot leave unseen.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'fids-current', 'js');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const CORE = read('fids-current/js/fids-core.js');
const APP = read('fids-current/app.html');
const ROUTER = read('fids-current/js/feed-router.js');
const SHARED = read('fids-current/js/shared-names.js');
const STUDIO = read('fids-current/js/studio-data.js');
const StudioData = require('../fids-current/js/studio-data.js');
const WORKER_PATH = path.join(ROOT, 'workers', 'fids-proxy.js');
const TODAY = JSON.parse(read('tests/fixtures/rows-off-board-2026-11-18.json'));

// ── the whole board script in a page of its own ────────────────────────────
// (as tests/airline-names-every-row.test.js runs it: no screen, no network)
const BOARD_FILES = ['host-airport.js', 'board-strings.js', 'feed-router.js', 'fids-core.js', 'airport-coords.js'];
function board() {
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
    location: { search: '?ap=MIA', hostname: 'localhost', href: 'http://localhost/fids.html?ap=MIA', pathname: '/fids.html', origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of BOARD_FILES) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('var __the = function (n) { return eval(n); };', ctx);
  return ctx;
}
let BOARD_ = null;
const B = () => BOARD_ || (BOARD_ = board());
const the = (n) => B().__the(n);

// A row at the mapper's door: its own time set an hour from now (mapADB
// keeps a few hours either side of now); nothing else of the row is touched.
const AT = new Date(Math.floor(Date.now() / 3600000) * 3600000 + 3600000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
const timed = (row, dir) => {
  const g = JSON.parse(JSON.stringify(row));
  const k = dir === 'dep' ? 'departure' : 'arrival';
  g[k] = g[k] || {};
  g[k].scheduledTime = { local: AT, utc: AT };
  delete g[k].revisedTime; delete g[k].runwayTime; delete g[k].predictedTime;
  return g;
};
function mapOne(row, dir) {
  const out = the('mapADB')({ [dir === 'dep' ? 'departures' : 'arrivals']: [timed(row, dir)] }, dir);
  assert.ok(Array.isArray(out) && out.length <= 1, 'one row in, at most one row out');
  return out[0] || null;
}
const carrierOf = (num) => {
  const n = String(num || '').toUpperCase().replace(/\s+/g, '');
  const m = n.match(/^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])(?=\d)/);
  return m ? m[0] : n.replace(/[0-9].*/, '');
};
// What a board row prints for its airline (the row cases _airlineName with tcAirline).
function printed(f) {
  const code = String(f.airline || '').trim().toUpperCase();
  const name = String(f._airlineName || '').trim();
  const shown = String(the('tcAirline')(name || the('AIRLINE_NAME')[code] || code || '', code) || '').trim();
  const bare = !name || !shown || [code, carrierOf(f.flight)].some((c) => c && (name.toUpperCase() === c || shown.toUpperCase() === c));
  return { shown, bare };
}

// ── the phone app, as the page builds it ───────────────────────────────────
// Its own tables, then the boards' from shared-names.js, cut from app.html
// with the real adbToCard and name function. The page loads feed-router.js
// before its own script, so window.fidsRowOffBoard there is the very function
// the board asks: here it is the one the board's page above loaded.
function appFn(name) {
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
}
// (pageVars: source for a variable of the page the cut functions read, CURAP)
function buildApp(win, pageVars) {
  const cut = (re) => { const m = APP.match(re); assert.ok(m, 'app.html: ' + re); return m[0]; };
  vm.runInNewContext(SHARED, { window: win });
  // (_CODE_CUT and _CODE_SENT: the page's notes of the place codes a feed cut or sent, which the mapper writes to)
  const src = (pageVars || '') + 'const FIDS_SHARED_AIRLINE = window.FIDS_SHARED_AIRLINE, FIDS_SHARED_WORDMARK = window.FIDS_SHARED_WORDMARK; const _CODE_CUT = {}, _CODE_SENT = {};'
    + cut(/\nconst AIRLINE=\{[\s\S]*?\};/) + cut(/\nif\(window\.FIDS_SHARED_AIRLINE\)[^\n]*/)
    + cut(/\nconst WORDMARK=\{[\s\S]*?\};/) + cut(/\nconst BRAND=\{[\s\S]*?\};/)
    + cut(/\nconst REGIONAL_FAM=\{[^\n]*\};/) + cut(/\nconst REGIONAL_OP=\{[^\n]*\};/) + cut(/\nconst AL_CASE=\{[\s\S]*?\};/) + '\n'
    + appFn('wmUrls') + appFn('adbHHMM') + appFn('inferOperator') + appFn('adbToCard') + appFn('alCase') + appFn('airlineName')
    + '; return { adbToCard: adbToCard, airlineName: airlineName };';
  return new Function('window', src)(win);
}
let APP_ = null;
const theApp = () => APP_ || (APP_ = buildApp({ fidsRowOffBoard: the('fidsRowOffBoard') }));
const card = (row, dir) => theApp().adbToCard(timed(row, dir), dir);

// One row through both screens: [stays on the board, is a card on the phone].
const both = (row, dir) => [!!mapOne(row, dir), !!card(row, dir)];
const OFF = [false, false], ON = [true, true];
const why = (row, dir, named) => the('fidsRowOffBoard')(row, dir, '', named);

// ── a row in the list it came in ───────────────────────────────────────────
// One kind of row is judged with the list around it (a second listing). The
// whole list goes to the real mappers, moved in time as one piece so the row
// asked about stands an hour from now and every other row keeps its distance
// from it.
const norm = (n) => String(n || '').toUpperCase().replace(/\s+/g, '');
const AT_MS = Date.parse(AT.replace(' ', 'T'));
const stamp = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
const legOf = (r, dir) => (dir === 'dep' ? r.departure : r.arrival) || {};
const timeOf = (r, dir) => { const st = legOf(r, dir).scheduledTime || {}; return Date.parse(String(st.utc || st.local || '').replace(' ', 'T')); };
function inList(focus, dir, list) {
  const by = AT_MS - timeOf(focus, dir);
  assert.ok(isFinite(by), 'the row has a time');
  let mine = null;
  const moved = list.map((r) => {
    const g = JSON.parse(JSON.stringify(r)), k = dir === 'dep' ? 'departure' : 'arrival';
    g[k] = g[k] || {};
    const t = stamp(timeOf(r, dir) + by);
    g[k].scheduledTime = { local: t, utc: t };
    delete g[k].revisedTime; delete g[k].runwayTime; delete g[k].predictedTime;
    if (r === focus) mine = g;
    return g;
  });
  assert.ok(mine, 'the row is on its list');
  return { row: mine, list: moved };
}
// [stays on the board, is a card on the phone], the row read on its list.
function bothIn(focus, dir, list, ap) {
  const L = inList(focus, dir, list);
  const out = the('mapADB')({ [dir === 'dep' ? 'departures' : 'arrivals']: L.list }, dir);
  const f = Array.from(out).find((x) => x.flight === norm(L.row.number) && x._sortTs === AT_MS) || null;
  const c = theApp().adbToCard(L.row, dir, undefined, ap, L.list);
  return { board: f, card: c, both: [!!f, !!c], why: the('fidsRowOffBoard')(L.row, dir, ap, true, L.list) };
}
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// A row as an airport's own feed sends it (the adapters of feed-router.js,
// the worker's authorityFlight): the airline on both legs, none at the top.
//   ap: the airport of the board; far: the other airport (a code, or an
//   object); name: the airline's name on the legs (null: the feed names none);
//   terminal, gate, belt: the place the airport gives the flight;
//   min: minutes after the hour the rows of this file stand at.
function row(o) {
  const dir = o.dir || 'dep', ap = o.ap || 'MIA', num = o.number;
  const al = { iata: own(o, 'code') ? o.code : carrierOf(num), icao: null, name: own(o, 'name') ? o.name : 'Meridian Air Express' };
  const when = o.min ? stamp(AT_MS + o.min * 60000) : AT;
  const home = { airport: { iata: ap, icao: 'K' + ap, name: ap }, scheduledTime: { local: when, utc: when }, airline: al, quality: ['Live'] };
  if (o.terminal != null) home.terminal = o.terminal;
  if (o.gate != null) home.gate = o.gate;
  const other = { airport: typeof o.far === 'object' ? o.far : { iata: o.far || 'HAV', icao: null, name: null }, airline: al, quality: ['Live'] };
  const f = { number: num, callSign: null, status: 'scheduled', codeshareStatus: 'IsOperator', isCargo: false };
  if (dir === 'arr') { f.arrival = home; f.departure = other; if (o.belt != null) home.baggageBelt = o.belt; } else { f.departure = home; f.arrival = other; }
  return Object.assign(f, o.more || {});
}
// A code nothing in the board names, so only the feed can; and a code the
// tables do name, flying scheduled flights.
const NOBODY = 'XQQ';

// ═══════════════════════════════════════════════════════════════════════════
// 1. ONE FUNCTION, ASKED BY BOTH SCREENS
// ═══════════════════════════════════════════════════════════════════════════

test('the rule is one function of the shared data layer, and every mapper asks it', () => {
  // defined once, in feed-router.js: no copy in the board script or in the app
  assert.equal(ROUTER.split('\nfunction fidsRowOffBoard(').length - 1, 1, 'feed-router.js defines fidsRowOffBoard once');
  for (const [name, src] of [['fids-core.js', CORE], ['app.html', APP], ['shared-names.js', SHARED], ['studio-data.js', STUDIO]]) {
    assert.ok(!/function\s+fidsRowOffBoard\b/.test(src), name + ' holds no copy of the rule');
    assert.ok(!/function\s+fidsSecondListing\b/.test(src), name + ' holds no copy of the second-listing rule');
    assert.ok(!/FIDS_PLACED_FEEDS\s*=/.test(src), name + ' holds no copy of its table');
  }
  // the board: mapADB asks it, for every row, with the airport of the board, whether the row is named, and the list
  const at = CORE.indexOf('\nfunction mapADB(');
  const mapSrc = CORE.slice(at, CORE.indexOf('\n}\n', at));
  assert.match(mapSrc, /if \(typeof fidsRowOffBoard === 'function' \? fidsRowOffBoard\(f, mode, _rowHome, _rowNamed, list\) : f\.isCargo === true\) return null;/, 'mapADB drops the row the rule names');
  assert.match(mapSrc, /const _rowHome=String\(\(document\.getElementById\('apSel'\)\|\|\{\}\)\.value\|\|''\);/);
  assert.match(mapSrc, /list=mode==='dep'\?\(raw\.departures\|\|\[\]\):\(raw\.arrivals\|\|\[\]\)/, 'the list handed to the rule is the list as the airport sent it');
  // the phone: adbToCard asks the same function, off the page it was loaded into, with the airport and the list of the request
  const cardSrc = appFn('adbToCard');
  assert.match(cardSrc, /const _rowOff=_W\.fidsRowOffBoard;/);
  assert.match(cardSrc, /if\(typeof _rowOff==='function'&&_rowOff\(f,dir,ap\|\|\(typeof CURAP!=='undefined'\?CURAP:''\),/);
  assert.match(cardSrc, /,list\)\)return null;/);
  assert.match(APP, /let all=raw\.map\(x=>adbToCard\(x,dir,_aheadMs,ap,raw\)\)/, 'fetchDir hands adbToCard the airport it asked for and the list it got');
  // the Studio player: its live list asks it too, and loads the lists of the boards beside the router
  assert.match(STUDIO, /page\.fidsRowOffBoard\(f, mode, home, named, list\)/);
  assert.match(STUDIO, /values\.filter\(function \(flight\) \{ return !rowOffEveryScreen\(flight, mode, context\.iata \|\| '', values, page\); \}\)/);
  for (const file of ['studio-player.js', 'studio.js']) {
    const src = read('fids-current/js/' + file);
    assert.match(src, /names\.src = '\.\.\/js\/shared-names\.js\?v=\d+';/, file + ' loads the code list of the boards for its live list');
    assert.match(src, /namesReady\.then\(function \(\) \{ resolve\(window\.adbFetch\); \}\)/, file + ' hands the router over once the list is in');
    assert.ok(!/=== 'function'\) resolve\(window\.adbFetch\);/.test(src), file + ' does not hand the router over before the list');
    // the list is loaded at the build of the router beside it
    const tags = src.match(/'\.\.\/js\/(?:shared-names|feed-router)\.js\?v=(\d+)'/g).map((t) => t.match(/v=(\d+)/)[1]);
    assert.ok(tags.length === 2 && tags[0] === tags[1], file + ' loads both files at one build: ' + tags.join(', '));
  }
  // and every page that maps rows loads the file that holds it, before the script that asks
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = read('fids-current/' + page);
    const r = html.indexOf('js/feed-router.js?v='), c = html.indexOf('js/fids-core.js?v=');
    assert.ok(r > 0 && c > r, page + ' loads feed-router.js before fids-core.js');
  }
  const r = APP.indexOf('<script src="js/feed-router.js?v='), c = APP.indexOf('\nfunction adbToCard(');
  assert.ok(r > 0 && c > r, 'app.html loads feed-router.js before its own script');
  // it is the same function object on both screens in this test, as on the page
  assert.equal(typeof the('fidsRowOffBoard'), 'function');
  // without the function (a page that could not load the router) the app maps rows as it did
  const bare = buildApp({});
  assert.ok(bare.adbToCard(timed(row({ dir: 'arr', ap: 'MIA', far: 'MIA', number: 'BBQ2211A', gate: 'F21', terminal: 'F' }), 'arr'), 'arr'));
});

test('a board whose cache holds an older feed-router.js maps its rows as it did, and does not go empty', () => {
  // fids-core.js and feed-router.js are two files: a screen can hold the new
  // board script with the router of the build before, which has no such
  // function. The call threw on every row and the board listed nothing.
  const ctx = B(), fn = the('fidsRowOffBoard');
  const plain = row({ dir: 'arr', ap: 'MIA', far: 'LHR', number: 'AA57', name: 'American Airlines', terminal: 'D', gate: 'D23' });
  try {
    vm.runInContext('fidsRowOffBoard = undefined;', ctx);
    assert.equal(the('fidsRowOffBoard'), undefined, 'the page has no such function');
    const f = mapOne(plain, 'arr');
    assert.ok(f && f.flight === 'AA57', 'an ordinary row is mapped');
    // the cargo mark, which the board read itself before the rule, is still read
    assert.equal(mapOne(Object.assign({}, plain, { isCargo: true }), 'arr'), null);
    // and the rows of the new rule stay, as they did before it
    assert.ok(mapOne(row({ dir: 'arr', ap: 'MIA', far: 'MIA', number: 'BBQ2211A', name: 'Eastern Air Express', gate: 'F21' }), 'arr'));
  } finally {
    ctx.fidsRowOffBoard = fn;
  }
  assert.equal(typeof the('fidsRowOffBoard'), 'function');
  assert.equal(mapOne(row({ dir: 'arr', ap: 'MIA', far: 'MIA', number: 'BBQ2211A', name: 'Eastern Air Express', gate: 'F21' }), 'arr'), null, 'the rule is back');
});

test('the phone judges a row against the airport its list was asked for', () => {
  // a row that does not carry its own airport (the webhook rows of Moncton)
  const noHome = (far) => { const r = row({ dir: 'arr', ap: 'YQM', far, number: 'AC7690', name: 'Air Canada', gate: '23' }); delete r.arrival.airport; return r; };
  const app = theApp();
  assert.equal(app.adbToCard(noHome('YOW'), 'arr', undefined, 'YOW'), null, 'from Ottawa, on the list asked for Ottawa: off');
  assert.ok(app.adbToCard(noHome('YOW'), 'arr', undefined, 'YUL'), 'from Ottawa, on the list asked for Montreal: a card');
  assert.ok(app.adbToCard(noHome('YOW'), 'arr'), 'no airport known: the row stays');
  // a caller that names no airport: the airport the page is on
  const onOttawa = buildApp({ fidsRowOffBoard: the('fidsRowOffBoard') }, "let CURAP='YOW';");
  assert.equal(onOttawa.adbToCard(noHome('YOW'), 'arr'), null, 'the page is on Ottawa');
  assert.ok(onOttawa.adbToCard(noHome('YUL'), 'arr'));
  // and the airport of the request outranks it: the page may be on another airport by the time the list is back
  assert.ok(onOttawa.adbToCard(noHome('YOW'), 'arr', undefined, 'YUL'), 'the list was asked for Montreal');
  assert.equal(onOttawa.adbToCard(noHome('YUL'), 'arr', undefined, 'YUL'), null);
  // the airport also decides where one letter is read: Charlotte and Chicago, not Montreal
  const pair = (ap) => {
    const a = row({ dir: 'arr', ap, far: 'IST', number: 'TK67C', name: 'Turkish Airlines' }), b = row({ dir: 'arr', ap, far: 'IST', number: 'TK185', name: 'Turkish Airlines', terminal: '5', min: 37 });
    delete a.arrival.airport; delete b.arrival.airport;
    return [a, [a, b]];
  };
  const [tk, list] = pair('ORD');
  assert.equal(app.adbToCard(tk, 'arr', undefined, 'ORD', list), null);
  assert.ok(app.adbToCard(tk, 'arr', undefined, 'YUL', list));
  assert.ok(onOttawa.adbToCard(tk, 'arr', undefined, '', list), 'Ottawa is not a feed that places every flight');
  // the board: the airport of the board, for the same row
  assert.equal(the('fidsRowOffBoard')(tk, 'arr', 'ORD', true, list), 'callsign');
  assert.equal(the('fidsRowOffBoard')(tk, 'arr', 'YUL', true, list), '');
});

test('the two screens judge whether anybody names a row from the same codes', () => {
  assert.ok(!own(the('AIRLINE_NAME'), 'ZQ') && !own(the('AIRLINE_NAME'), NOBODY));
  for (const dir of ['arr', 'dep']) {
    // a code at the top that no table knows, on a number whose carrier the tables name: the board brands by the
    // number and keeps the row; the phone dropped it when it had no gate, and printed the bare code when it had one
    // (PTR is Porter filed under its three letters: both screens fold it into PD)
    for (const [num, name, code] of [['AA123', 'American', 'AA'], ['G6201', 'GlobalX Airlines', 'G6'], ['PTR123', 'Porter', 'PD']]) {
      for (const gate of [null, 'A1']) {
        const r = row({ dir, ap: 'PHL', far: 'LAS', number: num, name: null, gate, more: { airline: { iata: 'ZQ' } } });
        const f = mapOne(r, dir), c = card(r, dir);
        assert.ok(f && c, num + ' under ZQ, gate ' + gate + ', ' + dir + ': on both screens');
        assert.equal(printed(f).shown, name);
        assert.equal(fold(theApp().airlineName(c)).indexOf(fold(name)), 0, 'the phone prints ' + name + ', not ZQ: ' + theApp().airlineName(c));
        assert.equal(c.airline, code);
        assert.equal(f.airline, code, 'the card and the row are of the same airline');
      }
    }
    // nobody names either code and the feed names nobody: off both with no place, on both at a gate
    const none = (gate) => row({ dir, ap: 'PHL', far: 'LAS', number: NOBODY + '450', code: NOBODY, name: null, gate, more: { airline: { iata: 'ZQ' } } });
    assert.deepEqual(both(none(null), dir), OFF, dir);
    assert.deepEqual(both(none('A14'), dir), ON, dir);
    // a code at the top that the app knows keeps the card it had: Jazz under an Air Canada number
    const jazz = card(row({ dir, ap: 'YQM', far: 'YUL', number: 'AC8901', name: 'Air Canada', gate: '4', more: { airline: { iata: 'QK', name: 'Jazz' } } }), dir);
    assert.equal(jazz.airline, 'AC');
    // (so does any code at the top the app can name, whatever the number: the card of such a row is not touched here)
    const top = card(row({ dir, ap: 'YQM', far: 'YYC', number: 'DL7123', name: 'Delta Air Lines', gate: '4', more: { airline: { iata: 'WS', name: 'WestJet' } } }), dir);
    assert.equal(top.airline, 'WS');
    // and a code at the top that only the feed names, on a number no table names, keeps its own name
    const fed = card(row({ dir, ap: 'PHL', far: 'LAS', number: NOBODY + '450', code: NOBODY, name: null, gate: 'A14', more: { airline: { iata: 'ZQ', name: 'Zenith Air' } } }), dir);
    assert.equal(theApp().airlineName(fed), 'Zenith Air');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE RULE, KIND BY KIND
// ═══════════════════════════════════════════════════════════════════════════

test('the other airport is this airport: off both screens, whatever else the row has', () => {
  for (const dir of ['arr', 'dep']) {
    // a named airline, a gate, a terminal, a belt: still an aeroplane that came back
    const r = row({ dir, ap: 'MIA', far: 'MIA', number: 'BBQ2211A', name: 'Eastern Air Express', terminal: 'F', gate: 'F21', belt: 'D3' });
    assert.deepEqual(both(r, dir), OFF, dir);
    assert.equal(why(r, dir), 'home');
    // a scheduled airline the tables name, with a plain number (Denver: UA 2257 from Denver at gate A30)
    assert.deepEqual(both(row({ dir, ap: 'DEN', far: 'DEN', number: 'UA2257', name: 'United Airlines', gate: 'A30' }), dir), OFF, dir + ' Denver');
    // the same flight from anywhere else stays
    assert.deepEqual(both(row({ dir, ap: 'DEN', far: 'ASE', number: 'UA2257', name: 'United Airlines', gate: 'A30' }), dir), ON, dir + ' from Aspen');
    assert.deepEqual(both(row({ dir, ap: 'MIA', far: 'SNU', number: 'BBQ2211', name: 'Eastern Air Express', terminal: 'F', gate: 'F21' }), dir), ON, dir + ' Santa Clara');
    // the far end sent as an ICAO code alone
    assert.deepEqual(both(row({ dir, ap: 'MIA', far: { iata: null, icao: 'KMIA', name: 'Miami' }, number: 'BBQ2211A', gate: 'F21' }), dir), OFF, dir + ' by ICAO code');
    assert.deepEqual(both(row({ dir, ap: 'MIA', far: { iata: null, icao: 'KFLL', name: 'Fort Lauderdale' }, number: 'BBQ2211A', gate: 'F21' }), dir), ON, dir + ' another ICAO code');
    // small letters and spaces in the codes change nothing
    assert.equal(why(row({ dir, ap: 'MIA', far: ' mia ', number: 'AA 12', gate: 'D1' }), dir), 'home');
  }
  // a row that does not carry its own airport is judged against the airport of the board
  const noHome = row({ dir: 'arr', far: 'YOW', number: 'AC7690', gate: '23' });
  delete noHome.arrival.airport;
  const off = the('fidsRowOffBoard');
  assert.equal(off(noHome, 'arr', 'YOW'), 'home');
  assert.equal(off(noHome, 'arr', 'YUL'), '');
  assert.equal(off(noHome, 'arr', ''), '', 'no airport known: the row stays');
  assert.equal(off(noHome, 'arr', undefined), '');
  // a far end with no code at all is not this airport
  assert.equal(why(row({ dir: 'arr', ap: 'PHL', far: { iata: null, icao: null, name: 'Philadelphia' }, number: 'AA2102', gate: 'C21' }), 'arr'), '');
});

test('the other end has no code and no name: off both screens, as it always was off the board', () => {
  for (const dir of ['arr', 'dep']) {
    // Denver sends a space where the code goes; Philadelphia sends nothing
    for (const far of [{ iata: ' ', icao: null, name: null }, { iata: null, icao: null, name: null }, { iata: '', icao: '', name: '' }, { iata: null, icao: null, name: 'Unknown' }, { iata: null, icao: null, name: ' unknown ' }, {}]) {
      // with a gate (United 1395 at Denver, American 2338 at Philadelphia) and without (Contour LF 6354)
      for (const gate of ['B41', null]) {
        const r = row({ dir, ap: 'DEN', far, number: 'UA1395', name: 'United Airlines', gate });
        assert.deepEqual(both(r, dir), OFF, dir + ' ' + JSON.stringify(far) + ' gate ' + gate);
        assert.equal(why(r, dir, true), 'nowhere');
      }
    }
    // a name with no code, a code with no name, an ICAO code alone: the row says where it goes, and stays
    for (const far of [{ iata: null, icao: null, name: 'Aspen' }, { iata: 'ASE', icao: null, name: null }, { iata: null, icao: 'KASE', name: null }, { iata: null, icao: null, municipalityName: 'Aspen' }]) {
      const r = row({ dir, ap: 'DEN', far, number: 'UA1395', name: 'United Airlines', gate: 'B41' });
      assert.deepEqual(both(r, dir), ON, dir + ' ' + JSON.stringify(far));
      assert.equal(why(r, dir, true), '');
    }
  }
  // the board has its own line for it still (a page whose router is older), and the rule says the same
  assert.match(CORE, /if \(!locIata && \(!cityName \|\| \/\^unknown\$\/i\.test\(String\(cityName\)\.trim\(\)\)\)\) return null;/);
});

test('the airport marks the flight as in no public terminal and gives it no gate: off both screens', () => {
  for (const dir of ['arr', 'dep']) {
    // Miami, G6 6175: the mark, no gate; the arrival even has a belt
    const g6 = row({ dir, ap: 'MIA', far: dir === 'arr' ? 'MYC' : 'AEX', number: 'G66175', name: 'GlobalX Airlines', belt: 'CE', more: { _noPublicTerminal: true } });
    assert.deepEqual(both(g6, dir), OFF, dir);
    assert.equal(why(g6, dir), 'no-terminal');
    // the mark with a gate: the airport put it at a gate, it stays
    assert.deepEqual(both(row({ dir, far: 'CAP', number: 'G6201', name: 'GlobalX Airlines', gate: 'F12', more: { _noPublicTerminal: true } }), dir), ON, dir + ' with a gate');
    // no gate and no mark: an ordinary flight whose gate is not posted yet
    assert.deepEqual(both(row({ dir, far: 'CAP', number: 'G6201', name: 'GlobalX Airlines' }), dir), ON, dir + ' no gate, no mark');
    // the mark is the adapter's true, nothing else
    for (const v of ['NO', 1, 'true', null]) assert.equal(why(row({ dir, far: 'CAP', number: 'G6201', more: { _noPublicTerminal: v } }), dir), '', dir + ' mark ' + JSON.stringify(v));
    // a gate the feed writes as a dash is no gate
    assert.equal(why(row({ dir, far: 'MYC', number: 'G66175', gate: '-', more: { _noPublicTerminal: true } }), dir), 'no-terminal');
  }
});

test('Miami writes NO for no public terminal: the adapter reads it as the mark, and never as a terminal', () => {
  const mia = the('miaToAdbFlight');
  const rec = (o) => Object.assign({ city: 'MARACAY', stt: '2026-11-18T17:40:00', ett: '2026-11-18T17:40:00', att: '', status: 'On Time', gate: '', terminal: 'NO', bags: 'CE',
    airlineName: 'GlobalX Airlines', CXR: 'G6', TRN: '6175', CTY: 'MYC', TYP: 'A321', REG: 'N966AD', timeInMillis: '1795041600000' }, o);
  for (const [dirName, leg] of [['Arrival', 'arrival'], ['Departure', 'departure']]) {
    const no = mia(rec({}), dirName);
    assert.equal(no._noPublicTerminal, true, dirName);
    assert.equal(no[leg].terminal, null, 'NO is not a terminal');
    for (const spelt of ['no', ' NO ']) assert.equal(mia(rec({ terminal: spelt }), dirName)._noPublicTerminal, true, JSON.stringify(spelt));
    // a concourse letter is a terminal and no mark; so is an empty field
    const f = mia(rec({ terminal: 'F', gate: 'F10' }), dirName);
    assert.equal(f[leg].terminal, 'F');
    assert.ok(!own(f, '_noPublicTerminal'));
    const none = mia(rec({ terminal: '' }), dirName);
    assert.equal(none[leg].terminal, null);
    assert.ok(!own(none, '_noPublicTerminal'), 'an empty terminal is not the mark');
  }
  // the fields the rule reads reach the page: the worker forwards them
  const fields = read('worker-entry.js').match(/const MIA_FIELDS = \[([\s\S]*?)\];/);
  assert.ok(fields, 'worker-entry.js lists MIA_FIELDS');
  for (const f of ['terminal', 'gate', 'CTY', 'CXR', 'TRN', 'bags']) assert.ok(fields[1].includes("'" + f + "'"), f + ' is forwarded by /miafids');
});

test('a flight number that is a tail number is private aviation: off both screens', () => {
  const isTail = the('fidsNumberIsTail');
  for (const n of ['N966AD', 'N12AB', 'C-GABC', 'CGABC', 'C-FTOE', 'VH-ABC', 'G-EUPT', '9H-VJA']) assert.equal(isTail(n), true, n);
  // the registration the row itself carries, with or without its hyphen
  assert.equal(isTail('N5332', 'N5332'), true);
  assert.equal(isTail('CGKQA', 'C-GKQA'), true);
  // numbers that are flight numbers, whatever they look like
  for (const n of ['N5332', 'N8910', 'AC91Z', 'BBQ2211A', 'G66175', 'B6073', 'S6623', '5Y826D', 'U21234', 'CSQ761', 'AA1', 'KLM1234', '', null]) assert.equal(isTail(n), false, String(n));
  assert.equal(isTail('AC123', 'C-GABC'), false, 'a flight is not its aircraft');
  assert.equal(isTail('AA1', ''), false);
  for (const dir of ['arr', 'dep']) {
    for (const n of ['N966AD', 'C-GABC', 'CGABC']) {
      const r = row({ dir, far: 'TEB', number: n, code: null, name: null, gate: 'F3' });
      assert.deepEqual(both(r, dir), OFF, n + ' ' + dir);
      assert.equal(why(r, dir), 'tail');
    }
    // the number is the registration on the row (Miami sends the tail as reg)
    assert.equal(why(row({ dir, far: 'TEB', number: 'N5332', gate: 'F3', more: { reg: 'N5332' } }), dir), 'tail');
    assert.equal(why(row({ dir, far: 'TEB', number: 'N5332', gate: 'F3', more: { aircraft: { reg: 'N5332' } } }), dir), 'tail');
    // Nolinor N5 332 with the tail of its aeroplane stays
    assert.deepEqual(both(row({ dir, ap: 'YXE', far: 'YUL', number: 'N5332', name: 'Nolinor Aviation', gate: '4', more: { aircraft: { reg: 'C-GNLK' } } }), dir), ON, 'Nolinor ' + dir);
  }
});

test('a callsign where the flight number goes, on a row with no place: off both screens', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(the('FIDS_PLACED_FEEDS'))), { ORD: 1, CLT: 1 },
    'the airports whose own feed places every public flight. One is added with the count that shows it, written beside it in feed-router.js');
  for (const dir of ['arr', 'dep']) {
    // TWO LETTERS OR MORE after the digits is a radio callsign: at any airport
    for (const [ap, n, name] of [['ORD', 'BA2PD', 'British Airways'], ['ORD', 'IB3GA', 'Iberia'], ['LHR', 'BA2PD', 'British Airways'], ['YYT', 'AC12AB', 'Air Canada']]) {
      const r = row({ dir, ap, far: 'MAD', number: n, name });
      assert.deepEqual(both(r, dir), OFF, n + ' at ' + ap + ' ' + dir);
      assert.equal(why(r, dir), 'callsign');
      // with a gate, a terminal or a belt the airport has placed it: it stays
      assert.deepEqual(both(row({ dir, ap, far: 'MAD', number: n, name, gate: 'M12' }), dir), ON, n + ' with a gate');
      assert.deepEqual(both(row({ dir, ap, far: 'MAD', number: n, name, terminal: '5' }), dir), ON, n + ' with a terminal');
    }
    // ONE LETTER is a suffix passenger flights carry. Alone on its list, with no place, it stays: at any airport
    for (const [ap, n, name] of [['ORD', 'TK67C', 'Turkish Airlines'], ['ORD', 'AA179Q', 'American Airlines'], ['ORD', 'OO285R', 'SkyWest Airlines'], ['CLT', 'AA473Q', null]]) {
      const r = row({ dir, ap, far: 'IAH', number: n, name });
      assert.deepEqual(both(r, dir), ON, n + ' alone at ' + ap + ' ' + dir);
      assert.equal(why(r, dir), '', 'a caller with no list takes no one-letter row off');
      assert.equal(the('fidsRowOffBoard')(r, dir, ap, true, [r]), '');
    }
    // one letter, no place, at an airport whose feed places nobody (St. John's, Sydney, Dublin): stays
    for (const ap of ['YYT', 'SYD', 'DUB', 'MIA', 'YYZ', 'PHL']) {
      assert.deepEqual(both(row({ dir, ap, far: 'EZE', number: 'AC91Z', name: 'Air Canada' }), dir), ON, 'AC91Z with no place at ' + ap + ' ' + dir);
    }
    // Toronto, as recorded: AC91Z at gate E80
    assert.deepEqual(both(row({ dir, ap: 'YYZ', far: 'EZE', number: 'AC91Z', name: 'Air Canada', terminal: 'T1', gate: 'E80' }), dir), ON);
    // a plain number with no place is an ordinary flight, even at Chicago
    assert.deepEqual(both(row({ dir, ap: 'ORD', far: 'HVN', number: 'XP421', name: 'Xtra Airways' }), dir), ON, 'Avelo at Chicago ' + dir);
    assert.deepEqual(both(row({ dir, ap: 'ORD', far: 'PUJ', number: 'DM5480', name: 'Arajet' }), dir), ON, 'Arajet at Chicago ' + dir);
  }
  // an arrival with a belt and nothing else has a place
  assert.deepEqual(both(row({ dir: 'arr', ap: 'ORD', far: 'MAD', number: 'IB3GA', name: 'Iberia', belt: '7' }), 'arr'), ON);
  // a departure is not placed by a belt on its far leg
  const dep = row({ dir: 'dep', ap: 'ORD', far: 'MAD', number: 'IB3GA', name: 'Iberia' });
  dep.arrival.baggageBelt = '7';
  assert.deepEqual(both(dep, 'dep'), OFF);
  // the place words, read once for every rule
  const word = the('fidsPlaceWord');
  for (const none of ['', ' ', '-', '--', '—', '0', '00', '?', '??', 'None', 'null', 'N/A', 'na', 'TBA', 'tbd', null, undefined]) assert.equal(word(none), '', JSON.stringify(none));
  for (const some of ['F21', 'D', '5', 'INTL', 'T1', 'CE', '10', 'A0']) assert.equal(word(some), some, some);
});

test('an airline nobody names, on a row with no place: off both screens; named or placed, it stays', () => {
  for (const t of ['AIRLINE_NAME', '_AIRLINE_NAME_OVERRIDE', 'PARENT']) assert.ok(!own(the(t), NOBODY) && !own(the(t), 'XA'), 'no table names ' + NOBODY + ' or XA (' + t + ')');
  assert.ok(!the('FILTER_OUT').has(NOBODY) && !the('FILTER_OUT').has('XA'));
  for (const dir of ['arr', 'dep']) {
    // Philadelphia, XA 5903: a code, no name, no gate
    for (const [n, code] of [['XA 5903', 'XA'], [NOBODY + '450', NOBODY]]) {
      assert.deepEqual(both(row({ dir, ap: 'PHL', far: 'LAS', number: n, code, name: null }), dir), OFF, n + ' ' + dir);
      // the feed writing the code where the name goes names nobody
      assert.deepEqual(both(row({ dir, ap: 'PHL', far: 'LAS', number: n, code, name: code }), dir), OFF, n + ' named by its own code ' + dir);
      // at a gate it stays (and the every-row test asks for its name)
      assert.deepEqual(both(row({ dir, ap: 'PHL', far: 'LAS', number: n, code, name: null, gate: 'A14' }), dir), ON, n + ' at a gate ' + dir);
      // named by its airport it stays, place or no place
      assert.deepEqual(both(row({ dir, ap: 'PHL', far: 'LAS', number: n, code, name: 'Meridian Air Express' }), dir), ON, n + ' named by the airport ' + dir);
    }
    // an airline the tables name stays with no place and no name from the feed (Frontier at Philadelphia)
    assert.deepEqual(both(row({ dir, ap: 'PHL', far: 'ATL', number: 'F9 2552', name: null }), dir), ON, 'Frontier ' + dir);
    // and one the tables name whose feed writes the code where the name goes
    assert.deepEqual(both(row({ dir, ap: 'EDI', far: 'AMS', number: 'KL1281', code: 'KL', name: 'KL' }), dir), ON, 'KLM named KL by its feed ' + dir);
  }
  // the function says it only when the caller says nobody names the row
  const r = row({ dir: 'arr', ap: 'PHL', far: 'LAS', number: 'XA5903', code: 'XA', name: null });
  assert.equal(why(r, 'arr', false), 'unnamed');
  assert.equal(why(r, 'arr', true), '');
  assert.equal(why(r, 'arr', undefined), '', 'a caller that does not say is not taken for a no');
});

test('a row the feed marks as cargo is off both screens', () => {
  for (const dir of ['arr', 'dep']) {
    const r = row({ dir, far: 'BOG', number: 'AA904', name: 'American Airlines', gate: 'D3', more: { isCargo: true } });
    assert.deepEqual(both(r, dir), OFF, dir);
    assert.equal(why(r, dir), 'cargo');
    assert.deepEqual(both(row({ dir, far: 'BOG', number: 'AA904', name: 'American Airlines', gate: 'D3', more: { isCargo: false } }), dir), ON);
  }
});

test('what is not evidence: the row stays on both screens', () => {
  for (const dir of ['arr', 'dep']) {
    const stays = (o, what) => { assert.deepEqual(both(row(Object.assign({ dir }, o)), dir), ON, what + ' ' + dir); assert.equal(why(row(Object.assign({ dir }, o)), dir, true), '', what); };
    // a missing gate, a missing terminal, a missing belt: alone, or all three
    stays({ ap: 'DUB', far: 'LHR', number: 'EI154', name: 'Aer Lingus', terminal: '2' }, 'no gate at Dublin');
    stays({ ap: 'SYD', far: 'MEL', number: 'QF401', name: 'Qantas' }, 'no place at all at Sydney');
    stays({ ap: 'ORD', far: 'HVN', number: 'XP421', name: 'Xtra Airways' }, 'no place at all at Chicago');
    stays({ ap: 'MIA', far: 'HAV', number: 'WAL253', name: 'World Atlantic' }, 'a charter airline with no gate yet');
    // a terminal placeholder with or without a gate
    stays({ ap: 'EWR', far: 'CAI', number: 'MS988', name: 'EgyptAir', terminal: '0' }, 'terminal 0 at Newark');
    stays({ ap: 'LAS', far: 'MCE', number: 'LF3603', name: 'Contour', terminal: '??', gate: 'D59' }, 'terminal ?? at Las Vegas');
    // a number range that often means something
    stays({ ap: 'DEN', far: 'AFW', number: 'SY3076', name: 'Sun Country' }, 'Sun Country 3xxx');
    stays({ ap: 'DTW', far: 'ATL', number: 'DL9747', name: 'Delta Air Lines' }, 'Delta 97xx');
    // a public charter with a gate, or with a belt: by name
    stays({ ap: 'MIA', far: 'HAV', number: 'WAL253', name: 'World Atlantic', terminal: 'F', gate: 'F10' }, 'a public charter at a gate');
    stays({ ap: 'MIA', far: 'CAP', number: 'G6201', name: 'GlobalX Airlines', terminal: 'F', gate: 'F12' }, 'GlobalX to Cap-Haitien');
    stays({ ap: 'MIA', far: 'SNU', number: 'BBQ2211A', name: 'Eastern Air Express', terminal: 'F', gate: 'F21' }, 'a charter with a letter after its number, at a gate, from somewhere');
  }
  // nothing to read is nothing said
  const off = the('fidsRowOffBoard');
  for (const nothing of [null, undefined, '', 0, 'AA1', 7]) {
    assert.equal(off(nothing, 'dep', 'MIA'), '');
    assert.equal(off(nothing, 'arr', 'MIA'), '');
  }
  // a row that is an object with no far end says one thing: it goes nowhere a screen can print
  for (const empty of [{}, { number: 'AA1' }, { departure: null, arrival: null }]) {
    assert.equal(off(empty, 'dep', 'MIA'), 'nowhere');
    assert.equal(off(empty, 'arr', 'MIA'), 'nowhere');
  }
});

test('one letter after the number leaves only as a second listing of a flight the list holds', () => {
  const second = the('fidsSecondListing');
  assert.equal(the('FIDS_SECOND_LISTING_MS'), 90 * 60000, 'the widest gap measured between the two rows of one flight is 84 minutes (QR20V and QR725)');
  for (const dir of ['arr', 'dep']) {
    for (const ap of ['ORD', 'CLT']) {
      const tk = (o) => row(Object.assign({ dir, ap, far: 'IST', number: 'TK67C', name: 'Turkish Airlines' }, o));
      const flight = (o) => row(Object.assign({ dir, ap, far: 'IST', number: 'TK185', name: 'Turkish Airlines', terminal: '5', min: 37 }, o));
      const on = (a, list, what) => { const r = bothIn(a, dir, list, ap); assert.deepEqual(r.both, ON, what + ' (' + ap + ' ' + dir + ')'); assert.equal(r.why, '', what); };
      const off = (a, list, what) => { const r = bothIn(a, dir, list, ap); assert.deepEqual(r.both, OFF, what + ' (' + ap + ' ' + dir + ')'); assert.equal(r.why, 'callsign', what); };
      // THE FLIGHT ITSELF BESIDE IT: same airline, same airport at the far end, a plain number, a place, near in time
      let a = tk(), b = flight();
      off(a, [a, b], 'TK67C beside TK185 at terminal 5');
      // ... and the flight itself stays, with the place it has
      assert.deepEqual(bothIn(b, dir, [a, b], ap).both, ON, 'TK185 stays');
      b = flight({ terminal: null, gate: 'M12' }); off(a, [a, b], 'the flight has a gate');
      b = flight({ min: -37 }); off(a, [a, b], 'the flight stands before it');
      b = flight({ min: 90 }); off(a, [a, b], '90 minutes apart');
      // the same number without the letter is the plainest case (AA764P beside AA764)
      a = row({ dir, ap, far: 'IAH', number: 'AA764P', name: 'American Airlines' }); b = row({ dir, ap, far: 'IAH', number: 'AA764', name: 'American Airlines', terminal: '3', gate: 'L2A', min: 39 });
      off(a, [a, b], 'AA764P beside AA764');
      // NOT THE FLIGHT ITSELF: each of these keeps the row
      a = tk();
      on(a, [a], 'nothing beside it');
      on(a, [a, flight({ min: 91 })], '91 minutes apart');
      on(a, [a, flight({ min: -91 })], '91 minutes before');
      on(a, [a, flight({ min: 24 * 60 + 37 })], 'the flight of the next day');
      on(a, [a, flight({ terminal: null })], 'the flight beside it has no place either (a freighter beside a freighter)');
      on(a, [a, flight({ terminal: '0', gate: '-' })], 'the place words for nothing are no place');
      on(a, [a, flight({ far: 'SAW' })], 'another airport at the far end');
      on(a, [a, flight({ number: 'LH185', name: 'Lufthansa' })], 'another airline');
      on(a, [a, flight({ number: 'TK185C' })], 'the row beside it carries a letter too');
      on(a, [a, flight({ more: { status: 'cancelled' } })], 'the flight beside it is cancelled: the row may be the flight that replaces it');
      on(a, [a, flight({ more: { status: 'Canceled' } })], 'cancelled, as some feeds spell it');
      on(a, [a, flight({ more: { codeshareStatus: 'IsCodeshared' } })], 'the row beside it only sells the seats of another flight');
      // a place on the row itself: the airport has placed it, it stays
      for (const place of [{ gate: 'K5' }, { terminal: '3' }]) { a = tk(place); on(a, [a, flight()], 'TK67C with ' + JSON.stringify(place)); }
      // the feed words for nothing are no place: the row still leaves
      for (const none of ['0', '??', '?', '-', '—', 'None', 'TBA', ' ']) { a = tk({ terminal: none, gate: none }); off(a, [a, flight()], 'TK67C with ' + JSON.stringify(none)); }
      // A FLIGHT FILED AGAIN UNDER A LETTER: three digits that end a four-digit number of the airline on the
      // route. It stays, whatever stands beside it (Chicago: AA179Q, AA1179 that evening, AA2285 55 minutes on)
      const q = row({ dir, ap, far: 'SNA', number: 'AA179Q', name: 'American Airlines' });
      const evening = row({ dir, ap, far: 'SNA', number: 'AA1179', name: 'American Airlines', terminal: '3', gate: 'H17', min: 700 });
      const next = row({ dir, ap, far: 'SNA', number: 'AA2285', name: 'American Airlines', terminal: '3', gate: 'L2A', min: 55 });
      on(q, [q, evening, next], 'AA179Q is AA1179 filed again');
      on(q, [q, next, evening], 'in whatever order the list comes');
      on(q, [next, row({ dir, ap, far: 'SNA', number: 'AA1179', name: 'American Airlines', min: 24 * 60 + 700 }), q], 'the whole number on another day, with no place yet');
      // without the whole number on the list nothing says it was filed again, and the flight beside it takes it off
      off(q, [q, next], 'AA179Q with only AA2285 beside it');
      // the whole number on another route, or of another airline, says nothing
      off(q, [q, next, row({ dir, ap, far: 'LAX', number: 'AA1179', name: 'American Airlines', gate: 'H1', min: 700 })], 'AA1179 to another airport');
      off(q, [q, next, row({ dir, ap, far: 'SNA', number: 'UA1179', name: 'United Airlines', gate: 'B1', min: 700 })], 'UA1179');
      // only three digits that end four: AA79Q is not AA1179, AA179Q is not AA2179 less its 2 and more
      const short = row({ dir, ap, far: 'SNA', number: 'AA79Q', name: 'American Airlines' });
      off(short, [short, next, evening], 'two digits end many numbers');
      on(q, [q, next, row({ dir, ap, far: 'SNA', number: 'AA2179', name: 'American Airlines', gate: 'H2', min: 300 })], 'AA2179 ends in 179 as well');
    }
    // AT ANY OTHER AIRPORT one letter is never read, whatever the list holds
    for (const ap of ['YYZ', 'MIA', 'DUB', 'SYD', 'LHR']) {
      const a = row({ dir, ap, far: 'IST', number: 'TK67C', name: 'Turkish Airlines' }), b = row({ dir, ap, far: 'IST', number: 'TK185', name: 'Turkish Airlines', terminal: '5', min: 37 });
      assert.deepEqual(bothIn(a, dir, [a, b], ap).both, ON, 'TK67C beside TK185 at ' + ap + ' ' + dir);
    }
    // two letters need no list, and a list changes nothing for them
    const ba = row({ dir, ap: 'LHR', far: 'MAD', number: 'BA2PD', name: 'British Airways' });
    assert.deepEqual(bothIn(ba, dir, [ba], 'LHR').both, OFF);
  }
  // the function alone: what it does not take for a list or a row
  const a = row({ dir: 'arr', ap: 'ORD', far: 'IST', number: 'TK67C', name: 'Turkish Airlines' }), b = row({ dir: 'arr', ap: 'ORD', far: 'IST', number: 'TK185', name: 'Turkish Airlines', terminal: '5', min: 37 });
  assert.equal(second(a, 'arr', [a, b]), true);
  for (const noList of [undefined, null, '', {}, 5]) assert.equal(second(a, 'arr', noList), false, 'no list: ' + JSON.stringify(noList));
  assert.equal(second(a, 'arr', [null, undefined, 'x', {}, a]), false, 'a list of nothing');
  assert.equal(second(b, 'arr', [a, b]), false, 'a plain number is not a second listing');
  assert.equal(second(row({ dir: 'arr', ap: 'ORD', far: 'MAD', number: 'IB3GA' }), 'arr', [a, b]), false, 'two letters are not its business');
  const noTime = JSON.parse(JSON.stringify(a)); delete noTime.arrival.scheduledTime;
  assert.equal(second(noTime, 'arr', [noTime, b]), false, 'a row with no time');
  const noFar = JSON.parse(JSON.stringify(a)); noFar.departure.airport = {};
  assert.equal(second(noFar, 'arr', [noFar, b]), false, 'a row with no far end');
  // the far end sent as an ICAO code alone on both rows
  const ai = JSON.parse(JSON.stringify(a)), bi = JSON.parse(JSON.stringify(b));
  ai.departure.airport = { iata: null, icao: 'LTFM' }; bi.departure.airport = { iata: null, icao: 'LTFM' };
  assert.equal(second(ai, 'arr', [ai, bi]), true);
  // a belt places an arrival
  const belt = row({ dir: 'arr', ap: 'ORD', far: 'IST', number: 'TK185', name: 'Turkish Airlines', belt: '7', min: 37 });
  assert.equal(second(a, 'arr', [a, belt]), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. MIAMI, 2026-11-18, AS THE AIRPORT SENT IT
// ═══════════════════════════════════════════════════════════════════════════

// Every Miami record of the file, through the board's own adapter.
const miaRows = () => {
  const mia = the('miaToAdbFlight');
  const out = [];
  for (const dir of ['dep', 'arr']) for (const x of TODAY.mia[dir]) out.push({ dir, off: x.off || null, rec: x.rec, row: mia(x.rec, dir === 'dep' ? 'Departure' : 'Arrival') });
  return out;
};

test('Miami: BBQ 2211A from Miami and G6 6175 leave the board and the phone', () => {
  const left = miaRows().filter((x) => x.off);
  assert.deepEqual(left.map((x) => x.dir + ' ' + x.rec.CXR + ' ' + x.rec.TRN + ' ' + x.rec.CTY + ' ' + x.off).sort(),
    ['arr BBQ 2211A MIA home', 'arr G6 6175 MYC no-terminal', 'dep G6 6175 AEX no-terminal'], 'the three rows found that morning are in the file');
  for (const x of left) {
    const tag = x.rec.CXR + ' ' + x.rec.TRN + ' (' + x.dir + ')';
    assert.equal(mapOne(x.row, x.dir), null, tag + ' is off the board');
    assert.equal(card(x.row, x.dir), null, tag + ' is off the phone');
    assert.equal(why(x.row, x.dir, true), x.off, tag + ' leaves for the reason recorded');
  }
  // the records say it themselves: NO in the terminal field and no gate; the airport itself as the far end
  const g6 = left.filter((x) => x.rec.CXR === 'G6');
  for (const x of g6) { assert.equal(x.rec.terminal, 'NO'); assert.equal(x.rec.gate, ''); }
  const bbq = left.find((x) => x.rec.CXR === 'BBQ');
  assert.equal(bbq.rec.CTY, 'MIA');
  assert.equal(bbq.rec.gate, 'F21', 'it had a gate: the far end alone takes it off');
  // and the airlines themselves are not on the code list: their passenger flights stay
  for (const c of ['BBQ', 'G6', 'WAL', 'WL', 'CSQ', 'H8']) assert.ok(!the('FILTER_OUT').has(c), c + ' is not kept off whole');
});

test('Miami: the public charters and the scheduled flights beside them stay, each by its airline name', () => {
  const stay = miaRows().filter((x) => !x.off);
  assert.ok(stay.length >= 20, stay.length + ' rows that stay');
  const names = {}, charters = [];
  for (const x of stay) {
    const tag = x.rec.CXR + ' ' + x.rec.TRN + ' (' + x.dir + ')';
    const f = mapOne(x.row, x.dir), c = card(x.row, x.dir);
    assert.ok(f, tag + ' stays on the board');
    assert.ok(c, tag + ' stays on the phone');
    const p = printed(f);
    assert.equal(p.bare, false, tag + ' prints ' + JSON.stringify(p.shown));
    assert.equal(fold(theApp().airlineName(c)).indexOf(fold(p.shown)), 0, tag + ': the phone prints the board\'s name (' + p.shown + ' / ' + theApp().airlineName(c) + ')');
    (names[x.rec.CXR] = names[x.rec.CXR] || new Set()).add(p.shown);
    assert.notEqual(f.terminal, 'NO');
    assert.ok(!/^NO-/.test(String(f._belt || '')), tag + ': no belt named after the word NO');
    if (['BBQ', 'WAL', 'G6', 'CSQ', 'H8'].includes(x.rec.CXR)) charters.push(x);
  }
  const flat = Object.fromEntries(Object.keys(names).sort().map((k) => [k, [...names[k]].join(' / ')]));
  for (const [code, name] of [['BBQ', 'Eastern Air Express'], ['WAL', 'World Atlantic'], ['G6', 'GlobalX Airlines'], ['CSQ', 'IBC Air']]) assert.equal(flat[code], name, code);
  assert.ok(flat.H8 && flat.H8 !== 'H8', 'H8 prints a name: ' + flat.H8);
  // every charter row that stays has a gate or a belt in the record: that is why it is a public flight
  assert.equal(charters.length, 17, 'seventeen charter rows stay (twenty that morning, less the three)');
  for (const x of charters) assert.ok(x.rec.gate || x.rec.bags, x.rec.CXR + ' ' + x.rec.TRN + ' has a gate or a belt');
  // GlobalX keeps its Cap-Haitien and Caracas flights while 6175 is off
  const g6 = charters.filter((x) => x.rec.CXR === 'G6').map((x) => x.rec.TRN).sort();
  assert.deepEqual(g6, ['200', '201', '608', '613', '614']);
});

test('Miami: the whole list at once gives the same board', () => {
  // mapADB over the list, as the board calls it: the rows that leave are gone, nothing else is
  for (const dir of ['dep', 'arr']) {
    const mine = miaRows().filter((x) => x.dir === dir);
    const out = the('mapADB')({ [dir === 'dep' ? 'departures' : 'arrivals']: mine.map((x) => timed(x.row, dir)) }, dir);
    const got = Array.from(out, (f) => f.flight).sort();
    const want = mine.filter((x) => !x.off).map((x) => (x.rec.CXR + x.rec.TRN).toUpperCase()).sort();
    assert.deepEqual(got, want, dir);
    assert.ok(!got.includes('G66175') && !got.includes('BBQ2211A'));
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. MIAMI THROUGH THE BACKUP LIST
// ═══════════════════════════════════════════════════════════════════════════

// A record of the file as Miami's XML writes it (the worker's parser reads
// the tags; an empty field is &#160;).
const xmlOf = (rec, dir) => {
  const tag = (k, v) => '<' + k + '>' + (String(v == null ? '' : v).replace(/&/g, '&amp;') || '&#160;') + '</' + k + '>';
  return '<flight>' + ['city', 'stt', 'status', 'bags', 'terminal', 'gate', 'airlineName', 'att', 'ett', 'TYP', 'REG', 'CXR', 'TRN', 'CTY', 'timeInMillis'].map((k) => tag(k, rec[k])).join('')
    + tag('DIR', dir === 'dep' ? 'D' : 'A') + '<cities>' + tag('so', rec.city) + '</cities></flight>';
};

test('Miami through the backup list: the worker carries the mark, and the same rows leave', async () => {
  const W = await import(pathToFileURL(WORKER_PATH).href);
  const now = Date.parse('2026-11-18T14:34:22Z');
  for (const dir of ['dep', 'arr']) {
    const recs = TODAY.mia[dir];
    const rows = W.miaParseFeed('<data>' + recs.map((x) => xmlOf(x.rec, dir)).join('') + '</data>', dir, now);
    const by = Object.fromEntries(rows.map((r) => [r.number, r]));
    for (const x of recs) {
      const num = x.rec.CXR + x.rec.TRN.replace(/^0+(?=\d)/, ''), r = by[num];   // (the parser drops the zeros Miami pads a number with)
      if (x.off === 'home') { assert.ok(!r, num + ': the parser has always dropped a record from Miami itself'); continue; }
      assert.ok(r, num + ' is parsed');
      const leg = dir === 'dep' ? r.departure : r.arrival;
      if (x.off === 'no-terminal') {
        assert.equal(r._noPublicTerminal, true, num + ' carries the mark');
        assert.ok(!own(leg, 'terminal'), 'and no terminal NO');
        assert.deepEqual(both(r, dir), OFF, num + ' is off both screens on the backup list');
      } else {
        assert.ok(!own(r, '_noPublicTerminal'), num + ' has no mark');
        assert.deepEqual(both(r, dir), ON, num + ' stays on both screens on the backup list');
      }
    }
  }
  // the mark survives the journey: it is a plain field of the row the worker serves
  const g6 = W.miaParseFeed('<data>' + xmlOf(TODAY.mia.arr.find((x) => x.off === 'no-terminal').rec, 'arr') + '</data>', 'arr', now)[0];
  assert.equal(JSON.parse(JSON.stringify(g6))._noPublicTerminal, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. THE OTHER AIRPORTS OF THE SAME MORNING
// ═══════════════════════════════════════════════════════════════════════════

// The rows of one airport and one direction, as the list they came in.
const servedList = (ap, dir) => TODAY.served.filter((s) => s.ap === ap && s.dir === dir).map((s) => s.row);
// One recorded row through both screens, read on its list.
const servedBoth = (x) => bothIn(x.row, x.dir, servedList(x.ap, x.dir), x.ap);

test('the rows found at the other airports: each leaves or stays as recorded, on the board and on the phone', () => {
  const FILTER_OUT = the('FILTER_OUT'), feedAirline = the('_adbFeedAirline');
  const words = new Function('return [' + CORE.match(/\n {4}const _NON_PASSENGER_PATTERNS = \[([\s\S]*?)\n {4}\];/)[1] + '\n];')();
  const seen = { home: 0, nowhere: 0, callsign: 0, unnamed: 0, list: 0, stays: 0 };
  for (const x of TODAY.served) {
    const tag = x.ap + ' ' + x.dir + ' ' + x.row.number;
    const r = servedBoth(x), f = r.board, c = r.card;
    if (!x.off) {
      assert.ok(f, tag + ' stays on the board: ' + x.note);
      assert.ok(c, tag + ' stays on the phone: ' + x.note);
      assert.equal(printed(f).bare, false, tag + ' prints ' + printed(f).shown);
      seen.stays++;
      continue;
    }
    assert.equal(f, null, tag + ' is off the board: ' + x.note);
    assert.equal(c, null, tag + ' is off the phone: ' + x.note);
    seen[x.off]++;
    const L = inList(x.row, x.dir, servedList(x.ap, x.dir));
    const rule = (named) => the('fidsRowOffBoard')(L.row, x.dir, x.ap, named, L.list);
    if (x.off === 'list') {
      // by the code list or by a word in the name the airport gives it, not by the row
      const fa = feedAirline(x.row, x.dir), low = String(fa.name || '').toLowerCase();
      assert.ok(FILTER_OUT.has(carrierOf(x.row.number)) || FILTER_OUT.has(fa.code) || (low && words.some((p) => low.includes(p))), tag + ' is on the code list or carries a name word');
    } else if (x.off === 'unnamed') {
      assert.equal(rule(true), '', tag + ' leaves only because nobody names it');
      assert.equal(rule(false), 'unnamed');
    } else {
      assert.equal(rule(true), x.off, tag + ' leaves for the reason recorded');
    }
  }
  assert.deepEqual(seen, { home: 4, nowhere: 3, callsign: 7, unnamed: 1, list: 8, stays: 29 }, 'the file holds what it held when it was made');
});

test('one letter after the number, on the lists of that morning: the second listings leave, the flights filed again stay', () => {
  const at = (ap, dir, num) => { const x = TODAY.served.find((s) => s.ap === ap && s.dir === dir && norm(s.row.number) === num); assert.ok(x, ap + ' ' + num + ' is in the file'); return x; };
  const gap = (a, b) => Math.round((timeOf(b.row, b.dir) - timeOf(a.row, a.dir)) / 60000);
  // Chicago arrivals: the callsign row, and the flight itself beside it with its terminal
  for (const [call, flight, minutes] of [['AA764P', 'AA764', 39], ['TK67C', 'TK185', 37], ['EY93C', 'EY9', 59], ['OS1R', 'OS45', 43], ['QR20V', 'QR725', 84]]) {
    const a = at('ORD', 'arr', call), b = at('ORD', 'arr', flight);
    assert.equal(gap(a, b), minutes, call + ' and ' + flight);
    assert.ok(the('fidsRowUnplaced')(a.row, 'arr') && !the('fidsRowUnplaced')(b.row, 'arr'), flight + ' has the place, ' + call + ' has none');
    assert.equal(a.off, 'callsign');
    assert.deepEqual(servedBoth(a).both, OFF, call + ' leaves');
    const kept = servedBoth(b);
    assert.deepEqual(kept.both, ON, flight + ' stays');
    assert.equal(printed(kept.board).bare, false);
    // alone, the callsign row stays: it is the list that says it is a second listing
    assert.deepEqual(both(a.row, 'arr'), ON, call + ' alone');
    // and without the flight beside it, it stays
    const without = servedList('ORD', 'arr').filter((r) => r !== b.row);
    assert.deepEqual(bothIn(a.row, 'arr', without, 'ORD').both, ON, call + ' without ' + flight);
  }
  // Chicago and Charlotte departures: a flight filed again under a letter is the only row that flight has
  for (const [ap, call, whole, name] of [['ORD', 'AA179Q', 'AA1179', 'American'], ['CLT', 'AA473Q', 'AA1473', 'American']]) {
    const a = at(ap, 'dep', call), b = at(ap, 'dep', whole);
    assert.equal(a.off, null);
    assert.equal(norm(b.row.number).slice(-3), norm(a.row.number).slice(2, 5), call + ' is the end of ' + whole);
    assert.equal(legOf(a.row, 'dep').airport.iata, ap);
    assert.equal(a.row.arrival.airport.iata, b.row.arrival.airport.iata, 'the same route');
    const r = servedBoth(a);
    assert.deepEqual(r.both, ON, call + ' stays on both screens');
    assert.equal(printed(r.board).shown, name);
    assert.ok(Math.abs(gap(a, b)) > 600, whole + ' is the evening flight, hours away');
  }
  // AA2285 to Santa Ana stands 55 minutes after AA179Q, inside the window: the number keeps AA179Q, not the clock
  const q = at('ORD', 'dep', 'AA179Q'), next = at('ORD', 'dep', 'AA2285'), evening = at('ORD', 'dep', 'AA1179');
  assert.equal(gap(q, next), 55);
  assert.ok(!the('fidsRowUnplaced')(next.row, 'dep'));
  assert.deepEqual(bothIn(q.row, 'dep', servedList('ORD', 'dep').filter((r) => r !== evening.row), 'ORD').both, OFF, 'without AA1179 on the list nothing would say so');
});

test('the scheduled flights that look like the rows that leave are on both screens, named', () => {
  const at = (ap, dir, num) => { const x = TODAY.served.find((s) => s.ap === ap && s.dir === dir && s.row.number.replace(/\s+/g, '') === num); assert.ok(x, ap + ' ' + num + ' is in the file'); return x; };
  const shown = (x) => { const r = servedBoth(x); assert.ok(r.board && r.card, x.ap + ' ' + x.row.number); return printed(r.board).shown; };
  const placeOf = (x) => (x.dir === 'dep' ? x.row.departure : x.row.arrival);
  // Chicago lists Avelo and Arajet with no terminal, no gate and no belt, as it lists its freighters
  for (const [dir, num, name] of [['arr', 'XP421', 'Avelo'], ['dep', 'XP422', 'Avelo'], ['arr', 'DM5480', 'Arajet']]) {
    const x = at('ORD', dir, num);
    assert.ok(the('fidsRowUnplaced')(x.row, dir), num + ' has no place in the feed');
    assert.equal(shown(x), name);
  }
  // Toronto: a letter after the number, at a gate and a belt
  const ac = at('YYZ', 'arr', 'AC91Z');
  assert.equal(placeOf(ac).gate, 'E80');
  assert.equal(shown(ac), 'Air Canada');
  // Boston: Sunrise Airways was on the cargo list under its own code. It
  // prints the name its airport gives it.
  assert.equal(shown(at('BOS', 'dep', 'S6623')), 'Sunrise Airline');
  assert.ok(!the('FILTER_OUT').has('S6'), 'S6 is a passenger airline');
  // Newark and Las Vegas: a placeholder where the terminal goes
  assert.equal(placeOf(at('EWR', 'dep', 'MS988')).terminal, '0');
  assert.equal(shown(at('EWR', 'dep', 'MS988')), 'EgyptAir');
  assert.equal(placeOf(at('LAS', 'arr', 'LF3603')).terminal, '??');
  assert.ok(shown(at('LAS', 'arr', 'LF3603')).indexOf('Contour') === 0);
  // Philadelphia: Frontier with no gate
  assert.equal(shown(at('PHL', 'arr', 'F92552')), 'Frontier');
});

test('rows nothing in the row can decide stay, and are listed: the list can only shrink', () => {
  // A freighter under the code of an airline that also carries passengers,
  // a military charter at a gate: the row does not say, so the row stays.
  // When a rule comes that can tell one, this fails and the entry goes.
  const undecided = TODAY.served.filter((x) => x.undecided);
  assert.deepEqual(undecided.map((x) => x.ap + ' ' + x.row.number).sort(),
    ['ORD CA1054', 'ORD EK9988', 'ORD JL6747', 'ORD OO225X', 'ORD OO285R', 'ORD QR31T', 'ORD QR8154', 'SEA MC1271']);
  for (const x of undecided) {
    assert.ok(String(x.undecided).length > 20, x.row.number + ' says why it cannot be decided');
    assert.ok(!x.off);
    assert.deepEqual(servedBoth(x).both, ON, x.ap + ' ' + x.row.number + ' is decided now: take it out of the undecided rows of the file and record why it leaves');
  }
});

test('the lists the two screens share carry the operators found that morning', () => {
  const win = {};
  vm.runInNewContext(SHARED, { window: win });
  const codes = JSON.parse(JSON.stringify(win.FIDS_SHARED_OFF_BOARD)), names = JSON.parse(JSON.stringify(win.FIDS_SHARED_OFF_BOARD_NAMES));
  for (const c of ['K4', 'CKS', 'KZ', 'NCA', 'KD', 'WGN', 'Y8', 'YZR', 'KII', 'FRG', 'XFL']) {
    assert.ok(the('FILTER_OUT').has(c), c + ' is on the board\'s list');
    assert.ok(codes.includes(c), c + ' is on the phone\'s list');
  }
  for (const w of ['cargo', 'freight', 'morningstar air express']) assert.ok(names.includes(w), w);
  // S6 left the list on both
  assert.ok(!codes.includes('S6'));
  // Suparna: named by its airport, with no word for cargo in the name, so only the code takes it off
  for (const dir of ['arr', 'dep']) {
    assert.deepEqual(both(row({ dir, ap: 'ORD', far: 'ANC', number: 'Y87469', name: 'Suparna Airlines' }), dir), OFF, 'Suparna ' + dir);
    assert.deepEqual(both(row({ dir, ap: 'ORD', far: 'ANC', number: 'Y87469', name: 'Suparna Airlines', terminal: '5', gate: 'M3' }), dir), OFF, 'Suparna at a gate ' + dir);
  }
  // the name words take off an operator its airport calls a cargo or freight carrier, and no passenger airline
  for (const dir of ['arr', 'dep']) {
    for (const name of ['NCA - Nippon Cargo Airlines', 'China Cargo', 'Qatar Airways Cargo', 'Suburban Air Freight', 'Morningstar Air Express']) {
      assert.deepEqual(both(row({ dir, ap: 'ORD', far: 'ANC', number: NOBODY + '134', name, terminal: '5', gate: 'M3' }), dir), OFF, name + ' ' + dir);
    }
    for (const name of ['Air China', 'Qatar Airways', 'Sunrise Airways', 'Air Mobility Command']) {
      assert.deepEqual(both(row({ dir, ap: 'ORD', far: 'ANC', number: NOBODY + '134', name, terminal: '5', gate: 'M3' }), dir), ON, name + ' ' + dir);
    }
  }
});

test('a name only the airport gives keeps its initials in capitals on the board, as on the phone', () => {
  // Miami, CSQ 761 to Les Cayes: the board printed Ibc Air, the phone IBC Air
  const ibc = row({ dir: 'dep', ap: 'MIA', far: 'CYA', number: 'CSQ761', name: 'IBC Air', terminal: 'G', gate: 'G4' });
  assert.ok(!own(the('AIRLINE_NAME'), 'CSQ'), 'no table names CSQ: the name is the airport\'s');
  assert.equal(printed(mapOne(ibc, 'dep')).shown, 'IBC Air');
  assert.equal(theApp().airlineName(card(ibc, 'dep')), 'IBC Air');
  const tcAirline = the('tcAirline');
  // initials stay, everyday words of two and three letters are cased
  for (const [name, want] of [['IBC AIR', 'IBC Air'], ['AIR MOBILITY COMMAND', 'Air Mobility Command'], ['SUNRISE AIRLINE', 'Sunrise Airline'], ['NCA - NIPPON CARGO AIRLINES', 'NCA - Nippon Cargo Airlines'],
    ['SKY HIGH', 'Sky High'], ['RED AIR', 'Red Air'], ['FLY JAMAICA', 'Fly Jamaica'], ['AIR CHINA LTD', 'Air China Ltd'], ['BANK OF UTAH', 'Bank of Utah'], ['TUI FLY', 'TUI Fly']]) {
    assert.equal(tcAirline(name, NOBODY), want, name);
  }
  // a name the tables give is cased exactly as it was: the rule is for a code no table names
  for (const code of ['PK', 'BM', 'WAL', 'WP', 'ZL']) {
    const name = the('AIRLINE_NAME')[code];
    assert.ok(name, code + ' is in the table');
    assert.equal(tcAirline(name, code), (name === name.toUpperCase() && /[A-Z]{3,}/.test(name) && !the('_AIRLINE_NAME_OVERRIDE')[code]) ? the('tc')(name) : (the('_AIRLINE_NAME_OVERRIDE')[code] || name), code);
  }
  // a name written in small letters by the caller is left alone, and no code at all changes nothing
  assert.equal(tcAirline('IBC Air', NOBODY), 'IBC Air');
  assert.equal(tcAirline('IBC AIR', ''), the('tc')('IBC AIR'));
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. THE THREE SCREENS GIVE THE SAME ANSWER
// ═══════════════════════════════════════════════════════════════════════════

// The page of the Studio player in its live mode: the router's rule and the
// lists and names of the boards, as studio-player.js loads them.
const studioPage = () => {
  const win = {};
  vm.runInNewContext(SHARED, { window: win });
  return { fidsRowOffBoard: the('fidsRowOffBoard'), FIDS_SHARED_OFF_BOARD: Array.from(win.FIDS_SHARED_OFF_BOARD), FIDS_SHARED_OFF_BOARD_NAMES: Array.from(win.FIDS_SHARED_OFF_BOARD_NAMES), FIDS_SHARED_AIRLINE: win.FIDS_SHARED_AIRLINE };
};
// The flight numbers the live list of the player holds for a list of rows.
async function studioKeeps(ap, dir, list, page) {
  const key = dir === 'dep' ? 'departures' : 'arrivals';
  const adapter = StudioData.operationalReadOnlyAdapter(async () => ({ [key]: list }), { iata: ap }, page);
  return (await adapter.flights(key)).map((f) => norm(f.flight));
}

test('the live list of the Studio player holds the rows the phone holds, and no other', async () => {
  const page = studioPage();
  const lists = [];
  const mia = miaRows();
  for (const dir of ['dep', 'arr']) lists.push(['MIA', dir, mia.filter((x) => x.dir === dir).map((x) => x.row)]);
  const seen = new Set();
  for (const x of TODAY.served) { const k = x.ap + ' ' + x.dir; if (!seen.has(k)) { seen.add(k); lists.push([x.ap, x.dir, servedList(x.ap, x.dir)]); } }
  let rows = 0, off = 0;
  for (const [ap, dir, list] of lists) {
    const phone = list.filter((r) => theApp().adbToCard(JSON.parse(JSON.stringify(r)), dir, undefined, ap, list)).map((r) => norm(r.number));
    // (the phone reads a copy of each row; the list it is handed is the list itself, as on the page)
    const studio = await studioKeeps(ap, dir, list, page);
    assert.deepEqual(studio, phone, ap + ' ' + dir + ': the player lists what the phone lists');
    rows += list.length; off += list.length - studio.length;
  }
  assert.ok(rows >= 70 && off >= 25, rows + ' rows, ' + off + ' kept off');
  // the three rows of Miami are off the player
  const miaArr = await studioKeeps('MIA', 'arr', mia.filter((x) => x.dir === 'arr').map((x) => x.row), page);
  assert.ok(!miaArr.includes('BBQ2211A') && !miaArr.includes('G66175'));
  assert.ok(miaArr.includes('G6201') || miaArr.includes('G6200') || miaArr.some((n) => /^G6\d/.test(n)), 'and the GlobalX charters with a gate are on it');
  const miaDep = await studioKeeps('MIA', 'dep', mia.filter((x) => x.dir === 'dep').map((x) => x.row), page);
  assert.ok(!miaDep.includes('G66175'));
});

test('the live list of the Studio player: each kind of row the boards keep off', async () => {
  const page = studioPage();
  for (const dir of ['arr', 'dep']) {
    const keeps = async (r, list, scope) => (await studioKeeps(legOf(r, dir).airport.iata, dir, list || [r], scope || page)).includes(norm(r.number));
    const plain = row({ dir, ap: 'MIA', far: 'HAV', number: 'WAL253', name: 'World Atlantic', terminal: 'F', gate: 'F10' });
    assert.equal(await keeps(plain), true, 'a public charter at a gate');
    // the row rule
    assert.equal(await keeps(row({ dir, ap: 'MIA', far: 'MIA', number: 'BBQ2211A', name: 'Eastern Air Express', gate: 'F21' })), false, 'home');
    assert.equal(await keeps(row({ dir, ap: 'MIA', far: 'MYC', number: 'G66175', name: 'GlobalX Airlines', more: { _noPublicTerminal: true } })), false, 'no-terminal');
    assert.equal(await keeps(row({ dir, ap: 'DEN', far: { iata: ' ' }, number: 'UA1395', name: 'United Airlines', gate: 'B41' })), false, 'nowhere');
    assert.equal(await keeps(row({ dir, ap: 'MIA', far: 'TEB', number: 'N966AD', code: null, name: null, gate: 'F3' })), false, 'tail');
    assert.equal(await keeps(row({ dir, ap: 'ORD', far: 'MAD', number: 'IB3GA', name: 'Iberia' })), false, 'callsign');
    assert.equal(await keeps(row({ dir, ap: 'MIA', far: 'BOG', number: 'AA904', name: 'American Airlines', gate: 'D3', more: { isCargo: true } })), false, 'cargo');
    // a second listing, read on its list
    const a = row({ dir, ap: 'ORD', far: 'IST', number: 'TK67C', name: 'Turkish Airlines' }), b = row({ dir, ap: 'ORD', far: 'IST', number: 'TK185', name: 'Turkish Airlines', terminal: '5', min: 37 });
    assert.deepEqual(await studioKeeps('ORD', dir, [a, b], page), ['TK185']);
    assert.deepEqual(await studioKeeps('ORD', dir, [a], page), ['TK67C']);
    // nobody names it and it has no place; named by a table or by its airport, it stays
    assert.equal(await keeps(row({ dir, ap: 'PHL', far: 'LAS', number: 'XA5903', code: 'XA', name: null })), false, 'unnamed');
    assert.equal(await keeps(row({ dir, ap: 'PHL', far: 'LAS', number: 'XA5903', code: 'XA', name: null, gate: 'A14' })), true);
    assert.equal(await keeps(row({ dir, ap: 'PHL', far: 'ATL', number: 'F92552', name: null })), true, 'Frontier, named by the table');
    assert.equal(await keeps(row({ dir, ap: 'PHL', far: 'LAS', number: 'XA5903', code: 'XA', name: 'Meridian Air Express' })), true, 'named by its airport');
    // the code list and the name words
    assert.equal(await keeps(row({ dir, ap: 'ORD', far: 'ANC', number: 'K4557', name: 'Kalitta Air' })), false, 'the code list, by the number');
    assert.equal(await keeps(row({ dir, ap: 'ORD', far: 'ANC', number: NOBODY + '134', name: 'China Cargo', terminal: '5', gate: 'M3' })), false, 'a name word');
    const top = row({ dir, ap: 'ORD', far: 'ANC', number: 'AA134', name: 'American Airlines', gate: 'K1', more: { airline: { iata: '5Y', name: 'Atlas Air' } } });
    assert.equal(await keeps(top), false, 'the code at the top of the row');
    // a codeshare duplicate
    assert.equal(await keeps(Object.assign({}, plain, { codeshareStatus: 'IsCodeshared' })), false);
    // a page that loaded neither file lists its rows as it did
    const home = row({ dir, ap: 'MIA', far: 'MIA', number: 'BBQ2211A', name: 'Eastern Air Express', gate: 'F21' });
    assert.equal(await keeps(home, [home], {}), true);
    // a page with the router alone still asks the row rule, and does not say nobody names a row
    assert.equal(await keeps(home, [home], { fidsRowOffBoard: the('fidsRowOffBoard') }), false);
    const xa = row({ dir, ap: 'PHL', far: 'LAS', number: 'XA5903', code: 'XA', name: null });
    assert.equal(await keeps(xa, [xa], { fidsRowOffBoard: the('fidsRowOffBoard') }), true);
  }
  // the adapter hands its page on from choose()
  const picked = StudioData.choose({ mode: 'pilot', airport: { iata: 'MIA' }, scope: page, routerFetch: async () => ({ arrivals: [row({ dir: 'arr', ap: 'MIA', far: 'MIA', number: 'BBQ2211A', gate: 'F21' })], departures: [] }) });
  assert.deepEqual(await picked.flights('arrivals'), []);
});
