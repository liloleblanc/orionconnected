'use strict';

// v24041 — Canadian Thanksgiving puts body[data-fids-holiday="thanksgiving-ca"]
// on Canadian airports' boards, on the airport's own date, and nowhere else.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current/js/fids-core.js'), 'utf8');
function fn(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name);
  return CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
}
const AP = { YQM: { tz: 'America/Moncton' }, YVR: { tz: 'America/Vancouver' }, YYZ: { tz: 'America/Toronto' }, ORD: { tz: 'America/Chicago' }, DUB: { tz: 'Europe/Dublin' } };
const HELPERS = () => fn('fidsLocalDateKey') + fn('_fidsAirportYmd') + fn('_fidsHolidayFor');
const holidayFor = new Function('AP', 'location', HELPERS() + 'return _fidsHolidayFor;')(AP, { search: '' });

test('Thanksgiving 2026 (Monday Oct 12) at Canadian airports, in their own time zone', () => {
  assert.equal(holidayFor('YQM', new Date('2026-10-12T15:00:00Z')), 'thanksgiving-ca');
  assert.equal(holidayFor('YVR', new Date('2026-10-12T20:00:00Z')), 'thanksgiving-ca');
  assert.equal(holidayFor('YYZ', new Date('2026-10-13T03:30:00Z')), 'thanksgiving-ca', '11:30 pm in Toronto is still the 12th');
  assert.equal(holidayFor('YQM', new Date('2026-10-13T03:30:00Z')), '', '00:30 in Moncton is the 13th');
});

test('not the day before or after, not other years\' wrong Mondays, not outside Canada', () => {
  assert.equal(holidayFor('YQM', new Date('2026-10-11T15:00:00Z')), '');
  assert.equal(holidayFor('YQM', new Date('2026-10-05T15:00:00Z')), '', 'first Monday');
  assert.equal(holidayFor('YQM', new Date('2026-10-19T15:00:00Z')), '', 'third Monday');
  assert.equal(holidayFor('YQM', new Date('2027-10-11T15:00:00Z')), 'thanksgiving-ca', '2027: Oct 11');
  assert.equal(holidayFor('YQM', new Date('2025-10-13T15:00:00Z')), 'thanksgiving-ca', '2025: Oct 13');
  assert.equal(holidayFor('ORD', new Date('2026-10-12T15:00:00Z')), '');
  assert.equal(holidayFor('DUB', new Date('2026-10-12T15:00:00Z')), '');
});

test('?holiday= previews a look and ?holiday=none turns it off', () => {
  const withQ = (q) => new Function('AP', 'location', HELPERS() + 'return _fidsHolidayFor;')(AP, { search: q });
  assert.equal(withQ('?holiday=thanksgiving-ca')('ORD', new Date('2026-03-01T12:00:00Z')), 'thanksgiving-ca');
  assert.equal(withQ('?holiday=none')('YQM', new Date('2026-10-12T15:00:00Z')), '');
  assert.equal(withQ('?holiday=<script>')('ORD', new Date('2026-03-01T12:00:00Z')), '');
});

test('the banner pass stamps the attribute on every board render', () => {
  assert.match(fn('_applyBannerStyle'), /var _hol = _fidsHolidayFor\(ap, new Date\(\)\);\s*if \(_hol\) document\.body\.dataset\.fidsHoliday = _hol;\s*else delete document\.body\.dataset\.fidsHoliday;/);
});

const CSS = fs.readFileSync(path.join(__dirname, '..', 'fids-current/css/display-overrides.css'), 'utf8');

test('the harvest band goes in through the palette hook, after an operator\'s own palette', () => {
  assert.match(CORE, /var HOLIDAY_BAND = \{\s*'thanksgiving-ca': \['#9E2A1B', '#D4561F', '#E8A93A', '#8F4A12'\]\s*\};/);
  const pick = CORE.slice(CORE.indexOf("try { pal = JSON.parse(localStorage.getItem('fids_banner_palette_'"), CORE.indexOf('if (pal && pal.length >= 4) { _applyBandPalette(pal); }'));
  assert.ok(pick.indexOf('HOLIDAY_BAND') > pick.indexOf('fids_banner_palette_'), 'a stored palette still wins');
  assert.ok(pick.indexOf('HOLIDAY_BAND') < pick.indexOf('BANNER_PALETTE[ap]'), 'the holiday beats the registry');
});

test('the look is keyed on the holiday, uses no words, and never a box behind a logo', () => {
  const at = CSS.indexOf('A HOLIDAY LOOK: THANKSGIVING');
  assert.ok(at > 0);
  const block = CSS.slice(at, CSS.indexOf('/* ══', at + 10) > at ? CSS.indexOf('/* ══', at + 10) : undefined);
  const rules = block.split('}').filter((r) => r.includes('{'));
  for (const r of rules) if (!/^\s*@media/.test(r.trim()) && r.includes('.')) assert.match(r, /\[data-fids-holiday="thanksgiving-ca"\]|^\s*$/, r.slice(0, 80));
  assert.doesNotMatch(block, /content:\s*['"][^'"]+['"]/, 'no words drawn by CSS');
  assert.match(block, /\.fids-board-icon \{[^}]*background: transparent !important;/, 'the badge loses its white disc');
});

test('the gate and baggage layers exist only while Thanksgiving is set', () => {
  const layers = fn('_fidsHolidayLayers');
  // Thanksgiving's own layers, for thanksgiving-ca only: made for any look,
  // they sat unstyled in the gate's flow under another one (the bouquet
  // alone squashed the gate by ~172px)
  assert.match(layers, /var on = document\.body\.dataset\.fidsHoliday === 'thanksgiving-ca';/);
  assert.doesNotMatch(layers, /var on = !!document\.body\.dataset\.fidsHoliday;/);
  assert.match(layers, /if \(!on\) \{ if \(el\) el\.parentNode\.removeChild\(el\); continue; \}/);
  assert.match(CORE, /_ocEvery\(_fidsHolidayLayers, 2000\)/);
});

// The leaves are real artwork (two licensed vector files), trimmed into
// logos/holiday/thanksgiving/: no drawn leaf left in the look, every file the
// CSS names exists, is small, is plain vector art and is in the asset
// manifest, and the extra leaves follow the same layer rules.
const LEAF_DIR = path.join(__dirname, '..', 'fids-current/logos/holiday/thanksgiving');
const LEAVES = ['maple-amber.svg', 'maple-bouquet.svg', 'maple-crimson.svg', 'maple-gold.svg', 'maple-orange.svg', 'maple-rust.svg'];
function holidayBlock() {
  const at = CSS.indexOf('A HOLIDAY LOOK: THANKSGIVING');
  return CSS.slice(at, CSS.indexOf('/* ══', at + 10));
}
const leafOf = (block, sel) => {
  const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + ' \\{[^}]*url\\("/logos/holiday/thanksgiving/([a-z-]+)\\.svg"\\)').exec(block);
  return m && m[1];
};

test('the leaves are the real artwork files, not drawn data URIs', () => {
  const block = holidayBlock();
  assert.doesNotMatch(block, /data:image\/svg/, 'no drawn leaf left in the look');
  const urls = [...block.matchAll(/url\("(\/logos\/holiday\/thanksgiving\/[a-z-]+\.svg)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(urls)].map((u) => path.basename(u)).sort(), LEAVES, 'all five leaves and the bouquet are used');
  assert.equal(leafOf(block, '.fids-board-icon::before'), 'maple-gold', 'gold leaf on the badge');
  assert.equal(leafOf(block, '.g8-r1 > .tg-leaf'), 'maple-gold', 'the gate keeps its gold leaf, never a red one');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'fids-current/assets/asset-manifest.json'), 'utf8');
  for (const u of new Set(urls)) {
    const f = path.join(LEAF_DIR, path.basename(u));
    assert.ok(fs.existsSync(f), u);
    const svg = fs.readFileSync(f, 'utf8');
    const cap = /bouquet/.test(u) ? 20000 : 12000;
    assert.ok(svg.length < cap, u + ' stays small for the screens (' + svg.length + ' bytes)');
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=|\son[a-z]+=/i, u + ' is plain vector art');
    assert.ok(manifest.includes('"' + u + '"'), u + ' is in the asset manifest');
  }
  // provenance: in docs (the public tree carries no text files) and in each file
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs/licenses/holiday-leaves.md'), 'utf8');
  assert.match(doc, /Vecteezy item 11215158/);
  assert.match(doc, /Vecteezy item 23481840/);
  for (const u of new Set(urls)) {
    assert.ok(doc.includes('`' + path.basename(u) + '`'), u + ' is listed in the provenance note');
    assert.match(fs.readFileSync(path.join(LEAF_DIR, path.basename(u)), 'utf8'), /^<svg [^>]*><!-- [^>]*Vecteezy item (11215158|23481840)[^>]*-->/, u + ' names its source');
  }
  assert.match(fs.readFileSync(path.join(LEAF_DIR, 'maple-rust.svg'), 'utf8'), /Vecteezy item 23481840/, 'the rust leaf comes from the second file');
  assert.deepEqual(fs.readdirSync(LEAF_DIR).sort(), LEAVES, 'only the leaves in use ship');
});

test('every extra leaf is a holiday layer, placed by measuring, and nothing moves', () => {
  for (const [host, cls] of [['.g8-r1', 'tg-rest-a'], ['.g8-r1', 'tg-rest-b'], ['.g8-r1', 'tg-rest-c'],
    ['#fidsBanner', 'tg-fall-a'], ['#fidsBanner', 'tg-fall-b'], ['#fidsBanner', 'tg-fall-c'], ['#fidsBanner', 'tg-fall-d']]) {
    assert.ok(CORE.includes("['" + host + "', '" + cls + "', null]"), cls);
  }
  for (const cls of ['tg-bag-a', 'tg-bag-b', 'tg-bag-c']) assert.ok(CORE.includes("['#baggageView .b5 .b5-band', '" + cls + "', '.b5-bin']"), cls);
  const layers = fn('_fidsHolidayLayers');
  // the gate measures the airline's artwork and the airport's mark; the
  // banner the title, the airport's logo and the clock; baggage the
  // "Baggage claim" line, the welcome line and the clock glass
  assert.match(layers, /_tgEdges\(band, '\.g8-r1-logoslot img, \.g8-r1-logoslot svg, \.g8-r1-logoslot canvas', hr, 'right'\)/);
  // the airport's mark is its logo or, where it has none, its code in letters
  assert.match(layers, /_tgEdges\(band, '\.octb-apmark, \.octb-ap, \.octb-apsep, \.octb-clock', hr, 'left'\)/);
  assert.match(layers, /_tgEdges\(fb, '#fidsAirportPill', fr, 'left'\)/);
  assert.match(layers, /_tgEdges\(fb, '#clock, #clockDate > \*, \.fids-banner-time', fr, 'left'\)/);
  assert.match(layers, /_tgEdges\(bb, '\.b5-clockwx', br, 'left'\)/);
  // a leaf that would not fit clear of them is hidden, never squeezed in
  const put = fn('_tgPut');
  assert.match(put, /var ok = s >= 24 && x - s \/ 2 >= lo && x \+ s \/ 2 <= hi;/);
  assert.match(put, /el\.style\.display = ok \? '' : 'none';/);
  assert.match(fn('_tgPair'), /if \(w < 36\)/, 'a squeezed leaf never drops under 36px');
  const block = holidayBlock();
  assert.doesNotMatch(block, /animation|transition|@keyframes/, 'the leaves rest, like the rest of the boards');
});

test('the gate\'s resting leaves are pinned to the ribbon, not to the top of the band', () => {
  const block = holidayBlock();
  const rib = /\.g8-r1 > \.tg-ribbon \{[^}]*bottom: (\d+)px; height: (\d+)px;/.exec(block);
  assert.ok(rib, 'the ribbon is pinned from the bottom');
  const rest = /\.g8-r1 > \.tg-rest-c \{ position: absolute; top: auto; bottom: (\d+)px;/.exec(block);
  assert.ok(rest, 'the resting leaves are pinned from the bottom too');
  assert.ok(+rest[1] >= +rib[1], 'they never reach below the ribbon into the date bar');
  assert.ok(+rest[1] < +rib[1] + +rib[2], 'they touch the ribbon');
  const leaf = /\.g8-r1 > \.tg-leaf \{ position: absolute; top: auto; bottom: (\d+)px;/.exec(block);
  assert.ok(leaf && +leaf[1] > +rib[1] + +rib[2], 'the gold leaf drifts above the ribbon');
  const layers = fn('_fidsHolidayLayers');
  assert.match(layers, /var m = Math\.min\(84 \* kc, rt - 14\);/, 'the gold leaf fits the cream above the ribbon at every size');
});

test('no red maple beside an Air Canada logo', () => {
  const block = holidayBlock();
  const layers = fn('_fidsHolidayLayers');
  assert.match(layers, /var acGate = \/\^\(AC\|QK\|RV\|ZX\)\$\/\.test\(ga\);/);
  assert.match(layers, /band\.classList\.toggle\('tg-ac', acGate \|\| acArt\);/);
  // keyed on the gate's airline too, so the swap holds the moment the airline changes
  for (const code of ['AC', 'QK', 'RV', 'ZX']) {
    for (const cls of ['tg-rest-a', 'tg-rest-c']) assert.ok(block.includes('[data-gate-airline="' + code + '"] .g8-r1 > .' + cls + ','), code + ' ' + cls);
  }
  const red = ['maple-rust', 'maple-crimson'];
  for (const cls of ['tg-leaf', 'tg-rest-a', 'tg-rest-b', 'tg-rest-c']) {
    const plain = leafOf(block, '.g8-r1 > .' + cls);
    const ac = leafOf(block, '.g8-r1.tg-ac > .' + cls) || plain;
    assert.ok(plain, cls);
    assert.ok(!red.includes(ac), cls + ' on an Air Canada gate is ' + ac);
  }
});

// The bouquet by the gate number, on every gate screen all day: hung from
// the gate panel's bottom-right corner, spilling down over the top of the map
// like a corsage; on .g8-wrap, above the band and the map, so neither clips
// it; scaled with the screen; kept clear of the number's and the words' ink
// and of every word, logo (by its ink) and aircraft under it; mirrored to the
// bottom-left corner when the right one is taken, a little smaller where
// neither is clear at full size, and pinned inside the panel beside the
// number where no corner is (the boarding takeover); never display:none, it
// fades out and in, and goes at once when something comes under its leaves;
// and with no red leaf, so it reads the same on every airline's colour.
test('the bouquet hangs from the gate panel\'s bottom corner, over the map, clear of every word', () => {
  assert.ok(CORE.includes("['.g8-wrap', 'tg-bq', null]"), 'a holiday layer of the gate screen, outside the band that clips');
  assert.ok(!CORE.includes("['.g8-r1-right', 'tg-bq', null]"), 'no longer inside the gate panel');
  const bq = fn('_tgBouquet'), where = fn('_tgBqWhere'), fit = fn('_tgBqFit'), pin = fn('_tgBqPin'), obs = fn('_tgObstacles');
  assert.match(CORE, /var _TG_BQ_H = 172, _TG_BQ_TILT = 7,/, '172px tall at 1080p, turned 7 degrees');
  assert.match(where, /var k = Math\.min\(wr\.width \/ 1920, wr\.height \/ 1080\), H = _TG_BQ_H \* k, g = 10 \* k;/, 'scaled with the screen');
  // 1. the corsage: right, then left, at 100, 92, 84 and 76% of its size;
  // never on a takeover
  assert.match(where, /var tk = wrap\.classList\.contains\('g8-takeover'\);/);
  assert.match(where, /for \(i = 0; i < 4 && !out\.P && !tk; i\+\+\) \{\s*h = H \* \(1 - 0\.08 \* i\);\s*for \(sd = 0; sd < 2 && !out\.P; sd\+\+\) \{\s*f = _tgBqFit\(sd \? 'l' : 'r', pr, wr, h, out\.obs, g\);/);
  // 2. else pinned in the panel, beside the number first, as tall as fits
  assert.match(where, /for \(h = Math\.min\(H \* 0\.72, pr\.height\); h >= H \* 0\.4 && !out\.P; h -= 4 \* k\) \{\s*f = _tgBqPin\(sd \? 'l' : 'r', pr, wr, h, out\.obs, g\);/);
  assert.ok(where.indexOf('_tgBqFit(') < where.indexOf('_tgBqPin('), 'the corsage before the panel');
  // hangs from the panel's bottom edge, starting a third of its height above it
  assert.match(fit, /var T = pr\.bottom - h \* 0\.3,/);
  // the panel's words push it down; anything under it rules the corner out
  assert.match(fit, /if \(\(ob\.top \+ ob\.bottom\) \/ 2 < pr\.bottom && _tgMeet\(sb, ob, g \* 0\.6\)\) \{ T \+= ob\.bottom \+ g \* 0\.6 - sb\.top; moved = true; \}/);
  assert.match(fit, /if \(_tgBqHit\(S, L, T, pr, obs, g \* 0\.6 - 0\.5, g\)\) return null;/);
  assert.match(fit, /if \(box\.bottom > wr\.bottom \|\| box\.left < wr\.left \|\| box\.right > wr\.right\) return null;/, 'every leaf on the screen');
  assert.match(pin, /if \(_tgBqHit\(S, L, T, pr, obs, g \* 0\.6 - 0\.5, g\)\) return null;/, 'pinned, it keeps the same distances');
  // every word (by its ink), logo (by its ink), the airport's mark and the aircraft on the map
  assert.match(obs, /document\.createTreeWalker\(wrap, NodeFilter\.SHOW_TEXT\)/);
  assert.match(obs, /'\.g8-r1-logoslot img, \.g8-r1-logoslot svg, \.g8-r1-logoslot canvas, \.octb-apmark, img\[src\*="\/logos\/"\], \.leaflet-marker-pane > \*, \.v2-fi-icon-wrap, \.ac-ico'/);
  assert.match(obs, /var ik = _tgImgInk\(im\[j\], ir\);/);
  assert.match(fn('_fidsHolidayLayers'), /_tgBouquet\(band\);/);
  // never hidden by display:none; it fades, or goes at once when something
  // is under its leaves or the screen's state has just changed
  assert.doesNotMatch(bq, /display/);
  assert.match(bq, /var cut = !!now \|\| under\(\);\s*_tgBqVis\(el, false, cut\);/);
  assert.match(bq, /if \(el\._tgBqWait\) \{ if \(under\(\)\) _tgBqVis\(el, false, true\); return; \}/, 'even while it fades out');
  assert.match(bq, /var under = function \(\) \{ return !W \|\| !at \|\| _tgBqHit\(_tgBqSlabs\(at\.side, at\.h\), at\.L, at\.T, W\.pr, W\.obs, 0, 0\); \};/);
  // measured at once when the takeover changes the band's height, when the
  // airline's card comes up or goes (a class on .g8-wrap) and when the map
  // draws its words, not only on the 2-second pass
  assert.match(bq, /band\._tgBqRO = new ResizeObserver\(function \(\) \{ _tgBqNow\(band, wrap\); \}\);/);
  assert.match(bq, /wrap\._tgBqMO\.observe\(wrap, \{ attributes: true, attributeFilter: \['class'\] \}\);/);
  assert.match(bq, /wrap\._tgBqMapMO\.observe\(mb, \{ childList: true, subtree: true \}\);/);
  assert.match(fn('_tgBqNow'), /_tgBouquet\(band, true\);/);
  // the fade is the bouquet's own opacity, inline (the stylesheet's leaves
  // rest): from nothing for a bouquet just made, 0.6s, or none for a cut
  const vis = fn('_tgBqVis');
  assert.match(vis, /if \(el\.style\.opacity === ''\) \{ el\.style\.transition = 'none'; el\.style\.opacity = '0'; void getComputedStyle\(el\)\.opacity; \}/, 'a bouquet just made fades in from nothing');
  assert.match(vis, /el\.style\.transition = cut \? 'none' : 'opacity \.6s ease';\s*void getComputedStyle\(el\)\.opacity;\s*el\.style\.opacity = on \? '1' : '0';/);
  const block = holidayBlock();
  assert.equal(leafOf(block, '.g8-wrap > .tg-bq::before'), 'maple-bouquet');
  assert.match(block, /\.g8-wrap > \.tg-bq \{ position: absolute; z-index: 3; pointer-events: none; transform-origin: 100% 0;\s*filter: drop-shadow\(/, 'above the band and the map, pinned at its top corner, with a shadow');
  assert.match(block, /\.g8-wrap > \.tg-bq\.tg-bq-l \{ transform-origin: 0 0; \}/);
  assert.match(block, /\.g8-wrap > \.tg-bq\.tg-bq-l::before \{ transform: scaleX\(-1\); \}/, 'mirrored on the left');
  // the ink table is the artwork's: nine bands of its 300 x 540 box
  const ink = JSON.parse(/var _TG_BQ_INK = (\[[^;]+\]);/.exec(CORE)[1]);
  assert.equal(ink.length, 9);
  for (const [x0, x1] of ink) assert.ok(x0 >= 0 && x1 <= 300 && x0 < x1);
  // no red leaf: every leaf colour in the bouquet is gold, orange or yellow
  const svg = fs.readFileSync(path.join(LEAF_DIR, 'maple-bouquet.svg'), 'utf8');
  assert.match(svg, /viewBox="0 0 300 540"/);
  const stops = [...svg.matchAll(/stop-color="#([0-9a-f]{6})"/g)].map((m) => [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));
  assert.ok(stops.length > 10);
  for (const [r, g] of stops) assert.ok(g >= r * 0.45, 'a leaf colour with red ' + r + ' and green ' + g + ' is too red for a red panel');
});

const BQ_SRC = () => /var _TG_BQ_INK = [^;]+;/.exec(CORE)[0] + /var _TG_BQ_H = [^;]+;/.exec(CORE)[0] + fn('_tgMeet') + fn('_tgBqSlabs') + fn('_tgBqHit') + fn('_tgBqFit') + fn('_tgBqPin');

// The fit itself, on the 1080p gate screen measured at YQM gate 4: the
// panel [1478, 0, 1920, 138], the number's ink [1765, 26, 1844, 120], the
// words' ink [1554, 18, 1704, 122]. The bouquet's top leaf rises beside the
// number into the panel's corner, its foot spills over the map, and nothing
// it is kept clear of comes within 6px (panel) or 10px (under it).
test('the bouquet\'s fit clears the number and gives way to a map label under it', () => {
  const fit = new Function(BQ_SRC() + 'return _tgBqFit;')();
  const pr = { left: 1478, top: 0, right: 1920, bottom: 138 }, wr = { left: 0, top: 0, right: 1920, bottom: 1080 };
  const num = { left: 1765, top: 26, right: 1844, bottom: 120 }, words = { left: 1554, top: 18, right: 1704, bottom: 122 };
  const r = fit('r', pr, wr, 172, [num, words], 10);
  assert.ok(r, 'the bottom-right corner fits');
  assert.ok(r.T < pr.bottom - 10, 'its top crosses the panel\'s bottom edge (top ' + r.T.toFixed(1) + ')');
  assert.ok(r.T + 172 > pr.bottom + 120, 'and it spills well down over the map');
  assert.ok(r.L + r.w <= 1920, 'on the screen');
  // a map label under the right corner rules it out, and the left one fits
  const label = { left: 1830, top: 200, right: 1915, bottom: 215 };
  assert.equal(fit('r', pr, wr, 172, [num, words, label], 10), null);
  const l = fit('l', pr, wr, 172, [num, words, label], 10);
  assert.ok(l && l.L >= 1478, 'the mirror image hangs from the bottom-left corner');
  // the panel's words keep it under their ink on the left too
  assert.ok(l.T > 100, 'clear of Porte (top ' + l.T.toFixed(1) + ')');
});

// The boarding takeover, measured at YQM gate 4 (AC1987, Now Boarding) at
// 1920 x 1080: the panel shrinks to [1440, 0, 1920, 110] and the flight
// cards fill the space under it (the Departure card's "6:15pm" ink reaches
// [1765, 197, 1901, 266], its icon [1469, 161, 1550, 242]). Neither corner
// is clear at any size, and the bouquet is pinned in the panel beside the
// number instead of being hidden for the whole takeover.
test('through the boarding takeover the bouquet is pinned in the gate panel beside the number', () => {
  const S = new Function(BQ_SRC() + 'return { fit: _tgBqFit, pin: _tgBqPin, slabs: _tgBqSlabs };')();
  const pr = { left: 1440, top: 0, right: 1920, bottom: 110 }, wr = { left: 0, top: 0, right: 1920, bottom: 1080 };
  const num = { left: 1753, top: 19, right: 1813, bottom: 89 };
  const obs = [{ left: 1573, top: 3, right: 1695, bottom: 43 }, { left: 1552, top: 66, right: 1694, bottom: 105 }, num,
    { left: 1581, top: 129, right: 1683, bottom: 146 }, { left: 1703, top: 127, right: 1771, bottom: 146 },
    { left: 1566, top: 184, right: 1761, bottom: 252 }, { left: 1765, top: 197, right: 1901, bottom: 266 },
    { left: 1469, top: 161, right: 1550, bottom: 242 }];
  for (const f of [1, 0.92, 0.84, 0.76]) for (const side of ['r', 'l']) assert.equal(S.fit(side, pr, wr, 172 * f, obs, 10), null, side + ' corner at ' + f);
  let p = null, h;
  for (h = Math.min(172 * 0.72, 110); h >= 172 * 0.4 && !p; h -= 4) p = S.pin('r', pr, wr, h, obs, 10);
  h += 4;
  assert.ok(p, 'pinned beside the number');
  assert.equal(Math.round(h), 110, 'as tall as the panel');
  const k = S.slabs('r', h), box = { left: p.L + k.all.left, right: p.L + k.all.right, top: p.T + k.all.top, bottom: p.T + k.all.bottom };
  assert.ok(box.left >= num.right + 6, 'clear of the number (' + box.left.toFixed(1) + ')');
  assert.ok(box.right <= 1920 && box.top >= 0, 'every leaf on the screen');
  assert.ok(box.bottom < 197 - 10, 'above the Departure card\'s time');
});

// v24047 — the corsage is never hung through a takeover. Measured at YUL
// gate C75 (AC513, Now Boarding) on a 2560 x 1440 screen: the panel is
// [1920, 0, 2560, 110] (the takeover pins it to 110px at every size), its
// words "Porte" [2060, 1, 2211, 43], "Gate" [2082, 66, 2211, 109] and the
// number "C75" [2273, 18, 2445, 91]; under it the Departure card's title
// "Départ | Departure" [2101, 129, 2337, 153] and its time "19:08" [2085,
// 191, 2336, 258]. Nothing written comes within 10px of the bottom-right
// corner at that size, so v24046 hung the 229px corsage there, over the
// Départ card (and at 1680 x 1050 on YQM gate 4 once the label took its
// takeover size). On the takeover it is pinned beside the number instead.
test('through a takeover the bouquet is pinned beside the number, never hung over the cards', () => {
  const pr = { left: 1920, top: 0, right: 2560, bottom: 110, width: 640, height: 110 };
  const wr = { left: 0, top: 0, right: 2560, bottom: 1440, width: 2560, height: 1440 };
  const num = { left: 2273, top: 18, right: 2445, bottom: 91 };
  const obs = [{ left: 2060, top: 1, right: 2211, bottom: 43 }, { left: 2082, top: 66, right: 2211, bottom: 109 }, num,
    { left: 2101, top: 129, right: 2186, bottom: 153 }, { left: 2194, top: 132, right: 2201, bottom: 153 }, { left: 2209, top: 132, right: 2337, bottom: 153 },
    { left: 2085, top: 191, right: 2336, bottom: 258 }, { left: 1963, top: 156, right: 2055, bottom: 248 }];
  const where = new Function('OBS', BQ_SRC() + 'function _tgObstacles() { return OBS; }' + fn('_tgBqWhere') + 'return _tgBqWhere;')(obs);
  const band = { querySelector: () => ({ getBoundingClientRect: () => pr }) };
  const wrapOf = (tk) => ({ classList: { contains: (c) => tk && c === 'g8-takeover' }, getBoundingClientRect: () => wr });
  // off a takeover the same geometry takes the corsage (the place v24046 chose here)
  const idle = where(band, wrapOf(false));
  assert.equal(idle.P && idle.P.mode, 'hang', 'the corner is clear of every word');
  const tk = where(band, wrapOf(true)), P = tk.P;
  assert.ok(P, 'still shown through the takeover');
  assert.equal(P.mode, 'pin');
  assert.equal(P.side, 'r', 'beside the number');
  const S = new Function(BQ_SRC() + 'return _tgBqSlabs;')()(P.side, P.h);
  const box = { left: P.L + S.all.left, right: P.L + S.all.right, top: P.T + S.all.top, bottom: P.T + S.all.bottom };
  assert.ok(box.left >= num.right + 6, 'clear of the number (' + box.left.toFixed(1) + ')');
  assert.ok(box.right <= 2560 && box.top >= 0, 'every leaf on the screen');
  assert.ok(box.bottom < 129 - 6, 'above the Departure card (' + box.bottom.toFixed(1) + ')');
});

// A logo counts by its ink, not its box: an airline's card with a mark in
// the left half of a 350px box leaves the box's right half free.
test('a logo is measured by its ink, read once per file', () => {
  let draws = 0;
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({
    drawImage: () => { draws++; },
    // ink only in the left half of the image
    getImageData: (x, y, w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w / 2; i++) d[(j * w + i) * 4 + 3] = 255; return { data: d }; }
  }) });
  const doc = { createElement: () => canvas() };
  const cs = () => ({ objectFit: 'contain', objectPosition: '50% 50%', paddingLeft: '0px', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', borderLeftWidth: '0px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px' });
  const ink = new Function('document', 'getComputedStyle', 'var _tgInkMemo = {};' + fn('_tgImgInk') + 'return _tgImgInk;')(doc, cs);
  const im = { tagName: 'IMG', complete: true, naturalWidth: 100, naturalHeight: 100, src: '/logos/x.svg', currentSrc: '/logos/x.svg' };
  const box = { left: 1524, top: 197, right: 1874, bottom: 557, width: 350, height: 360 };
  const rs = ink(im, box);
  assert.ok(rs.length > 0);
  for (const r of rs) assert.ok(r.left >= 1524 && r.right <= 1524 + 175 + 0.01, 'only the left half (' + r.left + '..' + r.right + ')');
  assert.ok(Math.min(...rs.map((r) => r.top)) >= 202 - 0.01, 'contained: the square image sits 5px down in the 360px box');
  ink(im, box);
  assert.equal(draws, 1, 'read once');
  // an image it cannot read counts by its box
  assert.deepEqual(ink({ tagName: 'IMG', complete: false, naturalWidth: 0, naturalHeight: 0 }, box), [box]);
});
