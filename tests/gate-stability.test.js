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
  // The core cache-buster is read from fids-core.js itself rather than pinned
  // as a literal: the pinned form broke on every release bump and taught
  // nothing when it did. Matching the HTML against the live tag also catches
  // the real failure mode — a bumped FIDS_BUILD_TAG whose ?v= busters were
  // not bumped with it, which would strand every deployed screen on cache.
  const buildTag = (core.match(/var FIDS_BUILD_TAG = 'v(\d+)'/) || [])[1];
  assert.ok(buildTag, 'fids-core.js must declare FIDS_BUILD_TAG');
  for (const file of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const helper = html.indexOf('js/gate-date-context.js?v=');
    const main = html.indexOf(`js/fids-core.js?v=${buildTag}`);
    assert.ok(helper >= 0, `${file} is missing the date helper`);
    assert.ok(main >= 0, `${file} must bust fids-core.js at the current build tag v${buildTag}`);
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

test('the gate banner date refreshes itself over a day boundary', () => {
  // The date is painted once by the gate rebuild and _computeGateKey has no
  // time term, so without a heartbeat an overnight gate with no data churn
  // shows yesterday until its flight data next moves — measured at six hours
  // on a real board. The node has to carry its zone and the day it was built
  // for, and the existing 5s clock tick has to roll it when that day changes.
  assert.match(core, /<div class="octb-date" data-tz="' \+ _e\(_tbTz\) \+ '" data-day="' \+ _e\(_tbDay1\) \+ '">/);
  assert.match(core, /_tbDay1 = _ocLocalDayKey\(_tbTz \|\| null\)/);
  assert.match(core, /function _ocLocalDayKey\(tz\)/);
  const tick = core.slice(core.indexOf('/* Local-time shelf clock'), core.indexOf('/* Accor hotel slide'));
  assert.match(tick, /querySelectorAll\('\.octb-date\[data-tz\]'\)/);
  assert.match(tick, /getAttribute\('data-day'\) === day\) continue/);
  assert.match(tick, /innerHTML = _ocClockDate\(new Date\(\), dtz \|\| null\)/);
  // The rebuild must NOT be the mechanism: a day term in the gate key repaints
  // the whole screen unattended at midnight, which is what v23166 and the
  // aircraft retry both exist to prevent.
  const gateKey = core.slice(core.indexOf('var _computeGateKey = function ()'));
  assert.doesNotMatch(gateKey.slice(0, 400), /_ocLocalDayKey|fidsLocalDateKey|dayKey/);
});

test('the Moncton banner never paints text in its own background colour', () => {
  // --airline-r1 is the carrier's DARK shade: it backs the date bar and inks
  // the clock. Porter's r1 is #EFE8DA, the cream the band is made of, and the
  // old guard only rejected the literal '#FFFFFF' — so it was painted onto
  // itself at 1.08:1. The guard is luminance now, falling back to the
  // carrier's own r1Text ink.
  // Scoped to the --airline-r1 publication on purpose. The same string guard
  // still appears on _silkDark, where Porter's cream IS the intended band
  // (v23120) and _silkLum already darkens the ink for it, and on --banner-bg,
  // which has the same latent bug but paints a different surface.
  const r1From = core.indexOf("+ ';--airline-r1:'");
  const r1To = core.indexOf("+ ';--airline-accent-ink:'");
  assert.ok(r1From >= 0 && r1To > r1From, 'could not isolate the --airline-r1 publication');
  const r1Pub = core.slice(r1From, r1To);
  assert.doesNotMatch(r1Pub, /!== '#FFFFFF'/);
  assert.match(r1Pub, /_hexIsLight\(s\.r1\)/);
  assert.match(core, /\(s\.r1Text && !_hexIsLight\(s\.r1Text\)\) \? s\.r1Text : '#0c1119'/);
  // And the date, which sits ON that bar, must not be coloured with it.
  assert.doesNotMatch(css, /\.g8-ap-YQM \.g8-r1-timebox \.octb-date \{\s*color: var\(--airline-r1/);
  assert.match(css, /\.g8-ap-YQM \.g8-r1-timebox \.octb-clock \{\s*color: var\(--airline-r1/);
});

test('the bilingual gate titles fit their pill instead of being cut', () => {
  // gateLanguageLayout stacks an over-wide title by adding .g8-lane-stacked,
  // and the stacking rules work by setting the two halves to display:block.
  // The titles are display:flex, where a flex item ignores display:block — so
  // the stack has been dead since they became flex, every title carries the
  // class regardless, and long strings were simply clipped ('Embarquemen').
  // Measured on the shipped board: 17px over at 1920x1080, 22px at 1366x768.
  assert.match(core, /function _gateTitleFit\(root\)/);
  assert.match(core, /gateLanguageLayout\(root\);\s*\n\s*_gateTitleFit\(root\);/);
  // Shrink by RATIO, so the separator keeps its size relative to the words.
  assert.match(core, /bases\[j\] \* ratio/);
  // Cached on text+width like the other fitters, so it is shrink-only and
  // re-measures when the column width changes.
  assert.match(core, /dataset\.titleFitKey/);
});

test('the shelf code follows the carrier, and the aircraft hold is logo-only', () => {
  // v23472 painted the value-line code a flat #4DA3FF, so the same YYZ rendered
  // in two colours on one screen — accent red in the left column, blue here.
  const from = css.indexOf('v23472 — THE VALUE-LINE CODE');
  const to = css.indexOf('v23476 — AND IT CLEARS THE CARD EDGE');
  assert.ok(from >= 0 && to > from, 'could not isolate the value-line code block');
  const codeBlock = css.slice(from, to);
  assert.doesNotMatch(codeBlock, /color:\s*#4DA3FF/);
  assert.match(codeBlock, /--airline-accent-ink/);
  // The hold panel is the carrier mark alone — no 'Aircraft details updating'.
  assert.doesNotMatch(core, /v2-rc-aircraft-hold-text/);
  assert.match(core, /acUpdating:\{ en:'Aircraft details updating'/);  // string kept in TL
});
