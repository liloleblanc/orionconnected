'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23803 — HOST → AIRPORT.
//
// yqm.orionconnected.com shows Moncton. Every board already resolves its
// airport as  ?ap= || sessionStorage.fids_airport || 'YQM'  — this fills in
// the middle and changes nothing else.
//
// ?ap= MUST keep winning. The screen registry re-assigns a display by
// navigating to an explicit ?ap=, and a hostname that outranked it would drag
// a re-assigned screen back to whatever airport its address is named after.
//
// The trap: 'fids', 'app', 'api' and 'www' are all three or four letters, so a
// naive parser reads fids.orionconnected.com as an airport called FIDS and
// serves an empty board on the main site. That is not hypothetical — the
// studio's own copy of this parser does exactly that.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'host-airport.js'), 'utf8');

/** Run the real parser out of the file, with a stubbed window. */
function hostAirport(hostname) {
  const win = { location: { hostname }, };
  const store = {};
  const sandbox = {
    window: win,
    sessionStorage: { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] || null }
  };
  new Function('window', 'sessionStorage', SRC)(sandbox.window, sandbox.sessionStorage);
  return { code: win.fidsHostAirport(hostname), stored: store.fids_airport || null };
}

test('an airport label on a zone we own becomes the airport', () => {
  for (const [host, want] of [
    ['yqm.orionconnected.com', 'YQM'],
    ['yhz.orionconnected.ca', 'YHZ'],
    ['syd.orionconnected.app', 'SYD'],
    ['YQM.OrionConnected.com', 'YQM'],        // case is not the caller's problem
    ['yqm.orionconnected.com:8443', 'YQM'],   // nor is a port
    ['cyqm.orionconnected.com', 'CYQM']       // four letters, for ICAO
  ]) {
    assert.equal(hostAirport(host).code, want, host);
  }
});

test('our own hostnames are never airports', () => {
  // fids.orionconnected.com is the live site. Reading it as an airport called
  // FIDS would serve an empty board to everyone on the main address.
  for (const host of [
    'fids.orionconnected.com', 'www.orionconnected.com', 'api.orionconnected.com',
    'app.orionconnected.com', 'menu.orionconnected.com', 'admin.orionconnected.com',
    'studio.orionconnected.com', 'tour.orionconnected.com', 'screen.orionconnected.com',
    'cdn.orionconnected.ca', 'dev.orionconnected.app'
  ]) {
    assert.equal(hostAirport(host).code, '', host + ' must not be read as an airport');
  }
});

test('anything that is not one of our zones is left alone', () => {
  for (const host of [
    'localhost', '127.0.0.1', '', 'orionconnected.com',
    'yqm.example.com', 'yqm.orionconnected.com.evil.test',
    'fids-proxy.n-leblanc1984.workers.dev',
    'yqm.gate2.orionconnected.com'   // two labels; Universal SSL covers one
  ]) {
    assert.equal(hostAirport(host).code, '', host + ' must not be parsed');
  }
});

test('a label that cannot be an airport code is refused', () => {
  for (const host of [
    'a.orionconnected.com', 'ab.orionconnected.com', 'abcde.orionconnected.com',
    'y-m.orionconnected.com', 'yq_m.orionconnected.com'
  ]) {
    assert.equal(hostAirport(host).code, '', host);
  }
});

test('it sets the DEFAULT, and never the airport itself', () => {
  // The whole reason this is safe: it writes sessionStorage, which every board
  // reads only AFTER ?ap=. A version that rewrote the URL or assigned the
  // airport directly would override a re-assigned screen.
  assert.match(SRC, /sessionStorage\.setItem\('fids_airport', code\)/,
    'the host fills in the default');
  assert.doesNotMatch(SRC, /replaceState|pushState|location\.(href|replace|assign)/,
    'it must not navigate or rewrite the URL — ?ap= has to keep winning, or ' +
    'the screen registry cannot move a display off the airport its address names');
  assert.equal(hostAirport('yqm.orionconnected.com').stored, 'YQM');
  assert.equal(hostAirport('fids.orionconnected.com').stored, null,
    'and it writes nothing at all when the host names no airport');
});

test('it runs before anything reads the airport', () => {
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'fids-current', page), 'utf8');
    const loaded = html.indexOf('host-airport.js');
    const read = html.indexOf("q.get('ap')");
    assert.ok(loaded > 0, `${page} must load the parser`);
    assert.ok(read > 0 && loaded < read,
      `${page} reads the airport before loading the parser — the default would ` +
      'arrive too late to be used');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// v23803 — orionconnected.app IS THE APP.
//
// index.html is the opener: it paints, then replaces itself with a board. On
// the .app domain it hands over to the Airport Companion instead.
//
// Done on the page rather than in the Worker because static assets are served
// BEFORE the Worker runs — there is no run_worker_first — so the Worker never
// sees a request for "/" and cannot route on the Host header.
// ═══════════════════════════════════════════════════════════════════════════

const INDEX = fs.readFileSync(path.join(ROOT, 'fids-current', 'index.html'), 'utf8');

test('the .app domain opens the app', () => {
  // v23808 — widened from the apex and www to EVERY host in the zone, which is
  // what makes yqm.orionconnected.app the app for Moncton rather than its
  // board. The behaviour this pins is exercised properly in mobile-offer.test.js,
  // which runs the handover against a list of hostnames instead of reading it.
  assert.match(INDEX, /h === "orionconnected\.app" \|\| \/\\\.orionconnected\\\.app\$\/\.test\(h\)/,
    'the apex plus any host in the zone — a domain that means the app at one ' +
    'level and the board a level down is a trap');
  assert.match(INDEX, /location\.replace\("\/app"/,
    'replace, not assign — the opener must not sit in history, or Back from ' +
    'the app lands on a page whose only job is to leave again');
  assert.match(INDEX, /\+ location\.search \+ location\.hash/,
    'anything the caller passed must survive the handover');
});

test('the handover is the first thing on the page', () => {
  // Ahead of the theme resolve: on .app that theme belongs to the page being
  // left, and reading it first only delays the handover by a frame.
  const app = INDEX.indexOf('orionconnected.app');
  const theme = INDEX.indexOf('fids_console_theme');
  assert.ok(app > 0 && theme > 0, 'both blocks must be present');
  assert.ok(app < theme, 'the .app handover must come before the theme resolve');
});

test('it only fires on the domain it is for', () => {
  // A substring check would send orionconnected.app.example.com to the app, and
  // an endsWith would catch any .app domain at all.
  assert.doesNotMatch(INDEX, /hostname.*\.endsWith\("\.app"\)/,
    'matching any .app domain is too broad');
  assert.doesNotMatch(INDEX, /indexOf\("orionconnected\.app"\)/,
    'a substring match would fire on orionconnected.app.example.com');
});
