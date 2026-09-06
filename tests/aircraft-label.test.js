// v23330 — aircraft label precedence. A feed's specific model string wins
// over the bare-family code, while a bare '737' STILL means MAX 8: Air
// Canada's whole 737 fleet is MAX 8 and reports a bare '737' (Nick: do not
// flatten that entry). The bug: WS790 at YQM, feed said "Boeing 737-700",
// the gate printed "Boeing 737 MAX 8" — formatAircraft() built the composite
// code '73'+'7' = '737' from the dash variant and landed on the family key.
// formatAircraft() lives in the browser bundle; extract it with its map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

function extract(startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  assert.ok(s >= 0, `marker not found: ${startMarker}`);
  const e = src.indexOf(endMarker, s);
  assert.ok(e > s, `end marker not found after: ${startMarker}`);
  return src.slice(s, e + endMarker.length);
}
const mapSrc = extract('const IATA_AIRCRAFT = {', '\n};');
const fnSrc = extract('function formatAircraft(raw) {', '\n}\n');
const formatAircraft = new Function(`${mapSrc}\n${fnSrc}\nreturn formatAircraft;`)();

test("a feed's specific 737-700 is never relabelled a MAX 8", () => {
  for (const s of ['Boeing 737-700', '737-700', 'Boeing 737-7CT', 'Boeing 737-700 (BBJ)']) {
    assert.equal(formatAircraft(s), 'Boeing 737-700', s);
  }
});

test('a bare 737 still means MAX 8 (Air Canada); the other codes are untouched', () => {
  assert.equal(formatAircraft('737'), 'Boeing 737 MAX 8');
  assert.equal(formatAircraft('Boeing 737'), 'Boeing 737 MAX 8');
  assert.equal(formatAircraft('7M8'), 'Boeing 737 MAX 8');
  assert.equal(formatAircraft('738'), 'Boeing 737-800');
  assert.equal(formatAircraft('73G'), 'Boeing 737-700');
  assert.equal(formatAircraft('Boeing 737-800'), 'Boeing 737-800');
  assert.equal(formatAircraft('Boeing 787-9'), 'Boeing 787-9');
  assert.equal(formatAircraft('A321'), 'Airbus A321');
  assert.equal(formatAircraft('De Havilland Dash 8-400'), 'De Havilland Dash 8-400');
  assert.equal(formatAircraft(''), '');
});

test('a named MAX variant keeps its own name', () => {
  assert.equal(formatAircraft('Boeing 737 MAX 8'), 'Boeing 737 MAX 8');
  assert.equal(formatAircraft('Boeing 737 MAX 9'), 'Boeing 737 MAX 9');
  assert.equal(formatAircraft('Boeing 737 MAX 7'), 'Boeing 737 MAX 7');
});

test('a maker-less 7x7 dash variant from an authority feed keeps its maker', () => {
  assert.equal(formatAircraft('747-100'), 'Boeing 747-100');
});
