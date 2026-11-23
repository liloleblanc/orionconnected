#!/usr/bin/env node
'use strict';
// THE HOTEL LISTS: A HUB CITY'S CARD HOTELS AGAINST THE ACCOR CATALOG
//
// An on-demand helper, run by a person at a desk for one hub city at a time (as
// find-candidates.js). Never a timer, never the worker, never a board: the gold look of a card
// hotel is decided from the checked file alone (card, card_id, card_brand), so a board never asks
// the catalog for it. This helper only tells a person what to check again. It asks the catalog
// (through the board's own proxy, the feed of the Accor pages) once for each point of the city,
// the airport and the centre, keeps the OPEN rows within the area of that point, and reports:
//
//   - the card hotels of the checked file that the catalog no longer lists (missing, or not OPEN)
//   - the hotels of the catalog in the two areas that the checked file lacks as card hotels (and,
//     where the name says so, the entry of the file it may be: a line that is not a card, an
//     excluded place)
//   - the differences of name, street and telephone between the two for each card hotel
//
//   node scripts/hotels/match-catalog.js YYZ                 ask, and print the report
//   node scripts/hotels/match-catalog.js YYZ --json          the same, as JSON
//   node scripts/hotels/match-catalog.js YYZ --save          also keep the two answers, as received,
//                                                            in scripts/hotels/work/ (not in git)
//   node scripts/hotels/match-catalog.js YYZ --from <file>   read saved answers instead of asking
//
// It writes nothing to scripts/hotels/data/ or to the site: a difference is settled by a person,
// on the hotel's own page (the brand property page), and recorded in the checked file with its
// source and date, as every fact is. The catalog never adds a hotel, removes one, or changes its
// area or its order. An answer of 403, a block page or anything that is not JSON stops the run:
// blocked, needs a person; no other route is tried.
//
// Area rule: the cards' own (HotelListCard.areaOf and HotelListCard.RULE): a row is in the
// airport area when it is within the airport limit of the airport point by the distance the
// catalog returns AND the cards' rule puts its position there; the same for downtown from the
// centre.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CARD = require(path.join(ROOT, 'fids-current', 'js', 'hotel-list-card.js'));
const DATA_DIR = path.join(__dirname, 'data');
const WORK_DIR = path.join(__dirname, 'work');
const ENDPOINT = 'https://fids-proxy.n-leblanc1984.workers.dev/accor/catalog/v1/hotels';
const USER_AGENT = 'hotel-catalog-check/1.0 (on-demand, two queries a city)';
// The point each area is asked from, and its limit (the cards' rule, with its tolerance).
const AREA_POINT = { airport: 'airport', downtown: 'centre' };
function limitKm(area) {
  const R = CARD.RULE;
  return (area === 'airport' ? R.airportKm : R.downtownKm) * R.tolerance;
}

// ── the facts of a catalog row ─────────────────────────────────────────────
// The catalog's own name without the booking-system prefixes it sometimes carries, as the Accor
// pages of the board clean it (cleanAccorName in fids-core.js): 'FX - ROTW Novotel...'.
function cleanName(name) {
  let n = String(name || ''), prev = '';
  while (prev !== n) {
    prev = n;
    n = n.replace(/^(Core|GDS|FX|ROTW|HTNG|MGT|OPS|REV|TST|DEV|STG)\s*[-–]?\s*/i, '');
    n = n.replace(/^Novo(?!tel)\s*[-–]?\s*/i, '');
  }
  return n.replace(/^-\s*/, '').replace(/\s{2,}/g, ' ').replace(/\bCntr\b/g, 'Centre').trim();
}
// A North American telephone in the form of the checked files, '(416) 367-8900', from the
// catalog's prefix and number, whatever their marks ('41/63678900' is 4163678900); '' when the
// prefix is another country's or the digits are not one such number.
function phoneOf(prefix, phone) {
  const digits = (s) => String(s == null ? '' : s).replace(/\D+/g, '');
  const d = digits(phone), p = digits(prefix);
  if (p && p !== '1') return '';
  let all = d;
  if (all.length === 11 && all[0] === '1') all = all.slice(1);
  if (!/^[2-9]\d{9}$/.test(all)) return '';
  return '(' + all.slice(0, 3) + ') ' + all.slice(3, 6) + '-' + all.slice(6);
}
// The street of a row, only when it has a figure in it (a street with no number is no address).
function streetOf(hotel) {
  const a = (hotel && hotel.localization && hotel.localization.address) || {};
  const s = String(a.street || a.line1 || a.streetAddress || '').replace(/\s+/g, ' ').trim();
  return /\d/.test(s) ? s : '';
}
function positionOf(hotel) {
  const l = (hotel && hotel.localization) || {};
  for (const c of [l.gps, l.coordinates]) {
    if (!c) continue;
    const lat = parseFloat(c.lat != null ? c.lat : c.latitude), lng = parseFloat(c.lng != null ? c.lng : c.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng };
  }
  return null;
}
// The distance of a row, in km: a number, or a string of one; null where the catalog gives none
// (Number(null) and Number('') are 0, which would read as a hotel at the point itself).
function distanceOf(d) {
  if (typeof d === 'number') return Number.isFinite(d) ? d : null;
  if (typeof d === 'string' && d.trim() && Number.isFinite(Number(d))) return Number(d);
  return null;
}
// The rows of one answer, each with the facts this helper compares.
function rowsOf(answer) {
  const list = (answer && Array.isArray(answer.results)) ? answer.results : [];
  return list.map((r) => {
    const h = (r && r.hotel) || r || {};
    const c = h.contact || {};
    return {
      id: String(h.id || ''),
      name: cleanName(h.name),
      brand: String(h.brand || ''),
      status: String(h.status || ''),
      position: positionOf(h),
      distance: distanceOf(r && r.distance),
      street: streetOf(h),
      phone: phoneOf(c.phonePrefix, c.phone)
    };
  }).filter((r) => r.id);
}

// ── the comparison ─────────────────────────────────────────────────────────
// A text without its accents, its case and its marks, to compare two spellings.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
// The words of a name that tell one hotel from another (not 'hotel', 'the', the city).
function nameWords(s, city) {
  const skip = new Set(['hotel', 'hotels', 'the', 'and', 'by', 'a', 'de', 'centre', 'center', 'suites', fold(city)]);
  return fold(s).split(' ').filter((w) => w.length > 1 && !skip.has(w));
}
// The same name: the same set of words, each word counted once ('Grand Grand Hotel' is 'Grand Hotel').
function sameName(a, b, city) {
  const x = new Set(nameWords(a, city)), y = new Set(nameWords(b, city));
  return x.size > 0 && x.size === y.size && [...x].every((w) => y.has(w));
}
// The queries of a hub city: one a point, the radius the area limit rounded up (the catalog's
// radius is loose; the rows are held to the limit again).
function queries(doc) {
  return CARD.HUB_AREAS.map((area) => {
    const point = AREA_POINT[area], p = doc.points[point];
    const radius = Math.ceil(limitKm(area));
    const url = ENDPOINT + '?latLng=' + p.lat + ',' + p.lng + '&radius=' + radius + '&range=0-49&sort=distance&language=en';
    return { area, point, lat: p.lat, lng: p.lng, radius, limit: limitKm(area), url };
  });
}
// The report for a hub city's checked file and the catalog's answers ({ airport: answer,
// centre: answer }, keyed by point).
function match(doc, answers) {
  const city = doc.city || doc.iata;
  const asked = queries(doc);
  const all = new Map();
  const inArea = [];
  const counts = {};
  for (const q of asked) {
    const rows = rowsOf(answers && answers[q.point]);
    let kept = 0;
    for (const r of rows) {
      if (!all.has(r.id)) all.set(r.id, r);
      const near = r.distance != null && r.distance <= q.limit;
      const ruled = r.position ? CARD.areaOf(r.position, doc.points) === q.area : false;
      if (r.status === 'OPEN' && near && ruled) {
        kept++;
        if (!inArea.some((x) => x.row.id === r.id)) inArea.push({ area: q.area, row: r });
      }
    }
    counts[q.point] = { rows: rows.length, kept };
  }
  const hotels = doc.hotels || [];
  const cardsOf = hotels.filter((h) => h.card === true);
  const ids = new Set(cardsOf.map((h) => String(h.card_id || '')));
  const cards = [], missing = [];
  for (const h of cardsOf) {
    const r = all.get(String(h.card_id || ''));
    const entry = { id: h.id, card_id: h.card_id || '', card_brand: h.card_brand || '', area: h.area, listed: h.listed !== false, differences: [] };
    if (!r) { missing.push(Object.assign(entry, { why: 'not in the catalog\'s answers' })); continue; }
    if (r.status !== 'OPEN') { missing.push(Object.assign(entry, { why: 'status ' + (r.status || 'none') })); continue; }
    const there = inArea.find((x) => x.row.id === r.id);
    if (!there) entry.differences.push({ field: 'area', data: h.area, catalog: 'outside the ' + h.area + ' area by its position or distance' });
    else if (there.area !== h.area) entry.differences.push({ field: 'area', data: h.area, catalog: there.area });
    if (h.card_brand && r.brand && h.card_brand !== r.brand) entry.differences.push({ field: 'brand', data: h.card_brand, catalog: r.brand });
    if (fold(r.name) !== fold(h.name)) entry.differences.push({ field: 'name', data: h.name, catalog: r.name });
    const street = (h.address && h.address.street) || '';
    if (!r.street) entry.differences.push({ field: 'street', data: street, catalog: '(none with a figure)' });
    else if (fold(r.street) !== fold(street)) entry.differences.push({ field: 'street', data: street, catalog: r.street });
    if (!r.phone) entry.differences.push({ field: 'phone', data: h.phone, catalog: '(not a North American number)' });
    else if (r.phone !== h.phone) entry.differences.push({ field: 'phone', data: h.phone, catalog: r.phone });
    cards.push(entry);
  }
  const lacks = [];
  for (const { area, row } of inArea) {
    if (ids.has(row.id)) continue;
    const line = hotels.find((h) => sameName(row.name, h.name, city));
    const out = (doc.excluded || []).find((e) => sameName(row.name, e.name || e.osm_name || '', city));
    lacks.push({
      area, card_id: row.id, brand: row.brand, name: row.name, km: row.distance, street: row.street, phone: row.phone,
      in_data: line ? (line.listed === false ? 'held back as ' : 'a line, not a card, as ') + line.id : out ? 'excluded as ' + (out.id || out.name) : ''
    });
  }
  return { city, iata: doc.iata, asked: asked.map((q) => ({ point: q.point, area: q.area, radius_km: q.radius, limit_km: Math.round(q.limit * 10) / 10, rows: (counts[q.point] || {}).rows || 0, kept: (counts[q.point] || {}).kept || 0, url: q.url })), cards, missing, lacks };
}

// ── the text of the report ─────────────────────────────────────────────────
function text(rep) {
  const out = [];
  out.push(rep.city + ' (' + rep.iata + '): the Accor catalog against the checked file');
  for (const a of rep.asked) out.push('  asked from the ' + a.point + ' (' + a.radius_km + ' km): ' + a.rows + ' rows, ' + a.kept + ' open in the ' + a.area + ' area (within ' + a.limit_km + ' km)');
  out.push('');
  out.push('Card hotels of the checked file (' + rep.cards.length + ' found open):');
  if (!rep.cards.length) out.push('  none');
  for (const c of rep.cards) {
    out.push('  ' + c.id + '  ' + c.card_id + ' ' + c.card_brand + '  ' + c.area + (c.differences.length ? '' : ': name, street and telephone agree'));
    for (const d of c.differences) out.push('    ' + d.field + ': data "' + d.data + '", catalog "' + d.catalog + '"');
  }
  out.push('');
  out.push('Card hotels the catalog no longer lists (' + rep.missing.length + '):');
  if (!rep.missing.length) out.push('  none');
  for (const m of rep.missing) out.push('  ' + m.id + '  ' + m.card_id + ': ' + m.why);
  out.push('');
  out.push('Catalog hotels in the two areas that the checked file lacks as card hotels (' + rep.lacks.length + '):');
  if (!rep.lacks.length) out.push('  none');
  for (const l of rep.lacks) {
    out.push('  ' + l.card_id + ' ' + l.brand + '  ' + l.name + '  (' + l.area + ', ' + (l.km == null ? '?' : l.km) + ' km)' + (l.in_data ? '  [' + l.in_data + ']' : ''));
    out.push('    ' + (l.street || '(no street with a figure)') + '  ' + (l.phone || '(no telephone)'));
  }
  out.push('');
  out.push('Nothing was written. A difference is settled on the hotel\'s own page and recorded in the checked file with its source and date.');
  return out.join('\n');
}

// ── the run ────────────────────────────────────────────────────────────────
async function ask(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  } catch (e) {
    return { ok: false, why: 'the proxy did not answer (' + e.message + ')' };
  }
  if (res.status === 403) return { ok: false, why: 'HTTP 403: blocked, needs a person. No other route is tried.' };
  if (!res.ok) return { ok: false, why: 'HTTP ' + res.status };
  const body = await res.text();
  try { return { ok: true, json: JSON.parse(body) }; } catch (e) { return { ok: false, why: 'the answer is not JSON (perhaps a block page): blocked, needs a person.' }; }
}

async function main(argv) {
  const code = String(argv.find((a) => /^[A-Za-z0-9]{3}$/.test(a)) || '').toUpperCase();
  if (!code) { console.error('usage: node scripts/hotels/match-catalog.js <hub city code> [--json] [--save] [--from <file>]'); return 2; }
  if (!CARD.HUBS.includes(code)) { console.error(code + ' is not a hub city (HotelListCard.HUBS: ' + CARD.HUBS.join(', ') + ')'); return 2; }
  const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, code.toLowerCase() + '.json'), 'utf8'));
  const fromAt = argv.indexOf('--from');
  let answers = {};
  if (fromAt >= 0) {
    answers = JSON.parse(fs.readFileSync(path.resolve(argv[fromAt + 1] || ''), 'utf8'));
  } else {
    for (const q of queries(doc)) {
      const got = await ask(q.url);
      if (!got.ok) { console.error(q.point + ': ' + got.why); return 1; }
      answers[q.point] = got.json;
    }
    if (argv.includes('--save')) {
      fs.mkdirSync(WORK_DIR, { recursive: true });
      const file = path.join(WORK_DIR, code.toLowerCase() + '-catalog.json');
      fs.writeFileSync(file, JSON.stringify(answers, null, 1) + '\n');
      console.error('the answers, as received: ' + path.relative(ROOT, file));
    }
  }
  const rep = match(doc, answers);
  console.log(argv.includes('--json') ? JSON.stringify(rep, null, 2) : text(rep));
  return 0;
}

module.exports = { ENDPOINT, cleanName, phoneOf, streetOf, positionOf, rowsOf, sameName, queries, match, text, limitKm };

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
