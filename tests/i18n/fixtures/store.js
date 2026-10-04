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
    empty: { en: 'Belt', fr: '', es: 'Cinta', de: 'Band', it: 'Nastro', pt: 'Esteira', ja: 'ターンテーブル', zh: '行李转盘', ar: 'الحزام' }
  };
  return { FR_FIRST: FR_FIRST, STR: STR };
});
