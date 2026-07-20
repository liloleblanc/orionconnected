(function () {
  'use strict';

  var SAFE_PAD = 8;
  var scheduled = false;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    return r.width > 8 && r.height > 8 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0;
  }

  function drawnRect(media) {
    var r = media.getBoundingClientRect();
    var nw = media.videoWidth || media.naturalWidth || 0;
    var nh = media.videoHeight || media.naturalHeight || 0;
    var fit = (window.getComputedStyle(media).objectFit || 'fill').toLowerCase();
    if (!nw || !nh || (fit !== 'contain' && fit !== 'scale-down')) return r;
    var sourceRatio = nw / nh;
    var boxRatio = r.width / r.height;
    var w;
    var h;
    if (sourceRatio >= boxRatio) {
      w = r.width;
      h = w / sourceRatio;
    } else {
      h = r.height;
      w = h * sourceRatio;
    }
    return {
      left: r.left + (r.width - w) / 2,
      top: r.top + (r.height - h) / 2,
      right: r.left + (r.width + w) / 2,
      bottom: r.top + (r.height + h) / 2,
      width: w,
      height: h
    };
  }

  function setSafeZone(host, media) {
    if (!host || !media || !isVisible(host) || !isVisible(media)) return;
    var hb = host.getBoundingClientRect();
    var mr = drawnRect(media);
    var left = Math.max(0, mr.left - hb.left - SAFE_PAD);
    var top = Math.max(0, mr.top - hb.top - SAFE_PAD);
    var rightEdge = Math.min(hb.width, mr.right - hb.left + SAFE_PAD);
    var bottomEdge = Math.min(hb.height, mr.bottom - hb.top + SAFE_PAD);
    var right = Math.max(0, hb.width - rightEdge);
    var bottom = Math.max(0, hb.height - bottomEdge);
    var height = Math.max(0, bottomEdge - top);

    function setVar(name, value) {
      if (host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value);
    }
    setVar('--g8-ad-safe-top', top.toFixed(1) + 'px');
    setVar('--g8-ad-safe-bottom', bottom.toFixed(1) + 'px');
    setVar('--g8-ad-safe-left', left.toFixed(1) + 'px');
    setVar('--g8-ad-safe-right', right.toFixed(1) + 'px');
    setVar('--g8-ad-safe-height', height.toFixed(1) + 'px');
    host.classList.add('g8-ad-safe-ready');
  }

  function pickCreative(root) {
    if (!root) return null;
    var candidates = Array.prototype.slice.call(root.querySelectorAll('img,video'));
    var best = null;
    var bestArea = 0;
    candidates.forEach(function (el) {
      if (!isVisible(el)) return;
      if (el.closest('.ad-tech-frame') || el.classList.contains('v2-rc-map-life-emblem')) return;
      var r = drawnRect(el);
      var area = r.width * r.height;
      if (area > bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function markGeneratedSurroundLayers(media) {
    var host = media && media.parentElement;
    if (!host || !media.classList.contains('ad-tech-media')) return;
    var wrapper = null;
    Array.prototype.forEach.call(host.children, function (child) {
      if (child.classList && child.classList.contains('g8-ad-surround-wrapper')) wrapper = child;
    });
    if (!wrapper) {
      var layers = [];
      Array.prototype.forEach.call(host.children, function (child) {
        if (child === media || child.classList.contains('ad-tech-frame')) return;
        if (child.tagName !== 'DIV') return;
        if (window.getComputedStyle(child).position === 'absolute') layers.push(child);
      });
      if (layers.length) {
        wrapper = document.createElement('div');
        wrapper.className = 'g8-ad-surround-wrapper';
        host.insertBefore(wrapper, layers[0]);
        layers.forEach(function (layer) { wrapper.appendChild(layer); });
      }
    }
    if (wrapper) setSafeZone(wrapper, media);

    // The accent frame is another surround layer. Keep its rim, but mask its
    // fill out of the creative rectangle too, so transparent artwork cannot
    // reveal decoration underneath the advert.
    var frame = null;
    Array.prototype.forEach.call(host.children, function (child) {
      if (child.classList && child.classList.contains('ad-tech-frame')) frame = child;
    });
    if (frame) setSafeZone(frame, media);
  }

  function updateAdvertSafeZones() {
    scheduled = false;
    var columns = document.querySelectorAll('.gad-media-col.g8-static-page-ad');
    Array.prototype.forEach.call(columns, function (column) {
      var carousel = column.querySelector('#gateAdCarousel');
      var media = pickCreative(carousel);
      if (!media) {
        column.classList.remove('g8-ad-safe-ready');
        return;
      }
      setSafeZone(column, media);
      markGeneratedSurroundLayers(media);
    });
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateAdvertSafeZones);
  }

  document.addEventListener('load', function (event) {
    if (event.target && /^(IMG|VIDEO)$/.test(event.target.tagName || '')) scheduleUpdate();
  }, true);
  window.addEventListener('resize', scheduleUpdate);
  new MutationObserver(scheduleUpdate).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src', 'style']
  });
  window.setInterval(scheduleUpdate, 1000);
  scheduleUpdate();

  // If every exact and same-type aircraft image candidate fails, do not leave
  // an empty shelf. The core renderer remains responsible for choosing the
  // type; this listener only changes the terminal blank into an honest state.
  document.addEventListener('error', function (event) {
    var img = event.target;
    if (!img || !img.matches || !img.matches('img.g8-aircraft-img')) return;
    window.setTimeout(function () {
      if (!img.isConnected || img.style.getPropertyValue('display') !== 'none') return;
      var holder = img.closest('.v2-rc-aircraft-img');
      if (!holder) return;
      holder.className = 'v2-rc-aircraft-pending';
      holder.innerHTML = 'Aircraft image pending <span>|</span> Image de l’appareil à venir';
    }, 0);
  }, true);
})();
