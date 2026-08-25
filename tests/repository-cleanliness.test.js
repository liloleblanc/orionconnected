'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const staticRoot = path.join(repoRoot, 'fids-current');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('the public directory contains no development or source-package debris', () => {
  const forbiddenDirectories = new Set([
    '__qr', 'models', 'patch-notes', 'tests', 'tools', 'various-assorted-images', 'worker'
  ]);
  for (const name of forbiddenDirectories) {
    assert.equal(fs.existsSync(path.join(staticRoot, name)), false, `${name}/ must not be publicly deployed`);
  }

  const forbiddenExtensions = new Set([
    '.ai', '.bak', '.cdr', '.eps', '.ipynb', '.md', '.pdf', '.py', '.rtf', '.sh', '.txt', '.zip'
  ]);
  const debris = walk(staticRoot).filter((file) => forbiddenExtensions.has(path.extname(file).toLowerCase()));
  assert.deepEqual(debris, []);
});

test('public filenames do not contain copy suffixes or generated download names', () => {
  const bad = walk(staticRoot).filter((file) => {
    const name = path.basename(file);
    return /ChatGPT Image/i.test(name) || /\(\d+\)/.test(name) || /\s\d+\.[^.]+$/.test(name);
  });
  assert.deepEqual(bad, []);
});

test('only supported production pages sit at the public root', () => {
  const pages = fs.readdirSync(staticRoot)
    .filter((name) => name.endsWith('.html'))
    .sort();
  assert.deepEqual(pages, [
    'app.html', 'bids.html', 'designer.html', 'fids.html', 'gids.html',
    'index.html', 'menu.html', 'picker.html', 'rotate.html',
    // v23265 — the multi-airport tour: rotate.html's scene rotation plus an
    // airport layer and an arrival card between them.
    'tour.html'
  ].sort());
});

test('public text files contain no hidden control characters', () => {
  const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg']);
  const bad = [];
  for (const file of walk(staticRoot).filter((item) => textExtensions.has(path.extname(item)))) {
    const text = fs.readFileSync(file, 'utf8');
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) bad.push(path.relative(staticRoot, file));
  }
  assert.deepEqual(bad, []);
});
