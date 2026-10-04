// Self-test fixture: the clean twin of legacy.js. Every check passes.
var LS2 = {};
function renderGood(n, a, b) {
  var h = '';
  h += '<b>' + bsPair('gate') + ' ' + n + '</b>';
  h += `<div class="x">${a} → ${b}</div>`;
  h += '<i>' + bs('gate') + '</i>';
  var pair = bsPairLangs(langs);
  var t = bsTime(new Date(), lang);
  if (lang === 'fr') h += '';
  var cls = 'g8-row ' + (n > 1 ? 'is-many' : 'is-one');
  console.log('Loading flights for the gate now');
  document.getElementById('liveLabel').textContent = 'LIVE'; // i18n-ok: operator
  return h + pair + t + cls;
}
