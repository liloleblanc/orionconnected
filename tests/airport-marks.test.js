'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23806 — AIRPORT MARKS, AND THE ICAO THEY ARE FILED UNDER.
//
// The board asks for /logos/airports/mark-<ICAO>-white.svg, and it DERIVES the
// ICAO from the IATA code: a Y prefix means Canada, anything else three letters
// gets a K. That is right for YQM and DCA and wrong for every airport served
// outside North America — ZRH would look for KZRH, LHR for KLHR, SYD for KSYD.
//
// It never showed because none of them had a mark. Sydney is the first, and its
// file would simply never have been requested.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const MARKS = path.join(ROOT, 'fids-current', 'logos', 'airports');

/** The board's own derivation, read out of the source. */
function icaoFor(iata) {
  const tbl = {};
  const m = CORE.match(/const FIDS_ICAO_EXCEPTIONS = \{([\s\S]*?)\};/);
  assert.ok(m, 'the exceptions table must exist');
  for (const e of m[1].matchAll(/([A-Z]{3}):\s*'([A-Z]{4})'/g)) tbl[e[1]] = e[2];
  return tbl[iata] || (/^Y/.test(iata) ? 'C' + iata : (iata.length === 3 ? 'K' + iata : iata));
}

test('the derivation still handles the cases it was written for', () => {
  assert.equal(icaoFor('YQM'), 'CYQM', 'Canada keeps the Y rule');
  assert.equal(icaoFor('YYZ'), 'CYYZ');
  assert.equal(icaoFor('DCA'), 'KDCA', 'the US keeps the K rule');
  assert.equal(icaoFor('IAD'), 'KIAD');
});

test('airports outside North America are named, not guessed', () => {
  for (const [iata, icao] of [
    ['SYD', 'YSSY'], ['LHR', 'EGLL'], ['DUB', 'EIDW'],
    ['EDI', 'EGPH'], ['KEF', 'BIKF'], ['ZRH', 'LSZH']
  ]) {
    assert.equal(icaoFor(iata), icao,
      `${iata} must resolve to ${icao} — the K rule would have claimed it`);
  }
});

test('every mark on disk is filed where the board will look for it', () => {
  // The failure this catches is silent: a mark sitting in the right folder
  // under the wrong ICAO is simply never requested, and the board shows
  // nothing with no error anywhere.
  const files = fs.readdirSync(MARKS).filter((f) => /^mark-[A-Z]{4}-/.test(f));
  assert.ok(files.length > 0, 'there must be marks to check');
  const byIcao = new Set(files.map((f) => f.slice(5, 9)));
  // Anything we have a mark for must be reachable from some IATA we serve.
  const live = new Set(
    [...CORE.slice(CORE.indexOf('const FIDS_LIVE_AIRPORTS = new Set(['))
      .slice(0, CORE.slice(CORE.indexOf('const FIDS_LIVE_AIRPORTS = new Set([')).indexOf(']);'))
      .matchAll(/'([A-Z]{3,4})'/g)].map((m) => m[1])
  );
  const reachable = new Set([...live].map(icaoFor));
  for (const icao of byIcao) {
    assert.ok(reachable.has(icao),
      `mark-${icao}-* exists but no airport in the roster resolves to ${icao} — ` +
      'the board would never ask for it');
  }
});

test('Sydney has a white mark, and it is white', () => {
  // white is the variant the board actually requests; colour is for light
  // grounds and its wordmark is black, which disappears on a board.
  const p = path.join(MARKS, 'mark-YSSY-white.svg');
  assert.ok(fs.existsSync(p), 'the white mark must exist');
  const svg = fs.readFileSync(p, 'utf8');
  const fills = [...new Set([...svg.matchAll(/fill="([^"]*)"/g)].map((m) => m[1]))];
  assert.deepEqual(fills, ['#fff'], `the white mark must be white, found: ${fills.join(', ')}`);
});

test('no supplied mark carries its background plate', () => {
  // All three files Sydney supplied are artwork on a full-canvas rectangle.
  // Left in, that puts a solid square on the banner.
  for (const f of fs.readdirSync(MARKS).filter((x) => x.startsWith('mark-YSSY-'))) {
    const svg = fs.readFileSync(path.join(MARKS, f), 'utf8');
    assert.ok(!svg.includes('M0 0h192.756v192.756H0V0z'),
      `${f} still has the full-canvas background rectangle — it would render as ` +
      'a solid square behind the mark');
    assert.match(svg, /viewBox="0 0 192\.756 192\.756"/,
      `${f} must keep the original viewBox — removing the plate must not reframe ` +
      "the artwork");
  }
});
