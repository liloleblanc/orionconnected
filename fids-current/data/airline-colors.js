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
  'AC': { r1:'#0A0A0A', r1Text:'#FFFFFF', r2:'#D82F2E', body:'#F7FAFD', bodyText:'#0F172A' }, // Air Canada (gray bar as specified)
  'QK': { r1:'#0A0A0A', r1Text:'#FFFFFF', r2:'#D82F2E', body:'#F7FAFD', bodyText:'#0F172A' }, // Jazz / AC Express
  'RV': { r1:'#0A0A0A', r1Text:'#FFFFFF', r2:'#D82F2E', body:'#F7FAFD', bodyText:'#0F172A' }, // AC Rouge
  'WS': { r1:'#003366', r1Text:'#FFFFFF', r2:'#00ABC2', body:'#EAF3F5', bodyText:'#003A5D' }, // WestJet (NAVY bar — white wordmark)
  // v23120
  // — warm latte cream banner, ink = the wordmark's own navy
  // (#152C53, sampled from porter.svg) so text and logo share one colour.
  'PD': { r1:'#EFE8DA', r1Text:'#152C53', r2:'#152C53', r3:'#254D87', body:'#EAEDF3', bodyText:'#112855' }, // Porter — cream upper / navy ink; was Blue Zodiac #112855
  'TS': { r1:'#0F4C81', r1Text:'#FFFFFF', r2:'#00A0DF', body:'#EAF1F7', bodyText:'#0F4C81' }, // Air Transat
  'F8': { r1:'#1C1C1C', r1Text:'#FFFFFF', r2:'#7AFF94', body:'#F0F4EE', bodyText:'#0F172A' }, // Flair — brand black + lime (sampled from their own livery file; old #39B54A was pre-rebrand)
  'PB': { r1:'#183677', r1Text:'#FFFFFF', r2:'#3E57BE', body:'#EAF0F8', bodyText:'#183677' }, // PAL Airlines (official navy bar + PAL blue, gold icons)
  'SP': { r1:'#183677', r1Text:'#FFFFFF', r2:'#3E57BE', body:'#EAF0F8', bodyText:'#183677' }, // PAL Airlines (alt code)
  'BQ': { r1:'#1B2A4A', r1Text:'#FFFFFF', r2:'#E1241B', body:'#EDEFF4', bodyText:'#1B2A4A' }, // Pascan
  // Air Inuit — its brand guide: Charcoal Black #231F20 for the bar, Air Inuit Orange #F1471D only for the gate
  // and clock tabs (wayfinding, the focal tenth the guide allows), Slate Charcoal #4A4A4D, Arctic Mist #E6E7E8.
  '3H': { r1:'#231F20', r1Text:'#FFFFFF', r2:'#F1471D', r3:'#4A4A4D', body:'#E6E7E8', bodyText:'#231F20' }, // Air Inuit
  'MO': { r1:'#10243F', r1Text:'#FFFFFF', r2:'#C8102E', body:'#EAEFF5', bodyText:'#10243F' }, // Calm Air
  'YP': { r1:'#1C3050', r1Text:'#FFFFFF', r2:'#1B75BC', body:'#EBEFF4', bodyText:'#1C3050' }, // Perimeter
  'JV': { r1:'#910028', r1Text:'#FFFFFF', r2:'#C8102E', body:'#F6ECEE', bodyText:'#910028' }, // Bearskin Airlines (crimson #910028 sampled from logo)
  'WT': { r1:'#CD342B', r1Text:'#FFFFFF', r2:'#E1241B', body:'#F7ECEB', bodyText:'#9A241D' }, // Wasaya Airways (red #CD342B sampled from logo)
  'NSA': { r1:'#B01117', r1Text:'#FFFFFF', r2:'#F9A51A', body:'#F6EEE6', bodyText:'#8A0D12' }, // North Star Air (red #B01117 + gold #F9A51A sampled from logo)
  '5T': { r1:'#BA0C2F', r1Text:'#FFFFFF', r2:'#7C878E', body:'#EAEFF6', bodyText:'#91002F' }, // Canadian North — bar and tabs by its guide: red PMS 200 C and medium grey PMS 430 C; the ink on the pale body its dark red PMS 202 C (the navy and teal they had were in no palette of its own)
  '4N': { r1:'#0F2A55', r1Text:'#FFFFFF', r2:'#F06E0C', body:'#F3F0E8', bodyText:'#0F2A55' }, // Air North — bar and tabs in the dark blue and the orange of its own site (the gold was not an Air North colour)
  // Air Creebec — the supplied palette. A cream upper bar with near-black ink, as the airline sets its
  // own black lettering on a light ground; the gate and clock tabs in the near black (white figures read
  // on it; they do not on the peach); the peach as the third colour.
  'YN': { r1:'#FCF8E3', r1Text:'#272626', r2:'#272626', r3:'#FDD49A', body:'#FCF8E3', bodyText:'#272626' }, // Air Creebec
  'WG': { r1:'#0B1F3A', r1Text:'#FFFFFF', r2:'#E4002B', body:'#EAF0F6', bodyText:'#0B1F3A' }, // Sunwing
  // Central Mountain Air, from flycma.com: the red of its booking tabs #D42E12, the deeper red of its
  // buttons #B52720 for the bar (the brighter red on its own pale band reads at 4.2:1 only), the gold of
  // its search box #927635, its black text.
  '9M': { r1:'#B52720', r1Text:'#FFFFFF', r2:'#D42E12', r3:'#927635', body:'#F5F5F5', bodyText:'#000000' }, // Central Mountain Air

  /* ── United States ──────────────────────────────────────────────────── */
  'DL': { r1:'#003366', r1Text:'#FFFFFF', r2:'#C01933', body:'#F4F6F9', bodyText:'#003366' }, // Delta (official)
  'AA': { r1:'#101820', r1Text:'#FFFFFF', r2:'#0078D2', body:'#E8EAEC', bodyText:'#0F172A' }, // American
  'UA': { r1:'#0033A0', r1Text:'#FFFFFF', r2:'#0033A0', r3:'#69B3E7', body:'#E9EBEE', bodyText:'#0C2340' }, // United — OFFICIAL: Rhapsody Blue #0C2340 (dark) / United Blue #0033A0 / Sky Blue accent
  'AS': { r1:'#01426A', r1Text:'#FFFFFF', r2:'#2774AE', body:'#EDF2F6', bodyText:'#01426A' }, // Alaska (official)
  'WN': { r1:'#304CB2', r1Text:'#FFFFFF', r2:'#F9B612', body:'#EAEDF7', bodyText:'#304CB2' }, // Southwest
  'B6': { r1:'#003876', r1Text:'#FFFFFF', r2:'#00A1DE', body:'#EAF0F7', bodyText:'#003876' }, // JetBlue
  'HA': { r1:'#4B286D', r1Text:'#FFFFFF', r2:'#E0218A', body:'#F4EFF7', bodyText:'#4B286D' }, // Hawaiian
  'F9': { r1:'#0E5FB0', r1Text:'#FFFFFF', r2:'#0F6744', body:'#F1F7FC', bodyText:'#0A3D6B' }, // Frontier — r1 stays deep blue for --banner-bg (dark card ink); the VISIBLE top banner is lightened to Frontier sky-blue in fids-core (green wordmark reads on it). Accent green / white body.

  /* ── International ──────────────────────────────────────────────────── */
  'LH': { r1:'#05164D', r1Text:'#FFFFFF', r2:'#FFB81C', body:'#F1F2F4', bodyText:'#05164D' }, // Lufthansa
  'BA': { r1:'#075AAA', r1Text:'#FFFFFF', r2:'#EB2226', body:'#EEF3F8', bodyText:'#075AAA' }, // British Airways
  'AF': { r1:'#051039', r1Text:'#FFFFFF', r2:'#ED1C24', body:'#EFF2F7', bodyText:'#051039' }, // Air France — bar in navy PMS 296 C, the value of the accent table and of its site
  'KL': { r1:'#003876', r1Text:'#FFFFFF', r2:'#00A1DE', body:'#EAF0F7', bodyText:'#003876' }, // KLM
  'EK': { r1:'#D71921', r1Text:'#FFFFFF', r2:'#C9A24B', body:'#F7EFEF', bodyText:'#7A0F14' }, // Emirates
  'QR': { r1:'#5C0931', r1Text:'#FFFFFF', r2:'#A4925A', body:'#F2EEF0', bodyText:'#5C0931' }, // Qatar — bar in the burgundy of its site, as the two tables in fids-core.js now give it
  'IB': { r1:'#D7192D', r1Text:'#FFFFFF', r2:'#F2B233', body:'#F7EEEF', bodyText:'#8A0F1C' }, // Iberia
  // The carriers that had no row, so their band, date bar, lower panel and phone header were the house
  // grey and navy. Each value is read off the airline's own site.
  // Royal Air Maroc, the tokens of royalairmaroc.com (ram-airways-theme styles.css): secondary #690A22,
  // primary #C20831, tertiary gold #B49360, background-accent2 #F6F2ED, text-dark #1A1717.
  'AT': { r1:'#690A22', r1Text:'#FFFFFF', r2:'#C20831', r3:'#B49360', body:'#F6F2ED', bodyText:'#1A1717' }, // Royal Air Maroc
  // VietJet, the theme palette of vietjetair.com: primary dark #6F0000 and primary light #D91A21 (its
  // main #EC2029 holds white words at 4.4:1 only), secondary yellow #FBB612, background #F1F1F1, text #333333.
  'VJ': { r1:'#6F0000', r1Text:'#FFFFFF', r2:'#D91A21', r3:'#FBB612', body:'#F1F1F1', bodyText:'#333333' }, // VietJet
  // AirAsia X and Thai AirAsia: the AirAsia red of AK and QZ (#E32526, its logo); the dark red #8D1414,
  // the grey #F4F4F4 and the text #2C2B2F of airasia.com, the booking site of every AirAsia airline.
  'D7': { r1:'#8D1414', r1Text:'#FFFFFF', r2:'#E32526', body:'#F4F4F4', bodyText:'#2C2B2F' }, // AirAsia X
  'FD': { r1:'#8D1414', r1Text:'#FFFFFF', r2:'#E32526', body:'#F4F4F4', bodyText:'#2C2B2F' }, // Thai AirAsia
  // Royal Brunei, flyroyalbrunei.com: the browns #412D12 and #645138 its booking box sets (white type on
  // #645138 there), the yellow of its logo #FFE600 (rba-logo.svg) for the line under the titles, the grey
  // #F5F5F5 of its stylesheet. Not the yellow for the tabs: the gate sets white words on its accent.
  'BI': { r1:'#412D12', r1Text:'#FFFFFF', r2:'#645138', r3:'#FFE600', body:'#F5F5F5', bodyText:'#412D12' }, // Royal Brunei
  // Air Côte d’Ivoire, the global colours of aircotedivoire.com: dark green #027031 (its primary green
  // #1BA455 holds white words at 3.2:1 only), its dark orange #BF5613 for the line under the titles and
  // the square of its phone header, pale green #EDF4EF.
  'HF': { r1:'#027031', r1Text:'#FFFFFF', r2:'#027031', r3:'#BF5613', body:'#EDF4EF', bodyText:'#027031' }, // Air Côte d’Ivoire
  // ASKY, flyasky.com: the brown #6C321A and the grey #F3F3F3 of asky.css, the gold of the swoop of its
  // logo #F2A41E (ASKY-Airlines-Logo.jpg) for the line under the titles.
  'KP': { r1:'#6C321A', r1Text:'#FFFFFF', r2:'#6C321A', r3:'#F2A41E', body:'#F3F3F3', bodyText:'#6C321A' }, // ASKY

  /* ── Latin America ─────────────────────────────────────────────────── */
  'AV': { r1:'#202020', r1Text:'#FFFFFF', r2:'#D6001C', body:'#F2F2F2', bodyText:'#0F172A' }, // Avianca
  'OB': { r1:'#0D2B60', r1Text:'#FFFFFF', r2:'#1E6FD0', body:'#EAF0F8', bodyText:'#0D2B60' }, // Boliviana de Aviación (BoA — clean royal blue accent)
  'LA': { r1:'#1B0088', r1Text:'#FFFFFF', r2:'#ED1650', body:'#EEEDF7', bodyText:'#1B0088' }, // LATAM
  '4C': { r1:'#1B0088', r1Text:'#FFFFFF', r2:'#ED1650', body:'#EEEDF7', bodyText:'#1B0088' }, // LATAM Colombia — prints LATAM, takes its row
  'CM': { r1:'#0032A0', r1Text:'#FFFFFF', r2:'#0E68FF', body:'#EAEDF7', bodyText:'#0032A0' }, // Copa — bar and tabs in Copa blue and the bright blue of its site
  'DM': { r1:'#520E77', r1Text:'#FFFFFF', r2:'#733C90', r3:'#FEC404', body:'#F6F3F8', bodyText:'#370850' }, // Arajet — the purples and the yellow of its emblem; the pale tint and the dark purple of its own site
  'AM': { r1:'#0B2343', r1Text:'#FFFFFF', r2:'#007DC5', body:'#EAEDF2', bodyText:'#0B2343' }  // Aeroméxico
};
