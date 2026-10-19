'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24068 — A GATE THAT SWAPS TO ANOTHER INBOUND STARTS ITS NUMBERS FROM NOTHING.
//
// The bug (v24066): a gate can swap to a different inbound while it keeps the
// same departure. The speed/altitude state (window._gateTelemAnim) was reset
// only when the DEPARTURE changed, and the render's candidate position (_wpC)
// took window._gateInboundLivePos without asking whose it was. So the new
// aircraft showed the old one's altitude, the "rate" from the old aircraft's
// last reading to the new one's first sent a descending aircraft's digits up,
// and an old aircraft's "on the ground" eased an airborne one toward 0 ft.
//
// The change (the minimal design, nothing else):
//   (1) when the gate's name for its inbound changes (_gateInbId: the same
//       flight-number-else-tail name that already tears the small map down),
//       window._gateTelemAnim starts fresh, just before the render builds the
//       panel. A gate with no inbound for a moment has not changed its inbound
//       (compared with the last inbound shown, window._gateTelemInbId);
//   (2) the render's _wpC, and the model's on-the-ground test, take
//       window._gateInboundLivePos only when it was written for the inbound's
//       flight number, or for no flight (the board's own test, as where the
//       poll and the map clear it: !lp.fl || lp.fl === inb.flight).
// No answer is stamped, no cached answer is dropped, the poll, the FR24
// lookups, the caches and the intervals are untouched.
//
// THE REPLAYS run the board's own code, lifted from fids-core.js: the gate
// render's pairing, the panel's inbound and the change above, the REAL gate
// key (_computeGateKey and _regInbTag, lifted: flight, status and revised
// time; the tail only for reg-lookup inbounds; never the scheduled time), the
// rebuild guard, the panel's live numbers (_buildV2MapCol, through the spans
// it paints), the bookkeeping after the build (_newInbId, the departure wipe,
// _gateInbound); the 60 s numbers poll; the FR24 lookups (_adsbCached,
// _adsbTelemetry, _adsbFetchOne with its REAL 45 s browser cache) down to
// fetch(), which is the Worker: one answer per path held 180 s (300 s when
// FR24 has nothing), served from the edge as stored; requestGateRebuild's
// 800 ms debounce; the per-second animator. render() repaints a gate only when
// the dedicated-screen key changes, as on the board, so an FR24 answer's
// render() repaints nothing here; repaints come from the gate's key changing,
// from the poll's own requestGateRebuild, and from "rebuilds" (the clock's and
// the feed's requestGateRebuild, at random times).
//
// THE BASELINE is v24066: this file's code with the change switched off
// (switchedOff below), or v24066's own fids-core.js when GATE_SWAP_BASELINE
// names it (run that way when this was written: every replay the same, second
// for second). GATE_SWAP_CORE runs the replays on another fids-core.js (the
// mutation check).
//
// THE BAR (per replay, per second; "the previous aircraft's numbers" means a
// display that changes when only the previous aircraft's FR24 answers change:
// other values, or the other ground state; "the right numbers" a display of
// v24066's that does not):
//   (i)   never blank where v24066 shows the inbound's right numbers;
//   (ii)  never further from the truth there than v24066;
//   (iii) never the previous aircraft's numbers where v24066 does not show them;
//   (iv)  rows sharing a callsign or a tail, and two legs under one number,
//         may stay as wrong as v24066 but never go blank where it shows numbers;
//   and the same FR24 calls and Worker requests as v24066 in every replay.
//
// WHAT IT MEASURES (the tests marked TODO are the bar this design does NOT
// meet; they report their counts and do not fail the suite):
//   - no swap (1,200 replays): every second v24066's, same FR24 calls: MET;
//   - the requests in every family, (iii) in every family it covers, (iv): MET;
//   - the fix: after a plain swap (air/ground either way, back, through a gap)
//     the screen never shows the previous aircraft's numbers, where v24066
//     shows them for minutes: MET (an answer for the previous aircraft that
//     lands after the swap is still taken, as in v24066);
//   - (i) NOT MET after a swap whose new inbound has no answer yet when the
//     gate repaints: (2) leaves the panel without its speed/altitude spans, and
//     nothing repaints the gate until its next rebuild (up to ~10 minutes in
//     these replays), while v24066, showing the previous aircraft's numbers in
//     those spans, updates them in place to the new aircraft's own numbers
//     from its second reading on (for an aircraft on the ground: 0 ft and its
//     taxi speed, which a fresh paint of the gate never shows);
//   - (i), (ii) NOT MET for the same aircraft renamed (a flight row and a row
//     known only by its tail): by the gate's name these are two inbounds, so
//     (1) drops that aircraft's own measured rate and the digits go back to
//     its last reading (further from the truth than v24066 by up to ~3,300 ft,
//     for up to ~5 minutes in these replays), and (2) can blank it.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(process.env.GATE_SWAP_CORE || path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const V24066 = process.env.GATE_SWAP_BASELINE ? fs.readFileSync(process.env.GATE_SWAP_BASELINE, 'utf8') : null;

// ── the texts ──────────────────────────────────────────────────────────────
function once(s, a, what) {
  const i = s.indexOf(a);
  assert.ok(i >= 0 && s.indexOf(a, i + 1) < 0, (what || 'marker') + ' once: ' + a.slice(0, 70));
  return i;
}
// a top-level function, whole (it ends at the first '}' in column 0)
function decl(core, name) {
  let at = -1;
  for (const h of ['\nasync function ' + name + '(', '\nfunction ' + name + '(']) {
    const i = core.indexOf(h);
    if (i < 0) continue;
    assert.ok(at < 0 && core.indexOf(h, i + 1) < 0, name + ' once');
    at = i;
  }
  if (at < 0) return null;
  return core.slice(at + 1, core.indexOf('\n}\n', at + 1) + 2);
}
function between(core, a, b, incl) {
  const i = once(core, a);
  const j = core.indexOf(b, i + a.length);
  assert.ok(j > i, 'end marker: ' + b.slice(0, 70));
  return core.slice(i, incl ? j + b.length : j);
}
function varLine(core, name) {
  const i = core.indexOf('\nvar ' + name + ' = ');
  assert.ok(i >= 0, 'var ' + name);
  return core.slice(i + 1, core.indexOf('\n', i + 1));
}
// the change, switched off: v24066's behaviour from this file's own text
const ISFOR_ON = "function _gateLivePosIsFor(lp, inb) {\n  return !!(lp && typeof lp === 'object' && (!lp.fl || (inb && lp.fl === inb.flight)));\n}";
const RESET_ON = 'if (window._gateTelemInbId && window._gateTelemInbId !== _telemInbId) {';
function switchedOff(core) {
  once(core, ISFOR_ON, 'the position test');
  once(core, RESET_ON, 'the reset');
  return core.replace(ISFOR_ON, () => "function _gateLivePosIsFor(lp) {\n  return !!(lp && typeof lp === 'object');\n}")
    .replace(RESET_ON, () => 'if (false) {');
}

const FUNCS = ['_writeGateTelemDom', '_gateTelemSetReal', '_gateTelemModel', '_animateGateTelem', '_gateStickyFix',
  '_gateLegWindowOpen', '_gateLiveFix', '_adsbFetchOne', '_icaoCallsign', '_adsbTelemetry', '_adsbCached',
  '_gateNumbersPoll', 'requestGateRebuild', '_gateRebuildFire'];
const NEW_FNS = ['_gateInbId', '_gateLivePosIsFor'];
const VARS = ['ARR_CONFIRM_MIN', 'GATE_GRACE_MIN', '_GATE_FIX_TTL', '_FIX_MAX_AGE_MS', '_ADSB_TTL_MS',
  '_GATE_REBUILD_QUIET_MS', '_GATE_REBUILD_MAX_WAIT'];
function source(core) {
  const parts = VARS.map((v) => varLine(core, v));
  const ic = once(core, '\nvar _IATA_TO_CALLSIGN = (function () {');
  parts.push(core.slice(ic + 1, core.indexOf('\n})();\n', ic) + 6));
  for (const f of FUNCS) { const t = decl(core, f); assert.ok(t, f); parts.push(t); }
  for (const f of NEW_FNS) { const t = decl(core, f); if (t) parts.push(t); }
  // _buildV2MapCol's live numbers, and the spans it paints from them
  const R = between(core, '    var _ib = vars.inboundFlight;\n', "      var _tz = vars.tz || 'UTC';");
  once(core, '      var _spdKph = (_liveSpd !== null) ? Math.round(_liveSpdD * 1.852) : null;');
  once(core, '      if (_liveSpd !== null || _liveAlt !== null) {\n        var _distKm = null;');
  once(core, "(_spdKph !== null ? ('<span data-gtelem=\"spd-kph\">' + BoardStrings.num(_spdKph) + '</span>') : '—')");
  once(core, "(_liveAlt !== null ? ('<span data-gtelem=\"alt-ft\">' + BoardStrings.num(_liveAltD) + '</span>') : '—')");
  parts.push('function __render(vars) {\n  var _liveSpd = null, _liveAlt = null;\n  try {\n' + R
    + '\n      var _spdKph = (_liveSpd !== null) ? Math.round(_liveSpdD * 1.852) : null;\n'
    + "      if (_liveSpd !== null || _liveAlt !== null) return [_spdKph !== null ? ['spd-kph', String(_spdKph)] : null, _liveAlt !== null ? ['alt-ft', String(_liveAltD)] : null].filter(Boolean);\n"
    + '      return null;\n    }\n  } catch (e) { __err(e); }\n  return null;\n}\n');
  // the gate render: its pairing and panel inbound (and the change), the key, the guarded build, the bookkeeping after
  const P1 = between(core, '      const _verifiedInbound = (window._gateInbound\n', "\n      if (inboundFlight) {\n        console.log('[FIDS] Inbound for'");
  const KT = between(core, "      var _regInbTag = (window._gateInbound && window._gateInbound._inboundSource === 'reg-lookup')\n", ": '';\n", true);
  const KF = between(core, '      var _computeGateKey = function () {\n', '\n      };\n', true);
  once(core, '      var _gateKey = _computeGateKey();\n      if (window._lastGateKey !== _gateKey) {\n        window._lastGateKey = _gateKey;\n');
  once(core, '        window._lastGateKey = _computeGateKey();\n');
  const P5 = between(core, '      // Reset map so interval will re-create it\n', '      window._gateCurrentFlight = currentFlight;\n', true);
  parts.push('function __gatePass(currentFlight, _gateMatchFallback) {\n'
    + "  var iata = 'YQM', locIata = currentFlight._locIata || 'YYZ', subScreenVal = 'A1', _msgTag = '', _langTag = 'en+fr';\n"
    + P1 + '\n' + KT + KF
    + '  var _gateKey = _computeGateKey();\n'
    + "  if (window._lastGateKey !== _gateKey) {\n    window._lastGateKey = _gateKey;\n    __build(__render({ inboundFlight: inboundFlight, iata: iata, tz: 'UTC' }));\n    window._lastGateKey = _computeGateKey();\n  }\n"
    + P5 + '}\n');
  return parts.join('\n');
}
const FACTORIES = new Map();
function factory(core) {
  if (!FACTORIES.has(core)) {
    FACTORIES.set(core, new Function('S', 'with (S) {\n' + source(core)
      + '\nreturn { _gateNumbersPoll, _animateGateTelem, __gatePass };\n}'));
  }
  return FACTORIES.get(core);
}
// every free name the lifted code reads is a stub, a lifted function or a
// JavaScript built-in; anything else is recorded and the tests require none
const MISSING = new Set();
function scope(t) {
  return new Proxy(t, {
    has(o, k) { return typeof k === 'string' && ((k in o) || !(k in globalThis)); },
    get(o, k) { if (typeof k !== 'string') return undefined; if (!(k in o)) MISSING.add(k); return o[k]; },
    set(o, k, v) { o[k] = v; return true; }
  });
}
const T0 = Date.UTC(2026, 9, 19, 14, 0, 0);
const BASE = 'https://fids-proxy.n-leblanc1984.workers.dev/adsb';
const QUIET = { log() {}, warn() {}, error() {}, info() {} };
const flush = () => new Promise((r) => setImmediate(r));
const FRESH = () => ({ spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0, realSecToArr: null, shimmerPh: 0 });

// ── an aircraft, second by second ──────────────────────────────────────────
// o: { alt, spd, segs: [{ until, vs (ft/min), level, ds (kt/s), ground, spd, turn }] }
function track(o) {
  const tab = new Map();
  let alt = o.alt, spd = o.spd, vs = 0, lat = 46.1, lon = -66.6, hdg = 80, si = 0, ever = false;
  for (let t = -600; t <= 2400; t++) {
    while (si < o.segs.length - 1 && t >= o.segs[si].until) si++;
    const g = o.segs[si];
    if (g.ground) { ever = true; alt = 0; vs = 0; spd += Math.max(-2.5, Math.min(1, (g.spd || 0) - spd)); }
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
  const f = (t) => tab.get(Math.max(-600, Math.min(2400, Math.round(t))));
  f.everGround = ever;
  return f;
}

// ── one gate screen, second by second ─────────────────────────────────────
// sc: { secs, lag (Worker round trip, s), age (FR24's position age, s), latFor(path, t),
//   aircraft: { id: { reg, hex, type, path, legs: [{ flight, cs, from, to }], quiet(t) } },
//   rows: { key: { row fields, ac: the aircraft it really is } }, dep: { the departure },
//   plan: [[s, rowKey | null]] (the gate's inbound from s; a gate pass then),
//   status: [[s, rowKey, patch]] (the feed moving a row; it shows at the next pass),
//   refresh: [s] (the feed rebuilds every row object), depPlan: [[s, patch]] (the departure; a pass),
//   rebuilds: [s] (requestGateRebuild firing: key cleared, a pass),
//   perturb: { id, up | flip } (that aircraft's FR24 answers other values, or the other ground state) }
async function replay(core, sc) {
  const api = factory(core);
  let now = T0;
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  const heap = [];
  let seq = 0;
  const less = (x, y) => x.at < y.at || (x.at === y.at && x.seq < y.seq);
  const at = (t, fn) => {
    const it = { at: t, seq: seq++, fn, dead: false };
    heap.push(it);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
    return it;
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]]; i = m;
      }
    }
    return top;
  };
  const win = { _gateTelemAnim: FRESH(), _gateIata: 'YQM' };
  let els = [];
  const doc = { querySelectorAll: () => els, getElementById: (id) => (id === 'apSel' ? { value: 'YQM' } : null), querySelector: () => null };
  const out = { rows: [], edge: 0, fr24: 0, paths: [], builds: [], errors: [] };
  const KV = Object.create(null);
  const rowsBase = {}, rowObj = {};
  for (const [k, r] of Object.entries(sc.rows)) {
    rowsBase[k] = Object.assign({ status: 'active', _locIata: 'YYZ', _sortTs: T0 + 45 * 60000, _durationMins: 120, _gateNoAdsb: false }, r);
    rowObj[k] = Object.assign({}, rowsBase[k]);
  }
  const cf = Object.assign({ flight: 'XX900', dest: 'YYZ', status: 'ontime', _sortTs: T0 + 50 * 60000, _locIata: 'YYZ',
    _aircraft: 'Boeing 737 MAX 8', _aircraftCode: '7M8' }, sc.dep || {});
  let cur = null;
  const leg = (a, t) => (a.legs || []).find((l) => t >= (l.from == null ? -1e9 : l.from) && t < (l.to == null ? 1e9 : l.to));
  function lookup(kind, subject, t) {
    for (const [id, a] of Object.entries(sc.aircraft)) {
      const l = leg(a, t);
      if (kind === 'flight' && l && l.flight === subject) return [id, a, l];
      if (kind === 'callsign' && l && (l.cs || l.flight) === subject) return [id, a, l];
      if (kind === 'reg' && a.reg === subject) return [id, a, l];
      if (kind === 'hex' && a.hex === subject) return [id, a, l];
    }
    return null;
  }
  function fr24(kind, subject, t) {
    const hit = lookup(kind, subject, t);
    if (!hit || (hit[1].quiet && hit[1].quiet(t))) return { quiet: true };
    const [id, a, l] = hit, age = sc.age, f = a.path(t - age);
    let alt = f.ground ? 'ground' : f.alt, gs = f.spd;
    const P = sc.perturb;
    if (P && P.id === id && P.flip) { if (f.ground) { alt = 1200; gs = f.spd + 140; } }
    else if (P && P.id === id) {
      // other values, never crossing 0 ft or the ground
      if (!f.ground) alt = P.up ? f.alt + 25000 : Math.max(300, Math.round(f.alt / 3));
      gs = P.up ? f.spd + 500 : Math.round(f.spd / 3) + 20;
    }
    return { quiet: false, ac: { hex: (a.hex || '').toLowerCase() || undefined, flight: l ? (l.cs || l.flight) : undefined,
      r: a.reg || undefined, t: a.type || undefined, desc: a.type || undefined, lat: f.lat, lon: f.lon,
      alt_baro: alt, gs, track: f.trk, baro_rate: f.ground ? 0 : f.vs, seen_pos: age } };
  }
  // the Worker: one answer per path, 180 s (300 s when FR24 has nothing), from the edge as stored
  function worker(url) {
    out.edge++;
    const p = String(url).slice(BASE.length), m = p.match(/^\/(hex|reg|callsign|flight)\/(.+)$/);
    const t = (now - T0) / 1000;
    out.paths.push(Math.round(t * 10) / 10 + ' ' + p);
    let kv = KV[p];
    if (!kv || t - kv.t >= (kv.a.quiet ? 300 : 180)) { out.fr24++; kv = KV[p] = { t, a: fr24(m[1], decodeURIComponent(m[2]).toUpperCase(), t) }; }
    const body = kv.a.quiet ? { ac: [], _quiet: true } : { ac: [Object.assign({}, kv.a.ac)] };
    const lat = (sc.latFor && sc.latFor(p, t) != null) ? sc.latFor(p, t) : sc.lag;
    return new Promise((res) => { at(now + lat * 1000, () => res({ ok: true, json: () => Promise.resolve(body) })); });
  }
  let passing = false;
  function gatePass() {
    if (passing) return;
    passing = true;
    try { B.__gatePass(cf, cur ? rowObj[cur] : null); } catch (e) { out.errors.push(String(e && e.stack || e)); }
    passing = false;
  }
  const S = scope(Object.assign(Object.create(null), {
    window: win, document: doc, Date: FakeDate, console: QUIET, fetch: worker,
    AbortController: undefined, setTimeout: (fn, ms) => at(now + (ms || 0), fn), clearTimeout: (it) => { if (it) it.dead = true; },
    BoardStrings: { num: (v) => String(v) },
    screenType: 'gate', _gateNumPollBusy: false, dedicatedRenderKey: '', _gateKeyResetTimer: null, _gateRebuildFirstReq: 0,
    _gateFixCache: null, _adsbInflight: Object.create(null), _adsbCache: Object.create(null), _ADSB_BASE: BASE,
    AP: {}, CALLSIGN_TO_IATA: { WJA: 'WS', POE: 'PD', ACA: 'AC', JZA: 'QK' }, gateMap: null, _gateMapCamera: null,
    // the schedule lookup answers nothing today (loadFlight; see the poll's v23708 note)
    fidsLocalDateKey: () => '2026-10-19', fidsFlightPlan: () => null, loadFlight: () => Promise.resolve(null),
    _acResolvedPut: () => {},
    // render() repaints a gate only when the dedicated-screen key changes: never by itself here
    render: () => {}, renderDedicatedScreen: () => gatePass(),
    _gateRawLanded: (r) => /^(arrived|landed)\b/i.test(String((r && r.status) || '').trim()),
    _gateLegGone: (r) => /cancel|divert/i.test(String((r && r.status) || '')),
    _stopGateMapGlide: () => {}, _gateDepSchedTs: () => null, _fixPlausibleForLeg: () => true, _lookupAirport: () => null, _gcNm: () => 0,
    formatAircraft: (t) => (t ? 'Type ' + t : ''), aircraftCodeToIata: (t) => (t ? String(t).slice(0, 3) : ''),
    _gateTrackPush: () => {}, _liveFixPhysOk: () => true, _gateStageTerm: () => '', _gateDoorFor: () => ({ word: '' }),
    __build: (spans) => { out.builds.push((now - T0) / 1000); els = (spans || []).map(([k, v]) => ({ textContent: v, getAttribute: () => k })); },
    __err: (e) => out.errors.push(String(e && e.stack || e))
  }));
  const B = api(S);
  for (const [s, k] of sc.plan) at(T0 + s * 1000 + 100, () => { cur = k; gatePass(); });
  for (const [s, k, patch] of (sc.status || [])) at(T0 + s * 1000 + 120, () => { Object.assign(rowsBase[k], patch); Object.assign(rowObj[k], patch); });
  for (const s of (sc.refresh || [])) at(T0 + s * 1000 + 90, () => { for (const k of Object.keys(rowsBase)) rowObj[k] = Object.assign({}, rowsBase[k]); });
  for (const [s, patch] of (sc.depPlan || [])) at(T0 + s * 1000 + 110, () => { Object.assign(cf, patch); gatePass(); });
  for (const s of (sc.rebuilds || [])) at(T0 + s * 1000 + 160, () => { win._lastGateKey = ''; gatePass(); });
  // the poll: 2 s after load, then every 60 s (setTimeout / setInterval at the core's top level)
  once(CORE, 'try { setInterval(_gateNumbersPoll, 60000); setTimeout(_gateNumbersPoll, 2000); } catch (e) {}');
  at(T0 + 2300, () => B._gateNumbersPoll());
  for (let s = 60; s <= sc.secs; s += 60) at(T0 + s * 1000 + 300, () => B._gateNumbersPoll());
  for (let s = 0; s <= sc.secs; s++) {
    at(T0 + s * 1000 + 900, () => {
      B._animateGateTelem();
      const sp = els.find((e) => e.getAttribute() === 'spd-kph'), al = els.find((e) => e.getAttribute() === 'alt-ft');
      const tr = cur ? sc.aircraft[rowsBase[cur].ac].path(s) : null;
      out.rows.push({ s, cur, ac: cur ? rowsBase[cur].ac : null, vis: els.length > 0,
        ft: al ? Number(al.textContent) : null, kph: sp ? Number(sp.textContent) : null,
        tFt: tr ? tr.alt : null, tKph: tr ? Math.round(tr.spd * 1.852) : null });
    });
  }
  while (heap.length) {
    const it = pop();
    if (it.dead) continue;
    now = it.at;
    try { it.fn(); } catch (e) { out.errors.push(String(e && e.stack || e)); }
    await flush();
  }
  return out;
}

// ── the replays ─────────────────────────────────────────────────────────────
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pick = (R, a) => a[Math.floor(R() * a.length)];
const int = (R, lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
function profile(R, kind) {
  switch (kind) {
    case 'descent': return track({ alt: int(R, 14000, 30000), spd: int(R, 280, 460), segs: [{ until: 1e9, vs: -int(R, 700, 2200), level: int(R, 1500, 6000), ds: -0.03 - R() * 0.05, turn: R() * 0.4 - 0.2 }] });
    case 'climb': return track({ alt: int(R, 2000, 9000), spd: int(R, 220, 300), segs: [{ until: 1e9, vs: int(R, 1200, 2800), level: int(R, 25000, 37000), ds: 0.03 + R() * 0.05 }] });
    case 'cruise': return track({ alt: int(R, 28000, 39000), spd: int(R, 420, 500), segs: [{ until: 1e9, vs: 0, level: int(R, 28000, 39000) }] });
    case 'tod': { const a = int(R, 100, 700); return track({ alt: int(R, 30000, 38000), spd: int(R, 430, 480), segs: [{ until: a, vs: 0, level: 34000 }, { until: 1e9, vs: -int(R, 1200, 2500), level: 9000, ds: -0.05 }] }); }
    case 'approach': { const l = int(R, 300, 1200); return track({ alt: int(R, 6000, 11000), spd: int(R, 200, 250), segs: [{ until: l, vs: -int(R, 600, 1000), level: 0, ds: -0.05, turn: R() * 0.6 - 0.3 }, { until: 1e9, ground: true, spd: 12 }] }); }
    case 'taxi': return track({ alt: 0, spd: int(R, 0, 15), segs: [{ until: 1e9, ground: true, spd: int(R, 5, 18) }] });
    case 'takeoff': { const g = int(R, 100, 600); return track({ alt: 0, spd: 10, segs: [{ until: g, ground: true, spd: 15 }, { until: 1e9, vs: int(R, 1800, 3000), level: 30000, ds: 0.4 }] }); }
    case 'level': return track({ alt: int(R, 9000, 20000), spd: int(R, 250, 330), segs: [{ until: 1e9, vs: 0, level: int(R, 9000, 20000), turn: 0.2 }] });
  }
  throw new Error(kind);
}
const AIR = ['descent', 'climb', 'cruise', 'tod', 'approach', 'level'];
const ANY = AIR.concat(['taxi', 'takeoff']);
const FLEET = [
  { flight: 'WS812', cs: 'WJA812', reg: 'C-FAAA', hex: 'C0A001', type: 'B38M', name: 'Boeing 737 MAX 8', code: '7M8' },
  { flight: 'PD522', cs: 'POE522', reg: 'C-GBBB', hex: 'C0B002', type: 'DH8D', name: 'Dash 8-400', code: 'DH4' },
  { flight: 'AC7992', cs: 'JZA7992', reg: 'C-FUJA', hex: 'C0C003', type: 'E75L', name: 'Embraer 175', code: 'E75' },
  { flight: 'AC644', cs: 'ACA644', reg: 'C-FJZS', hex: 'C0D004', type: 'A320', name: 'Airbus A320', code: '320' }
];
function quietFn(R) {
  if (R() < 0.6) return null;
  const spells = [];
  for (let i = 0, n = int(R, 1, 3); i < n; i++) { const a = int(R, 0, 1500); spells.push([a, a + int(R, 60, 600)]); }
  return (t) => spells.some(([a, b]) => t >= a && t < b);
}
function rebuilds(R, secs) {
  const out = [], mean = pick(R, [90, 200, 400, 1e9]);
  for (let t = int(R, 20, 200); t < secs && mean < 1e8; t += Math.max(15, Math.round(-Math.log(1 - R()) * mean))) out.push(t);
  return out;
}
function rowFor(f, R, ac) {
  const r = { flight: f.flight, ac };
  if (R() < 0.5) r._reg = f.reg;
  if (R() < 0.3) r._callSign = f.cs;
  if (R() < 0.2) r._modeS = f.hex;
  if (R() < 0.7) { r._aircraft = f.name; r._aircraftCode = f.code; }
  return r;
}
function common(R, secs) {
  return { secs, lag: pick(R, [0.2, 0.4, 0.9, 1.6]), age: int(R, 2, 25),
    refresh: [300, 600, 900, 1200, 1500].filter((s) => s < secs && R() < 0.8), rebuilds: rebuilds(R, secs) };
}
function swapSecond(R, lo, hi) { for (;;) { const s = int(R, lo, hi), m = s % 60; if (m > 4 && m < 58) return s; } }
function noSwap(seed) {
  const R = rng(seed), secs = 1200, f = FLEET[seed % FLEET.length], sc = common(R, secs);
  const kind = pick(R, ANY);
  sc.aircraft = { a1: { reg: f.reg, hex: f.hex, type: f.type, path: profile(R, kind), legs: [{ flight: f.flight, cs: f.cs }], quiet: quietFn(R) } };
  sc.rows = { A: rowFor(f, R, 'a1') };
  if (R() < 0.08) { delete sc.rows.A.flight; sc.rows.A._reg = f.reg; }        // a row known only by its tail
  sc.plan = [[0, 'A']];
  if (R() < 0.3) { const a = int(R, 100, 700), b = a + int(R, 5, 300); sc.plan.push([a, null], [b, 'A']); }   // no inbound for a moment
  if (R() < 0.15) sc.plan = [[0, null], [int(R, 30, 300), 'A']];                // no inbound yet
  sc.status = [];
  if (R() < 0.5) for (let t = int(R, 60, 300); t < secs; t += int(R, 120, 400)) sc.status.push([t, 'A', { _revTs: T0 + 45 * 60000 + int(R, -10, 20) * 60000 }]);
  if (kind === 'approach' && R() < 0.5) sc.status.push([int(R, 600, 1100), 'A', { status: 'Arrived' }]);
  if (R() < 0.1) sc.depPlan = [[int(R, 200, 900), { flight: 'XX902' }]];       // the departure changing
  return sc;
}
function swap(seed, kindA, kindB, opt) {
  opt = opt || {};
  const R = rng(seed), secs = 1200, sc = common(R, secs);
  const fa = FLEET[seed % FLEET.length], fb = FLEET[(seed + 1 + (seed >> 2) % 3) % FLEET.length];
  sc.aircraft = {
    a1: { reg: fa.reg, hex: fa.hex, type: fa.type, path: profile(R, kindA), legs: [{ flight: fa.flight, cs: fa.cs }], quiet: null },
    a2: { reg: fb.reg, hex: fb.hex, type: fb.type, path: profile(R, kindB), legs: [{ flight: fb.flight, cs: fb.cs }], quiet: null }
  };
  sc.rows = { A: rowFor(fa, R, 'a1'), B: rowFor(fb, R, 'a2') };
  const sw = opt.at != null ? opt.at : swapSecond(R, 150, 700);
  sc.plan = [[0, 'A'], [sw, 'B']];
  if (opt.back) sc.plan.push([sw + int(R, 90, 400), 'A']);
  if (opt.gap) sc.plan.splice(1, 0, [sw - int(R, 5, 60), null]);
  sc.swapAt = sw;
  return sc;
}
const FAMILIES = {
  // airborne to airborne
  air2air: (seed, R) => swap(seed, pick(R, AIR), pick(R, AIR)),
  // on the ground to airborne
  gnd2air: (seed, R) => swap(seed, 'taxi', pick(R, AIR)),
  // airborne to on the ground
  air2gnd: (seed, R) => swap(seed, pick(R, AIR), 'taxi'),
  // and back to the first
  swapback: (seed, R) => swap(seed, pick(R, AIR), pick(R, AIR), { back: true }),
  // through a moment with no inbound
  gap: (seed, R) => swap(seed, pick(R, AIR), pick(R, AIR), { gap: true }),
  // the previous aircraft's answer still on its way when the gate swaps
  late: (seed, R) => {
    const sc = swap(seed, pick(R, AIR), pick(R, AIR), { at: 60 * int(R, 3, 10) + 1 });
    const a = sc.aircraft.a1, ids = [a.reg, a.hex, a.legs[0].flight, a.legs[0].cs].map((x) => '/' + encodeURIComponent(x));
    const slow = 2.5 + R() * 2;
    sc.latFor = (p, t) => (t > sc.swapAt - 3 && t < sc.swapAt && ids.some((x) => p.endsWith(x)) ? slow : null);
    return sc;
  },
  // the same aircraft: a flight row, then a row known only by its tail, or the other way
  rename: (seed, R) => {
    const sc = swap(seed, pick(R, AIR), 'cruise');
    delete sc.aircraft.a2;
    const f = FLEET[seed % FLEET.length];
    const full = Object.assign({}, sc.rows.A, { _reg: f.reg }), tail = { _reg: f.reg, ac: 'a1' };
    if (R() < 0.5) { tail._aircraft = full._aircraft; tail._aircraftCode = full._aircraftCode; }
    sc.rows = R() < 0.5 ? { A: full, B: tail } : { A: tail, B: full };
    return sc;
  },
  // two rows carrying one callsign
  sharedcs: (seed, R) => {
    const sc = swap(seed, pick(R, AIR), pick(R, AIR));
    sc.rows.A._callSign = sc.rows.B._callSign = sc.aircraft.a1.legs[0].cs;
    return sc;
  },
  // two rows carrying one tail
  sharedtail: (seed, R) => {
    const sc = swap(seed, pick(R, AIR), pick(R, AIR));
    sc.rows.A._reg = sc.rows.B._reg = sc.aircraft.a1.reg;
    return sc;
  },
  // two legs flown under one number (yesterday's late one, today's)
  twolegs: (seed, R) => {
    const sc = swap(seed, pick(R, AIR), pick(R, AIR));
    const l = sc.aircraft.a1.legs[0];
    sc.aircraft.a2.legs = [{ flight: l.flight, cs: l.cs, from: sc.swapAt - int(R, 0, 120) }];
    sc.aircraft.a1.legs = [{ flight: l.flight, cs: l.cs, to: sc.swapAt + int(R, 0, 200) }];
    sc.rows.A._sortTs = Date.UTC(2026, 9, 18, 18, 0); sc.rows.A._revTs = Date.UTC(2026, 9, 19, 14, 30);
    sc.rows.B = Object.assign({}, sc.rows.B, { flight: l.flight, ac: 'a2' });
    delete sc.rows.B._callSign;
    if (R() < 0.5) sc.rows.B.status = 'delayed';
    return sc;
  }
};
const SEEDS = 30;

// ── the bar, second by second ──────────────────────────────────────────────
const same = (a, b) => a.vis === b.vis && a.ft === b.ft && a.kph === b.kph;
async function runs(core, sc) {
  const n = await replay(core, sc), pert = {};
  if (Object.keys(sc.aircraft).length > 1) {
    for (const [id, a] of Object.entries(sc.aircraft)) {
      pert[id] = [await replay(core, Object.assign({}, sc, { perturb: { id, up: true } })),
        await replay(core, Object.assign({}, sc, { perturb: { id, up: false } }))];
      if (a.path.everGround) pert[id].push(await replay(core, Object.assign({}, sc, { perturb: { id, flip: true } })));
    }
  }
  return { n, pert };
}
// the display at s depends on another aircraft than the one shown
function tainted(r, s, shown) {
  return Object.entries(r.pert).some(([id, list]) => id !== shown && list.some((p) => !same(p.rows[s], r.n.rows[s])));
}
const BASELINE = () => V24066 || switchedOff(CORE);
async function measure(name) {
  const m = { replays: 0, requests: [], errors: [], blank: { r: 0, s: 0, ex: null }, further: { r: 0, s: 0, ex: null, ft: 0 },
    prev: { r: 0, s: 0, ex: null }, blankAny: { r: 0, s: 0, ex: null }, baseTainted: 0, headTainted: 0, headTaintedR: 0, baseTaintedR: 0 };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sc = FAMILIES[name](seed, rng(seed * 7 + 3));
    const b = await runs(BASELINE(), sc), h = await runs(CORE, sc);
    m.replays++;
    m.errors.push(...b.n.errors, ...h.n.errors);
    if (b.n.edge !== h.n.edge || b.n.fr24 !== h.n.fr24 || b.n.paths.join() !== h.n.paths.join()) m.requests.push(seed);
    const add = (k, list, extra) => { if (list.length) { m[k].r++; m[k].s += list.length; if (!m[k].ex) m[k].ex = Object.assign({ seed, at: list.slice(0, 3) }, extra || {}); } };
    const blank = [], further = [], prev = [], blankAny = [];
    let bt = 0, ht = 0, worst = 0;
    for (let s = 0; s < b.n.rows.length; s++) {
      const B = b.n.rows[s], X = h.n.rows[s];
      if (!B.cur) continue;
      const bT = tainted(b, s, B.ac), hT = tainted(h, s, B.ac);
      bt += bT; ht += hT;
      if (B.vis && !X.vis) blankAny.push(s);
      if (B.vis && !bT && !X.vis) blank.push(s);
      if (B.vis && !bT && X.vis) {
        const e = Math.max(Math.abs(X.ft - B.tFt) - Math.abs(B.ft - B.tFt), Math.abs(X.kph - B.tKph) - Math.abs(B.kph - B.tKph));
        if (e > 1) { further.push(s); worst = Math.max(worst, e); }
      }
      // (a display the same as v24066's is not one it does not show)
      if (hT && !bT && !same(B, X)) prev.push(s);
    }
    add('blank', blank); add('further', further, { by: worst }); add('prev', prev); add('blankAny', blankAny);
    m.further.ft = Math.max(m.further.ft, worst);
    m.baseTainted += bt; m.headTainted += ht; m.baseTaintedR += bt > 0; m.headTaintedR += ht > 0;
  }
  return m;
}
const MEASURED = {};
const measured = (name) => (MEASURED[name] = MEASURED[name] || measure(name));
const summary = (m) => JSON.stringify({ replays: m.replays, blank: m.blank, further: m.further, prev: m.prev, blankAny: m.blankAny,
  baseShowsPrevious: { replays: m.baseTaintedR, seconds: m.baseTainted }, headShowsPrevious: { replays: m.headTaintedR, seconds: m.headTainted } });

// ═══ the texts ═════════════════════════════════════════════════════════════
test('text: the change is the two pieces and nothing else', () => {
  // (1) one reset, before the build, on the gate's name for its inbound
  const pre = between(CORE, '      try { window._gatePanelInbound = inboundFlight || null; } catch (e) {}\n', "\n      if (inboundFlight) {\n        console.log('[FIDS] Inbound for'");
  assert.match(pre, /var _telemInbId = _gateInbId\(inboundFlight\);/);
  assert.match(pre, /window\._gateTelemAnim = \{ spd:null, alt:null, realSpd:null, realAlt:null, realTs:0, realSecToArr:null, shimmerPh:0 \};/);
  assert.ok(CORE.indexOf(pre) < CORE.indexOf('      var _gateKey = _computeGateKey();\n'), 'before the guarded build');
  once(CORE, "      var _newInbId = _gateInbId(inboundFlight);", 'the map teardown reads the same name');
  assert.equal(decl(CORE, '_gateInbId'), "function _gateInbId(inb) {\n  return inb ? String(inb.flight || inb._reg || inb.registration || 'inb') : 'none';\n}");
  // whole-object writes: the first state, the departure wipe, the new-inbound reset
  assert.equal((CORE.match(/window\._gateTelemAnim = window\._gateTelemAnim \|\| \{/g) || []).length, 1);
  assert.equal((CORE.match(/window\._gateTelemAnim = \{/g) || []).length, 2);
  // (2) the position test at the two places the position feeds the digits
  assert.equal((CORE.match(/_gateLivePosIsFor\(/g) || []).length, 3, 'its declaration and two callers');
  assert.match(decl(CORE, '_gateTelemModel'), /var _gp = _gateLivePosIsFor\(window\._gateInboundLivePos, window\._gateInbound\) \? window\._gateInboundLivePos : null;/);
  once(CORE, '      var _wpC = _gateLivePosIsFor(window._gateInboundLivePos, _ib) ? window._gateInboundLivePos : null;');
  // nothing asks for anything, nothing waits, nothing repaints
  for (const t of [decl(CORE, '_gateInbId'), decl(CORE, '_gateLivePosIsFor'), pre]) {
    assert.doesNotMatch(t.replace(/\/\/[^\n]*/g, ''), /fetch\(|_adsb|loadFlight\(|setTimeout|setInterval|requestGateRebuild|render\(|_lastGateKey/);
  }
  // the poll, the lookups and the caches do not know about it
  for (const f of ['_gateNumbersPoll', '_adsbTelemetry', '_adsbFetchOne', '_adsbCached', '_gateStickyFix', '_gateTelemSetReal']) {
    assert.doesNotMatch(decl(CORE, f), /_gateLivePosIsFor|_gateInbId|_gateTelemInbId/, f);
  }
  assert.equal(varLine(CORE, '_ADSB_TTL_MS'), 'var _ADSB_TTL_MS = 45000;', 'the browser cache, 45 s');
});

test('the helpers: the gate\'s name for its inbound, and whose the position is', () => {
  const S = new Function(decl(CORE, '_gateInbId') + decl(CORE, '_gateLivePosIsFor') + 'return { _gateInbId, _gateLivePosIsFor };')();
  assert.equal(S._gateInbId({ flight: 'AC644', _reg: 'C-FJZS' }), 'AC644');
  assert.equal(S._gateInbId({ _reg: 'C-FJZS' }), 'C-FJZS');
  assert.equal(S._gateInbId({ registration: 'C-GKQE' }), 'C-GKQE');
  assert.equal(S._gateInbId({}), 'inb');
  assert.equal(S._gateInbId(null), 'none');
  const lp = { fl: 'WS812', onGround: true };
  assert.equal(S._gateLivePosIsFor(lp, { flight: 'WS812' }), true);
  assert.equal(S._gateLivePosIsFor(lp, { flight: 'PD522' }), false, 'another inbound\'s');
  assert.equal(S._gateLivePosIsFor(lp, { _reg: 'C-FAAA' }), false, 'a row known only by its tail is not WS812');
  assert.equal(S._gateLivePosIsFor(lp, null), false);
  assert.equal(S._gateLivePosIsFor({ fl: '' }, { flight: 'PD522' }), true, 'written for no flight: anyone\'s, as the board reads it');
  assert.equal(S._gateLivePosIsFor(null, { flight: 'WS812' }), false);
});

test('the replays lift every name they use', async () => {
  MISSING.clear();
  await replay(CORE, noSwap(1));
  await replay(BASELINE(), noSwap(2));
  assert.deepEqual([...MISSING], []);
});

test('the baseline is v24066 (when GATE_SWAP_BASELINE names v24066\'s fids-core.js)', { skip: !V24066 && 'GATE_SWAP_BASELINE not set (run so when this was written: every replay the same)' }, async () => {
  const off = switchedOff(CORE);
  for (let seed = 1; seed <= 200; seed++) {
    const sc = seed <= 100 ? noSwap(seed) : FAMILIES[Object.keys(FAMILIES)[seed % 10]](seed, rng(seed * 7 + 3));
    const a = await replay(off, sc), b = await replay(V24066, sc);
    assert.ok(a.rows.every((r, i) => same(r, b.rows[i])) && a.paths.join() === b.paths.join(), 'replay ' + seed);
  }
});

// ═══ no swap: v24066's, second for second ══════════════════════════════════
test('no swap: 1,200 replays, every second v24066\'s, with the same FR24 calls and Worker requests', async () => {
  const off = BASELINE();
  let n = 0, built = 0;
  for (let seed = 1; seed <= 1200; seed++) {
    const sc = noSwap(seed);
    const b = await replay(off, sc), h = await replay(CORE, sc);
    assert.deepEqual(h.errors.concat(b.errors), [], 'replay ' + seed);
    const d = h.rows.findIndex((r, i) => !same(r, b.rows[i]));
    assert.equal(d, -1, 'replay ' + seed + ' second ' + d + ': ' + JSON.stringify([h.rows[d], b.rows[d]]));
    assert.equal(h.paths.join('\n'), b.paths.join('\n'), 'replay ' + seed + ': the same requests, in order');
    assert.equal(h.fr24, b.fr24);
    n++; built += h.rows.some((r) => r.vis);
  }
  assert.equal(n, 1200);
  assert.ok(built > 600, 'and most of them show numbers (' + built + ')');
});

// ═══ swaps ═════════════════════════════════════════════════════════════════
const PLAIN = ['air2air', 'gnd2air', 'swapback', 'gap'];
const SHARED = ['sharedcs', 'sharedtail', 'twolegs'];
// what this design meets of (i) and (ii), measured (see the header)
const MEETS_I_II = new Set(['gnd2air', 'sharedcs', 'sharedtail', 'twolegs']);
for (const name of Object.keys(FAMILIES)) {
  test(name + ': the same FR24 calls and Worker requests as v24066', async (t) => {
    const m = await measured(name);
    t.diagnostic(summary(m));
    assert.deepEqual(m.errors, []);
    assert.deepEqual(m.requests, [], 'replays with other requests');
  });
  if (!SHARED.includes(name)) {
    test(name + ': never the previous aircraft\'s numbers where v24066 does not show them', async () => {
      const m = await measured(name);
      assert.equal(m.prev.s, 0, 'seconds showing the previous aircraft\'s numbers where v24066 does not: ' + JSON.stringify(m.prev));
      assert.ok(m.headTainted <= m.baseTainted);
    });
  }
  if (PLAIN.includes(name)) {
    test(name + ': the fix: after the swap the screen never shows the previous aircraft\'s numbers (v24066 does)', async (t) => {
      const m = await measured(name);
      assert.equal(m.headTainted, 0, summary(m));
      assert.ok(m.baseTaintedR >= SEEDS / 3, 'v24066 shows them in ' + m.baseTaintedR + ' replays');
    });
  }
  if (SHARED.includes(name)) {
    // not covered: these may stay as wrong as v24066 (two rows share the name the
    // FR24 answer is found under), but never go blank where it shows numbers
    test(name + ': never blank where v24066 shows numbers', async () => {
      const m = await measured(name);
      assert.equal(m.blankAny.s, 0, JSON.stringify(m.blankAny));
      assert.ok(m.headTainted <= m.baseTainted, 'and no more of the previous aircraft than v24066');
    });
  }
  const meets = MEETS_I_II.has(name);
  test(name + ': (i) never blank where v24066 shows the right numbers; (ii) never further from the truth',
    meets ? {} : { todo: 'NOT MET by the minimal design: ' + (name === 'rename'
      ? 'the gate names a renamed aircraft as a new inbound, so (1) drops its own measured rate and (2) can blank it'
      : 'with no answer for the new inbound at the repaint, (2) leaves the panel without its spans until the gate\'s next rebuild') },
    async (t) => {
      const m = await measured(name);
      t.diagnostic(summary(m));
      assert.equal(m.blank.s, 0, 'blank where v24066 is right: ' + JSON.stringify(m.blank));
      assert.equal(m.further.s, 0, 'further from the truth: ' + JSON.stringify(m.further));
    });
}
