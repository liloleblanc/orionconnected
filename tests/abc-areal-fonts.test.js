'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23774 — ABC AREAL, INSTALLED TO BE SEEN.
//
// The owner supplied the Dinamo download; the three families (Areal, Areal
// Semi Mono, Areal Mono) are registered the way Ginto Nord is — a true
// family with weights, plus one named face per weight — offered in the
// Customize picker, and previewable on any screen with ?font=<key> without
// touching a saved pick. Every layer has to agree or the pick is a silent
// fallback to sans-serif.
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
const FONT_CSS = rd('fids-current/css/font.css');

const KEYS = ['abc-areal', 'abc-areal-regular', 'abc-areal-medium', 'abc-areal-bold',
  'abc-areal-semi-mono', 'abc-areal-semi-mono-bold', 'abc-areal-mono', 'abc-areal-mono-bold'];
const FAMILIES = ['ABC Areal', 'ABC Areal Semi Mono', 'ABC Areal Mono'];

test('every face font.css names is on disk, and only WOFF2 ships', () => {
  const srcs = [...FONT_CSS.matchAll(/url\('\.\.\/fonts\/abc-areal\/([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(srcs.length >= 27, `expected the Areal faces, found ${srcs.length}`);
  for (const f of new Set(srcs)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', 'fonts', 'abc-areal', f)), `${f} is declared but missing`);
    assert.match(f, /\.woff2$/, 'WOFF2 only');
  }
  const onDisk = fs.readdirSync(path.join(ROOT, 'fids-current', 'fonts', 'abc-areal'));
  assert.ok(onDisk.every((f) => f.endsWith('.woff2')), 'no TTF/OTF in the tree');
  assert.ok(!fs.existsSync(path.join(ROOT, 'fids-current', 'fonts', 'abc-areal', 'Dinamo Licensing Terms.pdf')), 'the licence pdf is not published');
});

test('each family is a real family with weights AND a named face per weight, like Ginto', () => {
  for (const fam of FAMILIES) {
    for (const w of [400, 500, 700]) {
      assert.match(FONT_CSS, new RegExp(`font-family:'${fam}'; font-weight:${w}; font-style:normal;`), `${fam} ${w}`);
      assert.match(FONT_CSS, new RegExp(`font-family:'${fam}'; font-weight:${w}; font-style:italic;`), `${fam} ${w} italic`);
    }
    for (const suf of ['Regular', 'Medium', 'Bold']) {
      assert.match(FONT_CSS, new RegExp(`font-family:'${fam} ${suf}'; font-weight:1 1000;`), `${fam} ${suf} pinned face`);
    }
  }
});

test('the three stack tables and the Customize picker all carry the same keys', () => {
  // fids-core.js holds the table twice (the control bar and the Customize
  // apply path), menu.js once; a key missing from any one of them is a
  // pick that renders in sans-serif on that path.
  for (const k of KEYS) {
    assert.equal((CORE.match(new RegExp(`^\\s*'${k}':\\s*"`, 'gm')) || []).length, 2, `${k} in both fids-core tables`);
    assert.equal((MENU.match(new RegExp(`^\\s*'${k}':\\s*"`, 'gm')) || []).length, 1, `${k} in menu.js`);
    assert.match(MENU_HTML, new RegExp(`<option value="${k}">`), `${k} offered in the Customize picker`);
  }
  // and every stack names a family font.css declares
  const stacks = [...CORE.matchAll(/^\s*'abc-areal[^']*':\s*"'([^']+)'/gm)].map((m) => m[1]);
  for (const fam of new Set(stacks)) assert.match(FONT_CSS, new RegExp(`font-family:'${fam}';`), `${fam} must be declared`);
});

test('?font=<key> previews a stack for this load only and never writes a pick', () => {
  const at = CORE.indexOf('function restoreFontChoice(');
  const body = CORE.slice(at, CORE.indexOf('\nfunction ', at + 10));
  assert.match(body, /new URLSearchParams\(location\.search\)\.get\('font'\)/, 'reads ?font=');
  assert.match(body, /if \(_urlFont && !FIDS_FONT_STACKS\[_urlFont\]\) _urlFont = '';/, 'unknown keys are ignored');
  assert.match(body, /if \(_urlFont\) \{\s*_stack = FIDS_FONT_STACKS\[_urlFont\];\s*\} else if \(_cfg && _cfg\.font\)/, 'the URL outranks the saved pick');
  assert.doesNotMatch(body, /localStorage\.setItem\([^)]*_urlFont/, 'and is never saved');
  assert.match(body, /if \(_iata \|\| _urlFont\) \{/, 'works on a screen with no airport yet');
});

test('the busters moved with the stylesheet, and the three shells agree', () => {
  // Never pinned to a literal: the next font bump would turn this red for
  // no reason. What matters is that all three shells ask for the same
  // font.css, and that it is past the version this landed on.
  const v = [];
  for (const sh of ['fids', 'gids', 'bids']) {
    const m = /css\/font\.css\?v=(\d+)/.exec(rd(`fids-current/${sh}.html`));
    assert.ok(m, `${sh}.html must load font.css with a cache token`);
    v.push(Number(m[1]));
  }
  assert.equal(new Set(v).size, 1, `the three shells disagree on font.css: ${v.join(', ')}`);
  assert.ok(v[0] >= 329, `font.css token went backwards (${v[0]})`);
});

test('the airport-config pass honours ?font= too, or it would put the airport font back', () => {
  const at = CORE.indexOf("const _font = _urlFontKey || _pref('font');");
  assert.ok(at >= 0, 'the airport pass reads the URL key first');
  const before = CORE.slice(at - 600, at);
  assert.match(before, /new URLSearchParams\(location\.search\)\.get\('font'\)/);
  assert.match(before, /if \(_urlFontKey && !\(typeof FIDS_FONT_STACKS !== 'undefined' && FIDS_FONT_STACKS\[_urlFontKey\]\)\) _urlFontKey = '';/, 'unknown keys ignored here as well');
});
