# Moncton's aerial photo (GeoNB)

The gate maps at Moncton draw New Brunswick's own aerial photo of the
airfield under the aircraft: GeoNB's Imagery Basemap (2021), published under
the [Open Government Licence – New Brunswick](https://www.gnb.ca/en/campaign/geonb/open-government-license.html).
The licence allows commercial use and asks for its credit line wherever the
photo shows; the board draws it in the map's corner (`fids-core.js`
`_gatePhotoCredit`, string `mapCreditOglNb`).

The photo was taken on a day with 23 aircraft parked on the field. A parked
aircraft on our map would claim to be a flight, so each is painted out
before the photo is cut into tiles. Rule: no evidence, no aircraft.

## Rebuild

```sh
python3 fetch.py grid.json chunks                    # ~12 export requests
swift mosaic.swift stitch chunks grid.json mosaic.png
swiftc -O inpaint.swift -o inpaint
./inpaint mosaic.png fixes-yqm.json clean.png review # before/after crops in review/
swift mosaic.swift tiles clean.png grid.json tiles 14
```

Then upload `tiles/<z>/<x>/<y>.(jpg|png)` to the `fids-assets` bucket as
`maptiles/geonb-yqm/<z>/<x>/<y>` (no extension, content type set per file).
The worker serves them at `/tiles/photo/YQM/<z>/<x>/<y>` (`photoTile`).

## The fixes file

Mosaic pixel coordinates, top-left origin. Each fix is one aircraft:

* `poly` — its outline (a circle is fine for a light aircraft).
* `tight` — inside the outline, take only the aircraft itself (white paint,
  dark shadow, red trim), never the apron or lawn round it. This keeps the
  fill from eating into grass when an aircraft is parked at the apron edge.
* `offset` — clone mode: copy the patch this far away (the jet at the gate
  is filled from the empty stand beside it), blended over `feather` pixels.
* Otherwise the hole is filled patch by patch from its own surroundings
  (exemplar inpainting), never borrowing from another aircraft's hole.

Look at every before/after crop in `review/` at 4× before shipping.
