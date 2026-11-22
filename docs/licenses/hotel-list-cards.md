# The hotel lists (gate centre deck, and the full list in the phone app)

Free guest information by area for the city a gate's flight goes to, when that city has a
checked list (Moncton YQM, Charlottetown YYG and Halifax YHZ so far). One slot of the centre deck shows the
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
page, the skip loop, the dwell, the preloader), the list view in `fids-current/app.html`, eight
words in `fids-current/js/board-strings.js` (nine languages each), and a credits line for the two faces. Test: `tests/hotel-list-cards.test.js`.
Review link: `gids.html?ap=<any>&gate=<n>&hotellist=YYG&scene=hotellist` shows a city's cards on any gate.

## The data: `scripts/hotels/data/<code>.json` (Moncton `yqm.json`, Charlottetown `yyg.json`, Halifax `yhz.json`)

One checked file a city (Moncton and Charlottetown checked on 2026-11-16, Halifax on 2026-11-21),
kept out of the site. The cities are one list,
`HotelListCard.CITIES` in `fids-current/js/hotel-list-card.js`: the build step, the phone app and
the tests read it, and fail on a checked file whose city is not in it. The site serves a slim
copy of each, `fids-current/data/hotels/<code>.json` (about 10 KB instead of about 120 KB, since
every gate with a flight to the city fetches it): only the hotels that are listed, and only the
fields the cards and the phone app read (id, name, area, address line, telephone, website,
season, shuttle mark, drive, logo; the marks of the foot). `node scripts/hotels/build-runtime.js`
makes the slim copies from the checked files (`--check` only compares), and
`tests/hotel-list-cards.test.js` holds the two to agree: the same bytes, the same hotels on the
same cards on every day of a year, the same card markup.

In the checked file every hotel keeps, field by field, where it was read and whether it was
verified (`verified.<field>.verified`, `.source`, `.checked`); the shuttle and the
season keep their own source and evidence. `listed: false` holds a hotel back (the reason is
given); `excluded` lists the places left out (motels, hostels, apartment suites, places that have
closed or could not be confirmed) with the reason for each.

Sources: the hotels' own sites and brand property pages; Destination Moncton-Dieppe listings;
the Greater Moncton airport's hotels and transport pages (cyqm.ca); Tourism PEI listings (with
dates of operation); Charlottetown Airport's ground-transportation page (flyyyg.com); for Halifax,
the Discover Halifax and Tourism Nova Scotia listings (the map points come from the listings
and the hotels' own pages) and Halifax Stanfield's Visiting Halifax page (halifaxstanfield.ca); Halifax's civic address register
(HRM open data, Civic Addresses) to settle a street the listings disagree on;
OpenStreetMap (positions in Moncton and Charlottetown, ODbL, "© OpenStreetMap contributors"); the OSRM public router on
OpenStreetMap roads for the drive distances to the resorts. A search index was used only for
some brand-hotel postal codes, which are marked `verified: false` (postal codes are not shown).

Areas, by straight-line distance from two points of the city: downtown within about 2 km of the
centre, airport within about 5 km of the airport, nearby the rest within about 30 km of either
(each "about" with 10 % tolerance; downtown is tested first, which matters in Charlottetown where
the core is only 5-6 km from the terminal); a destination resort past 30 km goes on the Resorts
card with its drive distance. Moncton's points are the board's own (`DOWNTOWN_COORDS.YQM` and
`airport-coords.js`). Charlottetown's are the terminal and City Hall from OpenStreetMap: YYG has no
`DOWNTOWN_COORDS` entry, and none was added, so the Accor search for Charlottetown is unchanged.

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

## Refreshing a list

Edit the city's checked file (`scripts/hotels/data/<code>.json`), keep every `verified` and
`source` field, run `node scripts/hotels/build-runtime.js` to make the slim copy the site serves,
run `npm run assets:build` if a logo was added, and run `tests/hotel-list-cards.test.js`, which
holds every hotel to the area rule, the season format and the shuttle rule, and the slim copy to
the checked file.

## Adding a city

`node scripts/hotels/find-candidates.js <code>` (an on-demand helper, one Overpass query a city,
the raw answer cached under `scripts/hotels/work/`, which git ignores) writes a worksheet and a
skeleton of the checked file with every fact empty and every verified mark false. OpenStreetMap
only finds: every published fact is then copied from a named official page, never from an AI
model. The steps are in `scripts/hotels/README.md`.
