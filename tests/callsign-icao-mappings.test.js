'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23769 — THE CALLSIGN TABLES NAME THE OPERATOR OUT LOUD.
//
// Both consumers of CALLSIGN_ICAO take the letters off the front of a flight's
// callsign and use the result to print "Operated by <name>" and to pick the
// operator's branding. A wrong row does not fail; it confidently prints
// ANOTHER AIRLINE'S NAME on somebody's flight.
//
// All 101 rows across CALLSIGN_ICAO, CALLSIGN_TO_IATA and _FB_WM_ICAO were
// checked against ICAO/IATA records. Three are corrected here:
//
//   AWI  Air Wisconsin is ZW. It was AW — Africa World Airlines, Accra.
//   RPA  Republic Airways is YX. It was YV — Mesa, a different carrier.
//   TIF  is not an airline designator at all. It is the IATA code for Taif
//        airport, Saudi Arabia. Air North's ICAO is ANT.
//
// The first two were already provable from inside the repo: CALLSIGN_TO_IATA
// carried the right value while CALLSIGN_ICAO carried the wrong one, and the
// operator line reads CALLSIGN_ICAO. That disagreement is the cheapest signal
// available here, so the last test below keeps the two tables honest with each
// other rather than only pinning the rows known about today.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

/** Evaluate a brace-matched object literal out of the source. */
function table(decl) {
  const at = SRC.indexOf(decl);
  assert.ok(at >= 0, decl + ' must exist');
  const from = SRC.indexOf('{', at);
  let depth = 0, line = false, block = false, quote = '';
  for (let i = from; i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return new Function('return ' + SRC.slice(from, i + 1) + ';')();
  }
  throw new Error('could not close ' + decl);
}

const CS_ICAO = table('const CALLSIGN_ICAO = {');
const CS_IATA = table('const CALLSIGN_TO_IATA = {');
const NAME = table('const AIRLINE_NAME = {');

test('Air North is reachable under its real ICAO designator', () => {
  assert.equal(CS_ICAO['ANT'], '4N', "Air North's ICAO is ANT");
  assert.ok(!('TIF' in CS_ICAO),
    'TIF is the IATA code for Taif airport, not an airline designator');
});

test('Air Wisconsin and Republic take their own IATA codes', () => {
  assert.equal(CS_ICAO['AWI'], 'ZW', 'AWI is Air Wisconsin — ZW, not Africa World Airlines');
  assert.equal(CS_ICAO['RPA'], 'YX', 'RPA is Republic Airways — YX, not Mesa');
  // and the carriers they were confused WITH keep their own correct rows
  assert.equal(CS_IATA['ASH'], 'YV', 'Mesa keeps ASH → YV');
});

test('every row resolves an operator the board can actually name', () => {
  // The operator line reads _OPNAMES first and only then AIRLINE_NAME, falling
  // back to the raw code when neither has an entry — which is what AWI → AW
  // produced: two bare letters where a carrier's name belongs.
  //
  // _OPNAMES has to be part of the check, not just AIRLINE_NAME. Leaving it
  // out reported WEN → WR, which is fine: WR is absent from AIRLINE_NAME but
  // _OPNAMES calls it WestJet Encore, so the band prints correctly.
  const opAt = SRC.indexOf('var _OPNAMES = {');
  assert.ok(opAt >= 0, '_OPNAMES must exist');
  const OPNAMES = new Function(
    'return ' + SRC.slice(SRC.indexOf('{', opAt), SRC.indexOf('}', opAt) + 1) + ';')();

  const nameless = [];
  for (const [icao, iata] of Object.entries(CS_ICAO)) {
    if (!OPNAMES[icao] && !OPNAMES[iata] && !NAME[iata]) nameless.push(`${icao} → ${iata}`);
  }
  assert.deepEqual(nameless, [],
    'these rows resolve an operator with no name, so the band prints the raw ' +
    'code:\n  ' + nameless.join('\n  '));
});

test('the two callsign tables do not contradict each other', () => {
  // They are independent maps of the same fact, read by different surfaces:
  // CALLSIGN_ICAO by the operator line, CALLSIGN_TO_IATA by the row and orb
  // code. Where both hold a key they must agree — a disagreement means one
  // surface is naming a different airline than the other, and it is how both
  // AWI and RPA were caught.
  const clashes = [];
  for (const k of Object.keys(CS_ICAO)) {
    if (CS_IATA[k] && CS_IATA[k] !== CS_ICAO[k]) {
      clashes.push(`${k}: CALLSIGN_ICAO says ${CS_ICAO[k]} (${NAME[CS_ICAO[k]] || '?'}), ` +
                   `CALLSIGN_TO_IATA says ${CS_IATA[k]} (${NAME[CS_IATA[k]] || '?'})`);
    }
  }
  assert.deepEqual(clashes, [],
    'the two callsign tables disagree:\n  ' + clashes.join('\n  '));
});

test('no callsign row points at an airport code', () => {
  // TIF was the IATA code for Taif. That is the specific way this table rots:
  // a three-letter code that looks like a designator but names a PLACE. These
  // are the ones already known to sit in the repo's own airport tables.
  const AIRPORTISH = ['TIF', 'YYZ', 'YUL', 'YOW', 'YVR', 'LHR', 'SFO', 'EDI', 'MAN', 'YYT', 'YZF'];
  const bad = AIRPORTISH.filter((c) => c in CS_ICAO || c in CS_IATA);
  assert.deepEqual(bad, [],
    'these keys are airport codes, not airline designators: ' + bad.join(', '));
});
