// Turn the price text a flyer or a person gives us into comparable numbers.
//
// parsePrice({ price, originalPrice, preText, postText, saleStory, name }) ->
//   { price, originalPrice, multiBuy, unit, quantity, basePrice, baseUnit, flags, priceText, sizeText }
//
// baseUnit is kg, l or ea. basePrice is the price for one baseUnit when it can be worked out,
// otherwise null, and the offer is then compared on its sticker price with a "size unknown" note.

import { fold } from './text.js';

const LB_PER_KG = 2.20462;
const G_PER_OZ = 28.3495;
const ML_PER_FLOZ = 29.5735;

function num(s) {
  if (s == null) return null;
  const n = typeof s === 'number' ? s : parseFloat(String(s).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "2/5.00", "2 for $5", "2 pour 5,00 $", "3/$10" -> { count, total }
export function parseMultiBuy(text) {
  const t = fold(text);
  const m = t.match(/(\d+)\s*(?:\/|for|pour|a|à)\s*\$?\s*(\d+(?:[.,]\d{1,2})?)\s*\$?/);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  const total = num(m[2]);
  if (!count || count < 2 || count > 24 || !total) return null;
  return { count, total };
}

// Size written in a product name: "4 lb bag", "2 L", "240-303 g", "6 x 946 ml", "12 pk", "40 pouches", "1 dozen".
// Returns { quantity, unit } in the unit written (kg g lb oz l ml ea) or null.
export function parseSize(text) {
  const t = fold(text).replace(/,/g, '.');
  // multipack: "6 x 946 ml", "12 x 355 ml", "2x2 l"
  let m = t.match(/(\d+)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(kg|g|lb|lbs|oz|l|ml)\b/);
  if (m) return { quantity: parseInt(m[1], 10) * parseFloat(m[2]), unit: normUnit(m[3]), text: m[0] };
  // range "240-303 g", "168 - 210 g": use the lower bound (never flatters the unit price)
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to|a)\s*(\d+(?:\.\d+)?)\s*(kg|g|lb|lbs|oz|l|ml)\b/);
  if (m) return { quantity: parseFloat(m[1]), unit: normUnit(m[3]), text: m[0] };
  // plain "4 lb", "2 l", "750 ml", "1.36 kg", "907 g"
  m = t.match(/(\d+(?:\.\d+)?)\s*-?\s*(kg|g|lb|lbs|oz|l|ml)\b/);
  if (m) return { quantity: parseFloat(m[1]), unit: normUnit(m[2]), text: m[0] };
  // "dozen", "douzaine"
  m = t.match(/(\d+)?\s*(dozen|douzaine|dz)\b/);
  if (m) return { quantity: 12 * (m[1] ? parseInt(m[1], 10) : 1), unit: 'ea', text: m[0] };
  // counts: "40 pouches", "12 pk", "24 pack", "30 ct", "6 un", "paquet de 12"
  m = t.match(/(\d+)\s*(?:pk|pack|ct|count|un|units?|unites?|pouches|sachets|rolls|rouleaux|bars|barres|eggs|oeufs)\b/);
  if (m) return { quantity: parseInt(m[1], 10), unit: 'ea', text: m[0] };
  m = t.match(/(?:paquet|pack|emballage|boite|box|caisse|case) de (\d+)\b/);
  if (m) return { quantity: parseInt(m[1], 10), unit: 'ea', text: m[0] };
  return null;
}

function normUnit(u) {
  u = u.toLowerCase();
  if (u === 'lbs') return 'lb';
  return u;
}

// Price-per unit written after the price: "/lb", "lb", "/kg", "ea.", "ch.", "/100 g", "/sac 4 lb".
export function parsePerUnit(postText, preText) {
  const t = fold([preText, postText].filter(Boolean).join(' '));
  if (!t) return null;
  let m = t.match(/\/\s*(?:sac|bag)\s*(\d+(?:\.\d+)?)\s*(kg|g|lb|l|ml)\b/);
  if (m) return { quantity: parseFloat(m[1]), unit: normUnit(m[2]) };
  m = t.match(/\/\s*(\d+)\s*(g|ml)\b/); // "/100 g"
  if (m) return { quantity: parseFloat(m[1]), unit: m[2] };
  if (/(^|[\s/])lbs?\b|\/\s*lb/.test(t)) return { quantity: 1, unit: 'lb' };
  if (/(^|[\s/])kg\b|\/\s*kg/.test(t)) return { quantity: 1, unit: 'kg' };
  if (/(^|[\s/])(ea|each|ch|chaque|un|unite)\b\.?/.test(t)) return { quantity: 1, unit: 'ea' };
  return null;
}

export function parseFlags({ preText, postText, saleStory, name }) {
  const t = fold([preText, postText, saleStory].filter(Boolean).join(' | '));
  const flags = new Set();
  if (/\+\s*(tx|tax|taxes)\b/.test(t)) flags.add('plus_tax');
  if (/\b(member|membre|scene\s*\+|optimum|moi\b)/.test(t) && /(price|prix)/.test(t)) flags.add('member');
  if (/online price|prix en ligne/.test(t)) flags.add('online');
  if (/\bonly\b|seulement|\bonly!/.test(t) && /(saturday|sunday|monday|tuesday|wednesday|thursday|friday|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi|\d)/.test(t)) flags.add('limited_time');
  if (/\breg\.?\s*from|a partir de|\bfrom\b/.test(t)) flags.add('from');
  if (/rollback|chute de prix|save|economisez|epargnez|sale|special|rabais|\$ off|\d+\s*%/.test(t)) flags.add('sale');
  if (/when you buy \d|a l'achat de \d|lorsque vous achetez \d/.test(t)) flags.add('points_on_multiple');
  return [...flags];
}

// Convert a quantity in a written unit to the base unit (kg, l or ea).
export function toBase(quantity, unit) {
  switch (unit) {
    case 'kg': return { quantity, unit: 'kg' };
    case 'g': return { quantity: quantity / 1000, unit: 'kg' };
    case 'lb': return { quantity: quantity / LB_PER_KG, unit: 'kg' };
    case 'oz': return { quantity: quantity * G_PER_OZ / 1000, unit: 'kg' };
    case 'l': return { quantity, unit: 'l' };
    case 'ml': return { quantity: quantity / 1000, unit: 'l' };
    case 'floz': return { quantity: quantity * ML_PER_FLOZ / 1000, unit: 'l' };
    case 'ea': return { quantity, unit: 'ea' };
    default: return null;
  }
}

export function parsePrice({ price, originalPrice, preText, postText, saleStory, name }) {
  let p = num(price);
  let multiBuy = parseMultiBuy(preText) || parseMultiBuy(postText) || (p == null ? parseMultiBuy(saleStory) : null);
  if (multiBuy && (p == null || Math.abs(p - multiBuy.total) < 0.005)) {
    p = multiBuy.total / multiBuy.count;
  } else if (multiBuy && p != null) {
    multiBuy = null; // the sticker is already a unit price; ignore the story
  }
  const flags = parseFlags({ preText, postText, saleStory, name });
  const per = parsePerUnit(postText, preText);
  const size = per ? null : parseSize(name);
  let quantity = null, unit = null, basePrice = null, baseUnit = null, sizeText = null;
  if (per) {
    quantity = per.quantity; unit = per.unit;
  } else if (size) {
    quantity = size.quantity; unit = size.unit; sizeText = size.text;
  }
  if (p != null && quantity && unit) {
    const b = toBase(quantity, unit);
    if (b && b.quantity > 0) { basePrice = p / b.quantity; baseUnit = b.unit; }
  }
  const priceText = p == null ? null : [preText, p.toFixed(2), postText].filter(Boolean).join(' ').trim();
  return {
    price: p,
    originalPrice: num(originalPrice),
    multiBuy,
    unit, quantity, basePrice, baseUnit, sizeText,
    flags, priceText,
  };
}

// Cost of buying `typical` ({qty, unit}) of this offer. Falls back to the sticker price when the
// size is unknown, and says so.
export function costFor(parsed, typical) {
  if (parsed.price == null) return { cost: null, comparable: false, note: 'no price' };
  if (typical && typical.unit === 'pkg') {
    // one list line = one package, whatever its size; the sticker price is the cost
    return { cost: parsed.price * (typical.qty || 1), comparable: true, note: parsed.sizeText ? null : 'size unknown' };
  }
  if (parsed.basePrice != null && typical && parsed.baseUnit === typical.unit) {
    return { cost: parsed.basePrice * typical.qty, comparable: true, note: null };
  }
  if (parsed.basePrice != null && typical && parsed.baseUnit !== typical.unit) {
    return { cost: parsed.price, comparable: false, note: 'sold by ' + parsed.baseUnit + ', list is by ' + typical.unit };
  }
  return { cost: parsed.price, comparable: false, note: 'size unknown' };
}

export function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + n.toFixed(2);
}
