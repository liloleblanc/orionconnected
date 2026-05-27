/* ───────────────────────────────────────────────────────────────────────────
 * SCREEN CAPTURE — snapshot the live engine screen into an editable template.
 *
 * The live FIDS/GIDS/BIDS screen is rendered by the engine in code; it is NOT
 * a template. This module does a best-effort capture: it walks the rendered
 * board, finds the major visible blocks (flight table, headings, clock,
 * logos, gate map, background) and writes them into a Designer template as
 * roughly-positioned components. It is a STARTING POINT to refine in the
 * Designer — not a pixel-perfect clone, because the two layout systems differ.
 *
 * Exposes window.captureScreenToTemplate() → { id, count } or { error }.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const CW = 1920, CH = 1080;
  function _id(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  window.captureScreenToTemplate = function () {
    const board = document.getElementById('fidsBoard') || document.body;
    const br = board.getBoundingClientRect();
    if (br.width < 200 || br.height < 150) {
      return { error: 'The screen is not ready yet — wait a few seconds for it to finish loading, then try again.' };
    }
    const sx = CW / br.width, sy = CH / br.height;
    const components = [];

    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round((r.left - br.left) * sx),
        y: Math.round((r.top - br.top) * sy),
        w: Math.round(r.width * sx),
        h: Math.round(r.height * sy),
        raw: r
      };
    };
    const within = (inner, outer) =>
      outer && inner.left >= outer.left - 3 && inner.right <= outer.right + 3 &&
      inner.top >= outer.top - 3 && inner.bottom <= outer.bottom + 3;
    const add = (type, b, props) => {
      if (b.w < 24 || b.h < 14) return;
      components.push({
        id: _id('c_'), type,
        x: Math.max(0, Math.min(CW - 20, b.x)),
        y: Math.max(0, Math.min(CH - 20, b.y)),
        w: Math.max(24, Math.min(CW, b.w)),
        h: Math.max(14, Math.min(CH, b.h)),
        props: props || {}
      });
    };

    // ── Background colour — walk up until we hit a non-transparent fill ────
    let bgColor = '#0b0d12';
    try {
      let n = board;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bgColor = c; break; }
        n = n.parentElement;
      }
    } catch (e) {}

    // ── 1. Gate map → Flight Map component ────────────────────────────────
    let mapRect = null;
    const mapEl = board.querySelector('#gateMapBox, .leaflet-container, .gad-map-col-v2, .gad-map-col');
    if (mapEl) {
      const b = box(mapEl);
      if (b.w > 120 && b.h > 100) {
        mapRect = b.raw;
        add('map', b, { style: 'geo', source: 'live', showInfo: false });
      }
    }

    // ── 2. Flight-list region — the biggest vertical stack of similar rows ─
    let listRect = null;
    const candidates = [];
    board.querySelectorAll('div, table, tbody, ul').forEach(cont => {
      const kids = Array.from(cont.children).filter(k => {
        const h = k.getBoundingClientRect().height; return h > 14;
      });
      if (kids.length < 3) return;
      const hs = kids.map(k => k.getBoundingClientRect().height);
      const avg = hs.reduce((a, b) => a + b, 0) / hs.length;
      if (avg < 8) return;
      const similar = hs.every(h => Math.abs(h - avg) < avg * 0.7);
      if (!similar) return;
      const cr = cont.getBoundingClientRect();
      if (cr.width > br.width * 0.30 && cr.height > br.height * 0.22) {
        candidates.push({ el: cont, area: cr.width * cr.height, rect: cr });
      }
    });
    if (candidates.length) {
      candidates.sort((a, b) => b.area - a.area);
      const fl = candidates[0];
      listRect = fl.rect;
      const screen = (document.body.getAttribute('data-page') || '').toLowerCase();
      add('flightList', box(fl.el), {
        source: screen === 'bids' ? 'arr' : 'dep',
        headerText: ''
      });
    }

    // ── 3. Images (logos) outside the flight list and map ─────────────────
    board.querySelectorAll('img').forEach(img => {
      const r = img.getBoundingClientRect();
      if (r.width < 32 || r.height < 20) return;
      if (within(r, listRect) || within(r, mapRect)) return;  // handled by those
      const src = img.currentSrc || img.src || '';
      if (!src) return;
      add('image', box(img), { src: src, fit: 'contain' });
    });

    // ── 4. Significant text blocks (headings, clock) ──────────────────────
    const seen = new Set();
    const all = board.querySelectorAll('*');
    for (let i = 0; i < all.length && components.length < 60; i++) {
      const el = all[i];
      // leaf text: only direct text nodes, not text from child elements
      let txt = '';
      for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent;
      txt = txt.replace(/\s+/g, ' ').trim();
      if (!txt || txt.length > 120) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 14) continue;
      if (within(r, listRect) || within(r, mapRect)) continue;
      let cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      const fontPx = parseFloat(cs.fontSize) || 16;
      if (fontPx * sy < 20) continue;  // only sizeable text — skip tiny labels
      const key = Math.round(r.left) + ',' + Math.round(r.top) + ',' + txt.slice(0, 12);
      if (seen.has(key)) continue;
      seen.add(key);
      const b = box(el);
      if (/^\d{1,2}:\d{2}/.test(txt)) {
        add('clock', b, { fontSize: Math.round(fontPx * sy), color: cs.color });
      } else {
        add('text', b, {
          text: txt,
          fontSize: Math.round(fontPx * sy),
          color: cs.color,
          weight: parseInt(cs.fontWeight, 10) || 600,
          align: cs.textAlign === 'center' ? 'center' : (cs.textAlign === 'right' ? 'right' : 'left')
        });
      }
    }

    // ── Build + save the template ─────────────────────────────────────────
    const screenName = (document.body.getAttribute('data-page') ||
      (location.pathname.split('/').pop() || 'screen').replace('.html', '')).toUpperCase();
    const tpl = {
      id: _id('tpl_'),
      name: 'Captured ' + screenName + ' — ' + new Date().toLocaleString(),
      canvas: { w: CW, h: CH },
      background: { color: bgColor, image: '', fit: 'cover' },
      components: components
    };
    let store = {};
    try { store = JSON.parse(localStorage.getItem('fids_templates') || '{}') || {}; } catch (e) {}
    store[tpl.id] = tpl;
    try { localStorage.setItem('fids_templates', JSON.stringify(store)); }
    catch (e) { return { error: 'Could not save the capture — local storage is full. Remove some templates or images and retry.' }; }
    return { id: tpl.id, count: components.length };
  };

  // Delegated handler for the menu's "Copy this screen" card (the menu HTML
  // is injected after this script loads, so a delegated listener is used).
  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('#dgnCaptureBtn');
    if (!btn) return;
    e.preventDefault();
    const res = window.captureScreenToTemplate();
    if (res.error) { alert(res.error); return; }
    // Open the Designer straight onto the captured template.
    window.location.href = 'designer.html?open=' + encodeURIComponent(res.id);
  });
})();
