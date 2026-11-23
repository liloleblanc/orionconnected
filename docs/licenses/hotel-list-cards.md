# The hotel lists (gate centre deck, and the full list in the phone app)

Free guest information by area for the city a gate's flight goes to, when that city has a
checked list (Moncton YQM, Charlottetown YYG, Halifax YHZ, Fredericton YFC and Toronto YYZ so far); Toronto is a
hub city with two pages of its own (below); every other city the board
names gets one "Hotels in {CITY}" card with a scan code to a map search (below). One slot of the centre deck shows the
cards in turn: **Airport hotels**, **Downtown hotels**, **Nearby hotels** and **Resorts worth the
drive**. Each card is a list and nothing else: the hotel's logo on one cream column where an
official file reads there, its name, its street address and its telephone. Five lines a card;
an area with more shows the next five on the next pass of the deck. A verified airport shuttle
carries a mark, with the legend in the foot. Nothing closed for the season is shown. No pictures,
no prices, no offers, no slogans. One scan code a card opens the whole list of the city in the
phone app (`app.html?hotels=YQM&area=downtown`), with a button that calls each hotel and one for
its website.

The Accor pages (the paid full-page look) and the page of the Algonquin Resort are separate
slides of the same deck and are not changed by this.

Code: `fids-current/js/hotel-list-card.js` (rules, cards, scan codes), `fids-current/css/hotel-list-card.css`,
four hooks in `fids-current/js/fids-core.js` (the deck builder puts the slide after the last Accor
page, the skip loop, the dwell, the preloader), the list view in `fids-current/app.html`, the
words in `fids-current/js/board-strings.js` (the `hotels…` and `hotel…` keys, nine languages each), and a credits line
for the faces (`credHotelListFaces`). Tests: `tests/hotel-list-cards.test.js`, `tests/hotel-catalog-match.test.js`.
Review link: `gids.html?ap=<any>&gate=<n>&hotellist=YYG&scene=hotellist` shows a city's cards on any gate;
`&hotellist=YYZ` the two pages of Toronto.

## A hub city: two pages, near the airport and downtown (v24177)

A city too big for the area cards (`HotelListCard.HUBS`, Toronto YYZ so far, also in `CITIES`) shows two
pages in the same slot instead: **Near the airport**, then **Downtown**. A page shows only when its area has
at least three hotels open (`HUB_MIN`); a city with one page left holds it, as a one-card list is held, and the
dwell follows the real count of pages (ten seconds a page, the last one held four more). Each page, on the cream
of the list cards, at 1680x1050:

- the head: the city in bronze capitals with its province (data, `hub.region`), **Where to stay**
  (`hotelsWhereToStay`) in the languages of the board, and at the right the scan code of the area
  (`app.html?hotels=YYZ&area=airport|downtown`);
- the bar between two gold rules: the name of the area (`hotelsAreaAirport`, `hotelsAreaDowntown`) and the
  count of its hotels open on the day, one line a language (`hotelsCountTwo|Few|Many|Other`, the plural form of
  each language as the home page counts airports; a count under two is not shown);
- how to get there beside a train mark: the data names a kind (`link`: **Free {LINE} train**,
  `hotelsTrainFree`; `ride`: **{LINE} to {STOP}** and **{MIN} min · every {EVERY} min**, `hotelsRideTo` and
  `hotelsRideTime`), and the line, its stop and its figures are data (`hub.areas.<area>.transit`), never words
  of the store, each read on its operator's own page; a way there that could not be read there stays in the
  checked file with `verified: false` and the reason in its note, and the build step leaves it off its page.
  Toronto: downtown, the UP Express to Union, 28 minutes, every 15 (upexpress.com, read 2026-11-22); near the
  airport, none: the airport's Link train is held as a line for the whole area, since its operator's own site,
  torontopearson.com, is blocked, and the pages that were read (Alt Hotel's own) show it reaching only Viscount
  station, where the Alt Hotel is, not the other airport hotels. It shows per hotel instead (below);
- how a hotel is reached from the terminals (v24178, `access` in the data), on the lines of the hotels it
  reaches: the train mark at the right of the line, then its stop of the airport's train (data, as written:
  **Viscount** for the Alt Hotel, from its own contact page) or the terminal it is joined to (the board's own
  word for a terminal, `arrTerminal`, and its number: **Terminal 3** | **Aérogare 3** for the Sheraton Gateway,
  from its brand page as read by a person in a browser on 2026-11-23). French writes Pearson's terminals
  "aérogare", as the UP Express's French page does ("située à l'aérogare 1",
  upexpress.com/fr/gares-up-express/gare-pearson, read 2026-11-23), and as the board already writes a
  destination's terminal. On a page with such a line, one legend line beside the same mark: **Link train from
  Terminal 1** (`hotelsTrainFrom`; the line and the terminal are data, `line` and `from`). Nothing about fares
  or hours: those would need the operator's own page. A note that gives way to a long name takes its legend
  with it when it was the last one;
- on a page that shows a verified shuttle mark, the legend of the mark (`hotelShuttle`) beside a bus mark;
- on a page with no card hotel, the place of a partner hotel in a dashed frame: **Partner hotel** and
  **Placement available** (`hotelsPartnerSlot`, `hotelsPlacement`), one line a language. It also shows on the
  stream tour whenever a gate there has a flight to Toronto;
- the card hotels (`card: true` in the data, at most two a page, `HUB_CARDS`): a fine gold frame on the cream
  (a border only, never a ground: no box behind a logo), the logo through `<img>` on the cream with a fine rule
  after it, the name, the street and the telephone. No word "partner" on a card. The gold look is decided from
  the data alone, so a line never changes look between passes;
- the lines: five, one less for each card hotel above them, never under three (`HUB_ROWS`, `HUB_ROWS_MIN`), the
  name at the left and at the right the shuttle mark where it is verified, else the street; the next lines on
  the next pass of the deck, none twice on a page, every hotel coming round. Where a hotel's way from the
  terminals is verified (`access`, above), that note takes the place of the shuttle mark and the street. A name
  still too long at the 18 px floor drops its note before it is cut;
- how many more the scan code lists (`hotelsMoreAirport`, `hotelsMoreDowntown`, a label form in the languages
  whose plural would change with the figure) and **Scan for the full list**, with **Scan** (`hotelsScan`) at the
  right; nothing more to list, the invitation alone;
- the navy foot: **Free guest information · no endorsement** (`hotelsNoEndorse`), one line a language.

The faces are the board's own, AC Nord Display (the heading, the area, the way there, the names) and AC Nord
Text (everything else), declared by `css/font.css`, which the gate loads before the lists' sheet; Japanese,
Chinese and Arabic take the script faces of the board. Nothing is under 18 px at 1680x1050.

A hub counts only as the city a flight goes to, never as one of its stops: a flight through Toronto to
Vancouver shows the Vancouver card, not Toronto's hotels (`cityFor`), and a flight through Toronto to a city the
board has no name for shows nothing (`findCity`). A hub with no area open to three hotels on the day shows its
"Hotels in Toronto" card instead, whose code opens the list in the app. Billy Bishop (YTZ) is not given the
Toronto list: its passengers are downtown already, and a page near Pearson would mislead them. The phone app
needs nothing new: once the city is in `CITIES` it lists both areas, and the scan code of each page opens its
area.

### Card hotels and the Accor catalog (checked by hand, never by a board)

A card hotel keeps, in the checked file, `card: true`, `card_id` (its id in the catalog it was checked
against: Fairmont Royal York A551, Novotel Toronto Centre 0931) and `card_brand` (FAI, NOV); its street and
telephone are verified on its brand property page (all.accor.com) like every fact. The slim copy carries only
`card: true`. The boards never ask the catalog for the lists: `node scripts/hotels/match-catalog.js YYZ`
(`--json` for JSON, `--save` to keep the two answers in `scripts/hotels/work/`, `--from <file>` to read saved
answers) asks the catalog through the board's own proxy once from the airport and once from the centre,
keeps the OPEN rows within each area by the distance the catalog returns and by the cards' own area rule on
the row's position, and prints the card hotels the catalog no longer lists, the catalog hotels in the two
areas that the file lacks as card hotels (with the entry of the file a name points to), and the differences of
name, street and telephone (the catalog's telephone read through its marks, `41/63678900` as
`(416) 367-8900`; a street only with a figure in it). It writes nothing to the data: a person settles each
difference on the hotel's own page and records it with its source and date. Run it by hand, never on a timer or
in the worker.

### Chain hotels: blocked, needs a person

Most chain hotels near Pearson rest on brand sites that refuse automated readers (Marriott, Hilton, IHG,
Choice, Hyatt, and the airport's own site torontopearson.com, all 403 or a robot wall on 2026-11-22). They are
not read another way: each is in `excluded` with the page a person should read (`kind: "blocked"`, `read`). A
person who reads the page records each fact with that page and the date, moves the hotel into `hotels`, and
runs the build step; the airport page grows a line at a time, and a page only shows with three hotels.

On 2026-11-23 a person read seven of them in a browser (v24178), and each fact they read keeps its page, the
date and the method ("read by a person in a browser, 2026-11-23"), with the line they copied as its quote where
there is one. Listed: the Sheraton Gateway, the Element and the Four Points (one building at 6257 Airport Road,
each with its own telephone), the Hampton Inn & Suites and the Fairfield (marriott.com, hilton.com), and the
Quality Inn (visitmississauga.ca, Mississauga's official tourism site; the place is the OpenStreetMap hotel on
Airport Road between numbers 6257 and 6465). Shuttle marks from those brand pages for the Element, the Four
Points, the Hampton and the Fairfield; none for the Quality Inn, whose shuttle is named only on the tourism
listing (as the Hyatt Place), and none for the Sheraton Gateway, which is joined to Terminal 3 (its way there
is its access note). The Nu Hotel's page would not open for the person either: it stays excluded. Toronto now
lists 33 of 44: 9 near the airport, 24 downtown.

## Every other city: "Hotels in {CITY}" (v24176)

Every city gets a way to find a hotel; hand-checked lists stay only where a person checked them.
On a gate whose flight goes to a city that is not in `HotelListCard.CITIES`, the same slot of the
deck shows one card instead: the heading **Hotels in {CITY}** (`hotelsInCity`) in the languages of
the board, one large scan code, and under it, in the navy foot beside a phone mark, **Scan to
search hotels on your phone** (`hotelsFindScan`). Same family as the list cards (cream paper, navy
ink, a fine gold rule, Playfair Display and Montserrat), sized at 1680x1050 (heading 48 px, the
code as large as the card leaves room for, 420 px at most, the invitation 26 px). No logo, no
hotel, no price. One view, held 20 seconds (`FIND_MS`).

Behind the heading and the code, the city in its own photograph: the day picture the weather card
shows for it (`_wxCityPic` in `fids-core.js`), only from the board's own checked set
(`/logos/cities/<CODE>.jpg`), never the picture service, so every picture is one already picked,
licensed and recorded for the weather card (its source on the credits page). Where its licence
asks for a credit, the photographer is named beside the code with the weather card's own line
(`_wxPicCreditHtml`, 18 px, white). The heading turns white over a navy shade at the top of the
picture, and the code stands on a tile of the card's own cream, its quiet zone (never white). A
city with no picture of its own, or a board without the weather card, shows the plain cream card.

Where it shows: the city is chosen as `cityFor()` chooses a list city (the city the flight goes
to, then its stops from the last), for any code the board has a name for
(`airportCityNameSafe_v21877`, the city tables of every board; cased as the gate writes cities,
without the airport's own name a city with two of ours carries). It does not show when a city of
the flight has a checked list (the list shows), on a gate with no flight, for a code with no
name, or for the city of the screen itself. Review link: `?hotellist=YOW&scene=hotellist` shows the
card of a city without a list on any gate; `?hotellist=YQM` still shows the Moncton list; a code
the board has no name for is no link (the gate shows what it shows without one).

The scan code opens the phone app, `app.html?ap=<screen>&hotels=<code>&in=<where>` (`qrUrl`, no
area). `in` is where the city is, from the board's own tables (`HotelListCard.whereOf`): its
country (`_IATA_CC` in `fids-core.js`, the ISO code as that table gives it, so San Juan is `PR`)
and, in the United States and Canada, its state or province (`_rowRegion`, OurAirports' region):
`CA-NS`, `US-ME`, `DO`. For a city without a checked list the app shows a page in its own style:
the title **Hotels in {CITY}** and big buttons, **Search in Google Maps** (`hotelsMapGoogle`) and,
on an Apple device only (an iPhone, an iPad, a Mac), **Search in Apple Maps** (`hotelsMapApple`),
each opening its map in a new tab, with no tracking parameter (`HotelListCard.mapLinks`). On any
other phone Apple's link opens Apple's map on the web, which is not promised to every phone's
browser, so an Android phone is offered Google's alone. The search is the page's own title in the
phone's language, its city written with where it is (`HotelListCard.searchPlace`): the state or
province by its two letters, as the boards print them, then the country in the phone's language
(the browser's own names), left out where the city's name already says it. "Hotels in Sydney, NS,
Canada", never the Australian Sydney; "Hôtels à Santiago, République dominicaine". Without `in`
(a link typed by hand) the city of one of the app's own airports is written with its country.

- Google: the Maps URLs search action, as documented at
  developers.google.com/maps/documentation/urls/get-started (read 2026-11-22):
  `https://www.google.com/maps/search/?api=1&query=<search, URL-encoded>`. `api=1` is required, no
  API key is needed, and the search action takes no centre point: which city is meant has to be
  in the words of the search, hence the state, province and country above.
- Apple: the legacy Map Links form, `https://maps.apple.com/?q=<search, URL-encoded>&sll=<lat>,<lng>`
  (`q` is the query as if typed into the Maps search field, `sll` the search location, given alone
  or with `q`). The Map Links page (developer.apple.com/library/archive) now redirects to Apple's
  Unified Map URLs page (developer.apple.com/documentation/mapkit/unified-map-urls, read
  2026-11-22), which does not describe the legacy form; the `q` and `sll` text above was read only
  from a search index's extract of the old page, not from a current Apple page. The unified page
  documents `maps.apple.com/search?query=&center=` for iOS 18.4, macOS 15.4 and later only, so the
  legacy form is used; it is still to be checked on an iPhone running iOS 18.4 or earlier. The point is the city's airport
  (`js/airport-coords.js`, which the app already loads for the weather): the board's table of city
  centres (`DOWNTOWN_COORDS`) is in `fids-core.js`, which the app does not load. The query names
  the city; the point only tells which one (London, Ontario or London, England).

## The data: `scripts/hotels/data/<code>.json` (Moncton `yqm.json`, Charlottetown `yyg.json`, Halifax `yhz.json`, Fredericton `yfc.json`, Toronto `yyz.json`)

One checked file a city (Moncton and Charlottetown checked on 2026-11-16, Halifax on 2026-11-21, Fredericton and Toronto on 2026-11-22),
kept out of the site. The cities are one list,
`HotelListCard.CITIES` in `fids-current/js/hotel-list-card.js`: the build step, the phone app and
the tests read it, and fail on a checked file whose city is not in it. The site serves a slim
copy of each, `fids-current/data/hotels/<code>.json` (about 10 KB instead of about 120 KB, since
every gate with a flight to the city fetches it): only the hotels that are listed, and only the
fields the cards and the phone app read (id, name, area, address line, telephone, website,
season, shuttle mark, drive, logo; the marks of the foot; for a hub city also the street of each hotel,
`card: true` on its card hotels, a hotel's verified `access` (its kind, the line, the terminal it is taken from,
and its stop or its terminal, without their sources) and its hub block: the province and, for each area whose
way there is verified, its kind, its mark, the line, the stop and the figures, without their sources). `node scripts/hotels/build-runtime.js`
makes the slim copies from the checked files (`--check` only compares), and
`tests/hotel-list-cards.test.js` holds the two to agree: the same bytes, the same hotels on the
same cards on every day of a year, the same card markup.

In the checked file every hotel keeps, field by field, where it was read and whether it was
verified (`verified.<field>.verified`, `.source`, `.checked`); the shuttle and the
season keep their own source and evidence. `listed: false` holds a hotel back (the reason is
given); `excluded` lists the places left out (motels, hostels, apartment suites, places that have
closed or could not be confirmed) with the reason for each.

A hub city's file also has `hub` (after `points`): `region` (the province) and, for `airport` and `downtown`,
`transit` with its `kind`, `icon`, `line` (and for a ride its `stop`, `min` and `every`), `verified`, `source`,
`checked` and the `evidence` quoted from the page. Its hotels are in the two areas only; a nearby hotel is in
`excluded` (kind `nearby_not_checked`). The build step and the tests refuse a hub city without its hub block,
a hotel of a hub city outside the two areas, a card hotel without its logo, its verified street and telephone
or its `card_id`, and a hub block or a card hotel in any other city.

Sources: the hotels' own sites and brand property pages; Destination Moncton-Dieppe listings;
the Greater Moncton airport's hotels and transport pages (cyqm.ca); Tourism PEI listings (with
dates of operation); Charlottetown Airport's ground-transportation page (flyyyg.com); for Halifax,
the Discover Halifax and Tourism Nova Scotia listings (the map points come from the listings
and the hotels' own pages) and Halifax Stanfield's Visiting Halifax page (halifaxstanfield.ca); Halifax's civic address register
(HRM open data, Civic Addresses) to settle a street the listings disagree on; for Fredericton,
the Fredericton Capital Region listings (frederictoncapitalregion.ca, the city's official tourism
site, where tourismfredericton.ca now forwards; their map points give the distances) and the
Wyndham and Best Western property pages (the airport's site, yfcfredericton.ca, lists no hotels
and names no hotel shuttle; Tourism New Brunswick answered 403 with a Cloudflare page and was not
used; the Marriott, IHG, Hilton, Choice and Radisson pages answered 403, so those hotels rest on
the city listing alone); for Toronto, the hotels' own sites and brand property pages (all.accor.com for the
two card hotels; marriott.com, hilton.com and visitmississauga.ca read by a person in a browser on 2026-11-23 for
six airport hotels), the UP Express pages (upexpress.com) for the train, and Destination Toronto's hotel listing
(stay.destinationtoronto.com, a host of its own beside the blocked www.destinationtoronto.com, answered
normally; whether it counts as the official tourism site is recorded in the file's `unverified` for a person to
confirm: until then the five hotels and the one telephone that rest on it alone are held, `listed: false`);
OpenStreetMap (positions in Moncton and Charlottetown, and of the Riverside Resort near Fredericton, ODbL, "© OpenStreetMap contributors"); the OSRM public router on
OpenStreetMap roads for the drive distances to the resorts. A search index was used only for
some brand-hotel postal codes, which are marked `verified: false` (postal codes are not shown).

Areas, by straight-line distance from two points of the city: downtown within about 2 km of the
centre, airport within about 5 km of the airport, nearby the rest within about 30 km of either
(each "about" with 10 % tolerance; downtown is tested first, which matters in Charlottetown where
the core is only 5-6 km from the terminal); a destination resort past 30 km goes on the Resorts
card with its drive distance. Moncton's points are the board's own (`DOWNTOWN_COORDS.YQM` and
`airport-coords.js`). Charlottetown's are the terminal and City Hall from OpenStreetMap: YYG has no
`DOWNTOWN_COORDS` entry, and none was added, so the Accor search for Charlottetown is unchanged.
Fredericton's airport is the board's own (`airport-coords.js`, about 0.9 km from the terminal;
every hotel falls on the same card from either) and its centre City Hall, 397 Queen Street, from
OpenStreetMap: YFC has no `DOWNTOWN_COORDS` entry either, and none was added.

Seasons: `season.year_round`, or `season.open` ranges (month-day to month-day). The board checks
the day at the airport each time the deck is built, so a seasonal hotel comes back by itself.

## The logos: `fids-current/logos/hotels/list/`

`sources.json` beside the files names the official source of each (the hotel's own site, its
chain's site, brand page or press room, the tourism body, or Wikimedia Commons; never a
logo-download site), with its licence note. Files are unaltered. A one-colour or light-ground
version of a hotel's own logo, where the hotel publishes it only pale or white and it cannot read
on the cream, says so in its `origin` and still names the hotel's own file as its `source`: either
supplied for the cards, or made here by switching the colour of the hotel's own white file (to the
hotel's own dark colour where its pages show one, otherwise the card's navy), shapes unchanged and
only after no official dark version was found. Where a hotel publishes no logo at all, its name as its own site writes it may be set in the card face
(Montserrat SemiBold, the card navy, no ornament) by `scripts/hotels/typeset-name.py`, and its `origin` says it is the
name typeset, not a logo of its own. Where the hotel's or the brand's site refuses automated reads, the hotel keeps
the name alone until a file is supplied; the refusal is not worked around. Where a file has a wide transparent margin, the card
shows it through `object-view-box` (`logo.trim` in the data, measured from the file's own ink);
a stacked lockup whose words are small at the common logo height (the Algonquin, Delta Hotels,
Fairholm) may take the whole cell of the column (`logo.fill`);
a JPEG or a file with its own white plate is multiplied into the cream so the box does not show.
Five files are reused from the repository as they were (the same bytes the check saw), listed
under `already_in_repo`. Every logo is drawn through `<img>`, never inlined.

`foot/`: the Destination Moncton-Dieppe and #ExploreNB marks, from destinationmonctondieppe.ca,
white lettering, on the navy foot of the Moncton cards only.

Hotels with no logo on the column (no official file, or only a white file that cannot read on
cream) start their line with the empty cream cell; each says why in `logo_missing`.

## The faces: `fids-current/fonts/playfair-display/`, `fids-current/fonts/montserrat/`

Playfair Display (names and headings) and Montserrat (everything else), Google Fonts builds
(Playfair Display v40, Montserrat v31), latin and latin-ext, variable weights. SIL Open Font
License 1.1, `OFL.txt` beside each. They are declared under names of their own (`HL Playfair
Display`, `HL Montserrat`) so the Accor stacks, which name Montserrat, are not affected. The
flight boards keep Bricolage Grotesque.

The two pages of a hub city (v24177) are set in AC Nord Display and AC Nord Text, the faces already bundled
with the boards (`fids-current/fonts/ac-nord/`, declared in `css/font.css`, on the approved list of
`tests/fonts-approved-only.test.js`); the lists' sheet declares no face of its own for them. The phone app does
not load `css/font.css`, and its list keeps the two faces above.

## Refreshing a list

Edit the city's checked file (`scripts/hotels/data/<code>.json`), keep every `verified` and
`source` field, run `node scripts/hotels/build-runtime.js` to make the slim copy the site serves,
run `npm run assets:build` if a logo was added, and run `tests/hotel-list-cards.test.js`, which
holds every hotel to the area rule, the season format and the shuttle rule, and the slim copy to
the checked file.

## Adding a city

A hub city (two pages, near the airport and downtown) is a city of `CITIES` that is also in `HUBS`, with a hub
block in its checked file; the steps, and the catalog check of its card hotels, are in `scripts/hotels/README.md`.

`node scripts/hotels/find-candidates.js <code>` (an on-demand helper, one Overpass query a city,
the raw answer cached under `scripts/hotels/work/`, which git ignores) writes a worksheet and a
skeleton of the checked file with every fact empty and every verified mark false. OpenStreetMap
only finds: every published fact is then copied from a named official page, never from an AI
model. The steps are in `scripts/hotels/README.md`.
