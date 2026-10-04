'use strict';

// WHY THIS EXISTS
//
// v23944. "Operated by" on an Air Canada flight came from flight-number bands,
// and the departures board and the three gate paths each had their own: Rouge
// was 1600-1999 on the gate and 1600-2099 on the board, so Moncton's AC2037
// was Rouge on one and mainline on the other; the gate let its band overrule
// the feed; and 7700-7799 was "PAL" while Montréal's record of the same flights
// said JZA. One ladder now answers for every surface, best evidence first:
//   1. the airport's own record (Montréal's FlightId prefix when it is the
//      flight's ONLY record; ACA never counts),
//   2. the far end's record of the same flight, or today's FR24 callsign
//      (the worker's /opinfo),
//   3. a callsign on the row, 4. an aircraft only one partner flies,
//   5. a block every record agrees on — and where both partners' records turn
//      up (77xx), the brand both fly as: Air Canada Express.
//
// The rows here are real: Montréal's ADM list, St. John's departures page and
// Moncton's cyqm.ca list as captured on 2026-10-04, trimmed to the flights
// named below. The shipped code runs: the worker is imported, and the board's
// functions are lifted out of fids-core.js and feed-router.js by brace matching.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const ROUTER = fs.readFileSync(path.join(root, 'fids-current', 'js', 'feed-router.js'), 'utf8');
const workerPath = path.join(root, 'workers', 'fids-proxy.js');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const YUL = JSON.parse(fixture('yul-operator-sample.json')).list;
const YQM = JSON.parse(fixture('yqm-operator-sample.json'));
const YYT_DEP = fs.readFileSync(path.join(__dirname, 'fixtures', 'yyt-dep-operator-sample.html'), 'latin1');

// ── lifting real code ───────────────────────────────────────────────────────
function braceFrom(SRC, start, what) {
  assert.ok(start >= 0, what + ' must exist');
  let i = SRC.indexOf('{', start);
  let depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) {
        if (SRC[i] === '\\') { i++; continue; }
        if (SRC[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return SRC.slice(start, i + 1); }
  }
  throw new Error('could not find the end of ' + what);
}
function fnIn(SRC, name) {
  const m = SRC.match(new RegExp('(^|\\n)(async )?function ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\('));
  assert.ok(m, name + ' must be declared');
  return braceFrom(SRC, m.index + (m[1] ? 1 : 0), name);
}
const lineIn = (SRC, name) => {
  const m = SRC.match(new RegExp('^(?:var|const) ' + name + ' = [^;]+;', 'm'));
  assert.ok(m, name + ' must exist');
  return m[0];
};
const blockIn = (SRC, prefix) => braceFrom(SRC, SRC.indexOf(prefix), prefix) + ';';

// The ladder as the board and every gate run it.
const LADDER_FNS = ['acOperatorBand', 'acExpressOperated', '_opLadderName', '_opEvLegId', '_opEvFarGet',
  'fidsResolveOperator', 'fidsApplyOperator', '_opEvNeeds', '_opEvLegsFor',
  '_apLatLngFor', '_regionalOpFitsRoute', '_haversineKm', '_equipSaneForCarrier'];
// Coordinates for the airports below (the board's AP carries them the same way).
const AP = {
  YQM: { lat: 46.11, lon: -64.68 }, YUL: { lat: 45.47, lon: -73.74 }, YOW: { lat: 45.32, lon: -75.67 },
  YYT: { lat: 47.62, lon: -52.75 }, YHZ: { lat: 44.88, lon: -63.51 }, YYZ: { lat: 43.68, lon: -79.63 },
  YVR: { lat: 49.19, lon: -123.18 }, YQB: { lat: 46.79, lon: -71.39 }, ATL: { lat: 33.64, lon: -84.43 },
  YFC: { lat: 45.87, lon: -66.53 }, YYC: { lat: 51.13, lon: -114.01 }, YLW: { lat: 49.96, lon: -119.38 }
};
// _AC_OP_BANDS is an array literal: lifted by its own closing bracket.
const BANDS_LIT = (() => {
  const i = CORE.indexOf('var _AC_OP_BANDS = [');
  assert.ok(i >= 0, '_AC_OP_BANDS must exist');
  return CORE.slice(i, CORE.indexOf('\n];', i) + 3);
})();
function L(win) {
  const src0 = [
    lineIn(CORE, 'AC_EXPRESS_OP'), lineIn(CORE, '_REGIONAL_MAX_KM'),
    blockIn(CORE, 'var _OP_LADDER_NAMES = {'), BANDS_LIT,
    lineIn(CORE, '_OP_JAZZ_ONLY_TYPE'), lineIn(CORE, '_OP_WS_DASH8'),
    blockIn(CORE, 'const CALLSIGN_TO_IATA = {'), blockIn(CORE, 'const CALLSIGN_ICAO = {'),
    ...LADDER_FNS.map((n) => fnIn(CORE, n)),
    'return { ' + LADDER_FNS.map((n) => n + ': ' + n).join(', ') + ', AC_EXPRESS_OP: AC_EXPRESS_OP, _AC_OP_BANDS: _AC_OP_BANDS };'
  ].join('\n');
  return new Function('window', 'AP', 'AIRLINE_NAME', src0)(win || {}, AP, {});
}

// Montréal's adapter, as the board runs it.
const ROUTER_FNS = ['yulStatus', 'yulAirlineIata', 'tpaTimeObj', 'yulGroupKey', 'yulOperatorEvidence', 'yulToAdbFlight',
  'yqmTimeObj', 'yqmClockToMin', 'yqmStatus', 'yqmToAdbFlight'];
function router() {
  const src = [lineIn(ROUTER, 'YUL_OPERATOR_CODES'), ...ROUTER_FNS.map((n) => fnIn(ROUTER, n)),
    'return { YUL_OPERATOR_CODES: YUL_OPERATOR_CODES, ' + ROUTER_FNS.map((n) => n + ': ' + n).join(', ') + ' };'].join('\n');
  return new Function(src)();
}

// A board row as mapADB builds it, for the fields the ladder reads: the feed's
// own evidence (_opEv, or the worker's operator field), the row's callsign and
// type, the far airport, the scheduled time, and dest/origin by direction.
function boardRow(adb, mode, ts) {
  const leg = mode === 'dep' ? adb.arrival : adb.departure;
  const r = {
    flight: String(adb.number).replace(/\s+/g, '').toUpperCase(),
    airline: String((adb.departure.airline || {}).iata || '').toUpperCase(),
    _locIata: String((leg.airport || {}).iata || '').toUpperCase(),
    _sortTs: ts,
    _opEv: (adb._opEv && adb._opEv.op) ? adb._opEv : (adb._opCode ? { op: adb._opCode, src: 'own', basis: 'operator field' } : null),
    _feedCs: adb.callSign || null,
    _feedAcCode: (adb.aircraft && adb.aircraft.model) || ''
  };
  if (mode === 'dep') r.dest = r._locIata; else r.origin = r._locIata;
  return r;
}
const sched = (adb, mode) => Date.parse(String((mode === 'dep' ? adb.departure : adb.arrival).scheduledTime.utc).replace(' ', 'T').replace('+00:00', 'Z'));

// ── 1. Montréal's own record ────────────────────────────────────────────────

test('Montréal: a prefix counts only when it is the flight\'s only record, and ACA never counts', async () => {
  const W = await import(workerPath);
  const groups = W.opevYulGroups(YUL);
  const pick = (f, other, ad) => groups.find((g) => g.f === f && g.other === other && g.ad === ad);
  // Jazz on its own record.
  assert.equal(pick('AC7932', 'YQB', 'D').op, 'QK');
  assert.equal(pick('AC8001', 'YOW', 'D').op, 'QK');
  assert.equal(pick('AC7883', 'YYZ', 'D').op, 'QK');
  assert.equal(pick('AC7190', 'ATL', 'A').op, 'QK', 'the Jazz flight inside 7000-7299');
  // Rouge on its own record — Moncton's AC2037 is ROU at the far end.
  assert.equal(pick('AC2037', 'YQM', 'A').op, 'RV');
  // 77xx comes as ACA+JZA twins: the JZA one is a leftover, so neither counts.
  const twin = pick('AC7773', 'YOW', 'D');
  assert.equal(twin.op, null);
  assert.match(twin.basis, /ACA\+JZA twin/);
  // A Rouge sun flight is a twin too; a lone ACA (mainline extra, or 77xx) says nothing.
  assert.equal(pick('AC2246', 'AZS', 'D').op, null);
  assert.equal(pick('AC7762', 'YOW', 'A').op, null);
  // Delta's Endeavor prefix is not an Air Canada partner code: not read.
  assert.ok(groups.filter((g) => /^DL/.test(g.f)).every((g) => g.op === null));
});

test('the board\'s Montréal adapter reads the same records the worker does', async () => {
  const W = await import(workerPath);
  const R = router();
  assert.deepEqual(R.YUL_OPERATOR_CODES, W.OPEV_DESIGNATOR, 'one designator table, held equal in both places');
  const ev = R.yulOperatorEvidence(YUL);
  const groups = W.opevYulGroups(YUL);
  for (const f of YUL) {
    const adb = R.yulToAdbFlight(f, ev);
    const ad = String(f.ArrivalOrDeparture).toUpperCase() === 'A' ? 'A' : 'D';
    const g = groups.find((x) => x.f === adb.number && x.other === f.AirportIataCode && x.ad === ad && Math.abs(x.ts - sched(adb, ad === 'A' ? 'arr' : 'dep')) < 60000);
    assert.ok(g, 'group for ' + adb.number);
    assert.equal((adb._opEv && adb._opEv.op) || null, g.op, adb.number + ' ' + f.FlightId);
  }
  // And an adapter call without evidence (studio, older callers) still maps.
  assert.equal(R.yulToAdbFlight(YUL[0], 0)._opEv, undefined);
});

// ── 2. the far end, and today's FR24 answer ────────────────────────────────

test('/opinfo: Moncton\'s flights from the far ends\' records and today\'s FR24 callsign', async () => {
  const W = await import(workerPath);
  const now = Date.parse('2026-10-04T16:00:00Z');
  const yyt = W.yytParseTable(YYT_DEP, 'dep', now);
  const R = router();
  const legOf = (row, mode) => {
    const adb = R.yqmToAdbFlight(row, mode === 'dep' ? 'Departure' : 'Arrival');
    return W.opevParseLeg(`${adb.number}.${row.airportCode}.${mode === 'dep' ? 'd' : 'a'}.${Math.round(sched(adb, mode) / 1000)}`);
  };
  const find = (mode, f) => YQM[mode].find((r) => r.flightId === f);
  const legs = [legOf(find('dep', 'AC2037'), 'dep'), legOf(find('arr', 'AC7203'), 'arr'),
    legOf(find('dep', 'AC7753'), 'dep'), legOf(find('arr', 'AC7754'), 'arr')];
  // The FR24 answer the gates already paid for, as /adsb/ now keeps it.
  const mem = W.acMemAddObservation(null, 'DH8D', Date.parse('2026-10-04T21:05:00Z'), { cs: 'PVL7754', r: 'C-GPNE' });
  const out = await W.opevForLegs('YQM', legs, {}, {
    farRows: async (other, dir) => other === 'YUL' ? { yul: W.opevYulGroups(YUL) } : (other === 'YYT' && dir === 'dep') ? { rows: yyt } : null,
    acmem: async (f) => (f === 'AC7754' ? mem : null)
  });
  assert.deepEqual(out[legs[0].id], { op: 'RV', src: 'far', basis: 'YUL ROU' }, 'AC2037: Montréal names Rouge');
  assert.deepEqual(out[legs[1].id], { op: 'PB', src: 'far', basis: 'YYT PB7203' }, 'AC7203: St. John\'s lists it under PAL\'s own number');
  assert.equal(out[legs[2].id], undefined, 'AC7753: nothing names its operator');
  assert.deepEqual(out[legs[3].id], { op: 'PB', src: 'live', basis: 'FR24 PVL7754' }, 'AC7754: today\'s callsign');
});

test('the FR24 memory keeps a callsign and tail for the day it saw them, and only that day', async () => {
  const W = await import(workerPath);
  const d1 = Date.parse('2026-10-03T21:00:00Z'), d2 = Date.parse('2026-10-04T21:00:00Z');
  const a = W.acMemAddObservation(null, 'DH8D', d1, { cs: 'PVL7754', r: 'CGPNE' });
  assert.deepEqual(a.obs, [{ d: '2026-10-03', t: 'DH8D', cs: 'PVL7754', r: 'CGPNE', ts: d1 }]);
  const b = W.acMemAddObservation(a, 'DH8D', d2, { cs: 'JZA7754' });
  assert.deepEqual(b.obs[0], { d: '2026-10-03', t: 'DH8D' }, 'yesterday keeps its type only');
  assert.equal(b.obs[1].cs, 'JZA7754');
  assert.equal(W.acMemUsualType(b, d2), 'DH8D', 'the usual type is read as before');
  // Yesterday's answer is no evidence for today's leg.
  assert.equal(W.opevLive(a, 'AC7754', d2 + 60000), null);
  assert.deepEqual(W.opevLive(b, 'AC7754', d2 + 60000), { op: 'QK', basis: 'FR24 JZA7754' });
  // The marketing carrier's own callsign says nothing.
  assert.equal(W.opevLive(W.acMemAddObservation(null, 'B38M', d2, { cs: 'ACA2040' }), 'AC2040', d2), null);
});

test('a far end\'s row: operator field, the operator\'s own number, callsign, tail, Jazz-only type', async () => {
  const W = await import(workerPath);
  assert.deepEqual(W.opevFromRow({ number: 'AC8542', _opCode: 'QK' }, 'AC'), { op: 'QK', basis: 'operator field' });
  assert.deepEqual(W.opevFromRow({ number: 'PB7203', callSign: 'PVL7203' }, 'AC'), { op: 'PB', basis: 'PB7203' });
  assert.deepEqual(W.opevFromRow({ number: 'AC7754', callSign: 'PVL7754' }, 'AC'), { op: 'PB', basis: 'PVL7754' });
  assert.equal(W.opevFromRow({ number: 'AC7672', callSign: 'ACA7672' }, 'AC'), null, 'ACA names nobody');
  assert.deepEqual(W.opevFromRow({ number: 'AC7799', aircraft: { reg: 'C-FPAL' } }, 'AC'), { op: 'PB', basis: 'C-FPAL' });
  assert.deepEqual(W.opevFromRow({ number: 'AC7799', aircraft: { model: 'CR9' } }, 'AC'), { op: 'QK', basis: 'CR9' });
  assert.equal(W.opevFromRow({ number: 'AC7799', aircraft: { model: 'DH4' } }, 'AC'), null, 'a Dash 8-400 is both partners\'');
  // An authority feed's own row with a tail the table names.
  const own = W.opevAttachOwn({ number: 'AC7799', departure: { airline: { iata: 'AC' } }, aircraft: { reg: 'C-GPIX' } });
  assert.deepEqual(own._opEv, { op: 'PB', src: 'own', basis: 'C-GPIX' });
  const plain = { number: 'AC8542', departure: { airline: { iata: 'AC' } }, aircraft: { reg: 'C-GGNF' } };
  assert.equal(W.opevAttachOwn(plain), plain, 'an unknown tail leaves the row as it was');
  // The far end's index keeps only rows that name someone, so a flight listed
  // twice (the marketing number and the operator's own) is read from the one
  // that names the operator.
  const t = Date.parse('2026-10-04T12:20:00Z');
  const leg = (number, callSign) => ({ number, callSign, _authTs: t, departure: { airport: { iata: 'YYT' } }, arrival: { airport: { iata: 'YQM' } } });
  const ix = W.opevIndexRows([leg('AC7203', 'ACA7203'), leg('PB7203', 'PVL7203'), leg('AC7672', 'ACA7672')], 'dep');
  assert.deepEqual(ix, [['7203', 'YQM', t, 'PB', 'PB7203']]);
  assert.deepEqual(W.opevPickIndex(ix, 'AC7203', 'YQM', t + 90 * 60000), { op: 'PB', basis: 'PB7203' });
  assert.equal(W.opevPickIndex(ix, 'AC7203', 'YQM', t + 24 * 3600000), null, 'tomorrow\'s leg is not today\'s');
  assert.equal(W.opevPickIndex(ix, 'AC7203', 'YHZ', t), null, 'another airport\'s leg');
});

test('/opinfo legs: the board writes what the worker reads', async () => {
  const W = await import(workerPath);
  const C = L();
  const ts = Date.parse('2026-10-04T13:50:00Z');
  const id = C._opEvLegId({ flight: 'AC7203', _locIata: 'YYT', _sortTs: ts, origin: "St. John's" });
  assert.equal(id, 'AC7203.YYT.a.' + Math.round(ts / 1000));
  assert.equal(W.opevParseLeg(id).id, id);
  assert.equal(C._opEvLegId({ flight: 'AC2037', _locIata: 'YUL', _sortTs: ts, dest: 'Montreal' }).split('.')[2], 'd');
  // Which rows ask: Air Canada from 1600 up, without their own record's answer,
  // within the board's window — sorted, so every screen asks alike.
  const now = ts;
  const rows = [
    { flight: 'AC659', airline: 'AC', _locIata: 'YUL', _sortTs: now, dest: 'x' },
    { flight: 'AC7753', airline: 'AC', _locIata: 'YOW', _sortTs: now, dest: 'x' },
    { flight: 'AC2037', airline: 'AC', _locIata: 'YUL', _sortTs: now - 3600000, dest: 'x' },
    { flight: 'AC7932', airline: 'AC', _locIata: 'YQB', _sortTs: now, dest: 'x', _opEv: { op: 'QK' } },
    { flight: 'PD2382', airline: 'PD', _locIata: 'YHU', _sortTs: now, dest: 'x' },
    { flight: 'AC1987', airline: 'AC', _locIata: 'YYZ', _sortTs: now + 40 * 3600000, dest: 'x' }
  ];
  assert.deepEqual(C._opEvLegsFor(rows, now).map((x) => x.split('.')[0]), ['AC2037', 'AC7753']);
});

// ── 3-5. the ladder itself ──────────────────────────────────────────────────

test('the ladder: evidence first, then only the blocks every record agrees on', () => {
  const S = {};
  const C = L({ _OPEV: S });
  const t = Date.parse('2026-10-04T12:00:00Z');
  const row = (flight, other, extra) => Object.assign({ flight, airline: flight.slice(0, 2), _locIata: other, _sortTs: t, dest: other }, extra || {});
  const op = (r, home) => C.fidsResolveOperator(r, home || 'YQM');
  // Rouge's block runs to 2099 — Moncton's AC2037.
  assert.deepEqual(op(row('AC2037', 'YUL')), { op: 'RV', name: 'Air Canada Rouge', src: 'band', basis: 'AC 2037' });
  assert.equal(op(row('AC1987', 'YYZ')).op, 'RV');
  // 77xx: both partners' records turn up — the brand, never a guess.
  assert.deepEqual(op(row('AC7753', 'YOW')), { op: 'ACEX', name: 'Air Canada Express', src: 'brand', basis: 'AC 7753' });
  assert.equal(op(row('AC7773', 'YOW'), 'YUL').op, 'ACEX');
  // PAL's Halifax block and Jazz from 7800.
  assert.equal(op(row('AC7672', 'YYT'), 'YHZ').op, 'PB');
  assert.equal(op(row('AC7883', 'YYZ'), 'YUL').op, 'QK');
  assert.equal(op(row('AC8542', 'YUL'), 'YOW').op, 'QK');
  // Blocks no record pins to one operator get no line without evidence.
  assert.equal(op(row('AC7050', 'YYZ'), 'YUL').op, '', 'a mainline A320 extra');
  assert.equal(op(row('AC7190', 'ATL'), 'YUL').op, '', 'Jazz flies it, but nothing on the row says so');
  assert.equal(op(row('AC7203', 'YYT')).op, '', 'PAL flies it, but nothing on the row says so');
  assert.equal(op(row('AC2246', 'AZS'), 'YUL').op, '', 'a Rouge sun flight, not PAL');
  assert.equal(op(row('AC659', 'YUL')).op, '', 'mainline');
  // A partner whose fleet cannot fly the leg is no attribution.
  assert.equal(op(row('AC8999', 'YVR'), 'YYZ').op, '');
  // 1. own record outranks everything.
  assert.deepEqual(op(row('AC7773', 'YOW', { _opEv: { op: 'PB', src: 'own', basis: 'YUL PVL' } }), 'YUL'),
    { op: 'PB', name: 'PAL Airlines', src: 'own', basis: 'YUL PVL' });
  assert.equal(op(row('AC7190', 'ATL', { _opEv: { op: 'QK', src: 'own', basis: 'YUL JZA' } }), 'YUL').op, 'QK');
  // 2. the far end's record, shared by every screen at the airport.
  const r7203 = row('AC7203', 'YYT', { dest: undefined, origin: "St. John's" });
  S[C._opEvLegId(r7203)] = { op: 'PB', src: 'far', basis: 'YYT PB7203' };
  assert.deepEqual(op(r7203), { op: 'PB', name: 'PAL Airlines', src: 'far', basis: 'YYT PB7203' });
  const r7754 = row('AC7754', 'YOW', { dest: undefined, origin: 'Ottawa' });
  S[C._opEvLegId(r7754)] = { op: 'PB', src: 'live', basis: 'FR24 PVL7754' };
  assert.equal(op(r7754).op, 'PB', 'today\'s callsign outranks the 77xx brand');
  // 3. a callsign on the row; the marketing carrier's own never counts.
  assert.equal(op(row('AC7753', 'YOW', { _feedCs: 'JZA7753' })).op, 'QK');
  assert.equal(op(row('AC7753', 'YOW', { _feedCs: 'ACA7753' })).op, 'ACEX');
  assert.equal(op(row('AC1987', 'YYZ', { _feedCs: 'ACA1987' })).op, 'RV', 'Pearson marks Rouge ACA');
  // 4. an aircraft only Jazz flies for Air Canada.
  assert.equal(op(row('AC7711', 'YFC', { _feedAcCode: 'CR9' }), 'YUL').op, 'QK');
  assert.equal(op(row('AC7711', 'YFC', { _feedAcCode: 'DH4' }), 'YUL').op, 'ACEX', 'a Dash 8-400 is both partners\'');
  // WestJet: Encore's Dash 8s and its 3xxx block, as before, now on the board too.
  assert.equal(op(row('WS3301', 'YYC'), 'YLW').op, 'WR');
  assert.equal(op(row('WS812', 'YYC', { _feedAcCode: 'DH4' }), 'YLW').op, 'WR');
  assert.equal(op(row('WS812', 'YYC'), 'YQM').op, '');
  // Writing it onto a row.
  const w = row('AC7753', 'YOW');
  assert.equal(C.fidsApplyOperator(w, 'YQM'), true);
  assert.deepEqual([w._opCode, w._opName, w._opSrc], ['ACEX', 'Air Canada Express', 'brand']);
  assert.equal(C.fidsApplyOperator(w, 'YQM'), false, 'unchanged the second time');
});

test('Moncton and Montréal rows through the real adapters: board row and gate agree', () => {
  const R = router();
  const C = L({ _OPEV: {} });
  const ev = R.yulOperatorEvidence(YUL);
  const cases = [];
  for (const mode of ['dep', 'arr']) {
    for (const r of YQM[mode]) {
      const adb = R.yqmToAdbFlight(r, mode === 'dep' ? 'Departure' : 'Arrival');
      cases.push(['YQM', boardRow(adb, mode, sched(adb, mode))]);
    }
  }
  for (const f of YUL) {
    const mode = String(f.ArrivalOrDeparture).toUpperCase() === 'A' ? 'arr' : 'dep';
    const adb = R.yulToAdbFlight(f, ev);
    cases.push(['YUL', boardRow(adb, mode, sched(adb, mode))]);
  }
  const got = {};
  for (const [home, row] of cases) {
    C.fidsApplyOperator(row, home);                        // the board row (mapADB)
    const gate = C.fidsResolveOperator(Object.assign({}, row), home);   // a gate's copy of it
    assert.equal(gate.op || null, row._opCode, `${home} ${row.flight}: the gate says what the board says`);
    got[home + ' ' + row.flight] = row._opCode;
  }
  assert.equal(got['YQM AC2037'], 'RV');
  assert.equal(got['YQM AC2040'], 'RV');
  assert.equal(got['YQM AC7753'], 'ACEX');
  assert.equal(got['YQM AC7754'], 'ACEX', 'until the far end or FR24 says PAL');
  assert.equal(got['YQM AC7203'], null, 'until St. John\'s record arrives');
  assert.equal(got['YQM AC659'], null);
  assert.equal(got['YUL AC7932'], 'QK');
  assert.equal(got['YUL AC7190'], 'QK', 'Montréal\'s own JZA');
  assert.equal(got['YUL AC7773'], 'ACEX', 'an ACA+JZA twin is not evidence');
  assert.equal(got['YUL AC2246'], null);
  assert.equal(got['YUL AC2037'], 'RV');
});

test('one ladder: the board and all three gate paths call it, and no flight-number band is left in them', () => {
  // The board row (mapADB) applies it once the row is built.
  assert.match(fnIn(CORE, 'mapADB'), /fidsApplyOperator\(_row, /);
  assert.doesNotMatch(fnIn(CORE, 'mapADB'), /_fnum >= 1600|_fnum <= 2099/);
  // fetchLive asks the worker for the far ends' records, for every screen.
  assert.match(fnIn(CORE, 'fetchLive'), /_opEvRefresh\(iata, /);
  // The phone gate (renderMobileGateHtml), the gate's aircraft caption and
  // shelf (_buildV2MapCol, _buildV2AircraftCol) and the equipment check
  // (renderDedicatedScreen) all read fidsResolveOperator.
  for (const fn of ['renderMobileGateHtml', '_buildV2MapCol', '_buildV2AircraftCol', 'renderDedicatedScreen', 'uxgGateHtml']) {
    assert.match(fnIn(CORE, fn), /fidsResolveOperator\(/, fn);
  }
  // The old matrix and the bands written into the gate paths are gone.
  assert.doesNotMatch(CORE, /acExpressMatrix/);
  assert.doesNotMatch(CORE, /_acFlNum >= 1600|_fn >= 1600|_fnRv >= 1600|>= 2200 && _fn <= 2299|_acFlNum >= 7600/);
  assert.doesNotMatch(CORE, /_PAL_REGS/, 'the PAL tails moved to the worker\'s table, which every screen reads');
  // The zone rule reads the ladder: Express (Jazz, PAL, the shared brand) to Zone 4.
  assert.equal((CORE.match(/acExpressOperated\(fidsResolveOperator\(currentFlight, iata\)\.op\)/g) || []).length, 2);
  const C = L();
  assert.equal(C.acExpressOperated('ACEX'), true);
  assert.equal(C.acExpressOperated('RV'), false);
  assert.equal(C.acExpressOperated(''), false, 'a mainline extra boards like mainline');
  // The worker's PAL tails are the six the gate used to name.
  return import(workerPath).then((W) => {
    assert.deepEqual(Object.keys(W.TAIL_OPERATOR).sort(), ['CFPAL', 'CFPQI', 'CFPVJ', 'CGPAO', 'CGPFI', 'CGPIX']);
  });
});

test('the blocks are only those every record agrees on', () => {
  const C = L();
  assert.deepEqual(C._AC_OP_BANDS.map((b) => [b.lo, b.hi, b.op]),
    [[1600, 2099, 'RV'], [7600, 7699, 'PB'], [7700, 7799, 'ACEX'], [7800, 8999, 'QK']]);
  for (const n of [7000, 7050, 7190, 7203, 7299, 7300, 7599, 2100, 2246, 2299, 1599, 659]) assert.equal(C.acOperatorBand(n), null, String(n));
  // Every Montréal record in a listed block names that block's operator (or,
  // for 77xx, is the twin/ACA pattern the brand stands for).
  const R = router();
  const ev = R.yulOperatorEvidence(YUL);
  for (const f of YUL) {
    const m = /^AC(\d+)$/.exec(f.PublicDisplayFlightNumber);
    if (!m) continue;
    const band = C.acOperatorBand(+m[1]);
    const own = ev[R.yulGroupKey(f)];
    if (band && band !== 'ACEX' && own) assert.equal(own.op, band, f.FlightId);
  }
});

test('Rouge flies the 737 MAX 8: the equipment check keeps it', () => {
  const C = L();
  assert.equal(C._equipSaneForCarrier('AC', 'RV', '', 'Boeing 737 MAX 8'), true);
  assert.equal(C._equipSaneForCarrier('AC', 'RV', '', '7M8'), true);
  assert.equal(C._equipSaneForCarrier('AC', 'RV', '', 'Airbus A220-300'), false, 'still not a Rouge type');
  // The shared brand is a Canadian operator: a US tail is refused.
  assert.equal(C._equipSaneForCarrier('AC', 'ACEX', 'N632SK', ''), false);
});

test('Air Canada Express: Air Canada\'s own artwork, as drawn', () => {
  const file = '/logos/airlines/canadian-regional/aircanada-express.svg';
  const abs = path.join(root, 'fids-current', file);
  assert.ok(fs.existsSync(abs));
  // The file in the repo since the first commit; never edited, recoloured or
  // whitened for this.
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'),
    'a4cec54181cc7755d68992a8ba5b7691e418d061b723384dcc1c61120cce937f');
  assert.match(fs.readFileSync(abs, 'utf8'), /\.cls-1\{fill:#f01428;\}/, 'the red roundel');
  const logos = CORE.slice(CORE.indexOf('var OPERATOR_LOGOS = {'), CORE.indexOf('\n};', CORE.indexOf('var OPERATOR_LOGOS = {')));
  assert.match(logos, /'ACEX': '\/logos\/airlines\/canadian-regional\/aircanada-express\.svg'/);
  // No white version is published, so none is made: no pair, and the caption
  // bar puts the lockup on its white mount (gate-lower-two-colours.test.js).
  const pairs = CORE.slice(CORE.indexOf('var OPBY_WORDMARKS_THEMED = {'), CORE.indexOf('var OPBY_ART_INK = {'));
  assert.doesNotMatch(pairs, /ACEX/);
  assert.doesNotMatch(CORE, /aircanada-express-(?:monochrome-white|light|white)/);
  // The orb keeps Air Canada's roundel: no emblem is registered for the brand.
  assert.doesNotMatch(CORE, /_AIRLINE_EMBLEM_FILES\[['"]ACEX/);
  // Its family is Air Canada's, so the gate never rebrands the row.
  assert.match(lineIn(CORE, '_CS_REGIONAL_FAM'), /'ACEX':'AC'/);
});

test('Air Canada Express in a round orb is Air Canada\'s roundel, never the letters ACEX', () => {
  // ACEX is the ladder's own code for the brand, not a designator, and no orb
  // table is keyed on it. Before every orb resolved it to AC, the inbound orb
  // at Montréal gate A30 (AC7773) printed "ACEX" on a red disc.
  const src = [
    blockIn(CORE, 'var GATE_TOP_ROUND_EMBLEM_FILES = {'),
    blockIn(CORE, 'var AIRLINE_EMBLEM_FILES = window._AIRLINE_EMBLEM_FILES = {'),
    blockIn(CORE, 'const AIRLINE_BRAND = {'),
    blockIn(CORE, 'window._CARD_COLOR_EMBLEMS = {'),
    blockIn(CORE, 'window._orbKeepsColour = function'),
    fnIn(CORE, '_orbEmblemCarrier'), fnIn(CORE, '_airlineOrbEmblem'), fnIn(CORE, '_orbMono'),
    blockIn(CORE, 'window._gateOrbParts = function'),
    'return { _orbEmblemCarrier: _orbEmblemCarrier, _airlineOrbEmblem: _airlineOrbEmblem, _orbMono: _orbMono, _gateOrbParts: window._gateOrbParts };'
  ].join('\n');
  const O = new Function('window', src)({});
  assert.equal(O._orbEmblemCarrier('ACEX'), 'AC');
  assert.equal(O._orbEmblemCarrier(' acex '), 'AC');
  for (const c of ['AC', 'QK', 'PB', 'RV', 'WS', '']) assert.equal(O._orbEmblemCarrier(c), c, c + ' is left alone');
  const acArt = O._airlineOrbEmblem('AC');
  assert.ok(acArt, 'Air Canada has orb art');
  assert.equal(O._airlineOrbEmblem('ACEX'), acArt, 'the same file as Air Canada');
  assert.equal(O._orbMono('ACEX'), 'AC', 'even the last-resort letters are Air Canada\'s');
  assert.deepEqual(O._gateOrbParts('ACEX'), O._gateOrbParts('AC'), 'the same disc, fit and treatment');
  // Every orb that reads an operator code asks the same question.
  assert.match(CORE, /_mcOrbOp = _orbEmblemCarrier\(_mcOrbOp\);/, 'arrival card orb');
  assert.match(CORE, /_niCode = _orbEmblemCarrier\(_niCode\);/, 'inbound "Your Aircraft" orb');
  assert.match(CORE, /var _opOrb = \(typeof _orbEmblemCarrier === 'function'\) \? _orbEmblemCarrier\(_opCode\) : _opCode;/, 'caption orb repaint');
  assert.match(CORE, /_airlineOrbEmblem\(_opOrb\)/);
  assert.doesNotMatch(CORE, /_airlineOrbEmblem\(_opCode\)/, 'no orb resolves the raw operator code');
});

test('the tail table builds from the register\'s owner file, whatever its column order', () => {
  const B = require(path.join(root, 'scripts', 'operator-evidence', 'build-tail-operators.js'));
  // Two layouts of carsownr.txt-style rows: mark first, and mark after the registered-owner field.
  const rows = [
    '"GBJZ","JAZZ AVIATION LP","3 SPECTACLE LAKE DR","DARTMOUTH","NS"',
    '"C-FPAL","PAL AIRLINES LTD.","PO BOX 160","ST. JOHN\'S","NL"',
    '"AIR CANADA ROUGE LP","GSRZ","7373 COTE-VERTU","DORVAL","QC"',
    '"GXXX","JAZZ AVIATION LP"', '"GXXX","PAL AIRLINES LTD."',          // two owners: left out
    '"GKQA","PORTER AIRLINES INC."'                                         // not a partner
  ].join('\r\n');
  const p = B.parseOwnerRows(rows);
  assert.deepEqual(p.table, { CFPAL: 'PB', CGBJZ: 'QK', CGSRZ: 'RV' });
  assert.deepEqual(p.conflicts, ['CGXXX']);
  const block = B.buildBlock(p, '2026-10-04');
  assert.match(block, /Reproduced and distributed with the permission of the Government of Canada\./);
  const WORKER = fs.readFileSync(workerPath, 'utf8');
  const next = B.applyToWorker(WORKER, block);
  assert.match(next, /const TAIL_OPERATOR = \{\n {2}CFPAL: "PB", CGBJZ: "QK", CGSRZ: "RV"\n\};/);
  assert.equal(next.split('// TAIL_OPERATOR:BEGIN').length, 2, 'one block, replaced in place');
  // The worker names the script that writes its block, by the name it has.
  assert.match(WORKER, /scripts\/operator-evidence\/\n\/\/ build-tail-operators\.js writes this block/);
  assert.doesNotMatch(WORKER, /build-tail-operators\.py/);
});

test('Washington\'s feed names the operating carrier, and the ladder reads it first', async () => {
  const W = await import(workerPath);
  const rows = W.mwaaParseFeed(fixture('dca-sample.json'), 'dep', 'DCA', Date.parse('2026-09-04T20:00:00Z'));
  const aa5305 = rows.find((r) => r.number === 'AA5305');
  assert.equal(aa5305._opCode, 'OH', 'reg_code: PSA flies it');
  assert.ok(rows.every((r) => !r._opCode || r._opCode !== String(r.number).slice(0, 2)), 'never the marketing carrier itself');
  const C = L();
  const row = boardRow(aa5305, 'dep', sched(aa5305, 'dep'));
  assert.deepEqual(C.fidsResolveOperator(row, 'DCA'), { op: 'OH', name: 'OH', src: 'own', basis: 'operator field' });
});

test('Pearson\'s own record names Jazz (JZA7884) and nobody for Rouge or a mainline extra (ACA)', () => {
  const src = [fnIn(ROUTER, 'yyzIataFromId2'), fnIn(ROUTER, 'yyzStatus'), fnIn(ROUTER, 'yyzToAdbFlight'), 'return yyzToAdbFlight;'].join('\n');
  const yyz = new Function(src)();
  const C = L({ _OPEV: {} });
  const got = {};
  for (const f of JSON.parse(fixture('yyz-dep-operator-sample.json')).list) {
    const adb = yyz(f);
    const row = boardRow(adb, 'dep', Date.parse(f.schTime));
    got[row.flight] = C.fidsResolveOperator(row, 'YYZ');
  }
  assert.deepEqual(got.AC7884, { op: 'QK', name: 'Jazz Aviation', src: 'callsign', basis: 'JZA7884' });
  assert.equal(got.AC1978.op, 'RV', 'ACA1978 says nothing; Rouge\'s block does');
  assert.equal(got.AC7050.op, '', 'ACA7050: a mainline extra, no line');
  assert.equal(got.AC858.op, '');
});
