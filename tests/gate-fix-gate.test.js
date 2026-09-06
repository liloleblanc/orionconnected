// v23331 — the gate map's reachability gate. Nick's WS790 gate (Edmonton →
// Moncton, about to land) drew the aircraft over Saskatchewan: a position for
// the AIRFRAME (registration lookup, another leg) was accepted with no check
// that the aircraft could reach the field by its ETA. _fixCanReachByEta is the
// pure half of that check (600 kt ceiling + 60 nm slack). Extracted from the
// browser bundle together with the great-circle helper it uses.
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
const gcSrc = extract('function _gcNm(a, b) {', '\n}\n');
const reachSrc = extract('function _fixCanReachByEta(', '\n}\n');
const { _gcNm, _fixCanReachByEta } = new Function(`${gcSrc}\n${reachSrc}\nreturn { _gcNm, _fixCanReachByEta };`)();

const YQM = [46.11, -64.68];
const REGINA = [50.43, -104.67];
const FINAL_20NM = [46.35, -64.35];     // ~20 nm north-east of the field
const OUT_100NM = [47.4, -63.2];        // ~100 nm out
const MIN = 60000;
const now = 1_757_100_000_000;          // fixed clock; the check is relative

test('the great-circle helper is sane (Regina to Moncton is ~1,600 nm)', () => {
  const nm = _gcNm(REGINA, YQM);
  assert.ok(nm > 1550 && nm < 1650, `got ${nm}`);
});

test('a fix over Saskatchewan 15 minutes before landing at Moncton is rejected', () => {
  assert.equal(_fixCanReachByEta(REGINA[0], REGINA[1], YQM, now + 15 * MIN, now), false);
});

test('the same fix three hours out is accepted (it can still get there)', () => {
  assert.equal(_fixCanReachByEta(REGINA[0], REGINA[1], YQM, now + 180 * MIN, now), true);
});

test('a fix on final is accepted before and just after the ETA', () => {
  assert.equal(_fixCanReachByEta(FINAL_20NM[0], FINAL_20NM[1], YQM, now + 15 * MIN, now), true);
  assert.equal(_fixCanReachByEta(FINAL_20NM[0], FINAL_20NM[1], YQM, now - 8 * MIN, now), true);
});

test('a fix 100 nm out after the ETA has passed is rejected (late and unrevised: no plane, not a wrong plane)', () => {
  assert.equal(_fixCanReachByEta(OUT_100NM[0], OUT_100NM[1], YQM, now - 8 * MIN, now), false);
});
