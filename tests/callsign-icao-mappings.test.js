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
// checked against ICAO/IATA records, and each suspected error was then put to
// two independent checks. What survived, and what was done about it:
//
//   CORRECTED
//   AWI  Air Wisconsin is ZW. It was AW — Africa World Airlines, Accra.
//   RPA  Republic Airways is YX. It was YV — Mesa, a different carrier.
//   TIF  is not an airline designator at all. It is the IATA code for Taif
//        airport, Saudi Arabia. Air North's ICAO is ANT.
//
//   REKEYED — right target, wrong three letters in front of it
//   PAK -> PIA   Pakistan International flies as PIA; PAK is Pacific Alaska.
//   SUN -> SCX   Sun Country flies as SCX; SUN was a defunct Dominican carrier.
//   SOU -> FDY   Southern Airways Express flies as FDY; SOU died in 1979.
//   PSA -> JIA   PSA Airlines flies as JIA (BLUE STREAK); PSA was Pacific
//                Island Aviation, gone 2005. The first draft of this fix
//                REMOVED the row on the belief JIA was "already mapped" — it
//                was, but only in CALLSIGN_TO_IATA, not in the table the
//                operator line reads. This test's own assertion caught it.
//
//   REMOVED — the row could only ever name the wrong airline, or nothing
//   CHQ  Chautauqua, defunct 2014, and its IATA was RP not MQ.
//   EJA  NetJets. Business aviation, no IATA code. EV was ExpressJet, gone 2022.
//   SVR  Ural Airlines, no branding here, serves none of these airports.
//   GGN  Air Georgian, ceased 2020; now Great North, unrelated to Air Canada.
//   TCF, VRD, KRS  each resolved a code nothing in the repo can name.
//
//   LEFT ALONE ON PURPOSE
//   PAG -> YP    Perimeter's IATA is JV, not YP. But YP prints PERIMETER and
//                JV prints BEARSKIN, so the "correct" code would put the wrong
//                name on a Perimeter flight. Fixing it means giving Perimeter
//                its own name under JV first — a branding decision, not a
//                table edit.
//
// AWI and RPA were already provable from inside the repo: CALLSIGN_TO_IATA
// carried the right value while CALLSIGN_ICAO carried the wrong one, and the
// operator line reads CALLSIGN_ICAO. That disagreement is the cheapest signal
// available here, so one test below keeps the two tables honest with each
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

test('the rekeyed rows sit under the designator the airline actually flies', () => {
  assert.equal(CS_ICAO['PIA'], 'PK', 'Pakistan International flies as PIA');
  assert.ok(!('PAK' in CS_ICAO), 'PAK is Pacific Alaska Airlines, not PIA');
  assert.equal(CS_ICAO['SCX'], 'SY', 'Sun Country flies as SCX');
  assert.ok(!('SUN' in CS_ICAO), 'SUN was never Sun Country');
  assert.equal(CS_IATA['FDY'], '9X', 'Southern Airways Express flies as FDY');
  assert.ok(!('SOU' in CS_IATA), 'SOU has not flown since 1979');
  // and the operator-name lookup that was keyed by the old prefix moved with it
  const opAt = SRC.indexOf('var _OPNAMES = {');
  const OPNAMES = new Function(
    'return ' + SRC.slice(SRC.indexOf('{', opAt), SRC.indexOf('}', opAt) + 1) + ';')();
  assert.ok(OPNAMES['FDY'], '_OPNAMES must follow the rekey, or the name is lost');
  assert.ok(!OPNAMES['SOU'], 'and not keep a copy under the dead prefix');
});

test('rows that could only name the wrong airline are gone', () => {
  for (const dead of ['CHQ', 'PSA', 'SVR']) {
    assert.ok(!(dead in CS_ICAO), `${dead} must not be in CALLSIGN_ICAO`);
  }
  for (const dead of ['EJA', 'GGN']) {
    assert.ok(!(dead in CS_IATA), `${dead} must not be in CALLSIGN_TO_IATA`);
  }
  // The carriers they were confused with keep their own, correct rows.
  assert.equal(CS_ICAO['ENY'], 'MQ', 'Envoy is the real MQ row');
  assert.equal(CS_ICAO['JIA'], 'OH', 'PSA Airlines is reachable as JIA');
  assert.equal(CS_IATA['ROU'], 'RV', 'Rouge keeps its own row');
});

test('Perimeter is deliberately still YP', () => {
  // Wrong code, right name. JV is Perimeter's real IATA, but the repo names
  // JV as Bearskin, so switching would put BEARSKIN on a Perimeter flight.
  // Locked here so the audit finding is not "fixed" without first giving
  // Perimeter its own name under JV.
  assert.equal(CS_IATA['PAG'], 'YP');
  assert.equal(NAME['YP'], 'PERIMETER', 'the reason YP is kept: it prints the right name');
  assert.notEqual(NAME['JV'], 'PERIMETER', 'when JV names Perimeter, this test can retire');
});
