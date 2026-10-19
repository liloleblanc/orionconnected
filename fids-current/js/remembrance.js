/* ═══════════════════════════════════════════════════════════════════════════
   remembrance.js — 11 NOVEMBER ON THE BOARDS, BY EACH AIRPORT'S OWN COUNTRY

   Who keeps which day (the airport's own calendar day, in its own zone):
     Canada           Remembrance Day, 11 November       silence 2 minutes
     United Kingdom   Armistice Day, 11 November, and    silence 2 minutes
                      Remembrance Sunday, the second       on both days
                      Sunday of November
     Australia        Remembrance Day, 11 November       silence 1 minute
     United States    Veterans Day, 11 November          no silence
   Every other country keeps nothing here (Dublin, Zurich and Keflavik among
   the live airports), so their boards never change. The look follows the
   airport's country, never the board's languages: a German or Chinese board
   at a Canadian airport keeps the Canadian day.

   ALL DAY
   - Departures banner: one poppy beside the airport's own logo, as a person
     wears one (a flag pin in the United States). Nothing else changes.
   - Gate: one poppy pinned in the cream band before the airport's mark,
     never on the airline's colour (a laurel wreath in the United States:
     the flag is kept off the screen that carries the adverts), and the
     day's name in the date bar, left of the date, in the date's own type
     and colour.

   THE SILENCE, at 11:00 on the airport's own clock, for two minutes (one in
   Australia; none in the United States):
   - Departures: the free floor under the rows goes black with a poppy,
     11:00 and the silence words, and the ticker holds the same line still.
     A board with no free floor keeps every row and shows the still line.
   - Gate: the centre screen (map, adverts and cards) gives way to a black
     card with the same. The flight details, the gate number and the right
     column stay. A boarding call, final call, gate closed or the boarding
     countdown (the takeover), a gate change, a cancellation, the upgrade
     and standby lists while they are due, and the gate-close card while it
     is on the screen, always win: the card stands aside for them.
   Nothing moves and nothing flashes. Each piece is put in place, or taken
   away, in one step, with no transition (reduced motion or not).

   THE SWITCH, PER COUNTRY (SWITCH, below). The poppy is a registered
   trademark in Canada (the Royal Canadian Legion) and in the United Kingdom
   (the Royal British Legion), used only with their written permission, so
   Canada and the United Kingdom ship OFF. Turning a country on is the
   one-line change to SWITCH.

   THE ART is stand-in art (holidays/remembrance/): poppy.svg, wreath.svg and
   us-flag.svg, replaced one-for-one by the licensed files under the same
   names (docs/licenses/remembrance-art.md).

   PREVIEW (review only; nothing on a screen in an airport carries these):
     ?holiday=remembrance       the look of the airport's own country, whatever
                                its switch says (none at DUB, ZRH or KEF)
     ?holiday=remembrance-ca    one look by its id: remembrance-ca,
                                remembrance-gb, remembrance-au, veterans-us
     &holidayat=11:00:30        and the board's clocks, dates and the look as
                                at that moment on 11 November at the airport,
                                running on from there (2026-11-08T11:00 names
                                another day)
     ?holiday=none              no holiday look at all
   Every word is the store's (board-strings.js), in all nine languages, in
   the board's own pair, French first in Québec.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FidsRemembrance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ── THE SWITCH, PER COUNTRY ─────────────────────────────────────────────
  // CA and GB stay false until the Royal Canadian Legion and the Royal
  // British Legion have given written permission for the poppy.
  var SWITCH = { CA: false, GB: false, AU: true, US: true };

  // ── THE LOOKS ───────────────────────────────────────────────────────────
  //   silence  minutes of silence from 11:00 (0: no silence card)
  //   board    the art worn beside the airport's logo on the departures banner
  //   gate     the art pinned in the gate's cream band
  var LOOKS = {
    'remembrance-ca': { cc: 'CA', silence: 2, board: 'poppy', gate: 'poppy' },
    'remembrance-gb': { cc: 'GB', silence: 2, board: 'poppy', gate: 'poppy' },
    'remembrance-au': { cc: 'AU', silence: 1, board: 'poppy', gate: 'poppy' },
    'veterans-us': { cc: 'US', silence: 0, board: 'flag', gate: 'wreath' }
  };
  // the art: stand-ins, replaced one-for-one by the licensed files; each
  // drawn at its own proportions (width / height)
  var ART = {
    poppy: { src: '/holidays/remembrance/poppy.svg', ratio: 1, tilt: -10 },
    wreath: { src: '/holidays/remembrance/wreath.svg', ratio: 300 / 336, tilt: 0 },
    flag: { src: '/holidays/remembrance/us-flag.svg', ratio: 1.9, tilt: 0 }
  };

  function country(cc) {
    var c = String(cc || '').trim().toUpperCase();
    return c === 'UK' ? 'GB' : c;
  }
  // the look a country keeps, switch or not ('' for none)
  function lookOf(cc) {
    var c = country(cc);
    for (var id in LOOKS) if (Object.prototype.hasOwnProperty.call(LOOKS, id) && LOOKS[id].cc === c) return id;
    return '';
  }
  // the second Sunday of November: 8 Nov 2026, 14 Nov 2027, 12 Nov 2028
  function secondSunday(y) {
    var first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
    return 1 + (7 - first) % 7 + 7;
  }
  // the store key of the day a look keeps on y-m-d, or ''
  function dayKey(look, y, m, d) {
    var L = LOOKS[look];
    if (!L || +m !== 11) return '';
    if (L.cc === 'GB' && +d === secondSunday(+y)) return 'remembranceSunday';
    if (+d !== 11) return '';
    if (L.cc === 'US') return 'veteransDay';
    return L.cc === 'GB' ? 'armisticeDay' : 'remembranceDay';
  }
  // the look an airport in country cc shows on its own day y-m-d, or ''
  // (the switch decides, unless ignoreSwitch)
  function lookFor(cc, y, m, d, ignoreSwitch) {
    var c = country(cc), id = lookOf(c);
    if (!id || (!ignoreSwitch && !SWITCH[c])) return '';
    return dayKey(id, y, m, d) ? id : '';
  }

  // ── THE AIRPORT'S OWN CLOCK ─────────────────────────────────────────────
  function store() {
    try { if (root && root.BoardStrings) return root.BoardStrings; } catch (e) {}
    return null;
  }
  // y, m, d, h, mi, s of an instant on the zone's wall clock (no zone: the
  // machine's). Read as numbers, in the store's English locale.
  function wall(ms, tz) {
    var B = store();
    var o = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
    if (tz) o.timeZone = tz;
    var p = {};
    try {
      new Intl.DateTimeFormat(B ? B.intl('en') : undefined, o).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    } catch (e) { return null; }
    var h = (+p.hour) % 12;
    if (/p/i.test(String(p.dayPeriod || ''))) h += 12;
    return { y: +p.year, m: +p.month, d: +p.day, h: h, mi: +p.minute, s: +p.second };
  }
  // the instant whose wall clock in tz reads y-m-d h:mi:s
  function instantOf(y, m, d, h, mi, s, tz) {
    var want = Date.UTC(y, m - 1, d, h, mi, s || 0), t = want;
    for (var i = 0; i < 4; i++) {
      var w = wall(t, tz);
      if (!w) return null;
      var got = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
      if (got === want) return t;
      t += want - got;
    }
    return t;
  }
  // Is the silence up for this look at wall time w? From 11:00:00 for its
  // minutes, on its own day only.
  function silenceUp(look, w) {
    var L = LOOKS[look];
    if (!L || !L.silence || !w || !dayKey(look, w.y, w.m, w.d)) return false;
    return w.h === 11 && w.mi >= 0 && w.mi < L.silence;
  }
  // The day's name shown at wall time w: its own day's, or, in a preview on
  // another day, the 11 November name.
  function dayKeyShown(look, w, preview) {
    if (!LOOKS[look] || !w) return '';
    return dayKey(look, w.y, w.m, w.d) || (preview ? dayKey(look, w.y, 11, 11) : '');
  }
  // ?holidayat=: '11:00', '11:00:30', '1100', '110030' or
  // '2026-11-08T11:00[:30]'. null for anything else.
  function parseAt(v) {
    var s = String(v == null ? '' : v).trim();
    var m = /^(?:(\d{4})-(\d{2})-(\d{2})[T ])?(\d{1,2}):?(\d{2})(?::?(\d{2}))?$/.exec(s);
    if (!m) return null;
    var o = { y: m[1] ? +m[1] : 0, m: m[2] ? +m[2] : 0, d: m[3] ? +m[3] : 0, h: +m[4], mi: +m[5], s: m[6] ? +m[6] : 0 };
    if (o.h > 23 || o.mi > 59 || o.s > 59 || (o.m && (o.m < 1 || o.m > 12)) || (o.d && (o.d < 1 || o.d > 31))) return null;
    return o;
  }
  // The gate's silence card stands aside for everything that is the
  // passenger's business: the takeover (boarding, final call, gate closed,
  // the boarding countdown), a gate change, a cancellation, the lists while
  // they are due, and the gate-close card while it is on the screen
  // (closing). It needs the centre screen.
  function gateCardMayShow(s) {
    s = s || {};
    return !!s.media && !s.takeover && !s.gateChange && !s.cancelled && !s.lists && !s.closing;
  }

  var api = {
    SWITCH: SWITCH,
    LOOKS: LOOKS,
    ART: ART,
    country: country,
    lookOf: lookOf,
    secondSunday: secondSunday,
    dayKey: dayKey,
    lookFor: lookFor,
    wall: wall,
    instantOf: instantOf,
    silenceUp: silenceUp,
    dayKeyShown: dayKeyShown,
    parseAt: parseAt,
    gateCardMayShow: gateCardMayShow
  };

  // ════════════════════════════════════════════════════════════════════════
  // ON THE PAGE
  // ════════════════════════════════════════════════════════════════════════
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof location === 'undefined') return api;

  function param(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }
  var PREVIEW = (function () { var q = param('holiday'); return !!q && q !== 'none'; })();
  var PREVIEW_AT = PREVIEW ? parseAt(param('holidayat')) : null;
  var shift = 0, shiftSet = false;
  function now() { return Date.now() + shift; }

  function apCode() {
    var a = '';
    try { a = document.body.getAttribute('data-fids-ap') || ''; } catch (e) {}
    if (!a) { var s = document.getElementById('apSel'); a = (s && s.value) || ''; }
    return String(a).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function tzOf(ap) {
    try { return (typeof AP !== 'undefined' && AP[ap] && AP[ap].tz) || null; } catch (e) { return null; }
  }

  // The preview's clock (?holidayat=): the board's clocks and dates run from
  // that moment on 11 November at the airport. Installed once the airport,
  // and so its zone, is known.
  function previewClock(ap) {
    if (!PREVIEW_AT || shiftSet || !ap) return;
    var tz = tzOf(ap), w = wall(Date.now(), tz);
    if (!w) return;
    var at = instantOf(PREVIEW_AT.y || w.y, PREVIEW_AT.m || 11, PREVIEW_AT.d || 11, PREVIEW_AT.h, PREVIEW_AT.mi, PREVIEW_AT.s, tz);
    if (at == null) return;
    shift = at - Date.now();
    shiftSet = true;
    var B = store();
    try { if (B) B.clockNow = function (d) { return new Date((d == null ? Date.now() : +new Date(d)) + shift); }; } catch (e1) {}
    try {
      var od = window._ocClockDate;
      if (typeof od === 'function') window._ocClockDate = function (n, z) { return od(new Date((n == null ? Date.now() : +new Date(n)) + shift), z); };
    } catch (e2) {}
    try {
      if (typeof window._ocLocalDayKey === 'function') {
        window._ocLocalDayKey = function (z) {
          var x = wall(now(), z || null);
          return x ? x.y + '-' + (x.m < 10 ? '0' : '') + x.m + '-' + (x.d < 10 ? '0' : '') + x.d : '';
        };
      }
    } catch (e3) {}
  }

  // ── words: each language its own unbreakable unit (display rule 2) ──────
  function langsFor(ap) {
    var B = store();
    try { return B.pairLangs(null, ap); } catch (e) { return ['en', 'fr']; }
  }
  function units(key, L, cls) {
    var B = store();
    return L.map(function (l) { return B.half(l, B.esc(B.bs(key, l)), 'rem-u' + (cls ? ' ' + cls : ''), { key: key }); });
  }
  function pairLine(key, L, cls) {
    return '<div class="rem-line' + (cls ? ' ' + cls : '') + '">' + units(key, L).join(store().SEP_HTML) + '</div>';
  }
  function stackLines(key, L, cls) {
    return units(key, L).map(function (h) { return '<div class="rem-line' + (cls ? ' ' + cls : '') + '">' + h + '</div>'; }).join('');
  }
  // 11:00 as the board's own clock writes it (the moment, not the clock)
  function elevenText(w, tz) {
    var B = store();
    var at = instantOf(w.y, w.m, w.d, 11, 0, 0, tz);
    if (at == null) return '';
    return String(B.boardTime(new Date(at), tz) || '').replace(/\s*([AP])\.?\s*M\.?/gi, function (_, p) { return p.toUpperCase() + 'M'; });
  }
  // Each time the page's fonts finish loading, every box is measured again
  // (a box measured in the fallback type would not fit in the board's own).
  var fontsGen = 0;
  try { if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { fontsGen++; }); } catch (eF) {}
  // Shrink a box's type until every unbreakable unit fits its width; a box
  // that cannot fit even at minPx is hidden, never cut. Measured again only
  // when its words, the room it has or the fonts change (the cache key), so
  // a board that keeps the look all day does not re-measure it every second.
  // (The key and the loop counter once shared a name, `k`: the counter
  // overwrote the key, the cache never matched, and every box was measured
  // again every second. tests/remembrance.test.js runs fit twice to hold it.)
  function fit(el, maxPx, minPx, key) {
    var host = el.parentNode || el;
    var cacheKey = String(key || '') + '|' + host.clientWidth + 'x' + host.clientHeight + '|' + el.style.width + '|' + el.style.maxWidth + '|' + Math.round(maxPx) + '|' + minPx + '|' + fontsGen;
    if (el.__remFit === cacheKey) return el.__remFitOk;
    var px = Math.max(minPx, Math.round(maxPx)), over = true;
    el.style.visibility = '';
    for (var i = 0; i < 80; i++) {
      el.style.fontSize = px + 'px';
      over = false;
      var u = el.querySelectorAll('.rem-line');
      for (var j = 0; j < u.length; j++) if (u[j].scrollWidth > u[j].clientWidth + 1) over = true;
      if (el.scrollHeight > el.clientHeight + 2) over = true;
      if (!over || px <= minPx) break;
      px -= 1;
    }
    if (over) el.style.visibility = 'hidden';
    el.__remFit = cacheKey;
    el.__remFitOk = !over;
    return !over;
  }
  // an inline style written only when it changes
  function put(el, prop, v) { if (el.style[prop] !== v) el.style[prop] = v; }

  // ── the elements ────────────────────────────────────────────────────────
  function child(host, cls) {
    var e = host.querySelector(':scope > .' + cls);
    if (!e) {
      e = document.createElement('div');
      e.className = cls;
      host.appendChild(e);
    }
    return e;
  }
  function drop(sel) {
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) if (els[i].parentNode) els[i].parentNode.removeChild(els[i]);
  }
  function rect(e) { var r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }
  function shown(e) {
    if (!e) return false;
    var r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var cs = getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05;
  }
  // the right-most (or left-most) visible edge of what sel names inside host
  function edge(host, sel, side) {
    var v = null, els = host.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      if (!shown(els[i])) continue;
      var r = els[i].getBoundingClientRect();
      if (side === 'right') v = v == null ? r.right : Math.max(v, r.right);
      else v = v == null ? r.left : Math.min(v, r.left);
    }
    return v;
  }
  function artStyle(el, art, w, h) {
    var a = ART[art];
    put(el, 'backgroundImage', 'url("' + a.src + '")');
    put(el, 'width', Math.round(w) + 'px');
    put(el, 'height', Math.round(h) + 'px');
    put(el, 'transform', a.tilt ? 'rotate(' + a.tilt + 'deg)' : '');
  }
  function artHtml(art, w, h) {
    var a = ART[art];
    return '<div class="rem-art" aria-hidden="true" style="width:' + Math.round(w) + 'px;height:' + Math.round(h) + 'px;background-image:url(&quot;' + a.src + '&quot;)"></div>';
  }
  // A layer over the page, outside every board's own markup, so no repaint
  // of the board can take it away for a moment: placed on the box r.
  function layer(cls, r) {
    var e = document.body.querySelector(':scope > .' + cls);
    if (!e) {
      e = document.createElement('div');
      e.className = 'rem-layer ' + cls;
      document.body.appendChild(e);
    }
    put(e, 'left', Math.round(r.l) + 'px');
    put(e, 'top', Math.round(r.t) + 'px');
    put(e, 'width', Math.round(r.w) + 'px');
    put(e, 'height', Math.round(r.h) + 'px');
    return e;
  }

  // ── departures and arrivals ─────────────────────────────────────────────
  // The bottom of the board's rows (#fidsTable) or of its message panels
  // (.status-msg: no flights, loading, the feed down, an error), whichever
  // is shown and lowest; the content area's own top when none is shown.
  function floorTop(area, ar) {
    var top = null, els = [document.getElementById('fidsTable')].concat([].slice.call(area.querySelectorAll('.status-msg')));
    for (var i = 0; i < els.length; i++) {
      if (!els[i] || !shown(els[i])) continue;
      var b = els[i].getBoundingClientRect().bottom;
      top = top == null ? b : Math.max(top, b);
    }
    return top == null ? ar.t : top;
  }
  function board(look, ctx) {
    var L = LOOKS[look];
    var fb = document.getElementById('fidsBanner'), pill = document.getElementById('fidsAirportPill');
    // the poppy (or the flag pin) worn beside the airport's logo, clear of
    // the board's title by 24px at 1080p; hidden where it would not fit
    var pinOk = false;
    if (fb && pill && shown(fb) && shown(pill)) {
      var fr = rect(fb), pr = rect(pill), k = fr.h / 128;
      var a = ART[L.board], h = Math.round(fr.h * (L.board === 'flag' ? 0.40 : 0.56)), w = Math.round(h * a.ratio);
      var x1 = pr.l - 18 * k, x0 = x1 - w;
      var title = edge(fb, '#hdrBoard > *, .fids-board-label > *, .fids-board-icon', 'right');
      if (fr.w >= 700 && (title == null || x0 >= title + 24 * k)) {
        var pin = child(fb, 'rem-pin');
        pin.setAttribute('aria-hidden', 'true');
        artStyle(pin, L.board, w, h);
        put(pin, 'left', Math.round(x0 - fr.l) + 'px');
        put(pin, 'top', Math.round((fr.h - h) / 2) + 'px');
        pinOk = true;
      }
    }
    if (!pinOk) drop('#fidsBanner > .rem-pin');

    // the silence: the free floor under the rows, and the ticker held still
    var area = document.querySelector('.content-area'), tk = document.querySelector('.ticker');
    var floorOk = false, stillOk = false;
    if (ctx.silent && area && shown(area)) {
      var ar = rect(area);
      var bottom = tk && shown(tk) ? rect(tk).t : ar.b;
      // the floor starts under the last thing the board is saying: its rows,
      // or, on a board with none, its message ("No flights in window", the
      // feed-down panel); with neither, the top of the content area
      var top = floorTop(area, ar);
      if (bottom - top >= 220) {
        var H = bottom - top, fl = layer('rem-floor', { l: ar.l, t: top, w: ar.w, h: H });
        var A = Math.round(Math.min(H * 0.74, 330));
        var key = ctx.langs.join() + '|' + ctx.eleven + '|' + look + '|' + A;
        if (fl.getAttribute('data-k') !== key) {
          fl.setAttribute('data-k', key);
          fl.innerHTML = artHtml('poppy', A, A)
            + '<div class="rem-words"><div class="rem-line rem-time">' + store().esc(ctx.eleven) + '</div>'
            + pairLine(ctx.silenceKey, ctx.langs, 'rem-big') + pairLine('lestWeForget', ctx.langs, 'rem-small') + '</div>';
        }
        var words = fl.querySelector('.rem-words');
        put(words, 'maxWidth', Math.round(ar.w - A - ar.w * 0.12) + 'px');
        fit(words, Math.min(72, H * 0.17), 22, key);
        floorOk = true;
      }
      if (tk && shown(tk)) {
        var tr = rect(tk), st = layer('rem-still', tr);
        var sk = ctx.langs.join() + '|' + look + '|' + Math.round(tr.h);
        if (st.getAttribute('data-k') !== sk) {
          st.setAttribute('data-k', sk);
          var s = Math.round(tr.h * 0.66);
          st.innerHTML = artHtml('poppy', s, s) + '<div class="rem-words">' + pairLine(ctx.silenceKey, ctx.langs) + '</div>';
        }
        fit(st.querySelector('.rem-words'), tr.h * 0.5, 10, sk);
        stillOk = true;
      }
    }
    if (!floorOk) drop('body > .rem-floor');
    if (!stillOk) drop('body > .rem-still');
  }

  // ── the gate ────────────────────────────────────────────────────────────
  var cardMiss = 0;
  function gateState() {
    var wrap = document.querySelector('.g8-wrap');
    var media = document.querySelector('.g8-wrap .gad-media-col');
    var st = '';
    try { st = String((window._gatePaintedCd && window._gatePaintedCd.st) || ''); } catch (e) {}
    var due = null;
    try { if (typeof _gateCardsDue === 'function' && typeof _gateCardsLive === 'function') due = _gateCardsDue(_gateCardsLive(), Date.now()); } catch (e2) { due = null; }
    var gc = false;
    var notes = document.querySelectorAll('.gl-solo, .gl-gc-title');
    for (var i = 0; i < notes.length; i++) if (shown(notes[i])) gc = true;
    // The gate-close card takes its turn in the centre deck like the other
    // cards (a minute at a time, _gateCardTurnDue), so it wins while it is on
    // the screen, not for the whole 45 minutes it is due: an idle gate whose
    // flight closes in the next three quarters of an hour still keeps the
    // silence between the card's turns. The lists hold the centre for as long
    // as they are due, so for them due is on the screen.
    var closing = false;
    var cc = media ? media.querySelectorAll('.gcard[data-gcard="closecard"]') : [];
    for (var j = 0; j < cc.length; j++) if (shown(cc[j])) closing = true;
    return {
      media: !!(media && shown(media)),
      takeover: !!(wrap && wrap.classList.contains('g8-takeover')),
      gateChange: gc,
      cancelled: /^(cancelled|canceled)$/i.test(st.replace(/[\s_-]+/g, '')),
      lists: !!(due && due.sbcard),
      closing: closing,
      mediaEl: media
    };
  }
  function gate(look, ctx) {
    var L = LOOKS[look];
    var band = document.querySelector('.g8-r1');
    var pinOk = false, dayOk = false;
    if (band && shown(band)) {
      var br = rect(band), k = Math.min(br.w / 1920, 1.6);
      var dt = band.querySelector('.octb-date');
      var dr = dt && shown(dt) ? rect(dt) : null;
      var creamB = dr ? dr.t - br.t : br.h - 28;
      // the pin before the airport's mark (or the clock), on the cream, 24px
      // clear of the airline's artwork; hidden where it would not fit
      // the airport's mark is its logo (.octb-apmark) or, with none, its code
      // in letters (.octb-ap)
      var markL = edge(band, '.octb-apmark, .octb-ap, .octb-apsep, .octb-clock', 'left');
      if (markL == null) markL = edge(band, '.octb-clockrow, .g8-r1-timebox', 'left');
      var artR = edge(band, '.g8-r1-logoslot img, .g8-r1-logoslot svg, .g8-r1-logoslot canvas', 'right');
      if (markL != null && creamB >= 40) {
        var a = ART[L.gate];
        var h = Math.round(L.gate === 'wreath' ? Math.min(creamB - 8, 104 * k) : Math.min(creamB - 18, 80 * k));
        var w = Math.round(h * a.ratio);
        var x1 = markL - 26 * k, x0 = x1 - w;
        if (h >= 24 && (artR == null || x0 >= artR + 24 * k)) {
          var pin = child(band, 'rem-pin');
          pin.setAttribute('aria-hidden', 'true');
          artStyle(pin, L.gate, w, h);
          put(pin, 'left', Math.round(x0 - br.l) + 'px');
          put(pin, 'top', Math.round((creamB - h) / 2 + 2) + 'px');
          pinOk = true;
        }
      }
      // the day's name in the date bar, left of the date, in its own type
      var unit = dt && (dt.querySelector('.fx-unit') || dt);
      if (dr && unit && ctx.dayKey) {
        var cs = getComputedStyle(unit), logo = band.querySelector('.g8-r1-logoslot');
        var left = logo && shown(logo) ? rect(logo).l : br.l + 24 * k;
        var right = dr.l - 28 * k;
        if (right - left >= 120) {
          var day = child(band, 'rem-day');
          put(day, 'left', Math.round(left - br.l) + 'px');
          put(day, 'width', Math.round(right - left) + 'px');
          put(day, 'top', Math.round(dr.t - br.t) + 'px');
          put(day, 'height', Math.round(dr.h) + 'px');
          put(day, 'color', cs.color);
          put(day, 'fontWeight', cs.fontWeight);
          put(day, 'fontFamily', cs.fontFamily);
          put(day, 'letterSpacing', cs.letterSpacing);
          var dk = ctx.langs.join() + '|' + ctx.dayKey;
          if (day.getAttribute('data-k') !== dk) { day.setAttribute('data-k', dk); day.innerHTML = pairLine(ctx.dayKey, ctx.langs); }
          dayOk = fit(day, parseFloat(cs.fontSize) || 20, 12, dk + '|' + cs.fontFamily);
          // nothing of the band's own may sit under it (the airline's art
          // reaching into the bar, a word): then it is not shown at all
          if (dayOk) {
            var r0 = rect(day.querySelector('.rem-line') || day), hit = false;
            var obs = band.querySelectorAll('img, svg, canvas, .octb-clock, .octb-apmark, .octb-ap');
            for (var i = 0; i < obs.length && !hit; i++) {
              if (!shown(obs[i])) continue;
              var o = obs[i].getBoundingClientRect();
              if (o.right > r0.l && o.left < r0.r && o.bottom > r0.t && o.top < r0.b) hit = true;
            }
            if (hit) { day.style.visibility = 'hidden'; dayOk = false; }
          }
        }
      }
    }
    if (!pinOk) drop('.g8-r1 > .rem-pin');
    if (!dayOk) drop('.g8-r1 > .rem-day');

    // the silence card over the centre screen
    var cardOk = false;
    if (ctx.silent) {
      var s = gateState();
      if (gateCardMayShow(s)) {
        cardMiss = 0;
        var mr = rect(s.mediaEl);
        // the Later-at-this-gate strip under the window stays in view
        var strip = s.mediaEl.querySelector('.gl-strip');
        if (strip && shown(strip)) mr.h = Math.max(0, rect(strip).t - mr.t - 8);
        if (mr.w >= 240 && mr.h >= 240) {
          var card = layer('rem-card', mr);
          var key = ctx.langs.join() + '|' + ctx.eleven + '|' + look + '|' + Math.round(mr.w) + 'x' + Math.round(mr.h);
          if (card.getAttribute('data-k') !== key) {
            card.setAttribute('data-k', key);
            var A = Math.round(Math.min(mr.h * 0.36, mr.w * 0.5));
            card.innerHTML = artHtml('poppy', A, A)
              + '<div class="rem-words rem-time-box" style="font-size:' + Math.round(mr.h * 0.13) + 'px"><div class="rem-line rem-time">' + store().esc(ctx.eleven) + '</div></div>'
              + '<div class="rem-words rem-big-box">' + stackLines(ctx.silenceKey, ctx.langs, 'rem-big') + '</div>'
              + '<div class="rem-words rem-small-box">' + pairLine('lestWeForget', ctx.langs, 'rem-small') + '</div>';
          }
          fit(card.querySelector('.rem-big-box'), mr.h * 0.058, 14, key);
          fit(card.querySelector('.rem-small-box'), mr.h * 0.036, 11, key);
          cardOk = true;
        }
      } else if (!s.takeover && !s.gateChange && !s.cancelled && !s.lists && !s.closing && cardMiss < 3 && document.querySelector('body > .rem-card')) {
        // the centre screen is being repainted: keep the card where it was
        // for up to three passes rather than show the screen for a moment
        cardMiss++;
        cardOk = true;
      }
    }
    if (!cardOk) { cardMiss = 0; drop('body > .rem-card'); }
  }

  function clear() {
    drop('#fidsBanner > .rem-pin');
    drop('.g8-r1 > .rem-pin');
    drop('.g8-r1 > .rem-day');
    drop('body > .rem-layer');
    try { document.body.removeAttribute('data-rem'); document.body.removeAttribute('data-rem-silence'); } catch (e) {}
  }

  var lastAsk = 0, lastAp = '', look = '';
  function pass() {
    if (!document.body) return;
    var ap = apCode();
    if (!ap) return;
    previewClock(ap);
    var t = now();
    // most of the year there is no look: ask again every 30 s only
    if (!look && ap === lastAp && t - lastAsk < 30000 && t >= lastAsk) return;
    lastAsk = t; lastAp = ap;
    var id = '';
    try { if (typeof _fidsHolidayFor === 'function') id = _fidsHolidayFor(ap, new Date(t)) || ''; } catch (e) { id = ''; }
    look = LOOKS[id] ? id : '';
    // the board's holiday attribute follows at once (it is otherwise set on
    // the board's next render), so the Thanksgiving layers and the band know
    try {
      var cur = document.body.dataset.fidsHoliday || '';
      if (look && cur !== look) document.body.dataset.fidsHoliday = look;
      else if (!look && LOOKS[cur]) delete document.body.dataset.fidsHoliday;
    } catch (eH) {}
    // a screen narrower than 800px (a phone) keeps its own layout
    if (!look || window.innerWidth < 800) { clear(); return; }
    var loader = document.getElementById('fidsLoader');
    var tz = tzOf(ap), w = wall(t, tz);
    if (!w) { clear(); return; }
    var ctx = {
      langs: langsFor(ap),
      dayKey: dayKeyShown(look, w, PREVIEW),
      silent: silenceUp(look, w) && !(loader && shown(loader)),
      silenceKey: LOOKS[look].silence === 1 ? 'silenceOneMin' : 'silenceTwoMin',
      eleven: elevenText(w, tz)
    };
    document.body.setAttribute('data-rem', look);
    if (ctx.silent) document.body.setAttribute('data-rem-silence', '1'); else document.body.removeAttribute('data-rem-silence');
    try { if (document.getElementById('fidsBanner') || document.getElementById('fidsTable')) board(look, ctx); } catch (eB) {}
    try { if (document.querySelector('.g8-r1')) gate(look, ctx); else { drop('body > .rem-card'); } } catch (eG) {}
  }
  api.pass = pass;

  function start() {
    try { pass(); } catch (e) {}
    try {
      if (typeof window._ocEvery === 'function') window._ocEvery(pass, 1000);
      else setInterval(function () { try { pass(); } catch (e2) {} }, 1000);
    } catch (e3) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  return api;
});
