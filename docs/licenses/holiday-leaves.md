# Holiday leaves (Thanksgiving, Canada)

The maple leaves of the Thanksgiving holiday look ("A HOLIDAY LOOK: THANKSGIVING" in
`fids-current/css/display-overrides.css`, layers made and placed by `_fidsHolidayLayers` in
`fids-current/js/fids-core.js`). The public tree carries no text files, so this note
lives here; each SVG also names its source in a comment on its first line.

## The files

| File (`fids-current/logos/holiday/thanksgiving/`) | Leaf | Source | Used as |
| --- | --- | --- | --- |
| `maple-gold.svg` | gold maple | item 11215158 | the badge beside the board title on the silk banner; the gate band's main leaf; a fallen leaf on the banner (logo to clock) and on the baggage board; a resting leaf on Air Canada gates |
| `maple-amber.svg` | amber maple | item 11215158 | a fallen leaf on the banner (title to logo) and on the baggage board; a resting leaf on Air Canada gates |
| `maple-orange.svg` | orange maple | item 11215158 | a leaf resting on the gate ribbon |
| `maple-rust.svg` | rust maple | item 23481840 | a fallen leaf on the banner (title to logo) and on the baggage board; a leaf resting on the gate ribbon (not on Air Canada gates) |
| `maple-crimson.svg` | deep red maple | item 11215158 | a fallen leaf on the banner (logo to clock); a leaf resting on the gate ribbon (not on Air Canada gates) |
| `maple-bouquet.svg` | a small bouquet: two gold, two orange and one yellow maple leaf with two orange-brown swirls and one dark brown curl | item 11215158 | hung from the gate panel's bottom corner under the gate number, spilling over the top corner of the map like a corsage (`_tgBouquet`); no red leaf, so it is the same on every airline's colour |

No red or rust leaf is ever placed on an Air Canada family gate (AC, QK, RV, ZX, or a gate
showing Air Canada artwork), so nothing reads as a second Air Canada maple beside the
airline's own.

## Source and licence

- **Vecteezy item 11215158**, "autumnal leaves background" (a bouquet of maple leaves with
  swirls): `maple-gold.svg`, `maple-amber.svg`, `maple-orange.svg`, `maple-crimson.svg`,
  `maple-bouquet.svg`.
- **Vecteezy item 23481840**, "vector of fallen leaves in autumn with color" (seven maple
  leaves): `maple-rust.svg`, one of its six orange-red leaves (its dark leaf is not used).
- **Licence:** Vecteezy Pro licence held for this project.
- **Changes made:** single leaves cut out of each file as vector data only — each leaf's own
  paths and gradients, nothing else; gradient stops thinned (the colour never moves by more
  than about 1/255), coordinates rounded, and the canvas trimmed to the leaf. The rust leaf
  is drawn without the file's black offset shadow (a soft shadow is added by the page, as for
  the other leaves), and its outline and vein shapes are simplified to within 2.5 units of a
  690-unit leaf (under a third of a pixel at its largest size on a board) to keep the file
  small. No other change to shape or colour.
- **The bouquet** (`maple-bouquet.svg`) is a new, smaller arrangement of whole pieces of the
  same file: five of its leaves (no green and no red ones) and three of its swirls, each
  moved, turned and scaled as a whole into a 300 x 540 corner spray, with the rest of the file
  left out. Each piece keeps its own shapes and gradients; gradient stops are thinned (the
  colour never moves by more than 2/255) and outlines simplified to within 1 unit of the
  300-unit arrangement (about a quarter of a pixel on a 2560 x 1440 board).

Do not reuse these files outside this project without checking the licence terms.
