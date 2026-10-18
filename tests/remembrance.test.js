'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 11 NOVEMBER, BY EACH AIRPORT'S OWN COUNTRY (fids-current/js/remembrance.js)
//
// Canada and Australia keep Remembrance Day, the United Kingdom Armistice Day
// and Remembrance Sunday, the United States Veterans Day; every other country
// nothing. All day: the poppy beside the airport's logo and in the gate's
// cream, the day's name in the gate's date bar (a flag pin and a laurel
// wreath in the United States). At 11:00 on the airport's own clock, two
// minutes of silence (one in Australia, none in the United States): the
// floor under the departures and the gate's centre screen go black with the
// poppy and the silence words, and anything that is the passenger's business
// wins over the card. A switch per country; Canada and the United Kingdom
// ship off (the poppy is a registered trademark there).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const B = require(path.join(ROOT, 'fids-current/js/board-strings.js'));
globalThis.BoardStrings = B;
const R = require(path.join(ROOT, 'fids-current/js/remembrance.js'));
const SRC = read('fids-current/js/remembrance.js');
const CORE = read('fids-current/js/fids-core.js');
const CSS = read('fids-current/css/remembrance.css');

function fn(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name);
  return CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
}

// the roster's own airport → country table, as the board reads it
const COUNTRY_SRC = CORE.slice(CORE.indexOf('const _IATA_CC_GROUPS = {'), CORE.indexOf('\n}\n', CORE.indexOf('function airportCountry(')) + 2);
const airportCountry = new Function(COUNTRY_SRC + 'return airportCountry;')();
// every airport on the roster, with its zone
const AP = new Function(CORE.slice(CORE.indexOf('const AP = {'), CORE.indexOf('\n};\n', CORE.indexOf('const AP = {')) + 3) + 'return AP;')();

const HELPERS = () => fn('fidsLocalDateKey') + fn('_fidsAirportYmd') + fn('_fidsHolidayFor');
const holidayWith = (search, withRem = true) => new Function('AP', 'location', 'FidsRemembrance', 'airportCountry', HELPERS() + 'return _fidsHolidayFor;')(
  AP, { search: search || '' }, withRem ? R : undefined, airportCountry);

test('the switch: Canada and the United Kingdom ship off, Australia and the United States on', () => {
  assert.deepEqual(R.SWITCH, { CA: false, GB: false, AU: true, US: true });
  assert.match(SRC, /var SWITCH = \{ CA: false, GB: false, AU: true, US: true \};/);
  // the reason sits beside it
  assert.match(SRC, /registered\s+trademark in Canada \(the Royal Canadian Legion\)/);
});

test('who keeps which day: 11 November, and the second Sunday of November in the United Kingdom', () => {
  assert.equal(R.secondSunday(2026), 8);
  assert.equal(R.secondSunday(2027), 14);
  assert.equal(R.secondSunday(2028), 12);
  assert.equal(R.secondSunday(2029), 11);
  assert.equal(R.dayKey('remembrance-ca', 2026, 11, 11), 'remembranceDay');
  assert.equal(R.dayKey('remembrance-au', 2026, 11, 11), 'remembranceDay');
  assert.equal(R.dayKey('remembrance-gb', 2026, 11, 11), 'armisticeDay');
  assert.equal(R.dayKey('remembrance-gb', 2026, 11, 8), 'remembranceSunday');
  assert.equal(R.dayKey('remembrance-gb', 2029, 11, 11), 'remembranceSunday', 'the Sunday when the two fall together');
  assert.equal(R.dayKey('veterans-us', 2026, 11, 11), 'veteransDay');
  for (const look of Object.keys(R.LOOKS)) {
    assert.equal(R.dayKey(look, 2026, 11, 10), '', look + ' 10 Nov');
    assert.equal(R.dayKey(look, 2026, 11, 12), '', look + ' 12 Nov');
    assert.equal(R.dayKey(look, 2026, 10, 11), '', look + ' 11 Oct');
  }
  assert.equal(R.dayKey('remembrance-ca', 2026, 11, 8), '', 'Remembrance Sunday is the United Kingdom\'s only');
  // with every switch on
  assert.equal(R.lookFor('CA', 2026, 11, 11, true), 'remembrance-ca');
  assert.equal(R.lookFor('GB', 2026, 11, 8, true), 'remembrance-gb');
  assert.equal(R.lookFor('UK', 2026, 11, 11, true), 'remembrance-gb');
  assert.equal(R.lookFor('AU', 2026, 11, 11, true), 'remembrance-au');
  assert.equal(R.lookFor('US', 2026, 11, 11, true), 'veterans-us');
  for (const cc of ['IE', 'CH', 'IS', 'FR', 'BE', 'DE', 'MX', '']) assert.equal(R.lookFor(cc, 2026, 11, 11, true), '', cc || 'no country');
  // and as shipped
  assert.equal(R.lookFor('CA', 2026, 11, 11), '');
  assert.equal(R.lookFor('GB', 2026, 11, 11), '');
  assert.equal(R.lookFor('AU', 2026, 11, 11), 'remembrance-au');
  assert.equal(R.lookFor('US', 2026, 11, 11), 'veterans-us');
});

test('every airport on the roster gets its own country\'s look, and Dublin, Zurich and Keflavik none', () => {
  const want = { CA: 'remembrance-ca', GB: 'remembrance-gb', AU: 'remembrance-au', US: 'veterans-us' };
  const seen = {};
  for (const ap of Object.keys(AP)) {
    const cc = airportCountry(ap);
    const look = R.lookOf(cc);
    assert.equal(look, want[cc] || '', ap + ' (' + cc + ')');
    seen[cc] = (seen[cc] || 0) + 1;
  }
  for (const [ap, cc] of [['YQM', 'CA'], ['YUL', 'CA'], ['YYT', 'CA'], ['DCA', 'US'], ['LHR', 'GB'], ['EDI', 'GB'], ['HBA', 'AU'], ['DUB', 'IE'], ['ZRH', 'CH'], ['KEF', 'IS']]) {
    assert.equal(airportCountry(ap), cc, ap);
  }
  assert.equal(R.lookOf('IE'), '');
  assert.equal(R.lookOf('CH'), '');
  assert.equal(R.lookOf('IS'), '');
  assert.ok(seen.CA > 10 && seen.US > 10, 'the roster has its Canadian and American airports');
});

test('the holiday engine stamps the look on the airport\'s own day, by its switch', () => {
  const h = holidayWith('');
  // Washington, 11 November 2026 local, all day
  assert.equal(h('DCA', new Date('2026-11-11T05:00:00Z')), 'veterans-us', '00:00 EST');
  assert.equal(h('DCA', new Date('2026-11-12T04:59:00Z')), 'veterans-us', '23:59 EST');
  assert.equal(h('DCA', new Date('2026-11-12T05:00:00Z')), '');
  assert.equal(h('DCA', new Date('2026-11-11T04:59:00Z')), '', '23:59 on the 10th');
  // Hobart: 11 November starts at 13:00Z on the 10th (AEDT, UTC+11)
  assert.equal(h('HBA', new Date('2026-11-10T13:00:00Z')), 'remembrance-au');
  assert.equal(h('HBA', new Date('2026-11-10T12:59:00Z')), '');
  // Canada and the United Kingdom: off until permission is in hand
  assert.equal(h('YQM', new Date('2026-11-11T15:00:00Z')), '');
  assert.equal(h('YUL', new Date('2026-11-11T16:00:00Z')), '');
  assert.equal(h('LHR', new Date('2026-11-11T11:00:00Z')), '');
  assert.equal(h('LHR', new Date('2026-11-08T11:00:00Z')), '');
  // no look at all there
  for (const ap of ['DUB', 'ZRH', 'KEF']) assert.equal(h(ap, new Date('2026-11-11T11:00:00Z')), '', ap);
  // Thanksgiving still comes first in October, Canada only
  assert.equal(h('YQM', new Date('2026-10-12T15:00:00Z')), 'thanksgiving-ca');
  assert.equal(h('DCA', new Date('2026-10-12T15:00:00Z')), '');
  // without the module, the engine is as it was
  assert.equal(holidayWith('', false)('DCA', new Date('2026-11-11T15:00:00Z')), '');
});

test('?holiday=remembrance previews the airport\'s own country\'s look, whatever its switch', () => {
  const at = new Date('2026-10-18T15:00:00Z');
  assert.equal(holidayWith('?holiday=remembrance')('YQM', at), 'remembrance-ca');
  assert.equal(holidayWith('?holiday=remembrance')('YUL', at), 'remembrance-ca');
  assert.equal(holidayWith('?holiday=remembrance')('LHR', at), 'remembrance-gb');
  assert.equal(holidayWith('?holiday=remembrance')('HBA', at), 'remembrance-au');
  assert.equal(holidayWith('?holiday=remembrance')('DCA', at), 'veterans-us');
  for (const ap of ['DUB', 'ZRH', 'KEF']) assert.equal(holidayWith('?holiday=remembrance')(ap, at), '', ap);
  assert.equal(holidayWith('?holiday=veterans-us')('YQM', at), 'veterans-us', 'an id previews that look');
  assert.equal(holidayWith('?holiday=none')('DCA', new Date('2026-11-11T15:00:00Z')), '');
});

test('the silence: from 11:00:00 on the airport\'s own clock, two minutes (one in Australia, none in the United States)', () => {
  const up = (look, iso, tz) => R.silenceUp(look, R.wall(Date.parse(iso), tz));
  // Moncton, AST (UTC-4)
  assert.equal(up('remembrance-ca', '2026-11-11T14:59:59Z', 'America/Moncton'), false, '10:59:59');
  assert.equal(up('remembrance-ca', '2026-11-11T15:00:00Z', 'America/Moncton'), true, '11:00:00');
  assert.equal(up('remembrance-ca', '2026-11-11T15:01:59Z', 'America/Moncton'), true, '11:01:59');
  assert.equal(up('remembrance-ca', '2026-11-11T15:02:00Z', 'America/Moncton'), false, '11:02:00');
  // St. John's keeps it at 11:00 NST (UTC-3:30)
  assert.equal(up('remembrance-ca', '2026-11-11T14:30:30Z', 'America/St_Johns'), true);
  assert.equal(up('remembrance-ca', '2026-11-11T14:29:59Z', 'America/St_Johns'), false);
  // Vancouver, PST
  assert.equal(up('remembrance-ca', '2026-11-11T19:00:10Z', 'America/Vancouver'), true);
  assert.equal(up('remembrance-ca', '2026-11-11T15:00:10Z', 'America/Vancouver'), false, '07:00 in Vancouver');
  // Hobart, AEDT (UTC+11): one minute
  assert.equal(up('remembrance-au', '2026-11-11T00:00:00Z', 'Australia/Hobart'), true);
  assert.equal(up('remembrance-au', '2026-11-11T00:00:59Z', 'Australia/Hobart'), true);
  assert.equal(up('remembrance-au', '2026-11-11T00:01:00Z', 'Australia/Hobart'), false);
  // London, both days
  assert.equal(up('remembrance-gb', '2026-11-08T11:01:00Z', 'Europe/London'), true, 'Remembrance Sunday');
  assert.equal(up('remembrance-gb', '2026-11-11T11:01:00Z', 'Europe/London'), true, 'Armistice Day');
  assert.equal(up('remembrance-gb', '2026-11-15T11:01:00Z', 'Europe/London'), false);
  // 11:00 in the evening is not the silence; nor the 12th
  assert.equal(up('remembrance-ca', '2026-11-12T03:00:30Z', 'America/Moncton'), false, '23:00');
  assert.equal(up('remembrance-ca', '2026-11-12T15:00:30Z', 'America/Moncton'), false, '12 Nov');
  // the United States keeps no silence on the boards
  assert.equal(up('veterans-us', '2026-11-11T16:00:30Z', 'America/New_York'), false);
  assert.deepEqual(Object.fromEntries(Object.entries(R.LOOKS).map(([k, v]) => [k, v.silence])), { 'remembrance-ca': 2, 'remembrance-gb': 2, 'remembrance-au': 1, 'veterans-us': 0 });
});

test('the airport\'s clock is read as numbers across midnight and noon', () => {
  assert.deepEqual(R.wall(Date.parse('2026-11-11T04:00:05Z'), 'America/Moncton'), { y: 2026, m: 11, d: 11, h: 0, mi: 0, s: 5 });
  assert.deepEqual(R.wall(Date.parse('2026-11-11T16:30:00Z'), 'America/Moncton'), { y: 2026, m: 11, d: 11, h: 12, mi: 30, s: 0 });
  assert.deepEqual(R.wall(Date.parse('2026-11-11T22:15:00Z'), 'America/Moncton'), { y: 2026, m: 11, d: 11, h: 18, mi: 15, s: 0 });
  assert.equal(R.instantOf(2026, 11, 11, 11, 0, 0, 'America/Moncton'), Date.parse('2026-11-11T15:00:00Z'));
  assert.equal(R.instantOf(2026, 11, 11, 11, 0, 0, 'Australia/Hobart'), Date.parse('2026-11-11T00:00:00Z'));
  assert.equal(R.instantOf(2026, 11, 11, 11, 0, 0, 'America/St_Johns'), Date.parse('2026-11-11T14:30:00Z'));
});

test('the preview moment (?holidayat=) takes a time on 11 November, or a full date', () => {
  assert.deepEqual(R.parseAt('11:00'), { y: 0, m: 0, d: 0, h: 11, mi: 0, s: 0 });
  assert.deepEqual(R.parseAt('11:00:30'), { y: 0, m: 0, d: 0, h: 11, mi: 0, s: 30 });
  assert.deepEqual(R.parseAt('1059'), { y: 0, m: 0, d: 0, h: 10, mi: 59, s: 0 });
  assert.deepEqual(R.parseAt('110230'), { y: 0, m: 0, d: 0, h: 11, mi: 2, s: 30 });
  assert.deepEqual(R.parseAt('2026-11-08T11:00'), { y: 2026, m: 11, d: 8, h: 11, mi: 0, s: 0 });
  for (const bad of ['', '25:00', '11:60', 'soon', '2026-13-01T11:00', '<b>']) assert.equal(R.parseAt(bad), null, bad);
  // it only ever runs under ?holiday=
  assert.match(SRC, /var PREVIEW_AT = PREVIEW \? parseAt\(param\('holidayat'\)\) : null;/);
  assert.match(SRC, /var PREVIEW = \(function \(\) \{ var q = param\('holiday'\); return !!q && q !== 'none'; \}\)\(\);/);
});

test('the day\'s name: its own day\'s, and the 11 November name in a preview on another day', () => {
  const w = (y, m, d) => ({ y, m, d, h: 10, mi: 10, s: 0 });
  assert.equal(R.dayKeyShown('remembrance-gb', w(2026, 11, 8), false), 'remembranceSunday');
  assert.equal(R.dayKeyShown('remembrance-gb', w(2026, 11, 11), false), 'armisticeDay');
  assert.equal(R.dayKeyShown('veterans-us', w(2026, 11, 11), false), 'veteransDay');
  assert.equal(R.dayKeyShown('remembrance-ca', w(2026, 10, 18), false), '');
  assert.equal(R.dayKeyShown('remembrance-ca', w(2026, 10, 18), true), 'remembranceDay');
});

test('a boarding call, a gate change, a cancellation and the lists always win over the gate\'s silence card', () => {
  const base = { media: true };
  assert.equal(R.gateCardMayShow(base), true);
  for (const k of ['takeover', 'gateChange', 'cancelled', 'lists', 'closing']) assert.equal(R.gateCardMayShow({ ...base, [k]: true }), false, k);
  assert.equal(R.gateCardMayShow({ media: false }), false, 'no centre screen, no card');
  // read from the gate itself: the takeover class (NOW BOARDING, FINAL CALL,
  // gate closed, the countdown), the gate-change notice, the flight's word,
  // and the centre deck's due cards
  assert.match(SRC, /takeover: !!\(wrap && wrap\.classList\.contains\('g8-takeover'\)\)/);
  assert.match(SRC, /document\.querySelectorAll\('\.gl-solo, \.gl-gc-title'\)/);
  assert.match(SRC, /window\._gatePaintedCd\.st/);
  assert.match(SRC, /_gateCardsDue\(_gateCardsLive\(\), Date\.now\(\)\)/);
  assert.match(SRC, /lists: !!\(due && due\.sbcard\)/);
  assert.match(SRC, /closing: !!\(due && due\.closecard\)/);
  // and the Later-at-this-gate strip under the window stays in view
  assert.match(SRC, /var strip = s\.mediaEl\.querySelector\('\.gl-strip'\);/);
});

test('the United States: a flag pin and a laurel wreath, never a poppy, never the flag beside the adverts', () => {
  const us = R.LOOKS['veterans-us'];
  assert.equal(us.board, 'flag', 'the flag pin on the departures banner');
  assert.equal(us.gate, 'wreath', 'the laurel wreath on the gate, the screen that carries the adverts');
  assert.equal(us.silence, 0);
  for (const id of ['remembrance-ca', 'remembrance-gb', 'remembrance-au']) {
    assert.equal(R.LOOKS[id].board, 'poppy', id);
    assert.equal(R.LOOKS[id].gate, 'poppy', id);
  }
  // the poppy on the silence layers only, and they need the silence
  assert.match(SRC, /if \(ctx\.silent && area && shown\(area\)\)/);
  assert.match(SRC, /if \(ctx\.silent\) \{\s*var s = gateState\(\);/);
});

test('11:00 on the card is the moment, as the board\'s own clock writes it', () => {
  assert.match(SRC, /var at = instantOf\(w\.y, w\.m, w\.d, 11, 0, 0, tz\);/);
  assert.match(SRC, /B\.boardTime\(new Date\(at\), tz\)/);
  B.setBoardLangs && B.setBoardLangs(['en', 'fr']);
  assert.equal(B.boardTime(new Date(R.instantOf(2026, 11, 11, 11, 0, 0, 'America/Moncton')), 'America/Moncton'), '11:00 AM');
});

test('every word is the store\'s, in all nine languages', () => {
  const keys = ['remembranceDay', 'armisticeDay', 'remembranceSunday', 'lestWeForget', 'silenceTwoMin', 'silenceOneMin', 'veteransDay'];
  for (const k of keys) {
    for (const l of B.LANGS) assert.ok(B.bs(k, l) && B.bs(k, l).trim(), k + ' ' + l);
    assert.ok(SRC.includes("'" + k + "'"), k + ' is used');
  }
  // government wording where it is published
  assert.equal(B.bs('remembranceDay', 'fr'), 'Jour du Souvenir');
  assert.equal(B.bs('lestWeForget', 'fr'), 'Nous nous souvenons');
  assert.equal(B.bs('silenceTwoMin', 'fr'), 'Deux minutes de silence');
  assert.equal(B.bs('veteransDay', 'en'), 'Veterans Day');
  // no word is written in the module or the stylesheet
  assert.doesNotMatch(CSS, /content:\s*['"][^'"]+['"]/);
  // each language its own unit, the board's pair, French first in Québec
  assert.match(SRC, /return B\.pairLangs\(null, ap\);/);
  assert.equal(B.pairLangs(['en', 'fr'], 'YUL')[0], 'fr');
});

test('nothing moves and nothing flashes', () => {
  const decl = [...CSS.matchAll(/(animation|transition)\s*:\s*([^;]+);/g)].map((m) => m[2].trim());
  for (const v of decl) assert.match(v, /^none !important$/, 'only ever switched off: ' + v);
  assert.doesNotMatch(CSS, /@keyframes/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(SRC, /\.style\.(transition|animation)\s*=/);
  // the silence layers sit outside every board's own markup, under the boot
  // loader (z-index 10000), so no repaint takes them away for a moment
  assert.match(CSS, /> \.rem-layer \{\s*position: fixed; z-index: 9000;/);
  assert.match(SRC, /cardMiss < 3/);
  // measured again only when the words or their room change, and styles
  // written only when they change, so a board that keeps the look all day
  // does no work for it most seconds
  assert.match(SRC, /if \(el\.__remFit === k\) return el\.__remFitOk;/);
  assert.match(SRC, /function put\(el, prop, v\) \{ if \(el\.style\[prop\] !== v\) el\.style\[prop\] = v; \}/);
  assert.match(SRC, /if \(!look && ap === lastAp && t - lastAsk < 30000 && t >= lastAsk\) return;/);
});

test('the pin is placed before the airport\'s mark, its logo or its code in letters', () => {
  assert.match(SRC, /edge\(band, '\.octb-apmark, \.octb-ap, \.octb-apsep, \.octb-clock', 'left'\)/);
  assert.match(SRC, /edge\(band, '\.g8-r1-logoslot img, \.g8-r1-logoslot svg, \.g8-r1-logoslot canvas', 'right'\)/);
  assert.match(SRC, /if \(h >= 24 && \(artR == null \|\| x0 >= artR \+ 24 \* k\)\)/, '24px clear of the airline\'s artwork, or not shown');
  // on the departures banner: beside the airport's logo, clear of the title
  assert.match(SRC, /var title = edge\(fb, '#hdrBoard > \*, \.fids-board-label > \*, \.fids-board-icon', 'right'\);/);
});

test('the pages load the look after the core, and the stylesheet with them', () => {
  for (const page of ['fids.html', 'gids.html']) {
    const html = read('fids-current/' + page);
    const core = html.indexOf('js/fids-core.js?v=');
    const rem = html.indexOf('js/remembrance.js?v=');
    assert.ok(core > 0 && rem > core, page);
    assert.ok(html.includes('css/remembrance.css?v='), page);
  }
});

test('the stand-in art: three plain vector files, named for the licensed files that replace them', () => {
  const dir = path.join(ROOT, 'fids-current/holidays/remembrance');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['poppy.svg', 'us-flag.svg', 'wreath.svg']);
  for (const f of ['poppy.svg', 'us-flag.svg', 'wreath.svg']) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(svg.length < 20000, f + ' stays small (' + svg.length + ')');
    assert.match(svg, /^<svg [^>]*viewBox="[^"]+"[^>]*><!-- STAND-IN ART/, f + ' says it is a stand-in');
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=|\son[a-z]+=/i, f + ' is plain vector art');
    assert.ok(SRC.includes("'/holidays/remembrance/" + f + "'"), f + ' is the file the look draws');
  }
  const doc = read('docs/licenses/remembrance-art.md');
  for (const f of ['poppy.svg', 'us-flag.svg', 'wreath.svg']) assert.ok(doc.includes('`' + f + '`'), f + ' is in the licence note');
  assert.match(doc, /Royal Canadian Legion/);
  assert.match(doc, /Royal British Legion/);
});

// The Thanksgiving layers are made for thanksgiving-ca only: under any other
// look they sat unstyled in the gate's flow (the bouquet squashed the gate
// by about 172px).
test('a look other than Thanksgiving makes none of Thanksgiving\'s layers', () => {
  const run = (holiday) => {
    let made = 0;
    const host = { querySelector: () => null, insertBefore: () => {}, appendChild: () => {} };
    const doc = {
      body: { dataset: { fidsHoliday: holiday }, getAttribute: () => '' },
      querySelectorAll: (sel) => (sel === '.g8-r1' ? [] : [host]),
      querySelector: () => null,
      getElementById: () => null,
      createElement: () => { made++; return { className: '', setAttribute: () => {} }; }
    };
    const L = new Function('document', CORE.match(/var _HOLIDAY_LAYERS = \[[\s\S]*?\n\];/)[0] + fn('_fidsHolidayLayers') + 'return _fidsHolidayLayers;')(doc);
    L();
    return made;
  };
  assert.ok(run('thanksgiving-ca') > 0, 'Thanksgiving makes its layers');
  for (const look of ['remembrance-ca', 'remembrance-gb', 'remembrance-au', 'veterans-us', 'remembrance']) assert.equal(run(look), 0, look);
});
