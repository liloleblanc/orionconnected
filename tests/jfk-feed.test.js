// JFK New York Kennedy — PANYNJ GraphQL parser on verbatim captures
// (2026-09-06 02:20 EDT, range 2026-09-05T20:00/2026-09-06T02:00, limit
// 5000; 593 departure rows / 554 arrival rows, ~170 KB each). Pins: 12-hour clock + separate date fields combined in New York
// time, dateRevised honoured (and settled when absent) across midnight,
// expanded codeshare rows collapsed to the operator (sub-1000 number, then
// the hub carrier inside its own numbering, never a hub codeshare number),
// gate-less partner rows folded into the operator's row, "(IATA)" echo
// stripped from city names, terminal on the home side, the site's status
// words, and the in-worker lz-string encoder matching the npm module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJfkFeed, jfkLzCompressUri, jfkRangeStrings } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T03:20:00-04:00');
const home = (f) => (f.departure.airport.iata === 'JFK' ? f.departure : f.arrival);

test('jfk dep: 12h clock in New York, operator kept, codeshare rows dropped', () => {
  const dep = parseJfkFeed(fx('jfk-dep-sample.json'), 'dep', NOW);
  assert.ok(dep.length >= 100 && dep.length < 593, `593 expanded rows collapsed to ${dep.length}`);
  assert.ok(dep.every((f) => f.departure.airport.iata === 'JFK' && f.codeshareStatus === 'IsOperator'));
  const tk = dep.find((x) => x.number === 'TK12');
  assert.ok(tk, 'TK12 present');
  assert.equal(tk.departure.scheduledTime.local, '2026-09-06 00:25:00-04:00');   // "12:25 AM" is 00:25
  assert.equal(tk.departure.scheduledTime.utc, '2026-09-06 04:25:00+00:00');
  assert.equal(tk.status, 'scheduled');                                          // "On Time"
  assert.equal(tk.departure.terminal, '1');
  assert.equal(tk.departure.gate, '6');
  assert.equal(tk.arrival.airport.iata, 'IST');
  assert.equal(tk.arrival.airport.name, 'Istanbul, Turkey');                     // "(IST)" echo stripped
  assert.equal(tk.departure.airline.name, 'Turkish Airlines');
  // The six marketing partners on TK12 (same minute/terminal/gate) are gone.
  for (const n of ['TG9183', 'AV6634', 'PK5012', 'HY7292', 'B66903', '6E4016']) {
    assert.ok(!dep.some((x) => x.number === n), `${n} collapsed into TK12`);
  }
  const dl1 = dep.find((x) => x.number === 'DL1');
  assert.ok(dl1, 'DL1 present');
  assert.equal(dl1.status, 'departed');
  assert.equal(dl1.departure.gate, 'B26');
  assert.equal(dl1.departure.terminal, '4');
  assert.ok(dl1.departure.scheduledTime.local.startsWith('2026-09-05 20:15'), dl1.departure.scheduledTime.local);
  assert.ok(!dep.some((x) => x.number === 'KL6101'), 'KL6101 rides on DL1');
  assert.ok(dep.find((x) => x.number === 'BA116'), 'BA116 is the LHR operator at T8');
  assert.ok(!dep.some((x) => x.number === 'AA6929'), 'AA6929 rides on BA116');
});

test('jfk dep: hub carrier wins only inside its own numbering', () => {
  const dep = parseJfkFeed(fx('jfk-dep-sample.json'), 'dep', NOW);
  // VS154 (sub-1000) beats DL5923 — a Delta codeshare number on Virgin's LHR.
  assert.ok(dep.find((x) => x.number === 'VS154'), 'VS154 present');
  assert.ok(!dep.some((x) => x.number === 'DL5923'), 'DL5923 is a codeshare on VS154');
  // No sub-1000 row: JetBlue's own B61701 beats BA8315/EI5320/LO5837/TK8951/AD7619/JU8556/EY8317/QR3913.
  const b6 = dep.find((x) => x.number === 'B61701');
  assert.ok(b6, 'B61701 present');
  assert.equal(b6.arrival.airport.iata, 'FLL');
  assert.equal(b6.departure.terminal, '5');
  assert.ok(!dep.some((x) => x.number === 'BA8315' || x.number === 'QR3913'));
  // Delta Connection DL5658 (own numbering) beats VS4849/KL7344/SK3367/AF3489.
  assert.ok(dep.find((x) => x.number === 'DL5658'), 'DL5658 present');
  assert.ok(!dep.some((x) => x.number === 'AF3489'));
  // Every (number, minute) pair is unique after the collapse.
  assert.equal(new Set(dep.map((f) => `${f.number}|${f._authTs}`)).size, dep.length);
});

test('jfk dep: revised times cross midnight correctly; cancelled/delayed words', () => {
  const dep = parseJfkFeed(fx('jfk-dep-sample.json'), 'dep', NOW);
  const nz = dep.find((x) => x.number === 'NZ1');
  assert.ok(nz, 'NZ1 present');
  assert.equal(nz.departure.scheduledTime.local, '2026-09-05 21:55:00-04:00');
  assert.equal(nz.departure.revisedTime.local, '2026-09-06 00:27:00-04:00');     // dateRevised honoured
  assert.ok(nz.departure.revisedTime.utc > nz.departure.scheduledTime.utc, 'a delay, not a day back');
  assert.equal(nz.status, 'departed');
  const dl3 = dep.find((x) => x.number === 'DL3');
  assert.ok(dl3, 'DL3 present (KL6103/SK3973/VS4030/SV4423/AF3662 collapsed)');
  assert.equal(dl3.status, 'delayed');
  assert.equal(dl3.departure.revisedTime.local, '2026-09-06 02:20:00-04:00');
  const cx = dep.find((x) => x.number === 'B62583');
  assert.ok(cx, 'B62583 present');
  assert.equal(cx.status, 'cancelled');
  assert.equal(cx.arrival.airport.iata, 'MCO');
  assert.ok(!cx.departure.revisedTime, 'no revision on a cancelled row');
  const kin = dep.find((x) => x.number === 'B61059');
  assert.ok(kin, 'B61059 present');
  assert.equal(kin.arrival.airport.name, 'Kingston, Jamaica');                   // was "Kingston, Jamaica (KIN)"
  assert.ok(dep.every((f, i) => !i || dep[i - 1]._authTs <= f._authTs), 'sorted by scheduled time');
});

test('jfk arr: unsorted upstream sorted here; En Route → active; T-gates dropped', () => {
  const arr = parseJfkFeed(fx('jfk-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 100 && arr.length < 554, `554 expanded rows collapsed to ${arr.length}`);
  assert.ok(arr.every((f) => f.arrival.airport.iata === 'JFK'));
  assert.ok(arr.every((f, i) => !i || arr[i - 1]._authTs <= f._authTs), 'sorted by scheduled time');
  const tk = arr.find((x) => x.number === 'TK11');
  assert.ok(tk, 'TK11 present');
  assert.equal(tk.status, 'arrived');
  assert.equal(tk.arrival.scheduledTime.local, '2026-09-05 22:30:00-04:00');
  assert.equal(tk.arrival.revisedTime.local, '2026-09-05 23:10:00-04:00');
  assert.equal(tk.arrival.terminal, '1');
  assert.equal(tk.arrival.gate, '2');
  assert.equal(tk.departure.airport.iata, 'IST');
  assert.ok(!arr.some((x) => x.number === 'TG9144'), 'TG9144 rides on TK11');
  const av = arr.find((x) => x.number === 'AV244');
  assert.ok(av, 'AV244 present');
  assert.equal(av.arrival.scheduledTime.local, '2026-09-05 23:45:00-04:00');
  assert.equal(av.arrival.revisedTime.local, '2026-09-06 00:03:00-04:00');       // dateRevised 2026-09-06
  assert.equal(av.departure.airport.name, 'Bogota, Colombia');
  const dl = arr.find((x) => x.number === 'DL415');                                // VS4764/KL7645/LA6742… on it
  assert.ok(dl, 'DL415 present');
  assert.equal(dl.arrival.gate, 'B46');
  assert.equal(dl.arrival.revisedTime.local, '2026-09-05 20:49:00-04:00');
  assert.ok(!arr.some((x) => x.number === 'VS4764'));
  const en = arr.find((x) => x.number === 'OZ224');
  assert.ok(en, 'OZ224 present');
  assert.equal(en.status, 'active');                                             // "En Route"
  const cx = arr.find((x) => x.number === 'DL624');
  assert.ok(cx, 'DL624 present (VS4978/AM5278 collapsed)');
  assert.equal(cx.status, 'cancelled');
  const b6 = arr.find((x) => x.number === 'B6662');
  assert.ok(b6, 'B6662 present');
  assert.equal(b6.status, 'delayed');
  assert.equal(b6.arrival.revisedTime.local, '2026-09-05 20:14:00-04:00');
  // Gate column sometimes says "T 4" on unassigned rows — not a gate.
  assert.ok(!arr.some((f) => /^T\s*\d/i.test(f.arrival.gate || '')), 'no terminal-shaped gates');
  assert.ok(arr.some((f) => f.arrival.gate === '47A'), 'real alphanumeric gates survive');
});

test('jfk: lz-string encoder matches the npm module the site bundles', () => {
  assert.equal(jfkLzCompressUri('{"a":1}'), 'N4IghiBcCMC+Q');
  assert.equal(
    jfkLzCompressUri('{"operationName":"GetDepartingFlights","variables":{"departureAirport":"JFK","departureDateTime":"2026-09-06","limit":5000}}'),
    'N4Ig9gDgpgTghgFwJZgHYDk4FsogFwgDiUCAIlBHDMqgOYBiANkrQBYIDOIANCAG5UkcAEaMoXPKAAmFKggCuMKAEEkMCGGr4QAKXoBpHiBmVqiqKURQAKkhzaATAAYHANgC0TgJyfXR5lhICPgArE7hAL4RQA'
  );
  assert.equal(jfkLzCompressUri(''), 'Q');                                       // lz-string's own answer for ""
  assert.ok(/^[A-Za-z0-9+\-$]+$/.test(jfkLzCompressUri('héllo ✈')), 'URI-safe alphabet only');
});

test('jfk: request range is anchored on the New York hour and spans the boards\' -2h/+22h', () => {
  assert.deepEqual(jfkRangeStrings('America/New_York', Date.parse('2026-09-06T23:59:00-04:00')),
    { from: '2026-09-06T20:00', to: '2026-09-07T22:00' });
  assert.deepEqual(jfkRangeStrings('America/New_York', Date.parse('2026-09-06T03:20:00-04:00')),
    { from: '2026-09-06T00:00', to: '2026-09-07T02:00' });
  assert.deepEqual(jfkRangeStrings('America/New_York', Date.parse('2026-09-06T02:16:00-04:00')),
    { from: '2026-09-05T23:00', to: '2026-09-07T01:00' });                     // the live request captured at 02:20 EDT (2607/2912 rows)
  // Fall-back night: still wall-clock strings the API accepts.
  assert.deepEqual(jfkRangeStrings('America/New_York', Date.parse('2026-11-01T07:30:00Z')),
    { from: '2026-11-01T00:00', to: '2026-11-02T01:00' });
});

test('jfk: garbage in, empty out', () => {
  assert.deepEqual(parseJfkFeed('{}', 'dep', NOW), []);
  assert.deepEqual(parseJfkFeed('x', 'arr', NOW), []);
  assert.deepEqual(parseJfkFeed('{"data":{"getDepartingFlights":{"data":[]}}}', 'dep', NOW), []);
  assert.deepEqual(parseJfkFeed('{"errors":[{"message":"departureDateTime must be in format"}],"data":null}', 'dep', NOW), []);
});
