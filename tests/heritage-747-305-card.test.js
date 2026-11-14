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
// never a United gate), placed so that no two Air Canada widebodies come back
// to back in either pool the board runs.
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

const KEY = 'air-canada-747-305-2017';
const PICTURE = '/aircraft/heritage/air-canada-747-305-2017.png';
const HEADING = 'heritageDreamKicker';
const TYPE = 'Boeing 747-133';

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
// the comment of the record, from the brace that opens it to its key
const NOTE = (() => {
  const at = MARKS_SRC.indexOf("key: '" + KEY + "'");
  assert.ok(at > 0, 'the record is in the source');
  return MARKS_SRC.slice(MARKS_SRC.lastIndexOf('\n  {\n', at), at);
})();

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
  // the note says the picture is a stand-in, and how the full-size drawing replaces it
  const note = NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /The file on disk is a STAND-IN, the drawing at the size it was first sent/, 'the note says the picture is a stand-in');
  assert.match(note, /The full-size drawing replaces it by running the same tool on it into the same file name/, 'and that the full-size drawing replaces it, by the same tool into the same file name');
});

test('its place in the rotation: no two Air Canada widebodies back to back, the DC-9 spacing kept', () => {
  // The board rotates each airport pool in set order and wraps. The widebodies
  // of the set (the 767s, the TriStars, the A350-1000 and this 747) come every
  // other card, and the 2017 DC-9 stays three or more cards from every other DC-9.
  const WIDE = ['air-canada-767', 'air-canada-767-87', 'air-canada-l1011-87', 'air-canada-l1011-93', 'air-canada-a350-1000', KEY];
  const DC9 = ['air-canada', 'air-canada-caps', 'air-canada-dc9-93'];
  const keys = MARKS.map((k) => k.key);
  assert.equal(keys.indexOf(KEY), keys.indexOf('air-canada') + 1, 'after the 1987 DC-9');
  assert.equal(keys.indexOf(KEY) + 1, keys.indexOf('air-canada-caps'), 'and before the 1980 DC-9');
  assert.equal(keys[keys.length - 1], 'air-canada-l1011-93', 'the 1993 TriStar is still last');
  const dist = (pool, a, b) => { const gap = Math.abs(pool.indexOf(a) - pool.indexOf(b)); return Math.min(gap, pool.length - gap); };
  // the Atlantic pool (with Air Atlantic and Air Nova) and the pool of every other Canadian airport
  for (const ia of ['YHZ', 'YVR']) {
    const pool = MARKS.filter((mk) => !mk.gates && (mk.airports === '*CA' || (Array.isArray(mk.airports) && mk.airports.includes(ia)))).map((mk) => mk.key);
    assert.ok(pool.includes(KEY), 'the card runs at ' + ia);
    for (const a of WIDE) for (const b of WIDE) {
      if (a < b) assert.ok(dist(pool, a, b) >= 2, a + ' and ' + b + ' are not back to back at ' + ia + ' (' + dist(pool, a, b) + ')');
    }
    for (const k of DC9) assert.ok(dist(pool, 'air-canada-dc9-2017', k) >= 3, 'the 2017 DC-9 is three or more cards from ' + k + ' at ' + ia);
    for (const [a, b] of [['air-canada-dc8', 'air-canada-dc8-80'], ['air-canada-767', 'air-canada-767-87'], ['air-canada-l1011-87', 'air-canada-l1011-93']]) {
      assert.ok(dist(pool, a, b) > 1, a + ' and ' + b + ' are still apart at ' + ia);
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
      assert.ok(b.cards(TURNS).includes(KEY), `${row.flight} at ${ia}: and the 747 comes round`);
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
      assert.ok(!seen.includes(KEY), `${row.flight} at ${ia} never draws the 747`);
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
  const note = NOTE.replace(/\s*\/\/\s*/g, ' ');
  assert.match(note, /Measured at 1680 x 1050[^.]*after document\.fonts\.ready, every language is one row/, 'measured after the fonts load, one row each');
  // each language named with its share of the line, every one at 92% or less (two rows start past 100%; 96% is too near)
  const pct = {};
  for (const l of STORE.LANGS) {
    const m = new RegExp('the ' + LANG_NAME[l] + ',? (?:[0-9.]+ of [0-9.]+ px )?\\(?([0-9.]+)%').exec(note);
    assert.ok(m, 'the ' + LANG_NAME[l] + ' line is measured');
    pct[l] = parseFloat(m[1]);
    assert.ok(pct[l] > 50 && pct[l] <= 92, 'the ' + LANG_NAME[l] + ' line takes ' + pct[l] + '% of the line');
  }
  const longest = Object.keys(pct).sort((a, b) => pct[b] - pct[a])[0];
  assert.match(note, new RegExp('The longest line is the ' + LANG_NAME[longest]), 'the longest is named first');
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
  assert.ok(Math.abs(w / h - 2272 / 635) < 0.01, 'at the proportions of the drawing: cropped and scaled, never stretched (it is ' + w + ' x ' + h + ')');
  const A = (x, y) => px[(y * w + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) assert.equal(A(x, y), 0, 'the corner at ' + x + ',' + y + ' is clear');
  const touches = { left: false, right: false, top: false, bottom: false };
  for (let y = 0; y < h; y++) { if (A(0, y) || A(1, y)) touches.left = true; if (A(w - 1, y) || A(w - 2, y)) touches.right = true; }
  for (let x = 0; x < w; x++) { if (A(x, 0) || A(x, 1)) touches.top = true; if (A(x, h - 1) || A(x, h - 2)) touches.bottom = true; }
  assert.deepEqual(touches, { left: true, right: true, top: true, bottom: true }, 'cropped to the drawing: no margin of page round it');
  let clear = 0, solid = 0, haze = 0;
  for (let i = 3; i < px.length; i += 4) { if (px[i] === 0) clear++; else if (px[i] === 255) solid++; else if (px[i] <= 6) haze++; }
  assert.ok(clear / (w * h) > 0.5, 'more than half the picture is sky (' + (100 * clear / (w * h)).toFixed(1) + '%)');
  assert.ok(solid / (w * h) > 0.3, 'and the aeroplane is solid (' + (100 * solid / (w * h)).toFixed(1) + '%)');
  assert.equal(haze, 0, 'no haze left off the outline');

  // NO PAGE LEFT ROUND THE BLACK FIN, BELLY AND ENGINES. The stand-in came on a
  // white page; un-mixed one pixel deep, the page stayed a pale line round the
  // dark paint over a dark sky (433 pixels by this count); two deep, the
  // default of the tool, 1. Counted as on the A350-1000: a pixel that shows
  // (opacity 100 or more) and is not dark (every channel 60 or more), on the
  // outline (clear sky within one pixel), on a dark part (solid paint of 40 or
  // less within three pixels, and no light solid paint).
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
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'heritage-sky', 'card-cutout.py')), 'the tool that makes the picture from a drawing is kept, for the full-size drawing');
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
});
