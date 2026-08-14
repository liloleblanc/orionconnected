/* ===========================================================================
   FIDS v2 — render layer
   Bridges the existing fids-core.js data pipeline to the new visual layout.
   - Translations for 9 languages
   - Status mapping with NOW prefix for delays
   - Weather icon resolution against the 25-icon flat sprite
   - Per-airport theme + layout config
   =========================================================================== */

(function() {
  'use strict';

  // ── Translations ────────────────────────────────────────────────────────
  // Headers and status words. Numeric/code-style cells (flight #, gate, time)
  // are not translated — they're universal identifiers.
  const TX = {
    // Column headers
    airline:    { en:'Airline', fr:'Ligne aérienne', es:'Aerolínea', de:'Fluggesellschaft', it:'Compagnia', pt:'Companhia', ja:'航空会社', zh:'航空公司', ar:'شركة الطيران' },
    to:         { en:'Destination', fr:'Destination',   es:'A',         de:'Nach',             it:'Per',       pt:'Para',      ja:'行先',     zh:'前往',     ar:'إلى' },
    from:       { en:'From',    fr:'De',             es:'Desde',     de:'Von',              it:'Da',        pt:'De',        ja:'出発地',   zh:'始发',     ar:'من' },
    weather:    { en:'Weather', fr:'Météo',          es:'Clima',     de:'Wetter',           it:'Meteo',     pt:'Clima',     ja:'天気',     zh:'天气',     ar:'الطقس' },
    flight:     { en:'Flight #',  fr:'Vol #',            es:'Vuelo #',     de:'Flug #',             it:'Volo #',      pt:'Voo #',       ja:'便名 #',     zh:'航班 #',     ar:'# رحلة' },
    gate:       { en:'Gate',    fr:'Porte',          es:'Puerta',    de:'Gate',             it:'Gate',      pt:'Portão',    ja:'ゲート',   zh:'登机口',   ar:'البوابة' },
    carousel:   { en:'Carousel',fr:'Carrousel',      es:'Carrusel',  de:'Band',             it:'Nastro',    pt:'Esteira',   ja:'ターンテーブル', zh:'行李转盘', ar:'الحزام' },
    time:       { en:'Time',    fr:'Heure',          es:'Hora',      de:'Zeit',             it:'Ora',       pt:'Hora',      ja:'時刻',     zh:'时间',     ar:'الوقت' },
    status:     { en:'Status',  fr:'Statut',         es:'Estado',    de:'Status',           it:'Stato',     pt:'Status',    ja:'状態',     zh:'状态',     ar:'الحالة' },
    departures: { en:'Departures', fr:'Départs',     es:'Salidas',   de:'Abflüge',          it:'Partenze',  pt:'Partidas',  ja:'出発',     zh:'出发',     ar:'المغادرات' },
    arrivals:   { en:'Arrivals',   fr:'Arrivées',    es:'Llegadas',  de:'Ankünfte',         it:'Arrivi',    pt:'Chegadas',  ja:'到着',     zh:'到达',     ar:'الوصول' },
    // Status words
    'st-scheduled':   { en:'Scheduled',   fr:'Prévu',         es:'Programado',     de:'Planmäßig',        it:'Previsto',         pt:'Previsto',         ja:'予定',     zh:'预定',     ar:'مجدول' },
    'st-on-time':     { en:'On time',     fr:'À l\'heure',    es:'A tiempo',       de:'Pünktlich',        it:'In orario',        pt:'No horário',       ja:'定刻',     zh:'准点',     ar:'في الموعد' },
    'st-boarding':    { en:'Boarding',    fr:'Embarquement',  es:'Embarcando',     de:'Boarding',         it:'Imbarco',          pt:'Embarque',         ja:'搭乗中',   zh:'登机中',   ar:'الصعود' },
    'st-final-call':  { en:'Final call',  fr:'Dernier appel', es:'Última llamada', de:'Letzter Aufruf',   it:'Ultima chiamata',  pt:'Última chamada',   ja:'最終案内', zh:'最后呼叫', ar:'النداء الأخير' },
    'st-gate-closed': { en:'Gate closed', fr:'Porte fermée',  es:'Puerta cerrada', de:'Gate geschlossen', it:'Gate chiuso',      pt:'Portão fechado',   ja:'搭乗終了', zh:'登机口已关闭', ar:'البوابة مغلقة' },
    'st-departed':    { en:'Departed',    fr:'Parti',         es:'Salido',         de:'Abgeflogen',       it:'Partito',          pt:'Partiu',           ja:'出発済',   zh:'已起飞',   ar:'غادرت' },
    'st-arrived':     { en:'Arrived',     fr:'Arrivé',        es:'Llegado',        de:'Angekommen',       it:'Arrivato',         pt:'Chegou',           ja:'到着',     zh:'已到达',   ar:'وصلت' },
    'st-delayed':     { en:'Delayed',     fr:'En retard',     es:'Retrasado',      de:'Verspätet',        it:'In ritardo',       pt:'Atrasado',         ja:'遅延',     zh:'延误',     ar:'متأخر' },
    'st-early':       { en:'Early',       fr:'En avance',     es:'Adelantado',     de:'Verfrüht',         it:'In anticipo',      pt:'Adiantado',        ja:'早着',     zh:'提前',     ar:'مبكر' },

    'st-cancelled':   { en:'Cancelled',   fr:'Annulé',        es:'Cancelado',      de:'Annulliert',       it:'Cancellato',       pt:'Cancelado',        ja:'欠航',     zh:'取消',     ar:'ملغاة' },
    'st-diverted':    { en:'Diverted',    fr:'Dérouté',       es:'Desviado',       de:'Umgeleitet',       it:'Dirottato',        pt:'Desviado',         ja:'目的地変更', zh:'改航', ar:'محول' },
    // v22880 — filtered-board chip (Nick: 'You may as well reinstall the
    // already exisiting multigual languages'). Same 9-language table as
    // every other board word, so a filtered monitor speaks whatever the
    // rotation is currently showing instead of a hardcoded EN/FR pair.
    terminal:         { en:'Terminal',      fr:'Aérogare',        es:'Terminal',       de:'Terminal',        it:'Terminal',       pt:'Terminal',      ja:'ターミナル', zh:'航站楼',   ar:'المبنى' },
    'f-domestic':      { en:'Domestic',      fr:'Intérieur',       es:'Nacional',       de:'Inland',          it:'Nazionali',      pt:'Doméstico',     ja:'国内線',     zh:'国内',     ar:'داخلي' },
    'f-transborder':   { en:'Transborder',   fr:'Transfrontalier', es:'Transfronterizo', de:'Transborder',    it:'Transfrontaliero', pt:'Transfronteiriço', ja:'米国線', zh:'美国航线', ar:'عبر الحدود' },
    'f-international': { en:'International', fr:'International',   es:'Internacional',  de:'International',   it:'Internazionali', pt:'Internacional', ja:'国際線',     zh:'国际',     ar:'دولي' },
    now:              { en:'Now',         fr:'Maintenant',    es:'Ahora',          de:'Jetzt',            it:'Ora',              pt:'Agora',            ja:'変更',     zh:'现改为',   ar:'الآن' }
  };

  // T(key, lang) — get a translated string. Falls back to English.
  function T(key, lang) {
    const entry = TX[key];
    if (!entry) return key;
    return entry[lang || 'en'] || entry.en || key;
  }
  window.fidsT = T;

  // ── Status normalization ────────────────────────────────────────────────
  // Maps raw status strings (from ADB / our data) to the 10 canonical states.
  function normStatus(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (!s) return 'scheduled';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    if (s === 'diverted') return 'diverted';
    if (s === 'gate-closed' || s === 'closed' || s.includes('gate clos')) return 'gate-closed';
    if (s === 'final-call' || s === 'final' || s.includes('final call') || s.includes('last call')) return 'final-call';
    if (s === 'boarding' || s === 'gate-open' || s === 'now-boarding') return 'boarding';
    if (s === 'departed' || s === 'expected' || s === 'enroute' || s === 'inair' || s === 'in-air') return 'departed';
    if (s === 'arrived' || s === 'landed' || s === 'at-gate' || s === 'gate') return 'arrived';
    if (s === 'delayed' || s === 'late') return 'delayed';
    if (s === 'early' || s === 'ahead-of-schedule') return 'early';
    if (s === 'on-time' || s === 'ontime' || s === 'on time') return 'on-time';
    return 'scheduled';
  }
  window.fidsNormStatus = normStatus;

  // Format the status cell for a flight. If delayed or revised, show "Now H:MM AM/PM".
  // Returns { html, cssClass } so the renderer can style the cell.
  function formatStatusCell(flight, lang) {
    const st = normStatus(flight && flight.status);
    // Phase 4: with the separate "Revised" column showing the updated time,
    // the Status cell now just shows the localized status word ("Delayed" /
    // "Retardé") instead of duplicating the time as "Now 5:37 PM".
    // Otherwise the localized status word with the matching CSS class
    const cssMap = {
      'cancelled':   '',                              // row gets the red class instead
      'diverted':    '',                              // row gets the red class instead
      'delayed':     'fids-status-delayed',
      'final-call':  'fids-status-final',
      'gate-closed': 'fids-status-gate-closed',
      'boarding':    'fids-status-boarding',
      'departed':    'fids-status-departed',
      'arrived':     'fids-status-arrived',
      'early':       'fids-status-early',
      // Explicit classes so CSS can treat these two differently: On time
      // stays green, Scheduled reverts to the plain row ink (Nick: the
      // green Prévu 'is clashing with early').
      'on-time':     'fids-status-ontime',
      'scheduled':   'fids-status-scheduled'
    };
    return {
      html: T('st-' + st, lang),
      cssClass: cssMap[st] || ''
    };
  }
  window.fidsFormatStatus = formatStatusCell;

  // ── Time formatting ─────────────────────────────────────────────────────
  // 12-hour with AM/PM, e.g. "5:28 AM" / "11:42 PM"
  function formatTime12(hhmm) {
    if (!hhmm) return '';
    const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return hhmm;
    let h = parseInt(m[1], 10);
    const mm = m[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + mm + ' ' + ampm;
  }
  window.fidsFormatTime12 = formatTime12;

  // ── Weather icon mapping ───────────────────────────────────────────────
  // The /logos/weather/sprite.svg file is a 5×5 grid of 25 colored icons.
  // Each icon is centered in a 220-unit cell. We render a cropped <svg> via
  // <image href=…> with the right viewBox for that cell.
  // Sprite source dimensions: 1365.1 × 1330.6
  const WX_SPRITE_URL = '/logos/weather/sprite.svg';
  const WX_SPRITE_W = 1365.1;
  const WX_SPRITE_H = 1330.6;
  const WX_CELL = {
    // [x, y] = top-left of the 220×220 crop window (centered on each circle)
    'clear':                  [115.7, 164.1],
    'cloudy':                 [344.1, 164.1],
    'partly-cloudy-day':      [572.5, 164.1],
    'partly-cloudy-overcast': [800.9, 164.1],
    'rain':                   [1029.3, 164.1],
    'heavy-rain':             [115.7, 375.2],
    'thunder':                [344.1, 375.2],
    'thunder-rain':           [572.5, 375.2],
    'light-snow':             [800.9, 375.2],
    'snow':                   [1029.3, 375.2],
    'rain-sun':               [115.7, 586.2],
    'rainbow':                [344.1, 586.2],
    'wind-cloud':             [572.5, 586.2],
    'wind-sun':               [800.9, 586.2],
    'tornado':                [1029.3, 586.2],
    'sunset':                 [115.7, 797.3],
    'sunrise':                [344.1, 797.3],
    'thermo-cold':            [572.5, 797.3],
    'thermo-mild':            [800.9, 797.3],
    'thermo-hot':             [1029.3, 797.3],
    'snowflake':              [115.7, 1008.3],
    'lightning':              [344.1, 1008.3],
    'wind':                   [572.5, 1008.3],
    'fahrenheit':             [800.9, 1008.3],
    'celsius':                [1029.3, 1008.3]
  };
  // Map Tomorrow.io / generic weather codes to the icon name we use.
  const WX_CODE_MAP = {
    'clear-day':           'clear',
    'clear-night':         'clear',          // same icon; could use moon variant later
    'cloudy':              'cloudy',
    'partly-cloudy-day':   'partly-cloudy-day',
    'partly-cloudy-night': 'partly-cloudy-day',
    'rain':                'rain',
    'drizzle':             'rain',
    'extreme-rain':        'heavy-rain',
    'rain-with-sun':       'rain-sun',
    'thunderstorms':       'thunder',
    'thunderstorms-rain':  'thunder-rain',
    'snow':                'snow',
    'light-snow':          'light-snow',
    'extreme-snow':        'snow',
    'sleet':               'light-snow',
    'hail':                'snow',
    'fog':                 'cloudy',         // no fog icon in the set; cloudy is closest
    'wind':                'wind',
    'tornado':             'tornado'
  };

  // Render a weather icon by CSS-cropping the sprite image via background.
  // Using `background-image` + `background-position` + `background-size` is
  // far more reliable across browsers than nesting <image> inside <svg>.
  // We compute the negative background-position so the desired 220×220 cell
  // appears in the rendered box. background-size scales the full sprite so
  // each cell is exactly `size` pixels.
  function wxIconHtml(code, size) {
    size = size || 36;
    let nameKey = code;
    // Numeric WMO/Tomorrow.io code → string name via TIO_ICON
    if (typeof code === 'number' || (typeof code === 'string' && /^\d+$/.test(code))) {
      const numKey = parseInt(code, 10);
      if (typeof window.TIO_ICON !== 'undefined' && window.TIO_ICON[numKey]) {
        nameKey = window.TIO_ICON[numKey];
      }
    }
    // v223 — clean animated icon set (same icons the arrival-weather card
    // uses): the old sprite bakes a teal disc behind every icon, which
    // clashed with every board theme (Nick: 'the colors for the weather are
    // not at all matching'). Sprite kept below as fallback for names the
    // animated set doesn't cover.
    // v23166 — the Orion paper-cut set (Nick's pick) renders every condition
    // it covers; hail is the only name with no papercut artwork and stays on
    // the animated icon below. Mirror of _WX_PAPERCUT in fids-core.js — the
    // two bundles load independently, so each carries the map.
    // data-wxp, not data-wx: the light-row swap (display-overrides.css:6273)
    // keys on [data-wx] to substitute -light Meteocons, and this art reads on
    // both grounds — it must never be swapped.
    const _pcSet = { 'clear-day':'clear-day','clear-night':'clear-night',
      'partly-cloudy-day':'partly-cloudy-day','partly-cloudy-night':'partly-cloudy-night',
      'cloudy':'overcast','overcast':'overcast','overcast-day':'overcast',
      'fog':'fog','mist':'fog','drizzle':'drizzle',
      'rain':'rain','extreme-rain':'rain','sleet':'sleet',
      'snow':'snow','extreme-snow':'snow','thunderstorms':'thunderstorms',
      'thunderstorms-rain':'thunderstorms-rain','thunderstorms-day-rain':'thunderstorms-rain',
      'wind':'wind' };
    if (_pcSet[nameKey]) {
      return '<img class="fids-wx-cell" data-wxp="' + _pcSet[nameKey] + '" src="/logos/weather/orion-papercut/' + _pcSet[nameKey] + '.png" alt="" aria-hidden="true" style="'
        + 'display:inline-block;width:' + size + 'px;height:' + size + 'px;'
        + 'flex-shrink:0;object-fit:contain;vertical-align:middle;">';
    }
    const _animSet = { 'clear-day':1,'clear-night':1,'cloudy':1,'drizzle':1,'extreme-rain':1,'extreme-snow':1,'fog':1,'hail':1,'mist':1,'overcast-day':1,'overcast':1,'partly-cloudy-day':1,'partly-cloudy-night':1,'rain':1,'sleet':1,'snow':1,'thunderstorms-day-rain':1,'thunderstorms-rain':1,'wind':1 };
    if (_animSet[nameKey]) {
      // v22674 — data-wx names the icon so CSS can swap in the dark-ink
      // variant on the light row states (Delayed, Final call). This art is
      // drawn for a dark ground — near-white clouds, amber suns — and Nick
      // was right that it 'doesn't go with light'. Callers are scattered
      // across the board, the gate screens and the arrival card and none of
      // them know the row state, so the swap has to happen in CSS, which
      // does. See the -light.svg pairs in the same folder.
      return '<img class="fids-wx-cell" data-wx="' + nameKey + '" src="/logos/weather/animated/' + nameKey + '.svg" alt="" aria-hidden="true" style="'
        + 'display:inline-block;width:' + size + 'px;height:' + size + 'px;'
        + 'flex-shrink:0;object-fit:contain;vertical-align:middle;">';
    }
    const iconKey = WX_CODE_MAP[nameKey] || 'clear';
    const cell = WX_CELL[iconKey];
    if (!cell) return '';
    // The sprite's natural size is 1365.1 × 1330.6 and each cell is 220 wide.
    // To make the displayed cell exactly `size` pixels, we scale the sprite
    // so that 220 source units = `size` rendered pixels, i.e.:
    //   spriteScaledW = (1365.1 / 220) * size
    //   spriteScaledH = (1330.6 / 220) * size
    // Then we offset by the cell's top-left scaled into the same units.
    const scale = size / 220;
    const bgW = WX_SPRITE_W * scale;
    const bgH = WX_SPRITE_H * scale;
    const offX = -cell[0] * scale;
    const offY = -cell[1] * scale;
    return '<span class="fids-wx-cell" style="'
      + 'display:inline-block;'
      + 'width:' + size + 'px;height:' + size + 'px;'
      + 'background-image:url(\'' + WX_SPRITE_URL + '\');'
      + 'background-size:' + bgW.toFixed(2) + 'px ' + bgH.toFixed(2) + 'px;'
      + 'background-position:' + offX.toFixed(2) + 'px ' + offY.toFixed(2) + 'px;'
      + 'background-repeat:no-repeat;'
      + 'flex-shrink:0;'
      + '" aria-hidden="true"></span>';
  }
  window.fidsWxIcon = wxIconHtml;

  // ── Per-airport config ─────────────────────────────────────────────────
  // Each airport can have:
  //   theme:      'navy' | 'grey' | 'amber' | 'green' (matches data-fids-theme)
  //   layout:     'left' | 'right' (board-name on which side)
  //   showName:   boolean — show airline name next to logo, default true
  //   logoUrl:    optional custom airport logo image URL (overrides IATA pill)
  //   sub:        airport sub-text (defaults to city name)
  const AIRPORT_CONFIG = {
    'YQM': { theme: 'navy',  layout: 'left',  showName: true, sub: 'Moncton' },
    'YHZ': { theme: 'navy',  layout: 'left',  showName: true, sub: 'Halifax' },
    'YYZ': { theme: 'navy',  layout: 'left',  showName: true, sub: 'Toronto' },
    'YUL': { theme: 'navy',  layout: 'left',  showName: true, sub: 'Montréal' },
    'YOW': { theme: 'navy',  layout: 'left',  showName: true, sub: 'Ottawa' }
  };
  window.fidsAirportConfig = AIRPORT_CONFIG;

  // Apply the per-airport config to <body> so CSS custom properties pick up the theme.
  function applyAirportConfig(iata) {
    const cfg = AIRPORT_CONFIG[iata] || { theme: 'navy', layout: 'left', showName: true, sub: '' };
    document.body.dataset.fidsTheme = cfg.theme;
    document.body.dataset.fidsLayout = cfg.layout;
    document.body.dataset.fidsAirlineName = cfg.showName ? 'on' : 'off';
    return cfg;
  }
  window.fidsApplyAirportConfig = applyAirportConfig;

  // ── Banner render ───────────────────────────────────────────────────────
  // Inline SVGs for the up/down plane icon — used in the board-name circle.
  const PLANE_ICON_UP =
    '<svg viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M2.5 19h19v2h-19zM22.07 9.64c-.21-.8-.94-1.28-1.73-1.28-.2 0-.4.03-.59.09L14.76 10 8 3.57 6.55 4.04l4.15 7.18-4.76 1.64L4.16 11.3l-1.06.36 2.23 3.87.04.06 1.11-.38L22.07 9.64z"/>'
    + '</svg>';
  const PLANE_ICON_DOWN =
    '<svg viewBox="0 0 24 24" style="transform:rotate(180deg)" aria-hidden="true">'
    + '<path d="M2.5 19h19v2h-19zM22.07 9.64c-.21-.8-.94-1.28-1.73-1.28-.2 0-.4.03-.59.09L14.76 10 8 3.57 6.55 4.04l4.15 7.18-4.76 1.64L4.16 11.3l-1.06.36 2.23 3.87.04.06 1.11-.38L22.07 9.64z"/>'
    + '</svg>';

  function renderBanner(opts) {
    opts = opts || {};
    const mode = opts.mode || 'departures';   // 'departures' | 'arrivals'
    const lang = opts.lang || 'en';
    const iata = opts.iata || '';
    const cfg = AIRPORT_CONFIG[iata] || {};

    const boardLabel = T(mode, lang);
    const planeIcon  = mode === 'arrivals' ? PLANE_ICON_DOWN : PLANE_ICON_UP;

    // Time formatted in 12-hour
    const now = new Date();
    let h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    const timeStr = h + ':' + m + ' ' + ampm;

    // Airport pill — custom logo if configured, else IATA + city
    let pillContent;
    if (cfg.logoUrl) {
      pillContent = '<img src="' + cfg.logoUrl + '" alt="' + iata + '">';
    } else {
      pillContent =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 19h19v2h-19zM22.07 9.64c-.21-.8-.94-1.28-1.73-1.28-.2 0-.4.03-.59.09L14.76 10 8 3.57 6.55 4.04l4.15 7.18-4.76 1.64L4.16 11.3l-1.06.36 2.23 3.87.04.06 1.11-.38L22.07 9.64z"/></svg>'
        + '<div>'
        +   '<div class="fids-iata">' + (iata || '—') + '</div>'
        + (cfg.sub ? '<div class="fids-airport-sub">' + cfg.sub + '</div>' : '')
        + '</div>';
    }

    return ''
      + '<div class="fids-banner">'
      +   '<div class="fids-banner-time">' + timeStr + '</div>'
      +   '<div class="fids-banner-inner">'
      +     '<div class="fids-board-name">'
      +       '<div class="fids-board-icon">' + planeIcon + '</div>'
      +       '<div class="fids-board-label">' + boardLabel + '</div>'
      +     '</div>'
      +     '<div class="fids-airport-logo' + (cfg.logoUrl ? ' has-custom-img' : '') + '">'
      +       pillContent
      +     '</div>'
      +   '</div>'
      + '</div>';
  }
  window.fidsRenderBanner = renderBanner;

  // ── Table render ──────────────────────────────────────────────────────
  // Renders the full <table> for a list of flights.
  // mode: 'departures' | 'arrivals'
  // flights: array from fids-core's data pipeline
  function renderTable(opts) {
    opts = opts || {};
    const mode = opts.mode || 'departures';
    const lang = opts.lang || 'en';
    const flights = opts.flights || [];

    const isArr = mode === 'arrivals';
    const cols = isArr
      ? ['airline', 'from', 'flight', 'carousel', 'time', 'status']
      : ['airline', 'to', 'weather', 'flight', 'gate', 'time', 'status'];

    let html = '<table class="fids-table"><thead><tr>';
    cols.forEach(c => { html += '<th>' + T(c, lang) + '</th>'; });
    html += '</tr></thead><tbody>';

    flights.forEach(f => {
      const st = normStatus(f.status);
      const rowClass = st === 'cancelled' ? ' class="row-cancelled"'
                     : st === 'diverted'  ? ' class="row-diverted"'
                     : '';
      const stCell = formatStatusCell(f, lang);
      const time12 = formatTime12(f.time);

      html += '<tr' + rowClass + '>';
      cols.forEach(c => {
        html += renderCell(c, f, time12, stCell, lang);
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }
  window.fidsRenderTable = renderTable;

  // Render a single <td> based on column key.
  function renderCell(col, f, time12, stCell, lang) {
    switch (col) {
      case 'airline':
        return '<td><div class="fids-cell-airline">'
          +    '<div class="fids-airline-logo">' + (f._logoHtml || '') + '</div>'
          +    '<span class="fids-airline-name">' + (f._airlineName || f.airline || '') + '</span>'
          +  '</div></td>';
      case 'to':
      case 'from':
        return '<td>' + (f._cityName || f.dest || f.origin || '') + '</td>';
      case 'weather':
        return '<td><div class="fids-cell-weather">'
          +    wxIconHtml(f._wxCode, 36)
          +    '<span>' + (f._wxTemp != null ? f._wxTemp + '°' : '—') + '</span>'
          +  '</div></td>';
      case 'flight':
        return '<td class="fids-cell-flight">' + (f.flight || '') + '</td>';
      case 'gate':
        return '<td>' + (f.gate || '—') + '</td>';
      case 'carousel':
        return '<td>' + (f.carousel || f.belt || '—') + '</td>';
      case 'time':
        return '<td class="fids-cell-time">' + time12 + '</td>';
      case 'status':
        return '<td' + (stCell.cssClass ? ' class="' + stCell.cssClass + '"' : '') + '>' + stCell.html + '</td>';
    }
    return '<td></td>';
  }

  // ── Public init ────────────────────────────────────────────────────────
  // Call this once on page load. It sets up the body data attributes so
  // theming/layout takes effect, but rendering is driven by your existing
  // fids-core.js loop calling renderBanner / renderTable.
  function init(opts) {
    opts = opts || {};
    if (opts.iata) applyAirportConfig(opts.iata);
  }
  window.fidsV2Init = init;

})();
