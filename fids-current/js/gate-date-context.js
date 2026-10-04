/* Gate-flight calendar context. Dependency-free for browser and Node tests. */
(function (root, factory) {
  // The words and the language rules come from the one store,
  // board-strings.js, which every page loads first.
  var strings = (root && root.BoardStrings) || (typeof require === 'function' ? require('./board-strings.js') : null);
  var api = factory(strings);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FIDSGateDate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Strings) {
  'use strict';

  var DAY_MS = 86400000;

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

  // The pair a gate shows: BoardStrings.pairLangs, the one picker.
  function selectedLanguages(languages, frenchFirst) {
    var list = Array.isArray(languages) && languages.length ? languages : ['en', 'fr'];
    var result = Strings.pairLangs(list, !!frenchFirst);
    return result.length ? result : ['en'];
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

  // ── THE DAY A GATE TIME IS ON, WHEN IT IS NOT TODAY ──────────────────────
  //
  // A gate shows its next flight, and once tonight's has gone that is often
  // tomorrow's. A time alone cannot say which day it belongs to: tomorrow's
  // 6:15pm under a banner reading today's date reads as tonight's flight, still
  // "On Time" hours after it left. So a time that is not on the board's today
  // carries the day beside it, in the board's languages:
  //
  //   the next day          Tomorrow | Demain        (Demain | Tomorrow in Québec)
  //   two or more days on   Sun, Oct 4 | dim. 4 oct.
  //   today, or earlier     nothing
  //
  // Earlier days get nothing on purpose: a flight from before midnight that is
  // still at its door is tonight's flight to the people standing there.
  //
  // The flight's calendar day is read in the zone its time is PRINTED in
  // (timeZone); "today" is the board's own (nowTimeZone, defaulting to the
  // same zone). An arrival printed in Calgary time on a Moncton board is
  // "tomorrow" when it lands on Moncton's tomorrow's date in Calgary.
  function getFlightDayWords(options) {
    options = options || {};
    var ts = Number(options.timestamp);
    var now = options.nowTimestamp == null ? Date.now() : Number(options.nowTimestamp);
    var empty = { dayOffset: null, words: [], text: '' };
    if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(now)) return empty;
    var flightDay = zonedDateOrdinal(ts, options.timeZone);
    var today = zonedDateOrdinal(now, options.nowTimeZone || options.timeZone);
    if (flightDay === null || today === null) return empty;
    var offset = flightDay - today;
    if (offset < 1) return { dayOffset: offset, words: [], text: '' };
    var zone = validTimeZone(options.timeZone);
    var seen = Object.create(null), words = [];
    selectedLanguages(options.languages, options.frenchFirst).forEach(function (language) {
      var word = offset === 1
        ? Strings.bs('tomorrow', language)
        : Strings.date(ts, language, { weekday: 'short', month: 'short', day: 'numeric' }, zone);
      if (!word || seen[word.toLowerCase()]) return;
      seen[word.toLowerCase()] = true;
      words.push(word);
    });
    return { dayOffset: offset, words: words, text: words.join(' | ') };
  }

  return {
    zonedDateOrdinal: zonedDateOrdinal,
    dayOffset: dayOffset,
    flightClock: flightClock,
    getFlightDayWords: getFlightDayWords
  };
});
