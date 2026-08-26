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

    // v22559: the frame is NO LONGER masked out of the creative rectangle.
    // Nick's silver frame deliberately sits IN FRONT of the advert ('the
    // frame goes in front of the advert', Jul 26 2026) — the old safe-zone
    // mask here is exactly what kept erasing it over the ad.
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

  // v23166 — DO NOTHING WHILE THIS BOARD IS OFF SCREEN.
  //
  // This file measures where an advert's pixels actually land so the surround
  // can be inset to match. Every part of that is only meaningful if someone can
  // see the advert. But it ran unconditionally: a MutationObserver over the
  // WHOLE document plus a 1s interval, each scheduling a pass that calls
  // getBoundingClientRect on every image and video — a forced synchronous
  // layout. rotate.html keeps three boards alive at once, so that cost was
  // being paid three times over on a 2-vCPU host that is also running ffmpeg,
  // and the board you were actually looking at had to fight the other two for
  // the main thread. That contention is the stutter.
  //
  // window._ocIdle is published by fids-core for exactly this: it is true only
  // when the rotator has told this frame it is hidden. A standalone display
  // never receives that message, so _ocIdle stays false and behaviour there is
  // unchanged. Coming back on screen fires a fresh pass via the load/mutation
  // path before the fade finishes, so nothing is ever seen unmeasured.
  function isOffScreen() {
    try { return typeof window._ocIdle === 'function' && window._ocIdle(); } catch (e) { return false; }
  }

  // v23267 — AND A FLOOR ON HOW OFTEN IT MAY RUN.
  //
  // v23166 stopped this watching 'style', which killed the font-fitter storm.
  // What it left behind still watched childList + class over the WHOLE
  // document, and on a gate board that is not quiet either: Leaflet adds and
  // removes tile elements and rewrites marker classes continuously while the
  // aircraft glides, so the pass was still being scheduled every animation
  // frame. Measured on the live board at v23266, in steady state with nothing
  // changing on screen: ~230 getBoundingClientRect calls per second, 93% of
  // them from this file, one 100ms+ forced-layout task per second and frame
  // stalls to match. That is the bump Nick can see but cannot quite point at.
  //
  // An advert's pixels do not move because a map tile loaded. Two guards:
  // relevance (below) rejects mutations that cannot affect an advert, and this
  // floor coalesces whatever survives. 200ms is far below the eye's threshold
  // for a surround inset settling, and the 1s interval remains the backstop.
  var MIN_GAP_MS = 200;
  var lastRun = 0;
  var trailing = 0;

  function runPass() {
    trailing = 0;
    lastRun = Date.now();
    updateAdvertSafeZones();
  }

  function scheduleUpdate() {
    if (scheduled || isOffScreen()) return;
    var since = Date.now() - lastRun;
    if (since < MIN_GAP_MS) {
      // Too soon: leave one trailing pass armed so the last change in a burst
      // is still measured, and drop the rest of the burst.
      if (!trailing) trailing = window.setTimeout(function () {
        trailing = 0;
        if (isOffScreen()) return;
        scheduled = true;
        window.requestAnimationFrame(function () { scheduled = false; runPass(); });
      }, MIN_GAP_MS - since);
      return;
    }
    scheduled = true;
    window.requestAnimationFrame(function () { scheduled = false; runPass(); });
  }

  // Does this batch of mutations plausibly change where an advert's pixels
  // land? Only the ad column's own subtree can, plus the arrival of a carousel
  // or a piece of media anywhere (the column is built after this file loads).
  // Everything else — map tiles, marker classes, telemetry, the clock — is
  // rejected without touching layout: closest()/matches() are selector work,
  // not measurement.
  function relevantMutations(muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      var el = m.target && m.target.nodeType === 1 ? m.target : (m.target && m.target.parentElement);
      if (el && el.closest && el.closest('.gad-media-col')) return true;
      var added = m.addedNodes;
      if (added && added.length) {
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.matches && n.matches('.gad-media-col, #gateAdCarousel, img, video')) return true;
          if (n.querySelector && n.querySelector('.gad-media-col, #gateAdCarousel')) return true;
        }
      }
    }
    return false;
  }

  document.addEventListener('load', function (event) {
    if (event.target && /^(IMG|VIDEO)$/.test(event.target.tagName || '')) scheduleUpdate();
  }, true);
  window.addEventListener('resize', scheduleUpdate);
  // v23166 — STOP WATCHING 'style'. This observer's job is to notice when an
  // advert's MEDIA changes — a new slide (childList), a new source (src), a
  // state class (class). It was also watching every inline `style` write in the
  // entire document, and the gate's JS font fitters write inline style
  // constantly: measured on the live board at ~18 writes per second with nothing
  // happening on screen. Every one of those scheduled a pass that ran
  // getBoundingClientRect over every image and video on the page.
  //
  // Worse, it was partly watching itself: updateAdvertSafeZones sets inline
  // custom properties on the column, which is a 'style' mutation, which
  // re-triggered this observer. A font size has nothing to do with where an
  // advert's pixels land, so this was pure self-inflicted layout work.
  //
  // The signals that genuinely matter are all still covered: childList and src
  // for a slide change, class for state, the capture-phase load listener for a
  // decoded image, resize for the window, and the 1s interval as a backstop for
  // anything that settles late.
  // v23267 — the same signals, but only when they belong to an advert. The
  // observer still spans the document because the ad column does not exist
  // when this file runs; relevantMutations() is what makes that affordable.
  new MutationObserver(function (muts) {
    if (relevantMutations(muts)) scheduleUpdate();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src']
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
