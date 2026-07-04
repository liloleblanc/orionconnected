/* ───────────────────────────────────────────────────────────────────────────
 * GATE 3D FLIGHT MAP — ad-slot slide (adapted from map3d-proto.html)
 *
 * Mounts a cinematic 3D route view into the gate's ad carousel for ~a minute,
 * cycling through FOUR camera views, each with its own info chip:
 *   1. ROUTE     — 3D terrain chase along the route (route card)
 *   2. AIRCRAFT  — close-in orbit around the plane (speed/alt or type)
 *   3. OVERVIEW  — flat 2D full-route view (progress + arrival)
 *   4. ARRIVAL   — glide toward the destination (dest city + weather)
 *
 * Engine: MapLibre GL + three.js, self-hosted via the worker's /mapcdn/,
 * /tiles/, /demtiles/ and /models/ routes. Loaded lazily on first mount.
 * If WebGL or the engine is unavailable, available() returns false and the
 * ad deck simply skips the slide — zero impact on the rotation.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var TO_R = Math.PI / 180, TO_D = 180 / Math.PI;

  var HEADING_OFFSET = Math.PI / 2, HEADING_SIGN = -1;
  var TARGET_METERS = 9000, MODEL_URL = '/models/a320neo.glb', MODEL_RY = Math.PI / 2;

  var _libsLoading = null, _libsReady = false, _libsFailed = false;
  var _map = null, _container = null, _timers = [], _raf = 0, _mounted = false;
  var _flight = null, _line = [], _animStart = 0, _animDur = 18000, _animating = false;
  var _planeState = { pos: [0, 0], alt: 3000, yaw: 0, show: false };
  var _planeGroup = null, _planeModel = null, _markers = [];
  var _gl3dOk = null;

  function _webglOk() {
    if (_gl3dOk !== null) return _gl3dOk;
    try {
      var c = document.createElement('canvas');
      _gl3dOk = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { _gl3dOk = false; }
    return _gl3dOk;
  }

  function _loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function _loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }
  function _loadLibs() {
    if (_libsReady) return Promise.resolve();
    if (_libsLoading) return _libsLoading;
    _loadCss('/mapcdn/maplibre-gl.css');
    _libsLoading = _loadScript('/mapcdn/maplibre-gl.js')
      .then(function () { return _loadScript('/mapcdn/three.min.js'); })
      .then(function () { return _loadScript('/mapcdn/gltf-loader.js'); })
      .then(function () { _libsReady = (typeof maplibregl !== 'undefined'); });
    return _libsLoading;
  }

  // ── geometry ──────────────────────────────────────────────────────────
  function greatCircle(a, b, n) {
    var lon1 = a[0] * TO_R, lat1 = a[1] * TO_R, lon2 = b[0] * TO_R, lat2 = b[1] * TO_R;
    var dd = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((lat2 - lat1) / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)));
    if (!dd) return [a.slice(), b.slice()];
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var f = i / n, A = Math.sin((1 - f) * dd) / Math.sin(dd), B = Math.sin(f * dd) / Math.sin(dd);
      var x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
      var y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
      var z = A * Math.sin(lat1) + B * Math.sin(lat2);
      pts.push([Math.atan2(y, x) * TO_D, Math.atan2(z, Math.sqrt(x * x + y * y)) * TO_D]);
    }
    return pts;
  }
  function bearing(a, b) {
    var y = Math.sin((b[0] - a[0]) * TO_R) * Math.cos(b[1] * TO_R);
    var x = Math.cos(a[1] * TO_R) * Math.sin(b[1] * TO_R) - Math.sin(a[1] * TO_R) * Math.cos(b[1] * TO_R) * Math.cos((b[0] - a[0]) * TO_R);
    return (Math.atan2(y, x) * TO_D + 360) % 360;
  }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function splitAt(L, t) {
    if (L.length < 2) return { flown: L.slice(), remain: L.slice(), pos: L[0] || [0, 0], brg: 0 };
    var f = Math.max(0, Math.min(1, t)) * (L.length - 1), k = Math.min(Math.floor(f), L.length - 2), frac = f - k;
    var pt = lerp(L[k], L[k + 1], frac);
    return { flown: L.slice(0, k + 1).concat([pt]), remain: [pt].concat(L.slice(k + 1)), pos: pt, brg: bearing(L[k], L[k + 1]) };
  }

  // ── three.js custom layer (plane model) ───────────────────────────────
  function _buildCustomLayer() {
    return {
      id: 'plane3d', type: 'custom', renderingMode: '3d',
      onAdd: function (m, gl) {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        var d1 = new THREE.DirectionalLight(0xffffff, 0.95); d1.position.set(0.4, 0.8, 0.6); this.scene.add(d1);
        var d2 = new THREE.DirectionalLight(0x88aaff, 0.35); d2.position.set(-0.5, 0.2, -0.4); this.scene.add(d2);
        _planeGroup = new THREE.Group();
        this.scene.add(_planeGroup);
        try {
          new THREE.GLTFLoader().load(MODEL_URL, function (gltf) {
            var model = gltf.scene;
            var box = new THREE.Box3().setFromObject(model), size = new THREE.Vector3(); box.getSize(size);
            var maxDim = Math.max(size.x, size.y, size.z) || 1, sc = TARGET_METERS / maxDim;
            model.scale.setScalar(sc);
            var c = new THREE.Vector3(); box.getCenter(c);
            model.position.set(-c.x * sc, -c.y * sc, -c.z * sc);
            model.rotation.set(0, MODEL_RY, 0);
            if (_planeGroup) { _planeGroup.add(model); _planeModel = model; _planeState.show = true; }
          }, undefined, function () { /* no model — flat icon carries it */ });
        } catch (e) {}
        this.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
        this.renderer.autoClear = false;
      },
      render: function (gl, args) {
        if (_planeState.show && _planeGroup && _map) {
          _planeGroup.rotation.set(0, HEADING_SIGN * _planeState.yaw + HEADING_OFFSET, 0);
          var merc = maplibregl.MercatorCoordinate.fromLngLat({ lng: _planeState.pos[0], lat: _planeState.pos[1] }, _planeState.alt);
          var s = merc.meterInMercatorCoordinateUnits();
          var matArr = (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix) ? args.defaultProjectionData.mainMatrix : args;
          var m4 = new THREE.Matrix4().fromArray(matArr);
          var l = new THREE.Matrix4().makeTranslation(merc.x, merc.y, merc.z)
            .scale(new THREE.Vector3(s, -s, s))
            .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
          this.camera.projectionMatrix = m4.multiply(l);
          this.renderer.resetState();
          this.renderer.render(this.scene, this.camera);
        }
        if (_map) _map.triggerRepaint();
      }
    };
  }

  function _flatIcon() {
    var s = 96, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d'); x.translate(s / 2, s / 2); x.fillStyle = '#ffffff';
    x.strokeStyle = 'rgba(20,30,55,.55)'; x.lineWidth = 2; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(0, -40); x.lineTo(5, -16); x.lineTo(5, -6); x.lineTo(42, 10); x.lineTo(42, 18); x.lineTo(5, 12); x.lineTo(5, 30); x.lineTo(16, 38); x.lineTo(16, 44); x.lineTo(0, 40); x.lineTo(-16, 44); x.lineTo(-16, 38); x.lineTo(-5, 30); x.lineTo(-5, 12); x.lineTo(-42, 18); x.lineTo(-42, 10); x.lineTo(-5, -6); x.lineTo(-5, -16); x.closePath();
    x.fill(); x.stroke(); return x.getImageData(0, 0, s, s);
  }

  // ── info chip ─────────────────────────────────────────────────────────
  function _chip(html) {
    var el = _container && _container.querySelector('.m3d-chip');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(function () { if (el) { el.innerHTML = html; el.style.opacity = '1'; } }, 350);
  }

  function _later(fn, ms) { _timers.push(setTimeout(fn, ms)); }
  function _clearTimers() {
    _timers.forEach(function (t) {
      if (t && t.__ro) { try { t.__ro.disconnect(); } catch (e) {} }
      else clearTimeout(t);
    });
    _timers = [];
  }

  // ── the minute-long 4-view sequence ───────────────────────────────────
  function _sequence(dwellMs) {
    var f = _flight, brg = bearing(f.o, f.d);
    var seg = Math.max(10000, Math.round(dwellMs / 4));
    _animDur = Math.round(seg * 0.92);

    // VIEW 1 — ROUTE: terrain chase from origin toward destination
    _chip('<div class="m3d-t1">' + f.oc + ' → ' + f.dc + '</div>'
      + '<div class="m3d-t2">' + f.oCity + ' to ' + f.dCity + '</div>'
      + '<div class="m3d-t3" style="color:' + f.col + '">' + f.airline + (f.fl ? ' · ' + f.fl : '') + '</div>');
    _map.jumpTo({ center: f.o, zoom: 7.4, pitch: 74, bearing: brg });
    _animating = false;
    _later(function () {
      _animStart = Date.now(); _animating = true;
      _map.easeTo({ center: f.d, zoom: 7.4, pitch: 74, bearing: brg, duration: _animDur, easing: function (t) { return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; } });
    }, 600);

    // VIEW 2 — AIRCRAFT: close in on the plane, slow orbit
    _later(function () {
      var info = '';
      if (f.speedKph || f.altFt) {
        info = (f.speedKph ? '<div class="m3d-t2">' + f.speedKph + ' km/h</div>' : '')
             + (f.altFt ? '<div class="m3d-t2">' + f.altFt.toLocaleString() + ' ft</div>' : '');
      } else if (f.acType) {
        info = '<div class="m3d-t2">' + f.acType + '</div>';
      }
      _chip('<div class="m3d-t1">' + (f.airline || '') + ' ' + (f.fl || '') + '</div>' + info);
      var p = _planeState.pos && _planeState.pos[0] ? _planeState.pos : f.o;
      _map.easeTo({ center: p, zoom: 9.3, pitch: 68, bearing: (brg + 55) % 360, duration: Math.round(seg * 0.9) });
    }, seg);

    // VIEW 3 — OVERVIEW: flat 2D full route
    _later(function () {
      var pct = Math.round((f.progress || 0) * 100);
      _chip('<div class="m3d-t1">' + (pct > 0 && pct < 100 ? pct + '% of the way' : 'Route overview') + '</div>'
        + (f.etaStr ? '<div class="m3d-t2">Arrival ' + f.etaStr + '</div>' : ''));
      var cam = null, b = new maplibregl.LngLatBounds();
      greatCircle(f.o, f.d, 32).forEach(function (p) { b.extend(p); });
      try { cam = _map.cameraForBounds(b, { padding: { top: 90, bottom: 80, left: 80, right: 80 }, maxZoom: 9 }); } catch (e) {}
      _map.easeTo({ pitch: 0, bearing: 0, duration: Math.round(seg * 0.6), zoom: cam ? Math.max(4.5, Math.min(cam.zoom || 7, 8.5)) : 6.5, center: cam ? cam.center : lerp(f.o, f.d, 0.5) });
    }, seg * 2);

    // VIEW 4 — ARRIVAL: glide toward the destination
    _later(function () {
      _chip('<div class="m3d-t1">' + f.dCity + '</div>'
        + (f.destWx ? '<div class="m3d-t2">' + f.destWx + '</div>' : '')
        + (f.etaStr ? '<div class="m3d-t3">Arrival ' + f.etaStr + '</div>' : ''));
      _map.easeTo({ center: f.d, zoom: 8.8, pitch: 55, bearing: (brg + 180) % 360, duration: Math.round(seg * 0.8) });
    }, seg * 3);
  }

  function _tick() {
    if (_map && _map.getSource && _map.getSource('flown')) {
      var t;
      if (_animating) { t = (Date.now() - _animStart) / _animDur; if (t > 1) t = 1; }
      else t = _flight.progress || 0;
      // If we have REAL progress, blend: the animation sweeps up to the real
      // fraction and holds there (never overshoots a flight that is mid-air).
      if (_flight.progress > 0 && _flight.progress < 1 && _animating) t = Math.min(t, _flight.progress);
      var sp = splitAt(_line, t);
      try {
        _map.getSource('flown').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: sp.flown } });
        _map.getSource('remain').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: sp.remain } });
        _map.getSource('plane').setData({ type: 'Feature', properties: { bearing: sp.brg }, geometry: { type: 'Point', coordinates: sp.pos } });
      } catch (e) {}
      _planeState.pos = sp.pos; _planeState.yaw = sp.brg * TO_R;
      var el = 0; try { el = _map.queryTerrainElevation({ lng: sp.pos[0], lat: sp.pos[1] }, { exaggerated: true }) || 0; } catch (e) {}
      _planeState.alt = el + 2600;
    }
    _raf = requestAnimationFrame(_tick);
  }

  function _setupRoute() {
    var f = _flight;
    _line = greatCircle(f.o, f.d, 160);
    _map.addSource('remain', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: _line } } });
    _map.addSource('flown', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [f.o] } } });
    _map.addLayer({ id: 'remain', type: 'line', source: 'remain', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-opacity': 0.55, 'line-width': 3, 'line-dasharray': [2, 1.6] } });
    _map.addLayer({ id: 'flown-glow', type: 'line', source: 'flown', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': f.col, 'line-width': 11, 'line-opacity': 0.3, 'line-blur': 6 } });
    _map.addLayer({ id: 'flown', type: 'line', source: 'flown', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': f.col, 'line-width': 5 } });
    _map.addSource('plane', { type: 'geojson', data: { type: 'Feature', properties: { bearing: 0 }, geometry: { type: 'Point', coordinates: f.o } } });
    try { _map.addImage('m3dplane', _flatIcon(), { pixelRatio: 2 }); } catch (e) {}
    _map.addLayer({ id: 'plane', type: 'symbol', source: 'plane', layout: { 'icon-image': 'm3dplane', 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 8, 0.8, 11, 1.3] } });
    if (typeof THREE !== 'undefined') { try { _map.addLayer(_buildCustomLayer()); } catch (e) {} }
    // origin / destination markers
    [[f.o, f.oc, f.oCity, false], [f.d, f.dc, f.dCity, true]].forEach(function (m) {
      var el = document.createElement('div');
      var lab = document.createElement('div'); lab.className = 'm3d-endlab'; lab.textContent = m[1] + ' · ' + m[2];
      var dot = document.createElement('div'); dot.className = 'm3d-enddot' + (m[3] ? ' dest' : '');
      el.appendChild(lab); el.appendChild(dot);
      _markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(m[0]).addTo(_map));
    });
  }

  var CSS = '.m3d-wrap{position:absolute;inset:0;background:#05080f;overflow:hidden;}'
    // !important + explicit size: maplibre adds .maplibregl-map{position:relative}
    // to this SAME element and its stylesheet loads after ours — without these
    // the container collapsed to 0 height and the canvas fell back to 300px.
    + '.m3d-map{position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;}'
    + '.m3d-chip{position:absolute;left:22px;bottom:22px;z-index:5;color:#fff;background:rgba(8,14,30,.62);backdrop-filter:blur(8px);'
    + 'padding:14px 20px;border:1px solid rgba(120,160,250,.3);border-radius:12px;transition:opacity .35s ease;max-width:70%;}'
    + '.m3d-t1{font-size:clamp(22px,2vw,34px);font-weight:800;line-height:1.1;}'
    + '.m3d-t2{font-size:clamp(15px,1.3vw,22px);font-weight:600;color:#cfe0ff;margin-top:4px;}'
    + '.m3d-t3{font-size:clamp(13px,1.1vw,18px);font-weight:800;margin-top:4px;letter-spacing:.03em;}'
    + '.m3d-endlab{color:#fff;font-size:12px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:nowrap;'
    + 'background:rgba(8,14,30,.6);padding:2px 7px;border-radius:6px;border:1px solid rgba(255,255,255,.18);transform:translateY(-22px);}'
    + '.m3d-enddot{width:14px;height:14px;border-radius:50%;background:#60a5fa;box-shadow:0 0 0 4px rgba(96,165,250,.35),0 0 14px rgba(96,165,250,.9);}'
    + '.m3d-enddot.dest{background:#f87171;box-shadow:0 0 0 4px rgba(248,113,113,.35),0 0 14px rgba(248,113,113,.9);}'
    + '.m3d-map .maplibregl-ctrl-attrib{display:none !important;}';

  function _injectCss() {
    if (document.getElementById('m3d-css')) return;
    var s = document.createElement('style'); s.id = 'm3d-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var API = {
    available: function () {
      // Engine load failed once (e.g. /mapcdn unreachable) → stop offering
      // the slide; the ad deck simply rebuilds without it.
      return _webglOk() && !_libsFailed;
    },
    mounted: function () { return _mounted; },
    mount: function (container, flight, dwellMs) {
      if (!container || !flight || !flight.o || !flight.d) return false;
      if (_mounted && _container && _container.isConnected && _flight && _flight.fl === flight.fl) return true; // already showing this flight
      API.destroy();
      _injectCss();
      _flight = flight;
      container.innerHTML = '<div class="m3d-wrap"><div class="m3d-map"></div><div class="m3d-chip"></div></div>';
      _container = container;
      _mounted = true;
      _loadLibs().then(function () {
        if (!_mounted || !_container || !_container.isConnected) return;
        var mapEl = _container.querySelector('.m3d-map');
        if (!mapEl) return;
        _map = new maplibregl.Map({
          container: mapEl, maxZoom: 13, attributionControl: false, interactive: false,
          style: { version: 8, sources: {
              sat: { type: 'raster', tiles: ['/tiles/satellite/{z}/{x}/{y}.png'], tileSize: 256, attribution: '' },
              labels: { type: 'raster', tiles: ['/tiles/labels/{z}/{x}/{y}.png'], tileSize: 256, attribution: '' },
              dem: { type: 'raster-dem', tiles: ['/demtiles/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 13 }
            }, layers: [
              { id: 'bg', type: 'background', paint: { 'background-color': '#05080f' } },
              { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 300 } },
              { id: 'hills', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.55, 'hillshade-shadow-color': '#0b1426', 'hillshade-highlight-color': '#ffffff' } },
              { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-fade-duration': 200 } }
            ] },
          center: flight.o, zoom: 6, pitch: 0, bearing: 0
        });
        // The carousel can still be mid-layout when MapLibre measures the
        // container (seen live: 300px-tall canvas in an 891px wrapper → the
        // slide reads as a black screen). Re-measure after layout settles and
        // keep a ResizeObserver on the wrapper for any later reflow.
        var _kick = function () { try { if (_map) _map.resize(); } catch (e) {} };
        _timers.push(setTimeout(_kick, 400));
        _timers.push(setTimeout(_kick, 1500));
        try {
          if (typeof ResizeObserver === 'function') {
            var ro = new ResizeObserver(_kick);
            ro.observe(_container.querySelector('.m3d-wrap'));
            _timers.push({ __ro: ro });   // destroyed alongside timers
          }
        } catch (e) {}
        _map.on('load', function () {
          if (!_mounted) return;
          _kick();
          try { _map.setTerrain({ source: 'dem', exaggeration: 1.6 }); } catch (e) {}
          try { _map.setSky({ 'sky-color': '#0a1736', 'sky-horizon-blend': 0.55, 'horizon-color': '#1a3b6e', 'horizon-fog-blend': 0.5, 'fog-color': '#070b14', 'fog-ground-blend': 0.55 }); } catch (e) {}
          _setupRoute();
          _raf = requestAnimationFrame(_tick);
          _sequence(dwellMs || 60000);
        });
      }).catch(function () { _libsFailed = true; /* slide shows dark bg once; deck drops it afterwards */ });
      return true;
    },
    destroy: function () {
      _clearTimers();
      if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
      _markers.forEach(function (m) { try { m.remove(); } catch (e) {} });
      _markers = [];
      if (_map) { try { _map.remove(); } catch (e) {} _map = null; }
      _planeGroup = null; _planeModel = null; _planeState.show = false;
      _animating = false;
      if (_container) { try { _container.innerHTML = ''; } catch (e) {} }
      _container = null; _flight = null; _mounted = false;
    }
  };

  window.GateMap3D = API;
})();
