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

test('the gate and baggage layers exist only while the holiday is set', () => {
  const layers = fn('_fidsHolidayLayers');
  assert.match(layers, /var on = !!document\.body\.dataset\.fidsHoliday;/);
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
  const m = new RegExp(sel.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&') + ' \\{[^}]*url\\("/logos/holiday/thanksgiving/([a-z-]+)\\.svg"\\)').exec(block);
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
  assert.match(layers, /_tgEdges\(band, '\.octb-apmark, \.octb-apsep, \.octb-clock', hr, 'left'\)/);
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

// The bouquet by the gate number: hung from the gate panel's bottom-right
// corner, spilling down over the top of the map like a corsage; on
// .g8-wrap, above the band and the map, so neither clips it; scaled with
// the screen; kept clear of the number's and the words' ink and of every
// word, logo and aircraft under it; mirrored to the bottom-left corner
// only when the right one is taken; hidden when both are; and with no red
// leaf, so it reads the same on every airline's colour.
test('the bouquet hangs from the gate panel\'s bottom corner, over the map, clear of every word', () => {
  assert.ok(CORE.includes("['.g8-wrap', 'tg-bq', null]"), 'a holiday layer of the gate screen, outside the band that clips');
  assert.ok(!CORE.includes("['.g8-r1-right', 'tg-bq', null]"), 'no longer inside the gate panel');
  const bq = fn('_tgBouquet'), fit = fn('_tgBqFit'), obs = fn('_tgObstacles');
  assert.match(CORE, /var _TG_BQ_H = 172, _TG_BQ_TILT = 7,/, '172px tall at 1080p, turned 7 degrees');
  assert.match(bq, /var h = _TG_BQ_H \* Math\.min\(wr\.width \/ 1920, wr\.height \/ 1080\)/, 'scaled with the screen');
  assert.match(bq, /side = 'r';\s*fit = _tgBqFit\(side, pr, wr, h, obs, g\);\s*if \(!fit\) \{ side = 'l'; fit = _tgBqFit\(side, pr, wr, h, obs, g\); \}/, 'the bottom-right corner, and the bottom-left only while the right is taken');
  assert.match(bq, /el\.style\.display = fit \? '' : 'none';/, 'hidden when neither corner is clear');
  // hangs from the panel's bottom edge, starting a third of its height above it
  assert.match(fit, /var T = pr\.bottom - h \* 0\.3,/);
  // the panel's words push it down; anything under it rules the corner out
  assert.match(fit, /if \(\(ob\.top \+ ob\.bottom\) \/ 2 < pr\.bottom && _tgMeet\(sb, ob, g \* 0\.6\)\) \{ T \+= ob\.bottom \+ g \* 0\.6 - sb\.top; moved = true; \}/);
  assert.match(fit, /if \(_tgMeet\(at\(slabs\[a2\]\), ob2, \(ob2\.top \+ ob2\.bottom\) \/ 2 < pr\.bottom \? g \* 0\.6 - 0\.5 : g\)\) return null;/);
  assert.match(fit, /if \(box\.bottom > wr\.bottom \|\| box\.left < wr\.left \|\| box\.right > wr\.right\) return null;/, 'every leaf on the screen');
  // every word (by its ink), logo, the airport's mark and the aircraft on the map
  assert.match(obs, /document\.createTreeWalker\(wrap, NodeFilter\.SHOW_TEXT\)/);
  assert.match(obs, /'\.g8-r1-logoslot img, \.g8-r1-logoslot svg, \.g8-r1-logoslot canvas, \.octb-apmark, img\[src\*="\/logos\/"\], \.leaflet-marker-pane > \*, \.v2-fi-icon-wrap, \.ac-ico'/);
  assert.match(fn('_fidsHolidayLayers'), /_tgBouquet\(band\);/);
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

// The fit itself, on the 1080p gate screen measured at YQM gate 4: the
// panel [1478, 0, 1920, 138], the number's ink [1765, 26, 1844, 120], the
// words' ink [1554, 18, 1704, 122]. The bouquet's top leaf rises beside the
// number into the panel's corner, its foot spills over the map, and nothing
// it is kept clear of comes within 6px (panel) or 10px (under it).
test('the bouquet\'s fit clears the number and gives way to a map label under it', () => {
  const src = /var _TG_BQ_INK = [^;]+;/.exec(CORE)[0] + /var _TG_BQ_H = [^;]+;/.exec(CORE)[0] + fn('_tgMeet') + fn('_tgBqFit');
  const fit = new Function(src + 'return _tgBqFit;')();
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
