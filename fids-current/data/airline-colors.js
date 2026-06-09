/* ============================================================================
 *  AIRLINE COLOR DATABASE  — single source of truth for gate/board theming.
 *  Loaded as window.AIRLINE_BRAND_COLORS BEFORE fids-core.js, which merges it
 *  over its built-in defaults. To add/adjust an airline, edit ONLY this file.
 *
 *  Per airline (keyed by IATA code):
 *    r1       — DARK bar colour (header + footer)        ← "dark"
 *    r1Text   — text/logo colour on the bar              (usually #FFFFFF)
 *    r2       — ACCENT (gate/clock tabs, icons)          ← brand accent
 *    body     — LIGHT body/card background               ← "light"
 *    bodyText — text colour on the light body
 *  Values are from each carrier's published brand guidelines where available.
 * ========================================================================== */
window.AIRLINE_BRAND_COLORS = {
  /* ── Canada ─────────────────────────────────────────────────────────── */
  'AC': { r1:'#3A3F49', r1Text:'#FFFFFF', r2:'#D82F2E', body:'#F7FAFD', bodyText:'#0F172A' }, // Air Canada (gray bar per Nick)
  'QK': { r1:'#3A3F49', r1Text:'#FFFFFF', r2:'#D82F2E', body:'#F7FAFD', bodyText:'#0F172A' }, // Jazz / AC Express
  'RV': { r1:'#3A3F49', r1Text:'#FFFFFF', r2:'#D82F2E', body:'#F7FAFD', bodyText:'#0F172A' }, // AC Rouge
  'WS': { r1:'#003A5D', r1Text:'#FFFFFF', r2:'#00ABC2', body:'#EAF3F5', bodyText:'#003A5D' }, // WestJet (NAVY bar — white wordmark)
  'PD': { r1:'#FFFFFF', r1Text:'#002244', r2:'#1A3A6B', body:'#EEF2F6', bodyText:'#002244' }, // Porter (LIGHT bar — dark logo)
  'TS': { r1:'#0F4C81', r1Text:'#FFFFFF', r2:'#00A0DF', body:'#EAF1F7', bodyText:'#0F4C81' }, // Air Transat
  'F8': { r1:'#101820', r1Text:'#FFFFFF', r2:'#39B54A', body:'#EFF2EF', bodyText:'#0F172A' }, // Flair
  'PB': { r1:'#FCA404', r1Text:'#16243E', r2:'#C77F00', body:'#FCF3E0', bodyText:'#16243E' }, // PAL Airlines (all gold)
  'SP': { r1:'#FCA404', r1Text:'#16243E', r2:'#C77F00', body:'#FCF3E0', bodyText:'#16243E' }, // PAL Airlines (alt code, all gold)
  'BQ': { r1:'#1B2A4A', r1Text:'#FFFFFF', r2:'#E1241B', body:'#EDEFF4', bodyText:'#1B2A4A' }, // Pascan
  '3H': { r1:'#1A1A1A', r1Text:'#FFFFFF', r2:'#E4002B', body:'#F2EEEC', bodyText:'#0F172A' }, // Air Inuit
  'MO': { r1:'#10243F', r1Text:'#FFFFFF', r2:'#C8102E', body:'#EAEFF5', bodyText:'#10243F' }, // Calm Air
  'YP': { r1:'#1C3050', r1Text:'#FFFFFF', r2:'#1B75BC', body:'#EBEFF4', bodyText:'#1C3050' }, // Perimeter
  '5T': { r1:'#003F87', r1Text:'#FFFFFF', r2:'#00A9CE', body:'#EAEFF6', bodyText:'#003F87' }, // Canadian North
  '4N': { r1:'#13294B', r1Text:'#FFFFFF', r2:'#F2A900', body:'#F3F0E8', bodyText:'#13294B' }, // Air North
  'WG': { r1:'#0B1F3A', r1Text:'#FFFFFF', r2:'#E4002B', body:'#EAF0F6', bodyText:'#0B1F3A' }, // Sunwing

  /* ── United States ──────────────────────────────────────────────────── */
  'DL': { r1:'#003366', r1Text:'#FFFFFF', r2:'#C01933', body:'#F4F6F9', bodyText:'#003366' }, // Delta (official)
  'AA': { r1:'#101820', r1Text:'#FFFFFF', r2:'#0078D2', body:'#E8EAEC', bodyText:'#0F172A' }, // American
  'UA': { r1:'#002244', r1Text:'#FFFFFF', r2:'#003399', body:'#EAEDF2', bodyText:'#002244' }, // United (official)
  'AS': { r1:'#01426A', r1Text:'#FFFFFF', r2:'#2774AE', body:'#EDF2F6', bodyText:'#01426A' }, // Alaska (official)
  'WN': { r1:'#304CB2', r1Text:'#FFFFFF', r2:'#F9B612', body:'#EAEDF7', bodyText:'#304CB2' }, // Southwest
  'B6': { r1:'#003876', r1Text:'#FFFFFF', r2:'#00A1DE', body:'#EAF0F7', bodyText:'#003876' }, // JetBlue
  'HA': { r1:'#4B286D', r1Text:'#FFFFFF', r2:'#E0218A', body:'#F4EFF7', bodyText:'#4B286D' }, // Hawaiian
  'F9': { r1:'#00854D', r1Text:'#FFFFFF', r2:'#0A8A44', body:'#EAF3EE', bodyText:'#0F3D2A' }, // Frontier

  /* ── International ──────────────────────────────────────────────────── */
  'LH': { r1:'#05164D', r1Text:'#FFFFFF', r2:'#FFB81C', body:'#F1F2F4', bodyText:'#05164D' }, // Lufthansa
  'BA': { r1:'#075AAA', r1Text:'#FFFFFF', r2:'#EB2226', body:'#EEF3F8', bodyText:'#075AAA' }, // British Airways
  'AF': { r1:'#002157', r1Text:'#FFFFFF', r2:'#ED1C24', body:'#EFF2F7', bodyText:'#002157' }, // Air France
  'KL': { r1:'#003876', r1Text:'#FFFFFF', r2:'#00A1DE', body:'#EAF0F7', bodyText:'#003876' }, // KLM
  'EK': { r1:'#D71921', r1Text:'#FFFFFF', r2:'#C9A24B', body:'#F7EFEF', bodyText:'#7A0F14' }, // Emirates
  'QR': { r1:'#5C0632', r1Text:'#FFFFFF', r2:'#A4925A', body:'#F2EEF0', bodyText:'#5C0632' }, // Qatar
  'IB': { r1:'#D7192D', r1Text:'#FFFFFF', r2:'#F2B233', body:'#F7EEEF', bodyText:'#8A0F1C' }, // Iberia

  /* ── Latin America ─────────────────────────────────────────────────── */
  'AV': { r1:'#202020', r1Text:'#FFFFFF', r2:'#D6001C', body:'#F2F2F2', bodyText:'#0F172A' }, // Avianca
  'OB': { r1:'#0D2B60', r1Text:'#FFFFFF', r2:'#D6430D', body:'#EAF0F8', bodyText:'#0D2B60' }, // Boliviana de Aviación (BoA)
  'LA': { r1:'#1B0088', r1Text:'#FFFFFF', r2:'#ED1650', body:'#EEEDF7', bodyText:'#1B0088' }, // LATAM
  'CM': { r1:'#0033A0', r1Text:'#FFFFFF', r2:'#0EA5E9', body:'#EAEDF7', bodyText:'#0033A0' }, // Copa
  'AM': { r1:'#0B2343', r1Text:'#FFFFFF', r2:'#007DC5', body:'#EAEDF2', bodyText:'#0B2343' }  // Aeroméxico
};
