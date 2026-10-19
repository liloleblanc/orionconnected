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
// reads, with this build's positions, zones and names (Yellowknife's Norman
// Wells, Taloyoak and Kugluktuk, LaGuardia's West Palm Beach, the rows at
// Philadelphia and Québec), so what is checked is what ships. It also holds
// the board's font as the floor measures it (Bricolage Grotesque at weight
// 700: each character's advance and each pair's kerning, from the repo's
// woff2), so every width here is the width on the board (Chrome's own
// canvas agrees within 0.15 px), and what main named on main's own page with
// those widths, and which of those names were in a conflict. Laid out again
// here, on those very views:
//
//   · A PLACE'S MARK is its dot, or the arrow where its route leaves the
//     picture. No name stands clearly nearer another place's mark than its
//     own (more than AMBIG px): it read as that place's (Kelowna's Nanaimo,
//     Comox and Vancouver; LaGuardia's 'Cincinnati' 13 px from St Louis's
//     dot). No name stands as near another place's mark as its own without a
//     leader line to say which, and a name at an arrow never has one.
//   · An arrow's own name is the nearest name to it (Heathrow: Madrid's arrow
//     stood 24 px from 'Genève' and 34 px from 'Madrid').
//   · No route leaves the lens between its airport and its place: never
//     farther from either than they are from each other (Yellowknife's line
//     to Calgary climbed 95 px to the Arctic and came back down).
//   · No leader line crosses another, passes by another place's mark, or
//     runs through another place's name (Edmonton's Toronto and Ottawa lines
//     crossed in an X; Albany's ran up through 'Cleveland' at Washington
//     National).
//   · No two names touch.
//   · NO NAME IS BOUGHT WITH ANOTHER. A floor names fewer places than main
//     only where every name it lost was in a conflict on main, and no name
//     it lost has a clear spot on its floor now. Boston at Washington
//     National, Nice at Heathrow, Cancún at Miami, Indianapolis and Austin at
//     Phoenix and the others the second review's give-way left off are
//     named again.
//   · The cap counts names, not places tried: places the floor cannot name
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

// the board's own widths: what fids-earth.js textW gets from the canvas
// (the glyphs and their kerning), plus the 0.01 em the stylesheet adds to
// each letter and 0.2 em of halo
const FONT = FX.font, missing = new Set();
const measure = (s, fs0) => {
  s = String(s);
  const t = FONT.sizes[Math.round(fs0)];
  if (!t) throw new Error('the fixture\'s font has no size ' + fs0);
  let u = 0, prev = '';
  for (const ch of s) {
    if (t.adv[ch] == null) missing.add(ch); else u += t.adv[ch];
    if (prev) u += t.kern[prev + ch] || 0;
    prev = ch;
  }
  return u * fs0 / FONT.upm + s.length * fs0 * 0.01 + fs0 * 0.2;
};
const namedCodes = E.namedCodes;
const fillNames = E.fillNames;

function lay(fl) {
  const [psi, delta, R, cx, cy] = fl.view, A = fl.here, H = fl.H, W = fl.W, full = H >= E.MIN_FULL;
  const yl = Math.round(Math.min(70, Math.max(22, H * 0.13)));
  const view = { B: E.frameBasis(A, psi, delta), R, cx, cy, yl, psi, delta };
  const at = new Date(fl.at);
  const pool = fl.places.map(([code, lat, lon, tz, name, names, n, done, isNext], i) => ({ code, lat, lon, tz: tz || null, name, names, n, done, isNext, rank: i }));
  const run = (lst, cap) => E.layout({ view, W, H, top: 0, here: A, full, places: lst, cap,
    timeOf: (z) => (z ? BS.boardTime(at, z, { list: fl.langs }) : ''), hereTz: fl.hereTz, measure });
  const r = full ? fillNames(pool, E.capFor(H), (l) => run(l)) : { list: pool.slice(0, 1), L: run(pool.slice(0, 1)) };
  return { L: r.L, list: r.list, pool, run, full, view, hub: E.toScreen(E.vec(A[0], A[1]), view) };
}
const boxDist = (b, x, y) => Math.hypot(Math.max(b.x0, Math.min(x, b.x1)) - x, Math.max(b.y0, Math.min(y, b.y1)) - y);
const FLOORS = FX.floors.map((fl) => Object.assign({ out: lay(fl) }, fl));
const by = (id) => FLOORS.find((f) => f.id === id);
const named = (id) => namedCodes(by(id).out.L);
// every place's mark on a laid-out floor
const marksOf = (L) => L.dots.map((d) => ({ code: d.code, x: d.x, y: d.y, what: 'dot' })).concat(L.arrows.map((a) => ({ code: a.code, x: a.x, y: a.y, what: 'arrow' })));
const rowsOf = (lab) => lab.rows.map((r) => r.texts[0] && r.texts[0].code).filter(Boolean);

test('the recorded floors are all here: 90 with rows, 65 of them full maps, measured in the board\'s font', () => {
  assert.equal(FLOORS.length, 90);
  assert.equal(FLOORS.filter((f) => f.H >= E.MIN_FULL).length, 65);
  assert.deepEqual([...missing], [], 'characters the fixture\'s font lacks');
  // Chrome's canvas measureText, '700 <px>px "Bricolage Grotesque"' (2026-10-19)
  const chrome = [['Toronto', 24, 89.67], ['Montréal', 24, 105.28], ['Îles-de-la-Madeleine', 19, 187.76], ['Genève', 28, 100.33], ['Southampton', 24, 159.11]];
  for (const [s, f, w] of chrome) {
    const ours = measure(s, f) - s.length * f * 0.01 - f * 0.2;
    assert.ok(Math.abs(ours - w) < 0.2, `${s} at ${f} px: ${ours.toFixed(2)} here, ${w} in Chrome`);
  }
});

test('no name stands clearly nearer another place\'s dot or arrow than its own', () => {
  const bad = [];
  for (const fl of FLOORS) {
    const L = fl.out.L, marks = marksOf(L);
    for (const lab of L.labels) {
      const own = boxDist(lab.box, lab.at.x, lab.at.y), mates = rowsOf(lab);
      for (const m of marks) if (m.code !== lab.code && !mates.includes(m.code) && boxDist(lab.box, m.x, m.y) + E.AMBIG < own) bad.push(`${fl.id}: ${lab.code} by ${m.code}'s ${m.what}`);
    }
  }
  assert.deepEqual(bad, [], 'names that read as another place\'s');
});

test('no name stands as near another place\'s dot or arrow as its own with no line to say which (a name at an arrow has none)', () => {
  const bad = [];
  for (const fl of FLOORS) {
    const L = fl.out.L, marks = marksOf(L);
    for (const lab of L.labels) {
      const own = boxDist(lab.box, lab.at.x, lab.at.y), mates = rowsOf(lab);
      const line = !lab.edge && L.leaders.some((ld) => Math.hypot(ld.x1 - lab.at.x, ld.y1 - lab.at.y) < 9);
      for (const m of marks) if (m.code !== lab.code && !mates.includes(m.code) && boxDist(lab.box, m.x, m.y) < own + E.AMBIG && (!line || m.what === 'arrow')) bad.push(`${fl.id}: ${lab.code}${lab.edge ? ' at its arrow' : ''}, by ${m.code}'s ${m.what}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('an arrow\'s own name is the nearest name to it (an arrow has no line to say which)', () => {
  const bad = [];
  let n = 0;
  for (const fl of FLOORS) {
    const L = fl.out.L;
    for (const a of L.arrows) {
      const mine = L.labels.find((l) => l.code === a.code); if (!mine) continue;
      const own = boxDist(mine.box, a.x, a.y), mates = rowsOf(mine);
      n++;
      for (const l of L.labels) if (l !== mine && !mates.includes(l.code) && boxDist(l.box, a.x, a.y) < own + E.AMBIG) bad.push(`${fl.id}: ${a.code}'s arrow ${Math.round(boxDist(l.box, a.x, a.y))} px from '${l.code}', ${Math.round(own)} px from its own name`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(n > 40, n + ' arrows checked');
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

test('no leader line crosses another, passes by another place\'s dot or arrow, or runs through another place\'s name', () => {
  const cross = (p, q) => {
    const rx = p[2] - p[0], ry = p[3] - p[1], sx = q[2] - q[0], sy = q[3] - q[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return false;
    const t = ((q[0] - p[0]) * sy - (q[1] - p[1]) * sx) / den, u = ((q[0] - p[0]) * ry - (q[1] - p[1]) * rx) / den;
    return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
  };
  const bad = [];
  for (const fl of FLOORS) {
    const L = fl.out.L, ls = L.leaders.map((l) => [l.x1, l.y1, l.x2, l.y2]), marks = marksOf(L);
    ls.forEach((a, i) => ls.forEach((b, j) => { if (j > i && cross(a, b)) bad.push(fl.id + ': two leader lines cross'); }));
    ls.forEach((l) => {
      const own = L.dots.find((d) => Math.hypot(d.x - l[0], d.y - l[1]) < 9);
      for (const d of marks) {
        if (own && d.code === own.code) continue;
        const vx = l[2] - l[0], vy = l[3] - l[1], t = Math.min(1, Math.max(0, ((d.x - l[0]) * vx + (d.y - l[1]) * vy) / (vx * vx + vy * vy || 1)));
        if (Math.hypot(l[0] + vx * t - d.x, l[1] + vy * t - d.y) < 6) bad.push(`${fl.id}: a leader line passes ${d.code}'s ${d.what}`);
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

// a name main had and this floor does not: is there a clear spot for it on
// this floor now? Tried after every place this floor names (its dot drawn
// last, the cap lifted): named, with every name the floor has kept, is a
// clear spot
function clearSpotFor(fl, code) {
  const { list, pool, run, L } = fl.out, p = pool.find((x) => x.code === code);
  if (!p) return false;
  const now = namedCodes(L), L2 = run(list.filter((x) => x.code !== code).concat([p]), 99), n2 = namedCodes(L2);
  return n2.includes(code) && now.every((c) => n2.includes(c));
}

test('no name is bought with another: a floor names fewer places than main only where each name it lost was in a conflict on main, and no lost name has a clear spot now', () => {
  const bad = [], clean = [];
  let lost = 0;
  for (const fl of FLOORS) {
    if (!fl.out.full) continue;
    const now = namedCodes(fl.out.L), gone = fl.main.named.filter((c) => !now.includes(c));
    for (const c of gone) {
      lost++;
      if (clearSpotFor(fl, c)) bad.push(`${fl.id}: ${c} has a clear spot and is not named`);
      if (!fl.main.inConflict.includes(c)) {
        if (now.length < fl.main.named.length) bad.push(`${fl.id}: names ${now.length} (main ${fl.main.named.length}) and lost ${c}, which stood clear on main`);
        clean.push(fl.id + ' ' + c);
      }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(lost < 25, lost + ' names lost in all');
  // the names lost that stood clear on main, all on floors that name more
  // places than main or as many: a place that had no position on main now
  // has its dot where the name stood (Yellowknife: Norman Wells's where Fort
  // Simpson's stood, Vancouver's, the next flight's, on its other side;
  // Miami: Cap-Haïtien's where Bogotá's stood), and a dot is never taken
  // away for a name; or naming it costs two (Sydney: Doha leaves in the list
  // Delhi leads, and Delhi's name stands as near Tokyo's arrow; on its own
  // it costs Seoul and Taipei)
  assert.deepEqual(clean.sort(), ['recheckA/SYD DOH', 'recheckA/YZF YFS', 'recheckB/MIA BOG', 'recheckB/YZF YFS', 'run/YZF YFS']);
  for (const id of ['recheckA/SYD', 'recheckB/MIA', 'run/YZF', 'recheckA/YZF', 'recheckB/YZF']) assert.ok(named(id).length >= by(id).main.named.length, id);
  // and it is the new dot that keeps the name off: without it, it is named
  for (const [id, gone, dot] of [['run/YZF', 'YFS', 'YVQ'], ['recheckB/MIA', 'BOG', 'CAP']]) {
    const fl = by(id), L2 = fl.out.run(fl.out.list.filter((p) => p.code !== dot).concat(fl.out.pool.filter((p) => p.code === gone && !fl.out.list.includes(p))));
    assert.ok(namedCodes(L2).includes(gone), `${id}: ${gone} is named without ${dot}'s dot`);
  }
});

test('the names the second review\'s give-way left off are named again, and no place gives way to another', () => {
  const want = { 'run/DCA': ['BOS'], 'run/LHR': ['NCE'], 'run/MIA': ['CUN'], 'run/PHX': ['IND', 'AUS'], 'run/SAN': ['RNO', 'SMF'],
    'run/TPA': ['LGA'], 'recheckA/PHL': ['BNA'], 'recheckB/EDI': ['LCY'], 'recheckB/LGA': ['BHM'] };
  for (const [id, codes] of Object.entries(want)) for (const c of codes) assert.ok(named(id).includes(c), `${id}: ${c} is named (${named(id).join(' ')})`);
  // Phoenix names more than main's 7, not 5
  assert.ok(named('run/PHX').length >= 7, 'Phoenix names ' + named('run/PHX').length);
  assert.doesNotMatch(MOD, /gaveWay|search\(true\)/, 'there is no give-way');
  for (const fl of FLOORS) assert.ok(!('gaveWay' in fl.out.L), fl.id);
});

test('the cap counts names, not places tried: Ottawa names 5 (it named 3), Detroit 6 (4)', () => {
  assert.equal(named('run/YOW').length, 5, 'Ottawa');
  assert.equal(named('run/DTW').length, 6, 'Detroit');
  // a refill never costs a place the first try named, and never names past the cap
  for (const fl of FLOORS) {
    if (!fl.out.full) continue;
    const cap = E.capFor(fl.H), first = namedCodes(fl.out.run(fl.out.pool.slice(0, cap))), now = namedCodes(fl.out.L);
    for (const c of first) assert.ok(now.includes(c), `${fl.id}: ${c} was named before the refill`);
    assert.ok(now.length <= cap, `${fl.id}: ${now.length} names over the cap of ${cap}`);
  }
});

test('the floor is drawn again in the order fillNames found: the same layout, at once', () => {
  for (const fl of FLOORS) {
    if (!fl.out.full) continue;
    assert.deepEqual(namedCodes(fl.out.run(fl.out.list)), namedCodes(fl.out.L), fl.id);
  }
  assert.match(MOD, /else \{ var fl = fillNames\(pool, capFor\(e\.H\), run\); list = fl\.list; lastLayout = fl\.L; memoSet\(fk, list\); \}/);
  assert.match(MOD, /else if \(hit\) \{ list = hit; lastLayout = run\(list\); \}/);
});

test('Yellowknife: the line to Calgary no longer climbs to the Arctic, and the North keeps its names', () => {
  for (const id of ['run/YZF', 'recheckA/YZF', 'recheckB/YZF']) {
    const fl = by(id), { L, hub } = fl.out;
    // Calgary lies south, just under the floor's foot: its line rose 95 px
    // over the airport (to the Arctic) and now rises 25, inside the lens
    const rr = L.routes.find((x) => x.code === 'YYC');
    assert.ok(rr, id + ': Calgary is drawn');
    const climb = hub.y - Math.min(...rr.runs.flat().map((s) => s.y));
    assert.ok(climb < 40, `${id}: Calgary's line climbs ${Math.round(climb)} px over the airport`);
    const pair = fl.out.run(fl.out.pool.filter((p) => p.code === 'YEG' || p.code === 'YYC'));
    const r2 = pair.routes.find((x) => x.code === 'YYC');
    assert.ok(r2 && hub.y - Math.min(...r2.runs.flat().map((s) => s.y)) < 40, id + ': and alone with Edmonton');
    // the North's new places are named; Fort Simpson is not: Norman Wells's
    // dot stands where its name would, and Vancouver's name (the next
    // flight's) on its other side
    for (const c of ['YVR', 'YEG', 'YCB', 'YVQ', 'YYH', 'YCO', 'YYC']) assert.ok(namedCodes(L).includes(c), `${id}: ${c} is named`);
    assert.ok(namedCodes(L).length > fl.main.named.length, id + ': more names than main');
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

test('the fixture is the page this build reads: rows with no code the map now reads, places with new positions, every place by its name', () => {
  const codes = (id) => by(id).places.map((p) => p[0]), nm = (id, c) => (by(id).places.find((p) => p[0] === c) || [])[4];
  for (const c of ['MDT', 'CVG', 'YUL', 'RIC', 'CLT']) assert.ok(codes('recheckA/PHL').includes(c), 'Philadelphia reads ' + c);
  assert.equal(nm('recheckA/PHL', 'YUL'), 'Montréal', '\'Montreal-Trdeau\' is named as the board names Montréal');
  assert.equal(nm('recheckA/PHL', 'MDT'), 'Harrisburg');
  for (const c of ['YTZ', 'YHU']) assert.ok(codes('recheckA/YQB').includes(c), 'Québec reads ' + c);
  assert.ok(codes('recheckA/YEG').includes('YFI'), 'Edmonton reads Firebag');
  assert.equal(nm('run/LGA', 'DJT'), 'West Palm Beach', 'DJT is named as PBI is');
  // no place is named by its code ('Xpl', 'Mga', 'Djt'), or by an airport's name
  for (const fl of FLOORS) for (const p of fl.places) {
    assert.ok(!/Djt|Donald J/.test(p[4]), fl.id + ': ' + p[4]);
    for (const n of p[5]) assert.notEqual(n.toUpperCase(), p[0], `${fl.id}: ${p[0]} is named '${n}'`);
  }
  // a list of stops is not read: Edmonton's rows to Whitehorse via Calgary
  // and to Inuvik via Yellowknife and Norman Wells keep no code
  for (const id of ['run/YEG', 'recheckA/YEG', 'recheckB/YEG']) for (const c of ['YXY', 'YEV']) assert.ok(!codes(id).includes(c), id + ' ' + c);
});
