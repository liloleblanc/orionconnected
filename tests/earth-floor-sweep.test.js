'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — EVERY FLOOR THE OVERNIGHT SWEEP RECORDED, LAID OUT AGAIN
//
// On 2026-10-19 every airport's live departures board was loaded at
// 1920x1080 (build v24064) and its floor recorded: the view it was drawn in,
// its size, the page's places in row order, the moment and the board's
// languages (tests/fixtures/earth-sweep-2026-10-19.json, 90 floors with
// rows: 65 full maps, 25 strips). Laid out again here, on those very views:
//
//   · no name stands clearly nearer another place's dot than its own (more
//     than AMBIG px): it read as that place's (Kelowna's Nanaimo, Comox and
//     Vancouver; LaGuardia's 'Cincinnati' 13 px from St Louis's dot);
//   · no route leaves the lens between its airport and its place: never
//     farther from either than they are from each other (Yellowknife's line
//     to Calgary climbed 95 px to the Arctic and came back down);
//   · no leader line crosses another, or passes by another place's dot
//     (Edmonton's Toronto and Ottawa lines crossed in an X);
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

test('no leader line crosses another, or passes by another place\'s dot', () => {
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
    });
  }
  assert.deepEqual(bad, []);
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
    for (const c of ['YVR', 'YEG', 'YCB', 'YFS']) assert.ok(namedCodes(L).includes(c), `${id}: ${c} is named`);
  }
  assert.match(MOD, /Math\.hypot\(q\.x - a\.x, q\.y - a\.y\) > reach \|\| Math\.hypot\(q\.x - m\.q\.x, q\.y - m\.q\.y\) > reach\) bad = true;/, 'the lens is both circles');
});

test('a row with no code of its own is read from the code its city label ends with', () => {
  assert.equal(typeof E.rowCode, 'function', 'fids-earth.js exports rowCode');
  assert.equal(E.rowCode('', "Chicago · O'Hare | ORD"), 'ORD');
  assert.equal(E.rowCode('', 'New York · Kennedy | JFK'), 'JFK');
  assert.equal(E.rowCode('ord', 'Chicago · Midway | MDW'), 'ORD', 'the row\'s own code comes first');
  assert.equal(E.rowCode('', 'Montreal | MET'), 'MET', '(the board turns MET back into YHU: _realIata)');
  assert.equal(E.rowCode('', 'Dallas'), '');
  assert.equal(E.rowCode('', 'Harrisburg, PA'), '');
  assert.equal(E.rowCode(null, null), '');
  assert.match(MOD, /function pageCodes\(\) \{[\s\S]{0,400}realCode\(rowCode\(tr\.getAttribute\('data-iata'\), tr\.getAttribute\('data-loc'\)\)\)/, 'the page\'s places read it');
});
