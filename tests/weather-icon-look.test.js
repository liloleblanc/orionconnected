'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24035 — THE WEATHER ICONS' LOOK, A CHOICE IN THE CUSTOMIZE MENU.
//
// Three Vecteezy packs, combined. Customize → Weather icons, per airport like
// the font: Day & night (Colour by day, Solid at night, by the board
// airport's own sunrise and sunset; the default since v24042), Classic (the
// original icons, value 'classic'), Colour or Solid. The departures and arrivals rows never take a circle: they show
// the sets drawn for Orion Connected, white on a dark row and colour on a light one (v24052,
// tests/weather-rows-owner.test.js). The gate screens take a
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
const a = V2.indexOf('const WX_ANIM_ALIAS');
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
// v24052 — a row icon carries both of its files (the white set's, the colour set's)
const rowFiles = (html) => ((/--wxr-w:url\(([^)]+)\);--wxr-c:url\(([^)]+)\);/.exec(html) || []).slice(1).join(' '));

// v24042 — Day & night became the default. An airport that has chosen nothing
// gets it; Classic is a choice of its own ('classic') and keeps the original
// icons everywhere.
test('Day & night is the default: no look stamped draws the rows drawn for Orion Connected, Colour by day and Solid at night at the gate', () => {
  for (const night of [false, true]) {
    const h = helper({ night });
    assert.equal(rowFiles(h.wxIconHtml('cloudy', 36, { row: true })), '/logos/weather/rows-owner-white/cloudy.svg?v=v1 /logos/weather/rows-owner-color/cloudy.svg?v=v1', night ? 'night row' : 'day row');
    assert.match(src(h.wxIconHtml('cloudy', 48)), /\/animated\//, 'not a row and not the gate');
  }
  assert.equal(helper({ path: '/gids' }).look(), 'colour');
  assert.equal(helper({ night: true, path: '/gids' }).look(), 'solid');
  assert.match(src(helper({ path: '/gids' }).wxIconHtml('snow', 64)), /\/logos\/weather\/disc-day\/snow\.svg/);
  // v24052 — at night the circle holds the night icons drawn for Orion Connected
  assert.match(helper({ night: true, path: '/gids', airline: 'WS' }).wxIconHtml('snow', 64), /--wxn-icon:url\(\/logos\/weather\/night-line\/snow\.svg\?v=v1\);/);
});

test('Classic, chosen, keeps the original icons on the rows, the gate and the card', () => {
  for (const night of [false, true]) {
    for (const p of ['/fids', '/gids', '/bids']) {
      const h = helper({ look: 'classic', night, path: p });
      assert.match(src(h.wxIconHtml('cloudy', 36, { row: true })), /\/logos\/weather\/animated\/cloudy\.svg/, p);
      assert.match(src(h.wxIconHtml('cloudy', 64)), /\/logos\/weather\/animated\/cloudy\.svg/, p);
      assert.equal(h.look(), '', p);
    }
  }
});

// the resolver in applyAirportConfigToBoard, run as written: what the airport
// chose (or ?wxicons=) → html[data-fids-wx-icons]. The two layers are this
// device's Customize prefs and the airport's cloud config, read through the
// function's own _pref.
function resolve(saved, query = '', admin) {
  const at = CORE.indexOf("    var _wxiUrl = new URLSearchParams(location.search).get('wxicons');");
  const end = CORE.indexOf('} catch (eWxi) {}', at);
  assert.ok(at > 0 && end > at, 'the resolver is in fids-core.js');
  const stylesAt = CORE.indexOf('var _WX_ICON_STYLES = ');
  const styles = new Function(CORE.slice(stylesAt, CORE.indexOf('\n', stylesAt)) + '\nreturn _WX_ICON_STYLES;')();
  const prefAt = CORE.indexOf('  function _pref(field) {');
  assert.ok(prefAt > 0 && prefAt < at, '_pref is in the same function, above the resolver');
  const pref = new Function('_userCfg', '_adminCfg', CORE.slice(prefAt, CORE.indexOf('\n  }\n', prefAt) + 4) + '\nreturn _pref;')(
    saved === undefined ? {} : { wxIcons: saved }, admin === undefined ? null : { wxIcons: admin });
  const attrs = {};
  const doc = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } } };
  new Function('location', 'document', '_pref', '_WX_ICON_STYLES', 'URLSearchParams', CORE.slice(at, end))(
    { search: query }, doc, pref, styles, URLSearchParams);
  return attrs['data-fids-wx-icons'];
}

test('the board resolves nothing chosen to Day & night, and keeps every look that was chosen', () => {
  assert.equal(resolve(undefined), 'daynight', 'never set (Moncton)');
  assert.equal(resolve(''), 'daynight', "an earlier save's '' is nothing chosen");
  assert.equal(resolve(null), 'daynight');
  assert.equal(resolve('not-a-look'), 'daynight');
  assert.equal(resolve('classic'), 'classic');
  assert.equal(resolve('daynight'), 'daynight');
  assert.equal(resolve('colour'), 'colour');
  assert.equal(resolve('solid'), 'solid');
  assert.equal(resolve(undefined, '?wxicons=classic'), 'classic', 'the review override');
  assert.equal(resolve('classic', '?wxicons=solid'), 'solid');
  assert.equal(resolve('classic', '?wxicons='), 'daynight');
});

test("a device's '' (nothing chosen) does not hide the airport's look; a device's own look still wins", () => {
  assert.equal(resolve('', '', 'classic'), 'classic', "every Customize save writes '': it must not cover the airport's Classic");
  assert.equal(resolve('', '', 'solid'), 'solid');
  assert.equal(resolve(undefined, '', 'colour'), 'colour', 'nothing on the device: the airport decides');
  assert.equal(resolve('', '', ''), 'daynight', 'nothing chosen anywhere');
  assert.equal(resolve(undefined, '', ''), 'daynight', "the cloud's earlier '' is nothing chosen too");
  assert.equal(resolve('solid', '', 'classic'), 'solid', 'a device that chose a look keeps it');
  assert.equal(resolve('', '?wxicons=colour', 'classic'), 'colour', 'the review override stays on top');
});

test('the rows take the sets drawn for Orion Connected with no circle, in every look but Classic', () => {
  for (const look of ['solid', 'colour', 'daynight', '']) {
    for (const night of [false, true]) {
      const html = helper({ look, night }).wxIconHtml(1001, 36, { row: true });
      assert.equal(rowFiles(html), '/logos/weather/rows-owner-white/cloudy.svg?v=v1 /logos/weather/rows-owner-color/cloudy.svg?v=v1', look + (night ? ' night' : ' day'));
      assert.match(html, /class="fids-wx-cell fids-wx-row"/);
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
  // v24052 — the rows draw every name the sets drawn for Orion Connected have (a tornado among them);
  // a name they lack takes its nearest
  assert.match(rowFiles(helper({ look: 'solid' }).wxIconHtml('tornado', 36, { row: true })), /rows-owner-white\/tornado\.svg/);
  assert.match(rowFiles(helper({ look: 'solid' }).wxIconHtml('rain-with-sun', 36, { row: true })), /rows-owner-white\/rain\.svg/);
  const other = helper({ look: 'solid', path: '/gids' }).wxIconHtml('tornado', 64);
  assert.match(src(other), /\/logos\/weather\/animated\/wind\.svg/, 'off the rows, a name outside the 23 falls back to the animated set\'s nearest');
});

test('every condition has an icon in every set, sized and coloured as its set says', () => {
  for (const set of SETS) {
    for (const c of CONDITIONS) {
      const f = 'fids-current/logos/weather/' + set + '/' + c + '.svg';
      assert.ok(fs.existsSync(path.join(ROOT, f)), f);
      const svg = rd(f);
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/, f);
      // v24044 — the day circle takes the card's light tint of its ground (--wxc-disc), white elsewhere
      if (set === 'disc-day') assert.match(svg, /<circle cx="50" cy="50" r="50" style="fill:var\(--wxc-disc, #FFFFFF\)"\/>/, f);
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
  const fnAt = CORE.indexOf('function _wxCardIconDir(night)');
  assert.ok(fnAt > 0);
  // boardNight: the board's own airport after dark (html.fids-night); v24052 —
  // a Solid circle at night draws the night icons drawn for Orion Connected
  const dir = (look, stamped, boardNight = look === 'solid') => new Function('window', 'document', '_WX_ICON_DIR', '_WX_NIGHT_DIR', CORE.slice(fnAt, CORE.indexOf('\n}\n', fnAt) + 2) + '\nreturn _wxCardIconDir;')(
    { fidsWxLook: () => look },
    { documentElement: { getAttribute: (k) => (k === 'data-fids-wx-icons' ? (stamped === undefined ? null : stamped) : null),
      classList: { contains: (c) => c === (boardNight ? 'fids-night' : 'fids-day') } } },
    '/logos/weather/flat/', '/logos/weather/night-line/');
  assert.equal(dir('', 'classic')(), '/logos/weather/flat/');
  assert.equal(dir('colour', 'colour')(), '/logos/weather/disc-day/');
  assert.equal(dir('solid', 'solid')(), '/logos/weather/night-line/', 'Solid, chosen, at night: the night icons');
  assert.equal(dir('solid', 'solid', false)(), '/logos/weather/disc-night/', 'Solid, chosen, by day: its glyphs');
  // v24042 — under Day & night a plate or an hour takes its own moment's day
  // or night (the flag that chose its glyph); a chosen Colour or Solid, and
  // Classic, do not move. v24052 — night is the night icons drawn for Orion
  // Connected (logos/weather/night-line/)
  assert.equal(dir('colour', 'daynight')(true), '/logos/weather/night-line/', 'a city in darkness while the board is in daylight');
  assert.equal(dir('solid', 'daynight')(false), '/logos/weather/disc-day/', 'a city in daylight while the board is at night');
  assert.equal(dir('colour', undefined)(true), '/logos/weather/night-line/', 'nothing stamped yet is the default');
  assert.equal(dir('solid', 'daynight')(), '/logos/weather/night-line/', 'no flag (the day forecasts): the board decides');
  assert.equal(dir('colour', 'colour')(true), '/logos/weather/disc-day/', 'Colour, chosen, stays Colour at night');
  assert.equal(dir('solid', 'solid')(false), '/logos/weather/disc-night/', 'Solid, chosen, keeps its glyphs for a moment in daylight');
  assert.equal(dir('solid', 'solid', false)(true), '/logos/weather/night-line/', 'and a city in darkness takes the night icons');
  assert.equal(dir('', 'classic')(true), '/logos/weather/flat/', 'Classic stays Classic');
  assert.equal(dir('', 'daynight')(true), '/logos/weather/flat/', 'off the gate screens the card keeps the flat set');
  assert.match(CORE, /src="' \+ _wxCardIconDir\(isNight\) \+ sIc \+ /, 'the plates pass their own night');
  assert.match(CORE, /src="' \+ _wxCardIconDir\(!!p\.h\.night\) \+ p\.h\.ic \+ /, 'the hours pass theirs');
  assert.match(CORE, /src="' \+ _wxCardIconDir\(\) \+ d\.ic \+ /, 'the days follow the board');
  assert.match(CORE, /img\.closest\('\.wxcard-wrap'\) && !\/\\\/\(disc-\(day\|night\)\|night-line\)\\\/\/\.test\(img\.getAttribute\('src'\) \|\| ''\)\) rawTxt = _wxWhiteStill/, 'not drawn white and still');
});

test('the choice lives in Customize, saves per airport like the font, and the board applies it', () => {
  const sel = MENU_HTML.slice(MENU_HTML.indexOf('<select class="sm-select" id="cuWxIcons"'), MENU_HTML.indexOf('</select>', MENU_HTML.indexOf('id="cuWxIcons"')));
  assert.deepEqual([...sel.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]), ['', 'classic', 'colour', 'solid']);
  assert.match(sel, /<option value="">Day &amp; night \(default\): Colour by day, Solid at night<\/option>/, 'the first entry is the default, and says so');
  assert.match(sel, /<option value="classic">Classic \(the original icons\)<\/option>/);
  assert.match(sel, /onchange="cuApplyAndSave\(\)"/);
  assert.match(MENU, /if \(wi && wi\.dataset\.painted === '1'\) p\.wxIcons = wi\.value;/, 'read from the form');
  assert.match(MENU, /'hideAirlinePrefix', 'hideWeather', 'airlineStyle', 'displayMode', 'wxIcons'\]/, 'sent to the cloud');
  assert.match(PROXY, /"wxIcons",/, 'the worker keeps it');
  assert.match(PROXY, /if \(cfg\.wxIcons !== undefined && !\["", "classic", "daynight", "colour", "solid"\]\.includes\(cfg\.wxIcons\)\) delete cfg\.wxIcons;/, 'and only a look the boards know, Classic among them');
  assert.match(CORE, /'airlineStyle', 'displayMode', 'wxIcons'\];/, 'a newer cloud copy wins over a device copy');
  assert.match(CORE, /var _WX_ICON_STYLES = \['daynight', 'classic', 'colour', 'solid'\];/, 'the first is the default');
  assert.match(CORE, /if \(_WX_ICON_STYLES\.indexOf\(_wxi\) < 0\) _wxi = _WX_ICON_STYLES\[0\];\s*document\.documentElement\.setAttribute\('data-fids-wx-icons', _wxi\);/);
  assert.match(V2, /let v = root\.getAttribute\('data-fids-wx-icons'\) \|\| 'daynight';/, 'a page with no look stamped yet draws the default too');
  assert.match(CORE, /window\.fidsWxIcon\(tw\.current\.code, 48, \{ row: true, at: _wxAt \}\)/, 'the board rows say they are rows (v24052: and where their weather is)');
  assert.match(V2, /wxIconHtml\(f\._wxCode, 36, \{ row: true \}\)/);
});

// v24042 — the Customize select paints what the board shows: this device's
// look, else the airport's. Run as written against a select that behaves as
// a browser's does (a value it has no option for selects nothing).
function paintWx(prefs, airportCfg) {
  const at = MENU.indexOf('  if (wi) {\n    var _wiv = prefs.wxIcons;');
  assert.ok(at > 0, 'the paint is in menu.js');
  const end = MENU.indexOf("wi.dataset.painted = '1';\n  }\n", at) + "wi.dataset.painted = '1';\n  }\n".length;
  const sel = MENU_HTML.slice(MENU_HTML.indexOf('<select class="sm-select" id="cuWxIcons"'), MENU_HTML.indexOf('</select>', MENU_HTML.indexOf('id="cuWxIcons"')));
  const values = [...sel.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  let v = 'solid', idx = values.indexOf('solid');
  const wi = { dataset: {}, get value() { return v; }, set value(x) { idx = values.indexOf(String(x)); v = idx < 0 ? '' : String(x); }, get selectedIndex() { return idx; } };
  new Function('prefs', 'wi', 'getAirportConfig', '_acCurrentCode', MENU.slice(at, end))(
    prefs, wi, (code) => (code === 'YQM' ? airportCfg : null), () => 'YQM');
  return { value: wi.value, painted: wi.dataset.painted };
}

test("Customize paints the look the board runs: the device's, else the airport's", () => {
  assert.deepEqual(paintWx({ wxIcons: 'colour' }, { wxIcons: 'classic' }), { value: 'colour', painted: '1' }, "the device's own look");
  assert.equal(paintWx({}, { wxIcons: 'classic' }).value, 'classic', "a newer cloud save cleared the device's copy: the airport's Classic, not the default");
  assert.equal(paintWx({ wxIcons: '' }, { wxIcons: 'solid' }).value, 'solid', "a device's '' is nothing chosen");
  assert.equal(paintWx({}, null).value, '', 'no airport config yet: the default entry');
  assert.equal(paintWx({}, { wxIcons: '' }).value, '', "the cloud's earlier '' is the default entry");
  assert.equal(paintWx({ wxIcons: 'daynight' }, null).value, '', "a saved 'daynight' is the default entry");
  assert.equal(paintWx({}, { wxIcons: 'daynight' }).value, '', "and so is the airport's");
  assert.equal(paintWx({ wxIcons: 'not-a-look' }, null).value, '');
});

// v24042 — the cloud save says what the cloud KEPT. _cuSyncNote and
// _cuCloudPush run as written against two workers: the one live before this
// change (it deletes 'classic', the look stored before it with it, and still
// answers with a stamp) and the one in workers/fids-proxy.js.
async function push(prefs, allowed, selValue) {
  const at = MENU.indexOf('function _cuSyncNote(kind) {');
  const fnAt = MENU.indexOf('function _cuCloudPush(code, prefs) {');
  const end = MENU.indexOf('\n}\n', fnAt) + 3;
  assert.ok(at > 0 && fnAt > at, 'the sync note and the cloud push are in menu.js');
  const note = { style: {}, textContent: '' };
  const sel = { value: selValue === undefined ? '' : selValue };
  const store = { fids_customize_YQM: JSON.stringify(Object.assign({}, prefs, { savedAt: 100 })) };
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v2) => { store[k] = String(v2); } };
  const doc = { getElementById: (id) => (id === 'cuCloudSyncNote' ? note : id === 'cuWxIcons' ? sel : null) };
  const fetch = (url, opts) => {
    const cfg = Object.assign({ wxIcons: 'solid' }, JSON.parse(opts.body));     // the look the airport held before
    if (cfg.wxIcons !== undefined && !allowed.includes(cfg.wxIcons)) delete cfg.wxIcons;
    cfg.updatedAt = 200;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, config: cfg }) });
  };
  new Function('document', 'localStorage', '_acGetToken', '_acFetch', '_AC_WORKER_URL', 'setTimeout', 'clearTimeout', 'console',
    MENU.slice(at, MENU.indexOf('\n}\n', at) + 3) + MENU.slice(MENU.indexOf('var _cuCloudTimer = null;'), end) + '\n_cuCloudPush("YQM", ' + JSON.stringify(prefs) + ');')(
    doc, ls, () => 'token', fetch, '', (fn) => { fn(); return 1; }, () => {}, { log() {}, warn() {} });
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  return { note: note.textContent, savedAt: JSON.parse(store.fids_customize_YQM).savedAt, sel: sel.value };
}
const OLD_WORKER = ['', 'daynight', 'colour', 'solid'];
const NEW_WORKER = JSON.parse(/!(\[[^\]]+\])\.includes\(cfg\.wxIcons\)/.exec(PROXY)[1]);

test('a cloud save that drops the weather icons says so, and the screen follows the cloud', async () => {
  let r = await push({ wxIcons: 'classic', font: 'Bricolage' }, OLD_WORKER, 'classic');
  assert.match(r.note, /^⚠ Saved to the airport cloud, except the weather icons/, 'not "Saved"');
  assert.equal(r.savedAt, 100, "this device's stamp is not aligned, so the newer cloud copy wins on the next read");
  assert.equal(r.sel, '', 'the select goes back to the default entry');
  assert.deepEqual(NEW_WORKER, ['', 'classic', 'daynight', 'colour', 'solid']);
  r = await push({ wxIcons: 'classic', font: 'Bricolage' }, NEW_WORKER, 'classic');
  assert.match(r.note, /^✓ Saved to the airport cloud/, 'a worker that knows Classic keeps it');
  assert.equal(r.savedAt, 200, 'stamps aligned');
  assert.equal(r.sel, 'classic');
  r = await push({ wxIcons: '', font: 'Bricolage' }, OLD_WORKER, '');
  assert.match(r.note, /^✓ Saved/, "nothing chosen ('') is kept by either worker");
  r = await push({ font: 'Bricolage' }, OLD_WORKER);
  assert.match(r.note, /^✓ Saved/, 'a save without the field is not checked for it');
  assert.match(MENU, /wxDropped: \['#f87171', /);
});

test('the gate circle is the icon\'s own round background (the rows pick their set by ground since v24052)', () => {
  const at = CSS.indexOf("v24035 — THE WEATHER ICONS' LOOK");
  assert.ok(at > 0);
  const block = CSS.slice(at, CSS.indexOf('/* ══', at + 10));
  assert.doesNotMatch(block, /fids-wx-glyph|brightness\(0\)/, 'nothing darkens the drawings drawn for Orion Connected');
  assert.match(block, /img\.fids-wx-disc \{\s*border-radius: 50% !important;\s*background: var\(--wx-disc, transparent\) !important;/);
  assert.match(block, /\.fids-wx-pair \{[^}]*border-radius: 50% !important;\s*background: var\(--wx-disc, #033F77\) !important;/);
  assert.match(block, /\.fids-wx-pair::after \{[^}]*content: '';[^}]*background: var\(--wx-ink, #FFFFFF\);[^}]*mask: var\(--wx-glyph\) center \/ contain no-repeat;/);
});

test('the tools that build the icons are kept', () => {
  for (const f of ['build.py', 'export.jsx', 'split.js', 'cluster.py', 'README.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts/wx-icons', f)), f);
  }
});

test('v24037 — no sprite: the animated set draws every name, its nearest for the few it lacks, nothing for no reading', () => {
  const h = helper();
  const pairs = { 'overcast-night': 'overcast', 'thunderstorms-night-rain': 'thunderstorms-rain', 'thunderstorms': 'thunderstorms-rain',
    'wind-cloud': 'wind', 'rain-with-sun': 'rain', 'light-snow': 'snow', 'tornado': 'wind' };
  for (const [name, file] of Object.entries(pairs)) {
    assert.match(src(h.wxIconHtml(name, 36)), new RegExp('/logos/weather/animated/' + file + '\\.svg'), name);
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current/logos/weather/animated', file + '.svg')), file);
  }
  for (const none of [null, undefined, '', 'not-a-weather', 9999]) assert.equal(h.wxIconHtml(none, 36), '', 'no reading, no icon: ' + none);
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current/logos/weather/sprite.svg')), 'the Vexels sprite is gone');
  assert.doesNotMatch(V2, /WX_SPRITE|WX_CELL|WX_CODE_MAP/);
  assert.doesNotMatch(CORE, /img\.icons8\.com|meteoconImg\(|WX_ICON_CDN/);
});
