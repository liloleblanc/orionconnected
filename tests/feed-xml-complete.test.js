// feedXmlComplete (workers/fids-proxy.js) decides whether an XML feed body is
// whole: the root it opens must close, after any prolog, comments, doctype
// and processing instructions, with comments allowed after it. It reads the
// body with scans rather than a repeated lazy pattern, which backtracked
// exponentially on a body of '<!--' followed by many '--><!--' (CodeQL
// js/redos). These pin what it accepts and that a hostile body is quick.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'workers', 'fids-proxy.js'), 'utf8');
const start = SRC.indexOf('function feedXmlComplete(');
const end = SRC.indexOf('__name(feedXmlComplete', start);
assert.ok(start > 0 && end > start, 'feedXmlComplete is in the worker');
const feedXmlComplete = new Function(SRC.slice(start, end) + '; return feedXmlComplete;')();

test('a whole document is complete, with or without a prolog, doctype and comments', () => {
  assert.equal(feedXmlComplete('<?xml version="1.0"?><flights><f/></flights>'), true);
  assert.equal(feedXmlComplete('<?xml version="1.0"?>\n<!-- c --><!DOCTYPE x><flights><f/></flights>\n<!-- end -->  '), true);
  assert.equal(feedXmlComplete('  <!-- a --> <r a="1">x</r> <!-- b --> <!-- c -->'), true);
  assert.equal(feedXmlComplete('<flights/>'), true);
  assert.equal(feedXmlComplete('<rss version="2.0"><channel></channel></rss>\n'), true);
});

test('a body cut short, or with nothing but its preamble, is not', () => {
  assert.equal(feedXmlComplete('<flights><f/>'), false);
  assert.equal(feedXmlComplete('<?xml?><r>x</r'), false);
  assert.equal(feedXmlComplete(''), false);
  assert.equal(feedXmlComplete('<!-- only -->'), false);
  assert.equal(feedXmlComplete('<?xml unterminated <r/>'), false);
  assert.equal(feedXmlComplete('<!DOCTYPE x <r/>'), false);
});

test('a hostile run of comment markers is read in linear time', () => {
  const bodies = [
    '<r>' + '<!--' + '--><!--'.repeat(50000) + 'x',
    '<!--'.repeat(50000) + '<r/>',
    '<r/>' + '<!--'.repeat(50000) + '-->',
  ];
  for (const b of bodies) {
    const t0 = process.hrtime.bigint();
    feedXmlComplete(b);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 250, 'took ' + ms.toFixed(1) + ' ms on a ' + b.length + '-character body');
  }
});
