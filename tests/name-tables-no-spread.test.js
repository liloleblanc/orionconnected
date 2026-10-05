// The curated name tables are written out key by key. A spread inside one
// (`...OTHER_TABLE,`) can silently overwrite curated entries with another
// table's values: the CITY_FR collapse in another form, where French city
// names came back in English. Duplicate keys are caught elsewhere (B4); a
// spread hides its keys from that check, so name tables may not contain one.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FILES = {
  'fids-current/js/fids-core.js': ['CITY', 'CITY_FR', 'AP', 'AIRLINE_NAME', 'AIRPORT_SUBLINE', '_AIRLINE_NAME_OVERRIDE', '_OPNAMES'],
  'fids-current/js/shared-names.js': null,
};

// Body of `<const|var|let> NAME = { ... }`, skipping strings and comments.
function tableBody(src, name) {
  const m = new RegExp('(?:const|var|let)\\s+' + name + '\\s*=\\s*\\{').exec(src);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1, out = '';
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let k = i + 1;
      while (k < src.length && src[k] !== c) { if (src[k] === '\\') k++; k++; }
      out += ' S '; i = k + 1; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth > 0) out += c;
    i++;
  }
  return out;
}

for (const [rel, names] of Object.entries(FILES)) {
  const file = path.join(__dirname, '..', rel);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const list = names || Array.from(src.matchAll(/(?:const|var|let)\s+([A-Z][A-Z0-9_]*)\s*=\s*\{/g), (m) => m[1]);
  for (const name of list) {
    const body = tableBody(src, name);
    if (body == null) continue;
    test(rel + ': ' + name + ' has no spread', () => {
      assert.ok(!/\.\.\./.test(body), name + ' contains a spread (...); write its entries out so every key is checked');
    });
  }
}
