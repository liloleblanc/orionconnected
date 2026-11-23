'use strict';

// ══════════════════════════════════════════════════════════════════════════
// A HUB CITY'S CARD HOTELS AGAINST THE ACCOR CATALOG (v24177,
// scripts/hotels/match-catalog.js): a helper a person runs by hand, never a
// board or the worker. It asks the catalog once a point (the airport, the
// centre), keeps the OPEN rows in each area by the catalog's distance AND the
// cards' own rule, and reports the card hotels the catalog no longer lists,
// the catalog hotels the checked file lacks, and the differences of name,
// street and telephone. It writes nothing to the data. Run here on a fixture:
// no network.
// ══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const M = require(path.join(ROOT, 'scripts/hotels/match-catalog.js'));
const H = require(path.join(ROOT, 'fids-current/js/hotel-list-card.js'));
const SRC = read('scripts/hotels/match-catalog.js');
const DOC = JSON.parse(read('scripts/hotels/data/yyz.json'));
const FIX = JSON.parse(read('tests/fixtures/hotel-catalog-yyz.json'));

test('the telephone in the form of the checked files, from the catalog\'s prefix and number, whatever their marks', () => {
  assert.equal(M.phoneOf('+1', '41/63678900'), '(416) 367-8900', 'the catalog\'s broken marks');
  assert.equal(M.phoneOf('+1', '4163682511'), '(416) 368-2511');
  assert.equal(M.phoneOf('', '416-368-2511'), '(416) 368-2511');
  assert.equal(M.phoneOf('+1', '+1 416 368 2511'), '(416) 368-2511', 'a number that carries its own prefix');
  assert.equal(M.phoneOf('1', '905.362.4337'), '(905) 362-4337');
  for (const [p, n] of [['+33', '142345678'], ['', '123'], ['+1', '116 555 0100'], [null, null], ['+44', '2071234567']]) {
    assert.equal(M.phoneOf(p, n), '', p + ' ' + n + ': not a North American number');
  }
});

test('the street only with a figure in it; the name without the booking-system prefixes', () => {
  assert.equal(M.streetOf({ localization: { address: { street: '45 The Esplanade' } } }), '45 The Esplanade');
  assert.equal(M.streetOf({ localization: { address: { line1: '1  Test   Street' } } }), '1 Test Street', 'line1 when there is no street');
  assert.equal(M.streetOf({ localization: { address: { street: 'Yonge Street' } } }), '', 'no figure, no address');
  assert.equal(M.streetOf({}), '');
  assert.equal(M.cleanName('FX - ROTW Novotel Toronto Centre'), 'Novotel Toronto Centre');
  assert.equal(M.cleanName('Novotel Toronto Cntr'), 'Novotel Toronto Centre');
  assert.equal(M.cleanName('Novo - Fairmont Royal York'), 'Fairmont Royal York');
});

test('one query a point, at the area limit of the cards\' own rule, through the board\'s proxy', () => {
  const q = M.queries(DOC);
  assert.deepEqual(q.map((x) => [x.area, x.point, x.radius]), [['airport', 'airport', 6], ['downtown', 'centre', 3]]);
  assert.ok(Math.abs(q[0].limit - H.RULE.airportKm * H.RULE.tolerance) < 1e-9 && Math.abs(q[1].limit - H.RULE.downtownKm * H.RULE.tolerance) < 1e-9);
  assert.equal(q[1].url, 'https://fids-proxy.n-leblanc1984.workers.dev/accor/catalog/v1/hotels?latLng=43.6532,-79.3832&radius=3&range=0-49&sort=distance&language=en');
  assert.equal(q[0].url, 'https://fids-proxy.n-leblanc1984.workers.dev/accor/catalog/v1/hotels?latLng=43.68,-79.63&radius=6&range=0-49&sort=distance&language=en');
});

test('the report: the card hotels found and their differences, the ones missing, the catalog hotels the file lacks', () => {
  const rep = M.match(DOC, FIX);
  // the open rows in each area: by the catalog's distance AND the cards' rule on the position
  // (closed, opening soon, too far and no position are left out)
  assert.deepEqual(rep.asked.map((a) => [a.point, a.rows, a.kept]), [['airport', 3, 1], ['centre', 6, 4]]);
  // both card hotels found open downtown; the Fairmont's street written long by the catalog, the
  // Novotel's telephone read through its broken marks and its name through its prefix
  assert.deepEqual(rep.cards.map((c) => c.id), ['fairmont-royal-york-hotel', 'novotel-toronto-centre']);
  assert.deepEqual(rep.cards[0].differences, [{ field: 'street', data: '100 Front Street W.', catalog: '100 Front Street West' }]);
  assert.deepEqual(rep.cards[1].differences, [], 'the Novotel agrees');
  assert.deepEqual(rep.missing, []);
  // the catalog hotels the file lacks as card hotels, with the entry of the file a name points to
  assert.deepEqual(rep.lacks.map((l) => [l.area, l.card_id, l.street, l.phone, l.in_data]), [
    ['airport', 'T100', '100 Test Road', '(905) 555-0100', ''],
    ['downtown', 'T200', '1 Test Street', '(416) 555-0200', ''],
    ['downtown', 'T203', '', '', 'a line, not a card, as hotel-victoria']
  ]);
  // a card hotel the catalog no longer lists, or lists closed
  const gone = JSON.parse(JSON.stringify(DOC));
  gone.hotels.find((h) => h.card_id === '0931').card_id = 'ZZZZ';
  assert.deepEqual(M.match(gone, FIX).missing.map((m) => [m.id, m.why]), [['novotel-toronto-centre', 'not in the catalog\'s answers']]);
  const closed = JSON.parse(JSON.stringify(FIX));
  closed.centre.results[1].hotel.status = 'CLOSED';
  assert.deepEqual(M.match(DOC, closed).missing.map((m) => [m.id, m.why]), [['novotel-toronto-centre', 'status CLOSED']]);
  // a different telephone and brand are reported, never written
  const moved = JSON.parse(JSON.stringify(FIX));
  moved.centre.results[0].hotel.contact.phone = '4165550199';
  moved.centre.results[0].hotel.brand = 'SOF';
  const diffs = M.match(DOC, moved).cards[0].differences.map((d) => d.field);
  assert.deepEqual(diffs, ['brand', 'street', 'phone']);
  // the text a person reads
  const t = M.text(rep);
  assert.match(t, /Card hotels the catalog no longer lists \(0\):\n  none/);
  assert.match(t, /street: data "100 Front Street W\.", catalog "100 Front Street West"/);
  assert.match(t, /Nothing was written\./);
  // no answer at all: every card hotel missing, nothing else
  const none = M.match(DOC, {});
  assert.equal(none.missing.length, 2);
  assert.deepEqual(none.lacks, []);
});

test('the helper runs by hand only: it writes nothing to the data or the site, and no board asks the catalog for a list', () => {
  // its only file is the raw answers in the git-ignored work folder, on --save
  const writes = [...SRC.matchAll(/fs\.writeFileSync\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual(writes, ['file']);
  assert.match(SRC, /const file = path\.join\(WORK_DIR, code\.toLowerCase\(\) \+ '-catalog\.json'\);/);
  assert.match(read('.gitignore'), /^scripts\/hotels\/work\/$/m);
  // a 403, a block page or anything that is not JSON stops it: no other route
  assert.match(SRC, /res\.status === 403\) return \{ ok: false, why: 'HTTP 403: blocked, needs a person\. No other route is tried\.' \}/);
  // never in the worker, the deck or the module of the lists; the gold look is the data's
  const card = read('fids-current/js/hotel-list-card.js');
  assert.doesNotMatch(card, /catalog|fids-proxy|match-catalog/i);
  assert.doesNotMatch(read('fids-current/js/fids-core.js'), /match-catalog/);
  assert.doesNotMatch(read('workers/fids-proxy.js'), /match-catalog/);
  assert.doesNotMatch(read('package.json'), /match-catalog/);
  // the data keeps the catalog id and brand of each card hotel under neutral names
  for (const h of DOC.hotels.filter((x) => x.card)) assert.ok(h.card_id && h.card_brand, h.id);
});
