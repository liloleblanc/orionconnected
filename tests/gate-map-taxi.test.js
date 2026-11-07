'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24105 — IT LANDS ON ITS RUNWAY, ROLLS OUT AND TAXIS TO THE GATE.
//
// Orlando gate 42, UA2779 from Newark, 2026-10-31 about 21:33-21:40 EDT: the
// map held the aeroplane over East Lake Tohopekaliga, then 315 ft short of
// the field, then put it on the runway and at the gate within ten seconds.
//
//   1. Of Orlando's four parallel runways (359.39° to 359.54° by survey) the
//      smallest heading difference always chose 36L. UA2779 was 36 m off
//      35R's centreline 8.3 nm out; routed to 36L, 4 km west, it was not
//      "established" there and waited 2.2 nm short of a runway it never
//      landed on. Of the ends facing the way in, the aeroplane now gets the
//      one whose extended centreline it is nearest (or on).
//   2. An established (or converging) arrival is carried to touchdown, 450 m
//      in, and the roll-out and taxi take it on: off at a real exit, along the
//      airport's taxiways (fids-current/data/taxi/<IATA>.json, OpenStreetMap,
//      scripts/gates/build-taxi.py) to the stand the parked view uses.
//   3. The feed's Arrived plays the same roll-out and taxi from its time, and
//      a fix on the ground re-times it; the marker is flown on from where it
//      is drawn, never planted.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) return CORE.slice(at, i + 1);
  }
  throw new Error('no end for ' + name);
}
const RWCTX = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'airport-runways.js'), 'utf8').replace('var AIRPORT_RUNWAYS', 'this.AIRPORT_RUNWAYS'), RWCTX);
const RUNWAYS = RWCTX.AIRPORT_RUNWAYS;
const COORDS = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'airport-coords.js'), 'utf8'), { window: w }); return w.AIRPORT_COORDS; })();
const NAMES = ['_gcNm', '_gcBrgDeg', '_gcDestPt', '_gcFullRoute', '_runwayFinalPath', '_gateOnFinal',
  '_taxiXY', '_taxiLL', '_taxiGraph', '_taxiNear', '_taxiDijkstra', '_taxiRunway', '_taxiRound', '_taxiProfile',
  '_taxiPlan', '_taxiSAtT', '_taxiIdx', '_taxiVAtS', '_taxiAtS', '_taxiPrefix'];
const lib = (trk) => new Function('AIRPORT_RUNWAYS', '_gateHeading', NAMES.map(fnSource).join('\n') +
  '\nreturn {' + NAMES.map((n) => n.replace(/^_/, '') + ':' + n).join(',') + '};')(RUNWAYS, trk === undefined ? undefined : () => trk);
const G = lib();
const MCO = COORDS.MCO;
const UA2779 = [28.2807, -81.281];   // 01:32:40Z, 2,650 ft, 8.3 nm south of 35R
const taxiFile = (ap) => JSON.parse(fs.readFileSync(path.join(ROOT, 'fids-current', 'data', 'taxi', ap + '.json'), 'utf8'));
const gateFile = (ap) => JSON.parse(fs.readFileSync(path.join(ROOT, 'fids-current', 'data', 'gates', ap + '.json'), 'utf8'));
const ends = (ap) => {
  const out = [];
  for (const r of RUNWAYS[ap]) { const a = [r[0], r[1]], b = [r[2], r[3]]; out.push({ t: a, f: b }, { t: b, f: a }); }
  out.forEach((e) => { e.hdg = G.gcBrgDeg(e.t, e.f); });
  return out;
};
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

test('UA2779 is routed to 35R, the runway it was lined up with, and is established on it', () => {
  const r = G.runwayFinalPath(UA2779, MCO, 'MCO');
  assert.ok(r && r.rw, 'a runway final, carrying its runway');
  assert.ok(same(r.rw.t, [28.4189, -81.2823]), '35R threshold, not 36L: ' + r.rw.t);
  assert.ok(same(r[r.length - 2], [28.4189, -81.2823]), 'and the route lands there');
  assert.equal(G.gateOnFinal(UA2779, r[r.length - 2], r[r.length - 1], 2650), true, 'established: carried on to touchdown');
});

test('at every airport, a fix 8 or 4 nm out on any parallel runway\'s final lands on that runway', () => {
  let n = 0;
  const wrong = [];
  for (const ap of Object.keys(RUNWAYS)) {
    if (RUNWAYS[ap].length < 2 || !COORDS[ap]) continue;
    const E = ends(ap);
    for (const e of E) {
      if (!E.some((o) => o !== e && Math.abs(((o.hdg - e.hdg + 540) % 360) - 180) <= 3)) continue;
      for (const nm of [8, 4]) {
        const r = G.runwayFinalPath(G.gcDestPt(e.t, (e.hdg + 180) % 360, nm), COORDS[ap], ap);
        if (!r) continue;
        n++;
        if (!same(r.rw.t, e.t)) wrong.push(ap + ' ' + e.hdg.toFixed(1) + '° ' + nm + ' nm');
      }
    }
  }
  assert.ok(n > 2000, 'the whole table: ' + n);
  assert.deepEqual(wrong, [], 'every one on its own runway (main sent 1,254 of 2,336 elsewhere)');
});

test('the direction is still the bearing\'s: abeam the field and on a downwind nothing changes', () => {
  // the choice before v24105: the smallest heading difference, nothing else
  const old = (pl, ap) => {
    const inb = G.gcBrgDeg(pl, COORDS[ap]);
    let best = null;
    for (const e of ends(ap)) { const d = Math.abs(((inb - e.hdg + 540) % 360) - 180); if (!best || d < best.d) best = { e, d }; }
    return best.e.hdg;
  };
  for (const ap of ['MCO', 'ORD', 'DFW', 'YYZ', 'ATL', 'LAX', 'DEN', 'SLC']) {
    if (!RUNWAYS[ap]) continue;
    for (let brg = 0; brg < 360; brg += 15) {
      const pl = G.gcDestPt(COORDS[ap], brg, 6);
      const r = G.runwayFinalPath(pl, COORDS[ap], ap);
      if (!r) continue;
      const onAny = ends(ap).some((e) => {
        const d = G.gcNm(e.t, pl), b = (G.gcBrgDeg(e.t, pl) - e.hdg) * Math.PI / 180;
        return -d * Math.cos(b) > 0.3 && Math.abs(d * Math.sin(b)) < 0.3;
      });
      if (onAny) continue;   // on an extended centreline: that runway (tested above)
      const dh = Math.abs(((r.rw.hdg - old(pl, ap) + 540) % 360) - 180);
      assert.ok(dh <= 3, ap + ' from ' + brg + '°: lands ' + r.rw.hdg.toFixed(1) + '° as before (' + old(pl, ap).toFixed(1) + '°)');
    }
  }
  // a southbound downwind passing 35L's extended centreline is not put on 35L
  const down = lib(180);
  const pl = G.gcDestPt([28.4081, -81.2956], 180, 5);
  const r = down.runwayFinalPath(pl, MCO, 'MCO');
  const plain = G.runwayFinalPath(pl, MCO, 'MCO');
  assert.ok(same(plain.rw.t, [28.4081, -81.2956]), 'with no track it is 35L (on its centreline)');
  assert.equal(r.rw.hdg, old(pl, 'MCO'), 'tracking 180°, the choice is the old one');
  assert.ok(!same(r.rw.t, [28.4081, -81.2956]));
});

test('touchdown is 450 m in (18% of a short runway), and the route says which runway', () => {
  const r = G.runwayFinalPath(UA2779, MCO, 'MCO');
  const td = G.gcNm(r[r.length - 2], r[r.length - 1]) * 1852;
  assert.ok(Math.abs(td - 450) < 1, 'touchdown ' + td.toFixed(1) + ' m past the threshold');
  const thr = [28.4189, -81.2823], hdg = G.gcBrgDeg(thr, [28.4437, -81.2826]);
  const flare = G.runwayFinalPath(G.gcDestPt(thr, hdg, 0.1), MCO, 'MCO');
  assert.ok(flare && flare.rw && flare.rw.past === true, 'a fix over the runway is past the threshold');
  assert.equal(flare.length, 2);
  // a 1,829 m runway touches down at 18%
  const yqm = G.runwayFinalPath(G.gcDestPt([46.1078, -64.66285], 268, 5), [46.1122, -64.6786], 'YQM');
  const len = G.gcNm(yqm.rw.t, yqm.rw.f) * 1852, tdY = G.gcNm(yqm[yqm.length - 2], yqm[yqm.length - 1]) * 1852;
  assert.ok(Math.abs(tdY - Math.min(450, 0.18 * len)) < 1);
});

test('Orlando gate 42 from 35R: down the runway, off at an exit, along the taxiways to the stand', () => {
  const tf = taxiFile('MCO'), gf = gateFile('MCO');
  assert.equal(tf.license, 'ODbL-1.0');
  assert.match(tf.copyright, /OpenStreetMap/);
  const g = G.taxiGraph(tf);
  const st = gf.stands['42'];
  const end = { lat: st[0], lng: st[1], hdg: st[2] };
  const rw = { t: [28.4189, -81.2823], f: [28.4437, -81.2826] };
  const p = G.taxiPlan(g, rw, end, {});
  assert.ok(p, 'a route');
  const hdg = G.gcBrgDeg(rw.t, rw.f);
  // starts at touchdown, 450 m in, and ends on the stand at its heading
  const tdOff = G.gcNm(rw.t, p.pts[0]) * 1852;
  assert.ok(Math.abs(tdOff - 450) < 40, 'touchdown ' + tdOff.toFixed(0) + ' m in');
  assert.ok(G.gcNm(p.pts[p.pts.length - 1], [end.lat, end.lng]) * 1852 < 1, 'ends on the stand');
  assert.equal(p.hdg, 286.9);
  // the roll-out runs straight down the runway, the landing way, to the exit
  for (let i = 1; i < p.pts.length && p.s[i] < p.rollEnd - 80; i++) {
    const b = G.gcBrgDeg(p.pts[i - 1], p.pts[i]);
    if (G.gcNm(p.pts[i - 1], p.pts[i]) * 1852 < 0.5) continue;
    assert.ok(Math.abs(((b - hdg + 540) % 360) - 180) < 3, 'rolling ' + b.toFixed(1) + '° at ' + p.s[i].toFixed(0) + ' m');
  }
  assert.ok(p.rollEnd > 900 && p.rollEnd < 2200, 'off the runway ' + p.rollEnd.toFixed(0) + ' m on');
  // every point after the runway is on the taxiway network (or the last few metres into the stand)
  const xy = (q) => G.taxiXY(q, g.o);
  for (let i = 0; i < p.pts.length; i += 5) {
    if (p.s[i] <= p.rollEnd || p.total - p.s[i] < 60) continue;
    const near = G.taxiNear(g, xy(p.pts[i]));
    assert.ok(near.d < 40, 'on a taxiway at ' + p.s[i].toFixed(0) + ' m: ' + near.d.toFixed(1) + ' m off');
  }
  // speeds: 136 kt at touchdown, never faster, slowing to a stop; time only goes forward
  assert.ok(Math.abs(p.v[0] - 70) < 0.01);
  assert.ok(Math.max(...p.v) <= 70.001);
  assert.equal(p.v[p.v.length - 1], 0);
  for (let i = 1; i < p.t.length; i++) assert.ok(p.t[i] > p.t[i - 1]);
  const taxiV = p.v.filter((v, i) => p.s[i] > p.rollEnd + 50);
  assert.ok(Math.max(...taxiV) <= 10.31, 'taxiing at no more than 20 kt');
  assert.ok(p.tEnd > 240 && p.tEnd < 900, 'touchdown to stand ' + (p.tEnd / 60).toFixed(1) + ' min');
});

test('Moncton: every runway end reaches gates 1 to 4, a turboprop off sooner than a jet', () => {
  const tf = taxiFile('YQM'), gf = gateFile('YQM'), g = G.taxiGraph(tf);
  for (const gate of ['1', '2', '3', '4']) {
    const ref = (gf.door_stands[gate] || [gate])[0], st = gf.stands[ref] || gf.gates[gate];
    assert.ok(st, 'gate ' + gate);
    for (const e of ends('YQM')) {
      const jet = G.taxiPlan(g, e, { lat: st[0], lng: st[1], hdg: st[2] }, {});
      assert.ok(jet, 'gate ' + gate + ' from ' + e.hdg.toFixed(0) + '°');
      const prop = G.taxiPlan(g, e, { lat: st[0], lng: st[1], hdg: st[2] }, { prop: true });
      assert.ok(prop && prop.rollEnd <= jet.rollEnd + 1, 'a Dash 8 is off no later than a jet');
    }
  }
});

test('a fix on the ground on the runway rolls out from there; on a taxiway it taxis from there', () => {
  const tf = taxiFile('MCO'), gf = gateFile('MCO'), g = G.taxiGraph(tf), st = gf.stands['42'];
  const end = { lat: st[0], lng: st[1], hdg: st[2] };
  const rw = { t: [28.4189, -81.2823], f: [28.4437, -81.2826] };
  const onRw = G.gcDestPt(rw.t, G.gcBrgDeg(rw.t, rw.f), 0.5);
  const a = G.taxiPlan(g, rw, end, { from: { ll: onRw, v: 50, trk: 359.4 } });
  assert.ok(a && G.gcNm(a.pts[0], onRw) * 1852 < 1 && Math.abs(a.v[0] - 50) < 0.01, 'rolling at 97 kt from the fix');
  const b = G.taxiPlan(g, rw, end, { from: { ll: onRw, v: 50, trk: 179.4 } });
  assert.ok(!b || b.rollEnd === 0, 'never rolled out against its own track');
  const tw = _onTaxiway(g, tf);
  const c = G.taxiPlan(g, rw, end, { from: { ll: tw, v: 8 } });
  assert.ok(c && c.rollEnd === 0 && G.gcNm(c.pts[0], tw) * 1852 < 1, 'taxiing on from a taxiway');
});
function _onTaxiway(g, tf) {
  // the middle of the longest taxiway (kind 0) edge
  let best = null;
  for (const w of tf.ways) {
    if (w[0] !== 0) continue;
    for (let j = 1; j < w.length - 1; j++) {
      const a = tf.nodes[w[j]], b = tf.nodes[w[j + 1]], d = G.gcNm(a, b);
      if (!best || d > best.d) best = { d, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    }
  }
  return best.p;
}

test('along a plan: distance at a time, spot at a distance, and a prefix that keeps the times', () => {
  const tf = taxiFile('MCO'), gf = gateFile('MCO'), g = G.taxiGraph(tf), st = gf.stands['42'];
  const p = G.taxiPlan(g, { t: [28.4189, -81.2823], f: [28.4437, -81.2826] }, { lat: st[0], lng: st[1], hdg: st[2] }, {});
  for (const t of [0, 10, 60, 200, p.tEnd - 5]) {
    const s = G.taxiSAtT(p, t), i = G.taxiIdx(p, s);
    assert.ok(p.t[i] <= t + 1e-6 && (i + 1 >= p.t.length || p.t[i + 1] >= t - 1e-6), 't ' + t);
  }
  assert.equal(G.taxiSAtT(p, -5), 0);
  assert.equal(G.taxiSAtT(p, p.tEnd + 100), p.total);
  assert.ok(Math.abs(G.taxiAtS(p, p.total).hdg - 286.9) < 0.5, 'nose on the stand\'s heading at the end');
  const held = G.gcDestPt([28.4189, -81.2823], 179.4, 2);   // held 2 nm short
  const q = G.taxiPrefix(p, [held], 70);
  assert.ok(G.gcNm(q.pts[0], held) * 1852 < 1, 'starts where the marker is');
  assert.ok(Math.abs(q.total - p.total - 2 * 1852 - 450) < 60, 'the way to touchdown added');
  assert.ok(q.t[0] < -40 && q.t[0] > -70, 'flown before touchdown: ' + q.t[0].toFixed(1) + ' s');
  assert.equal(q.tEnd, p.tEnd, 'touchdown still t = 0');
});

test('every airport with a gate file has its taxiway network, ODbL-credited and well formed', () => {
  const gates = fs.readdirSync(path.join(ROOT, 'fids-current', 'data', 'gates')).filter((n) => n.endsWith('.json'));
  const dir = path.join(ROOT, 'fids-current', 'data', 'taxi');
  const have = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  assert.ok(have.length >= gates.length - 2, have.length + ' of ' + gates.length + ' (YDF: none mapped)');
  for (const n of have) {
    const f = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
    assert.equal(f.iata + '.json', n);
    assert.equal(f.license, 'ODbL-1.0');
    assert.equal(f.attribution_url, 'https://www.openstreetmap.org/copyright');
    assert.ok(f.nodes.length > 10 && f.ways.length > 0);
    for (const w of f.ways) {
      assert.ok([0, 1, 2].includes(w[0]), n + ' way kind');
      for (let j = 1; j < w.length; j++) assert.ok(w[j] >= 0 && w[j] < f.nodes.length, n + ' node index');
    }
    for (const i of f.rwn) assert.ok(i >= 0 && i < f.nodes.length);
    assert.ok(fs.statSync(path.join(dir, n)).size < 160000, n + ' stays small');
  }
});

test('at every airport, stands across the field are reached from every runway end, in under 25 minutes', () => {
  const dir = path.join(ROOT, 'fids-current', 'data', 'taxi');
  let n = 0;
  const miss = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const ap = f.slice(0, 3);
    if (!RUNWAYS[ap]) continue;
    const g = G.taxiGraph(taxiFile(ap)), st = Object.values(gateFile(ap).stands);
    const step = Math.max(1, Math.floor(st.length / 6));
    for (let i = 0; i < st.length; i += step) {
      const end = { lat: st[i][0], lng: st[i][1], hdg: st[i][2] };
      const at = G.taxiNear(g, G.taxiXY([end.lat, end.lng], g.o));
      if (!at || at.d > 250) continue;   // a stand far from any taxiway keeps the parked view
      const dj = G.taxiDijkstra(g, at);
      for (const e of ends(ap)) {
        n++;
        const p = G.taxiPlan(g, e, end, { dj });
        if (!p || p.tEnd > 25 * 60) miss.push(ap + ' ' + e.hdg.toFixed(0) + '° stand ' + i);
      }
    }
  }
  assert.ok(n > 1000, n + ' routes');
  assert.deepEqual(miss, []);
});

test('the answer: taxiing in while the feed\'s landing is recent, the model\'s while its fix is older, never a go-around', () => {
  const win = { _gateIata: 'MCO' };
  const inb = { flight: 'UA2779', _locIata: 'EWR' };
  win._gateInbound = inb;
  const taxi = { on: false, fl: '', done: false, anchor: '', anchorAt: 0, since: 0 };
  // v24115 — the landing with its evidence (_gateLandedInfo): the feed own time here
  const where = new Function('window', '_gateTaxi', '_gateGlide', '_gateLandedInfo', '_gateTaxiRoute', '_apTaxiFor', '_lookupAirport', '_gcNm', '_gateOnBlocksWord',
    fnSource('_gateTaxiWhere') + '\nreturn _gateTaxiWhere;')(
    win, taxi, {}, () => ({ t: win.land, by: win.landBy || 'actual' }), () => ({ tEnd: 540 }), () => null, () => MCO, G.gcNm,
    (row) => String((row && row.status) || '').toLowerCase() === 'arrived');
  const now = Date.UTC(2026, 9, 31, 1, 40);
  win.land = now - 4 * 60000;
  const stand = { kind: 'stand', leg: 'out', why: 'landed' };
  const r = where(stand, inb, now, 'MCO');
  assert.equal(r && r.kind, 'taxi');
  assert.equal(r.anchor, 'land');
  assert.equal(r.org, 'EWR');
  win.land = now - 11 * 60000;
  assert.equal(where(stand, inb, now, 'MCO'), null, 'past the taxi\'s 9 minutes: at the stand');
  assert.equal(where({ kind: 'stand', leg: 'out', why: 'boarding' }, inb, now, 'MCO'), null, 'boarding is the door\'s');
  assert.equal(where(stand, { flight: 'XX1' }, now, 'MCO'), null, 'only this gate\'s inbound');
  // landed on the model: the airborne fix it was carried from is older than the touchdown
  Object.assign(taxi, { on: true, fl: 'UA2779', since: now - 60000, anchor: 'model', anchorAt: now - 60000 });
  const fix = { kind: 'fix', leg: 'in', onGround: false, lat: 28.28, lng: -81.28, at: now - 300000 };
  assert.equal(where(fix, inb, now, 'MCO').anchor, 'model');
  assert.equal(where(Object.assign({}, fix, { at: now - 10000 }), inb, now, 'MCO'), null, 'a newer fix in the air: a go-around, the glide has it');
  // a fix on the ground at our field, moving
  const gnd = { kind: 'fix', leg: 'in', onGround: true, lat: 28.43, lng: -81.30, at: now - 20000, spd: 15 };
  assert.equal(where(gnd, inb, now, 'MCO').anchor, 'fix');
});

test('which arrivals land: established, over the runway, or closing on the final; never climbing or tracking away', () => {
  const lands = (trk, vs) => new Function('window', '_gateHeading', ['_gcNm', '_gcBrgDeg', '_gateOnFinal', '_gateLands'].map(fnSource).join('\n') + '\nreturn _gateLands;')(
    { _gateInbound: { _liveVs: vs } }, () => trk);
  const r = G.runwayFinalPath(UA2779, MCO, 'MCO'), thr = r[r.length - 2], tdz = r[r.length - 1];
  assert.equal(lands(359, -700)(UA2779, r.rw, thr, tdz, 2650), true, 'UA2779, established');
  assert.equal(lands(null, null)(UA2779, r.rw, thr, tdz, 2650), true, 'established with no track known');
  const off = [28.30, -81.255];   // 1.4 nm east of 35R's centreline, 7 nm out, 3,800 ft
  assert.equal(lands(340, -800)(off, r.rw, thr, tdz, 3800), true, 'closing on it at 19°');
  assert.equal(lands(null, -800)(off, r.rw, thr, tdz, 3800), false, 'not established, and no track to say it is closing');
  assert.equal(lands(270, -800)(off, r.rw, thr, tdz, 3800), false, 'a base leg');
  assert.equal(lands(340, -800)(off, r.rw, thr, tdz, 5200), false, 'too high');
  assert.equal(lands(180, -300)(UA2779, r.rw, thr, tdz, 2650), false, 'a downwind along the centreline');
  assert.equal(lands(359, 1500)(UA2779, r.rw, thr, tdz, 2650), false, 'climbing: a go-around');
  assert.equal(lands(359, -500)([28.43, -81.2824], Object.assign({}, r.rw, { past: true }), null, null, 50), true, 'over the runway');
  assert.equal(lands(179, 1500)([28.445, -81.2826], Object.assign({}, r.rw, { past: true }), null, null, 1500), false, 'a go-around over the far end');
  assert.doesNotMatch(fnSource('_startGateMapGlide'), /_gateHeading\(null\)/, 'the glide\'s speed model still reads no track');
});

test('the glide hands an established arrival to the taxi at touchdown; every surface joins the taxi', () => {
  const glide = fnSource('_startGateMapGlide');
  const join = glide.indexOf('try { if (_gateTaxiJoin(map, marker, a1, a2, o, d, fixAt)) return; } catch (eTJ) {}');
  assert.ok(join > 0 && join < glide.indexOf('var _viewKey') && join > glide.indexOf("if (!map || !marker || typeof L === 'undefined') return;"),
    'a taxi on takes the surface before anything else');
  assert.match(glide, /if \(_landsHere\) _drCapP = 1;/);
  assert.match(glide, /if \(_landsHere && p >= 1 - 1e-9 && !\(frame\._taxiTry > Date\.now\(\) - 3000\)\) \{\s*frame\._taxiTry = Date\.now\(\);\s*if \(_gateTaxiFromGlide\(destIata, _rwFinal\.rw, route\[n - 1\]\)\) return;/);
  assert.match(fnSource('_gateAircraftWhere'), /var tx = _gateTaxiWhere\(res, inb, t, ap\); if \(tx\) \{ tx\.base = res; return tx; \}/);
  assert.match(fnSource('_gateMapApply'), /if \(res\.kind === 'taxi'\) \{[\s\S]*?_txOk = _gateTaxiApply\(res\);[\s\S]*?res = res\.base;/);
  // the watchdog and the digits know a taxiing aeroplane is on the ground
  assert.match(CORE, /\|\| !!\(typeof _gateTaxiMine === 'function' && _gateTaxiMine\(\)\)   \/\/ v24105/);
  assert.match(fnSource('_gateTelemModel'), /\(typeof _gateTaxiMine === 'function' && _gateTaxiMine\(\)\)\) \{/);
  // only this gate's inbound: a finished taxi never exempts the next flight's glide
  const mine = new Function('window', '_gateTaxi', fnSource('_gateTaxiMine') + '\nreturn _gateTaxiMine;');
  assert.equal(mine({ _gateInbound: { flight: 'UA2779' } }, { on: true, fl: 'UA2779', done: true })(), true);
  assert.equal(mine({ _gateInbound: { flight: 'UA1105' } }, { on: true, fl: 'UA2779', done: true })(), false);
  assert.match(fnSource('_gateOnGroundNow'), /if \(wh && wh\.kind === 'taxi'\) return true;/);
  // the taxi's own generation: a rebuild's _stopGateMapGlide never stops it
  assert.doesNotMatch(fnSource('_stopGateMapGlide'), /_gateTaxi/);
  assert.match(fnSource('_gateTaxiRun'), /var myGen = st\.gen = \(st\.gen \+ 1\) \| 0;/);
  // never faster than 1.6 times the model, never slower than a third of it
  assert.match(fnSource('_gateTaxiRun'), /var k = Math\.max\(0\.35, Math\.min\(1\.6, 1 \+ \(tgt - st\.s\) \/ Math\.max\(20, vm \* 10\)\)\);/);
});

// ═══════════════════════════════════════════════════════════════════════════
// v24120 — TURNS, NOT PIVOTS. Seattle stand S1A off 16L, 2026-11-05: the turn
// off the runway took 83 degrees within 7 m of path, then a 46 degree S-bend
// in 11 m, then 83 degrees in 4 m on to the stand, each at the 3 m/s floor.
// Every corner was rounded within 45% of its legs, and OpenStreetMap splits
// its lines into legs of 1 to 5 m. A corner now keeps a 30 m radius (50 m
// off the runway) however the line is split, within 10 m of it.
// ═══════════════════════════════════════════════════════════════════════════

// the tightest turn along a path (metres): the heading change between
// successive 6 m chords of the path walked every metre (a pivot reads as
// 6 m over its angle: 4 m for 83 degrees)
function walk(xy) {
  const P = [xy[0]], S = [0];
  let acc = 0, carry = 0;
  for (let i = 1; i < xy.length; i++) {
    const A = xy[i - 1], B = xy[i], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (!(L > 1e-9)) continue;
    let d = 1 - carry;
    for (; d <= L + 1e-9; d += 1) { P.push([A[0] + (B[0] - A[0]) * d / L, A[1] + (B[1] - A[1]) * d / L]); acc += 1; S.push(acc); }
    carry = L - (d - 1);
  }
  return { P, S };
}
function tightest(xy, from, to) {
  const { P, S } = walk(xy), hd = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  let r = Infinity;
  for (let k = 6; k + 6 < P.length; k++) {
    if ((from !== undefined && S[k] < from) || (to !== undefined && S[k] > to)) continue;
    const th = Math.abs(((hd(P[k], P[k + 6]) - hd(P[k - 6], P[k])) * 180 / Math.PI + 540) % 360 - 180) * Math.PI / 180;
    if (th > 1e-9) r = Math.min(r, 6 / th);
  }
  return r;
}
// the farthest a path strays from the line it was rounded from
function strays(xy, line) {
  let worst = 0;
  for (const q of walk(xy).P) {
    let d = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const A = line[i], B = line[i + 1], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
      const f = L2 > 0 ? Math.max(0, Math.min(1, ((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / L2)) : 0;
      d = Math.min(d, Math.hypot(q[0] - A[0] - dx * f, q[1] - A[1] - dy * f));
    }
    worst = Math.max(worst, d);
  }
  return worst;
}
const TAXIWAY = () => ({ r: 30, rm: 90, cut: 10 });

test('a taxiway corner turns 25 m round or wider however finely the line is split, within 10 m of it', () => {
  const plain = [[0, 0], [300, 0], [300, 300]];
  // the same corner as OpenStreetMap draws it: legs of 1 to 5 m near the
  // corner, a node a metre off the line
  const split = [[0, 0]];
  for (let x = 200; x < 300; x += (x > 280 ? 1 : 5)) split.push([x, x === 290 ? 1 : 0]);
  split.push([300, 0]);
  for (let y = 1; y < 100; y += (y < 20 ? 1 : 4)) split.push([300, y]);
  split.push([300, 300]);
  // and drawn as a pivot: 83 degrees within 7 m (Seattle, S1A)
  const pivot = [[0, 0], [296, 0], [299, 1], [300.5, 3], [301, 7], [301, 300]];
  for (const [name, line] of [['plain', plain], ['split', split], ['pivot', pivot]]) {
    const out = G.taxiRound(line, TAXIWAY);
    assert.ok(tightest(out) >= 25, name + ': tightest ' + tightest(out).toFixed(1) + ' m');
    assert.ok(strays(out, line) <= 10.5, name + ': ' + strays(out, line).toFixed(1) + ' m off the line');
    assert.deepEqual(out[0], line[0], name + ': from the first point');
    assert.deepEqual(out[out.length - 1], line[line.length - 1], name + ': to exactly the last');
  }
  assert.ok(Math.abs(tightest(G.taxiRound(split, TAXIWAY)) - tightest(G.taxiRound(plain, TAXIWAY))) < 2, 'the split corner as the plain one');
});

test('a bend drawn as many small corners keeps the radius it was drawn with; a stand 4 m off the line is swung into', () => {
  const arc = [[-200, 0]];
  for (let a = 0; a <= 90; a += 5) arc.push([60 * Math.sin(a * Math.PI / 180), 60 - 60 * Math.cos(a * Math.PI / 180)]);
  arc.push([60, 260]);
  const out = G.taxiRound(arc, TAXIWAY);
  assert.ok(tightest(out) > 50 && tightest(out) < 70, 'drawn 60 m round: ' + tightest(out).toFixed(1) + ' m');
  assert.ok(strays(out, arc) < 1.5, strays(out, arc).toFixed(2) + ' m off');
  // the last leg 4 m long, square to the taxilane: no pivot on to the stand
  const stand = [[0, 0], [200, 0], [200, 4]];
  const into = G.taxiRound(stand, TAXIWAY);
  assert.ok(tightest(into) >= 25, 'into the stand ' + tightest(into).toFixed(1) + ' m');
  assert.deepEqual(into[into.length - 1], [200, 4]);
});

test('Seattle S1A off 16L: off the runway, along the taxiways and on to the stand, no turn under 25 m and none below 5 m/s', () => {
  const tf = taxiFile('SEA'), g = G.taxiGraph(tf), st = gateFile('SEA').stands.S1A;
  const end = { lat: st[0], lng: st[1], hdg: st[2] };
  const rw = { t: [47.4638, -122.308], f: [47.4312, -122.308] };   // 16L
  const p = G.taxiPlan(g, rw, end, {});
  assert.ok(p, 'a route');
  const xy = p.pts.map((q) => G.taxiXY(q, g.o));
  assert.ok(tightest(xy) >= 25, 'tightest turn ' + tightest(xy).toFixed(1) + ' m (main: 5.5 m off the runway)');
  assert.ok(tightest(xy, p.rollEnd - 150, p.rollEnd) >= 45, 'off the runway ' + tightest(xy, p.rollEnd - 150, p.rollEnd).toFixed(1) + ' m round');
  const taxiV = p.v.filter((v, i) => p.s[i] > p.rollEnd - 60 && p.total - p.s[i] > 220);
  assert.ok(Math.min(...taxiV) >= 5, 'slowest turn ' + Math.min(...taxiV).toFixed(1) + ' m/s (main: 3.0)');
  assert.ok(G.gcNm(p.pts[p.pts.length - 1], [end.lat, end.lng]) * 1852 < 0.01, 'ends on the stand');
  assert.ok(Math.abs(G.taxiAtS(p, p.total).hdg - 17.8) < 0.5, 'at its heading');
  for (let i = 1; i < p.t.length; i++) assert.ok(p.t[i] > p.t[i - 1]);
});

test('at every airport, three routes in four keep every turn 20 m round or wider (main: none)', () => {
  const dir = path.join(ROOT, 'fids-current', 'data', 'taxi');
  let n = 0, wide = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const ap = f.slice(0, 3);
    if (!RUNWAYS[ap]) continue;
    const g = G.taxiGraph(taxiFile(ap)), st = Object.values(gateFile(ap).stands);
    const step = Math.max(1, Math.floor(st.length / 6));
    for (let i = 0; i < st.length; i += step) {
      const end = { lat: st[i][0], lng: st[i][1], hdg: st[i][2] };
      const at = G.taxiNear(g, G.taxiXY([end.lat, end.lng], g.o));
      if (!at || at.d > 250) continue;
      const dj = G.taxiDijkstra(g, at);
      for (const e of ends(ap)) {
        const p = G.taxiPlan(g, e, end, { dj });
        if (!p) continue;
        n++;
        if (tightest(p.pts.map((q) => G.taxiXY(q, g.o))) >= 20) wide++;
      }
    }
  }
  assert.ok(n > 1000, n + ' routes');
  // the rest turn where the drawn line itself turns hard twice within a few
  // tens of metres, or doubles back (lead-in lines into a stand, an exit
  // drawn back against the landing): no 20 m arc fits there within 10 m
  assert.ok(wide / n > 0.7, (100 * wide / n).toFixed(1) + '% of ' + n + ' routes');
});
