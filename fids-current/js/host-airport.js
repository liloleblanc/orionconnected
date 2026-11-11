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
 * A BOARD LANDS ON ITS AIRPORT'S OWN ADDRESS  (v24144)
 *
 *   fids.orionconnected.com/fids?ap=YYG&mode=live
 *     -> https://yyg.orionconnected.com/fids?mode=live
 *
 * On fids.<zone>, and on the bare orionconnected.ca and orionconnected.app, a
 * board page (/fids, /gids, /bids, with or without .html) carrying a valid
 * ?ap= is replaced by the same page on <code>.<zone>: same path, the same
 * query without ap, the same hash. On an airport address an ?ap= naming a
 * different airport goes to the address of that airport. ?ap= still decides the
 * airport, as it always has; it now also decides the address.
 *
 * Why it matters: localStorage is per origin, so a board opened on two
 * addresses of the same airport kept two separate device copies of its
 * settings (this is how one address showed the old backdrop and the other
 * did not). One airport, one address, one copy.
 *
 * NEVER MOVED, and why:
 *   · a framed page (the rotator stream frames, the tour, Studio previews):
 *     the frame belongs to its parent, and a cross-origin hop would cut the
 *     messages the rotator sends it;
 *   · any host that is not ours (workers.dev previews, localhost, an IP), a
 *     label this file reserves, two labels, orionconnected.com and www;
 *   · a page signed in as admin on this origin (fids_token in localStorage or
 *     sessionStorage): the sign-in is per origin and stays where it is;
 *   · a registered screen (?screen=): screen.html keeps the screen id in this
 *     origin localStorage and the board falls back to /screen.html here when
 *     the screen is forgotten; moved, it would show a new pairing code;
 *   · the stream, yt and compact layouts: kiosks that keep their own settings
 *     on this origin;
 *   · a phone the phone hand-off in fids-core.js is about to take (to the
 *     opener or the app, on this origin, where its answer is stored): one hop,
 *     as before. A phone that chose the board is moved like any screen and
 *     takes nomobile=1 with it, so the new origin does not ask again.
 *
 * It cannot loop: the address it sends to carries no ap, and an airport
 * address without ?ap= never moves. airportAddress() is pure and exported as
 * window.fidsAirportAddress (tests/airport-address.test.js).
 *
 * "/" is the opener (index.html), which does not load this file: it hands a
 * display to fids.html with the same ?ap=, and that page moves it.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var ZONES = ['orionconnected.com', 'orionconnected.ca', 'orionconnected.app'];
  // Apexes that are a board site. orionconnected.com is the homepage.
  var SITE_APEX = ['orionconnected.ca', 'orionconnected.app'];
  var RESERVED = [
    'fids', 'www', 'api', 'app', 'apps', 'menu', 'admin', 'studio', 'tour',
    'screen', 'screens', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'cdn', 'assets',
    'static', 'media', 'img', 'dev', 'test', 'stage', 'staging', 'beta', 'demo',
    'proxy', 'edge', 'ns', 'mx', 'vpn', 'git', 'docs', 'blog', 'shop', 'go'
  ];
  var BOARD_PATH = /^\/(fids|gids|bids)(\.html)?\/?$/;
  // Query keys that keep a page where it is (see above).
  var STAY_KEYS = ['screen', 'stream', 'yt', 'compact'];

  function dec(s) {
    try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s); }
  }

  /**
   * Where this page belongs, or '' to stay.
   *   loc: { hostname, pathname, search, hash }   (window.location will do)
   *   ctx: { framed, admin, phone, sitePhone }
   *     framed     the page is inside a frame
   *     admin      an admin sign-in is held on this origin
   *     phone      the phone hand-off will take this page
   *     sitePhone  a phone whose stored answer is the board
   *   hostAirport, realIata: the parsers above (passed in so this stays pure)
   */
  function airportAddress(loc, ctx, hostAirport, realIata) {
    ctx = ctx || {};
    if (!loc || ctx.framed || ctx.admin || ctx.phone) return '';
    var host = String(loc.hostname || '').toLowerCase().split(':')[0];
    if (!host || !BOARD_PATH.test(String(loc.pathname || ''))) return '';
    var zone = '', here = '';
    for (var i = 0; i < ZONES.length && !zone; i++) {
      var z = ZONES[i];
      if (host === z) {
        if (SITE_APEX.indexOf(z) === -1) return '';
        zone = z;
      } else if (host.length > z.length + 1 && host.slice(-(z.length + 1)) === '.' + z) {
        var label = host.slice(0, host.length - z.length - 1);
        if (label === 'fids') { zone = z; continue; }
        here = typeof hostAirport === 'function' ? String(hostAirport(host) || '') : '';
        if (!here) return '';                     // reserved, two labels, not a code
        zone = z;
      }
    }
    if (!zone) return '';
    var raw = String(loc.search || '').replace(/^\?/, '');
    var parts = raw ? raw.split('&') : [];
    var ap = null, keep = [], hasNoMobile = false;
    for (var j = 0; j < parts.length; j++) {
      if (!parts[j]) continue;
      var eq = parts[j].indexOf('=');
      var key = dec(eq < 0 ? parts[j] : parts[j].slice(0, eq));
      if (STAY_KEYS.indexOf(key) !== -1) return '';
      if (key === 'ap') {
        if (ap === null) ap = eq < 0 ? '' : dec(parts[j].slice(eq + 1));
        continue;
      }
      if (key === 'nomobile') hasNoMobile = true;
      keep.push(parts[j]);
    }
    if (ap === null) return '';
    var code = String(ap).trim().toUpperCase();
    try { if (typeof realIata === 'function') code = String(realIata(code) || code).toUpperCase(); } catch (e) {}
    if (!/^[A-Z]{3,4}$/.test(code) || RESERVED.indexOf(code.toLowerCase()) !== -1) return '';
    if (code === here) return '';
    if (ctx.sitePhone && !hasNoMobile) keep.push('nomobile=1');
    return 'https://' + code.toLowerCase() + '.' + zone + loc.pathname
      + (keep.length ? '?' + keep.join('&') : '') + (loc.hash || '');
  }

  try { window.fidsAirportAddress = airportAddress; } catch (e) {}

  try {
    var framed = true;
    try { framed = window.top !== window.self; } catch (e) { framed = true; }
    var admin = false;
    try { admin = !!(window.localStorage.getItem('fids_token') || window.sessionStorage.getItem('fids_token')); } catch (e) {}
    var pref = '';
    try { pref = window.localStorage.getItem('oc_mobile_pref') || ''; } catch (e) {}
    var q = String(window.location.search || '');
    var ua = String((window.navigator && window.navigator.userAgent) || '');
    // the same phone test, and the same escapes, as the PHONE HANDOFF in fids-core.js
    var phoneUa = /iPhone|iPod|iPad|Windows Phone/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
    var keepsBoard = /[?&](nomobile|stream|yt|compact)([=&]|$)/.test(q) || pref === 'site';
    var to = airportAddress(window.location, {
      framed: framed,
      admin: admin,
      phone: phoneUa && !keepsBoard,
      sitePhone: phoneUa && pref === 'site'
    }, window.fidsHostAirport, window.fidsRealIata);
    if (to && to !== String(window.location.href)) {
      window.__ocAddressMove = to;
      window.location.replace(to);
    }
  } catch (e) {}
})();
