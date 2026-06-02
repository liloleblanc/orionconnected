/* ════════════════════════════════════════════════════════════════════════
   MEDIA ADJUST PANEL  (media-adjust.js)
   A self-contained overlay to preview and frame an uploaded ad/video the way
   it will appear in the gate ad box, then save fit / zoom / position.
   Opens via:  window.MediaAdjust.open(itemId)   — itemId is a LocalMedia id.
   Saves via:  window.LocalMedia.update(id, {fit,zoom,posX,posY})
   Isolated: touches nothing else. Safe to load after the others.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // The gate ad box proportion (center panel) — portrait-ish. Tuned to match
  // the live GIDS center column so the preview reflects reality.
  var BOX_W = 360, BOX_H = 470;

  function _item(id) {
    if (!window.LocalMedia || !window.LocalMedia.list) return null;
    var l = window.LocalMedia.list();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  function open(itemId) {
    var rec = _item(itemId);
    if (!rec) { console.warn('[MediaAdjust] item not found:', itemId); return; }

    // working copy
    var st = {
      fit: rec.fit === 'cover' ? 'cover' : 'contain',
      zoom: (typeof rec.zoom === 'number' && rec.zoom > 0) ? rec.zoom : 1,
      posX: (typeof rec.posX === 'number') ? rec.posX : 50,
      posY: (typeof rec.posY === 'number') ? rec.posY : 50,
      dwellMs: (typeof rec.dwellMs === 'number' && rec.dwellMs > 0) ? rec.dwellMs : 12000,
      order: (typeof rec.order === 'number') ? rec.order : 999
    };
    var isVideo = (rec.url && /\.(mp4|webm|mov)(\?|$)/i.test(rec.url)) || rec.type === 'video';

    var ov = document.createElement('div');
    ov.id = 'mediaAdjustOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(6,8,18,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    ov.innerHTML =
      '<div style="background:#11151f;border:1px solid #2a3344;border-radius:14px;padding:22px;width:min(760px,94vw);max-height:92vh;overflow:auto;box-shadow:0 30px 80px rgba(0,0,0,.5);">'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
      +     '<div style="color:#fff;font-size:16px;font-weight:700;">Adjust ad framing</div>'
      +     '<button id="maClose" style="appearance:none;background:#1c2536;color:#9fb0c8;border:1px solid #2a3344;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px;">Close</button>'
      +   '</div>'
      +   '<div style="display:flex;gap:22px;flex-wrap:wrap;">'
      +     '<div style="flex:0 0 auto;">'
      +       '<div style="color:#7e8ca3;font-size:11px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;">Preview (gate box)</div>'
      +       '<div id="maBox" style="width:' + BOX_W + 'px;height:' + BOX_H + 'px;background:#000;border-radius:8px;overflow:hidden;position:relative;border:1px solid #2a3344;"></div>'
      +     '</div>'
      +     '<div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:18px;">'
      +       '<div>'
      +         '<div style="color:#cdd7e6;font-size:13px;font-weight:600;margin-bottom:8px;">Fit</div>'
      +         '<div style="display:flex;gap:8px;">'
      +           '<button class="maFit" data-fit="contain" style="flex:1;appearance:none;border-radius:8px;padding:10px;cursor:pointer;font-size:12px;border:1px solid #2a3344;">Whole ad (contain)</button>'
      +           '<button class="maFit" data-fit="cover" style="flex:1;appearance:none;border-radius:8px;padding:10px;cursor:pointer;font-size:12px;border:1px solid #2a3344;">Fill box (cover)</button>'
      +         '</div>'
      +         '<div style="color:#6b7890;font-size:11px;margin-top:6px;">Contain shows the whole ad (may letterbox). Cover fills the box (may crop edges).</div>'
      +       '</div>'
      +       '<div>'
      +         '<div style="color:#cdd7e6;font-size:13px;font-weight:600;margin-bottom:6px;">Zoom <span id="maZoomVal" style="color:#7e8ca3;font-weight:400;"></span></div>'
      +         '<input id="maZoom" type="range" min="1" max="2.5" step="0.05" style="width:100%;">'
      +       '</div>'
      +       '<div>'
      +         '<div style="color:#cdd7e6;font-size:13px;font-weight:600;margin-bottom:6px;">Horizontal position</div>'
      +         '<input id="maPosX" type="range" min="0" max="100" step="1" style="width:100%;">'
      +       '</div>'
      +       '<div>'
      +         '<div style="color:#cdd7e6;font-size:13px;font-weight:600;margin-bottom:6px;">Vertical position</div>'
      +         '<input id="maPosY" type="range" min="0" max="100" step="1" style="width:100%;">'
      +       '</div>'
      +       '<div style="display:flex;gap:14px;">'
      +         '<div style="flex:1;">'
      +           '<div style="color:#cdd7e6;font-size:13px;font-weight:600;margin-bottom:6px;">Duration (seconds)</div>'
      +           '<input id="maDwell" type="number" min="2" max="60" step="1" style="width:100%;box-sizing:border-box;background:#0c1018;color:#fff;border:1px solid #2a3344;border-radius:8px;padding:9px;font-size:13px;">'
      +         '</div>'
      +         '<div style="flex:1;">'
      +           '<div style="color:#cdd7e6;font-size:13px;font-weight:600;margin-bottom:6px;">Play order</div>'
      +           '<input id="maOrder" type="number" min="1" max="99" step="1" style="width:100%;box-sizing:border-box;background:#0c1018;color:#fff;border:1px solid #2a3344;border-radius:8px;padding:9px;font-size:13px;">'
      +         '</div>'
      +       '</div>'
      +       '<div style="color:#6b7890;font-size:11px;margin-top:-8px;">Lower order plays first (1,2,3…). Accor still appears every 4th slide.</div>'
      +       '<div style="display:flex;gap:10px;margin-top:4px;">'
      +         '<button id="maReset" style="appearance:none;background:#1c2536;color:#9fb0c8;border:1px solid #2a3344;border-radius:8px;padding:10px 14px;cursor:pointer;font-size:13px;">Reset</button>'
      +         '<button id="maSave" style="flex:1;appearance:none;background:#2f6df6;color:#fff;border:none;border-radius:8px;padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;">Save framing</button>'
      +       '</div>'
      +       '<div id="maMsg" style="color:#5fcf80;font-size:12px;min-height:16px;"></div>'
      +     '</div>'
      +   '</div>'
      + '</div>';

    document.body.appendChild(ov);

    var box = ov.querySelector('#maBox');
    var zoom = ov.querySelector('#maZoom');
    var posX = ov.querySelector('#maPosX');
    var posY = ov.querySelector('#maPosY');
    var zoomVal = ov.querySelector('#maZoomVal');
    var fitBtns = ov.querySelectorAll('.maFit');
    var msg = ov.querySelector('#maMsg');

    function renderPreview() {
      var posStr = st.posX + '% ' + st.posY + '%';
      var inner;
      if (isVideo) {
        inner = '<video src="' + rec.url + '" autoplay muted loop playsinline'
          + ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:' + st.fit
          + ';object-position:' + posStr + ';transform:scale(' + st.zoom + ');background:#000;"></video>';
      } else {
        inner = '<div style="position:absolute;inset:0;background:#000;background-image:url(\'' + rec.url
          + '\');background-size:' + (st.fit === 'cover' ? 'cover' : 'contain')
          + ';background-position:' + posStr + ';background-repeat:no-repeat;transform:scale(' + st.zoom + ');"></div>';
      }
      box.innerHTML = inner;
      zoomVal.textContent = '×' + st.zoom.toFixed(2);
      fitBtns.forEach(function (b) {
        var on = b.getAttribute('data-fit') === st.fit;
        b.style.background = on ? '#2f6df6' : '#1c2536';
        b.style.color = on ? '#fff' : '#9fb0c8';
      });
    }

    // init control values
    zoom.value = st.zoom; posX.value = st.posX; posY.value = st.posY;
    var dwellEl = ov.querySelector('#maDwell');
    var orderEl = ov.querySelector('#maOrder');
    dwellEl.value = Math.round(st.dwellMs / 1000);
    orderEl.value = (st.order === 999 ? '' : st.order);
    dwellEl.addEventListener('input', function () {
      var s = parseInt(dwellEl.value, 10);
      if (isFinite(s) && s > 0) st.dwellMs = Math.max(2000, Math.min(60000, s * 1000));
    });
    orderEl.addEventListener('input', function () {
      var o = parseInt(orderEl.value, 10);
      st.order = isFinite(o) ? o : 999;
    });

    fitBtns.forEach(function (b) {
      b.addEventListener('click', function () { st.fit = b.getAttribute('data-fit'); renderPreview(); });
    });
    zoom.addEventListener('input', function () { st.zoom = parseFloat(zoom.value); renderPreview(); });
    posX.addEventListener('input', function () { st.posX = parseInt(posX.value, 10); renderPreview(); });
    posY.addEventListener('input', function () { st.posY = parseInt(posY.value, 10); renderPreview(); });

    ov.querySelector('#maReset').addEventListener('click', function () {
      st.fit = 'contain'; st.zoom = 1; st.posX = 50; st.posY = 50;
      zoom.value = 1; posX.value = 50; posY.value = 50;
      renderPreview();
    });

    ov.querySelector('#maSave').addEventListener('click', function () {
      if (window.LocalMedia && window.LocalMedia.update) {
        window.LocalMedia.update(itemId, { fit: st.fit, zoom: st.zoom, posX: st.posX, posY: st.posY, dwellMs: st.dwellMs, order: st.order });
        msg.textContent = 'Saved. The gate display will use this framing.';
        setTimeout(close, 900);
      } else {
        msg.style.color = '#e06666';
        msg.textContent = 'Could not save (LocalMedia.update unavailable).';
      }
    });

    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#maClose').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    renderPreview();
  }

  window.MediaAdjust = { open: open };
})();
