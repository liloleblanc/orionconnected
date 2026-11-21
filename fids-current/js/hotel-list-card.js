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
   that city has a checked list (CITIES). Nothing anywhere else. The Accor pages and the page of
   the Algonquin Resort are separate slides and are not touched by this one.

   DATA: data/hotels/<code>.json, a slim copy a city with only the fields read here and in the
   app, made by scripts/hotels/build-runtime.js from the checked file of the city
   (scripts/hotels/data/<code>.json, which keeps the source and verified mark of every fact).
   WORDS: the store (js/board-strings.js) in the languages of the board, the first language
   first; names, addresses and telephones are data. LOGOS: through <img> only, never inlined
   (an SVG with a generic <style> class leaks it into the page). LOOK: css/hotel-list-card.css.
   REVIEW: ?hotellist=YYG shows that city on any gate (inert without it), with ?scene=hotellist. */
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
  var CITIES = ['YQM', 'YYG'];
  // The cards, in the order they take turns, and the key of the heading of each.
  var AREAS = ['airport', 'downtown', 'nearby', 'resort'];
  var HEAD = { airport: 'hotelsAirport', downtown: 'hotelsDowntown', nearby: 'hotelsNearby', resort: 'hotelsResorts' };
  // The area rule the data was built to (each limit about, so 10 % over still counts; downtown
  // is tested first; a resort is a destination resort further out than the nearby limit).
  var RULE = { downtownKm: 2, airportKm: 5, nearbyKm: 30, tolerance: 1.1 };
  var PER_CARD = 5;
  // The pager of the hotel cards (fids-core.js) turns a card every ten seconds.
  var VIEW_MS = 10000;
  // The smallest text of a card, in pixels of the 1680x1050 screen the stylesheet is written at.
  var FLOOR = 18;
  // The phone app's own address (host-airport.js: .app is the app only).
  var APP_HOST = 'https://orionconnected.app/app';

  var DATA = Object.create(null);
  var ASKED = Object.create(null);

  // Material Icons (Google), Apache 2.0: the same family as the icons of the board
  var ICON = {
    shuttle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5H3c-1.100 0-2 .89-2 2v9h2c0 1.650 1.340 3 3 3s3-1.350 3-3h5.500c0 1.650 1.340 3 3 3s3-1.350 3-3H23v-5l-6-6zM3 11V7h4v4H3zm3 6.500c-.83 0-1.500-.67-1.500-1.500s.67-1.500 1.500-1.500 1.500.67 1.500 1.500-.67 1.500-1.500 1.500zM13 11H9V7h4v4zm5 6.500c-.83 0-1.500-.67-1.500-1.500s.67-1.500 1.500-1.500 1.500.67 1.500 1.500-.67 1.500-1.500 1.500zM15 11V7h1l4 4h-5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.620 10.790c1.440 2.830 3.760 5.140 6.590 6.590l2.200-2.200c.27-.27.67-.36 1.020-.24 1.120.37 2.330.57 3.570.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.390 0-17-7.610-17-17 0-.55.45-1 1-1h3.500c.55 0 1 .45 1 1 0 1.250.2 2.450.57 3.570.11.35.03.74-.25 1.020l-2.200 2.200z"/></svg>',
    car: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.920 6.010C18.720 5.420 18.160 5 17.500 5h-11c-.66 0-1.210.42-1.420 1.010L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.080-5.990zM6.500 16c-.83 0-1.500-.67-1.500-1.500S5.670 13 6.500 13s1.500.67 1.500 1.500S7.330 16 6.500 16zm11 0c-.83 0-1.500-.67-1.500-1.500s.67-1.500 1.500-1.500 1.500.67 1.500 1.500-.67 1.500-1.500 1.500zM5 11l1.500-4.500h11L19 11H5z"/></svg>'
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
  // never the same hotel twice on one card.
  function page(list, pass) {
    var n = list.length;
    if (n <= PER_CARD) return list.slice();
    var p = Math.max(0, Math.floor(Number(pass) || 0));
    var start = (p * PER_CARD) % n, out = [];
    for (var i = 0; i < PER_CARD; i++) out.push(list[(start + i) % n]);
    return out;
  }

  // ── WHERE ─────────────────────────────────────────────────────────────────
  function review() {
    try {
      var q = new URLSearchParams(root.location && root.location.search || '');
      var c = up(q.get('hotellist') || '');
      return CITIES.indexOf(c) >= 0 ? c : '';
    } catch (e) { return ''; }
  }
  // The city whose hotels a gate shows: the one its flight goes to (the last stop first, then
  // any stop), when that city has a list. A gate with no flight of its own shows nothing.
  function cityFor() {
    var r = review();
    if (r) return r;
    try {
      var cf = root._gateCurrentFlight;
      if (!cf) return '';
      var dest = up(cf._locIata);
      if (CITIES.indexOf(dest) >= 0) return dest;
      var legs = (typeof root._flightLegs === 'function') ? root._flightLegs(cf) : [];
      if (Array.isArray(legs)) {
        for (var i = legs.length - 1; i >= 0; i--) if (CITIES.indexOf(up(legs[i])) >= 0) return up(legs[i]);
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
  // Due on this gate: a city with a list, the list loaded and something open in it. The first
  // ask loads the list; the deck passes the slot over until it is there.
  function due() {
    var c = cityFor();
    if (!c) return false;
    var doc = get(c);
    if (!doc) { load(c); return false; }
    return cards(doc, null, tzOf(c)).length > 0;
  }
  function dwellMs() {
    var c = cityFor(), doc = c ? get(c) : null;
    var n = doc ? cards(doc, null, tzOf(c)).length : 1;
    return Math.max(1, n) * VIEW_MS + 4000;
  }
  // The address the scan code opens: the full list of the city in the phone app, at the card's
  // area, with the airport of the screen as the app's own airport.
  function qrUrl(city, area, home) {
    var base = APP_HOST;
    try {
      var h = String(root.location && root.location.hostname || '');
      if (h && !/(^|\.)orionconnected\.(com|ca|app)$/i.test(h)) base = String(root.location.origin || '') + '/app';
    } catch (e) {}
    return base + '?' + (home ? 'ap=' + encodeURIComponent(up(home)) + '&' : '') + 'hotels=' + encodeURIComponent(up(city))
      + (area ? '&area=' + encodeURIComponent(area) : '');
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
  function line(h, L, city, BS) {
    var info = '<bdi class="hlc-addr" translate="no">' + esc(h.address && h.address.display) + '</bdi>'
      + '<span class="hlc-tel">' + ico('phone') + '<bdi dir="ltr">' + esc(h.phone) + '</bdi></span>';
    // a resort: the drive from the airport, by road, after its name (a figure and its unit:
    // the card's heading says what it is)
    var drive = '';
    if (h.area === 'resort' && h.drive && h.drive.km) {
      drive = '<span class="hlc-drive">' + ico('car') + '<bdi dir="ltr">' + esc(String(Math.round(h.drive.km))) + ' km</bdi></span>';
    }
    return '<li class="hlc-row" data-hotel="' + esc(h.id) + '">' + logoCell(h)
      + '<div class="hlc-text">'
      +   '<div class="hlc-name"><span class="hlc-fit"><bdi translate="no">' + esc(h.name) + '</bdi>'
      +     (h.shuttle && h.shuttle.mark === true ? ico('shuttle', 'hlc-mark') : '') + '</span>' + drive + '</div>'
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
  // The whole slot: one card a view. o.pass (the deck's passes), o.date, o.home (the airport of
  // the screen, for the app link).
  function build(doc, L, o) {
    o = o || {};
    var city = up(doc && doc.iata);
    var list = cards(doc, o.date == null ? null : o.date, o.tz || tzOf(city));
    if (!list.length) return '';
    var html = list.map(function (c, i) {
      return card(doc, c, L, { pass: o.pass, home: o.home, first: i === 0 });
    }).join('');
    return '<div class="hlc' + (L.length < 2 ? ' hlc--one' : '') + '" data-city="' + esc(city) + '">'
      + '<div class="axr-pages hlc-views">' + html + '</div></div>';
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
      Array.prototype.forEach.call(art.querySelectorAll('.hlc-fit'), function (s) {
        var box = s.parentElement;
        if (!box) return;
        box.style.fontSize = ''; box.classList.remove('hlc-stack'); box.classList.remove('hlc-clip');
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
        // still too long at the floor: the address gives way (an ellipsis at its end), never the
        // telephone after it
        if (s.scrollWidth > room() + 0.5 && box.classList.contains('hlc-info')) box.classList.add('hlc-clip');
      });
    } catch (e) {}
  }
  // Fit again when the faces arrive and whenever the stage changes size; draw the scan codes.
  function watch(el) {
    try {
      var art = el.querySelector('.hlc');
      if (!art) return;
      var again = function () { try { if (art.isConnected) { fit(el); codes(el); } } catch (e) {} };
      if (root.document && root.document.fonts && root.document.fonts.load) {
        try {
          Promise.all([root.document.fonts.load('600 30px "HL Playfair Display"'), root.document.fonts.load('500 20px "HL Montserrat"'),
            root.document.fonts.load('600 20px "HL Montserrat"')]).then(again, again);
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
  // The scan codes: drawn by the board's QR library (qrcode.js) at the box's own size, navy
  // modules on the cream of the card, with the quiet zone of the box around them.
  function codes(el) {
    try {
      if (typeof root.QRCode === 'undefined') return;
      Array.prototype.forEach.call(el.querySelectorAll('.hlc-qr[data-qr-url]'), function (q) {
        var url = q.getAttribute('data-qr-url');
        if (!url || q.getAttribute('data-qr-done') === url) return;
        var w = Math.max(64, Math.round(q.clientWidth || 0));
        q.innerHTML = '';
        new root.QRCode(q, { text: url, width: w, height: w, colorDark: '#14203c', colorLight: '#f5efe3', correctLevel: root.QRCode.CorrectLevel.M });
        q.setAttribute('data-qr-done', url);
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
      var c = cityFor(), doc = get(c);
      var html = build(doc, boardPair(), { pass: passNow(), home: String(root._gateIata || ''), tz: tzOf(c) });
      if (!html) return false;
      if (el.__hlcHtml !== html || !el.querySelector(':scope > .hlc')) {
        el.innerHTML = html;
        el.__hlcHtml = html;
        watch(el);
      }
      fit(el);
      codes(el);
      // the QR library may arrive after the first paint: draw the codes once it has
      if (typeof root.QRCode === 'undefined' && root.setTimeout) root.setTimeout(function () { codes(el); }, 2500);
      try { if (typeof root._axrPageSync === 'function') root._axrPageSync(); } catch (e2) {}
      return true;
    } catch (e) { return false; }
  }
  // The logos of the city's list, for the deck to warm before the slot comes round.
  function media() {
    var c = cityFor(), doc = c ? get(c) : null, out = [];
    if (!doc) return out;
    doc.hotels.forEach(function (h) { if (h.logo && h.logo.file && out.indexOf(h.logo.file) < 0) out.push(h.logo.file); });
    (doc.foot_marks || []).forEach(function (m) { if (m.file) out.push(m.file); });
    return out;
  }

  // A review link (?hotellist=) asks for its list at once, so the pinned scene has it on its
  // first paint.
  try { if (review()) load(review()); } catch (e) {}

  return {
    CITIES: CITIES,
    AREAS: AREAS,
    HEAD: HEAD,
    RULE: RULE,
    PER_CARD: PER_CARD,
    VIEW_MS: VIEW_MS,
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
    page: page,
    cityFor: cityFor,
    due: due,
    dwellMs: dwellMs,
    qrUrl: qrUrl,
    build: build,
    unitPx: unitPx,
    floorPx: floorPx,
    fit: fit,
    render: render,
    media: media
  };
});
