'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../fids-current/js/studio-schema.js');
const Compat = require('../fids-current/js/studio-compat.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('Studio documents start separately with all display families and nine languages', () => {
  const document = Schema.newDocument({ family: 'fids' });
  assert.equal(document.schema, 'orion.airport-display-studio');
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.airport.iata, 'YQM');
  assert.equal(document.deployment.host, 'yqm.orionconnected.com');
  assert.equal(Object.keys(Schema.DISPLAY_FAMILIES).length, 5);
  assert.deepEqual(document.languages.enabled, ['en', 'fr', 'ar', 'es', 'de', 'it', 'pt', 'zh', 'ja']);
  assert.equal(document.compatibility.legacyFallback, true);
  assert.ok(document.modules.some((module) => module.type === 'weather'));
  assert.ok(document.modules.some((module) => module.type === 'advertisement'));
  assert.equal(Schema.validateDocument(document).valid, true);
});

test('Studio documents support independent airport subdomain sites without code forks', () => {
  const document = Schema.newDocument({
    family: 'gids',
    name: 'YHZ Gate 20',
    airport: {
      id: 'yhz',
      iata: 'yhz',
      name: 'Halifax Stanfield International Airport',
      timezone: 'America/Halifax',
      siteHost: 'yhz.orionconnected.com'
    }
  });
  assert.equal(document.airport.iata, 'YHZ');
  assert.equal(document.airport.siteHost, 'yhz.orionconnected.com');
  assert.equal(document.deployment.host, 'yhz.orionconnected.com');
  assert.equal(Schema.validateDocument(document).valid, true);
});

test('normalization rejects unknown families and unsupported language codes safely', () => {
  const document = Schema.normalizeDocument({
    schema: 'old-value',
    schemaVersion: 99,
    family: 'unknown',
    name: 'Recovered draft',
    languages: { enabled: ['fr', 'xx', 'fr'] }
  });
  assert.equal(document.family, 'fids');
  assert.equal(document.schemaVersion, 1);
  assert.deepEqual(document.languages.enabled, ['fr']);
  assert.equal(Schema.validateDocument(document).valid, true);
});

test('legacy conversion supports existing boards without assigning them', () => {
  const storage = memoryStorage();
  const document = Schema.newDocument({ family: 'fids', name: 'Studio FIDS' });
  const converted = Compat.toLegacyTemplate(document);
  assert.equal(converted.supported, true);
  assert.ok(converted.template.components.some((component) => component.type === 'flightList'));
  assert.equal(storage.getItem(Compat.LEGACY_TEMPLATE_KEY), null);
  assert.throws(() => Compat.installLegacyTemplate(storage, document), /explicit confirmation/);
  const installed = Compat.installLegacyTemplate(storage, document, { confirmed: true, assign: false });
  assert.equal(JSON.parse(storage.getItem(Compat.LEGACY_TEMPLATE_KEY))[installed.id].name, 'Studio FIDS');
  assert.equal(storage.getItem(Compat.LEGACY_ASSIGN_PREFIX + 'fids'), null);
});

test('new Check-in and Baggage Ops families cannot be pushed into the legacy renderer', () => {
  for (const family of ['checkin', 'baggage']) {
    const converted = Compat.toLegacyTemplate(Schema.newDocument({ family }));
    assert.equal(converted.supported, false);
    assert.equal(converted.template, null);
  }
});

test('every module starts with a designable layout inside the canvas', () => {
  for (const family of Object.keys(Schema.DISPLAY_FAMILIES)) {
    const document = Schema.newDocument({ family });
    for (const module of document.modules) {
      for (const key of ['x', 'y', 'w', 'h']) {
        assert.ok(Number.isFinite(module.layout[key]), family + '/' + module.type + ' layout.' + key);
      }
      assert.ok(module.layout.x + module.layout.w <= 100.01);
      assert.ok(module.layout.y + module.layout.h <= 100.01);
    }
    assert.equal(Schema.validateDocument(document).valid, true);
  }
});

test('normalization migrates saved drafts that predate module layouts', () => {
  const document = Schema.normalizeDocument({
    family: 'fids',
    name: 'Pre-layout draft',
    modules: [
      { id: 'legacy_1', type: 'flight-table', enabled: true, order: 0, props: {} },
      { id: 'legacy_2', type: 'advertisement', enabled: true, order: 1, props: {}, layout: { x: 900, y: -20, w: 1, h: 'tall' } }
    ]
  });
  const table = document.modules.find((module) => module.id === 'legacy_1');
  assert.deepEqual(table.layout, Schema.moduleLayoutDefaults('fids', 'flight-table'));
  const advertisement = document.modules.find((module) => module.id === 'legacy_2');
  assert.ok(advertisement.layout.x <= 96);
  assert.ok(advertisement.layout.y >= 0);
  assert.ok(advertisement.layout.w >= 4);
  assert.equal(advertisement.layout.h, Schema.moduleLayoutDefaults('fids', 'advertisement').h);
  assert.equal(Schema.validateDocument(document).valid, true);
});

test('building blocks are family-agnostic and a blank document starts empty', () => {
  assert.deepEqual(Schema.BUILDING_BLOCKS.map((block) => block.type), ['text', 'box', 'image', 'clock']);
  assert.deepEqual(Schema.moduleLayoutDefaults('fids', 'text'), Schema.blockDefinition('text').layout);
  const blank = Schema.newDocument({ family: 'fids', blank: true, name: 'Blank' });
  assert.equal(blank.modules.length, 0);
  assert.equal(Schema.validateDocument(blank).valid, true);
  const withBlock = Schema.normalizeDocument({ family: 'fids', name: 'x', modules: [{ id: 'b1', type: 'box' }] });
  assert.deepEqual(withBlock.modules[0].layout, Schema.blockDefinition('box').layout);
});

test('a text block converts to a legacy message carrying its words', () => {
  const document = Schema.newDocument({ family: 'fids', blank: true, name: 'Text only' });
  document.modules.push(Schema.normalizeModule({ type: 'text', props: { text: 'Gate change: see agents' } }, 'fids', 0));
  document.modules.push(Schema.normalizeModule({ type: 'box', props: { fill: '#123456' } }, 'fids', 1));
  const converted = Compat.toLegacyTemplate(document);
  assert.equal(converted.supported, true);
  const message = converted.template.components.find((item) => item.type === 'message');
  assert.equal(message.props.body, 'Gate change: see agents');
  assert.ok(!converted.template.components.some((item) => item.type === 'box'));
});

test('a document carries its own editable flight list, normalized and capped', () => {
  const document = Schema.normalizeDocument({ family: 'fids', name: 'x', data: { flights: [
    { flight: 'AC 1983', city: 'Toronto', gate: '4', time: '5:30 AM', status: 'On time' },
    { flight: 12345, city: null, gate: 'A1B2C3DDD', time: '', status: undefined }
  ] } });
  assert.equal(document.data.flights.length, 2);
  assert.equal(document.data.flights[0].city, 'Toronto');
  assert.equal(document.data.flights[1].flight, '12345');
  assert.equal(document.data.flights[1].gate, 'A1B2C3');
  assert.equal(document.data.flights[1].status, 'On time');
  const overflow = Schema.normalizeDocument({ family: 'fids', name: 'x', data: { flights: new Array(80).fill({ flight: 'AC 1' }) } });
  assert.equal(overflow.data.flights.length, 40);
});

test('full-bleed chrome opts out of the safe-area clamp by definition', () => {
  for (const [family, type] of [['fids', 'airport-header'], ['fids', 'weather'], ['gids', 'boarding-state'], ['bids', 'oversize-message'], ['checkin', 'airline-brand']]) {
    const definition = Schema.MODULE_REGISTRY[family].find((item) => item.type === type);
    assert.equal(definition.keepSafe, false, family + '/' + type);
  }
  const table = Schema.MODULE_REGISTRY.fids.find((item) => item.type === 'flight-table');
  assert.notEqual(table.keepSafe, false);
});

test('validation names the module when a layout is broken', () => {
  const document = Schema.newDocument({ family: 'fids' });
  document.modules[1].layout = { x: 'left', y: 0, w: 50, h: 50 };
  const result = Schema.validateDocument(document);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /Module 2 needs a numeric layout/);
});

test('legacy conversion carries the designed geometry onto the 1920×1080 canvas', () => {
  const document = Schema.newDocument({ family: 'fids', name: 'Layout carry' });
  const table = document.modules.find((module) => module.type === 'flight-table');
  table.layout = { x: 10, y: 20, w: 50, h: 60 };
  table.props.maxRows = 7;
  const converted = Compat.toLegacyTemplate(document);
  assert.equal(converted.supported, true);
  const component = converted.template.components.find((item) => item.type === 'flightList');
  assert.equal(component.x, 192);
  assert.equal(component.y, 216);
  assert.equal(component.w, 960);
  assert.equal(component.h, 648);
  assert.equal(component.props.maxRows, 7);
});

test('built-in states carry seeded rules; drafts without rules pick them up on normalize', () => {
  const fresh = Schema.newDocument({ family: 'fids' });
  assert.deepEqual(fresh.scenes.find((scene) => scene.id === 'delay').rule, { kind: 'data', condition: 'any-delayed' });
  assert.deepEqual(fresh.scenes.find((scene) => scene.id === 'highlight').rule, { kind: 'data', condition: 'any-boarding' });
  assert.deepEqual(fresh.scenes.find((scene) => scene.id === 'default').rule, { kind: 'none' });
  const migrated = Schema.normalizeDocument({ family: 'fids', name: 'x', scenes: [
    { id: 'default', label: 'Default', priority: 10 },
    { id: 'delay', label: 'Delay emphasis', priority: 30 },
    { id: 'scene_night', label: 'Night', priority: 40, rule: { kind: 'time', from: '22:30', to: '05:15' } }
  ] });
  assert.deepEqual(migrated.scenes.find((scene) => scene.id === 'delay').rule, { kind: 'data', condition: 'any-delayed' });
  assert.deepEqual(migrated.scenes.find((scene) => scene.id === 'scene_night').rule, { kind: 'time', from: '22:30', to: '05:15' });
});

test('scene overrides survive normalization and drop broken entries', () => {
  const document = Schema.normalizeDocument({ family: 'fids', name: 'x', scenes: [
    { id: 'default', label: 'Default', priority: 10 },
    { id: 'delay', label: 'Delay emphasis', priority: 30, overrides: {
      module_a: { enabled: false, layout: { x: 5, y: 5, w: 90, h: 40 }, props: { headline: 'Held' } },
      module_b: { layout: { x: 'left', y: 0, w: 10, h: 10 } },
      module_c: 'garbage'
    } }
  ] });
  const delay = document.scenes.find((scene) => scene.id === 'delay');
  assert.deepEqual(delay.overrides.module_a, { enabled: false, layout: { x: 5, y: 5, w: 90, h: 40 }, props: { headline: 'Held' } });
  assert.deepEqual(delay.overrides.module_b, undefined);
  assert.deepEqual(delay.overrides.module_c, undefined);
  const invalidTime = Schema.normalizeScene({ id: 's', label: 'S', rule: { kind: 'time', from: '99:99', to: 'later' } }, 0);
  assert.deepEqual(invalidTime.rule, { kind: 'time', from: '22:00', to: '05:00' });
});

test('a module hidden in the Studio is not pushed into the legacy template', () => {
  const document = Schema.newDocument({ family: 'gids' });
  const advertisement = document.modules.find((module) => module.type === 'advertisement');
  assert.equal(advertisement.enabled, false);
  const converted = Compat.toLegacyTemplate(document);
  assert.equal(converted.supported, true);
  assert.ok(!converted.template.components.some((item) => item.type === 'ad'));
});
