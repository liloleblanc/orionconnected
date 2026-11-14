/* ───────────────────────────────────────────────────────────────────────────
 * AN AIRPORT'S CODE AS PASSENGERS SEE IT  (v23937)
 *
 * Montréal Saint-Hubert is YHU to IATA, ICAO (CYHU), the feeds, FR24 and every
 * table in this codebase, and MET (Montréal Métropolitain) on every surface a
 * passenger reads. Its own terminal and Moncton's airport both print MET, so
 * a board that printed YHU beside them disagreed with the airport about its
 * own name.
 *
 * THIS IS THE ONE TABLE. It lives here because this file is the first script
 * every board (fids, gids, bids) and the companion app load, so even the
 * boot splash, which runs before fids-core.js exists, reads the same answer.
 * Every lookup (coordinates, weather, feeds, FR24, gate files, emblem maps)
 * keeps the real code; only the letters printed for people change.
 *
 *   fidsDisplayIata('YHU') -> 'MET'   any other code comes back unchanged
 *   fidsRealIata('MET')    -> 'YHU'   for reading our own labels back in
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var DISPLAY = { YHU: 'MET' };
  function up(code) { return String(code == null ? '' : code).toUpperCase().trim(); }
  try {
    window.FIDS_DISPLAY_IATA = DISPLAY;
    window.fidsDisplayIata = function (code) {
      return Object.prototype.hasOwnProperty.call(DISPLAY, up(code)) ? DISPLAY[up(code)] : code;
    };
    window.fidsRealIata = function (code) {
      var c = up(code);
      for (var k in DISPLAY) {
        if (Object.prototype.hasOwnProperty.call(DISPLAY, k) && DISPLAY[k] === c) return k;
      }
      return code;
    };
  } catch (e) {}
})();

/* ───────────────────────────────────────────────────────────────────────────
 * HOST → AIRPORT  (v23803)
 *
 * yqm.orionconnected.com shows Moncton. yhz.orionconnected.ca shows Halifax.
 *
 * Every board already resolves its airport the same way:
 *
 *     ?ap=  ||  sessionStorage.fids_airport  ||  'YQM'
 *
 * so this fills in the MIDDLE and changes nothing else. ?ap= still wins, which
 * is not an accident: the screen registry re-assigns a display by navigating to
 * an explicit ?ap=, and a hostname that outranked it would drag a re-assigned
 * screen back to whatever airport its address happens to be named after.
 *
 * Runs before anything reads the airport, which is why it is a separate file
 * loaded first rather than a line inside fids-core.js.
 *
 * THE TRAP THIS EXISTS TO AVOID: 'fids', 'app', 'api' and 'www' are all three
 * or four letters, so a naive parser reads fids.orionconnected.com as an
 * airport called FIDS and shows an empty board on the main site. Labels that
 * are ours are listed below and are never airports.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // Our own hostnames. Anything here is a site, not an airport.
  var RESERVED = [
    'fids', 'www', 'api', 'app', 'apps', 'menu', 'admin', 'studio', 'tour',
    'screen', 'screens', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'cdn', 'assets',
    'static', 'media', 'img', 'dev', 'test', 'stage', 'staging', 'beta', 'demo',
    'proxy', 'edge', 'ns', 'mx', 'vpn', 'git', 'docs', 'blog', 'shop', 'go'
  ];

  // The zones we own. A subdomain of anything else is not ours to interpret.
  var ZONES = ['.orionconnected.com', '.orionconnected.ca', '.orionconnected.app'];

  function hostAirport(hostname) {
    var host = String(hostname || '').toLowerCase().split(':')[0];
    if (!host) return '';
    var zone = '';
    for (var i = 0; i < ZONES.length; i++) {
      if (host.length > ZONES[i].length && host.slice(-ZONES[i].length) === ZONES[i]) {
        zone = ZONES[i];
        break;
      }
    }
    if (!zone) return '';                       // localhost, a preview URL, anything else
    var label = host.slice(0, host.length - zone.length);
    // Only a single label. yqm.gate2.orionconnected.com is not an airport, and
    // Universal SSL does not cover a second level anyway, so it could not be
    // reached over https even if it were.
    if (label.indexOf('.') !== -1) return '';
    if (RESERVED.indexOf(label) !== -1) return '';
    if (!/^[a-z0-9]{3,4}$/.test(label)) return '';
    // v24144 — the letters passengers see read back as the real code, so
    // met.orionconnected.com is Saint-Hubert (YHU), not an empty board for an
    // airport called MET. The address a board is SENT to uses the real code
    // (yhu.orionconnected.com), which needs no mapping at all.
    var code = label.toUpperCase();
    try {
      if (typeof window.fidsRealIata === 'function') code = String(window.fidsRealIata(code) || code).toUpperCase();
    } catch (e) {}
    return code;
  }

  try {
    var code = hostAirport(window.location.hostname);
    if (code) {
      // Only as the DEFAULT. An explicit ?ap= is the caller saying what they
      // want, and it must keep winning.
      try { sessionStorage.setItem('fids_airport', code); } catch (e) {}
      // The ADDRESS is the request. A board reached this way must not quietly
      // become a tour of other airports when this one has no feed — the URL
      // would say one airport and the screen would show another. Read by the
      // dead-board rescue in fids-core.js.
      window.__ocFromHost = code;
    }
    // Exposed so a board, a test or the console can ask the same question
    // rather than re-implementing the parse — which is how the studio's copy
    // came to read fids.orionconnected.com as an airport.
    window.fidsHostAirport = hostAirport;
  } catch (e) {}
})();


/* ───────────────────────────────────────────────────────────────────────────
 * THE SIGN-IN TRAVELS WITH THE ADMIN ACROSS THE ADDRESSES OF A ZONE
 *
 * An admin sign-in is a bearer token (fids_token, with the small user record
 * fids_user) kept in localStorage and sessionStorage, and storage belongs to
 * one origin: yul.orionconnected.com cannot read what yqm.orionconnected.com
 * holds. An admin therefore could not follow the address rule below without
 * being signed out at every airport, and was made an exception to it. The
 * people who run the boards work signed in, so for them the rule never held:
 * yqm.orionconnected.com/gids?ap=YUL&gate=128 stayed on the Moncton address.
 *
 * So the sign-in is ALSO kept in one cookie on the zone the page is on, and
 * then an admin moves exactly as a visitor does:
 *
 *   __Secure-fids_signin=<token>|<user record>; Domain=orionconnected.com;
 *       Path=/; Max-Age=<seconds the token has left>; Secure; SameSite=Strict
 *
 *   · Domain is orionconnected.com on orionconnected.com and its one-label
 *     hosts, orionconnected.ca on the .ca ones: one cookie per zone, since no
 *     cookie spans two registrable domains (signing in on .com does not sign
 *     in on .ca). NOWHERE ELSE. On a preview (workers.dev), localhost, an IP,
 *     a file page, and on the .app zone (the phone app: no page there signs
 *     in) nothing is written and nothing is read: the sign-in stays in the
 *     storage of its origin and the admin exception of the address rule
 *     stands, as before.
 *   · It ends when the token does (its exp claim). A token whose expiry
 *     cannot be read is kept one hour at a time. An expired token is never
 *     written and never taken.
 *   · It CANNOT be HttpOnly: the page itself reads the token, to send it as
 *     the Authorization bearer header to the proxy host. That header stays
 *     the only thing the server trusts, so nothing about how a request is
 *     authorised changes. The proxy host never receives this cookie (it is
 *     another site). The browser does send it with every request for a page
 *     or a file of our own zone, where nothing reads it: the board worker
 *     serves files and knows no sign-in. The token was readable by script in
 *     the storage of one origin and is now readable by the pages of every
 *     host of the zone, so every host of the zone must be ours.
 *   · The token is never put in an address, a query, a hash or a log line.
 *
 * THIS BLOCK IS THE ONLY CODE THAT TOUCHES document.cookie FOR THE SIGN-IN:
 *   arrive  on every page load, as this file runs (first in the head; at
 *           the foot of the opener, ahead of auth.js), before anything reads
 *           the token and before the address rule decides where the page
 *           belongs:
 *             · the cookie says signed out: the copies on this origin go;
 *             · the cookie holds a live token: both storage copies take it
 *               (an origin with none, or with another one: the zone has one
 *               sign-in);
 *             · no cookie, a live token in storage: the cookie is written, so
 *               a sign-in made before this existed starts travelling without
 *               signing in again.
 *   keep    a sign-in was just made (auth.js saveToken, the board login in
 *           fids-core.js): write the cookie.
 *   end     the admin signed out (auth.js logout): the copies on this origin
 *           go and the cookie becomes a signed-out mark, which every other
 *           origin of the zone obeys at its next page load. A mark and not a
 *           plain delete: the other origins still hold the live token in
 *           their own storage, and with no cookie at all they would write it
 *           straight back.
 *   drop    a dead token was found (the rescues in fids-core.js and menu.js,
 *           auth.js loadToken): the copies on this origin go, and the cookie
 *           goes only if it holds that same token or a dead one. A newer
 *           sign-in made on another address is not ended by an old tab.
 *   travels the sign-in of this page is in the cookie of the zone, read back
 *           from the cookie jar itself. Where cookies are refused it is
 *           false, and the admin stays an exception to the address rule.
 *
 * tests/zone-sign-in.test.js runs this file against a stubbed window.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // The zones the boards are on. Never .app: it is the phone app only.
  var ZONES = ['orionconnected.com', 'orionconnected.ca'];
  var NAME = '__Secure-fids_signin';
  var TOKEN_KEY = 'fids_token';
  var USER_KEY = 'fids_user';
  var OUT = 'out';
  var SHORT = 3600;             // seconds, for a token whose expiry cannot be read
  var OUT_AGE = 34560000;       // 400 days, the longest a browser keeps a cookie
  var USER_MAX = 1024;          // a user record longer than this stays behind
  var VALUE_MAX = 3800;         // a browser refuses a cookie past about 4096 bytes
  var SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

  /** The zone a host is on ('' when it is not ours, or is .app). */
  function zoneFor(hostname) {
    var host = String(hostname || '').toLowerCase().split(':')[0];
    for (var i = 0; i < ZONES.length; i++) {
      var z = ZONES[i];
      if (host === z) return z;
      if (host.length > z.length + 1 && host.slice(-(z.length + 1)) === '.' + z) {
        return /^[a-z0-9-]+$/.test(host.slice(0, host.length - z.length - 1)) ? z : '';
      }
    }
    return '';
  }
  function shaped(token) { return typeof token === 'string' && token.length < 3000 && SHAPE.test(token); }
  /** When the token ends, in seconds since 1970; 0 when that cannot be read. */
  function expiryOf(token) {
    try {
      var p = JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      var exp = p ? Number(p.exp) : 0;
      return exp > 0 && isFinite(exp) ? exp : 0;
    } catch (e) { return 0; }
  }
  /** A token that may be kept: its shape is right and it has not expired. */
  function live(token, nowMs) {
    if (!shaped(token)) return false;
    var exp = expiryOf(token);
    return !exp || exp > nowMs / 1000;
  }
  function userOf(text) {
    try {
      var s = String(text || '');
      if (!s || s.length > USER_MAX) return '';
      var u = JSON.parse(s);
      return u && typeof u === 'object' ? s : '';
    } catch (e) { return ''; }
  }
  function attrs(zone, age) {
    return '; Domain=' + zone + '; Path=/; Max-Age=' + age + '; Secure; SameSite=Strict';
  }
  /** The cookie that keeps a sign-in on the zone of a host, or '' for none. */
  function cookieFor(hostname, token, user, nowMs) {
    var zone = zoneFor(hostname);
    if (!zone || !live(token, nowMs)) return '';
    var exp = expiryOf(token);
    var age = exp ? Math.floor(exp - nowMs / 1000) : SHORT;
    if (age < 1) return '';
    var u = userOf(user);
    var value = token + (u ? '|' + encodeURIComponent(u) : '');
    if (value.length > VALUE_MAX) value = token;   // the record stays behind; the token is what signs in
    return NAME + '=' + value + attrs(zone, age);
  }
  /** The signed-out mark of a zone, and the plain removal of its cookie. */
  function outCookieFor(hostname) {
    var zone = zoneFor(hostname);
    return zone ? NAME + '=' + OUT + attrs(zone, OUT_AGE) : '';
  }
  function goneCookieFor(hostname) {
    var zone = zoneFor(hostname);
    return zone ? NAME + '=' + attrs(zone, 0) : '';
  }
  /** What the cookie jar holds: { out } | { token, user } | null. */
  function read(cookies) {
    var all = String(cookies || '').split(';');
    for (var i = 0; i < all.length; i++) {
      var c = all[i].replace(/^\s+/, '');
      if (c.indexOf(NAME + '=') !== 0) continue;
      var v = c.slice(NAME.length + 1);
      if (v === OUT) return { out: true };
      var bar = v.indexOf('|');
      var token = bar < 0 ? v : v.slice(0, bar);
      if (!shaped(token)) return null;
      var user = '';
      if (bar >= 0) { try { user = userOf(decodeURIComponent(v.slice(bar + 1))); } catch (e) { user = ''; } }
      return { token: token, user: user };
    }
    return null;
  }

  // ── this page ────────────────────────────────────────────────────────────
  function host() { try { return window.location.hostname; } catch (e) { return ''; } }
  function jar() { try { return String(window.document.cookie || ''); } catch (e) { return ''; } }
  function bake(cookie) { try { if (cookie) window.document.cookie = cookie; } catch (e) {} }
  function stores() {
    var out = [];
    try { if (window.localStorage) out.push(window.localStorage); } catch (e) {}
    try { if (window.sessionStorage) out.push(window.sessionStorage); } catch (e) {}
    return out;
  }
  /** The sign-in of this origin: the durable copy first, as every reader does. */
  function held() {
    var s = stores(), token = '', user = '';
    for (var i = 0; i < s.length && !token; i++) {
      try { token = s[i].getItem(TOKEN_KEY) || ''; user = token ? (s[i].getItem(USER_KEY) || '') : ''; } catch (e) { token = ''; }
    }
    return { token: token, user: user };
  }
  function put(token, user) {
    var s = stores();
    for (var i = 0; i < s.length; i++) {
      try {
        s[i].setItem(TOKEN_KEY, token);
        if (user) s[i].setItem(USER_KEY, user); else s[i].removeItem(USER_KEY);
      } catch (e) {}
    }
  }
  function wipe() {
    var s = stores();
    for (var i = 0; i < s.length; i++) {
      try { s[i].removeItem(TOKEN_KEY); s[i].removeItem(USER_KEY); } catch (e) {}
    }
  }

  function arrive() {
    if (!zoneFor(host())) return;
    var now = Date.now();
    var c = read(jar());
    var h = held();
    if (c && c.out) { if (h.token) wipe(); return; }
    if (c && live(c.token, now)) { if (h.token !== c.token) put(c.token, c.user); return; }
    if (live(h.token, now)) bake(cookieFor(host(), h.token, h.user, now));
    else if (c) bake(goneCookieFor(host()));      // a dead token is not kept
  }
  function travels() {
    try {
      if (!zoneFor(host())) return false;
      var token = held().token;
      if (!token) return false;                     // a visitor: the jar is not even read
      var c = read(jar());
      return !!(c && c.token === token && live(token, Date.now()));
    } catch (e) { return false; }
  }
  function keep(token, user) {
    try { bake(cookieFor(host(), token, user, Date.now())); } catch (e) {}
    return travels();
  }
  function end() {
    wipe();
    bake(outCookieFor(host()));
  }
  function drop(token) {
    wipe();
    try {
      var c = read(jar());
      if (c && c.token && (c.token === token || !live(c.token, Date.now()))) bake(goneCookieFor(host()));
    } catch (e) {}
  }

  try {
    window.fidsSignIn = {
      NAME: NAME, zoneFor: zoneFor, cookieFor: cookieFor, outCookieFor: outCookieFor, goneCookieFor: goneCookieFor, read: read,
      arrive: arrive, travels: travels, keep: keep, end: end, drop: drop
    };
  } catch (e) {}
  try { arrive(); } catch (e) {}
})();


/* ───────────────────────────────────────────────────────────────────────────
 * EVERY BOARD LIVES ON ITS AIRPORT ADDRESS  (v24144, strict since v24145)
 *
 *   fids.orionconnected.com/fids?ap=YYG&mode=live
 *     -> https://yyg.orionconnected.com/fids?mode=live
 *
 * .com AND .ca ARE THE BOARDS. A board page (/fids, /gids, /bids, with or
 * without .html) is shown on <code>.<zone> and nowhere else:
 *   · on fids.<zone>, www.<zone> and the apex, a board goes to the address of
 *     its airport: the ?ap= it carries, or with no ?ap= the airport the board
 *     would fall back to (this tab's airport, else YQM);
 *   · on an airport address, an ?ap= naming another airport goes to that
 *     airport's address; met.<zone> goes to yhu.<zone> (one airport, one
 *     address, one copy of its settings);
 *   · the path loses .html and any trailing slash (the host does that with a
 *     redirect of its own, which would be a second hop), and every other
 *     parameter and the hash come along untouched;
 *   · an address is made from a three-letter code only. A four-letter ?ap=
 *     (an ICAO code such as CYQM or KJFK) makes no address: no table that
 *     maps it is loaded this early, so the page stays where it is and the
 *     board resolves the code, as it always has.
 *
 * .app IS THE PHONE APP ONLY. On orionconnected.app, fids.orionconnected.app
 * and <code>.orionconnected.app, "/" and every board page show /app on the
 * same host, carrying ap (from the query or the address), screen, gate and
 * belt, the four things app.html reads. Desktop or phone. The two kinds of
 * page that are never moved on .com and .ca stay boards on .app as well: a
 * registered screen and the stream, yt and compact kiosks (below).
 *
 * NEVER MOVED, because moving would break them:
 *   · a framed page (the rotator stream frames, the tour, Studio previews):
 *     a frame belongs to its parent, on its parent origin;
 *   · a preview or local host (workers.dev, localhost, an IP): not ours;
 *   · a registered screen (?screen=<six-character registry id>): screen.html
 *     keeps the id in this origin storage and a forgotten screen goes back to
 *     /screen.html here. ?screen=gate or ?screen=baggage is a sub-screen of a
 *     board, not a registry id, and moves like any board link;
 *   · an admin whose sign-in cannot travel (fids_token): storage is per
 *     origin, so where the sign-in is not in the cookie of the zone (a
 *     browser that refuses cookies; the block above) an admin on fids.<zone>
 *     stays on fids.<zone>. Where it is in that cookie, on .com and .ca, an
 *     admin is no exception and moves exactly as a visitor does;
 *   · the stream, yt and compact kiosk layouts, which keep their settings in
 *     this origin storage.
 * A registered screen and a kiosk are pinned: the link helper answers them
 * with a relative link, so choosing another airport or a gate inside one
 * stays on its origin too.
 *
 * PHONES ON .com AND .ca ARE ASKED, EVERY ARRIVAL. A phone that arrives at a
 * board from anywhere but another of our board pages in this tab is asked
 * board or app; nothing remembered across visits decides any more. The tab
 * remembers, per origin, that a board was shown (sessionStorage oc_board_tab),
 * so a tap inside a board (a row, a gate, the menu) is never asked again.
 * Leaving the origin, the answer travels as nomobile=1 (fidsBoardUrl adds it,
 * and so does a move). Only nomobile=1 is that answer, here and in the
 * viewport script of each board: any other value is not. A kiosk is never
 * asked and never takes the tab memory for an answer. The question is asked on the address the board belongs
 * to, in the same hop as the move, so a move never asks twice and never
 * skips the question a fresh arrival is owed.
 *
 * Everything here is pure and exported (tests/strict-addresses.test.js):
 *   fidsAirportAddress(loc, ctx, hostAirport, realIata)  the board address
 *   fidsAppAddress(loc, hostAirport, realIata)           the .app mapping
 *   fidsArrival(loc, ctx, hostAirport, realIata)         both, plus the phone
 *   fidsBoardUrlFor(code, page, params, env, ...)        the link builder
 *   fidsBoardUrl(code, page, params)                     the same, for this page
 * It cannot loop: an address it sends a board to is that board address, and
 * an airport address never moves to itself. An admin is moved only once the
 * sign-in is in the cookie of the zone (fidsSignIn.arrive runs first, above),
 * and arrives signed in on an address that, like any other, stays.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var ZONES = ['orionconnected.com', 'orionconnected.ca', 'orionconnected.app'];
  var APP_ZONE = 'orionconnected.app';
  // Board sites that are not an airport: the apex, fids. and www.
  var SITE_LABELS = ['', 'fids', 'www'];
  var RESERVED = [
    'fids', 'www', 'api', 'app', 'apps', 'menu', 'admin', 'studio', 'tour',
    'screen', 'screens', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'cdn', 'assets',
    'static', 'media', 'img', 'dev', 'test', 'stage', 'staging', 'beta', 'demo',
    'proxy', 'edge', 'ns', 'mx', 'vpn', 'git', 'docs', 'blog', 'shop', 'go'
  ];
  var BOARD_PATH = /^\/(fids|gids|bids)(\.html)?\/?$/;
  // The screen registry id, exactly as fids-core.js (_fidsScreenId) reads it.
  var REGISTRY_ID = /^[A-HJ-NP-Z2-9]{6}$/;
  var KIOSK_KEYS = ['stream', 'yt', 'compact'];
  // The same three keys, read off the raw query exactly as the viewport
  // script of fids, gids and bids reads them (tests hold the two together).
  var KIOSK = /[?&](stream|yt|compact)([=&]|$)/;
  // The board answer of a phone. Only this exact pair counts, everywhere.
  var NO_MOBILE = /[?&]nomobile=1(&|$)/;
  // What app.html reads from its address.
  var APP_KEYS = ['ap', 'screen', 'gate', 'belt'];

  function dec(s) {
    try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s); }
  }
  function parts(search) {
    var raw = String(search || '').replace(/^\?/, '');
    var out = [];
    if (!raw) return out;
    var bits = raw.split('&');
    for (var i = 0; i < bits.length; i++) {
      if (!bits[i]) continue;
      var eq = bits[i].indexOf('=');
      out.push({ raw: bits[i], key: dec(eq < 0 ? bits[i] : bits[i].slice(0, eq)), val: eq < 0 ? '' : dec(bits[i].slice(eq + 1)) });
    }
    return out;
  }
  /** { zone, label } for a host of ours ('' label for the apex), else null. */
  function zoneOf(hostname) {
    var host = String(hostname || '').toLowerCase().split(':')[0];
    if (!host) return null;
    for (var i = 0; i < ZONES.length; i++) {
      var z = ZONES[i];
      if (host === z) return { zone: z, label: '' };
      if (host.length > z.length + 1 && host.slice(-(z.length + 1)) === '.' + z) {
        var label = host.slice(0, host.length - z.length - 1);
        if (label.indexOf('.') !== -1) return null;   // two labels: not an address of ours
        return { zone: z, label: label };
      }
    }
    return null;
  }
  /** The real airport code for a value, or '' when it cannot be one. */
  function codeOf(v, realIata) {
    var c = String(v == null ? '' : v).trim().toUpperCase();
    try { if (c && typeof realIata === 'function') c = String(realIata(c) || c).toUpperCase(); } catch (e) {}
    if (!/^[A-Z]{3,4}$/.test(c) || RESERVED.indexOf(c.toLowerCase()) !== -1) return '';
    return c;
  }
  function pageOf(pathname) {
    var m = BOARD_PATH.exec(String(pathname || ''));
    return m ? m[1] : '';
  }
  function hostCode(z, hostAirport) {
    if (!z || SITE_LABELS.indexOf(z.label) !== -1) return '';
    try { return typeof hostAirport === 'function' ? String(hostAirport(z.label + '.' + z.zone) || '') : ''; } catch (e) { return ''; }
  }

  /**
   * The address this board page belongs on, or '' to stay (.com and .ca).
   *   loc: { hostname, pathname, search, hash }   (window.location will do)
   *   ctx: { framed, admin, travels, fallback, carry, demo }
   *     framed    the page is inside a frame
   *     admin     an admin sign-in is held on this origin
   *     travels   that sign-in is in the cookie of the zone (fidsSignIn), so
   *               it is there on every address of the zone: the admin moves
   *     fallback  the airport the board shows with no ?ap= (this tab, else YQM)
   *     carry     add nomobile=1: a phone already in a board, leaving the origin
   *     demo      this tab chose the demo (sessionStorage fids_mode): add
   *               mode=demo when the address names no mode, since the tab
   *               memory stays behind on this origin
   */
  function airportAddress(loc, ctx, hostAirport, realIata) {
    ctx = ctx || {};
    if (!loc || ctx.framed || (ctx.admin && !ctx.travels)) return '';
    var z = zoneOf(loc.hostname);
    if (!z || z.zone === APP_ZONE) return '';
    var page = pageOf(loc.pathname);
    if (!page) return '';
    var here = '';
    if (SITE_LABELS.indexOf(z.label) === -1) {
      if (RESERVED.indexOf(z.label) !== -1) return '';
      here = hostCode(z, hostAirport);
      if (!here) return '';                       // not a code: not an address of ours
    }
    var q = parts(loc.search);
    var ap = null, keep = [], hasNoMobile = false, hasMode = false;
    for (var j = 0; j < q.length; j++) {
      var k = q[j].key;
      if (KIOSK_KEYS.indexOf(k) !== -1) return '';
      if (k === 'mode') hasMode = true;
      if (k === 'screen' && REGISTRY_ID.test(q[j].val)) return '';
      if (k === 'ap') { if (ap === null) ap = q[j].val; continue; }
      if (k === 'nomobile' && q[j].val === '1') hasNoMobile = true;
      keep.push(q[j].raw);
    }
    var code;
    if (ap !== null && String(ap).trim() !== '') {
      code = codeOf(ap, realIata);
      if (!code) return '';                       // a code the board cannot show: leave it be
      if (code.length !== 3) return '';           // ICAO: no address is made, the board resolves it
    } else if (here) {
      code = here;
    } else {
      code = codeOf(ctx.fallback, realIata);
      if (!code || code.length !== 3) return '';
    }
    if (here && code === here && z.label === code.toLowerCase()) return '';
    if (ctx.demo && !hasMode) keep.push('mode=demo');
    if (ctx.carry && !hasNoMobile) keep.push('nomobile=1');
    return 'https://' + code.toLowerCase() + '.' + z.zone + '/' + page
      + (keep.length ? '?' + keep.join('&') : '') + (loc.hash || '');
  }

  /** On .app: "/" and every board page go to /app on the same host, else ''. */
  function appAddress(loc, hostAirport, realIata) {
    if (!loc) return '';
    var z = zoneOf(loc.hostname);
    if (!z || z.zone !== APP_ZONE) return '';
    var path = String(loc.pathname || '/');
    var page = pageOf(path);
    if (!page && path !== '/' && path !== '/index.html') return '';
    var q = parts(loc.search);
    if (page) {
      // A board page that is pinned to its origin stays a board, here as on
      // .com and .ca. "/" is the opener and is always the app.
      for (var p = 0; p < q.length; p++) {
        if (KIOSK_KEYS.indexOf(q[p].key) !== -1) return '';
        if (q[p].key === 'screen' && REGISTRY_ID.test(q[p].val)) return '';
      }
    }
    var seen = {}, out = [], ap = '';
    for (var j = 0; j < q.length; j++) {
      var k = q[j].key;
      if (APP_KEYS.indexOf(k) === -1 || seen[k]) continue;
      if (k === 'ap') {
        var c = codeOf(q[j].val, realIata);
        if (!c) continue;
        seen.ap = true; ap = c;
        continue;
      }
      if (k === 'screen' && REGISTRY_ID.test(q[j].val)) continue;
      seen[k] = true;
      out.push(q[j].raw);
    }
    if (!ap) ap = hostCode(z, hostAirport);
    if (!seen.screen && page === 'gids') out.push('screen=gate');
    if (!seen.screen && page === 'bids') out.push('screen=baggage');
    if (ap) out.unshift('ap=' + ap);
    return '/app' + (out.length ? '?' + out.join('&') : '') + (loc.hash || '');
  }

  /**
   * One decision for a page that has just loaded: where it goes, if anywhere.
   *   ctx: { framed, admin, travels, fallback, demo, phone, inBoard }
   *     phone     a phone user agent (the same test the hand-off always used)
   *     inBoard   this tab has shown a board on this origin (oc_board_tab)
   * Returns { to, mark, phoneBoard }:
   *   to          the address to replace this page with, or ''
   *   mark        this is a board page that stays: remember it for the tab
   *   phoneBoard  a phone showing the wall board (it chose it, or is in one)
   */
  function arrival(loc, ctx, hostAirport, realIata) {
    ctx = ctx || {};
    var none = { to: '', mark: false, phoneBoard: false };
    if (!loc || ctx.framed) return none;
    var app = appAddress(loc, hostAirport, realIata);
    if (app) return { to: app, mark: false, phoneBoard: false };
    var z = zoneOf(loc.hostname);
    if (z && z.zone === APP_ZONE) return none;    // anything else on .app is left alone
    var page = pageOf(loc.pathname);
    if (!page) return none;
    var search = String(loc.search || '');
    // The same reading as the viewport script of the page: nomobile=1 is the
    // board answer wherever it is; the tab memory is one too, except on a
    // kiosk and except when ?mobile=ask asks again. A kiosk is never asked.
    var kiosk = KIOSK.test(search);
    var noMobile = NO_MOBILE.test(search);
    var askAgain = /[?&]mobile=ask(&|$)/.test(search);
    var phone = !!ctx.phone;
    var phoneBoard = phone && (noMobile || (!kiosk && !!ctx.inBoard && !askAgain));
    var to = airportAddress(loc, { admin: ctx.admin, travels: ctx.travels, fallback: ctx.fallback, demo: ctx.demo, carry: phoneBoard && !noMobile }, hostAirport, realIata);
    if (phone && !kiosk && !phoneBoard) {
      // A fresh arrival: the question, on the address the board belongs to.
      // The opener takes the board link in ?next= (a board page on its own
      // origin) and lands either answer there.
      var origin = '', rest = String(loc.pathname).replace(/\/$/, '') + search, hash = loc.hash || '', code = '';
      if (to) {
        var cut = to.indexOf('/', 8);
        origin = to.slice(0, cut);
        rest = to.slice(cut);
        code = origin.replace(/^https:\/\//, '').split('.')[0].toUpperCase();
      } else {
        var ap0 = null, qp = parts(search);
        for (var i = 0; i < qp.length; i++) if (qp[i].key === 'ap') { ap0 = qp[i].val; break; }
        code = codeOf(ap0, realIata) || hostCode(z, hostAirport);
      }
      var h = rest.indexOf('#');
      if (h >= 0) rest = rest.slice(0, h);
      rest = rest.replace(/([?&])mobile=ask(&|$)/, function (m, a, b) { return b ? a : ''; }).replace(/[?&]$/, '');
      return { to: origin + '/?' + (code ? 'ap=' + code + '&' : '') + 'next=' + encodeURIComponent(rest) + hash, mark: false, phoneBoard: false };
    }
    return { to: to, mark: !to, phoneBoard: phoneBoard };
  }

  /**
   * The link to a board page of an airport, from a page on `env`:
   *   https://<code>.<zone>/<page>?<params>   on .com and .ca (and .com from .app)
   *   <page>.html?ap=<code>&<params>          where a page cannot leave its origin:
   *     a preview or local host, a frame, an admin whose sign-in cannot
   *     travel, a pinned page (a registered screen, a kiosk), no code, or a
   *     code that makes no address (four letters).
   *   params: an object, a URLSearchParams or a query string; ap is ignored.
   *   env: { hostname, pathname, framed, admin, travels, pinned, phoneBoard, demo }
   *     admin and travels as for fidsAirportAddress: an admin leaves only
   *     from .com or .ca, and only when the sign-in is in the zone cookie.
   * To another origin, the memory of the tab travels in the link: a phone
   * showing the board takes nomobile=1, so the tap is not taken for a fresh
   * arrival there, and a tab in the demo takes mode=demo when the link names
   * no mode, so another airport opens in the demo too.
   */
  function boardUrlFor(code, page, params, env, realIata) {
    env = env || {};
    var p = pageOf('/' + String(page || '').replace(/^\//, '')) || 'fids';
    var c = codeOf(code, realIata);
    var q = [];
    try {
      if (typeof params === 'string') {
        var ps = parts(params);
        for (var i = 0; i < ps.length; i++) if (ps[i].key !== 'ap') q.push(ps[i].raw);
      } else if (params && typeof params.forEach === 'function' && typeof params.get === 'function') {
        params.forEach(function (v, k) { if (k !== 'ap') q.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); });
      } else if (params) {
        for (var k in params) {
          if (!Object.prototype.hasOwnProperty.call(params, k) || k === 'ap') continue;
          var v = params[k];
          if (v === undefined || v === null || v === false || v === '') continue;
          q.push(encodeURIComponent(k) + '=' + encodeURIComponent(v === true ? '1' : String(v)));
        }
      }
    } catch (e) {}
    var z = zoneOf(env.hostname);
    var kept = !!env.admin && !(env.travels && z && z.zone !== APP_ZONE);
    if (!z || !c || c.length !== 3 || env.framed || kept || env.pinned) {
      return p + '.html' + ((c || q.length) ? '?' : '') + (c ? 'ap=' + c : '') + (c && q.length ? '&' : '') + q.join('&');
    }
    var zone = z.zone === APP_ZONE ? 'orionconnected.com' : z.zone;
    var host = c.toLowerCase() + '.' + zone;
    var away = host !== String(env.hostname || '').toLowerCase().split(':')[0];
    var joined = q.join('&');
    if (away && env.demo && !/(^|&)mode(=|&|$)/.test(joined)) q.push('mode=demo');
    if (away && env.phoneBoard && !/(^|&)nomobile=1(&|$)/.test(joined)) q.push('nomobile=1');
    return 'https://' + host + '/' + p + (q.length ? '?' + q.join('&') : '');
  }

  try {
    window.fidsAirportAddress = airportAddress;
    window.fidsAppAddress = appAddress;
    window.fidsArrival = arrival;
    window.fidsBoardUrlFor = boardUrlFor;
  } catch (e) {}

  function framedNow() {
    try { return window.top !== window.self; } catch (e) { return true; }
  }
  function adminNow() {
    try { return !!(window.localStorage.getItem('fids_token') || window.sessionStorage.getItem('fids_token')); } catch (e) { return false; }
  }
  /** The sign-in of this page is in the cookie of the zone (the block above): it travels. */
  function travelsNow() {
    try { return !!(window.fidsSignIn && window.fidsSignIn.travels()); } catch (e) { return false; }
  }
  /** This page is a registered screen or a kiosk: it keeps its origin. */
  function pinnedNow() {
    try {
      var q = parts(window.location.search);
      for (var i = 0; i < q.length; i++) {
        if (KIOSK_KEYS.indexOf(q[i].key) !== -1) return true;
        if (q[i].key === 'screen' && REGISTRY_ID.test(q[i].val)) return true;
      }
    } catch (e) {}
    return false;
  }
  /** This tab shows the demo: the address says so, or with no mode there, the tab does. */
  function demoNow() {
    try {
      var q = parts(window.location.search);
      for (var i = 0; i < q.length; i++) if (q[i].key === 'mode' && q[i].val) return q[i].val === 'demo';
      return window.sessionStorage.getItem('fids_mode') === 'demo';
    } catch (e) { return false; }
  }
  /**
   * The last check before a page is replaced: the destination, read as a URL,
   * is this origin or an https address on one of our zones. Every address
   * built above already is; this holds whatever a later change builds.
   */
  function ownAddress(to) {
    try {
      var u = new URL(String(to), window.location.href);
      if (u.origin === new URL(window.location.href).origin) return true;
      return u.protocol === 'https:' && !!zoneOf(u.hostname);
    } catch (e) { return false; }
  }
  try {
    window.fidsBoardUrl = function (code, page, params) {
      return boardUrlFor(code, page, params, {
        hostname: window.location.hostname, pathname: window.location.pathname,
        framed: framedNow(), admin: adminNow(), travels: travelsNow(), pinned: pinnedNow(),
        phoneBoard: window.__ocPhoneBoard === true, demo: demoNow()
      }, window.fidsRealIata);
    };
  } catch (e) {}

  try {
    var ua = String((window.navigator && window.navigator.userAgent) || '');
    var fallback = '', inBoard = false, demo = false;
    try { fallback = window.sessionStorage.getItem('fids_airport') || ''; } catch (e) {}
    try { demo = window.sessionStorage.getItem('fids_mode') === 'demo'; } catch (e) {}
    try { inBoard = window.sessionStorage.getItem('oc_board_tab') === '1'; } catch (e) {}
    // The opener (index.html) has its own router in its head and loads this
    // file at its foot for the sign-in only: nothing is decided for it here.
    var r = window.__ocOpener === true ? { to: '', mark: false, phoneBoard: false } : arrival(window.location, {
      framed: framedNow(),
      // fidsSignIn.arrive has already run (the block above): a sign-in made
      // on another address of the zone is in the storage of this one by now,
      // and one held only here is in the cookie, before this decides a move
      admin: adminNow(),
      travels: travelsNow(),
      fallback: fallback || 'YQM',
      demo: demo,
      // the same phone test as the opener and the hand-off: bare Android is a television
      phone: /iPhone|iPod|iPad|Windows Phone/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua)),
      inBoard: inBoard
    }, window.fidsHostAirport, window.fidsRealIata);
    // The decision is made here, in the head, for every page that loads this
    // file; the hand-off in fids-core.js stands down when it sees it.
    window.__ocArrival = r;
    if (r.phoneBoard) window.__ocPhoneBoard = true;
    if (r.mark) { try { window.sessionStorage.setItem('oc_board_tab', '1'); } catch (e) {} }
    if (r.to && r.to !== String(window.location.href) && ownAddress(r.to)) {
      window.__ocAddressMove = r.to;
      window.location.replace(r.to);
    }
  } catch (e) {}
})();
