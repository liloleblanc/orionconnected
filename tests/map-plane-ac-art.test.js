'use strict';

// WHY THIS EXISTS
//
// v24182. The gate maps drew every aeroplane with one of five plain pictures,
// white on the light street map, so it read as see-through. Seven top views in
// Air Canada colours (supplied art: A320, A321, 737 MAX 8, A220-300, E175,
// CRJ900, Dash 8-400) now draw an aeroplane that wears those colours. The risk
// is the wrong colours on the wrong aeroplane: Rouge flies the A321 and the
// 737 MAX 8 under Air Canada numbers in its own colours, PAL flies its own
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
const acArt = lift('_mapPlaneAcArt', ['_MAP_PLANE_ART', '_acResolvedGet', 'AIRCRAFT_LIVERY_BY_REG', '_aircraftRegKey'], [ART, resolved, LIVERY, regKey]);
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

test('Rouge flies the A321 and the 737 MAX 8 in its own colours: never painted Air Canada', () => {
  assert.equal(src('A321', [row('AC1986', { _opCode: 'RV' })]), JET);
  assert.equal(src('B38M', [row('AC1726', { _opCode: 'RV' })]), JET);
  // the Rouge sun flights, AC 2100-2299, carry no band and so no operator: the number alone keeps them plain
  assert.equal(src('B38M', [row('AC2124')]), JET);
  assert.equal(src('A321', [row('AC2246')]), JET);
  // a live Rouge callsign on a mainline number keeps it plain too
  assert.equal(src('B38M', [row('AC800', { _feedCs: 'ROU800' })]), JET);
  SEEN.AC845 = { cs: 'ROU845' };
  assert.equal(src('A321', [row('AC845')]), JET, 'the callsign FR24 saw counts as much as the feed');
  // Toronto writes ACA for Rouge too: an ACA on the feed must not hide the ROU FR24 saw
  assert.equal(src('A321', [row('AC845', { _feedCs: 'ACA845' })]), JET, 'every callsign is read on its own');
  delete SEEN.AC845;
  // mainline numbers, no other operator: Air Canada colours
  assert.equal(src('A321', [row('AC845')]), AC('321'));
  assert.equal(src('A21N', [row('AC850')]), AC('321'));
  assert.equal(src('B38M', [row('AC800'), row('AC801')]), AC('7m8'));
  assert.equal(src('Boeing 737 MAX 8', [row('AC 800', { _callSign: 'ACA800' })]), AC('7m8'));
});

test('the CRJ900 and E175 wear Air Canada Express colours for Jazz and the Express brand', () => {
  assert.equal(src('CRJ9', [row('AC8803', { _opCode: 'QK' })]), AC('cr9'));
  assert.equal(src('E75L', [row('AC8902', { _opCode: 'QK' })]), AC('e75'));
  assert.equal(src('CRJ9', [row('AC7754', { _opCode: 'ACEX' })]), AC('cr9'), 'PAL flies no CRJ, so the brand is Jazz');
  assert.equal(src('E75L', [row('AC7210')]), AC('e75'), 'an Express number with no operator on record');
  assert.equal(src('CRJ9', [row('AC403')]), CRJ, 'a mainline number is not an Express flight');
  assert.equal(src('E75L', [row('AC8902', { _opCode: 'QK', _feedCs: 'SKW8902' })]), JET, 'another airline on the callsign');
});

test('the Dash 8-400 wears them only on positive Jazz evidence: PAL flies its own for Air Canada Express', () => {
  // Jazz by the ladder, or a Jazz callsign
  assert.equal(src('DH8D', [row('AC8615', { _opCode: 'QK' })]), AC('dh4'));
  assert.equal(src('DH8D', [row('AC8615', { _feedCs: 'JZA8615' })]), AC('dh4'));
  assert.equal(src('DH8D', [row('AC7754', { _opCode: 'ACEX', _feedCs: 'JZA7754' })]), AC('dh4'), 'the brand, flown by Jazz');
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

test('the seven pictures: light 512 px RGBA squares, framed, upright, neutral', () => {
  for (const key of ['ac320', 'ac321', 'ac7m8', 'ac223', 'ace75', 'accr9', 'acdh4']) {
    const a = ART[key];
    assert.ok(a && /^\/logos\/map-plane-ac-[0-9a-z]+\.png$/.test(a.src), key);
    const file = path.join(root, 'fids-current', a.src);
    assert.ok(fs.statSync(file).size < 160000, key + ' stays light for the boards');
    const { w, h, rows } = readPng(file);
    assert.deepEqual([w, h], [512, 512], key);
    const solid = (x, y) => rows[y][x * 4 + 3] >= 128;
    let top = -1, bot = -1, minX = w, maxX = -1, chroma = 0, greys = 0;
    for (let y = 0; y < h; y++) {
      let any = false;
      for (let x = 0; x < w; x++) {
        if (!solid(x, y)) continue;
        any = true; if (x < minX) minX = x; if (x > maxX) maxX = x;
        const i = x * 4, r = rows[y][i], g = rows[y][i + 1], b = rows[y][i + 2];
        const c = Math.max(r, g, b) - Math.min(r, g, b);
        if (c <= 30) { chroma += c; greys++; }
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
    // every white and grey is neutral: no lilac left
    assert.ok(chroma / greys <= 1, key + ' grey tint ' + (chroma / greys).toFixed(2));
  }
});

test('both maps and the apron hand the rows of the aeroplane to the picker, and the apron redraws on a change of colours', () => {
  assert.match(fnSource('_mapPlaneSpec'), /var _rows = \[inb, cf\];[\s\S]*_mapPlaneSpecFor\(raw, _rows\)/);
  assert.match(fnSource('_gateApronSpec'), /var rows = \[a, b\];[\s\S]*_mapPlaneSpecFor\(raw, rows\)/);
  // the apron key carries the picture, so a marker first drawn in one set of colours is drawn again
  assert.match(fnSource('_gateApronPlan'), /it\.spec\.key \+ '>' \+ \(\(it\.spec\.art && it\.spec\.art\.src\) \|\| ''\)/);
});
