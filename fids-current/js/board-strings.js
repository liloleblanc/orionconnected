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
  // weekdaySep  (optional) what sets the weekday off in a long date, where
  //         the board's own style differs from Intl's: English boards print
  //         'Friday  September 18, 2026'. Every other language takes Intl's.
  // script  the script a value must contain (the guard checks ja/zh/ar)
  // stop    a Latin-script language's short words, which give a sentence's
  //         language away (looksLike): a feed asked for one language often
  //         answers in English (Accor answers Accept-Language with English
  //         where it has nothing else). English's carries a few of the words
  //         a hotel's English copy is made of ('pool', 'center', 'indoor'),
  //         so a list of amenities with no small words in it is still told
  //         apart.
  var META = {
    en: { dir: 'ltr', intl: 'en-CA', clock24: false, colon: ': ',  weekdaySep: '  ', script: 'latin', name: 'English',
      stop: 'the and of to with in for our your is are at from on by this that you we its it an as be has have will all each every just than '
      + 'center indoor outdoor pool free room rooms breakfast meeting meetings space located steps away walk minutes downtown near new home '
      + 'welcome luxury best heart city view views guest guests stay family friendly shopping nearby perfect ideal comfortable spacious world '
      + 'hot tub gym laundry kids offers enjoy discover experience modern contemporary situated' },
    fr: { dir: 'ltr', intl: 'fr-CA', clock24: true,  colon: ' : ', hourMark: 'h ', script: 'latin', name: 'Français',
      stop: 'le la les des du de et à au aux pour avec dans est une un nos votre vos sur par en ce cette qui que où son sa ses' },
    es: { dir: 'ltr', intl: 'es',    clock24: true,  colon: ': ',  script: 'latin', name: 'Español',
      stop: 'el la los las de del y en con para su sus un una es al por que nuestro nuestra este esta' },
    de: { dir: 'ltr', intl: 'de',    clock24: true,  colon: ': ',  script: 'latin', name: 'Deutsch',
      stop: 'der die das und mit für ist im in den dem des ein eine zu zum zur von bei auf unser unsere ihr ihre' },
    it: { dir: 'ltr', intl: 'it',    clock24: true,  colon: ': ',  script: 'latin', name: 'Italiano',
      stop: 'il lo la le gli i di e con per un una è del della dei delle nel nella al alla che nostro nostra' },
    pt: { dir: 'ltr', intl: 'pt',    clock24: true,  colon: ': ',  script: 'latin', name: 'Português',
      stop: 'o a os as de e com para um uma é do da dos das no na nos nas ao pelo pela que nosso nossa seu sua' },
    ja: { dir: 'ltr', intl: 'ja',    clock24: true,  colon: '：',  script: 'jpan',  name: '日本語' },
    zh: { dir: 'ltr', intl: 'zh',    clock24: true,  colon: '：',  script: 'hans',  name: '中文' },
    ar: { dir: 'rtl', intl: 'ar',    clock24: true,  colon: ': ',  script: 'arab',  name: 'العربية' }
  };

  var _stopSet = {};
  Object.keys(META).forEach(function (l) {
    _stopSet[l] = Object.create(null);
    String(META[l].stop || '').split(' ').forEach(function (w) { if (w) _stopSet[l][w] = true; });
  });

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
    // ── DAYS ──────────────────────────────────────────────────────────────
    // The gate's day line (gate-date-context.js getFlightDayWords) and the
    // weather strips. Moved here from TOMORROW and LS.tomorrow, which held
    // the same nine words twice.
    tomorrow: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Morgen', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },

    // ── LOADERS AND STATUS LINES ──────────────────────────────────────────
    // The boot loader of fids/gids/bids/index (it greets in the board's own
    // languages now, not a fixed six) and its status line. The greetings copy
    // the boards' own words: _GATE_LBL.nowBoarding, _GATE_LBL.welcome and
    // LS.bagClaim.
    greetGate: { en: 'Now boarding', fr: 'Embarquement', es: 'Embarcando ahora', de: 'Jetzt Boarding', it: 'Imbarco in corso', pt: 'Embarque em curso', ja: '搭乗中', zh: '正在登机', ar: 'الصعود الآن' },
    greetBoard: { en: 'Welcome', fr: 'Bienvenue', es: 'Bienvenido', de: 'Willkommen', it: 'Benvenuto', pt: 'Bem-vindo', ja: 'ようこそ', zh: '欢迎', ar: 'أهلاً' },
    greetBags: { en: 'Baggage claim', fr: 'Retrait des bagages', es: 'Recogida de equipaje', de: 'Gepäckausgabe', it: 'Ritiro bagagli', pt: 'Retirada de bagagem', ja: '手荷物受取所', zh: '行李提取', ar: 'استلام الأمتعة' },
    loading: { en: 'Loading', fr: 'Chargement', es: 'Cargando', de: 'Wird geladen', it: 'Caricamento', pt: 'Carregando', ja: '読み込み中', zh: '加载中', ar: 'جارٍ التحميل' },
    fetchingLive: { en: 'Fetching live data', fr: 'Récupération des données en direct', es: 'Obteniendo datos en vivo', de: 'Live-Daten werden abgerufen', it: 'Recupero dei dati in tempo reale', pt: 'Obtendo dados ao vivo', ja: 'ライブデータを取得中', zh: '正在获取实时数据', ar: 'جارٍ جلب البيانات المباشرة' },
    loadingDemo: { en: 'Loading demo data', fr: 'Chargement des données de démonstration', es: 'Cargando datos de demostración', de: 'Demodaten werden geladen', it: 'Caricamento dei dati dimostrativi', pt: 'Carregando dados de demonstração', ja: 'デモデータを読み込み中', zh: '正在加载演示数据', ar: 'جارٍ تحميل بيانات العرض التوضيحي' },
    preparingGate: { en: 'Preparing gate screen', fr: 'Préparation de l’écran de la porte', es: 'Preparando la pantalla de la puerta', de: 'Gate-Anzeige wird vorbereitet', it: 'Preparazione dello schermo del gate', pt: 'Preparando a tela do portão', ja: 'ゲート画面を準備中', zh: '正在准备登机口屏幕', ar: 'جارٍ تجهيز شاشة البوابة' },
    preparingBags: { en: 'Preparing baggage screen', fr: 'Préparation de l’écran des bagages', es: 'Preparando la pantalla de equipaje', de: 'Gepäckanzeige wird vorbereitet', it: 'Preparazione dello schermo bagagli', pt: 'Preparando a tela de bagagem', ja: '手荷物画面を準備中', zh: '正在准备行李屏幕', ar: 'جارٍ تجهيز شاشة الأمتعة' },
    live: { en: 'Live', fr: 'En direct', es: 'En vivo', de: 'Live', it: 'In diretta', pt: 'Ao vivo', ja: 'ライブ', zh: '实时', ar: 'مباشر' },
    // The loader's 'GATE 4' line, before the gate's own table has loaded (the words of _GATE_LBL.gate).
    gateWord: { en: 'Gate', fr: 'Porte', es: 'Puerta', de: 'Gate', it: 'Gate', pt: 'Portão', ja: 'ゲート', zh: '登机口', ar: 'البوابة' },
    login: { en: 'Login', fr: 'Connexion', es: 'Iniciar sesión', de: 'Anmelden', it: 'Accedi', pt: 'Entrar', ja: 'ログイン', zh: '登录', ar: 'تسجيل الدخول' },

    // ── EMPTY AND ERROR PANELS ────────────────────────────────────────────
    // Drawn in capitals by the panel's CSS; written here in sentence case so
    // each language keeps its own capitalisation rules.
    noFlightsWindow: { en: 'No flights in window', fr: 'Aucun vol dans la plage horaire', es: 'Sin vuelos en este intervalo', de: 'Keine Flüge im Zeitfenster', it: 'Nessun volo in questa fascia oraria', pt: 'Sem voos neste intervalo', ja: '表示時間内の便はありません', zh: '当前时段无航班', ar: 'لا رحلات في هذه الفترة' },
    noFlightsWindowSub: { en: 'No departures or arrivals in the current time window', fr: 'Aucun départ ni aucune arrivée dans la plage horaire actuelle', es: 'No hay salidas ni llegadas en el intervalo actual', de: 'Keine Abflüge oder Ankünfte im aktuellen Zeitfenster', it: 'Nessuna partenza o arrivo nella fascia oraria attuale', pt: 'Nenhuma partida ou chegada no intervalo atual', ja: '現在の時間帯に出発便・到着便はありません', zh: '当前时段没有出发或到达航班', ar: 'لا توجد رحلات مغادرة أو وصول في الفترة الحالية' },
    noLiveData: { en: 'No live data for this airport', fr: 'Aucune donnée en direct pour cet aéroport', es: 'Sin datos en vivo para este aeropuerto', de: 'Keine Live-Daten für diesen Flughafen', it: 'Nessun dato in tempo reale per questo aeroporto', pt: 'Sem dados ao vivo para este aeroporto', ja: 'この空港のライブデータはありません', zh: '本机场暂无实时数据', ar: 'لا توجد بيانات مباشرة لهذا المطار' },
    noFeedYet: { en: '{AIRPORT} has no flight feed yet', fr: '{AIRPORT} n’a pas encore de flux de vols', es: '{AIRPORT} aún no tiene fuente de vuelos', de: '{AIRPORT} hat noch keinen Flugdaten-Feed', it: '{AIRPORT} non ha ancora un flusso di voli', pt: '{AIRPORT} ainda não tem fonte de voos', ja: '{AIRPORT}のフライト情報はまだありません', zh: '{AIRPORT} 暂无航班数据源', ar: 'لا يتوفر بعد مصدر بيانات رحلات لـ {AIRPORT}' },
    liveDataError: { en: 'Live data error', fr: 'Erreur des données en direct', es: 'Error en los datos en vivo', de: 'Fehler bei den Live-Daten', it: 'Errore nei dati in tempo reale', pt: 'Erro nos dados ao vivo', ja: 'ライブデータのエラー', zh: '实时数据错误', ar: 'خطأ في البيانات المباشرة' },
    noResultsFor: { en: 'No results for “{Q}”', fr: 'Aucun résultat pour « {Q} »', es: 'Sin resultados para «{Q}»', de: 'Keine Ergebnisse für „{Q}“', it: 'Nessun risultato per «{Q}»', pt: 'Nenhum resultado para “{Q}”', ja: '「{Q}」に一致する結果はありません', zh: '没有与“{Q}”匹配的结果', ar: 'لا توجد نتائج لـ «{Q}»' },
    noData: { en: 'No data', fr: 'Aucune donnée', es: 'Sin datos', de: 'Keine Daten', it: 'Nessun dato', pt: 'Sem dados', ja: 'データなし', zh: '无数据', ar: 'لا توجد بيانات' },

    // ── GATE ──────────────────────────────────────────────────────────────
    // The aircraft panel's qualifier for a registration or type taken from
    // the aircraft's usual rotation rather than confirmed: 'C-GWJO expected'.
    // It was written into markup six times as English plus French or Spanish,
    // by airport default rather than by the board's languages.
    expected: { en: 'expected', fr: 'prévu', es: 'prevista', de: 'voraussichtlich', it: 'previsto', pt: 'prevista', ja: '予定', zh: '预计', ar: 'متوقعة',
      $ctx: 'aircraft' },
    aircraftDetails: { en: 'Aircraft details', fr: 'Détails de l’appareil', es: 'Datos del avión', de: 'Flugzeugdaten', it: 'Dettagli dell’aereo', pt: 'Detalhes da aeronave', ja: '機材情報', zh: '机型信息', ar: 'تفاصيل الطائرة' },
    dataBusy: { en: 'Data service busy — retrying', fr: 'Service de données occupé — nouvel essai', es: 'Servicio de datos ocupado — reintentando', de: 'Datendienst ausgelastet — neuer Versuch', it: 'Servizio dati occupato — nuovo tentativo', pt: 'Serviço de dados ocupado — nova tentativa', ja: 'データサービス混雑中 — 再試行しています', zh: '数据服务繁忙 — 正在重试', ar: 'خدمة البيانات مشغولة — جارٍ إعادة المحاولة' },
    dataDown: { en: 'Data service unavailable ({N})', fr: 'Service de données indisponible ({N})', es: 'Servicio de datos no disponible ({N})', de: 'Datendienst nicht verfügbar ({N})', it: 'Servizio dati non disponibile ({N})', pt: 'Serviço de dados indisponível ({N})', ja: 'データサービス利用不可（{N}）', zh: '数据服务不可用（{N}）', ar: 'خدمة البيانات غير متاحة ({N})' },
    // The gate's welcome screen. The curated phrase LS.nextDep carried until a
    // later duplicate of the key overwrote it with 'Next departure'.
    nextDepGate: { en: 'Next departure from this gate', fr: 'Prochain départ de cette porte', es: 'Próxima salida desde esta puerta', de: 'Nächster Abflug von diesem Gate', it: 'Prossima partenza da questo gate', pt: 'Próxima partida deste portão', ja: 'このゲートからの次の出発', zh: '本登机口下一航班', ar: 'المغادرة التالية من هذه البوابة' },
    flightToCity: { en: '{FLIGHT} to {CITY}', fr: '{FLIGHT} à destination de {CITY}', es: '{FLIGHT} a {CITY}', de: '{FLIGHT} nach {CITY}', it: '{FLIGHT} per {CITY}', pt: '{FLIGHT} para {CITY}', ja: '{FLIGHT}便 {CITY}行き', zh: '{FLIGHT} 飞往 {CITY}', ar: 'الرحلة {FLIGHT} إلى {CITY}',
      $ctx: 'sentence' },
    // A revised time: the words of fids-v2.js TX.now, which the boards already
    // print beside a revised time.
    nowAt: { en: 'Now {TIME}', fr: 'Maintenant {TIME}', es: 'Ahora {TIME}', de: 'Jetzt {TIME}', it: 'Ora {TIME}', pt: 'Agora {TIME}', ja: '変更 {TIME}', zh: '现改为 {TIME}', ar: 'الآن {TIME}',
      $ctx: 'revised-time' },
    // Moved here from LS: the generic boarding sign asked _gateLbl for them,
    // found nothing in _GATE_LBL, and fell back to one language.
    boardNow: { en: 'Boarding now', fr: 'Embarquement en cours', es: 'Embarcando ahora', de: 'Jetzt Boarding', it: 'Imbarco in corso', pt: 'Embarque agora', ja: '搭乗中', zh: '正在登机', ar: 'الصعود الآن' },
    boardNext: { en: 'Boarding next', fr: 'Prochain embarquement', es: 'Próximo embarque', de: 'Nächstes Boarding', it: 'Prossimo imbarco', pt: 'Próximo embarque', ja: '次の搭乗', zh: '下一组登机', ar: 'الصعود التالي' },
    demoStamp: { en: 'Demonstration', fr: 'Démonstration', es: 'Demostración', de: 'Demonstration', it: 'Dimostrazione', pt: 'Demonstração', ja: 'デモンストレーション', zh: '演示', ar: 'عرض توضيحي' },
    notLiveFlight: { en: 'not a live flight', fr: 'vol fictif', es: 'vuelo ficticio', de: 'kein echter Flug', it: 'volo fittizio', pt: 'voo fictício', ja: '実際の便ではありません', zh: '非真实航班', ar: 'ليست رحلة حقيقية' },

    // ── PRE-BOARDING, TRAVEL DOCUMENTS, LOYALTY AND CABINS ────────────────
    // Moved here from _GATE_LBL so each carries where its words come from.
    // The airline's own published wording is used in every language the
    // airline publishes; the rest are careful translations, marked so that
    // ?i18n=provenance (localhost) outlines them on the pictures. Porter
    // publishes English and French only: PorterReserve / PorterRéserve,
    // PorterClassic / PorterClassique and AvidTraveller / Grand Voyageur are
    // its own names (flyporter.com, en-ca and fr-ca), kept as brand names in
    // the other seven languages.
    // Porter's own words, in both languages it publishes (flyporter.com,
    // Boarding process, en-ca and fr-ca, read 2026-10-04): "Pre-boarding" /
    // « préembarquement », "general boarding" / « embarquement général ».
    preboard: { en: 'Pre-boarding', fr: 'Préembarquement', es: 'Preembarque', de: 'Vorab-Einstieg', it: 'Preimbarco', pt: 'Pré-embarque', ja: '優先搭乗', zh: '优先登机', ar: 'صعود مسبق',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    genboard: { en: 'General boarding', fr: 'Embarquement général', es: 'Embarque general', de: 'Allgemeines Boarding', it: 'Imbarco generale', pt: 'Embarque geral', ja: '一般搭乗', zh: '普通登机', ar: 'صعود عام',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    photoId: { en: 'Have your ID ready for presentation', fr: 'Veuillez avoir votre pièce d’identité prête', es: 'Tenga su identificación con foto lista', de: 'Halten Sie Ihren Lichtbildausweis bereit', it: 'Tenete pronto un documento con foto', pt: 'Tenha sua identificação com foto pronta', ja: '写真付き身分証明書をご用意ください', zh: '请准备好带照片的身份证件', ar: 'يرجى تجهيز بطاقة هوية تحمل صورة',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Porter's own pre-boarding list, as Porter publishes it in English and
    // French (flyporter.com, Boarding process, "Boarding order" / « Ordre
    // d'embarquement », read 2026-10-04); the other seven languages are
    // careful translations of it. The French names the cabin PorterRéserve.
    preboardList: { en: 'Passengers with disabilities · Unaccompanied minors · Families traveling with children age two and younger · Premium VIPorter members · PorterReserve passengers',
      fr: 'Passagers ayant un handicap · Mineurs non accompagnés · Passagers voyageant avec des enfants de deux ans ou moins · Membres VIPorter premium · Passagers en catégorie PorterRéserve',
      es: 'Pasajeros con discapacidad · Menores no acompañados · Familias que viajan con niños de dos años o menos · Miembros Premium de VIPorter · Pasajeros de PorterReserve',
      de: 'Passagiere mit Behinderung · Alleinreisende Minderjährige · Familien mit Kindern bis zwei Jahre · Premium-Mitglieder von VIPorter · Passagiere der PorterReserve',
      it: 'Passeggeri con disabilità · Minori non accompagnati · Famiglie con bambini fino a due anni · Membri Premium di VIPorter · Passeggeri PorterReserve',
      pt: 'Passageiros com deficiência · Menores desacompanhados · Famílias com crianças de até dois anos · Membros Premium do VIPorter · Passageiros da PorterReserve',
      ja: '障がいのあるお客様 · 同伴者のいない未成年のお客様 · 2歳以下のお子様連れのご家族 · VIPorterプレミアム会員 · PorterReserveのお客様',
      zh: '残障旅客 · 无成人陪伴的未成年人 · 携带两岁及以下儿童的家庭 · VIPorter高级会员 · PorterReserve旅客',
      ar: 'الركاب ذوو الإعاقة · القاصرون غير المصحوبين · العائلات المسافرة مع أطفال بعمر سنتين أو أقل · أعضاء VIPorter المميزون · ركاب PorterReserve',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    pdReserve: { en: 'PorterReserve', fr: 'PorterRéserve', es: 'PorterReserve', de: 'PorterReserve', it: 'PorterReserve', pt: 'PorterReserve', ja: 'PorterReserve', zh: 'PorterReserve', ar: 'PorterReserve',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // The four VIPorter elite tiers, as Porter names them (flyporter.com en-ca
    // and fr-ca: Porter RENAMES them in French). The other seven languages
    // keep Porter's English names: a tier name is a brand. Alt text of the
    // tier artwork on the priority sign.
    pdTierPassport: { en: 'VIPorter Passport', fr: 'VIPorter Passeport', es: 'VIPorter Passport', de: 'VIPorter Passport', it: 'VIPorter Passport', pt: 'VIPorter Passport', ja: 'VIPorter Passport', zh: 'VIPorter Passport', ar: 'VIPorter Passport',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'airline:PD', de: 'airline:PD', it: 'airline:PD', pt: 'airline:PD', ja: 'airline:PD', zh: 'airline:PD', ar: 'airline:PD' } },
    pdTierVenture: { en: 'VIPorter Venture', fr: 'VIPorter Horizon', es: 'VIPorter Venture', de: 'VIPorter Venture', it: 'VIPorter Venture', pt: 'VIPorter Venture', ja: 'VIPorter Venture', zh: 'VIPorter Venture', ar: 'VIPorter Venture',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'airline:PD', de: 'airline:PD', it: 'airline:PD', pt: 'airline:PD', ja: 'airline:PD', zh: 'airline:PD', ar: 'airline:PD' } },
    pdTierAscent: { en: 'VIPorter Ascent', fr: 'VIPorter Essor', es: 'VIPorter Ascent', de: 'VIPorter Ascent', it: 'VIPorter Ascent', pt: 'VIPorter Ascent', ja: 'VIPorter Ascent', zh: 'VIPorter Ascent', ar: 'VIPorter Ascent',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'airline:PD', de: 'airline:PD', it: 'airline:PD', pt: 'airline:PD', ja: 'airline:PD', zh: 'airline:PD', ar: 'airline:PD' } },
    pdTierFirst: { en: 'VIPorter First', fr: 'VIPorter Première', es: 'VIPorter First', de: 'VIPorter First', it: 'VIPorter First', pt: 'VIPorter First', ja: 'VIPorter First', zh: 'VIPorter First', ar: 'VIPorter First',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'airline:PD', de: 'airline:PD', it: 'airline:PD', pt: 'airline:PD', ja: 'airline:PD', zh: 'airline:PD', ar: 'airline:PD' } },
    pdClassic: { en: 'PorterClassic', fr: 'PorterClassique', es: 'PorterClassic', de: 'PorterClassic', it: 'PorterClassic', pt: 'PorterClassic', ja: 'PorterClassic', zh: 'PorterClassic', ar: 'PorterClassic',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    avidTraveller: { en: 'AvidTraveller', fr: 'Grand Voyageur', es: 'AvidTraveller', de: 'AvidTraveller', it: 'AvidTraveller', pt: 'AvidTraveller', ja: 'AvidTraveller', zh: 'AvidTraveller', ar: 'AvidTraveller',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinBiz: { en: 'Business Class', fr: 'Classe affaires', es: 'Clase Ejecutiva', de: 'Business Class', it: 'Business Class', pt: 'Classe Executiva', ja: 'ビジネスクラス', zh: '商务舱', ar: 'درجة رجال الأعمال',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinFirst: { en: 'First Class', fr: 'Première classe', es: 'Primera Clase', de: 'First Class', it: 'Prima Classe', pt: 'Primeira Classe', ja: 'ファーストクラス', zh: '头等舱', ar: 'الدرجة الأولى',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinClub: { en: 'Club Class', fr: 'Classe Club', es: 'Clase Club', de: 'Club Class', it: 'Classe Club', pt: 'Classe Club', ja: 'クラブクラス', zh: '俱乐部舱', ar: 'درجة كلوب',
      $src: { en: 'airline:TS', fr: 'airline:TS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinEcon: { en: 'Economy Class', fr: 'Classe économique', es: 'Clase Económica', de: 'Economy Class', it: 'Classe Economica', pt: 'Classe Econômica', ja: 'エコノミークラス', zh: '经济舱', ar: 'الدرجة السياحية',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinPremiumWS: { en: 'Premium', fr: 'Premium', es: 'Premium', de: 'Premium', it: 'Premium', pt: 'Premium', ja: 'プレミアム', zh: '高级舱', ar: 'بريميوم',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinEconWS: { en: 'Economy', fr: 'Économie', es: 'Económica', de: 'Economy', it: 'Economica', pt: 'Econômica', ja: 'エコノミー', zh: '经济舱', ar: 'اقتصادي',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinPremRouge: { en: 'Premium Rouge', fr: 'Premium Rouge', es: 'Premium Rouge', de: 'Premium Rouge', it: 'Premium Rouge', pt: 'Premium Rouge', ja: 'Premium Rouge', zh: 'Premium Rouge', ar: 'Premium Rouge',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinUnitedFirst: { en: 'United First', fr: 'United First', es: 'United First', de: 'United First', it: 'United First', pt: 'United First', ja: 'United First', zh: 'United First', ar: 'United First',
      $src: { en: 'airline:UA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinUnitedEcon: { en: 'United Economy', fr: 'United Economy', es: 'United Economy', de: 'United Economy', it: 'United Economy', pt: 'United Economy', ja: 'United Economy', zh: 'United Economy', ar: 'United Economy',
      $src: { en: 'airline:UA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },

    // ── HERITAGE CARD ("FROM THE ARCHIVE") ────────────────────────────────
    // The kicker and the captions of the archive card on the gate. Captions
    // are careful translations of historical facts; place names follow each
    // language's own form (Neuschottland, Terranova).
    heritageKicker: { en: 'From the archive', fr: 'Depuis les archives', es: 'Del archivo', de: 'Aus dem Archiv', it: 'Dall’archivio', pt: 'Do arquivo', ja: 'アーカイブより', zh: '档案回顾', ar: 'من الأرشيف' },
    'heritage:air-atlantic': { en: 'St. John’s, Newfoundland · a Canadian Partner · until 1998', fr: 'St. John’s (Terre-Neuve) · partenaire de Canadien · jusqu’en 1998', es: 'St. John’s (Terranova) · socio de Canadian · hasta 1998', de: 'St. John’s (Neufundland) · Partner von Canadian · bis 1998', it: 'St. John’s (Terranova) · partner di Canadian · fino al 1998', pt: 'St. John’s (Terra Nova) · parceira da Canadian · até 1998', ja: 'セントジョンズ（ニューファンドランド）· カナディアン航空の提携会社 · 1998年まで', zh: '圣约翰斯（纽芬兰）· 加拿大国际航空合作伙伴 · 至1998年', ar: 'سانت جونز (نيوفاوندلاند) · شريك لشركة كنديان · حتى 1998' },
    'heritage:air-nova': { en: 'Halifax, Nova Scotia · the first Air Canada Connector · 1986–2001', fr: 'Halifax (Nouvelle-Écosse) · premier Connecteur Air Canada · 1986–2001', es: 'Halifax (Nueva Escocia) · el primer Air Canada Connector · 1986–2001', de: 'Halifax (Neuschottland) · der erste Air Canada Connector · 1986–2001', it: 'Halifax (Nuova Scozia) · il primo Air Canada Connector · 1986–2001', pt: 'Halifax (Nova Escócia) · o primeiro Air Canada Connector · 1986–2001', ja: 'ハリファックス（ノバスコシア）· 最初のエア・カナダ・コネクター · 1986–2001', zh: '哈利法克斯（新斯科舍）· 首家加航联运航空公司 · 1986–2001', ar: 'هاليفاكس (نوفا سكوشا) · أول شركة «إير كندا كونكتور» · 1986–2001' },
    'heritage:canadian-airlines': { en: 'Calgary · 1987–2001', fr: 'Calgary · 1987–2001', es: 'Calgary · 1987–2001', de: 'Calgary · 1987–2001', it: 'Calgary · 1987–2001', pt: 'Calgary · 1987–2001', ja: 'カルガリー · 1987–2001', zh: '卡尔加里 · 1987–2001', ar: 'كالغاري · 1987–2001' },
    'heritage:air-canada': { en: 'Montreal · DC-9 · 1966–2002', fr: 'Montréal · DC-9 · 1966–2002', es: 'Montreal · DC-9 · 1966–2002', de: 'Montreal · DC-9 · 1966–2002', it: 'Montréal · DC-9 · 1966–2002', pt: 'Montreal · DC-9 · 1966–2002', ja: 'モントリオール · DC-9 · 1966–2002', zh: '蒙特利尔 · DC-9 · 1966–2002', ar: 'مونتريال · DC-9 · 1966–2002' },
    'heritage:air-canada-caps': { en: 'Montreal · DC-9 · 1966–2002', fr: 'Montréal · DC-9 · 1966–2002', es: 'Montreal · DC-9 · 1966–2002', de: 'Montreal · DC-9 · 1966–2002', it: 'Montréal · DC-9 · 1966–2002', pt: 'Montreal · DC-9 · 1966–2002', ja: 'モントリオール · DC-9 · 1966–2002', zh: '蒙特利尔 · DC-9 · 1966–2002', ar: 'مونتريال · DC-9 · 1966–2002' },

    // ── WEATHER ───────────────────────────────────────────────────────────
    // The weather strips' condition words (one entry per phrase; tioLabel()
    // maps a WMO or Tomorrow.io code to its key). They replace TIO_LABEL and
    // its parallel _FR/_ES/_DE tables, which stopped at four languages. Where
    // the weather card already says the same phrase (_WXLBL) its words are
    // reused, so a strip and the card never disagree.
    wxClear: { en: 'Clear', fr: 'Dégagé', es: 'Despejado', de: 'Klar', it: 'Sereno', pt: 'Limpo', ja: '快晴', zh: '晴朗', ar: 'صافٍ' },
    wxMostlyClear: { en: 'Mostly Clear', fr: 'Généralement dégagé', es: 'Mayormente despejado', de: 'Überwiegend klar', it: 'Prevalentemente sereno', pt: 'Predominantemente limpo', ja: 'おおむね晴れ', zh: '大部晴朗', ar: 'صافٍ في الغالب' },
    wxPartlyCloudy: { en: 'Partly Cloudy', fr: 'Partiellement nuageux', es: 'Parcialmente nublado', de: 'Teils bewölkt', it: 'Parzialmente nuvoloso', pt: 'Parcialmente nublado', ja: '晴れ時々曇り', zh: '局部多云', ar: 'غائم جزئياً' },
    wxCloudy: { en: 'Cloudy', fr: 'Nuageux', es: 'Nublado', de: 'Bewölkt', it: 'Nuvoloso', pt: 'Nublado', ja: '曇り', zh: '阴', ar: 'غائم' },
    wxMostlyCloudy: { en: 'Mostly Cloudy', fr: 'Généralement nuageux', es: 'Mayormente nublado', de: 'Überwiegend bewölkt', it: 'Prevalentemente nuvoloso', pt: 'Predominantemente nublado', ja: 'おおむね曇り', zh: '多云', ar: 'غائم في الغالب' },
    wxFog: { en: 'Fog', fr: 'Brouillard', es: 'Niebla', de: 'Nebel', it: 'Nebbia', pt: 'Neblina', ja: '霧', zh: '雾', ar: 'ضباب' },
    wxRimeFog: { en: 'Rime Fog', fr: 'Brouillard givrant', es: 'Niebla helada', de: 'Raureifnebel', it: 'Nebbia gelata', pt: 'Neblina congelante', ja: '着氷霧', zh: '冻雾', ar: 'ضباب متجمد' },
    wxLightFog: { en: 'Light Fog', fr: 'Brume légère', es: 'Niebla ligera', de: 'Leichter Nebel', it: 'Nebbia leggera', pt: 'Neblina fraca', ja: '薄い霧', zh: '轻雾', ar: 'ضباب خفيف' },
    wxLightDrizzle: { en: 'Light Drizzle', fr: 'Bruine légère', es: 'Llovizna ligera', de: 'Leichter Nieselregen', it: 'Pioviggine leggera', pt: 'Chuvisco fraco', ja: '弱い霧雨', zh: '小毛毛雨', ar: 'رذاذ خفيف' },
    wxDrizzle: { en: 'Drizzle', fr: 'Bruine', es: 'Llovizna', de: 'Nieselregen', it: 'Pioviggine', pt: 'Chuvisco', ja: '霧雨', zh: '毛毛雨', ar: 'رذاذ' },
    wxHeavyDrizzle: { en: 'Heavy Drizzle', fr: 'Forte bruine', es: 'Llovizna fuerte', de: 'Starker Nieselregen', it: 'Pioviggine intensa', pt: 'Chuvisco forte', ja: '強い霧雨', zh: '大毛毛雨', ar: 'رذاذ كثيف' },
    wxFzDrizzle: { en: 'Fz. Drizzle', fr: 'Bruine verg.', es: 'Llovizna helada', de: 'Gefr. Nieselregen', it: 'Pioviggine gelata', pt: 'Chuvisco congelante', ja: '着氷性の霧雨', zh: '冻毛毛雨', ar: 'رذاذ متجمد' },
    wxHvyFzDrizzle: { en: 'Hvy. Fz. Drizzle', fr: 'Forte bruine verg.', es: 'Llovizna helada fuerte', de: 'Starker gefr. Nieselregen', it: 'Forte pioviggine gelata', pt: 'Chuvisco congelante forte', ja: '強い着氷性の霧雨', zh: '强冻毛毛雨', ar: 'رذاذ متجمد كثيف' },
    wxLightRain: { en: 'Light Rain', fr: 'Pluie légère', es: 'Lluvia ligera', de: 'Leichter Regen', it: 'Pioggia leggera', pt: 'Chuva fraca', ja: '小雨', zh: '小雨', ar: 'مطر خفيف' },
    wxRain: { en: 'Rain', fr: 'Pluie', es: 'Lluvia', de: 'Regen', it: 'Pioggia', pt: 'Chuva', ja: '雨', zh: '雨', ar: 'مطر' },
    wxHeavyRain: { en: 'Heavy Rain', fr: 'Pluie forte', es: 'Lluvia fuerte', de: 'Starkregen', it: 'Pioggia forte', pt: 'Chuva forte', ja: '大雨', zh: '大雨', ar: 'مطر غزير' },
    wxFzRain: { en: 'Fz. Rain', fr: 'Pluie verg.', es: 'Lluvia helada', de: 'Gefrierender Regen', it: 'Pioggia gelata', pt: 'Chuva congelante', ja: '着氷性の雨', zh: '冻雨', ar: 'مطر متجمد' },
    wxHvyFzRain: { en: 'Hvy. Fz. Rain', fr: 'Forte pluie verg.', es: 'Lluvia helada fuerte', de: 'Starker gefr. Regen', it: 'Forte pioggia gelata', pt: 'Chuva congelante forte', ja: '強い着氷性の雨', zh: '强冻雨', ar: 'مطر متجمد غزير' },
    wxLtFzRain: { en: 'Lt. Fz. Rain', fr: 'Pluie verg. lég.', es: 'Lluvia helada ligera', de: 'Leichter gefr. Regen', it: 'Pioggia gelata leggera', pt: 'Chuva congelante fraca', ja: '弱い着氷性の雨', zh: '小冻雨', ar: 'مطر متجمد خفيف' },
    wxLightSnow: { en: 'Light Snow', fr: 'Neige légère', es: 'Nieve ligera', de: 'Leichter Schneefall', it: 'Neve leggera', pt: 'Neve fraca', ja: '小雪', zh: '小雪', ar: 'ثلج خفيف' },
    wxSnow: { en: 'Snow', fr: 'Neige', es: 'Nieve', de: 'Schnee', it: 'Neve', pt: 'Neve', ja: '雪', zh: '雪', ar: 'ثلج' },
    wxHeavySnow: { en: 'Heavy Snow', fr: 'Neige forte', es: 'Nieve intensa', de: 'Starker Schneefall', it: 'Neve intensa', pt: 'Neve forte', ja: '大雪', zh: '大雪', ar: 'ثلوج كثيفة' },
    wxSnowGrains: { en: 'Snow Grains', fr: 'Grains de neige', es: 'Granos de nieve', de: 'Schneegriesel', it: 'Granelli di neve', pt: 'Grãos de neve', ja: '霧雪', zh: '米雪', ar: 'حبيبات ثلجية' },
    wxFlurries: { en: 'Flurries', fr: 'Faibles averses de neige', es: 'Nevadas débiles', de: 'Leichte Schneeschauer', it: 'Deboli nevicate', pt: 'Neve intermitente', ja: 'ちらつく雪', zh: '零星小雪', ar: 'زخات ثلج خفيفة' },
    wxLightShowers: { en: 'Light Showers', fr: 'Averses légères', es: 'Chubascos ligeros', de: 'Leichte Schauer', it: 'Rovesci leggeri', pt: 'Pancadas de chuva fracas', ja: '弱いにわか雨', zh: '小阵雨', ar: 'زخات خفيفة' },
    wxShowers: { en: 'Showers', fr: 'Averses', es: 'Chubascos', de: 'Schauer', it: 'Rovesci', pt: 'Pancadas de chuva', ja: 'にわか雨', zh: '阵雨', ar: 'زخات مطر' },
    wxHeavyShowers: { en: 'Heavy Showers', fr: 'Fortes averses', es: 'Chubascos fuertes', de: 'Starke Schauer', it: 'Forti rovesci', pt: 'Pancadas de chuva fortes', ja: '強いにわか雨', zh: '强阵雨', ar: 'زخات غزيرة' },
    wxSnowShowers: { en: 'Snow Showers', fr: 'Averses de neige', es: 'Chubascos de nieve', de: 'Schneeschauer', it: 'Rovesci di neve', pt: 'Pancadas de neve', ja: 'にわか雪', zh: '阵雪', ar: 'زخات ثلجية' },
    wxHvySnowShowers: { en: 'Hvy. Snow Showers', fr: 'Fortes averses de neige', es: 'Chubascos de nieve fuertes', de: 'Starke Schneeschauer', it: 'Forti rovesci di neve', pt: 'Pancadas de neve fortes', ja: '強いにわか雪', zh: '强阵雪', ar: 'زخات ثلجية كثيفة' },
    wxThunderstorm: { en: 'Thunderstorm', fr: 'Orage', es: 'Tormenta', de: 'Gewitter', it: 'Temporale', pt: 'Trovoada', ja: '雷雨', zh: '雷暴', ar: 'عاصفة رعدية' },
    wxThunderHail: { en: 'Thunderstorm + Hail', fr: 'Orage avec grêle', es: 'Tormenta con granizo', de: 'Gewitter mit Hagel', it: 'Temporale con grandine', pt: 'Trovoada com granizo', ja: 'ひょうを伴う雷雨', zh: '雷暴伴冰雹', ar: 'عاصفة رعدية مع برد' },
    wxHvyThunderstorm: { en: 'Hvy. Thunderstorm', fr: 'Fort orage', es: 'Tormenta fuerte', de: 'Schweres Gewitter', it: 'Forte temporale', pt: 'Trovoada forte', ja: '激しい雷雨', zh: '强雷暴', ar: 'عاصفة رعدية قوية' },
    wxLightWind: { en: 'Light Wind', fr: 'Vent léger', es: 'Viento ligero', de: 'Leichter Wind', it: 'Vento debole', pt: 'Vento fraco', ja: '弱い風', zh: '微风', ar: 'رياح خفيفة' },
    wxWindy: { en: 'Windy', fr: 'Venteux', es: 'Ventoso', de: 'Windig', it: 'Ventoso', pt: 'Ventoso', ja: '強風', zh: '大风', ar: 'عاصف' },
    wxStrongWind: { en: 'Strong Wind', fr: 'Vent fort', es: 'Viento fuerte', de: 'Starker Wind', it: 'Vento forte', pt: 'Vento forte', ja: '暴風', zh: '强风', ar: 'رياح قوية' },
    wxIcePellets: { en: 'Ice Pellets', fr: 'Grésil', es: 'Gránulos de hielo', de: 'Eiskörner', it: 'Granuli di ghiaccio', pt: 'Pelotas de gelo', ja: '凍雨', zh: '冰粒', ar: 'حبيبات جليدية' },
    wxHeavyIce: { en: 'Heavy Ice', fr: 'Fort grésil', es: 'Gránulos de hielo fuertes', de: 'Starke Eiskörner', it: 'Forti granuli di ghiaccio', pt: 'Pelotas de gelo fortes', ja: '強い凍雨', zh: '大冰粒', ar: 'حبيبات جليدية كثيفة' },
    wxLtIcePellets: { en: 'Lt. Ice Pellets', fr: 'Grésil léger', es: 'Gránulos de hielo ligeros', de: 'Leichte Eiskörner', it: 'Deboli granuli di ghiaccio', pt: 'Pelotas de gelo fracas', ja: '弱い凍雨', zh: '小冰粒', ar: 'حبيبات جليدية خفيفة' },
    // The credit MET Norway's licence asks for, in the board's languages.
    wxCredit: { en: 'Weather data generously provided by MET Norway', fr: 'Données météo gracieusement fournies par MET Norway', es: 'Datos meteorológicos cortesía de MET Norway', de: 'Wetterdaten freundlicherweise bereitgestellt von MET Norway', it: 'Dati meteo gentilmente forniti da MET Norway', pt: 'Dados meteorológicos gentilmente fornecidos pelo MET Norway', ja: '気象データ提供：MET Norway', zh: '天气数据由 MET Norway 慷慨提供', ar: 'بيانات الطقس مقدَّمة بسخاء من MET Norway' },
    // The weather card's titles and fact labels, moved here from inline
    // objects in _renderWxCard.
    wxReport: { en: 'WEATHER REPORT', fr: 'BULLETIN MÉTÉO', es: 'INFORME DEL CLIMA', de: 'WETTERBERICHT', it: 'BOLLETTINO METEO', pt: 'BOLETIM METEOROLÓGICO', ja: '天気予報', zh: '天气预报', ar: 'نشرة الطقس' },
    wxNextHours: { en: 'NEXT HOURS', fr: 'PROCHAINES HEURES', es: 'PRÓXIMAS HORAS', de: 'NÄCHSTE STUNDEN', it: 'PROSSIME ORE', pt: 'PRÓXIMAS HORAS', ja: '今後の天気', zh: '未来几小时', ar: 'الساعات القادمة' },
    wxForecastN: { en: '{N}-DAY FORECAST', fr: 'PRÉVISIONS {N} JOURS', es: 'PRONÓSTICO {N} DÍAS', de: '{N}-TAGE-VORHERSAGE', it: 'PREVISIONI {N} GIORNI', pt: 'PREVISÃO {N} DIAS', ja: '{N}日間予報', zh: '{N}天预报', ar: 'توقعات {N} أيام' },
    wxNowTitle: { en: 'NOW', fr: 'MAINTENANT', es: 'AHORA', de: 'JETZT', it: 'ORA', pt: 'AGORA', ja: '現在', zh: '现在', ar: 'الآن',
      $ctx: 'weather' },
    // One column an eighth of the card wide: the French is abbreviated.
    wxNowCol: { en: 'Now', fr: 'Maint.', es: 'Ahora', de: 'Jetzt', it: 'Ora', pt: 'Agora', ja: '今', zh: '现在', ar: 'الآن',
      $ctx: 'weather-column' },
    wxFeels: { en: 'Feels like', fr: 'Ressenti', es: 'Sensación', de: 'Gefühlt', it: 'Percepita', pt: 'Sensação', ja: '体感', zh: '体感', ar: 'الحرارة المحسوسة' },
    wxWind: { en: 'Wind', fr: 'Vent', es: 'Viento', de: 'Wind', it: 'Vento', pt: 'Vento', ja: '風', zh: '风', ar: 'الرياح' },
    wxHumidity: { en: 'Humidity', fr: 'Humidité', es: 'Humedad', de: 'Luftfeuchte', it: 'Umidità', pt: 'Umidade', ja: '湿度', zh: '湿度', ar: 'الرطوبة' },
    wxGusts: { en: 'Gusts', fr: 'Rafales', es: 'Ráfagas', de: 'Böen', it: 'Raffiche', pt: 'Rajadas', ja: '突風', zh: '阵风', ar: 'هبات' },
    wxVisibility: { en: 'Visibility', fr: 'Visibilité', es: 'Visibilidad', de: 'Sicht', it: 'Visibilità', pt: 'Visibilidade', ja: '視程', zh: '能见度', ar: 'الرؤية' },
    wxCloud: { en: 'Cloud', fr: 'Nuages', es: 'Nubes', de: 'Wolken', it: 'Nuvole', pt: 'Nuvens', ja: '雲量', zh: '云量', ar: 'الغيوم' },
    wxPressure: { en: 'Pressure', fr: 'Pression', es: 'Presión', de: 'Druck', it: 'Pressione', pt: 'Pressão', ja: '気圧', zh: '气压', ar: 'الضغط' },
    wxSunrise: { en: 'Sunrise', fr: 'Lever', es: 'Amanecer', de: 'Aufgang', it: 'Alba', pt: 'Nascer', ja: '日の出', zh: '日出', ar: 'الشروق' },
    wxSunset: { en: 'Sunset', fr: 'Coucher', es: 'Atardecer', de: 'Untergang', it: 'Tramonto', pt: 'Pôr', ja: '日の入', zh: '日落', ar: 'الغروب' },
    tempIn: { en: '{TEMP} in {CITY}', fr: '{TEMP} à {CITY}', es: '{TEMP} en {CITY}', de: '{TEMP} in {CITY}', it: '{TEMP} a {CITY}', pt: '{TEMP} em {CITY}', ja: '{CITY}の気温 {TEMP}', zh: '{CITY}气温 {TEMP}', ar: '{TEMP} في {CITY}' },

    // ── ADVERTISING ───────────────────────────────────────────────────────
    // Words the ad cards draw around a hotel or an airline offer. Ad copy
    // itself stays in AD_I18N, keyed by its English.
    // The same words as the Accor card's own distance line (_DT_SHORT).
    kmFromDowntown: { en: '{KM} from downtown', fr: 'à {KM} du centre-ville', es: 'a {KM} del centro', de: '{KM} vom Stadtzentrum', it: 'a {KM} dal centro', pt: 'a {KM} do centro', ja: '中心部から{KM}', zh: '距市中心{KM}', ar: '{KM} من وسط المدينة' },
    theDestination: { en: 'The destination', fr: 'La destination', es: 'El destino', de: 'Das Reiseziel', it: 'La destinazione', pt: 'O destino', ja: '目的地について', zh: '目的地介绍', ar: 'عن الوجهة' },
    theHotel: { en: 'The hotel', fr: 'L\'hôtel', es: 'El hotel', de: 'Das Hotel', it: 'L\'hotel', pt: 'O hotel', ja: 'ホテル', zh: '酒店', ar: 'الفندق' },
    diningReviews: { en: 'Dining & reviews', fr: 'Restauration & avis', es: 'Gastronomía y reseñas', de: 'Gastronomie & Bewertungen', it: 'Ristorazione e recensioni', pt: 'Gastronomia e avaliações', ja: 'ダイニング＆レビュー', zh: '餐饮与评价', ar: 'المطاعم والتقييمات' },
    dineRestaurant: { en: 'On-site restaurant', fr: 'Restaurant sur place', es: 'Restaurante en el hotel', de: 'Restaurant im Haus', it: 'Ristorante interno', pt: 'Restaurante no local', ja: '館内レストラン', zh: '酒店餐厅', ar: 'مطعم داخل الفندق' },
    dineBar: { en: 'Bar & lounge', fr: 'Bar-salon', es: 'Bar y salón', de: 'Bar & Lounge', it: 'Bar e lounge', pt: 'Bar e lounge', ja: 'バー・ラウンジ', zh: '酒吧及休息室', ar: 'بار وصالة' },
    dineRoomService: { en: 'Room service', fr: 'Service aux chambres', es: 'Servicio de habitaciones', de: 'Zimmerservice', it: 'Servizio in camera', pt: 'Serviço de quartos', ja: 'ルームサービス', zh: '客房服务', ar: 'خدمة الغرف' },
    dineOffer: { en: 'Dining offers for guests', fr: 'Offres restauration pour les clients', es: 'Ofertas gastronómicas para huéspedes', de: 'Gastronomie-Angebote für Gäste', it: 'Offerte ristorazione per gli ospiti', pt: 'Ofertas gastronômicas para hóspedes', ja: 'ご宿泊者向けダイニング特典', zh: '住客餐饮优惠', ar: 'عروض المطاعم للنزلاء' },
    welcomeAboard: { en: 'Welcome aboard', fr: 'Bienvenue à bord', es: 'Bienvenido a bordo', de: 'Willkommen an Bord', it: 'Benvenuti a bordo', pt: 'Bem-vindo a bordo', ja: 'ご搭乗ありがとうございます', zh: '欢迎登机', ar: 'أهلاً بكم على متن الرحلة' },
    starsN: { en: '{N}-star', fr: '{N} étoiles', es: '{N} estrellas', de: '{N} Sterne', it: '{N} stelle', pt: '{N} estrelas', ja: '{N}つ星', zh: '{N}星级', ar: '{N} نجوم' },
    starN1: { en: '1-star', fr: '1 étoile', es: '1 estrella', de: '1 Stern', it: '1 stella', pt: '1 estrela', ja: '1つ星', zh: '1星级', ar: 'نجمة واحدة' },
    // The eco-label's own name; its Canadian programme is bilingual (Clé Verte).
    greenKey: { en: 'Green Key', fr: 'Clé Verte', es: 'Green Key', de: 'Green Key', it: 'Green Key', pt: 'Green Key', ja: 'Green Key', zh: 'Green Key', ar: 'Green Key' },
    petFriendly: { en: 'Pet-friendly', fr: 'Animaux acceptés', es: 'Se admiten mascotas', de: 'Haustiere erlaubt', it: 'Animali ammessi', pt: 'Aceita animais de estimação', ja: 'ペット可', zh: '可携带宠物', ar: 'يُسمح بالحيوانات الأليفة' },

    // ── BOARD LABELS ──────────────────────────────────────────────────────
    // Labels the boards had written as English literals or read through keys
    // no table held. The words copy the screens' own: terminal and weather
    // are fids-v2's TX.terminal and LS.wx.
    terminal: { en: 'Terminal', fr: 'Terminal', es: 'Terminal', de: 'Terminal', it: 'Terminal', pt: 'Terminal', ja: 'ターミナル', zh: '航站楼', ar: 'المبنى' },
    weather: { en: 'Weather', fr: 'Météo', es: 'Clima', de: 'Wetter', it: 'Meteo', pt: 'Clima', ja: '天気', zh: '天气', ar: 'الطقس' },
    // Tampa's own name for its satellite terminals (Airside A/C/E/F); it publishes no other language, so the others are careful translations.
    airside: { en: 'Airside', fr: 'Satellite', es: 'Satélite', de: 'Satellit', it: 'Satellite', pt: 'Satélite', ja: 'サテライト', zh: '卫星厅', ar: 'المبنى الفرعي',
      $src: { en: 'airport:TPA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // ALL is Accor Live Limitless, the brand; only the word for rating is translated.
    allRating: { en: '(ALL rating)', fr: '(note ALL)', es: '(valoración ALL)', de: '(ALL-Bewertung)', it: '(valutazione ALL)', pt: '(avaliação ALL)', ja: '(ALL評価)', zh: '(ALL评分)', ar: '(تقييم ALL)' },

    // ── STUDIO PLAYER ─────────────────────────────────────────────────────
    // A screen built in the Studio (studio-render.js, template-renderer.js):
    // its table heads, statuses and module words. The statuses and heads copy
    // the boards' own tables, so a Studio screen and a board beside it say the
    // same thing; the rest are new.
    // The Studio's statuses: the boards' own words (SS), so a Studio screen and a board beside it agree.
    stOnTime: { en: 'On time', fr: 'À l\'heure', es: 'A tiempo', de: 'Pünktlich', it: 'In orario', pt: 'No horário', ja: '定刻', zh: '准点', ar: 'في الموعد' },
    stEnRoute: { en: 'En route', fr: 'En vol', es: 'En vuelo', de: 'Unterwegs', it: 'In volo', pt: 'Em voo', ja: '飛行中', zh: '飞行中', ar: 'في الطريق' },
    stBoarding: { en: 'Boarding', fr: 'Embarquement', es: 'Embarcando', de: 'Boarding', it: 'Imbarco', pt: 'Embarque', ja: '搭乗中', zh: '登机中', ar: 'الصعود',
      $ctx: 'status' },
    stFinalCall: { en: 'Final call', fr: 'Dernier appel', es: 'Última llamada', de: 'Letzter Aufruf', it: 'Ultima chiamata', pt: 'Última chamada', ja: '最終案内', zh: '最后登机', ar: 'النداء الأخير' },
    stGateClosed: { en: 'Gate closed', fr: 'Porte fermée', es: 'Puerta cerrada', de: 'Gate geschlossen', it: 'Gate chiuso', pt: 'Portão fechado', ja: '搭乗終了', zh: '登机口已关闭', ar: 'البوابة مغلقة' },
    stDeparted: { en: 'Departed', fr: 'Parti', es: 'Despegó', de: 'Gestartet', it: 'Partito', pt: 'Partiu', ja: '出発済', zh: '已起飞', ar: 'غادرت' },
    stArrived: { en: 'Arrived', fr: 'Arrivé', es: 'Llegó', de: 'Angekommen', it: 'Arrivato', pt: 'Chegou', ja: '到着済', zh: '已到达', ar: 'وصلت' },
    stDelayed: { en: 'Delayed', fr: 'En retard', es: 'Retrasado', de: 'Verspätet', it: 'In ritardo', pt: 'Atrasado', ja: '遅延', zh: '延误', ar: 'متأخرة' },
    stCancelled: { en: 'Cancelled', fr: 'Annulé', es: 'Cancelado', de: 'Annulliert', it: 'Cancellato', pt: 'Cancelado', ja: '欠航', zh: '取消', ar: 'ملغاة' },
    stDiverted: { en: 'Diverted', fr: 'Dérouté', es: 'Desviado', de: 'Umgeleitet', it: 'Dirottato', pt: 'Desviado', ja: '目的地変更', zh: '备降', ar: 'محوّلة' },
    stScheduled: { en: 'Scheduled', fr: 'Prévu', es: 'Programado', de: 'Geplant', it: 'Previsto', pt: 'Programado', ja: '予定', zh: '计划', ar: 'مجدولة' },
    // The Studio flight table's column heads, in the boards' words.
    colAirline: { en: 'Airline', fr: 'Compagnie', es: 'Aerolínea', de: 'Fluggesellschaft', it: 'Compagnia', pt: 'Companhia', ja: '航空会社', zh: '航空公司', ar: 'شركة الطيران' },
    colFrom: { en: 'From', fr: 'De', es: 'Desde', de: 'Von', it: 'Da', pt: 'De', ja: '出発地', zh: '出发地', ar: 'من' },
    colTo: { en: 'To', fr: 'À', es: 'A', de: 'Nach', it: 'A', pt: 'Para', ja: '行き先', zh: '目的地', ar: 'إلى' },
    colFlight: { en: 'Flight', fr: 'Vol', es: 'Vuelo', de: 'Flug', it: 'Volo', pt: 'Voo', ja: '便', zh: '航班', ar: 'رحلة' },
    colTime: { en: 'Time', fr: 'Heure', es: 'Hora', de: 'Zeit', it: 'Ora', pt: 'Hora', ja: '時刻', zh: '时间', ar: 'الوقت' },
    colStatus: { en: 'Status', fr: 'Statut', es: 'Estado', de: 'Status', it: 'Stato', pt: 'Situação', ja: '状況', zh: '状态', ar: 'الحالة' },
    colBelt: { en: 'Carousel', fr: 'Carrousel', es: 'Carrusel', de: 'Band', it: 'Nastro', pt: 'Esteira', ja: 'ターンテーブル', zh: '行李转盘', ar: 'سير الأمتعة' },
    colPage: { en: 'Page', fr: 'Page', es: 'Página', de: 'Seite', it: 'Pagina', pt: 'Página', ja: 'ページ', zh: '页', ar: 'صفحة' },
    noScheduled: { en: 'No scheduled flights', fr: 'Aucun vol prévu', es: 'No hay vuelos programados', de: 'Keine geplanten Flüge', it: 'Nessun volo previsto', pt: 'Nenhum voo programado', ja: '予定便はありません', zh: '暂无计划航班', ar: 'لا توجد رحلات مجدولة' },
    airportNamed: { en: '{IATA} Airport', fr: 'Aéroport {IATA}', es: 'Aeropuerto {IATA}', de: 'Flughafen {IATA}', it: 'Aeroporto {IATA}', pt: 'Aeroporto {IATA}', ja: '{IATA}空港', zh: '{IATA}机场', ar: 'مطار {IATA}' },
    advertisement: { en: 'Advertisement', fr: 'Publicité', es: 'Publicidad', de: 'Anzeige', it: 'Pubblicità', pt: 'Publicidade', ja: '広告', zh: '广告', ar: 'إعلان' },
    oversizeTitle: { en: 'Oversized baggage', fr: 'Bagages hors format', es: 'Equipaje de gran tamaño', de: 'Sperrgepäck', it: 'Bagagli fuori misura', pt: 'Bagagem de grandes dimensões', ja: '大型手荷物', zh: '超大行李', ar: 'الأمتعة كبيرة الحجم' },
    oversizeBody: { en: 'Collect oversized items beside belt {BELT}.', fr: 'Récupérez les bagages hors format à côté du carrousel {BELT}.', es: 'Recoja el equipaje de gran tamaño junto a la cinta {BELT}.', de: 'Sperrgepäck erhalten Sie neben Band {BELT}.', it: 'Ritirate i bagagli fuori misura accanto al nastro {BELT}.', pt: 'Retire a bagagem de grandes dimensões ao lado da esteira {BELT}.', ja: '大型手荷物はターンテーブル{BELT}の横でお受け取りください。', zh: '超大行李请在{BELT}号转盘旁提取。', ar: 'استلم الأمتعة كبيرة الحجم بجانب الحزام {BELT}.' },
    checkinOpens: { en: 'Check-in opens 2 hours before departure.', fr: 'L’enregistrement ouvre 2 heures avant le départ.', es: 'La facturación abre 2 horas antes de la salida.', de: 'Der Check-in öffnet 2 Stunden vor Abflug.', it: 'Il check-in apre 2 ore prima della partenza.', pt: 'O check-in abre 2 horas antes da partida.', ja: 'チェックインは出発の2時間前に開始します。', zh: '值机柜台于起飞前2小时开放。', ar: 'يبدأ تسجيل الوصول قبل ساعتين من المغادرة.' },
    countersRange: { en: 'Counters {RANGE}', fr: 'Comptoirs {RANGE}', es: 'Mostradores {RANGE}', de: 'Schalter {RANGE}', it: 'Banchi {RANGE}', pt: 'Balcões {RANGE}', ja: 'カウンター {RANGE}', zh: '柜台 {RANGE}', ar: 'المكاتب {RANGE}' },
    counterOpen: { en: 'Open', fr: 'Ouvert', es: 'Abierto', de: 'Geöffnet', it: 'Aperto', pt: 'Aberto', ja: '受付中', zh: '开放', ar: 'مفتوح' },
    queueSample: { en: 'Queue time about {N} minutes · All lanes open', fr: 'Attente d’environ {N} minutes · Toutes les files ouvertes', es: 'Espera de unos {N} minutos · Todas las filas abiertas', de: 'Wartezeit etwa {N} Minuten · Alle Spuren geöffnet', it: 'Attesa di circa {N} minuti · Tutte le corsie aperte', pt: 'Espera de cerca de {N} minutos · Todas as filas abertas', ja: '待ち時間 約{N}分 · 全レーン開放中', zh: '排队约{N}分钟 · 所有通道开放', ar: 'وقت الانتظار نحو {N} دقائق · جميع المسارات مفتوحة' },
    emergencyTitle: { en: 'Emergency', fr: 'Urgence', es: 'Emergencia', de: 'Notfall', it: 'Emergenza', pt: 'Emergência', ja: '緊急', zh: '紧急情况', ar: 'حالة طوارئ' },
    followStaff: { en: 'Follow staff instructions', fr: 'Suivez les consignes du personnel', es: 'Siga las instrucciones del personal', de: 'Folgen Sie den Anweisungen des Personals', it: 'Seguite le istruzioni del personale', pt: 'Siga as instruções da equipe', ja: '係員の指示に従ってください', zh: '请听从工作人员指示', ar: 'يرجى اتباع تعليمات الموظفين' },
    actual: { en: 'Actual', fr: 'Réel', es: 'Real', de: 'Tatsächlich', it: 'Effettivo', pt: 'Real', ja: '実際', zh: '实际', ar: 'الفعلي' },
    remaining: { en: 'Remaining', fr: 'Restant', es: 'Restante', de: 'Verbleibend', it: 'Rimanente', pt: 'Restante', ja: '残り', zh: '剩余', ar: 'المتبقي' },

    // ── PHONE LAYOUT ──────────────────────────────────────────────────────
    // The cards and hero panels a phone shows (one language: fids_mobile_lang,
    // else the phone's own), and its gate navigation.
    operator: { en: 'Operator', fr: 'Exploitant', es: 'Operador', de: 'Betreiber', it: 'Operatore', pt: 'Operador', ja: '運航会社', zh: '运营商', ar: 'المشغّل' },
    manufacturer: { en: 'Manufacturer', fr: 'Constructeur', es: 'Fabricante', de: 'Hersteller', it: 'Costruttore', pt: 'Fabricante', ja: 'メーカー', zh: '制造商', ar: 'الشركة المصنّعة' },
    range: { en: 'Range', fr: 'Autonomie', es: 'Autonomía', de: 'Reichweite', it: 'Autonomia', pt: 'Autonomia', ja: '航続距離', zh: '航程', ar: 'المدى' },
    estimated: { en: 'Estimated', fr: 'Estimé', es: 'Estimado', de: 'Erwartet', it: 'Stimato', pt: 'Estimado', ja: '見込み', zh: '预计', ar: 'متوقع' },
    hotels: { en: 'Hotels', fr: 'Hôtels', es: 'Hoteles', de: 'Hotels', it: 'Hotel', pt: 'Hotéis', ja: 'ホテル', zh: '酒店', ar: 'فنادق' },
    map: { en: 'Map', fr: 'Carte', es: 'Mapa', de: 'Karte', it: 'Mappa', pt: 'Mapa', ja: '地図', zh: '地图', ar: 'الخريطة' },
    noDestData: { en: 'No destination data', fr: 'Aucune donnée sur la destination', es: 'Sin datos del destino', de: 'Keine Zieldaten', it: 'Nessun dato sulla destinazione', pt: 'Sem dados do destino', ja: '目的地の情報はありません', zh: '暂无目的地数据', ar: 'لا توجد بيانات عن الوجهة' },
    hotelsUnavailable: { en: 'Hotels unavailable', fr: 'Hôtels indisponibles', es: 'Hoteles no disponibles', de: 'Hotels nicht verfügbar', it: 'Hotel non disponibili', pt: 'Hotéis indisponíveis', ja: 'ホテル情報はありません', zh: '酒店信息不可用', ar: 'الفنادق غير متاحة' },
    noStaysFor: { en: 'No stays found for {CITY}', fr: 'Aucun hébergement trouvé pour {CITY}', es: 'No se encontraron alojamientos en {CITY}', de: 'Keine Unterkünfte in {CITY} gefunden', it: 'Nessun alloggio trovato a {CITY}', pt: 'Nenhuma hospedagem encontrada em {CITY}', ja: '{CITY}の宿泊施設は見つかりませんでした', zh: '未找到{CITY}的住宿', ar: 'لم يتم العثور على إقامة في {CITY}' },
    staysIn: { en: 'Stays in {CITY}', fr: 'Hébergement à {CITY}', es: 'Alojamiento en {CITY}', de: 'Unterkünfte in {CITY}', it: 'Alloggi a {CITY}', pt: 'Hospedagem em {CITY}', ja: '{CITY}の宿泊施設', zh: '{CITY}住宿', ar: 'الإقامة في {CITY}' },
    loadingStays: { en: 'Loading stays', fr: 'Chargement des hébergements', es: 'Cargando alojamientos', de: 'Unterkünfte werden geladen', it: 'Caricamento degli alloggi', pt: 'Carregando hospedagens', ja: '宿泊施設を読み込み中', zh: '正在加载住宿', ar: 'جارٍ تحميل أماكن الإقامة' },
    coordsUnavailable: { en: 'Coordinates unavailable', fr: 'Coordonnées indisponibles', es: 'Coordenadas no disponibles', de: 'Koordinaten nicht verfügbar', it: 'Coordinate non disponibili', pt: 'Coordenadas indisponíveis', ja: '座標情報はありません', zh: '坐标不可用', ar: 'الإحداثيات غير متاحة' },
    mapUnavailable: { en: 'Map unavailable', fr: 'Carte indisponible', es: 'Mapa no disponible', de: 'Karte nicht verfügbar', it: 'Mappa non disponibile', pt: 'Mapa indisponível', ja: '地図を表示できません', zh: '地图不可用', ar: 'الخريطة غير متاحة' },
    go: { en: 'Go', fr: 'Aller', es: 'Ir', de: 'Los', it: 'Vai', pt: 'Ir', ja: '検索', zh: '搜索', ar: 'انتقال' },
    menu: { en: 'Menu', fr: 'Menu', es: 'Menú', de: 'Menü', it: 'Menu', pt: 'Menu', ja: 'メニュー', zh: '菜单', ar: 'القائمة' },
    back: { en: 'Back', fr: 'Retour', es: 'Atrás', de: 'Zurück', it: 'Indietro', pt: 'Voltar', ja: '戻る', zh: '返回', ar: 'رجوع' },
    openGateScreen: { en: 'Open gate {GATE} screen', fr: 'Ouvrir l’écran de la porte {GATE}', es: 'Abrir la pantalla de la puerta {GATE}', de: 'Anzeige von Gate {GATE} öffnen', it: 'Apri lo schermo del gate {GATE}', pt: 'Abrir a tela do portão {GATE}', ja: 'ゲート{GATE}の画面を開く', zh: '打开{GATE}号登机口屏幕', ar: 'افتح شاشة البوابة {GATE}' },
    openCarouselScreen: { en: 'Open carousel {GATE} screen', fr: 'Ouvrir l’écran du carrousel {GATE}', es: 'Abrir la pantalla del carrusel {GATE}', de: 'Anzeige von Band {GATE} öffnen', it: 'Apri lo schermo del nastro {GATE}', pt: 'Abrir a tela da esteira {GATE}', ja: 'ターンテーブル{GATE}の画面を開く', zh: '打开{GATE}号行李转盘屏幕', ar: 'افتح شاشة الحزام {GATE}' },
    // The phone offer on the opener (index.html): the question, its two answers and the note under them. The French is the offer's own wording.
    mobileAsk: { en: 'Open the mobile app?', fr: 'Ouvrir l’application mobile ?', es: '¿Abrir la aplicación móvil?', de: 'Mobile App öffnen?', it: 'Aprire l’app mobile?', pt: 'Abrir o aplicativo móvel?', ja: 'モバイルアプリを開きますか？', zh: '打开移动应用？', ar: 'هل تريد فتح تطبيق الجوال؟' },
    mobileYes: { en: 'Use the mobile app', fr: 'Utiliser l’application mobile', es: 'Usar la aplicación móvil', de: 'Mobile App verwenden', it: 'Usa l’app mobile', pt: 'Usar o aplicativo móvel', ja: 'モバイルアプリを使う', zh: '使用移动应用', ar: 'استخدام تطبيق الجوال' },
    mobileNo: { en: 'Stay on the regular site', fr: 'Rester sur le site normal', es: 'Quedarse en el sitio normal', de: 'Auf der normalen Website bleiben', it: 'Resta sul sito normale', pt: 'Permanecer no site normal', ja: '通常のサイトのまま', zh: '留在常规网站', ar: 'البقاء على الموقع العادي' },
    mobileNote: { en: 'We’ll remember your choice. Add {ASK} to be asked again.', fr: 'Votre choix sera retenu. Ajoutez {ASK} pour qu’on vous redemande.', es: 'Recordaremos su elección. Añada {ASK} para que se lo volvamos a preguntar.', de: 'Wir merken uns Ihre Wahl. Fügen Sie {ASK} hinzu, um erneut gefragt zu werden.', it: 'Ricorderemo la vostra scelta. Aggiungete {ASK} per ricevere di nuovo la domanda.', pt: 'Vamos lembrar a sua escolha. Adicione {ASK} para ser perguntado novamente.', ja: '選択内容は保存されます。もう一度確認するには {ASK} を追加してください。', zh: '我们会记住您的选择。添加 {ASK} 可再次询问。', ar: 'سنتذكر اختيارك. أضف {ASK} ليُطرح عليك السؤال مرة أخرى.' },

    // ── ADDED WITH THE GUARD'S SECOND PASS ────────────────────────────────
    // A delayed next departure on the gate's footer: '→ Now 6:40pm'. The same
    // words as fids-v2.js TX.now (the revised-time 'Now').
    nowRevised: { en: 'Now', fr: 'Maintenant', es: 'Ahora', de: 'Jetzt', it: 'Ora', pt: 'Agora', ja: '変更', zh: '现改为', ar: 'الآن', $ctx: 'revised-time' },
    // An airline ad's {CITY} when the destination has no name yet.
    yourDestination: { en: 'your destination', fr: 'votre destination', es: 'su destino', de: 'Ihr Reiseziel', it: 'la vostra destinazione', pt: 'seu destino', ja: '目的地', zh: '目的地', ar: 'وجهتك' },
    // Accor's bed codes in a room's name ('DBL/DBL'), spelled out in the
    // language the room was fetched in.
    bedTwoDouble: { en: '2 Double Beds', fr: '2 lits doubles', es: '2 camas dobles', de: '2 Doppelbetten', it: '2 letti matrimoniali', pt: '2 camas de casal', ja: 'ダブルベッド2台', zh: '2张双人床', ar: 'سريران مزدوجان' },
    bedTwoTwin: { en: '2 Twin Beds', fr: '2 lits simples', es: '2 camas individuales', de: '2 Einzelbetten', it: '2 letti singoli', pt: '2 camas de solteiro', ja: 'シングルベッド2台', zh: '2张单人床', ar: 'سريران فرديان' },
    bedTwoQueen: { en: '2 Queen Beds', fr: '2 grands lits Queen', es: '2 camas Queen', de: '2 Queen-Size-Betten', it: '2 letti queen size', pt: '2 camas queen', ja: 'クイーンベッド2台', zh: '2张大号双人床', ar: 'سريران بحجم كوين' },
    bedKing: { en: 'King Bed', fr: 'Très grand lit King', es: 'Cama King', de: 'Kingsize-Bett', it: 'Letto king size', pt: 'Cama king', ja: 'キングベッド', zh: '特大号床', ar: 'سرير بحجم كينغ' },
    bedQueen: { en: 'Queen Bed', fr: 'Grand lit Queen', es: 'Cama Queen', de: 'Queen-Size-Bett', it: 'Letto queen size', pt: 'Cama queen', ja: 'クイーンベッド', zh: '大号双人床', ar: 'سرير بحجم كوين' },
    bedDouble: { en: 'Double Bed', fr: 'Lit double', es: 'Cama doble', de: 'Doppelbett', it: 'Letto matrimoniale', pt: 'Cama de casal', ja: 'ダブルベッド', zh: '双人床', ar: 'سرير مزدوج' },
    bedTwin: { en: 'Twin Beds', fr: 'Lits jumeaux', es: 'Camas gemelas', de: 'Zwei Einzelbetten', it: 'Letti gemelli', pt: 'Camas de solteiro', ja: 'ツインベッド', zh: '双床', ar: 'سريران منفصلان' },

    // ── v23974–v23976 (merged before this store existed; moved here from the
    // gate's label table, which is frozen) ─────────────────────────────────
    // v23946 — the destination's terminal, on the line under the Arrival time
    // (_gateArrPlaceHtml). "Aérogare" is the word Canada's airports use in
    // French; $ctx keeps it apart from the column heading "Terminal".
    arrTerminal: { en: 'Terminal', fr: 'Aérogare', es: 'Terminal', de: 'Terminal', it: 'Terminal', pt: 'Terminal', ja: 'ターミナル', zh: '航站楼', ar: 'مبنى الركاب',
      $ctx: 'arrival-place' },
    // v23968 — an airport's own "Expected", which the adapters keep
    // (fidsNeutralWord in feed-router.js) instead of folding it into
    // Scheduled. SL('expected') and fids-v2's T('st-expected') find it here;
    // $ctx keeps the status apart from the lower-case "expected" qualifier.
    stExpected: { en: 'Expected', fr: 'Attendu', es: 'Previsto', de: 'Erwartet', it: 'Atteso', pt: 'Previsto', ja: '見込み', zh: '预计', ar: 'متوقعة',
      $ctx: 'status' },
    // ── v23968 — EACH AIRLINE'S GATE-CLOSE DEADLINE ──────────────────────────
    // The line at the foot of the gate's Boarding card before boarding starts
    // (_gateCloseLineHtml): the airline's PUBLISHED minutes and the clock time
    // they make before the airport's departure time. {MIN} is the minutes,
    // {TIME} the clock in that language's own convention (_fidsClockForLang).
    // One entry per kind of rule, in the airline's own word for it
    // (GATE_CLOSE_POLICY):
    //   gateCloses      its boarding gate closes (Air Canada, WestJet, Porter,
    //                   Air Transat; AC's French page: « Fermeture de la porte
    //                   d'embarquement »)
    //   boardingCloses  its boarding closes (Flair)
    //   boardingEnds    its boarding ends (American)
    //   gateBeAt        only a deadline to be AT the gate, no close time (PAL,
    //                   Delta, United), so the card never says "closes" for them
    // English (and French where the airline publishes it) follow the airlines'
    // own pages; the others are careful translations, marked in $src.
    gateCloses: { en:'Gate closes {MIN} min before departure · {TIME}', fr:'Fermeture de la porte {MIN} min avant le départ · {TIME}', es:'La puerta cierra {MIN} min antes de la salida · {TIME}', de:'Gate schließt {MIN} Min. vor Abflug · {TIME}', it:'Il gate chiude {MIN} min prima della partenza · {TIME}', pt:'O portão fecha {MIN} min antes da partida · {TIME}', ja:'搭乗口は出発{MIN}分前に締切 · {TIME}', zh:'登机口于起飞前{MIN}分钟关闭 · {TIME}', ar:'تُغلق البوابة قبل {MIN} دقيقة من المغادرة · {TIME}',
        $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    boardingCloses: { en:'Boarding closes {MIN} min before departure · {TIME}', fr:'Fin de l’embarquement {MIN} min avant le départ · {TIME}', es:'El embarque cierra {MIN} min antes de la salida · {TIME}', de:'Boarding endet {MIN} Min. vor Abflug · {TIME}', it:'L’imbarco chiude {MIN} min prima della partenza · {TIME}', pt:'O embarque encerra {MIN} min antes da partida · {TIME}', ja:'搭乗は出発{MIN}分前に締切 · {TIME}', zh:'登机于起飞前{MIN}分钟截止 · {TIME}', ar:'ينتهي الصعود قبل {MIN} دقيقة من المغادرة · {TIME}',
        $src: { en: 'airline:F8', fr: 'airline:F8', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    boardingEnds: { en:'Boarding ends {MIN} min before departure · {TIME}', fr:'Fin de l’embarquement {MIN} min avant le départ · {TIME}', es:'El embarque termina {MIN} min antes de la salida · {TIME}', de:'Boarding endet {MIN} Min. vor Abflug · {TIME}', it:'L’imbarco termina {MIN} min prima della partenza · {TIME}', pt:'O embarque termina {MIN} min antes da partida · {TIME}', ja:'搭乗は出発{MIN}分前に終了 · {TIME}', zh:'登机于起飞前{MIN}分钟结束 · {TIME}', ar:'ينتهي الصعود قبل {MIN} دقيقة من المغادرة · {TIME}',
        $src: { en: 'airline:AA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    gateBeAt: { en:'Be at the gate {MIN} min before departure · {TIME}', fr:'Présentez-vous à la porte {MIN} min avant le départ · {TIME}', es:'Esté en la puerta {MIN} min antes de la salida · {TIME}', de:'{MIN} Min. vor Abflug am Gate sein · {TIME}', it:'Presentarsi al gate {MIN} min prima della partenza · {TIME}', pt:'Esteja no portão {MIN} min antes da partida · {TIME}', ja:'出発{MIN}分前までに搭乗口へ · {TIME}', zh:'请于起飞前{MIN}分钟到达登机口 · {TIME}', ar:'كونوا عند البوابة قبل {MIN} دقيقة من المغادرة · {TIME}',
        $src: { en: 'airline:DL', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // The same rules as one ticker line, on a board showing one airline only
    // (?airline=): {AIRLINE} is the airline's name (_tickerCloseLine).
    tickerGateCloses: { en:'{AIRLINE}: BOARDING GATE CLOSES {MIN} MINUTES BEFORE DEPARTURE', fr:'{AIRLINE} : FERMETURE DE LA PORTE D’EMBARQUEMENT {MIN} MINUTES AVANT LE DÉPART', es:'{AIRLINE}: LA PUERTA DE EMBARQUE CIERRA {MIN} MINUTOS ANTES DE LA SALIDA', de:'{AIRLINE}: DAS GATE SCHLIESST {MIN} MINUTEN VOR ABFLUG', it:'{AIRLINE}: IL GATE CHIUDE {MIN} MINUTI PRIMA DELLA PARTENZA', pt:'{AIRLINE}: O PORTÃO DE EMBARQUE FECHA {MIN} MINUTOS ANTES DA PARTIDA', ja:'{AIRLINE}：搭乗口は出発{MIN}分前に締め切ります', zh:'{AIRLINE}：登机口于起飞前{MIN}分钟关闭', ar:'{AIRLINE}: تُغلق بوابة الصعود قبل {MIN} دقيقة من المغادرة',
        $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    tickerBoardingCloses: { en:'{AIRLINE}: BOARDING CLOSES {MIN} MINUTES BEFORE DEPARTURE', fr:'{AIRLINE} : FIN DE L’EMBARQUEMENT {MIN} MINUTES AVANT LE DÉPART', es:'{AIRLINE}: EL EMBARQUE CIERRA {MIN} MINUTOS ANTES DE LA SALIDA', de:'{AIRLINE}: DAS BOARDING ENDET {MIN} MINUTEN VOR ABFLUG', it:'{AIRLINE}: L’IMBARCO CHIUDE {MIN} MINUTI PRIMA DELLA PARTENZA', pt:'{AIRLINE}: O EMBARQUE ENCERRA {MIN} MINUTOS ANTES DA PARTIDA', ja:'{AIRLINE}：搭乗は出発{MIN}分前に締め切ります', zh:'{AIRLINE}：登机于起飞前{MIN}分钟截止', ar:'{AIRLINE}: ينتهي الصعود قبل {MIN} دقيقة من المغادرة',
        $src: { en: 'airline:F8', fr: 'airline:F8', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    tickerBoardingEnds: { en:'{AIRLINE}: BOARDING ENDS {MIN} MINUTES BEFORE DEPARTURE', fr:'{AIRLINE} : FIN DE L’EMBARQUEMENT {MIN} MINUTES AVANT LE DÉPART', es:'{AIRLINE}: EL EMBARQUE TERMINA {MIN} MINUTOS ANTES DE LA SALIDA', de:'{AIRLINE}: DAS BOARDING ENDET {MIN} MINUTEN VOR ABFLUG', it:'{AIRLINE}: L’IMBARCO TERMINA {MIN} MINUTI PRIMA DELLA PARTENZA', pt:'{AIRLINE}: O EMBARQUE TERMINA {MIN} MINUTOS ANTES DA PARTIDA', ja:'{AIRLINE}：搭乗は出発{MIN}分前に終了します', zh:'{AIRLINE}：登机于起飞前{MIN}分钟结束', ar:'{AIRLINE}: ينتهي الصعود قبل {MIN} دقيقة من المغادرة',
        $src: { en: 'airline:AA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    tickerGateBeAt: { en:'{AIRLINE}: BE AT THE BOARDING GATE {MIN} MINUTES BEFORE DEPARTURE', fr:'{AIRLINE} : PRÉSENTEZ-VOUS À LA PORTE D’EMBARQUEMENT {MIN} MINUTES AVANT LE DÉPART', es:'{AIRLINE}: PRESÉNTESE EN LA PUERTA DE EMBARQUE {MIN} MINUTOS ANTES DE LA SALIDA', de:'{AIRLINE}: SEIEN SIE {MIN} MINUTEN VOR ABFLUG AM GATE', it:'{AIRLINE}: PRESENTARSI AL GATE {MIN} MINUTI PRIMA DELLA PARTENZA', pt:'{AIRLINE}: ESTEJA NO PORTÃO DE EMBARQUE {MIN} MINUTOS ANTES DA PARTIDA', ja:'{AIRLINE}：出発{MIN}分前までに搭乗口へお越しください', zh:'{AIRLINE}：请于起飞前{MIN}分钟到达登机口', ar:'{AIRLINE}: يرجى التواجد عند بوابة الصعود قبل {MIN} دقيقة من المغادرة',
        $src: { en: 'airline:DL', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v23973 — LATER AT THIS GATE (_gateLaterStripHtml, _gateChangeNoticeHtml).
    // The strip's title; the label before a moved flight's new gate number
    // ("now Gate 2 | maintenant porte 2", the number in its own pill); the
    // full-screen notice's title and its sentence. gateMovedProceed is LS's
    // gateChangeProceed word for word, here so _gateLbl can show the board's
    // two languages, each sentence whole on its own line ({GATE} is the gate).
    laterAtGate: { en:'Later at this gate', fr:'Plus tard à cette porte', es:'Más tarde en esta puerta', de:'Später an diesem Gate', it:'Più tardi a questo gate', pt:'Mais tarde neste portão', ja:'このゲートのこの後の便', zh:'本登机口稍后航班', ar:'لاحقًا من هذه البوابة' },
    nowGate:     { en:'now Gate', fr:'maintenant porte', es:'ahora puerta', de:'jetzt Gate', it:'ora gate', pt:'agora portão', ja:'変更後のゲート', zh:'现登机口', ar:'البوابة الجديدة' },
    gateChange:  { en:'Gate change', fr:'Changement de porte', es:'Cambio de puerta', de:'Gate-Wechsel', it:'Cambio gate', pt:'Mudança de portão', ja:'ゲート変更', zh:'登机口变更', ar:'تغيير البوابة' },
    gateMovedProceed: { en:'Please proceed to Gate {GATE}', fr:'Veuillez vous diriger vers la porte {GATE}', es:'Diríjase a la puerta {GATE}', de:'Bitte begeben Sie sich zu Gate {GATE}', it:'Procedere al gate {GATE}', pt:'Dirija-se ao portão {GATE}', ja:'ゲート {GATE} へお進みください', zh:'请前往 {GATE} 登机口', ar:'يرجى التوجه إلى البوابة {GATE}' }
  };

  // Lists: per language, equal length. Tickers.
  var LISTS = {
    // ── TICKERS
    // The scrolling lines of the main board and the gate (ticker) and of the
    // baggage hall (bagsTicker). Each language's list has the same length;
    // line N is the same message in every language. Moved here from
    // TICKER_MSG and BAGS_TICKER_MSG; the baggage list had stopped at three
    // languages, so a German or Japanese hall scrolled English or dropped
    // its second language. Lines it shares with the main ticker use that
    // ticker's words. Line 3 is the one neutral deadline line (v23968): each
    // airline sets its own gate deadline, so the board names none, and a
    // board showing one airline says that airline's own rule in its place
    // (_tickerCloseLine in fids-core.js).
    ticker: {
      en: ['PLEASE KEEP YOUR BAGGAGE WITH YOU AT ALL TIMES', 'UNATTENDED ITEMS WILL BE CONFISCATED BY SECURITY', 'CHECK YOUR AIRLINE’S BOARDING GATE DEADLINE', 'REPORT SUSPICIOUS ACTIVITY TO AIRPORT STAFF', 'CHECK MONITORS FOR UPDATED GATE INFORMATION'],
      fr: ['VEUILLEZ GARDER VOS BAGAGES AVEC VOUS EN TOUT TEMPS', 'LES OBJETS SANS SURVEILLANCE SERONT CONFISQUÉS', 'VÉRIFIEZ L’HEURE LIMITE À LA PORTE D’EMBARQUEMENT DE VOTRE TRANSPORTEUR', 'SIGNALEZ TOUTE ACTIVITÉ SUSPECTE AU PERSONNEL', 'CONSULTEZ LES ÉCRANS POUR TOUTE MISE À JOUR'],
      es: ['MANTENGA SU EQUIPAJE CON USTED EN TODO MOMENTO', 'ARTÍCULOS DESATENDIDOS SERÁN CONFISCADOS', 'CONSULTE LA HORA LÍMITE EN LA PUERTA DE EMBARQUE DE SU AEROLÍNEA', 'REPORTE ACTIVIDAD SOSPECHOSA AL PERSONAL', 'CONSULTE LOS MONITORES PARA INFORMACIÓN ACTUALIZADA'],
      de: ['BEHALTEN SIE IHR GEPÄCK STETS BEI SICH', 'UNBEAUFSICHTIGTE GEGENSTÄNDE WERDEN KONFISZIERT', 'BEACHTEN SIE DIE GATE-FRIST IHRER FLUGGESELLSCHAFT', 'MELDEN SIE VERDÄCHTIGE AKTIVITÄTEN', 'PRÜFEN SIE DIE MONITORE FÜR AKTUELLE INFORMATIONEN'],
      it: ['TENERE SEMPRE CON SÉ IL BAGAGLIO', 'OGGETTI INCUSTODITI SARANNO CONFISCATI', 'VERIFICATE L’ORARIO LIMITE AL GATE DELLA VOSTRA COMPAGNIA AEREA', 'SEGNALARE ATTIVITÀ SOSPETTE AL PERSONALE', 'CONTROLLARE I MONITOR PER AGGIORNAMENTI'],
      pt: ['MANTENHA SUA BAGAGEM COM VOCÊ O TEMPO TODO', 'ITENS ABANDONADOS SERÃO CONFISCADOS', 'VERIFIQUE O HORÁRIO LIMITE NO PORTÃO DE EMBARQUE DA SUA COMPANHIA AÉREA', 'REPORTE ATIVIDADE SUSPEITA AO PESSOAL', 'CONSULTE OS MONITORES PARA ATUALIZAÇÕES'],
      ja: ['手荷物は常にお手元にお持ちください', '放置された荷物は撤去されます', 'ご利用の航空会社の搭乗口締切時刻をご確認ください', '不審な行動は職員にお知らせください', 'ゲート情報の更新はモニターをご確認ください'],
      zh: ['请随时看管好您的行李', '无人看管的物品将被没收', '请确认您所乘航空公司的登机口截止时间', '如发现可疑活动请报告工作人员', '请查看显示屏获取最新登机口信息'],
      ar: ['يرجى الاحتفاظ بأمتعتكم معكم في جميع الأوقات', 'سيتم مصادرة الأغراض المتروكة', 'يرجى التحقق من الموعد النهائي لبوابة الصعود لدى شركة الطيران', 'أبلغوا عن أي نشاط مشبوه لموظفي المطار', 'تحققوا من الشاشات للحصول على أحدث المعلومات']
    },

    // ── 
    bagsTicker: {
      en: ['MANY BAGS LOOK ALIKE — PLEASE CHECK YOUR BAG TAG', 'LUGGAGE CARTS ARE AVAILABLE NEAR THE EXIT', 'REPORT DAMAGED OR MISSING BAGGAGE TO YOUR AIRLINE', 'PLEASE KEEP YOUR BAGGAGE WITH YOU AT ALL TIMES', 'REPORT SUSPICIOUS ACTIVITY TO AIRPORT STAFF', 'THANK YOU FOR FLYING WITH US — WELCOME'],
      fr: ['PLUSIEURS VALISES SE RESSEMBLENT — VÉRIFIEZ VOTRE ÉTIQUETTE', 'DES CHARIOTS À BAGAGES SONT DISPONIBLES PRÈS DE LA SORTIE', 'SIGNALEZ TOUT BAGAGE ENDOMMAGÉ OU MANQUANT À VOTRE TRANSPORTEUR', 'VEUILLEZ GARDER VOS BAGAGES AVEC VOUS EN TOUT TEMPS', 'SIGNALEZ TOUTE ACTIVITÉ SUSPECTE AU PERSONNEL', 'MERCI D’AVOIR VOYAGÉ AVEC NOUS — BIENVENUE'],
      es: ['MUCHAS MALETAS SON PARECIDAS — VERIFIQUE SU ETIQUETA', 'HAY CARRITOS DE EQUIPAJE CERCA DE LA SALIDA', 'REPORTE EQUIPAJE DAÑADO O FALTANTE A SU AEROLÍNEA', 'MANTENGA SU EQUIPAJE CON USTED EN TODO MOMENTO', 'REPORTE ACTIVIDAD SOSPECHOSA AL PERSONAL', 'GRACIAS POR VOLAR CON NOSOTROS — BIENVENIDOS'],
      de: ['VIELE KOFFER SEHEN GLEICH AUS — PRÜFEN SIE IHR GEPÄCKETIKETT', 'GEPÄCKWAGEN STEHEN AM AUSGANG BEREIT', 'MELDEN SIE BESCHÄDIGTES ODER FEHLENDES GEPÄCK IHRER FLUGGESELLSCHAFT', 'BEHALTEN SIE IHR GEPÄCK STETS BEI SICH', 'MELDEN SIE VERDÄCHTIGE AKTIVITÄTEN', 'DANKE, DASS SIE MIT UNS GEFLOGEN SIND — WILLKOMMEN'],
      it: ['MOLTI BAGAGLI SI SOMIGLIANO — CONTROLLATE L’ETICHETTA', 'I CARRELLI PORTABAGAGLI SONO DISPONIBILI VICINO ALL’USCITA', 'SEGNALATE I BAGAGLI DANNEGGIATI O MANCANTI ALLA VOSTRA COMPAGNIA AEREA', 'TENERE SEMPRE CON SÉ IL BAGAGLIO', 'SEGNALARE ATTIVITÀ SOSPETTE AL PERSONALE', 'GRAZIE PER AVER VOLATO CON NOI — BENVENUTI'],
      pt: ['MUITAS MALAS SÃO PARECIDAS — CONFIRA SUA ETIQUETA', 'HÁ CARRINHOS DE BAGAGEM PERTO DA SAÍDA', 'COMUNIQUE BAGAGEM DANIFICADA OU EXTRAVIADA À SUA COMPANHIA AÉREA', 'MANTENHA SUA BAGAGEM COM VOCÊ O TEMPO TODO', 'REPORTE ATIVIDADE SUSPEITA AO PESSOAL', 'OBRIGADO POR VOAR CONOSCO — BEM-VINDOS'],
      ja: ['よく似た手荷物が多数あります — 手荷物タグをご確認ください', '手荷物カートは出口付近にございます', '手荷物の破損・紛失はご利用の航空会社へお申し出ください', '手荷物は常にお手元にお持ちください', '不審な行動は職員にお知らせください', 'ご搭乗ありがとうございました — ようこそ'],
      zh: ['许多行李外观相似 — 请核对您的行李牌', '出口附近有行李手推车', '行李损坏或丢失请向您的航空公司报告', '请随时看管好您的行李', '如发现可疑活动请报告工作人员', '感谢您的搭乘 — 欢迎'],
      ar: ['تتشابه حقائب كثيرة — يرجى التحقق من بطاقة أمتعتكم', 'تتوفر عربات الأمتعة بالقرب من المخرج', 'أبلغوا شركة الطيران عن الأمتعة التالفة أو المفقودة', 'يرجى الاحتفاظ بأمتعتكم معكم في جميع الأوقات', 'أبلغوا عن أي نشاط مشبوه لموظفي المطار', 'شكراً لسفركم معنا — أهلاً وسهلاً']
    },

    // ── ACCOR AMENITY FALLBACK
    // The three amenity lines an Accor card shows when the feed sends none.
    amenFallback: {
      en: ['Restaurant', 'Wi‑Fi', 'Comfort rooms'],
      fr: ['Restaurant', 'Wi‑Fi', 'Chambres confortables'],
      es: ['Restaurante', 'Wi‑Fi', 'Habitaciones confortables'],
      de: ['Restaurant', 'WLAN', 'Komfortzimmer'],
      it: ['Ristorante', 'Wi‑Fi', 'Camere confortevoli'],
      pt: ['Restaurante', 'Wi‑Fi', 'Quartos confortáveis'],
      ja: ['レストラン', 'Wi‑Fi', '快適な客室'],
      zh: ['餐厅', 'Wi‑Fi', '舒适客房'],
      ar: ['مطعم', 'واي فاي', 'غرف مريحة']
    }
  };

  // ━━ FROZEN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // The words are fixed where they are declared. A run-time write
  // (BOARD_STR.tomorrow.fr = …, Object.assign(BOARD_STR.x, …), a push into a
  // ticker list) would overwrite one silently — the CITY_FR collapse again,
  // where no duplicate-key check can see it — so every table is frozen to the
  // last string. tests/board-languages.test.js (B16) refuses such a write in
  // the source; this makes one do nothing in a browser.
  function deepFreeze(o) {
    if (!o || typeof o !== 'object' || Object.isFrozen(o)) return o;
    Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    return Object.freeze(o);
  }
  [LANGS, META, FR_FIRST, LANG_DEFAULTS, ES_AIRPORTS, STR, LISTS].forEach(deepFreeze);

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

  // A key or a language the store does not have renders nothing — and is
  // recorded, every time, in BoardStrings.misses: the rendered check
  // (tests/render/words.mjs) reads it after every screen, so a key that
  // only exists in a variable (bs(k)), or a helper copied under another
  // name, cannot go blank on a board unseen.
  function miss(key, lang) {
    var id = key + '/' + lang;
    if (!_warned[id]) {
      _warned[id] = true;
      if (api.misses.length < 200) api.misses.push(id);
      try { console.warn('[board-strings] missing ' + id); } catch (e) {}
    }
    if (api.strict) throw new Error('board-strings: no "' + lang + '" for "' + key + '"');
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
  // The key whose English a feed's own word is ('Clear' -> wxClear), among
  // the keys starting with `prefix`: how a word that arrives in English from
  // data is said in the board's language. '' when the store has no such entry
  // (the caller shows nothing then, never the English).
  function keyForEnglish(text, prefix) {
    var t = String(text == null ? '' : text).trim().toLowerCase();
    if (!t) return '';
    var keys = Object.keys(STR);
    for (var i = 0; i < keys.length; i++) {
      if (prefix && keys[i].indexOf(prefix) !== 0) continue;
      if (String(STR[keys[i]].en).toLowerCase() === t) return keys[i];
    }
    return '';
  }
  // An entry with its placeholders filled in every language, for the helpers
  // that take a whole language object (the weather card's _wxPair family).
  function filled(key, fields, raw) {
    var e = entry(key), out = {};
    if (!e) { miss(key, '*'); return out; }
    LANGS.forEach(function (l) { out[l] = fill(e[l], fields, raw); });
    return out;
  }

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

  // The same marks written onto a half someone else already wrapped (the
  // gate's own `<span class="g8-pair-h">…`): lang, dir for Arabic and the
  // careful flag go on the half's first tag, so no extra element and no
  // stylesheet change. A bare half in Japanese, Chinese or Arabic — where
  // the language picks the font, the line breaking or the direction — is
  // isolated in a <bdi>; a bare Latin half is left as it is.
  var BARE_MARK = { ja: 1, zh: 1, ar: 1 };
  function markHalf(html, lang, key) {
    var h = String(html == null ? '' : html);
    if (!isLang(lang)) return h;
    var rtl = META[lang].dir === 'rtl';
    var e = entry(key);
    var careful = !!(e && e.$src && e.$src[lang] === 'careful');
    // A half that opens with its separator (' | ' in a span of its own, as
    // the second half of a pair is often built) is marked on the element
    // after it, the one that holds the words: marking the separator left
    // the words in the board's language (a Japanese label under lang="en",
    // drawn with Japanese glyphs only by luck, and Chinese with Japanese
    // ones).
    var lead = /^(\s*(?:<(span|b|i|small)\b[^>]*class="[^"]*(?:sep|bar)[^"]*"[^>]*>[^<]*<\/\2>\s*)+)/.exec(h);
    var pre = lead ? lead[1] : '';
    var rest = lead ? h.slice(pre.length) : h;
    var m = /^<(span|div|b|i|em|strong|bdi|small)\b([^>]*)>/.exec(rest);
    if (m) {
      var attrs = m[2];
      if (!/\slang=/.test(attrs)) attrs += ' lang="' + lang + '"';
      if (rtl && !/\sdir=/.test(attrs)) attrs += ' dir="rtl"';
      if (careful) attrs += ' data-i18n-src="careful"';
      return pre + '<' + m[1] + attrs + '>' + rest.slice(m[0].length);
    }
    if (lead && rest) {
      if (!BARE_MARK[lang] && !careful) return h;
      return pre + '<bdi lang="' + lang + '"' + (rtl ? ' dir="rtl"' : '')
        + (careful ? ' data-i18n-src="careful"' : '') + '>' + rest + '</bdi>';
    }
    if (!h || (!BARE_MARK[lang] && !careful)) return h;
    return '<bdi lang="' + lang + '"' + (rtl ? ' dir="rtl"' : '')
      + (careful ? ' data-i18n-src="careful"' : '') + '>' + h + '</bdi>';
  }

  // The web fonts that carry Japanese, Chinese and Arabic, put into a font
  // stack before its generic family. Every stack the board sets at run time
  // goes through this, so those languages never fall to a host font that
  // may not exist (the stream host has none). Static stacks in the
  // stylesheets carry the same tail.
  // The variable is resolved on each element (shared.css sets it per
  // language), so Chinese takes the simplified-Chinese forms and Japanese the
  // Japanese ones; the fallback list serves a page without the stylesheet.
  var SCRIPT_FONTS = "var(--fids-script-fonts, 'Noto Sans JP', 'Noto Sans SC', 'Noto Sans Arabic')";
  function withScripts(stack) {
    var s = String(stack == null ? '' : stack).replace(/\s+$/, '');
    if (!s || s.indexOf('--fids-script-fonts') >= 0) return s;
    var m = /,\s*(sans-serif|serif|monospace|system-ui|cursive|fantasy)\s*$/i.exec(s);
    return m ? s.slice(0, m.index) + ', ' + SCRIPT_FONTS + s.slice(m.index) : s + ', ' + SCRIPT_FONTS;
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
  //   o.upper     capitals, by each language's own rules
  function pair(key, o) {
    o = o || {};
    var e = entry(key);
    if (!e) { miss(key, '*'); return ''; }
    var L = pairLangs(o.langs, o.frFirst != null ? o.frFirst : o.iata);
    var seen = Object.create(null), out = [];
    for (var i = 0; i < L.length; i++) {
      var w = e[L[i]];
      if (typeof w !== 'string' || !w) { miss(key, L[i]); continue; }
      if (o.upper) w = w.toLocaleUpperCase(META[L[i]].intl);
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
    var l = lang || boardLang();
    if (!e) { miss(key, l); return []; }
    var v = e[l];
    // never another language's list: a missing one is nothing, not English
    if (!Array.isArray(v)) { miss(key, l); return []; }
    return v;
  }

  // ── TIMES, DATES AND WEEKDAYS ───────────────────────────────────────────
  // The only place a locale or hour12 is chosen. A time in a 24-hour
  // language reads 17:35; English reads 5:35pm, as the boards always have.
  function toDate(d) { return d instanceof Date ? d : new Date(d); }
  // opts.clock24 true forces 24 hours (a designer's choice); opts.seconds
  // adds the seconds.
  function time(d, lang, tz, opts) {
    var l = isLang(lang) ? lang : 'en';
    var dt = toDate(d);
    if (isNaN(dt.getTime())) return '';
    opts = opts || {};
    try {
      if (META[l].clock24 || opts.clock24 === true) {
        var o24 = { hour: '2-digit', minute: '2-digit', hour12: false };
        if (opts.seconds) o24.second = '2-digit';
        if (tz) o24.timeZone = tz;
        var s = dt.toLocaleTimeString('en-GB', o24);
        return s.replace(/^24:/, '00:');
      }
      var o12 = { hour: 'numeric', minute: '2-digit', hour12: true };
      if (opts.seconds) o12.second = '2-digit';
      if (tz) o12.timeZone = tz;
      return dt.toLocaleTimeString('en-US', o12)
        .replace(/\s*([AP])\.?\s*M\.?/gi, function (_, p) { return p.toLowerCase() + 'm'; });
    } catch (e) { return ''; }
  }
  // ── THE BOARD'S CLOCK ───────────────────────────────────────────────────
  // A board's own times (its clock, its rows, its gate times) read the clock
  // of the language it LEADS with — the first of its languages, French first
  // in Québec: English reads 5:35pm as the boards always have, the other
  // eight read 17:35. 'PM' is an English word: a German board printed it
  // beside rows at 17:20, because the rows already followed the first
  // language (_bidsTimeForLang) and the clocks did not. Every board time goes
  // through boardTime (a Date) or boardClockText (a time a feed already
  // wrote), so a screen reads one clock. A half that names its own language
  // (the welcome strip's clock in each language) keeps that language's own.
  function boardClock24(list) {
    var L = cleanList(list || boardLangs() || []);
    return L.length > 0 && !!META[L[0]].clock24;
  }
  // o.hour       '2-digit' | 'numeric' (the 12-hour form's hour; default numeric)
  // o.hourOnly   the hour alone: '3 PM' / '15:00'
  // o.list       the languages to decide by (default: the board's)
  function boardTime(d, tz, o) {
    o = o || {};
    var dt = toDate(d);
    if (isNaN(dt.getTime())) return '';
    try {
      if (boardClock24(o.list)) {
        var o24 = { hour: '2-digit', minute: '2-digit', hour12: false };
        if (tz) o24.timeZone = tz;
        var s = dt.toLocaleTimeString('en-GB', o24).replace(/^24:/, '00:');
        return o.hourOnly ? s.replace(/:\d\d$/, ':00') : s;
      }
      var o12 = o.hourOnly ? { hour: 'numeric', hour12: true } : { hour: o.hour || 'numeric', minute: '2-digit', hour12: true };
      if (tz) o12.timeZone = tz;
      return dt.toLocaleTimeString('en-US', o12);
    } catch (e) { return ''; }
  }
  // Every 12-hour time inside a text — '6:15 PM', '6:15pm', '12:03am',
  // '7:01PM', '5:20 p.m.' — in the board's clock: unchanged on a board that
  // leads in English, 'HH:MM' on any other.
  function boardClockText(text, list) {
    var t = String(text == null ? '' : text);
    if (!boardClock24(list)) return t;
    return t.replace(/\b(\d{1,2}):(\d{2})(?:\s|\u00A0|\u202F)?([AaPp])\.?\s?[Mm]\b\.?/g, function (m, h, mm, ap) {
      var n = parseInt(h, 10) % 12;
      if (/[Pp]/.test(ap)) n += 12;
      return (n < 10 ? '0' : '') + n + ':' + mm;
    });
  }

  // Is a feed's text in this language? Japanese, Chinese and Arabic by their
  // script; the five Latin languages by their own short words against
  // English's. Text a passenger would read as English on a board that is not
  // showing English is the one thing a board must not print, so a feed's
  // answer is shown in a language only when it looks like that language.
  function looksLike(text, l) {
    var t = String(text == null ? '' : text);
    if (!t.trim() || !isLang(l)) return false;
    if (l === 'ja') return /[\u3040-\u30FF\u3400-\u9FFF]/.test(t);
    if (l === 'zh') return /[\u3400-\u9FFF]/.test(t) && !/[\u3040-\u30FF]/.test(t);
    if (l === 'ar') return /[\u0600-\u06FF]/.test(t);
    if (/[\u3040-\u30FF\u3400-\u9FFF\u0600-\u06FF]/.test(t)) return false;
    var words = t.toLowerCase().match(/[a-z\u00e0-\u00ff\u0153']+/g) || [];
    var own = 0, en = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i].replace(/^'+|'+$/g, '').replace(/'s$/, '');
      if (_stopSet.en[w]) en++;
      if (l !== 'en' && _stopSet[l] && _stopSet[l][w]) own++;
    }
    if (l === 'en') return true;
    return !(en >= 1 && en > own);
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
  // The locale a language formats with (Intl), the only one: a call that
  // formats by locale outside this file takes BoardStrings.intl(lang).
  function intl(lang) { return (META[isLang(lang) ? lang : boardLang()] || META.en).intl; }
  // A number in the board's language: 1,234 in English, 1 234 in French,
  // 1.234 in German. The digits stay Western in every language (Arabic
  // boards have always shown them; changing that is a design decision).
  function num(n, lang) {
    var v = Number(n);
    if (!isFinite(v)) return '';
    try { return v.toLocaleString(intl(lang) + '-u-nu-latn'); } catch (e) { return String(v); }
  }
  function date(d, lang, opts, tz) {
    var l = isLang(lang) ? lang : 'en';
    var o = {};
    for (var k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    if (tz) o.timeZone = tz;
    try { return new Intl.DateTimeFormat(META[l].intl, o).format(toDate(d)); } catch (e) { return ''; }
  }
  // The long date a board prints whole (the gate's footer): weekday, day,
  // month and year in the language's own order ('vendredi 18 septembre
  // 2026', '2026年9月18日金曜日'), the weekday set off by META.weekdaySep
  // where the language has one.
  function longDate(d, lang, tz) {
    var l = isLang(lang) ? lang : 'en';
    var o = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    if (tz) o.timeZone = tz;
    try {
      var f = new Intl.DateTimeFormat(META[l].intl, o);
      var sep = META[l].weekdaySep;
      if (sep == null || typeof f.formatToParts !== 'function') return f.format(toDate(d));
      var parts = f.formatToParts(toDate(d)), out = '';
      for (var i = 0; i < parts.length; i++) {
        out += (parts[i].type === 'literal' && i > 0 && parts[i - 1].type === 'weekday') ? sep : parts[i].value;
      }
      return out;
    } catch (e) { return ''; }
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
      // the browser's own language, read here and nowhere else
      var nav = o.navigatorLang;
      if (nav == null) { try { nav = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (e) { nav = ''; } }
      if (!one.length) one = parseList(String(nav || '').split('-')[0], 1);
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

  // ── BEFORE THE BOARD HAS RESOLVED ITS LANGUAGES ─────────────────────────
  // The boot loader and the page's static text run before fids-core.js has
  // decided `langs`. They ask the same resolver with what a page knows at
  // that point: the URL, the saved choice and the airport's default — and,
  // on a phone, the one language its passenger picked, decided the way
  // fids-core.js decides it (narrower than 700px; fids_mobile_lang once the
  // board's one-time recovery has run, else the phone's own language). A
  // phone's loader greeted in English and French before the board had loaded.
  function bootLangs() {
    var L = boardLangs();
    if (L) return cleanList(L);
    var iata = '', search = '', saved = null, phone = false, phoneSaved = null;
    try {
      search = String(location.search || '');
      var q = new URLSearchParams(search);
      iata = String(q.get('ap') || '');
      if (!iata) { try { iata = sessionStorage.getItem('fids_airport') || ''; } catch (e1) {} }
      iata = iata.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      try { saved = localStorage.getItem('fids_langs_' + iata); } catch (e2) {}
      phone = (window.innerWidth || document.documentElement.clientWidth) < 700;
      if (phone) {
        try { if (localStorage.getItem('fids_lang_recovery_v27_done')) phoneSaved = localStorage.getItem('fids_mobile_lang'); } catch (e3) {}
      }
    } catch (e) {}
    return resolveLangs({ iata: iata, search: search, saved: saved, phone: phone, phoneSaved: phoneSaved }).langs;
  }
  // A loader status line: the board's first language, in capitals, trailing
  // ellipsis ('CHARGEMENT…'); `bare` leaves the ellipsis off ('PORTE 4').
  function loaderLine(key, bare) {
    var l = bootLangs()[0] || 'en';
    return bs(key, l).toLocaleUpperCase(META[l].intl) + (bare ? '' : '…');
  }
  // Marks an element as being in one language: lang, and dir for Arabic.
  function setLang(el, l) {
    if (!el || !el.setAttribute || !isLang(l)) return;
    el.setAttribute('lang', l);
    if (META[l].dir === 'rtl') el.setAttribute('dir', 'rtl'); else el.removeAttribute('dir');
  }
  // Static page text: every element carrying data-i18n="key" is filled from
  // the store — the board's pair, or with data-i18n-one its first language;
  // data-i18n-upper sets capitals. Run at boot and again whenever the
  // languages change (toggleLang).
  function applyStatic(root) {
    try {
      var doc = root || (typeof document !== 'undefined' ? document : null);
      if (!doc || !doc.querySelectorAll) return;
      var L = bootLangs();
      var els = doc.querySelectorAll('[data-i18n]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i], key = el.getAttribute('data-i18n');
        var upper = el.hasAttribute('data-i18n-upper');
        if (el.hasAttribute('data-i18n-one')) {
          var l = L[0] || 'en', w = bs(key, l);
          el.textContent = upper ? w.toLocaleUpperCase(META[l].intl) : w;
          setLang(el, l);
        } else {
          el.innerHTML = pair(key, { langs: L, upper: upper });
        }
      }
    } catch (e) {}
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () { applyStatic(); });
  }

  // ── WHEN THE BOARD'S LANGUAGES ARE DECIDED OR CHANGED ───────────────────
  // Words painted once — the boot loader, the page's static text — are
  // painted again in the board's languages. fids-core.js calls langsChanged()
  // from every path that sets `langs`: toggleLang and setBoardLangs
  // (_applyBoardLangs), the saved choice restored on a screen-type change,
  // the airport's config (which lands while the loader is still up, and can
  // name languages the loader did not know at boot) and a phone's one
  // language. A piece that paints its own words registers with onLangs(fn)
  // and is called with the board's languages; it repaints only what differs.
  // onLangs returns the function that unregisters it.
  var langSubs = [];
  function onLangs(fn) {
    if (typeof fn === 'function' && langSubs.indexOf(fn) < 0) langSubs.push(fn);
    return function () { var i = langSubs.indexOf(fn); if (i >= 0) langSubs.splice(i, 1); };
  }
  function langsChanged() {
    var L = bootLangs();
    applyStatic();
    langSubs.slice().forEach(function (fn) { try { fn(L.slice()); } catch (e) {} });
  }

  // ── PROVENANCE (localhost only) ─────────────────────────────────────────
  // ?i18n=provenance outlines every careful translation on screen with a ≈,
  // so the pictures show which words are ours rather than the airline's or
  // the government's (display-overrides.css, [data-i18n-src]).
  try {
    if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
        && /[?&]i18n=provenance\b/.test(location.search)) {
      document.documentElement.setAttribute('data-i18n-provenance', '1');
    }
  } catch (e) {}

  api.bootLangs = bootLangs;
  api.loaderLine = loaderLine;
  api.setLang = setLang;
  api.applyStatic = applyStatic;
  api.onLangs = onLangs;
  api.langsChanged = langsChanged;
  api.isLang = isLang;
  api.bs = bs;
  api.fmt = fmt;
  api.keyForEnglish = keyForEnglish;
  api.fill = fill;
  api.filled = filled;
  api.esc = esc;
  api.entry = entry;
  api.half = half;
  api.markHalf = markHalf;
  api.withScripts = withScripts;
  api.pair = pair;
  api.pairLangs = pairLangs;
  api.frenchFirst = frenchFirst;
  api.isFrFirst = isFrFirst;
  api.list = list;
  api.time = time;
  api.clockText = clockText;
  api.boardClock24 = boardClock24;
  api.boardTime = boardTime;
  api.boardClockText = boardClockText;
  api.looksLike = looksLike;
  api.date = date;
  api.longDate = longDate;
  api.intl = intl;
  api.num = num;
  api.weekday = weekday;
  api.defaultLangs = defaultLangs;
  api.parseList = parseList;
  api.resolveLangs = resolveLangs;
  api.SEP_HTML = SEP_HTML;
  return api;
});
