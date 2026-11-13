'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// EVERY AIRLINE'S ART, ON EVERY SURFACE THAT DRAWS IT
//
// An audit of every airline's logos on every surface found art on disk that no
// table named, marks that vanished on their ground, lettering that was not
// lettering, and one airline printed as another. This file holds what was done
// about each (the rule that no mark comes from an outside host is held next
// door, in tests/airline-logos-own-host.test.js; the gate orbs in
// tests/gate-orbs-every-airline.test.js; the app's copies in
// tests/companion-app.test.js):
//   1. TILES ON DISK, NAMED. Each tile was opened and looked at, and named only
//      where the picture is plainly the mark of the airline. Every named tile
//      is on disk, is in the app's copy, has its ground listed for the gate
//      orbs, and is what the row draws. The tiles that were looked at and
//      refused stay unnamed, with the reason.
//   2. THE LIST OF THE TILE FOLDER (MANIFEST.csv) says what each of those
//      files holds, where it named another airline.
//   3. LETTERING ON DISK, NAMED: eleven pairs, white for dark grounds and the
//      colours of the airline for light ones, outlines only.
//   4. A SECOND CODE of an airline draws the art filed under its first.
//   5. THE BOARDING STRIP AND THE COUNTDOWN are never a bare band for a
//      carrier the row draws a mark for, never white on the white strip, and
//      never a symbol of the colour it stands on.
//   6. LETTERING THAT IS TYPED TEXT is in no table, but for one file kept in a
//      ledger with the reason.
//   7. A ROW STATE THAT SWALLOWS THE LETTERING types the name instead.
//   8. THE BELT types no name beside a lockup.
//   9. CENTRAL MOUNTAIN AIR is an airline of its own: its name, its number.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const FC = path.join(ROOT, 'fids-current');
const JS = path.join(FC, 'js');
const CORE = fs.readFileSync(path.join(JS, 'fids-core.js'), 'utf8');
const APP = fs.readFileSync(path.join(FC, 'app.html'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(FC, 'logos/airline-tiles/MANIFEST.csv'), 'utf8');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const onDisk = (u) => !!u && fs.existsSync(path.join(FC, String(u).split('?')[0]));
const read = (u) => fs.readFileSync(path.join(FC, String(u).split('?')[0]), 'utf8');

// ── the whole board script in a page of its own (as tests/airline-names-every-row.test.js) ──
function board() {
  const nothing = (name) => new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'toString' || k === 'valueOf') return () => '';
      return nothing(name + '.' + String(k));
    },
    set() { return true; }, apply() { return nothing(name + '()'); }, construct() { return nothing('new ' + name); }, has() { return true; }
  });
  const store = {};
  const ls = { getItem: (k) => (own(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, length: 0, clear() {} };
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, localStorage: ls, sessionStorage: ls, document: nothing('document'),
    navigator: { userAgent: 'node', language: 'en' }, fetch: () => new Promise(() => {}), performance: { now: () => Date.now() },
    location: { search: '?ap=YXS', hostname: 'localhost', href: 'http://localhost/fids.html?ap=YXS', pathname: '/fids.html', origin: 'http://localhost' },
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    URL, URLSearchParams, Intl, CustomEvent: function () {}, Event: function () {}, Image: function () { return nothing('img'); },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => nothing('style'), addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['host-airport.js', 'board-strings.js', 'feed-router.js', 'fids-core.js', 'airport-coords.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('var __the = function (n) { return eval(n); };', ctx);
  return ctx;
}
const B = board();
const the = (n) => B.__the(n);
const plain = (o) => JSON.parse(JSON.stringify(o));
const TILE = plain(the('IATA_TO_TILE_ICAO')), WM = plain(the('IATA_TO_WORDMARK')), EMBLEM = plain(the('IATA_TO_EMBLEM'));
const NAME = plain(the('AIRLINE_NAME')), NAME2 = plain(the('_AIRLINE_NAME_OVERRIDE'));
const CODES = [...new Set([...Object.keys(NAME), ...Object.keys(NAME2)])].sort();
const SHARED = (() => { const win = {}; vm.runInNewContext(fs.readFileSync(path.join(JS, 'shared-names.js'), 'utf8'), { window: win }); return plain(win); })();
const srcOf = (html) => (/\bsrc="([^"]*)"/.exec(String(html)) || [])[1] || '';
// the colours a drawing paints with (fills, strokes and gradient stops written as hex or by name)
const hex6 = (c) => (/^#[0-9a-f]{3}$/.test(c) ? '#' + c.slice(1).replace(/./g, '$&$&') : c);
const paints = (u) => [...new Set([...read(u).matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#[0-9a-fA-F]{3,8}|white|black)/g)].map((m) => hex6(m[1].toLowerCase())))];
// a drawing that wraps a picture paints nothing this can read
const wrapsPicture = (u) => /<image\b/.test(read(u));
const isWhite = (c) => /^(#fff|#ffffff|white)$/.test(c);
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (h) => { const m = /^#([0-9a-f]{6})$/i.exec(h); const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(m[1].substr(i, 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ── 1. tiles on disk, named ────────────────────────────────────────────────
// code: the tile, and what the picture shows. Looked at one by one.
const NAMED_TILES = {
  JX: ['SJX', 'Starlux: two bronze strokes of an S and a four-point star, on dark teal'],
  N0: ['NBT', 'Norse Atlantic: the navy ribbon of a longship prow, on pale blue'],
  Z0: ['NBT', 'Norse Atlantic UK: the same ribbon'],
  KC: ['KZR', 'Air Astana: the gold ornament, on navy'],
  KM: ['KMM', 'KM Malta Airlines: the white Maltese cross, on red'],
  HY: ['UZB', 'Uzbekistan Airways: the green bird, on yellow'],
  UX: ['AEA', 'Air Europa: the white ae ligature, on blue'],
  MF: ['CXA', 'Xiamen Air: the white egret, on blue'],
  S4: ['RZO', 'Azores Airlines: the faceted blue bird'],
  XQ: ['SXS', 'SunExpress: the sun over blue waves, on orange'],
  UL: ['ALK', 'SriLankan: the peacock in red, green and orange'],
  PK: ['PIA', 'PIA: its name in Urdu, gold on dark green'],
  KX: ['CAY', 'Cayman Airways: the turtle with the red scarf, on green'],
  TN: ['THT', 'Air Tahiti Nui: the white tiare flower, on turquoise'],
  FJ: ['FJI', 'Fiji Airways: the round masi motif, on brown'],
  PX: ['ANG', 'Air Niugini: the bird of paradise, on red'],
  OM: ['MGL', 'MIAT Mongolian: the white winged horse, on blue'],
  ZL: ['RXA', 'Rex: the word rex. with its orange x, on navy'],
  '5J': ['CEB', 'Cebu Pacific: the eagle in blue and teal, on yellow'],
  GS: ['GCR', 'Tianjin Airlines: the yellow swirl, on red (the file is its designator)'],
  HX: ['CRK', 'Hong Kong Airlines: the gold bauhinia, on red'],
  JD: ['CBJ', 'Capital Airlines: the gold dragon head with streaming lines, on red (the file is its designator)'],
  SB: ['ACI', 'Aircalin: the red hibiscus, on blue'],
  AH: ['DAH', 'Air Algerie: the red swallow in its white oval, on red'],
  KU: ['KAC', 'Kuwait Airways: the white bird, on navy'],
  XY: ['KNE', 'flynas: the white f, on teal'],
  ZH: ['CSZ', 'Shenzhen Airlines: the gold roc, on red'],
  QS: ['TVS', 'Smartwings: the orange brush strokes, on blue'],
  NO: ['NOS', 'Neos: the red swallow, on blue'],
  H2: ['SKU', 'Sky Airline: the green chevron, on purple'],
  BG: ['BBC', 'Biman Bangladesh: the red stork, on green'],
  FB: ['LZB', 'Bulgaria Air: the bird in the white, green and red of the flag'],
  XC: ['CAI', 'Corendon Airlines: the white star figure, on red'],
  XR: ['CAI', 'Corendon Airlines Europe: the same figure'],
  BY: ['TOM', 'TUI Airways: the red smile, on light blue'],
  TB: ['TOM', 'TUI fly Belgium: the same smile'],
  X3: ['TOM', 'TUI fly: the same smile (it drew a square with TUI typed on it)'],
  CJ: ['BAW', 'BA CityFlyer: the British Airways speedmarque, the tile British Airways draws'],
  JJ: ['LAN', 'LATAM Brasil: the LATAM mark, the tile LATAM draws (it drew a square with JJ typed on it)']
};
// Looked at and not named, and why.
const REFUSED_TILES = {
  '8M': ['UBA', 'a gold lotus on brown: the mark of Myanmar National Airlines (UB), whose designator the file carries, not of Myanmar Airways International'],
  BI: ['RBA', 'a white band across a yellow square: not plainly the mark of Royal Brunei, which is the crest of Brunei'],
  DY: ['NOZ', 'a white aircraft drawn in one stroke on red: not plainly a mark of Norwegian, whose logo is its lettering; it keeps the square that types DY'],
  D8: ['NOZ', 'as DY, whose square it shares: not plainly a mark of Norwegian'],
  NK: ['NKS', 'plainly the black S of Spirit, and not named: Spirit rows are kept off every board, and a code kept off keeps no tile pointer'],
  '5Y': ['GTI', 'plainly the Atlas of Atlas Air, and not named: a cargo airline, kept off every board']
};

test('every tile that was named is on disk, in the app, known to the gate orbs, and what the row draws', () => {
  assert.equal(Object.keys(NAMED_TILES).length, 39);
  for (const [code, [tile, seen]] of Object.entries(NAMED_TILES)) {
    const file = '/logos/airline-tiles/' + tile + '.svg';
    assert.ok(seen.length > 20, code + ': what the picture shows');
    assert.equal(TILE[code], tile, code + ': the row table names ' + tile);
    assert.ok(onDisk(file), file);
    assert.doesNotMatch(read(file), /<text\b/, tile + '.svg is a drawing, not typed letters');
    assert.ok(NAME[code], code + ' is an airline the boards name');
    // the row and the belt draw it, beside the name
    const logo = the('mkLogo')(code, '');
    assert.equal(srcOf(logo), file, code + ': the row');
    assert.match(logo, /data-logo-set="tile"/, code);
    // the app's copy
    assert.equal(SHARED.FIDS_SHARED_TILE[code], file, code + ': the app copy');
    // the gate orbs: the ground of the tile is in the table the script writes, and the orb draws the
    // tile, or the mark its row of the table of looks keeps, on disk either way
    assert.match(B._ORB_TILE_GROUNDS[tile], /^#[0-9A-F]{6}$/, tile + ': a ground of one colour');
    assert.equal(B._ORB_TILE_LETTERS[tile], undefined, tile + ' is no lettered placeholder');
    const orb = B._gateOrbParts(code).path;
    assert.ok(onDisk(orb), code + ': the orb art ' + orb);
    const look = B._GATE_ORB_LOOKS[B._gateColumnLook(code).carrier] || {};
    const brand = B._BADGE_TILE_BRANDS[B._gateColumnLook(code).carrier];
    if (!look.art && !brand && !the('AIRLINE_EMBLEM_FILES')[B._gateColumnLook(code).carrier]) assert.equal(orb, file, code + ': the orb draws the tile');
  }
  // the carriers whose gate keeps a mark of one colour, or the mark on white, where the row draws the tile
  assert.deepEqual(Object.keys(NAMED_TILES).filter((c) => B._gateOrbParts(c).path !== '/logos/airline-tiles/' + NAMED_TILES[c][0] + '.svg').sort(), ['CJ', 'FJ', 'JJ', 'JX', 'MF', 'UX']);
  // a tile on a light ground: an ink that reads on it, and never white
  for (const code of Object.keys(NAMED_TILES)) {
    const L = B._gateColumnLook(code);
    if (/^#[0-9a-f]{6}$/i.test(L.ground)) assert.ok(contrast(L.inkSeen.length === 4 ? '#' + L.inkSeen.slice(1).replace(/./g, '$&$&') : L.inkSeen, L.ground) >= 3, code + ': ' + L.inkSeen + ' on ' + L.ground);
  }
  // where two codes share a tile, the designator reads back as the code the tile is filed under
  for (const [d, c] of [['NBT', 'N0'], ['CAI', 'XC'], ['TOM', 'BY'], ['BAW', 'BA'], ['LAN', 'LA'], ['WSG', 'WT']]) assert.equal(the('_designatorIata')(d), c, d);
});

test('the tiles that were looked at and refused are named by no table', () => {
  for (const [code, [tile, why]] of Object.entries(REFUSED_TILES)) {
    assert.ok(onDisk('/logos/airline-tiles/' + tile + '.svg'), tile + '.svg is on disk');
    assert.ok(why.length > 20, code);
    assert.notEqual(TILE[code], tile, code + ' is not pointed at ' + tile + '.svg');
    assert.ok(!Object.values(TILE).includes(tile), tile + '.svg is named for no code');
    assert.notEqual(B._gateOrbParts(code).path, '/logos/airline-tiles/' + tile + '.svg', code + ': the gate does not draw it');
  }
  // Norwegian keeps its deliberate monogram; the two cargo and closed airlines have no row to draw on
  assert.deepEqual([TILE.DY, TILE.D8], ['NAX', 'NAX']);
  for (const code of ['NK', '5Y']) assert.ok(the('FILTER_OUT').has(code), code + ' is kept off the board');
  // and two rows of the table of looks that named the tile of another airline are gone
  for (const code of ['TN', 'GS']) assert.equal(B._GATE_ORB_LOOKS[code], undefined, code);
  assert.deepEqual([B._gateOrbParts('TN').path, B._gateOrbParts('GS').path], ['/logos/airline-tiles/THT.svg', '/logos/airline-tiles/GCR.svg']);
});

// ── 2. the list of the tile folder ─────────────────────────────────────────
test('the list of the tile folder says what each corrected file holds', () => {
  const rows = MANIFEST.trim().split('\n').slice(1).map((l) => l.split(','));
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  // file: [code, the airline], read from the picture
  const NOW = {
    FBU: ['BF', 'French Bee'], ASL: ['JU', 'Air Serbia'], CBJ: ['JD', 'Capital Airlines'], CRK: ['HX', 'Hong Kong Airlines'],
    TGZ: ['A9', 'Georgian Airways'], THT: ['TN', 'Air Tahiti Nui'], IBB: ['NT', 'Binter Canarias'], CSZ: ['ZH', 'Shenzhen Airlines'],
    ACI: ['SB', 'Aircalin'], NBT: ['N0', 'Norse Atlantic Airways'], SJX: ['JX', 'Starlux Airlines'], KMM: ['KM', 'KM Malta Airlines'],
    UBA: ['UB', 'Myanmar National Airlines'], BRU: ['B2', 'Belavia'], PAO: ['PH', 'Polynesian Airlines'], CAI: ['XC', 'Corendon Airlines'], SKU: ['H2', 'Sky Airline']
  };
  for (const [tile, [code, name]] of Object.entries(NOW)) {
    assert.ok(by[tile], tile + ' has a row');
    assert.deepEqual([by[tile][1], by[tile][2], by[tile][4]], [code, name, tile + '.svg'], tile);
    assert.ok(onDisk('/logos/airline-tiles/' + tile + '.svg'), tile);
  }
  // every row names a file that is on disk, once
  assert.equal(new Set(rows.map((r) => r[0])).size, rows.length, 'one row per file');
  for (const r of rows) { assert.equal(r.length, 5, r.join()); assert.ok(onDisk('/logos/airline-tiles/' + r[4]), r[4]); }
  // and where the list names a code for a tile the row table also names for a code of two letters,
  // the two agree on every tile named here: the list can be read for wiring again
  for (const [code, [tile]] of Object.entries(NAMED_TILES)) {
    const listed = by[tile] && by[tile][1];
    if (!listed || listed === '--') continue;
    const sharers = Object.keys(TILE).filter((c) => TILE[c] === tile);
    assert.ok(sharers.includes(listed) || listed === 'UB', code + ': the list files ' + tile + ' under ' + listed + ', the row table under ' + sharers.join(' '));
  }
});

// ── 3. lettering on disk, named ────────────────────────────────────────────
const NAMED_LETTERING = { SN: 'brussels-airlines', EI: 'aer-lingus', TK: 'turkish-airlines', WY: 'oman-air', SQ: 'singapore-airlines', CX: 'cathay', '6E': 'indigo', KE: 'korean-air', UX: 'air-europa', AH: 'air-algerie', KU: 'kuwait-airways' };

test('the lettering that was named: a white cut and a colour cut, outlines only, with the tile beside it', () => {
  for (const [code, base] of Object.entries(NAMED_LETTERING)) {
    assert.equal(WM[code], base, code);
    const light = the('wordmarkSrc')(base, 'light'), dark = the('wordmarkSrc')(base, 'dark');
    assert.equal(light.split('?')[0], '/logos/airlines/split/' + base + '-wordmark-light.svg', code);
    assert.equal(dark.split('?')[0], '/logos/airlines/split/' + base + '-wordmark-dark.svg', code);
    for (const u of [light, dark]) {
      assert.ok(onDisk(u), u);
      assert.doesNotMatch(read(u), /<text\b|<image\b|font-family/, u + ': outlines, no typed text and no picture inside');
    }
    // white lettering for a dark ground, never dark lettering on a white box
    const lightInk = paints(light), darkInk = paints(dark);
    assert.ok(lightInk.length && lightInk.every(isWhite), code + ': the light cut is white lettering, ' + lightInk.join(' '));
    assert.ok(darkInk.length && darkInk.some((c) => !isWhite(c)), code + ': the colour cut is in colours, ' + darkInk.join(' '));
    assert.notDeepEqual(darkInk, lightInk, code + ': two cuts');
    assert.doesNotMatch(read(light), /<rect\b[^>]*(?:width="100%"|height="100%")/, code + ': no box behind it');
    // the row draws the tile and the lettering, and the app has the pair
    assert.match(the('mkLogo')(code, ''), /data-logo-set="tile"/, code + ': its tile beside it');
    assert.deepEqual(SHARED.FIDS_SHARED_WORDMARK[code], [dark.split('?')[0], light.split('?')[0]], code + ': the app copy');
    // the gate band draws the lettering, so it asks no address of carrierLogoUrl
    assert.match(CORE, /var _bannerWordmarkBase = \(typeof IATA_TO_WORDMARK !== 'undefined'\)/);
  }
  assert.equal(Object.keys(NAMED_LETTERING).length, 11);
});

// ── 4. a second code ───────────────────────────────────────────────────────
test('an airline under a second code draws the art filed under its first', () => {
  // North Star Air (0N as NSA), Wasaya (WP as WT), World Atlantic (WAL as WL), Chair (GM as CS)
  for (const [second, first] of [['0N', 'NSA'], ['WP', 'WT'], ['WAL', 'WL'], ['GM', 'CS']]) {
    assert.equal(NAME[second].toUpperCase().split(' ')[0], NAME[first].toUpperCase().split(' ')[0], second + ' and ' + first + ' are one airline');
    // the row: the same mark and the same lettering
    assert.equal(srcOf(the('mkLogo')(second, '')), srcOf(the('mkLogo')(first, '')), second + ': the mark of the row');
    assert.equal(WM[second], WM[first], second + ': the lettering');
    // the gate: one fold, so the art, the colours and the look are those of the first code
    assert.equal(the('_orbEmblemCarrier')(second), first, second + ' folds to ' + first);
    assert.deepEqual(plain(B._gateColumnLook(second)), plain(B._gateColumnLook(first)), second + ': the gate column');
    assert.equal(the('getAirlineAccent')(second), the('getAirlineAccent')(first), second + ': the accent');
    // the Welcome card and the phone gate header
    assert.deepEqual(plain(the('_welcomeCardName')(second)).wordmark, plain(the('_welcomeCardName')(first)).wordmark, second + ': the Welcome card');
    for (const dark of [true, false]) assert.equal(the('_mgHeaderLogoSrc')(second, dark), the('_mgHeaderLogoSrc')(first, dark), second + ': the phone gate header');
  }
  // each table is told in one place: one row of the tile table and of the lettering table, one line
  // of the fold (or one row of the callsign table for a designator), one row of the card's twin table
  assert.deepEqual([TILE['0N'], TILE.WP, WM['0N'], WM.WP, WM.WAL], ['NSA', 'WSG', 'north-star', 'wasaya', 'world-atlantic']);
  assert.equal(the('CALLSIGN_TO_IATA').WAL, 'WL');
  assert.deepEqual([the('_FB_WM_ICAO')['0N'], the('_FB_WM_ICAO').WP, the('_FB_WM_ICAO').WAL], ['NSA', 'WT', 'WL']);
  // and no row of the look, colour or brand tables was copied under the second code
  for (const second of ['0N', 'WP', 'WAL', 'GM']) {
    assert.equal(B._GATE_ORB_LOOKS[second], undefined, second);
    assert.equal(the('AIRLINE_ACCENT')[second], undefined, second);
    assert.equal(the('LOCAL_LOGOS')[second], undefined, second);
  }
  // the two designators the tile table gave while each code drew a lettered square
  assert.deepEqual([the('_designatorIata')('TAM'), the('_designatorIata')('TUI')], ['JJ', 'X3']);
});

// ── 5. the boarding strip and the countdown ────────────────────────────────
// the file a mark ends on: the first file asked where it is on disk, else the file it falls to
const ends = (pick) => (pick.src && onDisk(pick.src) ? pick.src : (pick.tile && onDisk(pick.tile) ? pick.tile : ''));

test('the boarding strip and the countdown are never bare for a carrier the row draws a mark for', () => {
  const bare = [];
  let drawn = 0;
  for (const code of CODES) {
    const logo = the('mkLogo')(code, '');
    const rowMark = /data-logo-set="(?:tile|emblem)"/.test(logo) ? srcOf(logo) : '';
    for (const [surface, table] of [['strip', B._BW_EMBLEM], ['countdown', B._CD_MARK]]) {
      const pick = B._gateMarkPick(table, code), file = ends(pick);
      if (file) { drawn++; continue; }
      // bare only where the row has no mark either, or its tile is the lettered square of another code
      const tile = (/airline-tiles\/([^/?]+)\.svg/.exec(rowMark) || [])[1] || '';
      if (rowMark && !(tile && B._orbTileLettersOther(tile, code))) bare.push(surface + ' ' + code + ' (the row draws ' + rowMark + ')');
    }
  }
  assert.deepEqual(bare, []);
  assert.ok(drawn >= 370, drawn + ' marks drawn over ' + CODES.length + ' codes and two surfaces');
  // the carriers the audit found with a bare band and a tile on disk
  for (const code of 'BF RK JV RJ B6 G4 SY AZ OS SK AY BT DY U2 VY WK OU LS EY GF ME MS WB NH QF BR CI CZ CA HU TR AD G3 Y4 UP'.split(' ')) {
    for (const table of [B._BW_EMBLEM, B._CD_MARK]) assert.equal(ends(B._gateMarkPick(table, code)), '/logos/airline-tiles/' + TILE[code] + '.svg', code + ' ends on its row tile');
  }
  // a symbol that is on disk is still the first choice (Korean Air on the strip: its taegeuk reads on white)
  assert.equal(ends(B._gateMarkPick(B._BW_EMBLEM, 'KE')), '/logos/symbols/airlines/KE.svg');
  // a lettered square is drawn only for the code it letters
  assert.equal(ends(B._gateMarkPick(B._BW_EMBLEM, 'DY')), '/logos/airline-tiles/NAX.svg');
  assert.equal(ends(B._gateMarkPick(B._BW_EMBLEM, 'D8')), '');
  // both builders ask the one function, and write its handler
  const strip = CORE.slice(CORE.indexOf('function _boardWelcomeStripHtml(_stripState) {'), CORE.indexOf('function _cdRondelleHtml() {'));
  const cd = CORE.slice(CORE.indexOf('function _cdRondelleHtml() {'), CORE.indexOf('function _boardInfoRowHtml(statusKey) {'));
  assert.match(strip, /var _bwPick = window\._gateMarkPick\(window\._BW_EMBLEM, airlineCode\);/);
  assert.match(strip, /class="g8-bw-emblem"' \+ _bwSpin \+ ' src="' \+ _bwEmb \+ '" alt=""' \+ window\._gateMarkAttrs\(_bwPick\)/);
  assert.match(cd, /var _cdPick = window\._gateMarkPick\(window\._CD_MARK, airlineCode\);/);
  assert.match(cd, /class="g8-cd-mark-still"' \+ _cdSpin \+ ' src="' \+ _src \+ '" alt=""' \+ window\._gateMarkAttrs\(_cdPick\)/);
  assert.doesNotMatch(strip + cd, /onerror="this\.style\.display=\\'none\\'"/, 'neither hides a miss without trying the row tile');
  // the markup carries the tile to fall to, and says when the first file is only a guess
  assert.equal(B._gateMarkAttrs(B._gateMarkPick(B._BW_EMBLEM, 'B6')), ' data-tile="/logos/airline-tiles/JBU.svg" data-guess="1" onerror="window._gateMarkMiss(this)"');
  assert.equal(B._gateMarkAttrs(B._gateMarkPick(B._BW_EMBLEM, 'PD')), ' data-tile="/logos/airline-tiles/PTR.svg" onerror="window._gateMarkMiss(this)"');
  // a guess that missed is remembered: the next build asks the tile at once
  B._GATE_MARK_MISSED['/logos/symbols/airlines/B6.svg'] = 1;
  assert.deepEqual(plain(B._gateMarkPick(B._BW_EMBLEM, 'B6')), { src: '/logos/airline-tiles/JBU.svg', tile: '', guess: false });
  delete B._GATE_MARK_MISSED['/logos/symbols/airlines/B6.svg'];
});

test('the white strip never draws a white mark, and the countdown never a symbol of the colour it stands on', () => {
  // THE STRIP IS WHITE: Porter, PAL, Delta with Endeavor, and LATAM with its two sisters drew white on it
  const STRIP = {
    PD: '/logos/airlines/canadian/porter/porter-p-navy.svg', PB: '/logos/airline-tiles/PB.svg',
    DL: '/logos/airlines/us-major/delta-emblem-colour.svg', DAL: '/logos/airlines/us-major/delta-emblem-colour.svg', '9E': '/logos/airlines/us-major/delta-emblem-colour.svg',
    LA: '/logos/symbols/airlines/LA.svg', JJ: '/logos/symbols/airlines/LA.svg', '4C': '/logos/symbols/airlines/LA.svg'
  };
  for (const [code, file] of Object.entries(STRIP)) {
    assert.equal(ends(B._gateMarkPick(B._BW_EMBLEM, code)), file, code);
    const ink = paints(file);
    // (the colour widget of Delta is a picture inside a drawing: it was looked at, and it is red)
    assert.ok(ink.some((c) => !isWhite(c)) || (wrapsPicture(file) && /colour/.test(file)), code + ': ' + file + ' paints ' + ink.join(' '));
    // what the orb table hands the orbs for this code is the white cut, or mostly white
    const orb = the('AIRLINE_EMBLEM_FILES')[code];
    if (code !== 'DAL') assert.ok(orb && orb.split('?')[0] !== file, code + ': the orb keeps its own file, ' + orb);
  }
  // the marks that are white only, as the orb table names them: none reaches the strip
  for (const [code, orb] of [['PD', '/logos/airlines/canadian/porter-p.svg'], ['PB', '/logos/airline-tiles/PB-arrow.svg'], ['DL', '/logos/airlines/us-major/delta-widget-monochrome-white.svg']]) {
    assert.ok(paints(orb).every(isWhite), orb + ' is white only');
    assert.equal(the('AIRLINE_EMBLEM_FILES')[code].split('?')[0], orb, code);
  }
  // and over every code: no drawing that ends on the strip is white only
  const white = [];
  for (const code of CODES) {
    const file = ends(B._gateMarkPick(B._BW_EMBLEM, code));
    if (!file || !/\.svg(\?|$)/.test(file)) continue;
    const ink = paints(file);
    if (ink.length && ink.every(isWhite)) white.push(code + ' ' + file);
  }
  assert.deepEqual(white, [], 'white on the white strip');
  // LATAM: the spark cut for dark grounds is white for most of its ink; the strip draws the colour cut
  assert.ok(paints('/logos/airlines/asian-other/latam-spark.svg').some(isWhite));
  assert.ok(!paints('/logos/symbols/airlines/LA.svg').some(isWhite));

  // THE COUNTDOWN STANDS ON THE COLOUR OF THE CARRIER: the fifteen whose symbol was that colour draw
  // their row tile, a square of the colour with the mark in white or in a second colour
  const CD = { LH: 'DLH', SN: 'BEL', LO: 'LOT', FI: 'ICE', EK: 'UAE', SQ: 'SIA', JL: 'JAL', CX: 'CPA', KE: 'KAL', JQ: 'JST', CM: 'CMP', AM: 'AMX', JU: 'ASL', HA: 'HAL', IB: 'IBE' };
  for (const [code, tile] of Object.entries(CD)) {
    const file = '/logos/airline-tiles/' + tile + '.svg';
    assert.equal(B._CD_MARK[code], file, code);
    assert.equal(TILE[code], tile, code + ': its row tile');
    assert.equal(ends(B._gateMarkPick(B._CD_MARK, code)), file, code);
    // the tile paints a ground and a mark: two colours or more, so the mark cannot be the ground
    assert.ok(paints(file).length >= 2, code + ': ' + paints(file).join(' '));
  }
  // the countdown keeps the colour marks it had
  assert.equal(B._CD_MARK.DL, '/logos/airlines/us-major/delta-emblem-colour.svg');
  assert.equal(B._CD_MARK.WS, '/logos/airlines/canadian/westjet-2025/WestJet-leaf-colour.svg');
  // and the strip the ones it had
  assert.deepEqual([B._BW_EMBLEM.UA, B._BW_EMBLEM.LX, B._BW_EMBLEM.WS], ['/logos/airline-tiles/UA-globe-glossy.png?v=22350', '/logos/airline-tiles/SWR.svg', '/logos/airlines/canadian/westjet-2025/WestJet-leaf-colour.svg']);
  for (const t of [B._BW_EMBLEM, B._CD_MARK]) for (const [code, u] of Object.entries(t)) assert.ok(onDisk(u), code + ': ' + u);
});

// ── 6. lettering that is typed text ────────────────────────────────────────
// One file of typed text is still handed to a surface: the lettering of Republic in the
// Operated-by caption of a gate (and its lockup, the same typed words). Taking it out would
// change the caption of every American, Delta and United gate Republic flies for, which is a
// decision about that caption and not a table edit; it needs outlines of the Republic lettering.
const TYPED_TEXT_KEPT = ['/logos/airlines/us-regional/republic-wordmark-dark.svg', '/logos/airlines/us-regional/republic-wordmark-light.svg', '/logos/airlines/us-regional/republic.svg'];

test('lettering that is typed text is in no table: TAP, LOT, Royal Air Maroc and Republic type their name', () => {
  // a drawing that sets words as text: a text element with letters in it, outside the notes of the file
  const notes = (svg) => { let out = '', i = 0; for (;;) { const a = svg.indexOf('<!--', i); if (a < 0) return out + svg.slice(i); out += svg.slice(i, a); const b = svg.indexOf('-->', a); if (b < 0) return out; i = b + 3; } };
  const typed = (u) => /\.svg(\?|$)/.test(u) && onDisk(u) && /<(?:text|tspan)\b[^>]*>[^<]*[A-Za-z]/.test(notes(read(u)));
  assert.equal(typed('/logos/airlines/canadian-regional/pacific-coastal-wordmark-dark.svg'), false, 'a note that says the word text is not typed text');
  // the four sets of files are what the audit says: one line of text in a font of the system
  for (const u of ['/logos/airlines/european/tap-portugal-wordmark-light.svg', '/logos/airlines/european/tap-portugal-wordmark-dark.svg', '/logos/airlines/european/tap-portugal-wordmark-color.svg',
    '/logos/airlines/european/lot-wordmark-light.svg', '/logos/airlines/european/lot-wordmark-dark.svg', '/logos/airlines/european/lot-wordmark-color.svg',
    '/logos/airlines/alliances/royal-air-maroc-wordmark-light.svg', '/logos/airlines/alliances/royal-air-maroc-wordmark-dark.svg', '/logos/airlines/alliances/royal-air-maroc-wordmark-color.svg',
    '/logos/airlines/us-regional/republic-wordmark-light.svg', '/logos/airlines/us-regional/republic-wordmark-dark.svg']) {
    assert.ok(typed(u), u + ' holds typed text');
    assert.match(read(u), /font-family="Helvetica Neue, Arial, sans-serif"/, u);
  }
  // the four codes have no lettering row; the row types the name beside the tile, or the monogram
  for (const code of ['TP', 'LO', 'AT', 'YX']) {
    assert.equal(WM[code], undefined, code);
    assert.equal(SHARED.FIDS_SHARED_WORDMARK[code], undefined, code + ': the app copy');
    assert.equal(the('WATERMARK_OVERRIDE')[code], undefined, code + ': the sky watermark');
    assert.equal(the('_welcomeCardName')(code).wordmark, '', code + ': the Welcome card types the name');
    // (the phone gate header reads the pair of the Operated-by caption for Republic: the ledger above)
    if (code !== 'YX') assert.equal(the('_mgHeaderLogoSrc')(code, true), '', code + ': the phone gate header types the name');
  }
  for (const [code, tile] of [['TP', 'TAP'], ['LO', 'LOT'], ['AT', 'RAM']]) assert.equal(srcOf(the('mkLogo')(code, '')), '/logos/airline-tiles/' + tile + '.svg', code + ': its tile, with the typed name');
  assert.match(the('mkLogo')('YX', ''), /logo-monogram/, 'Republic: the monogram, where its mark slot was empty');
  for (const base of ['tap-portugal', 'lot', 'royal-air-maroc', 'republic']) {
    assert.ok(!Object.values(WM).includes(base), base);
    assert.equal(the('COLOR_WORDMARKS')[base], undefined, base);
  }
  // EVERY FILE EVERY LETTERING TABLE NAMES: none is typed text, but for the ledger above
  const named = new Set();
  for (const base of new Set(Object.values(WM))) for (const v of ['light', 'dark']) named.add(the('wordmarkSrc')(base, v).split('?')[0]);
  for (const t of ['COLOR_WORDMARKS', 'WATERMARK_OVERRIDE', 'OPERATOR_WORDMARKS', 'OPERATOR_LOGOS', 'WELCOME_CARD_WORDMARK', 'LOCAL_LOGOS']) for (const u of Object.values(plain(the(t)))) named.add(String(u).split('?')[0]);
  for (const t of ['OPBY_WORDMARKS_THEMED', 'WORDMARK_RASTER', 'MG_LOGO_FILES']) for (const pair of Object.values(plain(the(t)))) for (const u of Object.values(pair || {})) if (u) named.add(String(u).split('?')[0]);
  for (const pair of Object.values(SHARED.FIDS_SHARED_WORDMARK)) for (const u of pair) named.add(u);
  assert.ok(named.size >= 220, named.size + ' lettering files named');
  assert.deepEqual([...named].filter(typed).sort(), TYPED_TEXT_KEPT, 'typed text shown as an airline lettering: the ledger can only shrink');
  // the sweep found one more: the sky watermark of Delta was a widget beside DELTA typed in a system font
  assert.equal(typed('/logos/airlines/us-major/delta-on-black.svg'), true);
  assert.equal(the('WATERMARK_OVERRIDE').DL, '/logos/airlines/us-major/delta-wordmark-light.svg');
});

// ── 7. a row state that swallows the lettering ─────────────────────────────
test('on the row state that is the colour of its lettering, the row types the name in its own ink', () => {
  const types = the('_rowStateTypesName');
  // the table, whole: two letterings on Final Call, one on Delayed
  assert.deepEqual(plain(the('ROW_STATE_TYPES_NAME')), { 'final-call': { easyjet: 1, gol: 1 }, delayed: { etihad: 1 } });
  for (const code of ['U2', 'EZY', 'EC', 'EJU', 'EZS', 'G3']) {
    assert.equal(types('final-call', WM[code]), true, code + ' on Final Call');
    for (const st of ['delayed', 'scheduled', 'boarding', 'cancelled', 'departed', '']) assert.equal(types(st, WM[code]), false, code + ' on ' + st);
  }
  assert.equal(types('delayed', WM.EY), true, 'Etihad on Delayed');
  for (const st of ['final-call', 'scheduled', 'boarding', 'cancelled', '']) assert.equal(types(st, WM.EY), false, 'Etihad on ' + st);
  for (const code of ['AC', 'WS', 'LH', 'DL']) for (const st of ['final-call', 'delayed']) assert.equal(types(st, WM[code]), false, code);
  assert.equal(types('final-call', undefined), false);
  // WHY: the colour cut the row asks for in that state is the colour of the row
  const ROW = { 'final-call': ['#F28C00'], delayed: ['#EDBB00', '#F9D44C'] };
  const css = ['css/fids.css', 'css/display-overrides.css'].map((f) => fs.readFileSync(path.join(FC, f), 'utf8')).join('\n').toUpperCase();
  for (const c of [].concat(...Object.values(ROW))) assert.ok(css.includes(c), 'the stylesheets paint a row ' + c);
  for (const [st, base, ink] of [['final-call', 'easyjet', '#ff6600'], ['final-call', 'gol', '#eb7302'], ['delayed', 'etihad', '#c89801']]) {
    const cut = the('wordmarkSrc')(base, 'dark');
    assert.ok(paints(cut).includes(ink), base + ': its colour cut paints ' + paints(cut).join(' '));
    for (const row of ROW[st]) assert.ok(contrast(ink, row) < 2, base + ' ' + ink + ' on a ' + st + ' row ' + row + ' reads at ' + contrast(ink, row).toFixed(2) + ' to 1');
    // and the ink of the row reads there
    for (const row of ROW[st]) assert.ok(contrast('#14263F', row) >= 4.5, 'the row ink on ' + row);
  }
  // the row consults it: lettering only when the state does not swallow it, else the name span, whose
  // style carries no brand colour on a state row (_brandInkOk)
  assert.match(CORE, /const _rowTypesName = _rowStateTypesName\(stKey, _wordmarkBase\);/);
  assert.match(CORE, /const _airlineLabelHtml = \(_airlineStyleForRow === 'emblem'\) \? '' : \(\(_wordmarkBase && !_rowTypesName\)\n\s*\? `<img class="fids-airline-wordmark"/);
  assert.match(CORE, /const _brandInkOk = !\(isDelayed \|\| stKey === 'final-call' \|\| isCanc \|\| isDiv/);
  assert.match(CORE, /const isDelayed = stKey === 'delayed';/);
  // the Delayed bar of the belt reads the same table
  assert.match(CORE, /const _bTypesName = isDelayed && _rowStateTypesName\('delayed', _bWmBase\);/);
  assert.match(CORE, /const _b3Wm = \(_bidsEmblemOnly \|\| _bNoName\) \? '' : \(\(_bWmBase && !_bTypesName\)/);
  // the mark slot still holds the tile on those rows
  for (const code of ['U2', 'G3', 'EY']) assert.match(the('mkLogo')(code, ''), /data-logo-set="tile"/, code);
});

// ── 8. the belt ────────────────────────────────────────────────────────────
test('the belt types no name beside a lockup, and still types it beside a tile or a monogram', () => {
  const lockup = the('_logoIsLockup');
  // Sunwing: a lockup and no tile or lettering, so its mark is the mark and the name together
  const wg = the('mkLogo')('WG', 'Sunwing');
  assert.equal(lockup(wg), true);
  assert.equal(WM.WG, undefined); assert.equal(TILE.WG, undefined);
  const hall = the('_b5Airline')({ airline: 'WG', _airlineName: 'Sunwing' });
  assert.match(hall, /^<span class="b5-emb"><img class="full-logo"[^>]*Sunwing-Logo-Colour\.png[^>]*><\/span>$/, 'the lockup alone');
  assert.doesNotMatch(hall, /b5-aname|b5-wm/);
  // a tile, a monogram: the name is typed beside it; lettering: drawn beside it
  assert.match(the('_b5Airline')({ airline: 'NH', _airlineName: 'ANA' }), /ANA\.svg[^>]*><\/span><span class="b5-aname">ANA<\/span>$/);
  assert.match(the('_b5Airline')({ airline: 'ZG', _airlineName: 'Zipair' }), /logo-monogram[^>]*>ZG<\/div><\/span><span class="b5-aname">ZIPAIR<\/span>$/);
  assert.match(the('_b5Airline')({ airline: 'AC', _airlineName: 'Air Canada' }), /<span class="b5-wm" data-name="AIR CANADA">/);
  for (const code of ['AC', 'NH', 'ZG', 'TP', 'YX', '9M']) assert.equal(lockup(the('mkLogo')(code, '')), false, code);
  // every code that is a lockup on the row has neither tile nor lettering, so nothing is lost
  const lockups = CODES.filter((c) => lockup(the('mkLogo')(c, '')));
  assert.ok(lockups.includes('WG'));
  for (const c of lockups) assert.ok(!TILE[c] && !WM[c] && the('LOCAL_LOGOS')[c], c);
  // the two belt rows ask the same question
  assert.match(CORE, /const _bNoName = !_bWmBase && _logoIsLockup\(logoHtml\);/);
  assert.match(CORE, /const _bAirlineHtml = \(_bidsEmblemOnly \|\| _bNoName\) \? ''/);
  assert.match(CORE, /var mark = \(!base && _logoIsLockup\(logo\)\) \? '' : base/);
});

// ── 9. Central Mountain Air ────────────────────────────────────────────────
test('Central Mountain Air is an airline of its own: its name and its number, never Air Canada', () => {
  const PARENT = plain(the('PARENT'));
  assert.equal(PARENT['9M'], undefined, 'not folded into Air Canada');
  assert.deepEqual([NAME['9M'], NAME2['9M']], ['CENTRAL MOUNTAIN AIR', 'Central Mountain Air']);
  assert.equal(SHARED.FIDS_SHARED_AIRLINE['9M'], 'CENTRAL MOUNTAIN AIR', 'the app copy');
  assert.doesNotMatch((/const REGIONAL_FAM=\{[^}]*\}/.exec(APP) || [''])[0], /9M/, 'the app family table');
  assert.doesNotMatch((/const REGIONAL_OP=\{[^}]*\}/.exec(APP) || [''])[0], /9M/);
  // a row of the Prince George feed: 9M708 from Terrace
  const AT = new Date(Math.floor(Date.now() / 3600000) * 3600000 + 3600000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  const row = { number: '9M 708', status: 'Expected', arrival: { scheduledTime: { local: AT, utc: AT }, airport: { iata: 'YXS' }, airline: { iata: '9M', name: 'Central Mountain Air' } },
    departure: { airport: { iata: 'YXT', name: 'Terrace' } }, airline: { iata: '9M', name: 'Central Mountain Air' } };
  const out = the('mapADB')({ arrivals: [row] }, 'arr');
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].airline, out[0].flight], ['9M', '9M708'], 'its own code and its own number');
  assert.equal(String(the('tcAirline')(out[0]._airlineName || NAME[out[0].airline], out[0].airline)), 'Central Mountain Air');
  // no Air Canada art, lettering, fold, family or alliance
  assert.match(the('mkLogo')('9M', ''), /^<div class="full-logo logo-monogram" data-code="9M"[^>]*>9M<\/div>$/, 'no art on disk: the monogram');
  assert.equal(WM['9M'], undefined); assert.equal(TILE['9M'], undefined); assert.equal(EMBLEM['9M'], undefined);
  assert.equal(the('AIRLINE_EMBLEM_FILES')['9M'], undefined);
  assert.equal(the('_orbEmblemCarrier')('9M'), '9M');
  assert.equal(the('_gateFamily')('9M'), '9M', 'its own pool of aeroplanes');
  assert.equal(the('_CS_REGIONAL_FAM')['9M'], undefined);
  assert.equal(the('_fidsCsCarrier')('9M708'), '9M');
  assert.equal(the('_welcomeCardEmblem')('9M').src, '');
  assert.doesNotMatch(CORE, /'9M'\s*:\s*'(?:star|AC|air-canada|AIR CANADA|Air Canada)'/);
  for (const text of [the('mkCardLogo')('9M', ''), B._gateCardOrb('9M', '').html, B._gateOrbParts('9M').path, the('carrierLogoUrl')('9M')]) assert.doesNotMatch(String(text), /air-canada|AC\.TO|ACA-black/i);
  // the other two codes of that fold were looked at and left as they were: no airline flies under
  // either as a partner of Air Canada today, and neither is on a recorded row
  assert.deepEqual([PARENT.ZX, PARENT['9L']], ['AC', 'AC']);
  // an Air Canada row is untouched
  const ac = the('mapADB')({ arrivals: [Object.assign({}, row, { number: 'AC 8421', airline: { iata: 'AC', name: 'Air Canada' }, arrival: Object.assign({}, row.arrival, { airline: { iata: 'AC', name: 'Air Canada' } }) })] }, 'arr');
  assert.deepEqual([ac[0].airline, ac[0].flight], ['AC', 'AC8421']);
});
