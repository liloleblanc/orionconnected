// Every stylesheet the boards load closes every block it opens. A merge that
// drops one closing brace does not fail to parse: the browser folds the next
// block into the unclosed rule, so whole features vanish from the screen with
// no error and every other test still green (v23975: a rebase left a rule
// open and the gate-close line rendered word by word, unreadable).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CSS_DIR = path.join(__dirname, '..', 'fids-current', 'css');

function depthErrors(src) {
  const out = [];
  let depth = 0, line = 1, i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop; continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < src.length && src[k] !== c) { if (src[k] === '\\') k++; k++; }
      i = k + 1; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth < 0) { out.push('extra } at line ' + line); depth = 0; } }
    i++;
  }
  if (depth !== 0) out.push(depth + ' unclosed { at end of file');
  return out;
}

for (const f of fs.readdirSync(CSS_DIR).filter((n) => n.endsWith('.css'))) {
  test('braces balance in css/' + f, () => {
    const errs = depthErrors(fs.readFileSync(path.join(CSS_DIR, f), 'utf8'));
    assert.deepStrictEqual(errs, [], f + ': ' + errs.join('; '));
  });
}
