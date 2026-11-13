'use strict';

// ══════════════════════════════════════════════════════════════════════════
// THE PAGE OF THE ALGONQUIN RESORT (fids-current/js/algonquin-card.js)
//
// A whole page for one resort in the centre deck of a gate screen, as the
// hotel cards are: the resort today, two watercolours of it in gilt frames,
// a timeline of its story, another of its guests, and a scan code for its site. People fly
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
const KEYS = ['hotelFromAirport', 'hotelByRoad', 'hotelYesteryear', 'hotelHistoricLandmark', 'hotelPaintedFor', 'algonquinArt1990', 'algonquinInEveryRoom', 'algonquinArt1994', 'algonquinStory1889', 'algonquinStory1903', 'algonquinStory1915', 'algonquinStory1974', 'algonquinStory1993', 'algonquinStory2014',
  'hotelNotableGuests', 'algonquinGuest1889', 'algonquinGuest1901', 'algonquinGuest1964', 'algonquinGuest1973', 'algonquinGuest1983'];

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

test('the deck takes the slide only when it is due, passes its slot over when it is not, and gives it time for five views', () => {
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
  // five views at the ten seconds of the hotel pager, the last one held: within the minute of a centre card
  assert.ok(A.DWELL_MS >= 5 * 10000 + 2000 && A.DWELL_MS <= 60000, 'five views, within a minute');
  assert.match(CORE, /if \(slide\.type === 'algonquin'\) return \(typeof AlgonquinCard !== 'undefined' && AlgonquinCard\.DWELL_MS\) \|\| 54000;/);
  assert.match(CORE, /var EVERY = 10000;/);
  // its pictures are warmed before it comes round
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

test('the five views: the facts of the house from its one table, the words in the languages of the board', () => {
  const html = onGate({ BoardStrings: B, _gateIata: 'YUL', _gateMapCity: () => 'Moncton' }, () => A.build(['fr', 'en']));
  // five views for the pager of the hotel cards, the first one up
  assert.equal(count(html, 'class="axr-page '), 5);
  assert.equal(count(html, 'axr-page-on'), 1);
  assert.ok(html.indexOf('axr-page axr-page-on alq-view alq--today') < html.indexOf('alq-view alq--then'));
  assert.ok(html.indexOf('alq-view alq--then') < html.indexOf('alq-view alq--story'));
  assert.ok(html.indexOf('alq-view alq--story"') < html.indexOf('alq-view alq--story alq--guests'));
  assert.ok(html.indexOf('alq-view alq--story alq--guests') < html.indexOf('alq-view alq--scan'));
  assert.equal(count(html, 'class="axr-pages alq-views"'), 1);
  // the data: as the house writes it, never marked as an exception
  const H = A.HOTEL;
  assert.equal(count(html, '>' + H.name + '<'), 5, 'the name on every view: the watercolours carry no lettering');
  assert.equal(count(html, '>' + H.address + '<'), 1);
  assert.equal(count(html, '>' + H.phone + '<'), 1);
  assert.equal(count(html, '>' + H.web + '<'), 1);
  // THE WATERCOLOURS, to the supplied example: what the house is; who painted them and that the
  // hotel commissioned them; each in its frame with its year on a plaque; under each, the place
  // where it was also used and the line that says so
  assert.equal(H.painter, 'Peter Bresnen');
  assert.equal(H.menuRoom, 'Passamaquoddy Dining Room');
  const thenPart = html.slice(html.indexOf('alq-view alq--then'), html.indexOf('alq-view alq--story"'));
  const half = (lg, w, careful) => '<span class="bs-h" lang="' + lg + '"' + (careful ? ' data-i18n-src="careful"' : '') + '>' + w + '</span>';
  const pair = (fr, en) => half('fr', fr, true) + '<b class="alq-sep"></b>' + half('en', en, false);
  const sub = thenPart.indexOf('<div class="alq-sub alq-pairfit"><span class="alq-fit">' + pair('Un lieu historique', 'A Historic Landmark') + '</span></div>');
  const cred = thenPart.indexOf('<div class="alq-credit"><span class="alq-fit">' + pair('Peintes par ' + H.painter + ', commandées par l’hôtel', 'Painted by ' + H.painter + ', commissioned by the hotel') + '</span></div>');
  const box = thenPart.indexOf('class="alq-cardbox"');
  assert.ok(sub > 0 && cred > sub && box > cred, 'the name, what the house is, the credit, then the pictures');
  assert.equal(count(html, H.painter), 2, 'the painter once in each language of the board');
  const fig = (year) => '<div class="alq-fig"><img class="alq-art" alt="' + H.name + ', ' + year + '" decoding="async" src="/assets/hotels/algonquin/bresnen-' + year + '.jpg"><span class="alq-plaque">' + year + '</span></div>';
  assert.ok(thenPart.includes(fig('1990') + fig('1994')), 'the two pictures in order, each with its year on its plaque');
  assert.equal(count(html, 'class="alq-label"'), 2);
  const l90 = thenPart.indexOf('<div class="alq-label"><div class="alq-where"><span class="alq-fit">' + H.menuRoom + '</span></div><span class="alq-say">'
    + pair('A aussi figuré sur le menu du soir', 'Also featured on the dinner menu') + '</span></div>');
  const l94 = thenPart.indexOf('<div class="alq-label"><div class="alq-where alq-pairfit"><span class="alq-fit">' + pair('Dans chaque chambre', 'In every room') + '</span></div><span class="alq-say">'
    + pair('Offerte en carte postale aux invités', 'Made into a postcard for guests') + '</span></div>');
  assert.ok(l90 > box && l94 > l90, 'the labels under the pictures, in their order');
  assert.equal(count(html, H.menuRoom), 1, 'the name of the dining room once, as printed');
  // the story and the guests: two timelines, the years in order, one line for each year in each language
  const storyAt = html.indexOf('alq-view alq--story"'), guestsAt = html.indexOf('alq-view alq--story alq--guests'), scanAt = html.indexOf('alq-view alq--scan');
  const yearsOf = (part) => [...part.matchAll(/<span class="alq-yr">(\d{4})<\/span><span class="alq-ev">/g)].map((x) => x[1]);
  assert.deepEqual(yearsOf(html.slice(storyAt, guestsAt)), ['1889', '1903', '1915', '1974', '1993', '2014']);
  assert.deepEqual(yearsOf(html.slice(guestsAt, scanAt)), ['1889', '1901', '1964', '1973', '1983']);
  assert.equal(H.rail, 'Canadian Pacific');
  assert.equal(H.railFr, 'Canadien Pacifique');
  assert.equal(H.brand, 'Autograph Collection');
  const row = (year, fr, en) => '<span class="alq-yr">' + year + '</span><span class="alq-ev"><span class="bs-h" lang="fr" data-i18n-src="careful">' + fr + '</span><b class="alq-sep"></b><span class="bs-h" lang="en">' + en + '</span></span>';
  const story = html.slice(storyAt, guestsAt), guests = html.slice(guestsAt, scanAt);
  assert.ok(story.includes(row('1889', 'Ouverture d’un hôtel d’été au bord de la mer', 'A summer hotel opens by the sea')));
  assert.ok(story.includes(row('1903', 'Acheté par le ' + H.railFr, 'Bought by the ' + H.rail + ' Railway')));
  assert.ok(story.includes(row('1915', 'Reconstruit en néo-Tudor après l’incendie de 1914', 'Rebuilt in Tudor Revival style after the fire of 1914')));
  assert.ok(story.includes(row('1974', 'Acheté par le gouvernement du Nouveau-Brunswick', 'Bought by the Government of New Brunswick')));
  assert.ok(story.includes(row('1993', 'Illustré sur un timbre-poste canadien', 'Pictured on a Canadian postage stamp')));
  assert.ok(story.includes(row('2014', 'Rouvre, restauré : premier hôtel ' + H.brand + ' au Canada', 'Reopens, restored: the first ' + H.brand + ' hotel in Canada')));
  // the guests: each name from the table, each line saying what the sources say (a stay, a night, a visit, a reception)
  assert.deepEqual([H.guest1889, H.guest1901, H.guest1964, H.guest1973], ['Sir John A. Macdonald', 'Lord Minto', 'Lester B. Pearson', 'Pierre Trudeau']);
  assert.ok(guests.includes(row('1889', H.guest1889 + ', premier ministre, y séjourne dès le premier été', H.guest1889 + ', Prime Minister, is a guest in the first summer')));
  assert.ok(guests.includes(row('1901', H.guest1901 + ', gouverneur général, y passe la nuit', H.guest1901 + ', Governor General, stays the night')));
  assert.ok(guests.includes(row('1964', H.guest1964 + ', premier ministre, arrive en hélicoptère pour un dîner', H.guest1964 + ', Prime Minister, arrives by helicopter for a banquet')));
  assert.ok(guests.includes(row('1973', H.guest1973 + ', premier ministre, s’y arrête en famille', H.guest1973 + ', Prime Minister, drops in with his family')));
  assert.ok(guests.includes(row('1983', 'Visite princière : Charles et Diana y sont reçus', 'A reception here for Prince Charles and Princess Diana')));
  // each timeline under the name and its own heading pair
  assert.equal(count(html, 'class="alq-era'), 2, 'one heading pair for the story, one for the guests');
  assert.equal(count(html, 'class="alq-time"'), 2);
  assert.ok(story.includes('<span class="bs-h" lang="fr">Souvenirs d’hier</span><b class="alq-sep"></b><span class="bs-h" lang="en">Yesteryear</span>'));
  assert.ok(guests.includes('<span class="bs-h" lang="fr">Invités de marque</span><b class="alq-sep"></b><span class="bs-h" lang="en">Notable guests</span>'));
  assert.ok(html.includes('data-qr-url="' + H.url + '"'));
  assert.ok(!/translate=/.test(html) && !/translate=/.test(SRC), 'no marker: the table is the data');
  assert.ok(!/data-i18n-/.test(SRC) && !/i18n-ok/.test(SRC));
  // the words: French first here, each half marked with its language
  assert.ok(html.includes('<span class="bs-h" lang="fr">Souvenirs d’hier</span><b class="alq-sep"></b><span class="bs-h" lang="en">Yesteryear</span>'));
  assert.ok(html.includes('à 265 km de l’aéroport de Moncton'));
  assert.ok(html.includes('265 km from Moncton airport'));
  assert.ok(html.includes('environ 2 h 30 min en voiture'));
  assert.ok(html.includes('about 2 h 30 min by road'));
  // a name with an ampersand is escaped once, not twice
  const odd = onGate({ BoardStrings: B, _gateIata: 'YUL', _gateMapCity: () => 'Sackville & Dorchester' }, () => A.build(['en']));
  assert.ok(odd.includes('265 km from Sackville &amp; Dorchester airport'));
  assert.ok(!odd.includes('&amp;amp;'));
  // pictures: files of the site, each watercolour with the name of the house and its year for
  // its text, the older one first, the rest silent
  assert.equal(A.media.length, 4);
  A.media.forEach((u) => assert.ok(fs.existsSync(path.join(SITE, u)), u));
  assert.equal(count(html, 'class="alq-art"'), 2);
  // the name stands over the pictures of the yesteryear view
  const thenAt = html.indexOf('alq-view alq--then');
  const nameAt = html.indexOf('class="alq-name"', thenAt);
  assert.ok(nameAt > thenAt && nameAt < html.indexOf('class="alq-cardbox"', thenAt));
  assert.ok(html.includes('src="/logos/hotels/marriott/autograph-collection.svg#svgView('));
  assert.ok(fs.existsSync(path.join(SITE, 'logos/hotels/marriott/autograph-collection.svg')));
  // no heading or paragraph tags: the carousel resizes those
  assert.ok(!/<(h[1-6]|p)[\s>]/.test(html));
  // nothing light is painted from the script, and no picture is filtered
  assert.ok(!/style=/.test(html));
});

test('a board of one language shows each line once', () => {
  const html = onGate({ BoardStrings: B, _gateIata: 'YQM', _gateMapCity: () => 'Moncton' }, () => A.build(['de']));
  assert.ok(html.includes('class="alq alq--one"'));
  assert.equal(count(html, 'alq-sep'), 0, 'no rule between halves when there is one');
  assert.ok(html.includes('<span class="bs-h" lang="de">Erinnerungen an gestern</span>'));
  assert.equal(count(html, 'class="alq-yr"'), 11);
  assert.ok(html.includes('<span class="alq-ev"><span class="bs-h" lang="de" data-i18n-src="careful">Eröffnung als Sommerhotel am Meer</span></span>'));
  // two languages that say the same thing are one half
  const same = onGate({ BoardStrings: B, _gateIata: 'YQM', _gateMapCity: () => 'Moncton' }, () => A.build(['ja', 'ja']));
  assert.equal(count(same, 'lang="ja">昔日の面影<'), 1);
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

test('each watercolour is whole at its own proportions inside its frame, and nothing is drawn over it', () => {
  const a = jpegSize(path.join(SITE, 'assets/hotels/algonquin/bresnen-1990.jpg'));
  const b = jpegSize(path.join(SITE, 'assets/hotels/algonquin/bresnen-1994.jpg'));
  // the two files are the same size, so the two frames are exactly the same width and height
  assert.deepEqual(a, { w: 1600, h: 1073 });
  assert.deepEqual(b, { w: 1600, h: 1073 });
  assert.ok(CSS.includes('box-sizing:content-box; aspect-ratio:1600 / 1073;'), 'the frame is outside the box of the picture');
  assert.equal(count(CSS, 'aspect-ratio:1600 /'), 1);
  // the files the pair replaced are gone
  assert.ok(!fs.existsSync(path.join(SITE, 'assets/hotels/algonquin/watercolour-1994.jpg')));
  assert.ok(!fs.existsSync(path.join(SITE, 'assets/hotels/algonquin/gilt-frame.png')));
  const frame = pngSize(path.join(SITE, 'assets/hotels/algonquin/gilt-frame-wide.png'));
  assert.deepEqual(frame, { w: 1577, h: 1137, alpha: true });
  // the opening of the frame has the proportions of each picture, to within the two percent
  // the long rails give
  const open = { w: 1577 - 108 - 109, h: 1137 - 105 - 104 };
  [a, b].forEach((c) => assert.ok(Math.abs(c.w / c.h / (open.w / open.h) - 1) < 0.02));
  assert.ok(CSS.includes("border-image:var(--alq-frame-img) 105 109 104 108 stretch;"));
  assert.ok(CSS.includes("--alq-frame-img:url('/assets/hotels/algonquin/gilt-frame-wide.png');"));
  // one height for the two pictures; the border widths are the frame's own at the scale of
  // that height, so both frames are the same thickness
  const m = /\.alq-cardbox \.alq-fig\{ --alq-h:min\(\(100cqw - var\(--alq-gap\)\) \/ ([\d.]+), 100cqh \/ ([\d.]+)\);/.exec(CSS);
  assert.ok(m, 'the height of a picture');
  const bw = /\.alq-cardbox \.alq-art\{ height:var\(--alq-h\); align-self:center; flex:none;\s*border-width:calc\(var\(--alq-h\) \* ([\d.]+)\) calc\(var\(--alq-h\) \* ([\d.]+)\) calc\(var\(--alq-h\) \* ([\d.]+)\) calc\(var\(--alq-h\) \* ([\d.]+)\);/.exec(CSS);
  assert.ok(bw, 'the frame rule');
  const near = (x, y) => assert.ok(Math.abs(x - y) < 0.0005, x + ' is ' + y);
  near(+bw[1], 105 / open.h); near(+bw[2], 109 / open.h); near(+bw[3], 104 / open.h); near(+bw[4], 108 / open.h);
  // two equal columns, each wide enough for a picture in its frame; the pictures and their
  // labels share the columns and the space between them
  near(+m[1], 2 * (Math.max(a.w / a.h, b.w / b.h) + 217 / open.h));
  // the height: the picture, its frame, and the plaque of the year under it with its space
  const pl = /\.alq \.alq-plaque\{[^}]*margin-top:calc\(var\(--alq-h\) \* ([\d.]+)\); height:calc\(var\(--alq-h\) \* ([\d.]+)\);/.exec(CSS);
  assert.ok(pl, 'the plaque');
  near(+m[2], 1 + 209 / open.h + +pl[1] + +pl[2]);
  assert.ok(/\.alq-cardbox\{[^}]*display:grid; grid-template-columns:1fr 1fr; column-gap:var\(--alq-gap\);/.test(CSS));
  assert.ok(/\.alq-labels\{[^}]*display:grid; grid-template-columns:1fr 1fr; column-gap:var\(--alq-gap\);/.test(CSS));
  // the box of the pictures is no taller than two frames can be at its width, so a label is
  // never left far under its frame
  assert.ok(CSS.includes('max-height:calc((100cqw - var(--alq-gap)) / ' + m[1] + ' * ' + m[2] + ');'));
  assert.ok(/\.alq--then \.alq-hero, \.alq--story \.alq-hero\{[^}]*container-type:inline-size;/.test(CSS));
  // the timeline: the years in one fixed column against one rule, the lines from one left edge
  assert.ok(/\.alq-time\{[^}]*display:grid; grid-template-columns:var\(--alq-yw\) minmax\(0, 1fr\);/.test(CSS));
  assert.ok(CSS.includes('.alq-time::before{ content:""; position:absolute; top:0; bottom:0; left:calc(var(--alq-yw) + var(--alq-tg)); width:1px; background:var(--alq-rule); }'));
  // the script measures nothing for the labels
  assert.ok(!/alq-labels|alq-label/.test(SRC.slice(SRC.indexOf('function fit('))));
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
  assert.ok(CSS.includes('.alq .alq-name, .alq .alq-name *, .alq .alq-era, .alq .alq-era *, .alq .alq-credit, .alq .alq-credit *, .alq .alq-where, .alq .alq-where *{ font-family:var(--alq-caps) !important; }'));
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
  ['bresnen-1990.jpg', 'bresnen-1994.jpg', 'gilt-frame-wide.png', 'resort-aerial.jpg', 'fonts/libre-caslon-text/', 'fonts/alegreya/', 'autograph-collection.svg'].forEach((f) => assert.ok(note.includes(f), f));
  assert.ok(note.includes('Peter Bresnen'));
});
