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
// The airport under-names are data in the airport table (AP's `sub`, and
// `subKey` for a name the store writes in each language); AIRPORT_SUBLINE is
// the index built from them at load (_apSublineTable), here with the store.
const BS = require('../fids-current/js/board-strings.js');
const AP_SRC = tableSource('const AP = {');
const SUB_SRC = '(' + fnSource('_apSublineTable') + ')(' + AP_SRC + ')';
const SUB = new Function('BoardStrings', 'return ' + SUB_SRC + ';')(BS);
const PERSON = vm.runInNewContext(CORE.slice(CORE.indexOf('var AIRPORT_SUBLINE_PERSON = ') + 'var AIRPORT_SUBLINE_PERSON = '.length, CORE.indexOf(';', CORE.indexOf('var AIRPORT_SUBLINE_PERSON = '))));

// The fitter's pure half, lifted out of the page.
const _fxSearch = new Function('return (' + fnSource('_fxSearch') + ');')();
const _fxApMin = new Function('return (' + fnSource('_fxApMin') + ');')();
const _fxPlan = new Function('_fxSearch', '_fxApMin', 'return (' + fnSource('_fxPlan') + ');')(_fxSearch, _fxApMin);
const floorAt = (w, h) => new Function('window', 'return (' + fnSource('fidsFitFloor') + ')();')({ innerWidth: w, innerHeight: h });

// The city helpers, with the tables they read.
function cityHelpers(langNow, frFirst) {
  const src = [
    'var AIRPORT_SUBLINE = ' + SUB_SRC + ';',
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
    fnSource('_apSublineForms'), fnSource('_apSublineNames'), fnSource('_apQcBoard'), fnSource('_apSubLang'), fnSource('_apSubline'),
    fnSource('_apCitySpelling'), fnSource('_cityAp'), fnSource('_cityApHtml'), fnSource('tc'),
    'return { _cityAp, _cityApHtml, _apSubline, tc };'
  ].join('\n');
  return new Function('BoardStrings', src)(BS);
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
    '.v2-fi-mline1', '.v2-rc-fi-tval', '.octb-date',                                         // held to the floor
    '.g8-band .g8-band-ln'                                                                    // the boarding screen's band (v24006)
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
      const fits = (px, wrap, loose, sub, under) => {
        // v23998 — an airport that has given way is not drawn (-1); every
        // surface modelled here carries its code already ('| YTZ')
        if (sub < 0) return fitsParts(parts.filter((p) => !p.ap), px, wrap, loose, 0, false);
        return fitsParts(parts, px, wrap, loose, sub, under);
      };
      const fitsParts = (parts, px, wrap, loose, sub, under) => {
        // v23997 — the airport forced under its city: the city's line, then
        // the airport's (with what follows it), each measured as one line
        if (under) {
          const at = parts.findIndex((p) => p.ap);
          if (at < 0) return false;
          const one = (ps) => layout(ps, px, false, false, s, fontW, sub).widths[0];
          const ap = Object.assign({}, parts[at], { text: parts[at].text.replace(/^·\u00a0/, '') });
          if (one(parts.slice(0, at)) > s.w + 0.5 || one([ap, ...parts.slice(at + 1)]) > s.w + 0.5) return false;
          if (s.lines < 2) return false;
          if (s.h && (1.08 + 1.3) * px > s.h + 0.5) return false;
          return true;
        }
        const L = layout(parts, px, wrap, loose, s, fontW, sub);
        if (L.widths.some((w) => w > s.w + 0.5)) return false;
        if (L.lines > (wrap ? (loose ? s.lines * 2 : s.lines) : 1)) return false;
        // lines at the fitter's 1.08 line height, the last one its glyphs' full height
        if (wrap && s.h && ((L.lines - 1) * 1.08 + 1.3) * px > s.h + 0.5) return false;
        return true;
      };
      const r = _fxPlan(s.base, s.floor, s.lines, !!nm.sub, !!s.units, fits);
      checked++;
      if (r.over || r.px < s.floor - 1e-9 || (r.sub > 0 && r.sub < s.floor - 1e-9) || !fits(r.px, r.wrap, r.loose, r.sub, r.under)) fails.push(`${s.surface} @${s.size}: "${nm.name}" (${r.over ? 'over at the floor' : r.px})`);
      if (nm.sub) {
        // v23998 — THE CITY KEEPS ITS SIZE. Wherever the city alone fits its
        // box at its size, it has that size with its airport's name or
        // without it: the airport gives way, never the city.
        const alone = fits(s.base, false, false, -1);
        if (alone && r.px < s.base - 1e-9) shrunk.push(`${s.surface} @${s.size}: "${nm.name}" city at ${r.px} against ${s.base}`);
        // the airport is drawn at no less than its smallest (0.6 of its city,
        // never under the floor) …
        if (r.sub > 0 && r.sub < _fxApMin(r.px, s.floor) - 1e-9) shrunk.push(`${s.surface} @${s.size}: "${nm.name}" airport at ${r.sub} beside a ${r.px} city`);
        // … and gives way only where it has no room at that size, beside its
        // city or under it
        const min = _fxApMin(r.px, s.floor);
        if (r.sub === -1 && !r.wrap && r.px >= s.base - 1e-9
            && (fits(r.px, false, false, min) || (s.lines > 1 && fits(r.px, true, false, min, true)))) shrunk.push(`${s.surface} @${s.size}: "${nm.name}" airport given way with room at ${min}`);
        // and is never left smaller than the room beside its city allows
        if (!r.over && r.sub > 0 && r.sub < r.px * 0.8 - 1 && !r.under && fits(r.px, r.wrap, r.loose, r.sub + 1)) shrunk.push(`${s.surface} @${s.size}: "${nm.name}" airport at ${r.sub} beside a ${r.px} city with room for more`);
      }
    }
  }
  assert.ok(checked > 1000, `only ${checked} cases`);
  assert.deepEqual(fails, []);
  assert.deepEqual(shrunk, []);
});

test('the decision: one line when it is close, two when they read bigger, the airport under the city first', () => {
  // a box that holds 10 units of text per pixel of type, and 2 lines of 26px
  const make = (oneLineAt, twoLinesAt) => (px, wrap) => (wrap ? px <= twoLinesAt : px <= oneLineAt);
  assert.deepEqual(_fxPlan(28, 14, 2, false, false, make(30, 30)), { px: 28, wrap: false });
  assert.equal(_fxPlan(28, 14, 2, false, false, make(24, 27)).wrap, false, '24px on one line beats 27px on two');
  assert.equal(_fxPlan(28, 14, 2, false, false, make(18, 27)).wrap, true, '18px on one line loses to 27px on two');
  // v23998 — a city keeps its size: its airport goes under it, at the
  // city's full size, where it has no room beside it
  const two = (px, wrap, loose, sub, under) => px <= 28 && (wrap ? !!under : sub === -1);
  const u2 = _fxPlan(28, 14, 2, true, false, two);
  assert.ok(u2.px === 28 && u2.wrap && u2.under && u2.sub >= 22 && u2.sub <= 22.4, JSON.stringify(u2));
  // v23972 — the airport gives way before the city: on a row with no second
  // line, the city stays at its size and its airport's name comes down
  // (it was the city that shrank: 'Montréal · Métropolitain' at 23.5px
  // against 28px on the other rows)
  const subAt = (cityFits, subMax) => (px, wrap, loose, sub) => !wrap && px <= cityFits && (sub || px * 0.8) <= subMax;
  const kept = _fxPlan(28, 14, 1, true, false, subAt(28, 18));
  assert.ok(kept.px === 28 && !kept.wrap && kept.sub > 17.5 && kept.sub <= 18, JSON.stringify(kept));
  // v23998 — and no smaller than its smallest (0.6 of the city: 16.8px of
  // 28): under that it gives way whole and the city keeps its size. v23997
  // brought the city down until the airport held the floor beside it.
  assert.equal(_fxApMin(28, 14), 16.75 + 0.25);
  assert.equal(_fxApMin(21.76, 12), 13.25);
  assert.equal(_fxApMin(16, 13.75), 13.75, 'never under the floor');
  assert.equal(_fxApMin(14, 13.75), 13.75, 'nor over its own step');
  assert.deepEqual(_fxPlan(28, 14, 1, true, false, subAt(28, 16)), { px: 28, wrap: false, sub: -1 }, 'under its smallest: it gives way');
  assert.deepEqual(_fxPlan(28, 14, 1, true, false, subAt(28, 10)), { px: 28, wrap: false, sub: -1 }, 'not under the floor: it gives way, the city keeps its size');
  // to its code where its line has none of its own (the strip)
  assert.equal(_fxPlan(28, 14, 1, true, false, subAt(28, 10), -2).sub, -2);
  // with a second line, a name that has no room beside its city goes under
  // the city at its own step
  const under = (px, wrap, loose, sub) => (wrap ? px <= 28 : (px <= 28 && (sub || px * 0.8) <= 15));
  const u3 = _fxPlan(28, 14, 2, true, false, under);
  assert.ok(u3.px === 28 && u3.wrap && u3.under && u3.sub >= 22, JSON.stringify(u3));
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
  // a city whose other airport names itself after it ('DALLAS/FORT WORTH')
  for (const code of Object.keys(CITY)) {
    const head = fold(CITY[code]).split('/')[0];
    if (head !== fold(CITY[code]) && byCity[head] && !byCity[head].includes(code)) byCity[head].push(code);
  }
  for (const [city, codes] of Object.entries(byCity)) assert.ok(codes.length >= 2, `${city} has only ${codes.join()}`);
  // the French form is the toponymy rule for a name that honours a person
  for (const code of PERSON) assert.ok(SUB[code] && / /.test(SUB[code]), code + ' is listed as a person\'s name');
  assert.equal(helpersFr._apSubline('SDU', 'fr'), 'Santos-Dumont');
  assert.equal(helpersFr._apSubline('ORD', 'fr'), "O'Hare");
  assert.equal(helpersFr._apSubline('DCA', 'fr'), 'Reagan National', 'not a person\'s full name: as written');
  // v23972 — an airport, never what reads as a second city or a bare word
  // (written out in full: 'Intl' is no word of a name table, and an
  // abbreviation is no board language's word either)
  assert.equal(SUB.PEK, 'Capital International');
  // v23986 — Dallas/Fort Worth names its own city, as the airport writes it
  // ('Fort Worth Intl' after 'Dallas' still read as a second city); Love
  // Field is named beside it
  assert.ok(!('DFW' in SUB));
  assert.equal(CITY.DFW, 'DALLAS/FORT WORTH');
  assert.equal(CITY_FR.DFW, 'DALLAS/FORT WORTH');
  assert.equal(SUB.DAL, 'Love Field');
  assert.equal(helpers.tc(CITY.DFW), 'Dallas/Fort Worth');
  // one city, one spelling: São Paulo for both of its airports
  assert.equal(CITY.GRU, 'SÃO PAULO');
  assert.equal(CITY.CGH, 'SÃO PAULO');
  assert.equal(CITY_FR.GRU, 'SÃO PAULO');
  assert.match(read('js/shared-names.js'), /GRU:'SÃO PAULO'/);
  assert.equal(helpers._cityAp('Sao Paulo', 'GRU', 'en'), 'São Paulo · Guarulhos', 'a feed\'s unaccented spelling takes the table\'s');
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
  assert.match(CORE, /\(\(typeof _cityApHtml === 'function'\) \? _cityApHtml\(_origCity, _origIata\) : _origCity\)/);
  assert.equal((CORE.match(/if \(typeof _cityAp === 'function'\) _fromCity = _cityAp\(_fromCity, _fromIata\);/g) || []).length, 2);
  assert.match(CORE, /if \(city\) return _cityAp\(tc\(city\), iataCode\) \+ ' ' \+ _dispIata\(iataCode\);/);
  assert.match(fnSource('_gateMapCity'), /_cityAp\(c, iata, lg\)/);
  assert.match(CORE, /try \{ c = _cityAp\(c, iata\); \} catch \(eC3\) \{\}/);
  // as markup, the airport a step smaller and in one piece with its "·"
  assert.match(CORE, /<span class="b3-city">\$\{_cityApHtml\(_b3City, _b3Code, false, !!_b3Code\)\}<\/span>/);
  assert.match(CORE, /_label = _cityApHtml\(_cityPlain, _tailCode, false, true\) \+ _tailHtml\(_tailCode\.toUpperCase\(\)\);/);
  assert.match(CORE, /_label = _cityApHtml\(cityDisp, _iataUp, false, true\) \+ _tailHtml\(_iataUp\);/);
  // v24014 — the weather card: the destination's band ties its code on, and
  // each plate writes its city and, on the line under it, its airport, cut
  // from the same words at the same ' · ' _cityApHtml splits at
  assert.match(CORE, /'<div class="wxc-sc-city"><span class="wxc-sc-name">' \+ _cityApHtml\(_wxCityOf\(dest\), dest, false, true\) \+ '<\/span>\\u00a0<span class="wxc-sc-chip">'/);
  assert.match(CORE, /var s = String\(_wxCityOf\(iata\) \|\| ''\), i = s\.lastIndexOf\(' · '\);/);
  assert.match(CORE, /try \{ names = _apSublineNames\(\) \|\| \{\}; \}/);
  assert.match(CORE, /'<div class="wxc-mon-city"><span class="wxc-mon-name">' \+ cp\.city \+ '<\/span><\/div>'/);
  assert.match(CORE, /'<div class="wxc-mon-subl">' \+ \(cp\.ap \? '<span class="wxc-mon-ap">' \+ cp\.ap \+ '<\/span>' : ''\) \+ '<span class="wxc-mon-iata">'/);
  assert.match(CORE, /var _destCityHtml = _destCityName \? _cityApHtml\(_destCityName, _dIata\) : _destCityName;/);
  assert.match(CORE, /var _destValue = _dfCity \|\| _destCityHtml \|\| _destIataDisp;/);
  assert.match(OVR, /\.ap-sub \{ white-space: nowrap !important; font-size: max\(0\.8em, var\(--fx-floor, 12px\)\); \}/);
  // v23986 — a separator the line broke at goes, and its break stays: the
  // next words start their line on a forced break, so the width it gave back
  // cannot pull them up onto the city's line ('Toronto Pearson')
  assert.match(OVR, /:root:not\(#_\) \.fx-brk\.fx-brk-off \{ display: none !important; \}/);
  assert.match(OVR, /:root:not\(#_\) \.fx-brk\.fx-brk-off \+ :is\(\.ap-name, \.fx-unit\)::before \{ content: "\\A"; white-space: pre; \}/);
  const html = helpers._cityApHtml('Toronto · Billy Bishop');
  assert.equal(html, 'Toronto <span class="ap-sub"><span class="ap-sep fx-brk">·\u00a0</span><span class="ap-name">Billy Bishop</span></span>');
  // v23999 — where a code is tied on after the city with a no-break space
  // (tied), the space before the airport is its own span and goes with the
  // airport when the airport gives way: left behind, it stood beside the
  // no-break space ('Toronto  | YTZ'), and the line could break there,
  // before the code. Everywhere else the markup is as it was.
  assert.equal(helpers._cityApHtml('Toronto · Billy Bishop', 'YTZ', false, true),
    'Toronto<span class="ap-gap"> </span><span class="ap-sub" data-ap="YTZ"><span class="ap-sep fx-brk">·\u00a0</span><span class="ap-name">Billy Bishop</span></span>');
  assert.equal(helpers._cityApHtml('Ottawa', 'YOW', false, true), 'Ottawa', 'no airport: no span');
  assert.match(OVR, /:root:not\(#_\) \.ap-gap\.ap-gap-off \{ display: none !important; \}/);
  const off = fnSource('_apSubOff');
  assert.match(off, /sub\.classList\.toggle\('ap-sub-off', !!off\);/);
  assert.match(off, /var g = sub\.previousElementSibling;\s*if \(g && g\.classList && g\.classList\.contains\('ap-gap'\)\) g\.classList\.toggle\('ap-gap-off', !!off\);/);
  // every place that gives an airport's name way goes through it, so the
  // space never stays behind
  assert.doesNotMatch(CORE, /classList\.(add|remove)\('ap-sub-off'\)/);
  assert.equal((CORE.match(/classList\.toggle\('ap-sub-off'/g) || []).length, 1);
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
  assert.match(row, /_bDest = _cityApHtml\(_bDest, _bdIata\);/);
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

test('the aircraft caption stays one row: it narrows, then opens the model, never stacks', () => {
  // v24004 — step 7a (v23972) put the operator under the aircraft, two
  // full-width rows; the gate caption is one row (v23904), so it is gone. A
  // known model's row narrows its type (87.5%) before the model opens at its
  // own spaces; then the operator's labels stand over its mark inside its
  // own half, the model's labels over the model inside its, and an operator
  // shown by name opens at its spaces last; the band grows for that, never
  // into two rows.
  const at = CORE.indexOf('function _fitTypePanel(el) {');
  const src = CORE.slice(at, CORE.indexOf("root.querySelectorAll('.gad-map-col-v2 .v2-rc-acb-actype').forEach", at));
  assert.doesNotMatch(src, /acb-stack/, 'no stacked caption');
  assert.doesNotMatch(OVR, /\.v2-rc-acb-cap\.acb-stack/, 'and no stacked layout');
  const narrow = src.indexOf("if (!_pending && !_fits()) {\n                _capEl.classList.add('acb-narrow');"),
    open = src.indexOf("el.style.setProperty('white-space', 'normal', 'important');", narrow),
    opstack = src.indexOf("_capEl.classList.add('acb-opstack');"), acstack = src.indexOf("_capEl.classList.add('acb-acstack');"),
    name = src.indexOf("_nameEl.style.setProperty('text-wrap', 'balance', 'important');");
  assert.ok(narrow > 0 && open > narrow && opstack > open && acstack > opstack && name > acstack, 'narrow, open, the two tiers, the name, in that order');
  // past 255 ids Chrome counts no more: the classes decide, and the widths
  // carry more of them than the row rules they override
  const line = OVR.split('\n').find((l) => l.includes('.v2-rc-acb-cap.acb-narrow :is(div, span, b) {'));
  assert.ok(line && (line.match(/:not\(\._\)/g) || []).length >= 13, 'the narrowed caption out-ranks the ×255 + 12 row rules');
  // the model is written as its unbreakable parts: never inside 'Dash 8-400'
  const groups = new Function('return (' + fnSource('_acbModelGroups') + ');')();
  assert.deepEqual(groups('De Havilland Dash 8-400'), ['De Havilland', 'Dash 8-400']);
  assert.deepEqual(groups('Boeing 737 MAX 8'), ['Boeing 737', 'MAX 8']);
  assert.deepEqual(groups('Airbus A220-300'), ['Airbus A220-300']);
  assert.equal((CORE.match(/_acTypeVal = _nbwModel\(_acModel\)/g) || []).length, 3);
});

test('the "expected" qualifier speaks the board\'s languages, all nine', () => {
  // the store's word (board-strings.js), the one every surface reads
  const t = BS.entry('expected');
  for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(t[l] && t[l].trim(), 'expected.' + l);
  assert.match(fnSource('_acExpectedHtml'), /BoardStrings\.pair\('expected'/);
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

// ── 5. THE THIRD PASS (v23986) ─────────────────────────────────────────────
//
// What the review of v23972 found, measured on the boards: the "·" dropped
// while the airport stayed on its city's line ('Toronto Pearson', 'Chicago
// O'Hare | ORD'), the airport name still costing its city the size on every
// portrait board and at 1680 (the destination column was held to 20% of the
// table), the airport at the floor beside a full-size city in a column with
// room to spare, an operator's mark squeezed under its own label, and the
// pending words under the floor.

test('a separator dropped at a break keeps the break, and is measured at the size that is kept', () => {
  // every fitter puts the separators back before it measures
  assert.match(fnSource('fidsFitText'), /_fxBrkClear\(el\);\s*\/\/ An airport's name after the city/);
  assert.match(fnSource('_fxGuard'), /_fxBrkClear\(el\);\s*var m0 = _fxMeasure\(el, box, hm\);/);
  assert.match(fnSource('_fxGuard'), /_fxBreakSeps\(el, !!el\.__fxGuardWrap\);\s*el\.classList\.add\('fx-fit'\);/);
  // the gate's Destination: wrapped only if it really is on two lines at the
  // size it keeps, and its separators measured at that size, not at the
  // search's last, larger probe
  const box = CORE.slice(CORE.indexOf('function _boxAssign('), CORE.indexOf('function _plateInset('));
  assert.match(box, /_fxBrkClear\(el\);\s*var _wrapOk = /);
  assert.match(box, /&& _twoAt\(_wPx\)\) \{\s*_finPx = _wPx;\s*_cityTwo = true;\s*el\.style\.setProperty\('font-size', _finPx \+ 'px', 'important'\);\s*_fxBreakSeps\(el, true\);/);
  assert.match(box, /el\.style\.setProperty\('font-size', _finPx \+ 'px', 'important'\);\s*_fxBreakSeps\(el, false\);/);
});

test('the decision: the airport takes back what its city\'s size leaves it, and goes under the city when that reads bigger', () => {
  // a 36px board row: the city cannot have 28px whatever the airport's size
  // (the text is taller than the row), and the column has room to spare
  const tall = (px, wrap, loose, sub) => !wrap && px <= 27.5 && px * 5 + (sub || px * 0.8) * 6 <= 300;
  const r = _fxPlan(28, 13.75, 2, true, false, tall);
  assert.ok(r.px >= 27.25 && r.px <= 27.5 && !r.wrap, JSON.stringify(r));
  assert.ok(r.sub >= r.px * 0.8 - 0.5, 'the airport at its own step, not the floor: ' + JSON.stringify(r));
  // a plate with a second line: under the city at 20px beats beside it at 15
  const plate = (px, wrap, loose, sub) => px <= 28 && (wrap ? (sub || px * 0.8) <= 20 : (sub || px * 0.8) <= 15);
  const under = _fxPlan(28, 14, 2, true, false, plate);
  assert.ok(under.px === 28 && under.wrap && under.sub > 19.5 && under.sub <= 20, JSON.stringify(under));
  // a row with no second line keeps it beside the city
  assert.equal(_fxPlan(28, 14, 1, true, false, plate).wrap, false);
});

test('the board\'s Destination takes what is left; the mark and the status keep the widths they had', () => {
  assert.match(FD, /#fidsTable thead th\.col-dest\s+\{ width: auto !important; \}/);
  assert.match(FD, /#fidsTable colgroup col\.col-term\s+\{ width: clamp\(68px, calc\(12\.25vw - 89px\), 120px\) !important; \}/);
  const dc = fnSource('_fidsDestColumn');
  // v23998 — the flight number keeps its width too ('EW97…' on the ZRH board)
  assert.match(dc, /tbl\.querySelectorAll\('colgroup col\.col-airline, colgroup col\.col-flight, colgroup col\.col-status'\)/);
  assert.match(rulesSrc(), /\{ sel: '#fidsTable tbody td\.td-flight', lines: 1 \}/);
  assert.match(dc, /var s = \(W \* \(term \? 0\.73 : 0\.8\)\) \/ sum;/);
  assert.match(dc, /if \(de\.classList\.contains\('fids-portrait'\) \|\| !\(W > 0\)\) return;/);
  assert.match(fnSource('fidsFitAll'), /_fidsDestColumn\(\);\s*_fxApRelang\(root\);/);
  // one line is the row's own type; the row's height bounds the wrapped form
  assert.match(rulesSrc(), /\{ sel: '#fidsTable tbody td\.td-dest', lines: 2, h: _fxBoardCellH, hWrap: true \}/);
  assert.match(fnSource('fidsFitText'), /var m = _fxMeasure\(el, box, \(wrap \|\| !o\.hWrap\) \? hm : 0, !!o\.pad, cap\);/);
  // portrait: the weather keeps what its temperature needs
  assert.match(OVR, /:root\.fids-portrait:not\(#_\) #fidsTable colgroup col\.col-wx \{ width: 110px !important; min-width: 0 !important; \}/);
});

test('the pending words are never under the floor, and the big map names the airport in the phase showing', () => {
  assert.equal((OVR.match(/font-size: max\(var\(--fx-floor, 12px\), calc\(var\(--acb-h\) \* 0\.28\)\) !important;/g) || []).length, 2);
  assert.doesNotMatch(OVR, /font-size: calc\(var\(--acb-h\) \* 0\.28\) !important;/);
  assert.match(CORE, /'<span class="bigcraft-cap-plc" data-ap-city="' \+ _capEsc\(_capCity\) \+ '" data-ap-code="' \+ _capEsc\(_capCode\) \+ '">' \+ _capEsc\(_fxApPlace\(_capCity, _capCode\)\) \+ '<\/span>'/);
  assert.match(fnSource('_fxApPlace'), /c = _cityAp\(c, k\);/);
  assert.match(fnSource('_fxApRelang'), /if \(els\[i\]\.textContent !== t\) els\[i\]\.textContent = t;/);
});

// ── 6. THE FOURTH PASS (v23997) ────────────────────────────────────────────
//
// What the review of v23986 found, measured on the boards: the 1280 weather
// card's five day panels cut under a title that had wrapped with its airport
// on it; the airport's name shrinking the gate's Destination (79px to 43px at
// 1920) and the Your Aircraft block; the Later-at-this-gate strip naming the
// same airports by code with its own twin test and its own fitter, its title
// under the floor; twin cities on the live boards with no airport named; and
// a belt row changing layout between its language phases.

test('the gate\'s Destination is fitted alone; its airport takes what is left, or gives way', () => {
  const box = CORE.slice(CORE.indexOf('function _boxAssign('), CORE.indexOf('function _plateInset('));
  assert.match(box, /var _apSub = _wrapOk \? el\.querySelector\('\.ap-sub'\) : null;\s*if \(_apSub\) \{ _apSubOff\(_apSub, true\); _apSub\.style\.removeProperty\('font-size'\); \}/);
  assert.match(box, /var _hasSub = false;/);
  assert.match(box, /if \(_apSub\) _gateApSubPlace\(el, _apSub, _finPx, _cityTwo, availH, colR, skipH, _flo\);/);
  const place = fnSource('_gateApSubPlace');
  assert.match(place, /var top = Math\.max\(flo, Math\.floor\(cityPx \* 0\.8 \* 4\) \/ 4\);/);
  // v23998 — no smaller than its smallest beside or under its city (_fxApMin)
  assert.match(place, /var lo = _fxApMin\(cityPx, flo\);/);
  assert.match(place, /var b1 = _fxSearch\(lo, top, function \(q\) \{ return fitsAt\(q, false\); \}\);/);
  assert.match(place, /var b2 = _fxSearch\(lo, top, function \(q\) \{ return fitsAt\(q, true\); \}\);/);
  assert.match(place, /_apSubOff\(sub, true\);/);
  assert.doesNotMatch(place, /el\.style\.setProperty\('font-size'/, 'the city\'s size is never touched');
  assert.match(OVR, /:root:not\(#_\) \.ap-sub\.ap-sub-off \{ display: none !important; \}/);
  // the Your Aircraft lines: sized without the airport, then it is set in
  // what its own line has left, a step under the line down to the floor
  assert.match(CORE, /_ibSubs\.forEach\(function \(sb\) \{\s*_apSubOff\(sb, true\); sb\.style\.removeProperty\('font-size'\);/);
  assert.match(CORE, /var ok = function \(q\) \{\s*sb\.style\.setProperty\('font-size', q \+ 'px', 'important'\);\s*if \(!vars\) return _measure\(ln\) <= availW \+ 0\.5;/);
  // both in every board language's words (_fxApVariants), so each phase takes the same place
  assert.match(fnSource('_gateApSubPlace'), /var vars = _fxApVariants\(el, sub\);/);
  assert.match(CORE, /var vars = _fxApVariants\(ln, sb\);/);
});

test('the decision: the bigger city, then the bigger airport, then one line', () => {
  // the city at its size either way: beside it only at its own step
  const fits = (oneMax, twoOk) => (px, wrap, loose, sub) => px <= 23.5 && (wrap ? twoOk : (sub || px * 0.8) <= oneMax);
  assert.deepEqual(_fxPlan(23.5, 12, 2, true, false, fits(18.8, true)), { px: 23.5, wrap: false });
  const hair = _fxPlan(23.5, 12, 2, true, false, fits(18.7, true));
  assert.ok(!hair.wrap && hair.px === 23.5 && hair.sub >= 18.5, 'a hair under its step: still beside ' + JSON.stringify(hair));
  const fifteen = _fxPlan(23.5, 12, 2, true, false, fits(15.5, true));
  assert.ok(fifteen.px === 23.5 && fifteen.wrap && fifteen.under && fifteen.sub >= 18.5, JSON.stringify(fifteen));
  // a belt row (YQM PD2293, 1280x720) whose airport held 15.5px of 23.5 beside
  // its city in English and 15.2px in French took one layout in each
  // language; it takes the same one in both now
  const en = _fxPlan(23.5, 12, 2, true, false, fits(15.5, true)), fr = _fxPlan(23.5, 12, 2, true, false, fits(15.2, true));
  assert.deepEqual(en, fr);
  // v23998 — an airport that would sit at the floor beside its city on a
  // 1280x720 board's 36px row, with no room under a city kept at its size,
  // gives way: 'London | LHR' at the size the row gives the city alone, not
  // 'London' at 19.25px over 'Heathrow' (v23997 took 85% of the city for it)
  const row = (px, wrap, loose, sub) => (wrap ? px <= 19.25 : (px <= 21.25 && (sub || px * 0.8) <= 12));
  const lon = _fxPlan(21.76, 12, 2, true, false, row);
  assert.ok(lon.px >= 21 && lon.px <= 21.25 && !lon.wrap && lon.sub === -1, JSON.stringify(lon));
  const tight = (px, wrap, loose, sub) => (wrap ? px <= 17 : (px <= 21.25 && (sub || px * 0.8) <= 12));
  assert.equal(_fxPlan(21.76, 12, 2, true, false, tight).wrap, false, 'the city is not wrapped smaller for its airport');
  const small = (px, wrap, loose, sub) => (wrap ? px <= 15.5 : (px <= 16.25 && (sub || px * 0.8) <= 12));
  assert.equal(_fxPlan(21.76, 12, 2, true, false, small).wrap, false, 'nor for an airport hardly bigger under it');
  // and every board language's words are tried in place, so all of them hold
  const v = fnSource('_fxApVariants');
  assert.match(v, /var code = sub && sub\.getAttribute\('data-ap'\);/);
  // the city is the text before the airport's space (.ap-gap, v23999)
  assert.match(v, /if \(tn && tn\.nodeType === 1 && tn\.classList && tn\.classList\.contains\('ap-gap'\)\) tn = tn\.previousSibling;/);
  assert.match(v, /var name = _apSubline\(code, lgs\[b\]\);/);
  assert.match(fnSource('fidsFitText'), /var vars = subs\.length === 1 \? _fxApVariants\(el, subs\[0\]\) : null;/);
  assert.match(fnSource('fidsFitText'), /for \(var vi = 0; vi < vars\.n && ok; vi\+\+\) \{ vars\.apply\(vi\); ok = at1\(px, wrap, loose, sub, under\); \}\s*vars\.restore\(\);/);
  // the code rides on the airport's span for it
  assert.equal(helpers._cityApHtml('Toronto · Billy Bishop', 'YTZ'),
    'Toronto <span class="ap-sub" data-ap="YTZ"><span class="ap-sep fx-brk">· </span><span class="ap-name">Billy Bishop</span></span>');
  assert.equal(helpers._cityApHtml('Montréal · Métropolitain', 'MET'),
    'Montréal <span class="ap-sub" data-ap="YHU"><span class="ap-sep fx-brk">· </span><span class="ap-name">Métropolitain</span></span>');
  assert.doesNotMatch(helpers._cityApHtml('Ottawa', 'YOW'), /data-ap/);
});

test('twin cities from the live boards say which airport, in every board language', () => {
  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  for (const [a, b] of [['IST', 'SAW'], ['BFS', 'BHD'], ['DXB', 'DWC'], ['SEA', 'BFI'], ['CDG', 'LBG']]) {
    assert.ok(SUB[a] && SUB[b], a + '/' + b);
    assert.equal(fold(CITY[a]), fold(CITY[b]), a + '/' + b + ' are one city');
  }
  // a name that is a description is written in each language; a proper name as written
  for (const code of ['IST', 'BFS', 'DXB']) {
    for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(SUB[code][l] && SUB[code][l].trim(), code + '.' + l);
    for (const l of ['es', 'it', 'pt', 'ja', 'zh', 'ar']) assert.notEqual(SUB[code][l], SUB[code].en, code + '.' + l + ' is not the English');
  }
  assert.equal(helpers._apSubline('IST', 'de'), 'Flughafen Istanbul');
  assert.equal(helpers._apSubline('BFS', 'it'), 'Internazionale');
  assert.equal(helpersFr._apSubline('SAW', 'fr'), 'Sabiha-Gökçen');
  assert.equal(helpersFr._apSubline('DWC', 'fr'), 'Al-Maktoum');
  assert.equal(helpers._apSubline('LBG', 'ja'), 'Le Bourget');
  assert.equal(helpers._cityAp('Istanbul', 'SAW', 'en'), 'Istanbul · Sabiha Gökçen');
  assert.equal(helpers._cityAp('Belfast', 'BHD', 'en'), 'Belfast · City');
  // once, in the language asked for, from any language's form
  assert.equal(helpers._cityAp('Istanbul · Istanbul Airport', 'IST', 'fr'), 'Istanbul · Aéroport d’Istanbul');
  assert.equal(helpers.tc('ISTANBUL · Flughafen Istanbul'), 'Istanbul · Flughafen Istanbul');
  // one city, one spelling: Dubaï for both of its airports in French
  assert.equal(CITY_FR.DWC, CITY_FR.DXB);
  // Santiago de Cuba is not Chile's Santiago
  assert.equal(CITY.SCU, 'SANTIAGO DE CUBA');
  assert.equal(CITY_FR.SCU, 'SANTIAGO DE CUBA');
  assert.match(read('js/shared-names.js'), /SCU:'SANTIAGO DE CUBA'/);
});

test('the weather screens\' title keeps one line, its airport giving way first; the day panels are never cut', () => {
  const t = fnSource('_wxFitTitle');
  // v23998 — the place keeps its size before the airport keeps its name
  // ('MONTRÉAL · MÉTROPOLITAIN | MET' 15.1px against 20.7px on v23994)
  const steps = ['// 1. the airport, down to its smallest beside the place', '// 2. the airport left to its code, the place at its size',
    '// 3. the place, down to the words beside it', '// 4. the place, then the words, to the floor'].map((x) => t.indexOf(x));
  for (const i of steps) assert.ok(i > 0);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b), 'in that order');
  assert.match(t, /var q1 = _fxSearch\(_fxApMin\(pPx, flo\), Math\.max\(flo, pPx \* 0\.8\), setSub\);/);
  assert.match(t, /_apSubOff\(sub, true\);\s*if \(_wxTitleOneLine\(t\)\) return done\(\);/);
  // a row of the title is told by where its pieces are laid out (the screens
  // slide in turned and scaled), not by where they are drawn
  assert.match(fnSource('_wxTitleOneLine'), /k\.offsetTop >= minTop \+ maxH \* 0\.6/);
  // the icon gives up the height the words need, measured on the words
  const room = fnSource('_wxDayRoom');
  assert.match(room, /var o = _wxDayOver\(d, body, ic\);/);
  assert.match(room, /ic\.style\.setProperty\('height', nw \+ 'px', 'important'\);/);
  assert.match(fnSource('_wxDayOver'), /rg\.selectNodeContents\(n\);/);
  // after every fit pass and every plate fit
  assert.match(fnSource('fidsFitAll'), /try \{ _wxFitTitles\(scope\); \} catch \(eW\) \{\}/);
  assert.match(fnSource('_wxFitPlateCities'), /try \{ _wxFitTitles\(root\); \} catch \(e2\) \{\}/);
});

test('the Later-at-this-gate strip\'s words are the shared fitter\'s, never under the floor', () => {
  const r = rulesSrc();
  assert.match(r, /\{ sel: '\.gl-strip \.gl-title', lines: 1 \}/);
  // (its one line held by the scale, its second line by the room the clock
  // row leaves: v23998, the one line held to its glyphs' height came down
  // from 21.9px to 15.8px)
  assert.match(r, /\{ sel: '\.gl-strip \.gl-sub', box: '\.gl-slot', lines: 2, hWrap: true, group: '\.gl-list', h: function \(el\) \{ return _GL_FIT_SUB\.h\(el\); \} \}/);
  // v23998 — the clock rows and the lines on one scale, as v23976 had it, the
  // lines measured in their smallest form (the city with its airport's code);
  // then the shared fitter puts the airport's name in where it has room
  assert.match(fnSource('_gateLaterFit'), /setForm\(false\);\s*if \(!_gateLaterFitBox\(st, '--gl-k', slots, \[\], 0\.72, _gateLaterSlotOver\)\)/);
  // its title and lines on that scale, floored
  assert.match(OVR, /font-size: max\(var\(--fx-floor, 12px\), calc\(min\(1\.92vh, 1\.2vw\) \* var\(--gl-k\)\)\) !important;/);
  assert.match(OVR, /font-size: max\(var\(--fx-floor, 12px\), calc\(var\(--gl-v\) \* \.27 \* var\(--gl-k\)\)\) !important;/);
  // and an airport's name that has no room gives way to its code there
  assert.match(OVR, /:root:not\(#_\) \.ap-sub\.ap-sub-code \.ap-code \{ display: inline !important; letter-spacing: \.02em !important; \}/);
  assert.match(OVR, /font-size: max\(var\(--fx-floor, 12px\), calc\(var\(--gl-v\) \* \.2 \* var\(--gl-k\)\)\) !important;/);
  assert.match(OVR, /font-size: max\(var\(--fx-floor, 12px\), calc\(var\(--gl-v\) \* \.22 \* var\(--gl-k\)\)\) !important;/);
  assert.doesNotMatch(OVR, /\.gl-strip\.gl-wrap/);
  // the board's gate cell is fitted too (MCO 'NHGR' ended in an ellipsis at 1280x720)
  assert.match(r, /\{ sel: '#fidsTable tbody td\.td-gate', lines: 1 \}/);
  // a group's airport stays a step under the size the group gives its line
  assert.match(fnSource('fidsFitAll'), /var gTop = Math\.max\(fidsFitFloor\(\), Math\.floor\(mn \* 0\.8 \* 4\) \/ 4\);/);
});
