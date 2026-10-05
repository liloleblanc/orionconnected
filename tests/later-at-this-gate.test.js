'use strict';

// WHY THIS EXISTS
//
// v23973. The gate screen's frosted window shrinks from the bottom and, under
// it, a neutral-glass strip "Later at this gate | Plus tard à cette porte"
// lists the next departures from the same door: their time (with the day
// when it is not today), flight number and city, and which airport for a city
// with two. A departure the airport's feed moves AWAY from the gate stays in
// the strip as "→ now Gate 2 | maintenant porte 2" until it leaves; when it
// was the flight the door would be showing and nothing else leaves from there
// that day, the whole body of the screen says so. A departure moved TO the
// gate is simply one of its flights. With nothing later the strip is not
// drawn and the window keeps its height: the board never claims there are no
// other departures, because a feed's look-ahead ends somewhere. The boarding
// takeover (countdown, boarding sign, Final Call) carries none of it: since
// v23988 it shows the boarding flight alone.
//
// These tests run the model, the tracker and the markup builders out of
// fids-core.js against stubs, and pin the stylesheet's geometry and rules.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const gateDate = require(path.join(root, 'fids-current', 'js', 'gate-date-context.js'));

/** A top-level declaration in fids-core.js, braces matched. */
function src(head) {
  const i = CORE.indexOf('\n' + head);
  assert.ok(i >= 0, head + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i + 1, j + 1) + (head.startsWith('var ') ? ';' : '');
}
const fnSrc = (name) => src('function ' + name + '(');

// Moncton, ADT (UTC-3).
const ADT = (d, hh, mm) => Date.parse(`2026-10-${String(d).padStart(2, '0')}T${String(hh + 3).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
const row = (flight, gate, d, hh, mm, loc, extra) => Object.assign({
  flight, airline: flight.replace(/\d+$/, ''), gate, _sortTs: ADT(d, hh, mm),
  time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, status: 'ontime', _locIata: loc
}, extra || {});

const CITY = { YYZ: 'TORONTO', YTZ: 'TORONTO', YUL: 'MONTREAL', YHU: 'MONTREAL', YOW: 'OTTAWA', YDF: 'DEER LAKE', YYC: 'CALGARY' };
const titleCase = (s) => String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The gate's Later-at-this-gate functions, wired to a stub board. */
function board({ now, dep, hist = {}, langs = ['en', 'fr'], ap = 'YQM', extra = {}, win = {} }) {
  const store = { fids_gate_history: JSON.stringify(hist) };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const data = { dep };
  const live = (f, t) => !/^(departed|cancelled|canceled|diverted)$/.test(String(f.status || '').toLowerCase())
    && (t - (f._revTs || f._sortTs)) <= 10 * 60000;
  const ctx = {
    window: {
      FIDSGateDate: gateDate,
      fidsFormatTime12: (hhmm) => {
        const m = /^(\d{1,2}):(\d{2})/.exec(hhmm); let h = +m[1];
        const ap2 = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m[2]} ${ap2}`;
      },
      _gateOrbParts: (c) => ({ path: `/logos/${c}.svg`, badge: 'width:1px;', imgStyle: '', native: false })
    },
    localStorage, data, langs, console: { log() {} },
    AP: { YQM: { tz: 'America/Moncton' }, YUL: { tz: 'America/Toronto' } },
    CITY,
    AIRPORT_DISPLAY_IATA: { YHU: 'MET' },
    subScreenVal: '',
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
    _pageAirport: () => ap,
    _gateFlightLive: live,
    _gateCsPick: (rows) => rows,
    _gateFlightsAt: (sub, t) => dep.filter((f) => f.gate === sub && live(f, t)).sort((a, b) => a._sortTs - b._sortTs),
    _cityForIata: (ia) => CITY[ia] || ia,
    normalizeDisplayCity: (c) => titleCase(c),
    getAirlineAccent: (c) => ({ AC: '#D82F2E', WS: '#00B2A9' }[c] || '#0033A1'),
    _airlineOrbEmblem: (c) => `/logos/${c}.svg`
  };
  Object.assign(ctx, extra);
  Object.assign(ctx.window, win);
  const names = ['_gcGate', 'getGateHistory', 'setGateHistory', '_gateLegacyRecord', 'trackGateChanges', 'getInboundGateRedirect',
    '_gateRowKey', 'fidsEscHtml', 'frFirstAirport', '_stripCityCode', '_dispIata', '_realIata', '_gateDayWords', '_gateLbl',
    '_gateMovedAway', '_gateLaterTz', '_gateLaterDay', '_gateLaterModel', '_gateLaterHHMM', '_gateLaterTs',
    '_gateLaterClock', '_gateLaterTwinCity', '_gateLaterPlace', '_gateLaterDayWords', '_gateLaterKey',
    '_gateLaterPairHtml', '_gateLaterSlotHtml', '_gateLaterStripHtml', '_gateChangeAccent', '_gateChangeAccent3', '_gateChangeOrbHtml',
    '_gateChangeNoticeHtml', '_gateLaterFitBox', '_gateLaterScale', '_gateLaterInkOver', '_gateLaterAlign',
    '_gateChangeSoloHtml'];
  const code = [CORE.match(/^var _GATE_HISTORY_KEY = .*;$/m)[0], CORE.match(/^var _CITY_CODE_TAIL = .*;$/m)[0], src('var _GATE_LBL = {'),
    'var GATE_LATER_MAX = 3; var _GATE_TWIN_CITY = null;']
    .concat(names.map(fnSrc)).join('\n')
    + '\nreturn {' + names.join(',') + ', store: localStorageRef };';
  const keys = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, 'localStorageRef', code)(...keys.map((k) => ctx[k]), store);
}

// The words a passenger reads in a piece of markup: everything outside the
// tags, then the two entities fidsEscHtml writes ('&amp;' last). A scan, not a
// one-pass tag regex, so nothing tag-like can survive by being nested.
const text = (html) => {
  let out = '';
  let inTag = false;
  for (const ch of String(html)) {
    if (ch === '<') inTag = true;
    else if (ch === '>') inTag = false;
    else if (!inTag) out += ch;
  }
  return out.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
};

// Moncton gate 4, Monday Oct 5 at 05:00, as the feed lists it.
const G4 = () => [
  row('AC1983', '4', 5, 5, 25, 'YYZ'), row('AC2037', '4', 5, 6, 35, 'YUL'), row('AC7753', '4', 5, 7, 10, 'YOW'),
  row('AC659', '4', 5, 11, 20, 'YUL'), row('AC647', '4', 5, 12, 20, 'YYZ'), row('AC1987', '4', 5, 18, 15, 'YYZ'),
  row('PB923', '2', 5, 11, 25, 'YDF'), row('PB924', '2', 5, 18, 15, 'YDF')
];

test('the strip lists the next departures from this gate after the one on screen, in time order, at most three', () => {
  const b = board({ now: ADT(5, 5, 0), dep: G4() });
  const m = b._gateLaterModel('4', ADT(5, 5, 0), 'YQM');
  assert.equal(m.main.flight, 'AC1983');
  assert.deepEqual(m.entries.map((e) => e.f.flight), ['AC2037', 'AC7753', 'AC659']);
  assert.equal(m.full, null);
  const html = b._gateLaterStripHtml(m);
  assert.match(html, /^<div class="gl-strip" data-gl-n="3">/);
  assert.equal(text(html.match(/<div class="gl-title">[\s\S]*?<\/div>/)[0]), 'Later at this gate | Plus tard à cette porte');
  const slots = html.split('<div class="gl-slot').slice(1).map((s) => text(s.slice(s.indexOf('>') + 1)));
  assert.deepEqual(slots, ['6:35amAC2037 · Montreal · YUL', '7:10amAC7753 · Ottawa', '11:20amAC659 · Montreal · YUL']);
});

test('nothing later at this gate: no strip, the window keeps its height, and no "no other departures" claim', () => {
  const b = board({ now: ADT(5, 17, 0), dep: G4() });
  const m = b._gateLaterModel('4', ADT(5, 17, 0), 'YQM');
  assert.equal(m.main.flight, 'AC1987');
  assert.deepEqual(m.entries, []);
  assert.equal(b._gateLaterStripHtml(m), '');
  // The column's .gl-on class (which shrinks the window) is set only when the strip has markup.
  assert.match(fnSrc('buildV2GateLayout'), /'<div class="gad-media-col' \+ \(_glStrip \? ' gl-on' : ''\) \+ '"/);
  // No such words exist anywhere in the feature's code, in any language.
  const feature = CORE.slice(CORE.indexOf('// v23973 — LATER AT THIS GATE | PLUS TARD'), CORE.indexOf('// GATE LAYOUT V2 — 3-column'))
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(feature, /no other departures|aucun autre départ/i);
  assert.doesNotMatch(src('var _GATE_LBL = {'), /noOther|No other departures/i);
});

test('a gate change is the feed\'s word, one departure (flight and scheduled time) at a time', () => {
  const b = board({ now: ADT(4, 12, 0), dep: [] });
  const today = row('AC1987', '4', 4, 18, 15, 'YYZ');
  const tomorrow = row('AC1987', '2', 5, 18, 15, 'YYZ');
  // The same number on two days at two gates is two departures, not a change.
  b.trackGateChanges([today, tomorrow]);
  b.trackGateChanges([today, tomorrow]);
  let h = b.getGateHistory();
  assert.deepEqual(Object.values(h).map((e) => [e.currentGate, e.changedAt]), [['4', 0], ['2', 0]]);
  // The feed moves today's to gate 2: one record, naming the gate it left.
  b.trackGateChanges([Object.assign({}, today, { gate: '2' }), tomorrow]);
  h = b.getGateHistory();
  const e = h['AC1987|' + today._sortTs];
  assert.equal(e.currentGate, '2'); assert.equal(e.previousGate, '4'); assert.deepEqual(e.left, ['4']);
  assert.ok(e.changedAt > 0);
  assert.equal(h['AC1987|' + tomorrow._sortTs].changedAt, 0, 'tomorrow\'s AC1987 did not move');
  // 4 -> 2 -> 3: still news at gate 4.
  b.trackGateChanges([Object.assign({}, today, { gate: '3' }), tomorrow]);
  assert.deepEqual(b.getGateHistory()['AC1987|' + today._sortTs].left, ['4', '2']);
  assert.equal(b.getInboundGateRedirect('4').toGate, '3');
  // '—' is no gate, never a move; departed and cancelled end the record.
  b.trackGateChanges([Object.assign({}, today, { gate: '—' }), tomorrow]);
  assert.equal(b.getGateHistory()['AC1987|' + today._sortTs].currentGate, '3');
  b.trackGateChanges([Object.assign({}, today, { gate: '3', status: 'departed' }), tomorrow]);
  assert.equal(b.getGateHistory()['AC1987|' + today._sortTs], undefined);
  // The board feeds it departures only; the departures badge reads the same record.
  assert.match(CORE, /try \{ trackGateChanges\(data\.dep\); \}/);
  assert.doesNotMatch(CORE, /trackGateChanges\(data\.dep\.concat\(data\.arr\)\)/);
  assert.match(CORE, /const _ge = _gh && _gh\[_gateRowKey\(f\)\];/);
});

test('a record from before the per-departure key is carried over once, when it is unambiguous', () => {
  const T = ADT(5, 4, 50);
  // The board last saw AC7753 at gate 9 (the old key: the number alone); the feed now says 4.
  let b = board({ now: ADT(5, 5, 0), dep: [], hist: { AC7753: { currentGate: '9', changedAt: 0 } } });
  const f = row('AC7753', '4', 5, 7, 10, 'YOW');
  b.trackGateChanges([f]);
  let h = b.getGateHistory();
  assert.equal(h.AC7753, undefined, 'the old key is purged');
  let e = h['AC7753|' + f._sortTs];
  assert.equal(e.currentGate, '4'); assert.equal(e.previousGate, '9'); assert.deepEqual(e.left, ['9']);
  assert.ok(e.changedAt > 0, 'the move is news: the departures board badges it');
  // A move in progress at the deploy is still news after it, at the old door.
  const g = row('AC2037', '2', 5, 6, 35, 'YUL');
  b = board({ now: ADT(5, 5, 0), dep: [], hist: { AC2037: { currentGate: '2', previousGate: '4', changedAt: T } } });
  b.trackGateChanges([g]);
  e = b.getGateHistory()['AC2037|' + g._sortTs];
  assert.deepEqual([e.currentGate, e.previousGate, e.left, e.changedAt], ['2', '4', ['4'], T]);
  assert.equal(b.getInboundGateRedirect('4').toGate, '2');
  // And moved again since: both gates it left are news.
  b = board({ now: ADT(5, 5, 0), dep: [], hist: { AC2037: { currentGate: '2', previousGate: '4', changedAt: T } } });
  b.trackGateChanges([Object.assign({}, g, { gate: '3' })]);
  assert.deepEqual(b.getGateHistory()['AC2037|' + g._sortTs].left, ['4', '2']);
  // Two departures under one number: the old record cannot say which, so neither inherits it.
  const today = row('AC1987', '2', 4, 18, 15, 'YYZ'), tomorrow = row('AC1987', '2', 5, 18, 15, 'YYZ');
  b = board({ now: ADT(4, 12, 0), dep: [], hist: { AC1987: { currentGate: '4', changedAt: 0 } } });
  b.trackGateChanges([today, tomorrow]);
  assert.deepEqual(Object.values(b.getGateHistory()).map((x) => [x.currentGate, x.changedAt]), [['2', 0], ['2', 0]]);
  // The old key's flip-flop (its earlier gate is the gate the feed gives now) is not a move.
  b = board({ now: ADT(4, 12, 0), dep: [], hist: { AC1987: { currentGate: '7', previousGate: '2', changedAt: T } } });
  b.trackGateChanges([today]);
  e = b.getGateHistory()['AC1987|' + today._sortTs];
  assert.deepEqual([e.currentGate, e.changedAt, e.previousGate], ['2', 0, undefined]);
  // No gate in the old record is no gate.
  b = board({ now: ADT(4, 12, 0), dep: [], hist: { AC1987: { currentGate: '—', changedAt: 0 } } });
  b.trackGateChanges([today]);
  assert.equal(b.getGateHistory()['AC1987|' + today._sortTs].changedAt, 0);
});

function moved(hist, f, from, to, at) {
  hist[f.flight + '|' + f._sortTs] = { flight: f.flight, currentGate: to, previousGate: from, left: [from], changedAt: at };
  return hist;
}

test('(B) a flight moved away shows "now Gate 2 | maintenant porte 2", never a time, until it leaves', () => {
  const dep = G4();
  const ac1987 = dep.find((f) => f.flight === 'AC1987'); ac1987.gate = '2';
  const hist = moved({}, ac1987, '4', '2', ADT(5, 10, 0));
  const b = board({ now: ADT(5, 11, 0), dep, hist });
  const m = b._gateLaterModel('4', ADT(5, 11, 0), 'YQM');
  assert.equal(m.main.flight, 'AC659');
  assert.deepEqual(m.entries.map((e) => e.f.flight + (e.to ? '>' + e.to : '')), ['AC647', 'AC1987>2']);
  const html = b._gateLaterStripHtml(m);
  const slot = html.split('<div class="gl-slot').slice(1)[1];
  assert.match(slot, /^ gl-moved" data-gl-to="2">/);
  // each word marked with its language (v23995)
  assert.match(slot, /<span class="gl-arrow">→<\/span><span class="gl-now"><span class="gl-now-w" lang="en">now Gate<\/span><span class="gl-now-w" lang="fr">maintenant porte<\/span><\/span><span class="gl-pill">2<\/span>/);
  assert.doesNotMatch(slot, /gl-time/, 'a moved flight shows where it went, not when');
  assert.equal(text(slot.slice(slot.indexOf('<div class="gl-sub">'))), 'AC1987 · Toronto · YYZ');
  // Shown at the old door for as long as it would have stayed on its own screen: gone once it leaves.
  ac1987.status = 'departed';
  assert.deepEqual(b._gateLaterModel('4', ADT(5, 11, 0), 'YQM').entries.map((e) => e.f.flight), ['AC647']);
  // A move is never pushed out of the strip by flights that are simply later.
  const dep2 = G4(); const ac2037 = dep2.find((f) => f.flight === 'AC2037'); ac2037.gate = '1';
  const ac659 = dep2.find((f) => f.flight === 'AC659'); ac659.gate = '3';
  const b2 = board({ now: ADT(5, 5, 0), dep: dep2, hist: moved(moved({}, ac2037, '4', '1', 1), ac659, '4', '3', 1) });
  assert.deepEqual(b2._gateLaterModel('4', ADT(5, 5, 0), 'YQM').entries.map((e) => e.f.flight + (e.to ? '>' + e.to : '')),
    ['AC2037>1', 'AC7753', 'AC659>3']);
});

test('(C) the moved flight was the one on screen and nothing else leaves from here that day: the whole screen says so', () => {
  const dep = G4().concat([row('AC1987', '4', 4, 18, 15, 'YYZ')]);
  const tonight = dep[dep.length - 1]; tonight.gate = '2';
  const b = board({ now: ADT(4, 18, 0), dep, hist: moved({}, tonight, '4', '2', ADT(4, 17, 30)) });
  const m = b._gateLaterModel('4', ADT(4, 18, 0), 'YQM');
  assert.equal(m.main.flight, 'AC1983', 'the door would now show tomorrow\'s first flight');
  assert.equal(m.full.f, tonight); assert.equal(m.full.to, '2');
  assert.deepEqual(m.entries, [], 'the strip is not drawn under the notice');
  const html = b._gateChangeNoticeHtml(m);
  assert.match(html, /^<div class="gl-gc" data-gl-gc="AC1987&gt;2" style="--airline-accent:#D82F2E;--airline-accent3:#D82F2E;--gl-pill:#D82F2E;">/);
  const t = text(html);
  for (const w of ['Gate change | Changement de porte', 'AC1987', 'Toronto · YYZ', 'Gate', 'Porte', 'Please proceed to Gate 2',
    'Veuillez vous diriger vers la porte 2', 'Departure | Départ', '6:15pm']) assert.ok(t.includes(w), `notice says "${w}": ${t}`);
  // The carrier's mark leads the flight (rule 1 is in the CSS test below).
  assert.match(html, /<div class="gl-gc-flight"><span class="gl-gc-orb"><span class="v2-fi-icon-wrap v2-fi-emblem-wrap"/);
  // With another flight from this door later the same day, the strip carries the move instead (B).
  const dep2 = G4(); const ac1983 = dep2.find((f) => f.flight === 'AC1983'); ac1983.gate = '2';
  const b2 = board({ now: ADT(5, 5, 0), dep: dep2, hist: moved({}, ac1983, '4', '2', ADT(5, 4, 0)) });
  const m2 = b2._gateLaterModel('4', ADT(5, 5, 0), 'YQM');
  assert.equal(m2.full, null);
  assert.equal(m2.main.flight, 'AC2037');
  assert.deepEqual(m2.entries.map((e) => e.f.flight + (e.to ? '>' + e.to : '')), ['AC1983>2', 'AC7753', 'AC659']);
  // A gate with no flight at all: the notice is the whole screen.
  const b3 = board({ now: ADT(4, 18, 0), dep: [tonight], hist: moved({}, tonight, '4', '2', ADT(4, 17, 30)) });
  const m3 = b3._gateLaterModel('4', ADT(4, 18, 0), 'YQM');
  assert.equal(m3.main, null); assert.equal(m3.full.f, tonight);
  // The solo screen has no layout around it to set the title tab's rule
  // (--airline-accent3), so it sets its own: the airline's, never the
  // stylesheet's marigold fallback.
  const solo = b3._gateChangeSoloHtml(m3, '6:00 PM');
  assert.match(solo, /^<div class="g8-wrap gl-solo g8-airline-AC" style="--airline-accent:#D82F2E;--airline-accent3:#D82F2E;">/);
  assert.doesNotMatch(solo, /FAC120/i);
  // A carrier with a third brand colour (Porter's r3) wears it there, as its layout does.
  const b4 = board({ now: ADT(4, 18, 0), dep: [], win: { AIRLINE_BRAND_COLORS: { PD: { r2: '#152C53', r3: '#254D87' } } } });
  assert.equal(b4._gateChangeAccent3('PD', '#152C53'), '#254D87');
  assert.equal(b4._gateChangeAccent3('AC', '#D82F2E'), '#D82F2E');
  assert.match(fnSrc('renderDedicatedScreen'), /if \(_glSolo\) \{\s*gView\.innerHTML = _gateChangeSoloHtml\(_glSolo, timeStr\);/);
});

test('(D) a flight moved TO this gate simply appears in its list', () => {
  const dep = G4(); const ac647 = dep.find((f) => f.flight === 'AC647'); ac647.gate = '2';
  const b = board({ now: ADT(5, 11, 0), dep, hist: moved({}, ac647, '4', '2', ADT(5, 10, 30)) });
  const m = b._gateLaterModel('2', ADT(5, 11, 0), 'YQM');
  assert.equal(m.main.flight, 'PB923');
  assert.deepEqual(m.entries.map((e) => e.f.flight + (e.to ? '>' + e.to : '')), ['AC647', 'PB924']);
  assert.doesNotMatch(b._gateLaterStripHtml(m), /gl-moved/);
});

test('a time that is not today carries its day; a delay with a new time shows the new time', () => {
  const dep = [row('AC1987', '4', 4, 18, 15, 'YYZ'), row('AC1983', '4', 5, 5, 25, 'YYZ'),
    row('AC2037', '4', 5, 6, 35, 'YUL', { status: 'delayed', upd: '07:05', _revTs: ADT(5, 7, 5) })];
  const b = board({ now: ADT(4, 18, 0), dep });
  const html = b._gateLaterStripHtml(b._gateLaterModel('4', ADT(4, 18, 0), 'YQM'));
  const slots = html.split('<div class="gl-slot').slice(1);
  // each day word carries its language (v23995)
  assert.match(slots[0], /<span class="gl-time">5:25am<\/span><span class="gl-day" data-day-offset="1"><span class="gl-day-w" lang="en">Tomorrow<\/span><span class="gl-day-w" lang="fr">Demain<\/span><\/span>/);
  assert.match(slots[1], /<span class="gl-time">7:05am<\/span>/);
  assert.doesNotMatch(html, /delayed|retard/i, 'the strip carries no status, in words or colour');
});

test('a city with two airports says which one; MET for Saint-Hubert', () => {
  const b = board({ now: ADT(5, 5, 0), dep: [] });
  const p = (ia) => b._gateLaterPlace({ _locIata: ia });
  assert.deepEqual(p('YUL'), { city: 'Montreal', code: 'YUL' });
  assert.deepEqual(p('YHU'), { city: 'Montreal', code: 'MET' });
  assert.deepEqual(p('YYZ'), { city: 'Toronto', code: 'YYZ' });
  assert.deepEqual(p('YTZ'), { city: 'Toronto', code: 'YTZ' });
  assert.deepEqual(p('YOW'), { city: 'Ottawa', code: '' });
  // The board's whole city table decides, so a new twin needs no list here.
  assert.match(fnSrc('_gateLaterTwinCity'), /Object\.keys\(CITY\)/);
});

test('only passenger airports make a city a twin: Atlanta and Denver read as the city alone', () => {
  // The board's own passenger-airport table (the departures board's country
  // classifier), as fids-core.js builds it.
  const _IATA_CC = new Function(src('const _IATA_CC_GROUPS = {').replace(/^const /, 'var ')
    + '\n' + src('const _IATA_CC = (function () {').replace(/^const /, 'var ') + ')();\nreturn _IATA_CC;')();
  for (const c of ['YUL', 'YHU', 'YYZ', 'YTZ', 'ATL', 'DEN', 'CDG', 'ORY', 'DCA', 'IAD']) assert.ok(_IATA_CC[c], c + ' is a passenger airport');
  for (const c of ['PDK', 'BJC', 'LUK', 'MRI']) assert.equal(_IATA_CC[c], undefined, c + ' has no airline service');
  const CITY2 = Object.assign({}, CITY, { ATL: 'ATLANTA', PDK: 'ATLANTA', DEN: 'DENVER', BJC: 'DENVER', CDG: 'PARIS', ORY: 'PARIS', IAD: 'WASHINGTON', DCA: 'WASHINGTON' });
  const city2 = (ia) => CITY2[ia] || ia;
  const b = board({ now: ADT(5, 5, 0), dep: [], extra: { CITY: CITY2, _cityForIata: city2, _IATA_CC } });
  const p = (ia) => b._gateLaterPlace({ _locIata: ia });
  assert.deepEqual(p('ATL'), { city: 'Atlanta', code: '' });
  assert.deepEqual(p('DEN'), { city: 'Denver', code: '' });
  assert.deepEqual(p('YHU'), { city: 'Montreal', code: 'MET' });
  assert.deepEqual(p('YTZ'), { city: 'Toronto', code: 'YTZ' });
  assert.deepEqual(p('ORY'), { city: 'Paris', code: 'ORY' });
  assert.deepEqual(p('DCA'), { city: 'Washington', code: 'DCA' });
  // Without the table (a stub board) every code in the city table counts.
  const b2 = board({ now: ADT(5, 5, 0), dep: [], extra: { CITY: CITY2, _cityForIata: city2 } });
  assert.deepEqual(b2._gateLaterPlace({ _locIata: 'ATL' }), { city: 'Atlanta', code: 'ATL' });
});

test('every new word ships in all nine board languages, French first in Québec', () => {
  const b = board({ now: ADT(5, 5, 0), dep: [] });
  // v23995 — the strip's and the notice's words live in the one store
  // (board-strings.js): the gate's label table is frozen, and _gateLbl falls
  // through to the store.
  const LBL = Object.assign({}, require('../fids-current/js/board-strings.js').STR, new Function(src('var _GATE_LBL = {') + '\nreturn _GATE_LBL;')());
  const LS = new Function(src('const LS = {').replace(/^const /, 'var ') + '\nreturn LS;')();
  const scripts = { ja: /[぀-ヿ一-鿿]/, zh: /[一-鿿]/, ar: /[؀-ۿ]/ };
  for (const key of ['laterAtGate', 'nowGate', 'gateChange', 'gateMovedProceed']) {
    const o = LBL[key];
    assert.ok(o, key);
    assert.deepEqual(Object.keys(o).sort(), ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'zh'], key);
    for (const [l, w] of Object.entries(o)) {
      assert.ok(typeof w === 'string' && w.trim(), `${key}.${l} is empty`);
      if (l !== 'en') assert.notEqual(w, o.en, `${key}.${l} is the English`);
      if (scripts[l]) assert.match(w, scripts[l], `${key}.${l} is not in its own script`);
    }
  }
  // The notice's sentence is the board's existing one, word for word.
  assert.deepEqual(LBL.gateMovedProceed, LS.gateChangeProceed);
  assert.equal(b._gateLbl('laterAtGate', false, (w) => w, ' | '), 'Later at this gate | Plus tard à cette porte');
  assert.equal(b._gateLbl('laterAtGate', true, (w) => w, ' | '), 'Plus tard à cette porte | Later at this gate');
  assert.ok(b.frFirstAirport('YUL') && b.frFirstAirport('YQB') && !b.frFirstAirport('YQM'));
  // Each language is one unbreakable unit; the bar between them is the only break.
  assert.match(b._gateLaterPairHtml('laterAtGate', false), /^<span class="gl-u" lang="en">Later at this gate<\/span><span class="gl-sep"> \| <\/span><span class="gl-u" lang="fr">Plus tard à cette porte<\/span>$/);
});

test('the strip in another pair of languages', () => {
  const b = board({ now: ADT(5, 5, 0), dep: G4(), langs: ['de', 'pt'] });
  const html = b._gateLaterStripHtml(b._gateLaterModel('4', ADT(5, 5, 0), 'YQM'));
  assert.equal(text(html.match(/<div class="gl-title">[\s\S]*?<\/div>/)[0]), 'Später an diesem Gate | Mais tarde neste portão');
  const b2 = board({ now: ADT(5, 11, 0), dep: (() => { const d = G4(); d.find((f) => f.flight === 'AC1987').gate = '2'; return d; })(),
    hist: moved({}, { flight: 'AC1987', _sortTs: ADT(5, 18, 15) }, '4', '2', 1), langs: ['ja', 'ar'] });
  const h2 = b2._gateLaterStripHtml(b2._gateLaterModel('4', ADT(5, 11, 0), 'YQM'));
  assert.match(h2, /<span class="gl-now-w" lang="ja">変更後のゲート<\/span><span class="gl-now-w" lang="ar" dir="rtl">البوابة الجديدة<\/span>/);
});

test('the key changes with what the strip shows, and the gate repaints on it', () => {
  const dep = G4();
  const b = board({ now: ADT(5, 5, 0), dep });
  const k1 = b._gateLaterKey(b._gateLaterModel('4', ADT(5, 5, 0), 'YQM'));
  dep.find((f) => f.flight === 'AC7753').time = '07:20';
  const k2 = b._gateLaterKey(b._gateLaterModel('4', ADT(5, 5, 0), 'YQM'));
  assert.notEqual(k1, k2);
  assert.match(fnSrc('getDedicatedRenderKey'), /later: _gateLaterKeyNow\(iata\)/);
  assert.match(fnSrc('renderDedicatedScreen'), /\+ '\|' \+ _gateLaterKeyNow\(iata\);/);
  const tick = fnSrc('updateDedicatedTimeOnly');
  assert.match(tick, /const _glk = _gateLaterKeyNow\(iata\);\s*if \(_glk !== window\._gateLaterPainted\) \{ window\._gateLaterPainted = _glk; requestGateRebuild\(\); \}/);
  assert.match(tick, />= 5000/);
});

test('no cut words: the type steps down to a floor, then the lines may wrap between whole words', () => {
  const b = board({ now: ADT(5, 5, 0), dep: [] });
  const host = { k: 1, style: { setProperty(n, v) { host.k = +v; } } };
  const box = (need) => ({ get scrollWidth() { return Math.round(need * host.k); }, clientWidth: 200, scrollHeight: 10, clientHeight: 10 });
  const sw = (x) => x.scrollWidth > x.clientWidth + 1;
  assert.equal(b._gateLaterFitBox(host, '--gl-k', [box(230)], [], 0.72, sw), true);
  assert.ok(host.k < 1 && host.k >= 0.86 && Math.round(230 * host.k) <= 201, 'stops as soon as it fits: ' + host.k);
  assert.equal(b._gateLaterFitBox(host, '--gl-k', [box(400)], [], 0.72, sw), false);
  assert.equal(host.k, 0.72, 'never below the floor');
  // Without a measure of its own it reads the ink (_gateLaterInkOver).
  assert.match(fnSrc('_gateLaterFitBox'), /var ow = \(typeof overW === 'function'\) \? overW : _gateLaterInkOver;/);
  const fit = fnSrc('_gateLaterFit');
  assert.match(fit, /if \(!_gateLaterFitBox\(st, '--gl-k', wide, slots, 0\.72\)\) \{\s*st\.classList\.add\('gl-wrap'\);\s*_gateLaterFitBox\(st, '--gl-k', wide, slots, 0\.5\);/);
  // The rail's title fitters leave the notice's headline alone.
  assert.equal((CORE.match(/\.g8-bir-shelves (?:\.v2-flightinfo-block )?\.v2-fi-title:not\(\.gl-gc-title\)/g) || []).length, 3);
});

/** A stub element for the measuring functions: a box, its computed style, its text runs. */
function el({ rect, style = {}, texts = [], pills = [], offsetWidth, before }) {
  const r = Object.assign({ width: rect.right - rect.left, height: (rect.bottom || 0) - (rect.top || 0) }, rect);
  return {
    rect: r, style0: style, texts, pills, before,
    offsetWidth: offsetWidth == null ? r.width : offsetWidth,
    getBoundingClientRect() { return r; },
    querySelectorAll() { return pills.map((q) => ({ getBoundingClientRect: () => Object.assign({ width: q.right - q.left }, q) })); }
  };
}
function fakeDoc(extra) {
  const win = {
    getComputedStyle(e, pseudo) {
      if (pseudo) return e.before || { content: 'none' };
      return Object.assign({ borderLeftWidth: '0px', borderRightWidth: '0px', paddingLeft: '0px', paddingRight: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }, e.style0 || {});
    }
  };
  const doc = Object.assign({
    defaultView: win,
    createRange() { let n = null; return { selectNodeContents(t) { n = t; }, getClientRects() { return n.rects; } }; },
    createTreeWalker(box) { let i = -1; return { nextNode() { i++; return box.texts[i] || null; } }; }
  }, extra || {});
  return doc;
}
const run = (x, right) => ({ nodeValue: x, rects: [{ left: 1030, top: 0, bottom: 10, right, width: right - 1030 }] });

test('no cut words, measured on the ink: a word in the slot\'s end padding does not fit', () => {
  const b = board({ now: ADT(5, 5, 0), dep: [] });
  // YUL gate C87 at 1680x1050: the slot ran 1014-1281 with 13.4px of end
  // padding; "AC8825 · Washington · DCA" ended at 1280, on the card's rim.
  // scrollWidth (which leaves the end padding out) called that a fit.
  const slot = (endsAt, more) => {
    const box = el(Object.assign({ rect: { left: 1014, right: 1281, top: 0, bottom: 80 }, style: { paddingLeft: '13.4px', paddingRight: '13.4px' },
      texts: [run('11:20am', 1150), run('AC8825 · Washington · DCA', endsAt)] }, more));
    box.ownerDocument = fakeDoc();
    return box;
  };
  assert.equal(b._gateLaterInkOver(slot(1280)), true, 'into the end padding is over');
  assert.equal(b._gateLaterInkOver(slot(1267)), false, 'up to the content edge fits');
  assert.equal(b._gateLaterInkOver(slot(1267.4)), false, 'half a pixel of rounding is allowed');
  // A right-to-left line overflows to the left.
  const rtl = slot(1200); rtl.texts.push({ nodeValue: 'البوابة الجديدة', rects: [{ left: 1018, right: 1100, width: 82 }] });
  assert.equal(b._gateLaterInkOver(rtl), true);
  // Whitespace is not ink; a pill's box is.
  const sp = slot(1200); sp.texts.push({ nodeValue: '   ', rects: [{ left: 0, right: 2000, width: 2000 }] });
  assert.equal(b._gateLaterInkOver(sp), false);
  assert.equal(b._gateLaterInkOver(slot(1200, { pills: [{ left: 1200, right: 1272 }] })), true);
  // The strip's fitter uses it for the slots and the title.
  assert.match(fnSrc('_gateLaterFit'), /if \(!_gateLaterFitBox\(st, '--gl-k', wide, slots, 0\.72\)\)/);
});

test('the strip and the glass are measured onto the rail\'s cards, so a 2px Delta frame lines up too', () => {
  const b = board({ now: ADT(5, 5, 0), dep: [] });
  const props = {};
  // Delta at 1680x1050: the column 136.5-1050, a 2px frame, six rows of 151.58.
  const top = 136.5, frame = 2, rowH = (1050 - top - 2 * frame) / 6;
  const rows = [0, 1, 2, 3, 4, 5].map((i) => el({ rect: { left: 2, right: 384, top: top + frame + i * rowH, bottom: top + frame + (i + 1) * rowH },
    before: { content: '""', position: 'absolute', top: '9.45px', bottom: '9.45px' } }));
  const col = el({ rect: { left: 386.4, right: 1293.6, top, bottom: 1050 } });
  col.style = { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } };
  let rowList = rows;
  const doc = fakeDoc({ querySelector: (q) => (q === '.gad-media-col.gl-on' ? col : null), querySelectorAll: () => rowList });
  assert.equal(b._gateLaterAlign(doc), true);
  const plate6Top = top + frame + 5 * rowH + 9.45, plate6Bot = 1050 - frame - 9.45, plate5Bot = top + frame + 5 * rowH - 9.45;
  assert.equal(props['--gl-top-m'], (plate6Top - top).toFixed(2) + 'px');
  assert.equal(props['--gl-bot-m'], (1050 - plate6Bot).toFixed(2) + 'px');
  assert.equal(props['--gl-foot-m'], (1050 - plate5Bot).toFixed(2) + 'px');
  // The worked-out fallback (3px frame) would be a third of a pixel per row off here.
  const fallbackTop = 3 + ((1050 - top) - 6) / 6 * 5 + 9.45;
  assert.ok(Math.abs(fallbackTop - (plate6Top - top)) > 0.6, 'the fallback is off on Delta, the measure is not');
  // Not the rail's six cards: the measured values are removed and the fallback stands.
  rowList = rows.slice(0, 5);
  assert.equal(b._gateLaterAlign(doc), false);
  assert.deepEqual(props, {});
  // It runs with every fit (after each paint, when the fonts land, on resize).
  assert.match(fnSrc('_gateLaterFit'), /try \{ _gateLaterAlign\(doc\); \} catch \(eA\) \{\}/);
});

test('the boarding takeover carries none of it: no band, no gate change, the boarding flight alone (v23988)', () => {
  // v23973 put the moved flights in a "Gate change" band at the foot of the
  // countdown, the boarding sign and Final Call; v23988 removed it. While the
  // gate's next flight has the whole screen, that flight is all it shows (an
  // important safety message in its own status bar aside).
  const dep = G4();
  const ac2037 = dep.find((f) => f.flight === 'AC2037'); ac2037.gate = '2';
  const b = board({ now: ADT(5, 6, 40), dep, hist: moved({}, ac2037, '4', '2', ADT(5, 5, 30)) });
  // 6:40: AC7753 (7:10) has the whole screen; AC2037 (6:35) was moved to
  // gate 2. The model still knows (the strip shows it once the gate is back
  // in its three columns), but nothing on the takeover reads the model.
  const m = b._gateLaterModel('4', ADT(5, 6, 40), 'YQM');
  assert.equal(m.main.flight, 'AC7753');
  assert.deepEqual(m.entries.map((e) => e.f.flight + (e.to ? '>' + e.to : '')), ['AC2037>2', 'AC659', 'AC647']);
  // The band's builders and the sign's shrink-to-fit are gone.
  for (const fn of ['_gateLaterTakeoverHtml', '_gateLaterTakeoverFrom', '_gateLaterSignFit', '_gateLaterSignFits']) {
    assert.ok(!CORE.includes('function ' + fn + '('), fn + ' is gone');
  }
  assert.doesNotMatch(fnSrc('_gateLaterFit'), /SignFit|--gl-ss|g8-sign/, 'the fitter leaves the boarding sign alone');
  // The takeover's markup reads nothing of Later at this gate: its body goes
  // straight to its status bar, and the wrap carries no band class.
  const g = fnSrc('uxgGateHtml');
  assert.doesNotMatch(g, /_gateLater|_gateChange|gl-tk|_glTk|--gl-ss/);
  assert.match(g, /'<div class="g8-r4" style="flex:1;overflow:hidden;position:relative;z-index:2;">' \+ row4Html \+ '<\/div>'\s*\+ \(r3Left \?/);
  assert.match(g, /\+ \(\(finalActive \|\| boardActive \|\| showCountdown\) \? ' g8-takeover' : ''\)\s*\+ \(_bannerSpec && _bannerSpec\.body \? ' g8-wrap-themed-body' : ''\)/);
  // The strip has one title: Later at this gate, under its clock orb.
  const html = b._gateLaterStripHtml(m);
  assert.equal(text(html.match(/<div class="gl-title">[\s\S]*?<\/div>/)[0]), 'Later at this gate | Plus tard à cette porte');
  assert.match(html, /<span class="ac-ico ac-ico-time"><\/span>/);
  assert.equal(fnSrc('_gateLaterStripHtml').split('\n')[0], 'function _gateLaterStripHtml(m) {');
});

// ── the stylesheet ──────────────────────────────────────────────────────────
const AT = CSS.indexOf('v23973 — LATER AT THIS GATE');
const BLOCK = AT >= 0 ? CSS.slice(CSS.lastIndexOf('/*', AT)) : '';
const rules = (re) => BLOCK.split('\n').filter((l) => re.test(l));
// Whole rules (selector and body) whose selector matches re.
const ruleBodies = (re) => BLOCK.split(/\n\}/).map((r) => r.slice(r.lastIndexOf('*/') + 1)).filter((r) => re.test(r.slice(0, r.indexOf('{'))));

test('the window shrinks only while the strip is up, to the left column\'s fifth card; the strip sits on its sixth', () => {
  assert.ok(BLOCK, 'the v23973 block exists');
  // The rail's own plate inset, which the strip copies to line up with it.
  assert.match(CSS, /top: clamp\(6px, 0\.9vh, 11px\) !important;\n\s*bottom: clamp\(6px, 0\.9vh, 11px\) !important;/);
  assert.match(BLOCK, /--gl-p: clamp\(6px, 0\.9vh, 11px\);\n\s*--gl-row: calc\(\(100% - 6px\) \/ 6\);\n\s*--gl-foot: var\(--gl-foot-m, calc\(var\(--gl-row\) \+ 3px \+ var\(--gl-p\)\)\);/);
  const W = 'html body' + ':not(#_)'.repeat(255) + ':not(._)'.repeat(6);
  assert.ok(BLOCK.includes(W + ' .g8-wrap .gad-media-col.gl-on > .ad-panel-backdrop::before {\n  bottom: var(--gl-foot) !important;'));
  assert.ok(BLOCK.includes(W + ' .g8-wrap .gad-media-col.gl-on #gateAdCarousel {\n  bottom: calc(var(--gl-foot) + var(--gx-bz)) !important;'));
  assert.ok(BLOCK.includes(W + ' .g8-wrap .gad-media-col.gl-on > .ad-outer-frame::before {\n  bottom: calc(var(--gl-foot) + var(--gx-bz)) !important;'));
  // The measured cards first (_gateLaterAlign), the worked-out geometry as the fallback.
  assert.match(BLOCK, /top: var\(--gl-top-m, calc\(3px \+ var\(--gl-row\) \* 5 \+ var\(--gl-p\)\)\) !important;\n\s*bottom: var\(--gl-bot-m, calc\(3px \+ var\(--gl-p\)\)\) !important;/);
  assert.match(BLOCK, /left: var\(--gx-g\) !important; right: var\(--gx-g\) !important;/);
  // Every rule that touches the window names .gl-on: without the strip, nothing changes.
  for (const l of rules(/ad-panel-backdrop|#gateAdCarousel|ad-outer-frame/)) assert.match(l, /\.gad-media-col\.gl-on/, l.slice(-90));
  // The big map follows the screen by itself (v23936); the strip needs nothing more for it.
  assert.match(CORE, /function _bigCraftFitToScreen\(/);
});

test('nothing in the strip moves, flashes or wears a status or carrier colour; the notice\'s pill is the airline\'s', () => {
  assert.doesNotMatch(BLOCK, /animation|transition|@keyframes/);
  const strip = ruleBodies(/\.gl-strip/).join('\n}');
  assert.doesNotMatch(strip, /airline-accent|--gx-1|--gx-2|--gx-3|plate-warn|status/);
  // Every colour the strip paints is a grey: no channel more than 40 from another.
  const cols = [];
  for (const m of strip.matchAll(/#([0-9a-f]{6})\b/gi)) cols.push([0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));
  for (const m of strip.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) cols.push([+m[1], +m[2], +m[3]]);
  assert.ok(cols.length > 10);
  for (const c of cols) assert.ok(Math.max(...c) - Math.min(...c) <= 40, 'not a grey: ' + c.join(','));
  assert.match(BLOCK, /\.gl-gc \.gl-gc-pill \{[\s\S]*?background: var\(--gl-pill, var\(--airline-accent, #3a4656\)\) !important;/);
  // Rule 1: the carrier's orb on the notice is never smaller than the flight beside it.
  assert.match(BLOCK, /\.gl-gc-orb > \* \{\n\s*width: calc\(min\(11vh, 6\.9vw\) \* var\(--gl-gk\)\) !important; height: calc\(min\(11vh, 6\.9vw\) \* var\(--gl-gk\)\) !important;/);
  assert.match(BLOCK, /\.gl-gc-flight \{\n[^}]*font-size: calc\(min\(10\.5vh, 6\.6vw\) \* var\(--gl-gk\)\) !important;/);
  // The big-map overlay stays under the notice.
  assert.ok(BLOCK.includes('html.gl-gc-on body'), 'the notice hides the big-map overlay');
});

test('the strip\'s times are a step smaller and lighter than the rail\'s', () => {
  assert.match(BLOCK, /\.gl-strip \.gl-time \{\n[^}]*font-family: "Cabinet Grotesk Bold"[^}]*font-weight: 700 !important; font-size: calc\(var\(--gl-v\) \* \.62 \* var\(--gl-k\)\) !important;/);
  assert.match(BLOCK, /--gl-v: min\(8vh, 5vw\);/);
});

test('the heritage card keeps every word inside the shorter window: its picture and mark give up height, its words do not', () => {
  // Measured at 1680x1050 on YQM gate 4 (Air Nova): with the window shortened
  // the card's French line ran off its foot. The sky and the mark's plate now
  // shrink, in proportion, only while the strip is up.
  assert.match(BLOCK, /\.gad-media-col\.gl-on \.hcard-wrap :is\(\.hcard-sky, \.hcard-plate\) \{\n\s*flex-shrink: 1 !important; min-height: 0 !important;/);
  assert.match(BLOCK, /\.gad-media-col\.gl-on \.hcard-wrap \.hcard-plate \.hcard-mark \{\n\s*max-height: min\(clamp\(52px, min\(16vh, 17vw\), 200px\), 100%\) !important;/);
  assert.doesNotMatch(BLOCK.slice(0, BLOCK.indexOf('(1) the window shrinks')), /\.hcard-line|font-size/, 'the card\'s words keep their size');
});

test('no label rewriter touches the strip\'s and the notice\'s day words', () => {
  // Measured on YQB gate 30: the V9 rewriter turned the strip's English
  // "Tomorrow" into the rotating language, so a French-first board read
  // "Demain | Demain". It is gone (v23995): every word it repaired comes from
  // the store in the board's own languages, and the board-languages guard
  // (B13) fails any timer that sweeps the page and rewrites its text.
  assert.equal(CORE.indexOf('function fixVisibleGateLabels()'), -1, 'the rewriter is gone');
  assert.doesNotMatch(CORE, /_ocEvery\(fixVisibleGateLabels/);
});

test('the stylesheet has no takeover band and no scaled copy of the boarding sign (v23988)', () => {
  // Gone with the band: .gl-tk, the .gl-tk-on mirrors of every screen-unit
  // length of the boarding sign, and their --gl-ss scale. The sign is sized by
  // its own rules (v23771, v23773) alone, as it was before v23973.
  assert.doesNotMatch(CSS, /\.gl-tk\b|gl-tk-on|--gl-ss/);
  // Nothing in the Later-at-this-gate block reaches into the takeover. The
  // block is bounded by its own last rule (the last one naming a .gl- class),
  // so a block appended to the file later is not read as this one.
  const lines = BLOCK.split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (/^html[^{]*\.gl-[\w-]/.test(l)) last = i; });
  assert.ok(last > 0, 'the block\'s own rules were found');
  let end = last;
  while (end < lines.length && !/\}\s*$/.test(lines[end])) end++;
  const own = lines.slice(0, end + 1).join('\n');
  assert.ok(own.includes('.gl-strip') && own.includes('.gl-gc') && own.includes('.gl-solo'), 'strip, notice and solo screen are in it');
  assert.doesNotMatch(own, /\.g8-takeover|\.g8-sign|\.g8-cd-/);
});
