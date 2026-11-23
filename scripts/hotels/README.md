# The hotel lists: scripts

The cards and the phone app are described in `docs/licenses/hotel-list-cards.md`. This folder
holds the checked data (`data/<code>.json`, one file a city) and three scripts:

- `build-runtime.js` makes the slim copies the site serves (`fids-current/data/hotels/<code>.json`)
  from the checked files. `--check` only compares.
- `find-candidates.js` is a helper for adding a city. You run it by hand, one city at a time. It
  never runs on a timer or in the worker.
- `match-catalog.js` checks the card hotels of a hub city against the Accor catalog and prints what
  a person should check again. You run it by hand, one hub city at a time. It never runs on a timer,
  in the worker or on a board, and it writes nothing to `data/`.

The cities that have a list are **one list**: `HotelListCard.CITIES` in
`fids-current/js/hotel-list-card.js`. The build step, the phone app and the tests all read that
list. The build step and `tests/hotel-list-cards.test.js` both fail when a checked file has no
entry in the list, or an entry has no checked file.

A **hub city** (`HotelListCard.HUBS`, Toronto so far) is a city of the list too big for the area cards:
its gates show two pages, near the airport and downtown, each only when its area has at least three
hotels open (v24177). Its checked file has a `hub` block (the province, and the way to each area), its
hotels are in those two areas only, and its card hotels (`card: true`, with `card_id` and `card_brand`)
take the gold frame on the downtown or airport page. The build step and the tests fail on a hub city
without its hub block, on a hotel of a hub city outside the two areas, and on a hub block or a card
hotel in any other city.

A city that is not in the list already has a way to find a hotel: its gates show one "Hotels in
{CITY}" card whose scan code opens a Google Maps search (and, on an Apple device, an Apple Maps
one) in the phone app, the city named with its state or province and country (v24176). Adding the city to the list replaces that card with its checked list, on the gates and
in the app; nothing else changes.

## Adding a city

1. **Find candidates.**

   ```
   node scripts/hotels/find-candidates.js YHZ
   node scripts/hotels/find-candidates.js YHZ --refresh                 # ask OpenStreetMap again
   node scripts/hotels/find-candidates.js YYG --centre 46.2353,-63.1296 # a city with no DOWNTOWN_COORDS entry
   node scripts/hotels/find-candidates.js YHZ --include-flagged         # guest houses and apartments too
   ```

   The helper takes the airport point from `fids-current/js/airport-coords.js` and the centre
   from `DOWNTOWN_COORDS` in `fids-current/js/fids-core.js`. If the city has no centre there, pass
   `--centre` with a point whose source you can name, such as the city hall in OpenStreetMap.

   It sends one query to the public Overpass API, asking for every place to stay within 33 km
   (about 30 km plus the 10 % tolerance) of either point. The raw answer is cached, so a second run
   reads the cache and asks nothing; `--refresh` asks again. If the API answers 403, it stops and
   says "blocked, needs a person". It never tries another endpoint or route. If the API is busy,
   try again later.

   The helper writes four files under `scripts/hotels/work/` (git ignores this folder):
   - `<code>-overpass.json`: the raw answer
   - `<code>-overpass.query.txt`: the query that answer belongs to
   - `<code>-worksheet.csv`: one row per place, with its OpenStreetMap values, its distances
     and card, and empty columns for what you check
   - `<code>-skeleton.json`: a checked file in the schema of `data/yqm.json`

   How the helper sorts places:
   - Hotels are candidates.
   - Guest houses and apartments are flagged. They go in the skeleton's `excluded` list, or in
     its hotels (held back) with `--include-flagged`.
   - Motels, hostels, hotels with no name and hotels out of range go in `excluded`, each with the
     reason the checked files use.
   - Duplicates (a node and a way of one hotel, for example) are merged into one place.
   - Distances and the card come from the cards' own rule (`HotelListCard.areaOf`). The rules
     text is copied from `yqm.json`.
   - The brand and its group come from the OpenStreetMap brand tag, or (less reliably) from the
     start of the name.
   - The helper never makes a resort. Destination resorts beyond 30 km are picked by a person,
     with the drive from the airport.

   OpenStreetMap data is © OpenStreetMap contributors, ODbL 1.0. The helper prints this credit
   every time it runs. Anything kept from it, such as a position or a distance, carries the credit
   "© OpenStreetMap contributors" wherever it is shown.

2. **Check every fact on a named official page.** OpenStreetMap only finds hotels. Its names,
   addresses, telephones and websites are candidates, not facts: in Moncton only 2 of 28 hotels
   had all four right. The skeleton leaves every fact empty, marks every one `verified: false`,
   and holds every hotel back (`listed: false`). What OpenStreetMap says is kept in
   `osm_candidate`.

   For each hotel, copy each fact (name, street address, telephone, website, season, shuttle) from
   one of these official sources:
   - the hotel's own page
   - its brand property page
   - the airport's own page
   - the official city or provincial tourism site

   For each fact, record the page in `verified.<field>.source` and the date you read it in
   `checked`, then set `verified: true`.

   Rules for checking:
   - **An AI model is never the source** of a hotel, an address or a telephone. A model may only
     compare texts you fetched yourself.
   - If a page answers 403, a robot block or a captcha, write "blocked, needs a person" in the
     note and leave the field unverified. Never read the page another way (no proxy, headless
     browser, changed user agent or cache service). A page that answered 403 once stays blocked: a
     later read of it that gets through is not counted.
   - **Chain hotels: blocked, needs a person.** The big chains' property pages refuse automated
     readers (Marriott, Hilton, IHG, Choice and Hyatt answered 403 for Toronto on 2026-11-22, and so
     did the airport's own site, torontopearson.com). A hotel that rests on such a page alone goes in
     `excluded` with `kind: "blocked"` and, in `read`, the exact page a person should open. That person
     reads the page in a browser, copies each fact with the page and the date into the hotel's
     `verified` fields, moves the hotel from `excluded` into `hotels` with `listed: true`, and runs the
     build step. Nothing reads those pages for them. Each fact a person read keeps `method: "read by a
     person in a browser, <date>"`, and the line they copied from the page as its `quote` where there
     is one. A shuttle named only on a tourism listing is still not marked, whoever read it.
   - Do not use Google Places, Tripadvisor, Booking or Expedia: their terms forbid storing or
     caching what they show.
   - If a fact cannot be confirmed on an official page, leave it unverified. If two official
     pages disagree on the name, street or telephone, keep the hotel in `hotels` but held back
     (`listed: false`, the disagreement in `not_listed_reason`): a person settles it. If the hotel
     cannot be confirmed at all (no official page has it, or every page is blocked), move it out
     of `hotels` into `excluded` with the reason: an entry in `hotels`, listed or not, needs its
     name, street, town, telephone and season filled from a page (the tests hold every entry to
     that). Never guess.
   - Add a logo only if the file comes from the chain's or the hotel's own official site.
     Otherwise show the name alone and say why in `logo_missing`.
   - Set `shuttle.mark` to true only where the hotel's or the airport's own page says there is a
     shuttle. Quote that page in `evidence`.
   - Fill in the city fields: `city`, `province`, `built`, and `foot_marks` (only the official
     tourism marks).

3. **Add it to the data.** Move the filled file to `scripts/hotels/data/<code>.json`. Delete the
   skeleton line from `unverified`, and delete the `osm_candidate` of each hotel. Set
   `listed: true` only on the hotels whose facts are checked.

4. **Add the city to the one list.** Add the code to `HotelListCard.CITIES` in
   `fids-current/js/hotel-list-card.js`. The build step refuses a data file whose city is not in
   that list, so this comes first.

5. **Make the slim copy.** Run `node scripts/hotels/build-runtime.js`. If you added a logo, also
   run `npm run assets:build`. Bump the version (every change under `fids-current/` needs one).
   Then run `node --test tests/hotel-list-cards.test.js tests/hotel-candidates.test.js`.

## A hub city

A city with dozens of hotels near its airport and in its centre (Toronto) is added as above, then:

1. **Only the two areas.** Keep the hotels of `airport` and `downtown` (the cards' own rule: about 5 km
   of the airport, about 2 km of the centre, 10 % tolerance); every nearby hotel goes in `excluded`
   with kind `nearby_not_checked` and the reason "Hub city: the hotel pages show the airport and
   downtown only; not checked."
2. **The hub block**, after `points`: `region` (the province) and, for each of `airport` and
   `downtown`, `transit` with its `kind` (`link`, the airport's own free train: "Free {LINE} train"; or
   `ride`: "{LINE} to {STOP}", "{MIN} min · every {EVERY} min"), its `icon` (a mark of
   `HotelListCard.ICON`, `train`), the `line` (and for a ride its `stop`, `min`, `every`), each fact
   read on the operator's own page and quoted in `evidence`, with `verified`, `source` and `checked`.
   The line and its stop are data: they are never written into the store. A way there whose operator's
   page cannot be read (blocked, needs a person), or that serves only some of the area's hotels, stays
   with `verified: false` and the reason in its `note`: the build step leaves it out of the slim copy,
   and the page shows no way there (Toronto's Link train, near the airport).
   A train that reaches only some of the area's hotels goes on those hotels instead, as their `access`
   (v24178): `kind` `link` with its `stop` (data, as written) or `terminal` with the number of the
   terminal the hotel is joined to; `line` and `from` (the line, and the terminal it is taken from) for
   the legend of the page; `verified`, `source`, `checked` and the words read in `quote` (a person's
   reading in a browser keeps `method`). It is read on the hotel's own page or its brand property page,
   claims no fare and no hours, and takes the place of the shuttle mark and the street on the hotel's
   line. Held (`verified: false`, the reason in its `note`), it is left out of the slim copy. Only a hub
   city has it. The build step refuses a verified line for the whole area on the same line as the
   access of its hotels: the page would say one train twice. The phone app's list shows the same note
   under the hotel's address, with the legend under the heading.
3. **Card hotels.** A hotel that takes the gold frame has `card: true`, `card_id` (its id in the
   catalog, as on its all.accor.com page) and `card_brand` (the catalog's brand code), a logo from the
   repository or an official source (listed in `fids-current/logos/hotels/list/sources.json`), and its
   street and telephone verified on its brand property page. Field names never carry a brand of their
   own (the module of the cards must not name one).
4. **Add the code to `HotelListCard.HUBS`** as well as `CITIES`, then make the slim copy.
5. **Check the card hotels against the catalog**, by hand, whenever the list is refreshed:

   ```
   node scripts/hotels/match-catalog.js YYZ           # a report to read
   node scripts/hotels/match-catalog.js YYZ --json    # the same, as JSON
   node scripts/hotels/match-catalog.js YYZ --save    # also keep the answers in work/ (not in git)
   node scripts/hotels/match-catalog.js YYZ --from scripts/hotels/work/yyz-catalog.json
   ```

   It asks the catalog through the board's proxy once from the airport and once from the centre
   (`range=0-49&sort=distance`, the radius the area's limit rounded up), keeps the OPEN rows within
   each area (by the distance the catalog returns and by the cards' own rule on the row's position),
   and prints: the card hotels the catalog no longer lists (gone, or not OPEN); the catalog's hotels in
   the two areas that the file lacks as card hotels, with the entry of the file a name points to; and
   for each card hotel found, the differences of brand, name, street (only a street with a figure in
   it) and telephone (the digits of the catalog's prefix and number, `41/63678900` read as
   `(416) 367-8900`). It writes nothing to `data/`: settle each difference on the hotel's own page and
   record it with its source and date. A 403 or a block page stops it: blocked, needs a person.
