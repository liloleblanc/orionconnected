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
  vm.runInContext(APP.slice(from, to) + '\n;globalThis.__app = { heroBrand: heroBrand, heroColors: heroColors, tileOf: tileOf };', ctx, { filename: 'app.html' });
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
    // that is not the accent its frame is drawn in, but where the airline has no darker colour
    assert.ok(contrast('#FFFFFF', b.bg1) >= 4.5 && contrast('#FFFFFF', b.bg2) >= 4.5, code + ': the Welcome card');
    if (code !== 'HF') assert.notEqual(up(b.bg1), c.accent, code + ': the card is not the colour of its frame');
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

test('the phone app header: the square of a carrier with no art is never the colour of the header behind it', () => {
  // The square of the app starts in the bar colour of the airline, and the header of its flight page is
  // that same colour: drawn as it was, the square was the header. It is stepped off the header now, as
  // it is off the card and the page (tileHtml, the grounds heroBrand hands it).
  let squares = 0;
  for (const code of Object.keys(CARRIERS)) {
    const hc = APPB.heroColors(code), html = APPB.heroBrand(code, O.BRAND[code].name, hc.light, [hc.bg].concat(hc.night ? [hc.night] : []));
    if (APPB.tileOf(code)) { assert.match(html, /<img class="tile /, code + ': its own tile'); continue; }
    squares++;
    const sq = (/<span class="tile mono" style="background:(#[0-9A-F]{6})">/i.exec(html) || [])[1];
    assert.ok(sq, code + ': a square of one colour: ' + html.slice(0, 120));
    assert.ok(W._orbDeltaE(sq, hc.bg) >= 20, code + ': the square ' + sq + ' on the header ' + hc.bg + ' (dE ' + W._orbDeltaE(sq, hc.bg).toFixed(1) + ')');
    assert.ok(contrast('#FFFFFF', sq) >= 3, code + ': its white letters');
    // a colour of the airline where one stands clear of its header (VietJet its red, Central Mountain Air
    // its gold, Air Cote d Ivoire its orange), else the bar colour stepped, its hue kept
    const r = AB[code];
    if ([r.r2, r.r3].includes(up(sq))) continue;
    const hue = (h) => { const L = W._orbLab(h); return Math.atan2(L[2], L[1]) * 180 / Math.PI; };
    let dh = Math.abs(hue(sq) - hue(r.r1)); if (dh > 180) dh = 360 - dh;
    assert.ok(dh < 30, code + ': ' + sq + ' is a shade of ' + r.r1 + ' (hue ' + dh.toFixed(0) + ' apart)');
  }
  assert.deepEqual(['VJ', '9M', 'HF'].map((c) => /background:(#[0-9A-F]{6})/i.exec(APPB.heroBrand(c, '', false, [AB[c].r1]))[1].toUpperCase()), [AB.VJ.r2, AB['9M'].r3, AB.HF.r3]);
  assert.equal(squares, 7, 'every carrier of the list but Royal Air Maroc draws the square');
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
