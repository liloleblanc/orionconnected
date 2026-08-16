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
  // v23176 — AC Red is #F01428, not #D82F2E. Source: Air Canada usage guideline
  // (aircanada.com/.../ACF_Guidelines_en.pdf): "AC Red  PMS 1795 C / 2035 U
  // CMYK 0.96.93.2  RGB 240.20.40  HEX #F01428". Corroborated — #F01428 is the
  // red inside Air Canada's own logo files in this repo. r1 stays near-black:
  // the grey bar is Nick's deliberate choice, not a brand value.
  'AC': { r1:'#0A0A0A', r1Text:'#FFFFFF', r2:'#F01428', body:'#F7FAFD', bodyText:'#0F172A' }, // Air Canada (gray bar per Nick)
  'QK': { r1:'#0A0A0A', r1Text:'#FFFFFF', r2:'#F01428', body:'#F7FAFD', bodyText:'#0F172A' }, // Jazz / AC Express — same AC Red
  'RV': { r1:'#0A0A0A', r1Text:'#FFFFFF', r2:'#F01428', body:'#F7FAFD', bodyText:'#0F172A' }, // AC Rouge — same AC Red
  // v23176 — Pacific Blue #003C71 + Atlantic Teal #00AAA6. Both hexes are the
  // ones inside WestJet's own WestJet-leaf-colour.svg in this repo, and an
  // independent brand audit landed on the same pair. Was #003366/#00ABC2 —
  // each a few units off, which reads wrong beside the real logo.
  'WS': { r1:'#003C71', r1Text:'#FFFFFF', r2:'#00AAA6', body:'#EAF3F5', bodyText:'#003A5D' }, // WestJet (NAVY bar — white wordmark)
  // v23120 (Nick: 'with Porter a Cream colored background for the upper and
  // blue font') — warm latte cream banner, ink = the wordmark's own navy
  // (#152C53, sampled from porter.svg) so text and logo share one colour.
  'PD': { r1:'#EFE8DA', r1Text:'#152C53', r2:'#152C53', r3:'#254D87', body:'#EAEDF3', bodyText:'#112855' }, // Porter — cream upper / navy ink; was Blue Zodiac #112855
  'TS': { r1:'#0F4C81', r1Text:'#FFFFFF', r2:'#00A0DF', body:'#EAF1F7', bodyText:'#0F4C81' }, // Air Transat
  'F8': { r1:'#1C1C1C', r1Text:'#FFFFFF', r2:'#7AFF94', body:'#F0F4EE', bodyText:'#0F172A' }, // Flair — brand black + lime (sampled from their own livery file; old #39B54A was pre-rebrand)
  'PB': { r1:'#183677', r1Text:'#FFFFFF', r2:'#3E57BE', body:'#EAF0F8', bodyText:'#183677' }, // PAL Airlines (official navy bar + PAL blue, gold icons)
  'SP': { r1:'#183677', r1Text:'#FFFFFF', r2:'#3E57BE', body:'#EAF0F8', bodyText:'#183677' }, // PAL Airlines (alt code)
  'BQ': { r1:'#1B2A4A', r1Text:'#FFFFFF', r2:'#E1241B', body:'#EDEFF4', bodyText:'#1B2A4A' }, // Pascan
  // v23176 — Air Inuit's mark is a CORAL, not a pure red. #F1471D is in their own
  // logo file here and Brandfetch derives the same. (A separate audit proposed
  // #F0583A — same colour family, eyedropped; kept the double-sourced value.)
  '3H': { r1:'#1A1A1A', r1Text:'#FFFFFF', r2:'#F1471D', body:'#F2EEEC', bodyText:'#0F172A' }, // Air Inuit
  'MO': { r1:'#10243F', r1Text:'#FFFFFF', r2:'#C8102E', body:'#EAEFF5', bodyText:'#10243F' }, // Calm Air
  // v23176 — Perimeter is ORANGE. The old #1B75BC blue appears nowhere in their
  // identity — it read as an untouched placeholder. #FF8024 is in their logo file
  // here and Brandfetch agrees. (Audit proposed #F36D21; same family, eyedropped.)
  'YP': { r1:'#1C3050', r1Text:'#FFFFFF', r2:'#FF8024', body:'#EBEFF4', bodyText:'#1C3050' }, // Perimeter
  'JV': { r1:'#910028', r1Text:'#FFFFFF', r2:'#C8102E', body:'#F6ECEE', bodyText:'#910028' }, // Bearskin Airlines (crimson #910028 sampled from logo)
  'WT': { r1:'#CD342B', r1Text:'#FFFFFF', r2:'#E1241B', body:'#F7ECEB', bodyText:'#9A241D' }, // Wasaya Airways (red #CD342B sampled from logo)
  'NSA': { r1:'#B01117', r1Text:'#FFFFFF', r2:'#F9A51A', body:'#F6EEE6', bodyText:'#8A0D12' }, // North Star Air (red #B01117 + gold #F9A51A sampled from logo)
  // v23176 — Canadian North is RED, not cyan. The blue/cyan pair was the
  // PRE-MERGER identity retired in Nov 2019. #CD163F is in their logo file here
  // and Brandfetch agrees. (Audit proposed #BA0C2F = PMS 200 C.)
  // ⚠ r1 still the old blue — the airline reads red+grey, so the BAR is likely
  // wrong too, but no source settles it. Left for Nick.
  '5T': { r1:'#003F87', r1Text:'#FFFFFF', r2:'#CD163F', body:'#EAEFF6', bodyText:'#003F87' }, // Canadian North
  '4N': { r1:'#13294B', r1Text:'#FFFFFF', r2:'#F2A900', body:'#F3F0E8', bodyText:'#13294B' }, // Air North
  'WG': { r1:'#0B1F3A', r1Text:'#FFFFFF', r2:'#E4002B', body:'#EAF0F6', bodyText:'#0B1F3A' }, // Sunwing

  /* ── United States ──────────────────────────────────────────────────── */
  'DL': { r1:'#003366', r1Text:'#FFFFFF', r2:'#C01933', body:'#F4F6F9', bodyText:'#003366' }, // Delta (official)
  // v23176 — r1 was #101820, which is not an American colour. Their published
  // dark is AA Dark Gray #36495A (PMS 7545 C, CMYK 50/28/14/56) — the colour
  // their own headlines and body copy use. r2 #0078D2 is AA Blue, already exact.
  // Source: American Airlines Advertising Guidelines v3.0 (Mar 2015), slide 15,
  // which states: "Always use the exact color values listed."
  // ⚠ AA Red #C30019 is marked "used exclusively in online advertising" — must
  // NOT become a board accent.
  'AA': { r1:'#36495A', r1Text:'#FFFFFF', r2:'#0078D2', body:'#E8EAEC', bodyText:'#0F172A' }, // American
  'UA': { r1:'#0033A0', r1Text:'#FFFFFF', r2:'#0033A0', r3:'#69B3E7', body:'#E9EBEE', bodyText:'#0C2340' }, // United — OFFICIAL: Rhapsody Blue #0C2340 (dark) / United Blue #0033A0 / Sky Blue accent (Nick-approved)
  'AS': { r1:'#01426A', r1Text:'#FFFFFF', r2:'#2774AE', body:'#EDF2F6', bodyText:'#01426A' }, // Alaska (official)
  'WN': { r1:'#304CB2', r1Text:'#FFFFFF', r2:'#F9B612', body:'#EAEDF7', bodyText:'#304CB2' }, // Southwest
  'B6': { r1:'#003876', r1Text:'#FFFFFF', r2:'#00A1DE', body:'#EAF0F7', bodyText:'#003876' }, // JetBlue
  'HA': { r1:'#4B286D', r1Text:'#FFFFFF', r2:'#E0218A', body:'#F4EFF7', bodyText:'#4B286D' }, // Hawaiian
  'F9': { r1:'#0E5FB0', r1Text:'#FFFFFF', r2:'#00854D', body:'#F1F7FC', bodyText:'#0A3D6B' }, // Frontier — r1 stays deep blue for --banner-bg (dark card ink); the VISIBLE top banner is lightened to Frontier sky-blue in fids-core (green wordmark reads on it). Accent green / white body.

  /* ── International ──────────────────────────────────────────────────── */
  // v23176 — Lufthansa Yellow is #FFAD00, not #FFB81C. Source: Lufthansa Brand
  // Guidelines (frontify.lufthansa.com), Colour section. LH Deep Blue #05164D was
  // already correct. ⚠ Their rule: "Blue and yellow surfaces are not placed next
  // to each other or over each other" — relevant if the accent paints tabs
  // sitting directly on the blue bar.
  'LH': { r1:'#05164D', r1Text:'#FFFFFF', r2:'#FFAD00', body:'#F1F2F4', bodyText:'#05164D' }, // Lufthansa
  'BA': { r1:'#075AAA', r1Text:'#FFFFFF', r2:'#EB2226', body:'#EEF3F8', bodyText:'#075AAA' }, // British Airways
  'AF': { r1:'#002157', r1Text:'#FFFFFF', r2:'#ED1C24', body:'#EFF2F7', bodyText:'#002157' }, // Air France
  'KL': { r1:'#003876', r1Text:'#FFFFFF', r2:'#00A1DE', body:'#EAF0F7', bodyText:'#003876' }, // KLM
  'EK': { r1:'#D71921', r1Text:'#FFFFFF', r2:'#C9A24B', body:'#F7EFEF', bodyText:'#7A0F14' }, // Emirates
  'QR': { r1:'#5C0632', r1Text:'#FFFFFF', r2:'#A4925A', body:'#F2EEF0', bodyText:'#5C0632' }, // Qatar
  'IB': { r1:'#D7192D', r1Text:'#FFFFFF', r2:'#F2B233', body:'#F7EEEF', bodyText:'#8A0F1C' }, // Iberia
  // v23176 — Icelandair had a logo mapping but NO colour row, so it fell through
  // to defaults. Source: Icelandair brand portal (brandpad.io/icelandair):
  // Midnight Blue #001B71 (signature), Basalt Grey #303030, Snow White #FBFBFB,
  // then SIX accents — Crisp Blue #54C0E8, Fiery Magenta #FF47B3, Boreal Blue
  // #91F5E1, Volcanic Green #50E68C, Golden Yellow #FFDA00, Arctic Lilac #BE00FF.
  // No single accent is designated primary; Crisp Blue chosen as the most legible
  // on a departure board. Swap r2 for any of the other five if Nick prefers.
  'FI': { r1:'#001B71', r1Text:'#FFFFFF', r2:'#54C0E8', r3:'#303030', body:'#EAEFF8', bodyText:'#001B71' }, // Icelandair

  /* ── Latin America ─────────────────────────────────────────────────── */
  'AV': { r1:'#202020', r1Text:'#FFFFFF', r2:'#D6001C', body:'#F2F2F2', bodyText:'#0F172A' }, // Avianca
  'OB': { r1:'#0D2B60', r1Text:'#FFFFFF', r2:'#1E6FD0', body:'#EAF0F8', bodyText:'#0D2B60' }, // Boliviana de Aviación (BoA — clean royal blue accent)
  'LA': { r1:'#1B0088', r1Text:'#FFFFFF', r2:'#ED1650', body:'#EEEDF7', bodyText:'#1B0088' }, // LATAM
  'CM': { r1:'#0033A0', r1Text:'#FFFFFF', r2:'#0EA5E9', body:'#EAEDF7', bodyText:'#0033A0' }, // Copa
  'AM': { r1:'#0B2343', r1Text:'#FFFFFF', r2:'#007DC5', body:'#EAEDF2', bodyText:'#0B2343' }  // Aeroméxico
};
