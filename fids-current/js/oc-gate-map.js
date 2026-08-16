/* ══════════════════════════════════════════════════════════════════════════
 * OC GATE MAP — a 2D canvas route map, replacing Leaflet on the gate boards.
 *
 * WHY THIS EXISTS. The Leaflet gate map was rebuilt from scratch on every
 * draw: map.remove(), a new L.map(), a fresh tile layer, new markers. That is
 * a DOM teardown several times inside one slide's dwell, on a 2-vCPU droplet
 * that is also running ffmpeg — tiles reloading from grey, the camera moving
 * two or three times per frame, the aircraft marker orphaned and re-created.
 * Every fix for it was another guard on top of an unfixed cause.
 *
 * This has no DOM to churn. It is ONE <canvas> and ONE draw() that paints the
 * current state. Nothing is created or destroyed per frame, so the entire
 * class of bug — rebuild storms, orphaned markers, camera fighting itself —
 * cannot occur. There is no tile server and no network: the coastline ships
 * as 9.8KB of gzipped geometry.
 *
 * WHAT IT DRAWS, per Nick's spec: route line, airport dots with codes, the
 * aircraft with true heading, runway-aligned approach, halftone texture,
 * place names, built-in coastlines.
 * WHAT IT DELIBERATELY DOES NOT: OSM street tiles, rain radar, surrounding
 * traffic, the dark scrim. Those were cut on purpose.
 *
 * Projection is Web Mercator at 256px tiles — identical to Leaflet's — so
 * existing zoom numbers, fitBounds padding and latLngToContainerPoint results
 * carry over unchanged and the call sites do not need re-tuning.
 * ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var TILE = 256;
  var MAX_LAT = 85.05112878;                  // Mercator clamp, as Leaflet

  function clampLat(lat) { return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)); }

  // lat/lon -> world pixels at a given zoom (Web Mercator)
  function project(lat, lng, z) {
    var scale = TILE * Math.pow(2, z);
    var x = (lng + 180) / 360 * scale;
    var s = Math.sin(clampLat(lat) * Math.PI / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
    return { x: x, y: y };
  }
  function unproject(x, y, z) {
    var scale = TILE * Math.pow(2, z);
    var lng = x / scale * 360 - 180;
    var n = Math.PI - 2 * Math.PI * y / scale;
    var lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat: lat, lng: lng };
  }

  // Great-circle interpolation. The route must bend the way a flight actually
  // flies; a straight screen line between distant airports is simply wrong.
  function gcPoints(a, b, n) {
    var R = Math.PI / 180;
    var la1 = a[0] * R, lo1 = a[1] * R, la2 = b[0] * R, lo2 = b[1] * R;
    var d = 2 * Math.asin(Math.sqrt(
      Math.pow(Math.sin((la2 - la1) / 2), 2) +
      Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((lo2 - lo1) / 2), 2)));
    var out = [];
    if (!isFinite(d) || d === 0) return [[a[0], a[1]], [b[0], b[1]]];
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      var A = Math.sin((1 - f) * d) / Math.sin(d);
      var B = Math.sin(f * d) / Math.sin(d);
      var x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
      var y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
      var z = A * Math.sin(la1) + B * Math.sin(la2);
      out.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / R, Math.atan2(y, x) / R]);
    }
    // Unwrap the antimeridian so the polyline never streaks across the map —
    // the exact fault the Leaflet version had to special-case.
    for (var k = 1; k < out.length; k++) {
      while (out[k][1] - out[k - 1][1] >  180) out[k][1] -= 360;
      while (out[k][1] - out[k - 1][1] < -180) out[k][1] += 360;
    }
    return out;
  }

  function bearing(a, b) {
    var R = Math.PI / 180;
    var dLon = (b[1] - a[1]) * R, la1 = a[0] * R, la2 = b[0] * R;
    return Math.atan2(Math.sin(dLon) * Math.cos(la2),
      Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)) / R;
  }

  var THEME = {
    sea:      '#0d2438',
    land:     '#16344d',
    coast:    'rgba(150,190,220,0.55)',
    graticule:'rgba(255,255,255,0.05)',
    route:    '#60a5fa',
    flown:    'rgba(96,165,250,0.95)',
    origin:   '#60a5fa',
    dest:     '#ef4444',
    label:    '#eaf2fb',
    labelHalo:'rgba(4,14,26,0.92)',
    place:    'rgba(198,220,240,0.62)'
  };

  function OCGateMap(el, opts) {
    opts = opts || {};
    this.el = (typeof el === 'string') ? document.getElementById(el) : el;
    if (!this.el) throw new Error('OCGateMap: container not found');
    this.theme = Object.assign({}, THEME, opts.theme || {});
    this.center = opts.center || [20, 0];
    this.zoom = (opts.zoom == null) ? 3 : opts.zoom;
    this.halftone = opts.halftone !== false;
    this.places = opts.places !== false;

    this._route = null;      // {o,d,p,arc}
    this._plane = null;      // {lat,lng,hdg}
    // The CLASSIC OSM STREET BASE — Nick chose it in Jul 2026 ("wants the
    // classic OpenStreetMap street map") and the first canvas cut wrongly
    // dropped it, leaving an empty blue field at gate zooms ("a blue
    // background with nothing and says nothing"). The canvas draws the same
    // tiles the Leaflet layer did, from the same same-origin worker proxy —
    // still one canvas, still no DOM churn, and the vector coast beneath
    // covers the moment before tiles arrive (never Leaflet's grey ground).
    this.tiles = opts.tiles !== false;
    this._tileCache = {};    // "z/x/y" -> {img, ok}
    this._tileKeys = [];     // LRU order, capped
    this._raf = null;
    this._anim = null;

    var c = document.createElement('canvas');
    c.className = 'oc-gate-map-canvas';
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    this.el.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');

    this._resize();
    this._onWinResize = this._resize.bind(this);
    global.addEventListener('resize', this._onWinResize);
    // Self-healing size: the container's layout can change after construction
    // (panel re-tracks, fonts land, the gate re-renders around it). The old
    // Leaflet path handled this with settle timers re-fitting on a schedule;
    // this observes the box itself and re-measures exactly when it changes —
    // no timers, no periodic work on the 24/7 droplet.
    var self = this;
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(function () { self._resize(); self.draw(); });
      this._ro.observe(this.el);
    }
    this.draw();
  }

  OCGateMap.prototype._resize = function () {
    // LAYOUT size, not getBoundingClientRect. gBCR includes CSS transforms —
    // the bigcraft takeover enters through a grow animation from scale(0.62),
    // and a canvas constructed mid-grow measured 0.62x of its real box and
    // drew tiny forever (Nick: "the big screen does not work"; measured
    // 466x280 inside a 752x452 container — exactly 0.62). clientWidth/Height
    // report the transform-independent layout box, which is final from the
    // first frame of the animation.
    var w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) { var r = this.el.getBoundingClientRect(); w = r.width; h = r.height; }
    var dpr = Math.min(global.devicePixelRatio || 1, 2);   // cap: a 4K board
    this.w = Math.max(1, Math.round(w));                   // gains nothing past 2
    this.h = Math.max(1, Math.round(h));
    this.canvas.width  = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // ── the Leaflet-shaped surface the gate code already calls ──────────────
  OCGateMap.prototype.getSize = function () { return { x: this.w, y: this.h }; };
  OCGateMap.prototype.getZoom = function () { return this.zoom; };
  OCGateMap.prototype.getContainer = function () { return this.el; };
  OCGateMap.prototype.invalidateSize = function () { this._resize(); this.draw(); return this; };

  OCGateMap.prototype.setView = function (center, zoom, o) {
    this._stopAnim();
    this.center = [center[0], center[1]];
    if (zoom != null) this.zoom = zoom;
    this.draw();
    return this;
  };

  OCGateMap.prototype.latLngToContainerPoint = function (ll) {
    var lat = ll[0] != null ? ll[0] : ll.lat, lng = ll[1] != null ? ll[1] : ll.lng;
    var c = project(this.center[0], this.center[1], this.zoom);
    var p = project(lat, lng, this.zoom);
    return { x: p.x - c.x + this.w / 2, y: p.y - c.y + this.h / 2 };
  };

  OCGateMap.prototype.fitBounds = function (bounds, o) {
    o = o || {};
    var pad = (o.padding && o.padding[0]) || 20;
    var a = bounds[0], b = bounds[1];
    var la1 = Math.min(a[0], b[0]), la2 = Math.max(a[0], b[0]);
    var lo1 = Math.min(a[1], b[1]), lo2 = Math.max(a[1], b[1]);
    // Pick the largest zoom whose span still fits the padded viewport. Computed
    // from the TARGET zoom each time, never from the current one — Leaflet's
    // getBoundsZoom() derives from the current view, which is why repeated
    // fitBounds() calls ratcheted the old map tighter and tighter.
    var best = 0;
    for (var z = 18; z >= 0; z--) {
      var p1 = project(la2, lo1, z), p2 = project(la1, lo2, z);
      if (Math.abs(p2.x - p1.x) <= (this.w - pad * 2) &&
          Math.abs(p2.y - p1.y) <= (this.h - pad * 2)) { best = z; break; }
    }
    if (o.maxZoom != null) best = Math.min(best, o.maxZoom);
    this._stopAnim();
    this.center = [(la1 + la2) / 2, (lo1 + lo2) / 2];
    this.zoom = best;
    this.draw();
    return this;
  };

  // Eased pan for the live follow-camera. The world must not snap sideways
  // under a smoothly gliding aircraft.
  OCGateMap.prototype.panTo = function (center, o) {
    o = o || {};
    var ms = (o.duration != null ? o.duration : 0.45) * 1000;
    if (!ms) return this.setView(center, null, o);
    var self = this, from = this.center.slice(), to = [center[0], center[1]];
    var t0 = null;
    this._stopAnim();
    this._anim = function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / ms);
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
      self.center = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
      self.draw();
      if (k < 1) self._raf = global.requestAnimationFrame(self._anim);
      else self._anim = null;
    };
    this._raf = global.requestAnimationFrame(this._anim);
    return this;
  };
  OCGateMap.prototype.flyTo = function (c, z, o) { if (z != null) this.zoom = z; return this.panTo(c, o); };

  OCGateMap.prototype._stopAnim = function () {
    if (this._raf) { try { global.cancelAnimationFrame(this._raf); } catch (e) {} this._raf = null; }
    this._anim = null;
  };

  OCGateMap.prototype.remove = function () {
    this._stopAnim();
    try { global.removeEventListener('resize', this._onWinResize); } catch (e) {}
    try { if (this._ro) this._ro.disconnect(); } catch (e) {}
    try { if (this.canvas.parentNode) this.canvas.remove(); } catch (e) {}
    return this;
  };

  // ── content ────────────────────────────────────────────────────────────
  // Set the whole route in one call. There is no add/remove layer dance and
  // therefore nothing to leak or orphan: state in, picture out.
  OCGateMap.prototype.setRoute = function (o, d, progress, opts) {
    opts = opts || {};
    // opts.arc: a precomputed path (e.g. origin -> live fix -> runway-aligned
    // final). The glide rebuilds its route through the aircraft's real
    // position, so the drawn line must be able to bend through it too.
    var arc = opts.arc || gcPoints(o, d, 160);
    this._route = { o: o, d: d, p: progress, arc: arc,
                    oCode: opts.originCode || '', dCode: opts.destCode || '' };
    if (progress > 0.005 && progress < 0.999) {
      var f = Math.max(0, Math.min(1, progress)) * (arc.length - 1);
      var i = Math.min(Math.floor(f), arc.length - 2), t = f - i;
      var A = arc[i], B = arc[i + 1];
      this._plane = {
        lat: A[0] + (B[0] - A[0]) * t,          // interpolated, never snapped
        lng: A[1] + (B[1] - A[1]) * t,          // to a vertex
        hdg: (opts.heading != null) ? opts.heading : bearing(A, B)
      };
    } else this._plane = null;
    if (opts.plane) this._plane = opts.plane;   // a live ADS-B fix wins
    this.draw();
    return this;
  };

  // Per-frame glide update: move ONLY the aircraft, keep the route as set.
  // progress still drives the flown/remaining split so the solid line grows
  // under the plane.
  OCGateMap.prototype.setPlane = function (lat, lng, hdg, progress) {
    this._plane = { lat: lat, lng: lng, hdg: hdg };
    if (this._route && progress != null) this._route.p = progress;
    this.draw();
    return this;
  };

  // Single known pin — the world-view fallback for an unresolvable exotic
  // code. One dot with its label; never a blank grey box.
  OCGateMap.prototype.setPin = function (lat, lng, colour, code) {
    this._route = { o: [lat, lng], d: [lat, lng], p: 0, arc: [[lat, lng], [lat, lng]],
                    oCode: code || '', dCode: '', _pinColour: colour };
    this._plane = null;
    this.draw();
    return this;
  };

  OCGateMap.prototype._pt = function (lat, lng, cx, cy) {
    var p = project(lat, lng, this.zoom);
    return [p.x - cx + this.w / 2, p.y - cy + this.h / 2];
  };

  OCGateMap.prototype.draw = function () {
    var g = this.ctx, T = this.theme;
    if (!g) return;
    var c = project(this.center[0], this.center[1], this.zoom);
    var cx = c.x, cy = c.y, W = this.w, H = this.h;

    g.clearRect(0, 0, W, H);
    g.fillStyle = T.sea; g.fillRect(0, 0, W, H);

    // coastlines — drawn from geometry, no tiles
    var coast = global.WORLD_COAST;
    if (coast && coast.length) {
      var scale = TILE * Math.pow(2, this.zoom);
      g.lineJoin = 'round';
      for (var wrap = -1; wrap <= 1; wrap++) {          // repeat E/W so a route
        var offset = wrap * scale;                      // crossing the dateline
        g.beginPath();                                  // still sits on land
        for (var r = 0; r < coast.length; r++) {
          var ring = coast[r];
          for (var i = 0; i < ring.length; i++) {
            var p = project(ring[i][1], ring[i][0], this.zoom);
            var x = p.x - cx + W / 2 + offset, y = p.y - cy + H / 2;
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.closePath();
        }
        g.fillStyle = T.land; g.fill('evenodd');
        g.strokeStyle = T.coast; g.lineWidth = 1; g.stroke();
      }
    }

    var tilesCover = false;
    if (this.tiles) tilesCover = this._drawTiles(g, cx, cy, W, H);

    if (!tilesCover && this.halftone) this._drawHalftone(g, W, H);

    // Place names — from data, not tiles. Rank-gated by zoom so a world view
    // shows only megacities and a final-approach view shows the local towns;
    // greedy collision culling so labels never pile into each other. Important
    // places are drawn first, so when two collide the bigger city wins.
    if (!tilesCover && this.places && global.WORLD_PLACES) this._drawPlaces(g, cx, cy, W, H);

    var R = this._route;
    if (R) {
      // WORLD-COPY ALIGNMENT. gcPoints() unwraps longitudes so the polyline is
      // continuous across the antimeridian — a YYZ->HKG arc legitimately runs
      // to -246 deg. Projected literally that lands in a world copy the camera
      // is not looking at, and the route silently vanishes (measured: the
      // dateline case drew neither line nor origin dot). Shift the whole arc,
      // and both endpoints with it, by whole worlds so its midpoint sits
      // nearest the view centre. One offset for all three keeps them together.
      var _mid = R.arc[Math.floor(R.arc.length / 2)][1];
      var _wrapDeg = Math.round((this.center[1] - _mid) / 360) * 360;
      var pts = R.arc.map(function (ll) { return this._pt(ll[0], ll[1] + _wrapDeg, cx, cy); }, this);
      var cut = Math.round(Math.max(0, Math.min(1, R.p)) * (pts.length - 1));

      g.lineCap = 'round'; g.lineJoin = 'round';
      g.setLineDash([9, 7]); g.lineWidth = 3;           // remaining leg, dashed
      g.strokeStyle = 'rgba(96,165,250,0.55)';
      g.beginPath();
      for (var j = cut; j < pts.length; j++) (j === cut ? g.moveTo : g.lineTo).apply(g, pts[j]);
      g.stroke();

      g.setLineDash([]); g.lineWidth = 4;               // flown leg, solid
      g.strokeStyle = T.flown;
      g.beginPath();
      for (var k = 0; k <= cut; k++) (k === 0 ? g.moveTo : g.lineTo).apply(g, pts[k]);
      g.stroke();

      if (R._pinColour) {
        this._dot(g, this._pt(R.o[0], R.o[1] + _wrapDeg, cx, cy), R._pinColour, R.oCode);
      } else {
        this._dot(g, this._pt(R.o[0], R.o[1] + _wrapDeg, cx, cy), T.origin, R.oCode);
        this._dot(g, this._pt(R.d[0], R.d[1] + _wrapDeg, cx, cy), T.dest,  R.dCode);
      }
    }

    if (this._plane) {
      var _pw = R ? Math.round((this.center[1] - R.arc[Math.floor(R.arc.length / 2)][1]) / 360) * 360 : 0;
      this._drawPlane(g, this._pt(this._plane.lat, this._plane.lng + _pw, cx, cy), this._plane.hdg);
    }
  };

  OCGateMap.prototype._dot = function (g, p, colour, code) {
    g.beginPath(); g.arc(p[0], p[1], 6, 0, Math.PI * 2);
    g.fillStyle = colour; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.stroke();
    if (!code) return;
    g.font = '700 15px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.lineWidth = 4; g.strokeStyle = this.theme.labelHalo;
    g.strokeText(code, p[0], p[1] + 10);                // halo keeps it legible
    g.fillStyle = this.theme.label;                     // over land or sea
    g.fillText(code, p[0], p[1] + 10);
  };

  var PLANE_IMG = null, PLANE_OK = false;
  function planeImg() {
    if (PLANE_IMG) return PLANE_IMG;
    PLANE_IMG = new Image();
    PLANE_IMG.onload = function () { PLANE_OK = true; };
    PLANE_IMG.src = '/logos/map-plane-jet.png';
    return PLANE_IMG;
  }

  OCGateMap.prototype._drawPlane = function (g, p, hdg) {
    // Nick's real jet artwork — "the plane is not a real plane" was the
    // review of the hand-drawn silhouette. The silhouette survives only as
    // the first-frames fallback while the PNG decodes.
    var img = planeImg();
    if (PLANE_OK) {
      g.save();
      g.translate(p[0], p[1]);
      g.rotate((hdg || 0) * Math.PI / 180);
      g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 7;
      g.drawImage(img, -24, -24, 48, 48);
      g.restore();
      return;
    }
    g.save();
    g.translate(p[0], p[1]);
    g.rotate((hdg || 0) * Math.PI / 180);
    g.beginPath();                                      // nose-up silhouette
    g.moveTo(0, -13); g.lineTo(4, -3); g.lineTo(15, 5); g.lineTo(15, 8);
    g.lineTo(3, 5);  g.lineTo(2.5, 12); g.lineTo(7, 16); g.lineTo(7, 18);
    g.lineTo(0, 16);
    g.lineTo(-7, 18); g.lineTo(-7, 16); g.lineTo(-2.5, 12); g.lineTo(-3, 5);
    g.lineTo(-15, 8); g.lineTo(-15, 5); g.lineTo(-4, -3);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 7;
    g.fill();
    g.restore();
  };

  OCGateMap.prototype._drawTiles = function (g, cx, cy, W, H) {
    var z = Math.round(this.zoom);
    if (z < 0 || z > 19) return false;
    var n = Math.pow(2, z);
    var tx0 = Math.floor((cx - W / 2) / TILE), tx1 = Math.floor((cx + W / 2) / TILE);
    var ty0 = Math.max(0, Math.floor((cy - H / 2) / TILE));
    var ty1 = Math.min(n - 1, Math.floor((cy + H / 2) / TILE));
    var self = this, all = true, drawn = 0, want = 0;
    for (var tx = tx0; tx <= tx1; tx++) {
      var wx = ((tx % n) + n) % n;                      // wrap E/W
      for (var ty = ty0; ty <= ty1; ty++) {
        want++;
        var key = z + '/' + wx + '/' + ty;
        var t = this._tileCache[key];
        if (!t) {
          t = this._tileCache[key] = { img: new Image(), ok: false };
          this._tileKeys.push(key);
          if (this._tileKeys.length > 220) {            // LRU cap — a kiosk
            var old = this._tileKeys.shift();           // runs for months
            delete this._tileCache[old];
          }
          t.img.onload = (function (tt) { return function () {
            tt.ok = true; self.draw();                  // repaint as they land
          }; })(t);
          t.img.onerror = function () {};
          t.img.src = '/tiles/osm/' + key + '.png';
        }
        if (t.ok) {
          g.drawImage(t.img, tx * TILE - cx + W / 2, ty * TILE - cy + H / 2, TILE, TILE);
          drawn++;
        } else all = false;
      }
    }
    // "covered" only when every visible tile painted — until then the vector
    // coast beneath stays visible instead of a grey void
    return all && drawn === want && want > 0;
  };

  OCGateMap.prototype._drawPlaces = function (g, cx, cy, W, H) {
    var maxRank = Math.max(0, Math.min(5, Math.floor(this.zoom) - 2));
    var scale = TILE * Math.pow(2, this.zoom);
    var taken = [];                                   // drawn label boxes
    var data = global.WORLD_PLACES;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    for (var rank = 0; rank <= maxRank; rank++) {     // big cities claim space first
      for (var i = 0; i < data.length; i++) {
        var pl = data[i];
        if (pl[3] !== rank) continue;
        for (var wrap = -1; wrap <= 1; wrap++) {
          var pr = project(pl[2], pl[1], this.zoom);
          var x = pr.x - cx + W / 2 + wrap * scale, y = pr.y - cy + H / 2;
          if (x < -80 || x > W + 20 || y < -20 || y > H + 20) continue;
          var fs = rank <= 1 ? 13 : rank <= 3 ? 12 : 11;
          g.font = '500 ' + fs + 'px system-ui, -apple-system, sans-serif';
          var w = g.measureText(pl[0]).width + 14;
          var clash = false;
          for (var t = 0; t < taken.length; t++) {
            var b = taken[t];
            if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + 16 && y + 16 > b[1]) { clash = true; break; }
          }
          if (clash) continue;
          taken.push([x, y - 8, w]);
          g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2);
          g.fillStyle = this.theme.place; g.fill();
          g.lineWidth = 3; g.strokeStyle = this.theme.labelHalo;
          g.strokeText(pl[0], x + 6, y);
          g.fillStyle = this.theme.place;
          g.fillText(pl[0], x + 6, y);
        }
      }
    }
  };

  // Halftone: a dot screen over the sea, the print-like texture Nick asked to
  // keep. Cached to an offscreen tile — regenerating it per frame would cost
  // more than everything else on this canvas combined.
  OCGateMap.prototype._drawHalftone = function (g, W, H) {
    if (!this._ht) {
      var t = document.createElement('canvas'); t.width = t.height = 16;
      var tg = t.getContext('2d');
      tg.fillStyle = 'rgba(255,255,255,0.045)';
      tg.beginPath(); tg.arc(4, 4, 1.5, 0, Math.PI * 2); tg.fill();
      tg.beginPath(); tg.arc(12, 12, 1.5, 0, Math.PI * 2); tg.fill();
      this._ht = g.createPattern(t, 'repeat');
    }
    g.fillStyle = this._ht; g.fillRect(0, 0, W, H);
  };

  OCGateMap.project = project;
  OCGateMap.unproject = unproject;
  OCGateMap.gcPoints = gcPoints;
  OCGateMap.bearing = bearing;
  global.OCGateMap = OCGateMap;
})(window);
