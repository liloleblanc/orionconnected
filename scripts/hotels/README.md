# The hotel lists: scripts

The cards and the phone app are described in `docs/licenses/hotel-list-cards.md`. This folder
holds the checked data (`data/<code>.json`, one file a city) and two scripts:

- `build-runtime.js` makes the slim copies the site serves (`fids-current/data/hotels/<code>.json`)
  from the checked files. `--check` only compares.
- `find-candidates.js` is a helper for adding a city. You run it by hand, one city at a time. It
  never runs on a timer or in the worker.

The cities that have a list are **one list**: `HotelListCard.CITIES` in
`fids-current/js/hotel-list-card.js`. The build step, the phone app and the tests all read that
list. The build step and `tests/hotel-list-cards.test.js` both fail when a checked file has no
entry in the list, or an entry has no checked file.

A city that is not in the list already has a way to find a hotel: its gates show one "Hotels in
{CITY}" card whose scan code opens a Google Maps and an Apple Maps search in the phone app
(v24176). Adding the city to the list replaces that card with its checked list, on the gates and
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
     browser, changed user agent or cache service).
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
