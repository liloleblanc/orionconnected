'use strict';

// WHY THIS EXISTS
//
// No name on any screen may be cut, ellipsised or left running out of its
// box: not a city, an airport, an airline, an aircraft, a status word or a
// label, in any of the nine board languages, at 1680x1050, 1920x1080,
// 1280x720 or portrait 1080x1920. A name too long for its box gets smaller,
// down to one readable floor — max(12px, 1.3% of the screen's short side) —
// or takes its box's second line at a space or a hyphen, never inside a word;
// one that still does not fit is left showing and reported, never hidden.
//
// The audit before this change found names cut on the belts ("Charlottetо…"),
// the departures/arrivals boards ("Saint-Pierre-Et-Mique…", "Toronto · Pe…",
// every cell at 1280x720), the gate maps' stand label (run off the small
// map's edge) and the weather card's arrival plate (14px past its left edge),
// and about fifteen fitters, each with its own floor, the board's switched
// off. There is now ONE fitter, fidsFitText / FIDS_FIT_RULES in fids-core.js,
// and the fitters that size their own boxes hand it their last step.
//
// Measured with headless Chrome over the real data path (YQM feed rows, the
// city tables, the YUL/YHZ/JFK/CLT boards) in all nine languages at the four
// sizes. Nothing here can render a board, so the tests below pin:
//   1. the one fitter, and every surface's names handed to it;
//   2. its decision (_fxPlan, kept free of the DOM for this) run against a
//      model of every surface's real box — widths, height budgets and type
//      sizes measured on the boards (tests/fixtures/name-fit-model.json), the
//      face's own character widths — for the 20 longest names in our city
//      tables and every airport under-name: nothing over, nothing under the
//      floor, no break inside a word;
//   3. the airport under-names ("Toronto · Billy Bishop"), for the cities
//      with two of our airports and no other.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, 'fids-current', p), 'utf8');
const CORE = read('js/fids-core.js');
const OVR = read('css/display-overrides.css');
const FD = read('css/flight-display.css');
const APP = read('app.html');
const MODEL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'name-fit-model.json'), 'utf8'));

function fnSource(name) {
  const i = CORE.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1);
}
function tableSource(decl) {
  const i = CORE.indexOf(decl);
  assert.ok(i >= 0, decl + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(CORE.indexOf('{', i), j + 1);
}
const table = (decl) => vm.runInNewContext('(' + tableSource(decl) + ')');
const CITY = table('const CITY = {');
const CITY_FR = table('const CITY_FR = {');
const SUB = table('var AIRPORT_SUBLINE = {');
const PERSON = vm.runInNewContext(CORE.slice(CORE.indexOf('var AIRPORT_SUBLINE_PERSON = ') + 'var AIRPORT_SUBLINE_PERSON = '.length, CORE.indexOf(';', CORE.indexOf('var AIRPORT_SUBLINE_PERSON = '))));

// The fitter's pure half, lifted out of the page.
const _fxSearch = new Function('return (' + fnSource('_fxSearch') + ');')();
const _fxPlan = new Function('_fxSearch', 'return (' + fnSource('_fxPlan') + ');')(_fxSearch);
const floorAt = (w, h) => new Function('window', 'return (' + fnSource('fidsFitFloor') + ')();')({ innerWidth: w, innerHeight: h });

// The city helpers, with the tables they read.
function cityHelpers(langNow, frFirst) {
  const src = [
    'var AIRPORT_SUBLINE = ' + tableSource('var AIRPORT_SUBLINE = {') + ';',
    'var AIRPORT_SUBLINE_PERSON = ' + JSON.stringify(PERSON) + ';',
    'var _AP_SUB_ALL = null;',
    'var lang = ' + JSON.stringify(langNow || 'en') + ';',
    'function frFirstAirport() { return ' + (frFirst ? 'true' : 'false') + '; }',
    'function _realIata(c) { return c === "MET" ? "YHU" : c; }',
    'function fidsEscHtml(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\'/g, "&#39;"); }',
    'var window = { _gateIata: "YQM" }; var document = { getElementById: function () { return null; } };',
    'var _UPPER_TOKENS = ' + CORE.slice(CORE.indexOf('const _UPPER_TOKENS = ') + 'const _UPPER_TOKENS = '.length, CORE.indexOf(';', CORE.indexOf('const _UPPER_TOKENS = '))) + ';',
    'function _dispIata(c) { return c === "YHU" ? "MET" : c; }',
    'var CITY = ' + JSON.stringify(CITY) + '; var CITY_FR = ' + JSON.stringify(CITY_FR) + ';',
    fnSource('_apSublineNames'), fnSource('_apQcBoard'), fnSource('_apSubLang'), fnSource('_apSubline'),
    fnSource('_apCitySpelling'), fnSource('_cityAp'), fnSource('_cityApHtml'), fnSource('tc'),
    'return { _cityAp, _cityApHtml, _apSubline, tc };'
  ].join('\n');
  return new Function(src)();
}

// ── 1. ONE FITTER ──────────────────────────────────────────────────────────

test('one fitter: every surface hands its names to fidsFitText through FIDS_FIT_RULES', () => {
  const at = CORE.indexOf('var FIDS_FIT_RULES = [');
  assert.ok(at >= 0, 'FIDS_FIT_RULES must exist');
  const rules = CORE.slice(at, CORE.indexOf('\n];', at));
  for (const sel of [
    '#fidsTable tbody td.td-dest', '#fidsTable tbody td.td-status', '#fidsTable thead th',   // the boards
    '#fidsTable tbody td.td-time',
    '.bidsv3 .b3-from', '.bidsv3 .b3-airline-name', '.bidsv2-carousel-label',              // the belts
    '.wxc-mon-city',                                                                         // the weather plates
    '.gate-map-note',                                                                        // the maps' stand label
    '.v2-fi-orbcode', '.bigcraft-flightcap',                                                 // the gate's badge, the big map
    '.v2-fi-mline1', '.v2-rc-fi-tval', '.octb-date', '.g8-bw-note'                           // held to the floor
  ]) assert.ok(rules.includes(sel), `${sel} is not in FIDS_FIT_RULES`);
  // one pass fits them all, after every render, language change, resize and font load
  assert.match(CORE, /_fidsPairT = requestAnimationFrame\(function \(\) \{\s*_fidsPairT = null; try \{ fidsFitAll\(document\); \} catch \(e\) \{\}\s*_fidsPairSeparators\(document\);/);
  assert.match(CORE, /document\.fonts\.addEventListener\('loadingdone'/);
  assert.match(CORE, /window\._ocEvery\(function \(\) \{ try \{ _fidsSchedulePairPass\(\); \} catch \(e\) \{\} \}, 2000\);/);
  // the fitters that size their own boxes hand the last step to it
  assert.match(fnSource('_wxFitPlateCities'), /fidsFitText\(els\[i\], _WX_PLATE_FIT\)/);
  assert.match(fnSource('gateAutofit'), /var _flo = Math\.ceil\(fidsFitFloor\(\)\);/);
  assert.match(fnSource('gateAutofit'), /el\.style\.setProperty\('text-overflow', 'clip', 'important'\);/);
  assert.match(fnSource('gateAutofit'), /_fidsSchedulePairPass\(\)/);
  assert.match(fnSource('_gateTitleFit'), /Math\.max\(_tFl0, bases\[j\] \* ratio\)/);
});

test('the floor is one number per screen: max(12px, 1.3% of the short side), up to a quarter pixel', () => {
  assert.equal(floorAt(1680, 1050), 13.75);
  assert.equal(floorAt(1920, 1080), 14.25);
  assert.equal(floorAt(1080, 1920), 14.25);
  assert.equal(floorAt(1280, 720), 12);
  assert.match(OVR, /:root \{ --fx-floor: max\(12px, 1\.3vmin\); \}/);
});

test('what the fitter decides is written inline !important, and never an ellipsis', () => {
  const fit = fnSource('fidsFitText');
  assert.match(fit, /st\.setProperty\('text-overflow', 'clip', 'important'\);/);
  assert.match(fit, /st\.setProperty\('white-space', 'normal', 'important'\);/);
  assert.match(fit, /st\.setProperty\('overflow-wrap', 'normal', 'important'\);/);
  assert.match(fit, /st\.setProperty\('word-break', 'normal', 'important'\);/);
  // what will not fit at the floor is reported and left showing
  assert.match(fnSource('_fxReport'), /el\.setAttribute\('data-fx-over', '1'\);/);
  assert.match(fnSource('_fxReport'), /el\.style\.setProperty\('overflow', 'visible', 'important'\);/);
});

test('the belts, the board row and the companion app no longer end a name in "…"', () => {
  const rule = (sel) => { const i = OVR.indexOf(sel + ' {'); assert.ok(i >= 0, sel); return OVR.slice(i, OVR.indexOf('}', i)); };
  assert.doesNotMatch(rule('.bidsv3 .b3-city'), /ellipsis|overflow: hidden/);
  assert.doesNotMatch(rule('.bidsv3 .b3-airline-name'), /ellipsis|overflow: hidden/);
  assert.match(rule('.bidsv3 .b3-airline-name'), /font-size: max\(var\(--fx-floor, 12px\)/);
  assert.match(rule('.bidsv3 .b3-tail'), /white-space: nowrap/);
  for (const sel of ['.wm-txt{', '.fcard .alname{', '.brand .meta b{']) {
    const i = APP.indexOf(sel); assert.ok(i >= 0, sel);
    const body = APP.slice(i, APP.indexOf('}', i));
    assert.doesNotMatch(body, /text-overflow:ellipsis/, sel);
    assert.match(body, /white-space:normal/, sel);
  }
  // every row keeps its code (names of 18+ characters used to drop it), tied
  // to the last word so it never starts a line alone
  assert.doesNotMatch(CORE, /_isLongDest/);
  assert.match(CORE, /const _tailHtml = \(c\) => '<span class="dest-iata-tail">\\u00a0<span class="dest-iata-sep">\|<\/span> <span class="dest-iata">' \+ _dispIata\(c\) \+ '<\/span><\/span>';/);
  assert.match(OVR, /\.dest-iata-tail \{ white-space: nowrap !important; \}/);
  // the board's narrow columns: the destination is no longer the narrowest
  assert.match(FD, /#fidsTable colgroup col\.col-wx        \{ width: clamp\(110px, 8\.2vw, 150px\) !important; \}/);
  assert.match(FD, /#fidsTable colgroup col\.col-status    \{ width: clamp\(166px, 13vw, 250px\) !important; \}/);
});

test('a final call\'s "All" in Japanese or Chinese is a word, not a numeral', () => {
  const cls = new Function('return (' + fnSource('_g8GrpValCls') + ');')();
  for (const v of ['All | Toutes', '全て | 全部', 'الكل', 'Todos | Tous']) assert.equal(cls(v), ' g8-grp-txt', v);
  for (const v of ['1–7', '12', '3 · 4']) assert.equal(cls(v), '', v);
});

// ── 2. THE DECISION, AGAINST EVERY SURFACE'S REAL BOX ──────────────────────

const helpers = cityHelpers('en');
const helpersFr = cityHelpers('fr');
// The 20 longest names in our city tables, as the boards case them.
const LONGEST = [...new Set([...Object.entries(CITY), ...Object.entries(CITY_FR)].map(([k, v]) => k + '\u0001' + v))]
  .map((kv) => kv.split('\u0001')).sort((a, b) => b[1].length - a[1].length || a[1].localeCompare(b[1])).slice(0, 20)
  .map(([code, name]) => ({ code, name: helpers.tc(name) }));
// Every airport under its city, in both forms.
const SUBLINES = Object.keys(SUB).flatMap((code) => [
  { code, name: helpers._cityAp(helpers.tc(CITY[code] || code), code, 'en'), sub: true },
  { code, name: helpersFr._cityAp(helpers.tc(CITY_FR[code] || CITY[code] || code), code, 'fr'), sub: true },
]);
const NAMED = ['Saint-Pierre-et-Miquelon:FSP', 'Îles-de-la-Madeleine:YGR', 'Fort Lauderdale:FLL', 'Fort McMurray:YMM',
  'Kuujjuaq:YVP', 'Montréal · Trudeau:YUL', 'Toronto · Billy Bishop:YTZ', 'Montréal · Métropolitain:MET',
  'Santo Domingo:SDQ', 'Charlottetown:YYG', 'Mont-Joli:YYY']
  .map((s) => { const [name, code] = s.split(':'); return { code, name, sub: name.includes(' · ') }; });
const NAMES = [...LONGEST, ...SUBLINES, ...NAMED];

// A run of text as the page lays it: characters with their size factor, a
// break allowed after a space and after a hyphen that has a letter on both
// sides, never at a no-break space. 'unit' text (a whole phrase) breaks only
// when `loose`.
function layout(parts, px, wrap, loose, s, fontW, sub) {
  const cw = (c) => (fontW[c] != null ? fontW[c] : (fontW[c.toLowerCase()] != null ? fontW[c.toLowerCase()] : 0.62));
  const subPx = (k) => (k === 1 ? px : Math.max(px * k, s.cssFloor));
  // tokens: [{w, trail}] — w without its trailing space, trail the space's width
  const toks = []; let cur = 0, prevCh = '';
  const flat = [];
  for (const p of parts) for (const c of p.text) flat.push({ c, k: p.k || 1, unit: !!p.unit, ap: !!p.ap });
  for (let i = 0; i < flat.length; i++) {
    const { c, k, unit, ap } = flat[i];
    // the airport's name at the size the fitter gave it (sub), or its own step
    const sz = (ap && sub) ? sub : subPx(k), w = cw(c) * sz + s.ls * sz;
    const next = flat[i + 1] ? flat[i + 1].c : '';
    const spaceBreak = c === ' ' && (!unit || loose);
    const hyphenBreak = c === '-' && /\p{L}/u.test(prevCh) && /\p{L}/u.test(next);
    if (spaceBreak) { toks.push({ w: cur, trail: w }); cur = 0; }
    else { cur += w; if (hyphenBreak) { toks.push({ w: cur, trail: 0 }); cur = 0; } }
    prevCh = c;
  }
  toks.push({ w: cur, trail: 0 });
  if (!wrap) return { lines: 1, widths: [toks.reduce((a, t, i) => a + t.w + (i < toks.length - 1 ? t.trail : 0), 0)] };
  const widths = []; let line = 0, pend = 0;
  for (const t of toks) {
    if (line > 0 && line + pend + t.w > s.w) { widths.push(line); line = t.w; }
    else line += pend + t.w;
    pend = t.trail;
  }
  widths.push(line);
  return { lines: widths.length, widths };
}
function partsFor(shape, nm) {
  const city = nm.sub ? nm.name.slice(0, nm.name.lastIndexOf(' · ')) : nm.name;
  const ap = nm.sub ? [{ text: ' ' }, { text: '·\u00a0' + nm.name.slice(nm.name.lastIndexOf(' · ') + 3), k: 0.8, glue: true, ap: true }] : [];
  // an under-name is one piece: its spaces do not break
  const glue = (ps) => ps.map((p) => (p.glue ? { ...p, text: p.text.replace(/ /g, '\u00a0') } : p));
  switch (shape) {
    case 'board': return glue([{ text: city }, ...ap, { text: '\u00a0|\u00a0' + nm.code }]);
    case 'belt': return glue([{ text: city }, ...ap, { text: '\u00a0|\u00a0' + nm.code }]);
    case 'plate': return glue([{ text: city }, ...ap, { text: '\u00a0' + nm.code, k: 0.62 }]);
    case 'dest': return glue([{ text: city }, ...ap]);
    case 'note': return [{ text: 'From ' + nm.name + ' · 4:33pm', unit: true }, { text: '\u00a0| ' }, { text: 'De ' + nm.name + ' · 16:33', unit: true }];
    case 'cap': return [{ text: 'Arriving From | Provenant de · PD2381 · ' + nm.name + ' | ' + nm.code }];
    default: throw new Error('shape ' + shape);
  }
}

test('the fixture is the boards\' own geometry, at every size, for every surface that holds a name', () => {
  const sizes = new Set(MODEL.surfaces.map((s) => s.size));
  for (const z of ['1680x1050', '1920x1080', '1280x720', '1080x1920']) assert.ok(sizes.has(z), 'no geometry at ' + z);
  const shapes = new Set(MODEL.surfaces.map((s) => s.shape));
  for (const sh of ['board', 'belt', 'plate', 'dest', 'note', 'cap']) assert.ok(shapes.has(sh), 'no ' + sh + ' surface');
  for (const s of MODEL.surfaces) assert.ok(MODEL.fonts[s.font], s.surface + ' ' + s.size + ': no widths for ' + s.font);
  assert.equal(LONGEST.length, 20);
  assert.ok(LONGEST[0].name.length >= 40, 'the longest name is ' + LONGEST[0].name);
});

test('the 20 longest names in our city tables and every airport under-name fit every surface, at every size, never under the floor', () => {
  const fails = [], shrunk = [];
  let checked = 0;
  for (const s of MODEL.surfaces) {
    const fontW = MODEL.fonts[s.font];
    for (const nm of NAMES) {
      const parts = partsFor(s.shape, nm);
      const fits = (px, wrap, loose, sub) => {
        const L = layout(parts, px, wrap, loose, s, fontW, sub);
        if (L.widths.some((w) => w > s.w + 0.5)) return false;
        if (L.lines > (wrap ? (loose ? s.lines * 2 : s.lines) : 1)) return false;
        // lines at the fitter's 1.08 line height, the last one its glyphs' full height
        if (wrap && s.h && ((L.lines - 1) * 1.08 + 1.3) * px > s.h + 0.5) return false;
        return true;
      };
      const r = _fxPlan(s.base, s.floor, s.lines, !!nm.sub, !!s.units, fits);
      checked++;
      if (r.over || r.px < s.floor - 1e-9 || (r.sub && r.sub < s.floor - 1e-9) || !fits(r.px, r.wrap, r.loose, r.sub)) fails.push(`${s.surface} @${s.size}: "${nm.name}" (${r.over ? 'over at the floor' : r.px})`);
      // the airport's name never costs its city its size where the airport,
      // at the floor, has room beside the city or under it; only where even
      // that does not fit does the city come down, and then no further than
      // it must (a 1280 board's narrow destination column)
      if (nm.sub) {
        const room = fits(s.base, false, false, s.floor) || (s.lines > 1 && fits(s.base, true, false, s.floor));
        const alone = { px: room ? s.base : 0 };
        if (alone.px >= s.base - 1e-9 && r.px < s.base - 1e-9) shrunk.push(`${s.surface} @${s.size}: "${nm.name}" (${r.px} against ${s.base})`);
        // and where the city does come down, it is not for want of trying
        // the airport at the floor first
        if (!room && r.px < s.base - 1e-9 && r.sub && r.sub > s.floor + 1e-9 && !r.wrap) shrunk.push(`${s.surface} @${s.size}: "${nm.name}" airport at ${r.sub} over the floor while the city came down`);
      }
    }
  }
  assert.ok(checked > 1000, `only ${checked} cases`);
  assert.deepEqual(fails, []);
  // v23972 — a city keeps its full size beside its airport wherever the
  // airport has room at the floor
  assert.deepEqual(shrunk, []);
});

test('the decision: one line when it is close, two when they read bigger, the airport under the city first', () => {
  // a box that holds 10 units of text per pixel of type, and 2 lines of 26px
  const make = (oneLineAt, twoLinesAt) => (px, wrap) => (wrap ? px <= twoLinesAt : px <= oneLineAt);
  assert.deepEqual(_fxPlan(28, 14, 2, false, false, make(30, 30)), { px: 28, wrap: false });
  assert.equal(_fxPlan(28, 14, 2, false, false, make(24, 27)).wrap, false, '24px on one line beats 27px on two');
  assert.equal(_fxPlan(28, 14, 2, false, false, make(18, 27)).wrap, true, '18px on one line loses to 27px on two');
  assert.equal(_fxPlan(28, 14, 2, true, false, make(26, 27)).wrap, true, 'a city keeps its size: its airport goes under it');
  // v23972 — the airport gives way before the city: on a row with no second
  // line, the city stays at its size and its airport's name comes down
  // (it was the city that shrank: 'Montréal · Métropolitain' at 23.5px
  // against 28px on the other rows)
  const subAt = (cityFits, subMax) => (px, wrap, loose, sub) => !wrap && px <= cityFits && (sub || px * 0.8) <= subMax;
  const kept = _fxPlan(28, 14, 1, true, false, subAt(28, 16));
  assert.ok(kept.px === 28 && !kept.wrap && kept.sub > 15.5 && kept.sub <= 16, JSON.stringify(kept));
  assert.equal(_fxPlan(28, 14, 1, true, false, subAt(28, 10)).sub, 14, 'not under the floor: the city comes down instead');
  assert.equal(_fxPlan(28, 14, 1, true, false, subAt(28, 10)).px < 28, true);
  // with a second line, a name that would have to drop under 0.65 of its
  // city goes under the city at its own step instead
  const under = (px, wrap, loose, sub) => (wrap ? px <= 28 : (px <= 28 && (sub || px * 0.8) <= 15));
  assert.deepEqual(_fxPlan(28, 14, 2, true, false, under), { px: 28, wrap: true });
  assert.equal(_fxPlan(28, 14, 2, false, false, make(10, 10)).over, true, 'nothing at the floor: reported');
  assert.equal(_fxPlan(10, 14, 1, false, false, make(30, 30)).px, 14, 'a designed size under the floor comes up to it');
  const r = _fxPlan(28, 14, 2, false, true, (px, wrap, loose) => !!loose && px <= 20);
  assert.equal(r.loose, true, 'whole phrases are opened only when nothing else fits');
});

// ── 3. WHICH TORONTO, WHICH MONTRÉAL ───────────────────────────────────────

test('a city with two of our airports names the airport after the city', () => {
  const h = helpers, f = helpersFr;
  assert.equal(h._cityAp('Toronto', 'YTZ', 'en'), 'Toronto · Billy Bishop');
  assert.equal(h._cityAp('Toronto', 'YYZ', 'en'), 'Toronto · Pearson');
  // v23972 — Montréal keeps its accent, in English too, from our tables,
  // where a feed writes it without ('Montreal -MET')
  assert.equal(h._cityAp('Montreal', 'YUL', 'en'), 'Montréal · Trudeau');
  assert.equal(h._cityAp('Montreal', 'YHU', 'en'), 'Montréal · Métropolitain');
  assert.equal(h._cityAp('Montreal', 'MET', 'en'), 'Montréal · Métropolitain', 'the code passengers see is the same airport');
  assert.equal(h._cityAp('MONTREAL', 'YHU', 'en'), 'MONTRÉAL · Métropolitain', 'capitals stay capitals');
  assert.equal(f._cityAp('Montreal', 'YHU', 'fr'), 'Montréal · Métropolitain');
  assert.equal(CITY.YUL, 'MONTRÉAL');
  assert.equal(CITY.YHU, 'MONTRÉAL');
  assert.equal(CITY_FR.YHU, 'MONTRÉAL');
  assert.equal(h._cityAp('Londres', 'LHR', 'en'), 'Londres · Heathrow', 'another name is not respelled');
  // French first in Québec: each airport's French name
  assert.equal(f._cityAp('Toronto', 'YTZ', 'fr'), 'Toronto · Billy-Bishop');
  assert.equal(f._cityAp('Paris', 'CDG', 'fr'), 'Paris · Charles-de-Gaulle');
  assert.equal(f._cityAp('Montréal', 'YUL', 'fr'), 'Montréal · Trudeau');
  assert.equal(cityHelpers('en', true)._cityAp('Toronto', 'YTZ'), 'Toronto · Billy-Bishop', 'a Québec board takes the French form');
  assert.equal(cityHelpers('en', true)._cityAp('Toronto', 'YTZ', 'en'), 'Toronto · Billy-Bishop', 'in its English phase too');
  assert.equal(cityHelpers('en', true)._cityAp('Paris', 'CDG', 'en'), 'Paris · Charles-de-Gaulle');
  // once, and in the language asked for, however often it is formatted
  assert.equal(h._cityAp(h._cityAp('Toronto', 'YTZ', 'en'), 'YTZ', 'en'), 'Toronto · Billy Bishop');
  assert.equal(f._cityAp('Toronto · Billy Bishop', 'YTZ', 'fr'), 'Toronto · Billy-Bishop');
  // a single-airport city is unchanged
  for (const [c, n] of [['YQM', 'Moncton'], ['YHZ', 'Halifax'], ['YOW', 'Ottawa'], ['FSP', 'Saint-Pierre'], ['', 'Toronto']]) {
    assert.equal(h._cityAp(n, c, 'en'), n);
  }
});

test('only cities with two or more of the airports we show are listed', () => {
  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const byCity = {};
  for (const code of Object.keys(SUB)) {
    assert.ok(CITY[code], code + ' is not in our city table');
    (byCity[fold(CITY[code])] = byCity[fold(CITY[code])] || []).push(code);
  }
  for (const [city, codes] of Object.entries(byCity)) assert.ok(codes.length >= 2, `${city} has only ${codes.join()}`);
  // the French form is the toponymy rule for a name that honours a person
  for (const code of PERSON) assert.ok(SUB[code] && / /.test(SUB[code]), code + ' is listed as a person\'s name');
  assert.equal(helpersFr._apSubline('SDU', 'fr'), 'Santos-Dumont');
  assert.equal(helpersFr._apSubline('ORD', 'fr'), "O'Hare");
  assert.equal(helpersFr._apSubline('DCA', 'fr'), 'Reagan National', 'not a person\'s full name: as written');
  // v23972 — an airport, never what reads as a second city or a bare word
  assert.equal(SUB.DFW, 'Fort Worth Intl');
  assert.equal(SUB.PEK, 'Capital Intl');
  // the four that started it
  assert.deepEqual([SUB.YTZ, SUB.YYZ, SUB.YUL, SUB.YHU], ['Billy Bishop', 'Pearson', 'Trudeau', 'Métropolitain']);
});

test('the board row, the gate, the belts, the inbound line, the map label and the weather card all take the same words', () => {
  // the two formatters every flight's city passes through
  assert.match(fnSource('formatCityIata'), /if \(code && typeof _cityAp === 'function'\) city = _cityAp\(city, code, langOverride\);/);
  assert.match(fnSource('cityCode'), /if \(typeof _cityAp === 'function'\) _ndCity = _cityAp\(_ndCity, code, langOverride\);/);
  // and the places that read the tables themselves: the gate Destination,
  // the Your Aircraft line and the inbound cards, the map label, the weather
  assert.match(CORE, /_destCityName = _cityAp\(_destCityName, _dIata\);/);
  assert.match(CORE, /if \(typeof _cityAp === 'function'\) _origCity = _cityAp\(_origCity, _origIata\);/);
  assert.match(CORE, /\(\(typeof _cityApHtml === 'function'\) \? _cityApHtml\(_origCity\) : _origCity\)/);
  assert.equal((CORE.match(/if \(typeof _cityAp === 'function'\) _fromCity = _cityAp\(_fromCity, _fromIata\);/g) || []).length, 2);
  assert.match(CORE, /if \(city\) return _cityAp\(tc\(city\), iataCode\) \+ ' ' \+ _dispIata\(iataCode\);/);
  assert.match(fnSource('_gateMapCity'), /_cityAp\(c, iata, lg\)/);
  assert.match(CORE, /try \{ c = _cityAp\(c, iata\); \} catch \(eC3\) \{\}/);
  // as markup, the airport a step smaller and in one piece with its "·"
  assert.match(CORE, /<span class="b3-city">\$\{_cityApHtml\(_b3City\)\}<\/span>/);
  assert.match(CORE, /_label = _cityApHtml\(_cityPlain\) \+ _tailHtml\(_tailCode\.toUpperCase\(\)\);/);
  assert.match(CORE, /var _destCityHtml = _destCityName \? _cityApHtml\(_destCityName\) : _destCityName;/);
  assert.match(CORE, /var _destValue = _dfCity \|\| _destCityHtml \|\| _destIataDisp;/);
  assert.match(OVR, /\.ap-sub \{ white-space: nowrap !important; font-size: max\(0\.8em, var\(--fx-floor, 12px\)\); \}/);
  assert.match(OVR, /\.fx-brk-off \{ display: none !important; \}/);
  const html = helpers._cityApHtml('Toronto · Billy Bishop');
  assert.equal(html, 'Toronto <span class="ap-sub"><span class="ap-sep fx-brk">·\u00a0</span><span class="ap-name">Billy Bishop</span></span>');
  assert.equal(helpers._cityApHtml('From <b> · 4:33pm'), 'From &lt;b&gt; · 4:33pm', 'not an airport: escaped, left alone');
  assert.equal(helpers._cityApHtml('Saint John\'s'), 'Saint John&#39;s');
});

test('names are cased the way they are written', () => {
  const { tc } = helpers;
  assert.equal(tc('SAINT-PIERRE-ET-MIQUELON'), 'Saint-Pierre-et-Miquelon');
  assert.equal(tc('ÎLES-DE-LA-MADELEINE'), 'Îles-de-la-Madeleine');
  assert.equal(tc('RIVIÈRE-DU-LOUP'), 'Rivière-du-Loup');
  assert.equal(tc("VAL-D'OR"), "Val-d'Or");
  assert.equal(tc("L'ANSE-AU-LOUP"), "L'Anse-au-Loup");
  assert.equal(tc("ST. JOHN'S"), "St. John's");
  assert.equal(tc('FORT MCMURRAY'), 'Fort McMurray');
  // v23972 — small words between spaces too, never a first word
  assert.equal(tc('RIO DE JANEIRO'), 'Rio de Janeiro');
  assert.equal(tc('SANTA CRUZ DE LA SIERRA'), 'Santa Cruz de la Sierra');
  assert.equal(tc('FOZ DO IGUACU'), 'Foz do Iguacu');
  assert.equal(tc('PORT OF SPAIN'), 'Port of Spain');
  assert.equal(tc('MAR DEL PLATA'), 'Mar del Plata');
  assert.equal(tc('LA PAZ'), 'La Paz');
  assert.equal(tc('DES MOINES'), 'Des Moines');
  assert.equal(tc('LOS ANGELES'), 'Los Angeles');
  assert.equal(tc('RIO DE JANEIRO · Santos Dumont'), 'Rio de Janeiro · Santos Dumont');
  assert.equal(tc('TORONTO · Billy Bishop'), 'Toronto · Billy Bishop');
  assert.equal(tc("CHICAGO · O'Hare"), "Chicago · O'Hare");
  assert.equal(tc('NEW YORK · LaGuardia'), 'New York · LaGuardia');
  assert.equal(tc('PARIS · Charles-de-Gaulle'), 'Paris · Charles-de-Gaulle');
  // spelled out and accented in the tables
  assert.equal(CITY.FLL, 'FORT LAUDERDALE');
  assert.equal(CITY_FR.FLL, 'FORT LAUDERDALE');
  assert.equal(CITY.YGR, 'ÎLES-DE-LA-MADELEINE');
  // the airport's current name: Montréal-Métropolitain (Saint-Hubert is the old one)
  assert.match(CORE, /YHU:\{ name:'Montréal Metropolitan Airport \(MET\)'/);
  assert.match(CORE, /\{c:'YHU',n:'Montréal Métropolitain \(MET\)'\}/);
  assert.match(read('js/feed-router.js'), /const home = \{ iata: 'YHU', icao: 'CYHU', name: 'Montréal Métropolitain' \};/);
});

// ── 4. THE SECOND PASS (v23972) ────────────────────────────────────────────
//
// What a review of v23962 found still cut, or wrong, measured on the boards
// with headless Chrome: the map's stand label spilling out of its own pill,
// the boarding Destination dropping its airport, the belt sign's second
// language (a ::after) cut on every portrait belt, a portrait board's carrier
// header and its header clock and date, the 1280 aircraft caption with a
// typed operator, the weather card's '· VISIBILIDADE', the airport name
// costing its city the size, and Montréal without its accent.

const rulesSrc = () => CORE.slice(CORE.indexOf('var FIDS_FIT_RULES = ['), CORE.indexOf('\n];', CORE.indexOf('var FIDS_FIT_RULES = [')));

test('a hung label is held inside its own pill, and the pill inside the map', () => {
  // the pill's border box, not its letters, is what is slid inside the map
  assert.match(fnSource('_fxNudge'), /var pr = el\.getBoundingClientRect\(\);/);
  // and its text is measured against the pill too, so the pair stacks
  // rather than spill out of it ('… · 06:10' 18px past the pill at 1920)
  assert.match(fnSource('fidsFitText'), /if \(m\.ok && o\.nudge\) \{\s*var mo = _fxMeasure\(el, el, 0, false\);/);
  // stacked, it hugs its two lines: one language a line, the bar gone
  assert.match(OVR, /\.gate-map-note\.fx-wrap:not\(\.fx-loose\) > \.fx-unit \{ display: block !important; \}/);
  assert.match(OVR, /\.gate-map-note\.fx-wrap:not\(\.fx-loose\) > \.fx-brk \{ display: none !important; \}/);
});

test('the boarding row\'s Destination is the rail\'s: the airport, the casing, the box rule', () => {
  const row = fnSource('_boardInfoRowHtml');
  assert.match(row, /_bDest = \(typeof _cityForIata === 'function' \? _cityForIata\(_bdIata\) : ''\)/);
  assert.match(row, /_bDest = normalizeDisplayCity\(_bDest, _bdIata\);/);
  assert.match(row, /_bDest = _cityAp\(_bDest, _bdIata\);/);
  assert.match(row, /_bDest = _cityApHtml\(_bDest\);/);
  assert.doesNotMatch(row, /CITY\[locIata\]/, 'no table read of its own');
  assert.match(row, /'<div class="v2-fi-value' \+ \(icon === 'ac-ico-dest' \? ' v2-fi-dest' : ''\) \+ '">'/);
});

test('every name and title the review found is handed to the one fitter', () => {
  const r = rulesSrc();
  assert.match(r, /\{ sel: '\.bidsv2-carousel-label', lines: 2, group: '\.bidsv2-carousel-block' \}/);
  assert.match(r, /\{ sel: '\.fids-banner-board \.fids-board-label > span', box: '\.fids-banner-board', lines: 1, group: '\.fids-board-label',/);
  assert.match(r, /\{ sel: '\.fids-banner-time-block \.fids-banner-date', box: '\.fids-banner-time-block', lines: 2, units: true,/);
  assert.match(r, /avoid: '\.fids-airport-logo-img, \.fids-airport-text, \.fids-airport-pill:not\(\.has-logo\)', avoidIn: '\.fids-banner'/);
  // a header's words may use its cell's padding, down as well as across
  assert.match(r, /\{ sel: '#fidsTable thead th', lines: 2, pad: true, h: function \(el\) \{ var tr = el\.closest\('tr'\); return tr \? Math\.max\(0, tr\.clientHeight - 2\) : 0; \} \}/);
  // the lines of one sign share one size, the smallest any needed
  assert.match(fnSource('fidsFitAll'), /if \(r\.group && fr && fr\.px\)/);
  assert.match(fnSource('fidsFitAll'), /ge\[b\]\.style\.setProperty\('font-size', mn \+ 'px', 'important'\);/);
  // what the artwork beside a title takes is off its box
  assert.match(fnSource('_fxAvoidCap'), /if \(\(r\.left \+ r\.right\) \/ 2 >= mid\)/);
  assert.match(fnSource('_fxMeasure'), /if \(cap\.r != null && cap\.r < ib\.r\) ib\.r = cap\.r;/);
});

test('the belt sign\'s second language is a line of the band, not a ::after', () => {
  assert.match(CORE, /'<div class="bidsv2-carousel-label bidsv2-carousel-label2">' \+ fidsEscHtml\(_crslW2\) \+ '<\/div>'/);
  assert.match(CORE, /'<div class="bidsv2-carousel-block' \+ \(_crslL2 \? ' has-l2el' : ''\) \+ '"/);
  assert.match(OVR, /\.bidsv3 \.bidsv2-carousel-block\.has-l2el::after \{\s*content: none !important;\s*display: none !important;/);
  assert.match(OVR, /\.bidsv3 \.bidsv2-carousel-label\.bidsv2-carousel-label2 \{\s*grid-row: 2 !important;/);
  assert.match(OVR, /\.bidsv3 \.bidsv2-carousel-block \{\s*grid-template-columns: minmax\(0, 1fr\) !important;/);
});

test('a portrait board\'s carrier column has no header word at all', () => {
  assert.match(CORE, /const _alHdr = _hdrPortrait \? '' : _T\('airline'\);/);
  assert.equal((CORE.match(/\{ cls: 'col-airline',  txt: _alHdr  \}/g) || []).length, 2);
});

test('the header date is two whole phrases, one language each, when it must stack', () => {
  const d = fnSource('_ocClockDate');
  assert.match(d, /return '<span class="fx-unit">' \+ w \+ '<\/span>';/);
  assert.match(d, /\.join\(' <span class="cl-sep fx-brk">\|<\/span> '\)/);
});

test('the aircraft caption puts its operator under the aircraft before it opens the model', () => {
  const at = CORE.indexOf('function _fitTypePanel(el) {');
  const src = CORE.slice(at, CORE.indexOf("root.querySelectorAll('.gad-map-col-v2 .v2-rc-acb-actype').forEach", at));
  const stack = src.indexOf("_capEl.classList.add('acb-stack');"), open = src.indexOf('// 7b. A model that still does not fit');
  assert.ok(stack > 0 && open > stack, 'step 7a (stack) comes before 7b (open)');
  assert.ok(src.indexOf("_capEl.classList.remove('acb-stack')") > 0, 'and is cleared before each pass');
  const capRule = OVR.slice(OVR.indexOf('.v2-rc-acb-cap.acb-stack {'), OVR.indexOf('}', OVR.indexOf('.v2-rc-acb-cap.acb-stack {')));
  assert.match(capRule, /flex-direction: column !important;/);
  // past 255 ids Chrome counts no more: the classes decide, and these carry
  // more of them than the row rules they override
  const line = OVR.split('\n').find((l) => l.includes('.v2-rc-acb-cap.acb-stack {'));
  assert.ok((line.match(/:not\(\._\)/g) || []).length >= 12, 'the stacked caption out-ranks the ×255 + 6 row rules');
  // the model is written as its unbreakable parts: never inside 'Dash 8-400'
  const groups = new Function('return (' + fnSource('_acbModelGroups') + ');')();
  assert.deepEqual(groups('De Havilland Dash 8-400'), ['De Havilland', 'Dash 8-400']);
  assert.deepEqual(groups('Boeing 737 MAX 8'), ['Boeing 737', 'MAX 8']);
  assert.deepEqual(groups('Airbus A220-300'), ['Airbus A220-300']);
  assert.equal((CORE.match(/_acTypeVal = _nbwModel\(_acModel\)/g) || []).length, 3);
});

test('the "expected" qualifier speaks the board\'s languages, all nine', () => {
  const t = vm.runInNewContext('(' + CORE.slice(CORE.indexOf('acExpected:{') + 'acExpected:'.length, CORE.indexOf('},', CORE.indexOf('acExpected:{')) + 1) + ')');
  for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(t[l] && t[l].trim(), 'acExpected.' + l);
  const code = CORE.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /expected <span class="v2-rc-fi-sep">\|<\/span> prévu|'expected \| prévu'|expected \| prévu<\/span>|\(expected \| prévu\)/);
  assert.ok((CORE.match(/_acExpectedHtml\(/g) || []).length >= 5);
});

test('the weather card\'s words: the amber dot stays with its word, a long one gives up its tracking', () => {
  assert.match(OVR, /\.wxcard-wrap \.wxc-l2::before \{ content: ' ·\\00a0' !important;/);
  assert.match(fnSource('_fxGuard'), /st\.setProperty\('letter-spacing', '0px', 'important'\);/);
  // and the plate's city may take its second line (the name was held nowrap)
  assert.match(OVR, /\.wxcard-wrap \.wxc-mon-city\.fx-wrap \.wxc-mon-name \{ white-space: normal !important; \}/);
});
