// Self-test fixture: a miniature store. Not loaded by any page.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var FR_FIRST = ['YUL', 'YQB', 'YHU'];
  var STR = {
    gate: { en: 'Gate', fr: 'Porte', es: 'Puerta', de: 'Gate', it: 'Gate', pt: 'Portão', ja: 'ゲート', zh: '登机口', ar: 'البوابة' },
    noArabic: { en: 'Boarding pass', fr: "Carte d'embarquement", es: 'Tarjeta de embarque', de: 'Bordkarte', it: "Carta d'imbarco", pt: 'Cartão de embarque', ja: '搭乗券', zh: '登机牌' },
    leftEnglish: { en: 'Baggage hall', fr: 'Baggage hall', es: 'Sala de equipajes', de: 'Gepäckhalle', it: 'Sala bagagli', pt: 'Sala de bagagens', ja: '手荷物受取所', zh: '行李大厅', ar: 'صالة الأمتعة' },
    latinChinese: { en: 'Exit', fr: 'Sortie', es: 'Salida', de: 'Ausgang', it: 'Uscita', pt: 'Saída', ja: '出口', zh: 'Exit', ar: 'مخرج' },
    pastedFrench: { en: 'Arrivals hall', fr: 'Hall des arrivées', es: 'Hall des arrivées', de: 'Ankunftshalle', it: 'Sala arrivi', pt: 'Sala de chegadas', ja: '到着ロビー', zh: '到达大厅', ar: 'صالة الوصول' },
    twoWordings: { en: 'Departures', fr: 'Départs', es: 'Salidas', de: 'Abflüge', it: 'Partenze', pt: 'Partidas', ja: '出発', zh: '出发', ar: 'المغادرة' },
    badCode: { en: 'Exit', fr: 'Sortie', es: 'Salida', de: 'Ausgang', it: 'Uscita', pt: 'Saída', ja: '出口', zh: '出口', ar: 'مخرج', pt_BR: 'Saída' },
    expression: { en: 'Gate ' + 1, fr: 'Porte', es: 'Puerta', de: 'Gate', it: 'Gate', pt: 'Portão', ja: 'ゲート', zh: '登机口', ar: 'البوابة' },
    empty: { en: 'Belt', fr: '', es: 'Cinta', de: 'Band', it: 'Nastro', pt: 'Esteira', ja: 'ターンテーブル', zh: '行李转盘', ar: 'الحزام' },
    // the reviewer's store attacks
    atkFrOnly: { fr: 'Fermeture de la porte' },
    atkZeroWidth: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Tomor\u200Brow', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkEnglishInside: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Tomorrow (morgen)', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkSpanishInGerman: { en: 'Today', fr: 'Aujourd’hui', es: 'Mañana', de: 'Mañana', it: 'Oggi', pt: 'Hoje', ja: '今日', zh: '今天', ar: 'اليوم' },
    atkKanaInChinese: { en: 'Departure', fr: 'Départ', es: 'Salida', de: 'Abflug', it: 'Partenza', pt: 'Partida', ja: '出発', zh: 'しゅっぱつ', ar: 'المغادرة' },
    // round 3: another language's word, or a look-alike letter, in a value
    atkJapaneseInGerman: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: '明日', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkArabicInGerman: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'غدًا', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkCyrillicLetter: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Tom\u043errow', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkEnglishOfAnotherKey: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Today', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkChineseInJapanese: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Morgen', it: 'Domani', pt: 'Amanhã', ja: '明天', zh: '明天', ar: 'غدًا' },
    atkSimplifiedInJapanese: { en: 'Open', fr: 'Ouvert', es: 'Abierto', de: 'Geöffnet', it: 'Aperto', pt: 'Aberto', ja: '开放', zh: '开放', ar: 'مفتوح' },
    atkEnglishParaphrase: { en: 'Gate closing soon', fr: 'Fermeture de la porte sous peu', es: 'La puerta cerrará pronto', de: 'Gate closes shortly', it: 'Il gate chiude a breve', pt: 'O portão fecha em breve', ja: 'まもなく搭乗口締切', zh: '登机口即将关闭', ar: 'ستُغلق البوابة قريبًا' },
    // two statuses, one word
    stOnTime: { en: 'On time', fr: 'À l\'heure', es: 'A tiempo', de: 'Pünktlich', it: 'In orario', pt: 'No horário', ja: '定刻', zh: '准点', ar: 'في الموعد' },
    stScheduled: { en: 'Scheduled', fr: 'Prévu', es: 'Programado', de: 'Geplant', it: 'Previsto', pt: 'Programado', ja: '定刻', zh: '计划', ar: 'مجدول' },
    // round 5: placeholders, Persian and Urdu for Arabic, another Romance
    // language pasted in, English the store's English never uses, look-alikes
    atkPlaceholderDe: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'XXX', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkPlaceholderJa: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Morgen', it: 'Domani', pt: 'Amanhã', ja: '？？？', zh: '明天', ar: 'غدًا' },
    atkDashDe: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: '—', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkPersian: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Morgen', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'فردا' },
    atkUrdu: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Morgen', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'کل' },
    atkSpanishInPt: { en: 'Flight leg', fr: 'Tronçon', es: 'Tramo', de: 'Flugabschnitt', it: 'Tratta', pt: 'Tramo', ja: '区間', zh: '航段', ar: 'مقطع الرحلة' },
    atkItalianInPt: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Morgen', it: 'Domani', pt: 'Domani', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkEnglishUnseen: { en: 'Gate closing soon', fr: 'Fermeture imminente de la porte', es: 'La puerta cierra pronto', de: 'Doors shut momentarily', it: 'Il gate chiude a breve', pt: 'O portão fecha em breve', ja: 'まもなく搭乗口締切', zh: '登机口即将关闭', ar: 'البوابة تغلق قريبًا' },
    atkFullwidth: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Ｔｏｍｏｒｒｏｗ', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkSmallCapital: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Tomorroᴡ', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    atkJoiner: { en: 'Tomorrow', fr: 'Demain', es: 'Mañana', de: 'Tom\u034Forrow', it: 'Domani', pt: 'Amanhã', ja: '明日', zh: '明天', ar: 'غدًا' },
    // the store's English writes 'hotel' in lower case: a label word
    theHotel: { en: 'The hotel', fr: "L'hôtel", es: 'El hotel', de: 'Das Hotel', it: "L'hotel", pt: 'O hotel', ja: 'ホテル', zh: '酒店', ar: 'الفندق' }
  };
  var LISTS = {
    atkFrList: { fr: ['FERMETURE DE LA PORTE'] },
    // round 5: an English line, and a placeholder, in the German ticker
    atkTicker: {
      en: ['KEEP YOUR BAGGAGE WITH YOU', 'REPORT UNATTENDED ITEMS', 'CHECK THE MONITORS'],
      fr: ['GARDEZ VOS BAGAGES AVEC VOUS', 'SIGNALEZ LES OBJETS SANS SURVEILLANCE', 'CONSULTEZ LES ÉCRANS'],
      es: ['MANTENGA SU EQUIPAJE CON USTED', 'INFORME DE OBJETOS SIN VIGILANCIA', 'CONSULTE LAS PANTALLAS'],
      de: ['PLEASE WATCH YOUR BELONGINGS', 'TODO', 'PRÜFEN SIE DIE MONITORE'],
      it: ['TENETE CON VOI I BAGAGLI', 'SEGNALATE GLI OGGETTI INCUSTODITI', 'CONSULTATE GLI SCHERMI'],
      pt: ['MANTENHA SUA BAGAGEM COM VOCÊ', 'INFORME OBJETOS SEM VIGILÂNCIA', 'CONSULTE AS TELAS'],
      ja: ['手荷物は常にお持ちください', '放置された荷物はお知らせください', 'モニターをご確認ください'],
      zh: ['请随身携带行李', '请报告无人看管的物品', '请查看显示屏'],
      ar: ['احتفظ بأمتعتك معك', 'أبلغ عن الأغراض المتروكة', 'راجع الشاشات']
    }
  };
  // the store rewriting itself at run time
  STR.gate.fr = 'Portail';
  return { FR_FIRST: FR_FIRST, STR: STR, LISTS: LISTS };
});
