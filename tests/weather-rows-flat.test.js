'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24054 — THE ROW WEATHER ICONS, CHOSEN BY GROUND. v24086 — THE FLAT SET IN
// THE STYLE OF VECTEEZY PACK 98703.
//
// The departures and arrivals rows draw one of two sets
// (logos/weather/rows-flat-white/ and rows-flat-color/, built by
// scripts/wx-icons/flat.py from the masters in scripts/wx-icons/flat/): the
// flat set in the style of Vecteezy pack 98703 (licensed, no attribution),
// the same shapes in two colourways. The white set, the pack's own colours
// (white clouds, a #CCCCCC cloud behind, a #F2A844 sun, moon and bolt), on a
// dark ground; the colour set (navy #034C76, a #307895 cloud behind, a
// #A0610B sun, moon and bolt) on a light ground. Each icon picks for itself
// from the colour it really sits on (fids-core.js _fidsRowWxSet). First the
// set the row calls for: wherever white holds less than 3:1 there the white
// set would vanish and the row calls for the colour set (yellow Delayed,
// orange Final call, a light Customize row, an airline's yellow or orange
// used as a row), whatever its text is inked; elsewhere the side the board's
// own ink took (the temperature beside the icon inked dark, the colour set;
// inked light, the white set). Then whether that drawing can be seen there:
// a drawing is worn where half of the pixels at 38 px of EACH of its parts
// that meet the ground (each colour it is drawn in) stand at 3:1 on it (that
// set, then the other), so the sun, moon and bolt must hold as well as the
// cloud; where neither drawing can be (on the darker Delayed yellow, orange
// Final call, red Cancelled, and the mid-tone teal, cyan, blue, red and gold
// rows), the INK COPY: the drawing's own shapes in one colour, each part cut
// back from the parts in front of it (logos/weather/rows-flat-ink/), filled
// with the row's own text colour, and where that colour is itself too
// faint, the board's white or dark ink. No list of carriers or themes.
//
// This test pins:
//   · every reading the rows can draw (every MET symbol, by day and at night,
//     every WMO and Tomorrow.io code, every name a caller passes) to a file
//     that exists in BOTH sets, and the two folders to the same names;
//   · the two sets: the same shapes, one frame for every file, the largest
//     icon at the share of it the rows have always given an icon, each set
//     in its own colourway;
//   · the pixel table the chooser reads (_WX_ROW_PX): one entry per file of
//     each set, made from the file as it is now (its SHA-1);
//   · the set the row calls for: never the white set where white holds under
//     3:1 on the ground, even under white text; otherwise the row's ink;
//     every airline palette in data/airline-colors.js and every board preset
//     run through it; the ink and the ground read as the page paints them
//     (alpha and opacity on the way);
//   · what each icon wears: the drawing where half of each of its parts
//     stands at 3:1, else the ink copy in the row's ink where a quarter of it
//     does, else the most legible of all; on every palette, every status
//     ground and every drawing, and on the status rows exactly (navy, black
//     and the darker reds: the white set; white, light and yellow rows: the
//     colour set; the darker Delayed yellow and orange Final call: the
//     drawings in one colour in the colour set, every other in the row's
//     navy; red Cancelled: the white set but the drawings with an orange
//     part in white; Moncton's blue and teal stripes, and the airlines'
//     teal, cyan and gold: every drawing in more than one colour in one ink);
//   · the ink copy's mask: the masters' shapes as written, in white, each
//     part cut back from the parts in front of it, one mask per file;
//   · no drawing carries an id, a style or a script, so any number of icons
//     can share a page (inlined or not); each mask has one id of its own;
//   · the wiring: the rows say where their weather is, the row inks pass
//     runs the chooser, the stylesheet paints the chosen file or its copy.
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
const WHITE = path.join(ROOT, 'fids-current/logos/weather/rows-flat-white');
const COLOUR = path.join(ROOT, 'fids-current/logos/weather/rows-flat-color');
const INKM = path.join(ROOT, 'fids-current/logos/weather/rows-flat-ink');
const MASTERS = path.join(ROOT, 'scripts/wx-icons/flat');
const PALETTE = JSON.parse(fs.readFileSync(path.join(MASTERS, 'palette.json'), 'utf8'));

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
// the icon a code draws (fids-core.js, the mapping the row and night sets
// share) and MET's symbol → WMO (the worker)
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
  const w = /--wxr-w:url\(([^)]+)\)/.exec(html), c = /--wxr-c:url\(([^)]+)\)/.exec(html), m = /--wxr-m:url\(([^)]+)\)/.exec(html);
  return w && c && m ? { w: w[1], c: c[1], m: m[1] } : null;
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
  assert.equal(w.length, 31, '31 drawings, one per name');
  assert.deepEqual(c, w, 'one name, one file in each set');
  assert.deepEqual(files(INKM), w, 'and one ink copy mask for each');
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
      assert.ok(onDisk(u.w) && onDisk(u.c) && onDisk(u.m), sym + ': ' + u.w + ', ' + u.c + ' and ' + u.m);
      // the one mapping: the row draws what the night set and the card draw
      assert.match(html, new RegExp('data-wxg="' + ICON._wxAnimIcon(wmo, night) + '"'), sym + (night ? ' at night' : ' by day'));
    }
    // every WMO code and every Tomorrow.io code the table knows
    for (const c of Object.keys(TIO_ICON).map(Number)) {
      const u = urls(h.wxIconHtml(c, 48, { row: true }));
      assert.ok(u && onDisk(u.w) && onDisk(u.c) && onDisk(u.m), 'code ' + c);
    }
    // every name a caller can pass instead of a code
    const named = new Set([...Object.keys(vm.runInNewContext('(' + /const WX_LOOK_NAMES = (\{[^}]+\});/.exec(V2)[1] + ')')),
      ...Object.keys(vm.runInNewContext('(' + /const WX_ANIM_ALIAS = (\{[^}]+\});/.exec(V2)[1] + ')')), ...Object.values(TIO_ICON)]);
    for (const n of named) {
      const u = urls(h.wxIconHtml(n, 48, { row: true }));
      assert.ok(u && onDisk(u.w) && onDisk(u.c) && onDisk(u.m), n);
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
  // the old Tomorrow.io wind codes draw the wind, by day and at night (the card's mapping has no wind)
  for (const night of [false, true]) for (const c of [3000, 3001, 3002]) assert.match(helper({ look: 'daynight', night }).wxIconHtml(c, 48, { row: true }), /data-wxg="wind"/, c + (night ? ' at night' : ' by day'));
  // without the core's mapping (a page without fids-core.js) the table's name stands
  assert.match(helper({ look: 'daynight', mapping: false }).wxIconHtml(1001, 48, { row: true }), /data-wxg="cloudy"/);
});

test('the row icon: one box, both files, no circle, in every look but Classic', () => {
  for (const look of ['daynight', 'colour', 'solid', '']) {
    for (const night of [false, true]) {
      const html = helper({ look, night }).wxIconHtml(61, 48, { row: true });
      assert.equal(html, '<span class="fids-wx-cell fids-wx-row" data-wxg="rain" aria-hidden="true" style="display:inline-block;width:48px;height:48px;flex-shrink:0;vertical-align:middle;'
        + '--wxr-w:url(/logos/weather/rows-flat-white/rain.svg?v=v1);--wxr-c:url(/logos/weather/rows-flat-color/rain.svg?v=v1);'
        + '--wxr-m:url(/logos/weather/rows-flat-ink/rain.svg?v=v1);"></span>', look + (night ? ' night' : ' day'));
    }
  }
  const classic = helper({ look: 'classic' }).wxIconHtml(61, 48, { row: true });
  assert.match(classic, /src="\/logos\/weather\/animated\/rain\.svg/, 'Classic keeps its icons');
  assert.doesNotMatch(classic, /rows-flat/);
});

// ── the chooser ────────────────────────────────────────────────────────────
const ROW_FNS = ['_wxRowParts', '_wxRowPx', '_wxRowSeen', '_wxRowWhiteVanishes', '_wxRowSetFor', '_wxRowRgba', '_wxRowMix', '_wxRowLayers', '_wxRowSee', '_wxRowGround', '_wxRowText',
  '_wxRowInkRaw', '_wxRowInk', '_wxRowShare', '_wxRowWear', '_wxRowCss', '_fidsRowWxSet'];
const PICK = vm.runInNewContext(fnSource(CORE, '_ocLum') + '\n' + fnSource(CORE, '_ocCr') + '\n'
  + ['_WX_ROW_WHITE', '_WX_ROW_WHITE_MIN', '_WX_ROW_SEEN', '_WX_ROW_COPY', '_WX_ROW_INKS', '_wxRowPxCache'].map((v) => new RegExp('var ' + v + ' = [^;]+;').exec(CORE)[0]).join('\n') + '\n'
  + /var _WX_ROW_PX = \{[\s\S]*?\n\};/.exec(CORE)[0] + '\n'
  + ROW_FNS.map((n) => fnSource(CORE, n)).join('\n')
  + '\n({ ' + ROW_FNS.join(', ') + ', _WX_ROW_WHITE, _WX_ROW_WHITE_MIN, _WX_ROW_SEEN, _WX_ROW_COPY, _WX_ROW_INKS, _WX_ROW_PX, _ocCr,'
  + ' setGCS: (f) => { getComputedStyle = f; }, setDoc: (d) => { document = d; } });',
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
  // the white set is the pack's own colours, its clouds, drops, flakes and lines white
  assert.equal(PALETTE.dark.cloud, '#FFFFFF');
  let white = 0;
  for (const n of files(WHITE)) {
    const fills = [...fs.readFileSync(path.join(WHITE, n + '.svg'), 'utf8').matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toUpperCase());
    assert.ok(fills.length && fills.every((f) => ['#FFFFFF', '#CCCCCC', '#F2A844'].includes(f)), n + ': the white set is drawn in the pack\'s white, grey and orange');
    if (fills.includes('#FFFFFF')) white++;
  }
  assert.ok(white >= 29, white + ' of 31 drawings draw in white (the sun and the bolt alone are orange only)');
  // where it turns: just past a luminance of 0.30
  assert.equal(PICK._wxRowSetFor(rgb('#949494'), rgb('#FFFFFF')), 'white', 'grey 3.03:1');
  assert.equal(PICK._wxRowSetFor(rgb('#959595'), rgb('#FFFFFF')), 'colour', 'grey 2.99:1');
  // a cell with no text: the contrast test alone
  for (const h of ['#012846', '#D42341', '#405160']) assert.equal(PICK._wxRowSetFor(rgb(h), null), 'white', h + ', no text');
  for (const h of ['#FFFFFF', '#E6ECF2', '#F9D44C', '#F28C00']) assert.equal(PICK._wxRowSetFor(rgb(h), null), 'colour', h + ', no text');
  assert.equal(PICK._wxRowSetFor(null, null), 'white', 'no ground read: the white set, for the dark boards most airports run');
  // no carrier code, theme name or colour list in the chooser
  const src = ['_wxRowWhiteVanishes', '_wxRowSetFor', '_wxRowParts', '_wxRowShare', '_wxRowSeen', '_wxRowWear', '_fidsRowWxSet'].map((n) => fnSource(CORE, n)).join('\n');
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

// ── what each icon wears ──────────────────────────────────────────────────
const crypto = require('node:crypto');
const flat = (g) => ({ raw: g, groups: [] });   // a ground painted on its own
const NAMES = files(WHITE);
// how much of the rendition an icon wears stands at 3:1: a drawing, the share
// of its least-seen part that meets the ground; the ink copy, the share of
// its mask's pixels in the ink
const worn = (w, n, g) => (w.set === 'ink' ? PICK._wxRowShare(PICK._wxRowPx('ink', n), flat(g), w.ink) : PICK._wxRowSeen(w.set, n, flat(g)));
// the drawings in one colour (their parts that meet the ground): every other
// has a sun, moon or bolt, or a cloud behind, in a second colour
const oneColour = (set, n) => PICK._wxRowParts(set, n).filter((p) => p.out).length === 1;

test('the pixel table: one entry for every file of both sets and of the masks, made from the file as it is now, part by part', () => {
  const SET = { w: 'white', c: 'colour', k: 'ink' };
  assert.deepEqual(Object.keys(PICK._WX_ROW_PX).sort(), ['c', 'k', 'w']);
  for (const [k, dir] of [['w', WHITE], ['c', COLOUR], ['k', INKM]]) {
    assert.deepEqual(Object.keys(PICK._WX_ROW_PX[k]).sort(), NAMES, k + ': one entry per file');
    for (const n of NAMES) {
      const e = PICK._WX_ROW_PX[k][n];
      const sha = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, n + '.svg'))).digest('hex').slice(0, 10);
      assert.equal(e.slice(0, 11), sha + ':', path.basename(dir) + '/' + n + '.svg has changed: run scripts/wx-icons/rows-pixels.js and put its table in fids-core.js');
      // one part per colour the file is filled with (the mask: one), each
      // its groups near that colour; only the mercury, inside its tube,
      // never meets the ground
      const svg = fs.readFileSync(path.join(dir, n + '.svg'), 'utf8');
      const fills = k === 'k' ? ['#FFFFFF'] : [...new Set([...svg.matchAll(/fill="(#[0-9A-F]{6})"/g)].map((m) => m[1]))];
      const parts = PICK._wxRowParts(SET[k], n);
      assert.equal(parts.length, fills.length, n + ': one part per colour (' + fills.join(' ') + ')');
      const nearest = (q) => fills.map(rgb).reduce((b, f, i, all) => (Math.hypot(q[0] - f[0], q[1] - f[1], q[2] - f[2]) < Math.hypot(q[0] - all[b][0], q[1] - all[b][1], q[2] - all[b][2]) ? i : b), 0);
      parts.forEach((p, j) => {
        const tot = p.px.reduce((a, q) => a + q[4], 0);
        const own = p.px.filter((q) => nearest(q) === j).reduce((a, q) => a + q[4], 0);
        assert.ok(tot > 0 && own / tot >= 0.9, k + ' ' + n + ' part ' + fills[j] + ': ' + (100 * own / tot).toFixed(0) + ' % nearest its own colour');
        const inside = /^thermometer-/.test(n) && fills[j] === (k === 'w' ? PALETTE.dark['therm-fill'] : PALETTE.light['therm-fill']);
        assert.equal(p.out, !inside, k + ' ' + n + ' part ' + fills[j] + (inside ? ': the mercury, inside its tube' : ': meets the ground'));
      });
      const g = PICK._wxRowPx(SET[k], n);
      assert.ok(g.length >= 4 && g.length <= 24, n + ': ' + g.length + ' colour groups');
      assert.ok(g.every((p) => p.length === 5 && p[3] >= 128 && p[4] > 0), n + ': each group at least half covered, with a share');
      const sum = g.reduce((a, p) => a + p[4], 0);
      assert.ok(Math.abs(sum - 255) <= 12, n + ': the shares make the whole (' + sum + '/255)');
    }
  }
  // the mask is white, one part
  for (const n of NAMES) assert.ok(PICK._wxRowPx('ink', n).every((p) => p[0] === 255 && p[1] === 255 && p[2] === 255), n + ': the mask is white');
  // each set's pixels are its own colourway: at least four fifths of every
  // drawing within a step of one of its colours (the rest the edges where two
  // colours meet), and never the other set's navy or white
  for (const [set, way, never] of [['white', 'dark', '#034C76'], ['colour', 'light', '#FFFFFF']]) {
    const cols = [...new Set(Object.values(PALETTE[way]))].map(rgb);
    for (const n of NAMES) {
      const g = PICK._wxRowPx(set, n);
      const tot = g.reduce((a, p) => a + p[4], 0);
      const near = g.filter((p) => cols.some((c) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) <= 24)).reduce((a, p) => a + p[4], 0);
      assert.ok(near / tot >= 0.8, set + ' ' + n + ': ' + (100 * near / tot).toFixed(0) + ' % in its colourway');
      const nv = rgb(never);
      assert.ok(g.every((p) => Math.hypot(p[0] - nv[0], p[1] - nv[1], p[2] - nv[2]) > 40), set + ' ' + n + ': none of ' + never);
    }
  }
});

test('each icon wears the drawing where half of each of its parts stands at 3:1, else its ink copy: the status rows and the mid-tone stripes', () => {
  const NAVY = [16, 36, 55, 1], WHITE_INK = [255, 255, 255, 1], DARK_INK = [17, 17, 17, 1];
  // the board's objects come from its own realm: compare their values
  const wear = (g, ink, n) => { const w = PICK._wxRowWear(n, flat(g), PICK._wxRowSetFor(g, ink.slice(0, 3)), ink); return w.ink ? { set: w.set, ink: Array.from(w.ink) } : { set: w.set }; };
  // the drawings with an orange part (the sun and its rays, the moon, the bolt)
  const warm = NAMES.filter((n) => fs.readFileSync(path.join(WHITE, n + '.svg'), 'utf8').includes('fill="#F2A844"') && !/^thermometer-/.test(n));
  assert.deepEqual(warm, ['clear-day', 'clear-night', 'lightning-bolt', 'overcast-day', 'overcast-night', 'partly-cloudy-day', 'partly-cloudy-day-snow',
    'partly-cloudy-night', 'sunrise', 'thunderstorms', 'thunderstorms-day-rain', 'thunderstorms-night-rain', 'thunderstorms-rain']);
  // dark rows and the darker reds (Diverted, Pascan): the white set as drawn, every drawing
  for (const g of ['#012846', '#033F77', '#0A0A0A', '#A61B2B', '#A50D24']) {
    for (const n of NAMES) {
      assert.deepEqual(wear(rgb(g), WHITE_INK, n), { set: 'white' }, g + ' ' + n);
      assert.ok(worn({ set: 'white' }, n, rgb(g)) >= 0.55, g + ' ' + n + ' reads: ' + worn({ set: 'white' }, n, rgb(g)).toFixed(2));
    }
  }
  // white, light and yellow rows: the colour set as drawn, every drawing
  for (const g of ['#F9D44C', '#F7FAFD', '#FFFFFF', '#B3F0FF', '#F8FADB', '#E0EDD4']) {
    for (const n of NAMES) {
      assert.deepEqual(wear(rgb(g), NAVY, n), { set: 'colour' }, g + ' ' + n + ': as drawn');
      assert.ok(worn({ set: 'colour' }, n, rgb(g)) >= 0.55, g + ' ' + n + ' reads: ' + worn({ set: 'colour' }, n, rgb(g)).toFixed(2));
    }
  }
  // the darker Delayed yellow and orange Final call: the colour set's brown
  // sun, moon and bolt and its blue cloud behind are under 3:1 there (2.0 to
  // 2.8), so the drawings in navy alone show as drawn and every other in the
  // row's own navy, its parts kept apart
  for (const g of ['#EDBB00', '#F28C00']) {
    for (const n of NAMES) {
      const w = wear(rgb(g), NAVY, n);
      if (oneColour('colour', n) && !warm.includes(n)) {
        assert.deepEqual(w, { set: 'colour' }, g + ' ' + n + ': as drawn');
      } else {
        assert.deepEqual(w, { set: 'ink', ink: NAVY }, g + ' ' + n + ': the row\'s own ink');
        assert.ok(worn(w, n, rgb(g)) >= 0.9, g + ' ' + n + ' reads: ' + worn(w, n, rgb(g)).toFixed(2));
      }
    }
  }
  // red Cancelled: the white set as drawn, but the drawings with an orange part in the row's white
  for (const n of NAMES) {
    const w = wear(rgb('#D42341'), WHITE_INK, n);
    assert.deepEqual(w, warm.includes(n) ? { set: 'ink', ink: WHITE_INK } : { set: 'white' }, n + ' on Cancelled');
    assert.ok(worn(w, n, rgb('#D42341')) >= 0.55, n + ' on Cancelled reads: ' + worn(w, n, rgb('#D42341')).toFixed(2));
  }
  assert.equal(wear(rgb('#D42341'), WHITE_INK, 'clear-day').set, 'ink', 'the orange sun on Cancelled, in white');
  // the mid-tone grounds under white text: Moncton's blue and teal stripes, an
  // airline's blue, red, cyan, teal and gold. No second colour of either set
  // holds 3:1 there (the white set's orange 1.4 to 2.2, its grey 1.5 to 2.8;
  // the colour set's brown and blue 1.6 to 2.1), so every drawing in more
  // than one colour is the ink copy: in the row's white where white holds
  // (blue, red, Qatar's gold), else in the board's dark ink (teal, cyan,
  // Emirates' gold, where the board keeps white text under 3:1)
  const MID = [['#1E7EB8', WHITE_INK, 'Moncton, the blue stripe'], ['#2DA4C4', DARK_INK, 'Moncton, the teal stripe'], ['#0078D2', WHITE_INK, 'American blue'],
    ['#ED1C24', WHITE_INK, 'Air France red'], ['#A4925A', WHITE_INK, 'Qatar gold'], ['#00ABC2', DARK_INK, 'WestJet teal'], ['#00A0DF', DARK_INK, 'Transat blue'],
    ['#C9A24B', DARK_INK, 'Emirates gold']];
  for (const [g, inks, what] of MID) {
    for (const n of NAMES) {
      const w = wear(rgb(g), WHITE_INK, n);
      if (oneColour('white', n) && oneColour('colour', n) && w.set !== 'ink') {
        assert.ok(worn(w, n, rgb(g)) >= PICK._WX_ROW_SEEN, what + ' ' + n + ': as drawn, ' + worn(w, n, rgb(g)).toFixed(2));
      } else {
        assert.deepEqual(w, { set: 'ink', ink: inks }, what + ' ' + g + ' ' + n);
        // as much of it as of any drawing worn (the row's white on Qatar's gold is itself 3.07:1)
        assert.ok(worn(w, n, rgb(g)) >= PICK._WX_ROW_SEEN, what + ' ' + n + ' reads: ' + worn(w, n, rgb(g)).toFixed(2));
      }
    }
    // the readings the review found lost on these grounds: partly cloudy (WMO 2) and the storm (95), by day and at night, and the clear sky
    for (const n of ['partly-cloudy-day', 'partly-cloudy-night', 'thunderstorms-day-rain', 'thunderstorms-night-rain', 'clear-day', 'clear-night']) {
      assert.equal(wear(rgb(g), WHITE_INK, n).set, 'ink', what + ' ' + n);
    }
  }
});

// every ground a board can paint a row in (as above), every drawing: what it
// wears is a drawing half of each part of which stands at 3:1, or the copy in
// the row's ink with a quarter at 3:1 and no less than either drawing, or
// else the most legible of the drawings and the copies in the row's ink and
// the board's two
test('every airline palette, every board preset and every status: what each icon wears can be seen', () => {
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
  for (const [g, t] of [['#F9D44C', '#102437'], ['#EDBB00', '#102437'], ['#F28C00', '#102437'], ['#D42341', '#FFFFFF'], ['#A61B2B', '#FFFFFF'], ['#DA3544', '#FFFFFF']]) cases.push(['status ' + g, g, t]);
  let n = 0, low = 1;
  const seen = { white: 0, colour: 0, own: 0, board: 0 };
  for (const [what, g, k] of cases) {
    const G = rgb(g), K = [...rgb(k), 1], pref = PICK._wxRowSetFor(G, K.slice(0, 3));
    for (const name of NAMES) {
      const w = PICK._wxRowWear(name, flat(G), pref, K);
      const s = worn(w, name, G);
      const at = what + ' ' + g + ' under ' + k + ', ' + name + ': ' + JSON.stringify(w) + ' at ' + s.toFixed(2);
      const draw = ['white', 'colour'].map((x) => PICK._wxRowSeen(x, name, flat(G)));
      const own = PICK._wxRowShare(PICK._wxRowPx('ink', name), flat(G), K);
      const all = [...draw, own, ...PICK._WX_ROW_INKS.map((i) => PICK._wxRowShare(PICK._wxRowPx('ink', name), flat(G), i))];
      if (w.set !== 'ink') {
        if (s < PICK._WX_ROW_SEEN) assert.equal(s, Math.max(...all), at + ': a drawing under half seen only when nothing shows more');
        seen[w.set]++;
      } else if (w.ink === K) {
        assert.ok(s >= PICK._WX_ROW_COPY && s >= Math.max(...draw) || s === Math.max(...all), at);
        seen.own++;
      } else {
        assert.equal(s, Math.max(...all), at + ': the board\'s ink only where it shows most');
        seen.board++;
      }
      if (w.set === 'white') assert.ok(PICK._ocCr([255, 255, 255], G) >= 3, at + ': never the white set where white is under 3:1');
      low = Math.min(low, s); n++;
    }
  }
  assert.ok(n > 10000, n + ' icons');
  assert.ok(low >= 0.2, 'at least a fifth of every icon worn stands at 3:1 (lowest ' + low.toFixed(3) + ')');
  assert.ok(seen.white && seen.colour && seen.own && seen.board, JSON.stringify(seen));
});

// a page as getComputedStyle sees it: each element its own background,
// opacity and text colour
function el(bg, opacity, parent, extra) {
  return Object.assign({ nodeType: 1, parentElement: parent || null, _bg: bg, _op: opacity == null ? '1' : String(opacity), attrs: {}, kids: [], textContent: '',
    style: { props: {}, setProperty(k, v) { this.props[k] = String(v); }, removeProperty(k) { delete this.props[k]; }, getPropertyValue(k) { return this.props[k] || ''; } },
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

test('each icon picks for itself, writes only when its ground or ink changed, and follows a new palette', () => {
  const body = el('rgb(10, 22, 40)', 1, el('rgba(0, 0, 0, 0)'));
  const row = (bg, ink, name) => {
    const tr = el(bg, 1, body); const cell = el('rgba(0, 0, 0, 0)', 1, el('rgba(0, 0, 0, 0)', 1, tr));
    const ic = kid(cell, el('rgba(0, 0, 0, 0)', 1, cell));
    ic.attrs['data-wxg'] = name;
    ic._t = kid(cell, el('rgba(0, 0, 0, 0)', 1, cell, { textContent: '15°C', _color: ink }));
    ic._tr = tr;
    return ic;
  };
  const NAVY_INK = 'rgb(10, 34, 54)', WHITE = 'rgb(255, 255, 255)';
  const icons = [row('rgb(1, 40, 70)', WHITE, 'clear-day'), row('rgb(212, 35, 65)', WHITE, 'clear-day'), row('rgb(237, 187, 0)', NAVY_INK, 'clear-day'),
    row('rgb(249, 212, 76)', NAVY_INK, 'rain'), row('rgb(242, 140, 0)', NAVY_INK, 'partly-cloudy-day'), row('rgb(255, 255, 255)', NAVY_INK, 'fog'),
    row('rgb(255, 255, 255)', NAVY_INK, 'thunderstorms-day-rain')];
  let writes = 0;
  icons.forEach((ic) => { const set = ic.setAttribute; ic.setAttribute = function (k, v) { writes++; set.call(this, k, v); }; });
  PICK.setDoc({ querySelectorAll: () => icons });
  PICK._fidsRowWxSet();
  assert.deepEqual(icons.map((i) => i.getAttribute('data-wx-set')), ['white', 'ink', 'ink', 'colour', 'ink', 'colour', 'colour'],
    'navy: the white set; red Cancelled: the orange sun in white; the darker Delayed yellow: the orange sun in navy; yellow Delayed: the rain in colour; orange Final call: the cloud and sun in navy (the brown sun is 2.0:1 there); a white row: the fog and the storm in colour');
  assert.deepEqual(icons.map((i) => i.style.getPropertyValue('--wxr-k')),
    ['', 'rgba(255, 255, 255, 1)', 'rgba(10, 34, 54, 1)', '', 'rgba(10, 34, 54, 1)', '', ''], 'the ink copy in the row text\'s own colour');
  const first = writes;
  PICK._fidsRowWxSet();
  assert.equal(writes, first, 'the heartbeat on unchanged rows writes nothing');
  // the operator saves mid-tone custom rows: the board inks them dark, and the icon follows
  icons[0]._tr._bg = 'rgb(180, 192, 204)'; icons[0]._t._color = NAVY_INK;
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-set'), 'ink', 'the colour sun cannot be seen on it: the sun in navy');
  assert.equal(icons[0].style.getPropertyValue('--wxr-k'), 'rgba(10, 34, 54, 1)');
  // and back to dark
  icons[0]._tr._bg = 'rgb(3, 63, 119)'; icons[0]._t._color = WHITE;
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-set'), 'white');
  assert.equal(icons[0].style.getPropertyValue('--wxr-k'), '', 'no ink left behind');
  // an operator's near-black rows, white text: the white set
  icons[0]._tr._bg = 'rgb(10, 10, 10)';
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-set'), 'white');
  // the ground unchanged, the ink changed (a palette with a new text colour): it picks again,
  // the colour set the dark text calls for (its deeper orange sun reads on near-black) ...
  icons[0]._t._color = 'rgb(0, 0, 0)';
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-ink'), '0,0,0');
  assert.equal(icons[0].getAttribute('data-wx-set'), 'colour');
  // ... but not its navy rain cloud, which cannot be seen there: the other set, the white rain
  icons[0].attrs['data-wxg'] = 'rain'; icons[0].attrs['data-wx-ink'] = '';
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-set'), 'white');
});

// ── the two sets ───────────────────────────────────────────────────────────
// the shapes of a file, in order, as written, and its fills
const drawnOf = (file) => {
  const svg = fs.readFileSync(file, 'utf8');
  const root = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([^"]+)">/.exec(svg);
  assert.ok(root, file + ': one plain root');
  const body = svg.slice(root[0].length).replace(/<\/svg>\n?$/, '');
  const re = /<(path|circle) fill="(#[0-9A-F]{6})" ([^>]*?)\/>/g;
  assert.equal(body.replace(re, ''), '', file + ': nothing but paths and circles');
  const shapes = [...body.matchAll(re)].map((m) => ({ tag: m[1], fill: m[2], geo: m[3] }));
  return { view: root[1], shapes };
};
const mastersOf = (n) => [...fs.readFileSync(path.join(MASTERS, n + '.svg'), 'utf8').matchAll(/<(path|circle) data-role="([a-z-]+)" fill="(#[0-9A-F]{6})" ([^>]*?)\/>/g)]
  .map((m) => ({ tag: m[1], role: m[2], geo: m[4] }));
// a shape's extent: path data (M L C Z, cubics sampled) or a circle
function extentOf(sh) {
  const at = (k) => +(new RegExp('\\b' + k + '="([^"]*)"').exec(sh.geo) || [])[1];
  if (sh.tag === 'circle') return [at('cx') - at('r'), at('cy') - at('r'), at('cx') + at('r'), at('cy') + at('r')];
  const d = /\bd="([^"]+)"/.exec(sh.geo)[1];
  const toks = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i = 0, cmd = null, cur = null, start = null;
  const take = (p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  while (i < toks.length) {
    if (/[MLCZ]/.test(toks[i])) { cmd = toks[i++]; if (cmd === 'Z') { cur = start; continue; } }
    if (cmd === 'M') { cur = start = [+toks[i++], +toks[i++]]; take(cur); cmd = 'L'; continue; }
    if (cmd === 'L') { cur = [+toks[i++], +toks[i++]]; take(cur); continue; }
    const q = [cur, [+toks[i++], +toks[i++]], [+toks[i++], +toks[i++]], [+toks[i++], +toks[i++]]];
    for (let n = 1; n <= 64; n++) { const t = n / 64, u = 1 - t; take([0, 1].map((k) => u * u * u * q[0][k] + 3 * u * u * t * q[1][k] + 3 * u * t * t * q[2][k] + t * t * t * q[3][k])); }
    cur = q[3];
  }
  return [x0, y0, x1, y1];
}

test('the two sets are the same drawings: the same shapes, as written in their masters, each set in its own colourway', () => {
  assert.deepEqual(files(MASTERS), NAMES, 'one master per name');
  for (const n of NAMES) {
    const w = drawnOf(path.join(WHITE, n + '.svg')), c = drawnOf(path.join(COLOUR, n + '.svg')), m = mastersOf(n);
    assert.equal(w.shapes.length, m.length, n + ': every shape of the master');
    assert.deepEqual(w.shapes.map((x) => x.tag + ' ' + x.geo), m.map((x) => x.tag + ' ' + x.geo), n + ': the white set is the master as written');
    assert.deepEqual(c.shapes.map((x) => x.tag + ' ' + x.geo), m.map((x) => x.tag + ' ' + x.geo), n + ': the colour set is the master as written');
    assert.deepEqual(w.shapes.map((x) => x.fill), m.map((x) => PALETTE.dark[x.role]), n + ': the white set in the dark colourway');
    assert.deepEqual(c.shapes.map((x) => x.fill), m.map((x) => PALETTE.light[x.role]), n + ': the colour set in the light colourway');
  }
  // the light colourway's mercury, inside the navy tube, is the pack's orange, so it reads against the tube
  assert.equal(PALETTE.light['therm-fill'], '#F2A844');
  assert.equal(PALETTE.light.therm, '#034C76');
});

test('one frame for every file of both sets, the largest icon at the share the rows have always given an icon', () => {
  const views = new Set();
  let widest = { share: 0 };
  for (const dir of [WHITE, COLOUR]) {
    for (const n of NAMES) {
      const f = drawnOf(path.join(dir, n + '.svg'));
      views.add(f.view);
      const [x, y, w, h] = f.view.split(' ').map(Number);
      assert.equal(w, h, n + ': a square frame');
      const b = f.shapes.map(extentOf).reduce((a, e) => [Math.min(a[0], e[0]), Math.min(a[1], e[1]), Math.max(a[2], e[2]), Math.max(a[3], e[3])]);
      assert.ok(b[0] > x && b[1] > y && b[2] < x + w && b[3] < y + h, n + ': inside its frame');
      assert.ok(Math.abs((b[0] + b[2]) / 2 - (x + w / 2)) < 0.06 && Math.abs((b[1] + b[3]) / 2 - (y + h / 2)) < 0.06, n + ': centred in its frame');
      const share = Math.max(b[2] - b[0], b[3] - b[1]) / w;
      if (share > widest.share) widest = { n, share };
    }
  }
  assert.deepEqual([...views], ['-9.09 -9.09 118.18 118.18'], 'one frame, so a row that swaps one set for the other never moves');
  // today's row icons: the glyph box is 78 % of the icon, the glyph 6 % inside it on each side
  assert.equal(widest.n, 'extreme-snow');
  assert.ok(Math.abs(widest.share - 0.78 / 1.12) < 0.001, 'the largest spans ' + (100 * widest.share).toFixed(2) + ' % of the frame');
});

// ── the ink copy's mask ───────────────────────────────────────────────────
// The ink copy fills a drawing with one colour, so where two parts overlap
// (the sun or moon behind the cloud, the bolt under it, the cloud behind,
// the mercury in its tube) one colour would merge them into one shape. The
// mask cuts every part back from the parts drawn in front of it, so the copy
// shows them apart, as the Solid look's glyphs do.
test('the ink copy\'s mask: the master\'s shapes as written, in white, each part cut back from the parts in front of it', () => {
  const FLAT = rd('scripts/wx-icons/flat.py');
  const gap = +/^INK_GAP = ([\d.]+)$/m.exec(FLAT)[1];
  assert.ok(gap >= 2.5 && gap <= 4, 'a gap of about a pixel at the rows\' 38 px (' + gap + ' of the frame\'s 118.18 units)');
  assert.match(FLAT, /^INK_PART = \{'ray': 'sun'\}$/m, 'the rays are the sun\'s own, no gap between them');
  const part = (role) => (role === 'ray' ? 'sun' : role);
  for (const n of NAMES) {
    const svg = fs.readFileSync(path.join(INKM, n + '.svg'), 'utf8');
    const box = 'x="-9.09" y="-9.09" width="118.18" height="118.18"';
    const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-9.09 -9.09 118.18 118.18"><mask id="wxk-' + n + '" maskUnits="userSpaceOnUse" ' + box + '><rect ' + box + ' fill="#000"/>';
    const tail = '</mask><rect ' + box + ' fill="#FFF" mask="url(#wxk-' + n + ')"/></svg>\n';
    assert.ok(svg.startsWith(head) && svg.endsWith(tail), n + ': one mask, the drawing\'s frame, shown whole');
    const body = svg.slice(head.length, svg.length - tail.length);
    const re = /<(path|circle) fill="(#000|#FFF)"( stroke="#000" stroke-width="([\d.]+)" stroke-linejoin="round")? ([^>]*?)\/>/g;
    assert.equal(body.replace(re, ''), '', n + ': nothing but the shapes and their cuts');
    const marks = [...body.matchAll(re)].map((m) => ({ key: m[1] + ' ' + m[5], white: m[2] === '#FFF', cut: !!m[3], width: +m[4] }));
    const m = mastersOf(n);
    assert.deepEqual(marks.filter((x) => x.white).map((x) => x.key), m.map((x) => x.tag + ' ' + x.geo), n + ': every shape of the master, as written, in order, in white');
    assert.ok(marks.every((x) => x.white !== x.cut), n + ': a shape is drawn in white, or as a cut in black with an edge');
    // the cuts: the shapes run by run (a run, the shapes of one part drawn
    // one after another), each run after the first cut out first, the gap
    // all round, then drawn: a cut falls on what lies behind, never on its own run
    const runs = [];
    for (const x of m) { if (runs.length && runs[runs.length - 1].part === part(x.role)) runs[runs.length - 1].shapes.push(x); else runs.push({ part: part(x.role), shapes: [x] }); }
    const want = runs.flatMap((r, k) => [...(k ? r.shapes.map((x) => 'cut ' + x.tag + ' ' + x.geo) : []), ...r.shapes.map((x) => 'white ' + x.tag + ' ' + x.geo)]);
    assert.deepEqual(marks.map((x) => (x.cut ? 'cut ' : 'white ') + x.key), want, n + ': run by run, each cut out of what lies behind it, then drawn');
    assert.ok(marks.filter((x) => x.cut).every((x) => Math.abs(x.width - 2 * gap) < 1e-9), n + ': the cut reaches INK_GAP past the shape');
  }
  // the drawings the review found merged in one colour now show their parts apart
  for (const n of ['overcast-day', 'overcast-night', 'thunderstorms', 'partly-cloudy-day-snow', 'thermometer-warmer', 'thermometer-colder', 'partly-cloudy-day']) {
    assert.ok(/stroke="#000"/.test(fs.readFileSync(path.join(INKM, n + '.svg'), 'utf8')), n + ': its parts cut apart');
  }
});

// ── many icons on one page ────────────────────────────────────────────────
test('no drawing carries an id, a style or a script, so any number of icons can share a page; each mask its own id', () => {
  for (const dir of [WHITE, COLOUR]) {
    for (const name of files(dir)) {
      const svg = fs.readFileSync(path.join(dir, name + '.svg'), 'utf8');
      assert.doesNotMatch(svg, /\bid=|<style|\bstyle=|<script|<image|<foreignObject|\bon[a-z]+=|href=|url\(|data-role|transform=/i, name + ': drawings only');
    }
  }
  for (const name of files(INKM)) {
    const svg = fs.readFileSync(path.join(INKM, name + '.svg'), 'utf8');
    assert.deepEqual([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]), ['wxk-' + name], name + ': one id, its own');
    assert.deepEqual([...svg.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]), ['#wxk-' + name], name + ': the mask it shows, and nothing else');
    assert.doesNotMatch(svg, /<style|\bstyle=|<script|<image|<foreignObject|\bon[a-z]+=|href=|data-role|transform=/i, name + ': a mask of drawings only');
  }
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

test('the stylesheet paints the white file, the colour file, or the ink copy\'s mask in the row\'s ink; nothing filters any of them', () => {
  const at = CSS.indexOf("v24054 — THE ROW WEATHER ICONS, BY THE ROW'S GROUND");
  assert.ok(at > 0);
  const block = CSS.slice(at, CSS.indexOf('/* ══', at + 10));
  assert.match(block, /#fidsTable \.fids-wx-row \{\s*background: var\(--wxr-w\) center \/ contain no-repeat !important;\s*filter: none !important;\s*\}/);
  assert.match(block, /#fidsTable \.fids-wx-row\[data-wx-set="colour"\] \{\s*background-image: var\(--wxr-c\) !important;\s*\}/);
  // the ink copy: its mask (the drawing's own shapes, its parts kept apart; the white file without one), filled with the ink the chooser wrote
  assert.match(block, /#fidsTable \.fids-wx-row\[data-wx-set="ink"\] \{\s*background: var\(--wxr-k, #111111\) !important;\s*-webkit-mask: var\(--wxr-m, var\(--wxr-w\)\) center \/ contain no-repeat !important;\s*mask: var\(--wxr-m, var\(--wxr-w\)\) center \/ contain no-repeat !important;\s*\}/);
  assert.doesNotMatch(block.slice(block.indexOf('*/') + 2).replace(/\/\*[\s\S]*?\*\//g, ''), /filter:(?!\s*none)/, 'no filter on any drawing');
  assert.doesNotMatch(CSS, /img\.fids-wx-glyph/, 'the solid glyph the rows drew before is gone with its darkening rule');
  assert.ok(at < CSS.indexOf('v24014 — THE WEATHER CARD IN THE AIRLINE'), 'the weather card block stays last');
});
