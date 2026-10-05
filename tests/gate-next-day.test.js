'use strict';

// WHY THIS EXISTS
//
// v23935. A gate shows its next flight, and once tonight's has left that is
// usually tomorrow's. The gate printed tomorrow's times with no day anywhere,
// under a banner carrying today's date: on 2026-10-02 at 19:33, Moncton gate 1
// read "WS813 Calgary, On Time, Boarding 5:40pm, Departure 6:15pm" for the
// Oct 3 flight, while that evening's WS813 had left at 5:55pm. To anyone at
// the door it was tonight's flight, still on time, an hour and a half after it
// had gone. Nobody had said that.
//
// Every time on the gate that is not on the board's today now carries its day
// ("Tomorrow | Demain", French first in Québec; the weekday and date further
// out): the three rail times, the inbound's own arrival on the Your Aircraft
// card, the empty-stand map label (the day replaces its clock) and the phone
// layout. At the airport's midnight the gate repaints once, so the line never
// outlives the day it was true on. The helper's own rules are in
// tests/gate-date-context.test.js; this pins the gate's use of them.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const gateDate = require(path.join(root, 'fids-current', 'js', 'gate-date-context.js'));

function fnSource(name) {
  const i = CORE.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1);
}
// A Date whose now() is the moment under test; everything else is Date's.
function clockAt(ms) {
  class D extends Date { constructor(...a) { super(...(a.length ? a : [ms])); } static now() { return ms; } }
  return D;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function gateDay(nowMs, langs) {
  const win = { FIDSGateDate: gateDate };
  return new Function('window', 'langs', 'fidsEscHtml', 'Date',
    fnSource('_gateDayWords') + '\n' + fnSource('_gateDayLineHtml') + '\nreturn { words: _gateDayWords, line: _gateDayLineHtml };')(win, langs, esc, clockAt(nowMs));
}

const AT_1933 = Date.parse('2026-10-02T22:33:00Z');         // Moncton, Oct 2 19:33 ADT
const WS813_OCT3 = Date.parse('2026-10-03T21:15:00Z');      // Oct 3 6:15pm ADT
const WS813_OCT2 = Date.parse('2026-10-02T21:15:00Z');      // Oct 2 6:15pm ADT

test('tomorrow\'s departure carries its day; today\'s carries none', () => {
  const g = gateDay(AT_1933, ['en', 'fr']);
  const dw = g.words(WS813_OCT3, 'America/Moncton', false);
  assert.equal(dw.text, 'Tomorrow | Demain');
  // each word carries its language (an Arabic 'tomorrow' reads right to left)
  assert.deepEqual(dw.languages, ['en', 'fr']);
  assert.equal(g.line(dw),
    '<span class="v2-fi-dayline" data-day-offset="1"><span class="v2-fi-day-w" lang="en">Tomorrow</span>'
    + '<span class="v2-fi-day-sep"> | </span><span class="v2-fi-day-w" lang="fr">Demain</span></span>');
  assert.equal(g.words(WS813_OCT2, 'America/Moncton', false), null, 'today: nothing to print');
  assert.equal(g.line(null), '');
  assert.equal(g.words(0, 'America/Moncton', false), null, 'no time, no day');
});

test('Québec reads French first, and a one-language board prints one word', () => {
  assert.equal(gateDay(AT_1933, ['en', 'fr']).words(Date.parse('2026-10-03T10:30:00Z'), 'America/Toronto', true).text, 'Demain | Tomorrow');
  assert.equal(gateDay(AT_1933, ['en']).words(WS813_OCT3, 'America/Moncton', false).text, 'Tomorrow');
});

test('the arrival is read in the zone it is printed in, against the board\'s today', () => {
  const g = gateDay(AT_1933, ['en', 'fr']);
  // Oct 3 7:54pm in Calgary on the Moncton board.
  assert.equal(g.words(Date.parse('2026-10-04T01:54:00Z'), 'America/Edmonton', false, 'America/Moncton').text, 'Tomorrow | Demain');
  // Tonight's 11:30pm in Calgary: already Oct 3 in Moncton, still Oct 2 where it is printed.
  assert.equal(g.words(Date.parse('2026-10-03T05:30:00Z'), 'America/Edmonton', false, 'America/Moncton'), null);
});

test('the three rail times each carry their own day line, inside the value the fitter sizes', () => {
  assert.match(CORE, /function _shelf\(icon, en, second, val, valCls, rowCls, under, foot\)/);
  assert.match(CORE, /'<div class="v2-fi-value ' \+ \(valCls \|\| ''\) \+ '">' \+ val \+ \(under \|\| ''\) \+ '<\/div>'/);
  // v23968 — the airline's gate-close line is the card's footer, outside the
  // value (gate-close-time.test.js); the day line stays inside it.
  assert.match(CORE, /_shelf\(_badge\(_svgBoarding\)[^\n]*_gateDayLineHtml\(vars && vars\.dayBoard\), _gcl\)/);
  assert.match(CORE, /_shelf\(_badge\(_svgDepart\)[^\n]*_gateDayLineHtml\(vars && vars\.dayDepart\)\)/);
  // v23946 — the Arrival's day line is followed by the destination's terminal
  // and arrival gate (tests/gate-arrival-from-destination.test.js).
  assert.match(CORE, /_shelf\(_badge\(_svgArrive\)[^\n]*_gateDayLineHtml\(vars && vars\.dayArrive\) \+ \(\(vars && vars\.arrPlace\) \|\| ''\)\)/);
  const uxg = fnSource('uxgGateHtml');
  assert.match(uxg, /dayBoard: _dayBoard, dayDepart: _dayDepart, dayArrive: _dayArrive/);
  // Each is the time AS PRINTED: the boarding time, the airport's revised
  // departure when that is the one shown, the arrival in its own zone.
  assert.match(uxg, /var _dayBoard = _gateDayWords\(\(typeof boardTs === 'number'\) \? boardTs : 0, tz, _frF\);/);
  assert.match(uxg, /var _dayDepart = _gateDayWords\(\(String\(depTimeHtml\)\.indexOf\('g8-r2-revised'\) !== -1 && currentFlight\._revTs\) \|\| currentFlight\._sortTs, tz, _frF\);/);
  assert.match(uxg, /var _dayArrive = _gateDayWords\(_arrShownTs, ctx\.arrTz \|\| tz, _frF, tz\);/);
  // The printed arrival is the destination airport's own time, worked out in
  // renderDedicatedScreen with its instant (tests/gate-arrival-from-destination.test.js).
  assert.match(uxg, /var _arrShownTs = Number\(ctx\.arrInstant\) \|\| 0;/);
  assert.doesNotMatch(uxg, /_arrShownTs\s*\+=/, 'the arrival\'s day is the printed time\'s, moved once');
  // The arrival's instant comes from where its time is worked out, on both
  // layouts.
  const render = fnSource('renderDedicatedScreen');
  assert.match(render, /renderMobileGateHtml\(\{[^}]*arrInstant: _arrInstant, arrTz: arrTz \}\)/);
  assert.match(render, /uxgGateHtml\(\{[^}]*arrInstant: _arrInstant, arrTz: arrTz \}\)/);
  // The old, unpainted date context is gone rather than left half-wired.
  assert.doesNotMatch(CORE, /flightDateContext|getFlightDateContext/);
});

test('the Your Aircraft card dates the inbound by the time it prints first', () => {
  assert.match(CORE, /var _dwI = _gateDayWords\(_ibShownTs, vars\.tz, _frF\);\s*return _dwI \? '<div class="v2-fi-mline2">' \+ _gateDayLineHtml\(_dwI\) \+ '<\/div>' : '';\s*\}\)\(\)/);
  // v23940 — the card is one string concatenation again (v23934's line list
  // is gone), so the day line is joined with '+' between the time line and
  // the status line. A comma there ends the card after its time line: the
  // assignment takes everything before it, and the status line and the
  // card's closing tags are thrown away.
  const card = CORE.slice(CORE.indexOf("'<div class=\"v2-rc-shelf v2-rc-shelf-fi v2-rc-shelf-fi4 v2-rc-shelf-asleft\">'"));
  const M3 = "'<div class=\"v2-fi-mline3\">'";
  const tail = card.slice(0, card.indexOf(M3) + M3.length);
  assert.ok(tail.length > 1 && tail.indexOf('_gateDayLineHtml(_dwI)') > 0, 'the day line sits between the time line and the status line');
  const code = tail.replace(/\/\/[^\n]*/g, '');
  assert.match(code, /: ''\)\)\)\s*\+\s*\(function \(\) \{/, 'the time line is joined to the day line with +');
  assert.match(code, /\}\)\(\)\s*\+\s*'<div class="v2-fi-mline3">'/, 'and the day line to the status line');
  // A plain mline2, so the card's line fitter sizes it with the time above it.
  const fitter = CORE.slice(CORE.indexOf("root.querySelectorAll('.gad-map-col-v2 .v2-rc-shelf-asleft .v2-fi-value')"));
  assert.match(fitter.slice(0, 400), /val\.querySelectorAll\('\.v2-fi-mline1, \.v2-fi-mline2, \.v2-fi-mline3'\)/);
  // Each condition is the one that prints that time: the revised/scheduled
  // pair for an inbound still to come, _mcEvtStr once it is down.
  assert.match(CORE, /var _ibShownTs = _gateInboundShownTs\(\{\s*arrived: _stKey === 'arrived',\s*onStandAt: \(_mcOnStand && _ib && typeof _ib\._actualArrTime === 'number'\) \? _ib\._actualArrTime : 0,\s*sched: _ibArrTs, rev: _ibRevTs,\s*revShown: \(_stKey === 'arrived'\) \? !!_ibArrRevStr : !!\(_ibArrRevStr && _ibArrRevStr !== _ibArrSchedStr\)\s*\}\);/);
  assert.match(CORE, /\(_stKey === 'arrived' \? '' : \(_ibArrRevStr && _ibArrRevStr !== _ibArrSchedStr\s*\? '<div class="v2-fi-mline2">'\s*\+ '<span class="v2-rc-status-' \+ \(_stCls \|\| 'delayed'\) \+ '">' \+ _railT\(_ibArrRevStr\)/,
    'the revised time is printed first under exactly the condition revShown repeats');
  assert.match(CORE, /if \(_mcOnStand && _ib && typeof _ib\._actualArrTime === 'number' && _ib\._actualArrTime > 0\) \{\s*_mcEvtStr = _ibFmtT\(_ib\._actualArrTime\);\s*\} else \{\s*_mcEvtStr = _ibArrRevStr \|\| _ibArrSchedStr \|\| '';/);
  assert.doesNotMatch(CORE, /_gateDayWords\(_ibEffArrTs/, 'the later-of-the-two rule is not a day source');
});

test('an early inbound that crosses midnight is tonight\'s, not tomorrow\'s', () => {
  // YQM gate 4, 21:35 ADT on Oct 2, live and unrewritten: AC1986 from
  // Toronto is due at 12:03am on Oct 3 and the feed says "Early at 11:45 PM".
  // The card prints "11:45pm | 12:03am Revised"; the day under it must be the
  // day of 11:45pm, which is tonight.
  const AT_2135 = Date.parse('2026-10-03T00:35:00Z');        // Oct 2 21:35 ADT
  const AC1986_SCHED = Date.parse('2026-10-03T03:03:00Z');   // Oct 3 12:03am ADT
  const AC1986_REV = Date.parse('2026-10-03T02:45:00Z');     // Oct 2 11:45pm ADT
  const shown = new Function(fnSource('_gateInboundShownTs') + '\nreturn _gateInboundShownTs;')();
  const g = gateDay(AT_2135, ['en', 'fr']);
  const day = (o) => g.words(shown(o), 'America/Moncton', false);

  const early = { arrived: false, onStandAt: 0, sched: AC1986_SCHED, rev: AC1986_REV, revShown: true };
  assert.equal(shown(early), AC1986_REV, 'the revised time is printed first, so it is the one dated');
  assert.equal(day(early), null, '11:45pm tonight: no day line');
  // The rule this replaces read the later of the two, the 12:03am schedule,
  // and printed "Tomorrow | Demain" under a time that is tonight.
  assert.equal(g.words(Math.max(AC1986_SCHED, AC1986_REV), 'America/Moncton', false).text, 'Tomorrow | Demain');

  // The mirror case still dates forward: due 11:45pm, revised to 12:10am.
  const late = { arrived: false, onStandAt: 0, sched: AC1986_REV, rev: Date.parse('2026-10-03T03:10:00Z'), revShown: true };
  assert.equal(day(late).text, 'Tomorrow | Demain', 'a late revision past midnight is tomorrow\'s');
  // Not revised: the schedule is the time printed, and the time dated.
  assert.equal(day({ arrived: false, sched: AC1986_SCHED, rev: 0, revShown: false }).text, 'Tomorrow | Demain');
  assert.equal(shown({ arrived: false, sched: AC1986_SCHED, rev: AC1986_REV, revShown: false }), AC1986_SCHED);
  // Down and on stand: the gate time is the one printed.
  const gateAt = Date.parse('2026-10-03T02:52:00Z');
  assert.equal(shown({ arrived: true, onStandAt: gateAt, sched: AC1986_SCHED, rev: AC1986_REV, revShown: true }), gateAt);
  assert.equal(shown({ arrived: true, onStandAt: 0, sched: AC1986_SCHED, rev: AC1986_REV, revShown: true }), AC1986_REV);
  assert.equal(shown(null), 0);
});

test('the empty-stand label says the day instead of the clock, never both', () => {
  const LBL = { from: { en: 'From', fr: 'De', ar: 'من' }, to: { en: 'To', fr: 'À', ar: 'إلى' } };
  const note = (nowMs, at, langs) => new Function('window', 'langs', '_GATE_LBL', 'frFirstAirport', 'AP', '_fidsClockForLang', '_gateMapCity', 'Date',
    'return (' + fnSource('_gateMapNote') + ')')(
    { _gateIata: 'YQM', FIDSGateDate: gateDate }, langs, LBL, () => false, { YQM: { tz: 'America/Moncton' } },
    (d, tz, lg) => (lg === 'fr' ? '17:20' : '5:20pm'), () => 'Calgary', clockAt(nowMs))({ leg: 'in', other: 'YYC', at });
  // each half is marked with its language, so an Arabic one reads right to
  // left, and is one whole phrase (fx-unit) with a bar the fitter drops when
  // the pair stacks (fx-brk)
  const pairOf = (a, b) => '<span class="bs-h fx-unit" lang="en">' + a + '</span> <span class="bs-sep fx-brk">|</span> <span class="bs-h fx-unit" lang="fr">' + b + '</span>';
  assert.equal(note(AT_1933, Date.parse('2026-10-03T20:20:00Z'), ['en', 'fr']), pairOf('From Calgary · Tomorrow', 'De Calgary · Demain'));
  assert.equal(note(AT_1933, Date.parse('2026-10-02T20:20:00Z'), ['en', 'fr']), pairOf('From Calgary · 5:20pm', 'De Calgary · 17:20'));
  assert.match(note(AT_1933, Date.parse('2026-10-02T20:20:00Z'), ['ar']), /^<span class="bs-h fx-unit" lang="ar" dir="rtl">/);
});

test('at the airport\'s midnight a gate with a day line repaints once, and one without is left alone', () => {
  const tick = fnSource('updateDedicatedTimeOnly');
  assert.match(tick, /const _pDay = window\._gatePaintedDay;/);
  assert.match(tick, /document\.querySelector\('#gateView \.v2-fi-dayline'\)/);
  assert.match(tick, /if \(_dNow !== null && _dNow !== _pDay\.d\) \{ _pDay\.d = _dNow; requestGateRebuild\(\); \}/);
  // Both layouts note the day they were painted on.
  assert.match(fnSource('uxgGateHtml'), /_gateNotePaintedDay\(tz\);/);
  assert.match(fnSource('renderMobileGateHtml'), /_gateNotePaintedDay\(tz\);/);
  // The gate key itself stays free of a day term (gate-stability.test.js):
  // the repaint is asked for only when a day line is actually on screen.
});

test('the phone layout dates its departure, arrival and next flight the same way', () => {
  const m = fnSource('renderMobileGateHtml');
  assert.match(m, /const _mDayDep = _gateDayWords\(\(isRevised && currentFlight\._revTs\) \|\| currentFlight\._sortTs, tz, _mFrF\);/);
  assert.match(m, /const _mDayArr = _gateDayWords\(Number\(ctx\.arrInstant\) \|\| 0, ctx\.arrTz \|\| tz, _mFrF, tz\);/);
  assert.match(m, /_gateDayLineHtml\(_mDayDep\)/);
  assert.match(m, /_gateDayLineHtml\(_mDayArr\)/);
  assert.match(m, /_gateDayWords\(nextFlight\._sortTs, tz, _mFrF\)/);
});

test('the phone layout escapes its gate number, which can come from the test-flight form', () => {
  // gateVal falls back to subScreenVal, which submitTestFlight() sets from the
  // form's typed gate. CodeQL js/xss-through-dom traced that input into this
  // markup once the phone layout's render call changed in v23935.
  const m = fnSource('renderMobileGateHtml');
  assert.match(m, /\+ fidsEscHtml\(gateVal\) \+/);
  assert.doesNotMatch(m, /'>' \+ gateVal \+ '</);
});

test('the amber "+1" after an overnight arrival is gone: the day line says it, in the time\'s own ink', () => {
  assert.doesNotMatch(CORE, /color:#eab308;font-weight:700;">\+1</);
  const at = CSS.indexOf('v23935 — THE DAY UNDER A GATE TIME THAT IS NOT TODAY');
  assert.ok(at >= 0, 'the day-line block exists');
  const block = CSS.slice(at, CSS.indexOf('.v2-fi-day-sep { opacity', at) + 60);
  assert.match(block, /\.v2-fi-value\.v2-fi-time \.v2-fi-dayline \{[^}]*display: block !important;[^}]*font-size: \.3em !important;[^}]*white-space: nowrap !important;[^}]*color: inherit !important;/);
  assert.doesNotMatch(block, /#(?:eab308|fbbf24|f59e0b|d97706|b91c1c|dc2626)|amber|animation|transition/i,
    'a day is not a status: no status colour, nothing moving');
});

test('no repair pass rewrites the day line — or anything else — after render', () => {
  // The V9 "visual-label repair" pass turned any lone "Tomorrow" into the
  // rotating language's word, which printed "Demain | Demain" on a
  // French-first Montréal gate. It is gone; the board-languages guard (B13)
  // fails any timer that sweeps the page and rewrites its text.
  assert.doesNotMatch(CORE, /function fixVisibleGateLabels/);
  assert.doesNotMatch(CORE, /\[\/\^Tomorrow\$\/i, \{en:'Tomorrow', fr:'Demain'\}\]/);
});

test('the departures board\'s "+1" day marker is white and can be seen, never the delayed amber', () => {
  // A day is not a status. The marker was inline amber (#fbbf24), and the
  // alternate rows' white-ink rule repainted it, so one column showed it in
  // two colours. v23935 gave it the row's ink at 55%, a speck beside the time;
  // v23968 makes it a pill you can see: bold white on its own dark ground in a white ring,
  // the same on every row and theme, inline !important so no row rule
  // repaints it. It hangs off the time (absolutely positioned in an
  // inline-block host), so it takes no width in the line and the cell's
  // text-overflow can never drop it — the first draft's laid-out pill made "12:20 PM"
  // overflow its 185px cell and the ellipsis took the marker.
  assert.match(CORE, /'<span class="fids-dayplus-host" style="' \+ FIDS_DAYPLUS_HOST \+ '">' \+ fmt12\(f\.time\) \+ '<sup class="fids-dayplus" style="' \+ FIDS_DAYPLUS_STYLE \+ '">\+' \+ diffDays \+ '<\/sup><\/span>'/);
  const h = CORE.match(/const FIDS_DAYPLUS_HOST = ('[^']*');/);
  assert.ok(h, 'FIDS_DAYPLUS_HOST is declared');
  assert.match(h[1], /position:relative !important;display:inline-block !important;/);
  const m = CORE.match(/const FIDS_DAYPLUS_STYLE = ([^;]*(?:;[^;]*)*?);\n/);
  assert.ok(m, 'FIDS_DAYPLUS_STYLE is declared');
  const style = new Function('return ' + m[1])();
  assert.match(style, /(^|;)color:#ffffff !important;/);
  assert.match(style, /-webkit-text-fill-color:#ffffff !important;/);
  assert.match(style, /border:[^;]*solid #ffffff !important;/);
  assert.match(style, /background:rgba\(10,16,30,0\.9\) !important;/);
  assert.match(style, /position:absolute !important;left:100% !important;/, 'hangs off the time: no width in the line');
  // Big enough to read (0.72em of the time, the "+1" about 20px at 1680x1050)
  // and small enough to stay inside the cell at every board size: measured on
  // the Moncton board, the pill's right edge against the cell's was 1237/1255
  // at 1680x1050, 1382/1422 at 1920x1080, 920/938 at 1280x720 and 734/761 at
  // 1024x768, never clipped.
  const fs = parseFloat(style.match(/font-size:([\d.]+)em/)[1]);
  assert.ok(fs >= 0.7 && fs <= 0.75, 'font-size ' + fs + 'em');
  // No status colour anywhere in it: not amber, red or green.
  assert.doesNotMatch(style, /#fbbf24|#f59e0b|#b45309|#d82f2e|#dc2626|#d42341|#22c55e|#16a34a|#10b981|#2fd467/i);
  for (const decl of style.split(';').filter(Boolean)) assert.match(decl, /!important$/, decl);
  assert.doesNotMatch(CORE, /<sup style="font-size:0\.55em;color:#fbbf24/);
  // The row-ink pass judges a cell's ink against the row's ground; the pill
  // has its own, so it is left alone (on a yellow Delayed row its white was
  // repainted dark onto the dark pill).
  assert.match(CORE, /if \(el\.closest && el\.closest\('\.fids-dayplus'\)\) continue;/);
});
