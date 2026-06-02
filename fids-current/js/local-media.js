/* ───────────────────────────────────────────────────────────────────────────
 * LOCAL MEDIA — no-backend videos/images for the gate middle screen
 *
 * The app already has a full media player for the GIDS centre column. It
 * pulls what to play from FIDS_MEDIA.getAssignedVideosForAirline() /
 * getAssignedImagesForAirline(), which are normally backed by the
 * Cloudflare Worker (admin upload library + assignments).
 *
 * This module lets an operator add YouTube links or direct video/image
 * URLs from the on-screen Console with NO backend. It works by WRAPPING
 * those two resolver functions: it returns whatever the Worker already
 * returned, PLUS any locally-saved items (localStorage), in the exact
 * shape the existing player expects. The renderer/player is untouched.
 *
 * Fail-safe: no local items or any error → behaves exactly as before.
 * Must load AFTER js/fids-core.js (it wraps window.FIDS_MEDIA).
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var KEY = 'fids_local_media';

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list || [])); } catch (e) {}
    reload();
  }

  // Parse a pasted URL into the engine's item schema.
  function parseUrl(url) {
    var u = String(url || '').trim();
    if (!u) return null;
    // YouTube playlist
    var pl = u.match(/[?&]list=([A-Za-z0-9_-]+)/);
    if (pl && /youtube\.com|youtu\.be/.test(u) && !/[?&]v=/.test(u)) {
      return { source: 'youtube', ytType: 'playlist', ytId: pl[1], type: 'video' };
    }
    // YouTube single video (watch?v=, youtu.be/, shorts/, embed/)
    var ytm = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (ytm) return { source: 'youtube', ytType: 'video', ytId: ytm[1], type: 'video' };
    // Direct image
    if (/\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(u)) {
      return { source: 'upload', type: 'image', url: u };
    }
    // Otherwise treat as a direct video file (mp4/webm/mov/…)
    return { source: 'upload', type: 'video', url: u };
  }

  // Build a player-ready item { id, source, ytType, ytId, type, url, label, playback }
  function toItem(rec) {
    var base = parseUrl(rec.url);
    if (!base) return null;
    base.id = rec.id;
    base.label = rec.label || '';
    base.playback = { loop: !!rec.loop };
    base.fit = rec.fit === 'cover' ? 'cover' : 'contain';
    base.zoom = (typeof rec.zoom === 'number' && rec.zoom > 0) ? rec.zoom : 1;
    base.posX = (typeof rec.posX === 'number') ? rec.posX : 50;
    base.posY = (typeof rec.posY === 'number') ? rec.posY : 50;
    base.dwellMs = (typeof rec.dwellMs === 'number' && rec.dwellMs > 0) ? rec.dwellMs : 12000;
    base.order = (typeof rec.order === 'number') ? rec.order : 999;
    return base;
  }

  function reload() {
    // Force the gate to rebuild so new media is picked up next cycle.
    try { if (typeof requestGateRebuild === 'function') requestGateRebuild(); } catch (e) {}
  }

  // ── Public list management ──
  function list() { return read(); }
  function add(url, opts) {
    opts = opts || {};
    if (!parseUrl(url)) return { ok: false, error: 'Unrecognized URL' };
    var l = read();
    l.push({
      id: 'loc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      url: String(url).trim(),
      label: opts.label || '',
      loop: !!opts.loop,
      airline: (opts.airline || 'ALL').toUpperCase(),
      fit: opts.fit === 'cover' ? 'cover' : 'contain',
      zoom: (typeof opts.zoom === 'number' && opts.zoom > 0) ? opts.zoom : 1,
      posX: (typeof opts.posX === 'number') ? opts.posX : 50,
      posY: (typeof opts.posY === 'number') ? opts.posY : 50,
      dwellMs: (typeof opts.dwellMs === 'number' && opts.dwellMs > 0) ? opts.dwellMs : 12000,
      order: (typeof opts.order === 'number') ? opts.order : 999
    });
    write(l);
    return { ok: true };
  }
  // Update display/framing controls on an existing item.
  function update(id, patch) {
    patch = patch || {};
    var l = read();
    for (var i = 0; i < l.length; i++) {
      if (l[i].id === id) {
        if (patch.fit !== undefined) l[i].fit = patch.fit === 'cover' ? 'cover' : 'contain';
        if (typeof patch.zoom === 'number') l[i].zoom = patch.zoom;
        if (typeof patch.posX === 'number') l[i].posX = patch.posX;
        if (typeof patch.posY === 'number') l[i].posY = patch.posY;
        if (typeof patch.dwellMs === 'number') l[i].dwellMs = patch.dwellMs;
        if (typeof patch.order === 'number') l[i].order = patch.order;
        if (patch.label !== undefined) l[i].label = patch.label;
        if (patch.airline !== undefined) l[i].airline = String(patch.airline).toUpperCase();
        break;
      }
    }
    write(l);
    return { ok: true };
  }
  function remove(id) { write(read().filter(function (r) { return r.id !== id; })); }
  function clear() { write([]); }

  // Local items that apply to this airline, as [{item, mode, primaryId}].
  function localFor(code, kind /* 'video'|'image' */) {
    var al = String(code || '').toUpperCase();
    var out = [];
    read().forEach(function (rec) {
      var aim = (rec.airline || 'ALL').toUpperCase();
      if (aim !== 'ALL' && aim !== al) return;
      var it = toItem(rec);
      if (!it) return;
      if (kind === 'image' && it.type !== 'image') return;
      if (kind === 'video' && it.type === 'image') return;
      out.push({ item: it, mode: 'rotate', primaryId: null });
    });
    return out;
  }

  // ── Wrap the engine's resolver seam ──
  function install() {
    var M = window.FIDS_MEDIA;
    if (!M || M.__localWrapped) return !!(M && M.__localWrapped);
    var origV = M.getAssignedVideosForAirline;
    var origI = M.getAssignedImagesForAirline;

    M.getAssignedVideosForAirline = function (code) {
      var base = [];
      try { base = (typeof origV === 'function' && origV(code)) || []; } catch (e) {}
      try { return base.concat(localFor(code, 'video')); } catch (e) { return base; }
    };
    M.getAssignedImagesForAirline = function (code) {
      var base = [];
      try { base = (typeof origI === 'function' && origI(code)) || []; } catch (e) {}
      try { return base.concat(localFor(code, 'image')); } catch (e) { return base; }
    };
    M.__localWrapped = true;
    return true;
  }

  if (!install()) {
    var n = 0;
    var iv = setInterval(function () {
      if (install() || ++n > 40) clearInterval(iv);
    }, 50);
  }

  window.LocalMedia = { list: list, add: add, update: update, remove: remove, clear: clear, parseUrl: parseUrl };
})();
