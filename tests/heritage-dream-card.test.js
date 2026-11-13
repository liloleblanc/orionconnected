'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// DREAM LIVERY — the what-if cards of the archive deck.
//
// The gate's archive card (tests/heritage-card.test.js) was Air Canada's own
// past, on Air Canada pages at Canadian airports. Two things are new here and
// this file holds them:
//
//   A CARD SAYS WHOSE GATES IT RUNS ON. A supplied side drawing of a Boeing
//   787-8 in an imagined United livery runs on United gates, at every airport,
//   in the one archive slot of the deck. It never runs on another airline's
//   gate, and the Air Canada set never runs on a United gate. A card that
//   names no gates is what it always was: the frozen list below is the Air
//   Canada set, and every airport and airline the boards know is walked to
//   show it runs where it ran.
//
//   A CARD SAYS WHAT ITS HEADING IS. A what-if is not from any archive, so
//   the two what-if cards (this one and the Future Retro DC-9) say Dream
//   livery over the card, in the nine languages, and the caption of the 787-8
//   says what-if again and calls the livery imaginary: a passenger must not
//   take it for a scheme the airline paints.
//
// tests/heritage-card.test.js is left exactly as it was: it still passes, and
// that is the first proof that the existing cards are untouched.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const STORE = require('../fids-current/js/board-strings.js');

const KEY = 'united-787-dream';
const PICTURE = '/aircraft/heritage/united-787-dream.png';
const HEADING = 'heritageDreamKicker';
const WHAT_IF_CARDS = ['air-canada-dc9-2017', KEY];

// The Air Canada set as it stood before a card could name its gates, in the
// order the rotation runs it. A card added to it, taken from it or moved in
// it is a change to where the existing cards run, and has to be made here too.
const AIR_CANADA_SET = [
  'air-atlantic', 'air-nova', 'canadian-airlines', 'air-canada', 'air-canada-caps', 'air-canada-767',
  'air-canada-dc8', 'air-canada-l1011-87', 'air-canada-dc9-93', 'air-canada-dc8-80', 'air-canada-767-87',
  'air-canada-dc9-2017', 'air-canada-l1011-93'
];

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
// fids-core.js, with the page they read (window) and the board's languages
// (langs) left open so a test can set them. AP is empty on purpose: the
// board's own AP table carries no country, so a Canadian airport is one whose
// code starts with Y, and that is the rule the airports are walked under.
function board() {
  const win = {};
  const langs = ['en', 'fr'];
  let heritage = '';
  const doc = { documentElement: { classList: { contains: () => false } } };
  const names = ['_heritageIsCanadian', '_heritageIsAirCanada', '_heritageOnAirCanadaGate',
                 '_heritagePick', '_renderHeritageCard', '_buildGateAdSlideList'];
  const fam = /var HERITAGE_AC_FAMILY = \{[^}]*\};/.exec(SRC)[0];
  const demo = /var HERITAGE_AC_DEMO = \{[^}]*\};/.exec(SRC)[0];
  const fns = new Function('AP', 'window', 'document', 'getGateAds', '_welcomeCardData', 'BoardStrings', 'langs', '_heritageCode',
    MARKS_SRC + '\n' + fam + '\n' + demo + '\n' + names.map(lift).join('\n')
      + '\nreturn { isAC: _heritageIsAirCanada, pick: _heritagePick, render: _renderHeritageCard,'
      + ' deck: function () { return _buildGateAdSlideList().map(function (s) { return s.type; }); } };')(
    {}, win, doc, () => [], (c) => ({ welcome: c }), STORE, langs, () => heritage);
  return {
    isAC: fns.isAC,
    pick: fns.pick,
    // the gate as it writes itself: the airport, then the row and its airline from the same row
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
    // the cards one gate shows, in the order it shows them, for `turns` visits of the slide
    cards(turns) {
      const out = [];
      for (let i = 0; i < turns; i++) {
        const html = this.draw();
        if (html == null) return out.length ? out.concat([null]) : null;
        const pic = /class="hcard-plane" src="([^"]+)"/.exec(html);
        const mark = /class="hcard-mark" src="([^"]+)"/.exec(html);
        const m = MARKS.find((k) => (pic && k.aircraft === pic[1] && k.file === mark[1]) || (!k.aircraft && mark && k.file === mark[1] && pic && pic[1] === '/aircraft/heritage/' + k.key + '.png'));
        out.push(m ? m.key : 'unknown:' + (pic && pic[1]));
      }
      return out;
    }
  };
}

// Every airport code the boards carry (the AP table and the picker's list),
// and every airline code they know a name or a callsign for.
function everyAirport() {
  const set = new Set();
  const ap = /const AP = \{[\s\S]*?\n\};/.exec(SRC);
  assert.ok(ap, 'the airport table is found');
  for (const m of ap[0].matchAll(/^\s+'?([A-Z0-9]{3})'?\s*:\s*\{/gm)) set.add(m[1]);
  const list = /const AP_LIST = \[[\s\S]*?\n\];/.exec(SRC);
  assert.ok(list, 'the picker list is found');
  for (const m of list[0].matchAll(/\{c:'([A-Z0-9]{3})'/g)) set.add(m[1]);
  return [...set].sort();
}
function everyAirline() {
  const set = new Set();
  for (const name of ['AIRLINE_NAME', 'CALLSIGN_TO_IATA']) {
    const blk = new RegExp('const ' + name + ' = \\{[\\s\\S]*?\\n\\};').exec(SRC);
    assert.ok(blk, name + ' is found');
    for (const m of blk[0].matchAll(/(?:^|[\s,{])'?([A-Z0-9]{2,4})'?\s*:\s*'/gm)) set.add(m[1]);
    for (const m of blk[0].matchAll(/:\s*'([A-Z0-9]{2,3})'/g)) set.add(m[1]);
  }
  for (const c of ['AC', 'ACA', 'QK', 'JZA', 'RV', 'ROU', 'ACEX', 'UA', 'UAL', 'DL', 'DAL', 'AA', 'WS', 'PD', 'PB', 'F8', 'TS',
                   'OO', 'YX', 'G7', 'LH', 'NH', 'ANV', 'CDX', '9A', 'XQ']) set.add(c);
  return [...set].sort();
}

// ── the card and its picture ───────────────────────────────────────────────

test('the Dream livery card: a Boeing 787-8, the United lockup, and whose gates it runs on', () => {
  const m = byKey[KEY];
  assert.ok(m, 'the card is in the deck');
  assert.equal(m.name, 'United');
  assert.equal(m.type, 'Boeing 787-8', 'the type as the boards name it');
  assert.match(SRC, /'788':'Boeing 787-8'/, 'which is the name IATA_AIRCRAFT gives the 788');
  assert.equal(m.aircraft, PICTURE);
  assert.equal(m.heading, HEADING, 'it names its own heading');
  assert.equal(m.airports, '*', 'every airport');
  assert.deepEqual(Object.keys(m.gates).sort(), ['UA', 'UAL'], 'United gates');
  assert.ok(!m.credit && !m.endorsement, 'a supplied drawing: no credit line, no second mark');
  // the same codes the centenary strip takes for a United gate (tests/united-centennial.test.js)
  const cent = /var UA_CENTENNIAL = \{ airlines: (\{[^}]*\})/.exec(SRC);
  assert.ok(cent, 'the centenary strip still names its United codes');
  assert.deepEqual(Object.keys(m.gates).sort(), Object.keys(new Function('return ' + cent[1])()).sort(),
    'a United gate is the same thing on the card as on the boarding strip');
  // every other card names no gates: it is in the Air Canada set, in the order it had
  assert.deepEqual(MARKS.filter((k) => !k.gates).map((k) => k.key), AIR_CANADA_SET, 'the Air Canada set, card for card');
  assert.deepEqual(MARKS.filter((k) => k.gates).map((k) => k.key), [KEY], 'and one card that names its gates');
  assert.equal(MARKS[MARKS.length - 1].key, 'air-canada-l1011-93', 'the 1993 TriStar is still last');
});

test('its mark is the lockup the live boards use for United, in the blue it is drawn in', () => {
  const m = byKey[KEY];
  assert.equal(m.file, '/logos/airlines/us-major/united.svg');
  assert.match(SRC, /'UA': '\/logos\/airlines\/us-major\/united\.svg',\s*\/\/ United/, 'the file LOCAL_LOGOS maps UA to');
  const svg = fs.readFileSync(path.join(ROOT, 'fids-current', m.file.replace(/^\//, '')), 'utf8');
  const fills = [...new Set((svg.match(/fill="#[0-9a-fA-F]{3,6}"/g) || []).map((f) => f.toLowerCase()))];
  assert.deepEqual(fills, ['fill="#0033a0"'], 'one ink, the blue of the brand: it reads on the paper card as drawn');
  assert.doesNotMatch(svg, /<image\b|<style\b|<rect\b/, 'shapes only: no picture, no style block, no plate behind the lettering');
  assert.doesNotMatch(m.file, /white|light/, 'not a white-lettering cut: the card is paper, and a white mark would vanish on it');
});

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

test('its picture is a cut-out at the working width, with the page out of it: clear all round and no pale rim', () => {
  const file = path.join(ROOT, 'fids-current', PICTURE.replace(/^\//, ''));
  assert.ok(fs.existsSync(file), PICTURE + ' is on disk');
  const { w, h, px } = rgbaOf(file);
  assert.equal(w, 2272, 'scaled to the 2272 px of the DC-9 and TriStar drawings');
  assert.ok(Math.abs(w / h - 1889 / 571) < 0.03 * (1889 / 571), 'at the proportions of the drawing: cropped and scaled, never stretched (it is ' + w + ' x ' + h + ')');
  const A = (x, y) => px[(y * w + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) assert.equal(A(x, y), 0, 'the corner at ' + x + ',' + y + ' is clear');
  // cropped to its own edges: the aeroplane touches all four sides
  const touches = { left: false, right: false, top: false, bottom: false };
  for (let y = 0; y < h; y++) { if (A(0, y)) touches.left = true; if (A(w - 1, y)) touches.right = true; }
  for (let x = 0; x < w; x++) { if (A(x, 0)) touches.top = true; if (A(x, h - 1)) touches.bottom = true; }
  assert.deepEqual(touches, { left: true, right: true, top: true, bottom: true }, 'no margin of page left round the drawing');
  let clear = 0, solid = 0, haze = 0;
  for (let i = 3; i < px.length; i += 4) { if (px[i] === 0) clear++; else if (px[i] === 255) solid++; else if (px[i] <= 6) haze++; }
  assert.ok(clear / (w * h) > 0.5, 'more than half the picture is sky (' + (100 * clear / (w * h)).toFixed(1) + '%)');
  assert.ok(solid / (w * h) > 0.3, 'and the aeroplane is solid (' + (100 * solid / (w * h)).toFixed(1) + '%)');
  assert.equal(haze, 0, 'no haze left off the outline');

  // THE PAGE IS OUT OF THE OUTLINE TOO. The drawing was smoothed against a
  // white page, so the last pixels of its outline were part page; cut along
  // the open page alone they stayed, a pale line round the navy fin, the blue
  // belly and the engine as soon as the sky was behind them (263 such pixels
  // in the first cut, by this count). Counted here: a pixel that shows
  // (opacity 100 or more), is pale (every channel 205 or more), lies within
  // two pixels of clear sky, and has dark, solid paint within three.
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
  assert.ok(rim <= 40, 'the page is still in the outline: ' + rim + ' pale pixels on it beside dark paint (the sibling pictures have 1 to 37)');
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'heritage-sky', 'card-cutout.py')), 'the tool that makes the picture from a drawing is kept');
});

// ── where it runs ──────────────────────────────────────────────────────────

const UNITED_ROWS = [
  { flight: 'UA1234', airline: 'UA' },                    // mainline, as most feeds send it
  { flight: 'UA4321', airline: 'UA', _opCode: 'OO' },     // United Express, filed under United
  { flight: 'UAL951', airline: 'UAL' }                    // the ICAO form (EDI-style feeds)
];
const NOT_UNITED_ROWS = [
  { flight: 'AC659', airline: 'AC' },                     // Air Canada: its own set where that runs, never this card
  { flight: 'AC5678', airline: 'AC', _opCode: 'UA' },     // sold as Air Canada, flown by United: an Air Canada page
  { flight: 'DL1432', airline: 'DL' },                    // Delta
  { flight: 'DAL1432', airline: 'DAL' },
  { flight: 'AA100', airline: 'AA' },
  { flight: 'LH431', airline: 'LH' },                     // a Star Alliance partner keeps its own page
  { flight: 'OO5544', airline: 'OO' },                    // a United Express flight filed under its operator
  { flight: 'YX3456', airline: 'YX' },
  { flight: 'G74321', airline: 'G7' },
  { flight: 'WS813', airline: 'WS' },
  { flight: 'UA1234', airline: '' },                      // no carrier on the row: unbranded, whatever its number
  { flight: '1234', airline: '' },
  { flight: '', airline: '' },
  {}
];
// one Canadian airport, one in the United States, one overseas, and two more of each
const UNITED_AIRPORTS = ['YYZ', 'ORD', 'FRA', 'YUL', 'EWR', 'NRT'];

test('it runs on a United gate at a Canadian airport, in the United States and overseas', () => {
  const b = board();
  for (const ia of UNITED_AIRPORTS) {
    for (const row of UNITED_ROWS) {
      b.at(ia, row);
      const deck = b.deck();
      assert.equal(deck.filter((t) => t === 'heritage').length, 1, `${row.flight} at ${ia}: the deck carries the one archive slot`);
      assert.deepEqual(b.cards(3), [KEY, KEY, KEY], `${row.flight} at ${ia}: and it draws the Dream livery card every time it comes round`);
    }
  }
});

test('and never on an Air Canada, Delta, partner, operator-filed or unbranded gate', () => {
  const b = board();
  for (const ia of UNITED_AIRPORTS) {
    for (const row of NOT_UNITED_ROWS) {
      b.at(ia, row);
      const seen = b.cards(AIR_CANADA_SET.length + 1) || [];
      assert.ok(!seen.includes(KEY), `${row.flight || 'a blank row'} (${row.airline || 'no airline'}) at ${ia} must not draw the United card`);
      if (!b.isAC(row)) {
        assert.ok(!b.deck().includes('heritage'), `${row.flight || 'a blank row'} at ${ia}: no archive slot at all`);
        assert.equal(b.draw(), null, 'and a slide left on screen draws nothing');
      }
    }
    b.at(ia, null);
    assert.ok(!b.deck().includes('heritage'), `a board with no gate flight at ${ia} carries nothing`);
    assert.equal(b.draw(), null);
  }
});

test('the Air Canada cards never run on a United gate, and the heritage demonstration gates keep theirs', () => {
  const b = board();
  for (const ia of ['YHZ', 'YYZ', 'YVR', 'YQM']) {
    for (const row of UNITED_ROWS) {
      const seen = b.at(ia, row).cards(AIR_CANADA_SET.length * 2);
      assert.deepEqual([...new Set(seen)], [KEY], `${row.flight} at ${ia}: the United card and no Air Canada card, however long the gate runs`);
    }
  }
  for (const [code, ia] of [['ANV', 'YHZ'], ['9A', 'YYT'], ['CDX', 'YYC']]) {
    const seen = b.at(ia, { flight: '500', airline: code }, { heritage: code }).cards(AIR_CANADA_SET.length * 2);
    assert.ok(seen && !seen.includes(KEY) && !seen.includes(null), `the ${code} demonstration gate at ${ia} keeps the Air Canada set`);
  }
});

test('one slot, the same place in the rotation and the same dwell as the archive cards have', () => {
  const b = board();
  const ac = b.at('YYZ', { flight: 'AC659', airline: 'AC' }).deck();
  const ua = b.at('YYZ', { flight: 'UA1234', airline: 'UA' }).deck();
  assert.deepEqual(ua, ac, 'a United gate at Toronto runs the same deck, slot for slot, as an Air Canada gate there');
  assert.match(SRC, /if \(slide\.type === 'heritage'\) return 22000;/, 'one dwell for the slide, whichever card it draws');
  assert.equal((SRC.match(/deck\.push\(\{ type: 'heritage' \}\)/g) || []).length, 1, 'and one place that adds it');
});

test('the Air Canada deck is unchanged everywhere: every airport and every airline the boards know', () => {
  // The rule as it stood, restated: an Air Canada page (the same family test,
  // untouched) shows the Air Canada set's cards for its airport, in set order,
  // starting from the first and wrapping; every other gate shows nothing. The
  // one difference allowed is the new card, on a row filed under UA or UAL
  // that is not an Air Canada page.
  const b = board();
  const airports = everyAirport(), airlines = everyAirline();
  assert.ok(airports.length > 250, 'the airports are found (' + airports.length + ')');
  assert.ok(airlines.length > 300, 'the airlines are found (' + airlines.length + ')');
  const before = (ia) => AIR_CANADA_SET.filter((k) => {
    const m = byKey[k];
    return m.airports === '*CA' ? /^Y/.test(ia) : m.airports.includes(ia);
  });
  let pairs = 0, acPages = 0, united = 0, withCards = 0;
  for (const ia of airports) {
    const pool = before(ia);
    for (const al of airlines) {
      // each code as a feed files it: the carrier field and a number under it
      for (const row of [{ flight: al + '123', airline: al }, { flight: al + ' 123', airline: al.toLowerCase() }]) {
        pairs++;
        b.at(ia, row);
        const isAC = b.isAC(row);
        const isUA = !isAC && (al === 'UA' || al === 'UAL');
        const has = b.deck().includes('heritage');
        if (isAC) {
          acPages++;
          assert.equal(has, pool.length > 0, `${al} at ${ia}: the archive slot is there exactly where a card is true`);
          if (pool.length) {
            withCards++;
            const want = [];
            for (let i = 0; i < pool.length + 2; i++) want.push(pool[i % pool.length]);
            assert.deepEqual(b.cards(pool.length + 2), want, `${al} at ${ia}: the same cards in the same order, the wrap included`);
          } else {
            assert.equal(b.draw(), null, `${al} at ${ia}: nothing true here, nothing drawn`);
          }
        } else if (isUA) {
          united++;
          assert.equal(has, true, `${al} at ${ia}`);
          assert.deepEqual(b.cards(2), [KEY, KEY], `${al} at ${ia}: the new card, and only it`);
        } else {
          assert.equal(has, false, `${al} at ${ia}: no archive slot, as before`);
          assert.equal(b.draw(), null, `${al} at ${ia}: and nothing drawn`);
        }
      }
    }
    // a row with no carrier qualifies by an AC number alone, as before, and by nothing else
    b.at(ia, { flight: 'AC659', airline: '' });
    assert.equal(b.deck().includes('heritage'), pool.length > 0, `an AC number with no carrier at ${ia}`);
    b.at(ia, { flight: 'UA1234', airline: '' });
    assert.equal(b.deck().includes('heritage'), false, `a UA number with no carrier at ${ia} is nobody, as every unbranded row was`);
  }
  assert.ok(acPages > 0 && withCards > 0 && united >= 4 * airports.length, `walked ${pairs} gates: ${acPages} Air Canada pages, ${withCards} with cards, ${united} United gates`);
});

test('asked with the airport alone the picker answers from the Air Canada set, as it always did', () => {
  // tests/heritage-card.test.js calls it this way; so does anything written before the gates field.
  const b = board();
  b.at('YHZ', null);
  const seen = [];
  for (let i = 0; i < AIR_CANADA_SET.length; i++) seen.push(b.pick('YHZ').key);
  assert.deepEqual(seen, AIR_CANADA_SET, 'Halifax: the whole set in order, and not the United card');
  assert.equal(b.pick('ORD'), null, 'nothing of the Air Canada set at Chicago');
  assert.equal(b.pick('FRA'), null, 'nor at Frankfurt');
  assert.equal(b.pick('ORD', 'UA').key, KEY, 'asked by a United gate, the United card');
  assert.equal(b.pick('ORD', 'ua ').key, KEY, 'however the feed cased the code');
  assert.equal(b.pick('ORD', ''), null, 'a gate with no code has no card');
  assert.equal(b.pick('ORD', 'DL'), null, 'nor a gate no card names');
  assert.equal(b.pick('YHZ', 'AC'), null, 'the Air Canada set is not asked for by code: its pages are found by the family test');
  for (const odd of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(b.pick('ORD', odd), null, odd + ' is not an airline');
  // peek looks without moving the rotation
  b.at('YHZ', null);
  assert.equal(b.pick('YHZ', null, true).key, AIR_CANADA_SET[0]);
  assert.equal(b.pick('YHZ', null, true).key, AIR_CANADA_SET[0], 'a second look is the same card');
  assert.equal(b.pick('YHZ').key, AIR_CANADA_SET[0], 'and the rotation starts where it would have');
  // the two sets count their turns apart, so a gate that changes hands does not skip a card
  assert.equal(b.pick('YHZ', 'UA').key, KEY);
  assert.equal(b.pick('YHZ').key, AIR_CANADA_SET[1], 'the Air Canada rotation at Halifax is where it was left');
});

// ── the words ──────────────────────────────────────────────────────────────

const DREAM = { en: 'Dream livery', fr: 'Livrée de rêve', es: 'Librea soñada', de: 'Traumlackierung', it: 'Livrea da sogno',
                pt: 'Pintura de sonho', ja: '夢の塗装', zh: '梦想涂装', ar: 'طلاء الأحلام' };

test('the heading: Dream livery in nine languages over the two what-if cards, From the archive over every other', () => {
  assert.deepEqual(Object.keys(DREAM).sort(), STORE.LANGS.slice().sort(), 'all nine board languages');
  const e = STORE.entry(HEADING);
  assert.ok(e, 'the heading is in the store');
  for (const l of STORE.LANGS) {
    assert.equal(e[l], DREAM[l], 'the words, in ' + l);
    assert.notEqual(e[l], STORE.bs('heritageKicker', l), 'not the archive heading, in ' + l);
    if (l !== 'en') assert.doesNotMatch(e[l], /dream|livery/i, 'in its own words, not a loan from English, in ' + l);
  }
  assert.equal(new Set(STORE.LANGS.map((l) => e[l])).size, STORE.LANGS.length, 'nine different headings: none left in another language');
  // which cards name it
  assert.deepEqual(MARKS.filter((m) => m.heading).map((m) => m.key).sort(), WHAT_IF_CARDS.slice().sort(), 'the two what-if cards, and no other');
  for (const m of MARKS) if (m.heading) assert.ok(STORE.entry(m.heading), m.key + ' names a heading the store has');

  // and what each card prints, in each language, with English beside it
  const b = board();
  const kicker = (html) => /<div class="hcard-kicker">([\s\S]*?)<\/div>/.exec(html)[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  for (const l of STORE.LANGS) {
    const pair = l === 'en' ? ['en', 'fr'] : [l, 'en'];
    // the United card on a United gate
    const ua = b.at('ORD', UNITED_ROWS[0], { langs: pair }).draw();
    assert.ok(kicker(ua).includes(DREAM[l]), 'the United card says ' + DREAM[l]);
    assert.ok(!kicker(ua).includes(STORE.bs('heritageKicker', l)), 'and not ' + STORE.bs('heritageKicker', l));
    // the Air Canada set on an Air Canada gate: one turn of the deck at Halifax
    b.at('YHZ', { flight: 'AC659', airline: 'AC' }, { langs: pair });
    for (const k of AIR_CANADA_SET) {
      const html = b.draw();
      const want = WHAT_IF_CARDS.includes(k) ? DREAM[l] : STORE.bs('heritageKicker', l);
      const not = WHAT_IF_CARDS.includes(k) ? STORE.bs('heritageKicker', l) : DREAM[l];
      assert.ok(kicker(html).includes(want), k + ' says ' + want + ' in ' + l + ' (it says ' + kicker(html) + ')');
      assert.ok(!kicker(html).includes(not), k + ' does not say ' + not + ' in ' + l);
    }
  }
  assert.equal(STORE.bs('heritageKicker', 'en'), 'From the archive', 'the archive heading is as it was');
});

test('the caption: the type, then a what-if livery, said plainly in nine languages', () => {
  // The what-if words are the Future Retro DC-9 card's own, language for language.
  const WHAT_IF = { fr: 'et si…', es: '¿y si…?', de: 'Fiktion', it: 'e se…', pt: 'e se…', ja: 'もしも', zh: '假想', ar: 'ماذا لو' };
  const IMAGINARY = { fr: 'livrée imaginaire', es: 'librea imaginaria', de: 'erdachte Lackierung', it: 'livrea immaginaria',
                      pt: 'pintura imaginária', ja: '架空の塗装', zh: '虚构涂装', ar: 'طلاء خيالي' };
  // the word each language already uses for a livery on the other cards
  const LIVERY = { fr: 'livrée', es: 'librea', de: 'Lackierung', it: 'livrea', pt: 'pintura', ja: '塗装', zh: '涂装', ar: 'طلاء' };
  const e = STORE.entry('heritage:' + KEY), dc9 = STORE.entry('heritage:air-canada-dc9-2017'), sib = STORE.entry('heritage:air-canada-dc9-93');
  assert.ok(e, 'the caption is in the store');
  assert.equal(e.en, '{TYPE} · Dream livery what-if');
  assert.equal(STORE.fill(e.en, { TYPE: byKey[KEY].type }), 'Boeing 787-8 · Dream livery what-if', 'the English line as it prints');
  const seen = new Set();
  for (const l of STORE.LANGS) {
    const cap = e[l];
    assert.ok(cap, 'a caption in ' + l);
    const parts = cap.split(' · ');
    assert.equal(parts[0], '{TYPE}', 'the type comes from the card, in ' + l);
    assert.doesNotMatch(cap, /Boeing|ボーイング|波音|بوينغ|United|ユナイテッド|美联航|يونايتد/, 'no maker and no airline spelled in the stored line, in ' + l);
    assert.doesNotMatch(cap, /\d/, 'no year of any kind: it never flew, in ' + l);
    if (l === 'en') {
      assert.equal(parts.length, 2);
      assert.match(parts[1], /what-if$/, 'English says what-if');
    } else {
      assert.equal(parts.length, 3, 'type · what-if · the livery, in ' + l);
      assert.equal(parts[1], WHAT_IF[l], 'it says what-if in ' + l);
      assert.equal(parts[1], dc9[l].split(' · ')[1], 'in the words the Future Retro card uses, in ' + l);
      assert.equal(parts[2], IMAGINARY[l], 'and calls the livery imaginary, in ' + l);
      assert.ok(parts[2].includes(LIVERY[l]) && sib[l].includes(LIVERY[l]), 'with the word the other cards use for a livery, in ' + l);
      assert.doesNotMatch(cap, /dream|livery|what-if/i, 'in its own words, not the English ones, in ' + l);
    }
    seen.add(cap);
  }
  assert.equal(seen.size, STORE.LANGS.length, 'nine different lines: none left in another language');
  // the Future Retro caption is left as it was
  assert.equal(dc9.en, 'McDonnell Douglas DC-9-32 · Future Retro what-if · 2017 livery');
  assert.equal(dc9.fr, 'McDonnell Douglas DC-9-32 · et si… · livrée de 2017');
});

test('the card as drawn: the heading, the caption with its type, the mark and the picture', () => {
  const b = board();
  const html = b.at('ORD', UNITED_ROWS[0]).draw();
  assert.ok(html, 'a United gate at Chicago draws it');
  assert.match(html, /class="hcard-wrap"/, 'the archive card frame, with no credit line');
  assert.match(html, /<div class="hcard-kicker"><span class="bs-h" lang="en">Dream livery<\/span> &nbsp;\|&nbsp; <span class="bs-h" lang="fr">Livrée de rêve<\/span><\/div>/, 'the heading, English then French');
  assert.match(html, /<img class="hcard-mark" src="\/logos\/airlines\/us-major\/united\.svg" alt="United">/, 'the mark, named for anything that cannot draw it');
  assert.match(html, /<img class="hcard-plane" src="\/aircraft\/heritage\/united-787-dream\.png" alt=""/, 'the picture, over the sky');
  assert.match(html, /<div class="hcard-line"><span class="bs-h" lang="en">Boeing 787-8 · Dream livery what-if<\/span><\/div>/, 'the English line');
  assert.match(html, /<div class="hcard-line hcard-line-2"><span class="bs-h" lang="fr">Boeing 787-8 · et si… · livrée imaginaire<\/span><\/div>/, 'and the French line');
  assert.doesNotMatch(html.replace(/ onloadedmetadata="[^"]*"/, ''), /[{}]/, 'no placeholder left on the card');
  assert.doesNotMatch(html, /From the archive|Depuis les archives/, 'not the archive heading');
  assert.doesNotMatch(html, /hcard-credit"|hcard-endorse/, 'no credit line and no endorsement');
  // every language, with the type in its place
  for (const l of STORE.LANGS) {
    const h2 = b.at('NRT', UNITED_ROWS[0], { langs: l === 'en' ? ['en', 'fr'] : [l, 'en'] }).draw();
    const line = STORE.fill(STORE.bs('heritage:' + KEY, l), { TYPE: 'Boeing 787-8' });
    assert.ok(h2.includes('lang="' + l + '"' + (l === 'ar' ? ' dir="rtl"' : '') + '>' + line + '</span>'), 'the ' + l + ' line: ' + line);
    assert.doesNotMatch(h2, /\{TYPE\}/, 'no placeholder left, in ' + l);
  }
  // the captions that leave no place for a type come through as stored, joiners in their year ranges and all
  b.at('YHZ', { flight: 'AC659', airline: 'AC' }).draw();          // Air Atlantic first, then Air Nova
  assert.match(b.draw(), /Halifax, Nova Scotia · the first Air Canada Connector · 1986\u2060–\u20602001/, 'the Air Nova line is as it was, word joiners round its dash');
  // the Future Retro DC-9 under its new heading, its caption untouched
  b.at('YHZ', { flight: 'AC659', airline: 'AC' });
  let dc9 = '';
  for (let i = 0; i < AIR_CANADA_SET.length && !dc9; i++) { const h3 = b.draw(); if (h3.includes('air-canada-dc9-ac17.png')) dc9 = h3; }
  assert.match(dc9, /<div class="hcard-kicker"><span class="bs-h" lang="en">Dream livery<\/span>/, 'the Future Retro DC-9 says Dream livery');
  assert.match(dc9, /McDonnell Douglas DC-9-32 · Future Retro what-if · 2017 livery/, 'over the caption it had');
});
