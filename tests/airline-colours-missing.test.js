'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE CARRIERS THAT WORE THE HOUSE COLOURS, NOVEMBER 2026
//
// Three hand-made lists colour a gate, and each surface reads its own:
//   · data/airline-colors.js (r1, r2, r3, body): the top band and its date
//     bar, the map ground, the lower right panel (_rc2Pair) and the header of
//     the phone app (heroColors in app.html);
//   · AIRLINE_BRAND in fids-core.js: the Welcome card (its gradient, bg1 to
//     bg2) and the name it types;
//   · AIRLINE_ACCENT in fids-core.js: the rail, its orbs and tabs, the gate
//     tab, the frames, by way of getAirlineAccent.
// A carrier missing from all three was drawn in the house grey and navy, and,
// where no finished tile gave its gate a colour either, in the stand-in blue
// #0033A1, a blue of no airline. Royal Air Maroc had the red of its tile on
// the rail and the house colours everywhere else; seven more had the stand-in
// blue on the whole gate. Each now has the colours of its own site, the site
// and the token named beside its row.
//
// The other carriers of the name tables that still fall to the stand-in blue
// are listed here by name, with the reason: the list may only shrink.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const FC = path.join(ROOT, 'fids-current');
const CORE = fs.readFileSync(path.join(FC, 'js/fids-core.js'), 'utf8');
const COLORS = fs.readFileSync(path.join(FC, 'data/airline-colors.js'), 'utf8');
const APP = fs.readFileSync(path.join(FC, 'app.html'), 'utf8');
const MARKS = require(path.join(ROOT, 'scripts/orbs/marks-shown.js'));

// the tables and getAirlineAccent as fids-core.js writes them (the sandbox of the orb tests)
const { O, W } = MARKS.build(CORE, FC);
const AB = new Function('window', COLORS + '\nreturn window.AIRLINE_BRAND_COLORS;')({});
// the two colours of the lower right panel, as written, with the tables handed in
function cut(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, 'still in the source: ' + from);
  return src.slice(a, b);
}
const RC = new Function(cut(CORE, 'var RC2_STATUS = {', 'function _ocGroundOf(el)') + '\nreturn { pair: _rc2Pair, contrast: _rc2Contrast, status: _rc2StatusLike };')();
const pair = (code) => RC.pair(code, { accent: O.ACCENT, brand: O.BRAND, colors: AB });
// the header of the phone app, as written
const heroColors = new Function('window', 'AIRLINE_BRAND_COLORS', 'WM_INK',
  cut(APP, 'function _lum(h){', '\n') + '\n' + cut(APP, 'function heroColors(code){', '\nfunction heroBrand(') + '\nreturn heroColors;')({ AIRLINE_BRAND_COLORS: AB }, AB, {});

// the builders of an airline mark in app.html, as they stand, over the tables the app loads (the stretch
// tests/airline-logos-own-host.test.js runs), and the square-stepping rule and colour measure they use
const APPB = (() => {
  const from = APP.indexOf('function esc(s){'), to = APP.indexOf('// Normalise an aircraft code/model to the livery file code');
  assert.ok(from > 0 && to > from);
  const ctx = {};
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/shared-names.js', 'data/airline-colors.js']) vm.runInContext(fs.readFileSync(path.join(FC, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(APP.slice(from, to) + '\n;globalThis.__app = { heroBrand: heroBrand, heroColors: heroColors, tileOf: tileOf, tileHtml: tileHtml };', ctx, { filename: 'app.html' });
  return ctx.__app;
})();
const contrast = RC.contrast;
const up = (h) => String(h || '').toUpperCase();
// the measure the gate uses for a light colour (_hexIsLight) and for the ink of its band (_silkInkLum)
const luma = (h) => 0.299 * parseInt(h.slice(1, 3), 16) + 0.587 * parseInt(h.slice(3, 5), 16) + 0.114 * parseInt(h.slice(5, 7), 16);
// the band: 12 per cent of the carrier colour against white (_silkTint), lettered in that colour where it is dark
const tint = (h, keep) => '#' + [1, 3, 5].map((i) => ('0' + Math.round(parseInt(h.slice(i, i + 2), 16) * keep + 255 * (1 - keep)).toString(16)).slice(-2)).join('');

// THE CARRIERS, with the site each colour was read off. AT takes the red of its rail from the ground
// of its finished tile, so it has no row in the accent table.
const CARRIERS = {
  AT: { site: 'royalairmaroc.com', accent: '#C20831', accentRow: false, lower: '#1A1717',
    row: { r1: '#690A22', r1Text: '#FFFFFF', r2: '#C20831', r3: '#B49360', body: '#F6F2ED', bodyText: '#1A1717' },
    brand: { bg1: '#690A22', bg2: '#1A1717', bg3: '#333231', accent: '#C20831', name: 'Royal Air Maroc' } },
  VJ: { site: 'vietjetair.com', accent: '#D91A21', accentRow: true, lower: '#6F0000',
    row: { r1: '#6F0000', r1Text: '#FFFFFF', r2: '#D91A21', r3: '#FBB612', body: '#F1F1F1', bodyText: '#333333' },
    brand: { bg1: '#6F0000', bg2: '#333333', bg3: '#CA161C', accent: '#D91A21', name: 'VietJet Air' } },
  D7: { site: 'airasia.com', accent: '#E32526', accentRow: true, lower: '#2C2B2F',
    row: { r1: '#8D1414', r1Text: '#FFFFFF', r2: '#E32526', body: '#F4F4F4', bodyText: '#2C2B2F' },
    brand: { bg1: '#8D1414', bg2: '#2C2B2F', bg3: '#E51837', accent: '#E32526', name: 'AirAsia X' } },
  FD: { site: 'airasia.com', accent: '#E32526', accentRow: true, lower: '#2C2B2F',
    row: { r1: '#8D1414', r1Text: '#FFFFFF', r2: '#E32526', body: '#F4F4F4', bodyText: '#2C2B2F' },
    brand: { bg1: '#8D1414', bg2: '#2C2B2F', bg3: '#E51837', accent: '#E32526', name: 'Thai AirAsia' } },
  '9M': { site: 'flycma.com', accent: '#D42E12', accentRow: true, lower: '#000000',
    row: { r1: '#B52720', r1Text: '#FFFFFF', r2: '#D42E12', r3: '#927635', body: '#F5F5F5', bodyText: '#000000' },
    brand: { bg1: '#B52720', bg2: '#000000', bg3: '#DC2F27', accent: '#D42E12', name: 'Central Mountain Air' } },
  BI: { site: 'flyroyalbrunei.com', accent: '#645138', accentRow: true, lower: '#412D12',
    row: { r1: '#412D12', r1Text: '#FFFFFF', r2: '#645138', r3: '#FFE600', body: '#F5F5F5', bodyText: '#412D12' },
    brand: { bg1: '#563C18', bg2: '#412D12', bg3: '#645138', accent: '#645138', name: 'Royal Brunei' } },
  // both of its colours are status colours (its greens are On time), so its lower panel is the
  // neutral dark of the board by the rule of that panel
  HF: { site: 'aircotedivoire.com', accent: '#027031', accentRow: true, lower: '#0C1119',
    row: { r1: '#027031', r1Text: '#FFFFFF', r2: '#027031', r3: '#BF5613', body: '#EDF4EF', bodyText: '#027031' },
    brand: { bg1: '#027031', bg2: '#000000', bg3: '#1BA455', accent: '#027031', name: 'Air Côte d’Ivoire' } },
  KP: { site: 'flyasky.com', accent: '#6C321A', accentRow: true, lower: '#6C321A',
    row: { r1: '#6C321A', r1Text: '#FFFFFF', r2: '#6C321A', r3: '#F2A41E', body: '#F3F3F3', bodyText: '#6C321A' },
    brand: { bg1: '#481B16', bg2: '#292B2C', bg3: '#6C321A', accent: '#6C321A', name: 'ASKY Airlines' } }
};

// THE CARRIERS OF THE NAME TABLES THAT STILL WEAR THE STAND-IN BLUE, and why. Shrink it, never grow it.
const NOT_LOOKED_UP = 'not yet read off its own site';
const UNCONFIRMED = Object.assign(Object.fromEntries(
  ('2T 3K 4B 4O 4T 5F 7F 8M 8T 9C 9K AN AX BBQ BJ BM C5 CP DO EM EV FP G6 G7 H4 IV IZ JA KA KG KO LF LR MT NF NK '
    + 'OD OK P4 PA PJ RP S5 SM TW VF W3 W8 XN YX ZG ZP ZW').split(' ').map((c) => [c, NOT_LOOKED_UP])), {
  // its green (#04A64B in an earlier sweep) could not be confirmed: its site answers no automated client
  VB: 'vivaaerobus.com refuses automated clients, so its colours were not confirmed on its own site'
});

test('every carrier of the list has its row in the three lists, as its own site gives them', () => {
  for (const [code, c] of Object.entries(CARRIERS)) {
    assert.deepEqual(AB[code], c.row, code + ': data/airline-colors.js');
    assert.deepEqual(O.BRAND[code], c.brand, code + ': AIRLINE_BRAND');
    // the site each value came from is named beside the row
    assert.ok(COLORS.includes(c.site), code + ': data/airline-colors.js names ' + c.site);
    // the rail, its orbs, its tabs and the gate tab: one colour, the accent of AIRLINE_BRAND too
    assert.equal(up(O.accent(code)), c.accent, code + ': getAirlineAccent');
    assert.equal(up(O.BRAND[code].accent), c.accent, code + ': the accent of AIRLINE_BRAND is the colour of the rail');
    if (c.accentRow) assert.equal(O.ACCENT[code], c.accent, code + ': AIRLINE_ACCENT');
    else assert.equal(O.ACCENT[code], undefined, code + ': no row, the ground of its tile');
  }
  // Royal Air Maroc: the red of its site is the ground of its tile and the second colour of its row
  assert.deepEqual([W._ORB_TILE_GROUNDS.RAM, O.TILE.AT, AB.AT.r2], ['#C20831', 'RAM', '#C20831']);
  // AirAsia X and Thai AirAsia are AirAsia airlines: the red of AK and QZ, one row for the two
  assert.deepEqual([O.ACCENT.D7, O.ACCENT.FD], [O.ACCENT.AK, O.ACCENT.QZ]);
  assert.deepEqual(AB.D7, AB.FD);
});

test('the surfaces read the lists these rows are in', () => {
  // the band and its date bar: the row of the carrier, merged over the built-in specs
  assert.match(CORE, /Object\.assign\(BANNER_COLOR_SPEC, window\.AIRLINE_BRAND_COLORS\)/);
  assert.match(CORE, /var _silkDark = _apIsYQM \? '#F5F1E7' : _silkTint\(_silkBase, 0\.12\);/);
  assert.match(CORE, /\? \(\(!_apIsYQM && _silkInkLum < 120\) \? _silkBase : '#0A2E6B'\)/);
  // the Welcome card: the gradient of AIRLINE_BRAND, the house navy only where it has no row
  assert.match(CORE, /bg: fb \? 'linear-gradient\(135deg,' \+ fb\.bg1 \+ ' 0%,' \+ fb\.bg2 \+ ' 100%\)' : 'linear-gradient\(135deg,#14213d 0%,#0b1020 100%\)',/);
  // the phone app header: r1 of the row, navy only where it has none
  assert.match(APP, /const bg=\(b&&b\.r1\)\|\|'#0b1f3a'/);
});

test('words read on every surface these colours paint, at 4.5 to 1', () => {
  for (const [code, c] of Object.entries(CARRIERS)) {
    const r = AB[code], b = O.BRAND[code];
    // the date bar and the map ground are r1 (a dark r1 is painted as it is), under white words
    assert.ok(luma(r.r1) <= 170 && contrast('#FFFFFF', r.r1) >= 4.5, code + ': the date bar ' + r.r1);
    // the band: the pale tint of r1, lettered in r1
    assert.ok(luma(r.r1) < 120, code + ': the band is lettered in its own colour');
    assert.ok(contrast(r.r1, tint(r.r1, 0.12)) >= 4.5, code + ': the band, ' + r.r1 + ' on ' + tint(r.r1, 0.12));
    // the rail tabs and the gate tab: white words on the accent
    assert.ok(luma(c.accent) <= 170 && contrast('#FFFFFF', c.accent) >= 4.5, code + ': white words on its accent ' + c.accent);
    // the titles of the light cards are r2
    assert.ok(luma(r.r2) <= 170 && contrast(r.r2, '#FFFFFF') >= 4.5, code + ': the titles, ' + r.r2 + ' on white');
    assert.ok(contrast(r.bodyText, r.body) >= 4.5, code + ': the body');
    // the Welcome card: white words from one end of its gradient to the other; it starts on a colour
    // that is not the accent its frame is drawn in, but for Air Cote d Ivoire, whose darkest site green
    // is its accent: its card starts in the green of its frame and runs to its black
    assert.ok(contrast('#FFFFFF', b.bg1) >= 4.5 && contrast('#FFFFFF', b.bg2) >= 4.5, code + ': the Welcome card');
    if (code !== 'HF') assert.notEqual(up(b.bg1), c.accent, code + ': the card is not the colour of its frame');
    else assert.deepEqual([up(b.bg1), up(b.bg2)], [c.accent, '#000000'], 'HF: the green of its frame to its black');
    // the phone app header: the row's own ink on the row's own bar
    const h = heroColors(code);
    assert.deepEqual([h.bg, h.ink, h.light], [r.r1, r.r1Text, false], code + ': the app header');
    assert.ok(contrast(h.ink, h.bg) >= 4.5, code + ': the app header words');
    // the lower right panel: its two colours, no status colour among them, words that read
    const p = pair(code);
    assert.equal(p.b, c.lower, code + ': the second colour of the lower panel');
    assert.ok(contrast(p.ink, p.a) >= 4.5 && contrast('#FFFFFF', p.b) >= 4.5, code + ': ' + JSON.stringify(p));
    assert.ok(!RC.status(p.a) && !RC.status(p.b), code + ': no status colour on the panel');
  }
});

// THE SQUARE OF THE FLIGHT PAGE, carrier by carrier: what it is and why. It sinks into the header for
// each of the seven (the header is the bar colour of the airline, which is where the square starts), so
// it steps away to a square that stands clear of the header with white letters at 4.5 to 1.
const FLIGHT_SQUARES = {
  VJ: ['#D91A21', 'its primary light red, as it is'],
  D7: ['#2C2B2F', 'the text colour of airasia.com: its AirAsia red sinks into the dark red header (17.9) and no red that holds white words at 4.5 to 1 stands clear of it'],
  FD: ['#2C2B2F', 'as AirAsia X'],
  '9M': ['#8C7133', 'its gold #927635 one step darker (white on the gold is 4.32 to 1)'],
  BI: ['#916428', 'its bar colour stepped off the header (its brown #645138 sinks into it, its yellow holds white words at 1.27 to 1)'],
  HF: ['#BF5613', 'its dark orange, as it is'],
  KP: ['#9B6913', 'the gold of its logo #F2A41E, nine steps darker (the first that holds white words at 4.5 to 1)']
};
const hex6 = (s) => {
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  const m = /^hsl\((\d+),(\d+)%,(\d+)%\)$/.exec(s);
  const h = +m[1], S = +m[2] / 100, l = +m[3] / 100, q = l < 0.5 ? l * (1 + S) : l + S - l * S, p = 2 * l - q;
  const f = (t) => { t = ((t % 360) + 360) % 360 / 360; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return '#' + [f(h + 120), f(h), f(h - 120)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const squareOf = (html) => (/<span class="tile mono" style="background:([^"]+)">/.exec(html) || [])[1];
const flightPage = (code) => { const hc = APPB.heroColors(code); return { hc, ground: [hc.bg].concat(hc.night ? [hc.night] : []), html: APPB.heroBrand(code, 'Some Airline', hc.light, [hc.bg].concat(hc.night ? [hc.night] : [])) }; };

test('the phone app header: the square of a carrier with no art is never the colour of the header behind it', () => {
  let squares = 0;
  for (const code of Object.keys(CARRIERS)) {
    const { hc, html } = flightPage(code);
    if (APPB.tileOf(code)) { assert.match(html, /<img class="tile /, code + ': its own tile'); continue; }
    squares++;
    const sq = squareOf(html);
    assert.equal(sq, FLIGHT_SQUARES[code][0], code + ': ' + FLIGHT_SQUARES[code][1]);
    // the square it would be on every other page sinks into this header
    const elsewhere = hex6(squareOf(APPB.tileHtml(code)));
    assert.ok(W._orbDeltaE(elsewhere, hc.bg) < 20, code + ': ' + elsewhere + ' sinks into ' + hc.bg);
    // the square of the flight page stands clear of it, its white letters at 4.5 to 1
    assert.ok(W._orbDeltaE(sq, hc.bg) >= 20, code + ': the square ' + sq + ' on the header ' + hc.bg + ' (dE ' + W._orbDeltaE(sq, hc.bg).toFixed(1) + ')');
    assert.ok(contrast('#FFFFFF', sq) >= 4.5, code + ': its white letters at ' + contrast('#FFFFFF', sq).toFixed(2) + ' to 1');
  }
  assert.equal(squares, 7, 'every carrier of the list but Royal Air Maroc draws the square');
  // a colour of the airline, or that colour a darker step at a time, where one stands clear
  const darker = (h, k) => '#' + [1, 3, 5].map((i) => ('0' + Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - k * 0.04)).toString(16)).slice(-2)).join('').toUpperCase();
  assert.deepEqual([AB.VJ.r2, AB.HF.r3, darker(AB['9M'].r3, 1), darker(AB.KP.r3, 9), AB.D7.bodyText], ['#D91A21', '#BF5613', '#8C7133', '#9B6913', '#2C2B2F']);
});

test('the flight page keeps the square of every other page, unless that square sinks into its header', () => {
  // Every code that can draw the square: every two characters a feed may send, and every code of the
  // name and colour tables. The square of the flight page is the square of every other page (tileHtml
  // with no header, the rule of main) wherever that one stands clear of the header; where it sinks into
  // the header (CIEDE2000 under 20) it steps away, clear of it, white letters at 4.5 to 1.
  const AL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const codes = [...new Set([...AL.flatMap((a) => AL.map((b) => a + b)), ...Object.keys(O.NAME), ...Object.keys(O.NAME2), ...Object.keys(AB)])];
  let kept = 0, away = 0, tiles = 0;
  const stepped = [];
  for (const code of codes) {
    const { ground, html } = flightPage(code);
    const own = APPB.tileHtml(code);
    if (APPB.tileOf(code)) { assert.ok(html.includes(own), code + ': its own tile'); tiles++; continue; }
    const sq = squareOf(html), was = squareOf(own);
    const sinks = ground.some((g) => W._orbDeltaE(hex6(was), hex6(g)) < 20);
    if (!sinks) { assert.equal(sq, was, code + ': the square of every other page'); kept++; continue; }
    away++;
    if (!CARRIERS[code]) stepped.push(code);
    for (const g of ground) assert.ok(W._orbDeltaE(hex6(sq), hex6(g)) >= 20, code + ': ' + sq + ' on ' + g);
    assert.ok(contrast('#FFFFFF', hex6(sq)) >= 4.5, code + ': ' + sq + ' white at ' + contrast('#FFFFFF', hex6(sq)).toFixed(2));
  }
  assert.equal(kept + away + tiles, codes.length);
  assert.ok(codes.length >= 1296 && kept >= 1000, codes.length + ' codes, ' + kept + ' kept, ' + away + ' stepped away, ' + tiles + ' tiles');
  // the ones that step: the seven, LATAM Colombia on its indigo, and codes with no colours whose square
  // came within 20 of the house navy of the header
  assert.ok(stepped.includes('4C') && !stepped.includes('RV') && !stepped.includes('WG'), stepped.join(' '));
  for (const code of stepped.filter((c) => c !== '4C')) assert.equal(APPB.heroColors(code).bg.toLowerCase(), '#0b1f3a', code);
  assert.ok(away >= 7, away + ' stepped away');
});

// THE NAME TYPED IN THE ROW: the accent of its carrier only where it reads at 4.5 to 1 on both stripes
// of the board as painted, else the row ink. The AirAsia red typed AirAsia X and Thai AirAsia at 4.19
// to 4.24 to 1 on the pale even rows of the light presets, and at 3.2 to 1 on the even row of mist.
const fnBody = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); };
const fidsContrast = new Function(fnBody(CORE, 'function _fidsRelLum(c) {', 'function _fidsInk(') + '\nreturn _fidsContrast;')();
const THEMES = new Function(fnBody(CORE, 'const THEMES = {', 'const THEME_LIST') + '\nreturn THEMES;')();
const groundsOf = new Function('document', 'getComputedStyle', 'THEMES', 'currentTheme',
  fnBody(CORE, 'function _boardRowGrounds() {', '// IATA → emblem-only icon URL') + '\nreturn _boardRowGrounds;');
const nameInk = new Function('_brandColor', '_nameGrounds', '_fidsContrast', 'wordmarkVariant', '_hexLum',
  fnBody(CORE, '      if (_brandColor && _nameGrounds.length === 2) {', '    } catch (e) {}') + '\nreturn _brandColor;');
// a board of stand-in elements: the computed background of each is its own, as getComputedStyle gives it
function board(rowBgs, tableBg, dynamic) {
  const el = (bg, parent) => ({ nodeType: 1, bg, parentElement: parent });
  const html = el('rgba(0, 0, 0, 0)', null), body = el('rgb(0, 0, 0)', html), table = el(tableBg, body), tbody = el('rgba(0, 0, 0, 0)', table);
  const rows = rowBgs.map((bg) => { const tr = el(bg, tbody), td = el('rgba(0, 0, 0, 0)', tr); tr.querySelector = (q) => (/^td/.test(q) ? td : null); return tr; });
  tbody.children = rows;
  return { body, querySelectorAll: () => rows, getElementById: (id) => (id === 'fidsTable' ? table : (id === 'dynamicTheme' && dynamic) ? {} : null) };
}
const read = (doc, theme) => groundsOf(doc, (e) => ({ backgroundColor: e.bg }), THEMES, theme || 'gold')();

test('the typed row name: the stripes of the board as painted, read once a page', () => {
  assert.match(CORE, /const _nameGrounds = _boardRowGrounds\(\);\n  const _newHtml = pageFlights\.map\(f => \{/);
  // the rows as painted, each stripe on its own (mist, as measured on the board)
  assert.deepEqual(read(board(['rgb(231, 227, 221)', 'rgb(221, 215, 208)', 'rgb(231, 227, 221)'], 'rgb(199, 210, 221)')), ['#e7e3dd', '#ddd7d0']);
  // a see-through stripe laid over the table under it (the default board: no odd ground, a 2.5 per cent white even one)
  assert.deepEqual(read(board(['rgba(0, 0, 0, 0)', 'rgba(255, 255, 255, 0.025)'], 'rgb(12, 30, 58)')), ['#0c1e3a', '#12243f']);
  // no row yet: the preset in use, else the ground of the table
  assert.deepEqual(read(board([], 'rgb(12, 30, 58)', true), 'gold'), [THEMES.gold.rowOdd, THEMES.gold.rowEven]);
  assert.deepEqual(read(board([], 'rgb(12, 30, 58)', false)), ['#0c1e3a', '#0c1e3a']);
});

test('the typed row name keeps its accent only where it reads at 4.5 to 1 on both stripes', () => {
  const ink = (accent, grounds, variant) => nameInk(accent, grounds, fidsContrast, () => variant || 'dark', (h) => { const n = parseInt(h.slice(1), 16), l = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * l((n >> 16) & 255) + 0.7152 * l((n >> 8) & 255) + 0.0722 * l(n & 255); });
  const red = O.BRAND.D7.accent;
  assert.equal(red, O.BRAND.FD.accent);
  // the light presets (white odd rows, pale even rows) and mist, as painted: the row ink
  for (const t of ['gold', 'light', 'slate', 'aircanada', 'westjet']) {
    assert.ok(fidsContrast(red, THEMES[t].rowEven) < 4.5 && fidsContrast(red, THEMES[t].rowOdd) >= 4.5, t);
    assert.equal(ink(red, [THEMES[t].rowOdd, THEMES[t].rowEven]), '', t + ': the AirAsia red on its even row');
  }
  assert.equal(ink(red, ['#E7E3DD', '#DDD7D0']), '', 'mist');
  // where it reads on both, it stays: VietJet on gold (5.10 and 4.64 to 1)
  assert.equal(ink(O.BRAND.VJ.accent, [THEMES.gold.rowOdd, THEMES.gold.rowEven]), O.BRAND.VJ.accent);
  // a dark accent on a dark board, as before: the row ink (Qatar maroon on the teal)
  assert.equal(ink('#5c0931', ['#1E7EB8', '#2DA4C4']), '');
  // no stripe read at all: the old guard (dark board, dark accent)
  assert.equal(ink('#5c0931', [], 'light'), '');
  assert.equal(ink(red, [], 'dark'), red);
});

test('the house colours are gone from their gates, but where a rule of the board keeps them', () => {
  for (const [code, c] of Object.entries(CARRIERS)) {
    assert.notEqual(up(O.accent(code)), '#0033A1', code + ': the stand-in blue');
    assert.ok(!['#0C1119', '#0F172A', '#14213D', '#0B1F3A'].includes(up(AB[code].r1)), code + ': the band and date bar');
    assert.notEqual(up(heroColors(code).bg), '#0B1F3A', code + ': the app header');
    assert.notEqual(up(O.BRAND[code].bg1), '#14213D', code + ': the Welcome card');
    // the lower panel keeps the neutral dark only where both colours of the carrier are status colours
    if (c.lower === '#0C1119') assert.ok([c.accent, AB[code].r1, AB[code].r2, AB[code].r3, AB[code].bodyText].every((h) => RC.status(h)), code);
  }
});

test('no carrier of the name tables falls to the stand-in blue unless it is listed, with its reason', () => {
  const codes = [...new Set([...Object.keys(O.NAME), ...Object.keys(O.NAME2)])].sort();
  const blue = codes.filter((c) => up(O.accent(c)) === '#0033A1');
  const listed = Object.keys(UNCONFIRMED).sort();
  assert.deepEqual(blue.filter((c) => !UNCONFIRMED[c]), [], 'these fall to the stand-in blue and are not listed: give them their colours or list them');
  assert.deepEqual(listed.filter((c) => !blue.includes(c)), [], 'these are listed but have a colour now: take them out of the list');
  for (const code of Object.keys(CARRIERS)) assert.ok(!UNCONFIRMED[code], code);
  assert.ok(Object.values(UNCONFIRMED).every((why) => typeof why === 'string' && why.length > 10));
  assert.ok(listed.length <= 54, listed.length + ' listed, up from 54');
});
