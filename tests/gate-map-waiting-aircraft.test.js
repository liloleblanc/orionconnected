'use strict';

// WHY THIS EXISTS
//
// Reported on AC1987 at Moncton gate 1, still at the gate: the small map
// showed "the middle of nowhere" — zoom 3 over Vermont, the Moncton–Toronto
// line across it and no aeroplane. Before departure both estimate maps framed
// the WHOLE route and drew no aircraft; on a gate-sized box that fit is zoom 3
// over the route's midpoint. v23909: an aeroplane that has not left is drawn
// where it is waiting — at its gate's stand at the board's own airport (from
// the OpenStreetMap gate files), else at the terminal or the airport — with
// the camera on it, like the live parked view (v23905).
//
// v23915: "waiting" was the schedule read as a place — gate 1 parked the 05:25
// departure's aeroplane at stand 1A seven hours before it left Toronto. An
// aeroplane is now drawn only on evidence (see gate-map-evidence.test.js), and
// with none the map is our own gate, empty: the stand, the route dashed from
// it, and a label naming the other end. Never the route over its midpoint.
//
// v23916: the parked and empty views are at zoom 17 (the terminal 16), where
// the aeroplane is drawn at its real size, and the stand depends on its type —
// a door boards a group of stands, a jet takes the bridge, a turboprop the
// walk-out. The placement arithmetic is in gate-map-true-scale.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const GATES = path.join(root, 'fids-current', 'data', 'gates');

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
const lift = (name, deps, vals) => new Function(...deps, 'return (' + fnSource(name) + ')')(...vals);
const gcNm = lift('_gcNm', [], []);
const norm = lift('_gateRefNorm', [], []);
// A `var NAME = {...};` table, evaluated on its own.
function varSource(name) {
  const i = CORE.indexOf('var ' + name + ' = {');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) {
    if (CORE[j] === '{') depth++;
    else if (CORE[j] === '}' && --depth === 0) break;
  }
  return new Function('return (' + CORE.slice(CORE.indexOf('{', i), j + 1) + ')')();
}
// v23916 — the stand depends on the aeroplane: _gateParkSpot is given its
// type (a _mapPlaneSpec) and picks among the door's stands (_gateStandAlloc).
const alloc = lift('_gateStandAlloc', [], []);
const UNKNOWN = varSource('_MAP_PLANE_UNKNOWN');
const parkSpot = (files) => lift('_gateParkSpot', ['_apGatesFor', '_gateRefNorm', '_gcNm', '_gateStandAlloc', '_MAP_PLANE_UNKNOWN'],
  [(k) => (typeof files === 'function' ? files(k) : files[k]) || null, norm, gcNm, alloc, UNKNOWN]);
const JET = { prop: false, len: 37.6, key: '320' };
const PROP = { prop: true, len: 32.8, key: 'DH4' };

const YQM = JSON.parse(fs.readFileSync(path.join(GATES, 'YQM.json'), 'utf8'));

test('one spelling for a gate, on the board and in the gate files', () => {
  assert.equal(norm('1'), '1');
  assert.equal(norm('Gate 07'), '7');
  assert.equal(norm('a01'), 'A1');
  assert.equal(norm('B 22'), 'B22');
  assert.equal(norm('C-77'), 'C77');
  assert.equal(norm('1A'), '1A');
  assert.equal(norm(null), '');
  // The builder's norm_ref must agree, or a file keys a stand the board never asks for.
  let py = null;
  try {
    py = execFileSync('python3', ['-c',
      'import importlib.util,json,sys\n' +
      's=importlib.util.spec_from_file_location("b",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n' +
      'print(json.dumps([m.norm_ref(x) for x in json.loads(sys.argv[2])]))',
      path.join(root, 'scripts', 'gates', 'build-gates.py'), JSON.stringify(['1', 'Gate 07', 'a01', 'B 22', 'C-77', '1A', ''])], { encoding: 'utf8' });
  } catch (e) { py = null; }
  if (py) assert.deepEqual(JSON.parse(py), ['1', '7', 'A1', 'B22', 'C77', '1A', '']);
});

test('every gate file is well formed, keyed the way the board asks, and credits OpenStreetMap', () => {
  const files = fs.readdirSync(GATES).filter(f => f.endsWith('.json'));
  assert.ok(files.includes('YQM.json'), 'the home airport has its stands');
  for (const f of files) {
    const g = JSON.parse(fs.readFileSync(path.join(GATES, f), 'utf8'));
    assert.equal(g.iata + '.json', f, f + ' names its airport');
    assert.match(g.source, /OpenStreetMap/, f + ' credits its source');
    for (const kind of ['stands', 'gates']) {
      for (const [k, p] of Object.entries(g[kind] || {})) {
        assert.equal(norm(k), k, f + ' ' + kind + ' key ' + k + ' is normalised');
        // A stand may carry the way the nose points once parked: [lat, lng, hdg].
        const n = kind === 'stands' ? [2, 3] : [2];
        assert.ok(Array.isArray(p) && n.includes(p.length) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180, f + ' ' + k + ' is a point');
        if (p.length === 3) assert.ok(p[2] >= 0 && p[2] < 360, f + ' stand ' + k + ' heading is degrees true');
      }
    }
    assert.ok(Array.isArray(g.terminals), f + ' lists terminals');
    // Each door's stands, and the stands a jet bridge reaches, name stands on record.
    for (const [d, list] of Object.entries(g.door_stands || {})) {
      assert.ok(g.gates[d], f + ' door_stands door ' + d + ' is a door');
      assert.ok(Array.isArray(list) && list.length && list.every(s => g.stands[s]), f + ' door ' + d + ' lists stands on record');
    }
    assert.ok((g.bridged || []).every(s => g.stands[s]), f + ' bridged names stands on record');
    assert.equal(g.license, 'ODbL-1.0', f + ' states its licence');
    assert.match(g.license_url, /opendatacommons\.org\/licenses\/odbl/, f + ' links it');
    assert.equal(typeof g.ambiguous, 'object', f + ' records the refs it could not pin to one place');
  }
});

test('the waiting aeroplane stands at its gate, else the terminal, else the airport', () => {
  const o = [46.11, -64.68];
  const at = parkSpot({ YQM });
  const where = (s) => s && { ref: s.ref, zoom: s.zoom, src: s.src };
  // v23916 — a door boards a group of stands: a turboprop walks out to the
  // door's own stand (gate 1 boards stand 1A, as it always has; gate 2 its own
  // stand 2, not the nearer stand 3), a jet takes the door's bridge.
  assert.deepEqual(where(at('YQM', o, '1', PROP)), { ref: '1A', zoom: 17, src: 'stand' }, 'gate 1 turboprop: stand 1A, at its door');
  assert.deepEqual(where(at('YQM', o, '2', PROP)), { ref: '2', zoom: 17, src: 'stand' }, 'gate 2 turboprop: its own stand');
  assert.deepEqual(where(at('YQM', o, '1', JET)), { ref: 'BR2', zoom: 17, src: 'stand' }, 'gate 1 jet: Bridge 2');
  assert.deepEqual(where(at('YQM', o, '2', JET)), { ref: 'BR2', zoom: 17, src: 'stand' }, 'gate 2 jet: Bridge 2');
  assert.deepEqual(where(at('YQM', o, '1')), { ref: 'BR2', zoom: 17, src: 'stand' }, 'a type nobody named is drawn as a jet, and parks as one');
  // Gate 3 boards over Bridge 1. OSM's stand "3" was really Bridge 2's head
  // (gates 1 and 2), so the builder's YQM correction replaces both bridge
  // stands; doors 3 and 4 list Bridge 1's pad first. A jet takes it; a
  // turboprop walks out to stand 5, the first walk-out those doors list.
  for (const g of ['3', '4']) {
    assert.equal(at('YQM', o, g, JET).ref, 'BR1', 'gate ' + g + ' jet boards over Bridge 1');
    assert.deepEqual(where(at('YQM', o, g, PROP)), { ref: '5', zoom: 17, src: 'stand' }, 'gate ' + g + ' turboprop walks out to stand 5');
  }
  // The spot carries what the placement needs: the stand's heading and kind,
  // its door, the terminal it faces, and the aeroplane it was chosen for.
  assert.deepEqual(at('YQM', o, '3', JET), {
    lat: YQM.stands.BR1[0], lng: YQM.stands.BR1[1], zoom: 17, src: 'stand', ref: 'BR1', hdg: 310, kind: 'pad',
    door: YQM.gates['3'], term: YQM.terminals[0], ac: JET });
  assert.deepEqual(at('YQM', o, '1', PROP), {
    lat: YQM.stands['1A'][0], lng: YQM.stands['1A'][1], zoom: 17, src: 'stand', ref: '1A', hdg: 240, kind: 'stop',
    door: YQM.gates['1'], term: YQM.terminals[0], ac: PROP });
  assert.deepEqual(YQM.bridged, ['BR1', 'BR2'], 'Moncton has two jet bridges');
  assert.equal(YQM.door_stands['3'][0], 'BR1');
  assert.ok(YQM.door_stands['1'].includes('BR2') && YQM.door_stands['2'].includes('BR2'), 'gates 1 and 2 share Bridge 2');
  assert.deepEqual(YQM.stand_kind, { BR1: 'pad', BR2: 'pad' });
  assert.deepEqual(at('YQM', o, '9'), { lat: YQM.terminals[0][0], lng: YQM.terminals[0][1], zoom: 16, src: 'terminal' }, 'no such gate: the only terminal');
  assert.deepEqual(at('YQM', o, ''), { lat: YQM.terminals[0][0], lng: YQM.terminals[0][1], zoom: 16, src: 'terminal' }, 'another airport\'s aeroplane has no gate here');
  assert.deepEqual(at('YYZ', [43.68, -79.62], ''), { lat: 43.68, lng: -79.62, zoom: 12, src: 'airport' }, 'no file: the airport, far enough out');
  // A stand 5 nm or more from the airport is another airport's.
  const far = parkSpot({ YQM: { stands: { 1: [45.9, -64.3] }, gates: {}, terminals: [] } });
  assert.equal(far('YQM', o, '1').src, 'airport');
  // Multiple terminals and no stand: the airport, not a guessed terminal.
  const two = parkSpot({ YQM: { stands: {}, gates: {}, terminals: [[46.115, -64.688], [46.105, -64.67]] } });
  assert.equal(two('YQM', o, '1').src, 'airport');
  // A door's group is only its stands near it: one listed 400 m away is not boarded from here.
  const stray = parkSpot({ YQM: { stands: { 1: [46.1162, -64.6868], X: [46.1195, -64.6868] }, gates: { 1: [46.1161, -64.6879] },
    terminals: [], door_stands: { 1: ['X', '1'] }, bridged: ['X'] } });
  assert.equal(stray('YQM', o, '1', JET).ref, '1');
});

test('the door is the authority: a same-numbered stand elsewhere on the field is never used', () => {
  const spot = (file, ap) => parkSpot(() => file)('JFK', ap, '36');
  const ap = [40.64, -73.78];
  const door = [40.6452, -73.7897];                 // T8's door 36
  const t4stand36 = [40.6436, -73.7700];            // T4's stand "36", ~1.7 km away
  // The far stand loses to the door itself.
  assert.deepEqual(spot({ stands: { 36: t4stand36 }, gates: { 36: door }, terminals: [] }, ap), { lat: door[0], lng: door[1], zoom: 17, src: 'gate', door });
  // A stand AT the door (any number) wins over the door.
  const atDoor = [40.6456, -73.7893];               // ~55 m
  assert.deepEqual(spot({ stands: { 36: t4stand36, 7: atDoor }, gates: { 36: door }, terminals: [] }, ap),
    { lat: atDoor[0], lng: atDoor[1], zoom: 17, src: 'stand', ref: '7', kind: 'stop', door });
  // No door on record: a same-numbered stand only if it sits at a terminal or a door.
  const cargo = spot({ stands: { 36: t4stand36 }, gates: {}, terminals: [[40.6452, -73.7897]] }, ap);
  assert.equal(cargo.src, 'terminal', 'a lone stand 1.7 km from any terminal is not a gate');
  const ok = spot({ stands: { 36: t4stand36 }, gates: {}, terminals: [[40.6440, -73.7705]] }, ap);
  assert.deepEqual(ok, { lat: t4stand36[0], lng: t4stand36[1], zoom: 17, src: 'stand', ref: '36', kind: 'stop', term: [40.6440, -73.7705] });
});

test('only the board\'s own airport uses the board\'s gate', () => {
  const own = (iata, cf, sub) => new Function('window', 'subScreenVal', 'return (' + fnSource('_gateOwnGateRef') + ')')({ _gateIata: iata, _gateCurrentFlight: cf }, sub);
  assert.equal(own('YQM', { gate: '1' }, '4')('YQM'), '1');
  assert.equal(own('YQM', { gate: '' }, '4')('yqm'), '4', 'the screen\'s gate when the flight carries none');
  assert.equal(own('YQM', { gate: '1' }, '4')('YYZ'), '', 'an inbound\'s origin is not our gate');
});

test('the parked estimate draws the aeroplane at the spot, the route dashed from it, the camera on it', () => {
  const calls = { setView: null, arcs: [], markers: [], fit: 0, placed: null };
  const map = { setView: (c, z) => { calls.setView = [c, z]; } };
  const L = {
    divIcon: (o) => o,
    marker: (ll, opts) => ({ addTo: () => { calls.markers.push({ ll, html: opts.icon.html }); return 'marker'; } }),
  };
  // v23916 — the marker goes where _gateParkPlace puts the aeroplane's middle
  // (tested with real numbers in gate-map-true-scale.test.js), nose the
  // stand's way; this is the drawing's wiring.
  const place = { lat: 46.11618, lng: -64.68663, hdg: 240, nose: [46.11611, -64.6868], lenM: 32.8 };
  const draw = new Function('L', '_gateMapShowOverlay', '_gcAddArc', '_gcNm', '_mapPlaneIcon', '_gateParkPlace', '_mapPlaneFit',
    'return (' + fnSource('_gateDrawParkedEstimate') + ')')(
    L, () => true, (m, a, b, opts) => { calls.arcs.push({ a, b, dash: opts.dashArray }); return 'arc'; }, gcNm,
    () => '/logos/map-plane-dh4.svg', (spot, d) => { calls.placed = [spot, d]; return place; }, (m) => { if (m === map) calls.fit++; });
  const spot = { lat: 46.11611, lng: -64.6868, zoom: 17, src: 'stand', ref: '1A', hdg: 240, kind: 'stop' };
  const out = draw(map, spot, [43.68, -79.62]);
  assert.deepEqual(calls.placed, [spot, [43.68, -79.62]]);
  assert.deepEqual(calls.setView, [[46.11618, -64.68663], 17], 'camera on the aeroplane at stand zoom');
  assert.deepEqual(calls.arcs, [{ a: [46.11618, -64.68663], b: [43.68, -79.62], dash: '8,6' }], 'the route starts at the aeroplane, dashed');
  assert.equal(calls.markers.length, 1);
  assert.deepEqual(calls.markers[0].ll, [46.11618, -64.68663], 'the marker on the aeroplane\'s middle, not on the stop point');
  const rot = +calls.markers[0].html.match(/rotate\((-?[\d.]+)deg\)/)[1];
  assert.equal(rot, 240, 'nose along the stand\'s lead-in line, not toward the destination');
  assert.match(calls.markers[0].html, /src="\/logos\/map-plane-dh4\.svg" width="48" height="48"/);
  assert.deepEqual(map._fidsParkView, { lat: 46.11618, lng: -64.68663, zoom: 17, src: 'stand' });
  assert.equal(calls.fit, 1, 'sized for the zoom it is drawn at');
  assert.deepEqual(out, ['arc', 'marker']);
});

test('an empty stand is our gate with no aeroplane: the route dashed from the stand, one label, the camera on it', () => {
  const calls = { setView: null, arcs: [], rings: [], markers: [] };
  const map = { setView: (c, z) => { calls.setView = [c, z]; } };
  const L = {
    divIcon: (o) => o,
    marker: (ll, opts) => ({ addTo: () => { calls.markers.push({ ll, html: opts.icon.html, cls: opts.icon.className }); return 'label'; } }),
    circleMarker: (ll, opts) => ({ addTo: () => { calls.rings.push({ ll, fill: opts.fill }); return 'ring'; } }),
  };
  // v23916 — the camera goes exactly where the parked view would put it (the
  // middle of the board's own aeroplane on this stand, _gateParkPlace), so a
  // landing that arrives draws the aeroplane without the map moving; the
  // ring, the label and the route stay on the stand itself.
  let placed = null;
  const draw = new Function('L', '_gateMapShowOverlay', '_gcAddArc', '_gcNm', '_gateParkPlace',
    'return (' + fnSource('_gateDrawEmptyStand') + ')')(
    L, () => true, (m, a, b, opts) => { calls.arcs.push({ a, b, dash: opts.dashArray }); return 'arc'; }, gcNm,
    (spot, d) => { placed = [spot, d]; return { lat: 46.11618, lng: -64.68663, hdg: 240 }; });
  const stand = { lat: 46.11611, lng: -64.6868, zoom: 17, src: 'stand', ref: '1A', hdg: 240, kind: 'stop' };
  const out = draw(map, stand, [43.68, -79.62], 'To Toronto · 5:25am | À Toronto · 05:25');
  assert.deepEqual(placed, [stand, [43.68, -79.62]]);
  assert.deepEqual(calls.setView, [[46.11618, -64.68663], 17], 'camera where the parked view puts it, at the parked view\'s zoom');
  assert.deepEqual(calls.arcs, [{ a: [46.11611, -64.6868], b: [43.68, -79.62], dash: '8,6' }], 'the route runs from the stand toward Toronto, dashed');
  assert.deepEqual(calls.rings, [{ ll: [46.11611, -64.6868], fill: false }], 'a ring on the stand, not an aeroplane');
  assert.equal(calls.markers.length, 1);
  assert.equal(calls.markers[0].cls, 'gate-map-note-pin');
  assert.doesNotMatch(calls.markers[0].html, /map-plane-|<img/, 'no aircraft marker');
  assert.match(calls.markers[0].html, /^<div class="gate-map-note">To Toronto · 5:25am \| À Toronto · 05:25<\/div>$/);
  assert.deepEqual(map._fidsParkView, { lat: 46.11618, lng: -64.68663, zoom: 17, src: 'stand', empty: true });
  assert.deepEqual(out, ['arc', 'ring', 'label']);
  // The far end unknown: the stand and its label, no route.
  calls.arcs = [];
  draw(map, stand, null, 'x');
  assert.deepEqual(calls.arcs, []);
  // A placement that cannot be made leaves the camera on the stand.
  const bare = new Function('L', '_gateMapShowOverlay', '_gcAddArc', '_gcNm', '_gateParkPlace',
    'return (' + fnSource('_gateDrawEmptyStand') + ')')(L, () => true, () => 'arc', gcNm, () => { throw new Error('no'); });
  bare(map, stand, null, '');
  assert.deepEqual(calls.setView, [[46.11611, -64.6868], 17]);
});

test('an estimate map parks the aeroplane only on evidence, and with none shows our gate empty — never the route over its midpoint', () => {
  const mini = fnSource('initGateMap');
  const big = fnSource('_bigMapClone');
  assert.match(mini, /^function initGateMap\(org,dst,prog,waitAt,note\)/);
  assert.match(big, /^function _bigMapClone\(org,dst,prog,waitAt,note\)/);
  assert.match(mini, /var _parked = _preDep && !!waitAt;/);
  assert.match(mini, /var _empty = _preDep && !waitAt;/);
  assert.match(big, /var _bcParked = _bcPreDep && !!waitAt;/);
  assert.match(big, /var _bcEmpty = _bcPreDep && !waitAt;/);
  for (const [name, src] of [['mini', mini], ['big', big]]) {
    assert.match(src, /_gateDrawParkedEstimate\(/, name + ' draws the parked aeroplane');
    assert.match(src, /_gateDrawEmptyStand\(/, name + ' draws the empty stand');
    assert.doesNotMatch(src, /fitBounds\(\[o, d\]/, name + ' never frames the whole route (zoom 3 over Vermont)');
  }
  // Our own gate is always known: when the far end cannot be placed, a leg that
  // starts or ends here shows our stand (no route) before any world view.
  const own = mini.indexOf('_gateDrawEmptyStand(gateMap, _hSpot, null, note)');
  assert.ok(own > 0 && own < mini.indexOf('gateMap.setView([20, '), 'mini: our stand before the world view');
  assert.match(big, /else _gateDrawEmptyStand\(window\._bigCraftMap, _hSpot, null, note\);/);
  // The stand is always OURS: for an inbound leg that is the destination end.
  assert.match(mini, /var _stI = _hereIsDst \? dst : org, _stC = _hereIsDst \? d : o, _thC = _hereIsDst \? o : d;/);
  // v23916 — and the stand is the one the board's own aeroplane takes (its type picks it).
  // v23918 — through _gateOwnParkSpot: the same pick, moved to the stand the
  // apron deals this board where the apron is on (tests/gate-map-apron.test.js).
  assert.match(mini, /var _stSpot = _gateOwnParkSpot\(_stI, _stC\);/);
  assert.match(big, /var _bcSpot = _gateOwnParkSpot\(_bcStI, _bcStC\);/);
  assert.match(mini, /var _hSpot = _gateOwnParkSpot\(_hK, \[_hC\[0\], _hC\[1\]\]\);/);
  assert.match(big, /var _hSpot = _gateOwnParkSpot\(_hK, \[_hC\[0\], _hC\[1\]\]\);/);
  const ownSpot = fnSource('_gateOwnParkSpot');
  assert.match(ownSpot, /var ac = _mapPlaneSpec\(\);\s+var sp = _gateParkSpot\(iata, o, _gateOwnGateRef\(iata\), ac\);/);
  // No pin on the airport the map stands at; the far end keeps its pin.
  assert.match(mini, /var _pinlessO = \(_parked \|\| _empty\) && !_hereIsDst;/);
  assert.match(mini, /if \(!_pinlessO\) _estOv\.push\(L\.circleMarker\(o,/);
  assert.match(big, /if \(!_bcPinlessO\)\s+L\.circleMarker\(o,/);
  // A container resize keeps the camera on the stand; there is no route fit to go back to.
  assert.match(fnSource('_gateMapSettle'), /if \(p < 0\.02 && _pv\) gateMap\.setView\(\[_pv\.lat, _pv\.lng\], _pv\.zoom/);
  assert.match(fnSource('_bigMapSettle'), /if \(p < 0\.02 && pv\) m\.setView\(\[pv\.lat, pv\.lng\], pv\.zoom/);
  assert.doesNotMatch(fnSource('_gateMapSettle'), /fitBounds/);
  assert.doesNotMatch(fnSource('_bigMapSettle'), /fitBounds/);
  // A live fix retires the parked view, and the gate-file redraw never replaces a live map.
  assert.match(fnSource('initGateMapLive'), /delete gateMap\._fidsParkView; if \(window\._fidsGateRoute\) window\._fidsGateRoute\.wait = false;/);
  assert.match(mini, /\(r\.wait \|\| r\.empty\) && gateMap && gateMap\._fidsParkView && gateMap\._fidsLive !== true\) initGateMap\(org, dst, prog, waitAt, note\)/);
});

test('every map draws the one answer; nothing parks an aeroplane from the schedule', () => {
  const tick = fnSource('_gateMapTick');
  assert.match(tick, /_gateMapApply\(_gateAircraftWhere\(/);
  assert.match(CORE, /_bigMapClone\(_bcO, _bcD, ctx\.progress, ctx\.waiting, ctx\.note\);/);
  assert.match(CORE, /_bigMapCloneLive\(_bcO, _bcD, ctx\.pos\[1\], ctx\.pos\[0\], ctx\.fixAt\);/);
  assert.match(fnSource('_map3dFlightCtx'), /waiting: res\.kind === 'stand',/);
  // v23909's waiting rules read "has not departed" as "is standing here"; gone.
  for (const gone of ['_gateInboundWaitingAtOrigin', '_gateOutboundWaiting', '_gateInboundLandedHere']) {
    assert.ok(!CORE.includes(gone), gone + ' is gone');
  }
  // The home airport's stands are asked for before anything is drawn.
  assert.ok(tick.indexOf('_apGatesFor(window._gateIata)') < tick.indexOf("if (!mb || mb.offsetHeight < 10) return;"));
  assert.match(CORE, /window\._gateIata = iata;\s*\/\/ v23909[^\n]*\n\s*try \{ if \(iata && typeof _apGatesFor === 'function'\) _apGatesFor\(iata\); \}/);
});

test('parked is evidence: the feed\'s own words, an actual time — never the clock', () => {
  const T = Date.UTC(2026, 8, 27, 20, 0);
  const gone = lift('_gateLegGone', [], []);
  const raw = lift('_gateRawStatus', [], []);
  const rawLanded = new Function('_gateRawStatus', 'return (' + fnSource('_gateRawLanded') + ')')(raw);
  const landedAt = new Function('_gateLegGone', '_gateRawLanded', 'adbTs', '_GATE_DOWN_SEEN', '_gateRowKey',
    'return (' + fnSource('_gateLandedAt') + ')')(gone, rawLanded, (v) => Date.parse(v), {}, lift('_gateRowKey', [], []));
  assert.equal(landedAt({ status: 'arrived', _stInferred: false, _revTs: T - 10 * 60000 }, T), T - 10 * 60000, 'the feed says it landed');
  assert.equal(landedAt({ status: 'arrived', _stInferred: true, _sortTs: T - 40 * 60000 }, T), 0, 'the clock says it landed: not a landing');
  assert.equal(landedAt({ status: 'delayed', _actualArrTime: '2026-09-27T19:50:00Z' }, T), Date.parse('2026-09-27T19:50:00Z'));
  assert.equal(landedAt({ status: 'delayed' }, T), 0, 'a late leg with no revised time is still in the air');
  assert.equal(landedAt({ status: 'diverted', _actualArrTime: '2026-09-27T19:50:00Z' }, T), 0);
  const atGate = new Function('_gateRawStatus', 'return (' + fnSource('_gateOutboundAtGate') + ')')(raw);
  assert.equal(atGate({ status: 'boarding' }), true, 'our departure boarding, in the feed\'s words');
  assert.equal(atGate({ status: 'gateclosed', _stInferred: true }), false, 'the clock\'s "gate closed" is not');
  assert.equal(atGate({ status: 'Delayed' }), false, 'AC1987 at gate 1, delayed: says nothing about where its aeroplane is');
  assert.equal(atGate({ status: 'scheduled' }), false);
});

test('a gate file that failed to load is fetched again; only a 404 is final', async () => {
  const src = fnSource('_apGatesFor');
  const run = async (responses) => {
    let calls = 0, now = 1e12;
    const G = {}, W = {}, R = {};
    const fn = new Function('fetch', 'Date', '_AP_GATES', '_AP_GATES_WAIT', '_AP_GATES_RETRY', 'return (' + src + ')')(
      async () => { const r = responses[Math.min(calls++, responses.length - 1)]; if (r === 'throw') throw new Error('net'); return r; },
      { now: () => now }, G, W, R);
    const tick = () => new Promise((r) => setTimeout(r, 0));
    fn('YQM'); await tick(); await tick();
    const first = { cached: Object.prototype.hasOwnProperty.call(G, 'YQM'), calls };
    fn('YQM'); await tick();
    now += 6 * 60000; fn('YQM'); await tick(); await tick();
    return { first, calls, G };
  };
  const blip = await run(['throw', { status: 200, ok: true, json: async () => ({ iata: 'YQM' }) }]);
  assert.equal(blip.first.cached, false, 'a network error is not remembered as "no file"');
  assert.equal(blip.calls, 2, 'not retried at once, but retried after the pause');
  assert.deepEqual(blip.G.YQM, { iata: 'YQM' });
  const gone = await run([{ status: 404, ok: false }]);
  assert.equal(gone.first.cached, true);
  assert.equal(gone.G.YQM, null);
  assert.equal(gone.calls, 1, 'a 404 is final');
});

test('the gate poll asks Flightradar24 only while the leg can be flying', () => {
  const poll = fnSource('_gateNumbersPoll');
  const gate = poll.indexOf('var _legOpen = true;');
  const ask = poll.indexOf('_adsb = await _adsbTelemetry(');
  assert.ok(gate > 0 && ask > gate, 'the window is judged before the lookup');
  assert.match(poll, /if \(inb\.dest\) \{\s*var _outT = Math\.max\(inb\._revTs \|\| 0, inb\._sortTs \|\| 0\);\s*_legOpen = !_outT \|\| Date\.now\(\) >= _outT - 20 \* 60000;/,
    'the departing flight: from 20 minutes before it leaves');
  assert.match(poll, /_legOpen = _gateLegWindowOpen\(inb, iata\);/, 'an arrival: while its leg can be flying');
  assert.match(poll.slice(gate, ask), /if \(!_legOpen\) \{\s*try \{ window\._gateInboundLivePos = null; \} catch \(e\) \{\}\s*return;/,
    'no lookup, and no stale position left for the map');
});

test('both gate maps carry the OpenStreetMap credit', () => {
  const css = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
  const at = css.indexOf('v23909 — THE MAP CREDIT OPENSTREETMAP ASKS FOR');
  assert.ok(at > 0, 'the credit block exists');
  const rule = css.slice(at, css.indexOf('\n}', at) + 2);
  assert.match(rule, /#gateMapBox::before,\s*#bigCraftMap::after \{/, 'on the small map (::after is its veil) and the big one (::before is its halftone)');
  assert.match(rule, /content: '\\00A9  OpenStreetMap';/);
  assert.match(rule, /right: 4px;\s*bottom: 3px;/, 'bottom-right, clear of "Estimated position"');
  assert.match(rule, /pointer-events: none;/);
  assert.match(rule, /z-index: 10000;/, 'above the veil (9999) and the halftone (900)');
});

test('the builder drops a gate number OSM puts in two places, and splits "45/46"', () => {
  let out = null;
  try {
    const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'gates-'));
    fs.writeFileSync(path.join(tmp, 'ZZZ.json'), JSON.stringify([
      { type: 'node', lat: 40.0, lon: -73.0, tags: { aeroway: 'parking_position', ref: '1' } },
      { type: 'node', lat: 40.02, lon: -73.0, tags: { aeroway: 'parking_position', ref: '1' } },       // 2.2 km off: two gates 1
      { type: 'node', lat: 40.0, lon: -73.001, tags: { aeroway: 'gate', ref: '45/46' } },
      { type: 'node', lat: 40.0005, lon: -73.0, tags: { aeroway: 'parking_position', ref: '07' } },
      { type: 'node', lat: 40.0006, lon: -73.0001, tags: { aeroway: 'parking_position', ref: '7' } },  // 13 m: the same stand
      { type: 'way', center: { lat: 40.001, lon: -73.002 }, tags: { aeroway: 'terminal' } },
      // Stand 12 is its lead-in line, 100 m, drawn from the stop end outward; its door is 22 m past that end.
      { type: 'way', id: 12, tags: { aeroway: 'parking_position', ref: '12' }, geometry: [{ lat: 40.0021, lon: -73.0 }, { lat: 40.003, lon: -73.0 }] },
      { type: 'node', lat: 40.0019, lon: -73.0, tags: { aeroway: 'gate', ref: '12' } },
      { type: 'way', id: 13, tags: { aeroway: 'jet_bridge' }, geometry: [{ lat: 40.0019, lon: -73.0003 }, { lat: 40.0021, lon: -73.0002 }] },
    ]));
    out = execFileSync('python3', ['-c',
      'import importlib.util,json,sys\n' +
      's=importlib.util.spec_from_file_location("b",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n' +
      'print(json.dumps(m.build("ZZZ",{})))',
      path.join(root, 'scripts', 'gates', 'build-gates.py')], { encoding: 'utf8', env: { ...process.env, GATES_CACHE: tmp } });
  } catch (e) { out = null; }
  if (!out) return;   // no python3 on this machine
  const f = JSON.parse(out);
  assert.equal(f.stands['1'], undefined, 'a number in two places is left out, not guessed');
  assert.deepEqual(f.ambiguous, { stands: ['1'] });
  assert.deepEqual(f.stands['7'], [40.0005, -73.0], 'two nodes 13 m apart are one stand');
  assert.ok(f.gates['45'] && f.gates['46'], '"45/46" names both gates');
  assert.equal(f.terminals.length, 1);
  assert.equal(f.license, 'ODbL-1.0');
  assert.deepEqual(f.stands['12'], [40.0021, -73.0, 180], 'a line is stored as its end at the door, nose pointing on along it');
  assert.deepEqual(f.door_stands['12'], ['12'], 'door 12 boards stand 12');
  assert.deepEqual(f.bridged, ['12'], 'the jet bridge reaches stand 12 only');
});

test('the aircraft sky turns to night at the real sunset, like the weather card', () => {
  const src = fnSource('_acSkyIsNight');
  assert.match(src, /if \(ia && typeof _wxNightAt === 'function'\) return !!_wxNightAt\(ia\);/, 'the same sunrise/sunset the weather card uses');
  const sky = (night) => new Function('window', '_wxNightAt', 'AP', 'return (' + src + ')')({ _gateIata: 'YQM' }, (ia) => { assert.equal(ia, 'YQM'); return night; }, {});
  assert.equal(sky(true)(), true, '20:12 in Moncton, sun down at 19:06: night');
  assert.equal(sky(false)(), false);
});

test('a map whose route layer was measured at zero size is re-measured (the white smear)', () => {
  const heal = lift('_mapHealRenderer', [], []);
  const mk = (svgW, svgH, mapW) => {
    const calls = [];
    const svg = { getAttribute: (k) => ({ width: String(svgW), height: String(svgH) })[k] };
    const c = { isConnected: true, clientWidth: 288, clientHeight: 287, querySelector: () => svg };
    const m = {
      _loaded: true, getContainer: () => c, getSize: () => ({ x: mapW, y: 287 }),
      invalidateSize: () => calls.push('invalidate'),
      eachLayer: (fn) => fn({ _renderer: { _svgSize: { x: 0, y: 0 }, _update() { calls.push('renderer:' + (this._svgSize === null ? 'forgot' : 'kept')); } } }),
      fire: (e) => calls.push(e),
    };
    return { m, calls };
  };
  const smear = mk(0, 0, 288);                    // what gate 1 measured: svg 0x0 on a 288 px map
  assert.equal(heal(smear.m), true);
  assert.deepEqual(smear.calls, ['invalidate', 'renderer:forgot', 'moveend'], 'the renderer forgets its size so it rewrites the svg');
  const ok = mk(346, 344, 288);                   // a healthy overlay is 1.2x the map
  assert.equal(heal(ok.m), false);
  assert.deepEqual(ok.calls, [], 'a healthy map is left alone');
  const hidden = mk(0, 0, 0);
  hidden.m.getContainer().clientWidth = 0;
  assert.equal(heal(hidden.m), false, 'a hidden map is not touched');
  assert.match(CORE, /setInterval\(function \(\) \{\s*try \{ if \(typeof gateMap !== 'undefined'\) _mapHealRenderer\(gateMap\); \} catch \(e\) \{\}\s*try \{ _mapHealRenderer\(window\._bigCraftMap\); \} catch \(e\) \{\}\s*\}, 2000\);/);
  assert.match(fnSource('_gateMapWatchResize'), /gateMap\.invalidateSize\(\); _mapHealRenderer\(gateMap\);/);
});
