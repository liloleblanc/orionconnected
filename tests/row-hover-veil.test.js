'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24135 — THE ROW HOVER IS A VEIL ON THE CELLS, NOT A FILTER ON THE ROW.
//
// A CSS filter on a table row gives the row its own layer, and WebKit repaints
// the whole table for such a row. On the live board in Safari that meant: move
// the mouse across the rows and every row repainted on every pixel of travel,
// rows and wordmarks blinking in and out while the board was touched. Chrome
// painted the same rule cleanly, which is why it went unseen for so long.
//
// The feedback now lives on the cells as an inset veil. These tests keep a
// filter off every rule that selects the clickable rows, in every sheet the
// board loads, and keep the veil where it is.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'fids-current', 'css');
const SHEETS = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));

/** Every rule (selector, body) in a sheet, comments stripped, @media bodies flattened. */
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ sel: m[1].replace(/\s+/g, ' ').trim(), body: m[2] });
  return out;
}

test('no stylesheet puts a filter, a transform transition on filter, or a backdrop on the clickable rows', () => {
  const offenders = [];
  for (const f of SHEETS) {
    for (const r of rules(fs.readFileSync(path.join(CSS_DIR, f), 'utf8'))) {
      if (!/fids-row-clickable/.test(r.sel)) continue;
      // the row itself, or a hover/active state of it: no filter at all
      if (/(^|[^-])filter\s*:/.test(r.body)) offenders.push(f + ' :: ' + r.sel + ' :: filter');
      if (/transition\s*:[^;]*filter/.test(r.body)) offenders.push(f + ' :: ' + r.sel + ' :: transition on filter');
      if (/will-change\s*:[^;]*filter/.test(r.body)) offenders.push(f + ' :: ' + r.sel + ' :: will-change filter');
    }
  }
  assert.deepEqual(offenders, []);
});

test('the hover and press feedback is an inset veil on the cells', () => {
  const css = fs.readFileSync(path.join(CSS_DIR, 'flight-display.css'), 'utf8');
  const R = rules(css);
  const hover = R.find((r) => r.sel === '#fidsTable tr.fids-row-clickable:hover td');
  const active = R.find((r) => r.sel === '#fidsTable tr.fids-row-clickable:active td');
  const cells = R.find((r) => r.sel === '#fidsTable tr.fids-row-clickable td');
  assert.ok(hover && active && cells, 'the three cell rules exist');
  assert.match(hover.body, /box-shadow\s*:\s*inset 0 0 0 100vmax rgba\(255, 255, 255, \.14\)/);
  assert.match(active.body, /box-shadow\s*:\s*inset 0 0 0 100vmax rgba\(0, 0, 0, \.10\)/);
  assert.match(cells.body, /transition\s*:\s*box-shadow \.12s ease/);
  const row = R.find((r) => r.sel === '#fidsTable tr.fids-row-clickable');
  assert.ok(row, 'the row rule exists');
  assert.match(row.body, /cursor\s*:\s*pointer/);
  assert.doesNotMatch(row.body, /filter/);
});

test('the touch indent and the MCO pattern lift are untouched', () => {
  const css = fs.readFileSync(path.join(CSS_DIR, 'flight-display.css'), 'utf8');
  assert.match(css, /@media \(hover: none\) \{\s*#fidsTable tr\.fids-row-clickable:active \{\s*transform: translateX\(2px\);/);
  const ov = fs.readFileSync(path.join(CSS_DIR, 'display-overrides.css'), 'utf8');
  assert.ok(ov.includes('body[data-fids-ap="MCO"]:not(#_) #fidsTable tbody tr.fids-row-clickable:hover td,'), 'the MCO hover pattern lift is still there');
  assert.ok(ov.includes('body[data-fids-ap="MCO"]:not(#_) #fidsTable tbody tr.fids-row-clickable:active td {'), 'and its press state');
});
