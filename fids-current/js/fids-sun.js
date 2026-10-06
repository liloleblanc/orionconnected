/* ═══════════════════════════════════════════════════════════════════════════
   fids-sun.js — DAY AND NIGHT FROM THE AIRPORT'S OWN SUN  (v24008)

   One engine for every screen that changes between a day look and a night
   look. It computes sunrise and sunset ON THE SCREEN, from the airport's
   latitude and longitude, and switches at those moments. Nothing here fetches
   anything: a board with no network still turns at dusk.

   WHY A FILE OF ITS OWN, LOADED BEFORE fids-core.js
     · fids-core.js is 55,000 lines and cannot be loaded by a unit test; this
       file is plain, dependency-free and is required by node --test directly,
       which is how its sums and its scheduling are proved (tests/
       day-night-engine.test.js) rather than assumed.
     · Another screen can load it without the board: it reads coordinates from
       window.AIRPORT_COORDS (airport-coords.js) when COORDS is not there.
     · Loaded before fids-core.js, so anything in the core can call fidsSun at
       any time. Coordinates are looked up when they are asked for, not when
       this file loads, so the core's COORDS table is there by then.

   THE SUMS — NOAA's solar position (the NOAA Solar Calculator / Meeus)
     Official sunrise and sunset: the sun's CENTRE at -0°50' (34' of
     refraction plus the 16' half-width of the disc), the definition the U.S.
     Naval Observatory, NOAA and MET Norway all publish. All of it in UTC epoch
     milliseconds: each solar day is cut at its transit (the sun highest) and
     anti-transit (lowest), and a crossing of -0°50' between the two is found by
     bisection on the computed altitude, to a few hundredths of a second. The
     time zone is used once — to decide which solar day "today" is in times()
     (the board's FIDSGateDate.zonedDateOrdinal) — and nowhere else.

     Polar edges fall out of the same rule: a half-day whose two ends are on
     the same side of -0°50' has no crossing. Midnight sun is day all through;
     polar night is night all through.

     Checked against the U.S. Naval Observatory's published tables for every
     day of 2026 at sixteen airports from Honolulu to Hobart, and at two
     points above the Arctic Circle (tests/fixtures/sun-usno-2026.json).

   THE API — window.fidsSun
     fidsSun.times(iata, ms)     → { date, sunrise, sunset, solarNoon, polar }
                                   for the airport's local day containing ms.
                                   sunrise/sunset are epoch ms, or null on a
                                   polar day ('day') or night ('night').
     fidsSun.isDay(iata, ms)     → true / false (null if the airport is unknown)
     fidsSun.next(iata, ms)      → { at, kind: 'sunrise'|'sunset', isDay } —
                                   the next switch after ms, or null
     fidsSun.subscribe(iata, fn) → calls fn(isDay, info) now and again at every
                                   switch; returns the function that stops it
     `iata` may also be { lat, lon, tz } or [lat, lon]. ms defaults to now.

   SCREENS LEFT RUNNING FOR WEEKS
     · A timer is armed for one second after the next switch.
     · A heartbeat every 30 s recomputes the state and RE-ARMS that timer from
       the wall clock. A laptop that slept, a tab the browser froze, a clock
       that NTP stepped forward or back: each leaves the timer wrong, and the
       heartbeat puts it right within 30 seconds.
     · visibilitychange (to visible), online, focus, pageshow and resume check
       at once.
     · Every check re-arms; there is no last day.

   THE PAGE
     <html> carries fids-day or fids-night for the board's own airport, with
     data-daynight="day|night", data-daynight-airport and
     data-daynight-source="sun|override". fids-dn-ready is added a moment
     AFTER the first state is set, so a surface that crossfades
     (.fids-dn-fade in css/shared.css, 2 s) never animates at boot.
     A 'fids-daynight' event is dispatched on window when the state is first
     known and at each switch.

   REVIEW
     ?daynight=day or ?daynight=night holds the page in that state (isDay,
     subscribers and the <html> classes; times and next stay astronomical).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var VERSION = 'v24008';
  var DAY = 86400000, HOUR = 3600000, MIN = 60000;
  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  var H0 = -50 / 60;                 // the sun's centre at sunrise and sunset, degrees

  var HEARTBEAT_MS = 30000;          // the longest a missed timer can go unnoticed
  var SLACK_MS = 1000;               // fire just after the switch, never just before
  var MIN_DELAY_MS = 1000;
  var MAX_DELAY_MS = 6 * HOUR;       // well inside setTimeout's 24.8-day ceiling
  var SEARCH_DAYS = 400;             // next() looks at most this far ahead (polar)

  // ── 1. WHERE THE SUN IS ────────────────────────────────────────────────────
  // NOAA's formulas: declination (radians) and the equation of time (minutes)
  // at an instant.
  function solar(ms) {
    var T = (ms / DAY + 2440587.5 - 2451545) / 36525;           // Julian centuries from J2000
    var L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    if (L0 < 0) L0 += 360;
    var M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD;
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var C = Math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T))
      + Math.sin(2 * M) * (0.019993 - 0.000101 * T) + Math.sin(3 * M) * 0.000289;
    var omega = (125.04 - 1934.136 * T) * RAD;
    var lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
    var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    var eps = (eps0 + 0.00256 * Math.cos(omega)) * RAD;
    var decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
    var y = Math.tan(eps / 2); y *= y;
    var L = L0 * RAD;
    var eqTime = 4 * DEG * (y * Math.sin(2 * L) - 2 * e * Math.sin(M)
      + 4 * e * y * Math.sin(M) * Math.cos(2 * L) - 0.5 * y * y * Math.sin(4 * L) - 1.25 * e * e * Math.sin(2 * M));
    return { decl: decl, eqTime: eqTime };
  }

  function wrap180(a) { return ((a + 180) % 360 + 360) % 360 - 180; }

  // The sun's hour angle at ms for a longitude (east positive), degrees.
  function hourAngle(ms, lon, eqTime) {
    var utcMin = (((ms % DAY) + DAY) % DAY) / MIN;
    return wrap180((utcMin + eqTime + 4 * lon) / 4 - 180);
  }

  // Geometric altitude of the sun's centre, degrees.
  function altitude(lat, lon, ms) {
    var s = solar(ms);
    var phi = lat * RAD, ha = hourAngle(ms, lon, s.eqTime) * RAD;
    var v = Math.sin(phi) * Math.sin(s.decl) + Math.cos(phi) * Math.cos(s.decl) * Math.cos(ha);
    return Math.asin(Math.max(-1, Math.min(1, v))) * DEG;
  }

  // The instant near ms when the hour angle is `target` (0 = transit, 180 =
  // anti-transit). The hour angle turns one degree every four minutes.
  function hourAngleTime(lon, ms, target) {
    var t = ms;
    for (var i = 0; i < 5; i++) {
      var d = wrap180(hourAngle(t, lon, solar(t).eqTime) - target);
      t -= d * 4 * MIN;
      if (Math.abs(d) < 1e-5) break;
    }
    return t;
  }

  // ── 2. THE SOLAR DAYS OF ONE PLACE ─────────────────────────────────────────
  // Day k is the solar day whose mean noon is k days after 1970-01-01 plus the
  // longitude's offset. noon = transit, mid = the anti-transit after it. The
  // sun climbs from mid(k-1) to noon(k) and sinks from noon(k) to mid(k); each
  // half has at most one crossing of H0, and it has one exactly when its two
  // ends are on opposite sides. So rise and set always alternate.
  function Place(lat, lon, tz, code) {
    this.lat = lat; this.lon = lon; this.tz = tz || null; this.code = code || '';
    this.noonOffset = (720 - 4 * lon) * MIN;      // mean solar noon, ms after 00:00 UTC
    this.days = {};
    this.dayCount = 0;
  }
  Place.prototype.alt = function (ms) { return altitude(this.lat, this.lon, ms); };
  Place.prototype.dayIndex = function (ms) { return Math.floor((ms - this.noonOffset) / DAY); };
  Place.prototype.day = function (k) {
    var d = this.days[k];
    if (d) return d;
    // A screen needs a few days; next() above the Arctic Circle may walk a
    // whole polar night. Past that the table starts again.
    if (this.dayCount > 800) { this.days = {}; this.dayCount = 0; }
    var mean = k * DAY + this.noonOffset;
    var noon = hourAngleTime(this.lon, mean, 0);
    var mid = hourAngleTime(this.lon, mean + DAY / 2, 180);
    d = { k: k, noon: noon, altNoon: this.alt(noon), mid: mid, altMid: this.alt(mid), rise: undefined, set: undefined };
    this.days[k] = d;
    this.dayCount++;
    return d;
  };
  // The crossing of H0 between a and b, where the altitude is on opposite
  // sides at the two ends. Bisection: it cannot step outside the bracket and
  // does not care how flat the curve is near the pole.
  Place.prototype.cross = function (a, b) {
    var fa = this.alt(a) - H0;
    while (b - a > 20) {
      var m = (a + b) / 2, fm = this.alt(m) - H0;
      if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else { b = m; }
    }
    return Math.round((a + b) / 2);
  };
  Place.prototype.rise = function (k) {           // the sunrise of solar day k, or null
    var d = this.day(k);
    if (d.rise === undefined) {
      var p = this.day(k - 1);
      d.rise = (p.altMid < H0 && d.altNoon > H0) ? this.cross(p.mid, d.noon) : null;
    }
    return d.rise;
  };
  Place.prototype.set = function (k) {            // the sunset of solar day k, or null
    var d = this.day(k);
    if (d.set === undefined) d.set = (d.altNoon > H0 && d.altMid < H0) ? this.cross(d.noon, d.mid) : null;
    return d.set;
  };

  // The half-day around ms: { from, to, rising, k } — rising means mid(k-1) to
  // noon(k), otherwise noon(k) to mid(k).
  function halfDayAt(p, ms) {
    var k = p.dayIndex(ms);
    for (var j = k - 1; j <= k + 1; j++) {
      var prevMid = p.day(j - 1).mid, d = p.day(j);
      if (ms >= prevMid && ms < d.noon) return { k: j, rising: true, from: prevMid, to: d.noon };
      if (ms >= d.noon && ms < d.mid) return { k: j, rising: false, from: d.noon, to: d.mid };
    }
    return null;   // not reachable: the halves tile the time line
  }
  function crossingOf(p, h) { return h.rising ? p.rise(h.k) : p.set(h.k); }
  function nextHalf(h) { return h.rising ? { k: h.k, rising: false } : { k: h.k + 1, rising: true }; }

  function isDayAt(p, ms) {
    var h = halfDayAt(p, ms);
    if (!h) return p.alt(ms) > H0;
    var c = crossingOf(p, h);
    if (c === null) return p.alt(h.from) > H0;           // no crossing: one state all through
    return h.rising ? ms >= c : ms < c;
  }

  function nextSwitch(p, ms) {
    var h = halfDayAt(p, ms);
    if (!h) return null;
    for (var i = 0; i < SEARCH_DAYS * 2; i++) {
      var c = crossingOf(p, h);
      if (c !== null && c > ms) return { at: c, kind: h.rising ? 'sunrise' : 'sunset', isDay: h.rising };
      h = nextHalf(h);
    }
    return null;
  }

  function eventsBetween(p, from, to) {
    var out = [];
    for (var k = p.dayIndex(from) - 1; k <= p.dayIndex(to) + 1; k++) {
      var r = p.rise(k), s = p.set(k);
      if (r !== null && r >= from && r < to) out.push({ at: r, kind: 'sunrise', isDay: true });
      if (s !== null && s >= from && s < to) out.push({ at: s, kind: 'sunset', isDay: false });
    }
    return out;
  }

  // ── 3. THE AIRPORT'S LOCAL DAY ─────────────────────────────────────────────
  // Used only to choose WHICH solar day times() reports. Solar day k has its
  // mean noon on calendar day k at that longitude, so the airport's calendar
  // date IS the solar day's index: the board's own zoned-date helper
  // (FIDSGateDate.zonedDateOrdinal, gate-date-context.js, loaded before this
  // file) gives it. With no time zone, or no helper, the longitude's own solar
  // date stands in.
  var _dates = null;
  function datesHelper() {
    if (root && root.FIDSGateDate) return root.FIDSGateDate;
    if (_dates === null) {
      _dates = false;
      try { if (typeof require === 'function') _dates = require('./gate-date-context.js'); } catch (e) { _dates = false; }
    }
    return _dates || null;
  }
  function localDayNumber(p, ms) {
    var n = null;
    if (p.tz) {
      try { var D = datesHelper(); if (D && D.zonedDateOrdinal) n = D.zonedDateOrdinal(ms, p.tz); } catch (e) { n = null; }
    }
    return (typeof n === 'number' && isFinite(n)) ? n : Math.floor((ms + p.lon / 15 * HOUR) / DAY);
  }
  function ymd(dayNumber) {
    var d = new Date(dayNumber * DAY);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function timesAt(p, ms) {
    var k = localDayNumber(p, ms);
    var d = p.day(k), r = p.rise(k), s = p.set(k);
    var polar = null;
    if (r === null && s === null) polar = d.altNoon > H0 ? 'day' : 'night';
    return { date: ymd(k), sunrise: r, sunset: s, solarNoon: Math.round(d.noon), polar: polar };
  }

  // ── 4. ONE ENGINE PER PAGE ─────────────────────────────────────────────────
  function parseOverride(search) {
    var m = /[?&]daynight=(day|night|light|dark)(?:&|#|$)/i.exec(String(search || ''));
    if (!m) return null;
    var v = m[1].toLowerCase();
    return (v === 'day' || v === 'light') ? 'day' : 'night';
  }
  function validCoords(c) {
    if (!c) return null;
    var lat = Number(c.lat != null ? c.lat : c[0]), lon = Number(c.lon != null ? c.lon : (c.lng != null ? c.lng : c[1]));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [lat, lon];
  }

  function create(env) {
    env = env || {};
    var now = env.now || function () { return Date.now(); };
    var log = env.log || function () {};
    var override = parseOverride(env.search ? env.search() : '');
    var places = {}, placeCount = 0;
    var watchers = {};
    var beat = null, lastBeat = null, listening = false;
    var doc = { src: null, code: null, unsub: null, ready: false, state: null };

    function placeFor(where) {
      if (where == null || where === '') return null;
      var code = '', c = null, tz = null;
      if (typeof where === 'object') {
        c = validCoords(where);
        tz = where.tz || null;
        code = where.code || where.iata || '';
      } else {
        code = String(where).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!code) return null;
        if (places['@' + code]) return places['@' + code];
        try { c = validCoords(env.coords ? env.coords(code) : null); } catch (e) { c = null; }
        try { tz = env.tz ? env.tz(code) : null; } catch (e) { tz = null; }
      }
      if (!c) return null;                       // unknown for now; asked again next time
      var key = code ? '@' + code : c[0] + ',' + c[1] + ',' + (tz || '');
      if (places[key]) return places[key];
      if (placeCount > 256) { places = {}; placeCount = 0; }
      placeCount++;
      return (places[key] = new Place(c[0], c[1], tz, code));
    }
    function at(ms) { return ms == null ? now() : Number(ms); }

    var api = {
      version: VERSION,
      override: override,
      HEARTBEAT_MS: HEARTBEAT_MS,
      times: function (where, ms) { var p = placeFor(where); return p ? timesAt(p, at(ms)) : null; },
      isDay: function (where, ms) {
        if (override) return override === 'day';
        var p = placeFor(where);
        return p ? isDayAt(p, at(ms)) : null;
      },
      next: function (where, ms) { var p = placeFor(where); return p ? nextSwitch(p, at(ms)) : null; },
      events: function (where, from, to) { var p = placeFor(where); return p ? eventsBetween(p, Number(from), Number(to)) : null; },
      altitude: function (where, ms) { var p = placeFor(where); return p ? p.alt(at(ms)) : null; },
      subscribe: subscribe,
      bindDocument: bindDocument,
      check: function (why) { checkAll(why || 'manual'); },
      compareMet: compareMet
    };

    // ── watchers: one per airport, shared by its subscribers ──
    function watcherFor(where) {
      var key = (typeof where === 'object' && where)
        ? 'pt:' + JSON.stringify(validCoords(where)) + ':' + (where.tz || '')
        : 'ap:' + String(where).toUpperCase().replace(/[^A-Z0-9]/g, '');
      var w = watchers[key];
      if (!w) {
        w = watchers[key] = { key: key, where: where, code: typeof where === 'object' ? (where.code || where.iata || '') : key.slice(3), place: null, state: null, subs: [], timer: null, next: null, since: null };
      }
      return w;
    }
    function notify(w, fn, why, prev) {
      try {
        fn(w.state, { iata: w.code, isDay: w.state, at: w.since, why: why, previous: prev, source: override ? 'override' : 'sun', next: w.next });
      } catch (e) { log('[fidsSun] subscriber failed', e && e.message); }
    }
    function check(w, why) {
      if (!w.place) w.place = placeFor(w.where);
      var t = now();
      var s = override ? (override === 'day') : (w.place ? isDayAt(w.place, t) : null);
      arm(w, t);                                  // first, so a subscriber sees the next switch
      if (s !== null && s !== w.state) {
        var prev = w.state;
        w.state = s; w.since = t;
        var subs = w.subs.slice();
        for (var i = 0; i < subs.length; i++) notify(w, subs[i], why, prev);
      }
    }
    function arm(w, t) {
      if (w.timer != null && env.clearTimeout) env.clearTimeout(w.timer);
      w.timer = null;
      if (override || !w.place || !env.setTimeout) { w.next = null; return; }
      // The next switch after t is the one found earlier from w.nextFrom, as
      // long as the clock has not gone back past where it was found and the
      // switch is still ahead. Otherwise (and after any switch) it is found
      // again.
      var n = (w.next && w.nextFrom != null && w.nextFrom <= t && w.next.at > t) ? w.next : nextSwitch(w.place, t);
      if (n !== w.next) w.nextFrom = t;
      w.next = n;
      var delay = n ? n.at - t + SLACK_MS : MAX_DELAY_MS;
      delay = Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, delay));
      w.timer = env.setTimeout(function () { w.timer = null; check(w, 'timer'); }, delay);
    }
    function checkAll(why) {
      for (var k in watchers) if (watchers.hasOwnProperty(k)) check(watchers[k], why);
      docCheck(why);
    }
    function heartbeat() {
      var t = now(), m = env.mono ? env.mono() : null;
      if (lastBeat && m !== null) {
        var drift = (t - lastBeat.wall) - (m - lastBeat.mono);
        if (Math.abs(drift) > 5000) log('[fidsSun] wall clock and timers disagree by ' + Math.round(drift / 1000) + ' s (sleep, a frozen tab or a clock change): re-checked');
      }
      lastBeat = { wall: t, mono: m };
      checkAll('heartbeat');
    }
    function startBeat() {
      if (beat == null && env.setInterval) {
        lastBeat = { wall: now(), mono: env.mono ? env.mono() : null };
        beat = env.setInterval(heartbeat, HEARTBEAT_MS);
      }
      if (!listening && env.on) {
        listening = true;
        env.on('visibilitychange', function () { if (!env.visible || env.visible()) checkAll('visible'); });
        ['online', 'focus', 'pageshow', 'resume'].forEach(function (type) {
          env.on(type, function () { checkAll(type); });
        });
      }
    }
    function stopBeatIfIdle() {
      for (var k in watchers) if (watchers.hasOwnProperty(k)) return;
      if (doc.src) return;
      if (beat != null && env.clearInterval) env.clearInterval(beat);
      beat = null;
    }

    function subscribe(where, fn) {
      if (typeof fn !== 'function' || where == null || where === '') return function () {};
      var w = watcherFor(where);
      w.subs.push(fn);
      startBeat();
      if (w.state !== null) notify(w, fn, 'subscribe', null);
      else check(w, 'subscribe');               // notifies every subscriber once the state is known
      return function unsubscribe() {
        var i = w.subs.indexOf(fn);
        if (i >= 0) w.subs.splice(i, 1);
        if (!w.subs.length && watchers[w.key] === w) {
          if (w.timer != null && env.clearTimeout) env.clearTimeout(w.timer);
          w.timer = null;
          delete watchers[w.key];
          stopBeatIfIdle();
        }
      };
    }

    // ── the page: <html> classes for the board's own airport ──
    function docCode() {
      var v = '';
      try { v = typeof doc.src === 'function' ? doc.src() : doc.src; } catch (e) { v = ''; }
      return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    function docCheck() {
      if (!doc.src) return;
      var code = docCode();
      if (code === doc.code) return;
      if (doc.unsub) doc.unsub();
      doc.unsub = null;
      doc.code = code;
      if (code) doc.unsub = subscribe(code, applyDoc);
    }
    function applyDoc(isDay, info) {
      var el = env.root ? env.root() : null;
      if (!el) return;
      var was = doc.state;
      doc.state = isDay;
      try {
        el.classList.toggle('fids-day', isDay);
        el.classList.toggle('fids-night', !isDay);
        el.setAttribute('data-daynight', isDay ? 'day' : 'night');
        el.setAttribute('data-daynight-airport', info.iata || '');
        el.setAttribute('data-daynight-source', override ? 'override' : 'sun');
      } catch (e) {}
      if (!doc.ready) {
        doc.ready = true;
        // After the first state has been painted, never with it: a crossfade
        // keyed on fids-dn-ready cannot run at boot.
        var ready = function () { try { el.classList.add('fids-dn-ready'); } catch (e) {} };
        if (env.afterPaint) env.afterPaint(ready); else if (env.setTimeout) env.setTimeout(ready, 0); else ready();
      }
      if (was !== null && was !== isDay) {
        log('[fidsSun] ' + (info.iata || '') + ' ' + (isDay ? 'day' : 'night') + ' from ' + new Date(info.at).toISOString()
          + (info.source === 'override' ? ' (override)' : ''));
      }
      try { if (env.emit) env.emit('fids-daynight', { iata: info.iata, isDay: isDay, at: info.at, source: info.source, next: info.next }); } catch (e) {}
    }
    function bindDocument(src) {
      if (doc.unsub) doc.unsub();
      doc.unsub = null; doc.code = null; doc.src = src || null;
      if (doc.src) startBeat();
      docCheck('bind');
      return api;
    }

    // ── MET Norway, for comparison only ──
    // The weather card fetches MET's times through /wxsun into window._wxSun.
    // This reads that cache — it never fetches — and says how far apart the
    // two answers are, in minutes.
    function compareMet(where, ms) {
      var p = placeFor(where);
      if (!p || !env.metSun) return null;
      var mine = timesAt(p, at(ms));
      var met = null;
      try { met = env.metSun(p.code, mine.date); } catch (e) { met = null; }
      if (!met) return null;
      var diff = function (a, b) { var x = Date.parse(b); return (a != null && isFinite(x)) ? Math.round((a - x) / 6000) / 10 : null; };
      return { date: mine.date, sunrise: diff(mine.sunrise, met.sunrise), sunset: diff(mine.sunset, met.sunset) };
    }

    return api;
  }

  // ── 5. THE BROWSER ─────────────────────────────────────────────────────────
  // Coordinates: the board's COORDS (the fullest table, every live airport),
  // then airport-coords.js, then the gate map's GATE_AP and its saved lookups.
  function boardCoords(code) {
    try { if (typeof COORDS !== 'undefined' && COORDS[code]) return COORDS[code]; } catch (e) {}
    try { if (root.AIRPORT_COORDS && root.AIRPORT_COORDS[code]) return root.AIRPORT_COORDS[code]; } catch (e) {}
    try { if (typeof GATE_AP !== 'undefined' && GATE_AP[code]) return GATE_AP[code]; } catch (e) {}
    try { if (typeof _lookupAirport === 'function') return _lookupAirport(code) || null; } catch (e) {}
    return null;
  }
  function boardTz(code) {
    try { if (typeof AP !== 'undefined' && AP[code] && AP[code].tz) return AP[code].tz; } catch (e) {}
    return null;
  }
  // The board's own airport, as the board resolves it: the airport input the
  // core keeps canonical, then ?ap=, then the session's airport.
  function boardAirport() {
    try { var el = root.document.getElementById('apSel'); if (el && el.value) return el.value; } catch (e) {}
    try { var ap = new URLSearchParams(root.location.search).get('ap'); if (ap) return ap; } catch (e) {}
    try { var s = root.sessionStorage.getItem('fids_airport'); if (s) return s; } catch (e) {}
    try { if (root.__ocFromHost) return root.__ocFromHost; } catch (e) {}
    return '';
  }
  function browserEnv(w) {
    var d = w.document;
    return {
      now: function () { return Date.now(); },
      mono: function () { try { return w.performance.now(); } catch (e) { return null; } },
      setTimeout: function (fn, ms) { return w.setTimeout(fn, ms); },
      clearTimeout: function (id) { w.clearTimeout(id); },
      setInterval: function (fn, ms) { return w.setInterval(fn, ms); },
      clearInterval: function (id) { w.clearInterval(id); },
      on: function (type, fn) {
        try { (type === 'visibilitychange' || type === 'resume' ? d : w).addEventListener(type, fn); } catch (e) {}
      },
      visible: function () { try { return d.visibilityState !== 'hidden'; } catch (e) { return true; } },
      search: function () { try { return w.location.search; } catch (e) { return ''; } },
      root: function () { return d.documentElement; },
      afterPaint: function (fn) {
        try { w.requestAnimationFrame(function () { w.requestAnimationFrame(fn); }); } catch (e) { w.setTimeout(fn, 50); }
      },
      emit: function (type, detail) {
        try { w.dispatchEvent(new w.CustomEvent(type, { detail: detail })); } catch (e) {}
      },
      coords: boardCoords,
      tz: boardTz,
      metSun: function (code, date) {
        var hit = w._wxSun && w._wxSun[code + '|' + date];
        return hit && hit.data && hit.data.sunrise ? hit.data : null;
      },
      log: function () { try { w.console.log.apply(w.console, arguments); } catch (e) {} }
    };
  }

  var FidsSun = {
    VERSION: VERSION,
    H0: H0,
    HEARTBEAT_MS: HEARTBEAT_MS,
    create: create,
    solar: solar,
    altitude: altitude,
    parseOverride: parseOverride,
    browserEnv: browserEnv
  };

  if (typeof module === 'object' && module.exports) module.exports = FidsSun;
  if (root && root.document && root.document.documentElement) {
    root.FidsSun = FidsSun;
    if (!root.fidsSun) {
      root.fidsSun = create(browserEnv(root));
      var bind = function () { try { root.fidsSun.bindDocument(boardAirport); } catch (e) {} };
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bind);
      else bind();
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
