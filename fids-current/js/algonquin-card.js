/* THE ALGONQUIN RESORT, ST. ANDREWS BY-THE-SEA: a hotel page of the gate centre deck.

   A whole page for one resort, as the hotel cards are: it takes one slot of the centre deck of a
   gate screen (the slide type is algonquin) and shows four views in turn:
     today      the photograph of the resort, the name, the address, the telephone, the distance
                by road from the airport of Moncton
     yesteryear the name, two watercolours of the resort (1990 and 1994), each whole in its own
                gilt frame, under each its year and where the hotel featured it, and one
                credit for the painter under the pair
     story      the name, the heading pair and a timeline: the years in one column, one line
                for each year in each language of the board beside it
     scan       the name, the invitation, a scan code for the site of the resort, the web address
   People fly to Moncton to drive to it, so the page is on a gate whose flight goes to Moncton
   (a stop there counts) and on every gate at Moncton, and nowhere else.

   WORDS: every word comes from the store (js/board-strings.js) in the languages of the board,
   the first language of the board first. The name of the house, its address, its telephone, its
   web address, the name of the painter and the name of the dining room on whose menu the older
   watercolour was featured are data: they are in the one table below, as the house, the painter
   and the menu write them. The name of the house heads each view; the painter is named in the
   credit, once in each language of the board.
   VIEWS: each view is an .axr-page layer inside an .axr-pages wrap, so the pager of the hotel
   cards turns them (ten seconds a view, the last one held) and the language check reads all four.
   LOOK: css/algonquin-card.css. The pictures are files of the site (assets/hotels/algonquin).
   The scan code is drawn here from a stored matrix, navy on the cream, with its quiet zone. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AlgonquinCard = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  // THE FACTS OF THE HOUSE, as the house writes them (algonquinresort.com), the painter of the
  // two watercolours, the dining room of the hotel as its 1990 menu names it (the older
  // watercolour was featured on one of its dinner menus), and two names the timeline says: the
  // railway that bought the hotel (it has a French name of its own) and the collection the hotel
  // belongs to. Data: none of it is a word
  // to translate.
  var ALGONQUIN_HOTEL = {
    name: 'The Algonquin Resort',
    address: '184 Adolphus Street, St. Andrews by-the-Sea, New Brunswick',
    phone: '1-855-529-8693',
    web: 'algonquinresort.com',
    url: 'https://algonquinresort.com',
    painter: 'Peter Bresnen',
    menuRoom: 'Passamaquoddy Dining Room',
    rail: 'Canadian Pacific',
    railFr: 'Canadien Pacifique',
    brand: 'Autograph Collection'
  };
  // The airport the distance is measured from, the road distance to the door in kilometres
  // (two routers agree), and the driving time the house publishes.
  var FROM_AIRPORT = 'YQM';
  var ROAD_KM = 265;
  var ROAD_HOURS = 2;
  var ROAD_MINUTES = 30;
  // One slot of the deck: four views at the ten seconds of the pager, the last one held.
  var DWELL_MS = 44000;

  var PHOTO = '/assets/hotels/algonquin/resort-aerial.jpg';
  // The two watercolours, the older one first: the file (both are 1600 x 1073, so the two
  // frames are the same size), the year it is signed, and the key of the words that say its
  // year, what it was made as and where the hotel featured it.
  var ART = [
    { src: '/assets/hotels/algonquin/bresnen-1990.jpg', year: '1990', say: 'algonquinArt1990' },
    { src: '/assets/hotels/algonquin/bresnen-1994.jpg', year: '1994', say: 'algonquinArt1994' }
  ];
  var FRAME = '/assets/hotels/algonquin/gilt-frame-wide.png';
  // The timeline of the story view: the year, and the key of the line that says what happened.
  var STORY = [
    { year: '1889', say: 'algonquinStory1889' },
    { year: '1903', say: 'algonquinStory1903' },
    { year: '1915', say: 'algonquinStory1915' },
    { year: '1983', say: 'algonquinStory1983' },
    { year: '2014', say: 'algonquinStory2014' }
  ];
  // the Autograph Collection file of the site; the view trims its empty canvas only
  var BRAND_FILE = '/logos/hotels/marriott/autograph-collection.svg';
  var BRAND_VIEW = '#svgView(viewBox(54,367,1092,466))';

  // Material Icons (Google), Apache 2.0: the same family as the icons of the board
  var ICON = {
    plane: '<svg viewBox="40 -923 880 880" aria-hidden="true"><path d="M480-117 376-87q-10 3-18-3.5t-8-16.5q0-9 2-13.5t6-7.5l72-54v-251l-314 93q-14 4-25-4.5T80-367q0-11 4-18t10-11l336-198v-236q0-21 14.5-35.5T480-880q21 0 35.5 14.5T530-830v236l336 198q6 4 10 11t4 18q0 14-11 22.5t-25 4.5l-314-93v251l72 54q4 3 6 7.5t2 13.5q0 10-8 16.500T584-87l-104-30Z"/></svg>',
    car: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.920 6.010C18.720 5.420 18.160 5 17.500 5h-11c-.66 0-1.210.42-1.420 1.010L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.080-5.990zM6.500 16c-.83 0-1.500-.67-1.500-1.500S5.670 13 6.500 13s1.500.67 1.500 1.500S7.330 16 6.500 16zm11 0c-.83 0-1.500-.67-1.500-1.500s.67-1.500 1.500-1.500 1.500.67 1.500 1.500-.67 1.500-1.500 1.500zM5 11l1.500-4.500h11L19 11H5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.620 10.790c1.440 2.830 3.760 5.140 6.590 6.590l2.200-2.200c.27-.27.67-.36 1.020-.24 1.120.37 2.330.57 3.570.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.390 0-17-7.610-17-17 0-.55.45-1 1-1h3.500c.55 0 1 .45 1 1 0 1.250.2 2.450.57 3.570.11.35.03.74-.25 1.020l-2.200 2.200z"/></svg>'
  };

  // The scan code of ALGONQUIN_HOTEL.url (level M), 1 = dark, one module of quiet zone included.
  var QR = [
    '0000000000000000000000000000000',
    '0111111100001100110011011111110',
    '0100000100101000000000010000010',
    '0101110101001001010110010111010',
    '0101110101101000011101010111010',
    '0101110101001111101111010111010',
    '0100000101001011111001010000010',
    '0111111101010101010101011111110',
    '0000000001001110100111000000000',
    '0101111100110001101010011111000',
    '0010010000100000110111111100010',
    '0001001101010100001101011000000',
    '0100001001010101010010111010100',
    '0101101111011000011001000011000',
    '0010000001010011101111011100010',
    '0101101110001011111001101011000',
    '0011110001101110100001001100100',
    '0000011110011001101000000011000',
    '0111000010111100111111011101010',
    '0101011100010000000000000101000',
    '0100010000100001010010001000100',
    '0101001100010100010101111101110',
    '0000000001010011101111000111110',
    '0111111100100011111011010111000',
    '0100000101111110101111000100010',
    '0101110101000101100001111101110',
    '0101110101101000110101000011000',
    '0101110101010011000111111111100',
    '0100000100101110010001111110100',
    '0111111101100110010110000101000',
    '0000000000000000000000000000000'
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ico(k) { return '<i class="alq-ico">' + ICON[k] + '</i>'; }

  // Dark modules in the ink of the page, nothing behind them but the cream. The matrix holds one
  // module of quiet zone; the view adds three more, so four clear modules lie inside the box of
  // the code on every side.
  function qrSvg(m) {
    var n = m.length, d = '', q = 3;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (m[y].charAt(x) !== '1') continue;
        var w = 1;
        while (x + w < n && m[y].charAt(x + w) === '1') w++;
        d += 'M' + x + ' ' + y + 'h' + w + 'v1h-' + w + 'z';
        x += w - 1;
      }
    }
    return '<svg viewBox="' + (-q) + ' ' + (-q) + ' ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" data-modules="' + (n - 2)
      + '" role="img" shape-rendering="crispEdges"><path fill="currentColor" d="' + d + '"/></svg>';
  }

  // WHERE THE PAGE SHOWS: at Moncton, and on a gate whose flight goes to Moncton or stops there.
  // A gate that only receives an arrival has no flight of its own and shows nothing.
  function due() {
    try {
      if (String(root._gateIata || '').toUpperCase() === FROM_AIRPORT) return true;
      var cf = root._gateCurrentFlight;
      if (!cf) return false;
      if (String(cf._locIata || '').toUpperCase() === FROM_AIRPORT) return true;
      var legs = (typeof root._flightLegs === 'function') ? root._flightLegs(cf) : [];
      return Array.isArray(legs) && legs.indexOf(FROM_AIRPORT) !== -1;
    } catch (e) { return false; }
  }

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
  // One fact in the languages of the board: a half for each, a thin rule between two. `say`
  // gives the words of one language, unescaped (they are escaped here, once); a second half
  // that says the same as the first is left out.
  function pairOf(L, say, key) {
    var BS = store(), out = [], seen = Object.create(null);
    L.forEach(function (lg) {
      var w = '';
      try { w = say(lg) || ''; } catch (e) { w = ''; }
      if (!w || seen[w]) return;
      seen[w] = 1;
      // the key carries the mark of a careful translation onto the half
      out.push(key ? BS.half(lg, esc(w), '', { key: key }) : BS.half(lg, esc(w)));
    });
    return out.join('<b class="alq-sep"></b>');
  }
  function cityOf(lg) {
    var c = '';
    try { c = (typeof root._gateMapCity === 'function') ? root._gateMapCity(FROM_AIRPORT, lg) : ''; } catch (e) { c = ''; }
    return c || FROM_AIRPORT;
  }
  function invite(lg) {
    try { return (typeof TLin === 'function') ? TLin('scanToDiscover', lg) : ''; } catch (e) { return ''; }
  }

  function build(L) {
    var BS = store(), H = ALGONQUIN_HOTEL;
    var band = '<div class="alq-band"><img alt="" src="' + esc(BRAND_FILE + BRAND_VIEW) + '"></div>';
    var name = '<div class="alq-name"><span class="alq-fit">' + esc(H.name) + '</span></div>';

    // TODAY
    var far = pairOf(L, function (lg) {
      return BS.fmt('hotelFromAirport', lg, { KM: BS.num(ROAD_KM, lg) + ' km', CITY: cityOf(lg) }, true);
    });
    var road = pairOf(L, function (lg) {
      return BS.fmt('hotelByRoad', lg, { H: BS.num(ROAD_HOURS, lg), M: BS.num(ROAD_MINUTES, lg) }, true);
    });
    var today = '<div class="alq-hero">'
      + '<div class="alq-top"><img class="alq-photo" alt="" decoding="async" src="' + esc(PHOTO) + '"></div>'
      + '<div class="alq-under">' + name
      +   '<div class="alq-line"><span class="alq-fit">' + esc(H.address) + '</span></div>'
      +   '<div class="alq-row">' + ico('phone') + '<span class="alq-fit">' + esc(H.phone) + '</span></div>'
      +   '<div class="alq-row alq-pairfit">' + ico('plane') + '<span class="alq-fit">' + far + '</span></div>'
      +   '<div class="alq-row alq-pairfit">' + ico('car') + '<span class="alq-fit">' + road + '</span></div>'
      + '</div></div>';

    // YESTERYEAR: the two watercolours. They carry no lettering, so the view sets the name of
    // the house itself.
    var era = pairOf(L, function (lg) { return BS.bs('hotelYesteryear', lg); });
    var arts = ART.map(function (a) {
      return '<img class="alq-art" alt="' + esc(H.name + ', ' + a.year) + '" decoding="async" src="' + esc(a.src) + '">';
    }).join('');
    // one label for each picture (its year, then where the hotel featured it), one credit for the pair
    var labels = ART.map(function (a) {
      return '<div class="alq-label"><span class="alq-lyr">' + esc(a.year) + '</span>'
        + '<span class="alq-say">' + pairOf(L, function (lg) { return BS.fmt(a.say, lg, { ROOM: H.menuRoom }, true); }, a.say) + '</span></div>';
    }).join('');
    var credit = pairOf(L, function (lg) { return BS.fmt('hotelArtworkBy', lg, { WHO: H.painter }, true); });
    var then = '<div class="alq-hero">' + name
      + '<div class="alq-cardbox">' + arts + '</div>'
      + '<div class="alq-labels">' + labels + '</div>'
      + '<div class="alq-credit alq-pairfit"><span class="alq-fit">' + credit + '</span></div>'
      + '</div>';

    // STORY: the timeline
    var rows = STORY.map(function (t) {
      return '<span class="alq-yr">' + esc(t.year) + '</span>'
        + '<span class="alq-ev">' + pairOf(L, function (lg) { return BS.fmt(t.say, lg, { RAIL: lg === 'fr' ? H.railFr : H.rail, BRAND: H.brand }, true); }, t.say) + '</span>';
    }).join('');
    var story = '<div class="alq-hero">' + name
      + '<div class="alq-era alq-pairfit"><span class="alq-fit">' + era + '</span></div>'
      + '<div class="alq-time">' + rows + '</div>'
      + '</div>';

    // SCAN
    var scan = '<div class="alq-hero">' + name
      + '<div class="alq-invite alq-pairfit"><span class="alq-fit">' + pairOf(L, invite) + '</span></div>'
      + '<div class="alq-codebox"><div class="alq-qr" data-qr-url="' + esc(H.url) + '">' + qrSvg(QR) + '</div></div>'
      + '<div class="alq-web"><span class="alq-fit">' + esc(H.web) + '</span></div>'
      + '</div>';

    var n = 0;
    L.forEach(function () { n++; });
    return '<div class="alq' + (n < 2 ? ' alq--one' : '') + '" data-hotel="algonquin">'
      + '<div class="axr-pages alq-views">'
      +   '<div class="axr-page axr-page-on alq-view alq--today">' + today + band + '</div>'
      +   '<div class="axr-page alq-view alq--then">' + then + band + '</div>'
      +   '<div class="axr-page alq-view alq--story">' + story + band + '</div>'
      +   '<div class="axr-page alq-view alq--scan">' + scan + band + '</div>'
      + '</div></div>';
  }

  // A one-line text that is too long for its place steps down (never under 20 px at 1680x1050,
  // the floor of the stylesheet); a pair that
  // still cannot share the line is stacked, each language whole on its own line. The labels under
  // the two pictures and the lines of the timeline wrap by themselves: the stylesheet places
  // them, nothing is measured for them here.
  function fit(el) {
    try {
      var art = el && el.querySelector ? el.querySelector('.alq') : null;
      if (!art) return;
      var minPx = Math.min(20, (root.innerHeight || 1050) * 0.0191, (root.innerWidth || 1680) * 0.012);
      Array.prototype.forEach.call(art.querySelectorAll('.alq-fit'), function (s) {
        var box = s.parentElement;
        if (!box) return;
        box.style.fontSize = ''; box.classList.remove('alq-stack');
        if (!box.getClientRects().length) return;
        var cs = getComputedStyle(box), base = parseFloat(cs.fontSize), k = 1, floor = Math.max(.86, minPx / base);
        var padX = parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
        var room = function () {
          var r = box.getBoundingClientRect(), sib = 0;
          Array.prototype.forEach.call(box.children, function (c) {
            if (c !== s && c.getClientRects().length) sib += c.getBoundingClientRect().width + parseFloat(getComputedStyle(c).marginRight || 0) + parseFloat(getComputedStyle(c).marginLeft || 0);
          });
          return r.width - padX - sib;
        };
        var step = function () {
          while (s.getBoundingClientRect().width > room() + .5 && k - .005 >= floor) { k -= .005; box.style.fontSize = (base * k) + 'px'; }
        };
        step();
        if (s.getBoundingClientRect().width > room() + .5 && box.classList.contains('alq-pairfit')) {
          box.style.fontSize = ''; k = 1; box.classList.add('alq-stack'); step();
        }
      });
    } catch (e) {}
  }

  // Fit again when the faces arrive and whenever the stage changes size.
  function watch(el) {
    try {
      var art = el.querySelector('.alq');
      if (!art) return;
      var again = function () { try { if (art.isConnected) fit(el); } catch (e) {} };
      if (root.document && root.document.fonts && root.document.fonts.ready && root.document.fonts.ready.then) {
        try { root.document.fonts.load('italic 500 20px Alegreya'); root.document.fonts.load('400 20px "Libre Caslon Text"'); } catch (e1) {}
        root.document.fonts.ready.then(again);
        try { root.document.fonts.load('italic 500 20px Alegreya').then(again); root.document.fonts.load('400 20px "Libre Caslon Text"').then(again); } catch (e2) {}
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

  // Draws the page into the carousel. False when it is not due here (the deck then passes the
  // slot over), or when the store is not there. The markup is written only when it changes, so
  // the pager keeps its place across the repaints of the board.
  function render(el) {
    try {
      if (!el || !due()) return false;
      var BS = store();
      if (!BS || typeof BS.pairLangs !== 'function') return false;
      var L = boardPair();
      var html = build(L);
      if (el.__alqHtml !== html || !el.querySelector(':scope > .alq')) {
        el.innerHTML = html;
        el.__alqHtml = html;
        watch(el);
      }
      fit(el);
      try { if (typeof root._axrPageSync === 'function') root._axrPageSync(); } catch (e2) {}
      return true;
    } catch (e) { return false; }
  }

  return {
    HOTEL: ALGONQUIN_HOTEL,
    FROM_AIRPORT: FROM_AIRPORT,
    DWELL_MS: DWELL_MS,
    media: [PHOTO].concat(ART.map(function (a) { return a.src; }), [FRAME]),
    due: due,
    build: build,
    fit: fit,
    render: render
  };
});
