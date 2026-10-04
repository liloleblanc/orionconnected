/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   BOARD STRINGS — THE ONE STORE FOR EVERY WORD A PASSENGER CAN READ.

   Every passenger surface (gate, departures, arrivals, baggage, the weather
   and heritage cards, ads, loaders, empty and error panels, the phone layout
   and the Studio player) speaks the nine board languages:

       en  fr  es  de  it  pt  ja  zh  ar

   This file holds:
     LANGS       the only copy of that list
     META        per-language settings: direction, Intl locale, 24-hour clock
     FR_FIRST    the only list of Québec airports (French leads there)
     STR         one entry per phrase, each carrying all nine languages
     LISTS       per-language lists of equal length (tickers)
   and the only helpers that may index an entry by language.

   The rule, enforced by tests/board-languages.test.js on every pull request:
   a new passenger word goes into STR with all nine values and is rendered
   with bs()/bsPair(). The older tables in fids-core.js are frozen; their
   helpers fall through to STR. See docs/BOARD-LANGUAGES.md.

   Dependency-free UMD, like gate-date-context.js, so Node tests require() it
   instead of slicing source. Loaded FIRST by every passenger page, before the
   inline loader script, so the loader greets in the board's own languages.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.BoardStrings = api;
    root.BOARD_STR = api.STR;
    root.bs = api.bs;
    root.bsFmt = api.fmt;
    root.bsPair = api.pair;
    root.bsHalf = api.half;
    root.bsPairLangs = api.pairLangs;
    root.bsList = api.list;
    root.bsTime = api.time;
    root.bsWeekday = api.weekday;
    root.bsDate = api.date;
    root.bsResolveLangs = api.resolveLangs;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── THE NINE ────────────────────────────────────────────────────────────
  var LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar'];

  // dir     reading direction of a half
  // intl    the Intl locale for dates and weekday names
  // clock24 the language reads times as 17:35 (true) or 5:35pm (false).
  //         Arabic joined the 24-hour languages here: it was the one language
  //         left out of both 24-hour lists, so an Arabic half printed 5:07pm
  //         beside a Japanese 17:07.
  // colon   the label-to-value colon in that language's typography
  // script  the script a value must contain (the guard checks ja/zh/ar)
  var META = {
    en: { dir: 'ltr', intl: 'en-CA', clock24: false, colon: ': ',  script: 'latin', name: 'English' },
    fr: { dir: 'ltr', intl: 'fr-CA', clock24: true,  colon: ' : ', script: 'latin', name: 'Français' },
    es: { dir: 'ltr', intl: 'es',    clock24: true,  colon: ': ',  script: 'latin', name: 'Español' },
    de: { dir: 'ltr', intl: 'de',    clock24: true,  colon: ': ',  script: 'latin', name: 'Deutsch' },
    it: { dir: 'ltr', intl: 'it',    clock24: true,  colon: ': ',  script: 'latin', name: 'Italiano' },
    pt: { dir: 'ltr', intl: 'pt',    clock24: true,  colon: ': ',  script: 'latin', name: 'Português' },
    ja: { dir: 'ltr', intl: 'ja',    clock24: true,  colon: '：',  script: 'jpan',  name: '日本語' },
    zh: { dir: 'ltr', intl: 'zh',    clock24: true,  colon: '：',  script: 'hans',  name: '中文' },
    ar: { dir: 'rtl', intl: 'ar',    clock24: true,  colon: ': ',  script: 'arab',  name: 'العربية' }
  };

  // ── FRENCH FIRST IN QUÉBEC ──────────────────────────────────────────────
  // The only list. frFirstAirport() in fids-core.js asks this, and the
  // per-airport defaults below are derived from it, so a Québec airport can
  // no longer lead in French on its gate and in English on its departures
  // board (Saint-Hubert did).
  //
  // The rule, applied by resolveLangs() and pairLangs(): at one of these
  // airports French leads IF it is selected. It is never added when it is not.
  var FR_FIRST = ['YUL', 'YQB', 'YHU', 'YMX', 'YMY', 'YBG', 'YVO', 'YZV', 'YUY',
    'YGP', 'YGL', 'YGW', 'YKQ', 'YPX', 'YVP', 'YHR', 'YNA', 'YBC', 'YTF', 'AKV',
    'YIK', 'YZG', 'YQC', 'YHA', 'YKG', 'XGR'];
  var _frFirstSet = Object.create(null);
  FR_FIRST.forEach(function (c) { _frFirstSet[c] = true; });

  // ── PER-AIRPORT DEFAULT LANGUAGES ───────────────────────────────────────
  // What a board speaks when no URL, saved choice or configuration says
  // otherwise. Québec airports are not listed: they are derived from
  // FR_FIRST above. The rest of the table, and why each row exists, is
  // unchanged from fids-core.js (v23076 Orlando, v23247 Miami, v23317 the
  // tour stops); OGG stays on the plain default.
  var LANG_DEFAULTS = {
    MCO: ['en', 'es'], MIA: ['en', 'es'], FLL: ['en', 'es'], TPA: ['en', 'es'],
    ATL: ['en', 'es'], JFK: ['en', 'es'], BOS: ['en', 'es'], ORD: ['en', 'es'],
    DFW: ['en', 'es'], LAX: ['en', 'es'], SFO: ['en', 'es'], SEA: ['en', 'es'],
    CUN: ['en', 'es'], SJU: ['en', 'es']
  };
  // Spanish-speaking airports (the Bolivia network). fids-core.js also reads
  // this set for units (boardMetricFor), which is why it is a list of
  // airports and not just rows in the table above.
  var ES_AIRPORTS = ['LPB', 'VVI', 'CBB', 'SRZ', 'UYU', 'TJA', 'SRE', 'POI', 'TDD',
    'CIJ', 'RIB', 'GYA', 'BVL'];

  // ━━ THE STRINGS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // One entry per phrase. Every entry has all nine languages as plain string
  // literals (never expressions), so the guard can read them soundly.
  //
  // Optional metadata keys start with '$':
  //   $src   where each language's wording comes from:
  //            'airline:XX' / 'gov:XX'  the airline's or government's own
  //                                     published words (URL in a comment)
  //            'house'                  our own original wording
  //            'careful'                our own careful translation
  //          Required for pre-boarding, travel-document, loyalty and cabin
  //          wording. ?i18n=provenance (localhost only) outlines every
  //          'careful' string on screen with a small ≈.
  //   $slot  the fixed-width slot it is fitted into (the render check forces
  //          it there in all nine languages)
  //   $ctx   separates two meanings of one English phrase
  //
  // If the English already exists on a screen, reuse that key, or its exact
  // translations: the guard fails two different translations of one phrase.
  var STR = {
    // ── DAYS ──
    // The gate's day line (gate-date-context.js getFlightDayWords) and the
    // weather strips. Moved here from TOMORROW and LS.tomorrow, which held
    // the same nine words twice.
    tomorrow: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Morgen', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' }
  };

  // Lists: per language, equal length. Tickers.
  var LISTS = {};

  // ━━ HELPERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  var _warned = Object.create(null);
  var api = {
    LANGS: LANGS, META: META, FR_FIRST: FR_FIRST, LANG_DEFAULTS: LANG_DEFAULTS,
    ES_AIRPORTS: ES_AIRPORTS, STR: STR, LISTS: LISTS,
    strict: false, misses: []
  };

  function isLang(l) { return Object.prototype.hasOwnProperty.call(META, l); }

  function boardLangs() {
    try {
      // `langs` is the board's own top-level binding in fids-core.js; it is
      // read at call time, so this works whichever script loaded first.
      // eslint-disable-next-line no-undef
      if (typeof langs !== 'undefined' && Array.isArray(langs) && langs.length) return langs;
    } catch (e) {}
    return null;
  }
  function boardLang() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof lang !== 'undefined' && isLang(lang)) return lang;
    } catch (e) {}
    var L = boardLangs();
    return L ? L[0] : 'en';
  }

  function miss(key, lang) {
    var id = key + '/' + lang;
    if (api.strict) {
      api.misses.push(id);
      throw new Error('board-strings: no "' + lang + '" for "' + key + '"');
    }
    if (!_warned[id]) {
      _warned[id] = true;
      try { console.warn('[board-strings] missing ' + id); } catch (e) {}
    }
  }

  function entry(key) {
    return Object.prototype.hasOwnProperty.call(STR, key) ? STR[key] : null;
  }

  // One language. A missing key or language gives '' — never the key name,
  // which is what the old TL() printed on screen ('greenKey').
  function bs(key, lang) {
    var e = entry(key);
    var l = lang || boardLang();
    if (!e) { miss(key, l); return ''; }
    var v = e[l];
    if (typeof v !== 'string' || !v) { miss(key, l); return ''; }
    return v;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Placeholders {FLIGHT}, {GATE}… filled with HTML-escaped values. Pass
  // raw:true when a field is already markup the caller built.
  function fill(s, fields, raw) {
    if (!fields || !s) return s;
    return String(s).replace(/\{([A-Za-z0-9_]+)\}/g, function (m, f) {
      if (!Object.prototype.hasOwnProperty.call(fields, f)) return m;
      return raw ? String(fields[f]) : esc(fields[f]);
    });
  }
  function fmt(key, lang, fields, raw) { return fill(bs(key, lang), fields, raw); }

  function isFrFirst(iata) { return !!_frFirstSet[String(iata || '').toUpperCase()]; }

  function cleanList(list) {
    var out = [], seen = Object.create(null);
    (Array.isArray(list) ? list : []).forEach(function (l) {
      var k = String(l || '').toLowerCase();
      if (isLang(k) && !seen[k]) { seen[k] = true; out.push(k); }
    });
    return out;
  }

  // Québec rule over a whole list: French to the front when it is there.
  function frenchFirst(list, iataOrFlag) {
    var on = (iataOrFlag === true) || (typeof iataOrFlag === 'string' && isFrFirst(iataOrFlag));
    if (!on) return list;
    var i = list.indexOf('fr');
    if (i > 0) { list = list.slice(); list.splice(i, 1); list.unshift('fr'); }
    return list;
  }

  // The one or two languages a pair shows: the board's languages with French
  // moved to the front at a Québec airport if (and only if) it is selected,
  // then the first two. Replaces every langs.slice(0, 2) and every private
  // picker inside _gateLbl, _gateLaneLbl, _wxPair and selectedLanguages (the
  // gate's labels took the first two and then reordered, while its day line
  // reordered and then took two, so the two could disagree).
  function pairLangs(list, iataOrFlag) {
    var L = cleanList(list || boardLangs());
    if (!L.length) L = ['en', 'fr'];
    return frenchFirst(L, iataOrFlag).slice(0, 2);
  }

  // One language half of a pair: lang + direction + bidi isolation, so an
  // Arabic half holding a Latin city reads right to left (Calgary من) and two
  // halves never reorder each other.
  function half(lang, html, cls, extra) {
    var m = META[lang] || META.en;
    var e = entry(extra && extra.key);
    var src = e && e.$src && e.$src[lang];
    return '<span class="bs-h' + (cls ? ' ' + cls : '') + '" lang="' + (isLang(lang) ? lang : 'en') + '"'
      + (m.dir === 'rtl' ? ' dir="rtl"' : '')
      + (src === 'careful' ? ' data-i18n-src="careful"' : '')
      + '>' + html + '</span>';
  }

  var SEP_HTML = ' <span class="bs-sep">|</span> ';

  // The one-line Label | Label pair.
  //   o.langs     the board's languages (default: the board's own)
  //   o.frFirst   true, or an IATA code, for the Québec rule
  //   o.keepDup   show 'Zones | Zones' rather than collapsing it
  //   o.fields    {FLIGHT:…} placeholders (escaped unless o.raw)
  //   o.sep       separator markup (default ' | ' in a .bs-sep span)
  //   o.cls       class added to each half
  //   o.plain     text only, no markup (for attributes and measuring)
  function pair(key, o) {
    o = o || {};
    var e = entry(key);
    if (!e) { miss(key, '*'); return ''; }
    var L = pairLangs(o.langs, o.frFirst != null ? o.frFirst : o.iata);
    var seen = Object.create(null), out = [];
    for (var i = 0; i < L.length; i++) {
      var w = e[L[i]];
      if (typeof w !== 'string' || !w) { miss(key, L[i]); continue; }
      w = fill(w, o.fields, o.raw);
      var k = w.toLowerCase();
      if (!o.keepDup && seen[k]) continue;
      seen[k] = true;
      out.push(o.plain ? w : half(L[i], w, o.cls, { key: key }));
    }
    return out.join(o.sep != null ? o.sep : (o.plain ? ' | ' : SEP_HTML));
  }

  function list(key, lang) {
    var e = LISTS[key];
    if (!e) { miss(key, lang || '*'); return []; }
    var v = e[lang || boardLang()];
    return Array.isArray(v) ? v : (e.en || []);
  }

  // ── TIMES, DATES AND WEEKDAYS ───────────────────────────────────────────
  // The only place a locale or hour12 is chosen. A time in a 24-hour
  // language reads 17:35; English reads 5:35pm, as the boards always have.
  function toDate(d) { return d instanceof Date ? d : new Date(d); }
  function time(d, lang, tz) {
    var l = isLang(lang) ? lang : 'en';
    var dt = toDate(d);
    if (isNaN(dt.getTime())) return '';
    try {
      if (META[l].clock24) {
        var o24 = { hour: '2-digit', minute: '2-digit', hour12: false };
        if (tz) o24.timeZone = tz;
        var s = dt.toLocaleTimeString('en-GB', o24);
        return s.replace(/^24:/, '00:');
      }
      var o12 = { hour: 'numeric', minute: '2-digit', hour12: true };
      if (tz) o12.timeZone = tz;
      return dt.toLocaleTimeString('en-US', o12)
        .replace(/\s*([AP])\.?\s*M\.?/gi, function (_, p) { return p.toLowerCase() + 'm'; });
    } catch (e) { return ''; }
  }
  // A bare 'HH:MM' from a feed, in one language's convention.
  function clockText(hhmm, lang) {
    var m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return hhmm;
    var l = isLang(lang) ? lang : 'en';
    if (META[l].clock24) return (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2];
    var h = +m[1], mer = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m[2] + mer;
  }
  function date(d, lang, opts, tz) {
    var l = isLang(lang) ? lang : 'en';
    var o = {};
    for (var k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    if (tz) o.timeZone = tz;
    try { return new Intl.DateTimeFormat(META[l].intl, o).format(toDate(d)); } catch (e) { return ''; }
  }
  // Weekday names are never sliced: three letters of an Arabic weekday made
  // Sunday and Wednesday both read الأ. 'short' is Intl's own abbreviation;
  // Arabic has none, so it reads the full name.
  function weekday(d, lang, style, tz) {
    var l = isLang(lang) ? lang : 'en';
    return date(d, l, { weekday: style === 'long' ? 'long' : 'short' }, tz);
  }

  // ── WHICH LANGUAGES A BOARD SPEAKS ──────────────────────────────────────
  function defaultLangs(iata) {
    var k = String(iata || '').toUpperCase();
    if (isFrFirst(k)) return ['fr', 'en'];
    if (LANG_DEFAULTS[k]) return LANG_DEFAULTS[k].slice();
    if (ES_AIRPORTS.indexOf(k) >= 0) return ['en', 'es'];
    return ['en', 'fr'];
  }

  function parseList(raw, max) {
    var out = [];
    String(raw || '').toLowerCase().split(/[,+\s]+/).forEach(function (tok) {
      if (out.length >= (max || LANGS.length)) return;
      // Matched against the constant list and the constant kept: the URL's
      // own string never enters `langs`, which reaches rendered markup.
      var i = LANGS.indexOf(tok);
      if (i >= 0 && out.indexOf(LANGS[i]) < 0) out.push(LANGS[i]);
    });
    return out;
  }

  // The board's ordered languages. Precedence, unchanged:
  //   1. ?langs= / ?lang= in the URL
  //   2. the saved per-airport choice, localStorage fids_langs_<IATA>
  //      (toggleLang is its only writer)
  //   3. the configured `langs`
  //   4. the per-airport default
  // then the Québec rule. A phone (o.phone) shows one language:
  // fids_mobile_lang, else the browser's own language, else English.
  //   o = { iata, search, saved, configured, phone, phoneSaved, navigatorLang }
  // Returns { langs, source }.
  function resolveLangs(o) {
    o = o || {};
    if (o.phone) {
      var one = parseList(o.phoneSaved, 1);
      if (!one.length) one = parseList(String(o.navigatorLang || '').split('-')[0], 1);
      return { langs: one.length ? one : ['en'], source: 'phone' };
    }
    var list = null, source = 'default';
    try {
      var q = typeof o.search === 'string'
        ? new URLSearchParams(o.search) : null;
      var raw = q ? (q.get('langs') || q.get('lang') || '') : '';
      if (raw) { var u = parseList(raw); if (u.length) { list = u; source = 'url'; } }
    } catch (e) {}
    if (!list && o.saved) { var s = parseList(o.saved); if (s.length) { list = s; source = 'saved'; } }
    if (!list && Array.isArray(o.configured) && o.configured.length) {
      var c = cleanList(o.configured); if (c.length) { list = c; source = 'config'; }
    }
    if (!list) list = defaultLangs(o.iata);
    return { langs: frenchFirst(list, String(o.iata || '')), source: source };
  }

  api.isLang = isLang;
  api.bs = bs;
  api.fmt = fmt;
  api.fill = fill;
  api.esc = esc;
  api.entry = entry;
  api.half = half;
  api.pair = pair;
  api.pairLangs = pairLangs;
  api.frenchFirst = frenchFirst;
  api.isFrFirst = isFrFirst;
  api.list = list;
  api.time = time;
  api.clockText = clockText;
  api.date = date;
  api.weekday = weekday;
  api.defaultLangs = defaultLangs;
  api.parseList = parseList;
  api.resolveLangs = resolveLangs;
  api.SEP_HTML = SEP_HTML;
  return api;
});
