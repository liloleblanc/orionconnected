'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../fids-current/js/studio-schema.js');
const Render = require('../fids-current/js/studio-render.js');

function context(overrides) {
  return Object.assign({
    airport: { id: 'yqm', iata: 'YQM', name: 'Greater Moncton Roméo LeBlanc International Airport', siteHost: 'yqm.orionconnected.com' },
    family: 'fids',
    canvas: { width: 1920, height: 1080 },
    language: 'en',
    direction: 'ltr',
    scene: 'default',
    sceneLabel: 'Default',
    dataBadge: 'PREVIEW',
    clock: { time: '9:21 PM', date: 'Tuesday, August 18' },
    weather: { temperature: 22, unit: 'C', condition: 'Clear' },
    rows: {
      departures: [['AC 1983', 'Toronto (YYZ)', '4', '5:30 AM', 'On time'], ['AC 7995', 'Montréal (YUL)', '4', '11:05 AM', 'Delayed']],
      arrivals: [['AC 1983', 'Toronto (YYZ)', '1', '9:08 PM', 'Arrived']]
    },
    nextLanguage: 'FR in 12s',
    selectedId: null,
    editing: false,
    showGrid: false,
    showSafe: false
  }, overrides || {});
}

test('the canvas is painted entirely from the document model', () => {
  const document = Schema.newDocument({ family: 'fids' });
  const html = Render.canvasHTML(document, context());
  for (const module of document.modules.filter((item) => item.enabled !== false)) {
    assert.ok(html.includes('data-module-id="' + module.id + '"'), module.type + ' rendered');
  }
  assert.ok(html.includes('AC 1983'));
  assert.ok(html.includes('left:' + document.modules[0].layout.x + '%'));
});

test('disabled modules stay off the canvas', () => {
  const document = Schema.newDocument({ family: 'fids' });
  document.modules[2].enabled = false;
  const html = Render.canvasHTML(document, context());
  assert.ok(!html.includes('data-module-id="' + document.modules[2].id + '"'));
});

test('tokens resolve from live context and never leak markup', () => {
  const resolved = Render.resolveTokens('{airport.iata} <b>{flight.flight}</b> to {flight.city} at {flight.time} — {weather.temp}', context());
  assert.equal(resolved, 'YQM &lt;b&gt;AC 1983&lt;/b&gt; to Toronto (YYZ) at 5:30 AM — 22°C');
  assert.equal(Render.resolveTokens('{unknown.token}', context()), '{unknown.token}');
});

test('editing mode marks the selected module and offers resize handles', () => {
  const document = Schema.newDocument({ family: 'fids' });
  const selected = document.modules[1].id;
  const html = Render.canvasHTML(document, context({ editing: true, selectedId: selected }));
  assert.ok(html.includes('is-selected'));
  assert.ok(html.includes('data-handle="se"'));
  const viewer = Render.canvasHTML(document, context({ editing: false, selectedId: selected }));
  assert.ok(!viewer.includes('data-handle'));
});

test('the emergency state takes over every family without editing the modules', () => {
  const document = Schema.newDocument({ family: 'bids' });
  const html = Render.canvasHTML(document, context({ family: 'bids', scene: 'emergency' }));
  assert.ok(html.includes('cm-emergency'));
  assert.ok(html.includes('EMERGENCY OVERRIDE'));
});

test('scene emphasis reaches flight rows through data, not extra CSS files', () => {
  const document = Schema.newDocument({ family: 'fids' });
  const html = Render.canvasHTML(document, context({ scene: 'delay' }));
  assert.ok(html.includes('row-alert'));
});

test('a state is its own design — overrides change layout, visibility and props per state', () => {
  const document = Schema.newDocument({ family: 'fids' });
  const table = document.modules.find((module) => module.type === 'flight-table');
  const advertisement = document.modules.find((module) => module.type === 'advertisement');
  const delay = document.scenes.find((scene) => scene.id === 'delay');
  delay.overrides = {
    [table.id]: { layout: { x: 2, y: 23, w: 96, h: 64 } },
    [advertisement.id]: { enabled: false, props: { headline: 'Delays in effect' } }
  };
  const effective = Render.effectiveModules(document, 'delay');
  assert.equal(effective.find((module) => module.id === table.id).layout.w, 96);
  assert.equal(effective.find((module) => module.id === advertisement.id).enabled, false);
  assert.equal(effective.find((module) => module.id === advertisement.id).props.headline, 'Delays in effect');
  const base = Render.effectiveModules(document, 'default');
  assert.equal(base.find((module) => module.id === table.id).layout.w, table.layout.w);
  assert.notEqual(base.find((module) => module.id === advertisement.id).enabled, false);
  const html = Render.canvasHTML(document, context({ scene: 'delay' }));
  assert.ok(!html.includes('data-module-id="' + advertisement.id + '"'));
});

test('state rules pick the layout from live data, honouring priority, defaulting otherwise', () => {
  const document = Schema.newDocument({ family: 'fids' });
  assert.equal(Render.evaluateStateRules(document, context()), 'delay');
  const calm = context({ rows: { departures: [['AC 1', 'X', '1', '5:00 AM', 'On time']], arrivals: [] } });
  assert.equal(Render.evaluateStateRules(document, calm), 'default');
  const boarding = context({ rows: { departures: [['AC 1', 'X', '1', '5:00 AM', 'Boarding'], ['AC 2', 'Y', '2', '6:00 AM', 'Delayed']], arrivals: [] } });
  assert.equal(Render.evaluateStateRules(document, boarding), 'delay');
  document.scenes.find((scene) => scene.id === 'highlight').priority = 90;
  assert.equal(Render.evaluateStateRules(document, boarding), 'highlight');
});

test('building blocks render styled content with sanitized values', () => {
  const text = Schema.normalizeModule({ type: 'text', props: { text: '{airport.iata} loves you', size: 3, color: '#f9c20b' } }, 'fids', 0);
  const textHTML = Render.moduleContent(text, context());
  assert.ok(textHTML.includes('YQM loves you'));
  assert.ok(textHTML.includes('font-size:3cqw'));
  assert.ok(textHTML.includes('color:#f9c20b'));
  const hostile = Render.moduleContent(Schema.normalizeModule({ type: 'text', props: { text: 'x', color: 'red;background:url(evil)' } }, 'fids', 0), context());
  assert.ok(hostile.includes('color:#ffffff'));
  const box = Render.moduleContent(Schema.normalizeModule({ type: 'box', props: { fill: '#123456', skew: -20 } }, 'fids', 0), context());
  assert.ok(box.includes('skewX(-20deg)'));
  const image = Render.moduleContent(Schema.normalizeModule({ type: 'image', props: {} }, 'fids', 0), context());
  assert.ok(image.includes('asset library'));
  const clock = Render.moduleContent(Schema.normalizeModule({ type: 'clock', props: {} }, 'fids', 0), context());
  assert.ok(clock.includes('9:21 PM'));
});

test('an empty display invites building instead of rendering nothing', () => {
  const blank = Schema.newDocument({ family: 'fids', blank: true, name: 'Blank' });
  assert.ok(Render.canvasHTML(blank, context({ editing: true })).includes('cm-blank'));
  assert.ok(!Render.canvasHTML(blank, context({ editing: false })).includes('cm-blank'));
});

test('airline codes parse from flight numbers, digits included', () => {
  assert.equal(Render.airlineFromFlight('AC 1983').name, 'Air Canada');
  assert.equal(Render.airlineFromFlight('F8 1620').name, 'Flair');
  assert.equal(Render.airlineFromFlight('AC1983').code, 'AC');
  assert.equal(Render.airlineFromFlight('WS 3452').name, 'WestJet');
});

test('flight tables page automatically and honour column toggles', () => {
  const document = Schema.newDocument({ family: 'fids' });
  const table = document.modules.find((module) => module.type === 'flight-table');
  table.props.maxRows = 3;
  table.props.columns = { airline: false };
  const rows = [];
  for (let index = 0; index < 8; index += 1) rows.push(['AC ' + (100 + index), 'City ' + index, '4', '5:30 AM', 'On time']);
  const pageOne = Render.canvasHTML(document, context({ rows: { departures: rows, arrivals: [] }, nowMs: 0 }));
  assert.ok(pageOne.includes('PAGE 1 / 3'));
  assert.ok(pageOne.includes('AC 100') && !pageOne.includes('AC 104'));
  assert.ok(!pageOne.includes('>Airline<'));
  const pageTwo = Render.canvasHTML(document, context({ rows: { departures: rows, arrivals: [] }, nowMs: 9000 }));
  assert.ok(pageTwo.includes('PAGE 2 / 3'));
  assert.ok(pageTwo.includes('AC 104'));
});

test('the header carries a changeable brand logo', () => {
  const document = Schema.newDocument({ family: 'fids' });
  const withLogo = Render.canvasHTML(document, context({ brandLogo: 'data:image/svg+xml;base64,AAAA' }));
  assert.ok(withLogo.includes('fx-brand-logo'));
  const withoutLogo = Render.canvasHTML(document, context({}));
  assert.ok(withoutLogo.includes('fx-orbit'));
});

test('departure boards sort by time, offer manual order, and show cancelled in red', () => {
  const document = Schema.newDocument({ family: 'fids' });
  const table = document.modules.find((module) => module.type === 'flight-table');
  const rows = [
    ['AC 2', 'B', '1', '11:05 AM', 'On time'],
    ['AC 1', 'A', '1', '5:30 AM', 'Cancelled'],
    ['AC 3', 'C', '1', '9:15 PM', 'On time']
  ];
  const sorted = Render.canvasHTML(document, context({ rows: { departures: rows, arrivals: [] }, nowMs: 0 }));
  assert.ok(sorted.indexOf('AC 1') < sorted.indexOf('AC 2'));
  assert.ok(sorted.indexOf('AC 2') < sorted.indexOf('AC 3'));
  assert.ok(sorted.includes('status-bad'));
  table.props.sort = 'manual';
  const manual = Render.canvasHTML(document, context({ rows: { departures: rows, arrivals: [] }, nowMs: 0 }));
  assert.ok(manual.indexOf('AC 2') < manual.indexOf('AC 1'));
});

test('editing mode tags rows with stored indices and cells with fields for direct editing', () => {
  const document = Schema.newDocument({ family: 'fids' });
  const rows = [['AC 2', 'B', '1', '11:05 AM', 'On time'], ['AC 1', 'A', '1', '5:30 AM', 'On time']];
  const html = Render.canvasHTML(document, context({ rows: { departures: rows, arrivals: [] }, editing: true, nowMs: 0, selectedId: document.modules.find((m) => m.type === 'flight-table').id }));
  const sortedFirst = html.indexOf('data-flight-index="1"');
  const sortedSecond = html.indexOf('data-flight-index="0"');
  assert.ok(sortedFirst !== -1 && sortedSecond !== -1 && sortedFirst < sortedSecond);
  assert.ok(html.includes('data-field="city"'));
  assert.ok(html.includes('cm-edit-pill'));
  const viewer = Render.canvasHTML(document, context({ rows: { departures: rows, arrivals: [] }, editing: false, nowMs: 0 }));
  assert.ok(!viewer.includes('data-flight-index') && !viewer.includes('cm-edit-pill'));
});

test('time-window rules match daily windows, including overnight wrap', () => {
  const rule = { kind: 'time', from: '22:00', to: '05:00' };
  assert.equal(Render.sceneRuleMatches(rule, context({ clock: { minutes: 23 * 60 } })), true);
  assert.equal(Render.sceneRuleMatches(rule, context({ clock: { minutes: 3 * 60 } })), true);
  assert.equal(Render.sceneRuleMatches(rule, context({ clock: { minutes: 12 * 60 } })), false);
  const daytime = { kind: 'time', from: '09:00', to: '17:00' };
  assert.equal(Render.sceneRuleMatches(daytime, context({ clock: { minutes: 10 * 60 } })), true);
  assert.equal(Render.sceneRuleMatches(daytime, context({ clock: { minutes: 18 * 60 } })), false);
});
