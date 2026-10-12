/* ━━ THE HOMEPAGE AND ITS CREDITS PAGE (www.orionconnected.com) ━━━━━━━━━━━━━
   Loaded by home.html and credits.html, right after board-strings.js.

   Every word on these pages is the store's (BoardStrings), in all nine board
   languages. Unlike a board, a page speaks ONE language at a time, the
   reader's: ?lang= first, then the reader's saved choice, then the browser's
   languages, then English (BoardStrings.pageLang decides). Arabic reads right
   to left. The language switch writes ?lang= and saves the choice.

   How the words get on the page:
     data-i18n="key" data-i18n-one   the store fills it (applyStatic), in the
                                     page's language — `langs` below is it
     data-i18n-fill                  then filled here: {N}, {CA}, {HERE}…
                                     (data-i18n-n gives a figure its number)
     data-i18n-alt / -label / -content / -title
                                     an alt text, aria-label, a meta content
                                     or the page title, from the store
     data-href-text                  shows the address of its link (data)
   Names of airports are data (decision D2): the boards' own names, French
   ones where the boards have them (CITY_FR in fids-core.js). Country names
   come from Intl (CLDR) in the store's locale.

   This page is served at www.orionconnected.com and orionconnected.com by
   worker-entry.js (homeRoute), once those hosts reach the Worker; until
   then a Cloudflare redirect rule sends them to the boards.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';
  var S = window.BoardStrings;
  if (!S || !S.pageLang) return;
  var doc = document, root = doc.documentElement;

  // ── THE AIRPORT INDEX ────────────────────────────────────────────────────
  // The live roster (FIDS_LIVE_AIRPORTS in fids-core.js; tests/homepage.test.js
  // holds this list to it). [country, code, name, French name]. A code the
  // boards print otherwise (YHU is MET to passengers, host-airport.js) is
  // shown as they print it; its address stays the real code.
  //
  // The index is grouped by country, each named by Intl (CLDR) in the page's
  // language. Europe is counted as one in the words above the index ({EU}),
  // but has no group of its own: CLDR's name for it (UN M.49 '150') is not in
  // Chrome's data, and the store cannot hold 'Europe' for French without an
  // approved exception (it reads the same as the English).
  var REGIONS = ['CA', 'US', 'EU', 'AU'];
  var REGION_OF = { IE: 'EU', GB: 'EU', IS: 'EU', CH: 'EU' };
  var AIRPORTS = [
    ['CA', 'YXX', 'Abbotsford'], ['CA', 'YYC', 'Calgary'], ['CA', 'YYG', 'Charlottetown'],
    ['CA', 'YDF', 'Deer Lake'], ['CA', 'YEG', 'Edmonton'], ['CA', 'YMM', 'Fort McMurray'],
    ['CA', 'YFC', 'Fredericton'], ['CA', 'YQX', 'Gander'], ['CA', 'YHZ', 'Halifax'],
    ['CA', 'YHM', 'Hamilton'], ['CA', 'YKA', 'Kamloops'], ['CA', 'YLW', 'Kelowna'],
    ['CA', 'YQM', 'Moncton'], ['CA', 'YHU', 'Montréal Métropolitain'], ['CA', 'YUL', 'Montréal-Trudeau'],
    ['CA', 'YOW', 'Ottawa'], ['CA', 'YXS', 'Prince George'], ['CA', 'YQB', 'Québec City', 'Québec'],
    ['CA', 'YQR', 'Regina'], ['CA', 'YSJ', 'Saint John NB'], ['CA', 'YXE', 'Saskatoon'],
    ['CA', 'YYT', 'St. John’s NL'], ['CA', 'YQY', 'Sydney NS'], ['CA', 'YQT', 'Thunder Bay'],
    ['CA', 'YTZ', 'Toronto Billy Bishop'], ['CA', 'YYZ', 'Toronto Pearson'], ['CA', 'YYJ', 'Victoria'],
    ['CA', 'YZF', 'Yellowknife'],
    ['US', 'AUS', 'Austin'], ['US', 'BOS', 'Boston'], ['US', 'CLT', 'Charlotte'],
    ['US', 'ORD', 'Chicago O’Hare'], ['US', 'DEN', 'Denver'], ['US', 'DTW', 'Detroit', 'Détroit'],
    ['US', 'IAH', 'Houston Intercontinental'], ['US', 'MCI', 'Kansas City'], ['US', 'LAS', 'Las Vegas'],
    ['US', 'MIA', 'Miami'], ['US', 'MSP', 'Minneapolis'], ['US', 'MSY', 'New Orleans', 'La Nouvelle-Orléans'],
    ['US', 'JFK', 'New York Kennedy'], ['US', 'LGA', 'New York LaGuardia'], ['US', 'EWR', 'Newark'],
    ['US', 'MCO', 'Orlando'], ['US', 'PHL', 'Philadelphia', 'Philadelphie'], ['US', 'PHX', 'Phoenix'],
    ['US', 'PDX', 'Portland'], ['US', 'RDU', 'Raleigh-Durham'], ['US', 'SLC', 'Salt Lake City'],
    ['US', 'SAN', 'San Diego'], ['US', 'SFO', 'San Francisco'], ['US', 'SEA', 'Seattle'],
    ['US', 'TPA', 'Tampa'], ['US', 'IAD', 'Washington Dulles'], ['US', 'DCA', 'Washington Reagan'],
    ['IE', 'DUB', 'Dublin'], ['GB', 'EDI', 'Edinburgh', 'Édimbourg'], ['GB', 'LHR', 'London Heathrow', 'Londres Heathrow'],
    ['IS', 'KEF', 'Reykjavik'], ['CH', 'ZRH', 'Zurich'],
    ['AU', 'HBA', 'Hobart'], ['AU', 'SYD', 'Sydney']
  ];
  // Moncton: the first airport, and the pair the languages section shows
  var HOME_CODE = 'YQM';
  // docked in the dry dock (fids-core.js) and shown as paused
  var PAUSED = { SYD: true };
  // the 3D model credited on the credits page (docs/licenses/3d-models.md),
  // its title and its author as Sketchfab publishes them
  var MODEL = { title: 'boeing 767', author: '1883' };

  var LIVE_BOARDS = 'https://fids.orionconnected.com/picker';
  var PHONE_APP = 'https://orionconnected.app';
  var SAVED_KEY = 'oc_home_lang';

  function display(code) {
    try { return window.fidsDisplayIata ? window.fidsDisplayIata(code) : code; } catch (e) { return code; }
  }
  function nameOf(a, lang) {
    // French boards use their own names for some places (CITY_FR)
    return (lang === 'fr' && a[3]) || a[2];
  }
  function regionOf(a) { return REGION_OF[a[0]] || a[0]; }
  function counts() {
    var c = { N: AIRPORTS.length };
    REGIONS.forEach(function (r) { c[r] = AIRPORTS.filter(function (a) { return regionOf(a) === r; }).length; });
    return c;
  }

  // ── THE PAGE'S LANGUAGE ──────────────────────────────────────────────────
  function readSaved() { try { return localStorage.getItem(SAVED_KEY); } catch (e) { return null; } }
  function save(l) { try { localStorage.setItem(SAVED_KEY, l); } catch (e) {} }
  var lang = S.pageLang({ search: location.search, saved: readSaved() }).lang;

  function setPageLang(l) {
    lang = l;
    // the store's static text (data-i18n) reads the page's languages here
    window.langs = [l];
    S.setLang(root, l);
    root.setAttribute('data-lang', l);
  }
  setPageLang(lang);
  root.classList.add('js');

  // ── FILLING THE WORDS ────────────────────────────────────────────────────
  function fields(l) {
    var f = counts();
    f.GATE = '1';
    f.HERE = S.bs('youAreHere', l);
    f.WORD = S.bs('appDep', l);
    f.KICKER = S.bs('heritageKicker', l);
    f.TITLE = MODEL.title;
    f.AUTHOR = MODEL.author;
    f.CITY = '';
    return f;
  }
  function fill(el, key, l, f) {
    var own = el.getAttribute('data-i18n-n');
    var x = own ? Object.assign({}, f, { N: own }) : f;
    var city = el.getAttribute('data-i18n-city');
    if (city) x = Object.assign({}, x, { CITY: cityName(city, l) });
    return S.fmt(key, l, x, true);
  }
  function cityName(code, l) {
    for (var i = 0; i < AIRPORTS.length; i++) if (AIRPORTS[i][1] === code) return nameOf(AIRPORTS[i], l);
    return '';
  }
  function paintWords(l) {
    var f = fields(l);
    var els = doc.querySelectorAll('[data-i18n-fill]');
    for (var i = 0; i < els.length; i++) els[i].textContent = fill(els[i], els[i].getAttribute('data-i18n'), l, f);
    var attrs = [['data-i18n-alt', 'alt'], ['data-i18n-label', 'aria-label'], ['data-i18n-content', 'content']];
    attrs.forEach(function (pair) {
      var list = doc.querySelectorAll('[' + pair[0] + ']');
      for (var j = 0; j < list.length; j++) list[j].setAttribute(pair[1], fill(list[j], list[j].getAttribute(pair[0]), l, f));
    });
    var t = doc.querySelector('[data-i18n-title]');
    if (t) doc.title = S.bs(t.getAttribute('data-i18n-title'), l);
  }

  // ── THE AIRPORT INDEX, BY REGION ─────────────────────────────────────────
  function countryName(c, l) {
    try { return new Intl.DisplayNames([S.intl(l)], { type: 'region' }).of(c) || c; } catch (e) { return c; }
  }
  // the groups of the index, in the region order, countries of one region
  // in the order of their names in the page's language
  function groups(l, coll) {
    var out = [];
    REGIONS.forEach(function (r) {
      var cs = [];
      AIRPORTS.forEach(function (a) { if (regionOf(a) === r && cs.indexOf(a[0]) < 0) cs.push(a[0]); });
      cs.sort(function (x, y) { return coll ? coll.compare(countryName(x, l), countryName(y, l)) : 0; });
      out = out.concat(cs);
    });
    return out;
  }
  function countText(n, l) {
    var form = 'other';
    try { form = new Intl.PluralRules(S.intl(l)).select(n); } catch (e) {}
    var key = { one: 'homeApOne', two: 'homeApTwo', few: 'homeApFew', many: 'homeApMany' }[form] || 'homeApOther';
    return S.fmt(key, l, { N: S.num(n, l) });
  }
  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgUse(cls, id) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = doc.createElementNS(ns, 'svg');
    s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    var u = doc.createElementNS(ns, 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }
  function paintIndex(l) {
    var box = doc.getElementById('airport-index');
    if (!box) return;
    box.textContent = '';
    var coll = null;
    try { coll = new Intl.Collator(S.intl(l)); } catch (e) {}
    groups(l, coll).forEach(function (r) {
      var list = AIRPORTS.filter(function (a) { return a[0] === r; });
      list.sort(function (a, b) { return coll ? coll.compare(nameOf(a, l), nameOf(b, l)) : (nameOf(a, l) < nameOf(b, l) ? -1 : 1); });
      var sec = el('div', 'region g12');
      var id = 'r-' + r.toLowerCase();
      sec.setAttribute('role', 'group');
      sec.setAttribute('aria-labelledby', id);
      var head = el('div', 'region-h');
      var h = el('h3', null, countryName(r, l));
      h.id = id;
      head.appendChild(h);
      var sub = countText(list.length, l);
      list.forEach(function (a) { if (PAUSED[a[1]]) sub += ' · ' + S.fmt('homeRegionPaused', l, { CITY: nameOf(a, l) }); });
      head.appendChild(el('p', null, sub));
      sec.appendChild(head);
      var ul = el('ul');
      list.forEach(function (a) {
        var li = el('li');
        var link = el('a', 'ap' + (PAUSED[a[1]] ? ' paused' : ''));
        link.href = 'https://' + a[1].toLowerCase() + '.orionconnected.com';
        link.appendChild(el('span', 'c', display(a[1])));
        var n = el('span', 'n', nameOf(a, l));
        if (a[1] === HOME_CODE) {
          n.appendChild(svgUse('star', 'i-star'));
          n.appendChild(el('span', 'sr', ' ' + S.bs('homeHomeBase', l)));
        }
        if (PAUSED[a[1]]) n.appendChild(el('span', 'tag', S.bs('homePaused', l)));
        link.appendChild(n);
        li.appendChild(link);
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      box.appendChild(sec);
    });
    var note = doc.getElementById('paused-note');
    if (note) {
      var p = Object.keys(PAUSED)[0];
      note.textContent = p ? S.fmt('homeNotePaused', l, { CITY: cityName(p, l) }) : '';
    }
  }

  // ── NINE LANGUAGES: THE BOARDS' OWN WORD FOR DEPARTURES ──────────────────
  function paintLangs(l) {
    var box = doc.getElementById('lang-tiles');
    if (!box) return;
    box.textContent = '';
    box.setAttribute('aria-label', S.fmt('homeLangsAria', l, { WORD: S.bs('appDep', l) }));
    var pair = S.defaultLangs(HOME_CODE);
    S.LANGS.forEach(function (code) {
      var li = el('li', 'lang');
      S.setLang(li, code);
      li.appendChild(el('span', 'w', S.bs('appDep', code)));
      var m = el('span', 'm');
      m.appendChild(el('b', null, code.toUpperCase()));
      m.appendChild(el('span', null, S.META[code].name));
      if (pair.indexOf(code) >= 0) {
        var pr = el('span', 'pair');
        pr.appendChild(svgUse('star', 'i-star'));
        pr.appendChild(el('span', null, cityName(HOME_CODE, l)));
        m.appendChild(pr);
      }
      li.appendChild(m);
      box.appendChild(li);
    });
  }

  // ── THE LANGUAGE SWITCH ──────────────────────────────────────────────────
  function paintSwitch(l) {
    var sw = doc.querySelectorAll('.lsw');
    for (var i = 0; i < sw.length; i++) {
      var name = sw[i].querySelector('.lsw-name'), code = sw[i].querySelector('.lsw-code');
      if (name) { name.textContent = S.META[l].name; S.setLang(name, l); }
      if (code) code.textContent = l.toUpperCase();
      var list = sw[i].querySelector('.lsw-list');
      if (!list) continue;
      list.textContent = '';
      S.LANGS.forEach(function (c) {
        var li = el('li');
        var a = el('a');
        var u = new URL(location.href);
        u.searchParams.set('lang', c);
        a.href = u.pathname + u.search + u.hash;
        a.setAttribute('hreflang', c);
        a.setAttribute('data-lang-pick', c);
        if (c === l) a.setAttribute('aria-current', 'true');
        // the name in its own language and direction; the row keeps the page's
        var nm = el('bdi', null, S.META[c].name);
        S.setLang(nm, c);
        a.appendChild(nm);
        a.appendChild(el('b', null, c.toUpperCase()));
        li.appendChild(a);
        list.appendChild(li);
      });
    }
  }
  function choose(l) {
    if (!S.isLang(l)) return;
    save(l);
    try {
      var u = new URL(location.href);
      u.searchParams.set('lang', l);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
    setPageLang(l);
    S.langsChanged();
  }

  // ── LINKS ────────────────────────────────────────────────────────────────
  // A phone opening a board is sent to the companion app anyway (fids-core.js
  // PHONE HANDOFF); the homepage sends it there directly.
  var narrow = null;
  try { narrow = window.matchMedia('(max-width: 700px)'); } catch (e) {}
  function isPhone() {
    var ua = navigator.userAgent || '';
    var phoneUa = /iPhone|iPod|iPad|Windows Phone/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
    return phoneUa || !!(narrow && narrow.matches);
  }
  function paintLinks() {
    var to = isPhone() ? PHONE_APP : LIVE_BOARDS;
    var ls = doc.querySelectorAll('[data-boards-link]');
    for (var i = 0; i < ls.length; i++) ls[i].href = to;
  }
  function paintAddresses() {
    var ls = doc.querySelectorAll('[data-href-text]');
    for (var i = 0; i < ls.length; i++) {
      var a = ls[i].closest('a');
      if (!a) continue;
      var h = a.getAttribute('href') || '';
      var t;
      if (/^mailto:/i.test(h)) t = h.slice(7);
      else {
        try {
          var u = new URL(h, location.href);
          t = u.origin === location.origin ? u.pathname : (u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, ''));
        } catch (e) { t = h; }
      }
      ls[i].textContent = t;
    }
    var addr = doc.querySelector('[data-addr]');
    if (addr) {
      var host = '';
      try { host = new URL(addr.getAttribute('href')).host; } catch (e) {}
      var cut = host.indexOf('.');
      var c = addr.querySelector('.code'), d = addr.querySelector('.dom');
      if (c && d && cut > 0) { c.textContent = host.slice(0, cut); d.textContent = host.slice(cut); }
    }
  }

  // ── EVERYTHING THAT FOLLOWS THE LANGUAGE ─────────────────────────────────
  function paint(L) {
    var l = (L && L[0]) || lang;
    paintWords(l);
    paintIndex(l);
    paintLangs(l);
    paintSwitch(l);
  }
  S.onLangs(paint);

  function closeOthers(open) {
    var ds = doc.querySelectorAll('details.menu, details.lsw');
    for (var i = 0; i < ds.length; i++) if (ds[i] !== open) ds[i].open = false;
  }
  function boot() {
    // applyStatic (board-strings.js) has run on this event already, in the
    // page's language; the rest is painted here
    paint([lang]);
    paintLinks();
    paintAddresses();
    if (narrow) {
      if (narrow.addEventListener) narrow.addEventListener('change', paintLinks);
      else if (narrow.addListener) narrow.addListener(paintLinks);
    }
    doc.addEventListener('click', function (e) {
      var pick = e.target.closest && e.target.closest('[data-lang-pick]');
      if (pick) {
        e.preventDefault();
        var d = pick.closest('details');
        if (d) d.open = false;
        choose(pick.getAttribute('data-lang-pick'));
        var s = d && d.querySelector('summary');
        if (s) s.focus();
        return;
      }
      var inMenu = e.target.closest && e.target.closest('.menu-list a');
      if (inMenu) { var m = inMenu.closest('details'); if (m) m.open = false; return; }
      // a click anywhere else closes an open menu
      if (!(e.target.closest && e.target.closest('details.menu, details.lsw'))) closeOthers(null);
    });
    var ds = doc.querySelectorAll('details.menu, details.lsw');
    for (var i = 0; i < ds.length; i++) {
      ds[i].addEventListener('toggle', function () { if (this.open) closeOthers(this); });
    }
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = doc.querySelector('details.menu[open], details.lsw[open]');
      if (!open) return;
      open.open = false;
      var s = open.querySelector('summary');
      if (s) s.focus();
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

  // for tests/homepage.test.js
  window.OCHome = {
    AIRPORTS: AIRPORTS, REGIONS: REGIONS, REGION_OF: REGION_OF, PAUSED: PAUSED, MODEL: MODEL,
    counts: counts, countText: countText, groups: groups, choose: choose, isPhone: isPhone,
    lang: function () { return lang; }
  };
})();
