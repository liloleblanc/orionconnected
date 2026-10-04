'use strict';

// v23950 — THE STREAM SHOWS THE FONT THE AIRPORT IS ASSIGNED, LIKE THE BOARD.
//
// Reported: the fonts on the stream were not the ones assigned on the live
// boards; AC Nord showed on the stream where an airport's live board had
// been moved to another face. Measured on v23942/43: display-overrides.css
// carried two rules under html.fids-stream — a `--font-primary` and a
// `font-family: … !important` sweep over every element — that set AC Nord on
// every board inside a stream=1 URL. The Moncton stream showed AC Nord while
// Moncton's live board showed its assigned Cabinet Grotesk; any touring
// stream that forwards stream=1 did the same to every airport.
//
// Both rules are gone, so a stream board resolves its font with the same code
// as a wall board: the airport's assigned font, or the board default when
// none is assigned. Accor's own ads keep their brand face.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', 'fids-current');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CSS_DIR = path.join(ROOT, 'css');
const CSS_FILES = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));

// A plain scan rather than a regex: display-overrides.css is ~3 MB, and a
// lazy /\*[\s\S]*?\*\// over it exhausts V8's regexp backtracking stack.
function stripComments(css) {
  let out = '';
  let i = 0;
  for (;;) {
    const open = css.indexOf('/*', i);
    if (open < 0) return out + css.slice(i);
    out += css.slice(i, open);
    const close = css.indexOf('*/', open + 2);
    if (close < 0) return out;
    i = close + 2;
  }
}
// Innermost `selector { declarations }` pairs — @media wrappers fall away
// because their bodies contain braces and the pattern never spans one.
function rules(css) {
  const out = [];
  const src = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}
const inlineStyles = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');

test('no stream-only rule sets a font: a stream board resolves its font like a wall board', () => {
  const sources = CSS_FILES.map((f) => ({ name: 'css/' + f, css: read('css/' + f) }));
  for (const page of ['fids.html', 'gids.html', 'bids.html', 'rotate.html']) {
    sources.push({ name: page + ' <style>', css: inlineStyles(read(page)) });
  }
  const offenders = [];
  for (const { name, css } of sources) {
    for (const r of rules(css)) {
      if (!/fids-stream/.test(r.sel)) continue;
      if (/--font-primary\s*:/.test(r.body)) offenders.push(name + ': ' + r.sel.slice(0, 90) + ' sets --font-primary');
      const fam = r.body.match(/font-family\s*:\s*([^;]+)/);
      // The one allowed case: the AC icon glyphs stay on their icon font.
      if (fam && !/^'ac-icons'/.test(fam[1].trim())) offenders.push(name + ': ' + r.sel.slice(0, 90) + ' sets font-family ' + fam[1].trim());
    }
  }
  assert.deepEqual(offenders, [],
    'a stream must show the font the airport is assigned; a stream-only font rule ' +
    'is how AC Nord stayed on the stream after it left the boards');
});

test('the boards still mark a stream, so the rest of stream mode is unchanged', () => {
  // Removing the font rules must not have taken stream mode with it.
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    assert.match(read(page), /fids-stream/, page + ' must still add the fids-stream class');
  }
  assert.match(read('css/display-overrides.css'), /html\.fids-stream \.ctrl,/,
    'stream mode still hides the operator chrome');
});

test('Accor\'s own ads keep their brand face', () => {
  const ads = read('css/hotel-ads.css');
  assert.match(ads, /--axr-display:\s*"AC Nord Display"/,
    'the .axr ads are Accor\'s and stay in AC Nord, on the stream and off it');
  for (const r of rules(ads)) {
    const fam = r.body.match(/font-family\s*:\s*([^;]+)/);
    if (fam && /AC Nord/i.test(fam[1])) assert.match(r.sel, /\.axr/, 'AC Nord in hotel-ads.css only inside .axr: ' + r.sel);
  }
});
