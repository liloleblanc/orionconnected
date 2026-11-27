'use strict';
// WHY THIS EXISTS
//
// v24186. THE YELLOW DELAYED ROW KEEPS ITS NAVY WHILE A PALETTE IS PREVIEWED.
// Reported at YUL: the yellow Delayed row showed white text. The Customize live
// preview (menu.js _cuApplyCustomColors) and the sidebar presets (menu.js
// smActivatePreset, replayed 300 ms after every load where a preset is saved)
// inject palette rules of their own. The board saved palette (fids-core.js,
// "STATE ROWS ARE EXEMPT", _nsF and _nsB) skips the status rows; these two did
// not, and their row ink outranked the Delayed colours (flight-display.css: navy
// #102437 on #EDBB00), so the status word, flight, city, gate and time went white
// on yellow in any browser where the menu had been used. The exemption sits inside
// :where(), so the preview keeps its specificity (Early stays green).
//
// Everything here is lifted from the real source and run in a vm.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', 'fids-current', 'js');
const MENU = fs.readFileSync(path.join(ROOT, 'menu.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-core.js'), 'utf8');

function fnSrc(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unterminated ' + name);
}
function splitTop(p) {
  const out = []; let d = 0, cur = '';
  for (const ch of p) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim()); return out;
}
function selectorsOf(css) {
  const out = [];
  css.replace(/([^{}]+)\{([^}]*)\}/g, (m, sel, body) => { for (const s of splitTop(sel)) out.push({ s, body }); return m; });
  return out;
}
// the board own exemption (fids-core.js) and the menu one (menu.js)
const NS_F = (CORE.match(/var _nsF = '([^']+)'/) || [])[1];
const NS_B = (CORE.match(/var _nsB = '([^']+)'/) || [])[1];
const MENU_NS = (MENU.match(/var _cuNsF = '[^']+';\nvar _cuNsB = '[^']+';/) || [])[0];
const classesOf = (sel) => (String(sel).match(/:not\(\.[a-z0-9-]+\)/g) || []).sort().join('');

test('the menu exempts exactly the status rows the board exempts, inside :where()', () => {
  assert.ok(NS_F && NS_F.includes(':not(.row-delayed)'), 'fids-core _nsF');
  assert.ok(NS_B && NS_B.includes(':not(.bidsv2-row-delayed)'), 'fids-core _nsB');
  assert.ok(MENU_NS, 'menu.js declares _cuNsF and _cuNsB together');
  const f = MENU_NS.match(/var _cuNsF = '([^']+)'/)[1], b = MENU_NS.match(/var _cuNsB = '([^']+)'/)[1];
  assert.match(f, /^:where\(.*\)$/); assert.match(b, /^:where\(.*\)$/);
  assert.equal(classesOf(f), classesOf(NS_F), 'the same table-row classes as fids-core');
  assert.equal(classesOf(b), classesOf(NS_B), 'the same bags-row classes as fids-core');
});

function runLivePreview() {
  const appended = [];
  const ctx = {
    window: { _fidsInk: (fg) => fg, _fidsContrast: () => 7 },
    document: {
      body: { dataset: {}, style: { setProperty() {} } },
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '' }),
      head: { appendChild: (el) => appended.push(el.textContent) }
    },
    _cuContrastAudit() {}
  };
  vm.runInNewContext(MENU_NS + fnSrc(MENU, '_cuInk') + fnSrc(MENU, '_cuGreen') + fnSrc(MENU, '_cuApplyCustomColors')
    + ';_cuApplyCustomColors({accent:"#eab308",hdr:"#27272a",hdrText:"#ffffff",bg:"#0c1a2e",rowOdd:"#13263f",rowEven:"#1a3150",text:"#ffffff"});', ctx);
  return appended.join('\n');
}

test('the Customize live preview never inks a board row that carries a status', () => {
  const css = runLivePreview();
  const rowRules = selectorsOf(css).filter((r) => /#fidsTable\s+tbody\s+tr/.test(r.s) && /(^|;)\s*(color|background(-color)?)\s*:/.test(r.body));
  assert.ok(rowRules.length >= 4, 'the preview still paints the rows: ' + rowRules.length);
  for (const r of rowRules) {
    assert.ok(r.s.includes(':where(:not(.row-delayed)'), 'a palette row rule that can reach the yellow Delayed row: ' + r.s);
  }
  const beltRules = selectorsOf(css).filter((r) => /\.bidsv2-flight-row/.test(r.s));
  assert.ok(beltRules.length > 0);
  for (const r of beltRules) assert.ok(r.s.includes(':where(:not(.bidsv2-row-delayed)'), 'bags row rule without the exemption: ' + r.s);
});

function runSidebarPreset() {
  const appended = [];
  const ctx = {
    URLSearchParams, window: { location: { search: '' } },
    document: {
      body: { dataset: {}, style: { setProperty() {}, removeProperty() {} } },
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '' }),
      head: { appendChild: (el) => appended.push(el.textContent) }
    },
    _getPresets: () => [{ id: 'yulnight', name: 'YUL night', accent: '#eab308', hdr: '#27272a', hdrText: '#ffffff',
                          bg: '#0c1a2e', rowOdd: '#13263f', rowEven: '#1a3150', text: '#ffffff' }],
    _setActivePresetId() {}, smRenderPresets() {},
    _hexToRgba: (h, a) => 'rgba(255,255,255,' + a + ')', _isLightColor: () => false, _lighten: (h) => h
  };
  vm.runInNewContext(MENU_NS + fnSrc(MENU, 'smActivatePreset') + ';smActivatePreset("yulnight", true);', ctx);
  return appended.join('\n');
}

test('a replayed sidebar preset never inks a board row that carries a status', () => {
  const css = runSidebarPreset();
  const rowRules = selectorsOf(css).filter((r) => /#fidsTable/.test(r.s)
    && /tbody tr|\.td-(date|time|dest|flight)/.test(r.s) && /(^|;)\s*(color|background(-color)?)\s*:/.test(r.body));
  assert.ok(rowRules.length > 0, 'the preset still paints the board rows');
  for (const r of rowRules) {
    assert.ok(r.s.includes(':where(:not(.row-delayed)'), 'a preset rule that can reach the yellow Delayed row: ' + r.s);
  }
});
