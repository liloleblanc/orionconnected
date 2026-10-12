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
// manifest, and the gate's extra leaves follow the same layer rules.
const LEAF_DIR = path.join(__dirname, '..', 'fids-current/logos/holiday/thanksgiving');
function holidayBlock() {
  const at = CSS.indexOf('A HOLIDAY LOOK: THANKSGIVING');
  return CSS.slice(at, CSS.indexOf('/* ══', at + 10));
}

test('the leaves are the real artwork files, not drawn data URIs', () => {
  const block = holidayBlock();
  assert.doesNotMatch(block, /data:image\/svg/, 'no drawn leaf left in the look');
  const urls = [...block.matchAll(/url\("(\/logos\/holiday\/thanksgiving\/[a-z-]+\.svg)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(urls)].sort(), ['/logos/holiday/thanksgiving/maple-gold.svg', '/logos/holiday/thanksgiving/maple-orange.svg', '/logos/holiday/thanksgiving/maple-red.svg']);
  assert.match(block, /\.fids-board-icon::before \{[^}]*url\("\/logos\/holiday\/thanksgiving\/maple-gold\.svg"\)/, 'gold leaf on the badge');
  assert.match(block, /\.g8-r1 > \.tg-leaf \{[^}]*url\("\/logos\/holiday\/thanksgiving\/maple-red\.svg"\)/, 'red leaf on the gate');
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
    assert.match(fs.readFileSync(path.join(LEAF_DIR, path.basename(u)), 'utf8'), /^<svg [^>]*><!-- [^>]*Vecteezy item 11215158[^>]*-->/, u + ' names its source');
  }
  assert.deepEqual(fs.readdirSync(LEAF_DIR).sort(), ['maple-gold.svg', 'maple-orange.svg', 'maple-red.svg'], 'only the leaves in use ship');
});

test('the gate\'s fallen leaves are holiday layers, placed only where the cream is wide, and nothing moves', () => {
  assert.match(CORE, /\['\.g8-r1', 'tg-rest-a', null\], \['\.g8-r1', 'tg-rest-b', null\]/);
  const layers = fn('_fidsHolidayLayers');
  assert.match(layers, /wide = !!\(a && bx && bx - a >= 420\)/);
  assert.match(layers, /ra\.style\.display = wide \? '' : 'none'/);
  assert.match(layers, /rb\.style\.display = wide \? '' : 'none'/);
  const block = holidayBlock();
  assert.doesNotMatch(block, /animation|transition|@keyframes/, 'the leaves rest, like the rest of the boards');
  // the fallen leaves stay above the date bar: top + height never passes the
  // ribbon's lower edge (the band is 140px, the ribbon sits 25px off its bottom)
  for (const cls of ['tg-rest-a', 'tg-rest-b']) {
    const m = new RegExp('\\.g8-r1 > \\.' + cls + ' \\{ top: (\\d+)px; width: (\\d+)px; height: (\\d+)px;').exec(block);
    assert.ok(m, cls);
    assert.ok(+m[1] + +m[3] <= 140 - 25, cls + ' rests on the ribbon, not on the date');
  }
});
