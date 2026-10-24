'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24081 — THE MONCTON STREAM GIVES DEPARTURES MORE TIME.
// Box 1 runs one address for weeks, typed on the server
// (ap=YQM ... stream=1 ... rotate=fids,gids,bids,gids). Departures, the only
// board with the planet and its cities, was on air one minute in four. That
// exact address now runs departures, gate, departures, gate, baggage; every
// other address is read as written. Lifted from rotate.html and run.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROTATE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'rotate.html'), 'utf8');
const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const from = ROTATE.indexOf("      var rot = (q.get('rotate') || 'fids,gids,bids').trim();");
const to = ROTATE.indexOf("      if (seq.length === 0) seq = ['fids.html'];");
assert.ok(from > 0 && to > from, 'the order is read where it always was');
const ORDER = ROTATE.slice(from, to) + "      if (seq.length === 0) seq = ['fids.html'];\n";
function seqFor(search) {
  const ctx = { q: new URLSearchParams(search), document: { documentElement: { style: { setProperty() {} } } }, result: null };
  vm.runInNewContext(ORDER + '\nresult = { seq: seq, dwell: dwell };', ctx);
  return ctx.result;
}
const STREAM1 = 'ap=YQM&mode=live&stream=1&langs=en,fr&rotate=fids,gids,bids,gids&dwell=60';

test('the Moncton stream address runs departures, gate, departures, gate, baggage', () => {
  const r = seqFor(STREAM1);
  assert.deepEqual(Array.from(r.seq), ['fids.html', 'gids.html', 'fids.html', 'gids.html', 'bids.html']);
  assert.equal(r.dwell, 60, 'a minute each, as before');
  const share = r.seq.filter((p) => p === 'fids.html').length / r.seq.length;
  assert.equal(share, 2 / 5, 'departures two minutes in five');
  // the run wraps round to departures after baggage: never a board twice in a row
  for (let i = 0; i < r.seq.length; i++) assert.notEqual(r.seq[i], r.seq[(i + 1) % r.seq.length], 'no board followed by itself');
});

test('every other address is read as written', () => {
  assert.deepEqual(Array.from(seqFor(STREAM1.replace('stream=1', 'stream=2')).seq), ['fids.html', 'gids.html', 'bids.html', 'gids.html'], 'the second stream');
  assert.deepEqual(Array.from(seqFor(STREAM1.replace('ap=YQM', 'ap=YHZ')).seq), ['fids.html', 'gids.html', 'bids.html', 'gids.html'], 'another airport');
  assert.deepEqual(Array.from(seqFor('ap=YQM&stream=1&rotate=gids,fids').seq), ['gids.html', 'fids.html'], 'another order');
  assert.deepEqual(Array.from(seqFor('ap=YQM&rotate=fids,gids,bids,gids').seq), ['fids.html', 'gids.html', 'bids.html', 'gids.html'], 'not a stream');
  assert.deepEqual(Array.from(seqFor('ap=YQM').seq), ['fids.html', 'gids.html', 'bids.html'], 'no order given: the default');
});

test('the running stream takes the new copy: the rescue bar moves with the rotator version', () => {
  assert.equal(CORE.match(/_OC_ROTATOR_MIN\s*=\s*(\d+)/)[1], '24081');
  assert.equal(ROTATE.match(/__ocRotatorVer\s*=\s*(\d+)/)[1], '24081');
});
