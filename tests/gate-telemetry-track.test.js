'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24068 — THE GATE MAP'S ALTITUDE MOVES FROM THE FIRST SECOND WHEN THE
// FLIGHT'S TRACK IS KNOWN.
//
// After a gate screen loaded, the inbound's speed and altitude digits sat
// still for one to three minutes: the model (_gateTelemModel) carries a rate
// only between TWO different readings, and the Worker hands every screen the
// same Flightradar24 answer for up to 180 s.
//
// What the board does now, and what these tests hold it to:
//   - while the model holds one reading and nothing before it, and that
//     reading is an FR24 answer the flight's recorded track (/fltrack/, the
//     copy the map already fetched) holds, the track's latest point 30 to
//     240 s older than it (FR24's own times) is given to v24065's own anchor
//     as the reading before it, when that point and every point after it are
//     airborne and its altitude is more than 200 ft from the reading's; the
//     altitude digits then move by v24065's own two-reading carry, and are,
//     every second, the digits of an ORACLE: v24065's code given that point
//     as its first reading, the point never drawn (the digits start at this
//     screen's own reading);
//   - the speed holds as in v24065: the speed digits are v24065's every
//     second, with or without a track;
//   - from the second different reading on, the model is v24065's two
//     readings, the same anchor, rate and time;
//   - with no track (or no such point, the reading not in the track, no FR24
//     time, a point on the ground, a change of 200 ft or less, on the ground,
//     Arrived) the digits are v24065's, every second;
//   - a reading's own vertical speed is never read: level flight stays level
//     whatever the answer's vertical speed says, and whatever ±100 ft the
//     altitude flickers by;
//   - a different inbound starts from nothing, an answer for the inbound
//     before it is ignored, and neither the render nor the model reads the
//     shared live position of another flight;
//   - nothing here asks for anything: FR24 calls and track fetches are the
//     same as v24065's in every replay, and nothing under workers/ changes.
//
// v24065's texts are frozen in this file (hash-checked), so every replay
// runs against v24065 itself, not against this file's code with its edits
// undone. Tests named "text:" compare texts; every other test is behaviour.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// a top-level function's text, or null when there is none
function fnText(name, src) {
  const core = src || CORE;
  const at = core.indexOf('\nfunction ' + name + '(');
  if (at < 0) return null;
  let i = core.indexOf('{', at), depth = 0;
  for (; i < core.length; i++) {
    if (core[i] === '{') depth++;
    else if (core[i] === '}' && --depth === 0) return core.slice(at + 1, i + 1);
  }
  return null;
}
function fnSource(name) {
  const s = fnText(name);
  assert.ok(s, name + ' must exist');
  return s;
}
function renderLines(src) {
  const a = src.indexOf('      var _wpC = ');
  const b = src.indexOf('      var _tAnim = window._gateTelemAnim || {};', a);
  return (a > 0 && b > a) ? src.slice(a, b) : null;
}

// ── v24065, as it shipped: frozen, and checked against its own hashes ──────
const V65_SET_REAL = `function _gateTelemSetReal(spdKt, altFt) {
  var T = window._gateTelemAnim;
  var sp = (typeof spdKt === 'number') ? spdKt : null;
  var al = (typeof altFt === 'number') ? altFt : null;
  if (sp === null && al === null) {
    T.spd = null; T.alt = null; T.realSpd = null; T.realAlt = null; T.realSecToArr = null;
    return;
  }
  if (sp === T.realSpd && al === T.realAlt) return;   // unchanged fix → keep drifting
  var now = Date.now();
  // Remember the PREVIOUS real fix — the pair (prev, real) measures the
  // actual climb/descent/accel rate, which the model below continues
  // between pings.
  if (T.realTs) { T.prevSpd = T.realSpd; T.prevAlt = T.realAlt; T.prevTs = T.realTs; }
  T.realSpd = sp; T.realAlt = al; T.realTs = now;
  // A fresh ping re-anchors the MODEL; the per-second animator EASES the
  // displayed digits onto it over ~10 s
  // — no hard snap after a frozen minute.
  // Only a first-ever anchor is written directly (nothing to ease from).
  if (T.spd === null && sp !== null) T.spd = sp;
  if (T.alt === null && al !== null) T.alt = al;
  _writeGateTelemDom();
  var inb = window._gateInbound;
  var arrTs = inb && (inb._revTs || inb._sortTs);
  T.realSecToArr = (arrTs && arrTs > now) ? (arrTs - now) / 1000 : null;
}`;
const V65_ANIMATE = `function _animateGateTelem() {
  var T = window._gateTelemAnim;
  var m = _gateTelemModel();
  if (!m) return;
  // The model is the last real anchor plus its bounded measured trend. The
  // DISPLAYED digits ease toward it ~22%/s — smooth continuous motion while
  // the trend runs, and a ~10 s visible 'catch-up' whenever a fresh ping
  // moves the anchor, instead of the old snap-freeze-snap cadence.
  if (typeof m.spd === 'number') T.spd = (typeof T.spd === 'number') ? T.spd + (m.spd - T.spd) * 0.22 : m.spd;
  if (typeof m.alt === 'number') T.alt = (typeof T.alt === 'number') ? T.alt + (m.alt - T.alt) * 0.22 : m.alt;
  _writeGateTelemDom();
}`;
const V65_MODEL = `function _gateTelemModel() {
  var T = window._gateTelemAnim;
  if (T.realAlt === null && T.realSpd === null) return null;
  var spd = T.realSpd, alt = T.realAlt;
  // v23100 — ON THE GROUND THE TREND IS DEAD. After touchdown the bridge
  // kept carrying the last measured altitude rate (a baro→ground blip can
  // even measure a CLIMB) while the speed honoured the real zero — a screen
  // recording read 'Speed 0 kph / Altitude 1,576 ft' and RISING, at the gate. On
  // the ground the digits are the real anchor with no trend: speed as
  // reported, altitude 0 — the displayed number eases down and stays.
  try {
    var _gp = window._gateInboundLivePos;
    if ((_gp && _gp.onGround === true) ||
        (window._gateInbound && window._gateInbound._liveOnGround === true)) {
      return { spd: (typeof spd === 'number' ? spd : 0), alt: 0 };
    }
  } catch (e) {}
  // TREND BRIDGE — the map glide's rule applied to the digits (
  // approximate first, then adjust with the pings). Between real fixes,
  // continue the RATE measured between the last two fixes, so a plane on
  // final keeps visibly descending instead of freezing at the last ping
  // for 60 s (video: locked at 230 kph / 825 ft through the approach).
  // This is measured motion carried forward, not an invented profile:
  // clamped to sane rates, trusted max 360 s (tapered), re-anchored by
  // every ping.
  try {
    var now = Date.now();
    var age = (now - (T.realTs || 0)) / 1000;
    // TRUST WINDOW = the real inter-ping gap. ADB's upstream often repeats
    // the SAME fix for 3-5 minutes; the old 90 s cap froze the digits for
    // the back half of every such gap — glide, stall, lurch
    // The measured rate now
    // carries the WHOLE gap: full strength for 120 s, HALF strength out to
    // 360 s (accumulated-error damping — a noise blip can't run at full
    // rate for six minutes), then HELD saturated. Held, never dropped: the
    // old code gated on age and REVERTED to the raw stale anchor when the
    // window expired — the display glided down for 90 s then eased back UP
    // to the old ping (an altimeter climbing on final). Still measured
    // motion carried forward, never an invented profile: rate caps below,
    // floor 0, re-anchored by every genuinely fresh ping.
    if (T.prevTs && T.realTs && T.realTs > T.prevTs && age > 0) {
      var span = (T.realTs - T.prevTs) / 1000;
      // DAMPED: two pings can differ by a wind/ADS-B noise blip (
      // 757 kph to 867, climbing, in under a minute) — tight rate caps
      // keep the carried trend sane at any age.
      var effAge = Math.min(age, 120) + Math.max(0, Math.min(age, 360) - 120) * 0.5;
      if (span >= 10 && span <= 420) {
        if (typeof T.prevAlt === 'number' && typeof alt === 'number') {
          var altRate = (alt - T.prevAlt) / span;                     // ft/s
          altRate = Math.max(-30, Math.min(30, altRate));             // ≤1800 fpm
          alt = Math.max(0, alt + altRate * effAge);
        }
        if (typeof T.prevSpd === 'number' && typeof spd === 'number') {
          var spdRate = (spd - T.prevSpd) / span;                     // kt/s
          spdRate = Math.max(-0.5, Math.min(0.5, spdRate));           // ≤~55 km/h per bridge
          spd = Math.max(0, spd + spdRate * effAge);
        }
      }
    }
  } catch (e) {}
  return { spd: spd, alt: alt };
}`;
const V65_RENDER = `      var _wpC = (window._gateInboundLivePos && typeof window._gateInboundLivePos === 'object') ? window._gateInboundLivePos : null;
      // v22889 — ADS-B FIRST. The 60-second gate poll mutates the inbound
      // object it fetched; the renderer frequently holds a DIFFERENT object
      // for the same flight, so those mutations never arrived and SPD/ALT
      // rendered blank while live data was demonstrably reaching the page.
      // Reading the shared cache removes that coupling entirely.
      var _adsbC = null;
      // v23331 — no lookup outside the leg's window (see _gateLegWindowOpen):
      // a pre-departure or long-landed inbound spent FR24 budget every poll
      // and could only ever answer with some other leg of the same tail.
      try {
        if (typeof _gateLegWindowOpen !== 'function' || _gateLegWindowOpen(_ib, vars.iata)) {
          _adsbC = _adsbCached(_ib._reg, _ib._callSign, _ib.flight, null, _ib._modeS || (_ib.aircraft && _ib.aircraft.modeS));
        }
      } catch (e) {}
      var _candAlt = (_adsbC && typeof _adsbC.alt === 'number') ? _adsbC.alt
                   : (typeof _ib._liveAlt === 'number') ? _ib._liveAlt
                   : (_wpC && typeof _wpC.altitude === 'number' ? _wpC.altitude : null);
      var _candSpd = (_adsbC && typeof _adsbC.spd === 'number') ? _adsbC.spd
                   : (typeof _ib._liveSpd === 'number') ? _ib._liveSpd
                   : (_wpC && typeof _wpC.speed === 'number' ? _wpC.speed : null);
      // Position comes from the shared resolver (_gateLiveFix), so the big
      // takeover map cannot resolve it differently. Behaviour is unchanged
      // here — that helper IS this precedence, lifted out to one place.
      var _candFix = (typeof _gateLiveFix === 'function') ? _gateLiveFix(_ib) : null;
      var _candLat = _candFix ? _candFix.lat : null;
      var _candLng = _candFix ? _candFix.lng : null;
      if (_adsbC && _adsbC.onGround === true) _ib._liveOnGround = true;
      var _arrivedLikeIb = /arriv|land|cancel/i.test(String(_ib.status || ''));
      if (_ib._liveOnGround === true || _arrivedLikeIb) { _candAlt = null; _candSpd = null; }
      // Physically impossible for this airframe → someone else's fix. Show
      // nothing rather than a lie (Q400 'at 36,000 ft').
      if (typeof _liveFixPhysOk === 'function' && !_liveFixPhysOk(_ib)) {
        _candAlt = null; _candSpd = null; _candLat = null; _candLng = null;
      }
      // LEG-WINDOW GUARD.
      // ADB's withLocation position belongs to the AIRFRAME, not the leg — it
      // can be a stale cruise fix from a previous flight or linger after
      // landing. A fix only counts as THIS leg being airborne inside the
      // leg's plausible window: from ~its departure (arrival − duration −
      // 25 min pad) until arrival + ARR_CONFIRM_MIN (v23925: it was 8 min, the
      // same close the lookups had). Outside that, show nothing.
      try {
        var _lwArr = (_ib._revTs && _ib._revTs > _ib._sortTs) ? _ib._revTs : (_ib._sortTs || 0);
        if (_lwArr) {
          var _lwSpan = ((_ib._durationMins || 240) + 25) * 60000;
          var _lwNow = Date.now();
          if (_lwNow < _lwArr - _lwSpan || _lwNow > _lwArr + ARR_CONFIRM_MIN * 60000) {
            _candAlt = null; _candSpd = null; _candLat = null; _candLng = null;
            if (_gateFixCache && _gateFixCache.key === String(_ib.flight || _ib._reg || '')) _gateFixCache = null;
          }
        }
      } catch (e) {}
      // Once on the ground there is no airborne fix to hold — drop the cache so
      // the panel/map don't keep showing a stale cruise position post-landing.
      if (_arrivedLikeIb && _gateFixCache && _gateFixCache.key === String(_ib.flight || _ib._reg || '')) _gateFixCache = null;
      var _sfix = _gateStickyFix(String(_ib.flight || _ib._reg || ''), _candLat, _candLng, _candAlt, _candSpd);
      _liveSpd = (_sfix && typeof _sfix.spd === 'number') ? _sfix.spd : null;
      _liveAlt = (_sfix && typeof _sfix.alt === 'number') ? _sfix.alt : null;
      // Speed and altitude appear together or not at all — never one without a
      // genuine airborne altitude (that produced "141 kph at 0 ft").
      if (_liveAlt === null || _liveAlt <= 0) { _liveAlt = null; _liveSpd = null; }
      // —
      // a render that momentarily lost the fix dropped the Speed/Altitude
      // bar entirely and the map re-flowed around it, then the next fix
      // brought it back. Hold the last airborne reading for up to 3 minutes
      // across fix gaps; landing clears it (arrived-like drops the cache
      // above and we clear the hold with it).
      if (_arrivedLikeIb) { window._gateTelemHold = null; }
      else if (_liveSpd === null && _liveAlt === null) {
        var _tHold = window._gateTelemHold;
        if (_tHold && _tHold.key === String(_ib.flight || _ib._reg || '') && (Date.now() - _tHold.ts) < 180000) {
          _liveSpd = _tHold.spd; _liveAlt = _tHold.alt;
        }
      } else {
        window._gateTelemHold = { key: String(_ib.flight || _ib._reg || ''), spd: _liveSpd, alt: _liveAlt, ts: Date.now() };
      }
      // Feed the real reading to the live-telemetry animator and DISPLAY its
      // current modeled value, so numbers glide between fixes and a full
      // re-render doesn't snap them back to the last raw fix (see
      // _gateTelemSetReal / _animateGateTelem).
      try { _gateTelemSetReal(_liveSpd, _liveAlt); } catch (e) {}
`;
const V65_HASH = {
  _gateTelemSetReal: 'f501c359cd7e309f21d011cef8fd4ad383a0991fd3e6338e26ed29d51fb25cc7',
  _animateGateTelem: '31c6e30016fc77b4b6aaaefe3bcb7e4766c1c793e03f5743925055f74bd2053b',
  _gateTelemModel: '7cc1b2d5ad6073c1c56df0ffa42f565fb60a7751ccea5a2e6c11090e751861b4',
  _writeGateTelemDom: 'c756a96824660de8ec9380b8614795e3a4bdcf189a16bb8f37d546d9444106ee',
  _gateStickyFix: 'f8595820702479ec85ef9bc975a04e1223db4a7b603d36d8b84936a6617a6315',
  _gateFlownPath: 'a5b9a2bfdbe59f9a55f1c0d77adaa8f4dfbaa740d3a828098aac427ac8c03541',
  render: '1fdd77f026e92b2eafc0445d2f8fb5126a28697837861ee46862bad087f869fb'
};
// The only edits this branch makes to v24065's model and render lines.
const MODEL_EDIT = [
`    // v24068 — this aircraft's own position and row (_gateLivePosFor): after
    // the gate re-paired from an aircraft on the ground to one in the air, the
    // one before's "on the ground" eased the new one's altitude toward 0 ft.
    var _gp = T.who ? _gateLivePosFor(T.who) : window._gateInboundLivePos;
    var _gi = window._gateInbound;
    if (_gi && T.who && _gateTelemKey(_gi) !== T.who) _gi = null;
    if ((_gp && _gp.onGround === true) ||
        (_gi && _gi._liveOnGround === true)) {`,
`    var _gp = window._gateInboundLivePos;
    if ((_gp && _gp.onGround === true) ||
        (window._gateInbound && window._gateInbound._liveOnGround === true)) {`];
const RENDER_EDITS = [
  [`      var _wpC = _gateLivePosFor(_ib);`,
  `      var _wpC = (window._gateInboundLivePos && typeof window._gateInboundLivePos === 'object') ? window._gateInboundLivePos : null;`],
  [`      // v24068 — whose numbers, and the ADS-B answer they are when they are
      // its numbers (not a held reading or the feed's)
      try {
        var _tFix = (_adsbC && _adsbC.onGround !== true && _liveAlt !== null && _liveAlt === _adsbC.alt && _liveSpd === _adsbC.spd) ? _adsbC : null;
        _gateTelemSetReal(_liveSpd, _liveAlt, _ib, _tFix);
      } catch (e) {}`,
  `      try { _gateTelemSetReal(_liveSpd, _liveAlt); } catch (e) {}`]];

// ── the two builds, lifted into one sandbox each ───────────────────────────
// "now" is this file's code, whatever of it there is (on a tree without these
// functions the replays still run, and fail on what the digits do).
const SANDBOX_PRE = 'var _gateFixCache = null; var _GATE_FIX_TTL = 240000; var ARR_CONFIRM_MIN = 30;\n'
  + 'var _flownCache = Object.create(null);\n'
  + 'function _gateTrackPush(){}\nfunction _gateLegWindowOpen(){ return true; }\nfunction _gateLiveFix(){ return null; }\nfunction _liveFixPhysOk(){ return true; }\n'
  + 'function _adsbCached(reg, cs, fl){ return window.__cached(fl); }\n'
  + 'function __flown(){ return _flownCache; }\n';
const wrapRender = (lines) => '\nfunction __render(vars){ var _liveSpd = null, _liveAlt = null; var _ib = vars.inboundFlight;\n' + lines + '\n return { liveSpd: _liveSpd, liveAlt: _liveAlt }; }\n';
const NOW_NAMES = ['_gateTelemKey', '_gateTelemReset', '_gateLivePosFor', '_gateTelemSetReal', '_gateTelemModel', '_gateTelemFixOf',
  '_gateTelemTrackSeed', '_writeGateTelemDom', '_animateGateTelem', '_gateStickyFix'].filter((n) => fnText(n));
const BUILDS = {
  now: { names: NOW_NAMES.concat(['__render', '__flown']),
    src: SANDBOX_PRE + NOW_NAMES.map((n) => fnText(n)).join('\n') + wrapRender(renderLines(CORE) || '') },
  v24065: { names: ['_gateTelemSetReal', '_gateTelemModel', '_writeGateTelemDom', '_animateGateTelem', '__render', '__flown'],
    src: SANDBOX_PRE + [V65_SET_REAL, V65_MODEL, fnSource('_writeGateTelemDom'), V65_ANIMATE, fnSource('_gateStickyFix')].join('\n') + wrapRender(V65_RENDER) }
};
function sandbox(B, win, els, now) {
  return new Function('window', 'document', 'BoardStrings', 'Date', B.src + '\nreturn {' + B.names.join(',') + '};')(
    win, { querySelectorAll: () => els }, { num: (v) => String(v) }, { now });
}

// ── truth: one aircraft, second by second ──────────────────────────────────
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
// o: {alt, spd, start, hdg, spdJit, altJit, seed, segs: [{until, vs, level, ds, ground, spd, turn, jitter, vsRead}]}
function aircraft(o) {
  const tab = {};
  let alt = o.alt, spd = o.spd, vs = 0, lat = 46.1, lon = -66.6, hdg = (o.hdg != null) ? o.hdg : 80;
  const R = rng(o.seed || 7);
  const start = o.start != null ? o.start : -2400, end = 3600;
  let si = 0;
  for (let t = start; t <= end; t++) {
    while (si < o.segs.length - 1 && t >= o.segs[si].until) si++;
    const g = o.segs[si];
    if (g.ground) { alt = 0; vs = 0; spd += Math.max(-2.5, Math.min(1, (g.spd || 0) - spd)); }
    else {
      let cmd = (g.vs || 0) / 60;
      if (typeof g.level === 'number') {
        const lim = (g.level - alt) / 18;
        cmd = (cmd < 0) ? Math.max(cmd, Math.min(0, lim)) : (cmd > 0 ? Math.min(cmd, Math.max(0, lim)) : lim);
      }
      vs += (cmd - vs) * 0.25; alt += vs; spd += (g.ds || 0);
    }
    hdg = (hdg + (g.turn || 0) + 360) % 360;
    const dr = Math.max(0, spd) / 3600 / 3440.065, br = hdg * Math.PI / 180, la1 = lat * Math.PI / 180, lo1 = lon * Math.PI / 180;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br));
    lon = (lo1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la1), Math.cos(dr) - Math.sin(la1) * Math.sin(la2))) * 180 / Math.PI;
    lat = la2 * 180 / Math.PI;
    const jit = (!g.ground && g.jitter) ? Math.round((R() * 2 - 1) * g.jitter / 64) * 64 : 0;
    const vsq = g.ground ? 0 : ((typeof g.vsRead === 'function') ? g.vsRead(t) : Math.round(vs * 60 / 64) * 64 + jit);
    const sj = (!g.ground && o.spdJit) ? Math.round((R() * 2 - 1) * o.spdJit) : 0;
    const aj = (!g.ground && o.altJit) ? (R() * 2 - 1) * o.altJit : 0;   // ADS-B altitude flicker
    tab[t] = { alt: g.ground ? 0 : Math.max(0, Math.round((alt + aj) / 25) * 25), spd: Math.round(spd) + sj, vs: vsq, ground: !!g.ground, lat, lon };
  }
  return (t) => tab[Math.max(start, Math.min(end, Math.round(t)))];
}

// The Worker's track recorder (acTrackAddPoint, workers/fids-proxy.js), with
// FR24's own time on every point.
function trackAdd(rec, p, nowMs) {
  const pts = (rec && rec.pts) ? rec.pts.slice() : [];
  const tms = p.timestamp ? Date.parse(p.timestamp) : NaN;
  const t = Math.round((isNaN(tms) ? nowMs : tms) / 1000);
  const pt = [Math.round(p.lat * 1e4) / 1e4, Math.round(p.lon * 1e4) / 1e4, (typeof p.alt === 'number') ? Math.round(p.alt) : null, t];
  const last = pts[pts.length - 1];
  if (last) {
    if (t <= last[3]) return null;
    const dLat = (pt[0] - last[0]) * 111, dLon = (pt[1] - last[1]) * 111 * Math.cos(pt[0] * Math.PI / 180);
    if (t - last[3] < 45 && Math.sqrt(dLat * dLat + dLon * dLon) < 1) return null;
  }
  pts.push(pt);
  return { f: rec ? rec.f : p.flight, pts };
}

// The ORACLE's pick, written from the rule, not from the board's code: the
// reading's own point (same rounded position and altitude, once), the latest
// point 30..240 s before it, airborne, nothing on the ground or without an
// altitude after it before the reading, more than 200 ft from the reading.
function oraclePick(pts, fix) {
  if (!pts || !fix || fix.onGround || typeof fix.age !== 'number' || !(fix.alt > 0)) return null;
  const la = Math.round(fix.lat * 1e4) / 1e4, lo = Math.round(fix.lng * 1e4) / 1e4;
  const mine = pts.filter((q) => q[0] === la && q[1] === lo && q[2] === fix.alt);
  if (mine.length !== 1) return null;
  const at = mine[0][3];
  const inWin = pts.filter((q) => at - q[3] >= 30 && at - q[3] <= 240);
  if (!inWin.length) return null;
  const best = inWin.reduce((x, y) => (y[3] > x[3] ? y : x));
  const air = (q) => typeof q[2] === 'number' && q[2] > 0;
  if (!air(best) || pts.some((q) => q[3] > best[3] && q[3] < at && !air(q))) return null;
  if (Math.abs(fix.alt - best[2]) <= 200) return null;
  return { alt: best[2], span: at - best[3] };
}

// ── one gate screen, second by second ─────────────────────────────────────
// The Worker: an FR24 position `lag` s old when asked; one answer in KV for
// 180 s (300 for "not transmitting"), served aged; this location's copy
// frozen until KV's expiry; other screens asking FR24 `othersDelay` s after
// KV expires; every FR24 answer added to the flight's track; /fltrack/
// served from a 45 s edge copy. The board: the render (first, then every
// `renderEvery` s), the poll (2 s, then every 60 s), the map's own track
// fetch (_gateFlownPath: 45 s cache, asked once a position is shown, at each
// render and every 10 s, landing `trackLag` s later), the 1 s animator.
// build: 'now' | 'v24065' | 'oracle' (v24065, given the oracle's pick as its
// first reading at the first step after a reading the model holds alone).
function replay(build, o) {
  const B = BUILDS[build === 'oracle' ? 'v24065' : build];
  const isNow = build === 'now', isOracle = build === 'oracle';
  const T0 = Date.UTC(2026, 9, 19, 14, 0, 0);
  const L = o.loadAt || 0, secs = o.secs || 600, lag = (o.lag == null) ? 5 : o.lag;
  let truth = o.truth, flight = o.flight || 'WS812', nowMs = T0 + L * 1000;
  const tNow = () => (nowMs - T0) / 1000;
  let kv = null, edge = null, fr24Calls = 0, trackFetches = 0;
  const wTrack = {}, trackEdge = {};
  function fr24(t, f) {
    fr24Calls++;
    if (!truth || (o.quiet && o.quiet(t))) return { fetchedAt: t, quiet: true };
    const takenAt = Math.round(t - lag), fx = truth(takenAt);
    if (o.track !== false) {
      const nx = trackAdd(wTrack[f || flight], { lat: fx.lat, lon: fx.lon, alt: fx.ground ? 0 : fx.alt, flight: f || flight,
        timestamp: o.noTime ? undefined : new Date(T0 + takenAt * 1000).toISOString() }, T0 + t * 1000);
      if (nx) wTrack[f || flight] = nx;
    }
    return { fetchedAt: t, takenAt, f: fx };
  }
  const ttl = () => (kv && kv.quiet ? 300 : 180);
  const kvOk = (t) => kv && (t - kv.fetchedAt) < ttl();
  const body = (k, t) => (k.quiet ? null : { f: k.f, seen_pos: o.noTime ? undefined : Math.round(t - k.takenAt) });
  function worker(t) {
    if (edge && t < edge.expires) return edge.body;
    if (kvOk(t)) { const b = body(kv, t); edge = { body: b, expires: t + Math.max(1, ttl() - Math.round(t - kv.fetchedAt)) }; return b; }
    kv = fr24(t);
    const b = body(kv, t); edge = { body: b, expires: t + ttl() }; return b;
  }
  for (const tt of (o.trackPre || [])) fr24(tt);
  kv = null; edge = null;
  if (o.pk != null) kv = fr24(L - o.pk);
  fr24Calls = 0;
  const spans = { 'spd-kph': '', 'alt-ft': '' };
  const els = Object.keys(spans).map((k) => ({ getAttribute: () => k, set textContent(v) { spans[k] = v; }, get textContent() { return spans[k]; } }));
  let inb = { flight, status: 'En route' };
  const INIT = () => ({ spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0, realSecToArr: null, shimmerPh: 0 });
  const win = { _gateTelemAnim: INIT(), _gateInbound: inb, _gatePanelInbound: inb };
  const api = sandbox(B, win, els, () => nowMs);
  const owned = isNow && typeof api._gateTelemReset === 'function' && typeof api._gateTelemKey === 'function';
  const flown = api.__flown();
  let fetchCache = {}, adsbLast = {}, inflight = {}, visible = false, firstRender = true, pending = [], lastTick = -Infinity;
  const key = (r) => String((r && r.flight) || '').toUpperCase();
  const out = { rows: [], seed: null, oracle: null };
  function adsb(row) {
    const p = '/flight/' + row.flight, h = fetchCache[p];
    let ac;
    if (h && nowMs - h.at < 45000) ac = h.ac;
    else { const w = worker(tNow()); ac = w ? { f: w.f, seen_pos: w.seen_pos } : null; fetchCache[p] = { at: nowMs, ac }; }
    if (!ac || ac.seen_pos > 900) return null;
    const f = ac.f;
    const r = { alt: f.ground ? 0 : f.alt, spd: f.spd, lat: f.lat, lng: f.lon, vs: f.ground ? null : f.vs, onGround: !!f.ground,
      age: (typeof ac.seen_pos === 'number') ? ac.seen_pos : null, at: nowMs, fl: row.flight };
    adsbLast[row.flight] = r;
    return r;
  }
  function askTrack() {
    if (o.noTrackFetch) return;
    const f = key(win._gateInbound || win._gatePanelInbound);
    const c = flown[f];
    if (!f || (c && (nowMs - c.at <= 45000 || c.busy))) return;
    const cc = flown[f] = c || { at: 0, rec: null };
    cc.busy = true; trackFetches++;
    const t = tNow();
    let e = trackEdge[f];
    if (!e || t - e.at >= 45) e = trackEdge[f] = { at: t, body: JSON.stringify({ f, pts: (wTrack[f] && wTrack[f].pts) || [] }) };
    pending.push({ at: t + (o.trackLag || 0), f, body: e.body });
  }
  function land() {
    const t = tNow();
    pending = pending.filter((p) => { if (p.at > t) return true; const c = flown[p.f]; c.rec = JSON.parse(p.body); c.at = nowMs; c.busy = false; return false; });
  }
  const setReal = (spd, alt, who, fix) => (isNow ? api._gateTelemSetReal(spd, alt, who, fix) : api._gateTelemSetReal(spd, alt));
  function oracleStep() {
    const T = win._gateTelemAnim;
    if (!T.realTs || T.realTs <= lastTick || typeof T.prevAlt === 'number' || typeof T.prevSpd === 'number') return;
    if (!(T.realAlt > 0) || T.alt !== T.realAlt) return;
    const ib = win._gatePanelInbound;
    if (!ib || /arriv|land|cancel/i.test(ib.status) || ib._liveOnGround === true) return;
    const fix = adsbLast[ib.flight], c = flown[key(ib)];
    if (!fix || fix.alt !== T.realAlt || fix.spd !== T.realSpd) return;
    const pick = oraclePick(c && c.rec && c.rec.pts, fix);
    if (!pick) return;
    const keep = nowMs, cur = { spd: T.realSpd, alt: T.realAlt, ts: T.realTs };
    win._gateTelemAnim = INIT();
    // the point as v24065's first reading: its altitude, no speed (the track has none)
    nowMs = cur.ts - pick.span * 1000; api._gateTelemSetReal(null, pick.alt);
    win._gateTelemAnim.spd = null; win._gateTelemAnim.alt = null;   // never drawn: the digits start at this screen's reading
    nowMs = cur.ts; api._gateTelemSetReal(cur.spd, cur.alt);
    nowMs = keep;
    if (!out.oracle) out.oracle = pick;
  }
  function poll() {
    const row = win._gatePanelInbound;
    if (!row || !row.flight) return;
    if (/cancel|arriv|land/i.test(row.status)) { const lp = win._gateInboundLivePos; if (lp && (!lp.fl || lp.fl === row.flight)) win._gateInboundLivePos = null; return; }
    const r = adsb(row);
    if (!r) return;
    row._liveAlt = r.alt; row._liveSpd = r.spd;
    win._gateInboundLivePos = { lat: r.lat, lng: r.lng, speed: r.spd, altitude: r.alt, onGround: r.onGround, at: nowMs - (r.age || 0) * 1000, fl: row.flight };
    if (r.onGround) row._liveOnGround = true;
    setReal(r.spd, r.alt, row, r);
    askTrack();
  }
  function render(depth) {
    const ib = win._gatePanelInbound;
    if (owned) {
      win._gateTelemOwner = api._gateTelemKey(ib);
      if (win._gateTelemOwner && (win._gateTelemAnim || {}).who !== win._gateTelemOwner) api._gateTelemReset(win._gateTelemOwner);
    }
    let kick = false;
    win.__cached = (fl) => {
      const C = adsbLast[fl];
      if (C && nowMs - C.at < 90000) return C;
      if (!inflight[fl] || nowMs - inflight[fl] > 20000) { inflight[fl] = nowMs; kick = true; }
      return null;
    };
    const res = api.__render({ inboundFlight: ib, iata: 'YQM' });
    visible = res.liveAlt !== null;
    if (visible) {
      const TT = win._gateTelemAnim;
      spans['alt-ft'] = String((TT.alt != null) ? Math.max(0, Math.round(TT.alt)) : res.liveAlt);
      spans['spd-kph'] = (res.liveSpd !== null) ? String(Math.round(((TT.spd != null) ? Math.max(0, Math.round(TT.spd)) : res.liveSpd) * 1.852)) : '';
      askTrack();
    }
    if (firstRender) { firstRender = false; if (owned) api._gateTelemReset(win._gateTelemOwner); else win._gateTelemAnim = INIT(); }
    if (kick && (depth || 0) < 2 && adsb(ib)) render((depth || 0) + 1);
  }
  for (let s = 0; s <= secs; s++) {
    const t = L + s;
    if (o.status) { const ns = o.status(t); if (s > 0 && ns !== inb.status) { inb.status = ns; render(); } else inb.status = ns; }
    if (o.swap && s === o.swap.at) {
      const old = inb;
      truth = o.swap.truth; flight = o.swap.flight;
      inb = { flight, status: 'En route' };
      win._gateInbound = inb; win._gatePanelInbound = inb;      // A's live position stays, as the gate render leaves it
      for (const tt of (o.swap.trackPre || [])) fr24(tt, flight);
      kv = null; edge = null; if (o.swap.pk != null) kv = fr24(t - o.swap.pk);
      fetchCache = {};
      if (o.swap.late) o.late = { at: s + o.swap.late.delay, spd: o.swap.late.spd, alt: o.swap.late.alt, row: old };
      render();
    }
    if (o.others !== false && truth && !kvOk(t) && (!kv || t - kv.fetchedAt >= ttl() + (o.othersDelay || 0))) kv = fr24(t);
    land();
    if (s === 0 || (o.renderEvery && s % o.renderEvery === 0)) render();
    if (s >= 2 && (s - 2) % 60 === 0) poll();
    if (s >= 2 && (s - 2) % 10 === 0 && visible) askTrack();
    land();
    // an answer for the inbound before the swap, whose await finishes after it
    if (o.late && o.late.at === s) setReal(o.late.spd, o.late.alt, o.late.row, null);
    if (isOracle) oracleStep();
    api._animateGateTelem();
    lastTick = nowMs;
    const T = win._gateTelemAnim;
    if (isNow && T.seed && !out.seed) out.seed = Object.assign({ s }, T.seed);
    const num = (x) => (x === '' ? null : Number(x));
    out.rows.push({ s, t, vis: visible, ft: visible ? num(spans['alt-ft']) : null, kph: visible ? num(spans['spd-kph']) : null,
      alt: T.alt, spd: T.spd, realAlt: T.realAlt, realSpd: T.realSpd, realTs: T.realTs, prevAlt: T.prevAlt, prevSpd: T.prevSpd, prevTs: T.prevTs,
      who: T.who, truth: truth ? truth(t) : null, two: typeof T.prevAlt === 'number' });
    nowMs += 1000;
  }
  out.fr24Calls = fr24Calls; out.trackFetches = trackFetches;
  return out;
}
// every second: the digits, whether they show, and the eased numbers behind them
function diff(a, b, fields) {
  const F = fields || ['vis', 'ft', 'kph', 'alt', 'spd'];
  const d = [];
  for (let i = 0; i < a.rows.length; i++) if (F.some((k) => a.rows[i][k] !== b.rows[i][k])) d.push(i);
  return d;
}
// the second at which the model takes its second different reading (-1: never)
function secondReading(r) {
  let n = 0, ts = 0;
  for (const row of r.rows) {
    if (row.realTs && row.realTs !== ts) { ts = row.realTs; if (++n === 2) return row.s; }
  }
  return -1;
}

// ── aircraft ────────────────────────────────────────────────────────────────
// truth time 0 = the load; the first reading is taken pk + lag s before it
const J = (o) => Object.assign({ spdJit: 2 }, o);
const P = {
  descent: aircraft(J({ alt: 30000, spd: 450, segs: [{ until: -900, vs: 0, level: 30000 }, { until: 1e9, vs: -1500, level: 3000, ds: -0.03 }] })),
  climb: aircraft(J({ alt: 5000, spd: 250, start: -700, segs: [{ until: 1e9, vs: 1800, level: 36000, ds: 0.05 }] })),
  levelOffAtLoad: aircraft(J({ alt: 20000, spd: 300, start: -400, segs: [{ until: -90, vs: -2000, level: 10000 }, { until: 1e9, vs: 0, level: 10000 }] })),
  levelOffAfter: aircraft(J({ alt: 18000, spd: 320, start: -400, segs: [{ until: 60, vs: -1500, level: 11000 }, { until: 1e9, vs: 0, level: 11000 }] })),
  climbLevelOff: aircraft(J({ alt: 20000, spd: 380, start: -400, segs: [{ until: -30, vs: 2500, level: 32000 }, { until: 1e9, vs: 0, level: 32000 }] })),
  turbulence: aircraft({ alt: 37000, spd: 470, segs: [{ until: 1e9, vs: 0, level: 37000, vsRead: (t) => ((t % 3) ? 1216 : -1472) }] }),
  turbulence2: aircraft({ alt: 35000, spd: 455, segs: [{ until: 1e9, vs: 0, level: 35000, vsRead: (t) => ((t % 7) < 3 ? 1536 : -1280) }] }),
  flicker: aircraft({ alt: 37000, spd: 465, altJit: 100, seed: 5, segs: [{ until: 1e9, vs: 0, level: 37000, vsRead: (t) => ((t % 5) < 2 ? 1600 : -1344) }] }),
  flicker25: aircraft({ alt: 24000, spd: 420, altJit: 25, seed: 9, spdJit: 2, segs: [{ until: 1e9, vs: 0, level: 24000, jitter: 1500 }] }),
  stepClimb: aircraft({ alt: 35000, spd: 470, segs: [{ until: 60, vs: 0, level: 35000 }, { until: 1e9, vs: 1000, level: 37000 }] }),
  approach: aircraft(J({ alt: 6000, spd: 220, start: -300, segs: [{ until: 1e9, vs: -900, level: 0, ds: -0.08, turn: 0.2 }] })),
  turning: aircraft(J({ alt: 24000, spd: 400, start: -500, segs: [{ until: 1e9, vs: -1200, level: 5000, turn: 1.5 }] })),
  holding: aircraft(J({ alt: 8000, spd: 230, segs: [{ until: 1e9, vs: 0, level: 8000, turn: 3 }] })),
  ground: aircraft({ alt: 0, spd: 0, segs: [{ until: 1e9, ground: true, spd: 12 }] }),
  landing: aircraft(J({ alt: 5300, spd: 180, start: -200, segs: [{ until: 200, vs: -800, level: 0, ds: -0.05 }, { until: 1e9, ground: true, spd: 20 }] })),
  takeoff: aircraft(J({ alt: 0, spd: 0, start: -300, segs: [{ until: -150, ground: true, spd: 15 }, { until: 1e9, vs: 2500, level: 30000, ds: 0.4 }] }))
};
const LEVEL = ['turbulence', 'turbulence2', 'flicker', 'flicker25', 'holding'];
const before = (gap, n, upto) => { const a = []; for (let k = n; k >= 1; k--) a.push((upto || 0) - k * gap); return a; };
const base = (o) => Object.assign({ secs: 600, lag: 5, pk: 60, othersDelay: 20, renderEvery: 30, trackLag: 0 }, o);
const arrivedAt = (n) => (t) => (t >= n ? 'Arrived' : 'En route');

// ═══ the texts ═════════════════════════════════════════════════════════════
test('text: the v24065 anchor, model, animator and render lines frozen here are v24065\'s own texts', () => {
  assert.equal(sha(V65_SET_REAL), V65_HASH._gateTelemSetReal);
  assert.equal(sha(V65_ANIMATE), V65_HASH._animateGateTelem);
  assert.equal(sha(V65_MODEL), V65_HASH._gateTelemModel);
  assert.equal(sha(V65_RENDER), V65_HASH.render);
});

test('text: the model and the render lines are v24065\'s but for the documented edits; the digit writer, sticky fix and track fetch are v24065\'s', () => {
  const model = fnText('_gateTelemModel');
  assert.ok(model && model.split(MODEL_EDIT[0]).length === 2, 'the model\'s ground test is this aircraft\'s own');
  assert.equal(model.replace(MODEL_EDIT[0], MODEL_EDIT[1]), V65_MODEL);
  let r = renderLines(CORE);
  assert.ok(r, 'the render\'s live-numbers lines must be there');
  for (const [now, was] of RENDER_EDITS) { assert.equal(r.split(now).length, 2, now.slice(0, 60)); r = r.replace(now, was); }
  assert.equal(r, V65_RENDER);
  for (const n of ['_writeGateTelemDom', '_gateStickyFix', '_gateFlownPath']) assert.equal(sha(fnSource(n)), V65_HASH[n], n + ' is v24065\'s');
});

test('text: (f) the anchor\'s call sites: whose numbers, and the FR24 answer only where the numbers are its own', () => {
  const calls = CORE.match(/_gateTelemSetReal\([^;]*\);/g);
  assert.deepEqual(calls, [
    '_gateTelemSetReal(null, null, inb);',
    '_gateTelemSetReal(null, null, inb);',
    '_gateTelemSetReal(_adsb.spd, _adsb.alt, inb, _adsb);',
    '_gateTelemSetReal(liveSpd, liveAlt, inb);',
    '_gateTelemSetReal(_liveSpd, _liveAlt, _ib, _tFix);',
    '_gateTelemSetReal(liveSpd, liveAlt, _capturedInbound);'
  ]);
  // the gate render: the digits are this inbound's, before it builds the panel; a new departure resets every field
  assert.match(CORE, /window\._gateTelemOwner = _gateTelemKey\(inboundFlight\);\n\s+if \(window\._gateTelemOwner && \(window\._gateTelemAnim \|\| \{\}\)\.who !== window\._gateTelemOwner\) _gateTelemReset\(window\._gateTelemOwner\);/);
  assert.match(CORE, /\n\s+_gateTelemReset\(window\._gateTelemOwner\);\n\s+window\._gateLastFlightKey = currentFlight\.flight;/);
  assert.equal((CORE.match(/window\._gateTelemAnim = \{/g) || []).length, 1, 'the only whole-object write is _gateTelemReset\'s');
});

test('text: (e) nothing here asks for anything, reads a vertical speed or works out a speed', () => {
  for (const n of ['_gateTelemKey', '_gateTelemReset', '_gateLivePosFor', '_gateTelemSetReal', '_gateTelemModel', '_gateTelemFixOf', '_gateTelemTrackSeed', '_animateGateTelem']) {
    const s = fnSource(n).replace(/\/\/[^\n]*/g, '');   // the code, not its comments
    assert.doesNotMatch(s, /fetch\(|XMLHttpRequest|_gateFlownPath\(|_adsbTelemetry\(|_adsbFetchOne\(|setTimeout|setInterval/, n + ' asks for nothing');
    assert.doesNotMatch(s, /\bvs\b|baro|_liveVs|vspeed/, n + ' reads no vertical speed');
    assert.doesNotMatch(s, /_gcNm|_gcDist|haversine/, n + ' works out no speed from positions');
  }
  assert.match(fnSource('_gateTelemTrackSeed'), /_flownCache\[T\.who\]/, 'the track is the copy the map already holds');
  // rounds 1-3's single-reading carry is gone
  for (const gone of ['_gateTelemFirstVs', '_gateTelemFirstAlt', '_gateTelemAltStep', '_gateTelemRate', '_gateTelemStill', '_gateTelemOnGround', 'T.vsAt', 'T.nFix', 'T.realVs', 'alt65', 'spd65']) {
    assert.ok(!CORE.includes(gone), gone + ' is gone');
  }
});

// ═══ the replays ═══════════════════════════════════════════════════════════
test('(a) with no track the digits are v24065\'s, byte for byte, every second', () => {
  let runs = 0;
  for (const name of Object.keys(P)) {
    for (const v of [{ track: false }, { noTrackFetch: true, trackPre: before(200, 6) }]) {
      for (const pk of [0, 60, 170]) for (const renderEvery of [0, 30]) {
        const o = base(Object.assign({ truth: P[name], pk, renderEvery }, v, name === 'landing' ? { status: arrivedAt(260) } : {}));
        const a = replay('v24065', o), b = replay('now', o);
        assert.deepEqual(diff(a, b), [], name + ' ' + JSON.stringify(v) + ' pk ' + pk + ' render ' + renderEvery);
        assert.equal(b.seed, null);
        assert.equal(a.fr24Calls, b.fr24Calls, 'FR24 calls');
        assert.equal(a.trackFetches, b.trackFetches, 'track fetches');
        runs++;
      }
    }
  }
  assert.equal(runs, 192);
});

// the (b) replays, shared by the tests below
const B_RUNS = [];
function bRuns() {
  if (B_RUNS.length) return B_RUNS;
  for (const name of Object.keys(P)) {
    for (const gap of [150, 200, 230, 360]) for (const pk of [0, 60, 170]) for (const lag of [3, 9]) {
      const o = base({ truth: P[name], pk, lag, trackPre: before(gap, 8), othersDelay: Math.max(0, gap - 180),
        status: name === 'landing' ? arrivedAt(260) : undefined });
      B_RUNS.push({ name, gap, pk, lag, o, a: replay('v24065', o), b: replay('now', o), c: replay('oracle', o) });
    }
  }
  return B_RUNS;
}

test('(b) with a track the digits are the oracle\'s (v24065 given the track point as its first reading), every second', () => {
  let seeded = 0, moved = 0;
  for (const r of bRuns()) {
    const tag = r.name + ' gap ' + r.gap + ' pk ' + r.pk + ' lag ' + r.lag;
    assert.deepEqual(diff(r.b, r.c), [], tag);
    assert.equal(!!r.b.seed, !!r.c.oracle, 'the board seeds exactly when the oracle picks a point: ' + tag);
    assert.equal(r.a.fr24Calls, r.b.fr24Calls, 'FR24 calls'); assert.equal(r.c.fr24Calls, r.b.fr24Calls, 'FR24 calls');
    assert.equal(r.a.trackFetches, r.b.trackFetches, 'track fetches');
    if (!r.b.seed) assert.deepEqual(diff(r.a, r.b), [], 'no point: v24065\'s, ' + tag);
    if (r.b.seed) {
      seeded++;
      if (r.b.rows[1].ft !== r.b.rows[0].ft) moved++;
    }
  }
  assert.equal(B_RUNS.length, 384);
  // the replays exercise the seed, and the digits move from the first second
  // in the climbs and descents (deterministic: these are the counts)
  assert.equal(seeded, 144, 'seeded runs');
  assert.equal(moved, 142, 'runs whose digits move at 1 s');
});

test('(b) the speed holds as in v24065: the speed digits are v24065\'s every second, seeded or not', () => {
  for (const r of bRuns()) assert.deepEqual(diff(r.a, r.b, ['kph', 'spd']), [], r.name + ' gap ' + r.gap + ' pk ' + r.pk + ' lag ' + r.lag);
});

test('(b) from the second different reading on, the model is v24065\'s two readings: same anchor, reading before, times', () => {
  let checked = 0;
  for (const r of bRuns()) {
    if (!r.b.seed) continue;
    const s2 = secondReading(r.a);
    assert.equal(secondReading(r.b), s2, 'the same readings reach both');
    if (s2 < 0) continue;
    checked++;
    for (let i = s2; i < r.a.rows.length; i++) {
      for (const k of ['realAlt', 'realSpd', 'realTs', 'prevAlt', 'prevSpd', 'prevTs']) {
        assert.equal(r.b.rows[i][k], r.a.rows[i][k], r.name + ' gap ' + r.gap + ' pk ' + r.pk + ' ' + k + ' at ' + i + ' s');
      }
    }
  }
  assert.ok(checked >= 100, 'seeded runs with a second reading: ' + checked);
});

test('(b) moving from the first second: a descent and a climb, against v24065 holding still', () => {
  for (const name of ['descent', 'climb', 'approach']) {
    const o = base({ truth: P[name], trackPre: before(200, 8) });
    const a = replay('v24065', o), b = replay('now', o);
    assert.ok(b.seed, name + ' seeded');
    const way = Math.sign(P[name](0).alt - P[name](-200).alt);
    for (let i = 1; i <= 30; i++) {
      assert.equal(a.rows[i].ft, a.rows[0].ft, name + ': v24065 holds still at ' + i + ' s');
      assert.ok((b.rows[i].ft - b.rows[i - 1].ft) * way > 0, name + ': the digits move the aircraft\'s way at ' + i + ' s');
    }
  }
});

test('(b) a track that reaches the map after the reading: v24065\'s digits until it lands, then the point as the reading before', () => {
  for (const k of [1, 3, 10, 45, 90]) {
    const o = base({ truth: P.descent, trackPre: before(200, 8), trackLag: k });
    const a = replay('v24065', o), b = replay('now', o), c = replay('oracle', Object.assign({}, o, { trackLag: 0 }));
    assert.ok(b.seed && b.seed.s >= 0 && b.seed.s <= k + 1, 'seeded when the track landed (k ' + k + ')');
    for (let i = 0; i < b.seed.s; i++) assert.deepEqual([b.rows[i].ft, b.rows[i].alt], [a.rows[i].ft, a.rows[i].alt], 'v24065 before the track lands, ' + i + ' s');
    const at = b.seed.s;
    assert.equal(b.rows[at].prevAlt, c.oracle.alt, 'the point the oracle picks (k ' + k + ')');
    assert.equal(b.rows[at].prevTs, b.rows[at].realTs - c.oracle.span * 1000, 'dated by FR24\'s times (k ' + k + ')');
  }
});

test('(c) level flight stays level, whatever the answer\'s own vertical speed says and the altitude flickers by', () => {
  let runs = 0;
  for (const name of LEVEL) {
    for (const gap of [150, 200, 230]) for (const pk of [0, 60, 170]) {
      const o = base({ truth: P[name], pk, trackPre: before(gap, 8), othersDelay: Math.max(0, gap - 180), secs: 400 });
      const a = replay('v24065', o), b = replay('now', o);
      assert.equal(b.seed, null, name + ' gap ' + gap + ' pk ' + pk + ': within 200 ft is not a climb');
      assert.deepEqual(diff(a, b), [], name + ': v24065\'s digits');
      const s2 = secondReading(b), first = b.rows.find((r) => r.ft !== null);
      for (const r of b.rows) if (r.ft !== null && (s2 < 0 || r.s < s2)) assert.equal(r.ft, first.realAlt, name + ' level at ' + r.s + ' s');
      runs++;
    }
  }
  // the readings these runs start from say 1,000 ft/min or more, and the flicker is real
  for (const name of ['turbulence', 'turbulence2', 'flicker']) assert.ok(Math.abs(P[name](-65).vs) >= 1000, name);
  const alts = new Set(); for (let t = -600; t < 0; t++) alts.add(P.flicker(t).alt);
  assert.ok(alts.size >= 8 && Math.max(...alts) - Math.min(...alts) >= 175, 'the flicker spans ' + [...alts].join(','));
  assert.equal(runs, 45);
});

test('(d) the inbound swap: B is B\'s from the swap, A\'s late answer is ignored, B\'s seed is B\'s own track', () => {
  const Bl = aircraft({ alt: 31000, spd: 460, seed: 3, segs: [{ until: 1e9, vs: 0, level: 31000, jitter: 128 }] });
  const Bd = aircraft(J({ alt: 31000, spd: 460, segs: [{ until: -300, vs: 0, level: 33000 }, { until: 1e9, vs: -1500, level: 3000, ds: -0.05 }] }));
  for (const [A, Bt, trk] of [[P.ground, Bl, false], [P.ground, Bl, true], [P.ground, Bd, true], [P.descent, Bd, true]]) {
    const o = base({ truth: A, flight: 'AC100', secs: 600, pk: 30, trackPre: before(200, 6),
      swap: { at: 300, truth: Bt, flight: 'AC200', pk: 50, trackPre: trk ? before(200, 6, 300) : [], late: { spd: 250, alt: 9500, delay: 5 } } });
    const a = replay('v24065', o), b = replay('now', o);
    assert.equal(a.fr24Calls, b.fr24Calls, 'FR24 calls');
    let lowA = Infinity, lowB = Infinity;
    for (let i = 300; i < 330; i++) {
      assert.equal(b.rows[i].who, 'AC200', 'the digits are B\'s at ' + i + ' s');
      assert.notEqual(b.rows[i].realAlt, 9500, 'A\'s late answer is not B\'s reading at ' + i + ' s');
      if (a.rows[i].ft !== null) lowA = Math.min(lowA, a.rows[i].ft - a.rows[i].realAlt);
      if (b.rows[i].ft !== null) lowB = Math.min(lowB, b.rows[i].ft - b.rows[i].realAlt);
    }
    // within B's own carry (at most 30 ft/s for 30 s) of B's reading; v24065 eased toward A's 0 ft
    assert.ok(lowB >= -900, 'B within its own carry of its reading: ' + lowB);
    if (A === P.ground) assert.ok(lowA < -5000, 'the replay reproduces v24065 easing B toward A\'s 0 ft: ' + lowA);
    if (trk && Bt === Bd && A === P.ground) assert.ok(b.seed && b.seed.s >= 300, 'B\'s own track seeded B');
  }
});

test('(g) on the ground, after Arrived, with no FR24 time, a gap over 240 s, a point on the ground: v24065, every second', () => {
  const cases = [
    { truth: P.ground, trackPre: before(200, 8) },
    { truth: P.landing, loadAt: 330, trackPre: before(200, 8, 330), status: arrivedAt(260) },
    { truth: P.descent, trackPre: before(200, 8), status: () => 'Arrived' },
    { truth: P.descent, trackPre: before(200, 8), noTime: true },
    { truth: P.descent, trackPre: before(335, 8, -60), othersDelay: 155 },
    { truth: P.takeoff, trackPre: [-400, -300, -200, -160] }
  ];
  for (const c of cases) {
    const o = base(c);
    const a = replay('v24065', o), b = replay('now', o);
    assert.equal(b.seed, null, JSON.stringify(Object.keys(c)));
    assert.deepEqual(diff(a, b), []);
    assert.equal(a.fr24Calls, b.fr24Calls);
  }
});

// ═══ the rule, unit by unit ════════════════════════════════════════════════
// One sandbox of this file's functions with a hand-made track.
function unit(opts) {
  const win = { _gateTelemAnim: { spd: null, alt: null, realSpd: null, realAlt: null, realTs: 0, realSecToArr: null, shimmerPh: 0 } };
  let now = Date.UTC(2026, 9, 19, 15, 0, 0);
  const api = sandbox(BUILDS.now, win, [], () => now);
  const fl = (opts && opts.flight) || 'AC644';
  const inb = { flight: fl, status: 'En route' };
  win._gateInbound = inb; win._gatePanelInbound = inb;
  win._gateTelemOwner = 'AC644';
  if (api._gateTelemReset) api._gateTelemReset('AC644');
  const F = Math.round(now / 1000) - 20;   // the reading's own FR24 time
  const fix = { lat: 46.11114, lng: -64.80006, alt: 9000, spd: 300, age: 20, onGround: false, vs: -1500 };
  // a point `dt` s before the reading, `nm` nm west of it
  const pt = (dt, alt, nm) => [Math.round(46.1111 * 1e4) / 1e4, Math.round((-64.8001 - (nm || 0) / 60 / Math.cos(46.1111 * Math.PI / 180)) * 1e4) / 1e4, alt, F - dt];
  const me = [Math.round(fix.lat * 1e4) / 1e4, Math.round(fix.lng * 1e4) / 1e4, 9000, F];
  return {
    api, win, inb, fix, pt, me, F,
    track(pts) { api.__flown().AC644 = { at: now, rec: { f: 'AC644', pts } }; },
    read(f) { api._gateTelemSetReal(f ? f.spd : 300, f ? f.alt : 9000, inb, f === undefined ? fix : f); return win._gateTelemAnim; },
    tick(n) { for (let i = 0; i < (n || 1); i++) { now += 1000; api._animateGateTelem(); } },
    now: () => now
  };
}
const seeded = (T) => typeof T.prevAlt === 'number';

test('the rule: the latest point 30 to 240 s before the reading\'s own FR24 time, and only that', () => {
  // inside the window: 30 and 240 s; outside: 29 and 241 s
  for (const [dt, ok] of [[29, false], [30, true], [120, true], [240, true], [241, false]]) {
    const u = unit();
    u.track([u.pt(dt, 10000, 0), u.me]);
    const T = u.read();
    assert.equal(seeded(T), ok, dt + ' s');
    assert.equal(!!T.seed, ok, dt + ' s: the record of it');
    if (ok) {
      assert.equal(T.prevAlt, 10000);
      assert.equal(T.prevTs, T.realTs - dt * 1000, 'dated ' + dt + ' s before the reading reached the screen');
      assert.equal(T.prevSpd, null, 'no speed: it holds');
    }
  }
  // the latest of several
  { const u = unit(); u.track([u.pt(200, 11000, 0), u.pt(100, 10000, 0), u.pt(10, 9100, 0), u.me]); const T = u.read(); assert.equal(T.prevAlt, 10000); assert.equal(T.prevTs, T.realTs - 100000); }
  // the reading must be in the track, once
  { const u = unit(); u.track([u.pt(100, 10000, 0)]); const T = u.read(); assert.ok(!seeded(T), 'not in the track'); }
  { const u = unit(); u.track([u.pt(100, 10000, 0), u.me, u.me.slice(0, 3).concat([u.F + 60])]); const T = u.read(); assert.ok(!seeded(T), 'in it twice'); }
  { const u = unit(); u.track([u.me.slice(0, 3).concat([u.F - 300]), u.pt(100, 10000, 0), u.me]); const T = u.read(); assert.ok(!seeded(T), 'in it twice, the other one earlier'); }
  { const u = unit(); u.track([u.pt(100, 10000, 0), u.me.slice(0, 2).concat([9025, u.F])]); const T = u.read(); assert.ok(!seeded(T), 'at another altitude'); }
});

test('the rule: a point on the ground or without an altitude, or one after it, is not one climb: v24065', () => {
  const cases = [
    [(u) => [u.pt(200, 11000, 0), u.pt(100, 0, 0), u.me], false, 'the latest in the window on the ground'],
    [(u) => [u.pt(200, 11000, 0), u.pt(100, null, 0), u.me], false, 'the latest in the window without an altitude'],
    [(u) => [u.pt(100, 11000, 0), u.pt(10, 0, 0), u.me], false, 'on the ground after it'],
    [(u) => [u.pt(100, 11000, 0), u.pt(10, null, 0), u.me], false, 'no altitude after it'],
    [(u) => [u.pt(200, 0, 0), u.pt(100, 11000, 0), u.me], true, 'on the ground before it'],
    [(u) => [u.pt(100, 11000, 0), u.me, u.pt(-30, 0, 0)], true, 'on the ground after the reading']
  ];
  for (const [mk, ok, what] of cases) {
    const u = unit(); u.track(mk(u)); const T = u.read();
    assert.equal(seeded(T), ok, what);
    if (ok) assert.equal(T.prevAlt, 11000, what);
  }
});

test('the rule: 200 ft or less is altitude flicker, not a climb; more is', () => {
  for (const [alt, ok] of [[9000, false], [9025, false], [8800, false], [9200, false], [8775, true], [9225, true], [12000, true]]) {
    const u = unit(); u.track([u.pt(100, alt, 0), u.me]); const T = u.read();
    assert.equal(seeded(T), ok, alt + ' ft before 9,000 ft');
    if (!ok) {
      assert.equal(T.prevAlt, undefined); assert.equal(T.realTs, u.now(), 'the reading keeps its own time');
      u.tick(200);
      assert.equal(Math.round(T.alt), 9000, 'level at ' + alt);
    }
  }
});

test('the rule: the reading\'s FR24 answer, its time, and the aircraft in the air; the rows and position are this flight\'s', () => {
  const ok = (u) => { u.track([u.pt(100, 10000, 0), u.me]); return u; };
  // FR24 gave no time (no age), not an FR24 answer, or another altitude than the reading
  { const u = ok(unit()); assert.ok(!seeded(u.read(Object.assign({}, u.fix, { age: null })))); }
  { const u = ok(unit()); assert.ok(!seeded(u.read(null))); }
  { const u = ok(unit()); u.api._gateTelemSetReal(300, 9000, u.inb, Object.assign({}, u.fix, { alt: 9100 })); assert.ok(!seeded(u.win._gateTelemAnim)); }
  // the feed says Arrived or the row is on the ground: either row (the panel's or the gate's)
  for (const which of ['_gatePanelInbound', '_gateInbound']) {
    for (const mark of [{ status: 'Arrived' }, { status: 'Landed 9:12' }, { status: 'Cancelled' }, { _liveOnGround: true }]) {
      const u = ok(unit());
      u.win[which] = Object.assign({ flight: 'AC644', status: 'En route' }, mark);
      assert.ok(!seeded(u.read()), which + ' ' + JSON.stringify(mark));
      // the same mark on another flight's row does not stop it
      const v = ok(unit());
      v.win[which] = Object.assign({ flight: 'AC100', status: 'En route' }, mark);
      assert.ok(seeded(v.read()), 'another flight\'s ' + which + ' ' + JSON.stringify(mark));
    }
  }
  // this flight's own live position on the ground; another flight's does not count
  { const u = ok(unit()); u.win._gateInboundLivePos = { onGround: true, fl: 'AC644' }; assert.ok(!seeded(u.read())); }
  { const u = ok(unit()); u.win._gateInboundLivePos = { onGround: true, fl: 'AC100' }; assert.ok(seeded(u.read())); }
  // a reading at 0 ft is on the ground, whatever else is known
  { const u = unit(); const g = Object.assign({}, u.fix, { alt: 0, spd: 12 }); u.track([u.pt(100, 1500, 0), u.me.slice(0, 2).concat([0, u.F])]); const T = u.read(g); assert.equal(T.realAlt, 0); assert.ok(!seeded(T)); }
  // the flight's key ignores spaces and case, in the row and the track
  { const u = ok(unit()); u.inb.flight = 'ac 644'; u.win._gateTelemOwner = 'AC644'; assert.ok(seeded(u.read()), 'the row\'s "ac 644" is AC644'); }
});

test('the rule: one look per copy of the track; a second reading is v24065\'s two readings; a track that lands later still seeds', () => {
  // a copy with no point for this reading is read once, not every second
  const u = unit();
  let reads = 0;
  const pts = new Proxy([u.pt(10, 10000, 0), u.me], { get(t, k) { if (k === 'length') reads++; return t[k]; } });
  u.track(pts);
  u.read();
  const first = reads;
  assert.ok(first > 0);
  u.tick(30);
  assert.equal(reads, first, 'the same copy is not read again');
  // the second reading: the first one is the reading before, dated when it reached the screen
  const w = unit();
  w.track([w.pt(100, 10000, 0), w.me]);
  let T = w.read();
  assert.equal(T.prevAlt, 10000);
  w.tick(60);
  const second = { lat: 46.2, lng: -64.5, alt: 8000, spd: 290, age: 5, onGround: false };
  const firstTs = T.realTs;
  T = w.read(second);
  assert.equal(T.prevAlt, 9000, 'the reading before is the first one');
  assert.equal(T.prevSpd, 300);
  assert.equal(T.prevTs, firstTs, 'at the time it reached the screen');
  assert.equal(T.seed, null, 'the record is the reading\'s own');
  // a track that lands after the reading: the next step seeds
  const v = unit();
  const R = v.read();
  assert.ok(!seeded(R));
  v.track([v.pt(100, 10000, 0), v.me]);
  v.tick();
  assert.equal(v.win._gateTelemAnim.prevAlt, 10000, 'seeded at the next step');
  assert.ok(v.win._gateTelemAnim.seed);
});

test('whose numbers: another aircraft starts from nothing even before the gate render says so; an answer for another inbound is ignored', () => {
  const u = unit();
  u.win._gateTelemOwner = '';
  u.read(null);
  u.tick(5);
  u.api._gateTelemSetReal(400, 30000, { flight: 'AC200' }, null);
  const T = u.win._gateTelemAnim;
  assert.equal(T.who, 'AC200');
  assert.equal(T.prevAlt, undefined, 'AC644\'s reading is not AC200\'s reading before');
  assert.equal(T.alt, 30000, 'the digits start at AC200\'s own reading');
  u.win._gateTelemOwner = 'AC200';
  u.api._gateTelemSetReal(250, 9500, { flight: 'AC644' }, null);
  assert.equal(u.win._gateTelemAnim.realAlt, 30000, 'AC644\'s answer, landing after the re-pair, is ignored');
  u.api._gateTelemSetReal(410, 29000, { flight: 'ac 200' }, null);
  assert.equal(u.win._gateTelemAnim.realAlt, 29000, '"ac 200" is AC200');
  // every field goes with the aircraft it was measured on: AC200's two
  // readings, and its track's seed, are not the next inbound's
  const w = unit();
  w.track([w.pt(100, 10000, 0), w.me]);
  w.read();
  w.tick(60);
  w.read({ lat: 46.2, lng: -64.5, alt: 8000, spd: 290, age: 5, onGround: false });
  assert.equal(w.win._gateTelemAnim.prevAlt, 9000);
  w.win._gateTelemOwner = 'WS812';
  w.api._gateTelemReset('WS812');
  w.api._gateTelemSetReal(450, 35000, { flight: 'WS812' }, null);
  const N = w.win._gateTelemAnim;
  for (const k of ['prevAlt', 'prevSpd', 'prevTs', 'seed', 'fix']) assert.ok(N[k] == null, k + ' is not the aircraft before\'s: ' + N[k]);
  w.tick(30);
  assert.equal(Math.round(N.alt), 35000, 'WS812 holds its own reading');
});

test('the inbound\'s own position: the model reads no other flight\'s "on the ground"', () => {
  const u = unit();
  u.track([]);
  u.read(null);
  u.win._gateInboundLivePos = { onGround: true, fl: 'AC100' };
  u.tick(10);
  assert.equal(Math.round(u.win._gateTelemAnim.alt), 9000, 'another flight\'s ground position is not this one\'s');
  u.win._gateInboundLivePos = { onGround: true, fl: 'AC644' };
  u.tick(10);
  assert.ok(u.win._gateTelemAnim.alt < 9000 * 0.2, 'this flight\'s own is');
  const w = unit();
  w.read(null);
  w.win._gateInbound = { flight: 'AC100', _liveOnGround: true };
  w.tick(10);
  assert.equal(Math.round(w.win._gateTelemAnim.alt), 9000, 'another flight\'s row on the ground is not this one\'s');
});
