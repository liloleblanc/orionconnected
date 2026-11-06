'use strict';

// v24120 — A LANDED INBOUND IS DOWN, NOT ON THE STAND.
//
// Sea-Tac, 2026-11-05 02:10Z: AC8806 from Vancouver, inbound to S1A, said only
// "Landed". The board folded the word into 'arrived' twice over (the worker's
// yhzStatus, then adbStatus here) and 'arrived' reads as on its blocks: the
// Your Aircraft card said "Arrived at the gate | 6:22pm", the schedule, while
// the map still had the jet rolling out on 16C.
//
// Now a raw 'landed' row stays 'landed'. It is down for everything that asks
// whether it came down (fidsInboundHasArrived, _gateRawLanded, the claim
// margins of v24107, the rows' place on the board), it says Landed on the
// rows, and it is NOT on the stand (fidsInboundOnStand): the card says
// "Landed and taxiing" until the airport says Arrived.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BS = require('../fids-current/js/board-strings.js');

const root = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const V2 = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-v2.js'), 'utf8');
const workerPath = path.join(root, 'workers', 'fids-proxy.js');
const MIN = 60000;
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];

// From `function NAME(` (or a `var NAME = {`) to its matching brace; strings
// and comments skipped.
function braceFrom(SRC, start, what) {
  assert.ok(start >= 0, what + ' must exist');
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < SRC.length && SRC[i] !== c; i++) if (SRC[i] === '\\') i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error('could not find the end of ' + what);
}
function fnIn(SRC, name) {
  const m = SRC.match(new RegExp('(^|\\n)function ' + name + '\\('));
  assert.ok(m, name + ' must be declared');
  return braceFrom(SRC, m.index + (m[1] ? 1 : 0), name);
}
const varLine = (name) => {
  const m = CORE.match(new RegExp('^(?:var|const) ' + name + ' = [^\\n]+', 'm'));
  assert.ok(m, name + ' must exist');
  return m[0];
};
const varBlock = (name) => braceFrom(CORE, CORE.indexOf('var ' + name + ' = {'), name) + ';';
function slice(from, to) {
  const a = CORE.indexOf(from);
  assert.ok(a >= 0, 'fids-core.js must still contain: ' + from);
  const b = CORE.indexOf(to, a);
  assert.ok(b > a, 'fids-core.js must still contain: ' + to);
  return CORE.slice(a, b);
}

const FNS = ['adbTs', '_adbNearestDayTs', '_adbLegUpdateTs', '_adbHappenedWord', '_adbClaimAheadMs', '_adbClaimWithheld',
  'adbStatus', 'adbStatusInferred', 'fidsInboundHasArrived', 'fidsInboundOnStand', 'fidsAdbStatusKey',
  '_gateRawStatus', '_gateRawLanded', '_gateOnBlocksWord', '_rowStatusRank', '_fidsBoardRowPlace'];
const E = new Function([
  varLine('_ADB_CLAIM_AHEAD_TIMED_MS'), varLine('_ADB_CLAIM_AHEAD_UNTIMED_MS'), varLine('_ADB_EXPLICIT_STATUS'),
  varBlock('_ROW_STATUS_RANK'), varLine('BOARD_TRAIL_MIN'), varLine('BOARDING_HOLD_MIN'), varLine('DEPART_TRAIL_HRS'),
  ...FNS.map((n) => fnIn(CORE, n)),
  'return { ' + FNS.map((n) => n + ': ' + n).join(', ') + ', UNTIMED: _ADB_CLAIM_AHEAD_UNTIMED_MS };'
].join('\n'))();

// mapADB's part: the row's status, where it came from, and the actual time.
function mapRow(f, now) {
  const leg = f.arrival || {};
  const s = leg.scheduledTime && (leg.scheduledTime.local || leg.scheduledTime.utc);
  const sched = E.adbTs(s);
  const st = E.adbStatus(f, 'arr', sched, now, E._adbClaimAheadMs([f], 'arr'));
  const rev = leg.runwayTime || leg.predictedTime || leg.revisedTime;
  return { flight: f.number, status: st, _sortTs: sched, _revTs: rev ? E.adbTs(rev.local || rev.utc) : null,
    _actualArrTime: (leg.runwayTime && (leg.runwayTime.local || leg.runwayTime.utc)) || null,
    _stInferred: E.adbStatusInferred(f, st) };
}
const SEA_ROW = '<tr class="ItemStyleClass"><td>Vancouver <span>(YVR)</span></td><td>Air Canada</td><td>AC8806</td>'
  + '<td>11-04-2026</td><td>6:22 PM</td><td><span>Landed</span></td><td>S1A</td><td>16</td>'
  + '<td><a data-target="#modalAirline19205265368806ACYVR"></a></td></tr>';
const SEA_NOW = Date.parse('2026-11-05T02:10:00Z');

test('the Sea-Tac row, through the worker and adbStatus: landed, down, not on the stand', async () => {
  const W = await import(workerPath);
  const [raw] = W.seaParsePage('<table>' + SEA_ROW + '</table>', 'arr', SEA_NOW);
  assert.equal(raw.status, 'landed', 'the worker keeps the airport word');
  const inb = mapRow(raw, SEA_NOW);
  assert.equal(inb.status, 'landed', 'adbStatus no longer folds it into arrived');
  assert.equal(inb._stInferred, false, 'the airport word, not the clock');
  assert.equal(E.fidsInboundHasArrived(inb, SEA_NOW), true, 'down: the map stops flying it, the notice stops');
  assert.equal(E._gateRawLanded(inb), true, 'landing evidence for the maps');
  assert.equal(E.fidsInboundOnStand(inb), false, 'not at the gate');
  assert.equal(E._fidsBoardRowPlace(inb, SEA_NOW), 'past', 'a row that has happened, like Arrived');
  // The same row once Sea-Tac says Arrived.
  const arrived = mapRow(W.seaParsePage('<table>' + SEA_ROW.replace('Landed', 'Arrived') + '</table>', 'arr', SEA_NOW)[0], SEA_NOW);
  assert.equal(arrived.status, 'arrived');
  assert.equal(E.fidsInboundOnStand(arrived), true);
});

test('fidsInboundOnStand: arrived, or an actual time beside any word but landed', () => {
  assert.equal(E.fidsInboundOnStand({ status: 'arrived' }), true);
  assert.equal(E.fidsInboundOnStand({ status: 'Arrived' }), true);
  assert.equal(E.fidsInboundOnStand({ status: 'landed' }), false);
  assert.equal(E.fidsInboundOnStand({ status: 'landed', _actualArrTime: '2026-11-05 09:05:00+00:00' }), false,
    'Heathrow writes Landed 05:09: that time is the touchdown');
  assert.equal(E.fidsInboundOnStand({ status: 'delayed', _actualArrTime: '2026-11-05 09:05:00+00:00' }), true, 'unchanged: an actual time beside another word');
  assert.equal(E.fidsInboundOnStand({ status: 'active' }), false);
  assert.equal(E.fidsInboundOnStand(null), false);
});

test('adbStatus keeps the two words apart on an arrival row and folds both into Departed on a departure row', () => {
  const now = Date.UTC(2026, 10, 5, 2, 10);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + '+00:00';
  const row = (status, mode, sched) => (mode === 'dep'
    ? { number: 'X1', status, departure: { scheduledTime: { utc: iso(sched) } }, arrival: {} }
    : { number: 'X1', status, arrival: { scheduledTime: { utc: iso(sched) } }, departure: {} });
  assert.equal(E.adbStatus(row('Landed', 'arr', now + 12 * MIN), 'arr', now + 12 * MIN, now, E.UNTIMED), 'landed');
  assert.equal(E.adbStatus(row('Arrived', 'arr', now + 12 * MIN), 'arr', now + 12 * MIN, now, E.UNTIMED), 'arrived');
  // A Landed two hours ahead of its own time is still withheld (v24107), and says so.
  const early = row('Landed', 'arr', now + 120 * MIN);
  const st = E.adbStatus(early, 'arr', now + 120 * MIN, now, E.UNTIMED);
  assert.equal(st, 'scheduled');
  assert.equal(E._adbClaimWithheld(early, 'arr', st), true);
  assert.equal(E._adbClaimWithheld(row('Landed', 'arr', now), 'arr', 'landed'), false, 'believed: its own word');
  assert.equal(E.adbStatus(row('Landed', 'dep', now - 20 * MIN), 'dep', now - 20 * MIN, now, E.UNTIMED), 'departed');
  // The status-key normaliser (the push merge, the by-registration lookup).
  assert.equal(E.fidsAdbStatusKey('Landed'), 'landed');
  assert.equal(E.fidsAdbStatusKey('Arrived'), 'arrived');
  assert.equal(E.fidsAdbStatusKey(9), 'arrived', 'the AeroDataBox enum has no Landed');
  // Two copies of one arrival: the one on its blocks knows the most.
  assert.ok(E._rowStatusRank('landed') > E._rowStatusRank('active'));
  assert.ok(E._rowStatusRank('arrived') > E._rowStatusRank('landed'));
});

// ── The Your Aircraft card, from its own statements ─────────────────────
require('../fids-current/js/board-strings.js');
const DICT = braceFrom(CORE, CORE.indexOf('var _GATE_LBL = {'), '_GATE_LBL');
const LBL = braceFrom(CORE, CORE.indexOf('function _gateLbl(key, frFirst, wrap, sep, keepDup)'), '_gateLbl');
const gateLbl = new Function('langs', DICT + '\n' + LBL + '\nreturn _gateLbl;')(['en', 'fr']);
const KEY_SRC = slice("var _rawSt = String(_ib.status || '').toLowerCase().trim();", '      // Verified airborne');
const STAND_SRC = slice('      var _mcOnStand = false;', "      // v23935 — the instant this card's day line is read from");
const LINE_SRC = slice('var _mcEvtHtml = _mcEvtStr', 'var _mcFromConn');
const card = new Function('_ib', '_ibFmtT', '_ibArrSchedStr', '_ibArrRevStr', '_ibRevTs', '_railT', '_frF', '_gateLbl', 'fidsInboundOnStand',
  KEY_SRC + STAND_SRC + LINE_SRC + '\nreturn { stKey: _stKey, onStand: _mcOnStand, evt: _mcEvtStr, key: _mcSentKey, line: _mcArrLine };');
const strip = (h) => { let s = String(h), p; do { p = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== p); return s; };
const railT = (t) => String(t || '').replace(/\s*([AP]M)\b/gi, (m, p) => p.toLowerCase());
function cardFor(ib) {
  const fmt = (ts) => new Date(ts).toISOString().slice(11, 16);
  const sched = ib._sortTs ? fmt(ib._sortTs) : '';
  const rev = (ib._revTs && Math.abs(ib._revTs - ib._sortTs) >= 60000) ? fmt(ib._revTs) : '';
  const r = card(ib, fmt, sched, rev, ib._revTs || 0, railT, false, gateLbl, E.fidsInboundOnStand);
  const i = r.line.indexOf('<span class="v2-fi-lbl-2');
  r.en = strip(i < 0 ? r.line : r.line.slice(0, i)).trim();
  r.fr = i < 0 ? '' : strip(r.line.slice(i)).trim();
  return r;
}

test('the card: the Sea-Tac inbound says Landed and taxiing, with no time, never Arrived at the gate at its schedule', async () => {
  const W = await import(workerPath);
  const inb = mapRow(W.seaParsePage('<table>' + SEA_ROW + '</table>', 'arr', SEA_NOW)[0], SEA_NOW);
  const c = cardFor(inb);
  assert.equal(c.stKey, 'arrived', 'the card reads it as down');
  assert.equal(c.onStand, false);
  assert.equal(c.key, 'acLandedTaxiNoTime');
  assert.equal(c.en, 'Landed and taxiing');
  assert.equal(c.fr, 'Atterri, au roulage');
  assert.doesNotMatch(c.line, /02:22|Arrived at the gate/, 'not the schedule, not the gate');
});

test('the card: a landed row with a time of its own says when; on its blocks it says Arrived at the gate', () => {
  const sched = Date.UTC(2026, 10, 5, 2, 22);
  const landed = cardFor({ status: 'landed', _sortTs: sched, _revTs: sched - 17 * MIN, _actualArrTime: '2026-11-05 02:05:00+00:00' });
  assert.equal(landed.onStand, false, 'a landed time is the touchdown');
  assert.equal(landed.key, 'acLandedTaxi');
  assert.equal(landed.en, 'Landed at 02:05 and taxiing');
  const arrived = cardFor({ status: 'arrived', _sortTs: sched, _revTs: null });
  assert.equal(arrived.onStand, true);
  assert.equal(arrived.key, 'acArrivedGateShort');
  assert.equal(arrived.en, 'Arrived at the gate | 02:22');
  // The overview card says the same word as this card.
  assert.match(CORE, /st: \(_stKey === 'arrived' && !_mcOnStand\) \? 'landed' : String\(_stKey \|\| ''\)/);
  const GC = new Function(varBlock('_GC_STATUS') + '\nreturn _GC_STATUS;')();
  assert.deepEqual(GC.landed, ['landed', 'ok']);
});

test('the other inbound panels read the same test', () => {
  // The v2 rail and the g8 layout: Your aircraft has arrived (not at the gate) while landed.
  assert.match(CORE, /var _inbOnStand = _inbArrivedV2 && fidsInboundOnStand\(inboundFlight\);/);
  assert.match(CORE, /var _inbOnStandG8 = inArrived && fidsInboundOnStand\(inboundFlight\);/);
  assert.match(CORE, /inStBadge = '<div class="g8-inb-status">' \+ SL\(_inbOnStandG8 \? 'arrived' : 'landed'\) \+ '<\/div>';/);
  // The phone gate: At the gate only on its blocks, Landed while down.
  assert.match(CORE, /var _onStand = _inbDown && fidsInboundOnStand\(_inb\);\s*if \(_onStand\) _etaStr = TL\('atGateLbl'\);\s*else if \(_inbDown\) _etaStr = SL\('landed'\);/);
  assert.doesNotMatch(CORE, /_inb\.status === 'arrived' \|\| _inb\.status === 'landed'\);\s*if \(_onStand\)/);
  // Nothing else reads the raw word as on stand.
  assert.doesNotMatch(CORE, /landed:'arrived'/);
});

test('the rows say Landed, in the Arrived row and colour, in all nine languages', () => {
  const win = {};
  vm.runInNewContext(V2, { window: Object.assign(win, { BoardStrings: BS }), BoardStrings: BS, document: { addEventListener() {}, querySelectorAll: () => [] }, console });
  const SS = new Function(braceFrom(CORE, CORE.indexOf('const SS = {'), 'SS').replace(/^const /, 'var ') + ';\nreturn SS;')();
  for (const l of LANGS) {
    const landed = win.fidsFormatStatus({ status: 'landed' }, l);
    assert.equal(landed.html, SS.landed[l], 'Landed on the board reads as the gate says it in ' + l);
    assert.equal(landed.html, BS.entry('stLanded')[l]);
    assert.equal(landed.cssClass, 'fids-status-arrived');
    assert.equal(win.fidsFormatStatus({ status: 'arrived' }, l).html, SS.arrived[l]);
    assert.notEqual(landed.html, SS.arrived[l], l);
  }
  assert.equal(win.fidsNormStatus('landed'), 'arrived', 'the row class and colour stay those of Arrived');
  // The phone board says Landed with its time too.
  assert.match(CORE, /if \(f\.status === 'landed'\)\s+stTxt = `\$\{SLbi\('landed'\)\} · \$\{_upd\}`;/);
});

// v24116 — Sea-Tac never writes Arrived. A landed inbound is at its gate once
// the page saw it get there: two stopped live fixes (_GATE_PARKED) or its taxi
// run to the stand (_gateTaxi done, this flight), so the card agrees with the map.
test('a landed inbound is at its gate on the map own evidence, and only its own', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
  const a = src.indexOf('\nfunction fidsInboundOnStand(') + 1;
  const body = src.slice(a, src.indexOf('\n}\n', a) + 2);
  const mk = (parked, taxi) => new Function('_GATE_PARKED', '_gateTaxi', '_gateRowKey', body + '\nreturn fidsInboundOnStand;')(parked, taxi, (r) => r.flight);
  const row = { flight: 'AC8806', status: 'landed' };
  require('node:assert/strict').equal(mk({}, { on: false })(row), false, 'landed and nothing else: taxiing');
  require('node:assert/strict').equal(mk({ AC8806: 1 }, { on: false })(row), true, 'two stopped live fixes at our field');
  require('node:assert/strict').equal(mk({}, { on: true, done: true, fl: 'AC8806' })(row), true, 'its taxi ran to the stand');
  require('node:assert/strict').equal(mk({}, { on: true, done: true, fl: 'PD2293' })(row), false, 'another flight taxi says nothing');
  require('node:assert/strict').equal(mk({}, { on: true, done: false, fl: 'AC8806' })(row), false, 'still taxiing');
  require('node:assert/strict').equal(mk({}, { on: false })({ flight: 'AC8806', status: 'arrived' }), true);
});
