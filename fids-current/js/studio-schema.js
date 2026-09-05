(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrionStudioSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'orion_studio_documents:v1';
  const DRAFT_KEY = 'orion_studio_active_draft:v1';

  const DEFAULT_AIRPORT = Object.freeze({
    id: 'yqm',
    iata: 'YQM',
    name: 'Greater Moncton Roméo LeBlanc International Airport',
    timezone: 'America/Moncton',
    siteHost: 'yqm.orionconnected.com'
  });

  const DISPLAY_FAMILIES = Object.freeze({
    fids: { label: 'FIDS', description: 'Flight information displays', format: '1920 × 1080' },
    gids: { label: 'GIDS', description: 'Gate information displays', format: '1920 × 1080' },
    bids: { label: 'BIDS', description: 'Baggage information displays', format: '1920 × 1080' },
    checkin: { label: 'Check-in', description: 'Counter and common-use displays', format: '1920 × 1080' },
    baggage: { label: 'Baggage Ops', description: 'Ramp and reclaim operations', format: '2560 × 1080' }
  });

  const LANGUAGES = Object.freeze([
    { code: 'en', label: 'English', direction: 'ltr' },
    { code: 'fr', label: 'Français', direction: 'ltr' },
    { code: 'ar', label: 'العربية', direction: 'rtl' },
    { code: 'es', label: 'Español', direction: 'ltr' },
    { code: 'de', label: 'Deutsch', direction: 'ltr' },
    { code: 'it', label: 'Italiano', direction: 'ltr' },
    { code: 'pt', label: 'Português', direction: 'ltr' },
    { code: 'zh', label: '中文', direction: 'ltr' },
    { code: 'ja', label: '日本語', direction: 'ltr' }
  ]);

  const MODULE_REGISTRY = Object.freeze({
    fids: [
      { type: 'airport-header', label: 'Airport header', description: 'Logo, title and clock', keepSafe: false, layout: { x: 0, y: 0, w: 100, h: 20 } },
      { type: 'flight-table', label: 'Departures table', description: 'Live flight rows', legacyType: 'flightList', layout: { x: 2, y: 23, w: 63, h: 64 } },
      { type: 'advertisement', label: 'Advertisement zone', description: 'Campaign playlist', legacyType: 'ad', layout: { x: 67.5, y: 23, w: 30.5, h: 64 } },
      { type: 'weather', label: 'Destination weather', description: 'Live conditions and outlook', keepSafe: false, layout: { x: 0, y: 90, w: 100, h: 10 } }
    ],
    gids: [
      { type: 'airport-header', label: 'Airport header', description: 'Logo, title and clock', keepSafe: false, layout: { x: 0, y: 0, w: 100, h: 20 } },
      { type: 'gate-flight', label: 'Gate flight', description: 'Assigned flight and gate', layout: { x: 2, y: 23, w: 63, h: 64 } },
      { type: 'destination-weather', label: 'Arrival weather', description: 'Destination conditions', layout: { x: 67.5, y: 23, w: 30.5, h: 64 } },
      { type: 'boarding-state', label: 'Boarding state', description: 'Operational takeover states', legacyType: 'message', keepSafe: false, layout: { x: 0, y: 90, w: 100, h: 10 } },
      { type: 'advertisement', label: 'Advertisement zone', description: 'Campaign playlist', legacyType: 'ad', defaultEnabled: false, layout: { x: 67.5, y: 23, w: 30.5, h: 40 } }
    ],
    bids: [
      { type: 'airport-header', label: 'Airport header', description: 'Logo, title and clock', keepSafe: false, layout: { x: 0, y: 0, w: 100, h: 20 } },
      { type: 'claim-table', label: 'Claim table', description: 'Arrivals and belt assignments', legacyType: 'flightList', layout: { x: 2, y: 23, w: 63, h: 64 } },
      { type: 'belt-hero', label: 'Belt hero', description: 'Featured flight and belt', layout: { x: 67.5, y: 23, w: 30.5, h: 64 } },
      { type: 'oversize-message', label: 'Oversize message', description: 'Passenger direction', legacyType: 'message', keepSafe: false, layout: { x: 0, y: 90, w: 100, h: 10 } }
    ],
    checkin: [
      { type: 'airline-brand', label: 'Airline brand', description: 'Logo, colours and typography', keepSafe: false, layout: { x: 0, y: 0, w: 100, h: 20 } },
      { type: 'flight-assignment', label: 'Flight assignment', description: 'DCS / AODB binding', layout: { x: 2, y: 24, w: 96, h: 22 } },
      { type: 'counter-status', label: 'Counter status', description: 'Open, closed, priority and bag drop', layout: { x: 2, y: 50, w: 96, h: 26 } },
      { type: 'queue-guidance', label: 'Queue guidance', description: 'Wait time and lane direction', layout: { x: 2, y: 80, w: 58, h: 16 } },
      { type: 'passenger-message', label: 'Passenger message', description: 'Nine languages and RTL', legacyType: 'message', layout: { x: 62, y: 80, w: 36, h: 16 } }
    ],
    baggage: [
      { type: 'airport-header', label: 'Airport header', description: 'Logo, title and clock', keepSafe: false, layout: { x: 0, y: 0, w: 100, h: 18 } },
      { type: 'ramp-milestones', label: 'Ramp milestones', description: 'Unload and delivery progress', layout: { x: 2, y: 21, w: 44, h: 68 } },
      { type: 'transfer-bags', label: 'Transfer bags', description: 'Connections and priority bags', layout: { x: 48, y: 21, w: 24, h: 32 } },
      { type: 'belt-health', label: 'Belt health', description: 'BHS, BSM and PLC status', layout: { x: 48, y: 57, w: 24, h: 32 } },
      { type: 'passenger-preview', label: 'Passenger preview', description: 'Linked BIDS output', layout: { x: 74, y: 21, w: 24, h: 68 } }
    ]
  });

  const FALLBACK_LAYOUT = Object.freeze({ x: 30, y: 30, w: 40, h: 30 });

  const BUILDING_BLOCKS = Object.freeze([
    { type: 'text', label: 'Text', description: 'Words on screen, with live tokens', legacyType: 'message', layout: { x: 6, y: 42, w: 34, h: 12 } },
    { type: 'box', label: 'Box', description: 'Colour block, band or angled shape', layout: { x: 6, y: 28, w: 22, h: 22 } },
    { type: 'image', label: 'Image', description: 'Artwork from the asset library', layout: { x: 62, y: 28, w: 26, h: 30 } },
    { type: 'clock', label: 'Clock', description: 'Airport local time', layout: { x: 68, y: 6, w: 26, h: 14 } }
  ]);

  function blockDefinition(type) {
    return BUILDING_BLOCKS.find(function (item) { return item.type === type; }) || null;
  }

  const SCENE_RULE_CONDITIONS = Object.freeze([
    { id: 'any-boarding', label: 'Any flight is boarding' },
    { id: 'any-delayed', label: 'Any flight is delayed' },
    { id: 'any-cancelled', label: 'Any flight is cancelled' },
    { id: 'no-flights', label: 'No scheduled flights' },
    { id: 'arrivals-active', label: 'Arrivals on the board' }
  ]);

  const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

  function id(prefix) {
    return (prefix || 'studio') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function modulesFor(family) {
    return clone(MODULE_REGISTRY[family] || MODULE_REGISTRY.fids);
  }

  function moduleLayoutDefaults(family, type) {
    const registry = MODULE_REGISTRY[family] || [];
    const definition = registry.find(function (item) { return item.type === type; }) || blockDefinition(type);
    return clone(definition && definition.layout || FALLBACK_LAYOUT);
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(number * 100) / 100));
  }

  function normalizeLayout(value, family, type) {
    const defaults = moduleLayoutDefaults(family, type);
    const source = value && typeof value === 'object' ? value : {};
    const layout = {
      x: clampNumber(source.x, 0, 96, defaults.x),
      y: clampNumber(source.y, 0, 96, defaults.y),
      w: clampNumber(source.w, 4, 100, defaults.w),
      h: clampNumber(source.h, 4, 100, defaults.h)
    };
    layout.w = Math.min(layout.w, 100 - layout.x);
    layout.h = Math.min(layout.h, 100 - layout.y);
    return layout;
  }

  function normalizeModule(value, family, index) {
    const source = value && typeof value === 'object' ? value : {};
    const type = typeof source.type === 'string' && source.type ? source.type : 'text';
    return {
      id: typeof source.id === 'string' && source.id ? source.id : id('module'),
      type: type,
      enabled: source.enabled !== false,
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : index,
      props: source.props && typeof source.props === 'object' ? clone(source.props) : {},
      layout: normalizeLayout(source.layout, family, type)
    };
  }

  function normalizeSceneRule(value, sceneId) {
    const source = value && typeof value === 'object' ? value : null;
    if (source && source.kind === 'data' && SCENE_RULE_CONDITIONS.some(function (item) { return item.id === source.condition; })) {
      return { kind: 'data', condition: source.condition };
    }
    if (source && source.kind === 'time') {
      return {
        kind: 'time',
        from: TIME_PATTERN.test(source.from || '') ? source.from : '22:00',
        to: TIME_PATTERN.test(source.to || '') ? source.to : '05:00'
      };
    }
    if (!source) {
      if (sceneId === 'highlight') return { kind: 'data', condition: 'any-boarding' };
      if (sceneId === 'delay') return { kind: 'data', condition: 'any-delayed' };
    }
    return { kind: 'none' };
  }

  function normalizeSceneOverrides(value) {
    const source = value && typeof value === 'object' ? value : {};
    const overrides = {};
    Object.keys(source).forEach(function (moduleId) {
      const entry = source[moduleId];
      if (!entry || typeof entry !== 'object') return;
      const result = {};
      if (typeof entry.enabled === 'boolean') result.enabled = entry.enabled;
      if (entry.layout && typeof entry.layout === 'object') {
        const numbers = ['x', 'y', 'w', 'h'].map(function (key) { return Number(entry.layout[key]); });
        if (numbers.every(function (number) { return Number.isFinite(number); })) {
          result.layout = {
            x: Math.min(96, Math.max(0, Math.round(numbers[0] * 100) / 100)),
            y: Math.min(96, Math.max(0, Math.round(numbers[1] * 100) / 100)),
            w: Math.min(100, Math.max(4, Math.round(numbers[2] * 100) / 100)),
            h: Math.min(100, Math.max(4, Math.round(numbers[3] * 100) / 100))
          };
        }
      }
      if (entry.props && typeof entry.props === 'object') result.props = clone(entry.props);
      if (Object.keys(result).length) overrides[moduleId] = result;
    });
    return overrides;
  }

  function normalizeFlightRow(value) {
    const source = value && typeof value === 'object' ? value : {};
    const text = function (v, cap) { return String(v == null ? '' : v).slice(0, cap || 40); };
    return {
      flight: text(source.flight, 12),
      city: text(source.city || source.destination, 40),
      gate: text(source.gate || source.belt, 6),
      time: text(source.time, 12),
      status: text(source.status || 'On time', 16)
    };
  }

  function normalizeDocumentData(value) {
    const source = value && typeof value === 'object' ? value : {};
    const flights = Array.isArray(source.flights) ? source.flights.slice(0, 40).map(normalizeFlightRow) : [];
    return { flights: flights };
  }

  function normalizeScene(value, index) {
    const source = value && typeof value === 'object' ? value : {};
    const sceneId = typeof source.id === 'string' && source.id ? source.id : 'scene_' + index;
    return {
      id: sceneId,
      label: typeof source.label === 'string' && source.label ? source.label : sceneId,
      priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : 50,
      rule: normalizeSceneRule(source.rule, sceneId),
      overrides: normalizeSceneOverrides(source.overrides)
    };
  }

  function airportStorageKey(baseKey, airport) {
    const raw = airport && (airport.id || airport.iata) || DEFAULT_AIRPORT.id;
    const code = String(raw).toLowerCase().replace(/[^a-z0-9_-]/g, '') || DEFAULT_AIRPORT.id;
    return baseKey + ':' + code;
  }

  function newDocument(options) {
    const input = options || {};
    const family = DISPLAY_FAMILIES[input.family] ? input.family : 'fids';
    const airport = Object.assign({}, DEFAULT_AIRPORT, input.airport || {});
    airport.id = String(airport.id || airport.iata || 'airport').toLowerCase();
    airport.iata = String(airport.iata || '').toUpperCase();
    return {
      schema: 'orion.airport-display-studio',
      schemaVersion: SCHEMA_VERSION,
      id: input.id || id('display'),
      name: input.name || 'YQM Departures · Master',
      family,
      airport,
      deployment: { siteMode: 'airport-subdomain', host: airport.siteHost, displayGroupIds: [] },
      status: 'draft',
      canvas: { width: family === 'baggage' ? 2560 : 1920, height: 1080, safeArea: true },
      brand: { kitId: 'yqm-default', logo: '', fontFamily: 'SF Pro', colors: { background: '#06101f', surface: '#0c1b2d', accent: '#fbbf24', text: '#f8fafc' } },
      languages: { enabled: LANGUAGES.map(function (language) { return language.code; }), primary: 'en', rotationSeconds: 12, fallback: 'en' },
      scenes: [
        { id: 'default', label: 'Default', priority: 10 },
        { id: 'highlight', label: 'Operational highlight', priority: 20 },
        { id: 'delay', label: 'Delay emphasis', priority: 30 },
        { id: 'emergency', label: 'Emergency override', priority: 100 }
      ].map(normalizeScene),
      data: { flights: [] },
      modules: input.blank ? [] : modulesFor(family).map(function (module, index) {
        return { id: id('module'), type: module.type, enabled: module.defaultEnabled !== false, order: index, props: {}, layout: normalizeLayout(module.layout, family, module.type) };
      }),
      compatibility: { legacyFallback: true, legacyTemplateId: null, minimumPlayerBuild: 'v23190' },
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeDocument(value) {
    const source = value && typeof value === 'object' ? clone(value) : {};
    const base = newDocument({ id: source.id, name: source.name, family: source.family });
    const merged = Object.assign(base, source);
    merged.schema = 'orion.airport-display-studio';
    merged.schemaVersion = SCHEMA_VERSION;
    merged.family = DISPLAY_FAMILIES[merged.family] ? merged.family : 'fids';
    merged.airport = Object.assign({}, DEFAULT_AIRPORT, source.airport || {});
    merged.airport.id = String(merged.airport.id || merged.airport.iata || 'airport').toLowerCase();
    merged.airport.iata = String(merged.airport.iata || '').toUpperCase();
    merged.deployment = Object.assign({ siteMode: 'airport-subdomain', host: merged.airport.siteHost, displayGroupIds: [] }, source.deployment || {});
    merged.canvas = Object.assign(base.canvas, source.canvas || {});
    merged.brand = Object.assign(base.brand, source.brand || {});
    merged.brand.colors = Object.assign(base.brand.colors, source.brand && source.brand.colors || {});
    merged.languages = Object.assign(base.languages, source.languages || {});
    merged.languages.enabled = (merged.languages.enabled || []).filter(function (code, index, all) {
      return LANGUAGES.some(function (language) { return language.code === code; }) && all.indexOf(code) === index;
    });
    if (!merged.languages.enabled.length) merged.languages.enabled = ['en'];
    merged.modules = (Array.isArray(source.modules) ? source.modules : base.modules).map(function (module, index) {
      return normalizeModule(module, merged.family, index);
    });
    merged.data = normalizeDocumentData(source.data);
    merged.scenes = (Array.isArray(source.scenes) && source.scenes.length ? source.scenes : base.scenes).map(normalizeScene);
    if (!merged.scenes.some(function (scene) { return scene.id === 'default'; })) {
      merged.scenes.unshift(normalizeScene({ id: 'default', label: 'Default', priority: 10 }, 0));
    }
    merged.compatibility = Object.assign(base.compatibility, source.compatibility || {});
    merged.updatedAt = new Date().toISOString();
    return merged;
  }

  function validateDocument(value) {
    const errors = [];
    if (!value || typeof value !== 'object') return { valid: false, errors: ['Document must be an object.'] };
    if (value.schema !== 'orion.airport-display-studio') errors.push('Unsupported Studio schema.');
    if (value.schemaVersion !== SCHEMA_VERSION) errors.push('Unsupported Studio schema version.');
    if (!DISPLAY_FAMILIES[value.family]) errors.push('Unknown display family.');
    if (!value.name || typeof value.name !== 'string') errors.push('Display name is required.');
    if (!value.airport || !/^[A-Z0-9]{3,4}$/.test(value.airport.iata || '')) errors.push('A valid airport code is required.');
    if (!Array.isArray(value.modules)) errors.push('Modules must be an array.');
    else value.modules.forEach(function (module, index) {
      const layout = module && module.layout;
      const numbers = layout && ['x', 'y', 'w', 'h'].every(function (key) { return Number.isFinite(Number(layout[key])); });
      if (!numbers) errors.push('Module ' + (index + 1) + ' needs a numeric layout.');
    });
    if (!value.languages || !Array.isArray(value.languages.enabled)) errors.push('Enabled languages are required.');
    return { valid: errors.length === 0, errors: errors };
  }

  return {
    SCHEMA_VERSION,
    STORAGE_KEY,
    DRAFT_KEY,
    DEFAULT_AIRPORT,
    DISPLAY_FAMILIES,
    LANGUAGES,
    MODULE_REGISTRY,
    BUILDING_BLOCKS,
    normalizeFlightRow,
    blockDefinition,
    SCENE_RULE_CONDITIONS,
    modulesFor,
    moduleLayoutDefaults,
    normalizeLayout,
    normalizeModule,
    normalizeScene,
    airportStorageKey,
    newDocument,
    normalizeDocument,
    validateDocument
  };
});
