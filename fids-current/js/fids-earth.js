/* ═══════════════════════════════════════════════════════════════════════════
   fids-earth.js — EARTH, NOW: THE BOTTOM OF THE DEPARTURES AND ARRIVALS

   The space under the flight rows (tall at a small airport, a thin strip at a
   busy one) is a window onto the planet as it is this minute, seen from
   orbit: lit where the sun really is, the cities' lights on the night side,
   today's flights from this airport drawn across it, each place named the
   way its row names it, with the time it is there now. It replaces the
   Moncton skyline and the world-network picture at every airport (both stay
   in the stylesheet, behind the switch, for rollback).

   THE PICTURES are NASA's: Blue Marble Next Generation by day (one per month,
   the airport's own month), Black Marble 2016 by night. Public domain; no
   NASA insignia, nothing that implies endorsement; credited on the Credits
   page. They are OUR OWN COPY, cut into squares by scripts/earth/ and served
   from this origin under /earth/v1/: no screen ever asks NASA for anything.
     /earth/v1/world/<layer>.jpg          the whole Earth, 2048×1024
     /earth/v1/t16/<layer>/<S>_<W>.jpg    60° squares, 960 px (16 px a degree)
     /earth/v1/t32/<layer>/<S>_<W>.jpg    30° squares, 960 px (32 px a degree)
   A view reads only the squares it can see, and the whole-Earth picture only
   for what the squares leave uncovered (a failed file, a view too wide).

   WHAT IS OURS: the projection, the sunlight (NOAA, the same sums as
   fids-sun.js: fidsSun.subsolar, so the planet's day and night line and the
   board's html.fids-day / fids-night can never disagree), the air glow, the
   faint moonlit land at night, the dusk band, the routes, dots, names,
   leader lines, the clock mark, the signpost lists and the cut-aways.

   THE RULES IT KEEPS
     · Sizes. Under 28 px nothing; 28–59 px the planet's lit edge; 60–149 px
       a strip turned toward the next flight still to come, its place and
       local time on one line; 150 px and up the full view: the routes and
       names of the places on the rows above it (this page), 5 to 16 of them
       by height, on a planet framed once for the direction (every place its
       rows list, all pages: shapersOf), so the planet stays put as the pages
       turn. A board showing no rows but its own notice (no flights in its
       window, its feed down, its first list still coming) has the planet
       and the airport under the notice, no routes.
     · The next flight is the earliest whose time (revised, else scheduled)
       is now or later, not gone, not cancelled. An overdue row is never it.
     · Names are the rows' own (formatCityIata, the language on screen); a
       place CITY and CITY_FR do not name is named by the floor's own table
       (js/earth-places.js NAME, v24070), which nothing but the floor reads.
       They are placed by the longest of the board's languages, so a
       name never moves when the board turns language: only its text
       changes. A name keeps 6 px clear of the routes where it can, never
       stands on another place's route (within 2 px of it, v24070), and its
       own route, where it passes under it, is cut away there; a place with
       no room for its name is left out with its route and dot, so every
       line carries a name. A name reads as its own place's mark (its
       dot, or the arrow where its route leaves): it never stands nearer
       another place's mark than its own (v24070), and where another mark
       stands as near, a leader line joins it to its own dot, or it goes
       elsewhere; an arrow's own name is the nearest to it; of two dots that
       would touch, only the first is drawn. A name is never given up for
       another and a dot is never taken away to make room for a name; a
       place left off is tried again only where every name stays
       (fillNames). But for the next flight still to come, which is always
       named and drawn bold (v24073): placed first, the places in its way
       give way to it, and on a row below the cap's it takes the cap's
       last slot, only where the floor would otherwise leave it off. A
       place the board can name only by its code is not drawn (hasName);
       a place of the floor's own table whose name CITY gives a place
       elsewhere is named with its state, province or country (London,
       KY; Valencia, Venezuela). Names keep 10 px under the last row. The
       airport's ring keeps a clear zone. Places beyond the picture are named where
       their route leaves it, an arrow there pointing on; several leaving at
       one spot share one route, one arrow and one list.
     · The time there is the board's own clock (BoardStrings.boardTime: the
       format its rows use), printed only where it differs from this
       airport's, and only for a place whose zone is known: the AP table's,
       else the floor's own list of zones (ZONE_LIST below), else the table
       of every other place (js/earth-places.js, v24070).
     · Every place the boards can meet has a position: the board's own
       tables, else js/earth-places.js (OurAirports), which the floor loads
       itself as it starts (loadPlaces), never the board. The floor never
       writes to the board's tables: the rows, the gate, the companion app
       and every other screen print exactly what they printed before it.
     · White ink with a dark halo, nothing behind it. Nothing moves, flashes
       or travels: the planet is re-lit once a minute, a quarter of a degree
       of sunlight, written in bands nobody can see change. A new floor (a
       page with more rows or fewer, the other direction) is built while the
       one on screen stays up, then put in its place in one step: the floor
       is never blank. A new size is built only once it has held 3 s (the
       board settling its rows), and the lit floors of a board's whole
       rotation are kept, so after the first round every page change is
       that one step.
     · No passenger words of its own: names come from the rows, times are
       numbers, the clock mark is a symbol; the layer is aria-hidden.

   SAFETY
     · EARTH_FLOOR_ON below turns it all off: nothing runs, the attribute is
       never set, the boards look exactly as before.
     · ?floor=classic | ?floor=earth on one screen (review, emergencies), then
       the airport's Customize choice (html[data-fids-floor-pref], set by
       fids-core.js from the field floor: '' or earth is Earth, classic is the
       earlier backdrop).
     · html[data-fids-floor=earth] is set only once a planet has painted (or
       the rows leave under 28 px for one), and it is what retires the old
       backdrop (css/display-overrides.css). It does not follow the floor page
       by page: a busy page under 28 px shows plain ground, not the old
       picture.
     · Pictures that fail: a missing square is covered by the whole-Earth
       picture. If that fails too the attribute goes and the old backdrop
       shows; it is tried again at most once every 10 minutes. A thrown error
       turns the floor off for the session.
     · Never holds the page: projecting and lighting run in slices of 6 ms at
       most. A screen with little memory or few cores starts at half size; a
       screen whose re-lights take over 150 ms three times running drops to
       half size; at half size, three over 400 ms re-light every 5 minutes.
       ?earthscale=1 | 0.5 forces a size; window.__ocfBench() measures.
     · Memory: pictures are kept compressed (about 8 MB at most) and decoded
       only to be read, then released. Up to 8 lit floors are kept, within
       40 MB with their projected day and night colours (about 5.8 MB a floor
       of 1920 by 300); over that the oldest let go of their colours first,
       then go. The floor on screen and the one replacing it always stay.
     · Paused while hidden: the loop runs on _ocEvery (skipped while the
       rotator has this board out of sight, caught up by _ocOnShow), and
       nothing is built or re-lit while the document is hidden.
     · No layout shift: the floor is absolutely placed under the rows, at
       z-index -1, pointer-events none, inside the content area (contain:
       layout). It never writes to #fidsTable or a row.

   Node can require this file: the pure parts (places, sizes, views, squares,
   the layout of routes and names, the sun) are exported for the tests
   (tests/earth-floor.test.js, tests/earth-sun.test.js).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // ── THE SWITCH ─────────────────────────────────────────────────────────────
  var EARTH_FLOOR_ON = true;

  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  var NS = 'http://www.w3.org/2000/svg';
  var BASE = '/earth/v1/';
  var MIN_ANY = 28, MIN_ROUTES = 60, MIN_FULL = 150, MIN_W = 400, MIN_PAGE_W = 800;
  var SLICE_MS = 6;                 // the longest the floor holds the page in one go
  var SPACE = [3, 8, 24];           // the space above the planet's edge: deep night navy
  var MAX_PLACES = 16;
  var SHAPERS = 40;                 // the most places a direction's view is fitted to (by flights)
  var NAME_TOP = 10;                // a name stands at least this far under the last row
  var AMBIG = 6;                    // another place's mark as near a name as its own, to this much farther: a leader line says which
  var LEAD_NEAR = 18;               // the shortest leader line, drawn only to settle an ambiguity
  var DOT_GAP = 14;                 // two places' dots nearer than this: only the first is drawn
  var NEW_SPOT = 100000;            // v24070: a spot v24067 did not have is tried after every one it had (layout)
  var CACHE_MAX = 8;                // lit floors kept: a board's whole rotation, both directions
  var CACHE_BYTES = 40e6;           // what they may hold together (canvases and projected colours)
  var SETTLE_MS = 3000;             // a new floor size is built once it has held this long
  var BLOB_BUDGET = 8e6;            // compressed pictures kept at hand, bytes
  var RETRY_MS = 600000;            // a floor with no picture is tried again after this
  var WAIT_MS = 60000;              // a planet not up by then: the old backdrop meanwhile
  var PLACES_URL = '/js/earth-places.js?v=24086';   // every other place's position and zone (loadPlaces)
  var PLACES_WAIT_MS = 6000;        // the most a floor waits for them before it is drawn without
  var HALO = '#020a1c';

  // ── small sums ─────────────────────────────────────────────────────────────
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function vec(lat, lon) { var a = lat * RAD, b = lon * RAD, c = Math.cos(a); return [c * Math.cos(b), c * Math.sin(b), Math.sin(a)]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function wrap180(d) { return ((d % 360) + 540) % 360 - 180; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // how many places a full floor of this height names calmly: about one for
  // every 26 px of floor, 5 to 16
  function capFor(h) { return Math.max(5, Math.min(MAX_PLACES, Math.floor((h - 40) / 26))); }
  // what a floor of this size shows
  function modeFor(W, H, known) {
    if (!known || H < MIN_ANY || W < MIN_W) return 'none';
    return H >= MIN_FULL ? 'full' : H >= MIN_ROUTES ? 'strip' : 'edge';
  }

  // ── THE SUN ────────────────────────────────────────────────────────────────
  // The sub-solar point from fids-sun.js (fidsSun.subsolar: NOAA, the sums the
  // board's own day and night use), else NOAA / Meeus low precision here.
  function sunVecLocal(ms) {
    var n = ms / 86400000 + 2440587.5 - 2451545.0;
    var L = (280.460 + 0.9856474 * n) % 360;
    var g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    var eps = (23.439 - 0.0000004 * n) * RAD;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    var gmst = ((280.46061837 + 360.98564736629 * n) % 360) * RAD;
    return { lat: dec * DEG, lon: wrap180((ra - gmst) * DEG) };
  }
  var _sunLib = null;
  function sunLib() {
    if (_sunLib !== null) return _sunLib;
    _sunLib = false;
    try { if (root && root.FidsSun && typeof root.FidsSun.subsolar === 'function') _sunLib = root.FidsSun; } catch (e) {}
    if (!_sunLib) { try { if (typeof require === 'function') _sunLib = require('./fids-sun.js'); } catch (e) { _sunLib = false; } }
    if (_sunLib && typeof _sunLib.subsolar !== 'function') _sunLib = false;
    return _sunLib;
  }
  function sunAt(ms) {
    var L = sunLib(), s = null;
    try { if (L) s = L.subsolar(ms); } catch (e) { s = null; }
    if (!s || !isFinite(s.lat) || !isFinite(s.lon)) s = sunVecLocal(ms);
    return { lat: s.lat, lon: s.lon, v: vec(s.lat, s.lon) };
  }
  // the sun's altitude, degrees, at a place (the planet's own lighting test)
  function sunAltitude(lat, lon, ms) { return Math.asin(clamp(dot(vec(lat, lon), sunAt(ms).v), -1, 1)) * DEG; }

  // ── TODAY'S PLACES, FROM THE BOARD'S OWN ROWS ──────────────────────────────
  //   rows      data[dir]
  //   o.dir     'dep' | 'arr'      o.ap0   this airport
  //   o.now     ms                 o.coords(code) → [lat, lon] | null
  //   o.tz(code) → zone | null     o.real(code) → the real code for a shown one
  //   o.codeOf(text) → the code the map reads from a row's words when the row
  //                has none of its own ('Harrisburg, PA': rowCode)
  //   o.named(code, text) → false for a place the board can name only by its
  //                code: it is not on the map (v24067: hasName)
  var GONE = /departed|active|enroute|airborne|landed|arrived|atbelt|baggage|diverted/;
  function placesFrom(rows, o) {
    var dir = o.dir === 'arr' ? 'arr' : 'dep', now = +o.now, by = {}, next = null;
    (rows || []).forEach(function (f) {
      if (!f) return;
      var text = String((dir === 'dep' ? f.dest : f.origin) || f.dest || f.origin || '');
      var lc = String(f._locIata || '').toUpperCase(), read = false;
      if (!lc) { var mt = /\|\s*([A-Z]{3})\s*$/.exec(text); if (mt) lc = mt[1]; }
      if (!lc && o.codeOf) { lc = String(o.codeOf(text) || '').toUpperCase(); read = !!lc; }
      var c = lc && o.real ? String(o.real(lc) || lc).toUpperCase() : lc;
      if (!c || c === o.ap0) return;
      var at = o.coords(c); if (!at) return;
      if (o.named && !o.named(c, text)) return;
      var st = String(f.status || '').replace(/[\s_-]+/g, '').toLowerCase();
      // the zone: the board's AP table, else the row's own arrival zone (a
      // departure's). Never the feed's own offset, which is the departure
      // airport's.
      var p = by[c] || (by[c] = { code: c, lat: +at[0], lon: +at[1], n: 0, gone: 0, cxl: 0, soon: Infinity, tz: (o.tz && o.tz(c)) || (dir === 'dep' ? f._arrTz || null : null), raw: text, read: read });
      p.n++;
      if (/cancel/.test(st)) { p.cxl++; return; }
      if (GONE.test(st)) { p.gone++; return; }
      var ts = f._revTs || f._sortTs || 0;
      var key = ts >= now ? ts : ts + 1e13;                     // an overdue row ranks after every flight to come
      if (ts && key < p.soon) p.soon = key;
      if (ts && ts >= now && (!next || ts < next.ts)) next = { ts: ts, code: c };
    });
    var out = Object.keys(by).map(function (k) { return by[k]; }).filter(function (p) { return p.cxl < p.n; });
    out.forEach(function (p) { p.done = p.gone >= p.n - p.cxl; p.isNext = !!(next && next.code === p.code); });
    out.sort(function (a, b) { return (b.isNext - a.isNext) || (a.done - b.done) || (a.soon - b.soon) || (b.n - a.n) || (a.code < b.code ? -1 : 1); });
    out.forEach(function (p, i) { p.rank = i; });
    return { list: out, dir: dir, next: next };
  }
  // this page's places in the order its rows list them; without codes, the day's
  function onPage(list, codes) {
    if (!codes || !codes.length) return list;
    var by = {}; list.forEach(function (p) { by[p.code] = p; });
    return codes.map(function (c) { return by[c]; }).filter(Boolean);
  }

  // ── A PLACE'S NAME ON THE FLOOR (v24067) ──────────────────────────────────
  // B is the board's own city helpers (the browser: fids-core.js's, boardFns
  // below; the tests: the same functions out of fids-core.js):
  //   B.formatCityIata(raw, code, l)   B.stripCode(s)   B.tableCity(code, l)
  //   B.normalize(name, code)          B.inTables(code) → CITY or CITY_FR has it
  //   B.placeName(code, l) → the floor's own name for a place CITY and
  //                CITY_FR do not name, the same in every language as yet
  //                (js/earth-places.js nameOf; optional)
  // the board's name for a code, as the rows write it
  function tableNameOf(B, code, l) {
    var n = '';
    try { if (B.tableCity) n = B.tableCity(code, l) || ''; } catch (e) { n = ''; }
    try { if (n && B.normalize) n = B.normalize(n, code) || n; } catch (e) {}
    try { if (n && B.stripCode) n = B.stripCode(n) || n; } catch (e) {}
    return n;
  }
  // The city exactly as the row prints it in a language: the row's own
  // formatCityIata, without the airport's name and without the code. Where
  // the row's words hold a comma they are a list of stops (Orlando's 'Chicago,
  // Wichita, Las Vegas, Burbank', coded BUR; 'Denver, Lihue', LIH) or a city
  // and its region, and the floor names the place the row's code is, by the
  // board's name for it ('Burbank'); it drew the whole list. No table name
  // has a comma (tests/earth-floor-places.test.js).
  function cityNameOf(B, code, raw, l, brief) {
    var n = '';
    // v24070 — A PLACE CITY AND CITY_FR DO NOT NAME is named by the floor's
    // own table (js/earth-places.js: Abidjan, Braunschweig, Ulukhaktok),
    // whatever the row's words: the row prints the feed's words or the code
    // as it always did ('Abidjan Felix Houphouet-Boigny | ABJ', 'Abj | ABJ'),
    // and the board's tables, which the rows read, are never written to
    var own = floorName(B, code, l, brief);
    if (own) return own;
    try {
      if (raw && B.formatCityIata) {
        n = String(B.formatCityIata(raw, code, l) || '');
        if (B.stripCode) n = B.stripCode(n) || n;
        n = n.split(' · ')[0].trim();
        if (n && n !== '—') {
          if (code && n.indexOf(',') >= 0) { var t = tableNameOf(B, code, l); if (t) return t; }
          return n;
        }
      }
    } catch (e) {}
    return tableNameOf(B, code, l) || code;
  }
  // A PLACE IS NAMED, OR IT IS NOT ON THE MAP. A place is named when the
  // board's tables have a name for its code (Umeå's UME, Van's VAN, Iki's
  // IKI: names of three letters, or with letters outside A to Z), or when
  // the row's own words give a name that is not just its code, compared
  // without case and without taking any letter out. A place the board can
  // name only by its code ('Xpl', a code with no table name) is left off the
  // map; the rows still list it. (It once took out every letter outside A to
  // Z first, so 'Umeå' read 'UME', and Umeå, Höfn, Van, Iki and Eek were
  // never drawn.)
  function namedBy(B, code, text) {
    var c = String(code || '').toUpperCase();
    try { if (B.inTables && B.inTables(c)) return true; } catch (e) {}
    // (v24070: and the floor's own table's names: Ahe, Diu, Gan, Yap, the
    // places whose names are their codes, are names)
    if (floorName(B, c, 'en')) return true;
    var n = String(cityNameOf(B, c, text, 'en') || '').replace(/\s+/g, ' ').trim();
    return !!n && n.toUpperCase() !== c;
  }
  // the floor's own name for a place CITY and CITY_FR do not name, or ''
  // (v24073: with where it is, where CITY gives its name to a place
  // elsewhere: placeIn)
  function floorName(B, code, l, brief) {
    var n = floorNameBare(B, code, l), w = '';
    if (!n) return '';
    try { w = B.placeIn ? String(B.placeIn(String(code).toUpperCase()) || '') : ''; } catch (e) { w = ''; }
    return w ? placeIn(B, n, w, l, brief) : n;
  }
  function floorNameBare(B, code, l) {
    var c = String(code || '').toUpperCase();
    if (!c || !B.placeName) return '';
    try { if (B.inTables && B.inTables(c)) return ''; } catch (e) { return ''; }
    try { return String(B.placeName(c, l) || ''); } catch (e) { return ''; }
  }
  // v24073 — A NAME THAT IS ANOTHER PLACE'S TOO. 69 places of the floor's
  // table share their name with a place CITY names elsewhere, read without
  // accents, case or St/Saint: Charlottetown in Labrador (YHG) and on Prince
  // Edward Island (YYG), London in Kentucky (LOZ), Valencia in Venezuela
  // (VLN), Paris in Texas (PRX), Mérida in Venezuela (MRD) and Mexico's
  // Merida (MID), Saint Louis in Senegal (XLS) and St Louis (STL). Such a name is
  // printed with where it is (js/earth-places.js IN), so that it never
  // reads as the famous place: in the United States and Canada its state's
  // or province's two letters, the same in every language and the way the
  // continent's maps and signs write them ('London, KY', 'Charlottetown,
  // NL': a country's name could not tell the two Charlottetowns apart);
  // elsewhere its country's name in the language on screen (B.regionName:
  // Intl.DisplayNames in the board's locale, BoardStrings.intl: 'Valencia,
  // Venezuela', 'Valencia, Vénézuéla', 'Valencia, ベネズエラ', 'Valencia,
  // فنزويلا'), else its two letters. The place's own name is the same in
  // every language, in Latin letters, and the comma after it is too. Only
  // the floor's names: the rows print the feed's words as before. The name's
  // box is measured with it, in every language, so a longer name takes a
  // spot it fits or is left off as any name is. (`brief`: the country's two
  // letters, 'Hamilton, AU', for the next flight alone where its name with
  // the country's fits nowhere: fillNames, briefOf.)
  function placeIn(B, name, where, l, brief) {
    var na = /^(?:US|CA)-([A-Z]{2})$/.exec(where), q = na ? na[1] : '';
    if (!q && !brief) { try { q = B.regionName ? String(B.regionName(where, l) || '') : ''; } catch (e) { q = ''; } }
    return name + ', ' + (q || where);
  }
  // the next flight in its brief form ('Hamilton, AU'), where its name
  // carries a country's (never a state's or a province's: those are two
  // letters already), or null
  function briefOf(B, p) {
    var w = '';
    try { w = (B.placeIn && floorNameBare(B, p.code, 'en')) ? String(B.placeIn(String(p.code).toUpperCase()) || '') : ''; } catch (e) { w = ''; }
    if (!w || /^(?:US|CA)-/.test(w)) return null;
    var o = {}; for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
    o.brief = true;
    return o;
  }
  // v24070 — A CODE THE FEED NEVER SENT. A row's code is the feed's, else
  // the last three letters of the airport's ICAO code (fids-core.js mapADB),
  // which outside North America is often another place's code: Belgrade's
  // LYBE reads YBE (Uranium City), Geneva's LSGG SGG (Sermiligaaq), Muscat's
  // OOMS OMS (Omsk), the Isle of Man's EGNS GNS (Gunungsitoli). The rows
  // print that code as they always have; the map does not draw a place that
  // only its own table places (B.onlyHere) where the row's words share no
  // word with the place's name and name another place, by the board's own
  // readings (B.readWords, from the whole words down to their first word),
  // more than MISREAD_KM from it: a Belgrade flight never runs to northern
  // Saskatchewan. Words that name the place (Athens, Georgia's 'Athens Ben
  // Epps'; Paris, Texas's 'Paris Cox Field') or no other place ('Sentani')
  // keep it, and so does a row with no words but its code.
  var MISREAD_KM = 300;
  function wordsOf(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z]+/).filter(function (w) { return w.length >= 3; }); }
  function kmApart(a, b) {
    var r = RAD, d = Math.pow(Math.sin((b[0] - a[0]) * r / 2), 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.pow(Math.sin((b[1] - a[1]) * r / 2), 2);
    return 12742 * Math.asin(Math.sqrt(Math.min(1, d)));
  }
  function misread(B, code, text) {
    var c = String(code || '').toUpperCase();
    try { if (!c || !B.onlyHere || !B.onlyHere(c) || !B.readWords || !B.at) return false; } catch (e) { return false; }
    var w = String(text || '').replace(/\s*\|\s*[A-Za-z0-9]{3}\s*$/, '').replace(/\s*\(\s*[A-Za-z0-9]{3}\s*\)\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!w || w.replace(/[^A-Za-z]/g, '').toUpperCase() === c) return false;
    var mine = wordsOf(floorNameBare(B, c, 'en')), ws = wordsOf(w);
    if (ws.some(function (x) { return mine.indexOf(x) >= 0; })) return false;
    var parts = w.split(' '), other = '';
    for (var k = parts.length; k > 0 && !other; k--) {
      try { other = String(B.readWords(parts.slice(0, k).join(' ')) || '').toUpperCase(); } catch (e) { other = ''; }
    }
    if (!other || other === c) return false;
    var a = null, b = null;
    try { a = B.at(c); b = B.at(other); } catch (e) { return false; }
    return !!(a && b) && kmApart(a, b) > MISREAD_KM;
  }

  // ── THE TIME THERE: THE ZONES OF THE PLACES AP DOES NOT KNOW ─────────────
  // A place's zone comes from AP (fids-core.js) first, then from here, and a
  // place found in neither gets no time, never a guess. These are the 453
  // destinations the live boards listed on 2026-10-18 with no zone in AP
  // (every live airport's departures and arrivals). Each is the zone the
  // airport is in: the US by county where the line runs through a state
  // (Evansville, Paducah and Owensboro are Central, South Bend and
  // Lafayette Eastern; Iron Mountain and Ironwood are Central, the rest of
  // Michigan Eastern; the Florida panhandle west of the Apalachicola is
  // Central; Rapid City is Mountain; Lewiston and Elko are Pacific), Canada
  // by its own lines (Fort Frances, Kenora and Sioux Lookout Central,
  // Cranbrook Mountain, Fort St John on year-round Mountain). When the list
  // was made, each was compared with the nearest zone of the tz database by
  // its offsets in January and July, and every difference read by hand.
  // v24067 — and the places the overnight sweep of every airport's board
  // (2026-10-19) found named with no zone, or with no position at all (their
  // positions are now in COORDS): Kansas and the Dakotas east of the Mountain
  // line are Central (Dodge City, Liberal, Hays, Pierre, Devils Lake,
  // Jamestown), Dickinson west of it Mountain; Fort Nelson keeps year-round
  // Mountain time (America/Fort_Nelson) and Whitehorse its own; Kugluktuk
  // and Taloyoak are Nunavut's Mountain time; Chevery is on the Lower North
  // Shore's Atlantic time (ZONE_ONE); Natashquan is Eastern, the last place
  // on that shore before it (the IANA tz database: Atlantic time is east of
  // Natashquan). Left out on purpose, so it prints no time rather than a
  // guess: YMU (Thunder Bay's feed means Musselwhite by it, which is
  // Eastern; the code is a seaplane base in British Columbia elsewhere).
  // tests/earth-zones.test.js holds every zone to one the browser knows, no
  // code to two zones or to another zone than AP's, and the hard cases.
  var ZONE_LIST = {
    'America/New_York': 'ABE ACK ACY AGS ALB AOO AUG AVL AVP BGM BGR BHB BKW BTV BUF CAE CAK CHA ' +
                        'CHO CHS CKB CRW DAB DAY DJT DUJ ELM ERI EWN EYW FAY FLO GNV GSO GSP HHH ' +
                        'HPN HTS HVN HYA ILG ILM ISP ITH JAX JST LEB LEX LNS LWB LYH MDT MGW MHT ' +
                        'MLB MSS MVY MYR OAJ OGS ORF ORH PBG PBI PGV PHF PIE PKB PQI PSM PVC PVD ' +
                        'PWM RIC RKD ROA ROC RSW RUT SAV SBY SCE SHD SLK SRQ SWF SYR TEB TLH TRI ' +
                        'TTN TYS VRB',
    'America/Detroit': 'APN AZO CIU CMX ESC FNT GRR LAN MBL MBS MKG MQT PLN TVC',
    'America/Indiana/Indianapolis': 'FWA LAF SBN',
    'America/Kentucky/Louisville': 'SDF',
    'America/Menominee': 'IMT IWD',
    'America/Chicago': 'ABI ABR AEX ALO AMA ATW ATY BHM BIS BMI BRD BRL BRO BTR CGI CID CMI COU ' +
                       'CRP CWA DAL DDC DEC DLH DSM DVL EAR EAU ECP EVV FAR FOD FSD GFK GPT GRB ' +
                       'HIB HRL HSV HYS ICT INL JAN JLN JMS LBB LBF LBL LCH LFT LIT LNK LRD LSE ' +
                       'MAF MCW MEI MEM MFE MGM MHK MKE MKL MLI MOB MOT MSL MSN MWA OKC OMA OWB ' +
                       'PAH PIA PIB PIR PNS RHI RST SGF SHV SLN SPI SUX SWO TUL TVF UIN VCT VPS ' +
                       'XNA XWA',
    'America/Denver': 'ABQ ASE BIL BTM BZN CDC CEZ CNY COD COS CPR CYS DIK DRO ELP FCA FMN GJT GTF ' +
                      'GUP HLN HOB JAC LAR MSO PVU RAP RIW RKS ROW SAF SGU SHR SVC',
    'America/Boise': 'BOI IDA PIH SUN TWF',
    'America/Phoenix': 'FLG PGA PRC SOW TUS YUM',
    'America/Los_Angeles': 'ACV BFL BLI BUR CLD EAT EKO EUG FAT GEG IPL LGB LWS MFR MRY OAK ONT ' +
                           'OTH PAE PSC PSP RDD RDM RNO SBA SBP SCK SJC SMF SMX SNA STS',
    'America/Anchorage': 'ANC',
    'Pacific/Honolulu': 'KOA LIH',
    'America/Puerto_Rico': 'BQN',
    'America/St_Thomas': 'STT STX',
    'America/Toronto': 'YKF',
    'America/Iqaluit': 'YFB',
    'America/Winnipeg': 'YAG YBR YQK YXL',
    'America/Rankin_Inlet': 'YRT',
    'America/Regina': 'YPA ZFD',
    'America/Edmonton': 'YFI YFS YHY YQU YXC',
    'America/Cambridge_Bay': 'YCB YCO YYH',
    'America/Inuvik': 'YEV YVQ',
    'America/Dawson_Creek': 'YXJ',
    'America/Fort_Nelson': 'YYE',
    'America/Whitehorse': 'YXY',
    'America/Vancouver': 'XQU YAA YBL YCD YCG YPW YQQ YWL YXT YYD YYF YZZ ZEL ZMT',
    'America/Miquelon': 'FSP',
    'Atlantic/Bermuda': 'BDA',
    'America/Santo_Domingo': 'AZS POP SDQ STI',
    'America/Port-au-Prince': 'CAP CYA',
    'America/Bogota': 'BAQ CLO CTG MDE',
    'America/Barbados': 'BGI',
    'America/Caracas': 'CCS MAR',
    'America/Havana': 'CMW HAV HOG SCU SNU',
    'America/Curacao': 'CUR',
    'America/Kralendijk': 'BON',
    'America/Cancun': 'CZM TQO',
    'America/Merida': 'MID',
    'America/Mexico_City': 'AGU BJX GDL MLM OAX PBC PXM QRO SLP VER',
    'America/Monterrey': 'MTY TAM',
    'America/Mazatlan': 'CUL LTO MZT',
    'America/Hermosillo': 'HMO',
    'America/Tortola': 'EIS',
    'America/Nassau': 'BIM ELH FPO GGT MHH',
    'America/Martinique': 'FDF',
    'America/Guyana': 'GEO',
    'America/Grenada': 'GND',
    'America/Guayaquil': 'GYE UIO',
    'America/La_Paz': 'VVI',
    'America/Costa_Rica': 'LIR',
    'America/Grand_Turk': 'PLS',
    'America/Guadeloupe': 'PTP',
    'America/Panama': 'PTY',
    'America/Belize': 'BZE',
    'America/Tegucigalpa': 'RTB SAP XPL',
    'America/Managua': 'MGA',
    'America/St_Vincent': 'SVD',
    'America/St_Lucia': 'UVF',
    'America/Antigua': 'ANU',
    'America/Dominica': 'DOM',
    'America/St_Kitts': 'SKB',
    'America/Sao_Paulo': 'BSB GIG',
    'America/Nuuk': 'SFJ',
    'Atlantic/Reykjavik': 'AEY RKV',
    'Atlantic/Faroe': 'FAE',
    'Atlantic/Madeira': 'FNC',
    'Europe/London': 'BFS BOH KOI LSI NQY SYY',
    'Europe/Dublin': 'NOC',
    'Europe/Paris': 'BIQ BOD CCF CLY DOL EGC FNI LDE',
    'Europe/Berlin': 'BRE CGN DRS FMM GWT NRN',
    'Europe/Vienna': 'GRZ',
    'Europe/Rome': 'BRI CAG CIA CTA OLB PMO SUF',
    'Europe/Brussels': 'CRL LGG',
    'Europe/Athens': 'CHQ GPA HER JMK JTR KGS PVK RHO SKG ZTH',
    'Europe/Zagreb': 'DBV',
    'Europe/Ljubljana': 'LJU',
    'Europe/Sarajevo': 'SJJ',
    'Europe/Podgorica': 'TGD',
    'Europe/Skopje': 'SKP',
    'Europe/Belgrade': 'BEG PRN',
    'Atlantic/Canary': 'FUE LPA TFS',
    'Europe/Madrid': 'MAH SDR XRY',
    'Europe/Gibraltar': 'GIB',
    'Europe/Warsaw': 'GDN KTW LUZ POZ WMI WRO',
    'Europe/Bratislava': 'BTS KSC',
    'Europe/Stockholm': 'GOT',
    'Europe/Oslo': 'BGO',
    'Europe/Tallinn': 'TLL',
    'Europe/Istanbul': 'AYT BJV DLM ESB SAW',
    'Asia/Nicosia': 'PFO',
    'Asia/Beirut': 'BEY',
    'Asia/Baku': 'GYD',
    'Africa/Cairo': 'HRG RMF',
    'Africa/Casablanca': 'AGA RAK RBA',
    'Africa/Accra': 'ACC',
    'Africa/Windhoek': 'WDH',
    'Asia/Riyadh': 'JED',
    'Asia/Dubai': 'DWC',
    'Asia/Karachi': 'LHE',
    'Indian/Maldives': 'MLE',
    'Asia/Kolkata': 'CCU HYD MAA',
    'Asia/Bangkok': 'HKT',
    'Asia/Ho_Chi_Minh': 'SGN',
    'Asia/Makassar': 'DPS',
    'Asia/Shanghai': 'CGO NKG TFU WUH XMN',
    'Australia/Perth': 'PER',
    'Australia/Darwin': 'AYQ DRW',
    'Australia/Adelaide': 'ADL',
    'Australia/Brisbane': 'CNS HTI MCY OOL PPP TSV',
    'Australia/Sydney': 'ABX ARM BNK CFS DBO GFF MIM MRZ MYA OAG PQQ TMW WGA',
    'Australia/Melbourne': 'AVV MQL',
    'Pacific/Auckland': 'CHC WLG ZQN',
    'Pacific/Fiji': 'NAN',
    'Pacific/Tahiti': 'PPT'
  };
  // Quebec's airports one by one: the board keeps its one list of them for
  // the order of its languages (BoardStrings.FR_FIRST); this says only where
  // their clocks are
  var ZONE_ONE = {
    // v24067 — Chisasibi, Rivière-du-Loup, Chibougamau and Natashquan, on the
    // French-first list with a position and no zone: Eastern, as the IANA tz
    // database has every Québec airport but the Îles-de-la-Madeleine (YGR,
    // Halifax) and those east of Natashquan ('See America/Puerto_Rico for
    // east of Natashquan', northamerica, 2020-01-10)
    YKU: 'America/Toronto', YRI: 'America/Toronto', YMT: 'America/Toronto', YNA: 'America/Toronto',
    AKV: 'America/Toronto', XGR: 'America/Toronto', YBC: 'America/Toronto', YGL: 'America/Toronto',
    YGP: 'America/Toronto', YGW: 'America/Toronto', YHR: 'America/Blanc-Sablon',
    YIK: 'America/Toronto', YKG: 'America/Toronto', YKL: 'America/Toronto', YKQ: 'America/Toronto',
    YMX: 'America/Toronto', YQC: 'America/Toronto', YTF: 'America/Toronto', YUY: 'America/Toronto',
    YVP: 'America/Toronto', YZG: 'America/Toronto', YZV: 'America/Toronto'
  };
  var ZONES = {};
  Object.keys(ZONE_LIST).forEach(function (z) { ZONE_LIST[z].split(' ').forEach(function (c) { if (c) ZONES[c] = z; }); });
  Object.keys(ZONE_ONE).forEach(function (c) { ZONES[c] = ZONE_ONE[c]; });
  // a place's zone: AP's, else the list above, else (v24070) the floor's
  // table of every other place (js/earth-places.js, `more`: code → zone),
  // else none
  function zoneOf(c, apZone, more) { return apZone || ZONES[c] || (more && more[c]) || null; }

  // ── THE VIEW: an orthographic globe, north up at this airport ──────────────
  function frameBasis(A, psi, delta) {
    var nA = vec(A[0], A[1]);
    var lo = A[1] * RAD, la = A[0] * RAD;
    var e0 = [-Math.sin(lo), Math.cos(lo), 0];
    var n0 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
    var ps = psi * RAD, d = delta * RAD;
    var up0 = add(scale(n0, Math.cos(ps)), e0, Math.sin(ps));
    var r = add(scale(e0, Math.cos(ps)), n0, -Math.sin(ps));
    var n = add(scale(nA, Math.cos(d)), up0, -Math.sin(d));
    var u = add(scale(up0, Math.cos(d)), nA, Math.sin(d));
    return { r: r, u: u, n: n };
  }
  function bearingTo(A, p) {
    var p1 = A[0] * RAD, p2 = p.lat * RAD, dl = (p.lon - A[1]) * RAD;
    return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * DEG;
  }
  // THE STRIP (60–149 px) and THE EDGE (28–59 px): a wide, low dome of the
  // planet's edge seen from above this airport, looking the way the next
  // flight still to come goes (north when there is none)
  function stripView(A, next, W, H) {
    var yl = Math.round(clamp(H * 0.14, 4, 14)), ya = H - Math.round(clamp(H * 0.17, 6, 16)), h = H - yl;
    var R = Math.max(900, ((0.42 * W) * (0.42 * W) + h * h) / (2 * h));
    var sd = clamp(1 - (ya - yl) / R, 0, 0.9999), delta = Math.asin(sd) * DEG;
    var psi = next ? Math.round(bearingTo(A, next) / 5) * 5 : 0;
    return { B: frameBasis(A, psi, delta), R: R, cx: W / 2, cy: ya + R * sd, yl: yl, ya: ya, psi: psi, delta: +delta.toFixed(1), strip: true };
  }
  // THE FULL VIEW. Every view (turned 0–30°, tilted 3–74°, the airport at
  // four heights) is tried; the places it holds inside the floor, clear of
  // the edge and with room for their names, are counted by their flights.
  // The CLOSEST of those that hold the most is kept, north up unless turning
  // holds more or comes a quarter closer. The planet's curve always spans the
  // floor: never a small ball.
  function chooseView(A, pts, W, H) {
    var yl = Math.round(clamp(H * 0.13, 22, 70));
    var Rmin = Math.max(H * 0.9, W * 0.6);
    if (!pts.length) {
      var ya1 = H * 0.72, sd1 = Math.sin(45 * RAD), R1 = Math.max(Rmin, (ya1 - yl) / (1 - sd1));
      var sd1b = 1 - (ya1 - yl) / R1;
      return { B: frameBasis(A, 0, Math.asin(sd1b) * DEG), R: R1, cx: W / 2, cy: ya1 + R1 * sd1b, yl: yl, ya: ya1, psi: 0, delta: +(Math.asin(sd1b) * DEG).toFixed(1) };
    }
    var mX = 26, mTop = 16, mBot = 18, nameRoom = 150, leftRoom = 110, room = W - 2 * mX - nameRoom - leftRoom;
    var yas = [0.62, 0.68, 0.74, 0.80].map(function (k) { return H * k; });
    var psis = [0, -15, 15, -30, 30];
    var want = pts.map(function (p) { return { v: vec(p.lat, p.lon), w: p.n || 1 }; });
    var all = [];
    psis.forEach(function (psi) {
      for (var delta = 74; delta >= 3; delta--) {
        var B = frameBasis(A, psi, delta), sd = Math.sin(delta * RAD);
        for (var yi = 0; yi < yas.length; yi++) {
          var ya = yas[yi], R = (ya - yl) / (1 - sd);
          if (R < Rmin) continue;
          var cy = ya + R * sd, xs = [{ x: 0, w: 0, home: 1 }];
          for (var i = 0; i < want.length; i++) {
            var v = want[i].v, sz = dot(v, B.n); if (sz < 0.16) continue;
            var Y = cy - dot(v, B.u) * R; if (Y < yl + mTop || Y > H - mBot) continue;
            xs.push({ x: dot(v, B.r) * R, w: want[i].w });
          }
          xs.sort(function (a, b) { return a.x - b.x; });
          // the heaviest run of places no wider than the floor, the airport in
          // it: from each place, the run reaching as far as the room allows
          // (every place weighs at least 1, so the longest run from a place is
          // its heaviest), kept when it holds the airport; one pass, the far
          // end only ever moving on
          var best = null, ih = 0;
          while (!xs[ih].home) ih++;
          for (var lo = 0, hi = -1, wsum = 0; lo < xs.length; lo++) {
            if (hi < lo - 1) { hi = lo - 1; wsum = 0; }
            while (hi + 1 < xs.length && xs[hi + 1].x - xs[lo].x <= room) { hi++; wsum += xs[hi].w; }
            if (lo <= ih && ih <= hi && (!best || wsum > best.w)) best = { w: wsum, lo: xs[lo].x, hi: xs[hi].x };
            if (hi >= lo) wsum -= xs[lo].w;
          }
          if (best) all.push({ B: B, R: R, cy: cy, ya: ya, psi: psi, delta: delta, kept: best.w, lo: best.lo, hi: best.hi });
        }
      }
    });
    if (!all.length) {
      var sd0 = Math.sin(60 * RAD), ya0 = yas[0], R0 = Math.max(Rmin, (ya0 - yl) / (1 - sd0)), sdb = 1 - (ya0 - yl) / R0;
      return { B: frameBasis(A, 0, Math.asin(sdb) * DEG), R: R0, cx: W / 2, cy: ya0 + R0 * sdb, yl: yl, ya: ya0, psi: 0, delta: 60 };
    }
    var kmax = 0; all.forEach(function (c) { if (c.kept > kmax) kmax = c.kept; });
    function closest(list) { var b = null; list.forEach(function (c) { if (c.kept >= kmax && (!b || c.R > b.R * 1.001 || (Math.abs(c.R - b.R) <= b.R * 0.001 && c.kept > b.kept))) b = c; }); return b; }
    var b0 = closest(all.filter(function (c) { return c.psi === 0; })), b1 = closest(all);
    var pick = (b0 && !(b1.R > b0.R * 1.25 || b1.kept > b0.kept)) ? b0 : b1;
    var cx = mX + leftRoom - pick.lo + (room - (pick.hi - pick.lo)) / 2;
    cx = clamp(cx, Math.max(W * 0.1, mX + leftRoom - pick.lo), Math.min(W * 0.9, W - mX - nameRoom - pick.hi));
    return { B: pick.B, R: pick.R, cx: cx, cy: pick.cy, yl: yl, ya: pick.ya, psi: pick.psi, delta: pick.delta };
  }
  // a view's own name: two sets of places that frame the planet alike share
  // one floor, and one picture in the cache
  function viewSig(v) { return [v.psi, v.delta, Math.round(v.R), Math.round(v.cx), Math.round(v.cy)].join(','); }
  // THE PLACES A DIRECTION'S VIEW IS FITTED TO: every place its rows have
  // listed (the whole rotation, never one page), each at the most flights it
  // has had, the busiest SHAPERS of them. The store only grows through the
  // day, so a board frames its departures once and its arrivals once, and the
  // planet stays put while the pages turn: only the routes and names follow
  // the page. `store` is the caller's ({} to start); returns the places and
  // a signature that changes only when they do.
  function shapersOf(store, list) {
    (list || []).forEach(function (p) {
      var o = store[p.code], n = p.n || 1;
      if (!o) store[p.code] = { code: p.code, lat: p.lat, lon: p.lon, n: n };
      else if (n > o.n) o.n = n;
    });
    var all = Object.keys(store).map(function (k) { return store[k]; });
    all.sort(function (a, b) { return (b.n - a.n) || (a.code < b.code ? -1 : 1); });
    all = all.slice(0, SHAPERS);
    return { list: all, sig: all.map(function (p) { return p.code + ':' + p.n; }).sort().join(',') };
  }

  // ── WHICH SQUARES A VIEW SEES ──────────────────────────────────────────────
  function llAt(v, px, py) {
    var sx = (px - v.cx) / v.R, sy = (v.cy - py) / v.R, rr = sx * sx + sy * sy;
    if (rr >= 1) return null;
    var z = Math.sqrt(1 - rr), B = v.B;
    var wx = sx * B.r[0] + sy * B.u[0] + z * B.n[0], wy = sx * B.r[1] + sy * B.u[1] + z * B.n[1], wz = sx * B.r[2] + sy * B.u[2] + z * B.n[2];
    return [Math.asin(clamp(wz, -1, 1)) * DEG, Math.atan2(wy, wx) * DEG];
  }
  // the level a view reads: 30° squares when it is close, 60° when wide, the
  // whole Earth alone when wider still
  function levelFor(view, k) { var ppd = view.R * RAD * (k || 1); return ppd > 22 ? 32 : ppd > 7 ? 16 : 0; }
  function tilesFor(v, W, H, lvl) {
    var sp = lvl === 16 ? 60 : 30, seen = {}, out = [];
    for (var py = 0; py <= H + 5; py += 10) for (var px = 0; px <= W + 7; px += 14) {
      var ll = llAt(v, Math.min(px, W - 1), Math.min(py, H - 1)); if (!ll) continue;
      var i = Math.min(180 / sp - 1, Math.floor((ll[0] + 90) / sp)), j = Math.min(360 / sp - 1, Math.floor((ll[1] + 180) / sp));
      if (seen[i + '_' + j]) continue; seen[i + '_' + j] = 1;
      out.push({ latS: -90 + i * sp, lonW: -180 + j * sp, sp: sp });
    }
    return out;
  }
  function layerName(layer, month) { return layer === 'day' ? 'day-' + ('0' + clamp(month | 0, 1, 12)).slice(-2) : 'night'; }
  // the file for a square (kind 32 or 16) or the whole Earth (kind 'world'),
  // always on our own origin
  function texSrc(kind, layer, latS, lonW, month) {
    var name = layerName(layer, month);
    if (kind === 'world') return BASE + 'world/' + name + '.jpg';
    return BASE + 't' + (kind === 16 ? 16 : 32) + '/' + name + '/' + latS + '_' + lonW + '.jpg';
  }
  // bilinear sample of a square into arr[o..o+2]; pixel centres half a pixel in
  function sampleInto(t, lat, lon, arr, o) {
    if (lat < t.lat0 || lat > t.lat1) return false;
    var dl = lon - t.lon0; if (dl < 0) dl += 360; if (dl > t.lon1 - t.lon0) return false;
    var fx = dl / (t.lon1 - t.lon0) * t.w - 0.5, fy = (t.lat1 - lat) / (t.lat1 - t.lat0) * t.h - 0.5;
    var x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, x1 = x0 + 1, y1 = y0 + 1, w = t.w, h = t.h;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= w) x1 = w - 1; if (y1 >= h) y1 = h - 1; if (x0 >= w) x0 = w - 1; if (y0 >= h) y0 = h - 1;
    var d = t.d, i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    for (var k = 0; k < 3; k++) {
      var a = d[i00 + k] + (d[i10 + k] - d[i00 + k]) * ax, b = d[i01 + k] + (d[i11 + k] - d[i01 + k]) * ax;
      arr[o + k] = a + (b - a) * ay;
    }
    return true;
  }

  // ── ROUTES, PLACES AND NAMES: WHERE EVERYTHING GOES ────────────────────────
  function toScreen(v, view) {
    var B = view.B, x = dot(v, B.r), y = dot(v, B.u), z = dot(v, B.n);
    return { x: view.cx + x * view.R, y: view.cy - y * view.R, z: z, hidden: z < 0 && (x * x + y * y) < 1 };
  }
  function slerp(a, b, t, om) {
    var so = Math.sin(om); if (so < 1e-6) return a;
    var k1 = Math.sin((1 - t) * om) / so, k2 = Math.sin(t * om) / so;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
  }
  // a route: the great circle raised by `lift` (a share of the Earth's radius)
  // at its middle, cut where it is behind the planet
  function routeRuns(a, b, lift, view) {
    var om = Math.acos(clamp(dot(a, b), -1, 1));
    var runs = [], cur = [], N = Math.max(32, Math.round(om * DEG * 1.6));
    for (var i = 0; i <= N; i++) {
      var t = i / N, q = toScreen(scale(slerp(a, b, t, om), 1 + lift * Math.sin(Math.PI * t)), view);
      if (q.hidden) { if (cur.length > 1) runs.push(cur); cur = []; continue; }
      cur.push(q);
    }
    if (cur.length > 1) runs.push(cur);
    return runs;
  }
  // the hands of the clock mark, from the time printed beside it (its digits:
  // a 12-hour dial reads the same for either half of the day)
  function handsOf(tStr) {
    var m = /(\d{1,2})\D(\d{2})/.exec(String(tStr || ''));
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    return { h: ((h % 12) + mi / 60) * 30, m: mi * 6 };
  }
  // the arrow where a route leaves the picture: its tip on the route's last
  // point in sight, pointing the way the route goes on, notched at the back
  function arrowPath(w) {
    var c = Math.cos(w.ang), s = Math.sin(w.ang), L = w.len, hw = L * 0.5;
    var bx = w.x - c * L, by = w.y - s * L;
    var p = [[w.x, w.y], [bx - s * hw, by + c * hw], [w.x - c * L * 0.68, w.y - s * L * 0.68], [bx + s * hw, by - c * hw]];
    return 'M' + p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join('L') + 'Z';
  }

  // layout(o) → everything the floor draws, as plain numbers:
  //   o.view, o.W, o.H, o.here [lat, lon], o.full (a full floor or a strip)
  //   o.places   [{ code, lat, lon, tz, isNext, done, rank, name, names: [every
  //              language's name] }] in the order they are named
  //   o.timeOf(tz) → the time there in the board's clock ('' for none)
  //   o.hereTz   this airport's zone
  //   o.measure(text, px) → width in px
  //   o.cap      the most names (capFor(H) on a full floor, 1 on a strip)
  //   o.nearBy   how much nearer another place's mark than its own a name
  //              may stand (0, the board's; v24067 allowed AMBIG): for the
  //              tests, which weigh what the rule costs
  // v24070 — V24067'S SPOTS FIRST. A name tries the spots v24067 gave it (8
  // round its point at 5 distances) before the new ones (layoutWith
  // `oldFirst`): with the new spots mixed in among them by distance, a name
  // that had a clear spot took a new one instead, and that one could be
  // another name's (at Keflavík, Frankfurt's moved onto Munich's, and Munich
  // was left off). A new spot is taken only where no spot of v24067's is
  // clear. Where names placed first keep a place from a spot, the spots are
  // tried again mixed (as the nearer spot first), and that layout is kept
  // only when it names every place the first one named, and more
  // (at Halifax, Ottawa).
  function layout(o) {
    var L = layoutWith(o, true);
    if (!o.full || !Object.keys(L.blockedBy).length || L.placed >= (o.cap != null ? o.cap : capFor(o.H))) return L;
    var L2 = layoutWith(o, false), n1 = namedCodes(L), n2 = namedCodes(L2);
    return (n2.length > n1.length && n1.every(function (c) { return n2.indexOf(c) >= 0; })) ? L2 : L;
  }
  function layoutWith(o, oldFirst) {
    var view = o.view, W = o.W, H = o.H, full = !!o.full, measure = o.measure, top = Math.max(0, +o.top || 0), nearBy = Math.max(0, +o.nearBy || 0);
    var out = { full: full, hub: null, routes: [], dots: [], arrows: [], leaders: [], labels: [], knockouts: [], unplaced: [], tooNear: [], blockedBy: {}, routeBy: {}, lostWith: {}, gaveWay: {}, placed: 0 };
    var A = vec(o.here[0], o.here[1]), a = toScreen(A, view);
    // ONE route and one name per place: places that share every language's
    // name and stand together (Montréal: YUL and MET) are one
    var groups = [];
    o.places.forEach(function (p, idx) {
      var nameKey = (p.names || [p.name]).join('\u0001'), q = toScreen(vec(p.lat, p.lon), view), gq = null, rk = p.isNext ? -1 : idx;
      groups.forEach(function (g) { if (g.nameKey === nameKey && Math.hypot(g.q.x - q.x, g.q.y - q.y) < 40) gq = g; });
      if (gq) { gq.members.push(p); gq.isNext = gq.isNext || p.isNext; gq.done = gq.done && p.done; gq.rank = Math.min(gq.rank, rk); if (!gq.tz) gq.tz = p.tz; return; }
      groups.push({ name: p.name, names: p.names || [p.name], nameKey: nameKey, q: q, p: p, members: [p], isNext: p.isNext, done: p.done, rank: rk, tz: p.tz, code: p.code });
    });
    // a place nearer the airport than 44 px cannot be named without seeming
    // to name the airport itself: left out at this scale (the rows list it)
    if (full) groups = groups.filter(function (g) {
      var near = !g.q.hidden && g.q.z > 0 && Math.hypot(g.q.x - a.x, g.q.y - a.y) < 44;
      if (near) out.tooNear.push(g.code);
      return !near;
    });
    // the time there, only where the clock differs from this airport's
    var hereTime = o.timeOf(o.hereTz);
    groups.forEach(function (g) {
      g.tStr = g.tz ? o.timeOf(g.tz) : '';
      if (g.tStr && g.tStr === hereTime) g.tStr = '';
      g.v = vec(g.p.lat, g.p.lon); g.om = Math.acos(clamp(dot(A, g.v), -1, 1));
      var Ls = (g.q.z > 0 && !g.q.hidden) ? Math.hypot(g.q.x - a.x, g.q.y - a.y) : g.om * view.R;
      g.tA = clamp(40 / Math.max(Ls, 1), 0.002, 0.35);
    });
    function leaveAng(g, lift) {
      var t = g.tA, p = toScreen(scale(slerp(A, g.v, t, g.om), 1 + lift * Math.sin(Math.PI * t)), view);
      return Math.atan2(p.y - a.y, p.x - a.x);
    }
    // a route to a place in sight keeps inside the lens of the two circles
    // round the airport and round its place, each as wide as the way between
    // them: never farther from the airport than its place is (no hook), and
    // never farther from its place than the airport is (v24067: Yellowknife's
    // route to Calgary, a place just under the floor's foot, climbed 95 px to
    // the Arctic and came back down, all of it nearer the airport than
    // Calgary is)
    function badArc(m, runs) {
      if (m.q.hidden || m.q.z <= 0.02 || !runs.length) return false;
      var reach = Math.hypot(m.q.x - a.x, m.q.y - a.y) + 4, bad = false;
      runs[0].forEach(function (q) { if (q.y < view.yl + 10 || Math.hypot(q.x - a.x, q.y - a.y) > reach || Math.hypot(q.x - m.q.x, q.y - m.q.y) > reach) bad = true; });
      return bad;
    }
    // FAN. Routes leaving the airport within 16° of each other are a family,
    // fanned inside the room before the next route: the nearest place leaves
    // lowest, the farthest highest, so the arcs open out, nest and never cross.
    if (full) {
      groups.forEach(function (g) { g.a0 = leaveAng(g, 0); g.sgn = wrapPi(leaveAng(g, 0.03) - g.a0) >= 0 ? 1 : -1; });
      var seen = {};
      groups.forEach(function (g, i) {
        if (seen[i]) return;
        var fam = [g]; seen[i] = 1;
        for (var grow = true; grow;) {
          grow = false;
          groups.forEach(function (h, j) {
            if (seen[j] || h.sgn !== g.sgn) return;
            if (fam.some(function (m) { return Math.abs(wrapPi(m.a0 - h.a0)) < 16 * RAD; })) { fam.push(h); seen[j] = 1; grow = true; }
          });
        }
        var sF = g.sgn, aBase = fam[0].a0;
        fam.forEach(function (m) { if (wrapPi(m.a0 - aBase) * sF < 0) aBase = m.a0; });
        var oMax = 0; fam.forEach(function (m) { m.off = wrapPi(m.a0 - aBase) * sF; if (m.off > oMax) oMax = m.off; });
        var gap = 46 * RAD;
        groups.forEach(function (h) { if (fam.indexOf(h) >= 0) return; var d = wrapPi(h.a0 - aBase) * sF; if (d > oMax && d < gap) gap = d; });
        var maxE = clamp(gap - 9 * RAD, 7 * RAD, 34 * RAD);
        fam.sort(function (x, y) { return x.om - y.om; });
        var n = fam.length, e0 = n > 1 ? 4 * RAD : Math.min(12 * RAD, maxE);
        var step = n > 1 ? Math.min(10 * RAD, Math.max(0, maxE - e0) / (n - 1)) : 0;
        fam.forEach(function (m, j) {
          var want = Math.max(m.off + 3 * RAD, e0 + j * step), lo = 0, hi = 0.16;
          if (wrapPi(leaveAng(m, hi) - aBase) * sF < want) m.lift = hi;
          else { for (var it = 0; it < 22; it++) { var mid = (lo + hi) / 2; if (wrapPi(leaveAng(m, mid) - aBase) * sF < want) lo = mid; else hi = mid; } m.lift = (lo + hi) / 2; }
          // a route to a place over the edge stays low, so it runs over the
          // edge where its name stands instead of looping into space
          m.lift = Math.min(m.lift, (m.q.hidden || m.q.z <= 0.02) ? 0.02 : 0.12);
          // a route to a place in sight stays under the edge and never passes
          // farther from the airport than its own place (no hook)
          for (var k2 = 0; k2 < 14; k2++) {
            m.runs = routeRuns(A, m.v, m.lift, view);
            if (!badArc(m, m.runs)) break;
            m.lift *= 0.8;
          }
        });
      });
      // make room: an arc passing close to another place's dot is raised over
      // it or lowered under it; an arc crossing a farther one of its own family
      // is lowered (nearer places fly lower)
      // (v24070, second follow-up: each route's points out of the hub, and
      // whether a route runs by a dot or crosses another route, are worked
      // out once for the routes as they stand, `seen`: a pass after a route
      // is raised or lowered reads again only what that route touches: the
      // same answers as reading them all again each pass, every layout of
      // the recorded floors byte for byte, in about half the time on the
      // busiest of them)
      var hubR = 26, fams = groups.slice().sort(function (x, y) { return y.om - x.om; });
      groups.forEach(function (g, i) { g.ix_ = i; });
      var pts = function (g) {
        if (g.ptsOf_ === g.runs) return g.pts_;
        var r = []; g.runs.forEach(function (run) { run.forEach(function (q) { if (Math.hypot(q.x - a.x, q.y - a.y) > hubR) r.push(q); }); });
        g.ptsOf_ = g.runs; g.pts_ = r; return r;
      };
      var seen = function (X, Y, key, f) {
        var c = X[key] || (X[key] = []), e = c[Y.ix_];
        if (e && e.a === X.runs && e.b === Y.runs) return e.v;
        var v = f(); c[Y.ix_] = { a: X.runs, b: Y.runs, v: v }; return v;
      };
      var cross = function (P1, P2) {
        for (var i = 1; i < P1.length; i++) for (var j = 1; j < P2.length; j++) {
          var p = P1[i - 1], r = { x: P1[i].x - p.x, y: P1[i].y - p.y }, q = P2[j - 1], s2 = { x: P2[j].x - q.x, y: P2[j].y - q.y };
          var den = r.x * s2.y - r.y * s2.x; if (Math.abs(den) < 1e-9) continue;
          var t = ((q.x - p.x) * s2.y - (q.y - p.y) * s2.x) / den, u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
        }
        return false;
      };
      for (var pass = 0; pass < 24; pass++) {
        var fix = null;
        for (var xi = 0; xi < fams.length && !fix; xi++) {
          var X = fams[xi], PX = pts(X);
          if (X.lift < 0.0004) continue;
          groups.forEach(function (Y) {
            if (fix || Y === X || Y.q.hidden || Y.q.z <= 0.02) return;
            if (seen(X, Y, 'byDot_', function () { return PX.some(function (q) { return Math.hypot(q.x - Y.q.x, q.y - Y.q.y) < 18; }); })) { fix = X; X.dotY = Y; }
          });
          if (fix) break;
          groups.forEach(function (Y) {
            if (fix || Y === X || Y.om >= X.om || Y.sgn !== X.sgn || Y.lift < 0.0004) return;
            if (seen(X, Y, 'crosses_', function () { return cross(PX, pts(Y)); })) fix = Y;
          });
        }
        if (!fix) break;
        if (fix.dotY) {
          var far = fix.q.hidden || fix.q.z <= 0.02, Y0 = fix.dotY, F = fix;
          var up = Math.min(far ? 0.02 : 0.12, fix.lift * 1.25 + 0.002), dn = fix.lift * 0.8;
          var dist = function (lift) {
            var m = Infinity, rr2 = routeRuns(A, F.v, lift, view);
            if (badArc(F, rr2)) return -1;
            rr2.forEach(function (run) { run.forEach(function (q) {
              if (Math.hypot(q.x - a.x, q.y - a.y) > hubR) m = Math.min(m, Math.hypot(q.x - Y0.q.x, q.y - Y0.q.y));
            }); });
            return m;
          };
          fix.lift = dist(up) > dist(dn) ? up : dn;
        } else fix.lift *= 0.84;
        fix.dotY = null; fix.runs = routeRuns(A, fix.v, fix.lift, view);
      }
    } else groups.forEach(function (g) { g.lift = 0; g.runs = routeRuns(A, g.v, 0, view); });   // a strip's route lies on the ground

    // places beyond the picture are named where their route leaves it; places
    // leaving at one spot share ONE route and their names stand as one list
    // (`top`: the floor's first rows out of sight, while a floor is kept up
    // under a page with more rows; 0 otherwise)
    function inPicture(g) { return !g.q.hidden && g.q.z > 0.02 && g.q.x > 6 && g.q.x < W - 6 && g.q.y > top + 4 && g.q.y < H - 4; }
    groups.forEach(function (g) {
      g.edge = null; g.follow = null; g.sign = null;
      if (inPicture(g)) return;
      var run = g.runs[0]; if (!run || !run.length) return;
      var last = null, prev = null;
      for (var i = 0; i < run.length; i++) {
        var q = run[i];
        if (q.x < 4 || q.x > W - 4 || q.y < top + 2 || q.y > H - 2) { if (last) break; else continue; }
        prev = last; last = q;
      }
      if (last && Math.hypot(last.x - run[0].x, last.y - run[0].y) > 40) {
        g.edge = last;
        // the way the route is going where it leaves (its last 3 px): the
        // arrow there points on
        var p0 = prev || run[0];
        for (var k = run.indexOf(last) - 1; k >= 0 && Math.hypot(last.x - p0.x, last.y - p0.y) < 3; k--) p0 = run[k];
        g.edgeAng = Math.atan2(last.y - p0.y, last.x - p0.x);
      }
    });
    var signs = [];
    groups.slice().sort(function (x, y) { return x.rank - y.rank; }).forEach(function (g) {
      if (!g.edge) return;
      var sg = null;
      signs.forEach(function (c) { if (!sg && Math.hypot(c.lead.edge.x - g.edge.x, c.lead.edge.y - g.edge.y) < 44) sg = c; });
      if (sg) { sg.members.push(g); g.follow = sg.lead; } else { sg = { lead: g, members: [g] }; signs.push(sg); g.sign = sg; }
    });
    var drawn = groups.filter(function (g) { return !g.follow; });
    // every route as points 3 px apart: a name is never placed on one
    var marks = [];
    drawn.forEach(function (g) { g.runs.forEach(function (run) {
      for (var i = 1; i < run.length; i++) {
        var p0 = run[i - 1], p1 = run[i], L = Math.hypot(p1.x - p0.x, p1.y - p0.y), n = Math.max(1, Math.ceil(L / 3));
        for (var s2 = 0; s2 < n; s2++) marks.push({ x: p0.x + (p1.x - p0.x) * s2 / n, y: p0.y + (p1.y - p0.y) * s2 / n, g: g });
      }
    }); });
    // (v24070: the points by 32 px squares, so a spot reads only the points
    // near it: a name now tries 112 spots, not 40; `near` calls f with the
    // index of each point in the squares the rectangle touches, until f
    // returns false)
    // (the squares by column, then row: two lookups by number, not one by a
    // string made for each square, the same squares in the same order)
    var CELL = 32, cells = {};
    marks.forEach(function (m, i) { var cx = Math.floor(m.x / CELL), cy = Math.floor(m.y / CELL), col = cells[cx] || (cells[cx] = {}); (col[cy] || (col[cy] = [])).push(i); });
    function near(x0, y0, x1, y1, f) {
      for (var cx = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL); cx <= cx1; cx++) {
        var col = cells[cx]; if (!col) continue;
        for (var cy = Math.floor(y0 / CELL), cy1 = Math.floor(y1 / CELL); cy <= cy1; cy++) {
          var l = col[cy]; if (l) for (var j = 0; j < l.length; j++) if (f(l[j]) === false) return;
        }
      }
    }
    var CLEAR = full ? 6 : 4;
    // v24070 — ANOTHER PLACE'S ROUTE UNDER A NAME. The routes were cut away
    // under a name and 5 px round it (the knock-out), and what was left of
    // another place's route at the cut read as that name's own line: at
    // Sydney Adelaide's and Perth's routes ran under 'Melbourne' and Hobart's
    // under 'Canberra', at LaGuardia Birmingham's under 'Pittsburgh', at
    // Miami Houston's under 'Atlanta', at Keflavík Milan's and Munich's under
    // 'Stockholm' (the live boards, 2026-10-19). A name now never stands on
    // another place's route, the same as it never stands on another place's
    // dot: it goes elsewhere, or it is left out (the rows list it), and
    // fillNames tries it again without the places left off whose routes kept
    // it out (routeBy). Its own route (and the one its list shares) may pass
    // under it, and only that is cut away there; another place's route that
    // passes beside it stays whole. `other`: the first other place whose
    // route runs through the name (or within 2 px of it); `own`: its own route's points in its
    // knock-out; a place already left off has no route.
    function crossings(b, self, mates) {
      var n = 0, own = 0, other = null, first = Infinity;
      near(b.x0 - CLEAR, b.y0 - CLEAR, b.x1 + CLEAR, b.y1 + CLEAR, function (i) {
        var m = marks[i];
        if (m.x > b.x0 - CLEAR && m.x < b.x1 + CLEAR && m.y > b.y0 - CLEAR && m.y < b.y1 + CLEAR) {
          if (m.g === self && Math.hypot(m.x - b.px, m.y - b.py) < 14) return;     // a route's own last pixels into its dot
          n++;
          if (!mates || mates.indexOf(m.g) >= 0) { if (m.x > b.x0 - 5 && m.x < b.x1 + 5 && m.y > b.y0 - 4 && m.y < b.y1 + 4) own++; }
          // (2 px: the route's points stand 3 px apart; the first such route by its points' order)
          else if (i < first && !m.g.unplaced && m.x > b.x0 - 2 && m.x < b.x1 + 2 && m.y > b.y0 - 2 && m.y < b.y1 + 2) { other = m.g; first = i; }
        }
      });
      return { n: n, own: own, other: other };
    }
    // names: sizes follow the room, always under the rows' own size
    var fs = full ? Math.round(clamp(H * 0.064, 24, 28)) : Math.round(clamp(H * 0.3, 20, 24));
    var boxes = [];
    var hz = full ? 40 : 16;                                   // the airport's clear zone
    if (!a.hidden) boxes.push({ x0: a.x - hz, y0: a.y - hz, x1: a.x + hz, y1: a.y + hz });
    var dots = groups.filter(inPicture);
    dots.forEach(function (g) { boxes.push({ x0: g.q.x - 7, y0: g.q.y - 7, x1: g.q.x + 7, y1: g.q.y + 7, own: g, mark: true }); });
    // EVERY PLACE'S MARK: its dot, or the arrow where its route leaves the
    // picture (v24067: an arrow counts as a dot here). A name must read as
    // its own place's, never as the name of another place's mark nearer it,
    // and a leader line never passes by another place's mark
    var dotAt = dots.map(function (g) { return { g: g, x: g.q.x, y: g.q.y }; });
    signs.forEach(function (sg) { var e = sg.lead.edge; dotAt.push({ g: sg.lead, x: e.x, y: e.y, arrow: true }); });
    // the arrow where a route leaves the picture is kept clear of other names
    signs.forEach(function (sg) { var e = sg.lead.edge; boxes.push({ x0: e.x - 8, y0: e.y - 8, x1: e.x + 8, y1: e.y + 8, own: sg.lead, mark: true }); });
    // (a dot or arrow of a place left off is not drawn, and keeps nothing
    // clear; `why`: the places whose names keep this one from a spot)
    function free(b, self, why) {
      // a name stands NAME_TOP px under the last row: never read as a row's
      if (b.x0 < 10 || b.x1 > W - 10 || b.y0 < top + NAME_TOP || b.y1 > H - 2) return false;
      for (var i = 0; i < boxes.length; i++) {
        var q = boxes[i]; if (q.own === self || (q.mark && q.own.unplaced)) continue;
        // two names keep a word space apart, and a line apart
        if (b.x0 < q.x1 + 12 && b.x1 > q.x0 - 12 && b.y0 < q.y1 + 4 && b.y1 > q.y0 - 4) { if (q.own && !q.mark) why(q.own); return false; }
      }
      return true;
    }
    signs.forEach(function (sg) { dots.push(sg.lead); });
    dots.sort(function (x, y) { return x.rank - y.rank; });
    function boxDist(b, x, y) { return Math.hypot(clamp(x, b.x0, b.x1) - x, clamp(y, b.y0, b.y1) - y); }
    // the nearest OTHER mark to a name, when it is as near as the name's own
    // point (or nearer, less AMBIG px): the name could be read as that place's
    function rival(b, g, pt) {
      var own = boxDist(b, pt.x, pt.y), mates = g.sign ? g.sign.members : [g], hit = null;
      dotAt.forEach(function (d) {
        if (mates.indexOf(d.g) >= 0 || d.g.unplaced) return;
        var dd = boxDist(b, d.x, d.y);
        if (!(dd < own + AMBIG)) return;
        if (!hit || dd < hit.d) hit = { d: dd, own: own, arrow: !!d.arrow };
      });
      return hit;
    }
    // AN ARROW HAS NO LEADER LINE, SO ITS OWN NAME IS THE NEAREST TO IT
    // (v24067). Another place's name as near an arrow as the arrow's own
    // name (or nearer, less AMBIG px) reads as the arrow's: at Edinburgh,
    // Palma's arrow stood 30 px from 'Southampton' and 68 px from 'Palma';
    // at Heathrow, Madrid's 24 px from 'Genève' and 34 px from 'Madrid'.
    // A name at an arrow keeps the names already placed farther from its
    // arrow than itself, and a later name keeps out of that reach.
    function arrowClash(b, g, pt, isEdge, why) {
      var mates = g.sign ? g.sign.members : [g], own = isEdge ? boxDist(b, pt.x, pt.y) : 0;
      for (var i = 0; i < out.labels.length; i++) {
        var lab = out.labels[i];
        if (mates.indexOf(lab.g) >= 0) continue;
        if (isEdge && boxDist(lab.box, pt.x, pt.y) < own + AMBIG) { why(lab.g); return true; }
        if (lab.edge && boxDist(b, lab.at.x, lab.at.y) < lab.reach + AMBIG) { why(lab.g); return true; }
      }
      return false;
    }
    // a leader line joins a name to its dot when they stand apart (30 px), or
    // nearer when another dot stands as close: then the line says which
    function leaderOf(b, pt, near) {
      var nx = clamp(pt.x, b.x0, b.x1), ny = clamp(pt.y, b.y0, b.y1), dx = nx - pt.x, dy = ny - pt.y, L = Math.hypot(dx, dy);
      if (L < (near ? LEAD_NEAR : 30)) return null;
      return [pt.x + dx / L * 7, pt.y + dy / L * 7, nx - dx / L * 5, ny - dy / L * 5];
    }
    function leaderCrosses(l, self) {
      var hit = false;
      near(Math.min(l[0], l[2]) - 3, Math.min(l[1], l[3]) - 3, Math.max(l[0], l[2]) + 3, Math.max(l[1], l[3]) + 3, function (i) {
        var m = marks[i]; if (m.g === self) return;
        var vx = l[2] - l[0], vy = l[3] - l[1], t = clamp(((m.x - l[0]) * vx + (m.y - l[1]) * vy) / (vx * vx + vy * vy), 0, 1);
        if (Math.hypot(l[0] + vx * t - m.x, l[1] + vy * t - m.y) < 3) { hit = true; return false; }
      });
      return hit;
    }
    // v24067 — a leader line that passes by another place's dot (6 px), or
    // crosses a leader already drawn, reads as joining the wrong pair: the
    // spot is not taken (Edmonton's Toronto and Ottawa lines crossed in an X)
    function segsCross(p, q) {
      var rx = p[2] - p[0], ry = p[3] - p[1], sx = q[2] - q[0], sy = q[3] - q[1], den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) return false;
      var t = ((q[0] - p[0]) * sy - (q[1] - p[1]) * sx) / den, u = ((q[0] - p[0]) * ry - (q[1] - p[1]) * rx) / den;
      return t > 0 && t < 1 && u > 0 && u < 1;
    }
    function leaderWrong(l, g, why) {
      var mates = g.sign ? g.sign.members : [g], vx = l[2] - l[0], vy = l[3] - l[1], L2 = vx * vx + vy * vy;
      for (var i = 0; i < dotAt.length; i++) {
        var d = dotAt[i]; if (mates.indexOf(d.g) >= 0 || d.g.unplaced) continue;
        var t = clamp(((d.x - l[0]) * vx + (d.y - l[1]) * vy) / (L2 || 1), 0, 1);
        if (Math.hypot(l[0] + vx * t - d.x, l[1] + vy * t - d.y) < 6) return true;
      }
      for (var j = 0; j < out.leaders.length; j++) { var o = out.leaders[j]; if (segsCross(l, [o.x1, o.y1, o.x2, o.y2])) { why(o.g); return true; } }
      return false;
    }
    // v24067 — and a leader line never runs through another place's name,
    // nor a name over another place's leader line (Albany's line ran up
    // through 'Cleveland' at Washington National): a segment through a box,
    // `pad` px round it
    function segHits(l, b, pad) {
      var dx = l[2] - l[0], dy = l[3] - l[1], t0 = 0, t1 = 1;
      var p = [-dx, dx, -dy, dy], q = [l[0] - (b.x0 - pad), (b.x1 + pad) - l[0], l[1] - (b.y0 - pad), (b.y1 + pad) - l[1]];
      for (var i = 0; i < 4; i++) {
        if (p[i] === 0) { if (q[i] < 0) return false; continue; }
        var r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
      return t0 <= t1;
    }
    function leaderThroughName(l, why) { for (var i = 0; i < out.labels.length; i++) if (segHits(l, out.labels[i].box, 2)) { why(out.labels[i].g); return true; } return false; }
    function onLeader(b, why) { for (var i = 0; i < out.leaders.length; i++) { var o = out.leaders[i]; if (segHits([o.x1, o.y1, o.x2, o.y2], b, 2)) { why(o.g); return true; } } return false; }
    // the widest of the board's languages: a name keeps its place as the
    // board turns language
    function nameW(g, f) { var w = 0; g.names.forEach(function (s) { w = Math.max(w, measure(s, f)); }); return w; }
    var maxNames = o.cap != null ? o.cap : full ? capFor(H) : 1;   // (o.cap: the review tools' "is there room for one more")
    // v24073 — THE NEXT FLIGHT IS ALWAYS NAMED. The next flight still to
    // come is placed first (its rank is -1), and where none of its spots is
    // clear the places in its way give way to it, not it to them: a place
    // whose dot or arrow its name would cover, whose route runs under it
    // (within 2 px), whose mark stands nearer the name than its own point
    // (or as near, where no leader line can say which), or whose dot its
    // leader line would pass (6 px). Its own name keeps every rule. Of the
    // spots inside the floor (the floor's edges, the rows above it and the
    // airport's ring are never given up), it takes the one that costs the
    // fewest places, then the later rows, then the usual order (v24067's
    // spots first). The places that gave way are left off with their routes
    // and dots (out.gaveWay: who gave way to whom), and fillNames gives
    // their slots to the page's next rows. (v24070 left the next flight off
    // where another place's route ran under every spot it had: Vancouver at
    // Prince George, under Victoria's route; Kugluktuk at Yellowknife.)
    // v24067's own spot is always among the spots tried, and every rule it
    // could break there is about another place, which now gives way: where
    // v24067 drew the next flight, it is drawn, clear.
    function giveWay(g, pt, isEdge, cand, lw, lh, mates) {
      var pick = null, no = function () {};
      cand.forEach(function (c) {
        var b = { x0: pt.x + c.dx, y0: pt.y + c.dy, x1: pt.x + c.dx + lw, y1: pt.y + c.dy + lh, own: g, al: c.al, px: pt.x, py: pt.y };
        if (b.x0 < 10 || b.x1 > W - 10 || b.y0 < top + NAME_TOP || b.y1 > H - 2) return;
        var who = [], hard = false;
        var add = function (h) { if (h && h !== g && mates.indexOf(h) < 0 && !h.unplaced && who.indexOf(h) < 0) who.push(h); };
        var gone = function (h) { return mates.indexOf(h) < 0 && (h.unplaced || who.indexOf(h) >= 0); };
        // another place's dot or arrow under the name (a name or the ring: never)
        boxes.forEach(function (q) {
          if (hard || q.own === g || (q.mark && q.own.unplaced)) return;
          if (b.x0 < q.x1 + 12 && b.x1 > q.x0 - 12 && b.y0 < q.y1 + 4 && b.y1 > q.y0 - 4) { if (q.mark) add(q.own); else hard = true; }
        });
        if (hard || onLeader(b, no) || arrowClash(b, g, pt, isEdge, no)) return;
        // every other place's route through the name
        near(b.x0 - 2, b.y0 - 2, b.x1 + 2, b.y1 + 2, function (i) {
          var m = marks[i];
          if (mates.indexOf(m.g) < 0 && m.x > b.x0 - 2 && m.x < b.x1 + 2 && m.y > b.y0 - 2 && m.y < b.y1 + 2) add(m.g);
        });
        // every other place's mark nearer the name than its own point, or as
        // near with no leader line to say which
        var ownD = boxDist(b, pt.x, pt.y), asNear = [];
        dotAt.forEach(function (d) {
          if (mates.indexOf(d.g) >= 0 || gone(d.g)) return;
          var dd = boxDist(b, d.x, d.y);
          if (!(dd < ownD + AMBIG)) return;
          if (dd + nearBy < ownD || isEdge || d.arrow) add(d.g); else asNear.push(d.g);
        });
        var lead = leaderOf(b, pt, asNear.length > 0 && !isEdge);
        if (asNear.length && !lead) { asNear.forEach(add); asNear = []; lead = leaderOf(b, pt, false); }
        // and every other place's dot its leader line would pass
        if (lead && !isEdge) {
          var vx = lead[2] - lead[0], vy = lead[3] - lead[1], L2 = vx * vx + vy * vy || 1;
          dotAt.forEach(function (d) {
            if (mates.indexOf(d.g) >= 0 || gone(d.g)) return;
            var t = clamp(((d.x - lead[0]) * vx + (d.y - lead[1]) * vy) / L2, 0, 1);
            if (Math.hypot(lead[0] + vx * t - d.x, lead[1] + vy * t - d.y) < 6) add(d.g);
          });
          for (var j = 0; j < out.leaders.length; j++) { var ol = out.leaders[j]; if (segsCross(lead, [ol.x1, ol.y1, ol.x2, ol.y2])) return; }
          if (leaderThroughName(lead, no)) return;
        }
        // the usual cost of the spot, with what stays
        var n = 0, own = 0, crossed = false;
        near(b.x0 - CLEAR, b.y0 - CLEAR, b.x1 + CLEAR, b.y1 + CLEAR, function (i) {
          var m = marks[i];
          if (!(m.x > b.x0 - CLEAR && m.x < b.x1 + CLEAR && m.y > b.y0 - CLEAR && m.y < b.y1 + CLEAR) || gone(m.g)) return;
          if (m.g === g && Math.hypot(m.x - b.px, m.y - b.py) < 14) return;
          n++;
          if (mates.indexOf(m.g) >= 0 && m.x > b.x0 - 5 && m.x < b.x1 + 5 && m.y > b.y0 - 4 && m.y < b.y1 + 4) own++;
        });
        if (lead) near(Math.min(lead[0], lead[2]) - 3, Math.min(lead[1], lead[3]) - 3, Math.max(lead[0], lead[2]) + 3, Math.max(lead[1], lead[3]) + 3, function (i) {
          var m = marks[i]; if (m.g === g || gone(m.g)) return;
          var ux = lead[2] - lead[0], uy = lead[3] - lead[1], t = clamp(((m.x - lead[0]) * ux + (m.y - lead[1]) * uy) / (ux * ux + uy * uy), 0, 1);
          if (Math.hypot(lead[0] + ux * t - m.x, lead[1] + uy * t - m.y) < 3) { crossed = true; return false; }
        });
        var lost = 0, rows = 0;
        who.forEach(function (h) { var k = h.sign ? h.sign.members.length : 1; lost += k; rows += k * (1000 - clamp(h.rank, 0, 999)); });
        var key = lost * 1e12 + rows * 1e6 + n * 1000 + c.cost + (asNear.length ? 150 : 0) + (crossed ? 300 : 0);
        if (!pick || key < pick.key) pick = { key: key, b: b, lead: lead, own: own, who: who };
      });
      return pick;
    }
    dots.forEach(function (g) {
      // (a place that gave way to the next flight: v24073)
      if (g.unplaced) return;
      var pt = g.edge || g.q, isEdge = !!g.edge;
      var f = (g.isNext && full) ? Math.round(fs * 1.08) : fs, ts = Math.round(f * (full ? 0.8 : 0.9));
      var tStr = g.tStr, tTpl = tStr.replace(/\d/g, '0');
      var nW = nameW(g, f), timeW = tStr ? measure(tTpl, ts) : 0, r = ts * 0.36, gap = ts * 0.3;
      var timeRowW = tStr ? 2 * r + gap + timeW : 0;
      var list = (g.sign && g.sign.members.length > 1) ? g.sign.members.slice(0, clamp(Math.floor((H - 16) / (fs * 1.2)), 2, 8)) : null, nameCol = 0, timeCol = 0;
      if (list) {
        f = fs; ts = Math.round(f * 0.8); r = ts * 0.36; gap = ts * 0.3;
        list.forEach(function (m) { nameCol = Math.max(nameCol, nameW(m, f)); if (m.tStr) timeCol = Math.max(timeCol, 2 * r + gap + measure(m.tStr.replace(/\d/g, '0'), ts)); });
      }
      var lw = list ? nameCol + (timeCol ? f * 0.5 + timeCol : 0) : full ? Math.max(nW, timeRowW) : nW + (tStr ? f * 0.45 + timeRowW : 0);
      var lh = list ? list.length * f * 1.2 : full ? (tStr ? f * 1.06 + ts * 1.12 : f * 1.1) : f * 1.15;
      // v24070 — the spots a name may take: on a full floor 16 round its
      // point at each of 7 distances (it had 8 at 5, to 68 px): a name that
      // can no longer stand on another place's route, or nearer another
      // place's mark, finds a spot of its own (farther ones with their
      // leader line) where one was always there, rather than being left out
      // (and, `oldFirst`, only where none of v24067's is clear: layout)
      var cand = [];
      var ds = full ? [11, 22, 34, 50, 68, 90, 115] : [10, 20, 34];
      ds.forEach(function (d, di) {
        // a strip's one line beside its point, level with it, under it or
        // over it (the strip is low: the line keeps NAME_TOP under the rows)
        var dirs = full
          ? [['start', d, -lh / 2], ['end', -d - lw, -lh / 2], ['start', d * 0.5, d * 0.45], ['end', -d * 0.5 - lw, d * 0.45], ['middle', -lw / 2, d],
             ['start', d * 0.5, -lh - d * 0.45], ['end', -d * 0.5 - lw, -lh - d * 0.45], ['middle', -lw / 2, -lh - d],
             ['start', d * 0.2, d], ['end', -d * 0.2 - lw, d], ['start', d * 0.2, -lh - d], ['end', -d * 0.2 - lw, -lh - d],
             ['start', d, -lh * 0.1], ['start', d, -lh * 0.9], ['end', -d - lw, -lh * 0.1], ['end', -d - lw, -lh * 0.9]]
          : [['start', d, -lh / 2 + 2], ['end', -d - lw, -lh / 2 + 2], ['start', d, 2], ['end', -d - lw, 2], ['middle', -lw / 2, 6],
             ['start', d, 9], ['end', -d - lw, 9], ['middle', -lw / 2, 12], ['start', d, -lh + 4], ['end', -d - lw, -lh + 4]];
        dirs.forEach(function (c, ci) { cand.push({ al: c[0], dx: c[1], dy: c[2], cost: di * (full ? 6 : 10) + ci + ((full && oldFirst && (di > 4 || ci > 7)) ? NEW_SPOT : 0) }); });
      });
      var spot = null, best = 1e12;
      // two dots this close cannot be told apart: the place named first keeps
      // the spot, the other is left out with its route (the rows list it)
      var crowded = !isEdge && out.dots.some(function (d) { return Math.hypot(d.x - pt.x, d.y - pt.y) < DOT_GAP; });
      // the names already placed that keep this one from a spot (fillNames
      // tries the place again before them)
      var by = [], why = function (h) { if (h && h !== g && by.indexOf(h.code) < 0) by.push(h.code); };
      var mates = g.sign ? g.sign.members : [g], rb = [];
      if (out.placed < maxNames && !crowded) cand.forEach(function (c) {
        var b = { x0: pt.x + c.dx, y0: pt.y + c.dy, x1: pt.x + c.dx + lw, y1: pt.y + c.dy + lh, own: g, al: c.al, px: pt.x, py: pt.y };
        if (!free(b, g, why) || onLeader(b, why) || arrowClash(b, g, pt, isEdge, why)) return;
        var xr = crossings(b, g, mates), cr = xr.n, cost = cr * 1000 + c.cost;      // on a route: only if there is nowhere else
        // (v24070: never on another place's route)
        if (xr.other) { if (rb.indexOf(xr.other.code) < 0) rb.push(xr.other.code); return; }
        // another place's mark as near as this name's own: a leader line must
        // say which dot it names, else the spot is not taken
        var rv = rival(b, g, pt), lead = leaderOf(b, pt, !!rv && !isEdge);
        if (rv) {
          // v24067 — another place's mark CLEARLY nearer than the name's own
          // (more than AMBIG px): at a glance the name is that place's, line
          // or no line ('Cincinnati' 13 px from St Louis's dot and 45 px from
          // its own). Never there: elsewhere, or the place is left out (the
          // rows list it). A name at an arrow (which has no line to say
          // which) never stands as near another place's mark as its arrow
          // ('San Pedro Sula' read as Cancún's dot), and a leader line
          // settles a dot, never an arrow.
          // v24070 — and never nearer another place's mark than its own at
          // all: a name 1 to 6 px nearer a neighbour's dot, joined to its own
          // by its leader line, still read as the neighbour's at a glance
          // (Vancouver by Nanaimo's dot at Kelowna, Portland and Pittsburgh
          // at LaGuardia, Hamilton at Edmonton, Canberra at Sydney). Only a
          // mark as near as its own, or a little farther (AMBIG), is settled
          // by the line.
          if (rv.d + nearBy < rv.own) return;
          if (isEdge || rv.arrow) return;
          if (!lead) return;
          else cost += 150;
        }
        if (lead && !isEdge && (leaderWrong(lead, g, why) || leaderThroughName(lead, why))) return;
        if (lead && leaderCrosses(lead, g)) cost += 300;
        if (cost < best) { best = cost; spot = b; spot.lead = lead; spot.cross = xr.own; }
      });
      // (v24073: the next flight, where nothing is clear: the places in its way give way)
      if (!spot && g.isNext && full && !crowded && out.placed < maxNames && !noYield) {
        var gw = giveWay(g, pt, isEdge, cand, lw, lh, mates);
        if (gw) {
          gw.who.forEach(function (h) {
            h.unplaced = true; (h.sign ? h.sign.members : [h]).forEach(function (m) { m.unplaced = true; });
            out.unplaced.push(h.code); out.gaveWay[h.code] = g.code;
            if (h.sign && h.sign.members.length > 1) out.lostWith[h.code] = h.sign.members.slice(1).map(function (m) { return m.code; });
          });
          spot = gw.b; spot.lead = gw.lead; spot.cross = gw.own;
        }
      }
      var op = g.done && !g.isNext ? 0.55 : 1;
      // no room for the name: its route and dot are not drawn either
      if (!spot) {
        g.unplaced = true; (g.sign ? g.sign.members : [g]).forEach(function (m) { m.unplaced = true; }); out.unplaced.push(g.code);
        if (by.length && !crowded && out.placed < maxNames) out.blockedBy[g.code] = by;
        // (v24070: and the places whose routes ran where it would stand)
        if (rb.length && !crowded && out.placed < maxNames) out.routeBy[g.code] = rb;
        // the places listed under its arrow go with it (fillNames tries them without it)
        if (g.sign && g.sign.members.length > 1) out.lostWith[g.code] = g.sign.members.slice(1).map(function (m) { return m.code; });
        return;
      }
      boxes.push(spot); out.placed++;
      if (!isEdge) out.dots.push({ x: pt.x, y: pt.y, r: g.isNext ? 6 : 4.6, op: op, code: g.code });
      // a place beyond the picture: an arrow on its route where it leaves,
      // pointing on (a symbol, no words)
      else out.arrows.push({ x: pt.x, y: pt.y, ang: g.edgeAng || 0, len: full ? 13 : 10, op: list ? 1 : op, code: g.code });
      if (spot.lead && !isEdge) { var ld = { x1: spot.lead[0], y1: spot.lead[1], x2: spot.lead[2], y2: spot.lead[3], op: op }; Object.defineProperty(ld, 'g', { value: g, enumerable: false }); out.leaders.push(ld); }
      // never a name on a visible line: the routes are cut away under it
      // (v24070: its own route only, `code`)
      if (spot.cross) out.knockouts.push({ x0: spot.x0 - 5, y0: spot.y0 - 4, x1: spot.x1 + 5, y1: spot.y1 + 4, code: g.code });
      var L = { code: g.code, at: { x: pt.x, y: pt.y }, edge: isEdge, box: { x0: spot.x0, y0: spot.y0, x1: spot.x1, y1: spot.y1 }, op: list ? 1 : op, rows: [] };
      // (for the layout only: who the name is, and how far it stands from its arrow)
      Object.defineProperty(L, 'g', { value: g, enumerable: false });
      if (isEdge) Object.defineProperty(L, 'reach', { value: boxDist(L.box, pt.x, pt.y), enumerable: false });
      var clockAt = function (cx, cy, rr, s) { return { cx: cx, cy: cy, r: rr, hands: handsOf(s) }; };
      if (list) {
        list.forEach(function (m, li) {
          var ly = spot.y0 + f * 1.2 * (li + 0.5), row = { op: m.done && !m.isNext ? 0.55 : 1, texts: [{ x: spot.x0, y: ly, s: m.name, fs: f, anchor: 'start', code: m.code }] };
          if (m.tStr) {
            var tx3 = spot.x0 + nameCol + f * 0.5;
            row.clock = clockAt(tx3 + r, ly, r, m.tStr);
            row.texts.push({ x: tx3 + 2 * r + gap, y: ly, s: m.tStr, fs: ts, anchor: 'start', time: true });
          }
          L.rows.push(row);
        });
      } else if (full) {
        var al = spot.al, tx = al === 'start' ? spot.x0 : al === 'end' ? spot.x1 : (spot.x0 + spot.x1) / 2;
        var row1 = { op: 1, texts: [{ x: tx, y: spot.y0 + f * 0.53, s: g.name, fs: f, anchor: al, code: g.code }] };
        if (tStr) {
          var ty = spot.y0 + f * 1.06 + ts * 0.56, tw = measure(tStr, ts);
          var x0 = al === 'start' ? spot.x0 : al === 'end' ? spot.x1 - (2 * r + gap + tw) : tx - (2 * r + gap + tw) / 2;
          row1.clock = clockAt(x0 + r, ty, r, tStr);
          row1.texts.push({ x: x0 + 2 * r + gap, y: ty, s: tStr, fs: ts, anchor: 'start', time: true });
        }
        L.rows.push(row1);
      } else {
        var my = spot.y0 + lh / 2, row2 = { op: 1, texts: [{ x: spot.x0, y: my, s: g.name, fs: f, anchor: 'start', code: g.code }] };
        if (tStr) {
          var tx2 = spot.x0 + nW + f * 0.45;
          row2.clock = clockAt(tx2 + r, my, r, tStr);
          row2.texts.push({ x: tx2 + 2 * r + gap, y: my, s: tStr, fs: ts, anchor: 'start', time: true });
        }
        L.rows.push(row2);
      }
      out.labels.push(L);
    });
    // the routes, under everything (a place left unnamed loses its route):
    // the next flight's bright and strong, the others finer, flown ones faint
    drawn.filter(function (g) { return !g.unplaced; })
      .sort(function (x, y) { return (x.isNext - y.isNext) || (y.done - x.done); })
      .forEach(function (g) {
        out.routes.push({ code: g.code, runs: g.runs.map(function (run) { return run.map(function (q) { return { x: q.x, y: q.y }; }); }), w: g.isNext ? 3.4 : g.done ? 1.5 : 2.0, op: g.isNext ? 1 : g.done ? 0.36 : 0.7, lift: g.lift || 0 });
      });
    if (!a.hidden) out.hub = { x: a.x, y: a.y, r: full ? 13 : 9, dot: full ? 5.5 : 4 };
    out.marks = marks.filter(function (m) { return !m.g.unplaced; }).map(function (m) { return { x: m.x, y: m.y, code: m.g.code }; });
    return out;
  }

  // the places a layout named (a signpost list names each of its rows)
  function namedCodes(L) {
    var out = [];
    (L && L.labels || []).forEach(function (lab) { lab.rows.forEach(function (r) { var c = r.texts[0] && r.texts[0].code; if (c && out.indexOf(c) < 0) out.push(c); }); });
    return out;
  }
  // THE CAP COUNTS NAMES, NOT PLACES TRIED (v24067). A full floor names up
  // to capFor(H) of the page's places, in row order. The page's first ones
  // that cannot be named on this floor (too near the airport, no room for a
  // name, one name with another) used to keep their slots: Ottawa named 3
  // places of its 5 while more waited on the page. Now the next places on
  // the page are tried in their place, and a try is kept only when it names
  // every place the one before named, and more.
  // AND A NAME IS NEVER GIVEN UP FOR ANOTHER (v24067). A place left off
  // because names placed before it took its room (layout's blockedBy) is
  // tried again just before the first of them; that order is kept only when
  // the floor then names every place it named, and more (Yellowknife:
  // Calgary, tried before Vancouver, is named, and Vancouver still is). The
  // page's later places keep the names they can have (Boston at Washington
  // National, Nice at Heathrow), a dot is never taken away for a name (where
  // a later row's dot stands where an earlier row's name would go, the dot
  // stays: Norman Wells and Fort Simpson at Yellowknife), and a place that
  // cannot stand clear of them is left off (the rows list it).
  // A place whose arrow leads a list of places leaving at one spot takes the
  // list with it when it cannot be named: the list is tried without it. And
  // a place left off on the way is tried once more after all the others.
  // `run(list)` is the layout of a list of places; the list returned is in
  // the order that names them (the floor draws it again in that order).
  var REPAIRS = 10;
  // v24073 — THE NEXT FLIGHT IS ALWAYS NAMED, AND NOTHING ELSE MOVES FOR IT
  // WHERE NOTHING NEEDS TO. A floor is filled first as before, no place
  // giving way to another (layoutWith's giveWay off: noYield). Where that
  // floor names the next flight still to come, it is the floor, exactly as
  // before. Where it does not, and the next flight is on the page, the
  // floor is filled again with the next flight placed first: the places in
  // its way give way to it (layoutWith); on a row below the cap's, it takes
  // the slot of the cap's last row (the rows come first, but the next
  // flight before them); a try that names it is kept over one that does
  // not (`want`); it never gives its slot to a sooner row; and it has its
  // second chance even where it stood too near the airport (it may join a
  // name it shares farther out: Montréal for Saint-Hubert and Trudeau).
  // That floor is kept where it names the next flight. Where it still does
  // not, and the next flight's name carries its country's ('Hamilton,
  // Australia', a name another place has too), it is tried once more with
  // the country's two letters ('Hamilton, AU'), as a state or a province is
  // written: `brief(p)` gives the place so (briefOf), or null.
  var noYield = 0;
  function fillNames(pool, cap, run, brief) {
    var nx = null; pool.forEach(function (p) { if (p.isNext && !nx) nx = p; });
    var r1;
    noYield++;
    try { r1 = fillWith(pool, cap, run, null); } finally { noYield--; }
    if (!nx || cap < 1 || placesIn(r1.L).indexOf(nx.code) >= 0) return r1;
    var at = pool.indexOf(nx);
    var pool2 = at < cap ? pool : pool.slice(0, cap - 1).concat([nx], pool.slice(cap - 1).filter(function (p) { return p !== nx; }));
    var r2 = fillWith(pool2, cap, run, nx.code);
    if (placesIn(r2.L).indexOf(nx.code) >= 0) return r2;
    var nb = brief ? brief(nx) : null;
    if (nb) {
      var r3 = fillWith(pool2.map(function (p) { return p === nx ? nb : p; }), cap, run, nx.code);
      if (placesIn(r3.L).indexOf(nx.code) >= 0) return r3;
    }
    return r1;
  }
  // (the first fill alone, as every floor was filled before: for the tests)
  function fillAsBefore(pool, cap, run) {
    noYield++;
    try { return fillWith(pool, cap, run, null); } finally { noYield--; }
  }
  // the places a layout names, with the places drawn under another's name
  // (the same name in every language, within 40 px: Chicago for O'Hare and
  // Midway)
  function placesIn(L) {
    var out = namedCodes(L);
    (L && L.labels || []).forEach(function (lab) {
      var g = lab.g; if (!g || !g.members || (g.sign && g.sign.members.length > 1)) return;
      g.members.forEach(function (m) { if (out.indexOf(m.code) < 0) out.push(m.code); });
    });
    return out;
  }
  function fillWith(pool, cap, run, want) {
    var list = pool.slice(0, cap), L = run(list), next = list.length, left = REPAIRS;
    var more = function (L2, named) {
      var n2 = namedCodes(L2);
      // (v24073: a try that names the next flight, where the floor does not)
      if (want && n2.length <= cap && placesIn(L2).indexOf(want) >= 0 && placesIn(L).indexOf(want) < 0) return true;
      return n2.length > named.length && n2.length <= cap && named.every(function (c) { return n2.indexOf(c) >= 0; });
    };
    // the rows come first: of two floors that name as many places, the one
    // that names the earlier row where they first differ
    var row = {}; pool.forEach(function (p, i) { row[p.code] = i; });
    var sooner = function (L2) {
      var a = namedCodes(L2), b = namedCodes(L);
      if (a.length < b.length || a.length > cap) return false;
      var ra = a.map(function (c) { return row[c]; }).sort(function (x, y) { return x - y; }), rb = b.map(function (c) { return row[c]; }).sort(function (x, y) { return x - y; });
      for (var i = 0; i < rb.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i];
      return a.length > b.length;
    };
    var tryList = function (l2, orSooner) {
      if (left <= 0) return false;
      left--;
      var L2 = run(l2);
      if (!more(L2, namedCodes(L)) && !(orSooner && sooner(L2))) return false;
      list = l2; L = L2; return true;
    };
    var rescue = function () {
      var lead = Object.keys(L.lostWith || {});
      if (lead.length && tryList(list.filter(function (p) { return lead.indexOf(p.code) < 0; }))) repair();
      // v24070 — a place left off because another place's route ran where
      // its name would stand, where that place is left off too (it has no
      // route then): the list is tried without it, and kept where it names
      // more, or as many with the sooner rows (San Diego: Oakland, row 2, is
      // named, not San Jose, row 6, as when San Francisco is not tried)
      var rb = L.routeBy || {}, off = {}, drop = [];
      (L.unplaced || []).forEach(function (c) { off[c] = 1; });
      Object.keys(rb).forEach(function (c) { rb[c].forEach(function (x) { if (off[x] && drop.indexOf(x) < 0) drop.push(x); }); });
      if (drop.length && tryList(list.filter(function (p) { return drop.indexOf(p.code) < 0; }), true)) repair();
    };
    var repair = function () {
      for (var moved = true; moved && left > 0;) {
        moved = false;
        var named = namedCodes(L), by = L.blockedBy || {};
        for (var i = 1; i < list.length && !moved && left > 0; i++) {
          var b = by[list[i].code]; if (!b) continue;
          var at = -1;
          for (var j = 0; j < i && at < 0; j++) if (b.indexOf(list[j].code) >= 0) at = j;
          if (at < 0) continue;
          var l2 = list.slice(), x = l2.splice(i, 1)[0]; l2.splice(at, 0, x);
          if (tryList(l2)) moved = true;
        }
      }
    };
    repair(); rescue();
    // (v24070: up to 8 rounds, not 6, so that a floor a name or two short of
    // its cap still reaches the rows further down)
    for (var tries = 0; tries < 8 && next < pool.length; tries++) {
      var named = namedCodes(L);
      if (named.length >= cap) break;
      var lost = {}; L.tooNear.concat(L.unplaced).forEach(function (c) { lost[c] = 1; });
      var list2 = list.filter(function (p) { return !lost[p.code]; }), added = 0;
      while (next < pool.length && added < cap - named.length) { list2.push(pool[next++]); added++; }
      if (!added) break;
      var L2 = run(list2);
      if (more(L2, named)) { list = list2; L = L2; repair(); rescue(); }
    }
    // a second chance, after all the others, for the places left off on the
    // way (v24070: never for a place too near the airport, which no order
    // can name: the tries go to the places that can be)
    // (v24073: nor for a place that gave way to the next flight, which is
    // placed first whatever the order)
    var far = {}; (L.tooNear || []).forEach(function (c) { far[c] = 1; });
    var gave = function (c) { return !!(L.gaveWay && L.gaveWay[c]); };
    pool.slice(0, next).forEach(function (p) {
      var now = namedCodes(L);
      if (now.length >= cap || now.indexOf(p.code) >= 0 || (far[p.code] && p.code !== want) || gave(p.code)) return;
      tryList(list.filter(function (x) { return x !== p; }).concat([p]));
    });
    // v24070 — THE ROWS COME FIRST. A floor at its cap names the first rows
    // it can: a place left off on the way (the routes of the places tried
    // with it ran where its name would stand) that stands clear on the floor
    // as it is takes the slot of the latest row named, where every other
    // name stays (Washington National: Charleston, row 2, before St Louis,
    // row 15). Its own tries, three for each name the floor can hold, so the
    // ones before have left it some. (v24073, the second fill: never the
    // next flight's slot)
    for (var k = 0, turns = 3 * cap; k < next && turns > 0; k++) {
      var p = pool[k], now = namedCodes(L), others = now.filter(function (c) { return c !== want; });
      if (now.length < cap || now.indexOf(p.code) >= 0 || far[p.code] || gave(p.code) || !others.length) continue;
      var last = others.reduce(function (a, c) { return row[c] > row[a] ? c : a; }, others[0]);
      if (!(row[last] > k)) break;
      turns--;
      var l2 = list.filter(function (x) { return x.code !== last && x !== p; }), at = 0;
      while (at < l2.length && row[l2[at].code] < k) at++;
      l2.splice(at, 0, p);
      var L2 = run(l2), n2 = namedCodes(L2);
      var takes = function () { return n2.indexOf(p.code) >= 0 && n2.length >= now.length && now.every(function (c) { return c === last || n2.indexOf(c) >= 0; }); };
      // (and where a route ran where its name would stand, after the
      // others: the routes are laid in the list's order)
      if (!takes() && turns > 0 && L2.routeBy && L2.routeBy[p.code]) { turns--; l2 = list.filter(function (x) { return x.code !== last && x !== p; }).concat([p]); L2 = run(l2); n2 = namedCodes(L2); }
      if (takes()) { list = l2; L = L2; }
    }
    // v24070 — A PLACE WHOSE NAME IS ON THE FLOOR ALREADY COSTS NO NAME: two
    // airports with one name, together, are one name and one route (London
    // for City and Heathrow at Edinburgh, Toronto for Pearson and Billy
    // Bishop at Ottawa). Such a place further down the page is tried after
    // all the others, at the cap too, and kept where every name stays.
    var keyOf = function (p) { return (p.names || [p.name]).join('\u0001'); };
    pool.forEach(function (p) {
      if (list.indexOf(p) >= 0 || far[p.code]) return;
      var now = namedCodes(L), key = keyOf(p);
      if (!list.some(function (x) { return now.indexOf(x.code) >= 0 && keyOf(x) === key; })) return;
      var L2 = run(list.concat([p])), n2 = namedCodes(L2);
      var joined = L2.labels.some(function (lab) { return lab.g && lab.g.members && lab.g.members.some(function (m) { return m.code === p.code; }); });
      if (joined && n2.length === now.length && now.every(function (c) { return n2.indexOf(c) >= 0; })) { list = list.concat([p]); L = L2; }
    });
    return { list: list, L: L };
  }
  // the code a row names: its own (data-iata), else the code its city label
  // ends with ('Chicago · O'Hare | ORD': the board found it from the name
  // for the row's code chip, and not for the row itself), else the one
  // `read(words)` finds in its words (the board's _iataFromRowName:
  // 'Harrisburg, PA', 'St Hubert'), for the map only
  function rowCode(iata, loc, read) {
    var c = String(iata || '').trim().toUpperCase();
    if (c) return c;
    var m = /\|\s*([A-Z]{3})\s*$/.exec(String(loc || ''));
    if (m) return m[1];
    try { return read ? String(read(String(loc || '')) || '').toUpperCase() : ''; } catch (e) { return ''; }
  }

  var Core = {
    EARTH_FLOOR_ON: EARTH_FLOOR_ON, BASE: BASE,
    namedCodes: namedCodes, placesIn: placesIn, fillNames: fillNames, fillAsBefore: fillAsBefore, rowCode: rowCode,
    cityNameOf: cityNameOf, tableNameOf: tableNameOf, namedBy: namedBy, floorName: floorName, placeIn: placeIn, briefOf: briefOf, misread: misread, MISREAD_KM: MISREAD_KM,
    MIN_ANY: MIN_ANY, MIN_ROUTES: MIN_ROUTES, MIN_FULL: MIN_FULL, MIN_W: MIN_W, MIN_PAGE_W: MIN_PAGE_W,
    SLICE_MS: SLICE_MS, MAX_PLACES: MAX_PLACES,
    capFor: capFor, modeFor: modeFor, placesFrom: placesFrom, onPage: onPage, ZONES: ZONES, zoneOf: zoneOf,
    frameBasis: frameBasis, stripView: stripView, chooseView: chooseView, llAt: llAt,
    levelFor: levelFor, tilesFor: tilesFor, texSrc: texSrc, layerName: layerName, sampleInto: sampleInto,
    toScreen: toScreen, routeRuns: routeRuns, layout: layout, handsOf: handsOf, arrowPath: arrowPath,
    NAME_TOP: NAME_TOP, AMBIG: AMBIG, LEAD_NEAR: LEAD_NEAR, DOT_GAP: DOT_GAP, SETTLE_MS: SETTLE_MS, CACHE_MAX: CACHE_MAX, CACHE_BYTES: CACHE_BYTES,
    viewSig: viewSig, shapersOf: shapersOf,
    vec: vec, dot: dot, sunAt: sunAt, sunAltitude: sunAltitude, sunVecLocal: sunVecLocal
  };
  if (typeof module === 'object' && module.exports) module.exports = Core;
  if (!root || !root.document || !root.document.documentElement) return;
  root.FidsEarth = Core;
  // (switched off: the old backdrop at once, not after the page's own wait)
  if (!EARTH_FLOOR_ON) { try { root.document.documentElement.removeAttribute('data-fids-floor-wait'); } catch (e) {} }
  if (!EARTH_FLOOR_ON || root.__ocFloor) return;
  root.__ocFloor = 'earth';

  // ═════════════════════════════════════════════════════════════════════════
  //  THE BROWSER
  // ═════════════════════════════════════════════════════════════════════════
  var doc = root.document, HTML = doc.documentElement;

  // a place's latitude and longitude, from the same tables, in the same
  // order, as the board's own sun (fids-sun.js boardCoords), but only as the
  // page loaded them (v24067): the gate map adds to GATE_AP at run time from
  // the board's airport cache (_lookupAirport), which it fills from the
  // AeroDataBox passthrough the boards no longer use and from an airport
  // list we do not credit. The map under the rows draws a place only where
  // the board's own tables put it (OurAirports for the places this build
  // added), and only a place it can name (hasName).
  var GATE0 = {};
  try { /* global GATE_AP */ if (typeof GATE_AP !== 'undefined' && GATE_AP) Object.keys(GATE_AP).forEach(function (k) { GATE0[k] = GATE_AP[k]; }); } catch (e) {}
  function asPair(v) {
    if (!v) return null;
    var lat = Number(v.lat != null ? v.lat : v[0]), lon = Number(v.lon != null ? v.lon : (v.lng != null ? v.lng : v[1]));
    return (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) ? [lat, lon] : null;
  }
  // v24070 — EVERY OTHER PLACE THE BOARDS CAN MEET (js/earth-places.js):
  // the positions (OurAirports) and zones (IANA tz) of the places the
  // board's own tables leave without one. The floor alone loads it, once,
  // as it starts (it is no part of the board's own load), and waits for it
  // up to PLACES_WAIT_MS before it draws, so its first planet is framed for
  // every place it can name; a table that is late or fails is drawn without
  // (a place with no position has no route, as before).
  var PLACES = null, placesAsked = 0;
  function loadPlaces() {
    if (placesAsked) return;
    placesAsked = Date.now();
    var none = { AT: {}, zones: {}, failed: true };
    try {
      if (root.FIDS_EARTH_PLACES) { PLACES = root.FIDS_EARTH_PLACES; return; }
      var sc = doc.createElement('script');
      sc.src = PLACES_URL; sc.async = true;
      sc.onload = function () { PLACES = (root.FIDS_EARTH_PLACES && root.FIDS_EARTH_PLACES.AT) ? root.FIDS_EARTH_PLACES : none; };
      sc.onerror = function () { PLACES = none; stats.placesFailed = true; };
      (doc.head || HTML).appendChild(sc);
    } catch (e) { PLACES = none; }
  }
  function placesReady() { return !!PLACES || (placesAsked > 0 && Date.now() - placesAsked > PLACES_WAIT_MS); }
  // the board's own tables' position for a code, or null
  function boardAt(c) {
    var v = null;
    try { /* global COORDS */ if (typeof COORDS !== 'undefined' && COORDS[c]) v = asPair(COORDS[c]); } catch (e) {}
    try { if (!v && root.AIRPORT_COORDS && root.AIRPORT_COORDS[c]) v = asPair(root.AIRPORT_COORDS[c]); } catch (e) {}
    if (!v && Object.prototype.hasOwnProperty.call(GATE0, c)) v = asPair(GATE0[c]);
    return v;
  }
  function coordsOf(c) {
    var v = boardAt(c);
    if (!v && PLACES && PLACES.AT && Object.prototype.hasOwnProperty.call(PLACES.AT, c)) v = asPair(PLACES.AT[c]);
    return v;
  }
  function apTz(c) { var z = null; try { /* global AP */ z = (typeof AP !== 'undefined' && AP[c] && AP[c].tz) || null; } catch (e) { z = null; } return zoneOf(c, z, PLACES && PLACES.zones); }
  // the direction of the rows on screen (fids-core.js render stamps it,
  // v24080), not the board's next one: `mode` turns a slide before its rows
  // are drawn
  function boardDir() {
    try { var sd = root._fidsShownDir; if (sd === 'arr' || sd === 'dep') return sd; } catch (e) {}
    try { /* global mode */ return (typeof mode !== 'undefined' && mode === 'arr') ? 'arr' : 'dep'; } catch (e) { return 'dep'; }
  }
  function boardRows(dir) { try { /* global data */ return (typeof data !== 'undefined' && data && data[dir]) || []; } catch (e) { return []; } }
  function realCode(c) { try { if (typeof _realIata === 'function') return String(_realIata(c) || c).toUpperCase(); } catch (e) {} return c; }
  // the code the board's map reading finds in a row's words (fids-core.js
  // _iataFromRowName), for a row with no code of its own
  function rowWords(t) { try { /* global _iataFromRowName */ if (typeof _iataFromRowName === 'function') return _iataFromRowName(t) || ''; } catch (e) {} return ''; }
  function S() { return root.BoardStrings || null; }
  // the language on screen, and the board's languages (a name is placed by
  // the widest of them)
  function shownLang() { try { /* global lang */ if (typeof lang !== 'undefined' && lang) return String(lang); } catch (e) {} return ''; }
  function boardLangsNow() {
    var out = [];
    try { var B = S(); if (B && B.pairLangs) out = B.pairLangs().slice(); } catch (e) { out = []; }
    var cur = shownLang(); if (cur && out.indexOf(cur) < 0) out.push(cur);
    return out;
  }
  // the board's own city helpers (fids-core.js), for cityNameOf and namedBy
  var BFN = null;
  function boardFns() {
    if (BFN) return BFN;
    /* global formatCityIata, _stripCityCode, airportCityNameSafe_v21877, normalizeDisplayCity, CITY, CITY_FR */
    BFN = {
      formatCityIata: typeof formatCityIata === 'function' ? formatCityIata : null,
      stripCode: typeof _stripCityCode === 'function' ? _stripCityCode : null,
      tableCity: typeof airportCityNameSafe_v21877 === 'function' ? airportCityNameSafe_v21877 : null,
      normalize: typeof normalizeDisplayCity === 'function' ? normalizeDisplayCity : null,
      inTables: function (c) { try { return !!((typeof CITY !== 'undefined' && CITY[c]) || (typeof CITY_FR !== 'undefined' && CITY_FR[c])); } catch (e) { return false; } },
      // (v24070: the floor's own table, js/earth-places.js, once loaded)
      placeName: function (c) { return (PLACES && PLACES.nameOf) ? PLACES.nameOf(c) : ''; },
      // (v24073: where a name of it is another place's too, and a
      // country's name in a language of the board's)
      placeIn: function (c) { return (PLACES && PLACES.inOf) ? PLACES.inOf(c) : ''; },
      regionName: function (cc, l) { var B = S(); try { return new Intl.DisplayNames([B.intl(l)], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; } },
      onlyHere: function (c) { return !boardAt(c) && !!(PLACES && PLACES.AT && Object.prototype.hasOwnProperty.call(PLACES.AT, c)); },
      /* global _iataFromCityName */
      readWords: function (w) { var r = ''; try { if (typeof _iataFromCityName === 'function') r = _iataFromCityName(w) || ''; } catch (e) { r = ''; } return r || rowWords(w); },
      at: coordsOf
    };
    return BFN;
  }
  // the city exactly as the row prints it in a language (cityNameOf: a list
  // of stops is named by the row's code)
  function cityName(code, raw, l, brief) { return cityNameOf(boardFns(), code, raw, l, brief); }
  // the instant the board's clocks show (the 10:10 demo clock on an example board)
  function nowFor(tz) {
    try { var B = S(); if (B && B.clockNow) return B.clockNow(new Date(), tz); } catch (e) {}
    return new Date();
  }
  function timeThere(at, tz) {
    if (!tz) return '';
    try { var B = S(); if (B && B.boardTime) return B.boardTime(at, tz) || ''; } catch (e) {}
    return '';
  }
  // the airport's own month (the day picture is that month's)
  function monthAt(ms, tz) {
    try {
      var G = root.FIDSGateDate;
      var n = G && G.zonedDateOrdinal ? G.zonedDateOrdinal(ms, tz || 'UTC') : null;
      if (typeof n === 'number' && isFinite(n)) return new Date(n * 86400000).getUTCMonth() + 1;
    } catch (e) {}
    return new Date(ms).getUTCMonth() + 1;
  }
  // the airport's own date, as a day number (its places are gathered per day)
  function dayAt(ms, tz) {
    try {
      var G = root.FIDSGateDate;
      var n = G && G.zonedDateOrdinal ? G.zonedDateOrdinal(ms, tz || 'UTC') : null;
      if (typeof n === 'number' && isFinite(n)) return String(n);
    } catch (e) {}
    return String(Math.floor(ms / 86400000));
  }
  function rgbOf(str) { var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(str || ''); return m ? [+m[1], +m[2], +m[3]] : null; }
  function el(name, attrs, parent) { var e = doc.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function hidden() {
    try { if (doc.hidden) return true; } catch (e) {}
    try { if (typeof root._ocIdle === 'function' && root._ocIdle()) return true; } catch (e) {}
    return false;
  }

  // ── which look this screen wants ───────────────────────────────────────────
  var urlFloor = '';
  try { var _fq = new URLSearchParams(root.location.search).get('floor'); if (_fq === 'classic' || _fq === 'earth') urlFloor = _fq; } catch (e) {}
  function wanted() {
    if (urlFloor) return urlFloor === 'earth';
    return HTML.getAttribute('data-fids-floor-pref') !== 'classic';
  }

  // ── work in slices: never hold the page more than SLICE_MS at a time ──────
  // (workMs: all the floor's own main-thread time, projecting and lighting;
  // overlayMs: laying out and drawing the routes and names)
  var stats = { slices: 0, maxSliceMs: 0, maxBlockMs: 0, cacheHits: 0, builds: 0, files: 0, fileErrors: 0, workMs: 0, overlayMs: 0, overlays: 0 };
  var disabled = false;
  function slices(step, fin, acct) {
    function tick() {
      if (disabled) return;
      if (hidden()) { setTimeout(tick, 500); return; }          // work in hand waits while the board is out of sight
      var t0 = performance.now(), done = false;
      try { done = step(t0 + SLICE_MS); } catch (err) { fail(err); return; }
      var dt = performance.now() - t0;
      stats.slices++; stats.workMs += dt; if (dt > stats.maxSliceMs) stats.maxSliceMs = +dt.toFixed(1);
      if (acct) acct.ms += dt;
      if (done) { try { fin(); } catch (err2) { fail(err2); } } else setTimeout(tick, 0);
    }
    setTimeout(tick, 0);
  }

  // ── the pictures: kept compressed, decoded only to be read ─────────────────
  var blobs = {}, blobOrder = [], blobBytes = 0, pending = {};
  function getBlob(url) {
    if (blobs[url]) { blobOrder.splice(blobOrder.indexOf(url), 1); blobOrder.push(url); return Promise.resolve(blobs[url]); }
    if (pending[url]) return pending[url];
    var p = fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      delete pending[url];
      if (!b || !b.size) { stats.fileErrors++; return null; }
      stats.files++;
      blobs[url] = b; blobOrder.push(url); blobBytes += b.size;
      while (blobBytes > BLOB_BUDGET && blobOrder.length > 1) { var old = blobOrder.shift(); blobBytes -= blobs[old].size; delete blobs[old]; }
      return b;
    }, function () { delete pending[url]; stats.fileErrors++; return null; });
    pending[url] = p;
    return p;
  }
  function decode(b) {
    if (!b) return Promise.resolve(null);
    var viaImg = function () {
      return new Promise(function (ok) {
        var u = URL.createObjectURL(b), img = new Image();
        img.onload = function () { URL.revokeObjectURL(u); ok(img); };
        img.onerror = function () { URL.revokeObjectURL(u); ok(null); };
        img.src = u;
      });
    };
    if (typeof root.createImageBitmap === 'function') return root.createImageBitmap(b).then(null, viaImg);
    return viaImg();
  }
  var scratch = null;
  function pixelsOf(img, bbox) {
    var t0 = performance.now(), w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var c = scratch || (scratch = doc.createElement('canvas'));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    var t = { d: x.getImageData(0, 0, w, h).data, w: w, h: h, lat0: bbox[0], lon0: bbox[1], lat1: bbox[2], lon1: bbox[3] };
    try { if (img.close) img.close(); } catch (e) {}
    var dt = performance.now() - t0; if (dt > stats.maxBlockMs) stats.maxBlockMs = +dt.toFixed(1);
    return t;
  }
  function freeScratch() { if (scratch) { scratch.width = 1; scratch.height = 1; } }

  // ── one floor size: its view, its projected planet, its own canvas ────────
  var K = 1, K_FORCED = false, slowRun = 0, slowHalf = 0, relightEvery = 1;
  try {
    var qk = new URLSearchParams(root.location.search).get('earthscale');
    if (qk === '0.5' || qk === '1') { K = +qk; K_FORCED = true; }
    else if ((navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)) K = 0.5;
  } catch (e) {}
  // THE LIT FLOORS AT HAND, newest first: a board's whole rotation (its
  // departures and arrivals, each at the heights its pages leave), so a page
  // or a direction seen once comes back at once. Within CACHE_BYTES the
  // oldest first let go of their projected colours (they are projected again
  // if they are re-lit), then go; never the floor on screen, nor the one
  // being built to replace it.
  var cache = [];
  function cached(key) {
    for (var i = 0; i < cache.length; i++) if (cache[i].key === key) { var e = cache[i]; cache.splice(i, 1); cache.unshift(e); trim(); return e; }
    return null;
  }
  function drop(x) { x.day = x.night = null; x.dropped = true; if (x.cv !== shown) { x.cv.width = 1; x.cv.height = 1; } }
  function bytesOf(x) { return x.Wk * x.Hk * (x.day ? 10 : 4); }
  function trim() {
    var keep = function (x) { return x === cur || x.cv === shown; };
    var total = 0; cache.forEach(function (x) { total += bytesOf(x); });
    for (var i = cache.length - 1; i >= 0 && (cache.length > CACHE_MAX || total > CACHE_BYTES); i--) {
      var x = cache[i]; if (keep(x)) continue;
      if (x.day && cache.length <= CACHE_MAX) { total -= x.Wk * x.Hk * 6; x.day = x.night = null; x.stale = true; continue; }
      total -= bytesOf(x); drop(x); cache.splice(i, 1);
    }
    for (var j = cache.length - 1; j >= 0 && total > CACHE_BYTES; j--) {
      var y = cache[j]; if (keep(y)) continue;
      total -= bytesOf(y); drop(y); cache.splice(j, 1);
    }
  }
  function remember(e) { cache.unshift(e); trim(); }

  // Project the pictures through the view, once per floor size: where each
  // pixel is on Earth first; then each picture in turn is read and let go
  function build(e, done) {
    var v = e.view, Wk = e.Wk, Hk = e.Hk, Kk = e.K, n = Wk * Hk;
    var la = new Float32Array(n), lo = new Float32Array(n), cov = { day: new Uint8Array(n), night: new Uint8Array(n) };
    var day = new Uint8ClampedArray(n * 3), night = new Uint8ClampedArray(n * 3);
    var lvl = levelFor(v, Kk), tiles = lvl ? tilesFor(v, e.W, e.H, lvl) : [], jobs = [];
    tiles.forEach(function (t) {
      ['day', 'night'].forEach(function (L) { jobs.push({ kind: lvl, layer: L, bbox: [t.latS, t.lonW, t.latS + t.sp, t.lonW + t.sp] }); });
    });
    jobs.forEach(function (j) { j.p = getBlob(texSrc(j.kind, j.layer, j.bbox[0], j.bbox[1], e.month)); });
    e.level = lvl; e.tiles = tiles.length; e.world = false;
    var acct = { ms: 0 }, B = v.B, R = v.R, cx = v.cx, cy = v.cy, row = 0, got = 0;
    var lim2 = Math.pow(1 + 0.5 / (R * Kk), 2);
    slices(function (end) {
      for (; row < Hk; row++) {
        var sy0 = (cy - (row + 0.5) / Kk) / R;
        for (var px = 0; px < Wk; px++) {
          var i = row * Wk + px, sx = ((px + 0.5) / Kk - cx) / R, sy = sy0, rr = sx * sx + sy * sy;
          if (rr >= lim2) { la[i] = 99; continue; }
          if (rr > 1) { var k1 = 1 / Math.sqrt(rr); sx *= k1; sy *= k1; rr = 1; }   // the anti-aliased rim takes the edge's colour
          var z = Math.sqrt(Math.max(0, 1 - rr));
          var wx = sx * B.r[0] + sy * B.u[0] + z * B.n[0], wy = sx * B.r[1] + sy * B.u[1] + z * B.n[1], wz = sx * B.r[2] + sy * B.u[2] + z * B.n[2];
          la[i] = Math.asin(clamp(wz, -1, 1)) * DEG; lo[i] = Math.atan2(wy, wx) * DEG;
        }
        if (performance.now() > end) { row++; return false; }
      }
      return true;
    }, function () { next(0); }, acct);
    function next(j) {
      if (e.dropped || disabled) return;
      if (j >= jobs.length) {
        // anything the squares left uncovered takes the whole-Earth picture
        if (!e.world) {
          var left = 0; for (var i = 0; i < n && !left; i++) if (la[i] !== 99 && (!cov.day[i] || !cov.night[i])) left = 1;
          if (left || !jobs.length) {
            e.world = true;
            ['day', 'night'].forEach(function (L) { var wj = { kind: 'world', layer: L, bbox: [-90, -180, 90, 180], onlyGaps: true }; wj.p = getBlob(texSrc('world', L, 0, 0, e.month)); jobs.push(wj); });
            return next(j);
          }
        }
        // a floor is ready when both layers cover the whole planet in sight
        var whole = true; for (var i2 = 0; i2 < n && whole; i2++) if (la[i2] !== 99 && (!cov.day[i2] || !cov.night[i2])) whole = false;
        la = lo = cov = null; freeScratch();
        e.day = day; e.night = night; e.stale = false;
        e.projectMs = Math.round(acct.ms); stats.projectMs = e.projectMs;
        e.ready = got > 0 && whole; done(e.ready); return;
      }
      jobs[j].p.then(decode).then(function (img) {
        if (e.dropped || disabled) return;
        if (!img) return next(j + 1);
        var job = jobs[j], t = pixelsOf(img, job.bbox), arr = job.layer === 'day' ? day : night, cv2 = cov[job.layer], gaps = !!job.onlyGaps, r2 = 0;
        got++;
        slices(function (end) {
          for (; r2 < Hk; r2++) {
            var base = r2 * Wk;
            for (var px = 0; px < Wk; px++) {
              var i = base + px;
              if (la[i] === 99 || (gaps && cv2[i])) continue;
              if (sampleInto(t, la[i], lo[i], arr, i * 3)) cv2[i] = 1;
            }
            if (performance.now() > end) { r2++; return false; }
          }
          return true;
        }, function () { t = null; next(j + 1); }, acct);
      }, function (err) { fail(err); });
    }
  }

  // Light the planet for this minute, into this size's canvas. The lights'
  // glow is summed into a small copy as the planet is lit, halved twice more
  // for the wide glow, and both are laid back over it, added: every browser
  // draws it the same, without ctx.filter.
  // the few pixels under the last row where the board's ground turns to the
  // deep navy of space
  function featherOf(h) { return clamp(h * 0.06, 8, 22); }
  // how much of the top of the floor on screen is out of sight (a floor kept
  // up under a page with more rows, past the 6 px a floor size allows), with
  // the turn into the ground that fitShown gives its cut edge; 0 otherwise
  function hiddenTop(e) { e = e || showE || cur; return e && e.H - spaceH > 6 ? e.H - spaceH + featherOf(e.H) : 0; }
  function halve(src) {
    var c = doc.createElement('canvas'); c.width = Math.max(1, Math.round(src.width / 2)); c.height = Math.max(1, Math.round(src.height / 2));
    var x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function shade(e, done) {
    if (!e || !e.ready || !e.day) { if (done) done(); return; }
    var at = nowFor(apTz(AP0)), ms = at.getTime(), minute = Math.floor(ms / 60000);
    var lk = minute + '|' + ground.join(',');
    if (e.litKey === lk) { if (done) done(); return; }
    if (e.shading) { (e.waiters = e.waiters || []).push(done); return; }
    e.shading = true;
    var Sn = sunAt(ms), v = e.view, B = v.B, R = v.R, cx = v.cx, cy = v.cy, Kk = e.K, Wk = e.Wk, Hk = e.Hk;
    var s = [dot(Sn.v, B.r), dot(Sn.v, B.u), dot(Sn.v, B.n)];
    var c2 = e.cv.getContext('2d');
    var img = c2.createImageData(Wk, Hk), o = img.data;
    var q = Math.max(1, Math.round(((e.H >= MIN_FULL) ? 4 : 2) * Kk)), gwq = Math.ceil(Wk / q), ghq = Math.ceil(Hk / q), gsum = new Float32Array(gwq * ghq * 3);
    var g = ground.slice(), day = e.day, night = e.night;
    var feather = featherOf(e.H), row = 0, acct = { ms: 0 };
    slices(function (end) {
      for (; row < Hk; row++) {
        var yF = (row + 0.5) / Kk, sy = (cy - yF) / R;
        // the sky above the edge: the board's own ground under the last row,
        // turning within a few pixels to the deep navy of space
        var f = smooth(0, feather, yF);
        var skr = g[0] + (SPACE[0] - g[0]) * f, skg = g[1] + (SPACE[1] - g[1]) * f, skb = g[2] + (SPACE[2] - g[2]) * f;
        for (var px = 0; px < Wk; px++) {
          var i = row * Wk + px, j = i * 4, k = i * 3, sx = ((px + 0.5) / Kk - cx) / R;
          var rr = sx * sx + sy * sy, rad = Math.sqrt(rr), dpx = (rad - 1) * R;
          var sr = skr, sg = skg, sb = skb;
          if (dpx > -2 && dpx < 160) {
            // the thin shell of air lit along the edge: blue by day, a warm
            // band at dusk, faint airglow by night
            var mul = (sx * s[0] + sy * s[1]) / (rad || 1);
            var gw = Math.exp(-Math.max(0, dpx) / 7) * 0.85 + Math.exp(-Math.max(0, dpx) / 34) * 0.32;
            var dayL = smooth(-0.12, 0.25, mul), dusk = Math.exp(-Math.pow((mul + 0.02) / 0.10, 2));
            sr = clamp(sr + (22 + 120 * dayL + 150 * dusk) * gw, 0, 255);
            sg = clamp(sg + (48 + 140 * dayL + 70 * dusk) * gw, 0, 255);
            sb = clamp(sb + (92 + 160 * dayL + 20 * dusk) * gw, 0, 255);
          }
          var c = (1 - rad) * R * Kk + 0.5;                       // coverage of the planet (anti-aliased rim)
          if (c <= 0) { o[j] = sr; o[j + 1] = sg; o[j + 2] = sb; o[j + 3] = 255; continue; }
          if (c > 1) c = 1;
          var z = Math.sqrt(Math.max(0, 1 - rr)), mu = sx * s[0] + sy * s[1] + z * s[2];
          var dayF = smooth(-0.075, 0.09, mu);
          var lit = (0.2 + 0.8 * (mu > 0 ? Math.pow(mu, 0.55) : 0)) * 0.9;   // a touch under full sun: the rows stay the brightest thing
          var dusk2 = Math.exp(-Math.pow((mu - 0.02) / 0.08, 2));
          var dr = day[k] * lit * (1.0 + 0.10 * dusk2), dg = day[k + 1] * lit * (1 - 0.14 * dusk2), db = day[k + 2] * lit * (1 - 0.30 * dusk2);
          var haze = Math.pow(1 - z, 2.4) * 0.75 * dayF;          // air seen edge-on hazes blue by day
          dr = dr + (120 - dr) * haze; dg = dg + (170 - dg) * haze; db = db + (240 - db) * haze;
          // night: a deep blue planet, its land faintly moonlit, and its
          // lights, which come on at dusk
          var Lr = night[k], Lg = night[k + 1], Lb = night[k + 2];
          var Lm = Math.max(Lr, Lg, Lb) / 255, lightsF = 1 - smooth(-0.10, 0.03, mu);
          var dl = 0.3 * day[k] + 0.6 * day[k + 1] + 0.1 * day[k + 2];
          var nr = 3 + Lr * 0.80 + dl * 0.10, ng = 6 + Lg * 0.80 + dl * 0.14, nb = 16 + Lb * 0.92 + dl * 0.26;
          var ice = smooth(0.06, 0.16, (Lb - Lr) / 255) * (1 - smooth(0.45, 0.75, Lm));
          var lk2 = smooth(0.26, 0.86, Lm) * (1 - ice) * 1.45 * lightsF;
          if (lk2 > 0.02) { var gk = Math.min(1, lk2 * 1.4) * c, gi = (((row / q) | 0) * gwq + ((px / q) | 0)) * 3; gsum[gi] += 255 * gk; gsum[gi + 1] += 205 * gk; gsum[gi + 2] += 140 * gk; }
          var er = (dr * dayF + nr * (1 - dayF)) + 255 * lk2, eg = (dg * dayF + ng * (1 - dayF)) + 216 * lk2, eb = (db * dayF + nb * (1 - dayF)) + 158 * lk2;
          var ag2 = Math.pow(1 - z, 6) * (1 - dayF) * 0.6;         // the night side's own edge glows faintly
          er += 20 * ag2; eg += 60 * ag2; eb += 120 * ag2;
          o[j] = sr + (clamp(er, 0, 255) - sr) * c; o[j + 1] = sg + (clamp(eg, 0, 255) - sg) * c; o[j + 2] = sb + (clamp(eb, 0, 255) - sb) * c; o[j + 3] = 255;
        }
        if (performance.now() > end) { row++; return false; }
      }
      return true;
    }, function () {
      var t0 = performance.now(), sm = doc.createElement('canvas'); sm.width = gwq; sm.height = ghq;
      var sx2 = sm.getContext('2d'), gi2 = sx2.createImageData(gwq, ghq), gd = gi2.data, inv = 1 / (q * q);
      for (var m = 0, mm = gwq * ghq; m < mm; m++) { gd[m * 4] = gsum[m * 3] * inv; gd[m * 4 + 1] = gsum[m * 3 + 1] * inv; gd[m * 4 + 2] = gsum[m * 3 + 2] * inv; gd[m * 4 + 3] = 255; }
      sx2.putImageData(gi2, 0, 0);
      var wide = halve(halve(sm));
      acct.ms += performance.now() - t0;
      // written in bands of rows between frames: from one minute to the next
      // the light moves a quarter of a degree, so no band is seen to differ
      var band = 0, BAND = 48, gsy = sm.height / Hk, wsy = wide.height / Hk;
      slices(function (end) {
        for (; band * BAND < Hk; band++) {
          var y0 = band * BAND, bh = Math.min(BAND, Hk - y0);
          c2.putImageData(img, 0, 0, 0, y0, Wk, bh);
          c2.save(); c2.globalCompositeOperation = 'lighter'; c2.imageSmoothingEnabled = true;
          c2.globalAlpha = 0.9; c2.drawImage(sm, 0, y0 * gsy, sm.width, bh * gsy, 0, y0, Wk, bh);
          c2.globalAlpha = 0.55; c2.drawImage(wide, 0, y0 * wsy, wide.width, bh * wsy, 0, y0, Wk, bh);
          c2.restore();
          if (performance.now() > end) { band++; return band * BAND >= Hk; }
        }
        return true;
      }, function () { finish(); }, acct);
    }, acct);
    function finish() {
      e.litKey = lk; e.shading = false; e.shadeMs = Math.round(acct.ms);
      stats.shadeMs = e.shadeMs; stats.scale = Kk;
      stats.sun = { lat: +Sn.lat.toFixed(2), lon: +Sn.lon.toFixed(2), at: ms };
      // a screen too slow for full size draws the planet at half size from
      // then on (the routes and names stay sharp): after THREE re-lights in a
      // row over 150 ms of work, so one busy moment never decides it; at half
      // size, three over 400 ms re-light every 5 minutes
      if (!K_FORCED && K === 1 && Kk === 1) {
        slowRun = e.shadeMs > 150 ? slowRun + 1 : 0;
        // (the floor on screen stays up until its half-size copy is lit)
        if (slowRun >= 3) { K = 0.5; stats.dropped = 'half'; cache.forEach(drop); cache.length = 0; curKey = ''; viewMemo = {}; }
      } else if (Kk === 0.5 && relightEvery === 1) {
        slowHalf = e.shadeMs > 400 ? slowHalf + 1 : 0;
        if (slowHalf >= 3) { relightEvery = 5; stats.dropped = 'slow'; }
      }
      var w = e.waiters || []; e.waiters = null;
      if (done) done(); w.forEach(function (fn) { if (fn) fn(); });
    }
  }

  // ── drawing the layout into the SVG ────────────────────────────────────────
  var measureCtx = null, faceCache = '';
  function face() {
    try { var f = root.getComputedStyle(layer).fontFamily; if (f) faceCache = f; } catch (e) {}
    return faceCache || 'sans-serif';
  }
  // a name's width as drawn: the glyphs, the 0.01 em tracking the stylesheet
  // adds to each letter, and the halo round the ends
  function textW(s, fs) {
    if (!measureCtx) measureCtx = doc.createElement('canvas').getContext('2d');
    measureCtx.font = '700 ' + fs + 'px ' + face();
    return measureCtx.measureText(s).width + String(s).length * fs * 0.01 + fs * 0.2;
  }
  function pathOf(run) { return run.map(function (q, i) { return (i ? 'L' : 'M') + q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(''); }
  function txt(parent, t) {
    var n = el('text', { x: t.x.toFixed(1), y: t.y.toFixed(1), 'dominant-baseline': 'central', 'text-anchor': t.anchor || 'start', 'font-size': t.fs, fill: '#fff', stroke: HALO, 'stroke-opacity': 0.6, 'stroke-width': (t.fs * 0.2).toFixed(1) }, parent);
    n.textContent = t.s; return n;
  }
  // the small clock mark that says "the time there", its hands at that time
  function clockMark(parent, c) {
    if (!c) return;
    var g = el('g', {}, parent), sw = Math.max(1.6, c.r * 0.17);
    el('circle', { cx: c.cx.toFixed(1), cy: c.cy.toFixed(1), r: c.r.toFixed(1), fill: 'none', stroke: '#fff', 'stroke-width': sw.toFixed(2) }, g);
    if (!c.hands) return;
    var ha = c.hands.h * RAD, ma = c.hands.m * RAD;
    el('line', { x1: c.cx.toFixed(1), y1: c.cy.toFixed(1), x2: (c.cx + Math.sin(ha) * c.r * 0.5).toFixed(1), y2: (c.cy - Math.cos(ha) * c.r * 0.5).toFixed(1), stroke: '#fff', 'stroke-width': (sw * 1.1).toFixed(2), 'stroke-linecap': 'round' }, g);
    el('line', { x1: c.cx.toFixed(1), y1: c.cy.toFixed(1), x2: (c.cx + Math.sin(ma) * c.r * 0.74).toFixed(1), y2: (c.cy - Math.cos(ma) * c.r * 0.74).toFixed(1), stroke: '#fff', 'stroke-width': (sw * 0.85).toFixed(2), 'stroke-linecap': 'round' }, g);
  }
  // the names, routes and dots of one floor, at that floor's own size (it
  // stands at the foot of the layer, like its planet)
  function render(L, fw, fh) {
    svg.textContent = '';
    if (!L) return;
    var W = fw, H = fh;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = W + 'px'; svg.style.height = H + 'px';
    var defs = el('defs', {}, svg);
    var sh = el('filter', { id: 'ocfSh', x: '-20%', y: '-40%', width: '140%', height: '180%' }, defs);
    el('feDropShadow', { dx: 0, dy: 1, stdDeviation: 2.2, 'flood-color': HALO, 'flood-opacity': 0.85 }, sh);
    var gR = el('g', {}, svg), gD = el('g', {}, svg), gL = el('g', { filter: 'url(#ocfSh)' }, svg);
    // a name's knock-out cuts its own route away under it, and no other
    // (v24070: each route its own mask)
    var kos = {}, koN = 0;
    L.knockouts.forEach(function (b) { var k = b.code || '*'; (kos[k] || (kos[k] = [])).push(b); });
    var maskFor = function (code) {
      var list = (kos[code] || []).concat(kos['*'] || []);
      if (!list.length) return null;
      var id = 'ocfKO' + (++koN);
      var ko = el('mask', { id: id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
      el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }, ko);
      list.forEach(function (b) { el('rect', { x: b.x0.toFixed(1), y: b.y0.toFixed(1), width: (b.x1 - b.x0).toFixed(1), height: (b.y1 - b.y0).toFixed(1), rx: 6, fill: '#000' }, ko); });
      return 'url(#' + id + ')';
    };
    L.routes.forEach(function (r) {
      var m = maskFor(r.code), gr = m ? el('g', { mask: m }, gR) : gR;
      r.runs.forEach(function (run) {
        var d = pathOf(run);
        el('path', { d: d, fill: 'none', stroke: HALO, 'stroke-opacity': (0.30 * r.op).toFixed(2), 'stroke-width': (r.w + 3).toFixed(1), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, gr);
        el('path', { d: d, fill: 'none', stroke: '#fff', 'stroke-opacity': r.op.toFixed(2), 'stroke-width': r.w.toFixed(1), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, gr);
      });
    });
    if (L.hub) {
      var hb = L.hub;
      el('circle', { cx: hb.x.toFixed(1), cy: hb.y.toFixed(1), r: hb.r, fill: 'none', stroke: HALO, 'stroke-opacity': 0.35, 'stroke-width': 5 }, gD);
      el('circle', { cx: hb.x.toFixed(1), cy: hb.y.toFixed(1), r: hb.r, fill: 'none', stroke: '#fff', 'stroke-width': 2.4 }, gD);
      el('circle', { cx: hb.x.toFixed(1), cy: hb.y.toFixed(1), r: hb.dot, fill: '#fff' }, gD);
    }
    L.dots.forEach(function (d) { el('circle', { cx: d.x.toFixed(1), cy: d.y.toFixed(1), r: d.r, fill: '#fff', 'fill-opacity': d.op, stroke: HALO, 'stroke-opacity': 0.5, 'stroke-width': 1.6 }, gD); });
    (L.arrows || []).forEach(function (w) { el('path', { d: arrowPath(w), fill: '#fff', 'fill-opacity': w.op, stroke: HALO, 'stroke-opacity': 0.5, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, gD); });
    L.leaders.forEach(function (l) {
      el('line', { x1: l.x1.toFixed(1), y1: l.y1.toFixed(1), x2: l.x2.toFixed(1), y2: l.y2.toFixed(1), stroke: HALO, 'stroke-opacity': 0.35 * l.op, 'stroke-width': 3.4, 'stroke-linecap': 'round' }, gD);
      el('line', { x1: l.x1.toFixed(1), y1: l.y1.toFixed(1), x2: l.x2.toFixed(1), y2: l.y2.toFixed(1), stroke: '#fff', 'stroke-opacity': 0.7 * l.op, 'stroke-width': 1.4, 'stroke-linecap': 'round' }, gD);
    });
    L.labels.forEach(function (lab) {
      var gg = el('g', { opacity: lab.op }, gL);
      lab.rows.forEach(function (row) {
        var lg = row.op === 1 ? gg : el('g', { opacity: row.op }, gg);
        row.texts.forEach(function (t) { txt(lg, t); });
        clockMark(lg, row.clock);
      });
    });
  }

  // ── what is on screen ──────────────────────────────────────────────────────
  //   W, H     the size the floor is built for (it follows the space under
  //            the rows once a new size has held SETTLE_MS, or at once when a
  //            lit floor of that size is at hand)
  //   shown    the planet on screen; it stays until the next one is lit
  var layer = null, svg = null, shown = null, W = 0, H = 0, AP0 = '', curKey = '', LSIG = '', lastBucket = -1;
  var cur = null, P = null, here = null, ground = [16, 40, 80], painted = false, retryAt = 0, lastLayout = null, bare = false, bornAt = Date.now();
  var pend = null, viewMemo = {}, shapeStore = { dep: {}, arr: {} }, shapeDay = '', spaceH = 0, fitSig = '';
  //   showE    the floor whose planet is on screen (its names are the ones drawn)
  //   drawn    what the names on screen were drawn for: { e, list, wsig, pk }
  //            (pk: the floor and page its places were chosen for)
  var showE = null, drawn = null;
  // the places each page's floor names (fillNames: up to 7 layouts), kept
  // per floor, page and set of languages, so a board turning its pages round
  // or its languages back and forth lays each out once
  var fillMemo = {}, fillKeys = [];
  function memoGet(k) { return Object.prototype.hasOwnProperty.call(fillMemo, k) ? fillMemo[k] : null; }
  function memoSet(k, v) {
    if (!memoGet(k)) { fillKeys.push(k); if (fillKeys.length > 24) delete fillMemo[fillKeys.shift()]; }
    fillMemo[k] = v;
  }
  // a planet goes on screen in place of the one there, in one step: it stands
  // at the foot of the layer at its own size, so a floor kept up while the
  // next is built is never stretched (a taller one is cut at its top edge, a
  // shorter one stands under its own sky: fitShown)
  function showCanvas(e) {
    var cv = e ? e.cv : null;
    showE = e || null;
    if (shown === cv) return;
    if (cv) layer.insertBefore(cv, (shown && shown.parentNode === layer) ? shown : svg);
    if (shown && shown.parentNode) shown.parentNode.removeChild(shown);
    shown = cv;
    fitShown();
  }
  // nothing on the floor: no planet, no names
  function blank() { showCanvas(null); if (svg) svg.textContent = ''; drawn = null; }
  // a floor kept up in a space of another height until the next is lit:
  // shorter, the space above it is the floor's own sky (the board's ground
  // turning to the navy of space, as its top does, and its own turn hidden);
  // taller, its cut top edge turns into the board's ground the same way.
  // Never a band of flat ground, never a hard edge under the rows.
  function fitShown() {
    if (!layer) return;
    var fh = shown ? +shown.getAttribute('data-h') || 0 : 0, gap = spaceH - fh, f = Math.ceil(featherOf(fh));
    var bg = '', clip = '', mask = '';
    if (shown && fh && gap > 6) {
      bg = 'linear-gradient(rgb(' + ground.join(',') + ') 0px, rgb(' + SPACE.join(',') + ') ' + f + 'px)';
      clip = 'inset(' + f + 'px 0px 0px 0px)';
    } else if (shown && fh && gap < -6) {
      mask = 'linear-gradient(transparent 0px, #000 ' + f + 'px)';
    }
    // written only when it changes (the browser reports these back in its
    // own form, so the last values written are kept here)
    var sig = bg + '|' + clip + '|' + mask;
    if (shown && shown.getAttribute('data-fit') !== clip) { shown.style.clipPath = clip; shown.setAttribute('data-fit', clip); }
    if (sig === fitSig) return;
    fitSig = sig;
    layer.style.backgroundImage = bg;
    layer.style.webkitMaskImage = mask; layer.style.maskImage = mask;
  }
  // v24079 — and the page's own wait (data-fids-floor-wait, stamped in
  // fids.html's head so the old backdrop never shows for a moment before the
  // first planet) ends either way: a planet up takes its place, a floor torn
  // down (not wanted, its pictures failed, an error) brings the old backdrop
  // back as before
  function setPainted(on) {
    painted = !!on;
    if (on) HTML.setAttribute('data-fids-floor', 'earth'); else HTML.removeAttribute('data-fids-floor');
    endWait();
  }
  function endWait() { if (HTML.hasAttribute('data-fids-floor-wait')) HTML.removeAttribute('data-fids-floor-wait'); }
  // the floor appears: at once on a screen that asks for reduced motion, and
  // the first time otherwise with one 2.4 s fade (never again for a page or
  // a size change: a ready floor swaps its pictures in)
  function becomeReady() {
    setPainted(true);
    if (!layer || layer.classList.contains('ready')) return;
    layer.classList.add('ready');
    var still = false;
    try { still = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    try { if (!still && layer.animate) layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2400, easing: 'ease' }); } catch (e) {}
  }
  function clearLayer() {
    cur = null; blank(); lastLayout = null;
    if (layer) { layer.classList.remove('ready'); layer.setAttribute('data-mode', 'none'); }
  }
  // the old backdrop back, and nothing drawn
  function teardown() { clearLayer(); curKey = ''; setPainted(false); }
  function fail(err) {
    stats.err = String(err && err.message || err).slice(0, 200);
    disabled = true;
    try { teardown(); } catch (e) {}
  }
  function pageCodes() {
    var out = [], seen = {};
    try {
      Array.prototype.forEach.call(doc.querySelectorAll('#fidsTable tr[data-flight][data-iata]'), function (tr) {
        var c = realCode(rowCode(tr.getAttribute('data-iata'), tr.getAttribute('data-loc'), rowWords));
        if (c && !seen[c]) { seen[c] = 1; out.push(c); }
      });
    } catch (e) {}
    return out;
  }
  function placesNow() {
    var dir = boardDir();
    return placesFrom(boardRows(dir), { dir: dir, ap0: AP0, now: Date.now(), coords: coordsOf, tz: apTz, real: realCode, codeOf: rowWords, named: hasName });
  }
  // A PLACE IS NAMED, OR IT IS NOT ON THE MAP (v24067). Every place in the
  // board's tables has a name (tests/earth-floor-places.test.js), but a row
  // can carry a code whose name the board cannot give (a code with a digit,
  // a table entry on the wrong place), and the floor drew it under its code
  // as a word ('Ebm', 'Km8'). A place the board names only by its code is
  // left off the map; the rows still list it (namedBy: a table name counts,
  // and so do the row's words when they are more than the code). (Once per
  // row and its words.)
  var nameSeen = {}, nameSeenN = 0;
  function hasName(code, text) {
    // (v24070: and whether the floor's own table had come: a name it gives
    // is not cached as missing while it is on its way)
    var k = (PLACES ? '+' : '-') + code + '|' + text;
    if (Object.prototype.hasOwnProperty.call(nameSeen, k)) return nameSeen[k];
    if (++nameSeenN > 800) { nameSeen = {}; nameSeenN = 1; }
    var B = boardFns();
    return (nameSeen[k] = namedBy(B, code, text) && !misread(B, code, text));
  }
  // the places one floor draws, each with its name in every language
  // the places a floor shows: on a full floor the rows above it, on a strip
  // the next flight still to come; none at all on a board showing no rows
  // (no flights in its window, its feed down): the planet and the airport
  function viewPlaces(md, h, all) {
    if (bare) return [];
    if (md !== 'full') return P.list.filter(function (p) { return p.isNext; });
    var pg = onPage(P.list, pageCodes());
    return all ? pg : pg.slice(0, capFor(h));
  }
  // a place the map read from a row's words ('Montreal-Trdeau', 'Harrisburg,
  // PA') is named as the board names its airport, through formatCityIata in
  // the language on screen like every name here; the row's words only where
  // the board has no name for it ('Ft Mackay/Firebag')
  function ownName(p) {
    if (!p.read) return p.raw;
    var n = ''; try { if (typeof airportCityNameSafe_v21877 === 'function') n = airportCityNameSafe_v21877(p.code, 'en'); } catch (e) {}
    return n || p.raw;
  }
  function named(list) {
    var langs = boardLangsNow(), cur0 = shownLang();
    return list.map(function (p) {
      var raw = ownName(p);
      var names = langs.map(function (l) { return cityName(p.code, raw, l, p.brief); });
      var name = cityName(p.code, raw, cur0 || undefined, p.brief);
      if (names.indexOf(name) < 0) names.push(name);
      return { code: p.code, lat: p.lat, lon: p.lon, tz: p.tz, isNext: p.isNext, done: p.done, rank: p.rank, n: p.n, name: name, names: names };
    });
  }
  // THE WORDS ON THE FLOOR ARE ALWAYS THE BOARD'S OWN. What they were drawn
  // in: the board's languages, the one on screen, its clock (12-hour led by
  // English, 24-hour by any other: BoardStrings.boardClock24) and the minute
  // the times read. The names and times are drawn for the floor ON SCREEN
  // (showE), which is not always the current one: while the next floor is
  // being lit, the one on screen stays up, and so did the words it was drawn
  // with — a board turned to French kept "9:10 AM" under its rows until the
  // next floor was lit, seconds later on a slow screen (the rendered language
  // check failed on it in CI, 2026-10-19). Now a change of the board's
  // languages is drawn at once, inside the change itself (BoardStrings.onLangs),
  // and so is a turn of the language on screen (ocfEarthWords, called by the
  // board's paging clock and rotation timer), whatever is being lit. Besides
  // those, the one-second look compares the words with wordsSig while the
  // next floor is being lit (refreshWords), and on a lit floor redraws them
  // when its layout's languages differ (layoutSig) or at the re-light (each
  // minute, or each 5 on a slow screen).
  function clock24() { try { var B = S(); return !!(B && B.boardClock24 && B.boardClock24()); } catch (e) { return false; } }
  function wordsSig() {
    var mn = 0; try { mn = Math.floor(nowFor(apTz(AP0)).getTime() / 60000); } catch (e) {}
    return shownLang() + '|' + boardLangsNow().join(',') + '|' + (clock24() ? 24 : 12) + '|' + mn;
  }
  // what the layout follows besides the size: the rows, the languages, the
  // next flight, the page, the floor's hidden top
  function layoutSig() {
    var dir = P ? P.dir : boardDir(), rows = boardRows(dir);
    return dir + '|' + rows.map(function (f) { return f._locIata + ':' + f.status; }).join(',') + '|' + shownLang() + '|' + boardLangsNow().join(',') + '|' + (P && P.next ? P.next.code : '') + '|' + pageCodes().join(',') + '|' + Math.round(hiddenTop());
  }
  // quick: inside a change of languages, or a check of the words: never a
  // refill there (the words at once; the places the floor named, or its
  // page's first up to the cap; the refill comes at the first one-second look
  // after it that finds this floor lit and on screen, LSIG = '')
  function drawOverlay(quick) {
    var e = showE;
    if (!e || !e.ready || !P || !here || e.H < MIN_ROUTES) { render(null); drawn = null; return; }
    var at = nowFor(apTz(AP0)), t0 = performance.now(), wsig = wordsSig(), full = e.H >= MIN_FULL;
    // a floor kept up under a page with more rows is cut at its top edge
    // until the next is lit: its names keep to the part in sight
    // (each zone's time once, for all the layouts fillNames tries: v24070)
    var times = {};
    var run = function (lst) {
      return layout({
        view: e.view, W: e.W, H: e.H, top: hiddenTop(e), here: here, full: full, places: named(lst),
        timeOf: function (tz) { return Object.prototype.hasOwnProperty.call(times, tz) ? times[tz] : (times[tz] = timeThere(at, tz)); }, hereTz: apTz(AP0), measure: textW
      });
    };
    // the current floor names this page's places (up to its cap of names:
    // fillNames); a floor kept up while the next is lit keeps the places it
    // named (only its words follow the board)
    var list, pk = '', later = false;
    if (e === cur || !drawn || drawn.e !== e) {
      var pool = viewPlaces(e.md, e.H, true);
      pk = e.key + '|' + hiddenTop(e) + '|' + pool.map(function (p) { return p.code + (p.done ? '~' : '') + (p.isNext ? '!' : ''); }).join(',');
      var fk = pk + '|' + boardLangsNow().join(',') + '|' + (clock24() ? 24 : 12), hit = full ? memoGet(fk) : null;
      if (!full) { list = pool; lastLayout = run(list); }
      else if (hit) { list = hit; lastLayout = run(list); }
      else if (quick) { list = (drawn && drawn.e === e && drawn.pk === pk) ? drawn.list : pool.slice(0, capFor(e.H)); lastLayout = run(list); later = true; }
      else { var fl = fillNames(pool, capFor(e.H), run, function (p) { return briefOf(boardFns(), p); }); list = fl.list; lastLayout = fl.L; memoSet(fk, list); }
    } else { list = drawn.list; pk = drawn.pk; lastLayout = run(list); }
    render(lastLayout, e.W, e.H);
    drawn = { e: e, list: list, wsig: wsig, pk: pk };
    if (e === cur) LSIG = later ? '' : layoutSig();
    stats.overlays++; stats.overlayMs += performance.now() - t0;
  }
  // the words on the floor on screen, drawn again when the board's languages,
  // the one on screen, its clock or the minute have changed since they were
  function refreshWords() {
    if (!drawn || drawn.wsig === wordsSig()) return;
    if (drawn.e !== showE) { render(null); drawn = null; return; }
    drawOverlay(true);
  }
  // THE PLAN FOR A FLOOR SIZE: what it shows and the view it is drawn in.
  // A full floor is framed for its direction's places (shapersOf: the whole
  // rotation, never one page), a strip for the next flight still to come;
  // the key names the view, so two pages, or two sets of places, that frame
  // the planet alike share one lit floor.
  function planFor(w, h, shows, pageW) {
    var md = (!shows || pageW < MIN_PAGE_W) ? 'none' : modeFor(w, h, !!here);
    if (md === 'none') return { md: md, key: 'none', view: null };
    var dir = P.dir, sig, mk, view;
    if (Object.keys(viewMemo).length > 64) viewMemo = {};
    if (md === 'full') {
      var sh = bare ? null : shapersOf(shapeStore[dir], P.list);
      sig = bare ? 'bare' : dir + '|' + sh.sig;
      mk = w + 'x' + h + '|full|' + sig;
      view = viewMemo[mk] || (viewMemo[mk] = chooseView(here, sh ? sh.list : [], w, h));
    } else {
      var nx = md === 'strip' && !bare ? viewPlaces(md, h)[0] || null : null;
      mk = w + 'x' + h + '|' + md + '|' + (nx ? nx.code : '');
      view = viewMemo[mk] || (viewMemo[mk] = stripView(here, nx, w, h));
    }
    var month = monthAt(nowFor(apTz(AP0)).getTime(), apTz(AP0));
    return { md: md, view: view, key: w + 'x' + h + '@' + K + '|' + AP0 + '|' + month + '|' + md + '|' + viewSig(view) };
  }
  function readyFor(key) { for (var i = 0; i < cache.length; i++) if (cache[i].key === key) return !!cache[i].ready; return false; }
  function select(key, md, view) {
    layer.setAttribute('data-mode', md);
    if (md === 'none') { cur = null; blank(); return; }
    var e = cached(key);
    if (e && (e.ready || !e.failed)) {
      stats.cacheHits++;
      cur = e;
      if (e.ready && e.day) { showCanvas(e); drawOverlay(); shade(e, function () { if (cur === e) drawOverlay(); }); return; }
      if (e.ready && e.stale) { showCanvas(e); drawOverlay(); rebuild(e); return; }
      return;   // still being lit: the floor on screen stays until it is
    }
    if (Date.now() < retryAt) { cur = null; blank(); return; }
    // a floor not seen yet: project, light, then put it on screen in place of
    // the one there, which stays up meanwhile (never a blank floor)
    if (shown) stats.held = (stats.held || 0) + 1;
    var Wk = Math.max(1, Math.round(W * K)), Hk = Math.max(1, Math.round(H * K));
    var cv = doc.createElement('canvas'); cv.width = Wk; cv.height = Hk;
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.setAttribute('data-h', H);
    e = { key: key, view: view, W: W, H: H, K: K, Wk: Wk, Hk: Hk, cv: cv, md: md, month: monthAt(nowFor(apTz(AP0)).getTime(), apTz(AP0)) };
    cur = e; remember(e); stats.builds++;
    stats.view = { delta: view.delta, psi: view.psi, R: Math.round(view.R), cx: Math.round(view.cx), ya: Math.round(view.ya) };
    build(e, function (ok) {
      stats.level = e.level; stats.tiles = e.tiles;
      if (!ok) {
        // no picture: the old backdrop shows again, and this is tried again later
        e.failed = true; stats.noPicture = (stats.noPicture || 0) + 1; retryAt = Date.now() + RETRY_MS;
        var at = cache.indexOf(e); if (at >= 0) cache.splice(at, 1);
        curKey = '';
        if (cur === e) teardown();
        return;
      }
      shade(e, function () {
        if (cur !== e) return;
        showCanvas(e); drawOverlay(); becomeReady();
      });
    });
  }
  // an older floor that let go of its colours: projected again from the
  // pictures at hand (the lit picture stays up meanwhile)
  function rebuild(e) {
    if (e.rebuilding) return;
    e.rebuilding = true;
    var fresh = { key: e.key, view: e.view, W: e.W, H: e.H, K: e.K, Wk: e.Wk, Hk: e.Hk, cv: e.cv, md: e.md, month: e.month };
    build(fresh, function (ok) {
      e.rebuilding = false;
      if (!ok || e.dropped) return;
      e.day = fresh.day; e.night = fresh.night; e.stale = false; e.litKey = '';
      if (cur === e) shade(e, function () { if (cur === e) drawOverlay(); });
    });
  }
  function measure() {
    if (disabled || !layer) return;
    try {
      if (hidden()) return;
      if (!wanted()) { if (painted || cur) teardown(); endWait(); return; }
      // (v24070: every other place's position and zone first: loadPlaces)
      loadPlaces();
      if (!placesReady()) return;
      var board = doc.getElementById('fidsBoard'), ca = board && board.querySelector(':scope > .content-area'), tb = doc.getElementById('fidsTable');
      if (!ca) return;
      if (layer.parentNode !== ca) ca.insertBefore(layer, ca.firstChild);   // a render dropped it: put back
      var caR = ca.getBoundingClientRect(), tbR = tb ? tb.getBoundingClientRect() : null;
      var tableShown = !!(tb && tb.offsetParent && tbR && tbR.height);
      // no rows on the board, but its own notice instead (no flights in its
      // window, its feed down, its first list still coming): the floor goes
      // under the notice. Anything else in the place of the rows (a Studio
      // template) leaves it idle.
      var panel = null;
      if (!tableShown) ['panelEmpty', 'panelError', 'panelLoading'].forEach(function (id) {
        var pn = doc.getElementById(id);
        if (!panel && pn && pn.offsetParent && pn.getBoundingClientRect().height) panel = pn;
      });
      var top = tableShown ? Math.max(0, tbR.bottom - caR.top) : panel ? Math.max(0, panel.getBoundingClientRect().bottom - caR.top) : 0;
      // the floor stops above anything the board puts under its rows
      var bottom = caR.height;
      Array.prototype.forEach.call(ca.children, function (c) {
        if (c === layer || c === panel || (tb && c.contains(tb))) return;
        var r = c.getBoundingClientRect(); if (!r.height || !r.width) return;
        var cs = root.getComputedStyle(c); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || cs.position === 'fixed') return;
        var t = r.top - caR.top; if (t >= top - 1 && t < bottom) bottom = t;
      });
      var shows = tableShown || !!panel;
      var w = Math.round(caR.width), h = shows ? Math.max(0, Math.round(bottom - top)) : 0;
      // the layer always fills the space under the rows exactly; the floor in
      // it stands at its foot
      layer.style.bottom = Math.max(0, Math.round(caR.height - bottom)) + 'px';
      layer.style.height = h + 'px'; spaceH = h;
      var ap = (doc.body.getAttribute('data-fids-ap') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      var gcol = rgbOf(root.getComputedStyle(board).backgroundColor) || ground;
      var now = Date.now(), today = dayAt(now, apTz(ap));
      if (ap !== AP0 || today !== shapeDay) {
        // another airport, or a new day: its places are gathered afresh
        if (ap !== AP0) { W = w; H = h; pend = null; }
        shapeStore = { dep: {}, arr: {} }; viewMemo = {}; shapeDay = today;
      }
      AP0 = ap; here = coordsOf(AP0); ground = gcol;
      fitShown();
      P = placesNow();
      var pageW = root.innerWidth || w;
      // no planet is coming (a screen too narrow for one), or none has come in
      // WAIT_MS: the old backdrop, as before, until one is up
      if (!painted && (pageW < MIN_PAGE_W || now - bornAt > WAIT_MS)) endWait();
      bare = !tableShown;
      // A NEW SIZE (a page with more rows or fewer, the other direction, the
      // board settling its rows) is acted on once it has held SETTLE_MS, so
      // a size shown for a moment never costs a floor; at once when a lit
      // floor of that size is at hand (a page seen before) or when nothing
      // is on screen yet. Meanwhile the floor on screen stays.
      if (Math.abs(w - W) > 2 || Math.abs(h - H) > 6) {
        if (!pend || Math.abs(pend.w - w) > 2 || Math.abs(pend.h - h) > 6) pend = { w: w, h: h, at: now };
        if (!shown || now - pend.at >= SETTLE_MS || readyFor(planFor(w, h, shows, pageW).key)) { W = w; H = h; pend = null; }
      } else pend = null;
      var plan = planFor(W, H, shows, pageW), md = plan.md;
      // a busy board whose rows leave under 28 px: nothing is drawn, and the
      // sliver under the last row is the board's plain ground, never a strip
      // of the old picture (unless the pictures failed: then, until the
      // retry, the old backdrop stays, as it does for a floor that failed)
      if (md === 'none' && !painted && shows && here && pageW >= MIN_PAGE_W && W >= MIN_W && H < MIN_ANY && Date.now() >= retryAt) setPainted(true);
      var at = nowFor(apTz(AP0)), key = plan.key;
      var lsig = layoutSig();
      if (key !== curKey) { curKey = key; LSIG = lsig; select(key, md, plan.view); refreshWords(); return; }
      // the next floor still being lit (or lit and not yet on screen): the
      // one on screen stays, its words the board's
      if (!cur || !cur.ready || cur !== showE) { refreshWords(); return; }
      var bucket = Math.floor(at.getTime() / (60000 * relightEvery));
      if (bucket !== lastBucket || String(cur.litKey || '').split('|')[1] !== ground.join(',')) {
        lastBucket = bucket;
        if (cur.day) shade(cur, function () { drawOverlay(); });   // the planet re-lit and the times stepped, together
        else if (cur.stale) rebuild(cur);
        else drawOverlay();
      } else if (lsig !== LSIG) { LSIG = lsig; drawOverlay(); }   // a flight went, the board turned language, or its languages changed (its clock: 9:10 AM led by English, 09:10 led by French)
    } catch (err) { fail(err); }
  }
  function boot() {
    if (disabled) return;
    var board = doc.getElementById('fidsBoard');
    var ca = board && board.querySelector(':scope > .content-area');
    if (!ca || !doc.getElementById('fidsTable')) return setTimeout(boot, 250);
    layer = doc.createElement('div'); layer.id = 'ocFloor'; layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('data-mode', 'none');
    svg = doc.createElementNS(NS, 'svg');
    layer.appendChild(svg);
    ca.insertBefore(layer, ca.firstChild);
    measure();
    if (typeof root._ocEvery === 'function') root._ocEvery(measure, 1000); else setInterval(function () { measure(); }, 1000);
    root.addEventListener('resize', function () { measure(); });
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) measure(); });
    try { new ResizeObserver(function () { measure(); }).observe(doc.getElementById('fidsTable')); } catch (e) {}
    try { if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (showE && showE.ready) drawOverlay(); }); } catch (e) {}
    // the board's languages changed (toggleLang, setBoardLangs, the airport's
    // configuration landing): the names and times are drawn again inside the
    // change, before anything can read the old ones
    try {
      var B0 = S();
      if (B0 && typeof B0.onLangs === 'function') B0.onLangs(function () { if (disabled || !layer) return; try { refreshWords(); } catch (err) { fail(err); } });
    } catch (e) {}
    // and the language on screen turned (the board's paging clock and its
    // rotation timer call this: fids-core.js _shownLangChanged)
    root.ocfEarthWords = function () { if (disabled || !layer) return; try { refreshWords(); } catch (err) { fail(err); } };
    // review aids
    root.__ocfEarth = function () {
      var mem = blobBytes;
      cache.forEach(function (x) { mem += x.Wk * x.Hk * 4 + (x.day ? x.Wk * x.Hk * 6 : 0); });
      return { W: W, H: H, space: spaceH, settling: pend ? { w: pend.w, h: pend.h, ms: Date.now() - pend.at } : null, ap: AP0, mode: layer.getAttribute('data-mode'), K: K, relightEvery: relightEvery, painted: painted, disabled: disabled, wanted: wanted(),
        ready: !!(cur && cur.ready && cur.litKey), onScreen: showE ? showE.key.split('|')[0] : null, onScreenIsCurrent: !!showE && showE === cur, words: drawn ? drawn.wsig : null,
        memMB: +(mem / 1e6).toFixed(1), blobMB: +(blobBytes / 1e6).toFixed(1),
        view: cur && cur.view ? { psi: cur.view.psi, delta: cur.view.delta, R: Math.round(cur.view.R), cx: Math.round(cur.view.cx), cy: Math.round(cur.view.cy) } : null,
        cache: cache.map(function (x) { return x.key.split('|')[0] + (x.ready ? '' : '~') + (x.day ? '' : '-'); }),
        // labels: [code, x0, y0, x1, y1, at an arrow (1) or a dot (0), its point x, y]
        layout: lastLayout ? { routes: lastLayout.routes.map(function (r) { return r.code; }), labels: lastLayout.labels.map(function (l) { return [l.code, Math.round(l.box.x0), Math.round(l.box.y0), Math.round(l.box.x1), Math.round(l.box.y1), l.edge ? 1 : 0, Math.round(l.at.x), Math.round(l.at.y)]; }), knockouts: lastLayout.knockouts.length, unplaced: lastLayout.unplaced, tooNear: lastLayout.tooNear, blockedBy: lastLayout.blockedBy,
          dots: lastLayout.dots.map(function (d) { return [d.code, Math.round(d.x), Math.round(d.y)]; }), arrows: (lastLayout.arrows || []).map(function (w) { return [w.code, Math.round(w.x), Math.round(w.y)]; }), leaders: lastLayout.leaders.length } : null,
        stats: stats };
    };
    // project and light the current floor again from the pictures at hand,
    // and report the CPU it took
    root.__ocfBench = function () {
      return new Promise(function (ok) {
        if (!cur || !cur.ready) return ok(null);
        var e = cur, t0 = performance.now(); stats.maxSliceMs = 0; stats.maxBlockMs = 0; var sl0 = stats.slices;
        var c = { key: e.key + '#bench', view: e.view, W: e.W, H: e.H, K: e.K, Wk: e.Wk, Hk: e.Hk, cv: doc.createElement('canvas'), md: e.md, month: e.month };
        c.cv.width = e.Wk; c.cv.height = e.Hk;
        build(c, function () {
          var t1 = performance.now();
          shade(c, function () {
            ok({ K: e.K, canvas: e.Wk + 'x' + e.Hk, projectCpuMs: c.projectMs, relightCpuMs: c.shadeMs, projectWallMs: Math.round(t1 - t0), relightWallMs: Math.round(performance.now() - t1), maxSliceMs: stats.maxSliceMs, maxBlockMs: stats.maxBlockMs, slices: stats.slices - sl0, files: e.tiles * 2 });
          });
        });
      });
    };
    root.__ocfAt = function (px, py) {
      if (!cur) return null;
      var ll = llAt(cur.view, px, py); if (!ll) return null;
      return { lat: +ll[0].toFixed(2), lon: +ll[1].toFixed(2), sunAlt: +sunAltitude(ll[0], ll[1], nowFor(apTz(AP0)).getTime()).toFixed(1) };
    };
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
