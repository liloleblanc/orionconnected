/* Gate-flight calendar context. Dependency-free for browser and Node tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FIDSGateDate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY_MS = 86400000;
  var LOCALES = {
    en: 'en-CA', fr: 'fr-CA', es: 'es', de: 'de', it: 'it', pt: 'pt',
    ja: 'ja', zh: 'zh', ar: 'ar'
  };
  var TOMORROW = {
    en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Morgen', it: 'Domani',
    pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا'
  };
  var YESTERDAY = {
    en: 'Yesterday', fr: 'Hier', es: 'Ayer', de: 'Gestern', it: 'Ieri',
    pt: 'Ontem', ja: '昨日', zh: '昨天', ar: 'أمس'
  };

  function validTimeZone(timeZone) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC' }).format(0);
      return timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  }

  function zonedDateOrdinal(timestamp, timeZone) {
    var value = Number(timestamp);
    if (!Number.isFinite(value)) return null;
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: validTimeZone(timeZone),
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(value));
    var values = {};
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'literal') values[parts[i].type] = Number(parts[i].value);
    }
    if (!values.year || !values.month || !values.day) return null;
    return Math.floor(Date.UTC(values.year, values.month - 1, values.day) / DAY_MS);
  }

  function dayOffset(flightTimestamp, nowTimestamp, timeZone) {
    var flightDay = zonedDateOrdinal(flightTimestamp, timeZone);
    var currentDay = zonedDateOrdinal(nowTimestamp, timeZone);
    if (flightDay === null || currentDay === null) return null;
    return flightDay - currentDay;
  }

  function selectedLanguages(languages, frenchFirst) {
    var picked = Array.isArray(languages) && languages.length ? languages.slice() : ['en', 'fr'];
    if (frenchFirst) {
      var frIndex = picked.indexOf('fr');
      if (frIndex > 0) {
        picked.splice(frIndex, 1);
        picked.unshift('fr');
      }
    }
    var seen = Object.create(null), result = [];
    for (var i = 0; i < picked.length && result.length < 2; i++) {
      var language = String(picked[i] || '').toLowerCase();
      if (!LOCALES[language] || seen[language]) continue;
      seen[language] = true;
      result.push(language);
    }
    return result.length ? result : ['en'];
  }

  function labelFor(timestamp, offset, timeZone, language) {
    var locale = LOCALES[language] || LOCALES.en;
    var date = new Date(Number(timestamp));
    var prefix;
    if (offset === 1) prefix = TOMORROW[language] || TOMORROW.en;
    else if (offset === -1) prefix = YESTERDAY[language] || YESTERDAY.en;
    else {
      prefix = new Intl.DateTimeFormat(locale, {
        timeZone: validTimeZone(timeZone), weekday: 'long'
      }).format(date);
      if (prefix) prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    var calendarDate = new Intl.DateTimeFormat(locale, {
      timeZone: validTimeZone(timeZone), month: 'short', day: 'numeric'
    }).format(date);
    return prefix + ' · ' + calendarDate;
  }

  // ── THE ONE PLACE A FLIGHT TIME BECOMES TEXT ────────────────────────────
  //
  // Aviation keeps one clock — UTC — and converts at the station. This follows
  // that: an absolute instant goes in, the station's zone goes in beside it,
  // and the airport's wall clock comes out. A board in Toronto and a board in
  // the terminal render the same string for the same flight, because neither
  // one's host clock is consulted.
  //
  // The failure this exists to prevent: `new Date(s).toLocaleTimeString()` with
  // no timeZone renders in whatever zone the MACHINE is set to. The same
  // Moncton 17:20 departure reads 5:20 PM in Moncton, 4:20 PM in Toronto and
  // 8:20 PM on a UTC host. Measured live, on the deployed board.
  //
  // `timeZone` is not optional. Omitting it does not throw — a throw here
  // blanks a live board — so the result reports `zoneAssumed` instead, and a
  // guard test fails the build when any call site leaves it off.
  //
  // The day marker is unconditional by design. A time alone cannot say which
  // day it belongs to, and a board showing tomorrow's 11:15 AM beside a clock
  // reading 3:08 PM reads as an hour already missed.
  function flightClock(options) {
    options = options || {};

    // An instant, however it arrives: epoch ms, or a string carrying its own
    // offset. A BARE wall clock is refused rather than guessed at — without an
    // offset there is no instant, only a reading, and guessing which zone it
    // was read in is how this class of bug starts.
    var stamp = options.timestamp;
    var instant = null;
    if (typeof stamp === 'number' && Number.isFinite(stamp)) instant = stamp;
    else if (typeof stamp === 'string' && /[Zz]|[+-]\d{2}:?\d{2}$/.test(stamp.trim())) {
      var parsed = Date.parse(stamp.trim().replace(' ', 'T'));
      if (!isNaN(parsed)) instant = parsed;
    }
    if (instant === null) {
      return { time: '', marker: '', text: '', html: '', dayOffset: null,
               zoneAssumed: false, ok: false };
    }

    var zoneGiven = !!options.timeZone;
    var zone = validTimeZone(options.timeZone);
    var now = options.nowTimestamp == null ? Date.now() : Number(options.nowTimestamp);

    var time = new Intl.DateTimeFormat(options.locale || 'en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: options.hour12 === undefined ? true : !!options.hour12
    }).format(new Date(instant));

    // Offset against the AIRPORT's today, never the viewer's. A board in Sydney
    // showing Moncton must still say "tomorrow" by Moncton's calendar.
    var offset = dayOffset(instant, now, zone);
    var marker = (offset === null || offset === 0) ? ''
      : (offset > 0 ? '+' + offset : String(offset));

    return {
      time: time,
      marker: marker,
      text: time + marker,
      // Bold, and its own element, so a board can style or size the marker
      // without reaching into the time itself.
      html: marker
        ? time + '<b class="fids-dayoff">' + marker + '</b>'
        : time,
      dayOffset: offset,
      zoneAssumed: !zoneGiven,
      ok: true
    };
  }

  function getFlightDateContext(options) {
    options = options || {};
    var flightTimestamp = Number(options.flightTimestamp);
    var nowTimestamp = options.nowTimestamp == null ? Date.now() : Number(options.nowTimestamp);
    var offset = dayOffset(flightTimestamp, nowTimestamp, options.timeZone);
    if (offset === null || offset === 0) return { dayOffset: offset, labels: [], text: '' };
    var picked = selectedLanguages(options.languages, options.frenchFirst);
    var labels = picked.map(function (language) {
      return labelFor(flightTimestamp, offset, options.timeZone, language);
    });
    return { dayOffset: offset, labels: labels, text: labels.join(' | ') };
  }

  return {
    zonedDateOrdinal: zonedDateOrdinal,
    dayOffset: dayOffset,
    flightClock: flightClock,
    getFlightDateContext: getFlightDateContext
  };
});
