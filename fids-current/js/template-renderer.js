/* ───────────────────────────────────────────────────────────────────────────
 * TEMPLATE RENDERER — live-display side of the Template Designer.
 *
 * On page load: detect which display this page is (gids / fids / bids),
 * check if a Designer template is assigned to it, and if so:
 *   1. Hide the engine's #fidsBoard so its built-in layout doesn't show.
 *   2. Render the template's components on a full-screen canvas-equivalent.
 *
 * The engine itself keeps running (data fetches, etc.) so future
 * components (Flight List, Weather, etc.) will be able to read live data
 * from the same globals the engine populates. For Push 1 the only
 * components are Text and Clock, which need no live data.
 *
 * Storage:
 *   fids_template_assigned:<display>   tplId  (set by the Designer)
 *   fids_templates                     { tplId: template }
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function whichDisplay() {
    // <body data-page="gids"> | "bids" — fids.html doesn't set one, fall back to filename
    const dp = document.body && document.body.getAttribute('data-page');
    if (dp) return dp;
    const path = (location.pathname.split('/').pop() || '').toLowerCase();
    if (path.startsWith('gids')) return 'gids';
    if (path.startsWith('bids')) return 'bids';
    if (path.startsWith('fids')) return 'fids';
    return null;
  }

  function load() {
    const display = whichDisplay();
    if (!display) return;
    const id = localStorage.getItem('fids_template_assigned:' + display);
    if (!id) return;
    let all;
    try { all = JSON.parse(localStorage.getItem('fids_templates') || '{}') || {}; }
    catch (e) { return; }
    const tpl = all[id];
    if (!tpl || !Array.isArray(tpl.components) || tpl.components.length === 0) return;
    apply(tpl);
  }

  function apply(tpl) {
    // Hide the engine's board (it stays running for data, just invisible).
    const board = document.getElementById('fidsBoard');
    if (board) board.style.visibility = 'hidden';

    // Build a fullscreen template root scaled to fit viewport while preserving
    // the template's aspect ratio (so positions/sizes look the same as in the
    // Designer canvas).
    let root = document.getElementById('fidsTemplateRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'fidsTemplateRoot';
      Object.assign(root.style, {
        position: 'fixed', inset: '0', zIndex: '2000',
        background: '#0b0d12', overflow: 'hidden'
      });
      document.body.appendChild(root);
    }
    root.innerHTML = '';

    // Apply template-level background (color and/or image)
    const bg = tpl.background || {};
    root.style.backgroundColor = bg.color || '#0b0d12';
    if (bg.image) {
      root.style.backgroundImage = 'url(' + bg.image.replace(/"/g, '\\"') + ')';
      root.style.backgroundSize = (bg.fit === 'tile' ? 'auto' : (bg.fit === 'contain' ? 'contain' : 'cover'));
      root.style.backgroundPosition = 'center';
      root.style.backgroundRepeat = bg.fit === 'tile' ? 'repeat' : 'no-repeat';
    } else {
      root.style.backgroundImage = '';
    }

    const cw = (tpl.canvas && tpl.canvas.w) || 1920;
    const ch = (tpl.canvas && tpl.canvas.h) || 1080;
    const stage = document.createElement('div');
    Object.assign(stage.style, {
      position: 'absolute',
      width: cw + 'px', height: ch + 'px',
      left: '50%', top: '50%',
      transformOrigin: '0 0',
    });
    root.appendChild(stage);

    function fit() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const s = Math.min(vw / cw, vh / ch);
      stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
      stage.style.left = (vw / 2) + 'px';
      stage.style.top  = (vh / 2) + 'px';
      stage.style.transformOrigin = '0 0';
      // Centering through translate is awkward with scale; use margins instead.
      const w = cw * s, h = ch * s;
      stage.style.left = ((vw - w) / 2) + 'px';
      stage.style.top  = ((vh - h) / 2) + 'px';
      stage.style.transform = 'scale(' + s + ')';
    }
    fit();
    window.addEventListener('resize', fit);

    // Render each component
    tpl.components.forEach(c => renderOne(c, stage));
  }

  function renderOne(c, stage) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      left: c.x + 'px', top: c.y + 'px',
      width: c.w + 'px', height: c.h + 'px',
      display: 'flex', alignItems: 'center'
    });
    if (c.type === 'text') {
      const p = c.props || {};
      el.style.fontSize   = (p.fontSize || 36) + 'px';
      el.style.color      = p.color || '#fff';
      el.style.fontWeight = p.weight || 600;
      el.style.justifyContent = p.align === 'center' ? 'center' : (p.align === 'right' ? 'flex-end' : 'flex-start');
      el.style.textAlign      = p.align || 'left';
      el.style.fontFamily = _fontStack(p.fontFamily);
      const draw = () => { el.textContent = _resolve(p.text || '', _liveContext()); };
      draw();
      if (_hasPH(p.text)) setInterval(() => { if (document.body.contains(el)) draw(); }, 2000);
    } else if (c.type === 'clock') {
      const p = c.props || {};
      el.style.fontSize = (p.fontSize || 64) + 'px';
      el.style.color    = p.color || '#fff';
      el.style.fontWeight = 800;
      el.style.justifyContent = 'center';
      el.style.fontVariantNumeric = 'tabular-nums';
      el.style.fontFamily = _fontStack(p.fontFamily);
      const tick = () => {
        const d = new Date();
        const opts = { hour: '2-digit', minute: '2-digit', hour12: p.format !== '24h' };
        if (p.showSeconds === true || p.showSeconds === 'true') opts.second = '2-digit';
        el.textContent = d.toLocaleTimeString([], opts);
      };
      tick();
      setInterval(tick, 1000);
    } else if (c.type === 'image') {
      const p = c.props || {};
      el.style.justifyContent = 'center';
      el.style.borderRadius = (p.radius || 0) + 'px';
      el.style.opacity = (p.opacity == null ? 1 : p.opacity);
      if (p.src) {
        el.innerHTML = '<img src="' + _esc(p.src) + '" alt="" style="width:100%;height:100%;object-fit:' + (p.fit || 'contain') + ';border-radius:' + (p.radius || 0) + 'px;">';
      }
    } else if (c.type === 'flightList') {
      renderFlightListLive(el, c.props);
    } else if (c.type === 'ad') {
      renderAdLive(el, c.props);
    } else if (c.type === 'message') {
      const p = c.props || {};
      el.style.background = p.bg || '#065f46';
      el.style.borderLeft = '6px solid ' + (p.accent || '#10b981');
      el.style.borderRadius = '8px';
      el.style.padding = '18px 24px';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'flex-start';
      el.style.gap = '18px';
      el.style.fontFamily = _fontStack(p.fontFamily);
      const drawMsg = () => {
        const ctx = _liveContext();
        const title = _resolve(p.title || '', ctx);
        const body  = _resolve(p.body  || '', ctx);
        el.innerHTML =
          (p.icon ? '<div style="font-size:' + ((p.titleSize || 42) * 1.2) + 'px;flex-shrink:0;">' + _esc(p.icon) + '</div>' : '') +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:800;font-size:' + (p.titleSize || 42) + 'px;color:' + _esc(p.titleColor || '#fff') + ';line-height:1.1;">' + _esc(title) + '</div>' +
            (body ? '<div style="font-size:' + (p.bodySize || 24) + 'px;color:' + _esc(p.bodyColor || '#d1fae5') + ';margin-top:6px;line-height:1.3;">' + _esc(body) + '</div>' : '') +
          '</div>';
      };
      drawMsg();
      if (_hasPH(p.title) || _hasPH(p.body)) setInterval(() => { if (document.body.contains(el)) drawMsg(); }, 2000);
    } else if (c.type === 'map') {
      _renderFlightMap(el, c.props || {});
    } else {
      // Unknown component type — show a placeholder so it's visible the
      // template references a component this build doesn't ship yet.
      el.textContent = '[' + c.type + ']';
      el.style.color = '#9ca3af';
      el.style.background = 'rgba(255,255,255,0.04)';
      el.style.border = '1px dashed #374151';
      el.style.justifyContent = 'center';
    }
    stage.appendChild(el);
  }
  function _esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function renderFlightListLive(el, props) {
    const p = props || {};
    el.style.background = p.bg || 'rgba(15,23,42,0.6)';
    el.style.borderRadius = '8px';
    el.style.padding = '14px 18px';
    el.style.overflow = 'hidden';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'stretch';
    el.style.justifyContent = 'flex-start';
    el.style.fontFamily = "'Inter', system-ui, sans-serif";
    const draw = () => el.innerHTML = _buildFlightListHTML(p, _liveFlights(p.source));
    draw();
    // Refresh every 8s so new live data reflects without a full reload.
    clearInterval(el._tick);
    el._tick = setInterval(() => {
      if (!document.body.contains(el)) { clearInterval(el._tick); return; }
      draw();
    }, 8000);
  }
  function _liveFlights(source) {
    try {
      const list = source === 'arr' ? window.flightsArr : window.flightsDep;
      if (Array.isArray(list) && list.length) {
        return list.map(f => ({
          flight:      f.flight || f.number || '',
          airline:     f.airline || (f.flight || '').slice(0, 2),
          destination: f.destination || f.dest || f.city || f.origin || '',
          time:        f.time || f.sched || f.scheduled || '',
          status:      f.status || f.state || '',
          gate:        f.gate || f.terminal || ''
        }));
      }
    } catch (e) {}
    return [
      { flight:'AC8421', airline:'AC', destination:'Toronto',  time:'14:30', status:'Boarding', gate:'A3' },
      { flight:'WS3120', airline:'WS', destination:'Calgary',  time:'15:05', status:'On time',  gate:'B1' },
      { flight:'AC8662', airline:'AC', destination:'Montréal', time:'16:15', status:'Delayed',  gate:'A4' }
    ];
  }
  function _fontStack(name) {
    if (!name || name === 'system') return "system-ui, -apple-system, 'Segoe UI', sans-serif";
    return "'" + name + "', 'Inter', system-ui, sans-serif";
  }

  /* ── Dynamic-text resolution (live side) ─────────────────────────────────
   * Builds a context object once per refresh tick (~2s) from engine
   * globals (window.flightsDep / window.flightsArr / FIDS_AIRPORT), the
   * display's assigned gate, and clock state. Resolves {placeholder}
   * tokens in any string.
   */
  function _liveContext() {
    const d = new Date();
    const display = whichDisplay() || '';
    let gate = '';
    try { gate = localStorage.getItem('fids_display_gate:' + display) || ''; } catch (e) {}
    let flight = {};
    try {
      const list = Array.isArray(window.flightsDep) ? window.flightsDep : [];
      let f = null;
      if (gate) f = list.find(x => String(x && (x.gate || x.terminal) || '').toUpperCase() === gate.toUpperCase());
      if (!f) f = list[0];
      if (f) {
        // Format helpers for the live fields surfaced in Push A
        const num = (v, suffix) => (v != null && v !== '' && !isNaN(v)) ? (Math.round(v) + (suffix || '')) : '';
        const dur = (mins) => {
          const m = parseInt(mins, 10);
          if (!m || m <= 0) return '';
          return (m >= 60 ? Math.floor(m / 60) + 'h ' : '') + (m % 60) + 'm';
        };
        flight = {
          flight: f.flight || f.number || '',
          destination: f.destination || f.dest || f.city || f.origin || '',
          time: f.time || f.sched || f.scheduled || '',
          status: f.status || f.state || '',
          gate: f.gate || '',
          terminal: f.terminal || '',
          airline: f.airline || (f.flight || '').slice(0, 2),
          airlineName: f._airlineName || f._opName || '',
          aircraft: f._aircraft || f._aircraftCode || '',
          registration: f._reg || '',
          altitude: num(f._liveAlt, ' ft'),
          speed: num(f._liveSpd, ' km/h'),
          callsign: f._callSign || '',
          actualTime: f._actualDepTime || f._actualArrTime || '',
          belt: f._belt || '',
          checkIn: f._checkIn || '',
          duration: dur(f._durationMins),
          // raw numbers kept for the Flight Map info panel's distance maths
          _lat: f._liveLat, _lng: f._liveLng,
          _altRaw: f._liveAlt, _spdRaw: f._liveSpd
        };
      }
    } catch (e) {}
    let apCode = '', apName = '';
    try {
      const sel = document.getElementById('apSel');
      apCode = ((sel && sel.value) || localStorage.getItem('fids_airport') || '').toUpperCase();
      if (window.FIDS_AIRPORT && typeof window.FIDS_AIRPORT === 'object') apName = window.FIDS_AIRPORT.name || '';
    } catch (e) {}
    return {
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: d.toLocaleDateString(),
      gate, flight, airport: { code: apCode, name: apName }
    };
  }
  function _resolve(str, ctx) {
    if (!str) return '';
    return String(str).replace(/\{([a-zA-Z0-9_.]+)\}/g, (_m, path) => {
      const parts = path.split('.');
      let v = ctx;
      for (const p of parts) { if (v == null) break; v = v[p]; }
      return v == null ? '' : String(v);
    });
  }
  function _hasPH(s) { return /\{[a-zA-Z0-9_.]+\}/.test(s || ''); }

  /* Flight Map route resolution. 'live' mode reads window._fidsGateRoute,
   * published by the engine's initGateMap() — origin, destination, and
   * real progress (0–1) of the flight at this display's gate. */
  function _flightMapRoute(p) {
    if ((p.source || 'live') === 'live') {
      try {
        const r = window._fidsGateRoute;
        if (r && r.org && r.dst) {
          return {
            org: String(r.org).toUpperCase().trim(),
            dst: String(r.dst).toUpperCase().trim(),
            prog: (typeof r.prog === 'number' && r.prog >= 0) ? Math.round(r.prog * 100) : 0,
            live: true
          };
        }
      } catch (e) {}
    }
    const ctx = _liveContext();
    return {
      org: String(_resolve(p.origin || '', ctx) || '').toUpperCase().trim(),
      dst: String(_resolve(p.destination || '', ctx) || '').toUpperCase().trim(),
      prog: parseFloat(p.progress) || 0,
      live: false
    };
  }

  /* Geographic Flight Map (live side) — Leaflet map with the route arc,
   * markers and aircraft. Leaflet + leaflet-arc are already loaded on the
   * live pages; airport-coords.js provides window.AIRPORT_COORDS. */
  /* Great-circle km — for the info panel's remaining-distance estimate. */
  function _haversineKm(la1, lo1, la2, lo2) {
    const R = 6371, toR = Math.PI / 180;
    const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  /* Flight Map info panel — the side panel from the JetBlue photo. */
  function _flightInfoHTML(flight, rt, p) {
    flight = flight || {};
    const accent = p.accent || '#3b82f6';
    const text = p.textColor || '#ffffff';
    let remaining = '';
    try {
      const C = window.AIRPORT_COORDS || {};
      const o = C[rt.org], d = C[rt.dst];
      if (o && d) {
        const total = _haversineKm(o[0], o[1], d[0], d[1]);
        remaining = Math.max(0, Math.round(total * (1 - (rt.prog || 0) / 100))) + ' km';
      }
    } catch (e) {}
    const rows = [
      ['To', flight.destination], ['Scheduled', flight.time], ['Actual', flight.actualTime],
      ['Ground speed', flight.speed], ['Altitude', flight.altitude], ['Remaining', remaining],
      ['Aircraft', flight.aircraft], ['Gate', flight.gate]
    ].filter(r => r[1]);
    return '<div style="height:100%;box-sizing:border-box;padding:20px 22px;background:rgba(0,0,0,0.28);' +
      'border-left:1px solid rgba(255,255,255,0.08);font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;">' +
      '<div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">' + _esc(flight.airlineName || flight.airline || 'Flight') + '</div>' +
      '<div style="font-size:34px;font-weight:900;color:' + _esc(accent) + ';line-height:1.1;margin:2px 0 14px;">' + _esc(flight.status || 'Scheduled') + '</div>' +
      rows.map(r =>
        '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.07);">' +
          '<span style="font-size:14px;color:rgba(255,255,255,0.55);">' + _esc(r[0]) + '</span>' +
          '<span style="font-size:16px;font-weight:700;color:' + _esc(text) + ';text-align:right;">' + _esc(r[1]) + '</span>' +
        '</div>'
      ).join('') +
      '</div>';
  }

  /* Renders one geographic Leaflet map into `container`, returns the map. */
  function _flightMapGeoLive(container, p, rt) {
    const note = (msg) => {
      container.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#9ca3af;font:14px/1.5 Inter,system-ui,sans-serif;padding:20px;">' + _esc(msg) + '</div>';
    };
    const coords = window.AIRPORT_COORDS || {};
    const o = coords[rt.org], d = coords[rt.dst];
    const accent = p.accent || '#3b82f6';
    if (typeof L === 'undefined' || typeof L.map !== 'function') { note('Map engine unavailable.'); return null; }
    if (!o || !d) { note('Flight Map needs valid airport codes (origin: "' + (rt.org||'—') + '", destination: "' + (rt.dst||'—') + '").'); return null; }
    container.innerHTML = '';
    const mapDiv = document.createElement('div');
    mapDiv.style.cssText = 'position:absolute;inset:0;background:#0f172a;';
    container.appendChild(mapDiv);
    let map;
    try {
      map = L.map(mapDiv, {
        zoomControl: false, attributionControl: false, dragging: false,
        scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
        keyboard: false, touchZoom: false, fadeAnimation: false, zoomAnimation: false
      });
    } catch (e) { note('Map could not start.'); return null; }
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxZoom: 18, crossOrigin: true }).addTo(map);
    let arc;
    try {
      arc = (L.Polyline && typeof L.Polyline.Arc === 'function')
        ? L.Polyline.Arc(o, d, { vertices: 80, color: accent, weight: 4, opacity: 0.95 })
        : L.polyline([o, d], { color: accent, weight: 4, opacity: 0.95 });
      arc.addTo(map);
    } catch (e) { arc = L.polyline([o, d], { color: accent, weight: 4 }).addTo(map); }
    L.circleMarker(o, { radius: 8, color: '#fff', weight: 2, fillColor: accent,    fillOpacity: 1 }).addTo(map);
    L.circleMarker(d, { radius: 8, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }).addTo(map);
    try {
      const prog = Math.max(0, Math.min(1, (rt.prog || 0) / 100));
      const lls = arc.getLatLngs ? arc.getLatLngs() : [L.latLng(o), L.latLng(d)];
      if (lls && lls.length) {
        const idx = Math.max(0, Math.min(lls.length - 1, Math.round(prog * (lls.length - 1))));
        const pt = lls[idx], nxt = lls[Math.min(lls.length - 1, idx + 1)];
        const bearing = Math.atan2(nxt.lng - pt.lng, nxt.lat - pt.lat) * 180 / Math.PI;
        const planeSvg = '<svg viewBox="0 0 24 24" width="30" height="30" style="transform:rotate(' + bearing.toFixed(0) + 'deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));"><path d="M12 2 L15 11 L22 14 L15 14 L13 22 L12 17 L11 22 L9 14 L2 14 L9 11 Z" fill="#fff" stroke="' + _esc(accent) + '" stroke-width="1.5"/></svg>';
        const icon = L.divIcon({ className: 'fm-plane-icon', html: planeSvg, iconSize: [30, 30], iconAnchor: [15, 15] });
        L.marker(pt, { icon: icon, interactive: false }).addTo(map);
      }
    } catch (e) {}
    const fit = () => { try { map.invalidateSize(false); map.fitBounds(L.latLngBounds([o, d]).pad(0.4), { animate: false }); } catch (e) {} };
    fit();
    setTimeout(fit, 160);
    return map;
  }

  /* Top-level Flight Map renderer (live side): split layout (map + optional
   * info panel), either style, with a refresh loop that only rebuilds when
   * the route / flight state actually changed. */
  function _renderFlightMap(el, p) {
    el.style.background = p.bg || '#0f172a';
    el.style.borderRadius = '10px';
    el.style.overflow = 'hidden';
    el.style.padding = '0';
    el.style.position = 'absolute';
    el.style.display = 'flex';
    el.style.alignItems = 'stretch';
    const showInfo = !(p.showInfo === false || p.showInfo === 'false');
    const build = () => {
      if (el._leafletMap) { try { el._leafletMap.remove(); } catch (e) {} el._leafletMap = null; }
      el.innerHTML = '';
      const rt = _flightMapRoute(p);
      const ctx = _liveContext();
      const mapWrap = document.createElement('div');
      mapWrap.style.cssText = 'position:relative;flex:1 1 auto;min-width:0;height:100%;overflow:hidden;';
      el.appendChild(mapWrap);
      if (showInfo) {
        const panel = document.createElement('div');
        panel.style.cssText = 'flex:0 0 38%;max-width:44%;height:100%;overflow:hidden;';
        panel.innerHTML = _flightInfoHTML(ctx.flight, rt, p);
        el.appendChild(panel);
      }
      if ((p.style || 'geo') === 'geo') {
        el._leafletMap = _flightMapGeoLive(mapWrap, p, rt);
      } else {
        mapWrap.innerHTML = _flightMapHTML({
          origin: rt.org, originLabel: _resolve(p.originLabel || '', ctx),
          dest: rt.dst, destLabel: _resolve(p.destinationLabel || '', ctx),
          fnum: _resolve(p.flightNumber || '', ctx),
          progress: rt.prog, accent: p.accent, textColor: p.textColor
        });
      }
    };
    build();
    // Refresh when the live route / flight state changes. A full rebuild is
    // heavy (Leaflet), so it only fires when the state key actually changes.
    const stateKey = () => {
      const rt = _flightMapRoute(p); const f = _liveContext().flight || {};
      return rt.org + '>' + rt.dst + '|' + Math.round(rt.prog / 4) + '|' +
             (f.status || '') + '|' + (f.speed || '') + '|' + (f.altitude || '');
    };
    let lastKey = stateKey();
    setInterval(() => {
      if (!document.body.contains(el)) return;
      const k = stateKey();
      if (k !== lastKey) { lastKey = k; build(); }
    }, 15000);
  }

  /* Flight route card — origin dot → curved arc → destination dot with the
   * aircraft drawn at `progress`. Identical math to the Designer side. */
  function _flightMapHTML(o) {
    const accent = o.accent || '#3b82f6';
    const text   = o.textColor || '#ffffff';
    const prog   = Math.max(0, Math.min(1, (parseFloat(o.progress) || 0) / 100));
    const x0 = 80, y0 = 215, x2 = 920, y2 = 215, xc = 500, yc = 60;
    const bez = t => { const m = 1 - t; return { x: m*m*x0 + 2*m*t*xc + t*t*x2, y: m*m*y0 + 2*m*t*yc + t*t*y2 }; };
    const pp  = bez(prog);
    const dx  = 2*(1-prog)*(xc-x0) + 2*prog*(x2-xc);
    const dy  = 2*(1-prog)*(yc-y0) + 2*prog*(y2-yc);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    let donePath = 'M ' + x0 + ' ' + y0;
    for (let i = 1; i <= 48; i++) { const p = bez(prog * i / 48); donePath += ' L ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }
    const fullPath = 'M ' + x0 + ' ' + y0 + ' Q ' + xc + ' ' + yc + ' ' + x2 + ' ' + y2;
    const svg =
      '<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%;">' +
        '<path d="' + fullPath + '" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="4" stroke-dasharray="11 9"/>' +
        '<path d="' + donePath + '" fill="none" stroke="' + _esc(accent) + '" stroke-width="6" stroke-linecap="round"/>' +
        '<circle cx="' + x0 + '" cy="' + y0 + '" r="15" fill="' + _esc(accent) + '"/>' +
        '<circle cx="' + x2 + '" cy="' + y2 + '" r="15" fill="#ef4444"/>' +
        '<g transform="translate(' + pp.x.toFixed(1) + ' ' + pp.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">' +
          '<circle r="26" fill="' + _esc(accent) + '" opacity="0.25"/>' +
          '<path d="M 30 0 L -16 -15 L -6 0 L -16 15 Z" fill="#ffffff" stroke="' + _esc(accent) + '" stroke-width="2"/>' +
        '</g>' +
      '</svg>';
    return svg +
      (o.fnum ? '<div style="position:absolute;top:16px;left:0;right:0;text-align:center;color:' + _esc(text) + ';font-weight:700;font-size:24px;letter-spacing:0.12em;font-family:Inter,system-ui,sans-serif;">' + _esc(o.fnum) + '</div>' : '') +
      '<div style="position:absolute;left:24px;bottom:22px;text-align:left;font-family:Inter,system-ui,sans-serif;">' +
        '<div style="font-size:58px;font-weight:900;color:' + _esc(text) + ';line-height:1;">' + _esc(o.origin || '—') + '</div>' +
        (o.originLabel ? '<div style="font-size:22px;color:rgba(255,255,255,0.6);margin-top:4px;">' + _esc(o.originLabel) + '</div>' : '') +
      '</div>' +
      '<div style="position:absolute;right:24px;bottom:22px;text-align:right;font-family:Inter,system-ui,sans-serif;">' +
        '<div style="font-size:58px;font-weight:900;color:' + _esc(text) + ';line-height:1;">' + _esc(o.dest || '—') + '</div>' +
        (o.destLabel ? '<div style="font-size:22px;color:rgba(255,255,255,0.6);margin-top:4px;">' + _esc(o.destLabel) + '</div>' : '') +
      '</div>';
  }
  function _airlineLogo(code) {
    if (!code) return '';
    let ap = '';
    try { ap = ((document.getElementById('apSel') || {}).value || localStorage.getItem('fids_airport') || '').toUpperCase(); } catch (e) {}
    if (ap) {
      try {
        const raw = localStorage.getItem('fids_airline_override_' + ap + '_' + String(code).toUpperCase());
        if (raw) { const o = JSON.parse(raw); if (o && o.url) return o.url; }
      } catch (e) {}
    }
    try { if (typeof carrierLogoUrl === 'function') return carrierLogoUrl(code); } catch (e) {}
    return 'https://img.wway.io/pics/root/' + String(code).toLowerCase() + '@svg';
  }
  function _buildFlightListHTML(p, rows) {
    const cols = p.cols || {};
    const order = ['logo','flight','airline','destination','time','status','gate'];
    const labels = { logo:'', flight:'Flight', airline:'Airline', destination:'Destination', time:'Time', status:'Status', gate:'Gate' };
    const active = order.filter(k => cols[k]);
    const max = Math.max(1, parseInt(p.maxRows, 10) || 8);
    const visible = rows.slice(0, max);
    const gap        = Math.max(0, parseInt(p.columnGap, 10) || 0);
    const rowPad     = Math.max(0, parseInt(p.rowPadding, 10) || 0);
    const headerPad  = Math.max(0, parseInt(p.headerPadding, 10) || 0);
    const wrapMode   = p.wrap === 'wrap' ? 'wrap' : 'truncate';
    const widths     = p.colWidths || {};
    const DEFAULTS   = { logo: 80, flight: 160, airline: 100, time: 120, gate: 100, destination: 0, status: 0 };
    const fontStack  = _fontStack(p.fontFamily);
    const statusColors = p.statusColors || {};
    const remarksMap   = p.remarksMap || {};
    const rowFontPx  = p.fontSize || 28;
    function mapRemark(s) {
      if (!s) return '';
      const up = String(s).toUpperCase().trim();
      for (const k in remarksMap) {
        if (k && remarksMap[k] && k.toUpperCase() === up) return remarksMap[k];
      }
      return s;
    }
    function colFlex(k) {
      let w = widths[k];
      if (w === undefined || w === null || w === '') w = DEFAULTS[k];
      const n = parseInt(w, 10);
      if (!n || n <= 0) return 'flex:1 1 0;min-width:0;';
      return 'flex:0 0 ' + n + 'px;min-width:0;';
    }
    const cellOverflow = wrapMode === 'wrap'
      ? 'word-break:break-word;overflow-wrap:anywhere;'
      : 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    function statusColor(status) {
      if (!status) return '';
      const s = String(status).toLowerCase();
      for (const k in statusColors) {
        if (statusColors[k] && s.includes(String(k).toLowerCase())) return statusColors[k];
      }
      return '';
    }
    let html = '<div style="font-family:' + fontStack + ';">';
    if (p.headerText) {
      html += '<div style="font-size:' + (p.headerSize || 32) + 'px;font-weight:800;color:' + _esc(p.headerColor || '#fff') + ';margin-bottom:10px;letter-spacing:0.02em;border-bottom:2px solid ' + _esc(p.accent || '#3b82f6') + ';padding-bottom:8px;' + cellOverflow + '">' + _esc(p.headerText) + '</div>';
    }
    if (active.length === 0) return html + '<div style="color:#9ca3af;font-size:14px;">No columns selected.</div></div>';
    html += '<div style="display:flex;gap:' + gap + 'px;font-size:' + Math.round(rowFontPx * 0.55) + 'px;font-weight:700;color:' + _esc(p.headerColor || '#fff') + ';opacity:0.7;letter-spacing:0.08em;text-transform:uppercase;padding:' + headerPad + 'px 4px;">';
    active.forEach(k => html += '<div style="' + colFlex(k) + cellOverflow + '">' + _esc(labels[k]) + '</div>');
    html += '</div>';
    visible.forEach((r, i) => {
      const zebra = p.zebra && i % 2 === 1 ? 'background:rgba(255,255,255,0.04);' : '';
      html += '<div style="display:flex;align-items:center;gap:' + gap + 'px;font-size:' + rowFontPx + 'px;color:' + _esc(p.rowColor || '#e5e7eb') + ';padding:' + rowPad + 'px 4px;border-bottom:1px solid rgba(255,255,255,0.06);' + zebra + '">';
      active.forEach(k => {
        if (k === 'logo') {
          const src = _airlineLogo(r.airline);
          const lh = Math.round(rowFontPx * 1.4);
          const inner = src
            ? '<img src="' + _esc(src) + '" alt="' + _esc(r.airline || '') + '" style="max-height:' + lh + 'px;max-width:100%;object-fit:contain;" onerror="this.style.display=\'none\'">'
            : '<span style="font-size:' + Math.round(rowFontPx * 0.55) + 'px;color:#9ca3af;">' + _esc(r.airline || '') + '</span>';
          html += '<div style="' + colFlex(k) + 'display:flex;align-items:center;justify-content:center;">' + inner + '</div>';
        } else if (k === 'status') {
          const friendly = mapRemark(r[k]);
          const col = statusColor(friendly);
          html += '<div style="' + colFlex(k) + cellOverflow + (col ? 'color:' + _esc(col) + ';font-weight:700;' : '') + '">' + _esc(friendly) + '</div>';
        } else {
          html += '<div style="' + colFlex(k) + cellOverflow + '">' + _esc(r[k] || '') + '</div>';
        }
      });
      html += '</div>';
    });
    return html + '</div>';
  }

  function renderAdLive(el, props) {
    const p = props || {};
    el.style.borderRadius = '8px';
    el.style.overflow = 'hidden';
    el.style.justifyContent = 'center';
    el.style.fontFamily = "'Inter', system-ui, sans-serif";
    const items = Array.isArray(p.items) && p.items.length ? p.items : [{ type:'text', text:'(no items)', bg:'#374151', color:'#fff' }];
    let i = 0;
    const show = () => {
      const item = items[i % items.length];
      el.style.background = item.bg || '#0b3d91';
      if (item.type === 'image' && item.src) {
        el.innerHTML = '<img src="' + _esc(item.src) + '" style="width:100%;height:100%;object-fit:cover;">';
      } else {
        el.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;color:' + _esc(item.color || '#fff') + ';font-weight:' + (p.weight || 700) + ';font-size:' + (p.fontSize || 36) + 'px;line-height:1.2;">' + _esc(item.text || '') + '</div>';
      }
      i++;
    };
    show();
    clearInterval(el._tick);
    el._tick = setInterval(() => {
      if (!document.body.contains(el)) { clearInterval(el._tick); return; }
      show();
    }, Math.max(1000, (p.interval || 6) * 1000));
  }

  // Wait until the engine has had a chance to render its DOM before we
  // hide #fidsBoard — otherwise the engine may rebuild and the visibility
  // override gets lost.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(load, 300));
  } else {
    setTimeout(load, 300);
  }
})();
