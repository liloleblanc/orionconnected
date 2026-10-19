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
//     the new one's.
//
// The replays run the board's own code, lifted from fids-core.js: the
// telemetry anchor, model, animator and digit writer; the render lines of
// _buildV2MapCol that pick the live numbers; the gate render's lines just
// before the panel is built and just after it; the 60 s numbers poll; and the
// FR24 lookups (_adsbCached, _adsbTelemetry, _adsbFetchOne) down to fetch(),
// which is a stand-in Worker (one answer per path held 180 s, 300 s when
// FR24 has nothing, served aged). The v24066 build is the same code with this
// release's edits undone, and every one of its texts is checked against
// v24066's own sha256, so the replays compare against v24066 itself.
//
// What they hold the board to:
//   (a) no swap: every second of 1,200 random loads (climbs, descents, level,
//       approach and landing, taxi, take-off; the inbound flapping to none and
//       back, Arrived, FR24 quiet spells, the schedule lookup's position, the
//       previous-leg guard, fixes that are not this leg, the direct lookup's
//       answer, a row known only by its tail) is v24066's — the digits,
//       whether they show, every anchor field, the live position — with the
//       same FR24 calls;
//   (b) after a swap (airborne to airborne, on the ground to airborne,
//       airborne to on the ground, and a swap back to the first aircraft)
//       every second is v24066's own answer for an aircraft it starts on from
//       nothing (the ORACLE: v24066 given a fresh state and no previous
//       position at the swap), while v24066 itself shows the previous
//       aircraft's numbers;
//   (c) the previous aircraft's answer landing after the swap (FR24's, the
//       poll's "nothing", the schedule lookup's, the direct lookup's) is
//       dropped: every second is the oracle's with that answer carrying nothing;
//   (d) FR24 calls and Worker requests are v24066's in every replay.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
// the text the "now" build is lifted from (the same file; a mutation check swaps only this one)
const NOW_CORE = CORE;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

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
// the lines between two markers (the first included, the second included only when asked)
const SLICES = {
  // _buildV2MapCol: the live numbers, from the shared cache to the digits it paints
  RENDER: ["      // doesn't blink off on polls where ADB omits the position.\n", "      var _tz = vars.tz || 'UTC';"],
  // the gate render, just before it builds the panel
  GATE_PRE: ['      try { window._gatePanelInbound = inboundFlight || null; } catch (e) {}\n', "\n      if (inboundFlight) {\n        console.log('[FIDS] Inbound for'"],
  // the gate render, just after: the departure-change wipe and the inbound bookkeeping
  GATE_POST: ["      var _prevInbId = window._gateInboundId || '';\n", '      window._gateCurrentFlight = currentFlight;\n', true],
  // the direct inbound lookup's answer
  DIRECT: ['                if (liveSpd !== null || liveAlt !== null || (_latRaw !== null && _lngRaw !== null)) {\n', "                console.log('[FIDS] Direct inbound resolved:'"]
};
function slice(name, core) {
  const [a, b, incl] = SLICES[name];
  const i = core.indexOf(a);
  assert.ok(i >= 0 && core.indexOf(a, i + 1) < 0, name + ': its first marker, once');
  const j = core.indexOf(b, i);
  assert.ok(j > i, name + ': its second marker');
  return core.slice(i, incl ? j + b.length : j);
}
const KIND = {
  _gateTelemKey: 'function', _gateTelemReset: 'function', _gateTelemFor: 'function', _gateLivePosFor: 'function',
  _gateTelemSetReal: 'function', _gateTelemModel: 'function', _animateGateTelem: 'function', _writeGateTelemDom: 'function',
  _gateStickyFix: 'function', _adsbCached: 'function',
  _gateNumbersPoll: 'async function', _adsbTelemetry: 'async function', _adsbFetchOne: 'async function'
};
function text(name, core) {
  if (SLICES[name]) return slice(name, core || CORE);
  const t = decl(KIND[name] + ' ' + name, core || CORE);
  assert.ok(t, name + ' must exist, once');
  return t;
}

// v24066 (fd928aac), sha256 of each text this file lifts
const V66 = {
  _gateTelemSetReal: 'f501c359cd7e309f21d011cef8fd4ad383a0991fd3e6338e26ed29d51fb25cc7',
  _gateTelemModel: '7cc1b2d5ad6073c1c56df0ffa42f565fb60a7751ccea5a2e6c11090e751861b4',
  _animateGateTelem: '31c6e30016fc77b4b6aaaefe3bcb7e4766c1c793e03f5743925055f74bd2053b',
  _writeGateTelemDom: 'c756a96824660de8ec9380b8614795e3a4bdcf189a16bb8f37d546d9444106ee',
  _gateStickyFix: 'f8595820702479ec85ef9bc975a04e1223db4a7b603d36d8b84936a6617a6315',
  _adsbCached: 'eac637cf69756433d5fc744d9cc139b324fc64e40be056a078bcccdb3235d7cf',
  _gateNumbersPoll: 'cdccf833e78aa2819edb2f258377e2ab778c2f1707e1761faf55fb229e9897c6',
  _adsbTelemetry: 'f3ce8f726378162452973e548f125beffcb18f136ac8b95f8d68147e49526be0',
  _adsbFetchOne: 'f907579a8eea60726e6dbee69c5e35b52443b30059eabf5984cc4a606010e819',
  RENDER: '650b8413d2d5edaa2ed5266a615ca8e2455be6967dd2214523c5b8bd7a48aa74',
  GATE_PRE: 'a79f11ebf9c635a7951e77697ef586b3f7ee148eff7ac744ad94e18043f81bbf',
  GATE_POST: 'b24a48b2a42a8a80e5cd921f73b038606830bbbab7cd6ff6a54ded26fa4210a7',
  DIRECT: 'a6ae3aa0951d12c99d8e538daa482ca675a519cf07f25ab4de0a6a01451be52e'
};
// The only edits this release makes to them: [now, v24066]
const EDITS = {
  _gateTelemSetReal: [[
`function _gateTelemSetReal(spdKt, altFt, who) {
  var w = _gateTelemKey(who);
  if (w && window._gateTelemOwner && w !== window._gateTelemOwner) return;
  var T = _gateTelemFor(w);
`,
`function _gateTelemSetReal(spdKt, altFt) {
  var T = window._gateTelemAnim;
`]],
  _gateTelemModel: [[
`    // v24068 — this aircraft's own position and row: after a swap from an
    // aircraft on the ground to one in the air, the one before's "on the
    // ground" eased the new one's altitude toward 0 ft until a poll wrote the
    // new one's own position (_gateLivePosFor; a row of another flight is not
    // this one's either). The animator's ground test is this one.
    var _gp = _gateLivePosFor(T.who);
    var _gi = window._gateInbound;
    if (_gi && T.who && _gateTelemKey(_gi) && _gateTelemKey(_gi) !== T.who) _gi = null;
    if ((_gp && _gp.onGround === true) ||
        (_gi && _gi._liveOnGround === true)) {`,
`    var _gp = window._gateInboundLivePos;
    if ((_gp && _gp.onGround === true) ||
        (window._gateInbound && window._gateInbound._liveOnGround === true)) {`]],
  _gateNumbersPoll: [
    ['        try { _gateTelemSetReal(null, null, inb); } catch (e) {}\n        try { window._gateInboundLivePos = null; } catch (e) {}',
     '        try { _gateTelemSetReal(null, null); } catch (e) {}\n        try { window._gateInboundLivePos = null; } catch (e) {}'],
    ['          try { _gateTelemSetReal(null, null, inb); } catch (e) {}\n          try { if (window._gateInboundLivePos',
     '          try { _gateTelemSetReal(null, null); } catch (e) {}\n          try { if (window._gateInboundLivePos'],
    [`      // v24068 — whose numbers: this poll's row, which a swap during the
      // lookup above can have left behind (_gateTelemSetReal drops it then)
      try { _gateTelemSetReal(_adsb.spd, _adsb.alt, inb); } catch (e) {}`,
     '      try { _gateTelemSetReal(_adsb.spd, _adsb.alt); } catch (e) {}'],
    ["    try { _gateTelemSetReal(liveSpd, liveAlt, inb); } catch (e) {}\n    try { console.log('[NUMPOLL]'",
     "    try { _gateTelemSetReal(liveSpd, liveAlt); } catch (e) {}\n    try { console.log('[NUMPOLL]'"]],
  RENDER: [[
`      // v24068 — and only when that cache is this inbound's (_gateLivePosFor):
      // after a swap it still held the aircraft before's position and numbers.
      var _wpC = _gateLivePosFor(_ib);
`,
`      var _wpC = (window._gateInboundLivePos && typeof window._gateInboundLivePos === 'object') ? window._gateInboundLivePos : null;
`]],
  GATE_PRE: [[
`      // v24068 — and the speed/altitude digits are this inbound's, before this
      // render builds the panel: another inbound for the same departure (or
      // the next) starts them from nothing, and an answer for the inbound
      // before it is dropped from here on (_gateTelemFor, _gateTelemSetReal).
      try {
        window._gateTelemOwner = _gateTelemKey(inboundFlight);
        _gateTelemFor(window._gateTelemOwner);
      } catch (e) {}
`, '']],
  DIRECT: [[
`                  // v24068 — the flight this lookup was for (dropped when the gate
                  // has swapped to another inbound since it was asked)
                  try { _gateTelemSetReal(liveSpd, liveAlt, _capturedInbound); } catch (e) {}`,
'                  try { _gateTelemSetReal(liveSpd, liveAlt); } catch (e) {}']]
};
// v24066's text: this file's with the edits undone (each edit's text there once)
function v66(name) {
  let s = text(name);
  for (const [now, was] of (EDITS[name] || [])) {
    assert.equal(s.split(now).length, 2, name + ': the edit is there once: ' + now.slice(0, 70));
    s = s.replace(now, () => was);
  }
  return s;
}
const NEW_FNS = ['_gateTelemKey', '_gateTelemReset', '_gateTelemFor', '_gateLivePosFor'];
const LIFTED = ['_writeGateTelemDom', '_gateTelemSetReal', '_gateTelemModel', '_animateGateTelem', '_gateStickyFix',
  '_adsbCached', '_adsbTelemetry', '_adsbFetchOne', '_gateNumbersPoll'];
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
  const T = (n) => (build === 'now' ? text(n, NOW_CORE) : v66(n));
  return (build === 'now' ? NEW_FNS.map(T) : []).concat(LIFTED.map(T)).join('\n') + '\n'
    + 'function __render(vars) {\n  var _liveSpd = null, _liveAlt = null;\n  var _ib = vars.inboundFlight;\n  if (!_ib) return null;\n'
    + T('RENDER') + '\n  return { liveSpd: _liveSpd, liveAlt: _liveAlt, spdD: _liveSpdD, altD: _liveAltD };\n}\n'
    + 'function __gatePre(inboundFlight) {\n' + T('GATE_PRE') + '}\n'
    + 'function __gatePost(inboundFlight, currentFlight) {\n' + T('GATE_POST') + '}\n'
    + 'function __direct(_capturedInbound, _capturedIata, liveSpd, liveAlt, _latRaw, _lngRaw) {\n' + T('DIRECT') + '}\n';
}
const EXPORTS = ['_gateTelemSetReal', '_gateTelemModel', '_animateGateTelem', '_gateNumbersPoll', '__render', '__gatePre', '__gatePost', '__direct'];
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
    _acResolvedPut: () => {}, render: env.forced, requestGateRebuild: env.forced,
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
  return (t) => tab.get(Math.max(-300, Math.min(1800, Math.round(t))));
}
const keyOf = (f) => String(f || '').replace(/\s+/g, '').toUpperCase();

// ── one gate screen, second by second ─────────────────────────────────────
// sc: { secs, lag, lat, pk, refreshEvery, dep, rows: { k: row }, planes: { FLIGHT|REG: truth },
//       plan: [[s, rowKey|null]], status: [[s, rowKey, status]], quiet(id, t), direct: [[s, rowKey, spd, alt]],
//       latFor: { FLIGHT: s } (that flight's answers take this long), feed: { FLIGHT: t => livePosition },
//       feedOff: [[s, FLIGHT]] (no feed position for it from s on), implausible: [FLIGHT] (its fixes are not its leg) }
// build 'oracle': v24066, given at each of sc.freshAt a fresh state and no
// previous position before that second's gate render, and from each
// [s, FLIGHT] of sc.dropFrom the Worker's answers for that flight carry nothing.
async function replay(build, sc) {
  const isOracle = build === 'oracle';
  const api = factory(isOracle ? 'v24066' : build);
  const clock = { s: 0 };
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [T0 + clock.s * 1000])); }
    static now() { return T0 + clock.s * 1000; }
  }
  const win = { _gateTelemAnim: INIT(), _gateIata: 'YQM' };
  let els = [];
  const doc = { querySelectorAll: () => els, getElementById: () => null };
  const KV = Object.create(null), pend = [];
  const out = { rows: [], fr24: 0, edge: 0, pendingAt: {} };
  const rows = {};
  for (const [k, r] of Object.entries(sc.rows)) {
    rows[k] = Object.assign({ status: 'En route', _locIata: 'YYZ', _sortTs: T0 + 45 * 60000, _durationMins: 120 }, r);
  }
  const cf = Object.assign({ flight: sc.dep || 'XX900', dest: 'YYZ', _sortTs: T0 + 15 * 60000 }, sc.depRow || {});
  const dropFrom = {};
  if (isOracle) for (const [s, f] of (sc.dropFrom || [])) dropFrom[f] = s;
  function answer(kind, id, t) {
    const tr = sc.planes[id];
    if (!tr || (sc.quiet && sc.quiet(id, t))) return { at: t, quiet: true };
    const taken = t - sc.lag, f = tr(taken);
    return { at: t, taken, ac: { alt_baro: f.ground ? 'ground' : f.alt, gs: f.spd, lat: f.lat, lon: f.lon, track: f.trk,
      baro_rate: f.ground ? 0 : f.vs, flight: id } };
  }
  function fetchStub(url) {
    out.edge++;
    const p = String(url).slice(BASE.length), m = p.match(/^\/(\w+)\/(.+)$/);
    const id = decodeURIComponent(m[2]).toUpperCase(), t = clock.s;
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
  let cur = null;
  function feed(fl) {
    const f = keyOf(fl), src = sc.feed && sc.feed[f];
    const off = (sc.feedOff || []).some(([at, g]) => g === f && clock.s >= at);
    return (src && !off) ? { livePosition: src(clock.s) } : null;
  }
  const plausible = (r) => !(sc.implausible || []).includes(keyOf(r && r.flight));
  const S = scope(stubs({ win, doc, Date: FakeDate, fetch: fetchStub, forced: () => gatePass(), feed, plausible }));
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
    const key = cf.flight + '|' + (ib ? (ib.flight || ib._reg) + '|' + ib.status : '|');
    if (win._lastGateKey !== key) {
      win._lastGateKey = key;
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
    for (const [at, k, st] of (sc.status || [])) if (at === s) { rows[k].status = st; pass = true; }
    if (isOracle && (sc.freshAt || []).includes(s)) { win._gateTelemAnim = INIT(); win._gateInboundLivePos = null; }
    if (pass) gatePass();
    for (const [at, k, spd, alt] of (sc.direct || [])) if (at === s) B.__direct(rows[k].flight, 'YQM', spd, alt, 46.2, -65.1);
    let started = false;
    if (s >= 2 && (s - 2) % 60 === 0) { B._gateNumbersPoll().catch(() => {}); started = true; }
    if (started) await flush();
    if (deliver(s)) await flush();
    out.pendingAt[s] = pend.map((q) => q.id);
    B._animateGateTelem();
    const T = win._gateTelemAnim, lp = win._gateInboundLivePos;
    const sp = els.find((e) => e.getAttribute() === 'spd-kph'), al = els.find((e) => e.getAttribute() === 'alt-ft');
    out.rows.push({ s, vis: els.length > 0, ft: al ? Number(al.textContent) : null, kph: sp ? Number(sp.textContent) : null,
      spd: T.spd, alt: T.alt, realSpd: T.realSpd, realAlt: T.realAlt, realTs: T.realTs,
      prevSpd: T.prevSpd, prevAlt: T.prevAlt, prevTs: T.prevTs, realSecToArr: T.realSecToArr, who: T.who,
      lp: lp ? JSON.stringify(lp) : null, cur });
  }
  return out;
}
const SCREEN = ['vis', 'ft', 'kph'];
const DIGITS = SCREEN.concat(['spd', 'alt', 'realSpd', 'realAlt', 'realTs', 'prevSpd', 'prevAlt', 'prevTs', 'realSecToArr']);
const ALL = DIGITS.concat(['lp']);
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
  ws812: aircraft({ alt: 17000, spd: 260, segs: [{ until: 1e9, vs: -1000, level: 1500, ds: -0.03, turn: 0.1 }] }),
  pd522: aircraft({ alt: 33000, spd: 455, segs: [{ until: 200, vs: 0, level: 33000 }, { until: 1e9, vs: -1500, level: 4000, ds: -0.04 }] }),
  taxi: aircraft({ alt: 0, spd: 0, segs: [{ until: 1e9, ground: true, spd: 14 }] }),
  climb: aircraft({ alt: 4000, spd: 260, segs: [{ until: 1e9, vs: 2200, level: 33000, ds: 0.05 }] }),
  cruise: aircraft({ alt: 37000, spd: 470, segs: [{ until: 1e9, vs: 0, level: 37000 }] }),
  approach: aircraft({ alt: 9000, spd: 210, segs: [{ until: 1e9, vs: -800, level: 600, ds: -0.04, turn: 0.3 }] })
};
const row = (flight, extra) => Object.assign({ flight }, extra || {});
const pollSeconds = (secs) => { const a = []; for (let s = 2; s <= secs; s += 60) a.push(s); return a; };
// a swap second at least `gap` s clear of every poll's answer
function clearOfPolls(R, lo, hi, lat) {
  for (;;) {
    const s = lo + Math.floor(R() * (hi - lo));
    if (pollSeconds(hi + 60).every((p) => s < p || s > p + lat + 1)) return s;
  }
}

// ═══ the texts ═════════════════════════════════════════════════════════════
test('text: every lifted text with this release\'s edits undone is v24066\'s, byte for byte', () => {
  for (const name of Object.keys(V66)) assert.equal(sha(v66(name)), V66[name], name);
  // the unedited ones are v24066's as they stand
  for (const name of ['_animateGateTelem', '_writeGateTelemDom', '_gateStickyFix', '_adsbCached', '_adsbTelemetry', '_adsbFetchOne', 'GATE_POST']) {
    assert.equal(sha(text(name)), V66[name], name + ' is unchanged');
  }
});

test('text: whose numbers, at every place a reading reaches the anchor', () => {
  assert.deepEqual(CORE.match(/_gateTelemSetReal\([^;{}]*\);/g), [
    '_gateTelemSetReal(null, null, inb);',
    '_gateTelemSetReal(null, null, inb);',
    '_gateTelemSetReal(_adsb.spd, _adsb.alt, inb);',
    '_gateTelemSetReal(liveSpd, liveAlt, inb);',
    '_gateTelemSetReal(_liveSpd, _liveAlt);',          // the render: the gate render set _gateTelemOwner just before it
    '_gateTelemSetReal(liveSpd, liveAlt, _capturedInbound);'
  ]);
  // the departure-change wipe is v24066's (GATE_POST is unchanged) and it is the only other whole-object write
  assert.equal((CORE.match(/window\._gateTelemAnim = \{/g) || []).length, 2, 'the wipe and _gateTelemReset');
  assert.equal((CORE.match(/window\._gateTelemAnim = window\._gateTelemAnim \|\| \{/g) || []).length, 1, 'the first state is v24066\'s');
});

test('text: the new pieces ask for nothing and change no interval', () => {
  for (const n of NEW_FNS) {
    const s = text(n).replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(s, /fetch\(|XMLHttpRequest|_adsbTelemetry\(|_adsbFetchOne\(|_adsbCached\(|loadFlight\(|setTimeout|setInterval|requestGateRebuild|render\(/, n);
  }
  const pre = text('GATE_PRE').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(pre, /fetch\(|_adsb|loadFlight\(|setTimeout|setInterval|render\(/, 'the gate render\'s new lines');
});

// ═══ the helpers, rule by rule ═════════════════════════════════════════════
function unit() {
  const win = { _gateTelemAnim: INIT() };
  let now = T0;
  class D extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const B = factory('now')(scope(stubs({ win, doc: { querySelectorAll: () => [], getElementById: () => null }, Date: D, fetch: () => new Promise(() => {}),
    forced: () => {}, feed: () => null, plausible: () => true })));
  return { B, win, tick(n) { for (let i = 0; i < (n || 1); i++) { now += 1000; B._animateGateTelem(); } }, step(ms) { now += ms; } };
}

test('whose: the flight number, spaces and case ignored; a row without one is nobody\'s', () => {
  const { B } = unit();
  assert.equal(B._gateTelemKey({ flight: 'ws 812' }), 'WS812');
  assert.equal(B._gateTelemKey('Pd522'), 'PD522');
  assert.equal(B._gateTelemKey({ _reg: 'C-GKQE' }), '', 'a tail is not a flight number: no owner');
  assert.equal(B._gateTelemKey(null), '');
  assert.equal(B._gateTelemKey(undefined), '');
});

test('the state: nobody\'s is adopted as it stands, another aircraft\'s is replaced whole', () => {
  const u = unit();
  // an unowned reading (a row with no flight number), then the same screen learns the flight: kept, as before
  u.B._gateTelemSetReal(300, 9000);
  const T = u.win._gateTelemAnim;
  assert.equal(u.B._gateTelemFor('WS812'), T, 'the same object');
  assert.equal(T.who, 'WS812');
  assert.equal(T.realAlt, 9000, 'its reading kept');
  assert.equal(u.B._gateTelemFor('WS812'), T, 'still its own');
  // another aircraft: every field from nothing
  u.step(60000);
  u.B._gateTelemSetReal(290, 8000, 'WS812');
  assert.equal(T.prevAlt, 9000);
  const N = u.B._gateTelemFor('PD522');
  assert.notEqual(N, T, 'a new object');
  assert.equal(u.win._gateTelemAnim, N);
  assert.deepEqual(Object.assign({}, N), Object.assign(INIT(), { who: 'PD522' }), 'v24066\'s first state, owned');
  assert.equal(u.B._gateTelemFor(''), N, 'no flight: whatever is there');
});

test('the anchor: an answer for another flight than the gate\'s is dropped; whose numbers otherwise as before', () => {
  const u = unit();
  u.win._gateTelemOwner = 'PD522';
  u.B._gateTelemSetReal(455, 31000, { flight: 'PD522' });
  const T = u.win._gateTelemAnim;
  u.step(5000);
  u.B._gateTelemSetReal(250, 9000, { flight: 'WS812' });
  assert.equal(u.win._gateTelemAnim, T, 'the late answer changes nothing');
  assert.deepEqual([T.realSpd, T.realAlt, T.prevAlt], [455, 31000, undefined]);
  u.B._gateTelemSetReal(null, null, 'WS812');
  assert.equal(T.realAlt, 31000, 'nor does its "nothing"');
  u.step(60000);
  u.B._gateTelemSetReal(450, 30000, 'pd 522');
  assert.deepEqual([T.realAlt, T.prevAlt], [30000, 31000], '"pd 522" is PD522');
  // no owner on the screen (no inbound shown): another aircraft's reading starts from nothing
  u.win._gateTelemOwner = '';
  u.B._gateTelemSetReal(250, 9000, 'WS812');
  const N = u.win._gateTelemAnim;
  assert.notEqual(N, T);
  assert.deepEqual([N.who, N.realAlt, N.prevAlt, N.alt], ['WS812', 9000, undefined, 9000]);
  // no `who` at all: v24066's anchor on whatever is there
  u.step(30000);
  u.B._gateTelemSetReal(240, 8500);
  assert.deepEqual([N.realAlt, N.prevAlt], [8500, 9000]);
});

test('the live position: another flight\'s is not this one\'s; unstamped, or for a row with no flight number, as before', () => {
  const { B, win } = unit();
  const lp = { speed: 250, altitude: 9000, fl: 'WS812' };
  win._gateInboundLivePos = lp;
  assert.equal(B._gateLivePosFor({ flight: 'PD522' }), null);
  assert.equal(B._gateLivePosFor({ flight: 'ws 812' }), lp);
  assert.equal(B._gateLivePosFor('WS812'), lp);
  assert.equal(B._gateLivePosFor({ _reg: 'C-GKQE' }), lp, 'a row with no flight number: as before');
  assert.equal(B._gateLivePosFor(''), lp);
  win._gateInboundLivePos = { speed: 250, altitude: 9000, fl: '' };
  assert.equal(B._gateLivePosFor({ flight: 'PD522' }), win._gateInboundLivePos, 'unstamped: as before');
  win._gateInboundLivePos = null;
  assert.equal(B._gateLivePosFor({ flight: 'PD522' }), null);
});

test('the model\'s ground test: this aircraft\'s own position and row only', () => {
  const air = (u) => { u.win._gateTelemOwner = 'PD522'; u.B._gateTelemSetReal(455, 31000, 'PD522'); return u.win._gateTelemAnim; };
  // another flight's position on the ground: not this one's
  { const u = unit(); const T = air(u); u.win._gateInboundLivePos = { onGround: true, fl: 'WS812' }; u.tick(10); assert.equal(Math.round(T.alt), 31000); }
  // its own: the trend is dead, the altitude eases to 0 (v24066's rule)
  { const u = unit(); const T = air(u); u.win._gateInboundLivePos = { onGround: true, fl: 'PD522' }; u.tick(10); assert.ok(T.alt < 31000 * 0.1, String(T.alt)); }
  // unstamped: as before
  { const u = unit(); const T = air(u); u.win._gateInboundLivePos = { onGround: true }; u.tick(10); assert.ok(T.alt < 31000 * 0.1); }
  // another flight's row on the ground: not this one's; a row with no flight number: as before
  { const u = unit(); const T = air(u); u.win._gateInbound = { flight: 'WS812', _liveOnGround: true }; u.tick(10); assert.equal(Math.round(T.alt), 31000); }
  { const u = unit(); const T = air(u); u.win._gateInbound = { flight: 'pd 522', _liveOnGround: true }; u.tick(10); assert.ok(T.alt < 31000 * 0.1); }
  { const u = unit(); const T = air(u); u.win._gateInbound = { _reg: 'C-GKQE', _liveOnGround: true }; u.tick(10); assert.ok(T.alt < 31000 * 0.1); }
  // a state nobody owns reads whatever is there, as before
  { const u = unit(); u.B._gateTelemSetReal(455, 31000); const T = u.win._gateTelemAnim; u.win._gateInboundLivePos = { onGround: true, fl: 'WS812' }; u.tick(10); assert.ok(T.alt < 31000 * 0.1); }
});

// ═══ (a) no swap: v24066, every second ═════════════════════════════════════
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
    dep: 'XX900', rows: {}, planes: {}, plan: [[0, 'A']], status: [], direct: [] };
  const tr = randomProfile(R);
  if (R() < 0.08) {
    // a row known only by its tail: the poll looks up the departure, flown by the same aircraft
    sc.rows.A = { _reg: 'C-GKQE' };
    sc.planes['C-GKQE'] = tr; sc.planes.XX900 = tr;
  } else {
    const fl = pick(['WS812', 'PD522', 'AC644', 'ac 644', 'Ws812', 'TS 101', 'F8 2290', 'PD2381']);
    sc.rows.A = { flight: fl };
    sc.planes[keyOf(fl)] = tr;
    if (R() < 0.12) sc.rows.A._depTs = T0 + (20 * 60 + Math.floor(R() * secs)) * 1000;   // a fix on a previous leg, until then
  }
  // the inbound flapping to none and back (the gate keeps the last known inbound)
  const flaps = Math.floor(R() * 3);
  for (let i = 0; i < flaps; i++) { const a = 5 + Math.floor(R() * (secs - 60)); sc.plan.push([a, null], [a + 1 + Math.floor(R() * 40), 'A']); }
  sc.plan.sort((x, y) => x[0] - y[0]);
  if (R() < 0.25) sc.status.push([30 + Math.floor(R() * (secs - 30)), 'A', pick(['Arrived', 'Landed 14:09', 'Delayed'])]);
  if (R() < 0.2) { const q0 = Math.floor(R() * secs), q1 = q0 + 60 + Math.floor(R() * 240); sc.quiet = (id, t) => t >= q0 && t < q1; }
  if (sc.rows.A.flight && R() < 0.3) for (let i = 0; i < 1 + Math.floor(R() * 3); i++) {
    const at = Math.floor(R() * secs), f = tr(at - 30);
    sc.direct.push([at, 'A', f.ground ? 0 : f.spd, f.ground ? 0 : f.alt]);
  }
  // the schedule lookup's position, used when FR24 has nothing; fixes that are not this leg
  if (sc.rows.A.flight && R() < 0.25) { const lagF = 30 + Math.floor(R() * 200); sc.feed = { [keyOf(sc.rows.A.flight)]: (t) => { const f = tr(t - lagF); return { speed: f.spd, alt: f.ground ? 0 : f.alt, lat: f.lat, lng: f.lon }; } }; }
  if (sc.rows.A.flight && R() < 0.06) sc.implausible = [keyOf(sc.rows.A.flight)];
  return sc;
}

test('(a) no swap: 1,200 random loads are v24066\'s every second, with the same FR24 calls', async () => {
  let seconds = 0, shown = 0, moved = 0;
  for (let seed = 1; seed <= 1200; seed++) {
    const sc = randomLoad(seed);
    const a = await replay('v24066', sc), b = await replay('now', sc);
    assert.deepEqual(diff(a, b, ALL).slice(0, 3), [], 'seed ' + seed);
    assert.equal(b.fr24, a.fr24, 'FR24 calls, seed ' + seed);
    assert.equal(b.edge, a.edge, 'Worker requests, seed ' + seed);
    seconds += b.rows.length;
    shown += b.rows.filter((r) => r.vis).length;
    if (b.rows.some((r, i) => i && r.vis && b.rows[i - 1].vis && r.ft !== b.rows[i - 1].ft)) moved++;
  }
  // what was compared: 576,219 seconds, 364,368 of them with digits on the
  // screen, on 506 loads the digits move (measured; the last two kept as floors)
  assert.equal(seconds, 576219, 'seconds compared');
  assert.ok(shown >= 360000, 'seconds with digits: ' + shown);
  assert.ok(moved >= 500, 'loads whose digits move: ' + moved);
  assert.deepEqual([...MISSING], [], 'every free name the lifted code reads is stubbed');
});

// ═══ (b) the swaps: the oracle's, every second ═════════════════════════════
// v24066 shows the previous aircraft's numbers on the new one; this build is
// v24066's answer for an aircraft it starts on from nothing.
function swapCase(R, A, B, extra) {
  const lat = Math.floor(R() * 5), at = clearOfPolls(R, 130, 420, lat);
  return Object.assign({ secs: at + 300, lag: 1 + Math.floor(R() * 10), lat, pk: Math.floor(R() * 170), refreshEvery: [0, 15, 30, 60][Math.floor(R() * 4)],
    dep: 'WS813', rows: { A: row(A.flight), B: row(B.flight) }, planes: { [keyOf(A.flight)]: A.tr, [keyOf(B.flight)]: B.tr },
    plan: [[0, 'A'], [at, 'B']], freshAt: [at], at }, extra || {});
}
async function checkSwap(sc, tag) {
  const a = await replay('v24066', sc), b = await replay('now', sc), o = await replay('oracle', sc);
  assert.deepEqual(diff(a, b, ALL, 0, sc.at), [], tag + ': v24066\'s before the swap');
  assert.deepEqual(diff(o, b, DIGITS).slice(0, 3), [], tag + ': the oracle\'s, every second');
  assert.equal(b.fr24, a.fr24, tag + ': FR24 calls'); assert.equal(o.fr24, a.fr24, tag + ': FR24 calls (oracle)');
  assert.equal(b.edge, a.edge, tag + ': Worker requests');
  for (let i = sc.at; i < b.rows.length; i++) if (b.rows[i].realTs) assert.equal(b.rows[i].who, keyOf(sc.rows[b.rows[i].cur].flight), tag + ': whose at ' + i);
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

test('(b) the swaps: every second is the oracle\'s; v24066 shows the previous aircraft\'s numbers', async () => {
  for (const [name, [A, B]] of Object.entries(SWAPS)) {
    let wrong = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sc = swapCase(rng(seed * 104729 + name.length), A, B);
      const { a, o } = await checkSwap(sc, name + ' seed ' + seed);
      if (diff(o, a, SCREEN, sc.at).length) wrong++;
    }
    // the replays reproduce the bug: on every one, v24066's screen is off the oracle's after the swap
    assert.equal(wrong, 40, name + ': v24066\'s screen off the oracle\'s after the swap');
  }
});

test('(b) the swap the fix comes from: WS812\'s 9,000 ft is not PD522\'s, and PD522\'s digits do not climb', async () => {
  // PD522 descending at 1,500 ft/min from 31,000 ft; the gate was showing WS812 at about 9,000 ft
  const sc = { secs: 600, lag: 5, lat: 2, pk: 60, refreshEvery: 30, dep: 'WS813', at: 260,
    rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 }, plan: [[0, 'A'], [260, 'B']], freshAt: [260] };
  const { a, b } = await checkSwap(sc, 'WS812 to PD522');
  const after = (r) => r.rows.slice(sc.at).filter((x) => x.vis);
  // v24066: PD522's panel showed WS812's altitude, then climbed while PD522 descended
  assert.ok(after(a).some((x) => x.ft < 12000), 'v24066 shows WS812\'s altitude on PD522\'s panel');
  const rises = (r) => after(r).filter((x, i, arr) => i && x.ft > arr[i - 1].ft).length;
  assert.ok(rises(a) > 30, 'v24066 climbs PD522\'s digits: ' + rises(a) + ' rising seconds');
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
  assert.ok(window_(a).some((x) => x.ft < 5000), 'v24066 eases them toward 0 ft: ' + Math.min(...window_(a).map((x) => x.ft)));
  assert.ok(window_(b).every((x) => x.ft > 25000), 'this build holds PD522\'s own: ' + Math.min(...window_(b).map((x) => x.ft)));
});

test('(b) airborne to on the ground: the aircraft on the ground shows no airborne numbers', async () => {
  for (let seed = 1; seed <= 20; seed++) {
    const sc = swapCase(rng(seed * 31 + 7), { flight: 'WS812', tr: P.ws812 }, { flight: 'AC644', tr: P.taxi });
    const { a, b } = await checkSwap(sc, 'WS812 to AC644 seed ' + seed);
    assert.ok(b.rows.slice(sc.at).every((x) => !x.vis), 'no digits on the aircraft on the ground, seed ' + seed);
    if (seed === 1) assert.ok(a.rows.slice(sc.at).some((x) => x.vis && x.ft > 1000), 'v24066 showed WS812\'s');
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
    for (let i = s2; i < b.rows.length; i++) if (b.rows[i].realTs) assert.equal(b.rows[i].who, 'WS812');
    if (diff(o, a, SCREEN, s2).length) wrong++;
  }
  assert.equal(wrong, 30, 'v24066\'s screen off the oracle\'s after the swap back');
});

// ═══ (c) the previous aircraft's late answer ═══════════════════════════════
// The poll asked FR24 for the previous aircraft (A); the gate swapped to B
// while the answer was on its way, and B's own first answer came back first.
// Every second is the oracle's (v24066 given a fresh state at the swap, and
// A's answers from the swap on carrying nothing). v24066 is off it on every
// one: on the screen for an answer with numbers; for the poll's "nothing" (a
// fix on a previous leg, or not this leg) in the state under the digits (it
// cleared B's reading and its time).
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
    assert.equal(wrong, 30, name + ': v24066 off the oracle after the late answer');
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
    const a = await replay('v24066', sc);
    if (a.rows.slice(p + latA).some((x) => x.realAlt === fpos(p).alt)) wrong++;
  }
  assert.equal(wrong, 20, 'v24066 anchored WS812\'s feed position as PD522\'s');
});

test('(c) the direct lookup\'s answer for the previous aircraft is dropped too', async () => {
  const sc = { secs: 420, lag: 5, lat: 2, pk: 60, refreshEvery: 30, dep: 'WS813', at: 200,
    rows: { A: row('WS812'), B: row('PD522') }, planes: { WS812: P.ws812, PD522: P.pd522 }, plan: [[0, 'A'], [200, 'B']], direct: [[230, 'A', 245, 8800]] };
  const b = await replay('now', sc);
  const none = await replay('now', Object.assign({}, sc, { direct: [] }));
  assert.deepEqual(diff(none, b, DIGITS), [], 'as if it had never come');
  const a = await replay('v24066', sc);
  assert.equal(a.rows[230].realAlt, 8800, 'v24066 anchored WS812\'s 8,800 ft as PD522\'s');
});
