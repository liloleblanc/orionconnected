// Grocery Planner web app. Plain JavaScript, no build step.
// Strings live in STR so another language can be added later: add a key per language and a toggle.

const STR = {
  en: {
    title: 'Grocery Planner', tagline: "Your list, this week's prices nearby, and where to shop.",
    postal: 'Postal code', useLocation: 'Use my location', list: 'Your list', listHint: 'One item per line or separated by commas. "2 x milk" works.',
    options: 'Options', tripCost: 'Cost of one more store ($)', maxStores: 'Stores at most', includePharmacies: 'Count pharmacies (milk, eggs, bread)', find: 'Find prices',
    reportTitle: 'Saw a price? Report it', reportHint: 'Shelf prices you report count for two weeks for everyone shopping in your area. No photo needed.',
    store: 'Store', item: 'Item', price: 'Price', size: 'Size', unit: 'Unit', onSale: 'It was a sale price', send: 'Send',
    aboutTitle: 'Where the prices come from', aboutFlyers: "This week's flyers for the grocers around your postal code.", aboutRegular: "Giant Tiger's regular shelf prices, from its public online listing.",
    aboutReported: 'Prices other shoppers reported nearby in the last two weeks.', aboutCaveat: "Flyer prices are the store's advertised sale for the week; a regular price can differ between stores. Always check the shelf.",
    footer: 'Prices are collected automatically and may be wrong or out of date.',
    searching: 'Checking flyers and shelf prices…', needPostal: 'Enter a Canadian postal code, like E1C 1E8.', needList: 'Add at least one item to your list.',
    failed: 'Could not get prices right now. Try again in a moment.', noPrices: 'No prices found for your list this week.',
    recommended: 'Recommended', oneStore: 'One store', total: 'Total', forYourList: 'for your list', plusTrips: 'incl. {n} extra trip(s) at {c}', notCarried: 'not carried: {items}, counted at a stand-in price',
    alsoConsider: 'Other ways to do it', bestAt: 'best at', notFound: 'Not found this week: {items}', perUnit: 'per {u}', sizeUnknown: 'size unknown', diffUnit: 'different unit', sale: 'sale', regular: 'regular', reported: 'reported',
    validUntil: 'until {d}', storesNearby: 'Grocers with a flyer this week: {s}', asOf: 'Checked {d}. Sources: {s}.', sent: 'Thanks, your price was added.', sendFailed: 'Could not send that.',
    locating: 'Finding your position…', locateFailed: 'Could not find a postal code for your position; please type it.', typicalAmount: 'priced for {q} {u}', forAmount: 'for {q} {u}', memberPrice: 'member price', plusTax: '+ tax', limited: 'limited time', online: 'online only', multi: '{n} for {t}', defaultStore: 'default store pricing, not confirmed for your store',
  },
};
const lang = 'en';
const t = (k, vars = {}) => (STR[lang][k] || k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
const $ = id => document.getElementById(id);
const money = n => n == null ? '—' : '$' + Number(n).toFixed(2);
const unitLabel = u => ({ kg: 'kg', l: 'L', ea: 'each', pkg: 'pkg' })[u] || u;

function applyStrings() {
  document.querySelectorAll('[data-s]').forEach(el => { el.textContent = t(el.dataset.s); });
  document.title = t('title');
}

function remember(key, value) { try { localStorage.setItem('gp:' + key, value); } catch {} }
function recall(key) { try { return localStorage.getItem('gp:' + key); } catch { return null; } }

function cleanPostal(v) { const p = String(v || '').toUpperCase().replace(/\s+/g, ''); return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(p) ? p : null; }
function listItems() { return $('list').value.split(/[\n,]/).map(s => s.trim()).filter(Boolean); }

async function api(path, opts) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || res.statusText), { data });
  return data;
}

async function loadStores(postal) {
  try {
    const d = await api('/api/stores?postal=' + encodeURIComponent(postal));
    const names = d.stores.filter(s => s.kind === 'grocery').map(s => s.name);
    $('storesHint').textContent = names.length ? t('storesNearby', { s: names.join(', ') }) : '';
    $('storesHint').hidden = !names.length;
    $('storeList').innerHTML = d.stores.map(s => `<option value="${esc(s.name)}">`).join('');
  } catch { $('storesHint').hidden = true; }
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

// "0.99 /lb" -> short "/lb"; "3.99 SATURDAY, OCTOBER 31 ... ONLY!" -> long note under the name.
function splitPriceText(o) {
  const txt = String(o.priceText || '');
  const m = /(\d+\.\d{2})/.exec(txt);
  const pre = m ? txt.slice(0, m.index).trim() : '';
  const post = m ? txt.slice(m.index + m[0].length).trim() : txt;
  const bits = [pre, post].filter(Boolean).join(' · ');
  return bits.length <= 10 ? { short: bits, long: '' } : { short: '', long: bits };
}

function badge(offer, extra) {
  const kind = offer.kind === 'reported' || offer.source === 'community' || offer.source === 'openprices' ? 'reported' : offer.kind;
  let out = `<span class="badge ${kind}">${t(kind)}</span>`;
  if (offer.flags?.includes('member')) out += `<span class="badge">${t('memberPrice')}</span>`;
  if (offer.flags?.includes('plus_tax')) out += `<span class="badge">${t('plusTax')}</span>`;
  if (offer.flags?.includes('limited_time')) out += `<span class="badge">${t('limited')}</span>`;
  if (offer.flags?.includes('online')) out += `<span class="badge">${t('online')}</span>`;
  if (offer.multiBuy) out += `<span class="badge">${t('multi', { n: offer.multiBuy.count, t: money(offer.multiBuy.total) })}</span>`;
  if (offer.storeNote) out += `<span class="badge">${t('defaultStore')}</span>`;
  if (extra) out += extra;
  return out;
}

function renderPlan(r) {
  const results = $('results');
  const card = $('planCard');
  const rec = r.recommended != null ? r.plans[r.recommended] : null;
  if (!rec) {
    card.innerHTML = `<h2>${esc(t('noPrices'))}</h2>`;
    $('itemCards').innerHTML = '';
    results.hidden = false;
    return;
  }
  const trips = rec.tripCost > 0 ? `<li class="muted">${esc(t('plusTrips', { n: rec.stores.length - 1, c: money(rec.tripCost) }))}</li>` : '';
  const missing = rec.missing.length ? `<li class="muted">${esc(t('notCarried', { items: rec.missing.join(', ') }))}</li>` : '';
  const lines = rec.assignments.map(a => {
    const { short } = splitPriceText(a.offer);
    const cost = Math.abs(a.cost - a.offer.price) > 0.01 ? ` <span class="muted">→ ${money(a.cost)}</span>` : '';
    return `<li><strong>${esc(a.item)}</strong> → ${esc(a.merchant)}: <span class="name">${esc(a.offer.name)}</span> <span class="muted">${money(a.offer.price)}${short ? ' ' + esc(short) : ''}</span>${cost} ${badge(a.offer)}</li>`;
  }).join('');
  const alts = r.plans.filter(p => p !== rec).slice(0, 3).map(p => `<div class="line"><span>${esc(p.stores.join(' + '))}${p.missing.length ? ` <span class="muted">(${esc(t('notCarried', { items: p.missing.join(', ') }))})</span>` : ''}</span><strong>${money(p.score)}</strong></div>`).join('');
  card.innerHTML = `
    <h2><span>${esc(t('recommended'))}: ${esc(rec.stores.join(' + '))}</span><span class="total">${money(rec.score)}</span></h2>
    <p class="hint">${esc(t('total'))} ${money(rec.total)} ${esc(t('forYourList'))}</p>
    <ul>${lines}${trips}${missing}</ul>
    ${alts ? `<div class="alt"><div class="muted">${esc(t('alsoConsider'))}</div>${alts}</div>` : ''}
    ${r.notFound.length ? `<p class="hint">${esc(t('notFound', { items: r.notFound.join(', ') }))}</p>` : ''}`;

  $('itemCards').innerHTML = r.items.map(it => {
    if (it.notFound) return '';
    const typical = it.line.typical.unit === 'pkg' ? '' : `<small>${esc(t('typicalAmount', { q: it.line.qty * it.line.typical.qty, u: unitLabel(it.line.typical.unit) }))}</small>`;
    const rows = it.byStore.map((s, i) => {
      const o = s.offer;
      const per = o.basePrice != null && o.baseUnit !== 'ea' && it.line.typical.unit !== 'pkg' ? `<div class="muted">${money(o.basePrice)} ${esc(t('perUnit', { u: unitLabel(o.baseUnit) }))}</div>` : '';
      const note = !s.comparable && s.note ? `<span class="badge">${esc(s.note === 'size unknown' ? t('sizeUnknown') : t('diffUnit'))}</span>` : '';
      const until = o.validTo ? `<div class="muted">${esc(t('validUntil', { d: new Date(o.validTo).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }))}</div>` : '';
      const { short, long } = splitPriceText(o);
      const forAmount = s.comparable && Math.abs(s.cost - o.price * it.line.qty) > 0.01 && it.line.typical.unit !== 'pkg' ? `<div class="muted">${money(s.cost)} ${esc(t('forAmount', { q: it.line.qty * it.line.typical.qty, u: unitLabel(it.line.typical.unit) }))}</div>` : '';
      return `<tr class="${i === 0 ? 'best' : ''}"><td><strong>${esc(s.merchant)}</strong><div class="name">${esc(o.name)}</div>${long ? `<div class="muted">${esc(long)}</div>` : ''}${badge(o, note)}${until}</td><td class="price"><strong>${money(o.price)}${short ? ' ' + esc(short) : ''}</strong>${per}${forAmount}</td></tr>`;
    }).join('');
    return `<div class="card item"><h3><span>${esc(it.line.label)}</span>${typical}</h3><table>${rows}</table></div>`;
  }).join('');
  const srcNames = Object.entries(r.sources).filter(([, v]) => v === 'ok').map(([k]) => ({ flipp: 'flyers', gianttiger: 'Giant Tiger', walmart: 'Walmart', community: 'shopper reports', openprices: 'Open Prices' })[k] || k);
  $('asOf').textContent = t('asOf', { d: new Date(r.asOf).toLocaleString(), s: srcNames.join(', ') });
  results.hidden = false;
}

async function findPrices() {
  const postal = cleanPostal($('postal').value);
  const items = listItems();
  const err = $('error');
  err.hidden = true;
  if (!postal) { err.textContent = t('needPostal'); err.hidden = false; return; }
  if (!items.length) { err.textContent = t('needList'); err.hidden = false; return; }
  remember('postal', postal); remember('list', $('list').value);
  const btn = $('go'); btn.disabled = true; const label = btn.textContent; btn.textContent = t('searching');
  try {
    const r = await api('/api/plan', { method: 'POST', body: JSON.stringify({ postal, items, tripCost: parseFloat($('tripCost').value) || 0, maxStores: parseInt($('maxStores').value, 10) || 2, includePharmacies: $('pharmacies').checked, lang }) });
    renderPlan(r);
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    err.textContent = e.data?.message || t('failed'); err.hidden = false;
  } finally { btn.disabled = false; btn.textContent = label; }
}

async function locate() {
  const btn = $('locate'); const err = $('error'); err.hidden = true;
  if (!navigator.geolocation) { err.textContent = t('locateFailed'); err.hidden = false; return; }
  btn.disabled = true; btn.textContent = t('locating');
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const r = await api('/api/locate', { method: 'POST', body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude }) });
      if (r.postal) { $('postal').value = r.postal; remember('postal', r.postal); loadStores(r.postal); }
      else throw new Error('no postal');
    } catch (e) { err.textContent = e.data?.message || t('locateFailed'); err.hidden = false; }
    finally { btn.disabled = false; btn.textContent = t('useLocation'); }
  }, () => { err.textContent = t('locateFailed'); err.hidden = false; btn.disabled = false; btn.textContent = t('useLocation'); }, { timeout: 10000, maximumAge: 600000 });
}

async function sendReport() {
  const status = $('reportStatus'); status.hidden = true;
  const postal = cleanPostal($('postal').value);
  if (!postal) { status.textContent = t('needPostal'); status.hidden = false; return; }
  try {
    await api('/api/observe', { method: 'POST', body: JSON.stringify({ postal, merchant: $('rStore').value, item: $('rItem').value, price: parseFloat($('rPrice').value), quantity: parseFloat($('rQty').value) || null, unit: $('rUnit').value || null, onSale: $('rSale').checked }) });
    status.textContent = t('sent'); status.hidden = false;
    $('rItem').value = ''; $('rPrice').value = ''; $('rQty').value = ''; $('rSale').checked = false;
  } catch (e) { status.textContent = e.data?.message || t('sendFailed'); status.hidden = false; }
}

function init() {
  applyStrings();
  const postal = recall('postal'); if (postal) { $('postal').value = postal; loadStores(postal); }
  const list = recall('list'); if (list) $('list').value = list;
  $('go').addEventListener('click', findPrices);
  $('locate').addEventListener('click', locate);
  $('send').addEventListener('click', sendReport);
  $('postal').addEventListener('change', () => { const p = cleanPostal($('postal').value); if (p) { $('postal').value = p; loadStores(p); } });
  $('list').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) findPrices(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
