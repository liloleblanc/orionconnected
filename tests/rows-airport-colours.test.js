'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// ROWS IN THE AIRPORT LOGO COLOURS (Customize → Display Options → Row colours)
//
// An airport choice only, off by default, like the bottom of the board: the
// board reads it from the airport config, never from a copy on a screen.
// Customize shows both airport-only controls (Row colours, Bottom of the
// board) disabled with the reason unless an admin is signed in, leaves both
// out of a save made from a panel painted before the airport config was in,
// and paints both again when it comes. With it on, the plain rows of the
// departures and arrivals table take the colour the banner reads out of the
// airport logo: one band colour, moved along its own hue to
// two fixed depths (L* 23.7 for the even rows, 9 L* below for the odd ones),
// with the column titles in that colour at full strength. Every word on those
// rows reads at 7 to 1. A band colour that would read as a status never paints
// a row: a red reads as Cancelled, an orange or amber darkens into brown, a
// yellow green into olive, a wine or plum sits too close to the Cancelled and
// Diverted reds, and a grey (under C* 12 in the logo or on the lighter
// stripe, or a darker stripe within dE76 6 of #262D36, the slate of the
// Departed, Arrived and Gate closed rows) reads as a past flight. A turquoise
// or a teal whose darker stripe falls under C* 12 but stays off that slate
// paints. When nothing may paint, the rows keep the theme and only the column
// titles take the logo colour; a logo with no palette at all changes nothing.
//
// The functions run here are lifted out of fids-core.js, menu.js,
// editor-roles.js and workers/fids-proxy.js as they are written; only the page
// around them (body, elements, storage, the network, the logo reader) is a
// stand-in. The rules are read out of display-overrides.css.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = rd('fids-current/js/fids-core.js');
const MENU = rd('fids-current/js/menu.js');
const MENU_HTML = rd('fids-current/menu.html');
const ROLES = rd('fids-current/js/editor-roles.js');
const CSS = rd('fids-current/css/display-overrides.css');
const PROXY = rd('workers/fids-proxy.js');
const BAND = JSON.parse(rd('tests/fixtures/header-band.json')).palettes;

function fn(name, src = CORE) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  return src.slice(at, src.indexOf('\n}\n', at) + 2);
}
function v(name) {
  const m = new RegExp('var ' + name + ' = [^;]+;').exec(CORE);
  assert.ok(m, 'var ' + name + ' must exist');
  return m[0];
}

// ── colour arithmetic of the test's own (WCAG 2 and CIE L*) ─────────────────
const rgb = (h) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h).trim()); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null; };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (h) => { const c = rgb(h).map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lstar = (h) => { const y = lum(h); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };
const hue = (h) => {
  const [r, g, b] = rgb(h).map((c) => c / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  x *= 60; return x < 0 ? x + 360 : x;
};

// ── the planner, lifted ─────────────────────────────────────────────────────
const PLANNER = () => [fn('_relLum'), fn('_hex'), fn('_rgbToHsl'), v('_FIDS_BAND_END_CR'), v('_FIDS_SILK_LIFT'),
  fn('_fidsSilkPainted'), fn('_fidsBandEnd'), fn('_rc2Rgb'), fn('_rc2Lin'), fn('_rc2DeltaE'), fn('_fidsRelLum'),
  fn('_fidsContrast'), fn('_fidsInk'), fn('_fidsStatusInk'), v('FIDS_ROWPAL_L'), v('FIDS_ROWPAL_STEP'),
  v('FIDS_ROWPAL_MIN_C'), v('FIDS_ROWPAL_MIN_RED_DE'), v('FIDS_ROWPAL_SLATE'), v('FIDS_ROWPAL_MIN_SLATE_DE'), v('FIDS_ROWPAL_INK'), v('FIDS_ROWPAL_REDS'),
  fn('_fidsRowPalLab'), fn('_fidsRowPalShade'), fn('_fidsRowPalRefusal'), fn('_fidsRowPalHead'), fn('_fidsRowPalPlan')].join('\n');
const lib = () => new Function(PLANNER() + '\nreturn { plan: _fidsRowPalPlan, refusal: _fidsRowPalRefusal, shade: _fidsRowPalShade, reds: FIDS_ROWPAL_REDS, dE: _rc2DeltaE, lab: _fidsRowPalLab,'
  + ' evenL: FIDS_ROWPAL_L, step: FIDS_ROWPAL_STEP, minC: FIDS_ROWPAL_MIN_C, slate: FIDS_ROWPAL_SLATE, minSlateDE: FIDS_ROWPAL_MIN_SLATE_DE };')();

// ── one board: the body, storage and the logo reader are stand-ins ──────────
function board({ ap = 'YQM', search = '', store = {}, cfg = null, registry = {} } = {}) {
  const attrs = {}, vars = {}, events = [], reads = [], renders = [];
  const ls = new Map(Object.entries(store));
  const body = {
    getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
    setAttribute: (k, x) => { attrs[k] = String(x); },
    removeAttribute: (k) => { delete attrs[k]; },
    style: { setProperty: (k, x) => { vars[k] = x; }, removeProperty: (k) => { delete vars[k]; } },
  };
  const env = {
    document: { body, getElementById: (id) => (id === 'apSel' ? { value: ap } : null) },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, x) => { ls.set(k, String(x)); } },
    window: { dispatchEvent: (e) => { events.push(e); return true; } },
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    location: { search },
    URLSearchParams,
    getAirportConfig: (code) => (code === ap ? cfg : null),
    _extractLogoPalette: (url, cb) => { reads.push({ url, cb }); },
    render: () => { renders.push(1); },
    setTimeout: (f) => { f(); return 1; },
    BANNER_PALETTE: registry,
  };
  const names = Object.keys(env);
  const api = new Function(...names, PLANNER() + '\n' + [
    v('_bandPaletteBusy'), v('_bandPaletteWaiting'), v('_fidsRowPalRead'), v('_fidsRowPalLast'), v('FIDS_ROWPAL_VARS'),
    "var _lastTbodyHtml = 'rows on screen';",
    fn('_fidsAirportLogoUrl'), fn('_fidsLogoPaletteCached'), fn('_fidsLogoPaletteRead'), fn('_fidsRowPalSource'),
    fn('_fidsRowPalUrl'), fn('_fidsRowPalSetting'), fn('_fidsRowPalPaint'),
    "return { setting: _fidsRowPalSetting, paint: _fidsRowPalPaint, rebuilt: function () { var r = _lastTbodyHtml === ''; _lastTbodyHtml = 'rows on screen'; return r; } };",
  ].join('\n'))(...names.map((n) => env[n]));
  return Object.assign(api, { attrs, vars, events, reads, renders, ls });
}
const LOGO = 'https://assets.example/logo-yqm.svg';
const warm = (ap, pal) => ({ ['fids_logo_palette3_' + ap]: JSON.stringify({ url: LOGO, pal }) });

// ── one screen with Customize, end to end ───────────────────────────────────
// The code of all four files as it is written: in fids-core.js the airport
// config cache and its refresh, the head of applyAirportConfigToBoard (the
// layers it reads) with its row colours line, and the row painter; in menu.js
// the Customize save, the cloud push, the paint of the form and the
// airport-only controls; editor-roles.js, which says what role the panel goes
// by; in workers/fids-proxy.js the airport-config PUT and GET. Only the page
// around them is a stand-in: the elements, storage, timers, the network and
// the store of the worker.
const afn = (name, src) => 'async ' + fn(name, src);
const line = (re, src) => { const m = re.exec(src); assert.ok(m, String(re) + ' must exist'); return m[0]; };
const mv = (name) => line(new RegExp('var ' + name + ' = [^;]+;'), MENU);
// a function or a line lifted when the file has it: the helpers of the
// airport-only controls and the listener that paints them again, which the
// commit before them lacks, so the same harness runs either as written
const opt = (name, src) => (src.indexOf('function ' + name + '(') >= 0 ? fn(name, src) : '');
const optLine = (re, src) => { const m = re.exec(src); return m ? m[0] : ''; };
// applyAirportConfigToBoard up to the languages (its layers: the device copy,
// the airport config, the copies it retires and _pref), then its row colours
// line, and the render it ends on (which runs the row painter). The readers
// that line calls are lifted with it.
function applyBoard() {
  const A = fn('applyAirportConfigToBoard');
  const langs = A.indexOf('\n  // Board languages per airport, layered:');
  assert.ok(langs > 0, 'applyAirportConfigToBoard reads its layers before the languages');
  const rp = /\n  try \{ _fidsRowPalSetting\([^\n]*\); \} catch \(eRp\) \{\}/.exec(A);
  assert.ok(rp && rp.index > langs, 'and stamps the row colours after them');
  assert.match(A, /if \(typeof render === 'function'\) render\(\);\n  \} catch \(e\) \{\}\n\}$/, 'it ends by drawing the board again');
  const readers = rp[0].includes('_fidsAirportRowPal(') ? [fn('_fidsAirportRowPalOf'), fn('_fidsAirportRowPal')] : [];
  return readers.concat([A.slice(0, langs) + rp[0] + "\n  try { if (typeof render === 'function') render(); } catch (e) {}\n}"]).join('\n');
}
const CONFIG_IN = /try \{ window\.addEventListener\('fids-airport-config-ready', [^\n]+/;
const SCREEN_SRC = () => [
  line(/const _airportConfigCache = \{\};/, CORE), fn('_normAirportCode'), fn('getAirportConfig'),
  fn('_fidsAirportFloorOf'), fn('_fidsAirportFloor'), opt('_fidsAirportConfigLoaded', CORE), afn('refreshAirportConfig'),
  PLANNER(), v('_bandPaletteBusy'), v('_bandPaletteWaiting'), v('_fidsRowPalRead'), v('_fidsRowPalLast'), v('FIDS_ROWPAL_VARS'),
  "var _lastTbodyHtml = '';",
  fn('_fidsAirportLogoUrl'), fn('_fidsLogoPaletteCached'), fn('_fidsLogoPaletteRead'), fn('_fidsRowPalSource'),
  fn('_fidsRowPalUrl'), fn('_fidsRowPalSetting'), fn('_fidsRowPalPaint'), applyBoard(),
  fn('_acCurrentCode', MENU), mv('_AC_WORKER_URL'), fn('_acGetToken', MENU), afn('_acFetch', MENU),
  fn('_cuStorageKey', MENU), fn('_cuLoad', MENU), fn('_cuSave', MENU), fn('_cuSyncNote', MENU),
  line(/var _cuCloudTimer = null;/, MENU), fn('_cuCloudPush', MENU), fn('_cuReadForm', MENU), fn('_cuPaintForm', MENU),
  opt('_cuEditorRole', MENU), opt('_cuAirportOnlyWhy', MENU), opt('_cuAirportOnlySends', MENU), opt('_cuPaintAirportOnly', MENU),
  opt('cuAirportOnlyChanged', MENU), opt('_cuAirportConfigIn', MENU), optLine(CONFIG_IN, MENU),
  fn('_cuRowPaletteNote', MENU), line(/try \{ window\.addEventListener\('fids-row-palette'[^\n]+/, MENU),
  mv('_cuCurrentPos'), fn('cuSetPositionUI', MENU), mv('_cuCurrentMode'), fn('cuSetDisplayModeUI', MENU),
  mv('_cuThemeExplicitDefault'), mv('_cuFontExplicitDefault'), mv('_cuCurrentSize'), fn('cuApplyAndSave', MENU),
  MENU.slice(MENU.indexOf('window.FIDS_CUSTOMIZE = {'), MENU.indexOf('\n};\n', MENU.indexOf('window.FIDS_CUSTOMIZE = {')) + 3),
].join('\n');
const WORKER_SRC = () => [line(/function isAdmin\(payload\) \{[^\n]+/, PROXY), line(/function normIata\(code\) \{[^\n]+/, PROXY),
  afn('handlePutAirport', PROXY), afn('handleGetAirport', PROXY)].join('\n');
// role: null (signed out), or the role of the token the worker reads
// ('viewer', 'operator', 'admin'); user: the fids_user of this tab
// (sessionStorage), by default the signed-in user with that role, null for
// none; lock: the screen lock of editor-roles.js (fids_editor_lock);
// editorRoles: false for a page where editor-roles.js is not loaded; cloud:
// the airport config the worker holds for YQM; device: this screen's
// Customize copy; floorControl: false for a panel without the Bottom of the
// board control; offline: the save gets no answer at all
function screen({ role = null, user, lock = null, editorRoles = true, cloud = null, device = null, search = '', floorControl = true, offline = false } = {}) {
  const ls = new Map(), ss = new Map();
  if (device) ls.set('fids_customize_YQM', JSON.stringify(device));
  ls.set('fids_banner_palette_YQM', JSON.stringify(BAND.YQM));   // the banner palette this screen holds
  if (role) ls.set('fids_token', 'token-' + role);
  const signedIn = user !== undefined ? user : (role ? { username: 'someone', role } : null);
  if (signedIn) ss.set('fids_user', JSON.stringify(signedIn));
  if (lock) ls.set('fids_editor_lock', lock);
  const storage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, x) => { m.set(k, String(x)); }, removeItem: (k) => { m.delete(k); } });
  const attrs = {}, vars = {};
  const body = {
    getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
    setAttribute: (k, x) => { attrs[k] = String(x); },
    removeAttribute: (k) => { delete attrs[k]; },
    style: { setProperty: (k, x) => { vars[k] = x; }, removeProperty: (k) => { delete vars[k]; } },
    dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  // a select: a value it has no option for leaves it on no option, read back as ''
  const select = (opts) => {
    const el = { dataset: {}, style: {}, disabled: false, _v: '', _i: 0 };
    Object.defineProperty(el, 'value', { get() { return this._v; }, set(x) { const i = opts.indexOf(String(x)); this._i = i; this._v = i < 0 ? '' : String(x); } });
    Object.defineProperty(el, 'selectedIndex', { get() { return this._i; } });
    return el;
  };
  const note = () => ({ style: { display: 'none' }, textContent: '' });
  const box = () => ({ checked: false, dataset: {} });
  const els = {
    apSel: { value: 'YQM' }, cuThemeSelect: select(['', 'tus-teal']), cuFontSelect: select(['']),
    cuWxIcons: select(['', 'classic', 'colour', 'solid']), cuRowPalette: select(['', 'airport']),
    cuRowPaletteNote: note(), cuRowPaletteSignNote: note(), cuCloudSyncNote: note(),
    cuHidePrefix: box(), cuHideWeather: box(), cuAirlineEmblem: box(),
  };
  if (floorControl) Object.assign(els, { cuFloor: select(['', 'classic']), cuFloorNote: note() });
  const listeners = {};
  const timers = [], net = [], puts = [];
  const kv = new Map(cloud ? [['airport:YQM', JSON.stringify(cloud)]] : []);
  const env = { FIDS_USERS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, x) => { kv.set(k, x); } } };
  const jsonResponse = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(data)) });
  const W = new Function('jsonResponse', WORKER_SRC() + '\nreturn { put: handlePutAirport, get: handleGetAirport };')(jsonResponse);
  const g = {
    document: { body, documentElement: { setAttribute() {}, removeAttribute() {}, getAttribute: () => null }, getElementById: (id) => els[id] || null },
    window: {
      addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
      dispatchEvent: (e) => { (listeners[e.type] || []).forEach((f) => f(e)); return true; },
    },
    localStorage: storage(ls), sessionStorage: storage(ss), location: { search }, URLSearchParams,
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    console: { log() {}, warn() {} }, setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {},
    fetch: async (url, opts = {}) => {
      const method = opts.method || 'GET';
      net.push(method);
      const code = url.split('/').pop();
      if (method === 'PUT') {
        puts.push(JSON.parse(opts.body));
        if (offline) throw new TypeError('Failed to fetch');
        return W.put({ json: async () => JSON.parse(opts.body) }, env, { sub: 'someone', role }, '', code);
      }
      return W.get(env, '', code);
    },
    AP: {}, BANNER_PALETTE: {}, FIDS_API_BASE: 'https://worker.example',
    _extractLogoPalette: () => { throw new Error('no logo read: the banner palette of this screen is at hand'); },
  };
  // editor-roles.js as the page loads it, after menu.js (its poll for the panel never runs here)
  if (editorRoles) new Function('window', 'document', 'sessionStorage', 'localStorage', 'setInterval', 'clearInterval', ROLES)(g.window, g.document, g.sessionStorage, g.localStorage, () => 0, () => {});
  const names = Object.keys(g);
  const api = new Function(...names, SCREEN_SRC() + `
    function render() { _fidsRowPalPaint(); }   // the board render runs the row painter first
    return { apply: applyAirportConfigToBoard, refresh: refreshAirportConfig, save: cuApplyAndSave,
             paintForm: function () { _cuPaintForm(_cuLoad()); },
             handlers: { cuApplyAndSave: cuApplyAndSave, cuAirportOnlyChanged: (typeof cuAirportOnlyChanged === 'function') ? cuAirportOnlyChanged : undefined } };
  `)(...names.map((n) => g[n]));
  const flush = async () => { for (let n = 0; n < 50; n++) { while (timers.length) timers.shift()(); await new Promise((r) => setImmediate(r)); } };
  const deviceCopy = () => JSON.parse(ls.get('fids_customize_YQM') || '{}');
  const cloudCopy = () => JSON.parse(kv.get('airport:YQM') || '{}');
  // another screen saves the airport config
  const cloudSet = (patch) => { const c = cloudCopy(); kv.set('airport:YQM', JSON.stringify(Object.assign(c, patch, { updatedAt: (c.updatedAt || 0) + 1000 }))); };
  // a pick by the user: the value, then the onchange menu.html gives that select
  const pick = (id, value) => {
    const tag = new RegExp('<select [^>]*id="' + id + '"[^>]*>').exec(MENU_HTML);
    assert.ok(tag, id + ' is in menu.html');
    const m = /onchange="(\w+)\((this)?\)"/.exec(tag[0]);
    assert.ok(m && typeof api.handlers[m[1]] === 'function', 'the onchange of ' + id + ' runs a Customize handler: ' + tag[0]);
    els[id].value = value;
    api.handlers[m[1]](els[id]);
  };
  // the role editor-roles.js itself goes by, when it is loaded
  const editorRole = () => (g.window.EditorRoles ? g.window.EditorRoles.current() : null);
  return Object.assign(api, { els, attrs, vars, net, puts, flush, deviceCopy, cloudCopy, cloudSet, pick, editorRole });
}
const shown = (el) => (el.style.display === 'none' ? '' : el.textContent);

// ── the rules, read out of display-overrides.css ────────────────────────────
function block() {
  const at = CSS.indexOf('ROWS IN THE AIRPORT LOGO COLOURS (Customize: Row colours)');
  assert.ok(at > 0, 'display-overrides.css must carry the ROWS IN THE AIRPORT LOGO COLOURS block');
  const end = CSS.indexOf('\n/* ── ', at);
  assert.ok(end > at, 'the block must end where the next section starts');
  return CSS.slice(CSS.lastIndexOf('/*', at), end);
}
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const part of src.split('}')) {
    const b = part.indexOf('{');
    if (b < 0) continue;
    const sels = [];
    let depth = 0, cur = '';
    for (const ch of part.slice(0, b)) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { sels.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) sels.push(cur.trim());
    out.push({ sels, body: part.slice(b + 1).trim() });
  }
  return out;
}
const STATES = ['row-delayed', 'row-cancelled', 'row-diverted', 'row-final', 'row-departed', 'row-arrived', 'row-gate-closed'];
const ids = (sel) => (sel.match(/#/g) || []).length;

// ═══ off by default ═════════════════════════════════════════════════════════

test('off by default: nothing chosen is the theme rows, and nothing is painted', () => {
  const sel = MENU_HTML.slice(MENU_HTML.indexOf('<select class="sm-select" id="cuRowPalette"'), MENU_HTML.indexOf('</select>', MENU_HTML.indexOf('id="cuRowPalette"')));
  assert.ok(sel.length > 0, 'Customize carries the Row colours select');
  assert.deepEqual([...sel.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]), ['', 'airport'], 'the first entry, nothing chosen, is the default');
  assert.match(sel, /<option value="">Theme \(default\)/);
  assert.match(sel, /onchange="cuAirportOnlyChanged\(this\)"/, 'a pick is marked as made here, then saved');
  assert.ok(MENU_HTML.indexOf('id="cuRowPaletteNote"') > MENU_HTML.indexOf('id="cuRowPalette"'), 'the note sits under the control');
  // operator words: the menu is English only, like every other Customize string
  assert.doesNotMatch(sel, /data-i18n|bs\(/);

  for (const pref of [undefined, null, '', 'theme', 'Airport', 'on']) {
    const b = board({ store: warm('YQM', BAND.YQM), cfg: { logo: { url: LOGO } } });
    assert.equal(b.setting(pref), false, String(pref));
    assert.equal(b.attrs['data-fids-row-palette'], undefined, String(pref) + ' leaves the body unmarked');
    assert.equal(b.paint(), false, 'and the painter has nothing to do');
    assert.deepEqual(b.vars, {}, 'no row colour is written');
    assert.equal(b.attrs['data-fids-row-palette-state'], undefined);
    assert.equal(b.reads.length, 0, 'and the logo is not even read for the rows');
    assert.equal(b.rebuilt(), false, 'the rows on screen are left as they are');
  }
  // the board reads the airport choice alone, like the bottom of the board: never a copy on a screen
  assert.match(fn('applyAirportConfigToBoard'), /try \{ _fidsRowPalSetting\(_fidsAirportRowPal\(iata\)\); \} catch \(eRp\) \{\}/);
  assert.doesNotMatch(CORE, /_pref\('rowPalette'\)/);
  // every rule of the block needs the choice on the body
  const BLOCK = block();
  for (const r of rules(BLOCK)) for (const s of r.sels) assert.match(s, /body\[data-fids-row-palette="airport"\]\[data-fids-row-palette-state="(rows|head)"\]/, s.slice(0, 120));
});

// ═══ the attribute follows the choice ═══════════════════════════════════════

test('the body attribute is set and cleared as the choice changes, and the rows are rebuilt each time', () => {
  const b = board({ store: warm('YQM', BAND.YQM), cfg: { logo: { url: LOGO } } });
  assert.equal(b.setting('airport'), true);
  assert.equal(b.attrs['data-fids-row-palette'], 'airport');
  assert.equal(b.paint(), true);
  assert.equal(b.attrs['data-fids-row-palette-state'], 'rows');
  assert.equal(b.attrs['data-fids-row-palette-colour'], BAND.YQM[0], 'the logo colour the rows take, for the menu');
  for (const k of ['odd', 'even', 'head', 'amber', 'green', 'rev']) assert.match(b.vars['--fids-rowpal-' + k] || '', /^#[0-9a-f]{6}$/i, k);
  assert.equal(b.rebuilt(), true, 'inks measured off the old ground are measured again');
  assert.equal(b.events.length, 1);
  assert.equal(b.events[0].type, 'fids-row-palette');
  assert.equal(b.paint(), false, 'the same answer twice changes nothing');
  assert.equal(b.rebuilt(), false);

  assert.equal(b.setting(''), false);
  assert.equal(b.attrs['data-fids-row-palette'], undefined);
  assert.equal(b.paint(), true);
  assert.equal(b.attrs['data-fids-row-palette-state'], undefined);
  assert.equal(b.attrs['data-fids-row-palette-colour'], undefined);
  assert.deepEqual(b.vars, {}, 'the theme rows come back as they were');
  assert.equal(b.rebuilt(), true);
  assert.equal(b.events.length, 2);

  // render paints before it measures the rows (light board flag, wordmark art, typed names)
  // the board render (a dialog elsewhere in the file declares a render of its own)
  const rAt = CORE.indexOf('\nfunction render() {\n  if (_renderBlocked) return;');
  assert.ok(rAt > 0, 'the board render');
  const render = CORE.slice(rAt, CORE.indexOf('\n}\n', rAt));
  const paint = render.indexOf('try { _fidsRowPalPaint(); } catch (eRp) {}');
  assert.ok(paint > 0, 'render() runs the painter');
  assert.ok(paint < render.indexOf("document.body.classList.toggle('fids-light-board', wordmarkVariant() === 'dark')"), 'before the light board flag');
  assert.ok(paint < render.indexOf('const _nameGrounds = _boardRowGrounds();'), 'and before the typed names read their grounds');
  assert.ok(paint > render.indexOf('if (!allFiltered.length) return;'), 'only when there are rows to paint');
});

test('Customize sends the choice to the airport cloud, reads a kept one back at once, and says when the cloud did not keep it', async () => {
  // read from the form only while the control shows the airport config itself
  // or a pick made in this panel; no copy is kept on a screen, so none is carried forward
  const read = fn('_cuReadForm', MENU);
  assert.match(read, /if \(_cuAirportOnlySends\(rp\)\) p\.rowPalette = rp\.value;/);
  assert.doesNotMatch(read, /_pv5|\.rowPalette !== undefined/, 'never carried forward from a copy on this screen');
  // painted as the board reads it: the airport choice alone
  const paint = fn('_cuPaintAirportOnly', MENU);
  assert.match(paint, /\['cuRowPalette', 'cuRowPaletteSignNote', \(typeof _fidsAirportRowPal === 'function'\) \? _fidsAirportRowPal : null\]/);
  assert.doesNotMatch(paint, /prefs|_cuLoad|localStorage|getAirportConfig/, 'never a copy on this screen');
  assert.match(fn('_cuPaintForm', MENU), /try \{ _cuPaintAirportOnly\(true\); \} catch \(e\) \{\}/, 'the whole panel paints it');
  assert.ok(MENU_HTML.indexOf('id="cuRowPaletteSignNote"') > MENU_HTML.indexOf('id="cuRowPalette"'), 'the note sits under the control');
  // the worker keeps it, and only a value the boards know
  assert.match(PROXY, /\n\s*"rowPalette",/);
  assert.match(PROXY, /if \(cfg\.rowPalette !== undefined && !\["", "airport"\]\.includes\(cfg\.rowPalette\)\) delete cfg\.rowPalette;/);
  // no copy on a screen is read, so a newer cloud save has none to shed
  assert.doesNotMatch(CORE, /_cloudOwned\.push\('rowPalette'\);/);

  // the cloud push and its note, run as written against the worker in this
  // repository and one deployed before the field existed
  async function push(prefs, allowed) {
    const at = MENU.indexOf('function _cuSyncNote(kind) {');
    const fnAt = MENU.indexOf('function _cuCloudPush(code, prefs) {');
    const end = MENU.indexOf('\n}\n', fnAt) + 3;
    const note = { style: {}, textContent: '' };
    const sel = { value: prefs.rowPalette };
    const store = { fids_customize_YQM: JSON.stringify(Object.assign({}, prefs, { savedAt: 100 })) };
    const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, x) => { store[k] = String(x); } };
    const doc = { getElementById: (id) => (id === 'cuCloudSyncNote' ? note : id === 'cuRowPalette' ? sel : null) };
    let sent = null, reread = 0;
    const fetch = (url, opts) => {
      sent = JSON.parse(opts.body);
      const cfg = Object.assign({}, sent);
      if (allowed && cfg.rowPalette !== undefined && !allowed.includes(cfg.rowPalette)) delete cfg.rowPalette;
      if (!allowed) delete cfg.rowPalette;
      cfg.updatedAt = 200;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, config: cfg }) });
    };
    new Function('document', 'localStorage', '_acGetToken', '_acFetch', '_AC_WORKER_URL', 'setTimeout', 'clearTimeout', 'console', 'refreshAirportConfig',
      MENU.slice(at, MENU.indexOf('\n}\n', at) + 3) + MENU.slice(MENU.indexOf('var _cuCloudTimer = null;'), end) + '\n_cuCloudPush("YQM", ' + JSON.stringify(prefs) + ');')(
      doc, ls, () => 'token', fetch, '', (f) => { f(); return 1; }, () => {}, { log() {}, warn() {} }, (code) => { if (code === 'YQM') reread++; });
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    return { sent, note: note.textContent, savedAt: JSON.parse(store.fids_customize_YQM).savedAt, sel: sel.value, reread };
  }
  const NEW_WORKER = JSON.parse(/!(\[[^\]]+\])\.includes\(cfg\.rowPalette\)/.exec(PROXY)[1]);
  let r = await push({ rowPalette: 'airport', font: 'bricolage' }, NEW_WORKER);
  assert.equal(r.sent.rowPalette, 'airport', 'the choice travels to the airport config');
  assert.match(r.note, /^✓ Saved to the airport cloud/);
  assert.equal(r.savedAt, 200, 'the stamp of this device is aligned with the cloud');
  // the board reads the airport choice alone, so this screen reads the kept
  // choice back at once, not at the next 10 s poll, the floor sent with it or not
  assert.equal(r.reread, 1, 'a kept choice is read back at once');
  r = await push({ rowPalette: '' }, NEW_WORKER);
  assert.equal(r.sent.rowPalette, '', 'turning it off reaches the airport too');
  assert.equal(r.reread, 1, 'and shows at once');
  r = await push({ rowPalette: 'airport' }, null);
  assert.match(r.note, /^⚠ Saved to the airport cloud, except the row colours/, 'a worker without the field: not "Saved"');
  assert.equal(r.savedAt, 100, 'the newer cloud copy wins on the next read');
  assert.equal(r.sel, '', 'the select goes back to the default entry');
  assert.equal(r.reread, 0, 'nothing kept, nothing to read back');
});

test('the row colours are the airport choice alone, like the bottom of the board: a copy on a screen never turns them on or off', async () => {
  // run: the airport config arrives and the board applies it
  const T0 = 1764000000000;
  const boot = async (cloud, device, search = '') => {
    const s = screen({ cloud, device, search });
    if (cloud) await s.refresh('YQM'); else s.apply('YQM');
    return s;
  };
  // a copy on this screen newer than the airport save, so nothing sheds it, still decides nothing
  let s = await boot({ rowPalette: '', updatedAt: T0 }, { theme: 'tus-teal', rowPalette: 'airport', savedAt: T0 + 1000 });
  assert.equal(s.attrs['data-fids-row-palette'], undefined, 'a copy of airport on a screen does not turn the rows on');
  assert.equal(s.attrs['data-fids-row-palette-state'], undefined);
  assert.equal(s.deviceCopy().rowPalette, undefined, 'and is retired where the board reads it');
  assert.equal(s.deviceCopy().theme, 'tus-teal', 'every other field of it stays');
  s = await boot({ rowPalette: 'airport', updatedAt: T0 }, { theme: 'tus-teal', rowPalette: '', savedAt: T0 + 1000 });
  assert.equal(s.attrs['data-fids-row-palette'], 'airport', 'the airport choice, whatever the screen holds');
  assert.equal(s.attrs['data-fids-row-palette-state'], 'rows');
  s = await boot(null, { rowPalette: 'airport', savedAt: T0 });
  assert.equal(s.attrs['data-fids-row-palette'], undefined, 'no airport config: nothing chosen');
  // the review switch still decides one load
  s = await boot({ rowPalette: '', updatedAt: T0 }, null, '?rowpal=on');
  assert.equal(s.attrs['data-fids-row-palette'], 'airport');
  s = await boot({ rowPalette: 'airport', updatedAt: T0 }, null, '?rowpal=off');
  assert.equal(s.attrs['data-fids-row-palette'], undefined);

  // the reader: airport only when the airport config itself says airport
  const of = new Function(fn('_fidsAirportRowPalOf') + '\nreturn _fidsAirportRowPalOf;')();
  assert.equal(of({ rowPalette: 'airport' }), 'airport');
  for (const cfg of [null, undefined, {}, { rowPalette: '' }, { rowPalette: 'Airport' }, { rowPalette: 'on' }, { rowPalette: true }]) assert.equal(of(cfg), '', JSON.stringify(cfg));
  // read from the cloud copy itself: never getAirportConfig (a per-browser override would win), _pref or storage
  const reader = fn('_fidsAirportRowPal');
  assert.match(reader, /_airportConfigCache\[norm\]/);
  assert.doesNotMatch(reader, /getAirportConfig|_pref|localStorage/);
});

test('Customize keeps no copy of the row colours on the screen, and still sends them to the airport', () => {
  const at = MENU.indexOf('function _cuSave(prefs) {');
  const store = {};
  const save = new Function('localStorage', '_cuStorageKey', MENU.slice(at, MENU.indexOf('\n}\n', at) + 2) + '\nreturn _cuSave;')(
    { setItem: (k, x) => { store[k] = x; } }, () => 'fids_customize_YQM');
  const prefs = { theme: 'navy', rowPalette: 'airport', floor: 'classic', wxIcons: '' };
  save(prefs);
  const kept = JSON.parse(store.fids_customize_YQM);
  assert.equal(kept.rowPalette, undefined, 'not in the copy on this screen');
  assert.equal(kept.floor, undefined, 'nor the floor');
  assert.equal(kept.theme, 'navy');
  assert.equal(kept.wxIcons, '');
  assert.equal(prefs.rowPalette, 'airport', 'still there for the cloud push');
  save({ theme: 'navy', rowPalette: '' });
  assert.equal(JSON.parse(store.fids_customize_YQM).rowPalette, undefined, 'nothing chosen is not kept either');
});

// ═══ turning the rows off while the airport holds airport ════════════════════
// The airport chose the logo colours; Customize opens on a screen of it.
async function airportOn(role, opts = {}) {
  const T0 = 1764000000000;
  const s = screen(Object.assign({
    role,
    cloud: { theme: 'tus-teal', floor: '', rowPalette: 'airport', updatedAt: T0, updatedBy: 'someone' },
    device: { theme: 'tus-teal', savedAt: T0 },
  }, opts));
  await s.refresh('YQM');
  s.paintForm();
  assert.equal(s.attrs['data-fids-row-palette-state'], 'rows', 'the airport chose the logo colours');
  assert.equal(s.els.cuRowPalette.value, 'airport', 'and the control shows the airport choice');
  s.net.length = 0;
  return s;
}

test('turning the rows off, signed out: the control is shown disabled with the reason, and a save keeps no copy and sends nothing', async () => {
  const s = await airportOn(null);
  assert.equal(s.els.cuRowPalette.disabled, true, 'signed out, a pick could not reach the airport');
  assert.equal(shown(s.els.cuRowPaletteSignNote), 'Set for the whole airport. Sign in (Login) to change it.');
  s.save(); await s.flush();   // a save of anything else on the panel
  assert.deepEqual(s.net, []);
  assert.equal(s.deviceCopy().rowPalette, undefined, 'no copy on this screen');
  assert.equal(s.attrs['data-fids-row-palette'], 'airport', 'the rows stay as the airport chose');
});

test('turning the rows off, signed in without admin rights: the control is disabled with the reason, and a refused save (403) says the airport choice did not change', async () => {
  const s = await airportOn('operator');
  // editor-roles.js shows Display Options to an operator, but the worker takes the airport save from an admin only
  assert.match(PROXY, /async function handlePutAirport\(request, env, payload, origin, code\) \{\n  if \(!isAdmin\(payload\)\) return jsonResponse\(\{ error: "Admin access required" \}, 403, origin\);/);
  assert.equal(s.els.cuRowPalette.disabled, true, 'an operator could not change the airport choice');
  assert.equal(shown(s.els.cuRowPaletteSignNote), 'Set for the whole airport. Only an admin can change it.');
  s.save(); await s.flush();   // a save of anything else on the panel
  assert.deepEqual(s.net, ['PUT']);
  assert.equal(s.puts[0].rowPalette, 'airport', 'the airport choice as it is, painted from the config');
  assert.match(shown(s.els.cuCloudSyncNote), /^⚠ Cloud save failed — the airport choice did not change/);
  assert.doesNotMatch(shown(s.els.cuCloudSyncNote), /the look is on this device only/, 'no copy of it is kept on this device');
  assert.equal(s.cloudCopy().rowPalette, 'airport');
  assert.equal(s.attrs['data-fids-row-palette'], 'airport', 'the board stays as the airport chose');
  assert.equal(s.deviceCopy().rowPalette, undefined, 'no copy on this screen');
  s.paintForm();
  assert.equal(s.els.cuRowPalette.value, 'airport', 'reopened, the control shows the airport choice');
});

test('turning the rows off as an admin: the cloud keeps nothing chosen and this screen shows it at once', async () => {
  const s = await airportOn('admin');
  assert.equal(s.els.cuRowPalette.disabled, false, 'an admin may change it');
  assert.equal(shown(s.els.cuRowPaletteSignNote), '');
  s.pick('cuRowPalette', '');
  await s.flush();
  assert.deepEqual(s.net, ['PUT', 'GET'], 'saved, then read back');
  assert.equal(s.cloudCopy().rowPalette, '', 'the airport holds nothing chosen');
  assert.match(shown(s.els.cuCloudSyncNote), /^✓ Saved to the airport cloud/);
  assert.equal(s.attrs['data-fids-row-palette'], undefined, 'the rows are off on this screen at once');
  assert.equal(s.attrs['data-fids-row-palette-state'], undefined);
  assert.deepEqual(s.vars, {}, 'the theme rows are back');
  assert.equal(s.deviceCopy().rowPalette, undefined, 'no copy on this screen');
  s.paintForm();
  assert.equal(s.els.cuRowPalette.value, '', 'reopened, the control shows nothing chosen');
});

test('turning the rows off as an admin: the read back does not wait on the floor travelling with the choice', async () => {
  const s = await airportOn('admin', { floorControl: false });
  s.pick('cuRowPalette', '');
  await s.flush();
  assert.deepEqual(s.net, ['PUT', 'GET'], 'saved, then read back');
  assert.equal(s.attrs['data-fids-row-palette'], undefined, 'off at once');
});

// ═══ the airport-only controls: Bottom of the board and Row colours ═════════
// Both are the airport choice alone (_fidsAirportFloor, _fidsAirportRowPal),
// kept on no screen, and the worker takes an airport save from an admin only.
const SIGN_IN = 'Set for the whole airport. Sign in (Login) to change it.';
const ADMIN_ONLY = 'Set for the whole airport. Only an admin can change it.';
const AIRPORT_ONLY = [['cuFloor', 'cuFloorNote'], ['cuRowPalette', 'cuRowPaletteSignNote']];
const T1 = 1764000000000;
const CLOUD = () => ({ theme: 'tus-teal', floor: 'classic', rowPalette: 'airport', updatedAt: T1, updatedBy: 'someone' });

test('both airport-only controls are disabled with the reason unless the signed-in role is admin, the role read as editor-roles.js reads it', async () => {
  const lockOf = (s) => AIRPORT_ONLY.map(([id, note]) => [s.els[id].disabled, shown(s.els[note])]);
  const cases = [
    // [what, screen options, disabled and note]
    ['signed out', { role: null }, [true, SIGN_IN]],
    ['an operator', { role: 'operator' }, [true, ADMIN_ONLY]],
    ['a viewer', { role: 'viewer' }, [true, ADMIN_ONLY]],
    ['an operator, on a screen locked to admin', { role: 'operator', lock: 'admin' }, [true, ADMIN_ONLY]],
    ['an admin', { role: 'admin' }, [false, '']],
    ['an admin, on a screen locked to operator', { role: 'admin', lock: 'operator' }, [false, '']],
    // editor-roles.js takes a role it does not know, or none, for no signed-in
    // role and goes by the lock of the screen, admin when none is set: so does the panel
    ['a role editor-roles.js does not know', { role: 'admin', user: { username: 'someone', role: 'superuser' } }, [false, '']],
    ['no role in fids_user', { role: 'admin', user: { username: 'someone' } }, [false, '']],
    ['no fids_user in this tab', { role: 'admin', user: null }, [false, '']],
  ];
  for (const [what, opts, want] of cases) {
    for (const editorRoles of [true, false]) {
      const s = screen(Object.assign({ cloud: CLOUD(), device: { theme: 'tus-teal', savedAt: T1 }, editorRoles }, opts));
      await s.refresh('YQM');
      s.paintForm();
      const label = what + (editorRoles ? '' : ', editor-roles.js not loaded');
      assert.deepEqual(lockOf(s), [want, want], label);
      assert.equal(s.els.cuFloor.value, 'classic', label + ': the floor shows the airport choice');
      assert.equal(s.els.cuRowPalette.value, 'airport', label + ': and so do the rows');
      // the role editor-roles.js itself goes by decides it, when it is loaded
      if (editorRoles && opts.role) assert.equal(want[0], s.editorRole() !== 'admin', label + ': editor-roles.js goes by ' + s.editorRole());
    }
  }
  // with no role it knows, editor-roles.js goes by the lock of the screen, and so does the panel
  const locked = screen({ role: 'admin', user: { username: 'someone' }, lock: 'operator', cloud: CLOUD() });
  await locked.refresh('YQM');
  locked.paintForm();
  assert.equal(locked.editorRole(), 'operator');
  assert.deepEqual(lockOf(locked), [[true, ADMIN_ONLY], [true, ADMIN_ONLY]]);
});

test('a save that carried the airport choice and failed says the airport choice did not change; one that did not keeps the device note', async () => {
  // refused (403): this tab says admin, the token the worker reads is an operator one
  let s = screen({ role: 'operator', user: { username: 'someone', role: 'admin' }, cloud: CLOUD(), device: { theme: 'tus-teal', savedAt: T1 } });
  await s.refresh('YQM');
  s.paintForm();
  assert.equal(s.els.cuRowPalette.disabled, false, 'this tab believes it is an admin');
  s.net.length = 0;
  s.pick('cuRowPalette', '');
  await s.flush();
  assert.deepEqual(s.net, ['PUT']);
  assert.equal(s.puts[0].rowPalette, '');
  assert.match(shown(s.els.cuCloudSyncNote), /^⚠ Cloud save failed — the airport choice did not change: the bottom of the board and the row colours stay as the airport has them/);
  assert.doesNotMatch(shown(s.els.cuCloudSyncNote), /the look is on this device only/);
  assert.equal(s.cloudCopy().rowPalette, 'airport', 'the airport choice did not change');
  assert.equal(s.attrs['data-fids-row-palette'], 'airport', 'nor this board');
  assert.equal(s.deviceCopy().rowPalette, undefined, 'and no copy is kept here');
  // no answer at all (offline): the same note
  s = screen({ role: 'admin', cloud: CLOUD(), device: { theme: 'tus-teal', savedAt: T1 }, offline: true });
  await s.refresh('YQM');
  s.paintForm();
  s.net.length = 0;
  s.pick('cuFloor', '');
  await s.flush();
  assert.deepEqual(s.net, ['PUT']);
  assert.equal(s.puts[0].floor, '');
  assert.match(shown(s.els.cuCloudSyncNote), /^⚠ Cloud save failed — the airport choice did not change/);
  assert.equal(s.cloudCopy().floor, 'classic');
  // a failed save that carried neither (the panel painted before the airport
  // config was in): the look it carried is on this device only, and it says so
  s = screen({ role: 'admin', cloud: CLOUD(), device: { theme: 'tus-teal', savedAt: T1 }, offline: true });
  s.paintForm();
  s.save(); await s.flush();
  assert.equal('floor' in s.puts[0] || 'rowPalette' in s.puts[0], false);
  assert.match(shown(s.els.cuCloudSyncNote), /^⚠ Cloud save failed — the look is on this device only for now/);
  assert.match(MENU, /airportFailed: \['#f87171', /);
});

test('a panel painted before the airport config is in sends neither airport choice, and paints both once the config comes', async () => {
  const s = screen({ role: 'admin', cloud: CLOUD(), device: { theme: 'tus-teal', savedAt: T1 } });
  s.paintForm();   // the late repaint at 2.5 s, or a Customize tab opened early: the airport config is not in yet
  assert.equal(s.els.cuFloor.value, '', 'the default is all it can show');
  assert.equal(s.els.cuRowPalette.value, '');
  s.save(); await s.flush();   // a save of anything else on the panel
  assert.equal(s.puts.length, 1);
  assert.equal('floor' in s.puts[0], false, 'the floor is left out of the save');
  assert.equal('rowPalette' in s.puts[0], false, 'and so are the row colours');
  assert.equal(s.cloudCopy().floor, 'classic', 'so the airport keeps the old backdrop');
  assert.equal(s.cloudCopy().rowPalette, 'airport', 'and the logo colours');
  // the airport config comes in (fids-airport-config-ready), and both show it
  assert.match(MENU, /try \{ window\.addEventListener\('fids-airport-config-ready', function \(ev\) \{ try \{ _cuAirportConfigIn\(ev\); \} catch \(e\) \{\} \}\); \} catch \(e\) \{\}/);
  for (const f of ['loadAirportConfig', 'refreshAirportConfig']) assert.match(fn(f), /window\.dispatchEvent\(new CustomEvent\('fids-airport-config-ready', \{ detail: \{ code: norm, config: cfg \} \}\)\)/, f + ' says the config came in');
  await s.refresh('YQM');
  assert.equal(s.els.cuFloor.value, 'classic', 'the floor shows the airport choice');
  assert.equal(s.els.cuRowPalette.value, 'airport', 'and so do the rows');
  assert.equal(s.attrs['data-fids-row-palette'], 'airport');
  // now a save of anything else carries the airport choice as it is
  s.save(); await s.flush();
  assert.equal(s.puts[1].floor, 'classic');
  assert.equal(s.puts[1].rowPalette, 'airport');
  assert.equal(s.cloudCopy().floor, 'classic');
  assert.equal(s.cloudCopy().rowPalette, 'airport');
});

test('a pick made before the airport config is in is sent, and kept when the config comes; the untouched control shows the config', async () => {
  const s = screen({ role: 'admin', cloud: Object.assign(CLOUD(), { rowPalette: '' }), device: { theme: 'tus-teal', savedAt: T1 } });
  s.paintForm();   // too early: both on the default, neither read from the airport config
  s.pick('cuRowPalette', 'airport');   // the user picks the logo colours
  await s.refresh('YQM');              // the config comes in before the save leaves
  assert.equal(s.els.cuRowPalette.value, 'airport', 'the pick is kept');
  assert.equal(s.els.cuFloor.value, 'classic', 'the untouched control shows the airport choice');
  await s.flush();
  assert.equal(s.puts[0].rowPalette, 'airport', 'the pick is sent');
  assert.equal('floor' in s.puts[0], false, 'the floor, unread when the save was made, is left out');
  assert.equal(s.cloudCopy().rowPalette, 'airport');
  assert.equal(s.cloudCopy().floor, 'classic', 'and the airport keeps it');
  assert.equal(s.attrs['data-fids-row-palette'], 'airport');
});

test('a kept pick shows the airport config again, so a change saved on another screen is painted in and not undone', async () => {
  const s = await airportOn('admin');
  s.pick('cuRowPalette', '');
  await s.flush();
  assert.equal(s.cloudCopy().rowPalette, '');
  s.cloudSet({ rowPalette: 'airport' });   // another admin turns them back on
  await s.refresh('YQM');                  // the 10 s poll
  assert.equal(s.els.cuRowPalette.value, 'airport', 'the change made elsewhere shows here');
  assert.equal(s.attrs['data-fids-row-palette'], 'airport');
  s.save(); await s.flush();   // a save of anything else here
  assert.equal(s.puts[s.puts.length - 1].rowPalette, 'airport');
  assert.equal(s.cloudCopy().rowPalette, 'airport', 'and the next save here does not undo it');
});

test('the menu says what the board did with the choice', () => {
  const note = (attrs) => {
    const el = { style: {}, textContent: '' };
    const body = { getAttribute: (k) => (k in attrs ? attrs[k] : null) };
    new Function('document', fn('_cuRowPaletteNote', MENU) + '\n_cuRowPaletteNote();')({ body, getElementById: (id) => (id === 'cuRowPaletteNote' ? el : null) });
    return el.style.display === 'none' ? '' : el.textContent;
  };
  assert.equal(note({}), '', 'off: no note');
  assert.match(note({ 'data-fids-row-palette': 'airport', 'data-fids-row-palette-state': 'rows', 'data-fids-row-palette-colour': '#00426f' }), /the rows take the logo colour #00426f/);
  assert.match(note({ 'data-fids-row-palette': 'airport', 'data-fids-row-palette-state': 'head', 'data-fids-row-palette-colour': '#870013', 'data-fids-row-palette-why': 'status' }),
    /read as status colours[\s\S]*the rows keep the theme[\s\S]*#870013/, 'a logo held back says why');
  assert.match(note({ 'data-fids-row-palette': 'airport', 'data-fids-row-palette-state': 'none' }), /no colour the rows can take[\s\S]*keep the theme/);
  assert.match(MENU, /window\.addEventListener\('fids-row-palette', function \(\) \{ try \{ _cuRowPaletteNote\(\); \} catch \(e\) \{\} \}\);/, 'it follows the board as it changes');
});

// ═══ the rules ══════════════════════════════════════════════════════════════

test('the rules are keyed on the attribute, leave every status row alone, and beat the custom palette', () => {
  const BLOCK = block();
  const rs = rules(BLOCK);
  assert.ok(rs.length >= 8, rs.length + ' rules');
  let rowSels = 0, headSels = 0;
  for (const r of rs) {
    for (const s of r.sels) {
      if (/#fidsTable tbody tr/.test(s)) {
        rowSels++;
        for (const st of STATES) assert.ok(s.includes(':not(.' + st + ')'), 'a row rule must exempt .' + st + ': ' + s.slice(0, 160));
        assert.ok(ids(s) >= 6, 'six id levels or more, one above the custom palette painter: ' + ids(s));
        assert.match(s, /\[data-fids-row-palette-state="rows"\]/, 'rows are painted only in the rows state');
        assert.doesNotMatch(s, /gate-changed-badge(?!\))|\.dest-iata(?![-\w)])|fids-dayplus|logo-monogram/, 'the badge, the code, the pill and the tiles keep their own painters');
      } else {
        assert.match(s, /#fidsTable thead th$/, 'the only other target is the column titles: ' + s);
        headSels++;
      }
    }
    // the row grounds set background-color only: the rail and the Orlando pattern stay on them
    if (r.sels.some((s) => /tbody tr/.test(s))) assert.doesNotMatch(r.body, /(^|;|\s)background(-image)?\s*:/, r.body);
  }
  assert.ok(rowSels >= 10 && headSels === 2, rowSels + ' row selectors, ' + headSels + ' title selectors');
  // the white of the words leaves the badge, the code and the weather icons out
  const white = rs.find((r) => /color: #ffffff !important/.test(r.body) && r.sels.some((s) => /td \*/.test(s)));
  assert.ok(white, 'the words are white');
  assert.match(white.sels.find((s) => /td \*/.test(s)), /td \*:not\(\.gate-changed-badge\):not\(\.dest-iata\):not\(\.dest-iata-sep\):not\(\.fids-wx-cell\)$/);
  assert.doesNotMatch(BLOCK.replace(/\/\*[\s\S]*?\*\//g, ''), /-webkit-text-fill-color/, 'no inherited fill: the badge and the code keep their own ink');
  // the status words and times outrank that white whatever their class count
  for (const r of rs) if (/var\(--fids-rowpal-(amber|green|rev)\)/.test(r.body)) for (const s of r.sels) assert.ok(ids(s) > ids(white.sels[0]), s.slice(0, 80));
  // the block sits in the file, never at its end (other tests read the last section to the end)
  assert.ok(CSS.indexOf(BLOCK) + BLOCK.length < CSS.length - 1000);
  assert.ok(CSS.indexOf(BLOCK) < CSS.lastIndexOf('\n/* ── '), 'a later section follows it');
  // no word is drawn by CSS
  assert.doesNotMatch(BLOCK, /content:\s*['"][^'"]+['"]/);
});

// ═══ the grounds come from the band palette ═════════════════════════════════

test('the grounds derive from the band palette: the same logo colours the banner wears', () => {
  const rs = rules(block());
  const ground = (re) => rs.find((r) => r.sels.every((s) => re.test(s)));
  assert.match(ground(/tbody tr:not\([^)]*\)(:not\([^)]*\))*$/).body, /background-color: var\(--fids-rowpal-odd\) !important;/);
  assert.match(ground(/:nth-child\(even\)$/).body, /background-color: var\(--fids-rowpal-even\) !important;/);
  assert.match(ground(/thead th$/).body, /background-color: var\(--fids-rowpal-head\) !important;/);
  // one reader for the logo palette: the banner and the rows share the cache key and the read
  assert.match(fn('_autoBandPalette'), /var logo = _fidsAirportLogoUrl\(ap\);/);
  assert.match(fn('_autoBandPalette'), /var cachedPal = _fidsLogoPaletteCached\(ap, logo\);/);
  assert.match(fn('_autoBandPalette'), /_fidsLogoPaletteRead\(ap, logo, function \(pal\) \{/);
  assert.match(fn('_fidsLogoPaletteCached'), /localStorage\.getItem\('fids_logo_palette3_' \+ ap\)/);
  // the airport colours, not a holiday band laid over the banner for a day
  assert.doesNotMatch(fn('_fidsRowPalSource'), /HOLIDAY_BAND/);

  // the variables the painter writes are the plan of that palette, and every
  // ground is a band colour of the logo moved along its own hue
  const L = lib();
  const b = board({ store: warm('YQM', BAND.YQM), cfg: { logo: { url: LOGO } } });
  b.setting('airport'); b.paint();
  const p = L.plan(BAND.YQM);
  assert.equal(b.vars['--fids-rowpal-odd'], p.odd);
  assert.equal(b.vars['--fids-rowpal-even'], p.even);
  assert.equal(b.vars['--fids-rowpal-head'], p.head);
  let painted = 0;
  for (const [ap, pal] of Object.entries(BAND)) {
    if (!pal) continue;
    const q = L.plan(pal);
    assert.ok(q, ap + ' gets a plan');
    if (!q.rows) continue;
    painted++;
    assert.ok(pal.map((c) => c.toLowerCase()).includes(q.main), ap + ': the rows take a band colour of the logo');
    for (const g of [q.odd, q.even, q.head]) {
      const dh = Math.abs(hue(g) - hue(q.main));
      assert.ok(Math.min(dh, 360 - dh) <= 3, ap + ': ' + g + ' keeps the hue of ' + q.main);
    }
    // the lighter row near L* 23.7 whatever the logo (MSP is darker than that and is lifted), the darker 8 to 10 below
    assert.ok(lstar(q.even) >= 22.5 && lstar(q.even) <= 24.5, ap + ' even L* ' + lstar(q.even).toFixed(1));
    const dl = lstar(q.even) - lstar(q.odd);
    assert.ok(dl >= 8 && dl <= 10, ap + ' step ' + dl.toFixed(1));
    assert.ok(ratio('#ffffff', q.even) >= 10, ap + ': white on the lighter row ' + ratio('#ffffff', q.even).toFixed(2));
    assert.ok(ratio('#FFB000', q.even) >= 6, ap + ': the grammar amber itself ' + ratio('#FFB000', q.even).toFixed(2));
  }
  assert.ok(painted >= 30, painted + ' fixture airports paint their rows');

  // a stored banner palette and the registry come first, as they do for the banner
  const own = board({ store: Object.assign(warm('YQM', BAND.YQM), { fids_banner_palette_YQM: JSON.stringify(BAND.SEA) }), cfg: { logo: { url: LOGO } } });
  own.setting('airport'); own.paint();
  assert.equal(own.attrs['data-fids-row-palette-colour'], BAND.SEA[0].toLowerCase());
  const reg = board({ registry: { YQM: BAND.MSP } });
  reg.setting('airport'); reg.paint();
  assert.equal(reg.attrs['data-fids-row-palette-colour'], BAND.MSP[0].toLowerCase());
  // a cached palette of another logo is not this one
  const stale = board({ store: { fids_logo_palette3_YQM: JSON.stringify({ url: 'https://assets.example/old.svg', pal: BAND.SEA }) }, cfg: { logo: { url: LOGO } } });
  stale.setting('airport'); stale.paint();
  assert.equal(stale.attrs['data-fids-row-palette-state'], 'wait', 'it reads the logo the config names');
});

test('a cold screen reads the logo once, keeps the theme rows meanwhile, then paints', () => {
  const b = board({ cfg: { logo: { url: LOGO } } });
  b.setting('airport');
  assert.equal(b.paint(), true);
  assert.equal(b.attrs['data-fids-row-palette-state'], 'wait');
  assert.deepEqual(b.vars, {}, 'the theme rows stay while the logo is read');
  assert.equal(b.reads.length, 1);
  assert.equal(b.reads[0].url, LOGO);
  b.paint(); b.paint();
  assert.equal(b.reads.length, 1, 'one read, however many passes ask');
  b.reads[0].cb(BAND.YQM);
  assert.equal(JSON.parse(b.ls.get('fids_logo_palette3_YQM')).url, LOGO, 'cached against that logo, for the banner too');
  assert.equal(b.renders.length, 1, 'the board is drawn again once the palette is in');
  assert.equal(b.paint(), true);
  assert.equal(b.attrs['data-fids-row-palette-state'], 'rows');
  // a logo that gives nothing: the theme rows, and the menu says so
  const n = board({ ap: 'AUS', cfg: { logo: { url: LOGO } } });
  n.setting('airport'); n.paint();
  n.reads[0].cb(null);
  n.paint();
  assert.equal(n.attrs['data-fids-row-palette-state'], 'none');
  assert.deepEqual(n.vars, {});
  // no logo at all: nothing visible, nothing invented
  const none = board({ ap: 'AUS' });
  none.setting('airport'); none.paint();
  assert.equal(none.attrs['data-fids-row-palette-state'], 'none');
  assert.deepEqual(none.vars, {});
  assert.equal(none.reads.length, 0);
});

// ═══ the inks hold 7 to 1 ═══════════════════════════════════════════════════

test('every word on the rows reads at 7 to 1 on both grounds: red, blue, green and yellow heavy palettes', () => {
  const L = lib();
  const inksOf = (p) => ['#ffffff', p.amber, p.green, p.rev];
  const check = (name, p) => {
    for (const g of [p.odd, p.even]) for (const ink of inksOf(p)) {
      assert.ok(ratio(ink, g) >= 7, name + ': ' + ink + ' on ' + g + ' is ' + ratio(ink, g).toFixed(2) + ' to 1');
    }
    assert.ok(ratio('#ffffff', p.head) >= 7, name + ': the column titles ' + ratio('#ffffff', p.head).toFixed(2));
  };
  // RED: an all red logo paints no row (a red row reads as Cancelled), only the column titles
  for (const ap of ['YYC', 'YYZ', 'YUL']) {
    const p = L.plan(BAND[ap]);
    assert.equal(p.rows, false, ap + ': no red row');
    assert.equal(p.why, 'status');
    assert.equal(p.held, BAND[ap][0].toLowerCase(), ap + ': the titles take band 1');
    assert.ok(ratio('#ffffff', p.head) >= 7, ap + ': white on the titles ' + ratio('#ffffff', p.head).toFixed(2));
  }
  // a red led logo paints its other colour
  const ord = L.plan(BAND.ORD);
  assert.equal(ord.rows, true);
  assert.equal(ord.main, BAND.ORD[3].toLowerCase(), 'the blue of the logo, not its red');
  check('ORD', ord);
  // BLUE: Moncton navy, the near black navy of Minneapolis lifted to the same depth
  check('YQM', L.plan(BAND.YQM));
  check('MSP', L.plan(BAND.MSP));
  // GREEN: a deep true green paints, and its Early green still reads on it
  for (const ap of ['SEA', 'YHU', 'DUB']) {
    const p = L.plan(BAND[ap]);
    assert.equal(p.rows, true, ap + ' paints');
    check(ap, p);
    assert.ok(hue(p.green) > 120 && hue(p.green) < 160, 'Early stays green: ' + p.green);
  }
  // YELLOW HEAVY: the gold of Orlando and the yellow of LaGuardia never paint a row; the teal and the blue do
  for (const ap of ['MCO', 'LGA', 'EWR']) {
    const p = L.plan(BAND[ap]);
    assert.equal(p.rows, true, ap);
    assert.ok(hue(p.even) > 180, ap + ': ' + p.even + ' is not the yellow');
    check(ap, p);
  }
  // and every fixture airport that paints
  for (const [ap, pal] of Object.entries(BAND)) { if (!pal) continue; const p = L.plan(pal); if (p && p.rows) check(ap, p); }
  // the inks keep the grammar colours, only lifted: amber stays amber, the revised time its orange
  const y = L.plan(BAND.YQM);
  assert.ok(hue(y.amber) >= 35 && hue(y.amber) <= 50, y.amber);
  assert.ok(hue(y.rev) >= 28 && hue(y.rev) <= 40, y.rev);
  // CSS: the superseded time keeps 8 to 1 at its dimmer opacity, the portrait time is not dimmed
  const BLOCK = block();
  assert.match(BLOCK, /td\.td-time-sched\.is-revised \{\s*opacity: 0\.85 !important;/);
  assert.match(BLOCK, /td\.td-status \.fids-status-rev \{\s*opacity: 1 !important;/);
  // typed airline names in their own colour meet the same floor on these rows
  assert.match(CORE, /const _nameFloor = \(document\.body\.getAttribute\('data-fids-row-palette-state'\) === 'rows'\) \? FIDS_ROWPAL_INK : 4\.5;/);
  assert.match(CORE, /c !== null && c >= _nameFloor; \}\)\) _brandColor = '';/);
});

test('what may not paint a row: reds, browns, olives, wines and plums, and greys', () => {
  const L = lib();
  // deep reds pass a lightness test, so the guard judges the shade that paints, with no floor
  for (const c of ['#5d000d', '#4a0010', '#3d0a12', '#b30000', '#870013']) assert.equal(L.refusal(c), 'warm', c);
  // wine and plum are not in the red hue band, but sit within dE76 60 of a Cancelled or Diverted red
  for (const c of ['#8b1a4a', '#650054', '#a40087']) assert.equal(L.refusal(c), 'red', c);
  // ambers and golds darken into brown, yellow greens into olive
  for (const c of ['#ffb114', '#ef9600', '#fbca00', '#812a00', '#76bd21', '#97e000', '#96c262']) assert.equal(L.refusal(c), 'warm', c);
  // greys, black, silver and the grey band of Moncton read as past flights
  for (const c of ['#000000', '#333333', '#c0c0c0', '#5b5b65', '#d5d5eb', '#0b1220']) assert.equal(L.refusal(c), 'grey', c);
  // so does a muted steel blue: its lighter stripe holds C* 12, and its darker
  // one lands within dE76 6 of the slate of the past flight rows (#262D36)
  assert.equal(L.slate, '#262D36', 'the slate of the Departed, Arrived and Gate closed rows');
  assert.equal(L.minSlateDE, 6);
  for (const c of ['#3e5f7a', '#4a6a8a', '#36485d']) {
    assert.equal(L.refusal(c), 'grey', c);
    assert.ok(L.dE(L.shade(c, L.evenL - L.step), L.slate) < 6, c + ': its darker stripe sits on the slate');
  }
  // a deep true green, teal green, blue, indigo and purple may paint
  for (const c of ['#2d7e00', '#329a3d', '#004131', '#00426f', '#001338', '#3920a7', '#48117d']) assert.equal(L.refusal(c), '', c);
  // and a mid teal and a turquoise: darkened to the odd rows they fall under
  // C* 12, and stay a teal, far off the slate
  for (const c of ['#2999a3', '#40e0d0']) {
    assert.equal(L.refusal(c), '', c);
    const odd = L.shade(c, L.evenL - L.step);
    assert.ok(L.lab(odd)[3] < 12 && L.dE(odd, L.slate) >= 10, c + ': ' + odd + ' is C* ' + L.lab(odd)[3].toFixed(1) + ', dE76 ' + L.dE(odd, L.slate).toFixed(1) + ' from the slate');
  }
  // every ground that paints holds those lines, on both rows: off the reds,
  // off the warm hues, and off the slate of a past flight; the lighter one
  // keeps C* 12 too
  assert.equal(L.minC, 12, 'the grey line, C* 12');
  for (const [ap, pal] of Object.entries(BAND)) {
    const p = pal && L.plan(pal);
    if (!p || !p.rows) continue;
    for (const g of [p.odd, p.even]) {
      for (const red of L.reds) assert.ok(L.dE(g, red) >= 60, ap + ': ' + g + ' is dE76 ' + L.dE(g, red).toFixed(1) + ' from ' + red);
      assert.ok(L.dE(g, L.slate) >= 6, ap + ': ' + g + ' is dE76 ' + L.dE(g, L.slate).toFixed(1) + ' from the slate');
      const h = hue(g);
      assert.ok(h >= 95 && h < 340, ap + ': ' + g + ' is not a warm hue (' + h.toFixed(1) + ')');
    }
    assert.ok(L.lab(p.even)[3] >= 12, ap + ': ' + p.even + ' has colour (C* ' + L.lab(p.even)[3].toFixed(1) + ')');
  }
  // and on a sweep of the colour cube: wherever a colour may paint, the logo
  // colour and the lighter stripe hold C* 12, and the darker stripe stays
  // dE76 6 off the slate
  const steps = Array.from({ length: 16 }, (_, i) => i * 17);
  let swept = 0;
  for (const r of steps) for (const g of steps) for (const b of steps) {
    const c = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
    if (L.refusal(c)) continue;
    swept++;
    const even = L.shade(c, L.evenL), odd = L.shade(c, L.evenL - L.step);
    assert.ok(L.lab(c)[3] >= 12, c + ' may paint, but it is C* ' + L.lab(c)[3].toFixed(1));
    assert.ok(L.lab(even)[3] >= 12, c + ' may paint, but its lighter stripe ' + even + ' is C* ' + L.lab(even)[3].toFixed(1));
    assert.ok(L.dE(odd, L.slate) >= 6, c + ' may paint, but its darker stripe ' + odd + ' is dE76 ' + L.dE(odd, L.slate).toFixed(1) + ' from the slate');
  }
  assert.ok(swept >= 300, swept + ' colours of the sweep may paint');
  // a logo of greys only changes nothing at all
  assert.equal(L.plan(['#000000', '#333333', '#c0c0c0', '#5b5b65']), null);
});

// ═══ the review switch ══════════════════════════════════════════════════════

test('?rowpal=on and ?rowpal=off decide it for one load, for review', () => {
  const on = board({ search: '?ap=YQM&rowpal=on', store: warm('YQM', BAND.YQM), cfg: { logo: { url: LOGO } } });
  assert.equal(on.setting(undefined), true, 'on, with nothing chosen anywhere');
  assert.equal(on.attrs['data-fids-row-palette'], 'airport');
  on.paint();
  assert.equal(on.attrs['data-fids-row-palette-state'], 'rows');
  const off = board({ search: '?rowpal=OFF', store: warm('YQM', BAND.YQM), cfg: { logo: { url: LOGO } } });
  assert.equal(off.setting('airport'), false, 'off, over the airport choice');
  assert.equal(off.attrs['data-fids-row-palette'], undefined);
  for (const q of ['?rowpal=', '?rowpal=a', '?rowpal=1', '?rowpal=<b>']) {
    assert.equal(board({ search: q }).setting(''), false, q + ' is ignored');
    assert.equal(board({ search: q }).setting('airport'), true, q + ' is ignored');
  }
});
