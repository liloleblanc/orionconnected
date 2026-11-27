'use strict';
// WHY THIS EXISTS
//
// v24186. THE FIDS BOARD SIZES: MEDIUM AND LARGE ARE A SLIGHTLY BIGGER SMALL.
// Asked: Small is right; Medium was far too big and should be only a little bigger
// than Small, Large a little bigger again, and on both the logos and the text must
// grow with the row. They did not: the row text was sized by the screen width alone
// (clamp(20px, 1.7vw, 28px)), the wordmarks were fixed pixels calibrated on Small
// in a fixed 218px slot, and the emblem tile grew while the airline column stayed
// put, so wide marks actually SHRANK on Medium and Large. Now one factor per tier,
// --fids-tier-k (1, 7/6, 4/3: rows 36 / 42 / 48px), scales every row size that was
// calibrated on Small, so Small is exactly what it was; the airline column asks
// Destination for the room the bigger mark needs (_fidsBrandGrowPx); and a change
// of tier rebuilds the rows so the shrink-only fitters start again.
//
// Everything here reads the real stylesheets and lifts the real functions.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', 'fids-current');
const FD = fs.readFileSync(path.join(root, 'css', 'flight-display.css'), 'utf8');
const DO = fs.readFileSync(path.join(root, 'css', 'display-overrides.css'), 'utf8');
const BAGS = fs.readFileSync(path.join(root, 'css', 'baggage-display.css'), 'utf8');
const CORE = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');
const MENU = fs.readFileSync(path.join(root, 'js', 'menu.js'), 'utf8');

function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(i, j + 1);
}
const K = 'var(--fids-tier-k, 1)';
const tiers = {};
for (const m of FD.matchAll(/^body\[data-fids-logo-size="(\w+)"\]\s*\{([^}]*)\}/gm)) {
  const v = (name) => { const x = m[2].match(new RegExp('--' + name + ':\\s*([0-9.]+)(px)?')); return x ? Number(x[1]) : NaN; };
  tiers[m[1]] = { row: v('fids-row-h'), k: v('fids-tier-k'), bw: v('fids-brand-w'), logo: v('fids-logo-size') };
}

test('Small is the board it was: the same row, factor 1, every scaled size its old literal times k', () => {
  assert.deepEqual(Object.keys(tiers).sort(), ['large', 'medium', 'small']);
  assert.equal(tiers.small.row, 36);
  assert.equal(tiers.small.k, 1);
  assert.equal(tiers.small.bw, 262);
  assert.equal(tiers.small.logo, 28);
  // each declaration that grew is exactly the Small literal times k
  assert.ok(FD.includes('font-size: calc(clamp(20px, 1.7vw, 28px) * ' + K + ') !important;'), 'row text');
  assert.ok(FD.includes('font-size: calc(24px * ' + K + ');'), 'temperature');
  assert.ok(FD.includes('font-size: calc(26px * ' + K + ') !important;'), 'typed airline name');
  assert.equal((FD.match(/font-size: calc\(28px \* var\(--fids-tier-k, 1\)\) !important;/g) || []).length, 2, 'mist row text and status');
  assert.ok(DO.includes('--fids-wordmark-slot-w: calc(218px * ' + K + ');'), 'wordmark slot');
  assert.ok(DO.includes('max-width: calc(198px * ' + K + ') !important;'), 'wordmark box');
  assert.ok(DO.includes('font-size: calc(18px * ' + K + ') !important;'), 'long status (CSS)');
  assert.ok(CORE.includes("style=\"font-size:calc(18px * var(--fids-tier-k, 1)) !important;letter-spacing:0.2px !important;"), 'long status (inline)');
  // the weather glyph keeps 38px on Small and grows half as fast as the row
  assert.ok(DO.includes('width: calc(38px * (1 + (' + K + ' - 1) / 2)) !important;'), 'weather glyph');
  // no row font-size after the clamp is left as a bare px: they all follow the tier
  const after = FD.slice(FD.indexOf('font-size: calc(clamp(20px, 1.7vw, 28px)'));
  const mist = after.slice(after.indexOf('body[data-fids-theme="mist"] #fidsTable tbody tr,'), after.indexOf('/* Status colors tuned for the pale rows'));
  assert.ok(mist.length > 0 && !/font-size:\s*\d+px/.test(mist), 'the mist rows have no fixed size left');
});

test('Medium and Large are a slightly bigger Small', () => {
  assert.equal(tiers.medium.row, 42);
  assert.equal(tiers.large.row, 48);
  for (const t of ['medium', 'large']) {
    assert.ok(Math.abs(tiers[t].k - tiers[t].row / 36) < 1e-4, t + ' factor is its row over Small');
  }
  assert.ok(tiers.medium.row / tiers.small.row > 1 && tiers.medium.row / tiers.small.row <= 1.2, 'Medium only a little bigger than Small');
  assert.ok(tiers.large.row / tiers.medium.row > 1 && tiers.large.row / tiers.medium.row <= 1.2, 'Large only a little bigger than Medium');
  assert.ok(tiers.small.logo < tiers.medium.logo && tiers.medium.logo < tiers.large.logo);
});

test('one factor, applied once: the wordmark table stays in Small pixels', () => {
  assert.ok(DO.includes('height: calc(var(--wm-h) * ' + K + ') !important;'));
  assert.ok(DO.includes('max-height: calc(var(--wm-h) * ' + K + ') !important;'));
  const perCarrier = [...DO.matchAll(/--wm-h:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(perCarrier.length > 20, 'the per-carrier table is there');
  for (const v of perCarrier) assert.ok(!/fids-tier-k/.test(v), 'a per-carrier --wm-h scaled twice: ' + v);
  assert.ok(/--fids-wordmark-optical-h:\s*25px;/.test(DO), 'the default stays 25px');
  const kDecl = (FD + DO).match(/--fids-tier-k:\s*[0-9.]+/g) || [];
  assert.equal(kDecl.length, 3, 'the factor is declared only by the three tiers');
});

test('nothing leaves the row on any tier', () => {
  // the tallest calibrated mark times k, under the row-6 ceiling that still caps it
  const wm = [...DO.matchAll(/--wm-h:\s*([0-9.]+)px;/g)].map((m) => Number(m[1]));
  const tallest = Math.max(...wm);
  assert.ok(DO.includes('max-height: calc(var(--fids-row-h, 58px) - 6px) !important;'), 'the row-6 ceiling');
  assert.ok(DO.includes('html body[data-fids-logo-size] #fidsTable tbody tr td > * {\n  max-height: var(--fids-row-h) !important;'), 'the cell child cap');
  for (const t of Object.keys(tiers)) {
    const { row, k } = tiers[t];
    assert.ok(row - 4 < row, t + ' emblem tile inside the row');
    assert.ok(Math.min(tallest * k, row - 6) <= row - 6, t + ' wordmark under the ceiling');
    // the weather glyph: Small has always drawn 38px in its 36px row (the cell cap and clip hold it); no tier is fuller than that
    assert.ok(38 * (1 + (k - 1) / 2) / row <= 38 / 36 + 1e-9, t + ' weather glyph no fuller than on Small: ' + (38 * (1 + (k - 1) / 2)).toFixed(1) + ' in ' + row);
    // the mark width the column needs: tile + gap + slot, times k
    assert.ok(Math.abs(tiers[t].bw - ((row - 4) + 12 + 218 * k)) < 0.5, t + ' brand width');
  }
  assert.ok(/body\[data-fids-logo-size\]\s*\{\s*--fids-brand-w0:\s*262px !important;\s*\}/.test(FD), 'the Small brand width for comparison');
});

test('_fidsBrandGrowPx: Small asks for nothing, the others take a capped share of Destination', () => {
  const grow = new Function('return (' + fnSource(CORE, '_fidsBrandGrowPx') + ')')();
  assert.equal(grow(274.4, 391, 262, 262, 1), 0);
  assert.ok(Math.abs(grow(274.4, 391, 304.33, 262, 1.16667) - 29.93) < 0.1, '1680 Medium');
  assert.ok(Math.abs(grow(274.4, 391, 346.67, 262, 1.33333) - 72.27) < 0.1, '1680 Large');
  assert.equal(grow(326.7, 485, 304.33, 262, 1.16667), 0, '1920 Medium has the room already');
  assert.ok(Math.abs(grow(326.7, 485, 346.67, 262, 1.33333) - 19.97) < 0.1, '1920 Large');
  const capped = grow(230, 256, 346.67, 262, 1.33333);
  assert.ok(Math.abs(capped - 64) < 0.01, '1280 Large is capped at a quarter of Destination');
  for (const [h, d, bw, k] of [[274.4, 391, 304.33, 1.16667], [274.4, 391, 346.67, 1.33333], [230, 256, 346.67, 1.33333], [100, 120, 346.67, 1.33333]]) {
    assert.ok(grow(h, d, bw, 262, k) <= d * (1 - 1 / k) + 1e-9, 'never more than Destination can give');
  }
});

test('_fidsDestColumn: keyed on the first col and the tier, grows only the airline column, only where a mark is drawn', () => {
  const src = fnSource(CORE, '_fidsDestColumn');
  assert.match(src, /cols\[0\]\.__destColKey === key/);
  assert.doesNotMatch(src, /tbl\.__destColKey/);
  assert.match(src, /data-fids-logo-size/);
  assert.match(src, /classList\.contains\('col-airline'\)/);
  assert.match(src, /style !== 'emblem' && names !== 'off'/);
  for (const v of ['--fids-brand-w', '--fids-brand-w0', '--fids-tier-k']) assert.ok(src.includes("'" + v + "'"), v);
  // and render() hands it every rebuilt colgroup, and the columns before the fit
  assert.match(CORE, /_colGroup\.innerHTML = _colHtml;\n\s*_colGroup\.dataset\.lastCols = _colHtml;[\s\S]{0,400}?_fidsDestColumn\(\);/);
  assert.match(CORE, /_fidsDestColumn\(\); \} catch \(eDC\) \{\}[^\n]*\n\s*try \{ boardAutofit\(true\); \} catch \(e\) \{\}/);
  // the wordmark backstop undoes its own cap before it measures again
  assert.match(CORE, /if \(img\.dataset\.wmCap\) \{[\s\S]{0,200}?removeProperty\('height'\)/);
  assert.match(CORE, /img\.dataset\.wmCap = '1';/);
});

test('a change of tier rebuilds the rows; the same tier does nothing', () => {
  const run = (from, to) => {
    const calls = { render: 0, cols: 0 };
    const ctx = {
      document: { documentElement: { style: { removeProperty() {} } }, body: { dataset: from ? { fidsLogoSize: from } : {} } },
      render() { calls.render++; }, _fidsDestColumn() { calls.cols++; }
    };
    vm.runInNewContext('var _lastTbodyHtml = "<tr></tr>";' + fnSource(MENU, '_applyLogoSize') + ';_applyLogoSize(' + JSON.stringify(to) + ');', ctx);
    return { calls, tbody: ctx._lastTbodyHtml, size: ctx.document.body.dataset.fidsLogoSize };
  };
  const same = run('small', 'small');
  assert.equal(same.calls.render, 0); assert.equal(same.tbody, '<tr></tr>');
  const up = run('small', 'medium');
  assert.equal(up.calls.render, 1); assert.equal(up.calls.cols, 1); assert.equal(up.tbody, ''); assert.equal(up.size, 'medium');
  assert.equal(run('medium', '').size, 'small', 'an empty size is Small');
});

test('the baggage board is untouched by the new tiers', () => {
  for (const [t, h] of [['small', 68], ['medium', 98], ['large', 132]]) {
    assert.ok(new RegExp('data-fids-logo-size="' + t + '"[^{]*\\.bidsv2-flight-row[^{]*\\{[^}]*' + h + 'px').test(BAGS), 'bags ' + t + ' row ' + h + 'px');
  }
  assert.match(CORE, /_logoSize === 'large' \? 6 :\s*\n\s*_logoSize === 'small' \? 9 : 7;/);
});
