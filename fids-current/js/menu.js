/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FIDS v11p — Sidebar Settings JS (Push Layout)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// ── Load menu.html into the page ──────────────────────────────────────────
// Fetch-based loader. Init runs after the fragment is in the DOM — no timeout races.
(async function loadMenuFragment() {
  try {
    const res = await fetch('menu.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const container = document.createElement('div');
    container.innerHTML = html;
    // Insert before first child so the menu trigger/sidebar wrap the board
    document.body.insertBefore(container, document.body.firstChild);
    // Initialize after insertion — menu elements now exist
    if (typeof _syncMenu === 'function') _syncMenu();
    if (typeof smRenderPresets === 'function') smRenderPresets();
    // Late repaint: the airport code resolves after boot, so paint the form
    // from the SAVED prefs once it's known — the theme select otherwise sat
    // on 'default' while the board ran the saved theme (and any save then
    // wiped it).
    setTimeout(function () {
      try {
        var raw = localStorage.getItem(_cuStorageKey());
        if (raw && typeof _cuPaintForm === 'function') _cuPaintForm(JSON.parse(raw) || {});
      } catch (e) {}
    }, 2500);
  } catch (err) {
    console.error('[menu] Failed to load menu.html:', err);
  }
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB SWITCHING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function smSwitchTab(tabId) {
  document.querySelectorAll('.sm-tab').forEach(function(t) {
    t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.sm-tab-content').forEach(function(c) {
    c.classList.toggle('active', c.id === 'smTab_' + tabId);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// THEME (v218.99.11)
// Light is the default — Nick uses this during the day. Dark is a toggle
// for nighttime. Auto-pick on first open based on local time (6am-7pm =
// light, else dark). Manual toggle wins and persists in localStorage.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _smGetSavedTheme() {
  try { return localStorage.getItem('fids_console_theme') || ''; } catch (e) { return ''; }
}
function _smTimeOfDayTheme() {
  var h = new Date().getHours();
  return (h >= 6 && h < 19) ? 'light' : 'dark';
}
function smApplyTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') theme = 'light';
  var panel = document.getElementById('overlayMenu');
  if (panel) panel.setAttribute('data-theme', theme);
  var icon = document.getElementById('smThemeToggleIcon');
  if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
  var btn = document.getElementById('smThemeToggle');
  if (btn) btn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}
function smToggleTheme() {
  var panel = document.getElementById('overlayMenu');
  var current = (panel && panel.getAttribute('data-theme')) || 'light';
  var next = current === 'dark' ? 'light' : 'dark';
  smApplyTheme(next);
  try { localStorage.setItem('fids_console_theme', next); } catch (e) {}
}
function _smInitTheme() {
  var saved = _smGetSavedTheme();
  var theme = saved || _smTimeOfDayTheme();
  smApplyTheme(theme);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OPEN / CLOSE — push layout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function openOverlayMenu() {
  var m = document.getElementById('overlayMenu');
  if (!m) return;
  _smInitTheme();
  m.classList.add('open');
  document.body.classList.add('sidebar-open');
  var trigger = document.getElementById('menuTrigger');
  if (trigger) trigger.classList.remove('show');
  // Hide any playing video/image so it doesn't bleed through the menu and
  // doesn't get stuck visible after the menu closes. The scheduler will
  // re-pick a new piece of media after the cooldown expires.
  try { if (typeof _hideDestinationVideoOverlay === 'function') _hideDestinationVideoOverlay(); } catch (e) {}
  _syncMenu();
}

function closeOverlayMenu() {
  var m = document.getElementById('overlayMenu');
  if (!m) return;
  m.classList.remove('open');
  document.body.classList.remove('sidebar-open');
  var trigger = document.getElementById('menuTrigger');
  if (trigger) trigger.classList.add('show');
  // Reset cooldown so the scheduler can re-pick media right away
  try { window._lastVideoEndedAt = 0; } catch (e) {}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYNC MENU STATE WITH BOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _syncMenu() {
  // Display type pills
  ['main','gate','baggage'].forEach(function(t) {
    var btn = document.getElementById('smDisplay_' + t);
    if (btn) btn.classList.toggle('active', (typeof screenType !== 'undefined' ? screenType : 'main') === t);
  });

  // Sub-screen selector
  var sub = document.getElementById('menuSubScreen');
  var origSub = document.getElementById('subScreenSel');
  var wrap = document.getElementById('smSubScreenWrap');
  if (sub && origSub) {
    sub.innerHTML = origSub.innerHTML;
    sub.value = origSub.value;
    if (wrap) wrap.style.display = origSub.options.length > 0 ? '' : 'none';
  }

  // View mode
  ['dep','arr','rotate'].forEach(function(m) {
    var btn = document.getElementById('menuMode_' + m);
    if (btn) btn.classList.toggle('active', (typeof viewMode !== 'undefined' ? viewMode : 'rotate') === m);
  });

  // Screen setup — orientation pills + the three filter selects
  try { _menuFillScreenFilters(); } catch (e) {}

  // Languages
  if (typeof langs !== 'undefined') {
    ['en','fr','es','de','it','pt','ja','zh','ar'].forEach(function(l) {
      var btn = document.getElementById('menuLang_' + l);
      if (btn) btn.classList.toggle('active', langs.indexOf(l) !== -1);
    });
  }

  // Airport label
  var apLabel = document.getElementById('menuApLabel');
  var apSel = document.getElementById('apSel');
  if (apLabel && apSel) apLabel.textContent = apSel.value;

  // Mode label
  var modeLabel = document.getElementById('menuModeLabel');
  if (modeLabel) modeLabel.textContent = (typeof LIVE_MODE !== 'undefined' && LIVE_MODE) ? 'LIVE' : 'DEMO';

  var dot = document.getElementById('menuDot');
  if (dot) dot.style.background = (typeof LIVE_MODE !== 'undefined' && LIVE_MODE) ? '#10b981' : '#eab308';

  // Display label
  var dLabel = document.getElementById('menuDisplayLabel');
  if (dLabel) {
    var labels = {main:'FIDS', gate:'GIDS', baggage:'BIDS'};
    dLabel.textContent = labels[typeof screenType !== 'undefined' ? screenType : 'main'] || 'FIDS';
  }

  // Header badge
  var badge = document.getElementById('menuBadge');
  if (badge) {
    var live = typeof LIVE_MODE !== 'undefined' && LIVE_MODE;
    badge.className = 'sm-header-badge ' + (live ? 'live' : 'demo');
    badge.textContent = live ? 'LIVE' : 'DEMO';
  }

  // Background mode pills
  var bgMode = (typeof GATE_BG_MODE !== 'undefined') ? GATE_BG_MODE : (typeof gateBgMode !== 'undefined' ? gateBgMode : 'photo');
  ['light','dark','sky','photo','airline','custom','sunset','storm','space','aurora'].forEach(function(m) {
    var btn = document.getElementById('smBg_' + m);
    if (btn) btn.classList.toggle('active', bgMode === m);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MENU ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function menuChangeDisplay(type) {
  var currentPage = window.location.pathname.split('/').pop().replace('.html','');
  var targetMap = { main: 'fids', gate: 'gids', baggage: 'bids' };
  var target = targetMap[type] || 'fids';

  if (currentPage === target) {
    var sel = document.getElementById('screenTypeSel');
    if (sel) sel.value = type;
    if (typeof changeScreenType === 'function') changeScreenType(type);
    setTimeout(_syncMenu, 300);
    return;
  }

  var ap = (document.getElementById('apSel') || {}).value || 'YQM';
  var mode = (typeof LIVE_MODE !== 'undefined' && LIVE_MODE) ? 'live' : 'demo';
  closeOverlayMenu();
  // v23175 — CARRY THE SCREEN SETTINGS ACROSS A BOARD SWITCH.
  // This used to build a fresh URL holding only ap+mode, so every setting that
  // lives in the query string was silently dropped the moment you moved from
  // Flights to Gate to Bags: ?rot / ?orient (the upright-monitor option — set
  // it, switch board, it is gone and looks broken), plus the terminal, airline
  // and region filters. The auto-rotator never had this bug; it forwards
  // window.location.search verbatim. Start from the current URL for the same
  // reason, and only replace what actually changes.
  var u = new URL(window.location.href);
  u.pathname = u.pathname.replace(/[^/]*$/, target + '.html');
  u.searchParams.set('ap', ap);
  u.searchParams.set('mode', mode);
  setTimeout(function() { window.location.href = u.toString(); }, 200);
}

function menuChangeSubScreen(val) {
  if (typeof changeSubScreen === 'function') changeSubScreen(val);
}

function menuSetViewMode(m) {
  if (typeof setViewMode === 'function') setViewMode(m);
  _syncMenu();
}

// ━━━ SCREEN SETUP — orientation + per-monitor filters ━━━━━━━━━━━━━━━━━━
// Nick: 'We cant have that in the menu?'. Same three filters the URL takes,
// driven by clicks instead. Every control writes the URL back into the
// address bar, so the menu and the URL are never two ways of saying
// different things — and 'Copy Screen URL' hands over exactly what to paste
// into the next kiosk.

function _menuScreenUrl() {
  var u = new URL(window.location.href);
  function set(k, v) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); }
  try {
    set('ap', (document.getElementById('apSel') || {}).value || '');
    set('terminal', typeof filterTerminal !== 'undefined' ? filterTerminal : '');
    set('airline',  typeof filterAirline  !== 'undefined' ? filterAirline  : '');
    set('region',   typeof filterRegion   !== 'undefined' ? filterRegion   : '');
    // the aliases the docs also accept — one spelling in the bar, not two
    u.searchParams.delete('term');
    u.searchParams.delete('al');
  } catch (e) {}
  return u;
}

function _menuSyncUrl() {
  try { history.replaceState(null, '', _menuScreenUrl().toString()); } catch (e) {}
}

// Orientation is the one control that cannot apply live: ?rot= is read by an
// inline script in the document HEAD, before layout, because it swaps the
// reported innerWidth/innerHeight. Changing it means reloading.
function menuSetOrientation(rot) {
  var u = _menuScreenUrl();
  u.searchParams.delete('rot');
  u.searchParams.delete('orient');
  if (rot === '90' || rot === '270') u.searchParams.set('rot', rot);
  // 'Force Upright' is the escape hatch for a screen that IS portrait but
  // whose viewport did not read as one when the page loaded — a rotator
  // iframe, a window opened landscape and moved, a kiosk shell that reports
  // its pre-rotation size. Auto-detection cannot see any of those; an
  // explicit flag can.
  else if (rot === 'up') u.searchParams.set('orient', 'portrait');
  if (typeof closeOverlayMenu === 'function') closeOverlayMenu();
  setTimeout(function () { window.location.href = u.toString(); }, 200);
}

function menuSetScreenFilter(kind, val) {
  val = (val || '').trim();
  try {
    if (kind === 'terminal') filterTerminal = val;
    else if (kind === 'airline') filterAirline = val.toUpperCase();
    else if (kind === 'region') filterRegion = val;
  } catch (e) { return; }
  _menuSyncUrl();
  try { if (typeof currentPage !== 'undefined') currentPage = 0; } catch (e) {}
  try { if (typeof updateFilterCount === 'function') updateFilterCount(); } catch (e) {}
  try { if (typeof render === 'function') render(); } catch (e) {}
  _syncMenu();
}

function menuClearScreenFilters() {
  try { filterTerminal = ''; filterAirline = ''; filterRegion = ''; } catch (e) {}
  _menuSyncUrl();
  try { if (typeof updateFilterCount === 'function') updateFilterCount(); } catch (e) {}
  try { if (typeof render === 'function') render(); } catch (e) {}
  _syncMenu();
}

function menuCopyScreenUrl() {
  var url = _menuScreenUrl().toString();
  var btn = document.getElementById('menuCopyUrlBtn');
  function done(ok) {
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = ok ? 'Copied ✓' : url;
    setTimeout(function () { btn.textContent = old; }, ok ? 1600 : 6000);
  }
  // Kiosks are often served over plain http or run an old browser, where
  // navigator.clipboard is simply absent — fall back to the textarea trick,
  // and if even that fails show the URL so it can be read off the screen.
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
      return;
    }
  } catch (e) {}
  try {
    var ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    done(ok);
  } catch (e) { done(false); }
}

// Options come from the flights actually on the board right now, so a
// terminal or carrier that this airport does not have never appears.
//
// Built with createElement + textContent, never innerHTML: the current
// values reach this function from the QUERY STRING, so string-concatenating
// them into markup is an injection through a URL somebody could hand an
// operator. CodeQL flagged exactly that on the first cut of this function
// (three high-severity 'DOM text reinterpreted as HTML' alerts). The
// airline names are feed-derived too, which is no safer.
function _menuOption(value, label) {
  var o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}
function _menuFillScreenFilters() {
  var terms = [], airs = {};
  try {
    var all = (data.dep || []).concat(data.arr || []);
    var tSeen = {};
    all.forEach(function (f) {
      var t = (f.terminal || '').toString().trim().toUpperCase().replace(/^T/, '');
      if (t && t !== '—' && !tSeen[t]) { tSeen[t] = 1; terms.push(t); }
      var a = (f.airline || '').toString().trim().toUpperCase();
      if (a) airs[a] = (typeof AIRLINE_NAME !== 'undefined' && AIRLINE_NAME[a]) || a;
    });
  } catch (e) {}
  terms.sort();

  var tSel = document.getElementById('menuFilterTerminal');
  if (tSel) {
    var tCur = (typeof filterTerminal !== 'undefined' ? filterTerminal : '')
      .toString().toUpperCase().replace(/^T/, '');
    tSel.textContent = '';
    tSel.appendChild(_menuOption('', 'All terminals'));
    terms.forEach(function (t) { tSel.appendChild(_menuOption(t, 'Terminal ' + t)); });
    // A terminal filter set from a URL for an airport whose board has no
    // terminal column would vanish from the list and silently reset — keep it.
    if (tCur && terms.indexOf(tCur) === -1) tSel.appendChild(_menuOption(tCur, 'Terminal ' + tCur));
    tSel.value = tCur;
    tSel.parentElement.style.display = (terms.length || tCur) ? '' : 'none';
  }

  var aSel = document.getElementById('menuFilterAirline');
  if (aSel) {
    var aCur = (typeof filterAirline !== 'undefined' ? filterAirline : '').toString().toUpperCase();
    var codes = Object.keys(airs).sort(function (x, y) { return airs[x].localeCompare(airs[y]); });
    aSel.textContent = '';
    aSel.appendChild(_menuOption('', 'All airlines'));
    codes.forEach(function (c) { aSel.appendChild(_menuOption(c, airs[c])); });
    if (aCur && codes.indexOf(aCur) === -1) aSel.appendChild(_menuOption(aCur, aCur));
    aSel.value = aCur;
  }

  var rSel = document.getElementById('menuFilterRegion');
  if (rSel) {
    var rCur = (typeof filterRegion !== 'undefined' ? filterRegion : '').toString().toLowerCase();
    if (rCur && !Array.prototype.some.call(rSel.options, function (o) { return o.value === rCur; })) {
      rSel.appendChild(_menuOption(rCur, rCur));
    }
    rSel.value = rCur;
  }

  var rot = '0';
  try {
    var qp = new URLSearchParams(window.location.search);
    rot = qp.get('rot') || (qp.get('orient') === 'portrait' ? 'up' : '0');
  } catch (e) {}
  ['0', 'up', '90', '270'].forEach(function (r) {
    var b = document.getElementById('menuRot_' + r);
    if (b) b.classList.toggle('active', rot === r);
  });
}


function menuToggleLang(l) {
  if (typeof toggleLang === 'function') toggleLang(l);
  _syncMenu();
}

function menuSetBg(mode) {
  if (typeof setDedicatedBgMode === 'function') {
    setDedicatedBgMode(mode);
  } else {
    try {
      if (typeof setGateBgMode === 'function') setGateBgMode(mode);
      if (typeof dedicatedRenderKey !== 'undefined') dedicatedRenderKey = '';
      if (typeof renderDedicatedScreen === 'function') renderDedicatedScreen();
      else if (typeof render === 'function') render();
    } catch (e) { console.error('[menu] menuSetBg failed:', e); }
  }
  _syncMenu();
}

function menuChangeFont(fontName) {
  if (typeof changeFont === 'function') {
    changeFont(fontName);
  } else {
    document.body.style.fontFamily = fontName + ", 'Helvetica Neue', Helvetica, Arial, sans-serif";
  }
  try { localStorage.setItem('fids_font', fontName); } catch(e) {}
}

function menuGoToPicker() {
  closeOverlayMenu();
  window.location.href = 'picker.html';
}

function menuLogout() {
  closeOverlayMenu();
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRESET SYSTEM (localStorage-backed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var _PRESETS_KEY = 'fids_user_presets';
var _ACTIVE_PRESET_KEY = 'fids_active_preset';
var _editingPresetId = null;

var _DEFAULT_PRESETS = [
  { id: 'gold',     name: 'Gold (Default)', accent: '#eab308', bg: '#0c0c0e', text: '#ffffff', logo: '', builtin: true },
  { id: 'classic',  name: 'Classic Amber',  accent: '#f59e0b', bg: '#0f0f10', text: '#ffffff', logo: '', builtin: true },
  { id: 'midnight', name: 'Midnight',       accent: '#818cf8', bg: '#0a0a12', text: '#ffffff', logo: '', builtin: true },
  { id: 'terminal', name: 'Terminal Green', accent: '#22c55e', bg: '#060d06', text: '#d4ffda', logo: '', builtin: true },
  { id: 'light',    name: 'Light',          accent: '#334155', bg: '#f0f0f0', text: '#1a1a1e', logo: '', builtin: true },
  { id: 'slate',    name: 'Slate Blue',     accent: '#0ea5e9', bg: '#f0f4f8', text: '#1e293b', logo: '', builtin: true }
];

function _getPresets() {
  var user = [];
  try { user = JSON.parse(localStorage.getItem(_PRESETS_KEY) || '[]'); } catch(e) {}
  return _DEFAULT_PRESETS.concat(user);
}

function _getUserPresets() {
  try { return JSON.parse(localStorage.getItem(_PRESETS_KEY) || '[]'); } catch(e) { return []; }
}

function _saveUserPresets(list) {
  try { localStorage.setItem(_PRESETS_KEY, JSON.stringify(list)); } catch(e) {}
}

function _getActivePresetId() {
  try { return localStorage.getItem(_ACTIVE_PRESET_KEY) || 'gold'; } catch(e) { return 'gold'; }
}

function _setActivePresetId(id) {
  try { localStorage.setItem(_ACTIVE_PRESET_KEY, id); } catch(e) {}
}

function smRenderPresets() {
  var list = document.getElementById('smPresetList');
  if (!list) return;
  var presets = _getPresets();
  var activeId = _getActivePresetId();
  var html = '';
  for (var i = 0; i < presets.length; i++) {
    var p = presets[i];
    var isActive = p.id === activeId;
    var logoHtml = p.logo
      ? '<img class="sm-preset-logo" src="' + p.logo + '" onerror="this.style.display=\'none\'">'
      : '';
    var actions = p.builtin
      ? ''
      : '<div class="sm-preset-actions">'
        + '<button class="sm-preset-btn" onclick="event.stopPropagation();smEditPreset(\'' + p.id + '\')" title="Edit">&#9998;</button>'
        + '<button class="sm-preset-btn delete" onclick="event.stopPropagation();smDeletePresetById(\'' + p.id + '\')" title="Delete">&#10005;</button>'
        + '</div>';
    html += '<div class="sm-preset' + (isActive ? ' active' : '') + '" onclick="smActivatePreset(\'' + p.id + '\')">'
      + '<div class="sm-preset-swatch" style="background:' + p.accent + ';"></div>'
      + logoHtml
      + '<div class="sm-preset-name">' + p.name + '</div>'
      + actions
      + '</div>';
  }
  list.innerHTML = html;
}

function smActivatePreset(id) {
  // A pinned URL theme (kiosk/stream, e.g. ?theme=mist) is authoritative. Do
  // NOT let a saved custom preset override it by injecting the #dynamicTheme
  // block (body{background:…!important}) — that leak forced the BAGGAGE screen
  // dark (#544f4f) on ?theme=mist. Enforce the pin and bail.
  try {
    var _pin = (new URLSearchParams(window.location.search).get('theme') || '').trim().toLowerCase();
    if (/^(mist|tus-teal|tus-teal-deep)$/.test(_pin)) {
      var _dt = document.getElementById('dynamicTheme'); if (_dt) _dt.remove();
      var _cr = document.getElementById('_fidsCustomThemeRules'); if (_cr) _cr.remove();
      document.body.dataset.fidsTheme = _pin;
      ['--fids-banner-bg','--fids-banner-text','--fids-banner-accent',
       '--fids-bg','--fids-text','--fids-stripe','--fids-divider','--fids-row-odd']
        .forEach(function (k) { document.body.style.removeProperty(k); });
      return;
    }
  } catch (e) {}
  var presets = _getPresets();
  var preset = null;
  for (var i = 0; i < presets.length; i++) {
    if (presets[i].id === id) { preset = presets[i]; break; }
  }
  if (!preset) return;
  _setActivePresetId(id);

  if (preset.builtin && typeof setTheme === 'function') {
    setTheme(id);
  } else {
    // Use explicit preset values
    document.body.dataset.fidsTheme = 'custom';
    var accent = preset.accent;
    var hdr = preset.hdr || '#27272a';
    var hdrText = preset.hdrText || '#ffffff';
    var hdrMuted = _hexToRgba(hdrText, 0.5);
    var bg = preset.bg;
    var rowOdd = preset.rowOdd || '#ffffff';
    var rowEven = preset.rowEven || '#f4f4f5';
    var rowText = preset.text;
    var rowMuted = _hexToRgba(rowText, 0.45);
    var isLight = _isLightColor(rowOdd);
    var border = isLight ? '#e4e4e7' : _lighten(bg, 1.8);

    var old = document.getElementById('dynamicTheme');
    if (old) old.remove();
    var s = document.createElement('style');
    s.id = 'dynamicTheme';
    s.textContent =
      'body { background: ' + bg + ' !important; }' +
      '.hdr { background: ' + hdr + ' !important; border-bottom-color: ' + accent + ' !important; }' +
      '.hdr-board, .hdr-clock { color: ' + accent + ' !important; }' +
      '.hdr-apname { color: ' + hdrText + ' !important; }' +
      '.hdr-date, .hdr-fc-day .fc-label { color: ' + hdrMuted + ' !important; }' +
      '.hdr-fc-now, .hdr-fc-day .fc-temp { color: ' + hdrText + ' !important; }' +
      '.hdr-temp svg { stroke: ' + hdrMuted + ' !important; }' +
      '.subbar { background: ' + hdr + ' !important; }' +
      '.subbar-other { color: ' + hdrMuted + ' !important; }' +
      '.view-tab { color: ' + hdrMuted + ' !important; }' +
      '.view-tab.active { color: ' + accent + ' !important; border-bottom-color: ' + accent + ' !important; }' +
      'thead tr { background: ' + (isLight ? rowEven : hdr) + ' !important; }' +
      'thead th { color: ' + (isLight ? '#52525b' : hdrMuted) + ' !important; }' +
      // Bump specificity to body[data-fids-theme="custom"] #fidsTable so these
      // win over the per-theme hardcoded rules like body[data-fids-theme="navy"]
      // #fidsTable tbody tr:nth-child(even) which set the row colors when no
      // theme attribute matches. Without this, custom row colors are silently
      // overridden by whatever theme attribute is on body.
      'body[data-fids-theme="custom"] #fidsTable tbody tr:nth-child(odd),' +
      'tbody tr:nth-child(odd) { background: ' + rowOdd + ' !important; }' +
      'body[data-fids-theme="custom"] #fidsTable tbody tr:nth-child(even),' +
      'tbody tr:nth-child(even) { background: ' + rowEven + ' !important; }' +
      'body[data-fids-theme="custom"] #fidsTable .td-date,' +
      'body[data-fids-theme="custom"] #fidsTable .td-time,' +
      'body[data-fids-theme="custom"] #fidsTable .td-dest,' +
      'body[data-fids-theme="custom"] #fidsTable .td-flight,' +
      '.td-date, .td-time, .td-dest, .td-flight { color: ' + rowText + ' !important; }' +
      '.logo-fallback { color: ' + rowText + ' !important; }' +
      '.wx-temp { color: ' + rowMuted + ' !important; }' +
      'tbody td { border-bottom-color: ' + border + ' !important; }' +
      (isLight ? '.td-logo .full-logo { background: rgba(255,255,255,0.9); padding: 2px 12px; border-radius: 3px; }' : '') +
      '.ticker { background: ' + hdr + ' !important; border-top-color: ' + accent + ' !important; }' +
      '.ticker span { color: ' + hdrMuted + ' !important; }' +
      '.ctrl { background: ' + hdr + ' !important; }' +
      '.ctrl label, .ctrl-info { color: ' + hdrMuted + ' !important; }' +
      '.dot.on { background: ' + accent + ' !important; }' +
      '.gate-redline-top, .gate-redline-bottom, .gate-separator { background: ' + accent + ' !important; }' +
      '.gate-footer, .gate-footer-next { background: ' + hdr + ' !important; }' +
      '.gate-footer-left span, .gate-footer-right { color: ' + hdrMuted + ' !important; }' +
      '.gate-footer-next-val { color: ' + accent + ' !important; }' +
      '.ac-hdr { background: ' + hdr + ' !important; border-bottom-color: ' + accent + ' !important; }' +
      '.ac-hdr span { color: ' + hdrText + ' !important; }' +
      '.ac-bag-list { background: ' + bg + ' !important; }' +
      '.ac-bag-row { color: ' + rowText + ' !important; border-bottom-color: ' + border + ' !important; }' +
      '.ac-bag-row:nth-child(odd)  { background: ' + rowOdd + ' !important; }' +
      '.ac-bag-row:nth-child(even) { background: ' + rowEven + ' !important; }' +
      '.status-msg { color: ' + rowMuted + ' !important; }' +
      '.flight-card { background: ' + rowOdd + ' !important; }' +
      '.card-time, .card-city { color: ' + rowText + ' !important; }' +
      '.card-flight { color: ' + rowMuted + ' !important; }' +
      '.mobile-cards-scroll { background: ' + bg + ' !important; }' +
      // ── v2 banner: drive CSS variables from the custom preset so
      //    the new banner picks up the user-picked colors. Mirrors the
      //    block in setTheme() / fids-core.js. Without this, custom
      //    presets only repaint the legacy DOM and the v2 banner +
      //    table cells stay frozen at the previous theme. ──
      'body { ' +
        '--fids-banner-bg: ' + hdr + ' !important; ' +
        '--fids-banner-accent: ' + accent + ' !important; ' +
        '--fids-banner-text: ' + hdrText + ' !important; ' +
        '--fids-bg: ' + bg + ' !important; ' +
        '--fids-text: ' + (isLight ? rowText : '#ffffff') + ' !important; ' +
        '--fids-stripe: ' + (isLight ? rowEven : 'rgba(255,255,255,0.025)') + ' !important; ' +
      '}' +
      '.fids-board-label, .fids-banner-time, .fids-banner-date { color: ' + hdrText + ' !important; }' +
      '.fids-airport-pill, .fids-board-icon { background: #ffffff !important; }' +
      '.fids-airport-iata { color: ' + hdr + ' !important; }' +
      '.fids-airport-name { color: rgba(0,0,0,0.6) !important; }' +
      '.fids-board-icon svg { fill: ' + hdr + ' !important; }' +
      // v2 cells use rowText so light themes get dark text, dark themes get light
      '.td-airline, .fids-airline-name, .td-gate, .td-status, ' +
      '.td-wx .fids-cell-weather span:not(.fids-wx-cell) { color: ' + rowText + ' !important; }' +
      '.td-status.fids-status-departed, .td-status.fids-status-arrived, ' +
      '.td-status.fids-status-gate-closed, tbody tr.faded td { color: ' + rowMuted + ' !important; }' +
      '.td-status.fids-status-now, .td-status.fids-status-delayed, .td-status.fids-status-final { color: ' + (isLight ? '#b45309' : '#fbbf24') + ' !important; }';

    document.head.appendChild(s);

    // Apply header brand logo
    var logoEl = document.getElementById('hdrAirlineLogo');
    if (logoEl) {
      if (preset.logo) {
        logoEl.src = preset.logo;
        logoEl.style.display = 'block';
      } else {
        logoEl.style.display = 'none';
        logoEl.src = '';
      }
    }

    if (typeof render === 'function') render();
    if (typeof renderDedicatedScreen === 'function') {
      dedicatedRenderKey = '';
      renderDedicatedScreen();
    }
  }
  smRenderPresets();
}

// Color utility helpers
function _isLightColor(hex) {
  hex = hex.replace('#', '');
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
function _lighten(hex, factor) {
  hex = hex.replace('#', '');
  var r = Math.min(255, Math.round(parseInt(hex.substring(0, 2), 16) * factor));
  var g = Math.min(255, Math.round(parseInt(hex.substring(2, 4), 16) * factor));
  var b = Math.min(255, Math.round(parseInt(hex.substring(4, 6), 16) * factor));
  return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
}
function _hexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function smNewPreset() {
  _editingPresetId = null;
  document.getElementById('smPresetName').value = '';
  document.getElementById('smPresetLogo').value = '';
  document.getElementById('smPresetAccent').value = '#eab308';
  document.getElementById('smPresetAccentHex').value = '#eab308';
  document.getElementById('smPresetHdr').value = '#27272a';
  document.getElementById('smPresetHdrHex').value = '#27272a';
  document.getElementById('smPresetHdrText').value = '#ffffff';
  document.getElementById('smPresetHdrTextHex').value = '#ffffff';
  document.getElementById('smPresetBg').value = '#18181b';
  document.getElementById('smPresetBgHex').value = '#18181b';
  document.getElementById('smPresetRowOdd').value = '#ffffff';
  document.getElementById('smPresetRowOddHex').value = '#ffffff';
  document.getElementById('smPresetRowEven').value = '#f4f4f5';
  document.getElementById('smPresetRowEvenHex').value = '#f4f4f5';
  document.getElementById('smPresetText').value = '#18181b';
  document.getElementById('smPresetTextHex').value = '#18181b';
  document.getElementById('smDeletePresetBtn').style.display = 'none';
  document.getElementById('smPresetLogoPreview').style.display = 'none';
  document.getElementById('smPresetEditor').style.display = 'block';
}

function smEditPreset(id) {
  var userPresets = _getUserPresets();
  var p = null;
  for (var i = 0; i < userPresets.length; i++) {
    if (userPresets[i].id === id) { p = userPresets[i]; break; }
  }
  if (!p) return;
  _editingPresetId = id;
  document.getElementById('smPresetName').value = p.name || '';
  document.getElementById('smPresetLogo').value = p.logo || '';
  document.getElementById('smPresetAccent').value = p.accent || '#eab308';
  document.getElementById('smPresetAccentHex').value = p.accent || '#eab308';
  document.getElementById('smPresetHdr').value = p.hdr || '#27272a';
  document.getElementById('smPresetHdrHex').value = p.hdr || '#27272a';
  document.getElementById('smPresetHdrText').value = p.hdrText || '#ffffff';
  document.getElementById('smPresetHdrTextHex').value = p.hdrText || '#ffffff';
  document.getElementById('smPresetBg').value = p.bg || '#18181b';
  document.getElementById('smPresetBgHex').value = p.bg || '#18181b';
  document.getElementById('smPresetRowOdd').value = p.rowOdd || '#ffffff';
  document.getElementById('smPresetRowOddHex').value = p.rowOdd || '#ffffff';
  document.getElementById('smPresetRowEven').value = p.rowEven || '#f4f4f5';
  document.getElementById('smPresetRowEvenHex').value = p.rowEven || '#f4f4f5';
  document.getElementById('smPresetText').value = p.text || '#18181b';
  document.getElementById('smPresetTextHex').value = p.text || '#18181b';
  document.getElementById('smDeletePresetBtn').style.display = '';
  if (p.logo) {
    document.getElementById('smPresetLogoImg').src = p.logo;
    document.getElementById('smPresetLogoPreview').style.display = '';
  } else {
    document.getElementById('smPresetLogoPreview').style.display = 'none';
  }
  document.getElementById('smPresetEditor').style.display = 'block';
}

function smSavePreset() {
  var name = (document.getElementById('smPresetName').value || '').trim();
  if (!name) { alert('Please enter a preset name.'); return; }
  var preset = {
    id: _editingPresetId || 'user_' + Date.now(),
    name: name,
    accent: document.getElementById('smPresetAccent').value,
    hdr: document.getElementById('smPresetHdr').value,
    hdrText: document.getElementById('smPresetHdrText').value,
    bg: document.getElementById('smPresetBg').value,
    rowOdd: document.getElementById('smPresetRowOdd').value,
    rowEven: document.getElementById('smPresetRowEven').value,
    text: document.getElementById('smPresetText').value,
    logo: (document.getElementById('smPresetLogo').value || '').trim()
  };
  var userPresets = _getUserPresets();
  if (_editingPresetId) {
    for (var i = 0; i < userPresets.length; i++) {
      if (userPresets[i].id === _editingPresetId) {
        userPresets[i] = preset;
        break;
      }
    }
  } else {
    userPresets.push(preset);
  }
  _saveUserPresets(userPresets);
  document.getElementById('smPresetEditor').style.display = 'none';
  _editingPresetId = null;
  smRenderPresets();
  smActivatePreset(preset.id);
}

function smCancelPreset() {
  document.getElementById('smPresetEditor').style.display = 'none';
  _editingPresetId = null;
}

function smDeletePreset() {
  if (!_editingPresetId) return;
  smDeletePresetById(_editingPresetId);
  document.getElementById('smPresetEditor').style.display = 'none';
  _editingPresetId = null;
}

function smDeletePresetById(id) {
  var userPresets = _getUserPresets();
  userPresets = userPresets.filter(function(p) { return p.id !== id; });
  _saveUserPresets(userPresets);
  if (_getActivePresetId() === id) {
    _setActivePresetId('gold');
    smActivatePreset('gold');
  }
  smRenderPresets();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESTORE SAVED SETTINGS ON LOAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function() {
  try {
    // LEGACY font restore — only when no modern pick exists. This ran 200ms
    // after load and STOMPED the font applied by restoreFontChoice() (the
    // Customize-panel / FONT-dropdown systems), which is why fonts never
    // survived a refresh.
    var savedFont = localStorage.getItem('fids_font');
    var _modernFont = false;
    try {
      if (localStorage.getItem('fids_font_choice')) _modernFont = true;
      var _ck = 'fids_customize_' + ((typeof _acCurrentCode === 'function') ? _acCurrentCode() : '');
      var _cc = JSON.parse(localStorage.getItem(_ck) || '{}');
      if (_cc && _cc.font) _modernFont = true;
    } catch (e2) {}
    if (savedFont && !_modernFont) {
      setTimeout(function() {
        var sel = document.getElementById('menuFontSelect');
        if (sel) sel.value = savedFont;
        menuChangeFont(savedFont);
      }, 200);
    }
  } catch(e) {}

  setTimeout(function() {
    var activeId = _getActivePresetId();
    if (activeId && activeId !== 'gold') {
      smActivatePreset(activeId);
    }
  }, 300);
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ESC KEY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var m = document.getElementById('overlayMenu');
    if (m && m.classList.contains('open')) {
      closeOverlayMenu();
      e.stopPropagation();
      e.preventDefault();
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AIRLINE LOGO SIZE (global setting, independent of presets)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function menuSetLogoSize(size) {
  var sizeMap = { small: '24px', medium: '40px', large: '52px', xlarge: '64px' };
  var px = sizeMap[size] || '40px';
  var old = document.getElementById('logoSizeStyle');
  if (old) old.remove();
  var s = document.createElement('style');
  s.id = 'logoSizeStyle';
  s.textContent = '.td-logo img, .td-logo .full-logo { height: ' + px + ' !important; }';
  document.head.appendChild(s);
  try { localStorage.setItem('fids_logo_size', size); } catch(e) {}
  if (typeof render === 'function') render();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AIRPORT LOGO (shown in header next to airport name)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _getCurrentAirportCode() {
  var el = document.getElementById('apSel');
  if (el && el.value) return el.value.trim().toUpperCase();
  if (window._gateIata) return window._gateIata;
  var params = new URLSearchParams(window.location.search);
  return (params.get('ap') || 'YQM').toUpperCase();
}

function menuSetAirportLogo(url) {
  url = (url || '').trim();
  var code = _getCurrentAirportCode();
  try { localStorage.setItem('fids_airport_logo_' + code, url); } catch(e) {}
  _applyAirportLogo(url);
}

function _applyAirportLogo(url) {
  var el = document.getElementById('hdrAirportLogo');
  var apName = document.getElementById('hdrApName');
  if (!el) {
    var hdrCenter = apName ? apName.parentNode : document.querySelector('.hdr-center') || document.querySelector('.hdr');
    if (!hdrCenter) return;
    el = document.createElement('img');
    el.id = 'hdrAirportLogo';
    el.style.cssText = 'height:44px;object-fit:contain;border-radius:4px;';
    el.onerror = function() { 
      this.style.display = 'none';
      if (apName) apName.style.display = '';
    };
    if (apName) {
      apName.parentNode.insertBefore(el, apName);
    } else {
      hdrCenter.insertBefore(el, hdrCenter.firstChild);
    }
  }
  if (url) {
    el.src = url;
    el.style.display = '';
    // Hide airport name text when logo is shown
    if (apName) apName.style.display = 'none';
  } else {
    el.style.display = 'none';
    el.src = '';
    // Show airport name text when no logo
    if (apName) apName.style.display = '';
  }
}

function _loadAirportLogoForCode(code) {
  try {
    var url = localStorage.getItem('fids_airport_logo_' + code) || '';
    var inp = document.getElementById('menuAirportLogo');
    if (inp) inp.value = url;
    _applyAirportLogo(url);
  } catch(e) {}
}

// Restore airport logo and logo size on load
(function() {
  setTimeout(function() {
    try {
      var savedSize = localStorage.getItem('fids_logo_size');
      if (savedSize) {
        var sel = document.getElementById('menuLogoSize');
        if (sel) sel.value = savedSize;
        menuSetLogoSize(savedSize);
      }
      var code = _getCurrentAirportCode();
      _loadAirportLogoForCode(code);
    } catch(e) {}
  }, 500);
})();


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PHASE 3 — AIRPORT ADMIN PANEL (admin-only)
   Wire up the "Airport" tab inserted in menu.html.
   Saves airport config + airline logo overrides via the new Worker endpoints.
   Uses _acFetch() for admin-gated requests.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function setupAirportAdminTab() {
  // Show the Airport tab only after auth init declares an admin user.
  // We poll the Auth module briefly until it's ready, then sync.
  // Fallback: if Auth module isn't loaded on this page, check sessionStorage
  // directly — login info is stored there by auth.js on whichever page logged in.
  var _adminTabSyncTimer = null;
  function _isAdminFallback() {
    // First try the Auth module (preferred, available on most pages)
    try {
      if (typeof Auth !== 'undefined' && Auth.isAdmin && Auth.isAdmin()) return true;
    } catch (e) {}
    // Fallback to direct sessionStorage check (works even when Auth module
    // isn't loaded on this page — e.g. fids.html doesn't include auth.js)
    try {
      var rawUser = sessionStorage.getItem('fids_user');
      if (rawUser) {
        var user = JSON.parse(rawUser);
        if (user && user.role === 'admin') return true;
      }
    } catch (e) {}
    return false;
  }
  function _syncAirportTabVisibility() {
    try {
      var tab = document.getElementById('smTabAirport');
      if (!tab) return;
      var isAdmin = _isAdminFallback();
      tab.style.display = isAdmin ? '' : 'none';
      // v218.99.10 — sync the ADMIN section label visibility too
      var adminLabel = document.getElementById('smSectionAdmin');
      if (adminLabel) adminLabel.style.display = isAdmin ? '' : 'none';
    } catch (e) {}
  }
  // Sync once now and a few times after, then settle.
  _adminTabSyncTimer = setInterval(_syncAirportTabVisibility, 1000);
  setTimeout(function() { clearInterval(_adminTabSyncTimer); _syncAirportTabVisibility(); }, 8000);

  // Hook into smSwitchTab so we refresh the panel state when user opens it.
  // We wrap the existing smSwitchTab without breaking it for the other tabs.
  var _originalSwitch = window.smSwitchTab;
  window.smSwitchTab = function(tabId) {
    if (typeof _originalSwitch === 'function') _originalSwitch(tabId);
    if (tabId === 'airport') {
      try { acRefreshPanel(); } catch (e) { console.error('[airport admin]', e); }
    }
  };
})();

/* ━━━ USERS ADMIN TAB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Admin-only staff-login management: list / create / delete users via the
   Worker /auth/users endpoints. Uses _acFetch (bearer token from the admin
   session). Mirrors setupAirportAdminTab's admin gating. The Worker enforces
   admin-only server-side; this UI just exposes it. */
function _usEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
  });
}
var _US_ROLE_LABEL = { admin: 'Admin', operator: 'Manager', viewer: 'Regular', demo: 'Demo' };

function usFlash(msg, isError) {
  var el = document.getElementById('usFlash');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  el.style.background = isError ? '#7f1d1d' : '#064e3b';
  el.style.color = '#fff';
  if (msg) setTimeout(function(){ if (el.textContent === msg) { el.style.display = 'none'; el.textContent = ''; } }, 4500);
}

async function usRefresh() {
  var list = document.getElementById('usList');
  if (!list) return;
  list.innerHTML = '<div style="font-size:12px;color:#6b7280;font-style:italic;padding:14px;text-align:center;">Loading…</div>';
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/auth/users', { cache: 'no-cache' });
    if (res.status === 401 || res.status === 403) {
      list.innerHTML = '<div style="font-size:12px;color:#fbbf24;padding:14px;text-align:center;">Log in as an admin to manage users.</div>';
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var users = (data && data.users) || [];
    if (!users.length) { list.innerHTML = '<div style="font-size:12px;color:#6b7280;padding:14px;text-align:center;">No users yet.</div>'; return; }
    users.sort(function(a, b){ return String(a.username||'').localeCompare(String(b.username||'')); });
    list.innerHTML = users.map(function(u){
      var role = _US_ROLE_LABEL[u.role] || u.role || '';
      var nm = _usEsc(u.username);
      var disp = (u.displayName && u.displayName !== u.username) ? ' · ' + _usEsc(u.displayName) : '';
      var del = (u.role === 'admin')
        ? '<span style="font-size:10px;color:#6b7280;">protected</span>'
        : '<button onclick="usDelete(&quot;' + nm + '&quot;)" class="sm-btn sm-btn-danger sm-btn-sm">Delete</button>';
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-bottom:1px solid #1f2937;">'
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-size:13px;color:#e5e7eb;font-weight:600;">' + nm + '<span style="color:#9ca3af;font-weight:400;">' + disp + '</span></div>'
        +   '<div style="font-size:11px;color:#9ca3af;">' + role + '</div>'
        + '</div>' + del + '</div>';
    }).join('');
  } catch (e) {
    list.innerHTML = '<div style="font-size:12px;color:#f87171;padding:14px;text-align:center;">Failed to load users.</div>';
  }
}

async function usCreate() {
  var name = ((document.getElementById('usNewName')||{}).value || '').trim();
  var disp = ((document.getElementById('usNewDisplay')||{}).value || '').trim();
  var pass = ((document.getElementById('usNewPass')||{}).value || '').trim();
  var role = (document.getElementById('usNewRole')||{}).value || 'operator';
  if (!name || !pass) { usFlash('Username and password are required.', true); return; }
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password: pass, role: role, displayName: disp || name })
    });
    var data = {}; try { data = await res.json(); } catch (e) {}
    if (res.status === 401 || res.status === 403) { usFlash('Admin access required — log in as an admin.', true); return; }
    if (!res.ok) { usFlash(data.error || ('Failed (HTTP ' + res.status + ')'), true); return; }
    usFlash('Created ' + name + ' (' + (_US_ROLE_LABEL[role] || role) + ').', false);
    document.getElementById('usNewName').value = '';
    document.getElementById('usNewDisplay').value = '';
    document.getElementById('usNewPass').value = '';
    usRefresh();
  } catch (e) { usFlash('Network error creating user.', true); }
}

async function usDelete(username) {
  if (!username) return;
  if (!confirm('Delete user "' + username + '"? This cannot be undone.')) return;
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/auth/users/' + encodeURIComponent(username), { method: 'DELETE' });
    var data = {}; try { data = await res.json(); } catch (e) {}
    if (res.status === 401 || res.status === 403) { usFlash('Admin access required.', true); return; }
    if (!res.ok) { usFlash(data.error || ('Failed (HTTP ' + res.status + ')'), true); return; }
    usFlash('Deleted ' + username + '.', false);
    usRefresh();
  } catch (e) { usFlash('Network error deleting user.', true); }
}

// Show the Users tab for admins; refresh it whenever it's opened.
(function setupUsersAdminTab() {
  function _usIsAdmin() {
    try { if (typeof Auth !== 'undefined' && Auth.isAdmin && Auth.isAdmin()) return true; } catch (e) {}
    try { var u = JSON.parse(sessionStorage.getItem('fids_user') || 'null'); if (u && u.role === 'admin') return true; } catch (e) {}
    return false;
  }
  function _sync() {
    var tab = document.getElementById('smTabUsers');
    if (tab) tab.style.display = _usIsAdmin() ? '' : 'none';
  }
  var iv = setInterval(_sync, 1000);
  setTimeout(function(){ clearInterval(iv); _sync(); }, 8000);
  _sync();
  var _orig = window.smSwitchTab;
  window.smSwitchTab = function(tabId) {
    if (typeof _orig === 'function') _orig(tabId);
    if (tabId === 'users') { try { usRefresh(); } catch (e) {} }
  };
})();

// ── Helper: get the airport code currently selected on the board ─────
function _acCurrentCode() {
  try {
    var sel = document.getElementById('apSel');
    if (sel && sel.value) return String(sel.value).toUpperCase();
  } catch(e) {}
  try {
    if (window._gateIata) return String(window._gateIata).toUpperCase();
  } catch(e) {}
  return 'YQM';
}

// ── Worker base URL — works without Auth module ──────────────────────
var _AC_WORKER_URL = 'https://fids-proxy.n-leblanc1984.workers.dev';

// ── Token getter — Auth module first, sessionStorage fallback ────────
function _acGetToken() {
  try {
    if (typeof Auth !== 'undefined' && Auth.token) return Auth.token;
  } catch (e) {}
  try {
    // durable copy first, per-tab mirror second (v23170)
    return localStorage.getItem('fids_token') || sessionStorage.getItem('fids_token') || null;
  } catch (e) {}
  return null;
}

// ── authFetch wrapper — works whether or not Auth module is loaded ───
// v22839 — 401 RESCUE (Nick: 'Whenever I try to save info for YHU I get
// Save failed: HTTP 401'). The token lives 24h; when it dies, every save
// on the device fails with a bare HTTP 401 and no way back short of
// knowing to re-login. A 401 now clears the stale token and pops the
// login modal on the spot — the form keeps its values, so it's sign in
// and hit Save again. Not airport-specific: YHU was just what he was
// editing when the token aged out.
async function _acFetch(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  var token = _acGetToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  var res = await fetch(url, opts);
  // v23170 — ONLY AN ACTUALLY-DEAD TOKEN ENDS THE SESSION.
  //
  // This used to treat EVERY 401 as "your login expired" and wipe the session
  // on the spot. But a 401 also comes back for reasons that have nothing to do
  // with the token — an endpoint that wants a different credential, a
  // permission the account genuinely lacks, a transient upstream failure — and
  // each of those logged the operator out mid-edit for no reason. That is a
  // large part of "I'm logged in as admin and then all of a sudden it falls to
  // demo".
  //
  // So decide it from the token itself, which is knowable locally: if it has
  // expired, the session really is over — clear it and prompt. If it has NOT,
  // the 401 was about this particular request, so report that and leave the
  // session alone.
  if (res && res.status === 401) {
    var _expired = true;                     // no readable token => treat as dead
    try {
      var _t = _acGetToken();
      if (_t) {
        var _p = JSON.parse(atob(_t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        _expired = !!(_p && _p.exp && (Date.now() / 1000) > _p.exp);
      }
    } catch (e) { _expired = true; }

    if (_expired) {
      try { localStorage.removeItem('fids_token'); localStorage.removeItem('fids_user'); } catch (e) {}
      try { sessionStorage.removeItem('fids_token'); sessionStorage.removeItem('fids_user'); } catch (e) {}
      try { if (typeof Auth !== 'undefined' && Auth.logout) Auth.logout(); } catch (e) {}
      try { if (typeof showLoginModal === 'function') showLoginModal(); } catch (e) {}
      try {
        _acFlash('Your login expired — sign in, then hit Save again / Session expirée — reconnectez-vous puis sauvegardez', true);
      } catch (e) {}
    } else {
      // Session is fine — this request was refused on its own merits.
      try {
        _acFlash('That action was refused (401) — your login is still active / Action refusée (401) — votre session est toujours active', true);
      } catch (e) {}
    }
  }
  return res;
}

// ── Show/hide a small flash message in the admin panel ────────────────
function _acFlash(msg, isError) {
  var el = document.getElementById('acFlash');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  el.style.background = isError ? '#7f1d1d' : '#064e3b';
  el.style.color = '#fff';
  if (msg) {
    setTimeout(function() {
      if (el.textContent === msg) { el.style.display = 'none'; el.textContent = ''; }
    }, 4000);
  }
}

// ── Refresh entire admin panel for current airport ───────────────────
async function acRefreshPanel() {
  var code = _acCurrentCode();
  // Header
  var codeEl = document.getElementById('acAirportCode');
  if (codeEl) codeEl.textContent = code;
  var statusEl = document.getElementById('acAirportStatus');
  // Reset the form to placeholder state
  document.getElementById('acDisplayName').value = '';
  document.getElementById('acLongName').value = '';
  acSetPositionUI('left');
  _acSetLogoPreview(null);
  // Reset Phase 4 toggles to defaults
  var _t = document.getElementById('acThemeSelect');     if (_t) _t.value = 'navy-board';
  var _hp = document.getElementById('acHidePrefix');     if (_hp) _hp.checked = false;
  var _hw = document.getElementById('acHideWeather');    if (_hw) _hw.checked = false;
  var _ae = document.getElementById('acAirlineEmblem');  if (_ae) _ae.checked = false;
  // Fetch current config from Worker (public endpoint — works without admin)
  try {
    var res = await fetch(_AC_WORKER_URL + '/api/airport-config/' + encodeURIComponent(code), { cache: 'no-cache' });
    if (res.status === 404) {
      if (statusEl) { statusEl.textContent = 'no config'; statusEl.style.background = '#374151'; statusEl.style.color = '#9ca3af'; }
    } else if (res.ok) {
      var cfg = await res.json();
      if (statusEl) { statusEl.textContent = 'configured'; statusEl.style.background = '#065f46'; statusEl.style.color = '#d1fae5'; }
      document.getElementById('acDisplayName').value = cfg.displayName || '';
      document.getElementById('acLongName').value = cfg.longName || '';
      if (cfg.logo) {
        if (cfg.logo.url) _acSetLogoPreview(cfg.logo.url);
        if (cfg.logo.position) acSetPositionUI(cfg.logo.position);
      }
      if (_t  && cfg.theme) _t.value = cfg.theme;
      if (_hp) _hp.checked = !!cfg.hideAirlinePrefix;
      if (_hw) _hw.checked = !!cfg.hideWeather;
      if (_ae) _ae.checked = (cfg.airlineStyle === 'emblem');
    }
  } catch (e) {
    if (statusEl) { statusEl.textContent = 'load failed'; statusEl.style.background = '#7f1d1d'; statusEl.style.color = '#fecaca'; }
  }
  // Refresh airline overrides
  await acLoadOverrideList();
}

// ── Airport logo: preview helper for the redesigned card (v218.99.14) ──
function _acSetLogoPreview(url, label) {
  var img = document.getElementById('acLogoPreview');
  var empty = document.getElementById('acLogoEmpty');
  var lbl = document.getElementById('acLogoLabel');
  var msg = document.getElementById('acLogoMsg');
  if (!img || !empty) return;
  if (url) {
    img.src = url;
    img.style.display = '';
    empty.style.display = 'none';
    if (lbl) lbl.textContent = label || 'Logo set';
    if (msg) msg.textContent = 'From the Media Library.';
  } else {
    img.src = '';
    img.style.display = 'none';
    empty.style.display = '';
    if (lbl) lbl.textContent = 'No logo set';
    if (msg) msg.textContent = 'Pick from the Media Library or upload a new one.';
  }
}

// v218.99.14 — pick airport logo from the Media Library (replaces the old
// direct-upload dropzone). The picker filters to category 'airport-logo'.
function acPickLogoFromLibrary() {
  if (!window.FIDS_MEDIA_PICKER) return;
  window.FIDS_MEDIA_PICKER.open({
    category: 'airport-logo',
    type: 'image',
    title: 'Pick airport logo',
    allowUpload: true,
    onPick: async function(item) {
      var code = _acCurrentCode();
      _acFlash('Saving logo…', false);
      try {
        var res = await _acFetch(_AC_WORKER_URL + '/api/airport-config/' + encodeURIComponent(code), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo: { url: item.url, library_id: item.id } })
        });
        if (!res.ok) {
          var err = await res.json().catch(function() { return {}; });
          throw new Error(err.error || ('HTTP ' + res.status));
        }
        _acSetLogoPreview(item.url, item.label);
        _acFlash('Logo updated.', false);
        try { delete window.FIDS_AIRPORT._cache[code]; window.FIDS_AIRPORT.load(code); } catch (e) {}
      } catch (e) {
        _acFlash('Save failed: ' + e.message, true);
      }
    }
  });
}

// Legacy direct-upload handler — kept as a fallback if anything else still
// calls it, but the UI no longer triggers it.
async function acHandleLogoFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { _acFlash('Logo too large (max 5 MB).', true); return; }
  var code = _acCurrentCode();
  _acFlash('Uploading logo…', false);
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/api/airport-config/' + encodeURIComponent(code) + '/logo', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error(err.error || ('HTTP ' + res.status));
    }
    var data = await res.json();
    if (data && data.logo && data.logo.url) {
      _acSetLogoPreview(data.logo.url);
      _acFlash('Logo uploaded.', false);
      try { delete window.FIDS_AIRPORT._cache[code]; } catch (e) {}
      try { window.FIDS_AIRPORT.load(code); } catch (e) {}
    }
  } catch (e) {
    _acFlash('Upload failed: ' + e.message, true);
  }
}

async function acRemoveLogo() {
  var code = _acCurrentCode();
  // Just clear the logo field via PUT — we don't truly delete the R2 file here,
  // it'll be replaced or orphaned. Cheaper than a separate delete endpoint.
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/api/airport-config/' + encodeURIComponent(code), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo: null })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _acSetLogoPreview(null);
    _acFlash('Logo cleared.', false);
    try { delete window.FIDS_AIRPORT._cache[code]; window.FIDS_AIRPORT.load(code); } catch(e) {}
  } catch (e) {
    _acFlash('Clear failed: ' + e.message, true);
  }
}

// ── Logo position toggle ──────────────────────────────────────────────
var _acCurrentPosition = 'left';
function acSetPositionUI(pos) {
  _acCurrentPosition = pos;
  ['Left','Center','Right'].forEach(function(name) {
    var btn = document.getElementById('acPos' + name);
    if (btn) btn.classList.toggle('active', name.toLowerCase() === pos);
  });
}
function acSetPosition(pos) {
  acSetPositionUI(pos);
}

// ── Save airport config (display names + position) ────────────────────
async function acSaveAirportConfig() {
  var code = _acCurrentCode();
  var body = {
    displayName: document.getElementById('acDisplayName').value.trim(),
    longName: document.getElementById('acLongName').value.trim()
  };
  // Phase 4 toggles
  var _t = document.getElementById('acThemeSelect');
  if (_t) body.theme = _t.value || 'navy-board';
  var _hp = document.getElementById('acHidePrefix');
  if (_hp) body.hideAirlinePrefix = !!_hp.checked;
  var _hw = document.getElementById('acHideWeather');
  if (_hw) body.hideWeather = !!_hw.checked;
  var _ae = document.getElementById('acAirlineEmblem');
  if (_ae) body.airlineStyle = _ae.checked ? 'emblem' : 'full';
  // Merge position into the existing logo object so we don't overwrite the URL
  try {
    var existingRes = await fetch(_AC_WORKER_URL + '/api/airport-config/' + encodeURIComponent(code), { cache: 'no-cache' });
    var existing = existingRes.ok ? await existingRes.json() : {};
    var logo = existing.logo || {};
    logo.position = _acCurrentPosition;
    body.logo = logo;
  } catch (e) {
    body.logo = { position: _acCurrentPosition };
  }
  _acFlash('Saving…', false);
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/api/airport-config/' + encodeURIComponent(code), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _acFlash('Saved.', false);
    var statusEl = document.getElementById('acAirportStatus');
    if (statusEl) { statusEl.textContent = 'configured'; statusEl.style.background = '#065f46'; statusEl.style.color = '#d1fae5'; }
    // Bust resolver cache + force board to re-apply theme/layout/toggles
    try { delete window.FIDS_AIRPORT._cache[code]; } catch(e) {}
    try { await window.FIDS_AIRPORT.load(code); } catch(e) {}
    try { if (typeof applyAirportConfigToBoard === 'function') applyAirportConfigToBoard(code); } catch(e) {}
  } catch (e) {
    _acFlash('Save failed: ' + e.message, true);
  }
}

async function acDeleteAirportConfig() {
  var code = _acCurrentCode();
  if (!confirm('Delete airport config for ' + code + '? This removes the saved name, logo URL, and position. (The board will fall back to defaults.)')) return;
  _acFlash('Deleting…', false);
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/api/airport-config/' + encodeURIComponent(code), { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _acFlash('Deleted.', false);
    try { delete window.FIDS_AIRPORT._cache[code]; } catch(e) {}
    setTimeout(acRefreshPanel, 300);
  } catch (e) {
    _acFlash('Delete failed: ' + e.message, true);
  }
}

// ── Airline overrides ─────────────────────────────────────────────────
async function acLoadOverrideList() {
  var code = _acCurrentCode();
  var listEl = document.getElementById('acOverrideList');
  if (!listEl) return;
  listEl.innerHTML = '<div style="font-size:11px;color:#9ca3af;">Loading…</div>';
  try {
    var res = await fetch(_AC_WORKER_URL + '/api/airline-override/' + encodeURIComponent(code), { cache: 'no-cache' });
    var body = res.ok ? await res.json() : { overrides: {} };
    var overrides = body.overrides || {};
    var keys = Object.keys(overrides).sort();
    if (!keys.length) {
      listEl.innerHTML = '<div style="font-size:11px;color:#9ca3af;font-style:italic;">No airline overrides set for ' + code + '.</div>';
      return;
    }
    var html = '';
    keys.forEach(function(al) {
      var ov = overrides[al] || {};
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #374151;border-radius:4px;margin-bottom:4px;background:#1f2937;">'
            + '<img src="' + (ov.url || '') + '" alt="" style="width:36px;height:36px;object-fit:contain;background:#fff;border-radius:3px;">'
            + '<span style="font-weight:600;color:#fff;letter-spacing:1px;width:48px;">' + al + '</span>'
            + '<span style="flex:1;font-size:11px;color:#9ca3af;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">' + (ov.url || '—') + '</span>'
            + '<button class="sm-btn sm-btn-danger sm-btn-sm" onclick="acDeleteAirlineOverride(\'' + al + '\')">Remove</button>'
            + '</div>';
    });
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div style="font-size:11px;color:#fecaca;">Load failed: ' + e.message + '</div>';
  }
}

// v218.99.14 — Pick airline override logo from Media Library (replaces the
// old direct-upload flow). Uses the library's airline-logo category.
function acPickAirlineOverrideFromLibrary() {
  var alInput = document.getElementById('acAirlineCode');
  var al = (alInput.value || '').toUpperCase().trim();
  if (!al || al.length < 2 || al.length > 3) {
    _acFlash('Enter a 2-3 letter airline IATA code first.', true);
    if (alInput) alInput.focus();
    return;
  }
  if (!window.FIDS_MEDIA_PICKER) return;
  window.FIDS_MEDIA_PICKER.open({
    category: 'airline-logo',
    type: 'image',
    title: 'Pick override logo for ' + al,
    allowUpload: true,
    onPick: async function(item) {
      var code = _acCurrentCode();
      _acFlash('Saving override for ' + al + '…', false);
      try {
        var res = await _acFetch(_AC_WORKER_URL + '/api/airline-override/' + encodeURIComponent(code) + '/' + encodeURIComponent(al), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url, library_id: item.id })
        });
        if (!res.ok) {
          var err = await res.json().catch(function() { return {}; });
          throw new Error(err.error || ('HTTP ' + res.status));
        }
        _acFlash('Override saved.', false);
        alInput.value = '';
        try { delete window.FIDS_AIRPORT._airlineCache[code]; window.FIDS_AIRPORT.loadAirlineOverrides(code); } catch (e) {}
        await acLoadOverrideList();
      } catch (e) {
        _acFlash('Save failed: ' + e.message, true);
      }
    }
  });
}

// Legacy direct-upload handler — kept as a fallback but the UI no longer
// triggers it. Will be removed once Phase 2 is verified.
async function acHandleAirlineLogoFile(file) {
  if (!file) return;
  var alInput = document.getElementById('acAirlineCode');
  var al = (alInput.value || '').toUpperCase().trim();
  if (!al || al.length < 2 || al.length > 3) { _acFlash('Enter a 2-3 letter airline IATA code first.', true); return; }
  if (file.size > 5 * 1024 * 1024) { _acFlash('Logo too large (max 5 MB).', true); return; }
  var code = _acCurrentCode();
  _acFlash('Uploading override for ' + al + '…', false);
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/api/airline-override/' + encodeURIComponent(code) + '/' + encodeURIComponent(al) + '/logo', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error(err.error || ('HTTP ' + res.status));
    }
    _acFlash('Override saved.', false);
    alInput.value = '';
    try { delete window.FIDS_AIRPORT._airlineCache[code]; window.FIDS_AIRPORT.loadAirlineOverrides(code); } catch (e) {}
    await acLoadOverrideList();
  } catch (e) {
    _acFlash('Upload failed: ' + e.message, true);
  }
}

async function acDeleteAirlineOverride(airlineCode) {
  var code = _acCurrentCode();
  if (!confirm('Remove override for ' + airlineCode + ' at ' + code + '?')) return;
  try {
    var res = await _acFetch(_AC_WORKER_URL + '/api/airline-override/' + encodeURIComponent(code) + '/' + encodeURIComponent(airlineCode), { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _acFlash('Override removed.', false);
    try { delete window.FIDS_AIRPORT._airlineCache[code]; window.FIDS_AIRPORT.loadAirlineOverrides(code); } catch (e) {}
    await acLoadOverrideList();
  } catch (e) {
    _acFlash('Remove failed: ' + e.message, true);
  }
}

// ── Drag-drop wiring (lazy — runs once when the airport tab opens first) ─
(function wireDragDrop() {
  var done = false;
  function setupOnce() {
    if (done) return;
    var drop = document.getElementById('acLogoDrop');
    if (!drop) return;       // not rendered yet
    done = true;
    drop.addEventListener('click', function() { document.getElementById('acLogoFile').click(); });
    drop.addEventListener('dragover', function(e) { e.preventDefault(); drop.style.borderColor = '#3b82f6'; });
    drop.addEventListener('dragleave', function() { drop.style.borderColor = '#4b5563'; });
    drop.addEventListener('drop', function(e) {
      e.preventDefault();
      drop.style.borderColor = '#4b5563';
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) acHandleLogoFile(f);
    });
  }
  // Try repeatedly until the dom is loaded
  var t = setInterval(function() { setupOnce(); if (done) clearInterval(t); }, 500);
  setTimeout(function() { clearInterval(t); }, 30000);
})();


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CUSTOMIZE TAB — appearance overrides for everyone (per-device)
   Saves to localStorage. Layers on top of admin-saved KV airport config.
   Empty value = "use airport default"
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// Storage key — per-airport so different airports can have different prefs
function _cuStorageKey() {
  var code = _acCurrentCode();   // reuses the helper from the airport admin section
  return 'fids_customize_' + code;
}

function _cuLoad() {
  try {
    var raw = localStorage.getItem(_cuStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function _cuSave(prefs) {
  // Local write stays — it is the offline cache and the instant-preview source.
  try { localStorage.setItem(_cuStorageKey(), JSON.stringify(prefs)); } catch (e) {}
  // …and the change now goes to the SERVER, so it follows the operator to the
  // next station instead of living in one browser (v23174).
  _cuPushToServer(prefs);
}

// ── SERVER-SIDE PREFERENCES (v23174) ─────────────────────────────────────────
// Until now every customise setting lived only in this browser's localStorage.
// A manager changing an airline's colours changed them on the machine in front
// of them and nowhere else — Nick: "the setting needs to live not locally, if a
// manager wants to change the colour to an airline, if the employee goes to the
// next station it needs to be the same."
//
// The store already existed: fids-proxy keeps airport:{IATA} in KV and the board
// already READS it on boot. What was missing was (a) the server's allowlist only
// accepted 7 of the ~14 settings, and (b) nothing ever wrote the rest to it.
//
// Writing requires a signed-in session, by design: an anonymous viewer must
// never be able to change what a terminal displays. Signed out, the change still
// applies locally to that screen and simply is not shared — which is the correct
// behaviour for someone previewing on their own device.
function _cuPushToServer(prefs) {
  var code = (typeof _acCurrentCode === 'function') ? _acCurrentCode() : '';
  if (!code) return;
  var token = (typeof _acGetToken === 'function') ? _acGetToken() : null;
  if (!token) return;              // anonymous: local only, no shared write
  try {
    _acFetch('https://fids-proxy.n-leblanc1984.workers.dev/api/airport-config/' + encodeURIComponent(code), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    }).then(function (r) {
      if (r && r.ok) { try { _cuFlashSaved('Saved to all screens / Enregistré sur tous les écrans'); } catch (e) {} }
    }, function () {});
  } catch (e) {}
}

// Pull the shared settings for this airport and make them WIN over the local
// copy. Precedence had to invert: local used to outrank the server on every
// path, so a central store would have changed nothing on its own — the manager's
// save would appear to work and then not take effect anywhere else.
// The local copy is kept as a last-known-good cache so a screen still boots
// correctly if the backend is unreachable.
function _cuPullFromServer(code, done) {
  code = (code || ((typeof _acCurrentCode === 'function') ? _acCurrentCode() : '')).toUpperCase();
  if (!code) { if (done) done(null); return; }
  try {
    fetch('https://fids-proxy.n-leblanc1984.workers.dev/api/airport-config/' + encodeURIComponent(code), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || typeof cfg !== 'object') { if (done) done(null); return; }
        try { localStorage.setItem('fids_customize_' + code, JSON.stringify(cfg)); } catch (e) {}
        if (done) done(cfg);
      })
      .catch(function () { if (done) done(null); });   // offline: the cache stands
  } catch (e) { if (done) done(null); }
}

// ── THE MISSING HALF: BOARDS ACTUALLY PULL (v23177) ─────────────────────────
// _cuPullFromServer existed and was called from NOWHERE — the push half wrote
// to the server and no station ever read it back, so a manager's change
// followed them to exactly zero other screens (Nick: "I dont think you moved
// anything over to cloud ... like you said you did" — correct; it was
// half-plumbed and reported as built).
//
// Every board pulls at boot and every 5 minutes after (the same cadence the
// kiosks already poll tokens on; _ocEvery keeps hidden boards quiet). The pull
// writes into fids_customize_<IATA> — the exact key every existing consumer
// (font restore, style, logo size, theme) already reads — and when the server
// copy genuinely differs from what this screen booted WITH, the board reloads
// once to take it, guarded by a hash so it can never loop. Server wins over
// local by design: that is the whole point of the feature.
(function _cuCloudSync() {
  function tick() {
    var code = '';
    try { code = ((typeof _acCurrentCode === 'function') ? _acCurrentCode() : '') ||
                 ((document.getElementById('apSel') || {}).value || ''); } catch (e) {}
    code = String(code || '').toUpperCase();
    if (!code) return;
    var prior = null;
    try { prior = localStorage.getItem('fids_customize_' + code); } catch (e) {}
    _cuPullFromServer(code, function (cfg) {
      if (!cfg) return;                       // offline / no server copy: cache stands
      var incoming = JSON.stringify(cfg);
      if (incoming === prior) return;         // nothing changed — do nothing at all
      var hashKey = 'fids_cu_applied_' + code;
      var applied = null;
      try { applied = sessionStorage.getItem(hashKey); } catch (e) {}
      if (applied === incoming) return;       // already reloaded for this exact copy
      try { sessionStorage.setItem(hashKey, incoming); } catch (e) {}
      try { console.log('[CU-SYNC] server settings changed for ' + code + ' — reloading to apply'); } catch (e) {}
      try { window.location.reload(); } catch (e) {}
    });
  }
  // boot pull after the airport selector settles; then the 5-minute cadence
  setTimeout(tick, 4000);
  try {
    if (typeof window._ocEvery === 'function') window._ocEvery(tick, 300000);
    else setInterval(tick, 300000);
  } catch (e) {}
})();

function _cuFlashSaved(msg) {
  try { if (typeof _acFlash === 'function') { _acFlash(msg, false); return; } } catch (e) {}
  try { if (typeof usFlash === 'function') usFlash(msg, false); } catch (e) {}
}

// Read the form into a prefs object (only fields the user actually set are stored)
function _cuReadForm() {
  var p = {};
  var theme = document.getElementById('cuThemeSelect');
  if (theme && theme.value) {
    if (theme.value.indexOf('preset:') === 0) {
      // Saved preset — store the preset ID so we can re-apply on load
      p.themePresetId = theme.value.substring(7);
      p.theme = 'custom';
    } else {
      p.theme = theme.value;  // built-in name like 'cream', 'navy-board', or 'custom'
    }
  }
  // PERSIST custom colors so they survive page refresh and airport switch.
  // Without this, theme='custom' was saved with no color data, and the next
  // applyAirportConfigToBoard() call fell back to navy/default because no
  // CSS variables were set.
  // Day & night scheduling — only persist once the section has been PAINTED
  // (the quick-theme proxy in the menu bar calls this with the Customize tab
  // never opened; reading unpainted controls would erase saved scheduling —
  // same merge rule as the theme/font fields).
  var _dnEn = document.getElementById('cuDnEnabled');
  if (_dnEn && _dnEn.dataset.painted === '1') {
    p.dayNight = {
      enabled: !!_dnEn.checked,
      day: (document.getElementById('cuDnDay') || {}).value || '',
      night: (document.getElementById('cuDnNight') || {}).value || '',
      dayStart: (document.getElementById('cuDnDayStart') || {}).value || '07:00',
      nightStart: (document.getElementById('cuDnNightStart') || {}).value || '19:00'
    };
  }
  if (p.theme === 'custom'
      || (p.dayNight && (p.dayNight.day === 'custom' || p.dayNight.night === 'custom'))) {
    try {
      // ONLY read the editor once it has been PAINTED with the saved palette
      // — same rule the Day & night block already follows. Every control in
      // this panel routes through cuApplyAndSave(), so changing the font or a
      // toggle from the menu BAR (Customize tab never opened, colour inputs
      // still at their markup defaults: white Row Odd, #f4f4f5 Row Even) used
      // to write those defaults over the operator's saved palette. Paired with
      // a Row Text that survived from the old dark scheme, that is exactly how
      // the board ended up white-on-white and stayed there however many times
      // it was "changed". Unpainted → carry the stored colours forward.
      var _cuPainted = (document.getElementById('cuColBg') || {}).dataset;
      if (_cuPainted && _cuPainted.painted === '1') {
        p.customColors = _cuReadColorsFromEditor();
      } else {
        var _prev = _cuLoad();
        if (_prev && _prev.customColors) p.customColors = _prev.customColors;
      }
    } catch (e) {}
  }
  if (_cuCurrentPos) p.logoPosition = _cuCurrentPos;
  if (_cuCurrentSize) p.logoSize = _cuCurrentSize;
  // Save the toggles' EXPLICIT state (true OR false) so the user can override
  // an admin-set default. Without this, unchecking the box just removes the
  // field, and the admin's airport-wide setting kicks back in.
  // v23125 — ONLY once PAINTED (Nick: 'airlines names coming in and out of
  // existence depending on which device'). These reads ran on EVERY save,
  // including saves from the menu bar with the Customize tab never opened —
  // writing the checkboxes' default states over the device's real settings.
  // airlineStyle:'emblem' hides the airline names, so a stray save on one
  // device erased the names there while another device kept them. Unpainted →
  // carry the stored values forward, exactly like dayNight and the colours.
  var hp = document.getElementById('cuHidePrefix');
  if (hp && hp.dataset.painted === '1') p.hideAirlinePrefix = !!hp.checked;
  else { var _pv0 = _cuLoad(); if (_pv0 && _pv0.hideAirlinePrefix !== undefined) p.hideAirlinePrefix = _pv0.hideAirlinePrefix; }
  var hw = document.getElementById('cuHideWeather');
  if (hw && hw.dataset.painted === '1') p.hideWeather = !!hw.checked;
  else { var _pv1 = _cuLoad(); if (_pv1 && _pv1.hideWeather !== undefined) p.hideWeather = _pv1.hideWeather; }
  var ae = document.getElementById('cuAirlineEmblem');
  if (ae && ae.dataset.painted === '1') p.airlineStyle = ae.checked ? 'emblem' : 'full';
  else { var _pv2 = _cuLoad(); if (_pv2 && _pv2.airlineStyle) p.airlineStyle = _pv2.airlineStyle; }
  // Font selection (v218.6+)
  var fontSel = document.getElementById('cuFontSelect');
  if (fontSel && fontSel.value) p.font = fontSel.value;
  // Display mode override (v218.6+) — auto/light/dark
  if (_cuCurrentMode && _cuCurrentMode !== 'auto') p.displayMode = _cuCurrentMode;
  // Diagnostic — tell the user what we're saving
  try { console.log('[FIDS Customize] Saved prefs:', JSON.stringify(p)); } catch (e) {}
  return p;
}

function _cuPaintForm(prefs) {
  var theme = document.getElementById('cuThemeSelect');
  // A preset id only speaks for the selection while the theme IS 'custom' —
  // a leftover id next to theme:'tus-teal' must not repaint the select back
  // to the preset (that repaint is what un-did picking the teal scenes).
  if (theme) theme.value = (prefs.theme === 'custom' && prefs.themePresetId)
    ? ('preset:' + prefs.themePresetId) : (prefs.theme || '');
  // Paint the colour editor from the SAVED palette. This was missing, so the
  // seven pickers always showed their markup defaults no matter what was
  // stored — the operator's own colours were never visible in the panel, and
  // the next save read the defaults back out (see _cuReadForm). Painting them
  // stamps data-painted so that read is trustworthy from here on.
  if (prefs.customColors) {
    try { _cuLoadPresetIntoEditor({ colors: prefs.customColors, name: (document.getElementById('cuPresetName') || {}).value || '' }); } catch (e) {}
  }
  try {
    ['cuColAccent','cuColHdr','cuColHdrText','cuColBg','cuColRowOdd','cuColRowEven','cuColText'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.dataset.painted = '1';
    });
  } catch (e) {}
  cuSetPositionUI(prefs.logoPosition || '');
  var hp = document.getElementById('cuHidePrefix');
  if (hp) { hp.checked = !!prefs.hideAirlinePrefix; hp.dataset.painted = '1'; }
  var hw = document.getElementById('cuHideWeather');
  if (hw) { hw.checked = !!prefs.hideWeather; hw.dataset.painted = '1'; }
  var ae = document.getElementById('cuAirlineEmblem');
  if (ae) { ae.checked = (prefs.airlineStyle === 'emblem'); ae.dataset.painted = '1'; }
  // Font picker
  var fontSel = document.getElementById('cuFontSelect');
  if (fontSel) fontSel.value = prefs.font || '';
  // Day & night scheduling
  var dnEn = document.getElementById('cuDnEnabled');
  if (dnEn) {
    var dn = prefs.dayNight || {};
    dnEn.checked = !!dn.enabled;
    dnEn.dataset.painted = '1';
    var dnW = document.getElementById('cuDnWrap');
    if (dnW) dnW.style.display = dn.enabled ? '' : 'none';
    var _e;
    if ((_e = document.getElementById('cuDnDay')))        _e.value = dn.day || '';
    if ((_e = document.getElementById('cuDnNight')))      _e.value = dn.night || 'tus-teal-deep';
    if ((_e = document.getElementById('cuDnDayStart')))   _e.value = dn.dayStart || '07:00';
    if ((_e = document.getElementById('cuDnNightStart'))) _e.value = dn.nightStart || '19:00';
  }
  // Display mode pill UI
  cuSetDisplayModeUI(prefs.displayMode || 'auto');
}

// ── Day & night scheduling (Nick: 'no way of controlling the night vs day
// colors') — toggle reveals the schedule; any change saves through the
// canonical merge path. Picking Custom for either period reveals the colour
// editor so there's something to edit.
function cuDayNightChanged() {
  var en = document.getElementById('cuDnEnabled');
  var wrap = document.getElementById('cuDnWrap');
  if (wrap && en) wrap.style.display = en.checked ? '' : 'none';
  try {
    var d = (document.getElementById('cuDnDay') || {}).value;
    var n = (document.getElementById('cuDnNight') || {}).value;
    if (d === 'custom' || n === 'custom') {
      var cw = document.getElementById('cuColorsWrap');
      if (cw) cw.style.display = '';
    }
  } catch (e) {}
  cuApplyAndSave();
}

// Logo position toggle (Customize)
var _cuCurrentPos = '';
function cuSetPositionUI(pos) {
  _cuCurrentPos = pos || '';
  ['Default','Left','Center','Right'].forEach(function(name) {
    var el = document.getElementById('cuPos' + name);
    if (el) {
      var match = (name === 'Default' && !_cuCurrentPos) || (name.toLowerCase() === _cuCurrentPos);
      el.classList.toggle('active', match);
    }
  });
}
function cuSetPosition(pos) {
  cuSetPositionUI(pos);
  cuApplyAndSave();
}

// ── Font picker (v218.6+) ─────────────────────────────────────────────────
// Maps the dropdown value to a CSS font stack and writes it to
// --font-primary on body. Persisted via cuApplyAndSave.
function cuFontChanged() {
  var sel = document.getElementById('cuFontSelect');
  if (!sel) return;
  _cuApplyFont(sel.value);
  cuApplyAndSave();
}

function _cuApplyFont(fontKey) {
  // Map keys to CSS font stacks. Keep in sync with css/font.css :root vars.
  var stacks = {
    'possibility':   "'Possibility', -apple-system, BlinkMacSystemFont, sans-serif",
    'ginto-nord':          "'ABC Ginto Nord', -apple-system, BlinkMacSystemFont, sans-serif",
    'ginto-nord-thin':     "'ABC Ginto Nord Thin', 'ABC Ginto Nord', sans-serif",
    'ginto-nord-light':    "'ABC Ginto Nord Light', 'ABC Ginto Nord', sans-serif",
    'ginto-nord-regular':  "'ABC Ginto Nord Regular', 'ABC Ginto Nord', sans-serif",
    'ginto-nord-medium':   "'ABC Ginto Nord Medium', 'ABC Ginto Nord', sans-serif",
    'ginto-nord-bold':     "'ABC Ginto Nord Bold', 'ABC Ginto Nord', sans-serif",
    'ginto-nord-black':    "'ABC Ginto Nord Black', 'ABC Ginto Nord', sans-serif",
    'ginto-nord-ultra':    "'ABC Ginto Nord Ultra', 'ABC Ginto Nord', sans-serif",
    'ginto-nord-hairline': "'ABC Ginto Nord Hairline', 'ABC Ginto Nord', sans-serif",
    'tr-tahoma':     "'TR Tahoma', Tahoma, Geneva, Verdana, sans-serif",
    'ac-nord-display': "'AC Nord Display', 'AC Nord Text', -apple-system, BlinkMacSystemFont, sans-serif",
    'ac-nord-text':    "'AC Nord Text', -apple-system, BlinkMacSystemFont, sans-serif",
    'ac-nord-display-regular': "'AC Nord Display Regular', 'AC Nord Display', sans-serif",
    'ac-nord-display-medium':  "'AC Nord Display Medium', 'AC Nord Display', sans-serif",
    'ac-nord-display-bold':    "'AC Nord Display Bold', 'AC Nord Display', sans-serif",
    'ac-nord-display-heavy':   "'AC Nord Display Heavy', 'AC Nord Display', sans-serif",
    'ac-nord-text-light':      "'AC Nord Text Light', 'AC Nord Text', sans-serif",
    'ac-nord-text-regular':    "'AC Nord Text Regular', 'AC Nord Text', sans-serif",
    'ac-nord-text-italic':     "'AC Nord Text Italic', 'AC Nord Text', sans-serif",
    'ac-nord-text-medium':     "'AC Nord Text Medium', 'AC Nord Text', sans-serif",
    'ac-nord-text-bold':       "'AC Nord Text Bold', 'AC Nord Text', sans-serif",
    'ac-nord-text-heavy':      "'AC Nord Text Heavy', 'AC Nord Text', sans-serif",
    'geist':         "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
    'inter':         "'Inter', system-ui, -apple-system, sans-serif",
    'manrope':       "'Manrope', system-ui, -apple-system, sans-serif",
    'space-grotesk': "'Space Grotesk', system-ui, -apple-system, sans-serif",
    'airport':       "'Airport', system-ui, -apple-system, sans-serif",
    'airport-x':     "'Airport X', system-ui, -apple-system, sans-serif",
    'system':        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    'mono':          "'JetBrains Mono', 'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace"
  };
  // v218.99.13 — overlay any user-uploaded custom fonts. Key format: "custom:Name"
  try {
    var customs = _cuLoadCustomFonts();
    for (var i = 0; i < customs.length; i++) {
      var key = 'custom:' + customs[i].name;
      stacks[key] = "'" + customs[i].name + "', system-ui, -apple-system, sans-serif";
    }
  } catch (e) {}
  var st = document.body.style;
  // Toggle the Delete button visibility based on whether a custom font is selected
  try {
    var delBtn = document.getElementById('cuFontDeleteBtn');
    if (delBtn) delBtn.style.display = (fontKey && fontKey.indexOf('custom:') === 0) ? '' : 'none';
  } catch (e) {}
  if (fontKey && stacks[fontKey]) {
    var stack = stacks[fontKey];
    // 1) Set the token (clean approach for tokenized rules)
    st.setProperty('--font-primary', stack, 'important');
    document.body.dataset.fidsFont = fontKey;
    // 2) NUCLEAR override — inject * !important rule into <head> so the
    //    font ALSO overrides hardcoded inline styles, SVG text, JS-generated
    //    content, etc. Without this only ~70% of the surface switches.
    //    Same technique used by legacy changeFont() — known to work.
    var s = document.getElementById('fids-font-override');
    if (!s) {
      s = document.createElement('style');
      s.id = 'fids-font-override';
      document.head.appendChild(s);
    }
    // .axr (Accor hotel ads) exempt — brand typography must survive the nuke
    // (same guard as fids-core changeFont; Nick: 'AC Nord takes over').
    s.textContent = '*:where(:not(.axr):not(.axr *):not(.ac-ico)), *:where(:not(.axr):not(.axr *):not(.ac-ico))::before, *:where(:not(.axr):not(.axr *):not(.ac-ico))::after { font-family: ' + stack + ' !important; }';
  } else {
    st.removeProperty('--font-primary');
    delete document.body.dataset.fidsFont;
    var existing = document.getElementById('fids-font-override');
    if (existing) existing.remove();
  }
}

// ─── CUSTOM FONT UPLOAD (v218.99.13) ─────────────────────────────────────
// Lets users add their own font files to the picker. Each font is stored
// as { name, dataUrl, mime } in localStorage and injected as an @font-face
// at startup so it's available to all FIDS surfaces (board + menu + gate).
// Persists across reloads. Total localStorage budget caps at ~5MB so fonts
// over 1MB will get rejected with a friendly error.

function _cuLoadCustomFonts() {
  try {
    var raw = localStorage.getItem('fids_custom_fonts');
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function _cuSaveCustomFonts(arr) {
  try { localStorage.setItem('fids_custom_fonts', JSON.stringify(arr)); }
  catch (e) { throw new Error('Storage full — try removing a font first'); }
}

function _cuRegisterCustomFontFace(font) {
  // Inject @font-face for this font into the head. Idempotent.
  var id = 'fids-custom-font-' + font.name.replace(/[^a-zA-Z0-9]/g, '_');
  var existing = document.getElementById(id);
  if (existing) existing.remove();
  var style = document.createElement('style');
  style.id = id;
  style.textContent =
    "@font-face { font-family: '" + font.name.replace(/'/g, '') + "'; "
    + "src: url('" + font.dataUrl + "') format('" + _cuFontFormat(font.mime) + "'); "
    + "font-weight: 100 900; font-style: normal; font-display: swap; }";
  document.head.appendChild(style);
}

function _cuFontFormat(mime) {
  if (!mime) return 'truetype';
  mime = mime.toLowerCase();
  if (mime.indexOf('woff2') >= 0) return 'woff2';
  if (mime.indexOf('woff') >= 0) return 'woff';
  if (mime.indexOf('opentype') >= 0 || mime.indexOf('otf') >= 0) return 'opentype';
  return 'truetype';
}

function _cuRefreshCustomFontGroup() {
  var group = document.getElementById('cuFontCustomGroup');
  if (!group) return;
  var customs = _cuLoadCustomFonts();
  if (!customs.length) {
    group.innerHTML = '';
    group.style.display = 'none';
    return;
  }
  group.style.display = '';
  group.innerHTML = customs.map(function(f) {
    var key = 'custom:' + f.name;
    return '<option value="' + key + '">' + f.name + '</option>';
  }).join('');
}

// Auto-restore all custom fonts on page load
(function _cuRestoreCustomFontsOnLoad() {
  try {
    var customs = _cuLoadCustomFonts();
    customs.forEach(function(f) { _cuRegisterCustomFontFace(f); });
    // Refresh dropdown when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _cuRefreshCustomFontGroup);
    } else {
      setTimeout(_cuRefreshCustomFontGroup, 0);
    }
  } catch (e) {}
})();

// ── UI handlers ─────────────────────────────────────────────────────────
function cuOpenFontUpload(open) {
  var panel = document.getElementById('cuFontUploadPanel');
  if (!panel) return;
  var show = (open === undefined) ? (panel.style.display === 'none') : !!open;
  panel.style.display = show ? '' : 'none';
  if (!show) {
    // Reset form on close
    var f = document.getElementById('cuFontFile'); if (f) f.value = '';
    var n = document.getElementById('cuFontName'); if (n) n.value = '';
    var fl = document.getElementById('cuFontUploadFlash'); if (fl) fl.textContent = '';
  }
}

function _cuFontFlash(msg, kind) {
  var fl = document.getElementById('cuFontUploadFlash');
  if (!fl) return;
  var colors = { error: '#dc2626', success: '#059669', info: 'var(--console-text-3)' };
  fl.style.color = colors[kind] || colors.info;
  fl.textContent = msg || '';
}

function cuSubmitFontUpload() {
  var fileInput = document.getElementById('cuFontFile');
  var nameInput = document.getElementById('cuFontName');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    return _cuFontFlash('Pick a font file first.', 'error');
  }
  var file = fileInput.files[0];
  var name = (nameInput && nameInput.value || '').trim();
  if (!name) {
    return _cuFontFlash('Give your font a display name.', 'error');
  }
  if (file.size > 1024 * 1024) {
    return _cuFontFlash('Font file too large (max 1 MB).', 'error');
  }
  // Conflict check
  var existing = _cuLoadCustomFonts();
  if (existing.some(function(f) { return f.name === name; })) {
    return _cuFontFlash('A custom font with that name already exists.', 'error');
  }

  _cuFontFlash('Reading file…', 'info');
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    var mime = file.type || (file.name.match(/\.(\w+)$/i) || [,'ttf'])[1].toLowerCase();
    var entry = { name: name, dataUrl: dataUrl, mime: mime, addedAt: Date.now() };
    try {
      existing.push(entry);
      _cuSaveCustomFonts(existing);
      _cuRegisterCustomFontFace(entry);
      _cuRefreshCustomFontGroup();
      _cuFontFlash('✓ Added "' + name + '" — pick it from the dropdown.', 'success');
      // Auto-select the new font
      var sel = document.getElementById('cuFontSelect');
      if (sel) { sel.value = 'custom:' + name; _cuApplyFont('custom:' + name); }
      setTimeout(function() { cuOpenFontUpload(false); }, 1200);
    } catch (err) {
      _cuFontFlash(err.message || 'Could not save font.', 'error');
    }
  };
  reader.onerror = function() { _cuFontFlash('Could not read the file.', 'error'); };
  reader.readAsDataURL(file);
}

function cuDeleteCurrentFont() {
  var sel = document.getElementById('cuFontSelect');
  if (!sel || sel.value.indexOf('custom:') !== 0) return;
  var name = sel.value.substring('custom:'.length);
  if (!confirm('Delete custom font "' + name + '"?')) return;
  var customs = _cuLoadCustomFonts().filter(function(f) { return f.name !== name; });
  _cuSaveCustomFonts(customs);
  // Remove the @font-face
  var styleId = 'fids-custom-font-' + name.replace(/[^a-zA-Z0-9]/g, '_');
  var existing = document.getElementById(styleId);
  if (existing) existing.remove();
  _cuRefreshCustomFontGroup();
  // Reset selection to default
  sel.value = '';
  _cuApplyFont('');
}

// ── Display mode override (v218.6+) ──────────────────────────────────────
// auto = respect prefers-color-scheme (default)
// light/dark = force regardless of system preference
// Implemented by setting body.dataset.fidsMode which mobile CSS reads.
var _cuCurrentMode = 'auto';
function cuSetDisplayModeUI(mode) {
  _cuCurrentMode = mode || 'auto';
  ['Auto','Light','Dark'].forEach(function(name) {
    var el = document.getElementById('cuMode' + name);
    if (el) el.classList.toggle('active', name.toLowerCase() === _cuCurrentMode);
  });
}
function cuSetDisplayMode(mode) {
  cuSetDisplayModeUI(mode);
  _cuApplyDisplayMode(mode);
  cuApplyAndSave();
}
function _cuApplyDisplayMode(mode) {
  if (mode === 'light' || mode === 'dark') {
    document.body.dataset.fidsMode = mode;
  } else {
    delete document.body.dataset.fidsMode;
  }
}

// Save form, then re-apply config to the live board
var _cuThemeExplicitDefault = false;
function cuApplyAndSave() {
  // MERGE the form over what's saved — an unsynced/untouched control must
  // never erase a saved setting (Nick: changing the FONT reverted the
  // THEME to teal, because the theme select was sitting on '' and the
  // wholesale save dropped theme:'mist').
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(_cuStorageKey()) || '{}') || {}; } catch (e) {}
  var form = _cuReadForm();
  var prefs = Object.assign({}, saved, form);
  // Picking a NON-preset theme must retire a stale saved preset id. The
  // merge kept themePresetId forever, and the Customize repaint paths give
  // it priority over prefs.theme — so choosing Teal / Teal Deep flipped
  // back to the old custom preset on the next menu open (Nick: 'the 2
  // premade scenes dont seem to work').
  if (form.theme && !form.themePresetId) delete prefs.themePresetId;
  // Explicitly choosing "Use airport default" is the ONE case that clears it.
  if (_cuThemeExplicitDefault) { prefs.theme = ''; delete prefs.themePresetId; _cuThemeExplicitDefault = false; }
  _cuSave(prefs);
  // Tell the FIDS to re-merge admin defaults + local prefs
  try {
    var code = _acCurrentCode();
    if (typeof applyAirportConfigToBoard === 'function') applyAirportConfigToBoard(code);
    // Force an immediate re-render so BIDS picks up the new prefs without
    // waiting for the rotation timer or next data fetch.
    if (typeof render === 'function') render();
  } catch (e) {}
}

// Wipe local overrides for this airport so admin defaults take over
function cuResetAll() {
  try { localStorage.removeItem(_cuStorageKey()); } catch (e) {}
  _cuPaintForm({});
  try {
    var code = _acCurrentCode();
    if (typeof applyAirportConfigToBoard === 'function') applyAirportConfigToBoard(code);
  } catch (e) {}
}

// Initial paint — when Customize tab opens, show the saved values
(function _cuInitOnTabOpen() {
  var prevSwitch = window.smSwitchTab;
  window.smSwitchTab = function(tab) {
    if (typeof prevSwitch === 'function') prevSwitch(tab);
    if (tab === 'customize') {
      try { _cuPaintForm(_cuLoad()); } catch (e) {}
    }
  };
})();

// Expose the read function so fids-core.js can merge prefs at render time
window.FIDS_CUSTOMIZE = {
  load: function(code) {
    try {
      var raw = localStorage.getItem('fids_customize_' + (code || '').toUpperCase());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
};

// v218.37: force a re-apply of the airport config NOW that FIDS_CUSTOMIZE
// is available. Without this, if menu.js loaded after fids-core.js's first
// applyAirportConfigToBoard() call (which is the normal load order),
// _userCfg was null at that moment and the theme fell back to the builtin
// default (navy) — staying that way until a user interaction triggered
// another apply. Symptom: page opens navy, switches to correct theme
// only when the user clicks Customize. This re-apply runs once on
// menu.js load and once on DOMContentLoaded for safety.
(function _ensureThemeReapplyAfterCustomizeReady() {
  function _reapply() {
    try {
      var _code = null;
      var _sel = document.getElementById('apSel');
      if (_sel && _sel.value) _code = _sel.value.trim().toUpperCase();
      if (!_code) {
        try {
          var _params = new URLSearchParams(window.location.search);
          _code = (_params.get('ap') || '').toUpperCase();
        } catch (e) {}
      }
      if (!_code) _code = (window._gateIata || 'YQM').toUpperCase();
      if (typeof applyAirportConfigToBoard === 'function') {
        applyAirportConfigToBoard(_code);
      }
    } catch (e) {}
  }
  // Fire immediately (menu.js is loaded — this very file is running)
  _reapply();
  // Also fire on DOMContentLoaded if it hasn't happened yet, just in case
  // the apSel value gets populated slightly later.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _reapply, { once: true });
  }
})();


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SEARCH — multi-field flight finder
   Searches today's loaded departures + arrivals. Matches:
     • Flight # exact or prefix      (AC1606, 1606)
     • Airline code                  (AC, WS, PD)
     • Destination IATA              (YYZ, YUL)
     • Destination city name         (toronto, montreal)
   Returns up to 8 matches as a clickable list. Click → jumps to gate or
   carousel as appropriate, or shows "currently not at a gate" if no
   gate is assigned yet.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

var _searchDebounceTimer = null;

function menuSearchFlight() {
  // Debounce so we don't filter on every keystroke
  if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(_searchFlightNow, 150);
}

function _searchFlightNow() {
  var input = document.getElementById('menuFlightSearch');
  var resultEl = document.getElementById('menuFlightResult');
  var emptyEl = document.getElementById('menuFlightEmpty');
  if (!input || !resultEl) return;

  var q = (input.value || '').trim().toUpperCase();
  if (q.length < 1) {
    resultEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }

  // Pull live data from the in-memory flight stores. Prefer global `data`
  // (always set by fetchLive), fall back to window.flightsDep/Arr (set by
  // FIDS main render only). This way Search works on FIDS, GIDS, and BIDS
  // pages alike.
  var deps, arrs;
  try {
    deps = (typeof data !== 'undefined' && data && data.dep) ? data.dep :
           (window.flightsDep || window._flightsDep || window.depList || []);
    arrs = (typeof data !== 'undefined' && data && data.arr) ? data.arr :
           (window.flightsArr || window._flightsArr || window.arrList || []);
  } catch (e) {
    deps = window.flightsDep || [];
    arrs = window.flightsArr || [];
  }

  var matches = [];
  function matchOne(f, dir) {
    if (!f) return;
    var flight = String(f.flight || '').toUpperCase();
    var airline = String(f.airline || '').toUpperCase();
    var iata = String((dir === 'dep' ? f.dest : f.origin) || f._locIata || '').toUpperCase();
    var city = String((dir === 'dep' ? f.dest : f.origin) || '').toUpperCase();
    if (
      flight.indexOf(q) === 0 ||
      flight.replace(/^[A-Z]{2,3}/,'').indexOf(q) === 0 ||
      airline === q ||
      iata === q ||
      city.indexOf(q) !== -1
    ) {
      matches.push({ f: f, dir: dir });
    }
  }
  deps.forEach(function(f) { matchOne(f, 'dep'); });
  arrs.forEach(function(f) { matchOne(f, 'arr'); });

  // De-dup by flight#+dir
  var seen = {};
  matches = matches.filter(function(m) {
    var k = (m.f.flight || '') + '|' + m.dir;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
  matches = matches.slice(0, 8);

  if (emptyEl) emptyEl.style.display = matches.length ? 'none' : '';
  if (!matches.length) {
    resultEl.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:8px;">No matches for "' + (input.value || '') + '"</div>';
    return;
  }

  var html = '';
  matches.forEach(function(m, idx) {
    var f = m.f;
    var dir = m.dir;
    var flight = f.flight || '?';
    var loc = (dir === 'dep' ? f.dest : f.origin) || '—';
    var iata = String(f._locIata || '').toUpperCase();
    var locDisplay = iata && !loc.toUpperCase().includes(iata) ? loc + ' (' + iata + ')' : loc;
    var gate = f.gate || '';
    var belt = f._belt || '';
    var arrow = dir === 'dep' ? '→' : '←';
    var dirLabel = dir === 'dep' ? 'DEP' : 'ARR';
    var dirColor = dir === 'dep' ? '#3b82f6' : '#10b981';
    // Departures show their gate; arrivals show their synthesized BIDS belt.
    // Belt may be terminal-composed ("1-4") — show as "T1 · Belt 4" so the
    // passenger knows which terminal to walk to.
    var gateLabel;
    if (dir === 'dep') {
      gateLabel = gate ? 'Gate ' + gate : '<span style="color:#f59e0b;">No gate yet</span>';
    } else if (belt) {
      var _bm = String(belt).match(/^(\w+)-(.+)$/);
      gateLabel = _bm ? ('T' + _bm[1] + ' · Belt ' + _bm[2]) : ('Belt ' + belt);
    } else {
      gateLabel = '<span style="color:#f59e0b;">No belt yet</span>';
    }
    html += '<div class="menu-search-result" onclick="menuSearchPick(' + idx + ')" data-idx="' + idx + '" '
          + 'style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #374151;border-radius:6px;margin-bottom:6px;cursor:pointer;background:#1f2937;transition:background .15s;" '
          + 'onmouseover="this.style.background=\'#2c3a4f\'" onmouseout="this.style.background=\'#1f2937\'">'
          + '<span style="font-size:10px;font-weight:700;padding:3px 7px;border-radius:3px;background:' + dirColor + ';color:#fff;letter-spacing:.5px;">' + dirLabel + '</span>'
          + '<span style="font-weight:700;color:#fff;font-variant-numeric:tabular-nums;width:80px;">' + flight + '</span>'
          + '<span style="flex:1;color:#fff;">' + arrow + ' ' + locDisplay + '</span>'
          + '<span style="font-size:11px;color:#9ca3af;">' + gateLabel + '</span>'
          + '</div>';
  });
  resultEl.innerHTML = html;
  // Stash the match list for click handlers
  window._searchMatches = matches;
}

function menuSearchPickFirst() {
  if (window._searchMatches && window._searchMatches.length) {
    menuSearchPick(0);
  }
}

function menuSearchPick(idx) {
  var m = (window._searchMatches || [])[idx];
  if (!m) return;
  closeOverlayMenu();
  _navigateToFlight(m.f, m.dir);
}

function _navigateToFlight(f, dir) {
  var ap = '';
  try { ap = document.getElementById('apSel').value || ''; } catch (e) {}
  if (!ap) return;
  var gate = f.gate || '';
  var belt = f._belt || '';
  var flight = f.flight || '';
  var loc = (dir === 'dep' ? f.dest : f.origin) || '';
  var iata = String(f._locIata || '').toUpperCase();
  var locDisplay = iata && !loc.toUpperCase().includes(iata) ? loc + '-' + iata : loc;

  // Departures need a gate; arrivals need a belt (synthesized in normalize()
  // when ADB doesn't provide one — see v218.18 belt logic in fids-core.js).
  if (dir === 'dep') {
    if (!gate || gate === '—') {
      _flightToast('Flight ' + flight + ' to ' + locDisplay + ' is not currently at a gate.');
      return;
    }
    window.location.href = 'gids.html?ap=' + encodeURIComponent(ap) + '&gate=' + encodeURIComponent(gate);
  } else {
    if (!belt) {
      _flightToast('Flight ' + flight + ' from ' + locDisplay + ' has no belt assignment yet.');
      return;
    }
    window.location.href = 'bids.html?ap=' + encodeURIComponent(ap) + '&belt=' + encodeURIComponent(belt);
  }
}

function _flightToast(msg) {
  var t = document.getElementById('_flightToast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_flightToast';
    t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 20px;border-radius:6px;border:1px solid #f59e0b;box-shadow:0 4px 12px rgba(0,0,0,.5);font-size:14px;z-index:99999;max-width:90%;text-align:center;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = '';
  setTimeout(function() { if (t) t.style.display = 'none'; }, 4000);
}


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LOGO SIZE (Customize) — also drives row height for consistency
   Pills replace the old menuLogoSize <select>. Saves to localStorage.
   Sets a CSS variable that locks the row height to logo size + 8px.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

var _cuCurrentSize = '';

function cuSetSize(size) {
  _cuCurrentSize = size || '';
  ['Small','Medium','Large'].forEach(function(name) {
    var el = document.getElementById('cuSize' + name);
    if (el) el.classList.toggle('active', name.toLowerCase() === _cuCurrentSize);
  });
  _applyLogoSize(_cuCurrentSize);
  cuApplyAndSave();
}

function _applyLogoSize(size) {
  // ONE SOURCE OF TRUTH for the tier heights: the CSS, keyed on
  // body[data-fids-logo-size]. flight-display.css pins the board at 44/66/90 and
  // baggage-display.css pins the bags screen at 68/98/132, each with height,
  // min-height and max-height locked !important — a set height no matter what.
  //
  // This function used to ALSO write --fids-logo-size/--fids-row-h on :root,
  // with a different set of numbers (44/52/60). Those never took effect,
  // because the CSS declares the same variables on `body` with !important and
  // a body declaration out-ranks an inherited :root one — so the pills read as
  // dead controls while a stale second set of numbers sat in the DOM looking
  // authoritative. Clear them and let the tier own the geometry.
  try {
    document.documentElement.style.removeProperty('--fids-logo-size');
    document.documentElement.style.removeProperty('--fids-row-h');
  } catch (e) {}
  document.body.dataset.fidsLogoSize = size || 'small';
}

// Hook into the existing _cuReadForm/Paint flow
var _origReadForm = (typeof _cuReadForm === 'function') ? _cuReadForm : null;
var _origPaintForm = (typeof _cuPaintForm === 'function') ? _cuPaintForm : null;
if (_origReadForm) {
  _cuReadForm = function() {
    var p = _origReadForm.apply(this, arguments);
    if (_cuCurrentSize) p.logoSize = _cuCurrentSize;
    return p;
  };
}
if (_origPaintForm) {
  _cuPaintForm = function(prefs) {
    _origPaintForm.apply(this, arguments);
    var s = prefs && prefs.logoSize;
    _cuCurrentSize = s || '';
    ['Small','Medium','Large'].forEach(function(name) {
      var el = document.getElementById('cuSize' + name);
      if (el) el.classList.toggle('active', name.toLowerCase() === _cuCurrentSize);
    });
    _applyLogoSize(_cuCurrentSize);
  };
}

// Apply logo size on page load if saved
(function _initLogoSize() {
  setTimeout(function() {
    try {
      var code = (typeof _acCurrentCode === 'function') ? _acCurrentCode() : 'YQM';
      var raw = localStorage.getItem('fids_customize_' + code);
      if (raw) {
        var p = JSON.parse(raw);
        // A stored customize blob with no density picked = SMALL, matching
        // BOARD_DENSITY_FALLBACK in fids-core. Without a default the
        // row-height cap never applies at all and rows render ~90px (Nick).
        _applyLogoSize((p && p.logoSize) || 'small');
      }
    } catch (e) {}
  }, 600);
})();


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   NEW UNIFIED THEME / CUSTOM COLORS / PRESETS — Customize tab
   Theme dropdown is the SINGLE entry point. "Custom" reveals the color
   editor inline. Saved presets show as <optgroup> options in the same
   dropdown — no separate list.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

var _cuActivePresetId = null;

function _cuPresetsAll() {
  try {
    var raw = localStorage.getItem('fids_presets');
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}
function _cuPresetsSave(list) {
  try { localStorage.setItem('fids_presets', JSON.stringify(list)); } catch(e){}
}

function _cuRenderPresetGroup() {
  var grp = document.getElementById('cuPresetGroup');
  if (!grp) return;
  var list = _cuPresetsAll();
  grp.innerHTML = '';
  if (!list.length) { grp.style.display = 'none'; return; }
  grp.style.display = '';
  list.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = 'preset:' + p.id;
    opt.textContent = p.name;
    grp.appendChild(opt);
  });
}

function cuThemeChanged() {
  var sel = document.getElementById('cuThemeSelect');
  if (!sel) return;
  var v = sel.value;
  _cuThemeExplicitDefault = (v === '');
  var colorsWrap = document.getElementById('cuColorsWrap');
  var deleteBtn = document.getElementById('cuDeletePresetBtn');

  if (v === 'custom') {
    // Reveal color editor for a brand-new custom theme. The editor is now on
    // screen, so its values ARE the operator's starting palette — mark it
    // painted so _cuReadForm is allowed to read them.
    _cuActivePresetId = null;
    try {
      ['cuColAccent','cuColHdr','cuColHdrText','cuColBg','cuColRowOdd','cuColRowEven','cuColText'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.dataset.painted = '1';
      });
    } catch (e) {}
    if (colorsWrap) colorsWrap.style.display = '';
    if (deleteBtn) deleteBtn.style.display = 'none';
    var nameEl = document.getElementById('cuPresetName');
    if (nameEl) nameEl.value = '';
  } else if (v && v.indexOf('preset:') === 0) {
    // Activate a saved preset and reveal editor with its values
    var id = v.substring(7);
    _cuActivePresetId = id;
    var p = _cuPresetsAll().filter(function(x) { return x.id === id; })[0];
    if (p) {
      if (colorsWrap) colorsWrap.style.display = '';
      if (deleteBtn) deleteBtn.style.display = '';
      _cuLoadPresetIntoEditor(p);
      _cuApplyCustomColors(p.colors);
    }
  } else {
    // Built-in theme picked — hide color editor
    _cuActivePresetId = null;
    if (colorsWrap) colorsWrap.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
    _cuClearCustomColors();
  }
  cuApplyAndSave();
}

function _cuLoadPresetIntoEditor(p) {
  var c = (p && p.colors) || {};
  var pairs = [
    ['cuColAccent','cuColAccentHex', c.accent || '#eab308'],
    ['cuColHdr','cuColHdrHex', c.hdr || '#27272a'],
    ['cuColHdrText','cuColHdrTextHex', c.hdrText || '#ffffff'],
    ['cuColBg','cuColBgHex', c.bg || '#0c0c0e'],
    ['cuColRowOdd','cuColRowOddHex', c.rowOdd || '#ffffff'],
    ['cuColRowEven','cuColRowEvenHex', c.rowEven || '#f4f4f5'],
    ['cuColText','cuColTextHex', c.text || '#18181b']
  ];
  pairs.forEach(function(pp) {
    var c1 = document.getElementById(pp[0]); if (c1) c1.value = pp[2];
    var c2 = document.getElementById(pp[1]); if (c2) c2.value = pp[2];
  });
  var nameEl = document.getElementById('cuPresetName');
  if (nameEl) nameEl.value = p.name || '';
}

function _cuReadColorsFromEditor() {
  function v(id, fb) { var e = document.getElementById(id); return (e && e.value) ? e.value : fb; }
  return {
    accent:  v('cuColAccent',  '#eab308'),
    hdr:     v('cuColHdr',     '#27272a'),
    hdrText: v('cuColHdrText', '#ffffff'),
    bg:      v('cuColBg',      '#0c0c0e'),
    rowOdd:  v('cuColRowOdd',  '#ffffff'),
    rowEven: v('cuColRowEven', '#f4f4f5'),
    text:    v('cuColText',    '#18181b')
  };
}

function cuColorChanged(srcId, dstId) {
  var src = document.getElementById(srcId);
  var dst = document.getElementById(dstId);
  if (src && dst) dst.value = src.value;
  _cuApplyCustomColors(_cuReadColorsFromEditor());
  cuApplyAndSave();
}

// Same legibility floor the board uses (fids-core _fidsInk). Declared through
// window so the live preview in this panel and the persisted paint in
// fids-core can never disagree about what is readable; the identity fallback
// keeps the preview working if the panel loads before the board script.
function _cuInk(fg, bg) {
  try { return (window._fidsInk ? window._fidsInk(fg, bg) : fg); } catch (e) { return fg; }
}

function _cuApplyCustomColors(c) {
  if (!c) return;
  document.body.dataset.fidsTheme = 'custom';
  // Map editor labels to the CSS variable names the board actually consumes.
  // Header BG → banner-bg, Header Text → banner-text, Accent → banner-accent
  // Board BG → bg, Row Text → text, Row Even → stripe, Row Odd → row-odd.
  // Apply on body inline style so theme rules can't outweigh us.
  var st = document.body.style;
  st.setProperty('--fids-banner-bg',     c.hdr,     'important');
  st.setProperty('--fids-banner-text',   c.hdrText, 'important');
  st.setProperty('--fids-banner-accent', c.accent,  'important');
  st.setProperty('--fids-bg',            c.bg,      'important');
  st.setProperty('--fids-text',          _cuInk(c.text, c.bg || '#0c0c0e'), 'important');
  st.setProperty('--fids-stripe',        c.rowEven, 'important');
  st.setProperty('--fids-row-odd',       c.rowOdd,  'important');
  st.setProperty('--fids-divider',       c.accent,  'important');

  // Live preview for row odd/even colors. The CSS has many built-in theme
  // rules with !important, so a custom-specific rule block keeps the color
  // picker from being eaten by older theme selectors.
  var old = document.getElementById('_fidsCustomizeLiveRules');
  if (old) old.remove();
  var css = document.createElement('style');
  css.id = '_fidsCustomizeLiveRules';
  // Odd and even rows are different grounds — one shared `td { color }` rule
  // is only ever right for one of them, which is how a white Row Text next to
  // a white Row Odd produced an invisible board. Ink each ground separately
  // and floor it.
  var _bg = c.bg || '#0c0c0e', _od = c.rowOdd || c.bg || '#ffffff', _ev = c.rowEven || c.bg || '#f4f4f5';
  var _hd = c.hdr || '#27272a', _tx = c.text || '#18181b';
  var _kOdd = _cuInk(_tx, _od), _kEven = _cuInk(_tx, _ev), _kBg = _cuInk(_tx, _bg);
  css.textContent =
    'body[data-fids-theme="custom"] #fidsBoard, body[data-fids-theme="custom"] #fidsTable { background:' + _bg + ' !important; }' +
    'body[data-fids-theme="custom"] #fidsTable tbody tr:nth-child(odd), body[data-fids-theme="custom"] .ac-bag-row:nth-child(odd), body[data-fids-theme="custom"] .flight-card { background:' + _od + ' !important; }' +
    'body[data-fids-theme="custom"] #fidsTable tbody tr:nth-child(even), body[data-fids-theme="custom"] .ac-bag-row:nth-child(even) { background:' + _ev + ' !important; }' +
    'body[data-fids-theme="custom"] #fidsTable tbody tr:nth-child(odd) td, body[data-fids-theme="custom"] .ac-bag-row:nth-child(odd), body[data-fids-theme="custom"] .flight-card .card-time, body[data-fids-theme="custom"] .flight-card .card-city { color:' + _kOdd + ' !important; }' +
    'body[data-fids-theme="custom"] #fidsTable tbody tr:nth-child(even) td, body[data-fids-theme="custom"] .ac-bag-row:nth-child(even) { color:' + _kEven + ' !important; }' +
    'body[data-fids-theme="custom"] .bidsv2-screen { background:' + _bg + ' !important; color:' + _kBg + ' !important; }' +
    'body[data-fids-theme="custom"] .bidsv2-banner { background:' + _hd + ' !important; }' +
    'body[data-fids-theme="custom"] .bidsv2-airport-name, body[data-fids-theme="custom"] .bidsv2-footer-date { color:' + _cuInk(c.hdrText || '#ffffff', _hd) + ' !important; }' +
    'body[data-fids-theme="custom"] .bidsv2-logo, body[data-fids-theme="custom"] .bidsv2-status-arrived { color:' + _cuInk(c.accent || '#eab308', _hd) + ' !important; }' +
    'body[data-fids-theme="custom"] .bidsv2-flight-row:nth-child(odd) { background:' + _od + ' !important; }' +
    'body[data-fids-theme="custom"] .bidsv2-flight-row { background:' + _ev + ' !important; }' +
    'body[data-fids-theme="custom"] .bidsv2-flight-num, body[data-fids-theme="custom"] .bidsv2-col-from, body[data-fids-theme="custom"] .bidsv2-col-time, body[data-fids-theme="custom"] .bidsv2-col-status, body[data-fids-theme="custom"] .bidsv2-airline-name { color:' + _kEven + ' !important; }' +
    'body[data-fids-theme="custom"] .bidsv2-flight-row:nth-child(odd) .bidsv2-flight-num, body[data-fids-theme="custom"] .bidsv2-flight-row:nth-child(odd) .bidsv2-col-from, body[data-fids-theme="custom"] .bidsv2-flight-row:nth-child(odd) .bidsv2-col-time, body[data-fids-theme="custom"] .bidsv2-flight-row:nth-child(odd) .bidsv2-col-status, body[data-fids-theme="custom"] .bidsv2-flight-row:nth-child(odd) .bidsv2-airline-name { color:' + _kOdd + ' !important; }';
  document.head.appendChild(css);
}

function _cuClearCustomColors() {
  var st = document.body.style;
  ['--fids-banner-bg','--fids-banner-text','--fids-banner-accent',
   '--fids-bg','--fids-text','--fids-stripe','--fids-divider','--fids-row-odd']
    .forEach(function(k) { st.removeProperty(k); });
  var live = document.getElementById('_fidsCustomizeLiveRules');
  if (live) live.remove();
}


function cuSavePreset() {
  var nameEl = document.getElementById('cuPresetName');
  var name = (nameEl && nameEl.value.trim()) || ('Custom ' + new Date().toLocaleDateString());
  var colors = _cuReadColorsFromEditor();
  var list = _cuPresetsAll();
  var id;
  if (_cuActivePresetId) {
    id = _cuActivePresetId;
    list = list.map(function(p) {
      return p.id === id ? { id: id, name: name, colors: colors } : p;
    });
  } else {
    id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    list.push({ id: id, name: name, colors: colors });
    _cuActivePresetId = id;
  }
  _cuPresetsSave(list);
  _cuRenderPresetGroup();
  // Re-select the saved preset in the dropdown
  var sel = document.getElementById('cuThemeSelect');
  if (sel) sel.value = 'preset:' + id;
  var deleteBtn = document.getElementById('cuDeletePresetBtn');
  if (deleteBtn) deleteBtn.style.display = '';
  cuApplyAndSave();
}

function cuDeleteActivePreset() {
  if (!_cuActivePresetId) return;
  if (!confirm('Delete this preset?')) return;
  var list = _cuPresetsAll().filter(function(p) { return p.id !== _cuActivePresetId; });
  _cuPresetsSave(list);
  _cuActivePresetId = null;
  _cuRenderPresetGroup();
  var sel = document.getElementById('cuThemeSelect');
  if (sel) sel.value = '';
  var colorsWrap = document.getElementById('cuColorsWrap');
  if (colorsWrap) colorsWrap.style.display = 'none';
  var deleteBtn = document.getElementById('cuDeletePresetBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';
  _cuClearCustomColors();
  cuApplyAndSave();
}

// When Customize tab opens, render preset group + restore last theme value
(function _cuInitTheme() {
  var prevSwitch = window.smSwitchTab;
  window.smSwitchTab = function(tab) {
    if (typeof prevSwitch === 'function') prevSwitch(tab);
    if (tab === 'customize') {
      try {
        _cuRenderPresetGroup();
        // Restore selection from saved local prefs
        var code = (typeof _acCurrentCode === 'function') ? _acCurrentCode() : 'YQM';
        var raw = localStorage.getItem('fids_customize_' + code);
        var prefs = raw ? JSON.parse(raw) : {};
        var sel = document.getElementById('cuThemeSelect');
        if (sel) {
          // Same guard as _cuPaintForm: only honor themePresetId while the
          // saved theme is 'custom'. A stale id next to a built-in theme
          // used to force the select (and then the SAVE below) back to the
          // preset, silently undoing a Teal / Teal Deep pick.
          if (prefs.theme === 'custom' && prefs.themePresetId) {
            sel.value = 'preset:' + prefs.themePresetId;
            cuThemeChanged();
          } else if (prefs.theme) {
            sel.value = prefs.theme;
            cuThemeChanged();
          }
        }
        if (typeof cuRenderGidsBlocks === 'function') cuRenderGidsBlocks();
        if (typeof cuRenderTicker === 'function') cuRenderTicker();
        if (typeof lmRenderList === 'function') lmRenderList();
        if (typeof luRender === 'function') luRender();
        if (typeof mbRender === 'function') mbRender();
        if (window.EditorRoles && typeof window.EditorRoles.apply === 'function') window.EditorRoles.apply();
        // (cuVideoStatus updater removed in v113 — widget gone)
      } catch (e) {}
    }
  };
})();

// ─── GIDS GATE BLOCKS UI (decoration layer for the gate screen) ───────────
// Thin UI over window.GIDSBlocks. Toggles/reorders the aircraft, ad, and
// map columns and asks the engine to rebuild. Fully self-contained and
// fails silently if the blocks module isn't present.
(function _cuGidsBlocksUI() {
  var LABELS = { aircraft: 'Aircraft info', media: 'Advertisement', map: 'Map & weather' };

  function _gateRebuild() {
    try { if (typeof requestGateRebuild === 'function') requestGateRebuild(); } catch (e) {}
  }

  window.cuRenderGidsBlocks = function () {
    var host = document.getElementById('cuGidsBlocks');
    if (!host || !window.GIDSBlocks) return;
    var cfg = window.GIDSBlocks.get();
    var html = '';
    cfg.order.forEach(function (name, i) {
      var on = !!cfg.enabled[name];
      html +=
        '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;margin-bottom:6px;' +
          'background:var(--console-surface,#1f2430);border:1px solid var(--console-border,#374151);border-radius:6px;">' +
          '<label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;font-size:13px;">' +
            '<input type="checkbox" ' + (on ? 'checked' : '') +
              ' style="width:16px;height:16px;cursor:pointer;"' +
              ' onchange="cuToggleGidsBlock(\'' + name + '\')">' +
            '<span>' + (LABELS[name] || name) + '</span>' +
          '</label>' +
          '<button class="sm-pill" title="Move up" ' + (i === 0 ? 'disabled' : '') +
            ' onclick="cuMoveGidsBlock(\'' + name + '\',-1)" style="padding:2px 8px;">▲</button>' +
          '<button class="sm-pill" title="Move down" ' + (i === cfg.order.length - 1 ? 'disabled' : '') +
            ' onclick="cuMoveGidsBlock(\'' + name + '\',1)" style="padding:2px 8px;">▼</button>' +
        '</div>';
    });
    host.innerHTML = html;
  };

  window.cuToggleGidsBlock = function (name) {
    if (!window.GIDSBlocks) return;
    var cfg = window.GIDSBlocks.get();
    cfg.enabled[name] = !cfg.enabled[name];
    window.GIDSBlocks.set(cfg);
    window.cuRenderGidsBlocks();
    _gateRebuild();
  };

  window.cuMoveGidsBlock = function (name, dir) {
    if (!window.GIDSBlocks) return;
    var cfg = window.GIDSBlocks.get();
    var i = cfg.order.indexOf(name);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= cfg.order.length) return;
    var tmp = cfg.order[i];
    cfg.order[i] = cfg.order[j];
    cfg.order[j] = tmp;
    window.GIDSBlocks.set(cfg);
    window.cuRenderGidsBlocks();
    _gateRebuild();
  };

  window.cuResetGidsBlocks = function () {
    if (!window.GIDSBlocks) return;
    window.GIDSBlocks.reset();
    window.cuRenderGidsBlocks();
    _gateRebuild();
  };
})();

// ─── TICKER MESSAGE UI (decoration layer, all screens) ────────────────────
// Thin UI over window.UIOptions.ticker. Edits the scrolling bar text from
// the Console. Empty = the engine's default multilingual safety messages.
(function _cuTickerUI() {
  function _ui() { return window.UIOptions && window.UIOptions.ticker; }

  window.cuRenderTicker = function () {
    var ta = document.getElementById('cuTickerText');
    var t = _ui();
    if (ta && t) ta.value = t.get() || '';
  };

  window.cuSaveTicker = function () {
    var ta = document.getElementById('cuTickerText');
    var t = _ui();
    if (ta && t) t.set(ta.value);
  };

  window.cuResetTicker = function () {
    var ta = document.getElementById('cuTickerText');
    var t = _ui();
    if (t) t.reset();
    if (ta) ta.value = '';
  };
})();

// ─── MIDDLE-SCREEN MEDIA UI (decoration layer, admin) ─────────────────────
// Thin UI over window.LocalMedia — paste YouTube / video / image URLs that
// the existing gate player picks up via the wrapped FIDS_MEDIA seam.
(function _lmUI() {
  function _flash(msg, bad) {
    var f = document.getElementById('lmFlash');
    if (!f) return;
    f.textContent = msg || '';
    f.style.color = bad ? '#f87171' : '#4ade80';
    if (msg) setTimeout(function () { if (f.textContent === msg) f.textContent = ''; }, 3000);
  }

  window.lmRenderList = function () {
    var host = document.getElementById('lmList');
    if (!host || !window.LocalMedia) return;
    var items = window.LocalMedia.list();
    if (!items.length) {
      host.innerHTML = '<div style="font-size:11px;color:#6b7280;font-style:italic;">No middle-screen media yet.</div>';
      return;
    }
    host.innerHTML = items.map(function (r) {
      var kind = (window.LocalMedia.parseUrl(r.url) || {});
      var tag = kind.source === 'youtube' ? (kind.ytType === 'playlist' ? 'YouTube playlist' : 'YouTube') : (kind.type === 'image' ? 'Image' : 'Video');
      var name = (r.label || r.url).replace(/</g, '&lt;');
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;margin-bottom:6px;' +
        'background:var(--console-surface,#1f2430);border:1px solid var(--console-border,#374151);border-radius:6px;">' +
        '<div style="flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        name + ' <span style="color:#9ca3af;font-size:10px;">· ' + tag + ' · ' + (r.airline || 'ALL') + (r.loop ? ' · loop' : '') + '</span></div>' +
        '<button class="sm-pill" style="padding:2px 8px;" onclick="lmAdjust(\'' + r.id + '\')">Adjust</button>' +
        '<button class="sm-pill" style="padding:2px 8px;" onclick="lmRemove(\'' + r.id + '\')">Remove</button>' +
        '</div>';
    }).join('');
  };

  window.lmAdjust = function (id) {
    if (window.MediaAdjust && window.MediaAdjust.open) window.MediaAdjust.open(id);
    else alert('Adjust panel not loaded.');
  };

  window.lmAdd = function () {
    if (!window.LocalMedia) return;
    var url = (document.getElementById('lmUrl') || {}).value || '';
    var label = (document.getElementById('lmLabel') || {}).value || '';
    var airline = (document.getElementById('lmAirline') || {}).value || 'ALL';
    var loop = !!(document.getElementById('lmLoop') || {}).checked;
    var res = window.LocalMedia.add(url, { label: label, airline: airline, loop: loop });
    if (!res.ok) { _flash(res.error || 'Could not add', true); return; }
    var u = document.getElementById('lmUrl'); if (u) u.value = '';
    var l = document.getElementById('lmLabel'); if (l) l.value = '';
    _flash('Added.');
    window.lmRenderList();
  };

  window.lmRemove = function (id) {
    if (!window.LocalMedia) return;
    window.LocalMedia.remove(id);
    window.lmRenderList();
  };
})();

// ─── LOGOS UI (no-backend, uses the engine's own override seams) ──────────
// Airport logo  → localStorage 'fids_airport_logo_<IATA>' (engine reads it)
// Airline logo  → localStorage 'fids_airline_override_<AP>_<AL>' = {url}
//                 (engine's getAirlineLogoOverride() reads this FIRST)
(function _luUI() {
  function _ap() {
    try { return (typeof _getCurrentAirportCode === 'function') ? _getCurrentAirportCode() : 'YQM'; }
    catch (e) { return 'YQM'; }
  }
  function _flash(msg, bad) {
    var f = document.getElementById('luFlash');
    if (!f) return;
    f.textContent = msg || '';
    f.style.color = bad ? '#f87171' : '#4ade80';
    if (msg) setTimeout(function () { if (f.textContent === msg) f.textContent = ''; }, 3000);
  }
  function _rebuild() {
    try { if (typeof requestGateRebuild === 'function') requestGateRebuild(); } catch (e) {}
  }

  window.luSaveAirport = function () {
    var v = (document.getElementById('luAirportLogo') || {}).value || '';
    try { if (typeof menuSetAirportLogo === 'function') menuSetAirportLogo(v); } catch (e) {}
    _flash(v.trim() ? 'Airport logo saved.' : 'Airport logo cleared.');
    _rebuild();
  };
  window.luClearAirport = function () {
    var i = document.getElementById('luAirportLogo'); if (i) i.value = '';
    try { if (typeof menuSetAirportLogo === 'function') menuSetAirportLogo(''); } catch (e) {}
    _flash('Airport logo cleared.');
    _rebuild();
  };

  window.luAddAirline = function () {
    var al = ((document.getElementById('luAlCode') || {}).value || '').trim().toUpperCase();
    var url = ((document.getElementById('luAlUrl') || {}).value || '').trim();
    if (!al || !url) { _flash('Enter an airline code and a URL.', true); return; }
    try {
      localStorage.setItem('fids_airline_override_' + _ap() + '_' + al, JSON.stringify({ url: url }));
    } catch (e) { _flash('Could not save (storage).', true); return; }
    var c = document.getElementById('luAlCode'); if (c) c.value = '';
    var u = document.getElementById('luAlUrl'); if (u) u.value = '';
    _flash(al + ' logo override saved.');
    _rebuild();
    window.luRender();
  };

  window.luRemoveAirline = function (al) {
    try { localStorage.removeItem('fids_airline_override_' + _ap() + '_' + al); } catch (e) {}
    _rebuild();
    window.luRender();
  };

  window.luRender = function () {
    var apEl = document.getElementById('luAp');
    if (apEl) apEl.textContent = _ap();
    var inp = document.getElementById('luAirportLogo');
    if (inp) { try { inp.value = localStorage.getItem('fids_airport_logo_' + _ap()) || ''; } catch (e) {} }
    var host = document.getElementById('luList');
    if (!host) return;
    var prefix = 'fids_airline_override_' + _ap() + '_';
    var rows = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) {
          var al = k.slice(prefix.length);
          var url = '';
          try { url = (JSON.parse(localStorage.getItem(k)) || {}).url || ''; } catch (e) {}
          rows.push({ al: al, url: url });
        }
      }
    } catch (e) {}
    if (!rows.length) {
      host.innerHTML = '<div style="font-size:11px;color:#6b7280;font-style:italic;">No airline logo overrides for ' + _ap() + '.</div>';
      return;
    }
    host.innerHTML = rows.map(function (r) {
      var safe = (r.url || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;margin-bottom:6px;' +
        'background:var(--console-surface,#1f2430);border:1px solid var(--console-border,#374151);border-radius:6px;">' +
        '<img src="' + safe + '" style="width:34px;height:22px;object-fit:contain;background:#0008;border-radius:3px;flex-shrink:0;" onerror="this.style.opacity=0.25">' +
        '<div style="flex:1;min-width:0;font-size:12px;"><b>' + r.al + '</b> <span style="color:#9ca3af;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:180px;vertical-align:bottom;">' + safe + '</span></div>' +
        '<button class="sm-pill" style="padding:2px 8px;" onclick="luRemoveAirline(\'' + r.al + '\')">Remove</button>' +
        '</div>';
    }).join('');
  };
})();

// ─── MEDIA SOURCE UI (where logos/wordmarks load from) ────────────────────
(function _mbUI() {
  function _preview() {
    var el = document.getElementById('mbPreview');
    if (!el) return;
    try {
      if (window.MediaBase && !window.MediaBase.get()) { el.textContent = 'Loading from this website (default).'; return; }
      var sample = (window.MediaBase && window.MediaBase.resolve)
        ? window.MediaBase.resolve('air-canada-wordmark-dark.svg') : '';
      el.textContent = sample ? ('Example: a wordmark now loads from  ' + sample) : '';
    } catch (e) { el.textContent = ''; }
  }
  window.mbRender = function () {
    if (!window.MediaBase) return;
    var b = document.getElementById('mbBase'); if (b) b.value = window.MediaBase.get() || '';
    var f = document.getElementById('mbFlat'); if (f) f.checked = !!window.MediaBase.flat();
    _preview();
  };
  window.mbSave = function () {
    if (!window.MediaBase) return;
    window.MediaBase.set((document.getElementById('mbBase') || {}).value || '');
    window.MediaBase.setFlat(!!(document.getElementById('mbFlat') || {}).checked);
    _preview();
  };
  window.mbClear = function () {
    if (!window.MediaBase) return;
    window.MediaBase.set('');
    window.MediaBase.setFlat(false);
    var b = document.getElementById('mbBase'); if (b) b.value = '';
    var f = document.getElementById('mbFlat'); if (f) f.checked = false;
    _preview();
  };
})();

// ── MEDIA ADMIN (LIBRARY + ASSIGNMENTS) ────────────────────────────────
// New unified UI replacing the simple per-airline editor. Two sub-tabs:
//   1. Library — browse, upload, and add YouTube refs to the master pool
//   2. Airlines — pick which library items each airline plays + rotation
// Backed by /api/media-library + /api/media-assignments. Admin-only.
(function _initMediaAdminV2() {
  // Working state — populated when tab opens, mutated as user edits
  var _libCache = null;          // full library doc { items: [...] }
  var _assignWorking = null;     // working copy of assignments doc
  var _libFilter = 'all';        // 'all' | 'video' | 'image'
  var _bulkMode = false;         // v218.99.17 — bulk recategorize mode
  var _bulkSelected = {};        // itemId -> true
  var _currentSubTab = 'library';
  var _currentAirline = null;
  var _pickerSlot = null;        // 'videos' | 'images' — set when picker opens
  var _pickerSelected = {};      // {itemId: true} during picker session
  var _mediaTabSyncTimer = null;

  // ── Admin check (mirrors airport admin tab) ──
  function _isAdmin() {
    try {
      if (typeof Auth !== 'undefined' && Auth.isAdmin && Auth.isAdmin()) return true;
    } catch (e) {}
    try {
      var rawUser = sessionStorage.getItem('fids_user');
      if (rawUser) {
        var user = JSON.parse(rawUser);
        if (user && user.role === 'admin') return true;
      }
    } catch (e) {}
    try {
      var token = sessionStorage.getItem('fids_token');
      if (!token) return false;
      var parts = token.split('.');
      if (parts.length !== 3) return false;
      var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !!(payload && payload.role === 'admin');
    } catch (e) {}
    return false;
  }
  function _syncTabVisibility() {
    try {
      var tab = document.getElementById('smTabMedia');
      if (!tab) return;
      tab.style.display = _isAdmin() ? '' : 'none';
    } catch (e) {}
  }
  _mediaTabSyncTimer = setInterval(_syncTabVisibility, 1000);
  setTimeout(function() { clearInterval(_mediaTabSyncTimer); _syncTabVisibility(); }, 8000);

  // Hook into tab switch — load fresh data when Media tab opens
  var _origSwitch = window.smSwitchTab;
  window.smSwitchTab = function(tabId) {
    if (typeof _origSwitch === 'function') _origSwitch(tabId);
    if (tabId === 'media') _onMediaTabOpen();
  };

  async function _onMediaTabOpen() {
    try {
      _libCache = await window.FIDS_MEDIA.loadLibrary(true);
      var assigns = await window.FIDS_MEDIA.loadAssignments(true);
      _assignWorking = JSON.parse(JSON.stringify(assigns || { airlines: {} }));
      if (!_assignWorking.airlines) _assignWorking.airlines = {};
    } catch (e) {
      console.error('[media v2 open]', e);
      _libCache = { items: [] };
      _assignWorking = { airlines: {} };
    }
    _renderLibrary();
    // Reset assignments side
    var sel = document.getElementById('mlAssignAirline');
    if (sel) sel.value = '';
    _currentAirline = null;
    _hideAssignEditor();
  }

  // ── HTML escaping helpers ──
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function _bytesH(b) {
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    return (b/1024/1024).toFixed(1) + ' MB';
  }
  function _ytId(input, type) {
    var s = String(input || '').trim();
    if (!s) return '';
    if (type === 'playlist') {
      var m = s.match(/[?&]list=([A-Za-z0-9_-]+)/);
      if (m) return m[1];
      if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
      return '';
    }
    var m1 = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if (m1) return m1[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    return '';
  }

  // ── SUB-TAB SWITCHING ──
  window.mediaSubSwitch = function(which) {
    _currentSubTab = which;
    var libBtn = document.getElementById('mlSubLibBtn');
    var asBtn = document.getElementById('mlSubAssignBtn');
    var libPnl = document.getElementById('mlSubLib');
    var asPnl = document.getElementById('mlSubAssign');
    if (which === 'library') {
      if (libPnl) libPnl.style.display = '';
      if (asPnl) asPnl.style.display = 'none';
      if (libBtn) { libBtn.style.background = '#3b82f6'; libBtn.style.color = '#fff'; }
      if (asBtn) { asBtn.style.background = '#27272a'; asBtn.style.color = '#9ca3af'; }
    } else {
      if (libPnl) libPnl.style.display = 'none';
      if (asPnl) asPnl.style.display = '';
      if (libBtn) { libBtn.style.background = '#27272a'; libBtn.style.color = '#9ca3af'; }
      if (asBtn) { asBtn.style.background = '#3b82f6'; asBtn.style.color = '#fff'; }
    }
  };

  // ── LIBRARY: render, filter, add, upload, delete ──
  window.mediaLibFilter = function(kind) {
    _libFilter = kind;
    ['mlFilterAll','mlFilterVideo','mlFilterImage'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.background = '#27272a';
        el.style.color = '#9ca3af';
      }
    });
    var active = { all:'mlFilterAll', video:'mlFilterVideo', image:'mlFilterImage' }[kind];
    var ae = document.getElementById(active);
    if (ae) { ae.style.background = '#3b82f6'; ae.style.color = '#fff'; }
    _renderLibrary();
  };

  function _renderLibrary() {
    var list = document.getElementById('mlLibraryList');
    var count = document.getElementById('mlItemCount');
    if (!list) return;
    var items = (_libCache && _libCache.items) || [];
    var filtered = items.filter(function(it) {
      if (_libFilter === 'all') return true;
      return it.type === _libFilter;
    });
    if (count) count.textContent = filtered.length + ' item' + (filtered.length === 1 ? '' : 's');
    if (filtered.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:#6b7280;font-style:italic;padding:16px;text-align:center;">No items yet. Add a YouTube link or upload a file below.</div>';
      return;
    }
    list.innerHTML = filtered.map(function(it) {
      var thumb;
      if (it.type === 'video') {
        if (it.source === 'youtube' && it.ytType === 'video') {
          thumb = '<div style="width:48px;height:32px;background:#ef4444;color:#fff;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:9px;font-weight:700;">YT</div>';
        } else if (it.source === 'youtube' && it.ytType === 'playlist') {
          thumb = '<div style="width:48px;height:32px;background:#dc2626;color:#fff;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:9px;font-weight:700;">PL</div>';
        } else {
          thumb = '<div style="width:48px;height:32px;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:9px;font-weight:700;">VID</div>';
        }
      } else {
        thumb = '<img src="' + _esc(it.url || '') + '" style="width:48px;height:32px;object-fit:cover;border-radius:3px;background:#374151;" onerror="this.style.opacity=0.3">';
      }
      var meta = it.source === 'youtube'
        ? (it.ytType === 'playlist' ? 'YouTube Playlist' : 'YouTube Video') + ' · ' + (it.ytId || '').slice(0, 14)
        : 'Upload · ' + _bytesH(it.sizeBytes || 0);
      var label = it.label || '(no label)';
      var category = it.category || 'ads';
      var catLabels = { 'ads': 'Ads', 'airport-logo': 'Airport Logo', 'airline-logo': 'Airline Logo', 'background': 'Background' };
      var catColors = { 'ads': '#3b82f6', 'airport-logo': '#10b981', 'airline-logo': '#a855f7', 'background': '#f59e0b' };
      var catBadge = '<span style="font-size:9px;font-weight:700;letter-spacing:0.05em;padding:2px 6px;border-radius:3px;'
        + 'background:' + (catColors[category] || '#374151') + '22;'
        + 'color:' + (catColors[category] || '#9ca3af') + ';'
        + 'border:1px solid ' + (catColors[category] || '#374151') + '55;'
        + 'text-transform:uppercase;white-space:nowrap;">'
        + (catLabels[category] || category) + '</span>';
      // Playback summary — shown in small text under the meta
      var pb = it.playback || {};
      var pbSummary = '';
      if (it.type === 'video') {
        if (pb.loop) pbSummary = '🔁 Loop';
        // Playlists ignore "loop" since they auto-advance through their videos
        if (it.source === 'youtube' && it.ytType === 'playlist') pbSummary = 'Auto-advance';
      } else {
        // Image
        var dur = pb.duration || '10s';
        pbSummary = '⏱ ' + (dur === 'indefinite' ? 'Stays until next' : dur);
      }
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#1f2937;border-radius:4px;margin-bottom:4px;">'
        + (_bulkMode
            ? '<input type="checkbox" class="ml-bulk-cb" data-item-id="' + _esc(it.id) + '" '
              + (_bulkSelected[it.id] ? 'checked' : '')
              + ' onchange="mediaLibBulkSelect(\'' + _esc(it.id) + '\', this.checked)" '
              + 'style="margin:0;flex-shrink:0;">'
            : '')
        + thumb
        + '<div style="flex:1;min-width:0;">'
        + '<div style="display:flex;align-items:center;gap:6px;">'
        +   '<div style="font-size:12px;color:#e5e7eb;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">' + _esc(label) + '</div>'
        +   catBadge
        + '</div>'
        + '<div style="font-size:10px;color:#6b7280;">' + _esc(meta) + (pbSummary ? ' · ' + _esc(pbSummary) : '') + '</div>'
        + '</div>'
        + (_bulkMode ? '' : '<button onclick="mediaLibEdit(\'' + _esc(it.id) + '\')" style="background:#374151;color:#9ca3af;border:none;padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;">Edit</button>')
        + (_bulkMode ? '' : '<button onclick="mediaLibDelete(\'' + _esc(it.id) + '\')" style="background:#7f1d1d;color:#fca5a5;border:none;padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;">Delete</button>')
        + '</div>';
    }).join('');
  }

  window.mediaLibAddYouTube = async function() {
    var typeEl = document.getElementById('mlYTType');
    var urlEl = document.getElementById('mlYTUrl');
    var lblEl = document.getElementById('mlYTLabel');
    if (!typeEl || !urlEl) return;
    var ytType = typeEl.value;
    var raw = urlEl.value;
    var label = lblEl ? lblEl.value.trim() : '';
    var id = _ytId(raw, ytType);
    if (!id) return _libFlash('Could not parse a YouTube ' + ytType + ' from that input.', 'error');
    try {
      _libFlash('Adding…', 'info');
      await window.FIDS_MEDIA.addYouTube(ytType, id, label);
      // Refresh from server (cache was updated by save)
      _libCache = window.FIDS_MEDIA.getLibrary();
      _renderLibrary();
      urlEl.value = ''; if (lblEl) lblEl.value = '';
      _libFlash('Added to library.', 'success');
    } catch (e) {
      _libFlash('Failed: ' + e.message, 'error');
    }
  };

  window.mediaLibUpload = async function() {
    var fileEl = document.getElementById('mlUploadFile');
    var lblEl = document.getElementById('mlUploadLabel');
    var prog = document.getElementById('mlUploadProgress');
    if (!fileEl || !fileEl.files || !fileEl.files[0]) {
      return _libFlash('Pick a file first.', 'error');
    }
    var file = fileEl.files[0];
    var label = lblEl ? lblEl.value.trim() : '';
    if (prog) { prog.style.display = ''; prog.textContent = 'Uploading ' + file.name + ' (' + _bytesH(file.size) + ')…'; }
    try {
      await window.FIDS_MEDIA.uploadFile(file, label);
      _libCache = window.FIDS_MEDIA.getLibrary();
      _renderLibrary();
      fileEl.value = ''; if (lblEl) lblEl.value = '';
      if (prog) prog.style.display = 'none';
      _libFlash('Uploaded.', 'success');
    } catch (e) {
      if (prog) prog.style.display = 'none';
      _libFlash('Upload failed: ' + e.message, 'error');
    }
  };

  // Open an edit modal for a library item — set label, loop (videos),
  // or display duration (images). Renders into the picker modal area
  // since we already have one. Reuses _libCache for lookup.
  window.mediaLibEdit = function(itemId) {
    var lib = (_libCache && _libCache.items) || [];
    var it = lib.find(function(x) { return x.id === itemId; });
    if (!it) return _libFlash('Item not found', 'error');
    var modal = document.getElementById('mlPickerModal');
    var title = document.getElementById('mlPickerTitle');
    var listEl = document.getElementById('mlPickerList');
    if (!modal || !listEl) return;
    title.textContent = 'Edit: ' + (it.label || '(no label)');
    var pb = it.playback || {};
    var html = '<div style="font-size:12px;color:#9ca3af;margin-bottom:10px;">' + (it.type === 'video' ? 'Video settings' : 'Image settings') + '</div>';
    html += '<label style="display:block;margin-bottom:10px;">'
         + '<div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">Label</div>'
         + '<input id="mlEditLabel" type="text" value="' + _esc(it.label || '') + '" style="background:#27272a;color:#fff;border:1px solid #52525b;padding:5px 8px;border-radius:4px;font-size:12px;width:100%;">'
         + '</label>';
    // v218.99.14 — category selector
    var currentCat = it.category || 'ads';
    html += '<label style="display:block;margin-bottom:10px;">'
         + '<div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">Category</div>'
         + '<select id="mlEditCategory" style="background:#27272a;color:#fff;border:1px solid #52525b;padding:5px 8px;border-radius:4px;font-size:12px;width:100%;">'
         +   '<option value="ads"' + (currentCat === 'ads' ? ' selected' : '') + '>Ads &amp; Slides</option>'
         +   '<option value="airport-logo"' + (currentCat === 'airport-logo' ? ' selected' : '') + '>Airport Logo</option>'
         +   '<option value="airline-logo"' + (currentCat === 'airline-logo' ? ' selected' : '') + '>Airline Logo</option>'
         +   '<option value="background"' + (currentCat === 'background' ? ' selected' : '') + '>Background</option>'
         + '</select>'
         + '<div style="font-size:10px;color:#6b7280;margin-top:3px;">Category determines which picker this item shows up in.</div>'
         + '</label>';
    if (it.type === 'video') {
      // Playlists auto-advance through their videos — "loop" doesn't apply.
      // For single videos and uploads, offer a loop checkbox.
      var isPlaylist = (it.source === 'youtube' && it.ytType === 'playlist');
      if (isPlaylist) {
        html += '<div style="font-size:11px;color:#6b7280;margin-bottom:10px;font-style:italic;">Playlists auto-advance through all videos. Loop is not applicable.</div>';
      } else {
        html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
             + '<input id="mlEditLoop" type="checkbox"' + (pb.loop ? ' checked' : '') + '>'
             + '<span style="font-size:12px;color:#e5e7eb;">Loop video (replay from beginning when it ends)</span>'
             + '</label>';
      }
    } else {
      // Image — offer duration choices
      var dur = pb.duration || '10s';
      html += '<label style="display:block;margin-bottom:10px;">'
           + '<div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">Display duration</div>'
           + '<select id="mlEditDuration" style="background:#27272a;color:#fff;border:1px solid #52525b;padding:5px 8px;border-radius:4px;font-size:12px;width:100%;">'
           + '<option value="5s"' + (dur === '5s' ? ' selected' : '') + '>5 seconds</option>'
           + '<option value="10s"' + (dur === '10s' ? ' selected' : '') + '>10 seconds</option>'
           + '<option value="15s"' + (dur === '15s' ? ' selected' : '') + '>15 seconds</option>'
           + '<option value="30s"' + (dur === '30s' ? ' selected' : '') + '>30 seconds</option>'
           + '<option value="60s"' + (dur === '60s' ? ' selected' : '') + '>1 minute</option>'
           + '<option value="indefinite"' + (dur === 'indefinite' ? ' selected' : '') + '>Stay until next flight</option>'
           + '</select>'
           + '</label>';
    }
    listEl.innerHTML = html;
    // Override the modal buttons for edit mode
    var footer = modal.querySelector('div[style*="margin-top:12px"]');
    if (footer) {
      footer.innerHTML = '<button onclick="mediaLibEditSave(\'' + _esc(itemId) + '\')" class="sm-btn sm-btn-primary sm-btn-sm" style="flex:1;">Save</button>'
        + '<button onclick="mediaPickerClose()" class="sm-btn sm-btn-secondary sm-btn-sm">Cancel</button>';
    }
    modal.style.display = 'flex';
  };

  window.mediaLibEditSave = async function(itemId) {
    var lib = (_libCache && _libCache.items) || [];
    var it = lib.find(function(x) { return x.id === itemId; });
    if (!it) return _libFlash('Item not found', 'error');
    var labelEl = document.getElementById('mlEditLabel');
    var catEl = document.getElementById('mlEditCategory');
    var loopEl = document.getElementById('mlEditLoop');
    var durEl = document.getElementById('mlEditDuration');
    var patch = {};
    if (labelEl) patch.label = labelEl.value;
    if (catEl) patch.category = catEl.value;
    patch.playback = {};
    if (loopEl) patch.playback.loop = loopEl.checked;
    if (durEl) patch.playback.duration = durEl.value;
    try {
      var saved = await window.FIDS_MEDIA.updateItem(itemId, patch);
      // v218.99.18 — verify the worker actually applied the category. Old
      // workers return 200 OK but silently drop unknown fields.
      if (patch.category && saved && saved.category !== patch.category) {
        _libFlash('Label saved, but category was NOT saved — worker needs redeploy ("wrangler deploy" from ~/fids-proxy).', 'error');
        // still close the modal and refresh so they see the partial state
      } else {
        _libFlash('Saved.', 'success');
      }
      _libCache = window.FIDS_MEDIA.getLibrary();
      _renderLibrary();
      mediaPickerClose();
      // Restore the original picker footer markup for next use
      var modal = document.getElementById('mlPickerModal');
      var footer = modal && modal.querySelector('div[style*="margin-top:12px"]');
      if (footer) {
        footer.innerHTML = '<button onclick="mediaPickerConfirm()" class="sm-btn sm-btn-primary sm-btn-sm" style="flex:1;">Add Selected</button>'
          + '<button onclick="mediaPickerClose()" class="sm-btn sm-btn-secondary sm-btn-sm">Cancel</button>';
      }
    } catch (e) {
      _libFlash('Save failed: ' + e.message, 'error');
    }
  };

  window.mediaLibDelete = async function(itemId) {
    if (!confirm('Delete this item? It will also be removed from any airline assignments.')) return;
    try {
      await window.FIDS_MEDIA.deleteItem(itemId);
      _libCache = window.FIDS_MEDIA.getLibrary();
      // Reload assignments since the worker stripped references
      var assigns = await window.FIDS_MEDIA.loadAssignments(true);
      _assignWorking = JSON.parse(JSON.stringify(assigns || { airlines: {} }));
      _renderLibrary();
      if (_currentAirline) _renderAssignEditor();
      _libFlash('Deleted.', 'success');
    } catch (e) {
      _libFlash('Delete failed: ' + e.message, 'error');
    }
  };

  // ─── BULK RECATEGORIZE (v218.99.17) ───────────────────────────────────
  // Migration helper: when uploads happen before the worker is redeployed
  // with category support, items get saved without a category. This tool
  // lets you batch-fix that by selecting items and moving them to the
  // right category in one shot.

  function _bulkUpdateCount() {
    var n = Object.keys(_bulkSelected).filter(function(k) { return _bulkSelected[k]; }).length;
    var el = document.getElementById('mlBulkCount');
    if (el) el.textContent = n;
  }

  function _bulkFlash(msg, kind) {
    var el = document.getElementById('mlBulkFlash');
    if (!el) return;
    var colors = { info: '#9ca3af', success: '#6ee7b7', error: '#fca5a5' };
    el.style.color = colors[kind] || colors.info;
    el.textContent = msg || '';
  }

  window.mediaLibBulkToggle = function() {
    _bulkMode = !_bulkMode;
    _bulkSelected = {};
    var panel = document.getElementById('mlBulkPanel');
    var btn = document.getElementById('mlBulkRecatBtn');
    if (panel) panel.style.display = _bulkMode ? '' : 'none';
    if (btn) {
      btn.style.background = _bulkMode ? '#3b82f6' : '#27272a';
      btn.style.color = _bulkMode ? '#fff' : '#9ca3af';
    }
    _bulkUpdateCount();
    _bulkFlash('', '');
    _renderLibrary();
  };

  window.mediaLibBulkSelect = function(itemId, checked) {
    if (checked) _bulkSelected[itemId] = true;
    else delete _bulkSelected[itemId];
    _bulkUpdateCount();
  };

  window.mediaLibBulkSelectAll = function(select) {
    if (!select) {
      _bulkSelected = {};
    } else {
      // Select all VISIBLE items (i.e., matching the current filter)
      var items = (_libCache && _libCache.items) || [];
      items.filter(function(it) {
        if (_libFilter === 'all') return true;
        return it.type === _libFilter;
      }).forEach(function(it) { _bulkSelected[it.id] = true; });
    }
    _bulkUpdateCount();
    _renderLibrary();
  };

  window.mediaLibBulkApply = async function() {
    var catEl = document.getElementById('mlBulkCategory');
    if (!catEl) return;
    var target = catEl.value;
    var ids = Object.keys(_bulkSelected).filter(function(k) { return _bulkSelected[k]; });
    if (!ids.length) return _bulkFlash('Nothing selected.', 'error');
    if (!confirm('Move ' + ids.length + ' item' + (ids.length === 1 ? '' : 's') + ' to "' + target + '"?')) return;

    // ─── Probe worker on first item ───
    // The OLD worker (pre-categorize support) returns 200 OK on PATCH but
    // silently ignores unknown fields. We detect that by comparing the
    // returned item's category against the requested target.
    _bulkFlash('Verifying worker support…', 'info');
    var firstItem;
    try {
      firstItem = await window.FIDS_MEDIA.updateItem(ids[0], { category: target });
    } catch (e) {
      _bulkFlash('Network error: ' + e.message, 'error');
      return;
    }
    if (!firstItem || firstItem.category !== target) {
      _bulkFlash('Worker not updated yet — categories not saved. Run "wrangler deploy" from ~/fids-proxy, hard-refresh, then try again.', 'error');
      return;
    }

    // Worker supports category — process the rest
    var ok = 1, failed = 0;
    for (var i = 1; i < ids.length; i++) {
      try {
        var r = await window.FIDS_MEDIA.updateItem(ids[i], { category: target });
        if (r && r.category === target) ok++;
        else failed++;
      } catch (e) {
        failed++;
        console.warn('[bulk recategorize] failed for', ids[i], e.message);
      }
      _bulkFlash('Applying… ' + (i + 1) + '/' + ids.length, 'info');
    }
    _libCache = window.FIDS_MEDIA.getLibrary();
    _bulkSelected = {};
    _bulkUpdateCount();
    _renderLibrary();
    if (failed) {
      _bulkFlash('Done. ' + ok + ' updated, ' + failed + ' failed.', 'error');
    } else {
      _bulkFlash('✓ Moved ' + ok + ' item' + (ok === 1 ? '' : 's') + '.', 'success');
    }
  };

  function _libFlash(msg, kind) { _flashEl('mlLibFlash', msg, kind); }
  function _assignFlash(msg, kind) { _flashEl('mlAssignFlash', msg, kind); }
  function _flashEl(id, msg, kind) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.display = '';
    el.textContent = msg;
    var bg = '#1f2937', fg = '#9ca3af';
    if (kind === 'success') { bg = '#064e3b'; fg = '#6ee7b7'; }
    if (kind === 'error') { bg = '#7f1d1d'; fg = '#fca5a5'; }
    if (kind === 'info') { bg = '#1e3a8a'; fg = '#93c5fd'; }
    el.style.background = bg;
    el.style.color = fg;
    if (kind === 'success' || kind === 'info') {
      setTimeout(function() { if (el) el.style.display = 'none'; }, 4000);
    }
  }

  // ── ASSIGNMENTS ──
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'mlAssignAirline') {
      var wrap = document.getElementById('mlAssignCustomWrap');
      if (e.target.value === 'CUSTOM') {
        if (wrap) wrap.style.display = '';
        _hideAssignEditor();
      } else {
        if (wrap) wrap.style.display = 'none';
        if (e.target.value) _selectAirline(e.target.value);
        else _hideAssignEditor();
      }
    }
    if (e.target && e.target.id === 'mlAssignCustom') {
      var v = String(e.target.value || '').trim().toUpperCase();
      if (v.length >= 2 && v.length <= 3) _selectAirline(v);
    }
  });

  function _hideAssignEditor() {
    var ed = document.getElementById('mlAssignEditor');
    if (ed) ed.style.display = 'none';
  }

  function _selectAirline(code) {
    var c = String(code || '').toUpperCase().trim();
    if (!c) return;
    _currentAirline = c;
    if (!_assignWorking.airlines[c]) {
      _assignWorking.airlines[c] = {
        videos: { mode: 'rotate', itemIds: [], primaryId: null },
        images: { mode: 'rotate', itemIds: [], primaryId: null }
      };
    }
    // Backfill missing slots if airline existed but had no videos/images key
    if (!_assignWorking.airlines[c].videos) _assignWorking.airlines[c].videos = { mode: 'rotate', itemIds: [], primaryId: null };
    if (!_assignWorking.airlines[c].images) _assignWorking.airlines[c].images = { mode: 'rotate', itemIds: [], primaryId: null };
    var ed = document.getElementById('mlAssignEditor');
    if (ed) ed.style.display = '';
    _renderAssignEditor();
  }

  function _renderAssignEditor() {
    if (!_currentAirline) return;
    var entry = _assignWorking.airlines[_currentAirline];
    _renderModePills('videos', entry.videos.mode);
    _renderModePills('images', entry.images.mode);
    _renderAssignList('videos');
    _renderAssignList('images');
  }

  function _renderModePills(slot, mode) {
    var prefix = slot === 'videos' ? 'mlVidMode' : 'mlImgMode';
    var rotateBtn = document.getElementById(prefix + 'Rotate');
    var singleBtn = document.getElementById(prefix + 'Single');
    var hint = document.getElementById(prefix + 'Hint');
    if (rotateBtn && singleBtn) {
      if (mode === 'single') {
        rotateBtn.style.background = '#27272a'; rotateBtn.style.color = '#9ca3af';
        singleBtn.style.background = '#3b82f6'; singleBtn.style.color = '#fff';
        if (hint) hint.textContent = '— always plays the first item';
      } else {
        rotateBtn.style.background = '#3b82f6'; rotateBtn.style.color = '#fff';
        singleBtn.style.background = '#27272a'; singleBtn.style.color = '#9ca3af';
        if (hint) hint.textContent = '— cycles through all items';
      }
    }
  }

  function _renderAssignList(slot) {
    var listId = slot === 'videos' ? 'mlAssignVideoList' : 'mlAssignImageList';
    var list = document.getElementById(listId);
    if (!list || !_currentAirline) return;
    var entry = _assignWorking.airlines[_currentAirline][slot];
    var ids = entry.itemIds || [];
    if (ids.length === 0) {
      list.innerHTML = '<div style="font-size:11px;color:#6b7280;font-style:italic;padding:10px;text-align:center;">No items assigned. Click "Pick from Library" below.</div>';
      return;
    }
    var lib = (_libCache && _libCache.items) || [];
    list.innerHTML = ids.map(function(id, i) {
      var it = lib.find(function(x) { return x.id === id; });
      var thumb, label, meta;
      if (!it) {
        thumb = '<div style="width:36px;height:24px;background:#374151;border-radius:3px;"></div>';
        label = '(missing item ' + id.slice(0,8) + '…)';
        meta = '';
      } else {
        if (it.type === 'image') {
          thumb = '<img src="' + _esc(it.url || '') + '" style="width:36px;height:24px;object-fit:cover;border-radius:3px;background:#374151;" onerror="this.style.opacity=0.3">';
        } else {
          var lbl = it.source === 'youtube' ? (it.ytType === 'playlist' ? 'PL' : 'YT') : 'VID';
          var bg = it.source === 'youtube' ? (it.ytType === 'playlist' ? '#dc2626' : '#ef4444') : '#3b82f6';
          thumb = '<div style="width:36px;height:24px;background:'+bg+';color:#fff;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:9px;font-weight:700;">'+lbl+'</div>';
        }
        label = it.label || '(no label)';
        meta = it.source === 'youtube' ? (it.ytType === 'playlist' ? 'Playlist' : 'Video') : (it.type === 'video' ? 'Video upload' : 'Image upload');
      }
      var primaryStar = (entry.primaryId === id) ? '<span style="color:#fbbf24;font-size:11px;margin-right:4px;" title="Primary (single mode default)">★</span>' : '';
      return '<div style="display:flex;align-items:center;gap:6px;padding:5px 6px;background:#1f2937;border-radius:4px;margin-bottom:3px;">'
        + thumb
        + '<div style="flex:1;min-width:0;">'
        + primaryStar
        + '<span style="font-size:11px;color:#e5e7eb;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:200px;vertical-align:middle;">' + _esc(label) + '</span>'
        + '<div style="font-size:9px;color:#6b7280;">' + _esc(meta) + '</div>'
        + '</div>'
        + (i > 0 ? '<button onclick="mediaAssignMove(\''+slot+'\','+i+',-1)" style="background:#374151;color:#9ca3af;border:none;padding:2px 6px;border-radius:3px;font-size:11px;cursor:pointer;">↑</button>' : '')
        + (i < ids.length - 1 ? '<button onclick="mediaAssignMove(\''+slot+'\','+i+',1)" style="background:#374151;color:#9ca3af;border:none;padding:2px 6px;border-radius:3px;font-size:11px;cursor:pointer;">↓</button>' : '')
        + (entry.primaryId !== id ? '<button onclick="mediaAssignSetPrimary(\''+slot+'\',\''+_esc(id)+'\')" style="background:#374151;color:#fbbf24;border:none;padding:2px 6px;border-radius:3px;font-size:10px;cursor:pointer;" title="Mark as primary">★</button>' : '')
        + '<button onclick="mediaAssignRemove(\''+slot+'\','+i+')" style="background:#7f1d1d;color:#fca5a5;border:none;padding:2px 6px;border-radius:3px;font-size:10px;cursor:pointer;">×</button>'
        + '</div>';
    }).join('');
  }

  window.mediaAssignSetMode = function(slot, mode) {
    if (!_currentAirline) return;
    _assignWorking.airlines[_currentAirline][slot].mode = mode;
    _renderModePills(slot, mode);
  };

  window.mediaAssignMove = function(slot, idx, delta) {
    if (!_currentAirline) return;
    var ids = _assignWorking.airlines[_currentAirline][slot].itemIds;
    var ni = idx + delta;
    if (ni < 0 || ni >= ids.length) return;
    var tmp = ids[idx]; ids[idx] = ids[ni]; ids[ni] = tmp;
    _renderAssignList(slot);
  };

  window.mediaAssignRemove = function(slot, idx) {
    if (!_currentAirline) return;
    var entry = _assignWorking.airlines[_currentAirline][slot];
    var removedId = entry.itemIds[idx];
    entry.itemIds.splice(idx, 1);
    if (entry.primaryId === removedId) entry.primaryId = entry.itemIds[0] || null;
    _renderAssignList(slot);
  };

  window.mediaAssignSetPrimary = function(slot, itemId) {
    if (!_currentAirline) return;
    _assignWorking.airlines[_currentAirline][slot].primaryId = itemId;
    _renderAssignList(slot);
  };

  // ── PICKER MODAL ──
  window.mediaAssignPickItem = function(slot) {
    if (!_currentAirline) return;
    _pickerSlot = slot;
    _pickerSelected = {};
    var titleEl = document.getElementById('mlPickerTitle');
    if (titleEl) titleEl.textContent = 'Pick ' + (slot === 'videos' ? 'videos' : 'images') + ' for ' + _currentAirline;
    _renderPicker();
    var modal = document.getElementById('mlPickerModal');
    if (modal) modal.style.display = 'flex';
  };

  function _renderPicker() {
    var list = document.getElementById('mlPickerList');
    if (!list) return;
    var items = (_libCache && _libCache.items) || [];
    var matchType = _pickerSlot === 'videos' ? 'video' : 'image';
    var filtered = items.filter(function(it) { return it.type === matchType; });
    var alreadyAssigned = _currentAirline ? (_assignWorking.airlines[_currentAirline][_pickerSlot].itemIds || []) : [];
    if (filtered.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:#6b7280;font-style:italic;padding:14px;text-align:center;">No '+matchType+' items in library yet. Add some under the Library tab first.</div>';
      return;
    }
    list.innerHTML = filtered.map(function(it) {
      var isAssigned = alreadyAssigned.indexOf(it.id) !== -1;
      var thumb;
      if (it.type === 'image') {
        thumb = '<img src="' + _esc(it.url || '') + '" style="width:42px;height:28px;object-fit:cover;border-radius:3px;background:#374151;" onerror="this.style.opacity=0.3">';
      } else {
        var lbl = it.source === 'youtube' ? (it.ytType === 'playlist' ? 'PL' : 'YT') : 'VID';
        var bg = it.source === 'youtube' ? (it.ytType === 'playlist' ? '#dc2626' : '#ef4444') : '#3b82f6';
        thumb = '<div style="width:42px;height:28px;background:'+bg+';color:#fff;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:10px;font-weight:700;">'+lbl+'</div>';
      }
      var label = it.label || '(no label)';
      return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:'+(isAssigned?'#1e3a8a':'#1f2937')+';border-radius:4px;margin-bottom:3px;cursor:'+(isAssigned?'default':'pointer')+';opacity:'+(isAssigned?'0.55':'1')+';">'
        + '<input type="checkbox"' + (isAssigned ? ' checked disabled' : (' onchange="mediaPickerToggle(\''+_esc(it.id)+'\', this.checked)"')) + ' style="margin:0;">'
        + thumb
        + '<span style="flex:1;font-size:12px;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(label) + (isAssigned ? ' <em style="color:#9ca3af;">(already added)</em>' : '') + '</span>'
        + '</label>';
    }).join('');
  }

  window.mediaPickerToggle = function(itemId, checked) {
    if (checked) _pickerSelected[itemId] = true;
    else delete _pickerSelected[itemId];
  };

  window.mediaPickerConfirm = function() {
    if (!_currentAirline || !_pickerSlot) return mediaPickerClose();
    var entry = _assignWorking.airlines[_currentAirline][_pickerSlot];
    Object.keys(_pickerSelected).forEach(function(id) {
      if (entry.itemIds.indexOf(id) === -1) entry.itemIds.push(id);
    });
    if (!entry.primaryId && entry.itemIds.length) entry.primaryId = entry.itemIds[0];
    _renderAssignList(_pickerSlot);
    mediaPickerClose();
  };

  window.mediaPickerClose = function() {
    var modal = document.getElementById('mlPickerModal');
    if (modal) modal.style.display = 'none';
    _pickerSlot = null;
    _pickerSelected = {};
  };

  window.mediaAssignSave = async function() {
    if (!_assignWorking) return _assignFlash('Nothing to save.', 'error');
    try {
      _assignFlash('Saving…', 'info');
      await window.FIDS_MEDIA.saveAssignments(_assignWorking);
      _assignFlash('Saved. Changes apply to all gate displays within a few minutes.', 'success');
    } catch (e) {
      _assignFlash('Save failed: ' + e.message, 'error');
    }
  };
})();



// ════════════════════════════════════════════════════════════════════════════
// MEDIA PICKER (v218.99.14) — Universal "Pick from Library" widget
//
// One reusable picker that any tab can call to choose an image/video from the
// Media Library. Replaces the scattered upload dropzones throughout the app.
//
// Usage:
//   FIDS_MEDIA_PICKER.open({
//     category: 'airport-logo',           // filter library to this category
//     type: 'image',                      // 'image' | 'video' | 'any'
//     title: 'Pick airport logo',
//     onPick: function(item) { ... },     // called with the chosen item
//     allowUpload: true                   // shows the inline upload form
//   });
//
// Items returned have shape: { id, type, category, url, label, source, ... }
// ════════════════════════════════════════════════════════════════════════════
window.FIDS_MEDIA_PICKER = (function() {
  var CAT_LABELS = {
    'ads':           'Ads & Slides',
    'airport-logo':  'Airport Logos',
    'airline-logo':  'Airline Logos',
    'background':    'Backgrounds'
  };

  var _state = { open: false, onPick: null, options: null };

  function _ensureModal() {
    var existing = document.getElementById('fmpModal');
    if (existing) return existing;
    var modal = document.createElement('div');
    modal.id = 'fmpModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:none;'
      + 'align-items:center;justify-content:center;'
      + 'background:rgba(5,8,14,0.6);backdrop-filter:blur(8px);';
    modal.innerHTML =
      '<div class="fmp-panel" style="'
      +   'background:var(--console-bg-2, #fff);'
      +   'border:1px solid var(--console-border-hi, #d1d5db);'
      +   'border-radius:14px;width:min(720px,92vw);max-height:84vh;'
      +   'display:flex;flex-direction:column;overflow:hidden;'
      +   'box-shadow:var(--console-shadow, 0 32px 80px rgba(0,0,0,0.4));'
      +   'color:var(--console-text, #0f172a);font-family:var(--font-body, Manrope, system-ui, sans-serif);">'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;'
      +        'padding:16px 20px;border-bottom:1px solid var(--console-border, #e5e7eb);">'
      +     '<div id="fmpTitle" style="font-family:var(--font-display, Geist);font-size:16px;font-weight:600;">Pick from Library</div>'
      +     '<button onclick="FIDS_MEDIA_PICKER.close()" style="background:transparent;border:1px solid var(--console-border-hi);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--console-text-3);cursor:pointer;">Cancel</button>'
      +   '</div>'
      +   '<div style="padding:12px 20px;border-bottom:1px solid var(--console-border, #e5e7eb);display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      +     '<input id="fmpSearch" type="text" placeholder="Search by label…" style="flex:1;min-width:160px;background:var(--console-surface);border:1px solid var(--console-border);padding:7px 10px;border-radius:8px;font-size:12px;color:var(--console-text);">'
      +     '<span id="fmpCount" style="font-family:var(--font-mono, monospace);font-size:11px;color:var(--console-text-3);"></span>'
      +   '</div>'
      +   '<div id="fmpGrid" style="flex:1;overflow-y:auto;padding:14px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;"></div>'
      +   '<div id="fmpUploadStrip" style="display:none;border-top:1px solid var(--console-border);padding:14px 20px;background:var(--console-surface-lo);">'
      +     '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">'
      +       '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:0.14em;color:var(--console-text-3);text-transform:uppercase;">Upload new</div>'
      +       '<div id="fmpUploadHint" style="font-size:10px;color:var(--console-text-muted);font-style:italic;"></div>'
      +     '</div>'
      +     '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      +       '<input id="fmpUploadFile" type="file" style="flex:1;min-width:160px;font-size:11px;color:var(--console-text-2);">'
      +       '<input id="fmpUploadLabel" type="text" placeholder="Label" style="flex:1;min-width:120px;background:var(--console-surface);border:1px solid var(--console-border);padding:7px 10px;border-radius:8px;font-size:12px;color:var(--console-text);">'
      +       '<button id="fmpUploadBtn" onclick="FIDS_MEDIA_PICKER._submitUpload()" style="background:var(--console-accent);color:var(--console-btn-text);border:none;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Upload</button>'
      +     '</div>'
      +     '<div id="fmpUploadFlash" style="font-size:11px;margin-top:6px;min-height:14px;color:var(--console-text-3);"></div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) close();
    });
    var sBox = modal.querySelector('#fmpSearch');
    if (sBox) sBox.addEventListener('input', _refreshGrid);
    return modal;
  }

  async function open(options) {
    options = options || {};
    _state.options = options;
    _state.onPick = options.onPick || null;
    var modal = _ensureModal();
    modal.style.display = 'flex';
    _state.open = true;

    // Title
    var titleEl = modal.querySelector('#fmpTitle');
    if (titleEl) {
      titleEl.textContent = options.title
        || ('Pick from ' + (CAT_LABELS[options.category] || 'Library'));
    }

    // Upload strip visibility
    var upStrip = modal.querySelector('#fmpUploadStrip');
    if (upStrip) upStrip.style.display = (options.allowUpload !== false) ? 'block' : 'none';

    // v218.99.15 — Upload-destination hint so users know the file goes to the
    // Media Library, not "just this tab"
    var hintEl = modal.querySelector('#fmpUploadHint');
    if (hintEl) {
      var catLabel = CAT_LABELS[options.category] || 'the Library';
      hintEl.textContent = '→ Goes to Media Library under "' + catLabel + '"';
    }

    // Load library and render
    await _refreshGrid();
  }

  async function _refreshGrid() {
    var modal = document.getElementById('fmpModal');
    if (!modal) return;
    var grid = modal.querySelector('#fmpGrid');
    var countEl = modal.querySelector('#fmpCount');
    var search = (modal.querySelector('#fmpSearch') || {}).value || '';
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--console-text-3);font-size:13px;">Loading…</div>';

    var lib = null;
    try {
      lib = await window.FIDS_MEDIA.loadLibrary(true);
    } catch (e) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--console-danger);font-size:13px;">Could not load library: ' + (e.message || e) + '</div>';
      return;
    }
    var items = (lib && Array.isArray(lib.items)) ? lib.items : [];
    var opts = _state.options || {};
    var filtered = items.filter(function(it) {
      if (opts.category && (it.category || 'ads') !== opts.category) return false;
      if (opts.type && opts.type !== 'any' && it.type !== opts.type) return false;
      if (search) {
        var s = search.toLowerCase();
        var label = (it.label || '').toLowerCase();
        if (label.indexOf(s) < 0) return false;
      }
      return true;
    });

    if (countEl) countEl.textContent = filtered.length + ' item' + (filtered.length === 1 ? '' : 's');

    if (!filtered.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--console-text-3);font-size:13px;">'
        + 'No items in this category yet.' + (opts.allowUpload !== false ? '<br><span style="font-size:11px;">Use the upload strip below to add one.</span>' : '')
        + '</div>';
      return;
    }

    grid.innerHTML = filtered.map(function(it) {
      var thumb;
      if (it.type === 'image' && it.url) {
        thumb = '<img src="' + it.url + '" style="width:100%;height:100px;object-fit:contain;background:var(--console-surface-lo);" alt="">';
      } else if (it.source === 'youtube') {
        thumb = '<div style="width:100%;height:100px;background:#000 url(\'https://img.youtube.com/vi/' + (it.ytId || '') + '/mqdefault.jpg\') center/cover;"></div>';
      } else if (it.url) {
        thumb = '<video src="' + it.url + '" style="width:100%;height:100px;object-fit:cover;background:#000;" muted></video>';
      } else {
        thumb = '<div style="width:100%;height:100px;background:var(--console-surface);display:flex;align-items:center;justify-content:center;color:var(--console-text-3);font-size:11px;">no preview</div>';
      }
      return '<button class="fmp-card" data-item-id="' + it.id + '" onclick="FIDS_MEDIA_PICKER._select(\'' + it.id + '\')" style="'
        + 'appearance:none;background:var(--console-card,#fff);border:1px solid var(--console-border);border-radius:8px;'
        + 'padding:0;cursor:pointer;overflow:hidden;text-align:left;transition:all .15s ease;display:flex;flex-direction:column;">'
        + thumb
        + '<div style="padding:8px 10px;font-size:11px;color:var(--console-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (it.label || '(unlabeled)') + '</div>'
        + '</button>';
    }).join('');

    // Hover effect
    grid.querySelectorAll('.fmp-card').forEach(function(card) {
      card.addEventListener('mouseenter', function() { card.style.borderColor = 'var(--console-accent)'; card.style.transform = 'translateY(-1px)'; });
      card.addEventListener('mouseleave', function() { card.style.borderColor = 'var(--console-border)'; card.style.transform = 'none'; });
    });
  }

  function _select(itemId) {
    var lib = window.FIDS_MEDIA && window.FIDS_MEDIA.getLibrary && window.FIDS_MEDIA.getLibrary();
    var items = (lib && Array.isArray(lib.items)) ? lib.items : [];
    var item = items.find(function(x) { return x.id === itemId; });
    if (!item) return;
    var cb = _state.onPick;
    close();
    if (typeof cb === 'function') {
      try { cb(item); } catch (e) { console.error('[FMP] onPick threw:', e); }
    }
  }

  function _flashUpload(msg, kind) {
    var fl = document.querySelector('#fmpUploadFlash');
    if (!fl) return;
    var colors = { error: 'var(--console-danger)', success: 'var(--console-success)', info: 'var(--console-text-3)' };
    fl.style.color = colors[kind] || colors.info;
    fl.textContent = msg || '';
  }

  async function _submitUpload() {
    var opts = _state.options || {};
    var fileInput = document.querySelector('#fmpUploadFile');
    var labelInput = document.querySelector('#fmpUploadLabel');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      return _flashUpload('Pick a file first.', 'error');
    }
    var file = fileInput.files[0];
    var label = (labelInput && labelInput.value || '').trim() || file.name.replace(/\.[^.]+$/, '');

    // Optional type guard
    if (opts.type === 'image' && !/^image\//.test(file.type)) {
      return _flashUpload('This picker only accepts images.', 'error');
    }
    if (opts.type === 'video' && !/^video\//.test(file.type)) {
      return _flashUpload('This picker only accepts videos.', 'error');
    }

    _flashUpload('Uploading…', 'info');
    try {
      var item = await window.FIDS_MEDIA.uploadFile(file, label, opts.category || 'ads');
      _flashUpload('✓ Uploaded — pick it from the grid above.', 'success');
      fileInput.value = '';
      if (labelInput) labelInput.value = '';
      await _refreshGrid();
      // Auto-scroll to the new item if present
      setTimeout(function() {
        var card = document.querySelector('.fmp-card[data-item-id="' + item.id + '"]');
        if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 100);
    } catch (e) {
      _flashUpload('Upload failed: ' + (e.message || e), 'error');
    }
  }

  function close() {
    var modal = document.getElementById('fmpModal');
    if (modal) modal.style.display = 'none';
    _state.open = false;
    _state.onPick = null;
  }

  // ESC to close
  document.addEventListener('keydown', function(e) {
    if (_state.open && e.key === 'Escape') close();
  });

  return { open: open, close: close, _select: _select, _submitUpload: _submitUpload };
})();

