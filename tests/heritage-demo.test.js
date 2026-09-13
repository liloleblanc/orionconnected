'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23759 — HERITAGE DEMONSTRATION GATES.
//
// A gate board rendered in a past carrier's identity, chosen from
// heritage.html and reached at gids.html?heritage=9A.
//
// Two things make it safe to ship, and both are held here.
//
//   IT SAYS WHAT IT IS. Every carrier it can show has ceased operating, so an
//   unmarked board of its flights would not read as nostalgia — it would read
//   as a fault, or as the feed having gone wrong. The stamp is permanent and
//   the mode is forced to demo regardless of session or URL, because there is
//   no live data for a defunct airline and asking for any is meaningless.
//
//   IT CANNOT REPAINT A LIVE CARRIER. A heritage gate takes over an IATA
//   code. That is fine for Air Atlantic, whose 9A is free, and would be
//   actively harmful for Air Canada, whose AC is in daily service.
//
// The carrier list exists twice — in fids-core.js, which drives the gate, and
// in heritage-index.js, which draws the chooser — because the chooser is
// deliberately standalone and does not load the board engine. This file holds
// the two in step so a carrier added to one and forgotten in the other fails
// here rather than producing a card that leads to a dead gate.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'heritage-index.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'fids-current', 'heritage.html'), 'utf8');
const GIDS = fs.readFileSync(path.join(ROOT, 'fids-current', 'gids.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

function coreCarriers() {
  const m = /var HERITAGE_CARRIERS = (\{[\s\S]*?\n\});/.exec(SRC);
  assert.ok(m, 'HERITAGE_CARRIERS must be declared in fids-core.js');
  return new Function('return ' + m[1] + ';')();
}
function indexCarriers() {
  const m = /var CARRIERS = (\[[\s\S]*?\n  \]);/.exec(IDX);
  assert.ok(m, 'the chooser must declare its carrier list');
  return new Function('return ' + m[1] + ';')();
}

test('the chooser and the gate agree on which carriers exist', () => {
  const core = Object.keys(coreCarriers()).sort();
  const idx = indexCarriers().map((c) => c.code).sort();
  assert.deepEqual(idx, core,
    'a carrier in one list and not the other produces either a card that leads ' +
    'to a dead gate, or a gate nothing can reach');
});

test('every heritage code is free — none belongs to a carrier still flying', () => {
  // The whole mechanism works by taking over an IATA code. Air Atlantic's 9A
  // is free; Air Canada's AC is not, and a heritage entry under it would
  // repaint the live airline on every board.
  const live = ['AC', 'WS', 'PD', 'PB', 'TS', 'F8', 'QK', 'WR', 'UA', 'DL', 'AA', 'B6', 'WN', 'AS'];
  for (const code of Object.keys(coreCarriers())) {
    assert.ok(!live.includes(code),
      `${code} belongs to a carrier still in service — a heritage gate would repaint it`);
  }
});

test('every carrier the chooser offers has its artwork on disk', () => {
  for (const c of indexCarriers()) {
    for (const f of [c.mark, c.endorsement].filter(Boolean)) {
      const p = path.join(ROOT, 'fids-current', f.replace(/^\//, ''));
      assert.ok(fs.existsSync(p), `${f} is offered but missing from the tree`);
    }
  }
});

test('a heritage gate is forced to demo, whatever the session or the URL says', () => {
  // There is no live data for an airline that ceased operating in 1998.
  // Letting ?mode=live through would produce an empty board, which reads as a
  // broken gate rather than an archive.
  assert.match(GIDS, /_heritageCode\(\)\)\s*\{\s*\n\s*startMode = 'demo';/,
    'gids.html must force demo mode when a heritage carrier is requested');
  assert.match(GIDS, /_heritageMarkBoard\(\)/, 'and stamp the board in the same breath');
});

test('the stamp is permanent, prominent and bilingual', () => {
  const at = SRC.indexOf('function _heritageMarkBoard');
  assert.ok(at >= 0, 'the stamp must be applied from the core');
  const body = SRC.slice(at, at + 900);
  assert.match(body, /DEMONSTRATION/, 'it must say so in English');
  assert.match(body, /DÉMONSTRATION/, 'and in French, like everything else a passenger reads');
  assert.match(body, /not a live flight/, 'and say plainly that the flight is not real');
  assert.match(body, /data-heritage/, 'and flag the document so the styling can hang off it');
  // position:fixed on the root, not inside the board — a gate re-render must
  // not be able to drop it.
  assert.match(CSS, /html\[data-heritage\] #heritageStamp\s*\{[\s\S]*?position:\s*fixed/,
    'the stamp sits above the board so no re-render can remove it');
});

test('the demo schedule never routes a flight to its own airport', () => {
  const at = SRC.indexOf('function _heritageSchedule');
  assert.ok(at >= 0, '_heritageSchedule must exist');
  const body = SRC.slice(at, at + 1600);
  assert.match(body, /d\.c !== ia/,
    'a departure to the airport you are standing in is the kind of detail that ' +
    'makes a demonstration look broken rather than nostalgic');
});

test('the heritage board reuses the ordinary demo path', () => {
  // Times, statuses, sorting and the gate screen itself are all downstream of
  // buildDemoFlights. Substituting the schedule there means a heritage gate
  // is an ordinary demo gate whose airline happens to be defunct.
  assert.match(SRC, /const sched = _heritageSchedule\(iata\) \|\| DEMO_SCHEDULES\[iata\]/,
    'the heritage board must substitute at the schedule, not fork the renderer');
});

test('the carrier is branded through the tables that already exist', () => {
  const c = Object.keys(coreCarriers())[0];
  assert.match(SRC, new RegExp("'" + c + "': '#"), 'it needs an accent colour');
  assert.match(SRC, new RegExp("'" + c + "': 'Air Atlantic'"), 'and a name');
  assert.match(SRC, new RegExp("'" + c + "':\\s*\\{ src: '/logos/airlines/canadian/heritage/"),
    'and a banner mark, in the LIGHT table — the artwork is navy ink drawn for paper');
});

test('the chooser says what it is withholding, rather than quietly omitting it', () => {
  assert.match(IDX, /WITHHELD/, 'the page must account for the marks it does not offer');
  assert.match(IDX, /AC is very much in service/,
    'and give the real reason — the code collision, not a vague apology');
});

test('the chooser page carries no vh-only clamps', () => {
  const all = PAGE.match(/clamp\([^()]*(?:\([^()]*\)[^()]*)*\)/g) || [];
  assert.ok(all.length >= 10, `expected the page's clamps, found ${all.length}`);
  const bad = all.filter((c) => c.includes('vh') && !c.includes('vw'));
  assert.deepEqual(bad, [], 'these clamps have no width term: ' + bad.join(', '));
});

test('the chooser is standalone and does not pull the board engine', () => {
  assert.doesNotMatch(PAGE, /fids-core\.js/,
    'the archive needs a list and some artwork, not a 42,000-line board engine — ' +
    'staying independent means a change to the live boards cannot break it');
});
