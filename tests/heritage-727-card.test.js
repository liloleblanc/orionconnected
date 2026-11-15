'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// FROM THE ARCHIVE — the Boeing 727-233 of Air Canada, in the 1980 livery.
//
// A supplied side drawing, nose left: AIR CANADA in red capitals, one red
// cheatline through the windows and round the nose, the white rondelle on a
// red fin, C-GAAY on the rear fuselage and 422 at the top of the fin. C-GAAY
// was a 727-233 (c/n 22037), delivered to Air Canada on 10 April 1980 and
// gone to FedEx in August 1992. Its fin number was 425, not 422 (422 was
// C-GAAV): the record says so and the drawing is used as supplied, since the
// card prints neither the registration nor the fin.
//
// A plain archive card, From the archive over it, with the mark of the other
// 1980 cards and the line of the 767 and the DC-8-63: the type spelled out,
// the years of the type with Air Canada (1974–1992) and the 1980 livery, in
// nine languages, each the 1980 767 line word for word with the model and
// the years changed.
//
// THE DECK. It sits between the A350-1000 and the 1993 747, where the 1965
// DC-8 was; the DC-8 moved in between the 1980 767 and the Canadian Airlines
// DC-10. No two cards of one type or one livery meet in either pool. The
// Atlantic pool is eighteen cards, nine widebodies (the DC-10 counted), and
// they come every other card; elsewhere sixteen cards make the two pairs
// they must. The three fin 305 cards come 6, 6 and 6 apart and 6, 5 and 5.
// Without a card moved, the one place keeping those two rules was beside the
// 1980 767, another 1980 card.
//
// tests/heritage-dream-card.test.js holds the set card for card (this card is
// in its frozen list); tests/heritage-747-305-card.test.js holds the fin 305
// spacing and the widebody pairs; this file holds the card itself.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const STORE = require('../fids-current/js/board-strings.js');

const KEY = 'air-canada-727-80';
const PICTURE = '/aircraft/heritage/air-canada-727-ac80.png';
const MARK_1980 = '/logos/advertisements/retro-airlines/ACLOGO-1980-2.svg';
const ENGLISH = 'Boeing 727-233 · 1974–1992 · 1980 livery';

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
const flat = (s) => s.replace(/\s*\/\/\s*/g, ' ');

// One gate, re-aimed between questions: the shipping functions lifted out of
// fids-core.js, as tests/heritage-747-305-card.test.js runs them. AP is empty,
// so a Canadian airport is one whose code starts with Y, as on the board.
function board() {
  const win = {};
  const langs = ['en', 'fr'];
  let heritage = '';
  const doc = { documentElement: { classList: { contains: () => false } } };
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
    // the pictures one gate shows, in order, for `turns` visits of the slide (null where it draws nothing)
    pictures(turns) {
      const out = [];
      for (let i = 0; i < turns; i++) {
        const html = this.draw();
        const pic = html && /class="hcard-plane" src="([^"]+)"/.exec(html);
        out.push(html == null ? null : (pic ? pic[1] : 'none'));
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

test('the card: the Boeing 727-233 in the Air Canada set, with the mark of the 1980 cards and the default heading', () => {
  const m = byKey[KEY];
  assert.ok(m, 'the card is in the deck');
  assert.equal(m.name, 'Air Canada');
  assert.equal(m.aircraft, PICTURE);
  assert.equal(m.heading, undefined, 'no heading of its own: From the archive');
  assert.equal(m.gates, undefined, 'no gates: the Air Canada set, Air Canada pages only');
  assert.equal(m.airports, '*CA', 'every Canadian airport, where the rest of the set runs');
  assert.ok(!m.credit && !m.endorsement, 'a supplied drawing: no credit line, no second mark');
  // the 1980 lockup of the supplied family, the mark of every other 1980 card
  assert.equal(m.file, MARK_1980);
  for (const k of ['air-canada-caps', 'air-canada-767', 'air-canada-dc8-80', 'air-canada-747-305-80']) assert.equal(m.file, byKey[k].file, 'the mark of ' + k);
  for (const f of [m.file, m.aircraft]) assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', f.replace(/^\//, ''))), f + ' is on disk');
  // the boards name no 727, so the line spells the type, as the 767 and DC-8-63 lines do, and the record carries none
  assert.equal(m.type, undefined, 'no type on the record: the line spells it');
  const iata = /const IATA_AIRCRAFT = \{[\s\S]*?\n\};/.exec(SRC);
  assert.ok(iata, 'the IATA_AIRCRAFT table is found');
  assert.doesNotMatch(iata[0], /'72[0-9A-Z]'\s*:/, 'no 727 there: if one is added, the card may take its name');
  // named as the other heritage keys and pictures are: the type, then the livery year
  assert.match(KEY, /^air-canada-727-80$/);
  assert.match(PICTURE, /\/air-canada-727-ac80\.png$/, 'the picture is named as air-canada-dc8-ac80.png and air-canada-747-305-ac80.png are');
});

test('the note keeps to the checked facts and says where each one comes from', () => {
  const note = flat(NOTE);
  assert.match(note, /C-GAAY was an Air Canada Boeing 727-233, c\/n 22037, line 1600/, 'the aeroplane drawn');
  assert.match(note, /PlaneLogger, the record of N272FE; ABPic 1575010/, 'and its sources');
  assert.match(note, /delivered on 10 April 1980 \(ABPic, airport-data\.com and PlaneLogger; one AirHistory\.net caption has 20 April\)/, 'the delivery, and the one source that differs');
  assert.match(note, /went to FedEx as N272FE in August 1992/, 'and when it left');
  assert.match(note, /Houston on 31 October 1982 \(airport-data\.com photograph 001664983\)/, 'photographed in this livery');
  // the fin on the drawing is not this aeroplane, and the drawing is left as it is
  assert.match(note, /THE FIN READS 422, WHICH WAS NOT THIS AEROPLANE\. The fin number of C-GAAY was 425/, 'the fin number said plainly');
  assert.match(note, /Fin 422 was C-GAAV, c\/n 21675 \(PlaneLogger\)/, 'and whose it was');
  assert.match(note, /The drawing is used as supplied/, 'the art is not changed');
  // the years, both ends sourced, and the one aeroplane after the fleet
  assert.match(note, /C-GAAA, fin 401, was delivered on 25 September 1974 \(PlaneLogger\)/, 'the first');
  assert.match(note, /21 November 1992 as the last day of flying/, 'the last day of the fleet');
  assert.match(note, /8 June 1993 \(the NetLetter 1468\): one aeroplane after the fleet had gone, so the line keeps 1992/, 'the 1993 charters, and why 1992 stays');
  assert.match(note, /The three 727-22 freighters bought from United in 1979 \(Tenby\) are 727-100s, another model/, 'the freighters are another model');
  assert.match(note, /late 1977 or early 1978; the recorded name stays/, 'the livery year as recorded, with the source that differs');
  assert.match(note, /IT FACES NOSE LEFT, as every picture of the set/, 'its facing, and nothing mirrored');
  assert.doesNotMatch(NOTE, /['"’]/, 'no quote marks and no apostrophes in the note');
  assert.doesNotMatch(note, /\bCF-[A-Z]/, 'no CF- mark claimed');
});

// ── the words ──────────────────────────────────────────────────────────────

// The words of the 767 and DC-8-63 lines for the 1980 livery, which this card takes word for word.
const LIVERY_1980 = { en: '1980 livery', fr: 'livrée de 1980', es: 'librea de 1980', de: 'Lackierung von 1980', it: 'livrea del 1980',
                      pt: 'pintura de 1980', ja: '1980年塗装', zh: '1980年涂装', ar: 'طلاء 1980' };
const ARCHIVE_HEADING = { en: 'From the archive', fr: 'Depuis les archives', es: 'Del archivo', de: 'Aus dem Archiv', it: 'Dall’archivio',
                          pt: 'Do arquivo', ja: 'アーカイブより', zh: '档案回顾', ar: 'من الأرشيف' };
const LANG_NAME = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese', ar: 'Arabic' };

test('the caption: Boeing 727-233 · 1974–1992 · 1980 livery, the 1980 767 line word for word in nine languages', () => {
  assert.deepEqual(Object.keys(LIVERY_1980).sort(), STORE.LANGS.slice().sort(), 'all nine board languages');
  const e = STORE.entry('heritage:' + KEY), b767 = STORE.entry('heritage:air-canada-767'), dc8 = STORE.entry('heritage:air-canada-dc8-80');
  assert.ok(e, 'the caption is in the store');
  assert.equal(e.en, ENGLISH);
  const seen = new Set();
  for (const l of STORE.LANGS) {
    const cap = e[l];
    assert.ok(cap, 'a caption in ' + l);
    const parts = cap.split(' · ');
    assert.equal(parts.length, 3, 'type · years · livery, the shape of the 767 and DC-8-63 lines, in ' + l);
    assert.equal(parts.length, b767[l].split(' · ').length);
    assert.equal(parts.length, dc8[l].split(' · ').length);
    assert.equal(parts[0], b767[l].split(' · ')[0].replace('767-233', '727-233'), 'the maker and the customer number as the 767 line spells them, in ' + l);
    assert.equal(parts[1], '1974–1992', 'the years of the type with Air Canada, in ' + l);
    assert.equal(parts[2], LIVERY_1980[l], 'the 1980 livery, in ' + l);
    assert.equal(parts[2], b767[l].split(' · ')[2], 'in the words of the 1980 767 line, in ' + l);
    assert.equal(parts[2], dc8[l].split(' · ')[2], 'and of the DC-8-63 line, in ' + l);
    assert.equal(cap, b767[l].replace('767-233', '727-233').replace('1982–2008', '1974–1992'), 'the 1980 767 line with the model and the years changed, in ' + l);
    assert.deepEqual(cap.match(/\b(19|20)\d\d\b/g), ['1974', '1992', '1980'], 'the type years and the livery year, nothing else: not 1993, not the 1980 to 1992 of the aeroplane drawn, in ' + l);
    assert.doesNotMatch(cap, /GAAY|GAAV|C-G|\b42[25]\b|Air Canada|エア・カナダ|加航|إير كندا/, 'no registration, no fleet number and no airline in the line, in ' + l);
    assert.doesNotMatch(cap, /Advanced|233F|FedEx|Rapidair/i, 'no marketing name, no freighter, no route, in ' + l);
    assert.doesNotMatch(cap, /what-if|et si|y si|e se|Fiktion|もしも|假想|ماذا لو/i, 'nothing of the what-if: the livery it wore, in ' + l);
    if (l !== 'en') assert.doesNotMatch(cap, /livery/, 'in its own words, not the English one, in ' + l);
    seen.add(cap);
  }
  assert.equal(seen.size, STORE.LANGS.length, 'nine different lines: none left in another language');
});

// The measured widths recorded in the record note: every language one row, at 92% or less of the line
// (two rows start past 100%; 96% is too near), the longest named first.
test('every line is one row at 1680 x 1050, the widths recorded with the card and beside the line', () => {
  const note = flat(NOTE);
  assert.match(note, /Measured at 1680 x 1050[^.]*after document\.fonts\.ready, every language is one row/, 'measured after the fonts load, one row each');
  const pct = {};
  for (const l of STORE.LANGS) {
    const m = new RegExp('the ' + LANG_NAME[l] + ',? (?:[0-9.]+ of [0-9.]+ px )?\\(?([0-9.]+)%').exec(note);
    assert.ok(m, 'the ' + LANG_NAME[l] + ' line is measured');
    pct[l] = parseFloat(m[1]);
    assert.ok(pct[l] > 50 && pct[l] <= 92, 'the ' + LANG_NAME[l] + ' line takes ' + pct[l] + '% of the line');
  }
  const longest = Object.keys(pct).sort((a, b) => pct[b] - pct[a])[0];
  assert.equal(longest, 'de');
  assert.match(note, /The longest line is the German, 476\.0 of 636\.7 px \(74\.8%\)/, 'the longest is named first, as measured');
  assert.match(fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'board-strings.js'), 'utf8'),
    /every language is one row at\s*\/\/ 1680 x 1050; the longest line is the German, at 74\.8% of it\.\s*'heritage:air-canada-727-80'/, 'and the store says so beside the line');
});

// ── where it runs, and how it is drawn ─────────────────────────────────────

const AC_ROWS = [
  { flight: 'AC870', airline: 'AC' },
  { flight: 'AC1983', airline: 'AC', _opCode: 'RV' },
  { flight: 'QK8790', airline: 'QK' },
  { flight: 'ACA659', airline: 'ACA' }
];

test('it runs on Air Canada pages at Canadian airports, within one turn of the deck', () => {
  const b = board();
  for (const ia of ['YYZ', 'YUL', 'YVR', 'YHZ', 'YQM', 'YYT', 'YYC']) {
    for (const row of AC_ROWS) {
      b.at(ia, row);
      assert.ok(b.deck().includes('heritage'), `${row.flight} at ${ia}: the archive slot is there`);
      assert.ok(b.pictures(TURNS).includes(PICTURE), `${row.flight} at ${ia}: and the 727 comes round`);
    }
  }
  const anv = b.at('YHZ', { flight: '500', airline: 'ANV' }, { heritage: 'ANV' }).pictures(TURNS);
  assert.ok(anv.includes(PICTURE), 'the Air Nova demonstration gate is an Air Canada page too');
});

test('and never on a United gate, another airline, an Air Canada gate abroad or a board with no gate flight', () => {
  const b = board();
  for (const ia of ['YYZ', 'YUL', 'YVR', 'ORD', 'EWR', 'FRA']) {
    for (const row of [{ flight: 'UA1234', airline: 'UA' }, { flight: 'UAL951', airline: 'UAL' }, { flight: 'UA4321', airline: 'UA', _opCode: 'OO' }]) {
      assert.ok(!b.at(ia, row).pictures(TURNS * 2).includes(PICTURE), `${row.flight} at ${ia} never draws the 727`);
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
    assert.equal(b.draw(), null, `and draws nothing at ${ia}`);
  }
});

test('the card as drawn, in every language: From the archive, the caption, the 1980 mark and its picture', () => {
  const b = board();
  const html = b.at('YYZ', AC_ROWS[0]).find(TURNS);
  assert.ok(html, 'an Air Canada gate at Toronto comes to it');
  assert.match(html, /<div class="hcard-kicker"><span class="bs-h" lang="en">From the archive<\/span> &nbsp;\|&nbsp; <span class="bs-h" lang="fr">Depuis les archives<\/span><\/div>/, 'the archive heading, English then French');
  assert.match(html, /<img class="hcard-mark" src="\/logos\/advertisements\/retro-airlines\/ACLOGO-1980-2\.svg" alt="Air Canada">/, 'the 1980 lockup');
  assert.match(html, /<img class="hcard-plane" src="\/aircraft\/heritage\/air-canada-727-ac80\.png" alt=""/, 'the picture, over the sky');
  assert.match(html, /<div class="hcard-line"><span class="bs-h" lang="en">Boeing 727-233 · 1974⁠–⁠1992 · 1980 livery<\/span><\/div>/, 'the English line, the year range kept whole');
  assert.match(html, /<div class="hcard-line hcard-line-2"><span class="bs-h" lang="fr">Boeing 727-233 · 1974⁠–⁠1992 · livrée de 1980<\/span><\/div>/, 'and the French line');
  assert.doesNotMatch(html, /Dream livery|Livrée de rêve|Coming to the fleet/, 'neither the Dream livery heading nor the coming one');
  assert.doesNotMatch(html, /hcard-credit"|hcard-endorse/, 'no credit line and no endorsement');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /GAAY|\b42[25]\b/, 'no registration and no fleet number in the words on the card');
  // French first where the board puts French first
  const yul = b.at('YUL', AC_ROWS[0]).find(TURNS);
  assert.match(yul, /<div class="hcard-kicker"><span class="bs-h" lang="fr">Depuis les archives<\/span>/, 'Montréal leads in French');
  assert.match(yul, /<div class="hcard-line"><span class="bs-h" lang="fr">Boeing 727-233 · 1974⁠–⁠1992 · livrée de 1980<\/span>/, 'the caption too');
  for (const l of STORE.LANGS) {
    const h = b.at('YVR', AC_ROWS[0], { langs: l === 'en' ? ['en', 'fr'] : [l, 'en'] }).find(TURNS);
    assert.ok(h, 'drawn in ' + l);
    const line = STORE.bs('heritage:' + KEY, l).replace(/(\d)–(\d)/g, '$1⁠–⁠$2');
    assert.ok(h.includes('lang="' + l + '"' + (l === 'ar' ? ' dir="rtl"' : '') + '>' + line + '</span>'), 'the ' + l + ' line: ' + line);
    assert.ok(line.includes('1974') && line.includes('1992') && line.includes(LIVERY_1980[l]), 'it says 1974, 1992 and the 1980 livery, in ' + l);
    assert.ok(kicker(h).includes(ARCHIVE_HEADING[l]), 'under ' + ARCHIVE_HEADING[l]);
    assert.doesNotMatch(h.replace(/ onloadedmetadata="[^"]*"/, ''), /[{}]/, 'no placeholder left, in ' + l);
  }
});

// ── its place in the deck ──────────────────────────────────────────────────

// Every card of the Air Canada set by its livery and its type. The A350-1000 wears the scheme of 2017.
const LIVERY = {
  'air-canada-747-305-80': 1980, 'air-canada-767': 1980, 'air-canada-caps': 1980, 'air-canada-dc8-80': 1980, [KEY]: 1980,
  'air-canada': 1987, 'air-canada-l1011-87': 1987, 'air-canada-767-87': 1987,
  'air-canada-dc9-93': 1993, 'air-canada-747-305-93': 1993, 'air-canada-l1011-93': 1993,
  'air-canada-747-305-2017': 2017, 'air-canada-dc9-2017': 2017, 'air-canada-a350-1000': 2017,
  'air-canada-dc8': 1965
};
const TYPE = {
  'air-canada': 'DC-9', 'air-canada-caps': 'DC-9', 'air-canada-dc9-93': 'DC-9', 'air-canada-dc9-2017': 'DC-9',
  'air-canada-747-305-80': '747', 'air-canada-747-305-2017': '747', 'air-canada-747-305-93': '747',
  'air-canada-dc8': 'DC-8', 'air-canada-dc8-80': 'DC-8', 'air-canada-767': '767', 'air-canada-767-87': '767',
  'air-canada-l1011-87': 'L-1011', 'air-canada-l1011-93': 'L-1011', 'air-canada-a350-1000': 'A350', 'canadian-airlines': 'DC-10', [KEY]: '727'
};
const FIN305 = ['air-canada-747-305-80', 'air-canada-747-305-2017', 'air-canada-747-305-93'];
const WIDE = new Set(['canadian-airlines', 'air-canada-767', 'air-canada-767-87', 'air-canada-l1011-87', 'air-canada-l1011-93', 'air-canada-a350-1000', ...FIN305]);
const poolOf = (order, ia) => order.filter((k) => { const mk = byKey[k]; return !mk.gates && (mk.airports === '*CA' || (Array.isArray(mk.airports) && mk.airports.includes(ia))); });
const ring = (pool) => pool.map((k, i) => [k, pool[(i + 1) % pool.length]]);
const dist = (pool, a, b) => { const gap = Math.abs(pool.indexOf(a) - pool.indexOf(b)); return Math.min(gap, pool.length - gap); };
const gaps = (pool) => { const at = FIN305.map((k) => pool.indexOf(k)).sort((x, y) => x - y); return [at[1] - at[0], at[2] - at[1], pool.length - at[2] + at[0]]; };
const widePairs = (pool) => ring(pool).filter(([a, b]) => WIDE.has(a) && WIDE.has(b)).map(([a, b]) => a + ' then ' + b);
// the two rules the deck keeps: the fin 305 cards as even as the pool allows, and the fewest widebody pairs it allows
const keepsRules = (pool) => { const g = gaps(pool), w = pool.filter((k) => WIDE.has(k)).length;
  return Math.max(...g) - Math.min(...g) <= 1 && widePairs(pool).length === Math.max(0, 2 * w - pool.length); };

test('its place: after the A350-1000 and before the 1993 747, the 1965 DC-8 moved between the 1980 767 and the DC-10', () => {
  const keys = MARKS.map((k) => k.key);
  const after = (a, b, what) => assert.equal(keys.indexOf(b), keys.indexOf(a) + 1, what);
  after('air-canada-a350-1000', KEY, 'the 727 after the A350-1000');
  after(KEY, 'air-canada-747-305-93', 'and before the 1993 747');
  after('air-canada-767', 'air-canada-dc8', 'the 1965 DC-8 after the 1980 767');
  after('air-canada-dc8', 'canadian-airlines', 'and before the Canadian Airlines DC-10');
  assert.equal(keys[0], 'air-atlantic', 'Air Atlantic is still first');
  assert.equal(keys[1], 'air-canada-747-305-80', 'the 1980 747 is still the first Air Canada card');
  assert.equal(keys[keys.length - 1], 'air-canada-l1011-93', 'the 1993 TriStar is still last');
  assert.match(flat(NOTE), /Between the A350-1000 and the 1993 747 on purpose, where the 1965 DC-8 was/, 'the note says why');
  assert.match(flat(noteOf('air-canada-dc8')), /2026-11-15 — between the 1980 767 and the Canadian Airlines DC-10 on purpose/, 'and the DC-8 note says it moved');
});

test('no two cards of one type or one livery meet in either pool, the wrap included, and the deck rules hold', () => {
  const keys = MARKS.map((k) => k.key);
  for (const k of keys) if (!byKey[k].gates && /^air-canada/.test(k)) assert.ok(LIVERY[k] && TYPE[k], k + ' has a livery and a type here: a new card is placed by these rules too');
  for (const [ia, n, spread, pairs] of [
    ['YHZ', 18, [6, 6, 6], []],
    ['YVR', 16, [6, 5, 5], ['air-canada-747-305-2017 then air-canada-l1011-87', 'air-canada-l1011-93 then air-canada-747-305-80']]
  ]) {
    const pool = poolOf(keys, ia);
    assert.equal(pool.length, n, ia + ': ' + n + ' cards');
    assert.ok(pool.includes(KEY), 'the 727 runs at ' + ia);
    for (const [a, b] of ring(pool)) {
      assert.ok(!(LIVERY[a] && LIVERY[a] === LIVERY[b]), a + ' and ' + b + ' share the ' + LIVERY[a] + ' livery side by side at ' + ia);
      assert.ok(!(TYPE[a] && TYPE[a] === TYPE[b]), a + ' and ' + b + ' are both ' + TYPE[a] + ' side by side at ' + ia);
    }
    const r80 = Object.keys(LIVERY).filter((k) => LIVERY[k] === 1980);
    for (const a of r80) for (const b of r80) if (a < b) assert.ok(dist(pool, a, b) >= 2, a + ' and ' + b + ', both 1980, are two or more apart at ' + ia);
    assert.deepEqual(gaps(pool), spread, 'the three cards of fin 305 at ' + ia + ', the wrap included');
    assert.ok(Math.max(...gaps(pool)) - Math.min(...gaps(pool)) <= 1, 'as even as ' + n + ' cards allow at ' + ia);
    const w = pool.filter((k) => WIDE.has(k)).length;
    assert.equal(w, 9, ia + ': nine widebodies, the DC-10 counted');
    assert.deepEqual(widePairs(pool), pairs, ia + ': the widebody pairs');
    assert.equal(widePairs(pool).length, Math.max(0, 2 * w - n), ia + ': the fewest the count allows');
    const c = pool.indexOf('canadian-airlines');
    assert.deepEqual([pool[(c + n - 1) % n], pool[(c + 1) % n]].filter((k) => FIN305.includes(k)), [], ia + ': the DC-10 beside no 747');
    for (const k of ['air-canada', 'air-canada-caps', 'air-canada-dc9-93']) assert.ok(dist(pool, 'air-canada-dc9-2017', k) >= 3, 'the 2017 DC-9 is three or more cards from ' + k + ' at ' + ia);
    assert.ok(dist(pool, 'air-canada-dc8', 'air-canada-dc8-80') >= 7, 'the two DC-8s far apart at ' + ia + ' (' + dist(pool, 'air-canada-dc8', 'air-canada-dc8-80') + ')');
    for (const [a, b] of [['air-canada-767', 'air-canada-767-87'], ['air-canada-l1011-87', 'air-canada-l1011-93']]) assert.ok(dist(pool, a, b) > 1, a + ' and ' + b + ' are apart at ' + ia);
  }
});

test('why the DC-8 moved: without it, the one place that keeps the deck rules puts the 727 beside the 1980 767', () => {
  // The deck as it was before this card (the 1965 DC-8 after the A350-1000), with the 727 tried in every place.
  const before = MARKS.map((k) => k.key).filter((k) => k !== KEY && k !== 'air-canada-dc8');
  before.splice(before.indexOf('air-canada-a350-1000') + 1, 0, 'air-canada-dc8');
  const fits = new Set();
  for (let i = 0; i <= before.length; i++) {
    const order = before.slice(0, i).concat(KEY, before.slice(i));
    const yhz = poolOf(order, 'YHZ'), at = yhz.indexOf(KEY), n = yhz.length;
    if (keepsRules(yhz) && keepsRules(poolOf(order, 'YVR'))) fits.add(yhz[(at + n - 1) % n] + ' | ' + yhz[(at + 1) % n]);
  }
  assert.deepEqual([...fits], ['air-canada-767 | canadian-airlines'], 'one place keeps both rules in both pools');
  assert.equal(LIVERY['air-canada-767'], LIVERY[KEY], 'and it is beside another 1980 card');
  // with the DC-8 moved, the deck keeps both rules
  assert.ok(keepsRules(poolOf(MARKS.map((k) => k.key), 'YHZ')) && keepsRules(poolOf(MARKS.map((k) => k.key), 'YVR')), 'the deck as it is keeps both');
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

// Light pixels on the outline of the dark paint, counted as on the 1980 747 and the A350-1000.
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

// Pale pixels on the outline of any paint of 150 or less, counted as in tests/heritage-dream-card.test.js.
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

// Page left in the outline whatever the paint behind it: a pixel of the outline (opacity 100 or more, clear
// sky within one pixel) 40 or more brighter than the paint just inside it (the median brightness of the
// solid pixels within four, each two or more from the sky, five of them at least). The two counts above
// look for page beside dark paint and beside paint of 150 or less; this one reaches the mid grey of a belly.
function brightRim({ w, h, px }) {
  const A = (x, y) => px[(y * w + x) * 4 + 3];
  const lum = (x, y) => { const o = (y * w + x) * 4; return 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]; };
  const skyWithin = (x, y, r) => {
    for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) if (A(xx, yy) === 0) return true;
    return false;
  };
  let rim = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (A(x, y) < 100 || !skyWithin(x, y, 1)) continue;
      const inner = [];
      for (let yy = Math.max(0, y - 4); yy <= Math.min(h - 1, y + 4); yy++) {
        for (let xx = Math.max(0, x - 4); xx <= Math.min(w - 1, x + 4); xx++) if (A(xx, yy) === 255 && !skyWithin(xx, yy, 2)) inner.push(lum(xx, yy));
      }
      if (inner.length < 5) continue;
      inner.sort((a, b) => a - b);
      if (lum(x, y) - inner[inner.length >> 1] >= 40) rim++;
    }
  }
  return rim;
}

test('its picture: a cut-out at the working width, clear all round, no page left in the outline, nose left', () => {
  const file = path.join(ROOT, 'fids-current', PICTURE.replace(/^\//, ''));
  assert.ok(fs.existsSync(file), PICTURE + ' is on disk');
  const img = rgbaOf(file), { w, h, px } = img;
  assert.equal(w, 2272, 'scaled to the 2272 px of the other card pictures');
  assert.equal(h, 502, 'at the proportions of the drawing (4524 x 1120, cropped to its edges): 2272 x 502');
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
  // NO PAGE LEFT IN THE OUTLINE. Laid on white and un-mixed two deep (the default of the tool) the
  // page stayed as a pale dashed line along the grey belly and the trailing edge of the fin; four deep
  // the first two counts pass but the dashes are still there; five deep they are gone.
  const dark = darkRim(img), pale = paleRim(img), bright = brightRim(img);
  assert.ok(dark <= 40, 'light pixels on the outline of the dark paint: ' + dark);
  assert.ok(pale <= 40, 'pale pixels on the outline of the grey and dark paint: ' + pale);
  assert.ok(bright <= 20, 'the page is still in the outline: ' + bright + ' outline pixels much brighter than the paint inside them (111 at four deep)');
  const note = flat(NOTE);
  assert.match(note, /sharper enlarged copy \(4524 x 1120, on a white page\)/, 'the note names the drawing it is made from');
  assert.match(note, /outline of the first copy of the same drawing \(4001 x 991, already cut out\)/, 'and the outline it is cut with');
  assert.match(note, /at the depth of five pixels of the drawing/, 'and the depth');
  assert.match(note, /of the dark paint 8, pale pixels on the outline of the grey and dark\s+paint 20, and pixels of the outline 40 or more brighter than the paint\s+just inside them 6/, 'and the three counts');
  assert.match(note, /\(2272 x 502\)/, 'and the size it comes out at');
  const readme = fs.readFileSync(path.join(ROOT, 'scripts', 'heritage-sky', 'README.md'), 'utf8');
  assert.match(readme, /card-cutout\.py 1727AC-image2\.png fids-current\/aircraft\/heritage\/air-canada-727-ac80\.png 2272 10 5\n/, 'the README gives the command, depth and all');
  // NOSE LEFT, as every picture of the set: the fin, the tallest part, is at the right-hand end
  let top = 0; while (top < h && ![...Array(w).keys()].some((x) => A(x, top) >= 128)) top++;
  const finX = [...Array(w).keys()].filter((x) => A(x, top) >= 128);
  assert.ok(finX[0] > 0.8 * w, 'the top of the fin is at the right, so the nose is at the left (' + finX[0] + ' of ' + w + ')');
  assert.doesNotMatch(SRC.slice(SRC.indexOf('var PLANE_FACING = {'), SRC.indexOf('function _planeFacingFromSrc')), /heritage\//, 'no table of facings lists the archive pictures: the card sky is laid out for nose left');
});

test('its shape, as its note gives it: 10.33 long for its depth, to the tip of the tailplane', () => {
  const { w, h, px } = rgbaOf(path.join(ROOT, 'fids-current', PICTURE.replace(/^\//, '')));
  const A = (x, y) => px[(y * w + x) * 4 + 3];
  const depths = [];
  for (let x = Math.floor(0.14 * w); x <= Math.floor(0.26 * w); x++) {
    let y = 0;
    while (y < h && A(x, y) < 128) y++;
    const t = y;
    while (y < h && A(x, y) >= 128) y++;
    depths.push(y - t);
  }
  depths.sort((a, b) => a - b);
  const depth = depths[depths.length >> 1];
  assert.equal(depth, 220, 'the depth 14–26% behind the nose');
  assert.equal((w / depth).toFixed(2), '10.33', 'length over depth');
  // the furthest aft point (the last column) is the tip of the tailplane, on top of the fin
  const aft = [];
  for (let y = 0; y < h; y++) if (A(w - 1, y) > 0) aft.push(y);
  assert.ok(aft.length && aft[aft.length - 1] < 0.1 * h, 'the last column is near the top: the tailplane on the fin');
  assert.match(flat(NOTE), /\(the median of the columns, 220 px deep\), is 10\.33 to the tip of the tailplane/, 'the note gives it');
});

test('the picture is in the build: under the folder the deploy serves, in the size it allows', () => {
  const wr = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  assert.match(wr, /"assets":\s*\{[\s\S]*?"directory":\s*"fids-current"/, 'the deploy serves fids-current as its static assets');
  const size = fs.statSync(path.join(ROOT, 'fids-current', PICTURE.replace(/^\//, ''))).size;
  assert.ok(size > 100000 && size < 2 * 1024 * 1024, PICTURE + ' is a picture of card size (' + size + ' bytes)');
  const ignore = path.join(ROOT, 'fids-current', '.assetsignore');
  if (fs.existsSync(ignore)) {
    const pats = fs.readFileSync(ignore, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    assert.ok(!pats.some((p) => /aircraft|heritage|\*\.png/.test(p)), 'and nothing keeps it out of the deploy');
  }
});
