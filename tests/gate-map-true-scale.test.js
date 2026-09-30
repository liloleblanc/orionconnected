'use strict';

// WHY THIS EXISTS
//
// v23916. The gate maps drew every aeroplane as a fixed 48 px picture. Parked
// on a Moncton stand at zoom 15 that made an A320 a 142 m aeroplane — 3.8
// times its size, across two stands and half the apron — and at the terminal
// and airport fallbacks 7.5 and 30 times. Now an aeroplane the evidence places
// at a stand is drawn at its REAL size at zoom 17 with its nose on the stand's
// stop point (or, on Moncton's bridge pads, its nose wheel 2.2 m ahead of the
// pad's centre) and its body back along the stand's heading, on both maps; a
// live ground fix at either end is shown the same way. In flight and at every
// zoom up to 15 the picture stays exactly today's size.
//
// Everything here is arithmetic on the real source (lifted, not restated) and
// the real gate file, so it runs without a browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const YQM = JSON.parse(fs.readFileSync(path.join(root, 'fids-current', 'data', 'gates', 'YQM.json'), 'utf8'));

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

const gcNm = lift('_gcNm', [], []);
const gcBrg = lift('_gcBrgDeg', [], []);
const gcDest = lift('_gcDestPt', [], []);
const norm = lift('_gateRefNorm', [], []);
const toIata = lift('aircraftCodeToIata', [], []);
const DIMS = varTable('_MAP_PLANE_DIMS');
const ART = varTable('_MAP_PLANE_ART');
const UNKNOWN = varTable('_MAP_PLANE_UNKNOWN');
const specFor = lift('_mapPlaneSpecFor', ['aircraftCodeToIata', '_MAP_PLANE_DIMS', '_MAP_PLANE_ART', '_MAP_PLANE_UNKNOWN'], [toIata, DIMS, ART, UNKNOWN]);
const scale = lift('_mapPlaneScale', [], []);
const standHeading = lift('_gateStandHeading', ['_gcNm', '_gcBrgDeg'], [gcNm, gcBrg]);
const place = lift('_gateParkPlace', ['_mapPlaneSpecFor', '_MAP_PLANE_ART', '_mapPlaneScale', '_gateStandHeading', '_gcDestPt', '_gcNm', '_gcBrgDeg'],
  [specFor, ART, scale, standHeading, gcDest, gcNm, gcBrg]);
const alloc = lift('_gateStandAlloc', [], []);
const parkSpot = lift('_gateParkSpot', ['_apGatesFor', '_gateRefNorm', '_gcNm', '_gateStandAlloc', '_MAP_PLANE_UNKNOWN'],
  [(k) => (k === 'YQM' ? YQM : null), norm, gcNm, alloc, UNKNOWN]);
const YQM_AP = [46.11, -64.68];
const m = (a, b) => gcNm(a, b) * 1852;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' ± ' + tol + ', got ' + a);
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// Metres per CSS px on the 256 px Web Mercator tiles.
const mpp = (lat, z) => 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);

test('every type string becomes one size and one picture', () => {
  const dh4 = specFor('De Havilland Dash 8-400');
  assert.equal(dh4.code, 'DH4');
  assert.equal(dh4.prop, true);
  assert.deepEqual([dh4.len, dh4.span, dh4.ng], [32.8, 28.4, 3.9]);
  assert.equal(dh4.art.src, '/logos/map-plane-dh4.svg', 'the supplied Dash 8-400 drawing, not the off-centre turboprop PNG');
  for (const raw of ['DH8D', 'DHC-8-400', 'Dash 8 Q400', 'DH4']) assert.equal(specFor(raw).art.src, '/logos/map-plane-dh4.svg', raw);
  // The smaller Dash 8s use the same drawing at their own dimensions.
  const dh1 = specFor('DH8A');
  assert.deepEqual([dh1.code, dh1.len, dh1.span, dh1.art.src], ['DH1', 22.3, 25.9, '/logos/map-plane-dh4.svg']);
  assert.equal(specFor('DH3').art.src, '/logos/map-plane-dh4.svg');
  // Rear-engine T-tails: the CRJ900 model; the 717 / DC-9 / MD-80s: the 717 model.
  for (const raw of ['CRJ9', 'Bombardier CRJ900', 'CR7', 'CRJ200', 'CRK', 'E145', 'ERJ-135']) assert.equal(specFor(raw).art.src, '/logos/map-plane-crj.svg', raw);
  for (const raw of ['B712', 'Boeing 717', 'MD-83', 'MD88', 'DC9']) assert.equal(specFor(raw).art.src, '/logos/map-plane-717.svg', raw);
  // Everything else: the jet PNG, or (turboprops other than the Dash 8) the turboprop PNG.
  for (const raw of ['A320', 'Airbus A319', 'B38M', 'Embraer 175', 'A220-300', '787-9']) assert.equal(specFor(raw).art.src, '/logos/map-plane-jet.png', raw);
  for (const raw of ['ATR 72-600', 'AT43', 'SF3']) {
    assert.equal(specFor(raw).art.src, '/logos/map-plane-prop.png', raw);
    assert.equal(specFor(raw).prop, true, raw);
  }
  // A type nobody names: a narrowbody-sized jet, or a regional turboprop.
  assert.deepEqual([specFor('').len, specFor('').span, specFor('').prop, specFor('').known], [38, 35, false, false]);
  assert.deepEqual([specFor('Twin Otter').prop, specFor('XYZ').len], [true, 38]);
  const e75 = specFor('E175');
  assert.deepEqual([e75.code, e75.len, e75.span, e75.ng], ['E75', 31.7, 26.0, 3.2]);
});

test('the size table: every row is metres, the approximate nose gears sensible', () => {
  for (const [code, row] of Object.entries(DIMS)) {
    assert.equal(row.length, 3, code);
    const [L, S, ng] = row;
    assert.ok(L >= 10 && L <= 80 && S >= 10 && S <= 80, code + ' is an aeroplane in metres');
    assert.ok(ng > 0 && ng < L / 4, code + ' nose gear within the front quarter');
  }
  const pick = (c) => DIMS[c].slice(0, 2);
  assert.deepEqual(pick('320'), [37.6, 35.8]);
  assert.deepEqual(pick('CR9'), [36.2, 24.9]);
  assert.deepEqual(pick('752'), [47.3, 41.1], '757-200 with the winglets most carry');
  assert.deepEqual(pick('763'), [54.9, 50.9], '767-300ER with winglets');
  assert.deepEqual(pick('E75'), [31.7, 26.0], 'the E175 wing is the E170\'s, 26.0 m');
  // The pictures, measured in the 48 px box: the jet PNG is 114 x 95 of 128.
  near(ART.jet.len, 114 * 48 / 128, 0.01);
  near(ART.jet.span, 95 * 48 / 128, 0.01);
  near(ART.prop.len, 93 * 48 / 128, 0.01);
  // The SVGs replace a PNG at its own length, so nothing changes size in flight.
  assert.equal(ART.dh4.len, ART.prop.len);
  assert.equal(ART.crj.len, ART.jet.len);
  assert.equal(ART.t717.len, ART.jet.len);
});

test('the three drawings are centred on the aeroplane and measure what the table says', () => {
  const K = 603 / 32.8;                         // the Dash 8-400 drawing's units per metre
  const rows = [
    ['map-plane-dh4.svg', ART.dh4, 603, 553, [225, 251]],
    ['map-plane-crj.svg', ART.crj, 36.2 * K, 24.9 * K, [0, 0]],
    ['map-plane-717.svg', ART.t717, 37.8 * K, 28.4 * K, [0, 0]],
  ];
  const manifest = fs.readFileSync(path.join(root, 'fids-current', 'assets', 'asset-manifest.json'), 'utf8');
  for (const [file, art, L, S, [cx, cy]] of rows) {
    const svg = fs.readFileSync(path.join(root, 'fids-current', 'logos', file), 'utf8');
    assert.equal(art.src, '/logos/' + file);
    const vb = svg.match(/<svg[^>]*viewBox="([-\d. ]+)"/)[1].split(/\s+/).map(Number);
    assert.equal(vb[2], vb[3], file + ' is square, so the 48 px box keeps its shape');
    near(vb[0] + vb[2] / 2, cx, 0.05, file + ' centred across');
    near(vb[1] + vb[3] / 2, cy, 0.05, file + ' centred nose to tail');
    near(L * 48 / vb[2], art.len, 0.02, file + ' length in the box');
    near(S * 48 / vb[2], art.span, 0.02, file + ' span in the box');
    assert.doesNotMatch(svg, /<image|xlink:href|url\(/, file + ' is self-contained');
    assert.ok(manifest.includes('"path": "/logos/' + file + '"'), file + ' is in the asset manifest');
  }
});

test('at zoom 17 on a Moncton stand the aeroplane is its real size: Dash 8-400, CRJ900, A319', () => {
  const lat = 46.116, z = 17, u = mpp(lat, z);
  near(u, 0.8279, 0.0005, 'metres per px');
  const drawn = (raw) => { const a = specFor(raw), k = scale(a, a.art, lat, z); return { len: a.art.len * k.ky, span: a.art.span * k.kx, k }; };
  const dh4 = drawn('DH4');
  near(dh4.len * u, 32.8, 0.05, 'Dash 8-400 length, m');
  near(dh4.span * u, 28.4, 0.05, 'and its span (the drawing is 6% wider than the real wing; kx brings it in)');
  near(dh4.len, 39.6, 0.1, 'px');
  const cr9 = drawn('CR9');
  near(cr9.len * u, 36.2, 0.05, 'CRJ900 length, m');
  near(cr9.span * u, 24.9, 0.1, 'CRJ900 span, m');
  // The A319 is shorter than today's icon at z17, so it keeps today's length
  // (never smaller) — but its wing is wider than the icon's, and the span has
  // its own floor: 35.4 m of its real 35.8 (the 1.2 × length clamp), where it
  // used to be held at the icon's 29.5 m, 18% too narrow.
  const a319 = drawn('319');
  assert.equal(a319.k.ky, 1);
  near(a319.len, 42.75, 0.001);
  assert.ok(33.8 / u < 42.75, 'its real length is less than the icon');
  near(a319.k.kx, 1.2, 1e-9, 'widened to the clamp');
  near(a319.span * u, 35.8, 0.5, 'A319 span, m');
  // The others shorter than the icon at z17, at their real span.
  near(drawn('318').span * u, 34.1, 0.05, 'A318 span, m');
  near(drawn('AT7').span * u, 27.1, 0.05, 'ATR 72 span, m');
  // And the ones the length already scaled are unchanged: exact both ways.
  for (const [code, L, S] of [['320', 37.6, 35.8], ['7M8', 39.5, 35.9], ['789', 62.8, 60.1]]) {
    near(drawn(code).len * u, L, 0.05, code + ' length, m');
    near(drawn(code).span * u, S, 0.05, code + ' span, m');
  }
  // Bigger at higher latitude: the same zoom draws more pixels per metre.
  const kef = specFor('320');
  assert.ok(scale(kef, kef.art, 63.99, 17).ky > scale(kef, kef.art, 46.1, 17).ky);
});

test('the zoom-in to a stand has no jumps: length and span grow continuously and never shrink', () => {
  // The live parked path flies 15 → 17 and the fit runs on every frame of it.
  // The span used to be held at 1 until the length outgrew the picture and then
  // jump in one frame: +14% on an A320 at z16.91, +15% on a 787-9, and a Dash
  // 8-400 5% NARROWER than today's icon at z16.82.
  const step = Math.pow(2, 0.005);
  for (const lat of [46.116, 43.68, 51.47]) {
    for (const code of ['DH4', 'DH1', 'AT7', 'CR9', 'E75', '318', '319', '320', '7M8', '789', '388']) {
      const a = specFor(code);
      let prev = null;
      for (let i = 0; i <= 400; i++) {
        const z = 15 + i * 0.005, k = scale(a, a.art, lat, z);
        assert.ok(k.kx >= 1 && k.ky >= 1, code + ' never smaller than today at z' + z.toFixed(3));
        if (prev) {
          assert.ok(k.kx >= prev.kx - 1e-12 && k.ky >= prev.ky - 1e-12, code + ' never shrinks zooming in, z' + z.toFixed(3));
          assert.ok(k.kx <= prev.kx * step + 1e-9 && k.ky <= prev.ky * step + 1e-9, code + ' no jump at z' + z.toFixed(3) + ' (lat ' + lat + ')');
        }
        prev = k;
      }
    }
  }
});

test('in flight, and at every zoom up to 15, every aeroplane is exactly today\'s icon', () => {
  for (const code of Object.keys(DIMS)) {
    const a = specFor(code);
    for (let z = 3; z <= 15; z++) {
      for (const lat of [-45, 0, 25, 46.1, 51.5, 62, 64]) {
        // The one exception, north of 62°: at z15 an A380's 80 m wing is wider
        // than the icon, and the span's own max(1, …) floor draws it real.
        if (code === '388' && lat === 64 && z === 15) continue;
        const k = scale(a, a.art, lat, z);
        assert.deepEqual([k.kx, k.ky], [1, 1], code + ' at z' + z + ', lat ' + lat);
      }
    }
  }
  const a380 = specFor('388'), k380 = scale(a380, a380.art, 64, 15);
  assert.equal(k380.ky, 1, 'its length is still today\'s');
  near(a380.art.span * k380.kx * k380.mpp, 79.8, 0.01, 'its span its real one');
  // The common types, from 50°S to 66°N, in flight: today's icon.
  for (const code of ['DH4', 'DH3', 'AT7', 'CR9', 'E75', '223', '320', '321', '7M8', '789', '77W']) {
    const a = specFor(code);
    for (let lat = -50; lat <= 66; lat += 2) {
      for (let z = 3; z <= 15; z++) assert.deepEqual(Object.values(scale(a, a.art, lat, z)).slice(0, 2), [1, 1], code + ' z' + z + ' lat ' + lat);
    }
  }
  // And the ground view never shrinks it: drawn length is max(icon, real).
  const a = specFor('DH1');
  const k = scale(a, a.art, 46.1, 17);
  assert.equal(k.ky, 1, 'a Dash 8-100 stays today\'s size at z17 (its real size is smaller)');
});

test('the nose on the stop point, the middle half the aeroplane back along the stand heading', () => {
  // Stand 1A is a walk-out whose painted lead-in line runs at 240°.
  const p = YQM.stands['1A'];
  const spot = parkSpot('YQM', YQM_AP, '1', specFor('DH4'));
  assert.equal(spot.ref, '1A');
  const pl = place(spot, [43.68, -79.62]);
  assert.equal(pl.hdg, 240, 'nose along the lead-in line, not toward Toronto');
  near(m(pl.nose, p), 0, 0.01, 'the nose is on the stop point');
  near(m([pl.lat, pl.lng], p), 32.8 / 2, 0.05, 'middle half a Dash 8-400 back');
  near(gcBrg(p, [pl.lat, pl.lng]), 60, 0.1, 'behind the nose: 240 − 180');
  near(pl.lenM, 32.8, 0.001);
  // A picture drawn longer than the aeroplane (today's icon, the max(1, …)
  // rule) keeps its drawn nose on the stop: the middle is half the DRAWN
  // length back.
  const a319 = place(Object.assign({}, spot, { ac: specFor('319') }), null);
  near(a319.lenM, 42.75 * mpp(p[0], 17), 0.01);
  near(m([a319.lat, a319.lng], p), a319.lenM / 2, 0.05);
});

test('on a bridge pad the nose wheel stops 2.2 m ahead of the pad centre, per type (YQM BR1)', () => {
  const pad = YQM.stands.BR1;
  assert.equal(YQM.stand_kind.BR1, 'pad');
  const rows = [
    // type, nose-gear distance, drawn length at z17
    ['CR9', 3.5, 36.2],
    ['DH4', 3.9, 32.8],
    ['E75', 3.2, Math.max(31.7, 42.75 * mpp(pad[0], 17))],
    ['320', 5.0, Math.max(37.6, 42.75 * mpp(pad[0], 17))],
  ];
  // A turboprop at doors 3/4 walks out to stand 5 (see the next test); it is
  // on Bridge 1's pad only once the walk-outs are all taken, so the Dash 8 row
  // is the pad's spot with a Dash 8 on it.
  const onPad = (code) => {
    const s = parkSpot('YQM', YQM_AP, '3', specFor(code));
    return s.ref === 'BR1' ? s : Object.assign({}, parkSpot('YQM', YQM_AP, '3', specFor('CR9')), { ac: specFor(code) });
  };
  assert.equal(parkSpot('YQM', YQM_AP, '3', specFor('DH4')).ref, '5');
  for (const [code, ng, lenM] of rows) {
    const spot = onPad(code);
    assert.deepEqual([spot.ref, spot.kind, spot.hdg, spot.zoom], ['BR1', 'pad', 310, 17], code);
    const pl = place(spot, [43.68, -79.62]);
    assert.equal(pl.hdg, 310, code + ' faces the way the bridge pad does');
    near(m(pl.nose, pad), ng + 2.2, 0.01, code + ' nose ahead of the pad centre');
    near(gcBrg(pad, pl.nose), 310, 0.1, code + ' along the heading');
    near(pl.lenM, lenM, 0.01, code + ' drawn length');
    const c = [pl.lat, pl.lng];
    near(m(c, pl.nose), lenM / 2, 0.02, code + ' middle half the drawn length behind the nose');
    // Signed: ahead of the pad centre (+) or behind it (−) along 310°.
    const along = m(c, pad) * (angle(gcBrg(pad, c), 310) < 90 ? 1 : -1);
    near(along, ng + 2.2 - lenM / 2, 0.05, code + ' middle along the pad');
  }
  // The calibration: the E175-size jet on Bridge 2's pad in the aerial photo
  // has its nose 5.4 m ahead of the pad centre.
  const e = place(parkSpot('YQM', YQM_AP, '1', specFor('E75')), null);
  assert.equal(parkSpot('YQM', YQM_AP, '1', specFor('E75')).ref, 'BR2');
  near(m(e.nose, YQM.stands.BR2), 5.4, 0.01);
});

test('Moncton: which stand the board\'s own aeroplane takes', () => {
  const ref = (g, raw) => parkSpot('YQM', YQM_AP, g, raw == null ? undefined : specFor(raw)).ref;
  // Jets take the bridges; a type nobody named is drawn as a jet and parks as one.
  for (const g of ['3', '4']) {
    for (const raw of ['CR9', '320', '7M8', 'E75', null]) assert.equal(ref(g, raw), 'BR1', 'gate ' + g + ' jet ' + raw + ' → Bridge 1');
  }
  for (const g of ['1', '2']) {
    for (const raw of ['CR9', '320', '7M8', '223', 'E75', 'Dash 9', null]) assert.equal(ref(g, raw), 'BR2', 'gate ' + g + ' jet ' + raw + ' → Bridge 2');
  }
  // Props take the walk-outs. Doors 3 and 4 have no stand of their own number
  // and list Bridge 1 first; a turboprop there walks out to stand 5, the first
  // walk-out they list, never onto the bridge's pad.
  for (const g of ['3', '4']) {
    for (const raw of ['DH4', 'DH8A', 'DH3', 'AT7', 'SF3']) {
      const s = parkSpot('YQM', YQM_AP, g, specFor(raw));
      assert.deepEqual([s.ref, s.kind, s.hdg], ['5', 'stop', 335], 'gate ' + g + ' turboprop ' + raw + ' walks out to stand 5');
    }
  }
  assert.equal(ref('1', 'DH4'), '1A', 'gate 1 turboprop walks out to 1A');
  assert.equal(ref('1', 'AT7'), '1A');
  assert.equal(ref('2', 'DH4'), '2', 'gate 2 turboprop walks out to its own stand');
  assert.equal(ref('2', 'DH3'), '2');
  // At stand 5 the Dash 8's nose is on the stop point, along the lead-in line.
  const pl = place(parkSpot('YQM', YQM_AP, '3', specFor('DH4')), [43.68, -79.62]);
  assert.equal(pl.hdg, 335);
  near(m(pl.nose, YQM.stands['5']), 0, 0.01);
  near(m([pl.lat, pl.lng], YQM.stands['5']), 32.8 / 2, 0.05);
});

test('the map draws the aeroplane the panel names: the registration\'s type first, then the inbound, then the departure row', () => {
  // _regTrueType stands in for the registration lookup the panel uses; C-GKQF
  // is a Dash 8-400 in this test's world.
  const REG = { 'C-GKQF': 'De Havilland Canada Dash 8-400', 'C-FEJT': 'Embraer 195' };
  const specNow = (cf, inb, store) => new Function('window', '_acResolvedGet', '_regTrueType', '_mapPlaneSpecFor', 'return (' + fnSource('_mapPlaneSpec') + ')')(
    { _gateCurrentFlight: cf, _gateInbound: inb }, (fl) => (store && store[fl]) || null, (r) => REG[r] || '', specFor)();
  // The swap: the departure row is scheduled as an E195, the aeroplane that
  // turns here is a Dash 8-400 by its registration. The panel says Dash 8-400;
  // so does the map, and it walks out to its stand instead of taking the bridge.
  const swap = specNow({ _aircraftCode: 'E95', _aircraft: 'Embraer 195-E2', flight: 'PD471' }, { _reg: 'C-GKQF', flight: 'PD470' });
  assert.deepEqual([swap.key, swap.prop, swap.art.src], ['DH4', true, '/logos/map-plane-dh4.svg']);
  assert.equal(parkSpot('YQM', YQM_AP, '1', swap).ref, '1A');
  assert.equal(parkSpot('YQM', YQM_AP, '2', swap).ref, '2');
  // And the other way: scheduled as a Dash 8, the registration is an E195 — a jet on the bridge.
  const back = specNow({ _aircraftCode: 'DH4', flight: 'PD471' }, { _reg: 'C-FEJT', flight: 'PD470' });
  assert.deepEqual([back.key, back.prop], ['E95', false]);
  assert.equal(parkSpot('YQM', YQM_AP, '1', back).ref, 'BR2');
  // No registration: the inbound's own row, then the resolved store for it, beat the departure row.
  assert.equal(specNow({ _aircraftCode: 'E95' }, { _aircraftCode: 'DH8D' }).key, 'DH4');
  assert.equal(specNow({ _aircraftCode: 'E95', flight: 'PD471' }, { flight: 'PD470' }, { PD470: { cd: 'DH4', nm: '' } }).key, 'DH4');
  // Nothing from the inbound: the departure row, then its resolved store.
  assert.equal(specNow({ _aircraftCode: 'E95', flight: 'PD471' }, {}).key, 'E95');
  assert.equal(specNow({ flight: 'PD471' }, {}, { PD471: { cd: 'CR9', nm: '' } }).key, 'CR9');
  // A registration whose type is not on record does not block the rest.
  assert.equal(specNow({ _aircraftCode: 'E95' }, { _reg: 'C-XXXX' }).key, 'E95');
  // PD472 as it was: nothing names the type but the registration.
  assert.equal(specNow({}, { _reg: 'C-GKQF' }).key, 'DH4');
});

test('the allocation is a pure list function: distinct stands, the largest first, jets to the bridges', () => {
  const list1 = YQM.door_stands['1'], list3 = YQM.door_stands['3'];
  assert.deepEqual(alloc(list1, YQM.bridged, '1', [{ id: 'a', prop: false, len: 37.6 }]), { a: 'BR2' });
  assert.deepEqual(alloc(list1, YQM.bridged, '1', [{ id: 'a', prop: true, len: 32.8 }]), { a: '1A' });
  assert.deepEqual(alloc(list3, YQM.bridged, '3', [{ id: 'a', prop: true, len: 32.8 }]), { a: '5' },
    'no stand of its own: the first walk-out listed, not the bridge listed before it');
  // Props take every walk-out before a bridge.
  assert.deepEqual(alloc(YQM.door_stands['2'], YQM.bridged, '2', [{ id: 'a', prop: true, len: 32.8 }, { id: 'b', prop: true, len: 32.8 }]),
    { a: '2', b: '1B' }, 'two turboprops at door 2: its own stand, then the next walk-out — not Bridge 2');
  assert.deepEqual(alloc(list1, YQM.bridged, '1', [1, 2, 3].map((i) => ({ id: 'p' + i, prop: true, len: 32.8 }))),
    { p1: '1A', p2: '1B', p3: '2' }, 'three turboprops at door 1: every walk-out, the bridge left free');
  // Several at once (phase 4): distinct stands; the largest goes first.
  assert.deepEqual(alloc(list3, YQM.bridged, '3', [{ id: 'q', prop: true, len: 32.8 }, { id: 'j', prop: false, len: 36.2 }]),
    { j: 'BR1', q: '5' }, 'the jet takes the bridge, the turboprop the next stand');
  assert.deepEqual(alloc(list1, YQM.bridged, '1', [{ id: 's', prop: true, len: 25.7 }, { id: 'b', prop: true, len: 32.8 }, { id: 'j', prop: false, len: 44.5 }]),
    { j: 'BR2', b: '1A', s: '1B' }, 'the turboprops take the door\'s own walk-outs, the bigger first');
  assert.deepEqual(alloc(list3, YQM.bridged, '3', [{ id: 'x', prop: false, len: 40 }, { id: 'y', prop: false, len: 36 }]),
    { x: 'BR1', y: '5' }, 'one bridge: the longer jet gets it');
  const five = [1, 2, 3, 4, 5].map((i) => ({ id: 'p' + i, prop: true, len: 30 }));
  const got = alloc(list3, YQM.bridged, '3', five);
  assert.deepEqual(Object.values(got).filter(Boolean).sort(), ['5', '6A', '6B', 'BR1'], 'every stand once');
  assert.equal(Object.values(got).filter((v) => v === null).length, 1, 'and one left without a stand');
  // The door's own-numbered stand, lettered ones in order.
  assert.deepEqual(alloc(['12B', 'X', '12A'], [], '12', [{ id: 'a', prop: true, len: 30 }]), { a: '12A' });
  assert.deepEqual(alloc(['12B', '12', '12A'], ['12B'], '12', [{ id: 'a', prop: false, len: 38 }]), { a: '12B' }, 'a jet: the door\'s bridged stand');
  assert.deepEqual(alloc([], [], '1', [{ id: 'a', prop: false, len: 38 }]), { a: null });
});

test('a door with no stand: the aeroplane stands off the building, nose in', () => {
  const door = [46.11612, -64.6879], term = YQM.terminals[0];
  const spot = { lat: door[0], lng: door[1], zoom: 17, src: 'gate', door, term, ac: specFor('320') };
  const pl = place(spot, [43.68, -79.62]);
  const out = gcBrg(term, door);
  near(angle(pl.hdg, (out + 180) % 360), 0, 0.1, 'nose toward the door');
  near(m(pl.nose, door), 5, 0.01, 'nose 5 m out from the door');
  near(m([pl.lat, pl.lng], door), pl.lenM / 2 + 5, 0.05, 'middle half the aeroplane further out');
  near(angle(gcBrg(door, [pl.lat, pl.lng]), out), 0, 0.1, 'outward from the terminal');
  // The terminal and airport fallbacks: today's symbol on the point, nose to the destination.
  const t = place({ lat: term[0], lng: term[1], zoom: 16, src: 'terminal', ac: specFor('320') }, [43.68, -79.62]);
  assert.deepEqual([t.lat, t.lng], term);
  near(t.hdg, gcBrg(term, [43.68, -79.62]), 1e-9);
});

test('the heading rules: the stand\'s own, else its door within 150 m, else the terminal within 400 m, else the destination', () => {
  const p = [46.116, -64.687];
  assert.equal(standHeading([p[0], p[1], 123], null, null, null), 123);
  const door = gcDest(p, 80, 100 / 1852), term = gcDest(p, 200, 300 / 1852), dst = [43.68, -79.62];
  near(standHeading(p, door, term, dst), 80, 0.01, 'door at 100 m');
  near(standHeading(p, gcDest(p, 80, 200 / 1852), term, dst), 200, 0.01, 'door too far: terminal at 300 m');
  near(standHeading(p, null, gcDest(p, 200, 500 / 1852), dst), gcBrg(p, dst), 0.01, 'terminal too far: the destination');
  assert.equal(standHeading(p, null, null, null), null);
});

test('the parked views are at zoom 17 on both maps; the terminal 16; the airport keeps 12', () => {
  const s = (g, raw) => parkSpot('YQM', YQM_AP, g, raw ? specFor(raw) : undefined);
  assert.equal(s('1', 'DH4').zoom, 17);
  assert.equal(s('3', 'CR9').zoom, 17);
  assert.equal(s('9').zoom, 16);
  assert.equal(parkSpot('YYZ', [43.68, -79.62], '').zoom, 12);
  // Both maps draw the parked and empty stands through the same two functions.
  for (const name of ['initGateMap', '_bigMapClone']) {
    const src = fnSource(name);
    assert.match(src, /_gateDrawParkedEstimate\(/);
    assert.match(src, /_gateDrawEmptyStand\(/);
    // v23918 — through _gateOwnParkSpot, which asks _gateParkSpot with _mapPlaneSpec().
    assert.match(src, /_gateOwnParkSpot\(/);
  }
  assert.match(fnSource('_gateOwnParkSpot'), /var ac = _mapPlaneSpec\(\);\s+var sp = _gateParkSpot\(iata, o, _gateOwnGateRef\(iata\), ac\);/);
});

test('the picture is scaled by CSS custom properties, the IMAGE not the rotated div; the zoom hook covers every map', () => {
  const at = CSS.indexOf('v23916 — THE AEROPLANE ON THE GATE MAPS AT ITS REAL SIZE');
  assert.ok(at > 0, 'the v23916 block exists');
  const block = CSS.slice(at);
  assert.match(block, /\.leaflet-marker-icon img\[src\*="\/logos\/map-plane-"\] \{\s*transform-origin: 50% 50%;\s*transform: scale\(var\(--fids-plane-kx, 1\), var\(--fids-plane-ky, 1\)\);\s*\}/);
  assert.match(block, /img\[src\*="\/logos\/map-plane-prop\.png"\] \{\s*transform: scale\(var\(--fids-plane-kx, 1\), var\(--fids-plane-ky, 1\)\) translateX\(7\.3px\);/,
    'the off-centre turboprop PNG is put back on its axis before it is scaled');
  const tiles = fnSource('_gateMapTileLayer');
  assert.match(tiles, /m\.on\('zoom zoomend viewreset', function \(\) \{ _mapPlaneFit\(m\); \}\);/);
  // The fit writes the two properties on the map's container.
  const calls = {};
  const c = { style: { setProperty: (k, v) => { calls[k] = v; } }, querySelector: () => null };
  const fit = lift('_mapPlaneFit', ['_mapPlaneSpec', '_mapPlaneScale'], [() => specFor('DH4'), scale]);
  fit({ _loaded: true, getContainer: () => c, getZoom: () => 17, getCenter: () => ({ lat: 46.116 }) });
  near(+calls['--fids-plane-ky'], 32.8 / mpp(46.116, 17) / ART.dh4.len, 0.001);
  fit({ _loaded: true, getContainer: () => c, getZoom: () => 12, getCenter: () => ({ lat: 46.116 }) });
  assert.deepEqual([calls['--fids-plane-kx'], calls['--fids-plane-ky']], ['1.0000', '1.0000'], 'in flight: exactly today\'s icon');
  // A type learned after the marker was drawn swaps the picture too.
  const img = { src: '/logos/map-plane-jet.png', getAttribute() { return this.src; }, setAttribute(k, v) { this.src = v; } };
  fit({ _loaded: true, getContainer: () => Object.assign({}, c, { querySelector: () => img }), getZoom: () => 17, getCenter: () => ({ lat: 46.116 }) });
  assert.equal(img.src, '/logos/map-plane-dh4.svg');
  // Every marker copy is fitted where it is drawn, and on every map tick.
  for (const name of ['initGateMap', 'initGateMapLive', '_bigMapClone', '_bigMapCloneLive', '_gateDrawParkedEstimate', '_gateApplyParked']) {
    assert.match(fnSource(name), /_mapPlaneFit\(/, name);
  }
  assert.match(fnSource('_gateMapApply'), /_mapPlaneFit\(gateMap\); _mapPlaneFit\(window\._bigCraftMap\);/);
  assert.match(fnSource('_gateMapApply'), /if \(res\.kind === 'stand' \|\| res\.kind === 'none'\) \{ try \{ acKey = '\|' \+ _mapPlaneSpec\(\)\.key;/,
    'a type learned later redraws the stand it picks');
});

test('a live aeroplane on the ground at either end: zoom 17 standing, 16 taxiing; in the air, unchanged', () => {
  const zoomNow = (where, lp) => new Function('window', 'return (' + fnSource('_gateGroundSpeed') + ')')({ _gateMapWhere: where, _gateInboundLivePos: lp });
  assert.equal(zoomNow({ kind: 'fix', spd: 12 }, null)(), 12);
  assert.equal(zoomNow({ kind: 'stand' }, { speed: 3 })(), 3, 'the poll\'s, when the answer is not a live fix');
  assert.equal(zoomNow({ kind: 'stand' }, null)(), null);
  const gz = (spd) => lift('_gateGroundZoomNow', ['_gateGroundSpeed'], [() => spd])();
  assert.equal(gz(0), 17);
  assert.equal(gz(5), 17, '5 kt or less is standing');
  assert.equal(gz(14), 16, 'taxiing');
  assert.equal(gz(null), 17);
  const at = (onG, spd) => lift('_gateGroundZoom', ['_gateOnGroundNow', '_gateGroundZoomNow', '_gcNm'], [() => onG, () => (spd > 5 ? 16 : 17), gcNm]);
  const o = [46.11, -64.68], d = [43.68, -79.62];
  assert.equal(at(true, 0)(46.115, -64.687, o, d), 17, 'parked at the origin');
  assert.equal(at(true, 20)(43.677, -79.63, o, d), 16, 'taxiing at our field');
  assert.equal(at(false, 0)(46.115, -64.687, o, d), 0, 'in the air: the ladder decides');
  assert.equal(at(true, 0)(45.0, -70.0, o, d), 0, 'a ground fix anywhere else is not a ground view');
  // Both live builders take the ground zoom, and the small map's zoom hold does not keep the approach's.
  const mini = fnSource('initGateMapLive'), big = fnSource('_bigMapCloneLive');
  assert.match(mini, /var _gndZ = _gateGroundZoom\(planeLat, planeLng, o, d\);\s*if \(_gndZ\) \{\s*zoom = _gndZ;/);
  assert.match(mini, /if \(zoom !== _lv\.zoom\) zoom = _lv\.zoom \+ \(zoom > _lv\.zoom \? 1 : -1\);\s*\/\/ v23916[^\n]*\n\s*if \(_gndZ\) zoom = _gndZ;/);
  assert.match(big, /var _bcGndZ = _gateGroundZoom\(planeLat, planeLng, o, d\);\s*if \(_bcGndZ\) \{\s*zoom = _bcGndZ;/);
  // The origin's gate file is asked for (a static file on our own site), for the stand heading there.
  assert.match(mini, /if \(_gcNm\(\[planeLat, planeLng\], o\) < 5\) _apGatesFor\(org\);/);
  // Landed at our field: no glide, the marker to the fix.
  assert.match(mini, /if \(_gndZ\) \{\s*_stopGateMapGlide\(\);\s*_gateApplyParked\(_mv, planeLat, planeLng, d, true\);/);
  assert.match(big, /if \(_gateGroundZoom\(planeLat, planeLng, o, d\)\) \{\s*_stopGateMapGlide\(\);\s*_gateApplyParked\(_bmv, planeLat, planeLng, d, true\);/);
  assert.match(mini, /if \(_gndHere\) _glSpd = 0;/);
  assert.match(big, /if \(_bcGndHere\) _bcGlSpd = 0;/);
});

test('the in-place parked paths fly the camera down to the ground view and point the nose the stand\'s way', () => {
  const calls = { fly: null, fit: 0, a1: null, a2: null, pos: null };
  const view = {
    map: { getZoom: () => 15, flyTo: (p, z) => { calls.fly = [p, z]; } },
    marker: { setLatLng: (p) => { calls.pos = p; }, getElement: () => ({ firstChild: { style: {} } }) },
    a1: { setLatLngs: (v) => { calls.a1 = v; } }, a2: { setLatLngs: (v) => { calls.a2 = v; } },
  };
  const el = { firstChild: { style: {} } };
  view.marker.getElement = () => el;
  const apply = lift('_gateApplyParked', ['_gcFullRoute', '_gateHeading', '_gateGroundHeading', '_gateGroundZoomNow', '_mapPlaneFit'],
    [() => ['route'], (h) => h, () => 310, () => 17, () => { calls.fit++; }]);
  apply(view, 46.1156, -64.6877, [43.68, -79.62]);
  assert.deepEqual(calls.fly, [[46.1156, -64.6877], 17], 'down to stand zoom — these paths never changed zoom before');
  assert.equal(el.firstChild.style.transform, 'rotate(310deg)', 'the stand\'s heading');
  assert.deepEqual([calls.a1, calls.a2], [[], ['route']], 'at the origin: nothing flown, the route dashed from it');
  assert.equal(calls.fit, 1);
  apply(view, 46.1156, -64.6877, [43.68, -79.62], true);
  assert.deepEqual(calls.a2, [], 'landed here: nothing ahead of it');
  // Already at the ground zoom: no camera move.
  calls.fly = null;
  view.map.getZoom = () => 17;
  apply(view, 46.1156, -64.6877, [43.68, -79.62]);
  assert.equal(calls.fly, null);
});

test('a track is a heading only while the aeroplane moves (5 kt or more)', () => {
  const heading = (spd, track) => new Function('window', '_gateTrackTrusted', '_GATE_TRACK_MAX_AGE_MS', 'return (' + fnSource('_gateHeading') + ')')(
    { _gateInboundLiveTrack: { track, at: Date.now() } }, () => !(typeof spd === 'number' && spd < 5), 120000);
  assert.equal(heading(0, 95)(310), 310, 'standing: the stand heading, not a stale track');
  assert.equal(heading(4.9, 95)(310), 310);
  assert.equal(heading(12, 95)(310), 95, 'taxiing: its own track');
  assert.equal(heading(null, 95)(310), 95, 'no speed on record (the air): the track, as before');
  // A live aeroplane standing still on a stand: that stand's heading.
  const G = { YQM };
  const ground = lift('_gateGroundHeading', ['_AP_GATES', '_gcNm', '_gateStandHeading'], [G, gcNm, standHeading]);
  const nearBR1 = gcDest(YQM.stands.BR1, 130, 12 / 1852);      // 12 m behind the pad centre
  assert.equal(ground(nearBR1[0], nearBR1[1], 99), 310);
  const off = gcDest(YQM.stands.BR1, 130, 200 / 1852);
  assert.equal(ground(off[0], off[1], 99), 99, 'no stand within 45 m: the caller\'s heading');
});

// The real live builders against a fake Leaflet: only drawing helpers and the
// glide's frames are stubbed; the glide start keeps its real contract (a view
// is registered only with a live speed).
function liveWorld(type) {
  const AIRPORTS = { YYZ: [43.6777, -79.6248], YQM: [46.1122, -64.6786] };
  const window = { _gateIata: 'YQM' };
  const log = [];
  const layer = () => ({ _map: null, addTo(m) { this._map = m; return this; }, bindTooltip() { return this; },
    setLatLngs() {}, setLatLng() {}, getElement() { return null; } });
  const containers = {};
  const mkContainer = () => ({ isConnected: true, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, querySelector() { return null; } });
  const L = {
    map(id) {
      const c = containers[id] = containers[id] || mkContainer();
      return { _loaded: false, _z: null, _c: null, _size: { x: 400, y: 300 }, id,
        getContainer() { return c; },
        setView(p, z) { this._c = { lat: p[0], lng: p[1] }; this._z = z; this._loaded = true; log.push(id + ' setView z' + z); return this; },
        flyTo(p, z) { this._c = { lat: p[0], lng: p[1] }; this._z = z; log.push(id + ' flyTo z' + z); return this; },
        getZoom() { return this._z; }, getCenter() { return this._c; }, getSize() { return this._size; },
        latLngToContainerPoint(ll) {
          const u = 156543.03392 * Math.cos(this._c.lat * Math.PI / 180) / Math.pow(2, this._z);
          return { x: this._size.x / 2 + (ll[1] - this._c.lng) * 111320 * Math.cos(this._c.lat * Math.PI / 180) / u,
                   y: this._size.y / 2 - (ll[0] - this._c.lat) * 110574 / u };
        },
        removeLayer(l) { l._map = null; }, remove() {}, invalidateSize() {}, on() {} };
    },
    marker: layer, polyline: layer, circleMarker: layer, divIcon: (o) => o, latLng: (a, b) => ({ lat: a, lng: b }),
  };
  const document = { getElementById: (id) => (id === 'gateMapBox' || id === 'bigCraftMap') ? (containers[id] = containers[id] || mkContainer()) : null };
  const table = (name) => 'var ' + name + ' = ' + JSON.stringify(varTable(name)) + ';';
  const src = [
    'var gateMap = null;',
    'var _gateGlide = { timer: null, raf: null, gen: 0, views: {} };',
    'var _AP_GATES = {};',
    table('_MAP_PLANE_DIMS'), table('_MAP_PLANE_UNKNOWN'), table('_MAP_PLANE_ART'),
    'function _mapPlaneSpec(){ return _mapPlaneSpecFor(TYPE); }',
    'function _mapPlaneIcon(){ return _mapPlaneSpec().art.src; }',
    'function _lookupAirport(k){ return AIRPORTS[k] || null; }',
    'function _fetchAirportCoords(){ return Promise.resolve(); }',
    'function _apGatesFor(){ return null; }',
    'function _gateHeading(b){ return b; }',
    'function _gateGroundHeading(a,b,f){ return f; }',
    'function _gateFlownPath(){ return null; }',
    'function _runwayFinalPath(){ return null; }',
    'function _gcAddArc(map){ return L.polyline().addTo(map); }',
    'function _gcFullRoute(a,b){ return [a,b]; }',
    'function _gateMapTileLayer(){ return { addTo: function(){ return this; } }; }',
    'function _gateMapWatchResize(){}',
    'function _bcFadeInWhenReady(t){ return t; }',
    'function _bcSizeNow(){}',
    'function _gateApplyParked(v, lat, lng){ LOG.push("applyParked"); if (v.marker) v.marker.setLatLng([lat,lng]); }',
    'function _startGateMapGlide(map,o,d,la,ln,mk,a1,a2,spd){ LOG.push("glide " + spd);',
    '  if (!(spd > 0)) return;',
    '  var same = _gateGlide.o && _gateGlideSameLeg(_gateGlide.o,o) && _gateGlideSameLeg(_gateGlide.d,d);',
    '  _gateGlide.o = o; _gateGlide.d = d; if (!same) _gateGlide.views = {};',
    '  _gateGlide.views[map === gateMap ? "mini" : "big"] = { map: map, marker: mk, a1: a1, a2: a2 }; mk._map = map; _gateGlide.raf = 1; }',
    ...['aircraftCodeToIata', '_gcNm', '_gateGlideNoteFix', '_gateGlideSameLeg', '_stopGateMapGlide', '_gateParkedAtOrigin',
        '_gateGroundSpeed', '_gateOnGroundNow', '_gateGroundZoomNow', '_gateGroundZoom',
        '_mapPlaneSpecFor', '_mapPlaneScale', '_mapPlaneFit', 'initGateMapLive', '_bigMapCloneLive'].map(fnSource),
    'return { mini: initGateMapLive, big: _bigMapCloneLive, gateMap: function(){ return gateMap; }, glide: _gateGlide };',
  ].join('\n');
  const api = new Function('L', 'document', 'window', 'console', 'setTimeout', 'AIRPORTS', 'TYPE', 'LOG', src)(
    L, document, window, { log() {} }, () => 0, AIRPORTS, type, log);
  window._bigCraftMap = null;
  const fix = (lat, lng, onGround, spd) => {
    window._gateInboundLivePos = { lat, lng, onGround, speed: spd, at: Date.now(), fl: 'AC1234' };
    window._gateMapWhere = { kind: onGround ? 'origin-ground' : 'fix', leg: 'in', org: 'YYZ', dst: 'YQM', lat, lng, onGround, spd, at: Date.now() };
    window._gateMapFix = onGround ? null : { lat, lng, spd, speed: spd };
    log.length = 0;
    api.mini('YYZ', 'YQM', lat, lng, Date.now());
    const m = api.gateMap();
    return { z: m.getZoom(), rec: window._GATE_MAP_VIEW && window._GATE_MAP_VIEW.zoom,
             ky: +containers.gateMapBox.style.props['--fids-plane-ky'], kx: +containers.gateMapBox.style.props['--fids-plane-kx'], log: log.slice() };
  };
  return { window, api, fix, log, L, containers };
}

test('after take-off from the origin the small map leaves the ground zoom: 15 at most, today\'s icon', () => {
  const hs = [43.6700, -79.6400];                       // holding short at Toronto, inside 5 nm of it
  for (const [spd, groundZ] of [[0, 17], [15, 16]]) {
    const w = liveWorld('789');
    const g = w.fix(hs[0], hs[1], true, spd);
    assert.equal(g.z, groundZ, spd + ' kt on the ground: the ground view');
    // The first airborne fix, 3.5 km on, inside the hold's box around the ground fix.
    const a = w.fix(hs[0] + 0.026, hs[1] + 0.03, false, 165);
    assert.ok(a.z <= 15, 'in the air: no deeper than the air ladder (was ' + groundZ + '), got z' + a.z);
    assert.equal(a.z, 15);
    assert.equal(a.rec, 15, 'and that is the zoom carried to the next fix');
    assert.deepEqual([a.kx, a.ky], [1, 1], 'the climbing 787-9 is today\'s icon, not 1.7 times it');
    // Then the ladder steps out one level per fix, as it did from the old z15 origin view.
    assert.equal(w.fix(hs[0] + 0.070, hs[1] + 0.09, false, 200).z, 14);
    assert.equal(w.fix(hs[0] + 0.120, hs[1] + 0.16, false, 230).z, 13);
  }
  // Further out on the first airborne fix: one level out from 15, not from 17.
  const w = liveWorld('320');
  w.fix(hs[0], hs[1], true, 0);
  assert.equal(w.fix(hs[0] + 0.060, hs[1] + 0.10, false, 190).z, 14);
  // Still on the ground, the ground view as before.
  const w2 = liveWorld('320');
  w2.fix(hs[0], hs[1], true, 0);
  assert.equal(w2.fix(hs[0] + 0.0005, hs[1], true, 12).z, 16, 'taxiing');
});

test('after take-off the big map\'s in-place re-anchor comes out of the ground zoom too', () => {
  const w = liveWorld('789');
  const hs = [43.6700, -79.6400], air = [hs[0] + 0.026, hs[1] + 0.03];
  // A big map left at stand zoom by the in-place parked path, with a same-leg glide view on it.
  const big = w.L.map('bigCraftMap');
  big.setView(hs, 17);
  w.window._bigCraftMap = big;
  const mk = w.L.marker().addTo(big);
  w.api.glide.o = [43.6777, -79.6248]; w.api.glide.d = [46.1122, -64.6786];
  w.api.glide.views.big = { map: big, marker: mk, a1: w.L.polyline(), a2: w.L.polyline() };
  w.window._gateInboundLivePos = { lat: air[0], lng: air[1], onGround: false, speed: 165, at: Date.now() };
  w.window._gateMapWhere = { kind: 'fix', onGround: false, spd: 165, lat: air[0], lng: air[1], at: Date.now() };
  w.log.length = 0;
  w.api.big('YYZ', 'YQM', air[0], air[1], Date.now());
  assert.ok(w.log.includes('bigCraftMap flyTo z15'), 'flown out to 15: ' + w.log.join(', '));
  assert.equal(big.getZoom(), 15);
  // In the air at the ladder's zooms it keeps its zoom and only follows the aeroplane.
  big.setView(air, 13);
  w.log.length = 0;
  w.api.big('YYZ', 'YQM', air[0] + 0.001, air[1], Date.now());
  assert.ok(!w.log.some((s) => /flyTo/.test(s)), 'no camera move in the air: ' + w.log.join(', '));
});
