'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23937 — THE GREEN "LIVE" DOT IS SOLID.
//
// The toolbar's LIVE dot blinked (fids.css: `blink 1.5s`, down to 10% opacity)
// and shared.css had a second copy that pulsed (`livePulse 2s`). A light that
// blinks on a board reads as a status change; this one only says the feed is
// live. It holds still, in both copies, and nothing re-animates it.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUB = path.resolve(__dirname, '..', 'fids-current');
const read = (p) => fs.readFileSync(path.join(PUB, p), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule (selector, body) in a stylesheet whose selector names .live-dot. */
function liveDotRules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(strip(css)))) {
    if (/\.live-dot\b/.test(m[1])) out.push({ sel: m[1].trim(), body: m[2] });
  }
  return out;
}

test('both copies of the dot hold still', () => {
  for (const f of ['css/fids.css', 'css/shared.css']) {
    const rules = liveDotRules(read(f));
    assert.ok(rules.length >= 1, `${f} styles .live-dot`);
    for (const r of rules) {
      const anim = r.body.match(/animation(?:-name)?\s*:\s*([^;]+)/g) || [];
      assert.ok(anim.length >= 1, `${f} ${r.sel} says animation: none outright, so no other sheet's animation can reach it`);
      for (const a of anim) assert.match(a, /:\s*none\s*(!important)?\s*$/, `${f} ${r.sel}: ${a}`);
    }
  }
  assert.doesNotMatch(strip(read('css/fids.css')), /@keyframes blink\b/, 'the blink keyframes are gone');
  assert.doesNotMatch(strip(read('css/shared.css')), /@keyframes livePulse\b/, 'the pulse keyframes are gone');
});

test('no stylesheet or script animates the dot anywhere else', () => {
  const css = fs.readdirSync(path.join(PUB, 'css')).filter((f) => f.endsWith('.css'));
  for (const f of css) {
    for (const r of liveDotRules(read('css/' + f))) {
      for (const a of r.body.match(/animation(?:-name)?\s*:\s*([^;]+)/g) || []) {
        assert.match(a, /:\s*none\s*(!important)?\s*$/, `css/${f} ${r.sel} animates the LIVE dot: ${a}`);
      }
    }
  }
  for (const f of ['js/fids-core.js', 'js/fids-v2.js', 'js/menubar.js', 'fids.html', 'gids.html', 'bids.html']) {
    const src = read(f);
    let at = -1;
    while ((at = src.indexOf('live-dot', at + 1)) >= 0) {
      const near = src.slice(at, at + 200);
      assert.doesNotMatch(near, /animation|classList\.add\(['"](blink|pulse)/i, `${f} re-animates the LIVE dot`);
    }
  }
});

test('the boards fetch the new stylesheets, not a cached blinking one', () => {
  for (const p of ['fids.html', 'gids.html', 'bids.html']) {
    const html = read(p);
    for (const sheet of ['css/fids.css', 'css/shared.css']) {
      const m = html.match(new RegExp(sheet.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '\\?v=(\\d+)'));
      assert.ok(m, `${p} loads ${sheet} with a cache buster`);
      assert.ok(+m[1] >= 23937, `${p} must bust ${sheet} past the blinking version (v=${m[1]})`);
    }
  }
});

test('the companion app\'s "Live departures" dot holds still too', () => {
  // The same light on the phone app (app.html .hint .live) pulsed a ring
  // every 2.4 s. It is the same signal, so it follows the same rule.
  const css = strip(read('app.html').match(/<style>([\s\S]*?)<\/style>/)[1]);
  const rule = css.match(/\.hint \.live\s*\{([^}]*)\}/);
  assert.ok(rule, 'app.html styles the Live departures dot');
  const anim = rule[1].match(/animation(?:-name)?\s*:\s*([^;]+)/g) || [];
  assert.ok(anim.length >= 1, 'it says animation: none outright');
  for (const a of anim) assert.match(a, /:\s*none\s*$/, `app.html .hint .live: ${a}`);
  assert.doesNotMatch(css, /@keyframes pulse\b/, 'the pulse keyframes are gone');
});
