'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24044 — TWO ROW BUGS IN THE COMPANION APP (app.html), seen on the phone
// shots of 2026-10-12.
//
// 1. A HANGING DOT. At Victoria, Air North's 4N527 to Whitehorse read
//    '· 4N527': Victoria's page names Whitehorse without its code, the row
//    had no code, and the separator in front of the flight number was drawn
//    anyway. The line is now its parts joined by '·' between two that are
//    there, and the code is read back from the boards' own city table (YXY).
// 2. CODESHARES LISTED AS FLIGHTS. At Sea-Tac the 1:45 PM to Amsterdam from
//    gate A8 showed five times (AF5597, DL142, KL6032, SV4469, VS3936): the
//    page gives every carrier selling a seat its own row. One row now, the
//    operator's, as the boards choose it where they merge a feed's codeshares.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'fids-current/app.html'), 'utf8');
const SHARED = fs.readFileSync(path.join(ROOT, 'fids-current/js/shared-names.js'), 'utf8');

// A function's source, from the line it starts on to its closing brace
function fn(name) {
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
const line = (re) => { const m = APP.match(re); assert.ok(m, String(re)); return m[0]; };

// The app's city table as the page builds it (its own names, then the boards'
// table from shared-names.js, then the airport catalogue), with the code
// lookup and the row's parts, in one context like the page's globals
function page() {
  const ctx = { console };
  ctx.window = ctx;
  vm.runInNewContext(SHARED, ctx);
  vm.runInNewContext(
    'var T=function(k){return k==="via"?"via":k;};'
    + 'var dispIata=function(c){return c;};'
    + 'var WX_ON=true;var WX={};'
    + fn('esc')
    + line(/^const AIRPORTS=\{[\s\S]*?\n\};/m).replace('const AIRPORTS', 'var AIRPORTS')
    + line(/^const CITY=\{[\s\S]*?\};/m).replace('const CITY', 'var CITY')
    + fn('_tcCity')
    + line(/^if\(window\.FIDS_SHARED_CITY\)[^\n]*/m)
    + line(/^for\(var _ck in AIRPORTS\)[^\n]*/m)
    + 'var _CITY_CODE=null;' + fn('_cityKey') + fn('cityCodeOf')
    + fn('wxTemp') + fn('wxHtml') + fn('rowSubParts'),
    ctx);
  return ctx;
}

// adbToCard with the tables it reads stubbed (as tests/companion-app.test.js)
const card = new Function(['REGIONAL_FAM', 'AIRLINE', 'BRAND', 'REGIONAL_OP', 'wmUrls'],
  fn('adbHHMM') + fn('inferOperator') + fn('adbToCard') + '; return adbToCard;')({}, {}, {}, {}, () => null);

// A row as the worker's authority feeds send it (authorityFlight): the other
// end as {iata, name}, the home side with its gate
function feedRow(o) {
  const at = o.at || '2026-10-12 13:45';
  const t = { local: at + ':00-07:00', utc: at + ':00-07:00' };
  const air = { iata: o.code, icao: null, name: o.alName || o.code };
  const home = { airport: { iata: o.home || 'SEA' }, scheduledTime: t, airline: air };
  if (o.gate) home.gate = o.gate;
  if (o.belt) home.baggageBelt = o.belt;
  const other = { airport: { iata: o.to || null, icao: null, name: o.toName || null }, scheduledTime: t, airline: air };
  const f = { number: o.number, status: o.status || 'scheduled', codeshareStatus: 'IsOperator', airline: air };
  if (o.aircraft || o.reg) f.aircraft = { model: o.aircraft || '', reg: o.reg || '' };
  if (o.dir === 'arr') { f.arrival = home; f.departure = other; } else { f.departure = home; f.arrival = other; }
  return f;
}

// ── 1. THE HANGING DOT ─────────────────────────────────────────────────────

test('the line under the city never draws a separator beside an empty part', () => {
  const ctx = page();
  const parts = (f) => ctx.rowSubParts(f).replace(/<[^>]+>/g, '');
  // the code, the flight, the stops: a '·' only between two that are there
  assert.equal(parts({ cityIata: 'YYC', flight: 'WS266' }), 'YYC · WS266');
  assert.equal(parts({ cityIata: '', flight: '4N527' }), '4N527', 'no code: no dot in front of the flight');
  assert.equal(parts({ cityIata: '', flight: '4N527', via: ['YXY'] }), '4N527 · via Whitehorse');
  assert.equal(parts({ cityIata: 'YVR', flight: 'AC8152', via: [] }), 'YVR · AC8152');
  for (const f of [{ cityIata: '', flight: '4N527' }, { cityIata: 'YXY', flight: '' }, { cityIata: '', flight: '' }]) {
    const p = parts(f);
    assert.doesNotMatch(p, /^\s*·|·\s*$|·\s*·/, JSON.stringify(f) + ' → ' + JSON.stringify(p));
  }
  // the temperature brings its own '·', and only beside a code
  assert.equal(ctx.wxHtml(''), '');
  ctx.WX.YXY = { t: 3.4 };
  assert.equal((ctx.rowSubParts({ cityIata: 'YXY', flight: '4N527' }) + ctx.wxHtml('YXY')).replace(/<[^>]+>/g, ''), 'YXY · 4N527 · 3°C');
  // the row draws the line through it, and the old fixed '·' is gone
  const rh = fn('rowHtml');
  assert.match(rh, /'<div class="sub"><span class="sx">'\+rowSubParts\(f\)\+wxHtml\(f\.cityIata\)\+'<\/span>'\+pill\+'<\/div>'/);
  assert.doesNotMatch(APP, /'<\/b> · <span class="fno">'/);
});

test('a far end the feed names without its code gets the code from the boards\' table', () => {
  const ctx = page();
  // Victoria's page: 'Whitehorse', no code (the worker's city table for
  // Victoria has no Whitehorse); the boards' table has YXY
  assert.match(SHARED, /YXY:'WHITEHORSE'/);
  assert.equal(ctx.cityCodeOf('Whitehorse'), 'YXY');
  assert.equal(ctx.cityCodeOf('WHITEHORSE'), 'YXY');
  assert.equal(ctx.cityCodeOf('Whitehorse International Airport'), 'YXY');
  assert.equal(ctx.cityCodeOf('Prince George'), 'YXS');
  // accents folded both ways, as the boards fold them
  assert.equal(ctx.cityCodeOf('Iles de la Madeleine'), 'YGR');
  assert.equal(ctx.cityCodeOf('Îles-de-la-Madeleine'), 'YGR');
  // a name two airports share names neither: no code beats a wrong one
  for (const n of ['Toronto', 'Montréal', 'London', 'Sydney', 'Chicago', 'New York', '', 'Zz']) {
    assert.equal(ctx.cityCodeOf(n), '', n);
  }
  // the whole way: the feed's row → the card → the fill → the line
  const raw = feedRow({ number: '4N527', code: '4N', alName: 'Air North', home: 'YYJ', gate: '3', to: null, toName: 'Whitehorse', at: '2026-10-12 11:05' });
  const c = card(raw, 'dep');
  assert.equal(c.cityIata, '', 'the feed carries no code');
  assert.equal(c.cityName, 'Whitehorse');
  const fill = new Function('cityCodeOf', 'all', line(/^\s*for\(const f of all\)\{ if\(!f\.cityIata&&f\.cityName\) f\.cityIata=cityCodeOf\(f\.cityName\); \}/m));
  fill(ctx.cityCodeOf, [c]);
  assert.equal(c.cityIata, 'YXY');
  assert.equal(ctx.rowSubParts(c).replace(/<[^>]+>/g, ''), 'YXY · 4N527');
  // fetchDir fills it before the list is made
  const fd = fn('fetchDir');
  assert.ok(fd.indexOf('f.cityIata=cityCodeOf(f.cityName)') > 0 && fd.indexOf('f.cityIata=cityCodeOf(f.cityName)') < fd.indexOf('return cardList('));
});

// ── 2. CODESHARES ──────────────────────────────────────────────────────────

const cardList = new Function(fn('_cityKey') + fn('_fltNum') + fn('sameFlight') + fn('oneRowPerFlight') + fn('cardList') + '; return cardList;')();
const NOW = Date.parse('2026-10-12T11:05:00-07:00');
const list = (rows, dir) => cardList(rows.map((r) => card(r, dir || 'dep')).filter(Boolean), dir || 'dep', NOW);
const flights = (out) => out.map((f) => f.schedTime + ' ' + f.flight);

// Sea-Tac's departures to Amsterdam on 2026-10-12, as the worker served them
const SEA_AMS = [
  ['AF3584', 'AF', 'Air France', '17:45', 'A4'], ['AF5597', 'AF', 'Air France', '13:45', 'A8'],
  ['DL142', 'DL', 'Delta Air Lines', '13:45', 'A8'], ['DL144', 'DL', 'Delta Air Lines', '17:45', 'A4'],
  ['KL6032', 'KL', 'KLM', '13:45', 'A8'], ['KL6053', 'KL', 'KLM', '17:45', 'A4'],
  ['SV4469', 'SV', 'Saudi Arabian', '13:45', 'A8'], ['SV4471', 'SV', 'Saudi Arabian', '17:45', 'A4'],
  ['VS3936', 'VS', 'Virgin Atlantic Airways', '13:45', 'A8'], ['VS4060', 'VS', 'Virgin Atlantic Airways', '17:45', 'A4']
].map(([number, code, alName, t, gate]) => feedRow({ number, code, alName, gate, to: 'AMS', toName: 'Amsterdam', at: '2026-10-12 ' + t }));
const SEA_ANC = [
  ['AS1333', '11:43', 'N3'], ['AS1381', '12:59', 'N19'], ['AS67', '15:47', 'C3']
].map(([number, t, gate]) => feedRow({ number, code: 'AS', alName: 'Alaska', gate, to: 'ANC', toName: 'Anchorage', at: '2026-10-12 ' + t }));

test('a codeshare is one row, the operator\'s, as at Sea-Tac', () => {
  const out = list([...SEA_AMS, ...SEA_ANC]);
  assert.deepEqual(flights(out), ['11:43 AS1333', '12:59 AS1381', '13:45 DL142', '15:47 AS67', '17:45 DL144']);
  const ams = out.find((f) => f.flight === 'DL142');
  assert.equal(ams.gate, 'A8');
  assert.equal(ams.airline, 'DL');
  // the sellers' numbers stay on the row for the search
  assert.deepEqual(ams.codeshares.slice().sort(), ['AF5597', 'KL6032', 'SV4469', 'VS3936']);
  const match = new Function('cityOf', 'dispIata', 'airlineName', fn('matches') + '; return matches;')(
    () => 'Amsterdam', (c) => c, () => 'Delta');
  assert.ok(match(ams, 'af5597'), 'an Air France ticket finds its flight');
  assert.ok(match(ams, 'dl142'));
  assert.ok(!match(out.find((f) => f.flight === 'AS67'), 'af5597'));
  // the order of the feed does not choose the row
  assert.deepEqual(flights(list([...SEA_AMS].reverse())), ['13:45 DL142', '17:45 DL144']);
  // with no mainline number in the group, the carrier that flies most here
  const regional = [
    feedRow({ number: 'AS2489', code: 'AS', gate: 'C9', to: 'YYJ', toName: 'Victoria', at: '2026-10-12 13:22' }),
    feedRow({ number: 'AA7413', code: 'AA', gate: 'C9', to: 'YYJ', toName: 'Victoria', at: '2026-10-12 13:22' })
  ];
  assert.deepEqual(flights(list([...regional, ...SEA_ANC])), ['11:43 AS1333', '12:59 AS1381', '13:22 AS2489', '15:47 AS67']);
});

test('the same minute and the same city are not enough: different flights stay apart', () => {
  const base = { code: 'AC', to: 'YVR', toName: 'Vancouver', home: 'YYJ', at: '2026-10-12 15:05' };
  const two = (a, b) => assert.equal(list([feedRow(Object.assign({}, base, a)), feedRow(Object.assign({}, base, b))]).length, 2, JSON.stringify([a, b]));
  const one = (a, b) => assert.equal(list([feedRow(Object.assign({}, base, a)), feedRow(Object.assign({}, base, b))]).length, 1, JSON.stringify([a, b]));
  // the merge itself, for contrast: one gate, one minute, one city
  one({ number: 'AC8158', gate: '9' }, { number: 'UA8158', code: 'UA', gate: '9' });
  // two gates: two aircraft
  two({ number: 'AC8158', gate: '9' }, { number: 'WS3326', code: 'WS', gate: '10' });
  // no gate on either (or on one): nothing ties them together
  two({ number: 'AC8158' }, { number: 'WS3326', code: 'WS' });
  two({ number: 'AC8158', gate: '9' }, { number: 'WS3326', code: 'WS' });
  // a different operator, aircraft type or registration on the two rows
  two({ number: 'AC8158', gate: '9' }, { number: 'WS3326', code: 'WS', gate: '9' });   // Jazz / WestJet Encore
  two({ number: 'XY1234', code: 'XY', gate: '9', aircraft: 'Dash 8-400' }, { number: 'ZQ2345', code: 'ZQ', gate: '9', aircraft: 'Boeing 737-800' });
  two({ number: 'XY1234', code: 'XY', gate: '9', reg: 'C-GKQJ' }, { number: 'ZQ2345', code: 'ZQ', gate: '9', reg: 'C-FJZS' });
  // two mainline numbers of two carriers: each is someone's own aircraft
  two({ number: 'DL142', code: 'DL', gate: 'A8' }, { number: 'AS142', code: 'AS', gate: 'A8' });
  // another day, another minute or another city: never compared
  two({ number: 'AC8158', gate: '9' }, { number: 'UA8158', code: 'UA', gate: '9', at: '2026-10-13 15:05' });
  two({ number: 'AC8158', gate: '9' }, { number: 'UA8158', code: 'UA', gate: '9', at: '2026-10-12 15:06' });
  two({ number: 'AC8158', gate: '9' }, { number: 'UA8158', code: 'UA', gate: '9', to: 'YYC', toName: 'Calgary' });
  // the rule in words, on the function that applies it
  const sf = fn('sameFlight');
  assert.match(sf, /\['gate','terminal','belt','operatedBy','aircraft','reg'\]/);
  assert.match(sf, /_fltNum\(a\)<1000&&_fltNum\(b\)<1000/);
});

test('arrivals: one belt and one minute from one city is one flight, two belts are two', () => {
  const arr = (number, code, belt, gate) => feedRow({ dir: 'arr', number, code, belt, gate, to: 'AMS', toName: 'Amsterdam', at: '2026-10-12 11:52' });
  const one = list([arr('DL143', 'DL', '22', 'A4'), arr('AF8992', 'AF', '22', 'A4'), arr('KL6033', 'KL', '22', '')], 'arr');
  assert.deepEqual(flights(one), ['11:52 DL143']);
  assert.deepEqual(one[0].codeshares.slice().sort(), ['AF8992', 'KL6033']);
  assert.equal(list([arr('XY1234', 'XY', '22', ''), arr('ZQ2345', 'ZQ', '23', '')], 'arr').length, 2);
  assert.equal(list([arr('XY1234', 'XY', '', ''), arr('ZQ2345', 'ZQ', '', '')], 'arr').length, 2);
});

test('the list keeps its other rules: the cutoff, one row per flight per day, in time order', () => {
  const cl = fn('cardList');
  assert.match(cl, /return oneRowPerFlight\(all\.filter\(f=>!f\._effTs \|\| f\._effTs>=cutoff\)/);
  assert.match(cl, /\.sort\(\(a,b\)=>a\._ts-b\._ts\);/);
  // a row with no far end at all is never grouped
  const out = list([feedRow({ number: 'XY1', code: 'XY', gate: '1', to: null, toName: null }), feedRow({ number: 'ZQ2', code: 'ZQ', gate: '1', to: null, toName: null })]);
  assert.equal(out.length, 2);
});
