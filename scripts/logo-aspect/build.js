#!/usr/bin/env node
'use strict';
// Rewrites LOGO_ASPECT in fids-current/js/fids-core.js from the logo files
// (see aspect.js beside this file). Run it after adding, removing or re-cutting
// a lettering, banner, tile or emblem file, or after changing a table that names
// or builds one (IATA_TO_WORDMARK, LOCAL_LOGOS, IATA_TO_TILE_ICAO, IATA_TO_EMBLEM,
// _BW_EMBLEM, the banner tables of the gate, the heritage carriers, the Star
// Alliance lockups):
//   node scripts/logo-aspect/build.js          writes the table
//   node scripts/logo-aspect/build.js --check  exits 1 when the table is stale

const fs = require('node:fs');
const path = require('node:path');
const A = require('./aspect.js');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'fids-current');
const CORE = path.join(SITE, 'js', 'fids-core.js');

const src = fs.readFileSync(CORE, 'utf8');
const a = src.indexOf(A.START), b = src.indexOf(A.END);
if (a < 0 || b < a) { console.error('fids-core.js has no ' + A.START + ' ... ' + A.END + ' block'); process.exit(2); }
const table = A.build(SITE);
const next = src.slice(0, a) + A.render(table) + src.slice(b + A.END.length);
if (process.argv.includes('--check')) {
  if (next !== src) { console.error('LOGO_ASPECT is stale: run node scripts/logo-aspect/build.js'); process.exit(1); }
  console.log('LOGO_ASPECT matches the files (' + Object.keys(table).length + ')');
} else if (next !== src) {
  fs.writeFileSync(CORE, next);
  console.log('LOGO_ASPECT rewritten: ' + Object.keys(table).length + ' files');
} else {
  console.log('LOGO_ASPECT already matches the files (' + Object.keys(table).length + ')');
}
