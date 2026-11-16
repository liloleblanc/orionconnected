'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE HOTEL LISTS (fids-current/js/hotel-list-card.js, data/hotels/*.json)
//
// Free guest information by area in the centre deck of a gate whose flight
// goes to a city with a checked list (Moncton, Charlottetown): Airport,
// Downtown, Nearby hotels and Resorts worth the drive, five lines a card, the
// rest on the next passes, the logo on one cream column, a shuttle mark only
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
const DOCS = {
  YQM: JSON.parse(read('fids-current/data/hotels/yqm.json')),
  YYG: JSON.parse(read('fids-current/data/hotels/yyg.json'))
};
H.put('YQM', DOCS.YQM);
H.put('YYG', DOCS.YYG);
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
const build = (city, L, o) => onGate(gate(), () => H.build(DOCS[city], L, Object.assign({ date: NOV16, home: 'YYZ' }, o || {})));
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
  // the counts of the cards on 16 November
  assert.deepEqual(H.cards(DOCS.YQM, NOV16).map((c) => c.area + ':' + c.hotels.length), ['airport:5', 'downtown:12', 'nearby:12', 'resort:1']);
  assert.deepEqual(H.cards(DOCS.YYG, NOV16).map((c) => c.area + ':' + c.hotels.length), ['airport:5', 'downtown:12', 'nearby:2', 'resort:3']);
  // the deck asks the board for the day at the airport (_ocLocalDayKey), not the machine's
  onGate({ _ocLocalDayKey: () => '2026-12-01' }, () => {
    globalThis._ocLocalDayKey = () => '2026-12-01';
    try { assert.equal(H.monthDay(null, 'America/Halifax'), '12-01'); } finally { delete globalThis._ocLocalDayKey; }
  });
});

test('the shuttle mark only where the shuttle is verified, and the legend only on a card that shows one', () => {
  for (const doc of Object.values(DOCS)) {
    for (const h of doc.hotels) if (h.shuttle.mark) assert.equal(h.shuttle.verified, true, h.id + ': a mark is verified');
  }
  const marked = DOCS.YQM.hotels.filter((h) => h.shuttle.mark).map((h) => h.id);
  assert.deepEqual(marked, ['hix-dieppe'], 'Moncton: the Holiday Inn Express at the airport (cyqm.ca)');
  assert.equal(DOCS.YYG.hotels.filter((h) => h.shuttle.mark).length, 0, 'Charlottetown: the airport says no hotel shuttle runs');
  const v = views(build('YQM', ['en', 'fr']));
  const airport = v.find((x) => x.includes('data-area="airport"'));
  const row = airport.split('<li ').find((x) => x.includes('data-hotel="hix-dieppe"'));
  assert.ok(row.includes('hlc-mark'), 'the mark on its line');
  assert.equal((airport.match(/hlc-mark"/g) || []).length, 2, 'one mark on the line, one in the legend');
  assert.ok(airport.includes('class="hlc-legend"') && airport.includes(B.bs('hotelShuttle', 'en')) && airport.includes(B.bs('hotelShuttle', 'fr')));
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

test('the Accor pages and the Algonquin page are not touched', () => {
  // the module and its stylesheet keep to their own slide: no Accor cache, no Accor function,
  // nothing of the Algonquin page, and every rule scoped to .hlc
  // (the deck's own count of its passes, _gateAccorPass, is read for the rotation and nothing else)
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/_gateAccorPass/g, '');
  assert.doesNotMatch(code, /accor|AlgonquinCard|axr-(?!pages?\b|page-on\b)/i);
  assert.match(SRC, /root\._gateAccorPass\) \|\| 0/);
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\{[^}]*\}/g, '');
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
  const px = [...CSS.matchAll(/--hlc-(title|city|say|name|info|floor-px):calc\((\d+(?:\.\d+)?) \* var\(--hlc-px\)\)/g)];
  assert.ok(px.length >= 6);
  for (const m of px) assert.ok(Number(m[2]) >= 18, m[1] + ' ' + m[2]);
  for (const m of CSS.matchAll(/font-size:calc\((\d+(?:\.\d+)?) \* var\(--hlc-px\)\)/g)) assert.ok(Number(m[1]) >= 18, 'font ' + m[1]);
  assert.match(CSS, /--hlc-px:min\(0\.09524vh, 0\.05952vw\);/, 'one pixel at 1680x1050, by the smaller of height and width');
});

test('the cream column is one panel down the whole list, never a box behind one logo', () => {
  assert.match(CSS, /\.hlc-list\{[^}]*background:linear-gradient\(90deg, var\(--hlc-cream\) 0, var\(--hlc-cream\) var\(--hlc-col\), transparent var\(--hlc-col\)\)/);
  assert.match(CSS, /--hlc-cream:#f5efe3;/, 'one fixed cream, never the airline colour');
  for (const m of CSS.matchAll(/(\.hlc-(?:logo|img)[^{]*)\{([^}]*)\}/g)) assert.doesNotMatch(m[2], /background/, m[1] + ' has no ground of its own');
  // the white-lettering marks of the foot stay on the navy
  assert.doesNotMatch(CSS, /\.hlc-foot[^{]*\{[^}]*background/);
  assert.deepEqual(DOCS.YQM.foot_marks.map((m) => m.name), ['Destination Moncton-Dieppe', '#ExploreNB']);
  assert.deepEqual(DOCS.YYG.foot_marks, [], 'no Charlottetown mark until one is approved');
});
