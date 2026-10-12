'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// A BOARD SHOWN AS AN EXAMPLE READS 10:10.
//
// The watch-advert convention: the hands frame the maker's name and the dial
// smiles. Every picture of a board that is an example rather than an airport
// — a demo board, a heritage gate, a board carrying a test flight, the Studio
// and Designer previews, the homepage screenshots — shows 10:10 AM on its
// clocks. A board in an airport keeps the real time, and nothing turns the
// switch on by itself there.
//
// The switch changes only what a CLOCK prints. BoardStrings.clockNow hands a
// clock the instant at 10:10 on the airport's own day, and the clock formats
// it with its usual rule, so the format stays the board's own (10:10 AM led
// by English, 10:10 led by French). Rows, statuses, countdowns and
// Today | Tomorrow keep reading the real time: the flights in a demo picture
// stay the real ones.
//
//   ?clock=1010   on          ?clock=live   off, even on a demo
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'fids-current');
const BS = require(path.join(ROOT, 'js', 'board-strings.js'));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORE = read('js/fids-core.js');

function extract(src, name, indent) {
  const start = src.indexOf((indent || '') + 'function ' + name + '(');
  assert.notEqual(start, -1, name + ' not found');
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.notEqual(end, -1, 'could not bracket-match ' + name);
  return src.slice(start, end);
}

// Run fn with location / window stubbed as a page would have them, and the
// switch put back afterwards (the store keeps it for the whole process).
function withPage(page, fn) {
  const had = { location: Object.getOwnPropertyDescriptor(globalThis, 'location'), window: Object.getOwnPropertyDescriptor(globalThis, 'window') };
  try {
    if (page.location) Object.defineProperty(globalThis, 'location', { value: page.location, configurable: true, writable: true });
    if (page.window) Object.defineProperty(globalThis, 'window', { value: page.window, configurable: true, writable: true });
    return fn();
  } finally {
    for (const k of ['location', 'window']) {
      if (had[k]) Object.defineProperty(globalThis, k, had[k]); else delete globalThis[k];
    }
    BS.setDemoClock(false);
  }
}

const ZONES = ['America/Moncton', 'America/Toronto', 'America/Vancouver', 'America/St_Johns',
  'Europe/London', 'Australia/Sydney', 'Asia/Kolkata', 'Asia/Tokyo', 'Pacific/Auckland'];

test('a board in an airport keeps the real time', () => {
  BS.setDemoClock(false);
  assert.equal(BS.demoClock(), false, 'off unless a demo or the URL turns it on');
  const t = new Date('2026-10-12T06:53:21Z');
  assert.equal(BS.clockNow(t, 'America/Moncton').getTime(), t.getTime());
  assert.equal(BS.boardTime(BS.clockNow(t, 'America/Moncton'), 'America/Moncton'), '3:53 AM');
});

test('on a demo every clock reads 10:10, in the board\'s own format, on the airport\'s own day', () => {
  BS.setDemoClock(true);
  try {
    for (const z of ZONES) {
      for (let h = 0; h < 24; h++) {
        const real = new Date(Date.UTC(2026, 9, 12, h, 37, 21));
        const shown = BS.clockNow(real, z);
        assert.equal(BS.boardTime(shown, z, { list: ['en', 'fr'] }), '10:10 AM', z + ' at ' + real.toISOString());
        assert.equal(BS.boardTime(shown, z, { hour: '2-digit', list: ['en'] }), '10:10 AM');
        assert.equal(BS.boardTime(shown, z, { list: ['fr', 'en'] }), '10:10', 'a board led by French reads its 24-hour clock');
        for (const l of BS.LANGS) {
          assert.equal(BS.time(shown, l, z), l === 'en' ? '10:10am' : '10:10', l + ' in ' + z);
        }
        // the date beside the clock, and Today | Tomorrow, are the real day's
        assert.equal(BS.longDate(shown, 'en', z), BS.longDate(real, 'en', z), 'the same airport day in ' + z);
        assert.equal(shown.getUTCSeconds(), 21, 'the real seconds keep ticking');
      }
    }
  } finally { BS.setDemoClock(false); }
});

test('a daylight-saving morning still reads 10:10 on the right day', () => {
  BS.setDemoClock(true);
  try {
    const z = 'America/Moncton';
    // 01:30 AST, half an hour before the clocks go forward (2026-03-08)
    const spring = BS.clockNow(new Date('2026-03-08T05:30:00Z'), z);
    assert.equal(spring.toISOString(), '2026-03-08T13:10:00.000Z', '10:10 ADT');
    // 01:30 ADT, before the clocks go back (2026-11-01)
    const fall = BS.clockNow(new Date('2026-11-01T04:30:00Z'), z);
    assert.equal(fall.toISOString(), '2026-11-01T14:10:00.000Z', '10:10 AST');
    for (const d of [spring, fall]) assert.equal(BS.boardTime(d, z, { list: ['en'] }), '10:10 AM');
  } finally { BS.setDemoClock(false); }
});

test('the switch: ?clock=1010 turns it on, ?clock=live off, and the URL outranks the page', () => {
  const t = new Date('2026-10-12T06:53:00Z');
  withPage({ location: { search: '?ap=YQM&clock=1010' } }, () => {
    BS.setDemoClock(false);
    assert.equal(BS.demoClock(), true);
    assert.equal(BS.boardTime(BS.clockNow(t, 'America/Moncton'), 'America/Moncton', { list: ['en'] }), '10:10 AM');
  });
  withPage({ location: { search: '?mode=demo&clock=live' } }, () => {
    BS.setDemoClock(true);
    assert.equal(BS.demoClock(), false, 'the real time, even on a demo');
    assert.equal(BS.clockNow(t, 'America/Moncton').getTime(), t.getTime());
  });
  withPage({ location: { search: '?ap=YQM' } }, () => {
    BS.setDemoClock(true);
    assert.equal(BS.demoClock(), true, 'no ?clock=: the page\'s own demo decides');
  });
});

test('a board in a same-origin frame follows the frame\'s ?clock=', () => {
  const frame = { location: { search: '?tour=1&clock=1010' } };
  withPage({ location: { search: '?ap=YHZ' }, window: { parent: frame } }, () => {
    assert.equal(BS.demoClock(), true, 'tour.html?clock=1010 / rotate.html?clock=1010 turn the boards inside');
  });
  withPage({ location: { search: '?ap=YHZ&clock=live' }, window: { parent: frame } }, () => {
    assert.equal(BS.demoClock(), false, 'the board\'s own ?clock= wins');
  });
  // another origin's location throws when read: the board keeps its own
  const foreign = { get location() { throw new Error('SecurityError'); } };
  withPage({ location: { search: '' }, window: { parent: foreign } }, () => {
    assert.equal(BS.demoClock(), false);
  });
});

test('a demo mode\'s switch can be a question asked at every tick', () => {
  let demo = false;
  BS.setDemoClock(() => demo);
  try {
    assert.equal(BS.demoClock(), false);
    demo = true;
    assert.equal(BS.demoClock(), true, 'loadDemo / a test flight turns it on without telling the store');
    demo = false;
    assert.equal(BS.demoClock(), false, 'fetchLive turns it off again');
    BS.setDemoClock(() => { throw new Error('boom'); });
    assert.equal(BS.demoClock(), false, 'a broken question is the real time');
  } finally { BS.setDemoClock(false); }
});

test('the boards\' clock helpers print 10:10 on a demo and the time otherwise', () => {
  const doc = { getElementById: () => ({ value: 'YQM' }) };
  const t1 = new Function('BoardStrings', extract(CORE, '_ocClockTime1') + '; return _ocClockTime1;')(BS);
  const t2 = new Function('BoardStrings', 'langs', 'document', extract(CORE, '_ocClockTime') + '; return _ocClockTime;')(BS, ['en', 'fr'], doc);
  const t = new Date('2026-10-12T06:53:00Z');
  BS.setDemoClock(false);
  assert.equal(t1(t, 'America/Moncton'), '3:53AM');
  assert.equal(t2(t, 'America/Moncton'), '3:53AM | 3h 53');
  BS.setDemoClock(true);
  try {
    assert.equal(t1(t, 'America/Moncton'), '10:10AM', 'the FIDS / BIDS banner clock');
    assert.equal(t2(t, 'America/Moncton'), '10:10AM | 10h 10', 'the dual shelf clock, French in its own form');
  } finally { BS.setDemoClock(false); }
});

test('the board turns it on for demo data, a heritage gate and a test flight — never for live flights', () => {
  const wanted = (win, heritage) => new Function('window', '_heritageCode', extract(CORE, '_fidsDemoClockWanted') + '; return _fidsDemoClockWanted;')(win, () => heritage)();
  assert.equal(wanted({}, ''), false, 'a live board');
  assert.equal(wanted({ _fidsBoardIsDemo: false, _testFlights: [] }, ''), false);
  assert.equal(wanted({ _fidsBoardIsDemo: true }, ''), true, 'demo data (loadDemo)');
  assert.equal(wanted({ _testFlights: [{ _flightKey: 'WS1_test' }] }, ''), true, 'a test flight added in this tab');
  assert.equal(wanted({}, '9A'), true, 'a heritage gate');
  assert.match(CORE, /try \{ BoardStrings\.setDemoClock\(_fidsDemoClockWanted\); \} catch \(e\) \{\}/, 'registered with the store');
  // loadDemo raises the flag the question reads; fetchLive lowers it
  assert.match(extract(CORE, 'loadDemo'), /window\._fidsBoardIsDemo = true;/);
  assert.match(CORE, /async function fetchLive\(\) \{\s*try \{ window\._fidsBoardIsDemo = false; \}/);
});

test('every clock on the boards goes through clockNow; the dates and rows keep the real time', () => {
  // the clocks
  assert.doesNotMatch(CORE, /BoardStrings\.boardTime\(new Date\(\)/, 'no clock formats the bare time');
  assert.doesNotMatch(CORE, /_fidsClockForLang\(new Date\(\),/);
  const timeStr = CORE.match(/const timeStr = BoardStrings\.boardTime\(BoardStrings\.clockNow\(now, tz\), tz, \{ hour: '2-digit' \}\);/g) || [];
  assert.equal(timeStr.length, 2, 'the gate / baggage paint and its once-a-second repaint');
  assert.match(extract(CORE, '_ocClockTime1'), /BoardStrings\.boardTime\(BoardStrings\.clockNow\(now, tz\), tz\)/);
  assert.match(extract(CORE, '_ocClockTime'), /now = BoardStrings\.clockNow\(now, tz\);/);
  assert.match(CORE, /_tbNow1 = BoardStrings\.boardTime\(BoardStrings\.clockNow\(new Date\(\), _tbTz \|\| null\), _tbTz \|\| null\)/, 'the gate\'s time tab');
  // the date and the rows keep the real time
  assert.equal((CORE.match(/const dateDisplay = _airportDateLine\(now, tzOpts, lang, timeStr\);/g) || []).length, 2);
  assert.doesNotMatch(extract(CORE, '_ocClockDate'), /clockNow/);
  // the other pages' clocks
  assert.match(read('js/fids-v2.js'), /BoardStrings\.boardTime\(BoardStrings\.clockNow\(new Date\(\)\)\)/);
  const tr = read('js/template-renderer.js');
  assert.match(tr, /const d = BoardStrings\.clockNow\(new Date\(\)\);/, 'a template\'s clock');
  assert.match(tr, /time: BoardStrings\.boardTime\(BoardStrings\.clockNow\(d\), null, \{ hour: '2-digit' \}\)/, 'a template\'s {time}');
  const player = read('js/studio-player.js');
  assert.match(player, /const shown = BoardStrings\.clockNow\(now, timezone\);/);
  assert.match(player, /time = BoardStrings\.time\(shown, lang, timezone\);/);
  assert.match(player, /BoardStrings\.time\(now, lang, timezone, \{ clock24: true \}\)/, 'the scene rules read the real minutes');
  assert.match(read('tour.html'), /BoardStrings\.time\(BoardStrings\.clockNow\(new Date\(\), tz\), pair\[0\], tz\)/);
});

test('the Studio and the Designer are previews: their clocks read 10:10', () => {
  const studio = read('js/studio.js');
  assert.match(studio, /window\.BoardStrings\.setDemoClock\(true\)/);
  assert.match(studio, /time = shown\.toLocaleTimeString\('en-CA', \{ hour: 'numeric', minute: '2-digit', timeZone: timezone \}\);/);
  assert.match(studio, /minutes = Number\(parts\[0\]\) \* 60 \+ Number\(parts\[1\]\);/, 'the scene rules keep the real minutes');
  // the Designer's page does not load the store: it holds the convention itself
  const dsg = read('js/designer.js');
  const demoNow = new Function(extract(dsg, '_demoNow', '  ') + '; return _demoNow;')();
  const d = demoNow(), now = new Date();
  assert.equal(d.getHours(), 10);
  assert.equal(d.getMinutes(), 10);
  assert.equal(d.toDateString(), now.toDateString(), 'today');
  assert.match(extract(dsg, 'designerContext', '  '), /const d = _demoNow\(\);/);
  assert.match(extract(dsg, '_formatClock', '  '), /const d = _demoNow\(\);/);
});

test('?mode=arr shows the Arrivals board on the real flights, not the demo', () => {
  const html = read('fids.html');
  assert.match(html, /var _urlView = \(_urlMode === 'arr' \|\| _urlMode === 'dep'\) \? _urlMode : '';\s*if \(_urlView\) _urlMode = null;/,
    'arr / dep is a view: it no longer falls into the demo branch');
  assert.equal((html.match(/startPaging\(\);\s*_bootView\(\);/g) || []).length, 2, 'the view is set once the flights are in, live or demo');
  assert.match(html, /setViewMode\(_urlView\)/);
});
