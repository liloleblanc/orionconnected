(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrionStudioData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PREVIEW_FLIGHTS = Object.freeze({
    departures: Object.freeze([
      { flight: 'AC 1983', airline: 'AC', city: 'Toronto', airport: 'YYZ', gate: '4', time: '5:30 AM', status: 'On time' },
      { flight: 'PD 2294', airline: 'PD', city: 'Toronto', airport: 'YTZ', gate: '3', time: '6:15 AM', status: 'On time' },
      { flight: 'AC 7753', airline: 'AC', city: 'Ottawa', airport: 'YOW', gate: '4', time: '7:10 AM', status: 'Boarding' },
      { flight: 'AC 7995', airline: 'AC', city: 'Montréal', airport: 'YUL', gate: '4', time: '11:05 AM', status: 'Delayed' },
      { flight: 'PB 923', airline: 'PB', city: 'Mont-Joli', airport: 'YYY', gate: '2', time: '11:25 AM', status: 'On time' }
    ]),
    arrivals: Object.freeze([
      { flight: 'AC 1983', airline: 'AC', city: 'Toronto', airport: 'YYZ', belt: '1', time: '9:08 PM', status: 'Arrived' }
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
    return String((hour % 12) || 12) + ':' + minute + ' ' + (hour >= 12 ? 'PM' : 'AM');
  }

  function readableStatus(value) {
    const status = String(value || '').replace(/[\s_-]+/g, '').toLowerCase();
    const labels = {
      scheduled: 'On time', expected: 'On time', active: 'En route', enroute: 'En route',
      boarding: 'Boarding', gateclosed: 'Gate closed', departed: 'Departed',
      arrived: 'Arrived', landed: 'Arrived', delayed: 'Delayed', cancelled: 'Cancelled',
      canceled: 'Cancelled', diverted: 'Diverted'
    };
    return labels[status] || String(value || 'Scheduled');
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
      async weather() { return { temperature: 22, unit: 'C', condition: 'Clear', icon: '../logos/weather/animated/clear-day.svg' }; },
      async checkin() { return { counters: ['01', '02', '03', '04'], airline: 'Air Canada', state: 'Open' }; },
      async baggage() { return { belt: '1', unloaded: 98, expected: 146, transfers: 12, priority: 4, health: 'Online' }; },
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

  function operationalReadOnlyAdapter(routerFetch, airport) {
    if (typeof routerFetch !== 'function') throw new Error('The airport flight router is unavailable.');
    const context = airport || {};
    let lastHealth = { ok: true, source: 'operational-read-only', fallback: false, checkedAt: null };
    return {
      id: 'operational-read-only',
      mode: 'read-only',
      async flights(direction) {
        const requestedDirection = direction === 'arrivals' ? 'arrivals' : 'departures';
        try {
          const data = await routerFetch(context.iata || '', requestedDirection === 'arrivals' ? 'Arrival' : 'Departure');
          const values = requestedDirection === 'arrivals' ? data && data.arrivals : data && data.departures;
          if (!Array.isArray(values)) throw new Error('The airport flight router returned an invalid response.');
          lastHealth = { ok: true, source: 'operational-read-only', fallback: false, count: values.length, checkedAt: new Date().toISOString() };
          return values.map(function (flight) { return normalizeOperationalFlight(flight, requestedDirection); });
        } catch (error) {
          lastHealth = { ok: false, source: 'operational-read-only', fallback: false, reason: error && error.message || 'Airport data unavailable.', checkedAt: new Date().toISOString() };
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
          reason: error && error.message || 'Airport data unavailable.',
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
        primary = operationalReadOnlyAdapter(settings.routerFetch, settings.airport);
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
    previewAdapter,
    legacyReadOnlyAdapter,
    operationalReadOnlyAdapter,
    fallbackAdapter,
    httpAdapter,
    choose
  };
});
