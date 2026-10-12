'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24040 — EVERY SCRIPT THE SITE SERVES MUST PARSE.
//
// v24038 put a quoted font name inside a single-quoted string in menu.js
// (`'…var(--font-body, 'Bricolage Grotesque', …)…'`). One stray quote is a
// SyntaxError, a SyntaxError means the whole file never runs, and menu.js is
// the console: the board's Menu group (Customize, the operator tools) simply
// vanished while every test that reads menu.js as TEXT kept passing. This
// compiles each script without running it, so a file that cannot load can
// never ship again.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return [p];
  });
}

const SCRIPTS = walk(path.join(ROOT, 'fids-current')).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'));

test('every script the site serves compiles', () => {
  assert.ok(SCRIPTS.length > 20, 'found the site scripts');
  const broken = [];
  for (const f of SCRIPTS) {
    const src = fs.readFileSync(f, 'utf8');
    // an ES module cannot compile as a classic script; none is served today
    if (/^\s*(import|export)\s/m.test(src)) { broken.push(path.relative(ROOT, f) + ': is a module; check it as one'); continue; }
    try {
      new vm.Script(src, { filename: path.relative(ROOT, f) });
    } catch (e) {
      broken.push(path.relative(ROOT, f) + ': ' + e.message);
    }
  }
  assert.deepEqual(broken, []);
});

test('the menu script in particular compiles (the console lives in it)', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(ROOT, 'fids-current/js/menu.js'), 'utf8')));
});
