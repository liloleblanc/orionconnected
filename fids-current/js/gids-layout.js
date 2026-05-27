/* ───────────────────────────────────────────────────────────────────────────
 * GIDS LAYOUT BLOCKS — customization layer for the gate screen
 *
 * This is the "decoration" layer over the stable core. It controls which of
 * the GIDS columns render and in what order, WITHOUT editing the rendering
 * engine in fids-core.js. It is intentionally tiny, self-contained, and
 * fails safe: any error or missing/invalid config falls back to the exact
 * default behaviour (aircraft | media | map), so this file can never blank
 * the board.
 *
 * Blocks (the three columns assembled by buildV2GateLayout):
 *   - aircraft : left  — livery, flight, equipment, inbound panel
 *   - media    : center — rotating ad / video carousel
 *   - map      : right  — route map + destination weather
 *
 * The bottom message strip is NOT a toggleable block: it already self-hides
 * when empty and is used for safety-critical gate-change / override messages.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var STORAGE_KEY = 'fids_gids_blocks';
  var KNOWN = ['aircraft', 'media', 'map'];

  function defaults() {
    return { order: KNOWN.slice(), enabled: { aircraft: true, media: true, map: true } };
  }

  // Returns a sanitized config. ANY problem → defaults (fail-safe).
  function get() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return defaults();

      var def = defaults();
      var enabled = {};
      KNOWN.forEach(function (k) {
        enabled[k] = (p.enabled && typeof p.enabled[k] === 'boolean') ? p.enabled[k] : true;
      });

      // Keep only known block names, preserve order, append any missing.
      var order = [];
      if (Array.isArray(p.order)) {
        p.order.forEach(function (k) {
          if (KNOWN.indexOf(k) !== -1 && order.indexOf(k) === -1) order.push(k);
        });
      }
      KNOWN.forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });

      // Never allow a completely empty board — if nothing is enabled,
      // ignore the config and use defaults.
      var anyOn = order.some(function (k) { return enabled[k]; });
      if (!anyOn) return def;

      return { order: order, enabled: enabled };
    } catch (e) {
      return defaults();
    }
  }

  function set(cfg) {
    try {
      var clean = get.call(null); // start from a sane base
      if (cfg && Array.isArray(cfg.order)) clean.order = cfg.order;
      if (cfg && cfg.enabled) clean.enabled = cfg.enabled;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: clean.order, enabled: clean.enabled }));
    } catch (e) { /* storage may be unavailable — non-fatal */ }
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // Given a map of { blockName: htmlString }, return the column HTML joined
  // in the configured order, skipping disabled blocks. Defensive: on ANY
  // error, return the three columns in default order.
  function assemble(parts) {
    try {
      var cfg = get();
      var out = '';
      cfg.order.forEach(function (name) {
        if (cfg.enabled[name] && typeof parts[name] === 'string') out += parts[name];
      });
      if (out) return out;
    } catch (e) {}
    return (parts.aircraft || '') + (parts.media || '') + (parts.map || '');
  }

  window.GIDSBlocks = {
    KNOWN: KNOWN.slice(),
    defaults: defaults,
    get: get,
    set: set,
    reset: reset,
    assemble: assemble
  };
})();
