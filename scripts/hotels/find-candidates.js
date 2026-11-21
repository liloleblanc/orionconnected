#!/usr/bin/env node
'use strict';
// THE HOTEL LISTS: CANDIDATES FOR A NEW CITY
//
// An on-demand helper, run by a person at a desk for one city at a time. Never a timer, never
// the worker. It asks OpenStreetMap (one Overpass query a city, the raw answer cached) for the
// places to stay within reach of the city's two points, and writes a worksheet and a skeleton
// of the checked file for a person to fill:
//
//   node scripts/hotels/find-candidates.js YHZ                ask once (or reuse the cached answer)
//   node scripts/hotels/find-candidates.js YHZ --refresh      ask OpenStreetMap again
//   node scripts/hotels/find-candidates.js YYG --centre 46.2353,-63.1296
//                                                            a city with no DOWNTOWN_COORDS entry
//   node scripts/hotels/find-candidates.js YHZ --include-flagged
//                                                            guest houses and apartments in the
//                                                            skeleton too (held back), not only
//                                                            in its excluded list
//
// It writes, under scripts/hotels/work/ (not in git):
//   <code>-overpass.json          the raw answer of the Overpass API, as received
//   <code>-overpass.query.txt     the query that answer belongs to
//   <code>-worksheet.csv          one row a place: what OpenStreetMap says, the distances and
//                                 the area, and empty columns for what a person checks
//   <code>-skeleton.json          a checked file in the schema of scripts/hotels/data/yqm.json
//                                 with every fact EMPTY and every verified mark false; what
//                                 OpenStreetMap says is kept apart, in osm_candidate
//
// OPENSTREETMAP ONLY FINDS. Its names, addresses, telephones and websites are candidates and
// are never published as they are (on Moncton only 2 of 28 hotels came back with all four
// right). Every published fact is copied from a named official page (the hotel's own page, its
// brand property page, the airport's own page, or the official city or provincial tourism
// site) with that page and the date it was read. An AI model is never the source of a hotel,
// an address or a telephone. A page that answers 403, a robot block or a captcha is recorded as
// blocked, needs a person, and is never read another way. scripts/hotels/README.md has the
// whole workflow.
//
// The area rule is the cards' own (HotelListCard.areaOf and HotelListCard.RULE in
// fids-current/js/hotel-list-card.js), and the rules text is copied from yqm.json.
// Data from OpenStreetMap is (c) OpenStreetMap contributors, ODbL 1.0: anything kept from it
// (a position, a distance worked out from one) carries the credit.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const CARD = require(path.join(ROOT, 'fids-current', 'js', 'hotel-list-card.js'));
const WORK_DIR = path.join(__dirname, 'work');
const MODEL_FILE = path.join(__dirname, 'data', 'yqm.json');
const AIRPORT_COORDS_FILE = path.join(ROOT, 'fids-current', 'js', 'airport-coords.js');
const CORE_FILE = path.join(ROOT, 'fids-current', 'js', 'fids-core.js');

// The one public endpoint, asked politely: one query a city, a generic client name, no retry
// loop, no other endpoint or mirror when it says no.
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'hotel-candidates-helper/1.0 (on-demand, one query a city)';
const CREDIT = '© OpenStreetMap contributors';
const CREDIT_LINES = [
  'Data ' + CREDIT + ', ODbL 1.0 (https://www.openstreetmap.org/copyright).',
  'Anything kept from it (a position, a distance worked out from one) carries the credit "' + CREDIT + '" where it is shown.',
  'OpenStreetMap values are candidates only: every published fact comes from a named official page.'
];

// What each kind of place becomes. A hotel is a candidate; a guest house or an apartment is
// flagged (in the skeleton only with --include-flagged); motels and hostels stay off, as the
// checked lists keep them (see the excluded list of yqm.json).
const KINDS = {
  hotel: { status: 'candidate' },
  guest_house: { status: 'flagged', kind: 'bed_and_breakfast', reason: 'Not a hotel (OpenStreetMap tourism=guest_house); not checked. Off the hotel cards unless picked.' },
  apartment: { status: 'flagged', kind: 'apartment_suites', reason: 'Apartments (OpenStreetMap tourism=apartment); not checked. Off the hotel cards unless picked.' },
  motel: { status: 'excluded', kind: 'motel', reason: 'Motel (OpenStreetMap tourism=motel): motels stay off unless picked.' },
  hostel: { status: 'excluded', kind: 'hostel', reason: 'Hostel (OpenStreetMap tourism=hostel): hostels stay off unless picked.' }
};

// ── THE TWO POINTS ──────────────────────────────────────────────────────────
// The airport: fids-current/js/airport-coords.js, the board's own table.
function airportPoint(iata, src) {
  const text = src == null ? fs.readFileSync(AIRPORT_COORDS_FILE, 'utf8') : src;
  const win = {};
  vm.runInNewContext(text, { window: win }, { filename: 'airport-coords.js', timeout: 2000 });
  const p = win.AIRPORT_COORDS && win.AIRPORT_COORDS[String(iata).toUpperCase()];
  return Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) ? { lat: p[0], lng: p[1] } : null;
}
// The centre: DOWNTOWN_COORDS in fids-current/js/fids-core.js, the board's own table.
function centreTable(src) {
  const text = src == null ? fs.readFileSync(CORE_FILE, 'utf8') : src;
  const head = 'var DOWNTOWN_COORDS = {';
  const at = text.indexOf(head);
  if (at < 0) throw new Error('DOWNTOWN_COORDS not found in fids-core.js');
  const end = text.indexOf('\n};', at);
  if (end < 0) throw new Error('the end of DOWNTOWN_COORDS not found in fids-core.js');
  return vm.runInNewContext('(' + text.slice(at + head.length - 1, end + 2) + ')', {}, { timeout: 2000 });
}
function centrePoint(iata, src) {
  const e = centreTable(src)[String(iata).toUpperCase()];
  return e && Number.isFinite(e.lat) && Number.isFinite(e.lng) ? { lat: e.lat, lng: e.lng, name: e.name || '' } : null;
}

// ── THE QUERY ───────────────────────────────────────────────────────────────
// The reach of the cards: nearby is about 30 km of either point with the rule's tolerance.
function radiusKm() { return CARD.RULE.nearbyKm * CARD.RULE.tolerance; }
function overpassQuery(points) {
  const r = Math.round(radiusKm() * 1000);
  const f = 'nwr["tourism"~"^(' + Object.keys(KINDS).join('|') + ')$"]';
  const at = (p) => f + '(around:' + r + ',' + p.lat + ',' + p.lng + ');';
  return '[out:json][timeout:90];(' + at(points.airport) + at(points.centre) + ');out center tags;';
}

// ── WORDS, NAMES AND DISTANCES ──────────────────────────────────────────────
function norm(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(and|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
// An id in the manner of the checked files (shaws-hotel, st-james-gate): a person may shorten it.
function slug(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const round1 = (x) => Math.round(x * 10) / 10;
// Straight-line distances to the two points, in km to one decimal, by the cards' own km.
function distances(p, points) {
  return { airport: round1(CARD.km(points.airport, p)), centre: round1(CARD.km(points.centre, p)) };
}
// The card a place belongs to, by the cards' own rule ('' = outside every card). The helper
// never makes a resort: a destination resort is a choice a person makes, with its drive.
function areaFor(p, points) { return CARD.areaOf({ lat: p.lat, lng: p.lng, resort: false }, points); }
// The reason, in the words of the checked files (yqm.json area_reason).
function areaReason(area, d) {
  const R = CARD.RULE, tol = Math.round((R.tolerance - 1) * 100) + ' % tolerance';
  const k = (x) => x.toFixed(1) + ' km';
  if (area === 'downtown') return k(d.centre) + ' from the centre point (limit about ' + R.downtownKm + ' km, ' + tol + ').';
  if (area === 'airport') return k(d.airport) + ' from the airport point (limit about ' + R.airportKm + ' km, ' + tol + '); airport wins when both apply.';
  if (area === 'nearby') return k(d.centre) + ' from the centre point, ' + k(d.airport) + ' from the airport (within about ' + R.nearbyKm + ' km).';
  return 'About ' + k(d.centre) + ' from the centre point and ' + k(d.airport) + ' from the airport: beyond ' + R.nearbyKm + ' km and not a destination resort.';
}

// ── BRANDS ──────────────────────────────────────────────────────────────────
// The brand and its group, from the OpenStreetMap brand tag (or, weaker, the start of the
// name). Only brands whose group is plain; a brand that belongs to different companies in
// different countries (Travelodge, Radisson, Comfort Hotel, Clarion) is left without a group.
// The group names are the ones the checked files use. A candidate like everything else here.
const BRAND_GROUPS = {
  'Marriott International': ['Marriott', 'JW Marriott', 'Courtyard', 'Courtyard by Marriott', 'Residence Inn', 'Residence Inn by Marriott',
    'Fairfield Inn', 'Fairfield Inn & Suites', 'Fairfield by Marriott', 'SpringHill Suites', 'TownePlace Suites', 'Delta Hotels',
    'Four Points by Sheraton', 'Four Points', 'Sheraton', 'Westin', 'Le Méridien', 'Renaissance', 'Autograph Collection',
    'Autograph Collection Hotels', 'Moxy', 'Aloft', 'AC Hotels', 'Element', 'Tribute Portfolio', 'W Hotels', 'St. Regis',
    'The Ritz-Carlton', 'Gaylord Hotels'],
  Hilton: ['Hilton', 'Hilton Hotels & Resorts', 'Hilton Garden Inn', 'Hampton', 'Hampton by Hilton', 'Hampton Inn', 'Hampton Inn & Suites',
    'DoubleTree', 'DoubleTree by Hilton', 'Homewood Suites', 'Homewood Suites by Hilton', 'Home2 Suites', 'Home2 Suites by Hilton',
    'Embassy Suites', 'Embassy Suites by Hilton', 'Tapestry Collection by Hilton', 'Curio Collection by Hilton', 'Canopy by Hilton',
    'Conrad', 'Waldorf Astoria', 'Tru by Hilton', 'Motto by Hilton', 'Spark by Hilton'],
  'IHG Hotels & Resorts': ['Holiday Inn', 'Holiday Inn Express', 'Holiday Inn Express & Suites', 'Crowne Plaza', 'Staybridge Suites',
    'Candlewood Suites', 'avid hotels', 'Hotel Indigo', 'InterContinental', 'Kimpton', 'voco', 'EVEN Hotels', 'Atwell Suites'],
  'Choice Hotels': ['Comfort Inn', 'Comfort Inn & Suites', 'Comfort Suites', 'Quality Inn', 'Quality Inn & Suites', 'Sleep Inn',
    'Econo Lodge', 'Rodeway Inn', 'Cambria Hotels', 'MainStay Suites', 'Suburban Studios', 'WoodSpring Suites', 'Ascend Hotel Collection'],
  'Wyndham Hotels & Resorts': ['Days Inn', 'Days Inn by Wyndham', 'Super 8', 'Super 8 by Wyndham', 'Ramada', 'Ramada by Wyndham',
    'Howard Johnson', 'Howard Johnson by Wyndham', 'Wingate by Wyndham', 'Microtel Inn & Suites by Wyndham', 'Baymont by Wyndham',
    'La Quinta Inn & Suites', 'La Quinta by Wyndham', 'Wyndham', 'Wyndham Garden', 'Hawthorn Suites by Wyndham',
    'Trademark Collection by Wyndham', 'TRYP by Wyndham', 'AmericInn by Wyndham', 'Travelodge by Wyndham',
    'Travelodge Suites by Wyndham', 'Thriftlodge'],
  Hyatt: ['Hyatt', 'Hyatt Place', 'Hyatt House', 'Hyatt Regency', 'Grand Hyatt', 'Park Hyatt', 'Andaz', 'Hyatt Centric', 'Caption by Hyatt'],
  'BWH Hotels': ['Best Western', 'Best Western Plus', 'Best Western Premier', 'SureStay', 'SureStay Plus', 'Aiden by Best Western'],
  Accor: ['Novotel', 'ibis', 'ibis Styles', 'ibis budget', 'Mercure', 'Grand Mercure', 'Fairmont', 'Sofitel', 'Pullman', 'Swissôtel',
    'Mövenpick', 'MGallery', 'hotelF1', 'Mama Shelter', 'Raffles']
};
// Single words that may also open an independent name: matched on the brand tag only.
const TAG_ONLY = new Set(['element', 'conrad', 'aloft', 'moxy', 'wyndham', 'kimpton', 'voco', 'andaz', 'raffles', 'renaissance', 'hampton', 'doubletree']);
const BRANDS = (() => {
  const out = [];
  for (const [group, list] of Object.entries(BRAND_GROUPS)) for (const brand of list) out.push({ key: norm(brand), brand, group });
  return out.sort((a, b) => b.key.length - a.key.length);
})();
function brandOf(tags) {
  const t = tags || {};
  const tag = t.brand || '';
  if (tag) {
    const k = norm(tag);
    const hit = BRANDS.find((b) => b.key === k);
    return { brand: tag, group: hit ? hit.group : '', from: 'brand tag', wikidata: t['brand:wikidata'] || '' };
  }
  const n = norm(t.name);
  if (n) {
    const hit = BRANDS.find((b) => !TAG_ONLY.has(b.key) && (n === b.key || n.startsWith(b.key + ' ')));
    if (hit) return { brand: hit.brand, group: hit.group, from: 'name', wikidata: '' };
  }
  return { brand: '', group: '', from: '', wikidata: '' };
}

// ── THE ANSWER ──────────────────────────────────────────────────────────────
// Each element of an Overpass answer as a place: its kind, position (a way or a relation by its
// centre) and tags.
function placesOf(answer) {
  const els = (answer && Array.isArray(answer.elements)) ? answer.elements : [];
  const out = [];
  for (const e of els) {
    const lat = Number.isFinite(e.lat) ? e.lat : (e.center && e.center.lat);
    const lng = Number.isFinite(e.lon) ? e.lon : (e.center && e.center.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const tags = e.tags || {};
    out.push({ type: e.type, id: e.id, lat, lng, tags, tourism: tags.tourism || '', url: 'https://www.openstreetmap.org/' + e.type + '/' + e.id });
  }
  return out;
}
const TYPE_RANK = { way: 0, relation: 1, node: 2 };
const street = (t) => norm([t['addr:housenumber'] || '', t['addr:street'] || ''].join(' '));
// Two elements that are one place: the same name within 400 m; one name inside the other
// within 150 m; or the same brand item at the same street address. Two hotels of two names at
// one address (a dual-brand building) stay two.
function samePlace(a, b) {
  if (a.tourism !== b.tourism) return false;
  const d = CARD.km(a, b);
  const na = norm(a.tags.name), nb = norm(b.tags.name);
  if (na && na === nb && d <= 0.4) return true;
  if (na && nb && d <= 0.15 && (na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 6) return true;
  const wa = a.tags['brand:wikidata'], wb = b.tags['brand:wikidata'], sa = street(a.tags);
  if (wa && wa === wb && a.tags['addr:housenumber'] && sa && sa === street(b.tags) && d <= 0.4) return true;
  return false;
}
// The places once each: the richest element first (most tags, then a way, then the lowest id),
// a tag it lacks filled from the others, every element's address kept.
function dedupe(places) {
  const parent = places.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) if (samePlace(places[i], places[j])) parent[find(j)] = find(i);
  }
  const groups = new Map();
  places.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  const out = [];
  for (const g of groups.values()) {
    g.sort((a, b) => (Object.keys(b.tags).length - Object.keys(a.tags).length) || (TYPE_RANK[a.type] - TYPE_RANK[b.type]) || (a.id - b.id));
    const first = g[0];
    const tags = Object.assign({}, first.tags);
    for (const o of g.slice(1)) for (const [k, v] of Object.entries(o.tags)) if (!(k in tags)) tags[k] = v;
    out.push(Object.assign({}, first, { tags, also: g.slice(1).map((o) => o.url) }));
  }
  return out;
}

// What OpenStreetMap says of a place, kept apart from the facts.
function osmCandidate(p, brand) {
  const t = p.tags;
  const pick = (...keys) => { for (const k of keys) if (t[k]) return String(t[k]); return ''; };
  return {
    note: 'OpenStreetMap (' + CREDIT + '): candidates only, never published as they are. Copy each fact from a named official page.',
    osm: p.url,
    also: p.also || [],
    tourism: p.tourism,
    name: pick('name'),
    name_en: pick('name:en'),
    name_fr: pick('name:fr'),
    brand: brand.brand,
    group: brand.group,
    brand_from: brand.from,
    brand_wikidata: brand.wikidata,
    operator: pick('operator'),
    housenumber: pick('addr:housenumber'),
    street: pick('addr:street'),
    town: pick('addr:city', 'addr:town', 'addr:village'),
    province: pick('addr:province', 'addr:state'),
    postal_code: pick('addr:postcode'),
    phone: pick('phone', 'contact:phone'),
    website: pick('website', 'contact:website', 'url'),
    stars: pick('stars'),
    rooms: pick('rooms'),
    check_date: pick('check_date')
  };
}

// The places, sorted: candidates by card then distance, the rest after them.
function classify(answer, points, opts) {
  const o = opts || {};
  const places = dedupe(placesOf(answer).filter((p) => KINDS[p.tourism]));
  const rows = [];
  for (const p of places) {
    const d = distances(p, points);
    const area = areaFor(p, points);
    const brand = brandOf(p.tags);
    const kind = KINDS[p.tourism];
    let status = kind.status, reason = kind.reason || '', exKind = kind.kind || '';
    if (status === 'flagged' && o.includeFlagged) status = 'candidate';
    if (status === 'candidate' && !norm(p.tags.name)) { status = 'excluded'; exKind = 'unconfirmed'; reason = 'tourism=' + p.tourism + ' with no name in OpenStreetMap: could not be matched to a place.'; }
    if (status === 'candidate' && !area) { status = 'excluded'; exKind = 'hotel_out_of_range'; reason = areaReason('', d); }
    rows.push({ place: p, d, area, brand, status, kind: exKind, reason, osm: osmCandidate(p, brand) });
  }
  const ORDER = { candidate: 0, flagged: 1, excluded: 2 };
  const near = (r) => (r.area === 'airport' ? r.d.airport : r.area === 'downtown' ? r.d.centre : Math.min(r.d.airport, r.d.centre));
  rows.sort((a, b) => (ORDER[a.status] - ORDER[b.status])
    || ((CARD.AREAS.indexOf(a.area) + 1 || 9) - (CARD.AREAS.indexOf(b.area) + 1 || 9))
    || (near(a) - near(b)) || String(a.osm.name).localeCompare(String(b.osm.name)) || (a.place.id - b.place.id));
  // ids: from the name, made unique; a place with no name by its element
  const used = new Set();
  for (const r of rows) {
    let id = slug(r.osm.name) || ('osm-' + r.place.type + '-' + r.place.id);
    if (used.has(id)) { let n = 2; while (used.has(id + '-' + n)) n++; id = id + '-' + n; }
    used.add(id);
    r.id = id;
  }
  return rows;
}

// ── THE SKELETON (the schema of scripts/hotels/data/yqm.json) ────────────────
const EMPTY_MARK = () => ({ verified: false, source: '' });
function skeletonHotel(r) {
  return {
    id: r.id,
    name: '',
    area: r.area,
    resort: false,
    brand: '',
    group: '',
    independent: null,
    address: { street: '', town: '', province: '', postal_code: '', display: '' },
    phone: '',
    website: '',
    lat: r.place.lat,
    lng: r.place.lng,
    distance_km: { airport: r.d.airport, centre: r.d.centre },
    area_reason: areaReason(r.area, r.d),
    season: { year_round: null, open: null, verified: false, source: '', note: 'Not checked yet.' },
    shuttle: { mark: false, offered: null, verified: false, terms: null, source: '', also: [], evidence: '', checked: '' },
    logo: null,
    logo_missing: 'Not checked yet: a logo only from the official site of the chain or the hotel, otherwise the name alone.',
    listed: false,
    not_listed_reason: KINDS[r.place.tourism].status === 'flagged'
      ? 'Not checked yet, and not a hotel (OpenStreetMap tourism=' + r.place.tourism + '): off unless picked.'
      : 'Not checked yet: every fact still to be copied from a named official page.',
    verified: {
      name: EMPTY_MARK(),
      street: EMPTY_MARK(),
      postal_code: EMPTY_MARK(),
      phone: EMPTY_MARK(),
      website: EMPTY_MARK(),
      latlng: { verified: false, source: r.place.url, note: 'OpenStreetMap position (candidate), for the straight-line area distances: confirm the place on an official page.' },
      season: EMPTY_MARK(),
      shuttle: EMPTY_MARK()
    },
    osm: r.place.url,
    notes: '',
    osm_candidate: r.osm
  };
}
// A place left out, as the excluded list of yqm.json has them (its name and address are what
// OpenStreetMap says: not checked, and never shown).
function skeletonExcluded(r) {
  const out = { name: r.osm.name || '(no name in OpenStreetMap)' };
  const addr = [r.osm.housenumber, r.osm.street].filter(Boolean).join(' ');
  if (addr) out.address = addr + (r.osm.town ? ', ' + r.osm.town : '');
  out.kind = r.kind;
  out.reason = r.reason;
  out.source = r.place.url;
  if (r.place.also && r.place.also.length) out.also = r.place.also;
  return out;
}
function skeleton(iata, points, rows, model, made) {
  const code = String(iata).toUpperCase(), low = code.toLowerCase();
  const date = made || new Date().toISOString().slice(0, 10);
  const centreSrc = points.centre.source;
  const unverified = [
    'SKELETON made by scripts/hotels/find-candidates.js on ' + date + ' from OpenStreetMap (' + CREDIT + '): no fact below is checked yet. Copy each fact from a named official page (the hotel\'s own page, its brand property page, the airport\'s own page, or the official city or provincial tourism site), set its verified mark, source and checked date, then delete this line and the osm_candidate of each hotel.',
    'An AI model is never the source of a hotel, an address or a telephone. A page that answers 403, a robot block or a captcha: record "blocked, needs a person" in the note and leave the field unverified; never read it another way.',
    'Destination resorts beyond ' + CARD.RULE.nearbyKm + ' km are not searched: a person picks them, with the drive from the airport (see the resort of yqm.json).'
  ];
  if (/--centre/.test(centreSrc)) unverified.push('The centre point was given on the command line: name where it comes from in points.centre.source.');
  return {
    schema: model.schema,
    iata: code,
    city: points.centre.name || '',
    province: '',
    built: '',
    about: model.about,
    runtime: String(model.runtime).split('yqm.json').join(low + '.json'),
    rules: JSON.parse(JSON.stringify(model.rules)),
    points: {
      airport: { lat: points.airport.lat, lng: points.airport.lng, source: points.airport.source },
      centre: { lat: points.centre.lat, lng: points.centre.lng, source: centreSrc }
    },
    foot_marks: [],
    notes: {
      verified_definition: 'verified true = copied from a named official page (the hotel\'s own site, its brand property page, the airport\'s own page, or the official city or provincial tourism site), with that page as source and the date it was read. OpenStreetMap values (osm_candidate) are candidates only and never verified on their own. verified false = not checked, one weaker source, or sources that disagree: the note says which.',
      postal_note: '',
      shuttle_note: 'shuttle.mark true only where the shuttle is verified on the hotel\'s or the airport\'s own page (rules.shuttle), quoted in evidence. Not known: offered null, mark false.',
      season_note: 'season.year_round true only where a page says year round or the hotel is a year-round city hotel with no closure stated (season.verified false then); a seasonal hotel has season.open ranges (MM-DD to MM-DD) from its own page or the official tourism listing.',
      sources: [
        'OpenStreetMap via the Overpass API (ODbL): credit "' + CREDIT + '". Candidates only (scripts/hotels/find-candidates.js, ' + date + '): names, positions and tags to check, never a published fact on their own.'
      ]
    },
    excluded: rows.filter((r) => r.status !== 'candidate').map(skeletonExcluded),
    unverified,
    hotels: rows.filter((r) => r.status === 'candidate').map(skeletonHotel)
  };
}

// ── THE WORKSHEET ───────────────────────────────────────────────────────────
const SHEET = [
  ['status', (r) => r.status], ['skeleton_id', (r) => (r.status === 'candidate' ? r.id : '')], ['area', (r) => r.area || '-'],
  ['km_airport', (r) => r.d.airport.toFixed(1)], ['km_centre', (r) => r.d.centre.toFixed(1)],
  ['osm_name', (r) => r.osm.name], ['osm_tourism', (r) => r.osm.tourism],
  ['brand', (r) => r.osm.brand], ['group', (r) => r.osm.group], ['brand_from', (r) => r.osm.brand_from], ['brand_wikidata', (r) => r.osm.brand_wikidata],
  ['osm_housenumber', (r) => r.osm.housenumber], ['osm_street', (r) => r.osm.street], ['osm_town', (r) => r.osm.town], ['osm_postcode', (r) => r.osm.postal_code],
  ['osm_phone', (r) => r.osm.phone], ['osm_website', (r) => r.osm.website],
  ['lat', (r) => String(r.place.lat)], ['lng', (r) => String(r.place.lng)],
  ['osm_url', (r) => r.place.url], ['osm_also', (r) => (r.place.also || []).join(' ')],
  ['area_reason', (r) => areaReason(r.area, r.d)], ['why_off', (r) => (r.status === 'candidate' ? '' : r.reason)],
  // for the person who checks: every fact from a named official page, with its address and date
  ['checked_name', () => ''], ['checked_street', () => ''], ['checked_town', () => ''], ['checked_postal_code', () => ''],
  ['checked_phone', () => ''], ['checked_website', () => ''], ['checked_season', () => ''], ['checked_shuttle', () => ''],
  ['source_url', () => ''], ['source_kind (hotel/brand/airport/tourism)', () => ''], ['checked_date', () => ''],
  ['decision (list/hold/off)', () => ''], ['notes (blocked, needs a person; disagreements)', () => '']
];
// A cell that begins with = + - @ (or a tab or carriage return) would open as a formula in a
// spreadsheet: OpenStreetMap text is written by anyone, and its telephones begin with +. Such a
// cell is written with a leading apostrophe, so it opens as the text it is. A plain number (a
// longitude west of Greenwich, -63.5752) stays a number.
function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function worksheetCsv(rows) {
  const lines = [SHEET.map((c) => csvCell(c[0])).join(',')];
  for (const r of rows) lines.push(SHEET.map((c) => csvCell(c[1](r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

// ── ASKING OPENSTREETMAP ────────────────────────────────────────────────────
async function askOverpass(query) {
  let res, text;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(150000)
    });
    text = await res.text();
  } catch (e) {
    return { ok: false, why: 'no answer from the Overpass API (' + (e && e.message || e) + '): try again later.' };
  }
  if (res.status === 403) return { ok: false, why: 'HTTP 403 from the Overpass API: blocked, needs a person. No other route is tried.' };
  if (res.status === 429 || res.status === 504) return { ok: false, why: 'HTTP ' + res.status + ' (the Overpass API is busy): try again later. No other endpoint is tried.' };
  if (res.status !== 200) return { ok: false, why: 'HTTP ' + res.status + ' from the Overpass API: nothing cached.' };
  let json;
  try { json = JSON.parse(text); } catch (e) { return { ok: false, why: 'the Overpass API did not answer JSON (perhaps a block page): blocked, needs a person.' }; }
  if (!Array.isArray(json.elements)) return { ok: false, why: 'the answer has no elements: nothing cached.' };
  if (json.remark && /error|timed out|timeout/i.test(json.remark)) return { ok: false, why: 'the Overpass API stopped early (' + json.remark + '): nothing cached; try again later.' };
  return { ok: true, text, json };
}

function usage() {
  return [
    'usage: node scripts/hotels/find-candidates.js <IATA> [--refresh] [--include-flagged] [--centre LAT,LNG]',
    '  <IATA>             the city by its airport code (fids-current/js/airport-coords.js)',
    '  --refresh          ask OpenStreetMap again instead of reading the cached answer',
    '  --include-flagged  guest houses and apartments in the skeleton too (held back)',
    '  --centre LAT,LNG   the centre point, for a city with no DOWNTOWN_COORDS entry (name its source)',
    'Writes scripts/hotels/work/<iata>-overpass.json, -overpass.query.txt, -worksheet.csv and -skeleton.json.'
  ].join('\n');
}
function parseArgs(argv) {
  const o = { iata: '', refresh: false, includeFlagged: false, centre: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--refresh') o.refresh = true;
    else if (a === '--include-flagged') o.includeFlagged = true;
    else if (a === '--centre' || a === '--center') {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(argv[++i] || ''));
      if (!m) throw new Error('--centre wants LAT,LNG');
      o.centre = { lat: Number(m[1]), lng: Number(m[2]) };
    } else if (a === '-h' || a === '--help') o.help = true;
    else if (/^[A-Za-z0-9]{3}$/.test(a) && !o.iata) o.iata = a.toUpperCase();
    else throw new Error('not understood: ' + a);
  }
  return o;
}
function pointsFor(iata, centreArg) {
  const ap = airportPoint(iata);
  if (!ap) throw new Error(iata + ' has no entry in fids-current/js/airport-coords.js');
  const board = centrePoint(iata);
  let centre;
  if (centreArg) centre = { lat: centreArg.lat, lng: centreArg.lng, name: board ? board.name : '', source: 'given on the command line (--centre); name where it comes from' };
  else if (board) centre = { lat: board.lat, lng: board.lng, name: board.name, source: 'DOWNTOWN_COORDS.' + iata + ' in fids-current/js/fids-core.js' };
  else throw new Error(iata + ' has no DOWNTOWN_COORDS entry in fids-core.js: give the centre with --centre LAT,LNG (a named point, such as the city hall in OpenStreetMap, as Charlottetown has)');
  return { airport: { lat: ap.lat, lng: ap.lng, source: 'fids-current/js/airport-coords.js (' + iata + ')' }, centre };
}

async function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message + '\n' + usage()); return 1; }
  if (o.help || !o.iata) { console.log(usage()); return o.help ? 0 : 1; }
  let points;
  try { points = pointsFor(o.iata, o.centre); } catch (e) { console.error(e.message); return 1; }
  const low = o.iata.toLowerCase();
  const file = (s) => path.join(WORK_DIR, low + s);
  const query = overpassQuery(points);
  fs.mkdirSync(WORK_DIR, { recursive: true });
  let answer;
  const cached = fs.existsSync(file('-overpass.json')) && fs.existsSync(file('-overpass.query.txt'));
  if (cached && !o.refresh) {
    const was = fs.readFileSync(file('-overpass.query.txt'), 'utf8').split('\n').find((l) => l.startsWith('[out:json]')) || '';
    if (was !== query) { console.error('The cached answer (' + path.relative(ROOT, file('-overpass.json')) + ') belongs to another query: run again with --refresh.'); return 1; }
    answer = JSON.parse(fs.readFileSync(file('-overpass.json'), 'utf8'));
    console.log('Reading the cached answer: ' + path.relative(ROOT, file('-overpass.json')) + ' (--refresh asks again).');
  } else {
    console.log('Asking the Overpass API once (' + ENDPOINT + ') ...');
    const got = await askOverpass(query);
    if (!got.ok) { console.error(got.why); return 2; }
    fs.writeFileSync(file('-overpass.json'), got.text);
    fs.writeFileSync(file('-overpass.query.txt'), query + '\n# ' + ENDPOINT + '\n# fetched ' + new Date().toISOString() + '\n# ' + CREDIT + ', ODbL 1.0\n');
    answer = got.json;
  }
  const model = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
  const rows = classify(answer, points, { includeFlagged: o.includeFlagged });
  fs.writeFileSync(file('-worksheet.csv'), worksheetCsv(rows));
  fs.writeFileSync(file('-skeleton.json'), JSON.stringify(skeleton(o.iata, points, rows, model), null, 1) + '\n');
  const count = (f) => rows.filter(f).length;
  console.log(o.iata + ': ' + rows.length + ' places once each from ' + placesOf(answer).length + ' elements; '
    + CARD.AREAS.filter((a) => a !== 'resort').map((a) => a + ' ' + count((r) => r.status === 'candidate' && r.area === a)).join(', ')
    + '; flagged ' + count((r) => r.status === 'flagged') + ', off ' + count((r) => r.status === 'excluded') + '.');
  console.log('Wrote ' + path.relative(ROOT, file('-worksheet.csv')) + ' and ' + path.relative(ROOT, file('-skeleton.json')) + '.');
  console.log('');
  for (const l of CREDIT_LINES) console.log(l);
  console.log('');
  console.log('Next: check every fact on a named official page (scripts/hotels/README.md), fill the skeleton,');
  console.log('move it to scripts/hotels/data/' + low + '.json, add ' + o.iata + ' to HotelListCard.CITIES, run node scripts/hotels/build-runtime.js.');
  return 0;
}

module.exports = {
  ENDPOINT, USER_AGENT, CREDIT, CREDIT_LINES, KINDS, BRAND_GROUPS,
  airportPoint, centrePoint, centreTable, pointsFor, radiusKm, overpassQuery,
  norm, slug, distances, areaFor, areaReason, brandOf, placesOf, samePlace, dedupe, osmCandidate, classify,
  skeleton, skeletonHotel, worksheetCsv, csvCell, parseArgs, askOverpass
};

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    console.error('The helper stopped: ' + (e && e.message || e) + ' (try again later).');
    process.exitCode = 1;
  });
}
