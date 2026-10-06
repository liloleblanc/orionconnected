// No merge-conflict markers in any tracked text file. A rebase that is
// continued with a hunk still open commits "<<<<<<<" / "=======" / ">>>>>>>"
// lines into the page; in an .html file they render as text on the board.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const TEXT = /\.(html?|css|js|mjs|cjs|json|md|txt|svg|xml|ya?ml|toml|py|sh|swift)$/i;

test('no tracked text file carries a merge-conflict marker', () => {
  let files;
  try {
    files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n');
  } catch (e) {
    return; // not a git checkout (a packaged copy): nothing to check
  }
  const hits = [];
  for (const f of files) {
    if (!f || !TEXT.test(f)) continue;
    let s;
    try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
    if (s.length > 20 << 20) continue;
    const lines = s.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^(<{7}|>{7})( |$)/.test(lines[i]) || /^\|{7}( |$)/.test(lines[i])) { hits.push(f + ':' + (i + 1)); break; }
    }
  }
  assert.deepEqual(hits, [], 'conflict markers committed in: ' + hits.join(', '));
});
