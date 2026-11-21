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
//                                          of the foot
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

// A checked file whose city is not in the list, or a city of the list with no checked file:
// both are a city half added.
function listProblems() {
  const files = fs.readdirSync(SRC_DIR).filter((f) => /^[a-z0-9]{3}\.json$/.test(f)).map((f) => f.slice(0, 3));
  const out = [];
  for (const f of files) if (!CITIES.includes(f)) out.push('scripts/hotels/data/' + f + '.json has no entry in HotelListCard.CITIES (fids-current/js/hotel-list-card.js): add ' + f.toUpperCase() + ' there');
  for (const c of CITIES) if (!files.includes(c)) out.push(c.toUpperCase() + ' is in HotelListCard.CITIES but scripts/hotels/data/' + c + '.json does not exist');
  return out;
}

// One hotel, with only what the cards and the app read.
function slimHotel(h) {
  const out = {
    id: h.id,
    name: h.name,
    area: h.area,
    address: { display: h.address.display },
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
  return out;
}

// The slim list of a city: a hotel held back (listed false) is left out altogether.
function slim(doc) {
  return {
    schema: doc.schema,
    iata: doc.iata,
    built: doc.built,
    made_from: 'scripts/hotels/data/' + String(doc.iata).toLowerCase() + '.json (scripts/hotels/build-runtime.js)',
    foot_marks: (doc.foot_marks || []).map((m) => ({ file: m.file, name: m.name })),
    hotels: (doc.hotels || []).filter((h) => h.listed !== false).map(slimHotel)
  };
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
    const text = render(JSON.parse(fs.readFileSync(sourcePath(code), 'utf8')));
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

module.exports = { CITIES, slim, slimHotel, render, sourcePath, outPath, listProblems };

if (require.main === module) process.exit(main(process.argv.slice(2)));
