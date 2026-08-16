/* ══════════════════════════════════════════════════════════════════════════
 * GATE ROUTE MAP — the gate's map subsystem, rebuilt on OCGateMap (canvas).
 *
 * Loads AFTER fids-core.js and REPLACES the global entry points the gate
 * calls: initGateMap, initGateMapLive, _bigMapClone, _bigMapCloneLive,
 * _startGateMapGlide, _stopGateMapGlide. The Leaflet bodies in fids-core
 * become dead code the moment this file loads; they are excised in the
 * follow-up commit once this is verified on a preview. Leaflet itself is no
 * longer loaded by any board.
 *
 * WHAT WAS PORTED — the product behaviour:
 *   · progressive zoom (ground z15 at the field, easing out to cruise, back
 *     in on approach; est phase table for schedule-estimated flights)
 *   · zoom hysteresis + per-route view memory (window._GATE_MAP_VIEW): hold
 *     zoom on small moves, never step more than one level per tick
 *   · the glide: p(t) = p0 + rate·t, a pure function of a monotonic clock —
 *     cannot stutter, cannot reverse; distance-table position lookup;
 *     slew-limited look-ahead heading (snap >35°, else ≤40°/s);
 *     re-anchor keeps the drawn position and folds fix error into the RATE
 *     (flown off over 45s, clamped ≥0 — "truth behind us" reads as slowing)
 *   · runway-aligned final via _runwayFinalPath (reused from fids-core)
 *   · follow-camera: eased pan once the plane drifts >28% off-centre,
 *     guarded so pans never stack
 *   · live-outranks-estimate: an estimate redraw never downgrades a healthy
 *     same-leg glide
 *   · world-view single-pin fallback for unresolvable airport codes
 *   · no dead reckoning on the ground (taxiing planes hold their last fix)
 *
 * WHAT WAS NOT PORTED — the Leaflet-babysitting, now obsolete by design:
 *   tile-cache preservation, the never-destroy/reuse discipline, detached-
 *   container tolerance, settle passes, marker sub-pixel repair, overlay
 *   wipe-and-rebuild, the in-place re-anchor special case. A canvas redraw
 *   is ~1.6ms with zero network; the whole class of "protect the tiles"
 *   machinery has nothing left to protect.
 * ══════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  if (!g.OCGateMap) { try { console.error('[OCMAP] oc-gate-map.js missing'); } catch (e) {} return; }

  var MINI = 'mini', BIG = 'big';
  function containerId(kind) { return kind === MINI ? 'gateMapBox' : 'bigCraftMap'; }

  // Get-or-create the canvas map for a surface. Reuse is trivial here — there
  // are no tiles to keep warm — but identity still matters: the takeover
  // preservation puts the same container back, and a surviving instance keeps
  // its view (no re-fit, no jump).
  function surface(kind) {
    var el = document.getElementById(containerId(kind));
    if (!el) return null;
    var cur = (kind === MINI) ? g.gateMap : g._bigCraftMap;
    if (cur instanceof g.OCGateMap && cur.getContainer() === el && el.isConnected) return cur;
    try { if (cur && cur.remove) cur.remove(); } catch (e) {}
    try { el.innerHTML = ''; } catch (e) {}
    var m = new g.OCGateMap(el, { center: [45, -65], zoom: 3 });
    if (kind === MINI) {
      g.gateMap = m;
      try { if (typeof g._gateMapWatchResize === 'function') g._gateMapWatchResize(el); } catch (e) {}
    } else {
      g._bigCraftMap = m;
    }
    return m;
  }

  function look(code) { try { return g._lookupAirport(code); } catch (e) { return null; } }

  // Async coord resolution with the world-view fallback — same contract as
  // before: an unresolvable exotic code shows one known pin on a world view,
  // never a blank box.
  function resolveOrFallback(kind, org, dst, retry) {
    var o = look(org), d = look(dst);
    if (o && d) return { o: o, d: d };
    if (!org || !dst) return null;                     // called with no route:
    var pending = [];                                  // nothing to fetch, keep
    if (!o) pending.push(g._fetchAirportCoords(org));  // the current picture
    if (!d) pending.push(g._fetchAirportCoords(dst));
    Promise.all(pending).then(function () {
      if (look(org) && look(dst)) { retry(); return; }
      var oK = look(org), dK = look(dst);
      var m = surface(kind);
      if (!m) return;
      if (oK || dK) {
        m.setView([20, (oK || dK)[1]], 1);
        m.setPin((oK || dK)[0], (oK || dK)[1], oK ? '#60a5fa' : '#ef4444', oK ? org : dst);
      }
    });
    return null;
  }

  function cruiseZoomFor(o, d) {
    var span = Math.sqrt(Math.pow(o[0] - d[0], 2) + Math.pow(o[1] - d[1], 2));
    return span < 5 ? 7 : span < 15 ? 6 : span < 30 ? 5 : 4;
  }

  // ── ESTIMATE DRAW (schedule progress, no live fix) ───────────────────────
  function estimate(kind, org, dst, prog) {
    try { g._fidsGateRoute = { org: org, dst: dst, prog: prog, at: Date.now() }; } catch (e) {}
    // live outranks estimate: while a healthy same-leg glide is flying on
    // this surface, an estimate redraw is only ever a downgrade — skip it.
    var oT = look(org), dT = look(dst);
    if (GL.raf && GL.live && GL.views[kind] && oT && dT && sameLeg(GL.o, oT) && sameLeg(GL.d, dT)) return;

    var r = resolveOrFallback(kind, org, dst, function () { estimate(kind, org, dst, prog); });
    if (!r) return;
    var o = r.o, d = r.d;
    var m = surface(kind);
    if (!m) return;
    m._fidsLive = false;

    // ── LANDING IS AERODATABOX'S CALL, NOT THE CLOCK'S ─────────────────────
    // (Nick: "aerodatabox ... has the function for landing" — and his report
    // watching the preview: "I just saw a plane in halifax landing it
    // stoped".) Live positions are dead, so the glide flies on estimates; the
    // tick stops re-anchoring past 98% and its fallback re-calls this builder
    // with prog=-1. Two failures came from that: the plane froze just short
    // of the field, and the -1 rebuilt the view at p=0 — a full-route yank in
    // the middle of an approach. ADB's status is the authority on arrival:
    // when it says arrived/landed, draw the LANDED scene; while the same-leg
    // glide is finishing, refuse the -1 downgrade and let it land.
    var _st = '';
    try { _st = String((g._gateInbound && g._gateInbound.status) || '').toLowerCase(); } catch (e) {}
    var _legMatches = sameLeg(GL.o, o) && sameLeg(GL.d, d);
    if (/arriv|land/.test(_st) && look(org) && look(dst)) {
      var arcL = g.OCGateMap.gcPoints(o, d, 160);
      m.setView(d, 11);
      m.setRoute(o, d, 1, { arc: arcL, originCode: org, destCode: dst });
      m.setPlane(d[0], d[1], g.OCGateMap.bearing(arcL[arcL.length - 2], arcL[arcL.length - 1]), 1);
      delete GL.views[kind];
      if (!Object.keys(GL.views).length) stopGlide();
      return;
    }
    if ((prog == null || prog < 0) && _legMatches && GL.raf && typeof GL.p === 'number' && GL.p > 0.9) {
      return;   // the approach is finishing — a -1 sentinel must not yank it
    }

    var p = Math.max(0, Math.min(1, prog || 0));
    var cz = cruiseZoomFor(o, d);
    var zoom, center;
    if      (p < 0.02) { zoom = cz;      center = [(o[0] + d[0]) / 2, (o[1] + d[1]) / 2]; }
    else if (p < 0.06) { zoom = 10;      center = o; }
    else if (p < 0.12) { zoom = 8;       center = o; }
    else if (p < 0.25) { zoom = cz + 1;  center = o; }
    else if (p < 0.75) { zoom = cz;      center = null; }   // centre on the plane
    else if (p < 0.88) { zoom = cz + 1;  center = d; }
    else if (p < 0.94) { zoom = 8;       center = d; }
    else if (p < 0.98) { zoom = 10;      center = d; }
    else               { zoom = 11;      center = d; }

    var showRoute = true;
    try { showRoute = g._gateMapShowOverlay('route'); } catch (e) {}

    var arc = g.OCGateMap.gcPoints(o, d, 160);
    var planeLL = null;
    if (p >= 0.02) {
      var f = p * (arc.length - 1), i = Math.min(Math.floor(f), arc.length - 2), t = f - i;
      planeLL = [arc[i][0] + (arc[i + 1][0] - arc[i][0]) * t,
                 arc[i][1] + (arc[i + 1][1] - arc[i][1]) * t];
    }

    // ── ONE CAMERA OWNER AT A TIME (Nick, watching: "glitching") ────────
    // Every telemetry tick re-enters this builder. The first cut re-ran the
    // full camera decision each time, so setView snapped the view once per
    // poll while the glide's follow-cam was smoothly panning — two owners
    // fighting, the exact metronome the old path's skip-guards existed to
    // prevent. While a same-leg glide is flying this surface, a tick only
    // RE-ANCHORS the model (startGlide keeps the drawn position and folds
    // the error into the rate); the camera belongs to the glide.
    if (_legMatches && GL.raf && GL.views[kind]) {
      if (planeLL && p < 0.995) {
        if (Math.round(m.getZoom()) !== zoom && p >= 0.12) m.setView(planeLL, zoom);
        startGlide(kind, m, o, d, planeLL, arc, 450, dst, org, false);
        return;
      }
    }
    // ONE camera decision — the invariant the Leaflet path took three
    // versions to reach, kept by construction here.
    if (p < 0.02) {
      m.fitBounds([o, d], { padding: kind === MINI ? [40, 40] : [14, 14],
                            maxZoom: kind === MINI ? 9 : 11 });
    } else if (planeLL && p >= 0.12 && p < 0.995) {
      m.setView(planeLL, zoom);
    } else {
      m.setView(center || planeLL || o, zoom);
    }
    m.setRoute(o, d, p, { arc: arc, originCode: org, destCode: dst });
    // THE ESTIMATED PLANE FLIES TOO (Nick, reviewing the static version: "the
    // plane doesnt move"). Live ADS-B is dead (403), so estimates are what the
    // boards mostly show — a plane that only jumps on telemetry ticks reads as
    // broken. Glide it at nominal cruise; every tick re-anchors the model to
    // the schedule's real progress, so drift is bounded by one poll interval.
    if (planeLL && p < 0.995) {
      startGlide(kind, m, o, d, planeLL, arc, 450, dst, org, false);
    } else {
      delete GL.views[kind];
      if (!Object.keys(GL.views).length) stopGlide();
    }
  }

  // ── LIVE DRAW (real fix) ─────────────────────────────────────────────────
  function live(kind, org, dst, lat, lng) {
    if (org == null || dst == null || lat == null || lng == null) return;  // a
    // no-args refresh call used to DESTROY the live map (found + documented
    // in the audit); with no route there is nothing to redraw — keep the
    // current picture.
    var r = resolveOrFallback(kind, org, dst, function () { live(kind, org, dst, lat, lng); });
    if (!r) return;
    var o = r.o, d = r.d;
    var m = surface(kind);
    if (!m) return;
    m._fidsLive = true;
    var _legMatches = sameLeg(GL.o, o) && sameLeg(GL.d, d);

    // progressive zoom by distance-from-field, with the anti-flap rules
    var distO = Math.hypot(lat - o[0], lng - o[1]);
    var distD = Math.hypot(lat - d[0], lng - d[1]);
    var span  = Math.hypot(o[0] - d[0], o[1] - d[1]) || 1;
    var nearO = distO / span, nearD = distD / span;
    var zoom =
      nearO < 0.006 ? 15 : nearO < 0.02 ? 13 : nearO < 0.06 ? 11 : nearO < 0.14 ? 9 :
      nearD < 0.006 ? 15 : nearD < 0.02 ? 13 : nearD < 0.06 ? 11 : nearD < 0.14 ? 9 :
      cruiseZoomFor(o, d);
    var key = String(org).toUpperCase() + '>' + String(dst).toUpperCase();
    var lv = (g._GATE_MAP_VIEW && g._GATE_MAP_VIEW.key === key) ? g._GATE_MAP_VIEW : null;
    if (lv) {
      if (Math.abs(lv.lat - lat) < 0.05 && Math.abs(lv.lng - lng) < 0.05) zoom = lv.zoom;
      if (zoom !== lv.zoom) zoom = lv.zoom + (zoom > lv.zoom ? 1 : -1);   // ≤1 step
    }
    g._GATE_MAP_VIEW = { key: key, lat: lat, lng: lng, zoom: zoom };

    // route bends THROUGH the fix; final leg runway-aligned when arriving
    var legA = g.OCGateMap.gcPoints(o, [lat, lng], 90);
    var legB = null;
    try { legB = g._runwayFinalPath([lat, lng], d, dst); } catch (e) {}
    if (!legB) legB = g.OCGateMap.gcPoints([lat, lng], d, 90);
    var route = legA.concat(legB.slice(1));

    // ground speed: live fix first, then the glide's remembered speed if
    // fresh; zero on the ground — taxiing planes step between real fixes
    var spd = 0;
    try {
      var lp = g._gateInboundLivePos;
      if (lp && lp.spd > 0) spd = lp.spd;
      else if (GL.lastSpd > 0 && (Date.now() - (GL.lastSpdAt || 0)) < 300000) spd = GL.lastSpd;
      if (lp && lp.onGround === true) spd = 0;
    } catch (e) {}

    // ── TOUCHDOWN BEFORE ADB SAYS SO ────────────────────────────────────
    // (Nick, watching Halifax live: "I just saw a plane in halifax landing it
    // stoped" — the card read Speed 257 kph / Altitude 0 ft while status was
    // still 'Delayed'.) A fix that is ON THE GROUND within a few miles of the
    // destination IS the landing; ADB's status flip arrives minutes later.
    // Present landed now — plane held at its true stopping point on the
    // field, route fully flown, camera in on the airport — instead of a
    // frozen mid-glide frame. When ADB flips to arrived, the estimate path's
    // landed scene takes over seamlessly.
    var _lpL = null; try { _lpL = g._gateInboundLivePos; } catch (e) {}
    var _onGnd = !!(_lpL && (_lpL.onGround === true ||
                   (typeof _lpL.alt === 'number' && _lpL.alt < 150)));
    if (_onGnd && nmDist([lat, lng], d) < 8) {
      m.setView([lat, lng], Math.max(zoom, 13));
      m.setRoute(o, d, 1, { arc: route, originCode: org, destCode: dst });
      m.setPlane(lat, lng,
        g.OCGateMap.bearing(route[route.length - 2], route[route.length - 1]), 1);
      delete GL.views[kind];
      if (!Object.keys(GL.views).length) stopGlide();
      return;
    }
    if (_legMatches && GL.raf && GL.live && GL.views[kind]) {
      // same leg, glide healthy: rebuild the drawn route through the new fix
      // and hand the model the fix — no setView, no snap. The follow-cam
      // pans when the plane drifts; that is the only camera motion.
      if (Math.round(m.getZoom()) !== zoom) m.setView([lat, lng], zoom);
      m.setRoute(o, d, 0, { arc: route, originCode: org, destCode: dst });
      startGlide(kind, m, o, d, [lat, lng], route, spd, dst, org, true);
      return;
    }
    m.setView([lat, lng], zoom);
    m.setRoute(o, d, 0, { arc: route, originCode: org, destCode: dst });
    startGlide(kind, m, o, d, [lat, lng], route, spd, dst, org, true);
  }

  // ── THE GLIDE ────────────────────────────────────────────────────────────
  var GL = { gen: 0, raf: null, views: {}, p: null, at: 0, o: null, d: null,
             lastSpd: 0, lastSpdAt: 0 };
  g._gateGlide = GL;                                    // watchdog + probes read this
  var CONVERGE_MS = 45000, MAX_SLEW_DPS = 40, FOLLOW = 0.28, FRAME_MS = 33;

  function nmDist(a, b) { try { return g._gcNm(a, b); } catch (e) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]) * 60; } }
  function sameLeg(A, B) {
    return !!(A && B && Math.abs(A[0] - B[0]) < 5e-4 && Math.abs(A[1] - B[1]) < 5e-4);
  }

  function stopGlide() {
    GL.gen = (GL.gen + 1) | 0;
    if (GL.raf) { try { g.cancelAnimationFrame(GL.raf); } catch (e) {} GL.raf = null; }
  }
  g._stopGateMapGlide = stopGlide;

  function startGlide(kind, map, o, d, fix, route, speedKts, destIata, orgIata, isLive) {
    // cumulative-distance table — position by distance, not vertex index
    var cum = [0];
    for (var i = 1; i < route.length; i++) cum.push(cum[i - 1] + nmDist(route[i - 1], route[i]));
    var routeNm = cum[cum.length - 1] || 1;
    // the fix sits at the junction of the two legs; read its p off the table
    var seedNm = 0, bestD = Infinity;
    for (var s = 0; s < route.length; s++) {
      var dd = Math.hypot(route[s][0] - fix[0], route[s][1] - fix[1]);
      if (dd < bestD) { bestD = dd; seedNm = cum[s]; }
    }
    var p = seedNm / routeNm, errP = 0;
    var fresh = !(GL.at > 0) || (Date.now() - GL.at) < 90000;
    var isSame = sameLeg(GL.o, o) && sameLeg(GL.d, d);
    if (isSame && fresh && typeof GL.p === 'number') {
      var dp = p - GL.p;
      if (Math.abs(dp) * routeNm < 40) { p = GL.p; errP = dp; }   // re-anchor:
    }                                    // keep the drawn spot, owe the error
    if (!isSame) GL.views = {};
    GL.views[kind] = true;
    GL.o = o; GL.d = d; GL.p = p; GL.at = Date.now();
    GL.live = (isLive !== false);
    if (speedKts > 0) { GL.lastSpd = speedKts; GL.lastSpdAt = Date.now(); }

    // rate: base ground speed plus the owed error flown off over 45s.
    // Clamped ≥ 0 — "truth is behind us" reads as slowing, never reversing.
    var base = (speedKts > 0) ? (speedKts / 3600000) / routeNm : 0;    // p per ms
    var rate = Math.max(0, base + errP / CONVERGE_MS);
    var gen = GL.gen = (GL.gen + 1) | 0;
    if (GL.raf) { try { g.cancelAnimationFrame(GL.raf); } catch (e) {} GL.raf = null; }

    var now0 = performance.now(), p0 = p, hdg = null, lastFrame = 0, seg = 0;
    var cap = Math.min(Math.max(0.9, 1 - 0.05 / routeNm), 1);
    var codes = { originCode: orgIata || '', destCode: destIata || '' };

    function headingAtNm(nm) {
      var ahead = Math.min(routeNm, nm + Math.max(2, routeNm * 0.01));
      function at(x) {
        var j = 0; while (j < cum.length - 2 && cum[j + 1] < x) j++;
        var f2 = (cum[j + 1] - cum[j] > 1e-9) ? (x - cum[j]) / (cum[j + 1] - cum[j]) : 0;
        return [route[j][0] + (route[j + 1][0] - route[j][0]) * f2,
                route[j][1] + (route[j + 1][1] - route[j][1]) * f2];
      }
      return g.OCGateMap.bearing(at(nm), at(ahead));
    }

    function frame(ts) {
      if (gen !== GL.gen) return;                       // orphaned loop dies
      // prune surfaces whose container went away; die when none left
      var alive = [];
      for (var k in GL.views) {
        var mm = (k === MINI) ? g.gateMap : g._bigCraftMap;
        if (mm instanceof g.OCGateMap && mm.getContainer() && mm.getContainer().isConnected) alive.push([k, mm]);
        else delete GL.views[k];
      }
      if (!alive.length) { stopGlide(); return; }
      if (ts - lastFrame < FRAME_MS) {                  // 30fps is smooth on a
        GL.raf = g.requestAnimationFrame(frame);        // float-coordinate
        return;                                         // canvas, and half the
      }                                                 // CPU of 60
      var dtMs = lastFrame ? ts - lastFrame : FRAME_MS;
      lastFrame = ts;

      var el = ts - now0; if (!(el > 0)) el = 0;
      var np = Math.min(cap, p0 + rate * el);
      if (typeof GL.p === 'number' && np < GL.p && gen === GL.gen) np = GL.p;
      GL.p = np; GL.at = Date.now();

      var target = np * routeNm;
      if (cum[seg] > target) seg = 0;
      while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
      var f = (cum[seg + 1] - cum[seg] > 1e-9) ? (target - cum[seg]) / (cum[seg + 1] - cum[seg]) : 0;
      var lat = route[seg][0] + (route[seg + 1][0] - route[seg][0]) * f;
      var lng = route[seg][1] + (route[seg + 1][1] - route[seg][1]) * f;

      var tgt = headingAtNm(target);
      if (hdg === null) hdg = tgt;
      else {
        var dh = ((tgt - hdg + 540) % 360) - 180;
        if (Math.abs(dh) > 35) hdg = tgt;               // bad seed → snap
        else {
          var lim = MAX_SLEW_DPS * (dtMs / 1000); if (!(lim > 0)) lim = 0.05;
          hdg = (hdg + Math.max(-lim, Math.min(lim, dh)) + 360) % 360;
        }
      }

      for (var a = 0; a < alive.length; a++) {
        var m2 = alive[a][1];
        if (!m2._route || m2._route.arc !== route) m2.setRoute(o, d, np, Object.assign({ arc: route }, codes));
        m2.setPlane(lat, lng, hdg, np);
        // follow-camera: eased pan once >28% off-centre, never stacked
        var sz = m2.getSize(), pt = m2.latLngToContainerPoint([lat, lng]);
        if (!m2._acFollowing &&
            (Math.abs(pt.x - sz.x / 2) > sz.x * FOLLOW || Math.abs(pt.y - sz.y / 2) > sz.y * FOLLOW)) {
          m2._acFollowing = 1;
          (function (mm2) { setTimeout(function () { try { mm2._acFollowing = 0; } catch (e) {} }, 2600); })(m2);
          m2.panTo([lat, lng], { duration: 1.2 });
        }
      }
      // the marker watchdog reads a marker-shaped object; feed it the truth
      g._gatePlaneMk = { _map: alive[0][1], getLatLng: (function (la, ln) {
        return function () { return { lat: la, lng: ln }; }; })(lat, lng) };
      GL.raf = g.requestAnimationFrame(frame);
    }
    GL.raf = g.requestAnimationFrame(frame);
  }

  // keep the old signature — external callers pass Leaflet-era args
  g._startGateMapGlide = function (map, o, d, lat, lng, marker, a1, a2, speedKts, destIata) {
    try {
      var kind = (map === g._bigCraftMap) ? BIG : MINI;
      var m = surface(kind); if (!m) return;
      var legA = g.OCGateMap.gcPoints(o, [lat, lng], 90);
      var legB = null;
      try { legB = g._runwayFinalPath([lat, lng], d, destIata); } catch (e) {}
      if (!legB) legB = g.OCGateMap.gcPoints([lat, lng], d, 90);
      startGlide(kind, m, o, d, [lat, lng], legA.concat(legB.slice(1)), speedKts, destIata, '');
    } catch (e) {}
  };

  // ── the four entry points ────────────────────────────────────────────────
  g.initGateMap      = function (org, dst, prog) { estimate(MINI, org, dst, prog); };
  g.initGateMapLive  = function (org, dst, lat, lng) { live(MINI, org, dst, lat, lng); };
  g._bigMapClone     = function (org, dst, prog) {
    try { g._bigCraftRouteMemo = { org: org, dst: dst, prog: prog, at: Date.now() }; } catch (e) {}
    estimate(BIG, org, dst, prog);
  };
  g._bigMapCloneLive = function (org, dst, lat, lng) { live(BIG, org, dst, lat, lng); };

  try { console.log('[OCMAP] canvas gate map active — Leaflet path superseded'); } catch (e) {}
})(window);
