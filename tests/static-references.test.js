'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const staticRoot = path.resolve(__dirname, '..', 'fids-current');
const sourceExtensions = new Set(['.css', '.html', '.js']);
const assetExtension = '(?:css|gif|glb|html|ico|jpeg|jpg|js|json|mov|mp4|otf|png|svg|ttf|webp|woff2?|xml)';
const dynamicRoutes = ['/demtiles/', '/mapcdn/', '/maptiles/', '/tiles/'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function cleanReference(value) {
  const unescaped = value.replace(/\\\//g, '/');
  return unescaped.split('#', 1)[0].split('?', 1)[0];
}

function shouldSkip(value) {
  return !value || value.startsWith('#') || value.startsWith('//') ||
    /^(?:data|https?|javascript|mailto):/i.test(value) ||
    value.includes('${') || value.includes('{') || value.includes('*') ||
    dynamicRoutes.some((prefix) => value.startsWith(prefix));
}

function addReference(found, source, raw, kind) {
  const value = cleanReference(raw.trim());
  if (shouldSkip(value)) return;
  const target = value.startsWith('/')
    ? path.join(staticRoot, value.slice(1))
    : path.resolve(path.dirname(source), value);
  found.push({ source, value, target, kind });
}

test('literal local references in public HTML, CSS, and JavaScript resolve', () => {
  const found = [];
  const sources = walk(staticRoot).filter((file) => sourceExtensions.has(path.extname(file)));

  for (const source of sources) {
    const text = fs.readFileSync(source, 'utf8');
    const uncommented = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    if (source.endsWith('.html')) {
      for (const match of text.matchAll(/\b(?:href|poster|src)\s*=\s*["']([^"']+)["']/gi)) {
        addReference(found, source, match[1], 'html');
      }
    }
    if (source.endsWith('.css')) {
      for (const match of uncommented.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        addReference(found, source, match[1], 'css');
      }
    }
    const rootLiteral = new RegExp('["\\' + "'" + '`](/[^"\\' + "'" + '`\\s]+\\.' + assetExtension + '(?:\\?[^"\\' + "'" + '`\\s]*)?)["\\' + "'" + '`]', 'gi');
    for (const match of uncommented.matchAll(rootLiteral)) addReference(found, source, match[1], 'literal');
  }

  const missing = found
    .filter(({ target }) => !fs.existsSync(target))
    .map(({ source, value }) => `${path.relative(staticRoot, source)} -> ${value}`)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort();

  assert.deepEqual(missing, []);
});
