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

    // v22757 — ONE PLACE PER JOB. The bar carried a 'Display' group and an
    // 'Options' group that duplicated controls the console panels already own
    // (screen type vs Display Type, quick theme vs Theme), so half the bar was a
    // second route to the same setting and the two could disagree. Both are
    // gone; their unique controls fold into Board. Customize — 72 controls in
    // one dropdown — splits into Look, Layout, Branding, Templates and Admin,
    // partitioned by the data-menu attribute menu.html stamps on each child.
    // Every control keeps its original id and handler; nothing is
    // re-implemented here, only re-parented.
    var gOps = group('Operations');
    move('testFlightBtn', gOps.panel);
    move('overrideBtn', gOps.panel);
    link(gOps.panel, 'Refresh live data', function () { if (typeof window.fetchLive === 'function') window.fetchLive(); });

    // 'from' pulls a whole console tab; 'menu' pulls the run of
    // #smTab_customize children stamped with that data-menu value.
    var SECTIONS = [
      { title: 'Board',     from: 'smTab_display', extra: ['screenTypeSel', 'subScreenSel', 'btnAirport', 'ctrlBgGroup'] },
      { title: 'Search',    from: 'smTab_search' },
      { title: 'Look',      menu: 'look' },
      { title: 'Layout',    menu: 'layout' },
      { title: 'Branding',  menu: 'branding' },
      { title: 'Templates', menu: 'templates' },
      { title: 'Airport',   from: 'smTab_airport', gateBtn: 'smTabAirport' },
      { title: 'Media',     from: 'smTab_media',   gateBtn: 'smTabMedia' },
      { title: 'Users',     from: 'smTab_users',   gateBtn: 'smTabUsers' },
      { title: 'Admin',     menu: 'admin' }
    ];

    if (window.innerWidth > 700) (function () {
      var made = {};

      // A control counts as present only if nothing between it and its panel is
      // inline-hidden. Role gating (editor-roles) and the admin tab gating in
      // menu.js both hide by inline display, so this sees exactly what a user of
      // this role would see — and it does so without opening the dropdown, which
      // a getBoundingClientRect test could not (a closed panel is display:none,
      // so every descendant would measure as absent).
      function liveIn(panel) {
        var els = panel.querySelectorAll('button,select,input,textarea,a');
        for (var i = 0; i < els.length; i++) {
          var n = els[i], ok = true;
          while (n && n !== panel) {
            if (n.style && n.style.display === 'none') { ok = false; break; }
            n = n.parentElement;
          }
          if (ok) return true;
        }
        return false;
      }

      function build() {
        var custom = document.getElementById('smTab_customize');
        SECTIONS.forEach(function (s) {
          if (made[s.title]) return;
          var g, content, i;
          if (s.from) {
            content = document.getElementById(s.from);
            if (!content) return;
            g = group(s.title);
            g.panel.classList.add('mbar-wide');
            g.panel.appendChild(content);
          } else {
            if (!custom) return;
            var run = custom.querySelectorAll(':scope > [data-menu="' + s.menu + '"]');
            if (!run.length) return;
            g = group(s.title);
            g.panel.classList.add('mbar-wide');
            for (i = 0; i < run.length; i++) g.panel.appendChild(run[i]);
          }
          (s.extra || []).forEach(function (id) { move(id, g.panel); });
          ctrl.insertBefore(g.root, gOps.root);
          made[s.title] = g;

          // The console modules LOAD their data on tab ACTIVATION (smSwitchTab),
          // which the bar never fired — so Media opened to an empty shell (Nick:
          // 'does not work for media, it stops there'). Fire it on open.
          (function (tabKey, grp) {
            grp.root.querySelector('.mbar-title').addEventListener('click', function () {
              if (grp.root.classList.contains('open') && typeof window.smSwitchTab === 'function') {
                try { window.smSwitchTab(tabKey); } catch (e) {}
              }
            });
          })(s.from ? s.from.replace('smTab_', '') : 'customize', g);
        });
        // neuter the retired console opener so nothing can pop the empty shell
        if (made['Look'] && typeof window.openOverlayMenu === 'function' && !window.openOverlayMenu._mbarNoop) {
          var noop = function () {};
          noop._mbarNoop = true;
          window.openOverlayMenu = noop;
        }
      }

      // A section with nothing this role may see does not render AT ALL. Nick:
      // 'if it's in the menu and it doesn't work then it needs out and if it
      // needs in then it needs to work'. Opening Airport or Media as an empty
      // box was the single biggest thing wrong with the old bar — they were
      // present for everyone but their contents are admin-gated. Airport, Media
      // and Users stay keyed to their console tab button (it tracks a real login
      // token, which is stronger than reading the DOM); every other section is
      // judged on whether anything inside it is actually there.
      function syncVisibility() {
        SECTIONS.forEach(function (s) {
          var g = made[s.title];
          if (!g) return;
          var vis;
          if (s.gateBtn) {
            var btn = document.getElementById(s.gateBtn);
            vis = !!(btn && getComputedStyle(btn).display !== 'none');
          } else {
            vis = liveIn(g.panel);
          }
          g.root.style.display = vis ? '' : 'none';
        });
      }

      var tries = 0;
      var poll = setInterval(function () {
        // Re-run the role gate first: it decides what liveIn() will find, and
        // its own one-shot poll may have fired before these panels existed.
        try { if (window.EditorRoles && window.EditorRoles.apply) window.EditorRoles.apply(); } catch (e) {}
        build();
        syncVisibility();
        if (++tries > 40 && made['Look']) clearInterval(poll);
      }, 500);
      setInterval(syncVisibility, 3000);
    })();

    // Operations anchors the right end of the titles; sections insert before it.
    ctrl.insertBefore(gOps.root, ctrl.firstChild);

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
