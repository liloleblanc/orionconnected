'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24013 — THE BAGGAGE HALL BOARD (bids5).
//
// One screen for the whole hall: a short welcome band (the city's
// photograph, the welcome in the board's two languages, the clock, the date,
// the weather), the hall list (every arrival of the belt window, each row
// ending in its carousel) and the hall map (Moncton's real hall from the
// airport's 2018 master plan; a labelled schematic of the feed's belts
// elsewhere; no map where the feed gives no belt).
//
// What these tests hold:
//   1. it is OFF unless asked for (?bidslook=5, or an airport config's
//      bidsLook: 5), and today's belt screen is drawn exactly as before when
//      it is off;
//   2. it shows no belt a feed did not give: a flight with none reads the
//      store's "To be announced", never a number;
//   3. an airport whose feed gives no belt has no map, and the list takes
//      the width;
//   4. every page of the list, and the map, says everything in both of the
//      board's languages at once;
//   5. Moncton's map draws its two real belts, by the hall's own labels, and
//      lights the one each listed flight is on.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'baggage-display.css'), 'utf8');
const BS = require(path.join(ROOT, 'fids-current', 'js', 'board-strings.js'));

// The block of fids-core.js the hall board is, whole.
const START = SRC.indexOf('// ══ v24013 — BIDS5: THE BAGGAGE HALL BOARD');
const END = SRC.indexOf('// ── LIVE TELEMETRY ANIMATOR', START);
assert.ok(START > 0 && END > START, 'fids-core.js must hold the bids5 block before the telemetry animator');
const BLOCK = SRC.slice(START, END);

// An object literal declared `const NAME = {…};` in fids-core.js, brace-matched
// (skipping strings and comments).
function literal(name) {
  const at = SRC.indexOf('const ' + name + ' = {');
  assert.ok(at >= 0, name + ' must be defined');
  let depth = 0, line = false, block = false, quote = '';
  for (let i = SRC.indexOf('{', at); i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return new Function('return ' + SRC.slice(SRC.indexOf('{', at), i + 1))();
  }
  assert.fail('unbalanced ' + name);
}
const LS = literal('LS');
const SS = literal('SS');

// The block run in a sandbox: the board's own store, its two language
// tables, and plain stand-ins for the helpers that draw a logo, a city or a
// time (they are not what is under test here).
function sandbox(langs, extra) {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = (s) => {
    s = String(s || '').toLowerCase();
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    if (s === 'arrived' || s === 'landed') return 'arrived';
    if (s === 'delayed') return 'delayed';
    if (s === 'early') return 'early';
    if (s === 'ontime' || s === 'on-time') return 'on-time';
    return 'scheduled';
  };
  const ctx = {
    BoardStrings: BS, LS, SS, langs, lang: langs[0],
    fidsEscHtml: esc,
    TLin: (k, l) => { const o = LS[k]; if (o) return o[l] || ''; return BS.bs(k, l); },
    _ssEntry: (k) => SS[k] || BS.entry('st' + String(k).charAt(0).toUpperCase() + String(k).slice(1)) || BS.entry(k),
    window: { fidsNormStatus: norm },
    location: { search: '' },
    getAirportConfig: () => null,
    mkLogo: (code) => '<img class="full-logo" data-code="' + esc(code) + '">',
    IATA_TO_WORDMARK: { AC: 'air-canada', PD: 'porter' },
    AIRLINE_NAME: { AC: 'AIR CANADA', PD: 'PORTER', WS: 'WESTJET' },
    wordmarkSrc: (b, v) => '/logos/' + b + '-' + v + '.svg',
    formatCityIata: (raw, code) => String(raw) + (code ? ' | ' + code : ''),
    _CITY_CODE_TAIL: /\s*(?:\|\s*([A-Za-z]{2,4})|\(\s*([A-Za-z]{2,4})\s*\))\s*$/,
    _stripCityCode: (s) => String(s).replace(/\s*\|\s*[A-Za-z]{2,4}\s*$/, ''),
    _dispIata: (c) => c,
    _cityApHtml: (t) => esc(t),
    _bidsTimeForLang: (t) => t,
    adbTs: (s) => Date.parse(String(s).replace(' ', 'T')),
    _wxCityPic: (i) => '/logos/cities/' + i + '.jpg',
    _wxNightPicFor: (i) => (i === 'YQM' ? '/logos/cities/YQM-night.jpg' : ''),
    airportCityNameSafe_v21877: (i) => ({ YQM: 'MONCTON', YOW: 'Ottawa', YUL: 'Montréal' })[i] || '',
    tc: (s) => String(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, p, c) => p + c.toUpperCase()),
    AP: { YQM: { tz: 'America/Moncton' }, YOW: { tz: 'America/Toronto' }, YHZ: { tz: 'America/Halifax' } },
    CITY: {},
    _ocClockTime1: () => '8:01PM',
    _ocClockDate: () => '<span class="fx-unit">Monday</span>',
    _fidsFeedDownInView: () => '',
    _wxLocalDate: (i, ts) => new Date(ts).toISOString().slice(0, 10),
    displayTemp: (c) => c + '°C',
    BIDS_WINDOW_AHEAD_MS: 60 * 60000,
    BIDS_UNASSIGNED: '—'
  };
  Object.assign(ctx, extra || {});
  vm.createContext(ctx);
  vm.runInContext(BLOCK, ctx);
  return ctx;
}
const T0 = Date.parse('2026-10-05T23:00:00Z');
/** Text of markup, tags dropped. */
const textOf = (html) => {
  // a scan, not a replace: each tag runs from '<' to the next '>' (CodeQL
  // js/incomplete-multi-character-sanitization)
  const s = String(html);
  let out = '', i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { out += s.slice(i); break; }
    out += s.slice(i, lt);
    const gt = s.indexOf('>', lt + 1);
    if (gt < 0) break;
    i = gt + 1;
  }
  return out;
};
const row = (o) => Object.assign({ flight: 'AC7754', airline: 'AC', _airlineName: 'AIR CANADA', status: 'ontime', time: '20:34', upd: null,
  origin: 'Ottawa', _locIata: 'YOW', _sortTs: T0, _belt: null }, o);
const ctxFor = (S, o) => Object.assign({ iata: 'YQM', tz: 'America/Moncton', now: new Date(T0), nowTs: T0, L: BS.pairLangs(S.langs, o.iata || 'YQM'),
  portrait: false, kind: 'plan', belts: [], pages: [], later: [], page: 1,
  tba: S._b5Pair(S._b5Word('beltTba'), BS.pairLangs(S.langs, o.iata || 'YQM'), 'beltTba'),
  landedLbl: S._b5Pair((l) => SS.landed[l], BS.pairLangs(S.langs, o.iata || 'YQM')),
  idle: S._b5Pair(S._b5Word('beltIdle'), BS.pairLangs(S.langs, o.iata || 'YQM'), 'beltIdle'),
  tomorrow: S._b5Pair(S._b5Word('tomorrow'), BS.pairLangs(S.langs, o.iata || 'YQM'), 'tomorrow'),
  pageLbl: S._b5Pair(S._b5Word('pageLbl'), BS.pairLangs(S.langs, o.iata || 'YQM')),
  laterLbl: S._b5Pair(S._b5Word('laterLbl'), BS.pairLangs(S.langs, o.iata || 'YQM'), 'laterLbl') }, o);

// ── 1. OFF BY DEFAULT ──────────────────────────────────────────────────────

test('the hall board is off unless the URL or the airport asks for it', () => {
  const S = sandbox(['en', 'fr']);
  assert.equal(S._b5LookOn('', null), false, 'no URL flag and no config: off');
  assert.equal(S._b5LookOn('?ap=YQM&stream=1', {}), false, 'an airport config without the field: off');
  assert.equal(S._b5LookOn('?ap=YQM', { bidsLook: 3 }), false, 'any other look: off');
  assert.equal(S._b5LookOn('?ap=YQM&bidslook=5', null), true, '?bidslook=5 turns it on');
  assert.equal(S._b5LookOn('', { bidsLook: 5 }), true, 'an airport config turns it on');
  assert.equal(S._b5LookOn('', { bidsLook: '5' }), true);
  assert.equal(S._b5LookOn('?bidslook=3', { bidsLook: 5 }), false, 'the URL wins over the airport: one screen can be shown the old way');
  assert.equal(S._b5LookOn('?bidslook=55', null), false);
  S.location.search = ''; S.getAirportConfig = () => null;
  assert.equal(S._bids5On('YQM'), false, 'the live wrapper defaults to off');
});

test('off, the belt screen is drawn exactly as before (one early return, one key)', () => {
  // the renderer: the hall board's branch returns before any of the belt
  // screen's markup, and only when the switch is on
  const hook = 'if (_bids5On(iata)) { _b5Render(bView, iata, now); return; }';
  assert.equal(SRC.split(hook).length - 1, 1, 'one hook in renderDedicatedScreen');
  const at = SRC.indexOf(hook);
  assert.ok(at < SRC.indexOf('<div class="bidsv2-screen', at), 'it comes before the belt screen is built');
  assert.ok(at > SRC.indexOf('bView.innerHTML = renderMobileBaggageHtml('), 'and after the phone layout, which it leaves alone');
  // the render key: its own only when on
  assert.equal(SRC.split('if (_bids5On(iata)) return _b5RenderKey(iata);').length - 1, 1);
  // and today's look is still the deployed one
  assert.match(SRC, /var _BIDSV3_ON = true;/);
});

// ── 2. NO INVENTED BELTS ───────────────────────────────────────────────────

test('a flight with no belt in its feed reads "To be announced", never a number', () => {
  const S = sandbox(['en', 'fr']);
  const c = ctxFor(S, {});
  assert.equal(S._b5BeltParts(null), null);
  assert.equal(S._b5BeltParts(''), null);
  assert.equal(S._b5BeltParts('—'), null, 'the "to be announced" key is no belt');
  assert.deepEqual(JSON.parse(JSON.stringify(S._b5BeltParts('A-1'))), { t: 'A', n: '1' }, 'Boston\'s terminal letter is kept');
  assert.deepEqual(JSON.parse(JSON.stringify(S._b5BeltParts('D-300'))), { t: 'D', n: '300' });
  assert.deepEqual(JSON.parse(JSON.stringify(S._b5BeltParts('5'))), { t: '', n: '5' });
  const none = S._b5BeltCell(row({ _belt: null }), c, false);
  assert.match(none, /class="b5-tba"/);
  assert.match(none, /To be announced/);
  assert.match(none, /À venir/);
  assert.doesNotMatch(textOf(none), /\d/, 'no digit in the cell of a flight with no belt');
  assert.match(S._b5BeltCell(row({ _belt: '5' }), c, false), /b5-chip-n" data-len="1">5</);
  assert.equal(S._b5BeltCell(row({ _belt: '5', status: 'cancelled' }), c, true), '', 'a cancelled flight claims no carousel');
});

test('the hall lists what the belt screens list: no belt the board could not place, codeshares once', () => {
  const S = sandbox(['en', 'fr']);
  const inWin = () => true;
  const hall = S._b5Hall([
    row({ flight: 'AC7754', _belt: '1' }),
    row({ flight: 'UA8000', airline: 'UA', _belt: '1' }),          // the same aircraft under a codeshare number
    row({ flight: 'DL5000', airline: 'DL', _belt: null, _beltUnplaced: true, _sortTs: T0 + 60000 }),
    row({ flight: 'PD2381', airline: 'PD', _belt: null, origin: 'Montréal', _locIata: 'YHU', _sortTs: T0 + 120000 })
  ], T0, inWin);
  assert.deepEqual(JSON.parse(JSON.stringify(hall.map((f) => f.flight))), ['AC7754', 'PD2381']);
  // the operating carrier's number is the one kept
  const op = S._b5Hall([row({ flight: 'UA8000', airline: 'UA', _belt: '1' }), row({ flight: 'AC7754', _belt: '1', _opCode: 'AC' })], T0, inWin);
  assert.deepEqual(JSON.parse(JSON.stringify(op.map((f) => f.flight))), ['AC7754']);
  assert.deepEqual(Array.from(S._b5FeedBelts([row({ _belt: null }), row({ _belt: '10' }), row({ _belt: '2' }), row({ _belt: '—' }), row({ _belt: '7', _beltUnplaced: true })])), ['2', '10'],
    'the feed\'s own belts only, in order');
});

// ── 3. NO BELTS IN THE FEED, NO MAP ────────────────────────────────────────

test('an airport whose feed gives no belt has no map, and the list takes the width', () => {
  const S = sandbox(['en', 'fr']);
  const yhz = [row({ _belt: null }), row({ flight: 'WS808', _belt: null })];
  assert.equal(S._b5MapKind('YHZ', yhz), 'none', 'Halifax: no belt in the feed');
  assert.equal(S._b5MapKind('DTW', []), 'none');
  assert.equal(S._b5MapKind('YOW', [row({ _belt: '4' })]), 'schematic', 'a belt in the feed and no plan of the hall: the schematic');
  assert.equal(S._b5MapKind('YQM', []), 'plan', 'Moncton: the real hall');
  const c = ctxFor(S, { iata: 'YHZ', kind: 'none', pages: [yhz] });
  const html = S._b5Html(c);
  assert.doesNotMatch(html, /<aside/, 'no map is drawn');
  assert.match(html, /class="b5 b5-none/);
  assert.match(CSS, /#baggageView \.b5\.b5-none \.b5-body \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'the list is the whole body');
  // the schematic says it is one
  const s = S._b5SchematicHtml(ctxFor(S, { iata: 'YOW', kind: 'schematic', belts: ['4', '5'], pages: [[row({ _belt: '5' })]] }));
  assert.match(s, /Schematic, not a floor plan/);
  assert.match(s, /Schéma, pas un plan des lieux/);
});

// ── 4. BOTH LANGUAGES ON EVERY PAGE ────────────────────────────────────────

for (const langs of [['en', 'fr'], ['fr', 'en'], ['ja', 'ar'], ['de', 'pt']]) {
  test('every page says everything in both languages at once: ' + langs.join('+'), () => {
    const S = sandbox(langs);
    const flights = [];
    for (let i = 0; i < 9; i++) flights.push(row({ flight: 'AC' + (7000 + i), _sortTs: T0 + i * 60000, _belt: i % 3 ? '1' : null, status: ['ontime', 'delayed', 'arrived', 'cancelled'][i % 4], upd: i % 4 === 1 ? '21:10' : null }));
    const sizes = Array.from(S._b5PageSizes(flights.length, S._b5PerPage(false, 'plan')));
    assert.deepEqual(sizes, [5, 4], 'nine flights are pages of five and four, not seven and two');
    const pages = []; let at = 0;
    for (const n of sizes) { pages.push(flights.slice(at, at + n)); at += n; }
    const c = ctxFor(S, { pages, later: [row({ flight: 'PD2381', _sortTs: T0 + 3 * 3600000 })] });
    const html = S._b5Html(c);
    const L = c.L;
    const both = (h) => L.every((l) => h.indexOf('lang="' + l + '"') >= 0);
    const segs = html.split(/<div class="b5-page(?: b5-on)?" data-p=/).slice(1);
    assert.equal(segs.length, 2, 'two pages');
    for (const seg of segs) {
      const rows = seg.split('<div class="b5-row').slice(1);
      assert.ok(rows.length >= 4);
      for (const r of rows) {
        const st = r.slice(r.indexOf('class="b5-st '), r.indexOf('class="b5-bc"'));
        assert.ok(both(st), 'each row\'s status is in both languages');
        if (/b5-tba/.test(r)) assert.ok(both(r.slice(r.indexOf('b5-tba'))), '"To be announced" in both languages');
      }
    }
    // the column titles, the band's words, the map's words, the pager
    const cols = html.slice(html.indexOf('class="b5-cols'), html.indexOf('class="b5-pages'));
    assert.ok(both(cols), 'column titles in both languages');
    const band = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    assert.ok(both(band.slice(band.indexOf('b5-kick'))), 'Baggage claim in both');
    assert.ok(both(band.slice(band.indexOf('b5-welcome'))), 'the welcome in both');
    const map = html.slice(html.indexOf('<aside'));
    assert.ok(both(map.slice(map.indexOf('b5-here'))), 'You are here in both');
    for (const k of ['domesticFlights', 'internationalFlights', 'hallCustoms', 'hallExit', 'youAreHere']) {
      for (const l of L) assert.ok(map.indexOf(BS.bs(k, l)) >= 0, k + ' in ' + l);
    }
    const strip = html.slice(html.indexOf('b5-strip'), html.indexOf('</section>'));
    assert.equal((strip.match(/class="b5-pg[^"]*" data-p="\d"/g) || []).length, 2, 'a pager for each page');
    assert.match(strip, /data-p="1"><span class="b5-plbl">/);
    assert.match(strip, /1<span class="b5-of">\/<\/span>2/);
    assert.match(strip, /2<span class="b5-of">\/<\/span>2/);
    // nothing single-language: no word on this board is read through the
    // helpers that give the language on screen alone
    assert.doesNotMatch(BLOCK, /[^A-Za-z_.]TL\(|[^A-Za-z_.]SL\(|TLF\(/, 'no TL()/SL() (one language) in the hall board');
  });
}

test('the empty hall says so in both languages at once, with the next arrival', () => {
  const S = sandbox(['en', 'fr']);
  const c = ctxFor(S, { pages: [], later: [row({ flight: 'AC2040', origin: 'Montréal', _locIata: 'YUL', time: '21:38', _sortTs: T0 + 2 * 3600000 })] });
  const html = S._b5Html(c);
  const e = html.slice(html.indexOf('class="b5-empty'));
  assert.match(e, /No arrivals in the next hour/);
  assert.match(e, /Aucune arrivée dans la prochaine heure/);
  assert.match(e, /Next arrival/);
  assert.match(e, /Prochaine arrivée/);
  assert.match(e, /AC2040/);
  assert.doesNotMatch(html, /b5-strip/, 'no Later strip under it: it names the next arrival itself');
  for (const k of ['noArrivalsHour', 'nextArrival', 'beltIdle', 'laterLbl', 'schematicNote', 'youAreHere', 'hallCustoms', 'hallExit', 'domesticFlights', 'internationalFlights']) {
    for (const l of BS.LANGS) assert.ok(BS.STR[k][l], k + ' in ' + l);
  }
});

// ── 5. MONCTON'S HALL ──────────────────────────────────────────────────────

test('the Moncton map draws its two real belts by the hall\'s labels, and lights the ones the page uses', () => {
  const S = sandbox(['en', 'fr']);
  const P = S._B5_HALL_PLANS.YQM;
  assert.deepEqual(JSON.parse(JSON.stringify(P.belts.map((b) => [b.id, b.label]))), [['1', 'domesticFlights'], ['2', 'internationalFlights']],
    'belt 1 the domestic oval, belt 2 the international belt in the customs hall (2018 Master Plan, fig. 7-1)');
  // the board's own Moncton belts are the same two (mapADB)
  assert.match(SRC, /_belt = _isIntl \? '2' : '1';/);
  const c = ctxFor(S, { pages: [[row({ _belt: '1' }), row({ flight: 'PD2381', airline: 'PD', _belt: '1' })], [row({ flight: 'TS123', airline: 'TS', _belt: '2', origin: 'Cancún', _locIata: 'CUN' })]] });
  const html = S._b5PlanHtml(c);
  assert.equal((html.match(/class="b5-disc/g) || []).length, 2, 'two carousels on the plan');
  assert.match(html, /class="b5-disc b5-lit" data-lit=" 1 "[^>]*>1</, 'belt 1 lit on page 1');
  assert.match(html, /class="b5-disc" data-lit=" 2 "[^>]*>2</, 'belt 2 lit on page 2, not now');
  assert.match(html, /<g class="b5-beltg b5-lit" data-lit=" 1 ">/);
  assert.match(html, /class="b5-here"/, 'the screen\'s own place');
  // the key: page 1's flights on belt 1, and belt 2 says it has none now
  const key = html.slice(html.indexOf('class="b5-key"'));
  assert.match(key, /data-p="1">[^]*AC7754[^]*PD2381/);
  assert.match(key, /No flight now/);
  // a cancelled flight lights nothing
  const cx = ctxFor(S, { pages: [[row({ _belt: '2', status: 'cancelled' })]] });
  assert.doesNotMatch(S._b5PlanHtml(cx), /class="b5-disc b5-lit"/);
});

test('the colours: amber, red and green only on status words; the carousel is the hall-sign blue', () => {
  const S = sandbox(['en', 'fr']);
  assert.equal(S._b5Tone('delayed'), 'amber');
  assert.equal(S._b5Tone('cancelled'), 'red');
  assert.equal(S._b5Tone('on-time'), 'green');
  assert.equal(S._b5Tone('arrived'), 'ink');
  assert.equal(S._b5Tone('scheduled'), 'quiet');
  // the status colours are used by the status words' rules alone
  const uses = CSS.slice(CSS.indexOf('BIDS5')).split('\n').filter((l) => /var\(--b5-(amber|red|green)\)/.test(l));
  assert.ok(uses.length >= 3);
  for (const l of uses) assert.match(l, /\.b5-st-(amber|red|green) \.b5-u/, 'only a status word wears ' + l);
  assert.match(CSS, /--b5-way: #2763D0/);
  // nothing flashes: no animation in the hall board's rules
  assert.doesNotMatch(CSS.slice(CSS.indexOf('BIDS5')), /animation|@keyframes/);
});
