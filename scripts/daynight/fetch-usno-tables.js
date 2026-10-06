#!/usr/bin/env node
'use strict';
// ━━ THE REFERENCE TABLES THE SUN ENGINE IS TESTED AGAINST (v24008) ━━━━━━━━━━
//
//   node scripts/daynight/fetch-usno-tables.js
//
// Writes tests/fixtures/sun-usno-2026.json: the U.S. Naval Observatory's
// published sunrise and sunset for every day of 2026, in Universal Time, for
// each airport below. The board computes the same times on the screen
// (fids-current/js/fids-sun.js); tests/day-night-engine.test.js holds it to
// these tables. This script is the only thing that touches the network, and it
// is run by hand when the fixture needs regenerating, never by the tests.
//
// Source: USNO Astronomical Applications Department, "Sun or Moon Rise/Set
// Table for One Year" (task 0 = the sun, tz 0 = Universal Time). USNO's sunrise
// and sunset are the moment the sun's upper limb meets the horizon, allowing
// 34' of refraction: the centre of the sun at -0°50', the same definition the
// engine uses. Times are rounded to the minute.
//
// The coordinates are read from COORDS in fids-core.js, the same table the
// engine resolves an airport from, so a difference is the arithmetic and not
// two different points on the map.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'sun-usno-2026.json');
const YEAR = 2026;

// The airports the accuracy test names, then two points above the Arctic
// circle for midnight sun and polar night.
const AIRPORTS = ['YQM', 'YHZ', 'YUL', 'YYZ', 'YVR', 'YYC', 'YOW', 'JFK', 'LAX', 'MIA', 'HNL', 'KEF', 'ZRH', 'DXB', 'SYD', 'HBA', 'LYR', 'YEV'];

function extract(src, marker, open, close) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('not found: ' + marker);
  let i = src.indexOf(open, at), d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === open) d++;
    else if (src[j] === close && --d === 0) break;
  }
  return src.slice(i, j + 1);
}

function usnoUrl(code, lat, lon) {
  return 'https://aa.usno.navy.mil/calculated/rstt/year?ID=AA&year=' + YEAR + '&task=0'
    + '&lat=' + lat + '&lon=' + lon + '&label=' + code + '&tz=0.00&tz_sign=1&submit=Get+Data';
}

// The table is fixed-width: the day in columns 0-1, then for each month a
// four-digit rise at 4 + 11m and a four-digit set at 9 + 11m. A day with a
// second rise or set repeats its day number on a line of its own with only
// that column filled. '****' is the sun above the horizon all day, '----'
// below it all day, blank is no such event on that date.
function parseTable(html) {
  const pre = html.slice(html.indexOf('<pre'), html.indexOf('</pre>'));
  const lines = pre.split('\n');
  const days = {};
  for (const line of lines) {
    if (!/^\d\d  /.test(line)) continue;
    const day = Number(line.slice(0, 2));
    for (let m = 0; m < 12; m++) {
      const rise = line.slice(4 + 11 * m, 8 + 11 * m).trim();
      const set = line.slice(9 + 11 * m, 13 + 11 * m).trim();
      if (!rise && !set) continue;
      const key = String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const cell = days[key] || (days[key] = { rise: [], set: [] });
      if (rise) cell.rise.push(rise);
      if (set) cell.set.push(set);
    }
  }
  // months["MM"][day - 1] = "rise[,rise] set[,set]" — compact, and still the
  // table's own text. A date the month does not have is null.
  const out = {};
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const row = [];
    for (let d = 1; d <= 31; d++) {
      const c = days[mm + '-' + String(d).padStart(2, '0')];
      row.push(c ? (c.rise.join(',') || '-') + ' ' + (c.set.join(',') || '-') : null);
    }
    while (row.length && row[row.length - 1] === null) row.pop();
    out[mm] = row;
  }
  return out;
}

// One line per month, so a diff of a regenerated table reads month by month.
// (Month keys "10"-"12" are array-index-like, so an object would list them
// first; the order is written out explicitly.)
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
function writeFixture(doc) {
  const points = doc.points;
  const lines = ['{'];
  for (const k of ['_source', '_fetched', '_script', '_format', 'year']) lines.push(' ' + JSON.stringify(k) + ': ' + JSON.stringify(doc[k]) + ',');
  lines.push(' "points": {');
  const codes = Object.keys(points);
  codes.forEach((code, ci) => {
    const p = points[code];
    lines.push('  ' + JSON.stringify(code) + ': {');
    lines.push('   "lat": ' + p.lat + ', "lon": ' + p.lon + ', "tz": ' + JSON.stringify(p.tz) + ',');
    lines.push('   "url": ' + JSON.stringify(p.url) + ',');
    lines.push('   "months": {');
    MONTHS.forEach((mm, mi) => lines.push('    ' + JSON.stringify(mm) + ': ' + JSON.stringify(p.months[mm]) + (mi < 11 ? ',' : '')));
    lines.push('   }');
    lines.push('  }' + (ci < codes.length - 1 ? ',' : ''));
  });
  lines.push(' }');
  lines.push('}');
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
}

async function main() {
  // --rewrite: re-lay the existing fixture in this format, no network.
  if (process.argv.includes('--rewrite')) { writeFixture(JSON.parse(fs.readFileSync(OUT, 'utf8'))); return; }
  const core = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
  const COORDS = Function('return ' + extract(core, 'const COORDS = {', '{', '}'))();
  const AP = Function('return ' + extract(core, 'const AP = {', '{', '}'))();
  const points = {};
  for (const code of AIRPORTS) {
    const c = COORDS[code];
    if (!c) throw new Error(code + ' has no COORDS entry');
    const url = usnoUrl(code, c[0], c[1]);
    const r = await fetch(url, { headers: { 'User-Agent': 'orionconnected-fids test fixture (sun engine)' } });
    if (!r.ok) throw new Error(code + ': USNO answered ' + r.status);
    const months = parseTable(await r.text());
    const n = Object.values(months).reduce((a, row) => a + row.filter(Boolean).length, 0);
    if (n !== 365) throw new Error(code + ': ' + n + ' days parsed, not 365');
    points[code] = { lat: c[0], lon: c[1], tz: (AP[code] && AP[code].tz) || null, url: url, months: months };
    process.stdout.write(code + ' ');
    await new Promise((res) => setTimeout(res, 1500));   // one table at a time, politely
  }
  const doc = {
    _source: 'U.S. Naval Observatory, Astronomical Applications Department: Sun or Moon Rise/Set Table for One Year (task 0, the sun), Universal Time. Sunrise/sunset = upper limb on the horizon with 34\' refraction (sun centre at -0 deg 50\'). Rounded to the minute. Each point\'s own table is at its url.',
    _fetched: new Date().toISOString().slice(0, 10),
    _script: 'scripts/daynight/fetch-usno-tables.js',
    _format: 'months["MM"][day - 1] = "<rise UT hhmm>[,<second rise>] <set UT hhmm>[,<second set>]"; "-" no such event on that UT date; "****" sun above the horizon all day; "----" below it all day.',
    year: YEAR,
    points: points
  };
  writeFixture(doc);
  process.stdout.write('\nwrote ' + path.relative(ROOT, OUT) + '\n');
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
