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
      // the legacy ⚙ openers are gone for good (Nick) — the top hot-zone is
      // the one way to reveal the bar.
      + '#menuBadge,#menuTrigger{display:none !important;}'
      // light-board adaptation — on light themes the bar itself goes light
      + 'body.fids-light-board .ctrl{background:rgba(233,238,243,0.97) !important;box-shadow:0 2px 12px rgba(13,36,64,0.18) !important;}'
      + 'body.fids-light-board .mbar-title{color:#16283C;}'
      + 'body.fids-light-board .mbar-title:hover{background:rgba(13,36,64,.08);}'
      + 'body.fids-light-board .mbar-group.open .mbar-title{background:rgba(13,36,64,.12);color:#0d2440;}'
      + 'body.fids-light-board .mbar-panel{background:#ffffff;border-color:#C7D2DD;box-shadow:0 12px 30px rgba(13,36,64,.25);}'
      + 'body.fids-light-board .mbar-link{color:#31435a;}'
      + 'body.fids-light-board .mbar-link:hover{background:rgba(13,36,64,.07);color:#0d2440;}'
      + 'body.fids-light-board .mbar-sec{color:#6b7c92;}'
      + '.mbar-panel select.mbar-theme{min-height:32px;border-radius:7px;}'
      // Full sections re-parented from the retired console — wide scrollable panels
      + '.mbar-panel.mbar-wide{width:470px;max-width:min(94vw,540px);max-height:74vh;overflow-y:auto;overscroll-behavior:contain;}'
      + '.mbar-panel.mbar-wide .sm-tab-content{display:block !important;position:static !important;max-height:none !important;overflow:visible !important;padding:0 !important;}'
      + '@media (min-width:701px){#overlayMenu{display:none !important;}}'
      // Slim bar (Nick: 'the gray menu bar is way too tall') — the board
      // should own the screen; the admin bar is a visitor.
      + '.ctrl{transition:transform .3s ease, opacity .3s ease;padding:3px 14px !important;'
      +   'min-height:34px !important;gap:3px 10px !important;border-bottom-width:1px !important;}'
      + '.ctrl .search-wrap{padding:2px 8px !important;}'
      + 'body.mbar-hidden .ctrl{transform:translateY(-115%);opacity:0;pointer-events:none;}'
      + '#mbarHotzone{position:fixed;top:0;left:0;right:0;height:14px;z-index:99998;background:transparent;}'
      + '.mbar-group{position:relative;display:inline-flex;}'
      + '.mbar-title{background:transparent;border:none;color:#e6e9ee;font-weight:700;font-size:13px;'
      +   'letter-spacing:.6px;padding:4px 11px;cursor:pointer;border-radius:7px;font-family:inherit;white-space:nowrap;}'
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
      // clicks INSIDE a dropdown must not bubble to the document closer —
      // selects/buttons were vanishing mid-click ("kicks me out").
      p.addEventListener('click', function (e) { e.stopPropagation(); });
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
      // NB: never touch el.style.display — several controls (override,
      // background group) are admin/context-gated by their inline display.
      return el;
    }
    function link(panel, label, fn) {
      var b = document.createElement('button'); b.className = 'mbar-link'; b.textContent = label;
      b.addEventListener('click', function () { closeAll(); try { fn(); } catch (e) {} });
      panel.appendChild(b);
    }

    // ── build the bar ───────────────────────────────────────────────────
    var stw = ctrl.querySelector('.screen-type-wrap');

    var gDisplay = group('Display');
    move('screenTypeSel', gDisplay.panel, 'Screen type');
    move('subScreenSel', gDisplay.panel);
    var apBtn = document.getElementById('btnAirport');
    if (apBtn) { gDisplay.panel.appendChild(apBtn); }
    move('ctrlBgGroup', gDisplay.panel, 'Background');
    // Font — mirror the console's canonical list (brand fonts + AC Nord +
    // custom uploads) instead of the stale legacy #fontSel list; changes
    // proxy through cuFontChanged() so persistence stays canonical.
    (function () {
      var sec = document.createElement('div'); sec.className = 'mbar-sec'; sec.textContent = 'Font';
      gDisplay.panel.appendChild(sec);
      var fsel = document.createElement('select'); fsel.className = 'mbar-theme';
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
      gDisplay.root.querySelector('.mbar-title').addEventListener('click', syncFonts);
      setTimeout(syncFonts, 1800); // the console fragment loads async
    })();

    var gOps = group('Operations');
    move('testFlightBtn', gOps.panel);
    move('overrideBtn', gOps.panel);
    link(gOps.panel, 'Refresh live data', function () { if (typeof window.fetchLive === 'function') window.fetchLive(); });

    var gOptions = group('Options');
    // Theme lives RIGHT HERE — one click, no console detour (Nick).
    // 'Custom' is NOT in this quick list (Nick: picking it here just turned
    // the board black — the colour editor lives in the Customize dropdown,
    // which was closed). Custom routes to Customize via the link below, so
    // exactly ONE place edits colours.
    (function () {
      var sec = document.createElement('div'); sec.className = 'mbar-sec'; sec.textContent = 'Quick theme';
      gOptions.panel.appendChild(sec);
      var tsel = document.createElement('select'); tsel.className = 'mbar-theme';
      [['', 'Airport default (Teal)'], ['tus-teal', 'Teal'], ['tus-teal-deep', 'Teal Deep'], ['mist', 'Mist (light)']].forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; tsel.appendChild(op);
      });
      function _syncFromSaved() {
        try {
          var ap = (document.getElementById('apSel') || {}).value || '';
          var raw = ap && localStorage.getItem('fids_customize_' + ap);
          var t = raw ? (JSON.parse(raw).theme || '') : '';
          // a saved custom theme isn't in the quick list — leave selection alone
          if (t !== 'custom') tsel.value = t;
        } catch (e) {}
      }
      _syncFromSaved();
      // stay in sync when the theme was changed from the Customize section
      tsel.addEventListener('mousedown', _syncFromSaved);
      tsel.addEventListener('change', function () {
        // proxy through the console's own handler so persistence/apply stay canonical
        var c = document.getElementById('cuThemeSelect');
        if (c) { c.value = tsel.value; if (typeof window.cuThemeChanged === 'function') window.cuThemeChanged(); }
      });
      gOptions.panel.appendChild(tsel);
      link(gOptions.panel, 'Custom colours… (opens Customize)', function () {
        var titles = document.querySelectorAll('.mbar-title');
        for (var i = 0; i < titles.length; i++) {
          if (titles[i].textContent.replace('▾', '').trim() === 'Customize') { titles[i].click(); return; }
        }
        // mobile / section not built — fall back to the overlay console
        if (typeof window.openOverlayMenu === 'function') window.openOverlayMenu();
      });
    })();
    // ── FULL MENUS (Nick): the console's sections live IN the bar now — the
    // console overlay itself is retired on desktop. The fragment loads async,
    // so poll for it, then re-parent each tab's content into its own wide
    // dropdown. Admin-gated sections appear/disappear with their console
    // tab-button visibility (checked on every open + a slow poll).
    if (window.innerWidth > 700) (function () {
      var SECTIONS = [
        { title: 'Board',     tab: 'smTab_display' },
        { title: 'Search',    tab: 'smTab_search' },
        { title: 'Customize', tab: 'smTab_customize' },
        { title: 'Airport',   tab: 'smTab_airport', gateBtn: 'smTabAirport' },
        { title: 'Media',     tab: 'smTab_media',   gateBtn: 'smTabMedia' },
        { title: 'Users',     tab: 'smTab_users',   gateBtn: 'smTabUsers' }
      ];
      var made = {};
      function buildSections() {
        SECTIONS.forEach(function (s) {
          if (made[s.tab]) return;
          var content = document.getElementById(s.tab);
          if (!content) return;
          var g = group(s.title);
          g.panel.classList.add('mbar-wide');
          g.panel.appendChild(content);
          ctrl.insertBefore(g.root, gOptions.root);
          made[s.tab] = g;
          if (s.gateBtn) g.root.style.display = 'none'; // until the gate says visible
          // The console modules LOAD their data on tab ACTIVATION
          // (smSwitchTab) — which the bar never fired, so Media opened to
          // an empty shell (Nick: 'does not work for media, it stops
          // there'). Fire the activation whenever the dropdown opens.
          (function (tabKey, groupEl) {
            groupEl.root.querySelector('.mbar-title').addEventListener('click', function () {
              if (groupEl.root.classList.contains('open') && typeof window.smSwitchTab === 'function') {
                try { window.smSwitchTab(tabKey); } catch (e) {}
              }
            });
          })(s.tab.replace('smTab_', ''), g);
        });
        // neuter the retired console opener so nothing can pop the empty shell
        if (made['smTab_customize'] && typeof window.openOverlayMenu === 'function' && !window.openOverlayMenu._mbarNoop) {
          var noop = function () {};
          noop._mbarNoop = true;
          window.openOverlayMenu = noop;
        }
      }
      function syncAdminVisibility() {
        SECTIONS.forEach(function (s) {
          if (!s.gateBtn || !made[s.tab]) return;
          var btn = document.getElementById(s.gateBtn);
          var vis = btn && getComputedStyle(btn).display !== 'none';
          made[s.tab].root.style.display = vis ? '' : 'none';
        });
      }
      var tries = 0;
      var poll = setInterval(function () {
        buildSections();
        syncAdminVisibility();
        if (++tries > 40 && made['smTab_customize']) clearInterval(poll);
      }, 500);
      setInterval(syncAdminVisibility, 3000);
    })();

    // insert groups right after the Menu button
    ctrl.insertBefore(gDisplay.root, ctrl.firstChild);
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
    // While the pointer is anywhere over the bar, it NEVER hides — the timer
    // only runs once the mouse has left. No more disappearing mid-use.
    ctrl.addEventListener('mouseenter', function () {
      document.body.classList.remove('mbar-hidden');
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    });
    ctrl.addEventListener('mouseleave', armHide);
    ctrl.addEventListener('click', function () { document.body.classList.remove('mbar-hidden'); });
    armHide();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
