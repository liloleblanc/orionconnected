'use strict';

// v24040 — the departures ticker scrolls as ONE strip. Its language halves are
// <span class="tk-h"> inside the scrolling span (v23995), and `.ticker span`
// gave each of them its own 240 s scroll, so the halves drifted away from the
// separators: "…AT ALL TIMESVEUILLEZ…", stray "·", stretches of nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'fids-current/css/fids.css'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');

test('the ticker line wraps each language in its own span (why the rule is needed)', () => {
  assert.match(core, /BoardStrings\.half\(pair\[0\], esc\(line\(pair\[0\], a, i\)\), 'tk-h'\)/);
  assert.match(core, /ticker\.innerHTML = _tickerHtml\('ticker', '✈', '  ·  '\)/);
});

test('only the outer span scrolls; the halves inside it ride along', () => {
  assert.match(css, /\.ticker span \{[^}]*animation: scroll 240s linear infinite;/);
  const at = css.indexOf('.ticker span span {');
  assert.ok(at > css.indexOf('.ticker span {'), 'the inner rule comes after the outer one');
  const rule = css.slice(at, css.indexOf('}', at));
  assert.match(rule, /display: inline;/);
  assert.match(rule, /animation: none !important;/);
  assert.match(rule, /transform: none !important;/);
});
