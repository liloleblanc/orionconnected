'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24114 — EVERY CITY GETS ITS HOTELS, AND PARIS GETS PARIS.
//
// The Accor catalog moved each hotel's position to localization.gps. The board
// only looked at localization.coordinates, so every hotel came back with no
// distance, and the near-the-city check then dropped all of them except where
// it could find a known city name in the address. Montréal and Toronto still
// showed hotels that way; Paris, London, Frankfurt and Tokyo showed none.
//
// With the position read again, the search is also centred on the city rather
// than the airport (Paris was getting the ibis and hotelF1 at Roissy), takes
// the fifty nearest instead of sixteen, and picks five with one per brand, the
// premium and luxury brands first.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

function grab(re, what) {
  const m = CORE.match(re);
  assert.ok(m, what + ' must exist');
  return m[0];
}

function load() {
  const src = [
    grab(/var DOWNTOWN_COORDS = \{[\s\S]*?\n\};/, 'DOWNTOWN_COORDS'),
    grab(/var ACCOR_BRAND_CATEGORY = \{[\s\S]*?\n\};/, 'ACCOR_BRAND_CATEGORY'),
    grab(/function accorBrandCategory\(brandCode\) \{[\s\S]*?\n\}/, 'accorBrandCategory'),
    grab(/function _haversineKm\([^)]*\) \{[\s\S]*?\n\}/, '_haversineKm'),
    grab(/function _accorHotelLatLng\(h\) \{[\s\S]*?\n\}/, '_accorHotelLatLng'),
    grab(/function _accorKm\(kmStr, L\) \{[\s\S]*?\n\}/, '_accorKm'),
    grab(/function _accorPickHotels\(results, destIata\) \{[\s\S]*?\n\}/, '_accorPickHotels'),
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function('COORDS', 'BoardStrings',
    src + '\nreturn { DOWNTOWN_COORDS, _accorHotelLatLng, _accorKm, _accorPickHotels };');
}

const BS = { num: (n, l) => n.toLocaleString(l === 'fr' ? 'fr-CA' : 'en-CA') };
// YFC (Fredericton) has no centre of ours, so it is measured from its airport
const COORDS = { CDG: [49.01, 2.55], YFC: [45.87, -66.54] };
const hotel = (brand, name, lat, lng, city) => ({ hotel: {
  brand, name, status: 'OPEN',
  localization: { address: { city: city || '' }, gps: lat == null ? undefined : { lat: String(lat), lng: String(lng) } },
} });

test('the position is read from localization.gps, as the catalog sends it now', () => {
  const { _accorHotelLatLng } = load()(COORDS, BS);
  assert.deepEqual(_accorHotelLatLng(hotel('SOF', 'Sofitel Le Scribe', 48.8716, 2.3304).hotel), { lat: 48.8716, lng: 2.3304 });
  assert.equal(_accorHotelLatLng(hotel('MER', 'No position', null, null).hotel), null);
});

test('Paris is searched from its centre, not from Roissy', () => {
  const { DOWNTOWN_COORDS } = load()(COORDS, BS);
  for (const ia of ['CDG', 'ORY']) {
    assert.ok(DOWNTOWN_COORDS[ia], ia + ' has a city centre');
    assert.equal(DOWNTOWN_COORDS[ia].name, 'Paris');
    assert.ok(Math.abs(DOWNTOWN_COORDS[ia].lat - 48.86) < 0.05 && Math.abs(DOWNTOWN_COORDS[ia].lng - 2.35) < 0.05);
  }
  assert.equal(DOWNTOWN_COORDS.LHR.name, 'London');
  // the card names the city through the board city names (Londres on a French
  // card), never a French field of its own
  assert.ok(Object.values(DOWNTOWN_COORDS).every((c) => !('fr' in c)), 'no per-language field in the table');
  assert.match(CORE, /function _dtCity\(L\)\{[\s\S]*?airportCityNameSafe_v21877\(_dc\.iata, L\)/);
  const fetchFn = grab(/function fetchAccorHotels\([\s\S]*?\n\}/, 'fetchAccorHotels');
  assert.match(fetchFn, /DOWNTOWN_COORDS\[destIata\]/, 'the search centres on the city when it has one');
  assert.match(fetchFn, /&range=0-49&sort=distance/, 'fifty nearest, not sixteen');
});

test('five hotels, one per brand, the finer brands first', () => {
  const { _accorPickHotels } = load()(COORDS, BS);
  const rows = [
    hotel('MER', 'Mercure A', 48.857, 2.352),
    hotel('MER', 'Mercure B', 48.858, 2.353),
    hotel('IBH', 'ibis A', 48.859, 2.354),
    hotel('MER', 'Mercure C', 48.860, 2.355),
    hotel('SOF', 'Sofitel Le Scribe', 48.8716, 2.3304),
    hotel('SO', 'SO/ Paris', 48.850, 2.360),
    hotel('NOV', 'Novotel Les Halles', 48.862, 2.346),
  ];
  const names = _accorPickHotels(rows, 'CDG').map((r) => r.hotel.name);
  assert.equal(names.length, 5);
  assert.deepEqual(names.slice(0, 2).sort(), ['SO/ Paris', 'Sofitel Le Scribe'], 'premium brands lead');
  assert.ok(names.includes('Novotel Les Halles') && names.includes('ibis A'), 'every brand gets a place before a second Mercure');
  assert.equal(names.filter((n) => n.startsWith('Mercure')).length, 1, 'one Mercure while other brands wait');
});

test('only hotels near the city: 100 km, or the city named where there is no position', () => {
  const { _accorPickHotels } = load()(COORDS, BS);
  const rows = [
    hotel('FAI', 'Fairmont far away', 45.5, -73.57),              // Montréal, 5,500 km from Paris
    hotel('MER', 'Mercure Paris Gare de Lyon', null, null, 'Paris'), // no position, the city named
    hotel('IBS', 'ibis Styles nowhere', null, null, 'Lyon'),        // no position, another city
    hotel('NOV', 'Novotel Paris Centre', 48.86, 2.35),
  ];
  const names = _accorPickHotels(rows, 'CDG').map((r) => r.hotel.name);
  assert.deepEqual(names.sort(), ['Mercure Paris Gare de Lyon', 'Novotel Paris Centre']);
  assert.deepEqual(_accorPickHotels([], 'CDG'), []);
});

test('a city with no centre of ours measures from its airport', () => {
  const { DOWNTOWN_COORDS, _accorPickHotels } = load()(COORDS, BS);
  assert.ok(!DOWNTOWN_COORDS.YFC, 'the test needs a city with no centre');
  // Fredericton downtown is 15 km from its airport; Halifax is 200 km away
  const rows = [hotel('NOV', 'Fredericton downtown', 45.96, -66.64), hotel('NOV', 'Halifax', 44.65, -63.57)];
  assert.deepEqual(_accorPickHotels(rows, 'YFC').map((r) => r.hotel.name), ['Fredericton downtown']);
  // the airport point is what decides: swap its latitude and longitude and nothing is near
  assert.deepEqual(_accorPickHotels(rows.slice(0, 1), 'YFC').length, 1);
  const swapped = load()({ YFC: [-66.54, 45.87] }, BS)._accorPickHotels;
  assert.deepEqual(swapped(rows.slice(0, 1), 'YFC'), []);
});

test('distances read in the card language', () => {
  const { _accorKm } = load()(COORDS, BS);
  assert.equal(_accorKm('22.4 km', 'en'), '22.4 km');
  assert.equal(_accorKm('22.4 km', 'fr'), '22,4 km');
  assert.equal(_accorKm('', 'fr'), '');
  assert.match(CORE, /function _tpl\(map, L, km, city\)\{\n\s*var s = map\[L\] \|\| '';\n\s*return s\.replace\('%k', _accorKm\(km, L\)\)/);
});

test('the leg check counts the hotels in the cache entry, not the entry itself', () => {
  assert.match(CORE, /var c = _accorCacheFor\(ia\); return !!\(c && c\.hotels && c\.hotels\.length\);/);
  assert.doesNotMatch(CORE, /var c = _accorCacheFor\(ia\); return !!\(c && c\.length\);/);
});

// the deck builder, run on its own (the same brace walk the gate card tests use)
function braceFrom(SRC, start, what) {
  assert.ok(start >= 0, what + ' must exist');
  let i = SRC.indexOf('{', start);
  let depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) {
        if (SRC[i] === '\\') { i++; continue; }
        if (SRC[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return SRC.slice(start, i + 1); }
  }
  throw new Error('could not find the end of ' + what);
}

test('every picked hotel comes round: each pass of the deck starts two hotels further on', () => {
  const at = CORE.indexOf('\nfunction _buildGateAdSlideList(') + 1;
  const src = braceFrom(CORE, at, '_buildGateAdSlideList');
  const five = ['SO/ Paris', 'L\u2019Echiquier', 'Le Scribe', 'Maison Delano', 'Les Halles']
    .map((h) => ({ headline: h, isAccorHotel: true }));
  const hotelsOnPass = (pass) => new Function('window', 'document', 'location', 'getGateAds', '_welcomeCardData', '_gateCardsDue', '_gateCardsLive',
    'return (' + src + ')();')(
    { FIDS_MEDIA: null, _gateCurrentAirline: 'AC', _gateAccorPass: pass },
    { documentElement: { classList: { contains: () => false } } },
    { search: '' },
    () => [{ headline: 'house ad', imageOnly: true, bgImage: 'x.jpg' }].concat(five),
    (c) => ({ adLayout: 'welcome-card', code: c }),
    () => ({}),
    () => null)
    .filter((d) => d.type === 'ad' && d.data && d.data.isAccorHotel).map((d) => d.data.headline);
  assert.deepEqual(hotelsOnPass(0), ['SO/ Paris', 'L\u2019Echiquier']);
  assert.deepEqual(hotelsOnPass(1), ['Le Scribe', 'Maison Delano']);
  assert.deepEqual(hotelsOnPass(2), ['Les Halles', 'SO/ Paris']);
  const seen = new Set([0, 1, 2].flatMap(hotelsOnPass));
  assert.equal(seen.size, 5, 'all five within three passes');
  // and the rotation tick is what counts the passes
  assert.match(CORE, /_gateAdIndex = \(_gateAdIndex \+ 1\) % Math\.max\(1, totalSlots\);\n(?:\s*\/\/.*\n)*\s*if \(_gateAdIndex === 0\) window\._gateAccorPass = \(window\._gateAccorPass \|\| 0\) \+ 1;/);
});
