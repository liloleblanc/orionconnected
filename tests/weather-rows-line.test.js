'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24054 — THE ROW WEATHER ICONS DRAWN FOR ORION CONNECTED, CHOSEN BY GROUND.
//
// The departures and arrivals rows draw one of two sets drawn for Orion
// Connected (logos/weather/rows-line-white/ and rows-line-color/, built by
// scripts/wx-icons/rows-line.py): the white set on a dark ground, the colour
// set on a light ground. Each icon picks for itself from the colour it
// really sits on (fids-core.js _fidsRowWxSet). First the set the row calls
// for: wherever white holds less than 3:1 there the white set would vanish
// and the row calls for the colour set (yellow Delayed, orange Final call, a
// light Customize row, an airline's yellow or orange used as a row), whatever
// its text is inked; elsewhere the side the board's own ink took (the
// temperature beside the icon inked dark, the colour set; inked light, the
// white set). Then whether that drawing can be seen there: a drawing is worn
// where half of its pixels at 38 px stand at 3:1 on the ground (that set,
// then the other); where neither drawing can be (the colour set's gold sun
// and moon, pale clouds, white snow and fog on yellow, orange and light
// rows; the white set's thin lines on red Cancelled), the INK COPY: the
// white file's own shapes filled with the row's own text colour, and where
// that colour is itself too faint, the board's white or dark ink. No list of
// carriers or themes.
//
// This test pins:
//   · every reading the rows can draw (every MET symbol, by day and at night,
//     every WMO and Tomorrow.io code, every name a caller passes) to a file
//     that exists in BOTH sets, and the two folders to the same names;
//   · the pixel table the chooser reads (_WX_ROW_PX): one entry per file of
//     each set, made from the file as it is now (its SHA-1);
//   · the set the row calls for: never the white set where white holds under
//     3:1 on the ground, even under white text; otherwise the row's ink;
//     every airline palette in data/airline-colors.js and every board preset
//     run through it; the ink and the ground read as the page paints them
//     (alpha and opacity on the way);
//   · what each icon wears: the drawing where half of it stands at 3:1, else
//     the ink copy in the row's ink where a quarter of it does, else the most
//     legible of all; on every palette, every status ground and every
//     drawing, and on the status rows exactly (navy and black: the white
//     set; yellow, orange and light rows: the colour set's navy rain and storm clouds in
//     colour, every other drawing in the row's navy; red Cancelled: white);
//   · no gradient or clip id is used by two files, and every file's
//     references stay inside that file, so any number of icons can share a
//     page (inlined or not);
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
const WHITE = path.join(ROOT, 'fids-current/logos/weather/rows-line-white');
const COLOUR = path.join(ROOT, 'fids-current/logos/weather/rows-line-color');

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
        + '--wxr-w:url(/logos/weather/rows-line-white/rain.svg?v=v1);--wxr-c:url(/logos/weather/rows-line-color/rain.svg?v=v1);"></span>', look + (night ? ' night' : ' day'));
    }
  }
  const classic = helper({ look: 'classic' }).wxIconHtml(61, 48, { row: true });
  assert.match(classic, /src="\/logos\/weather\/animated\/rain\.svg/, 'Classic keeps its icons');
  assert.doesNotMatch(classic, /rows-line/);
});

// ── the chooser ────────────────────────────────────────────────────────────
const ROW_FNS = ['_wxRowPx', '_wxRowWhiteVanishes', '_wxRowSetFor', '_wxRowRgba', '_wxRowMix', '_wxRowLayers', '_wxRowSee', '_wxRowGround', '_wxRowText',
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
  const src = ['_wxRowWhiteVanishes', '_wxRowSetFor', '_wxRowShare', '_wxRowWear', '_fidsRowWxSet'].map((n) => fnSource(CORE, n)).join('\n');
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
// the share of the rendition an icon wears that stands at 3:1
const worn = (w, n, g) => (w.set === 'ink' ? PICK._wxRowShare(PICK._wxRowPx('white', n), flat(g), w.ink) : PICK._wxRowShare(PICK._wxRowPx(w.set, n), flat(g)));

test('the pixel table: one entry for every file of both sets, made from the file as it is now', () => {
  for (const [k, dir] of [['w', WHITE], ['c', COLOUR]]) {
    assert.deepEqual(Object.keys(PICK._WX_ROW_PX[k]).sort(), NAMES, k + ': one entry per file');
    for (const n of NAMES) {
      const e = PICK._WX_ROW_PX[k][n];
      const sha = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, n + '.svg'))).digest('hex').slice(0, 10);
      assert.equal(e.slice(0, 11), sha + ':', path.basename(dir) + '/' + n + '.svg has changed: run scripts/wx-icons/rows-line-pixels.js and put its table in fids-core.js');
      const g = PICK._wxRowPx(k === 'c' ? 'colour' : 'white', n);
      assert.ok(g.length >= 4 && g.length <= 24, n + ': ' + g.length + ' colour groups');
      assert.ok(g.every((p) => p.length === 5 && p[3] >= 128 && p[4] > 0), n + ': each group at least half covered, with a share');
      const sum = g.reduce((a, p) => a + p[4], 0);
      assert.ok(Math.abs(sum - 255) <= 12, n + ': the shares make the whole (' + sum + '/255)');
    }
  }
  // the white set's pixels are its white shapes and their thin blue edge
  assert.ok(PICK._wxRowPx('white', 'clear-day').every((p) => p[2] >= p[0]), 'white and blue, nothing warm');
});

test('each icon wears the drawing where half of it stands at 3:1, else its ink copy: the status rows', () => {
  const NAVY = [16, 36, 55, 1], WHITE_INK = [255, 255, 255, 1];
  // the board's objects come from its own realm: compare their values
  const wear = (g, ink, n) => { const w = PICK._wxRowWear(n, flat(g), PICK._wxRowSetFor(g, ink.slice(0, 3)), ink); return w.ink ? { set: w.set, ink: Array.from(w.ink) } : { set: w.set }; };
  const drawn = ['clear-day', 'clear-night', 'partly-cloudy-day', 'partly-cloudy-night', 'overcast', 'snow', 'fog'];
  const navyClouds = ['rain', 'drizzle', 'thunderstorms-rain', 'thunderstorms-day-rain'];
  // dark rows: the white set as drawn, every drawing
  for (const g of ['#012846', '#033F77', '#0A0A0A']) for (const n of NAMES) assert.deepEqual(wear(rgb(g), WHITE_INK, n), { set: 'white' }, g + ' ' + n);
  // yellow Delayed, orange Final call and the light rows: the colour set's navy rain and storm
  // clouds in colour, the drawings that cannot be seen there in the row's own navy
  for (const g of ['#F9D44C', '#EDBB00', '#F28C00', '#F7FAFD', '#FFFFFF', '#B3F0FF', '#88D5F7', '#F8FADB', '#E0EDD4']) {
    for (const n of drawn) {
      const w = wear(rgb(g), NAVY, n);
      assert.equal(w.set, 'ink', g + ' ' + n);
      assert.deepEqual(w.ink, NAVY, g + ' ' + n + ': the row\'s own ink');
      assert.ok(worn(w, n, rgb(g)) >= 0.6, g + ' ' + n + ' reads: ' + worn(w, n, rgb(g)).toFixed(2));
    }
    for (const n of navyClouds) assert.deepEqual(wear(rgb(g), NAVY, n), { set: 'colour' }, g + ' ' + n + ': as drawn');
    for (const n of NAMES) assert.notEqual(wear(rgb(g), NAVY, n).set, 'white', g + ' ' + n);
  }
  // red Cancelled: white, the white set where its lines hold, else the copy in the row's white
  for (const n of NAMES) {
    const w = wear(rgb('#D42341'), WHITE_INK, n);
    assert.ok(w.set === 'white' || (w.set === 'ink' && w.ink[0] === 255 && w.ink[2] === 255), n + ' on Cancelled: ' + JSON.stringify(w));
  }
  assert.equal(wear(rgb('#D42341'), WHITE_INK, 'clear-day').set, 'ink', 'the thin sun on Cancelled, in white');
  // the darker red Diverted and Pascan red hold the white set's lines
  for (const g of ['#A61B2B', '#A50D24']) for (const n of drawn) assert.deepEqual(wear(rgb(g), WHITE_INK, n), { set: 'white' }, g + ' ' + n);
});

// every ground a board can paint a row in (as above), every drawing: what it
// wears is a drawing half of which stands at 3:1, or the copy in the row's ink
// with a quarter at 3:1 and no less than either drawing, or else the most
// legible of the drawings and the copies in the row's ink and the board's two
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
      const draw = ['white', 'colour'].map((x) => PICK._wxRowShare(PICK._wxRowPx(x, name), flat(G)));
      const own = PICK._wxRowShare(PICK._wxRowPx('white', name), flat(G), K);
      const all = [...draw, own, ...PICK._WX_ROW_INKS.map((i) => PICK._wxRowShare(PICK._wxRowPx('white', name), flat(G), i))];
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
  assert.deepEqual(icons.map((i) => i.getAttribute('data-wx-set')), ['white', 'ink', 'ink', 'colour', 'ink', 'ink', 'colour'],
    'navy: the white set; red Cancelled: the sun in white; yellow Delayed: the sun in navy, the rain in colour; orange Final call and a white row: the copy in navy, the storm in colour');
  assert.deepEqual(icons.map((i) => i.style.getPropertyValue('--wxr-k')),
    ['', 'rgba(255, 255, 255, 1)', 'rgba(10, 34, 54, 1)', '', 'rgba(10, 34, 54, 1)', 'rgba(10, 34, 54, 1)', ''], 'the ink copy in the row text\'s own colour');
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
  // the ground unchanged, the ink changed (a palette with a new text colour): it picks again,
  // the colour set the dark text calls for (its gold sun reads on navy) ...
  icons[0]._t._color = 'rgb(0, 0, 0)';
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-ink'), '0,0,0');
  assert.equal(icons[0].getAttribute('data-wx-set'), 'colour');
  // ... but not its navy rain cloud, which cannot be seen there: the other set, the white rain
  icons[0].attrs['data-wxg'] = 'rain'; icons[0].attrs['data-wx-ink'] = '';
  PICK._fidsRowWxSet();
  assert.equal(icons[0].getAttribute('data-wx-set'), 'white');
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

test('the stylesheet paints the white file, the colour file, or the white file\'s shapes in the row\'s ink; nothing filters any of them', () => {
  const at = CSS.indexOf('v24054 — THE ROW WEATHER ICONS DRAWN FOR ORION CONNECTED');
  assert.ok(at > 0);
  const block = CSS.slice(at, CSS.indexOf('/* ══', at + 10));
  assert.match(block, /#fidsTable \.fids-wx-row \{\s*background: var\(--wxr-w\) center \/ contain no-repeat !important;\s*filter: none !important;\s*\}/);
  assert.match(block, /#fidsTable \.fids-wx-row\[data-wx-set="colour"\] \{\s*background-image: var\(--wxr-c\) !important;\s*\}/);
  // the ink copy: the white file as a mask (its own shapes), filled with the ink the chooser wrote
  assert.match(block, /#fidsTable \.fids-wx-row\[data-wx-set="ink"\] \{\s*background: var\(--wxr-k, #111111\) !important;\s*-webkit-mask: var\(--wxr-w\) center \/ contain no-repeat !important;\s*mask: var\(--wxr-w\) center \/ contain no-repeat !important;\s*\}/);
  assert.doesNotMatch(block.slice(block.indexOf('*/') + 2).replace(/\/\*[\s\S]*?\*\//g, ''), /filter:(?!\s*none)/, 'no filter on any drawing');
  assert.doesNotMatch(CSS, /img\.fids-wx-glyph/, 'the solid glyph the rows drew before is gone with its darkening rule');
  assert.ok(at < CSS.indexOf('v24014 — THE WEATHER CARD IN THE AIRLINE'), 'the weather card block stays last');
});
