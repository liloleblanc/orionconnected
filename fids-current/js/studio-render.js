(function (root, factory) {
  const schema = root && root.OrionStudioSchema || (typeof require === 'function' ? require('./studio-schema.js') : null);
  // The one store for passenger words (board-strings.js), loaded before this
  // file by the player and the Studio. docs/BOARD-LANGUAGES.md.
  const strings = root && root.BoardStrings || (typeof require === 'function' ? require('./board-strings.js') : null);
  const api = factory(schema, strings);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrionStudioRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Schema, Strings) {
  'use strict';

  // ── PASSENGER WORDS ─────────────────────────────────────────────────────
  // v23960 — every word a Studio screen shows comes from the store, in the
  // language the player is showing (context.language). Statuses travel as
  // the canonical English codes studio-data.js writes (the scene rules
  // compare them) and are put into words only here, at the last moment.
  function langOf(context) {
    const l = context && context.language;
    return Strings && Strings.isLang(l) ? l : 'en';
  }
  function T(key, context) { return Strings ? Strings.bs(key, langOf(context)) : ''; }
  function TU(key, context) {
    const l = langOf(context);
    return T(key, context).toLocaleUpperCase(Strings ? Strings.META[l].intl : 'en');
  }
  function TF(key, context, fields) { return Strings ? Strings.fill(T(key, context), fields, true) : ''; }
  const STATUS_KEYS = Object.freeze({
    'On time': 'stOnTime', 'En route': 'stEnRoute', 'Boarding': 'stBoarding', 'Final call': 'stFinalCall',
    'Gate closed': 'stGateClosed', 'Departed': 'stDeparted', 'Arrived': 'stArrived', 'Delayed': 'stDelayed',
    'Cancelled': 'stCancelled', 'Diverted': 'stDiverted', 'Scheduled': 'stScheduled'
  });
  function statusText(status, context) {
    const key = STATUS_KEYS[status];
    return key ? T(key, context) : String(status == null ? '' : status);
  }
  // A row's time ('5:30 AM' or '17:30') in the language's own clock.
  function displayTime(value, context) {
    const minutes = timeToMinutes(value);
    if (minutes == null || !Strings) return String(value == null ? '' : value);
    const hhmm = String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
    return Strings.clockText(hhmm, langOf(context));
  }

  const TRANSLATED_TITLES = Object.freeze({
    en: 'Departures', fr: 'Départs', ar: 'المغادرات', es: 'Salidas', de: 'Abflüge',
    it: 'Partenze', pt: 'Partidas', zh: '出发', ja: '出発'
  });

  const AIRLINE_NAMES = Object.freeze({
    AC: 'Air Canada', RV: 'Air Canada Rouge', QK: 'Jazz', PD: 'Porter', P3: 'Porter',
    PB: 'PAL Airlines', SP: 'PAL Airlines', WS: 'WestJet', WR: 'WestJet Encore',
    TS: 'Air Transat', F8: 'Flair', WG: 'Sunwing', UA: 'United', AA: 'American', DL: 'Delta'
  });

  function airlineFromFlight(flightNumber) {
    const token = String(flightNumber || '').trim().split(/\s+/)[0].toUpperCase();
    const code = (/^[A-Z][A-Z0-9]$|^[A-Z0-9][A-Z]$|^[A-Z]{3}$/.test(token) ? token : token.replace(/[0-9]+$/, '')).slice(0, 3);
    return { code: code, name: AIRLINE_NAMES[code] || code };
  }

  function airlineLogoHTML(code) {
    const safe = escapeHTML(code);
    return '<span class="fx-logo"><img src="../logos/airline-tiles/' + safe + '-glossy.svg" alt="" ' +
      'onerror="if(!this.dataset.t){this.dataset.t=1;this.src=\'../logos/airline-tiles/' + safe + '.svg\'}else{this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'}">' +
      '<i>' + safe + '</i></span>';
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  function firstRow(context, direction) {
    const rows = context.rows && context.rows[direction] || [];
    return rows[0] || ['—', '—', '—', '—', '—'];
  }

  function tokenValues(context) {
    const departure = firstRow(context, 'departures');
    const arrival = firstRow(context, 'arrivals');
    const weather = context.weather || {};
    return {
      'airport.iata': context.airport.iata,
      'airport.name': context.airport.name || TF('airportNamed', context, { IATA: context.airport.iata }),
      'airport.host': context.airport.siteHost || '',
      'time': context.clock.time,
      'date': context.clock.date,
      'language': String(context.language || 'en').toUpperCase(),
      'flight.flight': departure[0],
      'flight.city': departure[1],
      'flight.gate': departure[2],
      'flight.time': displayTime(departure[3], context),
      'flight.status': statusText(departure[4], context),
      'arrival.flight': arrival[0],
      'arrival.city': arrival[1],
      'arrival.belt': arrival[2],
      'arrival.time': displayTime(arrival[3], context),
      'arrival.status': statusText(arrival[4], context),
      'weather.temp': weather.temperature != null ? weather.temperature + '°' + (weather.unit || 'C') : '—',
      'weather.condition': weather.condition || '—'
    };
  }

  function resolveTokens(text, context) {
    const values = tokenValues(context);
    const resolved = String(text == null ? '' : text).replace(/\{([a-z.]+)\}/gi, function (match, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;
    });
    return escapeHTML(resolved).replace(/\n/g, '<br>');
  }

  function tokenReference() {
    return ['airport.iata', 'airport.name', 'time', 'date', 'language', 'flight.flight', 'flight.city',
      'flight.gate', 'flight.time', 'flight.status', 'arrival.flight', 'arrival.belt', 'weather.temp', 'weather.condition'];
  }

  function surfaceClass(module) {
    const surface = module.props && module.props.surface;
    if (surface === 'glass') return ' mod-surface-glass';
    if (surface === 'solid') return ' mod-surface-solid';
    return '';
  }

  function statusClass(status) {
    if (status === 'Cancelled' || status === 'Diverted') return 'status-bad';
    return status === 'Delayed' || status === 'Gate closed' ? 'status-warn' : 'status-good';
  }

  function timeToMinutes(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
    if (!match) return null;
    let hour = Number(match[1]) % 12;
    if (match[3] && match[3].toUpperCase() === 'PM') hour += 12;
    if (!match[3]) hour = Number(match[1]);
    return hour * 60 + Number(match[2]);
  }

  function sortRowsByTime(rows) {
    return rows.map(function (row, index) { return { row: row, index: index, minutes: timeToMinutes(row[3]) }; })
      .sort(function (a, b) {
        if (a.minutes == null && b.minutes == null) return a.index - b.index;
        if (a.minutes == null) return 1;
        if (b.minutes == null) return -1;
        return a.minutes - b.minutes || a.index - b.index;
      })
      .map(function (entry) { return entry.row; });
  }

  function rowSceneClass(context, status) {
    if (context.scene === 'delay' && (status === 'Delayed' || status === 'Cancelled')) return ' row-alert';
    if (context.scene === 'highlight' && status === 'Boarding') return ' row-focus';
    return '';
  }

  function headerContent(module, context) {
    const title = module.props.title
      ? resolveTokens(module.props.title, context)
      : escapeHTML(TRANSLATED_TITLES[langOf(context)] || '');
    const airportName = module.props.brandName
      ? resolveTokens(module.props.brandName, context)
      : escapeHTML(context.airport.name || TF('airportNamed', context, { IATA: context.airport.iata }));
    const brandLogo = context.brandLogo
      ? '<img class="fx-brand-logo" src="' + escapeHTML(context.brandLogo) + '" alt="">'
      : '<span class="fx-orbit"></span>';
    return '<div class="fx-header"><div class="fx-motif"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="fx-brand' + (module.props.panel === 'dark' ? ' is-dark' : '') + '">' + brandLogo + '<b>' + airportName + '</b></div>' +
      '<div class="fx-headright"><div class="fx-clock">' + escapeHTML(context.clock.time) + '</div>' +
      '<div class="fx-title">' + title + '<span class="fx-plane">✈</span></div>' +
      '<div class="fx-headmeta">' + escapeHTML(context.clock.date) + ' · ' + escapeHTML(context.dataBadge) + ' · ' + escapeHTML(String(context.language).toUpperCase()) + '</div></div></div>';
  }

  const TABLE_COLUMNS = Object.freeze([
    { key: 'logo', track: '3.2cqw', label: function () { return ''; } },
    { key: 'airline', track: '10cqw', label: function (arrivals, context) { return T('colAirline', context); } },
    { key: 'destination', track: '1.7fr', label: function (arrivals, context) { return T(arrivals ? 'colFrom' : 'colTo', context); } },
    { key: 'flight', track: '1fr', label: function (arrivals, context) { return T('colFlight', context); } },
    { key: 'gate', track: '.8fr', label: function (arrivals, context) { return T(arrivals ? 'colBelt' : 'gateWord', context); } },
    { key: 'time', track: '1fr', label: function (arrivals, context) { return T('colTime', context); } },
    { key: 'status', track: '1.2fr', label: function (arrivals, context) { return T('colStatus', context); } }
  ]);

  function tableCell(key, row, context) {
    const airline = airlineFromFlight(row[0]);
    const fields = { logo: 'flight', airline: 'flight', destination: 'city', flight: 'flight', gate: 'gate', time: 'time', status: 'status' };
    const field = ' data-field="' + (fields[key] || 'flight') + '"';
    switch (key) {
      case 'logo': return airlineLogoHTML(airline.code);
      case 'airline': return '<span' + field + '>' + escapeHTML(airline.name) + '</span>';
      case 'destination': return '<span' + field + '>' + escapeHTML(String(row[1]).replace(/\s*\([A-Z]{3}\)$/, '')) + '</span>';
      case 'flight': return '<span' + field + '>' + escapeHTML(row[0]) + '</span>';
      case 'gate': return '<span class="fx-gate"' + field + '>' + escapeHTML(row[2]) + '</span>';
      case 'time': return '<span' + field + '>' + escapeHTML(displayTime(row[3], context)) + '</span>';
      default: return '<span class="' + statusClass(row[4]) + '"' + field + '>' + escapeHTML(statusText(row[4], context)) + '</span>';
    }
  }

  function tableContent(module, context) {
    const direction = module.props.direction || (context.family === 'bids' || context.family === 'baggage' ? 'arrivals' : 'departures');
    const arrivals = direction === 'arrivals';
    const hidden = module.props.columns && typeof module.props.columns === 'object' ? module.props.columns : {};
    const columns = TABLE_COLUMNS.filter(function (column) { return hidden[column.key] !== false; });
    const grid = 'grid-template-columns:' + columns.map(function (column) { return column.track; }).join(' ') + ';';
    const perPage = Math.min(12, Math.max(3, Number(module.props.maxRows) || 5));
    let indexed = (context.rows && context.rows[direction] || []).map(function (row, index) { return { row: row, index: index }; });
    if (module.props.sort !== 'manual') {
      indexed = indexed.slice().sort(function (a, b) {
        const left = timeToMinutes(a.row[3]);
        const right = timeToMinutes(b.row[3]);
        if (left == null && right == null) return a.index - b.index;
        if (left == null) return 1;
        if (right == null) return -1;
        return left - right || a.index - b.index;
      });
    }
    const pages = Math.max(1, Math.ceil(indexed.length / perPage));
    const pageSeconds = Math.min(60, Math.max(3, Number(module.props.pageSeconds) || 8));
    const nowMs = Number.isFinite(context.nowMs) ? context.nowMs : Date.now();
    const page = pages > 1 ? Math.floor(nowMs / 1000 / pageSeconds) % pages : 0;
    const source = indexed.slice(page * perPage, page * perPage + perPage);
    const header = '<div class="fx-cols" style="' + grid + '">' + columns.map(function (column) { return '<span>' + escapeHTML(column.label(arrivals, context)) + '</span>'; }).join('') + '</div>';
    let body = source.map(function (entry) {
      const row = entry.row;
      const editRef = context.editing ? ' data-flight-index="' + entry.index + '"' : '';
      return '<div class="fx-row' + rowSceneClass(context, row[4]) + '"' + editRef + ' style="' + grid + '">' +
        columns.map(function (column) { return tableCell(column.key, row, context); }).join('') + '</div>';
    }).join('');
    for (let filler = source.length; source.length && filler < perPage; filler += 1) body += '<div class="fx-row fx-row-blank"></div>';
    if (!source.length) body = '<div class="fx-empty">' + escapeHTML(T('noScheduled', context)) + '</div>';
    const pager = pages > 1 ? '<span class="fx-page">' + escapeHTML(TU('colPage', context)) + ' ' + (page + 1) + ' / ' + pages + '</span>' : '';
    const editPill = context.editing && context.selectedId === module.id
      ? '<button type="button" class="cm-edit-pill" data-edit-flights>✎ Edit flights</button>' : ''; // i18n-ok: operator
    return '<div class="fx-table' + surfaceClass(module) + '">' + header + body + pager + editPill + '</div>';
  }

  function advertisementContent(module, context) {
    // v23960 — an ad with no copy yet greets in the screen's language; the
    // English sample lines it carried showed on any screen left unedited.
    const headline = module.props.headline ? resolveTokens(module.props.headline, context) : escapeHTML(T('greetBoard', context));
    const body = module.props.body ? resolveTokens(module.props.body, context) : '';
    return '<div class="preview-ad mod-fill"><small>' + escapeHTML(TU('advertisement', context)) + '</small><b>' + headline + '</b><small>' + body + '</small></div>';
  }

  function weatherFooterContent(module, context) {
    const weather = context.weather || {};
    const temperature = weather.temperature != null ? weather.temperature + '°' + (weather.unit || 'C') : '—';
    const ticker = module.props.ticker ? resolveTokens(module.props.ticker, context)
      : escapeHTML(T('greetBoard', context)) + ' · ' + resolveTokens('{airport.name}', context);
    const chip = context.nextLanguage ? escapeHTML(context.nextLanguage) : escapeHTML(String(context.language || 'EN').toUpperCase());
    return '<div class="fx-footer"><span class="fx-temp">' + escapeHTML(temperature) + '<small>' + escapeHTML(weather.condition || '') + '</small></span>' +
      '<span class="fx-ticker">' + ticker + '</span>' +
      '<span class="fx-foot-right"><small>' + escapeHTML(context.editing ? (context.sceneLabel || '') : '') + '</small><span class="fx-chip">' + chip + '</span></span></div>';
  }

  function destinationWeatherContent(module, context) {
    const departure = firstRow(context, 'departures');
    const weather = context.weather || {};
    const temperature = weather.temperature != null ? weather.temperature + '°' + (weather.unit || 'C') : '—';
    const city = escapeHTML(String(departure[1]).split(' (')[0]);
    return '<div class="preview-ad mod-fill"><small>' + escapeHTML(TU('weather', context)) + '</small><b>' + city + '<br>' + escapeHTML(temperature) + '</b><small>' + escapeHTML(weather.condition ? weather.condition : T('noData', context)) + '</small></div>';
  }

  function gateFlightContent(module, context) {
    const departure = firstRow(context, 'departures');
    const gate = module.props.gate ? escapeHTML(module.props.gate) : escapeHTML(departure[2]);
    return '<div class="preview-panel mod-fill mod-center' + surfaceClass(module) + '"><small>' + escapeHTML(statusText(departure[4], context)) + '</small>' +
      '<h1 class="mod-huge">' + escapeHTML(departure[0]) + '</h1><h2>' + escapeHTML(departure[1]) + '</h2>' +
      '<p class="' + statusClass(departure[4]) + '">' + escapeHTML(T('gateWord', context)) + ' ' + gate + ' · ' + escapeHTML(displayTime(departure[3], context)) + '</p></div>';
  }

  function boardingStateContent(module, context) {
    const departure = firstRow(context, 'departures');
    const text = module.props.body
      ? resolveTokens(module.props.body, context)
      : escapeHTML(departure[0]) + ' · ' + escapeHTML(statusText(departure[4], context)) + ' · ' + escapeHTML(T('gateWord', context)) + ' ' + escapeHTML(departure[2]);
    return '<div class="mod-band">' + text + '</div>';
  }

  function claimHeroContent(module, context) {
    const arrival = firstRow(context, 'arrivals');
    return '<div class="preview-panel mod-fill mod-center"><small>' + escapeHTML(TU('greetBags', context)) + ' · ' + escapeHTML(statusText(arrival[4], context)) + '</small>' +
      '<h2 style="margin:.2em 0">' + escapeHTML(arrival[0]) + ' · ' + escapeHTML(arrival[1]) + '</h2>' +
      '<div class="mod-belt"><small>' + escapeHTML(TU('colBelt', context)) + '</small><div>' + escapeHTML(arrival[2]) + '</div></div></div>';
  }

  function messageContent(module, context, fallbackTitle, fallbackBody) {
    // the fallbacks are store keys; a body may carry a {token} for the data
    const title = resolveTokens(module.props.title || T(fallbackTitle, context), context);
    const body = resolveTokens(module.props.body || TF(fallbackBody, context, { BELT: '{arrival.belt}' }), context);
    return '<div class="mod-band"><b>' + title + '</b><span>' + body + '</span></div>';
  }

  function airlineBrandContent(module, context) {
    const airline = escapeHTML(module.props.airline || 'AIR CANADA');
    const counters = escapeHTML(module.props.counters || TF('countersRange', context, { RANGE: '01–04' }).toLocaleUpperCase());
    return '<div class="mod-header mod-checkin"><div><h2>' + airline + '</h2><small>' + escapeHTML(context.airport.name || '') + '</small></div><div></div><div><h2>' + counters + '</h2><small>' + escapeHTML(context.clock.time) + '</small></div></div>';
  }

  function flightAssignmentContent(module, context) {
    const departure = firstRow(context, 'departures');
    return '<div class="mod-dark-panel"><h2>' + escapeHTML(departure[0]) + ' · ' + escapeHTML(departure[1]) + ' · ' + escapeHTML(displayTime(departure[3], context)) + '</h2><span class="' + statusClass(departure[4]) + '">' + escapeHTML(statusText(departure[4], context).toLocaleUpperCase()) + '</span></div>';
  }

  function counterStatusContent(module, context) {
    const count = Math.min(8, Math.max(2, Number(module.props.counters) || 4));
    const cells = [];
    const open = escapeHTML(TU('counterOpen', context));
    for (let index = 1; index <= count; index += 1) {
      cells.push('<div><b>' + String(index).padStart(2, '0') + '</b><small>' + open + '</small></div>');
    }
    return '<div class="mod-counters" style="grid-template-columns:repeat(' + count + ',1fr)">' + cells.join('') + '</div>';
  }

  function queueGuidanceContent(module, context) {
    const body = module.props.body ? resolveTokens(module.props.body, context) : escapeHTML(TF('queueSample', context, { N: '8' }));
    return '<div class="mod-band">' + body + '</div>';
  }

  function rampMilestonesContent(module, context) {
    const arrival = firstRow(context, 'arrivals');
    return '<div class="preview-panel mod-fill mod-pad"><h3>Ramp milestones</h3>' +
      '<p class="status-good">● Aircraft on blocks · 21:08</p><p class="status-good">● First bag scanned · 21:15</p>' +
      '<p style="color:var(--blue)">● 50% bags delivered · In progress</p><p>● Last bag · Target 21:39</p>' +
      '<small style="color:var(--muted)">' + escapeHTML(arrival[0]) + ' · ' + escapeHTML(arrival[1]) + '</small></div>';
  }

  function transferBagsContent() {
    return '<div class="preview-panel mod-fill mod-pad"><small>TRANSFERS</small><h2>12 bags</h2><p class="status-warn">4 priority</p></div>';
  }

  function beltHealthContent() {
    return '<div class="preview-panel mod-fill mod-pad"><small>BELT HEALTH</small><h2 class="status-good">Online</h2><p>BHS · BSM · PLC</p></div>';
  }

  function passengerPreviewContent(module, context) {
    const arrival = firstRow(context, 'arrivals');
    return '<div class="preview-panel mod-fill mod-pad"><small>PASSENGER DISPLAY</small><h3>' + escapeHTML(arrival[0]) + ' · ' + escapeHTML(arrival[1]) + '</h3>' +
      '<div class="mod-belt"><small>BELT</small><div>' + escapeHTML(arrival[2]) + '</div></div><p class="status-good">Bags arriving now</p></div>';
  }

  function safeColor(value, fallback) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? value : fallback;
  }

  function safeNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function textBlockContent(module, context) {
    const props = module.props;
    const style = 'font-size:' + safeNumber(props.size, 0.6, 12, 2) + 'cqw;' +
      'font-weight:' + safeNumber(props.weight, 300, 900, 700) + ';' +
      'color:' + safeColor(props.color, '#ffffff') + ';' +
      'justify-content:' + (props.align === 'center' ? 'center' : props.align === 'right' ? 'flex-end' : 'flex-start') + ';' +
      'text-align:' + (props.align === 'center' ? 'center' : props.align === 'right' ? 'right' : 'left') + ';' +
      (props.uppercase === false ? '' : 'text-transform:uppercase;letter-spacing:.04em;');
    // the placeholder is for the editor only; a published screen shows nothing
    // the editor's hint for an empty block, never on a passenger screen — i18n-ok: operator
    const text = props.text || (context.editing ? 'Text block — edit me' : '');
    return '<div class="fx-text" style="' + style + '">' + resolveTokens(text, context) + '</div>';
  }

  function boxBlockContent(module) {
    const props = module.props;
    const style = 'background:' + safeColor(props.fill, '#f9c20b') + ';' +
      'opacity:' + (safeNumber(props.opacity, 5, 100, 100) / 100) + ';' +
      'border-radius:' + safeNumber(props.radius, 0, 20, 0) + 'cqw;' +
      (safeNumber(props.skew, -45, 45, 0) !== 0 ? 'transform:skewX(' + safeNumber(props.skew, -45, 45, 0) + 'deg);' : '');
    return '<div class="fx-boxfill" style="' + style + '"></div>';
  }

  function imageBlockContent(module) {
    const props = module.props;
    if (!props.src) return '<div class="mod-placeholder">Image — choose from the asset library</div>';
    const fit = props.fit === 'cover' ? 'cover' : 'contain';
    return '<div class="fx-image" style="background:' + safeColor(props.bg, '#00000000').replace('#00000000', 'transparent') + '">' +
      '<img src="' + escapeHTML(props.src) + '" alt="" style="object-fit:' + fit + '"></div>';
  }

  function clockBlockContent(module, context) {
    const props = module.props;
    const size = safeNumber(props.size, 1, 12, 3.2);
    const date = props.showDate === false ? '' : '<small>' + escapeHTML(context.clock.date) + '</small>';
    return '<div class="fx-clockblock" style="color:' + safeColor(props.color, '#ffffff') + '"><b style="font-size:' + size + 'cqw">' + escapeHTML(context.clock.time) + '</b>' + date + '</div>';
  }

  function moduleContent(module, context) {
    switch (module.type) {
      case 'text': return textBlockContent(module, context);
      case 'box': return boxBlockContent(module);
      case 'image': return imageBlockContent(module);
      case 'clock': return clockBlockContent(module, context);
      case 'airport-header': return headerContent(module, context);
      case 'flight-table': case 'claim-table': return tableContent(module, context);
      case 'advertisement': return advertisementContent(module, context);
      case 'weather': return weatherFooterContent(module, context);
      case 'destination-weather': return destinationWeatherContent(module, context);
      case 'gate-flight': return gateFlightContent(module, context);
      case 'boarding-state': return boardingStateContent(module, context);
      case 'belt-hero': return claimHeroContent(module, context);
      case 'oversize-message': return messageContent(module, context, 'oversizeTitle', 'oversizeBody');
      case 'passenger-message': return messageContent(module, context, 'greetBoard', 'checkinOpens');
      case 'airline-brand': return airlineBrandContent(module, context);
      case 'flight-assignment': return flightAssignmentContent(module, context);
      case 'counter-status': return counterStatusContent(module, context);
      case 'queue-guidance': return queueGuidanceContent(module, context);
      case 'ramp-milestones': return rampMilestonesContent(module, context);
      case 'transfer-bags': return transferBagsContent();
      case 'belt-health': return beltHealthContent();
      case 'passenger-preview': return passengerPreviewContent(module, context);
      default: return '<div class="mod-placeholder">' + escapeHTML(module.type) + '</div>';
    }
  }

  function effectiveModules(documentModel, sceneId) {
    const scene = (documentModel.scenes || []).find(function (item) { return item.id === sceneId; });
    const overrides = scene && scene.overrides || {};
    return (documentModel.modules || []).map(function (module) {
      const override = overrides[module.id];
      if (!override) return module;
      const merged = Object.assign({}, module);
      if (typeof override.enabled === 'boolean') merged.enabled = override.enabled;
      if (override.layout) merged.layout = override.layout;
      if (override.props) merged.props = Object.assign({}, module.props, override.props);
      return merged;
    });
  }

  function minutesInWindow(minutes, from, to) {
    function toMinutes(value) {
      const parts = String(value || '').split(':');
      return Number(parts[0]) * 60 + Number(parts[1]);
    }
    const start = toMinutes(from);
    const end = toMinutes(to);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (start === end) return false;
    if (start < end) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  }

  function sceneRuleMatches(rule, context) {
    if (!rule || rule.kind === 'none' || !rule.kind) return false;
    if (rule.kind === 'time') {
      const minutes = context.clock && context.clock.minutes;
      if (!Number.isFinite(minutes)) return false;
      return minutesInWindow(minutes, rule.from, rule.to);
    }
    if (rule.kind !== 'data') return false;
    const departures = context.rows && context.rows.departures || [];
    const arrivals = context.rows && context.rows.arrivals || [];
    switch (rule.condition) {
      case 'any-boarding': return departures.some(function (row) { return row[4] === 'Boarding'; });
      case 'any-delayed': return departures.some(function (row) { return row[4] === 'Delayed'; });
      case 'any-cancelled': return departures.some(function (row) { return row[4] === 'Cancelled'; });
      case 'no-flights': return departures.length === 0;
      case 'arrivals-active': return arrivals.length > 0;
      default: return false;
    }
  }

  function evaluateStateRules(documentModel, context) {
    const matches = (documentModel.scenes || []).filter(function (scene) {
      return scene.id !== 'default' && sceneRuleMatches(scene.rule, context);
    });
    if (!matches.length) return 'default';
    matches.sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
    return matches[0].id;
  }

  function handlesHTML() {
    return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(function (direction) {
      return '<i class="cm-handle cm-' + direction + '" data-handle="' + direction + '"></i>';
    }).join('');
  }

  function moduleHTML(module, context) {
    const layout = module.layout || { x: 30, y: 30, w: 40, h: 30 };
    const selected = context.editing && context.selectedId === module.id;
    const zIndex = selected ? 120 : 10 + (module.order || 0);
    const style = 'left:' + layout.x + '%;top:' + layout.y + '%;width:' + layout.w + '%;height:' + layout.h + '%;z-index:' + zIndex + ';';
    return '<div class="canvas-module' + (selected ? ' is-selected' : '') + '" data-module-id="' + escapeHTML(module.id) + '" style="' + style + '">' +
      moduleContent(module, context) + (selected ? handlesHTML() : '') + '</div>';
  }

  function emergencyOverlayHTML(context) {
    // v23960 — the passenger's words from the store; the operator's notes
    // (every display taken over, paging active) are for the Studio, not the
    // screen.
    return '<div class="cm-emergency"><div><small>' + escapeHTML(TU('emergencyTitle', context)) + '</small><h1>' + escapeHTML(T('followStaff', context)) + '</h1><p>' +
      escapeHTML(context.airport.name || context.airport.iata) + '</p></div></div>';
  }

  function canvasHTML(documentModel, context) {
    const modules = effectiveModules(documentModel, context.scene).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    const visible = modules.filter(function (module) { return module.enabled !== false; });
    let html = visible.map(function (module) { return moduleHTML(module, context); }).join('');
    if (!visible.length && context.editing) {
      html += '<div class="cm-blank"><b>Blank display</b><span>Add modules and building blocks from the Build pane, or press ＋.</span></div>';
    }
    if (context.showGrid) html += '<div class="cm-grid"></div>';
    if (context.showSafe) html += '<div class="cm-safe"></div>';
    if (context.scene === 'emergency') html += emergencyOverlayHTML(context);
    return html;
  }

  return {
    TRANSLATED_TITLES,
    statusText,
    displayTime,
    airlineFromFlight,
    escapeHTML,
    resolveTokens,
    tokenReference,
    moduleContent,
    moduleHTML,
    effectiveModules,
    sceneRuleMatches,
    evaluateStateRules,
    canvasHTML
  };
});
