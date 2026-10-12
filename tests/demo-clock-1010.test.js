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
  // ?clock=live: the real time, as on every board
  const realNow = new Function('location', extract(dsg, '_demoNow', '  ') + '; return _demoNow;')({ search: '?clock=live' });
  const r = realNow(), n2 = new Date();
  assert.ok(Math.abs(r.getTime() - n2.getTime()) < 5000, 'the real time with ?clock=live');
  assert.match(extract(dsg, 'designerContext', '  '), /const d = _demoNow\(\);/);
  assert.match(extract(dsg, '_formatClock', '  '), /const d = _demoNow\(\);/);
});

// ?mode=arr on screen (first painted title, the live path, a tab that
// remembers the demo) is read in tests/demo-clock-render.test.js; these are
// the two decisions, run.
test('?mode=arr / ?mode=dep: the board\'s fixed view, and the live path', () => {
  const urlView = (search) => new Function('window', extract(CORE, '_fidsUrlView') + '; return _fidsUrlView();')({ location: { search } });
  assert.equal(urlView('?ap=YQM&mode=arr'), 'arr');
  assert.equal(urlView('?mode=dep&ap=YHZ'), 'dep');
  for (const q of ['?ap=YQM', '?mode=live', '?mode=demo', '?mode=ARR', '']) assert.equal(urlView(q), '', q);
  assert.match(CORE, /let viewMode = _fidsUrlView\(\) \|\| 'rotate';/, 'decided where it is declared, before the first render');
  // fids.html: which flights. Run its two lines with each URL and storage.
  const html = read('fids.html');
  const a = html.indexOf('var _urlView ='), b = html.indexOf('\n', html.indexOf('var startMode =', a));
  assert.ok(a > 0 && b > a, 'the start-mode lines');
  const startMode = (urlMode, signedIn, stored) => new Function('_urlMode', 'localStorage', 'sessionStorage',
    html.slice(a, b) + '; return startMode;')(urlMode, { getItem: (k) => (signedIn && k === 'fids_token' ? 'tok' : null) },
    { getItem: (k) => (k === 'fids_mode' ? stored : null) });
  assert.equal(startMode('arr', false, 'demo'), 'live', 'a view in the URL outranks a demo this tab remembers');
  assert.equal(startMode('dep', false, null), 'live');
  assert.equal(startMode('demo', true, null), 'demo', 'an explicit ?mode=demo still wins');
  assert.equal(startMode(null, false, 'demo'), 'demo', 'no ?mode=: the tab\'s own choice, as before');
  assert.equal(startMode(null, true, 'demo'), 'live', 'signed in: live, as before');
});

// ── Day or night follows the clock shown ─────────────────────────────────
// A board whose clocks read 10:10 is drawn for 10:10: no moon on the gate's
// aircraft sky, no night photograph in the baggage hall, no night scene on
// the weather card under a 10:10 AM clock. A board in an airport, and any
// question asked about a given time, keep the real clock.
const FidsSun = require(path.join(ROOT, 'js', 'fids-sun.js'));
const YQM = [46.1122, -64.6786];

test('the page\'s day or night (fids-sun.js) is judged at the instant the clocks show', () => {
  const night = Date.parse('2026-10-12T06:40:00Z');              // 3:40 AM in Moncton
  let demo = false;
  const shown = (t, tz) => (demo ? BS.clockNow(new Date(t), tz).getTime() : t);
  const make = (extra) => FidsSun.create(Object.assign({ now: () => night, coords: () => YQM, tz: () => 'America/Moncton' }, extra || {}));
  // without the hook: the real hour
  assert.equal(make().isDay('YQM'), false);
  // with it, off: the real hour; on: 10:10, daylight
  const e = make({ shown: (t, tz) => { BS.setDemoClock(demo); try { return shown(t, tz); } finally { BS.setDemoClock(false); } } });
  assert.equal(e.isDay('YQM'), false, 'a board in an airport');
  demo = true;
  assert.equal(e.isDay('YQM'), true, 'a demo board at 3:40 AM is drawn for 10:10');
  assert.equal(e.isDay('YQM', night), false, 'a question about a given time keeps it');
  assert.equal(e.times('YQM').date, '2026-10-12', 'the astronomy is the real day\'s');
  // subscribers and the <html> classes follow it, and turn back when it ends
  const calls = [];
  e.subscribe('YQM', (d) => calls.push(d));
  assert.deepEqual(calls, [true]);
  demo = false; e.check('test');
  assert.deepEqual(calls, [true, false], 'live again: the real night');
  // ?daynight= still wins
  const held = make({ search: () => '?daynight=night', shown: () => Date.parse('2026-10-12T14:10:00Z') });
  assert.equal(held.isDay('YQM'), false);
});

test('the browser\'s hook asks the store each time, and is the real time without it', () => {
  const t = Date.parse('2026-10-12T06:40:00Z');
  const env = FidsSun.browserEnv({ document: {}, BoardStrings: BS });
  BS.setDemoClock(false);
  assert.equal(env.shown(t, 'America/Moncton'), t);
  BS.setDemoClock(true);
  try { assert.equal(new Date(env.shown(t, 'America/Moncton')).toISOString(), '2026-10-12T13:10:00.000Z', '10:10 ADT'); }
  finally { BS.setDemoClock(false); }
  assert.equal(FidsSun.browserEnv({ document: {} }).shown(t, 'America/Moncton'), t, 'no store on the page: the real time');
});

test('the weather card\'s "now" and the aircraft sky follow the clock shown', () => {
  const T = Date.parse('2026-10-12T13:10:00Z');                  // 10:10 ADT
  let shownTs = 0, asked = [];
  const sunAround = (c) => ({ sunrise: new Date(c - 3 * 3600000).toISOString(), sunset: new Date(c + 3 * 3600000).toISOString() });
  const wxNightAt = new Function('_fidsDemoShownTs', '_wxFetchSun', 'AP', extract(CORE, '_wxNightAt') + '; return _wxNightAt;')(
    () => shownTs, (ia, ts) => { asked.push(ts); return ts ? sunAround(T) : { sunrise: new Date(Date.now() + 3600000).toISOString(), sunset: new Date(Date.now() + 9 * 3600000).toISOString() }; }, {});
  // a board in an airport: the real now (here, an hour before sunrise)
  assert.equal(wxNightAt('YQM'), true);
  assert.equal(asked.pop(), undefined, 'asked for today, as before');
  // a demo board: 10:10, in daylight, and the sun times of that day
  shownTs = T;
  assert.equal(wxNightAt('YQM'), false);
  assert.equal(asked.pop(), T);
  // an hour on the card keeps its own time
  assert.equal(wxNightAt('YQM', T + 5 * 3600000), true, 'a given hour (after sunset) is not moved');
  // _fidsDemoShownTs: 0 on a live board; 10:10 at the board's own airport on a demo
  const doc = { getElementById: () => ({ value: 'YQM' }) };
  const shownFn = new Function('BoardStrings', 'document', 'window', 'AP', extract(CORE, '_fidsDemoShownTs') + '; return _fidsDemoShownTs;')(
    BS, doc, {}, { YQM: { tz: 'America/Moncton' } });
  BS.setDemoClock(false);
  assert.equal(shownFn(), 0);
  BS.setDemoClock(true);
  try {
    const s = new Date(shownFn());
    assert.equal(BS.boardTime(s, 'America/Moncton', { list: ['en'] }), '10:10 AM');
  } finally { BS.setDemoClock(false); }
  // the aircraft sky asks _wxNightAt (or the same instant when no airport is set)
  assert.match(extract(CORE, '_acSkyIsNight'), /_wxNightAt\(ia\)/);
  assert.match(extract(CORE, '_acSkyIsNight'), /if \(_dts && typeof _wxNightAt === 'function'\) return !!_wxNightAt\(ia, _dts\);/);
  // and the page is judged again the moment a demo starts, not 30 s later
  assert.match(extract(CORE, 'loadDemo'), /_fidsDemoClockChanged\(\);/);
  assert.match(extract(CORE, '_fidsDemoClockChanged'), /window\.fidsSun\.check\('demo-clock'\)/);
});
