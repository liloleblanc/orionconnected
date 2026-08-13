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
    getFlightDateContext: getFlightDateContext
  };
});
