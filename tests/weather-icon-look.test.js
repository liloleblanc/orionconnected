'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24035 — THE WEATHER ICONS' LOOK, A CHOICE IN THE CUSTOMIZE MENU.
//
// Three Vecteezy packs, combined. Customize → Weather icons, per airport like
// the font: Classic (the original icons, the default), Colour, Solid, or Day &
// night (Colour by day, Solid at night, by the board airport's own sunrise and
// sunset). The departures and arrivals rows never take a circle: they show
// the solid glyph, white, dark on a light row. The gate screens take a
// circle: Colour = the colour icon on white, Solid = the glyph in the
// airline's brand colour on its deep colour (WestJet teal on navy), drawn
// larger. The weather card does the same with icons it inlines. Files: logos/weather/<set>/<condition>.svg,
// built by scripts/wx-icons/build.py.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V2 = rd('fids-current/js/fids-v2.js');
const CORE = rd('fids-current/js/fids-core.js');
const MENU = rd('fids-current/js/menu.js');
const MENU_HTML = rd('fids-current/menu.html');
const PROXY = rd('workers/fids-proxy.js');
const CSS = rd('fids-current/css/display-overrides.css');

const CONDITIONS = ['clear-day', 'clear-night', 'cloudy', 'drizzle', 'extreme-rain', 'extreme-snow', 'fog', 'hail', 'mist',
  'overcast-day', 'overcast-night', 'overcast', 'partly-cloudy-day', 'partly-cloudy-night', 'rain', 'sleet', 'snow',
  'thunderstorms-day-rain', 'thunderstorms-night-rain', 'thunderstorms-rain', 'thunderstorms', 'wind-cloud', 'wind'];
const SETS = ['solid', 'solid-in-disc', 'disc-day', 'disc-night'];

// ── the icon helper, lifted from fids-v2.js ──────────────────────────────
const a = V2.indexOf('const WX_SPRITE_URL');
const END = 'window.fidsWxGatePair = wxGatePair;';
const SLICE = V2.slice(a, V2.indexOf(END) + END.length);
function helper({ look = '', night = false, path: p = '/fids', airline = '' } = {}) {
  const attrs = look ? { 'data-fids-wx-icons': look } : {};
  const root = { getAttribute: (k) => (k in attrs ? attrs[k] : null), classList: { contains: (c) => c === (night ? 'fids-night' : 'fids-day') } };
  const body = { getAttribute: (k) => (k === 'data-gate-airline' ? airline : null) };
  const win = { TIO_ICON: { 1001: 'cloudy', 1000: 'clear-day' } };
  // fids-core.js's pair rule, for the carriers these tests use
  const PAIRS = { AC: { disc: '#0B0D10', ink: '#A6192E' }, WS: { disc: '#003366', ink: '#00B2A9' } };
  const pair = (c) => PAIRS[c] || { disc: '#0C1119', ink: '#FFFFFF' };
  return new Function('window', 'document', 'location', 'FIDS_BUILD_TAG', '_wxDiscPair',
    SLICE + '\nreturn { wxIconHtml, look: window.fidsWxLook, pair: window.fidsWxGatePair };'
  )(win, { documentElement: root, body }, { pathname: p }, 'v1', pair);
}
const src = (html) => (/src="([^"]+)"/.exec(html) || [])[1] || '';

test('Classic is the default: nothing changes until an operator picks a look', () => {
  const h = helper();
  assert.match(src(h.wxIconHtml('cloudy', 36, { row: true })), /\/logos\/weather\/animated\/cloudy\.svg/);
  assert.match(src(h.wxIconHtml('cloudy', 48)), /\/animated\//);
  assert.equal(h.look(), '');
});

test('the rows take the solid glyph with no circle, in every look but Classic', () => {
  for (const look of ['solid', 'colour', 'daynight']) {
    for (const night of [false, true]) {
      const html = helper({ look, night }).wxIconHtml(1001, 36, { row: true });
      assert.match(src(html), /^\/logos\/weather\/solid\/cloudy\.svg\?v=v1$/, look + (night ? ' night' : ' day'));
      assert.match(html, /class="fids-wx-cell fids-wx-glyph"/);
      assert.doesNotMatch(html, /fids-wx-disc|--wx-disc/, 'no circle on the main board');
    }
  }
});

test('Day & night: Colour by day, Solid at night, on the gate screens', () => {
  assert.equal(helper({ look: 'daynight', path: '/gids' }).look(), 'colour');
  assert.equal(helper({ look: 'daynight', night: true, path: '/gids' }).look(), 'solid');
  assert.equal(helper({ look: 'daynight', night: true, path: '/gids.html' }).look(), 'solid');
});

test('the gate: Colour is the colour icon on white, Solid the brand colour on the deep colour', () => {
  let html = helper({ look: 'colour', path: '/gids', airline: 'AC' }).wxIconHtml('snow', 64);
  assert.match(src(html), /\/logos\/weather\/disc-day\/snow\.svg/);
  html = helper({ look: 'solid', path: '/gids', airline: 'WS' }).wxIconHtml('snow', 64);
  assert.match(html, /^<span class="fids-wx-cell fids-wx-disc fids-wx-pair" data-wxg="snow"/);
  assert.match(html, /--wx-disc:#003366;--wx-ink:#00B2A9;--wx-glyph:url\(\/logos\/weather\/solid-in-disc\/snow\.svg\?v=v1\);/, 'WestJet teal on navy');
  html = helper({ look: 'solid', path: '/gids', airline: 'AC' }).wxIconHtml('snow', 64);
  assert.match(html, /--wx-disc:#0B0D10;--wx-ink:#A6192E;/, 'Air Canada red on black');
  assert.deepEqual(helper({ look: 'solid', path: '/gids' }).pair(), { disc: '#033F77', ink: '#FFFFFF' }, 'no airline: the board navy, a white glyph');
});

test('the pair rule: deep colour behind, brand colour in front, white where the two are too close', () => {
  const at = CORE.indexOf('function _wxDiscPair(code)');
  const fn = CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
  const run = (pairs, contrast) => new Function('_rc2Pair', '_rc2Contrast', fn + '\nreturn _wxDiscPair;')((c) => pairs[c], contrast);
  const PAIRS = { WS: { a: '#00B2A9', ink: '#002B55', b: '#003366' }, PB: { a: '#3E57BE', ink: '#FFFFFF', b: '#183677' } };
  assert.deepEqual(run(PAIRS, () => 4.6)('WS'), { disc: '#003366', ink: '#00B2A9' });
  assert.deepEqual(run(PAIRS, () => 2.1)('PB'), { disc: '#183677', ink: '#FFFFFF' }, 'PAL blue on PAL navy is too close');
  assert.match(CORE, /wrap\.style\.setProperty\('--wx-disc', _wxDp\.disc\);\s*wrap\.style\.setProperty\('--wx-ink', _wxDp\.ink\);/, 'the card wears the same pair');
});

test('other surfaces, and conditions the packs do not draw, keep the Classic icons', () => {
  assert.match(src(helper({ look: 'solid', path: '/fids' }).wxIconHtml('snow', 44)), /\/animated\//, 'not a row and not the gate');
  assert.match(src(helper({ look: 'solid', path: '/bids' }).wxIconHtml('snow', 64)), /\/animated\//);
  const sprite = helper({ look: 'solid' }).wxIconHtml('tornado', 36, { row: true });
  assert.doesNotMatch(sprite, /\/weather\/solid\//, 'a name outside the 23 falls back');
});

test('every condition has an icon in every set, sized and coloured as its set says', () => {
  for (const set of SETS) {
    for (const c of CONDITIONS) {
      const f = 'fids-current/logos/weather/' + set + '/' + c + '.svg';
      assert.ok(fs.existsSync(path.join(ROOT, f)), f);
      const svg = rd(f);
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/, f);
      if (set === 'disc-day') assert.match(svg, /<circle cx="50" cy="50" r="50" fill="#FFFFFF"\/>/, f);
      if (set === 'disc-night') {
        assert.match(svg, /style="fill:var\(--wx-disc, #033F77\)"/, f);
        assert.match(svg, /style="fill:var\(--wx-ink, #FFFFFF\)"/, f);
      }
      if (set === 'solid' || set === 'solid-in-disc') assert.match(svg, /fill="#FFFFFF" mask=/, f);
      if (set === 'solid') assert.match(svg, /<svg x="11\.00" y="11\.00" width="78\.00"|<svg x="0\.00" y="0\.00" width="100\.00"/, f + ' 78% of the box');
      if (set === 'solid-in-disc' || set === 'disc-night') assert.match(svg, /<svg x="10\.00" y="10\.00" width="80\.00"|<svg x="0\.00" y="0\.00" width="100\.00"/, f + ' larger in the circle');
    }
  }
  for (const c of CONDITIONS) assert.ok(new RegExp("'" + c + "':1").test(V2), c + ' is one the helper draws');
});

test('the weather card follows the look, and its circles keep their own colours', () => {
  const dir = new Function('window', '_WX_ICON_DIR', CORE.slice(CORE.indexOf('function _wxCardIconDir()'), CORE.indexOf('\n}\n', CORE.indexOf('function _wxCardIconDir()')) + 2) + '\nreturn _wxCardIconDir;');
  assert.equal(dir({ fidsWxLook: () => '' }, '/logos/weather/flat/')(), '/logos/weather/flat/');
  assert.equal(dir({ fidsWxLook: () => 'colour' }, '/logos/weather/flat/')(), '/logos/weather/disc-day/');
  assert.equal(dir({ fidsWxLook: () => 'solid' }, '/logos/weather/flat/')(), '/logos/weather/disc-night/');
  assert.equal((CORE.match(/src="' \+ _wxCardIconDir\(\) \+ /g) || []).length, 3, 'all three of the card\'s icon rows');
  assert.match(CORE, /img\.closest\('\.wxcard-wrap'\) && !\/\\\/disc-\(day\|night\)\\\/\/\.test\(img\.getAttribute\('src'\) \|\| ''\)\) rawTxt = _wxWhiteStill/, 'not drawn white and still');
});

test('the choice lives in Customize, saves per airport like the font, and the board applies it', () => {
  const sel = MENU_HTML.slice(MENU_HTML.indexOf('<select class="sm-select" id="cuWxIcons"'), MENU_HTML.indexOf('</select>', MENU_HTML.indexOf('id="cuWxIcons"')));
  assert.deepEqual([...sel.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]), ['', 'daynight', 'colour', 'solid']);
  assert.match(sel, /onchange="cuApplyAndSave\(\)"/);
  assert.match(MENU, /if \(wi && wi\.dataset\.painted === '1'\) p\.wxIcons = wi\.value;/, 'read from the form');
  assert.match(MENU, /if \(wi\) \{ wi\.value = prefs\.wxIcons \|\| ''; wi\.dataset\.painted = '1'; \}/, 'painted into the form');
  assert.match(MENU, /'hideAirlinePrefix', 'hideWeather', 'airlineStyle', 'displayMode', 'wxIcons'\]/, 'sent to the cloud');
  assert.match(PROXY, /"wxIcons",/, 'the worker keeps it');
  assert.match(PROXY, /if \(cfg\.wxIcons !== undefined && !\["", "daynight", "colour", "solid"\]\.includes\(cfg\.wxIcons\)\) delete cfg\.wxIcons;/, 'and only a look the boards know');
  assert.match(CORE, /'airlineStyle', 'displayMode', 'wxIcons'\];/, 'a newer cloud copy wins over a device copy');
  assert.match(CORE, /var _WX_ICON_STYLES = \['', 'daynight', 'colour', 'solid'\];/);
  assert.match(CORE, /if \(_WX_ICON_STYLES\.indexOf\(_wxi\) > 0\) document\.documentElement\.setAttribute\('data-fids-wx-icons', _wxi\);/);
  assert.match(CORE, /window\.fidsWxIcon\(tw\.current\.code, 48, \{ row: true \}\)/, 'the board rows say they are rows');
  assert.match(V2, /wxIconHtml\(f\._wxCode, 36, \{ row: true \}\)/);
});

test('a light row turns the glyph dark; the gate circle is the icon\'s own round background', () => {
  const at = CSS.indexOf("v24035 — THE WEATHER ICONS' LOOK");
  assert.ok(at > 0);
  const block = CSS.slice(at, CSS.indexOf('/* ══', at + 10));
  assert.match(block, /#fidsTable tbody tr\.row-delayed img\.fids-wx-glyph,\s*#fidsTable tbody tr\.row-final img\.fids-wx-glyph,\s*body\.fids-light-board #fidsTable tbody tr:not\(\.row-cancelled\) img\.fids-wx-glyph \{\s*filter: brightness\(0\) !important;/);
  assert.match(block, /img\.fids-wx-disc \{\s*border-radius: 50% !important;\s*background: var\(--wx-disc, transparent\) !important;/);
  assert.match(block, /\.fids-wx-pair \{[^}]*border-radius: 50% !important;\s*background: var\(--wx-disc, #033F77\) !important;/);
  assert.match(block, /\.fids-wx-pair::after \{[^}]*content: '';[^}]*background: var\(--wx-ink, #FFFFFF\);[^}]*mask: var\(--wx-glyph\) center \/ contain no-repeat;/);
});

test('the tools that build the icons are kept', () => {
  for (const f of ['build.py', 'export.jsx', 'split.js', 'cluster.py', 'README.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts/wx-icons', f)), f);
  }
});
