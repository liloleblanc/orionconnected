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
