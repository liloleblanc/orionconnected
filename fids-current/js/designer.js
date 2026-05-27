/* ───────────────────────────────────────────────────────────────────────────
 * TEMPLATE DESIGNER — visual page that builds templates for live displays.
 *
 * Template format (stored as JSON):
 *   {
 *     id: 'tpl_xxx', name: 'My Gate Template',
 *     canvas: { w: 1920, h: 1080 },
 *     components: [
 *       { id, type, x, y, w, h, props }
 *     ]
 *   }
 *
 * Storage:
 *   fids_templates              { tplId: template }
 *   fids_template_assigned:gids  tplId  (or absent = use engine default)
 *   fids_template_assigned:fids  tplId
 *   fids_template_assigned:bids  tplId
 *
 * The live-display side reads fids_template_assigned:<display> on load
 * (see js/template-renderer.js) and renders the template if one is assigned.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const K_TEMPLATES = 'fids_templates';
  const K_ASSIGN_PREFIX = 'fids_template_assigned:';
  const K_DISPLAY_GATE  = 'fids_display_gate:';

  /* ── Starter templates ───────────────────────────────────────────────────
   * Professionally pre-laid-out templates the user can start from instead
   * of an empty canvas. Each is a complete, working template — copied to
   * a fresh ID when selected. Components use the same prop schema as if
   * the user had built them by hand, so they can be edited normally.
   *
   * Returned by a function (not a top-level const) because _mk() needs
   * COMPONENTS, which is declared below.
   */
  function _starters() { return [
    {
      key: 'blank',
      name: 'Blank canvas',
      description: 'Start from scratch.',
      preview: 'blank',
      template: null  // null → open empty
    },
    {
      key: 'gate-boarding',
      name: 'Gate Boarding',
      description: 'Gate screen for one specific gate. Shows the next flight, status, and "Now Boarding" banner. Pulls live data when you set the Gate field in the toolbar.',
      preview: 'gate',
      template: {
        canvas: { w: 1920, h: 1080 },
        background: { color: '#0a0e1c', image: '', fit: 'cover' },
        components: [
          _mk('message', 80,  60, 1280, 200, { title: 'Now Boarding', body: 'Flight {flight.flight} to {flight.destination}', bg: '#065f46', accent: '#10b981', titleColor: '#ffffff', bodyColor: '#d1fae5', titleSize: 72, bodySize: 38, icon: '✈' }),
          _mk('text',   1400, 60,  470, 200, { text: 'Gate {gate}', fontSize: 130, color: '#fbbf24', weight: 900, align: 'right' }),
          _mk('text',   80,  340, 1760, 140, { text: '{flight.flight}  ·  {flight.destination}', fontSize: 100, color: '#ffffff', weight: 800, align: 'center' }),
          _mk('text',   80,  500, 1760,  80, { text: 'Scheduled departure   {flight.time}', fontSize: 44, color: '#9ca3af', weight: 600, align: 'center' }),
          _mk('clock',  1560, 920,  300,  100, { format: '12h', fontSize: 60, color: '#fbbf24' }),
          _mk('text',   80,  940,  900,   60, { text: '{airport.name}', fontSize: 30, color: '#9ca3af', weight: 600, align: 'left' })
        ]
      }
    },
    {
      key: 'main-departures',
      name: 'Main Departures Board',
      description: 'Full-screen departures list with airline logos, status colors, and the airport name + clock in the corner.',
      preview: 'departures',
      template: {
        canvas: { w: 1920, h: 1080 },
        background: { color: '#0a0e1c', image: '', fit: 'cover' },
        components: [
          _mk('text',  60,   30,  900,  90, { text: 'DEPARTURES', fontSize: 76, color: '#ffffff', weight: 900, align: 'left' }),
          _mk('clock', 1480, 30,  400,  80, { format: '12h', fontSize: 56, color: '#fbbf24' }),
          _mk('text',  1480, 105, 400,  40, { text: '{date}', fontSize: 22, color: '#9ca3af', weight: 500, align: 'right' }),
          _mk('flightList', 60, 160, 1800, 880, {
            source: 'dep', maxRows: 12,
            headerText: '', fontSize: 30, headerSize: 24,
            columnGap: 28, rowPadding: 18, headerPadding: 12,
            cols: { logo: true, flight: true, destination: true, time: true, status: true, gate: true, airline: false },
            colWidths: { logo: 100, flight: 200, destination: 0, time: 160, status: 0, gate: 120 },
            bg: 'rgba(15, 23, 42, 0.5)', accent: '#3b82f6'
          })
        ]
      }
    },
    {
      key: 'baggage-claim',
      name: 'Baggage Claim',
      description: 'Arrivals list with belt assignments and a welcome banner. Tailored for the BIDS screen.',
      preview: 'baggage',
      template: {
        canvas: { w: 1920, h: 1080 },
        background: { color: '#1e1b4b', image: '', fit: 'cover' },
        components: [
          _mk('text',  60, 30, 1200, 90, { text: 'BAGGAGE CLAIM', fontSize: 72, color: '#ffffff', weight: 900, align: 'left' }),
          _mk('clock', 1500, 40, 380, 80, { format: '12h', fontSize: 54, color: '#fbbf24' }),
          _mk('message', 60, 150, 1800, 130, { title: 'Welcome to {airport.name}', body: 'Find your bag at the belt listed below.', bg: '#312e81', accent: '#a78bfa', titleColor: '#ffffff', bodyColor: '#ddd6fe', titleSize: 44, bodySize: 24, icon: '🧳' }),
          _mk('flightList', 60, 320, 1800, 700, {
            source: 'arr', maxRows: 10, headerText: '',
            fontSize: 32, columnGap: 28, rowPadding: 18,
            cols: { logo: true, flight: true, destination: true, time: true, status: true, gate: true, airline: false },
            colWidths: { logo: 100, flight: 200, destination: 0, time: 160, status: 0, gate: 140 },
            bg: 'rgba(255, 255, 255, 0.04)', accent: '#a78bfa', headerColor: '#ddd6fe'
          })
        ]
      }
    },
    {
      key: 'welcome',
      name: 'Welcome Screen',
      description: 'Airport name, clock, and a rotating advertisement panel. Use it as a lobby greeter.',
      preview: 'welcome',
      template: {
        canvas: { w: 1920, h: 1080 },
        background: { color: '#0c4a6e', image: '', fit: 'cover' },
        components: [
          _mk('text', 60, 80, 1800, 160, { text: 'Welcome to {airport.name}', fontSize: 110, color: '#ffffff', weight: 900, align: 'center' }),
          _mk('clock', 760, 280, 400, 160, { format: '12h', fontSize: 110, color: '#fbbf24' }),
          _mk('text', 60, 470, 1800, 60, { text: '{date}', fontSize: 36, color: '#bae6fd', weight: 500, align: 'center' }),
          _mk('ad', 360, 600, 1200, 360, {
            items: [
              { type: 'text', text: 'Free Wi-Fi available throughout the terminal', bg: '#1e40af', color: '#ffffff' },
              { type: 'text', text: 'Visit our shops on Concourse A', bg: '#5b21b6', color: '#ffffff' },
              { type: 'text', text: 'Have a pleasant flight!',         bg: '#065f46', color: '#ffffff' }
            ],
            interval: 5, fontSize: 56, weight: 700
          })
        ]
      }
    }
  ]; }

  /* Builds a component object with all default props for its type, then
   * applies the overrides given. Lets starter templates stay short and
   * readable above. */
  function _mk(type, x, y, w, h, overrides) {
    const def = COMPONENTS[type] || { defaultProps: {} };
    const props = Object.assign({}, JSON.parse(JSON.stringify(def.defaultProps || {})), overrides || {});
    return { id: 'c_' + _shortId(), type, x, y, w, h, props };
  }
  /* Adopts a starter (clones it under a new template id) and makes it
   * the current working template. Selected resets. */
  function adoptStarter(key) {
    const s = _starters().find(x => x.key === key);
    if (!s || !s.template) {
      // Blank
      template = { id: 'tpl_' + _shortId(), name: '', canvas: { w: 1920, h: 1080 }, background: { color: '#0b0d12', image: '', fit: 'cover' }, components: [] };
    } else {
      const cloned = JSON.parse(JSON.stringify(s.template));
      template = {
        id: 'tpl_' + _shortId(),
        name: s.name,
        canvas: cloned.canvas || { w: 1920, h: 1080 },
        background: cloned.background || { color: '#0b0d12' },
        components: (cloned.components || []).map(c => Object.assign({}, c, { id: 'c_' + _shortId() }))
      };
    }
    document.getElementById('dgnTplName').value = template.name || '';
    document.getElementById('dgnAssign').value = '';
    selectedId = null;
    applyCanvasBackground();
    rerender();
    closeStarterModal();
    _history = []; _historyIdx = -1;  // fresh history per template
    commitHistory();
    toast(s ? ('Loaded "' + s.name + '" — customize and Save when ready.') : 'New blank template.');
  }
  function openStarterModal() {
    const m = document.getElementById('dgnStarterModal');
    if (m) m.hidden = false;
  }
  function closeStarterModal() {
    const m = document.getElementById('dgnStarterModal');
    if (m) m.hidden = true;
  }
  function paintStarterModal() {
    const grid = document.getElementById('dgnStarterGrid');
    if (!grid) return;
    grid.innerHTML = _starters().map(s =>
      '<button type="button" class="dgn-starter-card" data-starter="' + _esc(s.key) + '">' +
        '<div class="dgn-starter-preview dgn-starter-' + _esc(s.preview) + '"></div>' +
        '<div class="dgn-starter-name">' + _esc(s.name) + '</div>' +
        '<div class="dgn-starter-desc">' + _esc(s.description) + '</div>' +
      '</button>'
    ).join('');
    grid.querySelectorAll('.dgn-starter-card').forEach(b =>
      b.addEventListener('click', () => adoptStarter(b.dataset.starter)));
  }

  /* ── Dynamic text: {placeholder} resolution ────────────────────────────── */
  // The renderer fills these into Text + Visual Message components. The
  // context is rebuilt on every paint so live data flows automatically.
  function _resolvePlaceholders(str, ctx) {
    if (!str) return '';
    return String(str).replace(/\{([a-zA-Z0-9_.]+)\}/g, (_m, path) => {
      const parts = path.split('.');
      let v = ctx;
      for (const p of parts) { if (v == null) break; v = v[p]; }
      return v == null ? '' : String(v);
    });
  }
  function _hasPlaceholders(str) { return /\{[a-zA-Z0-9_.]+\}/.test(str || ''); }

  // The Designer's preview context uses sample data so what you see in
  // the editor reflects what'll play. On the live display the same shape
  // is built from window.flightsDep + the assigned gate.
  function designerContext() {
    const d = new Date();
    const sample = SAMPLE_FLIGHTS[0];  // first sample row stands in for "current flight"
    return {
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: d.toLocaleDateString(),
      gate: 'A3',
      airport: { code: 'YQM', name: 'Greater Moncton' },
      flight: {
        flight: sample.flight, destination: sample.destination,
        time: sample.time,     status: sample.status,
        gate: sample.gate,     airline: sample.airline,
        // Sample values for the live fields surfaced in Push A
        terminal: 'M', airlineName: 'Air Canada',
        aircraft: 'Airbus A220-300', registration: 'C-GROV',
        altitude: '34,000 ft', speed: '812 km/h', callsign: 'ACA8421',
        actualTime: sample.time, belt: '3', checkIn: '12–18', duration: '1h 35m'
      }
    };
  }
  window.FidsDesignerResolve = _resolvePlaceholders;
  window.FidsDesignerHasPH   = _hasPlaceholders;

  /* ── Component registry: render + properties schema ────────────────────── */
  const COMPONENTS = {
    text: {
      defaultProps: { text: 'Your text here', fontSize: 36, color: '#ffffff', weight: 700, align: 'left', fontFamily: 'Inter' },
      defaultSize:  { w: 360, h: 70 },
      render(el, props) {
        el.classList.add('dgn-comp-text');
        // Resolve {placeholders} so the editor shows what'll actually play
        el.textContent = _resolvePlaceholders(props.text || '', designerContext());
        el.style.fontSize   = (props.fontSize || 36) + 'px';
        el.style.color      = props.color || '#fff';
        el.style.fontWeight = props.weight || 600;
        el.style.fontFamily = _fontStack(props.fontFamily);
        el.style.justifyContent = props.align === 'center' ? 'center' : (props.align === 'right' ? 'flex-end' : 'flex-start');
        el.style.textAlign      = props.align || 'left';
        // Refresh live placeholders every 5s in the editor
        clearInterval(el._tick);
        if (_hasPlaceholders(props.text)) {
          el._tick = setInterval(() => {
            if (!document.body.contains(el)) return clearInterval(el._tick);
            el.textContent = _resolvePlaceholders(props.text, designerContext());
          }, 5000);
        }
      },
      schema: [
        { section: 'Content' },
        { key: 'text', label: 'Text', type: 'textarea' },
        { fieldType: 'placeholder-hint' },
        { section: 'Appearance' },
        { row: [
          { key: 'fontSize', label: 'Size (px)', type: 'number', min: 8, max: 400 },
          { key: 'weight',   label: 'Weight',    type: 'select', options: [{v:400,l:'Regular'},{v:600,l:'Semi-bold'},{v:700,l:'Bold'},{v:900,l:'Black'}] }
        ]},
        { row: [
          { key: 'color',    label: 'Color',     type: 'color' },
          { key: 'align',    label: 'Align',     type: 'select', options: [{v:'left',l:'Left'},{v:'center',l:'Center'},{v:'right',l:'Right'}] }
        ]},
        { key: 'fontFamily', label: 'Font', type: 'font' }
      ]
    },
    clock: {
      defaultProps: { format: '12h', fontSize: 64, color: '#ffffff', showSeconds: false, fontFamily: 'Inter' },
      defaultSize:  { w: 320, h: 100 },
      render(el, props) {
        el.classList.add('dgn-comp-clock');
        el.style.fontSize = (props.fontSize || 64) + 'px';
        el.style.color    = props.color || '#fff';
        el.style.fontFamily = _fontStack(props.fontFamily);
        el.style.justifyContent = 'center';
        el.textContent = _formatClock(props.format, props.showSeconds);
        // The Designer also updates clocks live so what you see is what plays.
        clearInterval(el._tick);
        el._tick = setInterval(() => {
          if (!document.body.contains(el)) { clearInterval(el._tick); return; }
          el.textContent = _formatClock(props.format, props.showSeconds);
        }, 1000);
      },
      schema: [
        { section: 'Format' },
        { row: [
          { key: 'format',     label: 'Format', type: 'select', options: [{v:'12h',l:'12-hour'},{v:'24h',l:'24-hour'}] },
          { key: 'showSeconds',label: 'Seconds',type: 'select', options: [{v:false,l:'Hide'},{v:true,l:'Show'}] }
        ]},
        { section: 'Appearance' },
        { row: [
          { key: 'fontSize', label: 'Size (px)', type: 'number', min: 8, max: 400 },
          { key: 'color',    label: 'Color',     type: 'color' }
        ]},
        { key: 'fontFamily', label: 'Font', type: 'font' }
      ]
    },

    /* ── Image: drop a picture from your computer ────────────────────────── */
    image: {
      defaultProps: { src: '', fit: 'contain', radius: 0, opacity: 1 },
      defaultSize:  { w: 320, h: 200 },
      render(el, props) {
        el.classList.add('dgn-comp-image');
        el.style.justifyContent = 'center';
        el.style.background = props.src ? 'transparent' : 'rgba(255,255,255,0.04)';
        el.style.border = props.src ? '0' : '1px dashed #374151';
        el.style.borderRadius = (props.radius || 0) + 'px';
        el.style.opacity = (props.opacity == null ? 1 : props.opacity);
        if (props.src) {
          el.innerHTML = '<img src="' + _esc(props.src) + '" alt="" style="width:100%;height:100%;object-fit:' + (props.fit || 'contain') + ';border-radius:' + (props.radius || 0) + 'px;">';
        } else {
          el.innerHTML = '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:8px;">Pick an image →<br><small>Properties panel · Replace image</small></div>';
        }
      },
      schema: [
        { section: 'Image' },
        { key: 'src', label: 'Source', type: 'image-picker' },
        { section: 'Display' },
        { row: [
          { key: 'fit', label: 'Fit', type: 'select', options: [
            {v:'contain',l:'Contain (fit inside)'},
            {v:'cover',  l:'Cover (fill, may crop)'},
            {v:'fill',   l:'Stretch'}
          ]},
          { key: 'radius', label: 'Corner radius', type: 'number', min: 0, max: 200 }
        ]},
        { key: 'opacity', label: 'Opacity (0–1)', type: 'number', min: 0, max: 1, step: 0.05 }
      ]
    },

    /* ── Flight List: reads live data from the engine ────────────────────── */
    flightList: {
      defaultProps: {
        source: 'dep', maxRows: 8,
        headerText: 'Departures',
        cols: { logo: true, flight: true, destination: true, time: true, status: true, gate: true, airline: false },
        colWidths: { logo: 80, flight: 160, airline: 100, time: 120, gate: 100, destination: 0, status: 0 },
        fontSize: 28, headerSize: 32,
        headerColor: '#ffffff', rowColor: '#e5e7eb',
        bg: 'rgba(15, 23, 42, 0.6)', accent: '#3b82f6',
        zebra: true,
        columnGap: 18, rowPadding: 12, headerPadding: 10,
        wrap: 'truncate',
        fontFamily: 'Inter',
        statusColors: {
          'boarding':   '#10b981',
          'final call': '#10b981',
          'now boarding':'#10b981',
          'delayed':    '#f59e0b',
          'cancelled':  '#ef4444',
          'canceled':   '#ef4444',
          'departed':   '#9ca3af',
          'arrived':    '#9ca3af'
        },
        remarksMap: {
          'BRD': 'Boarding',
          'FNL': 'Final call',
          'GTO': 'Gate open',
          'GTC': 'Gate closed',
          'DEP': 'Departed',
          'ARR': 'Arrived',
          'CXL': 'Cancelled',
          'DLY': 'Delayed',
          'ONT': 'On time'
        }
      },
      defaultSize: { w: 1100, h: 600 },
      render(el, props) {
        el.classList.add('dgn-comp-flightlist');
        el.style.background = props.bg || 'rgba(15,23,42,0.6)';
        el.style.borderRadius = '8px';
        el.style.padding = '14px 18px';
        el.style.overflow = 'hidden';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.justifyContent = 'flex-start';
        el.innerHTML = renderFlightListHTML(props, getLiveFlights(props.source));
      },
      schema: [
        { section: 'Source' },
        { row: [
          { key: 'source',   label: 'Show',    type: 'select', options: [{v:'dep',l:'Departures'},{v:'arr',l:'Arrivals'}] },
          { key: 'maxRows',  label: 'Max rows',type: 'number', min: 1, max: 30 }
        ]},
        { key: 'headerText', label: 'Header text', type: 'text' },
        { section: 'Columns to show' },
        { key: 'cols', label: '', type: 'checklist', options: [
          { v: 'logo',        l: 'Airline logo (image)' },
          { v: 'flight',      l: 'Flight #' },
          { v: 'airline',     l: 'Airline (code)' },
          { v: 'destination', l: 'Destination' },
          { v: 'time',        l: 'Time'     },
          { v: 'status',      l: 'Status'   },
          { v: 'gate',        l: 'Gate'     }
        ]},
        { section: 'Column widths (px — leave blank for auto)' },
        { key: 'colWidths', label: '', type: 'col-widths' },
        { section: 'Spacing' },
        { row: [
          { key: 'columnGap',  label: 'Column gap (px)', type: 'number', min: 0, max: 200 },
          { key: 'rowPadding', label: 'Row padding (px)',type: 'number', min: 0, max: 60 }
        ]},
        { key: 'wrap', label: 'Long text', type: 'select', options: [
          { v: 'truncate', l: 'Truncate with …' },
          { v: 'wrap',     l: 'Wrap to next line' }
        ]},
        { section: 'Appearance' },
        { row: [
          { key: 'headerSize', label: 'Header (px)', type: 'number', min: 10, max: 80 },
          { key: 'fontSize',   label: 'Row (px)',    type: 'number', min: 10, max: 60 }
        ]},
        { row: [
          { key: 'headerColor', label: 'Header color', type: 'color' },
          { key: 'rowColor',    label: 'Row color',    type: 'color' }
        ]},
        { row: [
          { key: 'bg',     label: 'Background', type: 'color' },
          { key: 'accent', label: 'Accent',     type: 'color' }
        ]},
        { key: 'fontFamily', label: 'Font', type: 'font' },
        { key: 'zebra',      label: 'Zebra stripes', type: 'select', options: [{v:true,l:'On'},{v:false,l:'Off'}] },
        { section: 'Status colors (text color per status word)' },
        { key: 'statusColors', label: '', type: 'status-colors' },
        { section: 'Status remarks (replace short codes with friendly text)' },
        { key: 'remarksMap',   label: '', type: 'remarks-map' }
      ]
    },

    /* ── Advertisement: a rotating list of items ─────────────────────────── */
    ad: {
      defaultProps: {
        items: [
          { type: 'text', text: 'Welcome to our airport', bg: '#0b3d91', color: '#fff' },
          { type: 'text', text: 'Free Wi-Fi available throughout the terminal', bg: '#7c3aed', color: '#fff' }
        ],
        interval: 6,
        fontSize: 36, weight: 700
      },
      defaultSize: { w: 600, h: 300 },
      render(el, props) {
        el.classList.add('dgn-comp-ad');
        el.style.justifyContent = 'center';
        el.style.borderRadius = '8px';
        el.style.overflow = 'hidden';
        el.style.position = 'absolute';
        const items = Array.isArray(props.items) && props.items.length ? props.items : [{ type:'text', text:'No items', bg:'#374151', color:'#fff' }];
        let i = 0;
        const show = () => {
          const item = items[i % items.length];
          el.style.background = item.bg || '#0b3d91';
          if (item.type === 'image' && item.src) {
            el.innerHTML = '<img src="' + _esc(item.src) + '" style="width:100%;height:100%;object-fit:cover;">';
          } else {
            el.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;color:' + _esc(item.color || '#fff') + ';font-weight:' + (props.weight || 700) + ';font-size:' + (props.fontSize || 36) + 'px;line-height:1.2;">' + _esc(item.text || '') + '</div>';
          }
          i++;
        };
        show();
        clearInterval(el._tick);
        el._tick = setInterval(() => {
          if (!document.body.contains(el)) { clearInterval(el._tick); return; }
          show();
        }, Math.max(1000, (props.interval || 6) * 1000));
      },
      schema: [
        { section: 'Rotation' },
        { row: [
          { key: 'interval', label: 'Seconds per item', type: 'number', min: 1, max: 120 },
          { key: 'fontSize', label: 'Text size (px)',   type: 'number', min: 12, max: 120 }
        ]},
        { section: 'Items (rotated)' },
        { key: 'items', label: '', type: 'ad-items' }
      ]
    },

    /* ── Visual Message: a styled announcement box ──────────────────────── */
    message: {
      defaultProps: {
        title: 'Now Boarding',
        body: 'Please proceed to your gate.',
        bg: '#065f46', titleColor: '#ffffff', bodyColor: '#d1fae5',
        accent: '#10b981', titleSize: 42, bodySize: 24, icon: '✈',
        fontFamily: 'Inter'
      },
      defaultSize: { w: 600, h: 220 },
      render(el, props) {
        el.classList.add('dgn-comp-message');
        el.style.background = props.bg || '#065f46';
        el.style.borderLeft = '6px solid ' + (props.accent || '#10b981');
        el.style.borderRadius = '8px';
        el.style.padding = '18px 24px';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'flex-start';
        el.style.gap = '18px';
        el.style.fontFamily = _fontStack(props.fontFamily);
        const draw = () => {
          const ctx = designerContext();
          const title = _resolvePlaceholders(props.title || '', ctx);
          const body  = _resolvePlaceholders(props.body  || '', ctx);
          el.innerHTML =
            (props.icon ? '<div style="font-size:' + ((props.titleSize || 42) * 1.2) + 'px;flex-shrink:0;">' + _esc(props.icon) + '</div>' : '') +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:800;font-size:' + (props.titleSize || 42) + 'px;color:' + _esc(props.titleColor || '#fff') + ';line-height:1.1;">' + _esc(title) + '</div>' +
              (body ? '<div style="font-size:' + (props.bodySize || 24) + 'px;color:' + _esc(props.bodyColor || '#d1fae5') + ';margin-top:6px;line-height:1.3;">' + _esc(body) + '</div>' : '') +
            '</div>';
        };
        draw();
        clearInterval(el._tick);
        if (_hasPlaceholders(props.title) || _hasPlaceholders(props.body)) {
          el._tick = setInterval(() => {
            if (!document.body.contains(el)) return clearInterval(el._tick);
            draw();
          }, 5000);
        }
      },
      schema: [
        { section: 'Content' },
        { row: [
          { key: 'icon',  label: 'Icon (emoji)', type: 'text' },
          { key: 'title', label: 'Title',        type: 'text' }
        ]},
        { key: 'body', label: 'Body', type: 'textarea' },
        { fieldType: 'placeholder-hint' },
        { section: 'Appearance' },
        { row: [
          { key: 'titleSize', label: 'Title size (px)', type: 'number', min: 12, max: 120 },
          { key: 'bodySize',  label: 'Body size (px)',  type: 'number', min: 10, max: 80 }
        ]},
        { row: [
          { key: 'bg',     label: 'Background', type: 'color' },
          { key: 'accent', label: 'Accent bar', type: 'color' }
        ]},
        { row: [
          { key: 'titleColor', label: 'Title color', type: 'color' },
          { key: 'bodyColor',  label: 'Body color',  type: 'color' }
        ]},
        { key: 'fontFamily', label: 'Font', type: 'font' }
      ]
    },

    /* ── Flight Map: geographic route map OR abstract route card ─────────── */
    map: {
      defaultProps: {
        style: 'geo',
        source: 'live',
        showInfo: true,
        origin: 'YQM', originLabel: 'Moncton',
        destination: 'YYZ', destinationLabel: 'Toronto',
        flightNumber: '{flight.flight}',
        progress: 45,
        bg: '#0f172a', accent: '#3b82f6', textColor: '#ffffff'
      },
      defaultSize: { w: 920, h: 420 },
      render(el, props) {
        el.classList.add('dgn-comp-flightmap');
        el.style.position = 'absolute';
        el.style.background = props.bg || '#0f172a';
        el.style.borderRadius = '10px';
        el.style.overflow = 'hidden';
        el.style.padding = '0';
        el.style.display = 'flex';
        el.style.alignItems = 'stretch';
        if (el._leafletMap) { try { el._leafletMap.remove(); } catch (e) {} el._leafletMap = null; }
        el.innerHTML = '';
        const ctx = designerContext();
        const rt = _flightMapRoute(props, ctx);
        const showInfo = !(props.showInfo === false || props.showInfo === 'false');
        const mapWrap = document.createElement('div');
        mapWrap.style.cssText = 'position:relative;flex:1 1 auto;min-width:0;height:100%;overflow:hidden;';
        el.appendChild(mapWrap);
        if (showInfo) {
          const panel = document.createElement('div');
          panel.style.cssText = 'flex:0 0 38%;max-width:44%;height:100%;overflow:hidden;';
          panel.innerHTML = _flightInfoHTML(ctx.flight, rt, props);
          el.appendChild(panel);
        }
        if ((props.style || 'geo') === 'geo') {
          el._leafletMap = _flightMapGeo(mapWrap, props, ctx, rt);
        } else {
          mapWrap.innerHTML = _flightMapHTML({
            origin:       rt.org,
            originLabel:  _resolvePlaceholders(props.originLabel || '', ctx),
            dest:         rt.dst,
            destLabel:    _resolvePlaceholders(props.destinationLabel || '', ctx),
            fnum:         _resolvePlaceholders(props.flightNumber || '', ctx),
            progress: rt.prog, accent: props.accent, textColor: props.textColor
          });
        }
      },
      schema: [
        { section: 'Data source' },
        { key: 'source', label: 'Route data', type: 'select', options: [
          { v: 'live',   l: 'Live — the flight at this display’s gate' },
          { v: 'manual', l: 'Manual — fixed codes below' }
        ]},
        { section: 'Style' },
        { key: 'style', label: 'Map style', type: 'select', options: [
          { v: 'geo',  l: 'Geographic map (real terrain)' },
          { v: 'card', l: 'Route card (abstract arc)' }
        ]},
        { key: 'showInfo', label: 'Info panel', type: 'select', options: [
          { v: true,  l: 'Show — flight details beside the map' },
          { v: false, l: 'Hide — map only' }
        ]},
        { section: 'Route (used for Manual, or as fallback)' },
        { row: [
          { key: 'origin',      label: 'Origin code',     type: 'text' },
          { key: 'destination', label: 'Destination code',type: 'text' }
        ]},
        { row: [
          { key: 'originLabel',      label: 'Origin label',      type: 'text' },
          { key: 'destinationLabel', label: 'Destination label', type: 'text' }
        ]},
        { key: 'flightNumber', label: 'Flight number (top)', type: 'text' },
        { fieldType: 'placeholder-hint' },
        { section: 'Aircraft position' },
        { key: 'progress', label: 'Progress 0–100% (Manual only — Live is automatic)', type: 'number', min: 0, max: 100 },
        { section: 'Appearance' },
        { row: [
          { key: 'bg',     label: 'Background', type: 'color' },
          { key: 'accent', label: 'Route / plane', type: 'color' }
        ]},
        { key: 'textColor', label: 'Text color', type: 'color' }
      ]
    }
  };

  /* Resolves the Flight Map route. In 'live' mode it reads
   * window._fidsGateRoute — published by the engine's initGateMap() every
   * time it recomputes the gate flight (origin, destination, real progress
   * 0–1, or -1 before departure). On the Designer page that global doesn't
   * exist, so it falls back to the manual fields for preview. */
  function _flightMapRoute(props, ctx) {
    if ((props.source || 'live') === 'live') {
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
    return {
      org: String(_resolvePlaceholders(props.origin || '', ctx) || '').toUpperCase().trim(),
      dst: String(_resolvePlaceholders(props.destination || '', ctx) || '').toUpperCase().trim(),
      prog: parseFloat(props.progress) || 0,
      live: false
    };
  }

  /* Renders the geographic Flight Map into `el` using Leaflet. Real map
   * tiles, a great-circle route arc, origin/destination markers, and the
   * aircraft at `progress`. Airport codes resolve via window.AIRPORT_COORDS.
   * Falls back to a message if Leaflet isn't ready or a code is unknown. */
  function _flightMapGeo(el, props, ctx, rt) {
    rt = rt || _flightMapRoute(props, ctx);
    const originCode = rt.org, destCode = rt.dst;
    const coords = window.AIRPORT_COORDS || {};
    const o = coords[originCode], d = coords[destCode];
    const accent = props.accent || '#3b82f6';
    const note = (msg) => {
      el.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#9ca3af;font:14px/1.5 Inter,system-ui,sans-serif;padding:20px;">' + _esc(msg) + '</div>';
    };
    if (typeof L === 'undefined' || typeof L.map !== 'function') { note('Loading map engine…'); return null; }
    if (!o) { note('Unknown origin airport code: "' + (originCode || '—') + '". Use an IATA code like YQM.'); return null; }
    if (!d) { note('Unknown destination airport code: "' + (destCode || '—') + '". Use an IATA code like YYZ.'); return null; }

    el.innerHTML = '';
    const mapDiv = document.createElement('div');
    mapDiv.style.cssText = 'position:absolute;inset:0;background:#0f172a;';
    el.appendChild(mapDiv);
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
    } catch (e) {
      arc = L.polyline([o, d], { color: accent, weight: 4, opacity: 0.95 }).addTo(map);
    }
    L.circleMarker(o, { radius: 8, color: '#fff', weight: 2, fillColor: accent,    fillOpacity: 1 }).addTo(map);
    L.circleMarker(d, { radius: 8, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }).addTo(map);

    // Aircraft at progress along the arc
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
    setTimeout(fit, 140);
    return map;
  }

  /* Builds a flight route card: origin dot → curved arc → destination dot,
   * with the aircraft drawn at `progress` along the arc and rotated to the
   * tangent. Pure inline SVG — works identically in the editor and live. */
  function _flightMapHTML(o) {
    const accent = o.accent || '#3b82f6';
    const text   = o.textColor || '#ffffff';
    const prog   = Math.max(0, Math.min(1, (parseFloat(o.progress) || 0) / 100));
    // Quadratic bezier in a 1000×300 viewBox
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

  /* Great-circle distance in km — used for the Flight Map info panel's
   * "remaining distance" estimate. */
  function _haversineKm(la1, lo1, la2, lo2) {
    const R = 6371, toR = Math.PI / 180;
    const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  /* The Flight Map info panel — the side panel from the JetBlue photo.
   * `flight` is the resolved flight context, `rt` the {org,dst,prog} route. */
  function _flightInfoHTML(flight, rt, props) {
    flight = flight || {};
    const accent = props.accent || '#3b82f6';
    const text = props.textColor || '#ffffff';
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
      ['To',           flight.destination],
      ['Scheduled',    flight.time],
      ['Actual',       flight.actualTime],
      ['Ground speed', flight.speed],
      ['Altitude',     flight.altitude],
      ['Remaining',    remaining],
      ['Aircraft',     flight.aircraft],
      ['Gate',         flight.gate]
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

  /* Shared font-family helper: maps a friendly font name to a CSS stack
   * that matches what the engine already loads (Geist, Inter, etc.). */
  const FONT_FAMILIES = [
    { v: 'Inter',          l: 'Inter (modern UI)' },
    { v: 'DM Sans',        l: 'DM Sans (geometric)' },
    { v: 'Manrope',        l: 'Manrope (rounded)' },
    { v: 'Space Grotesk',  l: 'Space Grotesk (display)' },
    { v: 'Geist',          l: 'Geist (clean)' },
    { v: 'Airport',        l: 'Airport (signage)' },
    { v: 'Airport X',      l: 'Airport X (alt signage)' },
    { v: 'JetBrains Mono', l: 'JetBrains Mono (monospace)' },
    { v: 'system',         l: 'System default' }
  ];
  function _fontStack(name) {
    if (!name || name === 'system') return "system-ui, -apple-system, 'Segoe UI', sans-serif";
    return "'" + name + "', 'Inter', system-ui, sans-serif";
  }
  window.FidsDesignerFonts = FONT_FAMILIES; // shared with field renderer

  /* ── Flight List support: live data + HTML builder ─────────────────────── */
  // Reads from the engine globals window.flightsDep / window.flightsArr.
  // If those aren't populated yet (Designer page, no engine), returns
  // sample rows so what you see in the editor matches what plays.
  const SAMPLE_FLIGHTS = [
    { flight: 'AC8421', airline: 'AC', destination: 'Toronto',      time: '14:30', status: 'Boarding',  gate: 'A3' },
    { flight: 'WS3120', airline: 'WS', destination: 'Calgary',      time: '15:05', status: 'On time',   gate: 'B1' },
    { flight: 'PD2244', airline: 'PD', destination: 'Halifax',      time: '15:40', status: 'On time',   gate: 'A2' },
    { flight: 'AC8662', airline: 'AC', destination: 'Montréal',     time: '16:15', status: 'Delayed',   gate: 'A4' },
    { flight: 'WS3306', airline: 'WS', destination: 'Vancouver',    time: '17:30', status: 'On time',   gate: 'B2' },
    { flight: 'F84412', airline: 'F8', destination: 'Cancún',       time: '18:00', status: 'On time',   gate: 'C1' },
    { flight: 'AC1108', airline: 'AC', destination: 'New York LGA', time: '18:45', status: 'On time',   gate: 'A1' },
    { flight: 'PD2150', airline: 'PD', destination: 'Ottawa',       time: '19:20', status: 'On time',   gate: 'A2' }
  ];
  function getLiveFlights(source) {
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
    return SAMPLE_FLIGHTS;
  }
  // Shared with template-renderer.js via window.FidsTemplates.buildFlightListHTML
  function renderFlightListHTML(props, rows) { return buildFlightListHTML(props, rows); }
  function buildFlightListHTML(props, rows) {
    const cols = props.cols || {};
    const order = ['logo','flight','airline','destination','time','status','gate'];
    const labels = { logo: '', flight: 'Flight', airline: 'Airline', destination: 'Destination', time: 'Time', status: 'Status', gate: 'Gate' };
    const active = order.filter(k => cols[k]);
    const maxRows = Math.max(1, parseInt(props.maxRows, 10) || 8);
    const visible = rows.slice(0, maxRows);
    const gap        = Math.max(0, parseInt(props.columnGap, 10) || 0);
    const rowPad     = Math.max(0, parseInt(props.rowPadding, 10) || 0);
    const headerPad  = Math.max(0, parseInt(props.headerPadding, 10) || 0);
    const wrapMode   = props.wrap === 'wrap' ? 'wrap' : 'truncate';
    const widths     = props.colWidths || {};
    const DEFAULTS   = { logo: 80, flight: 160, airline: 100, time: 120, gate: 100, destination: 0, status: 0 };
    const fontStack  = _fontStack(props.fontFamily);
    const statusColors = props.statusColors || {};
    const remarksMap   = props.remarksMap || {};
    const rowFontPx  = props.fontSize || 28;

    function mapRemark(s) {
      if (!s) return '';
      const up = String(s).toUpperCase().trim();
      // Look for exact match on the trimmed uppercase code
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
    if (props.headerText) {
      html += '<div style="font-size:' + (props.headerSize || 32) + 'px;font-weight:800;color:' + _esc(props.headerColor || '#fff') + ';margin-bottom:10px;letter-spacing:0.02em;border-bottom:2px solid ' + _esc(props.accent || '#3b82f6') + ';padding-bottom:8px;' + cellOverflow + '">' + _esc(props.headerText) + '</div>';
    }
    if (active.length === 0) {
      return html + '<div style="color:#9ca3af;font-size:14px;">Pick at least one column in the properties panel.</div></div>';
    }
    // Column header row
    html += '<div style="display:flex;gap:' + gap + 'px;font-size:' + Math.round(rowFontPx * 0.55) + 'px;font-weight:700;color:' + _esc(props.headerColor || '#fff') + ';opacity:0.7;letter-spacing:0.08em;text-transform:uppercase;padding:' + headerPad + 'px 4px;">';
    active.forEach(k => {
      html += '<div style="' + colFlex(k) + cellOverflow + '">' + _esc(labels[k]) + '</div>';
    });
    html += '</div>';
    // Data rows
    visible.forEach((r, idx) => {
      const zebra = props.zebra && idx % 2 === 1 ? 'background:rgba(255,255,255,0.04);' : '';
      html += '<div style="display:flex;align-items:center;gap:' + gap + 'px;font-size:' + rowFontPx + 'px;color:' + _esc(props.rowColor || '#e5e7eb') + ';padding:' + rowPad + 'px 4px;border-bottom:1px solid rgba(255,255,255,0.06);' + zebra + '">';
      active.forEach(k => {
        if (k === 'logo') {
          const src = _airlineLogoSrc(r.airline);
          const logoHeight = Math.round(rowFontPx * 1.4);
          const inner = src
            ? '<img src="' + _esc(src) + '" alt="' + _esc(r.airline || '') + '" style="max-height:' + logoHeight + 'px;max-width:100%;object-fit:contain;" onerror="this.style.display=\'none\'">'
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

  /* Resolve an airline code → logo URL.
   * Priority: per-airport override in localStorage (the engine's own seam),
   * then the engine's carrierLogoUrl() if exposed, then the public wway.io CDN.
   */
  function _airlineLogoSrc(code) {
    if (!code) return '';
    const ap = (function () {
      try {
        const sel = document.getElementById('apSel');
        return ((sel && sel.value) || localStorage.getItem('fids_airport') || '').toUpperCase().trim();
      } catch (e) { return ''; }
    })();
    if (ap) {
      try {
        const raw = localStorage.getItem('fids_airline_override_' + ap + '_' + String(code).toUpperCase());
        if (raw) { const o = JSON.parse(raw); if (o && o.url) return o.url; }
      } catch (e) {}
    }
    try { if (typeof carrierLogoUrl === 'function') return carrierLogoUrl(code); } catch (e) {}
    return 'https://img.wway.io/pics/root/' + String(code).toLowerCase() + '@svg';
  }
  // Share with template-renderer.js
  window.FidsAirlineLogo = _airlineLogoSrc;

  function _formatClock(format, showSeconds) {
    const d = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', hour12: format !== '24h' };
    if (showSeconds === true || showSeconds === 'true') opts.second = '2-digit';
    return d.toLocaleTimeString([], opts);
  }

  /* ── State ─────────────────────────────────────────────────────────────── */
  let template = { id: 'tpl_' + _shortId(), name: '', canvas: { w: 1920, h: 1080 }, background: { color: '#0b0d12', image: '', fit: 'cover' }, components: [] };
  let selectedId = null;
  let drag = null; // { kind: 'move'|'resize', id, dx, dy, startW, startH, startX, startY }

  function _shortId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ── Undo / Redo history ────────────────────────────────────────────────
   * Snapshots are deep-clones of `template`. We push after every
   * meaningful user action; rapid changes (typing, dragging) are
   * coalesced via commitHistory(true) which debounces 500ms.
   * Capped at 50 entries.
   */
  let _history = [];
  let _historyIdx = -1;
  let _hTimer = null;
  let _suppressHistory = false;  // set during undo/redo restore

  function _snapshotNow() {
    if (_suppressHistory) return;
    // Truncate any forward branch (we just diverged from history)
    _history = _history.slice(0, _historyIdx + 1);
    _history.push(JSON.parse(JSON.stringify(template)));
    if (_history.length > 50) _history.shift();
    _historyIdx = _history.length - 1;
    _updateUndoButtons();
  }
  function commitHistory(debounced) {
    if (_suppressHistory) return;
    if (debounced) {
      clearTimeout(_hTimer);
      _hTimer = setTimeout(_snapshotNow, 500);
      return;
    }
    clearTimeout(_hTimer);
    _snapshotNow();
  }
  function undo() {
    if (_historyIdx <= 0) return;
    _historyIdx--;
    _suppressHistory = true;
    template = JSON.parse(JSON.stringify(_history[_historyIdx]));
    selectedId = null;
    applyCanvasBackground();
    rerender();
    _suppressHistory = false;
    _updateUndoButtons();
    toast('Undo');
  }
  function redo() {
    if (_historyIdx >= _history.length - 1) return;
    _historyIdx++;
    _suppressHistory = true;
    template = JSON.parse(JSON.stringify(_history[_historyIdx]));
    selectedId = null;
    applyCanvasBackground();
    rerender();
    _suppressHistory = false;
    _updateUndoButtons();
    toast('Redo');
  }
  function _updateUndoButtons() {
    const u = document.getElementById('dgnUndo');
    const r = document.getElementById('dgnRedo');
    if (u) u.disabled = _historyIdx <= 0;
    if (r) r.disabled = _historyIdx >= _history.length - 1;
  }

  /* ── Duplicate selected component ─────────────────────────────────────── */
  function duplicateSelected() {
    if (!selectedId) return;
    const src = getComponent(selectedId);
    if (!src) return;
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = 'c_' + _shortId();
    clone.x = Math.min((template.canvas.w || 1920) - clone.w, clone.x + 20);
    clone.y = Math.min((template.canvas.h || 1080) - clone.h, clone.y + 20);
    template.components.push(clone);
    selectedId = clone.id;
    rerender();
    commitHistory();
    toast('Duplicated.');
  }

  /* Applies the template's background to the Designer canvas. Same
   * properties get applied to the live #fidsTemplateRoot in template-renderer.js.
   */
  function applyCanvasBackground() {
    const cv = document.getElementById('dgnCanvas');
    if (!cv) return;
    const bg = template.background || {};
    cv.style.backgroundColor = bg.color || '#1a1d26';
    if (bg.image) {
      cv.style.backgroundImage = 'url(' + bg.image.replace(/"/g, '\\"') + '), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)';
      cv.style.backgroundSize = (bg.fit === 'tile' ? 'auto, 40px 40px, 40px 40px' : (bg.fit === 'contain' ? 'contain, 40px 40px, 40px 40px' : 'cover, 40px 40px, 40px 40px'));
      cv.style.backgroundPosition = 'center, top left, top left';
      cv.style.backgroundRepeat = bg.fit === 'tile' ? 'repeat, repeat, repeat' : 'no-repeat, repeat, repeat';
    } else {
      cv.style.backgroundImage = 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)';
      cv.style.backgroundSize = '40px 40px';
      cv.style.backgroundPosition = '';
      cv.style.backgroundRepeat = '';
    }
  }

  /* ── Template I/O ──────────────────────────────────────────────────────── */
  function loadTemplates() {
    try { return JSON.parse(localStorage.getItem(K_TEMPLATES) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveTemplate() {
    template.name = (document.getElementById('dgnTplName').value || '').trim() || 'Untitled';
    const all = loadTemplates();
    all[template.id] = template;
    try { localStorage.setItem(K_TEMPLATES, JSON.stringify(all)); }
    catch (e) { toast('Out of local storage — try a smaller template.'); return; }
    // Persist assignment
    const assign = document.getElementById('dgnAssign').value;
    ['gids','fids','bids'].forEach(d => localStorage.removeItem(K_ASSIGN_PREFIX + d));
    if (assign) localStorage.setItem(K_ASSIGN_PREFIX + assign, template.id);
    refreshTemplatesDropdown();
    toast(assign ? ('Template saved & applied to ' + assign + '.') : 'Template saved (not yet applied).');
  }
  function openTemplate(id) {
    const all = loadTemplates();
    if (!id || !all[id]) {
      // New blank
      template = { id: 'tpl_' + _shortId(), name: '', canvas: { w: 1920, h: 1080 }, background: { color: '#0b0d12', image: '', fit: 'cover' }, components: [] };
    } else {
      template = JSON.parse(JSON.stringify(all[id]));
      // Back-compat: older templates may not have background
      if (!template.background) template.background = { color: '#0b0d12', image: '', fit: 'cover' };
    }
    document.getElementById('dgnTplName').value = template.name || '';
    applyCanvasBackground();
    // Reflect current assignment for this template
    let assignedTo = '';
    ['gids','fids','bids'].forEach(d => {
      if (localStorage.getItem(K_ASSIGN_PREFIX + d) === template.id) assignedTo = d;
    });
    document.getElementById('dgnAssign').value = assignedTo;
    selectedId = null;
    rerender();
    // Fresh history each time we open a template
    _history = []; _historyIdx = -1;
    commitHistory();
  }
  function refreshTemplatesDropdown() {
    const sel = document.getElementById('dgnTplPick');
    const all = loadTemplates();
    const cur = sel.value;
    sel.innerHTML = '<option value="">+ New blank template</option>' +
      Object.values(all).map(t => '<option value="' + _esc(t.id) + '">' + _esc(t.name || '(untitled)') + '</option>').join('');
    sel.value = (all[template.id] ? template.id : (cur || ''));
  }

  /* Duplicates the currently-open template into a new, unassigned copy and
   * switches to editing the copy. The original is left untouched (still
   * saved, still assigned to whatever display it was on). */
  function duplicateTemplate() {
    const copy = JSON.parse(JSON.stringify(template));
    copy.id = 'tpl_' + _shortId();
    copy.name = (template.name || 'Untitled').replace(/\s*\(copy( \d+)?\)\s*$/i, '') + ' (copy)';
    copy.components = (copy.components || []).map(c => Object.assign({}, c, { id: 'c_' + _shortId() }));
    if (!copy.background) copy.background = { color: '#0b0d12', image: '', fit: 'cover' };
    const all = loadTemplates();
    all[copy.id] = copy;
    try { localStorage.setItem(K_TEMPLATES, JSON.stringify(all)); }
    catch (e) { toast('Out of local storage — could not copy.'); return; }
    template = copy;
    document.getElementById('dgnTplName').value = copy.name;
    document.getElementById('dgnAssign').value = '';       // the copy isn't assigned
    const gl = document.getElementById('dgnGateLabel');    if (gl) gl.style.display = 'none';
    selectedId = null;
    refreshTemplatesDropdown();
    applyCanvasBackground();
    rerender();
    _history = []; _historyIdx = -1; commitHistory();
    toast('Copied to "' + copy.name + '" — editing the copy. The original is untouched.');
  }

  /* ── Canvas: add / move / resize / select components ───────────────────── */
  function addComponent(type, canvasX, canvasY) {
    const def = COMPONENTS[type];
    if (!def) return;
    const c = {
      id: 'c_' + _shortId(),
      type,
      x: Math.max(0, Math.round(canvasX - def.defaultSize.w / 2)),
      y: Math.max(0, Math.round(canvasY - def.defaultSize.h / 2)),
      w: def.defaultSize.w,
      h: def.defaultSize.h,
      props: JSON.parse(JSON.stringify(def.defaultProps))
    };
    template.components.push(c);
    selectedId = c.id;
    rerender();
    commitHistory();
    toast(_typeName(type) + ' added — click & drag to move, drag corner to resize.');
  }
  function _typeName(t) { return ({ text:'Text', clock:'Clock', image:'Image', flightList:'Flight List', ad:'Advertisement', message:'Visual Message', map:'Flight Map' })[t] || t; }

  function getComponent(id) { return template.components.find(c => c.id === id); }
  function selectComponent(id) { selectedId = id; rerender(); }

  /* rerender(skipProps): rebuilds the canvas. When skipProps is true the
   * properties panel is NOT rebuilt — essential while the user is typing in
   * a property field, otherwise the input would be destroyed on every
   * keystroke and lose focus (the "one character at a time" bug). */
  function rerender(skipProps) {
    const canvas = document.getElementById('dgnCanvas');
    const emptyEl = document.getElementById('dgnCanvasEmpty');
    // Clear existing component nodes
    canvas.querySelectorAll('.dgn-comp').forEach(n => {
      if (n._tick) clearInterval(n._tick);
      if (n._leafletMap) { try { n._leafletMap.remove(); } catch (e) {} n._leafletMap = null; }
      n.remove();
    });
    // Render components in template order (later = on top)
    template.components.forEach((c, idx) => {
      const def = COMPONENTS[c.type];
      if (!def) return;
      const el = document.createElement('div');
      el.className = 'dgn-comp';
      el.dataset.id = c.id;
      el.style.zIndex = String(10 + idx);
      // Position as percent of canvas so it scales with viewport
      const cw = template.canvas.w, ch = template.canvas.h;
      el.style.left   = (c.x / cw * 100) + '%';
      el.style.top    = (c.y / ch * 100) + '%';
      el.style.width  = (c.w / cw * 100) + '%';
      el.style.height = (c.h / ch * 100) + '%';
      def.render(el, c.props);
      if (c.id === selectedId) {
        el.classList.add('dgn-selected');
        // 8 handles: 4 corners + 4 edges. Each has a role used by drag math.
        ['nw','n','ne','e','se','s','sw','w'].forEach(role => {
          const h = document.createElement('div');
          h.className = 'dgn-handle dgn-handle-' + role;
          h.dataset.role = role;
          el.appendChild(h);
        });
      }
      wireComponent(el);
      canvas.appendChild(el);
    });
    emptyEl.style.display = template.components.length === 0 ? '' : 'none';
    if (!skipProps) renderProperties();
    updateReadout();
  }

  function wireComponent(el) {
    el.addEventListener('mousedown', onCompMouseDown);
    el.addEventListener('touchstart', onCompMouseDown, { passive: false });
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = el.dataset.id;
      if (selectedId !== id) selectComponent(id);
    });
  }
  // 8 handle roles → which edges/corner this drag affects.
  const HANDLE_ROLES = {
    nw: { dx: -1, dy: -1 },  n:  { dx:  0, dy: -1 },  ne: { dx:  1, dy: -1 },
    e:  { dx:  1, dy:  0 },                          se: { dx:  1, dy:  1 },
    s:  { dx:  0, dy:  1 },  sw: { dx: -1, dy:  1 },  w:  { dx: -1, dy:  0 }
  };
  function onCompMouseDown(e) {
    const point = _eventPoint(e);
    const el = e.currentTarget;
    const id = el.dataset.id;
    const c = getComponent(id);
    if (!c) return;
    selectedId = id;
    const roleRaw = (e.target.dataset && e.target.dataset.role) || 'move';
    const isHandle = !!HANDLE_ROLES[roleRaw];
    const cw = template.canvas.w, ch = template.canvas.h;
    const cvRect = document.getElementById('dgnCanvas').getBoundingClientRect();
    const scaleX = cw / cvRect.width;
    const scaleY = ch / cvRect.height;
    drag = {
      id, kind: isHandle ? 'resize' : 'move',
      role: roleRaw, scaleX, scaleY,
      startMX: point.x, startMY: point.y,
      startX: c.x, startY: c.y, startW: c.w, startH: c.h
    };
    el.classList.add('dgn-dragging');
    rerender();
    e.preventDefault();
    e.stopPropagation();
  }
  function _eventPoint(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  /* ── Snap support ──────────────────────────────────────────────────────── */
  // The toolbar grid-size selector writes to localStorage so it persists.
  function snapGridSize() {
    try { return parseInt(localStorage.getItem('fids_designer_snap') || '10', 10); } catch (e) { return 10; }
  }
  function setSnapGrid(n) {
    try { localStorage.setItem('fids_designer_snap', String(n)); } catch (e) {}
  }
  function snapTo(v) {
    const g = snapGridSize();
    if (!g || g < 1) return v;
    return Math.round(v / g) * g;
  }
  // Smart-guide thresholds (template-coord pixels)
  const GUIDE_TOL = 6;
  function snapWithGuides(c, guidesOut) {
    const cw = template.canvas.w, ch = template.canvas.h;
    let { x, y, w, h } = c;
    // Build candidate snap targets: other components' edges & centers + canvas
    const targetsX = [0, cw / 2, cw];
    const targetsY = [0, ch / 2, ch];
    template.components.forEach(o => {
      if (o.id === c.id) return;
      targetsX.push(o.x, o.x + o.w, o.x + o.w / 2);
      targetsY.push(o.y, o.y + o.h, o.y + o.h / 2);
    });
    // Snap x edges: left, hcenter, right
    const xEdges = [{ name: 'left', v: x }, { name: 'hcenter', v: x + w / 2 }, { name: 'right', v: x + w }];
    let bestX = null;
    xEdges.forEach(e => {
      targetsX.forEach(t => {
        const d = Math.abs(e.v - t);
        if (d <= GUIDE_TOL && (!bestX || d < bestX.d)) bestX = { d, edge: e.name, edgeV: e.v, t };
      });
    });
    if (bestX) {
      const delta = bestX.t - bestX.edgeV;
      x = x + delta;
      guidesOut.push({ orientation: 'v', at: bestX.t });
    }
    const yEdges = [{ name: 'top', v: y }, { name: 'vcenter', v: y + h / 2 }, { name: 'bottom', v: y + h }];
    let bestY = null;
    yEdges.forEach(e => {
      targetsY.forEach(t => {
        const d = Math.abs(e.v - t);
        if (d <= GUIDE_TOL && (!bestY || d < bestY.d)) bestY = { d, edge: e.name, edgeV: e.v, t };
      });
    });
    if (bestY) {
      const delta = bestY.t - bestY.edgeV;
      y = y + delta;
      guidesOut.push({ orientation: 'h', at: bestY.t });
    }
    return { x, y, w, h };
  }
  function drawGuides(guides) {
    const wrap = document.getElementById('dgnGuides');
    if (!wrap) return;
    const cw = template.canvas.w, ch = template.canvas.h;
    wrap.innerHTML = guides.map(g => {
      if (g.orientation === 'v') {
        const left = (g.at / cw * 100) + '%';
        return '<div class="dgn-guide dgn-guide-v" style="left:' + left + ';"></div>';
      } else {
        const top = (g.at / ch * 100) + '%';
        return '<div class="dgn-guide dgn-guide-h" style="top:' + top + ';"></div>';
      }
    }).join('');
  }

  function onPointerMove(e) {
    if (!drag) return;
    const p = _eventPoint(e);
    const c = getComponent(drag.id);
    if (!c) return;
    const dx = (p.x - drag.startMX) * drag.scaleX;
    const dy = (p.y - drag.startMY) * drag.scaleY;
    let x = c.x, y = c.y, w = c.w, h = c.h;
    if (drag.kind === 'move') {
      x = drag.startX + dx;
      y = drag.startY + dy;
    } else {
      const r = HANDLE_ROLES[drag.role] || { dx: 1, dy: 1 };
      if (r.dx === 1) w = drag.startW + dx;
      else if (r.dx === -1) { x = drag.startX + dx; w = drag.startW - dx; }
      if (r.dy === 1) h = drag.startH + dy;
      else if (r.dy === -1) { y = drag.startY + dy; h = drag.startH - dy; }
    }
    // Grid snap first
    x = snapTo(x); y = snapTo(y); w = snapTo(w); h = snapTo(h);
    // Smart-guides
    const guides = [];
    const snapped = snapWithGuides({ id: drag.id, x, y, w, h }, guides);
    x = snapped.x; y = snapped.y; w = snapped.w; h = snapped.h;
    // Clamp
    const cw = template.canvas.w, ch = template.canvas.h;
    w = Math.max(40, w); h = Math.max(24, h);
    x = Math.max(0, Math.min(cw - w, Math.round(x)));
    y = Math.max(0, Math.min(ch - h, Math.round(y)));
    w = Math.round(Math.min(w, cw - x));
    h = Math.round(Math.min(h, ch - y));
    c.x = x; c.y = y; c.w = w; c.h = h;
    // Update DOM cheaply
    const el = document.querySelector('[data-id="' + c.id + '"]');
    if (el) {
      el.style.left   = (c.x / cw * 100) + '%';
      el.style.top    = (c.y / ch * 100) + '%';
      el.style.width  = (c.w / cw * 100) + '%';
      el.style.height = (c.h / ch * 100) + '%';
    }
    drawGuides(guides);
    updateReadout();
    if (e.cancelable) e.preventDefault();
  }
  function onPointerUp() {
    if (!drag) return;
    drag = null;
    document.querySelectorAll('.dgn-dragging').forEach(n => n.classList.remove('dgn-dragging'));
    drawGuides([]);
    renderProperties();
    commitHistory();
  }

  /* ── Live readout in the canvas footer ────────────────────────────────── */
  function updateReadout() {
    const info = document.getElementById('dgnCanvasInfo');
    if (!info) return;
    const c = selectedId ? getComponent(selectedId) : null;
    if (c) {
      info.textContent = c.x + ', ' + c.y + '   |   ' + c.w + ' × ' + c.h + '   |   ' + _typeName(c.type);
    } else {
      info.textContent = template.canvas.w + ' × ' + template.canvas.h + '  (grid: ' + (snapGridSize() || 'off') + ')';
    }
  }

  /* ── Z-order + quick alignment ────────────────────────────────────────── */
  function moveZ(delta) {
    if (!selectedId) return;
    const idx = template.components.findIndex(c => c.id === selectedId);
    if (idx < 0) return;
    const ni = Math.max(0, Math.min(template.components.length - 1, idx + delta));
    if (ni === idx) return;
    const [c] = template.components.splice(idx, 1);
    template.components.splice(ni, 0, c);
    rerender();
    commitHistory();
  }
  function alignSelected(which) {
    const c = getComponent(selectedId); if (!c) return;
    const cw = template.canvas.w, ch = template.canvas.h;
    if (which === 'hcenter') c.x = Math.round((cw - c.w) / 2);
    if (which === 'vcenter') c.y = Math.round((ch - c.h) / 2);
    if (which === 'left')    c.x = 0;
    if (which === 'right')   c.x = cw - c.w;
    if (which === 'top')     c.y = 0;
    if (which === 'bottom')  c.y = ch - c.h;
    rerender();
    commitHistory();
  }

  /* ── Properties panel ──────────────────────────────────────────────────── */
  function renderProperties() {
    const body = document.getElementById('dgnPropsBody');
    const actions = document.getElementById('dgnPropsActions');
    const title = document.getElementById('dgnPropsTitle');
    const c = selectedId ? getComponent(selectedId) : null;
    if (!c) {
      // Show template-level settings when no component is selected.
      title.textContent = 'Template settings';
      const bg = template.background || { color: '#0b0d12', image: '', fit: 'cover' };
      body.innerHTML =
        '<p class="dgn-props-empty" style="margin-bottom:14px;">Tip: click a component on the canvas to edit it. These settings apply to the whole template.</p>' +
        '<div class="dgn-props-section"><h4>Background</h4>' +
          '<div class="dgn-field-row">' +
            '<div class="dgn-field"><label>Color</label><input type="color" id="dgnBgColor" value="' + _esc(bg.color || '#0b0d12') + '"></div>' +
            '<div class="dgn-field"><label>Fit</label><select id="dgnBgFit">' +
              ['cover','contain','center','tile'].map(o => '<option value="' + o + '"' + (bg.fit === o ? ' selected' : '') + '>' + o + '</option>').join('') +
              '</select></div>' +
          '</div>' +
          '<div class="dgn-field"><label>Image (optional, overrides color)</label>' +
            (bg.image
              ? '<img src="' + _esc(bg.image) + '" class="dgn-imgpick-prev">'
              : '<div class="dgn-imgpick-empty">No image</div>') +
            '<div class="dgn-imgpick-actions">' +
              '<button type="button" class="dgn-btn-secondary" id="dgnBgPick">' + (bg.image ? 'Replace image' : 'Pick image…') + '</button>' +
              (bg.image ? '<button type="button" class="dgn-btn-secondary" id="dgnBgClear">Clear</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="dgn-props-section"><h4>Canvas</h4>' +
          '<div class="dgn-field-row">' +
            '<div class="dgn-field"><label>Width</label><input type="number" id="dgnCvW" min="100" max="8192" value="' + (template.canvas.w || 1920) + '"></div>' +
            '<div class="dgn-field"><label>Height</label><input type="number" id="dgnCvH" min="100" max="8192" value="' + (template.canvas.h || 1080) + '"></div>' +
          '</div>' +
        '</div>';
      actions.hidden = true;
      // Wire template-level handlers
      const tBg = document.getElementById('dgnBgColor');
      if (tBg) tBg.addEventListener('input', () => { template.background = template.background || {}; template.background.color = tBg.value; applyCanvasBackground(); });
      const tFit = document.getElementById('dgnBgFit');
      if (tFit) tFit.addEventListener('change', () => { template.background = template.background || {}; template.background.fit = tFit.value; applyCanvasBackground(); });
      const tPick = document.getElementById('dgnBgPick');
      if (tPick) tPick.addEventListener('click', () => {
        pickImageFile().then(dataUrl => { template.background = template.background || {}; template.background.image = dataUrl; renderProperties(); applyCanvasBackground(); }).catch(()=>{});
      });
      const tClr = document.getElementById('dgnBgClear');
      if (tClr) tClr.addEventListener('click', () => { template.background = template.background || {}; template.background.image = ''; renderProperties(); applyCanvasBackground(); });
      const tW = document.getElementById('dgnCvW'), tH = document.getElementById('dgnCvH');
      if (tW) tW.addEventListener('input', () => { template.canvas.w = parseInt(tW.value, 10) || 1920; rerender(); });
      if (tH) tH.addEventListener('input', () => { template.canvas.h = parseInt(tH.value, 10) || 1080; rerender(); });
      return;
    }
    actions.hidden = false;
    const def = COMPONENTS[c.type];
    title.textContent = _typeName(c.type) + ' properties';

    // Position section is always shown
    let html =
      '<div class="dgn-props-section"><h4>Position &amp; size</h4>' +
      '<div class="dgn-field-row">' +
        '<div class="dgn-field"><label>X</label><input type="number" data-pos="x" value="' + c.x + '"></div>' +
        '<div class="dgn-field"><label>Y</label><input type="number" data-pos="y" value="' + c.y + '"></div>' +
      '</div>' +
      '<div class="dgn-field-row">' +
        '<div class="dgn-field"><label>Width</label><input type="number" data-pos="w" value="' + c.w + '"></div>' +
        '<div class="dgn-field"><label>Height</label><input type="number" data-pos="h" value="' + c.h + '"></div>' +
      '</div></div>';

    // Component-specific fields from schema
    const schema = def.schema || [];
    let section = null;
    let sectionHtml = '';
    schema.forEach(item => {
      if (item.section) {
        if (section) html += '<div class="dgn-props-section"><h4>' + _esc(section) + '</h4>' + sectionHtml + '</div>';
        section = item.section; sectionHtml = '';
        return;
      }
      if (item.fieldType === 'placeholder-hint') {
        // Close any open section, then drop the hint outside sections
        if (section) { html += '<div class="dgn-props-section"><h4>' + _esc(section) + '</h4>' + sectionHtml + '</div>'; section = null; sectionHtml = ''; }
        html += _renderPlaceholderHint();
        return;
      }
      sectionHtml += _renderField(item, c);
    });
    if (section) html += '<div class="dgn-props-section"><h4>' + _esc(section) + '</h4>' + sectionHtml + '</div>';

    body.innerHTML = html;
    body.querySelectorAll('[data-pos]').forEach(inp => inp.addEventListener('input', onPosChange));
    // Placeholder chips: click to copy, with a temporary "Copied!" hint
    body.querySelectorAll('.dgn-ph-chip').forEach(chip => chip.addEventListener('click', () => {
      const tag = chip.dataset.phTag;
      try { navigator.clipboard.writeText(tag); } catch (e) {}
      const oldLabel = chip.querySelector('.dgn-ph-desc').textContent;
      chip.querySelector('.dgn-ph-desc').textContent = 'Copied!';
      setTimeout(() => { chip.querySelector('.dgn-ph-desc').textContent = oldLabel; }, 900);
    }));
    body.querySelectorAll('[data-prop]').forEach(inp => inp.addEventListener('input', onPropChange));

    // Image picker (Image component)
    body.querySelectorAll('[data-imgpick]').forEach(btn => btn.addEventListener('click', () => {
      pickImageFile().then(dataUrl => {
        const cc = getComponent(selectedId); if (!cc) return;
        cc.props[btn.dataset.imgpick] = dataUrl;
        rerender();
      }).catch(()=>{});
    }));
    body.querySelectorAll('[data-imgclear]').forEach(btn => btn.addEventListener('click', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      cc.props[btn.dataset.imgclear] = '';
      rerender();
    }));

    // Checklist (Flight List columns)
    body.querySelectorAll('[data-check]').forEach(cb => cb.addEventListener('change', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const key = cb.dataset.check, v = cb.dataset.checkv;
      cc.props[key] = cc.props[key] || {};
      cc.props[key][v] = cb.checked;
      rerender();
    }));

    // Per-column widths (Flight List)
    body.querySelectorAll('[data-colw]').forEach(inp => inp.addEventListener('input', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      cc.props.colWidths = cc.props.colWidths || {};
      const v = inp.value.trim();
      cc.props.colWidths[inp.dataset.colw] = v === '' ? 0 : (parseInt(v, 10) || 0);
      // Cheap inline rerender to avoid losing focus on the input the user is typing in.
      const compEl = document.querySelector('[data-id="' + cc.id + '"]');
      if (compEl) COMPONENTS.flightList.render(compEl, cc.props);
    }));

    // Status colors editor (Flight List)
    const scAdd = body.querySelector('.dgn-sc-add');
    if (scAdd) scAdd.addEventListener('click', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      cc.props.statusColors = cc.props.statusColors || {};
      let n = 1, key = 'new status';
      while (key in cc.props.statusColors) { key = 'new status ' + (++n); }
      cc.props.statusColors[key] = '#10b981';
      rerender();
    });
    body.querySelectorAll('[data-sc-rm]').forEach(b => b.addEventListener('click', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(b.dataset.scRm, 10);
      const keys = Object.keys(cc.props.statusColors || {});
      if (keys[idx]) delete cc.props.statusColors[keys[idx]];
      rerender();
    }));
    body.querySelectorAll('[data-sc-status]').forEach(inp => inp.addEventListener('input', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(inp.dataset.scStatus, 10);
      const oldKeys = Object.keys(cc.props.statusColors || {});
      const oldKey = oldKeys[idx];
      if (!oldKey) return;
      const newKey = (inp.value || '').toLowerCase();
      if (newKey === oldKey) return;
      // Rebuild preserving order
      const next = {};
      oldKeys.forEach((k, i) => { next[i === idx ? newKey : k] = cc.props.statusColors[k]; });
      cc.props.statusColors = next;
      const compEl = document.querySelector('[data-id="' + cc.id + '"]');
      if (compEl) COMPONENTS.flightList.render(compEl, cc.props);
    }));
    body.querySelectorAll('[data-sc-color]').forEach(inp => inp.addEventListener('input', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(inp.dataset.scColor, 10);
      const keys = Object.keys(cc.props.statusColors || {});
      if (keys[idx]) cc.props.statusColors[keys[idx]] = inp.value;
      const compEl = document.querySelector('[data-id="' + cc.id + '"]');
      if (compEl) COMPONENTS.flightList.render(compEl, cc.props);
    }));

    // Remarks mapping editor (Flight List)
    const rmAdd = body.querySelector('.dgn-rm-add');
    if (rmAdd) rmAdd.addEventListener('click', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      cc.props.remarksMap = cc.props.remarksMap || {};
      let n = 1, key = 'NEW';
      while (key in cc.props.remarksMap) { key = 'NEW' + (++n); }
      cc.props.remarksMap[key] = '';
      rerender();
    });
    body.querySelectorAll('[data-rm-rm]').forEach(b => b.addEventListener('click', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(b.dataset.rmRm, 10);
      const keys = Object.keys(cc.props.remarksMap || {});
      if (keys[idx]) delete cc.props.remarksMap[keys[idx]];
      rerender();
    }));
    body.querySelectorAll('[data-rm-code]').forEach(inp => inp.addEventListener('input', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(inp.dataset.rmCode, 10);
      const oldKeys = Object.keys(cc.props.remarksMap || {});
      const oldKey = oldKeys[idx];
      if (!oldKey) return;
      const newKey = (inp.value || '').toUpperCase();
      if (newKey === oldKey) return;
      const next = {};
      oldKeys.forEach((k, i) => { next[i === idx ? newKey : k] = cc.props.remarksMap[k]; });
      cc.props.remarksMap = next;
      const compEl = document.querySelector('[data-id="' + cc.id + '"]');
      if (compEl) COMPONENTS.flightList.render(compEl, cc.props);
    }));
    body.querySelectorAll('[data-rm-text]').forEach(inp => inp.addEventListener('input', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(inp.dataset.rmText, 10);
      const keys = Object.keys(cc.props.remarksMap || {});
      if (keys[idx]) cc.props.remarksMap[keys[idx]] = inp.value;
      const compEl = document.querySelector('[data-id="' + cc.id + '"]');
      if (compEl) COMPONENTS.flightList.render(compEl, cc.props);
    }));

    // Ad items list editor
    body.querySelector('.dgn-ad-add') && body.querySelector('.dgn-ad-add').addEventListener('click', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      cc.props.items = cc.props.items || [];
      cc.props.items.push({ type: 'text', text: 'New message', bg: '#0b3d91', color: '#ffffff' });
      rerender();
    });
    body.querySelectorAll('[data-ad-rm]').forEach(b => b.addEventListener('click', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(b.dataset.adRm, 10);
      cc.props.items.splice(idx, 1);
      rerender();
    }));
    body.querySelectorAll('[data-ad-type]').forEach(s => s.addEventListener('change', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(s.dataset.adType, 10);
      cc.props.items[idx].type = s.value;
      rerender();
    }));
    body.querySelectorAll('[data-ad-text]').forEach(ta => ta.addEventListener('input', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      cc.props.items[parseInt(ta.dataset.adText, 10)].text = ta.value;
      // Don't full-rerender on every keystroke; just update the live render
      const compEl = document.querySelector('[data-id="' + cc.id + '"]');
      if (compEl) COMPONENTS.ad.render(compEl, cc.props);
    }));
    body.querySelectorAll('[data-ad-bg]').forEach(inp => inp.addEventListener('input', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      cc.props.items[parseInt(inp.dataset.adBg, 10)].bg = inp.value;
      const compEl = document.querySelector('[data-id="' + cc.id + '"]');
      if (compEl) COMPONENTS.ad.render(compEl, cc.props);
    }));
    body.querySelectorAll('[data-ad-color]').forEach(inp => inp.addEventListener('input', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      cc.props.items[parseInt(inp.dataset.adColor, 10)].color = inp.value;
      const compEl = document.querySelector('[data-id="' + cc.id + '"]');
      if (compEl) COMPONENTS.ad.render(compEl, cc.props);
    }));
    body.querySelectorAll('[data-ad-pick]').forEach(b => b.addEventListener('click', () => {
      const cc = getComponent(selectedId); if (!cc) return;
      const idx = parseInt(b.dataset.adPick, 10);
      pickImageFile().then(dataUrl => {
        cc.props.items[idx].src = dataUrl;
        rerender();
      }).catch(()=>{});
    }));
  }

  /* Reusable image picker: returns a Promise<dataUrl> from a file input. */
  function pickImageFile() {
    return new Promise((resolve, reject) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        document.body.removeChild(inp);
        if (!f) return reject('canceled');
        const r = new FileReader();
        r.onerror = () => reject(r.error);
        r.onload = () => resolve(r.result);
        r.readAsDataURL(f);
      };
      inp.click();
    });
  }
  function _renderField(item, c) {
    if (item.row) {
      return '<div class="dgn-field-row">' + item.row.map(f => _renderOneField(f, c)).join('') + '</div>';
    }
    return _renderOneField(item, c);
  }
  function _renderOneField(f, c) {
    const v = c.props[f.key];
    let input = '';
    if (f.type === 'textarea') input = '<textarea data-prop="' + f.key + '">' + _esc(v == null ? '' : String(v)) + '</textarea>';
    else if (f.type === 'select') {
      input = '<select data-prop="' + f.key + '">' +
        f.options.map(o => '<option value="' + _esc(String(o.v)) + '"' + (String(o.v) === String(v) ? ' selected' : '') + '>' + _esc(o.l) + '</option>').join('') +
        '</select>';
    }
    else if (f.type === 'color') input = '<input type="color" data-prop="' + f.key + '" value="' + _esc(v || '#ffffff') + '">';
    else if (f.type === 'number') {
      const step = f.step != null ? ' step="' + f.step + '"' : '';
      input = '<input type="number" data-prop="' + f.key + '" value="' + _esc(v == null ? '' : v) + (f.min!=null?' min="'+f.min+'"':'') + (f.max!=null?' max="'+f.max+'"':'') + step + '>';
    }
    else if (f.type === 'image-picker') {
      input =
        '<div class="dgn-imgpick">' +
          (v ? '<img src="' + _esc(v) + '" class="dgn-imgpick-prev">' : '<div class="dgn-imgpick-empty">No image</div>') +
          '<div class="dgn-imgpick-actions">' +
            '<button type="button" class="dgn-btn-secondary" data-imgpick="' + f.key + '">Replace image</button>' +
            (v ? '<button type="button" class="dgn-btn-secondary" data-imgclear="' + f.key + '">Clear</button>' : '') +
          '</div>' +
        '</div>';
    }
    else if (f.type === 'checklist') {
      const cur = v || {};
      input = '<div class="dgn-checklist">' +
        f.options.map(o =>
          '<label class="dgn-check"><input type="checkbox" data-check="' + f.key + '" data-checkv="' + _esc(o.v) + '"' + (cur[o.v] ? ' checked' : '') + '> ' + _esc(o.l) + '</label>'
        ).join('') +
      '</div>';
    }
    else if (f.type === 'ad-items') {
      const items = Array.isArray(v) ? v : [];
      input = '<div class="dgn-aditems">' +
        items.map((it, idx) =>
          '<div class="dgn-aditem">' +
            '<div class="dgn-aditem-h">' +
              '<select data-ad-type="' + idx + '">' +
                '<option value="text"'  + (it.type==='text' ?' selected':'') + '>Text</option>' +
                '<option value="image"' + (it.type==='image'?' selected':'') + '>Image</option>' +
              '</select>' +
              '<button type="button" class="dgn-ad-rm" data-ad-rm="' + idx + '">Remove</button>' +
            '</div>' +
            (it.type === 'image'
              ? '<button type="button" class="dgn-btn-secondary dgn-ad-pick" data-ad-pick="' + idx + '" style="width:100%;margin-top:6px;">' + (it.src ? 'Replace image' : 'Pick image…') + '</button>' +
                (it.src ? '<img src="' + _esc(it.src) + '" class="dgn-imgpick-prev" style="margin-top:6px;">' : '')
              : '<textarea data-ad-text="' + idx + '" placeholder="Message text…">' + _esc(it.text || '') + '</textarea>'
            ) +
            '<div class="dgn-field-row" style="margin-top:6px;">' +
              '<div class="dgn-field"><label>Background</label><input type="color" data-ad-bg="' + idx + '" value="' + _esc(it.bg || '#0b3d91') + '"></div>' +
              '<div class="dgn-field"><label>Text color</label><input type="color" data-ad-color="' + idx + '" value="' + _esc(it.color || '#ffffff') + '"></div>' +
            '</div>' +
          '</div>'
        ).join('') +
        '<button type="button" class="dgn-btn-secondary dgn-ad-add" style="width:100%;margin-top:6px;">+ Add another item</button>' +
      '</div>';
    }
    else if (f.type === 'font') {
      const list = (window.FidsDesignerFonts) || [{v:'Inter',l:'Inter'},{v:'system',l:'System'}];
      input = '<select data-prop="' + f.key + '">' +
        list.map(o => '<option value="' + _esc(o.v) + '"' + (String(o.v) === String(v || '') ? ' selected' : '') + '>' + _esc(o.l) + '</option>').join('') +
      '</select>';
    }
    else if (f.type === 'status-colors') {
      const map = (v && typeof v === 'object') ? v : {};
      const entries = Object.keys(map);
      input = '<div class="dgn-statuscolors">' +
        entries.map((status, idx) =>
          '<div class="dgn-statuscolor-row">' +
            '<input type="text" data-sc-status="' + idx + '" value="' + _esc(status) + '" placeholder="Status word (e.g. boarding)">' +
            '<input type="color" data-sc-color="' + idx + '" value="' + _esc(map[status] || '#ffffff') + '">' +
            '<button type="button" class="dgn-ad-rm" data-sc-rm="' + idx + '" title="Remove">✕</button>' +
          '</div>'
        ).join('') +
        '<button type="button" class="dgn-btn-secondary dgn-sc-add" style="width:100%;margin-top:6px;">+ Add status color</button>' +
        '<div class="dgn-imgpick-hint" style="color:#9ca3af;font-size:11px;margin-top:6px;line-height:1.4;">Matches the status text (case-insensitive). Used to color the Status cell.</div>' +
      '</div>';
      return '<div class="dgn-field">' + (f.label ? '<label>' + _esc(f.label) + '</label>' : '') + input + '</div>';
    }
    else if (f.type === 'remarks-map') {
      const map = (v && typeof v === 'object') ? v : {};
      const entries = Object.keys(map);
      input = '<div class="dgn-statuscolors">' +
        entries.map((code, idx) =>
          '<div class="dgn-remark-row">' +
            '<input type="text" data-rm-code="' + idx + '" value="' + _esc(code) + '" placeholder="CODE" style="text-transform:uppercase;">' +
            '<input type="text" data-rm-text="' + idx + '" value="' + _esc(map[code] || '') + '" placeholder="Friendly text">' +
            '<button type="button" class="dgn-ad-rm" data-rm-rm="' + idx + '" title="Remove">✕</button>' +
          '</div>'
        ).join('') +
        '<button type="button" class="dgn-btn-secondary dgn-rm-add" style="width:100%;margin-top:6px;">+ Add mapping</button>' +
        '<div class="dgn-imgpick-hint" style="color:#9ca3af;font-size:11px;margin-top:6px;line-height:1.4;">Replaces the raw code in the Status column with the friendly text. Case-insensitive exact match.</div>' +
      '</div>';
      return '<div class="dgn-field">' + (f.label ? '<label>' + _esc(f.label) + '</label>' : '') + input + '</div>';
    }
    else if (f.type === 'col-widths') {
      // One width input per ACTIVE Flight List column. Blank/0 = auto.
      const cols = c.props.cols || {};
      const order = ['flight','airline','destination','time','status','gate'];
      const labels = { flight:'Flight', airline:'Airline', destination:'Destination', time:'Time', status:'Status', gate:'Gate' };
      const widths = c.props.colWidths || {};
      const rows = order.filter(k => cols[k]);
      if (rows.length === 0) return '<div class="dgn-field"><label style="color:#6b7280;">No columns selected yet.</label></div>';
      input = '<div class="dgn-colwidths">' +
        rows.map(k =>
          '<div class="dgn-colwidth-row">' +
            '<label>' + _esc(labels[k]) + '</label>' +
            '<input type="number" min="0" max="2000" data-colw="' + k + '" value="' + _esc(widths[k] == null ? '' : widths[k]) + '" placeholder="auto">' +
            '<span class="dgn-colwidth-hint">px (0 = auto)</span>' +
          '</div>'
        ).join('') +
      '</div>';
      return '<div class="dgn-field">' + (f.label ? '<label>' + _esc(f.label) + '</label>' : '') + input + '</div>';
    }
    else input = '<input type="text" data-prop="' + f.key + '" value="' + _esc(v == null ? '' : v) + '">';
    return '<div class="dgn-field">' + (f.label ? '<label>' + _esc(f.label) + '</label>' : '') + input + '</div>';
  }
  // Special schema entry { fieldType: 'placeholder-hint' } renders a small
  // dynamic-fields helper that explains what variables can be inserted.
  function _renderPlaceholderHint() {
    const examples = [
      { tag: '{flight.flight}',       d: 'Flight number (e.g. AC8421)' },
      { tag: '{flight.destination}',  d: 'Destination city' },
      { tag: '{flight.time}',         d: 'Scheduled time' },
      { tag: '{flight.actualTime}',   d: 'Actual time (live)' },
      { tag: '{flight.status}',       d: 'Status (Boarding, Delayed…)' },
      { tag: '{flight.gate}',         d: 'Gate from the flight' },
      { tag: '{flight.terminal}',     d: 'Terminal' },
      { tag: '{flight.belt}',         d: 'Baggage belt' },
      { tag: '{flight.checkIn}',      d: 'Check-in desks' },
      { tag: '{flight.airline}',      d: 'Airline code (AC, WS…)' },
      { tag: '{flight.airlineName}',  d: 'Airline full name' },
      { tag: '{flight.aircraft}',     d: 'Aircraft type' },
      { tag: '{flight.registration}', d: 'Tail / registration' },
      { tag: '{flight.callsign}',     d: 'ATC call-sign' },
      { tag: '{flight.altitude}',     d: 'Live altitude' },
      { tag: '{flight.speed}',        d: 'Live ground speed' },
      { tag: '{flight.duration}',     d: 'Flight duration' },
      { tag: '{gate}',                d: "This display's assigned gate" },
      { tag: '{airport.code}',        d: 'Airport IATA (YQM)' },
      { tag: '{airport.name}',        d: 'Airport name' },
      { tag: '{time}',                d: 'Current time' },
      { tag: '{date}',                d: 'Current date' }
    ];
    return '<div class="dgn-props-section dgn-ph-section"><h4>Dynamic fields you can insert</h4>' +
      '<div class="dgn-ph-list">' +
        examples.map(e =>
          '<button type="button" class="dgn-ph-chip" data-ph-tag="' + _esc(e.tag) + '" title="' + _esc(e.d) + '">' +
            '<span class="dgn-ph-tag">' + _esc(e.tag) + '</span>' +
            '<span class="dgn-ph-desc">' + _esc(e.d) + '</span>' +
          '</button>'
        ).join('') +
      '</div>' +
      '<div class="dgn-ph-help">Click any chip to copy it. Type it into your text where you want the value to appear. Live data updates automatically.</div>' +
    '</div>';
  }
  function onPosChange(e) {
    const c = getComponent(selectedId); if (!c) return;
    const k = e.target.dataset.pos;
    const v = parseInt(e.target.value, 10) || 0;
    c[k] = v;
    rerender(true);   // skip props rebuild so the X/Y/W/H input keeps focus
    commitHistory(true);
  }
  function onPropChange(e) {
    const c = getComponent(selectedId); if (!c) return;
    const k = e.target.dataset.prop;
    let v = e.target.value;
    if (e.target.type === 'number') v = parseFloat(v) || 0;
    else if (v === 'true') v = true; else if (v === 'false') v = false;
    c.props[k] = v;
    rerender(true);   // skip props rebuild so text/textarea inputs keep focus
    commitHistory(true);
  }
  function deleteSelected() {
    if (!selectedId) return;
    if (!confirm('Delete this component?')) return;
    template.components = template.components.filter(c => c.id !== selectedId);
    selectedId = null;
    rerender();
    commitHistory();
  }

  /* ── Palette → canvas drag ─────────────────────────────────────────────── */
  function wirePaletteDrag() {
    document.querySelectorAll('.dgn-comp-tile').forEach(t => {
      t.addEventListener('dragstart', e => {
        e.dataTransfer.setData('dgn/comp', t.dataset.comp);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
    const cv = document.getElementById('dgnCanvas');
    cv.addEventListener('dragover', e => {
      if (!Array.from(e.dataTransfer.types || []).includes('dgn/comp')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      cv.classList.add('dgn-drop-active');
    });
    cv.addEventListener('dragleave', e => {
      if (e.target === cv) cv.classList.remove('dgn-drop-active');
    });
    cv.addEventListener('drop', e => {
      cv.classList.remove('dgn-drop-active');
      const type = e.dataTransfer.getData('dgn/comp');
      if (!type) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const cw = template.canvas.w, ch = template.canvas.h;
      const x = (e.clientX - r.left) * (cw / r.width);
      const y = (e.clientY - r.top)  * (ch / r.height);
      addComponent(type, x, y);
    });
    // Click empty canvas → deselect
    cv.addEventListener('click', e => {
      if (e.target === cv || e.target.id === 'dgnCanvasEmpty' || e.target.closest('#dgnCanvasEmpty')) {
        selectedId = null; rerender();
      }
    });
  }

  /* ── Mobile drawers ────────────────────────────────────────────────────── */
  function wireMobileDrawers() {
    document.querySelectorAll('[data-open-drawer]').forEach(b => {
      b.addEventListener('click', () => openDrawer(b.dataset.openDrawer));
    });
    document.querySelectorAll('[data-drawer]').forEach(b => {
      b.addEventListener('click', () => closeDrawers());
    });
    document.getElementById('dgnMobileSave').addEventListener('click', saveTemplate);
  }
  function openDrawer(which) {
    closeDrawers();
    const id = which === 'palette' ? 'dgnPalette' : 'dgnProps';
    document.getElementById(id).classList.add('dgn-open');
    document.body.classList.add('dgn-drawer-open');
  }
  function closeDrawers() {
    document.getElementById('dgnPalette').classList.remove('dgn-open');
    document.getElementById('dgnProps').classList.remove('dgn-open');
    document.body.classList.remove('dgn-drawer-open');
  }

  /* ── Toast ─────────────────────────────────────────────────────────────── */
  function toast(msg) {
    const el = document.getElementById('dgnToast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
  }
  function _esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /* ── Preview: jump to gids/fids/bids with this template applied ────────── */
  function preview() {
    const assign = document.getElementById('dgnAssign').value || 'gids';
    saveTemplate();
    window.open(assign + '.html', '_blank');
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */
  function init() {
    // Bootstrap. If the URL carries ?open=<id> (e.g. arriving from a screen
    // capture), open that template. Otherwise load the assigned/most-recent
    // template, or start blank and offer the Starters modal.
    const all = loadTemplates();
    const ids = Object.keys(all);
    let openParam = '';
    try {
      const m = /[?&]open=([^&]+)/.exec(location.search);
      if (m) openParam = decodeURIComponent(m[1]);
    } catch (e) {}
    if (openParam && all[openParam]) {
      openTemplate(openParam);
      toast('Opened your captured screen — refine it and Save when ready.');
    } else if (ids.length) {
      let chosen = '';
      ['gids','fids','bids'].forEach(d => { const t = localStorage.getItem(K_ASSIGN_PREFIX + d); if (t && all[t] && !chosen) chosen = t; });
      openTemplate(chosen || ids[ids.length - 1]);
    } else {
      openTemplate('');
    }
    refreshTemplatesDropdown();
    paintStarterModal();
    if (ids.length === 0 && !openParam) openStarterModal();   // first-run: offer starters

    document.getElementById('dgnSave').addEventListener('click', saveTemplate);
    document.getElementById('dgnPreview').addEventListener('click', preview);
    document.getElementById('dgnTplPick').addEventListener('change', e => openTemplate(e.target.value));
    document.getElementById('dgnDeleteBtn').addEventListener('click', deleteSelected);
    document.getElementById('dgnCopyBtn').addEventListener('click', duplicateTemplate);
    document.getElementById('dgnStartersBtn').addEventListener('click', openStarterModal);
    document.querySelectorAll('[data-close-starter]').forEach(b => b.addEventListener('click', closeStarterModal));
    document.getElementById('dgnUndo').addEventListener('click', undo);
    document.getElementById('dgnRedo').addEventListener('click', redo);
    document.getElementById('dgnDupeBtn').addEventListener('click', duplicateSelected);
    _updateUndoButtons();

    // Snap-grid selector — value persisted in localStorage by setSnapGrid().
    const snapSel = document.getElementById('dgnSnap');
    if (snapSel) {
      snapSel.value = String(snapGridSize());
      snapSel.addEventListener('change', () => { setSnapGrid(parseInt(snapSel.value, 10) || 0); updateReadout(); });
    }
    // Apply-to + display gate
    const assignSel = document.getElementById('dgnAssign');
    const gateLbl   = document.getElementById('dgnGateLabel');
    const gateInp   = document.getElementById('dgnDisplayGate');
    function syncGateVisibility() {
      const d = assignSel.value;
      if (!d) { gateLbl.style.display = 'none'; return; }
      gateLbl.style.display = '';
      try { gateInp.value = localStorage.getItem(K_DISPLAY_GATE + d) || ''; } catch (e) {}
    }
    if (assignSel) {
      assignSel.addEventListener('change', syncGateVisibility);
      syncGateVisibility();
    }
    if (gateInp) gateInp.addEventListener('input', () => {
      const d = assignSel.value;
      if (!d) return;
      const v = (gateInp.value || '').trim().toUpperCase();
      try {
        if (v) localStorage.setItem(K_DISPLAY_GATE + d, v);
        else   localStorage.removeItem(K_DISPLAY_GATE + d);
      } catch (e) {}
    });
    // Alignment + Z-order buttons inside the properties panel
    document.querySelectorAll('[data-align]').forEach(b =>
      b.addEventListener('click', () => alignSelected(b.dataset.align)));
    document.querySelectorAll('[data-z]').forEach(b =>
      b.addEventListener('click', () => moveZ(parseInt(b.dataset.z, 10) || 0)));
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp);
    document.addEventListener('keydown', e => {
      const inField = (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
      const cmd = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd + Z = Undo, Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo
      if (cmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        undo();
        return;
      }
      if (cmd && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        if (inField) return;
        e.preventDefault();
        redo();
        return;
      }
      // Ctrl/Cmd + D = Duplicate selected
      if (cmd && e.key.toLowerCase() === 'd' && selectedId) {
        if (inField) return;
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && !inField) {
          deleteSelected();
        }
      } else if (e.key === 'Escape') {
        selectedId = null; rerender(); closeDrawers();
      } else if (e.key.startsWith('Arrow') && selectedId
                 && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        // Arrow keys nudge the selected component. Shift = 10×.
        const c = getComponent(selectedId); if (!c) return;
        const step = e.shiftKey ? 10 : 1;
        const cw = template.canvas.w, ch = template.canvas.h;
        if (e.key === 'ArrowLeft')  c.x = Math.max(0, c.x - step);
        if (e.key === 'ArrowRight') c.x = Math.min(cw - c.w, c.x + step);
        if (e.key === 'ArrowUp')    c.y = Math.max(0, c.y - step);
        if (e.key === 'ArrowDown')  c.y = Math.min(ch - c.h, c.y + step);
        rerender();
        e.preventDefault();
      }
    });

    wirePaletteDrag();
    wireMobileDrawers();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Expose for the live-side renderer
  window.FidsTemplates = {
    getAssigned(display) {
      const id = localStorage.getItem(K_ASSIGN_PREFIX + display);
      if (!id) return null;
      const all = loadTemplates();
      return all[id] || null;
    },
    COMPONENTS // shared with template-renderer.js
  };
})();
