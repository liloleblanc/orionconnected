// US batch — BOS / LAS / DEN / ORD / PHL parsers against verbatim
// captures from 2026-09-04/05. Highlights pinned: Boston's AcType+AcReg
// riding into aircraft.{model,reg} (tail numbers straight from the
// airport), Vegas's epoch-second vendor feed (MCO's cousin), Chicago's
// WCF /Date(ms-0500)/ timestamps, Philadelphia's epoch-in-attribute
// HTML, and Denver's plain-local ISO clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bosParseFeed, lasParseFeed, denParseFeed, ordParseFeed, phlParsePage } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const bosFix = JSON.parse(fx('bos-sample.json'));
const NOW = Date.parse('2026-09-05T01:00:00-04:00');

test('bos: UTC schedule, PM actual, aircraft type AND registration', () => {
  const arr = bosParseFeed(JSON.stringify(bosFix.arr), 'arr', NOW);
  assert.ok(arr.length >= 2, `parsed ${arr.length}`);
  const b6 = arr.find((x) => x.number === 'B6474');
  assert.ok(b6, 'B6474 present');
  assert.ok(b6.arrival.scheduledTime.local.startsWith('2026-09-04 21:45'), b6.arrival.scheduledTime.local);
  assert.ok(b6.arrival.revisedTime && b6.arrival.revisedTime.local.includes('21:12'), 'actual 9:12 PM');
  assert.equal(b6.status, 'arrived');
  assert.equal(b6.arrival.gate, 'C17');
  assert.equal(b6.arrival.terminal, 'C');
  assert.equal(b6.arrival.baggageBelt, '3');
  assert.equal(b6.departure.airport.iata, 'AUA');
  assert.equal(b6.aircraft.model, '321');
  assert.equal(b6.aircraft.reg, 'N974JT');
  const dep = bosParseFeed(JSON.stringify(bosFix.dep), 'dep', NOW);
  assert.ok(dep.length >= 1 && dep[0].departure.airport.iata === 'BOS');
});

test('las: epoch seconds, terminal stripped of its T, best-known revision', () => {
  const dep = lasParseFeed(fx('las-sample.json'), 'dep', NOW);
  assert.ok(dep.length >= 1, `parsed ${dep.length}`);
  const wn = dep.find((x) => x.number === 'WN4506');
  assert.ok(wn, 'WN4506 present');
  assert.equal(wn.arrival.airport.iata, 'AUS');
  assert.equal(wn.departure.gate, 'B21');
  assert.equal(wn.departure.terminal, '1');
  assert.equal(wn.status, 'departed');
  assert.ok(wn.departure.revisedTime, 'bestKnown differs from scheduled');
  assert.match(wn.departure.scheduledTime.local, /-07:00$/, 'Pacific offset');
});

test('den: plain-local ISO clock lands on Denver wall time', () => {
  const arr = denParseFeed(fx('den-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 2, `parsed ${arr.length}`);
  const wn = arr.find((x) => x.number === 'WN 4697');
  assert.ok(wn, 'WN 4697 present (spaced, ADB style)');
  assert.ok(wn.arrival.scheduledTime.local.startsWith('2026-09-03 19:30'), wn.arrival.scheduledTime.local);
  assert.ok(wn.arrival.scheduledTime.local.endsWith('-06:00'), 'Mountain offset');
  assert.equal(wn.arrival.gate, 'C46');
  assert.equal(wn.status, 'arrived');
  assert.equal(wn.departure.airport.iata, 'SEA');
});

test('ord: WCF /Date(ms-0500)/ parses; Landed maps to arrived', () => {
  const arr = ordParseFeed(fx('ord-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 2, `parsed ${arr.length}`);
  const atlas = arr.find((x) => x.number === '5Y753');
  assert.ok(atlas, '5Y753 present');
  assert.equal(atlas.status, 'arrived');
  assert.equal(atlas.departure.airport.iata, 'ANC');
  assert.ok(atlas.arrival.scheduledTime.local.endsWith('-05:00'), 'Central offset');
});

test('phl: epoch attributes, airline code attribute, table split by id', () => {
  const arr = phlParsePage(fx('phl-sample.html'), 'arr', NOW);
  const dep = phlParsePage(fx('phl-sample.html'), 'dep', NOW);
  assert.ok(arr.length >= 2 && dep.length >= 1, `arr=${arr.length} dep=${dep.length}`);
  const dl = arr.find((x) => x.number === 'DL 1692');
  assert.ok(dl, 'DL 1692 present');
  assert.equal(dl.arrival.airport.iata, 'PHL');
  assert.equal(dl.departure.airline.iata, 'DL');
  assert.equal(dl._authTs, 1788552660000, 'epoch rides the data-order attribute');
});

test('us: garbage in, empty out', () => {
  assert.deepEqual(bosParseFeed('x', 'arr', NOW), []);
  assert.deepEqual(lasParseFeed('{}', 'dep', NOW), []);
  assert.deepEqual(denParseFeed('{}', 'arr', NOW), []);
  assert.deepEqual(ordParseFeed('[]', 'dep', NOW), []);
  assert.deepEqual(phlParsePage('<html></html>', 'arr', NOW), []);
});
