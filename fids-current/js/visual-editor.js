/* ───────────────────────────────────────────────────────────────────────────
 * VISUAL EDITOR v2 — block-based, obvious-by-default
 *
 * Goals (from user feedback):
 *  - No hunting. Big floating button is always visible.
 *  - No hover-only UI. Borders + labels appear when edit mode is on, and stay.
 *  - Words, not icons. Buttons say "Delete", "Move", "Replace image".
 *  - Click a block → menu appears. Click Delete → block is gone (remembered).
 *  - Drag a tile from the left panel → new block lands on the page.
 *  - Big "DONE" button to exit. Layout persists per page+screen.
 *
 * Storage:
 *  - fids_edit_mode           '1' or absent
 *  - fids_edit_layout:<key>   { deleted:[ids], added:[blocks], moved:{id->{x,y}} }
 *  - fids_airline_override_<AP>_<AL>   shared with fids-core.js:120
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // Edit-mode state is RUNTIME-ONLY (not persisted) — a refresh always
  // exits edit mode. This is the rescue path if anything goes wrong.
  // ?edit=off in the URL forces it off even if something tries to enable it.
  let _editOn = false;
  const _urlForceOff = /[?&]edit=off\b/i.test(location.search);
  const K_LAYOUT_PREFIX = 'fids_edit_layout:';

  function pageKey() {
    const path = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    const screen = (document.getElementById('screenTypeSel') || {}).value || 'main';
    return path + ':' + screen;
  }
  function loadLayout() {
    try {
      const raw = localStorage.getItem(K_LAYOUT_PREFIX + pageKey());
      const o = raw ? JSON.parse(raw) : {};
      return {
        deleted:   o.deleted   || [],   // [stableId, ...]
        replaces:  o.replaces  || {},   // { stableId: dataUrl }
        texts:     o.texts     || {},   // { stableId: newText }
        positions: o.positions || {},   // { stableId: {x, y} }
        added:     o.added     || [],   // [ {id, type, x, y, w, h, text, src} ]
        moved:     o.moved     || {}
      };
    } catch (e) {
      return { deleted: [], replaces: {}, texts: {}, positions: {}, added: [], moved: {} };
    }
  }
  function saveLayout() {
    try { localStorage.setItem(K_LAYOUT_PREFIX + pageKey(), JSON.stringify(layout)); } catch (e) {}
  }
  let layout = loadLayout();

  /* ── Stable IDs (survive engine re-renders) ────────────────────────────── */
  // The engine destroys and rebuilds DOM nodes on every paint. We need an ID
  // that identifies the *same* logical element across rebuilds, so we can
  // re-apply user edits after the engine paints over them.
  //
  //   - data-code present  →  kind:CODE       (e.g. "logo:AC", same for every AC flight)
  //   - singleton class    →  kind             (e.g. "background", one per screen)
  //   - multiple of class  →  kind:cls#n       (n is index among same-class siblings)
  function stableIdFor(el, t) {
    if (!el || !t) return null;
    const code = el.getAttribute && el.getAttribute('data-code');
    if (code) return t.kind + ':' + String(code).toUpperCase();
    if (t.singleton) return t.kind;
    const cls = (el.className && el.className.split && el.className.split(' ').filter(c => c)[0]) || el.tagName.toLowerCase();
    // Same-class siblings under the same parent — best-effort index
    let idx = 0;
    if (el.parentElement) {
      const sibs = Array.from(el.parentElement.children).filter(s =>
        s.tagName === el.tagName && (s.className || '') === (el.className || '')
      );
      idx = sibs.indexOf(el);
    }
    return t.kind + ':' + cls + (idx > 0 ? '#' + idx : '');
  }

  /* ── Block registry (engine elements) ──────────────────────────────────── */
  // Each entry: what selector identifies it, what to call it, what it can do.
  // canEditText: text content of the element is editable.
  // canReplace : it bears an image that can be swapped.
  // canDelete  : the user can hide it from the screen.
  // singleton  : there's only one of this kind on the screen (affects ID).
  const TYPES = [
    {
      kind: 'wordmark',
      match: el => el.matches && el.matches('img.card-wordmark, img.fids-airline-wordmark, img[alt*="wordmark" i], img[src*="-wordmark-"]'),
      label: el => 'Airline wordmark' + (el.getAttribute('data-code') ? ' — ' + el.getAttribute('data-code') : ''),
      canDelete: true, canReplace: true
    },
    {
      kind: 'logo',
      match: el => el.matches && el.matches('img.full-logo, img.g8-r1-logo, img.airline-emblem, img.card-logo, img.sm-flight-logo'),
      label: el => 'Airline logo' + (el.getAttribute('data-code') ? ' — ' + el.getAttribute('data-code') : ''),
      canDelete: true, canReplace: true,
      // Logos have a dedicated engine override (fids-core.js:120) — keep using it.
      replace: replaceAirlineImage
    },
    {
      kind: 'clock', singleton: true,
      match: el => el.matches && el.matches('.g8-r5-clock, .bidsv2-clock, #dedicatedBannerClock'),
      label: () => 'Clock',
      canDelete: true
    },
    {
      kind: 'gate', singleton: true,
      match: el => el.matches && el.matches('.g8-r1-gate, .v2-gateinfo-val'),
      label: () => 'Gate number',
      canDelete: true
    },
    {
      kind: 'weather', singleton: true,
      match: el => el.matches && el.matches('.gate-wx-panel, .gate-top-wx'),
      label: () => 'Weather panel',
      canDelete: true
    },
    {
      kind: 'background', singleton: true,
      match: el => el.matches && el.matches('.gate-bg'),
      label: () => 'Background',
      canDelete: false, canReplace: true,
      replace: (el, dataUrl) => {
        el.style.backgroundImage = 'url(' + dataUrl + ')';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      }
    },
    // Ads — the gate's rotating advertisement panels. Deleting the container
    // hides the whole rail; persistence keeps it hidden across ad rotation.
    {
      kind: 'ad',
      match: el => el.matches && el.matches('.gad-equip-panel, .gad-panel, .gad-media-col, .gate-ad-logo-rail'),
      label: () => 'Advertisement',
      canDelete: true, canReplace: false
    },
    // Footer / status strip — the "Next: Toronto · AC8662 · 11:48 p.m." bar
    // and similar text. Text editing here pins your label across re-renders.
    {
      kind: 'next-flight', singleton: true,
      match: el => el.matches && el.matches('.gate-footer-next-val, .gate-footer-next'),
      label: () => 'Next-flight message',
      canDelete: true, canEditText: true
    },
    {
      kind: 'footer-left', singleton: true,
      match: el => el.matches && el.matches('.gate-footer-left'),
      label: () => 'Footer (left)',
      canDelete: true, canEditText: true
    },
    {
      kind: 'footer-right', singleton: true,
      match: el => el.matches && el.matches('.gate-footer-right, #dedicatedFooterRight'),
      label: () => 'Footer (right)',
      canDelete: true, canEditText: true
    }
  ];
  function classify(el) {
    if (!el || el.nodeType !== 1) return null;
    for (const t of TYPES) { try { if (t.match(el)) return t; } catch (e) {} }
    return null;
  }
  function currentAirport() {
    try {
      const sel = document.getElementById('apSel');
      const v = (sel && sel.value) ? sel.value : (localStorage.getItem('fids_airport') || '');
      return String(v).toUpperCase().trim();
    } catch (e) { return ''; }
  }
  function replaceAirlineImage(el, dataUrl) {
    const code = (el.getAttribute('data-code') || '').toUpperCase();
    if (!code) { el.src = dataUrl; toast('Image replaced.'); return; }
    const ap = currentAirport();
    if (!ap) { el.src = dataUrl; return; }
    try {
      localStorage.setItem('fids_airline_override_' + ap + '_' + code, JSON.stringify({ url: dataUrl }));
    } catch (e) { toast('That image is too big to save. Try a smaller file.'); return; }
    el.src = dataUrl;
    toast('Replaced ' + code + ' image.');
  }

  /* ── On/off state (runtime only — reload escapes edit mode) ────────────── */
  function isOn() { return _editOn && !_urlForceOff; }
  function setOn(v) {
    _editOn = !!v && !_urlForceOff;
    apply();
  }
  // Clear any persisted edit-mode flag from older builds so a stale value
  // can never auto-resume edit mode on page load.
  try { localStorage.removeItem('fids_edit_mode'); } catch (e) {}

  /* ── No on-screen button: edit mode is entered from the admin menu ────── */
  /* (Passengers see this screen — keeping it clean by default.) */

  /* ── Banner (top, edit mode only) ──────────────────────────────────────── */
  function ensureBanner() {
    if (document.getElementById('fveBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'fveBanner';
    bar.innerHTML =
      '<div class="fve-banner-text">' +
        '<b>Edit mode is ON.</b> ' +
        'Click any block on the screen to delete, replace, or edit it. ' +
        'Drag a tile from the panel on the left to add a new block. ' +
        '<span class="fve-banner-hint">Tip: press Esc or click DONE to leave edit mode.</span>' +
      '</div>' +
      '<button id="fveReset" type="button" class="fve-banner-secondary">Reset this screen</button>' +
      '<button id="fveDone" type="button">DONE</button>';
    document.body.appendChild(bar);
    document.getElementById('fveDone').onclick = () => setOn(false);
    document.getElementById('fveReset').onclick = () => {
      if (confirm('Clear ALL edits for this screen?\n\nThis removes deletions, replacements, text changes, and added blocks. Cannot be undone.')) {
        resetLayout();
      }
    };
  }

  /* ── Side palette (left, edit mode only) ───────────────────────────────── */
  const PALETTE = [
    { t: 'message', n: 'Message Box', d: 'A bordered box with a message' },
    { t: 'text',    n: 'Text',        d: 'Plain text on the screen' },
    { t: 'image',   n: 'Image',       d: 'A picture from your computer' },
    { t: 'clock',   n: 'Clock',       d: 'The current time' }
  ];
  function ensurePalette() {
    if (document.getElementById('fvePalette')) return;
    const p = document.createElement('div');
    p.id = 'fvePalette';
    p.innerHTML =
      '<div class="fve-pal-h">Add a block</div>' +
      '<div class="fve-pal-help">Drag any of these onto the screen</div>' +
      PALETTE.map(b =>
        '<div class="fve-pal-tile" draggable="true" data-add="' + b.t + '">' +
          '<div class="fve-pal-tile-name">' + b.n + '</div>' +
          '<div class="fve-pal-tile-d">' + b.d + '</div>' +
        '</div>'
      ).join('');
    document.body.appendChild(p);
    p.querySelectorAll('.fve-pal-tile').forEach(t => {
      t.addEventListener('dragstart', e => {
        e.dataTransfer.setData('fve/add', t.dataset.add);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
  }
  function onPageDragOver(e) {
    if (!isOn()) return;
    if (!Array.from(e.dataTransfer.types || []).includes('fve/add')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onPageDrop(e) {
    if (!isOn()) return;
    const type = e.dataTransfer.getData('fve/add');
    if (!type) return;
    e.preventDefault();
    addBlock(type, e.clientX, e.clientY);
  }

  /* ── Added blocks ──────────────────────────────────────────────────────── */
  function addBlock(type, x, y) {
    const id = 'fve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const w = type === 'message' ? 280 : (type === 'image' ? 200 : 180);
    const h = type === 'message' ? 90 : (type === 'image' ? 120 : 50);
    const block = {
      id, type,
      x: Math.max(8, Math.round(x - w / 2)),
      y: Math.max(8, Math.round(y - h / 2)),
      w, h,
      text: defaultText(type),
      src: ''
    };
    layout.added.push(block);
    saveLayout();
    renderAdded(block);
    toast(displayName(type) + ' added — click it to edit, drag to move.');
  }
  function defaultText(type) {
    return ({ message: 'Your message here', text: 'Edit me', image: '', clock: '' })[type] || '';
  }
  function displayName(type) {
    return ({ message: 'Message box', text: 'Text', image: 'Image', clock: 'Clock' })[type] || 'Block';
  }
  function renderAdded(b) {
    let el = document.getElementById(b.id);
    const fresh = !el;
    if (fresh) {
      el = document.createElement('div');
      el.id = b.id;
      el.className = 'fve-added fve-added-' + b.type;
      el.setAttribute('data-fve-added', b.type);
      el.setAttribute('data-fve-label', displayName(b.type));
      document.body.appendChild(el);
    }
    el.style.left = b.x + 'px';
    el.style.top  = b.y + 'px';
    el.style.width = b.w + 'px';
    el.style.minHeight = b.h + 'px';
    if (b.type === 'clock') {
      el.textContent = nowStr();
      if (!el._tick) el._tick = setInterval(() => { if (document.body.contains(el)) el.textContent = nowStr(); else clearInterval(el._tick); }, 1000);
    } else if (b.type === 'image') {
      el.innerHTML = b.src
        ? '<img src="' + escAttr(b.src) + '" alt="">'
        : '<div class="fve-img-placeholder">Click → Replace image</div>';
    } else {
      el.textContent = b.text || '';
    }
    if (fresh) wireAdded(el);
  }
  function renderAllAdded() { layout.added.forEach(renderAdded); }
  function wireAdded(el) {
    el.addEventListener('click', e => {
      if (!isOn()) return;
      if (e.target.closest('button')) return;
      e.stopPropagation();
      showPopup(el);
    });
    el.addEventListener('mousedown', e => {
      if (!isOn()) return;
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      dragState = { el, dx: e.clientX - r.left, dy: e.clientY - r.top, kind: 'added' };
      hidePopup();
      e.preventDefault();
    });
  }
  function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /* ── Popup toolbar (click any block) ───────────────────────────────────── */
  let popup = null;
  function ensurePopup() {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'fvePopup';
    document.body.appendChild(popup);
    return popup;
  }
  function showPopup(target) {
    if (!isOn()) return;
    const isAdd = target.hasAttribute('data-fve-added');
    const t = isAdd ? null : classify(target);
    const p = ensurePopup();
    p._target = target;

    const label = isAdd
      ? displayName(target.getAttribute('data-fve-added'))
      : (t ? t.label(target) : 'Block');
    const canDelete = isAdd || (t && t.canDelete !== false);
    const canReplace = isAdd
      ? target.getAttribute('data-fve-added') === 'image'
      : !!(t && t.canReplace);
    const canEditText = isAdd
      ? (target.getAttribute('data-fve-added') !== 'clock' && target.getAttribute('data-fve-added') !== 'image')
      : !!(t && t.canEditText);
    const canMove = isAdd;   // moving built-in engine blocks comes in the next push

    let html = '<div class="fve-pop-lbl">' + escHtml(label) + '</div>';
    if (canEditText) html += '<button data-act="text">Edit text</button>';
    if (canReplace)  html += '<button data-act="replace">Replace image</button>';
    if (canMove)     html += '<button data-act="move-hint">Drag to move</button>';
    if (canDelete)   html += '<button data-act="delete" class="fve-pop-del">Delete</button>';
    html += '<button data-act="close" class="fve-pop-close">Cancel</button>';
    p.innerHTML = html;
    p.querySelectorAll('button').forEach(b => b.onclick = onPopupClick);

    const r = target.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - 320));
    const top = window.scrollY + (r.bottom + 200 > window.innerHeight ? r.top - 8 : r.bottom + 8);
    p.style.left = left + 'px';
    p.style.top = top + 'px';
    p.style.display = 'block';
  }
  function hidePopup() { if (popup) popup.style.display = 'none'; }
  function onPopupClick(e) {
    const act = e.currentTarget.dataset.act;
    const tgt = popup && popup._target;
    if (!tgt) return;
    if (act === 'delete') doDelete(tgt);
    else if (act === 'replace') doReplace(tgt);
    else if (act === 'text') doEditText(tgt);
    else if (act === 'move-hint') toast('Hold the block and drag it to move.');
    else if (act === 'close') hidePopup();
  }
  function doDelete(el) {
    if (el.hasAttribute('data-fve-added')) {
      const id = el.id;
      layout.added = layout.added.filter(b => b.id !== id);
      if (el._tick) clearInterval(el._tick);
      el.remove();
    } else {
      const t = classify(el);
      if (!t || t.canDelete === false) { toast('This block can\'t be deleted.'); return; }
      const id = stableIdFor(el, t);
      if (id && !layout.deleted.includes(id)) layout.deleted.push(id);
      el.style.display = 'none';
    }
    saveLayout();
    hidePopup();
    toast('Block deleted. Use Reset to bring it back.');
  }
  function doReplace(el) {
    const p = filePicker();
    p._target = el;
    p.click();
    hidePopup();
  }
  function doEditText(el) {
    // Added block: edit the stored block.text and re-render.
    if (el.hasAttribute('data-fve-added')) {
      const id = el.id;
      const block = layout.added.find(b => b.id === id);
      if (!block) return;
      const v = prompt('Text:', block.text || '');
      if (v == null) return;
      block.text = v;
      saveLayout();
      renderAdded(block);
      hidePopup();
      return;
    }
    // Engine element: store an override in layout.texts keyed by stable ID,
    // and apply now. reapplyAll() will re-apply after each engine repaint.
    const t = classify(el);
    if (!t) return;
    const id = stableIdFor(el, t);
    if (!id) return;
    const current = layout.texts[id] != null ? layout.texts[id] : el.textContent;
    const v = prompt('Text:', current);
    if (v == null) return;
    layout.texts[id] = v;
    saveLayout();
    el.textContent = v;
    hidePopup();
    toast('Text updated.');
  }

  /* ── File picker (Replace) ─────────────────────────────────────────────── */
  let pickerEl = null;
  function filePicker() {
    if (pickerEl) return pickerEl;
    pickerEl = document.createElement('input');
    pickerEl.type = 'file';
    pickerEl.accept = 'image/*';
    pickerEl.style.display = 'none';
    document.body.appendChild(pickerEl);
    pickerEl.addEventListener('change', () => {
      const f = pickerEl.files && pickerEl.files[0];
      const tgt = pickerEl._target;
      if (f && tgt) replaceFromFile(tgt, f);
      pickerEl.value = '';
    });
    return pickerEl;
  }
  function replaceFromFile(el, file) {
    if (!file.type || !file.type.startsWith('image/')) { toast('Only image files.'); return; }
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read that file.');
    reader.onload = () => {
      // Added image block → store on the block record.
      if (el.hasAttribute('data-fve-added') && el.getAttribute('data-fve-added') === 'image') {
        const id = el.id;
        const b = layout.added.find(x => x.id === id);
        if (b) { b.src = reader.result; saveLayout(); renderAdded(b); }
        return;
      }
      const t = classify(el);
      // Logo: route through the engine's existing override (still works).
      if (t && t.replace) {
        t.replace(el, reader.result);
        // ALSO record in layout.replaces so reapplyAll re-imposes on any
        // engine path that re-renders without consulting the override key.
        const id = stableIdFor(el, t);
        if (id) {
          try { layout.replaces[id] = reader.result; saveLayout(); }
          catch (e) { toast('Saved on engine override only — local layout full.'); }
        }
        return;
      }
      // Wordmarks, ad images, anything else with an img tag: record in
      // layout.replaces. reapplyAll() will re-apply src on every repaint.
      if (el.tagName === 'IMG' && t) {
        const id = stableIdFor(el, t);
        if (id) {
          try {
            layout.replaces[id] = reader.result;
            saveLayout();
          } catch (e) { toast('That image is too big to save. Try a smaller file.'); return; }
        }
        el.src = reader.result;
        toast('Replaced — change will stay across refreshes.');
        return;
      }
      // Fallback (e.g. background div): just set what we can.
      if (el.tagName === 'IMG') el.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ── Drag-to-move (added blocks for now) ───────────────────────────────── */
  let dragState = null;
  document.addEventListener('mousemove', e => {
    if (!dragState) return;
    dragState.el.style.left = Math.max(0, e.clientX - dragState.dx) + 'px';
    dragState.el.style.top  = Math.max(0, e.clientY - dragState.dy) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragState) return;
    const id = dragState.el.id;
    const b = layout.added.find(x => x.id === id);
    if (b) { b.x = parseInt(dragState.el.style.left, 10) || b.x; b.y = parseInt(dragState.el.style.top, 10) || b.y; saveLayout(); }
    dragState = null;
  });

  /* ── Decorate engine elements (orange border + label, click handler) ───── */
  const _DECORATE_SELECTOR =
    'img, .g8-r5-clock, .bidsv2-clock, #dedicatedBannerClock, ' +
    '.g8-r1-gate, .v2-gateinfo-val, .gate-bg, .gate-wx-panel, .gate-top-wx, ' +
    // Ads:
    '.gad-equip-panel, .gad-panel, .gad-media-col, .gate-ad-logo-rail, ' +
    // Footer text strips:
    '.gate-footer-next-val, .gate-footer-next, .gate-footer-left, ' +
    '.gate-footer-right, #dedicatedFooterRight';
  function decorateElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.hasAttribute('data-fve-kind')) return;
    const t = classify(el);
    if (!t) return;
    el.setAttribute('data-fve-kind', t.kind);
    el.setAttribute('data-fve-label', t.label(el));
    const id = stableIdFor(el, t);
    if (id) el.setAttribute('data-fve-id', id);
    el.addEventListener('click', onEngineClick, true);
    if (t.canReplace) {
      el.addEventListener('dragover', onEngineDragOver);
      el.addEventListener('dragleave', onEngineDragLeave);
      el.addEventListener('drop', onEngineDrop);
    }
  }
  // Whole-document scan — only used on edit-mode enable.
  function decorate(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(_DECORATE_SELECTOR).forEach(decorateElement);
    applyDeletes();
  }
  // Incremental scan — only walks ONE subtree (a newly-added node).
  // Used by the debounced MutationObserver to avoid full-document scans.
  function decorateSubtree(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches(_DECORATE_SELECTOR)) decorateElement(node);
    if (node.querySelectorAll) node.querySelectorAll(_DECORATE_SELECTOR).forEach(decorateElement);
  }
  function onEngineClick(e) {
    if (!isOn()) return;
    e.stopPropagation();
    e.preventDefault();
    showPopup(e.currentTarget);
  }
  function onEngineDragOver(e) {
    if (!isOn()) return;
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.currentTarget.classList.add('fve-dz');
  }
  function onEngineDragLeave(e) { e.currentTarget.classList.remove('fve-dz'); }
  function onEngineDrop(e) {
    if (!isOn()) return;
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    e.currentTarget.classList.remove('fve-dz');
    replaceFromFile(e.currentTarget, f);
  }
  /* ── THE persistence loop — re-applies all layout entries to current DOM ─
   * This is what makes edits stick against engine repaints. After every
   * engine paint, we walk decorated elements and re-impose: deletions,
   * image replacements, text overrides, and position overrides. The engine
   * can repaint as often as it wants — we put your edits back on top.
   * Runs once on enable, once on init, and after every MO debounce settle.
   */
  function reapplyAll() {
    // Walk every potentially-editable element, even if not yet decorated.
    document.querySelectorAll(_DECORATE_SELECTOR).forEach(el => {
      const t = classify(el);
      if (!t) return;
      const id = el.getAttribute('data-fve-id') || stableIdFor(el, t);
      if (!id) return;

      // 1. Deletion (hide). Once hidden, no need to apply other edits.
      if (layout.deleted.includes(id)) {
        el.style.display = 'none';
        return;
      }
      // If a previous edit hid it and the layout now says keep, restore.
      if (el.style.display === 'none' && !layout.deleted.includes(id)) {
        el.style.display = '';
      }

      // 2. Image replacement (engine just rewrote src — put ours back).
      if (layout.replaces[id] && el.tagName === 'IMG' && el.src !== layout.replaces[id]) {
        el.src = layout.replaces[id];
      }

      // 3. Text override (engine just rewrote textContent — put ours back).
      if (layout.texts[id] != null && el.textContent !== layout.texts[id]) {
        el.textContent = layout.texts[id];
      }

      // 4. Position override.
      if (layout.positions[id]) {
        const p = layout.positions[id];
        el.style.position = 'fixed';
        el.style.left = p.x + 'px';
        el.style.top  = p.y + 'px';
        el.style.zIndex = '5000';
      }
    });
  }
  // Back-compat alias: callers used to invoke applyDeletes(); now they get
  // the full reapply for free.
  const applyDeletes = reapplyAll;

  function clearDecorations() {
    document.querySelectorAll('[data-fve-kind]').forEach(el => {
      el.removeAttribute('data-fve-kind');
      el.removeAttribute('data-fve-label');
      // keep data-fve-id so reapplyAll() can still find this element when
      // edit mode is off — that way deletions / replaces / texts persist
      // for the public display, not just while editing.
      el.classList.remove('fve-dz');
    });
  }

  // Reset everything for the current screen (banner button).
  function resetLayout() {
    layout = { deleted: [], replaces: {}, texts: {}, positions: {}, added: [], moved: {} };
    saveLayout();
    // Restore visibility / src / text on any decorated elements
    document.querySelectorAll('[data-fve-kind]').forEach(el => {
      el.style.display = '';
      // text and src restoration requires a repaint — the engine will
      // overwrite both naturally on next tick. For img, also clear inline src
      // if it was set by us (the engine reassigns from its data).
    });
    // Remove all added blocks
    document.querySelectorAll('[data-fve-added]').forEach(el => {
      if (el._tick) clearInterval(el._tick);
      el.remove();
    });
    toast('All edits cleared for this screen.');
  }

  /* ── Apply (called whenever state changes) ─────────────────────────────── */
  function apply() {
    const on = isOn();
    document.body.setAttribute('data-fids-edit', on ? '1' : '');
    if (on) {
      ensureBanner();
      ensurePalette();
      decorate(document.body);
    } else {
      const b = document.getElementById('fveBanner'); if (b) b.remove();
      const p = document.getElementById('fvePalette'); if (p) p.remove();
      hidePopup();
      clearDecorations();
      applyDeletes();  // keep deletes in effect even outside edit mode
    }
    renderAllAdded();  // added blocks live in both modes
  }

  /* ── Toast ─────────────────────────────────────────────────────────────── */
  function toast(msg) {
    let el = document.getElementById('fveToast');
    if (!el) { el = document.createElement('div'); el.id = 'fveToast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */
  function init() {
    apply();
    document.addEventListener('dragover', onPageDragOver);
    document.addEventListener('drop',     onPageDrop);
    // Click outside the popup closes it
    document.addEventListener('click', e => {
      if (!popup || popup.style.display === 'none') return;
      if (popup.contains(e.target)) return;
      if (e.target.closest('[data-fve-kind], [data-fve-added], #fveBanner, #fvePalette')) return;
      hidePopup();
    });
    // Re-decorate and re-apply state when the engine repaints — but
    // DEBOUNCED and INCREMENTAL. Earlier versions ran a full-document
    // scan on every mutation, which froze the browser during engine boot
    // (Chrome's "Page Unresponsive" dialog). Now we collect added nodes,
    // wait until they stop arriving, then process only those new subtrees.
    let _moTimer = null;
    const _pendingNodes = new Set();
    const _processPending = () => {
      _moTimer = null;
      if (_pendingNodes.size === 0) return;
      const nodes = Array.from(_pendingNodes);
      _pendingNodes.clear();
      if (isOn()) nodes.forEach(decorateSubtree);
      applyDeletes();
      renderAllAdded();
    };
    const mo = new MutationObserver(muts => {
      let touched = false;
      for (const m of muts) {
        if (!m.addedNodes) continue;
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.id === 'fveBanner' || n.id === 'fvePalette' ||
              n.id === 'fvePopup' || n.id === 'fveToast' ||
              (n.hasAttribute && n.hasAttribute('data-fve-added'))) continue;
          _pendingNodes.add(n);
          touched = true;
        }
      }
      if (!touched || _moTimer) return;
      _moTimer = setTimeout(_processPending, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Universal rescue: ESC exits edit mode immediately, no questions.
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOn()) setOn(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.VisualEditor = {
    enable:  () => setOn(true),
    disable: () => setOn(false),
    toggle:  () => setOn(!isOn()),
    isOn,
    addBlock,
    resetLayout: () => { layout = { deleted: [], added: [], moved: {} }; saveLayout(); apply(); }
  };
})();
