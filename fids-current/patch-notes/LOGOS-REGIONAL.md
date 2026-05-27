# Regional / Partner Operator Logos

Tracking sheet for the "Operated by [carrier]" badge on the gate display.
As you upload logos for the operators below, paste the IATA code + CDN
path in chat and I'll move the entry from "Missing" to "Wired" and add it
to `fids-core.js`.

## What I need per logo

- **IATA code** (e.g. `YV` for Mesa Airlines)
- **CDN path** (e.g. `/logos/airlines/us-regional/mesa-airlines.svg`)
- *Optional:* SVG/PNG, transparent background y/n

---

## ✅ Wired in engine

These have logo paths already referenced in `js/fids-core.js`. They will
show on the "Operated by" badge once the badge is implemented, **assuming
the file exists at the referenced path on your Cloudflare CDN**.

### US (American Eagle / Delta Connection / United Express / Alaska Horizon)

| IATA | ICAO | Carrier | Path in engine |
|---|---|---|---|
| MQ | ENY | Envoy Air | `/logos/airlines/us-regional/Envoy.png` |
| OH | JIA | PSA Airlines | `/logos/airlines/us-regional/psa-airlines.svg` |
| PT | PDT | Piedmont Airlines | `/logos/airlines/us-regional/piedmont.svg` |
| YX | RPA | Republic Airways | `/logos/airlines/us-regional/republic.svg` |
| OO | SKW | SkyWest Airlines | `/logos/airlines/us-regional/Skywest-Airlines-01.svg` |
| YV | ASH | Mesa Airlines | `/logos/airlines/us-regional/mesa-airlines.svg` *(white — dark bg only)* |
| 9E | EDV | Endeavor Air | `/logos/airlines/us-regional/endeavor-air.svg` |
| G7 | GJS | GoJet Airlines | `/logos/airlines/us-regional/gojet.png` |
| QX | QXE | Horizon Air | `/logos/airlines/us-regional/horizon-air.svg` |

### Canadian

| IATA | ICAO | Carrier | Path in engine |
|---|---|---|---|
| QK | JZA | Jazz Aviation (AC Express) | `/logos/airlines/canadian-regional/jazz.svg` *(+ wordmark-dark / wordmark-light variants)* |
| RV | ROU | Air Canada Rouge | `/logos/airlines/canadian/rouge.svg` *(+ rouge-icon.png, older rouge.png kept)* |
| — | — | Air Canada Express *(brand)* | `/logos/airlines/canadian-regional/aircanada-express.svg` — registered, not wired to any IATA code yet |
| MO | CAV | Calm Air | `/logos/airlines/canadian-regional/calmair.svg` |
| YP | PAG | Perimeter Aviation | `/logos/airlines/canadian-regional/Perimeter_Aviation_Logo.svg` |
| 3H | AIE | Air Inuit | `/logos/airlines/canadian-regional/airinuit.svg` |
| BQ | PSC | Pascan | `/logos/airlines/canadian-regional/pascan.svg` |
| 5T | — | Canadian North | `/logos/airlines/canadian-regional/canadian-north.svg` |
| 7F | — | First Air | `/logos/airlines/canadian-regional/firstair.svg` |
| 4N | — | Air North | `/logos/airlines/canadian-regional/airnorth.svg` |
| WR | WEN | WestJet Encore | `/logos/airlines/canadian/encore.png` |
| PB | PVL | PAL Airlines | `/logos/airlines/canadian-regional/PAL-Airlines.svg` *(+ wordmark-dark / wordmark-light / pal-square / pal-symbol / older Canada_Logo.png)* |
| PD | POE | Porter Airlines | `/logos/airlines/canadian/porter.svg` |
| F8 | FLE | Flair Airlines | `/logos/airlines/canadian/flair.svg` |
| TS | TSC | Air Transat | *(defined in carrier sections)* |

---

## ⏳ Missing — text fallback active

These don't have a logo path in the engine yet. The "Operated by" badge
will render "Operated by [Name]" as text only until you upload a file
and we wire it in.

### US

*All wired ✅*

### Canadian / Northern

*All wired ✅* — see the table above (moved to Wired section).

---

## Notes

- The engine maps ICAO codes to IATA automatically (e.g. `JZA → QK`), so
  AeroDataBox responses in either format work.
- For aircraft liveries on these regional operators: real-world they all
  wear the parent airline's standard livery (American Eagle / Delta
  Connection / United Express / Air Canada Express). Files live in the
  parent's `aircraft/AA/` etc. folder — see the planned livery remap.
