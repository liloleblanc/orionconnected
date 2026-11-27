'use strict';
// WHY THIS EXISTS
//
// v24188. A LOGO TAKES ITS PLACE BEFORE ITS PICTURE ARRIVES.
// Reported: on the rotation switch the logos move left to right as a board first
// comes up. An <img> with no size of its own is no wider than nothing until its
// file has loaded, then as wide as the picture, so what stands after it on the line
// moves along when the art lands:
//   - the bags hall line (.b5-l1): the emblem (.b5-emb) took its width late, then
//     each cut of the lettering (.b5-wm), pushing the flight number (.b5-fn) right,
//     and the fit of the line (--b5-k) only ran as each lettering loaded, taking
//     the whole line down a moment later;
//   - the gate band: the wordmark (img.g8-r1-logo) took its width late, and the
//     alliance badge after it jumped right by the width of the wordmark.
// Now the emblem art is a 1em square, every lettering and wordmark img carries the
// shape of its file (LOGO_ASPECT, read from the files by scripts/logo-aspect), and
// the hall fits each line as it is drawn. This file holds the table to the files,
// and each surface to the table.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../scripts/logo-aspect/aspect.js');

const ROOT = path.resolve(__dirname, '..');
const FC = path.join(ROOT, 'fids-current');
const JS = path.join(FC, 'js');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
const BAGS_CSS = fs.readFileSync(path.join(FC, 'css', 'baggage-display.css'), 'utf8');
const bare = (u) => String(u).split('?')[0];
const onDisk = (u) => !!u && /^\/logos\//.test(bare(u)) && fs.existsSync(path.join(FC, bare(u)));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// the whole board script in a page of its own (scripts/logo-aspect/aspect.js, as tests/airline-logos-every-surface.test.js)
const B = A.loadBoard(FC);
const the = (n) => B.__the(n);
const plain = (o) => JSON.parse(JSON.stringify(o));
let TABLE = {};
try { TABLE = plain(the('LOGO_ASPECT')); } catch (e) { /* before v24188 there is no table: every test below says what is missing */ }

// ── 1. the table is the files ──────────────────────────────────────────────
test('LOGO_ASPECT is the shape of every file the hall lettering and the gate wordmark slot can draw, read from the file', () => {
  const files = A.build(FC, B);
  assert.ok(Object.keys(files).length > 200, Object.keys(files).length + ' files');
  assert.deepEqual(TABLE, files, 'stale: run node scripts/logo-aspect/build.js');
  // the block in fids-core.js is exactly what the generator writes (so --check is green)
  const a = CORE.indexOf(A.START), b = CORE.indexOf(A.END);
  assert.ok(a > 0 && b > a, 'the table block is in fids-core.js');
  assert.equal(CORE.slice(a, b + A.END.length), A.render(files));
  assert.deepEqual(A.embedded(CORE), files);
  // every entry a picture of ours on disk, its ratio a finite positive number of four decimals at most
  for (const [k, r] of Object.entries(TABLE)) {
    assert.ok(onDisk(k), k + ' is on disk');
    assert.ok(r > 0 && isFinite(r) && Number(r.toFixed(4)) === r, k + ': ' + r);
  }
  // and no file the board script names nowhere else: outside the table, every one is named
  // (a literal) or built by a resolver the generator asks (wordmarkSrc, starLockupSrc)
  const rest = CORE.slice(0, a) + CORE.slice(b);
  const built = new Set();
  const wordmarkSrc = the('wordmarkSrc'), star = the('starLockupSrc');
  for (const base of new Set(Object.values(plain(the('IATA_TO_WORDMARK'))))) for (const v of ['light', 'dark']) built.add(bare(wordmarkSrc(base, v)));
  for (const code of Object.keys(plain(the('STAR_ALLIANCE_LOCKUP')))) for (const dark of [false, true]) built.add(bare(star(code, dark)));
  assert.deepEqual(Object.keys(TABLE).filter((k) => !rest.includes("'" + k) && !built.has(k)), []);
});

test('the reader takes the shape a browser takes', () => {
  const svg = (attrs) => '<?xml version="1.0"?>\n<!-- <svg width="1" height="9"> -->\n<svg xmlns="http://www.w3.org/2000/svg" ' + attrs + '><path d="M0 0h1"/></svg>';
  assert.equal(A.svgRatio(svg('viewBox="0 0 400 100"')), 4, 'the viewBox alone');
  assert.equal(A.svgRatio(svg('width="300" height="100" viewBox="0 0 400 100"')), 3, 'absolute width and height outrank the viewBox');
  assert.equal(A.svgRatio(svg('width="30mm" height="10mm" viewBox="0 0 1 1"')), 3, 'in millimetres');
  assert.equal(A.svgRatio(svg('width="72pt" height="1in"')), 1, 'mixed absolute units');
  assert.equal(A.svgRatio(svg('width="100%" height="100%" viewBox="2.83 0.64 156.367 22.7275"')), 156.367 / 22.7275, 'a percentage leaves it to the viewBox');
  assert.equal(A.svgRatio(svg('width="500" viewBox="0 0 200 100"')), 2, 'one size alone leaves it to the viewBox');
  assert.equal(A.svgRatio(svg('style="width: 100%; height: auto" viewBox="1.5 1.5 20.97 20.97"')), 1);
  assert.equal(A.svgRatio(svg('style="width:50px;height:25px" width="10" height="10"')), 2, 'the style outranks the attributes');
  assert.equal(A.svgRatio(svg('viewBox="-5.6731e-05 0.000517206 706.003 178.999"')), 706.003 / 178.999, 'exponents and negatives');
  assert.equal(A.svgRatio(svg('width="100%"')), null, 'no shape of its own: no entry');
  assert.equal(A.svgRatio('<html>not a picture</html>'), null);
  // a png of 4 by 2 (its header only), and a webp canvas of 3 by 1
  const png = Buffer.alloc(33); png.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'latin1'); png.writeUInt32BE(4, 16); png.writeUInt32BE(2, 20);
  assert.equal(A.pngRatio(png), 2);
  const webp = Buffer.alloc(30); webp.write('RIFF', 0, 'latin1'); webp.write('WEBP', 8, 'latin1'); webp.write('VP8X', 12, 'latin1'); webp.writeUIntLE(2, 24, 3); webp.writeUIntLE(0, 27, 3);
  assert.equal(A.webpRatio(webp), 3);
  // files whose shape was checked by hand
  assert.equal(TABLE['/logos/airlines/european/edelweiss-wordmark-light.svg'], 8.4851, '132.29167mm by 15.590983mm');
  assert.equal(TABLE['/logos/airlines/us-regional/world-atlantic-wordmark-light.png'], 5.751, '1455 by 253 pixels');
  assert.equal(A.round(A.ratioOf(path.join(FC, 'logos/airlines/us-major/united-100-globe.webp'))), 55, 'a webp of 7370 by 134 pixels');
  assert.equal(A.round(A.ratioOf(path.join(FC, 'logos/airlines/alliances/star-3d.webp'))), 6.4449, 'a webp of 1521 by 236 pixels');
});

// ── 2. every file the two surfaces draw is in the table ──────────────────────
test('every lettering of the hall and every wordmark of the gate band that is on disk has its shape in the table', () => {
  const WM = plain(the('IATA_TO_WORDMARK'));
  const wordmarkSrc = the('wordmarkSrc');
  const wanted = new Set();
  for (const base of new Set(Object.values(WM))) for (const v of ['light', 'dark']) wanted.add(bare(wordmarkSrc(base, v)));
  for (const u of Object.values(plain(the('LOCAL_LOGOS')))) wanted.add(bare(u));                    // carrierLogoUrl
  for (const c of Object.values(plain(the('HERITAGE_CARRIERS')))) if (c && c.mark) wanted.add(bare(c.mark));
  const starSrc = the('starLockupSrc');
  for (const code of Object.keys(plain(the('STAR_ALLIANCE_LOCKUP')))) for (const dark of [false, true]) wanted.add(bare(starSrc(code, dark)));
  // the tables of the gate band itself, which live inside its builder, up to where the
  // emblem beside the wordmark is chosen (that img is drawn at a fixed square size)
  const band = CORE.slice(CORE.indexOf('  var BANNER_DARK_LOGO = {'), CORE.indexOf("  var _bannerEmblemSrc = '';"));
  assert.ok(band.length > 1000 && band.includes('var BANNER_LIGHT_LOGO = {') && band.includes('var BANNER_PLATE_LOGO = {'));
  assert.match(CORE, /return '<img class="g8-r1-emblem" src="' \+ _bannerEmblemSrc \+ '" alt="" style="width:' \+ _embPx \+ 'px;height:' \+ _embPx \+ 'px;/);
  for (const m of band.matchAll(/'(\/logos\/[^'?]+\.(?:svg|png|webp))/g)) wanted.add(m[1]);
  const missing = [...wanted].filter((u) => onDisk(u) && /\.(svg|png|webp)$/i.test(u) && !own(TABLE, u));
  assert.deepEqual(missing, [], 'drawn by a reserved img but not in the table');
  const held = [...wanted].filter((u) => own(TABLE, u)).length;
  assert.ok(held > 200, held + ' of the ' + wanted.size + ' files drawn are reserved');
});

test('the shape is given to the img as aspect-ratio auto R: R until the picture is in, the picture after', () => {
  const box = the('_logoBoxStyle');
  const u = '/logos/airlines/us-major/united-wordmark-light.svg';
  assert.equal(box(u), 'aspect-ratio:auto ' + TABLE[u] + ';');
  assert.equal(box(u + '?v=v24188'), box(u), 'the build token is not part of the file');
  assert.equal(box('/logos/airlines/us-major/no-such-file.svg'), '', 'a file the table does not hold is sized as before');
  assert.equal(box('https://example.com/logos/airlines/us-major/united-wordmark-light.svg'), '', 'nor a picture from anywhere else');
  assert.equal(box(''), '');
});

// ── 3. the hall line ────────────────────────────────────────────────────────
test('the hall line: each cut of the lettering carries the shape of its file before it loads', () => {
  const WM = plain(the('IATA_TO_WORDMARK'));
  const b5 = the('_b5Airline');
  let reserved = 0;
  for (const code of Object.keys(WM)) {
    const html = b5({ airline: code, _airlineName: '' });
    const imgs = [...html.matchAll(/<img class="b5-wm-[nd]"[^>]*>/g)].map((m) => m[0]);
    assert.equal(imgs.length, 2, code + ': both cuts of the lettering');
    for (const img of imgs) {
      const src = bare(/ src="([^"]*)"/.exec(img)[1].replace(/&amp;/g, '&'));
      const st = / style="([^"]*)"/.exec(img);
      if (own(TABLE, src)) { assert.equal(st && st[1], 'aspect-ratio:auto ' + TABLE[src] + ';', code + ': ' + src); reserved++; }
      else assert.equal(st, null, code + ': ' + src + ' is in no table and keeps no style');
      assert.match(img, /onload="_b5WmFit\(this\)" onerror="_b5WmFail\(this\)">$/, code + ': the load still fits the line, and a failed load still types the name');
    }
  }
  assert.ok(reserved > 150, reserved + ' cuts reserved');
  // Air Canada at Moncton, both cuts
  const ac = b5({ airline: 'AC', _airlineName: 'Air Canada' });
  assert.match(ac, /<img class="b5-wm-n" alt="AIR CANADA" src="\/logos\/airlines\/canadian\/air-canada-wordmark-light\.svg\?v=[^"]*" style="aspect-ratio:auto 10\.9834;" onload=/);
});

test('the hall line: the emblem art is a 1em square, as the tags of the strip are', () => {
  // the rule after the one that sized it by its picture (height 1em, width auto up to 1.6em),
  // and as specific as its .full-logo selector, which a tile img also matches
  const at = BAGS_CSS.indexOf('#baggageView .b5 .b5-emb img, #baggageView .b5 .b5-emb .full-logo {');
  const sq = BAGS_CSS.indexOf('#baggageView .b5 .b5-emb img, #baggageView .b5 .b5-emb img.full-logo { width: 1em !important; min-width: 1em !important; max-width: 1em !important; }');
  assert.ok(at > 0 && sq > at, 'the square comes after the rule it overrides');
  assert.match(BAGS_CSS.slice(at, sq), /height: 1em !important;[^}]*max-height: 1em !important;[^}]*object-fit: contain !important;/, 'a square of 1em, the picture whole inside it');
  // a monogram is type: it keeps its own width (the old rule, for .full-logo that is not an img)
  assert.doesNotMatch(BAGS_CSS.slice(sq, sq + 300), /\.b5-emb \.full-logo|\.logo-monogram/);
  // the strip's tags, the model
  assert.match(BAGS_CSS, /#baggageView \.b5 \.b5-temb img, #baggageView \.b5 \.b5-temb \.full-logo \{\s*width: 100% !important; height: 100% !important;/);
});

// a hall in a page of its own: rows whose line is wider than its cell, none of their pictures in yet
function hall(lines) {
  const rows = lines.map(([need, room]) => {
    const props = {};
    const l1 = { scrollWidth: need }, main = { clientWidth: room };
    return {
      props,
      style: { getPropertyValue: (k) => props[k] || '', setProperty: (k, v) => { props[k] = String(v); } },
      querySelector: (s) => (s === '.b5-main' ? main : s === '.b5-l1' ? l1 : null),
      querySelectorAll: () => [],
      closest: () => null,
    };
  });
  const imgs = rows.map((row) => ({ complete: false, naturalWidth: 0, closest: (s) => (s === '.b5-row' ? row : null) }));
  const view = {
    innerHTML: '',
    querySelectorAll: (s) => (s === '.b5-row' ? rows : /b5-wm img/.test(s) ? imgs : []),
    querySelector: () => null,
  };
  return { rows, imgs, view };
}

test('the hall line is fitted as it is drawn, before any picture of it has loaded', () => {
  const h = hall([[1200, 1000], [900, 1000], [1001, 1000]]);
  the('_b5Render')(h.view, 'YQM', new Date());
  assert.match(h.view.innerHTML, /class="b5 /, 'the hall was drawn');
  assert.equal(h.rows[0].props['--b5-k'], '0.833', 'a line too wide is taken down at once, in the frame it is drawn in');
  assert.equal(h.rows[1].props['--b5-k'], undefined, 'a line that fits is left as it is');
  assert.equal(h.rows[2].props['--b5-k'], undefined, 'within a pixel it fits');
  // the load of a lettering fits its line again: nothing to do where it already fits
  h.rows[0].querySelector('.b5-l1').scrollWidth = 1000;
  the('_b5WmFit')(h.imgs[0]);
  assert.equal(h.rows[0].props['--b5-k'], '0.833');
  // and is the backstop where the box was not reserved: a line found too wide when the picture lands
  h.rows[1].querySelector('.b5-l1').scrollWidth = 1250;
  the('_b5WmFit')(h.imgs[1]);
  assert.equal(h.rows[1].props['--b5-k'], '0.800');
});

// ── 4. the gate band ─────────────────────────────────────────────────────────
test('the gate band: the wordmark, and the member lockup, carry the shape of their file before it loads', () => {
  const r1 = /r1LogoHtml = '<img class="g8-r1-logo" src="' \+ r1LogoSrc \+ '" alt="' \+ airlineName \+ '" style="' \+ _logoStyle \+ \(typeof _logoBoxStyle === 'function' \? _logoBoxStyle\(r1LogoSrc\) : ''\) \+ '" onerror="g8LogoFail\(this\)"/;
  assert.match(CORE, r1, 'the img.g8-r1-logo the badge follows');
  const lock = CORE.slice(CORE.indexOf('  function _starLockupOnBand() {'), CORE.indexOf('  function _starLockupOnBand() {') + 1600);
  assert.match(lock, /'flex:0 1 auto !important;display:block !important;'\s*\n\s*\/\/[^\n]*\n\s*\+ \(typeof _logoBoxStyle === 'function' \? _logoBoxStyle\(src\) : ''\) \+ '"'/);
  // the inline style of the wordmark sets its height and leaves its width to the shape:
  // width:auto, so the aspect-ratio decides it, before and after the load alike
  assert.match(CORE, /var _logoStyle = 'height:' \+ _logoH \+ 'px !important;max-height:' \+ _logoH \+ 'px !important;'\n\s*\+ 'width:auto;max-width:/);
  // the slot it reserves for, in the order the band draws: wordmark, then the badge
  assert.match(CORE, /return r1LogoHtml \+ _skyTeamOnBand\(starHtml\);/);
});
