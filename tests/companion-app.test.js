'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24030 — THE COMPANION APP (app.html) TELLS THE TRUTH, IN NINE LANGUAGES.
//
// Worked on 2026-10-10, which answers decision D6 ("translate now, or leave
// it to its replacement": now). It used to:
//   - make statuses up from the clock: Boarding 45 minutes out, Final call
//     at 12, Departed 2 minutes after the time, whatever the airport said;
//   - show the printed time only, never the airport's new one;
//   - print a 24-hour clock in English, and a far-end "Arr" time that was
//     this airport's own time again;
//   - speak three languages;
//   - load Inter from Google; leave its tab bar white in dark mode; say
//     "No departures right now" while it was still loading.
// The status is now the boards' rule (fids-core.js adbStatus), times read the
// boards' clock (BoardStrings.boardTime), and every word comes from the store.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BS = require('../fids-current/js/board-strings.js');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'fids-current/app.html'), 'utf8');

function fn(name) {
  const at = APP.search(new RegExp('\\nfunction ' + name + '\\('));
  assert.ok(at >= 0, name + ' must exist');
  let i = APP.indexOf('{', at), d = 0;
  for (; i < APP.length; i++) {
    const c = APP[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < APP.length && APP[i] !== q; i++) if (APP[i] === '\\') i++; continue; }
    if (c === '/' && APP[i + 1] === '/') { i = APP.indexOf('\n', i); continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return APP.slice(at + 1, i + 1);
  }
  throw new Error(name);
}
const line = (re) => { const m = APP.match(re); assert.ok(m, String(re)); return m[0]; };

// adbToCard with the tables it reads stubbed
const card = new Function(['REGIONAL_FAM', 'AIRLINE', 'BRAND', 'REGIONAL_OP', 'wmUrls'],
  fn('adbHHMM') + fn('inferOperator') + fn('adbToCard') + '; return adbToCard;')({}, {}, {}, {}, () => null);
const MIN = 60000;
const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
const loc = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
function row(o) {
  const dep = Date.now() + (o.inMin || 0) * MIN;
  const d = { scheduledTime: { utc: iso(dep), local: loc(dep) } };
  if (o.revMin != null) { const r = dep + o.revMin * MIN; d.revisedTime = { utc: iso(r), local: loc(r) }; }
  if (o.runwayAgo != null) { const r = Date.now() - o.runwayAgo * MIN; d.runwayTime = { utc: iso(r), local: loc(r) }; }
  return { number: 'AC 123', airline: { iata: 'AC' }, status: o.status || '', departure: d, arrival: { airport: { iata: 'YYZ' } } };
}

test('a status is the airport\'s word, never the clock\'s', () => {
  // ten minutes out, the feed saying only Scheduled: no Boarding, no Final call
  assert.equal(card(row({ inMin: 10, status: 'Scheduled' }), 'dep').state, 'scheduled');
  assert.equal(card(row({ inMin: 40, status: '' }), 'dep').state, 'scheduled');
  // past its time with nothing said: still not Departed
  assert.equal(card(row({ inMin: -6, status: 'Scheduled' }), 'dep').state, 'scheduled');
  // the feed's own words
  assert.equal(card(row({ inMin: 20, status: 'Boarding' }), 'dep').state, 'boarding');
  assert.equal(card(row({ inMin: 5, status: 'Final Call' }), 'dep').state, 'final');
  assert.equal(card(row({ inMin: 20, status: 'OnTime' }), 'dep').state, 'ontime');
  assert.equal(card(row({ inMin: 20, status: 'Expected' }), 'dep').state, 'expected');
  assert.equal(card(row({ inMin: -60, status: 'Arrived' }), 'dep').state, 'departed', '"Arrived" on a departure is a departure');
  assert.equal(card(row({ inMin: 20, status: 'Canceled' }), 'dep').state, 'cancelled');
  // an actual runway time is evidence
  assert.equal(card(row({ inMin: -10, runwayAgo: 3 }), 'dep').state, 'departed');
  // a moved time: Delayed (5 minutes or more), with the new time
  const late = card(row({ inMin: 20, revMin: 40 }), 'dep');
  assert.equal(late.state, 'delayed');
  assert.notEqual(late.estTime, late.schedTime);
  assert.equal(card(row({ inMin: 20, revMin: 3 }), 'dep').state, 'scheduled');
  assert.equal(card(row({ inMin: 30, revMin: -10 }), 'dep').state, 'early');
  // and the clock's old rules are gone
  assert.doesNotMatch(APP, /_mins<=12\)state='final'|_mins<=45\)state='boarding'|state='outgate'/);
});

test('every status has its word, Scheduled and Expected in no status colour', () => {
  const ST = new Function(line(/^const ST_WORD=\{[\s\S]*?\};/m) + '; return ST_WORD;')();
  for (const k of ['cancelled', 'diverted', 'departed', 'active', 'arrived', 'boarding', 'final', 'gateclosed', 'delayed', 'early', 'ontime', 'expected', 'scheduled']) assert.ok(ST[k], k);
  assert.equal(ST.scheduled[1], 'neutral');
  assert.equal(ST.expected[1], 'neutral');
  assert.match(APP, /\.st\.neutral\{color:var\(--muted\);\}/);
});

test('times read the boards\' clock: 12-hour in English, 24-hour in the other eight', () => {
  const mk = (L) => new Function('window', 'langRes', 'esc', fn('clk') + '; return clk;')({ BoardStrings: BS }, () => L, String);
  assert.equal(mk('en')('15:09'), '3:09<small>PM</small>');
  for (const L of ['fr', 'es', 'de', 'ja', 'ar']) assert.equal(mk(L)('15:09'), '15:09', L);
  assert.match(APP, /const otherLine=\(f\.otherTime&&f\.durMin>0\)/, 'a far-end time only when it is real');
});

test('every word of the app is in the store, in all nine languages', () => {
  const map = new Function(line(/^const APP_KEY=\{[^\n]*\};/m) + '; return APP_KEY;')();
  assert.ok(Object.keys(map).length >= 50);
  for (const [k, sk] of Object.entries(map)) {
    for (const L of BS.LANGS) assert.ok(BS.bs(sk, L), `${k} (${sk}) in ${L}`);
  }
  assert.match(APP, /<script src="js\/board-strings\.js\?v=\d+"><\/script>/);
  assert.match(APP, /const APP_LANGS=\(window\.BoardStrings&&BoardStrings\.LANGS\)\|\|\[\];/, 'the store\'s nine languages');
});

test('the boards\' font from this site, the tab bar dark in dark mode, loading says loading', () => {
  assert.doesNotMatch(APP, /fonts\.googleapis\.com|'Inter'/);
  assert.match(APP, /font-family:'Bricolage Grotesque';[^}]*src:url\('fonts\/bricolage\/BricolageGrotesque-latin\.woff2'\)/);
  assert.match(APP, /:root\[data-theme="dark"\] \.nav\{background:rgba\(10,13,19,\.94\);\}/);
  assert.match(APP, /\(!LOADED\?BoardStrings\.bs\('appLoading',langRes\(\)\)/);
  for (const L of BS.LANGS) assert.ok(BS.bs('appLoading', L), L);
});
