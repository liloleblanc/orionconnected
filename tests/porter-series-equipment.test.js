'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// PORTER'S FLIGHT-NUMBER SERIES IS THE ONLY EQUIPMENT SIGNAL THESE FEEDS LEAVE.
//
// The airport authority feeds publish no aircraft field whatever. Every Porter
// row on them renders with a blank type, and any block-time estimate is made
// without knowing whether it is costing a turboprop or a jet. On YQM→YHU that
// is 1h24m against 1h09m, and the gate board was showing the jet figure on a
// route that only sees Dash 8-400s — an arrival roughly fifteen minutes early,
// every Porter flight, every day, presented at the same weight as the departure
// time the airport actually supplied.
//
// THE RULE ONLY EVER ADDS. An unrecognised number means UNKNOWN, never
// "therefore a jet". Porter can open a 1000-series or any other range whenever
// it likes, and a rule that inferred the negative would quietly cost a new
// turboprop series as jets on a board nobody had thought to re-check. That is
// the failure this whole area keeps producing: stating something confidently
// that the system does not actually know.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js');

// Lift the function out of the bundle rather than loading 2.8MB of browser code.
function loadFn(name) {
  const body = fs.readFileSync(SRC, 'utf8');
  const start = body.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' not found in fids-core.js');
  let depth = 0, i = body.indexOf('{', start), end = -1;
  for (; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.notEqual(end, -1, 'could not bracket-match ' + name);
  // eslint-disable-next-line no-new-func
  return new Function(body.slice(start, end) + '; return ' + name + ';')();
}

const porterSeriesEquipment = loadFn('_porterSeriesEquipment');

test('the 2000-series is the Dash 8 network', () => {
  // Observed live: Moncton and Halifax departures on the authority feeds.
  for (const n of ['PD2382', 'PD2294', 'PD2370', 'PD2373', 'PD2324', 'PD2195', 'PD2494']) {
    assert.equal(porterSeriesEquipment(n), 'DHC-8-400', n + ' should read as a Dash 8');
  }
});

test('the low ranges are left alone — they are the jet routes', () => {
  // PD200/202/204 run Halifax–Toronto, PD465 Halifax–St. John's, PD490
  // Halifax–Saint-Hubert. All three-digit, all E195-E2 routes.
  for (const n of ['PD200', 'PD202', 'PD204', 'PD240', 'PD465', 'PD470', 'PD490']) {
    assert.equal(porterSeriesEquipment(n), null, n + ' must not be claimed as a Dash 8');
  }
});

test('an unrecognised series is UNKNOWN, never "therefore a jet"', () => {
  // The rule adds information or says nothing. It never infers the negative.
  // A 1000-series — which Porter has not used here but may — must come back
  // null so that nothing downstream costs it as either aeroplane.
  for (const n of ['PD1000', 'PD1234', 'PD1999', 'PD3000', 'PD3421', 'PD9999', 'PD12345']) {
    const got = porterSeriesEquipment(n);
    assert.equal(got, null,
      n + ' returned ' + JSON.stringify(got) + ' — an unknown series must stay unknown, ' +
      'so a range Porter opens later is never silently costed as the wrong aeroplane');
  }
});

test('it claims nothing about other carriers', () => {
  // 2000-series numbers are commonplace. The rule is Porter's alone, and the
  // caller gates on the airline — but the function must not invite misuse.
  for (const n of ['AC2382', 'WS2382', 'PB2382', 'F82382', '2382', '']) {
    assert.equal(porterSeriesEquipment(n), null, n + ' is not a Porter number');
  }
});

test('it survives the shapes a feed actually produces', () => {
  assert.equal(porterSeriesEquipment('pd2382'), 'DHC-8-400', 'lowercase');
  assert.equal(porterSeriesEquipment('PD 2382'), 'DHC-8-400', 'space after the code');
  // IATA flight numbers run to four digits, so a five-character numeric is
  // always padding rather than a longer number. Stripping it recognises a row
  // that would otherwise be missed; keeping it would drop a real Dash 8.
  assert.equal(porterSeriesEquipment('PD02382'), 'DHC-8-400', 'zero-padded four-digit');
  assert.equal(porterSeriesEquipment('PD002382'), 'DHC-8-400', 'and padded further');
  assert.equal(porterSeriesEquipment(null), null);
  assert.equal(porterSeriesEquipment(undefined), null);
  assert.equal(porterSeriesEquipment(2382), null, 'a bare number carries no carrier');
});

test('real equipment data is never overridden by the series', () => {
  // Guarding the call site's contract, not the function: the rule fires only
  // on an empty aircraft field, so a feed that does publish equipment always
  // wins. Asserted here because the guarantee lives in the caller and is the
  // thing that keeps an inference from outranking a fact.
  const body = fs.readFileSync(SRC, 'utf8');
  const call = body.indexOf('_porterSeriesEquipment(f.number)');
  assert.notEqual(call, -1, 'the series rule is not wired into the row builder');
  const before = body.slice(Math.max(0, call - 400), call);
  assert.match(before, /if\s*\(\s*!_aircraftRaw\s*\)/,
    'the series rule must be guarded on an EMPTY aircraft field, so real data wins');
});
