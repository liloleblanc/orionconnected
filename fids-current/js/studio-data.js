(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrionStudioData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // v23970 — statuses travel as these canonical English codes ('On time',
  // 'Boarding'…): the scene rules compare them, and studio-render.js turns
  // them into the screen's language (statusText) only when it draws them.
  // The preview flights, weather and times below are sample data.
  const PREVIEW_FLIGHTS = Object.freeze({
    departures: Object.freeze([
      { flight: 'AC 1983', airline: 'AC', city: 'Toronto', airport: 'YYZ', gate: '4', time: '5:30 AM', status: 'On time' }, // i18n-ok: data
      { flight: 'PD 2294', airline: 'PD', city: 'Toronto', airport: 'YTZ', gate: '3', time: '6:15 AM', status: 'On time' }, // i18n-ok: data
      { flight: 'AC 7753', airline: 'AC', city: 'Ottawa', airport: 'YOW', gate: '4', time: '7:10 AM', status: 'Boarding' }, // i18n-ok: data
      { flight: 'AC 7995', airline: 'AC', city: 'Montréal', airport: 'YUL', gate: '4', time: '11:05 AM', status: 'Delayed' }, // i18n-ok: data
      { flight: 'PB 923', airline: 'PB', city: 'Mont-Joli', airport: 'YYY', gate: '2', time: '11:25 AM', status: 'On time' } // i18n-ok: data
    ]),
    arrivals: Object.freeze([
      { flight: 'AC 1983', airline: 'AC', city: 'Toronto', airport: 'YYZ', belt: '1', time: '9:08 PM', status: 'Arrived' } // i18n-ok: data
    ])
  });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function runtimeMode(search) {
    try {
      const params = new URLSearchParams(search || '');
      return params.get('data') === 'pilot' || params.get('pilot') === '1' ? 'pilot' : 'preview';
    } catch (error) {
      return 'preview';
    }
  }

  function readableTime(value) {
    const match = String(value || '').match(/[T\s](\d{1,2}):(\d{2})/);
    if (!match) return String(value || '');
    const hour = Number(match[1]);
    const minute = match[2];
    if (!Number.isFinite(hour)) return String(value || '');
    return String((hour % 12) || 12) + ':' + minute + ' ' + (hour >= 12 ? 'PM' : 'AM'); // i18n-ok: code (studio-render reads it back as a 24-hour time)
  }

  function readableStatus(value) {
    const status = String(value || '').replace(/[\s_-]+/g, '').toLowerCase();
    const labels = {
      // v23968 — the airport's own neutral word, kept: "On Time" is On time,
      // "Expected" is Expected, and "Scheduled" or nothing is Scheduled. Both
      // used to read On time here, a claim the airport never made, and the
      // feed's own 'ontime' fell through to the raw code.
      ontime: 'On time', scheduled: 'Scheduled', expected: 'Expected', active: 'En route', enroute: 'En route', // i18n-ok: data
      // v23925 — the shared router passes a final call through as 'final'.
      boarding: 'Boarding', final: 'Final call', finalcall: 'Final call', gateclosed: 'Gate closed', departed: 'Departed', // i18n-ok: data
      arrived: 'Arrived', landed: 'Arrived', delayed: 'Delayed', cancelled: 'Cancelled', // i18n-ok: data
      canceled: 'Cancelled', diverted: 'Diverted' // i18n-ok: data
    };
    return labels[status] || String(value || 'Scheduled'); // i18n-ok: data
  }

  function normalizeFlight(value) {
    const flight = value || {};
    const destination = flight.destination || flight.dest || flight.city || flight.origin || '';
    return {
      flight: flight.flight || flight.number || flight.TRN || '',
      airline: flight.airline || flight.CXR || String(flight.flight || '').slice(0, 2),
      city: destination,
      airport: flight.airport || flight.code || flight.CTY || '',
      gate: flight.gate || flight.terminal || '',
      belt: flight.belt || flight.bags || '',
      time: flight.time || flight.sched || flight.scheduled || flight.stt || '',
      status: flight.status || flight.state || ''
    };
  }

  function normalizeOperationalFlight(value, direction) {
    const flight = value || {};
    const arrival = direction === 'arrivals';
    const movement = arrival ? (flight.arrival || {}) : (flight.departure || {});
    const other = arrival ? (flight.departure || {}) : (flight.arrival || {});
    const movementAirline = movement.airline || other.airline || {};
    const otherAirport = other.airport || {};
    const revised = movement.revisedTime || movement.predictedTime || movement.scheduledTime || {};
    return normalizeFlight({
      flight: flight.number || flight.flight || '',
      airline: movementAirline.iata || movementAirline.icao || '',
      destination: otherAirport.name || otherAirport.iata || '',
      airport: otherAirport.iata || '',
      gate: movement.gate || movement.terminal || '',
      belt: movement.baggageBelt || movement.baggageBeltName || movement.baggageClaim || '',
      time: readableTime(revised.local || revised.utc || revised),
      status: readableStatus(flight.status)
    });
  }

  function previewAdapter() {
    return {
      id: 'preview',
      mode: 'preview',
      async flights(direction) { return clone(direction === 'arrivals' ? PREVIEW_FLIGHTS.arrivals : PREVIEW_FLIGHTS.departures); },
      async weather() { return { temperature: 22, unit: 'C', condition: 'Clear', icon: '../logos/weather/animated/clear-day.svg' }; }, // i18n-ok: data
      async checkin() { return { counters: ['01', '02', '03', '04'], airline: 'Air Canada', state: 'Open' }; }, // i18n-ok: data
      async baggage() { return { belt: '1', unloaded: 98, expected: 146, transfers: 12, priority: 4, health: 'Online' }; }, // i18n-ok: data
      async health() { return { ok: true, source: 'preview', checkedAt: new Date().toISOString() }; }
    };
  }

  function legacyReadOnlyAdapter(browserWindow) {
    const source = browserWindow || {};
    return {
      id: 'legacy-read-only',
      mode: 'read-only',
      async flights(direction) {
        const values = direction === 'arrivals' ? source.flightsArr : source.flightsDep;
        return Array.isArray(values) ? values.map(normalizeFlight) : [];
      },
      async weather() { return clone(source.currentWeather || source.weatherData || null); },
      async checkin() { return null; },
      async baggage() { return null; },
      async health() { return { ok: true, source: 'legacy-read-only', checkedAt: new Date().toISOString() }; }
    };
  }

  // A ROW THE BOARDS AND THE PHONE APP KEEP OFF IS OFF THE LIVE LIST HERE TOO.
  // The standing rule: a flight no passenger looks for (cargo, courier,
  // private, positioning) is on no screen. The live list of the player and
  // of the editor mapped every row the router returned: on 2026-11-18 it held
  // G6 6175 and BBQ 2211A at Miami, the callsign rows and twenty rows of
  // cargo airlines among the arrivals of Chicago. It now asks what the phone
  // app asks (app.html adbToCard), of the same objects:
  //   - a codeshare duplicate (the operating flight has its own row);
  //   - the code list and the name words of the boards, which reach a page
  //     through js/shared-names.js (FIDS_SHARED_OFF_BOARD and
  //     FIDS_SHARED_OFF_BOARD_NAMES): the code at the top of the row, the
  //     carrier of the flight number, or the airline the feed named for it;
  //   - the row rule, fidsRowOffBoard of js/feed-router.js, the one function
  //     the boards and the app ask. Whether anybody names the airline of the
  //     row is read off the boards' table of names in the same file
  //     (FIDS_SHARED_AIRLINE) and the name the feed gives; a page without
  //     the table does not say, and the rule then takes no row off for that.
  // scope is the page (globalThis): a page that loaded neither file lists
  // its rows as before. tests/rows-off-board.test.js holds the three screens
  // to the same answer on the rows of that morning.
  function rowOffEveryScreen(flight, mode, home, list, scope) {
    const page = scope || {};
    const f = flight || {};
    if (String(f.codeshareStatus || '').toLowerCase() === 'iscodeshared') return true;
    const up = function (value) { return String(value == null ? '' : value).trim().toUpperCase(); };
    const number = up(f.number).replace(/\s+/g, '');
    const prefix = (number.match(/^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])(?=\d)/) || [])[0] || number.replace(/[0-9].*/, '');
    const top = f.airline || {};
    const leg = ((mode === 'arr' ? f.arrival : f.departure) || {}).airline || {};
    const legIata = up(leg.iata), legIcao = up(leg.icao);
    const ownLeg = !!prefix && (prefix === legIata || prefix === legIcao);
    let feedCode = up(top.iata), feedName = String(top.name || '').trim();
    if (!(feedCode && feedName) && ownLeg) { feedCode = feedCode || legIata || legIcao; feedName = feedName || String(leg.name || '').trim(); }
    const offCodes = Array.isArray(page.FIDS_SHARED_OFF_BOARD) ? page.FIDS_SHARED_OFF_BOARD : [];
    const offNames = Array.isArray(page.FIDS_SHARED_OFF_BOARD_NAMES) ? page.FIDS_SHARED_OFF_BOARD_NAMES : [];
    if ([up(top.iata), feedCode, prefix].some(function (code) { return code && offCodes.indexOf(code) >= 0; })) return true;
    const low = feedName.toLowerCase();
    if (low && offNames.some(function (word) { return low.indexOf(word) >= 0; })) return true;
    const names = page.FIDS_SHARED_AIRLINE;
    let named;
    if (names && typeof names === 'object') {
      const codes = [up(top.iata), feedCode, prefix];
      named = codes.some(function (code) { return code && !!names[code]; }) || (!!feedName && codes.indexOf(feedName.toUpperCase()) < 0);
    }
    return typeof page.fidsRowOffBoard === 'function' && !!page.fidsRowOffBoard(f, mode, home, named, list);
  }

  function operationalReadOnlyAdapter(routerFetch, airport, scope) {
    if (typeof routerFetch !== 'function') throw new Error('The airport flight router is unavailable.');
    const context = airport || {};
    const page = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
    let lastHealth = { ok: true, source: 'operational-read-only', fallback: false, checkedAt: null };
    return {
      id: 'operational-read-only',
      mode: 'read-only',
      async flights(direction) {
        const requestedDirection = direction === 'arrivals' ? 'arrivals' : 'departures';
        try {
          const data = await routerFetch(context.iata || '', requestedDirection === 'arrivals' ? 'Arrival' : 'Departure'); // i18n-ok: data
          const values = requestedDirection === 'arrivals' ? data && data.arrivals : data && data.departures;
          if (!Array.isArray(values)) throw new Error('The airport flight router returned an invalid response.');
          lastHealth = { ok: true, source: 'operational-read-only', fallback: false, count: values.length, checkedAt: new Date().toISOString() };
          const mode = requestedDirection === 'arrivals' ? 'arr' : 'dep';
          return values.filter(function (flight) { return !rowOffEveryScreen(flight, mode, context.iata || '', values, page); })
            .map(function (flight) { return normalizeOperationalFlight(flight, requestedDirection); });
        } catch (error) {
          lastHealth = { ok: false, source: 'operational-read-only', fallback: false, reason: error && error.message || 'Airport data unavailable.', checkedAt: new Date().toISOString() }; // i18n-ok: debug
          throw error;
        }
      },
      async weather() { return null; },
      async checkin() { return null; },
      async baggage() { return null; },
      async health() { return clone(lastHealth); }
    };
  }

  function fallbackAdapter(primary, fallback) {
    const backup = fallback || previewAdapter();
    let lastHealth = { ok: true, source: 'pilot-pending', fallback: false, checkedAt: null };
    async function request(method, args) {
      try {
        const value = await primary[method].apply(primary, args || []);
        const health = typeof primary.health === 'function' ? await primary.health() : {};
        lastHealth = Object.assign({ ok: true, source: primary.id, fallback: false, checkedAt: new Date().toISOString() }, health || {});
        return value;
      } catch (error) {
        const value = await backup[method].apply(backup, args || []);
        lastHealth = {
          ok: false,
          source: backup.id,
          primarySource: primary.id,
          fallback: true,
          reason: error && error.message || 'Airport data unavailable.', // i18n-ok: debug
          checkedAt: new Date().toISOString()
        };
        return value;
      }
    }
    return {
      id: 'pilot-read-only',
      mode: 'pilot',
      flights(direction) { return request('flights', [direction]); },
      weather() { return request('weather'); },
      checkin() { return request('checkin'); },
      baggage() { return request('baggage'); },
      async health() { return clone(lastHealth); }
    };
  }

  function httpAdapter(fetchFunction, airport, endpoints) {
    if (typeof fetchFunction !== 'function') throw new Error('A fetch function is required.');
    const context = airport || {};
    const routes = Object.assign({ flights: '/api/studio/flights', weather: '/api/studio/weather', checkin: '/api/studio/checkin', baggage: '/api/studio/baggage', health: '/api/studio/health' }, endpoints || {});
    async function request(route, params) {
      const query = new URLSearchParams(Object.assign({ airport: context.iata || '' }, params || {}));
      const response = await fetchFunction(route + '?' + query.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Studio data request failed with ' + response.status + '.');
      return response.json();
    }
    return {
      id: 'airport-http',
      mode: 'live',
      async flights(direction) { const data = await request(routes.flights, { direction: direction || 'departures' }); return (Array.isArray(data) ? data : data.flights || []).map(normalizeFlight); },
      async weather() { return request(routes.weather); },
      async checkin() { return request(routes.checkin); },
      async baggage() { return request(routes.baggage); },
      async health() { return request(routes.health); }
    };
  }

  function choose(options) {
    const settings = options || {};
    if (settings.mode === 'pilot') {
      let primary;
      try {
        primary = operationalReadOnlyAdapter(settings.routerFetch, settings.airport, settings.scope);
      } catch (error) {
        primary = {
          id: 'operational-read-only',
          async flights() { throw error; },
          async weather() { throw error; },
          async checkin() { throw error; },
          async baggage() { throw error; }
        };
      }
      return fallbackAdapter(primary, previewAdapter());
    }
    if (settings.mode === 'live' && settings.fetchFunction) return httpAdapter(settings.fetchFunction, settings.airport, settings.endpoints);
    if (settings.mode === 'legacy' && settings.browserWindow) return legacyReadOnlyAdapter(settings.browserWindow);
    return previewAdapter();
  }

  return {
    PREVIEW_FLIGHTS,
    runtimeMode,
    readableTime,
    readableStatus,
    normalizeFlight,
    normalizeOperationalFlight,
    rowOffEveryScreen,
    previewAdapter,
    legacyReadOnlyAdapter,
    operationalReadOnlyAdapter,
    fallbackAdapter,
    httpAdapter,
    choose
  };
});
