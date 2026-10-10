'use strict';
// ━━ BOARD-LANGUAGES POLICY: WHAT THE GUARD READS, AND ITS REVIEWED LISTS ━━━━
//
// Every list entry here is visible in a diff, and every exception carries a
// reason from a fixed set:
//     operator   only an operator sees it (toolbar, override panel, login,
//                test-flight form, admin overlays)
//     brand      a name that stays as written in every language
//     unit       a unit of measure
//     code       an identifier, code or format token, not a word
//     data       a value from a feed or a data table, not a label
//     debug      drawn only with a debug switch on
// "passenger" is never a reason: a passenger word goes in the store
// (fids-current/js/board-strings.js) or, until it is fixed, in the debt
// ledger (tests/i18n/debt.json), which can only shrink.
//
// An entry that matches nothing fails the guard, so these lists cannot rot
// into blanket passes.

const REASONS = ['operator', 'brand', 'unit', 'code', 'data', 'debug'];

// ── SCOPE ─────────────────────────────────────────────────────────────────
// Pages a passenger sees. Every script and stylesheet they load must be
// classified below; an unclassified one fails (a new file cannot escape the
// guard by being new).
const PASSENGER_PAGES = [
  'fids-current/fids.html', 'fids-current/gids.html', 'fids-current/bids.html',
  'fids-current/tour.html', 'fids-current/rotate.html', 'fids-current/index.html',
  'fids-current/heritage.html', 'fids-current/heritage-board.html',
  'fids-current/app.html', 'fids-current/studio/player.html'
];

// Scripts whose strings reach a passenger screen. Checked by every check.
const PASSENGER_SCRIPTS = [
  'fids-current/js/board-strings.js',
  'fids-current/js/fids-core.js',
  'fids-current/js/fids-v2.js',
  'fids-current/js/gate-date-context.js',
  'fids-current/js/fids-sun.js',
  'fids-current/js/gate-visual-integrity.js',
  'fids-current/js/feed-router.js',
  'fids-current/js/gids-layout.js',
  'fids-current/js/gids-mobile-nav.js',
  'fids-current/js/template-renderer.js',
  'fids-current/js/studio-render.js',
  'fids-current/js/studio-data.js',
  'fids-current/js/studio-player.js',
  'fids-current/js/heritage-board.js',
  'fids-current/js/heritage-index.js',
  // Data files: scanned like every other script, so a label cannot hide in
  // one; their tables are registered in DATA_TABLES below.
  'fids-current/js/shared-names.js',
  'fids-current/js/airport-coords.js',
  'fids-current/js/airport-runways.js',
  'fids-current/js/studio-airports.js',
  'fids-current/data/airline-colors.js'
];

// Stylesheets passenger pages load. Checked for CSS `content:` text (B9).
const PASSENGER_STYLES = [
  'fids-current/css/font.css', 'fids-current/css/airport-fonts.css', 'fids-current/css/leaflet-embed.css',
  'fids-current/css/shared.css', 'fids-current/css/fids.css', 'fids-current/css/flight-display.css',
  'fids-current/css/baggage-display.css', 'fids-current/css/mobile.css', 'fids-current/css/mobile-display.css',
  'fids-current/css/display-overrides.css', 'fids-current/css/gate-display.css', 'fids-current/css/hotel-ads.css',
  'fids-current/css/gids-mobile.css', 'fids-current/css/entry.css', 'fids-current/css/heritage-board.css',
  'fids-current/css/studio-modules.css', 'fids-current/css/studio-canvas.css', 'fids-current/css/studio-player.css',
  'fids-current/css/phone.css'
];

// Loaded by passenger pages, and not passenger text: operator UI and vendor
// code only, each with its reason. A data file is a passenger script (above)
// whose tables are DATA_TABLES. This list may not grow without an approval
// recorded in tests/i18n/approved-exceptions.json (ratcheted against main).
const NON_PASSENGER = {
  'fids-current/js/host-airport.js': 'code: maps an airport code to the code passengers see',
  'fids-current/js/menu.js': 'operator: the operator menu',
  'fids-current/js/menubar.js': 'operator: the operator menu bar',
  'fids-current/js/editor-roles.js': 'operator: editor role checks',
  'fids-current/js/auth.js': 'operator: sign-in',
  'fids-current/js/ui-options.js': 'operator: operator display options',
  'fids-current/js/local-media.js': 'operator: media library',
  'fids-current/js/media-adjust.js': 'operator: media adjustment panel',
  'fids-current/js/media-base.js': 'operator: media library',
  'fids-current/js/screen-capture.js': 'operator: screen capture tool',
  'fids-current/js/studio-schema.js': 'operator: the Studio document schema and editor labels',
  'fids-current/css/menu.css': 'operator: the operator menu',
  // loaded only by the Studio editor (studio/index.html) and the board
  // designer (designer.html), operator pages
  'fids-current/js/studio.js': 'operator: the Studio editor',
  'fids-current/js/studio-compat.js': 'operator: the Studio editor',
  'fids-current/js/designer.js': 'operator: the board designer',
  'fids-current/css/studio.css': 'operator: the Studio editor',
  'fids-current/css/studio-pilot.css': 'operator: the Studio editor',
  'fids-current/css/studio-sections.css': 'operator: the Studio editor',
  'fids-current/css/designer.css': 'operator: the board designer',
  '/mapcdn/leaflet.js': 'code: map library (vendor)',
  '/mapcdn/leaflet-arc.js': 'code: map library (vendor)'
};

// ── THE STORE AND THE FROZEN LEGACY TABLES ───────────────────────────────
const STORE_FILE = 'fids-current/js/board-strings.js';
const LANGS = require('../../fids-current/js/board-strings.js').LANGS;

// Every table that held passenger words before the store existed. Each is
// held to every rule (all nine languages, no English left behind, one key
// per declaration). Their KEY SETS ARE FROZEN (tests/i18n/legacy-keys.json):
// a new key belongs in board-strings.js, and the helpers below fall through
// to it. `keyIsEnglish` tables are keyed by their English text.
const LEGACY_STORES = [
  { file: 'fids-current/js/fids-core.js', name: 'LS', helpers: ['TL', 'TLF', 'TLbi'] },
  { file: 'fids-current/js/fids-core.js', name: 'SS', helpers: ['SL', 'SLbi'] },
  { file: 'fids-current/js/fids-core.js', name: '_GATE_LBL', helpers: ['_gateLbl', '_gateLbl1', '_gateLblSpans', '_g8SignPair', '_g8SignLines', '_g8SignNext'] },
  { file: 'fids-current/js/fids-core.js', name: '_WXLBL', helpers: ['_wxPair', '_wxPairT', '_wxPairS', '_wxPairD'] },
  // AD_I18N is the ad-copy table, keyed by the English line: it grows with
  // every new ad (B6 requires the row), so it is not frozen (L1).
  { file: 'fids-current/js/fids-core.js', name: 'AD_I18N', keyIsEnglish: true, growable: true, helpers: ['adTL'] },
  { file: 'fids-current/js/fids-core.js', name: '_AIR_TPL' },
  { file: 'fids-current/js/fids-core.js', name: '_DT_TPL' },
  { file: 'fids-current/js/fids-core.js', name: '_DT_SHORT' },
  { file: 'fids-current/js/fids-v2.js', name: 'TX', helpers: ['fidsT'] },
  { file: 'fids-current/tour.html', name: 'CARD_LABELS' },
  { file: 'fids-current/js/studio-render.js', name: 'TRANSLATED_TITLES' },
  { file: 'fids-current/app.html', name: 'I18N', helpers: ['T'] },
  { file: 'fids-current/js/heritage-board.js', name: 'L' },
  { file: 'fids-current/js/heritage-board.js', name: 'STATUS' }
];

// Helpers that look a literal key up, and the tables each reads (B6).
const KEY_HELPERS = {
  TL: ['LS', 'STR'], TLF: ['LS', 'STR'], TLbi: ['LS', 'STR'],
  SL: ['SS', 'STR'], SLbi: ['SS', 'STR'],
  _gateLbl: ['_GATE_LBL', 'STR'], _gateLbl1: ['_GATE_LBL', 'STR'], _gateLblSpans: ['_GATE_LBL', 'STR'],
  _g8SignPair: ['_GATE_LBL', 'STR'], _g8SignLines: ['_GATE_LBL', 'STR'], _g8SignNext: ['_GATE_LBL', 'STR'],
  bs: ['STR'], bsFmt: ['STR'], bsPair: ['STR'],
  _wxPair: ['_WXLBL'], _wxPairT: ['_WXLBL'], _wxPairS: ['_WXLBL'], _wxPairD: ['_WXLBL'],
  adTL: ['AD_I18N'],
  fidsT: ['TX'],
  TLin: ['LS', 'STR'], SLpair: ['SS', 'STR'], _bidsHdr: ['LS', 'STR'],
  bsList: ['LISTS'], _tickerHtml: ['LISTS']
};
// Helpers whose name another file uses for a different helper: B6 reads
// these per file. { file: { helper: [tables] } }
const KEY_HELPERS_BY_FILE = {
  'fids-current/js/studio-render.js': { T: ['STR'], TU: ['STR'], TF: ['STR'] },
  'fids-current/js/fids-v2.js': { T: ['TX'] },
  'fids-current/app.html': { T: ['I18N'] }
};

// Language-keyed objects whose values are not words (video ids, artwork,
// locale codes). B1 and B3 skip them. { file, fn or name, reason }
const NONTEXT_TABLES = [
  { file: 'fids-current/js/fids-core.js', name: 'CITY_FR', reason: 'data: French city names (city names are decision D2)' },
  { file: 'fids-current/js/fids-core.js', name: 'SOFITEL_PROPERTY_NAME_FR', reason: 'brand: Sofitel property names in French' },
  { file: 'fids-current/js/fids-core.js', name: '_LOCKUP_LANG_MAP', reason: 'data: which ALL lockup artwork exists per language' },
  { file: 'fids-current/js/fids-core.js', name: '_allCrop', reason: 'data: lockup artwork crop boxes' },
  { file: 'fids-current/js/fids-core.js', name: '_ytPlaylistItemsByLang', reason: 'data: video ids per language' },
  { file: 'fids-current/js/fids-core.js', name: 'AC_VIDEO_PLAYLISTS', reason: 'data: Air Canada playlist ids per language' },
  { file: 'fids-current/js/fids-core.js', name: 'AC_VIDEO_HARDCODED', reason: 'data: Air Canada video ids per language' }
];

// Pages whose own wording waits on an open decision (docs/BOARD-LANGUAGES.md
// §6). Their gaps stay in the debt ledger, tagged with the decision; B7 does
// not hold their wording to the boards' meanwhile, since the decision may be
// to keep it as it is. { file: decision }
const DECISION_FILES = {
  'fids-current/app.html': 'D6',
  'fids-current/js/heritage-board.js': 'D11',
  'fids-current/heritage-board.html': 'D11',
  'fids-current/js/heritage-index.js': 'D11',
  'fids-current/heritage.html': 'D11'
};

// Data tables: their string values are data (names, codes, notes), not
// labels. B5 and B8 skip literals inside them. { file: { NAME: reason } }
const DATA_TABLES = {
  'fids-current/js/feed-router.js': {
    _QUALITY_ENUM: 'data: AeroDataBox\'s data-quality codes',
    _CSSTATUS_ENUM: 'data: AeroDataBox\'s codeshare-status codes',
    PANYNJ_HOME: 'data: the Port Authority airports\' codes and names',
    _CACHED_AIRPORTS: 'data: airport codes'
  },
  'fids-current/js/fids-core.js': {
    WELCOME_CARD_NO_EMBLEM: 'debug: why each carrier\'s Welcome card shows no emblem; read as yes or no, never rendered',
    AP: 'data: airport names (decision D2)',
    CITY_FR: 'data: French city names (decision D2)',
    FEED_SAYS_GATE_WORDS: 'debug: notes on which feeds publish gate words, never rendered',
    AIRLINE_AMENITIES: 'operator: notes on each airline, never rendered',
    AIRLINE_NAME: 'data: airline names',
    CITY: 'data: city names (decision D2)',
    IATA_AIRCRAFT: 'data: aircraft type names by IATA code',
    AC_VIDEO_DEST_MAP: 'data: destination names matched against video titles',
    ACCOR_BRAND_NAMES: 'data: Accor brand names',
    BRAND_WORDS: 'data: hotel brand names matched in a hotel\'s name',
    _known: 'data: hotel brand names matched in a hotel\'s name',
    luxury: 'data: hotel brand names that take the luxury layout',
    _NON_PASSENGER_PATTERNS: 'data: feed operator names that mark a non-passenger flight',
    _CITY_DISAMBIGUATION: 'data: place names sent to the geocoder',
    knownMakers: 'data: aircraft makers',
    FIDS_ICAO_EXCEPTIONS: 'data: ICAO airport codes',
    _OPNAMES: 'data: operating airline names',
    _AIRLINE_NAME_OVERRIDE: 'data: airline names',
    QC_LOCKUP_PAIRS: 'data: hotel property names',
    AP_LIST: 'data: airport names (decision D2)',
    DOWNTOWN_COORDS: 'data: city names and positions',
    HERITAGE_MARKS: 'data: heritage airline names and artwork',
    ALLIANCE_NAMES: 'data: the alliances\' own names (brands)',
    HOTEL_BRAND_RULES: 'data: hotel brand names, as a feed sends them and as the logo files are named',
    HERITAGE_CARRIERS: 'data: heritage airlines, their homes, fleets and networks (the words they show are BOARD_STR heritage entries)'
  },
  'fids-current/js/shared-names.js': {
    FIDS_SHARED_CITY: 'data: city names (decision D2)',
    FIDS_SHARED_AIRLINE: 'data: airline names',
    FIDS_SHARED_WORDMARK: 'data: airline wordmark files'
  },
  'fids-current/js/airport-coords.js': { AIRPORT_COORDS: 'data: airport positions' },
  'fids-current/js/airport-runways.js': { AIRPORT_RUNWAYS: 'data: runway geometry' },
  'fids-current/js/studio-airports.js': { AIRPORTS: 'data: airport names for the Studio (decision D2)' },
  'fids-current/data/airline-colors.js': { AIRLINE_BRAND_COLORS: 'data: airline colours' },
  'fids-current/app.html': {
    ACTYPE: 'data: aircraft type names',
    REGIONAL_OP: 'data: regional airline names',
    AIRPORTS: 'data: airport names (decision D2)',
    CITY: 'data: city names (decision D2)',
    CACHED_ICAO: 'data: airport codes'
  },
  'fids-current/js/heritage-board.js': {
    CARRIERS: 'data: heritage airline names',
    EQUIP: 'data: aircraft type names'
  }
};

// Property names whose values are feed data, not words: `quality: ['Live']`
// is AeroDataBox's data-quality flag, carried on every normalised row.
const DATA_KEYS = {
  quality: 'data: the feed row\'s data-quality flags (AeroDataBox shape)',
  basis: 'debug: which evidence named a flight\'s operator (fidsResolveOperator), never rendered',
  icao: 'data: an airport\'s ICAO code'
};

// Language lists of the shape [{ l: 'en', t: '…' }, …], registered and held
// to all nine languages. { file: { NAME: reason } }
const LANG_RECORD_TABLES = {
  'fids-current/js/fids-core.js': {
    _WX_INTRO_LINES: 'the weather card\'s opening title, which shows every language in turn'
  }
};

// ── REVIEWED EXCEPTIONS ──────────────────────────────────────────────────

// Stays exactly as written in every language. Matched against whole values
// and against words in markup.
const BRAND_TERMS = {
  'ACCOR · LIVE LIMITLESS': 'brand: Accor\'s tagline (French is its own)',
  'Premium Rouge': 'brand: Air Canada Rouge cabin',
  'United First': 'brand: United cabin',
  'United Economy': 'brand: United cabin',
  'PorterReserve': 'brand: Porter cabin (French is PorterRéserve)',
  'PorterClassic': 'brand: Porter cabin (French is PorterClassique)',
  'AvidTraveller': 'brand: Porter loyalty term (French is Grand Voyageur)',
  'VIPorter': 'brand: Porter loyalty programme',
  'Fly Porter': 'brand: Porter\'s own line',
  'MileagePlus': 'brand: United loyalty programme',
  'United Club': 'brand: United lounge',
  'United App': 'brand: United app',
  'SkyMiles': 'brand: Delta loyalty programme',
  'Rapid Rewards': 'brand: Southwest loyalty programme',
  'Mileage Plan': 'brand: Alaska loyalty programme',
  'TrueBlue': 'brand: JetBlue loyalty programme',
  'Miles & More': 'brand: Lufthansa Group loyalty programme',
  'Flying Blue': 'brand: Air France-KLM loyalty programme',
  'Executive Club': 'brand: British Airways loyalty programme',
  'Saga Club': 'brand: Icelandair loyalty programme',
  'Caribbean Miles': 'brand: Caribbean Airlines loyalty programme',
  'HawaiianMiles': 'brand: Hawaiian loyalty programme',
  'Frequent Flyer': 'brand: Qantas Frequent Flyer, the programme\'s name',
  'OpenStreetMap': 'brand: the map data credit the licence requires',
  'Priority Pass': 'brand: the lounge programme\'s name, the same in every language',
  'Hotels & Resorts': 'brand: the hotel brand line, as German brand copy writes it',
  'Canadian Partner': 'brand: Canadian Airlines\' feeder brand, as painted on the aircraft (heritage card)',
  'Green Key': 'brand: the eco-label (its Canadian programme is also Clé Verte)',
  'VIPorter Passport': 'brand: Porter\'s elite tier (French VIPorter Passeport); Porter publishes it in English and French only',
  'VIPorter Venture': 'brand: Porter\'s elite tier (French VIPorter Horizon)',
  'VIPorter Ascent': 'brand: Porter\'s elite tier (French VIPorter Essor)',
  'VIPorter First': 'brand: Porter\'s elite tier (French VIPorter Première)',
  'Wi\u2011Fi': 'brand: the Wi-Fi Alliance\'s trademark, written as is in every language but German (WLAN) and Arabic',
  // The boot screen's brand rail: the product's name and the words its
  // initials spell (F.I.D.S., G.A.T.E., B.A.G.S.), English by design.
  'Connecting Beyond': 'brand: Orion Connected\'s tagline',
  'Flight Information Display Screen': 'brand: what the letters F.I.D.S. spell',
  'Gate & Advertisement Terminal Experience': 'brand: what the letters G.A.T.E. spell',
  'Baggage Arrival Gateway Screen': 'brand: what the letters B.A.G.S. spell'
};

// Units of measure, left as written.
const UNIT_TERMS = ['km', 'km/h', 'kph', 'kt', 'kts', 'ft', 'min', 'mins', 'h', 'm', 'mph', '°C', '°F', 'C', 'F', '%', 'hPa', 'mm', 'cm', 'mi', 'nm'];

// A translation that is the same word as the English, by language, keyed by
// the English. Each is the language's own word ("Terminal" is German for
// terminal), not a missed translation.
const SAME_AS_ENGLISH = {
  'Terminal': { langs: ['fr', 'es', 'de', 'it', 'pt'], why: 'code: the word in each of these languages' },
  'Gate': { langs: ['de', 'it'], why: 'German and Italian airports say Gate' },
  'Boarding': { langs: ['de'], why: 'German airports say Boarding' },
  'Zone': { langs: ['fr', 'de'], why: 'the French and German word' },
  'Zones': { langs: ['fr'], why: 'the French word' },
  'Date': { langs: ['fr'], why: 'the French word' },
  'Destination': { langs: ['fr'], why: 'the French word' },
  'Distance': { langs: ['fr'], why: 'the French word' },
  'Altitude': { langs: ['fr', 'pt'], why: 'the French and Portuguese word' },
  'Type': { langs: ['fr'], why: 'the French word' },
  'Via': { langs: ['fr'], why: 'the French word' },
  'Page': { langs: ['fr'], why: 'the French word' },
  'ATTENTION': { langs: ['fr'], why: 'the French word' },
  'MINUTE': { langs: ['fr', 'de'], why: 'the French and German word' },
  'MINUTES': { langs: ['fr'], why: 'the French word' },
  'Restaurants': { langs: ['fr', 'de'], why: 'the French and German word' },
  'Restaurant': { langs: ['fr', 'de'], why: 'the French and German word' },
  'Wind': { langs: ['de'], why: 'the German word' },
  'Arr': { langs: ['fr'], why: 'the French abbreviation' },
  'International': { langs: ['fr', 'de'], why: 'the French and German word' },
  'Business Class': { langs: ['de', 'it'], why: 'the cabin name German and Italian airlines use' },
  'First Class': { langs: ['de'], why: 'the cabin name German airlines use' },
  'Club Class': { langs: ['de', 'it', 'pt'], why: 'the cabin name; pt Classe Club is also the French' },
  'Economy Class': { langs: ['de'], why: 'the cabin name German airlines use' },
  'Economy': { langs: ['de'], why: 'WestJet\'s cabin name in German' },
  'Premium': { langs: ['fr', 'es', 'de', 'it', 'pt'], why: 'WestJet\'s cabin name' },
  'Bar & lounge': { langs: ['de'], why: 'the German usage' },
  'From': { langs: ['pt'], why: 'Portuguese De is also the French' },
  'Airside': { langs: ['it'], why: 'the Italian word, Satellite, is also the French' },
  'from': { langs: ['pt'], why: 'Portuguese de is also the French' },
  'Status': { langs: ['de'], why: 'German airports use Status' },
  'Live': { langs: ['de'], why: 'German boards say Live' },
  'Hotels': { langs: ['de'], why: 'the German word' },
  'Menu': { langs: ['fr', 'it', 'pt'], why: 'the French, Italian and Portuguese word' },
  'Demonstration': { langs: ['de'], why: 'the German word' },
  '{TEMP} in {CITY}': { langs: ['de'], why: 'German in' },
  'Calgary · 1987–2001': { langs: ['fr', 'es', 'de', 'it', 'pt'], why: 'data: a city and two years' },
};

// Spanish, Italian and Portuguese share many words. A value two of them
// write the same is fine where each already writes its words elsewhere in
// the store (Programado, Zona, Neve); one new to a language is read as the
// other's word pasted in ('Tramo' in the Portuguese, 'Domani' in the
// Portuguese), unless it is listed here, keyed by the English, with the
// languages that really write it so (B3).
const SAME_ACROSS = {
  'expected': { langs: ['es', 'pt'], why: 'code: prevista (hora prevista) in both' },
  'Expected': { langs: ['es', 'pt'], why: 'code: Previsto, as Spanish and Brazilian airports write the status' },
  'Club Class': { langs: ['it', 'pt'], why: 'code: Classe Club, the cabin name in both' },
  'NEXT HOURS': { langs: ['es', 'pt'], why: 'code: PRÓXIMAS HORAS in both' },
  'Bar & lounge': { langs: ['it', 'pt'], why: 'code: Bar e lounge in both' },
  'Airside': { langs: ['es', 'pt'], why: 'code: Satélite in both' },
  'Remaining': { langs: ['es', 'pt'], why: 'code: Restante in both' },
  'Operator': { langs: ['es', 'pt'], why: 'code: Operador in both' },
  'Manufacturer': { langs: ['es', 'pt'], why: 'code: Fabricante in both' },
  'Range': { langs: ['it', 'pt'], why: 'code: Autonomia in both' },
  'Estimated': { langs: ['es', 'pt'], why: 'code: Estimado in both' },
  'King Bed': { langs: ['es', 'pt'], why: 'code: Cama King, as hotels in both write it' },
  'Date': { langs: ['it', 'pt'], why: 'code: Data in both' },
  'Sched.': { langs: ['es', 'pt'], why: 'code: Prog. (Programado) in both' },
  'MINUTE': { langs: ['es', 'it', 'pt'], why: 'code: MINUTO in all three' },
  'Restaurants': { langs: ['es', 'pt'], why: 'code: Restaurantes in both' },
  'Ecocertified': { langs: ['es', 'pt'], why: 'code: Ecocertificado in both' },
  'Language': { langs: ['es', 'pt'], why: 'code: Idioma in both' },
  'Typical Temp': { langs: ['es', 'pt'], why: 'code: Temp. típica in both' }
};

// Japanese written with exactly the characters Chinese uses, keyed by the
// English. Each was checked: both languages write the word this way (雨 is
// rain in both). Any other ja value equal to the zh one fails B3, so a
// Chinese row pasted into the Japanese ('明天' for 明日) is caught.
const SAME_JA_ZH = {
  'Rain': 'code: 雨 in both', 'Light Rain': 'code: 小雨 in both', 'Heavy Rain': 'code: 大雨 in both', 'Heavy rain': 'code: 大雨 in both',
  'Snow': 'code: 雪 in both', 'Light Snow': 'code: 小雪 in both', 'Heavy Snow': 'code: 大雪 in both', 'Heavy snow': 'code: 大雪 in both',
  'Feels like': 'code: 体感 in both', 'Feels': 'code: 体感 in both', 'Humidity': 'code: 湿度 in both',
  'Destination': 'code: 目的地 in both', 'your destination': 'code: 目的地 in both',
  'Speed': 'code: 速度 in both', 'Altitude': 'code: 高度 in both'
};

// A word of one of the Latin-script languages that is also an English word,
// and that no other translation in the store happens to use. Each is that
// language's own word (French 'destinations', Spanish 'general'), or the
// loanword its airports and hotels write ('check-in'). Any other English
// word inside a translation fails B3 ('Gate closes shortly' in German).
const NATIVE_WORDS = {
  es: { error: 'code: the Spanish word', general: 'code: the Spanish word (Embarque general)', taxi: 'code: the Spanish word', club: 'code: the cabin name as Spanish writes it (Clase Club)' },
  fr: {
    site: 'code: the French word (site web)', double: 'code: the French word (lit double)',
    programme: 'code: the French word', image: 'code: the French word', unique: 'code: the French word',
    dollars: 'code: the French word (dollars WestJet)', destinations: 'code: the French word', centre: 'code: the French word (centre-ville)',
    taxi: 'code: the French word', club: 'code: the cabin name as French writes it (Classe Club)'
  },
  de: { taxi: 'code: the German word', 'check-in': 'code: the word German airports use' },
  it: { 'check-in': 'code: the word Italian airports use', king: 'code: the bed size as Italian hotels write it (king size)', taxi: 'code: the Italian word' },
  pt: {
    'check-in': 'code: the word Brazilian airports use', site: 'code: the Brazilian word for a website', king: 'code: the bed size as Brazilian hotels write it',
    transfers: 'code: the word Brazilian airports use for airport transfers', resorts: 'code: the word Brazilian Portuguese uses'
  }
};

// Functions that only build operator UI. B5 and B8 skip them; each must
// exist in the file named.
const OPERATOR_FUNCTIONS = {
  'fids-current/js/fids-core.js': {
    saveOverride: 'operator: gate override panel',
    clearOverride: 'operator: gate override panel',
    updateOverrideBtn: 'operator: gate override panel',
    refreshAirlineBgPicker: 'operator: background picker',
    manageCustomBgUrls: 'operator: custom background manager',
    attemptLogin: 'operator: sign-in',
    menuSearchFlight: 'operator: the menu\'s flight search',
    updateSubScreens: 'operator: the screen selector',
    _paintFeedSource: 'operator: the control bar\'s feed-source badge (#apiLabel)',
    openTestFlight: 'operator: the test-flight form',
    submitTestFlight: 'operator: the test-flight form',
    getAirlineBgSlideLabel: 'operator: the background picker\'s slide names (menu dropdown)',
    setCityCodeAccent: 'operator: the menu\'s code-accent switch',
    changeScreenType: 'operator: the menu\'s screen-type switch',
    showAllOverrides: 'operator: the overrides list',
    vecteezySearchStock: 'operator: the stock-footage search',
    vecteezyImportLibraryItem: 'operator: the stock-footage import'
  },
  'fids-current/index.html': {
    attemptLogin: 'operator: sign-in'
  },
  'fids-current/js/studio-player.js': {
    renderSetup: 'operator: the player\'s setup screen, before a display is chosen',
    dataBadge: 'operator: which data source the player is reading (preview, read-only, fallback)'
  },
  'fids-current/js/studio-render.js': {
    canvasHTML: 'operator: the editor canvas\'s empty-document hint',
    imageBlockContent: 'operator: the editor placeholder for an image block',
    rampMilestonesContent: 'operator: a staff baggage-operations module',
    transferBagsContent: 'operator: a staff baggage-operations module',
    beltHealthContent: 'operator: a staff baggage-operations module',
    passengerPreviewContent: 'operator: a staff module previewing the passenger display'
  }
};

// Code allowed to write into a name table at run time (B16 otherwise
// refuses it: a run-time CITY_FR.YUL = … is the CITY_FR collapse again,
// where no duplicate-key check can see it). '-' is a page's top-level code.
// { file: { fn: { tables: [names], why } } }
const DATA_WRITERS = {
  'fids-current/js/fids-core.js': {
    _heritageInstallBranding: { tables: ['AIRLINE_NAME'], why: 'data: a heritage gate takes its carrier\'s historic name' }
  },
  'fids-current/js/studio-player.js': {
    ensurePilotRouter: { tables: ['AP'], why: 'data: publishes the airport\'s time zone where the shared feed router reads it' }
  },
  'fids-current/app.html': {
    '-': { tables: ['AP', 'CITY'], why: 'data: the app builds its time-zone and city maps from its airport catalogue and the shared names at load' }
  }
};

// Functions allowed to rewrite text nodes on a timer (B13). They handle
// data (city names, airport codes), and may not hold a language table.
const TEXT_REWRITERS = {};

// Functions allowed to read or write fids_langs_<IATA> (B11): toggleLang is
// the only writer; the boot path and _restoreApLangs read it for the
// resolver.
const LANG_STORAGE_FUNCTIONS = {
  'fids-current/js/fids-core.js': {
    toggleLang: 'code: the one writer of the saved languages',
    _restoreApLangs: 'code: reads the saved languages for bsResolveLangs',
    applyAirportConfigToBoard: 'code: reads the saved languages for bsResolveLangs'
  }
};

// Functions allowed to take a language by its position in `langs` (B11):
// the board starts on its first language. Every other use goes through
// bsPairLangs (the pair) or `lang` (the language on screen).
const LANG_POSITION_FUNCTIONS = {
  'fids-current/js/fids-core.js': {
    _restoreApLangs: 'code: the board starts on its first language',
    startLangRotation: 'code: the rotation starts on the first language',
    applyAirportConfigToBoard: 'code: the board starts on its first language',
    startPaging: 'code: paging starts on the first language'
  }
};

// Pages a passenger script opens that are not passenger pages, each with its
// reason (C2). A new one needs a recorded approval, like every exception.
const NON_PASSENGER_PAGES = {
  'fids-current/picker.html': 'operator: the airport and screen picker',
  'fids-current/screen.html': 'operator: the pairing screen an unclaimed display shows to its installer',
  'fids-current/designer.html': 'operator: the board designer',
  'fids-current/menu.html': 'operator: the operator menu page',
  'fids-current/studio/index.html': 'operator: the Studio editor',
  'fids-current/assets/asset-library.html': 'operator: the asset library'
};

module.exports = {
  REASONS, PASSENGER_PAGES, PASSENGER_SCRIPTS, PASSENGER_STYLES, NON_PASSENGER, STORE_FILE, LANGS, DATA_TABLES, DATA_KEYS, LANG_RECORD_TABLES,
  LEGACY_STORES, KEY_HELPERS, KEY_HELPERS_BY_FILE, NONTEXT_TABLES, BRAND_TERMS, UNIT_TERMS, SAME_AS_ENGLISH, SAME_ACROSS, SAME_JA_ZH, NATIVE_WORDS, DECISION_FILES,
  OPERATOR_FUNCTIONS, TEXT_REWRITERS, LANG_STORAGE_FUNCTIONS, LANG_POSITION_FUNCTIONS, NON_PASSENGER_PAGES, DATA_WRITERS
};
