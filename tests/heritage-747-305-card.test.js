'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// DREAM LIVERY — a real Air Canada Boeing 747-133 in the livery of 2017.
//
// C-FTOE, fleet 305, the fifth and last of the Air Canada 747-100s, flew for
// the airline from its delivery on 13 May 1974 to its withdrawal on 15 October
// 1998. The supplied side drawing shows it in the scheme unveiled in 2017
// (black fin with the red rondelle, black titles, black belly), which it
// never wore: in its last years it was in the 1993 livery.
// So the card is a what-if, like the Future Retro DC-9: Dream livery over it,
// never From the archive, and a caption with the type, the years it really
// flew (1974–1998) and what-if beside the 2017 livery, in nine languages. No
// registration and no fleet number is printed: no archive caption prints one.
// It is in the Air Canada set (Air Canada pages at Canadian airports only,
// never a United gate). The deck spreads the three fin 305 cards evenly and
// keeps the widebody pairs (the Canadian DC-10 counted) to the fewest each
// pool allows; in the Atlantic pool no two Air Canada widebodies meet.
//
//
// FROM THE ARCHIVE — the same aeroplane in the 1980 livery it really wore.
// The supplied drawing shows C-FTOE in the red capitals and single red
// cheatline of 1980, which reached it in 1982 and which it wore into 1993. So
// that card is a plain archive card, From the archive over it as over the
// DC-8-63, with the mark of the 1980 cards and the DC-8-63 line: the type, the
// same years as the Dream livery card (1974–1998) and the 1980 livery, in nine
// languages. It is the first Air Canada card of the deck. Its picture is from
// the drawing as its author corrected it (v2), the ring of the rondelle open
// at its foot for the stem of the leaf.
//
//
// FROM THE ARCHIVE — and the same aeroplane in the 1993 livery, the one it
// wore in its last years. The supplied drawing shows C-FTOE white, the small
// red rondelle ahead of AIR CANADA in red capitals, the big red leaf on the
// dark fin, and the small Star Alliance star behind the cockpit, which dates
// it to 1997–98. A plain archive card like the 1980 one, with the mark of the
// 1993 DC-9 and TriStar and the 1980 card line with their 1993 livery words,
// in nine languages.
//
// THE DECK. With three cards of fin 305 the deck is laid out so that they
// come 6, 6 and 6 cards apart in the Atlantic pool (eighteen cards, with Air
// Atlantic and Air Nova) and 6, 5 and 5 apart in the pool of sixteen at every
// other Canadian airport, the most even both pools allow at once. Counted
// with the Canadian Airlines DC-10, nine cards of each pool are widebodies:
// in the Atlantic pool (nine of eighteen) they come every other card, with no
// back-to-back pair, and elsewhere (nine of sixteen) two pairs cannot be
// avoided, and there are two. The DC-10 sits beside no 747, and the DC-9,
// DC-8, 767 and TriStar spacing holds.
// 2026-11-15 — the counts were seventeen and fifteen, with 5, 6 and 6 and
// 5, 5 and 5, one pair and three, until the 727 came in after the A350-1000
// and the 1965 DC-8 moved in between the 1980 767 and the DC-10
// (tests/heritage-727-card.test.js).
//
// tests/heritage-dream-card.test.js holds the set card for card (the three
// cards are in its frozen list) and walks every airport and airline the
// boards know; this file holds the three cards themselves.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const STORE = require('../fids-current/js/board-strings.js');

const KEY = 'air-canada-747-305-2017';
const PICTURE = '/aircraft/heritage/air-canada-747-305-2017.png';
const HEADING = 'heritageDreamKicker';
const TYPE = 'Boeing 747-133';
// the archive card of the same aeroplane, in the 1980 livery
const ARCHIVE = 'air-canada-747-305-80';
const ARCHIVE_PICTURE = '/aircraft/heritage/air-canada-747-305-ac80.png';
// and in the 1993 livery
const ARCHIVE93 = 'air-canada-747-305-93';
const ARCHIVE93_PICTURE = '/aircraft/heritage/air-canada-747-305-ac93.png';
const FIN305 = [ARCHIVE, KEY, ARCHIVE93];

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
// the comment of a record, from the brace that opens it to its key
const noteOf = (key) => {
  const at = MARKS_SRC.indexOf("key: '" + key + "'");
  assert.ok(at > 0, 'the record is in the source');
  return MARKS_SRC.slice(MARKS_SRC.lastIndexOf('\n  {\n', at), at);
};
const NOTE = noteOf(KEY);
const ARCHIVE_NOTE = noteOf(ARCHIVE);
const ARCHIVE93_NOTE = noteOf(ARCHIVE93);

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
    // the first drawing of this card (or of the card with the picture given) within `turns` visits
    find(turns, picture = PICTURE) {
      for (let i = 0; i < turns; i++) {
        const html = this.draw();
        if (html && html.includes('src="' + picture + '"')) return html;
      }
      return null;
    }
  };
}
const TURNS = MARKS.length + 2;
// the heading as the card prints it: tags out until none is left, spaces as spaces
const kicker = (html) => { let s = /<div class="hcard-kicker">([\s\S]*?)<\/div>/.exec(html)[1], was; do { was = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== was); return s.replace(/&nbsp;/g, ' '); };

// ── the record ─────────────────────────────────────────────────────────────

test('the card: a Boeing 747-133 in the Air Canada set, under Dream livery', () => {
  const m = byKey[KEY];
  assert.ok(m, 'the card is in the deck');
  assert.equal(m.name, 'Air Canada');
  assert.equal(m.type, TYPE, 'the type, from the record');
  // the boards name no 747-100 (no 741 in IATA_AIRCRAFT), so the record carries the type text
  const iata = /const IATA_AIRCRAFT = \{[\s\S]*?\n\};/.exec(SRC);
  assert.ok(iata, 'the IATA_AIRCRAFT table is found');
  assert.doesNotMatch(iata[0], /'741'\s*:/, 'no 741 there: if one is added, the card should take its name');
  assert.equal(m.aircraft, PICTURE);
  assert.equal(m.heading, HEADING, 'Dream livery, as the Future Retro DC-9');
  assert.equal(m.heading, byKey['air-canada-dc9-2017'].heading, 'the heading of the 2017-livery DC-9');
  assert.equal(m.gates, undefined, 'no gates: the Air Canada set, Air Canada pages only');
  assert.equal(m.airports, '*CA', 'every Canadian airport, where the rest of the set runs');
  assert.ok(!m.credit && !m.endorsement, 'a supplied drawing: no credit line, no second mark');
  // the same lockup the 2017-livery DC-9 card and the live Air Canada boards use, nothing new
  assert.equal(m.file, '/logos/airlines/canadian/air-canada.svg');
  assert.equal(m.file, byKey['air-canada-dc9-2017'].file, 'the mark of the 2017-livery DC-9 card');
  assert.match(SRC, /var LOCAL_LOGOS = \{[\s\S]{0,400}?'AC': '\/logos\/airlines\/canadian\/air-canada\.svg'/, 'the file the live boards map AC to');
  assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', m.file.replace(/^\//, ''))), 'on disk');
  // the note says the picture is the final drawing, which replaced the stand-in, and what it adds
  const note = NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.doesNotMatch(note, /The file on disk is a STAND-IN/, 'the picture is no longer a stand-in');
  assert.match(note, /from the final supplied drawing \(4080 x 2295 at 204 dpi, already cut out/, 'the note names the drawing it is made from');
  assert.match(note, /It replaced the stand-in \(the drawing at the size it was first sent, 2000 x 849 on a white page, 2272 x 635 here\) through the same tool into the same file name/, 'and the stand-in it replaced, by the same tool into the same file name');
  assert.match(note, /THE FINAL DRAWING draws the upper-deck door behind the cockpit, which the stand-in left out, and keeps the Star Alliance star behind it/, 'the upper-deck door is drawn now');
  assert.doesNotMatch(note, /['"]/, 'no quote marks in the note');
});

test('their place in the rotation: the three fin 305 cards spread evenly, the DC-9, DC-8, 767 and TriStar spacing kept', () => {
  // The board rotates each airport pool in set order and wraps. The three
  // cards of fin 305 come 6, 6 and 6 apart in the Atlantic pool of eighteen
  // and 6, 5 and 5 apart in the pool of sixteen elsewhere: the most even both
  // pools allow at once (sixteen cannot be cut into three equal parts). The
  // 2017 DC-9 stays three
  // or more cards from every other DC-9, and the two DC-8s, the two 767s and
  // the two TriStars are never back to back. The widebody pairs are counted in
  // the next test.
  const DC9 = ['air-canada', 'air-canada-caps', 'air-canada-dc9-93'];
  const keys = MARKS.map((k) => k.key);
  const after = (a, b, what) => assert.equal(keys.indexOf(b), keys.indexOf(a) + 1, what);
  assert.equal(keys[0], 'air-atlantic', 'Air Atlantic is still first');
  after('air-atlantic', ARCHIVE, 'the 1980 747 is the first Air Canada card, after Air Atlantic');
  after(ARCHIVE, 'air-canada', 'then the 1987 DC-9');
  after('air-canada', 'air-canada-767', 'then the 1980 767');
  after('air-canada-767', 'air-canada-dc8', 'then the 1965 DC-8');
  after('air-canada-dc8', 'canadian-airlines', 'then Canadian Airlines');
  after('canadian-airlines', 'air-canada-caps', 'then the 1980 DC-9');
  after('air-canada-caps', KEY, 'then the Dream livery 747');
  after(KEY, 'air-nova', 'then Air Nova');
  after('air-canada-727-80', ARCHIVE93, 'the 1993 747 after the 727');
  after(ARCHIVE93, 'air-canada-dc8-80', 'and before the 1980 DC-8');
  assert.equal(keys[keys.length - 1], 'air-canada-l1011-93', 'the 1993 TriStar is still last');
  const dist = (pool, a, b) => { const gap = Math.abs(pool.indexOf(a) - pool.indexOf(b)); return Math.min(gap, pool.length - gap); };
  const gaps = (pool) => { const at = FIN305.map((k) => pool.indexOf(k)).sort((x, y) => x - y); return [at[1] - at[0], at[2] - at[1], pool.length - at[2] + at[0]]; };
  // the Atlantic pool (with Air Atlantic and Air Nova) and the pool of every other Canadian airport
  for (const [ia, n, spread] of [['YHZ', 18, [6, 6, 6]], ['YVR', 16, [6, 5, 5]]]) {
    const pool = MARKS.filter((mk) => !mk.gates && (mk.airports === '*CA' || (Array.isArray(mk.airports) && mk.airports.includes(ia)))).map((mk) => mk.key);
    assert.equal(pool.length, n, ia + ': ' + n + ' cards');
    for (const k of FIN305) assert.ok(pool.includes(k), k + ' runs at ' + ia);
    assert.deepEqual(gaps(pool), spread, 'the three cards of fin 305 at ' + ia + ', the wrap included');
    assert.ok(Math.min(...gaps(pool)) >= Math.floor(n / 3), 'as far apart as ' + n + ' cards allow at ' + ia);
    assert.ok(Math.max(...gaps(pool)) - Math.min(...gaps(pool)) <= 1, 'and as even at ' + ia);
    for (const k of DC9) assert.ok(dist(pool, 'air-canada-dc9-2017', k) >= 3, 'the 2017 DC-9 is three or more cards from ' + k + ' at ' + ia);
    for (const [a, b] of [['air-canada-dc8', 'air-canada-dc8-80'], ['air-canada-767', 'air-canada-767-87'], ['air-canada-l1011-87', 'air-canada-l1011-93']]) {
      assert.ok(dist(pool, a, b) > 1, a + ' and ' + b + ' are still apart at ' + ia);
    }
  }
});

test('the Canadian Airlines DC-10 counted as a widebody: the fewest back-to-back pairs each pool allows', () => {
  // Every widebody of the set with the DC-10, and the back-to-back pairs of a
  // pool as it rotates, the wrap included. In a ring of n cards with w
  // widebodies, w - (n - w) pairs at least are forced.
  const AC_WIDE = ['air-canada-767', 'air-canada-767-87', 'air-canada-l1011-87', 'air-canada-l1011-93', 'air-canada-a350-1000', ...FIN305];
  const WIDE = new Set(['canadian-airlines', ...AC_WIDE]);
  assert.match(byKey['canadian-airlines'].aircraft, /CDNDC10\.svg$/, 'the Canadian Airlines card shows its DC-10');
  const poolAt = (ia) => MARKS.filter((mk) => !mk.gates && (mk.airports === '*CA' || (Array.isArray(mk.airports) && mk.airports.includes(ia)))).map((mk) => mk.key);
  const pairs = (pool) => pool.map((k, i) => [k, pool[(i + 1) % pool.length]]).filter(([a, b]) => WIDE.has(a) && WIDE.has(b)).map(([a, b]) => a + ' then ' + b);
  const near747 = (pool) => { const i = pool.indexOf('canadian-airlines'), n = pool.length; return [pool[(i + n - 1) % n], pool[(i + 1) % n]].filter((k) => FIN305.includes(k)); };
  // the airports of Air Atlantic and Air Nova: eighteen cards, nine of them widebodies, so they can come every other card, and they do
  for (const ia of ['YHZ', 'YYZ', 'YUL', 'YQM', 'YYT', 'YOW', 'YSJ', 'YFC', 'YQX', 'YDF', 'YQY', 'YYG']) {
    const pool = poolAt(ia);
    const wide = pool.filter((k) => WIDE.has(k)).length;
    assert.equal(pool.length, 18, ia + ': the Atlantic pool');
    assert.equal(wide, 9, ia + ': nine widebodies');
    assert.deepEqual(pairs(pool), [], ia + ': no pair, the fewest there can be');
    assert.equal(pairs(pool).length, wide - (pool.length - wide), ia + ': no more pairs than the count forces');
    assert.deepEqual(near747(pool), [], ia + ': the DC-10 beside no 747');
  }
  // every other Canadian airport: sixteen cards, nine widebodies and seven narrowbodies, so two pairs at least, and two
  for (const ia of ['YVR', 'YYC', 'YEG', 'YWG', 'YXE', 'YQR', 'YXU', 'YQB', 'YLW', 'YYJ']) {
    const pool = poolAt(ia);
    const wide = pool.filter((k) => WIDE.has(k)).length;
    assert.equal(pool.length, 16, ia + ': no Air Atlantic and no Air Nova');
    assert.equal(wide, 9, ia + ': nine widebodies');
    assert.deepEqual(pairs(pool), [KEY + ' then air-canada-l1011-87', 'air-canada-l1011-93 then ' + ARCHIVE],
      ia + ': the two pairs, the fewest there can be (' + wide + ' - ' + (pool.length - wide) + ')');
    assert.equal(pairs(pool).length, wide - (pool.length - wide), ia + ': no more pairs than the count forces');
    assert.deepEqual(near747(pool), [], ia + ': the DC-10 beside no 747');
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
      const seen = b.cards(TURNS);
      assert.ok(seen.includes(KEY), `${row.flight} at ${ia}: and the Dream livery 747 comes round`);
      assert.ok(seen.includes(ARCHIVE), `${row.flight} at ${ia}: and the 1980 747 comes round`);
      assert.ok(seen.includes(ARCHIVE93), `${row.flight} at ${ia}: and the 1993 747 comes round`);
    }
  }
  // the heritage demonstration gates are Air Canada pages too
  const anv = b.at('YHZ', { flight: '500', airline: 'ANV' }, { heritage: 'ANV' }).cards(TURNS);
  assert.ok(FIN305.every((k) => anv.includes(k)), 'the Air Nova demonstration gate');
});

test('and never on a United gate, another airline, an Air Canada gate abroad or a board with no gate flight', () => {
  const b = board();
  for (const ia of ['YYZ', 'YUL', 'YVR', 'ORD', 'EWR', 'FRA']) {
    for (const row of [{ flight: 'UA1234', airline: 'UA' }, { flight: 'UAL951', airline: 'UAL' }, { flight: 'UA4321', airline: 'UA', _opCode: 'OO' }]) {
      const seen = b.at(ia, row).cards(TURNS * 2);
      assert.ok(!FIN305.some((k) => seen.includes(k)), `${row.flight} at ${ia} never draws any of the three 747s`);
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

const DREAM = { en: 'Dream livery', fr: 'Livrée de rêve', es: 'Librea soñada', de: 'Traumlackierung', it: 'Livrea da sogno',
                pt: 'Pintura de sonho', ja: '夢の塗装', zh: '梦想涂装', ar: 'طلاء الأحلام' };
// What if, in the words of the Future Retro DC-9 card, and the 2017 livery in the words of that card.
const WHAT_IF = { fr: 'et si…', es: '¿y si…?', de: 'Fiktion', it: 'e se…', pt: 'e se…', ja: 'もしも', zh: '假想', ar: 'ماذا لو' };
const LIVERY_2017 = { fr: 'livrée de 2017', es: 'librea de 2017', de: 'Lackierung von 2017', it: 'livrea del 2017', pt: 'pintura de 2017',
                      ja: '2017年塗装', zh: '2017年涂装', ar: 'طلاء 2017' };
// The line at 1680 x 1050, measured after document.fonts.ready following the draw (the record notes it).
const LANG_NAME = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese', ar: 'Arabic' };

test('the heading: Dream livery in nine languages, never From the archive', () => {
  assert.deepEqual(Object.keys(DREAM).sort(), STORE.LANGS.slice().sort(), 'all nine board languages');
  const e = STORE.entry(HEADING);
  assert.ok(e, 'the heading is in the store');
  for (const l of STORE.LANGS) {
    assert.equal(e[l], DREAM[l], 'the words, in ' + l);
    assert.notEqual(e[l], STORE.bs('heritageKicker', l), 'not From the archive, in ' + l);
  }
  assert.ok(MARKS.filter((m) => m.heading === HEADING).map((m) => m.key).includes(KEY), 'one of the cards that say it');
});

test('the caption: the type, the years it flew, what-if and the 2017 livery, in nine languages', () => {
  assert.deepEqual(Object.keys(WHAT_IF).sort(), STORE.LANGS.filter((l) => l !== 'en').sort());
  assert.deepEqual(Object.keys(LIVERY_2017).sort(), STORE.LANGS.filter((l) => l !== 'en').sort());
  const e = STORE.entry('heritage:' + KEY), dc9 = STORE.entry('heritage:air-canada-dc9-2017');
  assert.ok(e, 'the caption is in the store');
  assert.equal(e.en, '{TYPE} · 1974–1998 · 2017 livery what-if');
  assert.equal(STORE.fill(e.en, { TYPE }), 'Boeing 747-133 · 1974–1998 · 2017 livery what-if', 'the English line as it prints');
  const seen = new Set();
  for (const l of STORE.LANGS) {
    const cap = e[l];
    assert.ok(cap, 'a caption in ' + l);
    const parts = cap.split(' · ');
    assert.equal(parts[0], '{TYPE}', 'the type comes from the card, in ' + l);
    assert.equal(parts[1], '1974–1998', 'the years it flew for Air Canada, delivery to withdrawal, in ' + l);
    assert.deepEqual(cap.match(/\d+/g), ['1974', '1998', '2017'], 'its years and the livery year, nothing else: no registration, no fleet number, in ' + l);
    assert.doesNotMatch(cap, /FTOE|CF-?TOE|\b305\b|Boeing|ボーイング|波音|بوينغ|Air Canada|エア・カナダ|加航|إير كندا/, 'no mark, no fleet number, no maker and no airline spelled in the stored line, in ' + l);
    if (l === 'en') {
      assert.equal(parts.length, 3);
      assert.match(parts[2], /^2017 livery what-if$/, 'English says what-if beside the livery');
    } else {
      assert.equal(parts.length, 4, 'type · years · what-if · the livery, in ' + l);
      assert.equal(parts[2], WHAT_IF[l], 'it says what-if in ' + l);
      assert.equal(parts[2], dc9[l].split(' · ')[1], 'in the words the Future Retro card uses, in ' + l);
      assert.equal(parts[3], LIVERY_2017[l], 'and the 2017 livery, in ' + l);
      assert.equal(parts[3], dc9[l].split(' · ')[2], 'as the Future Retro card names it, in ' + l);
      assert.doesNotMatch(cap, /what-if|livery|Future|Retro|dream/i, 'in its own words, not the English ones, in ' + l);
    }
    seen.add(cap);
  }
  assert.equal(seen.size, STORE.LANGS.length, 'nine different lines: none left in another language');
});

test('every line is one row at 1680 x 1050, the widths recorded with the card', () => {
  widthsIn(NOTE);
});

test('the card as drawn, in every language: its heading, the caption with its type, the mark and the picture', () => {
  const b = board();
  const html = b.at('YYZ', AC_ROWS[0]).find(TURNS);
  assert.ok(html, 'an Air Canada gate at Toronto comes to it');
  assert.match(html, /<div class="hcard-kicker"><span class="bs-h" lang="en">Dream livery<\/span> &nbsp;\|&nbsp; <span class="bs-h" lang="fr">Livrée de rêve<\/span><\/div>/, 'the heading, English then French');
  assert.match(html, /<img class="hcard-mark" src="\/logos\/airlines\/canadian\/air-canada\.svg" alt="Air Canada">/, 'the live lockup');
  assert.match(html, /<img class="hcard-plane" src="\/aircraft\/heritage\/air-canada-747-305-2017\.png" alt=""/, 'the picture, over the sky');
  assert.match(html, /<div class="hcard-line"><span class="bs-h" lang="en">Boeing 747-133 · 1974⁠–⁠1998 · 2017 livery what-if<\/span><\/div>/, 'the English line, the year range kept whole');
  assert.match(html, /<div class="hcard-line hcard-line-2"><span class="bs-h" lang="fr">Boeing 747-133 · 1974⁠–⁠1998 · et si… · livrée de 2017<\/span><\/div>/, 'and the French line');
  assert.doesNotMatch(html, /From the archive|Depuis les archives|Coming to the fleet/, 'neither the archive heading nor the coming one');
  assert.doesNotMatch(html, /hcard-credit"|hcard-endorse/, 'no credit line and no endorsement');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /FTOE|CF-TOE|\b305\b/, 'no registration and no fleet number in the words on the card (the file name is not shown)');
  // French first where the board puts French first
  const yul = b.at('YUL', AC_ROWS[0]).find(TURNS);
  assert.match(yul, /<div class="hcard-kicker"><span class="bs-h" lang="fr">Livrée de rêve<\/span>/, 'Montréal leads in French');
  assert.match(yul, /<div class="hcard-line"><span class="bs-h" lang="fr">Boeing 747-133 · 1974⁠–⁠1998 · et si…/, 'the caption too');
  // every language, with the type in its place and the heading over it
  for (const l of STORE.LANGS) {
    const h = b.at('YVR', AC_ROWS[0], { langs: l === 'en' ? ['en', 'fr'] : [l, 'en'] }).find(TURNS);
    assert.ok(h, 'drawn in ' + l);
    const line = STORE.fill(STORE.bs('heritage:' + KEY, l), { TYPE }).replace(/(\d)–(\d)/g, '$1⁠–⁠$2');
    assert.ok(h.includes('lang="' + l + '"' + (l === 'ar' ? ' dir="rtl"' : '') + '>' + line + '</span>'), 'the ' + l + ' line: ' + line);
    assert.ok(line.includes('1974') && line.includes('1998'), 'it says 1974 and 1998, in ' + l);
    assert.ok(line.includes(l === 'en' ? 'what-if' : WHAT_IF[l]), 'and what-if, in ' + l);
    assert.ok(kicker(h).includes(DREAM[l]), 'under ' + DREAM[l]);
    assert.ok(!kicker(h).includes(STORE.bs('heritageKicker', l)), 'and never ' + STORE.bs('heritageKicker', l));
    assert.doesNotMatch(h.replace(/ onloadedmetadata="[^"]*"/, ''), /[{}]/, 'no placeholder left, in ' + l);
  }
});

// ── the 1980 card: From the archive ────────────────────────────────────────

// The words of the DC-8-63 line for the 1980 livery, which this card takes word for word.
const LIVERY_1980 = { en: '1980 livery', fr: 'livrée de 1980', es: 'librea de 1980', de: 'Lackierung von 1980', it: 'livrea del 1980',
                      pt: 'pintura de 1980', ja: '1980年塗装', zh: '1980年涂装', ar: 'طلاء 1980' };
const ARCHIVE_HEADING = { en: 'From the archive', fr: 'Depuis les archives', es: 'Del archivo', de: 'Aus dem Archiv', it: 'Dall’archivio',
                          pt: 'Do arquivo', ja: 'アーカイブより', zh: '档案回顾', ar: 'من الأرشيف' };

test('the 1980 card: the same 747-133 in the Air Canada set, with the mark of the 1980 cards and the default heading', () => {
  const m = byKey[ARCHIVE];
  assert.ok(m, 'the card is in the deck');
  assert.equal(m.name, 'Air Canada');
  assert.equal(m.type, TYPE, 'the type, from the record, as on the Dream livery card');
  assert.equal(m.type, byKey[KEY].type, 'the same aeroplane as the Dream livery card');
  assert.equal(m.aircraft, ARCHIVE_PICTURE);
  assert.equal(m.heading, undefined, 'no heading of its own: From the archive, as the DC-8-63');
  assert.equal(m.heading, byKey['air-canada-dc8-80'].heading);
  assert.equal(m.gates, undefined, 'no gates: the Air Canada set, Air Canada pages only');
  assert.equal(m.airports, '*CA', 'every Canadian airport, where the rest of the set runs');
  assert.ok(!m.credit && !m.endorsement, 'a supplied drawing: no credit line, no second mark');
  // the 1980 lockup of the supplied family, the mark of every other 1980 card
  assert.equal(m.file, '/logos/advertisements/retro-airlines/ACLOGO-1980-2.svg');
  for (const k of ['air-canada-dc8-80', 'air-canada-caps', 'air-canada-767']) assert.equal(m.file, byKey[k].file, 'the mark of ' + k);
  for (const f of [m.file, m.aircraft]) assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', f.replace(/^\//, ''))), f + ' is on disk');
  // the note says where the facts come from and keeps to them
  const note = ARCHIVE_NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /c\/n 20881, line 236, delivered new on 13 May 1974/, 'the aeroplane, as its registration page has it');
  assert.match(note, /the 1980 livery reached it in 1982, the titles first/, 'when the livery reached it');
  assert.match(note, /1987–89 \(145070\)[\s\S]*6 August 1991 \(319519\)[\s\S]*June–July 1993 \(345805\)[\s\S]*8 June 1996 it is in the 1993 livery \(324435\)/, 'the dated photographs it is drawn against');
  assert.doesNotMatch(note, /\bCF-[A-Z]/, 'no CF- mark claimed');
  assert.doesNotMatch(note, /['"]/, 'no quote marks in the note');
});

test('the 1980 card says From the archive and the DC-8-63 line, with the years of the Dream livery card, in nine languages', () => {
  assert.deepEqual(Object.keys(LIVERY_1980).sort(), STORE.LANGS.slice().sort(), 'all nine board languages');
  assert.deepEqual(Object.keys(ARCHIVE_HEADING).sort(), STORE.LANGS.slice().sort());
  const e = STORE.entry('heritage:' + ARCHIVE), dc8 = STORE.entry('heritage:air-canada-dc8-80'), dream = STORE.entry('heritage:' + KEY);
  assert.ok(e, 'the caption is in the store');
  assert.equal(e.en, '{TYPE} · 1974–1998 · 1980 livery');
  assert.equal(STORE.fill(e.en, { TYPE }), 'Boeing 747-133 · 1974–1998 · 1980 livery', 'the English line as it prints');
  const seen = new Set();
  for (const l of STORE.LANGS) {
    assert.equal(STORE.bs('heritageKicker', l), ARCHIVE_HEADING[l], 'From the archive, in ' + l);
    const cap = e[l];
    assert.ok(cap, 'a caption in ' + l);
    const parts = cap.split(' · '), dc8p = dc8[l].split(' · ');
    assert.equal(parts.length, 3, 'type · years · livery, the shape of the DC-8-63 line, in ' + l);
    assert.equal(parts.length, dc8p.length);
    assert.equal(parts[0], '{TYPE}', 'the type comes from the card, in ' + l);
    assert.equal(parts[1], '1974–1998', 'the years it flew for Air Canada, delivery to withdrawal, in ' + l);
    assert.equal(parts[1], dream[l].split(' · ')[1], 'the years of the Dream livery card of the same aeroplane, in ' + l);
    assert.equal(parts[2], LIVERY_1980[l], 'the 1980 livery, in ' + l);
    assert.equal(parts[2], dc8p[2], 'in the words of the DC-8-63 line, in ' + l);
    assert.deepEqual(cap.match(/\d+/g), ['1974', '1998', '1980'], 'its years and the livery year, nothing else: no 1982, no registration, no fleet number, in ' + l);
    assert.doesNotMatch(cap, /FTOE|CF-?TOE|\b305\b|Boeing|ボーイング|波音|بوينغ|Air Canada|エア・カナダ|加航|إير كندا/, 'no mark, no fleet number, no maker and no airline spelled in the stored line, in ' + l);
    assert.doesNotMatch(cap, /what-if|et si|y si|e se|Fiktion|もしも|假想|ماذا لو/i, 'nothing of the what-if: this is the livery it wore, in ' + l);
    if (l !== 'en') assert.doesNotMatch(cap, /livery/, 'in its own words, not the English one, in ' + l);
    seen.add(cap);
  }
  assert.equal(seen.size, STORE.LANGS.length, 'nine different lines: none left in another language');
});

// The measured widths recorded in a record note: every language one row, at 92% or less of the line
// (two rows start past 100%; 96% is too near), the longest named first.
function widthsIn(note) {
  note = note.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /Measured at 1680 x 1050[^.]*after document\.fonts\.ready, every language is one row/, 'measured after the fonts load, one row each');
  const pct = {};
  for (const l of STORE.LANGS) {
    const m = new RegExp('the ' + LANG_NAME[l] + ',? (?:[0-9.]+ of [0-9.]+ px )?\\(?([0-9.]+)%').exec(note);
    assert.ok(m, 'the ' + LANG_NAME[l] + ' line is measured');
    pct[l] = parseFloat(m[1]);
    assert.ok(pct[l] > 50 && pct[l] <= 92, 'the ' + LANG_NAME[l] + ' line takes ' + pct[l] + '% of the line');
  }
  const longest = Object.keys(pct).sort((a, b) => pct[b] - pct[a])[0];
  assert.match(note, new RegExp('The longest line is the ' + LANG_NAME[longest]), 'the longest is named first');
  return pct;
}

test('every line of the 1980 card is one row at 1680 x 1050, the widths recorded with the card', () => {
  const pct = widthsIn(ARCHIVE_NOTE);
  assert.equal(pct.de, 74.3, 'the German, the longest, as measured');
  assert.match(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'board-strings.js'), 'utf8'), /every language is one row at\s*\/\/ 1680 x 1050; the longest line is the German, at 74\.3% of it\.\s*'heritage:air-canada-747-305-80'/, 'and the store says so beside the line');
});

test('the 1980 card as drawn, in every language: From the archive, the caption with its type, the 1980 mark and its picture', () => {
  const b = board();
  const html = b.at('YYZ', AC_ROWS[0]).find(TURNS, ARCHIVE_PICTURE);
  assert.ok(html, 'an Air Canada gate at Toronto comes to it');
  assert.match(html, /<div class="hcard-kicker"><span class="bs-h" lang="en">From the archive<\/span> &nbsp;\|&nbsp; <span class="bs-h" lang="fr">Depuis les archives<\/span><\/div>/, 'the archive heading, English then French');
  assert.match(html, /<img class="hcard-mark" src="\/logos\/advertisements\/retro-airlines\/ACLOGO-1980-2\.svg" alt="Air Canada">/, 'the 1980 lockup');
  assert.match(html, /<img class="hcard-plane" src="\/aircraft\/heritage\/air-canada-747-305-ac80\.png" alt=""/, 'the picture, over the sky');
  assert.match(html, /<div class="hcard-line"><span class="bs-h" lang="en">Boeing 747-133 · 1974⁠–⁠1998 · 1980 livery<\/span><\/div>/, 'the English line, the year range kept whole');
  assert.match(html, /<div class="hcard-line hcard-line-2"><span class="bs-h" lang="fr">Boeing 747-133 · 1974⁠–⁠1998 · livrée de 1980<\/span><\/div>/, 'and the French line');
  assert.doesNotMatch(html, /Dream livery|Livrée de rêve|Coming to the fleet/, 'neither the Dream livery heading nor the coming one');
  assert.doesNotMatch(html, /hcard-credit"|hcard-endorse/, 'no credit line and no endorsement');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /FTOE|CF-TOE|\b305\b/, 'no registration and no fleet number in the words on the card (the file name is not shown)');
  // French first where the board puts French first
  const yul = b.at('YUL', AC_ROWS[0]).find(TURNS, ARCHIVE_PICTURE);
  assert.match(yul, /<div class="hcard-kicker"><span class="bs-h" lang="fr">Depuis les archives<\/span>/, 'Montréal leads in French');
  assert.match(yul, /<div class="hcard-line"><span class="bs-h" lang="fr">Boeing 747-133 · 1974⁠–⁠1998 · livrée de 1980<\/span>/, 'the caption too');
  for (const l of STORE.LANGS) {
    const h = b.at('YVR', AC_ROWS[0], { langs: l === 'en' ? ['en', 'fr'] : [l, 'en'] }).find(TURNS, ARCHIVE_PICTURE);
    assert.ok(h, 'drawn in ' + l);
    const line = STORE.fill(STORE.bs('heritage:' + ARCHIVE, l), { TYPE }).replace(/(\d)–(\d)/g, '$1⁠–⁠$2');
    assert.ok(h.includes('lang="' + l + '"' + (l === 'ar' ? ' dir="rtl"' : '') + '>' + line + '</span>'), 'the ' + l + ' line: ' + line);
    assert.ok(line.includes('1974') && line.includes('1998') && line.includes(LIVERY_1980[l]), 'it says 1974, 1998 and the 1980 livery, in ' + l);
    assert.ok(kicker(h).includes(ARCHIVE_HEADING[l]), 'under ' + ARCHIVE_HEADING[l]);
    assert.ok(!kicker(h).includes(DREAM[l]), 'and never ' + DREAM[l]);
    assert.doesNotMatch(h.replace(/ onloadedmetadata="[^"]*"/, ''), /[{}]/, 'no placeholder left, in ' + l);
  }
});

// ── the 1993 card: From the archive ────────────────────────────────────────

// The words of the 1993 DC-9 and 1993 TriStar lines for the 1993 livery, which this card takes word for word.
const LIVERY_1993 = { en: '1993 livery', fr: 'livrée de 1993', es: 'librea de 1993', de: 'Lackierung von 1993', it: 'livrea del 1993',
                      pt: 'pintura de 1993', ja: '1993年塗装', zh: '1993年涂装', ar: 'طلاء 1993' };

test('the 1993 card: the same 747-133 in the Air Canada set, with the mark of the 1993 cards and the default heading', () => {
  const m = byKey[ARCHIVE93];
  assert.ok(m, 'the card is in the deck');
  assert.equal(m.name, 'Air Canada');
  assert.equal(m.type, TYPE, 'the type, from the record, as on the other two cards of fin 305');
  for (const k of [KEY, ARCHIVE]) assert.equal(m.type, byKey[k].type, 'the same aeroplane as ' + k);
  assert.equal(m.aircraft, ARCHIVE93_PICTURE);
  assert.equal(m.heading, undefined, 'no heading of its own: From the archive, as the 1993 DC-9 and TriStar');
  for (const k of ['air-canada-dc9-93', 'air-canada-l1011-93']) assert.equal(m.heading, byKey[k].heading, 'the heading of ' + k);
  assert.equal(m.gates, undefined, 'no gates: the Air Canada set, Air Canada pages only');
  assert.equal(m.airports, '*CA', 'every Canadian airport, where the rest of the set runs');
  assert.ok(!m.credit && !m.endorsement, 'a supplied drawing: no credit line, no second mark');
  // the 1993 mark, the mark of the 1993 DC-9 and the 1993 TriStar
  assert.equal(m.file, '/logos/advertisements/retro-airlines/AC-1993-LOGO.svg');
  for (const k of ['air-canada-dc9-93', 'air-canada-l1011-93']) assert.equal(m.file, byKey[k].file, 'the mark of ' + k);
  for (const f of [m.file, m.aircraft]) assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', f.replace(/^\//, ''))), f + ' is on disk');
  // the note keeps to the facts it was given, and says where each comes from
  const note = ARCHIVE93_NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /still in the 1980 livery at Prestwick in June–July 1993 \(AirHistory\.net photograph 345805\)/, 'still in the 1980 livery in mid-1993');
  assert.match(note, /in the 1993 livery at Heathrow on 8 June 1996 \(324435\) and at Toronto on 28 July 1998 \(384311\)/, 'in the 1993 livery by mid-1996 and in 1998');
  assert.match(note, /repainted between mid-1993 and mid-1996/, 'so the repaint, and no year for it');
  assert.match(note, /withdrawn on 15 October 1998/, 'and the withdrawal');
  assert.match(note, /The Toronto photograph of 28 July 1998 was compared by eye with the drawing and matches: the rondelle ahead of the red titles, the dark fin with the red leaf, C-FTOE aft, 305 at the top of the fin, the star behind the cockpit and the white body/, 'the drawing checked by eye against the 1998 photograph');
  const star = ARCHIVE93_NOTE.split('\n').filter((l) => /Star Alliance badge/.test(l));
  assert.equal(star.length, 1, 'the Star Alliance date is one line of the comment');
  assert.match(star[0], /dates it to after the alliance was formed on 14 May 1997: it shows the aeroplane in 1997–98\./, 'the badge dates the drawing');
  assert.doesNotMatch(note, /\bCF-[A-Z]/, 'no CF- mark claimed');
  assert.doesNotMatch(note, /['"]/, 'no quote marks in the note');
});

test('the 1993 card says From the archive and the line of the 1980 card with the 1993 livery of the 1993 cards, in nine languages', () => {
  assert.deepEqual(Object.keys(LIVERY_1993).sort(), STORE.LANGS.slice().sort(), 'all nine board languages');
  const e = STORE.entry('heritage:' + ARCHIVE93), e80 = STORE.entry('heritage:' + ARCHIVE), dream = STORE.entry('heritage:' + KEY);
  const dc9 = STORE.entry('heritage:air-canada-dc9-93'), l1011 = STORE.entry('heritage:air-canada-l1011-93');
  assert.ok(e, 'the caption is in the store');
  assert.equal(e.en, '{TYPE} · 1974–1998 · 1993 livery');
  assert.equal(STORE.fill(e.en, { TYPE }), 'Boeing 747-133 · 1974–1998 · 1993 livery', 'the English line as it prints');
  const seen = new Set();
  for (const l of STORE.LANGS) {
    assert.equal(STORE.bs('heritageKicker', l), ARCHIVE_HEADING[l], 'From the archive, in ' + l);
    const cap = e[l];
    assert.ok(cap, 'a caption in ' + l);
    const parts = cap.split(' · ');
    assert.equal(parts.length, 3, 'type · years · livery, in ' + l);
    assert.equal(parts[0], '{TYPE}', 'the type comes from the card, in ' + l);
    assert.equal(parts[1], '1974–1998', 'the years it flew for Air Canada, delivery to withdrawal, in ' + l);
    assert.equal(parts[1], dream[l].split(' · ')[1], 'the years of the Dream livery card, in ' + l);
    assert.equal(parts[1], e80[l].split(' · ')[1], 'and of the 1980 livery card, in ' + l);
    assert.equal(cap, e80[l].replace(LIVERY_1980[l], LIVERY_1993[l]), 'the line of the 1980 card with the 1993 livery, in ' + l);
    assert.equal(parts[2], LIVERY_1993[l], 'the 1993 livery, in ' + l);
    assert.equal(parts[2], dc9[l].split(' · ')[2], 'in the words of the 1993 DC-9 line, in ' + l);
    assert.equal(parts[2], l1011[l].split(' · ')[2], 'and of the 1993 TriStar line, in ' + l);
    assert.deepEqual(cap.match(/\d+/g), ['1974', '1998', '1993'], 'its years and the livery year, nothing else: no 1996, no 1997, no registration, no fleet number, in ' + l);
    assert.doesNotMatch(cap, /FTOE|CF-?TOE|\b305\b|Boeing|ボーイング|波音|بوينغ|Air Canada|エア・カナダ|加航|إير كندا|Star Alliance/, 'no mark, no fleet number, no maker, no airline and no alliance spelled in the stored line, in ' + l);
    assert.doesNotMatch(cap, /what-if|et si|y si|e se|Fiktion|もしも|假想|ماذا لو/i, 'nothing of the what-if: this is the livery it wore, in ' + l);
    if (l !== 'en') assert.doesNotMatch(cap, /livery/, 'in its own words, not the English one, in ' + l);
    seen.add(cap);
  }
  assert.equal(seen.size, STORE.LANGS.length, 'nine different lines: none left in another language');
});

test('every line of the 1993 card is one row at 1680 x 1050, the widths recorded with the card', () => {
  const pct = widthsIn(ARCHIVE93_NOTE);
  assert.equal(pct.de, 74.0, 'the German, the longest, as measured');
  assert.match(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'board-strings.js'), 'utf8'), /every language is one row at\s*\/\/ 1680 x 1050; the longest line is the German, at 74\.0% of it\.\s*'heritage:air-canada-747-305-93'/, 'and the store says so beside the line');
});

test('the 1993 card as drawn, in every language: From the archive, the caption with its type, the 1993 mark and its picture', () => {
  const b = board();
  const html = b.at('YYZ', AC_ROWS[0]).find(TURNS, ARCHIVE93_PICTURE);
  assert.ok(html, 'an Air Canada gate at Toronto comes to it');
  assert.match(html, /<div class="hcard-kicker"><span class="bs-h" lang="en">From the archive<\/span> &nbsp;\|&nbsp; <span class="bs-h" lang="fr">Depuis les archives<\/span><\/div>/, 'the archive heading, English then French');
  assert.match(html, /<img class="hcard-mark" src="\/logos\/advertisements\/retro-airlines\/AC-1993-LOGO\.svg" alt="Air Canada">/, 'the 1993 mark');
  assert.match(html, /<img class="hcard-plane" src="\/aircraft\/heritage\/air-canada-747-305-ac93\.png" alt=""/, 'the picture, over the sky');
  assert.match(html, /<div class="hcard-line"><span class="bs-h" lang="en">Boeing 747-133 · 1974⁠–⁠1998 · 1993 livery<\/span><\/div>/, 'the English line, the year range kept whole');
  assert.match(html, /<div class="hcard-line hcard-line-2"><span class="bs-h" lang="fr">Boeing 747-133 · 1974⁠–⁠1998 · livrée de 1993<\/span><\/div>/, 'and the French line');
  assert.doesNotMatch(html, /Dream livery|Livrée de rêve|Coming to the fleet/, 'neither the Dream livery heading nor the coming one');
  assert.doesNotMatch(html, /hcard-credit"|hcard-endorse/, 'no credit line and no endorsement');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /FTOE|CF-TOE|\b305\b/, 'no registration and no fleet number in the words on the card (the file name is not shown)');
  // French first where the board puts French first
  const yul = b.at('YUL', AC_ROWS[0]).find(TURNS, ARCHIVE93_PICTURE);
  assert.match(yul, /<div class="hcard-kicker"><span class="bs-h" lang="fr">Depuis les archives<\/span>/, 'Montréal leads in French');
  assert.match(yul, /<div class="hcard-line"><span class="bs-h" lang="fr">Boeing 747-133 · 1974⁠–⁠1998 · livrée de 1993<\/span>/, 'the caption too');
  for (const l of STORE.LANGS) {
    const h = b.at('YVR', AC_ROWS[0], { langs: l === 'en' ? ['en', 'fr'] : [l, 'en'] }).find(TURNS, ARCHIVE93_PICTURE);
    assert.ok(h, 'drawn in ' + l);
    const line = STORE.fill(STORE.bs('heritage:' + ARCHIVE93, l), { TYPE }).replace(/(\d)–(\d)/g, '$1⁠–⁠$2');
    assert.ok(h.includes('lang="' + l + '"' + (l === 'ar' ? ' dir="rtl"' : '') + '>' + line + '</span>'), 'the ' + l + ' line: ' + line);
    assert.ok(line.includes('1974') && line.includes('1998') && line.includes(LIVERY_1993[l]), 'it says 1974, 1998 and the 1993 livery, in ' + l);
    assert.ok(kicker(h).includes(ARCHIVE_HEADING[l]), 'under ' + ARCHIVE_HEADING[l]);
    assert.ok(!kicker(h).includes(DREAM[l]), 'and never ' + DREAM[l]);
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

// A card picture as the tool writes it: the working width, the proportions of
// the drawing, cropped to it, clear in the corners, mostly sky, the aeroplane
// solid, no haze. Returns the pixels for the counts below. With finTip, the
// top right corner may be the dark tip of the fin, partly clear, as on the
// A350-1000: a drawing whose fin is its highest and furthest aft point.
function cutout(picture, ratio, { finTip = false } = {}) {
  const file = path.join(ROOT, 'fids-current', picture.replace(/^\//, ''));
  assert.ok(fs.existsSync(file), picture + ' is on disk');
  const img = rgbaOf(file), { w, h, px } = img;
  assert.equal(w, 2272, 'scaled to the 2272 px of the other card pictures');
  assert.ok(Math.abs(w / h - ratio) < 0.01, 'at the proportions of the drawing: cropped and scaled, never stretched (it is ' + w + ' x ' + h + ')');
  const A = (x, y) => px[(y * w + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
    if (finTip && x === w - 1 && y === 0) {
      const tip = px.subarray((w - 1) * 4, (w - 1) * 4 + 4);
      assert.ok(tip[3] === 0 || (tip[3] < 255 && Math.max(tip[0], tip[1], tip[2]) <= 60), 'the top right corner is clear or the dark tip of the fin, partly clear (it is ' + Array.from(tip) + ')');
    } else assert.equal(A(x, y), 0, 'the corner at ' + x + ',' + y + ' is clear');
  }
  const touches = { left: false, right: false, top: false, bottom: false };
  for (let y = 0; y < h; y++) { if (A(0, y) || A(1, y)) touches.left = true; if (A(w - 1, y) || A(w - 2, y)) touches.right = true; }
  for (let x = 0; x < w; x++) { if (A(x, 0) || A(x, 1)) touches.top = true; if (A(x, h - 1) || A(x, h - 2)) touches.bottom = true; }
  assert.deepEqual(touches, { left: true, right: true, top: true, bottom: true }, 'cropped to the drawing: no margin of page round it');
  let clear = 0, solid = 0, haze = 0;
  for (let i = 3; i < px.length; i += 4) { if (px[i] === 0) clear++; else if (px[i] === 255) solid++; else if (px[i] <= 6) haze++; }
  assert.ok(clear / (w * h) > 0.5, 'more than half the picture is sky (' + (100 * clear / (w * h)).toFixed(1) + '%)');
  assert.ok(solid / (w * h) > 0.3, 'and the aeroplane is solid (' + (100 * solid / (w * h)).toFixed(1) + '%)');
  assert.equal(haze, 0, 'no haze left off the outline');
  return img;
}

// Light pixels on the outline of the dark paint, counted as on the A350-1000:
// a pixel that shows (opacity 100 or more) and is not dark (every channel 60
// or more), on the outline (clear sky within one pixel), on a dark part (solid
// paint of 40 or less within three pixels, and no light solid paint).
function darkRim({ w, h, px }) {
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
  return rim;
}

// Pale pixels on the outline of any paint of 150 or less, counted as in
// tests/heritage-dream-card.test.js: a pixel that shows (opacity 100 or more),
// is pale (every channel 205 or more), lies within two pixels of clear sky,
// and has solid paint of 150 or less within three. This reaches a grey belly,
// which the count above does not.
function paleRim({ w, h, px }) {
  const near = (x, y, r, hit) => {
    for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) if (hit((yy * w + xx) * 4)) return true;
    }
    return false;
  };
  let rim = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (px[o + 3] < 100 || px[o] < 205 || px[o + 1] < 205 || px[o + 2] < 205) continue;
      if (!near(x, y, 2, (k) => px[k + 3] === 0)) continue;
      if (near(x, y, 3, (k) => px[k + 3] >= 200 && px[k] <= 150 && px[k + 1] <= 150 && px[k + 2] <= 150)) rim++;
    }
  }
  return rim;
}

test('its picture: a cut-out at the working width, clear all round, with no pale line under the dark paint', () => {
  // NO PAGE LEFT ROUND THE BLACK FIN, BELLY AND ENGINES. The final supplied
  // drawing came already cut out (4080 x 2295). Laid on white and un-mixed
  // one pixel deep, the page stayed a pale line round the dark paint over a
  // dark sky: 361 by the first count, 37 by the second; two deep, the
  // default of the tool, 11 and 31, the second nearly all the white paint of
  // the nose round the dark cockpit windows, which is drawn (28 at three).
  // The stand-in it replaced (2000 x 849, on a white page) gave 433 and 1 by
  // the first count. The top of the fin is the furthest aft point of the
  // drawing, so the top right corner is the dark tip of the fin, partly
  // clear, as on the A350-1000.
  const img = cutout(PICTURE, 2272 / 603, { finTip: true });
  assert.equal(img.h, 603, 'the final drawing at 2272 px: 2272 x 603 (the stand-in was 2272 x 635)');
  const dark = darkRim(img), pale = paleRim(img);
  assert.ok(dark <= 40, 'the page is still in the outline of the dark paint: ' + dark + ' light pixels on it');
  assert.ok(pale <= 40, 'the page is still in the outline of the dark paint: ' + pale + ' pale pixels on it');
  const note = NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /at the depth of two pixels, the default and the smallest that passes/, 'the note names the depth');
  assert.match(note, /361 at one pixel and 11 at two; by the count of the Dream livery test the pale rim is 37 and 31/, 'and the counts it was chosen by');
  assert.match(note, /\(2272 x 603\)/, 'and the size it comes out at');
  assert.match(note, /the top right corner of the picture is the dark tip of the fin, partly clear/, 'and why one corner is not clear');
  const readme = fs.readFileSync(path.join(ROOT, 'scripts', 'heritage-sky', 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /747-133 is a stand-in/, 'the README no longer calls it a stand-in');
  assert.match(readme, /card-cutout\.py 747-305-2017-livery-FINAL-with-door\.png fids-current\/aircraft\/heritage\/air-canada-747-305-2017\.png\n/, 'the README gives the command, at the default depth');
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'heritage-sky', 'card-cutout.py')), 'the tool that makes the picture from a drawing is kept');
});

test('the 1980 picture: a cut-out at the working width, clear all round, with no pale line round the dark paint or the grey belly', () => {
  // The supplied drawing as its author corrected it (v2, the ring of the
  // rondelle open at its foot for the stem of the leaf) came already cut out
  // (3187 x 881). Laid on white and un-mixed one pixel deep, the page stayed
  // in its outline: 304 by the first count (most of it under the engines and
  // along the belly), 22 by the second; two deep, the default of the tool,
  // 16 and 7.
  const img = cutout(ARCHIVE_PICTURE, 2272 / 597);
  assert.equal(img.h, 597, 'the corrected drawing at 2272 px: 2272 x 597 (the first one was 2272 x 598)');
  const dark = darkRim(img), pale = paleRim(img);
  assert.ok(dark <= 40, 'the page is still in the outline of the dark paint: ' + dark + ' light pixels on it');
  assert.ok(pale <= 40, 'the page is still in the outline of the grey and dark paint: ' + pale + ' pale pixels on it');
  const note = ARCHIVE_NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /at the depth of two pixels, the default and the smallest that passes/, 'the note names the depth');
  assert.match(note, /as corrected by its author \(the v2 file, 3187 x 881/, 'the note names the drawing it is made from');
  assert.match(note, /304 at one pixel and 16 at two[^.]*22 and 7/, 'and the counts it was chosen by');
  assert.match(note, /\(2272 x 597\)/, 'and the size it comes out at');
});

test('the 1993 picture: a cut-out at the working width, clear all round, with no pale line round the dark fin or the body', () => {
  // The supplied drawing came already cut out (5924 x 1611). Laid on white
  // and un-mixed, the page stayed in its outline at the shallower depths: by
  // the first count 200 at one pixel and 218 at two (at two a pale dotted
  // line along the trailing edge of the dark fin over a dark sky), 34 at
  // three; by the second 843, 444 and 46, still over 40 at three along the
  // lower body. Four deep, 28 and 8: what is left is mostly the light line
  // drawn along the leading edge of the fin.
  const img = cutout(ARCHIVE93_PICTURE, 2272 / 602);
  assert.equal(img.h, 602, 'the drawing at 2272 px: 2272 x 602');
  const dark = darkRim(img), pale = paleRim(img);
  assert.ok(dark <= 40, 'the page is still in the outline of the dark paint: ' + dark + ' light pixels on it');
  assert.ok(pale <= 40, 'the page is still in the outline of the dark and grey paint: ' + pale + ' pale pixels on it');
  const note = ARCHIVE93_NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /supplied drawing \(5924 x 1611, already cut out\)/, 'the note names the drawing it is made from');
  assert.match(note, /at the depth of four pixels of the drawing, the smallest that passes/, 'and the depth');
  assert.match(note, /200 at one pixel, 218 at two, 34 at three and 28 at four; by the count of the Dream livery test, 843, 444, 46 and 8/, 'and the counts it was chosen by');
  assert.match(note, /\(2272 x 602\)/, 'and the size it comes out at');
  const readme = fs.readFileSync(path.join(ROOT, 'scripts', 'heritage-sky', 'README.md'), 'utf8');
  assert.match(readme, /card-cutout\.py 747-305-1993\.png fids-current\/aircraft\/heritage\/air-canada-747-305-ac93\.png 2272 10 4/, 'the README gives the command, depth and all');
});

// The body of a fin 305 picture, measured as on all three cards: the opaque
// run of each column (opacity 128 or more) from the top of the body down,
// the depth the median of the columns 56–64% back, behind the upper deck.
function bodyOf(picture) {
  const { w, h, px } = rgbaOf(path.join(ROOT, 'fids-current', picture.replace(/^\//, '')));
  const A = (x, y) => px[(y * w + x) * 4 + 3];
  const depths = [], tops = [];
  for (let x = Math.floor(0.56 * w); x <= Math.floor(0.64 * w); x++) {
    let y = 0;
    while (y < h && A(x, y) < 128) y++;
    const top = y;
    while (y < h && A(x, y) >= 128) y++;
    tops.push(top); depths.push(y - top);
  }
  depths.sort((a, b) => a - b);
  return { w, h, A, tops, depth: depths[depths.length >> 1] };
}

test('the 1993 picture has the shape its note gives: 10.33 long for its depth, to the tip of the tailplane', () => {
  const { w, h, A, tops, depth } = bodyOf(ARCHIVE93_PICTURE);
  assert.equal(depth, 220, 'the depth behind the upper deck');
  assert.equal((w / depth).toFixed(2), '10.33', 'length over depth');
  // the furthest aft point (the last column, where the tip is partly clear) is the tailplane,
  // level with the top of the body, not the fin
  const aft = [];
  for (let y = 0; y < h; y++) if (A(w - 1, y) > 0) aft.push(y);
  assert.ok(aft.length && Math.abs(aft[0] - Math.min(...tops)) < 20, 'the last column is the tip of the tailplane, at the height of the top of the body');
  const note = ARCHIVE93_NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /the depth is the median of the columns 56–64% back \(220 px\)/, 'the note gives the depth');
  assert.match(note, /over that depth is 10\.33 \(10\.28 to the top of the fin\), against 10\.87 for the 747-100 as on the 1980 livery card: 5\.0% short/, 'and the proportion against the -100');
});

test('the Dream livery picture has the shape its note gives, measured again on the final drawing: 10.19 long for its depth, to the top of the fin', () => {
  const { w, h, A, tops, depth } = bodyOf(PICTURE);
  assert.equal(depth, 223, 'the depth behind the upper deck (234 on the stand-in)');
  assert.equal((w / depth).toFixed(2), '10.19', 'length over depth (9.71 on the stand-in)');
  // the furthest aft point (the last column, partly clear) is the top of the fin, not the tailplane
  const aft = [];
  for (let y = 0; y < h; y++) if (A(w - 1, y) > 0) aft.push(y);
  assert.ok(aft.length && aft[aft.length - 1] < 0.1 * Math.min(...tops), 'the last column is the top of the fin, far above the top of the body');
  const note = NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /ITS SHAPE, measured again on the final drawing/, 'the note says the shape is measured on the final drawing');
  assert.match(note, /the depth is the median of the columns 56–64% back, behind the wing and ahead of the taper to the tail \(223 px\)/, 'the note gives the depth');
  assert.match(note, /over that depth is 10\.19 \(10\.17 to the tip of the tailplane\), against 10\.87 for the 747-100/, 'and the proportion against the -100');
  assert.match(note, /which is the fuselage WIDTH published for the 747-100 by Aerocorner and aircraftinvestigation\.info, taken here as its depth\): 6\.3% short, and less if the body is deeper than it is wide behind the hump/, 'with the width taken for the depth, said');
  assert.match(note, /The stand-in measured 9\.71, 10\.7% short/, 'and what the stand-in measured');
});

test('the pictures are in the build: under the folder the deploy serves, in the size it allows', () => {
  const wr = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  assert.match(wr, /"assets":\s*\{[\s\S]*?"directory":\s*"fids-current"/, 'the deploy serves fids-current as its static assets');
  for (const picture of [PICTURE, ARCHIVE_PICTURE, ARCHIVE93_PICTURE]) {
    const file = path.join(ROOT, 'fids-current', picture.replace(/^\//, ''));
    const size = fs.statSync(file).size;
    assert.ok(size > 100000 && size < 2 * 1024 * 1024, picture + ' is a picture of card size (' + size + ' bytes), far under the 25 MiB a static asset may be');
  }
  const ignore = path.join(ROOT, 'fids-current', '.assetsignore');
  if (fs.existsSync(ignore)) {
    const pats = fs.readFileSync(ignore, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    assert.ok(!pats.some((p) => /aircraft|heritage|\*\.png/.test(p)), 'and nothing keeps them out of the deploy');
  }
});
