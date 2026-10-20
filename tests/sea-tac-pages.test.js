// v24071 — SEA-TAC, THE BOARD'S HOURS, READ WHOLE AND NOTHING MORE.
//
// The worker read the first page of Sea-Tac's listing in its default order,
// by city: Albuquerque, Amsterdam and part of Anchorage, about fifty of some
// eight hundred departures a day. Delta's own row of the 9:43 PM to Anchorage
// was on the next page, so the board only ever saw Air France's and
// Aeroméxico's. It now asks for the boards' hours by date and hour, in
// flight-number order, page by page (seaWindowParts, seaWalkPart): two hours
// back to twelve ahead, the next three hours with every renewal and the rest
// once a quarter hour, each page once, and far-end lookups from the boards'
// shared copy (authorityFarList). A renewal is counted here against the whole
// listing Sea-Tac gave on 2026-10-12 (sea-pages-2026-10-12.json).
//
// Each row also says two things that were thrown away: a new time in its
// status column ("Now 6:25 PM", which left the 1:45 PM to Amsterdam reading
// Scheduled four hours late), and the record its Details link opens, which is
// the same for every carrier selling one flight (_csKey, read by the boards'
// codeshare pass).
//
// sea-rows-*-2026-10-12.html hold real rows of the page, verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  seaParsePage, seaRevisedTime, seaPageRowCount, seaWindowParts, seaPageUrl, seaPageLast, seaWalkPart, seaMergeRows, seaLimiter,
  _authorityHandlers, feedGuard, farArrList, _feedResetMemory
} from '../workers/fids-proxy.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-12T14:45:00-07:00');
const DEP = seaParsePage(fx('sea-rows-dep-2026-10-12.html'), 'dep', NOW);
const ARR = seaParsePage(fx('sea-rows-arr-2026-10-12.html'), 'arr', NOW);
// one verbatim row of the page fixture
const realRow = (num, mdy) => fx('sea-rows-dep-2026-10-12.html').match(/<tr class="(?:ItemStyleClass|AltItemStyleClass)">[\s\S]*?<\/tr>/g)
  .find((r) => r.includes('>' + num + '<') && r.includes(mdy));
const on = (rows, n, day) => rows.filter((f) => f.number === n && (f.departure.airport.iata === 'SEA' ? f.departure : f.arrival).scheduledTime.local.startsWith(day));

test('every seller of one flight opens one record: the row\'s _csKey', () => {
  const ams = ['AF5597', 'DL142', 'KL6032', 'SV4469', 'VS3936'];
  // today at A8 and tomorrow before its gate is given: one record each day
  const today = ams.map((n) => on(DEP, n, '2026-10-12')[0]);
  const tomorrow = ams.map((n) => on(DEP, n, '2026-10-13')[0]);
  assert.deepEqual([...new Set(today.map((f) => f._csKey))], ['SEA:1898653462']);
  assert.deepEqual([...new Set(tomorrow.map((f) => f._csKey))], ['SEA:1900077479']);
  assert.ok(tomorrow.every((f) => !f.departure.gate), 'no gate yet');
  // the 9:43 PM to Anchorage: WestJet, Air France and Aeroméxico in Delta's record
  assert.deepEqual([...new Set(['WS8069', 'AF6814', 'AM4248'].map((n) => on(DEP, n, '2026-10-12')[0]._csKey))], ['SEA:1900086050']);
  // a multi-stop flight: one record, one carrier, a row per stop
  const as61 = DEP.filter((f) => f.number === 'AS61');
  assert.deepEqual(as61.map((f) => f.arrival.airport.iata), ['ANC', 'JNU', 'YAK', 'CDV']);
  assert.equal(new Set(as61.map((f) => f._csKey)).size, 1);
  // arrivals too
  assert.deepEqual([...new Set(['AF8992', 'DL143', 'KL6033'].map((n) => on(ARR, n, '2026-10-12')[0]._csKey))], ['SEA:1900078013']);
});

test('a Details link that does not end in the row\'s own number, carrier and city names no record', () => {
  const row = realRow('KL6032', '10-12-2026');
  const page = (r) => '<table>' + r + '</table>';
  assert.equal(seaParsePage(page(row), 'dep', NOW)[0]._csKey, 'SEA:1898653462');
  assert.equal(seaParsePage(page(row.replace('6032KLAMS"', '6033KLAMS"')), 'dep', NOW)[0]._csKey, undefined, 'other digits');
  assert.equal(seaParsePage(page(row.replace('6032KLAMS"', '6032AFAMS"')), 'dep', NOW)[0]._csKey, undefined, 'another carrier');
  assert.equal(seaParsePage(page(row.replace(/data-target="[^"]*"/, '')), 'dep', NOW)[0]._csKey, undefined, 'no link');
  assert.equal(seaParsePage(page(row.replace('modalAirline18986534626032KLAMS', 'modalAirline6032KLAMS')), 'dep', NOW)[0]._csKey, undefined, 'nothing left of the record');
});

test('Frontier\'s numbers are written with a dot ("F9.3406"): the same flight, served with its record', () => {
  // 2026-10-20, to and from Denver: both rows were dropped (the number did not parse)
  const rows = fx('sea-rows-frontier-2026-10-20.html').match(/<tr class="(?:ItemStyleClass|AltItemStyleClass)">[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, 2);
  const at = Date.parse('2026-10-20T06:00:00-07:00');
  const [dep] = seaParsePage('<table>' + rows[0] + '</table>', 'dep', at);
  const [arr] = seaParsePage('<table>' + rows[1] + '</table>', 'arr', at);
  assert.deepEqual([dep.number, dep.departure.scheduledTime.local, dep.arrival.airport.iata, dep.departure.gate, dep._csKey],
    ['F93406', '2026-10-20 08:45:00-07:00', 'DEN', 'S1', 'SEA:1920526536']);
  assert.deepEqual([arr.number, arr.arrival.scheduledTime.local, arr.departure.airport.iata, arr.arrival.baggageBelt, arr._csKey],
    ['F91175', '2026-10-20 07:40:00-07:00', 'DEN', '7', 'SEA:1920515735']);
  assert.equal(dep.departure.airline.iata, 'F9');
});

test('"Now 6:25 PM" is the new time: the 1:45 PM to Amsterdam is four hours forty late, not Scheduled', () => {
  const dl142 = on(DEP, 'DL142', '2026-10-12')[0];
  assert.equal(dl142.status, 'scheduled', 'the word stays neutral; the board reads Delayed from the time');
  assert.equal(dl142.departure.revisedTime.local, '2026-10-12 18:25:00-07:00');
  assert.equal(on(DEP, 'DL142', '2026-10-13')[0].departure.revisedTime, undefined, 'On-Time: no new time');
  const as330 = ARR.find((f) => f.number === 'AS330');
  assert.equal(as330.arrival.revisedTime.local, '2026-10-12 17:49:00-07:00');
  assert.equal(as330.arrival.baggageBelt, '15');
  // the nearest day: late at night and just after midnight
  const ts = (d, hh, mm) => Date.parse(`${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-07:00`);
  assert.equal(seaRevisedTime('Now 12:30 AM', 2026, 10, 12, ts('2026-10-12', 23, 50)).local, '2026-10-13 00:30:00-07:00');
  assert.equal(seaRevisedTime('Now 11:55 PM', 2026, 10, 13, ts('2026-10-13', 0, 10)).local, '2026-10-12 23:55:00-07:00');
  assert.equal(seaRevisedTime('now 4:22 pm', 2026, 10, 12, ts('2026-10-12', 16, 35)).local, '2026-10-12 16:22:00-07:00');
  assert.equal(seaRevisedTime('Now 1:45 PM', 2026, 10, 12, ts('2026-10-12', 13, 45)), null, 'the same time is no revision');
  for (const s of ['On-Time', 'Departed', 'Landed', 'Cancelled', 'Boarding', '', null]) assert.equal(seaRevisedTime(s, 2026, 10, 12, ts('2026-10-12', 13, 45)), null, String(s));
});

test('the hours a board shows: two hours back to twelve ahead, the next three asked every time', () => {
  const at = (iso) => seaWindowParts(Date.parse(iso)).map((b) => `${b.day} ${b.from}-${b.to}${b.hot ? ' hot' : ''}`);
  // 2:45 PM, worked out for its quarter hour (to 3:00): from 12:00 (two hours
  // back) to 4 AM (twelve hours and five minutes past 3:00 is 3:05 AM), the
  // part asked every time until 6 PM (three hours past 3:00)
  assert.deepEqual(at('2026-10-12T14:45:00-07:00'), ['2026-10-12 12-18 hot', '2026-10-12 18-24', '2026-10-13 0-4']);
  // the same parts all quarter hour long
  assert.deepEqual(at('2026-10-12T14:59:59-07:00'), at('2026-10-12T14:45:00-07:00'));
  // 1:30 AM: last night's last hour, today's
  assert.deepEqual(at('2026-10-13T01:30:00-07:00'), ['2026-10-12 23-24 hot', '2026-10-13 0-5 hot', '2026-10-13 5-14']);
  // on the hour: 6:00 PM, the part asked every time until 9:15 PM
  assert.deepEqual(at('2026-10-12T18:00:00-07:00'), ['2026-10-12 16-22 hot', '2026-10-12 22-24', '2026-10-13 0-7']);
  // the night the clocks go back (1 AM twice): each hour once, no gap
  assert.deepEqual(at('2026-11-01T00:30:00-07:00'), ['2026-10-31 22-24 hot', '2026-11-01 0-3 hot', '2026-11-01 3-12']);
  // the night they go forward (no 2 AM): one part, 2 AM inside it, and three
  // hours of real time ahead
  assert.deepEqual(at('2027-03-14T00:30:00-08:00'), ['2027-03-13 22-24 hot', '2027-03-14 0-5 hot', '2027-03-14 5-14']);
  // every part covers the board's twelve hours, never more than the hour around them
  for (let t = Date.parse('2026-10-12T00:00:00-07:00'); t < Date.parse('2026-10-13T00:00:00-07:00'); t += 7 * 60000) {
    const ps = seaWindowParts(t);
    const start = Date.parse(`${ps[0].day}T${String(ps[0].from).padStart(2, '0')}:00:00-07:00`);
    const e = ps[ps.length - 1];
    const end = Date.parse(`${e.day}T00:00:00-07:00`) + e.to * 3600000;
    assert.ok(start <= t - 2 * 3600000 && start > t - 3 * 3600000, 'from the hour two hours back');
    assert.ok(end >= t + 12 * 3600000 + 5 * 60000 && end <= t + 13 * 3600000 + 20 * 60000, 'to the hour holding twelve hours ahead');
  }
  // the URL: date, both hours (end open at midnight), flight-number order, the page
  const [b] = seaWindowParts(Date.parse('2026-10-12T14:45:00-07:00'));
  assert.equal(seaPageUrl('dep', b, 2), 'https://www.portseattle.org/sea/flight-status?flightNo=&airline=&city=&arr_or_depart=D'
    + '&flight_date=2026-10-12&datetime_start=12&datetime_end=18&orderby=FlightNumberSort&page=2');
  assert.match(seaPageUrl('arr', { day: '2026-10-12', from: 21, to: 24 }, 1), /&arr_or_depart=A&flight_date=2026-10-12&datetime_start=21&datetime_end=&orderby=FlightNumberSort&page=1$/);
});

test('rows on a page, the pager\'s last page, and each row once', () => {
  assert.equal(seaPageRowCount(fx('sea-rows-dep-2026-10-12.html')), 20);
  assert.equal(seaPageLast('<a href="/sea/flight-status/?flightNo=&amp;page=1&amp;x">2</a><a href="?a=1&amp;page=4">5</a>'), 4);
  assert.equal(seaPageLast('<table></table>'), 0);
  // an hour's :00 rows are in two parts; a multi-stop flight keeps a row per stop
  const twice = seaMergeRows([DEP, DEP.slice(0, 5)]);
  assert.equal(twice.length, DEP.length);
  assert.equal(twice.filter((f) => f.number === 'AS61').length, 4);
  // the first reading is kept: the part asked every time comes first
  const fresh = seaParsePage(fx('sea-rows-dep-2026-10-12.html'), 'dep', NOW).slice(0, 1).map((f) => ({ ...f, departure: { ...f.departure, gate: 'Z1' } }));
  assert.equal(seaMergeRows([fresh, DEP])[0].departure.gate, 'Z1');
});

// A page of n rows of one date, built from a real row with its number, record
// and date changed (numbers from..from+n-1, four digits at most). The pager
// links pages 1..last (Sea-Tac numbers its pages from 1).
function pageOf(n, from, last, day) {
  const row = realRow('KL6032', '10-12-2026');
  const mdy = day ? `${day.slice(5, 7)}-${day.slice(8, 10)}-${day.slice(0, 4)}` : '10-12-2026';
  let rows = '';
  for (let i = 0; i < n; i++) {
    const num = String(from + i);
    rows += row.replace(/KL6032/g, 'KL' + num).replace('18986534626032KLAMS', '1898653462' + num + 'KLAMS').replace('10-12-2026', mdy);
  }
  let pager = '';
  for (let p = 1; p <= last; p++) pager += `<a href="/sea/flight-status/?flightNo=&amp;page=${p}">${p}</a>`;
  return `<html><body><p>flight-status</p><table>${rows}</table>${pager}</body></html>`;
}

test('a part is page 1, then the pages its pager links to, together, and on while full; never page 0', async () => {
  const asked = [];
  const part = { day: '2026-10-12', from: 12, to: 18 };
  const pages = { 1: pageOf(50, 1000, 3), 2: pageOf(50, 2000, 3), 3: pageOf(50, 3000, 3), 4: pageOf(7, 4000, 3) };
  const ask = async (url, p) => { asked.push(p); assert.match(url, new RegExp(`&page=${p}$`)); return pages[p] == null ? null : pages[p]; };
  const rows = await seaWalkPart(ask, 'dep', part, NOW);
  // page 0 is page 1 again: never asked. The pager linked to 2 and 3; page 3
  // was full, so page 4 was asked, and it was the last
  assert.deepEqual(asked, [1, 2, 3, 4]);
  assert.equal(rows.length, 157);
  // a short page 1 is the whole part
  asked.length = 0;
  assert.equal((await seaWalkPart(async (u, p) => { asked.push(p); return pageOf(12, 1000, 1); }, 'dep', part, NOW)).length, 12);
  assert.deepEqual(asked, [1]);
  // a dead page 1: null, nothing more asked
  asked.length = 0;
  assert.equal(await seaWalkPart(async (u, p) => { asked.push(p); return null; }, 'dep', part, NOW), null);
  assert.deepEqual(asked, [1]);
  // a dead page the pager linked to: the part is not whole
  assert.equal(await seaWalkPart(async (u, p) => (p === 2 ? null : pages[p]), 'dep', part, NOW), null);
  // past the pager's last, a page that is not a list is where it ends
  const tail = await seaWalkPart(async (u, p) => (p === 4 ? null : pages[p]), 'dep', part, NOW);
  assert.equal(tail.length, 150);
  // a pager that never ends stops at SEA_PART_PAGES
  asked.length = 0;
  await seaWalkPart(async (u, p) => { asked.push(p); return pageOf(50, 1000 + p * 50, 40); }, 'dep', part, NOW);
  assert.equal(Math.max(...asked), 16);
});

test('a queue of three: every task runs once, in the order asked, never more than three at once', async () => {
  const lim = seaLimiter(3);
  let open = 0, most = 0;
  const started = [];
  const task = (i, ms) => lim(async () => {
    started.push(i); open++; most = Math.max(most, open);
    await new Promise((r) => setTimeout(r, ms));
    open--;
    if (i === 4) throw new Error('page 4 failed');
    return i;
  });
  const got = await Promise.allSettled([0, 1, 2, 3, 4, 5, 6, 7].map((i) => task(i, 5 + (i % 3) * 4)));
  assert.equal(most, 3);
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(got.map((g) => (g.status === 'fulfilled' ? g.value : 'x')), [0, 1, 2, 3, 'x', 5, 6, 7], 'a failure frees its place');
  assert.equal(open, 0);
});

test('sea list(): the board\'s hours, every page once, the next three hours every two minutes, tomorrow whole or not at all', async () => {
  const saved = { caches: globalThis.caches, fetch: globalThis.fetch, now: Date.now };
  const calls = [], puts = [];
  let deadTomorrow = false, deadToday = false;
  globalThis.caches = { default: {
    match: async () => undefined,
    put: async (req, res) => puts.push({ url: req.url, neg: res.headers.get('X-Auth-Neg'), cc: res.headers.get('Cache-Control') })
  } };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u);
    const day = u.searchParams.get('flight_date'), from = Number(u.searchParams.get('datetime_start')), p = Number(u.searchParams.get('page'));
    if ((deadTomorrow && day === '2026-10-13') || (deadToday && day === '2026-10-12' && from === 12)) return new Response('<html>502</html>', { status: 502 });
    // the noon part is two full pages and a short one; the others one short page
    const base = (day === '2026-10-13' ? 5000 : 0) + from * 100;
    if (from === 12 && day === '2026-10-12') return new Response(p < 3 ? pageOf(50, base + (p - 1) * 50, 3, day) : pageOf(3, base + 100, 3, day), { status: 200 });
    return new Response(pageOf(4, base, 1, day), { status: 200 });
  };
  Date.now = () => NOW;
  try {
    const rows = await _authorityHandlers.sea.list('dep', {});
    assert.ok(calls.every((u) => u.origin + u.pathname === 'https://www.portseattle.org/sea/flight-status'
      && u.searchParams.get('arr_or_depart') === 'D' && u.searchParams.get('orderby') === 'FlightNumberSort'));
    assert.deepEqual([...new Set(calls.map((u) => `${u.searchParams.get('flight_date')} ${u.searchParams.get('datetime_start')}-${u.searchParams.get('datetime_end')}`))].sort(), [
      '2026-10-12 12-18', '2026-10-12 18-', '2026-10-13 00-04'
    ]);
    assert.equal(calls.length, 5, 'three parts, two more pages of the noon part');
    assert.ok(calls.every((u) => u.searchParams.get('page') !== '0'), 'never page 0');
    assert.equal(rows.length, 2 * 4 + 103);
    // what changes (the trail and the next three hours) every two minutes, the
    // rest every fifteen; every page of a part under its slot's key
    const cc = Object.fromEntries(puts.map((x) => [x.url.replace('https://authority-feeds/', ''), x.cc]));
    const hot = Math.floor(NOW / 120000), later = Math.floor(NOW / 900000);
    assert.equal(cc[`sea/dep/2026-10-12/12-18/${hot}/1`], 'public, max-age=120');
    assert.equal(cc[`sea/dep/2026-10-12/12-18/${hot}/3`], 'public, max-age=120');
    assert.equal(cc[`sea/dep/2026-10-12/18-24/${later}/1`], 'public, max-age=900');
    assert.equal(cc[`sea/dep/2026-10-13/0-4/${later}/1`], 'public, max-age=900');
    // tomorrow dead: today's rows stand
    deadTomorrow = true; calls.length = 0; puts.length = 0;
    const today = await _authorityHandlers.sea.list('dep', {});
    assert.equal(today.length, 4 + 103);
    assert.ok(today.every((f) => f.departure.scheduledTime.local.startsWith('2026-10-12')));
    // today dead: nothing (the board keeps its last good list)
    deadTomorrow = false; deadToday = true;
    assert.equal(await _authorityHandlers.sea.list('dep', {}), null);
  } finally {
    globalThis.caches = saved.caches; globalThis.fetch = saved.fetch; Date.now = saved.now;
  }
});

// ── Sea-Tac as it listed 2026-10-12, page by page (sea-pages-2026-10-12.json):
// an emulated site, a clock that moves, caches that expire and the shared
// copy, to count what a renewal of the boards' list asks of it.
const LISTING = JSON.parse(fx('sea-pages-2026-10-12.json'));
const STATUS_TEXT = { departed: 'Departed', landed: 'Landed', arrived: 'Arrived', cancelled: 'Cancelled' };
function listingRow(r, dir) {
  const [num, sched, iata, city, gate, status, revised, belt, rec] = r;
  const [d, t] = sched.split(' ');
  const hh = Number(t.slice(0, 2)), mm = t.slice(3, 5);
  const clock = `${(hh % 12) || 12}:${mm}${hh < 12 ? 'AM' : 'PM'}`;
  let st = STATUS_TEXT[status] || 'On-Time';
  if (revised) { const rh = Number(revised.slice(11, 13)); st = `Now ${(rh % 12) || 12}:${revised.slice(14, 16)} ${rh < 12 ? 'AM' : 'PM'}`; }
  const m = num.match(/^([A-Z0-9]{2})(\d+)$/);
  return `<tr class="ItemStyleClass"><td>${city} <span>(${iata})</span></td><td>${m[1]}</td><td>${num}</td>`
    + `<td>${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}</td><td>${clock}</td><td><span>${st}</span></td><td>${gate}</td>`
    + (dir === 'arr' ? `<td>${belt}</td>` : '') + `<td><a data-target="#modalAirline${rec}${m[2]}${m[1]}${iata}"></a></td></tr>`;
}
// rows of one date with from:00 <= time <= to:00 (to 24: the day's end), in flight-number order
function listingRange(dir, day, from, to) {
  const all = LISTING[dir === 'dep' ? 'departures' : 'arrivals'];
  const mins = (r) => Number(r[1].slice(11, 13)) * 60 + Number(r[1].slice(14, 16));
  return all.filter((r) => r[1].startsWith(day) && mins(r) >= from * 60 && (to >= 24 || mins(r) <= to * 60))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
function emulatedSite(clock) {
  const asked = [];
  const fetch = async (url) => {
    const u = new URL(String(url));
    const dir = u.searchParams.get('arr_or_depart') === 'D' ? 'dep' : 'arr';
    const day = u.searchParams.get('flight_date'), from = Number(u.searchParams.get('datetime_start'));
    const to = u.searchParams.get('datetime_end') === '' ? 24 : Number(u.searchParams.get('datetime_end'));
    const page = Math.max(1, Number(u.searchParams.get('page')) || 1);   // page 0 is page 1
    asked.push({ dir, day, from, to, page, at: clock.now });
    const rows = listingRange(dir, day, from, to);
    const last = Math.ceil(rows.length / 50);
    let pager = '';
    if (rows.length > 50) for (let k = 1; k <= last; k++) pager += `<a href="/sea/flight-status/?page=${k}">${k}</a>`;
    return new Response(`<html><body><p>flight-status</p><table>${rows.slice((page - 1) * 50, page * 50).map((r) => listingRow(r, dir)).join('')}</table>${pager}</body></html>`, { status: 200 });
  };
  const store = new Map();
  const caches = { default: {
    async match(req) { const e = store.get(req.url); return e && e.exp > clock.now ? new Response(e.body, { headers: e.headers }) : undefined; },
    async put(req, res) { const m = (res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/); store.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers), exp: clock.now + (m ? Number(m[1]) : 0) * 1000 }); }
  } };
  const kvs = new Map();
  const kv = {
    async get(k, o) { const e = kvs.get(k); if (!e) return null; return o && o.type === 'json' ? JSON.parse(e) : e; },
    async put(k, v) { kvs.set(k, String(v)); }
  };
  return { asked, fetch, caches, env: { FIDS_LIVE_FLIGHTS: kv } };
}
async function withSite(start, fn) {
  const saved = { caches: globalThis.caches, fetch: globalThis.fetch, now: Date.now };
  const clock = { now: start };
  const site = emulatedSite(clock);
  globalThis.caches = site.caches; globalThis.fetch = site.fetch; Date.now = () => clock.now;
  _feedResetMemory();
  try { return await fn(site, clock); }
  finally { globalThis.caches = saved.caches; globalThis.fetch = saved.fetch; Date.now = saved.now; _feedResetMemory(); }
}
const pagesFor = (n) => Math.max(1, Math.ceil(n / 50));

test('a renewal asks for the board\'s hours, every page once: what twelve hours of Sea-Tac strictly need', async () => {
  await withSite(NOW, async (site) => {
    for (const dir of ['dep', 'arr']) {
      site.asked.length = 0;
      const rows = await _authorityHandlers.sea.list(dir, site.env);
      // each part's pages, each once, page 1 first: ceil(rows / 50), no more
      const want = seaWindowParts(NOW).reduce((n, p) => n + pagesFor(listingRange(dir, p.day, p.from, p.to).length), 0);
      assert.equal(site.asked.length, want, dir);
      assert.ok(site.asked.every((a) => a.page >= 1));
      assert.equal(new Set(site.asked.map((a) => `${a.day}|${a.from}|${a.page}`)).size, site.asked.length, 'no page twice');
      // and every row the boards ask for (two hours back to twelve ahead) is served
      const have = new Set(rows.map((f) => `${f.number}|${f._authTs}`));
      const need = LISTING[dir === 'dep' ? 'departures' : 'arrivals'].filter((r) => {
        const ts = Date.parse(r[1].replace(' ', 'T') + ':00-07:00');
        return ts >= NOW - 2 * 3600000 && ts < NOW + 12 * 3600000;
      });
      assert.ok(need.length > 300, dir + ': a real afternoon');
      for (const r of need) assert.ok(have.has(`${r[0]}|${Date.parse(r[1].replace(' ', 'T') + ':00-07:00')}`), `${dir} ${r[0]} ${r[1]}`);
      // nothing outside the hours around them
      assert.ok(rows.every((f) => f._authTs >= NOW - 3 * 3600000 && f._authTs <= NOW + 13 * 3600000 + 5 * 60000));
    }
  });
});

test('renewed every five minutes for an hour: the next three hours every time, the rest every fifteen minutes', async () => {
  await withSite(NOW, async (site, clock) => {
    const h = _authorityHandlers.sea;
    const perRenewal = [];
    let want = 0;
    const seen = new Set();
    for (let m = 0; m <= 60; m += 5) {
      clock.now = NOW + m * 60000;
      const before = site.asked.length;
      // a board's renewal: two windows a direction, as maybeServeAuthorityWindow asks
      for (const dir of ['dep', 'arr']) for (let w = 0; w < 2; w++) {
        const g = await feedGuard(site.env, null, 'SEA', dir, 'win', () => h.list(dir, site.env));
        assert.equal(g.state, 'ok');
      }
      perRenewal.push(site.asked.length - before);
      // the pages that are due: a part's slot not read before
      for (const dir of ['dep', 'arr']) for (const p of seaWindowParts(clock.now)) {
        const k = `${dir}|${p.day}|${p.from}-${p.to}|${Math.floor(clock.now / ((p.hot ? 120 : 900) * 1000))}`;
        if (seen.has(k)) continue;
        seen.add(k);
        want += pagesFor(listingRange(dir, p.day, p.from, p.to).length);
      }
    }
    assert.equal(perRenewal.reduce((a, b) => a + b, 0), want);
    // measured on the 2026-10-12 listing from 2:45 PM: every renewal reads the
    // trail and the next three hours (13 pages, both directions), and the
    // quarter-hour ones the rest of the twelve hours too (13-14 more): 18 a
    // renewal on average, where reading all twelve hours each time would be 26
    assert.deepEqual(perRenewal.map((n, i) => (i % 3 === 0 ? 'q' : n)), ['q', 13, 13, 'q', 13, 13, 'q', 13, 13, 'q', 13, 13, 'q']);
    assert.ok(perRenewal.every((n, i) => i % 3 !== 0 || (n >= 26 && n <= 27)), String(perRenewal));
    assert.ok(perRenewal.reduce((a, b) => a + b, 0) / perRenewal.length < 18.5, String(perRenewal));
  });
});

test('a reading has at most three of Sea-Tac\'s pages open at once, the whole twelve hours included', async () => {
  await withSite(NOW, async (site) => {
    let open = 0, most = 0;
    const plain = globalThis.fetch;
    globalThis.fetch = async (u) => {
      open++; most = Math.max(most, open);
      try { await new Promise((r) => setTimeout(r, 3)); return await plain(u); } finally { open--; }
    };
    for (const dir of ['dep', 'arr']) {
      site.asked.length = 0;
      const rows = await _authorityHandlers.sea.list(dir, site.env);
      assert.ok(rows.length > 300 && site.asked.length > 6, dir + ': a whole reading (' + site.asked.length + ' pages)');
    }
    assert.equal(most, 3);
  });
});

test('/acinfo never reads Sea-Tac for an aircraft: its rows carry none', () => {
  const src = readFileSync(new URL('../workers/fids-proxy.js', import.meta.url), 'utf8');
  assert.equal(_authorityHandlers.sea.noAircraft, true);
  const rows = seaParsePage(fx('sea-rows-dep-2026-10-12.html'), 'dep', NOW);
  const all = rows.concat(seaParsePage(fx('sea-rows-arr-2026-10-12.html'), 'arr', NOW));
  assert.ok(all.length >= 20 && all.every((f) => !f.aircraft || (!f.aircraft.model && !f.aircraft.reg)));
  const ac = src.slice(src.indexOf('if (path === "/acinfo") {'), src.indexOf('if (path === "/fararr") {'));
  assert.match(ac, /const h = other && AUTHORITY_HANDLERS\[other\];\n\s+if \(h && !h\.noAircraft\) \{/);
});

test('a gate elsewhere showing a flight to Seattle reads the boards\' shared copy: it never walks Sea-Tac again', async () => {
  await withSite(NOW, async (site, clock) => {
    const h = _authorityHandlers.sea;
    await feedGuard(site.env, null, 'SEA', 'arr', 'win', () => h.list('arr', site.env));
    const walked = site.asked.length;
    assert.ok(walked > 5);
    // /fararr, five minutes on (the share interval is past, a board renews every five)
    clock.now += 5 * 60000;
    _feedResetMemory();
    const rows = await farArrList('sea', site.env, {});
    assert.ok(rows && rows.length > 300);
    assert.equal(site.asked.length, walked, 'no page asked');
    // the shared copy older than six minutes and no board renewing it: asked once, then shared again
    clock.now += 2 * 60000;
    _feedResetMemory();
    await farArrList('sea', site.env, {});
    const again = site.asked.length - walked;
    assert.ok(again > 0 && again <= walked);
    await farArrList('sea', site.env, {});
    assert.equal(site.asked.length - walked, again);
  });
});
