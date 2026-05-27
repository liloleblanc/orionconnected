/* ═══════════════════════════════════════════════════════════════════════
   gids-mobile-nav.js
   Mobile-only: (1) applies the console day/night theme to the gate root,
   (2) injects the bottom Back/Search sheet. No-ops on desktop (>640px).
   Safe, additive — does not alter the gate renderer.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  function isMobile() { return window.matchMedia('(max-width: 640px)').matches; }

  /* Same logic as the FIDS console: manual override wins, else time-of-day. */
  function decideTheme() {
    try {
      var t = localStorage.getItem('fids_console_theme');
      if (t === 'light' || t === 'dark') return t;
    } catch (e) {}
    var h = new Date().getHours();
    return (h >= 6 && h < 19) ? 'light' : 'dark';
  }

  function applyTheme() {
    var wrap = document.querySelector('.g8-wrap');
    if (wrap) wrap.setAttribute('data-theme', decideTheme());
  }

  function injectNav() {
    if (!isMobile()) return;
    if (document.getElementById('gidsMobileNav')) return;     // already there
    var wrap = document.querySelector('.g8-wrap');
    if (!wrap) return;

    var nav = document.createElement('div');
    nav.id = 'gidsMobileNav';
    nav.innerHTML =
      '<div class="gmn-options">' +
        '<button class="gmn-back" type="button">' +
          '<span style="font-size:24px;line-height:1;margin-top:-2px">\u2039</span> Back</button>' +
        '<div class="gmn-search">' +
          '<input type="text" inputmode="text" placeholder="Go to gate # or flight #">' +
          '<button class="gmn-go" type="button">Go</button>' +
        '</div>' +
      '</div>' +
      '<button class="gmn-tab" type="button">' +
        '<span class="gmn-grip"></span><span>MENU</span></button>';
    wrap.appendChild(nav);

    // toggle open/close
    nav.querySelector('.gmn-tab').addEventListener('click', function () {
      nav.classList.toggle('open');
    });

    // Back -> picker (matches the existing nav convention)
    nav.querySelector('.gmn-back').addEventListener('click', function () {
      // Prefer the existing toolbar/menu if present; else go to picker.
      if (typeof toggleToolbar === 'function') { try { toggleToolbar(); return; } catch (e) {} }
      window.location.href = 'picker.html';
    });

    // Search -> go to a gate / flight. Hook into existing lookup if available,
    // else fall back to picker with a query param the picker can read.
    function doSearch() {
      var q = (nav.querySelector('.gmn-search input').value || '').trim();
      if (!q) return;
      if (typeof window.gidsGoToQuery === 'function') { window.gidsGoToQuery(q); return; }
      window.location.href = 'picker.html?q=' + encodeURIComponent(q);
    }
    nav.querySelector('.gmn-go').addEventListener('click', doSearch);
    nav.querySelector('.gmn-search input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch();
    });
  }

  function boot() { applyTheme(); injectNav(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  // Re-apply if the gate re-renders (board rebuilds replace .g8-wrap).
  var mo = new MutationObserver(function () { applyTheme(); injectNav(); });
  try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {}

  // Keep theme fresh across the day / on resize across the breakpoint.
  window.addEventListener('resize', function () { applyTheme(); injectNav(); });
})();
