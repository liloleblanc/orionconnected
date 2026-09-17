'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// A HERITAGE GATE MUST STAY A HERITAGE GATE.
//
// Reported as "you get there and it kicks you out, or goes back to normal
// flights". Measured on the live board at gids?heritage=9A:
//
//     LIVE_MODE         false          demo forced, correct
//     heritage          "9A"           recognised, correct
//     autoRefreshTimer  true           ARMED — should never be
//     demoRebuildTimer  false          NOT armed — should be
//     data.dep          PD2382, PB924, WS813      live Moncton flights
//     buildDemoFlights  9A500, 9A502, 9A504       the Air Atlantic board
//
// The right board was sitting there ready. fetchLive had run anyway, armed its
// five-minute timer, and was stamping today's Porter, PAL and WestJet rows over
// a 1998 Air Atlantic demonstration — on a cycle, which is why it looked like
// the board "going back to normal" a few minutes after you arrived.
//
// Two faults, one ordering problem:
//
//   `if (!LIVE_MODE) startDemoRebuild()` is a TOP-LEVEL statement in
//   fids-core.js, so it runs at core load while LIVE_MODE is still true. A
//   heritage gate therefore never started its rebuild. And gids.html clearing
//   LIVE_MODE afterwards cannot disarm a refresh timer already running.
//
// So the refusal lives inside fetchLive, where ordering cannot defeat it.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const GIDS = fs.readFileSync(path.join(ROOT, 'fids-current/gids.html'), 'utf8');

function fnBody(name, src = SRC) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  assert.fail('could not bracket-match ' + name);
}

test('fetchLive refuses outright on a heritage board', () => {
  const body = fnBody('fetchLive');
  const guard = body.indexOf('_heritageCode()');
  assert.ok(guard >= 0,
    'fetchLive must check for a heritage board — it is the one function that ' +
    'can overwrite the board with live rows');
  const firstDomRead = body.indexOf("getElementById('apSel')");
  assert.ok(firstDomRead === -1 || guard < firstDomRead,
    'the heritage check must come BEFORE any work, so no partial fetch happens');
});

test('and disarms the refresh timer on its way out', () => {
  const body = fnBody('fetchLive');
  const guardAt = body.indexOf('_heritageCode()');
  const tail = body.slice(guardAt, guardAt + 400);
  assert.match(tail, /clearInterval\(autoRefreshTimer\)/,
    'returning is not enough — a timer armed before the board was known to be ' +
    'heritage would keep firing every five minutes');
  assert.match(tail, /autoRefreshTimer = null/);
  assert.match(tail, /\breturn\b/, 'and it must actually stop');
});

test('the demo rebuild is started for a heritage board', () => {
  // The top-level `if (!LIVE_MODE) startDemoRebuild()` has already run and
  // declined by the time a heritage gate is known, so something must start it.
  const body = fnBody('_heritageHoldDemo');
  assert.match(body, /LIVE_MODE = false/, 'demonstration mode is forced');
  assert.match(body, /clearInterval\(autoRefreshTimer\)/, 'and any live timer stopped');
  assert.match(body, /startDemoRebuild\(\)/, 'and the demo rebuild actually started');
  assert.match(body, /!demoRebuildTimer/, 'without stacking a second interval on a re-entry');
});

test('marking the board also holds it in demonstration mode', () => {
  const body = fnBody('_heritageMarkBoard');
  assert.match(body, /_heritageHoldDemo\(\)/,
    'the one place gids.html calls must do both, or a heritage gate boots live');
});

test('the top-level rebuild decision is genuinely too early — the premise', () => {
  // If this ever stops being a top-level statement, the guards above may be
  // redundant and this test says so rather than leaving them unexplained.
  const at = SRC.indexOf('if (!LIVE_MODE) startDemoRebuild();');
  assert.ok(at >= 0, 'the top-level rebuild decision still exists');
  const line = SRC.slice(SRC.lastIndexOf('\n', at) + 1, at);
  assert.equal(line.trim(), '',
    'it is at top level, so it runs at core load — before any page can know ' +
    'whether this is a heritage gate');
});

test('gids.html still forces demo mode for a heritage gate', () => {
  assert.match(GIDS, /_heritageCode\(\)\)\s*\{[\s\S]{0,400}startMode = 'demo'/,
    'the boot path must still choose demo — the core guards are a backstop, ' +
    'not a replacement for asking for the right thing in the first place');
});

test('a heritage board can never be asked for live data by the airport switcher', () => {
  // `if (LIVE_MODE) { fetchLive(); } else { loadDemo(); }` runs on an airport
  // change. With LIVE_MODE forced false and fetchLive refusing, both routes are
  // closed — but assert the branch still exists so a future edit that removes
  // the LIVE_MODE check does not quietly reopen it.
  assert.match(SRC, /if \(LIVE_MODE\) \{ fetchLive\(\); \} else \{ loadDemo\(\); \}/,
    'the switcher branch is the other way live rows reach a demo board');
});
