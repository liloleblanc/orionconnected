'use strict';

// v24089 — A <style> inside an inline SVG is the whole page's.
//
// The white hotel logos carry <style>*{fill:#FFFFFF;stroke:none}</style>.
// _applyLockup inlines them (to colour them), and while one was on screen the
// rule painted every SVG on the board: the gate map's route line became a
// solid white shape with no blue stroke, the "white wedge" fanning out from
// the aeroplane that came and went with the hotel ads (Moncton gate 4,
// 2026-10-26, traced to the one matching rule: inline <style> "*").

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'fids-current');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'fids-core.js'), 'utf8');
function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) return CORE.slice(at, i + 1);
  }
  throw new Error('no end for ' + name);
}
const scope = new Function(fnSource('_scopeSvgStyles') + '\nreturn _scopeSvgStyles;')();

test('the white hotel logos\' "*" rule stays inside the logo', () => {
  const src = fs.readFileSync(path.join(ROOT, 'logos', 'hotels', 'accor-luxury', 'fairmont-monochrome-white.svg'), 'utf8');
  assert.match(src, /<style>\*\{fill:#FFFFFF;stroke:none\}<\/style>/, 'the file still carries the global rule');
  const out = scope(src, 'lk7');
  assert.match(out, /^<svg data-lk="lk7"/);
  assert.match(out, /<style>\[data-lk="lk7"\] \*\{fill:#FFFFFF;stroke:none\}<\/style>/);
  assert.doesNotMatch(out, /<style>\*\{/);
});

test('every selector of an exported stylesheet is scoped; CDATA, comments and at-rules dropped', () => {
  const svg = '<svg viewBox="0 0 10 10"><defs><style><![CDATA[ /* AI export */ .cls-1, .cls-2{fill:#c8102e} .cls-3{fill:none;stroke:#fff} svg{overflow:visible} @media print{.cls-1{fill:#000}} ]]></style></defs><path class="cls-1" d="M0 0"/></svg>';
  const out = scope(svg, 'lk2');
  const css = out.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.equal(css, '[data-lk="lk2"] .cls-1,[data-lk="lk2"] .cls-2{fill:#c8102e}[data-lk="lk2"] .cls-3{fill:none;stroke:#fff}[data-lk="lk2"]{overflow:visible}[data-lk="lk2"] .cls-1{fill:#000}');
  // (the @media wrapper is dropped; its inner rule is kept, scoped)
  assert.doesNotMatch(css, /CDATA|AI export|@media/);
});

test('a logo with no <style> is untouched, and the inliner scopes before it caches', () => {
  const plain = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
  assert.equal(scope(plain, 'lk1'), plain);
  assert.match(CORE, /svg = _scopeSvgStyles\(svg, 'lk' \+ \(\+\+_lockupSeq\)\);\s*_lockupCache\[key\] = svg;/);
});

test('a leading svg or :root is the logo itself, not a descendant (Fairmont Savoy\'s "svg path, svg polygon")', () => {
  const out = scope('<svg viewBox="0 0 1 1"><style>svg path, svg polygon{fill:#FFFFFF;} :root{color:red} svg>rect{fill:none}</style></svg>', 'lk3');
  const css = out.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.equal(css, '[data-lk="lk3"] path,[data-lk="lk3"] polygon{fill:#FFFFFF;}[data-lk="lk3"]{color:red}[data-lk="lk3"]>rect{fill:none}');
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : (d.name.endsWith('.svg') ? [path.join(dir, d.name)] : []));
}

test('every rule of every hotel logo\'s <style> comes out scoped to that logo', () => {
  const files = walk(path.join(ROOT, 'logos', 'hotels'));
  let styled = 0, rules = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (!/<style[\s>]/i.test(src)) continue;
    styled++;
    const out = scope(src, 'lkT');
    for (const m of out.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      for (const r of m[1].matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const sel of r[1].split(',')) {
          rules++;
          assert.ok(sel.trim().startsWith('[data-lk="lkT"]'), path.relative(ROOT, f) + ': "' + sel.trim() + '" is not scoped');
        }
      }
    }
  }
  assert.ok(styled >= 60, styled + ' hotel logos carry a <style>');
  assert.ok(rules > 100, rules + ' selectors checked');
});

test('both places that put SVG text into the page scope it first', () => {
  assert.match(CORE, /svg = _scopeSvgStyles\(svg, 'lk' \+ \(\+\+_lockupSeq\)\);\s*_lockupCache\[key\] = svg;/, 'the logo inliner (_cropLockup)');
  assert.match(CORE, /span\.innerHTML = _scopeSvgStyles\(txt, 'lw' \+ uid\);/, 'the weather inliner (_wxHydrateSvgs)');
  assert.equal((CORE.match(/^function _scopeSvgStyles\(/m) || []).length, 1, 'at file scope, so both reach it');
});
