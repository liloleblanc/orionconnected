// Self-test fixture: a legacy table and its helper, plus violations.
var LS = {
  dep:   { en: 'Departures', fr: 'Départs', es: 'Salidas', de: 'Abflüge', it: 'Partenze', pt: 'Partidas', ja: '出発', zh: '出发', ar: 'المغادرات' },
  added: { en: 'New key', fr: 'Nouvelle clé', es: 'Clave nueva', de: 'Neuer Schlüssel', it: 'Chiave nuova', pt: 'Chave nova', ja: '新しいキー', zh: '新键', ar: 'مفتاح جديد' },
  gate:  { en: 'Gate', fr: 'Porte', es: 'Puerta', de: 'Gate', it: 'Gate', pt: 'Portão', ja: 'ゲート', zh: '登机口', ar: 'البوابة' }
};
// B4: the YYT case — a double-quoted value declared twice
var CITY = { YQM: 'MONCTON', YYT: "ST. JOHN'S", YHZ: 'HALIFAX', YYT: "ST. JOHN'S" };
function TL(k) { return LS[k] ? LS[k][lang] : ''; }

function renderBad(n, a, b, lang, langs, _frF) {
  var h = '';
  // B2: an inline table outside the store, missing six languages (B1)
  var label = { en: 'Arriving', fr: 'Arrivée', es: 'Llegando' };
  // B5: text in markup
  h += '<b>Gate ' + n + '</b>';
  h += `<div class="x">${a} to ${b}</div>`;
  // B5: a fallback after a helper
  h += '<i>' + (TL('dep') || 'Departures') + '</i>';
  // B5: a bilingual literal
  var tag = 'expected | prévu';
  // B11: a word chosen by comparing the language
  var w = lang === 'fr' ? 'Porte' : 'Gate';
  // B11: a private pair and a literal locale
  var pair = langs.slice(0, 2);
  var t = new Date().toLocaleTimeString('en-US', { hour12: true });
  var set = { fr: 1, de: 1, it: 1 };
  var list = ['en', 'fr', 'es'];
  // B11: a French-first ternary choosing a word
  var v = _frF ? 'Vol' : 'Flight';
  // B5: a sentence
  var s = 'Please proceed to the gate now';
  // B6: a key that does not exist
  h += TL('greenKey');
  // B8: a label the store translates, as a literal
  var hdr = 'Departures';
  // B11: a language read straight out of a table
  var raw = LS.dep.fr;
  // B12: a second Québec list
  var qc = /^(YUL|YQB|YHU)$/;
  // B5: text put straight into a text sink
  document.body.textContent = 'Loading flights';
  return h + label + tag + w + pair + t + set + list + v + s + hdr + qc + raw;
}

// B13: a timer sweeping the page's text after render
function relabel() {
  document.querySelectorAll('body *').forEach(function (el) { if (el.textContent === 'Today') el.textContent = 'Aujourd’hui'; });
}
setInterval(relabel, 1000);

// P2: a pragma with no valid reason
var x1 = 'Some words here'; // i18n-ok: because
