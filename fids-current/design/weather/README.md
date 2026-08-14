# Weather card design source

`weather-cards-v3.svg` is the six-condition card sheet — full cards with a 7-day
outlook on top, board tiles underneath. It imports into Figma as editable layers.

`build-weather-cards.py` is the generator that produced it. It reads the extracted
icons, measures Inter with PIL so the degree symbol lands on real metrics rather than
guesswork, and emits the sheet.

Grid is 1920 wide on purpose — that is the shipping board width, so the column grid
here is the column grid there: margin 64, card 272, gutter 32, which comes to exactly
1920.

Notes on decisions baked into the sheet:

- Card colour carries the **weather**; the airline is an 8px accent edge taken from
  `AIRLINE_ACCENT` (fids-core.js:5004). Driving the whole card off the carrier was the
  alternative and was rejected — on a board with a dozen carriers the colour would stop
  meaning anything about the weather.
- The minus slot in the temperature is always reserved, so −2 and 12 start on the same
  pixel and nothing reflows between refreshes.
- Units come from `displayTemp()` behaviour: Orlando renders °F.
- Ink flips to navy automatically when a card's mean luminance goes above 0.50, which is
  what keeps the small text readable on the yellow and pale-cyan cards.

The icons it consumes live in `fids-current/logos/weather/orion/` — see the README there
for the licensing question that still needs answering.
