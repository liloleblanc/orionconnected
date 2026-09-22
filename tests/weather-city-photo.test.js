'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23849 — THE CITY ON THE PLATE.
//
// Each plate on the weather card's first screen carries a photograph of its
// city under the readings, with the weather drawn over it in CSS. The
// roster's airports ship with a curated picture under /logos/cities/; an
// airport outside the set asks the Worker's /citypic, which looks a picture
// up once (Pixabay, fetched and kept, never hotlinked) and answers 404 when
// it has no key or no picture, leaving the plate on its glass.
//
// What these tests pin: the curated table and the files agree exactly; the
// resolver's three answers; the plate's layers and their stacking; every
// falling loop is seamless by construction (its tiles divide its travel);
// the route keeps the key out of the source, never serves a third-party URL
// to the board, and degrades to 404 rather than an error.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current/css/display-overrides.css'), 'utf8');
const WORKER = fs.readFileSync(path.join(ROOT, 'worker-entry.js'), 'utf8');
const CITIES = path.join(ROOT, 'fids-current/logos/cities');

/** The source of `var <name> = function (...) {...};` — braces walked, not guessed. */
function fnSource(name) {
  const at = SRC.indexOf('var ' + name + ' = function');
  assert.ok(at >= 0, name + ' must be defined');
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(SRC.indexOf('=', at) + 1, k + 1); }
  }
  assert.fail('unbalanced ' + name);
}
function table(name) {
  const m = SRC.match(new RegExp('var ' + (name || '_WX_CITY_PICS') + ' = (\\{[\\s\\S]*?\\});'));
  assert.ok(m, (name || '_WX_CITY_PICS') + ' must be defined');
  return new Function('return ' + m[1])();
}

test('the curated table and the files on disk agree exactly', () => {
  const t = table();
  const n = table('_WX_CITY_NIGHT');
  const all = fs.readdirSync(CITIES).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4));
  const files = all.filter(f => !f.endsWith('-night')).sort();
  const nightFiles = all.filter(f => f.endsWith('-night')).map(f => f.slice(0, -6)).sort();
  const curated = Object.keys(t).filter(k => t[k] === 1).sort();
  assert.deepEqual(curated, files, 'every curated code has a day file and every day file a code');
  // The night set is its own table and its own files, and it is allowed to be
  // smaller: a city with no night picture keeps its day one, which is what the
  // board did before there were any.
  assert.deepEqual(Object.keys(n).filter(k => n[k] === 1).sort(), nightFiles, 'every night code has a file and every night file a code');
  for (const [tbl, label] of [[t, 'day'], [n, 'night']]) {
    for (const k of Object.keys(tbl)) {
      if (tbl[k] !== 1) assert.equal(tbl[tbl[k]], 1, k + ' aliases ' + tbl[k] + ' in the ' + label + ' set, which must itself be curated');
    }
  }
  for (const k of Object.keys(n)) assert.ok(t[k], k + ' has a night picture but no day entry');
  assert.deepEqual(Object.keys(t).filter(k => t[k] === 'NYC').sort(), ['EWR', 'JFK', 'LGA'], 'the three New York fields share one picture');
  assert.ok(files.length >= 39, 'the roster set is at least the 39 cities gathered');
});

test('every curated photograph is a 1280×720 JPEG under 400 KB', () => {
  for (const f of fs.readdirSync(CITIES).filter(f => f.endsWith('.jpg'))) {
    const b = fs.readFileSync(path.join(CITIES, f));
    assert.ok(b.length < 400 * 1024, f + ' is ' + b.length + ' bytes');
    assert.equal(b.readUInt16BE(0), 0xFFD8, f + ' starts as a JPEG');
    // Walk the markers to the first start-of-frame for the dimensions.
    let i = 2, dims = null;
    while (i < b.length - 9) {
      if (b[i] !== 0xFF) { i++; continue; }
      const mk = b[i + 1];
      if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD7) || mk === 0x01 || mk === 0xFF) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if ((mk >= 0xC0 && mk <= 0xC3) || (mk >= 0xC5 && mk <= 0xC7) || (mk >= 0xC9 && mk <= 0xCB) || (mk >= 0xCD && mk <= 0xCF)) {
        dims = { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; break;
      }
      i += 2 + len;
    }
    assert.ok(dims, f + ' has a frame header');
    assert.deepEqual(dims, { w: 1280, h: 720 }, f + ' is 1280×720');
  }
});

test('the resolver answers a curated file, an alias, or the Worker route', () => {
  const t = table();
  const query = new Function('WIKI_CITY', 'CITY', 'AP', 'tc', 'return ' + fnSource('_wxCityQuery'))(
    { YXX: 'Abbotsford,_British_Columbia' }, { YQT: 'THUNDER BAY' }, { YQT: {} }, s => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, p, c) => p + c.toUpperCase()));
  const enc = new Function('return ' + fnSource('_wxEnc'))();
  const pic = new Function('_WX_CITY_PICS', '_WX_CITY_NIGHT', '_wxCityQuery', '_wxEnc', 'return ' + fnSource('_wxCityPic'))(t, table('_WX_CITY_NIGHT'), query, enc);
  assert.equal(pic('YQM'), '/logos/cities/YQM.jpg');
  // Night asks for the night picture where there is one and keeps the day one
  // where there is not — never a daylit city at two in the morning once the
  // set is filled, and never a regression while it is not.
  assert.equal(pic('YQM', true), '/logos/cities/YQM.jpg', 'no night picture yet, so the day one stands');
  assert.equal(pic('MCO', true), '/logos/cities/MCO-night.jpg');
  assert.equal(pic('MCO', false), '/logos/cities/MCO.jpg');
  assert.equal(pic('JFK', true), '/logos/cities/NYC.jpg', 'the shared New York picture has no night version yet');
  // An alias may only point at a city that HAS a night picture — otherwise the
  // board asks for a file that answers 404, which is worse than the day
  // picture it would otherwise have kept.
  for (const [k, v] of Object.entries(table('_WX_CITY_NIGHT'))) {
    if (v !== 1) assert.ok(fs.existsSync(path.join(CITIES, v + '-night.jpg')), k + ' aliases ' + v + ' at night, which has no night file');
  }
  assert.equal(pic('yqm'), '/logos/cities/YQM.jpg', 'case does not matter');
  assert.equal(pic('JFK'), '/logos/cities/NYC.jpg');
  assert.equal(pic('EWR'), '/logos/cities/NYC.jpg');
  assert.equal(pic('YXX'), '/citypic?iata=YXX&q=Abbotsford%20British%20Columbia', 'the encyclopedia title, with its province, is the query');
  assert.equal(pic('YQT'), '/citypic?iata=YQT&q=Thunder%20Bay', 'the board name in title case when there is no title');
  assert.equal(pic('ZZZ'), '/citypic?iata=ZZZ', 'an unknown code still asks, with no name');
  const apos = new Function('_WX_CITY_PICS', '_WX_CITY_NIGHT', '_wxCityQuery', '_wxEnc', 'return ' + fnSource('_wxCityPic'))(t, {}, () => "Val-D'Or (Québec)", enc);
  assert.equal(apos('YVO'), '/citypic?iata=YVO&q=Val-D%27Or%20%28Qu%C3%A9bec%29', "an apostrophe or a bracket cannot break the url('…') it goes into");
  assert.equal(pic(''), '');
});

test('the plate stacks picture, weather, then readings', () => {
  const side = fnSource('_wxSide');
  assert.match(side, /var pic = _wxCityPic\(iata, isNight\);/, 'the picture is of the hour the plate draws');
  assert.match(side, /var fx = _wxSceneKindOf\(sIc\) \+ \(isNight \? '-night' : '-day'\);/, 'the weather layer follows the icon and the real night');
  const order = ['wxc-mon-side ', 'wxc-mon-haspic', 'wxc-mon-pic', 'wxc-mon-fx wxc-fx-', 'wxc-mon-lbl', 'wxc-mon-city', 'wxc-mon-now', 'wxc-mon-cond'];
  let last = -1;
  for (const o of order) { const at = side.indexOf(o); assert.ok(at > last, o + ' comes in order'); last = at; }
  assert.match(side, /\(pic \? '<div class="wxc-mon-pic" style="background-image:url\(\\'' \+ pic \+ '\\'\)"><\/div>' : ''\)/, 'no picture, no picture layer');
  assert.match(side, /aria-hidden="true"/, 'the weather layer is decoration');
});

// The CSS block, bounded by its own reduced-motion close.
const HEAD = CSS.indexOf('/* ── v23849 — THE CITY ON THE PLATE');
assert.ok(HEAD >= 0, 'the v23849 block must exist');
const RM = CSS.indexOf('@media (prefers-reduced-motion: reduce) {', HEAD);
const BLOCK = CSS.slice(HEAD, CSS.indexOf('\n}', RM) + 2);
const LINES = BLOCK.split('\n').filter(l => l.trim().startsWith('html body'));
const trim = l => l.replace(/:not\(#_\)/g, '').replace(/html body /g, '');
/** The rule that actually WINS for `tail`: same specificity throughout this
 *  file, so the last one written is the one the browser applies. Pinning the
 *  v23849 copy would pin a rule a later block has already overridden. */
const ALL_LINES = CSS.split('\n').filter(l => l.trim().startsWith('html body'));
function liveRule(tail) {
  const hits = ALL_LINES.filter(l => {
    const s = trim(l);
    return s.slice(0, s.indexOf(' {')).split(', ').includes(tail);
  });
  assert.ok(hits.length, 'some block must have a rule for "' + tail + '"');
  const line = hits[hits.length - 1];
  return line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
}
/** The keyframes of `name`, wherever in the file they are written. */
function liveKeyframes(name) {
  const m = CSS.match(new RegExp('@keyframes ' + name + ' \\{([\\s\\S]*?)\\n\\}'));
  assert.ok(m, '@keyframes ' + name + ' must exist');
  return m[1];
}
function rule(tail) {
  const line = LINES.find(l => trim(l).slice(0, trim(l).indexOf(' {')).split(', ').includes(tail));
  assert.ok(line, 'the block must have a rule for "' + tail + '"');
  return line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
}

test('the block carries the same selector prefix as the rest of the file', () => {
  const prefix = l => (l.trim().match(/^html body(?::not\(#_\))*/) || [''])[0];
  const existing = prefix(CSS.split('\n').find(l => l.startsWith('html body') && l.includes('.wxc-mon-side {')));
  for (const l of LINES) assert.equal(prefix(l), existing, 'prefix on: ' + trim(l).slice(0, 60));
});

test('picture under a scrim, weather over it, readings above with a shadow', () => {
  assert.match(rule('.wxcard-wrap .wxc-mon-side'), /position: relative !important; overflow: hidden !important; isolation: isolate !important/);
  assert.match(rule('.wxcard-wrap .wxc-mon-side > *'), /z-index: 2 !important/);
  assert.match(rule('.wxcard-wrap .wxc-mon-haspic'), /text-shadow/);
  assert.match(rule('.wxcard-wrap .wxc-mon-haspic .wxc-mon-iata'), /text-shadow: none !important/, 'the amber chip sits on its own fill and carries no shadow');
  const pic = rule('.wxcard-wrap .wxc-mon-side > .wxc-mon-pic');
  assert.match(pic, /position: absolute !important; inset: 0 !important; z-index: 0 !important; background-size: cover !important; background-position: center !important/);
  assert.match(rule('.wxcard-wrap .wxc-mon-side > .wxc-mon-pic::after'), /linear-gradient\(180deg, rgba\(4,14,31,\.58\)/, 'the scrim is darkest at the label and the stats');
  assert.match(rule('.wxcard-wrap .wxc-mon-side > .wxc-mon-fx'), /z-index: 1 !important; overflow: hidden !important; pointer-events: none !important/);
});

test('all ten weather layers are styled, and night deepens each', () => {
  for (const k of ['clear', 'cloud', 'rain', 'snow', 'storm']) {
    for (const d of ['day', 'night']) {
      const tail = '.wxcard-wrap .wxc-mon-fx.wxc-fx-' + k + '-' + d;
      const has = LINES.some(l => trim(l).slice(0, trim(l).indexOf(' {')).split(', ').some(sel => sel.startsWith(tail)));
      assert.ok(has, tail + ' is styled');
    }
    assert.match(rule('.wxcard-wrap .wxc-mon-fx.wxc-fx-' + k + '-night' + (k === 'storm' ? '' : '')), /rgba\(6,16,44|rgba\(10,18,36/, k + ' at night is a blue wash');
  }
});

test('every falling loop is seamless, and none of them is a lattice', () => {
  // The layer that wins is the one to check. Its cells must divide the travel
  // of the keyframes it names, or the field jumps once a loop.
  const travelOf = (name) => {
    const last = liveKeyframes(name).trim().split('\n').pop();
    const m = last.match(/translate(?:Y)?\((?:-?\d+(?:px)?, )?(\d+)px\)/);
    assert.ok(m, name + ' must end on a pixel travel');
    return +m[1];
  };
  const cellsOf = (tail) => Array.from(liveRule(tail).matchAll(/\/(\d+)px (\d+)px/g)).map(m => ({ w: +m[1], h: +m[2] }));
  const animOf = (tail) => {
    const m = liveRule(tail).match(/animation: (\w+)/);
    assert.ok(m, tail + ' must animate');
    return m[1];
  };
  for (const tail of [
    '.wxcard-wrap .wxc-mon-fx.wxc-fx-rain-day::before',
    '.wxcard-wrap .wxc-mon-fx.wxc-fx-rain-day::after',
    '.wxcard-wrap .wxc-mon-fx.wxc-fx-snow-day::before',
    '.wxcard-wrap .wxc-mon-fx.wxc-fx-snow-day::after',
  ]) {
    const travel = travelOf(animOf(tail));
    const cells = cellsOf(tail);
    assert.ok(cells.length, tail + ' must lay down cells');
    for (const c of cells) assert.equal(travel % c.h, 0, tail + ': cell ' + c.h + ' must divide ' + travel);
  }
  // A lattice is what one mark per cell looks like at plate size. Snow and the
  // night's stars therefore scatter SEVERAL marks at irregular offsets inside
  // ONE cell, which is why the cell of a layer is a single size.
  for (const tail of [
    '.wxcard-wrap .wxc-mon-fx.wxc-fx-snow-day::before',
    '.wxcard-wrap .wxc-mon-fx.wxc-fx-snow-day::after',
    '.wxcard-wrap .wxc-mon-fx.wxc-fx-clear-night::before',
  ]) {
    const cells = cellsOf(tail);
    assert.ok(cells.length >= 5, tail + ' must scatter at least five marks, not tile one');
    const sizes = new Set(cells.map(c => c.w + 'x' + c.h));
    assert.equal(sizes.size, 1, tail + ': the marks must share one cell, or they do not scatter within it');
    const offsets = new Set(Array.from(liveRule(tail).matchAll(/(-?\d+)px (-?\d+)px\//g)).map(m => m[1] + ',' + m[2]));
    assert.equal(offsets.size, cells.length, tail + ': every mark must sit at its own offset');
  }
  // Rain still leans before it travels, so it falls along the lean.
  assert.match(liveKeyframes(animOf('.wxcard-wrap .wxc-mon-fx.wxc-fx-rain-day::before')), /rotate\(\d+deg\) translateY\(224px\)/);
  // The two snow layers drift opposite ways — that is what reads as depth.
  const s1 = liveKeyframes(animOf('.wxcard-wrap .wxc-mon-fx.wxc-fx-snow-day::before'));
  const s2 = liveKeyframes(animOf('.wxcard-wrap .wxc-mon-fx.wxc-fx-snow-day::after'));
  const sway = (k) => +(k.match(/translate\((-?\d+)(?:px)?, 112px\)/) || [0, 0])[1];
  assert.ok(sway(s1) * sway(s2) < 0, 'the near and far snow must sway opposite ways');
  // Nothing in the rain is a hard bright line any more.
  const rainMax = Math.max(...Array.from(liveRule('.wxcard-wrap .wxc-mon-fx.wxc-fx-rain-day::after').matchAll(/rgba\(\d+,\d+,\d+,\.(\d+)\)/g)).map(m => +('0.' + m[1])));
  assert.ok(rainMax <= 0.45, 'no rain streak brighter than 45% white, was 88% and read as scratches');
  assert.match(liveRule('.wxcard-wrap .wxc-mon-fx.wxc-fx-rain-day::after'), /filter: blur\(/, 'and every streak is softened');
});

test('the storm flashes twice a cycle and rests dark between', () => {
  const m = BLOCK.match(/@keyframes wxcFxFlash \{([\s\S]*?)\n\}/);
  assert.ok(m);
  assert.match(m[1], /0%, 6\.5%, 8%, 9\.5%, 62%, 64%, 100% \{ opacity: 0; \}/);
  assert.match(rule('.wxcard-wrap .wxc-mon-fx.wxc-fx-storm-day::after'), /animation: wxcFxFlash 11s linear infinite !important/);
});

test('reduced motion stills the weather layers, and outranks them', () => {
  // The animating rules are three classes deep (.wxcard-wrap .wxc-mon-fx.wxc-fx-*);
  // every declaration on both sides is !important, so the override must reach
  // the same specificity to win on source order — the attribute selector is
  // the third class.
  assert.match(BLOCK, /@media \(prefers-reduced-motion: reduce\) \{\n  html body(?::not\(#_\))* \.wxcard-wrap \.wxc-mon-fx\[class\*="wxc-fx-"\]::before, html body(?::not\(#_\))* \.wxcard-wrap \.wxc-mon-fx\[class\*="wxc-fx-"\]::after \{ animation: none !important; \}\n\}/);
});

test('the boards load the CSS at the new build', () => {
  assert.match(SRC, /var FIDS_BUILD_TAG = 'v23853';/);
  for (const h of ['fids', 'gids', 'bids']) {
    const html = fs.readFileSync(path.join(ROOT, 'fids-current', h + '.html'), 'utf8');
    assert.match(html, /css\/display-overrides\.css\?v=23853/, h + '.html');
  }
});

// ── the Worker route ──────────────────────────────────────────────────────
function routeSource() {
  const at = WORKER.indexOf("if (path === '/citypic') {");
  assert.ok(at >= 0, 'worker-entry.js must route /citypic');
  let d = 0;
  for (let k = WORKER.indexOf('{', at); k < WORKER.length; k++) {
    if (WORKER[k] === '{') d++;
    else if (WORKER[k] === '}') { d--; if (d === 0) return WORKER.slice(at, k + 1); }
  }
  assert.fail('unbalanced /citypic');
}

test('/citypic keeps its key a secret and its pictures its own', () => {
  const r = routeSource();
  assert.match(r, /const key = env\.PIXABAY_KEY;/, 'the key is a Worker secret');
  assert.doesNotMatch(WORKER, /key=[A-Za-z0-9-]{20,}/, 'no key literal anywhere in the Worker');
  assert.match(r, /const iata = String\(url\.searchParams\.get\('iata'\) \|\| ''\)\.toUpperCase\(\);\s*if \(!\/\^\[A-Z\]\{3\}\$\/\.test\(iata\)\) return new Response\('Bad iata', \{ status: 400/, 'three letters, the shape the client sends');
  assert.match(r, /replace\(\/\[\^\\p\{L\}\\p\{N\} \.'-\]\/gu, ''\)/, 'the name is scrubbed before it is passed on');
  assert.match(r, /\.slice\(0, 80\)/);
  assert.match(r, /if \(!key \|\| !q\) return none\(\);/, 'no key or no name is a 404, not a call');
  assert.match(r, /const img = await fetch\(hit\.largeImageURL\);[\s\S]*const bytes = await img\.arrayBuffer\(\);/, 'the bytes are fetched, not the URL relayed');
  assert.doesNotMatch(r, /Location|status: 30[1-8]/, 'never a redirect to a third party');
  assert.match(r, /kv\.put\(kPic, bytes, \{ expirationTtl: 30 \* 86400/, 'kept thirty days');
  assert.match(r, /kv\.put\(kNeg, '1', \{ expirationTtl: 86400 \}\)/, 'a miss is remembered for a day');
  // The term is part of both keys: the route is public and the term is the
  // caller's, so a key by code alone could be seeded by anyone for a month.
  assert.match(r, /const kq = iata \+ ':' \+ q\.toLowerCase\(\);\s*const kPic = 'citypic:v1:' \+ kq;\s*const kNeg = 'citypic:neg:' \+ kq;/);
  // Upstream faults are never remembered as a miss: a limit or an outage
  // throws to the 502, a bad download answers 502, and only an empty answer
  // is remembered.
  // A failed attempt is recorded, not thrown: the two fallback searches must
  // still run, or a city with no "<name> skyline" picture never gets asked
  // for its bare name.
  assert.match(r, /if \(!r\.ok\) \{ upstream = r\.status; return null; \}/);
  assert.match(r, /for \(const \[term, category\] of \[\[q \+ ' skyline', 'places'\], \[q, 'places'\], \[q, ''\]\]\)/,
    'all three attempts, in order');
  // The picture must be TAGGED with the city, or a board gets a different one:
  // sampled without the check, two Canadian cities both returned a European
  // river city and two more shared one picture byte for byte.
  // The phrase is built from EVERY word, short ones included — Thunder Bay's
  // second word is three letters, and without it a thunderstorm answers for
  // the city (this test caught exactly that).
  assert.match(r, /const all = norm\(q\)\.split\(\/\[\^a-z0-9\]\+\/\)\.filter\(Boolean\);/);
  assert.match(r, /const phrase = all\.slice\(0, 2\)\.join\(' '\);/);
  assert.match(r, /if \(all\.length > 1 && t\.indexOf\(phrase\) >= 0\) \{ best = h; break; \}/, 'the whole name wins');
  assert.match(r, /if \(!named && \(!words\.length \|\| t\.indexOf\(words\[0\]\) >= 0\)\) named = h;/, 'the first word of it will do');
  assert.match(r, /const hit = best \|\| named;/, 'and nothing else is served');
  // The matcher itself, lifted and driven — a hit tagged with another city
  // must lose to one tagged with this one, and an untagged hit must not win.
  {
    const src = r.slice(r.indexOf('const norm ='), r.indexOf('const hit = best || named;'));
    const run = (q, hits) => new Function('q', 'search', 'return (async () => {' + src + ' return best || named; })()')(q, async () => hits);
    const H = (tags) => ({ largeImageURL: 'https://x/' + tags, tags });
    return Promise.all([
      run('Halifax Nova Scotia', [H('budapest, river, night'), H('halifax, nova scotia, harbour')])
        .then(h => assert.equal(h.tags, 'halifax, nova scotia, harbour', 'the city that is named wins over the one that is not')),
      run('Thunder Bay', [H('thunder, lightning, storm'), H('thunder bay, ontario')])
        .then(h => assert.equal(h.tags, 'thunder bay, ontario', 'the whole name beats a word of it')),
      run('Moncton', [H('budapest, river'), H('city, skyline')])
        .then(h => assert.equal(h, null, 'nothing tagged Moncton, so no picture at all')),
      run('Quebec City', [H('quebec city, chateau frontenac')])
        .then(h => assert.ok(h, 'accents in the query must not stop a plain-ascii tag matching')),
    ]);
  }
  // An upstream fault names its status and pauses the asking; a shared fault
  // (rate limit, outage) pauses every city, a peculiar one pauses only this.
  assert.match(r, /return new Response\('citypic upstream ' \+ why, \{ status: 502, headers: NO_STORE \}\)/);
  assert.match(r, /kv\.put\(shared \? kBack : kHold, String\(why\), \{ expirationTtl: shared \? 300 : 600 \}\)/);
  assert.match(r, /if \(upstream\) return faulted\(upstream, upstream === 429 \|\| upstream >= 500\);/);
  assert.match(r, /if \(!img\.ok \|\| !\/\^image\\\/\/\.test\(type\)\) return faulted\('image ' \+ \(img\.status \|\| 0\), false\);/);
  assert.match(r, /const paused = \(await kv\.get\(kBack\)[\s\S]{0,80}if \(paused\) return none\(120\);/, 'a paused route answers cheaply');
  assert.equal((r.match(/await remember\(\)/g) || []).length, 1, 'remember() runs for the empty answer only');
  // A day's budget bounds what any caller can spend of the key's quota.
  assert.match(r, /const kUsed = 'citypic:used:' \+ new Date\(\)\.toISOString\(\)\.slice\(0, 10\);/);
  assert.match(r, /const cap = Number\(env\.CITYPIC_DAILY_LOOKUPS\) \|\| 200;\s*if \(used >= cap\) return none\(\);/);
  assert.match(r, /env\.CITY_BG_CACHE/, 'the KV namespace the root config already binds');
  assert.match(r, /const none = \(age\) => new Response\('no picture', \{ status: 404, headers: \{ 'Cache-Control': 'public, max-age=' \+ \(age \|\| 3600\)/,
    'even a 404 is cached at the edge — an hour by default, two minutes while paused');
  assert.match(r, /safesearch=true/);
  assert.match(r, /catch \(e\) \{\s*return new Response\('citypic fetch failed', \{ status: 502, headers: NO_STORE \}\);/);
  const wr = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  assert.match(wr, /"binding": "CITY_BG_CACHE"/);
});
