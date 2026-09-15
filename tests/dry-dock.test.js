'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23796 — THE DRY DOCK.
//
// A staging area for airports being integrated or repaired. A docked airport
// is absent from every picker and from the stream tours, and STILL REACHABLE
// BY DIRECT LINK, because that is how it gets built and tested.
//
// The distinction that matters, and the one this file mostly guards: docked is
// NOT "has no feed". _fidsAirportHasFeed drives the dead-board rescue that
// navigates a board to /rotate?tour=1 after 45 seconds, so an airport dropped
// from FIDS_LIVE_AIRPORTS would bounce off its own direct link the first quiet
// minute. Docking is a narrower fact, kept in its own list.
//
// Sydney is the first inhabitant: merged, but unannounced while the airport
// has not answered the permission request.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKER = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const ROTATE = fs.readFileSync(path.join(ROOT, 'fids-current', 'rotate.html'), 'utf8');

test('the read is public and the write is not', () => {
  // The gate in this worker is opt-in, not default-deny: it protects only
  // /auth/users and /api/. A read registered below it would 401 the stream box,
  // which has never had a token — and the box failing to read the dock is the
  // case where a docked airport goes back on air.
  const gate = WORKER.indexOf('if (path.startsWith("/auth/users") || path.startsWith("/api/"))');
  assert.ok(gate > 0, 'the auth gate must still exist');
  const get = WORKER.indexOf('path === "/api/dry-dock" && request.method === "GET"');
  const put = WORKER.indexOf('path === "/api/dry-dock" && request.method === "PUT"');
  assert.ok(get > 0 && put > 0, 'both routes must be registered');
  assert.ok(get < gate,
    'the READ must be registered above the auth gate — below it, the stream box ' +
    'gets a 401 and silently tours a docked airport');
  assert.ok(put > gate,
    'the WRITE must be registered below the auth gate, or it is an ' +
    'unauthenticated write to what every board reads');
});

test('the write checks the role itself, not just the token', () => {
  // The gate only proves the token is valid — any signed-in viewer clears it.
  // And every "is this an admin" check in the browser is forgeable: one of them
  // reports admin when nobody is signed in at all. The 403 in this handler is
  // the only thing that actually stops a write.
  const at = WORKER.indexOf('async function handlePutDryDock');
  assert.ok(at > 0, 'the write handler must exist');
  const body = WORKER.slice(at, WORKER.indexOf('\n}', at));
  assert.match(body, /if \(!isAdmin\(payload\)\) return jsonResponse\(\{ error: "Admin access required" \}, 403/,
    'the handler must refuse a non-admin itself');
  assert.match(body, /if \(!Array\.isArray\(body\.docked\)\)/,
    'and must refuse a body that is not the shape the readers expect');
  assert.match(body, /toUpperCase\(\)/,
    'codes are normalised on the way in — the readers compare upper-case, and ' +
    'one lower-case entry would silently dock nothing');
});

test('a docked airport keeps its feed, so its direct link does not bounce', () => {
  // The trap this whole design is shaped around.
  const live = CORE.slice(CORE.indexOf('const FIDS_LIVE_AIRPORTS = new Set(['));
  const set = live.slice(0, live.indexOf(']);'));
  assert.ok(set.includes("'SYD'"),
    'SYD is docked and must STILL be in FIDS_LIVE_AIRPORTS — dropping it there ' +
    'makes _fidsAirportHasFeed false, and the dead-board rescue then navigates ' +
    'the whole page to /rotate?tour=1 forty-five seconds after it is opened');
  // …and the dock must not be wired into that function
  const feed = CORE.slice(CORE.indexOf('function _fidsAirportHasFeed'));
  assert.doesNotMatch(feed.slice(0, feed.indexOf('\n}')), /[Dd]ock/,
    'the dock must not reach _fidsAirportHasFeed; they are different facts');
});

test('the pickers stop offering a docked airport', () => {
  assert.match(CORE, /FIDS_LIVE_AIRPORTS\.has\(a\.c\) && !fidsIsDocked\(a\.c\)/,
    'the instant results must exclude docked airports');
  assert.match(CORE, /\.filter\(function\(a\) \{ return !fidsIsDocked\(a\.iata\); \}\)/,
    'and so must the live API results — offering it there and not here is worse ' +
    'than not filtering at all');
});

test('a bad response never empties the dock', () => {
  // A 502 or a truncated body parses to something that looks like an empty
  // dock, which is indistinguishable from "nothing is docked" — and would put
  // a docked airport back into every picker and onto the streams.
  const at = CORE.indexOf('async function loadDryDock');
  const body = CORE.slice(at, CORE.indexOf('\n}', CORE.indexOf('return _dryDockInflight;', at)));
  assert.match(body, /if \(!res\.ok\) return _dryDockCache;/, 'a failed request keeps the last good list');
  assert.match(body, /!Array\.isArray\(doc\.docked\)\) return _dryDockCache;/,
    'and so does a body that is not shaped like a dock');
  assert.match(body, /catch \(e\) \{[\s\S]*?return _dryDockCache;/,
    'and so does a thrown one — never a blank list');
  assert.match(body, /cache: 'no-store'/, 'the read is not served from cache');
  assert.match(body, /_oc=' \+ Date\.now\(\)/, 'and is cache-busted');
});

test('the rotator applies the dock without touching a running rotation', () => {
  // advance() dereferences frames[aps[apIdx]] unguarded. Splicing `aps` while
  // it holds an index can strand that index past the end, which throws inside
  // the 1Hz heartbeat and freezes the stream on one board — no black screen, no
  // error, nothing that looks like a fault from outside.
  assert.doesNotMatch(ROTATE, /checkDock[\s\S]{0,1200}aps\.splice/,
    'the poll must never splice the live airport list');
  const poll = ROTATE.slice(ROTATE.indexOf('function checkDock'));
  const body = poll.slice(0, poll.indexOf('\n      }'));
  assert.match(body, /reloadPending = true/,
    'it raises the existing reload flag instead, so the change lands at the ' +
    'next board switch through the path a deploy already uses');
  assert.doesNotMatch(body, /\baps\b/, 'and does not reference the running list at all');
  assert.match(body, /cache: 'no-store'/);
  assert.match(body, /_oc=' \+ Date\.now\(\)/,
    "this origin's GETs are served from the edge with no validators — without " +
    'both of these the box polls a frozen list');
  assert.match(body, /!Array\.isArray\(doc\.docked\)\) return;/,
    'a malformed body must not be cached as an empty dock');
});

test('the dock is applied where the no-feed filter already is, and synchronously', () => {
  // tests/stream-tour-selection.test.js executes the selection block as a pure
  // function. An await or a fetch in there turns CI red, and a list that
  // arrived later would have to mutate `aps` after advance() is live.
  const at = ROTATE.indexOf("var dropped = aps.filter");
  const end = ROTATE.indexOf('var isTour = aps.length > 1;', at);
  assert.ok(at > 0 && end > at, 'the selection block must still be readable');
  const block = ROTATE.slice(at, end);
  assert.match(block, /oc_dry_dock/, 'the dock is applied in the selection block');
  assert.doesNotMatch(block, /await |fetch\(/,
    'and reads a cached copy rather than fetching — this block is executed ' +
    'synchronously by a test and by advance() alike');
  assert.match(block, /if \(_keep\.length\)/,
    'docking every airport in a run must not empty it — a frozen or black ' +
    'stream is worse than one docked board');
});

test('Sydney is the first inhabitant, and an admin can evict it', () => {
  assert.match(WORKER, /const DRY_DOCK_DEFAULT = \["SYD"\];/,
    'SYD is docked out of the box: merged, but unannounced while the airport ' +
    'has not answered the permission request');
  const at = WORKER.indexOf('async function handleGetDryDock');
  const body = WORKER.slice(at, WORKER.indexOf('\n}', at));
  assert.match(body, /if \(!data\) return jsonResponse\(\{ v: 1, docked: DRY_DOCK_DEFAULT\.slice\(\)/,
    'the default applies only when no document has ever been written');
  assert.match(body, /JSON\.parse\(data\)/,
    'and once one has, it is returned verbatim — the default is a starting ' +
    'position, not a floor, and must never re-add a code an admin removed');
});
