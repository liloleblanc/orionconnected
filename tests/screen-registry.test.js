'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23798 — THE SCREEN REGISTRY.
//
// A screen is a TV somewhere with a name we gave it. It carries its own
// identity — a six-character code it generated once and shows on itself until
// someone claims it — and asks what to display.
//
// Nothing about the screen's NETWORK identifies it. Every screen at one
// airport shares a public IP, and DHCP moves it anyway, so the server can
// never tell two of them apart that way. The screen has to say who it is.
//
// The property this file mostly guards: there is NO unauthenticated write
// anywhere in it. A screen only ever reads its own assignment. Claiming,
// changing and forgetting are admin.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKER = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'fids-current', 'screen.html'), 'utf8');
const MENU_JS = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'menu.js'), 'utf8');

test('a screen reads its own assignment, and writes nothing', () => {
  const gate = WORKER.indexOf('if (path.startsWith("/auth/users") || path.startsWith("/api/"))');
  const read = WORKER.indexOf('return handleGetScreen(env, origin,');
  assert.ok(read > 0 && read < gate,
    'the per-screen read must be public — a TV has never had a token and never will');

  // and every other verb is behind the gate
  for (const [what, needle] of [
    ['list', 'return handleListScreens(env, payload, origin)'],
    ['claim', 'return handlePutScreen(request, env, payload, origin,'],
    ['forget', 'return handleDeleteScreen(env, payload, origin,']
  ]) {
    const at = WORKER.indexOf(needle);
    assert.ok(at > gate, `${what} must be registered below the auth gate`);
  }
  // the page itself never writes
  assert.doesNotMatch(PAGE, /method:\s*['"](POST|PUT|DELETE|PATCH)['"]/i,
    'screen.html must never write — an open write endpoint reachable from every ' +
    'wall-mounted TV is not something to leave lying around');
});

test('every admin verb checks the role, not just the token', () => {
  // The gate only proves a token is valid; any signed-in viewer clears it.
  for (const fn of ['handleListScreens', 'handlePutScreen', 'handleDeleteScreen']) {
    const at = WORKER.indexOf('async function ' + fn);
    assert.ok(at > 0, `${fn} must exist`);
    const head = WORKER.slice(at, at + 400);
    assert.match(head, /if \(!isAdmin\(payload\)\) return jsonResponse\(\{ error: "Admin access required" \}, 403/,
      `${fn} must refuse a non-admin itself`);
  }
});

test('a corrupt registry is never replaced by a fresh one', () => {
  // The worst write this code could make: parse failure, fall back to {}, save
  // one screen into it, and silently unclaim every other TV in the building.
  const at = WORKER.indexOf('async function _screensDoc');
  const body = WORKER.slice(at, WORKER.indexOf('\n}', at));
  assert.match(body, /catch \(e\) \{ return null; \}/,
    'a corrupt document returns null rather than an empty registry');
  for (const fn of ['handlePutScreen', 'handleDeleteScreen']) {
    const f = WORKER.indexOf('async function ' + fn);
    const b = WORKER.slice(f, WORKER.indexOf('\n}', WORKER.indexOf('return jsonResponse({ success: true', f)));
    assert.match(b, /if \(!doc\) return jsonResponse\(\{ error: "Registry unreadable/,
      `${fn} must refuse to write over a registry it could not read`);
  }
});

test('the code is long enough to be an identity and readable off a wall', () => {
  // It IS the identity, so guessing another screen's must not be worth trying:
  // 32^6 is about a billion. And no I, O, 0 or 1 — those are the characters
  // someone reads back wrong from across a room.
  assert.match(WORKER, /const SCREEN_ID_RE = \/\^\[A-HJ-NP-Z2-9\]\{6\}\$\//,
    'the worker must pin the alphabet and the length');
  assert.match(PAGE, /var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';/,
    'and the page must generate from the same one');
  assert.ok(!/[IO01]/.test("ABCDEFGHJKLMNPQRSTUVWXYZ23456789"),
    'the alphabet itself must contain no ambiguous characters');
  assert.match(PAGE, /crypto\.getRandomValues/,
    'the identity is random, not derived from anything about the device');
});

test('an unclaimed screen is a normal state, not a failure', () => {
  const at = WORKER.indexOf('async function handleGetScreen');
  const body = WORKER.slice(at, WORKER.indexOf('\n}', at));
  assert.match(body, /if \(!scr\) return jsonResponse\(\{ claimed: false, id \}, 200, origin\)/,
    'an unclaimed screen answers 200, not 404 — it is what every new TV sees ' +
    'while it waits, and it must not read as broken');
});

test('a screen that cannot reach the registry keeps showing its code', () => {
  // A wall-mounted display on an airport network will lose the internet. A
  // blank or error screen in a terminal is worse than a code nobody is using.
  const at = PAGE.indexOf('.catch(function () {');
  assert.ok(at > 0, 'the poll must handle failure');
  const body = PAGE.slice(at, PAGE.indexOf('});', at));
  assert.match(body, /offline · retrying/, 'it says so and carries on');
  assert.doesNotMatch(body, /location\s*\./, 'and never navigates away on a failure');
  assert.match(PAGE, /setInterval\(poll, POLL_MS\)/, 'and keeps trying');
});

test('the handover goes to the board that was assigned', () => {
  const at = PAGE.indexOf('function boardUrl');
  const body = PAGE.slice(at, PAGE.indexOf('\n  }', at));
  assert.match(body, /a\.board === 'fids' \? 'fids\.html'/);
  assert.match(body, /a\.board === 'bids' \? 'bids\.html'/);
  assert.match(body, /'gids\.html'/, 'gate board is the default');
  assert.match(body, /ap=' \+ encodeURIComponent\(a\.airport\)/);
  assert.match(PAGE, /location\.replace\(boardUrl\(doc\)\)/,
    'replace, not assign — a wall display must not be walkable back to the ' +
    'pairing screen with a Back button');
});

test('the console reports a refused change instead of faking it', () => {
  const at = MENU_JS.indexOf('async function _scWrite');
  const body = MENU_JS.slice(at, MENU_JS.indexOf('finally { _scBusy = false; }', at));
  assert.match(body, /var before = _scScreens \?/, 'the previous list is kept');
  assert.match(body, /if \(!res\.ok\) \{[\s\S]*?_scScreens = before;/,
    'and put back when the server refuses');
  assert.match(body, /403 \? 'Refused: this account is not an admin\.'/);
  assert.match(body, /401 \? 'Refused: sign in again\.'/);
  assert.match(body, /_acFetch\(/, 'writes carry the token');
});

test('the console escapes what it renders', () => {
  // Screen names are typed by a person and rendered into innerHTML. This is
  // the one place in this feature where user text reaches markup.
  assert.match(MENU_JS, /function _scEsc\(v\)/, 'there must be an escaper');
  const at = MENU_JS.indexOf('function _scRender');
  const body = MENU_JS.slice(at, MENU_JS.indexOf('\n}', at));
  assert.match(body, /_scEsc\(s\.name/, 'the name is escaped');
  assert.match(body, /_scEsc\(s\.airport/, 'and so is the airport');
});

// ═══════════════════════════════════════════════════════════════════════════
// v23799 — WHICH GATE.
//
// Reported after the first real use: a screen claimed as "Gate 4" showed
// gate 2. The name was ours and the gate was the board's own guess — a gate
// board with no gate picks one. gids.html has always read ?gate= (C77, A4,
// 12); nothing was carrying it, which made the name decorative.
// ═══════════════════════════════════════════════════════════════════════════

test('a gate board is given its gate, not left to choose', () => {
  const at = PAGE.indexOf('function boardUrl');
  const body = PAGE.slice(at, PAGE.indexOf('\n  }', at));
  assert.match(body, /if \(a\.gate\) u \+= '&gate=' \+ encodeURIComponent\(a\.gate\)/,
    'the assigned gate must reach the board — without it the name says Gate 4 ' +
    'and the screen shows whichever gate the board picked');
  // and the board really does read it
  const GIDS = fs.readFileSync(path.join(ROOT, 'fids-current', 'gids.html'), 'utf8');
  assert.match(GIDS, /params\.get\('gate'\)/,
    'gids.html must still be reading the parameter this relies on');
});

test('the gate is stored, returned, and only where it means something', () => {
  const put = WORKER.indexOf('async function handlePutScreen');
  const body = WORKER.slice(put, WORKER.indexOf('return jsonResponse({ success: true', put));
  assert.match(body, /const gate = String\(body\.gate \|\| ""\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(body, /if \(gate && board !== "gids"\)/,
    'only a gate board has a gate — a departures screen with one is a mistake ' +
    'worth naming rather than silently ignoring');
  assert.match(body, /\^\[A-Z\]\?\[0-9\]\{1,3\}\[A-Z\]\?\$/, 'and the shape is checked');
  assert.match(body, /name, airport, board, gate,/, 'it is stored');

  const get = WORKER.indexOf('async function handleGetScreen');
  const gb = WORKER.slice(get, WORKER.indexOf('\n}', get));
  assert.match(gb, /gate: scr\.gate \|\| ""/, 'and returned, so the screen can use it');
});

test('an empty gate still means "let the board choose"', () => {
  // fids and bids boards have no gate, and a gate board without one must behave
  // exactly as it did before this existed.
  const at = PAGE.indexOf('function boardUrl');
  const body = PAGE.slice(at, PAGE.indexOf('\n  }', at));
  assert.match(body, /if \(a\.gate\)/, 'the parameter is conditional, never sent empty');
  assert.doesNotMatch(body, /gate=' \+ encodeURIComponent\(a\.gate \|\| ''\)/,
    'an empty gate= is not the same as no gate= and must not be sent');
});

test('the console explains the field rather than letting the server refuse it', () => {
  const at = MENU_JS.indexOf('function scClaim');
  const body = MENU_JS.slice(at, MENU_JS.indexOf('\n}', at));
  assert.match(body, /if \(gate && board !== 'gids'\)/,
    'the useful message is about what the field is for, not a 400');
  assert.match(body, /Gate should look like 4, A4, C77 or 12B/);
  assert.match(body, /gate: gate/, 'and it is actually sent');
  const render = MENU_JS.slice(MENU_JS.indexOf('function _scRender'));
  assert.match(render.slice(0, render.indexOf('\n}')), /s\.gate \? ' · gate ' \+ _scEsc\(s\.gate\)/,
    'and shown in the list, so a wrong gate is visible without walking to the TV');
});

test('the gate field shows only when it applies', () => {
  // v23801 — the constraint was previously enforced by REFUSING the claim, so
  // a screen set to Departures with a gate typed in saved nothing and the
  // reason appeared only after pressing Claim. A rule you discover by failing
  // is a bad rule.
  const at = MENU_JS.indexOf('function _scSyncGateField');
  assert.ok(at > 0, 'the sync must exist');
  const body = MENU_JS.slice(at, MENU_JS.indexOf('\n}', at));
  assert.match(body, /var on = \(board === 'gids'\)/, 'gate boards only');
  assert.match(body, /g\.disabled = !on/, 'the field is disabled rather than silently ignored');
  assert.match(body, /if \(!on\) g\.value = ''/,
    'and cleared — a leftover value would refuse the NEXT claim for a reason ' +
    'that is no longer on screen');
  assert.match(MENU_JS, /e\.target\.id === 'scBoard'\) _scSyncGateField\(\)/,
    'it follows the board type as it changes');
  assert.match(MENU_JS, /if \(tabId === 'airport'\) \{ try \{ _scSyncGateField\(\); \} catch \(e\) \{\} \}/,
    'and is correct the moment the tab opens, not only after a change');
});

// ═══════════════════════════════════════════════════════════════════════════
// v23802 — A CLAIMED SCREEN KEEPS ASKING.
//
// screen.html polled until it was claimed and then handed over. That was the
// whole of it — which made the handover the END of the conversation. The board
// does not poll, so re-assigning a screen from the console changed the registry
// and nothing else: the television carried on showing whatever it was given
// first, and the only way to move it was to walk to that TV and send it back to
// /screen.
//
// That is the opposite of the point. The point is that a screen is decided from
// the console, more than once.
// ═══════════════════════════════════════════════════════════════════════════

const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

test('a board that arrived with a screen id keeps asking', () => {
  assert.match(CORE, /function _fidsScreenFollow/, 'the follower must exist');
  assert.match(CORE, /setInterval\(_fidsScreenFollow, FIDS_SCREEN_FOLLOW_MS\)/,
    'and actually run on a timer');
  assert.match(CORE, /if \(typeof window !== 'undefined' && _fidsScreenId\(\)\)/,
    'only for a board that IS a claimed screen — every other board must not poll');
});

test('it compares against the URL it is on, not remembered state', () => {
  // So a reload, a crash or a stale tab all settle to the same answer, and a
  // screen that has not been re-assigned never navigates.
  const at = CORE.indexOf('function _fidsScreenDrift');
  const body = CORE.slice(at, CORE.indexOf('\n}', at));
  assert.match(body, /window\.location\.pathname/, 'the current page is the comparison');
  assert.match(body, /p\.get\('ap'\)/);
  assert.match(body, /p\.get\('gate'\)/, 'the gate counts too — a re-gated screen must move');
  assert.match(body, /if \(sameBoard && sameAp && sameGate\) return '';/,
    'no drift, no navigation — otherwise every poll reloads the board');
});

test('a forgotten screen goes back to showing its code', () => {
  const at = CORE.indexOf('function _fidsScreenFollow');
  const body = CORE.slice(at, CORE.indexOf('\n}', CORE.indexOf('.catch(function () {}', at)));
  assert.match(body, /if \(!doc\.claimed\) \{[\s\S]*?location\.replace\('\/screen\.html'\)/,
    'unclaimed from the console means the display is assigned nothing, and ' +
    'saying so is more honest than leaving a board up');
});

test('a board offline or given nonsense stays where it is', () => {
  const at = CORE.indexOf('function _fidsScreenFollow');
  const body = CORE.slice(at, CORE.indexOf('\n}', CORE.indexOf('.catch(function () {}', at)));
  assert.match(body, /if \(!doc \|\| typeof doc !== 'object'\) return;/,
    'an unreadable answer must not move a working board');
  assert.match(body, /\.catch\(function \(\) \{\}\)/,
    'and neither must a failed request — a terminal display that navigates ' +
    'itself away on a network blip is worse than one that is briefly stale');
  assert.match(body, /cache: 'no-store'/);
  assert.match(body, /_oc=' \+ Date\.now\(\)/);
});
