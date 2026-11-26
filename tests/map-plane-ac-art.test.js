'use strict';

// WHY THIS EXISTS
//
// v24182. The gate maps drew every aeroplane with one of five plain pictures,
// white on the light street map, so it read as see-through. Seven top views in
// Air Canada colours (supplied art: A320, A321, 737 MAX 8, A220-300, E175,
// CRJ900, Dash 8-400) now draw an aeroplane that wears those colours. The risk
// is the wrong colours on the wrong aeroplane: Rouge flies the A321 and the
// 737 MAX 8 under Air Canada numbers in its own colours, PAL flies Air Canada
// Express numbers, and a WestJet or United aeroplane of the same type must
// never be painted Air Canada. So the picture follows the operator ladder the
// boards already read (fidsResolveOperator, as _opCode on each row), any live
// callsign, and the number block of the type, on every row of the aeroplane.
// The pictures themselves are framed like the ones they stand in for, so in
// flight nothing changes size, and their spans are true to the real aircraft.
//
// Everything here is lifted from the real source, so it runs without a browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');

function fnSource(name) {
  const i = CORE.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return CORE.slice(i, j + 1);
}
function varTable(name) {
  const i = CORE.indexOf('var ' + name + ' = {');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return new Function('return (' + CORE.slice(CORE.indexOf('{', i), j + 1) + ')')();
}
const lift = (name, deps, vals) => new Function(...deps, 'return (' + fnSource(name) + ')')(...vals);

const toIata = lift('aircraftCodeToIata', [], []);
const DIMS = varTable('_MAP_PLANE_DIMS');
const ART = varTable('_MAP_PLANE_ART');
const UNKNOWN = varTable('_MAP_PLANE_UNKNOWN');
// the live callsign store: a row whose flight is listed here was seen by FR24 under that callsign
const SEEN = {};
const resolved = (row) => (row && SEEN[row.flight] ? { cd: '', nm: '', seen: { cs: SEEN[row.flight] } } : null);
const acArt = lift('_mapPlaneAcArt', ['_MAP_PLANE_ART', '_acResolvedGet'], [ART, resolved]);
const specFor = lift('_mapPlaneSpecFor', ['aircraftCodeToIata', '_MAP_PLANE_DIMS', '_MAP_PLANE_ART', '_MAP_PLANE_UNKNOWN', '_mapPlaneAcArt'],
  [toIata, DIMS, ART, UNKNOWN, acArt]);
const scale = lift('_mapPlaneScale', [], []);

const row = (flight, extra) => Object.assign({ airline: flight.replace(/\s+/g, '').slice(0, 2), flight }, extra || {});
const src = (type, rows) => specFor(type, rows).art.src;
const AC = (c) => '/logos/map-plane-ac-' + c + '.png';

test('mainline Air Canada types wear the colours on mainline numbers only', () => {
  // A320: AC 1-1599, and the A320 extras in AC 7000-7599
  assert.equal(src('A320', [row('AC306'), row('AC307')]), AC('320'));
  assert.equal(src('Airbus A320', [row('AC 7050')]), AC('320'));
  assert.equal(src('A320', [row('AC8803', { _opCode: 'QK' })]), '/logos/map-plane-jet.png', 'an operator on record is not mainline');
  // never on a Rouge number, whatever the type
  assert.equal(src('A320', [row('AC1700', { _opCode: 'RV' })]), '/logos/map-plane-jet.png');
});

test('the A220-300 block, read straight', () => {
  assert.equal(src('BCS3', [row('AC 345')]), AC('223'));
  assert.equal(src('A220-300', [row('AC1599')]), AC('223'));
  assert.equal(src('BCS3', [row('AC7050')]), '/logos/map-plane-jet.png', 'only the A320 has extras in AC 7000-7599');
  assert.equal(src('A220-100', [row('AC345')]), '/logos/map-plane-jet.png', 'no picture of the -100, which Air Canada does not fly');
});

test('Rouge flies the A321 and the 737 MAX 8 in its own colours: never painted Air Canada', () => {
  assert.equal(src('A321', [row('AC1986', { _opCode: 'RV' })]), '/logos/map-plane-jet.png');
  assert.equal(src('B38M', [row('AC1726', { _opCode: 'RV' })]), '/logos/map-plane-jet.png');
  // the Rouge sun flights, AC 2100-2299, carry no band and so no operator: the number alone keeps them plain
  assert.equal(src('B38M', [row('AC2124')]), '/logos/map-plane-jet.png');
  assert.equal(src('A321', [row('AC2246')]), '/logos/map-plane-jet.png');
  // a live Rouge callsign on a mainline number keeps it plain too
  assert.equal(src('B38M', [row('AC800', { _feedCs: 'ROU800' })]), '/logos/map-plane-jet.png');
  SEEN.AC845 = 'ROU845';
  assert.equal(src('A321', [row('AC845')]), '/logos/map-plane-jet.png', 'the callsign FR24 saw counts as much as the feed');
  delete SEEN.AC845;
  // mainline numbers, no other operator: Air Canada colours
  assert.equal(src('A321', [row('AC845')]), AC('321'));
  assert.equal(src('A21N', [row('AC850')]), AC('321'));
  assert.equal(src('B38M', [row('AC800'), row('AC801')]), AC('7m8'));
  assert.equal(src('Boeing 737 MAX 8', [row('AC 800', { _callSign: 'ACA800' })]), AC('7m8'));
});

test('Air Canada Express types wear the colours for Jazz and the Express brand, never for PAL', () => {
  assert.equal(src('CRJ9', [row('AC8803', { _opCode: 'QK' })]), AC('cr9'));
  assert.equal(src('E75L', [row('AC8902', { _opCode: 'QK' })]), AC('e75'));
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX' })]), AC('dh4'));
  assert.equal(src('DH8D', [row('AC7210')]), AC('dh4'), 'an Express number with no operator on record');
  assert.equal(src('DH8D', [row('AC8615', { _feedCs: 'JZA8615' })]), AC('dh4'), 'an Express number under a Jazz callsign');
  assert.equal(src('DH8D', [row('AC7680', { _opCode: 'PB' })]), '/logos/map-plane-dh4.svg', 'PAL flies its own colours');
  assert.equal(src('DH8D', [row('PB7203')]), '/logos/map-plane-dh4.svg');
  assert.equal(src('CRJ9', [row('AC403')]), '/logos/map-plane-crj.svg', 'a mainline number is not an Express flight');
  assert.equal(src('E75L', [row('AC8902', { _opCode: 'QK', _feedCs: 'SKW8902' })]), '/logos/map-plane-jet.png', 'another airline on the callsign');
});

test('other airlines and odd rows keep the plain pictures', () => {
  assert.equal(src('B38M', [row('WS501')]), '/logos/map-plane-jet.png');
  assert.equal(src('E75L', [row('UA5521')]), '/logos/map-plane-jet.png');
  assert.equal(src('A320', [{ airline: 'AC', flight: 'UA123' }]), '/logos/map-plane-jet.png', 'the number must be an Air Canada number');
  assert.equal(src('A320', [{ airline: 'AC' }]), '/logos/map-plane-jet.png', 'a row with no flight is not evidence');
  // every row of the aeroplane must agree
  assert.equal(src('A320', [row('AC306'), row('WS501')]), '/logos/map-plane-jet.png');
  assert.equal(src('A321', [row('AC845'), row('AC1987', { _opCode: 'RV' })]), '/logos/map-plane-jet.png');
  // no rows, or the old one-argument call: exactly the plain pictures
  assert.equal(src('A320', []), '/logos/map-plane-jet.png');
  assert.equal(specFor('A320').art.src, '/logos/map-plane-jet.png');
  assert.equal(specFor('DH8D').art.src, '/logos/map-plane-dh4.svg');
  assert.equal(specFor('CRJ9').art.src, '/logos/map-plane-crj.svg');
});

test('the same size in flight, the true size and shape on a stand', () => {
  // zoom 18: every one of them is drawn larger than its picture there, so at its real size
  const mpp18 = 156543.03392 * Math.cos(46.1156 * Math.PI / 180) / Math.pow(2, 18);
  const cases = [
    ['A320', [row('AC306')], 'ac320', 37.6, 34.1],
    ['A321', [row('AC845')], 'ac321', 44.5, 35.8],
    ['B38M', [row('AC800')], 'ac7m8', 39.5, 35.9],
    ['BCS3', [row('AC345')], 'ac223', 38.7, 35.1],
    ['E75L', [row('AC8902', { _opCode: 'QK' })], 'ace75', 31.7, 26.0],
    ['CRJ9', [row('AC8803', { _opCode: 'QK' })], 'accr9', 36.2, 24.9],
    ['DH8D', [row('AC7754', { _opCode: 'ACEX' })], 'acdh4', 32.8, 28.4]
  ];
  for (const [type, rows, key, len, span] of cases) {
    const s = specFor(type, rows);
    assert.equal(s.art, ART[key], type);
    assert.equal(s.len, len, type + ' length');
    assert.equal(s.span, span, type + ' span (the A320s of Air Canada have wingtip fences: 34.1 m)');
    // in flight: exactly as long as the plain picture of that type
    assert.equal(s.art.len, specFor(type).art.len, type + ' is as long as the picture it stands in for');
    // the picture is true to the aeroplane: on a stand it is barely stretched either way
    const k = scale(s, s.art, 46.1156, 18);
    assert.ok(Math.abs(k.kx / k.ky - 1) < 0.015, type + ' kx/ky ' + (k.kx / k.ky).toFixed(4));
    assert.ok(Math.abs(k.ky * s.art.len * mpp18 - len) < 0.05, type + ' drawn at its real length close in');
  }
});

test('the seven pictures are on disk, 512 px square PNGs with see-through ground', () => {
  for (const key of ['ac320', 'ac321', 'ac7m8', 'ac223', 'ace75', 'accr9', 'acdh4']) {
    const a = ART[key];
    assert.ok(a && /^\/logos\/map-plane-ac-[0-9a-z]+\.png$/.test(a.src), key);
    const buf = fs.readFileSync(path.join(root, 'fids-current', a.src));
    assert.equal(buf.slice(1, 4).toString('latin1'), 'PNG', key + ' is a PNG');
    assert.equal(buf.readUInt32BE(16), 512, key + ' width');
    assert.equal(buf.readUInt32BE(20), 512, key + ' height');
    assert.equal(buf[25], 6, key + ' is RGBA, so its ground is transparent');
    assert.ok(buf.length < 160000, key + ' stays light for the boards: ' + buf.length + ' bytes');
  }
});

test('both maps and the apron hand the rows of the aeroplane to the picker', () => {
  assert.match(fnSource('_mapPlaneSpec'), /var _rows = \[inb, cf\];[\s\S]*_mapPlaneSpecFor\(raw, _rows\)/);
  assert.match(fnSource('_gateApronSpec'), /var rows = \[a, b\];[\s\S]*_mapPlaneSpecFor\(raw, rows\)/);
});
