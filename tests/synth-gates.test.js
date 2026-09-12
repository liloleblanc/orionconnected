'use strict';

// Billy Bishop and Saint-Hubert publish no gate on any row — measured, not
// assumed: 129 YTZ departures and 46 YHU, gate empty on every one. A gate
// screen picks from the gates its flights carry, so with none it has nothing
// to show and both boards came up blank.
//
// The stand is therefore DERIVED. The two properties that make that safe to put
// on a public board are the ones worth testing:
//
//   STABLE — the same flight must hold the same stand across every refresh,
//            across the departures and arrivals calls, and across worker
//            restarts. A gate that changed between polls would be worse than
//            no gate, because a traveller would act on it.
//   HONEST — a real gate must always win; the derived value only ever fills an
//            empty field, and is flagged so nothing downstream can mistake it
//            for something the airport published.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const worker = fs.readFileSync(path.resolve(__dirname, '..', 'workers', 'fids-proxy.js'), 'utf8');

// Lift the shipped implementation rather than restating it, so the test cannot
// drift from the code it is describing.
function loadImpl() {
  const pools = /const SYNTH_GATE_POOLS = \{[\s\S]*?\};/.exec(worker);
  assert.ok(pools, 'fids-proxy.js must declare SYNTH_GATE_POOLS');
  const fn = /function synthGateFor\(iata, flightNo, localDate\) \{[\s\S]*?\n\}/.exec(worker);
  assert.ok(fn, 'fids-proxy.js must declare synthGateFor');
  // eslint-disable-next-line no-new-func
  return new Function(`${pools[0]}\n${fn[0]}\nreturn { SYNTH_GATE_POOLS, synthGateFor };`)();
}
const { SYNTH_GATE_POOLS, synthGateFor } = loadImpl();

test('a flight holds the same stand every time it is asked for', () => {
  // The whole point: no clock, no randomness, no stored state.
  const a = synthGateFor('YTZ', 'PD2520', '2026-09-12');
  for (let i = 0; i < 200; i++) {
    assert.equal(synthGateFor('YTZ', 'PD2520', '2026-09-12'), a);
  }
  // Whitespace and case are how the same flight arrives from two feeds.
  assert.equal(synthGateFor('YTZ', 'pd 2520', '2026-09-12'), a);
  assert.equal(synthGateFor('YTZ', ' PD2520 ', '2026-09-12'), a);
});

test('departures and arrivals of one flight agree', () => {
  // The two directions are separate HTTP calls into separate handlers. They
  // must not disagree, or the same aircraft shows two stands on one screen.
  assert.equal(
    synthGateFor('YHU', 'P6385', '2026-09-12'),
    synthGateFor('YHU', 'P6385', '2026-09-12'));
});

test('the stand is always one the airport actually has', () => {
  for (const [iata, pool] of Object.entries(SYNTH_GATE_POOLS)) {
    for (let n = 1; n < 400; n++) {
      const g = synthGateFor(iata, 'XX' + n, '2026-09-12');
      assert.ok(pool.includes(g), `${iata}: produced ${g}, which is not in its pool`);
    }
  }
});

test('the day rolls the assignment, so a stand is not frozen forever', () => {
  // Keyed on the local date as well as the number: tomorrow's PD2520 may sit
  // somewhere else, which is what a real operation looks like.
  const days = new Set();
  for (const d of ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16']) {
    days.add(synthGateFor('YTZ', 'PD2520', d));
  }
  assert.ok(days.size > 1, 'every day produced the same stand — the date is not in the key');
});

test('it spreads across the apron instead of piling onto one stand', () => {
  // A hash that clumps would put half the airline on gate 3. Check the busiest
  // stand does not take more than twice its fair share.
  const pool = SYNTH_GATE_POOLS['YTZ'];
  const counts = {};
  const N = 600;
  for (let n = 0; n < N; n++) {
    const g = synthGateFor('YTZ', 'PD' + (2000 + n), '2026-09-12');
    counts[g] = (counts[g] || 0) + 1;
  }
  const fair = N / pool.length;
  const worst = Math.max(...Object.values(counts));
  assert.ok(worst < fair * 2,
    `worst stand took ${worst} of ${N} against a fair share of ${fair.toFixed(0)} — the hash clumps`);
  assert.equal(Object.keys(counts).length, pool.length, 'some stands were never used');
});

test('nothing is produced for an airport that publishes its own gates', () => {
  assert.equal(synthGateFor('YOW', 'AC341', '2026-09-12'), null);
  assert.equal(synthGateFor('YYZ', 'AC101', '2026-09-12'), null);
  assert.equal(synthGateFor('', 'AC101', '2026-09-12'), null);
  assert.equal(synthGateFor('YTZ', '', '2026-09-12'), null);
  assert.equal(synthGateFor('YTZ', null, '2026-09-12'), null);
});

test('a real gate is never overwritten', () => {
  // Both call sites guard on the field already being set. If that guard is ever
  // dropped, a published gate would be replaced by a derived one, which is the
  // one outcome that would make this feature harmful rather than useful.
  const ytz = /for \(const row of list\) \{\s*if \(row\.gate\) continue;/.test(worker);
  assert.ok(ytz, 'the YTZ fill no longer skips rows that already carry a gate');
  const yhu = /if \(!fid \|\| row\.synthGate\) continue;/.test(worker);
  assert.ok(yhu, 'the YHU fill no longer skips rows it has already handled');
});

test('every derived stand is flagged as derived', () => {
  // So no consumer, and no future reader of this data, can mistake it for
  // something Billy Bishop or MET published.
  assert.ok(/row\.gateSynth = true;/.test(worker), 'rows are not flagged with gateSynth');
  assert.equal((worker.match(/row\.gateSynth = true;/g) || []).length, 2,
    'expected the flag on both the YTZ and YHU fills');
});

test('the client prefers a published gate over the derived one', () => {
  const router = fs.readFileSync(
    path.resolve(__dirname, '..', 'fids-current', 'js', 'feed-router.js'), 'utf8');
  assert.match(router, /f\.gate \|\| f\.synthGate/,
    'yhuToAdbFlight must read the real gate first and fall back to the derived one');
});
