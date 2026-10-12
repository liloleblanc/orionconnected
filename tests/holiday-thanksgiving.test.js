'use strict';

// vNEXT — Canadian Thanksgiving puts body[data-fids-holiday="thanksgiving-ca"]
// on Canadian airports' boards, on the airport's own date, and nowhere else.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current/js/fids-core.js'), 'utf8');
function fn(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name);
  return CORE.slice(at, CORE.indexOf('\n}\n', at) + 2);
}
const AP = { YQM: { tz: 'America/Moncton' }, YVR: { tz: 'America/Vancouver' }, YYZ: { tz: 'America/Toronto' }, ORD: { tz: 'America/Chicago' }, DUB: { tz: 'Europe/Dublin' } };
const holidayFor = new Function('AP', 'location', fn('_fidsAirportYmd') + fn('_fidsHolidayFor') + 'return _fidsHolidayFor;')(AP, { search: '' });

test('Thanksgiving 2026 (Monday Oct 12) at Canadian airports, in their own time zone', () => {
  assert.equal(holidayFor('YQM', new Date('2026-10-12T15:00:00Z')), 'thanksgiving-ca');
  assert.equal(holidayFor('YVR', new Date('2026-10-12T20:00:00Z')), 'thanksgiving-ca');
  assert.equal(holidayFor('YYZ', new Date('2026-10-13T03:30:00Z')), 'thanksgiving-ca', '11:30 pm in Toronto is still the 12th');
  assert.equal(holidayFor('YQM', new Date('2026-10-13T03:30:00Z')), '', '00:30 in Moncton is the 13th');
});

test('not the day before or after, not other years\' wrong Mondays, not outside Canada', () => {
  assert.equal(holidayFor('YQM', new Date('2026-10-11T15:00:00Z')), '');
  assert.equal(holidayFor('YQM', new Date('2026-10-05T15:00:00Z')), '', 'first Monday');
  assert.equal(holidayFor('YQM', new Date('2026-10-19T15:00:00Z')), '', 'third Monday');
  assert.equal(holidayFor('YQM', new Date('2027-10-11T15:00:00Z')), 'thanksgiving-ca', '2027: Oct 11');
  assert.equal(holidayFor('YQM', new Date('2025-10-13T15:00:00Z')), 'thanksgiving-ca', '2025: Oct 13');
  assert.equal(holidayFor('ORD', new Date('2026-10-12T15:00:00Z')), '');
  assert.equal(holidayFor('DUB', new Date('2026-10-12T15:00:00Z')), '');
});

test('?holiday= previews a look and ?holiday=none turns it off', () => {
  const withQ = (q) => new Function('AP', 'location', fn('_fidsAirportYmd') + fn('_fidsHolidayFor') + 'return _fidsHolidayFor;')(AP, { search: q });
  assert.equal(withQ('?holiday=thanksgiving-ca')('ORD', new Date('2026-03-01T12:00:00Z')), 'thanksgiving-ca');
  assert.equal(withQ('?holiday=none')('YQM', new Date('2026-10-12T15:00:00Z')), '');
  assert.equal(withQ('?holiday=<script>')('ORD', new Date('2026-03-01T12:00:00Z')), '');
});

test('the banner pass stamps the attribute on every board render', () => {
  assert.match(fn('_applyBannerStyle'), /var _hol = _fidsHolidayFor\(ap, new Date\(\)\);\s*if \(_hol\) document\.body\.dataset\.fidsHoliday = _hol;\s*else delete document\.body\.dataset\.fidsHoliday;/);
});
