'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE HOTEL LISTS (fids-current/js/hotel-list-card.js, data/hotels/*.json)
//
// Free guest information by area in the centre deck of a gate whose flight
// goes to a city with a checked list (Moncton, Charlottetown, Halifax,
// Fredericton): Airport,
// Downtown, Nearby hotels and Resorts worth the drive, five lines a card, the
// rest on the next passes, the logo on the cream of a light card, a shuttle mark only
// where it is verified, nothing closed for the season, one scan code a card
// to the whole list in the phone app. The Accor pages and the page of the
// Algonquin Resort are separate slides and stay as they are.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'fids-current');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const B = require(path.join(SITE, 'js/board-strings.js'));
const H = require(path.join(SITE, 'js/hotel-list-card.js'));
const SRC = read('fids-current/js/hotel-list-card.js');
const CSS = read('fids-current/css/hotel-list-card.css');
const CORE = read('fids-current/js/fids-core.js');
const GIDS = read('fids-current/gids.html');
const APP = read('fids-current/app.html');
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
const KEYS = ['hotelsAirport', 'hotelsDowntown', 'hotelsNearby', 'hotelsResorts', 'hotelShuttle', 'hotelListScan', 'hotelsInCity', 'hotelCall', 'credOsmLine', 'hotelsFindScan', 'hotelsMapGoogle', 'hotelsMapApple'];
// the checked list of each city (every fact with its source and verified mark), kept out of the
// site, and the slim copy the site serves, made from it by scripts/hotels/build-runtime.js
const RT = require(path.join(ROOT, 'scripts/hotels/build-runtime.js'));
// every city of the one list (HotelListCard.CITIES), the checked file and the slim copy of each
const DOCS = {};
const RUN = {};
for (const C of H.CITIES) {
  DOCS[C] = JSON.parse(read('scripts/hotels/data/' + C.toLowerCase() + '.json'));
  RUN[C] = JSON.parse(read('fids-current/data/hotels/' + C.toLowerCase() + '.json'));
  H.put(C, RUN[C]);
}
// a day at noon on the machine's own calendar (no board: the module reads the date's own fields)
const day = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);
const NOV16 = day(2026, 11, 16);

// The module reads the board through the global object: a gate is set up on
// it for one check and taken away again.
function onGate(g, run) {
  const names = ['_gateIata', '_gateCurrentFlight', '_flightLegs', 'BoardStrings', 'frFirstAirport', '_gateMapCity', '_gateAccorPass', 'location', 'airportCityNameSafe_v21877',
    '_IATA_CC', 'airportCountry', '_rowRegion', 'QRCode', 'getComputedStyle', '_axrPageSync'];
  const keep = {};
  names.forEach((n) => { keep[n] = Object.getOwnPropertyDescriptor(globalThis, n); });
  try {
    names.forEach((n) => { try { delete globalThis[n]; } catch (e) {} });
    Object.keys(g).forEach((n) => { Object.defineProperty(globalThis, n, { value: g[n], configurable: true, writable: true }); });
    return run();
  } finally {
    names.forEach((n) => { try { delete globalThis[n]; } catch (e) {} if (keep[n]) Object.defineProperty(globalThis, n, keep[n]); });
  }
}
const CITY_NAMES = { YQM: 'Moncton', YYG: 'Charlottetown', YHZ: 'Halifax', YFC: 'Fredericton' };
const gate = (extra) => Object.assign({ BoardStrings: B, _gateIata: 'YYZ', _gateMapCity: (c) => CITY_NAMES[c] || c }, extra || {});
const build = (city, L, o) => onGate(gate(), () => H.build(RUN[city], L, Object.assign({ date: NOV16, home: 'YYZ' }, o || {})));
const views = (html) => html.split('<div class="axr-page hlc-view').slice(1);

test('each list is one checked file: every hotel has its facts, where they were read and whether they were verified', () => {
  for (const [code, doc] of Object.entries(DOCS)) {
    assert.equal(doc.schema, 1, code);
    assert.equal(doc.iata, code);
    for (const p of ['airport', 'centre']) {
      assert.ok(Number.isFinite(doc.points[p].lat) && Number.isFinite(doc.points[p].lng), code + ' ' + p + ' point');
      assert.ok(doc.points[p].source, code + ' ' + p + ' point names its source');
    }
    const ids = new Set();
    for (const h of doc.hotels) {
      const at = code + ' ' + h.id;
      assert.ok(/^[a-z0-9-]+$/.test(h.id) && !ids.has(h.id), at + ': a unique id');
      ids.add(h.id);
      assert.ok(h.name && typeof h.name === 'string', at);
      assert.ok(H.AREAS.includes(h.area), at + ': area ' + h.area);
      assert.ok(h.address && h.address.street && h.address.town && h.address.display, at + ': address');
      assert.match(h.phone, /^\(\d{3}\) \d{3}-\d{4}$/, at + ': phone');
      if (h.website) assert.match(h.website, /^https?:\/\/[^\s"'<>]+$/, at + ': website');
      assert.ok(Number.isFinite(h.lat) && Number.isFinite(h.lng), at + ': position');
      assert.equal(typeof h.listed, 'boolean', at + ': listed');
      if (!h.listed) assert.ok(h.not_listed_reason, at + ': why it is held back');
      // the season: year round, or ranges of open days (MM-DD to MM-DD)
      assert.equal(typeof h.season.year_round, 'boolean', at + ': season');
      if (!h.season.year_round && h.listed) {
        assert.ok(Array.isArray(h.season.open) && h.season.open.length, at + ': a seasonal hotel has its open days');
        for (const r of h.season.open) {
          assert.match(r.from, /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, at);
          assert.match(r.to, /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, at);
        }
      }
      assert.ok(h.season.source, at + ': the season names its source');
      // the shuttle and the facts keep where they were read and whether they were verified
      assert.equal(typeof h.shuttle.mark, 'boolean', at + ': shuttle mark');
      assert.ok(h.verified && typeof h.verified === 'object', at + ': verified marks');
      for (const f of ['name', 'phone']) {
        assert.equal(typeof h.verified[f].verified, 'boolean', at + ': ' + f + ' verified');
        assert.ok(h.verified[f].source, at + ': ' + f + ' source');
      }
      if (h.area === 'resort') assert.ok(h.drive && h.drive.km > 30 && h.drive.from === code, at + ': a resort has its drive');
    }
  }
});

test('the cities are one list (HotelListCard.CITIES): the build step, the phone app and the tests read it, and it matches the files', () => {
  assert.ok(H.CITIES.length >= 2 && H.CITIES.every((c) => /^[A-Z0-9]{3}$/.test(c)), 'codes');
  assert.equal(new Set(H.CITIES).size, H.CITIES.length, 'no city twice');
  // the build step reads the module's list (lower case, its file names), and names no city itself
  assert.deepEqual(RT.CITIES, H.CITIES.map((c) => c.toLowerCase()));
  const BUILD = read('scripts/hotels/build-runtime.js');
  assert.match(BUILD, /require\(path\.join\(ROOT, 'fids-current', 'js', 'hotel-list-card\.js'\)\)\.CITIES/);
  for (const C of H.CITIES) {
    assert.ok(!new RegExp("['\"]" + C + "['\"]", 'i').test(BUILD), 'build-runtime.js names ' + C + ' itself');
    assert.ok(!new RegExp("['\"]" + C + "['\"]", 'i').test(APP.slice(APP.indexOf('// ── THE HOTEL LISTS'), APP.indexOf('function closeHotels('))), 'the app names ' + C + ' itself');
  }
  // the module names the list once
  assert.equal((SRC.match(/var CITIES = \[/g) || []).length, 1);
  // the app asks the module which cities have a list (any other city: its map searches)
  assert.match(APP, /if\(H\.CITIES\.indexOf\(c\)<0\)\{openHotelSearch\(c,where\);return;\}/);
  // every checked file is a city of the list, every city of the list has its checked file and its slim copy
  const codes = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => /^[a-z0-9]{3}\.json$/.test(f)).map((f) => f.slice(0, 3).toUpperCase()).sort();
  assert.deepEqual(codes('scripts/hotels/data'), H.CITIES.slice().sort());
  assert.deepEqual(codes('fids-current/data/hotels'), H.CITIES.slice().sort());
  assert.deepEqual(RT.listProblems(), []);
  assert.deepEqual(Object.keys(DOCS), H.CITIES);
});

test('the gate no longer asks the old AI route for hotels: the lists are checked data only', () => {
  // v24170: fetchDestInfo and loadDestInfoForGate are gone with their call, and the table of
  // place names only they sent (the route answers status unavailable, and nothing read it)
  for (const gone of ['/ai/destination-info', 'function fetchDestInfo(', 'function loadDestInfoForGate(', 'loadDestInfoForGate(', '_destInfoCache', '_CITY_DISAMBIGUATION', '_gateDestInfo']) {
    assert.ok(!CORE.includes(gone), gone + ' is gone from fids-core.js');
  }
  for (const page of ['gids.html', 'app.html', 'fids.html', 'bids.html']) assert.ok(!read('fids-current/' + page).includes('/ai/destination-info'), page);
  assert.ok(!SRC.includes('/ai/'), 'the hotel cards ask no AI route');
});

test('the site serves a slim copy of each checked list, made from it by the build step, and the two agree', () => {
  for (const code of RT.CITIES) {
    const C = code.toUpperCase();
    // the same bytes the build step writes from the checked file (run it after any edit)
    assert.equal(read('fids-current/data/hotels/' + code + '.json'), RT.render(DOCS[C]), code + ': run node scripts/hotels/build-runtime.js');
    assert.deepEqual(RUN[C], RT.slim(DOCS[C]));
    // small: the fields the cards and the app read, and nothing of the sources
    assert.ok(Buffer.byteLength(read('fids-current/data/hotels/' + code + '.json')) < 20000, code + ' is slim');
    assert.doesNotMatch(read('fids-current/data/hotels/' + code + '.json'), /"(source|verified|evidence|notes|excluded|unverified|lat|lng)"/);
    // the checked file stays out of the site
    assert.ok(!fs.existsSync(path.join(SITE, 'data/hotels/' + code + '.full.json')));
    // the same hotels on the same cards on every day of a year, and the same card markup
    for (let d = 0; d < 366; d++) {
      const when = new Date(2028, 0, 1 + d, 12);
      const ids = (doc) => H.cards(doc, when).map((c) => c.area + ':' + c.hotels.map((h) => h.id).join(','));
      assert.deepEqual(ids(RUN[C]), ids(DOCS[C]), code + ' ' + when.toDateString());
    }
    for (const date of [NOV16, day(2026, 7, 15)]) {
      for (let pass = 0; pass < 3; pass++) {
        const o = { date, home: 'YYZ', pass };
        const html = (doc) => onGate(gate(), () => H.build(doc, ['en', 'fr'], o));
        assert.equal(html(RUN[C]), html(DOCS[C]), code + ' pass ' + pass);
      }
    }
    // a hotel held back is not in the slim copy at all
    for (const h of DOCS[C].hotels) assert.equal(RUN[C].hotels.some((x) => x.id === h.id), h.listed !== false, h.id);
  }
});

test('every hotel is on the card its distances give it, from the two points of its city', () => {
  // the board's own points: Moncton's centre is DOWNTOWN_COORDS.YQM, its airport airport-coords.js
  const dc = /'YQM':\s*\{\s*lat:\s*([\d.-]+),\s*lng:\s*([\d.-]+)/.exec(CORE);
  assert.ok(dc, 'DOWNTOWN_COORDS.YQM');
  assert.deepEqual([DOCS.YQM.points.centre.lat, DOCS.YQM.points.centre.lng], [Number(dc[1]), Number(dc[2])]);
  const ac = /YQM:\[([\d.-]+),([\d.-]+)\]/.exec(read('fids-current/js/airport-coords.js'));
  assert.deepEqual([DOCS.YQM.points.airport.lat, DOCS.YQM.points.airport.lng], [Number(ac[1]), Number(ac[2])]);
  // Fredericton (v24175): the airport is the board's own (airport-coords.js); YFC has no
  // DOWNTOWN_COORDS entry and none was added (as Charlottetown), so the centre is City Hall in
  // OpenStreetMap, and every hotel is on the same card from the terminal as from the board point
  const fc = /YFC:\[([\d.-]+),([\d.-]+)\]/.exec(read('fids-current/js/airport-coords.js'));
  assert.deepEqual([DOCS.YFC.points.airport.lat, DOCS.YFC.points.airport.lng], [Number(fc[1]), Number(fc[2])]);
  assert.ok(!/'YFC':\s*\{\s*lat:/.test(CORE), 'no DOWNTOWN_COORDS.YFC');
  assert.match(DOCS.YFC.points.centre.source, /^https:\/\/www\.openstreetmap\.org\/way\/\d+$/);
  const terminal = { airport: DOCS.YFC.points.airport.terminal, centre: DOCS.YFC.points.centre };
  for (const h of DOCS.YFC.hotels) assert.equal(H.areaOf(h, terminal), h.area, 'YFC ' + h.id + ' from the terminal');
  let n = 0;
  for (const doc of Object.values(DOCS)) {
    for (const h of doc.hotels) {
      assert.equal(H.areaOf(h, doc.points), h.area, doc.iata + ' ' + h.id + ' is ' + h.area);
      n++;
    }
  }
  assert.ok(n >= 60, 'hotels checked: ' + n);
  // the rule itself: about 2 km downtown first, about 5 km airport, a resort only past 30 km
  const P = { airport: { lat: 46.11, lng: -64.68 }, centre: { lat: 46.0878, lng: -64.7782 } };
  const at = (km, from, bearing) => ({ lat: P[from].lat + (km / 111.2) * (bearing === 'n' ? 1 : -1), lng: P[from].lng });
  assert.equal(H.areaOf(at(2.15, 'centre', 'n'), P), 'downtown');
  assert.equal(H.areaOf(at(5.4, 'airport', 'n'), P), 'airport');
  assert.equal(H.areaOf(at(32, 'airport', 'n'), P), 'nearby');
  assert.equal(H.areaOf(Object.assign(at(31, 'airport', 'n'), { resort: true }), P), 'resort');
  assert.equal(H.areaOf(at(40, 'airport', 'n'), P), '');
});

test('five lines a card, the next five on the next pass, every hotel comes round, none twice on a card', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => 'h' + i);
  const seen = new Set();
  for (let pass = 0; pass < 3; pass++) {
    const p = H.page(twelve, pass);
    assert.equal(p.length, 5);
    assert.equal(new Set(p).size, 5, 'pass ' + pass + ': no hotel twice');
    p.forEach((x) => seen.add(x));
  }
  assert.equal(seen.size, 12, 'three passes show all twelve');
  assert.deepEqual(H.page(twelve, 1), ['h5', 'h6', 'h7', 'h8', 'h9']);
  assert.deepEqual(H.page(['a', 'b', 'c'], 7), ['a', 'b', 'c']);
  // on the card: Moncton downtown has twelve; each pass draws five rows
  for (let pass = 0; pass < 3; pass++) {
    const v = views(build('YQM', ['en', 'fr'], { pass })).find((x) => x.includes('data-area="downtown"'));
    assert.equal((v.match(/class="hlc-row"/g) || []).length, 5, 'pass ' + pass);
  }
  const first = views(build('YQM', ['en', 'fr'], { pass: 0 }))[1];
  const second = views(build('YQM', ['en', 'fr'], { pass: 1 }))[1];
  assert.ok(first.includes('data-hotel="delta-beausejour"') && !second.includes('data-hotel="delta-beausejour"'));
});

test('nothing closed for the season, and a hotel held back never shows', () => {
  const ids = (city, d) => H.cards(DOCS[city], d).flatMap((c) => c.hotels.map((h) => h.id));
  const nov = ids('YYG', NOV16);
  for (const shut of ['banbridge-inn', 'harbour-house', 'dalvay', 'shaws-hotel', 'rodd-crowbush', 'stanley-bridge-resort', 'inn-at-bay-fortune']) {
    assert.ok(!nov.includes(shut), shut + ' is closed on 16 November');
  }
  assert.ok(nov.includes('prince-street-suites'), 'Prince Street Suites is open to 30 November');
  assert.ok(!ids('YYG', day(2026, 12, 1)).includes('prince-street-suites'), 'and closed on 1 December');
  const jul = ids('YYG', day(2026, 7, 15));
  for (const open of ['banbridge-inn', 'harbour-house', 'dalvay', 'shaws-hotel', 'rodd-crowbush']) assert.ok(jul.includes(open), open + ' is open in July');
  for (const d of [NOV16, day(2026, 7, 15), day(2027, 1, 10)]) assert.ok(!ids('YYG', d).includes('charlottetown-inn'), 'held back: not verified');
  // a season over the new year
  const h = { listed: true, season: { year_round: false, open: [{ from: '12-01', to: '03-31' }] } };
  assert.equal(H.isOpen(h, day(2027, 1, 15)), true);
  assert.equal(H.isOpen(h, day(2026, 7, 15)), false);
  // the counts of the cards on 16 November (the three motel-like places, Coastal Inn and
  // Thriftlodge in Moncton and Dundee Arms Inn in Charlottetown, are off the cards)
  assert.deepEqual(H.cards(DOCS.YQM, NOV16).map((c) => c.area + ':' + c.hotels.length), ['airport:5', 'downtown:11', 'nearby:11', 'resort:1']);
  assert.deepEqual(H.cards(DOCS.YYG, NOV16).map((c) => c.area + ':' + c.hotels.length), ['airport:5', 'downtown:11', 'nearby:2', 'resort:3']);
  // Halifax (v24174): 38 of 39 listed; held back, the Garden South Park Inn (a bed and breakfast by
  // its listing). The two Dartmouth hotels held in v24170 are on: the Hampton's telephone settled by
  // its own Hilton page, the Holiday Inn Express street by Halifax's civic address register and its
  // own IHG page
  assert.deepEqual(H.cards(DOCS.YHZ, NOV16).map((c) => c.area + ':' + c.hotels.length), ['airport:4', 'downtown:19', 'nearby:15']);
  for (const d of [NOV16, day(2026, 7, 15)]) assert.ok(!ids('YHZ', d).includes('garden-south-park-inn'), 'garden-south-park-inn is held back');
  for (const on of ['hampton-halifax-dartmouth', 'hix-halifax-dartmouth']) assert.ok(ids('YHZ', NOV16).includes(on), on + ' is listed');
  // Fredericton (v24175): 13 of 14 listed; held back, the Delta (its one official listing gives two
  // local telephones and the Marriott page refuses automated readers: a person settles it). One
  // airport hotel (the Days Inn at Oromocto), two downtown, ten nearby
  assert.deepEqual(H.cards(DOCS.YFC, NOV16).map((c) => c.area + ':' + c.hotels.length), ['airport:1', 'downtown:2', 'nearby:10']);
  for (const d of [NOV16, day(2026, 7, 15)]) assert.ok(!ids('YFC', d).includes('delta-fredericton'), 'delta-fredericton is held back');
  for (const [city, id] of [['YQM', 'coastal-inn-dieppe'], ['YQM', 'thriftlodge-moncton'], ['YYG', 'dundee-arms']]) {
    assert.ok(!ids(city, NOV16).includes(id), id + ' is off the cards');
  }
  // the deck asks the board for the day at the airport (_ocLocalDayKey), not the machine's
  onGate({ _ocLocalDayKey: () => '2026-12-01' }, () => {
    globalThis._ocLocalDayKey = () => '2026-12-01';
    try { assert.equal(H.monthDay(null, 'America/Halifax'), '12-01'); } finally { delete globalThis._ocLocalDayKey; }
  });
});

const WINGATE = 'wingate-dieppe';
const WILDROSE = 'wild-rose-inn';
test('the shuttle mark only where the shuttle is verified, and the legend only on a card that shows one', () => {
  for (const doc of Object.values(DOCS)) {
    for (const h of doc.hotels) if (h.shuttle.mark) assert.equal(h.shuttle.verified, true, h.id + ': a mark is verified');
  }
  const marked = DOCS.YQM.hotels.filter((h) => h.shuttle.mark).map((h) => h.id);
  // the Holiday Inn Express at the airport (cyqm.ca); the Quality Inn Airport, the Fairfield and the Wingate (confirmed
  // locally, 16 Nov 2026); the Wild Rose (its own page: a shuttle with its park-and-fly package; the legend says to contact the hotel)
  assert.deepEqual(marked.slice().sort(), ['fairfield-moncton', 'hix-dieppe', 'quality-inn-airport', WILDROSE, WINGATE].sort(), 'Moncton: the five airport hotels with a shuttle');
  assert.equal(DOCS.YYG.hotels.filter((h) => h.shuttle.mark).length, 0, 'Charlottetown: the airport says no hotel shuttle runs');
  // Halifax: the three the airport's own page names; not the Holiday Inn Express by the airport, whose entry
  // on that page repeats the Hilton Garden Inn text (Tourism Nova Scotia names a shuttle, not an allowed source)
  assert.deepEqual(DOCS.YHZ.hotels.filter((h) => h.shuttle.mark).map((h) => h.id).sort(), ['hfx-airport-hotel', 'hgi-halifax-airport', 'inn-on-the-lake']);
  for (const h of DOCS.YHZ.hotels.filter((x) => x.shuttle.mark)) assert.match(h.shuttle.source, /^https:\/\/halifaxstanfield\.ca\//, h.id);
  // Fredericton: the airport's own page names no hotel shuttle, and no hotel page read names one
  assert.equal(DOCS.YFC.hotels.filter((h) => h.shuttle.mark).length, 0, 'Fredericton: no verified hotel shuttle');
  const v = views(build('YQM', ['en', 'fr']));
  const airport = v.find((x) => x.includes('data-area="airport"'));
  const row = airport.split('<li ').find((x) => x.includes('data-hotel="hix-dieppe"'));
  assert.ok(row.includes('hlc-mark'), 'the mark on its line');
  const qrow = airport.split('<li ').find((x) => x.includes('data-hotel="quality-inn-airport"'));
  assert.ok(qrow && qrow.includes('hlc-mark'), 'the Quality Inn Airport line carries the mark too');
  const wrow = airport.split('<li ').find((x) => x.includes('data-hotel="' + WINGATE + '"'));
  assert.ok(wrow && wrow.includes('hlc-mark'), 'the Wingate line carries the mark too');
  const frow = airport.split('<li ').find((x) => x.includes('data-hotel="fairfield-moncton"'));
  assert.ok(frow && frow.includes('hlc-mark'), 'the Fairfield line carries the mark too');
  assert.equal((airport.match(/hlc-mark"/g) || []).length, 6, 'one mark on each of the five lines, one in the legend');
  // the legend sends the traveller to the hotel, in every language
  for (const lg of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(/hotel|hôtel|酒店|ホテル|الفندق/i.test(B.bs('hotelShuttle', lg)), lg + ': contact the hotel');
  assert.ok(airport.includes('class="hlc-legend hlc-pairfit"') && airport.includes(B.bs('hotelShuttle', 'en')) && airport.includes(B.bs('hotelShuttle', 'fr')));
  for (const x of v.filter((y) => !y.includes('data-area="airport"'))) assert.ok(!x.includes('hlc-legend') && !x.includes('hlc-mark"'), 'no legend without a mark');
});

test('every logo is a file loaded through <img>: no SVG of a hotel is written into the page', () => {
  const NEVER = ['ihg/holiday-inn-express-white.png', 'hilton/hampton-white.png', 'hilton/hampton-inn-white.png', 'ihg/logo-hiex-white.svg'];
  const icons = Object.values(H.ICON);
  for (const city of Object.keys(DOCS)) {
    for (let pass = 0; pass < 3; pass++) {
      const html = build(city, ['en', 'fr'], { pass });
      // the only inline drawings are the board's three icons
      for (const m of html.matchAll(/<svg[\s\S]*?<\/svg>/g)) assert.ok(icons.includes(m[0]), 'an inline svg that is not an icon');
      assert.doesNotMatch(html, /<style/i);
      for (const m of html.matchAll(/<img [^>]*src="([^"]+)"/g)) {
        assert.ok(fs.existsSync(path.join(SITE, m[1])), m[1] + ' exists');
        for (const n of NEVER) assert.ok(!m[1].endsWith(n), m[1] + ' is a broken white file');
      }
    }
  }
  for (const doc of Object.values(DOCS)) {
    for (const h of doc.hotels) {
      if (!h.logo) { assert.ok(h.logo_missing, h.id + ': why it has no logo'); continue; }
      assert.ok(fs.existsSync(path.join(SITE, h.logo.file)), h.logo.file);
      assert.ok(h.logo.source, h.id + ': the logo names its source');
      if (h.logo.trim) assert.match(h.logo.trim, /^inset\([\d.]+% [\d.]+% [\d.]+% [\d.]+%\)$/);
    }
  }
  // the module and the app draw logos with <img> only; no innerHTML of a file's text
  assert.doesNotMatch(SRC, /fetch\([^)]*logos/);
  assert.doesNotMatch(SRC, /\.svg['"]\s*\)\s*\.then/);
});

test('a stacked lockup whose words are small at the common height takes the whole cell, shown as it is', () => {
  const filled = [];
  for (const doc of Object.values(DOCS)) for (const h of doc.hotels) if (h.logo && h.logo.fill) filled.push(h.id);
  // Fredericton (v24175): the Delta (held back) and the Riverside Resort's stacked logo
  assert.deepEqual(filled.sort(), ['algonquin-resort', 'comfort-hotel-bayers-lake', 'delta-beausejour', 'delta-dartmouth', 'delta-fredericton', 'delta-halifax-downtown', 'delta-prince-edward', 'fairholm', 'future-inns-halifax', 'halifax-tower-hotel', 'mill-river', 'riverside-resort', 'rodd-crowbush', 'suites-of-euston']);
  assert.match(CSS, /\n\.hlc-img--fill\{ max-height:100%; \}\n/);
  const resort = views(build('YQM', ['en', 'fr'])).find((x) => x.includes('data-area="resort"'));
  assert.match(resort, /<img class="hlc-img hlc-img--fill" alt="" decoding="async" src="\/logos\/hotels\/marriott\/the-algonquin-resort-1\.svg">/);
  // the file itself: no filter, no blend other than the JPEG multiply, no ground of its own
  assert.doesNotMatch(CSS, /\.hlc-img[^{]*\{[^}]*(filter|background|border|box-shadow)/);
  // the app's list the same way, at its own size
  assert.match(APP, /\.hl-logo img\.fill\{max-height:72px;\}/);
  assert.match(APP, /\(\(h\.logo&&h\.logo\.fill===true\)\?' fill':''\)/);
});

test('the logo files come from official sources, each with its source on file', () => {
  const dir = path.join(SITE, 'logos/hotels/list');
  const src = JSON.parse(fs.readFileSync(path.join(dir, 'sources.json'), 'utf8'));
  const files = [];
  for (const f of fs.readdirSync(dir)) if (/\.(svg|png|jpe?g|webp)$/i.test(f)) files.push(f);
  for (const f of fs.readdirSync(path.join(dir, 'foot'))) files.push('foot/' + f);
  assert.ok(files.length >= 30);
  const LOGO_SITES = /seeklogo|logos-world|1000logos|brandsoftheworld|worldvectorlogo|logowik|freepnglogos|pngwing|logolynx|vectorlogo\.zone|logodownload|cleanpng|kindpng/i;
  for (const f of files) {
    const e = src.files[f];
    assert.ok(e && /^https?:\/\//.test(e.source), f + ': its source URL');
    assert.doesNotMatch(e.source, LOGO_SITES, f + ': never a logo-download site');
  }
  for (const f of Object.keys(src.files)) assert.ok(files.includes(f), f + ' listed and present');
  // every repo file the lists reuse is the bytes the check saw (named in the sources file)
  for (const p of src.already_in_repo) assert.ok(fs.existsSync(path.join(SITE, p)), p);
});

test('every word of the cards and the app list is in the store in nine languages', () => {
  for (const k of KEYS) {
    const e = B.STR[k];
    assert.ok(e, k);
    for (const l of LANGS) assert.ok(typeof e[l] === 'string' && e[l].trim(), k + ' ' + l);
  }
  for (const k of Object.values(H.HEAD)) assert.ok(KEYS.includes(k), k);
  // the card says them in the languages of the board, the first language first
  const html = build('YYG', ['fr', 'en']);
  assert.ok(html.indexOf(B.bs('hotelsAirport', 'fr')) < html.indexOf(B.bs('hotelsAirport', 'en').replace(/'/g, '&#39;')));
  for (const k of ['hotelsAirport', 'hotelListScan']) for (const l of ['fr', 'en']) assert.ok(html.includes(B.esc(B.bs(k, l)).replace(/&#39;/g, '&#39;')) || html.includes(B.bs(k, l)), k + ' ' + l);
  // a board of one language says each once
  const one = build('YYG', ['de']);
  assert.ok(one.includes(B.bs('hotelsDowntown', 'de')) && !one.includes(B.bs('hotelsDowntown', 'en')));
  // Arabic: marked, right to left; Japanese and Chinese marked
  const ar = build('YQM', ['ar', 'en']);
  assert.match(ar, /<span class="bs-h" lang="ar" dir="rtl"[^>]*>فنادق قرب المطار<\/span>/);
  assert.match(build('YQM', ['ja', 'zh']), /lang="ja"[^>]*>空港周辺のホテル/);
  assert.match(CSS, /\.hlc \[lang="ja"\], \.hlc \[lang\|="zh"\], \.hlc \[lang="ar"\]\{ font-family:var\(--fids-script-fonts/);
  // the city (a name in Latin letters on every board) keeps its capitals in a half marked
  // Arabic, Japanese or Chinese: a rule of more weight than the rule of the scripts
  assert.match(CSS, /\n\.hlc \.hlc-city \[lang\]\{ text-transform:uppercase; \}\n/);
  assert.match(build('YQM', ['ar', 'en']), /<div class="hlc-city"><span class="hlc-fit"><span class="bs-h" lang="ar"[^>]*>Moncton<\/span><\/span><\/div>/);
  // no word of the module's own: every passenger word comes through the store
  assert.doesNotMatch(SRC, /'(Airport|Downtown|Nearby) hotels'|'Resorts worth|'Airport [Ss]huttle'|'Scan for/);
  // the app's list writes its words from the store too
  for (const k of ['hotelsInCity', 'hotelShuttle', 'hotelCall', 'credOsmLine']) assert.ok(APP.includes("'" + k + "'"), 'app.html uses ' + k);
});

test('the gate shows the hotels of the city its flight goes to, when that city has a list, and nowhere else', () => {
  const legs = (cf) => (cf && cf._stops) || [];
  const at = (cf) => onGate(gate({ _gateCurrentFlight: cf, _flightLegs: legs }), () => H.cityFor());
  assert.equal(at({ _locIata: 'YYG' }), 'YYG');
  assert.equal(at({ _locIata: 'YQM' }), 'YQM');
  assert.equal(at({ _locIata: 'YHZ' }), 'YHZ');
  assert.equal(at({ _locIata: 'YYZ' }), '', 'no list for Toronto');
  assert.equal(at({ _locIata: 'YYZ', _stops: ['YQM', 'YYZ'] }), 'YQM', 'a stop with a list counts');
  assert.equal(at({ _locIata: 'YHZ', _stops: ['YQM', 'YHZ'] }), 'YHZ', 'the city the flight goes to comes before a stop with a list');
  assert.equal(at({ _locIata: 'YYZ', _stops: ['YQM', 'YHZ', 'YYZ'] }), 'YHZ', 'the last stop with a list first');
  assert.equal(at(null), '', 'no flight, nothing');
  // the list is for the city the flight goes to, never the city of the screen: a departure
  // from Halifax to Toronto has no Halifax hotels; Montreal to Moncton has the Moncton list
  const from = (ia, cf) => onGate(gate({ _gateIata: ia, _gateCurrentFlight: cf, _flightLegs: legs }), () => H.cityFor());
  assert.equal(from('YHZ', { _locIata: 'YYZ' }), '', 'no Halifax list on a departure from Halifax');
  assert.equal(from('YQM', { _locIata: 'YUL' }), '', 'no Moncton list on a departure from Moncton');
  assert.equal(from('YYG', null), '', 'an empty gate at a city with a list shows none');
  assert.equal(from('YQM', { _locIata: 'YHZ' }), 'YHZ', 'Moncton to Halifax: the Halifax list');
  assert.equal(from('YUL', { _locIata: 'YQM' }), 'YQM', 'Montreal to Moncton: the Moncton list');
  // due only with the list loaded and something open
  assert.equal(onGate(gate({ _gateCurrentFlight: { _locIata: 'YYG' }, _flightLegs: legs }), () => H.due()), true);
  assert.equal(onGate(gate({ _gateCurrentFlight: { _locIata: 'YYZ' }, _flightLegs: legs }), () => H.due()), false);
  // one card a view at the ten seconds of the hotel pager, the last one held
  assert.equal(onGate(gate({ _gateCurrentFlight: { _locIata: 'YQM' }, _flightLegs: legs }), () => H.dwellMs()), 4 * 10000 + 4000);
});

test('the deck: the slide sits after the Accor pages, takes nothing away, and is absent when not due', () => {
  const fnSrc = (name) => {
    const i = CORE.indexOf('function ' + name + '(');
    assert.ok(i >= 0, name);
    let d = 0, j = CORE.indexOf('{', i);
    for (let k = j; k < CORE.length; k++) { if (CORE[k] === '{') d++; else if (CORE[k] === '}') { d--; if (!d) return CORE.slice(i, k + 1); } }
    throw new Error('unbalanced ' + name);
  };
  const run = (due) => {
    const ctx = {
      window: { _gateCurrentAirline: 'AC', _gateCurrentFlight: null, _gateAccorPass: 0 },
      document: { documentElement: { classList: { contains: () => false } } },
      location: { search: '' },
      getGateAds: () => [{ headline: 'airline 1' }, { headline: 'airline 2' }, { isAccorHotel: true, hotelId: 'A' }, { isAccorHotel: true, hotelId: 'B' }],
      HotelListCard: { due: () => due },
      URLSearchParams
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc('_buildGateAdSlideList') + '\nthis.deck = _buildGateAdSlideList();', ctx);
    return ctx.deck;
  };
  const without = run(false), withIt = run(true);
  const shape = (d) => Array.from(d, (s) => s.type + (s.data && s.data.isAccorHotel ? ':accor:' + s.data.hotelId : ''));
  assert.ok(!shape(without).includes('hotellist'));
  assert.deepEqual(shape(withIt).filter((t) => t !== 'hotellist'), shape(without), 'every other slide as it was, in its order');
  const s = shape(withIt);
  const lastAccor = Math.max(...s.map((t, i) => (/^ad:accor/.test(t) ? i : -1)));
  assert.equal(s.indexOf('hotellist'), lastAccor + 1, 'beside the Accor pages');
  // the slot is drawn, timed and warmed through the module only
  assert.match(CORE, /slide\.type === 'hotellist'\) \{\n[^\n]*\n[^\n]*\n\s*if \(typeof HotelListCard !== 'undefined' && HotelListCard\.render\(el\)\) return;/);
  // first in the loop that passes a slot over, so the centre cards' own branch keeps its
  // short way to the shared skip (tests/gate-centre-cards.test.js measures it)
  const loopAt = CORE.indexOf('var _skipN = 0;');
  const loop = CORE.slice(loopAt, CORE.indexOf('if (_skipN >= totalSlots) return;', loopAt));
  assert.match(loop, /^var _skipN = 0;\s*for \(; _skipN < totalSlots && slide; _skipN\+\+\) \{\s*if \(slide\.type === 'hotellist'\) \{/);
  assert.equal((loop.match(/HotelListCard\.render\(el\)/g) || []).length, 1, 'drawn in one place');
  assert.match(CORE, /if \(slide\.type === 'hotellist'\) return \(typeof HotelListCard !== 'undefined' && HotelListCard\.dwellMs\(\)\) \|\| 44000;/);
  assert.match(CORE, /slide\.type === 'hotellist' && typeof HotelListCard !== 'undefined' && typeof HotelListCard\.media === 'function'/);
});

// The text without its notes, cut out by position (no pattern): from each opening mark to its
// closing mark (a line note keeps its end of line).
function cut(src, open, close) {
  let out = '', i = 0;
  for (;;) {
    const a = src.indexOf(open, i);
    if (a < 0) return out + src.slice(i);
    out += src.slice(i, a);
    const b = src.indexOf(close, a + open.length);
    if (b < 0) return out;
    i = close === '\n' ? b : b + close.length;
  }
}

test('the Accor pages and the Algonquin page are not touched', () => {
  // the module and its stylesheet keep to their own slide: no Accor cache, no Accor function,
  // nothing of the Algonquin page, and every rule scoped to .hlc
  // (the deck's own count of its passes, _gateAccorPass, is read for the rotation and nothing else)
  const code = cut(cut(SRC, '/*', '*/'), '//', '\n').split('_gateAccorPass').join('');
  assert.doesNotMatch(code, /accor|AlgonquinCard|axr-(?!pages?\b|page-on\b)/i);
  assert.match(SRC, /root\._gateAccorPass\) \|\| 0/);
  const rules = cut(CSS, '/*', '*/').replace(/@font-face\{[^}]*\}/g, '');
  for (const m of rules.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const sel of m[1].split(',').map((x) => x.trim()).filter(Boolean)) assert.match(sel, /^\.hlc\b/, 'scoped: ' + sel);
  }
  // the faces have names of their own: the Accor stacks name 'Montserrat', which stays unserved
  const families = [...CSS.matchAll(/font-family:'([^']+)'; font-style/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(families)].sort(), ['HL Montserrat', 'HL Playfair Display']);
  // the Algonquin page and the Accor slides keep their own branches of the deck
  assert.match(CORE, /if \(typeof AlgonquinCard !== 'undefined' && AlgonquinCard\.due\(\)\) deck\.push\(\{ type: 'algonquin' \}\);/);
  assert.match(CORE, /if \(a && a\.isAccorHotel\) accorSlides\.push\(\{ type: 'ad', data: a \}\);/);
});

test('one scan code a card: the whole list of the city in the phone app, at that card', () => {
  const html = build('YYG', ['en', 'fr'], { home: 'YQM' });
  const urls = [...html.matchAll(/data-qr-url="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.equal(urls.length, views(html).length, 'one a card');
  for (const u of urls) assert.match(u, /\/app\?ap=YQM&hotels=YYG&area=(airport|downtown|nearby|resort)$/);
  // on a board of ours the code opens the app's own address
  const ours = onGate({ location: { hostname: 'yqm.orionconnected.com', origin: 'https://yqm.orionconnected.com', search: '' } }, () => H.qrUrl('YYG', 'downtown', 'YQM'));
  assert.equal(ours, 'https://orionconnected.app/app?ap=YQM&hotels=YYG&area=downtown');
  // the app opens it: ?hotels= and &area=, a button that calls (tel:) and one for the website
  assert.match(APP, /q\.get\('hotels'\)/);
  assert.match(APP, /function openHotels\(city,area,where\)/);
  assert.match(APP, /'<a class="hl-btn" href="'\+esc\(tel\)\+'">/);
  assert.match(APP, /target="_blank" rel="noopener"/);
  assert.match(APP, /<script src="js\/hotel-list-card\.js\?v=\d+"><\/script>/);
  const tel = new Function(/function hlTel\(p\)\{[^\n]+\}/.exec(APP)[0] + '\nreturn hlTel;')();
  assert.equal(tel('(506) 388-5050'), 'tel:+15063885050');
});

test('the gate page loads the stylesheet and the script at the build tag, after the core', () => {
  const tag = /var FIDS_BUILD_TAG = 'v(\d+)';/.exec(CORE)[1];
  assert.ok(GIDS.includes('<link rel="stylesheet" href="css/hotel-list-card.css?v=' + tag + '">'));
  const s = GIDS.indexOf('<script src="js/hotel-list-card.js?v=' + tag + '"></script>');
  assert.ok(s > GIDS.indexOf('<script src="js/fids-core.js?v='), 'after the core');
  assert.ok(APP.includes('<link rel="stylesheet" href="css/hotel-list-card.css?v=' + tag + '">'), 'the app has the faces');
});

test('the two faces are served from the site with their licence beside them; the board keeps its own', () => {
  for (const [dir, files] of [['playfair-display', ['PlayfairDisplay-latin.woff2', 'PlayfairDisplay-latin-ext.woff2']], ['montserrat', ['Montserrat-latin.woff2', 'Montserrat-latin-ext.woff2']]]) {
    for (const f of files) {
      const b = fs.readFileSync(path.join(SITE, 'fonts', dir, f));
      assert.equal(b.slice(0, 4).toString('latin1'), 'wOF2', f);
      assert.ok(CSS.includes("url('/fonts/" + dir + '/' + f + "')"), f + ' in the stylesheet');
    }
    assert.match(fs.readFileSync(path.join(SITE, 'fonts', dir, 'OFL.txt'), 'utf8'), /SIL Open Font License, Version 1\.1/);
  }
  assert.match(CSS, /\.hlc, \.hlc \*\{ font-family:var\(--hlc-sans\) !important; \}/);
  assert.doesNotMatch(read('fids-current/css/font.css'), /Playfair|HL Montserrat/, 'the board font is untouched');
});

test('nothing on a card is under 18 px at 1680x1050', () => {
  const px = [...CSS.matchAll(/--hlc-(title|city|say|name|info):calc\((\d+(?:\.\d+)?) \* var\(--hlc-px\)\)/g)];
  assert.ok(px.length >= 5);
  for (const m of px) assert.ok(Number(m[2]) >= 18, m[1] + ' ' + m[2]);
  for (const m of CSS.matchAll(/font-size:calc\((\d+(?:\.\d+)?) \* var\(--hlc-px\)\)/g)) assert.ok(Number(m[1]) >= 18, 'font ' + m[1]);
  assert.match(CSS, /--hlc-px:min\(0\.09524vh, 0\.05952vw\);/, 'one pixel at 1680x1050, by the smaller of height and width');
  // the fitter's floor is worked out in pixels from the screen, with the stylesheet's own two
  // figures (a custom property computes to its text, min(...), which is not a number)
  assert.match(SRC, /return Math\.min\(h \* 0\.09524, w \* 0\.05952\) \/ 100;/);
  assert.doesNotMatch(SRC + CSS, /--hlc-floor-px/);
  assert.equal(H.FLOOR, 18);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  assert.ok(near(H.floorPx(1680, 1050), 18), '18 px at 1680x1050');
  assert.ok(near(H.floorPx(1920, 1080), 18 * 1080 / 1050), 'by the height at 1920x1080: ' + H.floorPx(1920, 1080));
  assert.ok(near(H.floorPx(1366, 768), 18 * 768 / 1050), 'by the height at 1366x768: ' + H.floorPx(1366, 768));
  assert.ok(near(H.floorPx(1280, 1024), 18 * 1280 / 1680), 'by the width on a squarer screen');
});

test('the fitter steps a long line down to the floor of the screen, and no further', () => {
  // a line of the given width at 1 px of type, in a box of the given width, at a base size
  const fitOnce = (W, H0, base, need, room) => {
    let size = '';
    const box = {
      style: { set fontSize(v) { size = v; }, get fontSize() { return size; } },
      classList: { remove() {}, add() {}, contains: () => false },
      getClientRects: () => [1],
      getBoundingClientRect: () => ({ width: room }),
      children: []
    };
    const span = { parentElement: box, get scrollWidth() { return need * (size ? parseFloat(size) : base); }, getClientRects: () => [1] };
    box.children = [span];
    const art = { querySelectorAll: () => [span] };
    const el = { querySelector: () => art };
    // the screen and the style of the box, on the global object for this one call
    const g = { innerWidth: W, innerHeight: H0, getComputedStyle: () => ({ fontSize: base + 'px', paddingLeft: '0', paddingRight: '0' }) };
    const keep = {};
    Object.keys(g).forEach((n) => { keep[n] = Object.getOwnPropertyDescriptor(globalThis, n); Object.defineProperty(globalThis, n, { value: g[n], configurable: true, writable: true }); });
    try { H.fit(el); } finally {
      Object.keys(g).forEach((n) => { delete globalThis[n]; if (keep[n]) Object.defineProperty(globalThis, n, keep[n]); });
    }
    return size ? parseFloat(size) : base;
  };
  for (const [W, H0] of [[1680, 1050], [1920, 1080], [1366, 768]]) {
    const u = Math.min(H0 / 1050, W / 1680), floor = 18 * u, base = 20 * u;   // an address line
    // ten per cent too long: it steps down until it fits, above the floor
    const a = fitOnce(W, H0, base, 10, base * 10 / 1.1 + 1);
    assert.ok(a < base && a >= floor - 0.01, W + 'x' + H0 + ': stepped down to ' + a.toFixed(2) + ' (base ' + base.toFixed(2) + ', floor ' + floor.toFixed(2) + ')');
    // far too long: it stops on the floor of this screen, never under it
    const b = fitOnce(W, H0, base, 10, base * 5);
    assert.ok(Math.abs(b - floor) < 0.005, W + 'x' + H0 + ': held at the floor, ' + b.toFixed(3) + ' (floor ' + floor.toFixed(3) + ')');
    // a name (28 px of the design) steps down to seven tenths of itself at most
    const n = fitOnce(W, H0, 28 * u, 10, 28 * u * 3);
    assert.ok(Math.abs(n - 0.7 * 28 * u) < 0.005, W + 'x' + H0 + ': a name holds at seven tenths, ' + n.toFixed(3));
  }
});

test('a light card: the logos stand on its cream, never a box behind one logo; the foot is the navy band', () => {
  // the card is the cream paper with navy ink (the family of the Algonquin page)
  assert.match(CSS, /\n\.hlc\{[^}]*background:var\(--hlc-cream\);\n  color:var\(--hlc-navy\);/);
  assert.match(CSS, /--hlc-navy:#14203c;/);
  // the list has no ground of its own: the logos read on the cream of the card
  assert.doesNotMatch(CSS, /\.hlc-list[^{]*\{[^}]*background/);
  assert.match(CSS, /\.hlc-row\{ flex:0 0 20%;/);
  // a card where no line has a logo has no logo cell, and its names start at the card's edge
  assert.match(CSS, /\.hlc-list--bare \.hlc-logo\{ display:none; \}\n\.hlc-list--bare \.hlc-text\{ padding-left:var\(--hlc-pad\); \}/);
  // the scan code: navy modules on the cream, no white box
  assert.match(SRC, /colorDark: '#14203c', colorLight: '#f5efe3'/);
  assert.doesNotMatch(CSS, /\.hlc-qr\{[^}]*background/);
  const list = (city, area, pass) => {
    const v = views(build(city, ['en', 'fr'], { pass: pass || 0 })).find((x) => x.includes('data-area="' + area + '"'));
    const m = /<ol class="(hlc-list[^"]*)" style="--hlc-rows:(\d)">/.exec(v);
    return { cls: m[1], rows: Number(m[2]), lines: (v.match(/class="hlc-row"/g) || []).length };
  };
  // five-line cards as they were
  for (const [c, a] of [['YQM', 'airport'], ['YQM', 'downtown'], ['YQM', 'nearby'], ['YYG', 'airport'], ['YYG', 'downtown'], ['YFC', 'nearby']]) {
    for (let pass = 0; pass < 3; pass++) assert.deepEqual(list(c, a, pass), { cls: 'hlc-list', rows: 5, lines: 5 }, c + ' ' + a + ' ' + pass);
  }
  // shorter cards: their lines only
  assert.deepEqual(list('YQM', 'resort'), { cls: 'hlc-list', rows: 1, lines: 1 }, 'Moncton resorts: the Algonquin');
  assert.deepEqual(list('YYG', 'nearby'), { cls: 'hlc-list', rows: 2, lines: 2 }, 'Charlottetown nearby: two lines, both with a logo');
  assert.deepEqual(list('YYG', 'resort'), { cls: 'hlc-list', rows: 3, lines: 3 }, 'Charlottetown resorts: their own logos (v24170)');
  assert.deepEqual(list('YFC', 'airport'), { cls: 'hlc-list', rows: 1, lines: 1 }, 'Fredericton airport: the Days Inn at Oromocto');
  assert.deepEqual(list('YFC', 'downtown'), { cls: 'hlc-list', rows: 2, lines: 2 }, 'Fredericton downtown: two lines while the Delta is held');
  // a card where no line has a logo still drops the logo cell: the same list with its logos taken off
  const noLogos = JSON.parse(JSON.stringify(RUN.YYG));
  noLogos.hotels.forEach((h) => { delete h.logo; });
  const bare = views(onGate(gate(), () => H.build(noLogos, ['en', 'fr'], { date: NOV16, home: 'YYZ' }))).find((x) => x.includes('data-area="resort"'));
  assert.match(bare, /<ol class="hlc-list hlc-list--bare" style="--hlc-rows:3">/, 'no logo, no logo cell');
  // the app's list: no column on a list where no hotel has a logo
  assert.match(APP, /\.hl-list\.hl-list--bare\{background:var\(--card\);\}\n  \.hl-list--bare \.hl-logo\{display:none;\}/);
  assert.match(APP, /'<ol class="hl-list'\+\(c\.hotels\.some\(h=>h\.logo&&h\.logo\.file\)\?'':' hl-list--bare'\)\+'">'/);
  assert.match(CSS, /--hlc-cream:#f5efe3;/, 'one fixed cream, never the airline colour');
  for (const m of CSS.matchAll(/(\.hlc-(?:logo|img)[^{]*)\{([^}]*)\}/g)) assert.doesNotMatch(m[2], /background/, m[1] + ' has no ground of its own');
  // the white-lettering marks of the foot stay on the navy
  assert.match(CSS, /\.hlc-foot\{[^}]*background:var\(--hlc-navy\); color:#fff; \}/);
  assert.deepEqual(DOCS.YQM.foot_marks.map((m) => m.name), ['Destination Moncton-Dieppe', '#ExploreNB']);
  assert.deepEqual(DOCS.YYG.foot_marks, [], 'no Charlottetown mark until one is approved');
  assert.deepEqual(DOCS.YFC.foot_marks, [], 'no Fredericton mark until one is approved');
});

// ══════════════════════════════════════════════════════════════════════════
// EVERY OTHER CITY (v24176): a gate whose flight goes to a city without a
// checked list shows one card in the same slot, "Hotels in {CITY}" and one
// large scan code; the code opens the phone app, which offers a search in
// Google Maps and one in Apple Maps. Hand-checked lists stay where a person
// checked them.
// ══════════════════════════════════════════════════════════════════════════

// the board's own names, as its tables hold them (capitals), and the gate's
// casing with the airport's own name where a city has two of ours
const BOARD_NAMES = { YYZ: 'TORONTO', YUL: 'MONTREAL', YQM: 'MONCTON', YYG: 'CHARLOTTETOWN', YHZ: 'HALIFAX', LHR: 'LONDON', YYT: "ST. JOHN'S", BOS: 'BOSTON' };
const BOARD_NAMES_FR = { YUL: 'MONTRÉAL' };
const named = (c, lg) => (lg === 'fr' && BOARD_NAMES_FR[c]) || BOARD_NAMES[c] || '';
const cased = (c, lg) => {
  const n = named(c, lg);
  if (!n) return String(c || '');
  const t = n.toLowerCase().replace(/(^|[\s\-\/(.])([a-zà-ÿ])/g, (m, p, ch) => p + ch.toUpperCase());
  return c === 'YYZ' ? t + ' · Pearson' : t;
};
const legs = (cf) => (cf && cf._stops) || [];
const anyGate = (extra) => Object.assign({ BoardStrings: B, _gateIata: 'YHZ', _gateMapCity: cased, airportCityNameSafe_v21877: named, _flightLegs: legs }, extra || {});
// A function of the phone app, as it is written there, to run in a sandbox
const appFn = (name) => {
  const i = APP.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let d = 0;
  for (let k = APP.indexOf('{', i); k < APP.length; k++) { if (APP[k] === '{') d++; else if (APP[k] === '}') { d--; if (!d) return APP.slice(i, k + 1); } }
  throw new Error('unbalanced ' + name);
};

test('every other city: the gate shows its "Hotels in" card where the city the flight goes to has no checked list, and only there', () => {
  const find = (cf, extra) => onGate(anyGate(Object.assign({ _gateCurrentFlight: cf }, extra || {})), () => H.findCity());
  const list = (cf, extra) => onGate(anyGate(Object.assign({ _gateCurrentFlight: cf }, extra || {})), () => H.cityFor());
  // Halifax to Toronto: no list for Toronto, its card
  assert.equal(find({ _locIata: 'YYZ' }), 'YYZ');
  assert.equal(list({ _locIata: 'YYZ' }), '', 'and no list');
  // a city with a checked list: the list, never the card
  for (const C of H.CITIES) {
    assert.equal(find({ _locIata: C }, { _gateIata: 'YUL' }), '', C + ': its list shows instead');
    assert.equal(list({ _locIata: C }, { _gateIata: 'YUL' }), C);
  }
  // a stop with a list counts for the list, as before: no card then
  assert.equal(find({ _locIata: 'YYZ', _stops: ['YQM', 'YYZ'] }, { _gateIata: 'YUL' }), '', 'a stop with a list: the list');
  // no flight, no card
  assert.equal(find(null), '', 'a gate with no flight shows nothing');
  // a code the board has no name for: no card
  assert.equal(find({ _locIata: 'QQZ' }), '', 'no name, no card');
  // the city the flight goes to, then its stops from the last, for any code with a name
  assert.equal(find({ _locIata: 'QQZ', _stops: ['BOS', 'LHR', 'QQZ'] }), 'LHR', 'the last stop with a name');
  // never the city of the screen itself
  assert.equal(find({ _locIata: 'YHZ' }), '', 'not Halifax hotels on a Halifax gate');
  assert.equal(find({ _locIata: 'QQZ', _stops: ['YUL', 'BOS', 'QQZ'] }, { _gateIata: 'BOS' }), 'YUL', 'a stop that is the screen’s own city is passed over');
  // due on the gate: the card of a city without a list is due at once (nothing to load), and
  // holds its one view long enough to take a phone out
  const gateOf = (cf) => anyGate({ _gateCurrentFlight: cf });
  assert.equal(onGate(gateOf({ _locIata: 'YYZ' }), () => H.due()), true);
  assert.equal(onGate(gateOf({ _locIata: 'YYZ' }), () => H.dwellMs()), H.FIND_MS);
  assert.equal(H.FIND_MS, 20000);
  assert.equal(onGate(gateOf(null), () => H.due()), false, 'no flight: nothing due');
  assert.equal(onGate(gateOf({ _locIata: 'QQZ' }), () => H.due()), false, 'no name: nothing due');
  assert.equal(onGate(gateOf({ _locIata: 'YQM' }), () => H.due()), true, 'Moncton: the list, loaded');
  assert.equal(onGate(gateOf({ _locIata: 'YQM' }), () => H.dwellMs()), 4 * 10000 + 4000, 'and the list keeps its own dwell');
  // nothing to warm: no logo, no picture
  assert.deepEqual(onGate(gateOf({ _locIata: 'YYZ' }), () => H.media()), []);
});

test('every other city: the review link shows the card of a city without a list on any gate, and a list city keeps its list', () => {
  const rv = (q, cf) => onGate(anyGate({ _gateCurrentFlight: cf || null, location: { search: q, hostname: 'localhost', origin: 'http://localhost:8129' } }), () => ({ list: H.cityFor(), find: H.findCity(), due: H.due() }));
  assert.deepEqual(rv('?hotellist=YYZ&scene=hotellist'), { list: '', find: 'YYZ', due: true }, 'Toronto, on a gate with no flight');
  assert.deepEqual(rv('?hotellist=yyz&scene=hotellist', { _locIata: 'YQM' }), { list: '', find: 'YYZ', due: true }, 'the link wins over the flight');
  assert.deepEqual(rv('?hotellist=YQM&scene=hotellist'), { list: 'YQM', find: '', due: true }, 'Moncton keeps its list');
  assert.deepEqual(rv('?hotellist=QQZ'), { list: '', find: '', due: false }, 'a code with no name shows nothing');
  assert.deepEqual(rv('?hotellist=toolong', { _locIata: 'YYZ' }), { list: '', find: 'YYZ', due: true }, 'a link that names no code is no link');
  // a code the board has no name for is no link either: the gate shows what it shows without one
  assert.deepEqual(rv('?hotellist=QQZ', { _locIata: 'YQM' }), { list: 'YQM', find: '', due: true }, 'the Moncton list of the gate, as before');
  assert.deepEqual(rv('?hotellist=QQZ', { _locIata: 'YYZ' }), { list: '', find: 'YYZ', due: true }, 'the Toronto card of the gate');
});

test('every other city: one card, its heading in the languages of the board, one large code to the phone app, no logo, no hotel, no price', () => {
  const html = onGate(anyGate(), () => H.buildFind('YYZ', ['fr', 'en'], { home: 'YHZ' }));
  // one view, in the pages wrap the pager knows, shown
  assert.equal((html.match(/class="axr-page /g) || []).length, 1);
  assert.match(html, /^<div class="hlc hlc--find" data-city="YYZ"><div class="axr-pages hlc-views"><div class="axr-page hlc-view hlc-find axr-page-on" data-area="find">/);
  // the heading, French first on this board, the city cased as the gate writes it and without
  // the airport's own name (Toronto, not Toronto · Pearson)
  const fr = B.bs('hotelsInCity', 'fr').replace('{CITY}', '<bdi>Toronto</bdi>');
  const en = B.bs('hotelsInCity', 'en').replace('{CITY}', '<bdi>Toronto</bdi>');
  assert.ok(html.includes('<span class="bs-h" lang="fr">' + fr + '</span>') && html.includes('<span class="bs-h" lang="en">' + en + '</span>'), 'Hôtels à Toronto, Hotels in Toronto');
  assert.ok(html.indexOf(fr) < html.indexOf(en), 'the first language first');
  assert.doesNotMatch(html, /Pearson/);
  // the invitation under the code, in both languages, in the navy foot beside the phone mark
  for (const l of ['fr', 'en']) assert.ok(html.includes(B.esc(B.bs('hotelsFindScan', l))), 'hotelsFindScan ' + l);
  assert.match(html, /<div class="hlc-foot hlc-find-foot"><i class="hlc-ico hlc-find-ico">/);
  // one code: the phone app, the city, the airport of the screen; no area
  const urls = [...html.matchAll(/data-qr-url="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.deepEqual(urls, ['https://orionconnected.app/app?ap=YHZ&hotels=YYZ']);
  // where the city is, from the board's own tables, for its map search on the phone (&in=): the
  // country as the table gives it (Puerto Rico is PR) and, in Canada and the United States, the
  // state or province
  const CC = { YYZ: 'CA', YQY: 'CA', SYD: 'AU', PWM: 'US', SJU: 'PR', STI: 'DO' };
  const RG = { YYZ: 'ON', YQY: 'NS', PWM: 'ME', SYD: 'NS' };
  const placed = (extra) => anyGate(Object.assign({ _IATA_CC: CC, _rowRegion: (c) => RG[c] || '' }, extra || {}));
  assert.deepEqual(['YYZ', 'YQY', 'SYD', 'PWM', 'SJU', 'STI', 'QQZ', 'yyz', 'TOOLONG'].map((c) => onGate(placed(), () => H.whereOf(c))),
    ['CA-ON', 'CA-NS', 'AU', 'US-ME', 'PR', 'DO', '', 'CA-ON', ''], 'a state only in Canada and the United States');
  assert.equal(onGate(anyGate({ airportCountry: (c) => (c === 'SJU' ? 'US' : '') }), () => H.whereOf('SJU')), 'US', 'without the table, the board\u2019s airportCountry');
  assert.equal(onGate(anyGate(), () => H.whereOf('YYZ')), '', 'a board without the tables: nothing');
  const qr = onGate(placed(), () => H.buildFind('YYZ', ['fr', 'en'], { home: 'YHZ' })).match(/data-qr-url="([^"]+)"/)[1].replace(/&amp;/g, '&');
  assert.equal(qr, 'https://orionconnected.app/app?ap=YHZ&hotels=YYZ&in=CA-ON');
  assert.equal(H.qrUrl('YQY', '', 'YHZ', 'ca-ns'), 'https://orionconnected.app/app?ap=YHZ&hotels=YQY&in=CA-NS');
  for (const w of ['', null, undefined, 'C', 'CAN', 'CA-N', 'CA-NS&x=1']) assert.equal(H.qrUrl('YQY', '', 'YHZ', w), 'https://orionconnected.app/app?ap=YHZ&hotels=YQY', String(w));
  // a list city's codes carry no such part
  assert.doesNotMatch(onGate(placed(), () => H.build(RUN.YQM, ['en'], { date: NOV16, home: 'YYZ' })), /&amp;in=/);
  assert.equal(onGate({ location: { hostname: 'yhz.orionconnected.com', origin: 'https://yhz.orionconnected.com', search: '' } }, () => H.qrUrl('YYZ', '', 'YHZ')), 'https://orionconnected.app/app?ap=YHZ&hotels=YYZ');
  // no logo, no picture, no hotel, no price: the only drawing is the phone mark
  assert.doesNotMatch(html, /<img|<style|data-hotel=|\$|€|£/);
  assert.deepEqual([...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]), [H.ICON.smartphone]);
  // a board of one language says it once; a pair whose two lines say the same says it once
  const one = onGate(anyGate(), () => H.buildFind('YYZ', ['de'], { home: 'YHZ' }));
  assert.match(one, /^<div class="hlc hlc--find hlc--one"/);
  assert.equal((one.match(/class="hlc-tl"/g) || []).length, 2, 'one heading line, one invitation line');
  // the French name where the board has one: Montréal
  const yul = onGate(anyGate(), () => H.buildFind('YUL', ['fr', 'en'], { home: 'YHZ' }));
  assert.ok(yul.includes('<bdi>Montréal</bdi>') && yul.includes('<bdi>Montreal</bdi>'));
  // Arabic marked right to left, the city isolated in it; Japanese and Chinese marked
  const ar = onGate(anyGate(), () => H.buildFind('YYZ', ['ar', 'en'], { home: 'YHZ' }));
  assert.match(ar, /<span class="bs-h" lang="ar" dir="rtl">فنادق <bdi>Toronto<\/bdi><\/span>/);
  assert.match(onGate(anyGate(), () => H.buildFind('YYZ', ['ja', 'zh'], { home: 'YHZ' })), /lang="ja"[^>]*><bdi>Toronto<\/bdi>のホテル/);
  // the city is escaped (St. John's)
  assert.ok(onGate(anyGate(), () => H.buildFind('YYT', ['en'], {})).includes('<bdi>St. John&#39;s</bdi>'));
  // no name, no card
  assert.equal(onGate(anyGate(), () => H.buildFind('QQZ', ['en', 'fr'], {})), '');
  // the module writes no word of its own: the heading and the invitation are the store's
  assert.doesNotMatch(SRC, /'Hotels in|'Scan to search|'Search in (Google|Apple)/);
});

test('every other city: the look, the family of the list cards, sized for the 1680x1050 stage', () => {
  // inside the stylesheet's own sections, never appended after the foot
  const at = CSS.indexOf('/* ── the card of a city without a list');
  assert.ok(at > 0 && at < CSS.indexOf('/* ── foot ── */'), 'before the foot section');
  // the heading in the heading face, large; the code square, as large as the card leaves room
  // for, 420 px at most at 1680x1050; the invitation in the navy foot
  assert.match(CSS, /\.hlc-find-title\{ font-family:var\(--hlc-serif\); font-weight:600; font-size:calc\(48 \* var\(--hlc-px\)\);/);
  // square on both axes: the smaller of the width and the height of its area (a size container,
  // as the Algonquin page sizes its code), so a narrow or tall slot gives a smaller square, never
  // a squeezed one
  assert.match(CSS, /\.hlc-find-scan\{ flex:1 1 0; min-height:0; min-width:0; container-type:size;/);
  assert.match(CSS, /\.hlc-find-scan \.hlc-qr\{ flex:none; width:min\(calc\(420 \* var\(--hlc-px\)\), 100cqw, 100cqh\); height:min\(calc\(420 \* var\(--hlc-px\)\), 100cqw, 100cqh\);/);
  assert.doesNotMatch(CSS, /\.hlc-find-scan \.hlc-qr\{[^}]*aspect-ratio/);
  assert.match(CSS, /\.hlc-find-say\{ min-width:0; font-size:calc\(26 \* var\(--hlc-px\)\);/);
  // the invitation's lines centred on one another (an Arabic line never flush left under the mark)
  assert.match(CSS, /\.hlc-find-say\{[^}]*text-align:center; \}/);
  // the gold rule under the heading
  assert.match(CSS, /\.hlc-find-title::after\{ content:''; [^}]*background:var\(--hlc-rule\); \}/);
  // the code is drawn again whenever its size has changed, so it is never drawn at one size and
  // shown at another (run in the render test below)
  assert.match(SRC, /\(Number\(q\.getAttribute\('data-qr-w'\)\) \|\| 0\) === w/);
});

test('every other city: the phone app offers a search in Google Maps and one in Apple Maps, each link as documented', () => {
  // the two forms (HotelListCard.mapLinks): Google's Maps URLs search action (api=1, query),
  // Apple's Map Links (q, and sll, the point to search around)
  const t = H.mapLinks('Hotels in Toronto', { lat: 43.68, lng: -79.63 });
  assert.equal(t.google, 'https://www.google.com/maps/search/?api=1&query=Hotels%20in%20Toronto');
  assert.equal(t.apple, 'https://maps.apple.com/?q=Hotels%20in%20Toronto&sll=43.68,-79.63');
  // the city URL-encoded: accents, an apostrophe, spaces; every reserved character
  const m = H.mapLinks('Hôtels à Montréal', { lat: 45.47, lng: -73.74 });
  assert.equal(m.google, 'https://www.google.com/maps/search/?api=1&query=H%C3%B4tels%20%C3%A0%20Montr%C3%A9al');
  assert.equal(m.apple, 'https://maps.apple.com/?q=H%C3%B4tels%20%C3%A0%20Montr%C3%A9al&sll=45.47,-73.74');
  assert.equal(H.mapLinks("Hotels in St. John's (NL) & more", null).google, 'https://www.google.com/maps/search/?api=1&query=Hotels%20in%20St.%20John%27s%20%28NL%29%20%26%20more');
  // no point, or a bad one: the search alone
  for (const p of [null, undefined, {}, { lat: null, lng: null }, { lat: 'x', lng: 2 }, { lat: 120, lng: 0 }]) {
    assert.equal(H.mapLinks('Hotels in Toronto', p).apple, 'https://maps.apple.com/?q=Hotels%20in%20Toronto', JSON.stringify(p));
  }
  assert.deepEqual(H.mapLinks('  ', { lat: 1, lng: 2 }), { google: '', apple: '' });
  // no key, no tracking parameter: the search and the point, nothing else
  for (const u of [t.google, t.apple]) {
    const q = new URL(u).searchParams;
    assert.deepEqual([...q.keys()].sort(), u.includes('google') ? ['api', 'query'] : ['q', 'sll']);
  }
  // the documentation each form follows is named beside it
  assert.match(SRC, /developers\.google\.com\/maps\/documentation\/urls\/get-started/);
  assert.match(SRC, /developer\.apple\.com\/documentation\/mapkit\/\s*\/?\s*unified-map-urls|developer\.apple\.com\/documentation\/mapkit\/\n\s*\/\/\s*unified-map-urls/);
  assert.match(SRC, /Map Links/);

  // the city written with where it is (searchPlace), so a search with no point never finds the
  // other Sydney: the state or province by its two letters, the country in the phone's language
  const sp = (n, w, l) => onGate(anyGate(), () => H.searchPlace(n, w, l));
  assert.equal(sp('Sydney', 'CA-NS', 'en'), 'Sydney, NS, Canada');
  assert.equal(sp('Sydney', 'AU', 'en'), 'Sydney, Australia');
  assert.equal(sp('Portland', 'US-ME', 'en'), 'Portland, ME, United States');
  assert.equal(sp('San Juan', 'PR', 'en'), 'San Juan, Puerto Rico');
  assert.equal(sp('Santiago', 'DO', 'fr'), 'Santiago, République dominicaine');
  assert.equal(sp('London', 'CA-ON', 'de'), 'London, ON, Kanada');
  assert.equal(sp('London', 'GB', 'ja'), 'London, イギリス');
  assert.equal(sp('London', 'GB', 'ar'), 'London, المملكة المتحدة');
  // the country left out where the city's name says it already, or the country's name begins
  // with the city's
  assert.equal(sp('Panama City', 'PA', 'en'), 'Panama City');
  assert.equal(sp('Singapore', 'SG', 'en'), 'Singapore');
  assert.equal(sp('Ciudad de México', 'MX', 'es'), 'Ciudad de México');
  assert.equal(sp('Hong Kong', 'HK', 'en'), 'Hong Kong');
  // the city alone where nothing (or nothing valid) says where it is
  for (const w of ['', null, undefined, 'CAN', 'C-1', 'CA NS', 'CA-NS&x']) assert.equal(sp('Toronto', w, 'en'), 'Toronto', String(w));
  assert.equal(sp('  ', 'CA', 'en'), '');
  // Arabic and Japanese searches, encoded as UTF-8
  const ar = H.mapLinks(B.fmt('hotelsInCity', 'ar', { CITY: sp('London', 'GB', 'ar') }, true), { lat: 51.47, lng: -0.45 });
  assert.equal(ar.google, 'https://www.google.com/maps/search/?api=1&query=%D9%81%D9%86%D8%A7%D8%AF%D9%82%20London%2C%20%D8%A7%D9%84%D9%85%D9%85%D9%84%D9%83%D8%A9%20%D8%A7%D9%84%D9%85%D8%AA%D8%AD%D8%AF%D8%A9');
  assert.equal(ar.apple, 'https://maps.apple.com/?q=%D9%81%D9%86%D8%A7%D8%AF%D9%82%20London%2C%20%D8%A7%D9%84%D9%85%D9%85%D9%84%D9%83%D8%A9%20%D8%A7%D9%84%D9%85%D8%AA%D8%AD%D8%AF%D8%A9&sll=51.47,-0.45');
  const ja = H.mapLinks(B.fmt('hotelsInCity', 'ja', { CITY: sp('London', 'GB', 'ja') }, true), null);
  assert.equal(ja.google, 'https://www.google.com/maps/search/?api=1&query=London%2C%20%E3%82%A4%E3%82%AE%E3%83%AA%E3%82%B9%E3%81%AE%E3%83%9B%E3%83%86%E3%83%AB');
  assert.equal(decodeURIComponent(new URL(ja.apple).searchParams.get('q')), 'London, イギリスのホテル');

  // the app's page, run as it is written: the heading in the phone's language, its city with
  // where it is, is the search; the city's airport the point; big buttons, each opening its map
  // in a new tab; Apple's on an Apple device only
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  const ANDROID_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const page = (city, name, L, where, ua) => {
    const ctx = { window: { BoardStrings: B, HotelListCard: H, AIRPORT_COORDS: { YYZ: [43.68, -79.63], YUL: [45.47, -73.74] }, navigator: { userAgent: ua == null ? IPHONE : ua } },
      esc, hlIco: (k) => '<i class="hl-ico">' + H.ICON[k] + '</i>' };
    ctx.AIRPORT_COORDS = ctx.window.AIRPORT_COORDS;
    vm.createContext(ctx);
    vm.runInContext(appFn('hlFindHtml') + '\nthis.out = hlFindHtml(' + [city, name, L, where].map((x) => JSON.stringify(x == null ? '' : x)).join(',') + ');', ctx);
    return ctx.out;
  };
  const hrefsOf = (html) => [...html.matchAll(/<a class="hl-map" href="([^"]+)" target="_blank" rel="noopener">/g)].map((x) => x[1].replace(/&amp;/g, '&'));
  const en = page('YYZ', 'Toronto', 'en', 'CA-ON');
  assert.deepEqual(hrefsOf(en), ['https://www.google.com/maps/search/?api=1&query=Hotels%20in%20Toronto%2C%20ON%2C%20Canada', 'https://maps.apple.com/?q=Hotels%20in%20Toronto%2C%20ON%2C%20Canada&sll=43.68,-79.63']);
  assert.ok(en.includes('<span>' + B.bs('hotelsMapGoogle', 'en') + '</span>') && en.includes('<span>' + B.bs('hotelsMapApple', 'en') + '</span>'));
  assert.equal((en.match(/<svg/g) || []).length, 2, 'a pin on each button');
  const fr = page('YUL', 'Montréal', 'fr', 'CA-QC');
  assert.ok(fr.includes('query=H%C3%B4tels%20%C3%A0%20Montr%C3%A9al%2C%20QC%2C%20Canada"') && fr.includes('q=H%C3%B4tels%20%C3%A0%20Montr%C3%A9al%2C%20QC%2C%20Canada&amp;sll=45.47,-73.74"'), 'French: the French heading, encoded');
  assert.ok(fr.includes(B.esc(B.bs('hotelsMapApple', 'fr'))));
  // a city whose airport position has not arrived, and nothing to say where it is: the search alone
  assert.ok(page('BOS', 'Boston', 'en', '').includes('href="https://maps.apple.com/?q=Hotels%20in%20Boston"'));
  // an iPad asking for the desktop site says Macintosh: Apple's too
  assert.equal(hrefsOf(page('YYZ', 'Toronto', 'en', 'CA-ON', IPAD_DESKTOP)).length, 2);
  // an Android phone, or one asking for the desktop site: Google's alone
  for (const ua of [ANDROID, ANDROID_DESKTOP, '']) {
    const a = page('YYZ', 'Toronto', 'en', 'CA-ON', ua);
    assert.deepEqual(hrefsOf(a), ['https://www.google.com/maps/search/?api=1&query=Hotels%20in%20Toronto%2C%20ON%2C%20Canada'], ua || 'no user agent');
    assert.ok(!a.includes(B.bs('hotelsMapApple', 'en')));
  }
  // the wiring: a code without a list opens the search page, for a city the app has a name for;
  // the airports' positions are asked for and the page drawn again when they arrive
  assert.match(APP, /function openHotelSearch\(c,where\)\{\n  const nm=placeOf\(c\)\.c;\n  if\(!\/\^\[A-Z0-9\]\{3\}\$\/\.test\(c\)\|\|!nm\|\|nm===c\|\|nm==='—'\)return;/);
  assert.match(APP, /_coords\(\)\.then\(function\(\)\{if\(HL_CITY===c&&HL_FIND\)renderHotels\(\);\}\);/);
  assert.match(APP, /if\(HL_FIND\)\{body\.innerHTML=hlFindHtml\(city,cityName,L,HL_WHERE\);return;\}/);
  for (const k of ['hotelsMapGoogle', 'hotelsMapApple']) assert.ok(APP.includes("'" + k + "'"), 'app.html uses ' + k);
});

test('every other city: the deck draws the card through render(), the code drawn at the size it is shown and again when its room changes', () => {
  // a stand-in for the slot of the deck: the markup it is given, and a box for each code in it
  const slot = () => {
    const el = { html: '', boxes: [] };
    Object.defineProperty(el, 'innerHTML', {
      get() { return el.html; },
      set(v) {
        el.html = String(v);
        el.boxes = [...el.html.matchAll(/class="hlc-qr" data-qr-url="([^"]+)"/g)].map((m) => {
          const at = { 'data-qr-url': m[1].replace(/&amp;/g, '&') };
          return { clientWidth: 0, innerHTML: '', getAttribute: (k) => (k in at ? at[k] : null), setAttribute: (k, x) => { at[k] = String(x); } };
        });
      }
    });
    el.querySelector = (sel) => (sel === ':scope > .hlc' && el.html ? {} : null);
    el.querySelectorAll = (sel) => (sel === '.hlc-qr[data-qr-url]' ? el.boxes : []);
    return el;
  };
  const drawn = [];
  function QRCode(box, o) { drawn.push({ url: o.text, w: o.width, h: o.height }); }
  QRCode.CorrectLevel = { M: 0 };
  // the large code's padding, 14 px at 1680x1050
  const padded = () => ({ paddingLeft: '14px', paddingRight: '14px' });
  const g = (cf) => anyGate({ _gateCurrentFlight: cf, QRCode, getComputedStyle: padded, _IATA_CC: { YYZ: 'CA' }, _rowRegion: (c) => (c === 'YYZ' ? 'ON' : '') });

  // a flight to Toronto, no list: render() draws the one card of a city without a list
  const el = slot();
  assert.equal(onGate(g({ _locIata: 'YYZ' }), () => H.render(el)), true);
  assert.match(el.html, /^<div class="hlc hlc--find" data-city="YYZ">/);
  assert.equal(el.boxes.length, 1);
  assert.deepEqual(drawn.pop(), { url: 'https://orionconnected.app/app?ap=YHZ&hotels=YYZ&in=CA-ON', w: 64, h: 64 }, 'before it is laid out: the smallest code');
  // laid out at 1680x1050: a box 448 px wide with 14 px of padding each side shows the code at
  // 420 px, and it is drawn at 420 px (never drawn larger and scaled down)
  el.boxes[0].clientWidth = 448;
  assert.equal(onGate(g({ _locIata: 'YYZ' }), () => H.render(el)), true);
  assert.deepEqual(drawn.pop(), { url: 'https://orionconnected.app/app?ap=YHZ&hotels=YYZ&in=CA-ON', w: 420, h: 420 });
  // the same room is the same code (the board repaints often); a room a few pixels smaller, as
  // when the faces arrive and the heading settles, draws it again at its new size
  onGate(g({ _locIata: 'YYZ' }), () => H.render(el));
  assert.equal(drawn.length, 0, 'not drawn again at the same size');
  el.boxes[0].clientWidth = 443;
  onGate(g({ _locIata: 'YYZ' }), () => H.render(el));
  assert.deepEqual(drawn.pop(), { url: 'https://orionconnected.app/app?ap=YHZ&hotels=YYZ&in=CA-ON', w: 415, h: 415 });
  el.boxes[0].clientWidth = 300.6;
  onGate(g({ _locIata: 'YYZ' }), () => H.render(el));
  assert.deepEqual(drawn.pop(), { url: 'https://orionconnected.app/app?ap=YHZ&hotels=YYZ&in=CA-ON', w: 272, h: 272 });

  // a flight to Moncton: the same slot draws the checked list, never the find card
  const list = slot();
  assert.equal(onGate(g({ _locIata: 'YQM' }), () => H.render(list)), true);
  assert.match(list.html, /^<div class="hlc( hlc--one)?" data-city="YQM">/);
  assert.doesNotMatch(list.html, /hlc--find|&amp;in=/);
  drawn.length = 0;
  // no flight, or a city with no name: nothing drawn, the deck passes the slot over
  for (const cf of [null, { _locIata: 'QQZ' }]) {
    const none = slot();
    assert.equal(onGate(g(cf), () => H.render(none)), false);
    assert.equal(none.html, '');
  }
});

test('every other city: the phone app opens the search page for a city without a list, the list for a city with one, and forgets the search when it closes', () => {
  const shown = new Set();
  const ctx = {
    window: { HotelListCard: H, BoardStrings: B },
    AIRPORTS: { YYZ: { r: 'CA' }, SJU: { r: 'INT' }, YQM: { r: 'CA' } },
    placeOf: (c) => ({ c: ({ YYZ: 'Toronto', SJU: 'San Juan', YQM: 'Moncton', STI: 'Santiago' })[c] || c }),
    renders: 0,
    document: {
      getElementById: (id) => (id === 'hotels' ? { classList: { contains: (k) => shown.has(k), add: (k) => shown.add(k), remove: (k) => shown.delete(k) }, setAttribute() {} } : null)
    },
    history: { state: null, pushed: 0, backs: 0, pushState(st) { this.state = st; this.pushed++; }, back() { this.state = null; this.backs++; } }
  };
  ctx.renderHotels = () => { ctx.renders++; };
  ctx._coords = () => Promise.resolve({});
  vm.createContext(ctx);
  const decl = (APP.match(/let HL_CITY='',HL_AREA='',HL_FIND=false,HL_WHERE='';/) || [])[0];
  assert.ok(decl, 'the page keeps where the city is beside the city');
  vm.runInContext(decl + '\n' + appFn('openHotelSearch') + '\n' + appFn('openHotels') + '\n' + appFn('closeHotels')
    + '\nthis.st = function () { return { city: HL_CITY, find: HL_FIND, where: HL_WHERE, area: HL_AREA }; };', ctx);
  const st = () => Object.assign({}, ctx.st(), { open: shown.has('show') });
  // what a closed page keeps: no city, no search (its last area is set again when it opens)
  const closed = () => { const o = st(); delete o.area; return o; };

  // the scan code of Toronto's card: the search page, where the city is as the code says
  ctx.openHotels('yyz', '', 'ca-on');
  assert.deepEqual(st(), { city: 'YYZ', find: true, where: 'CA-ON', area: '', open: true });
  assert.equal(ctx.history.pushed, 1);
  // back (popstate): closed, and the search forgotten
  ctx.closeHotels(true);
  assert.deepEqual(closed(), { city: '', find: false, where: '', open: false });
  assert.equal(ctx.history.backs, 0, 'the browser has gone back already');
  // a link that says nothing valid: one of the app's own airports keeps its country; any other
  // city, nothing
  ctx.openHotels('YYZ', '', 'CA-NS&x=1');
  assert.equal(st().where, 'CA');
  ctx.closeHotels(true);
  ctx.openHotels('SJU', '', '');
  assert.equal(st().where, '', 'the app files San Juan under INT, not a country');
  ctx.closeHotels(true);
  ctx.openHotels('STI', '', 'DO');
  assert.deepEqual(st(), { city: 'STI', find: true, where: 'DO', area: '', open: true });
  // Moncton from the search page: its list, and the search forgotten
  ctx.openHotels('YQM', 'downtown', 'CA-NB');
  assert.deepEqual(st(), { city: 'YQM', find: false, where: '', area: 'downtown', open: true });
  assert.equal(ctx.history.pushed, 4, 'no second step in the history for a page already open');
  // closed by its own button: the history step is taken back
  ctx.closeHotels();
  assert.deepEqual(closed(), { city: '', find: false, where: '', open: false });
  assert.equal(ctx.history.backs, 1);
  // a code the app has no name for opens nothing
  ctx.openHotels('QQZ', '', 'CA');
  assert.deepEqual(closed(), { city: '', find: false, where: '', open: false });
  // the wiring: back closes the page; the scan code's in= reaches it
  assert.match(APP, /window\.addEventListener\('popstate',function\(\)\{closeFlight\(true\);closeHotels\(true\);\}\);/);
  assert.match(APP, /if\(hl\)openHotels\(hl,q\.get\('area'\)\|\|'',q\.get\('in'\)\|\|''\);/);
});
