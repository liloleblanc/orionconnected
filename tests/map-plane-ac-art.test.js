'use strict';

// WHY THIS EXISTS
//
// v24182. The gate maps drew every aeroplane with one of five plain pictures,
// white on the light street map, so it read as see-through. Seven top views in
// Air Canada colours (supplied art: A320, A321, 737 MAX 8, A220-300, E175,
// CRJ900, Dash 8-400) now draw an aeroplane that wears those colours. The risk
// is the wrong colours on the wrong aeroplane: Rouge flies the A320 and A321
// under Air Canada numbers in its own colours (v24183: not its 737 MAX 8s, which
// it paints as Air Canada does, so those share the picture), PAL flies its own
// Dash 8-400s for Air Canada Express (under the brand and under bare numbers),
// Toronto writes ACA for Rouge too, one A220 flies in Trans-Canada Air Lines
// colours, and a WestJet or United aeroplane of the same type must never be
// painted Air Canada. So the picture follows the operator ladder the boards
// already read (fidsResolveOperator, as _opCode on each row), every callsign on
// record, the special-livery table, and the number block of the type, on every
// row of the aeroplane. The pictures themselves are framed like the ones they
// stand in for, so in flight nothing changes size; their spans are true to the
// real aircraft; they stand upright; and their whites and greys are neutral.
//
// Everything here is lifted from the real source, so it runs without a browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

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
const LIVERY = varTable('AIRCRAFT_LIVERY_BY_REG');
const regKey = lift('_aircraftRegKey', [], []);
// the resolved store: a row whose flight is listed here was seen by FR24 (callsign, registration)
const SEEN = {};
const resolved = (row) => (row && SEEN[row.flight] ? { cd: '', nm: '', reg: SEEN[row.flight].reg || '', seen: SEEN[row.flight] } : null);
// the ladder for a row kept across a reload, which carries no _opCode (here: the bands by number)
const LADDER = { AC8612: 'QK', AC8611: 'QK', AC7754: 'ACEX', AC7753: 'ACEX', AC7680: 'PB', AC1729: 'RV' };
const opOf = (r) => LADDER[r.flight] || '';
const acArt = lift('_mapPlaneAcArt', ['_MAP_PLANE_ART', '_acResolvedGet', 'AIRCRAFT_LIVERY_BY_REG', '_aircraftRegKey', '_gateOpOf'], [ART, resolved, LIVERY, regKey, opOf]);
const specFor = lift('_mapPlaneSpecFor', ['aircraftCodeToIata', '_MAP_PLANE_DIMS', '_MAP_PLANE_ART', '_MAP_PLANE_UNKNOWN', '_mapPlaneAcArt'],
  [toIata, DIMS, ART, UNKNOWN, acArt]);
const scale = lift('_mapPlaneScale', [], []);

const row = (flight, extra) => Object.assign({ airline: flight.replace(/\s+/g, '').slice(0, 2), flight }, extra || {});
const src = (type, rows) => specFor(type, rows).art.src;
const AC = (c) => '/logos/map-plane-ac-' + c + '.png';
const JET = '/logos/map-plane-jet.png', DH4 = '/logos/map-plane-dh4.svg', CRJ = '/logos/map-plane-crj.svg';

test('mainline Air Canada types wear the colours on mainline numbers only', () => {
  // A320: AC 1-1599, and the A320 extras in AC 7000-7599
  assert.equal(src('A320', [row('AC306'), row('AC307')]), AC('320'));
  assert.equal(src('Airbus A320', [row('AC 7050')]), AC('320'));
  assert.equal(src('A320', [row('AC8803', { _opCode: 'QK' })]), JET, 'an operator on record is not mainline');
  assert.equal(src('A320', [row('AC1700', { _opCode: 'RV' })]), JET, 'never on a Rouge number');
  assert.equal(src('A320', [row('AC306', { _feedCs: 'JZA306' })]), JET, 'a Jazz callsign is not mainline');
});

test('the A220-300 block, read straight', () => {
  assert.equal(src('BCS3', [row('AC 345')]), AC('223'));
  assert.equal(src('A220-300', [row('AC1599')]), AC('223'));
  assert.equal(src('BCS3', [row('AC7050')]), JET, 'only the A320 has extras in AC 7000-7599');
  assert.equal(src('A220-100', [row('AC345')]), JET, 'no picture of the -100, which Air Canada does not fly');
});

test('an aeroplane in special colours is never drawn in the everyday ones', () => {
  assert.ok(LIVERY.CGNBN, 'C-GNBN, the A220-300 in Trans-Canada Air Lines colours, is in the table');
  assert.equal(src('BCS3', [row('AC604', { _reg: 'C-GNBN' })]), JET, 'its registration on the row');
  SEEN.AC605 = { cs: 'ACA605', reg: 'C-GNBN' };
  assert.equal(src('BCS3', [row('AC605')]), JET, 'its registration as FR24 saw it');
  delete SEEN.AC605;
  assert.equal(src('BCS3', [row('AC604', { _reg: 'C-GJXN' })]), AC('223'), 'any other A220 of Air Canada');
});

test('Rouge flies the A320 and A321 in its own colours: never painted Air Canada', () => {
  assert.equal(src('A321', [row('AC1986', { _opCode: 'RV' })]), JET);
  // the Rouge sun flights, AC 2100-2299, carry no band and so no operator: the number alone keeps them plain
  assert.equal(src('A321', [row('AC2246')]), JET);
  // a live Rouge callsign on a mainline number keeps it plain too
  assert.equal(src('A321', [row('AC800', { _feedCs: 'ROU800' })]), JET);
  SEEN.AC845 = { cs: 'ROU845' };
  assert.equal(src('A321', [row('AC845')]), JET, 'the callsign FR24 saw counts as much as the feed');
  // Toronto writes ACA for Rouge too: an ACA on the feed must not hide the ROU FR24 saw
  assert.equal(src('A321', [row('AC845', { _feedCs: 'ACA845' })]), JET, 'every callsign is read on its own');
  delete SEEN.AC845;
  // mainline numbers, no other operator: Air Canada colours
  assert.equal(src('A321', [row('AC845')]), AC('321'));
  assert.equal(src('A21N', [row('AC850')]), AC('321'));
  // the Rouge A320 is in its own colours too
  assert.equal(src('A320', [row('AC1650', { _opCode: 'RV' })]), JET);
  assert.equal(src('A320', [row('AC306', { _feedCs: 'ROU306' })]), JET);
  assert.equal(src('A320', [row('AC306', { _opCode: 'ROU' })]), JET);
});

test('the 737 MAX 8: Rouge paints it as Air Canada does, so both wear the one picture (v24183)', () => {
  // Rouge by the ladder, by its callsign (the feed or FR24), and its sun flights, which carry no band
  assert.equal(src('B38M', [row('AC1726', { _opCode: 'RV' })]), AC('7m8'));
  assert.equal(src('B38M', [row('AC1726', { _opCode: 'RV', _feedCs: 'ROU1726' })]), AC('7m8'));
  assert.equal(src('B38M', [row('AC2124')]), AC('7m8'), 'AC2124 to Fort-de-France, a Rouge sun flight on a 737 MAX 8');
  assert.equal(src('B38M', [row('AC800', { _feedCs: 'ROU800' })]), AC('7m8'), 'Rouge on a mainline number');
  SEEN.AC1727 = { cs: 'ROU1727' };
  assert.equal(src('B38M', [row('AC1727', { _feedCs: 'ACA1727' })]), AC('7m8'), 'ACA on the feed, ROU as FR24 saw it');
  delete SEEN.AC1727;
  assert.equal(src('B38M', [row('AC1727', { _opCode: 'ROU' })]), AC('7m8'), 'Rouge written as its callsign code');
  // a row the gate kept across a reload: the ladder answers for it
  assert.equal(src('B38M', [{ flight: 'AC1729', airline: 'AC' }]), AC('7m8'), 'a remembered Rouge row');
  assert.equal(src('B38M', [{ flight: 'AC7680', airline: 'AC' }]), JET, 'a remembered PAL row');
  // mainline as before, and a Rouge inbound beside a mainline departure at one door: one paint either way
  assert.equal(src('B38M', [row('AC800'), row('AC801')]), AC('7m8'));
  assert.equal(src('Boeing 737 MAX 8', [row('AC 800', { _callSign: 'ACA800' })]), AC('7m8'));
  assert.equal(src('B38M', [row('AC1727', { _opCode: 'RV' }), row('AC800')]), AC('7m8'));
  // Air Canada flies no 737-800: the feeds and the ADB registry name its MAX 8s 738 or 73H
  assert.equal(src('B738', [row('AC1096')]), AC('7m8'));
  assert.equal(src('Boeing 737-800', [row('AC1096')]), AC('7m8'));
  assert.equal(src('73H', [row('AC1726', { _opCode: 'RV' })]), AC('7m8'));
  // never another operator, a Jazz or other callsign, special colours, a number outside the blocks or another airline
  assert.equal(src('B38M', [row('AC8803', { _opCode: 'QK' })]), JET);
  assert.equal(src('B38M', [row('AC7754', { _opCode: 'ACEX' })]), JET);
  assert.equal(src('B38M', [row('AC7680', { _opCode: 'PB' })]), JET);
  assert.equal(src('B38M', [row('AC1726', { _opCode: 'WS' })]), JET);
  assert.equal(src('B38M', [row('AC1726', { _feedCs: 'JZA1726' })]), JET);
  assert.equal(src('B38M', [row('AC1726', { _feedCs: 'WJA1726' })]), JET);
  assert.equal(src('B38M', [row('AC1726', { _opCode: 'RV', _reg: 'C-GNBN' })]), JET, 'a registration in special colours');
  assert.equal(src('B38M', [row('AC1727', { _opCode: 'RV' }), row('AC8612', { _opCode: 'QK' })]), JET, 'every row must agree');
  assert.equal(src('B38M', [row('AC2300')]), JET, 'above the Rouge blocks');
  assert.equal(src('B38M', [row('AC7050')]), JET, 'the extras in AC 7000-7599 are A320s');
  assert.equal(src('B738', [row('WS501')]), JET, 'the real 737-800s of WestJet are untouched');
  assert.equal(src('B738', [row('WS501', { _feedCs: 'WJA501' })]), JET);
  assert.equal(src('B39M', [row('AC800')]), JET, 'no picture of the MAX 9, which Air Canada does not fly');
  assert.equal(src('B739', [row('AC800')]), JET);
  assert.equal(src('B737', [row('AC800')]), JET, 'a 737-700 code is another size: plain');
});

test('the CRJ900 and E175 wear Air Canada Express colours for Jazz and the Express brand', () => {
  assert.equal(src('CRJ9', [row('AC8803', { _opCode: 'QK' })]), AC('cr9'));
  assert.equal(src('E75L', [row('AC8902', { _opCode: 'QK' })]), AC('e75'));
  assert.equal(src('CRJ9', [row('AC7754', { _opCode: 'ACEX' })]), AC('cr9'), 'PAL flies no CRJ, so the brand is Jazz');
  assert.equal(src('E75L', [row('AC7210')]), AC('e75'), 'an Express number with no operator on record');
  assert.equal(src('CRJ9', [row('AC403')]), CRJ, 'a mainline number is not an Express flight');
  assert.equal(src('E75L', [row('AC8902', { _opCode: 'QK', _feedCs: 'SKW8902' })]), JET, 'another airline on the callsign');
});

test('the Dash 8-400 wears them only on Jazz evidence on every row: PAL flies its own for Air Canada Express', () => {
  // Jazz by the ladder, or a Jazz callsign
  assert.equal(src('DH8D', [row('AC8615', { _opCode: 'QK' })]), AC('dh4'));
  assert.equal(src('DH8D', [row('AC8615', { _feedCs: 'JZA8615' })]), AC('dh4'));
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX', _feedCs: 'JZA7754' })]), AC('dh4'), 'the brand, flown by Jazz');
  // the gate pairs by the door, not the airframe: one row never lends its Jazz evidence to the other
  SEEN.AC7754 = { cs: 'JZA7754', reg: 'C-GGOY' };
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX' })]), AC('dh4'), 'the inbound alone, seen as Jazz');
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX' }), row('AC7753', { _opCode: 'ACEX' })]), DH4, 'the departure has no Jazz evidence of its own');
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX' }), row('AC7753', { _opCode: 'PB' })]), DH4, 'one row naming PAL keeps it plain');
  delete SEEN.AC7754;
  // a Jazz row paired at the door with a PAL row (the brand, a bare number): plain, whichever way round
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX' }), row('AC8612', { _opCode: 'QK' })]), DH4);
  assert.equal(src('DH8D', [row('AC8611', { _opCode: 'QK' }), row('AC7753', { _opCode: 'ACEX' })]), DH4);
  assert.equal(src('DH8D', [row('AC7203', { _opCode: null }), row('AC8612', { _opCode: 'QK' })]), DH4);
  // a row the gate kept across a reload has no _opCode: the ladder answers for it
  const kept = (flight) => ({ flight, airline: 'AC', gate: '28', status: 'Arrived', _sortTs: 0, _locIata: 'YYZ' });
  assert.equal(src('DH8D', [kept('AC8612'), row('AC8611', { _opCode: 'QK' })]), AC('dh4'), 'a remembered Jazz inbound');
  assert.equal(src('DH8D', [kept('AC8612')]), AC('dh4'), 'the ladder says Jazz for the kept row');
  assert.equal(src('DH8D', [kept('AC7754'), row('AC7753', { _opCode: 'ACEX' })]), DH4, 'a remembered brand row is no Jazz evidence');
  assert.equal(src('DH8D', [kept('AC7680')]), DH4, 'a remembered PAL row stays plain');
  assert.equal(src('DH8D', [kept('AC7680'), row('AC8611', { _opCode: 'QK' })]), DH4, 'a remembered PAL row beside a Jazz one');
  assert.equal(src('DH8D', [kept('AC7680'), row('AC8611', { _feedCs: 'JZA8611' })]), DH4);
  assert.equal(src('DH8D', [kept('AC7203'), row('AC8612', { _opCode: 'QK' })]), DH4, 'a remembered bare number is no Jazz evidence');
  // PAL: the brand block (AC7754 / AC7753 at Moncton), bare numbers (AC7203 is PB7203), its band, its callsign
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX' }), row('AC7753', { _opCode: 'ACEX' })]), DH4);
  assert.equal(src('DH8D', [row('AC7203')]), DH4);
  assert.equal(src('DH8D', [row('AC7680', { _opCode: 'PB' })]), DH4);
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX', _feedCs: 'PVL7754' })]), DH4);
  assert.equal(src('DH8D', [row('PB7203')]), DH4);
});

test('other airlines and odd rows keep the plain pictures', () => {
  assert.equal(src('B38M', [row('WS501')]), JET);
  assert.equal(src('E75L', [row('UA5521')]), JET);
  assert.equal(src('A320', [{ airline: 'AC', flight: 'UA123' }]), JET, 'the number must be an Air Canada number');
  assert.equal(src('A320', [{ airline: 'AC' }]), JET, 'a row with no flight is not evidence');
  // every row of the aeroplane must agree
  assert.equal(src('A320', [row('AC306'), row('WS501')]), JET);
  assert.equal(src('A321', [row('AC845'), row('AC1987', { _opCode: 'RV' })]), JET);
  // no rows, or the old one-argument call: exactly the plain pictures
  assert.equal(src('A320', []), JET);
  assert.equal(specFor('A320').art.src, JET);
  assert.equal(specFor('DH8D').art.src, DH4);
  assert.equal(specFor('CRJ9').art.src, CRJ);
});

test('the same size in flight, the true size and shape close in', () => {
  // zoom 18: every one of them is drawn larger than its picture there, so at its real size
  const mpp18 = 156543.03392 * Math.cos(46.1156 * Math.PI / 180) / Math.pow(2, 18);
  const cases = [
    ['A320', [row('AC306')], 'ac320', 37.6, 34.1],
    ['A321', [row('AC845')], 'ac321', 44.5, 35.8],
    ['B38M', [row('AC800')], 'ac7m8', 39.5, 35.9],
    ['B38M', [row('AC1726', { _opCode: 'RV' })], 'ac7m8', 39.5, 35.9],
    ['B738', [row('AC1096')], 'ac7m8', 39.5, 35.8],
    ['BCS3', [row('AC345')], 'ac223', 38.7, 35.1],
    ['E75L', [row('AC8902', { _opCode: 'QK' })], 'ace75', 31.7, 26.0],
    ['CRJ9', [row('AC8803', { _opCode: 'QK' })], 'accr9', 36.2, 24.9],
    ['DH8D', [row('AC8615', { _opCode: 'QK' })], 'acdh4', 32.8, 28.4]
  ];
  for (const [type, rows, key, len, span] of cases) {
    const s = specFor(type, rows);
    assert.equal(s.art, ART[key], type);
    assert.equal(s.len, len, type + ' length');
    assert.equal(s.span, span, type + ' span (the A320s of Air Canada have wingtip fences: 34.1 m)');
    // in flight: exactly as long as the plain picture of that type
    assert.equal(s.art.len, specFor(type).art.len, type + ' is as long as the picture it stands in for');
    // the picture is true to the aeroplane: barely stretched either way
    const k = scale(s, s.art, 46.1156, 18);
    assert.ok(Math.abs(k.kx / k.ky - 1) < 0.015, type + ' kx/ky ' + (k.kx / k.ky).toFixed(4));
    assert.ok(Math.abs(k.ky * s.art.len * mpp18 - len) < 0.05, type + ' drawn at its real length close in');
  }
});

// A plain PNG reader for these files (8-bit RGBA, not interlaced): rows of [r, g, b, a].
function readPng(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.slice(1, 4).toString('latin1'), 'PNG');
  let p = 8, w = 0, h = 0, depth = 0, type = 0, lace = 0;
  const idat = [];
  while (p < buf.length) {
    const n = buf.readUInt32BE(p), t = buf.slice(p + 4, p + 8).toString('latin1'), d = buf.slice(p + 8, p + 8 + n);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; lace = d[12]; }
    if (t === 'IDAT') idat.push(d);
    p += 12 + n;
  }
  assert.deepEqual([depth, type, lace], [8, 6, 0], file + ': 8-bit RGBA, not interlaced');
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, rows = [];
  let prev = Buffer.alloc(stride), q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++], line = Buffer.from(raw.slice(q, q + stride)); q += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    rows.push(line); prev = line;
  }
  return { w, h, rows };
}

function hue(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
}
// the red of each livery (maple leaves, exit outlines) as the grey pass leaves it, less a tenth
const RED_MIN = { ac320: 580, ac321: 142, ac7m8: 202, ac223: 225, ace75: 27, accr9: 63, acdh4: 13 };

test('the seven pictures: light 512 px RGBA squares, framed, upright, neutral, the reds kept', () => {
  for (const key of ['ac320', 'ac321', 'ac7m8', 'ac223', 'ace75', 'accr9', 'acdh4']) {
    const a = ART[key];
    assert.ok(a && /^\/logos\/map-plane-ac-[0-9a-z]+\.png$/.test(a.src), key);
    const file = path.join(root, 'fids-current', a.src);
    assert.ok(fs.statSync(file).size < 160000, key + ' stays light for the boards');
    const { w, h, rows } = readPng(file);
    assert.deepEqual([w, h], [512, 512], key);
    const solid = (x, y) => rows[y][x * 4 + 3] >= 128;
    let top = -1, bot = -1, minX = w, maxX = -1, nearGrey = 0, red = 0;
    const strong = new Set(), soft = [];
    for (let y = 0; y < h; y++) {
      let any = false;
      for (let x = 0; x < w; x++) {
        const i = x * 4, r = rows[y][i], g = rows[y][i + 1], b = rows[y][i + 2];
        if (!rows[y][i + 3]) continue;
        // the colour of every drawn pixel, its soft edge included, as the grey pass reads it
        const c = Math.max(r, g, b) - Math.min(r, g, b);
        if (c > 0 && c <= 12) nearGrey++;
        if (c > 12 && c <= 30) soft.push([x, y]);
        if (c > 30) { const hu = hue(r, g, b); if (hu >= 330 || hu < 25) strong.add(y * w + x); }
        if (!solid(x, y)) continue;
        // the shape, from the solid pixels
        any = true; if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (r - Math.max(g, b) >= 20) red++;
      }
      if (any) { if (top < 0) top = y; bot = y; }
    }
    // nothing touches the edge, and the corners are clear (no ground of its own)
    assert.ok(top > 0 && bot < h - 1 && minX > 0 && maxX < w - 1, key + ' is not clipped');
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) assert.equal(rows[y][x * 4 + 3], 0, key + ' corner');
    // framed like the picture it stands in for: its length and span in the 48 px box
    const len48 = (bot - top + 1) / w * 48, span48 = (maxX - minX + 1) / w * 48;
    assert.ok(Math.abs(len48 - a.len) <= 0.45, key + ' length ' + len48.toFixed(2) + ' vs ' + a.len);
    assert.ok(Math.abs(span48 - a.span) <= 0.3, key + ' span ' + span48.toFixed(2) + ' vs ' + a.span);
    // turned about its own middle: half-way nose to tail, and on the fuselage axis, fore and aft
    assert.ok(Math.abs((top + bot) / 2 - 256) <= 2.5, key + ' half-way point ' + (top + bot) / 2);
    const axis = (y) => { let x0 = 256, x1 = 256; if (!solid(256, y)) return null; while (x0 > 0 && solid(x0 - 1, y)) x0--; while (x1 < w - 1 && solid(x1 + 1, y)) x1++; return (x0 + x1) / 2; };
    const fore = axis(top + Math.round(0.2 * (bot - top))), aft = axis(top + Math.round(0.75 * (bot - top)));
    assert.ok(fore !== null && aft !== null && Math.abs(fore - 256) <= 2 && Math.abs(aft - 256) <= 2, key + ' fuselage axis ' + fore + ' / ' + aft);
    assert.ok(Math.abs(aft - fore) <= 2, key + ' stands upright: ' + fore + ' to ' + aft);
    // every white and grey is neutral; a soft tint is left only on the edge of red paint (3 px)
    assert.equal(nearGrey, 0, key + ' near-grey pixels with a tint');
    const nearRed = ([x, y]) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (strong.has((y + dy) * w + (x + dx))) return true; return false; };
    const stray = soft.filter((pt) => !nearRed(pt));
    assert.equal(stray.length, 0, key + ' tinted pixels away from any red, e.g. ' + JSON.stringify(stray.slice(0, 3)));
    assert.ok(red >= RED_MIN[key], key + ' red pixels ' + red + ', at least ' + RED_MIN[key]);
  }
});

test('both maps and the apron hand the rows of the aeroplane to the picker, and the apron redraws on a change of colours', () => {
  assert.match(fnSource('_mapPlaneSpec'), /var _rows = \[inb, cf\];[\s\S]*_mapPlaneSpecFor\(raw, _rows\)/);
  assert.match(fnSource('_gateApronSpec'), /var rows = \[a, b\];[\s\S]*_mapPlaneSpecFor\(raw, rows\)/);
  // the apron key carries the picture, so a marker first drawn in one set of colours is drawn again
  assert.match(fnSource('_gateApronPlan'), /it\.spec\.key \+ '>' \+ \(\(it\.spec\.art && it\.spec\.art\.src\) \|\| ''\)/);
});
