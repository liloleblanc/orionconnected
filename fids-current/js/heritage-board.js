/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MONCTON, SIX IN THE MORNING, A WINTER MORNING IN 1991.

   Standalone by design, in the same spirit as heritage-index.js: this page
   loads no board engine, consults no airport roster, and makes no network
   request of any kind. It has its own data, its own markup and its own
   stylesheet, so there is nothing that can overwrite it and nothing it can
   break.

   That independence is the whole point. The heritage gate built INSIDE the
   live system spent its life being overwritten — the live refresh timer
   painted today's real flights over a 1998 demonstration every five minutes,
   because a board wired to a feed will eventually be given one.

   ── WHY A YEAR AND NOT AN ERA ──

   This board was first written as "the mid-nineties", which cannot be checked
   against anything. The network changed continually: Fredericton's link moved
   from Montreal to Ottawa, the Saint John run started on the 146 and did not
   stay there, and Air Nova itself stopped existing in 2002. A board vague
   about its year is vague about all of that.

   1991, because that is the year of the OAG that documents two of its rows. A
   board and its source should be describing the same station.

   ── EVERYTHING HERE IS INVENTED, AND THE ROUTES ARE NOT ──

   The flights are fiction. The NETWORK is not: who flew where out of Moncton,
   who did not, which aircraft worked which run and how the day was shaped all
   come from somebody who stood in that terminal. That is why this is written
   down rather than generated.

   A generator produced the version this replaces, and it invented Gander,
   St. John's and Saint John as Air Atlantic destinations from Moncton. Air
   Atlantic flew Halifax from Moncton and nothing else. The failure is
   characteristic: regionally plausible, entirely wrong, and undetectable
   without someone who was there. Data that is written down can only be as
   wrong as what we were told.

   Each flight carries `src`, which says where its number came from:
     'recalled'  — a real flight number, remembered
     'invented'  — plausible, made up, and marked as such
   Nothing here should ever be presented as a record.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  // ── THE BOARD'S OWN WORLD ────────────────────────────────────────────
  // No AP roster, no tz lookup, no AIRLINE_NAME. Every fact a row needs is
  // a literal on the row.

  var STATION = { iata: 'YQM', en: 'Moncton', fr: 'Moncton' };

  // The depicted moment. The clock starts here and runs; it is not the
  // viewer's clock and never consults it, so this board reads identically
  // in Moncton and in Auckland.
  var OPENS_AT = 6 * 60 + 12;          // 06:12, minutes past midnight
  var RUNS_FOR = 720;                  // through to the last westbound, then loops

  // No accent colours. The board is a monochrome CRT, which is what a regional
  // Canadian station actually had in the mid-nineties — colour panels came
  // later and came to the big airports first. A carrier is set apart by a
  // reversed cell, the only emphasis a character terminal had.
  var CARRIERS = {
    ANV: { name: 'Air Nova' },
    '9A': { name: 'Air Atlantic' },
    AC:  { name: 'Air Canada' },
    NW:  { name: 'Northwest Airlink' }
  };

  var EQUIP = {
    '146': 'BAe 146',
    DH1:   'Dash 8',
    DC9:   'DC-9',
    SWM:   'Metro'
  };

  // ── THE DEPARTURES ───────────────────────────────────────────────────
  //
  // `at`   minutes past midnight
  // `to`   the routing. More than one entry is a genuine multi-stop, not a
  //        decoration: Moncton–Saint John–Montreal really was one aeroplane
  //        serving two cities, and listing them as separate departures would
  //        double-count it.
  // `src`  where the flight NUMBER came from. See the header.
  var DEPARTURES = [
    {
      at: 6 * 60 + 30, no: '665', carrier: 'AC', eq: 'DC9', gate: '2', src: 'documented',
      to: [{ iata: 'YYZ', en: 'Toronto', fr: 'Toronto' }],
      // The night-stop returning, and the one row on this board taken from a
      // printed source rather than from memory: the 1991 OAG lists
      //   664  YYZ YQM YYG      Toronto - Moncton - Charlottetown
      //   665  YYG YQM YYZ      Charlottetown - Moncton - Toronto
      // The evening aeroplane goes out to the Island, night-stops, and works
      // back through Moncton at dawn. Recalled from hearing it overhead around
      // six, and then found in the guide.
      note: { en: 'Arrived from Charlottetown', fr: 'En provenance de Charlottetown' }
    },
    {
      at: 6 * 60 + 40, no: '8882', carrier: 'ANV', eq: '146', gate: '1', src: 'recalled',
      to: [{ iata: 'YUL', en: 'Montreal', fr: 'Montréal' }],
      // The 146 through-run. It arrives from Halifax and goes on to Montreal;
      // Moncton is the middle of its day, not the start.
      note: { en: 'Arrived from Halifax', fr: 'En provenance de Halifax' }
    },
    {
      at: 7 * 60 + 5, no: '873', carrier: 'ANV', eq: 'DH1', gate: '3', src: 'invented',
      to: [{ iata: 'YHZ', en: 'Halifax', fr: 'Halifax' }]
    },
    {
      at: 7 * 60 + 25, no: '431', carrier: '9A', eq: 'DH1', gate: '4', src: 'invented',
      // Air Atlantic served Halifax from Moncton and nothing else. Both
      // regionals flew it — Air Nova as the Air Canada Connector, Air
      // Atlantic as the Canadian Partner — so the same city twice under
      // different colours is correct, not a duplicate.
      to: [{ iata: 'YHZ', en: 'Halifax', fr: 'Halifax' }]
    },
    {
      at: 7 * 60 + 50, no: '2417', carrier: 'NW', eq: 'SWM', gate: '2', src: 'invented',
      to: [{ iata: 'BOS', en: 'Boston', fr: 'Boston' }],
      intl: true
    },
    {
      at: 8 * 60 + 15, no: '8884', carrier: 'ANV', eq: 'DH1', gate: '1', src: 'recalled',
      // The via-stop. One aeroplane, two cities, one row.
      to: [
        { iata: 'YSJ', en: 'Saint John', fr: 'Saint John' },
        { iata: 'YUL', en: 'Montreal', fr: 'Montréal' }
      ]
    },
    {
      at: 8 * 60 + 40, no: '877', carrier: 'ANV', eq: 'DH1', gate: '3', src: 'invented',
      to: [{ iata: 'YFC', en: 'Fredericton', fr: 'Fredericton' }]
    },
    {
      at: 9 * 60 + 30, no: '9012', carrier: 'ANV', eq: '146', gate: '4', src: 'invented',
      // Winter charter. Moncton–Orlando is about 1,300nm, at the edge of a
      // 146 with a full cabin: some days it went direct, some days it stopped
      // for fuel. Direct is rendered here because both are authentic and this
      // one cannot be wrong.
      to: [{ iata: 'MCO', en: 'Orlando', fr: 'Orlando' }],
      intl: true, charter: true
    },
    {
      // Midday Toronto. Number invented: the OAG's itineraries section lists
      // multi-stop flights only, so a Moncton-Toronto NONSTOP does not appear
      // in it and nothing documents this one.
      at: 12 * 60, no: '670', carrier: 'AC', eq: 'DC9', gate: '2', src: 'invented',
      to: [{ iata: 'YYZ', en: 'Toronto', fr: 'Toronto' }]
    },
    {
      // The evening aeroplane, and the other half of the night-stop: the 1991
      // OAG gives 664 as YYZ YQM YYG, so it arrives from Toronto and carries
      // on to Charlottetown rather than terminating here.
      //
      // 668 was on this board as a Moncton departure and that was wrong — the
      // guide lists it as YYZ YSJ YFC YYZ, Toronto to Saint John to
      // Fredericton and back. It never touches Moncton.
      at: 17 * 60, no: '664', carrier: 'AC', eq: 'DC9', gate: '2', src: 'documented',
      to: [{ iata: 'YYG', en: 'Charlottetown', fr: 'Charlottetown' }],
      note: { en: 'Continues to Charlottetown \u2014 night stop', fr: 'Poursuit vers Charlottetown' }
    }
  ];

  // ── LABELS ───────────────────────────────────────────────────────────
  // Two languages, English first. The station has no province to consult and
  // no frFirstAirport() to ask; the order is decided once, here.
  var L = {
    departures: { en: 'Departures', fr: 'Départs' },
    time:       { en: 'Time',        fr: 'Heure' },
    flight:     { en: 'Flight',      fr: 'Vol' },
    to:         { en: 'To',          fr: 'Destination' },
    gate:       { en: 'Gate',        fr: 'Porte' },
    status:     { en: 'Status',      fr: 'Statut' },
    aircraft:   { en: 'Aircraft',    fr: 'Appareil' },
    charter:    { en: 'Charter',     fr: 'Vol nolisé' }
  };

  var STATUS = {
    scheduled:  { en: 'Scheduled',   fr: 'Prévu' },
    checkin:    { en: 'Check-in',    fr: 'Enregistrement' },
    boarding:   { en: 'Boarding',    fr: 'Embarquement' },
    final:      { en: 'Final call',  fr: 'Dernier appel' },
    gateclosed: { en: 'Gate closed', fr: 'Porte fermée' },
    departed:   { en: 'Departed',    fr: 'Parti' }
  };

  // ── RENDER ───────────────────────────────────────────────────────────

  function pair(map) {
    return '<span class="hb-en">' + map.en + '</span>' +
           '<span class="hb-sep">|</span>' +
           '<span class="hb-fr">' + map.fr + '</span>';
  }

  function clock(mins) {
    var h = Math.floor(mins / 60) % 24, m = mins % 60;
    var ap = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }

  // A flight's state is a function of the board's own clock and nothing else.
  // No feed decides this and no timer can contradict it.
  function stateOf(dep, now) {
    var t = dep.at - now;
    if (t <= -5) return 'departed';
    if (t <= 0)  return 'gateclosed';
    if (t <= 10) return 'final';
    if (t <= 30) return 'boarding';
    if (t <= 75) return 'checkin';
    return 'scheduled';
  }

  function routeHtml(to) {
    return to.map(function (p, i) {
      return (i ? '<span class="hb-via">·</span>' : '') +
        '<span class="hb-city">' + p.en + '</span>' +
        '<span class="hb-iata">' + p.iata + '</span>';
    }).join('');
  }

  function rowHtml(dep, now) {
    var st = stateOf(dep, now);
    var car = CARRIERS[dep.carrier];
    return '' +
      '<tr class="hb-row hb-st-' + st + '">' +
        '<td class="hb-time">' + clock(dep.at) + '</td>' +
        '<td class="hb-flight">' +
          '<span class="hb-car">' + car.name + '</span>' +
          '<span class="hb-no">' + dep.no + '</span>' +
        '</td>' +
        '<td class="hb-to">' + routeHtml(dep.to) +
          (dep.charter ? '<span class="hb-tag">' + L.charter.en + '</span>' : '') +
          (dep.note ? '<span class="hb-note">' + dep.note.en + '</span>' : '') +
        '</td>' +
        '<td class="hb-eq">' + (EQUIP[dep.eq] || '') + '</td>' +
        '<td class="hb-gate">' + dep.gate + '</td>' +
        '<td class="hb-status">' +
          '<span class="hb-stlabel">' + STATUS[st].en + '</span>' +
          '<span class="hb-stfr">' + STATUS[st].fr + '</span>' +
        '</td>' +
      '</tr>';
  }

  function render(now) {
    var head = document.getElementById('hbHead');
    var body = document.getElementById('hbBody');
    var cl = document.getElementById('hbClock');
    if (cl) cl.textContent = clock(now);
    if (head) head.innerHTML = pair(L.departures);
    if (!body) return;
    body.innerHTML = DEPARTURES.map(function (d) { return rowHtml(d, now); }).join('');
  }

  // The clock advances a minute a second, then loops. It is animation, not
  // time: a frozen board reads as a crashed screen, and there is no feed here
  // to make anything move on its own.
  function start() {
    var tick = 0;
    render(OPENS_AT);
    setInterval(function () {
      tick = (tick + 1) % RUNS_FOR;
      render(OPENS_AT + tick);
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Exposed for the tests only. Nothing on the page reads these.
  if (typeof window !== 'undefined') {
    window.HERITAGE_BOARD = {
      STATION: STATION, CARRIERS: CARRIERS, EQUIP: EQUIP,
      DEPARTURES: DEPARTURES, STATUS: STATUS, L: L,
      stateOf: stateOf, clock: clock, OPENS_AT: OPENS_AT
    };
  }
})();
