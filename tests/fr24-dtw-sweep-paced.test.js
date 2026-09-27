'use strict';

// WHY THIS EXISTS
//
// 2026-09-27, 19:25 UTC: the Detroit flight-summary sweep took the shared FR24
// counter from 1614 (the pace line was 1617) to 1914 in one burst — five
// 60-credit pages checked only against the 1900 CAP — and every position
// lookup on every board was refused until the 00:00 UTC reset. No gate showed
// an aircraft all evening. Over the week before, this one refresh was 42% of
// all FR24 spend, and a sweep cut short kept only its oldest rows, so it re-ran
// and re-paid 20 hours later. v23910: the sweep fits under the same pace line
// the position lookups obey, fetches at most 5 pages per attempt, resumes from
// its cursor, and keeps a finished schedule for a week.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'workers', 'fids-proxy.js'), 'utf8');

function fnSource(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  const start = SRC.lastIndexOf('\n', i) + 1;
  let depth = 0, j = SRC.indexOf('{', i);
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) break;
  }
  return SRC.slice(start, j + 1);
}
const constLine = (name) => {
  const m = SRC.match(new RegExp('const ' + name + ' = [^;]+;'));
  assert.ok(m, name + ' must exist');
  return m[0];
};

function build({ kv, fetchImpl, now }) {
  const body = [
    constLine('DTW_FR24_CACHE_KEY'), constLine('DTW_FR24_MAX_CALLS'), constLine('DTW_FR24_REFRESH_MS'),
    constLine('DTW_FR24_PAGE_CREDITS'), 'const FR24_ROW_PRICE = ' + SRC.match(/const FR24_ROW_PRICE = (\{[\s\S]*?\});/)[1] + ';',
    constLine('FR24_PROMO_ENDS'), constLine('FR24_PERMANENT_DAILY_CAP'),
    fnSource('fr24EffectiveCap'), fnSource('fr24PacedAllowance'), fnSource('fr24Charge'), fnSource('dtwLocalMinutes'),
    fnSource('dtwFr24Schedule').replace(/^async function/, 'return async function'),
  ].join('\n');
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now()])); }
    static now() { return now(); }
  }
  return new Function('fetch', 'Date', body)(fetchImpl, FakeDate).bind(null);
}

function makeKv(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    m,
    get: async (k, o) => { const v = m.has(k) ? m.get(k) : null; return v != null && o && o.type === 'json' ? JSON.parse(v) : v; },
    put: async (k, v) => { m.set(k, String(v)); },
    delete: async (k) => { m.delete(k); },
  };
}

// FR24 pages: 20 departures an hour apart, then a short last page.
function fr24Pages(total) {
  let served = 0, calls = 0;
  const impl = async (url) => {
    calls++;
    const from = Date.parse(decodeURIComponent(url.match(/flight_datetime_from=([^&]+)/)[1]));
    const rows = [];
    for (let i = 0; i < 20 && served < total; i++, served++) {
      rows.push({ datetime_takeoff: new Date(from + (i + 1) * 60000).toISOString(), dest_iata: 'YYZ', flight: 'DL' + (100 + served), type: 'A321', operating_as: 'DAL' });
    }
    return { ok: true, status: 200, json: async () => ({ data: rows }) };
  };
  return { impl, calls: () => calls };
}

const DAY = '2026-09-28';
const at = (h, m) => Date.UTC(2026, 8, 28, h, m || 0);

test('no page is fetched when it would cross the pace line', async () => {
  const t = at(19, 25);                       // pace line = ceil(1900 * 1225 / 1440) = 1617
  const kv = makeKv({ ['fr24:used:' + DAY]: '1614' });
  const f = fr24Pages(500);
  const sweep = build({ kv, fetchImpl: f.impl, now: () => t });
  await sweep({ FR24_KEY: 'k', FIDS_LIVE_FLIGHTS: kv, FR24_DAILY_BUDGET: '1900' });
  assert.equal(f.calls(), 0, 'the 19:25 burst that darkened every gate cannot happen');
  assert.equal(kv.m.get('fr24:used:' + DAY), '1614');
});

test('with headroom it fetches at most five pages, keeps its place, and resumes', async () => {
  let t = at(22, 0);                           // pace line 1847
  const kv = makeKv({ ['fr24:used:' + DAY]: '500' });
  const f = fr24Pages(500);                     // 25 pages' worth
  const env = { FR24_KEY: 'k', FIDS_LIVE_FLIGHTS: kv, FR24_DAILY_BUDGET: '1900' };
  const sweep = build({ kv, fetchImpl: f.impl, now: () => t });
  const first = await sweep(env);
  assert.equal(f.calls(), 5, 'five pages per attempt');
  assert.equal(Number(kv.m.get('fr24:used:' + DAY)), 500 + 5 * 60, 'charged per row');
  const st = JSON.parse(kv.m.get('dtw:fr24:sched:v2'));
  assert.equal(st.at, 0, 'unfinished');
  assert.ok(st.sweep && st.sweep.cursor > st.sweep.endTs - 27 * 3600 * 1000, 'the cursor is kept');
  assert.equal(first.YYZ.length, 100, 'what it has is served meanwhile');
  assert.equal(kv.m.has('dtw:fr24:lock'), false, 'the lock is released');
  t += 60000;
  await sweep(env);
  assert.equal(f.calls(), 10, 'the next attempt continues');
  const st2 = JSON.parse(kv.m.get('dtw:fr24:sched:v2'));
  assert.ok(st2.sweep.cursor > st.sweep.cursor, 'from where it stopped, not from the start');
  assert.equal(st2.sweep.map.YYZ.length, 200, 'rows accumulate without repeats');
});

test('a finished schedule is kept for a week and costs nothing meanwhile', async () => {
  let t = at(22, 0);
  const kv = makeKv({ ['fr24:used:' + DAY]: '0' });
  const f = fr24Pages(30);                      // one full page, one short page
  const env = { FR24_KEY: 'k', FIDS_LIVE_FLIGHTS: kv, FR24_DAILY_BUDGET: '1900' };
  const sweep = build({ kv, fetchImpl: f.impl, now: () => t });
  await sweep(env);
  const st = JSON.parse(kv.m.get('dtw:fr24:sched:v2'));
  assert.ok(st.at > 0 && !st.sweep, 'finished');
  assert.equal(st.map.YYZ.length, 30);
  const calls = f.calls();
  t += 6 * 24 * 3600 * 1000;
  const again = await sweep(env);
  assert.equal(f.calls(), calls, 'six days later: served from the cache');
  assert.equal(again.YYZ.length, 30);
});

test('a sweep already running elsewhere is not duplicated', async () => {
  const t = at(22, 0);
  const kv = makeKv({ ['fr24:used:' + DAY]: '0', 'dtw:fr24:lock': '1' });
  const f = fr24Pages(100);
  const sweep = build({ kv, fetchImpl: f.impl, now: () => t });
  await sweep({ FR24_KEY: 'k', FIDS_LIVE_FLIGHTS: kv, FR24_DAILY_BUDGET: '1900' });
  assert.equal(f.calls(), 0);
});
