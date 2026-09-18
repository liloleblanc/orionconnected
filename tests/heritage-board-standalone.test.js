'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE ARCHIVE BOARD IS STANDALONE, AND THE ROUTES ON IT ARE THE REMEMBERED ONES.
//
// Two separate guarantees, and both need holding by a test rather than by
// good intentions.
//
// FIRST: it touches nothing. The heritage gate built inside the live system
// spent its life being overwritten — the live refresh timer painted today's
// real Porter and WestJet flights over a 1998 demonstration every five
// minutes, because a board wired to a feed will eventually be given one. This
// page cannot be given one. The test asserts that by name.
//
// SECOND: the network is real even though the flights are not. The version
// this replaces GENERATED its schedule, and invented Gander, St. John's and
// Saint John as Air Atlantic destinations from Moncton — regionally plausible,
// entirely wrong, undetectable without someone who was there. Air Atlantic
// flew Halifax from Moncton and nothing else. These assertions are the record
// of what was actually recalled, so a later edit that "improves" the board
// back into fiction fails instead.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'fids-current/heritage-board.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'fids-current/js/heritage-board.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/heritage-board.css'), 'utf8');

// Strip comments from ALL THREE before scanning for forbidden identifiers.
// Every one of these files explains in its header what it does NOT use, and
// naming a thing is not using it — the first run of this test failed on its
// own documentation, in all three files.
const CODE = JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MARKUP = HTML.replace(/<!--[\s\S]*?-->/g, '');
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

test('the page loads nothing from the live board', () => {
  for (const forbidden of ['fids-core.js', 'feed-router.js', 'display-overrides.css',
                           'host-airport.js', 'menu.js', 'gate-date-context.js']) {
    assert.equal(MARKUP.includes(forbidden), false,
      `heritage-board.html loads ${forbidden} — the whole point is that it cannot be ` +
      'broken by, or overwritten from, the live board');
  }
  // Exactly two of its own, and nothing else.
  const srcs = [...MARKUP.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(srcs.sort(), ['css/heritage-board.css?v=1', 'js/heritage-board.js?v=1']);
});

test('it uses no live-board machinery, by name', () => {
  // The coupling list the old heritage gate had. Every one of these is a way
  // for a feed, a timer or a roster to reach the board.
  const machinery = [
    'LIVE_MODE', 'fetchLive', 'autoRefreshTimer', 'demoRebuildTimer', 'startDemoRebuild',
    'loadDemo', 'buildDemoFlights', 'DEMO_SCHEDULES', 'buildRandomFlights',
    'apSel', 'FIDS_LIVE_AIRPORTS', 'COORDS', 'AIRLINE_NAME', 'AIRLINE_ACCENT',
    'requestGateRebuild', 'changeScreenType', 'HERITAGE_CARRIERS', 'HERITAGE_MARKS',
    '_heritageCode', '_heritageSchedule', 'adbTs', 'authorityFlight'
  ];
  const found = machinery.filter(m => CODE.includes(m));
  assert.deepEqual(found, [], 'the archive board reached into the live system: ' + found.join(', '));
});

test('and makes no network request at all', () => {
  for (const io of ['fetch(', 'XMLHttpRequest', 'EventSource', 'WebSocket',
                    'navigator.sendBeacon', 'import(']) {
    assert.equal(CODE.includes(io), false,
      `the board performs I/O (${io}) — it has nothing to ask anyone for, and a page ` +
      'that asks is a page that can be answered with the wrong thing');
  }
});

test('the clock is the board\'s own, never the viewer\'s', () => {
  // A board that reads its host clock shows a different time in every
  // timezone. This one depicts a fixed moment and counts from it.
  assert.equal(/new Date\(\)/.test(CODE), false, 'no reading of the host clock');
  assert.equal(/Date\.now\(\)/.test(CODE), false, 'nor of the host epoch');
  assert.match(CODE, /OPENS_AT\s*=/, 'it starts from a depicted time');
});

// ── the remembered network ───────────────────────────────────────────────

// The module paints on load, so the stub has to be complete enough to let it
// run to the end — it exposes its data only after wiring up.
function board() {
  const el = () => ({ textContent: '', innerHTML: '' });
  const win = {};
  const doc = {
    readyState: 'complete',
    addEventListener() {},
    getElementById: el,
    querySelector: el,
    querySelectorAll: () => []
  };
  const timers = { setInterval: () => 0, clearInterval() {} };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'setInterval', 'clearInterval', JS)(
    win, doc, timers.setInterval, timers.clearInterval);
  return win.HERITAGE_BOARD;
}

function destinationsOf(code) {
  return board().DEPARTURES
    .filter(d => d.carrier === code)
    .flatMap(d => d.to.map(t => t.iata))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
}

test('Air Atlantic flew Halifax from Moncton, and nowhere else', () => {
  assert.deepEqual(destinationsOf('9A'), ['YHZ'],
    'the generator this replaces invented Gander, St. John\'s and Saint John here');
});

test('Air Nova never flew Moncton–Toronto', () => {
  const nova = destinationsOf('ANV');
  assert.equal(nova.includes('YYZ'), false,
    'Toronto out of Moncton was always Air Canada mainline. Air Nova did not fly it, and by ' +
    'the time Jazz picked it up the Air Nova brand was gone — so it is anachronistic, not ' +
    'merely unlikely');
  assert.deepEqual(nova, ['MCO', 'YFC', 'YHZ', 'YSJ', 'YUL']);
});

test('there is no flight 666, and that is deliberate', () => {
  const ac = board().DEPARTURES.filter(d => d.carrier === 'AC').map(d => d.no);
  assert.deepEqual(ac, ['662', '664', '668'],
    'three Toronto departures a day, and the numbering runs 662/664/668 because airlines ' +
    'retire 666. The gap is why the sequence ends where it does — do not tidy it');
  assert.equal(ac.includes('666'), false);
});

test('the multi-stop routings are one row, not two', () => {
  const via = board().DEPARTURES.filter(d => d.to.length > 1);
  assert.equal(via.length, 1, 'Moncton–Saint John–Montreal is the via-stop');
  assert.deepEqual(via[0].to.map(t => t.iata), ['YSJ', 'YUL']);
  // Listing them separately would double-count one aeroplane serving two cities.
  const asOwnRow = board().DEPARTURES.filter(d => d.to.length === 1 && d.to[0].iata === 'YSJ');
  assert.deepEqual(asOwnRow, []);
});

test('every flight number says whether it was remembered or invented', () => {
  for (const d of board().DEPARTURES) {
    assert.ok(['recalled', 'invented'].includes(d.src),
      `flight ${d.no} does not say where its number came from`);
  }
  // The ones that were actually recalled, held by name so they cannot drift.
  const recalled = board().DEPARTURES.filter(d => d.src === 'recalled').map(d => d.no).sort();
  assert.deepEqual(recalled, ['662', '664', '668', '8882', '8884']);
});

test('the stamp says plainly that none of it is real', () => {
  // MARKUP and RULES, not HTML and CSS. The forbidden-identifier tests above
  // strip comments so that documentation does not read as a violation; these
  // must strip them for the OPPOSITE reason. A comment mentioning the word
  // "Demonstration" is not a stamp on the page — scanning the raw file would
  // let someone delete the stamp entirely and still pass, which is the weaker
  // and more dangerous half of the same mistake.
  assert.match(MARKUP, /Demonstration/i);
  assert.match(MARKUP, /Démonstration/);
  assert.match(MARKUP, /not a live flight/);
  assert.match(RULES, /\.hb-stamp[\s\S]*?position:\s*fixed/,
    'fixed to the viewport so no re-render can drop it');
});

test('the stylesheet does not join the specificity war', () => {
  assert.equal(RULES.includes(':not(#_)'), false,
    'nothing else styles this page, so no rule here needs to out-weigh anything');
  assert.equal(RULES.includes('!important'), false,
    'and nothing needs forcing');
});
