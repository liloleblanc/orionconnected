/* ───────────────────────────────────────────────────────────────────────────
 * UI OPTIONS — user-editable, in-app settings (decoration layer)
 *
 * Lets a non-technical operator change things from the on-screen Console
 * instead of editing code. Each option is an isolated, fail-safe override
 * stored in localStorage. If an option is unset or anything errors, the
 * app behaves EXACTLY as before (the original engine code runs untouched).
 *
 * This file must load AFTER js/fids-core.js (it wraps engine functions).
 *
 * Options so far:
 *   - Ticker message : overrides the scrolling safety/info ticker text.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var TICKER_KEY = 'fids_ticker_custom';

  function getTicker() {
    try { return (localStorage.getItem(TICKER_KEY) || '').trim(); } catch (e) { return ''; }
  }
  function setTicker(text) {
    try {
      var t = (text || '').trim();
      if (t) localStorage.setItem(TICKER_KEY, t);
      else localStorage.removeItem(TICKER_KEY);
    } catch (e) {}
    applyTicker();
  }
  function resetTicker() {
    try { localStorage.removeItem(TICKER_KEY); } catch (e) {}
    applyTicker();
  }

  // Re-run the (possibly wrapped) ticker updater so changes show immediately.
  function applyTicker() {
    try { if (typeof window.updateTicker === 'function') window.updateTicker(); } catch (e) {}
  }

  // Wrap the engine's updateTicker(). When a custom message is set we write
  // it and skip the default rebuild; otherwise we defer entirely to the
  // original implementation so default behaviour is byte-for-byte unchanged.
  function installTickerWrap() {
    var orig = window.updateTicker;
    if (typeof orig !== 'function' || orig.__uiWrapped) return !!(orig && orig.__uiWrapped);
    var wrapped = function () {
      try {
        var custom = getTicker();
        if (custom) {
          var el = document.querySelector('.ticker span');
          if (el) { el.textContent = custom; return; }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    wrapped.__uiWrapped = true;
    window.updateTicker = wrapped;
    return true;
  }

  // fids-core.js defines updateTicker at parse time, so it normally exists
  // already. Retry briefly just in case load order changes later.
  if (!installTickerWrap()) {
    var tries = 0;
    var iv = setInterval(function () {
      if (installTickerWrap() || ++tries > 40) clearInterval(iv);
    }, 50);
  }
  // Apply once the DOM (and the .ticker element) is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTicker);
  } else {
    applyTicker();
  }

  window.UIOptions = {
    ticker: { get: getTicker, set: setTicker, reset: resetTicker },
    applyTicker: applyTicker
  };
})();
