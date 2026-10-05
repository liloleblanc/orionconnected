'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23996 — FEED PROTECTION, THE BOARD HALF.
//
// feed-router.js runs here in a sandbox with a fake fetch and localStorage:
// a feed the worker calls blocked never becomes an empty list, the board keeps
// its own last good list for 180 minutes and says how old it is, and with
// nothing at all it says the live data is unavailable. Then the words (all
// nine languages), the calm strip, and the three dock readers (docked ∪ auto).
// ═══════════════════════════════════════════════════════════════════════════
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ROUTER = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'feed-router.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const MENU = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'menu.js'), 'utf8');
const ROTATE = fs.readFileSync(path.join(ROOT, 'fids-current', 'rotate.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const PROXY = 'https://fids-proxy.n-leblanc1984.workers.dev';
const MIN = 60000;
// Values from the sandbox carry its own prototypes: compare them as data.
const plain = (o) => JSON.parse(JSON.stringify(o));

function fakeStorage(quota) {
  const m = new Map();
  return {
    m,
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] || null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      const size = [...m.entries()].reduce((n, [a, b]) => n + a.length + b.length, 0) - (m.has(k) ? k.length + m.get(k).length : 0);
      if (quota && size + k.length + String(v).length > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); }
  };
}
// A board's browser: feed-router.js loaded into a fresh window.
function board(handler, opts) {
  opts = opts || {};
  let now = opts.now || Date.parse('2026-10-04T16:21:00Z');
  const calls = [];
  const events = [];
  const ls = opts.storage || fakeStorage(opts.quota);
  const DateX = class extends Date { static now() { return now; } };
  // The sandbox's global IS the window, as in a browser: the router's bare
  // names (adbPacedFetch, fetch) and its window.* writes are the same thing.
  const ctx = {
    localStorage: ls, console: { log() {}, warn() {}, error() {} }, Date: DateX, JSON, Math, Object, Array, String, Number, Error, Promise, URL, isNaN, parseInt, parseFloat,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    dispatchEvent(e) { events.push(e); },
    setTimeout: (fn) => { fn(); return 0; },
    AP: {},
    fetch: async (url, init) => {
      const u = String(url);
      calls.push(u);
      return handler(u, init, now);
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ROUTER + '\n;window.adbFetch = adbFetch; window.fidsFeedStatus = fidsFeedStatus;', ctx);
  const win = ctx;
  return { win, ctx, calls, events, ls, tick(ms) { now += ms; }, get now() { return now; } };
}
const json = (o, status, headers) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });
function pearsonRows(now) {
  return [0, 1, 2].map((i) => ({ id: 'ACA' + (100 + i), id2: 'AC' + (100 + i), type: 'DEP',
    schTime: new Date(now + i * 20 * MIN).toISOString(), gate: 'D2' + i, status: 'ONT', term: 'T1', al: 'Air Canada', alCode: 'ACA',
    routes: [{ code: 'YUL', name: 'Montréal', city: 'Montréal' }] }));
}

test('a blocked feed is never an empty list: Toronto stops at its own route and says "unavailable"', async () => {
  const B = board((u) => json({ error: 'blocked', state: 'blocked', airport: 'YYZ' }, 503, { 'X-Feed-State': 'blocked' }));
  const out = await B.win.adbFetch('YYZ', 'Departure');
  assert.deepEqual(plain(out), { departures: [] });
  assert.equal(B.win.fidsFeedStatus('YYZ', 'dep').state, 'unavailable');
  assert.deepEqual(plain(B.calls), [PROXY + '/flights/yyz?direction=dep'],
    "no fall-through to the window URL, whose empty 200 drew NO FLIGHTS IN WINDOW under LIVE");
  assert.ok(B.events.some((e) => e.type === 'fids-feed-status' && e.detail.state === 'unavailable'));
});

test('the board keeps its own last good list for 180 minutes and says when it is from', async () => {
  let mood = 'ok';
  const B = board((u, i, now) => mood === 'ok' ? json({ list: pearsonRows(now), _feed: { state: 'live', asOf: new Date(now).toISOString() } })
    : json({ error: 'blocked' }, 503));
  const t0 = B.now;
  const good = await B.win.adbFetch('YYZ', 'Departure');
  assert.equal(good.departures.length, 3);
  assert.equal(B.win.fidsFeedStatus('YYZ', 'dep').state, 'live');
  assert.ok(B.ls.getItem('fids_feed_lastgood_YYZ_dep'), 'saved for a screen that reboots into the block');

  mood = 'blocked';
  B.tick(40 * MIN);
  const kept = await B.win.adbFetch('YYZ', 'Departure');
  assert.equal(kept.departures.length, 3, 'the last good rows, not nothing');
  const st = B.win.fidsFeedStatus('YYZ', 'dep');
  assert.equal(st.state, 'stale');
  assert.equal(st.asOf, t0, 'dated from when the list was good');

  B.tick(141 * MIN);   // 181 minutes after the good list
  delete B.win._feedLgMem['fids_feed_lastgood_YYZ_dep'];
  const gone = await B.win.adbFetch('YYZ', 'Departure');
  assert.deepEqual(plain(gone), { departures: [] });
  assert.equal(B.win.fidsFeedStatus('YYZ', 'dep').state, 'unavailable', 'older than 180 minutes is not shown');
});

test("the worker's own last good copy is shown as stale, with the worker's time", async () => {
  const asOf = Date.parse('2026-10-04T16:15:00Z');
  const B = board((u, i, now) => json({ list: pearsonRows(now), _feed: { state: 'stale', failure: 'blocked', asOf: new Date(asOf).toISOString() } },
    200, { 'X-Feed-State': 'stale' }));
  const out = await B.win.adbFetch('YYZ', 'Departure');
  assert.equal(out.departures.length, 3);
  assert.deepEqual(plain(B.win.fidsFeedStatus('YYZ', 'dep')), { state: 'stale', asOf, why: null, at: B.now });
});

test('a valid empty answer is live and empty, not "unavailable"', async () => {
  const B = board((u, i, now) => json({ list: [], _feed: { state: 'live', asOf: new Date(now).toISOString() } }));
  assert.deepEqual(plain(await B.win.adbFetch('YYZ', 'Arrival')), { arrivals: [] });
  assert.equal(B.win.fidsFeedStatus('YYZ', 'arr').state, 'live');
});

test('a registry airport: the worker\'s 503 is an answer — asked once, not three times — and the last good list shows', async () => {
  let mood = 'ok';
  const B = board((u, i, now) => {
    if (!u.startsWith(PROXY + '/flights/airports/iata/ORD/')) throw new Error('unexpected ' + u);
    if (mood === 'ok') return json({ departures: [{ number: 'UA1', departure: { scheduledTime: { utc: '2026-10-04 17:00Z' } } }], _feed: { state: 'live' } });
    return json({ error: 'error', state: 'error' }, 503, { 'X-Feed-State': 'error' });
  });
  const good = await B.win.adbFetch('ORD', 'Departure');
  assert.equal(good.departures.length, 1);
  mood = 'down';
  B.calls.length = 0;
  B.tick(10 * MIN);
  const kept = await B.win.adbFetch('ORD', 'Departure');
  assert.equal(B.calls.length, 1, 'the first window\'s 503 ends the fetch: no retries, no second window');
  assert.equal(kept.departures.length, 1);
  assert.equal(B.win.fidsFeedStatus('ORD', 'dep').state, 'stale');
});

test('both directions: live, stale (with the oldest time) or unavailable', async () => {
  const B = board(() => json({ error: 'blocked' }, 503));
  const S = B.win.__fidsFeedStatus;
  S.YOW = { dep: { state: 'live' }, arr: { state: 'live' } };
  assert.equal(B.win.fidsFeedStatus('YOW').state, 'live');
  S.YOW = { dep: { state: 'stale', asOf: 5 }, arr: { state: 'stale', asOf: 3 } };
  assert.deepEqual(plain(B.win.fidsFeedStatus('YOW')), { state: 'stale', asOf: 3, partial: false });
  S.YOW = { dep: { state: 'unavailable' }, arr: { state: 'unavailable' } };
  assert.equal(B.win.fidsFeedStatus('YOW').state, 'unavailable');
  assert.equal(B.win.fidsFeedStatus('ZZZ').state, 'live', 'an airport never asked about says nothing');
});

test('the copies stay small: six at most, and a full storage gives up quietly', async () => {
  const B = board((u, i, now) => json({ list: pearsonRows(now) }));
  for (const [ap, ok] of [['YYZ', 1], ['YUL', 1], ['YHU', 1], ['YTZ', 1]]) {
    void ok;
    await B.win.adbFetch(ap, 'Departure');
    await B.win.adbFetch(ap, 'Arrival');
    B.tick(1000);
  }
  const keys = [...B.ls.m.keys()].filter((k) => k.startsWith('fids_feed_lastgood_') && k !== 'fids_feed_lastgood_index');
  assert.equal(keys.length, 6, 'the oldest two dropped');
  assert.ok(!keys.includes('fids_feed_lastgood_YYZ_dep'), 'oldest first');
  // A storage with no room: the fetch still answers, nothing throws.
  const tiny = board((u, i, now) => json({ list: pearsonRows(now) }), { quota: 50 });
  const out = await tiny.win.adbFetch('YYZ', 'Departure');
  assert.equal(out.departures.length, 3);
  assert.equal(tiny.win.fidsFeedStatus('YYZ', 'dep').state, 'live');
});

test('Moncton and Orlando keep their own last-good chains, and report into the status', () => {
  assert.match(ROUTER, /_feedCallNote\['YQM\|' \+ _yqmDir\] = \{ state: 'stale-local', asOf: ls\.ts \};/);
  assert.match(ROUTER, /_feedCallNote\['MCO\|' \+ dir\] = \{ state: 'stale-local', asOf: _ls\.ts \};/);
  assert.match(ROUTER, /_feedCallNote\['MCO\|' \+ dir\] = \{ state: 'unavailable-local', asOf: null \};/);
  assert.match(ROUTER, /var FEED_OWN_LASTGOOD = \{ YQM: 1, MCO: 1 \};/, 'not copied a second time');
  // Moncton's three tries and 1.2 s spacing are untouched.
  assert.match(ROUTER, /for \(let attempt = 1; attempt <= 3; attempt\+\+\) \{/);
});

// ── the words ────────────────────────────────────────────────────────────────
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
function gateLbl() {
  const at = CORE.indexOf('var _GATE_LBL = {');
  const end = CORE.indexOf('\n};', at);
  return vm.runInNewContext('(' + CORE.slice(at + 'var _GATE_LBL = '.length, end + 2) + ')');
}
// The words live in the one store (board-strings.js); _GATE_LBL is frozen.
const BS_SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'board-strings.js'), 'utf8');
const STORE = require(path.join(ROOT, 'fids-current', 'js', 'board-strings.js'));
test('every new passenger word is in all nine languages, none of them English left behind', () => {
  const T = STORE.STR;
  const frozen = gateLbl();
  for (const key of ['feedUnavailable', 'feedStale', 'feedLastUpdate']) {
    assert.ok(!(key in frozen), key + ' is in the store, not in the frozen _GATE_LBL');
    const e = T[key];
    assert.ok(e, key);
    for (const l of LANGS) assert.ok(typeof e[l] === 'string' && e[l].trim(), `${key}.${l}`);
    for (const l of LANGS.slice(1)) assert.notEqual(e[l], e.en, `${key}.${l} is not the English`);
    if (key !== 'feedUnavailable') for (const l of LANGS) assert.ok(e[l].includes('{TIME}'), `${key}.${l} carries the time`);
  }
  assert.equal(T.feedStale.en, 'Live data unavailable · last update {TIME}');
  assert.equal(T.feedStale.fr, 'Données en direct indisponibles · dernière mise à jour {TIME}');
  assert.match(T.feedUnavailable.ja, /[぀-ヿ一-鿿]/);
  assert.match(T.feedUnavailable.zh, /[一-鿿]/);
  assert.match(T.feedUnavailable.ar, /[؀-ۿ]/);
});

test('the pair: the board\'s two languages on one line, French first in Québec, each time in its own clock, Arabic right to left', () => {
  const fnOf = (name) => { const at = CORE.indexOf('function ' + name + '('); return CORE.slice(at, CORE.indexOf('\n}\n', at) + 2); };
  const src = ['fidsEscHtml', 'frFirstAirport', '_fidsClockForLang', '_gateLbl', '_fidsFeedPairHtml'].map(fnOf).join('\n');
  const run = (ap, langs) => {
    const ctx = { _GATE_LBL: {}, AP: { YYZ: { tz: 'America/Toronto' }, YUL: { tz: 'America/Toronto' }, DXB: { tz: 'Asia/Dubai' } }, langs,
      document: { getElementById: () => ({ value: ap }) } };
    vm.createContext(ctx);
    vm.runInContext(BS_SRC, ctx);
    vm.runInContext(src, ctx);
    return vm.runInContext('_fidsFeedPairHtml("feedStale", Date.parse("2026-10-04T16:20:00Z"))', ctx);
  };
  const yyz = run('YYZ', ['en', 'fr']);
  assert.match(yyz, /^<span class="ffn-half" lang="en">Live data unavailable · last update 12:20pm<\/span><span class="bs-sep" aria-hidden="true">\|<\/span><span class="ffn-half" lang="fr" data-i18n-src="careful">Données en direct indisponibles · dernière mise à jour 12:20<\/span>$/,
    'the store\'s words, each half marked with its language, each time in its own clock');
  const yul = run('YUL', ['en', 'fr']);
  assert.ok(yul.indexOf('lang="fr"') < yul.indexOf('lang="en"'), 'French first in Québec');
  const dxb = run('DXB', ['en', 'ar']);
  assert.match(dxb, /lang="ar" dir="rtl"[^>]*>البيانات المباشرة غير متاحة · آخر تحديث 20:20</, 'Arabic reads the 24-hour clock, right to left');
});

test('the board: the empty panel says it before "no flights", the strip sits above the ticker, and nothing is loud', () => {
  const st = CORE.slice(CORE.indexOf('function setState(which, show)'), CORE.indexOf("// v23430 — A DEAD BOARD SENDS ITSELF TO THE TOUR."));
  assert.ok(st.indexOf('_fidsFeedDownPanel(el, ap)') > 0 && st.indexOf('_fidsFeedDownPanel(el, ap)') < st.indexOf("BoardStrings.pair('noFlightsWindow'"),
    'a feed that is down is asked about first');
  const panel = CORE.slice(CORE.indexOf('function _fidsFeedDownPanel('), CORE.indexOf('\n}\n', CORE.indexOf('function _fidsFeedDownPanel(')));
  // v23998 — through the same test as the gate and the belt: a live board
  // with a feed, its feed unavailable or stale.
  assert.match(panel, /var fd = _fidsFeedDownFor\(ap, /);
  const downFor = CORE.slice(CORE.indexOf('function _fidsFeedDownFor('), CORE.indexOf('\n}\n', CORE.indexOf('function _fidsFeedDownFor(')));
  assert.match(downFor, /if \(!code \|\| !LIVE_MODE \|\| !_fidsAirportHasFeed\(code\)\) return null;/);
  assert.match(downFor, /fd\.state === 'unavailable' \|\| fd\.state === 'stale'/);
  assert.match(panel, /_fidsFeedPairHtml\('feedUnavailable'\)/);
  const avail = CORE.slice(CORE.indexOf('function _fidsRowsAvail('), CORE.indexOf('\n}\n', CORE.indexOf('function _fidsRowsAvail(')));
  assert.match(avail, /getElementById\('fidsFeedNotice'\)/, 'rows stop above the strip');
  const notice = CORE.slice(CORE.indexOf('function _fidsFeedNoticeUpdate('), CORE.indexOf('\n}\n', CORE.indexOf('function _fidsFeedNoticeUpdate(')));
  assert.match(notice, /tk\.parentNode\.insertBefore\(bar, tk\)/, 'above the ticker');
  assert.match(notice, /var onBoard = \(sType === 'main'\);/, 'the departures/arrivals board…');
  assert.match(notice, /var dedicated = \(sType === 'gate' \|\| sType === 'baggage'\);/, '…and the gate and baggage screens');
  // No LIVE stamp unless the feed is live.
  const stamp = CORE.slice(CORE.indexOf('function _fidsFeedStamp('), CORE.indexOf('\n}\n', CORE.indexOf('function _fidsFeedStamp(')));
  assert.match(stamp, /var live = !st \|\| st\.state === 'live';/);
  assert.match(stamp, /if \(live\) \{[\s\S]*?return;\n    \}/);
  assert.match(stamp, /if \(pill\) pill\.style\.visibility = live \? '' : 'hidden';/, 'the stamp is hidden while the feed is not live');
  // Calm: the block never animates, and every colour in it is a grey.
  const at = CSS.indexOf("v23996 — WHEN THE AIRPORT'S FEED IS DOWN");
  // The block runs to the next numbered block's banner.
  const next = CSS.slice(at + 10).search(/\/\* *[═━]*\s*v2\d{4} /);
  const block = CSS.slice(CSS.lastIndexOf('/*', at), next > 0 ? at + 10 + next : undefined);
  assert.ok(block.includes('#fidsFeedNotice') && block.includes('.ffn-box'), 'the whole block');
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(animation|transition): none !important;/g, ''), /animation|transition|@keyframes/);
  const cols = [];
  for (const m of block.matchAll(/#([0-9a-f]{6})\b/gi)) cols.push([0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));
  for (const m of block.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) cols.push([+m[1], +m[2], +m[3]]);
  assert.ok(cols.length >= 5);
  for (const c of cols) assert.ok(Math.max(...c) - Math.min(...c) <= 40, 'not a grey: ' + c.join(','));
});

// ── the dock readers: docked ∪ auto, and nobody writes auto ─────────────────
test('the boards treat the admin\'s list plus the automatic one as docked', () => {
  const at = CORE.indexOf('function fidsDryDock()');
  const fn = CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
  const run = (cache) => plain(vm.runInNewContext(fn + '; fidsDryDock()', { _dryDockCache: cache }));
  assert.deepEqual(run(null), []);
  assert.deepEqual(run({ docked: ['SYD'] }), ['SYD']);
  assert.deepEqual(run({ docked: ['SYD'], auto: ['YYZ', 'SYD'] }), ['SYD', 'YYZ']);
  assert.deepEqual(run({ docked: [], auto: ['yyz'] }), ['YYZ']);
});

test('the menu shows the automatic dock and never saves it', () => {
  assert.match(MENU, /auto-docked' \+ \(since \? ' since ' \+ since : ''\) \+ ' — feed blocked/, '"auto-docked since 12:20 — feed blocked"');
  for (const fn of ['_ddSave', 'ddDock', 'ddUndock']) {
    const at = MENU.indexOf('function ' + fn + '(');
    const body = MENU.slice(at, MENU.indexOf('\n}\n', at));
    assert.ok(at > 0, fn);
    assert.doesNotMatch(body, /_ddAuto|_ddWatch|\.auto\b/, fn + ' builds its save from the manual list alone');
  }
  assert.match(MENU, /_ddDocked = doc\.docked\.slice\(\);\n\s*_ddAuto = Array\.isArray\(doc\.auto\)/);
});

test('the rotator caches docked ∪ auto and still never touches the running list', () => {
  const at = ROTATE.indexOf('function checkDock');
  const body = ROTATE.slice(at, ROTATE.indexOf('\n      }', at));
  assert.match(body, /Array\.isArray\(doc\.auto\) \? doc\.auto : \[\]/);
  assert.match(body, /var next = JSON\.stringify\(\{ docked: _all \}\);/, 'one cached list, read unchanged by the selection block');
  assert.match(body, /return _all\.indexOf\(c\) !== -1;/);
  assert.match(body, /reloadPending = true/);
  assert.doesNotMatch(body, /\baps\b/);
});

// ── what the first review of this branch found ──────────────────────────────
test('a list younger than five minutes is not "old data": the strip waits until it is', async () => {
  const B = board(() => json({ error: 'blocked' }, 503));
  const S = B.win.__fidsFeedStatus;
  S.YYZ = { dep: { state: 'stale', asOf: B.now - 4 * MIN }, arr: { state: 'stale', asOf: B.now - 4 * MIN } };
  assert.equal(B.win.fidsFeedStatus('YYZ', 'dep').state, 'live', 'four minutes old reads as live (the worker serves its shared copy as live this long)');
  assert.equal(B.win.fidsFeedStatus('YYZ').state, 'live');
  B.tick(MIN + 1);
  assert.equal(B.win.fidsFeedStatus('YYZ', 'dep').state, 'stale', 'past five minutes it says how old');
  assert.equal(B.win.fidsFeedStatus('YYZ').state, 'stale');
  S.YYZ = { dep: { state: 'stale', asOf: null } };
  assert.equal(B.win.fidsFeedStatus('YYZ', 'dep').state, 'stale', 'a list of unknown age is never passed off as live');
});

test('Moncton: refusals are tried three times as before, only the last try asks for the worker\'s copy, and the screen\'s own newer list wins', async () => {
  const MON = (now) => [{ flightId: 'PD2373', localTimestamp: Math.floor(now / 1000) + 3600 - 3 * 3600, scheduledTime: '5:00 PM', status: 'On Time', city: 'Toronto' }];
  let mood = 'ok', workerAsOf = 0;
  const B = board((u, i, now) => {
    if (!u.startsWith(PROXY + '/yqm/')) return new Response('{}', { status: 404 });
    if (mood === 'ok') return json(MON(now), 200, { 'X-Feed-State': 'live' });
    if (/lastgood=1/.test(u) && workerAsOf) return json(MON(now), 200, { 'X-Feed-State': 'stale', 'X-Feed-As-Of': new Date(workerAsOf).toISOString() });
    return json({ error: 'blocked', state: 'blocked', airport: 'YQM', detail: 'yqm-upstream-unavailable' }, 503, { 'X-Feed-State': 'blocked' });
  });
  B.ctx.AP.YQM = { tz: 'America/Moncton' };
  const good = await B.win.adbFetch('YQM', 'Departure');
  assert.equal(good.departures.length, 1);
  const own = B.now;
  // Refused: three tries, the last asking for the copy; the copy is older than this screen's own list.
  mood = 'down'; workerAsOf = own - 4 * MIN; B.calls.length = 0; B.tick(30000);
  const kept = await B.win.adbFetch('YQM', 'Departure');
  const yqmCalls = B.calls.filter((c) => c.includes('/yqm/'));
  assert.deepEqual(plain(yqmCalls), [PROXY + '/yqm/flights/departures', PROXY + '/yqm/flights/departures', PROXY + '/yqm/flights/departures?lastgood=1']);
  assert.equal(kept.departures.length, 1);
  const raw = B.win.__fidsFeedStatus.YQM.dep;
  assert.equal(raw.state, 'stale');
  assert.equal(raw.asOf, own, "the screen's own list, which is newer than the worker's copy");
  assert.equal(B.win.fidsFeedStatus('YQM', 'dep').state, 'live', 'thirty seconds old: no strip for a refusal');
  // A screen with nothing of its own takes the worker's copy, dated from then.
  const cold = board((u, i, now) => /lastgood=1/.test(u)
    ? json(MON(now), 200, { 'X-Feed-State': 'stale', 'X-Feed-As-Of': new Date(now - 20 * MIN).toISOString() })
    : json({ error: 'blocked', state: 'blocked', airport: 'YQM', detail: 'yqm-upstream-unavailable' }, 503, { 'X-Feed-State': 'blocked' }));
  cold.ctx.AP.YQM = { tz: 'America/Moncton' };
  const c1 = await cold.win.adbFetch('YQM', 'Departure');
  assert.equal(c1.departures.length, 1);
  assert.equal(cold.win.fidsFeedStatus('YQM', 'dep').state, 'stale');
  assert.equal(cold.win.fidsFeedStatus('YQM', 'dep').asOf, cold.now - 20 * MIN);
});

test('Moncton: three refusals and no list anywhere — an empty second source says "unavailable", rows from it are live', async () => {
  // The webhook cache answers Moncton's window URL. Rows from it are Moncton's
  // own (live); nothing from it, after cyqm.ca refused all three tries and no
  // list is left anywhere, is not a quiet hour.
  let second = [];
  const B = board((u, i, now) => {
    if (u.startsWith(PROXY + '/yqm/')) {
      return json({ error: 'blocked', state: 'blocked', airport: 'YQM', detail: 'yqm-upstream-unavailable' }, 503, { 'X-Feed-State': 'blocked' });
    }
    if (u.startsWith(PROXY + '/flights/airports/iata/YQM/')) return json({ departures: second });
    if (u.startsWith(PROXY + '/flights/cached/')) return json({ flights: [] });
    throw new Error('unexpected ' + u);
  });
  B.ctx.AP.YQM = { tz: 'America/Moncton' };
  const out = await B.win.adbFetch('YQM', 'Departure');
  assert.deepEqual(plain(out), { departures: [] });
  assert.equal(B.win.fidsFeedStatus('YQM', 'dep').state, 'unavailable', 'not NO FLIGHTS IN WINDOW');
  assert.equal(B.calls.filter((c) => c.includes('/yqm/')).length, 3, 'the three tries ran first');
  second = [{ number: 'PD 2373', airline: { name: 'Porter', iata: 'PD' }, departure: { scheduledTime: { utc: new Date(B.now + 3600000).toISOString().replace('T', ' ').slice(0, 16) + 'Z' } }, arrival: { airport: { iata: 'YYZ' } } }];
  B.tick(5 * MIN);
  const out2 = await B.win.adbFetch('YQM', 'Departure');
  assert.ok(out2.departures.length >= 1, 'the second source\'s rows are shown');
  assert.equal(B.win.fidsFeedStatus('YQM', 'dep').state, 'live', 'and they are live');
});

test("Moncton: a list from the second source is this screen's last good list too — the next failure keeps it, with its time", async () => {
  // cyqm.ca refused and the webhook cache answered: those rows are on screen.
  // Moncton's own chain only keeps cyqm.ca's lists, so without a copy here
  // the next poll that failed everywhere emptied the board.
  let mood = 'second';
  const second = (now) => [{ number: 'PD 2373', airline: { name: 'Porter', iata: 'PD' }, departure: { scheduledTime: { utc: new Date(now + 3600000).toISOString().replace('T', ' ').slice(0, 16) + 'Z' } }, arrival: { airport: { iata: 'YYZ' } } }];
  const B = board((u, i, now) => {
    if (u.startsWith(PROXY + '/yqm/')) {
      return json({ error: 'blocked', state: 'blocked', airport: 'YQM', detail: 'yqm-upstream-unavailable' }, 503, { 'X-Feed-State': 'blocked' });
    }
    if (u.startsWith(PROXY + '/flights/airports/iata/YQM/')) return mood === 'second' ? json({ departures: second(now) }) : json({ error: 'error', state: 'error', airport: 'YQM' }, 503, { 'X-Feed-State': 'error' });
    if (u.startsWith(PROXY + '/flights/cached/')) return json({ flights: [] });
    throw new Error('unexpected ' + u);
  });
  B.ctx.AP.YQM = { tz: 'America/Moncton' };
  const t0 = B.now;
  const good = await B.win.adbFetch('YQM', 'Departure');
  assert.ok(good.departures.length >= 1);
  assert.equal(B.win.fidsFeedStatus('YQM', 'dep').state, 'live');
  mood = 'down';
  B.tick(20 * MIN);
  const kept = await B.win.adbFetch('YQM', 'Departure');
  assert.equal(kept.departures.length, good.departures.length, 'the rows on screen stay');
  const st = B.win.fidsFeedStatus('YQM', 'dep');
  assert.equal(st.state, 'stale', 'and the board says how old they are');
  assert.equal(st.asOf, t0, 'dated from when the second source answered');
  assert.equal(B.ls.getItem('fids_feed_lastgood_YQM_dep'), null, 'Moncton stores its own copies: this one stays in memory');
});

test('a board talking to the worker as it is deployed today (before feed protection) reads its answers as it always did', async () => {
  // The board (fids) and the proxy (fids-proxy) deploy separately, and a
  // screen can hold a cached board for hours: the new board must read the old
  // worker. Moncton's answer, as the live worker sent it (2026-10-05): a bare
  // array, X-Feed-Source and X-Feed-Remembered, no X-Feed-State, no _feed.
  const at = (now, h) => Math.floor(now / 1000) + h * 3600;
  const cyqm = (now) => [
    { flightId: 'AC659', flightNumber: '659', airlineName: 'Air Canada', airlineCode: 'AC', airportCity: 'Montreal', airportCode: 'YUL',
      localTimestamp: at(now, 1), displayDate: 'Oct 5', scheduledTime: '1:20 PM', terminal: '', gate: '2', status: 'On Time', actualTime: '' },
    { flightId: 'PD2374', flightNumber: '2374', airlineName: 'Porter', airlineCode: 'PD', airportCity: 'Toronto', airportCode: 'YYZ',
      localTimestamp: at(now, 3), displayDate: 'Oct 5', scheduledTime: '3:40 PM', terminal: '', gate: '4', status: 'On Time', actualTime: '' }];
  const OLD = { 'Content-Type': 'application/json', 'X-Feed-Source': 'yqm-cyqm-proxy', 'X-Feed-Remembered': '0' };
  let mood = 'ok';
  const B = board((u, i, now) => {
    if (u.startsWith(PROXY + '/yqm/')) {
      return mood === 'ok' ? new Response(JSON.stringify(cyqm(now)), { status: 200, headers: OLD })
        // the old worker's refusal: a 503 with its own error word, no X-Feed-State
        : new Response(JSON.stringify({ error: 'yqm-upstream-unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.startsWith(PROXY + '/flights/airports/iata/YQM/')) return new Response(JSON.stringify({ error: 'adb-disconnected' }), { status: 503, headers: { 'Content-Type': 'application/json', 'X-Feed-Source': 'adb-disconnected' } });
    if (u.startsWith(PROXY + '/flights/cached/')) return json({ flights: [] });
    if (u.startsWith(PROXY + '/flights/yyz')) return json({ list: pearsonRows(now) });
    throw new Error('unexpected ' + u);
  });
  B.ctx.AP.YQM = { tz: 'America/Moncton' };
  const t0 = B.now;
  const out = await B.win.adbFetch('YQM', 'Departure');
  assert.equal(out.departures.length, 2, "Moncton's rows");
  assert.equal(B.win.fidsFeedStatus('YQM', 'dep').state, 'live', 'an answer with no X-Feed-State is live');
  assert.equal(B.calls.filter((c) => c.includes('/yqm/')).length, 1, 'asked once');
  const yyz = await B.win.adbFetch('YYZ', 'Departure');
  assert.equal(yyz.departures.length, 3);
  assert.equal(B.win.fidsFeedStatus('YYZ', 'dep').state, 'live', '{ list } with no _feed is live');
  // The old worker refuses: Moncton's own list is kept and said to be from then.
  mood = 'down'; B.calls.length = 0; B.tick(40 * MIN);
  const kept = await B.win.adbFetch('YQM', 'Departure');
  assert.equal(kept.departures.length, 2, 'the last good list, not nothing');
  assert.equal(B.win.fidsFeedStatus('YQM', 'dep').state, 'stale');
  assert.equal(B.win.fidsFeedStatus('YQM', 'dep').asOf, t0);
  assert.deepEqual(plain(B.calls.filter((c) => c.includes('/yqm/'))), [PROXY + '/yqm/flights/departures', PROXY + '/yqm/flights/departures', PROXY + '/yqm/flights/departures?lastgood=1'],
    'three tries as before; the old worker ignores ?lastgood=1 and answers as it always has');
});

test('the stored copies keep to a budget: too big is not stored, the oldest go first, and a live list is stored at most every three minutes', async () => {
  // Registry airports: the window answers ADB-shaped rows, which the board keeps as they are.
  const pad = 'x'.repeat(560);
  const rowsOf = (n, now) => Array.from({ length: n }, (_, i) => ({ number: 'UA' + i, airline: { name: 'United Airlines', iata: 'UA' },
    departure: { scheduledTime: { utc: new Date(now + i * MIN).toISOString() }, gate: 'B' + i }, arrival: { airport: { iata: 'YUL', name: 'Montréal' } }, note: pad }));
  let n = 3;
  const B = board((u, i, now) => json({ departures: rowsOf(n, now), _feed: { state: 'live' } }));
  const stored = () => [...B.ls.m.keys()].filter((k) => k.startsWith('fids_feed_lastgood_') && k !== 'fids_feed_lastgood_index');
  const total = () => stored().reduce((t, k) => t + B.ls.getItem(k).length, 0);
  await B.win.adbFetch('ORD', 'Departure');
  const first = B.ls.getItem('fids_feed_lastgood_ORD_dep');
  assert.ok(first);
  B.tick(MIN);
  await B.win.adbFetch('ORD', 'Departure');
  assert.equal(B.ls.getItem('fids_feed_lastgood_ORD_dep'), first, 'a minute later: memory only, storage untouched');
  B.tick(3 * MIN);
  await B.win.adbFetch('ORD', 'Departure');
  assert.notEqual(B.ls.getItem('fids_feed_lastgood_ORD_dep'), first, 'three minutes on: stored again');
  // Big airports: each copy fits on its own, two do not fit together.
  n = 1100;
  for (const ap of ['DEN', 'SFO']) { await B.win.adbFetch(ap, 'Departure'); B.tick(1000); }
  const one = B.ls.getItem('fids_feed_lastgood_SFO_dep').length;
  assert.ok(one > 600000 && one < 900000, 'a copy of ' + one + ' characters');
  assert.ok(!stored().includes('fids_feed_lastgood_DEN_dep'), 'the older big copy went to make room');
  assert.ok(stored().includes('fids_feed_lastgood_ORD_dep'), 'a small one that still fits stays');
  assert.ok(total() <= 1200000, 'all copies together within the budget: ' + total());
  // Too big for any copy: not stored, and the older stored copy of it is not left behind.
  n = 1800; B.tick(4 * MIN);
  const out = await B.win.adbFetch('SFO', 'Departure');
  assert.equal(out.departures.length, 1800, 'the board still has the whole list');
  assert.ok(!stored().includes('fids_feed_lastgood_SFO_dep'));
  assert.ok(B.win._feedLgMem.fids_feed_lastgood_SFO_dep, 'kept in memory');
});

// _fidsFeedNoticeUpdate in a small DOM: where the strip goes on each screen.
function noticeDom(sType, stDep, stArr, opts) {
  opts = opts || {};
  const at = CORE.indexOf('function _fidsFeedNoticeUpdate(');
  const fn = CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
  const mk = (tag, id) => {
    const el = { tagName: tag, id: id || '', style: {}, children: [], parentNode: null, _cls: new Set(), attrs: {},
      classList: { add: (c) => el._cls.add(c), remove: (c) => el._cls.delete(c), contains: (c) => el._cls.has(c),
        toggle: (c, on) => { if (on === undefined ? !el._cls.has(c) : on) el._cls.add(c); else el._cls.delete(c); return el._cls.has(c); } },
      setAttribute(k, v) { el.attrs[k] = v; },
      appendChild(c) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = el; el.children.push(c); return c; },
      insertBefore(c, ref) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = el; el.children.splice(el.children.indexOf(ref), 0, c); return c; },
      get nextSibling() { const p = el.parentNode; return p ? p.children[p.children.indexOf(el) + 1] || null : null; },
      getBoundingClientRect: () => ({ height: 46 }), offsetHeight: 46 };
    Object.defineProperty(el, 'className', { get: () => [...el._cls].join(' '), set: (v) => { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); } });
    return el;
  };
  const body = mk('BODY'), board = mk('DIV', 'fidsBoard'), ticker = mk('DIV'), panel = mk('DIV', 'panelEmpty'), apSel = { value: 'YYZ' };
  body.appendChild(board); board.appendChild(ticker);
  panel.style.display = 'none';
  const props = {};
  const ctx = {
    LIVE_MODE: true, screenType: sType, mode: 'dep', AP: { YYZ: { tz: 'America/Toronto' } }, window: { innerWidth: opts.vw || 1680, innerHeight: opts.vh || 1050 }, Event: class { constructor(t) { this.type = t; } },
    document: {
      body, documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } },
      getElementById: (id) => ({ apSel, panelEmpty: panel })[id] || (function find(n) { if (n.id === id) return n; for (const c of n.children) { const f = find(c); if (f) return f; } return null; })(body),
      querySelector: (q) => (q === '.ticker' ? ticker
        : (opts.inView && q === (sType === 'baggage' ? '#baggageView .ffn-inview' : '#gateView .ffn-inview')) ? { getBoundingClientRect: () => opts.inView } : null),
      createElement: (t) => mk(t.toUpperCase())
    },
    _fidsFeedStatusFor: (ap, dir) => (dir === 'arr' ? stArr : dir === 'dep' ? stDep : stDep),
    _fidsFeedPairHtml: (key, asOf) => key + (asOf ? '@' + asOf : ''),
    _fidsFeedStamp() {}
  };
  ctx.window.dispatchEvent = () => {};
  ctx.dispatchEvent = () => {};
  vm.runInNewContext(fn + '; _fidsFeedNoticeUpdate();', ctx);
  const bar = ctx.document.getElementById('fidsFeedNotice');
  return { bar, body, board, ticker, props };
}
test('the strip: above the ticker on the board; on the gate and belt screens fixed to the bottom, with the view giving up its height', () => {
  const stale = { state: 'stale', asOf: 1000 }, live = { state: 'live' }, none = { state: 'unavailable', asOf: null };
  const main = noticeDom('main', stale, live);
  assert.equal(main.bar.parentNode, main.board);
  assert.equal(main.bar.nextSibling, main.ticker, 'above the ticker');
  assert.ok(!main.bar.classList.contains('fids-feed-notice--fixed'));
  assert.ok(!main.body.classList.contains('fids-feed-notice-fixed-on'));
  assert.equal(main.bar.innerHTML, 'feedStale@1000');
  const gate = noticeDom('gate', stale, live);
  assert.equal(gate.bar.parentNode, gate.body, 'outside the gate view, which is rebuilt on every render');
  assert.ok(gate.bar.classList.contains('fids-feed-notice--fixed'));
  assert.ok(gate.body.classList.contains('fids-feed-notice-fixed-on'), 'the view gives up the strip\'s height');
  assert.equal(gate.props['--ffn-h'], '46px');
  assert.equal(gate.bar.innerHTML, 'feedStale@1000', 'the gate reads the departures feed');
  const belt = noticeDom('baggage', live, stale);
  assert.equal(belt.bar.innerHTML, 'feedStale@1000', 'the belt reads the arrivals feed');
  const beltNone = noticeDom('baggage', live, none);
  assert.equal(beltNone.bar.innerHTML, 'feedUnavailable', 'with nothing at all, the belt says so (it has no empty panel to)');
  assert.equal(noticeDom('main', none, live).bar, null, 'the board leaves "nothing" to its empty panel');
  const quiet = noticeDom('gate', live, live);
  assert.equal(quiet.bar, null);
  assert.ok(!quiet.body.classList.contains('fids-feed-notice-fixed-on'));
  // The CSS that makes room, never covering the screen.
  assert.match(CSS, /html body\.fids-feed-notice-fixed-on #gateView,\nhtml body\.fids-feed-notice-fixed-on #baggageView \{\n  height: calc\(100vh - var\(--ffn-h, 46px\)\) !important;/);
  assert.match(CSS, /#fidsFeedNotice\.fids-feed-notice\.fids-feed-notice--fixed \{\n  position: fixed !important;/);
});

test('the toolbar stamp: hidden while the feed is down (never reworded), the time of the list in the store\'s words, and back the moment it is live', () => {
  const at = CORE.indexOf('function _fidsFeedStamp(');
  const fn = CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
  // The operator bar gains no words of its own: nothing in it but the store's.
  assert.doesNotMatch(fn.replace(/\/\/[^\n]*/g, ''), /'[A-Z][A-Z ]+'|i18n-ok/, 'no literal words, no pragmas');
  const el = (t) => ({ textContent: t, style: {} });
  const ll = el('LIVE'), lu = el('LIVE · 12:20'), mb = el('LIVE'), dot = el('');
  dot.style.background = '#10b981';
  const pill = { style: {} };
  ll.parentNode = pill;
  const ctx = { LIVE_MODE: true, langs: ['en', 'fr'], lang: 'en', document: {
    getElementById: (id) => ({ liveLabel: ll, lastUp: lu, modeBadge: mb })[id] || null,
    querySelector: (q) => (q === '.live-dot' ? dot : null) } };
  vm.createContext(ctx);
  vm.runInContext(BS_SRC, ctx);
  vm.runInContext(fn, ctx);
  ctx._fidsFeedStamp({ state: 'unavailable', asOf: null }, 'America/Toronto');
  assert.equal(pill.style.visibility, 'hidden', 'no LIVE stamp');
  assert.equal(mb.style.visibility, 'hidden');
  assert.equal(ll.textContent, 'LIVE', 'hidden, not reworded');
  assert.equal(lu.textContent, 'Live data unavailable');
  ctx._fidsFeedStamp({ state: 'stale', asOf: Date.parse('2026-10-04T16:20:00Z') }, 'America/Toronto');
  assert.equal(lu.textContent, 'Last update 12:20 PM', 'the board\'s own clock (BoardStrings.boardTime)');
  assert.equal(dot.style.background, '#9ca3af');
  // fetchLive() sets the label only before it asks: a board that recovered
  // must not stay hidden until the next poll.
  ctx._fidsFeedStamp({ state: 'live', asOf: null }, 'America/Toronto');
  assert.equal(pill.style.visibility, '');
  assert.equal(mb.style.visibility, '');
  assert.equal(lu.textContent, 'LIVE · 12:20', 'what it said before');
  assert.equal(dot.style.background, '#10b981');
});

test('on a phone, one language alone wider than the screen wraps inside itself instead of running off both edges', () => {
  const at = CSS.indexOf('html body #fidsFeedNotice .ffn-half,\nhtml body #panelEmpty.fids-feed-down .ffn-half {\n  white-space: nowrap;');
  assert.ok(at > 0, 'each half is whole on its line on a screen wide enough');
  const after = CSS.slice(at, at + 800);
  assert.match(after, /@media \(max-width: 700px\) \{\n  html body #fidsFeedNotice \.ffn-half,\n  html body #panelEmpty\.fids-feed-down \.ffn-half \{\n    white-space: normal;/,
    'the phone rule comes after the nowrap rule it overrides');
});

test('the Login chip and the build tag sit above the fixed strip, never on its words', () => {
  // Both are position:fixed by an inline style (bottom 14px / 1px); only an
  // !important rule moves them, and only while the fixed strip is up.
  for (const page of ['gids.html', 'bids.html', 'fids.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'fids-current', page), 'utf8');
    assert.match(html, /id="ocAdminLogin"[\s\S]{0,200}style="position:fixed;left:14px;bottom:14px;/, page);
  }
  assert.match(CORE, /d\.style\.cssText = 'position:fixed;left:7px;bottom:1px;/);
  assert.match(CSS, /html body\.fids-feed-notice-fixed-on #ocAdminLogin \{\n  bottom: calc\(var\(--ffn-h, 46px\) \+ 14px\) !important;\n\}/);
  assert.match(CSS, /html body\.fids-feed-notice-fixed-on #fidsBuildTag \{\n  bottom: calc\(var\(--ffn-h, 46px\) \+ 1px\) !important;\n\}/);
});

test('a registry screen sent to the tour by a dock carries its id, and the tour sends it home once the airport is undocked', () => {
  const at = CORE.indexOf('function _fidsDockedSelfCheck()');
  const self = CORE.slice(at, CORE.indexOf('\n}\n', at));
  assert.match(self, /window\.location\.replace\('\/rotate\?tour=1&screen=' \+ encodeURIComponent\(_fidsScreenId\(\)\)\);/);
  // The tour keeps screen= for itself: a board in a frame never sees it.
  assert.match(ROTATE, /var _homeScreen = [^\n]*q\.get\('screen'\)\);\n\s*q\.delete\('screen'\);[\s\S]*?var childQ = q\.toString\(\);/);
  const h = ROTATE.indexOf('function checkHome()');
  const home = ROTATE.slice(h, ROTATE.indexOf('\n      }\n', h));
  assert.match(home, /if \(!_homeScreen \|\| window\.self !== window\.top\) return;/);
  assert.match(home, /dock\.docked\.concat\(Array\.isArray\(dock\.auto\) \? dock\.auto : \[\]\)/, 'docked means manual or automatic');
  assert.match(home, /if \(off\.indexOf\(ap\) !== -1\) return;/, 'still docked: it keeps touring');
  assert.match(home, /location\.replace\(u\);/);
  assert.match(home, /if \(doc\.claimed === false\) \{ location\.replace\('\/screen\.html'\); return; \}/);
  assert.doesNotMatch(home, /\baps\b/, 'a navigation, never a change to the running list');
  assert.match(ROTATE, /if \(_homeScreen\) setInterval\(checkHome, 60000\);/);
});

test('checkHome, run: back to the assigned board once undocked, nowhere while docked, and unreadable answers change nothing', async () => {
  const h = ROTATE.indexOf('function checkHome()');
  const src = ROTATE.slice(h, ROTATE.indexOf('\n      }\n', h) + 8);
  const run = async (screenDoc, dockDoc) => {
    const went = [];
    const ctx = {
      _homeScreen: 'ABC234', DOCK_URL: 'https://x/api/dry-dock', SCREENS_URL: 'https://x/api/screens/', Date, Promise, String, Array, encodeURIComponent, console: { log() {} },
      window: {}, location: { replace: (u) => went.push(u) },
      fetch: async (u) => ({ ok: true, json: async () => (String(u).includes('/screens/') ? screenDoc : dockDoc) })
    };
    ctx.window.self = ctx.window; ctx.window.top = ctx.window;
    vm.runInNewContext(src + '; checkHome();', ctx);
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    return went;
  };
  const scr = { claimed: true, airport: 'YYZ', board: 'gids', gate: 'E53' };
  assert.deepEqual(await run(scr, { docked: ['SYD'], auto: ['YYZ'] }), [], 'auto-docked: stays on the tour');
  assert.deepEqual(await run(scr, { docked: ['YYZ'], auto: [] }), [], 'docked by hand: stays too');
  assert.deepEqual(await run(scr, { docked: ['SYD'], auto: [] }), ['/gids.html?ap=YYZ&screen=ABC234&gate=E53'], 'undocked: home');
  assert.deepEqual(await run({ claimed: true, airport: 'YUL', board: 'fids' }, { docked: [], auto: ['YYZ'] }), ['/fids.html?ap=YUL&screen=ABC234'], 'reassigned meanwhile');
  assert.deepEqual(await run({ claimed: false, id: 'ABC234' }, { docked: [] }), ['/screen.html'], 'forgotten: the pairing page');
  assert.deepEqual(await run(scr, null), [], 'the dock unreadable: stay');
  assert.deepEqual(await run(scr, { error: 'x' }), [], 'a dock without a list: stay');
});

test('the rotator stores the dock even when storage is full, making room from the last-good copies, and never reloads onto an old list', () => {
  const at = ROTATE.indexOf('function checkDock');
  const body = ROTATE.slice(at, ROTATE.indexOf('\n      }', at));
  assert.match(body, /try \{ prev = localStorage\.getItem\('oc_dry_dock'\); \} catch \(e\) \{\}/);
  assert.match(body, /try \{ localStorage\.setItem\('oc_dry_dock', next\); _stored = true; \} catch \(eQ\) \{/);
  assert.match(body, /_k\.indexOf\('fids_feed_lastgood_'\) === 0\) localStorage\.removeItem\(_k\);/);
  assert.match(body, /if \(!_stored\) \{[^\n]*return; \}/);
});

// Orlando's list and its ADB enrichment both reach GOAA (api.goaa.aero), so a
// block there fails both. The enrichment's window answer must not decide what
// the board says about the list, and a copy the worker kept is dated from
// when the worker had it, not from when this screen received it.
function mcoRow(now) {
  return { number: 'B6 1', airline: { name: 'JetBlue', iata: 'B6' },
    departure: { scheduledTime: { utc: new Date(now + 3600e3).toISOString().replace('T', ' ').slice(0, 16) + 'Z', local: '' }, gate: 'A1' },
    arrival: { airport: { iata: 'JFK', name: 'New York' } }, status: 'Expected' };
}
test("Orlando: the worker's stale list stays stale when the enrichment's window answers 503", async () => {
  const asOf = Date.parse('2026-10-04T16:21:00Z') - 30 * MIN;
  const B = board((u, i, now) => /\/flights\/mco/.test(u)
    ? json({ departures: [mcoRow(now)], _feed: { state: 'stale', failure: 'blocked', asOf: new Date(asOf).toISOString() } }, 200, { 'X-Feed-State': 'stale' })
    : json({ error: 'blocked', state: 'blocked', airport: 'MCO' }, 503, { 'X-Feed-State': 'blocked' }));
  const out = await B.win.adbFetch('MCO', 'Departure');
  assert.equal(out.departures.length, 1);
  assert.deepEqual(plain(B.win.fidsFeedStatus('MCO', 'dep')), { state: 'stale', asOf, why: null, at: B.now }, 'not "live"');
});
test("Orlando: a copy the worker kept is dated from the worker's time, and is not shown past 3 hours", async () => {
  let mood = 'stale';
  const asOf = Date.parse('2026-10-04T16:21:00Z') - 150 * MIN;
  const B = board((u, i, now) => {
    if (/\/flights\/mco/.test(u)) {
      if (mood === 'stale') return json({ departures: [mcoRow(now)], _feed: { state: 'stale', failure: 'blocked', asOf: new Date(asOf).toISOString() } }, 200, { 'X-Feed-State': 'stale' });
      throw new TypeError('Failed to fetch');
    }
    return json({ departures: [] });
  });
  await B.win.adbFetch('MCO', 'Departure');
  assert.equal(JSON.parse(B.ls.getItem('fids_mco_lastgood_dep')).ts, asOf, 'stored with the time the list is from');
  mood = 'down';
  B.tick(20 * MIN);
  const kept = await B.win.adbFetch('MCO', 'Departure');
  assert.equal(kept.departures.length, 1);
  assert.equal(B.win.fidsFeedStatus('MCO', 'dep').asOf, asOf, 'still dated from the worker\'s time');
  B.tick(20 * MIN);   // 190 minutes after the list was good
  const gone = await B.win.adbFetch('MCO', 'Departure');
  assert.deepEqual(plain(gone), { departures: [] });
  assert.equal(B.win.fidsFeedStatus('MCO', 'dep').state, 'unavailable');
});

// The phone layout's empty line carries the same pair (_fidsFeedDownLine). Its
// halves were plain inline text under the old 2px tracking, so the browser
// broke them mid-phrase ("Live-Daten nicht / verfügbar|Dados…"), with no room
// around the separator.
test('on a phone, the empty line keeps each language whole and spaces the separator like the strip', () => {
  const half = CSS.match(/html body \.mobile-empty \.ffn-half \{([^}]*)\}/);
  assert.ok(half, 'a rule for the phone line\'s halves');
  assert.match(half[1], /display:\s*inline-block/);
  assert.match(half[1], /max-width:\s*100%/, 'one language wider than the phone still wraps inside itself');
  assert.match(half[1], /letter-spacing:\s*0\.3px/, 'not the 2px tracking of the upper-case message');
  const sep = CSS.match(/html body \.mobile-empty \.bs-sep \{([^}]*)\}/);
  assert.ok(sep && /margin:\s*0 0\.6em/.test(sep[1]));
});

// ── v23998 — the third review: the gate and the belt said two things ────────
// With nothing at all, the strip along the bottom said "Live data unavailable"
// while the belt still read "No Assigned Arrivals" and the empty gate
// "Awaiting Next Flight" — the same claim as "NO FLIGHTS IN WINDOW", which the
// board had already stopped making. Now those lines give way to "Live data
// unavailable" (with the last list's time when there was one), and the strip
// stands aside while they speak, as it does for the board's empty panel.
function downDom(state, hasFeed) {
  const names = ['_fidsFeedDownFor', '_fidsFeedDownInView', '_fidsFeedDownKey'];
  const src = names.map((n) => { const at = CORE.indexOf('function ' + n + '('); return CORE.slice(at, CORE.indexOf('\n}\n', at) + 2); }).join('\n');
  const ctx = {
    LIVE_MODE: true,
    _fidsAirportHasFeed: () => hasFeed !== false,
    _fidsFeedStatusFor: (ap, dir) => (state[dir] || { state: 'live' }),
    _fidsFeedPairHtml: (key, asOf) => '[' + key + (asOf ? '@' + asOf : '') + ']'
  };
  vm.runInNewContext(src, ctx);
  return ctx;
}
test('the empty gate and the empty belt say the live data is unavailable instead of "no flights", and the strip says it once', () => {
  const stale = { state: 'stale', asOf: 1000 }, none = { state: 'unavailable', asOf: null }, live = { state: 'live' };
  const D = downDom({ dep: none, arr: stale });
  assert.equal(D._fidsFeedDownInView('YYZ', 'dep'), '<span class="ffn-inview-line">[feedUnavailable]</span>', 'the gate reads departures: nothing at all');
  assert.equal(D._fidsFeedDownInView('YYZ', 'arr'),
    '<span class="ffn-inview-line">[feedUnavailable]</span><span class="ffn-inview-line ffn-inview-sub">[feedLastUpdate@1000]</span>',
    'the belt reads arrivals: the last list, and when it is from');
  assert.equal(D._fidsFeedDownKey('YYZ', 'dep'), 'unavailable:');
  assert.equal(D._fidsFeedDownKey('YYZ', 'arr'), 'stale:1000');
  const L = downDom({ dep: live, arr: live });
  assert.equal(L._fidsFeedDownInView('YYZ', 'dep'), '', 'a quiet gate with a live feed still awaits its next flight');
  assert.equal(L._fidsFeedDownKey('YYZ', 'arr'), 'live');
  assert.equal(downDom({ dep: none }, false)._fidsFeedDownInView('CUN', 'dep'), '', 'an airport with no feed of its own is not "down"');
  // Where they are used: in place of the two lines, ahead of them.
  const gate = CORE.slice(CORE.indexOf('const _gateFeedDown = _fidsFeedDownInView(iata, \'dep\');'), CORE.indexOf("<div class=\"gate-footer\">", CORE.indexOf('const _gateFeedDown')));
  assert.ok(gate.length > 100, 'the empty gate asks first');
  assert.match(gate, /\$\{_gateFeedDown \? `<div class="ffn-inview ffn-inview--gate" role="status">\$\{_gateFeedDown\}<\/div>` : `<div[^`]*>\$\{TL\('awaitingNextFlight'\)\}<\/div>`\}/);
  assert.match(CORE, /: \(_fidsFeedDownInView\(iata, 'arr'\)\n\s*\/\/ v23998 — the arrivals feed down: not "No Assigned Arrivals"\.\n\s*\? `<div class="bidsv2-empty ffn-inview ffn-inview--belt" role="status">\$\{_fidsFeedDownInView\(iata, 'arr'\)\}<\/div>`\n\s*: `<div class="bidsv2-empty">\$\{TL\('noAssigned'\)\}<\/div>`\)\}/, 'the TV belt');
  const phone = CORE.slice(CORE.indexOf('function renderMobileBaggageHtml('), CORE.indexOf('function renderMobileGateHtml('));
  assert.ok(phone.indexOf("_fidsFeedDownInView(iata, 'arr')") > 0 && phone.indexOf("_fidsFeedDownInView(iata, 'arr')") < phone.indexOf("TL('noAssigned')"), 'the phone belt');
  // Every "No Assigned Arrivals" and "Awaiting Next Flight" on a screen is behind the check.
  for (const k of ["TL('noAssigned')", "TL('awaitingNextFlight')"]) {
    for (let i = CORE.indexOf(k); i >= 0; i = CORE.indexOf(k, i + 1)) {
      assert.match(CORE.slice(i - 700, i), /_fidsFeedDownInView\(iata, '(arr|dep)'\)|_gateFeedDown/, k + ' at ' + i + ' is asked about the feed first');
    }
  }
  // The screens repaint when their feed goes down or comes back.
  const key = CORE.slice(CORE.indexOf('function getDedicatedRenderKey('), CORE.indexOf('\n}\n', CORE.indexOf('function getDedicatedRenderKey(')));
  assert.match(key, /feed: _fidsFeedDownKey\(iata, 'dep'\)/);
  assert.match(key, /feed: _fidsFeedDownKey\(iata, 'arr'\)/);
  assert.match(CORE, /renderDedicatedScreen\(\);\n\s*_fidsFeedNoticeUpdate\(\);   \/\/ v23998 — after the paint/);
  // The strip stands aside while the line speaks — and only when it can be
  // seen: the empty gate at phone width clips it, and the strip says it there.
  const seen = { left: 977, right: 1640, top: 911, bottom: 942, width: 663, height: 31 };
  assert.equal(noticeDom('gate', none, live, { inView: seen }).bar, null, 'the gate line speaks; no strip');
  assert.equal(noticeDom('baggage', live, stale, { inView: { left: 40, right: 1032, top: 154, bottom: 387, width: 992, height: 233 } }).bar, null, 'the belt line speaks');
  const clipped = noticeDom('gate', none, live, { inView: { left: 345, right: 696, top: 83, bottom: 119, width: 351, height: 36 }, vw: 375, vh: 812 });
  assert.equal(clipped.bar.innerHTML, 'feedUnavailable', 'a line the layout clips does not count');
  assert.equal(noticeDom('baggage', live, stale).bar.innerHTML, 'feedStale@1000', 'a belt with flights on it: the strip, as before');
  // The words are the store's own, in the calm block.
  const at = CSS.indexOf("v23996 — WHEN THE AIRPORT'S FEED IS DOWN");
  const block = CSS.slice(at, CSS.indexOf('v23773 — THE SIGN, TO THE PICTURE.'));
  assert.match(block, /html body \.ffn-inview \{\n  animation: none !important;/);
  assert.match(block, /html body \.ffn-inview \.ffn-half \{\n  display: inline-block;\n  max-width: 100%;\n  white-space: nowrap;/, 'each language whole');
});

test('only an airport code becomes a key of the feed-status record (CodeQL js/prototype-polluting-assignment)', () => {
  const B = board(() => json({}, 200));
  const W = B.win;
  assert.equal(typeof W._feedSetStatus, 'function');
  W.__fidsFeedStatus = W.__fidsFeedStatus || {};
  for (const bad of ['__proto__', 'constructor', 'prototype', 'yyz<x', '', 'TOOLONG']) {
    W._feedSetStatus(bad, 'dep', 'unavailable', null, 'error');
  }
  W._feedSetStatus('YYZ', '__proto__', 'unavailable', null, 'error');
  assert.equal(({}).state, undefined, 'Object.prototype untouched');
  assert.equal(({}).dep, undefined, 'Object.prototype untouched');
  assert.deepEqual(Object.keys(W.__fidsFeedStatus), [], 'nothing written for a key that is not an airport code');
  W._feedSetStatus('yyz', 'dep', 'unavailable', null, 'error');
  assert.equal(W.fidsFeedStatus('YYZ', 'dep').state, 'unavailable', 'a real code still records, under its capitals');
});
