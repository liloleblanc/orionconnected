'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EARTH, NOW — how the floor is wired into the boards
//
//   · only the departures and arrivals page loads it, after the core and the
//     coordinates, on the build's own version;
//   · it has its off switch, and it pauses with the board (_ocEvery, _ocIdle);
//   · no screen ever asks NASA for anything: the pictures are ours;
//   · its stylesheet retires the old backdrop only behind data-fids-floor,
//     leaves Orlando and the belts alone, never animates, gives way to reduced
//     motion, and sits before the weather card's block, which stays last;
//   · the Customize choice travels: panel, cloud fields, the core's layers.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'fids-current');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MOD = rd('fids-current/js/fids-earth.js');
const CORE = rd('fids-current/js/fids-core.js');
const CSS = rd('fids-current/css/display-overrides.css');
const TAG = /var FIDS_BUILD_TAG = 'v(\d+)'/.exec(CORE)[1];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'earth') walk(p, out); } else out.push(p);
  }
  return out;
}
// a script or page with its comments taken out (a URL in a string keeps its //)
function code(text) {
  // block and HTML comments out until nothing changes (one removal can join a
  // new marker), then line comments
  let prev;
  do {
    prev = text;
    text = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  } while (text !== prev);
  return text.replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

test('only the departures and arrivals page loads the floor, after the core and the coordinates, on the build version', () => {
  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
  for (const p of pages) {
    const html = fs.readFileSync(path.join(SITE, p), 'utf8');
    if (p === 'fids.html') continue;
    assert.doesNotMatch(html, /<script[^>]*fids-earth\.js/, p + ' loads the floor');
  }
  const html = rd('fids-current/fids.html');
  const tags = [...html.matchAll(/<script src="js\/([\w.-]+)\?v=(\d+)"/g)].map((m) => ({ f: m[1], v: m[2], at: m.index }));
  const at = (f) => tags.findIndex((t) => t.f === f);
  assert.equal(tags.filter((t) => t.f === 'fids-earth.js').length, 1);
  assert.ok(at('fids-earth.js') > at('fids-core.js'), 'after fids-core.js');
  assert.ok(at('fids-earth.js') > at('airport-coords.js'), 'after airport-coords.js');
  assert.ok(at('fids-earth.js') > at('fids-sun.js'), 'after fids-sun.js');
  assert.equal(tags[at('fids-earth.js')].v, TAG, 'the same ?v= as FIDS_BUILD_TAG');
});

test('the floor has its off switch and pauses with the board', () => {
  assert.match(MOD, /\n\s*var EARTH_FLOOR_ON = (true|false);/, 'the switch is a plain constant near the top');
  assert.ok(MOD.indexOf('var EARTH_FLOOR_ON') < MOD.indexOf('var RAD'), 'the first thing the file declares');
  assert.match(MOD, /if \(!EARTH_FLOOR_ON \|\| root\.__ocFloor\) return;/, 'off means nothing runs');
  assert.match(MOD, /root\._ocEvery\(measure, 1000\)/, 'the loop runs on _ocEvery');
  assert.match(MOD, /root\._ocIdle\(\)/, 'nothing is built while the rotator hides the board');
  assert.match(MOD, /doc\.hidden/, 'nor while the document is hidden');
  assert.match(MOD, /setAttribute\('data-fids-floor', 'earth'\)/);
  assert.match(MOD, /removeAttribute\('data-fids-floor'\)/, 'a failure brings the old backdrop back');
  assert.match(MOD, /RETRY_MS = 600000/, 'a floor with no picture is tried again after 10 minutes');
  // a busy board whose rows leave under 28 px shows its plain ground, never a
  // sliver of the old picture; but not while a failed floor waits to retry
  assert.match(MOD, /if \(md === 'none' && !painted && shows && here && pageW >= MIN_PAGE_W && W >= MIN_W && H < MIN_ANY && Date\.now\(\) >= retryAt\) setPainted\(true\);/);
  assert.match(MOD, /'aria-hidden', 'true'/);
  // it never writes to the rows
  assert.doesNotMatch(code(MOD), /fidsTable[^;\n]*\.(innerHTML|textContent|style|classList|setAttribute)/);
});

test('no screen asks NASA for anything: the pictures are on our own origin', () => {
  const screens = walk(SITE, []).filter((f) => /\.(js|html|css|json)$/.test(f) && !/credits\.html$/.test(f));
  for (const f of screens) {
    const text = code(fs.readFileSync(f, 'utf8'));
    assert.doesNotMatch(text, /nasa\.gov|earthdata|gibs\./i, path.relative(ROOT, f));
  }
  // the module asks for nothing but its own squares and the SVG namespace
  const urls = (code(MOD).match(/https?:\/\/[^\s'"]+/g) || []);
  assert.deepEqual([...new Set(urls)], ['http://www.w3.org/2000/svg']);
  assert.match(MOD, /var BASE = '\/earth\/v1\/';/);
  assert.doesNotMatch(MOD, /__ocfEarthBase|earthsrc/, 'no preview switch to another source');
  // the Credits page only links to NASA, for the credit
  const credits = rd('fids-current/credits.html');
  for (const m of credits.matchAll(/(src|href)="([^"]*nasa\.gov[^"]*)"/g)) assert.equal(m[1], 'href', 'a link, never a fetch: ' + m[2]);
});

test('the stylesheet: behind the switch, Orlando and the belts untouched, still, and before the weather card block', () => {
  const start = CSS.indexOf('/* ══ EARTH, NOW');
  const wx = CSS.indexOf("/* ══ v24014 — THE WEATHER CARD IN THE AIRLINE'S COLOURS");
  assert.ok(start > 0 && wx > start, 'the block sits before the v24014 block');
  assert.equal(CSS.indexOf('/* ══ EARTH, NOW', start + 1), -1, 'one block');
  // the v24014 block stays last: no other top-level block after it
  assert.doesNotMatch(CSS.slice(wx + 10), /\n\/\* ══ /);
  const block = CSS.slice(start, wx);
  assert.doesNotMatch(block, /['"]/, 'no quote marks in the block');
  // nothing moves in the stylesheet: hidden until painted, and the one fade-in
  // is the module's, skipped for reduced motion
  assert.doesNotMatch(block, /@keyframes|animation|transition|opacity: 0[;\s]/, 'nothing moves');
  assert.match(block, /#ocFloor:not\(\.ready\) > canvas,\s*#ocFloor:not\(\.ready\) > svg \{\s*visibility: hidden;/);
  assert.match(MOD, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(MOD, /if \(!still && layer\.animate\) layer\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: 2400/);
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(rules, /bidsv2-screen/, 'the belts keep their backdrop');
  for (const m of rules.matchAll(/([^{}]+)\{([^{}]*background-image[^{}]*)\}/g)) {
    for (const sel of m[1].split(',')) {
      assert.match(sel, /^\s*html\[data-fids-floor=earth\]/, 'behind the switch: ' + sel.trim().slice(0, 60));
      assert.match(sel, /data-fids-ap=YQM|:not\(\[data-fids-ap=MCO\]\)/, 'Moncton, or anywhere but Orlando: ' + sel.trim().slice(0, 60));
    }
  }
  // and both old pictures are still in the file, for rollback
  assert.match(CSS, /moncton-skyline\.svg/);
  assert.match(CSS, /fids-world-network\.png/);
  // the floor never shows on a phone, and never takes the pointer
  assert.match(rules, /@media \(max-width: 800px\) \{\s*#ocFloor \{ display: none; \}/);
  assert.match(rules, /pointer-events: none/);
  assert.match(rules, /z-index: -1/);
  // the names are placed from their left end, so the layer reads left to
  // right on an Arabic board too
  assert.match(rules, /#fidsBoard > \.content-area > #ocFloor \{[^}]*direction: ltr;/);
});

test('the Customize choice travels: panel, cloud, and the board layers', () => {
  const menuHtml = rd('fids-current/menu.html'), menuJs = rd('fids-current/js/menu.js'), proxy = rd('workers/fids-proxy.js');
  assert.match(menuHtml, /<select class="sm-select" id="cuFloor" onchange="cuApplyAndSave\(\)">/);
  assert.match(menuHtml, /<option value="">Earth, now \(default\)/);
  assert.match(menuHtml, /<option value="classic">Classic/);
  // the panel reads the field only once it has painted it, and carries it forward otherwise
  assert.match(menuJs, /if \(fl && fl\.dataset\.painted === '1'\) p\.floor = fl\.value;/);
  assert.match(menuJs, /fl\.dataset\.painted = '1';/);
  assert.match(menuJs, /if \(prefs\.floor !== undefined\) body\.floor = prefs\.floor;/, 'the cloud save sends it');
  assert.match(menuJs, /_cuSyncNote\('floorDropped'\)/, 'a cloud that did not keep it says so');
  assert.match(menuJs, /floorDropped: \[/);
  // the cloud stores it, and only a value the boards know
  assert.match(proxy, /\n\s*"floor",/);
  assert.match(proxy, /if \(cfg\.floor !== undefined && !\["", "earth", "classic"\]\.includes\(cfg\.floor\)\) delete cfg\.floor;/);
  // the core sheds a device's copy for a newer cloud save, and sets the layer the module reads
  assert.match(CORE, /_cloudOwned\.push\('floor'\);/);
  assert.match(CORE, /var _fl = _flUrl !== null \? _flUrl : _pref\('floor'\);/);
  assert.match(CORE, /setAttribute\('data-fids-floor-pref', _fl === 'classic' \? 'classic' : 'earth'\)/);
  assert.match(MOD, /getAttribute\('data-fids-floor-pref'\) !== 'classic'/);
  assert.match(MOD, /get\('floor'\)/, '?floor= works on one screen');
});

test('the Credits page names the pictures, in the store words, with no NASA insignia', () => {
  const credits = rd('fids-current/credits.html');
  const BS = require(path.join(SITE, 'js', 'board-strings.js'));
  assert.match(credits, /<h3 id="c-earth" data-i18n="credEarthH" data-i18n-one>/);
  assert.match(credits, /<p data-i18n="credNasa" data-i18n-one>/);
  for (const l of BS.LANGS) {
    const s = BS.bs('credNasa', l);
    assert.match(s, /Blue\u00a0Marble\u00a0Next\u00a0Generation/, l);
    assert.match(s, /Black\u00a0Marble\u00a02016/, l);
    assert.ok(BS.bs('credEarthH', l), l);
  }
  assert.match(BS.bs('credNasa', 'en'), /NASA does not endorse these boards\./);
  // the credit the pictures ask for, quoted in every language: NASA Earth
  // Observatory (asked by the Blue Marble: Next Generation page) and NASA's
  // Goddard Space Flight Center (the Black Marble 2016 night lights, NASA SVS)
  assert.match(credits, /<blockquote data-i18n="credNasaLine" data-i18n-one>/);
  for (const l of BS.LANGS) {
    const q = BS.bs('credNasaLine', l);
    assert.match(q, /NASA[\s\u00a0]Earth[\s\u00a0]Observatory/, l);
  }
  assert.match(BS.bs('credNasaLine', 'en'), /NASA’s Goddard[\s\u00a0]Space[\s\u00a0]Flight[\s\u00a0]Center/);
  assert.doesNotMatch(credits, /<img[^>]*nasa|meatball|insignia/i);
});

test('a page change never blanks the floor: the one on screen stays until the next is lit, sizes settle, a rotation is kept', () => {
  const sel = MOD.slice(MOD.indexOf('function select(key, md, view)'), MOD.indexOf('function rebuild(e)'));
  assert.ok(sel.length > 200, 'select() is where it was');
  const miss = sel.slice(sel.indexOf('a floor not seen yet'));
  assert.doesNotMatch(miss.slice(0, miss.indexOf('build(e,')), /showCanvas\(null\)|svg\.textContent = ''/, 'nothing is cleared before the build');
  assert.match(miss, /shade\(e, function \(\) \{\s*if \(cur !== e\) return;\s*showCanvas\(e\.cv\); drawOverlay\(\); becomeReady\(\);/, 'the new floor goes up in one step once lit');
  assert.match(sel, /return;\s+\/\/ still being lit: the floor on screen stays/);
  // one step: the new planet is put in before the old one is taken out
  assert.match(MOD, /if \(cv\) layer\.insertBefore\(cv, \(shown && shown\.parentNode === layer\) \? shown : svg\);\s*if \(shown && shown\.parentNode\) shown\.parentNode\.removeChild\(shown\);/);
  // the planet and its names stand at the foot of the layer at their own size
  assert.match(MOD, /cv\.style\.width = W \+ 'px'; cv\.style\.height = H \+ 'px';/);
  assert.match(MOD, /svg\.style\.width = W \+ 'px'; svg\.style\.height = H \+ 'px';/);
  const block = CSS.slice(CSS.indexOf('/* ══ EARTH, NOW'), CSS.indexOf("/* ══ v24014 — THE WEATHER CARD IN THE AIRLINE'S COLOURS"));
  assert.match(block.replace(/\/\*[\s\S]*?\*\//g, ''), /#ocFloor > canvas,\s*#ocFloor > svg \{[^}]*bottom: 0;/);
  // a new size is acted on once it has held 3 s, or at once when its lit floor is at hand
  assert.match(MOD, /var SETTLE_MS = 3000;/);
  assert.match(MOD, /if \(!shown \|\| now - pend\.at >= SETTLE_MS \|\| readyFor\(planFor\(w, h, shows, pageW\)\.key\)\) \{ W = w; H = h; pend = null; \}/);
  // one view per direction, fitted to the whole rotation's places, never one page's
  assert.match(MOD, /shapersOf\(shapeStore\[dir\], P\.list\)/);
  assert.doesNotMatch(MOD, /chooseView\(here, viewPlaces\(/);
  // the cache holds a rotation, and never lets go of the floor on screen or the one replacing it
  assert.match(MOD, /var CACHE_MAX = 8;/);
  assert.match(MOD, /var CACHE_BYTES = 40e6;/);
  assert.match(MOD, /var keep = function \(x\) \{ return x === cur \|\| x\.cv === shown; \};/);
  assert.match(MOD, /function drop\(x\) \{ x\.day = x\.night = null; x\.dropped = true; if \(x\.cv !== shown\)/);
  // a floor kept up in a space of another height shows no band of flat
  // ground and no hard edge: its own sky above it, or its cut top turned
  // into the ground; within the 6 px a size allows nothing is added
  assert.match(MOD, /if \(shown && fh && gap > 6\) \{\s*bg = 'linear-gradient\(rgb\(' \+ ground\.join/);
  assert.match(MOD, /\} else if \(shown && fh && gap < -6\) \{\s*mask = 'linear-gradient\(transparent 0px, #000 ' \+ f \+ 'px\)';/);
});
