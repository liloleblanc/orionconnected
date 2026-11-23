#!/usr/bin/env node
'use strict';
// THE HOTEL LISTS: THE RUNTIME FILES
//
// The checked list of a city is scripts/hotels/data/<code>.json: every hotel with its facts,
// where each one was read and whether it was verified, the places left out and the open
// questions. A gate (js/hotel-list-card.js) and the phone app (app.html) read only a few of
// those fields, and every gate with a flight to that city fetches the file, so the site
// serves a slim copy made from the checked one:
//
//   fids-current/data/hotels/<code>.json   the hotels that are listed, each with its id, name,
//                                          area, address line, telephone, website, season,
//                                          shuttle mark, drive (a resort) and logo; the marks
//                                          of the foot. A hub city (HotelListCard.HUBS) also
//                                          has its hub block (the province, and the way to
//                                          each area: kind, mark, line, stop, minutes), the
//                                          street of each hotel, and card: true on its card
//                                          hotels; no other city has any of the three
//
//   node scripts/hotels/build-runtime.js            writes the slim files
//   node scripts/hotels/build-runtime.js --check    writes nothing; exit 1 when one differs
//
// Edit the checked file, never the slim one, then run this. tests/hotel-list-cards.test.js
// holds the two to agree (the same bytes as this script writes, and the same cards).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC_DIR = path.join(__dirname, 'data');
const OUT_DIR = path.join(ROOT, 'fids-current', 'data', 'hotels');
// The cities: the one list, HotelListCard.CITIES in fids-current/js/hotel-list-card.js (the
// gate and the phone app read the same one). Adding a city is one entry there.
const CITIES = require(path.join(ROOT, 'fids-current', 'js', 'hotel-list-card.js')).CITIES.map((c) => String(c).toLowerCase());
// The hub cities (two pages, near the airport and downtown): HotelListCard.HUBS, from the same
// module, with the two areas of their pages, the ways to get there and the marks the pages have.
const CARD = require(path.join(ROOT, 'fids-current', 'js', 'hotel-list-card.js'));
const HUBS = require(path.join(ROOT, 'fids-current', 'js', 'hotel-list-card.js')).HUBS.map((c) => String(c).toLowerCase());

// A checked file whose city is not in the list, or a city of the list with no checked file:
// both are a city half added.
function listProblems() {
  const files = fs.readdirSync(SRC_DIR).filter((f) => /^[a-z0-9]{3}\.json$/.test(f)).map((f) => f.slice(0, 3));
  const out = [];
  for (const f of files) if (!CITIES.includes(f)) out.push('scripts/hotels/data/' + f + '.json has no entry in HotelListCard.CITIES (fids-current/js/hotel-list-card.js): add ' + f.toUpperCase() + ' there');
  for (const c of CITIES) if (!files.includes(c)) out.push(c.toUpperCase() + ' is in HotelListCard.CITIES but scripts/hotels/data/' + c + '.json does not exist');
  return out;
}

// A hub city's checked file, and every other city's: what the pages of a hub need, and nothing of
// it anywhere else.
//   a hub city: its hub block, with its province and, for each of the two areas, the way there
//     (a kind the pages have words for, a mark they have, the line; a ride's stop, minutes and
//     interval), verified with its source; hotels in the two areas only, each listed one with its
//     street; a card hotel with its logo, its street and telephone verified, and its id in the
//     catalog it was checked against (card_id)
//   any other city: no hub block, and no card hotel
function hubProblems(doc) {
  const code = String(doc && doc.iata || '').toLowerCase();
  const at = 'scripts/hotels/data/' + code + '.json';
  const out = [];
  if (!HUBS.includes(code)) {
    if (doc.hub != null) out.push(at + ' has a hub block, but ' + code.toUpperCase() + ' is not in HotelListCard.HUBS (fids-current/js/hotel-list-card.js)');
    for (const h of doc.hotels || []) if (h.card === true) out.push(at + ' ' + h.id + ': a card hotel outside a hub city');
    return out;
  }
  const hub = doc.hub;
  if (!hub || typeof hub !== 'object') return [at + ': ' + code.toUpperCase() + ' is in HotelListCard.HUBS, so its file needs a hub block (its province and the way to each area)'];
  if (!hub.region || typeof hub.region !== 'string') out.push(at + ': hub.region (the province)');
  for (const a of CARD.HUB_AREAS) {
    const t = hub.areas && hub.areas[a] && hub.areas[a].transit;
    const w = at + ' hub.areas.' + a + '.transit';
    if (!t || typeof t !== 'object') { out.push(w + ': the way to the area'); continue; }
    if (!Object.prototype.hasOwnProperty.call(CARD.TRANSIT, t.kind)) out.push(w + '.kind ' + t.kind + ': one of ' + Object.keys(CARD.TRANSIT).join(', '));
    if (!Object.prototype.hasOwnProperty.call(CARD.ICON, t.icon)) out.push(w + '.icon ' + t.icon + ': a mark of HotelListCard.ICON');
    if (!t.line || typeof t.line !== 'string') out.push(w + '.line');
    if (t.kind === 'ride' && !(t.stop && Number(t.min) > 0 && Number(t.every) > 0)) out.push(w + ': a ride names its stop, its minutes and how often it leaves');
    if (t.verified !== true || !t.source) out.push(w + ': verified, with its source');
  }
  for (const h of doc.hotels || []) {
    const w = at + ' ' + h.id;
    if (!CARD.HUB_AREAS.includes(h.area)) out.push(w + ': area ' + h.area + ' is not one of the pages of a hub city (' + CARD.HUB_AREAS.join(', ') + ')');
    if (h.listed !== false && !(h.address && h.address.street)) out.push(w + ': its street (a hub line shows it)');
    if (h.card === true) {
      if (!(h.logo && h.logo.file)) out.push(w + ': a card hotel has its logo');
      for (const f of ['street', 'phone']) if (!(h.verified && h.verified[f] && h.verified[f].verified === true && h.verified[f].source)) out.push(w + ': a card hotel has its ' + f + ' verified, with its source');
      if (!h.card_id) out.push(w + ': a card hotel names its id in the catalog it was checked against (card_id)');
    }
  }
  return out;
}

// One hotel, with only what the cards and the app read (a hub city: its street, and card: true on
// a card hotel).
function slimHotel(h, doc) {
  const hub = !!(doc && doc.hub);
  const out = {
    id: h.id,
    name: h.name,
    area: h.area,
    address: hub ? { display: h.address.display, street: h.address.street } : { display: h.address.display },
    phone: h.phone
  };
  if (h.website) out.website = h.website;
  const s = h.season || {};
  out.season = s.year_round === true
    ? { year_round: true }
    : { year_round: false, open: (Array.isArray(s.open) ? s.open : []).map((r) => ({ from: r.from, to: r.to })) };
  out.shuttle = { mark: !!(h.shuttle && h.shuttle.mark === true) };
  if (h.drive && h.drive.km) {
    out.drive = { km: h.drive.km };
    if (h.drive.credit) out.drive.credit = h.drive.credit;
  }
  if (h.logo && h.logo.file) {
    out.logo = { file: h.logo.file };
    if (h.logo.trim) out.logo.trim = h.logo.trim;
    if (h.logo.opaque) out.logo.opaque = true;
    if (h.logo.fill) out.logo.fill = true;
  }
  if (h.card === true) out.card = true;
  return out;
}

// The hub block of a hub city, with only what its pages read: the province, and the way to each
// area (no source, no evidence, no note: those stay in the checked file).
function slimHub(hub) {
  const areas = {};
  for (const [a, v] of Object.entries(hub.areas || {})) {
    const t = (v && v.transit) || {};
    const o = { kind: t.kind, icon: t.icon, line: t.line };
    if (t.stop) o.stop = t.stop;
    if (Number(t.min) > 0) o.min = Number(t.min);
    if (Number(t.every) > 0) o.every = Number(t.every);
    areas[a] = { transit: o };
  }
  return { region: hub.region, areas };
}

// The slim list of a city: a hotel held back (listed false) is left out altogether.
function slim(doc) {
  const out = {
    schema: doc.schema,
    iata: doc.iata,
    built: doc.built,
    made_from: 'scripts/hotels/data/' + String(doc.iata).toLowerCase() + '.json (scripts/hotels/build-runtime.js)',
    foot_marks: (doc.foot_marks || []).map((m) => ({ file: m.file, name: m.name }))
  };
  if (doc.hub) out.hub = slimHub(doc.hub);
  out.hotels = (doc.hotels || []).filter((h) => h.listed !== false).map((h) => slimHotel(h, doc));
  return out;
}

// The text of the file: one hotel a line, so a change reads as a change of that hotel.
function render(doc) {
  const s = slim(doc);
  const head = JSON.stringify(Object.assign({}, s, { hotels: [] }));
  return head.slice(0, -'[]}'.length) + '[\n' + s.hotels.map((h) => JSON.stringify(h)).join(',\n') + '\n]}\n';
}

function sourcePath(code) { return path.join(SRC_DIR, code + '.json'); }
function outPath(code) { return path.join(OUT_DIR, code + '.json'); }

function main(argv) {
  const check = argv.includes('--check');
  const half = listProblems();
  for (const p of half) console.error(p);
  if (half.length) return 1;
  let bad = 0;
  for (const code of CITIES) {
    const doc = JSON.parse(fs.readFileSync(sourcePath(code), 'utf8'));
    const hubBad = hubProblems(doc);
    for (const p of hubBad) console.error(p);
    if (hubBad.length) { bad++; continue; }
    const text = render(doc);
    const out = outPath(code);
    const now = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    if (check) {
      if (now !== text) { bad++; console.error(path.relative(ROOT, out) + ' differs from ' + path.relative(ROOT, sourcePath(code)) + ': run node scripts/hotels/build-runtime.js'); }
      continue;
    }
    if (now !== text) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(out, text);
    }
    console.log(path.relative(ROOT, out) + '  ' + Buffer.byteLength(text) + ' bytes');
  }
  return bad ? 1 : 0;
}

module.exports = { CITIES, HUBS, slim, slimHotel, slimHub, render, sourcePath, outPath, listProblems, hubProblems };

if (require.main === module) process.exit(main(process.argv.slice(2)));
