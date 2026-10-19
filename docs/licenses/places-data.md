# Places data: positions, regions, clocks and names

The map under the rows of the departures and arrivals boards ("Earth, Now",
`fids-current/js/fids-earth.js`) draws a route, a dot and a name for each
place on the page. Where those come from:

| Data | Where it is | Source | Licence |
| --- | --- | --- | --- |
| Airport positions (latitude, longitude) added in v24067 | `COORDS` (`fids-current/js/fids-core.js`), `AIRPORT_COORDS` (`fids-current/js/airport-coords.js`) | OurAirports, https://ourairports.com/data/ (`airports.csv`) | Public domain |
| Runway ends | `AIRPORT_RUNWAYS` (`fids-current/js/airport-runways.js`) | OurAirports (`runways.csv`) | Public domain |
| The US state or Canadian province of each code, and the list of Québec airports | `_ROW_REGION` (`fids-core.js`), `FR_FIRST` (`fids-current/js/board-strings.js`) | OurAirports (`airports.csv` `iso_region`, `regions.csv`) | Public domain |
| English city names added or corrected in v24067 | `CITY` (`fids-core.js`), mirrored in `fids-current/js/shared-names.js` | OurAirports: the `municipality`, without the county or region it adds after a comma and never the word Airport; where the municipality is a suburb, a district or a village, the city in the airport's own `name` (Rennes, Toulon, Jiaxing), or the city the airport serves when its name gives none (Palmerola: Tegucigalpa); for an island or island country one airport serves, the island's or country's name (Bonaire, Antigua, Dominica, St Kitts, Roatan, Faroe Islands, Mauritius, Jersey, Islay, Tiree, La Palma) | Public domain |
| French city names that differ from the English, added in v24067 | `CITY_FR` (`fids-core.js`) | Wikidata, the French label of the place the airport serves (https://www.wikidata.org/) | CC0 1.0 |
| Time zones | `ZONE_LIST`, `ZONE_ONE` (`fids-earth.js`) | The IANA tz database, https://www.iana.org/time-zones | Public domain |

OurAirports dedicates its data to the public domain and asks for no credit;
it is named here and in `scripts/earth/README.md` all the same. Nothing on the
boards contacts any of these sites: the values are copied into the tables by
hand and checked by `tests/earth-floor-places.test.js` and
`tests/earth-zones.test.js`.
