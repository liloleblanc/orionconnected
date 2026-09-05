'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Airports = require('../fids-current/js/studio-airports.js');
const Data = require('../fids-current/js/studio-data.js');
const Schema = require('../fids-current/js/studio-schema.js');

test('airport sites resolve from Orion subdomains', () => {
  const yqm = Airports.resolve('yqm.orionconnected.com', '');
  assert.equal(yqm.iata, 'YQM');
  assert.equal(yqm.siteHost, 'yqm.orionconnected.com');
  assert.equal(yqm.source, 'subdomain');

  const yhz = Airports.resolve('yhz.orionconnected.com', '');
  assert.equal(yhz.iata, 'YHZ');
  assert.equal(yhz.siteHost, 'yhz.orionconnected.com');
  assert.equal(yhz.provisional, true);
});

test('local development can preview a specific airport without changing production resolution', () => {
  assert.equal(Airports.resolve('127.0.0.1', '?airport=yhz').iata, 'YHZ');
  assert.equal(Airports.resolve('127.0.0.1', '').iata, 'YQM');
  assert.equal(Airports.resolve('example.com', '?airport=yhz').iata, 'YQM');
});

test('Studio storage is isolated by airport', () => {
  const yqm = Schema.airportStorageKey(Schema.DRAFT_KEY, { iata: 'YQM' });
  const yhz = Schema.airportStorageKey(Schema.DRAFT_KEY, { iata: 'YHZ' });
  assert.notEqual(yqm, yhz);
  assert.match(yqm, /:yqm$/);
  assert.match(yhz, /:yhz$/);
});

test('legacy data adapter is read-only and normalizes copies', async () => {
  const source = { flightsDep: [{ flight: 'AC123', destination: 'Toronto', gate: '4', status: 'Boarding' }] };
  const adapter = Data.legacyReadOnlyAdapter(source);
  const flights = await adapter.flights('departures');
  assert.equal(adapter.mode, 'read-only');
  assert.deepEqual(flights[0], { flight: 'AC123', airline: 'AC', city: 'Toronto', airport: '', gate: '4', belt: '', time: '', status: 'Boarding' });
  flights[0].status = 'Changed in Studio';
  assert.equal(source.flightsDep[0].status, 'Boarding');
});

test('airport HTTP adapter scopes every request to the airport code', async () => {
  const requests = [];
  const fakeFetch = async (url) => {
    requests.push(url);
    return { ok: true, async json() { return { flights: [] }; } };
  };
  const adapter = Data.httpAdapter(fakeFetch, { iata: 'YHZ' });
  await adapter.flights('arrivals');
  assert.equal(requests.length, 1);
  assert.match(requests[0], /airport=YHZ/);
  assert.match(requests[0], /direction=arrivals/);
});

test('Studio pilot mode is opt-in and ordinary links stay on preview data', () => {
  assert.equal(Data.runtimeMode(''), 'preview');
  assert.equal(Data.runtimeMode('?airport=yqm'), 'preview');
  assert.equal(Data.runtimeMode('?airport=yqm&data=pilot'), 'pilot');
  assert.equal(Data.runtimeMode('?pilot=1'), 'pilot');
});

test('operational pilot adapter reads the shared router without writing or reshaping its response', async () => {
  const raw = {
    departures: [{
      number: 'PD2294',
      status: 'boarding',
      departure: {
        airport: { iata: 'YQM', name: 'Moncton' },
        gate: '3',
        scheduledTime: { local: '2026-08-31 18:15:00-03:00' },
        airline: { iata: 'PD' }
      },
      arrival: { airport: { iata: 'YTZ', name: 'Toronto' }, airline: { iata: 'PD' } }
    }]
  };
  const calls = [];
  const adapter = Data.operationalReadOnlyAdapter(async (airport, direction) => {
    calls.push({ airport, direction });
    return raw;
  }, { iata: 'YQM' });
  const flights = await adapter.flights('departures');
  assert.deepEqual(calls, [{ airport: 'YQM', direction: 'Departure' }]);
  assert.deepEqual(flights[0], {
    flight: 'PD2294', airline: 'PD', city: 'Toronto', airport: 'YTZ',
    gate: '3', belt: '', time: '6:15 PM', status: 'Boarding'
  });
  assert.equal(raw.departures[0].status, 'boarding');
  assert.equal((await adapter.health()).source, 'operational-read-only');
});

test('pilot adapter falls back visibly to preview data when the read-only source is unavailable', async () => {
  const adapter = Data.choose({ mode: 'pilot', airport: { iata: 'YQM' } });
  const flights = await adapter.flights('departures');
  const health = await adapter.health();
  assert.equal(flights.length, Data.PREVIEW_FLIGHTS.departures.length);
  assert.equal(health.ok, false);
  assert.equal(health.fallback, true);
  assert.equal(health.source, 'preview');
  assert.equal(health.primarySource, 'operational-read-only');
});
