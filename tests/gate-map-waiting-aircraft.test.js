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
        assert.ok(Array.isArray(p) && p.length === 2 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180, f + ' ' + k + ' is a point');
      }
    }
    assert.ok(Array.isArray(g.terminals), f + ' lists terminals');
    assert.equal(g.license, 'ODbL-1.0', f + ' states its licence');
    assert.match(g.license_url, /opendatacommons\.org\/licenses\/odbl/, f + ' links it');
    assert.equal(typeof g.ambiguous, 'object', f + ' records the refs it could not pin to one place');
  }
});

test('the waiting aeroplane stands at its gate, else the terminal, else the airport', () => {
  const o = [46.11, -64.68];
  const spot = (files) => lift('_gateParkSpot', ['_apGatesFor', '_gateRefNorm', '_gcNm'], [(k) => files[k] || null, norm, gcNm]);
  const at = spot({ YQM });
  assert.deepEqual(at('YQM', o, '1'), { lat: YQM.stands['1A'][0], lng: YQM.stands['1A'][1], zoom: 15, src: 'stand' }, 'gate 1 boards from stand 1A, at its door');
  assert.deepEqual(at('YQM', o, '2'), { lat: YQM.stands['2'][0], lng: YQM.stands['2'][1], zoom: 15, src: 'stand' }, 'its own stand, not the nearer stand 3');
  assert.deepEqual(at('YQM', o, '3'), { lat: YQM.stands['3'][0], lng: YQM.stands['3'][1], zoom: 15, src: 'stand' });
  assert.deepEqual(at('YQM', o, '9'), { lat: YQM.terminals[0][0], lng: YQM.terminals[0][1], zoom: 14, src: 'terminal' }, 'no such gate: the only terminal');
  assert.deepEqual(at('YQM', o, ''), { lat: YQM.terminals[0][0], lng: YQM.terminals[0][1], zoom: 14, src: 'terminal' }, 'another airport\'s aeroplane has no gate here');
  assert.deepEqual(at('YYZ', [43.68, -79.62], ''), { lat: 43.68, lng: -79.62, zoom: 12, src: 'airport' }, 'no file: the airport, far enough out');
  // A stand 5 nm or more from the airport is another airport's.
  const far = spot({ YQM: { stands: { 1: [45.9, -64.3] }, gates: {}, terminals: [] } });
  assert.equal(far('YQM', o, '1').src, 'airport');
  // Multiple terminals and no stand: the airport, not a guessed terminal.
  const two = spot({ YQM: { stands: {}, gates: {}, terminals: [[46.115, -64.688], [46.105, -64.67]] } });
  assert.equal(two('YQM', o, '1').src, 'airport');
});

test('the door is the authority: a same-numbered stand elsewhere on the field is never used', () => {
  const spot = (file, ap) => lift('_gateParkSpot', ['_apGatesFor', '_gateRefNorm', '_gcNm'], [() => file, norm, gcNm])('JFK', ap, '36');
  const ap = [40.64, -73.78];
  const door = [40.6452, -73.7897];                 // T8's door 36
  const t4stand36 = [40.6436, -73.7700];            // T4's stand "36", ~1.7 km away
  // The far stand loses to the door itself.
  assert.deepEqual(spot({ stands: { 36: t4stand36 }, gates: { 36: door }, terminals: [] }, ap), { lat: door[0], lng: door[1], zoom: 15, src: 'gate' });
  // A stand AT the door (any number) wins over the door.
  const atDoor = [40.6456, -73.7893];               // ~55 m
  assert.deepEqual(spot({ stands: { 36: t4stand36, 7: atDoor }, gates: { 36: door }, terminals: [] }, ap), { lat: atDoor[0], lng: atDoor[1], zoom: 15, src: 'stand' });
  // No door on record: a same-numbered stand only if it sits at a terminal or a door.
  const cargo = spot({ stands: { 36: t4stand36 }, gates: {}, terminals: [[40.6452, -73.7897]] }, ap);
  assert.equal(cargo.src, 'terminal', 'a lone stand 1.7 km from any terminal is not a gate');
  const ok = spot({ stands: { 36: t4stand36 }, gates: {}, terminals: [[40.6440, -73.7705]] }, ap);
  assert.deepEqual(ok, { lat: t4stand36[0], lng: t4stand36[1], zoom: 15, src: 'stand' });
});

test('only the board\'s own airport uses the board\'s gate', () => {
  const own = (iata, cf, sub) => new Function('window', 'subScreenVal', 'return (' + fnSource('_gateOwnGateRef') + ')')({ _gateIata: iata, _gateCurrentFlight: cf }, sub);
  assert.equal(own('YQM', { gate: '1' }, '4')('YQM'), '1');
  assert.equal(own('YQM', { gate: '' }, '4')('yqm'), '4', 'the screen\'s gate when the flight carries none');
  assert.equal(own('YQM', { gate: '1' }, '4')('YYZ'), '', 'an inbound\'s origin is not our gate');
});

test('the parked estimate draws the aeroplane at the spot, the route dashed from it, the camera on it', () => {
  const calls = { setView: null, arcs: [], markers: [] };
  const map = { setView: (c, z) => { calls.setView = [c, z]; } };
  const L = {
    divIcon: (o) => o,
    marker: (ll, opts) => ({ addTo: () => { calls.markers.push({ ll, html: opts.icon.html }); return 'marker'; } }),
  };
  const draw = new Function('L', '_gateMapShowOverlay', '_gcAddArc', '_gcNm', '_gateHeading', '_mapPlaneIcon',
    'return (' + fnSource('_gateDrawParkedEstimate') + ')')(
    L, () => true, (m, a, b, opts) => { calls.arcs.push({ a, b, dash: opts.dashArray }); return 'arc'; }, gcNm, (b) => b, () => '/logos/map-plane-jet.png');
  const out = draw(map, { lat: 46.11611, lng: -64.6868, zoom: 15, src: 'stand' }, [43.68, -79.62]);
  assert.deepEqual(calls.setView, [[46.11611, -64.6868], 15], 'camera on the aeroplane at stand zoom');
  assert.deepEqual(calls.arcs, [{ a: [46.11611, -64.6868], b: [43.68, -79.62], dash: '8,6' }], 'the route starts at the aeroplane, dashed');
  assert.equal(calls.markers.length, 1);
  assert.deepEqual(calls.markers[0].ll, [46.11611, -64.6868]);
  const rot = +calls.markers[0].html.match(/rotate\((-?[\d.]+)deg\)/)[1];
  assert.ok(rot < -80 && rot > -110, 'nose toward Toronto (west), got ' + rot);
  assert.deepEqual(map._fidsParkView, { lat: 46.11611, lng: -64.6868, zoom: 15, src: 'stand' });
  assert.deepEqual(out, ['arc', 'marker']);
});

test('an estimate map parks the aeroplane only on evidence; "unknown" keeps the route view', () => {
  const mini = fnSource('initGateMap');
  const big = fnSource('_bigMapClone');
  assert.match(mini, /^function initGateMap\(org,dst,prog,waitAt\)/);
  assert.match(big, /^function _bigMapClone\(org,dst,prog,waitAt\)/);
  assert.match(mini, /var _parked = _preDep && !!waitAt;/);
  assert.match(big, /var _bcParked = _bcPreDep && !!waitAt;/);
  for (const [name, src] of [['mini', mini], ['big', big]]) {
    assert.match(src, /_gateDrawParkedEstimate\(/, name + ' draws the waiting aeroplane');
    assert.match(src, /_gateParkSpot\(org, o, _gateOwnGateRef\(org\)\)/, name + ' asks where it waits');
    assert.match(src, /fitBounds\(\[o, d\]/, name + ' still fits the route when nothing says the aeroplane waits');
  }
  // The origin pin is the aeroplane while it waits; its label sat over the aircraft.
  assert.match(mini, /if \(!_parked\) _estOv\.push\(L\.circleMarker\(o,/);
  assert.match(big, /if \(!_bcParked\)\s+L\.circleMarker\(o,/);
  // A container resize keeps the camera on the waiting aeroplane.
  assert.match(fnSource('_gateMapSettle'), /if \(p < 0\.02 && _pv\) gateMap\.setView\(\[_pv\.lat, _pv\.lng\], _pv\.zoom/);
  assert.match(fnSource('_bigMapSettle'), /if \(p < 0\.02 && pv\) m\.setView\(\[pv\.lat, pv\.lng\], pv\.zoom/);
  // A live fix retires the waiting view, and the gate-file redraw never replaces a live map.
  assert.match(fnSource('initGateMapLive'), /delete gateMap\._fidsParkView; if \(window\._fidsGateRoute\) window\._fidsGateRoute\.wait = false;/);
  assert.match(mini, /r\.wait && gateMap && gateMap\._fidsParkView && gateMap\._fidsLive !== true\) initGateMap\(org, dst, prog, waitAt\)/);
});

test('every caller says why the aeroplane is waiting, or passes nothing', () => {
  const tick = fnSource('_gateMapTick');
  assert.match(tick, /phase = 'at-gate';[\s\S]{0,260}waitAt = _gateInboundLandedHere\(inb, _liveGrounded\);/, 'at our gate: only on a real landing');
  assert.match(tick, /phase = 'pre';[\s\S]{0,160}waitAt = _gateInboundWaitingAtOrigin\(inb, now\);/, 'at its origin: only before it is due off');
  assert.match(tick, /phase = 'no-inbound-out';[\s\S]{0,160}waitAt = _gateOutboundWaiting\(cf, now\);/);
  assert.match(tick, /var progKey = phase \+ \(waitAt \? '\+wait' : ''\) \+ '\|' \+ progBucket;/, 'a change in the evidence redraws');
  assert.match(tick, /initGateMap\(routeOrg, routeDst, renderProg, waitAt\);/);
  assert.match(CORE, /var _pinWait = _arrHere \? _gateInboundLandedHere\(inb\) : _gateInboundWaitingAtOrigin\(inb\);/);
  assert.match(CORE, /initGateMap\(apIata, dstIata \|\| apIata, -1, _pinWait\);/);
  assert.match(CORE, /initGateMap\(inb\._locIata, apIata, -1, _pinWait\);/);
  assert.match(CORE, /initGateMap\(apIata, dstIata, -1, _outWait\);/);
  assert.match(CORE, /_bigMapClone\(_bcO, _bcD, ctx\.progress, ctx\.waiting\);/);
  assert.match(fnSource('_map3dFlightCtx'), /return !fixOk && prog <= 0\.02 && \(_legOut \? _gateOutboundWaiting\(inb\) : _gateInboundWaitingAtOrigin\(inb\)\);/);
  // The home airport's stands are asked for before anything is drawn.
  assert.ok(tick.indexOf('_apGatesFor(window._gateIata)') < tick.indexOf("if (!mb || mb.offsetHeight < 10) return;"));
  assert.match(CORE, /window\._gateIata = iata;\s*\/\/ v23909[^\n]*\n\s*try \{ if \(iata && typeof _apGatesFor === 'function'\) _apGatesFor\(iata\); \}/);
});

test('waiting is evidence: late, unconfirmed, cancelled and diverted legs are not "waiting"', () => {
  const T = Date.UTC(2026, 8, 27, 20, 0);
  const iso = (ms) => new Date(ms).toISOString();
  const AP_C = { YYC: [51.12, -114.01], YQM: [46.11, -64.68] };
  const mk = (name, air) => new Function('fidsInboundAirborne', 'adbTs', '_gateLegGone', '_lookupAirport', '_gcNm', 'window', 'return (' + fnSource(name) + ')')(
    () => air, (v) => Date.parse(v), lift('_gateLegGone', [], []), (k) => AP_C[k] || null, gcNm, { _gateIata: 'YQM' });
  const atOrigin = mk('_gateInboundWaitingAtOrigin', false);
  assert.equal(atOrigin({ status: 'scheduled', _depSchedLocal: iso(T + 30 * 60000) }, T), true, 'due off in 30 min: waiting');
  assert.equal(atOrigin({ status: 'delayed', _depSchedLocal: iso(T - 60 * 60000) }, T), false, 'an hour past its departure, unconfirmed: not known to be waiting');
  assert.equal(atOrigin({ status: 'cancelled', _depSchedLocal: iso(T + 30 * 60000) }, T), false);
  assert.equal(atOrigin({ status: 'diverted', _depSchedLocal: iso(T + 30 * 60000) }, T), false);
  assert.equal(atOrigin({ status: 'enroute', _depSchedLocal: iso(T + 30 * 60000) }, T), false);
  assert.equal(atOrigin({ status: 'scheduled' }, T), false, 'no departure or arrival time: unknown');
  // No departure time on the row (YQM's arrival feed has none): judged from the arrival.
  assert.equal(atOrigin({ status: 'scheduled', _locIata: 'YYC', _sortTs: T + 21 * 3600000 }, T), true,
    'tomorrow\'s WS812 lands in 21 h: it has not left Calgary');
  assert.equal(atOrigin({ status: 'scheduled', _locIata: 'YYC', _sortTs: T + 2 * 3600000 }, T), false,
    'lands in 2 h on a 4.5 h leg: it may well be flying, so not "waiting"');
  assert.equal(mk('_gateInboundWaitingAtOrigin', true)({ status: 'scheduled', _depSchedLocal: iso(T + 30 * 60000) }, T), false, 'the feed says it is flying');
  const here = new Function('_gateLegGone', 'return (' + fnSource('_gateInboundLandedHere') + ')')(lift('_gateLegGone', [], []));
  assert.equal(here({ status: 'arrived' }), true);
  assert.equal(here({ status: 'delayed', _actualArrTime: '2026-09-27T19:50' }), true);
  assert.equal(here({ status: 'delayed' }, true), true, 'a live fix on the ground here');
  assert.equal(here({ status: 'delayed' }, false), false, 'the clock alone is not a landing');
  assert.equal(here({ status: 'diverted', _actualArrTime: 'x' }), false);
  const out = new Function('_gateLegGone', 'return (' + fnSource('_gateOutboundWaiting') + ')')(lift('_gateLegGone', [], []));
  assert.equal(out({ status: 'Delayed', _sortTs: T + 60 * 60000 }, T), true, 'AC1987 at gate 1, delayed');
  assert.equal(out({ status: 'departed', _sortTs: T - 5 * 60000 }, T), false);
  assert.equal(out({ status: 'scheduled', _sortTs: T - 30 * 60000 }, T), false, 'long past its time');
  assert.equal(out({ status: 'cancelled', _sortTs: T + 60 * 60000 }, T), false);
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
});

test('the aircraft sky turns to night at the real sunset, like the weather card', () => {
  const src = fnSource('_acSkyIsNight');
  assert.match(src, /if \(ia && typeof _wxNightAt === 'function'\) return !!_wxNightAt\(ia\);/, 'the same sunrise/sunset the weather card uses');
  const sky = (night) => new Function('window', '_wxNightAt', 'AP', 'return (' + src + ')')({ _gateIata: 'YQM' }, (ia) => { assert.equal(ia, 'YQM'); return night; }, {});
  assert.equal(sky(true)(), true, '20:12 in Moncton, sun down at 19:06: night');
  assert.equal(sky(false)(), false);
});
