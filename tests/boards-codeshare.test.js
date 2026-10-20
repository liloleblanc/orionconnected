'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24071 — A CODESHARE IS ONE FLIGHT ON THE BOARDS.
//
// Sea-Tac's page lists every carrier selling a seat on a flight as its own
// row, and says nothing of who flies it. On 2026-10-12 the 1:45 PM to
// Amsterdam from gate A8 stood on the departures board five times (AF5597,
// DL142, KL6032, SV4469, VS3936), the 5:45 PM from A4 five more, and the two
// Amsterdam arrivals five times each. The board's duplicate check
// (_fidsDedupeRows) needs the same flight number, so all of them stood.
//
// fids-core.js _fidsOneRowPerFlight now runs after it, inside mapADB. Rows are
// one flight on the same day and minute, to or from the same airport, tied by
// the airport's own record (Sea-Tac's) or else by the same gate or the same
// (feed's own) belt with the same aircraft type on both, when nothing on them
// tells them apart, they are two carriers, never two numbers under 1000 of
// two carriers (the digits after the carrier's code: JetBlue's B6073 is 73);
// and a group is folded only onto the operator's own row, a number under
// 1000, or the carrier the airport's records show operating. The row kept is
// chosen by the Port Authority rule, now one function shared with the New
// York feeds (feed-router.js fidsOperatorRanker).
//
// The rows here are real: Sea-Tac as the worker served it while the 1:45 PM
// stood at A8 five times; Detroit, Washington National and Phoenix from the
// same hour, trimmed to the rows that share a minute and a far end with
// another; the New York boards' own rows (jfk-*-sample.json). The shipped
// code runs, lifted out of fids-core.js and feed-router.js by brace matching.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current/js/fids-core.js'), 'utf8');
const ROUTER = fs.readFileSync(path.join(ROOT, 'fids-current/js/feed-router.js'), 'utf8');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const SEA = fixture('sea-codeshare-2026-10-12.json');
const NEAR = fixture('codeshare-neighbours-2026-10-12.json');
const SEAP = fixture('sea-pages-2026-10-12.json');

// ── lifting real code ───────────────────────────────────────────────────────
function braceFrom(SRC, start, what) {
  assert.ok(start >= 0, what + ' must exist');
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) { if (SRC[i] === '\\') { i++; continue; } if (SRC[i] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return SRC.slice(start, i + 1) + '\n';
  }
  throw new Error('no end for ' + what);
}
const fnIn = (SRC, name) => {
  const m = SRC.match(new RegExp('\\nfunction ' + name + '\\('));
  assert.ok(m, name + ' must be declared');
  return braceFrom(SRC, m.index + 1, name);
};
const varIn = (SRC, name) => {
  const m = SRC.match(new RegExp('^var ' + name + ' = [^;]+;', 'm'));
  assert.ok(m, name + ' must exist');
  return m[0] + '\n';
};
// _ROW_STATUS_RANK spans lines
const rankTable = () => {
  const at = CORE.indexOf('var _ROW_STATUS_RANK = {');
  return braceFrom(CORE, at, '_ROW_STATUS_RANK').replace(/\n$/, ';\n');
};

const logs = [];
// the codeshare pass and what it is built from, as fids-core.js has them
const PASS = fnIn(CORE, '_fidsCsNum') + fnIn(CORE, '_fidsCsCarrier') + fnIn(CORE, '_fidsCsVal') + varIn(CORE, '_FIDS_CS_TELLS')
  + fnIn(CORE, '_fidsCsSameFlight') + fnIn(CORE, '_fidsCsFar') + fnIn(CORE, '_fidsCsLearn')
  + varIn(CORE, '_FIDS_CS_SEEN') + varIn(CORE, '_FIDS_CS_SEEN_MS') + fnIn(CORE, '_fidsCsEvidence')
  + varIn(CORE, '_FIDS_CS_FILL') + fnIn(CORE, '_fidsOneRowPerFlight')
  + fnIn(CORE, '_fidsRowSellers') + fnIn(CORE, '_fidsSoldAs');
const B = new Function('console',
  fnIn(ROUTER, 'fidsOperatorRanker')
  + rankTable() + fnIn(CORE, '_rowStatusRank') + fnIn(CORE, '_fidsDedupeRows')
  + PASS + fnIn(CORE, '_fidsCollapseRevisions')
  + 'return { fidsOperatorRanker, _fidsDedupeRows, _fidsOneRowPerFlight, _fidsCsSameFlight, _fidsCollapseRevisions, _fidsCsNum,'
  + ' _fidsCsLearn, _fidsCsEvidence, _fidsRowSellers, _fidsSoldAs, _FIDS_CS_SEEN };'
)({ log: (s) => logs.push(String(s)), warn() {} });

// ── a board row, as mapADB builds it, for the fields these rules read ──────
// The flight's own prefix brands it, '—' where the feed gave no gate or
// terminal, the far end's code, the scheduled instant, the feed's operator
// (never the carrier itself), the status, and upd (the revised time, when it
// is more than five minutes off). The belt takes the terminal in front of it,
// as mapADB writes it.
const hhmm = (s) => String(s || '').slice(11, 16);
function boardRow(f, mode) {
  const near = mode === 'dep' ? f.departure : f.arrival, far = (mode === 'dep' ? f.arrival : f.departure) || {};
  const sL = near && near.scheduledTime && near.scheduledTime.local;
  if (!sL) return null;
  const flight = String(f.number || '').replace(/\s+/g, '').toUpperCase();
  const fp = (flight.match(/^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])(?=\d)/) || [])[0] || '';
  const airline = fp || String((f.airline && f.airline.iata) || '').toUpperCase();
  const terminal = near.terminal || '—';
  let belt = mode === 'arr' ? (near.baggageBelt || null) : null;
  if (belt && terminal !== '—') belt = String(terminal).replace(/^T/i, '') + '-' + belt;
  const ts = Date.parse(sL.replace(' ', 'T'));
  const rev = near.revisedTime && near.revisedTime.local;
  const revTs = rev ? Date.parse(rev.replace(' ', 'T')) : null;
  const op = f._opCode ? String(f._opCode).toUpperCase() : null;
  const r = {
    flight, airline, gate: near.gate || '—', terminal, _belt: belt,
    _locIata: String((far.airport && far.airport.iata) || '').toUpperCase(),
    _sortTs: ts, time: hhmm(sL), status: String(f.status || 'scheduled').toLowerCase(),
    upd: (revTs && Math.abs(revTs - ts) > 5 * 60000) ? hhmm(rev) : null,
    _opCode: op && op !== airline ? op : null,
    _aircraft: (f.aircraft && f.aircraft.model) || '', _reg: (f.aircraft && f.aircraft.reg) || ''
  };
  if (f._csKey) r._csKey = String(f._csKey);
  r[mode === 'dep' ? 'dest' : 'origin'] = (far.airport && far.airport.name) || '';
  return r;
}
// mapADB's list: drop the feed's marked codeshares and cargo, sort, de-dupe,
// then the codeshare pass
function board(raw, mode) {
  const rows = (raw || []).filter((f) => String(f.codeshareStatus || '').toLowerCase() !== 'iscodeshared' && f.isCargo !== true)
    .map((f) => boardRow(f, mode)).filter(Boolean).sort((a, b) => a._sortTs - b._sortTs);
  return B._fidsOneRowPerFlight(B._fidsDedupeRows(rows, mode), mode);
}
const show = (rows) => rows.map((r) => r.time + ' ' + r.flight);
// The worker's old answer (sea-codeshare-2026-10-12.json: the first page, no
// aircraft type, no record) with the record Sea-Tac's own listing of that day
// gives each row (sea-pages-2026-10-12.json, the last field), as the worker
// now serves it
function withRecords(raw, mode) {
  const list = SEAP[mode === 'dep' ? 'departures' : 'arrivals'];
  return raw.map((f) => {
    const near = mode === 'dep' ? f.departure : f.arrival, far = mode === 'dep' ? f.arrival : f.departure;
    const r = list.find((x) => x[0] === f.number && x[1] === near.scheduledTime.local.slice(0, 16) && x[2] === far.airport.iata);
    assert.ok(r && r[8], f.number + ' is on the listing, with its record');
    return Object.assign({}, f, { _csKey: 'SEA:' + r[8] });
  });
}
const row = (o) => Object.assign({
  flight: 'XX1', airline: 'XX', gate: '—', terminal: '—', _belt: null, _locIata: 'AMS', dest: 'Amsterdam',
  _sortTs: Date.parse('2026-10-12T13:45:00-07:00'), time: '13:45', status: 'scheduled', upd: null, _opCode: null, _aircraft: '', _reg: ''
}, o);
const pass = (rows, mode) => B._fidsOneRowPerFlight(rows, mode || 'dep');

// ── the wiring ─────────────────────────────────────────────────────────────

test('mapADB runs the codeshare pass after the row de-dupe, on the fields it builds', () => {
  const map = fnIn(CORE, 'mapADB');
  assert.match(map, /return _fidsOneRowPerFlight\(_fidsDedupeRows\(list\.map\(f => \{/);
  // v24071 — with who operates, learnt from the whole list the feed sent
  assert.match(map, /\.sort\(\(a,b\)=>a\._sortTs-b\._sortTs\), mode\), mode, _fidsCsEvidence\(list, mode, nowTs\)\);\n\}\n$/);
  // and the airport's own record of the flight rides on the row
  assert.match(map, /if \(f\._csKey\) _row\._csKey = String\(f\._csKey\);/);
  // every field the rule reads is on the row mapADB builds
  for (const k of ['time', 'upd', 'flight', 'airline', 'status', 'terminal', 'gate', '_sortTs', '_locIata', '_aircraft', '_aircraftCode', '_feedAcCode', '_reg', '_belt', '_checkIn']) {
    assert.match(map, new RegExp('[{,]' + k + '[,:}]'), 'the departure row carries ' + k);
  }
  assert.match(map, /fidsApplyOperator\(_row, /, 'the operator (_opCode) is on the row before the pass');
  assert.match(map, /if \(_yqmBeltKind\) _row\._yqmBelt = _yqmBeltKind;/, 'Moncton\'s worked-out belt is marked');
  // and the revision pass still follows mapADB on every path
  assert.match(CORE, /data\.dep = _fidsCollapseRevisions\(mapADB\(depRaw, 'dep'\), _revTz\)/);
  // the Port Authority rule is one function, read by both passes
  assert.match(ROUTER, /window\.fidsOperatorRanker = fidsOperatorRanker/);
  assert.match(fnIn(CORE, '_fidsOneRowPerFlight'), /fidsOperatorRanker\(rows, /);
  // feed-router loads before fids-core on every page that loads both
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'fids-current', page), 'utf8');
    const r = html.indexOf('js/feed-router.js'), c = html.indexOf('js/fids-core.js?');
    assert.ok(r > 0 && c > r, page + ': feed-router.js before fids-core.js');
  }
});

// ── Sea-Tac ────────────────────────────────────────────────────────────────

test('Sea-Tac departures: the 1:45 PM and 5:45 PM to Amsterdam are one row each, Delta\'s', () => {
  const before = SEA.departures.filter((f) => f.arrival.airport.iata === 'AMS' && /13:45/.test(f.departure.scheduledTime.local));
  assert.deepEqual(before.map((f) => f.number).sort(), ['AF5597', 'DL142', 'KL6032', 'SV4469', 'VS3936'], 'the fixture is the five-row case');
  assert.ok(before.every((f) => f.departure.gate === 'A8'));
  // as the worker served them before: one gate and one minute, but no record
  // and no aircraft type on any row, and a gate alone ties nothing; all stand
  assert.ok(SEA.departures.every((f) => !f._csKey && !f.aircraft));
  assert.equal(board(SEA.departures, 'dep').length, 26);
  // with Sea-Tac's record on each row, as the worker serves them now
  logs.length = 0;
  const out = board(withRecords(SEA.departures, 'dep'), 'dep');
  assert.equal(SEA.departures.length, 26);
  assert.equal(out.length, 18);
  const ams = out.filter((r) => r._locIata === 'AMS');
  assert.deepEqual(show(ams), ['13:45 DL142', '17:45 DL144']);
  assert.equal(ams[0].gate, 'A8');
  assert.equal(ams[1].gate, 'A4');
  assert.deepEqual(ams[0]._codeshares, ['AF5597', 'KL6032', 'SV4469', 'VS3936']);
  assert.deepEqual(ams[1]._codeshares, ['AF3584', 'KL6053', 'SV4471', 'VS4060']);
  assert.match(logs.join('\n'), /codeshare rows: 26 → 18 — DL142 \(AF5597, KL6032, SV4469, VS3936\); DL144 \(AF3584, KL6053, SV4471, VS4060\)/);
  // Alaska's own rows are untouched, in their own order
  const as = (rows) => rows.filter((r) => r.airline === 'AS').map((r) => r.time + ' ' + r.flight + ' ' + r.gate);
  const plain = SEA.departures.map((f) => boardRow(f, 'dep')).sort((a, b) => a._sortTs - b._sortTs);
  assert.deepEqual(as(out), as(plain));
  assert.equal(as(out).length, 14);
  // the feed's order does not choose the row
  assert.deepEqual(show(board(withRecords(SEA.departures, 'dep').reverse(), 'dep').filter((r) => r._locIata === 'AMS')), ['13:45 DL142', '17:45 DL144']);
});

test('Sea-Tac: a group with no operator\'s row stays as the feed sent it', () => {
  // 9:43 PM to Anchorage from B8: Air France and Aeroméxico sell seats on it.
  // Delta's own row, DL2367, IS on Sea-Tac's listing, with KLM's, Virgin's and
  // WestJet's: on its next page, which the worker did not read before v24071
  // (fids-proxy.js seaWindowParts; the whole listing is tested below). These
  // rows are the worker's old answer, the first page alone, with no record
  // (_csKey): nothing names the operator, and folding the pair onto one
  // partner would print Air France on Delta's aircraft, so both rows stand,
  // as Detroit's codeshare-only groups do (dtwParseFeed).
  const out = board(SEA.departures, 'dep').filter((r) => r._locIata === 'ANC' && r.gate === 'B8');
  assert.deepEqual(show(out).sort(), ['21:43 AF6814', '21:43 AM4248']);
  assert.ok(out.every((r) => !r._codeshares));
  // with their record, the same: one record, but neither carrier operates one
  const rec = board(withRecords(SEA.departures, 'dep'), 'dep').filter((r) => r._locIata === 'ANC' && r.gate === 'B8');
  assert.equal(new Set(rec.map((r) => r._csKey)).size, 1);
  assert.deepEqual(show(rec).sort(), ['21:43 AF6814', '21:43 AM4248']);
});

test('Sea-Tac arrivals: one record, one belt, one gate, one minute from Amsterdam is one flight', () => {
  assert.equal(board(SEA.arrivals, 'arr').length, 28, 'no record, no aircraft type: nothing ties them');
  const out = board(withRecords(SEA.arrivals, 'arr'), 'arr');
  assert.equal(SEA.arrivals.length, 28);
  assert.equal(out.length, 20);
  const ams = out.filter((r) => r._locIata === 'AMS');
  assert.deepEqual(show(ams), ['11:52 DL143', '16:35 DL145']);
  assert.deepEqual([ams[0].gate, ams[0]._belt, ams[0].status], ['A4', '19', 'arrived']);
  assert.deepEqual([ams[1].gate, ams[1]._belt], ['A3', '24']);
  assert.deepEqual(ams[0]._codeshares, ['AF8992', 'KL6033', 'SV4468', 'VS3944']);
  // the lone Air France row from Anchorage on belt 5 (no gate) is its own
  assert.ok(out.some((r) => r.flight === 'AF2170' && r._belt === '5' && !r._codeshares));
});

// ── what must stay apart ───────────────────────────────────────────────────

test('the same minute and the same city are not enough: different flights stay apart', () => {
  const dl = { flight: 'DL142', airline: 'DL', gate: 'A8', _aircraft: 'A330-900' };
  const kl = { flight: 'KL6032', airline: 'KL', gate: 'A8', _aircraft: 'A330-900' };
  const one = (a, b, why) => assert.equal(pass([row(a), row(b)]).length, 1, why);
  const two = (a, b, why) => assert.equal(pass([row(a), row(b)]).length, 2, why);
  one(dl, kl, 'one gate, one minute, one city, one aircraft type: the merge itself, for contrast');
  // a gate is not proof without the aircraft: the type on both rows, the same
  two(Object.assign({}, dl, { _aircraft: '' }), Object.assign({}, kl, { _aircraft: '' }), 'no aircraft type on either');
  two(dl, Object.assign({}, kl, { _aircraft: '' }), 'an aircraft type on one only');
  // two real flights to one city at one minute from different gates
  two(dl, Object.assign({}, kl, { gate: 'A9' }), 'two gates');
  two({ flight: 'DL142', airline: 'DL', gate: 'A8', _aircraft: 'A330-900' }, { flight: 'AS42', airline: 'AS', gate: 'C3', _aircraft: 'A330-900' }, 'two gates, two mainline flights');
  // nothing ties them: no gate on either, or on one
  two({ flight: 'DL142', airline: 'DL' }, { flight: 'KL6032', airline: 'KL' }, 'no gate, no belt');
  two(dl, { flight: 'KL6032', airline: 'KL' }, 'a gate on one only');
  // anything both carry that differs (one row's blank is not a difference)
  one(dl, Object.assign({}, kl, { terminal: 'S' }), 'a terminal on one row only');
  two(Object.assign({}, dl, { terminal: 'A' }), Object.assign({}, kl, { terminal: 'S' }), 'terminal');
  two(Object.assign({}, dl, { _opCode: '9E' }), Object.assign({}, kl, { _opCode: 'OO' }), 'operator');
  two(Object.assign({}, dl, { _aircraft: 'A330-900' }), Object.assign({}, kl, { _aircraft: 'Boeing 777' }), 'aircraft');
  two(Object.assign({}, dl, { _reg: 'N401DZ' }), Object.assign({}, kl, { _reg: 'PH-BVA' }), 'registration');
  two(dl, Object.assign({}, kl, { status: 'delayed', upd: '14:30' }), 'status');
  two(Object.assign({}, dl, { upd: '14:20' }), Object.assign({}, kl, { upd: '14:30' }), 'revised time');
  // two numbers under 1000 of two carriers: each is somebody's own aircraft
  two(dl, { flight: 'AS142', airline: 'AS', gate: 'A8', _aircraft: 'A330-900' }, 'two mainline numbers');
  // another day, another minute, another city: never compared
  two(dl, Object.assign({}, kl, { _sortTs: Date.parse('2026-10-13T13:45:00-07:00') }), 'another day');
  two(dl, Object.assign({}, kl, { _sortTs: Date.parse('2026-10-12T13:46:00-07:00') }), 'another minute');
  two(dl, Object.assign({}, kl, { _locIata: 'CDG', dest: 'Paris' }), 'another city');
  // the rule in words, on the function that applies it
  const sf = fnIn(CORE, '_fidsCsSameFlight');
  assert.match(varIn(CORE, '_FIDS_CS_TELLS'), /\['gate', 'terminal', '_belt', '_opCode', '_aircraft', '_reg', 'status', 'upd'\]/);
  assert.match(sf, /_fidsCsNum\(a\) < 1000 && _fidsCsNum\(b\) < 1000/);
  assert.match(sf, /var ta = v\(a\._aircraft\);\n\s+if \(!ta \|\| ta !== v\(b\._aircraft\)\) return false;/);
});

test('a flight number is the digits after the carrier\'s code: JetBlue\'s B6073 is 73, never 6073', () => {
  const n = (flight) => B._fidsCsNum({ flight });
  for (const [f, want] of [['B6073', 73], ['B6 73', 73], ['F93406', 3406], ['F9.1175', 1175], ['G4123', 123], ['Y4950', 950],
    ['A3601', 601], ['9E5012', 5012], ['DL208', 208], ['AC2040Z', 2040], ['DLH400', 400], ['U21234', 1234], ['1234', 1234], ['', 1e9], ['DL', 1e9]]) {
    assert.equal(n(f), want, f);
  }
});

test('Edinburgh: Delta\'s DL208 and JetBlue\'s B6073 from New York, one belt, one minute, are two flights', () => {
  // EDI arrivals, 2026-10-20 09:20 from JFK: a Boeing 767-300 and an A321neo
  // on belt 8, both Scheduled. Read as 6073, JetBlue's number was "over 1000"
  // and, with no aircraft type on the rows (a dozen feeds send none), the belt
  // alone folded JetBlue's flight under Delta's
  const at = Date.parse('2026-10-20T09:20:00+01:00');
  const edi = (flight, airline, _aircraft) => row({ flight, airline, _belt: '8', _locIata: 'JFK', origin: 'New York', _sortTs: at, time: '09:20', _aircraft });
  for (const [a, b] of [['Boeing 767-300', 'Airbus A321neo'], ['', ''], ['Airbus A321neo', 'Airbus A321neo']]) {
    assert.deepEqual(show(pass([edi('DL208', 'DL', a), edi('B6073', 'B6', b)], 'arr')), ['09:20 DL208', '09:20 B6073'], a + ' / ' + b);
  }
  // and a feed's own JetBlue codeshare on another carrier's flight still folds
  // onto that carrier's mainline number
  assert.deepEqual(show(pass([edi('DL208', 'DL', 'Boeing 767-300'), edi('B66595', 'B6', 'Boeing 767-300')], 'arr')), ['09:20 DL208']);
});

test('Phoenix: Southwest\'s WN2019 and American\'s AA4248 from Tucson at gate D12, one minute, are two aircraft', () => {
  // PHX arrivals, 2026-10-20 06:55: Phoenix sends no aircraft type. Both
  // numbers are over 1000 today; with one under 1000 the gate alone would have
  // folded two aircraft into one row
  const at = Date.parse('2026-10-20T06:55:00-07:00');
  const phx = (flight, airline) => row({ flight, airline, gate: 'D12', terminal: '4', _locIata: 'TUS', origin: 'Tucson', _sortTs: at, time: '06:55' });
  assert.equal(pass([phx('WN2019', 'WN'), phx('AA4248', 'AA')], 'arr').length, 2);
  assert.equal(pass([phx('WN219', 'WN'), phx('AA4248', 'AA')], 'arr').length, 2, 'a number under 1000 does not change it');
});

test('one carrier is never folded into itself: Moncton\'s PB924 and PB9241', () => {
  // cyqm.ca, 2026-10-12: PAL from Mont-Joli at 5:50 PM, gate 2, twice. PB924
  // "Arrived", PB9241 "Delayed until 7:30 PM". The second is the aircraft
  // people are waiting for; one carrier's two numbers are two operations.
  const at = Date.parse('2026-10-12T17:50:00-03:00');
  const yqm = (flight, status, upd) => row({ flight, airline: 'PB', gate: '2', _belt: '2', _yqmBelt: 'dom', _locIata: 'YYY', origin: 'Mont Joli', _sortTs: at, time: '17:50', status, upd });
  assert.deepEqual(show(pass([yqm('PB924', 'arrived', null), yqm('PB9241', 'delayed', '19:30')], 'arr')), ['17:50 PB924', '17:50 PB9241']);
  // even with nothing else to tell them apart
  assert.equal(pass([yqm('PB924', 'scheduled', null), yqm('PB9241', 'scheduled', null)], 'arr').length, 2);
  // a revision letter is the revision pass's: it still collapses to the base number
  const ac = (flight, status) => row({ flight, airline: 'AC', gate: '4', _locIata: 'YUL', dest: 'Montréal', status });
  const both = pass([ac('AC2040', 'scheduled'), ac('AC2040Z', 'delayed')]);
  assert.equal(both.length, 2);
  const one = B._fidsCollapseRevisions(both, 'America/Moncton');
  assert.deepEqual(one.map((r) => r.flight + ' ' + r.status), ['AC2040 delayed']);
});

test('a belt the board worked out itself ties nothing; the feed\'s own belt does', () => {
  const at = Date.parse('2026-10-12T17:50:00-03:00');
  const arr = (flight, airline, extra) => row(Object.assign({ flight, airline, _locIata: 'YYZ', origin: 'Toronto', _sortTs: at, time: '17:50' }, extra));
  // Moncton: every arrival starts on belt 2 (_yqmAssignBelts) whatever it is
  assert.equal(pass([arr('AC123', 'AC', { _belt: '2', _yqmBelt: 'dom', _aircraft: 'A220-300' }), arr('UA8001', 'UA', { _belt: '2', _yqmBelt: 'dom', _aircraft: 'A220-300' })], 'arr').length, 2);
  // a belt the feed published is the airport's word that the bags are one load
  // (with the aircraft type on both rows)
  const ty = { _aircraft: 'A220-300' };
  assert.equal(pass([arr('AC123', 'AC', { _belt: '7', ...ty }), arr('UA8001', 'UA', { _belt: '7', ...ty })], 'arr').length, 1);
  assert.equal(pass([arr('AC123', 'AC', { _belt: '7', ...ty }), arr('UA8001', 'UA', { _belt: '8', ...ty })], 'arr').length, 2);
  assert.equal(pass([arr('AC123', 'AC', { _belt: '7' }), arr('UA8001', 'UA', { _belt: '7' })], 'arr').length, 2, 'no aircraft type');
});

test('a group is folded only onto the operator\'s own row, a number under 1000', () => {
  // Detroit's codeshare-only groups (the worker keeps them whole on purpose:
  // Delta's own row is never sent) reach the board as they are: same gate,
  // minute and city, partners only, none under 1000
  for (const [mode, key] of [['dep', 'departures'], ['arr', 'arrivals']]) {
    const raw = NEAR.DTW[key];
    const rows = raw.map((f) => boardRow(f, mode)).filter(Boolean).sort((a, b) => a._sortTs - b._sortTs);
    const deduped = B._fidsDedupeRows(rows.slice(), mode);
    const gated = {};
    for (const r of deduped) if (r.gate !== '—') (gated[r._sortTs + '|' + r._locIata + '|' + r.gate] = gated[r._sortTs + '|' + r._locIata + '|' + r.gate] || []).push(r.flight);
    const groups = Object.values(gated).filter((g) => g.length > 1);
    assert.ok(groups.length > 20, 'Detroit ' + key + ': the fixture holds its codeshare-only groups (' + groups.length + ')');
    assert.ok(groups.every((g) => g.every((n) => +n.replace(/^\D+/, '') >= 1000)), 'none of them has a number under 1000');
    const out = B._fidsOneRowPerFlight(deduped, mode);
    assert.equal(out, deduped, 'Detroit ' + key + ': the same list, untouched');
  }
  // the same group with the operator's own number in it is one row, the operator's
  const iah = (flight, airline) => row({ flight, airline, gate: 'A75', _locIata: 'IAH', _aircraft: 'Boeing 737-900' });
  const g = [iah('AF2909', 'AF'), iah('KL5818', 'KL'), iah('WS7448', 'WS')];
  assert.equal(pass(g).length, 3);
  const withDl = pass(g.concat(iah('DL1234', 'DL')));
  assert.equal(withDl.length, 4, 'DL1234 is not under 1000 either: no anchor, no fold');
  const withDl2 = pass(g.concat(iah('DL834', 'DL')));
  assert.deepEqual(show(withDl2), ['13:45 DL834']);
});

test('the row kept takes what only the others carry, and keeps its own status', () => {
  // one record of the airport's (a gate and a type on only some rows)
  const out = pass([
    row({ flight: 'KL6033', airline: 'KL', gate: 'A4', _belt: '19', _aircraft: 'A330-900', _csKey: 'SEA:1900078013' }),
    row({ flight: 'DL143', airline: 'DL', gate: 'A4', terminal: 'S', _csKey: 'SEA:1900078013' }),
    row({ flight: 'AF8992', airline: 'AF', _reg: 'N401DZ', _checkIn: '12', _csKey: 'SEA:1900078013' })
  ], 'arr');
  assert.equal(out.length, 1);
  const r = out[0];
  assert.deepEqual([r.flight, r.gate, r.terminal, r._belt, r._aircraft, r._reg, r._checkIn],
    ['DL143', 'A4', 'S', '19', 'A330-900', 'N401DZ', '12']);
  assert.deepEqual(r._codeshares, ['KL6033', 'AF8992']);
});

// ── the feeds that already settle their codeshares do not change ───────────

test('Washington National (MWAA, operator published) and Phoenix: the same list', () => {
  for (const ap of ['DCA', 'PHX']) {
    for (const [mode, key] of [['dep', 'departures'], ['arr', 'arrivals']]) {
      const raw = NEAR[ap][key];
      const rows = B._fidsDedupeRows(raw.map((f) => boardRow(f, mode)).filter(Boolean).sort((a, b) => a._sortTs - b._sortTs), mode);
      assert.equal(B._fidsOneRowPerFlight(rows, mode), rows, ap + ' ' + key);
    }
  }
  // Phoenix's real pairs: one gate, one minute, one city — Southwest and
  // American from San Diego at D1, two American numbers to Sioux Falls at A1.
  // None is a number under 1000 (and two are one carrier): left as listed.
  const phx = NEAR.PHX.departures.concat(NEAR.PHX.arrivals).map((f) => f.number);
  for (const n of ['AA4267', 'AA6452', 'WN3668', 'AA9789']) assert.ok(phx.includes(n), n);
  assert.ok(NEAR.DCA.departures.some((f) => f._opCode), 'MWAA rows carry the operator');
});

test('New York: the Port Authority pass picks exactly what it picked before, through the shared ranker', () => {
  const src = ROUTER;
  const a = src.indexOf('const _numOf = (f) => parseInt(f.flightNumber, 10) || 1e9;');
  const b = src.indexOf('const list = kept.map(f => panynjToAdbFlight(f, direction, iata))');
  assert.ok(a > 0 && b > a, 'the PANYNJ block is where it was');
  const block = src.slice(a, b);
  assert.match(block, /const _rank = fidsOperatorRanker\(rows, \(f\) => String\(f\.airlineCode \|\| ''\)\.toUpperCase\(\), _numOf\);/);
  const panynj = new Function('rows', 'wantDep', 'fidsOperatorRanker', block + 'return kept;');
  // The rule as it was written inline before v24071, kept here as the
  // reference: mainline presence, then presence, then the lowest number; a
  // sub-1000 number in the bucket first.
  const reference = (rows) => {
    const num = (f) => parseInt(f.flightNumber, 10) || 1e9, code = (f) => String(f.airlineCode || '').toUpperCase();
    const pres = {}, low = {};
    for (const f of rows) { pres[code(f)] = (pres[code(f)] || 0) + 1; if (num(f) < 1000) low[code(f)] = (low[code(f)] || 0) + 1; }
    const beats = (f, x) => {
      const lf = low[code(f)] || 0, lx = low[code(x)] || 0; if (lf !== lx) return lf > lx;
      const pf = pres[code(f)] || 0, px = pres[code(x)] || 0; if (pf !== px) return pf > px;
      return num(f) < num(x);
    };
    return { beats, pick: (g) => { const l = g.filter((f) => num(f) < 1000); return (l.length ? l : g).reduce((x, f) => (beats(f, x) ? f : x)); }, lowPresOf: (f) => low[code(f)] || 0 };
  };
  const k = (f) => f.airlineCode + f.flightNumber + ' ' + f.dateScheduled + ' ' + f.timeScheduled + ' ' + (f.gate || '');
  for (const [name, node, wantDep] of [['jfk-dep-sample.json', 'getDepartingFlights', true], ['jfk-arr-sample.json', 'getArrivingFlights', false]]) {
    const rows = fixture(name).data[node].data;
    const now = panynj(rows, wantDep, B.fidsOperatorRanker).map(k);
    const then = panynj(rows, wantDep, reference).map(k);
    assert.ok(rows.length > 500 && now.length > 100, name);
    assert.deepEqual(now, then, name + ': the same operators kept');
    // and the boards' pass finds nothing more to fold in what New York keeps
    const mode = wantDep ? 'dep' : 'arr';
    const t12 = (d, t) => { const m = String(t).match(/^(\d{1,2}):(\d{2})\s*([AP])M$/i); return Date.parse(d + 'T' + String(((+m[1]) % 12) + (/p/i.test(m[3]) ? 12 : 0)).padStart(2, '0') + ':' + m[2] + ':00-04:00'); };
    const kept = panynj(rows, wantDep, B.fidsOperatorRanker).map((f) => row({
      flight: String(f.airlineCode).toUpperCase() + f.flightNumber, airline: String(f.airlineCode).toUpperCase(),
      gate: f.gate || '—', terminal: f.terminal || '—', _locIata: wantDep ? f.destinationAirportCode : f.originAirportCode,
      _sortTs: t12(f.dateScheduled, f.timeScheduled), status: String(f.status || '').toLowerCase()
    })).sort((x, y) => x._sortTs - y._sortTs);
    assert.equal(B._fidsOneRowPerFlight(kept, mode), kept, name + ': the boards\' pass leaves New York\'s list alone');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// v24071 — SEA-TAC'S WHOLE LISTING, ITS OWN RECORDS, AND THE TICKET NUMBER.
//
// The worker read only the first page of Sea-Tac's listing (three cities), so
// Delta's own row of the 9:43 PM to Anchorage was never seen; and with it,
// the group would not have folded, its number being over 1000. Most of
// Sea-Tac's codeshares are Delta 1xxx/2xxx and United 1xxx/4xxx: 91 of 185
// departure slots and 116 of 209 arrival slots stayed duplicated. Tomorrow's
// 1:45 PM to Amsterdam had no gate yet, and no gate never merged: five rows.
// And once folded, a codeshare number could not be found: the search, the
// airline filter, the gate and belt screens only read the kept number.
//
// sea-pages-2026-10-12.json is every row Sea-Tac listed for 10-12 and 10-13,
// as the new seaParsePage serves it (with the record each row opens).
// ═══════════════════════════════════════════════════════════════════════════

// a fixture row back in the worker's shape
function seaRaw(r, mode) {
  const [number, sched, far, farName, gate, status, rev, belt, rec] = r;
  const near = { airport: { iata: 'SEA', name: 'Seattle' }, scheduledTime: { local: sched + ':00-07:00' } };
  if (gate) near.gate = gate;
  if (rev) near.revisedTime = { local: rev + ':00-07:00' };
  if (mode === 'arr' && belt) near.baggageBelt = belt;
  const other = { airport: { iata: far, name: farName }, scheduledTime: { local: sched + ':00-07:00' } };
  const f = { number, status, codeshareStatus: 'IsOperator', isCargo: false, airline: { iata: number.slice(0, 2) },
    departure: mode === 'dep' ? near : other, arrival: mode === 'dep' ? other : near };
  if (rec) f._csKey = 'SEA:' + rec;
  return f;
}
const SEA_RAW = { dep: SEAP.departures.map((r) => seaRaw(r, 'dep')), arr: SEAP.arrivals.map((r) => seaRaw(r, 'arr')) };
const forget = () => { for (const k of Object.keys(B._FIDS_CS_SEEN)) delete B._FIDS_CS_SEEN[k]; };
// mapADB's order: rows, de-dupe, the pass with what the whole list shows
function boardOf(raw, mode, now) {
  const rows = raw.map((f) => boardRow(f, mode)).filter(Boolean).sort((a, b) => a._sortTs - b._sortTs);
  return B._fidsOneRowPerFlight(B._fidsDedupeRows(rows, mode), mode, B._fidsCsEvidence(raw, mode, now || Date.parse('2026-10-12T14:45:00-07:00')));
}
const at = (rows, day, hhmm, far) => rows.filter((r) => r.time === hhmm && r._locIata === far && new Date(r._sortTs - 7 * 3600000).toISOString().slice(0, 10) === day);

test('Sea-Tac\'s records: one flight is one record, whatever its gate', () => {
  // every record two carriers sell is one slot; two flights in one slot are two records
  for (const mode of ['dep', 'arr']) {
    const by = {};
    for (const f of SEA_RAW[mode]) (by[f._csKey] = by[f._csKey] || []).push(f);
    for (const g of Object.values(by)) {
      const cars = new Set(g.map((f) => f.number.slice(0, 2)));
      if (cars.size < 2) continue;
      const side = (f) => (mode === 'dep' ? f.departure : f.arrival);
      const slot = new Set(g.map((f) => [side(f).scheduledTime.local, (mode === 'dep' ? f.arrival : f.departure).airport.iata, side(f).gate || '', f.status].join('|')));
      assert.equal(slot.size, 1, mode + ' ' + g.map((f) => f.number).join(','));
    }
  }
  const rec = (n, day) => SEA_RAW.dep.find((f) => f.number === n && f.departure.scheduledTime.local.startsWith(day))._csKey;
  assert.match(rec('AS555', '2026-10-13'), /^SEA:\d{10}$/);
  assert.notEqual(rec('AS555', '2026-10-13'), rec('DL536', '2026-10-13'), 'Alaska and Delta to Minneapolis at 8:25 AM: two records');
});

test('Sea-Tac departures: every codeshare folds onto Delta\'s or United\'s own row, numbers over 1000 included', () => {
  forget();
  logs.length = 0;
  const out = boardOf(SEA_RAW.dep, 'dep');
  assert.equal(SEA_RAW.dep.length, 1558);
  assert.equal(out.length, 1063);
  const kept = {};
  for (const r of out) if (r._codeshares) kept[r.airline] = (kept[r.airline] || 0) + 1;
  assert.deepEqual(kept, { DL: 154, UA: 30 }, 'every folded flight is Delta\'s or United\'s, as Sea-Tac\'s records say');
  // the reported flight, today at A8 and tomorrow before its gate is given
  const show2 = (rows) => rows.map((r) => r.flight + ' ' + r.gate + ' [' + (r._codeshares || []).join(',') + ']');
  assert.deepEqual(show2(at(out, '2026-10-12', '13:45', 'AMS')), ['DL142 A8 [AF5597,KL6032,SV4469,VS3936]']);
  assert.deepEqual(show2(at(out, '2026-10-13', '13:45', 'AMS')), ['DL142 — [AF5597,KL6032,SV4469,VS3936]']);
  // the 9:43 PM to Anchorage: Delta's DL2367, over 1000, with its five sellers
  assert.deepEqual(show2(at(out, '2026-10-12', '21:43', 'ANC')), ['DL2367 A4 [AF6814,AM4248,KL5382,VS5400,WS8069]']);
  assert.deepEqual(show2(at(out, '2026-10-13', '21:43', 'ANC')), ['DL2367 A11 [AF6814,AM4248,KL5382,VS5400,WS8069]']);
  // the biggest groups the reviewer counted: Fairbanks 7 rows, Los Angeles 7, United with no gate
  assert.deepEqual(show2(at(out, '2026-10-12', '21:45', 'FAI')), ['DL2186 B6 [AF5785,AM4158,KE3027,KL6763,VS2104,WS8100]']);
  assert.deepEqual(show2(at(out, '2026-10-12', '14:30', 'LAX')).map((x) => x.slice(0, 10)), ['DL2830 A11']);
  assert.deepEqual(show2(at(out, '2026-10-12', '16:35', 'LAX')), ['UA4796 — [AV2143,CA7220,CM1444,NZ2472,VA8280]']);
  // the kept row's own status and new time (Sea-Tac's "Now 6:25 PM")
  const dl142 = at(out, '2026-10-12', '13:45', 'AMS')[0];
  assert.deepEqual([dl142.status, dl142.upd], ['scheduled', '18:25']);
  assert.match(logs.join('\n'), /codeshare rows: 1558 → 1063 — /);
});

test('Sea-Tac arrivals: the same, belts and new times kept', () => {
  forget();
  const out = boardOf(SEA_RAW.arr, 'arr');
  assert.equal(SEA_RAW.arr.length, 1644);
  assert.equal(out.length, 1124);
  const kept = {};
  for (const r of out) if (r._codeshares) kept[r.airline] = (kept[r.airline] || 0) + 1;
  assert.deepEqual(kept, { DL: 170, UA: 38 });
  const dl143 = at(out, '2026-10-12', '11:52', 'AMS');
  assert.deepEqual(dl143.map((r) => [r.flight, r.gate, r._belt, r._codeshares.join(',')]), [['DL143', 'A4', '19', 'AF8992,KL6033,SV4468,VS3944']]);
});

test('Sea-Tac: what stays apart, and a record without its operator stays whole', () => {
  forget();
  const dep = boardOf(SEA_RAW.dep, 'dep'), arr = boardOf(SEA_RAW.arr, 'arr');
  const flights = (rows) => rows.map((r) => r.flight).sort();
  // two records in one slot: two flights (and the codeshares of each fold onto their own)
  assert.deepEqual(flights(at(dep, '2026-10-13', '08:25', 'MSP')), ['AS555', 'DL536']);
  assert.deepEqual(at(dep, '2026-10-13', '08:25', 'MSP').find((r) => r.flight === 'DL536')._codeshares, ['AF2400', 'KL5487', 'VS1582']);
  assert.deepEqual(flights(at(dep, '2026-10-12', '18:20', 'PHX')), ['AA3934', 'DL2698']);
  assert.deepEqual(flights(at(dep, '2026-10-13', '01:15', 'TPE')), ['CI21', 'JX31']);
  assert.deepEqual(flights(at(arr, '2026-10-12', '12:20', 'MCO')), ['AS1318', 'DL347']);
  // a multi-stop flight's stops share a record and stay its stops
  assert.equal(dep.filter((r) => r.flight === 'AS61' && r.time === '07:00').length, 4);
  // Delta's own row of these moved off the pages while they were read: Air
  // France, WestJet, KLM, Saudia and Virgin all ride on Delta here, and none
  // of them operates; the group stays as Sea-Tac sent it
  assert.deepEqual(flights(at(dep, '2026-10-12', '20:15', 'PHX')), ['AF3692', 'WS7631']);
  assert.deepEqual(flights(at(arr, '2026-10-13', '17:47', 'CDG')), ['AF3622', 'KL6122', 'SV4436', 'VS3987']);
  assert.ok(at(arr, '2026-10-13', '17:47', 'CDG').every((r) => !r._codeshares));
});

test('who operates is what the airport\'s records show, never a count of who flies the most', () => {
  forget();
  const ev = B._fidsCsLearn(SEA_RAW.dep.map((f) => ({ flight: f.number, key: f._csKey })));
  assert.deepEqual(Object.keys(ev.op).sort(), ['DL', 'UA']);
  assert.ok(!ev.rides.DL && !ev.rides.UA && !ev.op.AS, 'Delta and United never ride; Alaska, the biggest, sells no one\'s seats here');
  for (const c of ['AF', 'AM', 'KE', 'KL', 'SV', 'VS', 'WS', 'NZ', 'VA']) assert.ok(ev.rides[c], c + ' rides');
  // one record, no number under 1000: the one carrier seen operating
  const rec = (flight, airline, extra) => row(Object.assign({ flight, airline, gate: '—', _csKey: 'SEA:1', _locIata: 'ANC', dest: 'Anchorage' }, extra));
  const ev2 = { op: { DL: 3, UA: 1 }, rides: { AF: 2, AM: 1, KE: 4 } };
  assert.deepEqual(show(B._fidsOneRowPerFlight([rec('AF6814', 'AF'), rec('DL2367', 'DL'), rec('AM4248', 'AM')], 'dep', ev2)), ['13:45 DL2367']);
  // no carrier seen operating: left whole (the first page alone)
  assert.equal(B._fidsOneRowPerFlight([rec('AF6814', 'AF'), rec('AM4248', 'AM')], 'dep', ev2).length, 2);
  // a carrier seen operating AND riding decides nothing
  assert.equal(B._fidsOneRowPerFlight([rec('KE3033', 'KE'), rec('DL2880', 'DL')], 'dep', { op: { DL: 3, KE: 1 }, rides: { DL: 1, KE: 3 } }).length, 2);
  // two operators in one record: left whole
  assert.equal(B._fidsOneRowPerFlight([rec('UA1403', 'UA'), rec('DL2880', 'DL')], 'dep', ev2).length, 2);
  // without the airport's record, a gate tie and no number under 1000 is never
  // enough: Vancouver lists United's UA2048 with Air Canada's AC4876, and Air
  // Canada flies the most there; nothing folds
  const yvr = (flight, airline) => row({ flight, airline, gate: 'E87', _locIata: 'SFO', dest: 'San Francisco' });
  assert.equal(B._fidsOneRowPerFlight([yvr('UA2048', 'UA'), yvr('AC4876', 'AC'), yvr('AV2177', 'AV')], 'dep', { op: { AC: 40, UA: 1 }, rides: {} }).length, 3);
  // two records never fold, whatever they share
  assert.equal(B._fidsOneRowPerFlight([rec('DL536', 'DL', { gate: 'N7' }), rec('KL5487', 'KL', { gate: 'N7', _csKey: 'SEA:2' })], 'dep', ev2).length, 2);
});

test('the board\'s hours hold what the whole listing showed: what an airport shows stays seen for a day and a half', () => {
  forget();
  const t0 = Date.parse('2026-10-12T14:45:00-07:00');
  const anchored = SEA_RAW.dep.filter((f) => /^(DL142|AF5597|KL6032|SV4469|VS3936|UA737|NZ9426|VA8291|AV2037|CM2326)$/.test(f.number) && f.departure.scheduledTime.local.startsWith('2026-10-12'));
  B._fidsCsEvidence(anchored, 'dep', t0);
  // a later list with no United flight under 1000 in it still folds United's
  const ua = SEA_RAW.dep.filter((f) => f.departure.scheduledTime.local.startsWith('2026-10-12 16:35') && f.arrival.airport.iata === 'LAX');
  assert.equal(ua.length, 6);
  assert.deepEqual(show(boardOf(ua, 'dep', t0 + 3600000)), ['16:35 UA4796']);
  // and forgets after 36 hours
  const late = boardOf(ua, 'dep', t0 + 37 * 3600000);
  assert.equal(late.length, 6);
  // the memory is per airport
  forget();
  B._fidsCsEvidence(anchored, 'dep', t0);
  const yvrList = ua.map((f) => Object.assign({}, f, { departure: Object.assign({}, f.departure, { airport: { iata: 'YVR' } }) }));
  assert.equal(boardOf(yvrList, 'dep', t0).length, 6, 'Sea-Tac\'s operators say nothing at Vancouver');
});

test('a codeshare number still finds its flight: the search, the airline filter, the gate and the belt', () => {
  forget();
  const out = board(withRecords(SEA.departures, 'dep'), 'dep');
  const dl144 = out.find((r) => r.flight === 'DL144');
  assert.deepEqual(B._fidsRowSellers(dl144).map((s) => s.flight), ['DL144', 'AF3584', 'KL6053', 'SV4471', 'VS4060']);
  assert.ok(B._fidsSoldAs(dl144, 'KL6053') && B._fidsSoldAs(dl144, 'kl 6053') && B._fidsSoldAs(dl144, 'DL144'));
  assert.ok(!B._fidsSoldAs(dl144, 'KL6032') && !B._fidsSoldAs(dl144, ''));
  // applySearch, as fids-core.js has it
  const NAMES = { DL: 'Delta Air Lines', KL: 'KLM', AF: 'Air France', VS: 'Virgin Atlantic', SV: 'Saudia', AS: 'Alaska Airlines', AM: 'Aeroméxico' };
  const S = new Function('PARENT', 'AIRLINE_NAME',
    'let searchQuery = "", filterAirline = "", filterTerminal = "", filterRegion = "", filterStatus = "", filterTimeFrom = "", filterTimeTo = "";\n'
    + fnIn(CORE, '_fidsCsCarrier') + fnIn(CORE, '_fidsRowSellers') + fnIn(CORE, 'applySearch')
    + 'return (rows, q, al) => { searchQuery = q || ""; filterAirline = al || ""; return applySearch(rows); };')({}, NAMES);
  const found = (q, al) => S(out, q, al).map((r) => r.flight);
  assert.deepEqual(found('kl6053'), ['DL144']);
  assert.deepEqual(found('af3584'), ['DL144']);
  assert.deepEqual(found('virgin'), ['DL142', 'DL144']);
  assert.deepEqual(found('kl'), ['DL142', 'DL144'], 'a carrier code finds the flights it sells');
  assert.deepEqual(found('dl142'), ['DL142']);
  assert.deepEqual(found('', 'KL'), ['DL142', 'DL144']);
  assert.deepEqual(found('', 'VS'), ['DL142', 'DL144']);
  assert.deepEqual(found('', 'AF'), ['DL142', 'DL144', 'AF6814']);
  assert.equal(found('', 'AS').length, 14, 'Alaska\'s own fourteen, nothing more');
  assert.ok(found('', 'AS').every((n) => n.startsWith('AS')));
  // the gate screen opened by a flight number (the phone gate nav's "Gate # or flight #")
  const G = new Function('AIRLINE_NAME', 'data',
    'function _gateFlightLive() { return true; } function _gateHoldYields() { return false; }\n'
    + varIn(CORE, '_CS_REGIONAL_FAM') + fnIn(CORE, '_gateCsPick') + fnIn(CORE, '_fidsCsCarrier') + fnIn(CORE, '_fidsRowSellers') + fnIn(CORE, '_fidsSoldAs')
    + fnIn(CORE, '_gateFlightsAt') + 'return _gateFlightsAt;')(NAMES, { dep: out });
  const gate = (sub) => G(sub, Date.parse('2026-10-12T12:00:00-07:00')).map((r) => r.flight + ' ' + r.gate);
  assert.deepEqual(gate('KL6053'), ['DL144 A4']);
  assert.deepEqual(gate('AF5597'), ['DL142 A8']);
  assert.deepEqual(gate('DL142'), ['DL142 A8']);
  assert.deepEqual(gate('A4'), ['DL144 A4']);
  // the belt screen
  const arrOut = board(withRecords(SEA.arrivals, 'arr'), 'arr');
  const BE = new Function('var BIDS_UNASSIGNED = \'—\';\n' + fnIn(CORE, '_bidsUnassigned') + fnIn(CORE, '_fidsCsCarrier') + fnIn(CORE, '_fidsRowSellers') + fnIn(CORE, '_fidsSoldAs')
    + fnIn(CORE, '_bidsOnScreen') + 'return _bidsOnScreen;')();
  assert.deepEqual(arrOut.filter((r) => BE(r, 'KL6033')).map((r) => r.flight + ' ' + r._belt), ['DL143 19']);
  assert.deepEqual(arrOut.filter((r) => BE(r, '19')).map((r) => r.flight), ['DL143']);
});
