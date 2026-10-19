'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — EVERY FLOOR THE OVERNIGHT SWEEP RECORDED, LAID OUT AGAIN
//
// On 2026-10-19 every airport's live departures board was loaded at
// 1920x1080 (build v24064) and its floor recorded: the view it was drawn in,
// its size, the page's rows, the moment and the board's languages
// (tests/fixtures/earth-sweep-2026-10-19.json, 90 floors with rows: 65 full
// maps, 25 strips). The fixture holds each page's places AS THIS BUILD READS
// THEM: the coded rows as recorded, then the rows with no code the map now
// reads, with this build's positions and zones (Yellowknife's Norman Wells,
// Taloyoak and Kugluktuk, LaGuardia's West Palm Beach, the rows at
// Philadelphia and Québec), so what is checked is what ships. Laid out again
// here, on those very views:
//
//   · no name stands clearly nearer another place's dot than its own (more
//     than AMBIG px): it read as that place's (Kelowna's Nanaimo, Comox and
//     Vancouver; LaGuardia's 'Cincinnati' 13 px from St Louis's dot);
//   · no route leaves the lens between its airport and its place: never
//     farther from either than they are from each other (Yellowknife's line
//     to Calgary climbed 95 px to the Arctic and came back down);
//   · no leader line crosses another, passes by another place's dot, or
//     runs through another place's name (Edmonton's Toronto and Ottawa lines
//     crossed in an X; Albany's ran up through 'Cleveland' at Washington
//     National);
//   · the page's order decides who gives way: a place is left off for one
//     before it on the page, never for one after it (Fort Simpson, fourth on
//     Yellowknife's page, gave way to Norman Wells, fifth);
//   · no two names touch;
//   · every floor names as many places as main did, less the names that
//     stood by another place's dot (those are left off now: the rows list
//     them);
//   · the cap counts names, not places tried: places the floor cannot name
//     give their slots to the next ones on the page (Ottawa named 3 of 5).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const E = require(path.join(ROOT, 'fids-current', 'js', 'fids-earth.js'));
const BS = require(path.join(ROOT, 'fids-current', 'js', 'board-strings.js'));
const MOD = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-earth.js'), 'utf8');
const FX = require('./fixtures/earth-sweep-2026-10-19.json');

// a font about as wide as the board's
const measure = (t, f) => String(t).length * f * 0.56 + f * 0.2;
// (on a build without them: the cap as it was, the names as the labels hold them)
const namedCodes = E.namedCodes || ((L) => { const o = []; L.labels.forEach((l) => l.rows.forEach((r) => { const c = r.texts[0] && r.texts[0].code; if (c && !o.includes(c)) o.push(c); })); return o; });
const fillNames = E.fillNames || ((pool, cap, run) => ({ list: pool.slice(0, cap), L: run(pool.slice(0, cap)) }));

function lay(fl) {
  const [psi, delta, R, cx, cy] = fl.view, A = fl.here, H = fl.H, W = fl.W, full = H >= E.MIN_FULL;
  const yl = Math.round(Math.min(70, Math.max(22, H * 0.13)));
  const view = { B: E.frameBasis(A, psi, delta), R, cx, cy, yl, psi, delta };
  const at = new Date(fl.at);
  const pool = fl.places.map(([code, lat, lon, tz, name, names, n, done, isNext], i) => ({ code, lat, lon, tz: tz || null, name, names, n, done, isNext, rank: i }));
  const run = (lst) => E.layout({ view, W, H, top: 0, here: A, full, places: lst,
    timeOf: (z) => (z ? BS.boardTime(at, z, { list: fl.langs }) : ''), hereTz: fl.hereTz, measure });
  const r = full ? fillNames(pool, E.capFor(H), run) : { list: pool.slice(0, 1), L: run(pool.slice(0, 1)) };
  return { L: r.L, list: r.list, pool, run, full, view, hub: E.toScreen(E.vec(A[0], A[1]), view) };
}
const boxDist = (b, x, y) => Math.hypot(Math.max(b.x0, Math.min(x, b.x1)) - x, Math.max(b.y0, Math.min(y, b.y1)) - y);
const FLOORS = FX.floors.map((fl) => Object.assign({ out: lay(fl) }, fl));

test('the recorded floors are all here: 90 with rows, 65 of them full maps', () => {
  assert.equal(FLOORS.length, 90);
  assert.equal(FLOORS.filter((f) => f.H >= E.MIN_FULL).length, 65);
});

test('no name on any recorded floor stands clearly nearer another place\'s dot than its own', () => {
  const bad = [];
  for (const fl of FLOORS) {
    const L = fl.out.L;
    for (const lab of L.labels) {
      const own = boxDist(lab.box, lab.at.x, lab.at.y);
      for (const d of L.dots) if (d.code !== lab.code && boxDist(lab.box, d.x, d.y) + E.AMBIG < own) bad.push(`${fl.id}: ${lab.code}${lab.edge ? ' (at its arrow)' : ''} by ${d.code}'s dot`);
    }
  }
  assert.deepEqual(bad, [], 'names that read as another place\'s');
});

test('a name at an arrow never stands as near another place\'s dot as its arrow (it has no line to say which)', () => {
  const bad = [];
  for (const fl of FLOORS) {
    const L = fl.out.L;
    for (const lab of L.labels) {
      if (!lab.edge) continue;
      const own = boxDist(lab.box, lab.at.x, lab.at.y);
      for (const d of L.dots) if (d.code !== lab.code && boxDist(lab.box, d.x, d.y) < own + E.AMBIG) bad.push(`${fl.id}: ${lab.code} at its arrow, by ${d.code}'s dot`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no route leaves the lens between its airport and its place (no loop to the Arctic)', () => {
  const bad = [];
  for (const fl of FLOORS) {
    const { L, list, view, hub } = fl.out;
    for (const r of L.routes) {
      const p = list.find((x) => x.code === r.code); if (!p) continue;
      const q = E.toScreen(E.vec(p.lat, p.lon), view);
      if (q.hidden || q.z <= 0.02) continue;
      const reach = Math.hypot(q.x - hub.x, q.y - hub.y) + 4;
      for (const s of r.runs[0] || []) {
        const over = Math.max(Math.hypot(s.x - hub.x, s.y - hub.y), Math.hypot(s.x - q.x, s.y - q.y)) - reach;
        if (over > 1) { bad.push(`${fl.id}: the line to ${r.code} passes ${Math.round(over)} px outside`); break; }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('no leader line crosses another, passes by another place\'s dot, or runs through another place\'s name', () => {
  const cross = (p, q) => {
    const rx = p[2] - p[0], ry = p[3] - p[1], sx = q[2] - q[0], sy = q[3] - q[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return false;
    const t = ((q[0] - p[0]) * sy - (q[1] - p[1]) * sx) / den, u = ((q[0] - p[0]) * ry - (q[1] - p[1]) * rx) / den;
    return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
  };
  const bad = [];
  for (const fl of FLOORS) {
    const L = fl.out.L, ls = L.leaders.map((l) => [l.x1, l.y1, l.x2, l.y2]);
    ls.forEach((a, i) => ls.forEach((b, j) => { if (j > i && cross(a, b)) bad.push(fl.id + ': two leader lines cross'); }));
    ls.forEach((l) => {
      const own = L.dots.find((d) => Math.hypot(d.x - l[0], d.y - l[1]) < 9);
      for (const d of L.dots) {
        if (own && d.code === own.code) continue;
        const vx = l[2] - l[0], vy = l[3] - l[1], t = Math.min(1, Math.max(0, ((d.x - l[0]) * vx + (d.y - l[1]) * vy) / (vx * vx + vy * vy || 1)));
        if (Math.hypot(l[0] + vx * t - d.x, l[1] + vy * t - d.y) < 6) bad.push(`${fl.id}: a leader line passes ${d.code}'s dot`);
      }
      // a segment through a name's box (the leader's own name, at its dot end, aside)
      for (const lab of L.labels) {
        if (Math.hypot(lab.at.x - l[0], lab.at.y - l[1]) < 9) continue;
        if (segThrough(l, lab.box)) bad.push(`${fl.id}: a leader line runs through ${lab.code}'s name`);
      }
    });
  }
  assert.deepEqual(bad, []);
});
function segThrough(l, b) {
  const dx = l[2] - l[0], dy = l[3] - l[1]; let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy], q = [l[0] - b.x0, b.x1 - l[0], l[1] - b.y0, b.y1 - l[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}

test('the page\'s order decides who gives way: a place is left off only for one before it on the page', () => {
  let n = 0;
  for (const fl of FLOORS) {
    const runs = [fl.out.L].concat(fl.out.full ? [fl.out.run(fl.out.pool.slice(0, E.capFor(fl.H)))] : []);
    for (const L of runs) for (const [code, to] of L.gaveWay || []) {
      const at = (c) => fl.out.pool.findIndex((p) => p.code === c);
      assert.ok(at(to) >= 0 && at(to) < at(code), `${fl.id}: ${code} gave way to ${to}, which comes after it`);
      assert.ok(namedCodes(L).includes(to) && !namedCodes(L).includes(code), `${fl.id}: ${code} gave way to ${to}`);
      n++;
    }
  }
  assert.ok(n >= 5, n + ' places gave way');
  const by = (id) => FLOORS.find((f) => f.id === id);
  // the cases a checker found: a place left off for the dot of one after it
  // on the page, that was itself then left off
  const named = (id) => namedCodes(by(id).out.L);
  assert.ok(named('recheckA/LGA').includes('CVG'), 'LaGuardia: Cincinnati is named (Memphis, after it, gives way)');
  assert.equal(named('recheckA/LGA').length, 9, 'LaGuardia names 9');
  assert.ok(named('run/LGA').includes('CLT'), 'LaGuardia: Charlotte is named (Greensboro and Charlottesville, after it, give way)');
  assert.equal(named('run/LGA').length, 7);
});

test('no two names touch on any recorded floor', () => {
  for (const fl of FLOORS) {
    const labs = fl.out.L.labels;
    labs.forEach((a, i) => labs.forEach((b, j) => {
      if (j <= i) return;
      const A = a.box, B = b.box;
      assert.ok(!(A.x0 < B.x1 + 12 && A.x1 > B.x0 - 12 && A.y0 < B.y1 + 4 && A.y1 > B.y0 - 4), `${fl.id}: ${a.code} and ${b.code} touch`);
    }));
  }
});

test('every floor names as many places as main did, less the names that stood by another place\'s dot', () => {
  const bad = [];
  for (const fl of FLOORS) {
    const named = namedCodes(fl.out.L), want = fl.main.named.length - fl.main.byWrongDot.length;
    if (named.length < want) bad.push(`${fl.id}: ${named.length} named, main ${fl.main.named.length} (${fl.main.byWrongDot.length} by the wrong dot)`);
  }
  assert.deepEqual(bad, []);
  const total = FLOORS.reduce((a, fl) => a + namedCodes(fl.out.L).length, 0), main = FLOORS.reduce((a, fl) => a + fl.main.named.length, 0);
  assert.ok(total > main, `the floors name ${total} places, main ${main}`);
});

test('the cap counts names, not places tried: Ottawa names 5 (it named 3), Detroit 6 (4)', () => {
  const by = (id) => FLOORS.find((f) => f.id === id);
  assert.equal(namedCodes(by('run/YOW').out.L).length, 5, 'Ottawa');
  assert.equal(namedCodes(by('run/DTW').out.L).length, 6, 'Detroit');
  // a refill never costs a place the first try named, and never names past the cap
  for (const fl of FLOORS) {
    if (!fl.out.full) continue;
    const cap = E.capFor(fl.H), first = namedCodes(fl.out.run(fl.out.pool.slice(0, cap))), now = namedCodes(fl.out.L);
    for (const c of first) assert.ok(now.includes(c), `${fl.id}: ${c} was named before the refill`);
    assert.ok(now.length <= cap, `${fl.id}: ${now.length} names over the cap of ${cap}`);
  }
});

test('Yellowknife: the line to Calgary no longer climbs to the Arctic, and the North keeps its names', () => {
  for (const id of ['run/YZF', 'recheckA/YZF', 'recheckB/YZF']) {
    const fl = FLOORS.find((f) => f.id === id), { L, hub } = fl.out;
    // Calgary lies south, just under the floor's foot: its line never rises
    // over the airport (it is left off now: its arrow stood by Edmonton's dot)
    for (const r of L.routes.filter((x) => x.code === 'YYC')) {
      const top = Math.min(...r.runs.flat().map((s) => s.y));
      assert.ok(top > hub.y - 20, `${id}: the line to Calgary climbs ${Math.round(hub.y - top)} px above the airport`);
    }
    // Calgary and Edmonton alone on that floor: Calgary's line is drawn, and
    // it climbed 95 px over the airport (lift 0.12) before the lens; now it
    // is a low arc over Edmonton's
    const pair = fl.out.run(fl.out.pool.filter((p) => p.code === 'YEG' || p.code === 'YYC'));
    const rr = pair.routes.find((x) => x.code === 'YYC');
    assert.ok(rr, id + ': Calgary is drawn when Edmonton is its only neighbour');
    const climb = hub.y - Math.min(...rr.runs.flat().map((s) => s.y));
    assert.ok(climb < 40, `${id}: Calgary's line climbs ${Math.round(climb)} px over the airport`);
    for (const c of ['YVR', 'YEG', 'YCB', 'YFS', 'YYH', 'YCO']) assert.ok(namedCodes(L).includes(c), `${id}: ${c} is named`);
    // the North's new places are on this floor's page; Norman Wells, after
    // Fort Simpson on it, is the one that gives way
    for (const c of ['YVQ', 'YYH', 'YCO']) assert.ok(fl.out.pool.some((p) => p.code === c), `${id}: ${c} is on the page`);
    assert.deepEqual(L.gaveWay, [['YVQ', 'YFS']], id + ': Norman Wells gives way to Fort Simpson');
  }
  assert.match(MOD, /Math\.hypot\(q\.x - a\.x, q\.y - a\.y\) > reach \|\| Math\.hypot\(q\.x - m\.q\.x, q\.y - m\.q\.y\) > reach\) bad = true;/, 'the lens is both circles');
});

test('a row with no code of its own is read from the code its city label ends with, else from its words, for the map', () => {
  assert.equal(typeof E.rowCode, 'function', 'fids-earth.js exports rowCode');
  assert.equal(E.rowCode('', "Chicago · O'Hare | ORD"), 'ORD');
  assert.equal(E.rowCode('', 'New York · Kennedy | JFK'), 'JFK');
  assert.equal(E.rowCode('ord', 'Chicago · Midway | MDW'), 'ORD', 'the row\'s own code comes first');
  assert.equal(E.rowCode('', 'Montreal | MET'), 'MET', '(the board turns MET back into YHU: _realIata)');
  assert.equal(E.rowCode('', 'Dallas'), '');
  assert.equal(E.rowCode('', 'Harrisburg, PA'), '', 'no reader, no code');
  assert.equal(E.rowCode('', 'Harrisburg, PA', (w) => (w === 'Harrisburg, PA' ? 'mdt' : '')), 'MDT', 'the reader (the board\'s _iataFromRowName) reads the words');
  assert.equal(E.rowCode('', 'Hartford | BDL', () => 'XXX'), 'BDL', 'the label\'s code before the words');
  assert.equal(E.rowCode('', 'Harrisburg, PA', () => { throw new Error('x'); }), '');
  assert.equal(E.rowCode(null, null), '');
  assert.match(MOD, /function pageCodes\(\) \{[\s\S]{0,400}realCode\(rowCode\(tr\.getAttribute\('data-iata'\), tr\.getAttribute\('data-loc'\), rowWords\)\)/, 'the page\'s places read it');
  assert.match(MOD, /placesFrom\(boardRows\(dir\), \{[^}]*codeOf: rowWords \}\)/, 'and so do the day\'s places');
  assert.match(MOD, /function rowWords\(t\) \{[^\n]*_iataFromRowName\(t\)/);
  // placesFrom: a row with no code is read for the map, and named by the board's own name for it
  const P = E.placesFrom([{ dest: 'Harrisburg, PA', status: 'scheduled', _revTs: 2e12 }, { dest: 'Whitehorse, Calgary', status: 'scheduled', _revTs: 2e12 }],
    { dir: 'dep', ap0: 'PHL', now: 1e12, coords: () => [40, -76], codeOf: (t) => (t === 'Harrisburg, PA' ? 'MDT' : '') });
  assert.deepEqual(P.list.map((p) => [p.code, p.read]), [['MDT', true]]);
});

test('the fixture is the page this build reads: rows with no code the map now reads, places with new positions, West Palm Beach named', () => {
  const by = (id) => FLOORS.find((f) => f.id === id), codes = (id) => by(id).places.map((p) => p[0]), nm = (id, c) => (by(id).places.find((p) => p[0] === c) || [])[4];
  for (const c of ['MDT', 'CVG', 'YUL', 'RIC', 'CLT']) assert.ok(codes('recheckA/PHL').includes(c), 'Philadelphia reads ' + c);
  assert.equal(nm('recheckA/PHL', 'YUL'), 'Montréal', '\'Montreal-Trdeau\' is named as the board names Montréal');
  assert.equal(nm('recheckA/PHL', 'MDT'), 'Harrisburg');
  for (const c of ['YTZ', 'YHU']) assert.ok(codes('recheckA/YQB').includes(c), 'Québec reads ' + c);
  assert.ok(codes('recheckA/YEG').includes('YFI'), 'Edmonton reads Firebag');
  assert.equal(nm('run/LGA', 'DJT'), 'West Palm Beach', 'DJT is named as PBI is');
  for (const fl of FLOORS) for (const p of fl.places) assert.ok(!/Djt|Donald J/.test(p[4]), fl.id + ': ' + p[4]);
  // a list of stops is not read: Edmonton's rows to Whitehorse via Calgary
  // and to Inuvik via Yellowknife and Norman Wells keep no code
  for (const id of ['run/YEG', 'recheckA/YEG', 'recheckB/YEG']) for (const c of ['YXY', 'YEV']) assert.ok(!codes(id).includes(c), id + ' ' + c);
});
