// SLC Salt Lake City — slcairport.com board parser against verbatim
// captures (2026-09-05, ~20:15 MDT). Pins: the per-day `table-title`
// header supplying the date for otherwise dateless rows, the tag-soup
// rows (no </td>/</tr>), 12-hour clock on Mountain Daylight Time, the
// static city→IATA map, InGate meaning "arrived" only on arrivals, and
// zero-padded JetBlue/Frontier numbers (B60247 → B6247).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slcParsePage } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T20:15:00-06:00');

test('slc dep: full day parses, date from table-title, MDT offset, gate, live status', () => {
  const dep = slcParsePage(fx('slc-dep-sample.html'), 'dep', NOW);
  assert.equal(dep.length, 292);                       // "We found 292 departing flights"
  assert.ok(dep.every((x) => x.departure.airport.iata === 'SLC'));
  const aa = dep.find((x) => x.number === 'AA1214');   // first row of the day
  assert.ok(aa, 'AA1214 present');
  assert.equal(aa.departure.scheduledTime.local, '2026-09-05 05:00:00-06:00');
  assert.equal(aa.departure.scheduledTime.utc, '2026-09-05 11:00:00+00:00');
  assert.equal(aa.departure.gate, 'B5');
  assert.equal(aa.status, 'departed');
  assert.equal(aa.arrival.airport.iata, 'DFW');        // "Dallas/Ft. Worth"
  assert.equal(aa.arrival.airport.name, 'Dallas/Ft. Worth');
  assert.equal(aa.departure.airline.iata, 'AA');
  assert.equal(aa.departure.airline.name, 'American Airlines');
  const b6 = dep.find((x) => x.number === 'B6248');    // printed "B60248"
  assert.ok(b6, 'B60248 → B6248 present');
  assert.equal(b6.departure.scheduledTime.local, '2026-09-05 23:59:00-06:00');
  assert.equal(b6.status, 'scheduled');                // "On Time"
  assert.equal(b6.arrival.airport.iata, 'BOS');
  const am = dep.find((x) => x.number === 'AM793');
  assert.ok(am, 'AM793 present');
  assert.equal(am.status, 'scheduled');                // InGate on a departure is not "arrived"
  assert.ok(!dep.some((x) => x.departure.revisedTime), 'the board carries no revised time');
});

test('slc arr: counts, city map, InGate → arrived, In Flight → active', () => {
  const arr = slcParsePage(fx('slc-arr-sample.html'), 'arr', NOW);
  assert.equal(arr.length, 295);                       // "We found 295 arriving flights"
  assert.ok(arr.every((x) => x.arrival.airport.iata === 'SLC'));
  const dl = arr.find((x) => x.number === 'DL534');    // first row of the day
  assert.ok(dl, 'DL534 present');
  assert.equal(dl.arrival.scheduledTime.local, '2026-09-05 05:46:00-06:00');
  assert.equal(dl.arrival.gate, 'A15');
  assert.equal(dl.departure.airport.iata, 'HNL');
  assert.equal(dl.departure.airline.name, 'Delta Air Lines');
  const am = arr.find((x) => x.number === 'AM792');
  assert.ok(am, 'AM792 present');
  assert.equal(am.status, 'arrived');                  // InGate
  assert.equal(am.departure.airport.iata, 'GDL');
  const b6 = arr.find((x) => x.number === 'B6247');    // printed "B60247"
  assert.ok(b6, 'B60247 → B6247 present');
  assert.equal(b6.status, 'active');                   // In Flight
  assert.equal(b6.arrival.scheduledTime.local, '2026-09-05 23:04:00-06:00');
  assert.equal(b6.departure.airport.iata, 'BOS');
  assert.ok(arr.some((x) => x.status === 'arrived'), 'some arrived');
  // Every city on today's board resolves to a code.
  const unmapped = arr.filter((x) => !x.departure.airport.iata).map((x) => x.departure.airport.name);
  assert.deepEqual([...new Set(unmapped)], []);
});

test('slc: multi-day page splits on each table-title header', () => {
  const two = '<div class=table-title>Sat, Sep 05</div><table class="data-D flight-data flight-striped"><thead><tr><th>x</thead>'
    + '<tbody><tr><td>11:59 PM <td>Boston <td>B60248 <td style=text-transform:uppercase>On Time <td>B2 </tbody></table>'
    + '<div class=table-title>Sun, Sep 06</div><table class="data-D flight-data flight-striped"><thead><tr><th>x</thead>'
    + '<tbody><tr><td>12:05 AM <td>Denver <td>F94251 <td style=text-transform:uppercase>Scheduled <td>TBD </tbody></table>';
  const f = slcParsePage(two, 'dep', NOW);
  assert.equal(f.length, 2);
  assert.equal(f[0].departure.scheduledTime.local, '2026-09-05 23:59:00-06:00');
  assert.equal(f[1].number, 'F94251');
  assert.equal(f[1].departure.scheduledTime.local, '2026-09-06 00:05:00-06:00');
  assert.equal(f[1].departure.gate, undefined);        // TBD is not a gate
  assert.ok(f[1]._authTs > f[0]._authTs);
});

test('slc: garbage in, empty out', () => {
  assert.deepEqual(slcParsePage('<html></html>', 'dep', NOW), []);
  assert.deepEqual(slcParsePage('', 'arr', NOW), []);
  assert.deepEqual(slcParsePage('{}', 'arr', NOW), []);
});
