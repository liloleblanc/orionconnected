/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   OC MENU SHELL (rebuild, Aug 2026) — replaces js/menubar.js.

   The old bar re-parented the console's sections into naked dropdowns:
   outside the themed container every var(--console-*) froze at :root
   light values, outside the gated container the sign-in gate silently
   stopped matching, and section visibility was read back off OTHER
   elements' computed display on a 3-second poll. Ten signed-out leak
   paths and the white-on-white menu all traced to that one move.

   This shell owns what the old bar borrowed:
   - SURFACE: panels carry the console tokens themselves — dark set here,
     light set under body.fids-light-board — so hosted content follows the
     panel it actually sits on (css/oc-menu.css).
   - ACCESS: one role resolver (anon | session | admin) consulted every
     time the bar is revealed or a group opens. No element-visibility
     reads, no polls. Write access stays separately gated in the look
     handlers (_cuLookDenied, v23179) — a visible control still changes
     nothing without a session.
   - LIFECYCLE: waits for the console fragment's 'fids:menu-ready' event
     (menu.js dispatches it after insertion) instead of five competing
     pollers.

   Contracts kept on purpose (the scout inventory, 30+ items):
   - The .ctrl node stays the root: fids-core dereferences it unguarded,
     paints themes onto '.ctrl', watches it, and stream mode kills it.
   - Hosted control ids keep their inline style.display untouched —
     fids-core context-gates #subScreenSel/#testFlightBtn/#overrideBtn/
     #ctrlBgGroup through it.
   - window.toggleToolbar stays (gids-mobile-nav Back button calls it).
   - _syncMenu() runs before any panel shows (stale-state rule).
   - smSwitchTab(tab) fires on section open (modules lazy-load on it).
   - ESC closes an open panel and stops there (fids-core's chain would
     otherwise navigate an idle kiosk to the picker).
   - Desktop only (>700px); mobile keeps the overlay console.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  var HIDE_AFTER_MS = 8000;

  // ── role resolver — the one place access is decided ──────────────────
  function tokenPayload() {
    try {
      var t = (window.Auth && Auth.token)
        || localStorage.getItem('fids_token') || sessionStorage.getItem('fids_token');
      if (!t) return null;
      return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) { return null; }
  }
  function role() {
    var signedIn = false;
    try {
      signedIn = (typeof window._cuLookAllowed === 'function') ? window._cuLookAllowed()
        : !!((window.Auth && Auth.token) || localStorage.getItem('fids_token') || sessionStorage.getItem('fids_token'));
    } catch (e) {}
    if (!signedIn) return 'anon';
    try { if (window.Auth && typeof Auth.isAdmin === 'function' && Auth.isAdmin()) return 'admin'; } catch (e) {}
    try {
      var u = JSON.parse(sessionStorage.getItem('fids_user') || 'null');
      if (u && u.role === 'admin') return 'admin';
    } catch (e) {}
    var p = tokenPayload();                    // JWT fallback — the one check
    if (p && p.role === 'admin') return 'admin'; // that survives a reload
    return 'session';
  }
  var RANK = { anon: 0, session: 1, admin: 2 };
  function allowed(minRole) { return RANK[role()] >= RANK[minRole]; }

  function init() {
    var ctrl = document.querySelector('.ctrl');
    if (!ctrl || ctrl._ocmDone) return;
    if (window.innerWidth > 0 && window.innerWidth <= 700) return; // mobile keeps the overlay console
    ctrl._ocmDone = true;

    var groups = [];   // {root, panel, spec}

    // ── group factory ────────────────────────────────────────────────
    function closeAll() {
      groups.forEach(function (g) { g.root.classList.remove('open'); });
    }
    function applyRoles() {
      groups.forEach(function (g) {
        var ok = allowed(g.spec.auth);
        g.root.style.display = ok ? '' : 'none';
        if (!ok) g.root.classList.remove('open');
      });
      try { if (typeof window._cuGateByAccess === 'function') window._cuGateByAccess(); } catch (e) {}
    }
    function group(spec) {
      var root = document.createElement('div'); root.className = 'ocm-group';
      var btn = document.createElement('button'); btn.className = 'ocm-title';
      btn.innerHTML = spec.title + '<span class="ocm-car">▾</span>';
      var panel = document.createElement('div');
      panel.className = 'ocm-panel' + (spec.wide ? ' ocm-wide' : '');
      // clicks inside a dropdown must not bubble to the document closer
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var was = root.classList.contains('open');
        applyRoles();                       // a login/logout since last look takes effect NOW
        closeAll();
        if (was || !allowed(spec.auth)) { armHide(); return; }
        // repaint hosted controls from live state before showing them —
        // the stale-state rule (a GIDS screen once reported FIDS)
        try { if (typeof window._syncMenu === 'function') window._syncMenu(); } catch (err) {}
        if (spec.onOpen) { try { spec.onOpen(); } catch (err) {} }
        root.classList.add('open');
        armHide();
      });
      root.appendChild(btn); root.appendChild(panel);
      var g = { root: root, panel: panel, spec: spec };
      groups.push(g);
      return g;
    }
    function sec(panel, label) {
      var s = document.createElement('div'); s.className = 'ocm-sec'; s.textContent = label;
      panel.appendChild(s); return s;
    }
    function move(id, panel, label) {
      var el = document.getElementById(id);
      if (!el) return null;
      if (label) sec(panel, label);
      panel.appendChild(el);   // NB: never touch el.style.display — fids-core owns it
      return el;
    }
    function link(panel, label, fn) {
      var b = document.createElement('button'); b.className = 'ocm-link'; b.textContent = label;
      b.addEventListener('click', function () { closeAll(); try { fn(); } catch (e) {} });
      panel.appendChild(b); return b;
    }
    function openGroup(title) {
      for (var i = 0; i < groups.length; i++) {
        var t = groups[i].root.querySelector('.ocm-title');
        if (t && t.textContent.replace('▾', '').trim() === title) { t.click(); return true; }
      }
      return false;
    }

    // ── the registry — every group, its access level, its open hook ──
    var gDisplay = group({ title: 'Display', auth: 'anon' });
    move('screenTypeSel', gDisplay.panel, 'Screen type');
    move('subScreenSel', gDisplay.panel);
    var apBtn = document.getElementById('btnAirport');
    if (apBtn) gDisplay.panel.appendChild(apBtn);
    (function () {   // background + font restyle the board — session-gated
      var bg = document.getElementById('ctrlBgGroup');
      if (bg) {
        var lb = sec(gDisplay.panel, 'Background'); lb.setAttribute('data-auth', '1');
        bg.setAttribute('data-auth', '1');
        gDisplay.panel.appendChild(bg);
      }
      var fs = sec(gDisplay.panel, 'Font'); fs.setAttribute('data-auth', '1');
      var fsel = document.createElement('select');
      fsel.className = 'ocm-select'; fsel.setAttribute('data-auth', '1');
      gDisplay.panel.appendChild(fsel);
      function syncFonts() {
        var src = document.getElementById('cuFontSelect');
        if (!src || !src.options.length) return;
        if (fsel.innerHTML !== src.innerHTML) fsel.innerHTML = src.innerHTML;
        fsel.value = src.value;
      }
      fsel.addEventListener('change', function () {
        var c = document.getElementById('cuFontSelect');
        if (c) { c.value = fsel.value; if (typeof window.cuFontChanged === 'function') window.cuFontChanged(); }
      });
      gDisplay.root.querySelector('.ocm-title').addEventListener('click', syncFonts);
      document.addEventListener('fids:menu-ready', syncFonts);
    })();

    var gOps = group({ title: 'Operations', auth: 'session' });
    move('testFlightBtn', gOps.panel);
    move('overrideBtn', gOps.panel);
    link(gOps.panel, 'Refresh live data', function () { if (typeof window.fetchLive === 'function') window.fetchLive(); });

    // wide sections — the console's tabs, hosted in the shell's own
    // themed, gated panels (built once the fragment announces itself)
    var SECTIONS = [
      { title: 'Board',     tab: 'smTab_display',   auth: 'anon' },
      { title: 'Search',    tab: 'smTab_search',    auth: 'anon' },
      { title: 'Customize', tab: 'smTab_customize', auth: 'session' },
      { title: 'Airport',   tab: 'smTab_airport',   auth: 'admin' },
      { title: 'Media',     tab: 'smTab_media',     auth: 'admin' },
      { title: 'Users',     tab: 'smTab_users',     auth: 'admin' }
    ];
    var gOptions = null;  // built below; wide sections insert before it
    function buildSections() {
      SECTIONS.forEach(function (s) {
        if (s._done) return;
        var content = document.getElementById(s.tab);
        if (!content) return;
        s._done = true;
        var g = group({
          title: s.title, auth: s.auth, wide: true,
          onOpen: function () {
            if (typeof window.smSwitchTab === 'function') {
              try { window.smSwitchTab(s.tab.replace('smTab_', '')); } catch (e) {}
            }
          }
        });
        g.panel.appendChild(content);
        ctrl.insertBefore(g.root, gOptions ? gOptions.root : null);
      });
      // the retired console opener must never pop its empty shell on desktop
      if (SECTIONS[2]._done && typeof window.openOverlayMenu === 'function' && !window.openOverlayMenu._ocmNoop) {
        var noop = function () {}; noop._ocmNoop = true;
        window.openOverlayMenu = noop;
      }
      applyRoles();
    }

    gOptions = group({ title: 'Options', auth: 'session' });
    (function () {
      sec(gOptions.panel, 'Quick theme');
      var tsel = document.createElement('select'); tsel.className = 'ocm-select';
      [['', 'Airport default (Teal)'], ['tus-teal', 'Teal'], ['tus-teal-deep', 'Teal Deep'], ['mist', 'Mist (light)']]
        .forEach(function (o) {
          var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; tsel.appendChild(op);
        });
      function syncFromSaved() {
        try {
          var ap = (document.getElementById('apSel') || {}).value || '';
          var raw = ap && localStorage.getItem('fids_customize_' + ap);
          var t = raw ? (JSON.parse(raw).theme || '') : '';
          if (t !== 'custom') tsel.value = t;   // custom lives in Customize, not here
        } catch (e) {}
      }
      syncFromSaved();
      tsel.addEventListener('mousedown', syncFromSaved);
      tsel.addEventListener('change', function () {
        var c = document.getElementById('cuThemeSelect');
        if (c) { c.value = tsel.value; if (typeof window.cuThemeChanged === 'function') window.cuThemeChanged(); }
      });
      gOptions.panel.appendChild(tsel);
      // exactly ONE place edits colours — this routes to it
      link(gOptions.panel, 'Custom colours… (opens Customize)', function () { openGroup('Customize'); });
    })();

    // ── mount ────────────────────────────────────────────────────────
    ctrl.insertBefore(gDisplay.root, ctrl.firstChild);
    ctrl.insertBefore(gOps.root, gDisplay.root.nextSibling);
    ctrl.appendChild(gOptions.root);
    var stw = ctrl.querySelector('.screen-type-wrap');
    if (stw) stw.style.display = 'none';   // the old bar's emptied layout shell

    if (window._fidsMenuReady) buildSections();
    document.addEventListener('fids:menu-ready', buildSections);
    // safety net for a stale cached menu.js that never dispatches the event
    var lateTries = 0;
    var late = setInterval(function () {
      buildSections();
      if (SECTIONS[0]._done || ++lateTries > 30) clearInterval(late);
    }, 1000);

    document.addEventListener('click', function () { closeAll(); });

    // ── ESC closes an open panel and STOPS — never falls through to the
    // picker navigation in fids-core's own ESC chain ──────────────────
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = groups.some(function (g) { return g.root.classList.contains('open'); });
      if (open) { closeAll(); e.stopPropagation(); e.preventDefault(); }
    }, true);

    // ── auto-hide (approved UX: slim visitor bar, top hot-zone) ──────
    var hz = document.createElement('div'); hz.id = 'ocmHotzone';
    document.body.appendChild(hz);
    var hideTimer = null;
    function reveal() {
      document.body.classList.remove('ocm-hidden');
      applyRoles();
    }
    function armHide() {
      reveal();
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        var apOpen = (function () { var p = document.getElementById('apPanel'); return p && !p.classList.contains('hidden'); })();
        var anyOpen = groups.some(function (g) { return g.root.classList.contains('open'); });
        if (anyOpen || apOpen) { armHide(); return; }
        document.body.classList.add('ocm-hidden');
      }, HIDE_AFTER_MS);
    }
    hz.addEventListener('mouseenter', armHide);
    hz.addEventListener('touchstart', armHide, { passive: true });
    ctrl.addEventListener('mouseenter', function () {
      reveal();
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    });
    ctrl.addEventListener('mouseleave', armHide);
    ctrl.addEventListener('click', reveal);

    // kept global: the gids-mobile-nav Back button calls this
    window.toggleToolbar = function () {
      if (document.body.classList.contains('ocm-hidden')) armHide();
      else { closeAll(); document.body.classList.add('ocm-hidden'); }
    };

    applyRoles();
    armHide();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
