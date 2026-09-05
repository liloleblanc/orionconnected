// West batch — YYC / SFO / SEA / YVR parsers against verbatim captures.
// Pins: Calgary's JSON-encoded-JSON body (parse twice), SFO's offset
// ISO times and CL- carousel prefix, Seattle's dated 12-hour rows, and
// Vancouver's OFFSET-LESS timestamps pinned to Pacific wall clock (the
// YVR fixture is a 2018 archive capture — the endpoint is behind
// Cloudflare for curl; the deployed Worker probes it for real).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yycParseFeed, sfoParseFeed, seaParsePage, yvrParseFeed } from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-04T12:00:00-06:00');

test('yyc: double-encoded body parses; UTC lands on Calgary wall clock', () => {
  const dep = yycParseFeed(fx('yyc-sample.json'), 'dep', NOW);
  assert.ok(dep.length >= 1, `parsed ${dep.length}`);
  const ws = dep.find((x) => x.number === 'WS674');
  assert.ok(ws, 'WS674 present');
  assert.ok(ws.departure.scheduledTime.local.startsWith('2026-09-04 00:15'), ws.departure.scheduledTime.local);
  assert.ok(ws.departure.scheduledTime.local.endsWith('-06:00'), 'Mountain offset');
  assert.equal(ws.departure.gate, 'C57');
  assert.equal(ws.departure.terminal, 'C');
  assert.equal(ws.status, 'departed');
  assert.equal(ws.arrival.airport.iata, 'YHZ');
  const arr = yycParseFeed(fx('yyc-sample.json'), 'arr', NOW);
  const belted = arr.find((x) => x.arrival.baggageBelt);
  assert.ok(belted && /^\d+$/.test(belted.arrival.baggageBelt), 'ClaimUnit rides as belt');
});

test('sfo: gates, carousel prefix stripped, remark maps', () => {
  const dep = sfoParseFeed(fx('sfo-sample.json'), 'dep', NOW);
  const arr = sfoParseFeed(fx('sfo-sample.json'), 'arr', NOW);
  assert.ok(dep.length >= 1 && arr.length >= 1, `dep=${dep.length} arr=${arr.length}`);
  const ua = dep.find((x) => x.number === 'UA2025');
  assert.ok(ua, 'UA2025 present');
  assert.equal(ua.departure.gate, 'E6');
  assert.equal(ua.arrival.airport.iata, 'IND');
  assert.ok(ua.departure.scheduledTime.local.startsWith('2026-09-04 15:35'), ua.departure.scheduledTime.local);
  const in1434 = arr.find((x) => x.number === 'UA1434');
  assert.ok(in1434, 'UA1434 present');
  assert.equal(in1434.arrival.baggageBelt, 'F5');       // CL-F5, prefix shed
  assert.equal(in1434.status, 'arrived');
  assert.equal(in1434.callSign, 'UAL1434');
});

test('sea: dated 12-hour rows with gate and belt', () => {
  const arr = seaParsePage(fx('sea-arr-sample.html'), 'arr', NOW);
  assert.ok(arr.length >= 2, `parsed ${arr.length}`);
  const as = arr.find((x) => x.number === 'AS330');
  assert.ok(as, 'AS330 present');
  assert.ok(as.arrival.scheduledTime.local.startsWith('2026-09-04 17:35'), as.arrival.scheduledTime.local);
  assert.equal(as.status, 'arrived');                    // "Landed"
  assert.equal(as.arrival.gate, 'D3');
  assert.equal(as.arrival.baggageBelt, '14');
  assert.equal(as.departure.airport.iata, 'ABQ');
  const dep = seaParsePage(fx('sea-dep-sample.html'), 'dep', NOW);
  assert.ok(dep.length >= 1 && dep[0].departure.airport.iata === 'SEA');
});

test('yvr: offset-less timestamps pin to Pacific, 2018 archive shape parses', () => {
  const arr = yvrParseFeed(fx('yvr-sample.json'), 'arr', NOW);
  assert.ok(arr.length >= 1, `parsed ${arr.length}`);
  const ac8 = arr.find((x) => x.number === 'AC8');
  assert.ok(ac8, 'AC8 present');
  assert.ok(ac8.arrival.scheduledTime.local.startsWith('2018-07-16 16:25'), ac8.arrival.scheduledTime.local);
  assert.ok(ac8.arrival.scheduledTime.local.endsWith('-07:00'), 'PDT offset');
  assert.equal(ac8.arrival.gate, 'D50');
  assert.equal(ac8.status, 'arrived');
});

test('west: garbage in, empty out', () => {
  assert.deepEqual(yycParseFeed('x', 'dep', NOW), []);
  assert.deepEqual(sfoParseFeed('{}', 'arr', NOW), []);
  assert.deepEqual(seaParsePage('<html></html>', 'arr', NOW), []);
  assert.deepEqual(yvrParseFeed('[]', 'dep', NOW), []);
});
