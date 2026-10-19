'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24068 — A NEW ARRIVING AIRCRAFT NEVER SHOWS THE PREVIOUS ONE'S NUMBERS.
//
// A gate can swap to a different inbound while it keeps the same departure.
// Up to v24066 the gate's speed/altitude state (window._gateTelemAnim) was
// reset only when the DEPARTURE changed, and so was the shared live position
// (window._gateInboundLivePos). After a swap that kept the departure:
//   - the render handed the previous aircraft's position to the new inbound
//     as its first reading (the old speed and altitude shown as the new one's);
//   - the model paired the previous aircraft's last reading with the new
//     one's first and carried that "rate" (a descending aircraft's digits
//     climbed);
//   - the model's ground test read the previous aircraft's "on the ground" and
//     eased an airborne aircraft's altitude toward 0 ft;
//   - an answer for the previous aircraft landing after the swap was taken as
//     the new one's;
//   - an FR24 answer found under a callsign, tail or flight number two rows
//     share was taken as the new one's, and so were the render's 3-minute
//     hold and sticky fix for a second leg flown under the same number.
//
// The replays run the board's own code, lifted from fids-core.js: the
// telemetry anchor, model, animator and digit writer; the render lines of
// _buildV2MapCol that pick the live numbers; the gate render's lines just
// before the panel is built and just after it; the 60 s numbers poll; the
// direct inbound lookup's answer; the reg-lookup inbound's position; and the
// FR24 lookups (_adsbCached, _adsbTelemetry, _adsbFetchOne) down to fetch(),
// which is a stand-in Worker (one answer per path held 180 s, 300 s when
// FR24 has nothing, served aged).
//
// THE BASELINE ("off") is the same code with the swap isolation switched off:
// _gateTelemId names nobody, so no state is ever owned, nothing is dropped
// and nothing is reset. That is v24066's behaviour: when this file was
// written it was run, replay for replay, against v24066's own code (fd928aac)
// in its place, with every second the same. The oracle is the baseline given,
// at each swap, a fresh state (and no previous position, no 3-minute hold,
// no sticky fix): v24066's own answer for an aircraft it starts on from
// nothing.
//
// What they hold the board to:
//   (a) no swap: every second of 1,200 random loads (climbs, descents, level,
//       approach and landing, taxi, take-off; the inbound flapping to none and
//       back, a gate with no inbound yet, the feed rebuilding the row, the
//       departure changing, Arrived, FR24 quiet spells, the schedule lookup's
//       position, the previous-leg guard, fixes that are not this leg, the
//       direct lookup's and the reg lookup's answers, a row known only by its
//       tail, a row with neither) is the baseline's, with the same FR24 calls;
//   (b) after a swap (airborne to airborne, on the ground to airborne,
//       airborne to on the ground, to and from a row known only by its tail,
//       back to the first aircraft, through a gap with no inbound, and across
//       a departure change) every second is the oracle's, while the baseline
//       shows the previous aircraft's numbers;
//   (b') after a swap between rows that share a callsign, a tail, or (two
//       legs) a flight number, nothing shows until the new aircraft's own
//       reading, every reading it is anchored on is its own, and its digits
//       never show the previous one's, while the baseline's do;
//   (c) the previous aircraft's answer landing after the swap (FR24's, the
//       poll's "nothing", the schedule lookup's, the direct lookup's, the reg
//       lookup's) is dropped;
//   (d) FR24 calls and Worker requests are the baseline's in every replay.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
// the text the "now" build is lifted from (the same file; a mutation check swaps only this one)
const NOW_CORE = CORE;
// the text the baseline is lifted from: null for this file's own code with the
// isolation switched off (a check against v24066's own code puts that here)
const OFF_CORE = null;

// ── the texts ──────────────────────────────────────────────────────────────
// a top-level declaration ('function name' / 'async function name'), whole
function decl(head, core) {
  const at = core.indexOf('\n' + head + '(');
  if (at < 0 || core.indexOf('\n' + head + '(', at + 1) >= 0) return null;
  let i = core.indexOf('{', at), d = 0;
  for (; i < core.length; i++) {
    if (core[i] === '{') d++;
    else if (core[i] === '}' && --d === 0) return core.slice(at + 1, i + 1);
  }
  return null;
}
// the lines between two markers (the first included, the second included when asked)
const SLICES = {
  // _buildV2MapCol: the live numbers, from the shared cache to the digits it paints
  RENDER: ["      // doesn't blink off on polls where ADB omits the position.\n", "      var _tz = vars.tz || 'UTC';"],
  // the gate render, just before it builds the panel
  GATE_PRE: ['      try { window._gatePanelInbound = inboundFlight || null; } catch (e) {}\n', "\n      if (inboundFlight) {\n        console.log('[FIDS] Inbound for'"],
  // the gate render, just after: the departure-change wipe and the inbound bookkeeping
  GATE_POST: ["      var _prevInbId = window._gateInboundId || '';\n", '      window._gateCurrentFlight = currentFlight;\n', true],
  // the direct inbound lookup's answer (it re-pairs the gate to the inbound it asked about)
  DIRECT: ['                if (!inbData) return;\n', "                if (typeof requestGateRebuild === 'function') requestGateRebuild();\n", true],
  // the reg lookup's inbound and its position
  REGLOOKUP: ['            window._gateInbound = data.inbound;\n', '            })();\n', true]
};
function slice(name, core) {
  const [a, b, incl] = SLICES[name];
  const i = core.indexOf(a);
  assert.ok(i >= 0 && core.indexOf(a, i + 1) < 0, name + ': its first marker, once');
  const j = core.indexOf(b, i);
  assert.ok(j > i, name + ': its second marker');
  return core.slice(i, incl ? j + b.length : j);
}
const NEW_FNS = ['_gateTelemId', '_gateTelemSame', '_gateTelemReset', '_gateTelemFor', '_gateLivePosFor'];
const LIFTED = ['_writeGateTelemDom', '_gateTelemSetReal', '_gateTelemModel', '_animateGateTelem', '_gateStickyFix',
  '_adsbCached', '_adsbTelemetry', '_adsbFetchOne', '_gateNumbersPoll'];
const ASYNC = new Set(['_gateNumbersPoll', '_adsbTelemetry', '_adsbFetchOne']);
function text(name, core) {
  if (SLICES[name]) return slice(name, core);
  const t = decl((ASYNC.has(name) ? 'async function ' : 'function ') + name, core);
  assert.ok(t, name + ' must exist, once');
  return t;
}
const num = (re) => { const m = CORE.match(re); assert.ok(m, String(re)); return Number(m[1]); };
const K = {
  ARR_CONFIRM_MIN: num(/\nvar ARR_CONFIRM_MIN = (\d+);/),
  GATE_GRACE_MIN: num(/\nvar GATE_GRACE_MIN = (\d+);/),
  _GATE_FIX_TTL: num(/\nvar _GATE_FIX_TTL = (\d+);/),
  _ADSB_TTL_MS: num(/\nvar _ADSB_TTL_MS = (\d+);/)
};

// ── the builds: one factory each, a fresh sandbox per replay ───────────────
// Every free name the lifted code reads is a stub below, a lifted function, or
// a JavaScript built-in; anything else is recorded (MISSING) and the tests
// require there to be none.
function source(build) {
  const core = build === 'now' ? NOW_CORE : (OFF_CORE || CORE);
  const T = (n) => text(n, core);
  let fns = [];
  if (build === 'now') fns = NEW_FNS.map(T);
  else if (!OFF_CORE) fns = NEW_FNS.map((n) => (n === '_gateTelemId' ? 'function _gateTelemId() { return null; }' : T(n)));
  return fns.concat(LIFTED.map(T)).join('\n') + '\n'
    + 'function __render(vars) {\n  var _liveSpd = null, _liveAlt = null;\n  var _ib = vars.inboundFlight;\n  if (!_ib) return null;\n'
    + T('RENDER') + '\n  return { liveSpd: _liveSpd, liveAlt: _liveAlt, spdD: _liveSpdD, altD: _liveAltD };\n}\n'
    + 'function __gatePre(inboundFlight) {\n' + T('GATE_PRE') + '}\n'
    + 'function __gatePost(inboundFlight, currentFlight) {\n' + T('GATE_POST') + '}\n'
    + 'function __direct(inboundFlight, inbData, _capturedIata, _capturedOutbound, _capturedInbound) {\n' + T('DIRECT') + '}\n'
    + 'function __regLookup(data) {\n' + T('REGLOOKUP') + '}\n';
}
const EXPORTS = ['_gateTelemSetReal', '_gateTelemModel', '_animateGateTelem', '_gateNumbersPoll', '__render', '__gatePre', '__gatePost', '__direct', '__regLookup'];
const FACTORY = {};
function factory(build) {
  if (!FACTORY[build]) {
    const ex = EXPORTS.concat(build === 'now' ? NEW_FNS : []);
    FACTORY[build] = new Function('S', 'with (S) {\n' + source(build) + '\nreturn { ' + ex.join(', ') + ' };\n}');
  }
  return FACTORY[build];
}
const MISSING = new Set();
function scope(target) {
  return new Proxy(target, {
    has(t, k) { return typeof k === 'string' && ((k in t) || !(k in globalThis)); },
    get(t, k) { if (typeof k !== 'string') return undefined; if (!(k in t)) MISSING.add(k); return t[k]; },
    set(t, k, v) { t[k] = v; return true; }
  });
}
const T0 = Date.UTC(2026, 9, 19, 14, 0, 0);
const BASE = 'https://worker.test/adsb';
const QUIET = { log() {}, warn() {}, error() {}, info() {} };
const INIT = () => ({ spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0, realSecToArr: null, shimmerPh: 0 });
// what these replays do not lift: the feed, the map, the schedule lookup
// (empty, as it answers today, unless a replay gives a flight a feed position),
// the leg checks (passed, unless a replay says a flight's fixes are not its leg)
function stubs(env) {
  return Object.assign(Object.create(null), {
    window: env.win, document: env.doc, Date: env.Date, console: QUIET, fetch: env.fetch,
    AbortController: undefined, setTimeout: () => 0, clearTimeout: () => {},
    BoardStrings: { num: (v) => String(v) },
    screenType: 'gate', _gateNumPollBusy: false,
    ARR_CONFIRM_MIN: K.ARR_CONFIRM_MIN, GATE_GRACE_MIN: K.GATE_GRACE_MIN, _GATE_FIX_TTL: K._GATE_FIX_TTL, _ADSB_TTL_MS: K._ADSB_TTL_MS,
    _gateFixCache: null, _adsbInflight: Object.create(null), _adsbCache: Object.create(null), _ADSB_BASE: BASE,
    AP: {}, CALLSIGN_TO_IATA: {}, gateMap: null, _gateMapCamera: null,
    fidsLocalDateKey: () => '2026-10-19', fidsFlightPlan: () => null, loadFlight: (fl) => Promise.resolve(env.feed(fl)),
    _acResolvedPut: () => {}, render: env.forced, requestGateRebuild: env.rebuild,
    _gateRawLanded: (r) => /^(arrived|landed)\b/i.test(String((r && r.status) || '').trim()),
    _gateLegGone: (r) => /cancel|divert/i.test(String((r && r.status) || '')),
    _stopGateMapGlide: () => {}, _gateLegWindowOpen: () => true, _gateDepSchedTs: (r) => (r && r._depTs) || null,
    _fixPlausibleForLeg: (r) => env.plausible(r), _lookupAirport: () => null, _gcNm: () => 0,
    formatAircraft: () => '', aircraftCodeToIata: () => '', _icaoCallsign: () => '',
    _gateTrackPush: () => {}, _gateLiveFix: () => null, _liveFixPhysOk: () => true
  });
}
const flush = () => new Promise((r) => setImmediate(r));

// ── truth: one aircraft, second by second ──────────────────────────────────
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
// o: { alt, spd (at -300 s), hdg, segs: [{ until, vs (ft/min), level, ds (kt/s), ground, spd, turn }] }
let TAGS = 0;
function aircraft(o) {
  const tab = new Map();
  let alt = o.alt, spd = o.spd, vs = 0, lat = 46.1, lon = -66.6, hdg = (o.hdg != null) ? o.hdg : 80;
  let si = 0;
  for (let t = -300; t <= 1800; t++) {
    while (si < o.segs.length - 1 && t >= o.segs[si].until) si++;
    const g = o.segs[si];
    if (g.ground) { alt = 0; vs = 0; spd += Math.max(-2.5, Math.min(1, (g.spd || 0) - spd)); }
    else {
      let cmd = (g.vs || 0) / 60;
      if (typeof g.level === 'number') {
        const lim = (g.level - alt) / 18;
        cmd = (cmd < 0) ? Math.max(cmd, Math.min(0, lim)) : (cmd > 0 ? Math.min(cmd, Math.max(0, lim)) : lim);
      }
      vs += (cmd - vs) * 0.25; alt = Math.max(0, alt + vs); spd = Math.max(0, spd + (g.ds || 0));
    }
    hdg = (hdg + (g.turn || 0) + 360) % 360;
    const d = spd / 3600 / 60, br = hdg * Math.PI / 180;
    lat += d * Math.cos(br); lon += d * Math.sin(br) / Math.cos(lat * Math.PI / 180);
    tab.set(t, { alt: g.ground ? 0 : Math.round(alt / 25) * 25, spd: Math.round(spd), vs: Math.round(vs * 60 / 64) * 64,
      lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, trk: Math.round(hdg), ground: !!g.ground });
  }
  const f = (t) => tab.get(Math.max(-300, Math.min(1800, Math.round(t))));
  f.tag = o.tag || ('ac' + (++TAGS));
  return f;
}
const keyOf = (f) => String(f || '').replace(/\s+/g, '').toUpperCase();
const idStr = (w) => (w && w.k) ? w.k + '@' + w.t : null;

// ── one gate screen, second by second ─────────────────────────────────────
// sc: { secs, lag, lat, pk, refreshEvery, dep, depPlan: [[s, FLIGHT]], rows: { k: row },
//       planes: { FLIGHT|REG: truth }, switchAt: { ID: [s, truth] } (that subject's answers are another
//       aircraft's from s: the Worker forgets them then and answers from the new truth),
//       plan: [[s, rowKey|null]], status: [[s, rowKey, status]], refresh: [[s, rowKey, patch]] (the feed
//       rebuilds the row: a new object, the row as first given with the patch),
//       quiet(id, t), direct: [[s, rowKey, spd, alt, ground]], regLookup: [[s, rowKey, {spd, alt, lat, lng}]],
//       latFor: { ID: s } (that subject's answers take this long), feed: { FLIGHT: t => livePosition },
//       feedOff: [[s, FLIGHT]] (no feed position for it from s on), implausible: [FLIGHT] (its fixes are not its leg) }
// build 'oracle': the baseline, given at each of sc.freshAt a fresh state and no
// previous position, hold or sticky fix before that second's gate render, and
// from each [s, ID] of sc.dropFrom the Worker's answers for that subject carry nothing.
async function replay(build, sc) {
  const isOracle = build === 'oracle';
  const api = factory(isOracle ? 'off' : build);
  const clock = { s: 0 };
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [T0 + clock.s * 1000])); }
    static now() { return T0 + clock.s * 1000; }
  }
  const win = { _gateTelemAnim: INIT(), _gateIata: 'YQM' };
  let els = [];
  const doc = { querySelectorAll: () => els, getElementById: () => null };
  const KV = Object.create(null), pend = [];
  const out = { rows: [], fr24: 0, edge: 0, pendingAt: {}, served: [], paths: new Set(), renders: [] };
  const base = {}, rows = {};
  for (const [k, r] of Object.entries(sc.rows)) {
    base[k] = Object.assign({ status: 'En route', _locIata: 'YYZ', _sortTs: T0 + 45 * 60000, _durationMins: 120 }, r);
    rows[k] = Object.assign({}, base[k]);
  }
  const cf = Object.assign({ flight: sc.dep || 'XX900', dest: 'YYZ', _sortTs: T0 + 15 * 60000 }, sc.depRow || {});
  const dropFrom = {};
  if (isOracle) for (const [s, f] of (sc.dropFrom || [])) dropFrom[f] = s;
  function truthOf(id, t) {
    const sw = sc.switchAt && sc.switchAt[id];
    return (sw && t >= sw[0]) ? sw[1] : sc.planes[id];
  }
  function answer(kind, id, t) {
    const tr = truthOf(id, t);
    if (!tr || (sc.quiet && sc.quiet(id, t))) return { at: t, quiet: true };
    const taken = t - sc.lag, f = tr(taken);
    out.served.push({ id, t, tag: tr.tag, spd: f.spd, alt: f.ground ? 0 : f.alt, ground: f.ground });
    return { at: t, taken, ac: { alt_baro: f.ground ? 'ground' : f.alt, gs: f.spd, lat: f.lat, lon: f.lon, track: f.trk,
      baro_rate: f.ground ? 0 : f.vs, flight: id } };
  }
  function fetchStub(url) {
    out.edge++;
    const p = String(url).slice(BASE.length), m = p.match(/^\/(\w+)\/(.+)$/);
    const id = decodeURIComponent(m[2]).toUpperCase(), t = clock.s;
    out.paths.add(m[1]);
    let kv = KV[p];
    if (!kv || t - kv.at >= (kv.quiet ? 300 : 180)) { out.fr24++; kv = KV[p] = answer(m[1], id, t); }
    const lat = (sc.latFor && sc.latFor[id] != null) ? sc.latFor[id] : sc.lat;
    return new Promise((res) => pend.push({ due: t + lat, id, kv, t, res }));
  }
  function deliver(s) {
    let n = 0;
    for (let i = 0; i < pend.length;) {
      const q = pend[i];
      if (q.due > s) { i++; continue; }
      pend.splice(i, 1); n++;
      const drop = dropFrom[q.id] != null && s >= dropFrom[q.id];
      const body = q.kv.quiet ? { ac: [], _quiet: true }
        : (drop ? { ac: [] } : { ac: [Object.assign({}, q.kv.ac, { seen_pos: q.t - q.kv.taken })] });
      q.res({ ok: true, json: () => Promise.resolve(body) });
    }
    return n;
  }
  let cur = null, rebuildAt = null, late = 0;
  function feed(fl) {
    const f = keyOf(fl), src = sc.feed && sc.feed[f];
    const off = (sc.feedOff || []).some(([at, g]) => g === f && clock.s >= at);
    return (src && !off) ? { livePosition: src(clock.s) } : null;
  }
  const plausible = (r) => !(sc.implausible || []).includes(keyOf(r && r.flight));
  // requestGateRebuild waits (800 ms on a board): the gate is rebuilt the next second
  const rebuild = () => { if (rebuildAt == null) rebuildAt = clock.s + 1; };
  const S = scope(stubs({ win, doc, Date: FakeDate, fetch: fetchStub, forced: () => gatePass(), rebuild, feed, plausible }));
  const B = api(S);
  function paint(r) {
    els = [];
    if (!r || (r.liveSpd === null && r.liveAlt === null)) return;
    const span = (kind, v) => ({ textContent: v, getAttribute: () => kind });
    if (r.liveSpd !== null) els.push(span('spd-kph', String(Math.round(r.spdD * 1.852))));
    if (r.liveAlt !== null) els.push(span('alt-ft', String(r.altD)));
  }
  function gatePass() {
    const ib = cur ? rows[cur] : null;
    B.__gatePre(ib);
    // the gate's key (as the board's: the inbound, its status and its revised time)
    const key = cf.flight + '|' + (ib ? (ib.flight || ib._reg) + '@' + ib._sortTs + '|' + ib.status + '|' + (ib._revTs || '') : '|');
    if (win._lastGateKey !== key) {
      win._lastGateKey = key;
      out.renders.push(clock.s + late);   // + 0.5: after this second's answers landed
      paint(B.__render({ inboundFlight: ib, iata: 'YQM', tz: 'UTC' }));
    }
    B.__gatePost(ib, cf);
  }
  // the Worker already holds an answer, pk s old, for the first inbound's own path
  if (sc.pk != null && sc.plan[0][1] && rows[sc.plan[0][1]].flight) {
    const f = keyOf(rows[sc.plan[0][1]].flight);
    KV['/flight/' + f] = answer('flight', f, -sc.pk);
  }
  for (let s = 0; s <= sc.secs; s++) {
    clock.s = s;
    let pass = s === 0 || (sc.refreshEvery && s % sc.refreshEvery === 0);
    for (const [at, k] of sc.plan) if (at === s) { cur = k; pass = true; }
    for (const [at, d] of (sc.depPlan || [])) if (at === s) { cf.flight = d; pass = true; }
    for (const [at, k, st] of (sc.status || [])) if (at === s) { rows[k].status = st; pass = true; }
    for (const [at, k, patch] of (sc.refresh || [])) if (at === s) { rows[k] = Object.assign({}, base[k], patch); }
    // the feed revising the shown inbound's arrival time (it rebuilds the gate)
    if (sc.etaEvery && cur && s >= (sc.etaFrom || 1) && s % sc.etaEvery === 0) { const r = rows[cur]; r._revTs = (r._revTs || r._sortTs) + 60000; pass = true; }
    for (const [id, [at]] of Object.entries(sc.switchAt || {})) if (at === s) for (const p of Object.keys(KV)) if (p.endsWith('/' + id)) delete KV[p];
    if (isOracle && (sc.freshAt || []).includes(s)) { win._gateTelemAnim = INIT(); win._gateInboundLivePos = null; win._gateTelemHold = null; S._gateFixCache = null; }
    if (rebuildAt != null && s >= rebuildAt) { rebuildAt = null; win._lastGateKey = ''; pass = true; }
    if (pass) gatePass();
    for (const [at, k, spd, alt, ground] of (sc.direct || [])) if (at === s) {
      const r = rows[k];
      B.__direct(r, { reg: r._reg || '', livePosition: { speed: spd, alt, lat: 46.2, lng: -65.1, onGround: !!ground } }, 'YQM', cf.flight, r.flight);
    }
    for (const [at, k, v] of (sc.regLookup || [])) if (at === s) {
      const inbound = Object.assign({}, rows[k], { _inboundSource: 'reg-lookup', _forOutbound: cf.flight });
      if (v.spd != null) inbound._liveSpd = v.spd;
      if (v.alt != null) inbound._liveAlt = v.alt;
      if (v.lat != null) { inbound._liveLat = v.lat; inbound._liveLng = v.lng; }
      B.__regLookup({ inbound });
    }
    let started = false;
    late = 0.5;
    if (s >= 2 && (s - 2) % 60 === 0) { B._gateNumbersPoll().catch(() => {}); started = true; }
    if (started) await flush();
    if (deliver(s)) await flush();
    out.pendingAt[s] = pend.map((q) => q.id);
    late = 0;
    B._animateGateTelem();
    const T = win._gateTelemAnim, lp = win._gateInboundLivePos;
    const sp = els.find((e) => e.getAttribute() === 'spd-kph'), al = els.find((e) => e.getAttribute() === 'alt-ft');
    out.rows.push({ s, vis: els.length > 0, ft: al ? Number(al.textContent) : null, kph: sp ? Number(sp.textContent) : null,
      spd: T.spd, alt: T.alt, realSpd: T.realSpd, realAlt: T.realAlt, realTs: T.realTs,
      prevSpd: T.prevSpd, prevAlt: T.prevAlt, prevTs: T.prevTs, realSecToArr: T.realSecToArr, who: idStr(T.who),
      lp: lp ? JSON.stringify(Object.assign({}, lp, { who: undefined })) : null, lpWho: lp ? idStr(lp.who) : null,
      gnd: cur ? rows[cur]._liveOnGround === true : null, cur });
  }
  return out;
}
const SCREEN = ['vis', 'ft', 'kph'];
const DIGITS = SCREEN.concat(['spd', 'alt', 'realSpd', 'realAlt', 'realTs', 'prevSpd', 'prevAlt', 'prevTs', 'realSecToArr']);
const ALL = DIGITS.concat(['lp', 'gnd']);
function diff(a, b, fields, from, to) {
  const d = [];
  for (let i = from || 0; i < Math.min(to == null ? Infinity : to, a.rows.length); i++) {
    const k = fields.find((f) => a.rows[i][f] !== b.rows[i][f]);
    if (k) d.push(i + ' ' + k + ' ' + a.rows[i][k] + ' / ' + b.rows[i][k]);
  }
  return d;
}

// ── aircraft ────────────────────────────────────────────────────────────────
const P = {
  // the two of the replay the fix comes from: WS812 descending through 9,000 and
  // 8,000 ft about 4 minutes in, PD522 starting down from 33,000 ft at 200 s
  ws812: aircraft({ tag: 'ws812', alt: 17000, spd: 260, segs: [{ until: 1e9, vs: -1000, level: 1500, ds: -0.03, turn: 0.1 }] }),
  pd522: aircraft({ tag: 'pd522', alt: 33000, spd: 455, segs: [{ until: 200, vs: 0, level: 33000 }, { until: 1e9, vs: -1500, level: 4000, ds: -0.04 }] }),
  taxi: aircraft({ tag: 'taxi', alt: 0, spd: 0, segs: [{ until: 1e9, ground: true, spd: 14 }] }),
  climb: aircraft({ tag: 'climb', alt: 4000, spd: 260, segs: [{ until: 1e9, vs: 2200, level: 33000, ds: 0.05 }] }),
  cruise: aircraft({ tag: 'cruise', alt: 37000, spd: 470, segs: [{ until: 1e9, vs: 0, level: 37000 }] }),
  approach: aircraft({ tag: 'approach', alt: 9000, spd: 210, segs: [{ until: 1e9, vs: -800, level: 600, ds: -0.04, turn: 0.3 }] }),
  // low, on its way down (the previous aircraft of the shared-callsign replays)
  low: aircraft({ tag: 'low', alt: 7000, spd: 230, segs: [{ until: 1e9, vs: -700, level: 1200, ds: -0.03 }] }),
  // high, starting down from 31,500 ft at 100 s (the new aircraft of those replays)
  high: aircraft({ tag: 'high', alt: 31500, spd: 450, segs: [{ until: 100, vs: 0, level: 31500 }, { until: 1e9, vs: -900, level: 9000, ds: -0.03 }] })
};
const row = (flight, extra) => Object.assign(flight ? { flight } : {}, extra || {});
const pollSeconds = (secs) => { const a = []; for (let s = 2; s <= secs; s += 60) a.push(s); return a; };
// a swap second clear of every poll's answer
function clearOfPolls(R, lo, hi, lat) {
  for (;;) {
    const s = lo + Math.floor(R() * (hi - lo));
    if (pollSeconds(hi + 60).every((p) => s < p || s > p + lat + 1)) return s;
  }
}

// ═══ the texts ═════════════════════════════════════════════════════════════
test('text: every reading that reaches the anchor says whose it is, except the render\'s own', () => {
  // the render's (in _buildV2MapCol) is read from this aircraft's own sources,
  // and the gate render names the aircraft (window._gateTelemOwner) just before it
  const calls = [...CORE.matchAll(/_gateTelemSetReal\(([^;{}]*)\);/g)];
  const render = CORE.indexOf('\nfunction _buildV2MapCol(');
  const renderEnd = CORE.indexOf('\nfunction ', render + 10);
  const untold = calls.filter((m) => m[1].split(',').length < 3);
  assert.equal(untold.length, 1, 'one call without whose: ' + untold.map((m) => m[0]).join(' '));
  assert.ok(untold[0].index > render && untold[0].index < renderEnd, 'and it is the render\'s');
  assert.ok(calls.length >= 6, 'the poll\'s four, the direct lookup\'s and the render\'s');
  // the departure-change wipe and _gateTelemReset are the only whole-object writes after the first state
  assert.equal((CORE.match(/window\._gateTelemAnim = \{/g) || []).length, 2, 'the wipe and _gateTelemReset');
  assert.equal((CORE.match(/window\._gateTelemAnim = window\._gateTelemAnim \|\| \{/g) || []).length, 1, 'the first state');
});

test('text: the new pieces ask for nothing and change no interval', () => {
  for (const n of NEW_FNS) {
    const s = text(n, CORE).replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(s, /fetch\(|XMLHttpRequest|_adsbTelemetry\(|_adsbFetchOne\(|_adsbCached\(|loadFlight\(|setTimeout|setInterval|requestGateRebuild|render\(/, n);
  }
  const pre = text('GATE_PRE', CORE).replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(pre, /fetch\(|_adsb|loadFlight\(|setTimeout|setInterval|render\(/, 'the gate render\'s new lines');
});

// ═══ the helpers, rule by rule ═════════════════════════════════════════════
function unit() {
  const win = { _gateTelemAnim: INIT() };
  let now = T0;
  class D extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const S = scope(stubs({ win, doc: { querySelectorAll: () => [], getElementById: () => null }, Date: D, fetch: () => new Promise(() => {}),
    forced: () => {}, rebuild: () => {}, feed: () => null, plausible: () => true }));
  const B = factory('now')(S);
  return { B, S, win, tick(n) { for (let i = 0; i < (n || 1); i++) { now += 1000; B._animateGateTelem(); } }, step(ms) { now += ms; } };
}
const H = 3600000;

test('whose: the flight number (spaces and case ignored), else the tail, with the scheduled time', () => {
  const { B } = unit();
  const id = (o) => idStr(B._gateTelemId(o));
  assert.equal(id({ flight: 'ws 812', _sortTs: 5 }), 'WS812@5');
  assert.equal(id('Pd522'), 'PD522@0');
  assert.equal(id({ flight: 'AC644', _reg: 'C-FJZS' }), 'AC644@0', 'a flight number names the leg; the tail is not used then');
  assert.equal(id({ _reg: 'c-gkqe' }), '~C-GKQE@0', 'a row known only by its tail');
  assert.equal(id({ registration: 'C-GKQE' }), '~C-GKQE@0');
  assert.equal(id({}), null, 'neither: nobody');
  assert.equal(id(null), null);
  assert.equal(id(''), null);
  const w = B._gateTelemId({ flight: 'PD522' });
  assert.equal(B._gateTelemId(w), w, 'an id is itself');
  const same = (a, b) => B._gateTelemSame(B._gateTelemId(a), B._gateTelemId(b));
  assert.ok(same({ flight: 'AC644', _sortTs: T0 }, { flight: 'ac 644', _sortTs: T0 + 40 * 60000 }), 'one leg as two sources time it');
  assert.ok(same({ flight: 'AC644', _sortTs: T0 }, 'AC644'), 'a flight number alone: that flight');
  assert.ok(!same({ flight: 'AC644', _sortTs: T0 - 24 * H }, { flight: 'AC644', _sortTs: T0 }), 'yesterday\'s and today\'s');
  assert.ok(!same({ flight: 'AC644' }, { flight: 'AC7992' }));
  assert.ok(!same({ flight: 'AC644', _reg: 'C-FJZS' }, { _reg: 'C-FJZS' }), 'a flight and a tail-only row: the gate\'s two inbounds (_newInbId)');
  assert.ok(!same({ _reg: 'C-GAAA' }, { _reg: 'C-GKQE' }));
  assert.ok(same(null, { flight: 'AC644' }) && same({ flight: 'AC644' }, {}), 'nobody is anyone (as before)');
});

test('the state: nobody\'s is adopted as it stands, another aircraft\'s is replaced whole, holds and all', () => {
  const u = unit();
  u.B._gateTelemSetReal(300, 9000);
  const T = u.win._gateTelemAnim;
  assert.equal(u.B._gateTelemFor('WS812'), T, 'the same object');
  assert.equal(idStr(T.who), 'WS812@0');
  assert.equal(T.realAlt, 9000, 'its reading kept');
  assert.equal(u.B._gateTelemFor({ flight: 'WS812', _sortTs: T0 }), T, 'still its own');
  u.step(60000);
  u.B._gateTelemSetReal(290, 8000, 'WS812');
  assert.equal(T.prevAlt, 9000);
  u.win._gateTelemHold = { key: 'WS812', spd: 290, alt: 8000, ts: T0 };
  u.S._gateFixCache = { key: 'WS812', alt: 8000, spd: 290, ts: T0 };
  const N = u.B._gateTelemFor('PD522');
  assert.notEqual(N, T, 'a new object');
  assert.equal(u.win._gateTelemAnim, N);
  assert.deepEqual(Object.assign({}, N, { who: idStr(N.who) }), Object.assign(INIT(), { who: 'PD522@0' }), 'the first state, owned');
  assert.equal(u.win._gateTelemHold, null, 'the render\'s 3-minute hold goes with it');
  assert.equal(u.S._gateFixCache, null, 'and its sticky fix');
  assert.equal(u.B._gateTelemFor(null), N, 'nobody: whatever is there');
  assert.equal(u.B._gateTelemFor({}), N);
  // the same aircraft, now with its scheduled time; then another leg under the same number
  assert.equal(u.B._gateTelemFor({ flight: 'PD522', _sortTs: T0 }), N, 'a flight number alone and its timed row: one aircraft');
  assert.equal(idStr(N.who), 'PD522@' + T0, 'named with the time from then on');
  const L = u.B._gateTelemFor({ flight: 'PD522', _sortTs: T0 + 24 * H });
  assert.notEqual(L, N, 'another leg starts from nothing');
});

test('the anchor: a reading for another aircraft than the gate\'s is dropped; otherwise as before', () => {
  const u = unit();
  u.win._gateTelemOwner = u.B._gateTelemId({ flight: 'PD522', _sortTs: T0 });
  u.B._gateTelemSetReal(455, 31000, { flight: 'PD522', _sortTs: T0 });
  const T = u.win._gateTelemAnim;
  u.step(5000);
  u.B._gateTelemSetReal(250, 9000, { flight: 'WS812' });
  u.B._gateTelemSetReal(250, 9000, { flight: 'PD522', _sortTs: T0 - 24 * H });
  assert.equal(u.win._gateTelemAnim, T, 'the late answers change nothing');
  assert.deepEqual([T.realSpd, T.realAlt, T.prevAlt], [455, 31000, undefined]);
  u.B._gateTelemSetReal(null, null, 'WS812');
  assert.equal(T.realAlt, 31000, 'nor does a "nothing" for another');
  u.step(60000);
  u.B._gateTelemSetReal(450, 30000, 'pd 522');
  assert.deepEqual([T.realAlt, T.prevAlt], [30000, 31000], '"pd 522" is PD522');
  // no aircraft on the screen: another aircraft's reading starts from nothing
  u.win._gateTelemOwner = null;
  u.B._gateTelemSetReal(250, 9000, 'WS812');
  const N = u.win._gateTelemAnim;
  assert.notEqual(N, T);
  assert.deepEqual([idStr(N.who), N.realAlt, N.prevAlt, N.alt], ['WS812@0', 9000, undefined, 9000]);
  // no `who` at all: the anchor on whatever is there, as before
  u.step(30000);
  u.B._gateTelemSetReal(240, 8500);
  assert.deepEqual([N.realAlt, N.prevAlt], [8500, 9000]);
});

test('the live position: one written for another aircraft is not this one\'s; for nobody, as before', () => {
  const { B, win } = unit();
  const lp = { speed: 250, altitude: 9000, fl: 'WS812', who: B._gateTelemId({ flight: 'WS812', _sortTs: T0 }) };
  win._gateInboundLivePos = lp;
  assert.equal(B._gateLivePosFor({ flight: 'PD522' }), null);
  assert.equal(B._gateLivePosFor({ flight: 'WS812', _sortTs: T0 - 24 * H }), null, 'another leg');
  assert.equal(B._gateLivePosFor({ _reg: 'C-GKQE' }), null, 'a tail-only row is another inbound');
  assert.equal(B._gateLivePosFor({ flight: 'ws 812', _sortTs: T0 + 60000 }), lp);
  assert.equal(B._gateLivePosFor('WS812'), lp);
  assert.equal(B._gateLivePosFor({}), lp, 'a row nobody can name: as before');
  win._gateInboundLivePos = { speed: 250, altitude: 9000, fl: 'WS812' };
  assert.equal(B._gateLivePosFor({ flight: 'PD522' }), win._gateInboundLivePos, 'written for nobody: as before');
  win._gateInboundLivePos = null;
  assert.equal(B._gateLivePosFor({ flight: 'PD522' }), null);
});

test('the model\'s ground test: this aircraft\'s own position and row only', () => {
  const air = (u) => { u.win._gateTelemOwner = u.B._gateTelemId('PD522'); u.B._gateTelemSetReal(455, 31000, 'PD522'); return u.win._gateTelemAnim; };
  const lp = (u, fl, g) => ({ onGround: g, fl, who: u.B._gateTelemId(fl) });
  { const u = unit(); const T = air(u); u.win._gateInboundLivePos = lp(u, 'WS812', true); u.tick(10); assert.equal(Math.round(T.alt), 31000, 'another\'s position on the ground'); }
  { const u = unit(); const T = air(u); u.win._gateInboundLivePos = lp(u, 'PD522', true); u.tick(10); assert.ok(T.alt < 31000 * 0.1, 'its own: eases to 0 (v24066\'s rule)'); }
  { const u = unit(); const T = air(u); u.win._gateInboundLivePos = { onGround: true }; u.tick(10); assert.ok(T.alt < 31000 * 0.1, 'nobody\'s: as before'); }
  { const u = unit(); const T = air(u); u.win._gateInbound = { flight: 'WS812', _liveOnGround: true }; u.tick(10); assert.equal(Math.round(T.alt), 31000, 'another\'s row'); }
  { const u = unit(); const T = air(u); u.win._gateInbound = { _reg: 'C-GKQE', _liveOnGround: true }; u.tick(10); assert.equal(Math.round(T.alt), 31000, 'a tail-only row'); }
  { const u = unit(); const T = air(u); u.win._gateInbound = { flight: 'pd 522', _liveOnGround: true }; u.tick(10); assert.ok(T.alt < 31000 * 0.1, 'its own row'); }
  { const u = unit(); const T = air(u); u.win._gateInbound = { _liveOnGround: true }; u.tick(10); assert.ok(T.alt < 31000 * 0.1, 'a row nobody can name: as before'); }
  { const u = unit(); u.B._gateTelemSetReal(455, 31000); const T = u.win._gateTelemAnim; u.win._gateInboundLivePos = lp(u, 'WS812', true); u.tick(10); assert.ok(T.alt < 31000 * 0.1, 'a state nobody owns: as before'); }
});

// ═══ (a) no swap: the baseline, every second ═══════════════════════════════
function randomProfile(R) {
  const r = (a, b) => a + R() * (b - a);
  switch (Math.floor(R() * 7)) {
    case 0: return aircraft({ alt: Math.round(r(28000, 39000)), spd: Math.round(r(420, 490)), segs: [{ until: 1e9, vs: 0, level: Math.round(r(28000, 39000)) }] });
    case 1: return aircraft({ alt: Math.round(r(18000, 36000)), spd: Math.round(r(380, 470)), segs: [{ until: Math.round(r(-600, 200)), vs: 0, level: 36000 }, { until: 1e9, vs: -Math.round(r(900, 2600)), level: Math.round(r(3000, 12000)), ds: -r(0, 0.08) }] });
    case 2: return aircraft({ alt: Math.round(r(2000, 16000)), spd: Math.round(r(220, 320)), segs: [{ until: 1e9, vs: Math.round(r(900, 2600)), level: Math.round(r(22000, 38000)), ds: r(0, 0.1) }] });
    case 3: return aircraft({ alt: Math.round(r(2500, 7000)), spd: Math.round(r(160, 230)), segs: [{ until: Math.round(r(120, 400)), vs: -Math.round(r(600, 1000)), level: 0, ds: -0.05, turn: r(0, 0.5) }, { until: 1e9, ground: true, spd: 20 }] });
    case 4: return aircraft({ alt: 0, spd: 0, segs: [{ until: 1e9, ground: true, spd: Math.round(r(0, 25)) }] });
    case 5: return aircraft({ alt: 0, spd: 0, segs: [{ until: Math.round(r(-200, 250)), ground: true, spd: 15 }, { until: 1e9, vs: Math.round(r(1500, 3000)), level: 30000, ds: 0.4 }] });
    default: return aircraft({ alt: Math.round(r(6000, 12000)), spd: Math.round(r(210, 260)), segs: [{ until: 1e9, vs: 0, level: Math.round(r(6000, 12000)), turn: 3 }] });
  }
}
function randomLoad(seed) {
  const R = rng(seed * 7919 + 13);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const secs = 360 + Math.floor(R() * 241);
  const sc = { secs, lag: 1 + Math.floor(R() * 12), lat: Math.floor(R() * 7), pk: Math.floor(R() * 176), refreshEvery: pick([0, 15, 30, 45, 60]),
    dep: 'XX900', rows: {}, planes: {}, plan: [[0, 'A']], status: [], direct: [], regLookup: [], refresh: [] };
  const tr = randomProfile(R);
  // the departure is flown by the same aircraft: the poll looks it up for a row
  // with no flight number, and while the gate has no inbound
  sc.planes.XX900 = tr; sc.planes.XX902 = tr;
  const kind = R();
  if (kind < 0.08) { sc.rows.A = { _reg: 'C-GKQE' }; sc.planes['C-GKQE'] = tr; }
  else if (kind < 0.12) sc.rows.A = {};                       // neither a flight number nor a tail
  else {
    const fl = pick(['WS812', 'PD522', 'AC644', 'ac 644', 'Ws812', 'TS 101', 'F8 2290', 'PD2381']);
    sc.rows.A = { flight: fl, _callSign: R() < 0.3 ? 'JZA' + Math.floor(R() * 9000 + 100) : undefined };
    if (!sc.rows.A._callSign) delete sc.rows.A._callSign;
    sc.planes[keyOf(fl)] = tr;
    if (R() < 0.12) sc.rows.A._depTs = T0 + (20 * 60 + Math.floor(R() * secs)) * 1000;   // a fix on a previous leg, until then
  }
  // a gate with no inbound yet
  if (R() < 0.1) sc.plan = [[0, null], [5 + Math.floor(R() * 120), 'A']];
  // the inbound flapping to none and back (the gate keeps the last known inbound)
  const flaps = Math.floor(R() * 3);
  for (let i = 0; i < flaps; i++) { const a = 130 + Math.floor(R() * (secs - 190)); sc.plan.push([a, null], [a + 1 + Math.floor(R() * 40), 'A']); }
  sc.plan.sort((x, y) => x[0] - y[0]);
  // the feed rebuilding the row: a new object, the same leg (its time as another source gives it, a tail learned)
  for (let i = 0; i < Math.floor(R() * 3); i++) {
    const p = {};
    if (R() < 0.6) p._sortTs = T0 + 45 * 60000 + Math.round((R() - 0.5) * 60) * 60000;
    if (sc.rows.A.flight && R() < 0.3) p._reg = 'C-FABC';
    sc.refresh.push([1 + Math.floor(R() * secs), 'A', p]);
  }
  if (R() < 0.25) sc.status.push([30 + Math.floor(R() * (secs - 30)), 'A', pick(['Arrived', 'Landed 14:09', 'Delayed'])]);
  if (R() < 0.08) sc.depPlan = [[60 + Math.floor(R() * (secs - 60)), 'XX902']];
  if (R() < 0.2) { const q0 = Math.floor(R() * secs), q1 = q0 + 60 + Math.floor(R() * 240); sc.quiet = (id, t) => t >= q0 && t < q1; }
  if (sc.rows.A.flight && R() < 0.3) for (let i = 0; i < 1 + Math.floor(R() * 3); i++) {
    const at = Math.floor(R() * secs), f = tr(at - 30);
    sc.direct.push([at, 'A', f.ground ? 0 : f.spd, f.ground ? 0 : f.alt]);
  }
  if (R() < 0.15) for (let i = 0; i < 1 + Math.floor(R() * 2); i++) {
    const at = Math.floor(R() * secs), f = tr(at - 60);
    sc.regLookup.push([at, 'A', R() < 0.5 ? { spd: f.spd, alt: f.alt, lat: f.lat, lng: f.lon } : { lat: f.lat, lng: f.lon }]);
  }
  // the schedule lookup's position, used when FR24 has nothing; fixes that are not this leg
  if (sc.rows.A.flight && R() < 0.25) { const lagF = 30 + Math.floor(R() * 200); sc.feed = { [keyOf(sc.rows.A.flight)]: (t) => { const f = tr(t - lagF); return { speed: f.spd, alt: f.ground ? 0 : f.alt, lat: f.lat, lng: f.lon }; } }; }
  if (sc.rows.A.flight && R() < 0.06) sc.implausible = [keyOf(sc.rows.A.flight)];
  return sc;
}

test('(a) no swap: 1,200 random loads are the baseline\'s every second, with the same FR24 calls', async () => {
  let seconds = 0, shown = 0, moved = 0, owned = 0;
  for (let seed = 1; seed <= 1200; seed++) {
    const sc = randomLoad(seed);
    const a = await replay('off', sc), b = await replay('now', sc);
    assert.deepEqual(diff(a, b, ALL).slice(0, 3), [], 'seed ' + seed);
    assert.equal(b.fr24, a.fr24, 'FR24 calls, seed ' + seed);
    assert.equal(b.edge, a.edge, 'Worker requests, seed ' + seed);
    seconds += b.rows.length;
    shown += b.rows.filter((r) => r.vis).length;
    owned += b.rows.filter((r) => r.who).length;
    if (b.rows.some((r, i) => i && r.vis && b.rows[i - 1].vis && r.ft !== b.rows[i - 1].ft)) moved++;
  }
  // what was compared: 576,219 seconds, 368,114 of them with digits on the
  // screen and 546,681 with the state owned, on 554 loads the digits move
  // (measured; the last three kept as floors)
  assert.equal(seconds, 576219, 'seconds compared');
  assert.ok(shown >= 368000, 'seconds with digits: ' + shown);
  assert.ok(owned >= 546000, 'seconds the state was owned: ' + owned);
  assert.ok(moved >= 550, 'loads whose digits move: ' + moved);
  assert.deepEqual([...MISSING], [], 'every free name the lifted code reads is stubbed');
});

// ═══ (b) the swaps: the oracle's, every second ═════════════════════════════
function swapCase(R, A, B, extra) {
  const lat = Math.floor(R() * 5), at = clearOfPolls(R, 130, 420, lat);
  const planes = Object.assign({}, A.planes || { [keyOf(A.flight)]: A.tr }, B.planes || { [keyOf(B.flight)]: B.tr });
  return Object.assign({ secs: at + 300, lag: 1 + Math.floor(R() * 10), lat, pk: Math.floor(R() * 170), refreshEvery: [0, 15, 30, 60][Math.floor(R() * 4)],
    dep: 'WS813', rows: { A: row(A.flight, A.row), B: row(B.flight, B.row) }, planes,
    plan: [[0, 'A'], [at, 'B']], freshAt: [at], at }, extra || {});
}
async function checkSwap(sc, tag, whoB) {
  const a = await replay('off', sc), b = await replay('now', sc), o = await replay('oracle', sc);
  assert.deepEqual(diff(a, b, ALL, 0, sc.at), [], tag + ': the baseline\'s before the swap');
  assert.deepEqual(diff(o, b, DIGITS).slice(0, 3), [], tag + ': the oracle\'s, every second');
  assert.equal(b.fr24, a.fr24, tag + ': FR24 calls'); assert.equal(o.fr24, a.fr24, tag + ': FR24 calls (oracle)');
  assert.equal(b.edge, a.edge, tag + ': Worker requests');
  for (let i = sc.at; i < b.rows.length; i++) if (b.rows[i].realTs) assert.equal(b.rows[i].who, whoB || (keyOf(sc.rows[b.rows[i].cur].flight) + '@' + (T0 + 45 * 60000)), tag + ': whose at ' + i);
  return { a, b, o };
}
const SWAPS = {
  'airborne to airborne': [{ flight: 'WS812', tr: P.ws812 }, { flight: 'PD522', tr: P.pd522 }],
  'airborne to airborne (climbing)': [{ flight: 'PD522', tr: P.pd522 }, { flight: 'TS101', tr: P.climb }],
  'on the ground to airborne': [{ flight: 'AC644', tr: P.taxi }, { flight: 'PD522', tr: P.pd522 }],
  'on the ground to airborne (cruise)': [{ flight: 'AC644', tr: P.taxi }, { flight: 'F82290', tr: P.cruise }],
  'airborne to on the ground': [{ flight: 'WS812', tr: P.ws812 }, { flight: 'AC644', tr: P.taxi }],
  'airborne to on the ground (approach)': [{ flight: 'PD522', tr: P.approach }, { flight: 'AC 644', tr: P.taxi }]
};

test('(b) the swaps: every second is the oracle\'s; the baseline shows the previous aircraft\'s numbers', async () => {
  for (const [name, [A, B]] of Object.entries(SWAPS)) {
    let wrong = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sc = swapCase(rng(seed * 104729 + name.length), A, B);
      const { a, o } = await checkSwap(sc, name + ' seed ' + seed);
      if (diff(o, a, SCREEN, sc.at).length) wrong++;
    }
    // the replays reproduce the bug: on every one, the baseline's screen is off the oracle's after the swap
    assert.equal(wrong, 40, name + ': the baseline\'s screen off the oracle\'s after the swap');
  }
});

// rows known only by their tail: the poll looks up the departure on their
// behalf (the Worker answers it from whichever aircraft flies it now)
const TAILS = {
  'a flight to a row known only by its tail': (R) => {
    const A = { flight: 'WS812', tr: P.ws812 }, B = { row: { _reg: 'C-GKQE' }, planes: { 'C-GKQE': P.pd522, WS813: P.pd522 } };
    return swapCase(R, A, B);
  },
  'a row known only by its tail to another': (R) => {
    const A = { row: { _reg: 'C-GAAA' }, planes: { 'C-GAAA': P.ws812, WS813: P.ws812 } }, B = { row: { _reg: 'C-GKQE' }, planes: { 'C-GKQE': P.pd522 } };
    const sc = swapCase(R, A, B);
    sc.switchAt = { WS813: [sc.at, P.pd522] };
    return sc;
  },
  'a row known only by its tail to a flight': (R) => {
    const A = { row: { _reg: 'C-GAAA' }, planes: { 'C-GAAA': P.taxi, WS813: P.taxi } }, B = { flight: 'PD522', tr: P.pd522 };
    return swapCase(R, A, B);
  }
};

test('(b) rows known only by their tail: every second is the oracle\'s; the baseline shows the previous aircraft\'s numbers', async () => {
  for (const [name, mk] of Object.entries(TAILS)) {
    let wrong = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sc = mk(rng(seed * 5023 + name.length));
      const whoB = sc.rows.B.flight ? null : '~' + sc.rows.B._reg + '@' + (T0 + 45 * 60000);
      const { a, o } = await checkSwap(sc, name + ' seed ' + seed, whoB);
      if (diff(o, a, SCREEN, sc.at).length) wrong++;
    }
    assert.equal(wrong, 40, name + ': the baseline\'s screen off the oracle\'s after the swap');
  }
});

test('(b) the swap the fix comes from: WS812\'s 9,000 ft is not PD522\'s, and PD522\'s digits do not climb', async () => {
  // PD522 descending at 1,500 ft/min from 31,000 ft; the gate was showing WS812 at about 9,000 ft
  const sc = { secs: 600, lag: 5, lat: 2, pk: 60, refreshEvery: 30, dep: 'WS813', at: 260,
    rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 }, plan: [[0, 'A'], [260, 'B']], freshAt: [260] };
  const { a, b } = await checkSwap(sc, 'WS812 to PD522');
  const after = (r) => r.rows.slice(sc.at).filter((x) => x.vis);
  // the baseline: PD522's panel showed WS812's altitude, then climbed while PD522 descended
  assert.ok(after(a).some((x) => x.ft < 12000), 'the baseline shows WS812\'s altitude on PD522\'s panel');
  const rises = (r) => after(r).filter((x, i, arr) => i && x.ft > arr[i - 1].ft).length;
  assert.ok(rises(a) > 30, 'the baseline climbs PD522\'s digits: ' + rises(a) + ' rising seconds');
  // this build: PD522's own numbers, and they never rise
  assert.ok(after(b).length > 200, 'PD522\'s digits show');
  assert.ok(after(b).every((x) => x.ft > 20000), 'never WS812\'s altitude');
  assert.equal(rises(b), 0, 'never climbing');
});

test('(b) on the ground to airborne: the previous aircraft\'s "on the ground" does not ease the new one\'s altitude toward 0 ft', async () => {
  const sc = { secs: 500, lag: 4, lat: 1, pk: 30, refreshEvery: 0, dep: 'WS813', at: 185,
    rows: { A: row('AC644'), B: row('PD522') }, planes: { AC644: P.taxi, PD522: P.pd522 }, plan: [[0, 'A'], [185, 'B']], freshAt: [185] };
  const { a, b } = await checkSwap(sc, 'AC644 to PD522');
  // until PD522's own poll (242 s) the shared position is AC644's, on the ground
  const window_ = (r) => r.rows.slice(sc.at, 242).filter((x) => x.vis);
  assert.ok(window_(b).length > 40, 'PD522\'s digits show before its own poll');
  assert.ok(window_(a).some((x) => x.ft < 5000), 'the baseline eases them toward 0 ft: ' + Math.min(...window_(a).map((x) => x.ft)));
  assert.ok(window_(b).every((x) => x.ft > 25000), 'this build holds PD522\'s own: ' + Math.min(...window_(b).map((x) => x.ft)));
});

test('(b) airborne to on the ground: the aircraft on the ground shows no airborne numbers', async () => {
  for (let seed = 1; seed <= 20; seed++) {
    const sc = swapCase(rng(seed * 31 + 7), { flight: 'WS812', tr: P.ws812 }, { flight: 'AC644', tr: P.taxi });
    const { a, b } = await checkSwap(sc, 'WS812 to AC644 seed ' + seed);
    assert.ok(b.rows.slice(sc.at).every((x) => !x.vis), 'no digits on the aircraft on the ground, seed ' + seed);
    if (seed === 1) assert.ok(a.rows.slice(sc.at).some((x) => x.vis && x.ft > 1000), 'the baseline showed WS812\'s');
  }
});

test('(b) a swap back to the first aircraft: it starts from nothing again, with its own numbers', async () => {
  let wrong = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const R = rng(seed * 7 + 3), lat = Math.floor(R() * 4);
    const s1 = clearOfPolls(R, 130, 300, lat);
    const s2 = clearOfPolls(R, s1 + 80, s1 + 200, lat);   // the second aircraft has polled in between
    const sc = { secs: s2 + 240, lag: 1 + Math.floor(R() * 8), lat, pk: Math.floor(R() * 170), refreshEvery: [0, 30][Math.floor(R() * 2)], dep: 'WS813', at: s1,
      rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 }, plan: [[0, 'A'], [s1, 'B'], [s2, 'A']], freshAt: [s1, s2] };
    const { a, b, o } = await checkSwap(sc, 'A to B to A, seed ' + seed);
    assert.ok(b.rows[s2].lp && JSON.parse(b.rows[s2].lp).fl === 'PD522', 'the second aircraft had polled before the swap back, seed ' + seed);
    if (diff(o, a, SCREEN, s2).length) wrong++;
  }
  assert.equal(wrong, 30, 'the baseline\'s screen off the oracle\'s after the swap back');
});

test('(b) through a gap with no inbound: what the poll brought for the one before during the gap is not the next one\'s', async () => {
  // The gate loses its inbound for a while (it keeps the last one, WS812, and
  // the poll keeps looking it up), then PD522 arrives for the same departure.
  let wrong = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const R = rng(seed * 733 + 4), lat = Math.floor(R() * 4);
    const g0 = clearOfPolls(R, 130, 260, lat);
    const g1 = pollSeconds(g0 + 120).find((p) => p > g0) + lat + 2 + Math.floor(R() * 30);   // a poll for WS812 ran in the gap
    const sc = { secs: g1 + 240, lag: 1 + Math.floor(R() * 8), lat, pk: Math.floor(R() * 170), refreshEvery: [0, 30][Math.floor(R() * 2)], dep: 'WS813', at: g1,
      rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 },
      plan: [[0, 'A'], [g0, null], [g1, 'B']], freshAt: [g1] };
    const { a, b, o } = await checkSwap(sc, 'gap, seed ' + seed);
    assert.equal(b.rows[g1 - 1].lpWho, 'WS812@' + (T0 + 45 * 60000), 'the gap\'s position is WS812\'s, seed ' + seed);
    if (diff(o, a, SCREEN, g1).length) wrong++;
  }
  assert.equal(wrong, 30, 'the baseline shows WS812\'s numbers on PD522');
});

test('(b) across a departure change: an answer for the inbound before it does not reach the next inbound', async () => {
  // The departure changes while the poll's answer for its inbound (WS812) is on
  // its way; the next departure has no inbound yet, then gets PD522 before the
  // next poll. The departure-change wipe ran (in the baseline too), and then the
  // late answer anchored WS812's numbers on the fresh state, so PD522's first
  // reading was paired with it.
  let wrong = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const R = rng(seed * 421 + 9);
    const latA = 6 + Math.floor(R() * 10), p = pollSeconds(400)[2 + Math.floor(R() * 3)];
    const s1 = p + 1 + Math.floor(R() * (latA - 2));          // the departure changes while WS812's answer is on its way
    const s2 = p + latA + 1 + Math.floor(R() * 20);           // PD522 arrives on the next departure before the next poll
    const sc = { secs: s2 + 240, lag: 1 + Math.floor(R() * 6), lat: Math.floor(R() * 3), latFor: { WS812: latA }, pk: Math.floor(R() * 170),
      refreshEvery: [0, 30][Math.floor(R() * 2)], dep: 'WS813', depPlan: [[s1, 'WS815']], at: s2,
      rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 },
      plan: [[0, 'A'], [s1, null], [s2, 'B']], freshAt: [s2] };
    assert.ok(s2 < p + 60, 'before the next poll, seed ' + seed);
    const { a, b, o } = await checkSwap(sc, 'departure change, seed ' + seed);
    assert.ok(a.rows[s2 - 1].realAlt != null && b.rows[s2 - 1].who === 'WS812@' + (T0 + 45 * 60000), 'WS812\'s late answer had anchored, seed ' + seed);
    if (diff(o, a, DIGITS, s2).length) wrong++;
  }
  assert.equal(wrong, 30, 'the baseline pairs PD522\'s first reading with WS812\'s');
});

// ═══ (b') shared names: every reading the new aircraft is anchored on is its own ═
// Two inbound rows can share a callsign or a tail (one of them stale in the
// feed), or a flight number (two legs: yesterday's late one and today's). The
// cache of FR24 answers finds an answer under any of them, so the render read
// the previous aircraft's answer as the new one's. No oracle here: the answer
// under the shared name also holds back the render's own lookup (in the
// baseline as in this build: it is the cache's), so this build has no reading
// for the new aircraft until its own poll, with the same FR24 calls; and the
// poll does not repaint the gate (it never has), so its digits appear at the
// next rebuild of the gate after that (here, the feed revising the arrival
// time every etaEvery s from the swap). The replays check that until then nothing shows,
// that from then on its own digits show, that every reading anchored after
// the swap was measured on the new aircraft, that its digits never show the
// previous one's or climb while it descends, and that the baseline's do.
function readingsOf(r, tag) { return new Set(r.served.filter((x) => x.tag === tag).map((x) => x.spd + '/' + x.alt)); }
async function checkShared(sc, tag, tagB, lo) {
  const a = await replay('off', sc), b = await replay('now', sc);
  assert.deepEqual(diff(a, b, ALL, 0, sc.at), [], tag + ': the baseline\'s before the swap');
  assert.equal(b.fr24, a.fr24, tag + ': FR24 calls'); assert.equal(b.edge, a.edge, tag + ': Worker requests');
  assert.ok(!b.paths.has('callsign'), tag + ': no lookup by callsign (the flight number answers)');
  const mine = readingsOf(b, tagB), swapTs = T0 + sc.at * 1000;
  const anchors = [];
  let first = -1;
  for (let i = sc.at; i < b.rows.length; i++) {
    const r = b.rows[i];
    if (r.realTs >= swapTs && (i === sc.at || r.realTs !== b.rows[i - 1].realTs) && r.realAlt != null) { anchors.push(r.realSpd + '/' + r.realAlt); if (first < 0) first = i; }
    if (r.prevTs) assert.ok(r.prevTs >= swapTs, tag + ': the reading before is the new aircraft\'s too, at ' + i);
  }
  assert.ok(first > 0, tag + ': anchored on its own reading');
  for (const x of anchors) assert.ok(mine.has(x), tag + ': ' + x + ' was measured on the new aircraft');
  // nothing on the panel until then; its own digits from the first rebuild after it
  assert.ok(b.rows.slice(sc.at, first).every((x) => !x.vis), tag + ': nothing shows before its own reading');
  const rebuilt = b.renders.find((x) => x > first);
  assert.ok(rebuilt != null, tag + ': the gate is rebuilt after it');
  const paintAt = Math.ceil(rebuilt);
  assert.ok(b.rows.slice(paintAt).every((x) => x.vis), tag + ': its digits show from ' + paintAt);
  const shown = b.rows.slice(sc.at).filter((x) => x.vis);
  assert.ok(shown.every((x) => x.ft >= lo), tag + ': never the previous aircraft\'s altitude: ' + Math.min(...shown.map((x) => x.ft)));
  assert.equal(shown.filter((x, i) => i && x.ft > shown[i - 1].ft).length, 0, tag + ': never climbing while it descends');
  return { a, b, first, paintAt };
}
const SHARED = {
  // the checker's replay: AC644 at about 5,000 ft, AC7992 descending from 31,500 ft, both rows JZA644
  'a callsign': { A: row('AC644', { _callSign: 'JZA644' }), B: row('AC7992', { _callSign: 'JZA644' }), planes: { AC644: P.low, AC7992: P.high } },
  'a tail': { A: row('AC644', { _reg: 'C-FJZS' }), B: row('AC7992', { _reg: 'C-FJZS' }), planes: { AC644: P.low, AC7992: P.high } },
  'a callsign, from an aircraft on the ground': { A: row('AC644', { _callSign: 'JZA644' }), B: row('AC7992', { _callSign: 'JZA644' }), planes: { AC644: P.taxi, AC7992: P.high } },
  // the poll stops for an arrived inbound; only the render's own lookup asks
  // for it then (here when its status changes shortly before the swap)
  'a callsign, from an aircraft that has arrived': { A: row('AC644', { _callSign: 'JZA644', status: 'Arrived' }), B: row('AC7992', { _callSign: 'JZA644' }), planes: { AC644: P.taxi, AC7992: P.high }, statusA: 'Arrived 14:02' },
  // two legs under one number: FR24's answer for it is the new leg's from the swap
  'a flight number (another leg)': { A: row('AC644', { _sortTs: T0 - 24 * H + 45 * 60000, _revTs: T0 + 30 * 60000 }), B: row('AC644'),
    planes: { AC644: P.low }, switchTo: P.high }
};
function sharedCase(c, R) {
  const lat = Math.floor(R() * 4), at = clearOfPolls(R, 150, 400, lat);
  const sc = { secs: at + 320, lag: 1 + Math.floor(R() * 8), lat, pk: Math.floor(R() * 170), refreshEvery: [0, 15, 30][Math.floor(R() * 3)],
    etaEvery: 60 + Math.floor(R() * 90), etaFrom: at, dep: 'WS813', rows: { A: c.A, B: c.B }, planes: c.planes, plan: [[0, 'A'], [at, 'B']], at };
  if (c.switchTo) sc.switchAt = { AC644: [at, c.switchTo] };
  // (more than 90 s after its first lookup, so it asks again; less than 90 s before the swap)
  if (c.statusA) sc.status = [[at - 10 - Math.floor(R() * 40), 'A', c.statusA]];
  return sc;
}

test('(b\') rows that share a callsign, a tail or a flight number: the new aircraft\'s own readings only', async () => {
  for (const [name, c] of Object.entries(SHARED)) {
    let wrong = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sc = sharedCase(c, rng(seed * 6007 + name.length));
      const { a, paintAt } = await checkShared(sc, name + ' seed ' + seed, 'high', 20000);
      const shownA = a.rows.slice(sc.at).filter((x) => x.vis);
      // the baseline: the previous aircraft's altitude on the new one's panel,
      // or digits that climb, or none where this build shows the new one's
      if (shownA.some((x) => x.ft < 20000) || shownA.some((x, i) => i && x.ft > shownA[i - 1].ft)
          || a.rows.slice(paintAt, paintAt + 100).every((x) => !x.vis)) wrong++;
    }
    assert.equal(wrong, 30, name + ': the baseline shows the previous aircraft\'s numbers (or hides the new one\'s)');
  }
});

test('(b\') the checker\'s replay: AC644 and AC7992 both JZA644, swap at 200 s', async () => {
  const sc = { secs: 400, lag: 4, lat: 1, pk: 40, refreshEvery: 15, etaEvery: 90, dep: 'WS813', at: 200,
    rows: { A: SHARED['a callsign'].A, B: SHARED['a callsign'].B }, planes: { AC644: P.low, AC7992: P.high },
    plan: [[0, 'A'], [200, 'B']] };
  const { a, b, first, paintAt } = await checkShared(sc, 'JZA644', 'high', 20000);
  const shownA = a.rows.slice(200).filter((x) => x.vis);
  assert.ok(shownA.some((x) => x.ft < 8000), 'the baseline shows AC644\'s altitude on AC7992: ' + Math.min(...shownA.map((x) => x.ft)));
  assert.ok(shownA.filter((x, i) => i && x.ft > shownA[i - 1].ft).length > 30, 'and climbs AC7992\'s digits');
  assert.deepEqual([first, paintAt], [243, 270], 'AC7992\'s own reading at its poll (242 s), on the panel at the next rebuild');
  assert.ok(b.rows.slice(200, 270).every((x) => !x.vis), 'nothing on the panel until then');
});

// ═══ (c) the previous aircraft's late answer ═══════════════════════════════
// The poll asked FR24 for the previous aircraft (A); the gate swapped to B
// while the answer was on its way, and B's own first answer came back first.
// Every second is the oracle's (the baseline given a fresh state at the swap,
// and A's answers from the swap on carrying nothing). The baseline is off it
// on every one: on the screen for an answer with numbers; for the poll's
// "nothing" (a fix on a previous leg, or not this leg) in the state under the
// digits (it cleared B's reading and its time).
test('(c) an answer for the previous aircraft landing after the swap is dropped', async () => {
  const cases = [
    ['airborne', { flight: 'WS812', tr: P.ws812 }, {}, SCREEN],
    ['on the ground', { flight: 'AC644', tr: P.taxi }, {}, SCREEN],
    ['a fix on a previous leg (the poll\'s "nothing")', { flight: 'WS812', tr: P.ws812 }, { depTs: true }, DIGITS],
    ['a fix not on this leg (the poll\'s "nothing")', { flight: 'WS812', tr: P.ws812 }, { implausible: true }, DIGITS]
  ];
  for (const [name, A, opt, off] of cases) {
    let wrong = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const R = rng(seed * 977 + name.length);
      const latB = Math.floor(R() * 3), latA = latB + 4 + Math.floor(R() * 8);
      const p = pollSeconds(400)[2 + Math.floor(R() * 4)];
      const at = p + 1 + Math.floor(R() * (latA - latB - 2));   // A's answer lands after B's first
      const sc = { secs: at + 240, lag: 1 + Math.floor(R() * 8), lat: latB, latFor: { [A.flight]: latA }, pk: Math.floor(R() * 170),
        refreshEvery: [0, 30][Math.floor(R() * 2)], dep: 'WS813', at,
        rows: { A: row(A.flight, opt.depTs ? { _depTs: T0 + (20 * 60 + at + 200) * 1000 } : {}), B: row('PD522') },
        planes: { [A.flight]: A.tr, PD522: P.pd522 }, implausible: opt.implausible ? [A.flight] : [],
        plan: [[0, 'A'], [at, 'B']], freshAt: [at], dropFrom: [[at, A.flight]] };
      const { a, b, o } = await checkSwap(sc, name + ' seed ' + seed);
      const first = b.rows.findIndex((x, i) => i >= at && x.realTs);
      assert.ok(first > 0 && first < p + latA, 'B\'s first reading before A\'s answer lands, seed ' + seed);
      assert.ok(b.pendingAt[at - 1].includes(A.flight), 'A\'s answer on its way at the swap, seed ' + seed);
      if (diff(o, a, off, at).length) wrong++;
    }
    assert.equal(wrong, 30, name + ': the baseline off the oracle after the late answer');
  }
});

test('(c) the schedule feed\'s position for the previous aircraft, landing after the swap, is dropped', async () => {
  // A has no FR24 answer, so the poll falls back to the schedule lookup's
  // position; the swap comes while A's FR24 lookup is on its way
  const fpos = (t) => { const f = P.ws812(t - 40); return { speed: f.spd, alt: f.alt, lat: f.lat, lng: f.lon }; };
  let wrong = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const R = rng(seed * 61 + 5);
    const latA = 6 + Math.floor(R() * 6), p = pollSeconds(400)[2 + Math.floor(R() * 4)];
    const at = p + 1 + Math.floor(R() * (latA - 3));
    const sc = { secs: at + 200, lag: 4, lat: 0, latFor: { WS812: latA }, pk: 0, refreshEvery: 30, dep: 'WS813', at,
      rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 }, quiet: (id) => id === 'WS812',
      feed: { WS812: fpos }, plan: [[0, 'A'], [at, 'B']] };
    const b = await replay('now', sc);
    const none = await replay('now', Object.assign({}, sc, { feedOff: [[p, 'WS812']] }));
    assert.deepEqual(diff(none, b, DIGITS), [], 'as if it had never come, seed ' + seed);
    assert.ok(b.rows[at + 5].vis, 'PD522\'s digits show, seed ' + seed);
    const a = await replay('off', sc);
    if (a.rows.slice(p + latA).some((x) => x.realAlt === fpos(p).alt)) wrong++;
  }
  assert.equal(wrong, 20, 'the baseline anchored WS812\'s feed position as PD522\'s');
  // and with PD522 quiet on FR24 for its first minute, its panel (rebuilt as
  // the feed revises its arrival time) would read that position
  let shownA = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const R = rng(seed * 67 + 2);
    const latA = 6 + Math.floor(R() * 6), p = pollSeconds(400)[2 + Math.floor(R() * 4)];
    const at = p + 1 + Math.floor(R() * (latA - 3));
    const sc = { secs: at + 200, lag: 4, lat: 0, latFor: { WS812: latA }, pk: 0, refreshEvery: 15, etaEvery: 10, etaFrom: at + 1, dep: 'WS813', at,
      rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 },
      quiet: (id, t) => id === 'WS812' || (id === 'PD522' && t < at + 50), feed: { WS812: fpos }, plan: [[0, 'A'], [at, 'B']] };
    const b = await replay('now', sc);
    const none = await replay('now', Object.assign({}, sc, { feedOff: [[p, 'WS812']] }));
    assert.deepEqual(diff(none, b, DIGITS), [], 'PD522 quiet: as if it had never come, seed ' + seed);
    const a = await replay('off', sc);
    if (a.rows.slice(p + latA, at + 50).some((x) => x.vis && x.ft < 15000)) shownA++;
  }
  assert.equal(shownA, 20, 'the baseline showed WS812\'s feed altitude on PD522\'s panel');
});

test('(c) the direct lookup\'s answer for the previous aircraft is dropped, before and after the new one\'s first reading', async () => {
  // before PD522's own first answer: the baseline anchors WS812's numbers as
  // PD522's, and PD522's panel reads WS812's position
  for (const lat of [0, 2, 4]) {
    const sc = { secs: 420, lag: 5, lat, pk: 60, refreshEvery: 30, dep: 'WS813', at: 200,
      rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 }, plan: [[0, 'A'], [200, 'B']], direct: [[203, 'A', 245, 8800]] };
    const b = await replay('now', sc);
    const none = await replay('now', Object.assign({}, sc, { direct: [] }));
    assert.deepEqual(diff(none, b, DIGITS), [], 'as if it had never come, lat ' + lat);
    const a = await replay('off', sc);
    assert.equal(a.rows[203].realAlt, 8800, 'the baseline anchored WS812\'s 8,800 ft as PD522\'s, lat ' + lat);
  }
  // after: the answer re-pairs the gate to the aircraft it was about (on the
  // ground) until the gate is rebuilt; PD522's digits are not eased toward 0 ft
  let wrong = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const R = rng(seed * 89 + 1);
    const at = clearOfPolls(R, 130, 300, 1), d = pollSeconds(at + 200).find((p) => p > at) + 3 + Math.floor(R() * 40);
    const sc = { secs: d + 120, lag: 3, lat: 1, pk: 30, refreshEvery: 0, dep: 'WS813', at,
      rows: { A: row('AC644', { _liveOnGround: true }), B: row('PD522') }, planes: { AC644: P.taxi, PD522: P.pd522 },
      plan: [[0, 'A'], [at, 'B']], direct: [[d, 'A', 12, 0, true]] };
    const b = await replay('now', sc);
    const none = await replay('now', Object.assign({}, sc, { direct: [] }));
    assert.ok(b.rows[d - 1].vis, 'PD522\'s digits show, seed ' + seed);
    assert.deepEqual(diff(none, b, DIGITS), [], 'as if it had never come, seed ' + seed);
    const a = await replay('off', sc);
    if (a.rows[d].ft < a.rows[d - 1].ft * 0.9 || a.rows[d].realAlt === 0) wrong++;
  }
  assert.equal(wrong, 20, 'the baseline dropped PD522\'s digits toward 0 ft');
});

test('(c) the reg lookup\'s position for the previous aircraft, or for another leg under the same number, is not the new one\'s', async () => {
  // A's (WS812's) position from the reg lookup, landing after the swap, before PD522's first answer
  {
    const sc = { secs: 420, lag: 5, lat: 3, pk: 60, refreshEvery: 30, dep: 'WS813', at: 200,
      rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 }, plan: [[0, 'A'], [200, 'B']],
      regLookup: [[201, 'A', { spd: 250, alt: 8700, lat: 46.3, lng: -65.4 }]] };
    const b = await replay('now', sc), none = await replay('now', Object.assign({}, sc, { regLookup: [] }));
    assert.deepEqual(diff(none, b, DIGITS), [], 'as if it had never come');
    const a = await replay('off', sc);
    assert.ok(a.rows.slice(201, 242).some((x) => x.vis && x.ft < 12000), 'the baseline showed its 8,700 ft on PD522');
  }
  // another leg under the same number: the reg lookup for today's AC644 brings
  // no numbers, and its merge carries yesterday's AC644's (from the direct lookup)
  {
    const sc = { secs: 420, lag: 5, lat: 3, pk: 60, refreshEvery: 30, dep: 'WS813', at: 200,
      rows: { A: row('AC644', { _sortTs: T0 - 24 * H + 45 * 60000, _revTs: T0 + 30 * 60000 }), B: row('AC644') },
      planes: { AC644: P.low }, switchAt: { AC644: [200, P.high] }, plan: [[0, 'A'], [200, 'B']],
      direct: [[195, 'A', 230, 5200]], regLookup: [[201, 'B', { lat: 46.3, lng: -65.4 }]] };
    const b = await replay('now', sc), none = await replay('now', Object.assign({}, sc, { regLookup: [] }));
    assert.deepEqual(diff(none, b, DIGITS), [], 'today\'s AC644 is not shown yesterday\'s numbers');
    assert.equal(b.rows[201].lpWho, 'AC644@' + (T0 - 24 * H + 45 * 60000), 'the merged position keeps yesterday\'s name');
    const a = await replay('off', sc);
    assert.ok(a.rows.slice(201, 242).some((x) => x.vis && x.ft < 8000), 'the baseline showed yesterday\'s 5,200 ft');
  }
});
