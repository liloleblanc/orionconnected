'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE HOTEL LISTS: THE CANDIDATE HELPER (scripts/hotels/find-candidates.js)
//
// An on-demand helper for a new city: one Overpass query, the raw answer
// cached, a worksheet and a skeleton of the checked file in which every fact
// is EMPTY and every verified mark false. OpenStreetMap only finds; what it
// says is kept apart (osm_candidate) for a person to check on a named
// official page. These tests run its pure parts on answers built here: no
// network, nothing written.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const F = require(path.join(ROOT, 'scripts/hotels/find-candidates.js'));
const H = require(path.join(ROOT, 'fids-current/js/hotel-list-card.js'));
const SRC = read('scripts/hotels/find-candidates.js');
const DOCS = {};
for (const C of H.CITIES) DOCS[C] = JSON.parse(read('scripts/hotels/data/' + C.toLowerCase() + '.json'));
const YQM = DOCS.YQM;
const P = { airport: YQM.points.airport, centre: YQM.points.centre };

// a place a given distance north (or south) of one of Moncton's points, as an Overpass element
const north = (from, km) => ({ lat: P[from].lat + km / 111.2, lon: P[from].lng });
const pt = (o) => ({ lat: o.lat, lng: o.lon });
let nextId = 1000;
const el = (type, at, tags) => {
  const e = { type, id: nextId++, tags };
  if (type === 'node') { e.lat = at.lat; e.lon = at.lon; } else e.center = { lat: at.lat, lon: at.lon };
  return e;
};

test('the two points are the board\'s own: the airport from airport-coords.js, the centre from DOWNTOWN_COORDS', () => {
  for (const doc of Object.values(DOCS)) {
    const a = F.airportPoint(doc.iata);
    assert.ok(a, doc.iata + ' airport');
    if (/airport-coords\.js/.test(doc.points.airport.source)) assert.deepEqual([a.lat, a.lng], [doc.points.airport.lat, doc.points.airport.lng], doc.iata);
  }
  assert.deepEqual(F.centrePoint('YQM'), { lat: 46.0878, lng: -64.7782, name: 'Moncton' });
  // Charlottetown has no entry: the helper asks for the centre instead of making one up
  assert.equal(F.centrePoint('YYG'), null);
  assert.throws(() => F.pointsFor('YYG'), /--centre LAT,LNG/);
  const given = F.pointsFor('YYG', { lat: 46.2353, lng: -63.1296 });
  assert.match(given.centre.source, /--centre/);
  assert.deepEqual(F.pointsFor('YQM').centre, { lat: 46.0878, lng: -64.7782, name: 'Moncton', source: 'DOWNTOWN_COORDS.YQM in fids-current/js/fids-core.js' });
  assert.equal(F.airportPoint('ZZQ'), null);
});

test('one query a city: both points, the reach of the cards (about 30 km and its tolerance), every kind it sorts', () => {
  assert.equal(F.radiusKm(), H.RULE.nearbyKm * H.RULE.tolerance);
  const q = F.overpassQuery(F.pointsFor('YQM'));
  assert.equal(q, '[out:json][timeout:90];('
    + 'nwr["tourism"~"^(hotel|guest_house|apartment|motel|hostel)$"](around:33000,46.11,-64.68);'
    + 'nwr["tourism"~"^(hotel|guest_house|apartment|motel|hostel)$"](around:33000,46.0878,-64.7782);'
    + ');out center tags;');
  // the one public endpoint, a generic client name, no personal detail, no other route
  assert.equal(F.ENDPOINT, 'https://overpass-api.de/api/interpreter');
  assert.match(F.USER_AGENT, /^hotel-candidates-helper\/\d/);
  assert.doesNotMatch(F.USER_AGENT, /@|mailto|https?:/i, 'no address of anyone in the client name');
  assert.equal((SRC.match(/https?:\/\/[a-z0-9.-]*overpass[a-z0-9.-]*/gi) || []).filter((u) => u !== 'https://overpass-api.de').length, 0, 'no mirror');
  assert.doesNotMatch(SRC, /setInterval|setTimeout\(|puppeteer|playwright|proxy/i, 'on demand only, no browser, no proxy');
  // a block is recorded, never worked around
  assert.match(SRC, /HTTP 403 from the Overpass API: blocked, needs a person\. No other route is tried\./);
  // the credit is printed with every run
  assert.equal(F.CREDIT, '© OpenStreetMap contributors');
  assert.ok(F.CREDIT_LINES.some((l) => l.includes('© OpenStreetMap contributors') && /ODbL/.test(l)));
  assert.match(SRC, /for \(const l of CREDIT_LINES\) console\.log\(l\);/);
  // its working files stay out of git
  assert.match(read('.gitignore'), /^scripts\/hotels\/work\/$/m);
});

test('distances and areas are the cards\' own: the helper agrees with every checked hotel, figure and words', () => {
  let n = 0;
  for (const doc of Object.values(DOCS)) {
    for (const h of doc.hotels) {
      const d = F.distances(h, doc.points);
      assert.deepEqual([d.airport, d.centre], [h.distance_km.airport, h.distance_km.centre], doc.iata + ' ' + h.id + ' distances');
      if (h.area === 'resort') continue; // a resort is a choice a person makes, with its drive
      assert.equal(F.areaFor(h, doc.points), h.area, doc.iata + ' ' + h.id + ' area');
      if (h.area_reason) assert.equal(F.areaReason(h.area, d), h.area_reason, doc.iata + ' ' + h.id + ' reason');
      n++;
    }
  }
  assert.ok(n >= 50, 'checked against ' + n + ' hotels');
  // the rule's own lines, as the cards test them
  assert.equal(F.areaFor(pt(north('centre', 2.15)), P), 'downtown');
  assert.equal(F.areaFor(pt(north('airport', 5.4)), P), 'airport');
  assert.equal(F.areaFor(pt(north('airport', 32)), P), 'nearby');
  assert.equal(F.areaFor(pt(north('airport', 40)), P), '');
  assert.match(F.areaReason('', { airport: 40, centre: 41.2 }), /^About 41\.2 km from the centre point and 40\.0 km from the airport: beyond 30 km/);
  // the rules text of the skeleton is yqm.json's, word for word
  const sk = F.skeleton('YQM', F.pointsFor('YQM'), [], YQM, '2026-11-21');
  assert.deepEqual(sk.rules, YQM.rules);
});

test('one place once: a node and a way of one hotel are merged, two hotels stay two', () => {
  const at = north('centre', 0.5);
  const near = { lat: at.lat + 0.0003, lon: at.lon };
  const far = { lat: at.lat + 0.02, lon: at.lon };
  const places = F.placesOf({ elements: [
    el('node', at, { tourism: 'hotel', name: 'Hotel Example', phone: '+1 506 555 0100' }),
    el('way', near, { tourism: 'hotel', name: 'Hôtel Example', website: 'https://example.org/', 'addr:street': 'Main Street', 'addr:housenumber': '1' }),
    // the same name 2 km away: another hotel
    el('node', far, { tourism: 'hotel', name: 'Hotel Example' }),
    // a dual-brand building: two names at one address stay two
    el('way', near, { tourism: 'hotel', name: 'Hampton Inn Example', brand: 'Hampton', 'addr:street': 'Main Street', 'addr:housenumber': '9' }),
    el('way', near, { tourism: 'hotel', name: 'Homewood Suites Example', brand: 'Homewood Suites', 'addr:street': 'Main Street', 'addr:housenumber': '9' }),
    // one name inside the other, a few metres apart
    el('node', at, { tourism: 'hotel', name: 'Château Example' }),
    el('node', near, { tourism: 'hotel', name: 'Château Example Downtown' }),
    // a node with no position is dropped
    { type: 'node', id: 1, tags: { tourism: 'hotel', name: 'Nowhere' } }
  ] });
  assert.equal(places.length, 7);
  const once = F.dedupe(places);
  assert.equal(once.length, 5);
  const ex = once.filter((p) => /example$/i.test(p.tags.name) && !/chateau|château|hampton|homewood/i.test(p.tags.name));
  assert.equal(ex.length, 2, 'the far one stays');
  const merged = ex.find((p) => p.also.length);
  assert.equal(merged.type, 'way', 'the richer element leads');
  assert.equal(merged.tags.phone, '+1 506 555 0100', 'a tag it lacks is filled from the other');
  assert.equal(merged.also.length, 1);
  assert.ok(once.some((p) => p.tags.name === 'Hampton Inn Example') && once.some((p) => p.tags.name === 'Homewood Suites Example'));
  assert.equal(once.filter((p) => /^Château/.test(p.tags.name)).length, 1);
  // the same name of two kinds is not merged (a hotel and its motel annex)
  assert.equal(F.samePlace({ tourism: 'hotel', lat: 46, lng: -64, tags: { name: 'A' } }, { tourism: 'motel', lat: 46, lng: -64, tags: { name: 'A' } }), false);
});

test('kinds: a hotel is a candidate, a guest house or apartment is flagged, a motel or hostel stays off, a hotel with no name is not matched', () => {
  const answer = { elements: [
    el('way', north('airport', 1), { tourism: 'hotel', name: 'Airport Example Hotel', brand: 'Holiday Inn Express & Suites', 'brand:wikidata': 'Q5880423' }),
    el('node', north('centre', 0.3), { tourism: 'hotel', name: 'Comfort Inn Example' }),
    el('node', north('centre', 12), { tourism: 'hotel', name: 'Element Lodge' }),
    el('node', north('centre', 0.6), { tourism: 'guest_house', name: 'Example B&B' }),
    el('node', north('centre', 0.7), { tourism: 'apartment', name: 'Example Suites' }),
    el('node', north('centre', 3), { tourism: 'motel', name: 'Example Motel' }),
    el('node', north('centre', 4), { tourism: 'hostel', name: 'Example Hostel' }),
    el('way', north('centre', 5), { tourism: 'hotel' }),
    el('node', north('airport', 36), { tourism: 'hotel', name: 'Far Example Hotel' }),
    el('node', north('centre', 1), { tourism: 'camp_site', name: 'Not asked for' })
  ] };
  const rows = F.classify(answer, P);
  const by = (n) => rows.find((r) => r.osm.name === n);
  assert.equal(rows.length, 9, 'a kind not asked for is ignored');
  assert.equal(by('Airport Example Hotel').status, 'candidate');
  assert.equal(by('Airport Example Hotel').area, 'airport');
  assert.equal(by('Comfort Inn Example').area, 'downtown');
  assert.equal(by('Example B&B').status, 'flagged');
  assert.equal(by('Example Suites').status, 'flagged');
  assert.equal(by('Example Motel').status, 'excluded');
  assert.equal(by('Example Motel').kind, 'motel');
  assert.equal(by('Example Hostel').kind, 'hostel');
  assert.equal(by('Far Example Hotel').kind, 'hotel_out_of_range');
  assert.equal(rows.find((r) => !r.osm.name).kind, 'unconfirmed');
  // candidates first, by card, then the rest
  assert.deepEqual(rows.slice(0, 3).map((r) => r.area), ['airport', 'downtown', 'nearby']);
  // guest houses and apartments join the skeleton (held back) only when asked
  const sk = F.skeleton('YQM', F.pointsFor('YQM'), rows, YQM, '2026-11-21');
  assert.equal(sk.hotels.length, 3);
  assert.equal(sk.excluded.length, 6);
  const withFlagged = F.skeleton('YQM', F.pointsFor('YQM'), F.classify(answer, P, { includeFlagged: true }), YQM, '2026-11-21');
  assert.equal(withFlagged.hotels.length, 5);
  assert.match(withFlagged.hotels.find((h) => h.osm_candidate.tourism === 'guest_house').not_listed_reason, /not a hotel/);
  // brands and groups from the brand tag, else (weaker) the start of the name; a word that may
  // open an independent name is read from the tag only
  assert.deepEqual([by('Airport Example Hotel').osm.brand, by('Airport Example Hotel').osm.group, by('Airport Example Hotel').osm.brand_from, by('Airport Example Hotel').osm.brand_wikidata],
    ['Holiday Inn Express & Suites', 'IHG Hotels & Resorts', 'brand tag', 'Q5880423']);
  assert.deepEqual([by('Comfort Inn Example').osm.brand, by('Comfort Inn Example').osm.group, by('Comfort Inn Example').osm.brand_from], ['Comfort Inn', 'Choice Hotels', 'name']);
  assert.deepEqual([by('Element Lodge').osm.brand, by('Element Lodge').osm.group], ['', '']);
  assert.deepEqual(F.brandOf({ brand: 'Element' }), { brand: 'Element', group: 'Marriott International', from: 'brand tag', wikidata: '' });
  assert.deepEqual(F.brandOf({ brand: 'Travelodge' }), { brand: 'Travelodge', group: '', from: 'brand tag', wikidata: '' }, 'a brand of several companies has no group');
  assert.deepEqual(F.brandOf({ name: 'Hampton Inn & Suites by Hilton Example' }), { brand: 'Hampton Inn & Suites', group: 'Hilton', from: 'name', wikidata: '' });
  // the group names are the ones the checked files use
  const used = new Set(Object.values(DOCS).flatMap((d) => d.hotels.map((h) => h.group)).filter(Boolean));
  for (const g of ['Marriott International', 'Hilton', 'IHG Hotels & Resorts', 'Choice Hotels', 'Wyndham Hotels & Resorts', 'Hyatt', 'BWH Hotels']) assert.ok(used.has(g), g);
});

test('the skeleton is yqm.json\'s schema with every fact empty and every verified mark false; what OpenStreetMap says is kept apart', () => {
  const answer = { elements: [
    el('way', north('airport', 1), { tourism: 'hotel', name: 'Airport Example Hotel', brand: 'Hilton Garden Inn', 'addr:housenumber': '5', 'addr:street': 'Runway Road', 'addr:city': 'Dieppe', phone: '+1 506 555 0101', website: 'https://example.org/airport' }),
    el('node', north('centre', 0.2), { tourism: 'hotel', name: 'Shaw’s Example Hotel' })
  ] };
  const rows = F.classify(answer, P);
  const sk = F.skeleton('YQM', F.pointsFor('YQM'), rows, YQM, '2026-11-21');
  assert.deepEqual(Object.keys(sk), Object.keys(YQM), 'the same top-level fields, in order');
  assert.deepEqual(Object.keys(sk.notes), Object.keys(YQM.notes));
  assert.deepEqual(Object.keys(sk.points.airport), Object.keys(YQM.points.airport));
  const model = YQM.hotels.find((h) => !h.drive);
  for (const h of sk.hotels) {
    assert.deepEqual(Object.keys(h), Object.keys(model).concat(['osm_candidate']), 'the fields of a checked hotel, and osm_candidate');
    assert.deepEqual(Object.keys(h.address), Object.keys(model.address));
    assert.deepEqual(Object.keys(h.verified), Object.keys(model.verified));
    assert.deepEqual(Object.keys(h.shuttle), Object.keys(model.shuttle));
    assert.deepEqual(Object.keys(h.season), Object.keys(model.season));
    // every fact empty
    assert.equal(h.name, '');
    assert.equal(h.phone, '');
    assert.equal(h.website, '');
    assert.equal(h.brand, '');
    assert.equal(h.group, '');
    for (const v of Object.values(h.address)) assert.equal(v, '');
    assert.equal(h.season.year_round, null);
    assert.equal(h.season.verified, false);
    assert.equal(h.shuttle.mark, false, 'no shuttle mark until it is verified');
    assert.equal(h.shuttle.offered, null);
    assert.equal(h.logo, null);
    assert.ok(h.logo_missing);
    // held back until checked
    assert.equal(h.listed, false);
    assert.ok(h.not_listed_reason);
    for (const [k, m] of Object.entries(h.verified)) {
      assert.equal(m.verified, false, h.id + ' ' + k);
      if (k !== 'latlng') assert.equal(m.source, '', h.id + ' ' + k);
    }
    assert.equal(h.verified.latlng.source, h.osm);
    // the computed part: the area by the cards' rule from the OpenStreetMap position
    assert.equal(h.area, H.areaOf(h, sk.points));
    assert.equal(h.area_reason, F.areaReason(h.area, h.distance_km));
    assert.match(h.osm_candidate.note, /candidates only/);
  }
  const a = sk.hotels[0];
  assert.equal(a.id, 'airport-example-hotel');
  assert.deepEqual([a.osm_candidate.name, a.osm_candidate.housenumber, a.osm_candidate.street, a.osm_candidate.town, a.osm_candidate.phone, a.osm_candidate.website, a.osm_candidate.brand, a.osm_candidate.group],
    ['Airport Example Hotel', '5', 'Runway Road', 'Dieppe', '+1 506 555 0101', 'https://example.org/airport', 'Hilton Garden Inn', 'Hilton']);
  assert.equal(sk.hotels[1].id, 'shaws-example-hotel', 'ids in the manner of the checked files');
  // the file names itself a skeleton, and the city half of it is left to a person
  assert.equal(sk.built, '');
  assert.equal(sk.province, '');
  assert.deepEqual(sk.foot_marks, []);
  assert.match(sk.unverified[0], /^SKELETON made by scripts\/hotels\/find-candidates\.js on 2026-11-21/);
  assert.ok(sk.unverified.some((l) => /An AI model is never the source/.test(l)));
  assert.match(sk.runtime, /fids-current\/data\/hotels\/yqm\.json/);
  assert.ok(sk.notes.sources.every((s) => s.includes('© OpenStreetMap contributors')));
  // the build step would show none of it: every hotel is held back
  const RT = require(path.join(ROOT, 'scripts/hotels/build-runtime.js'));
  assert.deepEqual(RT.slim(sk).hotels, []);
});

test('the worksheet: one row a place, quoted where a cell needs it, empty columns for the person who checks', () => {
  assert.equal(F.csvCell('a,b'), '"a,b"');
  assert.equal(F.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(F.csvCell('two\nlines'), '"two\nlines"');
  assert.equal(F.csvCell(null), '');
  const rows = F.classify({ elements: [el('node', north('centre', 0.2), { tourism: 'hotel', name: 'Inn, "Example"', phone: '+1 506 555 0102' })] }, P);
  const csv = F.worksheetCsv(rows).split('\r\n');
  assert.equal(csv.length, 3);
  const head = csv[0].split(',');
  for (const c of ['status', 'skeleton_id', 'area', 'km_airport', 'km_centre', 'osm_name', 'osm_phone', 'osm_url', 'checked_name', 'checked_phone', 'source_url', 'checked_date']) assert.ok(head.includes(c), c);
  assert.ok(csv[1].startsWith('candidate,inn-example,downtown,'));
  assert.ok(csv[1].includes('"Inn, ""Example"""'));
  assert.match(csv[1], /,{14}$/, 'the checked columns start empty');
});

test('the command line: a code, --refresh, --include-flagged, --centre', () => {
  assert.deepEqual(F.parseArgs(['yhz']), { iata: 'YHZ', refresh: false, includeFlagged: false, centre: null, help: false });
  assert.deepEqual(F.parseArgs(['YYG', '--refresh', '--centre', '46.2353,-63.1296', '--include-flagged']),
    { iata: 'YYG', refresh: true, includeFlagged: true, centre: { lat: 46.2353, lng: -63.1296 }, help: false });
  assert.throws(() => F.parseArgs(['YHZ', '--centre', 'downtown']), /LAT,LNG/);
  assert.throws(() => F.parseArgs(['YHZ', '--force']), /not understood/);
});
