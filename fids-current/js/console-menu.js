/* ═══════════════════════════════════════════════════════════════════════
   OrionConnected — F.I.D.S. Console Menu (contemporary DROPDOWN, day/night)
   Preview build: activates ONLY with ?newmenu=1. Drops down from the top,
   pops out, touch-friendly, and closes reliably (toggle / tap-outside /
   Esc / ✕ / after any action). Every control proxies an EXISTING handler
   or element so ALL options are present without touching board markup.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
  if (params.get('newmenu') !== '1') return;

  var ICONS = ''
    + '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    + '<symbol id="oc-board" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></symbol>'
    + '<symbol id="oc-gate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M4 21h16"/><circle cx="14.5" cy="12" r="1"/></symbol>'
    + '<symbol id="oc-bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 11v5M15 11v5"/></symbol>'
    + '<symbol id="oc-airport" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20M4 22V10l8-5 8 5v12"/><path d="M9 22v-5h6v5"/></symbol>'
    + '<symbol id="oc-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>'
    + '<symbol id="oc-theme" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/></symbol>'
    + '<symbol id="oc-add" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></symbol>'
    + '<symbol id="oc-ovr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="2" fill="currentColor" stroke="none"/></symbol>'
    + '<symbol id="oc-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></symbol>'
    + '<symbol id="oc-tune" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></symbol>'
    + '<symbol id="oc-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></symbol>'
    + '<symbol id="oc-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>'
    + '</defs></svg>';

  var CSS = ''
    + '#ocScrim{position:fixed;inset:0;z-index:100000;background:rgba(6,10,18,.28);opacity:0;pointer-events:none;transition:opacity .2s;}'
    + '#ocScrim.open{opacity:1;pointer-events:auto;}'
    // DROPDOWN: anchored to top, drops down + pops out
    + '#ocMenu{position:fixed;top:14px;left:50%;z-index:100001;width:min(1120px,96vw);transform:translateX(-50%) translateY(-16px) scale(.97);transform-origin:top center;opacity:0;pointer-events:none;transition:opacity .2s,transform .24s cubic-bezier(.22,1.2,.36,1);font-family:"Inter","DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased;border-radius:22px;overflow:hidden;max-height:calc(100vh - 28px);overflow-y:auto;}'
    + '#ocMenu.open{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0) scale(1);}'
    + '#ocMenu svg{display:block;}'
    + '.oc-ph{position:sticky;top:0;display:flex;align-items:center;gap:14px;padding:20px 26px;z-index:2;}'
    + '.oc-brand{font-size:17px;font-weight:700;letter-spacing:-.01em;}.oc-sub{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;margin-top:2px;}'
    + '.oc-sp{flex:1;}'
    + '.oc-live{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.1em;padding:6px 12px;border-radius:20px;}.oc-live .d{width:7px;height:7px;border-radius:50%;background:#10b981;}'
    + '.oc-clock{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;margin:0 4px 0 10px;}'
    + '.oc-x{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;flex:0 0 auto;}'
    + '.oc-body{padding:2px 26px 24px;}'
    + '.oc-lbl{font-size:10.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;margin:16px 2px 11px;}'
    + '.oc-seg{display:flex;gap:11px;}'
    + '.oc-seg button{flex:1;min-height:64px;border-radius:15px;padding:12px;cursor:pointer;display:flex;align-items:center;gap:12px;font-size:15px;font-weight:600;border:1.6px solid transparent;text-align:left;font-family:inherit;transition:.16s;}'
    + '.oc-seg button > span{display:flex;flex-direction:column;}.oc-seg .s2{display:block;font-size:11.5px;font-weight:450;margin-top:2px;}'
    + '.oc-chips{display:flex;flex-wrap:wrap;gap:9px;}'
    + '.oc-chip{min-height:46px;padding:0 18px;border-radius:23px;border:1.6px solid transparent;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;display:flex;align-items:center;gap:8px;transition:.16s;}'
    + '.oc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}'
    + '.oc-tile{display:flex;align-items:center;gap:15px;min-height:74px;padding:16px 18px;border-radius:16px;cursor:pointer;border:1.6px solid transparent;background:none;text-align:left;font-family:inherit;width:100%;transition:.16s;}'
    + '.oc-tile .ic{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}'
    + '.oc-tile > span:last-child{display:flex;flex-direction:column;min-width:0;}'
    + '.oc-tile .t{display:block;font-size:15px;font-weight:600;}.oc-tile .s{display:block;font-size:12px;font-weight:450;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.oc-selrow{display:flex;gap:12px;flex-wrap:wrap;}'
    + '.oc-sel{flex:1;min-width:220px;}'
    + '.oc-sel label{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;margin-bottom:6px;}'
    + '.oc-sel select{width:100%;min-height:48px;border-radius:12px;padding:0 14px;font-size:14px;font-weight:600;font-family:inherit;border:1.6px solid transparent;cursor:pointer;}'
    + '.oc-hr{height:1px;margin:20px 0 4px;}'
    // trigger
    + '#ocTrigger{position:fixed;top:16px;left:16px;z-index:100002;min-width:52px;height:52px;padding:0 16px;border-radius:15px;border:none;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;font-family:"Inter",system-ui,sans-serif;letter-spacing:.02em;background:rgba(15,23,42,.85);color:#fff;backdrop-filter:blur(12px);box-shadow:0 6px 18px rgba(0,0,0,.4);transition:.16s;}'
    + '#ocTrigger:hover{background:rgba(15,23,42,.97);}#ocTrigger.on{background:#2f6bff;}'
    // DAY
    + '#ocMenu[data-theme="light"]{background:#fbfcfe;box-shadow:0 26px 70px rgba(20,28,45,.34);}'
    + '#ocMenu[data-theme="light"] .oc-ph{background:#fbfcfe;border-bottom:1px solid #eef1f6;}#ocMenu[data-theme="light"] .oc-brand{color:#101a2b;}#ocMenu[data-theme="light"] .oc-sub{color:#93a0b2;}'
    + '#ocMenu[data-theme="light"] .oc-live{background:#e9f9f1;color:#0d9668;}#ocMenu[data-theme="light"] .oc-clock{color:#101a2b;}#ocMenu[data-theme="light"] .oc-x{background:#f0f3f8;color:#5a6675;}'
    + '#ocMenu[data-theme="light"] .oc-lbl{color:#9aa6b6;}'
    + '#ocMenu[data-theme="light"] .oc-seg button,#ocMenu[data-theme="light"] .oc-chip,#ocMenu[data-theme="light"] .oc-tile,#ocMenu[data-theme="light"] .oc-sel select{background:#fff;border-color:#e9edf3;color:#41506a;}'
    + '#ocMenu[data-theme="light"] .oc-seg .s2{color:#9aa6b6;}'
    + '#ocMenu[data-theme="light"] .oc-seg button.on,#ocMenu[data-theme="light"] .oc-chip.on{background:#f4f8ff;border-color:#2f6bff;color:#1b4fd6;}#ocMenu[data-theme="light"] .oc-seg button.on .s2{color:#6b8fd6;}'
    + '#ocMenu[data-theme="light"] .oc-tile:hover,#ocMenu[data-theme="light"] .oc-chip:hover{border-color:#c9d6ea;}#ocMenu[data-theme="light"] .oc-tile .t{color:#16233b;}#ocMenu[data-theme="light"] .oc-tile .s{color:#8593a6;}#ocMenu[data-theme="light"] .oc-tile .ic{background:#eef3fb;color:#2f6bff;}'
    + '#ocMenu[data-theme="light"] .oc-sel label{color:#8593a6;}#ocMenu[data-theme="light"] .oc-hr{background:#eef1f6;}'
    // NIGHT
    + '#ocMenu[data-theme="dark"]{background:#0e1a2c;box-shadow:0 26px 70px rgba(0,0,0,.55);}'
    + '#ocMenu[data-theme="dark"] .oc-ph{background:#0e1a2c;border-bottom:1px solid rgba(255,255,255,.06);}#ocMenu[data-theme="dark"] .oc-brand{color:#fff;}#ocMenu[data-theme="dark"] .oc-sub{color:#7d93b3;}'
    + '#ocMenu[data-theme="dark"] .oc-live{background:rgba(16,185,129,.14);color:#34d399;}#ocMenu[data-theme="dark"] .oc-clock{color:#dbe6f5;}#ocMenu[data-theme="dark"] .oc-x{background:rgba(255,255,255,.08);color:#a9bcd8;}'
    + '#ocMenu[data-theme="dark"] .oc-lbl{color:#6f85a5;}'
    + '#ocMenu[data-theme="dark"] .oc-seg button,#ocMenu[data-theme="dark"] .oc-chip,#ocMenu[data-theme="dark"] .oc-tile,#ocMenu[data-theme="dark"] .oc-sel select{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.09);color:#c2d2e6;}'
    + '#ocMenu[data-theme="dark"] .oc-sel select{color:#dbe6f5;}#ocMenu[data-theme="dark"] .oc-seg .s2{color:#7387a3;}'
    + '#ocMenu[data-theme="dark"] .oc-seg button.on,#ocMenu[data-theme="dark"] .oc-chip.on{background:rgba(47,107,255,.18);border-color:#3f7bff;color:#cfe0ff;}#ocMenu[data-theme="dark"] .oc-seg button.on .s2{color:#8fb0ea;}'
    + '#ocMenu[data-theme="dark"] .oc-tile:hover,#ocMenu[data-theme="dark"] .oc-chip:hover{border-color:rgba(255,255,255,.16);}#ocMenu[data-theme="dark"] .oc-tile .t{color:#eaf1fb;}#ocMenu[data-theme="dark"] .oc-tile .s{color:#8ba0be;}#ocMenu[data-theme="dark"] .oc-tile .ic{background:rgba(63,123,255,.14);color:#6ea4ff;}'
    + '#ocMenu[data-theme="dark"] .oc-sel label{color:#8ba0be;}#ocMenu[data-theme="dark"] .oc-hr{background:rgba(255,255,255,.07);}';

  function tile(id, icon, title, sub) {
    return '<button class="oc-tile" data-oc="' + id + '"><span class="ic"><svg width="23" height="23"><use href="#oc-' + icon + '"/></svg></span>'
      + '<span><span class="t">' + title + '</span><span class="s" data-ocsub="' + id + '">' + sub + '</span></span></button>';
  }

  var MENU_HTML = ''
    + '<div class="oc-ph"><div><div class="oc-brand">F.I.D.S. Console</div><div class="oc-sub">Orion Connected</div></div><div class="oc-sp"></div>'
    +   '<div class="oc-live"><span class="d"></span>LIVE</div><div class="oc-clock" id="ocClock">--:--</div>'
    +   '<button class="oc-x" data-oc="close" aria-label="Close"><svg width="19" height="19"><use href="#oc-x"/></svg></button></div>'
    + '<div class="oc-body">'
    +   '<div class="oc-lbl">Display</div>'
    +   '<div class="oc-seg">'
    +     '<button class="oc-seg-btn" data-ocdisp="main"><svg width="26" height="26"><use href="#oc-board"/></svg><span>Main Board<span class="s2">Departures &amp; arrivals</span></span></button>'
    +     '<button class="oc-seg-btn" data-ocdisp="gate"><svg width="26" height="26"><use href="#oc-gate"/></svg><span>Gate Screen<span class="s2">A single gate</span></span></button>'
    +     '<button class="oc-seg-btn" data-ocdisp="baggage"><svg width="26" height="26"><use href="#oc-bag"/></svg><span>Baggage<span class="s2">A carousel</span></span></button>'
    +   '</div>'
    +   '<div id="ocSubWrap" style="display:none;"><div class="oc-lbl" id="ocSubLbl">Gate</div><div class="oc-chips" id="ocSubChips"></div></div>'
    +   '<div class="oc-lbl">Controls</div>'
    +   '<div class="oc-grid">'
    +     tile('airport', 'airport', 'Airport', 'YQM')
    +     tile('search', 'search', 'Find a flight', 'Flight, city or airline')
    +     tile('add', 'add', 'Add test flight', 'Preview a flight row')
    +     tile('ovr', 'ovr', 'Gate overrides', 'Per-flight corrections')
    +     tile('refresh', 'refresh', 'Refresh live data', 'Re-pull now')
    +     tile('advanced', 'tune', 'More settings', 'Customize · media · users')
    +   '</div>'
    +   '<div class="oc-hr"></div>'
    +   '<div class="oc-lbl">Appearance</div>'
    +   '<div class="oc-selrow">'
    +     '<div class="oc-sel"><label>Theme</label><select id="ocTheme"></select></div>'
    +     '<div class="oc-sel"><label>Font</label><select id="ocFont"></select></div>'
    +   '</div>'
    +   '<div class="oc-lbl" id="ocBgLbl" style="display:none;">Background</div>'
    +   '<div class="oc-chips" id="ocBgChips" style="display:none;">'
    +     '<button class="oc-chip" data-ocbg="photo">Photo</button>'
    +     '<button class="oc-chip" data-ocbg="airline">Airline</button>'
    +     '<button class="oc-chip" data-ocbg="custom">Custom</button>'
    +   '</div>'
    + '</div>';

  function currentTheme() {
    try { var t = localStorage.getItem('fids_console_theme'); if (t === 'light' || t === 'dark') return t; } catch (e) {}
    var h = new Date().getHours(); return (h >= 6 && h < 19) ? 'light' : 'dark';
  }
  function iataNow() { try { return (document.getElementById('apSel') || {}).value || 'YQM'; } catch (e) { return 'YQM'; } }
  function AP_(k) { return (typeof AP !== 'undefined' ? AP : {})[k] || {}; }

  function mirrorSelect(myId, srcId, changeFn) {
    var my = document.getElementById(myId), src = document.getElementById(srcId);
    if (!my || !src) return;
    if (my.innerHTML !== src.innerHTML) my.innerHTML = src.innerHTML;
    my.value = src.value;
    if (!my._wired) {
      my._wired = true;
      my.addEventListener('change', function () {
        var s = document.getElementById(srcId);
        if (s) { s.value = my.value; if (typeof window[changeFn] === 'function') { try { window[changeFn](); } catch (e) {} } }
      });
    }
  }

  function refresh() {
    var menu = document.getElementById('ocMenu'); if (!menu) return;
    menu.setAttribute('data-theme', currentTheme());
    try {
      var iata = iataNow(), tz = AP_(iata).tz, opts = { hour: '2-digit', minute: '2-digit', hour12: true };
      if (tz) opts.timeZone = tz;
      var cl = document.getElementById('ocClock'); if (cl) cl.textContent = new Date().toLocaleTimeString('en-US', opts);
      var el = menu.querySelector('[data-ocsub="airport"]'); if (el) el.textContent = iata + ' · ' + (AP_(iata).name || iata);
    } catch (e) {}
    var st = (typeof screenType !== 'undefined') ? screenType : 'main';
    menu.querySelectorAll('.oc-seg-btn').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-ocdisp') === st); });
    // sub-screen chips (gate / carousel) mirrored from the real subScreenSel
    var subWrap = document.getElementById('ocSubWrap'), chips = document.getElementById('ocSubChips'), sub = document.getElementById('subScreenSel');
    if (subWrap && chips) {
      if (st !== 'main' && sub && sub.options && sub.options.length) {
        document.getElementById('ocSubLbl').textContent = (st === 'baggage') ? 'Carousel' : 'Gate';
        var html = '';
        for (var i = 0; i < sub.options.length; i++) html += '<button class="oc-chip' + (sub.options[i].value === sub.value ? ' on' : '') + '" data-ocsub2="' + sub.options[i].value.replace(/"/g, '') + '">' + sub.options[i].textContent + '</button>';
        chips.innerHTML = html; subWrap.style.display = '';
      } else { subWrap.style.display = 'none'; }
    }
    // background chips only on dedicated screens
    var bgLbl = document.getElementById('ocBgLbl'), bgChips = document.getElementById('ocBgChips');
    if (bgLbl && bgChips) { var show = (st !== 'main'); bgLbl.style.display = show ? '' : 'none'; bgChips.style.display = show ? '' : 'none'; }
    // mirror theme + font selects from the console's canonical sources
    mirrorSelect('ocTheme', 'cuThemeSelect', 'cuThemeChanged');
    mirrorSelect('ocFont', 'cuFontSelect', 'cuFontChanged');
  }

  var _timer = null, _open = false;
  function openMenu() {
    _open = true;
    document.getElementById('ocScrim').classList.add('open');
    document.getElementById('ocMenu').classList.add('open');
    document.getElementById('ocTrigger').classList.add('on');
    refresh(); if (_timer) clearInterval(_timer); _timer = setInterval(refresh, 1000);
  }
  function closeMenu() {
    _open = false;
    var s = document.getElementById('ocScrim'), m = document.getElementById('ocMenu'), t = document.getElementById('ocTrigger');
    if (s) s.classList.remove('open'); if (m) m.classList.remove('open'); if (t) t.classList.remove('on');
    if (_timer) { clearInterval(_timer); _timer = null; }
  }
  function toggleMenu() { _open ? closeMenu() : openMenu(); }
  function call(fn) { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {} }

  function handle(action) {
    switch (action) {
      case 'close': closeMenu(); break;
      case 'airport':
        try { document.body.classList.remove('mbar-hidden'); var ap = document.getElementById('apPanel'); if (ap) ap.classList.remove('hidden'); var inp = document.getElementById('apSelInput'); if (inp) { inp.focus(); inp.select(); } } catch (e) {}
        closeMenu(); break;
      case 'search':
        try { document.body.classList.remove('mbar-hidden'); var si = document.getElementById('searchInput'); if (si) si.focus(); } catch (e) {}
        closeMenu(); break;
      case 'add': call('openTestFlight'); closeMenu(); break;
      case 'ovr': call('toggleOverridePanel'); closeMenu(); break;
      case 'refresh': call('fetchLive'); break;
      case 'advanced':
        // open the real Customize section (menubar dropdown) or the console
        try {
          var titles = document.querySelectorAll('.mbar-title'); var hit = false;
          document.body.classList.remove('mbar-hidden');
          for (var i = 0; i < titles.length; i++) { if (titles[i].textContent.replace('▾', '').trim() === 'Customize') { titles[i].click(); hit = true; break; } }
          if (!hit && typeof window.openOverlayMenu === 'function') window.openOverlayMenu();
        } catch (e) {}
        closeMenu(); break;
    }
  }
  function setDisplay(mode) { try { if (typeof window.changeScreenType === 'function') window.changeScreenType(mode); } catch (e) {} refresh(); }
  function setSub(val) {
    var sub = document.getElementById('subScreenSel'); if (!sub) return;
    sub.value = val; try { if (typeof window.changeSubScreen === 'function') window.changeSubScreen(val); } catch (e) {} refresh();
  }
  function setBg(mode) { try { if (typeof window.setDedicatedBgMode === 'function') window.setDedicatedBgMode(mode); } catch (e) {} var c = document.getElementById('ocBgChips'); if (c) c.querySelectorAll('.oc-chip').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-ocbg') === mode); }); }

  function init() {
    if (document.getElementById('ocMenu')) return;
    var style = document.createElement('style'); style.id = 'ocMenuStyle'; style.textContent = CSS; document.head.appendChild(style);
    var wrap = document.createElement('div'); wrap.innerHTML = ICONS; document.body.appendChild(wrap.firstChild);
    var scrim = document.createElement('div'); scrim.id = 'ocScrim'; document.body.appendChild(scrim);
    var menu = document.createElement('div'); menu.id = 'ocMenu'; menu.setAttribute('data-theme', currentTheme()); menu.innerHTML = MENU_HTML; document.body.appendChild(menu);
    var trig = document.createElement('button'); trig.id = 'ocTrigger'; trig.title = 'Console menu (preview)';
    trig.innerHTML = '<svg width="22" height="22"><use href="#oc-menu"/></svg><span>Menu</span>'; document.body.appendChild(trig);

    trig.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(); });
    scrim.addEventListener('click', closeMenu);
    menu.addEventListener('click', function (e) {
      var seg = e.target.closest('.oc-seg-btn'); if (seg) { setDisplay(seg.getAttribute('data-ocdisp')); return; }
      var sc = e.target.closest('[data-ocsub2]'); if (sc) { setSub(sc.getAttribute('data-ocsub2')); return; }
      var bg = e.target.closest('[data-ocbg]'); if (bg) { setBg(bg.getAttribute('data-ocbg')); return; }
      var t = e.target.closest('[data-oc]'); if (t) handle(t.getAttribute('data-oc'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    window.ocOpenMenu = openMenu; window.ocCloseMenu = closeMenu;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
