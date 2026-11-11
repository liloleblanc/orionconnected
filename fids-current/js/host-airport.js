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
 *   · an admin signed in on this origin (fids_token): sign-in is per origin,
 *     so an admin on fids.<zone> stays on fids.<zone>;
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
 * an airport address never moves to itself.
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
   *   ctx: { framed, admin, fallback, carry, demo }
   *     framed    the page is inside a frame
   *     admin     an admin sign-in is held on this origin
   *     fallback  the airport the board shows with no ?ap= (this tab, else YQM)
   *     carry     add nomobile=1: a phone already in a board, leaving the origin
   *     demo      this tab chose the demo (sessionStorage fids_mode): add
   *               mode=demo when the address names no mode, since the tab
   *               memory stays behind on this origin
   */
  function airportAddress(loc, ctx, hostAirport, realIata) {
    ctx = ctx || {};
    if (!loc || ctx.framed || ctx.admin) return '';
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
   *   ctx: { framed, admin, fallback, demo, phone, inBoard }
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
    var to = airportAddress(loc, { admin: ctx.admin, fallback: ctx.fallback, demo: ctx.demo, carry: phoneBoard && !noMobile }, hostAirport, realIata);
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
   *     a preview or local host, a frame, an admin signed in here, a pinned
   *     page (a registered screen, a kiosk), no code, or a code that makes no
   *     address (four letters).
   *   params: an object, a URLSearchParams or a query string; ap is ignored.
   *   env: { hostname, pathname, framed, admin, pinned, phoneBoard, demo }
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
    if (!z || !c || c.length !== 3 || env.framed || env.admin || env.pinned) {
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
        framed: framedNow(), admin: adminNow(), pinned: pinnedNow(),
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
    var r = arrival(window.location, {
      framed: framedNow(),
      admin: adminNow(),
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
