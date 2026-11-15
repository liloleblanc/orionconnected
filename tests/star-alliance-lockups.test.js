'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 2026-11-15 — THE STAR ALLIANCE MEMBER LOCKUPS.
//
// A Star Alliance carrier shows its member lockup on the two big logo spots of
// a gate, the band at the top and the Welcome card: its mark, a thin rule the
// width of it, and A STAR ALLIANCE MEMBER with the star, laid out as the
// supplied Air Canada lockup (star-lockups/AC.svg). Air Canada and EgyptAir
// are the supplied files; the others are built by scripts/star-lockups/build.py
// from the files the band already draws, with the rule, the member line and
// the star of AC.svg. This holds that:
//   · every code the band maps to Star Alliance has both files, or a reason;
//   · the supplied files are kept byte for byte, and every built one draws the
//     member line from AC.svg itself, white on the twin for dark grounds;
//   · the band draws the lockup alone (no second star badge), the white twin on
//     a dark band, and every other carrier exactly as before;
//   · the member line reads at 9 px or more in the band at 1680x1050;
//   · the Welcome card draws the white twin in place of emblem and lettering.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const DIR = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'star-lockups');

/** Brace-matched slice from the first '{' after `decl`, comment and string aware. */
function block(decl, from0) {
  const at = SRC.indexOf(decl, from0 || 0);
  assert.ok(at >= 0, decl + ' must exist in fids-core.js');
  const from = SRC.indexOf('{', at);
  let depth = 0, line = false, blk = false, quote = '';
  for (let i = from; i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { blk = true; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { at, from, to: i + 1, text: SRC.slice(at, i + 1), body: SRC.slice(from + 1, i) };
  }
  throw new Error('could not close ' + decl);
}
const table = (decl) => new Function('return ' + SRC.slice(block(decl).from, block(decl).to) + ';')();
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(path.join(DIR, f))).digest('hex');

const ALLIANCE_MAP = table('var ALLIANCE_MAP = {');
const LOCKUP = table('var STAR_ALLIANCE_LOCKUP = {');
const SKIP = table('var STAR_ALLIANCE_LOCKUP_SKIP = {');
const starLockupSrc = new Function('STAR_ALLIANCE_LOCKUP', 'FIDS_BUILD_TAG', block('function starLockupSrc(').text + '\nreturn starLockupSrc;')(LOCKUP, 'vTEST');
const STAR = Object.keys(ALLIANCE_MAP).filter((c) => ALLIANCE_MAP[c] === 'star');
const SUPPLIED = { 'AC.svg': '3ef30cc3850771619c50c681a83b8f22', 'MS.svg': '571ac289ef66a710addc8ec22a652b12' };

// The member line of AC.svg: the rule, A STAR ALLIANCE MEMBER, its TM, then the fourteen faces of the star.
const AC_PATHS = [...read('AC.svg').matchAll(/<path\b[^>]*\sd="([^"]+)"[^>]*\sfill="(#[0-9a-f]{6})"/g)].map((m) => ({ d: m[1], fill: m[2] }));
const MEMBER = AC_PATHS.slice(2);

test('every code the band maps to Star Alliance has its two lockup files, or a reason it has none', () => {
  assert.ok(STAR.length >= 25, STAR.length + ' Star codes');
  for (const c of STAR) {
    const has = Object.prototype.hasOwnProperty.call(LOCKUP, c), skip = Object.prototype.hasOwnProperty.call(SKIP, c);
    assert.ok(has !== skip, c + ': a lockup or a reason, one of the two');
    if (skip) assert.ok(['not-a-member', 'own-carrier', 'lettering-is-type', 'no-lettering'].includes(SKIP[c]), c + ': a known reason, ' + SKIP[c]);
  }
  // a lockup says A STAR ALLIANCE MEMBER: only a Star code gets one
  for (const c of Object.keys(LOCKUP)) assert.equal(ALLIANCE_MAP[c], 'star', c + ' is not a Star code on the map');
  // the files are exactly the lockups, a light one and its white twin each
  const want = Object.keys(LOCKUP).flatMap((c) => [c + '.svg', c + '-white.svg']).sort();
  assert.deepEqual(fs.readdirSync(DIR).filter((f) => !f.startsWith('.')).sort(), want);
  for (const c of Object.keys(LOCKUP)) assert.ok(LOCKUP[c] > 0.15 && LOCKUP[c] < 0.8, c + ': the share of its lettering ' + LOCKUP[c]);
  // carriers that are not members carry no member line under their own name
  for (const c of ['QK', 'EW']) assert.ok(SKIP[c] === 'not-a-member' && !LOCKUP[c], c);
  // the members in the first pictures
  for (const c of ['AC', 'MS', 'UA', 'LH', 'LX', 'TK', 'SQ', 'CM']) assert.ok(LOCKUP[c], c);
  assert.equal(starLockupSrc('ua', false), '/logos/airlines/star-lockups/UA.svg?v=vTEST');
  assert.equal(starLockupSrc('UA', true), '/logos/airlines/star-lockups/UA-white.svg?v=vTEST');
  assert.equal(starLockupSrc('AA', false), '');
  assert.equal(starLockupSrc('QK', true), '');
});

test('Air Canada and EgyptAir are the supplied files, byte for byte; their twins change only the ink', () => {
  for (const [f, h] of Object.entries(SUPPLIED)) assert.equal(md5(f), h, f);
  const ac = read('AC.svg'), acw = read('AC-white.svg');
  assert.equal(acw, ac.replace('fill="#2e2a25"', 'fill="#ffffff"').split('fill="#000000"').join('fill="#ffffff"'));
  const ms = read('MS.svg'), msw = read('MS-white.svg');
  assert.match(ms, /\.cls-3 \{\s*fill: #002d62;/);
  assert.match(msw, /\.cls-3 \{\s*fill: #ffffff;/);
  assert.equal(msw.replace(/ fill="#ffffff"/g, '').replace('fill: #ffffff;', 'fill: #002d62;'), ms);
  assert.equal((msw.match(/ fill="#ffffff"/g) || []).length, 3, 'the rule, the member line and the TM');
});

test('every built lockup draws the rule, the member line, the TM and the star of AC.svg, its own paths', () => {
  assert.equal(AC_PATHS.length, 19);
  assert.deepEqual(MEMBER.slice(0, 3).map((p) => p.fill), ['#000000', '#000000', '#000000']);
  assert.deepEqual([...new Set(MEMBER.slice(3).map((p) => p.fill))].sort(), ['#5b5b63', '#92959b', '#cdd0d3'], 'the star in its three greys');
  for (const code of Object.keys(LOCKUP).filter((c) => c !== 'AC' && c !== 'MS')) {
    for (const white of [false, true]) {
      const f = code + (white ? '-white' : '') + '.svg', t = read(f);
      MEMBER.forEach((p, i) => {
        const at = t.indexOf('d="' + p.d + '"');
        assert.ok(at > 0, f + ': path ' + (i + 2) + ' of AC.svg');
        const fill = (/fill="(#[0-9a-f]{6})"/.exec(t.slice(at)) || [])[1];
        assert.equal(fill, i < 3 ? (white ? '#ffffff' : '#000000') : p.fill, f + ': the ink of path ' + (i + 2));
      });
      // one picture, nothing outside it, no live type
      assert.doesNotMatch(t, /<text\b|<script\b|\bhref="(?!data:|#)/, f);
      assert.match(t, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, f);
      const [, , W, H] = /viewBox="([^"]+)"/.exec(t)[1].split(' ').map(Number);
      assert.equal(+(/\bwidth="([\d.]+)"/.exec(t)[1]), W, f);
      assert.equal(+(/\bheight="([\d.]+)"/.exec(t)[1]), H, f);
    }
  }
});

test('a white twin is white lettering, never a white plate: no light square of a tile in it', () => {
  for (const code of Object.keys(LOCKUP)) {
    const t = read(code + '-white.svg');
    assert.doesNotMatch(t, /fill="#(?:fff|ffffff)"\s+d="M0 0h100v100H0z"/i, code + '-white.svg holds a white square');
    assert.doesNotMatch(t, /<rect\b[^>]*fill="#(?:fff|ffffff)"/i, code + '-white.svg holds a white box');
    assert.doesNotMatch(t, /#2e2a25|#002d62/, code + '-white.svg keeps a dark lettering ink');
  }
  // Copa's tile is a white square: its twin has the lettering alone (so do Aegean and Air New Zealand)
  assert.match(read('CM.svg'), /fill="#FFF" d="M0 0h100v100H0z"/);
  for (const c of ['CM', 'A3', 'NZ']) assert.doesNotMatch(read(c + '-white.svg'), /clipPath id="lk-emb"/, c);
  for (const c of ['UA', 'LH', 'LX', 'TK', 'SQ']) assert.match(read(c + '-white.svg'), /clipPath id="lk-emb"/, c + ' keeps its emblem in its colours');
});

// ── the band ─────────────────────────────────────────────────────────────────
const LOCKUP_FN = block('  function _starLockupOnBand()').text;
const SLOT_AT = SRC.indexOf('\'<div class="g8-r1-logoslot">\' + (function () {');
const SLOT = block('(function () {', SLOT_AT).body;
const SKYTEAM = block('  function _skyTeamOnBand(html)').text;
function slot(code, o) {
  o = Object.assign({ silk: true, light: true, heritage: null, cache: {} }, o || {});
  const r1 = '<img class="g8-r1-logo" src="/wordmark/' + code + '.svg">';
  const key = ALLIANCE_MAP[code];
  const star = key ? '<img class="g8-r1-star g8-r1-alliance-' + key + '" src="/alliance/' + key + '.png">' : '';
  return new Function('_allianceKey', 'starLockupSrc', '_g8LogoCache', '_heritageBannerMark', 'airlineCode', 'airlineName',
    '_silkBanner', '_silkLightBand', 'r1LogoHtml', 'starHtml',
    LOCKUP_FN + '\n' + SKYTEAM + '\nreturn (function () {' + SLOT + '})();')(
    key, starLockupSrc, o.cache, () => o.heritage, code, 'NAME OF ' + code, o.silk, o.light, r1, star);
}

test('the band draws a member its lockup alone: no wordmark, no emblem, no second star badge', () => {
  for (const code of Object.keys(LOCKUP)) {
    const html = slot(code);
    assert.match(html, new RegExp('^<img class="g8-r1-logo g8-r1-lockup" src="/logos/airlines/star-lockups/' + code + '\\.svg\\?v=vTEST"'), code);
    assert.doesNotMatch(html, /g8-r1-star|\/wordmark\//, code + ': the badge and the wordmark are not added');
    assert.match(html, /alt="NAME OF [A-Z0-9]+"/);
    assert.match(html, /onerror="g8LogoFail\(this\)" data-pairmode="1"/, code + ': a failed load types the name, never an outside logo');
    assert.match(html, /filter:none !important/);
    assert.doesNotMatch(html, /background/, code + ': no ground behind it');
  }
});

test('the white twin on a dark band (the classic banner), the dark lockup on a light one', () => {
  for (const code of Object.keys(LOCKUP)) {
    assert.match(slot(code, { silk: true, light: true }), new RegExp('/' + code + '\\.svg'));
    assert.match(slot(code, { silk: true, light: false }), new RegExp('/' + code + '-white\\.svg'));
    assert.match(slot(code, { silk: false, light: true }), new RegExp('/' + code + '-white\\.svg'));
  }
  // the band decides with the same two flags the SkyTeam badge reads
  assert.match(LOCKUP_FN, /starLockupSrc\(airlineCode, !\(_silkBanner && _silkLightBand\)\)/);
  assert.match(SKYTEAM, /if \(!\(_silkBanner && _silkLightBand\)\) return html;/);
});

test('every other carrier is drawn exactly as before; a heritage page and a failed lettering keep theirs', () => {
  const others = Object.keys(ALLIANCE_MAP).filter((c) => !LOCKUP[c]).concat(['WS', 'PD', 'TS', 'F8', 'B6']);
  for (const code of others) {
    const key = ALLIANCE_MAP[code];
    const r1 = '<img class="g8-r1-logo" src="/wordmark/' + code + '.svg">';
    const star = key ? '<img class="g8-r1-star g8-r1-alliance-' + key + '" src="/alliance/' + key + '.png">' : '';
    const html = slot(code);
    if (key === 'oneworld') assert.equal(html, star + '<span class="g8-r1-alliance-div" aria-hidden="true"></span>' + r1, code);
    else assert.equal(html, r1 + star, code);
  }
  // the Star codes with no lockup keep their wordmark and their star badge
  for (const code of Object.keys(SKIP).filter((c) => ALLIANCE_MAP[c] === 'star')) assert.match(slot(code), /g8-r1-star g8-r1-alliance-star/, code);
  assert.match(slot('AC', { heritage: { src: '/heritage/mark.svg' } }), /\/wordmark\/AC\.svg/, 'a heritage page keeps its period mark');
  assert.match(slot('AC', { cache: { AC: 'text' } }), /\/wordmark\/AC\.svg/, 'a lettering that failed keeps the typed name');
  // KLM and Delta keep their combined SkyTeam lockups, and the Star members are not added there:
  // starHtml is still built for them, so the boarding strip keeps its star
  const combined = table('var _COMBINED_ALLIANCE_LOCKUP = {');
  assert.deepEqual(Object.keys(combined).sort(), ['DAL', 'DL', 'KL']);
  assert.match(SRC, /var _bwStar = \(starHtml && _allianceKey === 'star'\) \? starHtml\.replace\('star-3d-tile\.jpg', 'star-3d-symbol\.webp'\) : '';/);
  assert.match(SLOT, /var _lockup = _starLockupOnBand\(\);\s*if \(_lockup\) return _lockup;/);
});

test('in the band at 1680x1050 the member line reads at 10 px or more, the lockup whole in its slot', () => {
  // the band: clamp(110px, 13vh, 160px); the lockup: the band less 40 px (its date bar and a margin)
  assert.match(fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'gate-display.css'), 'utf8'), /min-height: clamp\(110px, 13vh, 160px\) !important;/);
  assert.match(LOCKUP_FN, /var h = 'calc\(clamp\(110px, 13vh, 160px\) - 40px\)';/);
  assert.match(LOCKUP_FN, /max-width:100% !important;/);
  const H = Math.min(160, Math.max(110, 0.13 * 1050)) - 40;            // 96.5
  const slotW = 0.36 * 1680 - Math.min(62, Math.max(34, 0.034 * 1680));  // the slot less its gutter
  // the member capitals of AC.svg (553.091 to 615.45) and of MS.svg (119.53 to 138.94)
  const caps = (f) => {
    const t = read(f);
    const [, , W, Hv] = /viewBox="([^"]+)"/.exec(t)[1].split(' ').map(Number);
    if (/^AC/.test(f)) return { W, Hv, c: 615.45 - 553.091 };
    if (/^MS/.test(f)) return { W, Hv, c: 138.94 - 119.53 };
    return { W, Hv, c: (615.45 - 553.091) * Number(/matrix\(([\d.]+) /.exec(t)[1]) };
  };
  const small = [];
  for (const code of Object.keys(LOCKUP)) {
    for (const f of [code + '.svg', code + '-white.svg']) {
      const m = caps(f);
      const drawnH = Math.min(H, slotW * m.Hv / m.W);
      const px = drawnH * m.c / m.Hv;
      if (px < 10) small.push(f + ' ' + px.toFixed(1) + ' px');
    }
  }
  assert.deepEqual(small, []);
});

// ── the Welcome card ─────────────────────────────────────────────────────────
test('the Welcome card draws the white twin in place of emblem and lettering, every other card as before', () => {
  const data = new Function('AIRLINE_BRAND', 'frFirstAirport', 'window', '_welcomeCardEmblem', '_welcomeCardName', '_welcomeCardLines',
    '_welcomeCardPick', 'WELCOME_CARD_LETTERING_SCALE', 'WELCOME_CARD_LETTER_HEIGHT', 'starLockupSrc', 'STAR_ALLIANCE_LOCKUP',
    block('function _welcomeCardData(code)').text + '\nreturn _welcomeCardData;')(
    {}, () => false, { _gateIata: 'YYZ' }, () => ({ src: '/emblem.svg', kind: 'own' }), () => ({ wordmark: '/lettering.svg', name: 'NAME' }),
    () => [], (t, c) => t[c], {}, { SQ: 0.35 }, starLockupSrc, LOCKUP);
  const card = new Function('BoardStrings', block('function _welcomeCardEsc(s)').text + '\n' + block('function _welcomeCardHtml(ad)').text
    + '\nreturn _welcomeCardHtml;')({ META: {} });
  for (const code of Object.keys(LOCKUP)) {
    const d = data(code);
    // the data of the card is as it was (its emblem, its lettering and their letters), plus the lockup
    assert.equal(d.wordmark, '/lettering.svg', code);
    assert.equal(d.emblem, '/emblem.svg', code);
    assert.equal(d.letterHeight, code === 'SQ' ? 0.35 : 1, code);
    assert.equal(d.lockup, '/logos/airlines/star-lockups/' + code + '-white.svg?v=vTEST', code);
    assert.equal(d.lockupLetters, LOCKUP[code], code);
    // the card draws the lockup alone on the airline line, taller by the share its letters fill
    const h = card(d);
    assert.doesNotMatch(h, /gwc-emb|\/emblem\.svg|\/lettering\.svg/, code);
    assert.match(h, /data-emblem="none"/, code);
    const img = /<img class="gwc-wm" [^>]*>/.exec(h)[0];
    assert.match(img, new RegExp('src="/logos/airlines/star-lockups/' + code + '-white\\.svg\\?v=vTEST"'), code);
    assert.equal(+/data-letters="([\d.]+)"/.exec(img)[1], LOCKUP[code], code);
    assert.ok(Math.abs(+/data-scale="([\d.]+)"/.exec(img)[1] * LOCKUP[code] - 1) < 1e-9, code + ': its letters as large as a lettering alone');
    assert.match(img, /alt="NAME"/);
  }
  for (const code of ['AA', 'QK', 'EW', 'NH', 'WS', 'KL']) {
    const d = data(code);
    assert.equal(d.lockup, '', code);
    const h = card(d);
    assert.match(h, /<img class="gwc-emb-img gad-ad-logo" src="\/emblem\.svg"/, code);
    assert.match(h, /<img class="gwc-wm" src="\/lettering\.svg"/, code);
    assert.doesNotMatch(h, /star-lockups|data-scale/, code);
  }
});
