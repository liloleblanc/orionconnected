'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24029 — THE PHONE BOARD (fids.html under 800px: the #mobileView card list)
//
// Redone 2026-10-10 (it was in poor shape): a slim header (the logo on the
// light surface, no card behind it; the clock; the board's band), Departures |
// Arrivals tabs instead of the list flipping by itself, one scrolling list,
// the board's own clock (12-hour on a board that leads in English) with the
// wall board's "+1", and the place name never cut with "…".
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = rd('fids-current/js/fids-core.js');
const HTML = rd('fids-current/fids.html');
const CSS = rd('fids-current/css/phone.css');

function fn(name) {
  const at = CORE.search(new RegExp('\\nfunction ' + name + '\\('));
  assert.ok(at >= 0, name + ' must exist');
  let i = CORE.indexOf('{', at), d = 0;
  for (; i < CORE.length; i++) { if (CORE[i] === '{') d++; else if (CORE[i] === '}' && --d === 0) return CORE.slice(at + 1, i + 1); }
  throw new Error(name);
}

test('the phone stylesheet is loaded last, and the guard scans it', () => {
  const links = [...HTML.matchAll(/<link rel="stylesheet" href="css\/([^"?]+)/g)].map((m) => m[1]);
  assert.equal(links[links.length - 1], 'phone.css');
  assert.match(rd('tests/i18n/policy.js'), /'fids-current\/css\/phone\.css'/);
  assert.match(CSS, /@media \(max-width: 800px\)/, 'the width fids.css shows #mobileView at');
});

test('the tabs choose Departures or Arrivals; the list never flips by itself', () => {
  assert.match(HTML, /<button class="m-tab" id="mTabDep" role="tab" onclick="fidsMobileTab\('dep'\)"><\/button>/);
  assert.match(HTML, /<button class="m-tab" id="mTabArr" role="tab" onclick="fidsMobileTab\('arr'\)"><\/button>/);
  assert.match(fn('fidsMobileTab'), /setViewMode\(m\)/);
  assert.match(fn('advancePage'), /^function advancePage\(\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*if \(viewMode === 'rotate' && _fidsPhoneList\(\)\) return;/);
  const rm = fn('renderMobile');
  assert.match(rm, /tD\.textContent = TL\('dep'\); tA\.textContent = TL\('arr'\);/, 'their words from the store, in the phone\'s language');
  assert.match(rm, /const PER = _fidsPhoneList\(\) \? _M_PHONE_ROWS : MOBILE_ROWS;/, 'one scrolling list on a phone');
});

test('times in the board\'s own clock, with the wall board\'s +1', () => {
  const clock = new Function('window', 'fidsEscHtml', fn('_mClock') + '; return _mClock;');
  const en = clock({ fidsFormatTime12: () => '3:09 PM' }, String);
  assert.equal(en('15:09'), '3:09<span class="cc-ap">PM</span>');
  const fr = clock({ fidsFormatTime12: () => '15:09' }, String);
  assert.equal(fr('15:09'), '15:09', 'a board that leads in another language reads 24-hour');
  const day = new Function('window', fn('_mDayPlus') + '; return _mDayPlus;');
  const plus = day({ FIDSGateDate: { dayOffset: () => 1 } });
  assert.equal(plus({ _sortTs: 1 }, 'America/Moncton'), '<sup class="cc-dayplus">+1</sup>');
  assert.equal(day({ FIDSGateDate: { dayOffset: () => 0 } })({ _sortTs: 1 }, 'America/Moncton'), '');
  const card = fn('renderMobileCompactCard');
  assert.match(card, /let timeMain = _mClock\(f\.time\) \+ _mDayPlus\(f, tz\);/);
  assert.match(card, /→ \$\{_mClock\(f\.upd\)\}/);
});

test('a place name is never cut, and its code stays with it', () => {
  assert.match(CSS, /\.cc-city \{[^}]*white-space: normal !important;[^}]*text-overflow: clip !important;/);
  assert.match(fn('renderMobileCompactCard'), /\.replace\(\/\\s\\\|\\s\/g, '\\u00a0\|\\u00a0'\)/);
});

test('the header is slim: the logo with nothing behind it, the clock, the band', () => {
  assert.match(CSS, /\.fids-airport-pill \{[^}]*background: none !important; box-shadow: none !important;/);
  assert.match(CSS, /\.fids-board-icon \{[^}]*background: none !important;/, 'no disc behind the board glyph');
  assert.match(CSS, /\.fids-banner \{[^}]*position: sticky !important;/);
});
