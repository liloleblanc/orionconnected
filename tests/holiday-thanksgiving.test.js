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
const LEAVES = ['maple-amber.svg', 'maple-crimson.svg', 'maple-gold.svg', 'maple-orange.svg', 'maple-rust.svg'];
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
  assert.deepEqual([...new Set(urls)].map((u) => path.basename(u)).sort(), LEAVES, 'all five leaves are used');
  assert.equal(leafOf(block, '.fids-board-icon::before'), 'maple-gold', 'gold leaf on the badge');
  assert.equal(leafOf(block, '.g8-r1 > .tg-leaf'), 'maple-gold', 'the gate keeps its gold leaf, never a red one');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'fids-current/assets/asset-manifest.json'), 'utf8');
  for (const u of new Set(urls)) {
    const f = path.join(LEAF_DIR, path.basename(u));
    assert.ok(fs.existsSync(f), u);
    const svg = fs.readFileSync(f, 'utf8');
    assert.ok(svg.length < 12000, u + ' stays small for the screens (' + svg.length + ' bytes)');
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
