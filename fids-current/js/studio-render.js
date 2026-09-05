(function (root, factory) {
  const schema = root && root.OrionStudioSchema || (typeof require === 'function' ? require('./studio-schema.js') : null);
  const api = factory(schema);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrionStudioRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Schema) {
  'use strict';

  const TRANSLATED_TITLES = Object.freeze({
    en: 'Departures', fr: 'Départs', ar: 'المغادرة', es: 'Salidas', de: 'Abflüge',
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
      'airport.name': context.airport.name || context.airport.iata + ' Airport',
      'airport.host': context.airport.siteHost || '',
      'time': context.clock.time,
      'date': context.clock.date,
      'language': String(context.language || 'en').toUpperCase(),
      'flight.flight': departure[0],
      'flight.city': departure[1],
      'flight.gate': departure[2],
      'flight.time': departure[3],
      'flight.status': departure[4],
      'arrival.flight': arrival[0],
      'arrival.city': arrival[1],
      'arrival.belt': arrival[2],
      'arrival.time': arrival[3],
      'arrival.status': arrival[4],
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
    return status === 'Delayed' || status === 'Cancelled' || status === 'Diverted' ? 'status-warn' : 'status-good';
  }

  function rowSceneClass(context, status) {
    if (context.scene === 'delay' && (status === 'Delayed' || status === 'Cancelled')) return ' row-alert';
    if (context.scene === 'highlight' && status === 'Boarding') return ' row-focus';
    return '';
  }

  function headerContent(module, context) {
    const title = module.props.title
      ? resolveTokens(module.props.title, context)
      : escapeHTML(TRANSLATED_TITLES[context.language] || TRANSLATED_TITLES.en);
    const airportName = module.props.brandName
      ? resolveTokens(module.props.brandName, context)
      : escapeHTML(context.airport.name || context.airport.iata + ' Airport');
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
    { key: 'airline', track: '10cqw', label: function () { return 'Airline'; } },
    { key: 'destination', track: '1.7fr', label: function (arrivals) { return arrivals ? 'From' : 'To'; } },
    { key: 'flight', track: '1fr', label: function () { return 'Flight'; } },
    { key: 'gate', track: '.8fr', label: function (arrivals) { return arrivals ? 'Belt' : 'Gate'; } },
    { key: 'time', track: '1fr', label: function () { return 'Time'; } },
    { key: 'status', track: '1.2fr', label: function () { return 'Status'; } }
  ]);

  function tableCell(key, row, context) {
    const airline = airlineFromFlight(row[0]);
    switch (key) {
      case 'logo': return airlineLogoHTML(airline.code);
      case 'airline': return '<span>' + escapeHTML(airline.name) + '</span>';
      case 'destination': return '<span>' + escapeHTML(String(row[1]).replace(/\s*\([A-Z]{3}\)$/, '')) + '</span>';
      case 'flight': return '<span>' + escapeHTML(row[0]) + '</span>';
      case 'gate': return '<span class="fx-gate">' + escapeHTML(row[2]) + '</span>';
      case 'time': return '<span>' + escapeHTML(row[3]) + '</span>';
      default: return '<span class="' + statusClass(row[4]) + '">' + escapeHTML(row[4]) + '</span>';
    }
  }

  function tableContent(module, context) {
    const direction = module.props.direction || (context.family === 'bids' || context.family === 'baggage' ? 'arrivals' : 'departures');
    const arrivals = direction === 'arrivals';
    const hidden = module.props.columns && typeof module.props.columns === 'object' ? module.props.columns : {};
    const columns = TABLE_COLUMNS.filter(function (column) { return hidden[column.key] !== false; });
    const grid = 'grid-template-columns:' + columns.map(function (column) { return column.track; }).join(' ') + ';';
    const perPage = Math.min(12, Math.max(3, Number(module.props.maxRows) || 5));
    const all = context.rows && context.rows[direction] || [];
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    const pageSeconds = Math.min(60, Math.max(3, Number(module.props.pageSeconds) || 8));
    const nowMs = Number.isFinite(context.nowMs) ? context.nowMs : Date.now();
    const page = pages > 1 ? Math.floor(nowMs / 1000 / pageSeconds) % pages : 0;
    const source = all.slice(page * perPage, page * perPage + perPage);
    const header = '<div class="fx-cols" style="' + grid + '">' + columns.map(function (column) { return '<span>' + column.label(arrivals) + '</span>'; }).join('') + '</div>';
    let body = source.map(function (row) {
      return '<div class="fx-row' + rowSceneClass(context, row[4]) + '" style="' + grid + '">' +
        columns.map(function (column) { return tableCell(column.key, row, context); }).join('') + '</div>';
    }).join('');
    for (let filler = source.length; source.length && filler < perPage; filler += 1) body += '<div class="fx-row fx-row-blank"></div>';
    if (!source.length) body = '<div class="fx-empty">No scheduled flights</div>';
    const pager = pages > 1 ? '<span class="fx-page">PAGE ' + (page + 1) + ' / ' + pages + '</span>' : '';
    return '<div class="fx-table' + surfaceClass(module) + '">' + header + body + pager + '</div>';
  }

  function advertisementContent(module, context) {
    const fallbackHeadline = context.airport.id === 'yqm' ? 'Welcome to\nNew Brunswick.' : 'Welcome to\n{airport.iata}.';
    const headline = resolveTokens(module.props.headline || fallbackHeadline, context);
    const body = resolveTokens(module.props.body || 'Airport-scoped campaign and destination content.', context);
    return '<div class="preview-ad mod-fill"><small>ADVERTISEMENT</small><b>' + headline + '</b><small>' + body + '</small></div>';
  }

  function weatherFooterContent(module, context) {
    const weather = context.weather || {};
    const temperature = weather.temperature != null ? weather.temperature + '°' + (weather.unit || 'C') : '—';
    const ticker = resolveTokens(module.props.ticker || 'Welcome to {airport.name}', context);
    const chip = context.nextLanguage ? escapeHTML(context.nextLanguage) : escapeHTML(String(context.language || 'EN').toUpperCase());
    return '<div class="fx-footer"><span class="fx-temp">' + escapeHTML(temperature) + '<small>' + escapeHTML(weather.condition || '') + '</small></span>' +
      '<span class="fx-ticker">' + ticker + '</span>' +
      '<span class="fx-foot-right"><small>' + escapeHTML(context.sceneLabel || '') + '</small><span class="fx-chip">' + chip + '</span></span></div>';
  }

  function destinationWeatherContent(module, context) {
    const departure = firstRow(context, 'departures');
    const weather = context.weather || {};
    const temperature = weather.temperature != null ? weather.temperature + '°' + (weather.unit || 'C') : '—';
    const city = escapeHTML(String(departure[1]).split(' (')[0]);
    return '<div class="preview-ad mod-fill"><small>WEATHER PREVIEW</small><b>' + city + '<br>' + escapeHTML(temperature) + '</b><small>' + escapeHTML(weather.condition ? weather.condition : 'Weather contract not connected') + '</small></div>';
  }

  function gateFlightContent(module, context) {
    const departure = firstRow(context, 'departures');
    const gate = module.props.gate ? escapeHTML(module.props.gate) : escapeHTML(departure[2]);
    return '<div class="preview-panel mod-fill mod-center' + surfaceClass(module) + '"><small>' + escapeHTML(departure[4]) + '</small>' +
      '<h1 class="mod-huge">' + escapeHTML(departure[0]) + '</h1><h2>' + escapeHTML(departure[1]) + '</h2>' +
      '<p class="' + statusClass(departure[4]) + '">Gate ' + gate + ' · ' + escapeHTML(departure[3]) + '</p></div>';
  }

  function boardingStateContent(module, context) {
    const departure = firstRow(context, 'departures');
    const text = module.props.body
      ? resolveTokens(module.props.body, context)
      : escapeHTML(departure[0]) + ' · ' + escapeHTML(departure[4]) + ' · Gate ' + escapeHTML(departure[2]);
    return '<div class="mod-band">' + text + '</div>';
  }

  function claimHeroContent(module, context) {
    const arrival = firstRow(context, 'arrivals');
    return '<div class="preview-panel mod-fill mod-center"><small>BAGGAGE CLAIM · ' + escapeHTML(arrival[4]) + '</small>' +
      '<h2 style="margin:.2em 0">' + escapeHTML(arrival[0]) + ' · ' + escapeHTML(arrival[1]) + '</h2>' +
      '<div class="mod-belt"><small>BELT</small><div>' + escapeHTML(arrival[2]) + '</div></div></div>';
  }

  function messageContent(module, context, fallbackTitle, fallbackBody) {
    const title = resolveTokens(module.props.title || fallbackTitle, context);
    const body = resolveTokens(module.props.body || fallbackBody, context);
    return '<div class="mod-band"><b>' + title + '</b><span>' + body + '</span></div>';
  }

  function airlineBrandContent(module, context) {
    const airline = escapeHTML(module.props.airline || 'AIR CANADA');
    const counters = escapeHTML(module.props.counters || 'COUNTERS 01–04');
    return '<div class="mod-header mod-checkin"><div><h2>' + airline + '</h2><small>' + escapeHTML(context.airport.name || '') + '</small></div><div></div><div><h2>' + counters + '</h2><small>' + escapeHTML(context.clock.time) + '</small></div></div>';
  }

  function flightAssignmentContent(module, context) {
    const departure = firstRow(context, 'departures');
    return '<div class="mod-dark-panel"><h2>' + escapeHTML(departure[0]) + ' · ' + escapeHTML(departure[1]) + ' · ' + escapeHTML(departure[3]) + '</h2><span class="' + statusClass(departure[4]) + '">' + escapeHTML(String(departure[4]).toUpperCase()) + '</span></div>';
  }

  function counterStatusContent(module) {
    const count = Math.min(8, Math.max(2, Number(module.props.counters) || 4));
    const cells = [];
    for (let index = 1; index <= count; index += 1) {
      cells.push('<div><b>' + String(index).padStart(2, '0') + '</b><small>OPEN</small></div>');
    }
    return '<div class="mod-counters" style="grid-template-columns:repeat(' + count + ',1fr)">' + cells.join('') + '</div>';
  }

  function queueGuidanceContent(module, context) {
    const body = resolveTokens(module.props.body || 'Queue time about 8 minutes · All lanes open', context);
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
    return '<div class="fx-text" style="' + style + '">' + resolveTokens(props.text || 'Text block — edit me', context) + '</div>';
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
      case 'oversize-message': return messageContent(module, context, 'Oversized baggage', 'Collect oversized items beside belt {arrival.belt}.');
      case 'passenger-message': return messageContent(module, context, 'Welcome', 'Check-in opens 2 hours before departure.');
      case 'airline-brand': return airlineBrandContent(module, context);
      case 'flight-assignment': return flightAssignmentContent(module, context);
      case 'counter-status': return counterStatusContent(module);
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
    return '<div class="cm-emergency"><div><small>EMERGENCY OVERRIDE</small><h1>Follow staff instructions</h1><p>' +
      escapeHTML(context.airport.name || context.airport.iata) + ' · All displays takeover · Audio paging active</p></div></div>';
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
