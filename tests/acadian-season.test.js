'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// MONCTON'S ACADIAN FLAG IS SEASONAL: 1–15 AUGUST, MONCTON'S CALENDAR.
//
// The flag look — the tricolore band, the blue time tab, the red board tab,
// the gold star — was pinned to Moncton all year (BANNER_STYLE 'YQM':
// 'silk-acadian'), and the flag-tab rules keyed on body.fids-ap-YQM alone, so
// they painted a ★ by the clock and the red tab even on the plain silk band.
//
// Decision: the look shows from 1 August to 15 August inclusive (15 August is
// the Fête nationale de l'Acadie), on Moncton's own date (America/Moncton),
// and in that window the badge is the gold star ALONE — no plane or bag on it.
// Outside it Moncton wears the plain silk band like every other airport.
//
// The trap this guards: Moncton is UTC−3 in August. At 23:30 on 31 July in
// Moncton it is already 1 August in UTC, and at 23:30 on 15 August it is
// already the 16th. A season counted on the host's or UTC's calendar would
// put the flag up three hours early and take it down three hours early.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const OVR = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const PHONE = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'phone.css'), 'utf8');

function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist in fids-core.js');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) break;
  }
  return CORE.slice(at, i + 1);
}
// A top-level `var NAME = {...};` object literal, bracket-matched.
function varObjSource(name) {
  const at = CORE.indexOf('var ' + name + ' = {');
  assert.ok(at >= 0, name + ' must be declared in fids-core.js');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) break;
  }
  return CORE.slice(at, i + 1) + ';';
}

const SEASON_SRC = [
  varObjSource('ACADIAN_SEASON'),
  fnSource('fidsLocalDateKey'),
  fnSource('_acadianSeasonOn'),
].join('\n');
const RESOLVER_SRC = [SEASON_SRC, varObjSource('BANNER_STYLE'), fnSource('_bannerStyleFor')].join('\n');

const box = { Intl, Date, Object, parseInt };
vm.createContext(box);
vm.runInContext(RESOLVER_SRC, box);
const { _acadianSeasonOn, _bannerStyleFor, ACADIAN_SEASON, BANNER_STYLE } = box;

const at = (iso) => new Date(Date.parse(iso));

// ── the window's edges ─────────────────────────────────────────────────────
const EDGES = [
  // [instant (UTC), Moncton wall clock, expected]
  ['2026-07-31T15:00:00Z', '31 Jul 12:00', false],
  ['2026-08-01T02:30:00Z', '31 Jul 23:30 — already 1 Aug in UTC', false],
  ['2026-08-01T02:59:59.999Z', '31 Jul 23:59:59.999', false],
  ['2026-08-01T03:00:00Z', '1 Aug 00:00', true],
  ['2026-08-10T17:00:00Z', '10 Aug 14:00', true],
  ['2026-08-15T12:00:00Z', '15 Aug 09:00', true],
  ['2026-08-16T02:30:00Z', '15 Aug 23:30 — already 16 Aug in UTC', true],
  ['2026-08-16T02:59:59.999Z', '15 Aug 23:59:59.999', true],
  ['2026-08-16T03:00:00Z', '16 Aug 00:00', false],
  ['2026-08-16T15:00:00Z', '16 Aug 12:00', false],
  ['2026-10-12T15:00:00Z', 'an October day', false],
  ['2027-08-01T03:00:00Z', '1 Aug 00:00 the next year', true],
  ['2027-07-31T23:00:00Z', '31 Jul 20:00 the next year', false],
];

test('the season is 1–15 August inclusive, by Moncton\'s wall clock', () => {
  assert.equal(ACADIAN_SEASON.iata, 'YQM');
  assert.equal(ACADIAN_SEASON.tz, 'America/Moncton', 'Moncton\'s own calendar, never the host\'s or UTC\'s');
  for (const [iso, label, want] of EDGES) {
    assert.equal(_acadianSeasonOn(at(iso)), want, label + ' (' + iso + ')');
  }
});

test('every half hour from 25 July to 22 August agrees with Moncton\'s date', () => {
  // Independent oracle: Moncton is on ADT (UTC−3) all through July and August.
  const start = Date.parse('2026-07-25T00:00:00Z'), end = Date.parse('2026-08-22T00:00:00Z');
  let on = 0;
  for (let t = start; t < end; t += 30 * 60 * 1000) {
    const local = new Date(t - 3 * 3600 * 1000);
    const want = local.getUTCMonth() === 7 && local.getUTCDate() >= 1 && local.getUTCDate() <= 15;
    assert.equal(_acadianSeasonOn(new Date(t)), want, new Date(t).toISOString());
    if (want) on++;
  }
  assert.equal(on, 15 * 48, 'fifteen whole Moncton days, no more, no less');
});

test('the answer does not depend on the machine\'s own time zone', () => {
  // A board's host can sit anywhere (the stream boxes are in Europe). Run the
  // same function under the far ends of the clock and compare.
  const probe = 'const vm=require("node:vm");const b={Intl,Date,Object,parseInt};vm.createContext(b);'
    + 'vm.runInContext(' + JSON.stringify(SEASON_SRC) + ',b);'
    + 'process.stdout.write(JSON.stringify(' + JSON.stringify(EDGES.map(e => e[0])) + '.map(s=>b._acadianSeasonOn(new Date(Date.parse(s))))));';
  const want = JSON.stringify(EDGES.map(e => e[2]));
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC', 'Europe/Helsinki']) {
    const got = execFileSync(process.execPath, ['-e', probe], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(got, want, 'host TZ=' + tz);
  }
});

// ── which banner Moncton wears ─────────────────────────────────────────────
const AUG10 = at('2026-08-10T17:00:00Z');
const OCT12 = at('2026-10-12T15:00:00Z');
const JUL31_LATE = at('2026-08-01T02:30:00Z');
const AUG15_LATE = at('2026-08-16T02:30:00Z');

test('Moncton is no longer pinned to the flag in the registry', () => {
  assert.notEqual(BANNER_STYLE.YQM, 'silk-acadian', 'the flag comes from the season, not a year-round pin');
  assert.equal(BANNER_STYLE['*'], 'silk');
});

test('in season Moncton wears the flag on every screen; out of season plain silk', () => {
  for (const screen of ['fids', 'bids', 'gids']) {
    assert.deepEqual({ ..._bannerStyleFor('YQM', screen, AUG10, '') }, { style: 'silk-acadian', acadian: true }, screen + ' on 10 Aug');
    assert.deepEqual({ ..._bannerStyleFor('YQM', screen, AUG15_LATE, '') }, { style: 'silk-acadian', acadian: true }, screen + ' 23:30 on 15 Aug');
    assert.deepEqual({ ..._bannerStyleFor('YQM', screen, OCT12, '') }, { style: 'silk', acadian: false }, screen + ' in October');
    assert.deepEqual({ ..._bannerStyleFor('YQM', screen, JUL31_LATE, '') }, { style: 'silk', acadian: false }, screen + ' 23:30 on 31 Jul');
  }
});

test('the season is Moncton\'s alone', () => {
  for (const ap of ['YHZ', 'YSJ', 'YFC', 'YUL', '']) {
    assert.deepEqual({ ..._bannerStyleFor(ap, 'fids', AUG10, '') }, { style: 'silk', acadian: false }, ap + ' on 10 Aug');
  }
});

test('the localStorage override still wins, for testing', () => {
  // The August look on any day…
  assert.deepEqual({ ..._bannerStyleFor('YQM', 'fids', OCT12, 'silk-acadian') }, { style: 'silk-acadian', acadian: true });
  // …and the plain band in August, with no flag tabs left painted over it.
  assert.deepEqual({ ..._bannerStyleFor('YQM', 'fids', AUG10, 'silk') }, { style: 'silk', acadian: false });
  // The old three-tab banner, where the tricolore first lived, keeps it in season only.
  assert.deepEqual({ ..._bannerStyleFor('YQM', 'fids', AUG10, 'tabs') }, { style: 'tabs', acadian: true });
  assert.deepEqual({ ..._bannerStyleFor('YQM', 'fids', OCT12, 'tabs') }, { style: 'tabs', acadian: false });
});

test('the banner applies the season and keeps re-checking it as days pass', () => {
  const apply = fnSource('_applyBannerStyle');
  assert.match(apply, /_bannerStyleFor\(ap, screen, new Date\(\), ovr\)/, 'decided from the date each time it is applied');
  assert.match(apply, /classList\.toggle\('fids-acadian', res\.acadian\)/, 'the one class the flag-tab CSS keys on');
  assert.match(apply, /localStorage\.getItem\('fids_banner_style_' \+ ap \+ '_' \+ screen\)/, 'the per-screen override is read first');
  // Boards run for weeks; render() skips the banner when no flight is listed.
  const keeper = fnSource('_bannerSeasonKeeper');
  assert.match(keeper, /_bannerStyleFor\(ap, L\.screen, new Date\(\), ovr\)/);
  assert.match(keeper, /_applyBannerStyle\(L\.iata, L\.screen\)/);
  const reg = /_ocEvery\(_bannerSeasonKeeper, (\d+)\)/.exec(CORE);
  assert.ok(reg, 'the keeper must be on a timer');
  assert.ok(+reg[1] <= 5 * 60 * 1000, 'the flag must turn over within minutes of Moncton midnight, not hours');
});

// ── the CSS: flag tabs only in season, the star alone ──────────────────────
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}
const R_OVR = rules(OVR);
const SEASONED = /\.fids-acadian\b|\[data-fids-banner="silk-acadian"\]/;
// Moncton can be named two ways in a selector. body.fids-ap-YQM exists only
// for the flag, so EVERY selector on it must wait for the season.
// body[data-fids-ap="YQM"] is the airport attribute every board stamps, and
// Moncton has year-round looks on it (the skyline behind the departures
// board), so there a rule is the flag's when it paints one of the flag's own
// colours or the ★. A :not(...) names everyone BUT Moncton and is set aside.
const YQM_CLASS = /\.fids-ap-YQM\b/;
const YQM_ATTR = /\[data-fids-ap=["']?YQM["']?\]/;
const FLAG_INK = /#003DA5|#D21034|#B50E2C|#6E081A|#001A4D|FFD600|★|\\2605/i;
const positive = s => s.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
const parts = sel => sel.split(/,(?![^(]*\))/).map(s => s.trim());

// Every stylesheet the boards can load: each .css under fids-current (any
// folder), and the inline <style> blocks of every page.
function cssSources() {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) out.push({ file: path.relative(ROOT, p), css: fs.readFileSync(p, 'utf8') });
      else if (e.name.endsWith('.html')) {
        const html = fs.readFileSync(p, 'utf8');
        const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        let m, n = 0;
        while ((m = re.exec(html))) out.push({ file: path.relative(ROOT, p) + ' <style #' + (++n) + '>', css: m[1] });
      }
    }
  };
  walk(path.join(ROOT, 'fids-current'));
  return out;
}
const SOURCES = cssSources();

test('nothing keys the flag on Moncton alone — every Moncton rule, in every stylesheet, waits for the season', () => {
  const files = SOURCES.map(x => x.file);
  for (const want of ['fids-current/css/display-overrides.css', 'fids-current/css/phone.css',
    'fids-current/css/flight-display.css', 'fids-current/css/baggage-display.css', 'fids-current/css/gate-display.css']) {
    assert.ok(files.includes(want), 'the scan must reach ' + want);
  }
  for (const page of ['fids.html', 'bids.html', 'gids.html']) {
    assert.ok(files.some(f => f.startsWith('fids-current/' + page + ' <style')), 'the scan must reach the inline styles of ' + page);
  }
  const flagged = (sel, body) => {
    const s = positive(sel);
    return !SEASONED.test(s) && (YQM_CLASS.test(s) || (YQM_ATTR.test(s) && FLAG_INK.test(body)));
  };
  // the matcher itself: both spellings caught, the season and a negation let through
  assert.ok(flagged('body.fids-ap-YQM .fids-banner-board', 'color: red'));
  assert.ok(flagged('html body[data-fids-ap="YQM"]:not(#_) .fids-banner-board', 'background: #D21034 !important'));
  assert.ok(!flagged('body[data-fids-ap="YQM"] #fidsBoard', 'background-image: url(moncton-skyline.svg)'), 'the skyline is year-round');
  assert.ok(!flagged('body.fids-ap-YQM.fids-acadian .fids-banner-board', 'background: #D21034'));
  assert.ok(!flagged('body:not([data-fids-ap="YQM"]) .x', 'background: #D21034'), 'a :not() is everyone else');
  const bad = [];
  let seen = 0;
  for (const src of SOURCES) {
    for (const r of rules(src.css)) {
      for (const s of parts(r.sel)) {
        if (YQM_CLASS.test(positive(s))) seen++;
        if (flagged(s, r.body)) bad.push(src.file + ': ' + s.slice(0, 160));
      }
    }
  }
  assert.ok(seen >= 10, 'the flag rules must still be found (' + seen + ')');
  assert.deepEqual(bad, [], 'a selector on Moncton without the season paints the flag all year');
});

test('the blue time tab, the ★ by the clock and the red board tab are season-only', () => {
  const star = R_OVR.filter(r => /content:\s*'★/.test(r.body));
  assert.ok(star.length >= 1, 'the ★ rule must exist');
  for (const r of star) for (const s of parts(r.sel)) assert.match(s, /\.fids-acadian\b/, '★ by the clock: ' + s);
  const blueTab = R_OVR.filter(r => /\.fids-banner-time-block\s*$/.test(r.sel) && /#003DA5 32%/.test(r.body));
  const redTab = R_OVR.filter(r => /\.fids-banner-board\s*$/.test(r.sel) && /background:\s*#D21034/.test(r.body));
  assert.ok(blueTab.length && redTab.length, 'the flag tabs must still exist for August');
  for (const r of blueTab.concat(redTab)) for (const s of parts(r.sel)) assert.match(s, SEASONED, s);
  // The phone board's regular tab colour is withheld from Moncton only in season.
  const phoneTab = rules(PHONE).filter(r => /\.fids-banner-board\s*$/.test(r.sel) && /--fids-banner-bg/.test(r.body));
  assert.ok(phoneTab.length, 'the phone board tab rule must exist');
  for (const r of phoneTab) assert.doesNotMatch(r.sel, /fids-ap-YQM/, 'phone: Moncton keeps the regular tab out of season');
});

test('the gold star is drawn only on the Acadian band', () => {
  const starBg = R_OVR.filter(r => /\.fids-board-icon\s*$/.test(r.sel) && /FFD600/.test(r.body) && /svg/.test(r.body));
  assert.ok(starBg.length, 'the gold star background must exist');
  for (const r of starBg) for (const s of parts(r.sel)) assert.match(s, /\[data-fids-banner="silk-acadian"\]/, s);
});

test('in season the star stands alone: no plane, no bag on it', () => {
  const ids = s => (s.match(/#/g) || []).length;
  const glyph = R_OVR.filter(r => /\.fids-board-icon::before\s*$/.test(r.sel.split(',').pop()) && /display:\s*none/.test(r.body)
    && /\.fids-acadian/.test(r.sel) && /silk-acadian/.test(r.sel));
  assert.ok(glyph.length, 'a season rule must take the plane glyph off the star');
  const ico = R_OVR.filter(r => /\.fids-board-icon \.ac-ico\b/.test(r.sel) && /display:\s*none/.test(r.body)
    && /\.fids-acadian/.test(r.sel) && /silk-acadian/.test(r.sel));
  assert.ok(ico.length, 'a season rule must take the bag off the star');
  // It must outrank every rule that draws the glyph (the v24039 mask, the
  // star block's sizing): one id-weight more than any of them is enough.
  const mine = Math.min(...parts(glyph[0].sel).map(ids));
  for (const r of R_OVR) {
    if (r === glyph[0] || !/board-icon::before/.test(r.sel) || !/display:/.test(r.body)) continue;
    for (const s of parts(r.sel)) {
      if (!/board-icon::before/.test(s)) continue;
      assert.ok(ids(s) < mine, 'this glyph rule could put the plane back on the star: ' + s.slice(0, 160));
    }
  }
});

// ── out of season: the plain-silk badge ────────────────────────────────────
// Out of season Moncton's badge is the plain-silk plane, like every airport's.
// Since v24039 that plane is a mask painted from background-color, and the
// base rule paints it navy (#14263f, for the old white badge), so the silk
// band's `color: #fff` no longer reached it: a navy plane on the navy head of
// the band, beside a white title. It is painted white, the title's ink.
function spec(sel) {
  const s = sel.replace(/::[a-z-]+/g, ' ');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\()[a-z-]+/g) || []).length;
  const el = (s.replace(/:not\(/g, ' ').match(/(^|[\s>+~(])[a-z][\w-]*/gi) || []).length + (sel.includes('::') ? 1 : 0);
  return [ids, cls, el];
}
const beats = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];

test('out of season the badge is the plane in white, the title\'s ink, not navy on navy', () => {
  const base = R_OVR.find(r => r.sel === 'html .fids-banner .fids-board-icon::before' && /mask:\s*url/.test(r.body));
  assert.ok(base, 'the v24039 base mask rule must exist');
  assert.match(base.body, /background-color:\s*#14263f\s*!important/i, 'the base paints the plane navy (for the white badge)');
  const silk = R_OVR.filter(r => parts(r.sel).includes('body[data-fids-banner="silk"] .fids-banner-board .fids-board-icon::before'));
  assert.ok(silk.length, 'the plain-silk glyph rule must exist');
  const white = silk.find(r => /background-color:\s*#ffffff\s*!important/i.test(r.body));
  assert.ok(white, 'the plain-silk plane must be painted white through background-color (the mask), not only `color`');
  assert.ok(beats(spec('body[data-fids-banner="silk"] .fids-banner-board .fids-board-icon::before'), spec(base.sel)),
    'and outrank the base mask rule');
  // The phone board's band glyph is the same mask.
  const ph = rules(PHONE).find(r => /\.fids-banner \.fids-board-icon::before\s*$/.test(r.sel));
  assert.ok(ph, 'the phone band glyph rule must exist');
  assert.match(ph.body, /background-color:\s*#ffffff\s*!important/i, 'phone: the glyph is white on the band too');
});
