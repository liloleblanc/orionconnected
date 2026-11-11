'use strict';

// v24140 — the Safari first-load test switch in fids.html is inert unless the
// address carries ?wk=, and each key takes away exactly one layer of the table.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'fids.html'), 'utf8');

function block() {
  const at = HTML.indexOf('SAFARI FIRST-LOAD TEST SWITCH');
  assert.ok(at > 0, 'the switch is in fids.html');
  const open = HTML.lastIndexOf('<script>', at);
  const close = HTML.indexOf('</script>', at);
  assert.ok(HTML.indexOf('</head>', close) - close < 20, 'it is the last thing in the head, after every stylesheet');
  assert.ok(HTML.lastIndexOf('<link rel="stylesheet"', open) > 0 && HTML.indexOf('<link rel="stylesheet"', close) < 0, 'no stylesheet after it');
  return HTML.slice(open + 8, close);
}

function run(search, vendor) {
  const added = [];
  const head = { children: [], appendChild(n) { added.push(n); this.children.push(n); n.parentNode = this; }, get lastElementChild() { return this.children[this.children.length - 1]; } };
  const ctx = {
    URLSearchParams,
    location: { search },
    navigator: vendor === undefined ? undefined : { vendor },
    setInterval: () => 0, setTimeout: () => 0,
    document: {
      head, documentElement: head, body: null,
      createElement: (t) => ({ tag: t, textContent: '', setAttribute() {} }),
      addEventListener() {}, getElementById: () => null,
    },
  };
  vm.createContext(ctx);
  vm.runInContext(block(), ctx);
  const st = added.find((n) => n.tag === 'style');
  return st ? st.textContent : null;
}

test('without ?wk= the switch does nothing at all', () => {
  assert.equal(run(''), null);
  assert.equal(run('?mode=live&ap=YQM'), null);
  assert.equal(run('?mode=live&ap=YQM&nomobile=1'), null);
});

test('none is the board as it is: an empty sheet, the tag only', () => {
  assert.equal(run('?wk=none'), '');
});

test('each key takes away one layer, and b takes all four', () => {
  const clip = run('?wk=clip');
  assert.match(clip, /#fidsTable thead th:first-child,[\s\S]*th:last-child \{ clip-path: none !important; -webkit-clip-path: none !important; \}/);
  assert.doesNotMatch(clip, /position: static|filter: none/);
  assert.match(run('?wk=wm'), /fids-airline-wordmark\[data-code\] \{ transform: none !important; position: static !important; top: auto !important; \}/);
  assert.match(run('?wk=tile'), /\.full-logo \{ position: static !important; top: auto !important; \}/);
  assert.match(run('?wk=hover'), /tr:active \{ filter: none !important; transform: none !important; transition: none !important; \}/);
  const b = run('?ap=YQM&wk=b');
  for (const k of ['clip-path: none', 'transform: none !important; position: static', '.full-logo { position: static', 'filter: none']) assert.ok(b.includes(k), 'b carries ' + k);
  // At the specificity ceiling, so source order decides any tie and the sheet is kept last.
  assert.ok((b.match(/:not\(#_\)/g) || []).length / (b.match(/\{/g) || []).length >= 260 * 2);
});

test('v24145: an Apple engine runs b by default, with no corner tag; other engines and ?wk=none are untouched', () => {
  const safari = run('?mode=live&ap=YQM', 'Apple Computer, Inc.');
  assert.equal(safari, run('?wk=b'), 'the default in Safari is exactly the tested b');
  assert.equal(run('', 'Google Inc.'), null);
  assert.equal(run('', ''), null);
  assert.equal(run('?wk=none', 'Apple Computer, Inc.'), '', 'none still gives the board as it was');
  assert.match(block(), /var tag = function \(\) \{\s*if \(auto\) return;/);
});
