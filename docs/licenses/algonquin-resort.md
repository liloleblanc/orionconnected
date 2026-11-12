# The Algonquin Resort page (gate centre deck, v24148)

A whole page for The Algonquin Resort, St. Andrews by-the-Sea, New Brunswick, in the centre
deck of a gate screen: on a gate whose flight goes to Moncton (a stop there counts) and on every
gate at Moncton. Three views take turns: the resort today, a 1994 watercolour of it in a gilt
frame with three facts of its history, and a scan code for the resort's site. Guest information,
not an advertisement: no prices, no offer, no slogan.

Code: `fids-current/js/algonquin-card.js` (the page and its one data table, `ALGONQUIN_HOTEL`),
`fids-current/css/algonquin-card.css`, four hooks in `fids-current/js/fids-core.js`
(`AlgonquinCard` in the deck builder, the skip loop, the dwell and the preloader), seven words in
`fids-current/js/board-strings.js`. Test: `tests/algonquin-card.test.js`.

## The files

| File | What it is | Made from |
| --- | --- | --- |
| `fids-current/assets/hotels/algonquin/watercolour-1994.jpg` | The watercolour of the resort signed "P. Bresnen '94", as a card with its own title lettering under the painting (1600 x 1196). | A scan of the printed postcard the resort left in its rooms in the 1990s, cleaned, and titled "The Algonquin / St. Andrews by-the-Sea, NB" in lettering drawn after the resort's 1994 identity. Supplied finished for this page at 24361 x 18209 and reduced whole to 1600 wide: not cropped, not recoloured. |
| `fids-current/assets/hotels/algonquin/gilt-frame.png` | A gilt carved picture frame with a clear opening (1481 x 1137, opening 1264 x 928). | A stock vector frame (Vecteezy, Pro licence), supplied for this page at 2850 x 1425 with an opening about twice as wide as the card. Its backdrop and its baked shadow were left out, and two plain lengths of rail were taken out of each long side at places where the pattern matches (kept: x 243-666, 1113-1741 and 2188-2618 of the source). The corners, the centre flowers and the two short sides are as drawn; nothing is stretched. |
| `fids-current/assets/hotels/algonquin/resort-aerial.jpg` | The resort from the air (1200 x 800). | The resort's own publicity photograph, `https://algonquinresort.com/wp-content/uploads/Exterior-1.jpg`, saved 2026-11-11, as the file is. The view fills its width and trims top and bottom to fit; nothing is drawn over it. |
| `fids-current/fonts/libre-caslon-text/` | Libre Caslon Text Regular (latin, latin-ext), for the name, the headings and the credit. | Google Fonts build v5. SIL Open Font License 1.1, `OFL.txt` beside the files. |
| `fids-current/fonts/alegreya/` | Alegreya Italic 500 (latin, latin-ext), for everything else. | Google Fonts build v41. SIL Open Font License 1.1, `OFL.txt` beside the files. |

The Autograph Collection file in the foot is the one already in the site
(`fids-current/logos/hotels/marriott/autograph-collection.svg`), through an `img`, unaltered.

## The facts on the page

- Name, address, telephone and web address: as the resort writes them on algonquinresort.com
  (read 2026-11-11). 184 Adolphus Street, St. Andrews by-the-Sea, New Brunswick; 1-855-529-8693.
- 265 km by road from Moncton airport (two routers agree); about 2 h 30 min, the figure the
  resort publishes.
- Open since 1889; rebuilt in Tudor style after the fire of 1914; once a summer hotel, now open
  all year: the resort's own history page.
- The scan code holds `https://algonquinresort.com` and nothing else.

## Rights

- The watercolour is the work of Peter Bresnen (Peter Bresnen Studio, Halifax, by the back of a
  1990 menu of the hotel that carries another of his paintings). The page credits him by name
  with the year, beside the picture. No written permission is on file.
- The photograph, the name and the Autograph Collection mark are the resort's and Marriott's.
  The page shows them only to say where the resort is and how to reach it.
- The frame is licensed stock art. The two typefaces are open-licensed and credited on the
  credits page.
