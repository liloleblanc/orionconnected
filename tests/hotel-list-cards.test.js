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
// to the whole list in the phone app. A hub city (Toronto, v24177) shows two
// pages instead, near the airport then downtown. The Accor pages and the page of the
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
const KEYS = ['hotelsAirport', 'hotelsDowntown', 'hotelsNearby', 'hotelsResorts', 'hotelShuttle', 'hotelListScan', 'hotelsInCity', 'hotelCall', 'credOsmLine', 'hotelsFindScan', 'hotelsMapGoogle', 'hotelsMapApple',
  // v24177: the two pages of a hub city
  'hotelsWhereToStay', 'hotelsAreaAirport', 'hotelsAreaDowntown', 'hotelsCountTwo', 'hotelsCountFew', 'hotelsCountMany', 'hotelsCountOther',
  'hotelsMoreAirport', 'hotelsMoreDowntown', 'hotelsScan', 'hotelsPartnerSlot', 'hotelsPlacement', 'hotelsNoEndorse', 'hotelsTrainFree', 'hotelsRideTo', 'hotelsRideTime',
  // v24178: how a hotel of a hub city is reached from the terminals (the board's own word for a
  // terminal, and the legend of the train)
  'arrTerminal', 'hotelsTrainFrom'];
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
    '_IATA_CC', 'airportCountry', '_rowRegion', 'QRCode', 'getComputedStyle', '_axrPageSync', '_wxCityPic', '_wxPicCreditHtml'];
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
const CITY_NAMES = { YQM: 'Moncton', YYG: 'Charlottetown', YHZ: 'Halifax', YFC: 'Fredericton', YYZ: 'Toronto · Pearson' };
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
  assert.match(BUILD, /const CARD = require\(path\.join\(ROOT, 'fids-current', 'js', 'hotel-list-card\.js'\)\);[\s\S]*const CITIES = CARD\.CITIES\./);
  assert.equal((BUILD.match(/require\(path\.join\(ROOT, 'fids-current', 'js', 'hotel-list-card\.js'\)\)/g) || []).length, 1, 'the module read once');
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
  // the hub cities (v24177) are cities of the list, named once in the module; the build step
  // reads them from it, and every checked file agrees with them (a hub block only in a hub city)
  assert.ok(H.HUBS.length >= 1 && H.HUBS.every((c) => H.CITIES.includes(c)), 'HUBS within CITIES');
  assert.equal((SRC.match(/var HUBS = \[/g) || []).length, 1);
  assert.match(BUILD, /const HUBS = CARD\.HUBS\./);
  assert.deepEqual(RT.HUBS, H.HUBS.map((c) => c.toLowerCase()));
  for (const [C, doc] of Object.entries(DOCS)) {
    assert.deepEqual(RT.hubProblems(doc), [], C);
    assert.equal(!!doc.hub, H.HUBS.includes(C), C + ': a hub block only in a hub city');
  }
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
    // small: the fields the cards and the app read, and nothing of the sources (a budget a
    // hotel, so a hub city with dozens of hotels is held to the same measure as a small city)
    const bytes = Buffer.byteLength(read('fids-current/data/hotels/' + code + '.json'));
    assert.ok(bytes < 1500 + 400 * RUN[C].hotels.length, code + ' is slim: ' + bytes + ' bytes for ' + RUN[C].hotels.length + ' hotels');
    // the hub block, the street and the card mark only in a hub city's copy
    const hubCity = H.HUBS.includes(C);
    assert.equal('hub' in RUN[C], hubCity, code + ': hub block');
    assert.ok(RUN[C].hotels.every((h) => ('street' in h.address) === hubCity), code + ': street');
    if (!hubCity) assert.ok(RUN[C].hotels.every((h) => !('card' in h)), code + ': no card hotel');
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
  // Toronto (v24177): the board's own points too, its centre DOWNTOWN_COORDS.YYZ (City Hall)
  const tc = /'YYZ':\s*\{\s*lat:\s*([\d.-]+),\s*lng:\s*([\d.-]+)/.exec(CORE);
  assert.ok(tc, 'DOWNTOWN_COORDS.YYZ');
  assert.deepEqual([DOCS.YYZ.points.centre.lat, DOCS.YYZ.points.centre.lng], [Number(tc[1]), Number(tc[2])]);
  const ta = /YYZ:\[([\d.-]+),([\d.-]+)\]/.exec(read('fids-current/js/airport-coords.js'));
  assert.deepEqual([DOCS.YYZ.points.airport.lat, DOCS.YYZ.points.airport.lng], [Number(ta[1]), Number(ta[2])]);
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
  // Toronto (v24178): 33 of 44 listed, the airport and downtown only (a hub city); eleven held back
  // until a person settles them: among them the six facts that rest on the tourism booking listing
  // alone (until a person agrees it counts), Woodbine and the Alexandra (still trading?). Best
  // Western Premier is excluded: its brand page answered 403. Six airport hotels were read by a
  // person in a browser on 2026-11-23, on pages that refuse automated readers, and are listed; the
  // Nu Hotel's page would not open for that person either: it stays excluded
  assert.deepEqual(H.cards(DOCS.YYZ, NOV16).map((c) => c.area + ':' + c.hotels.length), ['airport:9', 'downtown:24']);
  const READ = ['sheraton-gateway-hotel-in-toronto-international-airport', 'element', 'four-points', 'quality-inn', 'fairfield-inn-suites-by-marriott-toronto-airport',
    'hampton-inn-suites-by-hilton-toronto-airport'];
  for (const id of READ) {
    const h = DOCS.YYZ.hotels.find((x) => x.id === id);
    assert.ok(h && h.listed && ids('YYZ', NOV16).includes(id), id + ' is listed');
    for (const f of ['name', 'street', 'phone']) {
      assert.equal(h.verified[f].verified, true, id + ' ' + f);
      assert.equal(h.verified[f].method, 'read by a person in a browser, 2026-11-23', id + ' ' + f + ': who read it, and when');
      assert.equal(h.verified[f].checked, '2026-11-23', id + ' ' + f);
    }
    assert.ok(!DOCS.YYZ.excluded.some((e) => e.id === id), id + ' is no longer excluded');
    // the shuttle fact they read keeps who read it, and when (marked or not)
    for (const o of [h.shuttle, h.verified.shuttle]) assert.equal(o.method, 'read by a person in a browser, 2026-11-23', id + ' shuttle: who read it, and when');
    assert.equal(h.verified.shuttle.verified, h.shuttle.mark, id + ': a marked shuttle is verified, an unmarked one is not');
  }
  // the Sheraton Gateway: the check's shuttle answer was free, but no page read names a hotel
  // shuttle, nor says there is none: unknown (null), as for the Alt Hotel, and no mark
  const SHG = DOCS.YYZ.hotels.find((x) => x.id === 'sheraton-gateway-hotel-in-toronto-international-airport');
  assert.deepEqual([SHG.shuttle.offered, SHG.shuttle.mark, SHG.shuttle.verified], [null, false, false]);
  assert.match(SHG.shuttle.evidence, /The check’s shuttle answer was "free"/);
  assert.doesNotMatch(SHG.shuttle.evidence, /on review/);
  // two names the same page also writes in Marriott's long form: the confirmed one shown, both kept
  for (const [id, shown, long] of [['element', 'Element Toronto Airport', 'Element by Marriott Toronto Airport'],
    ['fairfield-inn-suites-by-marriott-toronto-airport', 'Fairfield Inn & Suites Toronto Airport', 'Fairfield by Marriott Inn & Suites Toronto Airport']]) {
    const h = DOCS.YYZ.hotels.find((x) => x.id === id);
    assert.equal(h.name, shown, id);
    assert.ok(h.verified.name.note.includes('"' + shown + '"') && h.verified.name.note.includes('"' + long + '"') && /For a person: look once at the heading of the page/.test(h.verified.name.note), id + ': both forms, and the look a person owes it');
    assert.ok(h.shuttle.evidence.includes(long), id + ': the long form is the one in the copied line');
  }
  // six read, a seventh page would not open
  assert.match(DOCS.YYZ.notes.verified_definition, /six hotels: a seventh page, the Nu Hotel’s, would not open/);
  assert.match(DOCS.YYZ.excluded.find((e) => e.id === 'nu-hotel').reason, /A person tried https:\/\/nuhoteltoronto\.com\/ in a browser on 2026-11-23: it would not open there either\./);
  // the Quality Inn: placed by position (5.2 km from the other Quality Inn), read on the tourism listing
  const QI = DOCS.YYZ.hotels.find((x) => x.id === 'quality-inn');
  assert.match(QI.notes, /5585 Ambler Drive, 5\.2 km from this one \(3\.9 km from the airport point\)/);
  assert.equal(Math.round(H.km(QI, DOCS.YYZ.points.airport) * 10) / 10, QI.distance_km.airport);
  assert.match(QI.verified.latlng.note, /read on the tourism listing of visitmississauga\.ca/);
  // the two hotels of one building (6257 Airport Road) keep telephones of their own
  const [el, fp] = ['element', 'four-points'].map((id) => DOCS.YYZ.hotels.find((x) => x.id === id));
  assert.equal(el.address.street, fp.address.street);
  assert.notEqual(el.phone, fp.phone);
  for (const held of ['the-alexandra-hotel', 'ramada-plaza', 'woodbine-hotel-banquet-hall', 'hyatt-place-toronto-airport', 'shangri-la', 'hyatt-regency-toronto',
    'revery-toronto-downtown-curio-collection-by-hilton', 'park-hyatt-toronto', 'the-sutton-place-hotel-toronto']) assert.ok(!ids('YYZ', NOV16).includes(held), held + ' is held back');
  assert.ok(!DOCS.YYZ.hotels.some((h) => h.id === 'best-western-premier-toronto'));
  assert.equal(DOCS.YYZ.excluded.find((e) => e.id === 'best-western-premier-toronto').kind, 'blocked');
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
  // Toronto (v24178): the hotels' own pages and brand property pages (the Element, the Four Points, the
  // Hampton and the Fairfield read by a person in a browser on 2026-11-23); Woodbine is held. The Quality
  // Inn's shuttle rests on the tourism listing alone, and the Sheraton Gateway is joined to Terminal 3
  // (the airport's train, not a hotel shuttle): neither is marked
  assert.deepEqual(DOCS.YYZ.hotels.filter((h) => h.shuttle.mark).map((h) => h.id).sort(), ['element', 'fairfield-inn-suites-by-marriott-toronto-airport', 'four-points',
    'hampton-inn-suites-by-hilton-toronto-airport', 'sandman-hotel-toronto-airport', 'sandman-signature', 'woodbine-hotel-banquet-hall']);
  for (const h of DOCS.YYZ.hotels.filter((x) => x.shuttle.mark)) assert.doesNotMatch(h.shuttle.source, /visitmississauga|destinationtoronto|mangahotels|eastonsgroup|silverhotelgroup/, h.id + ': the hotel\'s own page');
  for (const id of ['quality-inn', 'sheraton-gateway-hotel-in-toronto-international-airport']) assert.equal(DOCS.YYZ.hotels.find((h) => h.id === id).shuttle.mark, false, id);
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
  for (const k of [...Object.values(H.HUB_HEAD), ...Object.values(H.HUB_MORE), ...Object.values(H.TRANSIT)]) assert.ok(KEYS.includes(k), k);
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
  assert.equal(at({ _locIata: 'YOW' }), '', 'no list for Ottawa');
  assert.equal(at({ _locIata: 'YOW', _stops: ['YQM', 'YOW'] }), 'YQM', 'a stop with a list counts');
  assert.equal(at({ _locIata: 'YHZ', _stops: ['YQM', 'YHZ'] }), 'YHZ', 'the city the flight goes to comes before a stop with a list');
  assert.equal(at({ _locIata: 'YOW', _stops: ['YQM', 'YHZ', 'YOW'] }), 'YHZ', 'the last stop with a list first');
  // a hub city (Toronto) counts as the city the flight goes to, never as a stop (v24177): a flight
  // through Toronto to Vancouver is no Toronto list; an earlier stop with a list still counts
  assert.equal(at({ _locIata: 'YYZ' }), 'YYZ', 'the Toronto pages for a flight to Toronto');
  assert.equal(at({ _locIata: 'YYZ', _stops: ['YQM', 'YYZ'] }), 'YYZ');
  assert.equal(at({ _locIata: 'YVR', _stops: ['YYZ', 'YVR'] }), '', 'a hub as a stop is no list');
  assert.equal(at({ _locIata: 'YVR', _stops: ['YQM', 'YYZ', 'YVR'] }), 'YQM', 'the stop with a list before the hub');
  assert.equal(at(null), '', 'no flight, nothing');
  // the list is for the city the flight goes to, never the city of the screen: a departure
  // from Halifax to Toronto has no Halifax hotels; Montreal to Moncton has the Moncton list
  const from = (ia, cf) => onGate(gate({ _gateIata: ia, _gateCurrentFlight: cf, _flightLegs: legs }), () => H.cityFor());
  assert.equal(from('YHZ', { _locIata: 'YOW' }), '', 'no Halifax list on a departure from Halifax');
  assert.equal(from('YQM', { _locIata: 'YUL' }), '', 'no Moncton list on a departure from Moncton');
  assert.equal(from('YYG', null), '', 'an empty gate at a city with a list shows none');
  assert.equal(from('YQM', { _locIata: 'YHZ' }), 'YHZ', 'Moncton to Halifax: the Halifax list');
  assert.equal(from('YUL', { _locIata: 'YQM' }), 'YQM', 'Montreal to Moncton: the Moncton list');
  // due only with the list loaded and something open
  assert.equal(onGate(gate({ _gateCurrentFlight: { _locIata: 'YYG' }, _flightLegs: legs }), () => H.due()), true);
  assert.equal(onGate(gate({ _gateCurrentFlight: { _locIata: 'YOW' }, _flightLegs: legs }), () => H.due()), false);
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
  // the scan code: navy modules on the cream, no white box (on the photograph of a city without
  // a list the code stands on a tile of that same cream, its quiet zone: never white)
  assert.match(SRC, /colorDark: '#14203c', colorLight: '#f5efe3'/);
  assert.doesNotMatch(CSS.replace(/\.hlc-find--pic \.hlc-find-scan \.hlc-qr\{ background:var\(--hlc-cream\);/, ''), /\.hlc-qr\{[^}]*background/);
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
const BOARD_NAMES = { YYZ: 'TORONTO', YOW: 'OTTAWA', YUL: 'MONTREAL', YQM: 'MONCTON', YYG: 'CHARLOTTETOWN', YHZ: 'HALIFAX', LHR: 'LONDON', YYT: "ST. JOHN'S", BOS: 'BOSTON' };
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
  // Halifax to Ottawa: no list for Ottawa, its card
  assert.equal(find({ _locIata: 'YOW' }), 'YOW');
  assert.equal(list({ _locIata: 'YOW' }), '', 'and no list');
  // a city with a checked list: the list, never the card
  for (const C of H.CITIES) {
    assert.equal(find({ _locIata: C }, { _gateIata: 'YUL' }), '', C + ': its list shows instead');
    assert.equal(list({ _locIata: C }, { _gateIata: 'YUL' }), C);
  }
  // a stop with a list counts for the list, as before: no card then
  assert.equal(find({ _locIata: 'YOW', _stops: ['YQM', 'YOW'] }, { _gateIata: 'YUL' }), '', 'a stop with a list: the list');
  // a hub city as a stop is no list: the city the flight goes to has its card (v24177)
  assert.equal(find({ _locIata: 'YOW', _stops: ['YYZ', 'YOW'] }, { _gateIata: 'YUL' }), 'YOW', 'through Toronto to Ottawa: the Ottawa card');
  // nor a card: through Toronto to a code with no name, or home again, is no Toronto card
  assert.equal(find({ _locIata: 'QQZ', _stops: ['YYZ', 'QQZ'] }, { _gateIata: 'YUL' }), '', 'a hub as a stop: no card either');
  assert.equal(find({ _locIata: 'YUL', _stops: ['YYZ', 'YUL'] }, { _gateIata: 'YUL' }), '', 'nor on the way home');
  assert.equal(find({ _locIata: 'QQZ', _stops: ['BOS', 'YYZ', 'QQZ'] }, { _gateIata: 'YUL' }), 'BOS', 'the stop before it, where it has a name');
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
  assert.equal(onGate(gateOf({ _locIata: 'YOW' }), () => H.due()), true);
  assert.equal(onGate(gateOf({ _locIata: 'YOW' }), () => H.dwellMs()), H.FIND_MS);
  assert.equal(H.FIND_MS, 20000);
  assert.equal(onGate(gateOf(null), () => H.due()), false, 'no flight: nothing due');
  assert.equal(onGate(gateOf({ _locIata: 'QQZ' }), () => H.due()), false, 'no name: nothing due');
  assert.equal(onGate(gateOf({ _locIata: 'YQM' }), () => H.due()), true, 'Moncton: the list, loaded');
  assert.equal(onGate(gateOf({ _locIata: 'YQM' }), () => H.dwellMs()), 4 * 10000 + 4000, 'and the list keeps its own dwell');
  // nothing to warm: no logo, no picture
  assert.deepEqual(onGate(gateOf({ _locIata: 'YOW' }), () => H.media()), []);
});

test('every other city: the review link shows the card of a city without a list on any gate, and a list city keeps its list', () => {
  const rv = (q, cf) => onGate(anyGate({ _gateCurrentFlight: cf || null, location: { search: q, hostname: 'localhost', origin: 'http://localhost:8129' } }), () => ({ list: H.cityFor(), find: H.findCity(), due: H.due() }));
  assert.deepEqual(rv('?hotellist=YOW&scene=hotellist'), { list: '', find: 'YOW', due: true }, 'Ottawa, on a gate with no flight');
  assert.deepEqual(rv('?hotellist=yow&scene=hotellist', { _locIata: 'YQM' }), { list: '', find: 'YOW', due: true }, 'the link wins over the flight');
  assert.deepEqual(rv('?hotellist=YQM&scene=hotellist'), { list: 'YQM', find: '', due: true }, 'Moncton keeps its list');
  assert.deepEqual(rv('?hotellist=YYZ&scene=hotellist'), { list: 'YYZ', find: '', due: true }, 'Toronto: its two pages (v24177)');
  assert.deepEqual(rv('?hotellist=QQZ'), { list: '', find: '', due: false }, 'a code with no name shows nothing');
  assert.deepEqual(rv('?hotellist=toolong', { _locIata: 'YOW' }), { list: '', find: 'YOW', due: true }, 'a link that names no code is no link');
  // a code the board has no name for is no link either: the gate shows what it shows without one
  assert.deepEqual(rv('?hotellist=QQZ', { _locIata: 'YQM' }), { list: 'YQM', find: '', due: true }, 'the Moncton list of the gate, as before');
  assert.deepEqual(rv('?hotellist=QQZ', { _locIata: 'YOW' }), { list: '', find: 'YOW', due: true }, 'the Ottawa card of the gate');
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
  // no logo, no hotel, no price (and, on a board without the weather card, no picture): the only
  // drawing is the phone mark
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

test('every other city: the city in its own photograph behind the card, the one the weather card shows, its photographer named where the licence asks; the plain card without one', () => {
  const credit = (urls, cls) => (urls[0] === '/logos/cities/YUL.jpg' ? '<div class="' + cls + '"><span class="pcr-who">A</span></div>' : '');
  const asked = [];
  const pic = (u) => anyGate({ _wxCityPic: (c, night) => { asked.push([c, night]); return u.split('{C}').join(c); }, _wxPicCreditHtml: credit });
  const yyz = onGate(pic('/logos/cities/{C}.jpg'), () => H.buildFind('YYZ', ['fr', 'en'], { home: 'YHZ' }));
  // the day picture of the city the card names
  assert.deepEqual(asked[0], ['YYZ', false]);
  assert.match(yyz, /<div class="axr-page hlc-view hlc-find hlc-find--pic axr-page-on" data-area="find"><div class="hlc-find-pic" aria-hidden="true" style="background-image:url\(&#39;\/logos\/cities\/YYZ\.jpg&#39;\)"><\/div><div class="hlc-find-head">/);
  // a picture whose licence asks for nothing names nobody; one that does names its photographer
  // beside the code, with the weather card's own line
  assert.doesNotMatch(yyz, /hlc-find-credit/);
  const yul = onGate(pic('/logos/cities/{C}.jpg'), () => H.buildFind('YUL', ['fr', 'en'], { home: 'YHZ' }));
  assert.ok(yul.includes('"></div><div class="hlc-find-credit"><span class="pcr-who">A</span></div></div>'), 'the credit inside the code’s area');
  // only a picture of the board's own set: never the picture service, a night picture, another
  // site, or an address that would break out of the style
  for (const u of ['/citypic?iata={C}&q=Toronto', '/logos/cities/{C}-night.jpg', '', 'https://x.example/logos/cities/{C}.jpg', "/logos/cities/{C}.jpg');background:red;('", '/logos/cities/../{C}.jpg']) {
    const h = onGate(pic(u), () => H.buildFind('YYZ', ['en'], {}));
    assert.doesNotMatch(h, /hlc-find-pic|hlc-find--pic|hlc-find-credit/, u);
    assert.match(h, /^<div class="hlc hlc--find hlc--one"/, u);
  }
  // a board whose picture function fails shows the plain card
  assert.doesNotMatch(onGate(anyGate({ _wxCityPic: () => { throw new Error('x'); } }), () => H.buildFind('YYZ', ['en'], {})), /hlc-find-pic/);
  // the look: navy at the top for a white heading, the code on a tile of the card's own paper
  // (its quiet zone), the photographer in white beside it; inside the section, never after the foot
  const at = CSS.indexOf('.hlc .hlc-find--pic{');
  assert.ok(at > CSS.indexOf('/* ── the card of a city without a list') && at < CSS.indexOf('/* ── foot ── */'));
  assert.match(CSS, /\.hlc-find-pic\{ position:absolute; inset:0; z-index:-1; background-position:center; background-size:cover;/);
  assert.match(CSS, /\.hlc-find--pic \.hlc-find-title\{ color:#fff;/);
  assert.match(CSS, /\.hlc-find--pic \.hlc-find-scan \.hlc-qr\{ background:var\(--hlc-cream\);/);
  assert.match(CSS, /\.hlc-find-credit\{ position:absolute;[^}]*font-size:calc\(18 \* var\(--hlc-px\)\);/);
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
  const g = (cf) => anyGate({ _gateCurrentFlight: cf, QRCode, getComputedStyle: padded, _IATA_CC: { YOW: 'CA' }, _rowRegion: (c) => (c === 'YOW' ? 'ON' : '') });

  // a flight to Ottawa, no list: render() draws the one card of a city without a list
  const el = slot();
  assert.equal(onGate(g({ _locIata: 'YOW' }), () => H.render(el)), true);
  assert.match(el.html, /^<div class="hlc hlc--find" data-city="YOW">/);
  assert.equal(el.boxes.length, 1);
  assert.deepEqual(drawn.pop(), { url: 'https://orionconnected.app/app?ap=YHZ&hotels=YOW&in=CA-ON', w: 64, h: 64 }, 'before it is laid out: the smallest code');
  // laid out at 1680x1050: a box 448 px wide with 14 px of padding each side shows the code at
  // 420 px, and it is drawn at 420 px (never drawn larger and scaled down)
  el.boxes[0].clientWidth = 448;
  assert.equal(onGate(g({ _locIata: 'YOW' }), () => H.render(el)), true);
  assert.deepEqual(drawn.pop(), { url: 'https://orionconnected.app/app?ap=YHZ&hotels=YOW&in=CA-ON', w: 420, h: 420 });
  // the same room is the same code (the board repaints often); a room a few pixels smaller, as
  // when the faces arrive and the heading settles, draws it again at its new size
  onGate(g({ _locIata: 'YOW' }), () => H.render(el));
  assert.equal(drawn.length, 0, 'not drawn again at the same size');
  el.boxes[0].clientWidth = 443;
  onGate(g({ _locIata: 'YOW' }), () => H.render(el));
  assert.deepEqual(drawn.pop(), { url: 'https://orionconnected.app/app?ap=YHZ&hotels=YOW&in=CA-ON', w: 415, h: 415 });
  el.boxes[0].clientWidth = 300.6;
  onGate(g({ _locIata: 'YOW' }), () => H.render(el));
  assert.deepEqual(drawn.pop(), { url: 'https://orionconnected.app/app?ap=YHZ&hotels=YOW&in=CA-ON', w: 272, h: 272 });

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
    AIRPORTS: { YOW: { r: 'CA' }, SJU: { r: 'INT' }, YQM: { r: 'CA' } },
    placeOf: (c) => ({ c: ({ YOW: 'Ottawa', SJU: 'San Juan', YQM: 'Moncton', STI: 'Santiago' })[c] || c }),
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

  // the scan code of Ottawa's card: the search page, where the city is as the code says
  ctx.openHotels('yow', '', 'ca-on');
  assert.deepEqual(st(), { city: 'YOW', find: true, where: 'CA-ON', area: '', open: true });
  assert.equal(ctx.history.pushed, 1);
  // back (popstate): closed, and the search forgotten
  ctx.closeHotels(true);
  assert.deepEqual(closed(), { city: '', find: false, where: '', open: false });
  assert.equal(ctx.history.backs, 0, 'the browser has gone back already');
  // a link that says nothing valid: one of the app's own airports keeps its country; any other
  // city, nothing
  ctx.openHotels('YOW', '', 'CA-NS&x=1');
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

// ══════════════════════════════════════════════════════════════════════════
// A HUB CITY (v24177, HotelListCard.HUBS: Toronto): the same slot shows two
// pages, near the airport then downtown, each only for an area with at least
// HUB_MIN hotels open: the city and its province, "Where to stay", the scan
// code of the area; the area and its count; the way there; the place of a
// partner hotel, or the card hotels in a gold frame; five lines less one a card
// hotel, turning with the deck; how many more; the navy foot.
// ══════════════════════════════════════════════════════════════════════════

const hubBuild = (L, o, doc) => onGate(gate(), () => H.build(doc || RUN.YYZ, L, Object.assign({ date: NOV16, home: 'YQM' }, o || {})));
const hubView = (html, area) => views(html).find((x) => x.includes('data-area="' + area + '"'));
const rowIds = (v) => [...v.matchAll(/<div class="hlc-hub-row" data-hotel="([^"]+)"/g)].map((m) => m[1]);
const cardIds = (v) => [...v.matchAll(/<div class="hlc-hub-card" data-hotel="([^"]+)"/g)].map((m) => m[1]);
const textOf = (v) => v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// Toronto with n hotels open near the airport: the first n of its list, or, past its count,
// downtown lines copied there under ids of their own
const widen = (n) => {
  const d = JSON.parse(JSON.stringify(RUN.YYZ));
  const air = d.hotels.filter((h) => h.area === 'airport').slice(0, n);
  const extra = d.hotels.filter((h) => h.area === 'downtown' && !h.card).slice(0, Math.max(0, n - air.length)).map((h) => Object.assign({}, h, { id: 'x-' + h.id, area: 'airport' }));
  d.hotels = air.concat(extra, d.hotels.filter((h) => h.area !== 'airport'));
  return d;
};

test('a hub city: two pages in the slot, near the airport then downtown, each with the scan code of its area, held 24 seconds', () => {
  assert.deepEqual(H.HUBS, ['YYZ']);
  assert.ok(H.isHub(RUN.YYZ) && H.isHub(DOCS.YYZ) && !H.isHub(RUN.YQM));
  const html = hubBuild(['en', 'fr']);
  assert.match(html, /^<div class="hlc hlc--hub" data-city="YYZ"><div class="axr-pages hlc-views">/);
  const v = views(html);
  assert.deepEqual(v.map((x) => /data-area="([a-z]+)"/.exec(x)[1]), ['airport', 'downtown']);
  assert.ok(v[0].startsWith(' hlc-hub axr-page-on"') && !v[1].includes('axr-page-on'), 'the first page shown');
  // one code a page: the whole list in the phone app, at that area
  const urls = [...html.matchAll(/data-qr-url="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.deepEqual(urls, ['https://orionconnected.app/app?ap=YQM&hotels=YYZ&area=airport', 'https://orionconnected.app/app?ap=YQM&hotels=YYZ&area=downtown']);
  // ten seconds a page, the last held four more; due once the list is loaded
  const legs = (cf) => (cf && cf._stops) || [];
  const g = gate({ _gateCurrentFlight: { _locIata: 'YYZ' }, _flightLegs: legs });
  assert.equal(onGate(g, () => H.due()), true);
  assert.equal(onGate(g, () => H.dwellMs()), 2 * 10000 + 4000);
  // a board of one language: one half each
  assert.match(hubBuild(['de']), /^<div class="hlc hlc--hub hlc--one"/);
  // the deck warms only the logos the pages show: the card hotels'
  assert.deepEqual(onGate(g, () => H.media()), RUN.YYZ.hotels.filter((h) => h.card).map((h) => h.logo.file));
});

test('a hub city: an area shows only with at least three hotels open; one page alone is held, with no pager', () => {
  assert.equal(H.HUB_MIN, 3);
  const two = JSON.parse(JSON.stringify(RUN.YYZ));
  let kept = 0;
  two.hotels = two.hotels.filter((h) => h.area !== 'airport' || kept++ < 2);
  assert.deepEqual(H.shown(two, NOV16).map((c) => c.area), ['downtown'], 'two airport hotels: no airport page');
  const html = hubBuild(['en', 'fr'], {}, two);
  assert.equal((html.match(/class="axr-page /g) || []).length, 1, 'one page');
  assert.match(html, /<div class="axr-page hlc-view hlc-hub axr-page-on" data-area="downtown">/);
  // its dwell follows the real count of pages
  H.put('YYZ', two);
  try {
    const g = gate({ _gateCurrentFlight: { _locIata: 'YYZ' }, _flightLegs: () => [] });
    assert.equal(onGate(g, () => H.dwellMs()), 10000 + 4000);
  } finally { H.put('YYZ', RUN.YYZ); }
  // three: the page is back
  const three = JSON.parse(JSON.stringify(RUN.YYZ));
  kept = 0;
  three.hotels = three.hotels.filter((h) => h.area !== 'airport' || kept++ < 3);
  assert.deepEqual(H.shown(three, NOV16).map((c) => c.area), ['airport', 'downtown']);
  // a city that is not a hub keeps every card it has, however few its hotels
  assert.deepEqual(H.shown(RUN.YFC, NOV16).map((c) => c.area), ['airport', 'downtown', 'nearby']);
});

test('a hub city with no area open to three hotels on the day: its "Hotels in" card instead, held as that card is', () => {
  // two hotels a page: no page today
  const none = JSON.parse(JSON.stringify(RUN.YYZ));
  let a = 0, d = 0;
  none.hotels = none.hotels.filter((h) => (h.area === 'airport' ? a++ < 2 : d++ < 2));
  assert.deepEqual(H.shown(none, NOV16), []);
  assert.equal(hubBuild(['en'], {}, none), '', 'no page');
  const el = { html: '' };
  Object.defineProperty(el, 'innerHTML', { get() { return el.html; }, set(v) { el.html = String(v); } });
  el.querySelector = (sel) => (sel === ':scope > .hlc' && el.html ? {} : null);
  el.querySelectorAll = () => [];
  function QRCode() {}
  QRCode.CorrectLevel = { M: 0 };
  H.put('YYZ', none);
  try {
    const g = anyGate({ _gateIata: 'YQM', _gateCurrentFlight: { _locIata: 'YYZ' }, QRCode });
    assert.equal(onGate(g, () => H.cityFor()), 'YYZ', 'the flight still goes to a city with a list');
    assert.equal(onGate(g, () => H.findCity()), '', 'findCity keeps its word: a city with a list never names its card');
    assert.equal(onGate(g, () => H.due()), true, 'due: the card of Toronto');
    assert.equal(onGate(g, () => H.dwellMs()), H.FIND_MS);
    assert.deepEqual(onGate(g, () => H.media()), [], 'no logo to warm');
    assert.equal(onGate(g, () => H.render(el)), true);
    assert.match(el.html, /^<div class="hlc hlc--find" data-city="YYZ">/);
    assert.ok(el.html.includes('data-qr-url="https://orionconnected.app/app?ap=YQM&amp;hotels=YYZ"'), 'the code opens the list in the app');
    // a city the board has no name for: nothing, as any city without a name
    assert.equal(onGate(anyGate({ _gateCurrentFlight: { _locIata: 'YYZ' }, airportCityNameSafe_v21877: () => '' }), () => H.due()), false);
  } finally { H.put('YYZ', RUN.YYZ); }
  // with its pages back, its pages
  const g2 = anyGate({ _gateIata: 'YQM', _gateCurrentFlight: { _locIata: 'YYZ' }, QRCode });
  assert.equal(onGate(g2, () => H.dwellMs()), 2 * 10000 + 4000);
  assert.equal(onGate(g2, () => H.render(el)), true);
  assert.match(el.html, /^<div class="hlc hlc--hub" data-city="YYZ">/);
});

test('a hub city: five lines a page, one less for each card hotel (never under three), turning with the deck, none twice', () => {
  assert.deepEqual([H.HUB_ROWS, H.HUB_ROWS_MIN, H.HUB_CARDS], [5, 3, 2]);
  assert.deepEqual(H.page(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 1, 3), ['d', 'e', 'f'], 'three a page');
  assert.equal(H.page(Array.from({ length: 12 }, (_, i) => i), 0).length, 5, 'five without a size');
  // Toronto today: nine open near the airport (five lines a pass), twenty-four downtown (two card
  // hotels, three lines a pass); with six near the airport, five lines and the sixth next; with three,
  // all three every pass
  for (const [doc, area, per, plain] of [[RUN.YYZ, 'airport', 5, 9], [widen(6), 'airport', 5, 6], [widen(3), 'airport', 3, 3], [RUN.YYZ, 'downtown', 3, 22]]) {
    const seen = new Set();
    const passes = Math.ceil(plain / per) + 1;
    for (let pass = 0; pass < passes; pass++) {
      const v = hubView(hubBuild(['en', 'fr'], { pass }, doc), area);
      const ids = rowIds(v);
      assert.equal(ids.length, per, area + ' pass ' + pass);
      assert.equal(new Set(ids).size, per, area + ' pass ' + pass + ': none twice');
      for (const id of cardIds(v)) assert.ok(!ids.includes(id), id + ' is a card, not a line too');
      ids.forEach((id) => seen.add(id));
    }
    assert.equal(seen.size, plain, area + ': every hotel comes round');
  }
  // the next pass shows the next lines
  assert.notDeepEqual(rowIds(hubView(hubBuild(['en'], { pass: 0 }), 'downtown')), rowIds(hubView(hubBuild(['en'], { pass: 1 }), 'downtown')));
});

test('a hub city: the counts add up, the area\'s hotels open on the day, the lines shown and how many more the code lists', () => {
  for (const doc of [RUN.YYZ, widen(6), widen(3)]) {
    const html = hubBuild(['en', 'fr'], {}, doc);
    for (const c of H.shown(doc, NOV16)) {
      const v = hubView(html, c.area);
      const shownN = rowIds(v).length + cardIds(v).length;
      const more = c.hotels.length - shownN;
      const t = textOf(v);
      assert.ok(t.includes(B.fmt('hotelsCountOther', 'en', { N: c.hotels.length })), c.area + ': ' + c.hotels.length + ' hotels');
      assert.ok(t.includes(B.fmt('hotelsCountOther', 'fr', { N: c.hotels.length })), c.area + ' in French');
      if (more > 0) assert.ok(t.includes(B.fmt(H.HUB_MORE[c.area], 'en', { N: more })), c.area + ': ' + more + ' more');
      else assert.ok(!/ more (near the airport|downtown)/.test(t), c.area + ': nothing more, no figure');
      assert.ok(t.includes(B.bs('hotelListScan', 'en')) && t.includes(B.bs('hotelsScan', 'fr')), c.area + ': the invitation and the word beside the code');
    }
  }
  // Toronto on 16 November: nine at the airport (five lines, four more), twenty-four downtown
  // (two card hotels, three lines, nineteen more); six at the airport: five lines, one more; three:
  // three lines, none more
  const html = hubBuild(['en', 'fr']);
  assert.ok(textOf(hubView(html, 'airport')).includes('+ 4 more near the airport'));
  assert.ok(!textOf(hubView(hubBuild(['en'], {}, widen(3)), 'airport')).includes('more near the airport'));
  assert.ok(textOf(hubView(html, 'downtown')).includes('+ 19 more downtown'));
  assert.ok(textOf(hubView(hubBuild(['en'], {}, widen(6)), 'airport')).includes('+ 1 more near the airport'));
  // nothing more to list: the invitation alone, no figure
  const a = textOf(hubView(hubBuild(['en'], {}, widen(5)), 'airport'));
  assert.ok(!a.includes('more near the airport') && a.includes(B.bs('hotelListScan', 'en')));
  // the plural form of each language (Arabic: two, few, many, other)
  const ar = (n) => { const d = JSON.parse(JSON.stringify(RUN.YYZ)); d.hotels = d.hotels.filter((h) => h.area === 'downtown').slice(0, n); return textOf(hubBuild(['ar'], {}, d)); };
  assert.ok(ar(3).includes(B.fmt('hotelsCountFew', 'ar', { N: 3 })));
  assert.ok(ar(12).includes(B.fmt('hotelsCountMany', 'ar', { N: 12 })));
});

test('a hub city: the place of a partner hotel only on a page with no card hotel; the card hotels in a gold frame, their logo through <img>', () => {
  const html = hubBuild(['en', 'fr']);
  const air = hubView(html, 'airport'), down = hubView(html, 'downtown');
  // Toronto: no card hotel near the airport (the place), two downtown (no place)
  assert.ok(air.includes('<div class="hlc-hub-slot">') && !down.includes('hlc-hub-slot'));
  for (const l of ['en', 'fr']) for (const k of ['hotelsPartnerSlot', 'hotelsPlacement']) assert.ok(air.includes(B.esc(B.bs(k, l))), k + ' ' + l);
  assert.deepEqual(cardIds(air), []);
  assert.deepEqual(cardIds(down), RUN.YYZ.hotels.filter((h) => h.card && h.area === 'downtown').map((h) => h.id));
  assert.deepEqual(cardIds(down), ['fairmont-royal-york-hotel', 'novotel-toronto-centre']);
  // a card: the logo cell (an <img>, its trim placed by crops()), the name, the street and the
  // telephone; never the word partner on it
  const cards = down.split('<div class="hlc-hub-card"').slice(1).map((x) => x.split('<div class="hlc-hub-rows">')[0]);
  for (const c of cards) {
    assert.match(c, /^ data-hotel="[^"]+"><span class="hlc-logo"><span class="hlc-hub-pic"><img class="hlc-img" alt="" decoding="async" data-trim="inset\([\d.% ]+\)" src="\/logos\/hotels\/[^"]+\.svg"><\/span><\/span>/);
    assert.doesNotMatch(c, /<svg(?![^>]*aria-hidden)|<style/);
    assert.doesNotMatch(textOf(c), /partner|partenaire/i);
  }
  assert.ok(down.includes('<bdi class="hlc-addr" translate="no">100 Front Street W.</bdi><span class="hlc-tel">'), 'the street, then the telephone');
  // the gold look comes from the data only: card true, at most two a page; a card hotel near the
  // airport takes the place of the partner hotel
  const moved = widen(6);
  moved.hotels.find((h) => h.id === 'alt-hotel').card = true;
  moved.hotels.forEach((h) => { if (h.area === 'downtown') delete h.card; });
  const m = hubBuild(['en'], {}, moved);
  assert.deepEqual(cardIds(hubView(m, 'airport')), ['alt-hotel']);
  assert.ok(!hubView(m, 'airport').includes('hlc-hub-slot') && hubView(m, 'downtown').includes('hlc-hub-slot'));
  assert.equal(rowIds(hubView(m, 'airport')).length, 4, 'one card: four lines');
  assert.equal(rowIds(hubView(m, 'downtown')).length, 5, 'no card: five lines');
  const many = JSON.parse(JSON.stringify(RUN.YYZ));
  many.hotels.filter((h) => h.area === 'downtown').slice(0, 4).forEach((h) => { h.card = true; });
  assert.equal(cardIds(hubView(hubBuild(['en'], {}, many), 'downtown')).length, 2, 'two cards at most');
  assert.equal(rowIds(hubView(hubBuild(['en'], {}, many), 'downtown')).length, 3, 'and never under three lines');
  // a file with its own light ground is multiplied into the cream, as on the area cards (never a
  // white box in the frame); a trim in any form but its four sides is not taken (crops places only
  // that form): the logo shows whole
  const opq = JSON.parse(JSON.stringify(RUN.YYZ));
  opq.hotels.find((h) => h.id === 'fairmont-royal-york-hotel').logo.opaque = true;
  opq.hotels.find((h) => h.id === 'novotel-toronto-centre').logo.trim = 'inset(10%)';
  const ov = hubView(hubBuild(['en'], {}, opq), 'downtown');
  assert.ok(ov.includes('<img class="hlc-img hlc-img--opaque" alt="" decoding="async" data-trim="inset(18.4% 9.1% 18.3% 9.1%)" src="/logos/hotels/accor-luxury/fairmont-royal-york.svg">'));
  assert.ok(ov.includes('<img class="hlc-img" alt="" decoding="async" src="/logos/hotels/accor-midscale/novotel.svg">'), 'a one-value trim: shown whole');
  assert.match(CSS, /\n\.hlc-img--opaque\{ mix-blend-mode:multiply; \}/);
  // the frame: a border on the cream, never a ground (a box behind a logo)
  const rule = /\n\.hlc-hub-card\{([^}]*)\}/.exec(CSS);
  assert.ok(rule && /border:/.test(rule[1]) && !/background/.test(rule[1]), 'a gold border, no fill');
  for (const m2 of CSS.matchAll(/(\.hlc-hub[^{]*)\{([^}]*)\}/g)) if (!/hlc-hub-dot/.test(m2[1])) assert.doesNotMatch(m2[2], /background/, m2[1]);
});

// The opening <svg> tag of a file, found by position (no stripping of comments by pattern).
function svgHead(src) {
  const at = src.indexOf('<svg');
  return at < 0 ? '' : src.slice(at, src.indexOf('>', at) + 1);
}

test('a hub city: the trim of a card logo is cut by placing the picture in its cell, an SVG with no size of its own too', () => {
  // the Fairmont lockup has no width and height (no natural size: the browser ignores
  // object-view-box on it); the Novotel file has its own (70 x 40)
  const sized = (f) => /<svg[^>]*\swidth="[\d.]+"[^>]*\sheight="[\d.]+"/.test(svgHead(fs.readFileSync(path.join(SITE, f), 'utf8')));
  const gold = RUN.YYZ.hotels.filter((h) => h.card);
  assert.deepEqual(gold.map((h) => sized(h.logo.file)), [false, true]);
  const place = (natural, box, trim) => {
    const style = {};
    const im = { naturalWidth: natural[0], naturalHeight: natural[1], complete: true, getAttribute: (k) => (k === 'data-trim' ? trim : null),
      style: { set cssText(v) { String(v).split(';').forEach((d) => { const [k, x] = d.split(':').map((y) => y && y.trim()); if (k) style[k] = x; }); } },
      parentElement: { clientWidth: box[0], clientHeight: box[1] } };
    H.crops({ querySelectorAll: (sel) => (sel === '.hlc-hub-pic > img[data-trim]' ? [im] : []) });
    const n = (k) => parseFloat(style[k]);
    return { left: n('left'), top: n('top'), width: n('width'), height: n('height'), fill: style['object-fit'] };
  };
  // the Fairmont at its 300 x 148 default proportions, trimmed to its drawing: the drawing fills
  // the height of a 150 x 52 cell, centred across it
  const f = place([300, 148], [150, 52], 'inset(18.4% 9.1% 18.3% 9.1%)');
  const fw = 1 - 0.091 - 0.091, fh = 1 - 0.184 - 0.183;
  assert.ok(Math.abs(f.height * fh - 52) < 0.01, 'the drawing is the height of the cell');
  const drawn = f.width * fw;
  assert.ok(drawn > 130 && drawn <= 150, 'and ' + drawn.toFixed(1) + ' px wide');
  assert.ok(Math.abs(f.left + 0.091 * f.width - (150 - drawn) / 2) < 0.01, 'centred');
  assert.ok(Math.abs(f.top + 0.184 * f.height) < 0.01, 'its top at the top of the cell');
  assert.ok(Math.abs(f.width / f.height - 300 / 148) < 1e-6 && f.fill === 'fill', 'never stretched');
  // the Novotel, a long wordmark: the width of the cell, centred down it
  const nv = place([70, 40], [150, 52], 'inset(42.5% 11.4% 41.1% 11.4%)');
  assert.ok(Math.abs(nv.width * (1 - 0.228) - 150) < 0.01);
  // nothing placed before the picture has loaded, or without a trim
  assert.deepEqual(place([0, 0], [150, 52], 'inset(1% 1% 1% 1%)'), { left: NaN, top: NaN, width: NaN, height: NaN, fill: undefined });
  // an engine that gives a size-less SVG no natural size at all (0): its proportions from the
  // picture laid out at a known width (its viewBox), so the Fairmont is placed as at 300 x 148
  const zero = (src, rect) => {
    const style = {};
    let css = '';
    const im = { naturalWidth: 0, naturalHeight: 0, complete: true, getAttribute: (k) => (k === 'data-trim' ? 'inset(18.4% 9.1% 18.3% 9.1%)' : k === 'src' ? src : null),
      getBoundingClientRect: () => (/width:100px/.test(css) ? rect : { width: 0, height: 0 }),
      style: { get cssText() { return css; }, set cssText(v) { css = String(v); css.split(';').forEach((d) => { const [k, x] = d.split(':').map((y) => y && y.trim()); if (k) style[k] = x; }); } },
      parentElement: { clientWidth: 150, clientHeight: 52 } };
    H.crops({ querySelectorAll: (sel) => (sel === '.hlc-hub-pic > img[data-trim]' ? [im] : []) });
    return { left: parseFloat(style.left), top: parseFloat(style.top), width: parseFloat(style.width), height: parseFloat(style.height) };
  };
  const z = zero('/logos/hotels/accor-luxury/fairmont-royal-york.svg', { width: 100, height: 100 * 148 / 300 });
  for (const k of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(z[k] - f[k]) < 0.01, k + ' as at 300 x 148');
  // any other file with no natural size (not loaded, or broken) is not placed
  assert.ok(Number.isNaN(zero('/logos/hotels/list/x.png', { width: 100, height: 50 }).width));
});

test('a hub city: the head, the way there and each line, every word from the store, the data as written', () => {
  const html = hubBuild(['en', 'fr']);
  const air = hubView(html, 'airport'), down = hubView(html, 'downtown');
  // the city without the airport's own name, then its province (data, as written)
  for (const v of [air, down]) {
    assert.match(v, /<div class="hlc-city"><span class="hlc-fit"><span class="bs-h" lang="en">Toronto<\/span><b class="hlc-hub-dot"><\/b><bdi class="hlc-addr" translate="no">Ontario<\/bdi><\/span><\/div>/);
    assert.doesNotMatch(v, /Pearson/);
    assert.ok(v.includes(B.bs('hotelsWhereToStay', 'en')) && v.includes(B.bs('hotelsWhereToStay', 'fr')));
    assert.match(v, /<div class="hlc-foot hlc-hub-foot"><div class="hlc-tl">/);
  }
  assert.ok(air.includes(B.bs('hotelsAreaAirport', 'en')) && down.includes(B.bs('hotelsAreaDowntown', 'fr')));
  // the way there: the line in bold and its stop are data; the words are the store's; one kind of
  // dot in the line (the phrase's own dot drawn as the one before it)
  assert.ok(down.includes('<span class="bs-h" lang="en"><b class="hlc-hub-line"><bdi class="hlc-addr" translate="no">UP Express</bdi></b> to <bdi class="hlc-addr" translate="no">Union</bdi><b class="hlc-hub-dot"></b>28 min<b class="hlc-hub-dot"></b>every 15 min</span>'));
  assert.ok(down.includes('jusqu’à <bdi class="hlc-addr" translate="no">Union</bdi><b class="hlc-hub-dot"></b>28 min<b class="hlc-hub-dot"></b>toutes les 15 min'));
  for (const l of LANGS) {
    const go = /<div class="hlc-hub-go hlc-pairfit">([\s\S]*?)<\/span><\/div>/.exec(hubView(hubBuild([l]), 'downtown'))[1];
    assert.doesNotMatch(go, /·/, l + ': one kind of dot');
    assert.equal((go.match(/hlc-hub-dot/g) || []).length, 2, l);
  }
  // Toronto near the airport: no way there. Its Link train is held in the checked file (its
  // operator's page is blocked, and it reaches only the Alt Hotel's station): never shown, even
  // built from the checked file itself
  assert.doesNotMatch(air, /<div class="hlc-hub-go hlc-pairfit">/);
  assert.equal(DOCS.YYZ.hub.areas.airport.transit.verified, false);
  assert.doesNotMatch(hubView(hubBuild(['en'], {}, DOCS.YYZ), 'airport'), /<div class="hlc-hub-go hlc-pairfit">/);
  // a way there of the kind link, where one is verified: the free train, its name as data
  const linked = JSON.parse(JSON.stringify(RUN.YYZ));
  linked.hub.areas.airport = { transit: { kind: 'link', icon: 'train', line: 'Link' } };
  const la = hubView(hubBuild(['en', 'fr'], {}, linked), 'airport');
  assert.ok(la.includes('<span class="bs-h" lang="en">Free <b class="hlc-hub-line"><bdi class="hlc-addr" translate="no">Link</bdi></b> train</span>'));
  assert.match(la, /<div class="hlc-hub-go hlc-pairfit"><i class="hlc-ico"><svg/);
  assert.ok(la.includes(H.ICON.train));
  // a line: the name, then how it is reached from the terminals where that is verified, else the
  // shuttle mark where it is verified, else the street
  for (const v of [air, down]) {
    for (const id of rowIds(v)) {
      const h = RUN.YYZ.hotels.find((x) => x.id === id);
      const row = v.split('<div class="hlc-hub-row" data-hotel="' + id + '">')[1].split('</div></div>')[0];
      assert.ok(row.startsWith('<div class="hlc-name"><span class="hlc-fit"><bdi translate="no">' + B.esc(h.name)), id);
      if (h.access) assert.ok(row.includes('<span class="hlc-hub-note hlc-hub-way" data-way="Link|1"><i class="hlc-ico">' + H.ICON.train + '</i>') && !row.includes('hlc-mark'), id + ': its way there');
      else if (h.shuttle.mark) assert.ok(row.includes('<span class="hlc-hub-note"><i class="hlc-ico hlc-mark">'), id + ': the mark');
      else assert.ok(row.includes('<span class="hlc-hub-note"><bdi class="hlc-addr" translate="no">' + B.esc(h.address.street) + '</bdi></span>'), id + ': the street');
    }
  }
  // the legend of the mark on a page that shows one, and only there
  assert.ok(rowIds(air).some((id) => { const x = RUN.YYZ.hotels.find((y) => y.id === id); return x.shuttle.mark && !x.access; }));
  assert.ok(air.includes('hlc-hub-legend') && air.includes(B.bs('hotelShuttle', 'en')));
  assert.ok(!down.includes('hlc-hub-legend') && !down.includes('hlc-mark'));
  // the module writes no word of its own
  assert.doesNotMatch(SRC, /'(Where to stay|Near the airport|Downtown|Partner hotel|Placement available|Free guest|Scan)'/);
});

test('a hub city: every word of the pages in each of the nine languages, marked with its language, Arabic right to left', () => {
  for (const l of LANGS) {
    const html = hubBuild([l]);
    for (const k of ['hotelsWhereToStay', 'hotelsAreaAirport', 'hotelsAreaDowntown', 'hotelsPartnerSlot', 'hotelsPlacement', 'hotelsNoEndorse', 'hotelsScan', 'hotelListScan', 'hotelShuttle']) {
      assert.ok(html.includes(B.esc(B.bs(k, l))), l + ' ' + k);
    }
    // every half is marked with the board's one language; no other language on the page
    const marks = new Set([...html.matchAll(/<span class="bs-h" lang="([a-z]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...marks], [l], l);
    if (l === 'ar') assert.doesNotMatch(html, /<span class="bs-h" lang="ar"(?! dir="rtl")/, 'Arabic right to left');
  }
  // two languages, the first first; French first in Québec as everywhere
  const fe = hubBuild(['fr', 'en']);
  assert.ok(fe.indexOf(B.bs('hotelsWhereToStay', 'fr')) < fe.indexOf(B.bs('hotelsWhereToStay', 'en')));
  // the script faces of the board on a half and on all it holds (the way there holds the line's
  // name), after the faces of the pages
  const at = CSS.indexOf('.hlc--hub [lang="ja"], .hlc--hub [lang|="zh"], .hlc--hub [lang="ar"], .hlc--hub [lang="ja"] *');
  assert.ok(at > CSS.indexOf('.hlc--hub, .hlc--hub *{ font-family:var(--hlc-hub-text) !important; }'));
  assert.ok(at > CSS.indexOf('.hlc--hub .hlc-name, .hlc--hub .hlc-name *{'));
});

test('a hub city: the look, the faces of the board, sized for the 1680x1050 stage, inside the sheet before the foot', () => {
  const at = CSS.indexOf('/* ── a hub city (.hlc--hub)');
  assert.ok(at > CSS.indexOf('/* ── the card of a city without a list') && at < CSS.indexOf('/* ── foot ── */'), 'before the foot section');
  // AC Nord Display and AC Nord Text, declared by the board's own font.css (loaded before this
  // sheet on the gate): not declared again here
  assert.match(CSS, /\.hlc--hub\{ --hlc-hub-text:'AC Nord Text', var\(--hlc-sans\); --hlc-hub-display:'AC Nord Display', 'AC Nord Text', var\(--hlc-sans\);/);
  assert.match(read('fids-current/css/font.css'), /font-family:'AC Nord Display'; font-weight:700;/);
  assert.ok(GIDS.indexOf('css/font.css') > 0 && GIDS.indexOf('css/font.css') < GIDS.indexOf('css/hotel-list-card.css'));
  assert.doesNotMatch(CSS, /@font-face\{ font-family:'AC Nord/);
  // the sizes of the mock: 40 the heading, 30 the area, 22 the way there, 25 the names, 18 the
  // rest; the code 104
  for (const [sel, n] of [['.hlc--hub .hlc-title{', 40], ['.hlc-hub-area{', 30], ['.hlc-hub-go{', 22], ['.hlc--hub .hlc-name{', 25], ['.hlc-hub-note{', 18], ['.hlc-hub-rest{', 18], ['.hlc .hlc-hub-foot{', 18]]) {
    const i = CSS.indexOf('\n' + sel);
    assert.ok(i > 0, sel);
    assert.ok(CSS.slice(i, CSS.indexOf('}', i)).includes('font-size:calc(' + n + ' * var(--hlc-px))'), sel + ' ' + n);
  }
  assert.match(CSS, /\.hlc--hub \.hlc-qr\{ width:calc\(104 \* var\(--hlc-px\)\); height:calc\(104 \* var\(--hlc-px\)\);/);
  // a line still too long at the floor drops its note before the name is cut
  assert.match(CSS, /\.hlc--hub \.hlc-drop \.hlc-hub-note\{ display:none; \}/);
  assert.match(SRC, /box\.querySelector\(':scope > \.hlc-hub-note, \.hlc-hub-cut'\)\) \{\n\s*box\.style\.fontSize = ''; k = 1; box\.classList\.remove\('hlc-stack'\); box\.classList\.add\('hlc-drop'\); step\(\);/);
  // and the invitation after how many more gives way before that line is cut (the word beside the
  // code still says it)
  assert.match(CSS, /\.hlc--hub \.hlc-drop \.hlc-hub-cut\{ display:none; \}/);
});

test('a hub city: how a hotel is reached from the terminals, at the right of its line before the shuttle mark and the street, with its legend', () => {
  const html = hubBuild(['en', 'fr']);
  const air = hubView(html, 'airport'), down = hubView(html, 'downtown');
  const rowOf = (v, id) => v.split('<div class="hlc-hub-row" data-hotel="' + id + '">')[1].split('</div></div>')[0];
  const SH = 'sheraton-gateway-hotel-in-toronto-international-airport';
  const way = '<span class="hlc-hub-note hlc-hub-way" data-way="Link|1"><i class="hlc-ico">' + H.ICON.train + '</i><span class="hlc-hub-stop">';
  assert.ok(rowIds(air).includes('alt-hotel') && rowIds(air).includes(SH), 'both on the first pass');
  // the Alt Hotel: its stop of the Link train, data as written (never translated), in place of its street
  assert.ok(rowOf(air, 'alt-hotel').includes(way + '<bdi class="hlc-addr" translate="no">Viscount</bdi></span></span>'));
  assert.ok(!rowOf(air, 'alt-hotel').includes('6080 Viscount Road'), 'in place of the street');
  // the Sheraton Gateway: the terminal it is joined to, the board's own word for a terminal and its
  // number, in the languages of the board
  assert.ok(rowOf(air, SH).includes(way + B.half('en', 'Terminal\u00a03', '', { key: 'arrTerminal' }) + '<b class="hlc-sep"></b>'
    + B.half('fr', 'Aérogare\u00a03', '', { key: 'arrTerminal' }) + '</span></span>'));
  assert.ok(!rowOf(air, SH).includes('6301 Silver Dart Drive'));
  // a half that says the same as the one before is left out (German and English: Terminal 3 once)
  assert.equal((rowOf(hubView(hubBuild(['de', 'en']), 'airport'), SH).match(/Terminal\u00a03/g) || []).length, 1);
  // the legend: the train mark, the line (data) and the terminal it is taken from, once a page,
  // before the legend of the shuttle mark
  const legend = '<div class="hlc-hub-go hlc-hub-legend hlc-hub-legend--way hlc-pairfit" data-way="Link|1"><i class="hlc-ico">' + H.ICON.train + '</i><span class="hlc-fit">';
  assert.equal(air.split(legend).length, 2, 'one legend line');
  const LINK = '<bdi class="hlc-addr" translate="no">Link</bdi>';
  assert.ok(air.includes(legend + B.half('en', LINK + ' train from Terminal 1', '', { key: 'hotelsTrainFrom' }) + '<b class="hlc-sep"></b>'
    + B.half('fr', 'Train ' + LINK + ' depuis l’aérogare 1', '', { key: 'hotelsTrainFrom' }) + '</span></div>'));
  assert.ok(air.indexOf(legend) < air.indexOf('<div class="hlc-hub-go hlc-hub-legend hlc-pairfit">'), 'before the shuttle legend');
  // only on a page with an access note: none downtown, none where no line of the page has one
  assert.ok(!down.includes('hlc-hub-legend--way') && !down.includes('hlc-hub-way'));
  const none = JSON.parse(JSON.stringify(RUN.YYZ));
  none.hotels.forEach((h) => { delete h.access; });
  const nv = hubView(hubBuild(['en', 'fr'], {}, none), 'airport');
  assert.ok(!nv.includes('hlc-hub-legend--way') && !nv.includes('hlc-hub-way'));
  assert.ok(rowOf(nv, 'alt-hotel').includes('<span class="hlc-hub-note"><bdi class="hlc-addr" translate="no">6080 Viscount Road</bdi></span>'), 'without it, the street');
  // before the shuttle mark: a hotel with both shows its way there, and a page with no other mark has
  // no shuttle legend
  const both = JSON.parse(JSON.stringify(RUN.YYZ));
  both.hotels.forEach((h) => { if (h.area === 'airport') h.shuttle.mark = h.id === 'alt-hotel'; });
  const bv = hubView(hubBuild(['en'], {}, both), 'airport');
  assert.ok(rowOf(bv, 'alt-hotel').includes('hlc-hub-way') && !rowOf(bv, 'alt-hotel').includes('hlc-mark'));
  assert.ok(!bv.includes('<div class="hlc-hub-go hlc-hub-legend hlc-pairfit">'), 'no shuttle legend for a mark the page does not show');
  // held in the checked file (verified false), or of a kind the page has no words for: not shown
  const held = JSON.parse(JSON.stringify(DOCS.YYZ));
  held.hotels.find((h) => h.id === 'alt-hotel').access.verified = false;
  assert.ok(!rowOf(hubView(hubBuild(['en'], {}, held), 'airport'), 'alt-hotel').includes('hlc-hub-way'));
  const boat = JSON.parse(JSON.stringify(RUN.YYZ));
  boat.hotels.find((h) => h.id === 'alt-hotel').access.kind = 'boat';
  assert.ok(!rowOf(hubView(hubBuild(['en'], {}, boat), 'airport'), 'alt-hotel').includes('hlc-hub-way'));
  // notes taken from two terminals: a legend line each
  const two = JSON.parse(JSON.stringify(RUN.YYZ));
  two.hotels.find((h) => h.id === 'alt-hotel').access.from = '3';
  assert.equal((hubView(hubBuild(['en'], {}, two), 'airport').match(/hlc-hub-legend--way/g) || []).length, 2);
  // in each of the nine languages: the word of a terminal and the legend, from the store, the line
  // as data, the figures through the store's numbers
  for (const l of LANGS) {
    const v = hubView(hubBuild([l]), 'airport');
    assert.ok(v.includes(B.half(l, B.esc(B.bs('arrTerminal', l)) + '\u00a0' + B.num(3, l), '', { key: 'arrTerminal' })), l + ': the terminal');
    const w = B.esc(B.bs('hotelsTrainFrom', l)).split('{LINE}').join(LINK).split('{N}').join(B.num(1, l));
    assert.ok(v.includes(B.half(l, w, '', { key: 'hotelsTrainFrom' })), l + ': the legend');
    // nothing about fares or hours
    assert.doesNotMatch(B.bs('hotelsTrainFrom', l), /free|gratuit|kostenlos|無料|免费|مجان|24|\bmin\b|分/i, l);
  }
  // French: Aérogare, the word of the UP Express's French page for Pearson's terminals
  assert.equal(B.bs('arrTerminal', 'fr'), 'Aérogare');
  assert.match(B.bs('hotelsTrainFrom', 'fr'), /aérogare \{N\}$/);
  // the fitter drops a note before it cuts a name (a note is a direct child of the name, the part
  // that gives way), and then hides the legends left with nothing to answer (run below)
  assert.match(SRC, /box\.querySelector\(':scope > \.hlc-hub-note, \.hlc-hub-cut'\)/);
  assert.match(SRC, /try \{ legendsOff\(legends\); \} catch \(e5\) \{\}\n    \} catch \(e\) \{\}\n  \}/);
  assert.ok(rowOf(air, SH).startsWith('<div class="hlc-name"><span class="hlc-fit">') && rowOf(air, SH).includes('</span><span class="hlc-hub-note hlc-hub-way"'), 'the note beside the fitted name, inside the name');
  // the look: in the ink of the names, the mark sized to the text, no ground; inside the hub section
  assert.match(CSS, /\n\.hlc-hub-way\{ color:var\(--hlc-navy\); font-weight:500; \}/);
  assert.ok(CSS.indexOf('\n.hlc-hub-way{') > CSS.indexOf('/* ── a hub city (.hlc--hub)') && CSS.indexOf('\n.hlc-hub-way{') < CSS.indexOf('/* ── foot ── */'));
  // a terminal as an airport names it: a number, a number and a letter, or a letter; a number in the
  // board's figures, the rest as written, as the board writes the terminal of a flight
  assert.ok(['3', '12', '2E', 'B'].every((t) => H.TERMINAL.test(t)) && !['', 'T3', '123', '2e', '3 '].some((t) => H.TERMINAL.test(t)));
  const t2e = JSON.parse(JSON.stringify(RUN.YYZ));
  t2e.hotels.find((h) => h.id === SH).access.terminal = '2E';
  assert.ok(rowOf(hubView(hubBuild(['en', 'fr'], {}, t2e), 'airport'), SH).includes(way + B.half('en', 'Terminal\u00a02E', '', { key: 'arrTerminal' })));
  t2e.hotels.find((h) => h.id === SH).access.terminal = 'T3';
  assert.ok(!rowOf(hubView(hubBuild(['en'], {}, t2e), 'airport'), SH).includes('hlc-hub-way'), 'a terminal it cannot read: no note');
  // Japanese writes the terminal of the legend as the note beside it does: the word, a no-break
  // space, the number
  const jv = hubView(hubBuild(['ja']), 'airport'), JT = B.esc(B.bs('arrTerminal', 'ja'));
  assert.ok(jv.includes(JT + '\u00a0' + B.num(3, 'ja')) && jv.includes(JT + '\u00a0' + B.num(1, 'ja')), 'ja: the same form in the note and the legend');
  assert.ok(B.bs('hotelsTrainFrom', 'ja').startsWith(B.bs('arrTerminal', 'ja') + '\u00a0{N}'));
  // the module writes no word of its own
  assert.doesNotMatch(SRC, /'(Terminal|Aérogare|Viscount|Link)'/);
});

// A few elements, enough for the legends' pass of the fitter (HotelListCard.legendsOff): class
// names, attributes, closest() and querySelectorAll() of a two-step descendant selector
function fakeEl(cls, attrs, kids) {
  const e = { cls: new Set(String(cls).split(' ').filter(Boolean)), attrs: attrs || {}, kids: kids || [], parent: null };
  e.kids.forEach((k) => { k.parent = e; });
  const is = (x, sel) => sel.split('.').filter(Boolean).every((c) => x.cls.has(c));
  const all = (x) => x.kids.flatMap((k) => [k, ...all(k)]);
  e.classList = { contains: (c) => e.cls.has(c), add: (c) => e.cls.add(c), remove: (c) => e.cls.delete(c) };
  e.getAttribute = (n) => (Object.prototype.hasOwnProperty.call(e.attrs, n) ? e.attrs[n] : null);
  e.closest = (sel) => { for (let x = e; x; x = x.parent) if (is(x, sel)) return x; return null; };
  e.querySelectorAll = (sel) => {
    const [up, own] = sel.split(' ');
    return all(e).filter((x) => { if (!is(x, own)) return false; for (let p = x.parent; p; p = p.parent) { if (is(p, up)) return true; if (p === e) break; } return false; });
  };
  return e;
}

test('a hub city: after the fit, a legend goes with the last note it answers, and only then', () => {
  // a page as the module draws it: the legends above the lines; on each line the name (.hlc-name,
  // the box the fitter marks hlc-drop when its note gives way) holds the fitted name and the note
  const page = (rows, legends) => {
    const lg = legends.map((k) => k ? fakeEl('hlc-hub-go hlc-hub-legend hlc-hub-legend--way hlc-pairfit', { 'data-way': k }) : fakeEl('hlc-hub-go hlc-hub-legend hlc-pairfit'));
    const lines = rows.map(([note, drop]) => fakeEl('hlc-hub-row', {}, [fakeEl('hlc-name' + (drop ? ' hlc-drop' : ''), {}, [fakeEl('hlc-fit'),
      note === 'mark' ? fakeEl('hlc-hub-note', {}, [fakeEl('hlc-ico hlc-mark')]) : note ? fakeEl('hlc-hub-note hlc-hub-way', { 'data-way': note }) : fakeEl('hlc-hub-note')])]));
    fakeEl('axr-page hlc-view', {}, [...lg, fakeEl('hlc-hub-rows', {}, lines)]);
    H.legendsOff(lg);
    return lg.map((l) => !l.classList.contains('hlc-hub-legend--off'));
  };
  // nothing gave way: both legends stay
  assert.deepEqual(page([['Link|1'], ['mark'], ['Link|1'], [null]], ['Link|1', null]), [true, true]);
  // one of the two notes of the train gave way: its legend stays for the other
  assert.deepEqual(page([['Link|1', true], ['mark'], ['Link|1'], [null]], ['Link|1', null]), [true, true]);
  // both gave way: the legend of the train goes, the shuttle legend stays for its mark
  assert.deepEqual(page([['Link|1', true], ['mark'], ['Link|1', true], [null]], ['Link|1', null]), [false, true]);
  // the shuttle mark gave way: its legend goes, the train's stays (a note of the train is no mark)
  assert.deepEqual(page([['Link|1'], ['mark', true], ['Link|1'], [null, true]], ['Link|1', null]), [true, false]);
  // notes from two terminals: the one from Terminal 3 gave way, its legend goes and the other stays
  assert.deepEqual(page([['Link|1'], ['Link|3', true]], ['Link|1', 'Link|3']), [true, false]);
  // a legend outside a page is left as it is
  const loose = fakeEl('hlc-hub-legend hlc-hub-legend--way', { 'data-way': 'Link|1' });
  H.legendsOff([loose]);
  assert.ok(!loose.classList.contains('hlc-hub-legend--off'));
});

test('the phone app: the full list of a hub city shows how a hotel is reached from the terminals, as the board does, in the phone\'s language', () => {
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = (L, doc) => {
    if (doc) H.put('YYZ', doc);
    try {
      return onGate(gate(), () => {
        const body = { innerHTML: '' };
        const ctx = { window: { BoardStrings: B, HotelListCard: H }, HotelListCard: H, document: { getElementById: (id) => (id === 'hlBody' ? body : null) }, langRes: () => L,
          placeOf: () => ({ c: 'Toronto' }), AIRPORTS: { YYZ: { tz: 'America/Toronto' } }, esc, HL_CITY: 'YYZ', HL_FIND: false, HL_WHERE: '' };
        vm.createContext(ctx);
        vm.runInContext(['hlIco', 'hlTel', 'hlHost', 'hlWeb', 'renderHotels'].map(appFn).join('\n') + '\nconst HL_GLOBE = "";\nrenderHotels();', ctx);
        return body.innerHTML;
      });
    } finally { H.put('YYZ', RUN.YYZ); }
  };
  const SH = 'sheraton-gateway-hotel-in-toronto-international-airport';
  const rowOf = (html, id) => html.split('<li class="hl-row">').find((r) => r.includes('<bdi translate="no">' + B.esc(RUN.YYZ.hotels.find((h) => h.id === id).name) + '</bdi>'));
  const sec = (html, area) => html.split('<section class="hl-sec" id="hl-' + area + '">')[1].split('</section>')[0];
  const TRAIN = '<i class="hl-ico">' + H.ICON.train + '</i>';
  const LINK = '<bdi class="hlc-addr" translate="no">Link</bdi>';
  for (const l of LANGS) {
    const html = list(l), air = sec(html, 'airport');
    // the legend of the train under the heading, once, before the shuttle legend
    const legend = '<div class="hl-legend">' + TRAIN + '<span>' + B.esc(B.bs('hotelsTrainFrom', l)).split('{LINE}').join(LINK).split('{N}').join(B.num(1, l)) + '</span></div>';
    assert.equal(air.split(legend).length, 2, l + ': one legend of the train');
    assert.ok(air.indexOf(legend) < air.indexOf('<div class="hl-legend"><i class="hl-ico">' + H.ICON.shuttle), l + ': before the shuttle legend');
    // under the address: the Alt Hotel's stop (data, as written), the Sheraton's terminal in the store's word
    assert.ok(rowOf(air, 'alt-hotel').includes('<div class="hl-way">' + TRAIN + '<span><bdi class="hlc-addr" translate="no">Viscount</bdi></span></div>'), l + ': the stop');
    assert.ok(rowOf(air, SH).includes('<div class="hl-way">' + TRAIN + '<span>' + B.esc(B.bs('arrTerminal', l)) + '\u00a0' + B.num(3, l) + '</span></div>'), l + ': the terminal');
    // the address stays; no shuttle mark on those two lines; none downtown
    assert.ok(rowOf(air, 'alt-hotel').includes('<div class="hl-addr"><bdi translate="no">6080 Viscount Road, Mississauga</bdi></div><div class="hl-way">'));
    for (const id of ['alt-hotel', SH]) assert.ok(!rowOf(air, id).includes(H.ICON.shuttle), l + ' ' + id + ': no shuttle mark');
    assert.ok(!sec(html, 'downtown').includes('hl-way') && !sec(html, 'downtown').includes(H.ICON.train), l + ': nothing downtown');
  }
  // a hotel with an access note and a shuttle mark: the way there, as on the board; and with no
  // access note on the list, no legend of the train
  const both = JSON.parse(JSON.stringify(RUN.YYZ));
  both.hotels.forEach((h) => { if (h.area === 'airport') h.shuttle.mark = h.id === 'alt-hotel'; });
  const bl = sec(list('en', both), 'airport');
  assert.ok(rowOf(bl, 'alt-hotel').includes('hl-way') && !rowOf(bl, 'alt-hotel').includes(H.ICON.shuttle));
  assert.ok(!bl.includes('<div class="hl-legend"><i class="hl-ico">' + H.ICON.shuttle), 'no shuttle legend for a mark the list does not show');
  const none = JSON.parse(JSON.stringify(RUN.YYZ));
  none.hotels.forEach((h) => { delete h.access; });
  assert.ok(!list('en', none).includes(H.ICON.train), 'no access note, no train');
  // every other city as it was: no access in its slim copy, so no train on the phone
  for (const C of H.CITIES.filter((c) => !H.HUBS.includes(c))) assert.ok(!RUN[C].hotels.some((h) => h.access), C);
  // the look: the mark in the bronze of the legend, the words in the ink of the names
  assert.match(APP, /\.hl-way\{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:13\.5px;font-weight:650;color:var\(--txt\);line-height:1\.35;\}/);
});

test('a hub city: the build step holds the checked file to the hub rules, and every other city to none of them', () => {
  const doc = () => JSON.parse(JSON.stringify(DOCS.YYZ));
  assert.deepEqual(RT.hubProblems(doc()), []);
  const noHub = doc(); delete noHub.hub;
  assert.equal(RT.hubProblems(noHub).length, 1);
  const nearby = doc(); nearby.hotels[0].area = 'nearby';
  assert.ok(RT.hubProblems(nearby).some((p) => /area nearby is not one of the pages/.test(p)));
  const noId = doc(); delete noId.hotels.find((h) => h.card).card_id;
  assert.ok(RT.hubProblems(noId).some((p) => /card_id/.test(p)));
  // a way there not read on its operator's own page: held (verified false, the reason in its
  // note) and left out of the slim copy; held without a reason, or neither verified nor held, it
  // is refused
  const held = doc(); held.hub.areas.downtown.transit.verified = false;
  assert.deepEqual(RT.hubProblems(held), []);
  assert.deepEqual(RT.slimHub(held.hub), { region: 'Ontario', areas: {} });
  const noWhy = doc(); noWhy.hub.areas.downtown.transit.verified = false; delete noWhy.hub.areas.downtown.transit.note;
  assert.ok(RT.hubProblems(noWhy).some((p) => /held \(verified false\): say why in its note/.test(p)));
  const unsaid = doc(); delete unsaid.hub.areas.downtown.transit.verified;
  assert.ok(RT.hubProblems(unsaid).some((p) => /verified, with its source/.test(p)));
  const noSource = doc(); delete noSource.hub.areas.downtown.transit.source;
  assert.ok(RT.hubProblems(noSource).some((p) => /verified, with its source/.test(p)));
  // only the two areas of the pages reach the slim copy
  const extra = doc(); extra.hub.areas.nearby = { transit: Object.assign({}, extra.hub.areas.downtown.transit) };
  assert.deepEqual(Object.keys(RT.slimHub(extra.hub).areas), ['downtown']);
  // Toronto: the airport's Link train is held (the airport's own page, torontopearson.com, is
  // blocked, and the hotels' pages show it reaching the Alt Hotel's station only)
  assert.equal(DOCS.YYZ.hub.areas.airport.transit.verified, false);
  assert.match(DOCS.YYZ.hub.areas.airport.transit.note, /torontopearson\.com/);
  const kind = doc(); kind.hub.areas.airport.transit.kind = 'boat';
  assert.ok(RT.hubProblems(kind).some((p) => /kind boat/.test(p)));
  const yqm = JSON.parse(JSON.stringify(DOCS.YQM)); yqm.hub = DOCS.YYZ.hub; yqm.hotels[0].card = true;
  assert.equal(RT.hubProblems(yqm).length, 2, 'no hub block and no card hotel outside a hub city');
  // the slim copy keeps the way there and nothing of its sources
  assert.deepEqual(RUN.YYZ.hub, {
    region: 'Ontario',
    areas: {
      downtown: { transit: { kind: 'ride', icon: 'train', line: 'UP Express', stop: 'Union', min: 28, every: 15 } }
    }
  });
  assert.deepEqual(RUN.YYZ.hotels.filter((h) => h.card).map((h) => h.id), ['fairmont-royal-york-hotel', 'novotel-toronto-centre']);
  // a hotel's access (how it is reached from the terminals): verified with its source, the date and
  // the words read, or held with its reason (and left out of the slim copy); a kind the pages have
  // words for, the line and the terminal it is taken from, its stop or its terminal; only in a hub city
  const SH = 'sheraton-gateway-hotel-in-toronto-international-airport';
  const acc = (edit) => { const d = doc(); edit(d.hotels.find((h) => h.id === 'alt-hotel').access, d.hotels.find((h) => h.id === SH).access); return RT.hubProblems(d); };
  assert.ok(acc((a) => { delete a.quote; }).some((p) => /alt-hotel access: verified, with its source, the date and the words read/.test(p)));
  assert.ok(acc((a) => { delete a.source; }).some((p) => /alt-hotel access: verified/.test(p)));
  assert.ok(acc((a) => { a.kind = 'boat'; }).some((p) => /access\.kind boat: one of link, terminal/.test(p)));
  assert.ok(acc((a) => { delete a.stop; }).some((p) => /a link names its stop/.test(p)));
  assert.ok(acc((a, b) => { delete b.terminal; }).some((p) => /the number of the terminal it is joined to/.test(p)));
  assert.ok(acc((a, b) => { delete b.from; }).some((p) => /\.from: the terminal the train is taken from/.test(p)));
  assert.ok(acc((a) => { delete a.line; }).some((p) => /\.line: the line of the train/.test(p)));
  assert.deepEqual(acc((a) => { a.verified = false; }), [], 'held, with its reason');
  assert.ok(acc((a) => { a.verified = false; delete a.note; }).some((p) => /access: held \(verified false\): say why in its note/.test(p)));
  const heldDoc = doc(); heldDoc.hotels.find((h) => h.id === 'alt-hotel').access.verified = false;
  assert.ok(!('access' in RT.slim(heldDoc).hotels.find((h) => h.id === 'alt-hotel')), 'a held access is left out of the slim copy');
  const yqmA = JSON.parse(JSON.stringify(DOCS.YQM)); yqmA.hotels[0].access = DOCS.YYZ.hotels.find((h) => h.id === 'alt-hotel').access;
  assert.ok(RT.hubProblems(yqmA).some((p) => /an access note outside a hub city/.test(p)));
  // Toronto: the Alt Hotel at Viscount station (its own contact page) and the Sheraton Gateway at
  // Terminal 3 (its brand page, read by a person in a browser), both from Terminal 1 by the Link train
  const alt = DOCS.YYZ.hotels.find((h) => h.id === 'alt-hotel').access, sh = DOCS.YYZ.hotels.find((h) => h.id === SH).access;
  assert.equal(alt.source, 'https://www.germainhotels.com/en/alt-hotel/toronto-airport/contact');
  assert.equal(alt.quote, 'The hotel is located directly outside Viscount station.');
  assert.match(sh.source, /^https:\/\/www\.marriott\.com\/en-us\/hotels\/yyzgs-/);
  assert.equal(sh.method, 'read by a person in a browser, 2026-11-23');
  assert.equal(sh.quote, 'Connected to Terminal 3 accessible from Terminal 1 via Airport Link Train.');
  // the slim copy keeps the kind, the line, the terminal it is taken from and the stop or terminal:
  // nothing of the sources
  assert.deepEqual(RUN.YYZ.hotels.filter((h) => h.access).map((h) => [h.id, h.access]), [
    [SH, { kind: 'terminal', line: 'Link', from: '1', terminal: '3' }],
    ['alt-hotel', { kind: 'link', line: 'Link', from: '1', stop: 'Viscount' }]
  ]);
  assert.doesNotMatch(read('fids-current/data/hotels/yyz.json'), /"(quote|method|checked|also|note)"/);
  // the area-wide airport train stays held
  assert.equal(DOCS.YYZ.hub.areas.airport.transit.verified, false);
  // and if it is ever verified while hotels of the area show the same train as their access, the
  // build step refuses it: the page would say one train twice
  const twice = doc();
  twice.hub.areas.airport.transit.verified = true;
  assert.ok(RT.hubProblems(twice).some((p) => /hub\.areas\.airport\.transit: the Link line is verified for the whole area, and .*alt-hotel.* show it as their access: keep one of the two/.test(p)));
  twice.hub.areas.airport.transit.line = 'Another';
  assert.ok(!RT.hubProblems(twice).some((p) => /keep one of the two/.test(p)), 'another line: no clash');
  // a terminal as the airport names it (2E, B), never anything else
  assert.deepEqual(acc((a, b) => { b.terminal = '2E'; a.from = 'B'; }), []);
  assert.ok(acc((a, b) => { b.terminal = 'T3'; }).some((p) => /the number of the terminal it is joined to/.test(p)));
});
