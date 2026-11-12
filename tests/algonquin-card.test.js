'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE PAGE OF THE ALGONQUIN RESORT (fids-current/js/algonquin-card.js)
//
// A whole page for one resort in the centre deck of a gate screen, as the
// hotel cards are: the resort today, a 1994 watercolour of it in a gilt frame
// with three facts of its history, and a scan code for its site. People fly
// to Moncton to drive to it, so the page is on a gate whose flight goes to
// Moncton (a stop there counts) and on every gate at Moncton, and nowhere
// else. Its words are the store's, in the languages of the board; the facts
// of the house are one data table.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'fids-current');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const B = require(path.join(SITE, 'js/board-strings.js'));
const A = require(path.join(SITE, 'js/algonquin-card.js'));
const SRC = read('fids-current/js/algonquin-card.js');
const CSS = read('fids-current/css/algonquin-card.css');
const CORE = read('fids-current/js/fids-core.js');
const GIDS = read('fids-current/gids.html');
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];
const KEYS = ['hotelFromAirport', 'hotelByRoad', 'hotelYesteryear', 'hotelWatercolour', 'algonquinSince1889', 'algonquinRebuilt1914', 'algonquinAllYear'];

// The module reads the board through the global object: a gate is set up on
// it for one check and taken away again.
function onGate(g, run) {
  const keep = {};
  const names = ['_gateIata', '_gateCurrentFlight', '_flightLegs', 'BoardStrings', 'frFirstAirport', '_gateMapCity'];
  names.forEach((n) => { keep[n] = globalThis[n]; });
  try {
    names.forEach((n) => { delete globalThis[n]; });
    Object.keys(g).forEach((n) => { globalThis[n] = g[n]; });
    return run();
  } finally {
    names.forEach((n) => { if (keep[n] === undefined) delete globalThis[n]; else globalThis[n] = keep[n]; });
  }
}
const legs = (cf) => {
  const out = (cf && cf._stops || []).map((s) => s.iata);
  return out.length > 1 ? out : [];
};
const count = (hay, needle) => hay.split(needle).length - 1;

function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    assert.equal(b[i], 0xFF, 'a JPEG marker');
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('no size in ' + file);
}
function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('latin1', 1, 4), 'PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 6 || b[25] === 4 };
}

test('the page is at Moncton and on a gate whose flight goes to Moncton, and nowhere else', () => {
  assert.equal(A.FROM_AIRPORT, 'YQM');
  // at Moncton, whatever the flight, and with no flight at all
  assert.equal(onGate({ _gateIata: 'YQM', _gateCurrentFlight: { _locIata: 'YYZ' } }, A.due), true);
  assert.equal(onGate({ _gateIata: 'yqm', _gateCurrentFlight: null }, A.due), true);
  // elsewhere: a flight to Moncton
  assert.equal(onGate({ _gateIata: 'YUL', _gateCurrentFlight: { _locIata: 'YQM' } }, A.due), true);
  // a flight that stops at Moncton on its way
  assert.equal(onGate({ _gateIata: 'YYZ', _gateCurrentFlight: { _locIata: 'YHZ', _stops: [{ iata: 'YQM' }, { iata: 'YHZ' }] }, _flightLegs: legs }, A.due), true);
  // any other flight
  assert.equal(onGate({ _gateIata: 'YUL', _gateCurrentFlight: { _locIata: 'YHZ' }, _flightLegs: legs }, A.due), false);
  assert.equal(onGate({ _gateIata: 'YYZ', _gateCurrentFlight: { _locIata: 'YVR', _stops: [{ iata: 'YYC' }, { iata: 'YVR' }] }, _flightLegs: legs }, A.due), false);
  // a gate that only receives an arrival has no flight of its own
  assert.equal(onGate({ _gateIata: 'YHZ', _gateCurrentFlight: null }, A.due), false);
  // and the painter does not draw where it is not due
  assert.equal(onGate({ _gateIata: 'YHZ', _gateCurrentFlight: null, BoardStrings: B }, () => A.render({})), false);
});

test('the deck takes the slide only when it is due, passes its slot over when it is not, and gives it time for three views', () => {
  const at = CORE.indexOf('function _buildGateAdSlideList(');
  const deck = CORE.slice(at, CORE.indexOf('\n}\n', at));
  assert.match(deck, /if \(typeof AlgonquinCard !== 'undefined' && AlgonquinCard\.due\(\)\) deck\.push\(\{ type: 'algonquin' \}\);/);
  // after the archive card, and before the centre cards, whose list can replace the whole deck
  assert.ok(deck.indexOf("type: 'algonquin'") > deck.indexOf("type: 'heritage'"));
  assert.ok(deck.indexOf("type: 'algonquin'") < deck.indexOf('var _gcDue = _gateCardsDue('));
  // the painter is asked by name, guarded, in the loop that passes a slot over
  const loopAt = CORE.indexOf('var _skipN = 0;');
  const loop = CORE.slice(loopAt, CORE.indexOf('if (_skipN >= totalSlots) return;', loopAt));
  assert.match(loop, /if \(slide\.type === 'algonquin'\) \{[\s\S]{0,260}?if \(typeof AlgonquinCard !== 'undefined' && AlgonquinCard\.render\(el\)\) return;\s*\} else if \(_GATE_CARD_TYPES/);
  // three views at the ten seconds of the hotel pager, the last one held
  assert.ok(A.DWELL_MS >= 3 * 10000 + 2000 && A.DWELL_MS <= 45000, 'three views, not a minute');
  assert.match(CORE, /if \(slide\.type === 'algonquin'\) return \(typeof AlgonquinCard !== 'undefined' && AlgonquinCard\.DWELL_MS\) \|\| 34000;/);
  assert.match(CORE, /var EVERY = 10000;/);
  // its three pictures are warmed before it comes round
  assert.match(CORE, /if \(slide\.type === 'algonquin' && typeof AlgonquinCard !== 'undefined' && Array\.isArray\(AlgonquinCard\.media\)\)/);
});

test('every word of the page is in the store in nine languages', () => {
  KEYS.forEach((k) => {
    const e = B.entry(k);
    assert.ok(e, k);
    LANGS.forEach((l) => assert.ok(typeof e[l] === 'string' && e[l].length > 0, k + ' ' + l));
    // each key is read by name in the page script
    assert.ok(SRC.includes("'" + k + "'"), k + ' is used');
  });
  // the invitation is the one the hotel cards already use
  assert.ok(SRC.includes("TLin('scanToDiscover', lg)"));
  assert.match(CORE, /scanToDiscover:\s*\{ en:'Scan to discover'/);
});

test('the three views: the facts of the house once each, the words in the languages of the board', () => {
  const html = onGate({ BoardStrings: B, _gateIata: 'YUL', _gateMapCity: () => 'Moncton' }, () => A.build(['fr', 'en']));
  // three views for the pager of the hotel cards, the first one up
  assert.equal(count(html, 'class="axr-page '), 3);
  assert.equal(count(html, 'axr-page-on'), 1);
  assert.ok(html.indexOf('axr-page axr-page-on alq-view alq--today') < html.indexOf('alq-view alq--then'));
  assert.ok(html.indexOf('alq-view alq--then') < html.indexOf('alq-view alq--scan'));
  assert.equal(count(html, 'class="axr-pages alq-views"'), 1);
  // the data: as the house writes it, never marked as an exception
  const H = A.HOTEL;
  assert.equal(count(html, '>' + H.name + '<'), 2, 'the name on the today view and on the scan view');
  assert.equal(count(html, '>' + H.address + '<'), 1);
  assert.equal(count(html, '>' + H.phone + '<'), 1);
  assert.equal(count(html, '>' + H.web + '<'), 1);
  assert.equal(count(html, '>' + H.painter + '<'), 1);
  assert.ok(html.includes('data-qr-url="' + H.url + '"'));
  assert.ok(!/translate=/.test(html) && !/translate=/.test(SRC), 'no marker: the table is the data');
  assert.ok(!/data-i18n-/.test(SRC) && !/i18n-ok/.test(SRC));
  // the words: French first here, each half marked with its language
  assert.ok(html.includes('<span class="bs-h" lang="fr">Souvenirs d’hier</span><b class="alq-sep"></b><span class="bs-h" lang="en">Yesteryear</span>'));
  assert.ok(html.includes('<span class="bs-h" lang="fr">Aquarelle</span><b class="alq-sep"></b><span class="bs-h" lang="en">Watercolour</span>'));
  assert.ok(html.includes('à 265 km de l’aéroport de Moncton'));
  assert.ok(html.includes('265 km from Moncton airport'));
  assert.ok(html.includes('environ 2 h 30 min en voiture'));
  assert.ok(html.includes('about 2 h 30 min by road'));
  assert.equal(count(html, 'class="alq-h"'), 3, 'three facts');
  // a careful translation carries its mark; the English of the house does not
  assert.ok(html.includes('<span class="bs-h" lang="fr" data-i18n-src="careful">Accueille ses hôtes depuis 1889</span><b class="alq-sep"></b><span class="bs-h" lang="en">Welcoming guests since 1889</span>'));
  // a name with an ampersand is escaped once, not twice
  const odd = onGate({ BoardStrings: B, _gateIata: 'YUL', _gateMapCity: () => 'Sackville & Dorchester' }, () => A.build(['en']));
  assert.ok(odd.includes('265 km from Sackville &amp; Dorchester airport'));
  assert.ok(!odd.includes('&amp;amp;'));
  // pictures: files of the site, the card with the name of the house for its text, the rest silent
  A.media.forEach((u) => assert.ok(fs.existsSync(path.join(SITE, u)), u));
  assert.ok(html.includes('class="alq-art" alt="' + H.name + '"'));
  assert.ok(html.includes('src="/logos/hotels/marriott/autograph-collection.svg#svgView('));
  assert.ok(fs.existsSync(path.join(SITE, 'logos/hotels/marriott/autograph-collection.svg')));
  // no heading or paragraph tags: the carousel resizes those
  assert.ok(!/<(h[1-6]|p)[\s>]/.test(html));
  // nothing light is painted from the script, and no picture is filtered
  assert.ok(!/style=/.test(html));
});

test('a board of one language shows each fact once, in one column', () => {
  const html = onGate({ BoardStrings: B, _gateIata: 'YQM', _gateMapCity: () => 'Moncton' }, () => A.build(['de']));
  assert.ok(html.includes('class="alq alq--one"'));
  assert.equal(count(html, 'alq-sep'), 0, 'no rule between halves when there is one');
  assert.ok(html.includes('<span class="bs-h" lang="de">Erinnerungen an gestern</span>'));
  assert.match(CSS, /\.alq--one \.alq-hist::before\{ display:none; \}/);
  assert.match(CSS, /\.alq--one \.alq-h > \.alq-fit\{ grid-template-columns:1fr; \}/);
  // two languages that say the same thing are one half
  const same = onGate({ BoardStrings: B, _gateIata: 'YQM', _gateMapCity: () => 'Moncton' }, () => A.build(['ja', 'ja']));
  assert.equal(count(same, 'lang="ja">水彩画<'), 1);
});

test('Arabic, Japanese and Chinese are marked, and stand upright in the script faces of the board', () => {
  const html = onGate({ BoardStrings: B, _gateIata: 'YQM', _gateMapCity: () => 'Moncton' }, () => A.build(['ar', 'ja']));
  assert.ok(html.includes('<span class="bs-h" lang="ar" dir="rtl">ذكريات الأمس</span>'));
  assert.ok(html.includes('<span class="bs-h" lang="ja">昔日の面影</span>'));
  assert.equal(count(CSS, "var(--fids-script-fonts, 'Noto Sans JP', 'Noto Sans SC', 'Noto Sans Arabic')"), 3, 'both stacks carry the script faces, and the three languages lead with them');
  const upright = '.alq [lang="ja"], .alq [lang|="zh"], .alq [lang="ar"]{ font-family:var(--fids-script-fonts,';
  assert.ok(CSS.includes(upright));
  assert.ok(CSS.includes("sans-serif !important;\n  font-style:normal; letter-spacing:0; text-transform:none; }"));
  // that rule comes after the two faces of the page, so it wins at equal weight
  assert.ok(CSS.indexOf(upright) > CSS.indexOf('.alq .alq-name, .alq .alq-name *'));
  // the drive, with its figures: no noun to agree with a number
  assert.ok(html.includes('نحو 2 س 30 د بالسيارة'));
  assert.ok(html.includes('車で約2時間30分'));
});

test('the card is whole at its own proportions inside the frame, and nothing is drawn over it', () => {
  const card = jpegSize(path.join(SITE, 'assets/hotels/algonquin/watercolour-1994.jpg'));
  assert.deepEqual(card, { w: 1600, h: 1196 });
  assert.ok(CSS.includes('aspect-ratio:1600 / 1196;'));
  assert.ok(CSS.includes('box-sizing:content-box;'), 'the frame is outside the box of the card');
  const frame = pngSize(path.join(SITE, 'assets/hotels/algonquin/gilt-frame.png'));
  assert.deepEqual(frame, { w: 1481, h: 1137, alpha: true });
  // the opening of the frame has the proportions of the card, to within the two percent the
  // border image takes up across its width
  const open = { w: 1481 - 108 - 109, h: 1137 - 105 - 104 };
  assert.ok(Math.abs(open.w / open.h / (card.w / card.h) - 1) < 0.02);
  assert.ok(CSS.includes("border-image:var(--alq-frame-img) 105 109 104 108 stretch;"));
  assert.ok(CSS.includes("--alq-frame-img:url('/assets/hotels/algonquin/gilt-frame.png');"));
  // the border widths are the frame's own, as fractions of the width of the card
  const m = /--alq-w:min\(100cqw \/ ([\d.]+), 100cqh \/ ([\d.]+)\); width:var\(--alq-w\);\s*border-width:calc\(var\(--alq-w\) \* ([\d.]+)\) calc\(var\(--alq-w\) \* ([\d.]+)\) calc\(var\(--alq-w\) \* ([\d.]+)\) calc\(var\(--alq-w\) \* ([\d.]+)\);/.exec(CSS);
  assert.ok(m, 'the frame rule');
  const r = card.h / card.w, near = (a, b) => assert.ok(Math.abs(a - b) < 0.0005, a + ' is ' + b);
  near(+m[3], 105 / open.h * r); near(+m[4], 109 / open.w); near(+m[5], 104 / open.h * r); near(+m[6], 108 / open.w);
  near(+m[1], 1 + 217 / open.w); near(+m[2], r * (1 + 209 / open.h));
  // no filter, blend, mask or opacity rule of its own touches a picture
  assert.ok(!/filter\s*:|mix-blend-mode|mask(-image)?\s*:/.test(CSS));
  const photo = jpegSize(path.join(SITE, 'assets/hotels/algonquin/resort-aerial.jpg'));
  assert.deepEqual(photo, { w: 1200, h: 800 });
});

test('the two faces are served from the site, with their licence beside them, and keep their place against the board font', () => {
  const faces = [...CSS.matchAll(/@font-face\{ font-family:'([^']+)'; font-style:(\w+); font-weight:(\d+); font-display:swap;\s*src:url\('([^']+)'\) format\('woff2'\);/g)].map((x) => x.slice(1));
  assert.deepEqual(faces.map((f) => f.slice(0, 3).join(' ')), ['Alegreya italic 500', 'Alegreya italic 500', 'Libre Caslon Text normal 400', 'Libre Caslon Text normal 400']);
  faces.forEach((f) => {
    const file = path.join(SITE, f[3]);
    assert.ok(fs.existsSync(file), f[3]);
    assert.equal(fs.readFileSync(file).toString('latin1', 0, 4), 'wOF2');
  });
  ['fonts/alegreya/OFL.txt', 'fonts/libre-caslon-text/OFL.txt'].forEach((f) => {
    assert.match(fs.readFileSync(path.join(SITE, f), 'utf8'), /SIL Open Font License, Version 1\.1/);
  });
  assert.ok(!/fonts\.googleapis|fonts\.gstatic|@import/.test(CSS));
  // the board forces its face on every element with a rule of no weight: these carry weight
  assert.ok(CSS.includes('.alq, .alq *, .alq *::before, .alq *::after{ font-family:var(--alq-text) !important; }'));
  assert.ok(CSS.includes('.alq .alq-name, .alq .alq-name *, .alq .alq-era, .alq .alq-era *, .alq .alq-credit, .alq .alq-credit *{ font-family:var(--alq-caps) !important; }'));
  // credited on the credits page, in the store
  assert.ok(read('fids-current/credits.html').includes('data-i18n="credHotelFaces"'));
  assert.ok(B.entry('credHotelFaces'));
});

test('every size that follows the height of the screen follows its width too, and nothing is under 20 px', () => {
  const body = CSS.slice(CSS.indexOf('.alq, .alq *{ box-sizing'));
  const vh = body.match(/[^;{}]*\dvh[^;{}]*/g) || [];
  assert.ok(vh.length > 10);
  vh.forEach((d) => assert.match(d, /min\([\d.]+vh, [\d.]+vw\)/, d.trim()));
  // the two smallest sizes are floored at 20
  // the floor is 20 px at 1680x1050 and keeps step with a smaller screen
  assert.ok(CSS.includes('--alq-floor:min(20px, min(1.91vh, 1.2vw));'));
  assert.ok(1.91 * 10.5 >= 20 && 1.2 * 16.8 >= 20);
  assert.ok(CSS.includes('--alq-min:max(var(--alq-floor), calc(var(--alq-info) * 0.866));'));
  assert.ok(CSS.includes('font-size:max(var(--alq-floor), calc(var(--alq-min) * .9));'));
  assert.ok(SRC.includes('var minPx = Math.min(20, (root.innerHeight || 1050) * 0.0191, (root.innerWidth || 1680) * 0.012);'));
  assert.ok(SRC.includes('floor = Math.max(.86, minPx / base)'), 'a line that steps down stops at the same floor');
});

test('the gate page loads the stylesheet and the script at the build tag, the script after the core', () => {
  const tag = /var FIDS_BUILD_TAG = 'v(\d+)';/.exec(CORE)[1];
  assert.ok(GIDS.includes('<link rel="stylesheet" href="css/algonquin-card.css?v=' + tag + '">'));
  assert.ok(GIDS.includes('<script src="js/algonquin-card.js?v=' + tag + '"></script>'));
  assert.ok(GIDS.indexOf('js/algonquin-card.js') > GIDS.indexOf('js/fids-core.js?v='));
  assert.ok(GIDS.indexOf('css/algonquin-card.css') > GIDS.indexOf('css/hotel-ads.css'), 'after the hotel cards, whose page layers it uses');
  // the layers and their pager are the hotel cards' own
  const ads = read('fids-current/css/hotel-ads.css');
  assert.ok(ads.includes('.axr-page{ position:absolute; inset:0; opacity:0; transition:opacity .8s ease; pointer-events:none; }'));
  assert.ok(ads.includes('.axr-page.axr-page-on{ opacity:1; }'));
  assert.match(CORE, /var wrap = document\.querySelector\('\.axr-pages'\);/);
});

test('the scan code is the stored matrix of the site address, with its finder squares and its quiet zone', () => {
  const m = /var QR = \[([\s\S]*?)\n {2}\];/.exec(SRC);
  assert.ok(m);
  const rows = m[1].match(/'[01]+'/g).map((s) => s.slice(1, -1));
  assert.equal(rows.length, 31);
  rows.forEach((r) => assert.equal(r.length, 31));
  // one clear module all round
  assert.ok(/^0+$/.test(rows[0]) && /^0+$/.test(rows[30]));
  rows.forEach((r) => assert.ok(r[0] === '0' && r[30] === '0'));
  // the three finder squares
  const finder = (y, x) => [0, 1, 2, 3, 4, 5, 6].map((d) => rows[y + d].slice(x, x + 7)).join('/');
  const F = '1111111/1000001/1011101/1011101/1011101/1000001/1111111';
  assert.equal(finder(1, 1), F); assert.equal(finder(1, 23), F); assert.equal(finder(23, 1), F);
  assert.equal(A.HOTEL.url, 'https://algonquinresort.com');
});

test('the licence note names every file of the page', () => {
  const note = read('docs/licenses/algonquin-resort.md');
  ['watercolour-1994.jpg', 'gilt-frame.png', 'resort-aerial.jpg', 'fonts/libre-caslon-text/', 'fonts/alegreya/', 'autograph-collection.svg'].forEach((f) => assert.ok(note.includes(f), f));
  assert.ok(note.includes('Peter Bresnen'));
});
