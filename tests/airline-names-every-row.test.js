'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// AN AIRLINE EITHER BELONGS ON THE SCREEN OR IT DOES NOT
//
// A flight a passenger can be on prints with its airline's name. A flight no
// passenger looks for (cargo, courier, ferry, private) is not on the board at
// all. A bare code is never the answer.
//
// What went wrong, on the Miami boards of 2026-11-13: rows printed BBQ, WAL,
// G6 and OB where the airport's own feed said Eastern Air Express, World
// Atlantic, GlobalX Airlines and BoA. mapADB read the feed's airline name at
// the top of a row; every adapter of an airport's own feed (feed-router.js,
// and the worker's authorityFlight, whose rows are also the backup list) puts
// the airline only inside the two legs. So at every airport on its own feed
// an airline outside AIRLINE_NAME lost the name its airport gave it.
//
// What holds it now:
//   1. EVERY RECORDED FEED ROW of tests/fixtures goes through the real
//      adapters and parsers and then through the real mapADB, one row at a
//      time. A row that stays on the board must print a name; a row that
//      leaves must be one the board keeps off on purpose (FILTER_OUT).
//      Every file of tests/fixtures is either read here or listed, with the
//      reason, as holding no feed rows: a new recording cannot go unread.
//   2. THE RULE ITSELF, on rows written for it: the name on the home leg is
//      printed when that leg's code is the carrier of the flight number; an
//      operating carrier's name on the leg is never printed for another
//      carrier's row; a cargo or private operator named only on its leg is
//      dropped as one named at the top is.
//   3. MIAMI, as recorded that afternoon (mia-airline-names-2026-11-13.json),
//      through both doors: the airport feed's own records and the backup list.
//   4. THE PHONE APP (app.html adbToCard), which had the same gap.
//   5. THE SAME ANSWER ON THE PHONE. Every recorded row goes through the
//      app's real mapper and name function as well: a row the board drops
//      gives no card, a row it keeps gives a card with the same airline
//      name, never a code. The tables behind that are held equal: the app's
//      copy of AIRLINE_NAME, of FILTER_OUT and of the name patterns
//      (js/shared-names.js), and its fold of regionals (PARENT).
//   6. A NAME IS NOT ENOUGH, IT HAS TO BE THE AIRLINE. A recorded row whose
//      airport names the airline in words the table's name shares none of
//      fails, unless the code is in NAMED_OTHERWISE with the airport's name
//      and the reason: 4T printed BEOND on Saskatoon rows the airport named
//      Rise Air, and passed as named.
//
// A recorded code that cannot be decided goes in UNDECIDED below, by code,
// with the reason. The ledger fails when a code in it starts to pass, so it
// can only shrink.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const JS = path.join(ROOT, 'fids-current', 'js');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const fx = (name, enc) => fs.readFileSync(path.join(FX, name), enc || 'utf8');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const P = (s) => Date.parse(s);

const CORE = read('fids-current/js/fids-core.js');
const APP = read('fids-current/app.html');
const WORKER_PATH = path.join(ROOT, 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(WORKER_PATH, 'utf8');

// Recorded codes nobody could decide: { CODE: 'why' }. Empty today.
const UNDECIDED = {};

// Recorded rows the board keeps off, by the carrier of the flight number,
// and why. Anything else that leaves the board fails the test.
const OFF_THE_BOARD = {
  '5Y': 'Atlas Air, cargo (Anchorage to Chicago on the ORD feed)',
  'KJ': 'Air Incheon (AirZeta), cargo (Anchorage to Chicago on the ORD feed)',
  'M6': 'Amerijet International, cargo (Houston to Louisville on the IAH feed)',
  'WFS': 'World Fuel Services, a private Gulfstream (Dallas Addison to Keflavik on the KEF feed)'
};

// ── the whole board script in a page of its own ────────────────────────────
// fids-core.js with the scripts it reads first and the coordinates after it,
// as fids.html loads them: no screen, no network, no timers.
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
  // the board's own tables and functions, by name (most are `const`s of the script)
  vm.runInContext('var __the = function (n) { return eval(n); };', ctx);
  return ctx;
}
let BOARD_ = null;
const B = () => BOARD_ || (BOARD_ = board());
const the = (n) => B().__the(n);

// ── a row at the mapper's door ─────────────────────────────────────────────
// mapADB keeps a row from DEPART_TRAIL_HRS before now to LOOKAHEAD_HRS after,
// so a recording would be dropped whole once it was past: every row's own
// time is set an hour from now. Nothing else of the row is touched.
const AT = new Date(Math.floor(Date.now() / 3600000) * 3600000 + 3600000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
function mapOne(row, dir) {
  const g = JSON.parse(JSON.stringify(row));
  const k = dir === 'dep' ? 'departure' : 'arrival';
  g[k] = g[k] || {};
  g[k].scheduledTime = { local: AT, utc: AT };
  delete g[k].revisedTime; delete g[k].runwayTime; delete g[k].predictedTime;
  const out = the('mapADB')({ [dir === 'dep' ? 'departures' : 'arrivals']: [g] }, dir);
  assert.ok(Array.isArray(out) && out.length <= 1, 'one row in, at most one row out');
  return out[0] || null;
}
// The carrier of a flight number, as mapADB reads it.
const carrierOf = (num) => {
  const n = String(num || '').toUpperCase().replace(/\s+/g, '');
  const m = n.match(/^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])(?=\d)/);
  return m ? m[0] : n.replace(/[0-9].*/, '');
};
// What a row prints for its airline. Every surface starts from the row's
// _airlineName (the departures and arrivals rows, the gate, the belt, the
// search); the row itself cases it with tcAirline. Only its code: no name, or
// a name that is the code or the flight number's prefix again.
function printed(f) {
  const code = String(f.airline || '').trim().toUpperCase();
  const name = String(f._airlineName || '').trim();
  const shown = String(the('tcAirline')(name || the('AIRLINE_NAME')[code] || code || '', code) || '').trim();
  const bare = !name || !shown || [code, carrierOf(f.flight)].some((c) => c && (name.toUpperCase() === c || shown.toUpperCase() === c));
  return { code, name, shown, bare };
}

// ── every recorded feed row, in the mapper's shape ─────────────────────────
// Files of tests/fixtures that hold no feed rows, and what they hold instead.
const NOT_FEED_ROWS = {
  'app-phone-fit-320.json': 'measurements of the phone app',
  'belt-wordmark-rows.json': 'ink profiles of the wordmark art (rows of pixels)',
  'city-tables-v24066.json': 'the city name tables of v24066 (REX there is Reynosa, an airport)',
  'earth-live-2026-10-19.json': 'floors as drawn: places and counts, no feed rows',
  'earth-places-codes-2026-10-19.txt': 'airport codes',
  'earth-sweep-2026-10-19.json': 'floors as drawn: places and counts, no feed rows',
  'header-band.json': 'band colours',
  'name-fit-model.json': 'measured sizes of names',
  'phx-capture-headers.txt': 'the headers of a capture',
  'rows-v24067.json': 'airports as feeds name them ([iata, icao, name]); no airline on them',
  'sun-usno-2026.json': 'sunrise tables',
  'syd-capture-headers.txt': 'the headers of a capture',
  'ymm-empty-sample.json': 'an empty answer: no rows',
  'yyj-page-sample.html': 'the page that carries the feed nonce: no rows'
};
// The worker's parsers with the usual signature (text, direction, now), by
// file: [file, parser, directions the file holds, the moment of the capture].
const US = '2026-09-05T01:00:00-04:00';
const PARSED = [
  ['aus-arr-sample.xml', 'ausParseFeed', ['arr'], '2026-09-05T21:09:00-05:00'],
  ['aus-dep-sample.xml', 'ausParseFeed', ['dep'], '2026-09-05T21:09:00-05:00'],
  ['clt-sample.json', 'cltParseFeed', ['dep', 'arr'], '2026-09-04T22:00:00-04:00'],
  ['den-sample.json', 'denParseFeed', ['dep', 'arr'], US],
  ['dtw-arr-sample.json', 'dtwParseFeed', ['arr'], '2026-09-04T22:00:00-04:00'],
  ['edi-arr-sample.json', 'ediParseFeed', ['arr'], '2026-09-05T00:30:00Z'],
  ['iah-arr-sample.json', 'parseIahFeed', ['arr'], '2026-09-06T01:15:42-05:00'],
  ['iah-dep-sample.json', 'parseIahFeed', ['dep'], '2026-09-06T01:15:42-05:00'],
  ['jfk-arr-sample.json', 'parseJfkFeed', ['arr'], '2026-09-06T03:20:00-04:00'],
  ['jfk-dep-sample.json', 'parseJfkFeed', ['dep'], '2026-09-06T03:20:00-04:00'],
  ['kef-sample.json', 'kefParseFeed', ['dep', 'arr'], '2026-09-05T00:30:00Z'],
  ['las-sample.json', 'lasParseFeed', ['dep', 'arr'], US],
  ['lhr-sample.json', 'lhrParseFeed', ['dep', 'arr'], '2026-09-05T05:00:00+01:00'],
  ['man-arr-sample.json', 'manParseFeed', ['arr'], '2026-09-05T00:30:00Z'],
  ['mci-arr-sample.json', 'mciParseFeed', ['arr'], '2026-09-04T22:00:00-04:00'],
  ['mco-arr-sample.json', 'mcoParseFeed', ['arr'], '2026-09-06T02:11:21-04:00'],
  ['mco-dep-sample.json', 'mcoParseFeed', ['dep'], '2026-09-06T02:11:21-04:00'],
  ['mia-arr-sample.xml', 'miaParseFeed', ['arr'], '2026-09-06T02:06:00-04:00'],
  ['mia-dep-sample.xml', 'miaParseFeed', ['dep'], '2026-09-06T02:06:00-04:00'],
  ['msp-arr-sample.html', 'mspParsePage', ['arr'], '2026-09-05T21:10:00-05:00'],
  ['msp-dep-sample.html', 'mspParsePage', ['dep'], '2026-09-05T21:10:00-05:00'],
  ['msp-dep-lastpage-sample.html', 'mspParsePage', ['dep'], '2026-09-05T21:10:00-05:00'],
  ['msy-sample.json', 'msyParseFeed', ['arr'], '2026-09-04T22:00:00-04:00'],
  ['ord-sample.json', 'ordParseFeed', ['dep', 'arr'], US],
  ['pdx-sample.json', 'pdxParseFeed', ['dep', 'arr'], '2026-09-04T22:00:00-07:00'],
  ['phl-sample.html', 'phlParsePage', ['dep', 'arr'], US],
  ['phx-sample.json', 'phxParseFeed', ['dep', 'arr'], '2026-09-05T23:08:00-07:00'],
  ['rdu-arr-sample.html', 'rduParsePage', ['arr'], '2026-09-05T22:10:00-04:00'],
  ['rdu-dep-sample.html', 'rduParsePage', ['dep'], '2026-09-05T22:10:00-04:00'],
  ['san-arr-sample.json', 'sanParseFeed', ['arr'], '2026-09-04T22:00:00-07:00'],
  ['sea-arr-sample.html', 'seaParsePage', ['arr'], '2026-09-04T22:00:00-07:00'],
  ['sea-dep-sample.html', 'seaParsePage', ['dep'], '2026-09-04T22:00:00-07:00'],
  ['sea-rows-arr-2026-10-12.html', 'seaParsePage', ['arr'], '2026-10-12T14:45:00-07:00'],
  ['sea-rows-dep-2026-10-12.html', 'seaParsePage', ['dep'], '2026-10-12T14:45:00-07:00'],
  ['sea-rows-frontier-2026-10-20.html', 'seaParsePage', ['dep'], '2026-10-20T14:45:00-07:00'],
  ['sfo-sample.json', 'sfoParseFeed', ['dep', 'arr'], '2026-09-04T22:00:00-07:00'],
  ['slc-arr-sample.html', 'slcParsePage', ['arr'], '2026-09-05T20:15:00-06:00'],
  ['slc-dep-sample.html', 'slcParsePage', ['dep'], '2026-09-05T20:15:00-06:00'],
  ['ydf-page-sample.html', 'parseYdfPage', ['dep', 'arr'], '2026-09-05T23:30:00-02:30'],
  ['yeg-arr-sample.html', 'yegParseBoard', ['arr'], '2026-09-04T22:00:00-06:00'],
  ['yeg-dep-sample.html', 'yegParseBoard', ['dep'], '2026-09-04T22:00:00-06:00'],
  ['yfc-arr-sample.html', 'yfcParseBoard', ['arr'], '2026-09-04T23:30:00-03:00'],
  ['yfc-dep-sample.html', 'yfcParseBoard', ['dep'], '2026-09-04T23:30:00-03:00'],
  ['yhm-sample.html', 'yhmParseBoard', ['dep', 'arr'], '2026-09-04T22:00:00-04:00'],
  ['yka-arr-sample.json', 'parseYkaFeed', ['arr'], '2026-09-05T23:06:00-07:00'],
  ['yka-dep-sample.json', 'parseYkaFeed', ['dep'], '2026-09-05T23:06:00-07:00'],
  ['ylw-arr-sample.json', 'ylwParseFeed', ['arr'], '2026-09-04T22:00:00-07:00'],
  ['ymm-arr-sample.json', 'ymmParseFeed', ['arr'], '2026-09-06T00:08:00-06:00'],
  ['ymm-dep-sample.json', 'ymmParseFeed', ['dep'], '2026-09-06T00:08:00-06:00'],
  ['yow-feed-sample.json', 'yowParseFeed', ['dep', 'arr'], '2026-09-04T23:30:00-03:00'],
  ['yqr-arr-sample.html', 'yqrParsePage', ['arr'], '2026-09-04T22:00:00-06:00'],
  ['yqt-arr-arrived-sample.html', 'parseYqtPage', ['arr'], '2026-09-05T22:11:00-04:00'],
  ['yqt-arr-sample.html', 'parseYqtPage', ['arr'], '2026-09-05T22:11:00-04:00'],
  ['yqt-dep-sample.html', 'parseYqtPage', ['dep'], '2026-09-05T22:11:00-04:00'],
  ['yqx-arr-sample.html', 'parseYqxPage', ['arr'], '2026-09-06T03:30:00-02:30'],
  ['yqx-dep-sample.html', 'parseYqxPage', ['dep'], '2026-09-06T03:30:00-02:30'],
  ['yqy-feed-departed-sample.json', 'yqyParseFeed', ['dep', 'arr'], '2026-09-06T03:06:00-03:00'],
  ['yqy-feed-sample.json', 'yqyParseFeed', ['dep', 'arr'], '2026-09-06T03:06:00-03:00'],
  ['ysj-page-sample.html', 'ysjParsePage', ['dep', 'arr'], '2026-09-04T23:30:00-03:00'],
  ['yvr-sample.json', 'yvrParseFeed', ['dep', 'arr'], '2026-09-04T22:00:00-07:00'],
  ['yxe-arr-sample.html', 'yxeParsePage', ['arr'], '2026-09-05T20:10:00-06:00'],
  ['yxe-dep-sample.html', 'yxeParsePage', ['dep'], '2026-09-05T20:10:00-06:00'],
  ['yxs-feed-evening-sample.json', 'parseYxsPanels', ['dep', 'arr'], '2026-09-05T21:49:00-07:00'],
  ['yxs-feed-sample.json', 'parseYxsPanels', ['dep', 'arr'], '2026-09-05T23:07:00-07:00'],
  ['yxx-arr-sample.json', 'yxxParseFeed', ['arr'], '2026-09-04T22:00:00-07:00'],
  ['yyc-sample.json', 'yycParseFeed', ['dep', 'arr'], '2026-09-04T22:00:00-06:00'],
  ['yyg-page-0306-sample.html', 'parseYygPage', ['dep', 'arr'], '2026-09-06T03:06:00-03:00'],
  ['yyg-page-sample.html', 'parseYygPage', ['dep', 'arr'], '2026-09-06T01:45:00-03:00'],
  ['yyj-feed-sample.json', 'yyjParseFeed', ['dep', 'arr'], '2026-09-05T19:09:00-07:00'],
  ['yyt-arr-sample.html', 'yytParseTable', ['arr'], '2026-09-04T23:30:00-03:00'],
  ['yyt-dep-sample.html', 'yytParseTable', ['dep'], '2026-09-04T23:30:00-03:00'],
  ['yzf-dot-sample.html', 'parseYzfDotPage', ['dep', 'arr'], '2026-09-06T00:08:00-06:00'],
  ['yzf-page-late-sample.html', 'parseYzfPage', ['dep', 'arr'], '2026-09-03T23:55:00-06:00'],
  ['yzf-page-sample.html', 'parseYzfPage', ['dep', 'arr'], '2026-09-06T00:08:00-06:00'],
  ['zrh-sample-2026-09-06.json', 'zrhParseFeed', ['dep', 'arr'], '2026-09-06T08:17:56+02:00']
];
// Rows recorded as the worker served them, already in the mapper's shape:
// [file, key of the list, direction].
const SERVED = [
  ['yhz-arrivals-2026-11-07T1745Z.json', 'arrivals', 'arr'], ['yhz-departures-2026-11-07T1745Z.json', 'departures', 'dep'],
  ['yow-arrivals-2026-11-07T1804Z.json', 'arrivals', 'arr'], ['yow-departures-2026-11-07T1804Z.json', 'departures', 'dep'],
  ['fararr-2026-10-04/ydf-arr.json', 'arrivals', 'arr'], ['fararr-2026-10-04/yow-arr.json', 'arrivals', 'arr'], ['fararr-2026-10-04/yyc-arr.json', 'arrivals', 'arr'],
  ['sea-codeshare-2026-10-12.json', 'departures', 'dep'], ['sea-codeshare-2026-10-12.json', 'arrivals', 'arr'],
  ['mia-airline-names-2026-11-13.json', 'dep', 'dep']
];

// Hobart's parser is not among the worker's exports: lifted from its source
// with what it reads, as tests/hba-feed.test.js does.
function hbaParser() {
  const lift = (name) => {
    const at = WORKER.indexOf('function ' + name + '(');
    assert.ok(at >= 0, 'fids-proxy.js must define ' + name);
    let d = 0;
    for (let k = WORKER.indexOf('{', at); k < WORKER.length; k++) {
      if (WORKER[k] === '{') d++;
      else if (WORKER[k] === '}') { d--; if (!d) return WORKER.slice(at, k + 1); }
    }
    throw new Error('unterminated ' + name);
  };
  const table = (decl) => {
    const at = WORKER.search(decl);
    assert.ok(at >= 0, decl + ' must exist');
    let d = 0;
    for (let k = WORKER.indexOf('{', at); k < WORKER.length; k++) {
      if (WORKER[k] === '{') d++;
      else if (WORKER[k] === '}') { d--; if (!d) return WORKER.slice(at, k + 1) + ';'; }
    }
    throw new Error('unterminated table');
  };
  return new Function([
    'const __name = (f) => f;', 'const _tzOffsetFmt = new Map();',
    lift('tzOffsetAt'), lift('tzOffsetFor'), lift('localTimeObjIn'), lift('localTimeObjFromTs'),
    lift('localIsoObj'), lift('settleRevised'), lift('authorityFlight'),
    table(/const AIRLINE_IATA_NAME = \{/), table(/const HBA_STATUS = \{/), table(/const HBA_CITY_IATA = \{/),
    lift('hbaParseFeed'), 'return hbaParseFeed;'
  ].join('\n'))();
}

let SETS_ = null;
async function recorded() {
  if (SETS_) return SETS_;
  const W = await import(pathToFileURL(WORKER_PATH).href);
  const sets = [];
  const add = (file, dir, rows) => sets.push({ file, dir, rows: (rows || []).filter(Boolean) });
  const json = (file) => JSON.parse(fx(file));

  for (const [file, parser, dirs, at] of PARSED) {
    assert.equal(typeof W[parser], 'function', 'the worker exports ' + parser);
    for (const d of dirs) add(file, d, W[parser](fx(file), d, P(at)));
  }
  for (const [file, key, dir] of SERVED) add(file, dir, json(file)[key]);

  // the parsers with a signature of their own
  { const b = json('bos-sample.json'); for (const d of ['dep', 'arr']) add('bos-sample.json', d, W.bosParseFeed(JSON.stringify(b[d]), d, P(US))); }
  for (const home of ['DCA', 'IAD']) for (const d of ['dep', 'arr']) add('dca-sample.json', d, W.mwaaParseFeed(fx('dca-sample.json'), d, home, P('2026-09-05T00:30:00Z')));
  { const b = json('dub-sample.json'); for (const d of ['dep', 'arr']) add('dub-sample.json', d, W.dubParseRows(b[d] || [], d)); }
  { const hba = hbaParser(); for (const d of ['dep', 'arr']) add('hba-timetable.json', d, hba(fx('hba-timetable.json'), d)); }
  add('yhz-arrivals-sample.html', 'arr', W.yhzParseBoard(fx('yhz-arrivals-sample.html'), false, P('2026-09-04T23:30:00-03:00')));
  add('yhz-departures-sample.html', 'dep', W.yhzParseBoard(fx('yhz-departures-sample.html'), true, P('2026-09-04T23:30:00-03:00')));
  add('yqb-hits-sample.json', 'dep', W.yqbParseHits(fx('yqb-hits-sample.json'), 'dep'));
  add('yyt-dep-operator-sample.html', 'dep', W.yytParseTable(fx('yyt-dep-operator-sample.html', 'latin1'), 'dep', P('2026-10-04T12:00:00-02:30')));
  for (const d of ['departure', 'arrival']) for (const t of ['domestic', 'international']) for (const day of ['yesterday', 'today', 'tomorrow']) {
    const file = 'syd-' + d + '-' + t + '-' + day + '.json', dir = d === 'departure' ? 'dep' : 'arr';
    add(file, dir, W.sydParseFeed(fx(file), dir, P('2026-09-15T02:15:00+10:00')));
  }
  { const j = json('codeshare-neighbours-2026-10-12.json');
    for (const ap of Object.keys(j)) if (j[ap] && typeof j[ap] === 'object') for (const [k, d] of [['departures', 'dep'], ['arrivals', 'arr']]) if (Array.isArray(j[ap][k]) && j[ap][k].length) add('codeshare-neighbours-2026-10-12.json', d, j[ap][k]); }
  { const j = json('yqm-cache-sample.json'); for (const d of ['dep', 'arr']) add('yqm-cache-sample.json', d, j.flights.filter((x) => x.direction === d).map((x) => x.flight)); }

  // rows kept in a compact form (the flight number, its time, the far end):
  // the airline is the carrier of the number, and only the table can name it
  const compact = (num, far, dir) => {
    const home = { scheduledTime: { local: AT, utc: AT } }, other = { airport: { iata: far || null } };
    return { number: num, status: 'scheduled', codeshareStatus: 'IsOperator', departure: dir === 'dep' ? home : other, arrival: dir === 'dep' ? other : home };
  };
  { const j = json('yyc-2026-09-28-turns.json'); for (const [k, d] of [['departures', 'dep'], ['arrivals', 'arr']]) add('yyc-2026-09-28-turns.json', d, j[k].map((r) => compact(r[0], r[4], d))); }
  { const j = json('sea-pages-2026-10-12.json'); for (const [k, d] of [['departures', 'dep'], ['arrivals', 'arr']]) add('sea-pages-2026-10-12.json', d, j[k].map((r) => compact(r[0], r[2], d))); }

  // rows recorded as the airport sent them, through the board's own adapters
  const yqm = the('yqmToAdbFlight'), yyz = the('yyzToAdbFlight'), yul = the('yulToAdbFlight'), yhu = the('yhuToAdbFlight'), ytz = the('ytzToAdbFlight'), mia = the('miaToAdbFlight');
  for (const [file, dir] of [['yqm-cyqm-2026-09-28-2222-arrivals.json', 'arr'], ['yqm-cyqm-2026-09-28-2222-departures.json', 'dep'],
    ['yqm-cyqm-2026-09-30-0908-arrivals.json', 'arr'], ['yqm-cyqm-2026-09-30-0908-departures.json', 'dep'],
    ['yqm-worker-2026-10-02-1935-arrivals.json', 'arr'], ['yqm-worker-2026-10-02-1935-departures.json', 'dep']]) {
    add(file, dir, json(file).map((x) => yqm(x, dir === 'dep' ? 'Departure' : 'Arrival')));
  }
  add('fararr-2026-10-04/yqm-arr.json', 'arr', json('fararr-2026-10-04/yqm-arr.json').list.map((x) => yqm(x, 'Arrival')));
  add('fararr-2026-10-04/yqm-departures.json', 'dep', json('fararr-2026-10-04/yqm-departures.json').list.map((x) => yqm(x, 'Departure')));
  { const j = json('yqm-operator-sample.json'); add('yqm-operator-sample.json', 'dep', j.dep.map((x) => yqm(x, 'Departure'))); add('yqm-operator-sample.json', 'arr', j.arr.map((x) => yqm(x, 'Arrival'))); }
  // (these adapters read the direction off the record: a row is a departure
  // when its departure airport is the home airport)
  const byHome = (file, home, fn) => {
    const rows = json(file).list.map((x) => fn(x)).filter(Boolean);
    const isDep = (r) => String(((r.departure || {}).airport || {}).iata || '') === home;
    for (const d of ['dep', 'arr']) { const mine = rows.filter((r) => isDep(r) === (d === 'dep')); if (mine.length) add(file, d, mine); }
  };
  for (const file of ['yyz-arr-2026-11-02-1918.json', 'yyz-dep-operator-sample.json', 'fararr-2026-10-04/yyz-dep-capture.json']) byHome(file, 'YYZ', yyz);
  for (const file of ['yul-operator-sample.json', 'fararr-2026-10-04/yul-arr.json']) byHome(file, 'YUL', yul);
  byHome('fararr-2026-10-04/yhu-arr.json', 'YHU', yhu);
  byHome('fararr-2026-10-04/ytz-arr.json', 'YTZ', ytz);
  add('mia-airline-names-2026-11-13.json', 'arr', json('mia-airline-names-2026-11-13.json').arr.map((x) => mia(x, 'Arrival')));

  return (SETS_ = sets);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. EVERY RECORDED ROW
// ═══════════════════════════════════════════════════════════════════════════

test('every file of tests/fixtures is read as feed rows, or listed as holding none', async () => {
  const sets = await recorded();
  const all = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), rel + e.name + '/');
      else all.push(rel + e.name);
    }
  })(FX, '');
  const readFiles = new Set(sets.map((s) => s.file));
  const unread = all.filter((f) => !readFiles.has(f) && !own(NOT_FEED_ROWS, f));
  assert.deepEqual(unread, [], 'a recording nobody reads: run its rows here (PARSED, SERVED or an adapter), or list it in NOT_FEED_ROWS with what it holds');
  for (const f of Object.keys(NOT_FEED_ROWS)) {
    assert.ok(all.includes(f), f + ' is listed as holding no rows and is not in tests/fixtures');
    assert.ok(!readFiles.has(f), f + ' is both read and listed as holding no rows');
  }
  for (const f of readFiles) assert.ok(all.includes(f), f + ' is read and is not in tests/fixtures');
  // a parser that returned nothing would pass every check below in silence
  for (const s of sets) assert.ok(s.rows.length > 0, s.file + ' (' + s.dir + '): the recording gave no rows');
  const n = sets.reduce((a, s) => a + s.rows.length, 0);
  assert.ok(n > 12000, 'recorded rows read: ' + n);
});

test('every recorded row that stays on the board prints its airline by name, and every row that leaves is one the board keeps off', async () => {
  const sets = await recorded();
  // the row prints its airline from _airlineName, cased by tcAirline: what printed() reads
  assert.match(CORE, /tcAirline\(f\._airlineName \|\| AIRLINE_NAME\[f\.airline\] \|\| f\.airline \|\| '', f\.airline\)/, 'the row prints its airline from _airlineName');
  const FILTER_OUT = the('FILTER_OUT');
  const bare = {}, gone = {};
  let kept = 0, n = 0;
  for (const s of sets) for (const r of s.rows) {
    n++;
    const f = mapOne(r, s.dir);
    const far = ((s.dir === 'dep' ? r.arrival : r.departure) || {}).airport || {};
    const where = s.file + ' ' + s.dir + ' ' + String(r.number || '').replace(/\s+/g, '') + ' ' + (far.iata || far.name || '?');
    if (!f) { const c = carrierOf(r.number); (gone[c] = gone[c] || []).push(where); continue; }
    kept++;
    const p = printed(f);
    if (p.bare) (bare[p.code || carrierOf(r.number) || '(none)'] = bare[p.code || carrierOf(r.number) || '(none)'] || []).push(where + ' prints ' + JSON.stringify(p.shown));
  }
  assert.ok(kept > 12000, kept + ' of ' + n + ' recorded rows stay on the board');

  // rows that stay: a name, or the ledger
  const undecided = Object.keys(UNDECIDED).sort();
  const unnamed = Object.keys(bare).filter((c) => !own(UNDECIDED, c)).sort();
  assert.deepEqual(unnamed.map((c) => c + ': ' + bare[c].length + ' rows, e.g. ' + bare[c][0]), [],
    'rows on the board print only a code. Name the airline in AIRLINE_NAME (and shared-names.js), or keep it off the board in FILTER_OUT if it carries no passengers, or enter it in UNDECIDED with the reason');
  for (const c of undecided) {
    assert.ok(String(UNDECIDED[c] || '').length > 10, c + ' is in the ledger without a reason');
    assert.ok(own(bare, c), c + ' is in the ledger and no recorded row prints it bare any more: it is decided, take it out');
  }

  // rows that leave: only the ones kept off on purpose
  assert.deepEqual(Object.keys(gone).sort(), Object.keys(OFF_THE_BOARD).sort(),
    'the carriers of the recorded rows the board drops are exactly the ones listed in OFF_THE_BOARD: ' + JSON.stringify(gone));
  for (const c of Object.keys(OFF_THE_BOARD)) assert.ok(FILTER_OUT.has(c), c + ' (' + OFF_THE_BOARD[c] + ') is kept off by FILTER_OUT');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE RULE, ON ROWS WRITTEN FOR IT
// ═══════════════════════════════════════════════════════════════════════════

// A row as an airport's own feed sends it (feed-router.js adapters, the
// worker's authorityFlight): the airline on both legs, none at the top.
// `leg`: the airline on the legs; `top`: one at the top of the row as well.
function feedRow(o) {
  const t = { local: AT, utc: AT };
  const home = { airport: { iata: 'MIA', icao: 'KMIA', name: 'Miami' }, scheduledTime: t, quality: ['Live'] };
  const other = { airport: { iata: o.far || 'HAV', icao: null, name: null }, quality: ['Live'] };
  if (o.leg) { home.airline = o.leg; other.airline = o.leg; }
  const f = { number: o.number, callSign: null, status: 'scheduled', codeshareStatus: 'IsOperator', isCargo: false };
  if (o.top) f.airline = o.top;
  if (o.dir === 'arr') { f.arrival = home; f.departure = other; } else { f.departure = home; f.arrival = other; }
  return f;
}
// A code nothing in the board names, so only the feed can.
const NOBODY = 'XQQ';

test('an airline named only on its leg prints that name, as one named at the top does', () => {
  for (const t of ['AIRLINE_NAME', '_AIRLINE_NAME_OVERRIDE', 'PARENT']) assert.ok(!own(the(t), NOBODY), NOBODY + ' is in no table (' + t + ')');
  assert.ok(!the('FILTER_OUT').has(NOBODY));
  for (const dir of ['dep', 'arr']) {
    const onLeg = mapOne(feedRow({ dir, number: NOBODY + '504', leg: { iata: NOBODY, icao: null, name: 'Meridian Air Express' } }), dir);
    const atTop = mapOne(feedRow({ dir, number: NOBODY + '504', top: { iata: NOBODY, name: 'Meridian Air Express' } }), dir);
    assert.ok(onLeg && atTop, dir + ': both rows stay');
    assert.equal(onLeg._airlineName, 'MERIDIAN AIR EXPRESS', dir + ': the leg is read');
    assert.equal(onLeg._airlineName, atTop._airlineName, dir + ': and cased as the name at the top always was');
    assert.equal(printed(onLeg).shown, 'Meridian Air Express', dir + ': the row prints it in written case');
    assert.equal(printed(onLeg).bare, false);
    assert.equal(onLeg.airline, NOBODY, 'the code of the row is the carrier of its number, as before');
  }
  // the ICAO designator on the leg is the code of the row too
  const icao = mapOne(feedRow({ number: NOBODY + '12', leg: { iata: null, icao: NOBODY, name: 'Meridian Air Express' } }), 'dep');
  assert.equal(icao._airlineName, 'MERIDIAN AIR EXPRESS');
  // spaces in the number and around the name change nothing
  const spaced = mapOne(feedRow({ number: NOBODY + ' 12', leg: { iata: ' ' + NOBODY.toLowerCase() + ' ', name: '  Meridian Air Express ' } }), 'dep');
  assert.equal(spaced._airlineName, 'MERIDIAN AIR EXPRESS');
  // a name at the top of the row is the answer: the leg is asked only for what the top leaves unsaid
  const both = mapOne(feedRow({ number: NOBODY + '9', top: { iata: NOBODY, name: 'Top Name Air' }, leg: { iata: NOBODY, name: 'Leg Name Air' } }), 'dep');
  assert.equal(both._airlineName, 'TOP NAME AIR');
  const topNameOnly = mapOne(feedRow({ number: NOBODY + '9', top: { name: 'Top Name Air' }, leg: { iata: NOBODY, name: 'Leg Name Air' } }), 'dep');
  assert.equal(topNameOnly._airlineName, 'TOP NAME AIR');
  const topCodeOnly = mapOne(feedRow({ number: NOBODY + '9', top: { iata: NOBODY, name: null }, leg: { iata: NOBODY, name: 'Leg Name Air' } }), 'dep');
  assert.equal(topCodeOnly._airlineName, 'LEG NAME AIR', 'a code at the top with no name beside it: the leg names it');
  // and the home leg is the one read: the departure of a departures row
  const f = feedRow({ dir: 'dep', number: NOBODY + '77', leg: { iata: NOBODY, name: 'Home Leg Air' } });
  f.arrival.airline = { iata: NOBODY, name: 'Far Leg Air' };
  assert.equal(mapOne(f, 'dep')._airlineName, 'HOME LEG AIR');
});

test('the board\'s own table still outranks whatever the feed calls an airline', () => {
  // v194: feeds carry stale names (4Y was Yute Air); the table is the authority
  const named = mapOne(feedRow({ number: 'BBQ504', leg: { iata: 'BBQ', name: 'Some Older Name' } }), 'dep');
  assert.equal(named._airlineName, 'Eastern Air Express');
  const cayman = mapOne(feedRow({ number: 'KX107', leg: { iata: 'KX', name: 'Cayman Airways' } }), 'dep');
  assert.equal(cayman._airlineName, the('AIRLINE_NAME').KX);
});

test('an operating carrier named on the leg is never printed as the airline of another carrier\'s row', () => {
  // a number nobody names, flown by a carrier the leg names: the name is the
  // operator's and stays off the airline cell; it is the Operated-by evidence
  const sold = mapOne(feedRow({ number: NOBODY + '4410', leg: { iata: 'YV', icao: 'ASH', name: 'Mesa Airlines' } }), 'dep');
  assert.ok(sold, 'the row stays');
  assert.equal(sold._airlineName, '', 'the name of the operating carrier is not taken for the row');
  assert.equal(sold.airline, NOBODY);
  assert.equal(sold._opEv && sold._opEv.op, 'YV', 'the leg stays what it was: who operates');
  // a number the table names keeps its own name
  const ua = mapOne(feedRow({ number: 'UA5000', leg: { iata: 'YV', name: 'Mesa Airlines' } }), 'dep');
  assert.equal(ua._airlineName, the('AIRLINE_NAME').UA);
  assert.equal(ua._opEv && ua._opEv.op, 'YV');
  // a number with no carrier at all proves nothing about the leg
  const bare = mapOne(feedRow({ number: '4410', leg: { iata: 'YV', name: 'Mesa Airlines' } }), 'dep');
  assert.equal(bare ? bare._airlineName : '', '');
  // and a regional sold under its mainline keeps the mainline: American Eagle
  // at Miami files MQ on the leg and on the number, and prints American
  const eagle = mapOne(feedRow({ number: 'MQ3411', leg: { iata: 'MQ', name: 'American Eagle' } }), 'dep');
  assert.equal(eagle.airline, 'AA');
  assert.equal(eagle._airlineName, the('AIRLINE_NAME').AA);
  assert.equal(eagle._opEv && eagle._opEv.op, 'MQ', 'the operator evidence is as it was before the leg was read for a name');
});

test('a cargo or private operator named only on its leg is dropped, as one named at the top is', () => {
  for (const name of ['Amazon Air', 'FedEx Feeder', 'NetJets Aviation', 'Quest Diagnostics', 'Angel Flight West']) {
    for (const dir of ['dep', 'arr']) {
      assert.equal(mapOne(feedRow({ dir, number: NOBODY + '77', top: { iata: NOBODY, name } }), dir), null, name + ' at the top (' + dir + ')');
      assert.equal(mapOne(feedRow({ dir, number: NOBODY + '77', leg: { iata: NOBODY, icao: null, name } }), dir), null, name + ' on the leg only (' + dir + ')');
    }
  }
  // a passenger airline on the same leg stays
  assert.ok(mapOne(feedRow({ number: NOBODY + '77', leg: { iata: NOBODY, name: 'Meridian Air Express' } }), 'dep'));
  // the name on the leg of an operating carrier does not drop a passenger row sold by another
  assert.ok(mapOne(feedRow({ number: 'UA5000', leg: { iata: 'YV', name: 'Amazon Air' } }), 'dep'), 'only the airline of the row is judged');
  // a filtered code is off the board wherever the feed wrote it
  for (const code of ['M6', 'KJ', 'WFS', 'A1', '5Y', 'FX']) {
    assert.ok(the('FILTER_OUT').has(code), code + ' is in FILTER_OUT');
    assert.equal(mapOne(feedRow({ number: code + '242', leg: { iata: code, name: 'Whoever' } }), 'dep'), null, code + ' on the leg');
    assert.equal(mapOne(feedRow({ number: code + '242', top: { iata: code, name: 'Whoever' } }), 'arr'), null, code + ' at the top');
  }
});

test('a code that is not a carrier, as the JFK rows show it: A1 is off the board, the sellers beside it are named', () => {
  // The Port Authority lists every seller of a flight. A1 (A.P.G.
  // Distribution Systems) sells seats on Norse Atlantic; KP, HF and OM sell
  // seats on Ethiopian and Cathay Pacific. The worker's parser folds them
  // into the operator's row; this is each standing alone, through the board's
  // own adapter for those records.
  const panynj = the('panynjToAdbFlight');
  const seen = {};
  for (const [file, node, dirName, dir] of [['jfk-dep-sample.json', 'getDepartingFlights', 'Departure', 'dep'], ['jfk-arr-sample.json', 'getArrivingFlights', 'Arrival', 'arr']]) {
    for (const rec of JSON.parse(fx(file)).data[node].data) {
      if (!['A1', 'KP', 'HF', 'OM', 'IZ'].includes(rec.airlineCode)) continue;
      const row = panynj(rec, dirName, 'JFK');
      assert.ok(row, file + ' ' + rec.airlineCode + rec.flightNumber);
      const f = mapOne(row, dir);
      (seen[rec.airlineCode] = seen[rec.airlineCode] || []).push(f ? f._airlineName : null);
    }
  }
  assert.deepEqual(seen.A1, [null, null, null, null], 'the four A1 records leave the board');
  assert.deepEqual([...new Set(seen.KP)], ['ASKY Airlines']);
  assert.deepEqual([...new Set(seen.HF)], ['Air Côte d’Ivoire']);
  assert.deepEqual([...new Set(seen.OM)], ['MIAT Mongolian Airlines']);
  assert.deepEqual([...new Set(seen.IZ)], ['Arkia']);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. MIAMI, 2026-11-13
// ═══════════════════════════════════════════════════════════════════════════

test('Miami: BBQ, WAL, G6 and OB print the airline, through the airport feed and through the backup list', () => {
  const M = JSON.parse(fx('mia-airline-names-2026-11-13.json'));
  const mia = the('miaToAdbFlight');
  const WANT = { BBQ: 'Eastern Air Express', WAL: 'World Atlantic', G6: 'GlobalX Airlines', OB: 'BoA', KX: 'Cayman', UX: 'Air Europa', AA: 'American', MQ: 'American' };
  const got = { arr: {}, dep: {} };
  for (const rec of M.arr) {
    const row = mia(rec, 'Arrival');
    assert.ok(!row.airline, 'the airport feed names the airline on the legs, not at the top');
    assert.equal(row.arrival.airline.name, rec.airlineName);
    const f = mapOne(row, 'arr');
    assert.ok(f, rec.CXR + rec.TRN + ' stays on the board');
    (got.arr[rec.CXR] = got.arr[rec.CXR] || new Set()).add(printed(f).shown);
    assert.equal(printed(f).bare, false, rec.CXR + rec.TRN + ' prints ' + printed(f).shown);
  }
  for (const row of M.dep) {
    assert.ok(!row.airline, 'the backup list names the airline on the legs, not at the top');
    const f = mapOne(row, 'dep');
    assert.ok(f, row.number + ' stays on the board');
    const c = carrierOf(row.number);
    (got.dep[c] = got.dep[c] || new Set()).add(printed(f).shown);
    assert.equal(printed(f).bare, false, row.number + ' prints ' + printed(f).shown);
  }
  const flat = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, [...o[k]].join(' / ')]));
  assert.deepEqual(flat(got.arr), Object.fromEntries(Object.keys(WANT).sort().map((k) => [k, WANT[k]])), 'arrivals, the airport feed');
  assert.deepEqual(flat(got.dep), Object.fromEntries(['AA', 'BBQ', 'KX', 'MQ', 'OB', 'UX'].map((k) => [k, WANT[k]])), 'departures, the backup list');
  // and with the table emptied of them, the name the airport gave is what prints:
  // the fix does not rest on the table
  const T = the('AIRLINE_NAME');
  const saved = {};
  for (const c of ['BBQ', 'WAL', 'G6', 'OB']) { saved[c] = T[c]; delete T[c]; }
  try {
    const feedNamed = {};
    for (const rec of M.arr) if (own(saved, rec.CXR)) feedNamed[rec.CXR] = mapOne(mia(rec, 'Arrival'), 'arr')._airlineName;
    assert.deepEqual(feedNamed, { WAL: 'WORLD ATLANTIC', OB: 'BOA', BBQ: 'EASTERN AIR EXPRESS', G6: 'GLOBALX AIRLINES' });
  } finally { Object.assign(T, saved); }
});

test('the names added to the table are the app\'s too, written the same', () => {
  const SHARED = {};
  vm.runInNewContext(read('fids-current/js/shared-names.js'), { window: SHARED });
  const T = the('AIRLINE_NAME');
  const ADDED = ['BBQ', 'WAL', 'G6', 'OB', 'ZL', 'FP', 'QN', 'FC', 'OD', 'HO', '5J', 'TW', 'SB', 'GS', 'VJ', 'HX', '3U', 'D7', 'JD', 'IZ', 'KP', 'HF', 'OM', '4O', 'FB', 'VF', 'WP', '0N'];
  for (const c of ADDED) {
    assert.ok(T[c], c + ' is named on the boards');
    assert.equal(SHARED.FIDS_SHARED_AIRLINE[c], T[c], c + ' is named the same in shared-names.js');
    assert.ok(!the('FILTER_OUT').has(c), c + ' is named and is not also kept off the board');
  }
  // the two forms of one airline print one name
  assert.equal(T.WAL, T.WL);
  assert.equal(T.WP, T.WT);
  assert.equal(T['0N'], T.NSA);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. THE PHONE APP
// ═══════════════════════════════════════════════════════════════════════════

// A function of app.html, from the line it starts on to its closing brace
// (as tests/companion-app-rows.test.js lifts them).
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

test('the phone app reads the name off the leg by the same rule', () => {
  // the app's own tables: its names, then the boards' from shared-names.js, as the page builds them
  const alCaseTable = APP.match(/\nconst AL_CASE=\{[\s\S]*?\};/), airlineTable = APP.match(/\nconst AIRLINE=\{[\s\S]*?\};/);
  assert.ok(alCaseTable && airlineTable, 'AL_CASE and AIRLINE');
  const SHARED = {};
  vm.runInNewContext(read('fids-current/js/shared-names.js'), { window: SHARED });
  const AIRLINE = new Function(airlineTable[0] + '; return AIRLINE;')();
  for (const c of Object.keys(SHARED.FIDS_SHARED_AIRLINE)) if (!AIRLINE[c]) AIRLINE[c] = SHARED.FIDS_SHARED_AIRLINE[c];
  assert.match(APP, /if\(window\.FIDS_SHARED_AIRLINE\)\{for\(var _sa in FIDS_SHARED_AIRLINE\)\{if\(!AIRLINE\[_sa\]\)AIRLINE\[_sa\]=FIDS_SHARED_AIRLINE\[_sa\];\}\}/, 'the page fills AIRLINE the same way');
  assert.ok(!own(AIRLINE, NOBODY));
  const app = new Function(['REGIONAL_FAM', 'AIRLINE', 'BRAND', 'REGIONAL_OP', 'wmUrls'],
    alCaseTable[0] + appFn('adbHHMM') + appFn('inferOperator') + appFn('adbToCard') + appFn('alCase') + appFn('airlineName')
    + '; return { adbToCard: adbToCard, airlineName: airlineName };')({ MQ: 'AA' }, AIRLINE, {}, {}, () => null);
  const card = (o, dir) => app.adbToCard(feedRow(o), dir || 'dep');
  // named only on its leg
  const leg = card({ number: NOBODY + '504', leg: { iata: NOBODY, icao: null, name: 'Meridian Air Express' } });
  assert.equal(leg.alName, 'Meridian Air Express');
  assert.equal(app.airlineName(leg), 'Meridian Air Express', 'and the card prints it');
  assert.equal(card({ dir: 'arr', number: NOBODY + '504', leg: { iata: NOBODY, name: 'Meridian Air Express' } }, 'arr').alName, 'Meridian Air Express');
  assert.equal(card({ number: NOBODY + '504', leg: { iata: null, icao: NOBODY, name: 'Meridian Air Express' } }).alName, 'Meridian Air Express');
  assert.equal(app.airlineName(card({ number: NOBODY + '504', leg: { iata: NOBODY, name: 'MERIDIAN AIR EXPRESS' } })), 'Meridian Air Express', 'a name in capitals is cased as the app cases names');
  // at the top, as before; a code at the top with no name beside it is named by the leg
  assert.equal(card({ number: NOBODY + '504', top: { iata: NOBODY, name: 'Top Name Air' }, leg: { iata: NOBODY, name: 'Leg Name Air' } }).alName, 'Top Name Air');
  assert.equal(card({ number: NOBODY + '504', top: { iata: NOBODY, name: null }, leg: { iata: NOBODY, name: 'Leg Name Air' } }).alName, 'Leg Name Air');
  // an operating carrier on the leg is the Operated-by line, never the airline
  const op = card({ number: 'UA5000', leg: { iata: 'YV', name: 'Mesa Airlines' } });
  assert.equal(op.alName, '');
  assert.equal(op.operatedBy, 'Mesa Airlines');
  assert.equal(app.airlineName(op), 'United');
  assert.equal(card({ number: NOBODY + '4410', leg: { iata: 'YV', name: 'Mesa Airlines' } }).alName, '', 'nor for a number nobody names');
  assert.equal(card({ number: '4410', leg: { iata: 'YV', name: 'Mesa Airlines' } }).alName, '', 'nor for a number with no carrier');
  // a carrier the app names prints as it did: the leg is not asked
  const dl = card({ number: 'DL142', leg: { iata: 'DL', name: 'Delta Air Lines' } });
  assert.equal(dl.alName, '');
  assert.equal(app.airlineName(dl), 'Delta');
  // Miami, as recorded: the backup list rows, which are what the app reads
  const M = JSON.parse(fx('mia-airline-names-2026-11-13.json'));
  const names = {};
  for (const row of M.dep) { const c = app.adbToCard(row, 'dep'); names[carrierOf(row.number)] = app.airlineName(c); }
  assert.deepEqual(names, { BBQ: 'Eastern Air Express', KX: 'Cayman', OB: 'BoA', UX: 'Air Europa', AA: 'American', MQ: 'American' });
  // and with the app's table emptied of them, the name the airport gave
  const saved = {};
  for (const c of ['BBQ', 'OB']) { saved[c] = AIRLINE[c]; delete AIRLINE[c]; }
  try {
    const fromFeed = {};
    for (const row of M.dep) if (own(saved, carrierOf(row.number))) fromFeed[carrierOf(row.number)] = app.airlineName(app.adbToCard(row, 'dep'));
    assert.deepEqual(fromFeed, { BBQ: 'Eastern Air Express', OB: 'BoA' });
  } finally { Object.assign(AIRLINE, saved); }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. THE SAME ANSWER ON THE PHONE
// ═══════════════════════════════════════════════════════════════════════════

// The app as the page builds it: its own tables, then the boards' from
// shared-names.js, cut from app.html and run in the page's order, with the
// real adbToCard and name function. `window` is what shared-names.js filled.
let APP_ = null;
function theApp() {
  if (APP_) return APP_;
  const cut = (re) => { const m = APP.match(re); assert.ok(m, 'app.html: ' + re); return m[0]; };
  const win = {};
  vm.runInNewContext(read('fids-current/js/shared-names.js'), { window: win });
  const ownTable = cut(/\nconst AIRLINE=\{[\s\S]*?\};/);
  const src = 'const FIDS_SHARED_AIRLINE = window.FIDS_SHARED_AIRLINE, FIDS_SHARED_WORDMARK = window.FIDS_SHARED_WORDMARK;'
    + ownTable + cut(/\nif\(window\.FIDS_SHARED_AIRLINE\)[^\n]*/)
    + cut(/\nconst WORDMARK=\{[\s\S]*?\};/) + cut(/\nconst BRAND=\{[\s\S]*?\};/)
    + cut(/\nconst REGIONAL_FAM=\{[^\n]*\};/) + cut(/\nconst REGIONAL_OP=\{[^\n]*\};/) + cut(/\nconst AL_CASE=\{[\s\S]*?\};/) + '\n'
    + appFn('wmUrls') + appFn('adbHHMM') + appFn('inferOperator') + appFn('adbToCard') + appFn('alCase') + appFn('airlineName')
    + '; return { adbToCard: adbToCard, airlineName: airlineName, AIRLINE: AIRLINE, REGIONAL_FAM: REGIONAL_FAM };';
  APP_ = new Function('window', src)(win);
  APP_.OWN = new Function(ownTable + '; return AIRLINE;')();   // the app's own short list, before the boards' table fills the rest
  APP_.shared = win;
  return APP_;
}
const plain = (o) => JSON.parse(JSON.stringify(o));   // out of the vm's own Object

// One name, as two screens write it: the same letters, whatever the casing
// and the accents (the board prints Aeroméxico from its casing table, the app
// Aeromexico from the name table).
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
// THE ONE DELIBERATE DIFFERENCE. The app prints an airline's name in full
// where the board prints its short form: the board's name, then more
// (app.html airlineName and AL_CASE). Nothing else may differ.
const fuller = (onBoard, onPhone) => { const b = fold(onBoard).replace(/\.$/, ''), a = fold(onPhone); return !!b && a.length > b.length && a.indexOf(b) === 0; };
// Where it happens on the recorded rows: the feed names the airline at the
// top of the row with the board's name and more. [on the board, on the phone]
const FULLER_ON_RECORDED_ROWS = {
  AA: ['American', 'American Airlines'],
  DL: ['Delta', 'Delta Air Lines'],
  UA: ['United', 'United Airlines'],
  WN: ['Southwest', 'Southwest Airlines']
};
// And in the tables alone: a short form of the boards the app writes out.
const WRITTEN_OUT_ON_THE_PHONE = { S5: ['Shuttle Am.', 'Shuttle America'] };

// Every recorded row with what the board made of it (null: dropped), once.
let ROWS_ = null;
async function boardRows() {
  if (ROWS_) return ROWS_;
  const out = [];
  for (const s of await recorded()) for (const r of s.rows) {
    const far = ((s.dir === 'dep' ? r.arrival : r.departure) || {}).airport || {};
    out.push({ r, dir: s.dir, f: mapOne(r, s.dir), where: s.file + ' ' + s.dir + ' ' + String(r.number || '').replace(/\s+/g, '') + ' ' + (far.iata || far.name || '?') });
  }
  return (ROWS_ = out);
}

test('the off-board codes and name patterns the phone reads are the board\'s own', () => {
  const win = theApp().shared;
  const codes = plain(win.FIDS_SHARED_OFF_BOARD), names = plain(win.FIDS_SHARED_OFF_BOARD_NAMES);
  assert.equal(new Set(codes).size, codes.length, 'no code is listed twice');
  assert.deepEqual([...codes].sort(), [...the('FILTER_OUT')].sort(),
    'shared-names.js FIDS_SHARED_OFF_BOARD is fids-core.js FILTER_OUT: a code added to or taken out of one is added to or taken out of the other');
  // the patterns are a list inside mapADB: read from its source
  const m = CORE.match(/\n {4}const _NON_PASSENGER_PATTERNS = \[([\s\S]*?)\n {4}\];/);
  assert.ok(m, 'mapADB lists _NON_PASSENGER_PATTERNS');
  const patterns = new Function('return [' + m[1] + '\n];')();
  assert.ok(patterns.length > 20);
  assert.deepEqual(names, patterns, 'shared-names.js FIDS_SHARED_OFF_BOARD_NAMES is fids-core.js _NON_PASSENGER_PATTERNS');
  for (const p of names) assert.equal(p, p.toLowerCase(), p + ' is matched against a name in small letters');
  // and the app's mapper reads both
  assert.match(appFn('adbToCard'), /FIDS_SHARED_OFF_BOARD\b[\s\S]*FIDS_SHARED_OFF_BOARD_NAMES\b/);
});

test('the phone app takes off what the board takes off, by the same rule', () => {
  const app = theApp();
  // one row through both screens: [stays on the board, is a card on the phone]
  const both = (o) => { const dir = o.dir || 'dep', row = feedRow(o); return [!!mapOne(row, dir), !!app.adbToCard(row, dir)]; };
  const OFF = [false, false], ON = [true, true];
  // an operator a feed names as carrying no passengers: at the top of the row, or on its own leg
  for (const name of ['Amazon Air', 'FedEx Feeder', 'NetJets Aviation', 'Quest Diagnostics', 'Angel Flight West']) for (const dir of ['dep', 'arr']) {
    assert.deepEqual(both({ dir, number: NOBODY + '77', top: { iata: NOBODY, name } }), OFF, name + ' at the top (' + dir + ')');
    assert.deepEqual(both({ dir, number: NOBODY + '77', leg: { iata: NOBODY, icao: null, name } }), OFF, name + ' on the leg only (' + dir + ')');
    assert.deepEqual(both({ dir, number: NOBODY + '77', leg: { iata: null, icao: NOBODY, name } }), OFF, name + ' on a leg coded in three letters (' + dir + ')');
  }
  // a passenger airline on the same leg stays; so does a passenger flight whose operating carrier has such a name
  assert.deepEqual(both({ number: NOBODY + '77', leg: { iata: NOBODY, name: 'Meridian Air Express' } }), ON);
  assert.deepEqual(both({ number: 'UA5000', leg: { iata: 'YV', name: 'Amazon Air' } }), ON, 'only the airline of the row is judged');
  // a filtered code, wherever the feed wrote it
  for (const code of ['M6', 'AJT', 'KJ', 'AIH', 'WFS', 'A1', '5Y', 'FX', 'W8', 'CJT']) {
    assert.deepEqual(both({ number: code + '242' }), OFF, code + ' as the carrier of the number alone');
    assert.deepEqual(both({ number: code + '242', leg: { iata: code, name: 'Whoever' } }), OFF, code + ' on the leg');
    assert.deepEqual(both({ dir: 'arr', number: code + '242', top: { iata: code, name: 'Whoever' } }), OFF, code + ' at the top');
    assert.deepEqual(both({ number: 'UA5000', top: { iata: code, name: null } }), OFF, code + ' at the top of another carrier\'s number');
    assert.deepEqual(both({ number: NOBODY + '12', leg: { iata: code, icao: NOBODY, name: 'Whoever' } }), OFF, code + ' beside the three letters of the number, on its own leg');
    assert.deepEqual(both({ number: 'UA5000', leg: { iata: code, name: 'Whoever' } }), ON, code + ' on the leg of a flight United sells: the operating carrier is not the airline of the row');
  }
  // the JFK records, each seller standing alone (the board's own adapter):
  // the four A1 records give no card, the sellers beside them a named one
  const panynj = the('panynjToAdbFlight');
  const jfk = {};
  for (const [file, node, dirName, dir] of [['jfk-dep-sample.json', 'getDepartingFlights', 'Departure', 'dep'], ['jfk-arr-sample.json', 'getArrivingFlights', 'Arrival', 'arr']]) {
    for (const rec of JSON.parse(fx(file)).data[node].data) {
      if (!['A1', 'KP', 'HF', 'OM', 'IZ'].includes(rec.airlineCode)) continue;
      const c = app.adbToCard(panynj(rec, dirName, 'JFK'), dir);
      (jfk[rec.airlineCode] = jfk[rec.airlineCode] || new Set()).add(c ? app.airlineName(c) : null);
    }
  }
  assert.deepEqual(Object.fromEntries(Object.keys(jfk).sort().map((k) => [k, [...jfk[k]]])),
    { A1: [null], HF: ['Air Côte d’Ivoire'], IZ: ['Arkia'], KP: ['ASKY Airlines'], OM: ['MIAT Mongolian Airlines'] });
  // Cargojet was named in the app's own table: an all-cargo airline is on no screen
  assert.ok(!own(app.OWN, 'W8'), 'the app\'s own table does not name Cargojet');
  assert.ok(the('FILTER_OUT').has('W8'));
  // a page that could not load the lists shows what it showed before: the rule reads the boards' lists, it holds none of its own
  const bare = new Function(['REGIONAL_FAM', 'AIRLINE', 'BRAND', 'REGIONAL_OP', 'wmUrls'], appFn('adbHHMM') + appFn('inferOperator') + appFn('adbToCard') + '; return adbToCard;')({}, {}, {}, {}, () => null);
  assert.ok(bare(feedRow({ number: '5Y8242', leg: { iata: '5Y', name: 'Atlas Air' } }), 'dep'));
});

test('the phone app: every recorded row the board drops gives no card, and every row it keeps gives a card with the same airline name', async () => {
  const rows = await boardRows();
  const app = theApp();
  const put = (o, k, v) => { (o[k] = o[k] || []).push(v); };
  const shown = {}, missing = {}, bare = {}, differs = {}, full = {}, off = {};
  let cards = 0, same = 0;
  for (const { r, dir, f, where } of rows) {
    const c = app.adbToCard(r, dir), k = carrierOf(r.number);
    if (!f) { if (c) put(shown, k, where + ' reads ' + app.airlineName(c)); else off[k] = (off[k] || 0) + 1; continue; }
    if (!c) { put(missing, k, where); continue; }
    cards++;
    const b = printed(f).shown, a = String(app.airlineName(c) || '').trim();
    if (!a || [c.airline, k].some((x) => x && fold(a) === fold(x))) put(bare, k, where + ' reads ' + JSON.stringify(a));
    if (fold(a) === fold(b)) { same++; continue; }
    // the fuller form: only the feed's own name for the airline, at the top of the row
    if (fuller(b, a) && a === String((r.airline && r.airline.name) || '').trim() && f.airline === c.airline) { (full[c.airline] = full[c.airline] || new Set()).add(b + ' / ' + a); continue; }
    put(differs, k, where + ': the board prints ' + JSON.stringify(b) + ', the phone ' + JSON.stringify(a));
  }
  const some = (o) => Object.keys(o).sort().map((k) => k + ': ' + o[k].length + ' rows, e.g. ' + o[k][0]);
  assert.deepEqual(some(shown), [], 'cards on the phone for rows the board drops');
  assert.deepEqual(Object.keys(off).sort(), Object.keys(OFF_THE_BOARD).sort(), 'the rows off both screens are the ones listed in OFF_THE_BOARD: ' + JSON.stringify(off));
  assert.deepEqual(some(missing), [], 'rows on the board with no card on the phone');
  assert.deepEqual(some(bare), [], 'cards that print only a code');
  assert.deepEqual(some(differs), [], 'one flight, two airline names');
  assert.deepEqual(Object.fromEntries(Object.keys(full).sort().map((k) => [k, [...full[k]].join(' ; ')])),
    Object.fromEntries(Object.keys(FULLER_ON_RECORDED_ROWS).sort().map((k) => [k, FULLER_ON_RECORDED_ROWS[k].join(' / ')])),
    'the only difference between the two screens is the fuller form of these names');
  assert.ok(cards > 12000 && same > cards - 100, same + ' of ' + cards + ' cards print the board\'s name letter for letter');
});

test('one name on every screen: the app\'s tables are the board\'s, and a flight of every code prints the same name on both', () => {
  const app = theApp();
  const T = plain(the('AIRLINE_NAME')), PARENT = plain(the('PARENT')), OFF = the('FILTER_OUT');
  // the copy is the table, whole: no code missing, none extra, no other spelling
  assert.deepEqual(plain(app.shared.FIDS_SHARED_AIRLINE), T,
    'shared-names.js FIDS_SHARED_AIRLINE is fids-core.js AIRLINE_NAME: a name added or changed in one is added or changed in the other');
  // the app's own short list writes the same names in its own casing, and wins only on casing
  for (const c of Object.keys(app.OWN)) {
    assert.ok(own(T, c), c + ' is named by the app and not by the boards');
    assert.equal(app.OWN[c].toUpperCase(), T[c].toUpperCase(), c + ': the app\'s own name is the board\'s');
  }
  for (const c of Object.keys(T)) assert.equal(String(app.AIRLINE[c] || '').toUpperCase(), T[c].toUpperCase(), c + ' as the page builds its table');
  // a regional folds into its mainline on the phone exactly where it does on the board
  const kept = {};
  for (const c of Object.keys(PARENT)) if (!OFF.has(c)) kept[c] = PARENT[c];
  assert.deepEqual(plain(app.REGIONAL_FAM), kept, 'app.html REGIONAL_FAM is fids-core.js PARENT for every code the boards keep on the screen');
  // and what each screen prints for a flight of each code, named by nothing but its number
  const differs = {}, written = {};
  let n = 0;
  for (const c of new Set([...Object.keys(T), ...Object.keys(PARENT)])) {
    const row = feedRow({ number: c + '123' });
    const f = mapOne(row, 'dep'), card = app.adbToCard(row, 'dep');
    if (OFF.has(c)) { assert.equal(f, null, c + ' is off the board'); assert.equal(card, null, c + ' is off the phone'); continue; }
    assert.ok(f && card, c + ' is on both screens');
    n++;
    const p = printed(f), a = app.airlineName(card);
    assert.equal(p.bare, false, c + ' prints a name on the board');
    if (fold(a) === fold(p.shown)) continue;
    if (fuller(p.shown, a)) written[c] = [p.shown, a]; else differs[c] = 'the board prints ' + p.shown + ', the phone ' + a;
  }
  assert.ok(n > 250, n + ' codes');
  assert.deepEqual(differs, {}, 'one code, two names');
  assert.deepEqual(written, WRITTEN_OUT_ON_THE_PHONE, 'the only short form the app writes out');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. A NAME IS NOT ENOUGH, IT HAS TO BE THE AIRLINE
// ═══════════════════════════════════════════════════════════════════════════

// Recorded rows whose airport names the airline in words the board's name
// shares none of, accepted, by code: the airport's name, what the board
// prints, and why it stands. Anything else that turns up is a wrong entry in
// the table (or a new short form to enter here); an entry no recorded row
// shows any more fails too.
const NAMED_OTHERWISE = {
  JL: ['Japan Airlines', 'JAL', 'the short form the airline itself goes by'],
  NH: ['All Nippon Airways', 'ANA', 'the short form the airline itself goes by'],
  NZ: ['Air New Zealand', 'Air NZ', 'the short form of the boards'],
  CJ: ['BA Cityflyer', 'British Airways', 'the boards print British Airways on the rows BA CityFlyer flies for it (v23363)'],
  '9X': ['Southern Airways Express', 'Mokulele', 'Southern Airways Express holds the code and flies as Mokulele in Hawaii, which is what the name, the colour and the emblem of 9X are; Phoenix names the company on its Imperial flights. Not decided here'],
  '9M': ['Central Mountain Air', 'Air Canada', 'the boards fold 9M into Air Canada (PARENT), an older decision this test does not judge']
};
// Words every airline has: sharing one of them says nothing.
const EVERY_AIRLINE = new Set(['AIR', 'AIRLINES', 'AIRLINE', 'AIRWAYS', 'AIRWAY', 'AVIATION', 'THE', 'OF', 'DE', 'LINEAS', 'AEREAS', 'INTERNATIONAL', 'EXPRESS']);
const nameWords = (s) => fold(s).split(/[^A-Z0-9]+/).filter((w) => w && !EVERY_AIRLINE.has(w));
// Two names of one airline share a word of their own, or one is written
// inside the other once the spaces are out (Frenchbee, French Bee).
function oneAirline(x, y) {
  const wx = nameWords(x), wy = new Set(nameWords(y));
  if (wx.some((w) => wy.has(w))) return true;
  const sx = wx.join(''), sy = [...wy].join('');
  return !!sx && !!sy && (sx.includes(sy) || sy.includes(sx));
}

test('a recorded row whose airport names another airline than the table does fails, unless the short form is in the ledger', async () => {
  // the check, on the names that went wrong and on names that are right
  assert.equal(oneAirline('Rise Air', 'Beond'), false, 'BEOND for Rise Air is caught');
  assert.equal(oneAirline('Air Canada', 'Air Inuit'), false, 'two airlines that share only the word every airline has');
  assert.equal(oneAirline('Frenchbee', 'French Bee'), true);
  assert.equal(oneAirline('ToMontenegro', 'Air Montenegro'), true);
  assert.equal(oneAirline('Xiamen Airlines', 'Xiamen Air'), true);
  assert.equal(oneAirline('American Airlines', 'American'), true);
  const rows = await boardRows();
  const feedAirline = the('_adbFeedAirline');
  const seen = {}, by = {};
  let judged = 0;
  for (const { r, dir, f } of rows) {
    if (!f) continue;
    const k = carrierOf(r.number), fa = feedAirline(r, dir), shown = printed(f).shown;
    (by[k] = by[k] || new Set()).add(shown);
    // a feed that writes the code where the name goes names nobody
    if (!fa.name || [k, fa.code].some((c) => c && fold(fa.name) === fold(c))) continue;
    judged++;
    if (!oneAirline(fa.name, shown)) (seen[k] = seen[k] || new Set()).add(fa.name + ' / ' + shown);
  }
  assert.ok(judged > 8000, judged + ' recorded rows carry the airport\'s own name for the airline of the row');
  assert.deepEqual(Object.fromEntries(Object.keys(seen).sort().map((k) => [k, [...seen[k]].sort().join(' ; ')])),
    Object.fromEntries(Object.keys(NAMED_OTHERWISE).sort().map((k) => [k, NAMED_OTHERWISE[k][0] + ' / ' + NAMED_OTHERWISE[k][1]])),
    'the airport names one airline and the table another. Correct the name in AIRLINE_NAME (and shared-names.js), or enter the short form in NAMED_OTHERWISE with the reason');
  for (const k of Object.keys(NAMED_OTHERWISE)) assert.ok(String(NAMED_OTHERWISE[k][2] || '').length > 10, k + ' is in the ledger without a reason');
  // the two entries that were wrong: each code holds one airline today, and
  // the airport's own name for it is what prints. (Norse Atlantic France
  // shared two words with Norse Atlantic UK: no word test catches that one,
  // so it is held by name.)
  assert.deepEqual([...by['4T']], ['Rise Air'], 'Saskatoon: 4T is Rise Air');
  assert.deepEqual([...by.Z0], ['Norse Atlantic UK'], 'Orlando to London Gatwick: Z0 is Norse Atlantic UK');
  assert.equal(the('AIRLINE_NAME')['4T'], theApp().shared.FIDS_SHARED_AIRLINE['4T']);
});

test('TW prints Trinity Airways as text: no table draws the lettering of the name it left', () => {
  // t-way Air has flown as Trinity Airways since 10 September 2026, code
  // unchanged. /logos/wordmarks/TW.svg is still the old lettering, so no
  // table may point a row at it until the art is redrawn.
  assert.equal(the('AIRLINE_NAME').TW, 'Trinity Airways');
  for (const t of ['IATA_WORDMARK_ONE', 'IATA_TO_WORDMARK', 'IATA_TO_EMBLEM', 'IATA_TO_TILE_ICAO']) assert.ok(!own(the(t), 'TW'), t + ' has no TW');
  assert.ok(!own(theApp().shared.FIDS_SHARED_WORDMARK, 'TW'), 'nor the app\'s wordmarks');
  assert.ok(!/\/logos\/wordmarks\/TW[.-]/.test(CORE.replace(/^\s*\/\/.*$/gm, '')), 'no line of the board script points at the TW wordmark files');
});
