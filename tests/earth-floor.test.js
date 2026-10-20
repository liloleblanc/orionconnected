'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — the planet under the departures and arrivals
// (fids-current/js/fids-earth.js), its pure half, with no browser:
//
//   · the next flight is the earliest still to come: never an overdue row,
//     never a cancelled or a gone one;
//   · what each floor height shows, and how many places a full floor names;
//   · where the routes and names go: every name inside the floor, clear of
//     every route (or the route cut away under it), no two names on top of
//     each other, no route without a name, and the same places whichever
//     language the board is showing;
//   · the time there: none without a zone, and otherwise exactly the board's
//     own clock (BoardStrings.boardTime), 24-hour on a board led by French;
//   · every picture is asked for on our own origin, under /earth/v1/.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'fids-current', 'js');
const E = require(path.join(JS, 'fids-earth.js'));
const BS = require(path.join(JS, 'board-strings.js'));
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');

function literal(marker, open, close) {
  const at = CORE.indexOf(marker);
  assert.ok(at >= 0, 'fids-core.js no longer declares ' + marker);
  let i = CORE.indexOf(open, at), d = 0, j = i;
  for (; j < CORE.length; j++) {
    if (CORE[j] === open) d++;
    else if (CORE[j] === close && --d === 0) break;
  }
  return CORE.slice(i, j + 1);
}
const COORDS = Function('return ' + literal('const COORDS = {', '{', '}'))();
const AP = Function('return ' + literal('const AP = {', '{', '}'))();
const coords = (c) => COORDS[c] || null;
const tz = (c) => (AP[c] && AP[c].tz) || null;

const MIN = 60000;
const at = (iso) => Date.parse(iso);
// a font about as wide as the board's: each character 0.58 of the size
const measure = (s, px) => String(s).length * px * 0.58;

// ── the next flight ─────────────────────────────────────────────────────────
test('the next flight is the earliest still to come: overdue, cancelled and gone rows are never it', () => {
  // LHR at 7:04 PM: BA135 to Mumbai was due at 6:15 PM and has not been
  // called gone. The strip must not name Mumbai 49 minutes late.
  const now = at('2026-10-12T19:04:00+01:00');
  const lhr = [
    { _locIata: 'BOM', dest: 'Mumbai | BOM', status: 'scheduled', _sortTs: at('2026-10-12T18:15:00+01:00') },
    { _locIata: 'DXB', dest: 'Dubai | DXB', status: 'departed', _sortTs: at('2026-10-12T19:05:00+01:00') },
    { _locIata: 'JFK', dest: 'New York | JFK', status: 'cancelled', _sortTs: at('2026-10-12T19:06:00+01:00') },
    { _locIata: 'BLR', dest: 'Bangalore | BLR', status: 'boarding', _sortTs: at('2026-10-12T19:20:00+01:00') },
    { _locIata: 'YYZ', dest: 'Toronto | YYZ', status: 'scheduled', _sortTs: at('2026-10-12T19:40:00+01:00') }
  ];
  const P = E.placesFrom(lhr, { dir: 'dep', ap0: 'LHR', now, coords, tz });
  assert.equal(P.next.code, 'BLR', 'Bangalore, the first flight whose time has not passed');
  assert.equal(P.list[0].code, 'BLR', 'the next flight leads the list');
  assert.ok(!P.list.some((p) => p.code === 'JFK'), 'a place whose only flight is cancelled is no place');
  assert.ok(P.list.find((p) => p.code === 'DXB').done, 'a flown place is drawn faint');
  assert.ok(!P.list.find((p) => p.code === 'BOM').isNext, 'Mumbai, overdue, is not the next flight');

  // YYZ at 4:10 PM: AC2406 to Saint John was due at 3:50 PM, delayed with no
  // new time; WS719 to Vancouver goes at 4:15 PM. A revised time counts.
  const now2 = at('2026-10-12T16:10:00-04:00');
  const yyz = [
    { _locIata: 'YSJ', dest: 'Saint John | YSJ', status: 'delayed', _sortTs: at('2026-10-12T15:50:00-04:00') },
    { _locIata: 'YVR', dest: 'Vancouver | YVR', status: 'scheduled', _sortTs: at('2026-10-12T16:15:00-04:00') },
    { _locIata: 'YHZ', dest: 'Halifax | YHZ', status: 'delayed', _sortTs: at('2026-10-12T16:00:00-04:00'), _revTs: at('2026-10-12T16:40:00-04:00') }
  ];
  const Q = E.placesFrom(yyz, { dir: 'dep', ap0: 'YYZ', now: now2, coords, tz });
  assert.equal(Q.next.code, 'YVR');
  // no flight to come at all: no next flight, the strip shows the bare edge
  const R = E.placesFrom(yyz, { dir: 'dep', ap0: 'YYZ', now: at('2026-10-12T23:00:00-04:00'), coords, tz });
  assert.equal(R.next, null);
});

test('a row with no code is read from the code it prints, and this airport is never a place', () => {
  const P = E.placesFrom([
    { dest: 'Halifax | YHZ', status: 'scheduled', _sortTs: 2e12 },
    { _locIata: 'YQM', dest: 'Moncton | YQM', status: 'scheduled', _sortTs: 2e12 }
  ], { dir: 'dep', ap0: 'YQM', now: 1e12, coords, tz });
  assert.deepEqual(P.list.map((p) => p.code), ['YHZ']);
  assert.equal(P.list[0].tz, 'America/Halifax', 'the zone comes from the AP table');
});

// ── sizes ───────────────────────────────────────────────────────────────────
test('what a floor shows at each height, and how many places it names', () => {
  assert.equal(E.modeFor(1920, 27, true), 'none');
  assert.equal(E.modeFor(1920, 28, true), 'edge');
  assert.equal(E.modeFor(1920, 59, true), 'edge');
  assert.equal(E.modeFor(1920, 60, true), 'strip');
  assert.equal(E.modeFor(1920, 149, true), 'strip');
  assert.equal(E.modeFor(1920, 150, true), 'full');
  assert.equal(E.modeFor(399, 400, true), 'none', 'too narrow');
  assert.equal(E.modeFor(1920, 400, false), 'none', 'an airport with no known place');
  assert.equal(E.capFor(150), 5);
  assert.equal(E.capFor(436), 15);
  assert.equal(E.capFor(1000), 16);
  for (let h = 150; h < 1200; h += 7) assert.ok(E.capFor(h) >= 5 && E.capFor(h) <= 16);
});

// ── the layout ──────────────────────────────────────────────────────────────
// A board's places, as the browser half hands them over: each with its name
// in every language the board shows.
function placesFor(ap, codes, names, now, dir) {
  const rows = codes.map((c, i) => ({ _locIata: c, dest: c, status: 'scheduled', _sortTs: now + (i + 1) * 20 * MIN }));
  const P = E.placesFrom(rows, { dir: dir || 'dep', ap0: ap, now, coords, tz });
  return P.list.map((p) => {
    const n = names[p.code] || [p.code, p.code];
    return { code: p.code, lat: p.lat, lon: p.lon, tz: p.tz, isNext: p.isNext, done: p.done, rank: p.rank, n: p.n, names: n.slice() };
  });
}
function draw(ap, places, W, H, lang, list, now) {
  const here = coords(ap);
  const full = H >= E.MIN_FULL;
  const view = full ? E.chooseView(here, places, W, H) : E.stripView(here, places.find((p) => p.isNext) || null, W, H);
  const idx = lang === 'fr' ? 1 : 0;
  // a strip names the next flight alone, as the browser half hands it over
  const shown = full ? places : places.filter((p) => p.isNext);
  return E.layout({
    view, W, H, here, full,
    places: shown.map((p) => Object.assign({}, p, { name: p.names[idx] })),
    timeOf: (z) => (z ? BS.boardTime(new Date(now), z, { list }) : ''),
    hereTz: tz(ap), measure
  });
}
const NAMES = {
  YYT: ["St. John's", "St. John's"], YDF: ['Deer Lake', 'Deer Lake'], YYZ: ['Toronto', 'Toronto'],
  YUL: ['Montreal', 'Montréal'], YHU: ['Montreal', 'Montréal'], YOW: ['Ottawa', 'Ottawa'], YYY: ['Mont-Joli', 'Mont-Joli'],
  BOM: ['Mumbai', 'Bombay'], BLR: ['Bangalore', 'Bangalore'], DXB: ['Dubai', 'Dubaï'], DMM: ['Dammam', 'Dammam'],
  JFK: ['New York', 'New York'], CDG: ['Paris', 'Paris'], NCE: ['Nice', 'Nice'], LIS: ['Lisbon', 'Lisbonne'], LHR: ['London', 'Londres'],
  MEL: ['Melbourne', 'Melbourne'], SYD: ['Sydney', 'Sydney'], BNE: ['Brisbane', 'Brisbane'], LST: ['Launceston', 'Launceston'],
  YHZ: ['Halifax', 'Halifax'], YVR: ['Vancouver', 'Vancouver'], CMN: ['Casablanca', 'Casablanca'], YSJ: ['Saint John', 'Saint John']
};
const SCENES = [
  { ap: 'YQM', codes: ['YYT', 'YYZ', 'YUL', 'YHU', 'YOW', 'YYY', 'YDF'], W: 1920, H: 473, now: at('2026-10-12T19:38:00-03:00') },
  { ap: 'YQM', codes: ['YYT', 'YYZ', 'YUL', 'YOW', 'YYY', 'YDF'], W: 1680, H: 442, now: at('2026-10-12T13:10:00-03:00') },
  { ap: 'YUL', codes: ['CDG', 'NCE', 'LIS', 'LHR', 'CMN', 'YHZ', 'YYZ'], W: 1920, H: 300, now: at('2026-10-12T19:00:00-04:00') },
  { ap: 'LHR', codes: ['BOM', 'BLR', 'DXB', 'DMM', 'JFK', 'YYZ', 'CDG'], W: 1920, H: 260, now: at('2026-10-12T16:00:00+01:00') },
  { ap: 'HBA', codes: ['MEL', 'SYD', 'BNE', 'LST'], W: 1920, H: 520, now: at('2026-10-13T19:25:00+11:00') },
  { ap: 'YYZ', codes: ['YVR', 'YHZ', 'YSJ'], W: 1920, H: 80, now: at('2026-10-12T16:10:00-04:00') },
  { ap: 'YYZ', codes: ['YVR'], W: 1680, H: 64, now: at('2026-10-12T16:10:00-04:00') }
];

function inside(b, x, y, pad) { return x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad; }

// (v24070: no other place's route passes under a name, as no other place's
// dot does: within 2 px of its box, the route's points standing 3 px apart.
// Its own route is cut away under it, and no other route is: each route has
// its own mask, so a route beside a name is never cut short)
test('every name lies inside the floor, no other place\'s route runs under it, its own is cut away, and it is clear of every other name', () => {
  for (const s of SCENES) {
    const places = placesFor(s.ap, s.codes, NAMES, s.now);
    const L = draw(s.ap, places, s.W, s.H, 'en', ['en', 'fr'], s.now);
    const tag = s.ap + ' ' + s.W + 'x' + s.H;
    assert.ok(L.labels.length >= 1, tag + ': names something');
    assert.ok(L.knockouts.every((k) => L.labels.some((lab) => lab.code === k.code)), tag + ': every cut is a name\'s own');
    L.labels.forEach((lab, i) => {
      const b = lab.box;
      assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= s.W && b.y1 <= s.H, `${tag}: ${lab.code} is cut by the floor's edge ${JSON.stringify(b)}`);
      for (const m of L.marks) {
        if (m.code !== lab.code) { assert.ok(!inside(b, m.x, m.y, 2), `${tag}: ${m.code}'s route runs under ${lab.code}`); continue; }
        if (!inside(b, m.x, m.y, 4)) continue;
        if (Math.hypot(m.x - lab.at.x, m.y - lab.at.y) < 14) continue;   // its own route, into its own dot
        assert.ok(L.knockouts.some((k) => k.code === lab.code && inside(k, m.x, m.y, 0)), `${tag}: ${lab.code}'s own route runs under it and is not cut away`);
      }
      L.labels.forEach((o, j) => {
        if (j <= i) return;
        // apart by a word space side by side, or a line one above the other
        const ob = o.box, hit = b.x0 < ob.x1 + 12 && b.x1 > ob.x0 - 12 && b.y0 < ob.y1 + 4 && b.y1 > ob.y0 - 4;
        assert.ok(!hit, `${tag}: ${lab.code} and ${o.code} touch`);
      });
    });
  }
});

test('no route is drawn without a name, and the airport keeps a clear zone', () => {
  for (const s of SCENES) {
    const places = placesFor(s.ap, s.codes, NAMES, s.now);
    const L = draw(s.ap, places, s.W, s.H, 'en', ['en', 'fr'], s.now);
    const named = new Set();
    L.labels.forEach((lab) => lab.rows.forEach((r) => r.texts.forEach((t) => { if (t.code) named.add(t.code); })));
    for (const r of L.routes) assert.ok(named.has(r.code), `${s.ap}: the route to ${r.code} has no name`);
    for (const d of L.dots) assert.ok(named.has(d.code), `${s.ap}: the dot for ${d.code} has no name`);
    if (L.hub && L.full) {
      for (const lab of L.labels) {
        const b = lab.box, nx = Math.max(b.x0, Math.min(L.hub.x, b.x1)), ny = Math.max(b.y0, Math.min(L.hub.y, b.y1));
        assert.ok(Math.hypot(nx - L.hub.x, ny - L.hub.y) >= 40, `${s.ap}: ${lab.code} crowds the airport's ring`);
      }
    }
  }
  // Launceston, 44 px from Hobart's ring at this scale, is left out with its route
  const s = SCENES[4], L = draw(s.ap, placesFor(s.ap, s.codes, NAMES, s.now), s.W, s.H, 'en', ['en'], s.now);
  if (L.tooNear.includes('LST')) assert.ok(!L.routes.some((r) => r.code === 'LST'));
});

test('Montréal: two airports with one name are one route and one name', () => {
  const s = SCENES[0], L = draw(s.ap, placesFor(s.ap, s.codes, NAMES, s.now), s.W, s.H, 'fr', ['fr', 'en'], s.now);
  const texts = [];
  L.labels.forEach((lab) => lab.rows.forEach((r) => r.texts.forEach((t) => { if (!t.time) texts.push(t.s); })));
  assert.equal(texts.filter((t) => t === 'Montréal').length, 1);
  assert.equal(L.routes.filter((r) => r.code === 'YUL' || r.code === 'YHU').length, 1);
});

test('the places stand still when the board turns language: only the words change', () => {
  for (const s of SCENES) {
    const places = placesFor(s.ap, s.codes, NAMES, s.now);
    const en = draw(s.ap, places, s.W, s.H, 'en', ['en', 'fr'], s.now);
    const fr = draw(s.ap, places, s.W, s.H, 'fr', ['en', 'fr'], s.now);
    assert.deepEqual(fr.labels.map((l) => [l.code, l.box]), en.labels.map((l) => [l.code, l.box]), s.ap + ': names moved');
    assert.deepEqual(fr.routes, en.routes, s.ap + ': routes moved');
    assert.deepEqual(fr.dots, en.dots, s.ap + ': dots moved');
  }
});

test('the time there: none without a zone, and otherwise the board own clock', () => {
  const s = SCENES[0];
  const places = placesFor(s.ap, s.codes, NAMES, s.now);
  // a place the AP table has no zone for prints no time, never a guess
  const noZone = places.map((p) => (p.code === 'YYT' ? Object.assign({}, p, { tz: null }) : p));
  for (const list of [['en', 'fr'], ['fr', 'en']]) {
    const L = draw(s.ap, noZone, s.W, s.H, list[0], list, s.now);
    const byCode = {};
    L.labels.forEach((lab) => lab.rows.forEach((r) => {
      const name = r.texts.find((t) => !t.time), time = r.texts.find((t) => t.time);
      byCode[name.code] = time ? time.s : '';
      if (time) assert.ok(r.clock && r.clock.hands, 'a time has its clock mark');
    }));
    assert.equal(byCode.YYT, '', "St. John's has no zone here: no time");
    const here = BS.boardTime(new Date(s.now), tz('YQM'), { list });
    for (const [code, t] of Object.entries(byCode)) {
      if (!t) continue;
      assert.equal(t, BS.boardTime(new Date(s.now), tz(code), { list }), code);
      assert.notEqual(t, here, code + ': the same clock as here is not printed');
      if (list[0] === 'fr') assert.match(t, /^\d\d:\d\d$/, 'a board led by French reads 24-hour');
      else assert.match(t, /^\d{1,2}:\d\d\s?[AP]M$/);
    }
    assert.equal(byCode.YDF, list[0] === 'fr' ? '20:08' : '8:08 PM', 'Deer Lake is half an hour ahead of Moncton');
  }
  // the clock mark's hands read the printed time, on a 12-hour dial
  assert.deepEqual(E.handsOf('8:30 PM'), { h: 255, m: 180 });
  assert.deepEqual(E.handsOf('20:30'), { h: 255, m: 180 });
  assert.equal(E.handsOf(''), null);
});

test('every picture is asked for on our own origin, under /earth/v1/', () => {
  const urls = [];
  for (let m = 1; m <= 12; m++) {
    urls.push(E.texSrc('world', 'day', 0, 0, m), E.texSrc(32, 'day', -90, -180, m), E.texSrc(16, 'day', 30, 120, m));
  }
  urls.push(E.texSrc('world', 'night', 0, 0, 1), E.texSrc(32, 'night', 30, -90, 7), E.texSrc(16, 'night', -30, -60, 7));
  for (const u of urls) {
    assert.ok(u.startsWith('/earth/v1/'), u);
    assert.match(u, /^\/earth\/v1\/(world\/(day-(0[1-9]|1[0-2])|night)|t(16|32)\/(day-(0[1-9]|1[0-2])|night)\/-?\d+_-?\d+)\.jpg$/, u);
  }
  assert.equal(E.texSrc(32, 'day', 30, -90, 10), '/earth/v1/t32/day-10/30_-90.jpg');
  assert.equal(E.BASE, '/earth/v1/');
  // and every square a view asks for is one the set holds
  for (const s of SCENES) {
    const here = coords(s.ap), places = placesFor(s.ap, s.codes, NAMES, s.now);
    const view = s.H >= E.MIN_FULL ? E.chooseView(here, places, s.W, s.H) : E.stripView(here, null, s.W, s.H);
    const lvl = E.levelFor(view, 1) || 16;
    for (const t of E.tilesFor(view, s.W, s.H, lvl)) {
      const f = path.join(ROOT, 'fids-current', E.texSrc(lvl, 'day', t.latS, t.lonW, 10));
      assert.ok(fs.existsSync(f), 'the set has ' + f);
    }
  }
});

test('the planet is the airport own: its view is centred on it, north up or turned at most 30°', () => {
  for (const s of SCENES) {
    const here = coords(s.ap), places = placesFor(s.ap, s.codes, NAMES, s.now);
    const view = s.H >= E.MIN_FULL ? E.chooseView(here, places, s.W, s.H) : E.stripView(here, places.find((p) => p.isNext) || null, s.W, s.H);
    const a = E.toScreen(E.vec(here[0], here[1]), view);
    assert.ok(!a.hidden && a.x > 0 && a.x < s.W && a.y > 0 && a.y < s.H, s.ap + ': the airport is in the floor');
    if (s.H >= E.MIN_FULL) assert.ok(Math.abs(view.psi) <= 30);
    // the planet's curve spans the whole floor: never a small ball
    assert.ok(view.R >= Math.max(s.H * 0.9, s.W * 0.6) - 1, s.ap + ': the planet spans the floor');
  }
});

// ── a name is its own dot's ────────────────────────────────────────────────
// Halifax at 1680 by 226 put "Ottawa" right under Montréal's dot, 21 px from
// it and 29 px from its own, with no line between: a passenger reads the two
// the wrong way round. A name now stands nearer its own dot than any other
// place's, or a leader line joins it to its own.
const HALIFAX = [
  { ap: 'YHZ', codes: ['YOW', 'EWR', 'YYZ', 'YUL', 'YYC', 'YYT', 'YEG'], W: 1680, H: 226 },
  { ap: 'YHZ', codes: ['YUL', 'YYZ', 'YOW', 'YYC', 'YYT', 'YEG', 'EWR'], W: 1920, H: 257 },
  { ap: 'YQB', codes: ['YYZ', 'YUL', 'EWR', 'PUJ', 'YGR', 'YWK'], W: 1920, H: 221 },
  { ap: 'YOW', codes: ['YVR', 'YYZ', 'YUL', 'IAD', 'EWR'], W: 1920, H: 185 },
  { ap: 'YEG', codes: ['DEN', 'YVR', 'YYZ', 'YWG', 'YYC'], W: 1920, H: 220 }
];
Object.assign(NAMES, {
  EWR: ['Newark', 'Newark'], YYC: ['Calgary', 'Calgary'], YEG: ['Edmonton', 'Edmonton'], PUJ: ['Punta Cana', 'Punta Cana'],
  YGR: ['Îles-de-la-Madeleine', 'Îles-de-la-Madeleine'], YWK: ['Wabush', 'Wabush'], IAD: ['Washington', 'Washington'],
  DEN: ['Denver', 'Denver'], YWG: ['Winnipeg', 'Winnipeg']
});
function boxDist(b, x, y) { return Math.hypot(Math.max(b.x0, Math.min(x, b.x1)) - x, Math.max(b.y0, Math.min(y, b.y1)) - y); }

test('a name reads as its own place: no other dot is as near it unless a leader line joins it to its own', () => {
  const now = at('2026-10-18T09:00:00-03:00');
  for (const s of SCENES.concat(HALIFAX.map((h) => Object.assign({ now }, h)))) {
    const L = draw(s.ap, placesFor(s.ap, s.codes, NAMES, s.now), s.W, s.H, 'en', ['en', 'fr'], s.now);
    for (const lab of L.labels) {
      if (lab.edge) continue;
      const own = L.dots.find((d) => d.code === lab.code);
      assert.ok(own, `${s.ap}: ${lab.code} is named but has no dot`);
      const dOwn = boxDist(lab.box, own.x, own.y);
      const lead = L.leaders.some((l) => Math.hypot(l.x1 - own.x, l.y1 - own.y) < 9);
      for (const d of L.dots) {
        if (d.code === lab.code) continue;
        const dd = boxDist(lab.box, d.x, d.y);
        if (dd < dOwn + E.AMBIG) assert.ok(lead, `${s.ap} ${s.W}x${s.H}: ${lab.code} is ${dOwn.toFixed(0)} px from its dot and ${dd.toFixed(0)} px from ${d.code}'s, with no line`);
      }
    }
  }
});

test('two places whose dots would touch: only the first is drawn', () => {
  const now = at('2026-10-18T09:00:00-03:00');
  NAMES.YHM = ['Hamilton', 'Hamilton']; NAMES.YTZ = ['Toronto Island', 'Toronto Island'];
  const scenes = SCENES.concat(HALIFAX.map((h) => Object.assign({ now }, h)),
    [{ ap: 'YHZ', codes: ['YEG', 'YYC', 'YYT', 'EWR', 'YYZ', 'LHR', 'YUL', 'YHM', 'LIS'], W: 1920, H: 292, now },
     { ap: 'YQM', codes: ['YYZ', 'YHM', 'YTZ', 'YUL', 'YOW'], W: 1680, H: 300, now }]);
  for (const s of scenes) {
    const L = draw(s.ap, placesFor(s.ap, s.codes, NAMES, s.now), s.W, s.H, 'en', ['en', 'fr'], s.now);
    L.dots.forEach((a, i) => L.dots.forEach((b, j) => {
      if (j <= i) return;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= E.DOT_GAP, `${s.ap} ${s.W}x${s.H}: ${a.code} and ${b.code} touch`);
    }));
  }
});

// ── a name is never read as a row ──────────────────────────────────────────
test('every name stands at least 10 px under the last row, on a strip as on a full floor', () => {
  assert.equal(E.NAME_TOP, 10);
  const now = at('2026-10-18T09:00:00-03:00');
  const strips = [
    { ap: 'SYD', codes: ['ADL'], W: 1920, H: 77 }, { ap: 'HBA', codes: ['OOL'], W: 1920, H: 64 },
    { ap: 'MCO', codes: ['DEN'], W: 1920, H: 96 }, { ap: 'ORD', codes: ['YYZ'], W: 1920, H: 120 },
    { ap: 'YYZ', codes: ['YVR'], W: 1680, H: 60 }, { ap: 'YOW', codes: ['YYZ'], W: 1920, H: 149 }
  ];
  NAMES.ADL = ['Adelaide', 'Adélaïde']; NAMES.OOL = ['Gold Coast', 'Gold Coast']; NAMES.ORD = ['Chicago', 'Chicago'];
  let named = 0;
  for (const s of SCENES.concat(strips.map((h) => Object.assign({ now }, h)))) {
    const L = draw(s.ap, placesFor(s.ap, s.codes, NAMES, s.now), s.W, s.H, 'en', ['en', 'fr'], s.now);
    for (const lab of L.labels) { named++; assert.ok(lab.box.y0 >= E.NAME_TOP, `${s.ap} ${s.W}x${s.H}: ${lab.code} starts ${lab.box.y0.toFixed(1)} px under the rows`); }
    if (s.H < E.MIN_FULL && s.H >= E.MIN_ROUTES) assert.equal(L.labels.length, 1, `${s.ap} ${s.W}x${s.H}: the strip names its next flight`);
  }
  assert.ok(named > 20);
  // a floor kept up under a page with more rows: its names keep to the part in sight
  const s = SCENES[0], places = placesFor(s.ap, s.codes, NAMES, s.now), here = coords(s.ap);
  const view = E.chooseView(here, places, s.W, s.H);
  const L = E.layout({ view, W: s.W, H: s.H, top: 120, here, full: true, places: places.map((p) => Object.assign({}, p, { name: p.names[0] })), timeOf: () => '', hereTz: tz(s.ap), measure });
  assert.ok(L.labels.length >= 1);
  for (const lab of L.labels) assert.ok(lab.box.y0 >= 120 + E.NAME_TOP, lab.code + ' is in the part cut off');
});

// ── places beyond the picture ──────────────────────────────────────────────
test('a place beyond the picture has an arrow where its route leaves, pointing the way the route goes on', () => {
  let arrows = 0;
  const now = at('2026-10-18T09:00:00-03:00');
  for (const s of SCENES.concat(HALIFAX.map((h) => Object.assign({ now }, h)))) {
    const L = draw(s.ap, placesFor(s.ap, s.codes, NAMES, s.now), s.W, s.H, 'en', ['en', 'fr'], s.now);
    for (const lab of L.labels) {
      const w = L.arrows.find((a) => a.code === lab.code);
      if (!lab.edge) { assert.ok(!w, `${s.ap}: ${lab.code} is in the picture and has an arrow`); continue; }
      assert.ok(w, `${s.ap} ${s.W}x${s.H}: ${lab.code} is beyond the picture with nothing to say so`);
      arrows++;
      assert.ok(Math.abs(w.x - lab.at.x) < 0.01 && Math.abs(w.y - lab.at.y) < 0.01, 'the arrow is where the name stands');
      // the route's own way at that point
      const r = L.routes.find((rt) => rt.code === lab.code), run = r.runs[0];
      const k = run.findIndex((q) => Math.abs(q.x - w.x) < 0.01 && Math.abs(q.y - w.y) < 0.01);
      assert.ok(k > 0, 'the arrow sits on its route');
      let j = k - 1; while (j > 0 && Math.hypot(run[k].x - run[j].x, run[k].y - run[j].y) < 3) j--;
      const a2 = Math.atan2(run[k].y - run[j].y, run[k].x - run[j].x);
      let dA = Math.abs(a2 - w.ang); if (dA > Math.PI) dA = 2 * Math.PI - dA;
      assert.ok(dA < 0.35, `${lab.code}: the arrow points ${(dA * 57.3).toFixed(0)}° off its route`);
      assert.match(E.arrowPath(w), /^M[\d.-]+,[\d.-]+(L[\d.-]+,[\d.-]+){3}Z$/);
    }
  }
  assert.ok(arrows >= 3, 'the scenes have places beyond the picture');
});

// ── one planet per direction ───────────────────────────────────────────────
test('a direction is framed once for all its pages: the view stays as the pages turn and flights leave', () => {
  const now = at('2026-10-18T09:00:00-04:00');
  const codes = ['YYZ', 'YUL', 'YHZ', 'YVR', 'YYC', 'YEG', 'YWG', 'EWR', 'IAD', 'ORD', 'LHR', 'CDG', 'FLL', 'MCO', 'CUN', 'PUJ', 'YQB', 'YQM'];
  const rows = codes.map((c, i) => ({ _locIata: c, dest: c, status: 'scheduled', _sortTs: now + (i + 1) * 20 * MIN }));
  const P = E.placesFrom(rows, { dir: 'dep', ap0: 'YOW', now, coords, tz });
  const store = {};
  const a = E.shapersOf(store, P.list);
  const here = coords('YOW');
  const view = E.chooseView(here, a.list, 1920, 300);
  // the next refresh: the first three have gone from the list; nothing moves
  const P2 = E.placesFrom(rows.slice(3), { dir: 'dep', ap0: 'YOW', now, coords, tz });
  const b = E.shapersOf(store, P2.list);
  assert.equal(b.sig, a.sig, 'places that left still frame the day');
  assert.equal(E.viewSig(E.chooseView(here, b.list, 1920, 300)), E.viewSig(view));
  // pages of that list are drawn on the one view: every page's layout holds
  for (let pg = 0; pg < 3; pg++) {
    const page = P.list.slice(pg * 6, pg * 6 + 6).map((p) => Object.assign({}, p, { name: p.code, names: [p.code] }));
    const L = E.layout({ view, W: 1920, H: 300, here, full: true, places: page, timeOf: () => '', hereTz: tz('YOW'), measure });
    assert.ok(L.labels.length >= 1, 'page ' + pg + ' names its places');
  }
  // a new place joins the day: the signature changes (a new view may follow)
  const c = E.shapersOf(store, [{ code: 'SFO', lat: 37.6, lon: -122.4, n: 1 }]);
  assert.notEqual(c.sig, a.sig);
  assert.ok(c.list.length <= 40, 'at most the 40 busiest places frame a view');
});
