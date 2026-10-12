'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24039 — THE BOARD'S ICONS ARE OUR OWN, NOT AIR CANADA'S.
//
// The gate info rows, the BIDS suitcase, the board-title plane, the boarding
// lane arrows and the hotel ads' two marks were glyphs of Air Canada's own
// icon font (icomoon). They are now SVG files in logos/icons/:
//   · takeoff, landing, suitcase, boarding pass — a Vecteezy pack (Pro
//     licence); the lane arrow — the Vecteezy airport-signs pack;
//   · bell, stopwatch, passengers, ringed plane, plane, house — Google's
//     Material Symbols (Apache 2.0, its text shipped beside them).
// Each is drawn as a mask on the ::before box, so it takes `color` exactly as
// the glyph did. Porter's own illustrations still replace three of them on a
// Porter gate, and nothing is drawn over them.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'fids-current');
const ICONS = path.join(SITE, 'logos/icons');
const rd = (p) => fs.readFileSync(path.join(SITE, p), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

test('the Air Canada icon font is gone, and nothing names it', () => {
  assert.ok(!fs.existsSync(path.join(SITE, 'fonts/ac-icons')));
  for (const f of walk(SITE).filter((x) => /\.(css|js|html)$/.test(x))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/['"]ac-icons['"]|icomoon\.woff/.test(src), path.relative(ROOT, f) + ' still draws with the Air Canada icon font');
  }
});

const MARKS = {
  flight: 'passengers', dest: 'plane-ring', status: 'bell', boarding: 'boarding-pass',
  depart: 'takeoff', time: 'timer', landing: 'landing', baggage: 'suitcase',
};

test('every icon class is drawn from its own file in logos/icons', () => {
  const css = rd('css/font.css');
  assert.match(css, /\.ac-ico::before \{ content:'' !important; display:block; width:1em; height:1em;[^}]*background-color:currentColor;/);
  for (const [cls, file] of Object.entries(MARKS)) {
    const re = new RegExp(`\\.ac-ico-${cls}::before\\s*\\{ -webkit-mask-image:url\\('\\.\\./logos/icons/${file}\\.svg'\\);\\s+mask-image:url\\('\\.\\./logos/icons/${file}\\.svg'\\); \\}`);
    assert.match(css, re, cls);
    assert.ok(fs.existsSync(path.join(ICONS, file + '.svg')), file + '.svg');
  }
});

test('the title badge, the lane arrows and the hotel ads use our files too', () => {
  const over = rd('css/display-overrides.css');
  assert.match(over, /\.fids-banner \.fids-board-icon::before \{[^}]*mask: url\('\.\.\/logos\/icons\/takeoff\.svg'\)/);
  assert.match(over, /\[data-fids-mode="arr"\] \.fids-banner \.fids-board-icon::before \{[^}]*mask-image: url\('\.\.\/logos\/icons\/landing\.svg'\)/);
  assert.match(over, /\.g8-lanes-pd \.g8-pd-arr::before \{[^}]*mask: url\('\.\.\/logos\/icons\/arrow-diagonal\.svg'\)/);
  const ads = rd('css/hotel-ads.css');
  assert.match(ads, /\.axr-loc-pin::before\{[^}]*mask:url\('\.\.\/logos\/icons\/plane\.svg'\)/);
  assert.match(ads, /\.axr-loc-line \+ \.axr-loc-line \.axr-loc-pin::before\{[^}]*mask-image:url\('\.\.\/logos\/icons\/home\.svg'\)/);
});

test('every icon file says where it came from, and the Apache text ships beside the Material ones', () => {
  const files = fs.readdirSync(ICONS).filter((f) => f.endsWith('.svg'));
  assert.equal(files.length, 11);
  let material = 0;
  for (const f of files) {
    const svg = fs.readFileSync(path.join(ICONS, f), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d. ]+"><!-- (Material Symbols \(Google\), Apache License 2\.0|Vecteezy \d+, used under the Vecteezy Pro licence)/, f);
    assert.doesNotMatch(svg, /<image|<text|font-family/, f + ' is plain shapes');
    if (/Material Symbols/.test(svg)) material++;
  }
  assert.equal(material, 6);
  assert.match(fs.readFileSync(path.join(ICONS, 'LICENSE-Apache-2.0.txt'), 'utf8'), /Apache License\s+Version 2\.0, January 2004/);
});

test('on a Porter gate, Porter\'s own art stays and nothing is drawn over it', () => {
  const over = rd('css/display-overrides.css');
  const at = over.indexOf('.ac-ico-boarding::before,\nhtml body[data-gate-airline="PD"]');
  assert.ok(at > 0);
  const rule = over.slice(at, over.indexOf('}', at));
  assert.match(rule, /content: '' !important;\s+display: none !important;/);
  assert.match(over, /\[data-gate-airline="PD"\][^{]* \.ac-ico-boarding \{\s+background-image: url\('\/logos\/airlines\/canadian\/porter\/tickets\.svg'\)/);
});
