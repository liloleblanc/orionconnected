/* ───────────────────────────────────────────────────────────────────────────
 * MEDIA BASE — point logo/wordmark loading at your real asset host
 *
 * Every logo and wordmark URL in the engine is built by one function,
 * logoPath(basename) → "/logos/<maybe-subfolder>/<basename>" (same origin).
 * If your assets actually live on a separate host (e.g. Cloudflare media),
 * those same-origin paths miss. Logos have a CDN fallback so they still
 * appear; WORDMARKS have none, so they vanish and you see plain logos only.
 *
 * This wraps logoPath() (the engine's own resolver) so, when a media base
 * is configured, it returns the asset from that host. Two modes:
 *   - structured : <base> + "/logos/<sub>/<file>"   (mirrors the app tree)
 *   - flat       : <base> + "/logos/<file>"         (all files in one dir)
 *
 * Fail-safe: no base set, or any error → returns exactly what the engine
 * would have returned (zero behaviour change). Must load AFTER fids-core.js.
 *
 * Config (also editable from the Console → Customize → Logos):
 *   localStorage 'fids_media_base'  e.g. "https://media.orionconnected.com"
 *   localStorage 'fids_media_flat'  "1" = flat layout, "" = structured
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // One-time cleanup: the visual editor has been rolled back. Any persisted
  // edit-mode state or layout entries from previous builds should not
  // continue to affect the live display — clear them on next load.
  try {
    localStorage.removeItem('fids_edit_mode');
    Object.keys(localStorage)
      .filter(k => k && k.indexOf('fids_edit_layout') === 0)
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}

  function base() {
    try {
      var b = (localStorage.getItem('fids_media_base') || '').trim();
      if (!b) return '';
      b = b.replace(/\/+$/, '');
      // A scheme-less value ("fids.orionconnected.com") used to be prepended
      // as-is, producing RELATIVE urls that doubled the domain
      // (host/host/logos/... → 404 → every wordmark fell back to text).
      if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
      // Pointing the media base at THIS host is a no-op by definition —
      // return '' so the engine's own same-origin paths are used untouched.
      try { if (new URL(b).host === location.host) return ''; } catch (e) { return ''; }
      return b;
    } catch (e) { return ''; }
  }
  function isFlat() {
    try { return localStorage.getItem('fids_media_flat') === '1'; } catch (e) { return false; }
  }
  function basenameOf(p) {
    var clean = String(p).split('?')[0].split('#')[0].replace(/\/+$/, '');
    return clean.substring(clean.lastIndexOf('/') + 1);
  }

  function install() {
    if (typeof window.logoPath !== 'function' || window.logoPath.__mediaWrapped) {
      return !!(window.logoPath && window.logoPath.__mediaWrapped);
    }
    var orig = window.logoPath;
    var wrapped = function (basename) {
      var p;
      try { p = orig(basename); } catch (e) { p = basename ? ('/logos/' + basename) : basename; }
      try {
        var b = base();
        if (!b) return p;                                   // default: unchanged
        if (typeof p !== 'string' || p.indexOf('/logos/') !== 0) return p;
        if (isFlat()) return b + '/logos/' + basenameOf(p);  // flat host
        return b + p;                                        // structured host
      } catch (e) { return p; }
    };
    wrapped.__mediaWrapped = true;
    window.logoPath = wrapped;
    return true;
  }

  if (!install()) {
    var n = 0;
    var iv = setInterval(function () { if (install() || ++n > 40) clearInterval(iv); }, 50);
  }

  window.MediaBase = {
    get: base,
    flat: isFlat,
    set: function (url) {
      try {
        var v = (url || '').trim().replace(/\/+$/, '');
        if (v) localStorage.setItem('fids_media_base', v);
        else localStorage.removeItem('fids_media_base');
      } catch (e) {}
      try { if (typeof requestGateRebuild === 'function') requestGateRebuild(); } catch (e) {}
    },
    setFlat: function (on) {
      try {
        if (on) localStorage.setItem('fids_media_flat', '1');
        else localStorage.removeItem('fids_media_flat');
      } catch (e) {}
      try { if (typeof requestGateRebuild === 'function') requestGateRebuild(); } catch (e) {}
    },
    // Preview what a given file resolves to right now (for the menu UI).
    resolve: function (basename) {
      try { return window.logoPath(basename); } catch (e) { return ''; }
    }
  };
})();
