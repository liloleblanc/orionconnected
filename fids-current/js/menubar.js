/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MENU BAR (Nick, Jul 2026) — the top control bar becomes a titled menu
   bar (Menu / Display / Operations / Options + search) that AUTO-HIDES:
   slides away after 8s idle so it can never block the banner; a thin
   hot-zone at the top edge (or any touch at the top) brings it back.
   Existing controls are re-parented into the dropdowns, so every control
   keeps its original id and handler — no behavior is duplicated here.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  var HIDE_AFTER_MS = 8000;

  function init() {
    var ctrl = document.querySelector('.ctrl');
    if (!ctrl || ctrl._mbarDone) return;
    ctrl._mbarDone = true;

    // ── styles ──────────────────────────────────────────────────────────
    var st = document.createElement('style');
    st.textContent = ''
      // fids.css carries a legacy kill rule `.ctrl,.ap-panel{display:none !important}`
      // (pre-menu-bar kiosk patch) — out-specify it so the bar and the airport
      // panel actually render; the auto-hide below owns visibility from here.
      + 'body .ctrl.show{display:flex !important;}'
      + 'body .ap-panel:not(.hidden){display:block !important;}'
      // the legacy ⚙ badge overlaps the Menu title while the bar is out —
      // it only needs to exist as the opener when the bar is hidden.
      + 'body:not(.mbar-hidden) #menuBadge{opacity:0 !important;pointer-events:none !important;}'
      + '.ctrl{transition:transform .3s ease, opacity .3s ease;}'
      + 'body.mbar-hidden .ctrl{transform:translateY(-115%);opacity:0;pointer-events:none;}'
      + '#mbarHotzone{position:fixed;top:0;left:0;right:0;height:14px;z-index:99998;background:transparent;}'
      + '.mbar-group{position:relative;display:inline-flex;}'
      + '.mbar-title{background:transparent;border:none;color:#e6e9ee;font-weight:700;font-size:13px;'
      +   'letter-spacing:.6px;padding:7px 13px;cursor:pointer;border-radius:7px;font-family:inherit;white-space:nowrap;}'
      + '.mbar-title:hover{background:rgba(255,255,255,.1);}'
      + '.mbar-group.open .mbar-title{background:rgba(255,255,255,.14);color:#fff;}'
      + '.mbar-title .car{opacity:.55;font-size:10px;margin-left:5px;}'
      + '.mbar-panel{display:none;position:absolute;top:calc(100% + 6px);left:0;background:#1b2230;'
      +   'border:1px solid #313b4e;border-radius:11px;padding:12px;z-index:99999;min-width:250px;'
      +   'box-shadow:0 12px 30px rgba(0,0,0,.5);}'
      + '.mbar-group.open .mbar-panel{display:flex;flex-direction:column;gap:9px;}'
      + '.mbar-panel select{width:100% !important;min-height:32px;}'
      + '.mbar-panel .btn{width:100%;text-align:left;}'
      + '.mbar-panel .mbar-sec{font-size:10px;letter-spacing:1.2px;color:#8b96a5;font-weight:800;'
      +   'text-transform:uppercase;margin:3px 0 -3px;}'
      + '.mbar-link{background:transparent;border:none;color:#cdd6e4;text-align:left;font-size:13px;'
      +   'font-weight:600;padding:7px 9px;border-radius:7px;cursor:pointer;font-family:inherit;}'
      + '.mbar-link:hover{background:rgba(255,255,255,.09);color:#fff;}'
      + '.mbar-info-wrap{display:flex;align-items:center;gap:10px;margin-left:auto;}';
    document.head.appendChild(st);

    // ── helpers ─────────────────────────────────────────────────────────
    function group(title) {
      var g = document.createElement('div'); g.className = 'mbar-group';
      var b = document.createElement('button'); b.className = 'mbar-title';
      b.innerHTML = title + '<span class="car">▾</span>';
      var p = document.createElement('div'); p.className = 'mbar-panel';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var was = g.classList.contains('open');
        closeAll();
        if (!was) g.classList.add('open');
        armHide();
      });
      g.appendChild(b); g.appendChild(p);
      return { root: g, panel: p };
    }
    function closeAll() {
      document.querySelectorAll('.mbar-group.open').forEach(function (x) { x.classList.remove('open'); });
    }
    function move(id, panel, label) {
      var el = document.getElementById(id);
      if (!el) return null;
      if (label) { var s = document.createElement('div'); s.className = 'mbar-sec'; s.textContent = label; panel.appendChild(s); }
      panel.appendChild(el);
      el.style.display = '';
      return el;
    }
    function link(panel, label, fn) {
      var b = document.createElement('button'); b.className = 'mbar-link'; b.textContent = label;
      b.addEventListener('click', function () { closeAll(); try { fn(); } catch (e) {} });
      panel.appendChild(b);
    }
    function sidebarTab(tab) {
      if (typeof window.openOverlayMenu === 'function') window.openOverlayMenu();
      if (typeof window.smSwitchTab === 'function') setTimeout(function () { window.smSwitchTab(tab); }, 80);
    }

    // ── build the bar ───────────────────────────────────────────────────
    var menuBtn = ctrl.querySelector('.btn-menu');
    if (menuBtn) {
      menuBtn.textContent = '☰ Menu';
      menuBtn.onclick = function () { closeAll(); if (typeof window.openOverlayMenu === 'function') window.openOverlayMenu(); };
    }

    var stw = ctrl.querySelector('.screen-type-wrap');

    var gDisplay = group('Display');
    move('screenTypeSel', gDisplay.panel, 'Screen type');
    move('subScreenSel', gDisplay.panel);
    var apBtn = document.getElementById('btnAirport');
    if (apBtn) { gDisplay.panel.appendChild(apBtn); }
    move('ctrlBgGroup', gDisplay.panel, 'Background');
    move('ctrlFontGroup', gDisplay.panel, 'Font');

    var gOps = group('Operations');
    move('testFlightBtn', gOps.panel);
    move('overrideBtn', gOps.panel);
    link(gOps.panel, 'Refresh live data', function () { if (typeof window.fetchLive === 'function') window.fetchLive(); });

    var gOptions = group('Options');
    link(gOptions.panel, 'Board settings…', function () { sidebarTab('display'); });
    link(gOptions.panel, 'Customize (theme, colors)…', function () { sidebarTab('customize'); });
    link(gOptions.panel, 'Airport…', function () { sidebarTab('airport'); });
    link(gOptions.panel, 'Media…', function () { sidebarTab('media'); });
    link(gOptions.panel, 'Search flights…', function () { sidebarTab('search'); });

    // insert groups right after the Menu button
    var anchor = menuBtn ? menuBtn.nextSibling : ctrl.firstChild;
    ctrl.insertBefore(gDisplay.root, anchor);
    ctrl.insertBefore(gOps.root, gDisplay.root.nextSibling);
    ctrl.insertBefore(gOptions.root, gOps.root.nextSibling);

    // search stays inline in the bar (right of the titles); status info stays right.
    if (stw) stw.style.display = 'none'; // now-empty original wrapper

    document.addEventListener('click', function () { closeAll(); });

    // ── auto-hide ───────────────────────────────────────────────────────
    var hz = document.createElement('div'); hz.id = 'mbarHotzone';
    document.body.appendChild(hz);

    var hideTimer = null;
    function armHide() {
      document.body.classList.remove('mbar-hidden');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        // never hide while a dropdown, the airport panel, or the sidebar is open
        var apOpen = (function () { var p = document.getElementById('apPanel'); return p && !p.classList.contains('hidden'); })();
        var smOpen = (function () { var m = document.getElementById('overlayMenu'); return m && m.offsetWidth > 0 && getComputedStyle(m).display !== 'none' && m.classList.contains('open'); })();
        if (document.querySelector('.mbar-group.open') || apOpen || smOpen) { armHide(); return; }
        document.body.classList.add('mbar-hidden');
      }, HIDE_AFTER_MS);
    }
    hz.addEventListener('mouseenter', armHide);
    hz.addEventListener('touchstart', armHide, { passive: true });
    ctrl.addEventListener('mousemove', armHide);
    ctrl.addEventListener('click', armHide);
    armHide();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
