'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE AIRPORT TABLE'S TIME ZONES (AP in fids-core.js)
//
// The Earth floor prints the time it is in each place it names, from AP's
// tz only (no zone, no time). So every zone written there must be one the
// browser knows, and the 73 destinations added for the floor (plus Linate,
// Daxing and Belfast City, which had a name and no zone) must carry one.
// AP's names also feed the board's name-to-code lookup for rows that arrive
// without a code: no two airports may fold to one name, and no airport's
// name may fold to another code's city.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
function literal(marker, open, close) {
  const at = CORE.indexOf(marker);
  assert.ok(at >= 0, 'fids-core.js no longer declares ' + marker);
  let i = CORE.indexOf(open, at), d = 0, j = i;
  for (; j < CORE.length; j++) {
    if (CORE[j] === open) d++;
    else if (CORE[j] === close && --d === 0) break;
  }
  return CORE.slice(i, j + 1);
}
const AP = Function('return ' + literal('const AP = {', '{', '}'))();
const CITY = Function('return ' + literal('const CITY = {', '{', '}'))();
const COORDS = Function('return ' + literal('const COORDS = {', '{', '}'))();
const GATE_AP = Function('return ' + literal('var GATE_AP={', '{', '}'))();
global.window = global.window || {};
require(path.resolve(__dirname, '..', 'fids-current', 'js', 'airport-coords.js'));
const AIRPORT_COORDS = global.window.AIRPORT_COORDS;

// the board's own fold (the reverse lookup for rows with no code)
const fold = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’ʼ]/g, "'").replace(/\s+(INTERNATIONAL\s+|REGIONAL\s+)?AIRPORT$/, '').replace(/\s+/g, ' ').trim();

const FLOOR_PLACES = ('YYY YGR YPX YBG YVO YWK YAM YSB YXU YTS YQG CLE CVG CMH IND STL BNA SAT MEX GUA SAL SJO KIN POS PDL NTE CMN ALG TUN AMM ADD '
  + 'BNE CBR LST ABZ LDY DND GCI JER ORK SNN PRG GVA BSL DUS HAJ HAM BLL FLR BLQ SOF ZAG BUD LCA CAI LXR NBO KGL JNB CPT ABV LOS MCT '
  + 'BAH DMM ISB BLR CMB HAN CAN TAO TPE SCL BHD LIN PKX').split(' ');

test('every zone in AP is one the browser knows', () => {
  let n = 0;
  for (const [code, e] of Object.entries(AP)) {
    if (!e.tz) continue;
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: e.tz }).format(0), code + ' ' + e.tz);
    n++;
  }
  assert.ok(n > 250, n + ' zones');
});

test('the Earth floor places carry a name and a zone', () => {
  assert.equal(FLOOR_PLACES.length, 76);
  let placed = 0;
  for (const c of FLOOR_PLACES) {
    assert.ok(AP[c], c + ' is in AP');
    assert.ok(AP[c].name && AP[c].tz, c + ' has a name and a zone');
    // the floor reads coordinates where the board's sun does (COORDS, then
    // airport-coords.js, then GATE_AP); a place found in none is not drawn
    if (COORDS[c] || AIRPORT_COORDS[c] || GATE_AP[c]) placed++;
  }
  assert.ok(placed >= 70, placed + ' of them can be drawn');
  // a few zones that are easy to get wrong
  assert.equal(AP.YWK.tz, 'America/Goose_Bay');
  assert.equal(AP.YGR.tz, 'America/Halifax');
  assert.equal(AP.PDL.tz, 'Atlantic/Azores');
  assert.equal(AP.LST.tz, 'Australia/Hobart');
  assert.equal(AP.BNE.tz, 'Australia/Brisbane');
  assert.equal(AP.IND.tz, 'America/Indiana/Indianapolis');
});

test('no two airports fold to one name, and no airport folds to another code city', () => {
  const by = {};
  for (const [code, e] of Object.entries(AP)) {
    const f = fold(e.name);
    assert.ok(!by[f], `${code} and ${by[f]} both read as ${f}`);
    by[f] = code;
  }
  const city = {};
  for (const [code, v] of Object.entries(CITY)) (city[fold(v)] = city[fold(v)] || []).push(code);
  for (const [code, e] of Object.entries(AP)) {
    const hit = city[fold(e.name)];
    assert.ok(!hit || hit.includes(code), `${code} (${e.name}) reads as the city of ${hit}`);
  }
});
