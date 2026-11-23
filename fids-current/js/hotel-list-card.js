/* THE HOTEL LISTS: free guest information, by area, in the centre deck of a gate screen.

   One slot of the centre deck (the slide type is hotellist) shows the hotels of one city as
   cards that take turns, turned by the pager of the hotel cards (ten seconds a card, the last
   one held), in this order, each only when it has a hotel to show:
     airport   Airport hotels           within about 5 km of the airport
     downtown  Downtown hotels          within about 2 km of the centre of the city
     nearby    Nearby hotels            the rest within about 30 km
     resort    Resorts worth the drive  destination resorts further out, with the drive
   Each card is a list and nothing else: a line for each hotel with its logo where an official
   one reads on the cream of the card, its name, its street address and its telephone. A card
   where no line has a logo has no logo cell. No picture, no
   price, no offer, no slogan. Five lines a card; an area with more takes the next five on the
   next pass of the deck (window._gateAccorPass, the deck's own count of passes), so every hotel
   comes round. A hotel whose airport shuttle is verified carries the shuttle mark, and the card
   that shows one carries the legend. A hotel closed for the season is not shown.
   One scan code a card opens the whole list of the city in the phone app (app.html?hotels=).

   WHERE: on a gate, the hotels of the city its flight goes to (beside the Accor pages), when
   that city has a checked list (CITIES). The Accor pages and the page of the Algonquin Resort
   are separate slides and are not touched by this one.

   EVERY OTHER CITY (v24176): the same slot shows ONE card instead, "Hotels in {CITY}": the
   heading in the languages of the board, one large scan code, and under it the invitation to
   search on a phone. No hotel, no logo, no price: the code opens the phone app
   (app.html?hotels=<code>&in=<where it is>), which for a city without a checked list offers a
   search in Google Maps, and on an Apple device one in Apple Maps (mapLinks), the city named
   with its state or province and its country (searchPlace), so a Sydney is never the other
   one. The city is chosen as cityFor() chooses it (the city
   the flight goes to, then its stops from the last), for any code the board has a name for
   (airportCityNameSafe_v21877, the names of every board); a code with no name, a city with a
   checked list, and a gate with no flight show no such card. Nothing anywhere else.

   A HUB CITY (v24177, HUBS: Toronto): a city of CITIES too big for the area cards shows two
   pages in the same slot instead, near the airport then downtown, each only when its area has at
   least HUB_MIN hotels open (one page alone is held, as a one-card list is). A page: the city and
   its province in small gold capitals, the heading in the languages of the board, its own scan
   code (app.html?hotels=<code>&area=<area>); the name of the area and the count of its hotels;
   how to get there (the line, its stop and its minutes are data, hub.areas.<area>.transit, only
   where the slim copy has one: a way there not read on its operator's own page is left off); on a
   page with no card hotel, the empty place of a partner hotel; the card hotels (card true in the
   data, at most HUB_CARDS) in a fine gold frame on the cream, with their logo, name, street and
   telephone; then HUB_ROWS lines less one for each card hotel (never under HUB_ROWS_MIN), the name
   and, on the right, the shuttle mark where the shuttle is verified, else the street; the next
   lines on the next pass of the deck; how many more the scan code lists; the navy foot. The
   faces of the board, AC Nord Display and AC Nord Text (css/font.css). A hub counts only as the
   city a flight goes to, never as one of its stops (neither for its list nor for a "Hotels in"
   card). A hub with no area open to HUB_MIN on the day shows its "Hotels in {CITY}" card instead.

   DATA: data/hotels/<code>.json, a slim copy a city with only the fields read here and in the
   app, made by scripts/hotels/build-runtime.js from the checked file of the city
   (scripts/hotels/data/<code>.json, which keeps the source and verified mark of every fact).
   WORDS: the store (js/board-strings.js) in the languages of the board, the first language
   first; names, addresses and telephones are data. LOGOS: through <img> only, never inlined
   (an SVG with a generic <style> class leaks it into the page). LOOK: css/hotel-list-card.css.
   REVIEW: ?hotellist=YYG shows that city on any gate (inert without it), with ?scene=hotellist;
   ?hotellist=YYZ the two pages of a hub city; ?hotellist=YOW (a city without a list) shows its
   "Hotels in {CITY}" card; a code the board has no name for is no link (the gate shows what it
   shows without one). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HotelListCard = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  // THE ONE LIST of the cities with a checked list (data/hotels/<code>.json). Nothing else
  // names them: scripts/hotels/build-runtime.js, the phone app (app.html, HotelListCard.CITIES)
  // and the tests read this one. A new city is its checked file (scripts/hotels/data/<code>.json),
  // its slim copy (node scripts/hotels/build-runtime.js) and one entry here; the build step and
  // the tests fail on a checked file whose city is not in this list, and on an entry without one.
  var CITIES = ['YQM', 'YYG', 'YHZ', 'YFC', 'YYZ'];
  // The cities of CITIES whose slot shows the two pages of a hub city (near the airport, then
  // downtown) instead of the area cards. Its checked file has a hub block (the province, and how
  // to get to each area) and hotels in those two areas only; the build step and the tests hold
  // both to it.
  var HUBS = ['YYZ'];
  // The cards, in the order they take turns, and the key of the heading of each.
  var AREAS = ['airport', 'downtown', 'nearby', 'resort'];
  var HEAD = { airport: 'hotelsAirport', downtown: 'hotelsDowntown', nearby: 'hotelsNearby', resort: 'hotelsResorts' };
  // The area rule the data was built to (each limit about, so 10 % over still counts; downtown
  // is tested first; a resort is a destination resort further out than the nearby limit).
  var RULE = { downtownKm: 2, airportKm: 5, nearbyKm: 30, tolerance: 1.1 };
  var PER_CARD = 5;
  // A hub city: its two pages in order, the key of the name of each area and of the line of how
  // many more the scan code lists, and the key of each way to get there (the data names a kind,
  // never a key of the store).
  var HUB_AREAS = ['airport', 'downtown'];
  var HUB_HEAD = { airport: 'hotelsAreaAirport', downtown: 'hotelsAreaDowntown' };
  var HUB_MORE = { airport: 'hotelsMoreAirport', downtown: 'hotelsMoreDowntown' };
  var TRANSIT = { link: 'hotelsTrainFree', ride: 'hotelsRideTo' };
  // a page only for an area with at least this many hotels open; five lines a page, one less for
  // each card hotel above them (at most two), never under three
  var HUB_MIN = 3;
  var HUB_ROWS = 5;
  var HUB_ROWS_MIN = 3;
  var HUB_CARDS = 2;
  // the trim of a card hotel's logo: its four sides in per cent, top right bottom left (crops
  // places only this form, so hubLogo takes only this form)
  var TRIM = /^inset\(([\d.]+)% ([\d.]+)% ([\d.]+)% ([\d.]+)%\)$/;
  // The pager of the hotel cards (fids-core.js) turns a card every ten seconds.
  var VIEW_MS = 10000;
  // The smallest text of a card, in pixels of the 1680x1050 screen the stylesheet is written at.
  var FLOOR = 18;
  // The phone app's own address (host-airport.js: .app is the app only).
  var APP_HOST = 'https://orionconnected.app/app';
  // The card of a city without a list is one view, held long enough to take a phone out.
  var FIND_MS = 20000;
  // The two map searches the phone app offers for a city without a list (mapLinks). No key, no
  // tracking parameter, nothing but the search and, for Apple, where to search.
  //   Google: the Maps URLs search action, as documented on
  //     developers.google.com/maps/documentation/urls/get-started (read 2026-11-22):
  //     https://www.google.com/maps/search/?api=1&query=<the search, URL-encoded>. api=1 is
  //     required; the search action takes no centre (query is a place, an address or a general
  //     search such as "restaurants in Seattle WA"); no API key is needed. With no centre, a
  //     city whose name is another city's too (Sydney, London, Santiago, Portland) is told apart
  //     in the words of the search: where it is goes in them (searchPlace, "Sydney, NS, Canada").
  //   Apple: the legacy Map Links form (q is the query as if typed into the Maps search field;
  //     sll is the search location, latitude,longitude, given alone or with q). Its page
  //     (developer.apple.com/library/archive, MapLinks) now redirects to Apple's Unified Map URLs
  //     page (developer.apple.com/documentation/mapkit/unified-map-urls, read 2026-11-22), which
  //     does not describe the legacy form; the q and sll text was read only from a search
  //     index's extract of the old page. The unified page documents
  //     maps.apple.com/search?query=&center= for iOS 18.4, macOS 15.4 and later only, so the
  //     legacy form is used, to be checked on an iPhone running iOS 18.4 or earlier:
  //     https://maps.apple.com/?q=<the search, URL-encoded>&sll=<latitude>,<longitude>
  var MAPS_GOOGLE = 'https://www.google.com/maps/search/?api=1&query=';
  var MAPS_APPLE = 'https://maps.apple.com/?q=';

  var DATA = Object.create(null);
  var ASKED = Object.create(null);

  // Material Icons (Google), Apache 2.0: the same family as the icons of the board
  var ICON = {
    shuttle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5H3c-1.100 0-2 .89-2 2v9h2c0 1.650 1.340 3 3 3s3-1.350 3-3h5.500c0 1.650 1.340 3 3 3s3-1.350 3-3H23v-5l-6-6zM3 11V7h4v4H3zm3 6.500c-.83 0-1.500-.67-1.500-1.500s.67-1.500 1.500-1.500 1.500.67 1.500 1.500-.67 1.500-1.500 1.500zM13 11H9V7h4v4zm5 6.500c-.83 0-1.500-.67-1.500-1.500s.67-1.500 1.500-1.500 1.500.67 1.500 1.500-.67 1.500-1.500 1.500zM15 11V7h1l4 4h-5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.620 10.790c1.440 2.830 3.760 5.140 6.590 6.590l2.200-2.200c.27-.27.67-.36 1.020-.24 1.120.37 2.330.57 3.570.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.390 0-17-7.610-17-17 0-.55.45-1 1-1h3.500c.55 0 1 .45 1 1 0 1.250.2 2.450.57 3.570.11.35.03.74-.25 1.020l-2.200 2.200z"/></svg>',
    car: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.920 6.010C18.720 5.420 18.160 5 17.500 5h-11c-.66 0-1.210.42-1.420 1.010L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.080-5.990zM6.500 16c-.83 0-1.500-.67-1.500-1.500S5.670 13 6.500 13s1.500.67 1.500 1.500S7.330 16 6.500 16zm11 0c-.83 0-1.500-.67-1.500-1.500s.67-1.500 1.500-1.500 1.500.67 1.500 1.500-.67 1.500-1.500 1.500zM5 11l1.500-4.500h11L19 11H5z"/></svg>',
    // the card of a city without a list (the phone beside its invitation) and the map buttons
    // of the app (the pin of a place)
    smartphone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 1.010L7 1c-1.100 0-2 .9-2 2v18c0 1.100.9 2 2 2h10c1.100 0 2-.9 2-2V3c0-1.100-.9-1.990-2-1.990zM17 19H7V5h10v14z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.130 2 5 5.130 5 9c0 5.250 7 13 7 13s7-7.750 7-13c0-3.870-3.130-7-7-7zm0 9.500c-1.380 0-2.500-1.120-2.500-2.500s1.120-2.500 2.500-2.500 2.500 1.120 2.500 2.500-1.120 2.500-2.500 2.500z"/></svg>',
    // the way to a hub city's areas by train (the airport's own train, the train downtown)
    train: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c-4 0-8 .5-8 4v9.500C4 17.430 5.570 19 7.500 19L6 20.500v.5h2.230l2-2H14l2 2H18v-.5L16.500 19c1.930 0 3.500-1.570 3.500-3.500V6c0-3.500-3.580-4-8-4zM7.500 17c-.83 0-1.500-.67-1.500-1.500S6.670 14 7.500 14s1.500.67 1.500 1.500S8.330 17 7.500 17zm3.500-7H6V6h5v4zm2 0V6h5v4h-5zm3.500 7c-.83 0-1.500-.67-1.500-1.500s.67-1.500 1.500-1.500 1.500.67 1.500 1.500-.67 1.500-1.500 1.500z"/></svg>'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ico(k, cls) { return '<i class="hlc-ico' + (cls ? ' ' + cls : '') + '">' + ICON[k] + '</i>'; }
  function up(c) { return String(c == null ? '' : c).toUpperCase(); }

  // ── THE DATA ──────────────────────────────────────────────────────────────
  function tag() {
    var t = '';
    try { t = String(root.FIDS_BUILD_TAG || '').replace(/^v/, ''); } catch (e) { t = ''; }
    return t;
  }
  function dataUrl(iata) {
    var t = tag();
    return '/data/hotels/' + String(iata || '').toLowerCase() + '.json' + (t ? '?v=' + t : '');
  }
  // The list of a city, once loaded; null before (the deck passes the slot over until then).
  function get(iata) { return DATA[up(iata)] || null; }
  // A list handed in directly (the tests, and the app once it has read the file).
  function put(iata, doc) { if (doc && Array.isArray(doc.hotels)) DATA[up(iata)] = doc; return get(iata); }
  // Asks once for the list of a city with one; resolves with it (or null).
  function load(iata) {
    var c = up(iata);
    if (CITIES.indexOf(c) < 0) return Promise.resolve(null);
    if (DATA[c]) return Promise.resolve(DATA[c]);
    if (ASKED[c]) return ASKED[c];
    if (typeof root.fetch !== 'function') return Promise.resolve(null);
    ASKED[c] = root.fetch(dataUrl(c), { cache: 'no-cache' })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (doc) { return put(c, doc); })
      .catch(function () { ASKED[c] = null; return null; });
    return ASKED[c];
  }

  // ── THE RULES ─────────────────────────────────────────────────────────────
  // Straight-line distance in kilometres.
  function km(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  // The area a hotel belongs to by the rule, from the two points of its city: what the data
  // must agree with (the tests hold every file to it). The tolerance is for an ordinary hotel
  // just past a line; a destination resort (resort true) past the nearby limit has its own card.
  // '' = outside every card.
  function areaOf(h, points) {
    var dC = km(points.centre, h), dA = km(points.airport, h), t = RULE.tolerance, near = Math.min(dC, dA);
    if (dC <= RULE.downtownKm * t) return 'downtown';
    if (dA <= RULE.airportKm * t) return 'airport';
    if (h.resort === true && near > RULE.nearbyKm) return 'resort';
    if (near <= RULE.nearbyKm * t) return 'nearby';
    return '';
  }
  // The month and day ('11-16') of a day. Today, on a board: the day at the airport, in its own
  // time zone (the board's own day key, _ocLocalDayKey). A given day, or no board: the day of
  // the machine's own calendar (the phone's, for the app).
  function monthDay(date, tz) {
    if (date == null && tz && typeof root._ocLocalDayKey === 'function') {
      try {
        var k = String(root._ocLocalDayKey(tz) || '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k.slice(5);
      } catch (e) {}
    }
    var d = date == null ? new Date() : (date instanceof Date ? date : new Date(date));
    var mm = d.getMonth() + 1, day = d.getDate();
    return (mm < 10 ? '0' : '') + mm + '-' + (day < 10 ? '0' : '') + day;
  }
  // Open on that day: a year-round hotel, or one whose season (from-to, both days open, a season
  // may run over the new year) holds the day. A hotel held back (listed false) is never shown.
  function isOpen(h, date, tz) {
    if (!h || h.listed === false) return false;
    var s = h.season || {};
    if (s.year_round === true) return true;
    if (!Array.isArray(s.open) || !s.open.length) return false;
    var md = monthDay(date, tz);
    for (var i = 0; i < s.open.length; i++) {
      var f = String(s.open[i].from || ''), t = String(s.open[i].to || '');
      if (!f || !t) continue;
      if (f <= t ? (md >= f && md <= t) : (md >= f || md <= t)) return true;
    }
    return false;
  }
  // The cards of a city on that day: each area with a hotel open, in the order of the cards,
  // the hotels in the order of the file (nearest first).
  function cards(doc, date, tz) {
    var out = [];
    if (!doc || !Array.isArray(doc.hotels)) return out;
    AREAS.forEach(function (a) {
      var list = doc.hotels.filter(function (h) { return h.area === a && isOpen(h, date, tz); });
      if (list.length) out.push({ area: a, hotels: list });
    });
    return out;
  }
  // The five lines of a card on a pass of the deck: the next five each pass, round the list,
  // never the same hotel twice on one card. per: the lines of a page of a hub city (five, or
  // fewer under its card hotels).
  function page(list, pass, per) {
    var k = Math.max(1, Math.floor(Number(per) || PER_CARD));
    var n = list.length;
    if (n <= k) return list.slice();
    var p = Math.max(0, Math.floor(Number(pass) || 0));
    var start = (p * k) % n, out = [];
    for (var i = 0; i < k; i++) out.push(list[(start + i) % n]);
    return out;
  }
  // A hub city's list: a city of HUBS whose file has its hub block.
  function isHub(doc) {
    return !!(doc && doc.hub && typeof doc.hub === 'object' && HUBS.indexOf(up(doc.iata)) >= 0);
  }
  // The views of the slot on that day: the cards of a city, or the pages of a hub city (its two
  // areas in their order, each with at least HUB_MIN hotels open).
  function shown(doc, date, tz) {
    var list = cards(doc, date, tz);
    if (!isHub(doc)) return list;
    var out = [];
    HUB_AREAS.forEach(function (a) {
      list.forEach(function (c) { if (c.area === a && c.hotels.length >= HUB_MIN) out.push(c); });
    });
    return out;
  }

  // ── WHERE ─────────────────────────────────────────────────────────────────
  // The city of a review link (?hotellist=): a city with a list, or a code without one that the
  // board has a name for. Any other code is no link: the gate shows what it shows without one.
  function review() {
    try {
      var q = new URLSearchParams(root.location && root.location.search || '');
      var c = up(q.get('hotellist') || '');
      return (CITIES.indexOf(c) >= 0 || findName(c)) ? c : '';
    } catch (e) { return ''; }
  }
  // The city whose hotels a gate shows: the one its flight goes to (the last stop first, then
  // any stop), when that city has a list. A hub city counts only as the city the flight goes to,
  // never as a stop (a flight through Toronto to Vancouver is no Toronto list). A gate with no
  // flight of its own shows nothing. A review link names the city itself (a city without a
  // list: none here, its card instead).
  function cityFor() {
    var r = review();
    if (r) return CITIES.indexOf(r) >= 0 ? r : '';
    try {
      var cf = root._gateCurrentFlight;
      if (!cf) return '';
      var dest = up(cf._locIata);
      if (CITIES.indexOf(dest) >= 0) return dest;
      var legs = (typeof root._flightLegs === 'function') ? root._flightLegs(cf) : [];
      if (Array.isArray(legs)) {
        for (var i = legs.length - 1; i >= 0; i--) {
          var l = up(legs[i]);
          if (CITIES.indexOf(l) >= 0 && HUBS.indexOf(l) < 0) return l;
        }
      }
    } catch (e) {}
    return '';
  }
  // The name of a city as the board writes it, for the card of a city without a list: '' when
  // the board has no name for the code (airportCityNameSafe_v21877, the tables of every board),
  // and then no card. Cased and spelled as the gate writes every city (_gateMapCity), without
  // the airport's own name that a city with two of ours carries (Toronto, not Toronto · Pearson).
  function findName(iata, lg) {
    var c = up(iata), raw = '';
    if (!/^[A-Z0-9]{3}$/.test(c)) return '';
    try { raw = (typeof root.airportCityNameSafe_v21877 === 'function') ? String(root.airportCityNameSafe_v21877(c, lg) || '') : ''; } catch (e) { raw = ''; }
    if (!raw.trim()) return '';
    var n = cityName(c, lg) || raw;
    var cut = n.indexOf(' · ');
    if (cut > 0) n = n.slice(0, cut);
    n = n.trim();
    return (n && n !== c) ? n : '';
  }
  // The city of the card of a city without a list: the city the flight goes to, then its stops
  // from the last, as cityFor() chooses, for any code the board has a name for; never the city
  // of the screen itself. '' on a gate with no flight, and wherever a city of the flight has a
  // checked list (its list shows instead). A review link names it: a code without a list.
  function findCity() {
    var r = review();
    if (r) return (CITIES.indexOf(r) < 0 && findName(r)) ? r : '';
    try {
      var cf = root._gateCurrentFlight;
      if (!cf || cityFor()) return '';
      var home = up(root._gateIata);
      var dest = up(cf._locIata);
      if (dest && dest !== home && findName(dest)) return dest;
      var legs = (typeof root._flightLegs === 'function') ? root._flightLegs(cf) : [];
      if (Array.isArray(legs)) {
        for (var i = legs.length - 1; i >= 0; i--) {
          var l = up(legs[i]);
          // a stop with a checked list is passed over: a hub city as a stop (the only one left by
          // cityFor) is no Toronto card, as it is no Toronto list
          if (l && l !== home && CITIES.indexOf(l) < 0 && findName(l)) return l;
        }
      }
    } catch (e) {}
    return '';
  }
  function tzOf(iata) {
    try { return (root.AP && root.AP[iata] && root.AP[iata].tz) || ''; } catch (e) { return ''; }
  }
  function passNow() {
    try { return Math.max(0, Number(root._gateAccorPass) || 0); } catch (e) { return 0; }
  }
  // A hub city whose list is loaded but has no page open on the day (no area with HUB_MIN hotels
  // open): its "Hotels in {CITY}" card instead, where the board has a name for it.
  function hubFind(c, doc) {
    return !!(c && doc && isHub(doc) && !shown(doc, null, tzOf(c)).length && findName(c));
  }
  // Due on this gate: a city with a list, the list loaded and something open in it. The first
  // ask loads the list; the deck passes the slot over until it is there. A city without a list
  // that the board has a name for, or a hub city with no page open: its one card.
  function due() {
    var c = cityFor();
    if (!c) return !!findCity();
    var doc = get(c);
    if (!doc) { load(c); return false; }
    return shown(doc, null, tzOf(c)).length > 0 || hubFind(c, doc);
  }
  // Ten seconds a view (a card, or a page of a hub city), the last one held four more.
  function dwellMs() {
    var c = cityFor(), doc = c ? get(c) : null;
    if ((!c && findCity()) || hubFind(c, doc)) return FIND_MS;
    var n = doc ? shown(doc, null, tzOf(c)).length : 1;
    return Math.max(1, n) * VIEW_MS + 4000;
  }
  // Where a city without a list is, for its map search on the phone (the scan code carries it,
  // &in=): its country by the board's own table (_IATA_CC, fids-core.js, the ISO code as the
  // table gives it, so San Juan is PR, not US), and in the United States and Canada its state or
  // province (_rowRegion, fids-core.js, OurAirports' region). 'CA-NS', 'US-ME', 'DO', or ''
  // where the board's tables do not say.
  var WHERE = /^([A-Z]{2})(?:-([A-Z]{2}))?$/;
  function whereOf(iata) {
    var c = up(iata), cc = '', st = '';
    if (!/^[A-Z0-9]{3}$/.test(c)) return '';
    try { cc = String((typeof _IATA_CC !== 'undefined' && _IATA_CC && _IATA_CC[c]) || ''); } catch (e) { cc = ''; }
    if (!cc) { try { cc = (typeof root.airportCountry === 'function') ? String(root.airportCountry(c) || '') : ''; } catch (e1) { cc = ''; } }
    if (!/^[A-Z]{2}$/.test(cc)) return '';
    if (cc === 'US' || cc === 'CA') { try { st = (typeof root._rowRegion === 'function') ? String(root._rowRegion(c) || '') : ''; } catch (e2) { st = ''; } }
    return /^[A-Z]{2}$/.test(st) ? cc + '-' + st : cc;
  }
  // The address the scan code opens: the full list of the city in the phone app, at the card's
  // area, with the airport of the screen as the app's own airport; for a city without a list,
  // where it is (whereOf), for its map search.
  function qrUrl(city, area, home, where) {
    var base = APP_HOST;
    try {
      var h = String(root.location && root.location.hostname || '');
      if (h && !/(^|\.)orionconnected\.(com|ca|app)$/i.test(h)) base = String(root.location.origin || '') + '/app';
    } catch (e) {}
    return base + '?' + (home ? 'ap=' + encodeURIComponent(up(home)) + '&' : '') + 'hotels=' + encodeURIComponent(up(city))
      + (area ? '&area=' + encodeURIComponent(area) : '') + (WHERE.test(up(where)) ? '&in=' + up(where) : '');
  }
  // A name without its accents and its case, to compare two names.
  function fold(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  // The place of a map search: the city, then where it is when the scan code said (whereOf): the
  // state or province by its two letters, as the boards print them ('London, KY'), then the
  // country in the language of the search (the browser's own names, Intl.DisplayNames, as the
  // app names countries), left out where the city's own name says it already (Panama City,
  // Singapore) or the country's name begins with it (Hong Kong). 'Sydney, NS, Canada'; the city
  // alone when nothing says where it is.
  function searchPlace(name, where, lg) {
    var n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    var m = WHERE.exec(up(where));
    if (!n || !m) return n;
    var out = n, cn = '';
    if (m[2]) out += ', ' + m[2];
    try {
      var BS = store();
      if (BS && typeof BS.intl === 'function') cn = String(new Intl.DisplayNames([BS.intl(lg)], { type: 'region' }).of(m[1]) || '');
    } catch (e) { cn = ''; }
    var fn = fold(n), fc = fold(cn);
    if (cn && cn.toUpperCase() !== m[1] && fn.indexOf(fc) < 0 && fc.indexOf(fn + ' ') !== 0) out += ', ' + cn;
    return out;
  }
  // A URL component, every reserved character encoded (encodeURIComponent leaves ! ' ( ) *).
  function enc(s) {
    return encodeURIComponent(String(s == null ? '' : s)).replace(/[!'()*]/g, function (ch) {
      return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
    });
  }
  // The two map searches of a city without a list, for the phone app: `search` is what the
  // traveller would type (the app's own heading, "Hotels in {CITY}" in the language of the
  // phone, whose Maps app speaks the same language, its city as searchPlace writes it, with
  // where it is), `at` the point to search around
  // ({lat, lng}, or nothing). The forms and the documentation they follow: MAPS_GOOGLE and
  // MAPS_APPLE above. '' for a search with no words.
  function mapLinks(search, at) {
    var s = String(search == null ? '' : search).replace(/\s+/g, ' ').trim();
    if (!s) return { google: '', apple: '' };
    var ll = '', la = at && at.lat != null && at.lat !== '' ? Number(at.lat) : NaN, lo = at && at.lng != null && at.lng !== '' ? Number(at.lng) : NaN;
    if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) ll = '&sll=' + la + ',' + lo;
    return { google: MAPS_GOOGLE + enc(s), apple: MAPS_APPLE + enc(s) + ll };
  }

  // ── THE WORDS ─────────────────────────────────────────────────────────────
  function store() { return (typeof root.BoardStrings !== 'undefined' && root.BoardStrings) ? root.BoardStrings : null; }
  // The one or two languages of the board, French first where the board is French first.
  function boardPair() {
    var BS = store();
    if (!BS) return [];
    var ia = String(root._gateIata || '');
    var frF = false;
    try { frF = (typeof root.frFirstAirport === 'function') && !!root.frFirstAirport(ia); } catch (e) { frF = false; }
    var list = null;
    try { list = (typeof langs !== 'undefined') ? langs : null; } catch (e2) { list = null; }
    return BS.pairLangs(list, frF);
  }
  // One phrase in the languages of the board: a half each, marked with its language; a second
  // half that says the same as the first is left out.
  function pairOf(L, say, key) {
    var BS = store(), out = [], seen = Object.create(null);
    L.forEach(function (lg) {
      var w = '';
      try { w = say(lg) || ''; } catch (e) { w = ''; }
      if (!w || seen[w]) return;
      seen[w] = 1;
      out.push(key ? BS.half(lg, esc(w), '', { key: key }) : BS.half(lg, esc(w)));
    });
    return out.join('<b class="hlc-sep"></b>');
  }
  // One line for each language of the board (a heading): a line that says the same as the one
  // before it is left out.
  function linesOf(L, say, key) {
    var BS = store(), out = [], seen = Object.create(null);
    L.forEach(function (lg) {
      var w = '';
      try { w = say(lg) || ''; } catch (e) { w = ''; }
      if (!w || seen[w]) return;
      seen[w] = 1;
      out.push('<div class="hlc-tl"><span class="hlc-fit">' + BS.half(lg, esc(w), '', { key: key }) + '</span></div>');
    });
    return out.join('');
  }
  function cityName(iata, lg) {
    var c = '';
    try { c = (typeof root._gateMapCity === 'function') ? root._gateMapCity(iata, lg) : ''; } catch (e) { c = ''; }
    return c || '';
  }

  // ── THE CARD ──────────────────────────────────────────────────────────────
  function logoCell(h) {
    var lg = h.logo && h.logo.file;
    if (!lg) return '<span class="hlc-logo hlc-logo--none"></span>';
    // trim: the file's own transparent margin, cut by the view of the image (object-view-box), so
    // a mark drawn small on a big canvas fills its place; the file is shown as it is
    var trim = /^inset\([\d.% ]+\)$/.test(String(h.logo.trim || '')) ? ' style="object-view-box:' + h.logo.trim + '"' : '';
    // fill: a stacked lockup whose words are small at the common height takes the whole cell
    return '<span class="hlc-logo"><img class="hlc-img' + (h.logo.opaque ? ' hlc-img--opaque' : '') + (h.logo.fill === true ? ' hlc-img--fill' : '')
      + '" alt="" decoding="async"' + trim + ' src="' + esc(lg) + '"></span>';
  }
  // The address line of a hotel, data read as written (marked so no page translator rewrites a
  // street), with its telephone after it (tel). The same line carries any other piece
  // of data a page shows as written: a street alone, a province, the name of a train line or its
  // stop (dataOf).
  function infoOf(h, tel) {
    var info = '<bdi class="hlc-addr" translate="no">' + esc(h.address && h.address.display) + '</bdi>'
      + (tel ? '<span class="hlc-tel">' + ico('phone') + '<bdi dir="ltr">' + esc(h.phone) + '</bdi></span>' : '');
    return info;
  }
  function dataOf(s) { return infoOf({ address: { display: s } }, false); }
  // The street of a hotel alone, with its telephone (a hub city's lines and card hotels).
  function streetOf(h) {
    return { address: { display: (h.address && (h.address.street || h.address.display)) || '' }, phone: h.phone };
  }
  // The name of a hotel, data read as written; tail inside its fitted part (the shuttle mark),
  // rest beside it (the drive of a resort, the note of a hub line).
  function nameOf(h, tail, rest) {
    return ''
      + '<div class="hlc-name"><span class="hlc-fit"><bdi translate="no">' + esc(h.name) + '</bdi>'
      + (tail || '') + '</span>' + (rest || '') + '</div>';
  }
  function line(h, L, city, BS) {
    var info = infoOf(h, true);
    // a resort: the drive from the airport, by road, after its name (a figure and its unit:
    // the card's heading says what it is)
    var drive = '';
    if (h.area === 'resort' && h.drive && h.drive.km) {
      drive = '<span class="hlc-drive">' + ico('car') + '<bdi dir="ltr">' + esc(String(Math.round(h.drive.km))) + ' km</bdi></span>';
    }
    return '<li class="hlc-row" data-hotel="' + esc(h.id) + '">' + logoCell(h)
      + '<div class="hlc-text">'
      +   nameOf(h, h.shuttle && h.shuttle.mark === true ? ico('shuttle', 'hlc-mark') : '', drive)
      +   '<div class="hlc-info"><span class="hlc-fit">' + info + '</span></div>'
      + '</div></li>';
  }
  function card(doc, c, L, o) {
    var BS = store(), city = up(doc.iata);
    var rows = page(c.hotels, o.pass);
    // a card where no line has a logo has no logo cell: its names start at the card's own
    // edge (hlc-list--bare); --hlc-rows is the number of lines there are
    var bare = !rows.some(function (h) { return h.logo && h.logo.file; });
    var mark = rows.some(function (h) { return h.shuttle && h.shuttle.mark === true; });
    var osm = rows.some(function (h) { return h.drive && /OpenStreetMap/.test(String(h.drive.credit || '')); });
    var head = linesOf(L, function (lg) { return BS.bs(HEAD[c.area], lg); }, HEAD[c.area]);
    var where = pairOf(L, function (lg) { return cityName(city, lg); });
    var scan = pairOf(L, function (lg) { return BS.bs('hotelListScan', lg); }, 'hotelListScan');
    var legend = mark ? '<span class="hlc-legend hlc-pairfit">' + ico('shuttle', 'hlc-mark') + '<span class="hlc-fit">'
      + pairOf(L, function (lg) { return BS.bs('hotelShuttle', lg); }, 'hotelShuttle') + '</span></span>' : '';
    var credit = osm ? '<span class="hlc-credit hlc-pairfit"><span class="hlc-fit">' + pairOf(L, function (lg) { return BS.bs('credOsmLine', lg); }, 'credOsmLine') + '</span></span>' : '';
    var marks = (Array.isArray(doc.foot_marks) ? doc.foot_marks : []).map(function (m) {
      return '<img class="hlc-foot-mark" alt="" decoding="async" src="' + esc(m.file) + '">';
    }).join('');
    return '<div class="axr-page hlc-view' + (o.first ? ' axr-page-on' : '') + '" data-area="' + esc(c.area) + '">'
      + '<div class="hlc-head">'
      +   '<div class="hlc-titles">'
      +     (where ? '<div class="hlc-city"><span class="hlc-fit">' + where + '</span></div>' : '')
      +     '<div class="hlc-title">' + head + '</div>'
      +     '<div class="hlc-say"><span class="hlc-fit">' + scan + '</span></div>'
      +   '</div>'
      +   '<div class="hlc-scan"><div class="hlc-qr" data-qr-url="' + esc(qrUrl(city, c.area, o.home)) + '"></div></div>'
      + '</div>'
      + '<ol class="hlc-list' + (bare ? ' hlc-list--bare' : '') + '" style="--hlc-rows:' + rows.length + '">'
      +   rows.map(function (h) { return line(h, L, city, BS); }).join('') + '</ol>'
      + '<div class="hlc-foot">' + legend + credit + (marks ? '<span class="hlc-marks">' + marks + '</span>' : '') + '</div>'
      + '</div>';
  }
  // ── A HUB CITY ────────────────────────────────────────────────────────────
  // The city of a hub page, as the gate writes it, without the airport's own name (Toronto, not
  // Toronto · Pearson).
  function hubCity(c, lg) {
    var n = cityName(c, lg), cut = n.indexOf(' · ');
    if (cut > 0) n = n.slice(0, cut);
    n = n.trim();
    return n !== c ? n : '';
  }
  // A count of hotels in one language, in its plural form (a count under two is never shown).
  function countKey(n, lg) {
    var BS = store(), form = 'other';
    try { form = new Intl.PluralRules(BS.intl(lg)).select(n); } catch (e) { form = 'other'; }
    return form === 'two' ? 'hotelsCountTwo' : form === 'few' ? 'hotelsCountFew' : form === 'many' ? 'hotelsCountMany' : 'hotelsCountOther';
  }
  // The fine dot between two parts of one language (css: .hlc-hub-dot).
  var DOT = '<b class="hlc-hub-dot"></b>';
  // A phrase of the store with data in it, as markup: the phrase escaped, each {FIELD} replaced by
  // its markup.
  function withData(t, fields) {
    var out = esc(t);
    Object.keys(fields).forEach(function (k) { out = out.split('{' + k + '}').join(fields[k]); });
    return out;
  }
  // How to get to an area in one language: the line (data, in bold), its stop, and for a ride its
  // minutes and how often it leaves. '' for a kind the page has no words for.
  function transitOf(t, lg) {
    var BS = store(), key = TRANSIT[t && t.kind];
    if (!key || !t.line) return '';
    var w = BS.bs(key, lg);
    if (!w) return '';
    var html = withData(w, { LINE: '<b class="hlc-hub-line">' + dataOf(t.line) + '</b>', STOP: dataOf(t.stop || '') });
    if (t.kind === 'ride' && t.min > 0 && t.every > 0) {
      var tm = BS.bs('hotelsRideTime', lg);
      // the phrase's own dot between its minutes and how often it leaves is drawn as the dot
      // before it, so one line has one kind of dot
      if (tm) html += DOT + withData(tm, { MIN: esc(BS.num(t.min, lg)), EVERY: esc(BS.num(t.every, lg)) }).split(' · ').join(DOT);
    }
    return html;
  }
  // One phrase given as markup, in the languages of the board: a half each, marked with its
  // language; a half that says the same as the one before is left out.
  function pairHtml(L, say, key) {
    var BS = store(), out = [], seen = Object.create(null);
    L.forEach(function (lg) {
      var w = '';
      try { w = say(lg) || ''; } catch (e) { w = ''; }
      if (!w || seen[w]) return;
      seen[w] = 1;
      out.push(BS.half(lg, w, '', { key: key }));
    });
    return out.join('<b class="hlc-sep"></b>');
  }
  // The logo of a card hotel, through <img> on the cream of its cell. Its trim (logo.trim, the four
  // sides in per cent, TRIM) is cut by placing the picture inside the cell (crops), not by
  // object-view-box: an SVG file with no width and height of its own has no natural size, and the
  // browser ignores object-view-box on it (the Fairmont lockup). Until the picture is placed it
  // shows whole, contained in the cell. A file with its own light ground (logo.opaque) is
  // multiplied into the cream, as on the area cards, so no box shows round it.
  function hubLogo(h) {
    var lg = h.logo && h.logo.file;
    if (!lg) return '<span class="hlc-logo hlc-logo--none"></span>';
    var trim = TRIM.test(String(h.logo.trim || '')) ? ' data-trim="' + esc(h.logo.trim) + '"' : '';
    return '<span class="hlc-logo"><span class="hlc-hub-pic"><img class="hlc-img' + (h.logo.opaque ? ' hlc-img--opaque' : '') + '" alt="" decoding="async"'
      + trim + ' src="' + esc(lg) + '"></span></span>';
  }
  // One page of a hub city: the head, the area and its count, the way there, the place of a partner
  // hotel or the card hotels, the lines of this pass and how many more, the foot.
  function hubPage(doc, c, L, o) {
    var BS = store(), city = up(doc.iata), area = c.area, hub = doc.hub || {};
    var t = (hub.areas && hub.areas[area] && hub.areas[area].transit) || null;
    // a way there held back in the checked file (verified false) is never shown; the slim copy
    // has none
    if (t && t.verified === false) t = null;
    var gold = c.hotels.filter(function (h) { return h.card === true; }).slice(0, HUB_CARDS);
    var plain = c.hotels.filter(function (h) { return gold.indexOf(h) < 0; });
    var rows = page(plain, o.pass, Math.max(HUB_ROWS_MIN, HUB_ROWS - gold.length));
    var count = c.hotels.length, more = count - gold.length - rows.length;
    var mark = rows.some(function (h) { return h.shuttle && h.shuttle.mark === true; });
    // the head: the city and its province, the heading, the scan code of this area
    var place = pairOf(L, function (lg) { return hubCity(city, lg); });
    var region = hub.region ? (place ? '<b class="hlc-hub-dot"></b>' : '') + dataOf(hub.region) : '';
    var title = pairOf(L, function (lg) { return BS.bs('hotelsWhereToStay', lg); }, 'hotelsWhereToStay');
    // the area and how many hotels it has (a count under two is not shown)
    var head = pairOf(L, function (lg) { return BS.bs(HUB_HEAD[area], lg); }, HUB_HEAD[area]);
    var tally = count >= 2 ? '<div class="hlc-hub-count">' + pairOf(L, function (lg) {
      return BS.fmt(countKey(count, lg), lg, { N: BS.num(count, lg) }, true);
    }) + '</div>' : '';
    // the way there, and the legend of the shuttle mark on a page that shows one
    var go = t && ICON[t.icon] ? '<div class="hlc-hub-go hlc-pairfit">' + ico(t.icon) + '<span class="hlc-fit">'
      + pairHtml(L, function (lg) { return transitOf(t, lg); }, TRANSIT[t.kind]) + '</span></div>' : '';
    var legend = mark ? '<div class="hlc-hub-go hlc-hub-legend hlc-pairfit">' + ico('shuttle') + '<span class="hlc-fit">'
      + pairOf(L, function (lg) { return BS.bs('hotelShuttle', lg); }, 'hotelShuttle') + '</span></div>' : '';
    // the place of a partner hotel, on a page with no card hotel: a line for each language
    var slot = '';
    if (!gold.length) {
      var said = Object.create(null);
      slot = '<div class="hlc-hub-slot">' + L.map(function (lg) {
        var a = BS.bs('hotelsPartnerSlot', lg), b = BS.bs('hotelsPlacement', lg);
        if (!a || !b || said[a + '|' + b]) return '';
        said[a + '|' + b] = 1;
        return '<div class="hlc-hub-slot-l"><span class="hlc-fit">' + BS.half(lg, '<small class="hlc-hub-tag">' + esc(a)
          + '</small><span class="hlc-hub-av">' + esc(b) + '</span>', '', { key: 'hotelsPartnerSlot' }) + '</span></div>';
      }).join('') + '</div>';
    }
    // the card hotels: logo, name, street and telephone, in a fine gold frame on the cream
    var golds = gold.length ? '<div class="hlc-hub-cards">' + gold.map(function (h) {
      return '<div class="hlc-hub-card" data-hotel="' + esc(h.id) + '">' + hubLogo(h)
        + '<div class="hlc-text">' + nameOf(h, '', '')
        + '<div class="hlc-info"><span class="hlc-fit">' + infoOf(streetOf(h), true) + '</span></div></div></div>';
    }).join('') + '</div>' : '';
    // the lines of this pass: the name, and the shuttle mark where it is verified, else the street
    var lines = rows.map(function (h) {
      var note = (h.shuttle && h.shuttle.mark === true) ? ico('shuttle', 'hlc-mark') : infoOf(streetOf(h), false);
      return '<div class="hlc-hub-row" data-hotel="' + esc(h.id) + '">' + nameOf(h, '', '<span class="hlc-hub-note">' + note + '</span>') + '</div>';
    }).join('');
    // how many more the scan code lists (none: the invitation alone), and the word beside the code
    var rest = pairHtml(L, function (lg) {
      var m = more > 0 ? withData(BS.bs(HUB_MORE[area], lg), { N: esc(BS.num(more, lg)) }) : '';
      var s = BS.bs('hotelListScan', lg);
      // m is markup already (withData): only the invitation is escaped here
      return (m && s) ? m + '<span class="hlc-hub-cut">' + DOT + esc(s) + '</span>' : (s ? esc(s) : m);
    }, more > 0 ? HUB_MORE[area] : 'hotelListScan');
    var scan = pairOf(L, function (lg) { return BS.bs('hotelsScan', lg); }, 'hotelsScan');
    var foot = linesOf(L, function (lg) { return BS.bs('hotelsNoEndorse', lg); }, 'hotelsNoEndorse');
    return '<div class="axr-page hlc-view hlc-hub' + (o.first ? ' axr-page-on' : '') + '" data-area="' + esc(area) + '">'
      + '<div class="hlc-hub-in">'
      +   '<div class="hlc-hub-head">'
      +     '<div class="hlc-hub-titles">'
      +       (place || region ? '<div class="hlc-city"><span class="hlc-fit">' + place + region + '</span></div>' : '')
      +       '<div class="hlc-title hlc-pairfit"><span class="hlc-fit">' + title + '</span></div>'
      +     '</div>'
      +     '<div class="hlc-scan"><div class="hlc-qr" data-qr-url="' + esc(qrUrl(city, area, o.home)) + '"></div></div>'
      +   '</div>'
      +   '<div class="hlc-hub-bar"><div class="hlc-hub-area hlc-pairfit"><span class="hlc-fit">' + head + '</span></div>' + tally + '</div>'
      +   go + legend + slot + golds
      +   '<div class="hlc-hub-rows">' + lines
      +     '<div class="hlc-hub-more"><div class="hlc-hub-rest hlc-pairfit"><span class="hlc-fit">' + rest + '</span></div>'
      +     '<div class="hlc-hub-scan">' + scan + '</div></div>'
      +   '</div>'
      + '</div>'
      + '<div class="hlc-foot hlc-hub-foot">' + foot + '</div>'
      + '</div>';
  }
  // The whole slot: one card a view (a page a view in a hub city). o.pass (the deck's passes),
  // o.date, o.home (the airport of the screen, for the app link).
  function build(doc, L, o) {
    o = o || {};
    var city = up(doc && doc.iata), hub = isHub(doc);
    var list = shown(doc, o.date == null ? null : o.date, o.tz || tzOf(city));
    if (!list.length) return '';
    var html = list.map(function (c, i) {
      return (hub ? hubPage : card)(doc, c, L, { pass: o.pass, home: o.home, first: i === 0 });
    }).join('');
    return '<div class="hlc' + (hub ? ' hlc--hub' : '') + (L.length < 2 ? ' hlc--one' : '') + '" data-city="' + esc(city) + '">'
      + '<div class="axr-pages hlc-views">' + html + '</div></div>';
  }
  // The picture of the city behind the card: the same checked photograph the weather card shows
  // for it (fids-core's _wxCityPic, the day picture), only from the board's own set of pictures
  // (/logos/cities/), never the picture service. '' where the board has none: the plain card.
  function picOf(c) {
    var u = '';
    try { u = typeof root._wxCityPic === 'function' ? String(root._wxCityPic(c, false) || '') : ''; } catch (e) { u = ''; }
    return /^\/logos\/cities\/[A-Z]{3}\.jpg$/.test(u) ? u : '';
  }
  // The photographer, where the licence asks for a credit: the weather card's own line.
  function creditOf(u) {
    try { return typeof root._wxPicCreditHtml === 'function' ? String(root._wxPicCreditHtml([u], 'hlc-find-credit') || '') : ''; } catch (e) { return ''; }
  }
  // The card of a city without a list: "Hotels in {CITY}", one line for each language of the
  // board (a line that says the same as the one before it is left out), the scan code to the
  // phone app (with where the city is, whereOf, for its map search), and the invitation in the
  // navy foot. One view. '' when the board has no name for the city. o.home (the airport of the
  // screen, for the app link).
  function buildFind(city, L, o) {
    o = o || {};
    var BS = store(), c = up(city);
    if (!BS || !Array.isArray(L) || !L.length || !findName(c)) return '';
    var seen = Object.create(null), head = [];
    L.forEach(function (lg) {
      var nm = findName(c, lg), t = '';
      try { t = BS.bs('hotelsInCity', lg) || ''; } catch (e) { t = ''; }
      if (!nm || !t || t.indexOf('{CITY}') < 0) return;
      var line = esc(t).split('{CITY}').join('<bdi>' + esc(nm) + '</bdi>');
      if (seen[line]) return;
      seen[line] = 1;
      head.push('<div class="hlc-tl"><span class="hlc-fit">' + BS.half(lg, line, '', { key: 'hotelsInCity' }) + '</span></div>');
    });
    if (!head.length) return '';
    var say = linesOf(L, function (lg) { return BS.bs('hotelsFindScan', lg); }, 'hotelsFindScan');
    var pic = picOf(c), cred = pic ? creditOf(pic) : '';
    return '<div class="hlc hlc--find' + (L.length < 2 ? ' hlc--one' : '') + '" data-city="' + esc(c) + '">'
      + '<div class="axr-pages hlc-views">'
      +   '<div class="axr-page hlc-view hlc-find' + (pic ? ' hlc-find--pic' : '') + ' axr-page-on" data-area="find">'
      +     (pic ? '<div class="hlc-find-pic" aria-hidden="true" style="background-image:url(&#39;' + esc(pic) + '&#39;)"></div>' : '')
      +     '<div class="hlc-find-head"><div class="hlc-find-title">' + head.join('') + '</div></div>'
      +     '<div class="hlc-find-scan"><div class="hlc-qr" data-qr-url="' + esc(qrUrl(c, '', o.home, whereOf(c))) + '"></div>' + cred + '</div>'
      +     '<div class="hlc-foot hlc-find-foot">' + ico('smartphone', 'hlc-find-ico') + '<div class="hlc-find-say">' + say + '</div></div>'
      +   '</div>'
      + '</div></div>';
  }

  // One pixel of the 1680x1050 design in real pixels: the stylesheet's --hlc-px, the smaller of
  // the height and the width of the screen (the same two figures). Worked out here because the
  // computed value of a custom property is its text (min(...)), not a length.
  function unitPx(w, h) {
    if (w == null || h == null) {
      try { w = Number(root.innerWidth) || 0; h = Number(root.innerHeight) || 0; } catch (e) { w = 0; h = 0; }
    }
    if (!(w > 0) || !(h > 0)) return 1;
    return Math.min(h * 0.09524, w * 0.05952) / 100;
  }
  // The smallest a fitted text may be, in real pixels, on a screen of that size (this one when
  // none is given): 18 px at 1680x1050, the same share of any other screen.
  function floorPx(w, h) { return FLOOR * unitPx(w, h); }
  // A one-line text that is too long for its place steps down (never under the floor, and never
  // under seven tenths of its own size); a pair that still cannot share the line is stacked,
  // each language whole.
  function fit(el) {
    try {
      var art = el && el.querySelector ? el.querySelector('.hlc') : null;
      if (!art) return;
      var least = floorPx();
      // the legends of the shuttle mark of a hub city, shown again before the lines are fitted
      var legends = [];
      try {
        legends = Array.prototype.slice.call(art.querySelectorAll('.hlc-hub-legend'));
        legends.forEach(function (lg) { lg.classList.remove('hlc-hub-legend--off'); });
      } catch (e0) { legends = []; }
      Array.prototype.forEach.call(art.querySelectorAll('.hlc-fit'), function (s) {
        var box = s.parentElement;
        if (!box) return;
        box.style.fontSize = ''; box.classList.remove('hlc-stack'); box.classList.remove('hlc-clip'); box.classList.remove('hlc-drop');
        if (!box.getClientRects().length) return;
        var cs = getComputedStyle(box), base = parseFloat(cs.fontSize), k = 1;
        var floor = Math.min(1, Math.max(0.7, least / base));
        var room = function () {
          var r = box.getBoundingClientRect(), sib = 0;
          Array.prototype.forEach.call(box.children, function (c) {
            if (c !== s && c.getClientRects().length) sib += c.getBoundingClientRect().width;
          });
          return r.width - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - sib;
        };
        // a hundredth at a time, the last step landing on the floor itself (counting down in
        // hundredths drifts, and stopped a step short of it)
        var step = function () {
          while (s.scrollWidth > room() + 0.5 && k > floor + 1e-9) { k = Math.max(floor, k - 0.01); box.style.fontSize = (base * k) + 'px'; }
        };
        step();
        if (s.scrollWidth > room() + 0.5 && box.classList.contains('hlc-pairfit')) {
          box.style.fontSize = ''; k = 1; box.classList.add('hlc-stack'); step();
        }
        // a line of a hub city still too long at the floor: what may give way does (the note of a
        // line, the street or the shuttle mark; the invitation after how many more), and the line
        // is fitted again without it, on one line first
        if (s.scrollWidth > room() + 0.5 && box.querySelector && box.querySelector(':scope > .hlc-hub-note, .hlc-hub-cut')) {
          box.style.fontSize = ''; k = 1; box.classList.remove('hlc-stack'); box.classList.add('hlc-drop'); step();
          if (s.scrollWidth > room() + 0.5 && box.classList.contains('hlc-pairfit')) { box.style.fontSize = ''; k = 1; box.classList.add('hlc-stack'); step(); }
        }
        // still too long at the floor: the address gives way (an ellipsis at its end), never the
        // telephone after it
        if (s.scrollWidth > room() + 0.5 && box.classList.contains('hlc-info')) box.classList.add('hlc-clip');
      });
      // a hub page whose every shuttle mark gave way with its line's note: no legend for a mark the
      // page no longer shows
      try {
        legends.forEach(function (lg) {
          var pg = lg.closest('.hlc-view');
          if (!pg) return;
          var left = Array.prototype.some.call(pg.querySelectorAll('.hlc-hub-row .hlc-mark'), function (mk) { return !mk.closest('.hlc-drop'); });
          if (!left) lg.classList.add('hlc-hub-legend--off');
        });
      } catch (e5) {}
    } catch (e) {}
  }
  // The proportions of an SVG file that has no width and height of its own, where the browser
  // gives it no natural size (Chrome gives 300 wide; another engine may give 0): the picture laid
  // out at a known width, its height from the file's own viewBox. [0, 0] for any other file.
  function svgSize(im) {
    if (!/\.svg(?:[?#]|$)/i.test(String(im.getAttribute('src') || '')) || typeof im.getBoundingClientRect !== 'function') return [0, 0];
    var keep = im.style.cssText;
    im.style.cssText = 'position:absolute; visibility:hidden; max-width:none; max-height:none; width:100px; height:auto;';
    var r = im.getBoundingClientRect();
    im.style.cssText = keep;
    return [r.width, r.height];
  }
  // The trim of each card hotel's logo (hubLogo): the trimmed part of the picture contained and
  // centred in its cell, as object-view-box would show it, from the file's own proportions once it
  // has loaded (an SVG with no size of its own still has them, svgSize); placed again whenever
  // asked.
  function crops(el) {
    try {
      Array.prototype.forEach.call(el.querySelectorAll('.hlc-hub-pic > img[data-trim]'), function (im) {
        var place = function () {
          var box = im.parentElement, m = TRIM.exec(im.getAttribute('data-trim') || '');
          var W = box ? box.clientWidth : 0, H = box ? box.clientHeight : 0, nw = im.naturalWidth, nh = im.naturalHeight;
          if (m && W > 0 && H > 0 && im.complete && !(nw > 0 && nh > 0)) { var sz = svgSize(im); nw = sz[0]; nh = sz[1]; }
          if (!m || !(W > 0) || !(H > 0) || !(nw > 0) || !(nh > 0)) return;
          var t = m[1] / 100, r = m[2] / 100, b = m[3] / 100, l = m[4] / 100, fw = 1 - l - r, fh = 1 - t - b;
          if (!(fw > 0) || !(fh > 0)) return;
          var ca = (nw / nh) * fw / fh, cw = W, ch = W / ca;
          if (ch > H) { ch = H; cw = H * ca; }
          var FW = cw / fw, FH = ch / fh;
          im.style.cssText = 'position:absolute; max-width:none; max-height:none; object-fit:fill; width:' + FW + 'px; height:' + FH + 'px; left:'
            + ((W - cw) / 2 - l * FW) + 'px; top:' + ((H - ch) / 2 - t * FH) + 'px;';
        };
        // loaded: placed now (a size-less SVG too, whose natural width may be 0); and again on a
        // load to come
        if (im.complete) place();
        if (!im.__hlcCrop && typeof im.addEventListener === 'function') { im.__hlcCrop = 1; im.addEventListener('load', place); }
      });
    } catch (e) {}
  }
  // Fit again when the faces arrive and whenever the stage changes size; draw the scan codes.
  function watch(el) {
    try {
      var art = el.querySelector('.hlc');
      if (!art) return;
      var again = function () { try { if (art.isConnected) { fit(el); codes(el); crops(el); } } catch (e) {} };
      if (root.document && root.document.fonts && root.document.fonts.load) {
        try {
          var faces = [root.document.fonts.load('600 30px "HL Playfair Display"'), root.document.fonts.load('500 20px "HL Montserrat"'),
            root.document.fonts.load('600 20px "HL Montserrat"')];
          // a hub city: the faces of the board (css/font.css)
          if (art.classList && art.classList.contains('hlc--hub')) {
            faces.push(root.document.fonts.load('700 25px "AC Nord Display"'), root.document.fonts.load('500 18px "AC Nord Text"'),
              root.document.fonts.load('400 18px "AC Nord Text"'));
          }
          Promise.all(faces).then(again, again);
        } catch (e1) {}
        // any face that arrives later (another weight, a script face) changes the widths the
        // fitter measured: fit again then, until the card leaves the page
        try {
          var fontsDone = function () {
            if (!art.isConnected) { try { root.document.fonts.removeEventListener('loadingdone', fontsDone); } catch (e4) {} return; }
            again();
          };
          if (root.document.fonts.addEventListener) root.document.fonts.addEventListener('loadingdone', fontsDone);
          if (root.document.fonts.ready && root.document.fonts.ready.then) root.document.fonts.ready.then(again, again);
        } catch (e2) {}
      }
      if (typeof root.ResizeObserver === 'function') {
        var t = 0;
        var ro = new root.ResizeObserver(function () {
          if (!art.isConnected) { try { ro.disconnect(); } catch (e3) {} return; }
          if (t) return;
          t = root.requestAnimationFrame ? root.requestAnimationFrame(function () { t = 0; again(); }) : root.setTimeout(function () { t = 0; again(); }, 50);
        });
        ro.observe(art);
      }
    } catch (e) {}
  }
  // The scan codes: drawn by the board's QR library (qrcode.js) at the size they are shown (the
  // box's width inside its padding, so the code is never scaled down after it is drawn), navy
  // modules on the cream of the card, with the quiet zone of the box around them. Drawn again
  // whenever that size has changed since (the large code of a city without a list takes the room
  // the card has, which is known only once it is laid out, and changes when the faces arrive); a
  // drawing never changes the box, so a code is drawn once a size.
  function codes(el) {
    try {
      if (typeof root.QRCode === 'undefined') return;
      Array.prototype.forEach.call(el.querySelectorAll('.hlc-qr[data-qr-url]'), function (q) {
        var url = q.getAttribute('data-qr-url'), pad = 0;
        try {
          var cs = (typeof root.getComputedStyle === 'function') ? root.getComputedStyle(q) : null;
          if (cs) pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        } catch (e1) { pad = 0; }
        var w = Math.max(64, Math.floor((q.clientWidth || 0) - pad));
        if (!url || (q.getAttribute('data-qr-done') === url && (Number(q.getAttribute('data-qr-w')) || 0) === w)) return;
        q.innerHTML = '';
        new root.QRCode(q, { text: url, width: w, height: w, colorDark: '#14203c', colorLight: '#f5efe3', correctLevel: root.QRCode.CorrectLevel.M });
        q.setAttribute('data-qr-done', url);
        q.setAttribute('data-qr-w', String(w));
      });
    } catch (e) {}
  }

  // Draws the slot into the carousel. False when nothing is due here (the deck then passes the
  // slot over). The markup is written only when it changes, so the pager keeps its place across
  // the repaints of the board.
  function render(el) {
    try {
      if (!el || !due()) return false;
      var BS = store();
      if (!BS || typeof BS.pairLangs !== 'function') return false;
      var c = cityFor(), doc = c ? get(c) : null;
      // a city with a list: its cards; any other city the board names: its one card
      var html = c ? build(doc, boardPair(), { pass: passNow(), home: String(root._gateIata || ''), tz: tzOf(c) })
        : buildFind(findCity(), boardPair(), { home: String(root._gateIata || '') });
      // a hub city with no page open on the day: its "Hotels in" card
      if (!html && hubFind(c, doc)) html = buildFind(c, boardPair(), { home: String(root._gateIata || '') });
      if (!html) return false;
      if (el.__hlcHtml !== html || !el.querySelector(':scope > .hlc')) {
        el.innerHTML = html;
        el.__hlcHtml = html;
        watch(el);
      }
      fit(el);
      codes(el);
      crops(el);
      // the QR library may arrive after the first paint: draw the codes once it has
      if (typeof root.QRCode === 'undefined' && root.setTimeout) root.setTimeout(function () { codes(el); }, 2500);
      try { if (typeof root._axrPageSync === 'function') root._axrPageSync(); } catch (e2) {}
      return true;
    } catch (e) { return false; }
  }
  // The logos of the city's list, for the deck to warm before the slot comes round (a hub city:
  // the logos of its card hotels, the only ones its pages show).
  function media() {
    var c = cityFor(), doc = c ? get(c) : null, out = [];
    // (a hub city with no page open shows its "Hotels in" card: no logo)
    if (!doc || hubFind(c, doc)) return out;
    var hub = isHub(doc);
    doc.hotels.forEach(function (h) {
      if (hub && h.card !== true) return;
      if (h.logo && h.logo.file && out.indexOf(h.logo.file) < 0) out.push(h.logo.file);
    });
    (doc.foot_marks || []).forEach(function (m) { if (m.file) out.push(m.file); });
    return out;
  }

  // A review link (?hotellist=) asks for its list at once, so the pinned scene has it on its
  // first paint.
  try { if (review()) load(review()); } catch (e) {}

  return {
    CITIES: CITIES,
    HUBS: HUBS,
    AREAS: AREAS,
    HEAD: HEAD,
    HUB_AREAS: HUB_AREAS,
    HUB_HEAD: HUB_HEAD,
    HUB_MORE: HUB_MORE,
    TRANSIT: TRANSIT,
    HUB_MIN: HUB_MIN,
    HUB_ROWS: HUB_ROWS,
    HUB_ROWS_MIN: HUB_ROWS_MIN,
    HUB_CARDS: HUB_CARDS,
    RULE: RULE,
    PER_CARD: PER_CARD,
    VIEW_MS: VIEW_MS,
    FIND_MS: FIND_MS,
    FLOOR: FLOOR,
    ICON: ICON,
    dataUrl: dataUrl,
    get: get,
    put: put,
    load: load,
    km: km,
    areaOf: areaOf,
    monthDay: monthDay,
    isOpen: isOpen,
    cards: cards,
    isHub: isHub,
    shown: shown,
    page: page,
    cityFor: cityFor,
    findCity: findCity,
    findName: findName,
    due: due,
    dwellMs: dwellMs,
    qrUrl: qrUrl,
    whereOf: whereOf,
    searchPlace: searchPlace,
    mapLinks: mapLinks,
    build: build,
    buildFind: buildFind,
    unitPx: unitPx,
    floorPx: floorPx,
    fit: fit,
    crops: crops,
    render: render,
    media: media
  };
});
