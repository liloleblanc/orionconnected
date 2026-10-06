'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE WEATHER CARD IN THE AIRLINE'S COLOURS — v24014.
//
// The chosen design for the three screens, between the calm near-black option
// and the airline-tinted one:
//   · the near-black ground over the weather footage at 70 %, so the footage
//     plays at 30 % behind every screen and a storm take's lightning can
//     never flash the card;
//   · white type and the board's own flat icons, drawn white and still;
//   · the airline's colour on the bands (Departure | Arrival, the hours and
//     days title) and the airport-code chips, with the airline's own ink;
//   · a light airline tint on the plates and tiles;
//   · the larger sizes: city 78 and temperature 158 on the first screen at
//     1680x1050, hours at 96, days at 88, nothing cut.
// The screens, their timing and their data are the v23836–v24009 card's; the
// entrance and scene tests still pin those. These pin the look.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');
const COLORS_SRC = fs.readFileSync(path.join(ROOT, 'fids-current/data/airline-colors.js'), 'utf8');
const FLAT = path.join(ROOT, 'fids-current/logos/weather/flat');

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
function table(name) {
  const i = CORE.indexOf('const ' + name + ' = {');
  assert.ok(i >= 0, name + ' must exist');
  const j = CORE.indexOf('\n};', i);
  return vm.runInNewContext('(' + CORE.slice(CORE.indexOf('{', i), j + 2) + ')');
}

// The board's pair resolver (RC2_STATUS … _rc2Pair) and the card's look
// (_WX_LOOK … _wxWhiteStill), run as the board runs them, on its own tables.
const RC2_SRC = (() => {
  const a = CORE.indexOf('var RC2_STATUS = {');
  const pairFn = fnSource('_rc2Pair');
  return CORE.slice(a, CORE.indexOf(pairFn, a) + pairFn.length);
})();
const LOOK_SRC = (() => {
  const a = CORE.indexOf('var _WX_LOOK = {');
  assert.ok(a >= 0, '_WX_LOOK must exist');
  const last = fnSource('_wxWhiteStill');
  return CORE.slice(a, CORE.indexOf(last, a) + last.length);
})();
const SANDBOX = { window: {} };
vm.runInNewContext(COLORS_SRC, SANDBOX);
SANDBOX.AIRLINE_ACCENT = table('AIRLINE_ACCENT');
SANDBOX.AIRLINE_BRAND = table('AIRLINE_BRAND');
SANDBOX.AIRLINE_BRAND_COLORS = SANDBOX.window.AIRLINE_BRAND_COLORS;
const L = vm.runInNewContext(RC2_SRC + '\n' + LOOK_SRC + '\n({ RC2_STATUS, RC2_PAIRS, _rc2StatusLike, _rc2Contrast, _rc2Rgb, _wxAirlineLook, _wxWhiteStill, _wxMix, _WX_GROUND_DIM, _WX_TINT, _WX_ICON_FRAME });', SANDBOX);
const look = (c) => ({ ...L._wxAirlineLook(c) });
const rgbOf = (s) => String(s).split(',').map(Number);
const tintOf = (p) => { const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(p); assert.ok(m, 'tint ' + p); return { c: [+m[1], +m[2], +m[3]], a: +m[4] }; };
const hex = (c) => '#' + c.map((v) => ('0' + Math.round(v).toString(16)).slice(-2)).join('').toUpperCase();

// The v24014 block, from its header to the end of the file (it is the last).
const AT = CSS.indexOf("/* ══ v24014 — THE WEATHER CARD IN THE AIRLINE'S COLOURS");
const BLOCK = AT >= 0 ? CSS.slice(AT) : '';
const RULES = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const PREFIX = 'html body' + ':not(#_)'.repeat(260) + ' ';
function rule(tail) {
  const hits = RULES.split('\n').filter((l) => l.startsWith(PREFIX) && l.slice(0, l.indexOf(' {')).split(', ').some((s) => s === PREFIX + tail));
  assert.ok(hits.length, 'the v24014 block must have a rule for ' + tail);
  const l = hits[hits.length - 1];
  return l.slice(l.indexOf('{') + 1, l.lastIndexOf('}'));
}
const AC_FAMILY = ['AC', 'ACA', 'QK', 'JZA', 'RV', 'ROU'];

test('the block is one booster on every selector, written last, and moves nothing', () => {
  assert.ok(BLOCK.length > 1000, 'the v24014 block exists');
  assert.ok(AT > CSS.indexOf('v24004 — THE CAPTION IS ONE ROW'), 'it comes after every earlier block');
  const lines = RULES.split('\n').filter((l) => /\{/.test(l));
  assert.ok(lines.length > 60, 'its rules: ' + lines.length);
  for (const l of lines) {
    for (const s of l.slice(0, l.indexOf(' {')).split(', ')) assert.ok(s.startsWith(PREFIX + '.wxcard-wrap'), 'every selector carries the booster and the card: ' + s.slice(-80));
  }
  assert.doesNotMatch(RULES, /animation|transition|@keyframes/, 'nothing in the look moves or flashes');
  assert.doesNotMatch(RULES, /:has\(/, 'no :has(): the kiosk browsers drop it');
  // nothing amber: the lozenge, the chips, the ▲ and the lit dot were the Delayed colour's family
  assert.doesNotMatch(BLOCK, /--wxn-amber|#f5c953|#fff200/i, 'no amber decoration');
  // a height term always beside a width term (the house rule, v23730)
  for (const m of RULES.matchAll(/(?:min|max|clamp)\([^;]*?vh[^;]*?\)/g)) assert.match(m[0], /vw/, m[0]);
});

test('the bands and chips are the airline\'s: Air Canada red, Porter cream with navy, WestJet teal with navy', () => {
  assert.deepEqual([look('AC').a, look('AC').ink], ['#A6192E', '#FFFFFF'], 'Air Canada: its deep red, white type');
  assert.deepEqual([look('PD').a, look('PD').ink], ['#EFE8DA', '#152C53'], 'Porter: cream, navy type');
  assert.deepEqual([look('WS').a, look('WS').ink], ['#00B2A9', '#002B55'], 'WestJet: teal, navy type (white on teal is 2.6:1)');
  // the tints the design was drawn and measured with
  assert.deepEqual([look('AC').g, look('AC').p], ['11,13,16', 'rgba(26,16,19,0.55)']);
  assert.deepEqual([look('PD').g, look('PD').p], ['12,16,24', 'rgba(19,41,76,0.55)']);
  assert.deepEqual([look('WS').g, look('WS').p], ['10,17,20', 'rgba(11,58,59,0.55)']);
  // and the same carrier under the codes it reaches the gate with
  for (const c of ['QK', 'RV', 'JZA', 'ACA']) assert.deepEqual(look(c).a + look(c).p, look('AC').a + look('AC').p, c + ' flies as Air Canada');
  for (const c of ['WR', 'WJA']) assert.deepEqual(look(c).a + look(c).p, look('WS').a + look('WS').p, c + ' flies as WestJet');
  assert.equal(look('POE').a, '#EFE8DA');
  // the band, the chip, the token and the lit dot all read the same two properties
  for (const t of ['.wxcard-wrap .wxc-s1 .wxc-mon-head', '.wxcard-wrap > .wxc-s2 > .wxc-sc-title', '.wxcard-wrap .wxc-s1 .wxc-mon-iata', '.wxcard-wrap .wxc-s1 .wxc-mon-link > .wxc-mon-tok']) {
    assert.match(rule(t), /background: var\(--wxc-a\) !important/, t);
    assert.match(rule(t), /color: var\(--wxc-a-ink\) !important/, t);
  }
  assert.match(rule('.wxcard-wrap .wxc-dots i.on'), /background: var\(--wxc-a\) !important/);
  for (const t of ['.wxcard-wrap .wxc-s1 .wxc-mon-side', '.wxcard-wrap > .wxc-s2 > .wxc-chart.wxc-hgrid', '.wxcard-wrap > .wxc-s3 > .wxc-days', '.wxcard-wrap > .wxc-s3 > .wxc-facts']) {
    assert.match(rule(t), /background: var\(--wxc-p\) !important/, 'the light tint on ' + t);
  }
});

test('every carrier the board knows: a band that is never a status colour, never amber, with legible type and tiles', () => {
  const codes = new Set([...Object.keys(SANDBOX.AIRLINE_ACCENT), ...Object.keys(SANDBOX.AIRLINE_BRAND), ...Object.keys(SANDBOX.AIRLINE_BRAND_COLORS || {}), ...Object.keys(L.RC2_PAIRS)]);
  ['WO', 'NK', 'Y9', 'SY', 'G4', 'ZZ', ''].forEach((c) => codes.add(c));
  assert.ok(codes.size > 90, 'the board\'s carriers: ' + codes.size);
  for (const code of codes) {
    const k = look(code), at = (code || '(none)') + ' ' + JSON.stringify(k);
    assert.notEqual(L._rc2StatusLike(k.a), 'delayed', 'never amber: ' + at);
    if (!AC_FAMILY.includes(code)) assert.equal(L._rc2StatusLike(k.a), '', 'the band is no status colour: ' + at);
    assert.ok(L._rc2Contrast(k.a, k.ink) >= 4.5, 'the band\'s words at 4.5:1: ' + at);
    const g = rgbOf(k.g), t = tintOf(k.p), tile = L._wxMix(g, t.c, t.a);
    assert.equal(t.a, 0.55, 'the light tint: ' + at);
    assert.equal(L._rc2StatusLike(hex(t.c)), '', 'the tint is no status colour: ' + at);
    assert.ok(L._rc2Contrast('#FFFFFF', hex(tile)) >= 7, 'white words on a tile at 7:1: ' + at);
    assert.ok(Math.max(...g) <= 40, 'the ground is a near-black: ' + at);
  }
});

test('the footage plays at 30 % under one near-black layer, so even a lightning frame leaves white type legible', () => {
  assert.equal(L._WX_GROUND_DIM, 0.70);
  const scrim = rule('.wxcard-wrap::after');
  assert.match(scrim, /content: '' !important; display: block !important; position: absolute !important; inset: 0 !important; z-index: 1 !important; pointer-events: none !important; background: rgba\(var\(--wxc-g, 11,13,16\), \.70\) !important;/);
  assert.doesNotMatch(scrim, /opacity|animation|transform/, 'the layer never fades or moves with a screen');
  // over every clip (z ≤ 1, earlier in the wrap) and under every screen (z 2)
  const vids = [...CSS.matchAll(/\.wxcard-wrap > video\.wxc-vid \{[^}]*z-index: (\d+) !important/g)].map((m) => +m[1]);
  assert.ok(vids.length && vids.every((z) => z <= 1), 'the clips sit at or under the layer: ' + vids);
  const scr = [...CSS.matchAll(/\.wxcard-wrap > \.wxc-screen \{[^}]*z-index: (\d+) !important/g)].map((m) => +m[1]);
  assert.ok(scr.length && scr.every((z) => z >= 2), 'the screens sit over it: ' + scr);
  assert.match(rule('.wxcard-wrap > .wxc-screen'), /background: transparent !important/);
  // the screens' own scrim of v23843 would have doubled the layer during each crossfade; it is gone
  // The flash: a white lightning frame (255) through the layer, then the tile tint over that.
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const cr = (c) => 1.05 / (lum(c) + 0.05);
  for (const code of ['AC', 'PD', 'WS', 'F8', 'DL', 'UA', 'TS', 'HA']) {
    const k = look(code), g = rgbOf(k.g), t = tintOf(k.p);
    const ground = [0, 1, 2].map((i) => 255 * (1 - L._WX_GROUND_DIM) + g[i] * L._WX_GROUND_DIM);
    const tile = [0, 1, 2].map((i) => ground[i] * (1 - t.a) + t.c[i] * t.a);
    assert.ok(cr(ground) >= 4.5, `${code}: white type over a white flash, on the bare ground, ${cr(ground).toFixed(2)}:1`);
    assert.ok(cr(tile) >= 4.5, `${code}: and on a tile, ${cr(tile).toFixed(2)}:1`);
  }
});

test('the card wears the gate\'s airline, set in place on every render path', () => {
  const src = fnSource('_renderWxCard');
  assert.match(src, /var _wxLk = _wxAirlineLook\(_wxAl\);/);
  for (const p of ['--wxc-a', '--wxc-a-ink', '--wxc-g', '--wxc-p', '--wxc-ko']) assert.ok(src.includes("wrap.style.setProperty('" + p + "'"), p);
  assert.match(src, /if \(wrap\._wxLookKey === key\) return;/, 'only when the colours change, so a refresh never repaints');
  assert.equal((src.match(/_wxPaint\((el\.querySelector\('\.wxcard-wrap'\)|_wxWrapP|_wxWrap)\);/g) || []).length, 3, 'the three render paths');
  assert.match(src, /if \(_wxAl === '9E'\) _wxAl = 'DL';/, 'folded the way the gate folds it');
  // the ground under the clips is a near-black too, day and night
  const bg = src.slice(src.indexOf('var _wxBg = _wxNightScene'), src.indexOf(';', src.indexOf('var _wxBg = _wxNightScene')));
  for (const h of bg.match(/#[0-9a-f]{6}/gi)) assert.ok(Math.max(...L._rc2Rgb(h)) <= 24, 'near-black ground ' + h);
});

test('the sizes are the chosen design\'s, in one unit of the card as drawn at 1680x1050', () => {
  const unit = rule('.wxcard-wrap').match(/--wxu: min\(([\d.]+)vh, ([\d.]+)vw\)/);
  assert.ok(unit, 'the card unit');
  const at = (w, h) => Math.min(+unit[1] * h / 100, +unit[2] * w / 100);
  assert.ok(Math.abs(at(1680, 1050) - 1) < 0.002, 'one pixel at 1680x1050: ' + at(1680, 1050));
  assert.ok(at(1280, 720) < 0.7 && at(1280, 720) > 0.66, 'the card\'s own share at 1280x720 (its height is 0.665 of 1680x1050\'s): ' + at(1280, 720));
  const px = (t, prop) => { const m = rule(t).match(new RegExp(prop + ': calc\\(([\\d.]+) \\* var\\(--wxu\\)\\) !important')); assert.ok(m, t + ' ' + prop); return +m[1]; };
  assert.equal(px('.wxcard-wrap .wxc-s1 .wxc-mon-city', 'font-size'), 78, 'the city, twice today\'s 38.6');
  assert.equal(px('.wxcard-wrap .wxc-s1 .wxc-mon-temp', 'font-size'), 158, 'the temperature, more than twice today\'s 66');
  assert.equal(px('.wxcard-wrap .wxc-s1 .wxc-mon-cond', 'font-size'), 30);
  assert.equal(px('.wxcard-wrap .wxc-s1 .wxc-mon-head', 'height'), 84);
  assert.equal(px('.wxcard-wrap .wxc-s1 .wxc-mon-now > .wxanim-host', 'width'), 150);
  assert.equal(px('.wxcard-wrap .wxc-hgrid > .wxc-pt > .wxc-pt-temp', 'font-size'), 96, 'the hours, twice today\'s 45');
  assert.equal(px('.wxcard-wrap .wxc-day2 .wxc-dhi', 'font-size'), 88, 'the days\' highs');
  assert.equal(px('.wxcard-wrap .wxc-day2 > .wxc-dbody > .wxanim-host', 'width'), 128);
  assert.equal(px('.wxcard-wrap .wxc-sc-city', 'font-size'), 58, 'the destination on its photograph');
  // the first screen's two plates take the whole card (the monitor inset is gone)
  assert.match(rule('.wxcard-wrap > .wxc-s1 > .wxc-monitor'), /left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important;/);
  assert.match(rule('.wxcard-wrap > .wxc-s1 > .wxc-monitor > .wxc-bar-head'), /display: none !important/);
  // and the figures that can run long are fitted at one size across their row, never cut
  const rules = CORE.slice(CORE.indexOf('var FIDS_FIT_RULES = ['), CORE.indexOf('\n];', CORE.indexOf('var FIDS_FIT_RULES = [')));
  for (const r of ["sel: '.wxc-mon-temp', box: '.wxc-mon-now', lines: 1, avoid: '.wxanim-host, img.wxanim', avoidIn: '.wxc-mon-now', group: '.wxc-mon-body'",
    "sel: '.wxc-hgrid .wxc-pt-temp', box: '.wxc-pt', lines: 1, group: '.wxc-hgrid'",
    "sel: '.wxc-days .wxc-dhi', box: '.wxc-day2', lines: 1, group: '.wxc-days'",
    "sel: '.wxc-sc-city', box: '.wxc-sc-band', lines: 2"]) assert.ok(rules.includes(r), r);
  assert.ok(rules.indexOf("sel: '.wxc-days .wxc-dchip'") < rules.indexOf("sel: '.wxc-t-part, .wxc-mon-lbl, .wxc-mon-cond, .wxc-dchip"), 'fitted by its row before the guard sees it');
});

test('the icons are the board\'s flat set, white and still, framed on their own artwork', () => {
  const files = fs.readdirSync(FLAT).filter((f) => f.endsWith('.svg'));
  assert.ok(files.length >= 20, 'the set: ' + files.length);
  for (const f of files) {
    const name = f.slice(0, -4), raw = fs.readFileSync(path.join(FLAT, f), 'utf8'), out = L._wxWhiteStill(raw, name);
    assert.doesNotMatch(out, /<animate/, name + ': nothing moves');
    assert.doesNotMatch(out, /#FFF200|#3A78C7|#AEB9C4/i, name + ': no lemon, no blue, no grey');
    assert.ok(L._WX_ICON_FRAME[name], name + ' has its frame');
    assert.match(out, new RegExp('viewBox="' + L._WX_ICON_FRAME[name].replace(/\./g, '\\.') + '"'), name + ' is framed');
  }
  // a white cloud over a white sun or moon is cut from it in the tile's colour
  for (const n of ['partly-cloudy-day', 'partly-cloudy-night']) {
    assert.match(L._wxWhiteStill(fs.readFileSync(path.join(FLAT, n + '.svg'), 'utf8'), n), /class="wxc-ko"/, n);
  }
  assert.match(rule('.wxcard-wrap .wxanim-host .wxc-ko'), /fill: var\(--wxc-ko, #141319\) !important; stroke: var\(--wxc-ko, #141319\) !important;/);
  // applied as the card's icons are inlined, and only on the card
  assert.match(fnSource('_wxHydrateSvgs'), /if \(img\.closest && img\.closest\('\.wxcard-wrap'\)\) rawTxt = _wxWhiteStill\(rawTxt, name\);/);
  assert.match(rule('.wxcard-wrap img.wxanim'), /visibility: hidden !important/, 'the file\'s own coloured copy is never shown on the card');
});

test('every word is the store\'s: the plate\'s Tomorrow and Now, in all nine languages', () => {
  const S = require('../fids-current/js/board-strings.js');
  for (const key of ['tomorrow', 'wxNowTitle', 'wxNextHours', 'wxForecastN', 'wxCredit']) {
    for (const l of S.LANGS) assert.ok(String(S.bs(key, l) || '').trim(), key + '.' + l);
  }
  const side = CORE.slice(CORE.indexOf('var _wxSide = function'), CORE.indexOf('var _depShort ='));
  assert.match(side, /if \(!ts\) note = _wxPairT\(BoardStrings\.entry\('wxNowTitle'\)\);/, 'a plate with no hour shows the weather now, and says so');
  assert.match(side, /if \(dDay && dDay === nDay\) note = _wxPairT\(BoardStrings\.entry\('tomorrow'\)\);/, 'a plate for after midnight says Tomorrow beside its time');
  assert.match(side, /'<div class="wxc-mon-cond wxc-stk">' \+ _wxPairT\(_WXLBL\[sIc\] \|\| \{ en: '' \}\) \+ '<\/div>'/, 'the condition\'s two languages stack whole, never break mid-phrase');
  assert.match(CORE, /var SEL = '[^']*\.wxc-stk[^']*'/, 'the pair pass stacks them');
});
