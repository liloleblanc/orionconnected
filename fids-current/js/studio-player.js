(function () {
  'use strict';

  const Schema = window.OrionStudioSchema;
  const Render = window.OrionStudioRender;
  const Airports = window.OrionStudioAirports;
  const StudioData = window.OrionStudioData;
  if (!Schema || !Render || !Airports || !StudioData) throw new Error('Display player dependencies did not load.');

  const PUBLISHED_KEY = 'orion_studio_published:v1';
  const DISPLAYS_KEY = 'orion_studio_displays:v1';

  const params = new URLSearchParams(location.search);
  const airport = Airports.resolve(location.hostname, location.search);
  const requestedDataMode = StudioData.runtimeMode(location.search);
  const displayId = params.get('display') || '';
  const directDocumentId = params.get('doc') || '';
  const fixedLanguage = params.get('lang') || '';

  const $ = function (selector) { return document.querySelector(selector); };

  let dataAdapter = StudioData.choose({ mode: 'preview', airport: airport });
  let dataHealth = { ok: true, source: 'preview', fallback: false };
  let pilotRouterPromise = null;
  let documentModel = null;
  let documentVersion = 0;
  let documentIsDraft = false;
  let displayName = '';
  let flightRows = [];
  let arrivalRows = [];
  let flightRowsLoaded = false;
  let weatherNow = null;
  let languageIndex = 0;

  function readStore(baseKey) {
    try { return JSON.parse(localStorage.getItem(Schema.airportStorageKey(baseKey, airport)) || '{}') || {}; }
    catch (error) { return {}; }
  }

  function resolveDocument() {
    const published = readStore(PUBLISHED_KEY);
    const displays = (function () {
      try {
        const raw = localStorage.getItem(Schema.airportStorageKey(DISPLAYS_KEY, airport));
        const list = raw ? JSON.parse(raw) : null;
        return Array.isArray(list) ? list : [];
      } catch (error) { return []; }
    })();
    if (displayId) {
      const display = displays.find(function (item) { return item.id === displayId; });
      if (display && display.assignment && published[display.assignment.documentId]) {
        const entry = published[display.assignment.documentId];
        displayName = display.name;
        documentVersion = entry.version || 1;
        documentIsDraft = false;
        return Schema.normalizeDocument(entry.document);
      }
      displayName = display ? display.name : displayId;
      return null;
    }
    if (directDocumentId) {
      if (published[directDocumentId]) {
        const entry = published[directDocumentId];
        documentVersion = entry.version || 1;
        documentIsDraft = false;
        return Schema.normalizeDocument(entry.document);
      }
      const documents = readStore(Schema.STORAGE_KEY);
      if (documents[directDocumentId]) {
        documentIsDraft = true;
        documentVersion = 0;
        return Schema.normalizeDocument(documents[directDocumentId]);
      }
    }
    return null;
  }

  function renderSetup() {
    const published = readStore(PUBLISHED_KEY);
    const displays = (function () {
      try {
        const raw = localStorage.getItem(Schema.airportStorageKey(DISPLAYS_KEY, airport));
        const list = raw ? JSON.parse(raw) : null;
        return Array.isArray(list) ? list : [];
      } catch (error) { return []; }
    })();
    const playable = displays.filter(function (display) { return display.assignment && published[display.assignment.documentId]; });
    const publishedIds = Object.keys(published);
    $('#playerFrame').hidden = true;
    $('#playerBadge').hidden = true;
    $('#playerSetup').hidden = false;
    $('#playerSetupCopy').textContent = displayId
      ? 'Nothing is published for “' + (displayName || displayId) + '” yet. Stage a document to it in the Studio’s Displays section, publish, then reload.'
      : (publishedIds.length ? 'Pick a published display below, or pass ?display=<id>.' : 'Design a display in the Studio, publish it, and stage it to a display. This player then runs it full-screen.');
    $('#playerSetupList').innerHTML = playable.map(function (display) {
      return '<a href="player.html?display=' + encodeURIComponent(display.id) + '">' + Render.escapeHTML(display.name) + '<small>' + Render.escapeHTML(display.assignment.documentName) + '</small></a>';
    }).join('') + publishedIds.map(function (documentId) {
      const entry = published[documentId];
      return '<a href="player.html?doc=' + encodeURIComponent(documentId) + '">' + Render.escapeHTML(entry.document && entry.document.name || documentId) + '<small>v' + (entry.version || 1) + ' · direct document</small></a>';
    }).join('') || '<a href="index.html">Open the Studio →</a>';
  }

  // v23970 — the clock and date in the language on screen, from the boards'
  // one clock (board-strings.js): 5:35pm in English, 17:35 in the others.
  function clockNow(language) {
    const timezone = documentModel && documentModel.airport.timezone;
    const lang = BoardStrings.isLang(language) ? language : 'en';
    const now = new Date();
    let time, date, minutes;
    try {
      time = BoardStrings.time(now, lang, timezone);
      date = BoardStrings.date(now, lang, { weekday: 'long', month: 'long', day: 'numeric' }, timezone);
      // minutes since midnight at the airport: any language's 24-hour clock
      const parts = BoardStrings.time(now, lang, timezone, { clock24: true }).split(':');
      minutes = Number(parts[0]) * 60 + Number(parts[1]);
    } catch (error) {
      time = BoardStrings.time(now, lang);
      date = BoardStrings.date(now, lang, { weekday: 'long', month: 'long', day: 'numeric' });
      minutes = now.getHours() * 60 + now.getMinutes();
    }
    return { time: time, date: date, minutes: minutes };
  }

  function baseRows(direction) {
    if (direction !== 'arrivals' && documentModel && documentModel.data && Array.isArray(documentModel.data.flights) && documentModel.data.flights.length) {
      return documentModel.data.flights.map(function (flight) { return [flight.flight, flight.city, flight.gate, flight.time, flight.status]; });
    }
    const rows = direction === 'arrivals' ? arrivalRows : flightRows;
    if (flightRowsLoaded) return rows.map(function (flight) {
      const location = direction === 'arrivals' ? (flight.belt || '—') : (flight.gate || flight.belt || '—');
      return [flight.flight, flight.city + (flight.airport ? ' (' + flight.airport + ')' : ''), location, flight.time, flight.status];
    });
    return [];
  }

  function activeLanguage() {
    if (fixedLanguage) return fixedLanguage;
    const enabled = documentModel.languages.enabled.length ? documentModel.languages.enabled : ['en'];
    return enabled[languageIndex % enabled.length];
  }

  function nextLanguageLabel() {
    if (fixedLanguage) return '';
    const enabled = documentModel.languages.enabled;
    if (enabled.length < 2) return '';
    // the next language's code alone: the footer chip is on the passenger
    // screen, and 'FR in 12s' was English whatever was showing
    return enabled[(languageIndex + 1) % enabled.length].toUpperCase();
  }

  function dataBadge() {
    if (dataHealth.fallback) return { canvas: 'PREVIEW FALLBACK', label: 'Preview fallback', fallback: true };
    if (dataHealth.source === 'operational-read-only') return { canvas: 'READ-ONLY FLIGHTS', label: 'Read-only flights', fallback: false };
    return { canvas: 'PREVIEW', label: 'Preview data', fallback: false };
  }

  function renderFrame() {
    if (!documentModel) return;
    const frame = $('#playerFrame');
    const language = Schema.LANGUAGES.find(function (item) { return item.code === activeLanguage(); }) || Schema.LANGUAGES[0];
    const clock = clockNow(language.code);
    const rows = { departures: baseRows('departures'), arrivals: baseRows('arrivals') };
    const scene = Render.evaluateStateRules(documentModel, { clock: clock, rows: rows });
    const sceneEntry = documentModel.scenes.find(function (item) { return item.id === scene; });
    const badge = dataBadge();
    const ratio = documentModel.canvas.width / documentModel.canvas.height;
    frame.hidden = false;
    $('#playerSetup').hidden = true;
    frame.dataset.direction = language.direction;
    // v23995 — the canvas is in one language at a time: say which, and its
    // direction, so Japanese, Chinese and Arabic take their own fonts and
    // Arabic reads right to left (the frame sat under the page's lang="en")
    try { BoardStrings.setLang(frame, language.code); } catch (eL) {}
    frame.style.aspectRatio = documentModel.canvas.width + ' / ' + documentModel.canvas.height;
    frame.style.width = 'min(100vw, calc(100vh * ' + ratio.toFixed(4) + '))';
    frame.innerHTML = Render.canvasHTML(documentModel, {
      airport: documentModel.airport,
      family: documentModel.family,
      canvas: documentModel.canvas,
      language: language.code,
      direction: language.direction,
      scene: scene,
      // the scene's name is the operator's; the canvas shows it only in the
      // editor (studio-render.js weatherFooterContent)
      sceneLabel: sceneEntry ? sceneEntry.label : '',
      dataBadge: badge.canvas,
      clock: clock,
      weather: weatherNow,
      rows: rows,
      nextLanguage: nextLanguageLabel(),
      brandLogo: documentModel.brand && documentModel.brand.logo || '',
      nowMs: Date.now(),
      selectedId: null,
      editing: false,
      showGrid: false,
      showSafe: false
    });
    const badgeNode = $('#playerBadge');
    badgeNode.hidden = false;
    badgeNode.className = 'player-badge' + (badge.fallback ? ' is-fallback' : '');
    badgeNode.innerHTML = '<i></i><b>' + Render.escapeHTML(displayName || documentModel.name) + '</b> ' +
      Render.escapeHTML((documentIsDraft ? 'draft preview' : 'v' + documentVersion) + ' · ' + badge.label + ' · ' + documentModel.airport.iata); // i18n-ok: operator
  }

  function ensurePilotRouter() {
    if (typeof window.adbFetch === 'function') return Promise.resolve(window.adbFetch);
    if (pilotRouterPromise) return pilotRouterPromise;
    window.AP = window.AP || {};
    window.AP[airport.iata] = window.AP[airport.iata] || { tz: airport.timezone || 'UTC' };
    window._yqmCacheAircraftMerge = window._yqmCacheAircraftMerge || async function () {};
    pilotRouterPromise = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = '../js/feed-router.js?v=24025';
      script.async = true;
      script.addEventListener('load', function () {
        if (typeof window.adbFetch === 'function') resolve(window.adbFetch);
        else reject(new Error('The shared airport flight router did not start.'));
      });
      script.addEventListener('error', function () { reject(new Error('The shared airport flight router could not be loaded.')); });
      document.head.appendChild(script);
    });
    return pilotRouterPromise;
  }

  async function refreshData() {
    try {
      const departures = await dataAdapter.flights('departures');
      const departureHealth = await dataAdapter.health();
      const arrivals = await dataAdapter.flights('arrivals');
      const arrivalHealth = await dataAdapter.health();
      if (requestedDataMode === 'pilot' && (departureHealth.fallback || arrivalHealth.fallback)) {
        const preview = StudioData.previewAdapter();
        flightRows = await preview.flights('departures');
        arrivalRows = await preview.flights('arrivals');
        dataHealth = Object.assign({}, departureHealth.fallback ? departureHealth : arrivalHealth, { fallback: true, source: 'preview' });
      } else {
        flightRows = departures;
        arrivalRows = arrivals;
        dataHealth = arrivalHealth;
      }
      try { weatherNow = await dataAdapter.weather(); } catch (error) { weatherNow = weatherNow || null; }
      flightRowsLoaded = true;
    } catch (error) {
      flightRowsLoaded = true;
      dataHealth = { ok: false, source: 'preview', fallback: true, reason: error && error.message || 'Airport data unavailable.' }; // i18n-ok: debug
    }
    renderFrame();
  }

  function reloadDocument() {
    const resolved = resolveDocument();
    if (!resolved) { documentModel = null; renderSetup(); return; }
    documentModel = resolved;
    document.title = documentModel.name + ' · Orion Display Player'; // i18n-ok: operator
    renderFrame();
  }

  window.addEventListener('storage', function (event) {
    if (!event.key) return;
    if (event.key.indexOf(PUBLISHED_KEY) === 0 || event.key.indexOf(DISPLAYS_KEY) === 0) reloadDocument();
  });

  setInterval(function () {
    if (!documentModel) { reloadDocument(); return; }
    renderFrame();
  }, 20000);

  setInterval(function () {
    if (!documentModel) return;
    const paging = documentModel.modules.some(function (module) {
      if (module.enabled === false || (module.type !== 'flight-table' && module.type !== 'claim-table')) return false;
      const direction = module.props.direction || (documentModel.family === 'bids' || documentModel.family === 'baggage' ? 'arrivals' : 'departures');
      const perPage = Math.min(12, Math.max(3, Number(module.props.maxRows) || 5));
      return baseRows(direction).length > perPage;
    });
    if (paging) renderFrame();
  }, 2000);

  let rotationCounter = 0;
  setInterval(function () {
    if (!documentModel || fixedLanguage) return;
    if (documentModel.languages.enabled.length < 2) return;
    rotationCounter += 1;
    if (rotationCounter < (documentModel.languages.rotationSeconds || 12)) return;
    rotationCounter = 0;
    languageIndex = (languageIndex + 1) % documentModel.languages.enabled.length;
    renderFrame();
  }, 1000);

  setInterval(function () { if (documentModel) refreshData(); }, 60000);

  (async function start() {
    reloadDocument();
    if (requestedDataMode === 'pilot') {
      let routerFetch = null;
      try { routerFetch = await ensurePilotRouter(); } catch (error) {}
      dataAdapter = StudioData.choose({ mode: 'pilot', airport: airport, routerFetch: routerFetch });
    }
    await refreshData();
  })();
})();
