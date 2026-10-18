'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24053 — THE ROW WEATHER ICONS DRAWN FOR ORION CONNECTED, CHOSEN BY GROUND.
//
// The departures and arrivals rows draw one of two sets drawn for Orion
// Connected (logos/weather/rows-owner-white/ and rows-owner-color/, built by
// scripts/wx-icons/rows-owner.py): the white set on a dark ground, the colour
// set on a light ground. Each row picks for itself from the colour its icon
// really sits on (fids-core.js _fidsRowWxSet): wherever white holds less
// than 3:1 there the white set would vanish and the row wears the colour set
// (yellow Delayed, orange Final call, a light Customize row, an airline's
// yellow or orange used as a row), whatever its text is inked; elsewhere it
// takes the side the board's own ink took (the temperature beside the icon
// inked dark, the colour set; inked light, the white set), so an operator's
// new colours bring the other set with them. No list of carriers or themes.
//
// This test pins:
//   · every reading the rows can draw (every MET symbol, by day and at night,
//     every WMO and Tomorrow.io code, every name a caller passes) to a file
//     that exists in BOTH sets, and the two folders to the same names;
//   · the chooser: never the white set where white holds under 3:1 on the
//     ground, even under white text (both Delayed stripes, Final call, an
//     airline's yellow, orange, lime or teal); otherwise the row's ink
//     (mid-tone rows inked dark take the colour set; navy, red and dark
//     custom rows inked light the white set); every airline palette in
//     data/airline-colors.js and every board preset run through it; the ink
//     and the ground read as the page paints them (alpha and opacity on the
//     way);
//   · no gradient or clip id is used by two files, and every file's
//     references stay inside that file, so any number of icons can share a
//     page (inlined or not);
//   · the wiring: the rows say where their weather is, the row inks pass
//     runs the chooser, the stylesheet paints the chosen file.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = rd('fids-current/js/fids-core.js');
const V2 = rd('fids-current/js/fids-v2.js');
const CSS = rd('fids-current/css/display-overrides.css');
const WORKER = rd('worker-entry.js');
const WHITE = path.join(ROOT, 'fids-current/logos/weather/rows-owner-white');
const COLOUR = path.join(ROOT, 'fids-current/logos/weather/rows-owner-color');

function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) break;
  }
  return src.slice(i, j + 1);
}
function table(name) {
  const i = CORE.indexOf('const ' + name + ' = {');
  assert.ok(i >= 0, name + ' must exist');
  return vm.runInNewContext('(' + CORE.slice(CORE.indexOf('{', i), CORE.indexOf('\n};', i) + 2) + ')');
}
const files = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

// ── the board's own code, run as written ──────────────────────────────────
// the icon a code draws (fids-core.js, the mapping every set drawn for Orion
// Connected shares) and MET's symbol → WMO (the worker)
const ICON = vm.runInNewContext(fnSource(CORE, '_wmoAnimIcon') + '\n' + fnSource(CORE, '_wxAnimIcon') + '\n({ _wxAnimIcon, _wmoAnimIcon });');
const MET = (() => {
  const a = WORKER.indexOf('    const MET_WMO = {');
  const b = WORKER.indexOf('    };\n', WORKER.indexOf('const metWmo = (sym) => {', a)) + 7;
  assert.ok(a > 0 && b > a, "the worker's MET table and its reader");
  return vm.runInNewContext(WORKER.slice(a, b) + '\n({ MET_WMO, metWmo });');
})();
const TIO_ICON = table('TIO_ICON');

// the icon helper, lifted from fids-v2.js, with the core's mapping and a sun
// that says day or night for each place
const V2_SLICE = (() => {
  const a = V2.indexOf('const WX_ANIM_ALIAS');
  const END = 'window.fidsWxGatePair = wxGatePair;';
  return V2.slice(a, V2.indexOf(END) + END.length);
})();
function helper({ look = '', night = false, sun = null, mapping = true } = {}) {
  const attrs = look ? { 'data-fids-wx-icons': look } : {};
  const root = { getAttribute: (k) => (k in attrs ? attrs[k] : null), classList: { contains: (c) => c === (night ? 'fids-night' : 'fids-day') } };
  const win = { TIO_ICON, fidsSun: sun ? { isDay: (at) => (at in sun ? sun[at] : null) } : undefined };
  return new Function('window', 'document', 'location', 'FIDS_BUILD_TAG', '_wxDiscPair', '_wxAnimIcon',
    V2_SLICE + '\nreturn { wxIconHtml, wxRowName };'
  )(win, { documentElement: root, body: { getAttribute: () => null } }, { pathname: '/fids' }, 'v1', () => ({}), mapping ? ICON._wxAnimIcon : undefined);
}
const urls = (html) => {
  const w = /--wxr-w:url\(([^)]+)\)/.exec(html), c = /--wxr-c:url\(([^)]+)\)/.exec(html);
  return w && c ? { w: w[1], c: c[1] } : null;
};
const onDisk = (u) => fs.existsSync(path.join(ROOT, 'fids-current', u.replace(/\?.*$/, '')));

// every symbol MET sends: 41, 21 of them with _day / _night / _polartwilight
const MET_BASES = ['clearsky', 'cloudy', 'fair', 'fog', 'heavyrain', 'heavyrainandthunder', 'heavyrainshowers', 'heavyrainshowersandthunder',
  'heavysleet', 'heavysleetandthunder', 'heavysleetshowers', 'heavysleetshowersandthunder', 'heavysnow', 'heavysnowandthunder', 'heavysnowshowers',
  'heavysnowshowersandthunder', 'lightrain', 'lightrainandthunder', 'lightrainshowers', 'lightrainshowersandthunder', 'lightsleet',
  'lightsleetandthunder', 'lightsleetshowers', 'lightsnow', 'lightsnowandthunder', 'lightsnowshowers', 'lightssleetshowersandthunder',
  'lightssnowshowersandthunder', 'partlycloudy', 'rain', 'rainandthunder', 'rainshowers', 'rainshowersandthunder', 'sleet', 'sleetandthunder',
  'sleetshowers', 'sleetshowersandthunder', 'snow', 'snowandthunder', 'snowshowers', 'snowshowersandthunder'];
const MET_SUFFIXED = ['clearsky', 'fair', 'partlycloudy', 'heavyrainshowers', 'heavyrainshowersandthunder', 'heavysleetshowers',
  'heavysleetshowersandthunder', 'heavysnowshowers', 'heavysnowshowersandthunder', 'lightrainshowers', 'lightrainshowersandthunder',
  'lightsleetshowers', 'lightsnowshowers', 'lightssleetshowersandthunder', 'lightssnowshowersandthunder', 'rainshowers',
  'rainshowersandthunder', 'sleetshowers', 'sleetshowersandthunder', 'snowshowers', 'snowshowersandthunder'];
const MET_SYMBOLS = MET_BASES.flatMap((b) => (MET_SUFFIXED.includes(b) ? ['_day', '_night', '_polartwilight'].map((s) => b + s) : [b]));

test('the two sets hold the same files, and the rows know every one of them', () => {
  const w = files(WHITE), c = files(COLOUR);
  assert.equal(w.length, 31, '20 drawings and 11 copies');
  assert.deepEqual(c, w, 'one name, one file in each set');
  const names = Object.keys(vm.runInNewContext('(' + /const WX_ROW_NAMES = (\{[^}]+\});/.exec(V2)[1] + ')')).sort();
  assert.deepEqual(names, w, 'WX_ROW_NAMES is the folder');
});

test('every reading the rows can draw, by day and at night, is a file in both sets', () => {
  for (const night of [false, true]) {
    const h = helper({ look: 'daynight', night });
    // every MET symbol, as the server hands it to the board (a WMO code)
    assert.equal(MET_SYMBOLS.length, 83);
    for (const sym of MET_SYMBOLS) {
      const wmo = MET.metWmo(sym);
      const html = h.wxIconHtml(wmo, 48, { row: true });
      const u = urls(html);
      assert.ok(u, sym + ' (WMO ' + wmo + ') draws a row icon');
      assert.ok(onDisk(u.w) && onDisk(u.c), sym + ': ' + u.w + ' and ' + u.c);
      // the one mapping: the row draws what the night set and the card draw
      assert.match(html, new RegExp('data-wxg="' + ICON._wxAnimIcon(wmo, night) + '"'), sym + (night ? ' at night' : ' by day'));
    }
    // every WMO code and every Tomorrow.io code the table knows
    for (const c of Object.keys(TIO_ICON).map(Number)) {
      const u = urls(h.wxIconHtml(c, 48, { row: true }));
      assert.ok(u && onDisk(u.w) && onDisk(u.c), 'code ' + c);
    }
    // every name a caller can pass instead of a code
    const named = new Set([...Object.keys(vm.runInNewContext('(' + /const WX_LOOK_NAMES = (\{[^}]+\});/.exec(V2)[1] + ')')),
      ...Object.keys(vm.runInNewContext('(' + /const WX_ANIM_ALIAS = (\{[^}]+\});/.exec(V2)[1] + ')')), ...Object.values(TIO_ICON)]);
    for (const n of named) {
      const u = urls(h.wxIconHtml(n, 48, { row: true }));
      assert.ok(u && onDisk(u.w) && onDisk(u.c), n);
    }
  }
});

test('no reading draws no icon; a code the boards do not know draws none either', () => {
  const h = helper({ look: 'daynight' });
  for (const none of [null, undefined, '', 'not-a-weather', 9999]) assert.equal(h.wxIconHtml(none, 36, { row: true }), '', String(none));
});

test("the clear and partly cloudy skies take their night form while it is dark where the weather is", () => {
  // the board in daylight, Calgary in darkness, and the other way round
  let h = helper({ look: 'daynight', night: false, sun: { YYC: false, YYZ: true } });
  assert.match(h.wxIconHtml(0, 48, { row: true, at: 'YYC' }), /data-wxg="clear-night"/);
  assert.match(h.wxIconHtml(2, 48, { row: true, at: 'YYC' }), /data-wxg="partly-cloudy-night"/);
  assert.match(h.wxIconHtml(0, 48, { row: true, at: 'YYZ' }), /data-wxg="clear-day"/);
  h = helper({ look: 'daynight', night: true, sun: { YYZ: true } });
  assert.match(h.wxIconHtml(1, 48, { row: true, at: 'YYZ' }), /data-wxg="clear-day"/, "MET's fair is a clear sky");
  assert.match(h.wxIconHtml(1, 48, { row: true, at: 'XXX' }), /data-wxg="clear-night"/, 'a place the sun does not know: the board decides');
  assert.match(h.wxIconHtml(3, 48, { row: true }), /data-wxg="overcast"/, "MET's cloudy is the two clouds");
  // without the core's mapping (a page without fids-core.js) the table's name stands
  assert.match(helper({ look: 'daynight', mapping: false }).wxIconHtml(1001, 48, { row: true }), /data-wxg="cloudy"/);
});

test('the row icon: one box, both files, no circle, in every look but Classic', () => {
  for (const look of ['daynight', 'colour', 'solid', '']) {
    for (const night of [false, true]) {
      const html = helper({ look, night }).wxIconHtml(61, 48, { row: true });
      assert.equal(html, '<span class="fids-wx-cell fids-wx-row" data-wxg="rain" aria-hidden="true" style="display:inline-block;width:48px;height:48px;flex-shrink:0;vertical-align:middle;'
        + '--wxr-w:url(/logos/weather/rows-owner-white/rain.svg?v=v1);--wxr-c:url(/logos/weather/rows-owner-color/rain.svg?v=v1);"></span>', look + (night ? ' night' : ' day'));
    }
  }
  const classic = helper({ look: 'classic' }).wxIconHtml(61, 48, { row: true });
  assert.match(classic, /src="\/logos\/weather\/animated\/rain\.svg/, 'Classic keeps its icons');
  assert.doesNotMatch(classic, /rows-owner/);
});

// ── the chooser ────────────────────────────────────────────────────────────
const PICK = vm.runInNewContext(fnSource(CORE, '_ocLum') + '\n' + fnSource(CORE, '_ocCr') + '\n'
  + /var _WX_ROW_WHITE = [^;]+;/.exec(CORE)[0] + '\n' + /var _WX_ROW_WHITE_MIN = [^;]+;/.exec(CORE)[0] + '\n'
  + ['_wxRowWhiteVanishes', '_wxRowSetFor', '_wxRowRgba', '_wxRowGround', '_wxRowText', '_wxRowInk', '_fidsRowWxSet'].map((n) => fnSource(CORE, n)).join('\n')
  + '\n({ _wxRowSetFor, _wxRowWhiteVanishes, _wxRowRgba, _wxRowGround, _wxRowText, _wxRowInk, _fidsRowWxSet, _WX_ROW_WHITE, _WX_ROW_WHITE_MIN, _ocCr, setGCS: (f) => { getComputedStyle = f; }, setDoc: (d) => { document = d; } });',
  { getComputedStyle: null, document: null });
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// the board's arrays come from its own realm: compare their values
const G = (e, top) => Array.from(PICK._wxRowGround(e, top));

test('the chooser: never the white set where white would vanish; otherwise the side the row ink took', () => {
  // [the row's ground, the ink the board paints the temperature in, the set, the row]
  const rows = [
    ['#012846', '#FFFFFF', 'white', 'navy row'],
    ['#033F77', '#E8EEF5', 'white', 'navy stripe'],
    ['#00565A', '#FFFFFF', 'white', 'dark custom row'],
    ['#D42341', '#FFFFFF', 'white', 'Cancelled'],
    ['#A61B2B', '#FFFFFF', 'white', 'Diverted'],
    ['#405160', '#E8EEF5', 'white', 'a faded history row on a dark board'],
    ['#3A80CB', '#F0F0F5', 'white', 'a mid-blue custom row inked light (white holds 4.2:1)'],
    // white holds under 3:1 on these: the white set would vanish
    ['#EDBB00', '#0A2236', 'colour', 'Delayed, one stripe'],
    ['#E5A800', '#0A2236', 'colour', 'Delayed, darker'],
    ['#F28C00', '#0A2236', 'colour', 'Final call'],
    ['#A7BFA4', '#0A2236', 'colour', 'a faded Departed row on a light board'],
    ['#B4C0CC', '#0A2236', 'colour', 'mid-tone custom stripe'],
    ['#F9D44C', '#0A2236', 'colour', 'Delayed, the other stripe'],
    ['#FFFFFF', '#0A2236', 'colour', 'white row'],
    ['#B3F0FF', '#0A2236', 'colour', 'pale blue row'],
    ['#EBE6DA', '#4A3B2A', 'colour', 'cream row, brown text'],
    // ... even where the board leaves the row's text white (its floor keeps
    // white below 3:1 on grounds of luminance 0.30 to 0.45)
    ['#F28C00', '#FFFFFF', 'colour', 'an orange custom row, white text'],
    ['#F9A51A', '#FFFFFF', 'colour', 'North Star orange as a row, white text'],
    ['#F9B612', '#FFFFFF', 'colour', 'Southwest yellow as a row, white text'],
    ['#00ABC2', '#FFFFFF', 'colour', 'WestJet teal as a row, white text'],
    ['#00A0DF', '#FFFFFF', 'colour', 'Transat blue as a row, white text'],
    ['#7AFF94', '#FFFFFF', 'colour', 'Flair lime as a row, white text'],
    // where white still reads, the ink decides: dark text is the board judging the row light
    ['#7D848B', '#0A2236', 'colour', 'a faded Gate closed row (white 3.8:1, inked dark)'],
    ['#7C8C9C', '#0A2236', 'colour', 'mid-tone custom row (white 3.5:1, inked dark)']
  ];
  for (const [g, k, set, what] of rows) assert.equal(PICK._wxRowSetFor(rgb(g), rgb(k)), set, what + ' ' + g + ' / ' + k);
  // the test is a contrast test on the ground, at 3:1 (WCAG 2.2 SC 1.4.11, a graphic), against the white set's own white
  assert.deepEqual(Array.from(PICK._WX_ROW_WHITE), [255, 255, 255]);
  assert.equal(PICK._WX_ROW_WHITE_MIN, 3);
  for (const n of files(WHITE)) {
    const fills = [...fs.readFileSync(path.join(WHITE, n + '.svg'), 'utf8').matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase());
    assert.ok(fills.length && fills.every((f) => f === '#ffffff'), n + ': the white set is drawn in white');
  }
  // where it turns: just past a luminance of 0.30
  assert.equal(PICK._wxRowSetFor(rgb('#949494'), rgb('#FFFFFF')), 'white', 'grey 3.03:1');
  assert.equal(PICK._wxRowSetFor(rgb('#959595'), rgb('#FFFFFF')), 'colour', 'grey 2.99:1');
  // a cell with no text: the contrast test alone
  for (const h of ['#012846', '#D42341', '#405160']) assert.equal(PICK._wxRowSetFor(rgb(h), null), 'white', h + ', no text');
  for (const h of ['#FFFFFF', '#E6ECF2', '#F9D44C', '#F28C00']) assert.equal(PICK._wxRowSetFor(rgb(h), null), 'colour', h + ', no text');
  assert.equal(PICK._wxRowSetFor(null, null), 'white', 'no ground read: the white set, for the dark boards most airports run');
  // no carrier code, theme name or colour list in the chooser
  const src = ['_wxRowWhiteVanishes', '_wxRowSetFor', '_fidsRowWxSet'].map((n) => fnSource(CORE, n)).join('\n');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b|'[A-Z0-9]{2}'|data-fids-theme|row-delayed|row-final/, 'decided by the ground alone');
});

// every ground a board can paint a row in: each airline palette in
// data/airline-colors.js (its bar, accents and body, under its own text, under
// white, under the board's dark type) and each board preset's two stripes
// under its row text, each through the board's own text floor (_fidsInk)
test('every airline palette and every board preset: white set only where white holds 3:1, colour set wherever it would vanish', () => {
  const INK = vm.runInNewContext(['_fidsRelLum', '_fidsContrast', '_fidsInk'].map((n) => fnSource(CORE, n)).join('\n') + '\n({ _fidsInk });');
  const AB = new Function('window', rd('fids-current/data/airline-colors.js') + '\nreturn window.AIRLINE_BRAND_COLORS;')({});
  const THEMES = table('THEMES');
  const cases = [];
  for (const [code, p] of Object.entries(AB)) {
    for (const k of ['r1', 'r2', 'r3', 'body']) {
      if (!/^#[0-9a-fA-F]{6}$/.test(p[k] || '')) continue;
      for (const t of [p.r1Text, p.bodyText, '#FFFFFF', '#0F172A']) if (t) cases.push([code + '.' + k, p[k], INK._fidsInk(t, p[k])]);
    }
  }
  for (const [name, t] of Object.entries(THEMES)) for (const k of ['rowOdd', 'rowEven']) cases.push(['theme ' + name + '.' + k, t[k], INK._fidsInk(t.rowText, t[k])]);
  assert.ok(cases.length > 300, cases.length + ' grounds');
  let colour = 0, white = 0;
  for (const [what, g, k] of cases) {
    const set = PICK._wxRowSetFor(rgb(g), rgb(k));
    const cr = PICK._ocCr([255, 255, 255], rgb(g));
    if (cr < 3) assert.equal(set, 'colour', what + ' ' + g + ' (white ' + cr.toFixed(2) + ':1) under ' + k);
    else if (PICK._ocCr(rgb(k), rgb(g)) >= 3 && rgb(k).reduce((a, v) => a + v) > rgb(g).reduce((a, v) => a + v)) assert.equal(set, 'white', what + ' ' + g + ' under light ' + k);
    if (set === 'white') { white++; assert.ok(cr >= 3, what + ': white set at ' + cr.toFixed(2) + ':1'); } else colour++;
  }
  assert.ok(colour > 0 && white > 0, colour + ' colour, ' + white + ' white');
  // the carriers' yellows, oranges, lime and teal, the ones a light-set test is for
  for (const [code, k] of [['WN', 'r2'], ['LH', 'r2'], ['4N', 'r2'], ['NSA', 'r2'], ['IB', 'r2'], ['F8', 'r2'], ['WS', 'r2'], ['TS', 'r2']]) {
    assert.equal(PICK._wxRowSetFor(rgb(AB[code][k]), rgb('#FFFFFF')), 'colour', code + ' ' + AB[code][k] + ' under white text');
  }
});

// a page as getComputedStyle sees it: each element its own background,
// opacity and text colour
function el(bg, opacity, parent, extra) {
  return Object.assign({ nodeType: 1, parentElement: parent || null, _bg: bg, _op: opacity == null ? '1' : String(opacity), attrs: {}, kids: [], textContent: '',
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
    querySelectorAll() { const out = []; const walk = (e) => e.kids.forEach((c) => { out.push(c); walk(c); }); walk(this); return out; },
    querySelector() { return this.kids[0] || null; } }, extra || {});
}
const kid = (parent, e) => { parent.kids.push(e); return e; };
PICK.setGCS((e) => ({ backgroundColor: e._bg, opacity: e._op, color: e._color || 'rgb(0, 0, 0)', webkitTextFillColor: e._fill || e._color || 'rgb(0, 0, 0)' }));

test('the ground is the colour the icon sits on, and the ink the colour the text is painted: every background by its alpha, every opacity on the way', () => {
  const html = el('rgba(0, 0, 0, 0)');
  const body = el('rgb(10, 22, 40)', 1, html);
  const table = el('rgba(0, 0, 0, 0)', 1, body);
  // a plain navy row
  let tr = el('rgb(1, 40, 70)', 1, table), cell = el('rgba(0, 0, 0, 0)', 1, el('rgba(0, 0, 0, 0)', 1, tr));
  assert.deepEqual(G(cell), [1, 40, 70]);
  // a Delayed cell painted on its own, over the row
  tr = el('rgb(1, 40, 70)', 1, table); cell = el('rgba(0, 0, 0, 0)', 1, el('rgb(249, 212, 76)', 1, tr));
  assert.deepEqual(G(cell), [249, 212, 76]);
  // a faded history row: slate at 0.7 over the board's navy, and white text in it
  tr = el('rgb(38, 45, 54)', 0.7, table); cell = el('rgba(0, 0, 0, 0)', 1, el('rgb(38, 45, 54)', 1, tr));
  assert.deepEqual(G(cell), [30, 38, 50]);
  assert.deepEqual(G(cell, [255, 255, 255, 1]), [182, 185, 191], 'the text fades with its row');
  // a wash: white at 10 % over the navy
  tr = el('rgba(255, 255, 255, 0.1)', 1, table); cell = el('rgba(0, 0, 0, 0)', 1, tr);
  assert.deepEqual(G(cell), [35, 45, 62]);
  // text at half alpha lies half over its ground
  assert.deepEqual(G(cell, [255, 255, 255, 0.5]), [145, 150, 158]);
  // a page that paints nothing sits on the white canvas
  assert.deepEqual(G(el('rgba(0, 0, 0, 0)', 1, el('rgba(0, 0, 0, 0)'))), [255, 255, 255]);
  // Chrome's color() form
  assert.deepEqual(Array.from(PICK._wxRowRgba('color(srgb 0.5 0.25 1 / 0.5)')), [127.5, 63.75, 255, 0.5]);
});

test('the text read is the temperature beside the icon, in the colour it is painted', () => {
  const tr = el('rgb(237, 187, 0)', 1, el('rgb(10, 22, 40)', 1, el('rgba(0, 0, 0, 0)')));
  const cell = el('rgba(0, 0, 0, 0)', 1, el('rgba(0, 0, 0, 0)', 1, tr));
  const ic = kid(cell, el('rgba(0, 0, 0, 0)', 1, cell));
  assert.equal(PICK._wxRowText(ic), null, 'no text: nothing to read');
  // the temperature, its digits in a span of their own inside it
  const t = kid(cell, el('rgba(0, 0, 0, 0)', 1, cell, { textContent: '12°C' }));
  const digits = kid(t, el('rgba(0, 0, 0, 0)', 1, t, { textContent: '12°C', _color: 'rgb(10, 34, 54)' }));
  assert.equal(PICK._wxRowText(ic), digits, 'the element that paints the text, as _fidsRowInk inks it');
  assert.deepEqual(Array.from(PICK._wxRowInk(digits)), [10, 34, 54]);
  // -webkit-text-fill-color is what is painted; a transparent one falls back to color
  digits._fill = 'rgb(255, 255, 255)';
  assert.deepEqual(Array.from(PICK._wxRowInk(digits)), [255, 255, 255]);
  digits._fill = 'rgba(0, 0, 0, 0)';
  assert.deepEqual(Array.from(PICK._wxRowInk(digits)), [10, 34, 54]);
});

test('each row picks for itself, one status one set, writes only when its ground or ink changed, and follows a new palette', () => {
  const body = el('rgb(10, 22, 40)', 1, el('rgba(0, 0, 0, 0)'));
  const row = (bg, ink) => {
    const tr = el(bg, 1, body); const cell = el('rgba(0, 0, 0, 0)', 1, el('rgba(0, 0, 0, 0)', 1, tr));
    const ic = kid(cell, el('rgba(0, 0, 0, 0)', 1, cell));
    ic._t = kid(cell, el('rgba(0, 0, 0, 0)', 1, cell, { textContent: '15°C', _color: ink }));
    ic._tr = tr;
    return ic;
  };
  const NAVY_INK = 'rgb(10, 34, 54)', WHITE = 'rgb(255, 255, 255)';
  const icons = [row('rgb(1, 40, 70)', WHITE), row('rgb(212, 35, 65)', WHITE), row('rgb(237, 187, 0)', NAVY_INK), row('rgb(249, 212, 76)', NAVY_INK),
    row('rgb(242, 140, 0)', NAVY_INK), row('rgb(255, 255, 255)', NAVY_INK)];
  let writes = 0;
  icons.forEach((ic) => { const set = ic.setAttribute; ic.setAttribute = function (k, v) { writes++; set.call(this, k, v); }; });
  PICK.setDoc({ querySelectorAll: () => icons });
  PICK._fidsRowWxSet();
  assert.deepEqual(icons.map((i) => i.getAttribute('data-wx-set')), ['white', 'white', 'colour', 'colour', 'colour', 'colour'],
    'navy, red Cancelled, both yellow Delayed stripes, orange Final call, white');
  const first = writes;
  PICK._fidsRowWxSet();
  assert.equal(writes, first, 'the heartbeat on unchanged rows writes nothing');
  // the operator saves mid-tone custom rows: the board inks them dark, and the icon follows
  icons[0]._tr._bg = 'rgb(180, 192, 204)'; icons[0]._t._color = NAVY_INK;
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-set'), 'colour');
  // and back to dark
  icons[0]._tr._bg = 'rgb(3, 63, 119)'; icons[0]._t._color = WHITE;
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-set'), 'white');
  // the ground unchanged, the ink changed (a palette with a new text colour): it picks again
  icons[0]._t._color = 'rgb(0, 0, 0)';
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-set'), 'colour');
});

// ── many icons on one page ────────────────────────────────────────────────
test('no gradient or clip id is shared by two files, and every reference stays in its own file', () => {
  const seen = new Map();
  for (const [dir, prefix] of [[WHITE, 'wxrw-'], [COLOUR, 'wxrc-']]) {
    for (const name of files(dir)) {
      const svg = fs.readFileSync(path.join(dir, name + '.svg'), 'utf8');
      const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      for (const id of ids) {
        assert.ok(id.startsWith(prefix + name + '-'), id + ' is named for its file (' + name + ')');
        assert.ok(!seen.has(id), id + ' in ' + name + ' and ' + seen.get(id));
        seen.set(id, path.basename(dir) + '/' + name);
      }
      const refs = [...svg.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] || m[2]);
      for (const r of refs) assert.ok(ids.includes(r), name + ' refers to #' + r + ', which it defines');
      assert.doesNotMatch(svg, /<script|<image|<foreignObject|\bon[a-z]+=|xlink:href="(?!#)|href="(?!#)/i, name + ': drawings only');
    }
  }
  assert.ok(seen.size > 0, 'the colour set carries gradients');
});

// ── the wiring ─────────────────────────────────────────────────────────────
test('the rows say where their weather is, and the row inks pass picks the set', () => {
  assert.match(CORE, /window\.fidsWxIcon\(tw\.current\.code, 48, \{ row: true, at: _wxAt \}\)/);
  assert.match(CORE, /tw = _cw; _wxAt = _codes\[_ci\]; break;/, 'a through-flight leg says its own place');
  const ink = fnSource(CORE, '_fidsBoardInk');
  assert.ok(ink.indexOf('_fidsRowWxSet(table)') > ink.indexOf('_fidsRowInk(table)'), 'in the same task as the rows are rebuilt, after the inks it reads');
  assert.match(CORE, /_fidsRowInk\(\); _fidsRowWxSet\(\); \}, 5000\)/, 'and on the 5 s heartbeat');
  assert.match(V2, /if \(_look === 'row'\) \{\s*const rn = wxRowName\(code, opts && opts\.at\);\s*if \(rn\) return wxRowHtml\(rn, size\);/);
});

test('the stylesheet paints the white file, and the colour file where the row is light; nothing filters either', () => {
  const at = CSS.indexOf('v24053 — THE ROW WEATHER ICONS DRAWN FOR ORION CONNECTED');
  assert.ok(at > 0);
  const block = CSS.slice(at, CSS.indexOf('/* ══', at + 10));
  assert.match(block, /#fidsTable \.fids-wx-row \{\s*background: var\(--wxr-w\) center \/ contain no-repeat !important;\s*filter: none !important;\s*\}/);
  assert.match(block, /#fidsTable \.fids-wx-row\[data-wx-set="colour"\] \{\s*background-image: var\(--wxr-c\) !important;\s*\}/);
  assert.doesNotMatch(CSS, /img\.fids-wx-glyph/, 'the solid glyph the rows drew before is gone with its darkening rule');
  assert.ok(at < CSS.indexOf('v24014 — THE WEATHER CARD IN THE AIRLINE'), 'the weather card block stays last');
});
