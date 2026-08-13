'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'fids-current');
const core = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'display-overrides.css'), 'utf8');
const flightCss = fs.readFileSync(path.join(root, 'css', 'flight-display.css'), 'utf8');
const baggageCss = fs.readFileSync(path.join(root, 'css', 'baggage-display.css'), 'utf8');

test('boarding fit has no standing resize heartbeat', () => {
  assert.doesNotMatch(core, /_gateFitTick\s*=\s*setInterval/);
  assert.match(core, /addEventListener\('resize', window\._gateFitResizeHandler/);
  assert.match(core, /function gateLanguageLayout\(root\)/);
  assert.match(core, /function gateAutofit\(root\)[\s\S]*gateLanguageLayout\(root\);/);
  const periodicScan = core.slice(core.indexOf('function _scanAndUpgrade()'), core.indexOf('// Initial scan after a tick'));
  assert.doesNotMatch(periodicScan, /g8-board-lane/);
  assert.match(css, /\.g8-board-grp-num[\s\S]*transition:\s*none\s*!important/);
});

test('aircraft enrichment uses the flight operating date and persists the type', () => {
  assert.match(core, /fidsLocalDateKey\(currentFlight\._sortTs\s*\|\|\s*Date\.now\(\)/);
  assert.match(core, /_acResolvedPut\(currentFlight\.flight/);
  assert.match(core, /if \(changed && typeof requestGateRebuild === 'function'\) requestGateRebuild\(\)/);
});

test('all display entry points load the date-context helper before core', () => {
  for (const file of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const helper = html.indexOf('js/gate-date-context.js?v=23157');
    const main = html.indexOf('js/fids-core.js?v=23157');
    assert.ok(helper >= 0, `${file} is missing the date helper`);
    assert.ok(main > helper, `${file} must load the date helper before core`);
  }
});

test('gate rendering carries one status key and a next-day context', () => {
  assert.match(core, /if \(stKey === 'scheduled' \|\| !stKey\) stKey = 'ontime'/);
  assert.match(core, /stKey:\s*stKey,[\s\S]*flightDateContext:\s*_flightDateContext/);
});

test('diverted flights use a full red row on flight and baggage boards', () => {
  assert.doesNotMatch(flightCss, /row-diverted[^}]*#185A9D/i);
  assert.doesNotMatch(baggageCss, /row-diverted[^}]*#185A9D/i);
  assert.match(css, /row-diverted:nth-child\(odd\)[\s\S]*background-color:\s*#A61B2B\s*!important/);
  assert.match(css, /row-diverted:nth-child\(even\)[\s\S]*background-color:\s*#DE4B58\s*!important/);
});
