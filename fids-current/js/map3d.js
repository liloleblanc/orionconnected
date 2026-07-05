/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GATE 3D FLIGHT MAP (v5) — window.GateMap3D
   Replaces the gate's EXISTING center map (same block, same options) with
   a 3D view of the INCOMING flight (Nick):
     • one-minute camera cycle through FOUR distinct 3D angles
       (overview → chase → orbit → arrival), gentle eases, looping
     • the 3D A320 model from the prototype at the flight's REAL position
       (live telemetry when available), refreshed every 10s — no sweep
     • terrain + hillshade for the 3D feel; satellite base, route lines
   Fallback ladder: GLB model → procedural 3D plane → flat icon. If WebGL
   or the libs fail, available() goes false and the classic 2D map stays.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  var MAPLIBRE_CSS = '/mapcdn/maplibre-gl.css';
  var MAPLIBRE_JS  = '/mapcdn/maplibre-gl.js';
  var THREE_JS     = '/mapcdn/three.min.js';
  var MODEL_URL    = '/models/a320neo.glb';

  // Proto-calibrated model constants
  var HEADING_OFFSET = Math.PI / 2;
  var HEADING_SIGN   = -1;
  var TARGET_METERS  = 9000;
  var MODEL_FACING   = Math.PI / 2;
  var PLANE_ALT_M    = 3000;

  var _libsFailed = false, _libsReady = false, _loading = null;
  var _map = null, _container = null, _timers = [], _mounted = false;
  var _flight = null, _markers = [], _refreshFn = null, _onEnd = null;
  var _planeState = { pos: [0, 0], alt: PLANE_ALT_M, yaw: 0, show: false };
  var _line = [];

  function _t(fn, ms) { var id = setTimeout(fn, ms); _timers.push(id); return id; }
  function _iv(fn, ms) { var id = setInterval(fn, ms); _timers.push({ __iv: id }); return id; }
  function _clearTimers() {
    _timers.forEach(function (t) {
      if (t && t.__iv) clearInterval(t.__iv);
      else if (t && t.__ro) { try { t.__ro.disconnect(); } catch (e) {} }
      else clearTimeout(t);
    });
    _timers = [];
  }

  function _webgl() {
    try { var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function _loadLibs() {
    if (_libsReady) return Promise.resolve();
    if (_loading) return _loading;
    _loading = new Promise(function (resolve, reject) {
      var pending = 0, failed = false;
      function done() { if (--pending === 0 && !failed) { _libsReady = true; resolve(); } }
      function fail() { if (!failed) { failed = true; _libsFailed = true; reject(new Error('libs')); } }
      if (!document.querySelector('link[href*="maplibre-gl.css"]')) {
        var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = MAPLIBRE_CSS;
        document.head.appendChild(l);
      }
      [MAPLIBRE_JS, THREE_JS].forEach(function (src) {
        var have = (src === MAPLIBRE_JS && window.maplibregl) || (src === THREE_JS && window.THREE);
        if (have) return;
        pending++;
        var s = document.createElement('script'); s.src = src;
        s.onload = done; s.onerror = fail;
        document.head.appendChild(s);
      });
      if (pending === 0) { _libsReady = true; resolve(); }
    });
    return _loading;
  }

  // ── geometry helpers ────────────────────────────────────────────────────
  function _gc(a, b, n) {
    var toR = Math.PI / 180, toD = 180 / Math.PI;
    var la1 = a[1] * toR, lo1 = a[0] * toR, la2 = b[1] * toR, lo2 = b[0] * toR;
    var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((la1 - la2) / 2), 2)
          + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((lo1 - lo2) / 2), 2)));
    if (!d || isNaN(d)) return [a, b];
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      var A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      var x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
      var y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
      var z = A * Math.sin(la1) + B * Math.sin(la2);
      pts.push([Math.atan2(y, x) * toD, Math.atan2(z, Math.sqrt(x * x + y * y)) * toD]);
    }
    return pts;
  }
  function _bearing(a, b) {
    var toR = Math.PI / 180;
    var y = Math.sin((b[0] - a[0]) * toR) * Math.cos(b[1] * toR);
    var x = Math.cos(a[1] * toR) * Math.sin(b[1] * toR)
          - Math.sin(a[1] * toR) * Math.cos(b[1] * toR) * Math.cos((b[0] - a[0]) * toR);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function _splitAt(line, prog) {
    var idx = Math.max(1, Math.min(line.length - 1, Math.round(prog * (line.length - 1))));
    var brg = _bearing(line[Math.max(0, idx - 1)], line[Math.min(line.length - 1, idx + 1)]);
    return { flown: line.slice(0, idx + 1), remain: line.slice(idx), pos: line[idx], brg: brg };
  }

  // ── CSS ─────────────────────────────────────────────────────────────────
  function _injectCss() {
    if (document.getElementById('m3dCss')) return;
    var st = document.createElement('style');
    st.id = 'm3dCss';
    st.textContent = ''
      + '.m3d-wrap{position:relative;width:100%;height:100%;overflow:hidden;background:#05080f;}'
      + '.m3d-map{position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;}'
      + '.m3d-map .maplibregl-canvas{outline:none;}'
      + '.m3d-chip{position:absolute;left:18px;bottom:18px;z-index:5;background:rgba(5,10,20,0.82);'
      +   'backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.14);border-radius:12px;'
      +   'padding:12px 18px;color:#fff;max-width:64%;box-shadow:0 8px 22px rgba(0,0,0,0.45);}'
      + '.m3d-chip-title{font-size:clamp(16px,1.6vw,26px);font-weight:800;letter-spacing:.2px;line-height:1.1;}'
      + '.m3d-chip-sub{font-size:clamp(12px,1.1vw,17px);font-weight:600;color:rgba(255,255,255,0.82);margin-top:4px;line-height:1.25;}'
      + '.m3d-endlab{background:rgba(5,10,20,0.85);color:#fff;font-size:12px;font-weight:800;letter-spacing:.6px;'
      +   'padding:3px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.18);white-space:nowrap;transform:translateY(-16px);}'
      + '.m3d-enddot{width:10px;height:10px;border-radius:50%;background:#8fb7e8;border:2px solid #fff;margin:0 auto;}'
      + '.m3d-enddot.dest{background:#ff5a5a;}';
    document.head.appendChild(st);
  }

  // ── 3D plane (three.js custom layer, from the proto) ────────────────────
  function _buildProcedural(T, accentHex) {
    var body = new T.Group();
    var white = new T.MeshStandardMaterial({ color: 0xeef2f8, metalness: 0.45, roughness: 0.45 });
    var accent = new T.MeshStandardMaterial({ color: new T.Color(accentHex || '#D82F2E'), metalness: 0.35, roughness: 0.5 });
    var dark = new T.MeshStandardMaterial({ color: 0x222a36, metalness: 0.4, roughness: 0.6 });
    var fus = new T.Mesh(new T.CylinderGeometry(700, 700, 7000, 18), white); fus.rotation.z = Math.PI / 2; body.add(fus);
    var nose = new T.Mesh(new T.ConeGeometry(700, 1700, 18), white); nose.rotation.z = -Math.PI / 2; nose.position.x = 4350; body.add(nose);
    var tail = new T.Mesh(new T.ConeGeometry(620, 1500, 18), white); tail.rotation.z = Math.PI / 2; tail.position.x = -4000; body.add(tail);
    var wing = new T.Mesh(new T.BoxGeometry(1900, 180, 12500), accent); wing.position.x = -200; body.add(wing);
    var tp = new T.Mesh(new T.BoxGeometry(1200, 150, 4800), accent); tp.position.x = -3500; body.add(tp);
    var fin = new T.Mesh(new T.BoxGeometry(1400, 2100, 160), accent); fin.position.set(-3500, 950, 0); body.add(fin);
    var win = new T.Mesh(new T.BoxGeometry(5200, 260, 260), dark); win.position.set(300, 360, 0); body.add(win);
    return { group: body, accent: accent };
  }

  function _makePlaneLayer(accentHex) {
    var T = window.THREE;
    if (!T) return null;
    var bits = { scene: null, camera: null, renderer: null, group: null };
    return {
      id: 'm3d-plane3d', type: 'custom', renderingMode: '3d',
      onAdd: function (m, gl) {
        bits.camera = new T.Camera();
        bits.scene = new T.Scene();
        bits.scene.add(new T.AmbientLight(0xffffff, 0.9));
        var d1 = new T.DirectionalLight(0xffffff, 0.95); d1.position.set(0.4, 0.8, 0.6); bits.scene.add(d1);
        var d2 = new T.DirectionalLight(0x88aaff, 0.35); d2.position.set(-0.5, 0.2, -0.4); bits.scene.add(d2);
        var pivot = new T.Group();
        var proc = _buildProcedural(T, accentHex);
        pivot.add(proc.group);
        bits.group = pivot;
        bits.scene.add(pivot);
        // The real A320 (Nick's "320") replaces the procedural body on load.
        try {
          if (typeof T.GLTFLoader === 'function') {
            new T.GLTFLoader().load(MODEL_URL, function (gltf) {
              try {
                var model = gltf.scene;
                var box = new T.Box3().setFromObject(model), size = new T.Vector3(); box.getSize(size);
                var maxDim = Math.max(size.x, size.y, size.z) || 1, sc = TARGET_METERS / maxDim;
                model.scale.setScalar(sc);
                var c = new T.Vector3(); box.getCenter(c);
                model.position.set(-c.x * sc, -c.y * sc, -c.z * sc);
                model.rotation.set(0, MODEL_FACING, 0);
                pivot.remove(proc.group);
                pivot.add(model);
              } catch (e) {}
            }, undefined, function () { /* keep procedural on failure */ });
          }
        } catch (e) {}
        bits.renderer = new T.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
        bits.renderer.autoClear = false;
      },
      render: function (gl, args) {
        if (!_planeState.show || !bits.group || !_map) return;
        try {
          bits.group.rotation.set(0, HEADING_SIGN * _planeState.yaw + HEADING_OFFSET, 0);
          var merc = maplibregl.MercatorCoordinate.fromLngLat({ lng: _planeState.pos[0], lat: _planeState.pos[1] }, _planeState.alt);
          var s = merc.meterInMercatorCoordinateUnits();
          var matArr = (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix) ? args.defaultProjectionData.mainMatrix : args;
          var m4 = new T.Matrix4().fromArray(matArr);
          var l = new T.Matrix4().makeTranslation(merc.x, merc.y, merc.z)
            .scale(new T.Vector3(s, -s, s))
            .multiply(new T.Matrix4().makeRotationX(Math.PI / 2));
          bits.camera.projectionMatrix = m4.multiply(l);
          bits.renderer.resetState();
          bits.renderer.render(bits.scene, bits.camera);
          _map.triggerRepaint();
        } catch (e) {}
      }
    };
  }

  // ── route + markers ─────────────────────────────────────────────────────
  function _drawRoute(f) {
    var sp = _splitAt(_line, f.progress);
    _map.addSource('m3d-remain', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: sp.remain } } });
    _map.addSource('m3d-flown', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: sp.flown } } });
    _map.addLayer({ id: 'm3d-remain', type: 'line', source: 'm3d-remain', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-opacity': 0.55, 'line-width': 3, 'line-dasharray': [2, 1.6] } });
    _map.addLayer({ id: 'm3d-flown-glow', type: 'line', source: 'm3d-flown', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': f.col, 'line-width': 11, 'line-opacity': 0.3, 'line-blur': 6 } });
    _map.addLayer({ id: 'm3d-flown', type: 'line', source: 'm3d-flown', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': f.col, 'line-width': 5 } });
    [[f.o, f.oc, f.oCity, false], [f.d, f.dc, f.dCity, true]].forEach(function (m) {
      var el = document.createElement('div');
      var lab = document.createElement('div'); lab.className = 'm3d-endlab'; lab.textContent = m[1] + ' · ' + m[2];
      var dot = document.createElement('div'); dot.className = 'm3d-enddot' + (m[3] ? ' dest' : '');
      el.appendChild(lab); el.appendChild(dot);
      _markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(m[0]).addTo(_map));
    });
    _planeState.pos = sp.pos; _planeState.yaw = sp.brg * Math.PI / 180; _planeState.show = true;
  }

  function _updatePlane(f) {
    var sp = _splitAt(_line, f.progress);
    try {
      _map.getSource('m3d-flown').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: sp.flown } });
      _map.getSource('m3d-remain').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: sp.remain } });
    } catch (e) {}
    _planeState.pos = sp.pos; _planeState.yaw = sp.brg * Math.PI / 180;
    try {
      var src = _map.getSource('m3d-plane');
      if (src) src.setData({ type: 'Feature', properties: { bearing: sp.brg }, geometry: { type: 'Point', coordinates: sp.pos } });
    } catch (e) {}
    try { _map.triggerRepaint(); } catch (e) {}
  }

  // ── chip ────────────────────────────────────────────────────────────────
  function _chip(title, sub) {
    if (!_container) return;
    var wrap = _container.querySelector('.m3d-wrap');
    if (!wrap) return;
    var c = wrap.querySelector('.m3d-chip');
    if (!c) {
      c = document.createElement('div'); c.className = 'm3d-chip';
      c.innerHTML = '<div class="m3d-chip-title"></div><div class="m3d-chip-sub"></div>';
      wrap.appendChild(c);
    }
    c.querySelector('.m3d-chip-title').textContent = title;
    c.querySelector('.m3d-chip-sub').textContent = sub;
  }
  function TLm(k) {
    var L = { arrives: { en: 'arrives in', fr: 'arrive dans' }, ofRoute: { en: 'of route flown', fr: 'du trajet parcouru' } };
    var lg = (typeof lang !== 'undefined' && lang === 'fr') ? 'fr' : 'en';
    return (L[k] || {})[lg] || (L[k] || {}).en || '';
  }

  // ── the one-minute, four-angle loop ────────────────────────────────────
  function _cameraLoop(cycleMs) {
    var seg = Math.max(9000, Math.round((cycleMs || 60000) / 4));
    var ease = function (t) { return t * (2 - t); };
    function segOverview(f) {
      var b = [[Math.min(f.o[0], f.d[0]), Math.min(f.o[1], f.d[1])], [Math.max(f.o[0], f.d[0]), Math.max(f.o[1], f.d[1])]];
      var cam = null;
      try { cam = _map.cameraForBounds(b, { padding: { top: 100, bottom: 120, left: 100, right: 100 }, maxZoom: 8.5 }); } catch (e) {}
      _map.easeTo({ center: cam ? cam.center : f.o, zoom: cam ? Math.min(cam.zoom, 8.5) : 5.5, pitch: 28, bearing: 0, duration: 3600, easing: ease });
      _chip(f.airline + ' ' + f.fl, f.oCity + ' → ' + f.dCity + (f.etaStr ? ' · ' + TLm('arrives') + ' ' + f.etaStr : ''));
    }
    function segChase(f) {
      var sp = _splitAt(_line, f.progress);
      _map.easeTo({ center: sp.pos, zoom: 8.8, pitch: 62, bearing: sp.brg, duration: 3800, easing: ease });
      _chip(f.airline + ' ' + f.fl, (f.speedKph ? f.speedKph + ' km/h · ' : '') + (f.altFt ? f.altFt.toLocaleString() + ' ft' : Math.round(f.progress * 100) + '%'));
    }
    function segOrbit(f) {
      var sp = _splitAt(_line, f.progress);
      _map.easeTo({ center: sp.pos, zoom: 8.2, pitch: 57, bearing: sp.brg + 105, duration: 3800, easing: ease });
      _t(function () { try { if (_map) _map.easeTo({ bearing: sp.brg + 165, duration: Math.max(1000, seg - 4200), easing: function (t) { return t; } }); } catch (e) {} }, 4000);
      _chip((f.acType || f.airline + ' ' + f.fl), Math.round(f.progress * 100) + '% ' + TLm('ofRoute'));
    }
    function segArrival(f) {
      var sp = _splitAt(_line, f.progress);
      _map.easeTo({ center: f.d, zoom: 8.6, pitch: 48, bearing: _bearing(sp.pos, f.d), duration: 3800, easing: ease });
      _chip(f.dCity, (f.destWx ? f.destWx : f.dc) + (f.etaStr ? ' · ' + TLm('arrives') + ' ' + f.etaStr : ''));
    }
    var order = [segOverview, segChase, segOrbit, segArrival], i = 0;
    function next() {
      if (!_mounted || !_map || !_flight) return;
      try { order[i % 4](_flight); } catch (e) {}
      i++;
      _t(next, seg);
    }
    next();
  }

  // ── public API ──────────────────────────────────────────────────────────
  var API = {
    available: function () { return !_libsFailed && _webgl(); },
    mounted: function () { return _mounted; },
    mount: function (container, flight, opts) {
      opts = (typeof opts === 'number') ? { cycleMs: opts } : (opts || {});
      if (_mounted && _container === container && _flight && flight && _flight.fl === flight.fl) return true;
      API.destroy();
      if (!container || !flight) return false;
      _container = container; _flight = flight; _mounted = true;
      _refreshFn = opts.refresh || null; _onEnd = opts.onEnd || null;
      _injectCss();
      container.innerHTML = '<div class="m3d-wrap"><div class="m3d-map"></div></div>';
      _loadLibs().then(function () {
        if (!_mounted || !_container || !_container.isConnected) return;
        var el = _container.querySelector('.m3d-map');
        if (!el) return;
        _line = _gc(flight.o, flight.d, 160);
        var sp = _splitAt(_line, flight.progress);
        _map = new maplibregl.Map({
          container: el, maxZoom: 13, attributionControl: false, interactive: false,
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
          center: sp.pos, zoom: 6, pitch: 0, bearing: 0
        });
        var kick = function () { try { if (_map) _map.resize(); } catch (e) {} };
        _t(kick, 400); _t(kick, 1500);
        try { var ro = new ResizeObserver(kick); ro.observe(el); _timers.push({ __ro: ro }); } catch (e) {}
        _map.on('error', function () { /* tile hiccups must not kill the block */ });
        _map.on('load', function () {
          if (!_mounted) return;
          try { _map.setTerrain({ source: 'dem', exaggeration: 1.35 }); } catch (e) {}
          _drawRoute(flight);
          var layer = null;
          try { layer = _makePlaneLayer(flight.col); if (layer) _map.addLayer(layer); } catch (e) { layer = null; }
          if (!layer) {
            // last-resort flat icon so there is ALWAYS exactly one plane
            try {
              var c = document.createElement('canvas'); c.width = 64; c.height = 64;
              var g = c.getContext('2d'); g.translate(32, 32); g.fillStyle = '#fff';
              g.beginPath(); g.moveTo(0, -22); g.lineTo(6, -4); g.lineTo(24, 6); g.lineTo(24, 12); g.lineTo(4, 8);
              g.lineTo(4, 16); g.lineTo(10, 22); g.lineTo(10, 26); g.lineTo(0, 23); g.lineTo(-10, 26); g.lineTo(-10, 22);
              g.lineTo(-4, 16); g.lineTo(-4, 8); g.lineTo(-24, 12); g.lineTo(-24, 6); g.lineTo(-6, -4); g.closePath(); g.fill();
              _map.addImage('m3dplane', g.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
              _map.addSource('m3d-plane', { type: 'geojson', data: { type: 'Feature', properties: { bearing: sp.brg }, geometry: { type: 'Point', coordinates: sp.pos } } });
              _map.addLayer({ id: 'm3d-plane', type: 'symbol', source: 'm3d-plane', layout: { 'icon-image': 'm3dplane', 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-size': 0.85 } });
            } catch (e) {}
          }
          _cameraLoop(opts.cycleMs || 60000);
          // Real-position refresh — no sweep, ever. A fresh context (live
          // telemetry) every 10s; when the flight lands the host is told so
          // it can fall back to the classic 2D map.
          _iv(function () {
            if (!_mounted) return;
            var f2;
            try { f2 = _refreshFn ? _refreshFn() : undefined; } catch (e) { f2 = undefined; }
            if (f2 === null) { var cb = _onEnd; API.destroy(); if (cb) { try { cb(); } catch (e) {} } return; }
            if (f2) { _flight = f2; _updatePlane(f2); }
          }, 10000);
        });
      }).catch(function () { _libsFailed = true; API.destroy(); if (_onEnd) { try { _onEnd(); } catch (e) {} } });
      return true;
    },
    destroy: function () {
      _clearTimers();
      _markers.forEach(function (m) { try { m.remove(); } catch (e) {} });
      _markers = [];
      _planeState.show = false;
      if (_map) { try { _map.remove(); } catch (e) {} _map = null; }
      if (_container) { try { _container.innerHTML = ''; } catch (e) {} }
      _container = null; _flight = null; _mounted = false; _refreshFn = null; _onEnd = null;
    }
  };
  window.GateMap3D = API;
})();
