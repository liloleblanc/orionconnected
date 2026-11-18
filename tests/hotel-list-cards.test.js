'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE HOTEL LISTS (fids-current/js/hotel-list-card.js, data/hotels/*.json)
//
// Free guest information by area in the centre deck of a gate whose flight
// goes to a city with a checked list (Moncton, Charlottetown): Airport,
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
const KEYS = ['hotelsAirport', 'hotelsDowntown', 'hotelsNearby', 'hotelsResorts', 'hotelShuttle', 'hotelListScan', 'hotelsInCity', 'hotelCall', 'credOsmLine'];
// the checked list of each city (every fact with its source and verified mark), kept out of the
// site, and the slim copy the site serves, made from it by scripts/hotels/build-runtime.js
const RT = require(path.join(ROOT, 'scripts/hotels/build-runtime.js'));
const DOCS = {
  YQM: JSON.parse(read('scripts/hotels/data/yqm.json')),
  YYG: JSON.parse(read('scripts/hotels/data/yyg.json'))
};
const RUN = {
  YQM: JSON.parse(read('fids-current/data/hotels/yqm.json')),
  YYG: JSON.parse(read('fids-current/data/hotels/yyg.json'))
};
H.put('YQM', RUN.YQM);
H.put('YYG', RUN.YYG);
// a day at noon on the machine's own calendar (no board: the module reads the date's own fields)
const day = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);
const NOV16 = day(2026, 11, 16);

// The module reads the board through the global object: a gate is set up on
// it for one check and taken away again.
function onGate(g, run) {
  const names = ['_gateIata', '_gateCurrentFlight', '_flightLegs', 'BoardStrings', 'frFirstAirport', '_gateMapCity', '_gateAccorPass', 'location'];
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
const CITY_NAMES = { YQM: 'Moncton', YYG: 'Charlottetown' };
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
  assert.deepEqual(filled.sort(), ['algonquin-resort', 'delta-beausejour', 'delta-prince-edward', 'fairholm']);
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
  assert.equal(at({ _locIata: 'YYZ' }), '', 'no list for Toronto');
  assert.equal(at({ _locIata: 'YHZ', _stops: ['YQM', 'YHZ'] }), 'YQM', 'a stop with a list counts');
  assert.equal(at(null), '', 'no flight, nothing');
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
  assert.match(APP, /function openHotels\(city,area\)/);
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
  for (const [c, a] of [['YQM', 'airport'], ['YQM', 'downtown'], ['YQM', 'nearby'], ['YYG', 'airport'], ['YYG', 'downtown']]) {
    for (let pass = 0; pass < 3; pass++) assert.deepEqual(list(c, a, pass), { cls: 'hlc-list', rows: 5, lines: 5 }, c + ' ' + a + ' ' + pass);
  }
  // shorter cards: their lines only
  assert.deepEqual(list('YQM', 'resort'), { cls: 'hlc-list', rows: 1, lines: 1 }, 'Moncton resorts: the Algonquin');
  assert.deepEqual(list('YYG', 'nearby'), { cls: 'hlc-list', rows: 2, lines: 2 }, 'Charlottetown nearby: two lines, both with a logo');
  assert.deepEqual(list('YYG', 'resort'), { cls: 'hlc-list hlc-list--bare', rows: 3, lines: 3 }, 'Charlottetown resorts: no logo, no logo cell');
  // the app's list: no column on a list where no hotel has a logo
  assert.match(APP, /\.hl-list\.hl-list--bare\{background:var\(--card\);\}\n  \.hl-list--bare \.hl-logo\{display:none;\}/);
  assert.match(APP, /'<ol class="hl-list'\+\(c\.hotels\.some\(h=>h\.logo&&h\.logo\.file\)\?'':' hl-list--bare'\)\+'">'/);
  assert.match(CSS, /--hlc-cream:#f5efe3;/, 'one fixed cream, never the airline colour');
  for (const m of CSS.matchAll(/(\.hlc-(?:logo|img)[^{]*)\{([^}]*)\}/g)) assert.doesNotMatch(m[2], /background/, m[1] + ' has no ground of its own');
  // the white-lettering marks of the foot stay on the navy
  assert.match(CSS, /\.hlc-foot\{[^}]*background:var\(--hlc-navy\); color:#fff; \}/);
  assert.deepEqual(DOCS.YQM.foot_marks.map((m) => m.name), ['Destination Moncton-Dieppe', '#ExploreNB']);
  assert.deepEqual(DOCS.YYG.foot_marks, [], 'no Charlottetown mark until one is approved');
});
