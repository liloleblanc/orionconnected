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
  // whole   (optional) the names in this language's words that its own line
  //         breaking would cut in two, space-separated. Chinese puts no
  //         space between words, and its dictionary (Intl.Segmenter, which
  //         js/home.js follows to break lines between words) cuts many names
  //         in pieces (卡尔|加里, 萨克|拉门|托), so a name written without a
  //         space (新不伦瑞克, New Brunswick) broke inside itself on the
  //         credits page; js/home.js sets each in a span that never wraps.
  //         The other languages hold their names whole in the words
  //         themselves (a no-break space), and Japanese names are katakana
  //         runs, which js/home.js never breaks.
  // after   (Japanese and Chinese) the particles, endings and function words
  //         a line may break after when the next word begins (の|空港,
  //         的|实时), space-separated; js/home.js breaks a line nowhere else
  //         inside a run of kana, and after no other single Chinese
  //         character.
  // prefix  (Japanese and Chinese) the prefixes a line never breaks after
  //         (ご|質問, 各|便, 第|一个).
  // range   (optional) what stands between the two ends of a range of
  //         numbers (Zones 2–6, Rows 1–13): the en dash, except Japanese
  //         (2〜6, 1〜13列目) and Chinese (第2至6区, 第1至13排), where the en
  //         dash is not range punctuation.
  // listSep (optional) the separator of a list of numbers on a sign, where
  //         Intl.ListFormat's conjunction is not what a sign writes: Chinese
  //         lists numbers with 、 alone (第4、5、6区, not 4、5和6).
  // rangeFmt (optional) a range of numbers written as words, {LO} and {HI}
  //         its two ends: Arabic « من 4 إلى 9 ». A dash between two numbers in
  //         Arabic text has no direction of its own (Unicode class ON) and
  //         resolves right to left, so "4–9" displayed as 9–4.
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
    ja: { dir: 'ltr', intl: 'ja',    clock24: true,  colon: '：',  script: 'jpan',  name: '日本語', range: '\u301C',
      after: 'の を に で と は が も へ や か から まで より ので には では とは にも でも での への との など て た だ ず した して ます です そして また および または',
      prefix: 'お ご 各 全 毎 第 両 約' },
    zh: { dir: 'ltr', intl: 'zh',    clock24: true,  colon: '：',  script: 'hans',  name: '中文', range: '\u81F3', listSep: '\u3001',
      whole: '哈利法克斯斯坦菲尔德 挪威气象研究所 新不伦瑞克 蒙克顿 波特兰 澳大利亚 加拿大 卡尔加里 蒙特利尔特鲁多 '
        + '萨克拉门托 斯波坎 温哥华 圣迭戈 阿拉斯加航空 西南航空 知识共享',
      after: '的 和 与 及 或 并 在 是 了 也 都 于 从 对 按 将 被 由 为 以 而 把 向 至',
      prefix: '第 每 各 全 约' },
    ar: { dir: 'rtl', intl: 'ar',    clock24: true,  colon: ': ',  script: 'arab',  name: 'العربية', rangeFmt: '\u0645\u0646 {LO} \u0625\u0644\u0649 {HI}' }
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
    // v24018 — the day an arrival the gate prints happened, when that was
    // the day before (the Your Aircraft card, a night stop: _gateDayWords past)
    yesterday: { en: 'Yesterday', fr: 'Hier', es: 'Ayer', de: 'Gestern', it: 'Ieri', pt: 'Ontem', ja: '昨日', zh: '昨天', ar: 'أمس' },

    // ── LOADERS AND STATUS LINES ──────────────────────────────────────────
    // The boot loader of fids/gids/bids/index (it greets in the board's own
    // languages now, not a fixed six) and its status line. The greetings copy
    // the boards' own words: _GATE_LBL.nowBoarding, _GATE_LBL.welcome and
    // LS.bagClaim.
    greetGate: { en: 'Now boarding', fr: 'Embarquement', es: 'Embarcando', de: 'Jetzt Boarding', it: 'Imbarco in corso', pt: 'Embarque em curso', ja: '搭乗中', zh: '正在登机', ar: 'جارٍ الصعود' },
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
    // v23996 — WHEN THE AIRPORT'S OWN FEED IS DOWN (fids-core.js
    // _fidsFeedPairHtml). feedUnavailable: the feed answered nothing usable and
    // there is no recent list to show; it replaces "No flights in window", and
    // on the gate and the belt "Awaiting Next Flight" and "No Assigned
    // Arrivals". feedStale: the board is showing the last list it had, {TIME}
    // being when that list is from (the strip along the bottom).
    // feedLastUpdate: the same time under feedUnavailable, when the last list
    // had nothing in this direction. Not in capitals: the strip is calm.
    feedUnavailable: { en: 'Live data unavailable', fr: 'Données en direct indisponibles', es: 'Datos en tiempo real no disponibles', de: 'Live-Daten nicht verfügbar', it: 'Dati in tempo reale non disponibili', pt: 'Dados em tempo real indisponíveis', ja: 'リアルタイム情報を取得できません', zh: '实时数据暂不可用', ar: 'البيانات المباشرة غير متاحة',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    feedStale: { en: 'Live data unavailable · last update {TIME}', fr: 'Données en direct indisponibles · dernière mise à jour {TIME}', es: 'Datos en tiempo real no disponibles · última actualización {TIME}', de: 'Live-Daten nicht verfügbar · letzte Aktualisierung {TIME}', it: 'Dati in tempo reale non disponibili · ultimo aggiornamento {TIME}', pt: 'Dados em tempo real indisponíveis · última atualização {TIME}', ja: 'リアルタイム情報を取得できません · 最終更新 {TIME}', zh: '实时数据暂不可用 · 最后更新 {TIME}', ar: 'البيانات المباشرة غير متاحة · آخر تحديث {TIME}',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    feedLastUpdate: { en: 'Last update {TIME}', fr: 'Dernière mise à jour {TIME}', es: 'Última actualización {TIME}', de: 'Letzte Aktualisierung {TIME}', it: 'Ultimo aggiornamento {TIME}', pt: 'Última atualização {TIME}', ja: '最終更新 {TIME}', zh: '最后更新 {TIME}', ar: 'آخر تحديث {TIME}',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    noResultsFor: { en: 'No results for “{Q}”', fr: 'Aucun résultat pour « {Q} »', es: 'Sin resultados para «{Q}»', de: 'Keine Ergebnisse für „{Q}“', it: 'Nessun risultato per «{Q}»', pt: 'Nenhum resultado para “{Q}”', ja: '「{Q}」に一致する結果はありません', zh: '没有与“{Q}”匹配的结果', ar: 'لا توجد نتائج لـ «{Q}»' },
    noData: { en: 'No data', fr: 'Aucune donnée', es: 'Sin datos', de: 'Keine Daten', it: 'Nessun dato', pt: 'Sem dados', ja: 'データなし', zh: '无数据', ar: 'لا توجد بيانات' },

    // ── AIRPORTS NAMED BY A DESCRIPTION ───────────────────────────────────
    // The name after a city with two of our airports (fids-core.js
    // _apSubline, through AP's subKey) where the airport is named by what it
    // is rather than by a person or a place: 'Belfast · International',
    // 'Dubai · International', 'Istanbul · Istanbul Airport'. Each language
    // names it its own way. A proper name (Pearson, Heathrow) is data, in AP.
    apIntl: { en: 'International', fr: 'International', es: 'Internacional', de: 'International', it: 'Internazionale', pt: 'Internacional', ja: '国際', zh: '国际', ar: 'الدولي',
      $ctx: 'airport' },
    apIstanbul: { en: 'Istanbul Airport', fr: 'Aéroport d’Istanbul', es: 'Aeropuerto de Estambul', de: 'Flughafen Istanbul', it: 'Aeroporto di Istanbul', pt: 'Aeroporto de Istambul', ja: 'イスタンブール空港', zh: '伊斯坦布尔机场', ar: 'مطار إسطنبول' },

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
    // BOARDING SEQUENCES — ja and zh read "priority boarding" (優先搭乗, 优先登机), the
    // same words as the priority step that now follows pre-boarding on the
    // sign (_GATE_LBL.priority 優先 / 优先). Japanese takes ANA's own word for
    // pre-boarding, 事前改札; Chinese 提前登机 (careful). German closes the
    // compound, Vorabeinstieg (SWISS writes it so).
    preboard: { en: 'Pre-boarding', fr: 'Préembarquement', es: 'Preembarque', de: 'Vorabeinstieg', it: 'Preimbarco', pt: 'Pré-embarque', ja: '事前改札', zh: '提前登机', ar: 'الصعود المسبق',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'airline:NH', zh: 'careful', ar: 'careful' } },
    genboard: { en: 'General boarding', fr: 'Embarquement général', es: 'Embarque general', de: 'Allgemeines Boarding', it: 'Imbarco generale', pt: 'Embarque geral', ja: '一般搭乗', zh: '普通登机', ar: 'الصعود العام',
      $src: { en: 'airline:PD', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // ── THE SWITCH TO EVERYONE, AND WHO STILL WAITS (the gate's boarding sign) ──
    // When the last call of an airline's sequence takes everyone still
    // waiting, the sign's centre says GENERAL BOARDING over the airline's own
    // unit, plural, never a bare "All": ALL ZONES (Air Canada, WestJet, Delta,
    // Transat), ALL GROUPS (United, American, Alaska), ALL ROWS (Porter: « TOUTES
    // LES RANGÉES »), ALL PASSENGERS for an airline that numbers nothing. The
    // sign sets the centre's big line in capitals (CSS, Latin scripts only),
    // so one key serves it. French agrees in gender: zone, rangée (toutes
    // les), groupe, passager (tous les). Rows in Japanese and Chinese are
    // "all seats" (全座席, 所有座位): 列 alone also reads as a queue.
    // allZones and allGroups moved here from the board's LS table, which the
    // sign cannot read (a key lives in one table).
    allZones: { en: 'All zones', fr: 'Toutes les zones', es: 'Todas las zonas', de: 'Alle Zonen', it: 'Tutte le zone', pt: 'Todas as zonas', ja: '全ゾーン', zh: '所有区域', ar: 'جميع المناطق',
      $src: { en: 'careful', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    allGroups: { en: 'All groups', fr: 'Tous les groupes', es: 'Todos los grupos', de: 'Alle Gruppen', it: 'Tutti i gruppi', pt: 'Todos os grupos', ja: '全グループ', zh: '所有组别', ar: 'جميع المجموعات',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    allRows: { en: 'All rows', fr: 'Toutes les rangées', es: 'Todas las filas', de: 'Alle Reihen', it: 'Tutte le file', pt: 'Todas as fileiras', ja: '全座席', zh: '所有座位', ar: 'جميع الصفوف',
      $src: { en: 'careful', fr: 'airline:PD', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Under a single call, who still waits: "Zones 4, 5 and 6: please remain
    // seated", in each language a whole line. The list is built per language
    // (Intl.ListFormat; Chinese joins with 、; four or more in a run is a
    // range: 2–6, 2〜6 in Japanese, 2至6 in Chinese) and stands for {LIST},
    // or {N} for one. The key follows the count (Intl.PluralRules): one, two
    // (the Arabic dual: المنطقتان, المجموعتان), or more; Japanese and Chinese
    // have one form, so every key there carries the list. One key per unit,
    // because the word order changes with it (ゾーン4 but 4列目; 第4区, 第14至20排).
    // French takes a no-break space before its colon. Japanese uses the
    // gate-announcement idiom 今しばらくお待ちください (お席 would mean an
    // assigned seat); Arabic يُرجى الانتظار في أماكنكم (the seat-belt phrase
    // البقاء في مقاعدكم is for the cabin, not the lounge).
    seatedZone: { en: 'Zone {N}: please remain seated', fr: 'Zone {N}\u00A0: veuillez rester assis', es: 'Zona {N}: por favor, permanezcan sentados', de: 'Zone {N}: Bitte bleiben Sie noch sitzen', it: 'Zona {N}: si prega di rimanere seduti', pt: 'Zona {N}: por favor, aguardem sentados', ja: 'ゾーン{N}のお客様は、今しばらくお待ちください', zh: '第{N}区旅客请在座位上稍候', ar: 'المنطقة {N}: يُرجى الانتظار في أماكنكم',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedZonesTwo: { en: 'Zones {LIST}: please remain seated', fr: 'Zones {LIST}\u00A0: veuillez rester assis', es: 'Zonas {LIST}: por favor, permanezcan sentados', de: 'Zonen {LIST}: Bitte bleiben Sie noch sitzen', it: 'Zone {LIST}: si prega di rimanere seduti', pt: 'Zonas {LIST}: por favor, aguardem sentados', ja: 'ゾーン{LIST}のお客様は、今しばらくお待ちください', zh: '第{LIST}区旅客请在座位上稍候', ar: 'المنطقتان {LIST}: يُرجى الانتظار في أماكنكم', $ctx: 'two',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedZones: { en: 'Zones {LIST}: please remain seated', fr: 'Zones {LIST}\u00A0: veuillez rester assis', es: 'Zonas {LIST}: por favor, permanezcan sentados', de: 'Zonen {LIST}: Bitte bleiben Sie noch sitzen', it: 'Zone {LIST}: si prega di rimanere seduti', pt: 'Zonas {LIST}: por favor, aguardem sentados', ja: 'ゾーン{LIST}のお客様は、今しばらくお待ちください', zh: '第{LIST}区旅客请在座位上稍候', ar: 'المناطق {LIST}: يُرجى الانتظار في أماكنكم',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedGroup: { en: 'Group {N}: please remain seated', fr: 'Groupe {N}\u00A0: veuillez rester assis', es: 'Grupo {N}: por favor, permanezcan sentados', de: 'Gruppe {N}: Bitte bleiben Sie noch sitzen', it: 'Gruppo {N}: si prega di rimanere seduti', pt: 'Grupo {N}: por favor, aguardem sentados', ja: 'グループ{N}のお客様は、今しばらくお待ちください', zh: '第{N}组旅客请在座位上稍候', ar: 'المجموعة {N}: يُرجى الانتظار في أماكنكم',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedGroupsTwo: { en: 'Groups {LIST}: please remain seated', fr: 'Groupes {LIST}\u00A0: veuillez rester assis', es: 'Grupos {LIST}: por favor, permanezcan sentados', de: 'Gruppen {LIST}: Bitte bleiben Sie noch sitzen', it: 'Gruppi {LIST}: si prega di rimanere seduti', pt: 'Grupos {LIST}: por favor, aguardem sentados', ja: 'グループ{LIST}のお客様は、今しばらくお待ちください', zh: '第{LIST}组旅客请在座位上稍候', ar: 'المجموعتان {LIST}: يُرجى الانتظار في أماكنكم', $ctx: 'two',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedGroups: { en: 'Groups {LIST}: please remain seated', fr: 'Groupes {LIST}\u00A0: veuillez rester assis', es: 'Grupos {LIST}: por favor, permanezcan sentados', de: 'Gruppen {LIST}: Bitte bleiben Sie noch sitzen', it: 'Gruppi {LIST}: si prega di rimanere seduti', pt: 'Grupos {LIST}: por favor, aguardem sentados', ja: 'グループ{LIST}のお客様は、今しばらくお待ちください', zh: '第{LIST}组旅客请在座位上稍候', ar: 'المجموعات {LIST}: يُرجى الانتظار في أماكنكم',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedRows: { en: 'Rows {LIST}: please remain seated', fr: 'Rangées {LIST}\u00A0: veuillez rester assis', es: 'Filas {LIST}: por favor, permanezcan sentados', de: 'Reihen {LIST}: Bitte bleiben Sie noch sitzen', it: 'File {LIST}: si prega di rimanere seduti', pt: 'Fileiras {LIST}: por favor, aguardem sentados', ja: '{LIST}列目のお客様は、今しばらくお待ちください', zh: '第{LIST}排旅客请在座位上稍候', ar: 'الصفوف {LIST}: يُرجى الانتظار في أماكنكم',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // At the switch, under ALL ZONES: everyone still waiting goes now. At
    // GATE CLOSED, under the closed symbol: where to turn. French says « un
    // agent », the usual Canadian airport word (« personnel de la porte »
    // was a calque that read as door staff); Spanish and German name the
    // ground staff.
    paxRemainGo: { en: 'All remaining passengers, please proceed to the gate', fr: 'Tous les autres passagers sont priés de se présenter à la porte', es: 'Los demás pasajeros, por favor, diríjanse a la puerta', de: 'Alle übrigen Fluggäste bitte jetzt zum Gate', it: 'Tutti gli altri passeggeri sono pregati di recarsi al gate', pt: 'Os demais passageiros, por favor, dirijam-se ao portão', ja: 'その他すべてのお客様は搭乗口へお進みください', zh: '其余旅客请前往登机口', ar: 'يُرجى من باقي الركاب التوجه إلى البوابة',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seeAgent: { en: 'Please see an agent', fr: 'Veuillez vous adresser à un agent', es: 'Por favor, diríjanse al personal de tierra', de: 'Bitte wenden Sie sich an das Bodenpersonal', it: 'Si prega di rivolgersi al personale', pt: 'Por favor, procure a equipe da companhia', ja: '係員にお申し出ください', zh: '请咨询工作人员', ar: 'يُرجى مراجعة أحد الموظفين',
      $src: { en: 'careful', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // THE INSTRUCTION LINE, the foot of the general panel until the switch:
    // "Please remain seated until your zone is called", in the airline's own
    // unit (zone, group, Porter's row), or until all passengers are called
    // where the airline numbers nothing (never "general boarding": the sign
    // says General boarding only at the switch). At the switch it gives way
    // to paxRemainGo.
    // The same idiom as the who-still-waits lines (rester assis, permanezcan
    // sentados, 今しばらくお待ちください, 稍候, الانتظار في أماكنكم); French with
    // the typographic apostrophe; German with the comma before its clause.
    seatedUntilZone: { en: 'Please remain seated until your zone is called', fr: 'Veuillez rester assis jusqu\u2019à l\u2019appel de votre zone', es: 'Por favor, permanezcan sentados hasta que se llame a su zona', de: 'Bitte bleiben Sie sitzen, bis Ihre Zone aufgerufen wird', it: 'Si prega di rimanere seduti fino alla chiamata della propria zona', pt: 'Por favor, aguardem sentados até que sua zona seja chamada', ja: 'ご搭乗ゾーンのご案内まで、今しばらくお待ちください', zh: '请在座位上稍候，直至您的区域开始登机', ar: 'يُرجى الانتظار في أماكنكم حتى النداء على منطقتكم',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedUntilGroup: { en: 'Please remain seated until your group is called', fr: 'Veuillez rester assis jusqu\u2019à l\u2019appel de votre groupe', es: 'Por favor, permanezcan sentados hasta que se llame a su grupo', de: 'Bitte bleiben Sie sitzen, bis Ihre Gruppe aufgerufen wird', it: 'Si prega di rimanere seduti fino alla chiamata del proprio gruppo', pt: 'Por favor, aguardem sentados até que seu grupo seja chamado', ja: 'ご搭乗グループのご案内まで、今しばらくお待ちください', zh: '请在座位上稍候，直至您的组别开始登机', ar: 'يُرجى الانتظار في أماكنكم حتى النداء على مجموعتكم',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedUntilRow: { en: 'Please remain seated until your row is called', fr: 'Veuillez rester assis jusqu\u2019à l\u2019appel de votre rangée', es: 'Por favor, permanezcan sentados hasta que se llame a su fila', de: 'Bitte bleiben Sie sitzen, bis Ihre Reihe aufgerufen wird', it: 'Si prega di rimanere seduti fino alla chiamata della propria fila', pt: 'Por favor, aguardem sentados até que sua fileira seja chamada', ja: 'ご搭乗の座席列のご案内まで、今しばらくお待ちください', zh: '请在座位上稍候，直至您所在的排开始登机', ar: 'يُرجى الانتظار في أماكنكم حتى النداء على صفوفكم',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    seatedUntilGen: { en: 'Please remain seated until all passengers are called', fr: 'Veuillez rester assis jusqu\u2019à l\u2019appel de tous les passagers', es: 'Por favor, permanezcan sentados hasta que se llame a todos los pasajeros', de: 'Bitte bleiben Sie sitzen, bis alle Fluggäste aufgerufen werden', it: 'Si prega di rimanere seduti fino alla chiamata di tutti i passeggeri', pt: 'Por favor, aguardem sentados até que todos os passageiros sejam chamados', ja: 'すべてのお客様のご搭乗のご案内まで、今しばらくお待ちください', zh: '请在座位上稍候，直至所有旅客开始登机', ar: 'يُرجى الانتظار في أماكنكم حتى الإعلان عن صعود جميع الركاب',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v24006 — what the rule says, in every language: GOVERNMENT-ISSUED ID.
    // Seven languages (es, de, it, pt, ja, zh, ar) asked for an ID with a
    // photo, English and French for plain ID. The Secure Air Travel Regulations
    // (SOR/2015-181 s.3(1)) accept one government ID with a photo, name and
    // date of birth OR two government IDs without a photo, so "photo"
    // over-claimed.
    // The words are the ones the documents research used for that rule
    // (U2 docId18: amtlicher Ausweis, identificación oficial, 政府発行の身分証明書…).
    photoId: { en: 'Have your government-issued ID ready for presentation', fr: 'Veuillez avoir votre pièce d’identité gouvernementale prête', es: 'Tenga lista su identificación oficial', de: 'Halten Sie Ihren amtlichen Ausweis bereit', it: 'Tenete pronto il documento d’identità ufficiale', pt: 'Tenha seu documento oficial de identidade em mãos', ja: '政府発行の身分証明書をご用意ください', zh: '请准备好政府签发的身份证件', ar: 'يرجى تجهيز هوية صادرة عن جهة حكومية',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // ── v24006 — THE BOARDING SCREEN'S DOCUMENTS LINE (_gateBandHtml) ──────
    // One line for the whole of boarding, under NOW BOARDING, chosen by the
    // flight's route (_gateDocsVariant). Each restates a published rule and
    // adds nothing to it:
    //   docsDomestic       a Canadian domestic flight: CATSA's "Have your
    //                      boarding pass ready" and SOR/2015-181 s.3's
    //                      government ID at the gate (catsa-acsta.gc.ca,
    //                      tips-stress-free-screening; laws-lois.justice.gc.ca
    //                      SOR-2015-181). French « carte d'embarquement » is
    //                      the government's and CATSA's word (Air Canada's own
    //                      page says « carte d'accès à bord »; one word for
    //                      every airline, the screening authority's).
    //   docsPassOnly       a departure from an airport outside Canada: the
    //                      boarding pass only, the one thing every route
    //                      asks (the U.S. ID rule is the TSA's, at the
    //                      checkpoint, not the gate; a Schengen or UK-Ireland
    //                      route asks no passport of its own citizens, so
    //                      none is claimed); CATSA's own words.
    //   docsPassport       a flight from Canada to the U.S. from an airport
    //                      without U.S. preclearance, and every international
    //                      flight (SOR/2015-181 s.4; travel.gc.ca).
    //   docsPassportNexus  a flight to the U.S. from one of the ten Canadian
    //                      preclearance airports (cbp.gov/travel/preclearance;
    //                      travel.gc.ca/destinations/united-states: "a valid
    //                      NEXUS card"). Never Porter at Billy Bishop: Porter's
    //                      own NEXUS page names Pearson and Ottawa only.
    //   docsVisa           an international flight from Canada, under the
    //                      passport line (travel.gc.ca/travelling/documents/
    //                      visas; "travel authorization" covers every scheme,
    //                      so no scheme's name can go stale). The research's
    //                      own words in every language, the singular « Visa »
    //                      and "Visa" included: French and Spanish spell it as
    //                      English does, and docsToCanada's French and Spanish
    //                      use the same word.
    //   docsToCanada       a flight TO Canada from a board outside Canada,
    //                      on its own: IRCC's own line ("Most
    //                      travellers need a visa or an electronic travel
    //                      authorization (eTA) to fly to or transit through a
    //                      Canadian airport", canada.ca …/visit-canada/eta/
    //                      facts.html and its language versions, read
    //                      2026-10-05), in IRCC's name for the eTA in each
    //                      language: AVE in French and Portuguese, eTA in
    //                      English, Japanese, Chinese and Arabic. Spanish,
    //                      German and Italian write IRCC's full name for it
    //                      (facts-es: « Autorización Electrónica de Viaje »,
    //                      facts-de: « elektronische Reisegenehmigung »,
    //                      facts-it: « Autorizzazione elettronica di viaggio »,
    //                      read 2026-10-06), not the bare acronym, which the
    //                      language guard reads as an English word in those
    //                      three. French keeps a no-break space before its
    //                      colon. Never at a Canadian gate.
    docsDomestic: { en: 'Boarding pass and ID ready', fr: 'Carte d’embarquement et pièce d’identité en main', es: 'Tarjeta de embarque e identificación a mano', de: 'Bordkarte und Ausweis bereithalten', it: 'Carta d’imbarco e documento pronti', pt: 'Cartão de embarque e documento em mãos', ja: '搭乗券と身分証明書をご用意ください', zh: '请备好登机牌和身份证件', ar: 'جهّز بطاقة الصعود والهوية',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    docsPassOnly: { en: 'Have your boarding pass ready', fr: 'Ayez votre carte d’embarquement à portée de main', es: 'Tenga lista su tarjeta de embarque', de: 'Halten Sie Ihre Bordkarte bereit', it: 'Tenete pronta la carta d’imbarco', pt: 'Tenha seu cartão de embarque em mãos', ja: '搭乗券をご用意ください', zh: '请准备好登机牌', ar: 'يرجى تجهيز بطاقة الصعود إلى الطائرة',
      $src: { en: 'gov:CATSA', fr: 'gov:CATSA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    docsPassport: { en: 'Have your passport ready', fr: 'Ayez votre passeport à portée de main', es: 'Tenga listo su pasaporte', de: 'Halten Sie Ihren Reisepass bereit', it: 'Tenete pronto il passaporto', pt: 'Tenha seu passaporte em mãos', ja: 'パスポートをご用意ください', zh: '请准备好护照', ar: 'يرجى تجهيز جواز السفر',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    docsPassportNexus: { en: 'Have your passport or NEXUS card ready', fr: 'Ayez votre passeport ou carte NEXUS à portée de main', es: 'Tenga listo su pasaporte o tarjeta NEXUS', de: 'Halten Sie Reisepass oder NEXUS-Karte bereit', it: 'Tenete pronto il passaporto o la carta NEXUS', pt: 'Tenha seu passaporte ou cartão NEXUS em mãos', ja: 'パスポートまたはNEXUSカードをご用意ください', zh: '请准备好护照或NEXUS卡', ar: 'يرجى تجهيز جواز السفر أو بطاقة NEXUS',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    docsVisa: { en: 'Visa or travel authorization if required', fr: 'Visa ou autorisation de voyage, s’il y a lieu', es: 'Visa o autorización de viaje, si corresponde', de: 'Visum oder Reisegenehmigung, falls erforderlich', it: 'Visto o autorizzazione di viaggio, se richiesti', pt: 'Visto ou autorização de viagem, se exigidos', ja: '必要な方はビザまたは渡航認証', zh: '如有需要：签证或电子旅行许可', ar: 'تأشيرة أو تصريح سفر إلكتروني عند الاقتضاء',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    docsToCanada: { en: 'Flying to Canada? Visa or eTA may apply', fr: 'Vol vers le Canada\u00A0: visa ou AVE, s’il y a lieu', es: '¿Vuela a Canadá? Puede necesitar visa o Autorización Electrónica de Viaje', de: 'Flug nach Kanada? Ggf. Visum oder elektronische Reisegenehmigung nötig', it: 'Volo per il Canada? Può servire visto o Autorizzazione elettronica di viaggio', pt: 'Voo para o Canadá? Pode exigir visto ou AVE', ja: 'カナダ行き：ビザまたはeTAが必要な場合があります', zh: '飞往加拿大：可能需要签证或电子旅行证（eTA）', ar: 'السفر إلى كندا: قد تحتاج إلى تأشيرة أو تصريح سفر إلكتروني (eTA)',
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
      ja: '障がいのあるお客様 · 同伴者のいない未成年のお客様 · 2歳以下のお子様連れのご家族 · VIPorter プレミアム会員 · PorterReserve のお客様',
      zh: '残障旅客 · 无成人陪伴的未成年人 · 携带两岁及以下儿童的家庭 · VIPorter 高级会员 · PorterReserve 旅客',
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
    // BOARDING SEQUENCES — French « Privilège », WestJet's own name for the cabin
    // (westjet.com/fr-ca, « cabine Affaires ou Privilège »), not the English.
    cabinPremiumWS: { en: 'Premium', fr: 'Privilège', es: 'Premium', de: 'Premium', it: 'Premium', pt: 'Premium', ja: 'プレミアム', zh: '高级舱', ar: 'بريميوم',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinEconWS: { en: 'Economy', fr: 'Économie', es: 'Económica', de: 'Economy', it: 'Economica', pt: 'Econômica', ja: 'エコノミー', zh: '经济舱', ar: 'اقتصادي',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinPremRouge: { en: 'Premium Rouge', fr: 'Premium Rouge', es: 'Premium Rouge', de: 'Premium Rouge', it: 'Premium Rouge', pt: 'Premium Rouge', ja: 'Premium Rouge', zh: 'Premium Rouge', ar: 'Premium Rouge',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinUnitedFirst: { en: 'United First', fr: 'United First', es: 'United First', de: 'United First', it: 'United First', pt: 'United First', ja: 'United First', zh: 'United First', ar: 'United First',
      $src: { en: 'airline:UA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinUnitedEcon: { en: 'United Economy', fr: 'United Economy', es: 'United Economy', de: 'United Economy', it: 'United Economy', pt: 'United Economy', ja: 'United Economy', zh: 'United Economy', ar: 'United Economy',
      $src: { en: 'airline:UA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // ── BOARDING SEQUENCES (boarding-sequence.js) ───────────────────────────
    // Each airline's published boarding calls play one after another on the
    // gate's sign, pre-boarding first. The stage names and the who-lists are
    // the airline's own words in every language it publishes (the URL is the
    // table's src in boarding-sequence.js); the other languages are careful
    // translations, marked so. A programme name (ConciergeKey, Global
    // Services, Premier 1K, A-List Preferred, Elite Diamond) appears only
    // inside a translated who-list, never on its own.
    // The plural of _GATE_LBL.groupLabel, for two groups called together
    // (Groups 3 • 4) and the groups called so far; house wording.
    groups: { en: 'Groups', fr: 'Groupes', es: 'Grupos', de: 'Gruppen', it: 'Gruppi', pt: 'Grupos', ja: 'グループ', zh: '组别', ar: 'المجموعات',
      $src: { en: 'house', fr: 'house', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Air Canada's « Family Boarding » / « Embarquement des familles »,
    // between Zones 2 and 3 (aircanada.com, family travel tips, fr-ca); and
    // American's family boarding (aa.com), the same words.
    familyBoard: { en: 'Family boarding', fr: 'Embarquement des familles', es: 'Embarque para familias', de: 'Boarding für Familien', it: 'Imbarco per famiglie', pt: 'Embarque para famílias', ja: 'ファミリー搭乗', zh: '家庭登机', ar: 'صعود العائلات',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // WestJet's "special boarding, after our priority guests" / « pendant
    // l'embarquement spécial » (westjet.com, children and infants).
    specialBoard: { en: 'Special boarding', fr: 'Embarquement spécial', es: 'Embarque especial', de: 'Sonder-Boarding', it: 'Imbarco speciale', pt: 'Embarque especial', ja: '特別搭乗', zh: '特别登机', ar: 'صعود خاص',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Delta's "Early Access" / « Accès anticipé » (delta.com, Boarding
    // priority, en and fr-ca), between Zone 2 and Zone 3.
    earlyAccess: { en: 'Early Access', fr: 'Accès anticipé', es: 'Acceso anticipado', de: 'Früher Zugang', it: 'Accesso anticipato', pt: 'Acesso antecipado', ja: '早期搭乗', zh: '提前登机', ar: 'الصعود المبكر',
      $src: { en: 'airline:DL', fr: 'airline:DL', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // JetBlue's "Courtesy Boarding" (jetblue.com, Boarding procedures), after
    // Group 3; JetBlue publishes no French.
    courtesyBoard: { en: 'Courtesy boarding', fr: 'Embarquement de courtoisie', es: 'Embarque de cortesía', de: 'Kulanz-Boarding', it: 'Imbarco di cortesia', pt: 'Embarque de cortesia', ja: '特別配慮搭乗', zh: '礼遇登机', ar: 'صعود المجاملة',
      $src: { en: 'airline:B6', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // WHO IS CALLED, under the stage's name, in both of the board's languages
    // (each a block of whole items, _g8SeqWho).
    // preboardWhoAny: the pre-boarding every airline owes at a Canadian or
    // U.S. airport, whatever it publishes: the Accessible Transportation for
    // Persons with Disabilities Regulations, SOR/2019-244 s.34(1) (boarding
    // before other passengers on request), and 14 CFR 382.93 (the
    // opportunity to pre-board). House wording; shown only at those airports.
    preboardWhoAny: { en: 'Passengers who need assistance or more time to board', fr: 'Passagers ayant besoin d’aide ou de plus de temps pour embarquer', es: 'Pasajeros que necesitan asistencia o más tiempo para embarcar', de: 'Fluggäste, die Hilfe oder mehr Zeit zum Einsteigen benötigen', it: 'Passeggeri che necessitano di assistenza o di più tempo per l’imbarco', pt: 'Passageiros que precisam de assistência ou de mais tempo para embarcar', ja: '介助が必要なお客様、搭乗にお時間がかかるお客様', zh: '需要协助或需要更多登机时间的旅客', ar: 'الركاب الذين يحتاجون إلى مساعدة أو إلى وقت أطول للصعود',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Air Canada, Boarding by zone (en and fr), Pre-boarding.
    preboardWhoAC: { en: 'Customers who have requested wheelchair assistance or who need more time to board', fr: 'Clients qui ont demandé le service de fauteuil roulant ou qui ont besoin de plus de temps pour monter à bord', es: 'Clientes que solicitaron asistencia con silla de ruedas o que necesitan más tiempo para embarcar', de: 'Fluggäste, die Rollstuhlhilfe angefordert haben oder mehr Zeit zum Einsteigen benötigen', it: 'Clienti che hanno richiesto assistenza in sedia a rotelle o che necessitano di più tempo per l’imbarco', pt: 'Clientes que solicitaram assistência com cadeira de rodas ou que precisam de mais tempo para embarcar', ja: '車いすでの介助をご依頼のお客様、搭乗にお時間がかかるお客様', zh: '已申请轮椅协助或需要更多登机时间的旅客', ar: 'العملاء الذين طلبوا المساعدة بكرسي متحرك أو يحتاجون إلى وقت أطول للصعود',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Air Canada's Family Boarding / Musical Instruments step (Boarding by
    // zone): children under 6, more time to board, a musical instrument as
    // carry-on. The French body of the step is not verified: careful.
    familyWhoAC: { en: 'Customers travelling with children under the age of 6 or who need more time to board · Customers carrying musical instruments on board', fr: 'Clients voyageant avec des enfants de moins de 6 ans ou qui ont besoin de plus de temps pour monter à bord · Clients avec un instrument de musique à bord', es: 'Clientes que viajan con niños menores de 6 años o que necesitan más tiempo para embarcar · Clientes con un instrumento de música a bordo', de: 'Fluggäste mit Kindern unter 6 Jahren oder mit mehr Zeitbedarf beim Einsteigen · Fluggäste mit einem Musikinstrument an Bord', it: 'Clienti in viaggio con bambini sotto i 6 anni o che necessitano di più tempo per l’imbarco · Clienti con uno strumento musicale a bordo', pt: 'Clientes viajando com crianças menores de 6 anos ou que precisam de mais tempo para embarcar · Clientes com um instrumento de música a bordo', ja: '6歳未満のお子様連れのお客様、搭乗にお時間が必要なお客様 · 楽器を機内に持ち込まれるお客様', zh: '携带6岁以下儿童或需要更多登机时间的旅客 · 随身携带乐器的旅客', ar: 'العملاء المسافرون مع أطفال دون سن 6 سنوات أو الذين يحتاجون إلى وقت أطول للصعود · العملاء الذين يحملون آلة موسيقية على متن الطائرة',
      $src: { en: 'airline:AC', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // WestJet's pre-boarding (westjet.com, mobility assistance and
    // unaccompanied minors, en-ca and fr-ca).
    preboardWhoWS: { en: 'Guests who need extra time or support · Unaccompanied minors', fr: 'Invités qui ont besoin de temps supplémentaire ou de soutien · Mineurs non accompagnés', es: 'Pasajeros que necesitan más tiempo o apoyo · Menores no acompañados', de: 'Gäste, die mehr Zeit oder Unterstützung benötigen · Alleinreisende Minderjährige', it: 'Ospiti che necessitano di più tempo o supporto · Minori non accompagnati', pt: 'Passageiros que precisam de mais tempo ou apoio · Menores desacompanhados', ja: 'お時間やサポートが必要なお客様 · 同伴者のいない未成年のお客様', zh: '需要更多时间或协助的旅客 · 无成人陪伴的未成年人', ar: 'الضيوف الذين يحتاجون إلى وقت إضافي أو دعم · القاصرون غير المصحوبين',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // WestJet's special boarding (children and infants, en-ca and fr-ca).
    specialWhoWS: { en: 'Guests travelling with children under five', fr: 'Invités voyageant avec des enfants de moins de cinq ans', es: 'Pasajeros que viajan con niños menores de cinco años', de: 'Gäste mit Kindern unter fünf Jahren', it: 'Ospiti in viaggio con bambini sotto i cinque anni', pt: 'Passageiros viajando com crianças menores de cinco anos', ja: '5歳未満のお子様連れのお客様', zh: '携带五岁以下儿童的旅客', ar: 'الضيوف المسافرون مع أطفال دون الخامسة',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // PAL Airlines' pre-boarding (palairlines.ca, travel documents, en and fr).
    preboardWhoPB: { en: 'Unaccompanied minors · Passengers with small children · Passengers in need of assistance', fr: 'Personnes mineures non accompagnées · Passagers accompagnés de jeunes enfants · Personnes ayant besoin d’assistance', es: 'Menores no acompañados · Pasajeros con niños pequeños · Pasajeros que necesitan asistencia', de: 'Alleinreisende Minderjährige · Fluggäste mit kleinen Kindern · Fluggäste, die Hilfe benötigen', it: 'Minori non accompagnati · Passeggeri con bambini piccoli · Passeggeri che necessitano di assistenza', pt: 'Menores desacompanhados · Passageiros com crianças pequenas · Passageiros que precisam de assistência', ja: '同伴者のいない未成年のお客様 · 小さなお子様連れのお客様 · 介助が必要なお客様', zh: '无成人陪伴的未成年人 · 携带幼儿的旅客 · 需要协助的旅客', ar: 'القاصرون غير المصحوبين · الركاب المسافرون مع أطفال صغار · الركاب الذين يحتاجون إلى مساعدة',
      $src: { en: 'airline:PB', fr: 'airline:PB', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Flair's pre-boarding (flyflair.com, deadlines; read from the search
    // index, the site blocks automated readers). FLAIR'S FRENCH IS NOT
    // VERIFIED: careful.
    preboardWhoF8: { en: 'Families with young children · Customers who need extra assistance', fr: 'Familles avec de jeunes enfants · Clients ayant besoin d’une aide supplémentaire', es: 'Familias con niños pequeños · Clientes que necesitan asistencia adicional', de: 'Familien mit kleinen Kindern · Fluggäste, die zusätzliche Hilfe benötigen', it: 'Famiglie con bambini piccoli · Clienti che necessitano di ulteriore assistenza', pt: 'Famílias com crianças pequenas · Clientes que precisam de assistência adicional', ja: '小さなお子様連れのご家族 · 特別な介助が必要なお客様', zh: '携带幼儿的家庭 · 需要额外协助的旅客', ar: 'العائلات مع أطفال صغار · العملاء الذين يحتاجون إلى مساعدة إضافية',
      $src: { en: 'airline:F8', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Air Transat (family privileges; accessibility, en-CA and fr-CA). Its
    // family pre-boarding excludes flights to the U.S. (« À l'exception des
    // vols vers les États-Unis »): preboardWhoTSus there. The French half is
    // careful: Transat's French accessibility page puts passengers who need
    // mobility assistance in « L'embarquement prioritaire » and names
    // « pré-embarquement » only for visual impairment, so whether they
    // pre-board or board in priority is a reading of a low-confidence source.
    preboardWhoTS: { en: 'Families travelling with young children · Passengers with disabilities receiving assistance', fr: 'Familles voyageant avec de jeunes enfants · Passagers ayant une incapacité qui reçoivent de l’assistance', es: 'Familias que viajan con niños pequeños · Pasajeros con discapacidad que reciben asistencia', de: 'Familien mit kleinen Kindern · Fluggäste mit Behinderung, die Hilfe erhalten', it: 'Famiglie in viaggio con bambini piccoli · Passeggeri con disabilità che ricevono assistenza', pt: 'Famílias viajando com crianças pequenas · Passageiros com deficiência que recebem assistência', ja: '小さなお子様連れのご家族 · 介助を受ける障がいのあるお客様', zh: '携带幼儿出行的家庭 · 接受协助的残障旅客', ar: 'العائلات المسافرة مع أطفال صغار · الركاب ذوو الإعاقة الذين يتلقون المساعدة',
      $src: { en: 'airline:TS', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    preboardWhoTSus: { en: 'Passengers with disabilities receiving assistance', fr: 'Passagers ayant une incapacité qui reçoivent de l’assistance', es: 'Pasajeros con discapacidad que reciben asistencia', de: 'Fluggäste mit Behinderung, die Hilfe erhalten', it: 'Passeggeri con disabilità che ricevono assistenza', pt: 'Passageiros com deficiência que recebem assistência', ja: '介助を受ける障がいのあるお客様', zh: '接受协助的残障旅客', ar: 'الركاب ذوو الإعاقة الذين يتلقون المساعدة',
      $src: { en: 'airline:TS', fr: 'airline:TS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // United's pre-boarding row (united.com, Boarding process; its French
    // page reads « Passagers à mobilité réduite »). United's own French calls
    // this row « Embarquement prioritaire », the name of its paid product in
    // Group 2 as well; the sign titles it with preboard instead, so the
    // pre-boarding and priority steps never read the same (a deliberate
    // choice).
    preboardWhoUA: { en: 'Customers with disabilities · Unaccompanied minors · Families with children 2 and younger · Active military · Members of Global Services and Premier 1K', fr: 'Passagers à mobilité réduite · Mineurs non accompagnés · Familles avec des enfants de 2 ans ou moins · Militaires en service actif · Membres Global Services et Premier 1K', es: 'Clientes con discapacidad · Menores no acompañados · Familias con niños de 2 años o menos · Militares en servicio activo · Miembros Global Services y Premier 1K', de: 'Fluggäste mit Behinderung · Alleinreisende Minderjährige · Familien mit Kindern bis 2 Jahre · Aktive Militärangehörige · Mitglieder von Global Services und Premier 1K', it: 'Clienti con disabilità · Minori non accompagnati · Famiglie con bambini fino a 2 anni · Militari in servizio attivo · Membri Global Services e Premier 1K', pt: 'Clientes com deficiência · Menores desacompanhados · Famílias com crianças de até 2 anos · Militares na ativa · Membros Global Services e Premier 1K', ja: '障がいのあるお客様 · 同伴者のいない未成年のお客様 · 2歳以下のお子様連れのご家族 · 現役軍人 · Global Services および Premier 1K 会員', zh: '残障旅客 · 无成人陪伴的未成年人 · 携带两岁及以下儿童的家庭 · 现役军人 · Global Services 和 Premier 1K 会员', ar: 'العملاء ذوو الإعاقة · القاصرون غير المصحوبين · العائلات مع أطفال بعمر سنتين أو أقل · العسكريون في الخدمة الفعلية · أعضاء Global Services وPremier 1K',
      $src: { en: 'airline:UA', fr: 'airline:UA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Delta's Pre-Boarding row and the active-duty military row under it
    // (delta.com, Boarding priority, en and fr-ca).
    preboardWhoDL: { en: 'Customers needing assistance or more time to board · Active-duty U.S. military', fr: 'Passagers ayant besoin d’une assistance particulière ou d’un temps supplémentaire pour embarquer · Militaires américains en activité', es: 'Clientes que necesitan asistencia o más tiempo para embarcar · Militares estadounidenses en servicio activo', de: 'Fluggäste, die Hilfe oder mehr Zeit zum Einsteigen benötigen · Aktive US-Militärangehörige', it: 'Clienti che necessitano di assistenza o di più tempo per l’imbarco · Militari statunitensi in servizio attivo', pt: 'Clientes que precisam de assistência ou de mais tempo para embarcar · Militares dos EUA na ativa', ja: '介助または搭乗にお時間が必要なお客様 · 現役の米軍人', zh: '需要协助或更多登机时间的旅客 · 美国现役军人', ar: 'العملاء الذين يحتاجون إلى مساعدة أو وقت أطول للصعود · العسكريون الأمريكيون في الخدمة الفعلية',
      $src: { en: 'airline:DL', fr: 'airline:DL', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    earlyAccessWhoDL: { en: 'Customers travelling with car seats and strollers', fr: 'Voyageurs avec des sièges-auto et des poussettes', es: 'Clientes que viajan con sillas infantiles y cochecitos', de: 'Reisende mit Autositzen und Kinderwagen', it: 'Clienti in viaggio con seggiolini per bambini e passeggini', pt: 'Clientes viajando com cadeirinhas de carro e carrinhos de bebê', ja: 'チャイルドシートやベビーカーをお持ちのお客様', zh: '携带儿童安全座椅和婴儿车的旅客', ar: 'العملاء المسافرون مع مقاعد أطفال للسيارة وعربات أطفال',
      $src: { en: 'airline:DL', fr: 'airline:DL', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // American (aa.com, Boarding process): special assistance at the gate,
    // then ConciergeKey, First and Business (its cabin names, the same on its
    // French page), then families with children under 2.
    preboardWhoAA: { en: 'Customers who need special assistance', fr: 'Clients ayant besoin d’une assistance particulière', es: 'Clientes que necesitan asistencia especial', de: 'Fluggäste, die besondere Hilfe benötigen', it: 'Clienti che necessitano di assistenza speciale', pt: 'Clientes que precisam de assistência especial', ja: '特別な介助が必要なお客様', zh: '需要特殊协助的旅客', ar: 'العملاء الذين يحتاجون إلى مساعدة خاصة',
      $src: { en: 'airline:AA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoAA: { en: 'ConciergeKey members · First · Business', fr: 'Membres ConciergeKey · First · Business', es: 'Miembros ConciergeKey · First · Business', de: 'ConciergeKey-Mitglieder · First · Business', it: 'Membri ConciergeKey · First · Business', pt: 'Membros ConciergeKey · First · Business', ja: 'ConciergeKey 会員 · ファースト · ビジネス', zh: 'ConciergeKey 会员 · 头等舱 · 商务舱', ar: 'أعضاء ConciergeKey · الدرجة الأولى · درجة رجال الأعمال',
      $src: { en: 'airline:AA', fr: 'airline:AA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    familyWhoAA: { en: 'Families with children under 2', fr: 'Familles avec des enfants de moins de 2 ans', es: 'Familias con niños menores de 2 años', de: 'Familien mit Kindern unter 2 Jahren', it: 'Famiglie con bambini sotto i 2 anni', pt: 'Famílias com crianças menores de 2 anos', ja: '2歳未満のお子様連れのご家族', zh: '携带2岁以下儿童的家庭', ar: 'العائلات مع أطفال دون سنتين',
      $src: { en: 'airline:AA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Alaska, and Hawaiian on the same page since 2026-04-22 (alaskaair.com,
    // Our boarding process).
    preboardWhoAS: { en: 'Guests with disabilities who need help or a little more time to board', fr: 'Passagers ayant un handicap qui ont besoin d’aide ou d’un peu plus de temps pour embarquer', es: 'Pasajeros con discapacidad que necesitan ayuda o un poco más de tiempo para embarcar', de: 'Gäste mit Behinderung, die Hilfe oder etwas mehr Zeit zum Einsteigen benötigen', it: 'Ospiti con disabilità che necessitano di aiuto o di un po’ più di tempo per l’imbarco', pt: 'Passageiros com deficiência que precisam de ajuda ou de um pouco mais de tempo para embarcar', ja: '搭乗に介助や少しお時間が必要な障がいのあるお客様', zh: '需要协助或稍多登机时间的残障旅客', ar: 'الضيوف ذوو الإعاقة الذين يحتاجون إلى مساعدة أو وقت أطول قليلاً للصعود',
      $src: { en: 'airline:AS', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // JetBlue (jetblue.com, Boarding procedures): Pre-boarding, and Courtesy
    // Boarding after Group 3.
    preboardWhoB6: { en: 'Customers with disabilities', fr: 'Clients ayant un handicap', es: 'Clientes con discapacidad', de: 'Fluggäste mit Behinderung', it: 'Clienti con disabilità', pt: 'Clientes com deficiência', ja: '障がいのあるお客様', zh: '残障旅客', ar: 'العملاء ذوو الإعاقة',
      $src: { en: 'airline:B6', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    courtesyWhoB6: { en: 'Active military · Customers travelling with car seats or strollers', fr: 'Militaires en service actif · Clients voyageant avec des sièges pour enfant ou des poussettes', es: 'Militares en servicio activo · Clientes que viajan con sillas infantiles o cochecitos', de: 'Aktive Militärangehörige · Reisende mit Autositzen oder Kinderwagen', it: 'Militari in servizio attivo · Clienti in viaggio con seggiolini per bambini o passeggini', pt: 'Militares na ativa · Clientes viajando com cadeirinhas de carro ou carrinhos de bebê', ja: '現役軍人 · チャイルドシートまたはベビーカーをお持ちのお客様', zh: '现役军人 · 携带儿童安全座椅或婴儿车的旅客', ar: 'العسكريون في الخدمة الفعلية · العملاء المسافرون مع مقاعد أطفال للسيارة أو عربات أطفال',
      $src: { en: 'airline:B6', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Southwest (support.southwest.com, Boarding process): Preboarding, then
    // Priority Boarding with active-duty military, then A-List Preferred (its
    // own row).
    preboardWhoWN: { en: 'Customers with disabilities who need more time or assistance · Unaccompanied minors', fr: 'Clients ayant un handicap qui ont besoin de plus de temps ou d’aide · Mineurs non accompagnés', es: 'Clientes con discapacidad que necesitan más tiempo o asistencia · Menores no acompañados', de: 'Fluggäste mit Behinderung, die mehr Zeit oder Hilfe benötigen · Alleinreisende Minderjährige', it: 'Clienti con disabilità che necessitano di più tempo o assistenza · Minori non accompagnati', pt: 'Clientes com deficiência que precisam de mais tempo ou assistência · Menores desacompanhados', ja: 'お時間や介助が必要な障がいのあるお客様 · 同伴者のいない未成年のお客様', zh: '需要更多时间或协助的残障旅客 · 无成人陪伴的未成年人', ar: 'العملاء ذوو الإعاقة الذين يحتاجون إلى وقت أطول أو مساعدة · القاصرون غير المصحوبين',
      $src: { en: 'airline:WN', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoWN: { en: 'Customers with priority boarding · Active-duty U.S. military', fr: 'Clients avec embarquement prioritaire · Militaires américains en activité', es: 'Clientes con embarque prioritario · Militares estadounidenses en servicio activo', de: 'Fluggäste mit Vorrang-Boarding · Aktive US-Militärangehörige', it: 'Clienti con imbarco prioritario · Militari statunitensi in servizio attivo', pt: 'Clientes com embarque prioritário · Militares dos EUA na ativa', ja: '優先搭乗をご購入のお客様 · 現役の米軍人', zh: '购买优先登机的旅客 · 美国现役军人', ar: 'عملاء الصعود ذي الأولوية · العسكريون الأمريكيون في الخدمة الفعلية',
      $src: { en: 'airline:WN', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Southwest's A-List Preferred row, its own call before Group 1.
    prioWhoWNalp: { en: 'Members of A-List Preferred', fr: 'Membres A-List Preferred', es: 'Miembros A-List Preferred', de: 'Mitglieder von A-List Preferred', it: 'Membri A-List Preferred', pt: 'Membros A-List Preferred', ja: 'A-List Preferred 会員', zh: 'A-List Preferred 会员', ar: 'أعضاء A-List Preferred',
      $src: { en: 'airline:WN', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Frontier (faq.flyfrontier.com, Frontier boarding process).
    preboardWhoF9: { en: 'Customers with disabilities · Active-duty U.S. military · Families with children under 2 · Members of Elite Diamond', fr: 'Clients ayant un handicap · Militaires américains en activité · Familles avec des enfants de moins de 2 ans · Membres Elite Diamond', es: 'Clientes con discapacidad · Militares estadounidenses en servicio activo · Familias con niños menores de 2 años · Miembros Elite Diamond', de: 'Fluggäste mit Behinderung · Aktive US-Militärangehörige · Familien mit Kindern unter 2 Jahren · Mitglieder von Elite Diamond', it: 'Clienti con disabilità · Militari statunitensi in servizio attivo · Famiglie con bambini sotto i 2 anni · Membri Elite Diamond', pt: 'Clientes com deficiência · Militares dos EUA na ativa · Famílias com crianças menores de 2 anos · Membros Elite Diamond', ja: '障がいのあるお客様 · 現役の米軍人 · 2歳未満のお子様連れのご家族 · Elite Diamond 会員', zh: '残障旅客 · 美国现役军人 · 携带2岁以下儿童的家庭 · Elite Diamond 会员', ar: 'العملاء ذوو الإعاقة · العسكريون الأمريكيون في الخدمة الفعلية · العائلات مع أطفال دون سنتين · أعضاء Elite Diamond',
      $src: { en: 'airline:F9', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // ── EACH ZONE'S OWN CABIN (boarding-sequence.js) ─────────────────────────
    // Air Canada's Zone 2 cabin (Boarding by zone: "Premium Economy
    // passengers"; French « Économique Privilège »), on its widebodies only.
    cabinPremEconAC: { en: 'Premium Economy', fr: 'Économique Privilège', es: 'Económica Premium', de: 'Premium-Economyklasse', it: 'Economy Premium', pt: 'Econômica Premium', ja: 'プレミアムエコノミー', zh: '高端经济舱', ar: 'الدرجة السياحية الممتازة',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // WestJet's Zone 2 seats ("Guests seated in Extended Comfort"; French
    // « Confort accru »).
    cabinExtComfortWS: { en: 'Extended Comfort', fr: 'Confort accru', es: 'Confort ampliado', de: 'Erweiterter Komfort', it: 'Comfort esteso', pt: 'Conforto estendido', ja: 'エクステンデッド・コンフォート', zh: '加大空间座位', ar: 'راحة إضافية',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // American's Groups 5 to 9 (aa.com, Boarding process: "Main Cabin").
    cabinMainAA: { en: 'Main Cabin', fr: 'Cabine principale', es: 'Cabina principal', de: 'Hauptkabine', it: 'Cabina principale', pt: 'Cabine principal', ja: 'メインキャビン', zh: '主舱', ar: 'المقصورة الرئيسية',
      $src: { en: 'airline:AA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Delta's zones (delta.com, Boarding priority, read 2026-10-12): its
    // cabins are brands, named inside the list of who each zone calls.
    prioWhoDL1: { en: 'Delta One customers · Delta First customers', fr: 'Clients Delta One · Clients Delta First', es: 'Clientes de Delta One · Clientes de Delta First', de: 'Fluggäste in Delta One · Fluggäste in Delta First', it: 'Clienti Delta One · Clienti Delta First', pt: 'Clientes Delta One · Clientes Delta First', ja: 'Delta One のお客様 · Delta First のお客様', zh: 'Delta One 旅客 · Delta First 旅客', ar: 'عملاء Delta One · عملاء Delta First',
      $src: { en: 'airline:DL', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoDL2: { en: 'Delta 360° members · Diamond Medallion members · Delta Premium Select customers', fr: 'Membres Delta 360° · Membres Diamond Medallion · Clients Delta Premium Select', es: 'Miembros Delta 360° · Miembros Diamond Medallion · Clientes de Delta Premium Select', de: 'Delta 360°-Mitglieder · Diamond-Medallion-Mitglieder · Fluggäste in Delta Premium Select', it: 'Membri Delta 360° · Membri Diamond Medallion · Clienti Delta Premium Select', pt: 'Membros Delta 360° · Membros Diamond Medallion · Clientes Delta Premium Select', ja: 'Delta 360° 会員 · Diamond Medallion 会員 · Delta Premium Select のお客様', zh: 'Delta 360° 会员 · Diamond Medallion 会员 · Delta Premium Select 旅客', ar: 'أعضاء Delta 360° · أعضاء Diamond Medallion · عملاء Delta Premium Select',
      $src: { en: 'airline:DL', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoDL3: { en: 'Delta Comfort customers', fr: 'Clients Delta Comfort', es: 'Clientes de Delta Comfort', de: 'Fluggäste in Delta Comfort', it: 'Clienti Delta Comfort', pt: 'Clientes Delta Comfort', ja: 'Delta Comfort のお客様', zh: 'Delta Comfort 旅客', ar: 'عملاء Delta Comfort',
      $src: { en: 'airline:DL', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Alaska and Hawaiian (alaskaair.com, Our boarding process, read
    // 2026-10-12): Priority Boarding, Groups A, B and C.
    prioWhoAS: { en: 'First Class · Atmos Titanium members', fr: 'Première classe · Membres Atmos Titanium', es: 'Primera Clase · Miembros Atmos Titanium', de: 'First Class · Atmos-Titanium-Mitglieder', it: 'Prima Classe · Membri Atmos Titanium', pt: 'Primeira Classe · Membros Atmos Titanium', ja: 'ファーストクラス · Atmos Titanium 会員', zh: '头等舱 · Atmos Titanium 会员', ar: 'الدرجة الأولى · أعضاء Atmos Titanium',
      $src: { en: 'airline:AS', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoASa: { en: 'Atmos Million Milers, Atmos Platinum and Atmos Gold members · Families with children under the age of 2 · Active members of the military', fr: 'Membres Atmos Million Milers, Atmos Platinum et Atmos Gold · Familles avec des enfants de moins de 2 ans · Militaires en service actif', es: 'Miembros Atmos Million Milers, Atmos Platinum y Atmos Gold · Familias con niños menores de 2 años · Militares en servicio activo', de: 'Mitglieder von Atmos Million Milers, Atmos Platinum und Atmos Gold · Familien mit Kindern unter 2 Jahren · Aktive Militärangehörige', it: 'Membri Atmos Million Milers, Atmos Platinum e Atmos Gold · Famiglie con bambini sotto i 2 anni · Militari in servizio attivo', pt: 'Membros Atmos Million Milers, Atmos Platinum e Atmos Gold · Famílias com crianças menores de 2 anos · Militares na ativa', ja: 'Atmos Million Milers・Atmos Platinum・Atmos Gold 会員 · 2歳未満のお子様連れのご家族 · 現役軍人', zh: 'Atmos Million Milers、Atmos Platinum 和 Atmos Gold 会员 · 携带2岁以下儿童的家庭 · 现役军人', ar: 'أعضاء Atmos Million Milers وAtmos Platinum وAtmos Gold · العائلات مع أطفال دون سنتين · العسكريون في الخدمة الفعلية',
      $src: { en: 'airline:AS', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoASb: { en: 'Atmos Silver members · Guests in Premium Class seats', fr: 'Membres Atmos Silver · Passagers assis en Premium Class', es: 'Miembros Atmos Silver · Pasajeros en asientos Premium Class', de: 'Atmos-Silver-Mitglieder · Gäste auf Premium-Class-Sitzen', it: 'Membri Atmos Silver · Ospiti nei posti Premium Class', pt: 'Membros Atmos Silver · Passageiros em assentos Premium Class', ja: 'Atmos Silver 会員 · Premium Class 座席のお客様', zh: 'Atmos Silver 会员 · Premium Class 座位的旅客', ar: 'أعضاء Atmos Silver · الضيوف في مقاعد Premium Class',
      $src: { en: 'airline:AS', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoASc: { en: 'Eligible Atmos Rewards Visa cardholders', fr: 'Titulaires admissibles de la carte Visa Atmos Rewards', es: 'Titulares elegibles de la tarjeta Visa Atmos Rewards', de: 'Berechtigte Inhaber der Atmos-Rewards-Visa-Karte', it: 'Titolari idonei della carta Visa Atmos Rewards', pt: 'Titulares elegíveis do cartão Visa Atmos Rewards', ja: '対象の Atmos Rewards Visa カード会員', zh: '符合条件的 Atmos Rewards Visa 持卡人', ar: 'حاملو بطاقة Atmos Rewards Visa المؤهلون',
      $src: { en: 'airline:AS', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // ── WHO ELSE EACH PRIORITY CALL IS FOR (boarding-sequence.js) ───────────
    // A priority call keeps its cabin line (the stage's sub); these name
    // everyone else the airline puts in that call: elite tiers, alliance
    // status, cardholders, paid priority, companions on the same
    // reservation. Tier and product names stay as the airline writes them;
    // in Japanese and Chinese a Latin name is followed by a space before
    // kana or kanji (Aeroplan Super Elite 会員), so the name reads as its own
    // words.
    // Air Canada, Rouge and Air Canada Express (AC): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoAC1: { en: 'Aeroplan Super Elite members · Travel companions on the same reservation', fr: 'Membres de statut Aéroplan Super Élite · Compagnons de voyage qui figurent sur la même réservation', es: 'Miembros Aeroplan Super Elite · Acompañantes de viaje en la misma reserva', de: 'Mitglieder von Aeroplan Super Elite · Mitreisende in derselben Buchung', it: 'Membri Aeroplan Super Elite · Compagni di viaggio nella stessa prenotazione', pt: 'Membros Aeroplan Super Elite · Acompanhantes de viagem na mesma reserva', ja: 'Aeroplan Super Elite 会員 · 同じ予約のご同行者', zh: 'Aeroplan Super Elite 会员 · 同一预订中的同行旅客', ar: 'أعضاء Aeroplan Super Elite · المرافقون في الحجز نفسه',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoAC2: { en: 'Aeroplan 75K, 50K, 35K, 25K or Star Alliance Gold members · Premium Aeroplan credit cardholders · Travel companions on the same reservation', fr: 'Membres ayant le statut Aéroplan 75K, 50K, 35K ou 25K ou Star Alliance Gold · Titulaires d’une carte de crédit Aéroplan prestige · Compagnons de voyage qui figurent sur la même réservation', es: 'Miembros Aeroplan 75K, 50K, 35K, 25K o Star Alliance Gold · Titulares de tarjetas de crédito Aeroplan premium · Acompañantes de viaje en la misma reserva', de: 'Mitglieder von Aeroplan 75K, 50K, 35K, 25K oder Star Alliance Gold · Inhaber einer Premium-Kreditkarte von Aeroplan · Mitreisende in derselben Buchung', it: 'Membri Aeroplan 75K, 50K, 35K, 25K o Star Alliance Gold · Titolari di carte di credito Aeroplan premium · Compagni di viaggio nella stessa prenotazione', pt: 'Membros Aeroplan 75K, 50K, 35K, 25K ou Star Alliance Gold · Titulares de cartões de crédito Aeroplan premium · Acompanhantes de viagem na mesma reserva', ja: 'Aeroplan 75K・50K・35K・25K 会員、Star Alliance Gold 会員 · Aeroplan プレミアムクレジットカード会員 · 同じ予約のご同行者', zh: 'Aeroplan 75K、50K、35K、25K 会员或 Star Alliance Gold 会员 · Aeroplan 高端信用卡持卡人 · 同一预订中的同行旅客', ar: 'أعضاء Aeroplan 75K و50K و35K و25K أو Star Alliance Gold · حاملو بطاقات Aeroplan الائتمانية المميزة · المرافقون في الحجز نفسه',
      $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // WestJet and WestJet Encore (WS): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoWS1: { en: 'Platinum Rewards members and their travel companions on the same reservation', fr: 'Membres Platine de Récompenses WestJet et les personnes voyageant sur la même réservation', es: 'Miembros Platinum de WestJet Rewards y sus acompañantes en la misma reserva', de: 'Platinum-Mitglieder von WestJet Rewards und ihre Mitreisenden in derselben Buchung', it: 'Membri Platinum di WestJet Rewards e i loro compagni di viaggio nella stessa prenotazione', pt: 'Membros Platinum do WestJet Rewards e seus acompanhantes na mesma reserva', ja: 'WestJet Rewards Platinum 会員と同じ予約のご同行者', zh: 'WestJet Rewards Platinum 会员及同一预订中的同行旅客', ar: 'أعضاء Platinum في WestJet Rewards ومرافقوهم في الحجز نفسه',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoWS2: { en: 'Gold and Silver Rewards members and their travel companions on the same reservation · Delta Gold Medallion members', fr: 'Membres Or et Argent de Récompenses WestJet et les personnes voyageant sur la même réservation · Membres Delta Gold Medallion', es: 'Miembros Gold y Silver de WestJet Rewards y sus acompañantes en la misma reserva · Miembros Delta Gold Medallion', de: 'Gold- und Silver-Mitglieder von WestJet Rewards und ihre Mitreisenden in derselben Buchung · Mitglieder von Delta Gold Medallion', it: 'Membri Gold e Silver di WestJet Rewards e i loro compagni di viaggio nella stessa prenotazione · Membri Delta Gold Medallion', pt: 'Membros Gold e Silver do WestJet Rewards e seus acompanhantes na mesma reserva · Membros Delta Gold Medallion', ja: 'WestJet Rewards Gold・Silver 会員と同じ予約のご同行者 · Delta Gold Medallion 会員', zh: 'WestJet Rewards Gold 和 Silver 会员及同一预订中的同行旅客 · Delta Gold Medallion 会员', ar: 'أعضاء Gold وSilver في WestJet Rewards ومرافقوهم في الحجز نفسه · أعضاء Delta Gold Medallion',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cabinBizPremWS: { en: 'Business or Premium', fr: 'Affaires ou Privilège', es: 'Business o Premium', de: 'Business oder Premium', it: 'Business o Premium', pt: 'Business ou Premium', ja: 'ビジネスまたはプレミアム', zh: '商务舱或高级舱', ar: 'درجة رجال الأعمال أو بريميوم',
      $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Flair (F8): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoF8: { en: 'Customers with Flair Express (included with a carry-on bag)', fr: 'Clients avec Flair Express (inclus avec un bagage de cabine)', es: 'Clientes con Flair Express (incluido con equipaje de mano)', de: 'Fluggäste mit Flair Express (inklusive bei Buchung mit Handgepäck)', it: 'Clienti con Flair Express (incluso con il bagaglio a mano)', pt: 'Clientes com Flair Express (incluído com bagagem de mão)', ja: 'Flair Express のお客様（機内持ち込み手荷物付きのご予約に付帯）', zh: 'Flair Express 旅客（含随身行李的预订均附带）', ar: 'عملاء Flair Express (مشمول مع حقيبة اليد)',
      $src: { en: 'airline:F8', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Air Transat (TS): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoTS: { en: 'Passengers with Option Plus', fr: 'Passagers avec Option Plus', es: 'Pasajeros con Option Plus', de: 'Fluggäste mit Option Plus', it: 'Passeggeri con Option Plus', pt: 'Passageiros com Option Plus', ja: 'Option Plus をご利用のお客様', zh: '购买 Option Plus 的旅客', ar: 'الركاب الذين لديهم Option Plus',
      $src: { en: 'airline:TS', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // United (UA): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoUA1: { en: 'Premier Platinum and Gold members · Star Alliance Gold members', fr: 'Membres Premier Platinum et Gold · Membres Star Alliance Gold', es: 'Miembros Premier Platinum y Gold · Miembros Star Alliance Gold', de: 'Mitglieder von Premier Platinum und Gold · Mitglieder von Star Alliance Gold', it: 'Membri Premier Platinum e Gold · Membri Star Alliance Gold', pt: 'Membros Premier Platinum e Gold · Membros Star Alliance Gold', ja: 'Premier Platinum・Gold 会員 · Star Alliance Gold 会員', zh: 'Premier Platinum 和 Gold 会员 · Star Alliance Gold 会员', ar: 'أعضاء Premier Platinum وGold · أعضاء Star Alliance Gold',
      $src: { en: 'airline:UA', fr: 'airline:UA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoUA2: { en: 'Premier Silver members · Star Alliance Silver members · Travelers with Premier Access or Priority Boarding · United Explorer, Club and Presidential Plus Cardmembers', fr: 'Membres Premier Silver · Membres Star Alliance Silver · Voyageurs disposant du service Premier Access ou Embarquement prioritaire · Titulaires de cartes United Explorer, Club et Presidential Plus', es: 'Miembros Premier Silver · Miembros Star Alliance Silver · Viajeros con Premier Access o embarque prioritario · Titulares de las tarjetas United Explorer, Club y Presidential Plus', de: 'Mitglieder von Premier Silver · Mitglieder von Star Alliance Silver · Reisende mit Premier Access oder Vorrang-Boarding · Inhaber der Karten United Explorer, Club und Presidential Plus', it: 'Membri Premier Silver · Membri Star Alliance Silver · Viaggiatori con Premier Access o imbarco prioritario · Titolari delle carte United Explorer, Club e Presidential Plus', pt: 'Membros Premier Silver · Membros Star Alliance Silver · Viajantes com Premier Access ou embarque prioritário · Titulares dos cartões United Explorer, Club e Presidential Plus', ja: 'Premier Silver 会員 · Star Alliance Silver 会員 · Premier Access または優先搭乗をご購入のお客様 · United Explorer、Club、Presidential Plus カード会員', zh: 'Premier Silver 会员 · Star Alliance Silver 会员 · 购买 Premier Access 或优先登机的旅客 · United Explorer、Club 和 Presidential Plus 卡持卡人', ar: 'أعضاء Premier Silver · أعضاء Star Alliance Silver · المسافرون الذين لديهم Premier Access أو الصعود ذو الأولوية · حاملو بطاقات United Explorer، Club، Presidential Plus',
      $src: { en: 'airline:UA', fr: 'airline:UA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Delta (DL): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoDL4: { en: 'Platinum and Gold Medallion members · Flying Blue Platinum and Gold · Virgin Atlantic Flying Club Gold · SkyTeam Elite Plus · LATAM Pass Black, Black Signature and Platinum Elite · WestJet Rewards Platinum and Gold Elite', fr: 'Membres Platinum Medallion et Gold Medallion · Flying Blue Platinum et Gold · Virgin Atlantic Flying Club Gold · SkyTeam Elite Plus · LATAM Pass Black, Black Signature et Platinum Elite · Récompenses WestJet Platinum et Gold Elite', es: 'Miembros Platinum Medallion y Gold Medallion · Flying Blue Platinum y Gold · Virgin Atlantic Flying Club Gold · SkyTeam Elite Plus · LATAM Pass Black, Black Signature y Platinum Elite · WestJet Rewards Platinum y Gold Elite', de: 'Mitglieder von Platinum Medallion und Gold Medallion · Flying Blue Platinum und Gold · Virgin Atlantic Flying Club Gold · SkyTeam Elite Plus · LATAM Pass Black, Black Signature und Platinum Elite · WestJet Rewards Platinum und Gold Elite', it: 'Membri Platinum Medallion e Gold Medallion · Flying Blue Platinum e Gold · Virgin Atlantic Flying Club Gold · SkyTeam Elite Plus · LATAM Pass Black, Black Signature e Platinum Elite · WestJet Rewards Platinum e Gold Elite', pt: 'Membros Platinum Medallion e Gold Medallion · Flying Blue Platinum e Gold · Virgin Atlantic Flying Club Gold · SkyTeam Elite Plus · LATAM Pass Black, Black Signature e Platinum Elite · WestJet Rewards Platinum e Gold Elite', ja: 'Platinum Medallion・Gold Medallion 会員 · Flying Blue Platinum・Gold 会員 · Virgin Atlantic Flying Club Gold 会員 · SkyTeam Elite Plus 会員 · LATAM Pass Black、Black Signature、Platinum Elite 会員 · WestJet Rewards Platinum・Gold Elite 会員', zh: 'Platinum Medallion 和 Gold Medallion 会员 · Flying Blue Platinum 和 Gold 会员 · Virgin Atlantic Flying Club Gold 会员 · SkyTeam Elite Plus 会员 · LATAM Pass Black、Black Signature 和 Platinum Elite 会员 · WestJet Rewards Platinum 和 Gold Elite 会员', ar: 'أعضاء Platinum Medallion وGold Medallion · Flying Blue Platinum وGold · Virgin Atlantic Flying Club Gold · SkyTeam Elite Plus · LATAM Pass Black، Black Signature، Platinum Elite · WestJet Rewards Platinum وGold Elite',
      $src: { en: 'airline:DL', fr: 'airline:DL', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // American (AA): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoAA1: { en: 'AAdvantage Executive Platinum members · Active-duty U.S. military with valid military ID', fr: 'Membres AAdvantage Executive Platinum · Personnel de l’armée américaine en service actif avec pièce d’identité militaire en cours de validité', es: 'Miembros AAdvantage Executive Platinum · Militares estadounidenses en servicio activo con identificación militar válida', de: 'Mitglieder von AAdvantage Executive Platinum · Aktive US-Militärangehörige mit gültigem Militärausweis', it: 'Membri AAdvantage Executive Platinum · Militari statunitensi in servizio attivo con tesserino militare valido', pt: 'Membros AAdvantage Executive Platinum · Militares dos EUA na ativa com identificação militar válida', ja: 'AAdvantage Executive Platinum 会員 · 有効な軍人身分証をお持ちの現役の米軍人', zh: 'AAdvantage Executive Platinum 会员 · 持有效军人证件的美国现役军人', ar: 'أعضاء AAdvantage Executive Platinum · العسكريون الأمريكيون في الخدمة الفعلية مع بطاقة هوية عسكرية سارية',
      $src: { en: 'airline:AA', fr: 'airline:AA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoAA2: { en: 'AAdvantage Platinum Pro members · oneworld Emerald members', fr: 'Membres AAdvantage Platinum Pro · Membres oneworld Emerald', es: 'Miembros AAdvantage Platinum Pro · Miembros oneworld Emerald', de: 'Mitglieder von AAdvantage Platinum Pro · Mitglieder von oneworld Emerald', it: 'Membri AAdvantage Platinum Pro · Membri oneworld Emerald', pt: 'Membros AAdvantage Platinum Pro · Membros oneworld Emerald', ja: 'AAdvantage Platinum Pro 会員 · oneworld Emerald 会員', zh: 'AAdvantage Platinum Pro 会员 · oneworld Emerald 会员', ar: 'أعضاء AAdvantage Platinum Pro · أعضاء oneworld Emerald',
      $src: { en: 'airline:AA', fr: 'airline:AA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoAA3: { en: 'AAdvantage Platinum members · oneworld Sapphire members', fr: 'Membres AAdvantage Platinum · Membres oneworld Sapphire', es: 'Miembros AAdvantage Platinum · Miembros oneworld Sapphire', de: 'Mitglieder von AAdvantage Platinum · Mitglieder von oneworld Sapphire', it: 'Membri AAdvantage Platinum · Membri oneworld Sapphire', pt: 'Membros AAdvantage Platinum · Membros oneworld Sapphire', ja: 'AAdvantage Platinum 会員 · oneworld Sapphire 会員', zh: 'AAdvantage Platinum 会员 · oneworld Sapphire 会员', ar: 'أعضاء AAdvantage Platinum · أعضاء oneworld Sapphire',
      $src: { en: 'airline:AA', fr: 'airline:AA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoAA4: { en: 'AAdvantage Gold members · oneworld Ruby members · AirPass · Premium Economy · Holders of the Citi / AAdvantage Executive card · Travelers who bought Priority boarding', fr: 'Membres AAdvantage Gold · Membres oneworld Ruby · AirPass · Premium Economy · Titulaires de la carte Citi / AAdvantage Executive · Voyageurs ayant souscrit l’option d’embarquement prioritaire', es: 'Miembros AAdvantage Gold · Miembros oneworld Ruby · AirPass · Premium Economy · Titulares de la tarjeta Citi / AAdvantage Executive · Viajeros que compraron el embarque prioritario', de: 'Mitglieder von AAdvantage Gold · Mitglieder von oneworld Ruby · AirPass · Premium Economy · Inhaber der Karte Citi / AAdvantage Executive · Reisende mit gekauftem Vorrang-Boarding', it: 'Membri AAdvantage Gold · Membri oneworld Ruby · AirPass · Premium Economy · Titolari della carta Citi / AAdvantage Executive · Viaggiatori che hanno acquistato l’imbarco prioritario', pt: 'Membros AAdvantage Gold · Membros oneworld Ruby · AirPass · Premium Economy · Titulares do cartão Citi / AAdvantage Executive · Viajantes que compraram o embarque prioritário', ja: 'AAdvantage Gold 会員 · oneworld Ruby 会員 · AirPass · プレミアムエコノミー · Citi / AAdvantage Executive カード会員 · 優先搭乗をご購入のお客様', zh: 'AAdvantage Gold 会员 · oneworld Ruby 会员 · AirPass · 高端经济舱 · Citi / AAdvantage Executive 卡持卡人 · 购买优先登机的旅客', ar: 'أعضاء AAdvantage Gold · أعضاء oneworld Ruby · AirPass · الدرجة السياحية الممتازة · حاملو بطاقة Citi / AAdvantage Executive · المسافرون الذين اشتروا الصعود ذا الأولوية',
      $src: { en: 'airline:AA', fr: 'airline:AA', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Southwest (WN): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoWN1: { en: 'Rapid Rewards A-List members · Customers on Choice Extra fares', fr: 'Membres Rapid Rewards A-List · Clients avec un tarif Choice Extra', es: 'Miembros Rapid Rewards A-List · Clientes con tarifa Choice Extra', de: 'Mitglieder von Rapid Rewards A-List · Fluggäste mit Tarif Choice Extra', it: 'Membri Rapid Rewards A-List · Clienti con tariffa Choice Extra', pt: 'Membros Rapid Rewards A-List · Clientes com tarifa Choice Extra', ja: 'Rapid Rewards A-List 会員 · Choice Extra 運賃のお客様', zh: 'Rapid Rewards A-List 会员 · Choice Extra 票价旅客', ar: 'أعضاء Rapid Rewards A-List · العملاء بتذكرة Choice Extra',
      $src: { en: 'airline:WN', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoWN2: { en: 'Customers in Extra Legroom seats (Choice and Choice Preferred fares)', fr: 'Clients en sièges avec plus d’espace pour les jambes (tarifs Choice et Choice Preferred)', es: 'Clientes en asientos con espacio extra para las piernas (tarifas Choice y Choice Preferred)', de: 'Fluggäste auf Sitzen mit extra Beinfreiheit (Tarife Choice und Choice Preferred)', it: 'Clienti nei posti con spazio extra per le gambe (tariffe Choice e Choice Preferred)', pt: 'Clientes em assentos com espaço extra para as pernas (tarifas Choice e Choice Preferred)', ja: '足元の広い座席のお客様（Choice・Choice Preferred 運賃）', zh: '腿部空间加大座位的旅客（Choice 和 Choice Preferred 票价）', ar: 'العملاء في مقاعد ذات مساحة إضافية للساقين (تذاكر Choice وChoice Preferred)',
      $src: { en: 'airline:WN', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // JetBlue (B6): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoB6g1: { en: 'Mosaic 3 and 4 members · Customers seated in Mint', fr: 'Membres Mosaic 3 et 4 · Clients Mint', es: 'Miembros Mosaic 3 y 4 · Clientes en Mint', de: 'Mitglieder von Mosaic 3 und 4 · Fluggäste in Mint', it: 'Membri Mosaic 3 e 4 · Clienti Mint', pt: 'Membros Mosaic 3 e 4 · Clientes Mint', ja: 'Mosaic 3・4 会員 · Mint のお客様', zh: 'Mosaic 3 和 4 会员 · Mint 旅客', ar: 'أعضاء Mosaic 3 و4 · عملاء Mint',
      $src: { en: 'airline:B6', fr: 'airline:B6', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoB6g2: { en: 'Mosaic 1 and 2 members · EvenMore customers', fr: 'Membres Mosaic 1 et 2 · Clients EvenMore', es: 'Miembros Mosaic 1 y 2 · Clientes de EvenMore', de: 'Mitglieder von Mosaic 1 und 2 · Fluggäste mit EvenMore', it: 'Membri Mosaic 1 e 2 · Clienti EvenMore', pt: 'Membros Mosaic 1 e 2 · Clientes EvenMore', ja: 'Mosaic 1・2 会員 · EvenMore のお客様', zh: 'Mosaic 1 和 2 会员 · EvenMore 旅客', ar: 'أعضاء Mosaic 1 و2 · عملاء EvenMore',
      $src: { en: 'airline:B6', fr: 'airline:B6', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    prioWhoB6g3: { en: 'JetBlue Premier Card and JetBlue Business Card cardmembers · Customers with Early Boarding from Perks You Pick (excluding Main Base fares)', fr: 'Titulaires de la carte JetBlue Premier ou JetBlue Business · Clients avec l’embarquement anticipé de Perks You Pick (à l’exclusion des tarifs Main Base)', es: 'Titulares de las tarjetas JetBlue Premier y JetBlue Business · Clientes con embarque anticipado de Perks You Pick (excepto tarifas Main Base)', de: 'Inhaber der Karten JetBlue Premier und JetBlue Business · Fluggäste mit frühem Boarding über Perks You Pick (außer Tarife Main Base)', it: 'Titolari delle carte JetBlue Premier e JetBlue Business · Clienti con imbarco anticipato di Perks You Pick (escluse le tariffe Main Base)', pt: 'Titulares dos cartões JetBlue Premier e JetBlue Business · Clientes com embarque antecipado do Perks You Pick (exceto tarifas Main Base)', ja: 'JetBlue Premier カード・JetBlue Business カード会員 · Perks You Pick の早期搭乗をご利用のお客様（Main Base 運賃を除く）', zh: 'JetBlue Premier 卡和 JetBlue Business 卡持卡人 · 通过 Perks You Pick 购买提前登机的旅客（Main Base 票价除外）', ar: 'حاملو بطاقتي JetBlue Premier وJetBlue Business · العملاء الذين لديهم الصعود المبكر من Perks You Pick (باستثناء تذاكر Main Base)',
      $src: { en: 'airline:B6', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Frontier (F9): who each priority call is for, as the airline lists it (read 2026-10-13).
    prioWhoF9g1: { en: 'Frontier Miles Elite Platinum and Gold members · Customers who bought the Business or Premium bundle, or Board First', fr: 'Membres Frontier Miles Elite Platinum et Gold · Clients ayant acheté le forfait Business ou Premium, ou Board First', es: 'Miembros Frontier Miles Elite Platinum y Gold · Clientes que compraron el paquete Business o Premium, o Board First', de: 'Mitglieder von Frontier Miles Elite Platinum und Gold · Fluggäste mit gekauftem Business- oder Premium-Paket oder Board First', it: 'Membri Frontier Miles Elite Platinum e Gold · Clienti che hanno acquistato il pacchetto Business o Premium, o Board First', pt: 'Membros Frontier Miles Elite Platinum e Gold · Clientes que compraram o pacote Business ou Premium, ou Board First', ja: 'Frontier Miles Elite Platinum・Gold 会員 · Business・Premium バンドル、または Board First をご購入のお客様', zh: 'Frontier Miles Elite Platinum 和 Gold 会员 · 购买 Business 或 Premium 套餐或 Board First 的旅客', ar: 'أعضاء Frontier Miles Elite Platinum وGold · العملاء الذين اشتروا باقة Business أو Premium أو Board First',
      $src: { en: 'airline:F9', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Calm Air (calmair.com, check-in, en and fr): "Pre-boarding is offered
    // to passengers traveling with small children, unaccompanied minors,
    // persons with disabilities, or for those requiring additional time or
    // assistance while boarding." Its French calls the step « L'embarquement
    // prioritaire »; the sign's title stays the store's pre-boarding word.
    preboardWhoMO: { en: 'Passengers traveling with small children · Unaccompanied minors · Persons with disabilities · Passengers requiring additional time or assistance while boarding', fr: 'Passagers qui voyagent avec de jeunes enfants · Mineurs non accompagnés · Personnes handicapées · Personnes nécessitant plus de temps ou de l’aide pour embarquer', es: 'Pasajeros que viajan con niños pequeños · Menores no acompañados · Personas con discapacidad · Pasajeros que necesitan más tiempo o asistencia para embarcar', de: 'Fluggäste mit kleinen Kindern · Alleinreisende Minderjährige · Menschen mit Behinderung · Fluggäste, die beim Einsteigen mehr Zeit oder Hilfe benötigen', it: 'Passeggeri in viaggio con bambini piccoli · Minori non accompagnati · Persone con disabilità · Passeggeri che necessitano di più tempo o assistenza all’imbarco', pt: 'Passageiros viajando com crianças pequenas · Menores desacompanhados · Pessoas com deficiência · Passageiros que precisam de mais tempo ou assistência para embarcar', ja: '小さなお子様連れのお客様 · 同伴者のいない未成年のお客様 · 障がいのあるお客様 · 搭乗に時間や介助が必要なお客様', zh: '携带幼儿的旅客 · 无成人陪伴的未成年人 · 残障人士 · 登机时需要更多时间或协助的旅客', ar: 'الركاب المسافرون مع أطفال صغار · القاصرون غير المصحوبين · الأشخاص ذوو الإعاقة · الركاب الذين يحتاجون إلى وقت أطول أو مساعدة عند الصعود',
      $src: { en: 'airline:MO', fr: 'airline:MO', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // Iberia (iberia.com, Boarding, read from the search index: the site
    // refuses automated readers): after Group 0, customers who need special
    // assistance and families with children under 2. House wording.
    preboardWhoIB: { en: 'Customers needing special assistance · Families with children under 2', fr: 'Clients ayant besoin d’une assistance spéciale · Familles avec des enfants de moins de 2 ans', es: 'Clientes que necesitan asistencia especial · Familias con niños menores de 2 años', de: 'Fluggäste, die besondere Unterstützung benötigen · Familien mit Kindern unter 2 Jahren', it: 'Clienti che necessitano di assistenza speciale · Famiglie con bambini sotto i 2 anni', pt: 'Clientes que precisam de assistência especial · Famílias com crianças menores de 2 anos', ja: '特別な介助が必要なお客様 · 2歳未満のお子様連れのご家族', zh: '需要特殊协助的旅客 · 携带2岁以下儿童的家庭', ar: 'العملاء الذين يحتاجون إلى مساعدة خاصة · العائلات مع أطفال دون سنتين',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },

    // ── HERITAGE CARD ("FROM THE ARCHIVE") ────────────────────────────────
    // The kicker and the captions of the archive card on the gate. Captions
    // are careful translations of historical facts; place names follow each
    // language's own form (Neuschottland, Terranova).
    heritageKicker: { en: 'From the archive', fr: 'Depuis les archives', es: 'Del archivo', de: 'Aus dem Archiv', it: 'Dall’archivio', pt: 'Do arquivo', ja: 'アーカイブより', zh: '档案回顾', ar: 'من الأرشيف' },
    'heritage:air-atlantic': { en: 'St. John’s, Newfoundland · a Canadian Partner · until 1998', fr: 'St. John’s (Terre-Neuve) · partenaire de Canadien · jusqu’en 1998', es: 'St. John’s (Terranova) · socio de Canadian · hasta 1998', de: 'St. John’s (Neufundland) · Partner von Canadian · bis 1998', it: 'St. John’s (Terranova) · partner di Canadian · fino al 1998', pt: 'St. John’s (Terra Nova) · parceira da Canadian · até 1998', ja: 'セントジョンズ（ニューファンドランド）· カナディアン航空の提携会社 · 1998年まで', zh: '圣约翰斯（纽芬兰）· 加拿大国际航空合作伙伴 · 至1998年', ar: 'سانت جونز (نيوفاوندلاند) · شريك لشركة كنديان · حتى 1998' },
    'heritage:air-nova': { en: 'Halifax, Nova Scotia · the first Air Canada Connector · 1986–2001', fr: 'Halifax (Nouvelle-Écosse) · premier Connecteur Air Canada · 1986–2001', es: 'Halifax (Nueva Escocia) · el primer Air Canada Connector · 1986–2001', de: 'Halifax (Neuschottland) · der erste Air Canada Connector · 1986–2001', it: 'Halifax (Nuova Scozia) · il primo Air Canada Connector · 1986–2001', pt: 'Halifax (Nova Escócia) · o primeiro Air Canada Connector · 1986–2001', ja: 'ハリファックス（ノバスコシア）· 最初のエア・カナダ・コネクター · 1986–2001', zh: '哈利法克斯（新斯科舍）· 首家加航联运航空公司 · 1986–2001', ar: 'هاليفاكس (نوفا سكوشا) · أول شركة «إير كندا كونكتور» · 1986–2001' },
    'heritage:canadian-airlines': { en: 'Calgary · 1987–2001', fr: 'Calgary · 1987–2001', es: 'Calgary · 1987–2001', de: 'Calgary · 1987–2001', it: 'Calgary · 1987–2001', pt: 'Calgary · 1987–2001', ja: 'カルガリー · 1987–2001', zh: '卡尔加里 · 1987–2001', ar: 'كالغاري · 1987–2001' },
    'heritage:air-canada': { en: 'McDonnell Douglas DC-9-32 · 1968–2002 · 1987 livery', fr: 'McDonnell Douglas DC-9-32 · 1968–2002 · livrée de 1987', es: 'McDonnell Douglas DC-9-32 · 1968–2002 · librea de 1987', de: 'McDonnell Douglas DC-9-32 · 1968–2002 · Lackierung von 1987', it: 'McDonnell Douglas DC-9-32 · 1968–2002 · livrea del 1987', pt: 'McDonnell Douglas DC-9-32 · 1968–2002 · pintura de 1987', ja: 'マクドネル・ダグラスDC-9-32 · 1968–2002 · 1987年塗装', zh: '麦克唐纳-道格拉斯DC-9-32 · 1968–2002 · 1987年涂装', ar: 'ماكدونيل دوغلاس DC-9-32 · 1968–2002 · طلاء 1987' },
    'heritage:air-canada-caps': { en: 'McDonnell Douglas DC-9-32 · 1968–2002 · 1980 livery', fr: 'McDonnell Douglas DC-9-32 · 1968–2002 · livrée de 1980', es: 'McDonnell Douglas DC-9-32 · 1968–2002 · librea de 1980', de: 'McDonnell Douglas DC-9-32 · 1968–2002 · Lackierung von 1980', it: 'McDonnell Douglas DC-9-32 · 1968–2002 · livrea del 1980', pt: 'McDonnell Douglas DC-9-32 · 1968–2002 · pintura de 1980', ja: 'マクドネル・ダグラスDC-9-32 · 1968–2002 · 1980年塗装', zh: '麦克唐纳-道格拉斯DC-9-32 · 1968–2002 · 1980年涂装', ar: 'ماكدونيل دوغلاس DC-9-32 · 1968–2002 · طلاء 1980' },
    'heritage:air-canada-767': { en: 'Boeing 767-233 · 1982–2008 · 1980 livery', fr: 'Boeing 767-233 · 1982–2008 · livrée de 1980', es: 'Boeing 767-233 · 1982–2008 · librea de 1980', de: 'Boeing 767-233 · 1982–2008 · Lackierung von 1980', it: 'Boeing 767-233 · 1982–2008 · livrea del 1980', pt: 'Boeing 767-233 · 1982–2008 · pintura de 1980', ja: 'ボーイング767-233 · 1982–2008 · 1980年塗装', zh: '波音767-233 · 1982–2008 · 1980年涂装', ar: 'بوينغ 767-233 · 1982–2008 · طلاء 1980' },
    'heritageCredit:air-canada-767': { en: '3D model: “1883” on Sketchfab · CC BY 4.0 · modified', fr: 'Modèle 3D : « 1883 » sur Sketchfab · CC BY 4.0 · modifié', es: 'Modelo 3D: «1883» en Sketchfab · CC BY 4.0 · modificado', de: '3D-Modell: „1883“ auf Sketchfab · CC BY 4.0 · bearbeitet', it: 'Modello 3D: «1883» su Sketchfab · CC BY 4.0 · modificato', pt: 'Modelo 3D: «1883» no Sketchfab · CC BY 4.0 · modificado', ja: '3Dモデル：「1883」（Sketchfab）· CC BY 4.0 · 改変あり', zh: '3D 模型：“1883”（Sketchfab）· CC BY 4.0 · 已修改', ar: 'نموذج ثلاثي الأبعاد: «1883» على Sketchfab · CC BY 4.0 · معدَّل' },

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
    // MET Norway holds a no-break space: the name never breaks across lines.
    wxCredit: { en: 'Weather data generously provided by MET Norway', fr: 'Données météo gracieusement fournies par MET Norway', es: 'Datos meteorológicos cortesía de MET Norway', de: 'Wetterdaten freundlicherweise bereitgestellt von MET Norway', it: 'Dati meteo gentilmente forniti da MET Norway', pt: 'Dados meteorológicos gentilmente fornecidos pelo MET Norway', ja: '気象データ提供：MET Norway', zh: '天气数据由 MET Norway 慷慨提供', ar: 'بيانات الطقس مقدَّمة بسخاء من MET Norway' },
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
    // v24005 — the baggage hall's carousel cell for a flight whose feed gives
    // it no belt (fids-core.js BIDS_UNASSIGNED): said in place of a number,
    // never a number of our choosing. The French is the house wording.
    beltTba: { en: 'To be announced', fr: 'À venir', es: 'Por anunciar', de: 'Wird bekannt gegeben', it: 'Da comunicare', pt: 'A definir', ja: '後ほどご案内', zh: '待公布', ar: 'سيُعلن لاحقًا',
      $src: { en: 'house', fr: 'house', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v24013 — THE BAGGAGE HALL BOARD (bids5, fids-core.js _b5*): its hall
    // map's words (the Moncton plan's two belts by the hall's own labels, the
    // marker where the screen hangs, the customs hall and the way out), the
    // label a drawing that is not a floor plan carries, a belt with no flight
    // on it now, the empty hall, and the flights after the hour on screen.
    // English is the house wording; the rest are careful translations.
    youAreHere: { en: 'You are here', fr: 'Vous êtes ici', es: 'Usted está aquí', de: 'Sie sind hier', it: 'Voi siete qui', pt: 'Você está aqui', ja: '現在地', zh: '您在这里', ar: 'أنت هنا',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    hallCustoms: { en: 'Customs', fr: 'Douanes', es: 'Aduana', de: 'Zoll', it: 'Dogana', pt: 'Alfândega', ja: '税関', zh: '海关', ar: 'الجمارك',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    hallExit: { en: 'Exit', fr: 'Sortie', es: 'Salida', de: 'Ausgang', it: 'Uscita', pt: 'Saída', ja: 'お出口', zh: '出口', ar: 'المخرج',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    domesticFlights: { en: 'Domestic flights', fr: 'Vols intérieurs', es: 'Vuelos nacionales', de: 'Inlandsflüge', it: 'Voli nazionali', pt: 'Voos domésticos', ja: '国内線', zh: '国内航班', ar: 'الرحلات الداخلية',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    internationalFlights: { en: 'International flights', fr: 'Vols internationaux', es: 'Vuelos internacionales', de: 'Auslandsflüge', it: 'Voli internazionali', pt: 'Voos internacionais', ja: '国際線', zh: '国际航班', ar: 'الرحلات الدولية',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    intlAndDomFlights: { en: 'International and domestic flights', fr: 'Vols internationaux et intérieurs', es: 'Vuelos internacionales y nacionales', de: 'Auslands- und Inlandsflüge', it: 'Voli internazionali e nazionali', pt: 'Voos internacionais e domésticos', ja: '国際線・国内線', zh: '国际及国内航班', ar: 'الرحلات الدولية والداخلية',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    schematicNote: { en: 'Schematic, not a floor plan', fr: 'Schéma, pas un plan des lieux', es: 'Esquema, no es un plano', de: 'Schema, kein Lageplan', it: 'Schema, non una planimetria', pt: 'Esquema, não é uma planta', ja: '模式図（実際の配置図ではありません）', zh: '示意图，非实际平面图', ar: 'مخطط توضيحي، وليس خريطة للمكان',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    beltIdle: { en: 'No flight now', fr: 'Aucun vol pour l’instant', es: 'Ningún vuelo por ahora', de: 'Derzeit kein Flug', it: 'Nessun volo al momento', pt: 'Nenhum voo no momento', ja: '現在、到着便はありません', zh: '目前没有航班', ar: 'لا توجد رحلات حاليًا',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    noArrivalsHour: { en: 'No arrivals in the next hour', fr: 'Aucune arrivée dans la prochaine heure', es: 'No hay llegadas en la próxima hora', de: 'Keine Ankünfte in der nächsten Stunde', it: 'Nessun arrivo nella prossima ora', pt: 'Nenhuma chegada na próxima hora', ja: '今後1時間の到着便はありません', zh: '未来一小时内没有到达航班', ar: 'لا توجد رحلات واصلة خلال الساعة القادمة',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    nextArrival: { en: 'Next arrival', fr: 'Prochaine arrivée', es: 'Próxima llegada', de: 'Nächste Ankunft', it: 'Prossimo arrivo', pt: 'Próxima chegada', ja: '次の到着便', zh: '下一个到达航班', ar: 'الرحلة الواصلة التالية',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    laterLbl: { en: 'Later', fr: 'Plus tard', es: 'Más tarde', de: 'Später', it: 'Più tardi', pt: 'Mais tarde', ja: 'この後', zh: '稍后', ar: 'لاحقًا',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
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
    // v24006 — WestJet's own word: "Boarding cut-off: 15 minutes before
    // departure" / « Heure limite pour l'embarquement : 15 minutes avant le
    // départ » (westjet.com/en-ca/manage/check-in and fr-ca, read 2026-10-05).
    boardingCutoff: { en:'Boarding cut-off {MIN} min before departure · {TIME}', fr:'Heure limite pour l’embarquement {MIN} min avant le départ · {TIME}', es:'Hora límite de embarque {MIN} min antes de la salida · {TIME}', de:'Boarding-Schluss {MIN} Min. vor Abflug · {TIME}', it:'Termine dell’imbarco {MIN} min prima della partenza · {TIME}', pt:'Limite para embarque {MIN} min antes da partida · {TIME}', ja:'搭乗締切は出発{MIN}分前 · {TIME}', zh:'登机截止于起飞前{MIN}分钟 · {TIME}', ar:'آخر موعد للصعود قبل {MIN} دقيقة من المغادرة · {TIME}',
        $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
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
    tickerBoardingCutoff: { en:'{AIRLINE}: BOARDING CUT-OFF {MIN} MINUTES BEFORE DEPARTURE', fr:'{AIRLINE} : HEURE LIMITE POUR L’EMBARQUEMENT {MIN} MINUTES AVANT LE DÉPART', es:'{AIRLINE}: HORA LÍMITE DE EMBARQUE {MIN} MINUTOS ANTES DE LA SALIDA', de:'{AIRLINE}: BOARDING-SCHLUSS {MIN} MINUTEN VOR ABFLUG', it:'{AIRLINE}: TERMINE DELL’IMBARCO {MIN} MINUTI PRIMA DELLA PARTENZA', pt:'{AIRLINE}: LIMITE PARA EMBARQUE {MIN} MINUTOS ANTES DA PARTIDA', ja:'{AIRLINE}：搭乗締切は出発{MIN}分前です', zh:'{AIRLINE}：登机截止于起飞前{MIN}分钟', ar:'{AIRLINE}: آخر موعد للصعود قبل {MIN} دقيقة من المغادرة',
        $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v24006 — THE SAME DEADLINE ON THE BOARDING SCREEN (_gateBandHtml): the
    // airline's own word and the clock time, for the whole of boarding, on
    // the band under NOW BOARDING. {TIME} is the clock in that language's own
    // convention (_fidsClockForLang). Only the airlines that publish a time
    // the gate or boarding CLOSES: a be-at-the-gate deadline (PAL, Delta,
    // United) is not a close time and is never printed here.
    closeAtGate: { en:'Gate closes {TIME}', fr:'Fermeture de la porte {TIME}', es:'Cierre de la puerta {TIME}', de:'Gate-Schließung {TIME}', it:'Chiusura del gate {TIME}', pt:'Fechamento do portão {TIME}', ja:'搭乗口締切 {TIME}', zh:'登机口关闭 {TIME}', ar:'إغلاق البوابة {TIME}',
        $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    closeAtCutoff: { en:'Boarding cut-off {TIME}', fr:'Heure limite pour l’embarquement {TIME}', es:'Hora límite de embarque {TIME}', de:'Boarding-Schluss {TIME}', it:'Termine dell’imbarco {TIME}', pt:'Limite para embarque {TIME}', ja:'搭乗締切 {TIME}', zh:'登机截止 {TIME}', ar:'آخر موعد للصعود {TIME}',
        $src: { en: 'airline:WS', fr: 'airline:WS', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    closeAtBoarding: { en:'Boarding closes {TIME}', fr:'Fin de l’embarquement {TIME}', es:'Cierre del embarque {TIME}', de:'Boarding-Ende {TIME}', it:'Chiusura dell’imbarco {TIME}', pt:'Encerramento do embarque {TIME}', ja:'搭乗締切 {TIME}', zh:'登机截止 {TIME}', ar:'انتهاء الصعود {TIME}',
        $src: { en: 'airline:F8', fr: 'airline:F8', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    closeAtEnds: { en:'Boarding ends {TIME}', fr:'Fin de l’embarquement {TIME}', es:'Fin del embarque {TIME}', de:'Boarding-Ende {TIME}', it:'Fine dell’imbarco {TIME}', pt:'Fim do embarque {TIME}', ja:'搭乗終了 {TIME}', zh:'登机结束 {TIME}', ar:'انتهاء الصعود {TIME}',
        $src: { en: 'airline:AA', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v24012 — THE GATE'S CENTRE CARDS (_gateCardHtml in fids-core.js).
    //   cardBeforeBoard  the documents card's title, over the boarding band's
    //                    own lines (docsDomestic…): the documents research's
    //                    title (U2: house English, careful translations).
    //   closeMinBefore   the gate-closes card's rule under its big time: the
    //                    airline's published minutes, in the very phrase its
    //                    close line has always said them in (gateCloses
    //                    above: "Gate closes {MIN} min before departure").
    // v24026 — the gate's pretend upgrade and standby lists (fids-core.js
    // _gateSbLists): the two lists' headings, a row's two status words and
    // the card's foot line
    sbUpgradeList: { en: 'Upgrade list', fr: 'Liste des surclassements', es: 'Lista de mejoras de clase', de: 'Höherstufungsliste', it: 'Lista dei passaggi di classe', pt: 'Lista de mudanças de classe', ja: 'アップグレード待ちリスト', zh: '升舱名单', ar: 'قائمة الترقية',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    sbStandbyList: { en: 'Standby list', fr: 'Liste d’attente', es: 'Lista de espera', de: 'Warteliste', it: 'Lista d’attesa', pt: 'Lista de passageiros em espera', ja: 'キャンセル待ちリスト', zh: '候补名单', ar: 'قائمة الانتظار',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    sbSeatList: { en: 'Seat changes', fr: 'Changements de siège', es: 'Cambios de asiento', de: 'Sitzplatzänderungen', it: 'Cambi di posto', pt: 'Mudanças de assento', ja: '座席変更', zh: '座位变更', ar: 'تغييرات المقاعد',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    sbNewSeat: { en: 'New seat', fr: 'Nouveau siège', es: 'Nuevo asiento', de: 'Neuer Sitzplatz', it: 'Nuovo posto', pt: 'Novo assento', ja: '新しい座席', zh: '新座位', ar: 'مقعد جديد',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    sbCleared: { en: 'Cleared', fr: 'Confirmé', es: 'Confirmado', de: 'Bestätigt', it: 'Confermato', pt: 'Assento confirmado', ja: '確定', zh: '已确认', ar: 'مؤكَّد',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    sbSeeAgent: { en: 'See agent', fr: 'Voir l’agent', es: 'Acuda al agente', de: 'Bitte zum Schalter', it: 'Rivolgersi all’agente', pt: 'Dirija-se ao agente', ja: '係員までお越しください', zh: '请至柜台', ar: 'يرجى مراجعة الموظف',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    sbRefresh: { en: 'Refresh your boarding pass or see the agent', fr: 'Actualisez votre carte d’embarquement ou voyez l’agent', es: 'Actualice su tarjeta de embarque o acuda al agente', de: 'Bordkarte aktualisieren oder zum Schalter kommen', it: 'Aggiorna la carta d’imbarco o rivolgiti all’agente', pt: 'Atualize o seu cartão de embarque ou dirija-se ao agente', ja: '搭乗券を更新するか、係員までお越しください', zh: '请刷新登机牌或前往柜台', ar: 'حدّث بطاقة صعودك أو راجع الموظف',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v24037 — the credit an Openverse CC BY photo carries on the empty-gate
    // screen (fids-core.js _gateBgCredit). {WHO} is the photographer as
    // Openverse gives it, {VER} the licence version (4.0) — both as
    // published; CC BY is the licence's own mark, written so everywhere.
    photoCredit: { en: 'Photo: {WHO} · CC BY {VER}', fr: 'Crédit : {WHO} · CC BY {VER}', es: 'Foto: {WHO} · CC BY {VER}', de: 'Bild: {WHO} · CC BY {VER}', it: 'Foto di {WHO} · CC BY {VER}', pt: 'Fotografia: {WHO} · CC BY {VER}', ja: '写真：{WHO} · CC BY {VER}', zh: '照片：{WHO} · CC BY {VER}', ar: 'صورة: {WHO} · CC BY {VER}',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v24031 — the credit line Moncton's aerial photo map carries (fids-core.js
    // _gatePhotoCredit). English and French are the licence's own wording, the
    // line it asks for when the provider names none (the province's name
    // holds a no-break space, or a no-break hyphen in French, so it never
    // breaks across lines; the words are the licence's own):
    // https://www.gnb.ca/en/campaign/geonb/open-government-license.html
    // https://www.gnb.ca/fr/campagne/geonb/licence-gouvernement-ouvert.html
    mapCreditOglNb: { en: 'Contains information licensed under the Open Government Licence – New Brunswick', fr: 'Contient de l’information visée par la Licence du gouvernement ouvert — Nouveau‑Brunswick', es: 'Contiene información autorizada por la Licencia de Gobierno Abierto – Nuevo Brunswick', de: 'Enthält Informationen unter der Open-Government-Lizenz – New Brunswick', it: 'Contiene informazioni concesse con la Licenza di governo aperto – Nuovo Brunswick', pt: 'Contém informações licenciadas pela Licença de Governo Aberto – Novo Brunswick', ja: 'ニューブランズウィック州オープンガバメントライセンスに基づく情報を含みます', zh: '包含依据新不伦瑞克省开放政府许可证授权的信息', ar: 'يتضمن معلومات مرخّصة بموجب ترخيص الحكومة المفتوحة – نيو برونزويك',
      $src: { en: 'gov:NB', fr: 'gov:NB', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v24030 — the Companion app's own words (app.html T()), in all nine
    // languages: the phrases the boards already hold keep their words
    appDep: { en: 'Departures', fr: 'Départs', es: 'Salidas', de: 'Abflüge', it: 'Partenze', pt: 'Partidas', ja: '出発', zh: '出发', ar: 'المغادرات' },
    appArr: { en: 'Arrivals', fr: 'Arrivées', es: 'Llegadas', de: 'Ankünfte', it: 'Arrivi', pt: 'Chegadas', ja: '到着', zh: '到达', ar: 'الوصول' },
    appFindFlight: { en: 'Find your flight — number or city', fr: 'Trouvez votre vol — numéro ou ville', es: 'Busca tu vuelo — número o ciudad', de: 'Flug suchen — Nummer oder Stadt', it: 'Trova il tuo volo — numero o città', pt: 'Encontre seu voo — número ou cidade', ja: '便名または都市名で検索', zh: '按航班号或城市查找航班', ar: 'ابحث عن رحلتك — الرقم أو المدينة' },
    appFindArr: { en: 'Find your arrival — flight or city', fr: 'Trouvez votre arrivée — vol ou ville', es: 'Busca tu llegada — vuelo o ciudad', de: 'Ankunft suchen — Flug oder Stadt', it: 'Trova il tuo arrivo — volo o città', pt: 'Encontre sua chegada — voo ou cidade', ja: '到着便を検索 — 便名または都市名', zh: '查找到达航班 — 航班号或城市', ar: 'ابحث عن وصولك — الرحلة أو المدينة' },
    appLiveDep: { en: 'Live departures', fr: 'Départs en direct', es: 'Salidas en vivo', de: 'Abflüge in Echtzeit', it: 'Partenze in tempo reale', pt: 'Partidas em tempo real', ja: 'リアルタイム出発情報', zh: '实时出发', ar: 'المغادرات المباشرة' },
    appLiveArr: { en: 'Live arrivals', fr: 'Arrivées en direct', es: 'Llegadas en vivo', de: 'Ankünfte in Echtzeit', it: 'Arrivi in tempo reale', pt: 'Chegadas em tempo real', ja: 'リアルタイム到着情報', zh: '实时到达', ar: 'الوصول المباشر' },
    appFlightsN: { $ctx: 'a count after a number: "1216 flights"', en: 'flights', fr: 'vols', es: 'vuelos', de: 'Flüge', it: 'voli', pt: 'voos', ja: '便', zh: '个航班', ar: 'رحلة' },
    appNoDep: { en: 'No departures right now', fr: 'Aucun départ pour le moment', es: 'No hay salidas por ahora', de: 'Derzeit keine Abflüge', it: 'Nessuna partenza al momento', pt: 'Nenhuma partida no momento', ja: '現在、出発便はありません', zh: '目前没有出发航班', ar: 'لا توجد رحلات مغادرة حاليًا' },
    appNoArr: { en: 'No arrivals right now', fr: 'Aucune arrivée pour le moment', es: 'No hay llegadas por ahora', de: 'Derzeit keine Ankünfte', it: 'Nessun arrivo al momento', pt: 'Nenhuma chegada no momento', ja: '現在、到着便はありません', zh: '目前没有到达航班', ar: 'لا توجد رحلات وصول حاليًا' },
    appNoMatch: { en: 'No flights match', fr: 'Aucun vol ne correspond à', es: 'Ningún vuelo coincide con', de: 'Keine Flüge für', it: 'Nessun volo per', pt: 'Nenhum voo para', ja: '該当する便はありません:', zh: '没有匹配的航班：', ar: 'لا توجد رحلات تطابق' },
    appNoArrMatch: { en: 'No arrivals match', fr: 'Aucune arrivée ne correspond à', es: 'Ninguna llegada coincide con', de: 'Keine Ankünfte für', it: 'Nessun arrivo per', pt: 'Nenhuma chegada para', ja: '該当する到着便はありません:', zh: '没有匹配的到达航班：', ar: 'لا توجد رحلات وصول تطابق' },
    appReconn: { en: 'reconnecting…', fr: 'reconnexion…', es: 'reconectando…', de: 'Verbindung wird wiederhergestellt…', it: 'riconnessione…', pt: 'restabelecendo a conexão…', ja: '再接続中…', zh: '正在重新连接…', ar: 'جارٍ إعادة الاتصال…' },
    appReconnB: { en: 'Reconnecting…', fr: 'Reconnexion…', es: 'Reconectando…', de: 'Verbindung wird wiederhergestellt…', it: 'Riconnessione…', pt: 'Restabelecendo a conexão…', ja: '再接続中…', zh: '正在重新连接…', ar: 'جارٍ إعادة الاتصال…' },
    appBagHint: { en: 'Arriving flights & baggage belts', fr: 'Vols à l’arrivée et carrousels', es: 'Vuelos que llegan y bandas de equipaje', de: 'Ankommende Flüge und Gepäckbänder', it: 'Voli in arrivo e nastri bagagli', pt: 'Voos chegando e esteiras de bagagem', ja: '到着便と手荷物受取所', zh: '到达航班与行李转盘', ar: 'الرحلات القادمة وسيور الأمتعة' },
    appBagOffline: { en: 'Baggage info offline', fr: 'Info bagages hors ligne', es: 'Info de equipaje sin conexión', de: 'Gepäckinformationen nicht verfügbar', it: 'Informazioni bagagli non disponibili', pt: 'Informações de bagagem indisponíveis', ja: '手荷物情報を取得できません', zh: '行李信息暂不可用', ar: 'معلومات الأمتعة غير متاحة' },
    appDeparts: { en: 'Departs', fr: 'Départ', es: 'Sale', de: 'Abflug', it: 'Partenza', pt: 'Parte', ja: '出発', zh: '出发', ar: 'يغادر' },
    appArrives: { en: 'Arrives', fr: 'Arrivée', es: 'Llega', de: 'Ankunft', it: 'Arrivo', pt: 'Chega', ja: '到着', zh: '到达', ar: 'وصول' },
    appArrShort: { en: 'Arr', fr: 'Arr', es: 'Lleg', de: 'Ank.', it: 'Arrivo', pt: 'Cheg.', ja: '着', zh: '到', ar: 'وصول' },
    appDepShort: { en: 'Dep', fr: 'Dép', es: 'Sal', de: 'Abfl.', it: 'Part.', pt: 'Partida', ja: '発', zh: '出发', ar: 'مغادرة' },
    appBelt: { en: 'Belt', fr: 'Carrousel', es: 'Banda', de: 'Band', it: 'Nastro', pt: 'Esteira', ja: 'ターンテーブル', zh: '转盘', ar: 'السير' },
    appTbd: { en: 'TBD', fr: 'À conf.', es: 'Por conf.', de: 'Folgt', it: 'Da definire', pt: 'A definir', ja: '未定', zh: '待定', ar: 'لاحقًا' },
    appVia: { en: 'Via', fr: 'Via', es: 'Vía', de: 'Über', it: 'Passando per', pt: 'Com escala em', ja: '経由', zh: '经停', ar: 'عبر' },
    appFlightTime: { en: 'Flight time', fr: 'Durée du vol', es: 'Duración', de: 'Flugdauer', it: 'Durata del volo', pt: 'Duração do voo', ja: '飛行時間', zh: '飞行时间', ar: 'مدة الرحلة' },
    appBagBelt: { en: 'Baggage belt', fr: 'Carrousel à bagages', es: 'Banda de equipaje', de: 'Gepäckband', it: 'Nastro bagagli', pt: 'Esteira de bagagem', ja: '手荷物受取所', zh: '行李转盘', ar: 'سير الأمتعة' },
    appDepOrigin: { en: 'Departs origin', fr: 'Départ de l’origine', es: 'Sale del origen', de: 'Abflug am Ausgangsort', it: 'Partenza dall’origine', pt: 'Partida da origem', ja: '出発地を出発', zh: '始发地出发', ar: 'المغادرة من نقطة الانطلاق' },
    appAircraft: { en: 'Aircraft', fr: 'Appareil', es: 'Aeronave', de: 'Flugzeug', it: 'Aeromobile', pt: 'Aeronave', ja: '機材', zh: '机型', ar: 'الطائرة' },
    appReg: { en: 'Reg', fr: 'Imm.', es: 'Mat.', de: 'Kennz.', it: 'Immatr.', pt: 'Matr.', ja: '登録記号', zh: '注册号', ar: 'التسجيل' },
    appOperatedBy: { en: 'Operated by', fr: 'Exploité par', es: 'Operado por', de: 'Durchgeführt von', it: 'Operato da', pt: 'Operado por', ja: '運航', zh: '执飞', ar: 'تُشغّل بواسطة' },
    appDetails: { en: 'Flight details', fr: 'Détails du vol', es: 'Detalles del vuelo', de: 'Flugdetails', it: 'Dettagli del volo', pt: 'Detalhes do voo', ja: 'フライト詳細', zh: '航班详情', ar: 'تفاصيل الرحلة' },
    appTabFlights: { $ctx: 'the tab bar: the flights screen', en: 'Flights', fr: 'Vols', es: 'Vuelos', de: 'Flüge', it: 'Voli', pt: 'Voos', ja: 'フライト', zh: '航班', ar: 'الرحلات' },
    appTabExplore: { en: 'Explore', fr: 'Explorer', es: 'Explorar', de: 'Entdecken', it: 'Esplora', pt: 'Descobrir', ja: '探す', zh: '探索', ar: 'استكشاف' },
    appTabBag: { en: 'Baggage', fr: 'Bagages', es: 'Equipaje', de: 'Gepäck', it: 'Bagagli', pt: 'Bagagem', ja: '手荷物', zh: '行李', ar: 'الأمتعة' },
    appTabTrip: { en: 'Trip', fr: 'Voyage', es: 'Viaje', de: 'Reise', it: 'Viaggio', pt: 'Viagem', ja: '旅程', zh: '行程', ar: 'رحلتي' },
    appExploreH: { en: 'Explore the airport', fr: 'Explorez l’aéroport', es: 'Explora el aeropuerto', de: 'Den Flughafen entdecken', it: 'Esplora l’aeroporto', pt: 'Descubra o aeroporto', ja: '空港を探す', zh: '探索机场', ar: 'استكشف المطار' },
    appExploreP: { en: 'Find shops, food, lounges and washrooms — and how to get to them.', fr: 'Boutiques, restos, salons et toilettes — et comment s’y rendre.', es: 'Tiendas, comida, salas y baños — y cómo llegar.', de: 'Geschäfte, Restaurants, Wartebereiche und Toiletten finden — und den Weg dorthin.', it: 'Trova negozi, ristoranti, sale d’attesa e servizi igienici — e come raggiungerli.', pt: 'Encontre lojas, restaurantes, salas de espera e banheiros — e como chegar até eles.', ja: 'ショップ、飲食店、ラウンジ、トイレとその行き方を探せます。', zh: '查找商店、餐饮、休息室和洗手间，以及前往路线。', ar: 'اعثر على المتاجر والمطاعم والصالات ودورات المياه — وكيفية الوصول إليها.' },
    appSoon: { en: 'Coming soon', fr: 'Bientôt', es: 'Próximamente', de: 'Demnächst', it: 'Prossimamente', pt: 'Em breve', ja: '近日公開', zh: '即将推出', ar: 'قريبًا' },
    appTripH: { en: 'Your trip', fr: 'Votre voyage', es: 'Tu viaje', de: 'Ihre Reise', it: 'Il tuo viaggio', pt: 'Sua viagem', ja: 'あなたの旅程', zh: '您的行程', ar: 'رحلتك' },
    appTripP: { en: 'Save your flight and boarding pass for quick access. Sign in to unlock.', fr: 'Gardez votre vol et votre carte d’embarquement à portée de main. Connectez-vous.', es: 'Guarda tu vuelo y tu pase de abordar. Inicia sesión.', de: 'Speichern Sie Ihren Flug und Ihre Bordkarte für den schnellen Zugriff. Melden Sie sich an.', it: 'Salva il tuo volo e la carta d’imbarco per averli a portata di mano. Accedi per sbloccare.', pt: 'Salve seu voo e seu cartão de embarque para acesso rápido. Entre para desbloquear.', ja: 'フライトと搭乗券を保存してすぐに確認できます。ログインしてご利用ください。', zh: '保存您的航班和登机牌，方便快速查看。请登录以解锁。', ar: 'احفظ رحلتك وبطاقة صعودك للوصول السريع. سجّل الدخول لفتحها.' },
    appMembers: { en: 'Members', fr: 'Membres', es: 'Miembros', de: 'Mitglieder', it: 'Membri', pt: 'Membros', ja: '会員', zh: '会员', ar: 'الأعضاء' },
    appStEarly: { en: 'Early', fr: 'En avance', es: 'Adelantado', de: 'Verfrüht', it: 'In anticipo', pt: 'Adiantado', ja: '早着', zh: '提前', ar: 'مبكر' },
    appLoading: { en: 'Loading flights…', fr: 'Chargement des vols…', es: 'Cargando vuelos…', de: 'Flüge werden geladen…', it: 'Caricamento dei voli…', pt: 'Carregando voos…', ja: 'フライトを読み込み中…', zh: '正在加载航班…', ar: 'جارٍ تحميل الرحلات…' },
    // v24043 — the app's airport picker: its three group headings (they were
    // English in every language, the third 'Sun & International', which named
    // none of what it holds: London, Dublin, Edinburgh, Reykjavík, Zurich,
    // Sydney and Hobart, every airport outside Canada and the United States
    // with a feed of ours).
    appRegionCA: { $ctx: 'the airport picker: the group of Canadian airports', en: 'Airports in Canada', fr: 'Aéroports au Canada', es: 'Aeropuertos de Canadá', de: 'Flughäfen in Kanada', it: 'Aeroporti in Canada', pt: 'Aeroportos no Canadá', ja: 'カナダの空港', zh: '加拿大机场', ar: 'مطارات في كندا',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    appRegionUS: { $ctx: 'the airport picker: the group of airports in the United States', en: 'Airports in the United States', fr: 'Aéroports aux États-Unis', es: 'Aeropuertos en Estados Unidos', de: 'Flughäfen in den USA', it: 'Aeroporti negli Stati Uniti', pt: 'Aeroportos nos Estados Unidos', ja: 'アメリカの空港', zh: '美国机场', ar: 'مطارات في الولايات المتحدة',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    appRegionINT: { $ctx: 'the airport picker: the group of airports outside Canada and the United States', en: 'Airports in other countries', fr: 'Aéroports dans d’autres pays', es: 'Aeropuertos en otros países', de: 'Flughäfen in anderen Ländern', it: 'Aeroporti in altri paesi', pt: 'Aeroportos em outros países', ja: 'その他の国の空港', zh: '其他国家的机场', ar: 'مطارات في دول أخرى',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v24043 — the app's departures list folds the flights that have already
    // left into one line above it, which opens them; {N} is how many
    appGoneDep: { $ctx: 'the departures list: one line folding the flights that have already left, with their count', en: 'Departed ({N})', fr: 'Vols partis ({N})', es: 'Vuelos que ya salieron ({N})', de: 'Bereits abgeflogen ({N})', it: 'Voli già partiti ({N})', pt: 'Voos que já partiram ({N})', ja: '出発済みの便（{N}）', zh: '已出发航班（{N}）', ar: 'رحلات غادرت ({N})',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    cardBeforeBoard: { en: 'Before you board', fr: 'Avant l’embarquement', es: 'Antes de embarcar', de: 'Vor dem Einsteigen', it: 'Prima dell’imbarco', pt: 'Antes do embarque', ja: 'ご搭乗の前に', zh: '登机前须知', ar: 'قبل الصعود إلى الطائرة',
      $src: { en: 'house', fr: 'careful', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    closeMinBefore: { en:'{MIN} min before departure', fr:'{MIN} min avant le départ', es:'{MIN} min antes de la salida', de:'{MIN} Min. vor Abflug', it:'{MIN} min prima della partenza', pt:'{MIN} min antes da partida', ja:'出発{MIN}分前', zh:'起飞前{MIN}分钟', ar:'قبل {MIN} دقيقة من المغادرة',
        $src: { en: 'airline:AC', fr: 'airline:AC', es: 'careful', de: 'careful', it: 'careful', pt: 'careful', ja: 'careful', zh: 'careful', ar: 'careful' } },
    // v23973 — LATER AT THIS GATE (_gateLaterStripHtml, _gateChangeNoticeHtml).
    // The strip's title; the label before a moved flight's new gate number
    // ("now Gate 2 | maintenant porte 2", the number in its own pill); the
    // full-screen notice's title and its sentence. gateMovedProceed is LS's
    // gateChangeProceed word for word, here so _gateLbl can show the board's
    // two languages, each sentence whole on its own line ({GATE} is the gate).
    laterAtGate: { en:'Later at this gate', fr:'Plus tard à cette porte', es:'Más tarde en esta puerta', de:'Später an diesem Gate', it:'Più tardi a questo gate', pt:'Mais tarde neste portão', ja:'このゲートのこの後の便', zh:'本登机口稍后航班', ar:'لاحقًا من هذه البوابة' },
    nowGate:     { en:'now Gate', fr:'maintenant porte', es:'ahora puerta', de:'jetzt Gate', it:'ora gate', pt:'agora portão', ja:'変更後のゲート', zh:'现登机口', ar:'البوابة الجديدة' },
    gateChange:  { en:'Gate change', fr:'Changement de porte', es:'Cambio de puerta', de:'Gate-Wechsel', it:'Cambio gate', pt:'Mudança de portão', ja:'ゲート変更', zh:'登机口变更', ar:'تغيير البوابة' },
    gateMovedProceed: { en:'Please proceed to Gate {GATE}', fr:'Veuillez vous diriger vers la porte {GATE}', es:'Diríjase a la puerta {GATE}', de:'Bitte begeben Sie sich zu Gate {GATE}', it:'Procedere al gate {GATE}', pt:'Dirija-se ao portão {GATE}', ja:'ゲート {GATE} へお進みください', zh:'请前往 {GATE} 登机口', ar:'يرجى التوجه إلى البوابة {GATE}' },
    // ── THE HOMEPAGE AND ITS CREDITS PAGE (www.orionconnected.com) ────────
    // home.html and credits.html, through js/home.js. Not a board: a page in
    // ONE language at a time, the reader's (BoardStrings.pageLang). Placeholders
    // are filled from the page's own data ({N}, {CA}… counts of the airport
    // index, {LIVE} those of them live now, the paused left out, {CITY} a
    // name from it). Words the boards already print are not
    // repeated here: the page asks for the board's own entry (appDep for
    // 'Departures', youAreHere, heritageKicker, wxCredit, mapCreditOglNb, live).
    // Country names come from Intl (CLDR), with the store's locale.
    // A name of two words never breaks across lines (the display rule: no
    // severed phrases): Orion Connected, MET Norway, New Brunswick and its
    // translations hold a no-break space (U+00A0), Nouveau-Brunswick a
    // no-break hyphen (U+2011), here and in wxCredit and mapCreditOglNb.
    homeSkip: { en: 'Skip to content', fr: 'Aller au contenu', es: 'Saltar al contenido', de: 'Zum Inhalt springen', it: 'Vai al contenuto', pt: 'Pular para o conteúdo', ja: '本文へスキップ', zh: '跳到正文', ar: 'الانتقال إلى المحتوى' },
    homeHomeLink: { en: 'Orion Connected — home', fr: 'Orion Connected — accueil', es: 'Orion Connected — inicio', de: 'Orion Connected — Startseite', it: 'Orion Connected — pagina iniziale', pt: 'Orion Connected — página inicial', ja: 'Orion Connected — ホーム', zh: 'Orion Connected — 首页', ar: 'Orion Connected — الصفحة الرئيسية' },
    homeNavAria: { en: 'Main navigation', fr: 'Navigation principale', es: 'Navegación principal', de: 'Hauptnavigation', it: 'Navigazione principale', pt: 'Navegação principal', ja: 'メインナビゲーション', zh: '主导航', ar: 'التنقل الرئيسي' },
    homeNavScreens: { en: 'Screens', fr: 'Écrans', es: 'Pantallas', de: 'Bildschirme', it: 'Schermi', pt: 'Telas', ja: '画面', zh: '屏幕', ar: 'الشاشات' },
    homeNavAirports: { en: 'Airports', fr: 'Aéroports', es: 'Aeropuertos', de: 'Flughäfen', it: 'Aeroporti', pt: 'Aeroportos', ja: '空港', zh: '机场', ar: 'المطارات' },
    homeNavLanguages: { en: 'Languages', fr: 'Langues', es: 'Idiomas', de: 'Sprachen', it: 'Lingue', pt: 'Línguas', ja: '言語', zh: '语言', ar: 'اللغات' },
    homeNavApp: { en: 'Phone app', fr: 'Application mobile', es: 'Aplicación móvil', de: 'Handy-App', it: 'Applicazione mobile', pt: 'Aplicativo para celular', ja: 'スマホアプリ', zh: '手机应用', ar: 'تطبيق الهاتف' },
    homeNavStream: { en: 'Live stream', fr: 'Diffusion en direct', es: 'Transmisión en vivo', de: 'Livestream', it: 'Diretta streaming', pt: 'Transmissão ao vivo', ja: 'ライブ配信', zh: '直播', ar: 'البث المباشر' },
    homeMenu: { en: 'Menu', fr: 'Menu', es: 'Menú', de: 'Menü', it: 'Menu', pt: 'Menu', ja: 'メニュー', zh: '菜单', ar: 'القائمة' },
    homeOpenBoards: { en: 'Open the live boards', fr: 'Voir les tableaux en direct', es: 'Ver los paneles en vivo', de: 'Live-Anzeigen öffnen', it: 'Apri i tabelloni in diretta', pt: 'Abrir os painéis ao vivo', ja: 'ライブの案内表示を開く', zh: '查看实时航班屏', ar: 'افتح اللوحات المباشرة' },
    homeCredits: { en: 'Credits & Contact', fr: 'Crédits et coordonnées', es: 'Créditos y contacto', de: 'Nachweise & Kontakt', it: 'Crediti e contatti', pt: 'Créditos e contato', ja: 'クレジット・お問い合わせ', zh: '致谢与联系方式', ar: 'المصادر والتواصل' },
    // the language switch's label
    homeLang: { en: 'Choose a language', fr: 'Choisir la langue', es: 'Elige un idioma', de: 'Sprache wählen', it: 'Scegli la lingua', pt: 'Escolha a língua', ja: '言語を選択', zh: '选择语言', ar: 'اختر اللغة' },
    homeLiveNow: { en: 'Live now at {LIVE} airports', fr: 'En direct dans {LIVE} aéroports', es: 'En vivo en {LIVE} aeropuertos', de: 'Jetzt live an {LIVE} Flughäfen', it: 'In diretta in {LIVE} aeroporti', pt: 'Ao vivo em {LIVE} aeroportos', ja: '{LIVE}空港でライブ表示中', zh: '{LIVE} 个机场实时显示中', ar: 'مباشر الآن في {LIVE} مطارًا' },
    homeMadeIn: { en: 'Made in Moncton, New Brunswick', fr: 'Conçu à Moncton, au Nouveau‑Brunswick', es: 'Hecho en Moncton, Nuevo Brunswick', de: 'Entwickelt in Moncton, New Brunswick', it: 'Realizzato a Moncton, Nuovo Brunswick', pt: 'Feito em Moncton, Novo Brunswick', ja: 'ニューブランズウィック州モンクトン発', zh: '来自新不伦瑞克省蒙克顿', ar: 'صُنع في مونكتون، نيو برونزويك' },
    homeHeroTitle: { en: 'Live flight boards for {N} airports.', fr: 'Des tableaux de vols en direct pour {N} aéroports.', es: 'Paneles de vuelos en vivo para {N} aeropuertos.', de: 'Live-Fluganzeigen für {N} Flughäfen.', it: 'Tabelloni dei voli in diretta per {N} aeroporti.', pt: 'Painéis de voos ao vivo para {N} aeroportos.', ja: '{N}空港の発着案内を、ライブで。', zh: '{N} 个机场的实时航班信息屏。', ar: 'لوحات الرحلات بالوقت الفعلي في {N} مطارًا.' },
    homeHeroLead: { en: 'Departure and arrival boards, gate screens and baggage boards, live from each airport’s own data, in nine languages.', fr: 'Tableaux des départs et des arrivées, écrans de porte et tableaux des bagages, en direct à partir des données de chaque aéroport, en neuf langues.', es: 'Paneles de salidas y llegadas, pantallas de puerta y paneles de equipaje, en vivo con los datos de cada aeropuerto, en nueve idiomas.', de: 'Abflug- und Ankunftstafeln, Gate-Bildschirme und Gepäckanzeigen, live aus den eigenen Daten jedes Flughafens, in neun Sprachen.', it: 'Tabelloni delle partenze e degli arrivi, schermi dei gate e tabelloni dei bagagli, in diretta dai dati di ciascun aeroporto, in nove lingue.', pt: 'Painéis de partidas e chegadas, telas de portão e painéis de bagagem, ao vivo com os dados de cada aeroporto, em nove línguas.', ja: '出発・到着の案内表示、搭乗口の画面、手荷物受取の案内表示。各空港のデータからライブで、9つの言語で表示します。', zh: '出发与到达航班屏、登机口屏和行李提取屏，实时显示各机场自己的数据，支持九种语言。', ar: 'لوحات المغادرة والوصول، وشاشات البوابات، ولوحات الأمتعة، مباشرةً من بيانات كل مطار، بتسع لغات.' },
    homeFig: { en: 'Fig. {N}', fr: 'Figure {N}', es: 'Figura {N}', de: 'Abb. {N}', it: 'Immagine {N}', pt: 'Imagem {N}', ja: '図{N}', zh: '图{N}', ar: 'الشكل {N}' },
    homeCallouts: { en: 'Callouts on Fig. {N}', fr: 'Repères de la figure {N}', es: 'Indicaciones de la figura {N}', de: 'Markierungen in Abb. {N}', it: 'Richiami dell’immagine {N}', pt: 'Destaques da imagem {N}', ja: '図{N}の注記', zh: '图{N}的标注', ar: 'إشارات الشكل {N}' },
    homeAltYqmDep: { en: 'The departures board at Moncton, in English and French: ten flights, each with the weather at the destination, the time and the status, and all but one with a gate. One is cancelled and two are delayed. A drawing of the city skyline fills the lower half.', fr: 'Le tableau des départs de Moncton, en anglais et en français : dix vols, chacun avec la météo à destination, l’heure et le statut, et tous sauf un avec une porte. L’un d’eux est annulé et deux sont retardés. Un dessin des toits de la ville occupe la moitié inférieure.', es: 'El panel de salidas de Moncton, en inglés y francés: diez vuelos, cada uno con el clima en el destino, la hora y el estado, y todos menos uno con una puerta. Uno está cancelado y dos están retrasados. Un dibujo del perfil de la ciudad ocupa la mitad inferior.', de: 'Die Abflugtafel in Moncton, auf Englisch und Französisch: zehn Flüge, jeweils mit dem Wetter am Ziel, der Uhrzeit und dem Status, alle bis auf einen auch mit einem Gate. Einer ist annulliert, zwei sind verspätet. Eine Zeichnung der Stadtsilhouette füllt die untere Hälfte.', it: 'Il tabellone delle partenze di Moncton, in inglese e in francese: dieci voli, ognuno con il meteo a destinazione, l’orario e lo stato, e tutti tranne uno con un gate. Uno è cancellato e due sono in ritardo. Un disegno del profilo della città occupa la metà inferiore.', pt: 'O painel de partidas de Moncton, em inglês e francês: dez voos, cada um com o clima no destino, o horário e a situação, e todos menos um com um portão. Um deles está cancelado e dois estão atrasados. Um desenho do horizonte da cidade ocupa a metade inferior.', ja: 'モンクトンの出発案内（英語とフランス語）。10便が、目的地の天気、時刻、運航状況とともに並び、うち9便には搭乗口も表示。1便が欠航、2便が遅延。下半分には街並みのイラスト。', zh: '蒙克顿的出发航班屏（英语和法语）：10 个航班，每个航班都显示目的地天气、时间和状态，其中 9 个还显示登机口；一个已取消，两个延误。下半部分是城市天际线的插画。', ar: 'لوحة المغادرة في مونكتون بالإنجليزية والفرنسية: عشر رحلات، لكل منها الطقس في الوجهة والوقت والحالة، ولكلٍّ منها بوابة إلا رحلةً واحدة، وإحداها ملغاة واثنتان متأخرتان. ويملأ النصفَ السفلي رسمٌ لأفق المدينة.' },
    homeCapYqmDep: { en: 'Departures at Moncton (YQM), the first airport on Orion Connected, in English and French.', fr: 'Les départs à Moncton (YQM), le premier aéroport d’Orion Connected, en anglais et en français.', es: 'Salidas en Moncton (YQM), el primer aeropuerto de Orion Connected, en inglés y francés.', de: 'Abflüge in Moncton (YQM), dem ersten Flughafen bei Orion Connected, auf Englisch und Französisch.', it: 'Partenze a Moncton (YQM), il primo aeroporto di Orion Connected, in inglese e in francese.', pt: 'Partidas em Moncton (YQM), o primeiro aeroporto da Orion Connected, em inglês e francês.', ja: 'モンクトン（YQM）の出発案内。Orion Connected の最初の空港で、英語とフランス語で表示。', zh: '蒙克顿（YQM）的出发航班，Orion Connected 的第一个机场，以英语和法语显示。', ar: 'المغادرات في مونكتون (YQM)، أول مطار في Orion Connected، بالإنجليزية والفرنسية.' },
    homeKickScreens: { en: 'The screens', fr: 'Les écrans', es: 'Las pantallas', de: 'Die Bildschirme', it: 'Gli schermi', pt: 'As telas', ja: '画面', zh: '屏幕', ar: 'الشاشات' },
    homeScreensTitle: { en: 'One airport, three screens.', fr: 'Un aéroport, trois écrans.', es: 'Un aeropuerto, tres pantallas.', de: 'Ein Flughafen, drei Bildschirme.', it: 'Un aeroporto, tre schermi.', pt: 'Um aeroporto, três telas.', ja: '1つの空港に、3つの画面。', zh: '一座机场，三种屏幕。', ar: 'مطار واحد، وثلاث شاشات.' },
    homeScreensLead: { en: 'Each kind of screen has one job, and every one of them runs live from the airport’s own flight data.', fr: 'Chaque type d’écran a un seul rôle, et tous fonctionnent en direct à partir des données de vol de l’aéroport.', es: 'Cada tipo de pantalla tiene una sola función, y todas funcionan en vivo con los datos de vuelos del propio aeropuerto.', de: 'Jede Art von Bildschirm hat eine Aufgabe, und alle laufen live mit den Flugdaten des Flughafens selbst.', it: 'Ogni tipo di schermo ha un solo compito, e tutti funzionano in diretta con i dati di volo dell’aeroporto stesso.', pt: 'Cada tipo de tela tem uma única função, e todas funcionam ao vivo com os dados de voo do próprio aeroporto.', ja: '画面ごとに役割は一つ。どれも空港自身のフライトデータでライブに動いています。', zh: '每种屏幕各司其职，全部实时采用机场自己的航班数据。', ar: 'لكل نوع من الشاشات مهمة واحدة، وجميعها تعمل مباشرةً من بيانات الرحلات الخاصة بالمطار نفسه.' },
    homeFidsPict: { en: 'Departures & arrivals', fr: 'Départs et arrivées', es: 'Salidas y llegadas', de: 'Abflüge & Ankünfte', it: 'Partenze e arrivi', pt: 'Partidas e chegadas', ja: '出発・到着', zh: '出发与到达', ar: 'المغادرة والوصول' },
    homeFidsTitle: { en: 'Every flight, leaving and landing.', fr: 'Chaque vol, au départ comme à l’arrivée.', es: 'Cada vuelo, al salir y al llegar.', de: 'Jeder Flug, beim Abflug und bei der Landung.', it: 'Ogni volo, in partenza e in arrivo.', pt: 'Cada voo, na partida e na chegada.', ja: 'すべての便を、出発も到着も。', zh: '每个航班，出发与到达。', ar: 'كل رحلة، مغادرةً ووصولًا.' },
    homeFidsText: { en: 'The board people look for first. Each row carries the airline, the flight number, the weather at the destination, the gate, the time and the status.', fr: 'Le tableau que l’on cherche en premier. Chaque ligne indique la compagnie aérienne, le numéro de vol, la météo à destination, la porte, l’heure et le statut.', es: 'El panel que todos buscan primero. Cada fila muestra la aerolínea, el número de vuelo, el clima en el destino, la puerta, la hora y el estado.', de: 'Die Tafel, nach der man zuerst sucht. Jede Zeile zeigt die Fluggesellschaft, die Flugnummer, das Wetter am Ziel, das Gate, die Uhrzeit und den Status.', it: 'Il tabellone che si cerca per primo. Ogni riga riporta la compagnia aerea, il numero del volo, il meteo a destinazione, il gate, l’orario e lo stato.', pt: 'O painel que todos procuram primeiro. Cada linha traz a companhia aérea, o número do voo, o clima no destino, o portão, o horário e a situação.', ja: '人が最初に探す案内表示です。各行には航空会社、便名、目的地の天気、搭乗口、時刻、運航状況が並びます。', zh: '人们最先寻找的屏幕。每一行都显示航空公司、航班号、目的地天气、登机口、时间和状态。', ar: 'اللوحة التي يبحث عنها الناس أولًا. يعرض كل سطر شركة الطيران ورقم الرحلة والطقس في الوجهة والبوابة والوقت والحالة.' },
    homeFidsK1: { en: 'The weather where each flight is going', fr: 'La météo là où va chaque vol', es: 'El clima en el destino de cada vuelo', de: 'Das Wetter am Ziel jedes Flugs', it: 'Il meteo dove è diretto ogni volo', pt: 'O clima no destino de cada voo', ja: '各便の目的地の天気', zh: '每个航班目的地的天气', ar: 'الطقس في وجهة كل رحلة' },
    homeFidsK2: { en: 'The gate', fr: 'La porte', es: 'La puerta', de: 'Das Gate', it: 'Il gate', pt: 'O portão', ja: '搭乗口', zh: '登机口', ar: 'البوابة' },
    homeFidsK3: { en: 'The status of every flight', fr: 'Le statut de chaque vol', es: 'El estado de cada vuelo', de: 'Der Status jedes Flugs', it: 'Lo stato di ogni volo', pt: 'A situação de cada voo', ja: '各便の運航状況', zh: '每个航班的状态', ar: 'حالة كل رحلة' },
    homeAltYhzDep: { en: 'The departures board at Halifax Stanfield, in English and French: sixteen flights, each with the weather at the destination, the gate, the time and the status. One has departed and one is cancelled.', fr: 'Le tableau des départs de Halifax Stanfield, en anglais et en français : seize vols, chacun avec la météo à destination, la porte, l’heure et le statut. L’un d’eux est parti et un autre est annulé.', es: 'El panel de salidas de Halifax Stanfield, en inglés y francés: dieciséis vuelos, cada uno con el clima en el destino, la puerta, la hora y el estado. Uno ya ha salido y otro está cancelado.', de: 'Die Abflugtafel in Halifax Stanfield, auf Englisch und Französisch: sechzehn Flüge, jeweils mit dem Wetter am Ziel, dem Gate, der Uhrzeit und dem Status. Einer ist bereits abgeflogen, einer annulliert.', it: 'Il tabellone delle partenze di Halifax Stanfield, in inglese e in francese: sedici voli, ognuno con il meteo a destinazione, il gate, l’orario e lo stato. Uno è già partito e uno è cancellato.', pt: 'O painel de partidas de Halifax Stanfield, em inglês e francês: dezesseis voos, cada um com o clima no destino, o portão, o horário e a situação. Um deles já partiu e outro está cancelado.', ja: 'ハリファックス・スタンフィールドの出発案内（英語とフランス語）。16便が、目的地の天気、搭乗口、時刻、運航状況とともに並び、1便が出発済み、1便が欠航。', zh: '哈利法克斯斯坦菲尔德的出发航班屏（英语和法语）：16 个航班，每个都显示目的地天气、登机口、时间和状态，其中一个已起飞，一个已取消。', ar: 'لوحة المغادرة في هاليفاكس ستانفيلد بالإنجليزية والفرنسية: ست عشرة رحلة، لكل منها الطقس في الوجهة والبوابة والوقت والحالة، وإحداها غادرت وأخرى ملغاة.' },
    homeCapYhzDep: { en: 'Departures at Halifax Stanfield (YHZ): sixteen flights on one screen.', fr: 'Les départs à Halifax Stanfield (YHZ) : seize vols sur un seul écran.', es: 'Salidas en Halifax Stanfield (YHZ): dieciséis vuelos en una sola pantalla.', de: 'Abflüge in Halifax Stanfield (YHZ): sechzehn Flüge auf einem Bildschirm.', it: 'Partenze a Halifax Stanfield (YHZ): sedici voli su un solo schermo.', pt: 'Partidas em Halifax Stanfield (YHZ): dezesseis voos em uma só tela.', ja: 'ハリファックス・スタンフィールド（YHZ）の出発案内。1画面に16便。', zh: '哈利法克斯斯坦菲尔德（YHZ）的出发航班：一屏显示 16 个航班。', ar: 'المغادرات في هاليفاكس ستانفيلد (YHZ): ست عشرة رحلة على شاشة واحدة.' },
    homeGidsPict: { en: 'Gate screens', fr: 'Écrans de porte', es: 'Pantallas de puerta', de: 'Gate-Bildschirme', it: 'Schermi dei gate', pt: 'Telas de portão', ja: '搭乗口の画面', zh: '登机口屏幕', ar: 'شاشات البوابات' },
    homeGidsTitle: { en: 'Everything about the flight at the gate.', fr: 'Tout sur le vol à la porte.', es: 'Todo sobre el vuelo en la puerta.', de: 'Alles über den Flug am Gate.', it: 'Tutto sul volo al gate.', pt: 'Tudo sobre o voo no portão.', ja: '搭乗口の便のすべてを。', zh: '登机口航班的一切信息。', ar: 'كل ما يخص الرحلة عند البوابة.' },
    homeGidsText: { en: 'Boarding, departure and arrival times, the aircraft that will fly it, a live map, and a welcome aboard.', fr: 'Les heures d’embarquement, de départ et d’arrivée, l’appareil qui assurera le vol, une carte en direct et un mot de bienvenue à bord.', es: 'Las horas de embarque, salida y llegada, el avión que hará el vuelo, un mapa en vivo y una bienvenida a bordo.', de: 'Boarding-, Abflug- und Ankunftszeiten, das Flugzeug, das den Flug durchführt, eine Live-Karte und ein Willkommen an Bord.', it: 'Gli orari di imbarco, partenza e arrivo, l’aereo che effettuerà il volo, una mappa in diretta e un benvenuto a bordo.', pt: 'Os horários de embarque, partida e chegada, a aeronave que fará o voo, um mapa ao vivo e as boas-vindas a bordo.', ja: '搭乗・出発・到着の時刻、運航する機材、ライブマップ、そしてご搭乗を歓迎するメッセージ。', zh: '登机、起飞和到达时间，执飞的飞机，实时地图，以及欢迎登机的问候语。', ar: 'مواعيد الصعود والمغادرة والوصول، والطائرة التي ستقوم بالرحلة، وخريطة مباشرة، وترحيب بالركاب على متن الطائرة.' },
    homeGidsK1: { en: 'Boarding, departure and arrival times', fr: 'Les heures d’embarquement, de départ et d’arrivée', es: 'Horas de embarque, salida y llegada', de: 'Boarding-, Abflug- und Ankunftszeiten', it: 'Orari di imbarco, partenza e arrivo', pt: 'Horários de embarque, partida e chegada', ja: '搭乗・出発・到着の時刻', zh: '登机、起飞和到达时间', ar: 'مواعيد الصعود والمغادرة والوصول' },
    homeGidsK2: { en: 'The live map at gate {GATE}', fr: 'La carte en direct à la porte {GATE}', es: 'El mapa en vivo en la puerta {GATE}', de: 'Die Live-Karte an Gate {GATE}', it: 'La mappa in diretta al gate {GATE}', pt: 'O mapa ao vivo no portão {GATE}', ja: '{GATE}番搭乗口のライブマップ', zh: '{GATE} 号登机口的实时地图', ar: 'الخريطة المباشرة عند البوابة {GATE}' },
    homeGidsK3: { en: 'The aircraft, by type and registration', fr: 'L’appareil, son type et son immatriculation', es: 'El avión, por tipo y matrícula', de: 'Das Flugzeug, nach Typ und Kennzeichen', it: 'L’aereo, per tipo e immatricolazione', pt: 'A aeronave, por tipo e matrícula', ja: '機材の型式と登録記号', zh: '飞机的机型和注册号', ar: 'الطائرة بطرازها وتسجيلها' },
    homeAltGate: { en: 'A WestJet gate screen at Moncton, gate 1: flight WS813 to Calgary, with its boarding, departure and arrival times, a welcome aboard in English and French, a live map of the aircraft flying in from Calgary, and that aircraft, a Boeing 737 MAX 8.', fr: 'Un écran de porte de WestJet à Moncton, porte 1 : le vol WS813 à destination de Calgary, avec ses heures d’embarquement, de départ et d’arrivée, un mot de bienvenue à bord en anglais et en français, une carte en direct de l’appareil qui arrive de Calgary, et cet appareil, un Boeing 737 MAX 8.', es: 'Una pantalla de puerta de WestJet en Moncton, puerta 1: el vuelo WS813 a Calgary, con sus horas de embarque, salida y llegada, una bienvenida a bordo en inglés y francés, un mapa en vivo del avión que llega desde Calgary, y ese avión, un Boeing 737 MAX 8.', de: 'Ein WestJet-Gate-Bildschirm in Moncton, Gate 1: Flug WS813 nach Calgary, mit Boarding-, Abflug- und Ankunftszeit, einem Willkommen an Bord auf Englisch und Französisch, einer Live-Karte des Flugzeugs auf dem Weg aus Calgary und diesem Flugzeug, einer Boeing 737 MAX 8.', it: 'Uno schermo del gate WestJet a Moncton, gate 1: il volo WS813 per Calgary, con gli orari di imbarco, partenza e arrivo, un benvenuto a bordo in inglese e in francese, una mappa in diretta dell’aereo in arrivo da Calgary, e quell’aereo, un Boeing 737 MAX 8.', pt: 'Uma tela de portão da WestJet em Moncton, portão 1: o voo WS813 para Calgary, com os horários de embarque, partida e chegada, as boas-vindas a bordo em inglês e francês, um mapa ao vivo da aeronave que vem de Calgary, e essa aeronave, um Boeing 737 MAX 8.', ja: 'モンクトン1番搭乗口のウエストジェットの画面。カルガリー行きWS813便の搭乗・出発・到着時刻、英語とフランス語のウェルカムメッセージ、カルガリーから向かってくる機材のライブマップ、その機材のボーイング737 MAX 8を表示。', zh: '蒙克顿 1 号登机口的西捷登机口屏：飞往卡尔加里的 WS813 航班，显示登机、起飞和到达时间，英语和法语的欢迎语，正从卡尔加里飞来的飞机的实时地图，以及这架波音 737 MAX 8。', ar: 'شاشة بوابة لشركة WestJet في مونكتون، البوابة 1: الرحلة WS813 إلى كالغاري، مع مواعيد الصعود والمغادرة والوصول، وترحيب على متن الطائرة بالإنجليزية والفرنسية، وخريطة مباشرة للطائرة القادمة من كالغاري، وهذه الطائرة، وهي من طراز بوينغ 737 MAX 8.' },
    homeCapGate: { en: 'A WestJet gate screen at Moncton, gate 1.', fr: 'Un écran de porte de WestJet à Moncton, porte 1.', es: 'Una pantalla de puerta de WestJet en Moncton, puerta 1.', de: 'Ein WestJet-Gate-Bildschirm in Moncton, Gate 1.', it: 'Uno schermo del gate WestJet a Moncton, gate 1.', pt: 'Uma tela de portão da WestJet em Moncton, portão 1.', ja: 'モンクトン1番搭乗口のウエストジェットの画面。', zh: '蒙克顿 1 号登机口的西捷登机口屏。', ar: 'شاشة بوابة لشركة WestJet في مونكتون، البوابة 1.' },
    homeBidsPict: { en: 'Baggage boards', fr: 'Tableaux des bagages', es: 'Paneles de equipaje', de: 'Gepäckanzeigen', it: 'Tabelloni dei bagagli', pt: 'Painéis de bagagem', ja: '手荷物受取の案内表示', zh: '行李提取屏', ar: 'لوحات الأمتعة' },
    homeBidsTitle: { en: 'Which belt, for every arriving flight.', fr: 'Le bon carrousel, pour chaque vol à l’arrivée.', es: 'Qué banda, para cada vuelo que llega.', de: 'Welches Band, für jeden ankommenden Flug.', it: 'Quale nastro, per ogni volo in arrivo.', pt: 'Qual esteira, para cada voo que chega.', ja: '到着便ごとに、どのターンテーブルか。', zh: '每个到达航班，对应哪个转盘。', ar: 'أيّ سير، لكل رحلة قادمة.' },
    homeBidsText: { en: 'The one question everyone in the hall is asking: which belt this flight’s bags come out on.', fr: 'La question que tout le monde se pose dans la salle : sur quel carrousel arrivent les bagages de ce vol.', es: 'La pregunta que todos se hacen en la sala: en qué banda salen las maletas de este vuelo.', de: 'Die eine Frage, die sich in der Halle alle stellen: Auf welchem Band kommt das Gepäck dieses Flugs?', it: 'L’unica domanda che tutti si fanno nella sala: su quale nastro arrivano i bagagli di questo volo.', pt: 'A pergunta que todos fazem no saguão: em qual esteira saem as malas deste voo.', ja: '到着ロビーの誰もが知りたいこと。この便の手荷物は、どのターンテーブルに出てくるのか。', zh: '大厅里每个人都想知道：这个航班的行李从哪个转盘出来。', ar: 'السؤال الذي يطرحه الجميع في الصالة: على أي سير تخرج أمتعة هذه الرحلة؟' },
    homeBidsK1: { en: 'The belt for each arriving flight', fr: 'Le carrousel de chaque vol à l’arrivée', es: 'La banda de cada vuelo que llega', de: 'Das Band für jeden ankommenden Flug', it: 'Il nastro di ogni volo in arrivo', pt: 'A esteira de cada voo que chega', ja: '到着便ごとのターンテーブル', zh: '每个到达航班的转盘', ar: 'السير لكل رحلة قادمة' },
    // Fig. 4's map is marked “You are here | Vous êtes ici” (logos/home/baggage.jpg):
    // English and French quote it, the other languages say what it shows
    homeBidsK2: { en: 'A map of the hall, with “You are here”', fr: 'Un plan de la salle, avec « Vous êtes ici »', es: 'Un plano de la sala que indica dónde está usted', de: 'Ein Plan der Halle, der zeigt, wo Sie sind', it: 'Una mappa della sala che indica dove ci si trova', pt: 'Um mapa do saguão que mostra onde você está', ja: '現在地を示した館内図', zh: '标出您所在位置的大厅地图', ar: 'خريطة للصالة تبيّن مكانك' },
    homeBidsK3: { en: 'Which flights each belt is serving', fr: 'Les vols servis par chaque carrousel', es: 'Los vuelos que atiende cada banda', de: 'Welche Flüge jedes Band bedient', it: 'I voli serviti da ciascun nastro', pt: 'Os voos atendidos por cada esteira', ja: '各ターンテーブルが扱う便', zh: '每个转盘服务的航班', ar: 'الرحلات التي يخدمها كل سير' },
    homeAltBags: { en: 'The baggage claim board at Moncton, in English and French: flight AC656 from Montréal-Trudeau is delayed, its bags due on belt 2, beside a map of the two belts marked “You are here”.', fr: 'Le tableau des bagages de Moncton, en anglais et en français : le vol AC656 en provenance de Montréal-Trudeau est en retard, ses bagages attendus au carrousel 2, à côté d’un plan des deux carrousels marqué « Vous êtes ici ».', es: 'El panel de equipaje de Moncton, en inglés y francés: el vuelo AC656 desde Montréal-Trudeau viene con retraso, con sus maletas previstas en la banda 2, junto a un plano de las dos bandas que indica dónde está usted.', de: 'Die Gepäckanzeige in Moncton, auf Englisch und Französisch: Flug AC656 aus Montréal-Trudeau ist verspätet, sein Gepäck wird auf Band 2 erwartet, daneben ein Plan der beiden Bänder, der zeigt, wo Sie sind.', it: 'Il tabellone dei bagagli di Moncton, in inglese e in francese: il volo AC656 da Montréal-Trudeau è in ritardo, i bagagli attesi sul nastro 2, accanto a una mappa dei due nastri che indica dove ci si trova.', pt: 'O painel de bagagem de Moncton, em inglês e francês: o voo AC656 vindo de Montréal-Trudeau está atrasado, com as malas previstas na esteira 2, ao lado de um mapa das duas esteiras que mostra onde você está.', ja: 'モンクトンの手荷物受取案内（英語とフランス語）。モントリオール・トルドー発AC656便は遅延中で、手荷物は2番ターンテーブルの予定。横には現在地を示した2基のターンテーブルの図。', zh: '蒙克顿的行李提取屏（英语和法语）：从蒙特利尔特鲁多飞来的 AC656 航班延误，行李将在 2 号转盘，旁边是标出您所在位置的两个转盘的地图。', ar: 'لوحة استلام الأمتعة في مونكتون بالإنجليزية والفرنسية: الرحلة AC656 من مونتريال ترودو متأخرة، ويُنتظر وصول أمتعتها إلى السير 2، وبجانبها خريطة للسيرين تبيّن مكانك.' },
    homeCapBags: { en: 'Baggage claim at Moncton (YQM), in English and French.', fr: 'Le retrait des bagages à Moncton (YQM), en anglais et en français.', es: 'Recogida de equipaje en Moncton (YQM), en inglés y francés.', de: 'Gepäckausgabe in Moncton (YQM), auf Englisch und Französisch.', it: 'Ritiro bagagli a Moncton (YQM), in inglese e in francese.', pt: 'Retirada de bagagem em Moncton (YQM), em inglês e francês.', ja: 'モンクトン（YQM）の手荷物受取案内。英語とフランス語で表示。', zh: '蒙克顿（YQM）的行李提取屏，以英语和法语显示。', ar: 'استلام الأمتعة في مونكتون (YQM)، بالإنجليزية والفرنسية.' },
    homeKickAirports: { en: 'The airports', fr: 'Les aéroports', es: 'Los aeropuertos', de: 'Die Flughäfen', it: 'Gli aeroporti', pt: 'Os aeroportos', ja: '空港', zh: '机场', ar: 'المطارات' },
    homeAirportsTitle: { en: '{N} airports, each with its own address.', fr: '{N} aéroports, chacun à sa propre adresse.', es: '{N} aeropuertos, cada uno con su propia dirección.', de: '{N} Flughäfen, jeder mit eigener Adresse.', it: '{N} aeroporti, ognuno con il proprio indirizzo.', pt: '{N} aeroportos, cada um com seu próprio endereço.', ja: '{N}の空港に、それぞれのアドレス。', zh: '{N} 个机场，各有专属网址。', ar: '{N} مطارًا، لكل منها عنوانه الخاص.' },
    homeAirportsLead: { en: '{CA} in Canada, {US} in the United States, {EU} in Europe and {AU} in Australia. Choose one to open its live board.', fr: '{CA} au Canada, {US} aux États-Unis, {EU} en Europe et {AU} en Australie. Choisissez-en un pour ouvrir son tableau en direct.', es: '{CA} en Canadá, {US} en Estados Unidos, {EU} en Europa y {AU} en Australia. Elige uno para abrir su panel en vivo.', de: '{CA} in Kanada, {US} in den Vereinigten Staaten, {EU} in Europa und {AU} in Australien. Wählen Sie einen aus, um seine Live-Anzeige zu öffnen.', it: '{CA} in Canada, {US} negli Stati Uniti, {EU} in Europa e {AU} in Australia. Scegline uno per aprire il suo tabellone in diretta.', pt: '{CA} no Canadá, {US} nos Estados Unidos, {EU} na Europa e {AU} na Austrália. Escolha um para abrir o painel ao vivo.', ja: 'カナダに{CA}、アメリカ合衆国に{US}、ヨーロッパに{EU}、オーストラリアに{AU}。空港を選ぶと、ライブの案内表示が開きます。', zh: '加拿大 {CA} 个，美国 {US} 个，欧洲 {EU} 个，澳大利亚 {AU} 个。选择一个即可打开它的实时航班屏。', ar: '{CA} في كندا، و{US} في الولايات المتحدة، و{EU} في أوروبا، و{AU} في أستراليا. اختر مطارًا لفتح لوحته المباشرة.' },
    homeAddrFor: { en: 'For Moncton —', fr: 'Pour Moncton —', es: 'Para Moncton —', de: 'Für Moncton —', it: 'Per Moncton —', pt: 'Para Moncton —', ja: 'モンクトンなら', zh: '蒙克顿：', ar: 'لمطار مونكتون —' },
    homeColRegion: { en: 'Region', fr: 'Région', es: 'Región', de: 'Gebiet', it: 'Regione', pt: 'Região', ja: '地域', zh: '地区', ar: 'المنطقة' },
    homeColAirport: { $ctx: 'column heading', en: 'Airport', fr: 'Aéroport', es: 'Aeropuerto', de: 'Flughafen', it: 'Aeroporto', pt: 'Aeroporto', ja: '空港', zh: '机场', ar: 'المطار' },
    homeHomeBase: { en: 'home base', fr: 'port d’attache', es: 'sede', de: 'Heimatbasis', it: 'sede', pt: 'sede', ja: '拠点', zh: '大本营', ar: 'المقر' },
    homePaused: { en: 'Paused', fr: 'En pause', es: 'En pausa', de: 'Pausiert', it: 'In pausa', pt: 'Em pausa', ja: '一時停止中', zh: '已暂停', ar: 'متوقف مؤقتًا' },
    // A region's count: one entry per plural form (Intl.PluralRules, with the
    // store's locale): 'airport' or 'airports'. Arabic, whose noun changes for
    // two, three to ten and eleven to ninety-nine, reads it as a label:
    // 'Airports: 28'.
    homeApOne: { $ctx: 'count, plural form one', en: '{N} airport', fr: '{N} aéroport', es: '{N} aeropuerto', de: '{N} Flughafen', it: '{N} aeroporto', pt: '{N} aeroporto', ja: '{N}空港', zh: '{N} 个机场', ar: 'المطارات: {N}' },
    homeApTwo: { $ctx: 'count, plural form two', en: '{N} airports', fr: '{N} aéroports', es: '{N} aeropuertos', de: '{N} Flughäfen', it: '{N} aeroporti', pt: '{N} aeroportos', ja: '{N}空港', zh: '{N} 个机场', ar: 'المطارات: {N}' },
    homeApFew: { $ctx: 'count, plural form few', en: '{N} airports', fr: '{N} aéroports', es: '{N} aeropuertos', de: '{N} Flughäfen', it: '{N} aeroporti', pt: '{N} aeroportos', ja: '{N}空港', zh: '{N} 个机场', ar: 'المطارات: {N}' },
    homeApMany: { $ctx: 'count, plural form many', en: '{N} airports', fr: '{N} aéroports', es: '{N} aeropuertos', de: '{N} Flughäfen', it: '{N} aeroporti', pt: '{N} aeroportos', ja: '{N}空港', zh: '{N} 个机场', ar: 'المطارات: {N}' },
    homeApOther: { $ctx: 'count, plural form other', en: '{N} airports', fr: '{N} aéroports', es: '{N} aeropuertos', de: '{N} Flughäfen', it: '{N} aeroporti', pt: '{N} aeroportos', ja: '{N}空港', zh: '{N} 个机场', ar: 'المطارات: {N}' },
    homeRegionPaused: { $ctx: 'after a name', en: '{CITY} paused', fr: '{CITY} en pause', es: '{CITY} en pausa', de: '{CITY} pausiert', it: '{CITY} in pausa', pt: '{CITY} em pausa', ja: '{CITY}は一時停止中', zh: '{CITY}已暂停', ar: '{CITY} متوقف مؤقتًا' },
    homeNoteHome: { en: 'Moncton, home base and the first airport', fr: 'Moncton, port d’attache et premier aéroport', es: 'Moncton, sede y primer aeropuerto', de: 'Moncton, Heimatbasis und erster Flughafen', it: 'Moncton, sede e primo aeroporto', pt: 'Moncton, sede e primeiro aeroporto', ja: 'モンクトン：拠点であり、最初の空港', zh: '蒙克顿：大本营，也是第一个机场', ar: 'مونكتون: المقر وأول مطار' },
    homeNotePaused: { en: '{CITY} is temporarily paused', fr: '{CITY} est temporairement en pause', es: '{CITY} está en pausa temporalmente', de: '{CITY} ist vorübergehend pausiert', it: '{CITY} è temporaneamente in pausa', pt: '{CITY} está temporariamente em pausa', ja: '{CITY}は一時停止中です', zh: '{CITY}暂时停用', ar: '{CITY} متوقف مؤقتًا حاليًا' },
    homeKickLangs: { en: 'The languages', fr: 'Les langues', es: 'Los idiomas', de: 'Die Sprachen', it: 'Le lingue', pt: 'As línguas', ja: '言語', zh: '语言', ar: 'اللغات' },
    homeLangsTitle: { en: 'Nine languages, two at a time.', fr: 'Neuf langues, deux à la fois.', es: 'Nueve idiomas, dos a la vez.', de: 'Neun Sprachen, zwei auf einmal.', it: 'Nove lingue, due alla volta.', pt: 'Nove línguas, duas de cada vez.', ja: '9つの言語を、2つずつ。', zh: '九种语言，一次两种。', ar: 'تسع لغات، اثنتان في كل مرة.' },
    homeLangsLead: { en: 'Every board can speak all nine. It shows two at once, with the airport’s own pair first: in Moncton, English and French (Fig. 1).', fr: 'Chaque tableau peut parler les neuf. Il en affiche deux à la fois, la paire de l’aéroport en premier : à Moncton, l’anglais et le français (figure 1).', es: 'Cada panel puede hablar los nueve. Muestra dos a la vez, primero la pareja propia del aeropuerto: en Moncton, inglés y francés (figura 1).', de: 'Jede Anzeige beherrscht alle neun. Sie zeigt zwei gleichzeitig, das Sprachpaar des Flughafens zuerst: in Moncton Englisch und Französisch (Abb. 1).', it: 'Ogni tabellone può parlarle tutte e nove. Ne mostra due alla volta, prima la coppia dell’aeroporto: a Moncton inglese e francese (immagine 1).', pt: 'Cada painel pode falar as nove. Mostra duas de cada vez, primeiro o par do próprio aeroporto: em Moncton, inglês e francês (imagem 1).', ja: 'どの案内表示も9言語すべてに対応。一度に2言語を表示し、空港ごとの組み合わせを先に出します。モンクトンなら英語とフランス語（図1）。', zh: '每块屏幕都能使用全部九种语言。一次显示两种，机场自己的语言组合在前：在蒙克顿是英语和法语（图1）。', ar: 'تتحدث كل لوحة اللغات التسع كلها. وتعرض لغتين في آن واحد، تبدأ بلغتي المطار نفسه: في مونكتون الإنجليزية والفرنسية (الشكل 1).' },
    // {WORD} is the boards' own 'Departures' (appDep) in the page's language
    homeLangsAria: { en: 'How each board writes “{WORD}”', fr: 'Comment chaque tableau écrit « {WORD} »', es: 'Cómo escribe cada panel «{WORD}»', de: 'Wie jede Anzeige „{WORD}“ schreibt', it: 'Come ogni tabellone scrive «{WORD}»', pt: 'Como cada painel escreve “{WORD}”', ja: '各案内表示での「{WORD}」の表記', zh: '每块屏幕上“{WORD}”的写法', ar: 'كيف تكتب كل لوحة «{WORD}»' },
    homeKickApp: { en: 'The phone app', fr: 'L’application mobile', es: 'La aplicación móvil', de: 'Die Handy-App', it: 'L’applicazione mobile', pt: 'O aplicativo para celular', ja: 'スマホアプリ', zh: '手机应用', ar: 'تطبيق الهاتف' },
    homeAppTitle: { en: 'The same flights, in your pocket.', fr: 'Les mêmes vols, dans votre poche.', es: 'Los mismos vuelos, en tu bolsillo.', de: 'Dieselben Flüge, in Ihrer Tasche.', it: 'Gli stessi voli, in tasca.', pt: 'Os mesmos voos, no seu bolso.', ja: '同じフライト情報を、ポケットに。', zh: '同样的航班，尽在掌中。', ar: 'الرحلات نفسها، في جيبك.' },
    homeAppLead: { en: 'The phone app shows the boards’ own live flights. Search by flight number or by city, and switch between departures and arrivals.', fr: 'L’application mobile affiche les vols en direct des tableaux. Cherchez par numéro de vol ou par ville, et passez des départs aux arrivées.', es: 'La aplicación móvil muestra los vuelos en vivo de los paneles. Busca por número de vuelo o por ciudad, y cambia entre salidas y llegadas.', de: 'Die Handy-App zeigt die Live-Flüge der Anzeigen. Suchen Sie nach Flugnummer oder Stadt und wechseln Sie zwischen Abflügen und Ankünften.', it: 'L’applicazione mobile mostra i voli in diretta dei tabelloni. Cerca per numero di volo o per città, e passa dalle partenze agli arrivi.', pt: 'O aplicativo para celular mostra os voos ao vivo dos painéis. Pesquise por número do voo ou por cidade e alterne entre partidas e chegadas.', ja: 'スマホアプリでは、案内表示と同じフライトをライブで確認できます。便名や都市名で検索し、出発と到着を切り替えられます。', zh: '手机应用显示与航班屏相同的实时航班。可按航班号或城市搜索，并在出发和到达之间切换。', ar: 'يعرض تطبيق الهاتف الرحلات نفسها التي تعرضها اللوحات، بالوقت الفعلي. ابحث برقم الرحلة أو بالمدينة، وبدّل بين المغادرة والوصول.' },
    homeAppF1: { en: 'The boards’ own live flights', fr: 'Les vols en direct des tableaux', es: 'Los vuelos en vivo de los paneles', de: 'Die Live-Flüge der Anzeigen', it: 'I voli in diretta dei tabelloni', pt: 'Os voos ao vivo dos painéis', ja: '案内表示と同じライブのフライト情報', zh: '与航班屏相同的实时航班', ar: 'الرحلات نفسها التي تعرضها اللوحات، بالوقت الفعلي' },
    homeAppF2: { en: 'Search by flight or by city', fr: 'Recherche par vol ou par ville', es: 'Búsqueda por vuelo o por ciudad', de: 'Suche nach Flug oder Stadt', it: 'Ricerca per volo o per città', pt: 'Busca por voo ou por cidade', ja: '便名や都市名で検索', zh: '按航班或城市搜索', ar: 'البحث بالرحلة أو بالمدينة' },
    homeAppF3: { en: 'Departures and arrivals, airport by airport', fr: 'Départs et arrivées, aéroport par aéroport', es: 'Salidas y llegadas, aeropuerto por aeropuerto', de: 'Abflüge und Ankünfte, Flughafen für Flughafen', it: 'Partenze e arrivi, aeroporto per aeroporto', pt: 'Partidas e chegadas, aeroporto por aeroporto', ja: '空港ごとの出発便と到着便', zh: '逐个机场的出发与到达', ar: 'المغادرة والوصول، مطارًا تلو الآخر' },
    homeAltApp: { en: 'The phone app at Portland (PDX): a search box for a flight number or a city, and live departures on Alaska Airlines and Southwest to San Diego, Sacramento, Long Beach, Vancouver and Spokane, two of them delayed.', fr: 'L’application mobile à Portland (PDX) : une boîte de recherche par numéro de vol ou par ville, et les départs en direct d’Alaska Airlines et de Southwest vers San Diego, Sacramento, Long Beach, Vancouver et Spokane, dont deux en retard.', es: 'La aplicación móvil en Portland (PDX): un cuadro de búsqueda por número de vuelo o ciudad, y las salidas en vivo de Alaska Airlines y Southwest a San Diego, Sacramento, Long Beach, Vancouver y Spokane, dos de ellas con retraso.', de: 'Die Handy-App in Portland (PDX): ein Suchfeld für Flugnummer oder Stadt und Live-Abflüge von Alaska Airlines und Southwest nach San Diego, Sacramento, Long Beach, Vancouver und Spokane, zwei davon verspätet.', it: 'L’applicazione mobile a Portland (PDX): una casella di ricerca per numero di volo o città, e le partenze in diretta di Alaska Airlines e Southwest per San Diego, Sacramento, Long Beach, Vancouver e Spokane, due delle quali in ritardo.', pt: 'O aplicativo para celular em Portland (PDX): uma caixa de busca por número do voo ou cidade, e as partidas ao vivo da Alaska Airlines e da Southwest para San Diego, Sacramento, Long Beach, Vancouver e Spokane, duas delas atrasadas.', ja: 'ポートランド（PDX）のスマホアプリ。便名や都市名の検索欄と、アラスカ航空とサウスウエスト航空のサンディエゴ、サクラメント、ロングビーチ、バンクーバー、スポケーン行きのライブ出発情報（うち2便は遅延）。', zh: '波特兰（PDX）的手机应用：可按航班号或城市搜索，并显示阿拉斯加航空和西南航空飞往圣迭戈、萨克拉门托、长滩、温哥华和斯波坎的实时出发航班，其中两个航班延误。', ar: 'تطبيق الهاتف في مطار بورتلاند (PDX): مربع بحث برقم الرحلة أو المدينة، ورحلات المغادرة بالوقت الفعلي لخطوط ألاسكا الجوية وساوث ويست إلى سان دييغو وساكرامنتو ولونغ بيتش وفانكوفر وسبوكان، اثنتان منها متأخرتان.' },
    homeCapApp: { en: 'Departures at Portland (PDX), on a phone.', fr: 'Les départs à Portland (PDX), sur un téléphone.', es: 'Salidas en Portland (PDX), en un teléfono.', de: 'Abflüge in Portland (PDX), auf dem Handy.', it: 'Partenze a Portland (PDX), su un telefono.', pt: 'Partidas em Portland (PDX), em um celular.', ja: 'ポートランド（PDX）の出発情報をスマホで。', zh: '在手机上查看波特兰（PDX）的出发航班。', ar: 'المغادرات في بورتلاند (PDX)، على الهاتف.' },
    homeKickStream: { en: 'The live stream', fr: 'La diffusion en direct', es: 'La transmisión en vivo', de: 'Der Livestream', it: 'La diretta streaming', pt: 'A transmissão ao vivo', ja: 'ライブ配信', zh: '直播', ar: 'البث المباشر' },
    homeStreamTitle: { en: 'Live, around the clock.', fr: 'En direct, jour et nuit.', es: 'En vivo, las 24 horas.', de: 'Live, rund um die Uhr.', it: 'In diretta, giorno e notte.', pt: 'Ao vivo, 24 horas por dia.', ja: '24時間、休まず配信中。', zh: '全天候直播。', ar: 'بثّ مباشر على مدار الساعة.' },
    homeStreamLead: { en: 'A live stream on YouTube tours the boards of airports around the world, day and night, every day.', fr: 'Une diffusion en direct sur YouTube parcourt les tableaux d’aéroports du monde entier, jour et nuit, tous les jours.', es: 'Una transmisión en vivo en YouTube recorre los paneles de aeropuertos de todo el mundo, de día y de noche, todos los días.', de: 'Ein Livestream auf YouTube zeigt reihum die Anzeigen von Flughäfen in aller Welt, Tag und Nacht, jeden Tag.', it: 'Una diretta streaming su YouTube fa il giro dei tabelloni degli aeroporti di tutto il mondo, giorno e notte, tutti i giorni.', pt: 'Uma transmissão ao vivo no YouTube percorre os painéis de aeroportos do mundo todo, dia e noite, todos os dias.', ja: 'YouTubeのライブ配信で、世界各地の空港の案内表示を昼も夜も、毎日巡回しています。', zh: 'YouTube 上的直播轮流展示世界各地机场的航班屏，日夜不停，每天如此。', ar: 'بثّ مباشر على YouTube يتنقّل بين لوحات مطارات حول العالم، ليلًا ونهارًا، كل يوم.' },
    homeHours: { en: 'Hours', fr: 'Horaire', es: 'Horario', de: 'Sendezeit', it: 'Orari', pt: 'Horário', ja: '配信時間', zh: '时间', ar: 'المواعيد' },
    homeShowing: { en: 'Showing', fr: 'À l’affiche', es: 'Contenido', de: 'Programm', it: 'In programma', pt: 'Programação', ja: '配信内容', zh: '节目内容', ar: 'المحتوى' },
    homeShowingWhat: { en: 'Live boards, airport to airport', fr: 'Des tableaux en direct, d’un aéroport à l’autre', es: 'Paneles en vivo, de aeropuerto en aeropuerto', de: 'Live-Anzeigen, von Flughafen zu Flughafen', it: 'Tabelloni in diretta, da un aeroporto all’altro', pt: 'Painéis ao vivo, de aeroporto em aeroporto', ja: '空港から空港へ、ライブの案内表示', zh: '实时航班屏，一个机场接一个机场', ar: 'لوحات مباشرة، من مطار إلى آخر' },
    homeWhere: { en: 'Where', fr: 'Où', es: 'Dónde', de: 'Wo', it: 'Dove', pt: 'Onde', ja: '配信先', zh: '平台', ar: 'أين' },
    homeOnYoutube: { en: 'On YouTube', fr: 'Sur YouTube', es: 'En YouTube', de: 'Auf YouTube', it: 'Su YouTube', pt: 'No YouTube', ja: 'YouTubeで配信', zh: '在 YouTube 上', ar: 'على YouTube' },
    homeWatchYt: { en: 'Watch on YouTube', fr: 'Regarder sur YouTube', es: 'Ver en YouTube', de: 'Auf YouTube ansehen', it: 'Guarda su YouTube', pt: 'Assistir no YouTube', ja: 'YouTubeで見る', zh: '在 YouTube 上观看', ar: 'شاهد على YouTube' },
    homeWatchAria: { en: 'Watch the live stream on YouTube', fr: 'Regarder la diffusion en direct sur YouTube', es: 'Ver la transmisión en vivo en YouTube', de: 'Den Livestream auf YouTube ansehen', it: 'Guarda la diretta streaming su YouTube', pt: 'Assistir à transmissão ao vivo no YouTube', ja: 'YouTubeでライブ配信を見る', zh: '在 YouTube 上观看直播', ar: 'شاهد البث المباشر على YouTube' },
    // the stream's on-air chip (the boards' own 'Live' is a data state)
    homeOnAir: { $ctx: 'a stream on air', en: 'Live', fr: 'En direct', es: 'En vivo', de: 'Live', it: 'In diretta', pt: 'Ao vivo', ja: 'ライブ配信中', zh: '直播中', ar: 'مباشر' },
    homeWatchLive: { en: 'Watch live', fr: 'Regarder en direct', es: 'Ver en vivo', de: 'Live ansehen', it: 'Guarda in diretta', pt: 'Assistir ao vivo', ja: 'ライブで見る', zh: '观看直播', ar: 'شاهد مباشرةً' },
    homeCapStream: { en: 'The stream moves from board to board, airport to airport.', fr: 'La diffusion passe d’un tableau à l’autre, d’un aéroport à l’autre.', es: 'La transmisión pasa de panel en panel, de aeropuerto en aeropuerto.', de: 'Der Livestream wandert von Anzeige zu Anzeige, von Flughafen zu Flughafen.', it: 'La diretta passa da un tabellone all’altro, da un aeroporto all’altro.', pt: 'A transmissão passa de painel em painel, de aeroporto em aeroporto.', ja: '配信は案内表示から案内表示へ、空港から空港へと巡ります。', zh: '直播从一块屏幕切换到另一块，从一个机场到另一个机场。', ar: 'ينتقل البث من لوحة إلى لوحة، ومن مطار إلى مطار.' },
    homeFootNav: { en: 'Footer', fr: 'Pied de page', es: 'Pie de página', de: 'Fußzeile', it: 'Piè di pagina', pt: 'Rodapé', ja: 'フッター', zh: '页脚', ar: 'تذييل الصفحة' },
    homeFootBoards: { en: 'The boards', fr: 'Les tableaux', es: 'Los paneles', de: 'Die Anzeigen', it: 'I tabelloni', pt: 'Os painéis', ja: '案内表示', zh: '航班屏', ar: 'اللوحات' },
    homeFootContact: { en: 'Contact', fr: 'Nous joindre', es: 'Contacto', de: 'Kontakt', it: 'Contatti', pt: 'Contato', ja: 'お問い合わせ', zh: '联系方式', ar: 'التواصل' },
    homeFootStream: { en: 'Live stream on YouTube', fr: 'Diffusion en direct sur YouTube', es: 'Transmisión en vivo en YouTube', de: 'Livestream auf YouTube', it: 'Diretta streaming su YouTube', pt: 'Transmissão ao vivo no YouTube', ja: 'YouTubeでライブ配信', zh: 'YouTube 直播', ar: 'البث المباشر على YouTube' },
    homeCredWx: { en: 'Weather from MET Norway', fr: 'Météo : MET Norway', es: 'Clima: MET Norway', de: 'Wetter: MET Norway', it: 'Meteo: MET Norway', pt: 'Clima: MET Norway', ja: '天気：MET Norway', zh: '天气：MET Norway', ar: 'الطقس: MET Norway' },
    homeCredMap: { en: 'Maps © OpenStreetMap contributors', fr: 'Cartes © les contributeurs d’OpenStreetMap', es: 'Mapas © colaboradores de OpenStreetMap', de: 'Karten © OpenStreetMap-Mitwirkende', it: 'Mappe © contributori di OpenStreetMap', pt: 'Mapas © colaboradores do OpenStreetMap', ja: '地図 © OpenStreetMap 協力者', zh: '地图 © OpenStreetMap 贡献者', ar: 'الخرائط © المساهمون في OpenStreetMap' },
    homeCredAerial: { en: 'Aerial photo: GeoNB, Open Government Licence – New Brunswick', fr: 'Photo aérienne : GeoNB, Licence du gouvernement ouvert — Nouveau‑Brunswick', es: 'Foto aérea: GeoNB, Licencia de Gobierno Abierto – Nuevo Brunswick', de: 'Luftbild: GeoNB, Open-Government-Lizenz – New Brunswick', it: 'Foto aerea: GeoNB, Licenza di governo aperto – Nuovo Brunswick', pt: 'Foto aérea: GeoNB, Licença de Governo Aberto – Novo Brunswick', ja: '航空写真：GeoNB、ニューブランズウィック州オープンガバメントライセンス', zh: '航拍照片：GeoNB，新不伦瑞克省开放政府许可证', ar: 'صورة جوية: GeoNB، ترخيص الحكومة المفتوحة – نيو برونزويك' },
    homeFootPlace: { en: 'Orion Connected · Moncton, New Brunswick, Canada', fr: 'Orion Connected · Moncton (Nouveau‑Brunswick), Canada', es: 'Orion Connected · Moncton, Nuevo Brunswick, Canadá', de: 'Orion Connected · Moncton, New Brunswick, Kanada', it: 'Orion Connected · Moncton, Nuovo Brunswick, Canada', pt: 'Orion Connected · Moncton, Novo Brunswick, Canadá', ja: 'Orion Connected · カナダ、ニューブランズウィック州モンクトン', zh: 'Orion Connected · 加拿大新不伦瑞克省蒙克顿', ar: 'Orion Connected · مونكتون، نيو برونزويك، كندا' },
    // credits.html — each credit in the wording its licence asks for; the
    // boards' own credit lines (wxCredit, mapCreditOglNb) are quoted as they are
    credDocTitle: { en: 'Credits & Contact · Orion Connected', fr: 'Crédits et coordonnées · Orion Connected', es: 'Créditos y contacto · Orion Connected', de: 'Nachweise & Kontakt · Orion Connected', it: 'Crediti e contatti · Orion Connected', pt: 'Créditos e contato · Orion Connected', ja: 'クレジット・お問い合わせ · Orion Connected', zh: '致谢与联系方式 · Orion Connected', ar: 'المصادر والتواصل · Orion Connected' },
    credLead: { en: 'The boards are built on other people’s work: weather, maps, an aerial photo, photographs, a 3D model, icons and typefaces. Each is credited below, in the words its licence asks for.', fr: 'Les tableaux reposent sur le travail d’autres personnes : météo, cartes, photo aérienne, photographies, modèle 3D, icônes et polices de caractères. Chacun est mentionné ci-dessous, dans les termes que demande sa licence.', es: 'Los paneles se apoyan en el trabajo de otras personas: el clima, los mapas, una foto aérea, fotografías, un modelo 3D, iconos y tipografías. Cada uno se acredita a continuación, en los términos que pide su licencia.', de: 'Die Anzeigen beruhen auf der Arbeit anderer: Wetter, Karten, ein Luftbild, Fotografien, ein 3D-Modell, Symbole und Schriften. Jede Quelle wird unten so genannt, wie es ihre Lizenz verlangt.', it: 'I tabelloni si basano sul lavoro di altre persone: meteo, mappe, una foto aerea, fotografie, un modello 3D, icone e caratteri tipografici. Ognuno è citato qui sotto, nei termini richiesti dalla sua licenza.', pt: 'Os painéis se apoiam no trabalho de outras pessoas: clima, mapas, uma foto aérea, fotografias, um modelo 3D, ícones e fontes tipográficas. Cada um recebe o crédito abaixo, nos termos que a sua licença pede.', ja: '案内表示は、多くの人の仕事に支えられています。気象データ、地図、航空写真、写真、3Dモデル、アイコン、書体。それぞれのライセンスに従い、以下にクレジットを記します。', zh: '这些航班屏建立在他人的成果之上：天气、地图、航拍照片、照片、3D 模型、图标和字体。下面按各自许可证的要求一一致谢。', ar: 'تقوم اللوحات على عمل آخرين: بيانات الطقس، والخرائط، وصورة جوية، وصور فوتوغرافية، ونموذج ثلاثي الأبعاد، وأيقونات، وخطوط. ويُذكر كلٌّ منها أدناه كما تطلب رخصته.' },
    credContactText: { en: 'For questions, corrections or anything else about the boards, write to', fr: 'Pour toute question, correction ou autre sujet concernant les tableaux, écrivez à', es: 'Para preguntas, correcciones o cualquier otra cosa sobre los paneles, escribe a', de: 'Für Fragen, Korrekturen oder alles andere zu den Anzeigen schreiben Sie an', it: 'Per domande, correzioni o qualsiasi altra cosa sui tabelloni, scrivi a', pt: 'Para dúvidas, correções ou qualquer outro assunto sobre os painéis, escreva para', ja: '案内表示についてのご質問、訂正のご連絡、その他のお問い合わせは、こちらまでメールでどうぞ：', zh: '如对航班屏有疑问、更正或其他任何事宜，请发邮件至', ar: 'للأسئلة أو التصحيحات أو أي أمر آخر يخص اللوحات، اكتب إلى' },
    credCreditsH: { en: 'Credits', fr: 'Crédits', es: 'Créditos', de: 'Nachweise', it: 'Crediti', pt: 'Créditos', ja: 'クレジット', zh: '致谢', ar: 'المصادر' },
    credWeatherH: { en: 'Weather', fr: 'Météo', es: 'Clima', de: 'Wetter', it: 'Meteo', pt: 'Clima', ja: '天気', zh: '天气', ar: 'الطقس' },
    credMet: { en: 'Forecasts and sunrise and sunset times come from the Norwegian Meteorological Institute (MET Norway), under the Norwegian Licence for Open Government Data (NLOD) 2.0 and CC BY 4.0. The boards carry the credit it asks for:', fr: 'Les prévisions et les heures de lever et de coucher du soleil proviennent de l’Institut météorologique norvégien (MET Norway), sous la Licence norvégienne pour les données publiques ouvertes (NLOD) 2.0 et la licence CC BY 4.0. Les tableaux portent la mention qu’il demande :', es: 'Las previsiones y las horas de salida y puesta del sol proceden del Instituto Meteorológico de Noruega (MET Norway), bajo la Licencia Noruega de Datos Públicos Abiertos (NLOD) 2.0 y la licencia CC BY 4.0. Los paneles llevan el crédito que pide:', de: 'Vorhersagen sowie Sonnenauf- und -untergangszeiten stammen vom Norwegischen Meteorologischen Institut (MET Norway), unter der Norwegischen Lizenz für offene Verwaltungsdaten (NLOD) 2.0 und CC BY 4.0 (Namensnennung). Die Anzeigen tragen den gewünschten Hinweis:', it: 'Le previsioni e gli orari di alba e tramonto provengono dall’Istituto meteorologico norvegese (MET Norway), con la Licenza norvegese per i dati pubblici aperti (NLOD) 2.0 e la licenza CC BY 4.0 (Attribuzione). I tabelloni riportano la dicitura richiesta:', pt: 'As previsões e os horários do nascer e do pôr do sol vêm do Instituto Meteorológico da Noruega (MET Norway), sob a Licença Norueguesa de Dados Públicos Abertos (NLOD) 2.0 e a licença CC BY 4.0 (Atribuição). Os painéis exibem o crédito que ele pede:', ja: '予報と日の出・日の入りの時刻は、ノルウェー気象研究所（MET Norway）のデータを、ノルウェー公開政府データライセンス（NLOD）2.0およびクリエイティブ・コモンズ 表示 4.0のもとで利用しています。案内表示には、求められている次のクレジットを表示しています：', zh: '天气预报以及日出、日落时间来自挪威气象研究所（MET Norway），依据挪威开放政府数据许可证（NLOD）2.0 和知识共享署名 4.0 许可协议使用。航班屏上显示其要求的致谢：', ar: 'تأتي التوقعات وأوقات الشروق والغروب من المعهد النرويجي للأرصاد الجوية (MET Norway)، بموجب الترخيص النرويجي للبيانات الحكومية المفتوحة (NLOD) 2.0 وترخيص المشاع الإبداعي نَسب المصنَّف 4.0. وتعرض اللوحات الإشارة التي يطلبها:' },
    credMapsH: { en: 'Maps', fr: 'Cartes', es: 'Mapas', de: 'Karten', it: 'Mappe', pt: 'Mapas', ja: '地図', zh: '地图', ar: 'الخرائط' },
    credOsm: { en: 'The street map on the gate screens, and the stands and gates drawn on it, come from OpenStreetMap. Its data is available under the Open Database License (ODbL).', fr: 'Le plan des rues des écrans de porte, et les postes de stationnement et les portes qui y figurent, proviennent d’OpenStreetMap. Ses données sont disponibles sous licence ODbL.', es: 'El mapa de calles de las pantallas de puerta, y las posiciones y puertas dibujadas en él, proceden de OpenStreetMap. Sus datos están disponibles bajo la licencia ODbL.', de: 'Der Stadtplan auf den Gate-Bildschirmen und die darauf eingezeichneten Abstellpositionen und Flugsteige stammen von OpenStreetMap. Die Daten stehen unter der Lizenz ODbL.', it: 'La mappa stradale degli schermi dei gate, con le piazzole e i gate disegnati sopra, proviene da OpenStreetMap. I dati sono disponibili con la licenza ODbL.', pt: 'O mapa de ruas das telas de portão, com as posições e os portões desenhados nele, vem do OpenStreetMap. Os dados estão disponíveis sob a licença ODbL.', ja: '搭乗口画面の地図と、そこに描かれた駐機場や搭乗口は、OpenStreetMapのデータです。データはODbLライセンスのもとで公開されています。', zh: '登机口屏上的街道地图，以及图上绘制的机位和登机口，均来自 OpenStreetMap。其数据依据开放数据库许可协议（ODbL）提供。', ar: 'خريطة الشوارع على شاشات البوابات، ومواقف الطائرات والبوابات المرسومة عليها، مصدرها OpenStreetMap. وبياناتها متاحة بموجب رخصة قاعدة البيانات المفتوحة (ODbL).' },
    credOsmLine: { en: '© OpenStreetMap contributors', fr: '© les contributeurs d’OpenStreetMap', es: '© colaboradores de OpenStreetMap', de: '© OpenStreetMap-Mitwirkende', it: '© contributori di OpenStreetMap', pt: '© colaboradores do OpenStreetMap', ja: '© OpenStreetMap 協力者', zh: '© OpenStreetMap 贡献者', ar: '© المساهمون في OpenStreetMap' },
    credAerialH: { en: 'Aerial photo', fr: 'Photo aérienne', es: 'Foto aérea', de: 'Luftbild', it: 'Foto aerea', pt: 'Foto aérea', ja: '航空写真', zh: '航拍照片', ar: 'صورة جوية' },
    credGeonb: { en: 'The aerial photo of Moncton’s airport under its gate maps is GeoNB’s 2021 imagery of New Brunswick, with the aircraft parked that day painted out.', fr: 'La photo aérienne de l’aéroport de Moncton, sous ses cartes de porte, est l’imagerie 2021 du Nouveau‑Brunswick de GeoNB, dont on a effacé les avions stationnés ce jour-là.', es: 'La foto aérea del aeropuerto de Moncton bajo sus mapas de puerta es la imagen de 2021 de Nuevo Brunswick de GeoNB, con los aviones estacionados ese día borrados.', de: 'Das Luftbild des Flughafens Moncton unter den Gate-Karten stammt aus den Aufnahmen von New Brunswick, die GeoNB 2021 gemacht hat; die an jenem Tag abgestellten Flugzeuge wurden wegretuschiert.', it: 'La foto aerea dell’aeroporto di Moncton sotto le mappe dei gate è l’immagine 2021 del Nuovo Brunswick di GeoNB, da cui sono stati cancellati gli aerei parcheggiati quel giorno.', pt: 'A foto aérea do aeroporto de Moncton sob os mapas de portão é a imagem de 2021 de Novo Brunswick feita pelo GeoNB, com os aviões estacionados naquele dia apagados.', ja: 'モンクトン空港の搭乗口マップの下に敷いた航空写真は、GeoNBによる2021年のニューブランズウィック州の画像で、その日に駐機していた航空機を消しています。', zh: '蒙克顿机场登机口地图下方的航拍照片，是 GeoNB 于 2021 年拍摄的新不伦瑞克省影像，已抹去当天停放的飞机。', ar: 'الصورة الجوية لمطار مونكتون تحت خرائط بواباته هي صور GeoNB لنيو برونزويك لعام 2021، بعد محو الطائرات التي كانت متوقفة ذلك اليوم.' },
    credPhotosH: { en: 'Photographs', fr: 'Photographies', es: 'Fotografías', de: 'Fotos', it: 'Fotografie', pt: 'Fotografias', ja: '写真', zh: '照片', ar: 'الصور' },
    credOpenverse: { en: 'When a gate screen shows a photograph of a city from Openverse under a CC BY licence, the photographer is named on the screen, beside the photograph.', fr: 'Quand un écran de porte affiche une photo de ville tirée d’Openverse sous licence CC BY, le nom du photographe figure à l’écran, à côté de la photo.', es: 'Cuando una pantalla de puerta muestra una fotografía de una ciudad de Openverse con licencia CC BY, el nombre del fotógrafo aparece en la pantalla, junto a la foto.', de: 'Zeigt ein Gate-Bildschirm ein Stadtfoto von Openverse unter der Lizenz CC BY (Namensnennung), wird der Name des Fotografen auf dem Bildschirm neben dem Foto genannt.', it: 'Quando uno schermo del gate mostra la fotografia di una città presa da Openverse con licenza CC BY (Attribuzione), il nome del fotografo compare sullo schermo, accanto alla foto.', pt: 'Quando uma tela de portão mostra uma fotografia de uma cidade vinda do Openverse sob licença CC BY (Atribuição), o nome do fotógrafo aparece na tela, ao lado da foto.', ja: '搭乗口画面に、クリエイティブ・コモンズ 表示ライセンスのもとでOpenverseから取得した都市の写真を表示するときは、写真の横に撮影者の名前を表示します。', zh: '当登机口屏显示来自 Openverse、以知识共享署名许可协议授权的城市照片时，会在屏幕上照片旁注明摄影师。', ar: 'عندما تعرض شاشة بوابة صورة لمدينة من Openverse بترخيص المشاع الإبداعي نَسب المصنَّف، يُذكر اسم المصوّر على الشاشة بجانب الصورة.' },
    cred3dH: { en: '3D model', fr: 'Modèle 3D', es: 'Modelo 3D', de: '3D-Modell', it: 'Modello 3D', pt: 'Modelo 3D', ja: '3Dモデル', zh: '3D 模型', ar: 'نموذج ثلاثي الأبعاد' },
    // {KICKER} is the card's own title (heritageKicker)
    credModel: { en: 'The Air Canada Boeing 767 on the “{KICKER}” card is rendered from the 3D model “{TITLE}” by {AUTHOR} on Sketchfab, under CC BY 4.0. It was turned into a still picture, and its landing gear was removed.', fr: 'Le Boeing 767 d’Air Canada de la carte « {KICKER} » est rendu à partir du modèle 3D « {TITLE} » de {AUTHOR} sur Sketchfab, sous licence CC BY 4.0. On en a tiré une vue fixe et retiré le train d’atterrissage.', es: 'El Boeing 767 de Air Canada de la tarjeta «{KICKER}» está generado a partir del modelo 3D «{TITLE}» de {AUTHOR} en Sketchfab, con licencia CC BY 4.0. Se convirtió en una imagen fija y se le quitó el tren de aterrizaje.', de: 'Die Boeing 767 von Air Canada auf der Karte „{KICKER}“ ist aus dem 3D-Modell „{TITLE}“ von {AUTHOR} auf Sketchfab gerendert, unter der Lizenz CC BY 4.0. Es wurde zu einem Standbild umgewandelt, das Fahrwerk wurde entfernt.', it: 'Il Boeing 767 di Air Canada nella scheda «{KICKER}» è ricavato dal modello 3D «{TITLE}» di {AUTHOR} su Sketchfab, con licenza CC BY 4.0. È stato trasformato in un’immagine fissa e il carrello di atterraggio è stato rimosso.', pt: 'O Boeing 767 da Air Canada no cartão “{KICKER}” foi gerado a partir do modelo 3D “{TITLE}” de {AUTHOR} no Sketchfab, sob a licença CC BY 4.0. Foi transformado em imagem estática e o trem de pouso foi removido.', ja: '「{KICKER}」カードのエア・カナダのボーイング767は、Sketchfab上の{AUTHOR}による3Dモデル「{TITLE}」（クリエイティブ・コモンズ 表示 4.0）から描き出したものです。静止画にし、着陸装置を取り除いています。', zh: '“{KICKER}”卡片上的加航波音 767，渲染自 {AUTHOR} 在 Sketchfab 上发布的 3D 模型“{TITLE}”，依据知识共享署名 4.0 许可协议使用。已转为静态图片，并去除了起落架。', ar: 'طائرة بوينغ 767 التابعة لشركة Air Canada في بطاقة «{KICKER}» مأخوذة من النموذج ثلاثي الأبعاد «{TITLE}» الذي نشره {AUTHOR} على Sketchfab، بموجب ترخيص المشاع الإبداعي نَسب المصنَّف 4.0. وقد حُوّلت إلى صورة ثابتة وأُزيلت عجلات الهبوط.' },
    credIconsH: { en: 'Icons', fr: 'Icônes', es: 'Iconos', de: 'Symbole', it: 'Icone', pt: 'Ícones', ja: 'アイコン', zh: '图标', ar: 'الأيقونات' },
    credIcons: { en: 'Some of the boards’ pictograms are Material Symbols by Google, under the Apache License 2.0.', fr: 'Certains pictogrammes des tableaux sont des Material Symbols de Google, sous licence Apache 2.0.', es: 'Algunos pictogramas de los paneles son Material Symbols de Google, con la licencia Apache 2.0.', de: 'Einige Piktogramme der Anzeigen sind Material Symbols von Google, unter der Apache-Lizenz 2.0.', it: 'Alcuni pittogrammi dei tabelloni sono Material Symbols di Google, con licenza Apache 2.0.', pt: 'Alguns pictogramas dos painéis são Material Symbols do Google, sob a licença Apache 2.0.', ja: '案内表示のピクトグラムの一部には、GoogleのMaterial Symbols（Apache License 2.0）を使用しています。', zh: '航班屏上的部分图形符号采用 Google 的 Material Symbols，依据 Apache 2.0 许可证使用。', ar: 'بعض الرموز التصويرية في اللوحات من Material Symbols من Google، بموجب ترخيص Apache 2.0.' },
    // logos/weather/animated/ (its licence: LICENSE-MIT.txt beside the icons)
    credMeteocons: { en: 'The animated weather icons are Meteocons by Bas Milius, under the MIT License.', fr: 'Les icônes météo animées sont les Meteocons de Bas Milius, sous licence MIT.', es: 'Los iconos animados del tiempo son Meteocons de Bas Milius, con la licencia MIT.', de: 'Die animierten Wettersymbole sind Meteocons von Bas Milius, unter der MIT-Lizenz.', it: 'Le icone meteo animate sono Meteocons di Bas Milius, con licenza MIT.', pt: 'Os ícones animados do tempo são Meteocons de Bas Milius, sob a licença MIT.', ja: 'アニメーションの天気アイコンには、Bas MiliusのMeteocons（MITライセンス）を使用しています。', zh: '动态天气图标采用 Bas Milius 的 Meteocons，依据 MIT 许可证使用。', ar: 'أيقونات الطقس المتحركة من Meteocons من تصميم Bas Milius، بموجب ترخيص MIT.' },
    credFontsH: { en: 'Typefaces', fr: 'Polices de caractères', es: 'Tipografías', de: 'Schriften', it: 'Caratteri tipografici', pt: 'Fontes tipográficas', ja: '書体', zh: '字体', ar: 'الخطوط' },
    credPossibility: { en: 'Headlines are set in the Possibility typeface by Matthew Reynolds.', fr: 'Les titres sont composés en Possibility, un caractère de Matthew Reynolds.', es: 'Los titulares usan la tipografía Possibility de Matthew Reynolds.', de: 'Überschriften sind in der Schrift Possibility von Matthew Reynolds gesetzt.', it: 'I titoli sono composti nel carattere Possibility di Matthew Reynolds.', pt: 'Os títulos usam a fonte Possibility, de Matthew Reynolds.', ja: '見出しには、Matthew ReynoldsによるPossibility書体を使っています。', zh: '标题使用 Matthew Reynolds 设计的 Possibility 字体。', ar: 'العناوين مكتوبة بخط Possibility من تصميم Matthew Reynolds.' },
    credBricolage: { en: 'Everything else is set in Bricolage Grotesque, by Mathieu Triay and the Bricolage Grotesque Project Authors, under the SIL Open Font License 1.1.', fr: 'Tout le reste est composé en Bricolage Grotesque, de Mathieu Triay et des auteurs du projet Bricolage Grotesque, sous licence SIL OFL 1.1.', es: 'Todo lo demás usa Bricolage Grotesque, de Mathieu Triay y los autores del proyecto Bricolage Grotesque, con la licencia SIL OFL 1.1.', de: 'Alles Übrige ist in Bricolage Grotesque gesetzt, von Mathieu Triay und den Autorinnen und Autoren des Projekts Bricolage Grotesque, unter der Lizenz SIL OFL 1.1.', it: 'Tutto il resto è composto in Bricolage Grotesque, di Mathieu Triay e degli autori del progetto Bricolage Grotesque, con licenza SIL OFL 1.1.', pt: 'Todo o resto usa a Bricolage Grotesque, de Mathieu Triay e dos autores do projeto Bricolage Grotesque, sob a licença SIL OFL 1.1.', ja: 'それ以外の文字には、Mathieu Triay と Bricolage Grotesque Project Authors による Bricolage Grotesque（SIL Open Font License 1.1）を使っています。', zh: '其余文字使用 Mathieu Triay 与 Bricolage Grotesque 项目作者设计的 Bricolage Grotesque 字体，依据 SIL 开放字体许可证 1.1 使用。', ar: 'وكل ما عدا ذلك مكتوب بخط Bricolage Grotesque من تصميم Mathieu Triay ومؤلفي مشروع Bricolage Grotesque، بموجب ترخيص SIL Open Font License 1.1.' },
    credCabinet: { en: 'The boards can also use Cabinet Grotesk, by the Indian Type Foundry, under the ITF Free Font License.', fr: 'Les tableaux peuvent aussi utiliser Cabinet Grotesk, de l’Indian Type Foundry, sous la licence gratuite de l’ITF.', es: 'Los paneles también pueden usar Cabinet Grotesk, de Indian Type Foundry, con la licencia gratuita de ITF.', de: 'Die Anzeigen können auch Cabinet Grotesk verwenden, von der Indian Type Foundry, unter der kostenlosen Lizenz der ITF.', it: 'I tabelloni possono usare anche Cabinet Grotesk, della Indian Type Foundry, con la licenza gratuita di ITF.', pt: 'Os painéis também podem usar a Cabinet Grotesk, da Indian Type Foundry, sob a licença gratuita da ITF.', ja: '案内表示では、Indian Type FoundryによるCabinet Grotesk（ITF Free Font License）も使用できます。', zh: '航班屏也可以使用 Indian Type Foundry 的 Cabinet Grotesk 字体，依据 ITF 免费字体许可证使用。', ar: 'ويمكن للوحات أيضًا استخدام خط Cabinet Grotesk من Indian Type Foundry، بموجب ترخيص ITF Free Font License.' },
    credNoto: { en: 'Japanese, Chinese and Arabic on the boards are set in Noto Sans JP, Noto Sans SC and Noto Sans Arabic by Google, under the SIL Open Font License 1.1.', fr: 'Le japonais, le chinois et l’arabe des tableaux sont composés en Noto Sans JP, Noto Sans SC et Noto Sans Arabic de Google, sous licence SIL OFL 1.1.', es: 'El japonés, el chino y el árabe de los paneles usan Noto Sans JP, Noto Sans SC y Noto Sans Arabic de Google, con la licencia SIL OFL 1.1.', de: 'Japanisch, Chinesisch und Arabisch auf den Anzeigen sind in Noto Sans JP, Noto Sans SC und Noto Sans Arabic von Google gesetzt, unter der Lizenz SIL OFL 1.1.', it: 'Il giapponese, il cinese e l’arabo dei tabelloni sono composti in Noto Sans JP, Noto Sans SC e Noto Sans Arabic di Google, con licenza SIL OFL 1.1.', pt: 'O japonês, o chinês e o árabe dos painéis usam Noto Sans JP, Noto Sans SC e Noto Sans Arabic, do Google, sob a licença SIL OFL 1.1.', ja: '案内表示の日本語・中国語・アラビア語には、GoogleのNoto Sans JP、Noto Sans SC、Noto Sans Arabic（SIL Open Font License 1.1）を使っています。', zh: '航班屏上的日文、中文和阿拉伯文使用 Google 的 Noto Sans JP、Noto Sans SC 和 Noto Sans Arabic 字体，依据 SIL 开放字体许可证 1.1 使用。', ar: 'تُكتب اليابانية والصينية والعربية في اللوحات بخطوط Noto Sans JP وNoto Sans SC وNoto Sans Arabic من Google، بموجب ترخيص SIL Open Font License 1.1.' }
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

  // ── THE DEMO CLOCK: 10:10 ───────────────────────────────────────────────
  // v24042 — a board shown as an EXAMPLE reads 10:10 AM, the watch-advert
  // convention (the hands frame the maker's name and the dial smiles): a demo
  // board (?mode=demo), a heritage gate, a board carrying a test flight, the
  // Studio and Designer previews, the homepage pictures. A board in an
  // airport keeps the real time; nothing turns this on by itself there.
  //
  // Only what a CLOCK prints changes. clockNow() hands a clock the instant
  // at 10:10 on the airport's own calendar day (the real seconds kept, so a
  // ticking clock still ticks), and the clock formats it with its usual rule:
  // 10:10 AM on a board led by English, 10:10 or 10h 10 on the others. Rows,
  // statuses, countdowns and Today | Tomorrow keep reading the real time, so
  // the flights on a demo picture stay the real ones.
  //
  //   ?clock=1010            on, whatever the page is showing
  //   ?clock=live            off, even on a demo (the real time is wanted)
  //   setDemoClock(on)       a demo mode's own switch (true/false, or a
  //                          function asked at every tick); the URL outranks it
  // A board inside a same-origin frame (the tour, the stream) follows that
  // frame's ?clock= when it has none of its own, so tour.html?clock=1010
  // turns every board it shows.
  var DEMO_CLOCK = { h: 10, m: 10 };
  var _demoClockSet = false;
  function _clockParam(search) {
    var m = /[?&]clock=([^&#]*)/.exec(String(search || ''));
    if (!m) return '';
    var v = decodeURIComponent(m[1]).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (v === '1010' || v === 'demo') return 'on';
    if (v === 'live' || v === 'real' || v === 'off' || v === '0') return 'off';
    return '';
  }
  function _clockUrl() {
    try {
      if (typeof location === 'undefined') return '';
      var own = _clockParam(location.search);
      if (own) return own;
      // the frame this board sits in (same origin only: reading another
      // origin's location throws, and that board keeps its own setting)
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        return _clockParam(window.parent.location.search);
      }
    } catch (e) {}
    return '';
  }
  function demoClock() {
    var u = _clockUrl();
    if (u) return u === 'on';
    if (typeof _demoClockSet === 'function') {
      try { return !!_demoClockSet(); } catch (e) { return false; }
    }
    return !!_demoClockSet;
  }
  function setDemoClock(on) {
    _demoClockSet = (typeof on === 'function') ? on : !!on;
    return demoClock();
  }
  // y, mo, d, h, mi of an instant on the zone's wall clock (no zone: the
  // machine's, as every formatter here falls back to)
  function _wall(dt, tz) {
    var o = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    if (tz) o.timeZone = tz;
    var p = {};
    new Intl.DateTimeFormat('en-US', o).formatToParts(dt).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, mo: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute };
  }
  // The instant a clock shows: d itself, or 10:10 on d's day at the airport.
  function clockNow(d, tz) {
    var dt = toDate(d == null ? new Date() : d);
    if (isNaN(dt.getTime()) || !demoClock()) return dt;
    try {
      var w = _wall(dt, tz);
      var want = Date.UTC(w.y, w.mo - 1, w.d, DEMO_CLOCK.h, DEMO_CLOCK.m);
      var t = want;
      // a zone's offset can differ at 10:10 from the real moment's (a DST
      // morning): walk to the instant whose wall clock reads 10:10
      for (var i = 0; i < 3; i++) {
        var g = _wall(new Date(t), tz);
        var got = Date.UTC(g.y, g.mo - 1, g.d, g.h, g.mi);
        if (got === want) break;
        t += want - got;
      }
      return new Date(t + dt.getTime() % 60000);
    } catch (e) { return dt; }
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

  // ── A PAGE IN ONE LANGUAGE: THE HOMEPAGE AND ITS CREDITS PAGE ───────────
  // Not a board: one language at a time, the reader's own. Precedence:
  //   1. ?lang= in the URL (matched against the constant list)
  //   2. the reader's saved choice (the page saves it; o.saved)
  //   3. the browser's languages, in the reader's order
  //   4. English
  //   o = { search, saved, navigatorLangs }   Returns { lang, source }.
  function pageLang(o) {
    o = o || {};
    var raw = '';
    try { raw = new URLSearchParams(String(o.search || '')).get('lang') || ''; } catch (e) {}
    var u = parseList(raw, 1);
    if (u.length) return { lang: u[0], source: 'url' };
    var s = parseList(o.saved, 1);
    if (s.length) return { lang: s[0], source: 'saved' };
    // the browser's own languages, read here and nowhere else
    var nav = o.navigatorLangs;
    if (nav == null) {
      try { nav = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || '']; } catch (e) { nav = []; }
    }
    for (var i = 0; i < nav.length; i++) {
      var b = parseList(String(nav[i] || '').split('-')[0], 1);
      if (b.length) return { lang: b[0], source: 'browser' };
    }
    return { lang: 'en', source: 'default' };
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
  api.demoClock = demoClock;
  api.setDemoClock = setDemoClock;
  api.clockNow = clockNow;
  api.DEMO_CLOCK = DEMO_CLOCK;
  api.looksLike = looksLike;
  api.date = date;
  api.longDate = longDate;
  api.intl = intl;
  api.num = num;
  api.weekday = weekday;
  api.defaultLangs = defaultLangs;
  api.parseList = parseList;
  api.resolveLangs = resolveLangs;
  api.pageLang = pageLang;
  api.SEP_HTML = SEP_HTML;
  return api;
});
