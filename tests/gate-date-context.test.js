'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const gateDate = require('../fids-current/js/gate-date-context.js');

test('marks the first YQM departure after midnight as tomorrow', () => {
  const context = gateDate.getFlightDateContext({
    nowTimestamp: Date.parse('2026-08-12T23:48:00Z'),
    flightTimestamp: Date.parse('2026-08-13T10:10:00Z'),
    timeZone: 'America/Moncton',
    languages: ['en', 'fr']
  });
  assert.equal(context.dayOffset, 1);
  assert.match(context.labels[0], /^Tomorrow\b/);
  assert.match(context.labels[1], /^Demain\b/);
  assert.match(context.text, /Aug 13/);
  assert.match(context.text, /13 août/);
});

test('does not add a label to a same-day flight', () => {
  const context = gateDate.getFlightDateContext({
    nowTimestamp: Date.parse('2026-08-12T14:00:00Z'),
    flightTimestamp: Date.parse('2026-08-12T18:00:00Z'),
    timeZone: 'America/Moncton',
    languages: ['en', 'fr']
  });
  assert.equal(context.dayOffset, 0);
  assert.deepEqual(context.labels, []);
});

test('uses the airport timezone rather than the computer timezone', () => {
  const now = Date.parse('2026-08-13T02:30:00Z');
  const flight = Date.parse('2026-08-13T04:30:00Z');
  assert.equal(gateDate.dayOffset(flight, now, 'America/Moncton'), 1);
  assert.equal(gateDate.dayOffset(flight, now, 'UTC'), 0);
});

test('honours French-first display order', () => {
  const context = gateDate.getFlightDateContext({
    nowTimestamp: Date.parse('2026-08-12T23:48:00Z'),
    flightTimestamp: Date.parse('2026-08-13T10:10:00Z'),
    timeZone: 'America/Moncton',
    languages: ['en', 'fr'],
    frenchFirst: true
  });
  assert.match(context.labels[0], /^Demain\b/);
  assert.match(context.labels[1], /^Tomorrow\b/);
});
