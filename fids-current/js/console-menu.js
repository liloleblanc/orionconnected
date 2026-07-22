/* ═══════════════════════════════════════════════════════════════════════
   OrionConnected — F.I.D.S. Console Menu (contemporary, day/night)
   Preview build: activates ONLY with ?newmenu=1 in the URL, so it can never
   affect the live boards until it's promoted. Injects a self-contained
   overlay + a floating trigger; every tile calls an EXISTING handler
   (changeScreenType / openTestFlight / toggleOverridePanel / setDedicatedBgMode
   / the airport panel / the search field / the console theme). No board
   markup is touched.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
  if (params.get('newmenu') !== '1') return;   // opt-in preview only

  var IATA_NAME = {};   // filled from AP at open time

  // ── one-time SVG icon defs ────────────────────────────────────────────
  var ICONS = ''
    + '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    + '<symbol id="oc-board" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></symbol>'
    + '<symbol id="oc-gate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M4 21h16"/><circle cx="14.5" cy="12" r="1"/></symbol>'
    + '<symbol id="oc-bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 11v5M15 11v5"/></symbol>'
    + '<symbol id="oc-airport" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20M4 22V10l8-5 8 5v12"/><path d="M9 22v-5h6v5"/><path d="M9 12h.01M15 12h.01"/></symbol>'
    + '<symbol id="oc-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>'
    + '<symbol id="oc-theme" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/></symbol>'
    + '<symbol id="oc-bg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 18 5-5 4 4 3-3 4 4"/></symbol>'
    + '<symbol id="oc-add" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></symbol>'
    + '<symbol id="oc-ovr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="2" fill="currentColor" stroke="none"/></symbol>'
    + '<symbol id="oc-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></symbol>'
    + '<symbol id="oc-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>'
    + '</defs></svg>';

  var CSS = ''
    + '#ocScrim{position:fixed;inset:0;z-index:100000;background:rgba(6,10,18,.5);opacity:0;pointer-events:none;transition:opacity .22s;}'
    + '#ocScrim.open{opacity:1;pointer-events:auto;}'
    + '#ocMenu{position:fixed;top:50%;left:50%;z-index:100001;width:min(1120px,94vw);transform:translate(-50%,-46%) scale(.98);opacity:0;pointer-events:none;transition:opacity .22s,transform .22s;font-family:"Inter","DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased;border-radius:24px;overflow:hidden;max-height:92vh;overflow-y:auto;}'
    + '#ocMenu.open{opacity:1;pointer-events:auto;transform:translate(-50%,-50%) scale(1);}'
    + '#ocMenu svg{display:block;}'
    + '.oc-ph{display:flex;align-items:center;gap:16px;padding:26px 34px 22px;}'
    + '.oc-brand{font-size:18px;font-weight:700;letter-spacing:-.01em;}.oc-sub{font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;margin-top:3px;}'
    + '.oc-sp{flex:1;}'
    + '.oc-live{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.1em;padding:7px 13px;border-radius:20px;}.oc-live .d{width:7px;height:7px;border-radius:50%;background:#10b981;}'
    + '.oc-clock{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;margin:0 6px 0 12px;}'
    + '.oc-x{width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;}'
    + '.oc-lbl{font-size:11px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;padding:8px 34px 12px;}'
    + '.oc-seg{display:flex;gap:12px;padding:0 34px 8px;}'
    + '.oc-seg button{flex:1;border-radius:16px;padding:18px 14px;cursor:pointer;display:flex;align-items:center;gap:13px;font-size:14.5px;font-weight:600;border:1.5px solid transparent;text-align:left;font-family:inherit;transition:.18s;}'
    + '.oc-seg .s2{font-size:11.5px;font-weight:450;margin-top:2px;}'
    + '.oc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:12px 34px 30px;}'
    + '.oc-tile{display:flex;align-items:center;gap:16px;padding:18px;border-radius:16px;cursor:pointer;border:1.5px solid transparent;background:none;text-align:left;font-family:inherit;width:100%;transition:.18s;}'
    + '.oc-tile .ic{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}'
    + '.oc-tile > span:last-child{display:flex;flex-direction:column;}'
    + '.oc-tile .t{display:block;font-size:15.5px;font-weight:600;}.oc-tile .s{display:block;font-size:12.5px;font-weight:450;margin-top:2px;}'
    + '.oc-seg button > span{display:flex;flex-direction:column;}.oc-seg .s2{display:block;}'
    + '.oc-pf{display:flex;align-items:center;gap:12px;padding:18px 34px;}.oc-pf .s{font-size:12px;font-weight:500;}.oc-pf .src{margin-left:auto;font-size:10.5px;font-weight:600;letter-spacing:.12em;}'
    // trigger
    + '#ocTrigger{position:fixed;top:16px;left:16px;z-index:99997;width:48px;height:48px;border-radius:14px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.82);color:#fff;backdrop-filter:blur(12px);box-shadow:0 6px 18px rgba(0,0,0,.4);}'
    + '#ocTrigger:hover{background:rgba(15,23,42,.95);}'
    // DAY
    + '#ocMenu[data-theme="light"]{background:#fbfcfe;box-shadow:0 30px 80px rgba(20,28,45,.4);}'
    + '#ocMenu[data-theme="light"] .oc-ph{border-bottom:1px solid #eef1f6;}#ocMenu[data-theme="light"] .oc-brand{color:#101a2b;}#ocMenu[data-theme="light"] .oc-sub{color:#93a0b2;}'
    + '#ocMenu[data-theme="light"] .oc-live{background:#e9f9f1;color:#0d9668;}#ocMenu[data-theme="light"] .oc-clock{color:#101a2b;}#ocMenu[data-theme="light"] .oc-x{background:#f0f3f8;color:#6b7889;}'
    + '#ocMenu[data-theme="light"] .oc-lbl{color:#9aa6b6;}'
    + '#ocMenu[data-theme="light"] .oc-seg button{background:#fff;border-color:#e9edf3;color:#41506a;}#ocMenu[data-theme="light"] .oc-seg .s2{color:#9aa6b6;}'
    + '#ocMenu[data-theme="light"] .oc-seg button.on{background:#f4f8ff;border-color:#2f6bff;color:#1b4fd6;}#ocMenu[data-theme="light"] .oc-seg button.on .s2{color:#6b8fd6;}'
    + '#ocMenu[data-theme="light"] .oc-tile:hover{border-color:#e3e9f2;background:#fff;}#ocMenu[data-theme="light"] .oc-tile .t{color:#16233b;}#ocMenu[data-theme="light"] .oc-tile .s{color:#8593a6;}#ocMenu[data-theme="light"] .oc-tile .ic{background:#eef3fb;color:#2f6bff;}'
    + '#ocMenu[data-theme="light"] .oc-pf{border-top:1px solid #eef1f6;}#ocMenu[data-theme="light"] .oc-pf .s{color:#7c8a9c;}#ocMenu[data-theme="light"] .oc-pf .src{color:#9aa6b6;}'
    // NIGHT
    + '#ocMenu[data-theme="dark"]{background:#0e1a2c;box-shadow:0 30px 80px rgba(0,0,0,.6);}'
    + '#ocMenu[data-theme="dark"] .oc-ph{border-bottom:1px solid rgba(255,255,255,.06);}#ocMenu[data-theme="dark"] .oc-brand{color:#fff;}#ocMenu[data-theme="dark"] .oc-sub{color:#7d93b3;}'
    + '#ocMenu[data-theme="dark"] .oc-live{background:rgba(16,185,129,.14);color:#34d399;}#ocMenu[data-theme="dark"] .oc-clock{color:#dbe6f5;}#ocMenu[data-theme="dark"] .oc-x{background:rgba(255,255,255,.07);color:#a9bcd8;}'
    + '#ocMenu[data-theme="dark"] .oc-lbl{color:#6f85a5;}'
    + '#ocMenu[data-theme="dark"] .oc-seg button{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.09);color:#aebfd6;}#ocMenu[data-theme="dark"] .oc-seg .s2{color:#7387a3;}'
    + '#ocMenu[data-theme="dark"] .oc-seg button.on{background:rgba(47,107,255,.16);border-color:#3f7bff;color:#cfe0ff;}#ocMenu[data-theme="dark"] .oc-seg button.on .s2{color:#8fb0ea;}'
    + '#ocMenu[data-theme="dark"] .oc-tile:hover{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.03);}#ocMenu[data-theme="dark"] .oc-tile .t{color:#eaf1fb;}#ocMenu[data-theme="dark"] .oc-tile .s{color:#8ba0be;}#ocMenu[data-theme="dark"] .oc-tile .ic{background:rgba(63,123,255,.13);color:#6ea4ff;}'
    + '#ocMenu[data-theme="dark"] .oc-pf{border-top:1px solid rgba(255,255,255,.06);}#ocMenu[data-theme="dark"] .oc-pf .s{color:#8ba0be;}#ocMenu[data-theme="dark"] .oc-pf .src{color:#6e83a3;}';

  function tile(id, icon, title, sub) {
    return '<button class="oc-tile" data-oc="' + id + '"><span class="ic"><svg width="24" height="24"><use href="#oc-' + icon + '"/></svg></span>'
      + '<span><span class="t">' + title + '</span><span class="s" data-ocsub="' + id + '">' + sub + '</span></span></button>';
  }
  function segBtn(mode, icon, title, sub) {
    return '<button class="oc-seg-btn" data-ocdisp="' + mode + '"><svg width="26" height="26"><use href="#oc-' + icon + '"/></svg>'
      + '<span>' + title + '<span class="s2">' + sub + '</span></span></button>';
  }

  var MENU_HTML = ''
    + '<div class="oc-ph"><div><div class="oc-brand">F.I.D.S. Console</div><div class="oc-sub">Orion Connected</div></div><div class="oc-sp"></div>'
    +   '<div class="oc-live"><span class="d"></span>LIVE</div><div class="oc-clock" id="ocClock">--:--</div>'
    +   '<button class="oc-x" data-oc="close"><svg width="17" height="17"><use href="#oc-x"/></svg></button></div>'
    + '<div class="oc-lbl">Display</div>'
    + '<div class="oc-seg">'
    +   segBtn('main', 'board', 'Main Board', 'Departures &amp; arrivals')
    +   segBtn('gate', 'gate', 'Gate Screen', 'Pick a gate →')
    +   segBtn('baggage', 'bag', 'Baggage', 'Pick a carousel →')
    + '</div>'
    + '<div class="oc-lbl">Controls</div>'
    + '<div class="oc-grid">'
    +   tile('airport', 'airport', 'Airport', 'YQM')
    +   tile('search', 'search', 'Find a flight', 'Flight, city or airline')
    +   tile('theme', 'theme', 'Theme', 'Day / night &amp; colours')
    +   tile('bg', 'bg', 'Background', 'Photo · airline · custom')
    +   tile('add', 'add', 'Add test flight', 'Preview a flight row')
    +   tile('ovr', 'ovr', 'Gate overrides', 'Per-flight corrections')
    + '</div>'
    + '<div class="oc-pf"><span class="oc-live" style="padding:5px 11px;"><span class="d"></span>LIVE</span>'
    +   '<span class="s" id="ocUpd">Live</span><span class="src">◆ AERODATABOX</span></div>';

  function currentTheme() {
    try {
      var t = localStorage.getItem('fids_console_theme');
      if (t === 'light' || t === 'dark') return t;
    } catch (e) {}
    var h = new Date().getHours();
    return (h >= 6 && h < 19) ? 'light' : 'dark';
  }
  function iataNow() {
    try { return (document.getElementById('apSel') || {}).value || 'YQM'; } catch (e) { return 'YQM'; }
  }
  function refresh() {
    var menu = document.getElementById('ocMenu'); if (!menu) return;
    menu.setAttribute('data-theme', currentTheme());
    // clock
    try {
      var iata = iataNow(); var tz = ((typeof AP !== 'undefined' ? AP : {})[iata] || {}).tz;
      var opts = { hour: '2-digit', minute: '2-digit', hour12: true }; if (tz) opts.timeZone = tz;
      var cl = document.getElementById('ocClock'); if (cl) cl.textContent = new Date().toLocaleTimeString('en-US', opts);
    } catch (e) {}
    // airport sub-label
    try {
      var ia = iataNow(); var nm = ((typeof AP !== 'undefined' ? AP : {})[ia] || {}).name || ia;
      var el = menu.querySelector('[data-ocsub="airport"]'); if (el) el.textContent = ia + ' · ' + nm;
    } catch (e) {}
    // active display
    try {
      var st = (typeof screenType !== 'undefined') ? screenType : 'main';
      menu.querySelectorAll('.oc-seg-btn').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-ocdisp') === st); });
    } catch (e) {}
  }

  var _clockTimer = null;
  function openMenu() {
    document.getElementById('ocScrim').classList.add('open');
    document.getElementById('ocMenu').classList.add('open');
    refresh();
    if (_clockTimer) clearInterval(_clockTimer);
    _clockTimer = setInterval(refresh, 1000);
  }
  function closeMenu() {
    document.getElementById('ocScrim').classList.remove('open');
    document.getElementById('ocMenu').classList.remove('open');
    if (_clockTimer) { clearInterval(_clockTimer); _clockTimer = null; }
  }

  function call(fn) { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {} }

  function handle(action) {
    switch (action) {
      case 'close': closeMenu(); break;
      case 'airport':
        // reveal the existing airport panel + focus its search
        try {
          document.body.classList.remove('mbar-hidden');
          var ap = document.getElementById('apPanel'); if (ap) ap.classList.remove('hidden');
          var inp = document.getElementById('apSelInput'); if (inp) { inp.focus(); inp.select(); }
        } catch (e) {}
        closeMenu();
        break;
      case 'search':
        try {
          document.body.classList.remove('mbar-hidden');
          var si = document.getElementById('searchInput'); if (si) si.focus();
        } catch (e) {}
        closeMenu();
        break;
      case 'theme':
        // flip console theme via menu.js if present, else toggle our own
        try {
          var next = currentTheme() === 'light' ? 'dark' : 'light';
          if (typeof window.smApplyTheme === 'function') window.smApplyTheme(next);
          else localStorage.setItem('fids_console_theme', next);
        } catch (e) {}
        refresh();
        break;
      case 'bg':
        // cycle photo → airline → custom on dedicated screens
        try {
          if (typeof window.setDedicatedBgMode === 'function') {
            window._ocBg = (window._ocBg === 'airline') ? 'custom' : (window._ocBg === 'custom' ? 'photo' : 'airline');
            window.setDedicatedBgMode(window._ocBg);
          }
        } catch (e) {}
        break;
      case 'add': call('openTestFlight'); closeMenu(); break;
      case 'ovr': call('toggleOverridePanel'); closeMenu(); break;
    }
  }

  function setDisplay(mode) {
    try { if (typeof window.changeScreenType === 'function') window.changeScreenType(mode); } catch (e) {}
    refresh();
  }

  function init() {
    if (document.getElementById('ocMenu')) return;
    var style = document.createElement('style'); style.id = 'ocMenuStyle'; style.textContent = CSS; document.head.appendChild(style);
    var wrap = document.createElement('div'); wrap.innerHTML = ICONS; document.body.appendChild(wrap.firstChild);

    var scrim = document.createElement('div'); scrim.id = 'ocScrim'; document.body.appendChild(scrim);
    var menu = document.createElement('div'); menu.id = 'ocMenu'; menu.setAttribute('data-theme', currentTheme()); menu.innerHTML = MENU_HTML; document.body.appendChild(menu);
    var trig = document.createElement('button'); trig.id = 'ocTrigger'; trig.title = 'Console menu (preview)';
    trig.innerHTML = '<svg width="22" height="22"><use href="#oc-menu"/></svg>'; document.body.appendChild(trig);

    trig.addEventListener('click', openMenu);
    scrim.addEventListener('click', closeMenu);
    menu.addEventListener('click', function (e) {
      var seg = e.target.closest('.oc-seg-btn'); if (seg) { setDisplay(seg.getAttribute('data-ocdisp')); return; }
      var t = e.target.closest('[data-oc]'); if (t) handle(t.getAttribute('data-oc'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    window.ocOpenMenu = openMenu;   // harness hook
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
