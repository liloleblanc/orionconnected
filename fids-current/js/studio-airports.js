(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrionStudioAirports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const AIRPORTS = Object.freeze({
    yqm: Object.freeze({
      id: 'yqm',
      iata: 'YQM',
      name: 'Greater Moncton Roméo LeBlanc International Airport',
      timezone: 'America/Moncton',
      siteHost: 'yqm.orionconnected.com'
    })
  });

  function normalizeCode(value) {
    const code = String(value || '').trim().toLowerCase();
    return /^[a-z0-9]{3,4}$/.test(code) ? code : '';
  }

  function queryAirport(search) {
    try { return normalizeCode(new URLSearchParams(search || '').get('airport')); } catch (error) { return ''; }
  }

  function hostAirport(hostname) {
    const host = String(hostname || '').toLowerCase().split(':')[0];
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return '';
    if (!host.endsWith('.orionconnected.com')) return '';
    return normalizeCode(host.slice(0, -'.orionconnected.com'.length).split('.').pop());
  }

  function contextForCode(code) {
    const normalized = normalizeCode(code) || 'yqm';
    if (AIRPORTS[normalized]) return Object.assign({}, AIRPORTS[normalized]);
    return {
      id: normalized,
      iata: normalized.toUpperCase(),
      name: normalized.toUpperCase() + ' Airport',
      timezone: 'UTC',
      siteHost: normalized + '.orionconnected.com',
      provisional: true
    };
  }

  function resolve(hostname, search) {
    const host = String(hostname || '').toLowerCase().split(':')[0];
    const local = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const code = local ? queryAirport(search) || 'yqm' : hostAirport(host) || 'yqm';
    const airport = contextForCode(code);
    airport.source = local ? (queryAirport(search) ? 'local-query' : 'local-default') : (hostAirport(host) ? 'subdomain' : 'site-default');
    return airport;
  }

  return { AIRPORTS, normalizeCode, contextForCode, resolve };
});
