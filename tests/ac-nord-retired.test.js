'use strict';

// v23950 — AC NORD IS RETIRED AS A BOARD FACE.
//
// AC Nord is Accor's brand typeface. It was the face of every board until the
// default moved to Bricolage Grotesque (v23870-72). On 2026-10-04, 36 of the
// 62 roster airports still had an ac-nord-* key saved in their airport
// config, so their live boards (and the touring stream, which now
// shows the same font as the live board) were still in AC Nord. The weather
// card's temperatures and kicker, the gate orb's airport code and the boot
// loader named AC Nord literally, whatever the board was set in.
//
// Every ac-nord* key now resolves to the board default in the one function
// both font paths call; the literal uses read the board's own face; the
// picker no longer offers AC Nord and shows Default for an airport still
// saved on one. Accor's own ads keep their brand face.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', 'fids-current');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CSS_DIR = path.join(ROOT, 'css');
const CSS_FILES = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
const CORE = read('js/fids-core.js');
const MENU_JS = read('js/menu.js');
const MENU_HTML = read('menu.html');

// A plain scan rather than a regex: display-overrides.css is ~3 MB, and a
// lazy /\*[\s\S]*?\*\// over it exhausts V8's regexp backtracking stack.
function stripComments(css) {
  let out = '';
  let i = 0;
  for (;;) {
    const open = css.indexOf('/*', i);
    if (open < 0) return out + css.slice(i);
    out += css.slice(i, open);
    const close = css.indexOf('*/', open + 2);
    if (close < 0) return out;
    i = close + 2;
  }
}
// Innermost `selector { declarations }` pairs — @media wrappers fall away
// because their bodies contain braces and the pattern never spans one.
function rules(css) {
  const out = [];
  const src = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}
test('no board stylesheet names AC Nord as a font family', () => {
  const offenders = [];
  for (const f of CSS_FILES) {
    if (f === 'font.css' || f === 'hotel-ads.css') continue;   // the @font-face file; Accor's own ads
    for (const r of rules(read('css/' + f))) {
      const fam = r.body.match(/font-family\s*:\s*([^;]+)/);
      if (fam && /AC Nord/i.test(fam[1])) offenders.push('css/' + f + ': ' + r.sel.slice(-60));
    }
  }
  assert.deepEqual(offenders, [],
    'AC Nord is retired as a board face; a literal family ignores the airport\'s font on the wall and the stream alike');
});

test('the weather card and the gate orb code set in the board\'s own face', () => {
  const css = stripComments(read('css/display-overrides.css'));
  for (const cls of ['.wxc-ht', '.wxc-lo', '.wxc-kicker', '.v2-fi-orbcode']) {
    const hits = rules(css).filter((r) => r.sel.includes(cls) && /font-family\s*:/.test(r.body));
    assert.ok(hits.length > 0, cls + ' must still have a font-family rule');
    for (const r of hits) {
      assert.match(r.body, /font-family\s*:\s*var\(--font-primary/,
        cls + ' must read --font-primary, the variable the airport\'s font is written to');
    }
  }
});

// ── the retired keys ──────────────────────────────────────────────────────
function lift(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist in fids-core.js');
  const end = CORE.indexOf('\n}', at) + 2;
  return new Function('return (' + CORE.slice(at, end) + ');')();
}
const fidsLiveFontKey = lift('fidsLiveFontKey');

test('every AC Nord key an airport can hold resolves to the board default', () => {
  // The keys the Customize picker used to offer — every one of them may still
  // be saved in some airport's config.
  const keys = ['ac-nord-display', 'ac-nord-text',
    'ac-nord-display-regular', 'ac-nord-display-medium', 'ac-nord-display-bold', 'ac-nord-display-heavy',
    'ac-nord-text-light', 'ac-nord-text-regular', 'ac-nord-text-italic', 'ac-nord-text-medium',
    'ac-nord-text-bold', 'ac-nord-text-heavy', 'AC-NORD-DISPLAY-BOLD'];
  for (const k of keys) assert.equal(fidsLiveFontKey(k), 'bricolage', k);
  // …and nothing else is touched.
  for (const k of ['bricolage', 'cabinet-extrabold', 'possibility', 'custom:My Font', 'ginto-nord-medium']) {
    assert.equal(fidsLiveFontKey(k), k, k + ' is a live pick and must pass through unchanged');
  }
  assert.equal(fidsLiveFontKey(''), '');
  assert.equal(fidsLiveFontKey(undefined), undefined);
});

test('both font paths resolve the saved key through the same function', () => {
  const restore = CORE.slice(CORE.indexOf('function restoreFontChoice('), CORE.indexOf('function stopAirlineBgRotation'));
  assert.match(restore, /fidsLiveFontKey\(_cfg\.font\)/,
    'restoreFontChoice — the path every board runs at load');
  const pass = CORE.slice(CORE.indexOf("// ── FONT (v218.6+) ──"), CORE.indexOf('// ── DISPLAY MODE OVERRIDE'));
  assert.ok(pass.length > 0, 'the airport-config font pass must be readable');
  assert.match(pass, /const _fontKey = \(typeof fidsLiveFontKey === 'function'\) \? fidsLiveFontKey\(_font\) : _font;/,
    'the airport config pass — the path that applies the cloud-saved font');
  assert.match(pass, /_fontStacks\[_fontKey\]/, 'and it looks the RESOLVED key up, not the saved one');
  assert.match(MENU_JS, /fontKey = fidsLiveFontKey\(fontKey\)/,
    'and the Customize preview, so the panel shows what the board will show');
});

test('no font table can still hand out an AC Nord stack', () => {
  const tableKeys = (src, from) => {
    const at = src.indexOf(from);
    assert.ok(at >= 0, 'table not found: ' + from);
    const end = src.indexOf('};', at);
    return [...src.slice(at, end).matchAll(/^\s*'([a-z0-9:-]+)'\s*:/gim)].map((m) => m[1]);
  };
  const tables = {
    FIDS_FONT_STACKS: tableKeys(CORE, 'var FIDS_FONT_STACKS = {'),
    _fontStacks: tableKeys(CORE, 'var _fontStacks = {'),
    'menu.js stacks': tableKeys(MENU_JS, 'var stacks = {'),
  };
  for (const [name, keys] of Object.entries(tables)) {
    assert.ok(keys.includes('bricolage'), name + ' must carry the default the retired keys resolve to');
    assert.deepEqual(keys.filter((k) => /^ac-nord/.test(k)), [], name + ' must not carry an ac-nord stack');
  }
});

test('the Customize picker no longer offers AC Nord', () => {
  const at = MENU_HTML.indexOf('id="cuFontSelect"');
  const sel = MENU_HTML.slice(at, MENU_HTML.indexOf('</select>', at));
  assert.doesNotMatch(sel, /<option value="ac-nord/, 'AC Nord is retired as a board face');
});

test('the boot loader sets in the board default, not AC Nord', () => {
  const inlineStyles = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const loader = rules(inlineStyles(read(page))).filter((r) => r.sel.includes('#fidsLoader'));
    assert.ok(loader.length > 0, page + ' must still style its loader');
    for (const r of loader) {
      const fam = r.body.match(/font-family\s*:\s*([^;]+)/);
      if (!fam) continue;
      assert.doesNotMatch(fam[1], /AC Nord/i, page + ' ' + r.sel + ': the loader showed AC Nord on every boot');
      assert.match(fam[1], /^'Bricolage Grotesque'/, page + ' ' + r.sel + ' sets in the board default');
    }
  }
});

// ── what the Customize picker shows for an airport saved on a retired key ──
// The ac-nord-* options are gone, so painting the select with one of those
// keys used to match no option: a real <select> then has selectedIndex -1 and
// shows an empty box, and the menu bar copies that blank value. This runs the
// real _cuPaintForm against a select holding menu.html's real options.
const PAINT = (() => {
  const at = MENU_JS.indexOf('// v23950 — what the font picker shows for a saved key.');
  assert.ok(at >= 0, 'menu.js must carry _cuPickerFontKey');
  const fn = MENU_JS.indexOf('function _cuPaintForm(prefs) {', at);
  const end = MENU_JS.indexOf('\n}\n', fn) + 3;
  return MENU_JS.slice(at, end);
})();
function fontPicker() {
  const at = MENU_HTML.indexOf('id="cuFontSelect"');
  const markup = MENU_HTML.slice(at, MENU_HTML.indexOf('</select>', at));
  const values = [...markup.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  let i = 0;
  return {
    values,
    get selectedIndex() { return i; },
    get value() { return i >= 0 ? values[i] : ''; },
    set value(v) { i = values.indexOf(String(v)); },   // how a real <select> behaves
  };
}
function paint(prefs) {
  const sel = fontPicker();
  const document = { getElementById: (id) => (id === 'cuFontSelect' ? sel : null) };
  new Function('document', 'cuSetPositionUI', 'cuSetDisplayModeUI', '_cuLoadPresetIntoEditor',
    PAINT + '\n_cuPaintForm(arguments[4]);')(document, () => {}, () => {}, () => {}, prefs);
  return sel;
}

test('an airport saved on a retired AC Nord key shows Default in the picker, not an empty box', () => {
  for (const k of ['ac-nord-display-bold', 'ac-nord-text-medium', 'ac-nord-display', 'AC-NORD-TEXT-HEAVY']) {
    const sel = paint({ font: k });
    assert.equal(sel.selectedIndex, 0, k + ' must select the Default option');
    assert.equal(sel.value, '', k);
  }
});

test('every other saved font still paints as itself', () => {
  for (const k of ['bricolage', 'cabinet-extrabold', 'possibility', 'tr-tahoma']) {
    const sel = paint({ font: k });
    assert.ok(sel.values.includes(k), k + ' must be a picker option');
    assert.equal(sel.value, k);
  }
  assert.equal(paint({}).value, '', 'nothing saved paints as Default');
});
