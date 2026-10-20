'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — THE ZONES OF THE PLACES AP DOES NOT KNOW (js/fids-earth.js)
//
// The floor prints the time it is in each place it names: AP's zone first,
// then the floor's own list (ZONE_LIST), else no time. So every zone in the
// list must be one the browser knows, no code may be listed twice or under
// another zone than AP gives it, every listed place must be one the board can
// draw (it has coordinates), and the zones that are easy to get wrong where a
// line runs through a state or a province are pinned here.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const E = require(path.join(ROOT, 'fids-current', 'js', 'fids-earth.js'));
const MOD = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-earth.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
function literal(marker) {
  const at = CORE.indexOf(marker);
  assert.ok(at >= 0, 'fids-core.js no longer declares ' + marker);
  let i = CORE.indexOf('{', at), d = 0, j = i;
  for (; j < CORE.length; j++) { if (CORE[j] === '{') d++; else if (CORE[j] === '}' && --d === 0) break; }
  return Function('return ' + CORE.slice(i, j + 1))();
}
const AP = literal('const AP = {');
const COORDS = literal('const COORDS = {');
const GATE_AP = literal('var GATE_AP={');
global.window = global.window || {};
require(path.join(ROOT, 'fids-current', 'js', 'airport-coords.js'));
const AIRPORT_COORDS = global.window.AIRPORT_COORDS;

test('every zone in the floor list is one the browser knows, each code once', () => {
  const list = /var ZONE_LIST = \{([\s\S]*?)\n {2}\};/.exec(MOD);
  assert.ok(list, 'fids-earth.js declares ZONE_LIST');
  const seen = {};
  let n = 0;
  for (const m of list[1].matchAll(/'([A-Za-z_/-]+)': ((?:'[A-Z0-9 ]*'(?: \+\s*)?)+)/g)) {
    const zone = m[1];
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0), zone);
    const codes = m[2].replace(/'|\+|\s+/g, ' ').trim().split(/\s+/);
    for (const c of codes) {
      assert.match(c, /^[A-Z0-9]{3}$/, zone + ': ' + c);
      assert.ok(!seen[c], c + ' is listed under ' + seen[c] + ' and ' + zone);
      seen[c] = zone;
      n++;
    }
  }
  const one = /var ZONE_ONE = \{([^}]*)\};/.exec(MOD);
  assert.ok(one, 'fids-earth.js declares ZONE_ONE');
  for (const m of one[1].matchAll(/([A-Z0-9]{3}): '([A-Za-z_/-]+)'/g)) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: m[2] }).format(0), m[2]);
    assert.ok(!seen[m[1]], m[1] + ' is listed twice');
    seen[m[1]] = m[2];
    n++;
  }
  assert.equal(n, Object.keys(E.ZONES).length, 'the module reads every listed code');
  assert.ok(n >= 450, n + ' places');
});

test('no listed place disagrees with AP, and every one can be drawn', () => {
  for (const [c, z] of Object.entries(E.ZONES)) {
    if (AP[c] && AP[c].tz) assert.equal(AP[c].tz, z, c + ': AP says ' + AP[c].tz);
    assert.ok(COORDS[c] || AIRPORT_COORDS[c] || GATE_AP[c], c + ' has coordinates');
  }
});

test('AP comes first, then the list, then the table of every other place (v24070), then nothing', () => {
  assert.equal(E.zoneOf('YQM', 'America/Halifax'), 'America/Halifax');
  assert.equal(E.zoneOf('PER', null), 'Australia/Perth');
  assert.equal(E.zoneOf('ZZZ', null), null);
  // (js/earth-places.js, which the floor loads itself: tests/earth-places.test.js)
  assert.equal(E.zoneOf('ABJ', null, { ABJ: 'Africa/Abidjan' }), 'Africa/Abidjan');
  assert.equal(E.zoneOf('PER', null, { PER: 'Asia/Tokyo' }), 'Australia/Perth', 'the list before the table');
  assert.equal(E.zoneOf('YQM', 'America/Halifax', { YQM: 'Asia/Tokyo' }), 'America/Halifax', 'AP before both');
  assert.match(MOD, /function apTz\(c\) \{[^\n]*return zoneOf\(c, z, PLACES && PLACES\.zones\); \}/, 'the board reads AP, then the list, then the table');
});

test('the zones that are easy to get wrong', () => {
  const want = {
    // Indiana and Kentucky: the Central counties and the Eastern ones
    EVV: 'America/Chicago', OWB: 'America/Chicago', PAH: 'America/Chicago',
    SBN: 'America/Indiana/Indianapolis', LAF: 'America/Indiana/Indianapolis', FWA: 'America/Indiana/Indianapolis',
    SDF: 'America/Kentucky/Louisville', LEX: 'America/New_York',
    // Michigan's Upper Peninsula: Dickinson and Gogebic Central, the rest Eastern
    IMT: 'America/Menominee', IWD: 'America/Menominee', ESC: 'America/Detroit', MQT: 'America/Detroit', CMX: 'America/Detroit',
    // the Florida panhandle and Tennessee
    PNS: 'America/Chicago', VPS: 'America/Chicago', ECP: 'America/Chicago', TLH: 'America/New_York',
    CHA: 'America/New_York', TYS: 'America/New_York', MEM: 'America/Chicago',
    // the Mountain line
    ELP: 'America/Denver', RAP: 'America/Denver', BOI: 'America/Boise', LWS: 'America/Los_Angeles', EKO: 'America/Los_Angeles',
    TUS: 'America/Phoenix', YUM: 'America/Phoenix', GUP: 'America/Denver', IPL: 'America/Los_Angeles',
    // Canada
    YAG: 'America/Winnipeg', YQK: 'America/Winnipeg', YXL: 'America/Winnipeg', YXC: 'America/Edmonton',
    YXJ: 'America/Dawson_Creek', YPA: 'America/Regina', YGP: 'America/Toronto', FSP: 'America/Miquelon',
    // Australia and the Atlantic islands
    PER: 'Australia/Perth', AYQ: 'Australia/Darwin', ADL: 'Australia/Adelaide', OOL: 'Australia/Brisbane',
    BNK: 'Australia/Sydney', MQL: 'Australia/Melbourne', TFS: 'Atlantic/Canary', BDA: 'Atlantic/Bermuda',
    // v24067 — the overnight sweep's: Kansas and the Dakotas on each side of
    // the Mountain line, Arizona, the North's own clocks, Quebec's Lower North
    // Shore, Greenland, the Caribbean's own zones, and West Palm Beach's new code
    DDC: 'America/Chicago', LBL: 'America/Chicago', HYS: 'America/Chicago', PIR: 'America/Chicago',
    DIK: 'America/Denver', PRC: 'America/Phoenix', YYE: 'America/Fort_Nelson', YXY: 'America/Whitehorse',
    YCO: 'America/Cambridge_Bay', YYH: 'America/Cambridge_Bay', YVQ: 'America/Inuvik', YHR: 'America/Blanc-Sablon',
    YKL: 'America/Toronto', SFJ: 'America/Nuuk', CAP: 'America/Port-au-Prince', BON: 'America/Kralendijk',
    FNC: 'Atlantic/Madeira', FAE: 'Atlantic/Faroe', DJT: 'America/New_York',
    // third review: the French-first airports with a position and no zone.
    // Natashquan is Eastern: the IANA tz database puts Atlantic time east of
    // it ('See America/Puerto_Rico for east of Natashquan'); Chevery, east of
    // it, keeps Blanc-Sablon's (above)
    YKU: 'America/Toronto', YRI: 'America/Toronto', YMT: 'America/Toronto', YNA: 'America/Toronto'
  };
  assert.equal(E.ZONES.YMU, undefined, 'YMU is left with no zone on purpose (no time, not a guess)');
  for (const [c, z] of Object.entries(want)) assert.equal(E.ZONES[c], z, c);
});

test('Grande Prairie (YQU) is in Alberta in every coordinate table', () => {
  for (const t of [COORDS, GATE_AP, AIRPORT_COORDS]) {
    const v = t.YQU;
    assert.ok(v && Math.abs(v[0] - 55.18) < 0.05 && Math.abs(v[1] + 118.88) < 0.05, JSON.stringify(v));
  }
});
