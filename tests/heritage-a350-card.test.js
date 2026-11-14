'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// COMING TO THE FLEET — the Airbus A350-1000 card of the archive deck.
//
// A supplied side drawing of an A350-1000 in the current Air Canada livery,
// an aeroplane Air Canada has ordered and does not fly yet: on 11 February
// 2026 it announced an order for eight with rights to purchase eight more,
// and its own release says the first delivery is expected in 2030, deliveries
// beginning in the second half of 2030.
// The card is in the Air Canada set (Air Canada pages only, never a United
// gate) under its own heading, Coming to the fleet, never From the archive,
// and its caption says when the first ones are expected and that the picture
// is an artist's impression: a passenger must never take it for an aeroplane
// flying today. The registration and fleet number on the drawing are the
// drawing's, and the card prints neither.
//
// tests/heritage-dream-card.test.js holds the set card for card (the new card
// is in its frozen list) and walks every airport and airline the boards know;
// this file holds the card itself.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const STORE = require('../fids-current/js/board-strings.js');

const KEY = 'air-canada-a350-1000';
const PICTURE = '/aircraft/heritage/air-canada-a350-1000.png';
const HEADING = 'heritageComingKicker';
const TYPE = 'Airbus A350-1000';

function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must define ${name}`);
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
const MARKS_SRC = /var HERITAGE_MARKS = \[[\s\S]*?\n\];/.exec(SRC)[0];
const MARKS = new Function(MARKS_SRC + '\nreturn HERITAGE_MARKS;')();
const byKey = Object.fromEntries(MARKS.map((m) => [m.key, m]));

// One gate, re-aimed between questions: the shipping functions lifted out of
// fids-core.js, as tests/heritage-dream-card.test.js runs them. AP is empty,
// so a Canadian airport is one whose code starts with Y, as on the board.
function board() {
  const win = {};
  const langs = ['en', 'fr'];
  let heritage = '';
  const doc = { documentElement: { classList: { contains: () => false } } };
  // frFirstAirport too, so a Québec gate leads in French as the board does
  const names = ['_heritageIsCanadian', '_heritageIsAirCanada', '_heritageOnAirCanadaGate',
                 '_heritagePick', '_renderHeritageCard', '_buildGateAdSlideList', 'frFirstAirport'];
  const fam = /var HERITAGE_AC_FAMILY = \{[^}]*\};/.exec(SRC)[0];
  const demo = /var HERITAGE_AC_DEMO = \{[^}]*\};/.exec(SRC)[0];
  const fns = new Function('AP', 'window', 'document', 'getGateAds', '_welcomeCardData', 'BoardStrings', 'langs', '_heritageCode',
    MARKS_SRC + '\n' + fam + '\n' + demo + '\n' + names.map(lift).join('\n')
      + '\nreturn { render: _renderHeritageCard,'
      + ' deck: function () { return _buildGateAdSlideList().map(function (s) { return s.type; }); } };')(
    {}, win, doc, () => [], (c) => ({ welcome: c }), STORE, langs, () => heritage);
  return {
    at(iata, flight, opts = {}) {
      for (const k of Object.keys(win)) delete win[k];
      win._gateIata = iata;
      if (flight) { win._gateCurrentFlight = flight; win._gateCurrentAirline = flight.airline || ''; }
      heritage = opts.heritage || '';
      langs.length = 0;
      (opts.langs || ['en', 'fr']).forEach((l) => langs.push(l));
      return this;
    },
    deck: () => fns.deck(),
    draw() { const el = { innerHTML: '' }; return fns.render(el) ? el.innerHTML : null; },
    // the cards one gate shows, in order, for `turns` visits of the slide (null where it draws nothing)
    cards(turns) {
      const out = [];
      for (let i = 0; i < turns; i++) {
        const html = this.draw();
        if (html == null) { out.push(null); continue; }
        const pic = /class="hcard-plane" src="([^"]+)"/.exec(html);
        const mark = /class="hcard-mark" src="([^"]+)"/.exec(html);
        const m = MARKS.find((k) => pic && k.aircraft === pic[1] && mark && k.file === mark[1])
          || MARKS.find((k) => !k.aircraft && mark && k.file === mark[1]);
        out.push(m ? m.key : 'unknown');
      }
      return out;
    },
    // the first drawing of this card within `turns` visits
    find(turns) {
      for (let i = 0; i < turns; i++) {
        const html = this.draw();
        if (html && html.includes('src="' + PICTURE + '"')) return html;
      }
      return null;
    }
  };
}
const TURNS = MARKS.length + 2;
// the heading as the card prints it: tags out until none is left, spaces as spaces
const kicker = (html) => { let s = /<div class="hcard-kicker">([\s\S]*?)<\/div>/.exec(html)[1], was; do { was = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== was); return s.replace(/&nbsp;/g, ' '); };

// ── the record ─────────────────────────────────────────────────────────────

test('the card: an Airbus A350-1000 in the Air Canada set, under its own heading', () => {
  const m = byKey[KEY];
  assert.ok(m, 'the card is in the deck');
  assert.equal(m.name, 'Air Canada');
  assert.equal(m.type, TYPE, 'the type as the boards name it');
  assert.match(SRC, /'351':'Airbus A350-1000'/, 'which is the name IATA_AIRCRAFT gives the 351');
  assert.equal(m.aircraft, PICTURE);
  assert.equal(m.heading, HEADING, 'it names its own heading');
  assert.notEqual(m.heading, 'heritageKicker', 'never From the archive');
  assert.notEqual(m.heading, 'heritageDreamKicker', 'nor Dream livery: the livery is real, the aeroplane is coming');
  assert.equal(m.gates, undefined, 'no gates: the Air Canada set, Air Canada pages only');
  assert.equal(m.airports, '*CA', 'every Canadian airport, where the rest of the set runs');
  assert.ok(!m.credit && !m.endorsement, 'a supplied drawing: no credit line, no second mark');
  // the same lockup the 2017-livery DC-9 card and the live Air Canada boards use, nothing new
  assert.equal(m.file, '/logos/airlines/canadian/air-canada.svg');
  assert.equal(m.file, byKey['air-canada-dc9-2017'].file, 'the mark of the 2017-livery DC-9 card');
  assert.match(SRC, /var LOCAL_LOGOS = \{[\s\S]{0,400}?'AC': '\/logos\/airlines\/canadian\/air-canada\.svg'/, 'the file the live boards map AC to');
  assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', m.file.replace(/^\//, ''))), 'on disk');
});

test('its place in the rotation: no two Air Canada widebodies back to back', () => {
  // The board rotates each airport pool in set order and wraps. The widebodies
  // of the set (the 767s, the TriStars and this one) come every other card.
  const WIDE = ['air-canada-767', 'air-canada-767-87', 'air-canada-l1011-87', 'air-canada-l1011-93', KEY];
  const keys = MARKS.map((k) => k.key);
  assert.equal(keys.indexOf(KEY), keys.indexOf('air-canada-dc9-93') + 1, 'after the 1993 DC-9');
  assert.equal(keys.indexOf(KEY) + 1, keys.indexOf('air-canada-dc8-80'), 'and before the 1980 DC-8');
  assert.equal(keys[keys.length - 1], 'air-canada-l1011-93', 'the 1993 TriStar is still last');
  const dist = (pool, a, b) => { const gap = Math.abs(pool.indexOf(a) - pool.indexOf(b)); return Math.min(gap, pool.length - gap); };
  // the Atlantic pool (with Air Atlantic and Air Nova) and the pool of every other Canadian airport
  for (const ia of ['YHZ', 'YVR']) {
    const pool = MARKS.filter((mk) => !mk.gates && (mk.airports === '*CA' || (Array.isArray(mk.airports) && mk.airports.includes(ia)))).map((mk) => mk.key);
    assert.ok(pool.includes(KEY), 'the card runs at ' + ia);
    for (const a of WIDE) for (const b of WIDE) {
      if (a < b) assert.ok(dist(pool, a, b) >= 2, a + ' and ' + b + ' are not back to back at ' + ia + ' (' + dist(pool, a, b) + ')');
    }
  }
});

// ── where it runs ──────────────────────────────────────────────────────────

const AC_ROWS = [
  { flight: 'AC870', airline: 'AC' },
  { flight: 'AC1983', airline: 'AC', _opCode: 'RV' },
  { flight: 'QK8790', airline: 'QK' },
  { flight: 'ACA659', airline: 'ACA' }
];

test('it runs on Air Canada pages at Canadian airports, within one turn of the deck', () => {
  const b = board();
  for (const ia of ['YYZ', 'YUL', 'YVR', 'YHZ', 'YQM', 'YYT']) {
    for (const row of AC_ROWS) {
      b.at(ia, row);
      assert.ok(b.deck().includes('heritage'), `${row.flight} at ${ia}: the archive slot is there`);
      assert.ok(b.cards(TURNS).includes(KEY), `${row.flight} at ${ia}: and the A350-1000 comes round`);
    }
  }
  // the heritage demonstration gates are Air Canada pages too
  assert.ok(b.at('YHZ', { flight: '500', airline: 'ANV' }, { heritage: 'ANV' }).cards(TURNS).includes(KEY), 'the Air Nova demonstration gate');
});

test('and never on a United gate, another airline, an Air Canada gate abroad or a board with no gate flight', () => {
  const b = board();
  for (const ia of ['YYZ', 'YUL', 'YVR', 'ORD', 'EWR', 'FRA']) {
    for (const row of [{ flight: 'UA1234', airline: 'UA' }, { flight: 'UAL951', airline: 'UAL' }, { flight: 'UA4321', airline: 'UA', _opCode: 'OO' }]) {
      const seen = b.at(ia, row).cards(TURNS * 2);
      assert.ok(!seen.includes(KEY), `${row.flight} at ${ia} never draws the A350-1000`);
    }
    for (const row of [{ flight: 'WS813', airline: 'WS' }, { flight: 'PD2382', airline: 'PD' }, { flight: 'DL1432', airline: 'DL' }, { flight: 'PB924', airline: 'PB' }, { flight: '', airline: '' }]) {
      b.at(ia, row);
      assert.ok(!b.deck().includes('heritage'), `${row.flight || 'a blank row'} at ${ia}: no archive slot`);
      assert.equal(b.draw(), null, 'and nothing drawn');
    }
    b.at(ia, null);
    assert.equal(b.draw(), null, `no gate flight at ${ia}: nothing`);
  }
  for (const ia of ['ZRH', 'LHR', 'CDG', 'LAX', 'NRT']) {
    b.at(ia, { flight: 'AC870', airline: 'AC' });
    assert.ok(!b.deck().includes('heritage'), `an Air Canada gate at ${ia} carries no archive slot`);
    assert.equal(b.draw(), null, `and draws nothing at ${ia}: the card runs where the rest of the set runs`);
  }
});

// ── the words ──────────────────────────────────────────────────────────────

const COMING = { en: 'Coming to the fleet', fr: 'Bientôt dans la flotte', es: 'Próximamente en la flota', de: 'Bald in der Flotte',
                 it: 'Presto nella flotta', pt: 'Em breve na frota', ja: '導入予定の新機材', zh: '即将加入机队', ar: 'قريبًا في الأسطول' };
// An artist's impression, in the words each language has for one. The Italian
// is illustrazione artistica (88.2% of the line at 1680 x 1050): the more usual
// rappresentazione artistica measured 96.3%, too close to a second row. The
// longest line is the Arabic (91.8%), then the English and the Spanish
// (90.8%), each measured after document.fonts.ready following the draw.
const IMPRESSION = { en: 'artist’s impression', fr: 'vue d’artiste', es: 'recreación artística', de: 'Visualisierung', it: 'illustrazione artistica',
                     pt: 'concepção artística', ja: 'イメージ図', zh: '艺术效果图', ar: 'تصوّر فني' };
// And when: expected from 2030, or the first deliveries expected in 2030.
const WHEN = { en: 'expected from 2030', fr: 'attendu dès 2030', es: 'previsto para 2030', de: 'ab 2030 erwartet', it: 'atteso dal 2030',
               pt: 'esperado em 2030', ja: '2030年に初号機受領予定', zh: '预计2030年起交付', ar: 'أولى التسليمات متوقعة في 2030' };

test('the heading: Coming to the fleet in nine languages, never From the archive', () => {
  assert.deepEqual(Object.keys(COMING).sort(), STORE.LANGS.slice().sort(), 'all nine board languages');
  const e = STORE.entry(HEADING);
  assert.ok(e, 'the heading is in the store');
  for (const l of STORE.LANGS) {
    assert.equal(e[l], COMING[l], 'the words, in ' + l);
    assert.notEqual(e[l], STORE.bs('heritageKicker', l), 'not From the archive, in ' + l);
    assert.notEqual(e[l], STORE.bs('heritageDreamKicker', l), 'not Dream livery, in ' + l);
    if (l !== 'en') assert.doesNotMatch(e[l], /coming|fleet/i, 'in its own words, not the English ones, in ' + l);
  }
  assert.equal(new Set(STORE.LANGS.map((l) => e[l])).size, STORE.LANGS.length, 'nine different headings: none left in another language');
  assert.deepEqual(MARKS.filter((m) => m.heading === HEADING).map((m) => m.key), [KEY], 'the one card that says it');
});

test('the caption: the type, 2030 and an artist impression, in nine languages, and nothing that says it flies', () => {
  assert.deepEqual(Object.keys(IMPRESSION).sort(), STORE.LANGS.slice().sort());
  assert.deepEqual(Object.keys(WHEN).sort(), STORE.LANGS.slice().sort());
  const e = STORE.entry('heritage:' + KEY);
  assert.ok(e, 'the caption is in the store');
  const seen = new Set();
  for (const l of STORE.LANGS) {
    const cap = e[l];
    assert.ok(cap, 'a caption in ' + l);
    const parts = cap.split(' · ');
    assert.equal(parts.length, 3, 'type · when · what the picture is, as the other cards are shaped, in ' + l);
    assert.equal(parts[0], '{TYPE}', 'the type comes from the card, in ' + l);
    assert.equal(parts[1], WHEN[l], 'expected in 2030, in ' + l);
    assert.equal(parts[2], IMPRESSION[l], 'an artist impression, in ' + l);
    assert.deepEqual(cap.match(/\d+/g), ['2030'], 'one number, the year: no registration, no fleet number, no years of service, in ' + l);
    assert.doesNotMatch(cap, /GYQM|881|Airbus|エアバス|空客|إيرباص|Air Canada|エア・カナダ|加航|إير كندا/, 'no mark, no fin number, no maker and no airline spelled in the stored line, in ' + l);
    if (l !== 'en') assert.doesNotMatch(cap, /\bexpected\b|\bartist’s\b|\bimpression\b/i, 'in its own words, not the English ones, in ' + l);
    seen.add(cap);
  }
  assert.equal(seen.size, STORE.LANGS.length, 'nine different lines: none left in another language');
  assert.equal(STORE.fill(e.en, { TYPE }), 'Airbus A350-1000 · expected from 2030 · artist’s impression', 'the English line as it prints');
  assert.equal(STORE.fill(e.fr, { TYPE }), 'Airbus A350-1000 · attendu dès 2030 · vue d’artiste', 'and the French');
});

test('the card as drawn, in every language: its heading, the caption with its type, the mark and the picture', () => {
  const b = board();
  const html = b.at('YYZ', AC_ROWS[0]).find(TURNS);
  assert.ok(html, 'an Air Canada gate at Toronto comes to it');
  assert.match(html, /<div class="hcard-kicker"><span class="bs-h" lang="en">Coming to the fleet<\/span> &nbsp;\|&nbsp; <span class="bs-h" lang="fr">Bientôt dans la flotte<\/span><\/div>/, 'the heading, English then French');
  assert.match(html, /<img class="hcard-mark" src="\/logos\/airlines\/canadian\/air-canada\.svg" alt="Air Canada">/, 'the live lockup');
  assert.match(html, /<img class="hcard-plane" src="\/aircraft\/heritage\/air-canada-a350-1000\.png" alt=""/, 'the picture, over the sky');
  assert.match(html, /<div class="hcard-line"><span class="bs-h" lang="en">Airbus A350-1000 · expected from 2030 · artist’s impression<\/span><\/div>/, 'the English line');
  assert.match(html, /<div class="hcard-line hcard-line-2"><span class="bs-h" lang="fr">Airbus A350-1000 · attendu dès 2030 · vue d’artiste<\/span><\/div>/, 'and the French line');
  assert.doesNotMatch(html, /From the archive|Depuis les archives|Dream livery|Livrée de rêve/, 'neither the archive heading nor the what-if one');
  assert.doesNotMatch(html, /hcard-credit"|hcard-endorse/, 'no credit line and no endorsement');
  assert.doesNotMatch(html, /GYQM|881/, 'no registration and no fleet number');
  // French first where the board puts French first
  const yul = b.at('YUL', AC_ROWS[0]).find(TURNS);
  assert.match(yul, /<div class="hcard-kicker"><span class="bs-h" lang="fr">Bientôt dans la flotte<\/span>/, 'Montréal leads in French');
  assert.match(yul, /<div class="hcard-line"><span class="bs-h" lang="fr">Airbus A350-1000 · attendu dès 2030/, 'the caption too');
  // every language, with the type in its place and the heading over it
  for (const l of STORE.LANGS) {
    const h = b.at('YVR', AC_ROWS[0], { langs: l === 'en' ? ['en', 'fr'] : [l, 'en'] }).find(TURNS);
    assert.ok(h, 'drawn in ' + l);
    const line = STORE.fill(STORE.bs('heritage:' + KEY, l), { TYPE });
    assert.ok(h.includes('lang="' + l + '"' + (l === 'ar' ? ' dir="rtl"' : '') + '>' + line + '</span>'), 'the ' + l + ' line: ' + line);
    assert.ok(line.includes('2030') && line.includes(IMPRESSION[l]), 'it says 2030 and artist impression, in ' + l);
    assert.ok(kicker(h).includes(COMING[l]), 'under ' + COMING[l]);
    assert.ok(!kicker(h).includes(STORE.bs('heritageKicker', l)), 'and never ' + STORE.bs('heritageKicker', l));
    assert.doesNotMatch(h.replace(/ onloadedmetadata="[^"]*"/, ''), /[{}]/, 'no placeholder left, in ' + l);
  }
});

// ── the picture ────────────────────────────────────────────────────────────

// A PNG as RGBA bytes: 8-bit RGBA, not interlaced, which is what the card tool writes.
function rgbaOf(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('latin1', 1, 4), 'PNG');
  let p = 8, w = 0, h = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0); h = d.readUInt32BE(4);
      assert.equal(d[8], 8, 'eight bits a channel');
      assert.equal(d[9], 6, 'RGBA: the sky shows round the aeroplane');
      assert.equal(d[12], 0, 'not interlaced');
    } else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], inp = y * (stride + 1) + 1, o = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? px[o + i - 4] : 0, b = y ? px[o - stride + i] : 0, c = (i >= 4 && y) ? px[o - stride + i - 4] : 0;
      let v = raw[inp + i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      px[o + i] = v & 255;
    }
  }
  return { w, h, px };
}

test('its picture: a cut-out at the working width, clear all round, with no pale line under the dark paint', () => {
  const file = path.join(ROOT, 'fids-current', PICTURE.replace(/^\//, ''));
  assert.ok(fs.existsSync(file), PICTURE + ' is on disk');
  const { w, h, px } = rgbaOf(file);
  assert.equal(w, 2272, 'scaled to the 2272 px of the other card pictures');
  assert.ok(Math.abs(w / h - 2272 / 585) < 0.01, 'at the proportions of the drawing (it is ' + w + ' x ' + h + ')');
  const A = (x, y) => px[(y * w + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [0, h - 1], [w - 1, h - 1]]) assert.equal(A(x, y), 0, 'the corner at ' + x + ',' + y + ' is clear');
  // The top of the fin is the highest and the furthest aft point of the
  // drawing, so the top right corner is the tip of the fin: dark fin paint,
  // partly clear, never page (the page was white).
  const tip = px.subarray((w - 1) * 4, (w - 1) * 4 + 4);
  assert.ok(tip[3] === 0 || (tip[3] < 255 && Math.max(tip[0], tip[1], tip[2]) <= 60), 'the top right corner is clear or the dark tip of the fin, partly clear (it is ' + Array.from(tip) + ')');
  const touches = { left: false, right: false, top: false, bottom: false };
  for (let y = 0; y < h; y++) { if (A(0, y)) touches.left = true; if (A(w - 1, y) || A(w - 2, y)) touches.right = true; }
  for (let x = 0; x < w; x++) { if (A(x, 0) || A(x, 1)) touches.top = true; if (A(x, h - 1)) touches.bottom = true; }
  assert.deepEqual(touches, { left: true, right: true, top: true, bottom: true }, 'cropped to the drawing: no margin of page round it');
  let clear = 0, solid = 0, haze = 0;
  for (let i = 3; i < px.length; i += 4) { if (px[i] === 0) clear++; else if (px[i] === 255) solid++; else if (px[i] <= 6) haze++; }
  assert.ok(clear / (w * h) > 0.5, 'more than half the picture is sky (' + (100 * clear / (w * h)).toFixed(1) + '%)');
  assert.ok(solid / (w * h) > 0.3, 'and the aeroplane is solid (' + (100 * solid / (w * h)).toFixed(1) + '%)');
  assert.equal(haze, 0, 'no haze left off the outline');

  // NO PAGE LEFT UNDER THE BLACK BELLY. The edge of the supplied cut-out (the
  // second, 7899 x 3164) is feathered over about six of its pixels: un-mixed
  // two pixels deep, as the 787-8 was, the feather stayed a pale line under
  // the black belly, the chin and the engine and round the fin over a dark
  // sky (1257 pixels by this count); five deep, 99; six deep, 15, the
  // smallest depth that passes. The first cut-out gave 790 at two and 13 at
  // six. Counted here: a pixel that shows (opacity 100 or more) and is not
  // dark (every channel 60 or more), on the outline (clear sky within one
  // pixel), on a dark part (solid paint of 40 or less within three pixels,
  // and no light solid paint).
  let rim = 0;
  const at = (x, y) => (y * w + x) * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = at(x, y);
      if (px[o + 3] < 100 || px[o] < 60 || px[o + 1] < 60 || px[o + 2] < 60) continue;
      let sky = false, dark = false, light = false;
      for (let yy = Math.max(0, y - 3); yy <= Math.min(h - 1, y + 3); yy++) {
        for (let xx = Math.max(0, x - 3); xx <= Math.min(w - 1, x + 3); xx++) {
          const k = at(xx, yy);
          if (px[k + 3] === 0 && Math.abs(xx - x) <= 1 && Math.abs(yy - y) <= 1) sky = true;
          if (px[k + 3] >= 250 && Math.max(px[k], px[k + 1], px[k + 2]) <= 40) dark = true;
          if (px[k + 3] >= 250 && Math.min(px[k], px[k + 1], px[k + 2]) >= 150) light = true;
        }
      }
      if (sky && dark && !light) rim++;
    }
  }
  assert.ok(rim <= 40, 'the page is still in the outline of the dark paint: ' + rim + ' light pixels on it');
  const tool = fs.readFileSync(path.join(ROOT, 'scripts', 'heritage-sky', 'card-cutout.py'), 'utf8');
  assert.match(tool, /\[width\] \[tolerance\] \[rim\]/, 'the tool that made it takes the depth of the page in the outline');
});

test('the picture is in the build: under the folder the deploy serves, in the size it allows', () => {
  const wr = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  assert.match(wr, /"assets":\s*\{[\s\S]*?"directory":\s*"fids-current"/, 'the deploy serves fids-current as its static assets');
  const file = path.join(ROOT, 'fids-current', PICTURE.replace(/^\//, ''));
  const size = fs.statSync(file).size;
  assert.ok(size > 100000 && size < 2 * 1024 * 1024, 'a picture of card size (' + size + ' bytes), far under the 25 MiB a static asset may be');
  const ignore = path.join(ROOT, 'fids-current', '.assetsignore');
  if (fs.existsSync(ignore)) {
    const pats = fs.readFileSync(ignore, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    assert.ok(!pats.some((p) => /aircraft|heritage|\*\.png/.test(p)), 'and nothing keeps it out of the deploy');
  }
  // nothing else to register: the asset catalog walks logos/ and assets/ only (scripts/assets/build-manifest.py)
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts', 'assets', 'build-manifest.py'), 'utf8'), /only walk inside logos\/ and assets\//);
});
