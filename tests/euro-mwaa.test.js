// Iceland / UK / Washington batch — KEF / EDI / DCA / IAD parsers
// against verbatim captures (2026-09-05). KEF and EDI both carry
// aircraft type (and KEF the registration), so these pin the
// "what aircraft" path on real data; DCA/IAD share one parser and its
// InGate/InAir status vocabulary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kefParseFeed, ediParseFeed, mwaaParseFeed } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-05T00:30:00Z');

test('kef: UTC-Z to Reykjavik (UTC), reg + type, direction by which end is KEF', () => {
  const arr = kefParseFeed(fx('kef-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const lh = arr.find((x) => x.number === 'LH846');
  assert.ok(lh, 'LH846 present');
  assert.ok(lh.arrival.scheduledTime.local.startsWith('2026-09-04 23:30'), lh.arrival.scheduledTime.local);
  assert.ok(lh.arrival.scheduledTime.local.endsWith('+00:00'), 'Iceland = UTC');
  assert.equal(lh.arrival.gate, 'C23');
  assert.equal(lh.arrival.baggageBelt, '4');
  assert.equal(lh.aircraft.model, '32Q');
  assert.equal(lh.aircraft.reg, 'DAIED');
  assert.equal(lh.status, 'arrived');            // "All Bags Arrived"
  assert.equal(lh.departure.airport.iata, 'FRA');
  assert.equal(lh.departure.airline.iata, 'LH');
  const dep = kefParseFeed(fx('kef-sample.json'), 'dep', NOW);
  assert.ok(dep.every((x) => x.departure.airport.iata === 'KEF'));
});

test('edi: offset ISO, aircraft type trimmed of WINGLETS, belt', () => {
  const arr = ediParseFeed(fx('edi-arr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const ls = arr.find((x) => x.number === 'LS726');
  assert.ok(ls, 'LS726 present');
  assert.ok(ls.arrival.scheduledTime.local.startsWith('2026-09-05 02:10'), ls.arrival.scheduledTime.local);
  assert.equal(ls.status, 'arrived');            // "LANDED 03:54"
  assert.equal(ls.arrival.baggageBelt, '7');
  assert.equal(ls.aircraft.model, 'BOEING 737-800');   // WINGLETS shed
  assert.equal(ls.departure.airport.iata, 'RHO');
  assert.equal(ls.departure.airline.iata, 'LS');
});

test('mwaa/dca: InGate maps to arrived; ET time; claim rides; shared parser', () => {
  const arr = mwaaParseFeed(fx('dca-sample.json'), 'arr', 'DCA', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const aa = arr.find((x) => x.number === 'AA5062');
  assert.ok(aa, 'AA5062 present');
  assert.equal(aa.status, 'arrived');            // "InGate"
  assert.ok(aa.arrival.scheduledTime.local.startsWith('2026-09-04 06:35'), aa.arrival.scheduledTime.local);
  assert.ok(aa.arrival.scheduledTime.local.endsWith('-04:00'), 'EDT');
  assert.equal(aa.arrival.gate, 'E52');
  assert.equal(aa.arrival.baggageBelt, '7');
  assert.equal(aa.departure.airport.iata, 'CAK');
  assert.ok(aa.arrival.revisedTime, 'actual 06:14 differs');
  // Same parser, IAD home code
  const iadArr = mwaaParseFeed(fx('dca-sample.json'), 'arr', 'IAD', NOW);
  assert.ok(iadArr.every((x) => x.arrival.airport.iata === 'IAD'));
});

test('euro-mwaa: garbage in, empty out', () => {
  assert.deepEqual(kefParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(ediParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(mwaaParseFeed('x', 'arr', 'DCA', NOW), []);
});
