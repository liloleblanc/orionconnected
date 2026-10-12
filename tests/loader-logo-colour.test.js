'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE LOADING SCREENS DRAW THE LOGO IN ITS OWN COLOURS, AT THE RAIL'S WIDTH.
//
// v24042 — every loading screen (the F.I.D.S., G.A.T.E. and B.A.G.S. boot
// loaders, the index entry screen, the display picker) drew
// orion-connected-white.svg, which carries charcoal ink whatever its name
// says, forced flat white by brightness(0) invert(1), inside a square box
// that is mostly empty: about 90px of artwork in a 262px rail, and the gold
// planets and stars came out white.
//
// They now draw orion-connected-on-dark.svg: the official colour logo's
// paths, the lettering, orbit, aircraft and trail white for the dark rail,
// the planets and stars in their own gold, no backing shape, cropped to the
// artwork. The rule for a logo on a dark ground is white lettering, never a
// white box behind it, and an emblem is never whitened.
//
// The loader block is copied by hand into five pages, so one stray copy of
// the old filter would turn the gold white again without anyone noticing.
// This guard fails if:
//   1. a page's loader logo draws any other file;
//   2. any rule, in a page's <style> or in a stylesheet, puts a filter other
//      than none on a loader logo, or a ground behind it;
//   3. a script writes a filter onto a loader logo;
//   4. the asset gains a backing shape, loses its gold, draws its lettering
//      in anything but white, or stops being the official logo's paths;
//   5. the logo goes back into a small fixed box beside a landscape board, or
//      the stacked (portrait) cap stops looking at the screen's height, or the
//      entry screen stops scrolling when it is taller than a small phone.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUB = path.join(path.resolve(__dirname, '..'), 'fids-current');
const read = (rel) => fs.readFileSync(path.join(PUB, rel), 'utf8');

const ASSET_URL = '/logos/brand/orion-connected-on-dark.svg';
const ASSET = read('logos/brand/orion-connected-on-dark.svg');
const OFFICIAL = read('logos/brand/orion-connected-colors.svg');
const GOLD = ['#e0a022', '#deb71b'];

// The five pages and the element each one's loader lives in.
const PAGES = [
  ['fids.html', '#fidsLoader'],
  ['gids.html', '#fidsLoader'],
  ['bids.html', '#fidsLoader'],
  ['index.html', '#entryScreen'],
  ['picker.html', '#pickerScreen'],
];

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** Every innermost `selector { body }` rule of a stylesheet (inside @media too). */
function rules(css) {
  const src = stripComments(css);
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
}
const styleBlocks = (html) => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi)].map((m) => m[1]);
const scriptBlocks = (html) => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map((m) => m[1]);
/** The value of each `prop:` declaration in a rule body. */
const decls = (body, prop) =>
  [...body.matchAll(new RegExp('(?:^|[;\\s{])' + prop.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&') + '\\s*:\\s*([^;]+)', 'gi'))].map((m) => m[1].trim());
/** A selector that reaches a loader logo or the brand block it sits in. */
const isLoaderLogoSel = (sel) => /\.ocb-logo\b|\.ocb-brand\b/.test(sel) || (/loader/i.test(sel) && /logo/i.test(sel));

test('1. every loading screen draws orion-connected-on-dark.svg', () => {
  for (const [page] of PAGES) {
    const html = read(page);
    const imgs = [...html.matchAll(/<img\b[^>]*\bclass="[^"]*\bocb-logo\b[^"]*"[^>]*>/gi)].map((m) => m[0]);
    assert.ok(imgs.length >= 1, page + ': its loader must draw the logo (.ocb-logo)');
    for (const tag of imgs) {
      const src = (tag.match(/\bsrc="([^"]*)"/) || [])[1];
      assert.equal(src, ASSET_URL, page + ': the loader logo must be ' + ASSET_URL + ', not ' + src);
    }
  }
});

test('2. no rule whitens a loader logo or puts a ground behind it', () => {
  const sheets = [];
  for (const [page] of PAGES) styleBlocks(read(page)).forEach((css, i) => sheets.push([page + ' <style> #' + (i + 1), css]));
  for (const f of fs.readdirSync(path.join(PUB, 'css')).filter((f) => f.endsWith('.css'))) sheets.push(['css/' + f, read('css/' + f)]);
  let seen = 0;
  for (const [where, css] of sheets) {
    for (const r of rules(css)) {
      if (!isLoaderLogoSel(r.sel)) continue;
      seen++;
      for (const prop of ['filter', '-webkit-filter']) {
        for (const v of decls(r.body, prop)) {
          assert.match(v, /^none(\s*!important)?$/i,
            where + ': "' + r.sel + '" sets ' + prop + ': ' + v + ' — a filter on the loader logo flattens its gold (only none is allowed)');
        }
      }
      for (const prop of ['background', 'background-color', 'background-image']) {
        for (const v of decls(r.body, prop)) {
          assert.match(v, /^(none|transparent)(\s*!important)?$/i,
            where + ': "' + r.sel + '" gives the loader logo a ground (' + prop + ': ' + v + ') — white lettering, never a box behind it');
        }
      }
      for (const v of decls(r.body, 'box-shadow')) {
        assert.ok(!/\binset\b/i.test(v), where + ': "' + r.sel + '" fills the logo\'s box with an inset shadow');
      }
    }
  }
  assert.ok(seen >= PAGES.length, 'the loader logo rules must be found (found ' + seen + ')');
});

test('3. no script writes a filter onto a loader logo', () => {
  const scripts = [];
  for (const [page] of PAGES) scriptBlocks(read(page)).forEach((js, i) => scripts.push([page + ' <script> #' + (i + 1), js]));
  for (const f of fs.readdirSync(path.join(PUB, 'js')).filter((f) => f.endsWith('.js'))) scripts.push(['js/' + f, read('js/' + f)]);
  for (const [where, js] of scripts) {
    js.split('\n').forEach((line, i) => {
      if (/ocb-logo|loader-logo/.test(line)) {
        assert.ok(!/filter|invert\(|brightness\(/i.test(line),
          where + ':' + (i + 1) + ' writes a filter onto the loader logo: ' + line.trim());
      }
    });
  }
});

test('4. the asset is the official logo for a dark ground: white lettering, gold planets and stars, no box', () => {
  // Nothing but paths: no backing rect, no bitmap, no filter, no stylesheet.
  const tags = [...ASSET.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1].toLowerCase());
  for (const t of tags) assert.ok(t === 'svg' || t === 'path', 'orion-connected-on-dark.svg must hold only paths, found <' + t + '>');
  const svgTag = ASSET.match(/<svg\b[^>]*>/)[0];
  assert.ok(!/\bstyle=|\bfill=|\bfilter=/.test(svgTag), 'the <svg> itself must carry no style, fill or filter (a ground behind the logo)');

  const mine = [...ASSET.matchAll(/<path d="([^"]*)" fill="([^"]*)"\/>/g)].map((m) => ({ d: m[1], fill: m[2].toLowerCase() }));
  assert.equal(mine.length, (ASSET.match(/<path\b/g) || []).length, 'every path must carry one plain fill');
  const official = [...OFFICIAL.matchAll(/<path d="([^"]*)" style="fill:([^;"]*);"\/>/g)].map((m) => ({ d: m[1], fill: m[2].toLowerCase() }));
  assert.ok(official.length > 20, 'the official colour logo must be readable');
  assert.equal(mine.length, official.length, 'the asset must draw every path of the official colour logo, and nothing more');
  official.forEach((o, i) => {
    assert.equal(mine[i].d, o.d, 'path ' + (i + 1) + ' must be the official logo\'s path, unchanged');
    if (GOLD.includes(o.fill)) assert.equal(mine[i].fill, o.fill, 'path ' + (i + 1) + ' is a planet or star: it keeps its gold ' + o.fill);
    else assert.equal(mine[i].fill, '#fff', 'path ' + (i + 1) + ' (lettering, orbit, aircraft, trail; ' + o.fill + ' in the official file) must be white on the dark rail');
  });
  for (const g of GOLD) assert.ok(mine.some((p) => p.fill === g), 'the asset must keep the gold ' + g);

  // Cropped to the artwork, and the pages reserve the same shape for it.
  const vb = svgTag.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
  for (const [page] of PAGES) {
    const css = styleBlocks(read(page)).join('\n');
    const ar = css.match(/\.ocb-logo\s*\{[^}]*aspect-ratio\s*:\s*(\d+)\s*\/\s*(\d+)/);
    assert.ok(ar, page + ': the loader logo must reserve its aspect ratio');
    assert.equal(+ar[1] / +ar[2], vb[2] / vb[3], page + ': the reserved aspect ratio must be the asset\'s viewBox');
  }
});

test('5. the logo fills the rail, a portrait screen caps it by height, and the entry screen scrolls', () => {
  for (const [page, scope] of PAGES) {
    const css = stripComments(styleBlocks(read(page)).join('\n'));
    const esc = scope.replace('#', '\\#');
    const base = css.match(new RegExp(esc + '\\s+\\.ocb-logo\\s*\\{([^}]*)\\}'));
    assert.ok(base, page + ': the loader logo rule must exist');
    assert.match(base[1], /(^|[;\s{])width\s*:\s*100%/, page + ': beside a landscape board the logo is the rail\'s width, not a small box');
    const stacked = css.match(/@media\s*\(\s*max-aspect-ratio\s*:\s*1\s*\/\s*1\s*\)\s*\{([\s\S]*?)\n\s*\}/);
    assert.ok(stacked, page + ': the stacked (portrait) layout must exist');
    const cap = stacked[1].match(new RegExp(esc + '\\s+\\.ocb-logo\\s*\\{([^}]*)\\}'));
    assert.ok(cap, page + ': stacked, the logo must be capped (the rail is the screen\'s whole width)');
    assert.match(cap[1], /width\s*:\s*min\([^;]*\d+(\.\d+)?vh/, page + ': stacked, the cap must include the screen\'s height so a short phone keeps the rest in view');
    if (page === 'index.html' || page === 'picker.html') {
      assert.match(stacked[1], new RegExp(esc + '\\s+\\.ocb\\s*\\{[^}]*overflow(-y)?\\s*:\\s*auto'),
        page + ': stacked, the screen must scroll when it is taller than the phone, never cut its last lines off');
    }
  }
});
