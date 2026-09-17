/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   v23759 — the heritage chooser.

   Deliberately standalone. This page does not pull fids-core.js: it needs a
   list and some artwork, not a 42,000-line board engine, and keeping it
   independent means the archive page cannot be broken by a change to the
   live boards.

   The consequence is that the carrier list exists in two places — here and
   in HERITAGE_CARRIERS in fids-core.js, which is what actually drives a
   heritage gate. tests/heritage-demo.test.js holds the two in step, so a
   carrier added to one and forgotten in the other fails the suite rather
   than quietly producing a card that leads to a dead gate.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  var CARRIERS = [
    {
      code: '9A',
      name: 'Air Atlantic',
      mark: '/logos/airlines/canadian/heritage/air-atlantic.svg',
      endorsement: '/logos/airlines/canadian/heritage/canadian-airlines-partner.svg',
      home: 'YYT',
      // Checked: St. John's, Newfoundland; feeder for Canadian Pacific Air
      // Lines and then Canadian Airlines International; ceased October 1998.
      // Founding year is reported as both 1985 and 1986, so it is not claimed.
      meta: '<b>St. John’s, Newfoundland</b> · a Canadian Partner · until 1998<br>'
          + 'BAe 146-200 · Dash 8-100'
    },
    {
      code: 'ANV',
      name: 'Air Nova',
      mark: '/logos/airlines/canadian/heritage/air-nova.svg',
      home: 'YHZ',
      // Checked: founded July 1986 at Halifax; the first Air Canada Connector,
      // and a wholly owned Air Canada subsidiary; operations ceased 1 November
      // 2001, merged into Air Canada Jazz in 2002. Its own code QK belongs to
      // Jazz today, so the gate runs under a synthetic one — see fids-core.js.
      meta: '<b>Halifax, Nova Scotia</b> · the first Air Canada Connector · 1986–2001<br>'
          + 'BAe 146-200 · Dash 8-100 · Dash 8-300'
    },
    {
      code: 'CDX',
      name: 'Canadian Airlines',
      mark: '/logos/airlines/canadian/heritage/canadian-airlines.svg',
      home: 'YYC',
      // Checked: formed 27 March 1987 when Pacific Western bought CP Air;
      // became an Air Canada subsidiary on 1 January 2001.
      meta: '<b>Calgary</b> · 1987–2001<br>Boeing 737 · 767 · 747'
    }
  ];

  // Marks in the archive that cannot be offered yet, and why. Saying this out
  // loud is better than an archive page that silently omits half its folder.
  var WITHHELD =
    'Two Air Canada marks sit in the same archive — the 1964 rondelle and a later '
    + 'variant — and are not offered here. A heritage gate takes over whatever code '
    + 'its flights carry, and <b>AC is very much in service</b>, so an entry under it '
    + 'would repaint the live airline; unlike the carriers above, there is no free '
    + 'code to move it to while the mark still reads as Air Canada. The second mark’s '
    + 'date could not be confirmed either — the rondelle’s 1964 origin is well '
    + 'documented, that one is not, and nothing goes on a board here unchecked.';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var grid = document.getElementById('grid');
  grid.innerHTML = CARRIERS.map(function (c) {
    var href = 'gids.html?ap=' + encodeURIComponent(c.home)
             + '&heritage=' + encodeURIComponent(c.code);
    return '<a class="card" href="' + esc(href) + '">'
      + '<div class="markbox"><img src="' + esc(c.mark) + '" alt="' + esc(c.name) + '"></div>'
      + (c.endorsement
          ? '<div class="endorse"><img src="' + esc(c.endorsement) + '" alt="Canadian Partner"></div>'
          : '')
      + '<div class="meta">' + c.meta + '</div>'
      + '<span class="go">Open the gate · Ouvrir</span>'
      + '</a>';
  }).join('');

  document.getElementById('note').innerHTML = WITHHELD;
})();
