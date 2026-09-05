(function (root, factory) {
  const schema = root && root.OrionStudioSchema || (typeof require === 'function' ? require('./studio-schema.js') : null);
  const api = factory(schema);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrionStudioCompat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Schema) {
  'use strict';

  const LEGACY_TEMPLATE_KEY = 'fids_templates';
  const LEGACY_ASSIGN_PREFIX = 'fids_template_assigned:';
  const LEGACY_FAMILIES = Object.freeze({ fids: 'fids', gids: 'gids', bids: 'bids' });

  function legacyId(document) {
    return 'studio_' + String(document.id || 'display').replace(/[^a-z0-9_-]/gi, '_');
  }

  function legacyComponent(module, index, family, canvas) {
    const registry = Schema && Schema.MODULE_REGISTRY[family] || [];
    const definition = registry.find(function (item) { return item.type === module.type; }) ||
      (Schema && typeof Schema.blockDefinition === 'function' ? Schema.blockDefinition(module.type) : null);
    if (!definition || !definition.legacyType) return null;
    const layout = module.layout || definition.layout || { x: 3, y: 14, w: 94, h: 16 };
    const width = canvas && canvas.width || 1920;
    const height = canvas && canvas.height || 1080;
    const base = {
      id: 'studio_component_' + index,
      type: definition.legacyType,
      x: Math.round(layout.x / 100 * width),
      y: Math.round(layout.y / 100 * height),
      w: Math.round(layout.w / 100 * width),
      h: Math.round(layout.h / 100 * height),
      props: {}
    };
    if (definition.legacyType === 'flightList') {
      base.props = { source: family === 'bids' ? 'arr' : 'dep', maxRows: Number(module.props && module.props.maxRows) || 12, cols: { logo: true, flight: true, destination: true, time: true, status: true, gate: true, airline: false }, bg: 'rgba(15,23,42,.72)', accent: '#3b82f6' };
    } else if (definition.legacyType === 'ad') {
      base.props = { items: [{ type: 'text', text: module.props && module.props.headline || 'Advertisement zone', bg: '#fbbf24', color: '#07111f' }], interval: 10, fontSize: 48, weight: 700 };
    } else if (definition.legacyType === 'message') {
      base.props = { title: module.props && module.props.title || definition.label, body: module.props && (module.props.body || module.props.text) || definition.description, bg: '#0f2d4c', accent: '#fbbf24', titleColor: '#ffffff', bodyColor: '#cbd5e1', titleSize: 42, bodySize: 24, icon: '' };
    }
    return base;
  }

  function toLegacyTemplate(value) {
    if (!Schema) throw new Error('Studio schema is required.');
    const document = Schema.normalizeDocument(value);
    const validation = Schema.validateDocument(document);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    if (!LEGACY_FAMILIES[document.family]) {
      return { supported: false, reason: 'The legacy renderer does not support ' + document.family + '.', template: null };
    }
    const components = document.modules.filter(function (module) { return module.enabled !== false; }).map(function (module, index) {
      return legacyComponent(module, index, document.family, document.canvas);
    }).filter(Boolean);
    return {
      supported: true,
      reason: '',
      template: {
        id: legacyId(document),
        name: document.name,
        canvas: { w: document.canvas.width, h: document.canvas.height },
        background: { color: document.brand.colors.background, image: '', fit: 'cover' },
        components: components,
        studioSource: { id: document.id, schemaVersion: document.schemaVersion }
      }
    };
  }

  function installLegacyTemplate(storage, value, options) {
    const settings = options || {};
    if (!settings.confirmed) throw new Error('Legacy installation requires explicit confirmation.');
    const converted = toLegacyTemplate(value);
    if (!converted.supported) throw new Error(converted.reason);
    const target = storage || localStorage;
    let templates = {};
    try { templates = JSON.parse(target.getItem(LEGACY_TEMPLATE_KEY) || '{}') || {}; } catch (error) { templates = {}; }
    templates[converted.template.id] = converted.template;
    target.setItem(LEGACY_TEMPLATE_KEY, JSON.stringify(templates));
    if (settings.assign === true) target.setItem(LEGACY_ASSIGN_PREFIX + value.family, converted.template.id);
    return converted.template;
  }

  return { LEGACY_TEMPLATE_KEY, LEGACY_ASSIGN_PREFIX, LEGACY_FAMILIES, toLegacyTemplate, installLegacyTemplate };
});
