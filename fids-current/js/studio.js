(function () {
  'use strict';

  const Schema = window.OrionStudioSchema;
  const Compat = window.OrionStudioCompat;
  const Airports = window.OrionStudioAirports;
  const StudioData = window.OrionStudioData;
  const Render = window.OrionStudioRender;
  if (!Schema || !Compat || !Airports || !StudioData || !Render) throw new Error('Airport Display Studio dependencies did not load.');

  const $ = function (selector, parent) { return (parent || document).querySelector(selector); };
  const $$ = function (selector, parent) { return Array.from((parent || document).querySelectorAll(selector)); };
  const familyCodes = { fids: 'FT', gids: 'GT', bids: 'BT', checkin: 'CI', baggage: 'BO' };
  const familyTitles = { fids: 'Flight information', gids: 'Gate information', bids: 'Baggage information', checkin: 'Check-in information', baggage: 'Baggage operations' };
  const DEFAULT_SCENE_IDS = ['default', 'highlight', 'delay', 'emergency'];
  const templateCatalog = [
    { id: 'blank', family: 'fids', name: 'Blank canvas', description: 'An empty 16:9 display — build it yourself from blocks and modules.', format: '16:9 · HD', accent: '#8290a5' },
    { id: 'yqm-departures', family: 'fids', name: 'YQM Departures — Master', description: 'Live flights, destination weather and an advertising zone.', format: '16:9 · 4K', accent: '#2f8df4' },
    { id: 'gate-welcome', family: 'gids', name: 'Gate Welcome', description: 'Airline brand, assigned flight and boarding takeover states.', format: '16:9 · HD', accent: '#24c9a0' },
    { id: 'carousel-baggage', family: 'bids', name: 'Carousel Baggage', description: 'Arrivals, belt assignments and passenger claim messages.', format: '16:9 · HD', accent: '#f9c20b' },
    { id: 'common-use-checkin', family: 'checkin', name: 'Common-use Check-in', description: 'Airline branding, counters, queues and multilingual guidance.', format: 'Landscape + portrait', accent: '#2f8df4' },
    { id: 'ramp-baggage', family: 'baggage', name: 'Ramp Baggage Ops', description: 'Unload milestones, transfers, priority bags and system health.', format: 'Ultrawide', accent: '#24c9a0' },
    { id: 'emergency-override', family: 'fids', name: 'Emergency Override', description: 'Responsive protected takeover for every display family.', format: 'All formats', accent: '#f9c20b' }
  ];
  const airportContext = Airports.resolve(location.hostname, location.search);
  const requestedDataMode = StudioData.runtimeMode(location.search);
  let dataAdapter = StudioData.choose({ mode: 'preview', airport: airportContext });
  let dataHealth = requestedDataMode === 'pilot'
    ? { ok: true, source: 'pilot-pending', fallback: false }
    : { ok: true, source: 'preview', fallback: false };
  let flightRows = [];
  let arrivalRows = [];
  let flightRowsLoaded = false;
  let weatherNow = null;
  let pilotRouterPromise = null;
  let documentModel = loadDraft();
  let selectedModuleId = documentModel.modules[0] && documentModel.modules[0].id;
  let selectedTab = 'design';
  let selectedScene = 'default';
  let stateMode = 'manual';
  let libraryTab = 'modules';
  let previewLanguage = documentModel.languages.primary;
  let zoomFactor = 1;
  let showGrid = true;
  let showSafe = false;
  let toastTimer = null;
  let clockTimer = null;
  let assetManifest = null;
  const ASSET_PAGE_SIZE = 30;

  /* ── Data presentation ─────────────────────────────────────────────── */

  function dataPresentation() {
    const familyNeedsFutureContract = documentModel && (documentModel.family === 'checkin' || documentModel.family === 'baggage');
    if (requestedDataMode === 'pilot' && familyNeedsFutureContract) {
      return {
        label: 'Preview · data contract pending',
        canvas: 'PREVIEW · DATA CONTRACT PENDING',
        className: 'is-preview',
        detail: Schema.DISPLAY_FAMILIES[documentModel.family].label + ' remains on clearly labelled preview data until its dedicated operational contract is connected.'
      };
    }
    if (dataHealth.fallback) {
      return {
        label: 'Preview fallback',
        canvas: 'PREVIEW FALLBACK',
        className: 'is-fallback',
        detail: 'The private pilot source is unavailable. Clearly labelled preview data is shown; no live display is affected.'
      };
    }
    if (dataHealth.source === 'operational-read-only') {
      return {
        label: 'Read-only flight data',
        canvas: 'READ-ONLY FLIGHTS',
        className: 'is-operational',
        detail: 'The Studio is reading flights from the existing airport route. Weather, advertising and operational modules remain separately scoped, and there is no assignment or write access.'
      };
    }
    if (dataHealth.source === 'pilot-pending') {
      return {
        label: 'Connecting read-only pilot',
        canvas: 'PILOT CONNECTING',
        className: 'is-pending',
        detail: 'The private pilot is connecting without changing the recovered live renderer.'
      };
    }
    return {
      label: 'Preview data',
      canvas: 'PREVIEW',
      className: 'is-preview',
      detail: 'Local Studio sample data. It is never assigned to a live display.'
    };
  }

  function updateDataStatus() {
    const node = $('#studioDataStatus');
    if (!node) return;
    const presentation = dataPresentation();
    node.className = 'data-status ' + presentation.className;
    node.innerHTML = '<i></i><span>' + escapeHTML(presentation.label) + '</span>';
  }

  function ensurePilotRouter() {
    if (typeof window.adbFetch === 'function') return Promise.resolve(window.adbFetch);
    if (pilotRouterPromise) return pilotRouterPromise;
    window.AP = window.AP || {};
    window.AP[airportContext.iata] = window.AP[airportContext.iata] || { tz: airportContext.timezone || 'UTC' };
    window._yqmCacheAircraftMerge = window._yqmCacheAircraftMerge || async function () {};
    pilotRouterPromise = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = '../js/feed-router.js?v=23270';
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

  /* ── Draft persistence ─────────────────────────────────────────────── */

  function loadDraft() {
    const scopedKey = Schema.airportStorageKey(Schema.DRAFT_KEY, airportContext);
    try {
      const raw = localStorage.getItem(scopedKey);
      if (raw) return Schema.normalizeDocument(JSON.parse(raw));
      const legacyUnscoped = airportContext.id === 'yqm' ? localStorage.getItem(Schema.DRAFT_KEY) : null;
      if (legacyUnscoped) {
        const migrated = Schema.normalizeDocument(JSON.parse(legacyUnscoped));
        migrated.airport = Object.assign({}, airportContext);
        migrated.deployment.host = airportContext.siteHost;
        return migrated;
      }
    } catch (error) {}
    return Schema.newDocument({ airport: airportContext, name: airportContext.iata + ' Departures · Master' });
  }

  function persistDraft() {
    try {
      const draftKey = Schema.airportStorageKey(Schema.DRAFT_KEY, documentModel.airport);
      const documentsKey = Schema.airportStorageKey(Schema.STORAGE_KEY, documentModel.airport);
      localStorage.setItem(draftKey, JSON.stringify(documentModel));
      const all = JSON.parse(localStorage.getItem(documentsKey) || '{}') || {};
      all[documentModel.id] = documentModel;
      localStorage.setItem(documentsKey, JSON.stringify(all));
      return true;
    } catch (error) {
      toast('This browser could not save the draft.');
      return false;
    }
  }

  function saveDraft(message) {
    documentModel.name = $('#studioName').value.trim() || 'Untitled display';
    documentModel.updatedAt = new Date().toISOString();
    captureHistory();
    if (!persistDraft()) return;
    $('#studioAutosave').textContent = 'Autosaved just now';
    updateSaveState('saved');
    renderScenes();
    if (message) toast(message);
  }

  /* ── Undo / redo ───────────────────────────────────────────────────── */

  const HISTORY_LIMIT = 50;
  let historyUndo = [];
  let historyRedo = [];
  let historySnapshot = null;

  function documentSnapshot() {
    const copy = JSON.parse(JSON.stringify(documentModel));
    copy.updatedAt = '';
    return JSON.stringify(copy);
  }

  function captureHistory() {
    const current = documentSnapshot();
    if (historySnapshot === null) { historySnapshot = current; return; }
    if (current === historySnapshot) return;
    historyUndo.push(historySnapshot);
    if (historyUndo.length > HISTORY_LIMIT) historyUndo.shift();
    historyRedo = [];
    historySnapshot = current;
    updateHistoryButtons();
  }

  function restoreSnapshot(snapshot) {
    documentModel = Schema.normalizeDocument(JSON.parse(snapshot));
    historySnapshot = documentSnapshot();
    if (!documentModel.modules.some(function (module) { return module.id === selectedModuleId; })) {
      selectedModuleId = documentModel.modules[0] && documentModel.modules[0].id || null;
    }
    if (!documentModel.scenes.some(function (scene) { return scene.id === selectedScene; })) selectedScene = 'default';
    persistDraft();
    render();
    updateHistoryButtons();
  }

  function undo() {
    if (!historyUndo.length) return;
    historyRedo.push(documentSnapshot());
    restoreSnapshot(historyUndo.pop());
  }

  function redo() {
    if (!historyRedo.length) return;
    historyUndo.push(documentSnapshot());
    restoreSnapshot(historyRedo.pop());
  }

  function updateHistoryButtons() {
    $('#studioUndo').disabled = !historyUndo.length;
    $('#studioRedo').disabled = !historyRedo.length;
  }

  /* ── Model helpers ─────────────────────────────────────────────────── */

  function setFamily(family) {
    if (!Schema.DISPLAY_FAMILIES[family]) return;
    const previous = documentModel.family;
    documentModel.family = family;
    documentModel.canvas.width = family === 'baggage' ? 2560 : 1920;
    if (previous !== family) {
      documentModel.modules = Schema.modulesFor(family).map(function (module, index) {
        return Schema.normalizeModule({ type: module.type, enabled: module.defaultEnabled !== false, order: index }, family, index);
      });
      selectedModuleId = documentModel.modules[0] && documentModel.modules[0].id;
    }
    render();
    saveDraft('Switched to ' + Schema.DISPLAY_FAMILIES[family].label + '.');
  }

  function moduleDefinition(module) {
    const registry = Schema.MODULE_REGISTRY[documentModel.family] || [];
    return registry.find(function (item) { return item.type === module.type; }) ||
      Schema.blockDefinition(module.type) ||
      { label: module.type, description: 'Custom module' };
  }

  function selectedModule() {
    return documentModel.modules.find(function (module) { return module.id === selectedModuleId; }) || null;
  }

  function moduleById(id) {
    return documentModel.modules.find(function (module) { return module.id === id; }) || null;
  }

  function selectModule(id, options) {
    selectedModuleId = id;
    renderModulesPane();
    renderCanvas();
    if (!options || options.inspector !== false) renderInspector();
  }

  function clampLayout(layout, keepSafe) {
    const inset = keepSafe && documentModel.canvas.safeArea ? 3 : 0;
    const result = {
      w: Math.min(100 - inset * 2, Math.max(4, layout.w)),
      h: Math.min(100 - inset * 2, Math.max(4, layout.h))
    };
    result.x = Math.min(100 - inset - result.w, Math.max(inset, layout.x));
    result.y = Math.min(100 - inset - result.h, Math.max(inset, layout.y));
    return {
      x: Math.round(result.x * 100) / 100,
      y: Math.round(result.y * 100) / 100,
      w: Math.round(result.w * 100) / 100,
      h: Math.round(result.h * 100) / 100
    };
  }

  function moduleKeepsSafe(module) {
    if (typeof module.props.keepSafe === 'boolean') return module.props.keepSafe;
    return moduleDefinition(module).keepSafe !== false;
  }

  /* ── State-scoped editing ──────────────────────────────────────────────
     The default state edits the base modules; any other selected state
     records overrides (layout, visibility, props) on that scene only —
     each state is its own design over the same module deck. */

  function overrideTargetScene() {
    if (selectedScene === 'default') return null;
    return documentModel.scenes.find(function (scene) { return scene.id === selectedScene; }) || null;
  }

  function moduleOverride(moduleId) {
    const scene = overrideTargetScene();
    return scene && scene.overrides && scene.overrides[moduleId] || null;
  }

  function overrideEntry(moduleId) {
    const scene = overrideTargetScene();
    scene.overrides = scene.overrides || {};
    scene.overrides[moduleId] = scene.overrides[moduleId] || {};
    return scene.overrides[moduleId];
  }

  function effectiveModuleById(moduleId) {
    return Render.effectiveModules(documentModel, selectedScene).find(function (module) { return module.id === moduleId; }) || null;
  }

  function commitLayout(module, layout) {
    if (overrideTargetScene()) overrideEntry(module.id).layout = layout;
    else module.layout = layout;
  }

  function commitEnabled(module, enabled) {
    if (overrideTargetScene()) overrideEntry(module.id).enabled = enabled;
    else module.enabled = enabled;
  }

  function commitProp(module, key, value) {
    if (overrideTargetScene()) {
      const entry = overrideEntry(module.id);
      entry.props = entry.props || {};
      if (value === '' || value == null) delete entry.props[key];
      else entry.props[key] = value;
      if (!Object.keys(entry.props).length) delete entry.props;
      return;
    }
    if (value === '' || value == null) delete module.props[key];
    else module.props[key] = value;
  }

  function clearOverride(moduleId) {
    const scene = overrideTargetScene();
    if (scene && scene.overrides) delete scene.overrides[moduleId];
  }

  function leaveAutoForEditing() {
    if (stateMode !== 'auto') return;
    const active = activeSceneId();
    stateMode = 'manual';
    selectedScene = active;
    $('#studioState').value = selectedScene;
    renderScenes();
    const scene = documentModel.scenes.find(function (item) { return item.id === selectedScene; });
    toast('Auto is paused — editing “' + (scene ? scene.label : selectedScene) + '”.');
  }

  /* ── Rendering ─────────────────────────────────────────────────────── */

  function clockNow() {
    const timezone = documentModel.airport.timezone;
    const now = new Date();
    let time, date, minutes;
    try {
      time = now.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
      date = now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone });
      const parts = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).split(':');
      minutes = Number(parts[0]) * 60 + Number(parts[1]);
    } catch (error) {
      time = now.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
      date = now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
      minutes = now.getHours() * 60 + now.getMinutes();
    }
    return { time: time.replace(/\./g, '').toUpperCase(), date: date, minutes: minutes };
  }

  function activeSceneId() {
    if (stateMode !== 'auto') return selectedScene;
    return Render.evaluateStateRules(documentModel, {
      clock: clockNow(),
      rows: { departures: baseRows('departures'), arrivals: baseRows('arrivals') }
    });
  }

  function nextLanguageLabel() {
    const enabled = documentModel.languages.enabled;
    if (enabled.length < 2) return '';
    const index = enabled.indexOf(previewLanguage);
    const next = enabled[(index + 1 + enabled.length) % enabled.length];
    return next.toUpperCase() + ' in ' + (documentModel.languages.rotationSeconds || 12) + 's';
  }

  function localFlights() {
    const list = documentModel.data && documentModel.data.flights;
    return Array.isArray(list) && list.length ? list : null;
  }

  function baseRows(direction) {
    if (direction !== 'arrivals') {
      const local = localFlights();
      if (local) return local.map(function (flight) { return [flight.flight, flight.city, flight.gate, flight.time, flight.status]; });
    }
    const rows = direction === 'arrivals' ? arrivalRows : flightRows;
    if (flightRowsLoaded && rows.length) return rows.map(function (flight) {
      const location = direction === 'arrivals' ? (flight.belt || '—') : (flight.gate || flight.belt || '—');
      return [flight.flight, flight.city + (flight.airport ? ' (' + flight.airport + ')' : ''), location, flight.time, flight.status];
    });
    if (flightRowsLoaded) return [];
    return (direction === 'arrivals' ? StudioData.PREVIEW_FLIGHTS.arrivals : StudioData.PREVIEW_FLIGHTS.departures).map(function (flight) {
      return [flight.flight, flight.city + ' (' + flight.airport + ')', direction === 'arrivals' ? flight.belt : flight.gate, flight.time, flight.status];
    });
  }

  function renderContext(overrides) {
    const language = Schema.LANGUAGES.find(function (item) { return item.code === previewLanguage; }) || Schema.LANGUAGES[0];
    const activeScene = activeSceneId();
    const scene = documentModel.scenes.find(function (item) { return item.id === activeScene; });
    return Object.assign({
      airport: documentModel.airport,
      family: documentModel.family,
      canvas: documentModel.canvas,
      language: language.code,
      direction: language.direction,
      scene: activeScene,
      sceneLabel: scene ? scene.label : 'Default',
      dataBadge: dataPresentation().canvas,
      clock: clockNow(),
      weather: weatherNow,
      rows: { departures: baseRows('departures'), arrivals: baseRows('arrivals') },
      nextLanguage: nextLanguageLabel(),
      brandLogo: documentModel.brand && documentModel.brand.logo || '',
      nowMs: Date.now(),
      selectedId: selectedModuleId,
      editing: true,
      showGrid: showGrid,
      showSafe: showSafe
    }, overrides || {});
  }

  function renderCanvas() {
    const canvas = $('#studioCanvas');
    const context = renderContext();
    canvas.dataset.direction = context.direction;
    canvas.style.aspectRatio = documentModel.canvas.width + ' / ' + documentModel.canvas.height;
    canvas.style.width = 'min(' + Math.round(760 * zoomFactor) + 'px, ' + Math.round(92 * zoomFactor) + '%)';
    canvas.innerHTML = Render.canvasHTML(documentModel, context);
    updateZoomLabel();
  }

  function updateZoomLabel() {
    const label = $('#studioZoomLabel');
    if (!label) return;
    const width = $('#studioCanvas').getBoundingClientRect().width;
    if (width) label.textContent = Math.round(width / documentModel.canvas.width * 100) + '%';
  }

  function renderFamilies() {
    $('#studioFamilies').innerHTML = Object.keys(Schema.DISPLAY_FAMILIES).map(function (family) {
      return '<button data-family="' + family + '" class="' + (family === documentModel.family ? 'is-active' : '') + '">' + Schema.DISPLAY_FAMILIES[family].label + '</button>';
    }).join('');
    $$('#studioFamilies button').forEach(function (button) { button.addEventListener('click', function () { setFamily(button.dataset.family); }); });
  }

  function moduleCode(definition) {
    return definition.label.split(/\s+/).map(function (word) { return word[0]; }).join('').slice(0, 2).toUpperCase();
  }

  function renderModulesPane() {
    if (libraryTab === 'layers') { renderLayers(); return; }
    if (libraryTab === 'blocks') {
      $('#studioModules').innerHTML = '<div class="library-note">Blocks package reusable content fragments — media playlists, message sets and table presets. They arrive with the media library contract.</div>';
      return;
    }
    const query = $('#studioSearch').value.trim().toLowerCase();
    const effectiveList = Render.effectiveModules(documentModel, selectedScene);
    $('#studioModules').innerHTML = effectiveList.slice().sort(function (a, b) { return a.order - b.order; }).map(function (module) {
      const definition = moduleDefinition(module);
      if (query && (definition.label + ' ' + definition.description).toLowerCase().indexOf(query) === -1) return '';
      const overridden = !!moduleOverride(module.id);
      return '<button class="module-card ' + (module.id === selectedModuleId ? 'is-active' : '') + (module.enabled === false ? ' is-off' : '') + '" data-module="' + module.id + '" style="' + (module.enabled === false ? 'opacity:.5' : '') + '">' +
        '<span class="module-code">' + moduleCode(definition) + '</span>' +
        '<span><strong>' + escapeHTML(definition.label) + (overridden ? ' <i class="override-dot" title="Overridden in this state"></i>' : '') + '</strong><small>' + escapeHTML(definition.description) + '</small></span>' +
        '<span data-toggle="' + module.id + '" title="' + (module.enabled === false ? 'Show in this state' : 'Hide in this state') + '">' + (module.enabled === false ? '○' : '●') + '</span></button>';
    }).join('');
    $$('#studioModules .module-card').forEach(function (button) {
      button.addEventListener('click', function (event) {
        const toggle = event.target.closest('[data-toggle]');
        if (toggle) {
          const module = moduleById(toggle.dataset.toggle);
          const effective = effectiveModuleById(module.id) || module;
          commitEnabled(module, effective.enabled === false);
          renderModulesPane(); renderCanvas(); renderInspector();
          saveDraft();
          return;
        }
        selectModule(button.dataset.module);
      });
    });
  }

  function renderLayers() {
    const effectiveList = Render.effectiveModules(documentModel, selectedScene);
    const ordered = effectiveList.slice().sort(function (a, b) { return b.order - a.order; });
    $('#studioModules').innerHTML = '<div class="layer-list">' + ordered.map(function (module) {
      const definition = moduleDefinition(module);
      const overridden = !!moduleOverride(module.id);
      return '<div class="layer-row' + (module.id === selectedModuleId ? ' is-active' : '') + (module.enabled === false ? ' is-off' : '') + '" data-layer="' + module.id + '">' +
        '<span>' + escapeHTML(definition.label) + (overridden ? ' <i class="override-dot" title="Overridden in this state"></i>' : '') + '</span>' +
        '<button data-move="up" title="Bring forward">↑</button>' +
        '<button data-move="down" title="Send back">↓</button>' +
        '<button data-visibility title="' + (module.enabled === false ? 'Show in this state' : 'Hide in this state') + '">' + (module.enabled === false ? '○' : '●') + '</button></div>';
    }).join('') + '</div><div class="library-note">Top of the list paints in front. Layer order is shared by every state; visibility and position can differ per state.</div>';
    $$('#studioModules .layer-row').forEach(function (row) {
      row.addEventListener('click', function (event) {
        const module = moduleById(row.dataset.layer);
        const move = event.target.closest('[data-move]');
        const visibility = event.target.closest('[data-visibility]');
        if (move) {
          const direction = move.dataset.move === 'up' ? 1 : -1;
          const sorted = documentModel.modules.slice().sort(function (a, b) { return a.order - b.order; });
          const index = sorted.indexOf(module);
          const swap = sorted[index + direction];
          if (swap) {
            const keep = module.order; module.order = swap.order; swap.order = keep;
            renderModulesPane(); renderCanvas(); saveDraft();
          }
          return;
        }
        if (visibility) {
          const effective = effectiveModuleById(module.id) || module;
          commitEnabled(module, effective.enabled === false);
          renderModulesPane(); renderCanvas(); renderInspector(); saveDraft();
          return;
        }
        selectModule(row.dataset.layer);
      });
    });
  }

  function sceneRuleGlyph(scene) {
    if (!scene.rule || scene.rule.kind === 'none') return '';
    if (scene.rule.kind === 'time') return '<span class="scene-rule-glyph" title="Time window ' + escapeHTML(scene.rule.from + '–' + scene.rule.to) + '">◷</span>';
    const condition = Schema.SCENE_RULE_CONDITIONS.find(function (item) { return item.id === scene.rule.condition; });
    return '<span class="scene-rule-glyph" title="' + escapeHTML(condition ? condition.label : 'Data rule') + '">⚡</span>';
  }

  function renderScenes() {
    const autoActive = stateMode === 'auto' ? activeSceneId() : null;
    const ratio = documentModel.canvas.width + ' / ' + documentModel.canvas.height;
    $('#studioScenes').innerHTML = documentModel.scenes.map(function (scene) {
      const active = stateMode === 'auto' ? scene.id === autoActive : scene.id === selectedScene;
      const thumbContext = renderContext({ scene: scene.id, sceneLabel: scene.label, editing: false, selectedId: null, showGrid: false, showSafe: false });
      return '<button class="scene-card ' + (active ? 'is-active' : '') + '" data-scene="' + escapeHTML(scene.id) + '">' +
        '<span class="scene-thumb" style="aspect-ratio:' + ratio + '">' + Render.canvasHTML(documentModel, thumbContext) + '</span>' +
        '<span class="scene-gear" data-edit-scene="' + escapeHTML(scene.id) + '" title="State settings">⚙</span>' +
        '<span class="scene-name">' + escapeHTML(scene.label) + sceneRuleGlyph(scene) +
        (stateMode === 'auto' && scene.id === autoActive ? '<span class="scene-auto-badge">AUTO</span>' : '') + '</span></button>';
    }).join('');
    const picker = $('#studioState');
    picker.innerHTML = '<option value="__auto">Auto — follow rules</option>' + documentModel.scenes.map(function (scene) {
      return '<option value="' + escapeHTML(scene.id) + '">' + escapeHTML(scene.label) + '</option>';
    }).join('');
    picker.value = stateMode === 'auto' ? '__auto' : selectedScene;
    const hint = $('#studioSceneHint');
    if (hint) {
      if (stateMode === 'auto') {
        const scene = documentModel.scenes.find(function (item) { return item.id === autoActive; });
        hint.textContent = 'Auto — showing “' + (scene ? scene.label : 'Default') + '” by rule';
      } else if (selectedScene !== 'default') {
        const scene = documentModel.scenes.find(function (item) { return item.id === selectedScene; });
        hint.textContent = 'Editing “' + (scene ? scene.label : selectedScene) + '” — changes stay in this state';
      } else hint.textContent = '';
    }
    $$('#studioScenes .scene-card').forEach(function (button) {
      button.addEventListener('click', function (event) {
        const edit = event.target.closest('[data-edit-scene]');
        if (edit) { editStateDialog(edit.dataset.editScene); return; }
        stateMode = 'manual';
        selectedScene = button.dataset.scene;
        renderScenes(); renderModulesPane(); renderCanvas(); renderInspector();
      });
    });
  }

  /* ── Inspector ─────────────────────────────────────────────────────── */

  function pxFromPercent(value, axis) {
    const base = axis === 'x' ? documentModel.canvas.width : documentModel.canvas.height;
    return Math.round(value / 100 * base);
  }

  function percentFromPx(value, axis) {
    const base = axis === 'x' ? documentModel.canvas.width : documentModel.canvas.height;
    return (Number(value) || 0) / base * 100;
  }

  function switchHTML(id, on) {
    return '<i class="switch' + (on ? '' : ' is-off') + '" data-switch="' + id + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></i>';
  }

  function propsFields(module) {
    const type = module.type;
    if (type === 'flight-table' || type === 'claim-table') {
      const direction = module.props.direction || (documentModel.family === 'bids' || documentModel.family === 'baggage' ? 'arrivals' : 'departures');
      const hidden = module.props.columns && typeof module.props.columns === 'object' ? module.props.columns : {};
      const columnChips = [['logo', 'Logo'], ['airline', 'Airline'], ['destination', 'To/From'], ['flight', 'Flight'], ['gate', 'Gate'], ['time', 'Time'], ['status', 'Status']].map(function (item) {
        return '<button type="button" class="col-chip' + (hidden[item[0]] === false ? ' is-off' : '') + '" data-col="' + item[0] + '">' + item[1] + '</button>';
      }).join('');
      return '<div class="field"><label>Direction</label><select data-prop="direction"><option value="departures"' + (direction === 'departures' ? ' selected' : '') + '>Departures</option><option value="arrivals"' + (direction === 'arrivals' ? ' selected' : '') + '>Arrivals</option></select></div>' +
        '<div class="field-grid" style="margin-top:9px"><div class="field"><label>Rows per page</label><input data-prop="maxRows" type="number" min="3" max="12" value="' + (Number(module.props.maxRows) || 5) + '"></div>' +
        '<div class="field"><label>Page every (s)</label><input data-prop="pageSeconds" type="number" min="3" max="60" value="' + (Number(module.props.pageSeconds) || 8) + '"></div></div>' +
        '<div class="field" style="margin-top:9px"><label>Columns</label><div class="col-toggles">' + columnChips + '</div></div>' +
        '<div class="inspector-actions" style="margin-top:9px"><button data-action="edit-flights" type="button">✈ Edit the flight list</button></div>';
    }
    if (type === 'advertisement') {
      return '<div class="field"><label>Headline</label><textarea data-prop="headline" placeholder="Welcome to&#10;New Brunswick.">' + escapeHTML(module.props.headline || '') + '</textarea></div>' +
        '<div class="field" style="margin-top:9px"><label>Supporting line</label><input data-prop="body" value="' + escapeHTML(module.props.body || '') + '" placeholder="Airport-scoped campaign content."></div>';
    }
    if (type === 'gate-flight') {
      return '<div class="field"><label>Gate override</label><input data-prop="gate" value="' + escapeHTML(module.props.gate || '') + '" placeholder="From live data"></div>';
    }
    if (type === 'boarding-state' || type === 'queue-guidance') {
      return '<div class="field"><label>Message</label><textarea data-prop="body" placeholder="Tokens like {flight.flight} resolve live.">' + escapeHTML(module.props.body || '') + '</textarea></div>';
    }
    if (type === 'oversize-message' || type === 'passenger-message') {
      return '<div class="field"><label>Title</label><input data-prop="title" value="' + escapeHTML(module.props.title || '') + '"></div>' +
        '<div class="field" style="margin-top:9px"><label>Message</label><textarea data-prop="body">' + escapeHTML(module.props.body || '') + '</textarea></div>';
    }
    if (type === 'airline-brand') {
      return '<div class="field"><label>Airline</label><input data-prop="airline" value="' + escapeHTML(module.props.airline || '') + '" placeholder="AIR CANADA"></div>' +
        '<div class="field" style="margin-top:9px"><label>Counter label</label><input data-prop="counters" value="' + escapeHTML(module.props.counters || '') + '" placeholder="COUNTERS 01–04"></div>';
    }
    if (type === 'counter-status') {
      return '<div class="field"><label>Counters</label><input data-prop="counters" type="number" min="2" max="8" value="' + (Number(module.props.counters) || 4) + '"></div>';
    }
    if (type === 'airport-header') {
      const hasLogo = !!(documentModel.brand && documentModel.brand.logo);
      return '<div class="field"><label>Title override</label><input data-prop="title" value="' + escapeHTML(module.props.title || '') + '" placeholder="Translated automatically"></div>' +
        '<div class="field" style="margin-top:9px"><label>Brand name</label><input data-prop="brandName" value="' + escapeHTML(module.props.brandName || '') + '" placeholder="' + escapeHTML(documentModel.airport.name || '') + '"></div>' +
        '<div class="field" style="margin-top:9px"><label>Logo panel</label><select data-prop="panel"><option value=""' + (module.props.panel !== 'dark' ? ' selected' : '') + '>Light — for colour and dark logos</option><option value="dark"' + (module.props.panel === 'dark' ? ' selected' : '') + '>Dark — for white logos</option></select></div>' +
        '<div class="field" style="margin-top:9px"><label>Airport logo</label><div class="inspector-actions">' +
        '<button data-action="brand-pick" type="button">🖼 Choose from asset library</button>' +
        '<button data-action="brand-upload" type="button">⬆ Upload a logo file…</button>' +
        (hasLogo ? '<button data-action="brand-clear" type="button">Remove logo (use the Orion mark)</button>' : '') +
        '</div><input type="file" id="brandLogoFile" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden></div>';
    }
    if (type === 'weather') {
      return '<div class="field"><label>Ticker message</label><input data-prop="ticker" value="' + escapeHTML(module.props.ticker || '') + '" placeholder="Welcome to {airport.name}"></div>';
    }
    if (type === 'text') {
      return '<div class="field"><label>Text</label><textarea data-prop="text" placeholder="Use {tokens} for live data">' + escapeHTML(module.props.text || '') + '</textarea></div>' +
        '<div class="field-grid" style="margin-top:9px"><div class="field"><label>Size</label><input data-prop="size" type="number" min="0.6" max="12" step="0.2" value="' + (Number(module.props.size) || 2) + '"></div>' +
        '<div class="field"><label>Weight</label><select data-prop="weight"><option value="400"' + (Number(module.props.weight) === 400 ? ' selected' : '') + '>Regular</option><option value="700"' + (!module.props.weight || Number(module.props.weight) === 700 ? ' selected' : '') + '>Bold</option><option value="900"' + (Number(module.props.weight) === 900 ? ' selected' : '') + '>Black</option></select></div></div>' +
        '<div class="field-grid" style="margin-top:9px"><div class="field"><label>Colour</label><input data-prop="color" type="color" value="' + escapeHTML(/^#/.test(module.props.color || '') ? module.props.color : '#ffffff') + '"></div>' +
        '<div class="field"><label>Align</label><select data-prop="align"><option value=""' + (!module.props.align ? ' selected' : '') + '>Left</option><option value="center"' + (module.props.align === 'center' ? ' selected' : '') + '>Centre</option><option value="right"' + (module.props.align === 'right' ? ' selected' : '') + '>Right</option></select></div></div>';
    }
    if (type === 'box') {
      return '<div class="field-grid"><div class="field"><label>Fill</label><input data-prop="fill" type="color" value="' + escapeHTML(/^#/.test(module.props.fill || '') ? module.props.fill : '#f9c20b') + '"></div>' +
        '<div class="field"><label>Opacity %</label><input data-prop="opacity" type="number" min="5" max="100" value="' + (Number(module.props.opacity) || 100) + '"></div></div>' +
        '<div class="field-grid" style="margin-top:9px"><div class="field"><label>Corner radius</label><input data-prop="radius" type="number" min="0" max="20" step="0.5" value="' + (Number(module.props.radius) || 0) + '"></div>' +
        '<div class="field"><label>Skew °</label><input data-prop="skew" type="number" min="-45" max="45" value="' + (Number(module.props.skew) || 0) + '"></div></div>';
    }
    if (type === 'image') {
      return '<div class="field"><label>Asset</label><input data-prop="src" value="' + escapeHTML(module.props.src || '') + '" placeholder="Pick from the library →"></div>' +
        '<div class="inspector-actions" style="margin-top:9px"><button data-action="pick-image" type="button">🖼 Choose from asset library</button></div>' +
        '<div class="field" style="margin-top:9px"><label>Fit</label><select data-prop="fit"><option value=""' + (!module.props.fit ? ' selected' : '') + '>Contain</option><option value="cover"' + (module.props.fit === 'cover' ? ' selected' : '') + '>Cover</option></select></div>';
    }
    if (type === 'clock') {
      return '<div class="field-grid"><div class="field"><label>Size</label><input data-prop="size" type="number" min="1" max="12" step="0.2" value="' + (Number(module.props.size) || 3.2) + '"></div>' +
        '<div class="field"><label>Colour</label><input data-prop="color" type="color" value="' + escapeHTML(/^#/.test(module.props.color || '') ? module.props.color : '#ffffff') + '"></div></div>' +
        '<div class="switch-row"><span>Show the date</span>' + switchHTML('clock-date', module.props.showDate !== false) + '</div>';
    }
    return '';
  }

  function renderInspector() {
    const module = selectedModule();
    $('#studioSelectedCode').textContent = familyCodes[documentModel.family];
    $('#studioSelectedLabel').textContent = module ? moduleDefinition(module).label : 'Nothing selected';
    let html = '';
    if (!module) {
      html = '<section class="inspector-section"><h3>Canvas</h3><p style="color:var(--muted);font-size:10px;line-height:1.5">Select a module on the canvas or in the Build pane to edit it. Canvas: ' +
        documentModel.canvas.width + ' × ' + documentModel.canvas.height + '.</p></section>';
    } else if (selectedTab === 'design') {
      const effective = effectiveModuleById(module.id) || module;
      const layout = effective.layout;
      const stateScene = overrideTargetScene();
      const overridden = !!moduleOverride(module.id);
      const statePill = stateScene
        ? '<div class="state-pill' + (overridden ? ' has-override' : '') + '">State: ' + escapeHTML(stateScene.label) + (overridden ? ' · overridden' : ' · inherits Default') + (overridden ? '<button data-action="clear-override" title="Return this module to its Default design in this state">Reset</button>' : '') + '</div>'
        : '';
      html = statePill + '<section class="inspector-section"><h3>Layout</h3><div class="field-grid">' +
        '<div class="field"><label>X</label><input data-layout="x" inputmode="numeric" value="' + pxFromPercent(layout.x, 'x') + ' px"></div>' +
        '<div class="field"><label>Y</label><input data-layout="y" inputmode="numeric" value="' + pxFromPercent(layout.y, 'y') + ' px"></div>' +
        '<div class="field"><label>Width</label><input data-layout="w" inputmode="numeric" value="' + pxFromPercent(layout.w, 'x') + ' px"></div>' +
        '<div class="field"><label>Height</label><input data-layout="h" inputmode="numeric" value="' + pxFromPercent(layout.h, 'y') + ' px"></div></div>' +
        '<div class="switch-row"><span>Show in this state</span>' + switchHTML('enabled', effective.enabled !== false) + '</div>' +
        '<div class="switch-row"><span>Lock aspect ratio</span>' + switchHTML('lockAspect', module.props.lockAspect === true) + '</div>' +
        '<div class="switch-row"><span>Keep inside safe area</span>' + switchHTML('keepSafe', moduleKeepsSafe(module)) + '</div></section>' +
        '<section class="inspector-section"><h3>Appearance</h3>' +
        '<div class="field"><label>Surface</label><select data-prop="surface"><option value=""' + (!effective.props.surface ? ' selected' : '') + '>Airline / airport theme</option><option value="glass"' + (effective.props.surface === 'glass' ? ' selected' : '') + '>Glass</option><option value="solid"' + (effective.props.surface === 'solid' ? ' selected' : '') + '>Solid</option></select></div>' +
        (propsFields(effective) ? '<div style="margin-top:9px"></div>' + propsFields(effective) : '') + '</section>' +
        '<section class="inspector-section inspector-actions"><button data-action="duplicate">⧉ Duplicate module</button><button data-action="remove" class="is-danger">' + (stateScene ? 'Hide in this state' : 'Remove from this display') + '</button></section>';
    } else if (selectedTab === 'data') {
      const dataView = dataPresentation();
      html = '<section class="inspector-section"><h3>Data binding</h3><div class="field"><label>Source</label><select><option>' + escapeHTML(dataView.label) + '</option></select></div>' +
        '<div class="field" style="margin-top:9px"><label>Airport</label><input value="' + escapeHTML(documentModel.airport.iata + ' · ' + documentModel.airport.siteHost) + '" readonly></div>' +
        '<div class="field" style="margin-top:9px"><label>Access</label><input value="Read only" readonly></div></section>' +
        '<section class="inspector-section"><h3>Live tokens</h3><p style="color:var(--muted);font-size:9px;margin:0 0 8px">Use these in any text property. Click to copy.</p><div class="token-list">' +
        Render.tokenReference().map(function (token) { return '<button class="token-chip" data-token="{' + token + '}">{' + token + '}</button>'; }).join('') + '</div></section>' +
        '<section class="inspector-section"><h3>Connection & fallback</h3><p style="color:var(--muted);font-size:10px;line-height:1.5">' + escapeHTML(dataView.detail) + '</p></section>';
    } else if (selectedTab === 'languages') {
      html = '<section class="inspector-section"><h3>' + documentModel.languages.enabled.length + ' enabled languages</h3><div class="language-grid">' +
        Schema.LANGUAGES.map(function (language) { return '<button class="language-chip ' + (language.code === previewLanguage ? 'is-active' : '') + '" data-language="' + language.code + '">' + language.code.toUpperCase() + '</button>'; }).join('') +
        '</div><div class="switch-row"><span>English fallback</span><i class="switch"></i></div><div class="switch-row"><span>Mirror canvas for RTL</span><i class="switch"></i></div></section>';
    } else {
      html = '<section class="inspector-section"><h3>Motion</h3><div class="field"><label>Entrance</label><select><option>Fade + rise</option><option>Slide</option><option>None</option></select></div><div class="field" style="margin-top:9px"><label>Duration</label><input value="400 ms"></div><div class="switch-row"><span>Reduced-motion fallback</span><i class="switch"></i></div></section>';
    }
    $('#studioInspectorBody').innerHTML = html;
    bindInspector(module);
  }

  function bindInspector(module) {
    $$('.language-chip').forEach(function (button) {
      button.addEventListener('click', function () { previewLanguage = button.dataset.language; renderInspector(); renderCanvas(); });
    });
    $$('[data-token]').forEach(function (button) {
      button.addEventListener('click', function () {
        const token = button.dataset.token;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(token).catch(function () {});
        toast(token + ' copied.');
      });
    });
    if (!module) return;
    $$('#studioInspectorBody [data-layout]').forEach(function (input) {
      input.addEventListener('change', function () {
        const axis = input.dataset.layout === 'x' || input.dataset.layout === 'w' ? 'x' : 'y';
        const effective = effectiveModuleById(module.id) || module;
        const next = Object.assign({}, effective.layout);
        next[input.dataset.layout] = percentFromPx(parseFloat(input.value), axis);
        commitLayout(module, clampLayout(next, moduleKeepsSafe(module)));
        renderCanvas(); renderInspector(); saveDraft();
      });
    });
    $$('#studioInspectorBody [data-switch]').forEach(function (control) {
      control.addEventListener('click', function () {
        const key = control.dataset.switch;
        if (key === 'enabled') {
          const effective = effectiveModuleById(module.id) || module;
          commitEnabled(module, effective.enabled === false);
        } else if (key === 'clock-date') {
          const effective = effectiveModuleById(module.id) || module;
          commitProp(module, 'showDate', effective.props.showDate === false);
        } else if (key === 'lockAspect') module.props.lockAspect = module.props.lockAspect !== true;
        else if (key === 'keepSafe') {
          module.props.keepSafe = !moduleKeepsSafe(module);
          if (moduleKeepsSafe(module)) commitLayout(module, clampLayout((effectiveModuleById(module.id) || module).layout, true));
        }
        renderModulesPane(); renderCanvas(); renderInspector(); saveDraft();
      });
    });
    $$('#studioInspectorBody [data-prop]').forEach(function (input) {
      input.addEventListener('change', function () {
        const value = input.type === 'number' ? Number(input.value) : input.value;
        commitProp(module, input.dataset.prop, value);
        renderCanvas(); saveDraft();
      });
    });
    $$('#studioInspectorBody .col-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const effective = effectiveModuleById(module.id) || module;
        const columns = Object.assign({}, effective.props.columns);
        columns[chip.dataset.col] = columns[chip.dataset.col] === false;
        commitProp(module, 'columns', columns);
        renderCanvas(); renderInspector(); saveDraft();
      });
    });
    $$('#studioInspectorBody [data-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        const action = button.dataset.action;
        if (action === 'duplicate') { duplicateModule(module); return; }
        if (action === 'edit-flights') { openFlightsEditor(); return; }
        if (action === 'pick-image') {
          openAssetPicker(function (path) { commitProp(module, 'src', path); renderCanvas(); renderInspector(); saveDraft('Image placed.'); });
          return;
        }
        if (action === 'brand-pick') {
          openAssetPicker(function (path) { documentModel.brand.logo = path; renderCanvas(); renderInspector(); saveDraft('Airport logo updated.'); });
          return;
        }
        if (action === 'brand-upload') { $('#brandLogoFile').click(); return; }
        if (action === 'brand-clear') {
          documentModel.brand.logo = '';
          renderCanvas(); renderInspector(); saveDraft('Logo removed — the Orion mark is back.');
          return;
        }
        if (action === 'clear-override') {
          clearOverride(module.id);
          renderModulesPane(); renderCanvas(); renderInspector(); saveDraft('State override cleared.');
          return;
        }
        removeModule(module);
      });
    });
    const logoFile = $('#brandLogoFile');
    if (logoFile) logoFile.addEventListener('change', function () {
      const file = logoFile.files && logoFile.files[0];
      if (!file) return;
      if (file.size > 400 * 1024) { toast('Keep the logo under 400 KB — this one is ' + Math.round(file.size / 1024) + ' KB.'); return; }
      const reader = new FileReader();
      reader.onload = function () {
        documentModel.brand.logo = String(reader.result);
        renderCanvas(); renderInspector(); saveDraft('Logo uploaded.');
      };
      reader.readAsDataURL(file);
    });
  }

  function openAssetPicker(onPick, requestedQuery) {
    const query = String(requestedQuery || '').trim().toLowerCase();
    function body() {
      if (!assetManifest || !Array.isArray(assetManifest.items)) return '<div class="section-empty">Loading the asset catalog…</div>';
      const items = assetManifest.items.filter(function (item) {
        if (item.category === 'weather') return false;
        if (!query) return true;
        return [item.name, item.file, item.iata, item.group, item.category].some(function (value) { return String(value || '').toLowerCase().includes(query); });
      }).slice(0, 60);
      if (!items.length) return '<div class="section-empty">No assets match.</div>';
      return '<div class="picker-grid">' + items.map(function (item) {
        return '<button class="picker-item" data-pick-src="' + escapeHTML(item.path) + '" title="' + escapeHTML(item.name) + '"><img src="' + escapeHTML(item.path) + '" loading="lazy" alt=""><small>' + escapeHTML(item.name) + '</small></button>';
      }).join('') + '</div>';
    }
    $('#studioDialogContent').innerHTML = '<h2 class="dialog-title">Asset library</h2><p class="dialog-copy">' +
      (assetManifest && assetManifest._meta ? assetManifest._meta.total + ' approved assets on this site. ' : '') + 'Click one to place it in the image block.</p>' +
      '<label class="asset-search" style="display:block;margin-bottom:12px"><input id="pickerSearch" type="search" value="' + escapeHTML(requestedQuery || '') + '" placeholder="Search logos, backgrounds, advertising…" style="width:100%"></label>' +
      '<div id="pickerBody">' + body() + '</div>';
    if (!$('#studioDialog').open) $('#studioDialog').showModal();
    const search = $('#pickerSearch');
    search.addEventListener('input', function () {
      openAssetPicker(onPick, search.value);
      const next = $('#pickerSearch');
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    });
    $$('[data-pick-src]').forEach(function (button) {
      button.addEventListener('click', function () {
        $('#studioDialog').close();
        onPick(button.dataset.pickSrc);
      });
    });
    if (!assetManifest) {
      fetch('../assets/asset-manifest.json').then(function (response) { return response.json(); }).then(function (manifest) {
        assetManifest = manifest;
        if ($('#pickerBody')) openAssetPicker(onPick, $('#pickerSearch') && $('#pickerSearch').value);
      }).catch(function () { toast('The asset catalog needs the full site — upload a file instead.'); });
    }
  }

  /* ── Flight list editor ────────────────────────────────────────────── */

  const FLIGHT_STATUSES = ['On time', 'Boarding', 'Gate closed', 'Delayed', 'Cancelled', 'Departed', 'En route', 'Arrived'];

  function flightEditorRow(flight) {
    const statusOptions = FLIGHT_STATUSES.map(function (status) {
      return '<option' + (flight.status === status ? ' selected' : '') + '>' + status + '</option>';
    }).join('');
    return '<div class="flt-row">' +
      '<input data-f="flight" value="' + escapeHTML(flight.flight) + '" placeholder="AC 1983" maxlength="12">' +
      '<input data-f="city" value="' + escapeHTML(flight.city) + '" placeholder="Toronto" maxlength="40">' +
      '<input data-f="gate" value="' + escapeHTML(flight.gate) + '" placeholder="4" maxlength="6">' +
      '<input data-f="time" value="' + escapeHTML(flight.time) + '" placeholder="5:30 AM" maxlength="12">' +
      '<select data-f="status">' + statusOptions + '</select>' +
      '<button type="button" class="flt-del" title="Remove this flight">✕</button></div>';
  }

  function openFlightsEditor() {
    const current = localFlights() || baseRows('departures').map(function (row) {
      return { flight: row[0], city: String(row[1]).replace(/\s*\([A-Z]{3}\)$/, ''), gate: row[2], time: row[3], status: row[4] };
    });
    $('#studioDialogContent').innerHTML = '<h2 class="dialog-title">Flight list</h2>' +
      '<p class="dialog-copy">These flights drive every departures table, token and state rule in this document. On the production site the live feed takes over; this list is yours to test with.</p>' +
      '<div class="flt-head"><span>Flight</span><span>Destination</span><span>Gate</span><span>Time</span><span>Status</span><span></span></div>' +
      '<div class="flt-list" id="fltList">' + current.map(flightEditorRow).join('') + '</div>' +
      '<div class="dialog-actions" style="justify-content:space-between"><span><button class="button button-secondary" id="fltAdd" type="button">＋ Add flight</button> ' +
      '<button class="button button-secondary" id="fltFeed" type="button" title="Clear this list and read the airport feed again">Use the live feed</button></span>' +
      '<span><button class="button button-secondary" value="close">Cancel</button> <button class="button button-primary" id="fltSave" type="button">Save flights</button></span></div>';
    $('#studioDialog').showModal();
    function collect() {
      return $$('#fltList .flt-row').map(function (row) {
        const value = {};
        $$('input,select', row).forEach(function (input) { value[input.dataset.f] = input.value; });
        return Schema.normalizeFlightRow(value);
      }).filter(function (flight) { return flight.flight || flight.city; });
    }
    $('#fltAdd').addEventListener('click', function () {
      if ($$('#fltList .flt-row').length >= 40) { toast('40 flights is the ceiling for one board.'); return; }
      $('#fltList').insertAdjacentHTML('beforeend', flightEditorRow({ flight: '', city: '', gate: '', time: '', status: 'On time' }));
      const rows = $$('#fltList .flt-row');
      $('input', rows[rows.length - 1]).focus();
    });
    $('#fltList').addEventListener('click', function (event) {
      const remove = event.target.closest('.flt-del');
      if (remove) remove.parentElement.remove();
    });
    $('#fltFeed').addEventListener('click', function () {
      documentModel.data.flights = [];
      $('#studioDialog').close();
      renderCanvas(); renderInspector();
      saveDraft('Back on the airport feed.');
    });
    $('#fltSave').addEventListener('click', function () {
      documentModel.data.flights = collect();
      $('#studioDialog').close();
      renderCanvas(); renderInspector();
      saveDraft(documentModel.data.flights.length + ' flights on the board.');
    });
  }

  function duplicateModule(module) {
    const copy = Schema.normalizeModule({
      type: module.type,
      enabled: module.enabled,
      order: documentModel.modules.length,
      props: JSON.parse(JSON.stringify(module.props)),
      layout: { x: module.layout.x + 2, y: module.layout.y + 2, w: module.layout.w, h: module.layout.h }
    }, documentModel.family, documentModel.modules.length);
    documentModel.modules.push(copy);
    selectModule(copy.id);
    saveDraft('Module duplicated.');
  }

  function removeModule(module) {
    const stateScene = overrideTargetScene();
    if (stateScene) {
      commitEnabled(module, false);
      renderModulesPane(); renderCanvas(); renderInspector();
      saveDraft('Hidden in “' + stateScene.label + '” only. Remove it in the Default state to delete it everywhere.');
      return;
    }
    documentModel.modules = documentModel.modules.filter(function (item) { return item.id !== module.id; });
    documentModel.scenes.forEach(function (scene) {
      if (scene.overrides) delete scene.overrides[module.id];
    });
    selectedModuleId = documentModel.modules[0] && documentModel.modules[0].id || null;
    renderModulesPane(); renderCanvas(); renderInspector();
    saveDraft('Module removed from this display.');
  }

  function paletteOptions(list) {
    return list.map(function (definition) {
      return '<button class="palette-option" data-add-type="' + definition.type + '"><span class="module-code">' + moduleCode(definition) + '</span><span><strong>' + escapeHTML(definition.label) + '</strong><small>' + escapeHTML(definition.description) + '</small></span></button>';
    }).join('');
  }

  function openModulePalette() {
    const registry = Schema.MODULE_REGISTRY[documentModel.family] || [];
    $('#studioDialogContent').innerHTML = '<h2 class="dialog-title">Add to this display</h2>' +
      '<p class="dialog-copy">Building blocks are free-form — place them anywhere, style them, and use live {tokens}. ' +
      escapeHTML(Schema.DISPLAY_FAMILIES[documentModel.family].label) + ' modules carry their own data contract and fallback behaviour.</p>' +
      '<h3 class="palette-heading">Building blocks</h3><div class="palette-grid">' + paletteOptions(Schema.BUILDING_BLOCKS) + '</div>' +
      '<h3 class="palette-heading">' + escapeHTML(Schema.DISPLAY_FAMILIES[documentModel.family].label) + ' modules</h3><div class="palette-grid">' + paletteOptions(registry) + '</div>';
    $('#studioDialog').showModal();
    $$('[data-add-type]').forEach(function (button) {
      button.addEventListener('click', function () {
        $('#studioDialog').close();
        addModuleOfType(button.dataset.addType);
      });
    });
  }

  function addModuleOfType(type) {
    const layout = Schema.moduleLayoutDefaults(documentModel.family, type);
    const occupied = documentModel.modules.some(function (module) { return module.type === type; });
    if (occupied) { layout.x = Math.min(90, layout.x + 4); layout.y = Math.min(90, layout.y + 4); }
    const module = Schema.normalizeModule({ type: type, order: documentModel.modules.length, layout: layout }, documentModel.family, documentModel.modules.length);
    documentModel.modules.push(module);
    selectModule(module.id);
    renderScenes();
    saveDraft('Module added.');
    if (type === 'image') {
      openAssetPicker(function (path) { commitProp(module, 'src', path); renderCanvas(); renderInspector(); saveDraft('Image placed.'); });
    }
  }

  function shiftSelected(direction) {
    const module = selectedModule();
    if (!module) { toast('Select a module first.'); return; }
    const sorted = documentModel.modules.slice().sort(function (a, b) { return a.order - b.order; });
    const index = sorted.indexOf(module);
    const swap = sorted[index + direction];
    if (!swap) return;
    const keep = module.order; module.order = swap.order; swap.order = keep;
    renderModulesPane(); renderCanvas(); saveDraft();
  }

  /* ── Canvas interaction ────────────────────────────────────────────── */

  const pointerState = { mode: null, moduleId: null, handle: '', startX: 0, startY: 0, origin: null, moved: false };

  function snap(value) {
    return Math.round(value / 0.5) * 0.5;
  }

  function applyPointerLayout(layout) {
    const element = $('#studioCanvas .canvas-module[data-module-id="' + pointerState.moduleId + '"]');
    if (!element) return;
    element.style.left = layout.x + '%';
    element.style.top = layout.y + '%';
    element.style.width = layout.w + '%';
    element.style.height = layout.h + '%';
    $$('#studioInspectorBody [data-layout]').forEach(function (input) {
      const axis = input.dataset.layout === 'x' || input.dataset.layout === 'w' ? 'x' : 'y';
      input.value = pxFromPercent(layout[input.dataset.layout], axis) + ' px';
    });
  }

  function pointerLayout(event) {
    const rect = $('#studioCanvas').getBoundingClientRect();
    const deltaX = (event.clientX - pointerState.startX) / rect.width * 100;
    const deltaY = (event.clientY - pointerState.startY) / rect.height * 100;
    const origin = pointerState.origin;
    const module = moduleById(pointerState.moduleId);
    let layout = Object.assign({}, origin);
    if (pointerState.mode === 'drag') {
      layout.x = snap(origin.x + deltaX);
      layout.y = snap(origin.y + deltaY);
    } else {
      const handle = pointerState.handle;
      if (handle.indexOf('e') !== -1) layout.w = snap(origin.w + deltaX);
      if (handle.indexOf('s') !== -1) layout.h = snap(origin.h + deltaY);
      if (handle.indexOf('w') !== -1) { layout.x = snap(origin.x + deltaX); layout.w = snap(origin.w - deltaX); }
      if (handle.indexOf('n') !== -1) { layout.y = snap(origin.y + deltaY); layout.h = snap(origin.h - deltaY); }
      if (module && module.props.lockAspect && origin.h > 0) {
        const ratio = origin.w / origin.h;
        if (handle === 'n' || handle === 's') layout.w = layout.h * ratio;
        else layout.h = layout.w / ratio;
      }
    }
    return clampLayout(layout, module ? moduleKeepsSafe(module) : true);
  }

  function onCanvasPointerDown(event) {
    if (event.button !== 0) return;
    const handle = event.target.closest('.cm-handle');
    const moduleElement = event.target.closest('.canvas-module');
    if (!moduleElement) {
      if (selectedModuleId) { selectedModuleId = null; renderModulesPane(); renderCanvas(); renderInspector(); }
      return;
    }
    const id = moduleElement.dataset.moduleId;
    leaveAutoForEditing();
    if (id !== selectedModuleId) selectModule(id);
    const module = moduleById(id);
    if (!module) return;
    const effective = effectiveModuleById(id) || module;
    pointerState.mode = handle ? 'resize' : 'pending';
    pointerState.handle = handle ? handle.dataset.handle : '';
    pointerState.moduleId = id;
    pointerState.startX = event.clientX;
    pointerState.startY = event.clientY;
    pointerState.origin = Object.assign({}, effective.layout);
    pointerState.moved = false;
    $('#studioCanvas').setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onCanvasPointerMove(event) {
    if (!pointerState.mode) return;
    if (pointerState.mode === 'pending') {
      if (Math.abs(event.clientX - pointerState.startX) + Math.abs(event.clientY - pointerState.startY) < 4) return;
      pointerState.mode = 'drag';
    }
    pointerState.moved = true;
    applyPointerLayout(pointerLayout(event));
  }

  function onCanvasPointerUp(event) {
    if (!pointerState.mode) return;
    const module = moduleById(pointerState.moduleId);
    if (module && pointerState.moved) {
      commitLayout(module, pointerLayout(event));
      saveDraft();
    }
    pointerState.mode = null;
    pointerState.moduleId = null;
    renderCanvas();
    renderInspector();
  }

  function onKeyDown(event) {
    const tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    const module = selectedModule();
    if (!module) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateModule(module);
      return;
    }
    const step = event.shiftKey ? 2 : 0.5;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!moves[event.key]) return;
    event.preventDefault();
    leaveAutoForEditing();
    const effective = effectiveModuleById(module.id) || module;
    commitLayout(module, clampLayout({
      x: effective.layout.x + moves[event.key][0],
      y: effective.layout.y + moves[event.key][1],
      w: effective.layout.w,
      h: effective.layout.h
    }, moduleKeepsSafe(module)));
    renderCanvas(); renderInspector();
    saveDraft();
  }

  /* ── Full-screen preview ───────────────────────────────────────────── */

  function openLivePreview() {
    const overlay = document.createElement('div');
    overlay.className = 'studio-preview-overlay';
    const ratio = documentModel.canvas.width / documentModel.canvas.height;
    overlay.innerHTML = '<div class="studio-preview-frame" style="aspect-ratio:' + documentModel.canvas.width + ' / ' + documentModel.canvas.height +
      ';width:min(94vw, calc(88vh * ' + ratio.toFixed(4) + '))" data-direction="' + renderContext().direction + '"></div>' +
      '<p>Protected preview · ' + escapeHTML(documentModel.airport.iata) + ' · ' + escapeHTML(dataPresentation().label) + ' — press Esc or click to close</p>';
    overlay.firstChild.innerHTML = Render.canvasHTML(documentModel, renderContext({ editing: false, selectedId: null, showGrid: false, showSafe: false }));
    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onEscape);
    }
    function onEscape(event) { if (event.key === 'Escape') close(); }
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onEscape);
    document.body.appendChild(overlay);
  }

  /* ── Sections, dialogs, publish (workspaces) ───────────────────────── */

  function render() {
    $('#studioName').value = documentModel.name;
    $('#studioFamilyTitle').textContent = familyTitles[documentModel.family];
    $('#studioFormat').textContent = documentModel.canvas.width + ' × ' + documentModel.canvas.height;
    $('#studioSiteStatus').textContent = documentModel.languages.enabled.length + ' languages · ' + documentModel.airport.iata + ' · ' + documentModel.airport.siteHost;
    updateDataStatus();
    renderFamilies(); renderModulesPane(); renderScenes(); renderCanvas(); renderInspector();
  }

  function closeSection() {
    $('.studio-workspace').classList.remove('has-section');
    $('#studioSectionView').hidden = true;
    $('#studioSectionView').innerHTML = '';
    $$('.rail-item').forEach(function (item) { item.classList.toggle('is-active', item.dataset.section === 'studio'); });
  }

  function openSection(section) {
    if (section === 'studio') { closeSection(); return; }
    if (section === 'templates') { renderTemplateWorkspace('all'); return; }
    if (section === 'assets') { renderAssetWorkspace('brand'); return; }
    if (section === 'displays') { renderDisplaysWorkspace(); return; }
    if (section === 'live') { renderLiveWorkspace(); return; }
  }

  function sectionShell(title, description, actions) {
    return '<header class="section-header"><div><h1>' + escapeHTML(title) + '</h1><p>' + escapeHTML(description) + '</p></div><div class="section-actions"><button class="section-button" id="sectionBack">← Studio</button>' + (actions || '') + '</div></header>';
  }

  function loadDocuments() {
    try {
      const all = JSON.parse(localStorage.getItem(Schema.airportStorageKey(Schema.STORAGE_KEY, documentModel.airport)) || '{}') || {};
      return Object.keys(all).map(function (key) { return all[key]; });
    } catch (error) { return []; }
  }

  function writeDocuments(list) {
    const all = {};
    list.forEach(function (entry) { all[entry.id] = entry; });
    try { localStorage.setItem(Schema.airportStorageKey(Schema.STORAGE_KEY, documentModel.airport), JSON.stringify(all)); } catch (error) {}
  }

  function adoptDocument(next, message) {
    documentModel = next;
    selectedModuleId = documentModel.modules[0] && documentModel.modules[0].id || null;
    selectedScene = 'default';
    stateMode = 'manual';
    previewLanguage = documentModel.languages.primary;
    historyUndo = []; historyRedo = []; historySnapshot = documentSnapshot(); updateHistoryButtons();
    persistDraft();
    closeSection();
    render();
    updateSaveState();
    if (message) toast(message);
  }

  function renderTemplateWorkspace(filter) {
    const selected = filter || 'all';
    const documents = loadDocuments().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    const published = readPublished();
    const filteredDocuments = documents.filter(function (entry) { return selected === 'all' || entry.family === selected; });
    const starters = templateCatalog.filter(function (template) { return selected === 'all' || template.family === selected; });
    const view = $('#studioSectionView');
    view.innerHTML = sectionShell('Documents & templates', 'Every display designed for ' + documentModel.airport.iata + ' — reopen, duplicate, publish, or start fresh.', '<button class="section-button primary" id="newTemplate">＋ New display</button>') +
      '<div class="section-stats"><div class="section-stat"><small>Saved documents</small><strong>' + documents.length + '</strong></div><div class="section-stat"><small>Published</small><strong>' + Object.keys(published).length + '</strong></div><div class="section-stat"><small>Display families</small><strong>5</strong></div><div class="section-stat"><small>Airport site</small><strong>' + escapeHTML(documentModel.airport.iata) + '</strong></div></div>' +
      '<div class="section-tabs">' + [['all','All'],['fids','FIDS'],['gids','GIDS'],['bids','BIDS'],['checkin','Check-in'],['baggage','Baggage Ops']].map(function (item) { return '<button data-template-filter="' + item[0] + '" class="' + (item[0] === selected ? 'is-active' : '') + '">' + item[1] + '</button>'; }).join('') + '</div>' +
      (filteredDocuments.length ? '<div class="display-table" style="margin-bottom:22px">' + filteredDocuments.map(function (entry) {
        const family = Schema.DISPLAY_FAMILIES[entry.family];
        const release = published[entry.id];
        const current = entry.id === documentModel.id;
        return '<div class="display-row"><div><h3>' + escapeHTML(entry.name || 'Untitled display') + (current ? ' <span class="family-chip">open now</span>' : '') + '</h3><small>Updated ' + (entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '—') + '</small></div>' +
          '<span class="display-meta">' + ((entry.scenes || []).length || 0) + ' states · ' + ((entry.modules || []).length || 0) + ' modules</span>' +
          '<span class="family-chip">' + (family ? family.label : entry.family) + '</span>' +
          '<span class="display-meta">' + (entry.canvas ? entry.canvas.width + ' × ' + entry.canvas.height : '') + '</span>' +
          (release ? '<span class="status-chip is-online"><i></i>v' + release.version + ' published</span>' : '<span class="status-chip is-legacy"><i></i>Draft only</span>') +
          '<span class="display-actions">' +
          (release ? '<a class="player-link" href="player.html?doc=' + encodeURIComponent(entry.id) + '" target="_blank" rel="noopener">▶ Play</a>' : '') +
          '<button class="assign" data-open-document="' + escapeHTML(entry.id) + '"' + (current ? ' disabled title="Already open"' : '') + '>Open</button>' +
          '<button data-copy-document="' + escapeHTML(entry.id) + '">Duplicate</button>' +
          '<button data-delete-document="' + escapeHTML(entry.id) + '"' + (current ? ' disabled title="Close it first by opening another document"' : '') + '>Delete</button>' +
          '</span></div>';
      }).join('') + '</div>' : '<div class="section-empty" style="margin-bottom:22px">No saved documents for this filter yet — start from a starter below.</div>') +
      '<h2 style="margin:0 0 12px;font-size:16px">Starters</h2>' +
      '<div class="template-grid">' + starters.map(function (template) { return '<article class="template-card"><div class="template-preview" style="--template-accent:' + template.accent + '"><div class="template-preview-top"><span>' + Schema.DISPLAY_FAMILIES[template.family].label.toUpperCase() + '</span><span>' + documentModel.airport.iata + '</span></div><h3>' + escapeHTML(template.name.toUpperCase()) + '</h3><div class="template-preview-modules"><i></i><i></i><i></i><i></i></div></div><div class="template-info"><h2>' + escapeHTML(template.name) + '</h2><p>' + escapeHTML(template.format + ' · ' + template.description) + '</p><div class="template-meta"><span>Creates a new document</span><button data-use-template="' + template.id + '">Use starter →</button></div></div></article>'; }).join('') + '</div>';
    view.hidden = false; $('.studio-workspace').classList.add('has-section');
    $('#sectionBack').addEventListener('click', closeSection);
    $('#newTemplate').addEventListener('click', function () {
      adoptDocument(Schema.newDocument({ airport: airportContext, family: 'fids', name: documentModel.airport.iata + ' Untitled display' }), 'New display created.');
      saveDraft();
    });
    $$('[data-template-filter]').forEach(function (button) { button.addEventListener('click', function () { renderTemplateWorkspace(button.dataset.templateFilter); }); });
    $$('[data-use-template]').forEach(function (button) { button.addEventListener('click', function () {
      const template = templateCatalog.find(function (item) { return item.id === button.dataset.useTemplate; });
      if (!template) return;
      const blank = template.id === 'blank';
      adoptDocument(Schema.newDocument({ airport: airportContext, family: template.family, blank: blank, name: blank ? documentModel.airport.iata + ' Blank display' : template.name.replace('YQM', documentModel.airport.iata) }), blank ? 'Blank canvas ready — press ＋ to start building.' : 'Starter copied into a new document.');
      saveDraft();
    }); });
    $$('[data-open-document]').forEach(function (button) { button.addEventListener('click', function () {
      const entry = loadDocuments().find(function (item) { return item.id === button.dataset.openDocument; });
      if (entry) adoptDocument(Schema.normalizeDocument(entry), 'Opened “' + (entry.name || 'Untitled display') + '”.');
    }); });
    $$('[data-copy-document]').forEach(function (button) { button.addEventListener('click', function () {
      const entry = loadDocuments().find(function (item) { return item.id === button.dataset.copyDocument; });
      if (!entry) return;
      const copy = Schema.normalizeDocument(JSON.parse(JSON.stringify(entry)));
      copy.id = 'doc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      copy.name = (entry.name || 'Untitled display') + ' copy';
      copy.updatedAt = new Date().toISOString();
      writeDocuments(loadDocuments().concat([copy]));
      renderTemplateWorkspace(selected);
      toast('Duplicated as “' + copy.name + '”.');
    }); });
    $$('[data-delete-document]').forEach(function (button) { button.addEventListener('click', function () {
      const id = button.dataset.deleteDocument;
      writeDocuments(loadDocuments().filter(function (item) { return item.id !== id; }));
      const published = readPublished();
      if (published[id]) {
        delete published[id];
        try { localStorage.setItem(publishedStorageKey(), JSON.stringify(published)); } catch (error) {}
      }
      const displays = loadDisplays();
      let cleared = false;
      displays.forEach(function (display) {
        if (display.assignment && display.assignment.documentId === id) { display.assignment = null; cleared = true; }
      });
      if (cleared) saveDisplays(displays);
      renderTemplateWorkspace(selected);
      toast('Document deleted' + (cleared ? ' and its displays cleared.' : '.'));
    }); });
  }

  function assetCategories(meta, selected) {
    const labels = { brand: 'Brand kits', airline: 'Airline logos', background: 'Backgrounds', ad: 'Advertisements', hotel: 'Hotel media', livery: 'Liveries', symbol: 'Symbols', weather: 'Weather' };
    return Object.keys(labels).map(function (category) { return '<button data-asset-category="' + category + '" class="' + (category === selected ? 'is-active' : '') + '">' + labels[category] + '<span>' + ((meta.by_category && meta.by_category[category]) || 0) + '</span></button>'; }).join('');
  }

  function renderAssetWorkspace(category, requestedPage, requestedQuery) {
    const selected = category || 'brand';
    const page = Math.max(1, Number(requestedPage) || 1);
    const query = String(requestedQuery || '').trim();
    const normalizedQuery = query.toLowerCase();
    const view = $('#studioSectionView');
    const meta = assetManifest && assetManifest._meta || { total: 2521, by_category: { brand: 2, airline: 1326, background: 103, ad: 10, hotel: 884, livery: 96, symbol: 4, weather: 83 } };
    const categoryItems = assetManifest && assetManifest.items ? assetManifest.items.filter(function (item) { return item.category === selected; }) : [];
    const filteredItems = normalizedQuery ? categoryItems.filter(function (item) {
      return [item.name, item.file, item.iata, item.group, item.subcategory].some(function (value) { return String(value || '').toLowerCase().includes(normalizedQuery); });
    }) : categoryItems;
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / ASSET_PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const firstIndex = (currentPage - 1) * ASSET_PAGE_SIZE;
    const items = filteredItems.slice(firstIndex, firstIndex + ASSET_PAGE_SIZE);
    const searchTools = '<form class="asset-toolbar" id="assetSearchForm"><label class="asset-search"><span>Search this category</span><input id="assetSearch" type="search" value="' + escapeHTML(query) + '" placeholder="Name, airline code or group"></label><button class="section-button" type="submit">Search</button>' + (query ? '<button class="section-button" id="assetClear" type="button">Clear</button>' : '') + '<small>' + (filteredItems.length ? 'Showing ' + (firstIndex + 1) + '–' + (firstIndex + items.length) + ' of ' + filteredItems.length : '0 matches') + '</small></form>';
    const assetCards = items.length ? '<div class="asset-browser">' + items.map(function (item) { return '<article class="asset-item" title="' + escapeHTML(item.path) + '"><img src="' + escapeHTML(item.path + '?v=2') + '" alt="' + escapeHTML(item.name) + '" loading="lazy"><small>' + escapeHTML(item.name) + '</small></article>'; }).join('') + '</div>' : '<div class="section-empty">' + (assetManifest ? 'No assets match this search.' : 'Loading the Orion asset catalog…') + '</div>';
    const pagination = filteredItems.length > ASSET_PAGE_SIZE ? '<nav class="asset-pagination" aria-label="Asset pages"><button class="section-button" id="assetPrevious" ' + (currentPage === 1 ? 'disabled' : '') + '>← Previous</button><span>Page ' + currentPage + ' of ' + totalPages + '</span><button class="section-button" id="assetNext" ' + (currentPage === totalPages ? 'disabled' : '') + '>Next →</button></nav>' : '';
    const brandPanels = selected === 'brand' ? '<div class="asset-content"><section class="asset-panel"><h2>Approved logos</h2><div class="logo-grid"><div class="logo-tile"><div><div class="logo-mark"></div><small>PRIMARY / DARK</small></div></div><div class="logo-tile light"><div><div class="logo-mark"></div><small>PRIMARY / LIGHT</small></div></div><div class="logo-tile"><div><div class="logo-mark"></div><small>AIRPORT MARK</small></div></div></div></section><div class="brand-grid"><section class="asset-panel"><h2>Brand colours</h2><div class="colour-row"><div class="colour-swatch" style="background:#071321">Night</div><div class="colour-swatch yellow" style="background:#f9c20b">Orbit</div><div class="colour-swatch" style="background:#2f8df4">Flight</div><div class="colour-swatch" style="background:#24c9a0">Operational</div></div></section><section class="asset-panel"><h2>Typography</h2><div class="font-sample">SF Pro</div><p>Primary Studio and display family</p></section><section class="asset-panel"><h2>Airport scope</h2><div class="font-sample">' + escapeHTML(documentModel.airport.iata) + '</div><p>' + escapeHTML(documentModel.airport.siteHost) + '</p></section></div></div>' : '<section class="asset-panel"><h2>' + escapeHTML(selected.charAt(0).toUpperCase() + selected.slice(1)) + ' assets</h2>' + searchTools + assetCards + pagination + '</section>';
    view.innerHTML = sectionShell('Assets & Brand', 'Approved logos, fonts, colours, advertising and weather resources for ' + documentModel.airport.iata + '.', '<button class="section-button primary" id="uploadAsset">＋ Upload assets</button>') +
      '<div class="section-stats"><div class="section-stat"><small>Catalogued assets</small><strong>' + meta.total + '</strong></div><div class="section-stat"><small>Weather</small><strong>' + (meta.by_category.weather || 0) + '</strong></div><div class="section-stat"><small>Airline assets</small><strong>' + (meta.by_category.airline || 0) + '</strong></div><div class="section-stat"><small>Validation</small><strong style="color:#0e9f79">Passed</strong></div></div>' +
      '<div class="assets-layout"><aside class="asset-categories">' + assetCategories(meta, selected) + '</aside><div>' + brandPanels + '</div></div>';
    view.hidden = false; $('.studio-workspace').classList.add('has-section');
    $('#sectionBack').addEventListener('click', closeSection);
    $('#uploadAsset').addEventListener('click', function () { toast('Uploads will connect to the airport media service in the publishing phase.'); });
    $$('[data-asset-category]').forEach(function (button) { button.addEventListener('click', function () { renderAssetWorkspace(button.dataset.assetCategory, 1, ''); }); });
    if (selected !== 'brand') {
      $('#assetSearchForm').addEventListener('submit', function (event) { event.preventDefault(); renderAssetWorkspace(selected, 1, $('#assetSearch').value); });
      if ($('#assetClear')) $('#assetClear').addEventListener('click', function () { renderAssetWorkspace(selected, 1, ''); });
      if ($('#assetPrevious')) $('#assetPrevious').addEventListener('click', function () { renderAssetWorkspace(selected, currentPage - 1, query); });
      if ($('#assetNext')) $('#assetNext').addEventListener('click', function () { renderAssetWorkspace(selected, currentPage + 1, query); });
    }
    if (!assetManifest) fetch('../assets/asset-manifest.json').then(function (response) { return response.json(); }).then(function (manifest) { assetManifest = manifest; renderAssetWorkspace(selected, currentPage, query); }).catch(function () { toast('The asset catalog is unavailable in this local file view.'); });
  }

  function showDialog(title, copy, rows, actions) {
    $('#studioDialogContent').innerHTML = '<h2 class="dialog-title">' + escapeHTML(title) + '</h2><p class="dialog-copy">' + copy + '</p><div class="dialog-list">' + rows.map(function (row) { return '<div><span>' + row[0] + '</span><strong>' + row[1] + '</strong></div>'; }).join('') + '</div>' + (actions || '');
    $('#studioDialog').showModal();
  }

  function publishReview() {
    saveDraft();
    const validation = Schema.validateDocument(documentModel);
    const converted = validation.valid ? Compat.toLegacyTemplate(documentModel) : { supported: false };
    const compatible = converted.supported ? converted.template.components.length + ' compatible modules' : 'Studio player required';
    const entry = publishedEntry();
    const nextVersion = (entry && entry.version || 0) + 1;
    const displays = loadDisplays();
    const staged = displays.filter(function (display) { return display.assignment && display.assignment.documentId === documentModel.id; });
    const target = staged.length ? staged.map(function (display) { return display.name; }).join(', ') : 'No display staged yet — stage one in Displays';
    showDialog('Publish · v' + nextVersion, 'Publishing makes this document the live version for this browser\'s display players. The recovered production site is untouched.', [
      ['Schema & module contracts', validation.valid ? 'Passed' : validation.errors[0]],
      ['Airport site', documentModel.airport.siteHost],
      ['States & rules', documentModel.scenes.length + ' states · players follow rules'],
      ['Languages', documentModel.languages.enabled.length + ' rotating'],
      ['Legacy compatibility', compatible],
      ['Plays on', target]
    ], '<div class="dialog-safe">● Legacy fallback protected — production keeps its current build</div><div class="dialog-actions"><button class="button button-secondary" value="close">Keep editing</button><button class="button button-primary" id="studioApprove" value="close"' + (validation.valid ? '' : ' disabled') + '>Publish v' + nextVersion + '</button></div>');
    $('#studioApprove').addEventListener('click', function () {
      const version = publishDocument();
      if (version == null) return;
      const link = staged.length ? ' Open Displays to launch its player.' : ' Stage it to a display to play it.';
      toast('“' + documentModel.name + '” published as v' + version + '.' + link);
    });
  }

  /* ── Publishing ────────────────────────────────────────────────────── */

  const PUBLISHED_KEY = 'orion_studio_published:v1';

  function publishedStorageKey() {
    return Schema.airportStorageKey(PUBLISHED_KEY, documentModel.airport);
  }

  function readPublished() {
    try { return JSON.parse(localStorage.getItem(publishedStorageKey()) || '{}') || {}; }
    catch (error) { return {}; }
  }

  function publishedEntry() {
    return readPublished()[documentModel.id] || null;
  }

  function publishedSnapshotMatches(entry) {
    if (!entry || !entry.document) return false;
    const copy = JSON.parse(JSON.stringify(entry.document));
    copy.updatedAt = '';
    return JSON.stringify(copy) === documentSnapshot();
  }

  function updateSaveState(suffix) {
    const entry = publishedEntry();
    let label = 'Draft';
    if (entry) label = publishedSnapshotMatches(entry) ? 'v' + entry.version + ' · live on players' : 'v' + entry.version + ' published · editing draft';
    $('#studioSaveState').textContent = label + (suffix ? ' · ' + suffix : '');
  }

  function publishDocument() {
    const validation = Schema.validateDocument(documentModel);
    if (!validation.valid) { toast(validation.errors[0]); return null; }
    const store = readPublished();
    const previous = store[documentModel.id];
    const version = (previous && previous.version || 0) + 1;
    store[documentModel.id] = {
      version: version,
      publishedAt: new Date().toISOString(),
      document: JSON.parse(JSON.stringify(documentModel))
    };
    try { localStorage.setItem(publishedStorageKey(), JSON.stringify(store)); }
    catch (error) { toast('This browser could not store the published version.'); return null; }
    updateSaveState();
    return version;
  }

  /* ── Displays & Live workspaces ────────────────────────────────────── */

  const DISPLAYS_KEY = 'orion_studio_displays:v1';

  function displaysStorageKey() {
    return Schema.airportStorageKey(DISPLAYS_KEY, documentModel.airport);
  }

  function seedDisplays() {
    const iata = documentModel.airport.iata;
    return [
      { id: 'lab-01', name: iata + '-LAB-01', area: 'Operations lab · protected test player', family: 'fids', width: 1920, height: 1080, status: 'online', bank: 1, assignment: null },
      { id: 'departures-hall', name: 'Departures hall', area: 'Terminal · main hall', family: 'fids', width: 1920, height: 1080, status: 'legacy', bank: 2, assignment: null },
      { id: 'gates-1-6', name: 'Gates 1–6', area: 'Gate bank · six displays', family: 'gids', width: 1920, height: 1080, status: 'legacy', bank: 6, assignment: null },
      { id: 'baggage-claim', name: 'Baggage claim', area: 'Arrivals · carousel wall', family: 'bids', width: 1920, height: 1080, status: 'legacy', bank: 2, assignment: null },
      { id: 'checkin-row', name: 'Check-in row', area: 'Common-use counters', family: 'checkin', width: 1920, height: 1080, status: 'legacy', bank: 4, assignment: null }
    ];
  }

  function loadDisplays() {
    try {
      const raw = localStorage.getItem(displaysStorageKey());
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length) return list;
      }
    } catch (error) {}
    return seedDisplays();
  }

  function saveDisplays(list) {
    try { localStorage.setItem(displaysStorageKey(), JSON.stringify(list)); } catch (error) {}
  }

  function displayStatus(display, published) {
    if (display.assignment && published[display.assignment.documentId]) {
      return '<span class="status-chip is-online"><i></i>Playing v' + published[display.assignment.documentId].version + '</span>';
    }
    if (display.assignment) return '<span class="status-chip is-staged"><i></i>Staged · not published</span>';
    if (display.status === 'online') return '<span class="status-chip is-online"><i></i>Online · idle</span>';
    return '<span class="status-chip is-legacy"><i></i>Legacy renderer</span>';
  }

  function renderDisplaysWorkspace() {
    const displays = loadDisplays();
    const published = readPublished();
    const playing = displays.filter(function (display) { return display.assignment && published[display.assignment.documentId]; }).length;
    const staged = displays.filter(function (display) { return display.assignment; }).length;
    const legacy = displays.filter(function (display) { return !display.assignment && display.status === 'legacy'; }).length;
    const view = $('#studioSectionView');
    view.innerHTML = sectionShell('Displays', 'Players and display banks on the ' + documentModel.airport.iata + ' site, and what each one is showing.', '') +
      '<div class="section-stats"><div class="section-stat"><small>Display banks</small><strong>' + displays.length + '</strong></div><div class="section-stat"><small>Playing Studio content</small><strong>' + playing + '</strong></div><div class="section-stat"><small>Legacy renderer</small><strong>' + legacy + '</strong></div><div class="section-stat"><small>Studio staged</small><strong>' + staged + '</strong></div></div>' +
      '<div class="display-table">' + displays.map(function (display) {
        const family = Schema.DISPLAY_FAMILIES[display.family];
        const matches = display.family === documentModel.family;
        const live = display.assignment && published[display.assignment.documentId];
        const assignmentInfo = display.assignment
          ? '<span class="display-meta">' + escapeHTML(display.assignment.documentName) + '<small>' + (live ? 'published v' + live.version + ' · updates live' : 'staged ' + new Date(display.assignment.at).toLocaleString() + ' — publish to play') + '</small></span>'
          : '<span class="display-meta">' + (display.status === 'online' ? 'Waiting for a Studio document' : 'Serving the recovered live build') + '</span>';
        return '<div class="display-row"><div><h3>' + escapeHTML(display.name) + '</h3><small>' + escapeHTML(display.area) + '</small></div>' +
          assignmentInfo +
          '<span class="family-chip">' + (family ? family.label : display.family) + '</span>' +
          '<span class="display-meta">' + display.width + ' × ' + display.height + (display.bank > 1 ? ' · ×' + display.bank : '') + '</span>' +
          displayStatus(display, published) +
          '<span class="display-actions">' +
          (live ? '<a class="player-link" href="player.html?display=' + encodeURIComponent(display.id) + '" target="_blank" rel="noopener">▶ Open player</a>' : '') +
          '<button class="assign" data-assign="' + display.id + '"' + (matches ? '' : ' disabled title="Open a ' + (family ? family.label : display.family) + ' draft to stage it here"') + '>Stage current draft</button>' +
          (display.assignment ? '<button data-clear="' + display.id + '">Clear</button>' : '') +
          '</span></div>';
      }).join('') + '</div>' +
      '<div class="section-note">● Staging and publishing live in this browser and never change a production display. A player tab picks up new published versions on its own.</div>';
    view.hidden = false; $('.studio-workspace').classList.add('has-section');
    $('#sectionBack').addEventListener('click', closeSection);
    $$('[data-assign]').forEach(function (button) {
      button.addEventListener('click', function () {
        const list = loadDisplays();
        const display = list.find(function (item) { return item.id === button.dataset.assign; });
        if (!display) return;
        display.assignment = { documentId: documentModel.id, documentName: documentModel.name, at: new Date().toISOString() };
        saveDisplays(list);
        renderDisplaysWorkspace();
        toast('“' + documentModel.name + '” staged for ' + display.name + '. No live display changed.');
      });
    });
    $$('[data-clear]').forEach(function (button) {
      button.addEventListener('click', function () {
        const list = loadDisplays();
        const display = list.find(function (item) { return item.id === button.dataset.clear; });
        if (!display) return;
        display.assignment = null;
        saveDisplays(list);
        renderDisplaysWorkspace();
        toast('Staging cleared for ' + display.name + '.');
      });
    });
  }

  function renderLiveWorkspace() {
    const dataView = dataPresentation();
    const displays = loadDisplays();
    const staged = displays.filter(function (display) { return display.assignment; });
    const view = $('#studioSectionView');
    const checkedAt = dataHealth.checkedAt ? new Date(dataHealth.checkedAt).toLocaleTimeString() : 'On load';
    view.innerHTML = sectionShell('Live operations', 'What the ' + documentModel.airport.iata + ' site is doing right now — read only, without touching the live renderer.', '<button class="section-button" id="liveRefresh">↻ Refresh feeds</button>') +
      '<div class="section-stats"><div class="section-stat"><small>Flight feed</small><strong>' + escapeHTML(dataView.label) + '</strong></div><div class="section-stat"><small>Departure rows</small><strong>' + baseRows('departures').length + '</strong></div><div class="section-stat"><small>Arrival rows</small><strong>' + baseRows('arrivals').length + '</strong></div><div class="section-stat"><small>Studio staged</small><strong>' + staged.length + '</strong></div></div>' +
      '<div class="live-grid"><section class="live-panel"><h2>Data feeds</h2><div class="live-list">' +
      '<div><span>Flight source</span><strong>' + escapeHTML(dataHealth.source || 'preview') + '</strong></div>' +
      '<div><span>Last check</span><strong>' + escapeHTML(checkedAt) + '</strong></div>' +
      '<div><span>Access</span><strong>Read only</strong></div>' +
      '<div><span>Weather</span><strong>' + (weatherNow ? escapeHTML((weatherNow.temperature != null ? weatherNow.temperature + '°' + (weatherNow.unit || 'C') + ' · ' : '') + (weatherNow.condition || 'Preview')) : 'Not connected') + '</strong></div>' +
      (dataHealth.reason ? '<div><span>Last error</span><strong>' + escapeHTML(dataHealth.reason) + '</strong></div>' : '') +
      '</div><p style="margin:12px 0 0;color:#667085;font-size:11px;line-height:1.5">' + escapeHTML(dataView.detail) + '</p></section>' +
      '<section class="live-panel"><h2>Players</h2><div class="live-list">' + displays.map(function (display) {
        return '<div><span>' + escapeHTML(display.name) + '</span><strong>' + (display.assignment ? 'Staged: ' + escapeHTML(display.assignment.documentName) : (display.status === 'online' ? 'Online · idle' : 'Legacy renderer')) + '</strong></div>';
      }).join('') + '</div></section></div>';
    view.hidden = false; $('.studio-workspace').classList.add('has-section');
    $('#sectionBack').addEventListener('click', closeSection);
    $('#liveRefresh').addEventListener('click', function () {
      toast('Re-reading the ' + documentModel.airport.iata + ' feeds…');
      reloadData().then(function () { renderLiveWorkspace(); });
    });
  }

  function editStateDialog(sceneId) {
    const editing = sceneId ? documentModel.scenes.find(function (scene) { return scene.id === sceneId; }) : null;
    const isDefault = editing && editing.id === 'default';
    const removable = editing && DEFAULT_SCENE_IDS.indexOf(editing.id) === -1;
    const rule = editing && editing.rule || { kind: 'none' };
    const conditionOptions = Schema.SCENE_RULE_CONDITIONS.map(function (item) {
      return '<option value="' + item.id + '"' + (rule.condition === item.id ? ' selected' : '') + '>' + escapeHTML(item.label) + '</option>';
    }).join('');
    $('#studioDialogContent').innerHTML = '<h2 class="dialog-title">' + (editing ? 'State · ' + escapeHTML(editing.label) : 'Add a state') + '</h2>' +
      '<p class="dialog-copy">' + (isDefault
        ? 'Default is the fallback layout — it shows whenever no other state\'s rule matches, and it has no rule of its own.'
        : 'A state is its own design over the same modules. Give it a rule and the display switches to it automatically in Auto; operators can always force it manually.') + '</p>' +
      '<div class="field"><label>State name</label><input id="sceneName" maxlength="40" value="' + escapeHTML(editing ? editing.label : '') + '"' + (isDefault ? ' disabled' : '') + ' placeholder="Weather hold"></div>' +
      (isDefault ? '' :
        '<div class="field" style="margin-top:10px"><label>Switches on</label><select id="sceneRuleKind">' +
        '<option value="none"' + (rule.kind === 'none' ? ' selected' : '') + '>Manual only — an operator picks it</option>' +
        '<option value="data"' + (rule.kind === 'data' ? ' selected' : '') + '>Data — when the flight feed matches</option>' +
        '<option value="time"' + (rule.kind === 'time' ? ' selected' : '') + '>Time — during a daily window</option></select></div>' +
        '<div class="field" style="margin-top:10px" id="sceneConditionField"' + (rule.kind !== 'data' ? ' hidden' : '') + '><label>Condition</label><select id="sceneCondition">' + conditionOptions + '</select></div>' +
        '<div class="field-grid" style="margin-top:10px" id="sceneTimeFields"' + (rule.kind !== 'time' ? ' hidden' : '') + '><div class="field"><label>From</label><input id="sceneFrom" placeholder="22:00" value="' + escapeHTML(rule.from || '22:00') + '"></div><div class="field"><label>Until</label><input id="sceneTo" placeholder="05:00" value="' + escapeHTML(rule.to || '05:00') + '"></div></div>' +
        '<div class="field" style="margin-top:10px"><label>Priority when several rules match</label><input id="scenePriority" type="number" min="1" max="99" value="' + (editing ? editing.priority : 50) + '"></div>') +
      '<div class="dialog-actions">' + (removable ? '<button class="button button-secondary" id="sceneDelete" type="button" style="margin-right:auto;border-color:#5f2224;color:#ff9a9d">Delete state</button>' : '') +
      '<button class="button button-secondary" value="close">Cancel</button><button class="button button-primary" id="sceneSave" type="button">' + (editing ? 'Save state' : 'Add state') + '</button></div>';
    $('#studioDialog').showModal();
    if (!isDefault) {
      $('#sceneRuleKind').addEventListener('change', function () {
        $('#sceneConditionField').hidden = this.value !== 'data';
        $('#sceneTimeFields').hidden = this.value !== 'time';
      });
    }
    if (!editing) $('#sceneName').focus();
    if (removable) $('#sceneDelete').addEventListener('click', function () {
      documentModel.scenes = documentModel.scenes.filter(function (scene) { return scene.id !== editing.id; });
      if (selectedScene === editing.id) selectedScene = 'default';
      $('#studioDialog').close();
      renderScenes(); renderModulesPane(); renderCanvas(); renderInspector();
      saveDraft('State removed.');
    });
    $('#sceneSave').addEventListener('click', function () {
      const label = isDefault ? 'Default' : $('#sceneName').value.trim();
      if (!label) { toast('Give the state a name.'); return; }
      const rulePatch = isDefault ? { kind: 'none' } : {
        kind: $('#sceneRuleKind').value,
        condition: $('#sceneCondition').value,
        from: $('#sceneFrom').value.trim(),
        to: $('#sceneTo').value.trim()
      };
      const priority = isDefault ? 10 : Number($('#scenePriority').value) || 50;
      if (editing) {
        const updated = Schema.normalizeScene({ id: editing.id, label: label, priority: priority, rule: rulePatch, overrides: editing.overrides }, 0);
        documentModel.scenes = documentModel.scenes.map(function (scene) { return scene.id === editing.id ? updated : scene; });
      } else {
        const id = 'scene_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (documentModel.scenes.some(function (scene) { return scene.id === id; })) { toast('That state already exists.'); return; }
        documentModel.scenes.push(Schema.normalizeScene({ id: id, label: label, priority: priority, rule: rulePatch }, 0));
        stateMode = 'manual';
        selectedScene = id;
      }
      $('#studioDialog').close();
      renderScenes(); renderModulesPane(); renderCanvas(); renderInspector();
      saveDraft(editing ? 'State saved.' : 'State added.');
    });
  }

  function toast(message) {
    const node = $('#studioToast'); node.textContent = message; node.classList.add('is-visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { node.classList.remove('is-visible'); }, 2600);
  }

  function escapeHTML(value) {
    return Render.escapeHTML(value);
  }

  /* ── Wiring ────────────────────────────────────────────────────────── */

  $('#studioApp').classList.add('is-editing');
  $('#studioSearch').addEventListener('input', renderModulesPane);
  $('#studioName').addEventListener('change', function () { saveDraft('Draft name updated.'); });
  $('#studioState').addEventListener('change', function () {
    if (this.value === '__auto') { stateMode = 'auto'; }
    else { stateMode = 'manual'; selectedScene = this.value; }
    renderScenes(); renderModulesPane(); renderCanvas(); renderInspector();
  });
  $('#studioPreview').addEventListener('click', openLivePreview);
  $('#studioPublish').addEventListener('click', publishReview);
  $('#studioAddModule').addEventListener('click', openModulePalette);
  $('#studioCreateModule').addEventListener('click', function () { showDialog('Create a module', 'A module packages reusable blocks, data requirements, operational states and fallback behaviour. Custom module contracts arrive with the publishing phase — add from the family palette meanwhile.', [['Family', Schema.DISPLAY_FAMILIES[documentModel.family].label], ['Data contract', 'Required'], ['Fallback state', 'Required'], ['Languages', documentModel.languages.enabled.length + ' available']]); });
  $('#studioAddScene').addEventListener('click', function () { editStateDialog(null); });
  $$('#studioInspectorTabs button').forEach(function (button) { button.addEventListener('click', function () {
    $$('#studioInspectorTabs button').forEach(function (item) { item.classList.toggle('is-active', item === button); });
    const build = button.dataset.tab === 'build';
    $('#studioBuildPane').hidden = !build;
    $('#studioInspectorBody').hidden = build;
    if (build) { renderModulesPane(); return; }
    selectedTab = button.dataset.tab;
    renderInspector();
  }); });
  $$('.studio-toolbar [data-add-block]').forEach(function (button) { button.addEventListener('click', function () { addModuleOfType(button.dataset.addBlock); }); });
  $('#studioFlights').addEventListener('click', openFlightsEditor);
  $('#studioForward').addEventListener('click', function () { shiftSelected(1); });
  $('#studioBackward').addEventListener('click', function () { shiftSelected(-1); });
  $('#studioDelete').addEventListener('click', function () { const module = selectedModule(); if (module) removeModule(module); else toast('Select a module first.'); });
  $('#studioRules').addEventListener('click', function () { editStateDialog(stateMode === 'auto' ? activeSceneId() : selectedScene); });
  $$('.library-tabs button').forEach(function (button) { button.addEventListener('click', function () { libraryTab = button.dataset.libraryTab; $$('.library-tabs button').forEach(function (item) { item.classList.toggle('is-active', item === button); }); renderModulesPane(); }); });
  $$('.rail-item').forEach(function (button) { button.addEventListener('click', function () { $$('.rail-item').forEach(function (item) { item.classList.toggle('is-active', item === button); }); openSection(button.dataset.section); }); });
  $('#studioZoomOut').addEventListener('click', function () { zoomFactor = Math.max(0.5, Math.round((zoomFactor - 0.1) * 10) / 10); renderCanvas(); });
  $('#studioZoomIn').addEventListener('click', function () { zoomFactor = Math.min(1.6, Math.round((zoomFactor + 0.1) * 10) / 10); renderCanvas(); });
  $('#studioGrid').addEventListener('click', function () { showGrid = !showGrid; this.classList.toggle('is-active', showGrid); renderCanvas(); });
  $('#studioSafe').addEventListener('click', function () { showSafe = !showSafe; this.classList.toggle('is-active', showSafe); renderCanvas(); });
  $('#studioUndo').addEventListener('click', undo);
  $('#studioRedo').addEventListener('click', redo);
  const canvasElement = $('#studioCanvas');
  canvasElement.addEventListener('pointerdown', onCanvasPointerDown);
  canvasElement.addEventListener('pointermove', onCanvasPointerMove);
  canvasElement.addEventListener('pointerup', onCanvasPointerUp);
  canvasElement.addEventListener('pointercancel', onCanvasPointerUp);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', updateZoomLabel);
  window.addEventListener('beforeunload', function () { saveDraft(); });
  clockTimer = setInterval(function () {
    if (pointerState.mode) return;
    renderCanvas();
    renderScenes();
  }, 30000);
  setInterval(function () {
    if (pointerState.mode) return;
    const modules = Render.effectiveModules(documentModel, stateMode === 'auto' ? activeSceneId() : selectedScene);
    const paging = modules.some(function (module) {
      if (module.enabled === false || (module.type !== 'flight-table' && module.type !== 'claim-table')) return false;
      const direction = module.props.direction || (documentModel.family === 'bids' || documentModel.family === 'baggage' ? 'arrivals' : 'departures');
      const perPage = Math.min(12, Math.max(3, Number(module.props.maxRows) || 5));
      return baseRows(direction).length > perPage;
    });
    if (paging) renderCanvas();
  }, 2000);
  render();
  historySnapshot = documentSnapshot();
  updateSaveState();

  async function reloadData() {
    if (requestedDataMode === 'pilot') {
      let routerFetch = null;
      try { routerFetch = await ensurePilotRouter(); } catch (error) {}
      dataAdapter = StudioData.choose({ mode: 'pilot', airport: airportContext, routerFetch: routerFetch });
    }
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
      try { weatherNow = await dataAdapter.weather(); } catch (error) { weatherNow = null; }
      flightRowsLoaded = true;
      renderCanvas(); renderScenes(); renderInspector(); updateDataStatus();
      if (dataHealth.fallback) toast('Pilot source unavailable. Clearly labelled preview fallback data is shown.');
    } catch (error) {
      flightRowsLoaded = true;
      dataHealth = { ok: false, source: 'preview', fallback: true, reason: error && error.message || 'Airport data unavailable.' };
      renderCanvas(); renderInspector(); updateDataStatus();
      toast('Preview flight data could not be loaded.');
    }
  }
  reloadData();
})();
