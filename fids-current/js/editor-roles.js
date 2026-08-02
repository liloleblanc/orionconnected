/* ───────────────────────────────────────────────────────────────────────────
 * EDITOR ROLES — tiered access for the in-app Console editor
 *
 * Shows/hides Customize-panel sections by role so regular staff can only
 * touch basic look settings, managers get more, and admins get everything.
 *
 * IMPORTANT: this is a UX GUARDRAIL, not hard security. Anything that
 * changes live data / saved settings is already enforced server-side by the
 * Cloudflare Worker (Auth role check). This layer just prevents accidental
 * changes from the on-screen menu. It is fail-safe: on ANY error it does
 * nothing, leaving the panel exactly as before.
 *
 * Role source:
 *   1. A logged-in user (sessionStorage 'fids_user'.role) — authoritative.
 *   2. Otherwise a per-screen lock (localStorage 'fids_editor_lock'),
 *      default 'admin' so a solo operator is never locked out. Lower it
 *      (Regular/Manager) to lock down a public kiosk.
 *
 * Each Customize section is tagged in menu.html with data-sec="<cap>".
 * A section spans its tagged element through the sibling just before the
 * next data-sec element.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var RANK = { demo: 0, viewer: 1, operator: 2, admin: 3 };

  // Minimum role rank required to see each section capability.
  var CAP_MIN = {
    'look-basic':   RANK.viewer,    // theme, display mode, ticker
    'look-adv':     RANK.operator,  // fonts, custom colours, layout
    'blocks':       RANK.operator,  // GIDS gate blocks
    'display-opts': RANK.operator,  // display options, background
    'admin':        RANK.admin      // access level, reset-all
  };
  var LOCK_KEY = 'fids_editor_lock';

  function loggedInRole() {
    try {
      var raw = sessionStorage.getItem('fids_user');
      if (raw) {
        var u = JSON.parse(raw);
        if (u && typeof u.role === 'string' && RANK.hasOwnProperty(u.role)) return u.role;
      }
    } catch (e) {}
    return null;
  }

  function lockRole() {
    try {
      var l = localStorage.getItem(LOCK_KEY);
      if (l && RANK.hasOwnProperty(l) && l !== 'demo') return l;
    } catch (e) {}
    return 'admin'; // never lock the solo operator out by default
  }

  function currentRole() {
    return loggedInRole() || lockRole();
  }

  function setLock(role) {
    try {
      if (RANK.hasOwnProperty(role) && role !== 'demo') {
        localStorage.setItem(LOCK_KEY, role);
      }
    } catch (e) {}
    apply();
  }

  function apply() {
    try {
      var panel = document.getElementById('smTab_customize');
      if (!panel) return;
      var rank = RANK[currentRole()];
      if (typeof rank !== 'number') return; // unknown → bail (panel unchanged)

      var curCap = null;
      var kids = panel.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el.hasAttribute && el.hasAttribute('data-sec')) curCap = el.getAttribute('data-sec');
        var need = (curCap && CAP_MIN.hasOwnProperty(curCap)) ? CAP_MIN[curCap] : 0;
        var allowed = rank >= need;

        if (!allowed) {
          if (el.getAttribute('data-er-hidden') !== '1') {
            // Save the element's own inline display once so we can restore
            // it exactly (important for JS-toggled blocks like cuColorsWrap).
            el.setAttribute('data-er-disp', el.style.display || '');
            el.setAttribute('data-er-hidden', '1');
            el.style.display = 'none';
          }
        } else if (el.getAttribute('data-er-hidden') === '1') {
          // Only restore elements WE hid — never force-show anything else.
          el.style.display = el.getAttribute('data-er-disp') || '';
          el.removeAttribute('data-er-hidden');
          el.removeAttribute('data-er-disp');
        }
      }

      // Reflect the active lock on the Access Level pills (admins only see them).
      var lock = loggedInRole() || lockRole();
      [['erLockViewer', 'viewer'], ['erLockOperator', 'operator'], ['erLockAdmin', 'admin']]
        .forEach(function (p) {
          var b = document.getElementById(p[0]);
          if (b) b.classList.toggle('active', lock === p[1]);
        });
    } catch (e) { /* fail-safe: leave the panel exactly as it was */ }
  }

  window.erSetLock = setLock;
  window.EditorRoles = { apply: apply, current: currentRole, setLock: setLock };

  // Apply once the menu fragment (loaded async by menu.js) is in the DOM,
  // then stop polling. Re-apply hooks live in menu.js's tab-open path.
  var tries = 0;
  var iv = setInterval(function () {
    if (document.getElementById('smTab_customize')) { apply(); clearInterval(iv); }
    else if (++tries > 80) clearInterval(iv);
  }, 75);
})();
