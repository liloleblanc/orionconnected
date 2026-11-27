'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// ROWS IN THE AIRPORT LOGO COLOURS (Customize → Display Options → Row colours)
//
// An airport choice, off by default. With it on, the plain rows of the
// departures and arrivals table take the colour the banner reads out of the
// airport logo: one band colour, moved along its own hue to two fixed depths
// (L* 23.7 for the even rows, 9 L* below for the odd ones), with the column
// titles in that colour at full strength. Every word on those rows reads at
// 7 to 1. A band colour that would read as a status never paints a row: a red
// reads as Cancelled, an orange or amber darkens into brown, a yellow green
// into olive, a wine or plum sits too close to the Cancelled and Diverted
// reds, and a grey reads as a past flight. When nothing may paint, the rows
// keep the theme and only the column titles take the logo colour; a logo with
// no palette at all changes nothing.
//
// The functions run here are lifted out of fids-core.js and menu.js as they
// are written; only the page around them (body, storage, the logo reader) is
// a stand-in. The rules are read out of display-overrides.css.
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
  v('FIDS_ROWPAL_MIN_C'), v('FIDS_ROWPAL_MIN_RED_DE'), v('FIDS_ROWPAL_INK'), v('FIDS_ROWPAL_REDS'),
  fn('_fidsRowPalLab'), fn('_fidsRowPalShade'), fn('_fidsRowPalRefusal'), fn('_fidsRowPalHead'), fn('_fidsRowPalPlan')].join('\n');
const lib = () => new Function(PLANNER() + '\nreturn { plan: _fidsRowPalPlan, refusal: _fidsRowPalRefusal, shade: _fidsRowPalShade, reds: FIDS_ROWPAL_REDS, dE: _rc2DeltaE, lab: _fidsRowPalLab };')();

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
  assert.match(sel, /onchange="cuApplyAndSave\(\)"/);
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
  // the board reads the choice like the weather icons: the device, else the airport
  assert.match(fn('applyAirportConfigToBoard'), /try \{ _fidsRowPalSetting\(_pref\('rowPalette'\)\); \} catch \(eRp\) \{\}/);
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

test('Customize saves the choice, sends it to the airport cloud, and says when the cloud did not keep it', async () => {
  // read from the form once painted, carried forward otherwise (the weather icon pattern)
  assert.match(MENU, /if \(rp && rp\.dataset\.painted === '1'\) p\.rowPalette = rp\.value;\n\s*else \{ var _pv5 = _cuLoad\(\); if \(_pv5 && _pv5\.rowPalette !== undefined\) p\.rowPalette = _pv5\.rowPalette; \}/);
  // painted as the board reads it: this device, else the airport
  const paint = fn('_cuPaintForm', MENU);
  assert.match(paint, /var _rpv = prefs\.rowPalette;/);
  assert.match(paint, /_rpv = \(_rpCfg && _rpCfg\.rowPalette\) \|\| '';/);
  assert.match(paint, /rp\.dataset\.painted = '1';/);
  // the worker keeps it, and only a value the boards know
  assert.match(PROXY, /\n\s*"rowPalette",/);
  assert.match(PROXY, /if \(cfg\.rowPalette !== undefined && !\["", "airport"\]\.includes\(cfg\.rowPalette\)\) delete cfg\.rowPalette;/);
  // a newer cloud save sheds the copy of a device
  assert.match(CORE, /_cloudOwned\.push\('rowPalette'\);/);

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
    let sent = null;
    const fetch = (url, opts) => {
      sent = JSON.parse(opts.body);
      const cfg = Object.assign({}, sent);
      if (allowed && cfg.rowPalette !== undefined && !allowed.includes(cfg.rowPalette)) delete cfg.rowPalette;
      if (!allowed) delete cfg.rowPalette;
      cfg.updatedAt = 200;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, config: cfg }) });
    };
    new Function('document', 'localStorage', '_acGetToken', '_acFetch', '_AC_WORKER_URL', 'setTimeout', 'clearTimeout', 'console',
      MENU.slice(at, MENU.indexOf('\n}\n', at) + 3) + MENU.slice(MENU.indexOf('var _cuCloudTimer = null;'), end) + '\n_cuCloudPush("YQM", ' + JSON.stringify(prefs) + ');')(
      doc, ls, () => 'token', fetch, '', (f) => { f(); return 1; }, () => {}, { log() {}, warn() {} });
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    return { sent, note: note.textContent, savedAt: JSON.parse(store.fids_customize_YQM).savedAt, sel: sel.value };
  }
  const NEW_WORKER = JSON.parse(/!(\[[^\]]+\])\.includes\(cfg\.rowPalette\)/.exec(PROXY)[1]);
  let r = await push({ rowPalette: 'airport', font: 'bricolage' }, NEW_WORKER);
  assert.equal(r.sent.rowPalette, 'airport', 'the choice travels to the airport config');
  assert.match(r.note, /^✓ Saved to the airport cloud/);
  assert.equal(r.savedAt, 200, 'the stamp of this device is aligned with the cloud');
  r = await push({ rowPalette: '' }, NEW_WORKER);
  assert.equal(r.sent.rowPalette, '', 'turning it off reaches the airport too');
  r = await push({ rowPalette: 'airport' }, null);
  assert.match(r.note, /^⚠ Saved to the airport cloud, except the row colours/, 'a worker without the field: not "Saved"');
  assert.equal(r.savedAt, 100, 'the newer cloud copy wins on the next read');
  assert.equal(r.sel, '', 'the select goes back to the default entry');
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
  // a deep true green, teal green, blue, indigo and purple may paint
  for (const c of ['#2d7e00', '#329a3d', '#004131', '#00426f', '#001338', '#3920a7', '#48117d']) assert.equal(L.refusal(c), '', c);
  // every ground that paints holds those lines, on both rows
  for (const [ap, pal] of Object.entries(BAND)) {
    const p = pal && L.plan(pal);
    if (!p || !p.rows) continue;
    for (const g of [p.odd, p.even]) {
      for (const red of L.reds) assert.ok(L.dE(g, red) >= 60, ap + ': ' + g + ' is dE76 ' + L.dE(g, red).toFixed(1) + ' from ' + red);
      assert.ok(L.lab(g)[3] >= 8, ap + ': ' + g + ' has colour (C* ' + L.lab(g)[3].toFixed(1) + ')');
      const h = hue(g);
      assert.ok(h >= 95 && h < 340, ap + ': ' + g + ' is not a warm hue (' + h.toFixed(1) + ')');
    }
  }
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
